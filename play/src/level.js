// ---------------------------------------------------------------------------
// LEVEL GEN + COLLISION
// Pure data + math, no Three.js import, so it can be unit-tested headlessly.
// The grid is a 2.5D sector map: every cell is either solid rock or a walkable
// sector with its own floor height, ceiling height and texture ids.
// ---------------------------------------------------------------------------

import { makeRng } from './rng.js';

/**
 * World units per grid cell.
 */
export const CELL = 2.0;
/**
 * Tallest ledge the player and the enemies can walk up.
 */
export const MAX_STEP = 0.5;

const W = 40;
const H = 40;

const WALL_TEX = ['brick', 'tech'];
const FLOOR_TEX = ['tile', 'plate'];

/**
 * Build a whole level from a seed string. Pure data: no Three.js, no DOM, no clock.
 */
/**
 * Generate a level, and refuse a layout whose spawn is a box.
 *
 * A room whose only exits are door cells cannot be left until the wave is clear,
 * and the wave cannot be cleared from inside it. Rather than trust that the
 * generator never does that, it is checked and the seed is re-rolled.
 */
export function generateLevel(seed, opts = {}) {
  let best = null;
  for (let attempt = 0; attempt < 8; attempt++) {
    const s = attempt === 0 ? seed : seed + '#' + attempt;
    const level = buildLevel(s, opts);
    if (!best) best = level;
    // 220 cells is roughly a quarter of a level: enough to move, fight and find
    // the rest of the floor
    if (level.reachCount >= 220 && level.spawnRoomExits >= 1) return level;
    if (level.reachCount > best.reachCount) best = level;
  }
  return best;
}

