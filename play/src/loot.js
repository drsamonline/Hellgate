// ---------------------------------------------------------------------------
// LOOT — trinkets. A kill can drop one; three fit in the belt; a fourth becomes
// score. They are passive, they stack with everything else, and they are the
// only thing in the game that changes how a run plays rather than how hard it is.
// ---------------------------------------------------------------------------

/** The six trinkets. `id` is what the save stores, `effect` is read by recomputeStats. */
export const TRINKETS = [
  { id: 'edge', name: 'Whetstone', blurb: '+8% weapon damage', effect: { damage: 0.08 }, color: 0xff6a3d },
  { id: 'hide', name: 'Thick Hide', blurb: '+15 max health', effect: { hp: 15 }, color: 0xffb454 },
  { id: 'cell', name: 'Dry Cell', blurb: '+20% energy regeneration', effect: { energy: 0.2 }, color: 0x7fd6ff },
  { id: 'boots', name: 'Light Boots', blurb: '+8% movement speed', effect: { speed: 0.08 }, color: 0x39ff9a },
  { id: 'plate', name: 'Iron Plate', blurb: '+15 starting armour', effect: { armour: 15 }, color: 0xb0b8c4 },
  { id: 'ember', name: 'Ember', blurb: 'heal 2 on every kill', effect: { leech: 2 }, color: 0xc77dff },
];

/** How many trinkets fit in the belt. */
export const SLOTS = 3;
/** Chance that one kill drops a trinket. */
export const DROP_CHANCE = 0.12;
/** Score paid for a trinket that does not fit the belt. */
export const SPARE_VALUE = 100;

/** Look a trinket up by id, or null. */
export function trinketById(id) {
  return TRINKETS.find((t) => t.id === id) || null;
}

/** Roll a drop for one kill: a trinket id, or null. */
export function rollDrop(rng) {
  if (rng() > DROP_CHANCE) return null;
  return TRINKETS[Math.floor(rng() * TRINKETS.length)].id;
}

/** Sum every equipped trinket's effects into one object. */
export function sumEffects(ids) {
  const out = {};
  for (const id of ids) {
    const t = trinketById(id);
    if (!t) continue;
    for (const [k, v] of Object.entries(t.effect)) out[k] = (out[k] || 0) + v;
  }
  return out;
}
