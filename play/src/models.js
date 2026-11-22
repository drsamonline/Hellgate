// ---------------------------------------------------------------------------
// MODELS — optional open-3-D bodies for the enemy types.
//
// The game builds its enemies from joints in code and ships no assets, which is
// why it loads instantly and why every enemy is the same on every machine. This
// adds the other option without breaking that: drop a `.glb` (glTF 2.0 binary,
// the open standard) into `assets/models/<type>.glb` and that type uses it
// instead of its procedural body. Missing file, bad file, or a file the reader
// cannot handle: the procedural body stays, silently.
//
// No build step, no bundler, no library. `glb.js` is 200 lines.
// ---------------------------------------------------------------------------

import * as THREE from 'three';
import { loadGLB, measure } from './glb.js';

const MODELS = new Map();
const REPORT = { loaded: [], failed: [], missing: [] };

/**
 * Try to load `<type>.glb` for every type in `types`.
 *
 * `height` is the target height in metres; a model is scaled uniformly to match,
 * because a downloaded model is in whatever units its author used and an enemy
 * the size of a bus is a bug you cannot unsee.
 */
export async function loadModels(types, opts = {}) {
  const base = opts.base || '../assets/models/';
  // A manifest, not seven speculative fetches: a 404 per type would fill the
  // console with errors on every boot for a feature nobody is using.
  let wanted = {};
  try {
    const res = await fetch(base + 'index.json');
    if (res.ok) wanted = (await res.json()).models || {};
  } catch (e) {
    return REPORT;   // no manifest: every type keeps its procedural body
  }
  const list = types.filter((t) => wanted[t]);
  await Promise.all(list.map(async (type) => {
    const url = base + (wanted[type] || type + '.glb');
    try {
      const group = await loadGLB(url);
      const { size } = measure(group);
      const target = (opts.heights && opts.heights[type]) || 1.7;
      const scale = size.y > 0.0001 ? target / size.y : 1;
      group.scale.setScalar(scale);
      // sit it on the floor: a model's origin is wherever its author left it
      group.position.y -= (size.y * scale) / 2 - target / 2;
      MODELS.set(type, group);
      REPORT.loaded.push(type);
    } catch (e) {
      REPORT.failed.push(type + ': ' + e.message);
    }
  }));
  return REPORT;
}

/** The model for a type, or null. */
export function getModel(type) {
  const g = MODELS.get(type);
  return g ? g.clone() : null;
}

/** What the loader did, for the stats screen and the tests. */
export function modelReport() {
  return { loaded: REPORT.loaded.slice(), failed: REPORT.failed.slice(), missing: REPORT.missing.slice() };
}

/** Remove a model for a type, so the procedural body comes back. */
export function uninstallModel(type) {
  MODELS.delete(type);
}

/** Install a model directly — used by the tests and by a custom loader. */
export function installModel(type, group) {
  MODELS.set(type, group);
  REPORT.loaded.push(type);
}
