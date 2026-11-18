// ---------------------------------------------------------------------------
// CLASSES — three ways to play, chosen before a run.
// A class sets your body, your starting weapon and which powers you can cast.
// ---------------------------------------------------------------------------

/**
 * The three playable classes. Each sets a body, a starting weapon and a power set.
 */
export const CLASSES = [
  {
    id: 'marine',
    name: 'MARINE',
    blurb: 'Balanced. Starts with the shotgun. Takes a hit without flinching.',
    hp: 110,
    armor: 25,
    speed: 1.0,
    damage: 1.0,
    energy: 100,
    weapon: 1,
    powers: ['dash', 'shockwave', 'ward'],
  },
  {
    id: 'ranger',
    name: 'RANGER',
    blurb: 'Fast and fragile. Hits harder with every weapon, and dies faster.',
    hp: 85,
    armor: 10,
    speed: 1.16,
    damage: 1.18,
    energy: 130,
    weapon: 0,
    powers: ['dash', 'volley', 'ward'],
  },
  {
    id: 'warden',
    name: 'WARDEN',
    blurb: 'Heavy. Slow. Starts with rockets and a wall of armour.',
    hp: 135,
    armor: 60,
    speed: 0.9,
    damage: 0.92,
    energy: 80,
    weapon: 2,
    powers: ['shockwave', 'bulwark', 'dash'],
  },
];

/**
 * Look a class up by id, falling back to the first.
 */
export function getClass(id) {
  return CLASSES.find((c) => c.id === id) || CLASSES[0];
}
