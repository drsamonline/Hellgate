import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';
// derived from the file, never hard-coded: this tool pointed at a path that only
// existed on the machine it was written on, which is one reason it never ran in CI
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 8851;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  let f = path.join(ROOT, url);
  if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
  if (!fs.existsSync(f)) { res.writeHead(404); res.end('x'); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(PORT, r));
// CHROME_PATH first, then the usual places: this was hard-coded to this machine's
// Chromium and threw "Browser was not found" on the runner the first time it ran
// there. The third tool to make that mistake.
const CHROME = process.env.CHROME_PATH
  || ['/usr/local/bin/chromium', '/usr/bin/chromium', '/usr/bin/google-chrome'].find((p) => fs.existsSync(p));
const browser = await puppeteer.launch({ executablePath: CHROME, args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage'] });
const page = await browser.newPage();
await page.setViewport({ width: 1000, height: 620 });
page.on('pageerror', (e) => console.log('pageerror', e.message));
await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'networkidle0', timeout: 40000 });
await page.goto(`http://127.0.0.1:${PORT}/play/`, { waitUntil: 'domcontentloaded', timeout: 40000 });
// a slow software renderer takes longer than 25 s to boot the game: this timed
// out on every run under SwiftShader and passed only on a real GPU
await page.waitForFunction('typeof window.HG === "object"', { timeout: 90000 });
await page.click('#startBtn');
await page.waitForFunction('window.HG.game.state === "intro"', { timeout: 15000 });
await page.click('#storySkip');
await page.waitForFunction('window.HG.game.state === "class"', { timeout: 15000 });
await page.click('[data-class="marine"]');
await page.evaluate(() => { if (window.HG.dialogue && window.HG.dialogue.playing) window.HG.dialogue.skip(); });
await page.waitForFunction('window.HG.game.state === "playing"', { timeout: 15000 });

const keys = ['Tab', 'KeyJ', 'KeyC', 'KeyM', 'KeyN', 'Digit1', 'Digit2', 'Digit3', 'Digit4', 'KeyQ', 'KeyE', 'KeyR', 'KeyX', 'KeyV', 'KeyG', 'KeyF', 'Space'];
const problems = [];
const out = [];
for (const code of keys) {
  const r = await page.evaluate(async (c) => {
    const HG = window.HG;
    if (HG.game.state !== 'playing') { HG.game.state = 'playing'; HG.hideScreens(); }
    // `weapons.current` is an INDEX, not an object: reading `.id` off it made every
    // slot key look dead, which is how Digit3 and Digit4 were reported as broken
    const snap = () => ({
      state: HG.game.state,
      weapon: HG.weapons.current,
      energy: Math.round(HG.powers.energy * 1000) / 1000,
      muted: HG.settings.muted,
      screens: Array.from(document.querySelectorAll('.screen')).filter((e) => e.classList.contains('on')).map((e) => e.id).join(','),
    });
    const before = snap();
    document.dispatchEvent(new KeyboardEvent('keydown', { code: c, bubbles: true }));
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
    const after = snap();
    return { code: c, before, after, changed: JSON.stringify(before) !== JSON.stringify(after) };
  }, code);
  out.push(r);
  if (!r.changed) problems.push('the key ' + code + ' does nothing');
  await page.evaluate(() => { window.HG.game.state = 'playing'; window.HG.hideScreens(); });
}

// the panels: each key opens one, Escape closes it
// KeyN is mute, not a panel: the first version of this map guessed and reported a
// working key as broken
const panels = { Tab: 'inventory', KeyJ: 'diary', KeyC: 'codex', KeyM: 'map' };
for (const [code, want] of Object.entries(panels)) {
  await page.evaluate(() => { window.HG.game.state = 'playing'; window.HG.hideScreens(); });
  await page.evaluate((c) => document.dispatchEvent(new KeyboardEvent('keydown', { code: c, bubbles: true })), code);
  await new Promise((r) => setTimeout(r, 250));
  const opened = await page.evaluate(() => Array.from(document.querySelectorAll('.screen')).filter((e) => e.classList.contains('on')).map((e) => e.id));
  if (!opened.length) problems.push(code + ' opened no screen (expected ' + want + ')');
  await page.evaluate(() => document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', bubbles: true })));
  await new Promise((r) => setTimeout(r, 250));
  const still = await page.evaluate(() => Array.from(document.querySelectorAll('.screen')).filter((e) => e.classList.contains('on')).length);
  if (still) problems.push(code + ': Escape did not close the screen');
}
await page.evaluate(() => { window.HG.game.state = 'playing'; window.HG.hideScreens(); });

console.log('keys: ' + out.length + ', screens: ' + Object.keys(panels).length);
for (const r of out) {
  console.log('  ' + r.code.padEnd(7) + (r.changed ? 'ok' : 'DEAD') + '  ' +
    'weapon ' + r.before.weapon + '->' + r.after.weapon +
    (r.after.screens ? '  screen ' + r.after.screens : ''));
}
if (problems.length) {
  console.log('\nPROBLEMS (' + problems.length + ')');
  for (const p of problems) console.log('  - ' + p);
} else {
  console.log('\nCONTROLS CLEAN: every key does something, every panel opens and closes');
}
await browser.close(); server.close();
process.exit(problems.length ? 1 : 0);
