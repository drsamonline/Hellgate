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
const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox'],
});
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
const imgs = await page.evaluate(() => Array.from(document.images).map((i) => [i.currentSrc || i.src, i.naturalWidth]));
ok('all images decode', imgs.every(([, w]) => w > 0), imgs.filter(([, w]) => !w).map(([s]) => s).join(', '));
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

// start a run through the real button, then through the URL hook
await page.click('#startBtn');
await new Promise((r) => setTimeout(r, 700));
ok('starts a run', (await page.evaluate(() => window.HG.game.state)) === 'playing');
ok('wave 1 spawned enemies', (await page.evaluate(() => window.HG.enemies.list.length)) > 0);
ok('level built', (await page.evaluate(() => window.HG.level.cells.length)) === 1600);

await page.goto(`http://127.0.0.1:${PORT}/play/?auto=1&seed=smoke&wave=3&cam=10,12,45,-5`, { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForFunction('window.HG && window.HG.game.state === "playing"', { timeout: 20000 });
await new Promise((r) => setTimeout(r, 400));
ok('url hook: playing', (await page.evaluate(() => window.HG.game.state)) === 'playing');
ok('url hook: wave 3', (await page.evaluate(() => window.HG.game.wave)) === 3);
ok('url hook: seed', (await page.evaluate(() => window.HG.game.seed)) === 'smoke');
ok('renderer drew frames', (await page.evaluate(() => window.HG.game.state === 'playing')) === true);

// --- results ----------------------------------------------------------------
ok('no console errors or failed requests', problems.length === 0, problems.slice(0, 4).join(' | '));

await browser.close();
server.close();
console.log(`\n${fails.length ? fails.length + ' FAILURES' : 'SMOKE PASSED'}`);
process.exit(fails.length ? 1 : 0);
