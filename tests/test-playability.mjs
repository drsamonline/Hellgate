// tests/test-playability.mjs — every level must be completable.
//
// This is the suite that would have caught the two bugs reported from play:
// a keycard placed behind a sealed wall, and enemies whose bodies were wider
// than the collision circle that stopped them. Both were "the level works"
// failures, and neither was visible to a test of a single function.
//
// For each zone and seed it answers one question: can a player standing at the
// spawn reach everything the level asks them to reach, and does clearing the
// wave actually open the exit?

import './domstub.mjs';
import { isBlocked, buildFlowField, circleBlocked } from '../play/src/level.js';
import { ZONES } from '../play/src/world.js';

await import('../play/src/main.js');
const HG = window.HG;
const doc = globalThis.document;

const frames = (n) => {
  for (let i = 0; i < n; i++) {
    const q = globalThis.__RAF.splice(0);
    for (const fn of q) fn();
  }
};

let pass = 0;
let fail = 0;
const ok = (cond, msg) => {
  if (cond) {
    pass++;
    console.log('  ok  ' + msg);
  } else {
    fail++;
    console.log('  FAIL ' + msg);
  }
};

const SEEDS = 6;

for (const zone of ZONES) {
  for (let s = 0; s < SEEDS; s++) {
    const seed = zone.seed + '-' + s;
    HG.beginZone(zone);
    HG.story.skip();
    frames(1);
    HG.chooseClass('marine');
    frames(2);
    // a level must not be able to kill the tester while it is being checked
    HG.player.health = 1e9;

    const L = HG.level;
    const tag = zone.id + '/' + s;

    // ---- the spawn is somewhere you can stand
    ok(!isBlocked(L, L.spawn.x, L.spawn.z), tag + ': the spawn is on open floor');

    // ---- the exit is reachable once the doors open
    L.doorOpen = true;
    const field = buildFlowField(L, L.spawn.x, L.spawn.z);
    const exitIdx = L.exit.cz * L.W + L.exit.cx;
    ok(field[exitIdx] >= 0, tag + ': the exit is reachable from the spawn');
    L.doorOpen = false;

    // ---- play the real path to wave 3, where the keycard appears
    // the warden summons hounds as it dies, so one pass is not enough
    const killAll = () => {
      for (let pass = 0; pass < 6 && HG.enemies.aliveCount > 0; pass++) {
        for (const e of HG.enemies.list) {
          if (e.alive) {
            e.hurt(99999, {
              level: L, player: HG.player, effects: HG.effects, audio: HG.audio,
              projectiles: HG.projectiles, onKill: HG.enemies.onKill,
            }, { x: 0, y: 0, z: 1 });
          }
        }
        frames(3);
      }
    };
    const clearAndStep = () => {
      killAll();
      HG.game.hasKey = true; // the gate needs the keycard from wave 3; the keycard
      frames(4);             // itself is asserted separately below
      HG.player.pos.set(L.exit.x, 0, L.exit.z);
      frames(6);
    };
    // step forward until the level asks for a keycard (wave 3), whatever the
    // zone's wave count is
    for (let step = 0; step < 3 && HG.game.wave < 3; step++) clearAndStep();
    ok(HG.game.wave >= 3, tag + ': reached the keycard wave by playing it (' + HG.game.wave + ')');
    const key = HG.game.keycard;
    ok(!!key, tag + ': wave 3 places a keycard');
    if (key) {
      const kx = Math.round(key.x / 2);
      const kz = Math.round(key.z / 2);
      ok(L.reach[kz * L.W + kx] === 1, tag + ': the keycard is on reachable floor');
    }

    // ---- every pickup the level placed is on floor you can reach
    const reach = (x, z) => {
      const cx = Math.round(x / 2);
      const cz = Math.round(z / 2);
      const i = cz * L.W + cx;
      return L.reach[i] === 1;
    };
    const strays = [];
    for (const p of HG.game.pickups || []) if (!reach(p.x, p.z)) strays.push('pickup');
    for (const r of HG.game.relics || []) if (!reach(r.x, r.z)) strays.push('relic');
    for (const b of HG.game.barrels || []) if (!reach(b.x, b.z)) strays.push('barrel');
    ok(strays.length === 0, tag + ': no pickup, relic or barrel is out of reach' + (strays.length ? ' (' + strays.join(',') + ')' : ''));

    // ---- every enemy spawned somewhere it can path from
    const lost = HG.enemies.list.filter((e) => !reach(e.pos.x, e.pos.z));
    ok(lost.length === 0, tag + ': every enemy spawned on reachable floor' + (lost.length ? ' (' + lost.length + ' lost)' : ''));

    // ---- no enemy body is wider than the circle that stops it
    // BODY_HALF is the measured half-width of the widest enemy body. The check
    // uses the constant, not e.radius: a test that trusts the value it is
    // testing passes for the wrong reason.
    const BODY_HALF = 0.5;
    const wide = HG.enemies.list.filter((e) => circleBlocked(L, e.pos.x, e.pos.z, BODY_HALF));
    ok(wide.length === 0, tag + ': no enemy body is standing inside rock');

    // ---- clearing the wave opens the exit
    HG.game.hasKey = true;
    killAll();
    frames(4);
    ok(HG.enemies.aliveCount === 0, tag + ': the wave can be cleared');
    ok(HG.game.exitOpen === true, tag + ': clearing it opens the exit');
  }
}

console.log('');
console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
console.log('ALL PLAYABILITY TESTS PASSED');
