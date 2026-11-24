// ---------------------------------------------------------------------------
// SIM RNG — the randomness the simulation is allowed to have.
//
// A replay is only worth having if the run it replays is the same run. That
// means every random number that changes what happens in the world has to come
// from a stream the seed controls — an enemy's wander angle, the cell a wave
// spawns on, whether a body flinches. Cosmetic randomness (particle jitter,
// music, texture noise) stays on Math.random: it changes nothing you can see in
// the state, and routing it through the stream would spend the stream.
//
// `level.js` keeps its own generator rng; this is the run's.
// ---------------------------------------------------------------------------

/** FNV-1a: a string seed into a 32-bit number. */
export function hashSeed(str) {
  let h = 2166136261;
  const s = String(str == null ? '' : str);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

let state = 1;
let draws = 0;

/**
 * Start the run's stream from a seed. Called once per level, in `buildRun()`.
 * @param {string|number} seed The run's seed.
 */
export function seedSim(seed) {
  state = hashSeed(seed) || 1;
  draws = 0;
}

/**
 * The next number in the stream, 0..1. Mulberry32: one multiply, one xor-shift,
 * no state beyond a uint32 — cheap enough to call in the enemy update.
 * @returns {number} A number in [0, 1).
 */
export function simRand() {
  draws++;
  state = (state + 0x6d2b79f5) | 0;
  let t = Math.imul(state ^ (state >>> 15), 1 | state);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/**
 * An integer in [a, b], inclusive, from the stream.
 * @param {number} a Low end.
 * @param {number} b High end.
 * @returns {number} An integer.
 */
export function simInt(a, b) {
  return a + Math.floor(simRand() * (b - a + 1));
}

/** How many numbers this run has drawn, for a replay header and for the tests. */
export function simDraws() {
  return draws;
}
