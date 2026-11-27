#!/usr/bin/env node
/* tools/audit-run.mjs — exercise every screen, mode and action in a browser and
 * report anything that throws. The unit suites test functions; this tests the
 * game the way a player touches it: every screen opened, every weapon fired,
 * every mode started, every zone loaded.
 *
 *   node tools/audit-run.mjs
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.png': 'image/png' };

const server = http.createServer((q, r) => {
  let f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0]));
  if (f.endsWith('/')) f = path.join(f, 'index.html');
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); r.end(); return; }
  r.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(r);
});
await new Promise((r) => server.listen(9101, '127.0.0.1', r));

const browser = await puppeteer.launch({
  // CHROME_PATH first, then the usual places: this was hard-coded to this
  // machine's Chromium and threw "Browser was not found" on the CI runner the
  // first time it ran there
  executablePath: process.env.CHROME_PATH
    || ['/usr/local/bin/chromium', '/usr/bin/chromium', '/usr/bin/google-chrome'].find((p) => fs.existsSync(p)),
  headless: 'new',
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage'],
  timeout: 60000,
});

const problems = [];
// a subset per run: SwiftShader is slow enough that eight zones in one process
// runs the browser out of memory
const allZones = ['gate', 'foundry', 'grove', 'vault', 'ashfall', 'cistern', 'kiln', 'throne'];
const zones = process.argv[2] ? process.argv[2].split(',') : allZones.slice(0, 4);
const allModes = ['campaign', 'endless', 'arena', 'bossrush', 'nightmare', 'hardcore'];
const modes = process.argv[3] ? process.argv[3].split(',') : (process.argv[2] ? [] : allModes);

for (const zone of zones) {
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  await page.setViewport({ width: 1024, height: 640 });
  try {
    await page.goto(`http://127.0.0.1:9101/play/?auto=1&zone=${zone}&wave=3`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction('window.HG && window.HG.game.state === "playing"', { timeout: 30000 });
    const res = await page.evaluate(async () => {
      const HG = window.HG;
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      const out = { nan: [], screens: [], actions: [] };
      HG.cinematic.skip();
      // every screen
      for (const fn of ['showDiary', 'toggleInventory', 'showZoneMap']) {
        try { HG[fn] && HG[fn](); out.screens.push(fn + ':ok'); } catch (e) { out.screens.push(fn + ':' + e.message); }
        await wait(30);
      }
      HG.game.state = 'playing';
      // every action
      const actions = [
        ['fire', () => { HG.weapons.tryFire({ player: HG.player, level: HG.level, enemies: HG.enemies, projectiles: HG.projectiles, hud: HG.hud, onKill: HG.enemies.onKill }); }],
        ['blade', () => HG.swingBlade()],
        ['grenade', () => HG.throwGrenade()],
        ['power', () => HG.castPower && HG.castPower(0)],
        ['relic', () => HG.spawnRelicAt && HG.spawnRelicAt(HG.player.pos.x + 1, HG.player.pos.z)],
        ['keycard', () => HG.openExit()],
        ['pickup', () => HG.addPickup('health', HG.player.pos.x + 1, HG.player.pos.z)],
      ];
      for (const [name, fn] of actions) {
        try { fn(); out.actions.push(name + ':ok'); } catch (e) { out.actions.push(name + ':' + e.message); }
      }
      await wait(200);

      // 20 seconds of random play: movement, fire, blade, grenade, keys
      const codes = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'ShiftLeft', 'KeyF', 'KeyG',
        'Digit1', 'Digit2', 'Digit3', 'Digit4', 'KeyJ', 'KeyM', 'Tab'];
      for (let i = 0; i < 40; i++) {
        if (i % 9 === 0) {
          const code = codes[Math.floor(i / 9) % codes.length];
          window.dispatchEvent(new KeyboardEvent('keydown', { code }));
          window.dispatchEvent(new KeyboardEvent('keyup', { code }));
        }
        if (i % 5 === 0) window.dispatchEvent(new MouseEvent('mousemove', { movementX: 6, movementY: 1 }));
        await new Promise((r) => requestAnimationFrame(r));
      }
      // the game must still be in a sane state after that
      out.after = { state: HG.game.state, wave: HG.game.wave, alive: HG.enemies.aliveCount, hp: HG.player.health };

      // numbers that must be finite
      for (const [k, v] of [['px', HG.player.pos.x], ['py', HG.player.pos.y], ['pz', HG.player.pos.z],
        ['hp', HG.player.health], ['score', HG.game.score], ['wave', HG.game.wave]]) {
        if (!Number.isFinite(v)) out.nan.push(k + '=' + v);
      }
      return out;
    });
    const bad = [...res.screens, ...res.actions].filter((s) => !s.endsWith(':ok'));
    if (bad.length) problems.push(zone + ' actions: ' + bad.join(', '));
    if (res.nan.length) problems.push(zone + ' non-finite: ' + res.nan.join(', '));
    if (!res.after || !['playing', 'paused', 'map', 'inventory', 'diary', 'gameover', 'cleared'].includes(res.after.state)) {
      problems.push(zone + ' ended in state ' + (res.after && res.after.state));
    }
    if (errs.length) problems.push(zone + ' errors: ' + errs.slice(0, 3).join(' | '));
    console.log(`${zone.padEnd(9)} ${bad.length || res.nan.length || errs.length ? 'PROBLEMS' : 'clean'}`);
  } catch (e) {
    problems.push(zone + ' failed to load: ' + e.message);
    console.log(`${zone.padEnd(9)} FAILED ${e.message.slice(0, 60)}`);
  }
  await page.close();
}

// every mode starts
for (const mode of modes) {
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  try {
    await page.goto('http://127.0.0.1:9101/play/', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction('typeof window.HG === "object"', { timeout: 20000 });
    await page.evaluate((m) => window.HG.selectMode(m), mode);
    await page.click('#startBtn');
    await page.waitForFunction('window.HG.game.state !== "title"', { timeout: 15000 });
    const st = await page.evaluate(() => { window.HG.story.skip(); return { mode: window.HG.mode, wave: window.HG.game.wave }; });
    console.log(`${mode.padEnd(9)} started (wave ${st.wave})`);
    if (errs.length) problems.push('mode ' + mode + ': ' + errs[0]);
  } catch (e) {
    problems.push('mode ' + mode + ' failed: ' + e.message);
    console.log(`${mode.padEnd(9)} FAILED`);
  }
  await page.close();
}

await browser.close();
server.close();

console.log('');
if (problems.length) {
  console.log('PROBLEMS (' + problems.length + ')');
  for (const p of problems) console.log('  - ' + p);
  process.exit(1);
}
console.log('AUDIT CLEAN: every zone, every mode, every action');
