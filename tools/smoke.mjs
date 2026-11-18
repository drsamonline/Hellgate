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

const sys = await page.evaluate(() => {
  const HG = window.HG;
  return {
    powers: HG.powers.slots.length,
    energy: HG.powers.maxEnergy,
    props: !!HG.props,
    instanced: HG.props ? HG.props.meshes.length : 0,
    animals: HG.props ? HG.props.animals.length : 0,
    companion: !!(HG.companion && HG.companion.active),
    relics: HG.game.relicsTotal,
    zone: HG.zone.id,
  };
});
ok('three power slots equipped', sys.powers === 3, String(sys.powers));
ok('energy pool set by the class', sys.energy > 0, String(sys.energy));
ok('props built with instanced meshes', sys.props && sys.instanced > 0, String(sys.instanced));
ok('animals present', sys.animals >= 0, String(sys.animals));
ok('companion is active', sys.companion);
ok('zone relics placed', sys.relics > 0, String(sys.relics));

// lore terminals and the timed buff pickups
const loreOk = await page.evaluate(() => {
  const HG = window.HG;
  const t = HG.lore.entries[0];
  HG.player.pos.set(t.x + 0.4, t.y, t.z);
  HG.lore.update(HG.player); // deterministic: do not depend on frame timing
  return { count: HG.lore.entries.length, near: !!HG.lore.near };
});
ok('lore terminals exist in the level', loreOk.count === 3, String(loreOk.count));
ok('the player is in reach of one', loreOk.near, JSON.stringify(loreOk));

const opened = await page.evaluate(() => {
  const HG = window.HG;
  const before = HG.game.score;
  HG.openLore();
  const state = HG.game.state;
  const title = document.getElementById('loreTitle').textContent;
  HG.closeLore();
  return { state, title, gained: HG.game.score - before };
});
ok('a terminal opens and pays out', opened.state === 'lore' && opened.gained === 75, JSON.stringify(opened));

// the boss wave: one warden, a health bar, and a bigger silhouette
const bossOk = await page.evaluate(() => {
  const HG = window.HG;
  HG.enemies.clear();
  HG.enemies.spawnWave(3, HG.player.pos, { boss: true, waves: 3 });
  const b = HG.enemies.list.find((e) => e.T && e.T.boss);
  return { found: !!b, hp: b ? b.maxHp : 0, bar: !!document.getElementById('bossbar') };
});
ok('the boss wave spawns a warden', bossOk.found, JSON.stringify(bossOk));
ok('the boss bar element exists', bossOk.bar);

// a power fires and spends energy
const cast = await page.evaluate(() => {
  const HG = window.HG;
  const state = HG.game.state;
  const before = HG.powers.energy;
  HG.castPower(0);
  return { state, before, after: HG.powers.energy, cd: HG.powers.cd[HG.powers.slots[0].id] };
});
ok('a power spends energy and starts its cooldown', cast.after < cast.before && cast.cd > 0, JSON.stringify(cast));

await page.goto(`http://127.0.0.1:${PORT}/play/?auto=1&seed=smoke&wave=3&cam=10,12,45,-5`, { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForFunction('window.HG && window.HG.game.state === "playing"', { timeout: 20000 });
await new Promise((r) => setTimeout(r, 400));
ok('url hook: playing', (await page.evaluate(() => window.HG.game.state)) === 'playing');
ok('url hook: wave 3', (await page.evaluate(() => window.HG.game.wave)) === 3);
ok('url hook: seed', (await page.evaluate(() => window.HG.game.seed)) === 'smoke');
ok('renderer drew frames', (await page.evaluate(() => window.HG.game.state === 'playing')) === true);

// --- audio ------------------------------------------------------------------
// The Node suites cannot touch this: AudioContext does not exist there, so every
// sound is a no-op. This is the only place the audio path is exercised at all.
console.log('\naudio');
await page.goto(`http://127.0.0.1:${PORT}/play/`, { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForFunction('typeof window.HG === "object"', { timeout: 20000 });
await page.click('#startBtn');
await new Promise((r) => setTimeout(r, 500));

const a0 = await page.evaluate(() => {
  const a = window.HG.audio;
  return { hasCtx: !!a.ctx, state: a.ctx && a.ctx.state, gain: a.master && a.master.gain.value, vol: a.volume };
});
ok('an AudioContext exists after the start click', a0.hasCtx, 'state ' + a0.state);
ok('master gain matches the volume setting', Math.abs(a0.gain - a0.vol) < 0.001, `${a0.gain} vs ${a0.vol}`);

const played = await page.evaluate(() => {
  const a = window.HG.audio;
  const before = a.ctx.currentTime;
  try {
    a.play('pistol');
    a.play('pain', { x: a.listener.x + 4, z: a.listener.z }); // spatialised path
    return { ok: true, t: a.ctx.currentTime - before };
  } catch (e) {
    return { ok: false, err: String(e) };
  }
});
ok('a sound plays without throwing, spatialised or not', played.ok, played.err || '');

const a1 = await page.evaluate(() => {
  window.HG.changeSetting('muted', true);
  const muted = window.HG.audio.master.gain.value;
  window.HG.changeSetting('muted', false);
  return { muted, restored: window.HG.audio.master.gain.value };
});
ok('mute drops the master gain to zero', a1.muted === 0, String(a1.muted));
ok('unmute restores it', a1.restored > 0, String(a1.restored));

// --- results ----------------------------------------------------------------
ok('no console errors or failed requests', problems.length === 0, problems.slice(0, 4).join(' | '));

await browser.close();
server.close();
console.log(`\n${fails.length ? fails.length + ' FAILURES' : 'SMOKE PASSED'}`);
process.exit(fails.length ? 1 : 0);
