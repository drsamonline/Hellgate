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
    shape: { rooms: [8, 11], size: [4, 7], tall: 0.25 },
    wallTint: [1.06, 1.0, 0.92],
    grade: { tint: [1.02, 1.0, 0.96], saturation: 1.05, vignette: 0.42 },
    name: 'THE GATE',
    seed: 'gate-238',
    threat: 0.72, // wave 3 on the first level must not be the wall that stops you
    blurb: 'Where it opened. Brick, blood and the first wave.',
    sky: 0x9fb4c8,
    ground: 0x6a5540,
    fog: 0x1b1b1e,
    ambient: 0.8,
    wall: 0, floor: 0,
    props: { trees: 0, rocks: 10, grass: 24, animals: 3 },
    objective: 'Clear the arena',
    side: 'Break the three relics',
    relics: 3,
  },
  {
    id: 'foundry',
    shape: { rooms: [10, 14], size: [3, 6], tall: 0.5 },
    wallTint: [1.28, 0.92, 0.7],
    grade: { tint: [1.06, 1.0, 0.92], saturation: 1.1, vignette: 0.4 },
    name: 'THE FOUNDRY',
    seed: 'foundry-101',
    threat: 0.86,
    blurb: 'Still warm. The machines kept working after everyone left.',
    sky: 0xa8b6c4,
    ground: 0x5a4030,
    fog: 0x1e1c1a,
    ambient: 0.78,
    wall: 2, floor: 1,
    props: { trees: 0, rocks: 18, grass: 8, animals: 1 },
    objective: 'Clear the foundry',
    side: 'Find the overseer key',
    relics: 2,
  },
  {
    id: 'grove',
    shape: { rooms: [6, 9], size: [6, 9], tall: 0.15 },
    wallTint: [0.8, 1.12, 0.82],
    grade: { tint: [0.96, 1.04, 0.98], saturation: 1.12, vignette: 0.36 },
    name: 'THE GROVE',
    seed: 'grove-234',
    threat: 1.0,
    blurb: 'Something grew back. It is not friendly, but it is alive.',
    sky: 0x8fb4a0,
    ground: 0x3f4a30,
    fog: 0x1c241d,
    ambient: 0.85,
    wall: 3, floor: 0,
    props: { trees: 26, rocks: 6, grass: 60, animals: 8 },
    objective: 'Clear the grove',
    side: 'Spare the herd',
    relics: 2,
  },
  {
    id: 'vault',
    shape: { rooms: [11, 15], size: [3, 5], tall: 0.2 },
    wallTint: [0.86, 0.98, 1.16],
    grade: { tint: [0.99, 1.0, 1.05], saturation: 0.92, vignette: 0.48 },
    name: 'THE VAULT',
    seed: 'vault-199',
    threat: 1.12,
    blurb: 'Sealed from the inside. Whatever sealed it is still here.',
    sky: 0x8a94b4,
    ground: 0x40384a,
    fog: 0x1a1a20,
    ambient: 0.88,
    wall: 1, floor: 1,
    props: { trees: 0, rocks: 14, grass: 0, animals: 0 },
    objective: 'Clear the vault',
    side: 'Recover the archive',
    relics: 3,
  },
  {
    id: 'ashfall',
    shape: { rooms: [5, 8], size: [7, 10], tall: 0.6 },
    wallTint: [1.1, 1.02, 0.94],
    grade: { tint: [1.04, 0.99, 0.94], saturation: 0.86, vignette: 0.46 },
    name: 'ASHFALL',
    seed: 'ashfall-187',
    threat: 0.94,
    blurb: 'Open sky above the gate. Everything up there is falling slowly.',
    sky: 0x554a42,
    ground: 0x655848,
    fog: 0x362e28,
    ambient: 0.88,
    wall: 4, floor: 1,
    props: { trees: 4, rocks: 18, grass: 6, animals: 2 },
    objective: 'Clear the arena',
    side: 'Break the three relics',
    relics: 3,
  },
  {
    id: 'cistern',
    shape: { rooms: [9, 13], size: [3, 5], tall: 0.1 },
    wallTint: [0.72, 1.02, 1.2],
    grade: { tint: [0.92, 1.02, 1.08], saturation: 0.95, vignette: 0.42 },
    name: 'THE CISTERN',
    seed: 'cistern-32',
    threat: 1.06,
    blurb: 'Standing water, and something moving under it.',
    sky: 0x2c4250,
    ground: 0x3d525c,
    fog: 0x26343c,
    ambient: 0.84,
    wall: 1, floor: 2,
    props: { trees: 0, rocks: 14, grass: 30, animals: 5 },
    objective: 'Clear the arena',
    side: 'Break the three relics',
    relics: 3,
  },
  {
    id: 'kiln',
    shape: { rooms: [7, 10], size: [5, 8], tall: 0.45 },
    wallTint: [1.36, 0.84, 0.66],
    grade: { tint: [1.1, 0.94, 0.88], saturation: 1.16, vignette: 0.44 },
    name: 'THE KILN',
    seed: 'kiln-112',
    threat: 1.18,
    blurb: 'The last heat before the throne. The walls are warm to touch.',
    sky: 0x5a2a1e,
    ground: 0x6a3f2a,
    fog: 0x3e2824,
    ambient: 0.95,
    wall: 2, floor: 0,
    props: { trees: 0, rocks: 8, grass: 10, animals: 2 },
    objective: 'Clear the arena',
    side: 'Break the three relics',
    relics: 3,
  },
  {
    id: 'throne',
    shape: { rooms: [6, 9], size: [7, 10], tall: 0.7 },
    wallTint: [1.3, 0.7, 0.7],
    grade: { tint: [1.08, 0.9, 0.9], saturation: 1.2, vignette: 0.5 },
    name: 'THE THRONE',
    seed: 'throne-173',
    threat: 1.22,
    blurb: 'The end of the corridor. It has been waiting for a body.',
    sky: 0xb48f8f,
    ground: 0x4a3030,
    fog: 0x201919,
    ambient: 0.78,
    wall: 4, floor: 1,
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
