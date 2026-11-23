import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
const ROOT = '/scratch/work/repo', PORT = 8851;
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
const browser = await puppeteer.launch({ executablePath: '/usr/local/bin/chromium', args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage'] });
const page = await browser.newPage();
await page.setViewport({ width: 1000, height: 620 });
page.on('pageerror', (e) => console.log('pageerror', e.message));
await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'networkidle0', timeout: 40000 });
await page.goto(`http://127.0.0.1:${PORT}/play/`, { waitUntil: 'domcontentloaded', timeout: 40000 });
await page.waitForFunction('typeof window.HG === "object"', { timeout: 25000 });
await page.click('#startBtn');
await page.waitForFunction('window.HG.game.state === "intro"', { timeout: 15000 });
await page.click('#storySkip');
await page.waitForFunction('window.HG.game.state === "class"', { timeout: 15000 });
await page.click('[data-class="marine"]');
await page.waitForFunction('window.HG.game.state === "playing"', { timeout: 15000 });

const keys = ['Tab', 'KeyJ', 'KeyC', 'KeyM', 'KeyN', 'Digit1', 'Digit2', 'Digit3', 'Digit4', 'KeyQ', 'KeyE', 'KeyR', 'KeyX', 'KeyV', 'KeyG', 'KeyF', 'Space'];
const out = [];
for (const code of keys) {
  const r = await page.evaluate(async (c) => {
    const HG = window.HG;
    if (HG.game.state !== 'playing') { HG.game.state = 'playing'; HG.hideScreens(); }
    const before = { state: HG.game.state, weapon: HG.weapons.current ? HG.weapons.current.id : null, energy: HG.powers.energy, muted: HG.settings.muted };
    const on = () => Array.from(document.querySelectorAll('.screen')).filter((e) => e.classList.contains('on')).map((e) => e.id);
    const screensBefore = on();
    document.dispatchEvent(new KeyboardEvent('keydown', { code: c, bubbles: true }));
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
    const after = { state: HG.game.state, weapon: HG.weapons.current ? HG.weapons.current.id : null, energy: HG.powers.energy, muted: HG.settings.muted };
    const screensAfter = on();
    const changed = JSON.stringify(before) !== JSON.stringify(after) || JSON.stringify(screensBefore) !== JSON.stringify(screensAfter);
    return { code: c, changed, screensAfter, state: after.state };
  }, code);
  out.push(r);
  await page.evaluate(() => { window.HG.game.state = 'playing'; window.HG.hideScreens(); });
}
console.log('KEYS ' + JSON.stringify(out.filter((r) => !r.changed).map((r) => r.code)));
console.log('SCREENS ' + JSON.stringify(out.map((r) => r.code + ':' + r.screensAfter.join('|')).filter((x) => x.includes('|'))));
await browser.close(); server.close();
