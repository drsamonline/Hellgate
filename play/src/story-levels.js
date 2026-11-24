// ---------------------------------------------------------------------------
// STORY LEVELS — the campaign as a table. 32 rows: id, seed, shape, objective.
//
// This is data, not logic. A row says what a level is; `storyLevelZone()` turns
// one into the zone-shaped object `buildRun()` already understands, so nothing
// in the wave loop had to learn a second vocabulary. The objective types are
// `reach`, `clear` and `survive` — the three that shipped — plus `relics`; a row
// that named a fifth would fail the table check in `tests/test-level.mjs`
// rather than silently become a wave arena.
//
// `zone` is the fifth column and it is not decoration: it picks the palette,
// bed, props and threat the level is dressed in. The seed and the shape are what
// make it a different place.
// ---------------------------------------------------------------------------

import { ZONES } from './world.js';

/**
 * The difficulty floor for each act, applied to enemy health, damage and count.
 * It lives beside the table because it is a property of the campaign, and a zone
 * already harder than its act keeps its own threat.
 */
export const ACT_THREAT = [0.8, 1.1, 1.4, 1.8];

/** The four objective types a row may name. Everything else is a typo. */
export const OBJECTIVE_TYPES = ['reach', 'clear', 'survive', 'relics'];

/**
 * The campaign: four acts of eight, one objective per level.
 *
 * `shape` overrides the zone's own room count and size, so a level is a place
 * rather than a pen. The room counts are the ones a 40×40 grid actually
 * delivers at that room size — acts III and IV carry fewer, larger rooms, and
 * the open floor area still grows from 429 cells to about 580 across the four.
 */
