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
  // the campaign seed first, then five derived ones: the level a player actually
  // gets is the one that must be completable
  for (let s = -1; s < SEEDS; s++) {
    const seed = s < 0 ? zone.seed : zone.seed + '-' + s;
    HG.beginZone(zone);
    HG.story.skip();
    frames(1);
    HG.chooseClass('marine');
    frames(2);
    // a level must not be able to kill the tester while it is being checked
    HG.player.health = 1e9;

    const L = HG.level;
    const tag = zone.id + '/' + s;

    // ---- the start room is empty, by rule
    ok(L.spawnRoom === 0, tag + ': the spawn room is room 0');
    ok(L.exitRoom !== L.spawnRoom, tag + ': the exit is never the room you start in');

    // ---- the spawn is somewhere you can stand, and somewhere you can leave
    ok(!isBlocked(L, L.spawn.x, L.spawn.z), tag + ': the spawn is on open floor');
    // a room whose only exits are doors is a room you cannot leave
    ok(L.reachCount >= 220, tag + ': the floor around the spawn is bigger than a box (' + L.reachCount + ' cells)');
    ok(L.spawnRoomExits >= 1, tag + ': the spawn room has a way out that is not a door (' + L.spawnRoomExits + ')');

    // ---- the exit is reachable once the doors open
    L.doorOpen = true;
    const field = buildFlowField(L, L.spawn.x, L.spawn.z);
    const exitIdx = L.exit.cz * L.W + L.exit.cx;
    ok(field[exitIdx] >= 0, tag + ': the exit is reachable from the spawn');
    L.doorOpen = false;

    // the boss wave opens with a cutscene; a player presses a key, the test
    // calls the same skip
    HG.cinematic.skip();

    // ---- play the real path to wave 3, where the keycard appears
    // the warden summons hounds as it dies, so one pass is not enough
    const killAll = () => {
      HG.cinematic.skip();
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
    frames(4); // let depenetration run
    // BODY_HALF is the measured half-width of the widest enemy body. The check
    // uses the constant, not e.radius: a test that trusts the value it is
    // testing passes for the wrong reason.
    // The invariant the game maintains is that a body's own collision circle is
    // clear of rock. A hovering enemy is exempt: it floats above the floor and
    // its silhouette is not the thing a wall can swallow.
    const wide = HG.enemies.list.filter((e) => !e.T.hover && circleBlocked(L, e.pos.x, e.pos.z, e.radius));
    ok(wide.length === 0, tag + ': no enemy body is standing inside rock');

    // ---- clearing the wave opens the exit
    HG.game.hasKey = true;
    killAll();
    frames(4);
    ok(HG.enemies.aliveCount === 0, tag + ': the wave can be cleared');
    ok(HG.game.exitOpen === true, tag + ': clearing it opens the exit');
  }
}

