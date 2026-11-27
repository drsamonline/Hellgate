#!/usr/bin/env node
/* tools/audit-flow.mjs — walk the whole game through its real UI and report
 * anything that throws, any screen that fails to appear, and any screen a player
 * cannot leave.
 *
 * The suites test functions; audit-run tests zones and modes; this tests the
 * journey: title -> intro -> class -> play -> every panel -> cleared -> death.
 *
 *   node tools/audit-flow.mjs
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
await new Promise((r) => server.listen(9301, '127.0.0.1', r));

const browser = await puppeteer.launch({
  executablePath: '/usr/local/bin/chromium',
  headless: 'new',
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage'],
  timeout: 60000,
});
const page = await browser.newPage();
const problems = [];
const seen = [];
page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') problems.push('console: ' + m.text()); });
await page.setViewport({ width: 1024, height: 700 });

const step = async (name, fn) => {
  try { await fn(); seen.push(name); } catch (e) { problems.push(name + ': ' + e.message); }
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

await step('title loads', async () => {
  await page.goto('http://127.0.0.1:9301/play/?seed=flow', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction('typeof window.HG === "object"', { timeout: 20000 });
  const on = await page.evaluate(() => document.getElementById('title').classList.contains('on'));
  if (!on) throw new Error('the title screen is not shown');
});

await step('start to intro', async () => {
  await page.click('#startBtn');
  await page.waitForFunction('window.HG.game.state === "intro"', { timeout: 15000 });
});

await step('intro to class', async () => {
  await page.click('#storySkip');
  await page.waitForFunction('window.HG.game.state === "class"', { timeout: 15000 });
});

await step('class to playing', async () => {
  await page.click('[data-class="marine"]');
await page.evaluate(() => { if (window.HG.dialogue && window.HG.dialogue.playing) window.HG.dialogue.skip(); });
  await page.waitForFunction('window.HG.game.state === "playing"', { timeout: 15000 });
  await wait(400);
});

for (const [name, open, close] of [
  ['journal', 'showDiary', 'closeDiary'],
  ['inventory', 'toggleInventory', 'toggleInventory'],
  ['codex', 'showCodex', 'closeCodex'],
  ['map', 'showZoneMap', null],
]) {
  // a fresh page per panel: the panels are independent, and accumulating WebGL
  // state across six screen switches crashed the software rasteriser
  await page.goto('http://127.0.0.1:9301/play/?auto=1&seed=flow', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction('window.HG && window.HG.game.state === "playing"', { timeout: 20000 });
  await step('panel: ' + name, async () => {
    await page.evaluate((f) => window.HG[f](), open);
    await wait(150);
    const st = await page.evaluate(() => window.HG.game.state);
    if (st === 'playing') throw new Error(name + ' did not change the state');
    if (close) await page.evaluate((f) => { if (window.HG[f]) window.HG[f](); }, close);
    else await page.click('#mapBack');
    await wait(180);
    const after = await page.evaluate(() => window.HG.game.state);
    if (after !== 'playing') throw new Error(name + ' did not close back to playing (' + after + ')');
  });
}

await step('the map key does not mute', async () => {
  await page.evaluate(() => { window.HG.game.state = 'playing'; window.HG.hideScreens(); });
  await page.keyboard.press('m');
  await wait(150);
  const muted = await page.evaluate(() => !!window.HG.settings.muted);
  if (muted) throw new Error('pressing M muted the game; M is the map');
  await page.evaluate(() => { window.HG.game.state = 'playing'; window.HG.hideScreens(); });
});

await step('pause and resume', async () => {
  await page.evaluate(() => window.HG.pauseGame());
  await wait(120);
  if (await page.evaluate(() => window.HG.game.state) !== 'paused') throw new Error('pause did not pause');
  await page.evaluate(() => window.HG.resumeGame());
  await wait(120);
  if (await page.evaluate(() => window.HG.game.state) !== 'playing') throw new Error('resume did not resume');
});

await step('copy report', async () => {
  const rep = await page.evaluate(() => window.HG.buildReport());
  // the build number is not 1.x any more: this asserted /build\s+1\./ and had
  // been failing on a stale regex since 2.0.0
  const build = await page.evaluate(() => window.HG.BUILD || window.HG.build || '');
  if (!/build\s+\d+\.\d+\.\d+/.test(rep)) throw new Error('the report has no build line');
  if (build && !rep.includes(build)) throw new Error('the report does not carry this build (' + build + ')');
});

await step('cleared, choice, upgrade, map', async () => {
  await page.evaluate(() => window.HG.zoneCleared());
  await page.waitForFunction('window.HG.game.state === "cleared"', { timeout: 10000 });
  // the panel arrives after the camera's walk back across the room, so this waits
  // for it: asserting on the frame zoneCleared() returns read an empty panel
  await page.waitForFunction(
    'document.querySelectorAll("#upgradeCards [data-choice]").length === 2'
    + ' || document.querySelectorAll("#upgradeCards [data-up]").length > 0',
    { timeout: 15000 });
  const cards = await page.evaluate(() => document.querySelectorAll('#upgradeCards [data-choice]').length);
  if (cards !== 2) throw new Error('the cleared screen offered ' + cards + ' choices, not 2');
  await page.evaluate(() => document.querySelector('#upgradeCards [data-choice]').click());
  await wait(200);
  const ups = await page.evaluate(() => document.querySelectorAll('#upgradeCards [data-up]').length);
  if (ups < 1) throw new Error('no upgrades after the choice');
  await page.evaluate(() => document.querySelector('#upgradeCards [data-up]').click());
  await wait(250);
  const st = await page.evaluate(() => window.HG.game.state);
  if (st !== 'map') throw new Error('the upgrade did not lead to the map (' + st + ')');
  await page.click('#mapBack');
  await wait(200);
  const back = await page.evaluate(() => window.HG.game.state);
  if (back !== 'cleared' && back !== 'playing') throw new Error('Back from the map landed in ' + back);
});

await step('death and the game over screen', async () => {
  await page.evaluate(() => {
    const HG = window.HG;
    HG.game.state = 'playing';
    HG.hideScreens();
    HG.player.health = 0.5;
    HG.player.damage(999, { x: 0, y: 0, z: 0 });
  });
  await page.waitForFunction('window.HG.game.state === "dead"', { timeout: 10000 });
  const btn = await page.evaluate(() => document.querySelectorAll('#gameover button').length);
  if (!btn) throw new Error('the game over screen has no button');
});

await browser.close();
server.close();

console.log('steps: ' + seen.length);
if (problems.length) {
  console.log('\nPROBLEMS (' + problems.length + ')');
  for (const p of problems) console.log('  - ' + p);
  process.exit(1);
}
console.log('FLOW CLEAN: ' + seen.join(' -> '));
