// tools/soak.mjs — a bot plays the game unattended, so a long run can be checked
// for crashes, NaNs and runaway state without a human holding the mouse.
//
//   node tools/soak.mjs                # 3 difficulties x 3 seeds, 90 s each
//   node tools/soak.mjs hard 5         # one difficulty, five seeds
//
// Be careful what you read into the numbers. The bot turns to the nearest enemy,
// follows the flow field to it, fires when it has line of sight, and switches
// when a gun runs dry. It kills slowly — it fires through a shotgun's spread at
// whatever is nearest rather than closing to a range where the pellets land. The
// table is a stability signal, not a difficulty measurement.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// the suites run against the stub, and this tool runs the same code paths
const stub = path.join(ROOT, 'node_modules', 'three');
if (!fs.existsSync(stub)) {
  fs.mkdirSync(path.dirname(stub), { recursive: true });
  fs.cpSync(path.join(ROOT, 'tests', 'stub-three'), stub, { recursive: true });
}

await import('../tests/domstub.mjs');

const DIFFS = ['easy', 'normal', 'hard'];
const SECONDS = 90;
const DT = 1 / 60;

const args = process.argv.slice(2);
const onlyDiff = args[0] && DIFFS.includes(args[0]) ? args[0] : null;
const seeds = Number(args[1]) || 3;

const { hasLineOfSight } = await import('../play/src/level.js');
const { WEAPONS } = await import('../play/src/weapons.js');
const { buildFlowField, flowStep } = await import('../play/src/level.js');
await import('../play/src/main.js');
const HG = window.HG;
const doc = globalThis.document;

function frames(n) {
  for (let i = 0; i < n; i++) {
    const q = globalThis.__RAF.splice(0);
    for (const fn of q) fn();
  }
}

function play(seed, difficulty) {
  HG.changeSetting('difficulty', difficulty);
  doc.getElementById('seedInput').value = seed;
  doc.getElementById('startBtn').dispatch('click');
  HG.story.skip();
  frames(1);
  HG.chooseClass('marine');
  frames(2);

  const p = HG.player;
  let field = null;
  let fieldT = 0;
  let hpLost = 0;
  let lastHp = p.health;
  let shots = 0;
  const startWave = HG.game.wave;
  const maxFrames = Math.round(SECONDS / DT);

  for (let f = 0; f < maxFrames && p.alive; f++) {
    // aim at the nearest live enemy
    let best = null;
    let bestD = 1e9;
    for (const e of HG.enemies.list) {
      if (!e.alive) continue;
      const d = Math.hypot(e.pos.x - p.pos.x, e.pos.z - p.pos.z);
      if (d < bestD) { bestD = d; best = e; }
    }
    if (best) {
      const dx = best.pos.x - p.pos.x;
      const dz = best.pos.z - p.pos.z;
      p.yaw = Math.atan2(-dx, -dz);
      p.pitch = Math.atan2((best.pos.y + best.height * 0.5) - (p.pos.y + 1.62), Math.hypot(dx, dz));
      const eye = { x: p.pos.x, y: p.pos.y + 1.62, z: p.pos.z };
      const chest = best.chestPos();
      const seen = hasLineOfSight(HG.level, eye, chest);

      // no line of sight: walk the flow field toward it. The same BFS the
      // enemies use, so the bot gets around a wall instead of leaning on it.
      HG.input.move.x = 0;
      if (seen) {
        HG.input.move.y = bestD < 3.2 ? 1 : 0;
      } else {
        fieldT -= DT;
        if (fieldT <= 0 || !field) {
          field = buildFlowField(HG.level, best.pos.x, best.pos.z);
          fieldT = 0.4;
        }
        const step = flowStep(HG.level, field, p.pos.x, p.pos.z);
        if (step) {
          p.yaw = Math.atan2(-step.x, -step.z);
          HG.input.move.y = -1;
        } else {
          HG.input.move.y = -1;
        }
      }

      // a real player switches when a gun runs dry
      if (p.ammo[WEAPONS[HG.weapons.current].ammo] === 0) {
        for (let k = 0; k < WEAPONS.length; k++) {
          const idx = (HG.weapons.current + 1 + k) % WEAPONS.length;
          if (p.ammo[WEAPONS[idx].ammo] > 0) { HG.weapons.select(idx, true); break; }
        }
      }

      // fire only when it can actually see the target, or every shot eats a wall
      if (seen && bestD < 30) {
        HG.input.fire = true;
        shots++;
      } else HG.input.fire = false;
    } else {
      HG.input.fire = false;
      HG.input.move.x = 0;
      HG.input.move.y = 0;
    }
    frames(1);
    if (p.health < lastHp) { hpLost += lastHp - p.health; lastHp = p.health; }
    if (p.health > lastHp) lastHp = p.health;
    if (HG.game.state === 'cleared') break;
  }
  HG.input.fire = false;
  HG.input.move.y = 0;

  return {
    difficulty,
    seed,
    survived: Math.round((HG.game.state === 'dead' ? SECONDS : SECONDS) * 0) || 0,
    alive: p.alive,
    wave: HG.game.wave,
    kills: HG.game.kills,
    score: HG.game.score,
    hpLost: Math.round(hpLost),
    hpLeft: Math.round(p.health),
    shots,
    enemyHp: Math.round(HG.enemies.list.filter((e) => e.alive).reduce((a, e) => a + e.hp, 0)),
  };
}

const rows = [];
for (const d of onlyDiff ? [onlyDiff] : DIFFS) {
  for (let i = 0; i < seeds; i++) {
    rows.push(play('balance-' + i, d));
  }
}

const byDiff = {};
for (const r of rows) {
  (byDiff[r.difficulty] = byDiff[r.difficulty] || []).push(r);
}

console.log(`soak: ${seeds} seed(s) per difficulty, ${SECONDS}s cap, marine class`);
console.log('the bot is a coarse proxy — read this as "it did not fall over", not as balance\n');
console.log('difficulty  survived  waves  kills  shots   hp lost  hp left  enemy hp');
for (const [d, rs] of Object.entries(byDiff)) {
  const avg = (k) => Math.round(rs.reduce((a, r) => a + r[k], 0) / rs.length);
  const alive = rs.filter((r) => r.alive).length;
  console.log(
    `${d.padEnd(11)} ${String(alive + '/' + rs.length).padEnd(9)} ${String(avg('wave')).padEnd(6)} ` +
    `${String(avg('kills')).padEnd(6)} ${String(avg('shots')).padEnd(7)} ${String(avg('hpLost')).padEnd(8)} ` +
    `${String(avg('hpLeft')).padEnd(8)} ${avg('enemyHp')}`
  );
}