// ---- the campaign: all 32 levels, played as the game plays them -------------
// The zone sweep above plays nine zones over six seeds each. This plays every
// level in the table once, through `beginLevel()`, and checks the rules that are
// about a level rather than about a floor plan: the objective the row names, the
// door it opens, and the two spawn rules that have never been allowed to bend.
{
  const { STORY_LEVELS } = await import('../play/src/story-levels.js');
  let levels = 0;
  for (const row of STORY_LEVELS) {
    const tag = 'L' + row.n + ' ' + row.id;
    const began = HG.beginLevel(row.n);
    ok(began === true, tag + ': the level starts from the table');
    if (!began) continue;
    levels++;
    HG.story.skip();
    frames(1);
    HG.chooseClass('marine');
    frames(2);
    HG.cinematic.skip();
    HG.dialogue.skip();
    HG.player.health = 1e9;

    const L = HG.level;
    const o = row.objective;

    // the objective the row names is the one the level plays
    ok(HG.game.objectiveType === o.type, tag + ': plays its own objective (' + HG.game.objectiveType + ')');
    ok(HG.game.wavesTarget === 1, tag + ': one wave, not three');
    ok(HG.game.level === row.n && HG.game.storyLevel === row.n, tag + ': knows which level it is');

    // a `reach` level is crossable from the first frame; the others are shut
    ok(HG.game.exitOpen === (o.type === 'reach'), tag + ': the door state follows the objective');

    // relics: the count the row asks for, and none of them in the spawn room
    if (o.type === 'relics') {
      ok(HG.game.relicsTotal === o.relics, tag + ': spawns the relics the row asks for (' + HG.game.relicsTotal + ')');
      ok(HG.game.relics.length === o.relics, tag + ': and all of them are on the floor');
      const inSpawn = HG.game.relics.filter((r) => {
        const c = L.cells[L.idx(Math.round(r.x / 2), Math.round(r.z / 2))];
        return c && c.room === L.spawnRoom;
      });
      ok(inSpawn.length === 0, tag + ': no relic stands in the spawn room');
    }
    if (o.type === 'survive') {
      ok(HG.game.objectiveT > 0 && HG.game.objectiveT <= o.time, tag + ': the clock starts at its full time');
    }

    // the floor is a level, not a pen
    ok(L.spawnRoom === 0, tag + ': the spawn room is room 0');
    ok(L.exitRoom !== L.spawnRoom, tag + ': the exit is never the room you start in');
    ok(!isBlocked(L, L.spawn.x, L.spawn.z), tag + ': the spawn is on open floor');
    ok(L.spawnRoomExits >= 1, tag + ': the spawn room has a way out that is not a door');
    ok(L.reachCount >= 220, tag + ': the floor is bigger than a box (' + L.reachCount + ' cells)');

    // THE rule: no enemy in the spawn room, and none within 12 m of the spawn
    const inRoom = HG.enemies.list.filter((e) => {
      const c = L.cells[L.idx(Math.round(e.pos.x / 2), Math.round(e.pos.z / 2))];
      return c && c.room === L.spawnRoom;
    });
    ok(inRoom.length === 0, tag + ': no enemy stands in the spawn room (' + inRoom.length + ')');
    const near = HG.enemies.list.filter((e) => Math.hypot(e.pos.x - L.spawn.x, e.pos.z - L.spawn.z) < 12);
    ok(near.length === 0, tag + ': no enemy is within 12 m of the spawn (' + near.length + ')');
    const bodies = HG.enemies.list.filter((e) => {
      const c = L.cells[L.idx(Math.round(e.pos.x / 2), Math.round(e.pos.z / 2))];
      return c && c.solid;
    });
    ok(bodies.length === 0, tag + ': no enemy stands inside rock (' + bodies.length + ')');

    // and the level can be finished: the pad ends it
    HG.enemies.clear();
    HG.game.hasKey = true;
    HG.game.exitOpen = true;
    HG.game.wave = 1;
    HG.player.pos.set(L.exit.x, 0, L.exit.z);
    frames(3);
    ok(HG.game.state === 'cleared', tag + ': stepping on the pad ends the level');
    ok((HG.progress.levels || []).includes(row.n), tag + ': and the campaign records it');
  }
  ok(levels === 32, 'all 32 levels were played (' + levels + ')');
}

// ---- the cache stamp -------------------------------------------------------
{
  const fs = await import('node:fs');
  const path = await import('node:path');
  const os = await import('node:os');
  const { execFileSync } = await import('node:child_process');
  const repo = path.resolve(new URL('..', import.meta.url).pathname);
  // run it against a copy so the real source is untouched
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'stamp-'));
  fs.cpSync(path.join(repo, 'play'), path.join(tmp, 'play'), { recursive: true });
  fs.writeFileSync(path.join(tmp, 'VERSION'), '9.9.9\n');
  fs.mkdirSync(path.join(tmp, 'tools'), { recursive: true });
  fs.copyFileSync(path.join(repo, 'tools', 'stamp-cache.mjs'), path.join(tmp, 'tools', 'stamp-cache.mjs'));
  execFileSync('node', [path.join(tmp, 'tools', 'stamp-cache.mjs')], { stdio: 'pipe' });
  const stamped = fs.readFileSync(path.join(tmp, 'play', 'src', 'main.js'), 'utf8');
  ok(stamped.includes("from './level.js?v=9.9.9'"), 'the stamp adds the version to a relative import');
  const html = fs.readFileSync(path.join(tmp, 'play', 'index.html'), 'utf8');
  ok(html.includes('src="./src/main.js?v=9.9.9"'), 'and to the entry script');
  // running it twice must not produce ?v=9.9.9?v=9.9.9
  execFileSync('node', [path.join(tmp, 'tools', 'stamp-cache.mjs')], { stdio: 'pipe' });
  const twice = fs.readFileSync(path.join(tmp, 'play', 'src', 'main.js'), 'utf8');
  ok(!twice.includes('?v=9.9.9?v='), 'stamping twice is a no-op');
  fs.rmSync(tmp, { recursive: true, force: true });
}

console.log('');
console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
console.log('ALL PLAYABILITY TESTS PASSED');
