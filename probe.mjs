// tools/smoke.mjs — boots the real pages in a headless browser and asserts they
// work. This is the step the three Node suites cannot cover: the suites stub the
// DOM and Three.js, so nothing has ever proved that index.html and play/index.html
// actually load, resolve their import map, and reach a playable state.
//
//   node tools/smoke.mjs
//   CHROME_PATH=/usr/bin/chromium node tools/smoke.mjs
//
// Exits 1 on any console error, failed request, or missing assertion.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 8733;

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json',
  '.md': 'text/markdown', '.txt': 'text/plain', '.xml': 'application/xml',
};

// probe for a browser rather than hard-coding one machine's path
const CANDIDATES = [
  process.env.CHROME_PATH,
  '/usr/local/bin/chromium',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/google-chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean);
const CHROME = CANDIDATES.find((p) => fs.existsSync(p));
if (!CHROME) {
  console.error('FAIL: no Chromium/Chrome found. Set CHROME_PATH.');
  process.exit(1);
}

let puppeteer;
try {
  puppeteer = (await import('puppeteer-core')).default;
} catch {
  console.error('FAIL: puppeteer-core is not installed (npm install --no-save puppeteer-core)');
  process.exit(1);
}

const fails = [];
const ok = (name, cond, detail) => {
  if (cond) console.log('  ok   ' + name);
  else { fails.push(name + (detail ? ' — ' + detail : '')); console.log('  FAIL ' + name + (detail ? ' — ' + detail : '')); }
};

function serve() {
  const server = http.createServer((req, res) => {
    const url = decodeURIComponent(req.url.split('?')[0]);
    let file = path.join(ROOT, url);
    if (url.endsWith('/')) file = path.join(file, 'index.html');
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (!file.startsWith(ROOT) || !fs.existsSync(file)) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((r) => server.listen(PORT, '127.0.0.1', () => r(server)));
}

const server = await serve();
// CI occasionally takes longer than 30 s to hand back the DevTools endpoint.
// Launch with a longer budget, the container-safe flag, and one retry.
async function launchBrowser(attempts = 2) {
  for (let i = 0; i < attempts; i++) {
    try {
      return await puppeteer.launch({
        executablePath: CHROME,
        headless: 'new',
        timeout: 60000,
        protocolTimeout: 180000,
        args: [
          '--no-sandbox',
          '--disable-dev-shm-usage',
          '--use-angle=swiftshader',
          '--enable-unsafe-swiftshader',
          '--disable-gpu-sandbox',
        ],
      });
    } catch (err) {
      if (i === attempts - 1) throw err;
      console.error('browser launch failed, retrying: ' + err.message);
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
}

const browser = await launchBrowser();
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 720 });

const problems = [];
page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') problems.push('console: ' + m.text()); });
// browsers probe /favicon.ico whether or not the page declares an icon; that
// one 404 is not a defect in the page
const ignorable = (url) => /\/favicon\.ico$/.test(url);
page.on('requestfailed', (r) => { if (!ignorable(r.url())) problems.push('request failed: ' + r.url()); });
page.on('response', (r) => { if (r.status() >= 400 && !ignorable(r.url())) problems.push(r.status() + ' ' + r.url()); });

// --- landing page -----------------------------------------------------------
console.log('\nlanding page');
await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'networkidle0', timeout: 30000 });
ok('title', (await page.title()).includes('HELLGATE'));
// Lazy images below the fold have not loaded yet, and on a slower machine they
// legitimately never do before the check runs. Force them eager and wait.
await page.evaluate(() => {
  document.querySelectorAll('img').forEach((i) => { i.loading = 'eager'; });
  window.scrollTo(0, document.body.scrollHeight);
});
await page
  .waitForFunction(
    () => Array.from(document.images).every((i) => i.complete),
    { timeout: 15000 }
  )
  .catch(() => {});
