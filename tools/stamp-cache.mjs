#!/usr/bin/env node
/* tools/stamp-cache.mjs — put the build version in every module URL.
 *
 * Browsers cache ES modules hard. A player who reloads after a fix can keep
 * running the old file, and from a bug report "it is fixed" and "you are on the
 * old build" look identical. Appending `?v=<version>` to every relative import
 * makes each release a different URL, so a reload is always the new code.
 *
 * It runs in the deploy workflow, not in development: the source stays clean.
 *
 *   node tools/stamp-cache.mjs            # rewrite in place
 *   node tools/stamp-cache.mjs --check    # report what would change, exit 1 if stale
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const check = process.argv.includes('--check');
const version = fs.readFileSync(path.join(ROOT, 'VERSION'), 'utf8').trim();
const tag = '?v=' + version;

const files = [
  path.join(ROOT, 'play', 'index.html'),
  ...fs.readdirSync(path.join(ROOT, 'play', 'src'))
    .filter((f) => f.endsWith('.js'))
    .map((f) => path.join(ROOT, 'play', 'src', f)),
];

// './level.js' or "./level.js", with or without an existing ?v=
const REL = /(from\s+['"])(\.\/[^'"?]+\.js)(\?v=[^'"]*)?(['"])/g;
const SRC = /(src=")(\.\/[^"?]+\.js)(\?v=[^"]*)?(")/g;
// and the import map: `"three": "./vendor/three.module.js"` is a module URL like
// any other, and it was the one URL in the page this tool left alone. A three
// upgrade would have shipped new game code against a cached old three.
const MAP = /("\s*:\s*")(\.\/[^"?]+\.js)(\?v=[^"]*)?(")/g;

let changed = 0;
for (const file of files) {
  const before = fs.readFileSync(file, 'utf8');
  const after = before
    .replace(REL, (_, a, spec, _old, q) => a + spec + tag + q)
    .replace(SRC, (_, a, spec, _old, q) => a + spec + tag + q)
    .replace(MAP, (_, a, spec, _old, q) => a + spec + tag + q);
  if (after === before) continue;
  changed++;
  if (!check) fs.writeFileSync(file, after);
}

if (check) {
  if (changed) {
    console.log(`stale: ${changed} file(s) do not carry ${tag}`);
    process.exit(1);
  }
  console.log(`every module URL carries ${tag}`);
} else {
  console.log(`stamped ${changed} file(s) with ${tag}`);
}
