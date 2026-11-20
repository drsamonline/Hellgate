// ---------------------------------------------------------------------------
// MUSIC — generated, not loaded.
//
// No audio files, no samples: a scale, a tempo and a rule for which note comes
// next. The scene picks the mode (menu, explore, combat, boss) and the tension
// the game already computes decides how busy it gets. Everything is scheduled
// from the game loop, so it stops when the tab does and there is no timer to
// leak.
// ---------------------------------------------------------------------------

// A minor pentatonic, two octaves. Any note in it sounds like it belongs, which
// is why generative music uses one: there is no wrong answer to pick.
const SCALE = [55, 65.41, 73.42, 82.41, 98, 110, 130.81, 146.83, 164.81, 196, 220, 261.63];

const SCENES = {
  menu: { bpm: 68, density: 0.35, drums: 0, arp: 0.5, root: 0 },
  explore: { bpm: 82, density: 0.5, drums: 0.25, arp: 0.65, root: 0 },
  combat: { bpm: 132, density: 0.8, drums: 1, arp: 1, root: 2 },
  boss: { bpm: 150, density: 1, drums: 1.2, arp: 1.15, root: 4 },
};

/** How many seconds of music to keep scheduled ahead of the playhead. */
const LOOKAHEAD = 0.25;

/**
 * Generated music: a scene picks the tempo and mode, the game's tension decides
 * how busy it plays. Everything is scheduled from the game loop.
 */
export class Music {
  constructor(audio) {
    this.audio = audio;
    this.scene = 'menu';
    this.intensity = 0.3;
    this.playing = false;
    this.step = 0;        // 16th notes since start
    this.nextTime = 0;    // when the next step is due
    this.bus = null;
  }

  get ctx() { return this.audio && this.audio.ctx; }

  setScene(name) {
    if (!SCENES[name] || name === this.scene) return;
    this.scene = name;
  }

  setIntensity(v) {
    this.intensity = Math.max(0, Math.min(1, v));
  }

  start() {
    if (!this.ctx || this.playing) return;
    const ctx = this.ctx;
    if (!this.bus) {
      this.bus = ctx.createGain();
      this.bus.gain.value = 0.5;
      this.bus.connect(this.audio.master || ctx.destination);
    }
    this.playing = true;
    this.step = 0;
    this.nextTime = ctx.currentTime + 0.08;
  }

  stop() {
    this.playing = false;
  }

  /** One note, with a shape rather than a click. */
  voice(freq, time, dur, gain, type = 'triangle') {
    const ctx = this.ctx;
    if (!ctx) return;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(0, time);
    g.gain.linearRampToValueAtTime(gain, time + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    o.connect(g).connect(this.bus);
    o.start(time);
    o.stop(time + dur + 0.02);
  }

  /** A kick: a sine that falls fast. */
  kick(time, gain = 0.5) {
    const ctx = this.ctx;
    if (!ctx) return;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(120, time);
    o.frequency.exponentialRampToValueAtTime(42, time + 0.11);
    g.gain.setValueAtTime(gain, time);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 0.22);
    o.connect(g).connect(this.bus);
    o.start(time);
    o.stop(time + 0.24);
  }

  /** A hat: filtered noise, very short. */
  hat(time, gain = 0.12) {
    const ctx = this.ctx;
    const buf = this.audio.noiseBuf;
    if (!ctx || !buf) return;
    const s = ctx.createBufferSource();
    s.buffer = buf;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 7000;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, time);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 0.05);
    s.connect(hp).connect(g).connect(this.bus);
    s.start(time, Math.random() * 0.2, 0.06);
  }

  /** Schedule every step due within the lookahead window. Called each frame. */
  update() {
    const ctx = this.ctx;
    if (!ctx || !this.playing) return;
    const cfg = SCENES[this.scene] || SCENES.explore;
    const spb = 60 / cfg.bpm;
    const stepDur = spb / 4; // sixteenths

    // a tab left in the background for an hour should not queue an hour of notes
    if (this.nextTime < ctx.currentTime - 0.5) this.nextTime = ctx.currentTime + 0.05;

    while (this.nextTime < ctx.currentTime + LOOKAHEAD) {
      const t = this.nextTime;
      const s = this.step % 16;
      const bar = Math.floor(this.step / 16);
      const busy = cfg.density * (0.55 + this.intensity * 0.75);

      // bass: the root on the first beat of every bar, the fifth halfway
      if (s === 0 || s === 8) {
        const root = SCALE[(cfg.root + (s === 8 ? 3 : 0)) % SCALE.length] / 2;
        this.voice(root, t, spb * 0.9, 0.16, 'sine');
      }

      // arpeggio: walk the scale, skip notes as intensity falls
      if (Math.random() < busy * cfg.arp) {
        const idx = (bar * 3 + s * 2 + Math.floor(Math.random() * 3)) % SCALE.length;
        const freq = SCALE[idx] * (this.intensity > 0.7 && Math.random() < 0.3 ? 2 : 1);
        this.voice(freq, t, stepDur * 1.6, 0.05 + this.intensity * 0.04, 'triangle');
      }

      // drums
      if (cfg.drums > 0) {
        if (s === 0 || s === 6 || s === 10) this.kick(t, 0.3 * cfg.drums);
        if (s % 2 === 1 && Math.random() < 0.5 * this.intensity) this.hat(t, 0.08 * cfg.drums);
      }

      this.step++;
      this.nextTime += stepDur;
    }
  }
}
