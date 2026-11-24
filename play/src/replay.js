// ---------------------------------------------------------------------------
// REPLAY — a run you can hand to someone.
//
// A bug report is a sentence; a replay is the run. This records the input
// stream and the seed, and plays it back through the same `update()`. It only
// works because the simulation's randomness comes from `simrng.js`, seeded from
// the run's seed: same seed, same inputs, same run, every time.
//
// The frame is small on purpose — a keys bitmask, the fire flag and the two look
// deltas — so a four-minute run is a few kilobytes of text.
// ---------------------------------------------------------------------------

/** The keys a replay carries. Anything else is a menu action, not a frame. */
export const REPLAY_KEYS = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft', 'Space'];

/** Fixed step the recorder and the player both use, so a replay does not depend
 * on how fast the machine that recorded it was. */
export const STEP = 1 / 60;

/**
 * A stable hash of everything that decides what happens next.
 *
 * Positions are rounded to a centimetre: floating-point noise below that is not
 * a difference in the run, and comparing raw floats makes a replay fail for a
 * reason nobody can see.
 * @param {object} game The game state.
 * @param {object} player The player.
 * @param {object} enemies The enemy manager.
 * @returns {string} A hex hash.
 */
export function stateHash(game, player, enemies) {
  const n = (v, d = 2) => (Number.isFinite(v) ? v.toFixed(d) : 'x');
  const parts = [
    game.score | 0, game.kills | 0, game.wave | 0, game.exitOpen ? 1 : 0,
    n(player.pos.x), n(player.pos.y), n(player.pos.z), n(player.health), n(player.armor),
    n(player.yaw, 3), n(player.pitch, 3),
    player.ammo.bullets | 0, player.ammo.shells | 0, player.ammo.rockets | 0,
    game.relics.length, game.coins | 0,
  ];
  for (const e of enemies.list) {
    parts.push(e.type, e.alive ? 1 : 0, n(e.pos.x), n(e.pos.z), n(e.hp, 1));
  }
  const s = parts.join('|');
  // FNV-1a over the string: short, stable, and enough to compare two runs
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/**
 * Records one run: the meta that makes it replayable, and the frames.
 */
export class Recorder {
  constructor(meta = {}) {
    this.meta = { ...meta };
    this.frames = [];
  }

  /**
   * Take one frame of input.
   * @param {object} input The live input state.
   */
  frame(input) {
    let mask = 0;
    for (let i = 0; i < REPLAY_KEYS.length; i++) {
      if (input.keys && input.keys[REPLAY_KEYS[i]]) mask |= 1 << i;
    }
    this.frames.push({
      k: mask,
      f: input.fire ? 1 : 0,
      x: Math.round((input.lookDx || 0) * 1000),
      y: Math.round((input.lookDy || 0) * 1000),
    });
    // the live look deltas are consumed by the game; a recorder that also zeroes
    // them would be recording a different run from the one being played
  }

  /**
   * The replay as a string, ready for a file or a clipboard.
   * @returns {string} JSON.
   */
  toJSON() {
    return JSON.stringify({ v: 1, step: STEP, meta: this.meta, frames: this.frames });
  }
}

/**
 * Plays a recorded run back, one frame at a time.
 */
export class Player {
  /**
   * @param {string|object} data The string `Recorder.toJSON()` produced, or the object.
   */
  constructor(data) {
    const r = typeof data === 'string' ? JSON.parse(data) : data;
    this.meta = (r && r.meta) || {};
    this.frames = (r && r.frames) || [];
    this.i = 0;
  }

  /** Frames left to play. */
  get remaining() {
    return Math.max(0, this.frames.length - this.i);
  }

  /**
   * The next frame, written into the live input object.
   * @param {object} input The game's input state.
   * @returns {boolean} False when the replay is finished.
   */
  apply(input) {
    const f = this.frames[this.i++];
    if (!f) return false;
    input.keys = input.keys || {};
    for (let i = 0; i < REPLAY_KEYS.length; i++) {
      input.keys[REPLAY_KEYS[i]] = (f.k & (1 << i)) !== 0;
    }
    input.fire = !!f.f;
    input.lookDx = (f.x || 0) / 1000;
    input.lookDy = (f.y || 0) / 1000;
    return true;
  }
}
