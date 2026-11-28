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
import { fileURLToPath } from 'node:url';
// derived from the file, never hard-coded: a tool that only runs in the sandbox it
// was written in is a note to self (the same mistake as the Chromium path, 2.66.1)
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stamp-'));
for (const p of ['play', 'tools', 'VERSION']) fs.cpSync(path.join(root, p), path.join(dir, p), { recursive: true });
execFileSync('node', ['tools/stamp-cache.mjs'], { cwd: dir });
const html = fs.readFileSync(path.join(dir, 'play', 'index.html'), 'utf8');
const v = fs.readFileSync(path.join(dir, 'VERSION'), 'utf8').trim();
const mapStamped = html.includes('./vendor/three.module.js?v=' + v);
const check = execFileSync('node', ['tools/stamp-cache.mjs', '--check'], { cwd: dir }).toString().trim();
// and no tool may hard-code a path from the machine it was written on: this check
// itself shipped with '/scratch/work/Hellgate' and failed on the runner
const hardCoded = [];
for (const f of fs.readdirSync(path.join(root, 'tools'))) {
  if (!/\.(mjs|js)$/.test(f)) continue;
  // comments may name the path — this file's own header does, to explain the bug
  const text = fs.readFileSync(path.join(root, 'tools', f), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
  if (/['"`]\/(scratch|home|Users)\//.test(text)) hardCoded.push(f);
}
console.log('import map stamped:', mapStamped);
console.log('idempotent:', /every module URL carries/.test(check));
console.log('no tool hard-codes a sandbox path:', hardCoded.length === 0, hardCoded.join(', '));
process.exit(mapStamped && /every module URL carries/.test(check) && hardCoded.length === 0 ? 0 : 1);
