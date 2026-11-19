#!/usr/bin/env node
/* tools/check-pages.mjs — PAGES.json is a promise; this holds it.
 *
 * Adopted from neon-engine/tests/pages.cjs. Reads PAGES.json and asserts that
 * the landing page, the app entry and every protected path still exist, so a
 * rename cannot quietly 404 the live site.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const file = path.join(ROOT, 'PAGES.json');

if (!fs.existsSync(file)) {
  console.log('no PAGES.json: nothing to guard');
  process.exit(0);
}

let cfg;
try {
  cfg = JSON.parse(fs.readFileSync(file, 'utf8'));
} catch (e) {
  console.log('FAIL: PAGES.json is not valid JSON — ' + e.message);
  process.exit(1);
}

const must = [];
if (cfg.landing) must.push(cfg.landing);
if (cfg.app) must.push(cfg.app);
for (const p of cfg.protected || cfg.protectedPaths || []) must.push(p);

const missing = must.filter((p) => !fs.existsSync(path.join(ROOT, p)));
console.log(`PAGES.json: ${must.length} path(s) declared, source ${JSON.stringify(cfg.source || "unset")}`);
if (missing.length) {
  console.log('FAIL: declared but missing — ' + missing.join(', '));
  process.exit(1);
}
console.log('every declared path exists');
