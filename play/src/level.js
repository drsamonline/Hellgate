// ---------------------------------------------------------------------------
// LEVEL GEN + COLLISION
// Pure data + math, no Three.js import, so it can be unit-tested headlessly.
// The grid is a 2.5D sector map: every cell is either solid rock or a walkable
// sector with its own floor height, ceiling height and texture ids.
// ---------------------------------------------------------------------------

import { makeRng } from './rng.js';

export const CELL = 2.0;      // world units per grid cell
export const MAX_STEP = 0.5;  // highest ledge the player can walk up

const W = 40;
const H = 40;

const WALL_TEX = ['brick', 'tech'];
const FLOOR_TEX = ['tile', 'plate'];

export function generateLevel(seed) {
  const rng = makeRng(seed);
  const idx = (x, z) => z * W + x;
  const cells = [];

  for (let z = 0; z < H; z++) {
    for (let x = 0; x < W; x++) {
      cells.push({
        x, z,
        solid: true,
        floor: 0,
        ceil: 3.0,
        wall: 1,
        floorTex: 1,
        ceilTex: 0,
        door: false,
        exit: false,
        room: -1,
      });
    }
  }

  // ---- rooms ------------------------------------------------------------
  const rooms = [];
  const want = rng.int(9, 13);
  let tries = 0;
  while (rooms.length < want && tries < 800) {
    tries++;
    const w = rng.int(4, 8);
    const h = rng.int(4, 8);
    const x = rng.int(2, W - w - 3);
    const z = rng.int(2, H - h - 3);
    let ok = true;
    for (const o of rooms) {
      if (x < o.x + o.w + 2 && x + w + 2 > o.x && z < o.z + o.h + 2 && z + h + 2 > o.z) {
        ok = false;
        break;
      }
    }
    if (!ok) continue;
    rooms.push({
      x, z, w, h,
      cx: x + (w >> 1),
      cz: z + (h >> 1),
      ceil: rng.chance(0.35) ? rng.range(5.4, 6.8) : rng.range(3.2, 3.9),
      wall: rng.int(0, 1),
      floorTex: rng.int(0, 1),
      floor: 0,
    });
  }

  rooms.forEach((r, i) => {
    for (let z = r.z; z < r.z + r.h; z++) {
      for (let x = r.x; x < r.x + r.w; x++) {
        const c = cells[idx(x, z)];
        c.solid = false;
        c.floor = r.floor;
        c.ceil = r.ceil;
        c.wall = r.wall;
        c.floorTex = r.floorTex;
        c.room = i;
      }
    }
  });

  // ---- corridors --------------------------------------------------------
  const carve = (x, z) => {
    if (x < 1 || z < 1 || x >= W - 1 || z >= H - 1) return;
    const c = cells[idx(x, z)];
    if (!c.solid) return;
    c.solid = false;
    c.floor = 0;
    c.ceil = 3.0;
    c.wall = 1;
    c.floorTex = 1;
  };

  const link = (a, b) => {
    let x = a.cx;
    let z = a.cz;
    const horizFirst = rng.chance(0.5);
    const stepX = () => { while (x !== b.cx) { carve(x, z); x += Math.sign(b.cx - x); } };
    const stepZ = () => { while (z !== b.cz) { carve(x, z); z += Math.sign(b.cz - z); } };
    if (horizFirst) { stepX(); stepZ(); } else { stepZ(); stepX(); }
    carve(x, z);
  };

  for (let i = 1; i < rooms.length; i++) link(rooms[i - 1], rooms[i]);
  // a couple of loops so the arena is not a pure corridor chain
  for (let k = 0; k < 2 && rooms.length > 3; k++) {
    const a = rooms[rng.int(0, rooms.length - 1)];
    const b = rooms[rng.int(0, rooms.length - 1)];
    if (a !== b) link(a, b);
  }

  // ---- raised ledges (exercise the step-up code) -------------------------
  for (let k = 0; k < 2; k++) {
    const r = rooms[rng.int(1, rooms.length - 1)];
    if (!r || r.w < 5 || r.h < 5) continue;
    for (let z = r.z + 1; z < r.z + r.h - 1; z++) {
      for (let x = r.x + 1; x < r.x + r.w - 1; x++) {
        if (rng.chance(0.5)) continue;
        cells[idx(x, z)].floor = MAX_STEP;
      }
    }
  }

  // ---- spawn / exit -----------------------------------------------------
  const spawnRoom = rooms[0];
  const spawnCell = { x: spawnRoom.cx, z: spawnRoom.cz };
  const spawn = { x: spawnRoom.cx * CELL, z: spawnRoom.cz * CELL };

  let exitRoomIdx = 1;
  let bestD = -1;
  for (let i = 1; i < rooms.length; i++) {
    const d = Math.hypot(rooms[i].cx - spawnRoom.cx, rooms[i].cz - spawnRoom.cz);
    if (d > bestD) { bestD = d; exitRoomIdx = i; }
  }
  const exitRoom = rooms[exitRoomIdx];
  const exitCell = { x: exitRoom.cx, z: exitRoom.cz };
  cells[idx(exitCell.x, exitCell.z)].exit = true;

  // ---- doors ------------------------------------------------------------
  // A door belongs where a corridor actually *enters* the exit room. A corridor
  // running parallel to the room also shares open boundary cells with it, and
  // marking all of those would build a wall of ten doors — so a candidate only
  // counts if it has a corridor neighbour that is not itself against the room,
  // i.e. the path turns away from the room at that cell.
  const touchesExitRoom = (x, z) => {
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx2 = x + dx;
      const nz2 = z + dz;
      if (nx2 < 0 || nz2 < 0 || nx2 >= W || nz2 >= H) continue;
      const n = cells[idx(nx2, nz2)];
      if (!n.solid && n.room === exitRoomIdx) return true;
    }
    return false;
  };

  const doors = [];
  const fallback = [];
  for (let z = 1; z < H - 1; z++) {
    for (let x = 1; x < W - 1; x++) {
      const c = cells[idx(x, z)];
      if (c.solid || c.room !== -1) continue;
      if (!touchesExitRoom(x, z)) continue;
      fallback.push({ x, z });
      let onward = 0;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const n = cells[idx(x + dx, z + dz)];
        if (n.solid || n.room !== -1) continue;
        if (!touchesExitRoom(x + dx, z + dz)) onward++;
      }
      if (onward > 0) doors.push({ x, z, onward });
    }
  }
  doors.sort((a, b) => b.onward - a.onward);
  const chosen = doors.slice(0, 3);
  if (!chosen.length && fallback.length) chosen.push(fallback[0]);
  for (const d of chosen) cells[idx(d.x, d.z)].door = true;
  const doorCells = chosen.map((d) => ({ x: d.x, z: d.z }));

  // Seal the rest: any other corridor cell sharing a boundary with the exit
  // room goes back to solid rock, so the room is entered through its doors
  // only. Reverted wholesale if that would cut the map in two.
  const sealable = fallback.filter((f) => !doorCells.some((d) => d.x === f.x && d.z === f.z));
  if (sealable.length) {
    const snapshot = sealable.map((f) => ({ ...cells[idx(f.x, f.z)] }));
    for (const f of sealable) cells[idx(f.x, f.z)].solid = true;
    if (!allRoomsReachable(cells, W, H, spawnCell, rooms.length, exitCell)) {
      sealable.forEach((f, i) => Object.assign(cells[idx(f.x, f.z)], snapshot[i]));
    }
  }

  // ---- open floor list --------------------------------------------------
  const openCells = [];
  for (let z = 0; z < H; z++) {
    for (let x = 0; x < W; x++) {
      const c = cells[idx(x, z)];
      if (c.solid || c.door) continue;
      openCells.push({ x, z, wx: x * CELL, wz: z * CELL, room: c.room });
    }
  }

  return {
    seed: String(seed),
    W, H, cells, rooms,
    spawn,
    exit: { x: exitCell.x * CELL, z: exitCell.z * CELL, cx: exitCell.x, cz: exitCell.z },
    exitRoom: exitRoomIdx,
    doors: doorCells,
    door: doorCells.length ? doorCells[0] : null,
    doorOpen: false,
    openCells,
    idx,
  };
}

