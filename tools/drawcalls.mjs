#!/usr/bin/env node
/* tools/drawcalls.mjs — how many draw calls a frame of each level costs.
 *
 * The one performance number nobody had measured. It has to be measured in a
 * browser: the three.js double the suites use has no renderer, so a headless
 * count of the scene graph answers zero for every level and looks like a pass.
 *
 *   node tools/drawcalls.mjs            # all 32 levels, worst six
 *   node tools/drawcalls.mjs 17         # one level
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// Measured on 2.64.0 against the scene the game actually renders: median 131
// draw calls, worst 170 (level 9), with twenty bodies on the floor. The level
// geometry is merged, so the count is bodies and props, not quads.
//
// The numbers before 2.64.0 (median 90, worst 122) were measured against the
// WRONG SCENE: `window.HG.scene` was a snapshot taken at module load, so every
// measurement until 2.61.0's live getter was of a scene nobody renders — 77 calls
// against the real 170 on level 9. The budget was set against those numbers and
// 200 is only 18% above the real worst, not the 70% the old comment claimed.
const BUDGET = 200;

const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp',
  '.json': 'application/json', '.ico': 'image/x-icon',
};
const serve = () => new Promise((resolve) => {
  const srv = http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split('?')[0]);
    if (p.endsWith('/')) p += 'index.html';
    const f = path.join(ROOT, p);
    if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('nope'); }
    res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' });
    fs.createReadStream(f).pipe(res);
  });
  srv.listen(0, () => resolve(srv));
});

const { default: puppeteer } = await import('puppeteer-core');
const srv = await serve();
const port = srv.address().port;
const exe = process.env.CHROME_PATH
  || ['/usr/local/bin/chromium', '/usr/bin/chromium', '/usr/bin/google-chrome'].find((p) => fs.existsSync(p));
if (!exe) {
  console.error('no chrome; set CHROME_PATH');
  process.exit(2);
}
const browser = await puppeteer.launch({
  executablePath: exe,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 720 });
await page.goto(`http://127.0.0.1:${port}/play/?auto=1&level=1`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction('window.HG && window.HG.game.state === "playing"', { timeout: 90000 });

const measure = (levels) => page.evaluate((list) => {
  const HG = window.HG;
  const out = [];
  for (const n of list) {
    HG.beginLevel(n, true);
    HG.story.skip();
    HG.chooseClass('marine');
    HG.dialogue.skip();
    HG.cinematic.skip();
    HG.game.state = 'playing';
    HG.enemies.clear();
    const cells = HG.level.reachableCells.filter((c) => c.room >= 0 && c.room !== HG.level.spawnRoom);
    for (let i = 0; i < 20 && i < cells.length; i++) {
      const c = cells[Math.floor((i / 20) * cells.length)];
      HG.enemies.spawnAt('imp', c.wx, c.wz, 1);
    }
    for (let i = 0; i < 3; i++) HG.update(1 / 60);
    // one frame, then read what the renderer actually issued
    HG.renderer.info.autoReset = false;
    HG.renderer.info.reset();
    HG.renderer.render(HG.scene, HG.camera);
    const calls = HG.renderer.info.render.calls;
    HG.renderer.info.autoReset = true;
    out.push({ n, calls, bodies: HG.enemies.list.length });
  }
  return out;
}, levels);

// and the same count with the co-op peer standing in the room: a second body is
// a second set of draw calls, and nothing had measured one
const peerRows = await page.evaluate(() => {
  const HG = window.HG;
  if (!HG.setCoopWanted) return null;
  HG.setCoopWanted(true);
  HG.beginLevel(9, true);
  HG.story.skip();
  HG.chooseClass('marine');
  HG.dialogue.skip();
  HG.cinematic.skip();
  HG.game.state = 'playing';
  HG.enemies.clear();
  const cells = HG.level.reachableCells.filter((c) => c.room >= 0 && c.room !== HG.level.spawnRoom);
  for (let i = 0; i < 20 && i < cells.length; i++) {
    const c = cells[Math.floor((i / 20) * cells.length)];
    HG.enemies.spawnAt('imp', c.wx, c.wz, 1);
  }
  for (let i = 0; i < 3; i++) HG.update(1 / 60);
  HG.renderer.info.autoReset = false;
  HG.renderer.info.reset();
  HG.renderer.render(HG.scene, HG.camera);
  const calls = HG.renderer.info.render.calls;
  HG.renderer.info.autoReset = true;
  HG.setCoopWanted(false);
  HG.disposeCoop();
  return { calls, peer: !!HG.coop };
});

const arg = process.argv[2];
const rows = await measure(arg ? [Number(arg)] : Array.from({ length: 32 }, (_, i) => i + 1));
await browser.close();
srv.close();

if (arg) {
  const r = rows[0];
  console.log(`level ${r.n}: ${r.calls} draw calls, ${r.bodies} bodies · budget ${BUDGET}`);
  if (peerRows) {
    console.log(`level ${r.n} with a co-op peer: ${peerRows.calls} draw calls`);
    if (peerRows.calls > BUDGET) {
      console.error(`FAIL a co-op peer puts level ${r.n} at ${peerRows.calls}, over the budget of ${BUDGET}`);
      process.exit(1);
    }
  }
  process.exit(r.calls <= BUDGET ? 0 : 1);
}

const sorted = rows.slice().sort((a, b) => b.calls - a.calls);
const over = sorted.filter((r) => r.calls > BUDGET);
const mid = sorted[Math.floor(sorted.length / 2)];
console.log(`draw calls per level, twenty bodies on the floor, budget ${BUDGET}\n`);
console.log('level  calls  bodies');
for (const r of sorted.slice(0, 6)) {
  console.log(String(r.n).padEnd(6) + String(r.calls).padEnd(7) + r.bodies);
}
console.log(`\n  median ${mid.calls} · worst ${sorted[0].calls} (level ${sorted[0].n}) · best ${sorted[sorted.length - 1].calls} (level ${sorted[sorted.length - 1].n})`);
if (over.length) {
  console.log(`\nFAIL ${over.length} level(s) over budget: ${over.map((r) => r.n).join(', ')}`);
  process.exit(1);
}
console.log('ok every level is inside the budget');
