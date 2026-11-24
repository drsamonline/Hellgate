// ---------------------------------------------------------------------------
// ACHIEVEMENTS — the record that survives the run.
//
// Every other number in this game belongs to one run and dies with it. This is
// the small set of things worth keeping: a table of predicates over the player's
// history, checked at the moments that could change them, stored beside the zone
// progress.
//
// A predicate is a function of `(run, history)` where `run` is the current run's
// numbers and `history` is everything ever done. That split is the whole design:
// "kill 100 imps" is history, "clear a zone without dying" is a run.
//
// Ported in shape from `neon-engine`'s meta.js and `aethelgard`'s achievement
// table (same licence), rewritten against this game's state.
// ---------------------------------------------------------------------------

import { TYPES } from './enemies.js';

const KEY = 'hellgate.achievements';

/**
 * The table. `check(run, hist)` returns true once the thing has been done.
 *
 * `run` is the live run: `{ kills, wave, zone, score, elite, blade, relic }`.
 * `hist` is everything: `{ kills, zones, best, runs, imps, elites, ... }`.
 */
export const ACHIEVEMENTS = [
  { id: 'first', name: 'FIRST BLOOD', desc: 'Kill anything at all', check: (r, h) => h.kills >= 1 },
  { id: 'fifty', name: 'FIFTY DOWN', desc: 'Kill fifty enemies across all runs', check: (r, h) => h.kills >= 50 },
  { id: 'fivehundred', name: 'FIVE HUNDRED', desc: 'Kill five hundred enemies', check: (r, h) => h.kills >= 500 },
  { id: 'gate', name: 'THROUGH THE GATE', desc: 'Clear the first zone', check: (r, h) => h.zones >= 1 },
  { id: 'halfway', name: 'HALFWAY DOWN', desc: 'Clear five zones', check: (r, h) => h.zones >= 5 },
  { id: 'campaign', name: 'THE GATE IS YOURS', desc: 'Clear every zone in one campaign', check: (r, h) => h.zonesCleared >= 9 },
  // the campaign's own three, in the order a player meets them
  { id: 'act1', name: 'ACT ONE', desc: 'Clear every level of act I', check: (r, h) => h.acts >= 1 },
  { id: 'tenlevels', name: 'TEN DEEP', desc: 'Clear ten campaign levels', check: (r, h) => h.levels >= 10 },
  { id: 'thirtytwo', name: 'THE WHOLE GATE', desc: 'Clear all thirty-two levels', check: (r, h) => h.levels >= 32 },
  { id: 'door', name: 'BOUGHT AND PAID FOR', desc: 'Buy the door from the helper', check: (r, h) => h.doors >= 1 },
  { id: 'wave10', name: 'TEN WAVES', desc: 'Reach wave 10 in a run', check: (r) => r.wave >= 10 },
  { id: 'wave20', name: 'TWENTY WAVES', desc: 'Reach wave 20 in a run', check: (r) => r.wave >= 20 },
  { id: 'elite', name: 'ELITE HUNTER', desc: 'Kill an elite', check: (r, h) => h.elites >= 1 },
  { id: 'elite25', name: 'ELITE CULL', desc: 'Kill twenty-five elites', check: (r, h) => h.elites >= 25 },
  { id: 'blade', name: 'NO AMMO NEEDED', desc: 'Kill five enemies with the blade', check: (r, h) => h.blade >= 5 },
  { id: 'relic', name: 'RELIC HUNTER', desc: 'Collect every relic in a zone', check: (r) => r.relic === true },
  { id: 'rich', name: 'DEEP POCKETS', desc: 'Score 10,000 in one run', check: (r) => r.score >= 10000 },
  { id: 'survivor', name: 'SURVIVOR', desc: 'Finish a run without dying', check: (r, h) => r.survived === true },
  // derived, not hardcoded: four act bosses took the type count from eight to
  // eleven, and an achievement that says "every type" must mean every type
  { id: 'bestiary', name: 'BESTIARY', desc: 'Kill every enemy type at least once', check: (r, h) => h.types >= Object.keys(TYPES).length },
];

/** A fresh history. */
export function emptyHistory() {
  return {
    kills: 0, zones: 0, zonesCleared: 0, elites: 0, blade: 0, types: 0, runs: 0,
    unlocked: [], best: 0, byType: {},
    // the campaign's own tally: how many of the 32 levels are behind you, how
    // many acts, and whether the helper has been paid
    levels: 0, acts: 0, doors: 0,
  };
}

/**
 * Read the history, repairing anything a truncated write left behind.
 *
 * The repair matters more than the read: this file is written on every kill
 * milestone, so an interrupted write is the likeliest corruption in the game.
 */
export function loadHistory() {
  const h = emptyHistory();
  let raw = null;
  try { raw = localStorage.getItem(KEY); } catch (e) { return h; }
  if (!raw) return h;
  let p = null;
  try { p = JSON.parse(raw); } catch (e) { return h; }
  if (!p || typeof p !== 'object') return h;
  for (const k of Object.keys(h)) {
    if (k === 'unlocked') { if (Array.isArray(p.unlocked)) h.unlocked = p.unlocked.filter((x) => typeof x === 'string'); }
    else if (k === 'byType') { if (p.byType && typeof p.byType === 'object') h.byType = p.byType; }
    else if (Number.isFinite(p[k])) h[k] = p[k];
  }
  return h;
}

/** Persist the history; a full disk must not stop the run. */
export function saveHistory(h) {
  try { localStorage.setItem(KEY, JSON.stringify(h)); return true; } catch (e) { return false; }
}

/**
 * Check every achievement against the run and the history.
 *
 * Returns the ids that were newly unlocked, so the caller can say so once. The
 * history is mutated, not replaced: an already-unlocked achievement stays
 * unlocked even if the predicate would now be false.
 */
export function check(run, hist) {
  const unlocked = new Set(hist.unlocked || []);
  const fresh = [];
  for (const a of ACHIEVEMENTS) {
    if (unlocked.has(a.id)) continue;
    let ok = false;
    try { ok = !!a.check(run || {}, hist); } catch (e) { ok = false; }
    if (ok) { unlocked.add(a.id); fresh.push(a.id); }
  }
  hist.unlocked = [...unlocked];
  return fresh;
}

/** The name of an achievement by id, for a toast. */
export function achievementName(id) {
  const a = ACHIEVEMENTS.find((x) => x.id === id);
  return a ? a.name : id;
}

/** How many are unlocked, and how many exist. */
export function progressOf(hist) {
  return { done: (hist.unlocked || []).length, total: ACHIEVEMENTS.length };
}
