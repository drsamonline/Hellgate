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
    const { pan, gain } = panGain(at, this.listener);
    if (gain <= 0.03) return null;
    const p = this.ctx.createStereoPanner();
    p.pan.value = pan;
    const g = this.ctx.createGain();
    g.gain.value = gain * gain; // squared: falls off faster than linearly
    p.connect(g);
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

  noise(dur, gain, type, f0, f1) {
    if (!this.ctx) return;
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

  play(name, at) {
    if (!this.ctx || this.muted) return;
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
      case 'enemyShoot':
        this.tone(620, 0.18, 'square', 0.12, 240);
        break;
      case 'fireball':
        this.noise(0.3, 0.3, 'bandpass', 900, 400);
        this.tone(300, 0.25, 'triangle', 0.1, 500);
        break;
      case 'pickup':
        this.tone(660, 0.09, 'square', 0.12, 880);
        this.tone(990, 0.1, 'square', 0.1, 1320, 0.07);
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
