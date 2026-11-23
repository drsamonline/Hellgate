// ---------------------------------------------------------------------------
// CINEMATIC — the boss walks in.
//
// A three-second cut: the letterbox closes, the camera moves to the thing that
// just arrived, its name types out, and control comes back. Skippable on any
// key, any click and any tap, because a cutscene you cannot skip is a hostage
// situation.
//
// Two camera modes. `play()` orbits its subject on a fixed arc, which is what
// 1.x shipped and which can put the camera inside a wall. `playWalk()` moves
// along a path from `campath.js` — the same flow field the enemies use, so the
// camera travels walkable ground and follows the floor.
// ---------------------------------------------------------------------------

import * as THREE from 'three';
import { sampleCameraPath } from './campath.js';

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
    this.mode = 'orbit';
    this.path = null;
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

  /**
   * Walk the camera along a real path and look at a point. The path comes from
   * `buildCameraPath()`, so every metre of it is floor the player could stand on.
   * @param {object} path From `buildCameraPath`.
   * @param {object} opts `title`, `line`, `lookAt` ({x,y,z}), `speed` (m/s), `onDone`.
   * @returns {boolean} True when the walk started.
   */
  playWalk(path, opts = {}) {
    if (!path || !path.points || path.points.length < 2) {
      if (opts.onDone) opts.onDone();
      return false;
    }
    this.mode = 'walk';
    this.path = path;
    this.lookAt = opts.lookAt || null;
    // a cutscene has a budget: a 27-second walk to the far side of the map is
    // not a cut, it is a hostage situation. The speed rises for a long path.
    const maxTime = opts.maxTime != null ? opts.maxTime : 4.5;
    this.speed = Math.max(opts.speed || 3.4, path.length / maxTime);
    this.hold = opts.hold != null ? opts.hold : 0.5;
    this.dist = 0;
    this.t = 0;
    this.target = null;
    this.onDone = opts.onDone || null;
    this.playing = true;
    // the cut is as long as the walk plus the hold at the end
    this.duration = path.length / this.speed + this.hold + OUT;

    if (this.nameEl) this.nameEl.textContent = opts.title || '';
    if (this.lineEl) this.lineEl.textContent = opts.line || '';
    if (this.root) this.root.classList.add('on');
    this.placeOnPath();
    return true;
  }

  // one frame of the walk: position from the path, look at the subject
  placeOnPath() {
    const cam = this.camera;
    const p = sampleCameraPath(this.path, this.dist);
    cam.position.set(p.x, p.y, p.z);
    if (this.lookAt) {
      cam.lookAt(this.lookAt.x, this.lookAt.y, this.lookAt.z);
      return;
    }
    // no subject: look where the walk is going, never backwards
    const ahead = sampleCameraPath(this.path, Math.min(this.path.length, this.dist + 2.5));
    if (ahead.x !== p.x || ahead.z !== p.z) cam.lookAt(ahead.x, ahead.y, ahead.z);
  }

  /**
   * Abandon the cut without running its callback: a level change cancels a
   * cutscene, it does not complete it. Without this the previous level's outro
   * fired into the next level and showed a panel over a run that had started.
   */
  stop() {
    this.playing = false;
    this.onDone = null;
    this.target = null;
    this.path = null;
    if (this.root) {
      this.root.classList.remove('on');
      this.root.style.opacity = '';
      this.root.style.removeProperty('--bar');
    }
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
    if (!this.playing) return;
    if (this.mode === 'walk') {
      this.t += dt;
      const walkT = this.path.length / this.speed;
      if (this.dist < this.path.length) {
        this.dist = Math.min(this.path.length, this.dist + this.speed * dt);
        this.placeOnPath();
      }
      this.bars(walkT + this.hold);
      if (this.t >= this.duration) this.skip();
      return;
    }
    if (!this.target) return;
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

    this.bars(HOLD);
    if (this.t >= this.duration) this.skip();
  }

  // The letterbox: in over the first third of a second, out over the last OUT.
  bars(holdUntil) {
    if (!this.root) return;
    const k = Math.min(1, this.t / 0.35);
    const out = this.t > holdUntil ? 1 - (this.t - holdUntil) / OUT : 1;
    this.root.style.setProperty('--bar', (28 * k * out).toFixed(1) + '%');
    this.root.style.opacity = String(Math.min(1, k) * Math.max(0, out));
  }
}
