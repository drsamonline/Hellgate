// ---------------------------------------------------------------------------
// CINEMATIC — the boss walks in.
//
// A three-second cut: the letterbox closes, the camera orbits the thing that
// just arrived, its name types out, and control comes back. Skippable on any
// key, any click and any tap, because a cutscene you cannot skip is a hostage
// situation.
// ---------------------------------------------------------------------------

import * as THREE from 'three';

const HOLD = 2.6;      // seconds before it starts closing
const OUT = 0.45;      // seconds of letterbox sliding away

/** The letterboxed boss entrance: orbit, name, then hand control back. */
export class Cinematic {
  constructor(camera, els) {
    this.camera = camera;
    this.root = els.root;      // the letterbox container
    this.nameEl = els.name;
    this.lineEl = els.line;
    this.t = 0;
    this.playing = false;
    this.target = null;
    this.onDone = null;
    this.savedPos = new THREE.Vector3();
    this.savedLook = new THREE.Vector3();
    this.orbit = 0;
  }

  /** Play the intro for an enemy: orbit it, name it, hand control back. */
  play(enemy, title, line, onDone) {
    if (!enemy) { if (onDone) onDone(); return; }
    this.target = enemy;
    this.onDone = onDone;
    this.t = 0;
    this.orbit = 0;
    this.playing = true;
    this.duration = HOLD + OUT;

    if (this.nameEl) this.nameEl.textContent = title || '';
    if (this.lineEl) this.lineEl.textContent = line || '';
    if (this.root) this.root.classList.add('on');
  }

  skip() {
    if (!this.playing) return;
    this.playing = false;
    if (this.root) this.root.classList.remove('on');
    if (this.onDone) {
      const fn = this.onDone;
      this.onDone = null;
      fn();
    }
  }

  update(dt) {
    if (!this.playing || !this.target) return;
    this.t += dt;
    const e = this.target;
    const p = e.pos;

    // a slow arc from the front-left to the front-right, at chest height
    this.orbit += dt * 0.55;
    const radius = 5.2 + Math.sin(this.t * 0.7) * 0.5;
    const a = -0.9 + Math.min(1.8, this.t * 0.55);
    const cam = this.camera;
    cam.position.set(
      p.x + Math.sin(a) * radius,
      p.y + e.height * 0.72 + Math.sin(this.t * 0.9) * 0.1,
      p.z + Math.cos(a) * radius
    );
    cam.lookAt(p.x, p.y + e.height * 0.55, p.z);

    // the letterbox opens on the way out
    if (this.root) {
      const k = Math.min(1, this.t / 0.35);
      const out = this.t > HOLD ? 1 - (this.t - HOLD) / OUT : 1;
      this.root.style.setProperty('--bar', (28 * k * out).toFixed(1) + '%');
      this.root.style.opacity = String(Math.min(1, k) * Math.max(0, out));
    }

    if (this.t >= this.duration) this.skip();
  }
}