function buildLevel(seed, opts = {}) {
  const rng = makeRng(seed);
  // A zone shapes its own floor plan: how many rooms, how big, how tall. Without
  // this every zone is the same 9-13 rooms of 4-8 cells and the map reads as the
  // same place in a different colour.
  const shape = {
    rooms: [9, 13],
    size: [4, 8],
    tall: 0.35,
    ...opts,
  };
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
  const want = rng.int(shape.rooms[0], shape.rooms[1]);
  let tries = 0;
  while (rooms.length < want && tries < 800) {
    tries++;
    const w = rng.int(shape.size[0], shape.size[1]);
    const h = rng.int(shape.size[0], shape.size[1]);
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
      ceil: rng.chance(shape.tall) ? rng.range(5.4, 6.8) : rng.range(3.2, 3.9),
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

  // ---- stair reconciliation ---------------------------------------------
  // Corridors are carved at floor 0 and can meet a raised platform at its edge.
  // Any open cell that touches a platform without being one becomes a stair, so
  // the height change is walkable instead of a wall the pathfinder refuses.
  const reconcileStairs = () => {
    for (let z = 1; z < H - 1; z++) {
      for (let x = 1; x < W - 1; x++) {
        const c = cells[idx(x, z)];
        if (c.solid || c.stair || c.platform) continue;
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const n = cells[idx(x + dx, z + dz)];
          if (!n || n.solid || !n.platform) continue;
          if (n.floor <= c.floor + MAX_STEP) continue;
          c.stair = dx !== 0 ? 'x' : 'z';
          c.flip = dx < 0 || dz < 0;
          c.stairLow = c.floor;
          c.stairHigh = n.floor;
          stairs.push({ x, z, along: c.stair, low: c.stairLow, high: c.stairHigh, flip: c.flip });
          break;
        }
      }
    }
  };

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

  // Reachability check used to accept or roll back a platform: a raised room
  // that seals a corridor is worse than no stairs at all.
  const reachableFrom = (startX, startZ) => {
    const seen = new Uint8Array(W * H);
    const q = [startZ * W + startX];
    seen[q[0]] = 1;
    let n = 1;
    for (let head = 0; head < q.length; head++) {
      const k = q[head];
      const x = k % W;
      const z = (k - x) / W;
      const from = cells[k];
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx;
        const nz = z + dz;
        if (nx < 0 || nz < 0 || nx >= W || nz >= H) continue;
        const nk = nz * W + nx;
        if (seen[nk]) continue;
        const c = cells[nk];
        if (c.solid) continue;
        if (!(c.stair || from.stair) && c.floor - from.floor > MAX_STEP) continue;
        seen[nk] = 1;
        n++;
        q.push(nk);
      }
    }
    return { seen, n };
  };

  const openCount = () => cells.filter((c) => !c.solid).length;

  // ---- raised platforms with a stair band -------------------------------
  // A room can carry a dais: part of its floor is lifted, and the one-cell band
  // between the two levels is a stair that interpolates across the cell. Height
  // changes stop being a hard cliff you have to jump.
  const stairs = [];
  const lifts = [];
  rooms.forEach((r, i) => {
    if (i === exitRoomIdx) return; // the exit pad stays flat
    const snapshot = [];
    for (let z = r.z; z < r.z + r.h; z++) {
      for (let x = r.x; x < r.x + r.w; x++) {
        const c = cells[idx(x, z)];
        snapshot.push([c, c.floor, c.stair, c.stairLow, c.stairHigh, c.flip, c.platform]);
      }
    }
    const stairsBefore = stairs.length;
    if (r.w < 5 || r.h < 5 || !rng.chance(0.75)) return;
    const rise = rng.range(0.8, 1.4); // three steps of at most 0.47
    const along = rng.chance(0.5); // steps run along x or z
    const from = along ? r.z + 2 : r.x + 2;
    const to = along ? r.z + r.h - 1 : r.x + r.w - 1;
    if (to - from < 2) return;
    const band = along ? from : from;

    // A dais is one clean rise. A 0.5 m ledge already standing in this room would
    // put the platform half a metre above the top of the band, so the band would
    // climb more than three MAX_STEPs and leave a seam at the platform. The room
    // is levelled to its own floor first; the snapshot above puts it back if the
    // platform seals the level.
    for (let z = r.z; z < r.z + r.h; z++) {
      for (let x = r.x; x < r.x + r.w; x++) cells[idx(x, z)].floor = r.floor;
    }

    for (let z = r.z; z < r.z + r.h; z++) {
      for (let x = r.x; x < r.x + r.w; x++) {
        const c = cells[idx(x, z)];
        const coord = along ? z : x;
        if (coord === band) {
          c.stair = along ? 'z' : 'x';
          c.stairLow = c.floor;
          // The floor the band actually joins: the cell one step up the climb,
          // with the same rise applied. `c.floor + rise` put the top of the ramp
          // 0.5 m below the platform whenever that cell already stood on a
          // raised ledge — a seam exactly MAX_STEP tall, and over it once the
          // ramp was half a cell short.
          const ahead = along ? cells[idx(x, z + 1)] : cells[idx(x + 1, z)];
          c.stairHigh = (ahead ? ahead.floor : c.floor) + rise;
          stairs.push({ x, z, along, low: c.stairLow, high: c.stairHigh });
        } else if (coord > band) {
          c.floor = c.floor + rise;
          c.platform = true;
        }
      }
    }
    reconcileStairs();

    // the platform has to leave the level walkable; if it does not, put it back
    const { n } = reachableFrom(spawnCell.x, spawnCell.z);
    if (n < openCount()) {
      for (const [c, floor, stair, low, high, flip, platform] of snapshot) {
        c.floor = floor;
        c.stair = stair;
        c.stairLow = low;
        c.stairHigh = high;
        c.flip = flip;
        c.platform = platform;
      }
      stairs.length = stairsBefore;
    }
  });


  // ---- chests: money, and a reason to search a room ----------------------
  // Coins come from chests (and from kills). A chest is what turns "clear the
  // room and walk to the pad" into "look around first".
  const chests = [];
  {
    const spots = [];
    // the same flood fill the platforms use, so a chest is never behind a wall
    const seen = reachableFrom(spawnCell.x, spawnCell.z).seen;
    for (const c of cells) {
      if (c.solid || c.crate || c.door || c.exit || c.stair || c.sectors) continue;
      if (c.room < 0) continue;
      if (Math.hypot(c.x * CELL - spawn.x, c.z * CELL - spawn.z) < 6) continue;
      if (!seen[c.z * W + c.x]) continue;
      spots.push(c);
    }
    const want = 1 + rng.int(0, 2);
    for (let i = 0; i < want && spots.length; i++) {
      const c = spots.splice(rng.int(0, spots.length - 1), 1)[0];
      c.chest = true;
      chests.push({ x: c.x, z: c.z, wx: c.x * CELL, wz: c.z * CELL, coins: 25 + rng.int(0, 4) * 15, opened: false });
    }
  }

  // ---- catwalks (#37, step one) -----------------------------------------
  // A tall room gets a deck at 2.4 m across one side, with the floor below still
  // walkable: two sectors in one cell, which is the whole point of the sector
  // model. Two stair cells climb to it — one cell cannot, because a single band
  // may only rise 3 x MAX_STEP and the deck is 2.4 m up.
  const CATWALK_H = 2.4;
  for (const [i, r] of rooms.entries()) {
    if (i === exitRoomIdx || i === 0) continue;
    // tall enough to walk under, wide enough for a deck and two ramps
    if (r.ceil < 4.6) continue;
    const along = rng.chance(0.5);
    const span = along ? r.w : r.h;
    // one cell of deck, two of ramp, and a cell to walk in from: a 5-wide room
    // holds a catwalk if the deck is one deep
    if (span < 5 || (along ? r.h : r.w) < 5) continue;
    // the deck: two cells deep along the low side of the room
    const deck = [];
    for (let k = 0; k < 1; k++) {
      for (let m = 1; m < span - 1; m++) {
        const x = along ? r.x + m : r.x + 1 + k;
        const z = along ? r.z + 1 + k : r.z + m;
        const c = cells[idx(x, z)];
        if (c.solid || c.stair || c.platform) continue;
        deck.push({ x, z, c });
      }
    }
    if (deck.length < 3) continue;
    // two stair cells in front of the deck: the far one climbs 0 -> 1.2, the near
    // one 1.2 -> 2.4, and both ramps climb towards the deck
    const mid = along ? r.x + (r.w >> 1) : r.z + (r.h >> 1);
    const near = along ? { x: mid, z: r.z + 2 } : { x: r.x + 2, z: mid };
    const far = along ? { x: mid, z: r.z + 3 } : { x: r.x + 3, z: mid };
    const nc = cells[idx(near.x, near.z)];
    const fc = cells[idx(far.x, far.z)];
    if (!nc || !fc || nc.solid || fc.solid || nc.stair || fc.stair || nc.platform || fc.platform) continue;
    for (const d of deck) {
      d.c.sectors = [{ floor: d.c.floor }, { floor: d.c.floor + CATWALK_H, catwalk: true }];
    }
    const axis = along ? 'z' : 'x';
    for (const [cell, lo, hi] of [[fc, fc.floor, fc.floor + CATWALK_H / 2], [nc, nc.floor + CATWALK_H / 2, nc.floor + CATWALK_H]]) {
      cell.stair = axis;
      cell.flip = true;                 // both ramps climb towards the deck
      cell.stairLow = lo;
      cell.stairHigh = hi;
      stairs.push({ x: cell.x, z: cell.z, along: axis, low: lo, high: hi, flip: true });
    }
    break;                              // one catwalk per level, for step one
  }

  // ---- a lift (#50, on the sector model) --------------------------------
  // One cell rises between the room floor and a balcony 2.4 m up. The balcony is
  // just a second sector — the deck machinery already draws those — so the only
  // new thing is the cell whose floor moves.
  for (const [i, r] of rooms.entries()) {
    if (i === exitRoomIdx || i === 0) continue;
    if (r.ceil < 4.6 || r.w < 4 || r.h < 4) continue;
    const lx = r.x + 1;
    const lz = r.z + 2;
    const bx = r.x + 2;
    const lc = cells[idx(lx, lz)];
    const bc = cells[idx(bx, lz)];
    if (!lc || !bc || lc.solid || bc.solid || lc.stair || bc.stair || lc.sectors || bc.sectors) continue;
    if (lc.platform || bc.platform) continue;
    bc.sectors = [{ floor: bc.floor }, { floor: bc.floor + 2.4, catwalk: true }];
    lc.lift = { low: lc.floor, high: lc.floor + 2.4, y: lc.floor, dir: 1, wait: 0 };
    lifts.push({ x: lx, z: lz, cell: lc });
    break;
  }

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

  // ---- secret rooms -----------------------------------------------------
  // One per level: a solid cell on the edge of a room, with a one-cell alcove
  // carved behind it. The wall looks like every other wall until you break it.
  const secrets = [];
  {
    const candidates = [];
    for (const [i, r] of rooms.entries()) {
      if (i === exitRoomIdx) continue;
      // Every wall cell of the room, walked along the axis the wall runs on. The
      // old version held x fixed for the north and south walls and iterated z,
      // so those two walls offered only the room's corners — 4 walls' worth of
      // candidates became 2 walls plus 2 corner cells, and a secret on the south
      // wall was never offered at all.
      const edges = [];
      for (let z = r.z; z < r.z + r.h; z++) edges.push([r.x - 1, z, -1, 0]);
      for (let z = r.z; z < r.z + r.h; z++) edges.push([r.x + r.w, z, 1, 0]);
      for (let x = r.x; x < r.x + r.w; x++) edges.push([x, r.z - 1, 0, -1]);
      for (let x = r.x; x < r.x + r.w; x++) edges.push([x, r.z + r.h, 0, 1]);
      for (const [sx, sz, dx, dz] of edges) {
        if (sx < 2 || sz < 2 || sx >= W - 2 || sz >= H - 2) continue;
        const c = cells[idx(sx, sz)];
        const behind = cells[idx(sx + dx, sz + dz)];
        if (!c.solid || !behind.solid) continue;
        // the alcove has to be free of any other room or corridor
        if (behind.room !== -1) continue;
        candidates.push({ sx, sz, bx: sx + dx, bz: sz + dz, room: i, dx, dz });
      }
    }
    const pick = candidates.length ? candidates[rng.int(0, candidates.length - 1)] : null;
    if (pick) {
      const b = cells[idx(pick.bx, pick.bz)];
      b.solid = false;
      b.floor = 0;
      b.ceil = 3.0;
      b.wall = 0;
      b.floorTex = 1;
      b.secret = true;
      const wallCell = cells[idx(pick.sx, pick.sz)];
      wallCell.secretWall = true;
      secrets.push({
        x: pick.sx, z: pick.sz, cx: pick.sx, cz: pick.sz,
        wx: pick.sx * CELL, wz: pick.sz * CELL,
        idx: idx(pick.sx, pick.sz),
        alcove: { x: pick.bx, z: pick.bz, wx: pick.bx * CELL, wz: pick.bz * CELL },
        hp: 90,
        broken: false,
      });
    }
  }

  // ---- crates -----------------------------------------------------------
  // Solid cells you can shoot through: cover that is not a wall, and it breaks.
  const crates = [];
  for (const [i, r] of rooms.entries()) {
    if (i === exitRoomIdx || r.w < 4 || r.h < 4) continue;
    const want = rng.int(1, 2);
    for (let n = 0; n < want; n++) {
      const x = rng.int(r.x + 1, r.x + r.w - 2);
      const z = rng.int(r.z + 1, r.z + r.h - 2);
      const c = cells[idx(x, z)];
      if (c.solid || c.stair || c.platform || c.room !== i) continue;
      if (Math.abs(x - r.cx) <= 1 && Math.abs(z - r.cz) <= 1) continue; // keep the middle clear
      c.crate = true;
      c.crateHp = 45;
      crates.push({ x, z, wx: x * CELL, wz: z * CELL, idx: idx(x, z), hp: 45, broken: false });
    }
  }

  // ---- reachability -----------------------------------------------------
  // Anything that picks a cell for a keycard, a pickup, a barrel or an enemy
  // has to pick one the player can walk to. The sealed secret alcove is open
  // floor and unreachable by design, and a crate cell is open floor until it is
  // shot apart: both used to be handed out, which put the keycard behind a wall
  // and made the level uncompletable.
  const reach = new Uint8Array(W * H);
  {
    const startX = spawnRoom.cx;
    const startZ = spawnRoom.cz;
    const q = [startZ * W + startX];
    reach[q[0]] = 1;
    for (let head = 0; head < q.length; head++) {
      const k = q[head];
      const x = k % W;
      const z = (k - x) / W;
      const from = cells[k];
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx;
        const nz = z + dz;
        if (nx < 0 || nz < 0 || nx >= W || nz >= H) continue;
        const nk = nz * W + nx;
        if (reach[nk]) continue;
        const c = cells[nk];
        if (c.solid || c.door || c.crate) continue;
        if (!(c.stair || from.stair) && c.floor - from.floor > MAX_STEP) continue;
        reach[nk] = 1;
        q.push(nk);
      }
    }
  }

  // ---- the spawn must be a place you can leave --------------------------
  // A room whose only exits are door cells is a room you cannot leave until the
  // wave is clear, and if the wave is not clear you are stuck in it. Count the
  // floor reachable from the spawn with every door shut and refuse a layout that
  // is a box.
  let reachCount = 0;
  for (let i = 0; i < reach.length; i++) if (reach[i]) reachCount++;
  const spawnRoomExits = (() => {
    const r = rooms[0];
    let n = 0;
    for (let x = r.x; x < r.x + r.w; x++) {
      const a = cells[idx(x, r.z - 1)];
      const b = cells[idx(x, r.z + r.h)];
      if (a && !a.solid && !a.door) n++;
      if (b && !b.solid && !b.door) n++;
    }
    for (let z = r.z; z < r.z + r.h; z++) {
      const a = cells[idx(r.x - 1, z)];
      const b = cells[idx(r.x + r.w, z)];
      if (a && !a.solid && !a.door) n++;
      if (b && !b.solid && !b.door) n++;
    }
    return n;
  })();

  // ---- open floor list --------------------------------------------------
  const openCells = [];
  const reachableCells = [];
  for (let z = 0; z < H; z++) {
    for (let x = 0; x < W; x++) {
      const c = cells[idx(x, z)];
      if (c.solid || c.door) continue;
      const entry = { x, z, wx: x * CELL, wz: z * CELL, room: c.room };
      openCells.push(entry);
      if (reach[z * W + x] && !c.secret && !c.crate) reachableCells.push(entry);
    }
  }

  return {
    seed: String(seed),
    W, H, cells, rooms,
    spawn,
    exit: { x: exitCell.x * CELL, z: exitCell.z * CELL, cx: exitCell.x, cz: exitCell.z },
    exitRoom: exitRoomIdx,
    spawnRoom: 0,
    doors: doorCells,
    door: doorCells.length ? doorCells[0] : null,
    doorOpen: false,
    openCells,
    reachableCells,
    reach,
    reachCount,
    spawnRoomExits,
    crates,
    stairs,
    lifts,
    chests,
    secrets,
    broken: new Set(),   // secret walls that have been opened
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

/**
 * The cell containing a world position, or null outside the map.
 */
export function cellAt(level, x, z) {
  const cx = Math.round(x / CELL);
  const cz = Math.round(z / CELL);
  if (cx < 0 || cz < 0 || cx >= level.W || cz >= level.H) return null;
  return level.cells[cz * level.W + cx];
}

/**
 * True when a world position is solid rock, out of bounds, or a closed door.
 */
export function isBlocked(level, x, z) {
  const c = cellAt(level, x, z);
  if (!c) return true;
  // a broken secret wall is a doorway, and so is a broken crate
  if ((c.secretWall || c.crate) && level.broken && level.broken.has(c.z * level.W + c.x)) return false;
  if (c.crate) return true;
  if (c.solid) return true;
  if (c.door && !level.doorOpen) return true;
  return false;
}

/**
 * Floor height at a world position.
 */
export function floorHeightAt(level, x, z, fromY) {
  const c = cellAt(level, x, z);
  if (!c) return 0;
  if (c.lift) return c.lift.y;
  if (!c.stair) {
    // #37 step one: a cell may carry more than one sector — a catwalk over a
    // floor. `fromY` is the height you are coming from, and the sector you land
    // on is the highest one you could step up to. Today every cell has exactly
    // one sector, so this returns `c.floor` and every existing caller is
    // unchanged; the moment the generator writes `c.sectors`, the 31 call sites
    // that pass a height already get the right floor.
    if (c.sectors && c.sectors.length > 1 && fromY != null) {
      let best = c.sectors[0].floor;
      for (const sec of c.sectors) {
        if (sec.floor <= fromY + MAX_STEP && sec.floor > best - 1e-9) best = sec.floor;
      }
      return best;
    }
    return c.floor;
  }
  // Interpolate across the whole cell: the band is a ramp made of three steps,
  // and a cell spans half a cell either side of its own centre. Without the
  // half-cell offset the ramp only climbed over the far half, so the last step
  // was `rise / 2` tall — up to 0.7 m, past MAX_STEP — and the foot height
  // trailed the visible treads by half a cell.
  const t = c.stair === 'z'
    ? (z - (c.z * CELL)) / CELL + 0.5
    : (x - (c.x * CELL)) / CELL + 0.5;
  let k = Math.min(1, Math.max(0, t));
  if (c.flip) k = 1 - k;
  return c.stairLow + (c.stairHigh - c.stairLow) * k;
}

// circle vs. axis-aligned blocked cells
/**
 * True when a circle of radius r at (x, z) overlaps anything solid.
 */
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
      const crateShut = c && c.crate && !(level.broken && level.broken.has(cz * level.W + cx));
      const blocked = !c || c.solid || crateShut || (c.door && !level.doorOpen);
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

/**
 * March a ray through the grid and return the first wall hit with its normal, or null.
 */
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
      // the cell comes back too: a caller may need to know what it hit
      return { dist: t, point: { x, y, z }, normal: axisNormal(x, z, prevCx, prevCz), cell: c };
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

/**
 * Breadth-first search from a world position over every reachable cell. -1 where unreachable.
 */
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
      // a crate blocks like a wall until it is shot apart, and the field used to
      // route enemies straight through every crate on the level: they walked
      // into it and ground against it, the same stall #17 fixed for walls
      if (c.crate && !(level.broken && level.broken.has(nk))) continue;
      // a stair cell bridges the two levels: stepping onto it is always allowed,
      // and from it you can reach the platform it climbs to
      if (c.stair || from.stair) {
        // passable in both directions
      } else if (c.floor - from.floor > MAX_STEP) continue;
      dist[nk] = d;
      queue[tail++] = nk;
    }
  }
  return dist;
}

// The unit direction to the neighbouring cell one step closer to the target.
// Returns null when there is no path (or the enemy is already in the target cell).
/**
 * The neighbouring cell one step closer to the flow field's target, or null.
 */
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

/**
 * True when nothing solid stands between two world points.
 */
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
