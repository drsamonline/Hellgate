#!/usr/bin/env node
/* tools/check-assets.mjs — every local file a page in docs/ points at exists.
 *
 * check-links.mjs skips docs/ because those pages are a deploy artefact, but a
 * deploy artefact with six 404s is exactly what a visitor sees first: the
 * landing page shipped for months with `assets/*.webp` that were never created,
 * and no gate looked.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DOCS = path.join(ROOT, 'docs');
const ATTR = /(?:src|href)="([^"]+)"/g;
const SKIP = /^(https?:|data:|mailto:|#|\/)/;

let pages = 0;
let refs = 0;
const missing = [];
const walk = (dir) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith('.html')) check(p);
  }
};
const check = (file) => {
  pages++;
  const html = fs.readFileSync(file, 'utf8');
  for (const m of html.matchAll(ATTR)) {
    const ref = m[1].trim();
    if (!ref || SKIP.test(ref)) continue;
    const clean = ref.split('?')[0].split('#')[0];
    refs++;
    const target = path.resolve(path.dirname(file), clean);
    if (!fs.existsSync(target)) missing.push(path.relative(ROOT, file) + ' -> ' + ref);
  }
};
if (fs.existsSync(DOCS)) walk(DOCS);

if (missing.length) {
  console.log('FAIL ' + missing.length + ' missing asset(s) in ' + pages + ' page(s):');
  for (const m of missing) console.log('  ' + m);
  process.exit(1);
}
console.log('ok ' + refs + ' local reference(s) across ' + pages + ' page(s) all resolve');
