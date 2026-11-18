// ---------------------------------------------------------------------------
// STORY — the intro. A camera flythrough over the generated arena with four
// typed panels, in the manner of an RPG cold open. No video, no assets: the
// level it flies over is the one you are about to play.
// ---------------------------------------------------------------------------

import * as THREE from 'three';
import { CELL } from './level.js';

const PANELS = [
  { text: 'The gate was sealed for a reason. Nobody wrote down which.', hold: 3.4 },
  { text: 'Seven hundred years of silence, and then the ground opened.', hold: 3.4 },
  { text: 'Everything that crawls in there used to be someone.', hold: 3.2 },
  { text: 'You have a gun, a class, and one way out: through.', hold: 3.6 },
];

const TYPE_CPS = 34; // characters per second

export class Story {
  constructor() {
    this.el = document.getElementById('storyText');
    this.root = document.getElementById('intro');
    this.t = 0;
    this.panel = 0;
    this.done = false;
    this.path = [];
    this.look = [];
    this.onDone = null;
    this.camera = null;
  }

  start(camera, level, onDone) {
    this.camera = camera;
    this.onDone = onDone;
    this.t = 0;
    this.panel = 0;
    this.done = false;

    // a slow arc through the biggest rooms, ending above the exit
    const rooms = level.rooms
      .slice()
      .sort((a, b) => b.w * b.h - a.w * a.h)
      .slice(0, 3);
    const pts = rooms.map((r) => new THREE.Vector3(r.cx * CELL, 2.4, r.cz * CELL));
    pts.push(new THREE.Vector3(level.exit.x, 2.2, level.exit.z));
    this.path = pts;

    const total = PANELS.reduce((a, p) => a + p.hold, 0);
    this.total = total;
    this.render();
  }

  get duration() {
    return this.total || 1;
  }

  update(dt, level) {
    if (this.done || !this.camera || !this.path.length) return;
    this.t += dt;

    // camera: walk the polyline, looking one segment ahead
    const u = Math.min(1, this.t / this.duration);
    const segs = this.path.length - 1;
    const f = u * segs;
    const i = Math.min(segs - 1, Math.floor(f));
    const k = f - i;
    const a = this.path[i];
    const b = this.path[i + 1];
    const pos = a.clone().lerp(b, k);
    pos.y = 2.2 + Math.sin(this.t * 0.7) * 0.25;
    this.camera.position.copy(pos);
    const look = b.clone();
    look.y = 1.1;
    this.camera.lookAt(look);

    // panels
    let acc = 0;
    let idx = 0;
    for (let p = 0; p < PANELS.length; p++) {
      if (this.t >= acc) idx = p;
      acc += PANELS[p].hold;
    }
    if (idx !== this.panel) {
      this.panel = idx;
      this.render();
    }
    this.renderTypewriter();

    if (this.t >= this.duration) this.finish();
  }

  render() {
    if (this.el) this.el.textContent = '';
  }

  renderTypewriter() {
    const p = PANELS[this.panel];
    if (!p || !this.el) return;
    let local = this.t;
    for (let i = 0; i < this.panel; i++) local -= PANELS[i].hold;
    const chars = Math.max(0, Math.min(p.text.length, Math.floor(local * TYPE_CPS)));
    const shown = p.text.slice(0, chars);
    if (this.el.textContent !== shown) this.el.textContent = shown;
  }

  skip() {
    if (!this.done) this.finish();
  }

  finish() {
    this.done = true;
    if (this.onDone) this.onDone();
  }
}

export const STORY_PANELS = PANELS;
