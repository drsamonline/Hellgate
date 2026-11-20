#!/usr/bin/env node
/* tools/pick-seeds.mjs — score candidate seeds and print the best per zone.
 *
 * The campaign seeds in play/src/world.js are strings somebody typed. This
 * checks a few hundred candidates against what each zone needs — a big room for
 * the boss, stairs to make height matter, a secret to find — and prints the
 * best, so the campaign is chosen rather than assumed.
 *
 *   node tools/pick-seeds.mjs            # 400 candidates per zone
 *   node tools/pick-seeds.mjs 1200       # more
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const stub = path.join(ROOT, 'node_modules', 'three');
if (!fs.existsSync(stub)) {
  fs.mkdirSync(path.dirname(stub), { recursive: true });
  fs.cpSync(path.join(ROOT, 'tests', 'stub-three'), stub, { recursive: true });
}
const { generateLevel, buildFlowField } = await import('../play/src/level.js');
const { ZONES } = await import('../play/src/world.js');

const N = Number(process.argv[2]) || 400;

// what each zone wants, by zone id
const WANTS = {
  gate: { rooms: [9, 12], big: 1, stairs: 20, boss: false },
  foundry: { rooms: [10, 13], big: 1, stairs: 25, boss: false },
  grove: { rooms: [9, 13], big: 1, stairs: 20, boss: false },
  spire: { rooms: [10, 13], big: 1, stairs: 30, boss: false },
  throne: { rooms: [9, 13], big: 2, stairs: 20, boss: true }, // the warden needs room
};

function score(seed, want) {
  const L = generateLevel(seed);
  const f = buildFlowField(L, L.spawn.x, L.spawn.z);
  let open = 0;
  let unreached = 0;
  for (let i = 0; i < L.cells.length; i++) {
    const c = L.cells[i];
    if (c.solid || c.door || c.secret) continue;
    open++;
    if (f[i] < 0) unreached++;
  }
  // the exit is behind a shut door by design, so allow for that
  const big = L.rooms.filter((r) => r.w >= 7 && r.h >= 7).length;
  const huge = Math.max(0, ...L.rooms.map((r) => Math.min(r.w, r.h)));
  const ok =
    L.rooms.length >= want.rooms[0] && L.rooms.length <= want.rooms[1] &&
    big >= want.big &&
    L.stairs.length >= want.stairs &&
    L.secrets.length >= 1 &&
    L.crates.length >= 2 &&
    open >= 330 &&
    unreached <= 60; // doors shut: a handful of rooms are behind them

  // prefer more stairs and a bigger largest room, penalise clutter
  const s = (ok ? 1000 : 0) + L.stairs.length * 2 + huge * 12 + big * 30 - L.crates.length * 3 - Math.max(0, unreached - 40);
  return { seed, score: s, ok, rooms: L.rooms.length, big, stairs: L.stairs.length, open, unreached, huge };
}

for (const zone of ZONES) {
  const want = WANTS[zone.id] || WANTS.gate;
  const rows = [];
  for (let i = 0; i < N; i++) rows.push(score(zone.id + '-' + i, want));
  rows.sort((a, b) => b.score - a.score);
  const best = rows[0];
  console.log(
    `${zone.id.padEnd(8)} current ${String(zone.seed).padEnd(12)} → best ${best.seed.padEnd(14)} ` +
    `rooms ${best.rooms} big ${best.big} stairs ${best.stairs} open ${best.open} ` +
    `${best.ok ? '' : '(NO CANDIDATE MET EVERY REQUIREMENT)'}`
  );
}
