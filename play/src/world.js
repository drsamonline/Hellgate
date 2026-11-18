// ---------------------------------------------------------------------------
// WORLD — the zones. Each one is a seed plus a look plus an objective, so the
// "open world" is a set of arenas you unlock rather than one continuous map.
// ---------------------------------------------------------------------------

export const ZONES = [
  {
    id: 'gate',
    name: 'THE GATE',
    seed: 'hellgate',
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
    seed: 'foundry-7',
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
    seed: 'grove-3',
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
    seed: 'vault-11',
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
    id: 'throne',
    name: 'THE THRONE',
    seed: 'throne-0',
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

export function loadProgress() {
  try {
    const raw = localStorage.getItem(KEY);
    const p = raw ? JSON.parse(raw) : null;
    if (p && typeof p.unlocked === 'number' && Array.isArray(p.cleared)) return p;
  } catch (e) { /* ignore */ }
  return { unlocked: 1, cleared: [], best: {} };
}

export function saveProgress(p) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch (e) { /* private mode */ }
}

export function zoneById(id) {
  return ZONES.find((z) => z.id === id) || ZONES[0];
}

export function isUnlocked(progress, index) {
  return index < progress.unlocked;
}

export function clearZone(progress, zoneId, score) {
  const i = ZONES.findIndex((z) => z.id === zoneId);
  if (!progress.cleared.includes(zoneId)) progress.cleared.push(zoneId);
  progress.unlocked = Math.max(progress.unlocked, Math.min(ZONES.length, i + 2));
  progress.best[zoneId] = Math.max(progress.best[zoneId] || 0, score || 0);
  saveProgress(progress);
  return progress;
}