// Flood fill from the spawn with doors treated as passable. True when every
// room still has at least one reachable cell and the exit pad is reachable.
function allRoomsReachable(cells, W, H, start, roomCount, exitCell) {
  const seen = new Uint8Array(W * H);
  const stack = [start.z * W + start.x];
  const roomsSeen = new Set();
  let exitOk = false;
  while (stack.length) {
    const k = stack.pop();
    if (seen[k]) continue;
    const c = cells[k];
    if (!c || c.solid) continue;
    seen[k] = 1;
    if (c.room >= 0) roomsSeen.add(c.room);
    if (c.exit) exitOk = true;
    const x = k % W;
    const z = (k - x) / W;
    if (x > 0) stack.push(k - 1);
    if (x < W - 1) stack.push(k + 1);
    if (z > 0) stack.push(k - W);
    if (z < H - 1) stack.push(k + W);
  }
  return exitOk && roomsSeen.size >= roomCount;
}

// ---------------------------------------------------------------------------
// Collision queries
// ---------------------------------------------------------------------------

export function cellAt(level, x, z) {
  const cx = Math.round(x / CELL);
  const cz = Math.round(z / CELL);
  if (cx < 0 || cz < 0 || cx >= level.W || cz >= level.H) return null;
  return level.cells[cz * level.W + cx];
}

