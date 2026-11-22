#!/usr/bin/env node
/* tools/audit-invariants.mjs — run the game for a while and assert the things
 * that must always be true, rather than the things that must happen.
 *
 * The suites assert behaviour: a hit does damage, a pickup heals. This asserts
 * invariants over 900 simulated frames of real play with input: no NaN anywhere,
 * the player inside the level, no enemy under the floor, no pool growing without
 * a bound, no object leaking into the scene, health and ammo in range.
 *
 *   node tools/audit-invariants.mjs [zone,zone]
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.json': 'application/json' };
const server = http.createServer((q, r) => {
  let f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0]));
  if (f.endsWith('/')) f = path.join(f, 'index.html');
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); r.end(); return; }
  r.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(r);
});
await new Promise((r) => server.listen(9401, '127.0.0.1', r));

const browser = await puppeteer.launch({
  executablePath: '/usr/local/bin/chromium',
  headless: 'new',
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage'],
  timeout: 60000,
});

const zones = process.argv[2] ? process.argv[2].split(',') : ['gate', 'kiln', 'cistern'];
const problems = [];
const seeds = { gate: 'gate-238', kiln: 'kiln-112', cistern: 'cistern-32' };

const INVARIANTS = `
(() => {
  const HG = window.HG;
  const bad = [];
  const finite = (n) => typeof n === 'number' && Number.isFinite(n);
  const p = HG.player;

  if (!finite(p.pos.x) || !finite(p.pos.y) || !finite(p.pos.z)) bad.push('player position is not finite: ' + JSON.stringify(p.pos));
  if (!finite(p.health) || p.health < -0.001) bad.push('player health out of range: ' + p.health);
  if (!finite(p.maxHp) || p.maxHp <= 0) bad.push('player maxHp is ' + p.maxHp);
  if (!finite(p.armor) || p.armor < -0.001) bad.push('player armour out of range: ' + p.armor);
  if (p.health > p.maxHp + 0.001) bad.push('player health above max: ' + p.health + ' > ' + p.maxHp);
  for (const k of Object.keys(p.ammo || {})) {
    const v = p.ammo[k];
    if (!finite(v) || v < 0) bad.push('ammo ' + k + ' out of range: ' + v);
  }

  // the player must be inside the level's own bounds
  const L = HG.level;
  if (L && L.w && L.h) {
    const cx = p.pos.x / 2, cz = p.pos.z / 2;
    if (cx < -2 || cz < -2 || cx > L.w + 2 || cz > L.h + 2) bad.push('player outside the grid: cell ' + cx.toFixed(1) + ',' + cz.toFixed(1) + ' of ' + L.w + 'x' + L.h);
  }

  for (const e of HG.enemies.list) {
    if (!e.alive) continue;
    if (!finite(e.pos.x) || !finite(e.pos.y) || !finite(e.pos.z)) { bad.push('enemy ' + e.type + ' position is not finite'); break; }
    if (!finite(e.hp) || e.hp <= 0 || e.hp > e.maxHp + 0.001) { bad.push('enemy ' + e.type + ' hp out of range: ' + e.hp + '/' + e.maxHp); break; }
    const floor = HG.level ? HG.level.cells[HG.level.idx(Math.round(e.pos.x / 2), Math.round(e.pos.z / 2))] : null;
    if (floor && finite(floor.floor) && e.pos.y < floor.floor - 1.2) { bad.push('enemy ' + e.type + ' is under the floor: y ' + e.pos.y.toFixed(2) + ' floor ' + floor.floor); break; }
  }

  // the pool sizes are ceilings, not hopes
  const fx = HG.effects;
  if (fx) {
    if (fx.particles && fx.particles.length > 700) bad.push('particle pool grew to ' + fx.particles.length);
    if (fx.decals && fx.decals.length > 60) bad.push('decal pool grew to ' + fx.decals.length);
  }
  if (HG.projectiles && HG.projectiles.list.length > 120) bad.push('projectile list grew to ' + HG.projectiles.list.length);

  // no enemy mesh in the scene that no enemy owns
  const enemyMeshes = new Set(HG.enemies.list.map((e) => e.mesh));
  let strays = 0;
  HG.scene.traverse((o) => {
    if (o.userData && o.userData.enemyBody && !enemyMeshes.has(o.parent) && !enemyMeshes.has(o)) strays++;
  });
  if (strays > 8) bad.push(strays + ' enemy meshes in the scene belong to no enemy');

  return bad;
})()
`;

// Aim at the nearest enemy most of the time, so the run actually fires, kills and
// paints decals — the states where an invariant is most likely to break. A pure
// random yaw spends the whole run shooting walls.
const randomInput = `
(() => {
  const HG = window.HG;
  const i = HG.input;
  const r = Math.random();
  i.keys = i.keys || {};
  i.keys.KeyW = r < 0.75;
  i.keys.KeyA = r > 0.8 && r < 0.88;
  i.keys.KeyD = r > 0.88;
  i.keys.Space = Math.random() < 0.05;
  const p = HG.player;
  let best = null, bestD = 1e9;
  for (const e of HG.enemies.list) {
    if (!e.alive) continue;
    const d = Math.hypot(e.pos.x - p.pos.x, e.pos.z - p.pos.z);
    if (d < bestD) { bestD = d; best = e; }
  }
  if (best && Math.random() < 0.85) {
    const dx = best.pos.x - p.pos.x, dz = best.pos.z - p.pos.z;
    p.yaw = Math.atan2(-dx, -dz);
    p.pitch = Math.atan2((best.pos.y + 1) - (p.pos.y + 1.6), Math.hypot(dx, dz));
  } else {
    p.yaw += (Math.random() - 0.5) * 0.6;
  }
  i.fire = Math.random() < 0.8;
  if (Math.random() < 0.1) HG.swingBlade();
  if (Math.random() < 0.05) HG.throwGrenade();
  return true;
})()
`;

for (const zone of zones) {
  const page = await browser.newPage();
  page.on('pageerror', (e) => problems.push(zone + ': pageerror ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') problems.push(zone + ': console ' + m.text()); });
  await page.setViewport({ width: 800, height: 500 });
  await page.goto('http://127.0.0.1:9401/play/?auto=1&zone=' + zone + '&seed=' + (seeds[zone] || zone) + '&wave=3', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction('window.HG && window.HG.game.state === "playing"', { timeout: 30000 });

  let checks = 0;
  for (let block = 0; block < 9; block++) {
    await page.evaluate((code) => {
      // ~100 frames of real update with fresh random input every 10
      const HG = window.HG;
      for (let f = 0; f < 100; f++) {
        if (f % 10 === 0) eval(code);
        HG.update(1 / 60);
      }
    }, randomInput);
    const bad = await page.evaluate(INVARIANTS);
    checks++;
    for (const b of bad) problems.push(zone + ' after ' + (block + 1) * 100 + ' frames: ' + b);
  }
  const stats = await page.evaluate(() => ({
    kills: window.HG.game.kills,
    enemies: window.HG.enemies.list.length,
    score: window.HG.game.score,
    wave: window.HG.game.wave,
  }));
  console.log(zone.padEnd(9), 'checks', checks, 'kills', stats.kills, 'enemies', stats.enemies, 'wave', stats.wave);
  await page.close();
}

await browser.close();
server.close();

if (problems.length) {
  console.log('\nINVARIANT FAILURES (' + problems.length + ')');
  const seen = new Set();
  for (const p of problems) { if (seen.has(p)) continue; seen.add(p); console.log('  - ' + p); }
  process.exit(1);
}
console.log('\nALL INVARIANTS HELD over 900 frames per zone');
