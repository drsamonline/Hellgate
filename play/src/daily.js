// ---------------------------------------------------------------------------
// DAILY — one run a day, the same one every time you open it.
//
// The seed is the date, hashed: no server, no account, and the same player on the
// same day gets the same level, the same waves and the same spawns. The best score
// for the day is kept beside it, so the run is worth repeating.
//
// The one rule that matters: the seed must not depend on anything but the date and
// the salt. A daily that rolls differently on every launch is not a daily — that
// bug is why this file exists rather than a `Math.random()` call in the title.
//
// The date is the player's LOCAL date, deliberately: their day is their own, and a
// daily that rolls at 05:30 because it is midnight in UTC is a worse daily for
// everybody east of Greenwich. The cost is that two players in different zones are
// not playing the same run — there is no leaderboard here to compare them on, and
// when there is, this is the line that has to change.
// ---------------------------------------------------------------------------

const KEY = 'hellgate.daily';

/** The local date as YYYY-MM-DD, not UTC: a player's day is their own. */
export function dayKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** A 32-bit FNV-1a hash of a string. */
export function hash(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/**
 * The seed for a day: `daily-<date>-<hash>`.
 *
 * The hash is in the seed so the level does not merely change once a day by a
 * counter — two consecutive days are not adjacent seeds.
 */
export function dailySeed(date = new Date(), salt = 'hellgate') {
  const key = dayKey(date);
  return 'daily-' + key + '-' + hash(key + '|' + salt).toString(36);
}

/**
 * Read the day's record, repairing anything unreadable.
 * Returns `{ day, best, runs }` for today, or a fresh record.
 */
export function loadDaily(store = safeStore()) {
  const today = dayKey();
  const fresh = { day: today, best: 0, runs: 0, waves: 0, kills: 0 };
  if (!store) return fresh;
  let raw = null;
  try { raw = store.getItem(KEY); } catch (e) { return fresh; }
  if (!raw) return fresh;
  let p = null;
  try { p = JSON.parse(raw); } catch (e) { return fresh; }
  if (!p || typeof p !== 'object' || p.day !== today) return fresh;
  for (const k of ['best', 'runs', 'waves', 'kills']) if (Number.isFinite(p[k])) fresh[k] = p[k];
  return fresh;
}

/** Record a finished daily run; returns the record, with `beat` set if it was a best. */
export function recordDaily(score, waves, kills, store = safeStore()) {
  const rec = loadDaily(store);
  rec.runs += 1;
  const beat = score > rec.best;
  if (beat) { rec.best = score; rec.waves = waves; rec.kills = kills; }
  if (store) {
    try { store.setItem(KEY, JSON.stringify(rec)); } catch (e) { /* private mode */ }
  }
  return { ...rec, beat };
}

function safeStore() {
  try {
    if (typeof localStorage === 'undefined' || !localStorage) return null;
    return localStorage;
  } catch (e) { return null; }
}