export function isBlocked(level, x, z) {
  const c = cellAt(level, x, z);
  if (!c) return true;
  if (c.solid) return true;
  if (c.door && !level.doorOpen) return true;
  return false;
}

export function floorHeightAt(level, x, z) {
  const c = cellAt(level, x, z);
  return c ? c.floor : 0;
}

export function ceilHeightAt(level, x, z) {
  const c = cellAt(level, x, z);
  return c ? c.ceil : 3;
}

// circle vs. axis-aligned blocked cells
export function circleBlocked(level, x, z, r) {
  const c0 = Math.floor((x - r) / CELL) - 1;
  const c1 = Math.ceil((x + r) / CELL) + 1;
  const d0 = Math.floor((z - r) / CELL) - 1;
  const d1 = Math.ceil((z + r) / CELL) + 1;
  for (let cz = d0; cz <= d1; cz++) {
    for (let cx = c0; cx <= c1; cx++) {
      const c = (cx < 0 || cz < 0 || cx >= level.W || cz >= level.H)
        ? null
        : level.cells[cz * level.W + cx];
      const blocked = !c || c.solid || (c.door && !level.doorOpen);
      if (!blocked) continue;
      const minX = (cx - 0.5) * CELL;
      const maxX = (cx + 0.5) * CELL;
      const minZ = (cz - 0.5) * CELL;
      const maxZ = (cz + 0.5) * CELL;
      const px = Math.max(minX, Math.min(x, maxX));
      const pz = Math.max(minZ, Math.min(z, maxZ));
      const dx = x - px;
      const dz = z - pz;
      if (dx * dx + dz * dz < r * r) return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Ray vs. sector walls (grid march). Returns the first blocking hit.
// ---------------------------------------------------------------------------

export function raycastWalls(level, origin, dir, maxDist, step = 0.09) {
  let t = 0.02;
  let prevCx = Math.round(origin.x / CELL);
  let prevCz = Math.round(origin.z / CELL);

  while (t <= maxDist) {
    const x = origin.x + dir.x * t;
    const y = origin.y + dir.y * t;
    const z = origin.z + dir.z * t;
    const cx = Math.round(x / CELL);
    const cz = Math.round(z / CELL);

    if (cx < 0 || cz < 0 || cx >= level.W || cz >= level.H) {
      return { dist: t, point: { x, y, z }, normal: axisNormal(x, z, prevCx, prevCz) };
    }

    const c = level.cells[cz * level.W + cx];
    if (c.solid || (c.door && !level.doorOpen)) {
      return { dist: t, point: { x, y, z }, normal: axisNormal(x, z, prevCx, prevCz) };
    }
    if (y <= c.floor) return { dist: t, point: { x, y, z }, normal: { x: 0, y: 1, z: 0 } };
    if (y >= c.ceil) return { dist: t, point: { x, y, z }, normal: { x: 0, y: -1, z: 0 } };

    prevCx = cx;
    prevCz = cz;
    t += step;
  }
  return null;
}

function axisNormal(x, z, prevCx, prevCz) {
  const px0 = (prevCx - 0.5) * CELL;
  const px1 = (prevCx + 0.5) * CELL;
  const pz0 = (prevCz - 0.5) * CELL;
  const pz1 = (prevCz + 0.5) * CELL;
  if (x < px0 - 1e-6 || x > px1 + 1e-6) return { x: x > px1 ? -1 : 1, y: 0, z: 0 };
  return { x: 0, y: 0, z: z > pz1 ? -1 : 1 };
}

// ---------------------------------------------------------------------------
// Navigation
// A breadth-first flow field over the grid, rebuilt from the player's cell and
// shared by every enemy. This is what stops a grunt grinding against the wrong
// side of a wall: it walks toward the next cell on the path, not at the player.
// ---------------------------------------------------------------------------

export function buildFlowField(level, tx, tz) {
  const W = level.W;
  const H = level.H;
  const dist = new Int32Array(W * H).fill(-1);

  let cx = Math.round(tx / CELL);
  let cz = Math.round(tz / CELL);
  cx = Math.max(0, Math.min(W - 1, cx));
  cz = Math.max(0, Math.min(H - 1, cz));

  // if the player is standing in a blocked cell (should not happen), search out
  let start = cz * W + cx;
  if (level.cells[start].solid) {
    let found = -1;
    for (let r = 1; r <= 3 && found < 0; r++) {
      for (let dz = -r; dz <= r && found < 0; dz++) {
        for (let dx = -r; dx <= r && found < 0; dx++) {
          const nx = cx + dx;
          const nz = cz + dz;
          if (nx < 0 || nz < 0 || nx >= W || nz >= H) continue;
          if (!level.cells[nz * W + nx].solid) found = nz * W + nx;
        }
      }
    }
    if (found < 0) return dist;
    start = found;
  }

  dist[start] = 0;
  const queue = new Int32Array(W * H);
  let head = 0;
  let tail = 0;
  queue[tail++] = start;

  while (head < tail) {
    const k = queue[head++];
    const x = k % W;
    const z = (k - x) / W;
    const from = level.cells[k];
    const d = dist[k] + 1;

    for (let i = 0; i < 4; i++) {
      const nx = x + (i === 0 ? 1 : i === 1 ? -1 : 0);
      const nz = z + (i === 2 ? 1 : i === 3 ? -1 : 0);
      if (nx < 0 || nz < 0 || nx >= W || nz >= H) continue;
      const nk = nz * W + nx;
      if (dist[nk] !== -1) continue;
      const c = level.cells[nk];
      if (c.solid) continue;
      if (c.door && !level.doorOpen) continue;
      if (c.floor - from.floor > MAX_STEP) continue;
      dist[nk] = d;
      queue[tail++] = nk;
    }
  }
  return dist;
}

// The unit direction to the neighbouring cell one step closer to the target.
// Returns null when there is no path (or the enemy is already in the target cell).
export function flowStep(level, field, x, z) {
  if (!field) return null;
  const W = level.W;
  const cx = Math.round(x / CELL);
  const cz = Math.round(z / CELL);
  if (cx < 0 || cz < 0 || cx >= level.W || cz >= level.H) return null;
  const here = field[cz * W + cx];
  if (here <= 0) return null; // unreachable, or already at the target

  let best = here;
  let bx = 0;
  let bz = 0;
  for (let i = 0; i < 4; i++) {
    const dx = i === 0 ? 1 : i === 1 ? -1 : 0;
    const dz = i === 2 ? 1 : i === 3 ? -1 : 0;
    const nx = cx + dx;
    const nz = cz + dz;
    if (nx < 0 || nz < 0 || nx >= level.W || nz >= level.H) continue;
    const d = field[nz * W + nx];
    if (d === -1 || d >= best) continue;
    best = d;
    bx = dx;
    bz = dz;
  }
  if (!bx && !bz) return null;
  return { x: bx, z: bz };
}

export function hasLineOfSight(level, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dz = b.z - a.z;
  const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (dist < 0.01) return true;
  const hit = raycastWalls(
    level,
    a,
    { x: dx / dist, y: dy / dist, z: dz / dist },
    dist - 0.05,
    0.22
  );
  return !hit;
}
