// ---------------------------------------------------------------------------
// AUDIO — everything synthesised with WebAudio. No samples, no files.
// ---------------------------------------------------------------------------

// Pure so it can be tested without an AudioContext. Returns the stereo pan and
// the distance gain for a sound at `at`, heard from `listener` (x, z, yaw).
// Adopted from castle-valley's audio: a creature is heard from where it stands,
// quieter with distance, to the left or the right.
/**
 * Stereo pan and distance gain for a sound at `at`, heard from `listener`. Pure, so it can be tested without an AudioContext.
 */
export function panGain(at, listener, range = 26) {
  const dx = at.x - listener.x;
  const dz = at.z - listener.z;
  const dist = Math.hypot(dx, dz);
  const gain = Math.max(0, 1 - dist / range);
  const fx = -Math.sin(listener.yaw);
  const fz = -Math.cos(listener.yaw);
  const pan = Math.max(-1, Math.min(1, (fx * dz - fz * dx) / Math.max(4, dist)));
  return { pan, gain, dist };
}

/**
 * The synthesiser. Every sound in the game is built here from oscillators and noise buffers.
 */
export class Sfx {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.noiseBuf = null;
    this.muted = false;
    this.volume = 0.32;
    this.listener = { x: 0, z: 0, yaw: 0 };
    this._out = null;
    this._pitch = 1;
  }

  setListener(x, z, yaw) {
    this.listener.x = x;
    this.listener.z = z;
    this.listener.yaw = yaw;
  }

  // a panner + distance gain for one sound, or null when it is out of earshot
  spatialOut(at) {
    // callers pass `{ gain: 0.7 }` when they mean an option, not a position;
    // panGain would turn that into NaN and the sound would never be heard
    if (!at || typeof at.x !== 'number' || typeof at.z !== 'number') return this.master;
    const { pan, gain } = panGain(at, this.listener);
    if (gain <= 0.03) return null;
    const p = this.ctx.createStereoPanner();
    p.pan.value = pan;
    const g = this.ctx.createGain();
    g.gain.value = gain * gain; // squared: falls off faster than linearly

    // Sound occlusion: something behind a wall is quieter and duller, not just
    // quieter. `occludeTest` is installed by main.js and answers with line of
    // sight; without it every sound is direct.
    if (this.occludeTest && !this.occludeTest(at.x, at.z)) {
      const lp = this.ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 640;
      g.gain.value *= 0.45;
      p.connect(lp);
      lp.connect(g);
    } else {
      p.connect(g);
    }
    g.connect(this.master);
    return p;
  }

  setVolume(v) {
    this.volume = Math.min(1, Math.max(0, v));
    if (this.master) this.master.gain.value = this.muted ? 0 : this.volume;
  }

  setMuted(m) {
    this.muted = !!m;
    if (this.master) this.master.gain.value = this.muted ? 0 : this.volume;
  }

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : this.volume;
    this.master.connect(this.ctx.destination);

    const len = Math.floor(this.ctx.sampleRate * 0.6);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noiseBuf = buf;
  }

  get t() {
    return this.ctx ? this.ctx.currentTime : 0;
  }

  /** A raw looping noise buffer, for a case that builds its own filter chain. */
  noiseSource() {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    return src;
  }

  noise(dur = 0.12, gain = 0.1, type, f0, f1) {
    if (!this.ctx) return;
    // a case that calls this with no arguments must not put NaN into an AudioParam
    if (!Number.isFinite(dur) || !Number.isFinite(gain)) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const filt = this.ctx.createBiquadFilter();
    filt.type = type || 'lowpass';
    filt.frequency.setValueAtTime(f0 || 1200, this.t);
    if (f1) filt.frequency.exponentialRampToValueAtTime(Math.max(40, f1), this.t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, this.t);
    g.gain.exponentialRampToValueAtTime(0.0008, this.t + dur);
    src.connect(filt).connect(g).connect(this._out || this.master);
    src.start();
    src.stop(this.t + dur + 0.02);
  }

  tone(freq, dur, type, gain, freqTo, delay = 0) {
    if (!this.ctx) return;
    freq *= this._pitch;
    const t0 = this.t + delay;
    const o = this.ctx.createOscillator();
    o.type = type || 'square';
    o.frequency.setValueAtTime(freq, t0);
    if (freqTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, freqTo), t0 + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0008, t0 + dur);
    o.connect(g).connect(this._out || this.master);
    o.start(t0);
    o.stop(t0 + dur + 0.02);
  }

  // A low, slowly breathing pad so silence is not dead air. Three detuned
  // oscillators under a lowpass, gain under 0.03: present, never noticed.
  startDrone() {
    if (!this.ctx || this.drone) return;
    const ctx = this.ctx;
    const out = ctx.createGain();
    out.gain.value = 0;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 320;
    const oscs = [];
    for (const [freq, detune] of [[55, -7], [55.4, 6], [82.5, 3]]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = freq;
      o.detune.value = detune;
      o.connect(lp);
      o.start();
      oscs.push(o);
    }
    lp.connect(out).connect(this.master);
    out.gain.linearRampToValueAtTime(0.028, ctx.currentTime + 2.5);

    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.frequency.value = 0.07;
    lfoGain.gain.value = 0.012;
    lfo.connect(lfoGain).connect(out.gain);
    lfo.start();

    this.drone = { oscs, lfo, out, lp, tension: 0 };
    this.tension = 0;
  }

  /**
   * How much trouble the player is in, 0..1. The pad opens up and gets louder as
   * the room fills, so the mix says what the HUD says without reading it.
   */
  setTension(t) {
    const v = Math.max(0, Math.min(1, t));
    this.tension = v;
    const d = this.drone;
    if (!d || !this.ctx) return;
    const now = this.ctx.currentTime;
    d.lp.frequency.cancelScheduledValues(now);
    d.lp.frequency.setTargetAtTime(300 + v * 780, now, 0.6);
    d.out.gain.cancelScheduledValues(now);
    d.out.gain.setTargetAtTime(0.026 + v * 0.032, now, 0.8);
  }

  stopDrone() {
    const d = this.drone;
    if (!d || !this.ctx) return;
    const t = this.ctx.currentTime;
    d.out.gain.cancelScheduledValues(t);
    d.out.gain.setValueAtTime(d.out.gain.value, t);
    d.out.gain.linearRampToValueAtTime(0, t + 0.8);
    for (const o of d.oscs) { try { o.stop(t + 0.9); } catch (e) { /* already stopped */ } }
    try { d.lfo.stop(t + 0.9); } catch (e) { /* already stopped */ }
    this.drone = null;
  }

  play(name, at, opts = {}) {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx;   // the switch cases build nodes directly
    this._pitch = 0.94 + Math.random() * 0.12; // no two plays are identical
    if (at) {
      const out = this.spatialOut(at);
      if (!out) return;
      this._out = out;
    }
    switch (name) {
      case 'pistol':
        this.noise(0.09, 0.5, 'highpass', 900, 300);
        this.tone(320, 0.07, 'square', 0.12, 90);
        break;
      case 'chaingun': {
        const t = ctx.currentTime;
        const src = this.noiseSource();
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = 1500;
        bp.Q.value = 0.9;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.12, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
        src.connect(bp).connect(g).connect(this._out || this.master);
        src.start(t);
        src.stop(t + 0.08);
        break;
      }
      case 'shotgun':
        this.noise(0.3, 0.75, 'lowpass', 2400, 260);
        this.tone(140, 0.16, 'sawtooth', 0.16, 50);
        break;
      case 'rocket':
        this.noise(0.45, 0.5, 'bandpass', 500, 2200);
        this.tone(90, 0.3, 'sawtooth', 0.14, 60);
        break;
      case 'boom':
        this.noise(0.7, 0.85, 'lowpass', 900, 90);
        this.tone(80, 0.5, 'sine', 0.3, 34);
        break;
      case 'hit':
        this.tone(1100, 0.05, 'square', 0.09, 700);
        break;
      case 'wall':
        this.noise(0.06, 0.18, 'highpass', 1800, 900);
        break;
      case 'hurt':
        this.tone(220, 0.22, 'sawtooth', 0.22, 110);
        this.noise(0.18, 0.25, 'bandpass', 700, 300);
        break;
      case 'pain':
        this.tone(420, 0.16, 'sawtooth', 0.16, 180);
        break;
      case 'enemyDie':
        this.tone(260, 0.5, 'sawtooth', 0.2, 60);
        this.noise(0.4, 0.25, 'lowpass', 900, 200);
        break;
      case 'spot': {
        // a bark on sight: a short growl, pitched per enemy type
        const t = ctx.currentTime;
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        const base = opts && opts.pitch ? 120 * opts.pitch : 120;
        o.frequency.setValueAtTime(base, t);
        o.frequency.exponentialRampToValueAtTime(base * 1.6, t + 0.18);
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 900;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(0.13, t + 0.03);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.32);
        o.connect(lp).connect(g).connect(this._out || this.master);
        o.start(t);
        o.stop(t + 0.34);
        break;
      }
      case 'enemyShoot':
        this.tone(620, 0.18, 'square', 0.12, 240);
        break;
      case 'fireball':
        this.noise(0.3, 0.3, 'bandpass', 900, 400);
        this.tone(300, 0.25, 'triangle', 0.1, 500);
        break;
      case 'step': {
        // a short filtered thud; the player's own feet, not an event
        const t = ctx.currentTime;
        const src = this.noiseSource();
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = 260 + Math.random() * 90;
        bp.Q.value = 1.2;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.09 * (opts && opts.gain ? opts.gain : 1), t + 0.008);
        g.gain.exponentialRampToValueAtTime(0.0008, t + 0.11);
        src.connect(bp).connect(g).connect(this.master);
        src.start(t);
        src.stop(t + 0.14);
        break;
      }
      case 'pickup':
        this.tone(660, 0.09, 'square', 0.12, 880);
        this.tone(990, 0.1, 'square', 0.1, 1320, 0.07);
        break;
      case 'heart':
        // a soft sub thump, twice, so it reads as a heartbeat and not a hit
        this.tone(52, 0.11, 'sine', 0.2, 40);
        this.tone(48, 0.13, 'sine', 0.15, 36, 0.16);
        break;
      case 'key':
        this.tone(880, 0.1, 'sine', 0.14, 1320);
        this.tone(1320, 0.16, 'sine', 0.12, 1760, 0.09);
        break;
      case 'door':
        this.noise(0.9, 0.4, 'bandpass', 300, 700);
        this.tone(70, 0.8, 'sawtooth', 0.1, 120);
        break;
      case 'empty':
        this.tone(180, 0.04, 'square', 0.07, 120);
        break;
      case 'switch':
        this.tone(520, 0.05, 'square', 0.08, 640);
        break;
      case 'wave':
        this.tone(330, 0.16, 'square', 0.14, 330);
        this.tone(494, 0.18, 'square', 0.14, 494, 0.14);
        this.tone(660, 0.3, 'square', 0.14, 660, 0.28);
        break;
      case 'dead':
        this.tone(300, 0.9, 'sawtooth', 0.24, 40);
        this.noise(1.1, 0.3, 'lowpass', 700, 60);
        break;
    }
    this._out = null;
  }
}