export const STORY_LEVELS = [
  // ---- act I — the gate, and what came through it ------------------------
  { n: 1, id: 'the-door', act: 1, title: 'The Door', zone: 'gate', seed: 'l01-gate-401',
    shape: { rooms: [8, 11], size: [4, 7], tall: 0.2 }, objective: { type: 'reach' } },
  { n: 2, id: 'first-blood', act: 1, title: 'First Blood', zone: 'gate', seed: 'l02-gate-412',
    shape: { rooms: [8, 12], size: [4, 7], tall: 0.2 }, objective: { type: 'clear' } },
  { n: 3, id: 'the-long-yard', act: 1, title: 'The Long Yard', zone: 'foundry', seed: 'l03-foundry-418',
    shape: { rooms: [9, 12], size: [4, 7], tall: 0.25 }, objective: { type: 'reach' } },
  { n: 4, id: 'broken-idols', act: 1, title: 'Broken Idols', zone: 'grove', seed: 'l04-grove-427',
    shape: { rooms: [8, 11], size: [5, 8], tall: 0.2 }, objective: { type: 'relics', relics: 3 } },
  { n: 5, id: 'the-shift', act: 1, title: 'The Shift', zone: 'foundry', seed: 'l05-foundry-433',
    shape: { rooms: [9, 13], size: [4, 7], tall: 0.25 }, objective: { type: 'survive', time: 60 } },
  { n: 6, id: 'cold-stores', act: 1, title: 'Cold Stores', zone: 'vault', seed: 'l06-vault-441',
    shape: { rooms: [9, 12], size: [5, 8], tall: 0.3 }, objective: { type: 'clear' } },
  { n: 7, id: 'the-flood-line', act: 1, title: 'The Flood Line', zone: 'cistern', seed: 'l07-cistern-449',
    shape: { rooms: [8, 11], size: [5, 8], tall: 0.15 }, objective: { type: 'reach' } },
  { n: 8, id: 'the-warden', act: 1, title: 'The Warden', zone: 'ashfall', seed: 'l08-ashfall-457',
    shape: { rooms: [9, 12], size: [5, 8], tall: 0.4 }, objective: { type: 'clear' } },

  // ---- act II — down the kiln road --------------------------------------
  { n: 9, id: 'kiln-road', act: 2, title: 'Kiln Road', zone: 'kiln', seed: 'l09-kiln-503',
    shape: { rooms: [9, 13], size: [5, 8], tall: 0.35 }, objective: { type: 'clear' } },
  { n: 10, id: 'the-crossing', act: 2, title: 'The Crossing', zone: 'cistern', seed: 'l10-cistern-511',
    shape: { rooms: [10, 13], size: [5, 8], tall: 0.3 }, objective: { type: 'reach' } },
  { n: 11, id: 'sixty-seconds', act: 2, title: 'Sixty Seconds', zone: 'kiln', seed: 'l11-kiln-519',
    shape: { rooms: [9, 13], size: [5, 8], tall: 0.35 }, objective: { type: 'survive', time: 70 } },
  { n: 12, id: 'the-reliquary', act: 2, title: 'The Reliquary', zone: 'vault', seed: 'l12-vault-527',
    shape: { rooms: [10, 14], size: [5, 8], tall: 0.35 }, objective: { type: 'relics', relics: 3 } },
  { n: 13, id: 'bone-orchard', act: 2, title: 'Bone Orchard', zone: 'grove', seed: 'l13-grove-536',
    shape: { rooms: [10, 13], size: [6, 9], tall: 0.3 }, objective: { type: 'clear' } },
  { n: 14, id: 'the-catwalk-run', act: 2, title: 'The Catwalk Run', zone: 'spine', seed: 'l14-spine-544',
    shape: { rooms: [10, 14], size: [5, 8], tall: 0.45 }, objective: { type: 'reach' } },
  { n: 15, id: 'holding-pattern', act: 2, title: 'Holding Pattern', zone: 'ashfall', seed: 'l15-ashfall-552',
    shape: { rooms: [10, 13], size: [6, 9], tall: 0.4 }, objective: { type: 'survive', time: 80 } },
  { n: 16, id: 'the-first-relic', act: 2, title: 'The First Relic', zone: 'vault', seed: 'l16-vault-561',
    shape: { rooms: [11, 14], size: [6, 9], tall: 0.4 }, objective: { type: 'relics', relics: 4 } },

  // ---- act III — the spine, and what it holds up ------------------------
  { n: 17, id: 'spine-foot', act: 3, title: 'Spine Foot', zone: 'spine', seed: 'l17-spine-607',
    shape: { rooms: [7, 11], size: [6, 9], tall: 0.5 }, objective: { type: 'clear' } },
  { n: 18, id: 'the-climb', act: 3, title: 'The Climb', zone: 'spine', seed: 'l18-spine-615',
    shape: { rooms: [7, 11], size: [6, 9], tall: 0.55 }, objective: { type: 'reach' } },
  { n: 19, id: 'high-water', act: 3, title: 'High Water', zone: 'cistern', seed: 'l19-cistern-623',
    shape: { rooms: [7, 11], size: [6, 9], tall: 0.45 }, objective: { type: 'survive', time: 85 } },
  { n: 20, id: 'the-second-vault', act: 3, title: 'The Second Vault', zone: 'vault', seed: 'l20-vault-631',
    shape: { rooms: [7, 11], size: [6, 9], tall: 0.5 }, objective: { type: 'relics', relics: 4 } },
  { n: 21, id: 'the-glass-floor', act: 3, title: 'The Glass Floor', zone: 'kiln', seed: 'l21-kiln-640',
    shape: { rooms: [7, 11], size: [6, 9], tall: 0.5 }, objective: { type: 'clear' } },
  { n: 22, id: 'the-last-bridge', act: 3, title: 'The Last Bridge', zone: 'spine', seed: 'l22-spine-648',
    shape: { rooms: [7, 11], size: [6, 9], tall: 0.6 }, objective: { type: 'reach' } },
  { n: 23, id: 'ash-clock', act: 3, title: 'Ash Clock', zone: 'ashfall', seed: 'l23-ashfall-656',
    shape: { rooms: [7, 11], size: [6, 9], tall: 0.5 }, objective: { type: 'survive', time: 90 } },
  { n: 24, id: 'the-hinge', act: 3, title: 'The Hinge', zone: 'throne', seed: 'l24-throne-665',
    shape: { rooms: [7, 11], size: [6, 9], tall: 0.55 }, objective: { type: 'clear' } },

  // ---- act IV — the throne ---------------------------------------------
  { n: 25, id: 'the-antecourt', act: 4, title: 'The Antecourt', zone: 'throne', seed: 'l25-throne-701',
    shape: { rooms: [6, 9], size: [7, 10], tall: 0.6 }, objective: { type: 'clear' } },
  { n: 26, id: 'the-idol-hall', act: 4, title: 'The Idol Hall', zone: 'vault', seed: 'l26-vault-709',
    shape: { rooms: [6, 9], size: [7, 10], tall: 0.6 }, objective: { type: 'relics', relics: 4 } },
  { n: 27, id: 'the-long-watch', act: 4, title: 'The Long Watch', zone: 'kiln', seed: 'l27-kiln-717',
    shape: { rooms: [6, 9], size: [7, 10], tall: 0.6 }, objective: { type: 'survive', time: 95 } },
  { n: 28, id: 'the-second-relic', act: 4, title: 'The Second Relic', zone: 'vault', seed: 'l28-vault-726',
    shape: { rooms: [6, 9], size: [7, 10], tall: 0.6 }, objective: { type: 'relics', relics: 5 } },
  { n: 29, id: 'the-approach', act: 4, title: 'The Approach', zone: 'spine', seed: 'l29-spine-734',
    shape: { rooms: [6, 9], size: [7, 10], tall: 0.65 }, objective: { type: 'reach' } },
  { n: 30, id: 'the-court', act: 4, title: 'The Court', zone: 'throne', seed: 'l30-throne-742',
    shape: { rooms: [6, 9], size: [7, 10], tall: 0.65 }, objective: { type: 'clear' } },
  { n: 31, id: 'the-last-minute', act: 4, title: 'The Last Minute', zone: 'ashfall', seed: 'l31-ashfall-751',
    shape: { rooms: [6, 9], size: [7, 10], tall: 0.6 }, objective: { type: 'survive', time: 100 } },
  { n: 32, id: 'the-throne', act: 4, title: 'The Throne', zone: 'throne', seed: 'l32-throne-759',
    shape: { rooms: [6, 9], size: [7, 10], tall: 0.7 }, objective: { type: 'clear' } },
];

