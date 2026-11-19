// ---------------------------------------------------------------------------
// STORY — the intro. A camera flythrough over the generated arena with four
// typed panels, in the manner of an RPG cold open. No video, no assets: the
// level it flies over is the one you are about to play.
// ---------------------------------------------------------------------------

import * as THREE from 'three';
import { CELL } from './level.js';

// One cold open per zone, so five levels read as five places and not one arena
// reskinned. A zone without its own panels falls back to the shared ones.
const PANELS = [
  { text: 'The gate was sealed for a reason. Nobody wrote down which.', hold: 3.4 },
  { text: 'Seven hundred years of silence, and then the ground opened.', hold: 3.4 },
  { text: 'Everything that crawls in there used to be someone.', hold: 3.2 },
  { text: 'You have a gun, a class, and one way out: through.', hold: 3.6 },
];

/** The cold open for each zone, and the line that closes it. */
export const ZONE_STORY = {
  gate: {
    panels: PANELS,
    epilogue: 'The gate holds. Something on the other side noticed.',
  },
  foundry: {
    panels: [
      { text: 'The foundry never stopped. The belt still runs, and nothing is on it.', hold: 3.2 },
      { text: 'Whatever they were casting here, they cast a great deal of it.', hold: 3.4 },
      { text: 'The heat is the only thing in this place that is still alive.', hold: 3.2 },
    ],
    epilogue: 'The furnaces go out behind you, one by one.',
  },
  grove: {
    panels: [
      { text: 'Roots came through the ceiling. They are still growing.', hold: 3.2 },
      { text: 'The grove was planted to keep the gate shut. It has been doing its job.', hold: 3.6 },
      { text: 'Something down here has been eating the roots.', hold: 3.2 },
    ],
    epilogue: 'The grove is quiet. That is not the same as empty.',
  },
  spire: {
    panels: [
      { text: 'The spire is the only part of the gate you can see from outside.', hold: 3.4 },
      { text: 'Everyone who reached the top came back down. Nobody came back up.', hold: 3.4 },
      { text: 'You are going up.', hold: 2.6 },
    ],
    epilogue: 'From the spire the whole complex is visible. All of it is wrong.',
  },
  throne: {
    panels: [
      { text: 'The last room. The warden has been waiting since before the gate was built.', hold: 3.6 },
      { text: 'It does not guard the exit. It guards the thing the exit is for.', hold: 3.6 },
      { text: 'You have come this far. Come further.', hold: 2.8 },
    ],
    epilogue: 'The warden falls. The gate is yours, and it is still a gate.',
  },
};

/** The panels for a zone, or the shared set. */
export function panelsFor(zoneId) {
  return (ZONE_STORY[zoneId] && ZONE_STORY[zoneId].panels) || PANELS;
}

/** The line shown when a zone is cleared. */
export function epilogueFor(zoneId) {
  return (ZONE_STORY[zoneId] && ZONE_STORY[zoneId].epilogue) || 'The room is quiet.';
}

const TYPE_CPS = 34; // characters per second

/**
 * The cold open: typed panels over a camera flythrough of the generated level.
 */
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

  start(camera, level, onDone, zoneId) {
    this.camera = camera;
    this.onDone = onDone;
    this.panels = panelsFor(zoneId);
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

    const total = this.panels.reduce((a, p) => a + p.hold, 0);
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
    for (let p = 0; p < this.panels.length; p++) {
      if (this.t >= acc) idx = p;
      acc += this.panels[p].hold;
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
    const p = this.panels[this.panel];
    if (!p || !this.el) return;
    let local = this.t;
    for (let i = 0; i < this.panel; i++) local -= this.panels[i].hold;
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

/**
 * The four panels, in order.
 */
