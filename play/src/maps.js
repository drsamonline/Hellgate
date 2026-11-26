// ---------------------------------------------------------------------------
// MAPS — a level as data you can carry.
//
// The generator makes a level from a seed, which is how the game has always
// shipped: 32 rows, 32 seeds, one table. That is not a level you can edit, and it
// is not a level you can send to somebody. This turns the grid into a small
// document and back again.
//
// The format is a grid of one character per cell plus the few numbers the
// characters cannot carry, so a 40 x 40 level is 1,600 characters and not 1,600
// objects:
//
//   '#' solid   '.' open   '+' door   'X' exit   '=' stair   '^' lift   '~' crate
//   's' secret  'c' chest  'n' the helper
//
// and the heights ride beside it as run-length encoded [run, floor, ceil] triples.
// ---------------------------------------------------------------------------

const CODE = {
  solid: '#', open: '.', door: '+', exit: 'X', stair: '=',
  lift: '^', crate: '~', secret: 's', chest: 'c', npc: 'n',
};

/** One character for a cell: the most important thing about it. */
function codeOf(c) {
  if (c.npc) return CODE.npc;
  if (c.exit) return CODE.exit;
  if (c.door) return CODE.door;
  if (c.stair) return CODE.stair;
  if (c.lift) return CODE.lift;
  if (c.crate) return CODE.crate;
  if (c.secret) return CODE.secret;
  if (c.chest) return CODE.chest;
  if (c.solid) return CODE.solid;
  return CODE.open;
}

/**
 * A level as a plain object, small enough to put in a URL.
 * @param {object} level From `generateLevel()`.
 * @returns {object} The map.
 */
export function exportMap(level) {
  const { W, H, cells } = level;
  let grid = '';
  for (let z = 0; z < H; z++) {
    for (let x = 0; x < W; x++) grid += codeOf(cells[z * W + x]);
  }
  // heights, run-length encoded: a level is mostly flat, so this is short
  const runs = [];
  let prev = null;
  for (const c of cells) {
    const key = (c.floor || 0) + ':' + (c.ceil || 0);
    if (prev && prev.key === key) prev.n++;
    else {
      prev = { key, n: 1, floor: c.floor || 0, ceil: c.ceil || 0 };
      runs.push(prev);
    }
  }
  return {
    v: 1,
    w: W,
    h: H,
    grid,
    heights: runs.map((r) => [r.n, r.floor, r.ceil]),
    spawn: { x: level.spawn.x, z: level.spawn.z },
    exit: { x: level.exit.x, z: level.exit.z },
    rooms: level.rooms.map((r) => [r.x, r.z, r.w, r.h, r.cx, r.cz, r.ceil || 0]),
    spawnRoom: level.spawnRoom || 0,
    exitRoom: level.exitRoom || 0,
  };
}

/**
 * A level from a map. The parts a map cannot carry — reachability, the crate
 * list, the terminal text — are rebuilt from the grid.
 * @param {object} map From `exportMap()` or a shared file.
 * @returns {object|null} A level, or null when the map is not one.
 */
export function importMap(map) {
  if (!map || map.v !== 1 || !Number.isFinite(map.w) || !Number.isFinite(map.h)) return null;
  const W = Math.round(map.w);
  const H = Math.round(map.h);
  if (typeof map.grid !== 'string' || map.grid.length !== W * H) return null;

  const cells = new Array(W * H);
  for (let i = 0; i < cells.length; i++) {
    const ch = map.grid[i];
    cells[i] = {
      x: i % W, z: Math.floor(i / W),
      // a secret wall is walk-through after it breaks, so it is not solid
      solid: ch === CODE.solid,
      floor: 0, ceil: 0,
      wall: 0, floorTex: 0, ceilTex: 0,
      room: -1,
    };
  }
  // heights
  let i = 0;
  for (const run of map.heights || []) {
    const [n, floor, ceil] = run;
    for (let k = 0; k < n && i < cells.length; k++, i++) {
      cells[i].floor = floor;
      cells[i].ceil = ceil;
    }
  }
  // the things a character means
  const crates = [];
  const stairs = [];
  const lifts = [];
  const chests = [];
  const secrets = [];
  const doors = [];
  let npc = null;
  for (let k = 0; k < cells.length; k++) {
    const c = cells[k];
    const ch = map.grid[k];
    if (ch === CODE.door) { c.door = true; doors.push(c); }
    else if (ch === CODE.exit) c.exit = true;
    else if (ch === CODE.stair) { c.stair = 'z'; stairs.push({ x: c.x, z: c.z, along: 'z', low: c.floor, high: c.floor + 1.2 }); }
    else if (ch === CODE.lift) { c.lift = { low: c.floor, high: c.floor + 2.4, y: c.floor, dir: 1, wait: 0 }; lifts.push({ x: c.x, z: c.z, cell: c }); }
    else if (ch === CODE.crate) { c.crate = true; crates.push({ x: c.x, z: c.z, wx: c.x * 2, wz: c.z * 2, idx: k, hp: 45, broken: false }); }
    else if (ch === CODE.chest) { c.chest = true; chests.push({ x: c.x, z: c.z }); }
    else if (ch === CODE.secret) {
      c.secret = true;
      // the mesh builder indexes the grid by `idx`, so a map has to carry it
      secrets.push({ x: c.x, z: c.z, wx: c.x * 2, wz: c.z * 2, idx: k, broken: false });
    }
    else if (ch === CODE.npc) { npc = { x: c.x, z: c.z, wx: c.x * 2, wz: c.z * 2 }; }
  }
  // rooms and reachability, from the grid
  const rooms = (map.rooms || []).map(([x, z, w, h, cx, cz, ceil]) => ({ x, z, w, h, cx, cz, ceil }));
  for (const r of rooms) {
    for (let z = r.z; z < r.z + r.h; z++) {
      for (let x = r.x; x < r.x + r.w; x++) {
        const c = cells[z * W + x];
        if (c && !c.solid) c.room = rooms.indexOf(r);
      }
    }
  }
  const openCells = [];
  for (const c of cells) {
    if (!c.solid && !c.door) openCells.push({ x: c.x, z: c.z, wx: c.x * 2, wz: c.z * 2, room: c.room });
  }
  const spawn = { x: map.spawn.x, z: map.spawn.z };
  const exit = { x: map.exit.x, z: map.exit.z, cx: Math.round(map.exit.x / 2), cz: Math.round(map.exit.z / 2) };
  return {
    seed: 'map',
    // what ends the level: the map says, and the editor is where it is chosen
    objective: map.objective && map.objective.type ? { ...map.objective } : null,
    W, H, cells, rooms,
    spawn,
    exit,
    exitRoom: map.exitRoom || 0,
    spawnRoom: map.spawnRoom || 0,
    doors, door: doors.length ? doors[0] : null, doorOpen: false,
    openCells,
    // every open cell, because a map does not carry the generator's flood fill
    reachableCells: openCells.slice(),
    reach: new Uint8Array(W * H).fill(1),
    reachCount: openCells.length,
    spawnRoomExits: [],
    crates, stairs, lifts, chests, npc,
    secrets,
    broken: new Set(),
    idx: (x, z) => z * W + x,
  };
}

/** The map as a string, for a URL or a file. */
export function mapToJSON(map) {
  return JSON.stringify(map);
}

/** A map from a string, or null. */
export function mapFromJSON(text) {
  try { return importMap(JSON.parse(text)); } catch (e) { return null; }
}
