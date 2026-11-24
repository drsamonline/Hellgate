#!/usr/bin/env node
/* tools/balance-report.mjs — the difficulty curve as arithmetic over the code.
 *
 * A bot is a poor stand-in for a player: it aims badly and its kill count says
 * more about the bot than the game. This tool does the other thing — it reads
 * the constants the game actually uses and computes what a wave costs.
 *
 *   node tools/balance-report.mjs            # normal
 *   node tools/balance-report.mjs hard       # one difficulty
 *
 * Everything here is derived from play/src, so if a constant changes the report
 * changes with it. Nothing in it is a playtest.
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

await import('../tests/domstub.mjs');
const { WEAPONS } = await import('../play/src/weapons.js');
const { generateLevel } = await import('../play/src/level.js');

const DIFF = {
  easy: { hp: 0.8, dmg: 0.7, count: 0.75 },
  normal: { hp: 1, dmg: 1, count: 1 },
  hard: { hp: 1.3, dmg: 1.25, count: 1.3 },
};

// the real enemy table, imported: this used to be a four-entry mirror, and the
// four act bosses and the act rosters made every entry past those four undefined
const { TYPES } = await import('../play/src/enemies.js');

const { ZONES } = await import('../play/src/world.js');

const diffName = process.argv[2] && DIFF[process.argv[2]] ? process.argv[2] : 'normal';
const base = DIFF[diffName];
// each zone scales the preset; the report has to do the same or it describes a
// game that no longer exists
// a zone id or a campaign level number: a level is dressed in its zone and
// raised to its act's floor, which is the whole of the difficulty curve
const { STORY_LEVELS, storyLevel, storyLevelZone, ACT_THREAT } = await import('../play/src/story-levels.js');
const zoneArg = process.argv[3];
let level = null;
let zone;
if (zoneArg && /^\d+$/.test(zoneArg)) {
  level = storyLevel(Number(zoneArg));
  if (!level) {
    console.error('unknown level; there are ' + STORY_LEVELS.length);
    process.exit(1);
  }
  zone = storyLevelZone(level);
} else {
  zone = zoneArg ? ZONES.find((z) => z.id === zoneArg) : ZONES[0];
  if (!zone) {
    console.error('unknown zone; try ' + ZONES.map((z) => z.id).join(', ') + ' or a level number 1-' + STORY_LEVELS.length);
    process.exit(1);
  }
}
// the act is a floor, exactly as `levelThreat()` in main.js applies it
const actFloor = level ? ACT_THREAT[Math.min(ACT_THREAT.length - 1, Math.max(0, level.act - 1))] : 0;
const t = Math.max(zone.threat || 1, actFloor);
const diff = { hp: base.hp * t, dmg: base.dmg * t, count: base.count * t };

// wave size, mirrored from EnemyManager.spawnWave
const waveCount = (wave, boss) => {
  const base = boss ? 3 : 4 + wave * 2;
  return Math.max(2, Math.min(30, Math.round(base * diff.count)));
};

// what a wave is made of, by wave number: imps first, then the rest
const mixFor = (wave) => {
  if (wave <= 1) return { imp: 1 };
  if (wave === 2) return { imp: 0.7, grunt: 0.3 };
  if (wave === 3) return { imp: 0.5, grunt: 0.3, hound: 0.2 };
  return { imp: 0.4, grunt: 0.3, hound: 0.3 };
};

const hpAt = (type, wave) => Math.round(TYPES[type].hp * (1 + 0.1 * (wave - 1)) * diff.hp);

// damage per second, ignoring reload gaps a player spends moving
const dps = (w) => {
  const perShot = w.damage * (w.pellets || 1);
  return perShot / w.cooldown;
};

const weapon = (key) => WEAPONS.find((w) => w.key === key);

const baseZone = ZONES.find((z) => z.id === (level ? level.zone : zone.id)) || zone;
const where = level ? `level ${level.n} "${level.title}" (act ${level.act}) on ${baseZone.name}` : baseZone.name;
console.log(`balance report — ${diffName} on ${where}`);
console.log(`  threat x${t.toFixed(2)}${level ? ` (zone ${(zone.threat || 1).toFixed(2)}, act floor ${actFloor.toFixed(2)})` : ''}: hp x${diff.hp.toFixed(2)}, count x${diff.count.toFixed(2)}\n`);
console.log('wave  enemies  total hp  shotgun dps  pistol dps  chaingun dps  rocket dps  shells needed  bullets needed');
for (let wave = 1; wave <= 8; wave++) {
  const n = waveCount(wave, false);
  const mix = mixFor(wave);
  let totalHp = 0;
  for (const [type, share] of Object.entries(mix)) {
    totalHp += hpAt(type, wave) * Math.round(n * share);
  }
  const sg = weapon('shotgun');
  const perShell = sg.damage * sg.pellets;
  const shells = Math.ceil(totalHp / perShell);
  const bullets = Math.ceil(totalHp / weapon('pistol').damage);
  console.log(
    String(wave).padEnd(6) + String(n).padEnd(9) + String(totalHp).padEnd(10) +
    String(Math.round(dps(sg))).padEnd(13) + String(Math.round(dps(weapon('pistol')))).padEnd(12) +
    String(Math.round(dps(weapon('chaingun')))).padEnd(14) + String(Math.round(dps(weapon('rocket')))).padEnd(12) +
    String(shells).padEnd(15) + bullets
  );
}

// ---- the ladder, act by act ------------------------------------------------
// A campaign level is one wave, so wave 1 is the whole fight. This is the number
// that decides whether an act is hard or broken: how many hits kill a full-health
// player, and how much the first wave of the act can land on you standing still.
if (process.argv[2] === 'acts' || !zoneArg) {
  const PLAYER_HP = 110;
  console.log('the ladder — the first wave of each act\n');
  const { ROSTER_FOR_ACT } = await import('../play/src/story-levels.js');
  console.log('act  level  zone        enemies  hp each  damage per hit  hits to kill  roster mean hp  standing-still hp');
  for (const act of [1, 2, 3, 4]) {
    const row = STORY_LEVELS.find((r) => r.act === act);
    const lz = storyLevelZone(row);
    const floor = ACT_THREAT[Math.min(ACT_THREAT.length - 1, act - 1)];
    const tt = Math.max(lz.threat || 1, floor);
    const d = { hp: base.hp * tt, dmg: base.dmg * tt, count: base.count * tt };
    const n = Math.max(2, Math.min(30, Math.round((4 + 2) * d.count)));
    const impHp = Math.round(TYPES.imp.hp * d.hp);
    const perHit = Math.round(TYPES.imp.damage * d.dmg);
    const hits = Math.ceil(PLAYER_HP / perHit);
    const incoming = n * (TYPES.imp.damage / TYPES.imp.attackCd) * d.dmg;
    const secs = (impHp * n) / dps(weapon('shotgun'));
    // the roster is what actually walks at you; the imp column is the yardstick
    const roster = ROSTER_FOR_ACT[act] || ['imp'];
    const meanHp = roster.reduce((a, t) => a + Math.round(TYPES[t].hp * d.hp), 0) / roster.length;
    console.log(
      String(act).padEnd(5) + String(row.n).padEnd(7) + String(row.zone).padEnd(12) +
      String(n).padEnd(9) + String(impHp).padEnd(9) + String(perHit).padEnd(16) +
      String(hits).padEnd(14) + String(Math.round(meanHp)).padEnd(16) + Math.round(incoming * secs)
    );
  }
  console.log('\n  "hits to kill" is an imp landing one hit on a player with 110 hp and no armour.');
  console.log('  "standing-still hp" is the whole first wave landing every hit while you do nothing:');
  console.log('  an upper bound, useful only for comparing acts with each other.\n');
}

console.log('\nammo carried at the start of a run');
console.log('  shells 16 · bullets 60 · rockets 3 · grenades 3');
console.log('  pickups restore a share of these; a wave that needs more shells than you carry is a wave');
console.log('  that ends at the ammo box, not at the enemy.\n');

// how long a wave takes if you only use one weapon, and what that costs in health
console.log('time to clear, and damage taken if every enemy lands one hit per attack cooldown\n');
console.log('wave  seconds (shotgun)  enemy dps  hp lost standing still');
for (let wave = 1; wave <= 8; wave++) {
  const n = waveCount(wave, false);
  const mix = mixFor(wave);
  let totalHp = 0;
  let incoming = 0;
  for (const [type, share] of Object.entries(mix)) {
    const count = Math.round(n * share);
    totalHp += hpAt(type, wave) * count;
    incoming += count * TYPES[type].damage * (1 / TYPES[type].attackCd) * diff.dmg;
  }
  const sg = weapon('shotgun');
  const secs = totalHp / dps(sg);
  console.log(String(wave).padEnd(6) + secs.toFixed(1).padEnd(18) + incoming.toFixed(1).padEnd(11) + Math.round(incoming * secs));
}

console.log('\nthe player has 110 hp and 25 armour. that is the number to compare the last column with.');
console.log('nothing in this report is a playtest: it is arithmetic over play/src, and it moves when the code moves.');