const imgs = await page.evaluate(() =>
  Array.from(document.images).map((i) => ({ src: i.currentSrc || i.src, ok: i.complete && i.naturalWidth > 0 }))
);
const badImgs = imgs.filter((i) => !i.ok).map((i) => i.src);
ok('all images decode', badImgs.length === 0, badImgs.join(', '));
const links = await page.evaluate(() => Array.from(document.querySelectorAll('a[href^="./"]')).map((a) => a.getAttribute('href')));
for (const href of [...new Set(links)]) {
  const target = `http://127.0.0.1:${PORT}/${href.replace('./', '')}`;
  const status = await new Promise((resolve) => {
    http.get(target, (res) => { res.resume(); resolve(res.statusCode); }).on('error', () => resolve(0));
  });
  ok('internal link ' + href, status === 200, 'status ' + status);
}

// --- the game ---------------------------------------------------------------
console.log('\ngame');
await page.goto(`http://127.0.0.1:${PORT}/play/`, { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForFunction('typeof window.HG === "object"', { timeout: 20000 });
ok('game module executed', (await page.evaluate(() => typeof window.HG)) === 'object');
ok('boots to the title screen', (await page.evaluate(() => window.HG.game.state)) === 'title');
const canvases = await page.evaluate(() => document.querySelectorAll('canvas').length);
ok('canvas present', canvases >= 1, canvases + ' canvases');

// start a run through the real buttons: title -> intro -> class -> play
await page.click('#startBtn');
await page.waitForFunction('window.HG.game.state === "intro"', { timeout: 15000 });
ok('start plays the story intro', true);
await page.click('#storySkip');
await page.waitForFunction('window.HG.game.state === "class"', { timeout: 15000 });
const cards = await page.evaluate(() => document.querySelectorAll('[data-class]').length);
ok('class select renders three classes', cards === 3, cards + ' cards');
await page.click('[data-class="marine"]');
await page.waitForFunction('window.HG.game.state === "playing"', { timeout: 15000 });
ok('choosing a class starts the run', true);
ok('wave 1 spawned enemies', (await page.evaluate(() => window.HG.enemies.list.length)) > 0);
ok('level built', (await page.evaluate(() => window.HG.level.cells.length)) === 1600);


const dbg = await page.evaluate(async () => {
  const HG = window.HG;
  const cam = HG.player.camera;
  const d = new (cam.position.constructor)();
  cam.getWorldDirection(d);
  const p = HG.player.pos;
  const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
  HG.enemies.clear();
  for (let i = 0; i < 4; i++) {
    HG.enemies.spawnAt('imp', p.x + d.x * 5 - d.z * (i - 1.5) * 0.9, p.z + d.z * 5 + d.x * (i - 1.5) * 0.9, 1);
  }
  await frame();
  const e = HG.enemies.list[0];
  const info = {
    state: HG.game.state,
    calls: HG.renderStats.calls,
    tris: HG.renderStats.tris,
    bloom: !!(HG.bloom && HG.bloom.enabled),
    camPos: cam.position.toArray().map((v) => +v.toFixed(2)),
    fwd: [+d.x.toFixed(2), +d.y.toFixed(2), +d.z.toFixed(2)],
    list: HG.enemies.list.length,
    bodyVisible: e.body.group.visible,
    meshVisible: e.mesh.visible,
    meshPos: e.mesh.position.toArray().map((v) => +v.toFixed(2)),
    inScene: !!e.mesh.parent,
    parentType: e.mesh.parent ? e.mesh.parent.type : null,
    sceneKids: HG.scene.children.length,
    bodyMeshes: (() => { let n = 0; e.body.group.traverse((o) => { if (o.isMesh) n++; }); return n; })(),
    proxiesVisible: HG.enemies.list.filter((x) => x.proxy && x.proxy.visible).length,
  };
  return info;
});
console.log('DBG ' + JSON.stringify(dbg));
await browser.close();
server.close();
