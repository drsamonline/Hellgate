// ---------------------------------------------------------------------------
// LORE — the terminals. Three per zone, stuck to a wall, readable once with V.
// They are the closest thing this game has to an NPC: someone was here before
// you, and they left a note. Reading one pays a little score the first time.
// ---------------------------------------------------------------------------

import * as THREE from 'three';
import { makeRng } from './rng.js';
import { CELL, floorHeightAt } from './level.js';

/**
 * The notes left on the wall terminals.
 */
export const TERMINALS = [
  {
    title: 'MAINTENANCE 04',
    lines: [
      'Seal integrity nominal. Nothing on the other side has tried the door in nine days.',
      'Whoever reads this: the keycard is yellow. Everything else in here is red on purpose.',
    ],
  },
  {
    title: 'SHIFT LOG',
    lines: [
      'We stopped counting the waves. The counting was the thing that broke us, not the waves.',
      'If you are reading this with a gun in your hand, you are already doing better than we did.',
    ],
  },
  {
    title: 'DOCTRINE',
    lines: [
      'An imp telegraphs. A grunt closes. A hound does neither, which is why the hound is the one that kills you.',
      'Watch the hands, not the eyes.',
    ],
  },
  {
    title: 'LAST ENTRY',
    lines: [
      'The gate does not open outward. It was never a door for us.',
      'We built the arena so something would have to come through it. I am sorry it was you.',
    ],
  },
  {
    title: 'THE OFFER',
    lines: [
      'A handshake protocol is still running. It has been waiting for someone with a pulse to accept.',
      'The terms are not hidden. Twenty of your health, and the relic behind the panel is yours.',
    ],
    choice: {
      prompt: 'Accept the handshake?',
      options: [
        { id: 'take', label: 'Take the deal — 20 health for a relic', effect: 'relic' },
        { id: 'refuse', label: 'Refuse — walk away with 150', effect: 'score' },
      ],
    },
  },
  {
    title: 'ARMOURY NOTE',
    lines: [
      'Rockets do not care how many of them there are. That is the whole lesson.',
      'Do not fire one at your own feet. I know. I know.',
    ],
  },
  {
    title: 'A NAME SCRATCHED OUT',
    lines: [
      'Someone wrote a name here, then took it back with a knife. The blade is still on the desk.',
      'Underneath, in different ink: it got in through the maintenance shaft. Do not open the shaft.',
    ],
    choice: {
      prompt: 'Open the maintenance shaft?',
      options: [
        { id: 'open', label: 'Open it — something is in there', effect: 'ambush' },
        { id: 'leave', label: 'Leave it shut', effect: 'safe' },
      ],
    },
  },
  {
    title: 'UNFILED',
    lines: [
      'The relics are not valuable. They are proof that the thing below us was here first.',
      'Collect them anyway. Proof is the only weapon that survives the room.',
    ],
  },
];

/**
 * Places the readable terminals in a level and answers what is in reach.
 */
export class Lore {
  constructor(scene, level, zone) {
    this.scene = scene;
    this.level = level;
    this.group = new THREE.Group();
    this.entries = [];
    this.read = new Set();
    this.near = null;
    this.rng = makeRng(level.seed + ':lore');

    const rooms = level.rooms.filter((r, i) => i !== level.exitRoom);
    const pool = rooms.length ? rooms : level.rooms;
    const count = Math.min(3, pool.length);

    // one terminal in every level asks a question: the mechanic should never be
    // something a player can miss by luck of the draw
    // Drawn without replacement, by title and by room. Two terminals with the
    // same title were one terminal as far as `read` was concerned — the second
    // paid nothing and showed as already read — and two in the same room sat on
    // top of each other, with only the nearer one reachable. About half of all
    // levels drew a duplicate title.
    const withChoice = TERMINALS.filter((t) => t.choice);
    const sequence = [];
    const usedTitles = new Set();
    const first = withChoice[(this.rng.next() * withChoice.length) | 0];
    if (first) { sequence.push(first); usedTitles.add(first.title); }
    const spare = TERMINALS.filter((t) => !usedTitles.has(t.title));
    while (sequence.length < count && spare.length) {
      const i = (this.rng.next() * spare.length) | 0;
      sequence.push(spare.splice(i, 1)[0]);
    }
    const roomsLeft = pool.slice();

    for (let i = 0; i < count; i++) {
      const room = roomsLeft.length
        ? roomsLeft.splice((this.rng.next() * roomsLeft.length) | 0, 1)[0]
        : pool[i % pool.length];
      const entry = sequence[i] || TERMINALS[0];
      const x = room.cx * CELL + (this.rng.next() - 0.5) * 2;
      const z = room.cz * CELL + (this.rng.next() - 0.5) * 2;
      const y = floorHeightAt(level, x, z);

      const g = new THREE.Group();
      const post = new THREE.Mesh(
        new THREE.BoxGeometry(0.16, 1.0, 0.16),
        new THREE.MeshLambertMaterial({ color: 0x2a2a30 })
      );
      post.position.y = 0.5;
      const screen = new THREE.Mesh(
        new THREE.BoxGeometry(0.62, 0.42, 0.06),
        new THREE.MeshBasicMaterial({ color: 0x39ff9a })
      );
      screen.position.set(0, 1.06, 0.02);
      screen.rotation.x = -0.22;
      g.add(post, screen);
      g.position.set(x, y, z);
      this.group.add(g);

      this.entries.push({ entry, mesh: g, screen, x, z, y });
    }
    scene.add(this.group);
  }

  // The terminal within reach, or null. Also pulses the nearest screen.
  update(player) {
    let best = null;
    let bestD = 2.2;
    for (const e of this.entries) {
      const d = Math.hypot(e.x - player.pos.x, e.z - player.pos.z);
      e.screen.material.color.setHex(this.read.has(e.entry.title) ? 0x1f6b48 : 0x39ff9a);
      if (d < bestD) {
        bestD = d;
        best = e;
      }
    }
    this.near = best;
    return best;
  }

  // Returns { entry, fresh } or null when nothing is in reach.
  readNear() {
    if (!this.near) return null;
    const fresh = !this.read.has(this.near.entry.title);
    this.read.add(this.near.entry.title);
    return { entry: this.near.entry, fresh };
  }

  dispose() {
    this.scene.remove(this.group);
    this.group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) o.material.dispose();
    });
    this.entries.length = 0;
  }
}
