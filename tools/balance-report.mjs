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

// enemy table, mirrored from play/src/enemies.js TYPES
const TYPES = {
  imp: { hp: 55, damage: 15, attackCd: 2.1, melee: false },
  grunt: { hp: 40, damage: 12, attackCd: 2.0, melee: true },
  hound: { hp: 22, damage: 11, attackCd: 1.4, melee: true },
  warden: { hp: 620, damage: 26, attackCd: 2.3, melee: true },
};

const diffName = process.argv[2] && DIFF[process.argv[2]] ? process.argv[2] : 'normal';
const diff = DIFF[diffName];

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

console.log(`balance report — ${diffName} (hp x${diff.hp}, count x${diff.count})\n`);
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
