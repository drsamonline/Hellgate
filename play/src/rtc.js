// ---------------------------------------------------------------------------
// RTC — two machines, no server.
//
// `net.js` needs a wire. `BroadcastChannel` is a wire for two tabs on one
// machine; this is the wire for two machines, and it is deliberately built with
// no signalling server: one side makes an offer, a string comes out, a person
// pastes it to the other side, an answer comes back, and the same in reverse.
// That is worse than a lobby and it works today, with nothing to host, which is
// the only kind of infrastructure this project has.
//
// The string is base64 JSON with a version, so a stale or edited paste is
// refused instead of half-accepted.
// ---------------------------------------------------------------------------

/** The version of the signal format. A paste from another build is refused. */
export const SIGNAL_VERSION = 1;

/** What the connection is for, so a stray channel cannot join a run. */
export const SIGNAL_APP = 'hellgate';

/** A signalling message as a string somebody can paste. */
export function encodeSignal(kind, sdp) {
  const payload = { v: SIGNAL_VERSION, app: SIGNAL_APP, kind, sdp: String(sdp || '') };
  let json = '';
  try { json = JSON.stringify(payload); } catch (e) { return ''; }
  try { return globalThis.btoa(json); } catch (e) { return ''; }
}

/**
 * A signalling message from a pasted string, or null.
 * @param {string} text
 * @returns {{kind: string, sdp: string}|null}
 */
export function decodeSignal(text) {
  const clean = String(text || '').trim().replace(/\s+/g, '');
  if (!clean) return null;
  let json = '';
  try { json = globalThis.atob(clean); } catch (e) { return null; }
  let msg = null;
  try { msg = JSON.parse(json); } catch (e) { return null; }
  if (!msg || msg.v !== SIGNAL_VERSION || msg.app !== SIGNAL_APP) return null;
  if (msg.kind !== 'offer' && msg.kind !== 'answer') return null;
  if (typeof msg.sdp !== 'string' || !msg.sdp) return null;
  return { kind: msg.kind, sdp: msg.sdp };
}

/**
 * One end of a peer connection, with the same shape as `broadcastTransport()`:
 * `send`, `onmessage`, `close`.
 *
 * The handshake is two pastes. `offer()` gives a string for the other machine;
 * `accept(text)` on the other side gives a string back; `finish(text)` here.
 * @param {{ RTCPeerConnection?: Function, iceServers?: object[] }} [opts]
 */
export function rtcTransport(opts = {}) {
  const PC = opts.RTCPeerConnection || globalThis.RTCPeerConnection;
  const t = { onmessage: null, onopen: null, onclose: null, ready: false, channel: null, pc: null };
  if (!PC) {
    // no WebRTC here: the transport is inert rather than throwing, so the game
    // can ask for one and carry on
    t.send = () => false;
    t.close = () => {};
    t.offer = () => '';
    t.accept = () => '';
    t.finish = () => false;
    return t;
  }

  const pc = new PC({ iceServers: opts.iceServers || [{ urls: 'stun:stun.l.google.com:19302' }] });
  t.pc = pc;

  const attach = (channel) => {
    t.channel = channel;
    // a channel can arrive already open — `ondatachannel` may fire after the
    // handshake — and waiting for an onopen that has been and gone never ends
    t.ready = channel.readyState === 'open';
    channel.onopen = () => { t.ready = true; if (t.onopen) t.onopen(); };
    channel.onclose = () => { t.ready = false; if (t.onclose) t.onclose(); };
    channel.onmessage = (e) => { if (t.onmessage) t.onmessage(e.data); };
  };

  pc.ondatachannel = (e) => attach(e.channel);

  t.send = (msg) => {
    if (!t.channel || !t.ready) return false;
    try { t.channel.send(msg); return true; } catch (e) { return false; }
  };
  t.close = () => {
    try { if (t.channel) t.channel.close(); } catch (e) { /* already gone */ }
    try { pc.close(); } catch (e) { /* already gone */ }
    t.ready = false;
  };

  /** The offering side: make the channel and the string to send. */
  t.offer = async () => {
    attach(pc.createDataChannel('hellgate'));
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    return encodeSignal('offer', pc.localDescription.sdp);
  };

  /** The answering side: take an offer, give back an answer string. */
  t.accept = async (text) => {
    const msg = decodeSignal(text);
    if (!msg || msg.kind !== 'offer') return '';
    await pc.setRemoteDescription({ type: 'offer', sdp: msg.sdp });
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    return encodeSignal('answer', pc.localDescription.sdp);
  };

  /** The offering side: take the answer and finish the handshake. */
  t.finish = async (text) => {
    const msg = decodeSignal(text);
    if (!msg || msg.kind !== 'answer') return false;
    await pc.setRemoteDescription({ type: 'answer', sdp: msg.sdp });
    return true;
  };

  return t;
}
