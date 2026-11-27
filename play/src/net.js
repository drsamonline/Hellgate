// ---------------------------------------------------------------------------
// NET — two players, one tick.
//
// Co-op needs three things: a way to agree on the starting state, a way to
// exchange input, and a way to know the two machines are still in the same
// world. 2.11.0 made a run reproducible from its inputs alone — `simrng.js` for
// the simulation's randomness, `replay.js` for the input stream and a state hash
// — so the third thing is measurable and the first is a seed.
//
// This is the middle one, and it is transport-agnostic on purpose: a
// `BroadcastChannel` for two tabs today, a data channel for two machines later.
// It is lockstep: a frame is played when both players' input for it is in hand,
// so neither machine can run ahead of the other and neither has to trust the
// other's physics.
//
// It is not co-op yet. It is the part co-op cannot be built without.
// ---------------------------------------------------------------------------

/** How far ahead of the confirmed frame a local input may be buffered. */
export const LOOKAHEAD = 12;

/** One input: which keys are down, where the mouse is looking, and whether the
 * trigger is held. */
export function makeInput(keys = {}, look = null, fire = false) {
  return { keys: { ...keys }, look: look ? { x: look.x, y: look.y } : null, fire: !!fire };
}

/**
 * A lockstep session.
 *
 * `tick()` returns the two inputs for the next frame, or null when the peer has
 * not sent yet — the caller skips the frame rather than guessing, because a
 * guess is a desync.
 */
export class Session {
  /**
   * @param {object} opts
   * @param {number} [opts.player] 0 or 1: which body is this machine's. The
   *   inputs come back in player order, not local-first, or the two machines
   *   would disagree about who is player one.
   * @param {number} [opts.frames] How many frames a session is expected to run.
   * @param {(msg: object) => void} [opts.send] Transport: how to reach the peer.
   */
  constructor(opts = {}) {
    this.player = opts.player === 1 ? 1 : 0;
    this.frame = 0;
    this.frames = opts.frames || 0;
    this.send = opts.send || null;
    this.local = new Map();     // frame -> input
    this.remote = new Map();    // frame -> input
    this.pending = null;        // the local input not yet sent
    this.starved = 0;           // frames we could not play for want of the peer
    this.hashes = [];           // [frame, hash] pairs for the desync check
    this.desyncAt = -1;
  }

  /**
   * Record the local input for a frame.
   *
   * Bounded by LOOKAHEAD: with no peer ever answering, `tick()` never consumes a
   * frame, and an unbounded map grew by one entry per frame for as long as the
   * session ran — 36,000 entries in ten minutes at 60 fps.
   * @returns {boolean} False when the frame is too far ahead to buffer.
   */
  put(frame, input) {
    if (Number.isFinite(frame) && frame > this.frame + LOOKAHEAD) return false;
    this.local.set(frame, input);
    this.pending = { frame, input };
    return true;
  }

  /** Accept the peer's input for a frame. */
  receive(msg) {
    if (!msg || !Number.isFinite(msg.frame)) return false;
    this.remote.set(msg.frame, msg.input || makeInput());
    return true;
  }

  /** Send whatever local input is waiting, if a transport is attached. */
  flush() {
    if (!this.pending || !this.send) return false;
    this.send({ frame: this.pending.frame, input: this.pending.input });
    this.pending = null;
    return true;
  }

  /** True when both sides' input for this frame is in hand. */
  ready(frame = this.frame) {
    return this.local.has(frame) && this.remote.has(frame);
  }

  /**
   * The inputs for the next frame, in a fixed order — local first, so both
   * machines agree which body is whose — or null when the peer is behind.
   * @returns {{frame:number, inputs:object[]}|null}
   */
  tick() {
    if (!this.ready()) { this.starved++; return null; }
    const f = this.frame;
    // player order, not local order: both machines must number the bodies the
    // same way or they are simulating two different fights
    const mine = this.local.get(f);
    const theirs = this.remote.get(f);
    const out = {
      frame: f,
      inputs: this.player === 0 ? [mine, theirs] : [theirs, mine],
    };
    this.local.delete(f);
    this.remote.delete(f);
    this.frame = f + 1;
    return out;
  }

  /**
   * Record a state hash for the frame just played, and compare it with the
   * peer's when both are in. A desync is a fact, not a suspicion.
   */
  hash(frame, hash) {
    this.hashes.push({ frame, hash, mine: true });
    return this;
  }

  /** The peer's hash for a frame. */
  receiveHash(msg) {
    if (!msg || !Number.isFinite(msg.frame) || typeof msg.hash !== 'string') return false;
    const mine = this.hashes.find((h) => h.frame === msg.frame && h.mine);
    if (mine && mine.hash !== msg.hash && this.desyncAt < 0) this.desyncAt = msg.frame;
    return true;
  }

  /** How many frames were played, and whether the two machines still agree. */
  stats() {
    return {
      frame: this.frame,
      starved: this.starved,
      desyncAt: this.desyncAt,
      inSync: this.desyncAt < 0,
    };
  }
}

/**
 * Two tabs on one machine, for testing the shape of co-op without a server.
 * @param {string} name
 * @returns {{send: Function, close: Function, onmessage: Function|null}}
 */
export function broadcastTransport(name = 'hellgate-coop') {
  const channel = globalThis.BroadcastChannel ? new globalThis.BroadcastChannel(name) : null;
  const t = {
    onmessage: null,
    send(msg) { if (channel) channel.postMessage(msg); },
    close() { if (channel) channel.close(); },
  };
  if (channel) {
    channel.onmessage = (e) => { if (t.onmessage) t.onmessage(e.data); };
  }
  return t;
}
