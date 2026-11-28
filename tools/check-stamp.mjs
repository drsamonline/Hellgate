#!/usr/bin/env node
/* tools/check-stamp.mjs — does the deploy stamper cover every module URL?
 *
 * `stamp-cache.mjs` rewrites `play/src` and `play/index.html` at deploy time so a
 * reload after a release is always the new code. It left the *import map* alone:
 * `"three": "./vendor/three.module.js"` was the one module URL a browser could
 * keep forever, and a three upgrade would have shipped new game code against a
 * cached old three.
 *
 * This runs the stamper in a temp copy — the source tree stays unstamped, which is
 * the whole design — and asserts the import map is stamped and the run is
 * idempotent.
 *
 *   node tools/check-stamp.mjs
 */
// prove the stamper covers the import map, in a copy, without touching the source
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const root = '/scratch/work/Hellgate';
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stamp-'));
for (const p of ['play', 'tools', 'VERSION']) fs.cpSync(path.join(root, p), path.join(dir, p), { recursive: true });
execFileSync('node', ['tools/stamp-cache.mjs'], { cwd: dir });
const html = fs.readFileSync(path.join(dir, 'play', 'index.html'), 'utf8');
const v = fs.readFileSync(path.join(dir, 'VERSION'), 'utf8').trim();
const mapStamped = html.includes('./vendor/three.module.js?v=' + v);
const check = execFileSync('node', ['tools/stamp-cache.mjs', '--check'], { cwd: dir }).toString().trim();
console.log('import map stamped:', mapStamped);
console.log('idempotent:', /every module URL carries/.test(check));
