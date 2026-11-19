#!/usr/bin/env node
/* tools/check-stub.mjs — the Three.js test double must cover what the game uses.
 *
 * The suites run against tests/stub-three, not the real library. When the game
 * starts using a THREE symbol the stub does not have, the suites fail — but only
 * on the code path that touches it, which may be a 12% drop roll. This checks
 * the whole surface statically instead, so the gap is found on the commit that
 * introduces it.
 *
 *   node tools/check-stub.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'play', 'src');
const STUB = path.join(ROOT, 'tests', 'stub-three', 'index.js');

const used = new Set();
for (const file of fs.readdirSync(SRC).filter((f) => f.endsWith('.js'))) {
  const text = fs.readFileSync(path.join(SRC, file), 'utf8');
  for (const m of text.matchAll(/new THREE\.([A-Za-z0-9_]+)/g)) used.add(m[1]);
  for (const m of text.matchAll(/THREE\.([A-Z][A-Za-z0-9_]+)\s*[.)]/g)) used.add(m[1]);
}

const stub = fs.readFileSync(STUB, 'utf8');
const exported = new Set();
for (const m of stub.matchAll(/export\s+(?:class|const|function)\s+([A-Za-z0-9_]+)/g)) exported.add(m[1]);

const missing = [...used].filter((u) => !exported.has(u)).sort();

console.log(`THREE symbols used: ${used.size} · declared by the stub: ${exported.size}`);
if (missing.length) {
  console.log('FAIL: the stub does not declare ' + missing.join(', '));
  process.exit(1);
}
console.log('the stub covers every THREE symbol the game uses');
