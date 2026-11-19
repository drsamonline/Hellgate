#!/usr/bin/env node
/* tools/audit-dead.mjs — exports nothing imports, and constants declared twice.
 *
 * Adopted from aethelgard-rpg-engine/tools/static-audit.py, narrowed to the two
 * findings that are always worth acting on in a small ES-module codebase.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'play', 'src');
const files = fs.readdirSync(SRC).filter((f) => f.endsWith('.js')).sort();

const texts = new Map();
for (const f of files) texts.set(f, fs.readFileSync(path.join(SRC, f), 'utf8'));

// every name imported anywhere in the game, including main.js
const imported = new Set();
for (const [, text] of texts) {
  for (const m of text.matchAll(/import\s*\{([^}]+)\}\s*from/g)) {
    for (const part of m[1].split(',')) {
      const name = part.trim().split(/\s+as\s+/)[0].trim();
      if (name) imported.add(name);
    }
  }
}
// tools and tests may import too
for (const dir of ['tools', 'tests']) {
  const full = path.join(ROOT, dir);
  if (!fs.existsSync(full)) continue;
  for (const f of fs.readdirSync(full)) {
    if (!f.endsWith('.mjs')) continue;
    const text = fs.readFileSync(path.join(full, f), 'utf8');
    for (const m of text.matchAll(/import\s*\{([^}]+)\}\s*from/g)) {
      for (const part of m[1].split(',')) {
        const name = part.trim().split(/\s+as\s+/)[0].trim();
        if (name) imported.add(name);
      }
    }
  }
}

const dead = [];
for (const [f, text] of texts) {
  for (const m of text.matchAll(/^export\s+(?:async\s+)?(?:function|class|const|let)\s+([A-Za-z0-9_]+)/gm)) {
    const name = m[1];
    // used inside its own module? count occurrences outside the export line
    const body = text.replace(m[0], '');
    const usedHere = new RegExp(`\\b${name}\\b`).test(body);
    if (!imported.has(name) && !usedHere) dead.push(`${f}: ${name}`);
  }
}

// duplicate numeric constants with the same name and different values
const consts = new Map();
for (const [f, text] of texts) {
  for (const m of text.matchAll(/^const\s+([A-Z][A-Z0-9_]+)\s*=\s*([0-9.]+)/gm)) {
    const key = m[1];
    const val = Number(m[2]);
    if (!consts.has(key)) consts.set(key, []);
    consts.get(key).push({ f, val });
  }
}
const conflicts = [...consts.entries()].filter(([, list]) => new Set(list.map((x) => x.val)).size > 1);

let bad = 0;
if (dead.length) {
  bad++;
  console.log('unused exports:');
  for (const d of dead) console.log('  ' + d);
}
if (conflicts.length) {
  bad++;
  console.log('same constant name, different values:');
  for (const [k, list] of conflicts) console.log('  ' + k + ' → ' + list.map((x) => `${x.f}=${x.val}`).join(', '));
}
console.log(`${files.length} modules · ${dead.length} unused export(s) · ${conflicts.length} constant conflict(s)`);
process.exit(bad ? 1 : 0);