// one lookup table, built on first use: the campaign is read, not walked
let zoneIndex = null;
function zoneByIdCached(id) {
  if (!zoneIndex) zoneIndex = new Map(ZONES.map((z) => [z.id, z]));
  return zoneIndex.get(id) || null;
}

/**
 * The row for a 1-based level number, or null when there is no such level.
 * @param {number} n 1-based level number.
 * @returns {object|null} The row, or null.
 */
export function storyLevel(n) {
  const i = Math.round(Number(n));
  if (!Number.isFinite(i) || i < 1 || i > STORY_LEVELS.length) return null;
  return STORY_LEVELS[i - 1];
}

/**
 * Turn a row into the zone-shaped definition `buildRun()` takes.
 *
 * The base zone supplies the palette, bed, props and threat; the row overrides
 * the seed, the room shape, the objective and the level's name. The zone id is
 * deliberately kept: progression, unlocks and the save format are keyed on it,
 * and a level is a place inside a zone rather than a tenth zone.
 * @param {object|null} level A row from `STORY_LEVELS`.
 * @returns {object|null} A zone definition, or null for a bad row.
 */
export function storyLevelZone(level) {
  if (!level || !level.zone) return null;
  const base = zoneByIdCached(level.zone);
  if (!base) return null;
  const o = level.objective || { type: 'clear' };
  return {
    ...base,
    name: level.title,
    seed: level.seed,
    shape: level.shape || base.shape,
    objectiveType: o.type,
    objectiveTime: o.time || 0,
    relics: o.relics || base.relics || 0,
    storyLevel: level.n,
    storyId: level.id,
  };
}
