// tools/lighthouse.mjs — Lighthouse against the local site, mobile and desktop.
//
//   npm install --no-save lighthouse
//   node tools/lighthouse.mjs
//
// Numbers are measured in headless Chromium on a software rasteriser, so paint
// and blocking time read far worse than on real hardware. Compare runs against
// each other, not against a scoreboard.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 8791;

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.json': 'application/json', '.md': 'text/markdown',
  '.xml': 'application/xml', '.txt': 'text/plain',
};

let lighthouse;
try {
  lighthouse = (await import('lighthouse')).default;
} catch {
  console.error('lighthouse is not installed: npm install --no-save lighthouse');
  process.exit(1);
}
const chromeLauncher = await import('chrome-launcher');

const server = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  let file = path.join(ROOT, url);
  if (url.endsWith('/')) file = path.join(file, 'index.html');
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  if (!file.startsWith(ROOT) || !fs.existsSync(file)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(PORT, '127.0.0.1', r));

const chrome = await chromeLauncher.launch({
  chromePath: process.env.CHROME_PATH || '/usr/local/bin/chromium',
  chromeFlags: ['--headless=new', '--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});

const runs = [
  { name: 'landing-mobile', url: `http://127.0.0.1:${PORT}/`, formFactor: 'mobile' },
  { name: 'landing-desktop', url: `http://127.0.0.1:${PORT}/`, formFactor: 'desktop' },
  // performance is meaningless for a WebGL scene on a software rasteriser
  { name: 'game-desktop', url: `http://127.0.0.1:${PORT}/play/`, formFactor: 'desktop', only: ['accessibility', 'best-practices'] },
];

const out = [];
for (const r of runs) {
  const opts = {
    port: chrome.port,
    output: 'json',
    logLevel: 'error',
    onlyCategories: r.only || ['performance', 'accessibility', 'best-practices', 'seo'],
  };
  if (r.formFactor === 'desktop') {
    opts.formFactor = 'desktop';
    opts.screenEmulation = { width: 1350, height: 940, deviceScaleFactor: 1, mobile: false };
  }
  const res = await lighthouse(r.url, opts);
  const c = res.lhr.categories;
  const a = res.lhr.audits;
  out.push({
    name: r.name,
    scores: Object.fromEntries(Object.entries(c).map(([k, v]) => [k, Math.round(v.score * 100)])),
    lcp: a['largest-contentful-paint']?.displayValue || '-',
    cls: a['cumulative-layout-shift']?.displayValue || '-',
    tbt: a['total-blocking-time']?.displayValue || '-',
  });
}

await chrome.kill();
server.close();

for (const r of out) {
  const scores = Object.entries(r.scores).map(([k, v]) => `${k} ${v}`).join(' · ');
  console.log(`${r.name.padEnd(16)} ${scores}  · LCP ${r.lcp} · CLS ${r.cls} · TBT ${r.tbt}`);
}
