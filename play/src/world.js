// ---------------------------------------------------------------------------
// WORLD — the zones. Each one is a seed plus a look plus an objective, so the
// "open world" is a set of arenas you unlock rather than one continuous map.
// ---------------------------------------------------------------------------

/**
 * The nine zones: seed, palette, props, objective.
 */
export const ZONES = [
  {
    id: 'gate',
    bed: 'wind',
    ambientFx: { color: 0xd8c9a8, rate: 1.2, life: 5, gravity: -0.15, speed: 0.25, spread: 12 },
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
    objective: 'Reach the far side of the gate',
    // What ends this level. 'clear' is the wave arena; 'reach' opens the pad from
    // the first frame, so the level is a place you cross rather than a pen you
    // empty. The 32-level campaign starts with this one field.
    objectiveType: 'reach',
    side: 'Break the three relics',
    relics: 3,
  },
  {
    id: 'foundry',
    bed: 'fire',
    ambientFx: { color: 0xff8a3c, rate: 6, life: 2.4, gravity: -1.6, speed: 0.5, spread: 10, height: 5 },
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
    objective: 'Hold out until the door opens',
    // The second objective type: the pad opens on a timer, so the level is a
    // fight you survive rather than a room you empty.
    objectiveType: 'survive',
    objectiveTime: 75,
    side: 'Find the overseer key',
    relics: 2,
  },
  {
    id: 'grove',
    bed: 'rain',
    ambientFx: { color: 0xa8ff7a, rate: 2.2, life: 6, gravity: -0.1, speed: 0.3, spread: 12 },
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
    bed: 'hum',
    ambientFx: { color: 0x9fc4ff, rate: 1.6, life: 6, gravity: 0.1, speed: 0.2, spread: 12 },
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
    bed: 'wind',
    ambientFx: { color: 0xc9b8a4, rate: 5, life: 5, gravity: 0.5, speed: 0.35, spread: 12, height: 6 },
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
    bed: 'stream',
    ambientFx: { color: 0x7fd8ff, rate: 3, life: 2.2, gravity: 4.5, speed: 0.3, spread: 10, height: 5.2 },
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
    bed: 'fire',
    ambientFx: { color: 0xff6a2a, rate: 9, life: 2.2, gravity: -2.2, speed: 0.7, spread: 9, height: 5 },
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
    id: 'spine',
    bed: 'wind',
    ambientFx: { color: 0xbfe4ff, rate: 2.6, life: 5, gravity: 0.2, speed: 0.25, spread: 9, height: 5.5 },
    shape: { rooms: [8, 12], size: [3, 5], tall: 0.2 },
    wallTint: [0.84, 1.0, 1.18],
    grade: { tint: [0.94, 1.0, 1.1], saturation: 1.08, vignette: 0.4 },
    name: 'THE SPINE',
    seed: 'spine-64',
    threat: 1.16,
    blurb: 'The service corridor under everything. It does not end, it just narrows.',
    sky: 0xa8c4dc,
    ground: 0x3a4450,
    fog: 0x2a343e,
    ambient: 0.86,
    wall: 1, floor: 2,
    props: { trees: 0, rocks: 14, grass: 6, animals: 1 },
    objective: 'Clear the spine',
    side: 'A terminal halfway down, if the corridor lets you stop.',
  },
  {
    id: 'throne',
    bed: 'ocean',
    ambientFx: { color: 0xff3b52, rate: 3.4, life: 4.5, gravity: -0.9, speed: 0.4, spread: 11 },
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
    // `best` is read by clearZone() with no guard of its own, so a record that
    // carries unlocked and cleared but no best — an older version's, or one
    // edited by hand — threw on the next zone clear instead of starting over
    if (p && typeof p.unlocked === 'number' && Array.isArray(p.cleared)) {
      if (!p.best || typeof p.best !== 'object' || Array.isArray(p.best)) p.best = {};
      // the campaign's own progress. A record written before 2.2 has neither, and
      // repairing it here is what keeps a returning player's zones intact while
      // starting them at level 1 rather than on a broken record
      if (!Array.isArray(p.levels)) p.levels = [];
      if (!(typeof p.level === 'number' && p.level >= 1)) p.level = 1;
      return p;
    }
  } catch (e) { /* ignore */ }
  return { unlocked: 1, cleared: [], best: {}, levels: [], level: 1 };
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
 * True when a campaign level is unlocked: the next one, or any already reached.
 * @param {object} progress The record from `loadProgress`.
 * @param {number} n 1-based level number.
 * @returns {boolean} Whether it can be played.
 */
export function isLevelUnlocked(progress, n) {
  return n >= 1 && n <= (progress.level || 1);
}

/**
 * Record a campaign level as cleared, unlock the next and keep the best score.
 * @param {object} progress The record from `loadProgress`.
 * @param {number} n 1-based level number.
 * @param {number} score The run's score on it.
 * @returns {object} The same record, saved.
 */
export function clearLevel(progress, n, score) {
  if (!Array.isArray(progress.levels)) progress.levels = [];
  if (!progress.best || typeof progress.best !== 'object') progress.best = {};
  if (!progress.levels.includes(n)) progress.levels.push(n);
  progress.level = Math.max(progress.level || 1, n + 1);
  const key = 'l' + n;
  progress.best[key] = Math.max(progress.best[key] || 0, score || 0);
  saveProgress(progress);
  return progress;
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
