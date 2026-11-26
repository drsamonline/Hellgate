// ---------------------------------------------------------------------------
// MAP LIBRARY — more than one grid.
//
// The editor's Save keeps one grid: the one you are working on. That is the
// wrong shape for the thing people actually do, which is keep four ideas and
// play them in turn. This is the small store behind a name: a map, a title, and
// nothing else, in the same localStorage the campaign and the best run use.
// ---------------------------------------------------------------------------

const KEY = 'hellgate.maps';
/** How many maps the library keeps. Beyond this the oldest goes. */
export const LIB_MAX = 12;
/** How big one map may be, in characters of JSON. A 40 x 40 map is ~7 kB. */
export const MAP_MAX = 24000;

/** The whole library, repaired if it is not one. */
export function list() {
  let raw = null;
  try { raw = globalThis.localStorage ? globalThis.localStorage.getItem(KEY) : null; } catch (e) { return []; }
  if (!raw) return [];
  let parsed = null;
  try { parsed = JSON.parse(raw); } catch (e) { return []; }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return [];
  const out = [];
  for (const [name, map] of Object.entries(parsed)) {
    if (!map || map.v !== 1 || typeof map.grid !== 'string') continue;
    out.push({ name, map });
  }
  // newest first: the store carries a stamp when it saves
  return out.sort((a, b) => (b.map.at || 0) - (a.map.at || 0));
}

/** Write the whole library back. */
function write(entries) {
  const obj = {};
  for (const e of entries) obj[e.name] = e.map;
  try { globalThis.localStorage.setItem(KEY, JSON.stringify(obj)); return true; } catch (e) { return false; }
}

/**
 * Save a map under a name.
 * @returns {boolean} True when it was stored.
 */
export function save(name, map) {
  const title = String(name || '').trim().slice(0, 24);
  if (!title || !map || map.v !== 1) return false;
  const json = JSON.stringify(map);
  if (json.length > MAP_MAX) return false;
  const entries = list().filter((e) => e.name !== title);
  entries.unshift({ name: title, map: { ...map, at: Date.now() } });
  return write(entries.slice(0, LIB_MAX));
}

/** One map by name, or null. */
export function load(name) {
  const hit = list().find((e) => e.name === name);
  return hit ? hit.map : null;
}

/** Remove one by name. */
export function remove(name) {
  const before = list();
  const after = before.filter((e) => e.name !== name);
  if (after.length === before.length) return false;
  return write(after);
}

/** Names only, newest first. */
export function names() {
  return list().map((e) => e.name);
}
