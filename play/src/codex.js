// ---------------------------------------------------------------------------
// CODEX — what the run has taught you, searchable.
//
// Three kinds of entry, all generated from the live tables so the codex can
// never disagree with the game: the eight enemy types with their real numbers
// and your kill count against each, the six trinkets with what they actually do,
// and the nine zones with their palette and threat.
//
// The search is `search.js`, so "fire" finds the kiln and the imp's fireball, and
// a typo still finds the entry.
// ---------------------------------------------------------------------------

import { index } from './search.js';

/** A short, honest sentence about how an enemy behaves. */
function behaviour(T) {
  const bits = [];
  if (T.boss) bits.push('boss');
  if (T.charges) bits.push('charges when it sees you');
  if (T.melee && T.keepsDistance) bits.push('closes, then holds range');
  else if (T.melee) bits.push('melee');
  else if (T.lob) bits.push('lobs an arc over cover');
  else if (T.beam) bits.push('hitscan, telegraphed by a beam');
  else bits.push('fires at range');
  if (T.hover) bits.push('floats');
  if (T.keepsDistance) bits.push('backs off under ' + T.keepsDistance + ' m');
  return bits.join(' · ');
}

/**
 * Build every codex entry.
 *
 * @param {object} tables `{ TYPES, TRINKETS, ZONES, kills }` — kills is a map of
 *   type name to how many the player has put down this run.
 */
export function entries(tables) {
  const out = [];
  const TYPES = tables.TYPES || {};
  for (const key of Object.keys(TYPES)) {
    const T = TYPES[key];
    const killed = (tables.kills && tables.kills[key]) || 0;
    out.push({
      kind: 'ENEMY',
      name: String(T.label || key).toUpperCase(),
      text: `${T.hp} health · ${Math.round(T.damage)} damage · ${T.telegraph}s telegraph · ${behaviour(T)}`,
      // a boss says which act it closes: the codex is where a player looks to
      // find out why the thing at the end of act II hits so hard
      note: T.boss && tables.BOSS_FOR_ACT
        ? 'closes act ' + Object.keys(tables.BOSS_FOR_ACT).find((a) => tables.BOSS_FOR_ACT[a] === key)
        : (killed ? killed + ' killed' : 'not yet met'),
      search: [key, T.label, behaviour(T), 'enemy'].join(' '),
    });
  }
  for (const t of tables.TRINKETS || []) {
    // the trinket table already carries a written blurb; use it rather than
    // rebuilding a sentence from the effect numbers
    const eff = t.blurb || Object.entries(t.effect || {}).map(([k, v]) => `+${v} ${k}`).join(', ') || 'no effect';
    out.push({
      kind: 'TRINKET',
      name: String(t.name || t.id).toUpperCase(),
      text: eff,
      note: t.rarity || 'found on a kill',
      search: [t.id, t.name, eff, 'trinket'].join(' '),
    });
  }
  // what a level can ask of you: the four objective types, in the words the HUD
  // uses, so the codex answers "what does BREAK THE RELICS mean"
  const OBJ = {
    reach: 'The door is open from the first frame. Walk to the pad; nothing you kill is required.',
    clear: 'Empty the room. The door opens when the last body drops.',
    survive: 'The door opens on a clock, whatever is still standing. Do not have to win, only to last.',
    relics: 'Break every relic on the floor. The door answers the count, not the bodies.',
  };
  for (const [id, text] of Object.entries(tables.OBJECTIVES || OBJ)) {
    out.push({
      kind: 'OBJECTIVE',
      name: id.toUpperCase(),
      text,
      note: 'what ends a level',
      search: [id, 'objective', 'level', text].join(' '),
    });
  }
  for (const z of tables.ZONES || []) {
    out.push({
      kind: 'ZONE',
      name: String(z.name || z.id).toUpperCase(),
      text: `${z.blurb || ''} threat ${z.threat != null ? z.threat : 1}`,
      note: z.bed ? z.bed + ' bed' : '',
      search: [z.id, z.name, z.blurb, z.objective, z.bed, 'zone'].join(' '),
    });
  }
  // achievements: the only entries that are about you rather than the world
  const ach = tables.achievements;
  if (ach && ach.table) {
    const done = new Set((ach.hist && ach.hist.unlocked) || []);
    for (const a of ach.table) {
      out.push({
        kind: done.has(a.id) ? 'DONE' : 'GOAL',
        name: a.name,
        text: a.desc,
        note: done.has(a.id) ? 'unlocked' : 'locked',
        search: [a.id, a.name, a.desc, 'achievement'].join(' '),
      });
    }
  }
  return out;
}

/** An index over the entries, built once per opening of the codex. */
export function buildCodex(tables) {
  const all = entries(tables);
  const idx = index(all, { keys: ['kind', 'name', 'text', 'search'] });
  return {
    entries: all,
    /** Ranked results for a query; an empty query returns everything. */
    search(q, limit = 40) {
      if (!String(q || '').trim()) return all.slice(0, limit).map((item, i) => ({ item, index: i, score: 0 }));
      return idx.query(q, { fuzzy: true, limit });
    },
  };
}
