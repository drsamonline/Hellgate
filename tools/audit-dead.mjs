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
// a dynamic import with destructuring is a use too:
//   const { Session } = await import('../play/src/net.js')
// Tests reach for modules this way, and without it the audit called a module's
// whole surface dead.
for (const [, text] of texts) {
  // the destructuring may be indented, so match the braces anywhere on the line
  for (const m of text.matchAll(/\{([^{}]+)\}\s*=\s*await\s+import\(/g)) {
    for (const part of m[1].split(',')) {
      const name = part.trim().split(':').pop().trim();
      if (name) imported.add(name);
    }
  }
}
// a namespace import is a use of whatever it calls: `import * as mapLib` then
// `mapLib.save()` means `save` is not dead. Without this the audit reported four
// exports of maplib.js as unused while main.js was calling all four.
for (const [, text] of texts) {
  for (const m of text.matchAll(/import\s*\*\s*as\s+(\w+)\s*from/g)) {
    const alias = m[1];
    const re = new RegExp('\\b' + alias + '\\.(\\w+)', 'g');
    for (const u of text.matchAll(re)) imported.add(u[1]);
  }
}
// a duplicate key in an object literal is dead data: the last one wins, and the
// one before it is silently unreachable. `window.HG` shipped `scene`, `level`,
// `enemies`, `effects` and `projectiles` twice — the snapshots were dead, and the
// dead `scene` was the one the draw-call gate had been reading for 39 releases.
const dupes = [];
for (const [f, text] of texts) {
  const at = text.indexOf('window.HG = {');
  if (at < 0) continue;
  const block = text.slice(at, text.indexOf('\n};', at));
  const keys = [];
  for (const line of block.split('\n')) {
    // getter bodies carry commas (`get x() { return { a: 1, b: 2 }; }`)
    const clean = line.replace(/\{[^{}]*\}/g, '{}').replace(/^\s*/, '');
    if (!clean || clean.startsWith('//') || clean.startsWith('window.HG')) continue;
    for (const piece of clean.split(',')) {
      const m = piece.match(/^\s*(?:get\s+)?([A-Za-z_$][\w$]*)/);
      if (m && m[1] !== 'get') keys.push(m[1]);
    }
  }
  const seen = new Set();
  for (const k of keys) {
    if (seen.has(k)) dupes.push(`${f}: ${k}`);
    seen.add(k);
  }
}
// tools and tests may import too
for (const dir of ['tools', 'tests']) {
  const full = path.join(ROOT, dir);
  if (!fs.existsSync(full)) continue;
  for (const f of fs.readdirSync(full)) {
    if (!f.endsWith('.mjs')) continue;
    const text = fs.readFileSync(path.join(full, f), 'utf8');
    // a test that reaches for a module dynamically is still a use of it
    for (const m of text.matchAll(/\{([^{}]+)\}\s*=\s*await\s+import\(/g)) {
      for (const part of m[1].split(',')) {
        const name = part.trim().split(':').pop().trim();
        if (name) imported.add(name);
      }
    }
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
if (dupes.length) {
  bad++;
  console.log('duplicate keys in an object literal (the last one wins, the rest are dead):');
  for (const d of dupes) console.log('  ' + d);
}
console.log(`${files.length} modules · ${dead.length} unused export(s) · ${conflicts.length} constant conflict(s) · ${dupes.length} duplicate key(s)`);
process.exit(bad ? 1 : 0);
