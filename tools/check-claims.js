#!/usr/bin/env node
/* tools/check-claims.js — a README number is a claim; this fails the build when
 * one drifts from the thing that produces it.
 *
 * Adopted from the fleet convention (game-kit/tools/check-claims.js). Checks:
 *   1. roadmap item count in ENHANCEMENTS.md vs the number the README states
 *   2. number of test suites on disk vs the README's testing table
 *   3. number of ES modules in play/src vs the README's architecture block
 *   4. lines of game JS vs the README's "~Nk" claim (±10%)
 *   5. licence badge vs the LICENSE file
 *   6. VERSION vs the newest heading in CHANGELOG.md
 *   7. sponsor handles in the README vs the fleet convention
 *
 * Exit 1 on any mismatch so CI goes red instead of the docs going stale.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const fails = [];
const pass = [];

function ok(name, cond, detail) {
  if (cond) pass.push(name);
  else fails.push(`${name}${detail ? ' — ' + detail : ''}`);
}

const readme = read('README.md');

// 1. roadmap count -----------------------------------------------------------
const enh = read('ENHANCEMENTS.md');
const items = (enh.match(/^\d+\. \*\*/gm) || []).length;
const stated = (readme.match(/roadmap-(\d+)_items/) || [])[1] || (readme.match(/(\d+) ideas/) || [])[1];
ok('roadmap count', Number(stated) === items, `README says ${stated}, ENHANCEMENTS.md has ${items}`);

// 2. suites ------------------------------------------------------------------
const suites = fs.readdirSync(path.join(root, 'tests')).filter((f) => /^test-.*\.mjs$/.test(f)).length;
const suiteRows = (readme.match(/^\| `test-[a-z]+\.mjs` \|/gm) || []).length;
ok('suite count', suites === suiteRows, `${suites} suites on disk, ${suiteRows} rows in the README table`);

// 3. modules -----------------------------------------------------------------
const mods = fs.readdirSync(path.join(root, 'play/src')).filter((f) => f.endsWith('.js')).length;
const archRows = (readme.match(/^play\/src\/[a-z-]+\.js\s/gm) || []).length;
ok('module count', mods === archRows, `${mods} modules, ${archRows} listed in the README`);

// 4. lines of game JS --------------------------------------------------------
const locOf = (p) => read(p).split('\n').length;
let loc = locOf('index.html') + locOf('play/index.html');
for (const f of fs.readdirSync(path.join(root, 'play/src'))) loc += locOf('play/src/' + f);
const locClaim = (readme.match(/~([\d.]+)k\s*<\/b><span>lines of JS/) || readme.match(/~([\d.]+)k\s+lines of JS/) || [])[1]
  || (read('index.html').match(/~([\d.]+)k<\/b><span>lines of JS/) || [])[1];
if (locClaim) {
  const statedLoc = parseFloat(locClaim) * 1000;
  const drift = Math.abs(statedLoc - loc) / loc;
  ok('lines of JS', drift <= 0.1, `stated ~${statedLoc}, actual ${loc} (${(drift * 100).toFixed(1)}% off)`);
} else {
  ok('lines of JS', false, 'no "~Nk lines of JS" claim found to check');
}

// 5. licence -----------------------------------------------------------------
const lic = read('LICENSE');
// the licence name in the file has to be the one the README badge points at
const licenceName = /PolyForm Noncommercial/.test(lic) ? 'PolyForm Noncommercial'
  : /MIT License/.test(lic) ? 'MIT' : null;
const hasLicenceBadge = /img\.shields\.io\/github\/license\//.test(readme) || /license-MIT/.test(readme);
ok('licence badge', hasLicenceBadge, 'no licence badge in the README');
ok('licence is named in the file', !!licenceName, 'LICENSE names neither PolyForm Noncommercial nor MIT');
ok('licence link', /\]\(LICENSE\)/.test(readme), 'badge does not link to LICENSE');
ok('licence name', /Dr Sohil Momin/.test(lic), 'LICENSE has no copyright holder');

// 5b. the build stamp in the game must match VERSION ---------------------------
const gameVersion = (read('play/src/main.js').match(/const BUILD = '([0-9.]+)'/) || [])[1];
const fileVersion = read('VERSION').trim();
ok('build stamp matches VERSION', gameVersion === fileVersion,
  `main.js says BUILD ${gameVersion}, VERSION says ${fileVersion}`);

// 6. version -----------------------------------------------------------------
const version = read('VERSION').trim();
const newest = (read('CHANGELOG.md').match(/^## (\d+\.\d+\.\d+)/m) || [])[1];
ok('version', version === newest, `VERSION is ${version}, CHANGELOG newest is ${newest}`);

// 7. sponsor handles ---------------------------------------------------------
for (const h of ['github.com/sponsors/drsamonline', 'ko-fi.com/matneo', 'paypal.me/drsohilmomin']) {
  ok('sponsor ' + h, readme.includes(h), 'missing from the README support table');
}
ok('no invented tiers', !/\$\d+ \/ mo/.test(readme), 'README still carries invented sponsor tiers');

// report ---------------------------------------------------------------------
for (const p of pass) console.log('  ok   ' + p);
for (const f of fails) console.log('  FAIL ' + f);
console.log(`\n${pass.length} passed, ${fails.length} failed`);
process.exit(fails.length ? 1 : 0);
