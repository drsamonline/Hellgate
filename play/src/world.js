// ---------------------------------------------------------------------------
// WORLD — the zones. Each one is a seed plus a look plus an objective, so the
// "open world" is a set of arenas you unlock rather than one continuous map.
// ---------------------------------------------------------------------------

/**
 * The five zones: seed, palette, props, objective.
 */
export const ZONES = [
  {
    id: 'gate',
    name: 'THE GATE',
    seed: 'gate-238',
    threat: 0.72, // wave 3 on the first level must not be the wall that stops you
    blurb: 'Where it opened. Brick, blood and the first wave.',
    sky: 0x9fb4c8,
    ground: 0x6a5540,
    fog: 0x07070a,
    ambient: 0.55,
    wall: 0, floor: 0,
    props: { trees: 0, rocks: 10, grass: 24, animals: 3 },
    objective: 'Clear the arena',
    side: 'Break the three relics',
    relics: 3,
  },
  {
    id: 'foundry',
    name: 'THE FOUNDRY',
    seed: 'foundry-101',
    threat: 0.86,
    blurb: 'Still warm. The machines kept working after everyone left.',
    sky: 0xa8b6c4,
    ground: 0x5a4030,
    fog: 0x0a0806,
    ambient: 0.5,
    wall: 1, floor: 1,
    props: { trees: 0, rocks: 18, grass: 8, animals: 1 },
    objective: 'Clear the foundry',
    side: 'Find the overseer key',
    relics: 2,
  },
  {
    id: 'grove',
    name: 'THE GROVE',
    seed: 'grove-234',
    threat: 1.0,
    blurb: 'Something grew back. It is not friendly, but it is alive.',
    sky: 0x8fb4a0,
    ground: 0x3f4a30,
    fog: 0x081009,
    ambient: 0.62,
    wall: 0, floor: 1,
    props: { trees: 26, rocks: 6, grass: 60, animals: 8 },
    objective: 'Clear the grove',
    side: 'Spare the herd',
    relics: 2,
  },
  {
    id: 'vault',
    name: 'THE VAULT',
    seed: 'vault-199',
    threat: 1.12,
    blurb: 'Sealed from the inside. Whatever sealed it is still here.',
    sky: 0x8a94b4,
    ground: 0x40384a,
    fog: 0x06060c,
    ambient: 0.44,
    wall: 1, floor: 0,
    props: { trees: 0, rocks: 14, grass: 0, animals: 0 },
    objective: 'Clear the vault',
    side: 'Recover the archive',
    relics: 3,
  },
  {
    id: 'ashfall',
    name: 'ASHFALL',
    seed: 'ashfall-187',
    threat: 0.94,
    blurb: 'Open sky above the gate. Everything up there is falling slowly.',
    sky: 0x3a3330,
    ground: 0x4a423a,
    fog: 0x14100e,
    ambient: 0.42,
    wall: 1, floor: 1,
    props: { trees: 4, rocks: 18, grass: 6, animals: 2 },
    objective: 'Clear the arena',
    side: 'Break the three relics',
    relics: 3,
  },
  {
    id: 'cistern',
    name: 'THE CISTERN',
    seed: 'cistern-32',
    threat: 1.06,
    blurb: 'Standing water, and something moving under it.',
    sky: 0x1a2a30,
    ground: 0x2a3a40,
    fog: 0x060c0e,
    ambient: 0.38,
    wall: 0, floor: 1,
    props: { trees: 0, rocks: 14, grass: 30, animals: 5 },
    objective: 'Clear the arena',
    side: 'Break the three relics',
    relics: 3,
  },
  {
    id: 'kiln',
    name: 'THE KILN',
    seed: 'kiln-112',
    threat: 1.18,
    blurb: 'The last heat before the throne. The walls are warm to touch.',
    sky: 0x3a1a12,
    ground: 0x4a2a1e,
    fog: 0x120604,
    ambient: 0.5,
    wall: 1, floor: 0,
    props: { trees: 0, rocks: 8, grass: 10, animals: 2 },
    objective: 'Clear the arena',
    side: 'Break the three relics',
    relics: 3,
  },
  {
    id: 'throne',
    name: 'THE THRONE',
    seed: 'throne-173',
    threat: 1.22,
    blurb: 'The end of the corridor. It has been waiting for a body.',
    sky: 0xb48f8f,
    ground: 0x4a3030,
    fog: 0x0c0505,
    ambient: 0.5,
    wall: 0, floor: 0,
    props: { trees: 8, rocks: 20, grass: 20, animals: 2 },
    objective: 'Kill the warden',
    side: 'None. Survive.',
    relics: 1,
    boss: true,
  },
];

const KEY = 'hellgate.progress';

/**
 * Read zone progress from localStorage, or a fresh record.
 */
export function loadProgress() {
  try {
    const raw = localStorage.getItem(KEY);
    const p = raw ? JSON.parse(raw) : null;
    if (p && typeof p.unlocked === 'number' && Array.isArray(p.cleared)) return p;
  } catch (e) { /* ignore */ }
  return { unlocked: 1, cleared: [], best: {} };
}

/**
 * Persist zone progress.
 */
export function saveProgress(p) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch (e) { /* private mode */ }
}

/**
 * Look a zone up by id, falling back to the first.
 */
export function zoneById(id) {
  return ZONES.find((z) => z.id === id) || ZONES[0];
}

/**
 * True when the zone at this index has been unlocked.
 */
export function isUnlocked(progress, index) {
  return index < progress.unlocked;
}

/**
 * Record a zone as cleared, unlock the next and keep the best score.
 */
export function clearZone(progress, zoneId, score) {
  const i = ZONES.findIndex((z) => z.id === zoneId);
  if (!progress.cleared.includes(zoneId)) progress.cleared.push(zoneId);
  progress.unlocked = Math.max(progress.unlocked, Math.min(ZONES.length, i + 2));
  progress.best[zoneId] = Math.max(progress.best[zoneId] || 0, score || 0);
  saveProgress(progress);
  return progress;
}
