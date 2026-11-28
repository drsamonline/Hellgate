// ---------------------------------------------------------------------------
// STORY — the intro. A camera flythrough over the generated arena with four
// typed panels, in the manner of an RPG cold open. No video, no assets: the
// level it flies over is the one you are about to play.
// ---------------------------------------------------------------------------

import * as THREE from 'three';
import { buildCameraPath, sampleCameraPath } from './campath.js?v=2.84.0';
import { CELL } from './level.js?v=2.84.0';

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
  ashfall: {
    panels: [
      { text: 'Above the gate the sky is a colour nobody named.', hold: 3.2 },
      { text: 'It is not rain coming down. It has been falling since the gate opened.', hold: 3.6 },
      { text: 'Nothing here is buried. Everything is on the surface.', hold: 3.2 },
    ],
    epilogue: 'The ash settles behind you. It will not settle for long.',
  },
  cistern: {
    panels: [
      { text: 'The water is waist deep and it is not water.', hold: 3.4 },
      { text: 'Something has been living in it long enough to get big.', hold: 3.4 },
      { text: 'Your boots are the loudest thing down here.', hold: 3.0 },
    ],
    epilogue: 'The cistern drains. Whatever was in it had already left.',
  },
  kiln: {
    panels: [
      { text: 'The kiln is still burning. Nobody has fed it in seven hundred years.', hold: 3.4 },
      { text: 'Everything they made here was made to be closed.', hold: 3.4 },
      { text: 'The throne is one room further in.', hold: 2.8 },
    ],
    epilogue: 'The fire goes out. The last door is warm.',
  },
  spine: {
    panels: [
      { text: 'The spine runs under every room you have crossed.', hold: 3.4 },
      { text: 'The walls here are closer than the plans say they should be.', hold: 3.4 },
      { text: 'Something has been widening it. Not for you.', hold: 3.0 },
    ],
    epilogue: 'The corridor opens. The kiln is a room away and the heat comes through the floor.',
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

    // The flythrough used to be a straight chord between the three biggest
    // rooms and the exit, which is a camera through walls: a chord between two
    // room centres crosses whatever is between them. It follows the level's own
    // walkable path now, the same flow field the enemies use, so it cannot.
    const rooms = level.rooms
      .slice()
      .sort((a, b) => b.w * b.h - a.w * a.h)
      .slice(0, 3);
    const pts = rooms.map((r) => new THREE.Vector3(r.cx * CELL, 2.4, r.cz * CELL));
    pts.push(new THREE.Vector3(level.exit.x, 2.2, level.exit.z));
    this.path = pts;
    this.camPath = null;
    if (rooms.length) {
      // the doors are shut during the intro; the camera flies the level as it
      // will be, not as it is in the half-second before a wave
      const wasOpen = level.doorOpen;
      level.doorOpen = true;
      const from = { x: rooms[0].cx * CELL, z: rooms[0].cz * CELL };
      this.camPath = buildCameraPath(level, from, { x: level.exit.x, z: level.exit.z }, { eye: 2.2 });
      level.doorOpen = wasOpen;
    }

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

    // camera: along the walkable path when there is one, and the old chord when
    // there is not (a level with no route from the first room to the exit)
    const u = Math.min(1, this.t / this.duration);
    if (this.camPath) {
      const d = u * this.camPath.length;
      const p = sampleCameraPath(this.camPath, d);
      this.camera.position.set(p.x, p.y + Math.sin(this.t * 0.7) * 0.2, p.z);
      const ahead = sampleCameraPath(this.camPath, Math.min(this.camPath.length, d + 3));
      this.camera.lookAt(new THREE.Vector3(ahead.x, ahead.y - 1.1, ahead.z));
    } else {
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
    }

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
