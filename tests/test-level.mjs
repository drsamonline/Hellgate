import { generateLevel, CELL, MAX_STEP, cellAt, isBlocked, circleBlocked, floorHeightAt, raycastWalls, hasLineOfSight, buildFlowField, flowStep } from '../play/src/level.js';

let fails = 0;
const bad = (seed, msg) => { console.log(`FAIL [${seed}] ${msg}`); fails++; };

const seeds = ['doom', 'hellgate', 'x', '12345', 'a-very-long-seed-string', 'riba', 'Zz9'];
for (let i = 0; i < 40; i++) seeds.push('seed' + i);

let totalRooms = 0, totalDoor = 0, minOpen = 1e9;

for (const seed of seeds) {
  const L = generateLevel(seed);

  // determinism
  const L2 = generateLevel(seed);
  if (JSON.stringify(L.cells.map(c => [c.solid, c.floor, c.ceil, c.room])) !==
      JSON.stringify(L2.cells.map(c => [c.solid, c.floor, c.ceil, c.room]))) bad(seed, 'not deterministic');

  totalRooms += L.rooms.length;
  if (L.door) totalDoor++;
  minOpen = Math.min(minOpen, L.openCells.length);

  if (L.rooms.length < 5) bad(seed, 'too few rooms ' + L.rooms.length);

  // spawn must be free & on a real floor
  if (isBlocked(L, L.spawn.x, L.spawn.z)) bad(seed, 'spawn blocked');
  if (circleBlocked(L, L.spawn.x, L.spawn.z, 0.42)) bad(seed, 'spawn circle blocked');

  // flood fill from spawn, door passable
  const seen = new Set();
  const startX = Math.round(L.spawn.x / CELL), startZ = Math.round(L.spawn.z / CELL);
  const stack = [[startX, startZ]];
  while (stack.length) {
    const [x, z] = stack.pop();
    const k = z * L.W + x;
    if (seen.has(k)) continue;
    if (x < 0 || z < 0 || x >= L.W || z >= L.H) continue;
    const c = L.cells[k];
    if (c.solid) continue;
    seen.add(k);
    stack.push([x + 1, z], [x - 1, z], [x, z + 1], [x, z - 1]);
  }

  // every room must be reachable
  L.rooms.forEach((r, i) => {
    let any = false;
    for (let z = r.z; z < r.z + r.h && !any; z++)
      for (let x = r.x; x < r.x + r.w && !any; x++)
        if (seen.has(z * L.W + x)) any = true;
    if (!any) bad(seed, 'room ' + i + ' unreachable');
  });

  // exit cell reachable (door treated as passable in this fill)
  const ex = L.exit.cx, ez = L.exit.cz;
  if (!seen.has(ez * L.W + ex)) bad(seed, 'exit unreachable');

  // every door cell must be a non-solid corridor cell with open neighbours
  if (!L.doors.length) bad(seed, 'exit room has no door');
  for (const d of L.doors) {
    const dc = L.cells[d.z * L.W + d.x];
    if (dc.solid) bad(seed, 'door cell solid');
    if (dc.room !== -1) bad(seed, 'door inside a room');
    const nb = [[1,0],[-1,0],[0,1],[0,-1]].filter(([dx,dz]) => !L.cells[(d.z+dz)*L.W + d.x+dx].solid);
    if (nb.length < 2) bad(seed, 'door not a chokepoint');
  }

  // with every door shut the exit PAD must be out of reach: that is what gates
  // the wave. (The room itself can still be entered through an open corridor —
  // the pad only fires when the exit is unlocked, so this is not exploitable.)
  const shut = new Set();
  const stack2 = [[startX, startZ]];
  while (stack2.length) {
    const [x, z] = stack2.pop();
    if (x < 0 || z < 0 || x >= L.W || z >= L.H) continue;
    const k = z * L.W + x;
    if (shut.has(k)) continue;
    const c = L.cells[k];
    if (c.solid || c.door) continue;
    shut.add(k);
    stack2.push([x + 1, z], [x - 1, z], [x, z + 1], [x, z - 1]);
  }
  if (shut.has(L.exit.cz * L.W + L.exit.cx)) bad(seed, 'exit pad reachable while doors are shut');

  // walking from spawn: step heights must never exceed MAX_STEP on a legal path.
  // A platform reached by a stair band is the exception: the band interpolates,
  // so the walkable rise across it is (high - low) / steps, which is under
  // MAX_STEP by construction.
  for (const c of L.cells) {
    if (c.solid) continue;
    if (c.platform) continue;   // reached across a stair band, not a step
    if (c.stair) {
      const rise = c.stairHigh - c.stairLow;
      if (rise / 3 > MAX_STEP + 1e-6) bad(seed, 'stair band rises too far in one step');
      // The ramp must climb the whole cell and land on the floor it joins. It
      // used to interpolate over the far half only, so the last step was rise/2
      // — past MAX_STEP for any band taller than a metre, i.e. a wall to walk up.
      // Sample strictly inside the cell. A sample exactly on the boundary rounds
      // into the neighbour and reads ITS floor, which is how a correct ramp next
      // to a lower cell failed this check with a 0.56 m "step" that was the test's
      // own artefact. The ramp still has to climb the whole cell, so the peak is
      // checked against its own high end instead of against the neighbour.
      const N = 20;
      let prev = null;
      let worst = 0;
      let peak = -1e9;
      for (let i = 0; i <= N; i++) {
        const t = 0.02 + (i / N) * 0.96;
        const wx = c.stair === 'x' ? (c.x - 0.5 + t) * CELL : c.x * CELL;
        const wz = c.stair === 'z' ? (c.z - 0.5 + t) * CELL : c.z * CELL;
        const h = floorHeightAt(L, wx, wz);
        peak = Math.max(peak, h);
        if (prev !== null) worst = Math.max(worst, Math.abs(h - prev));
        prev = h;
      }
      if (worst > MAX_STEP + 1e-6) bad(seed, 'stair ramp steps ' + worst.toFixed(2) + ' m in one sample');
      const top = Math.max(c.stairLow, c.stairHigh);
      if (Math.abs(peak - top) > 0.08 * Math.abs(c.stairHigh - c.stairLow) + 0.02) {
        bad(seed, 'stair ramp reaches ' + peak.toFixed(2) + ' of ' + top.toFixed(2) + ', so it does not climb the whole cell');
      }
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const n = L.cells[(c.z + dz) * L.W + (c.x + dx)];
        if (!n || n.solid || !n.platform) continue;
        const h = floorHeightAt(L, (c.x + dx * 0.5) * CELL, (c.z + dz * 0.5) * CELL);
        if (Math.abs(h - n.floor) > 0.05) bad(seed, 'stair does not meet the platform it climbs to');
      }
      continue;
    }
    if (c.floor > MAX_STEP + 1e-6) bad(seed, 'floor above max step');
    if (!c.solid && c.ceil <= c.floor + 0.5) bad(seed, 'ceiling too low');
  }

  // collision sanity: 200 random walk steps from spawn must stay in bounds & unblocked
  let px = L.spawn.x, pz = L.spawn.z;
  let rngState = 12345;
  const rnd = () => ((rngState = (rngState * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  for (let s = 0; s < 400; s++) {
    const a = rnd() * Math.PI * 2;
    const stepLen = 0.12;
    const nx = px + Math.cos(a) * stepLen;
    const nz = pz + Math.sin(a) * stepLen;
    if (!circleBlocked(L, nx, nz, 0.42)) { px = nx; pz = nz; }
    if (circleBlocked(L, px, pz, 0.42)) { bad(seed, 'player ended up inside a wall'); break; }
    if (Math.abs(px) > L.W * CELL || Math.abs(pz) > L.H * CELL) { bad(seed, 'escaped the map'); break; }
  }

  // raycast: a ray into a wall from the spawn must hit, and short rays must not overshoot
  for (let a = 0; a < 8; a++) {
    const ang = (a / 8) * Math.PI * 2;
    const dir = { x: Math.cos(ang), y: 0, z: Math.sin(ang) };
    const hit = raycastWalls(L, { x: L.spawn.x, y: 1.6, z: L.spawn.z }, dir, 40);
    if (hit) {
      if (hit.dist <= 0 || hit.dist > 40) bad(seed, 'bad ray distance');
      // point must sit inside/at a blocked cell boundary
      const bx = hit.point.x + dir.x * 0.06;
      const bz = hit.point.z + dir.z * 0.06;
      if (!isBlocked(L, bx, bz)) {
        // may be a floor/ceiling hit; only flag horizontal rays that stop in open space
        if (hit.normal.y === 0) bad(seed, 'ray stopped in open space');
      }
    }
  }

  // flow field: from the spawn, every reachable cell has a path, and following
  // the field from any of them walks to the spawn
  L.doorOpen = true; // path through the exit room too
  const field = buildFlowField(L, L.spawn.x, L.spawn.z);
  let openCells = 0;
  let unreached = 0;
  for (let i = 0; i < L.cells.length; i++) {
    const c = L.cells[i];
    if (c.solid || c.door) continue;
    if (c.crate) continue;   // a crate blocks like a wall until it is shot apart
    if (c.secret) continue; // the alcove behind a secret wall is sealed on purpose
    openCells++;
    if (field[i] < 0) unreached++;
  }
  if (unreached > 0) bad(seed, unreached + ' open cells have no path from the spawn');
  // and the field must not route enemies through a crate: they walk into it and
  // grind, which is the stall the flow field was introduced to remove
  const cratesOnField = L.cells.filter((c) => c.crate && field[c.z * L.W + c.x] >= 0).length;
  if (cratesOnField > 0) bad(seed, cratesOnField + ' crates are on the flow field');

  // and the secret really is sealed until broken, then reachable
  for (const sec of L.secrets) {
    const cell = L.cells[sec.idx];
    if (!cell.secretWall) bad(seed, 'secret entrance is not a wall');
    if (!isBlocked(L, sec.wx, sec.wz)) bad(seed, 'secret wall is walkable before it is broken');
    L.broken.add(sec.idx);
    if (isBlocked(L, sec.wx, sec.wz)) bad(seed, 'secret wall is still solid after breaking');
    L.broken.delete(sec.idx);
  }

  for (let t = 0; t < 12; t++) {
    // the sealed secret alcove is open floor but unreachable until broken
    const walkable = L.openCells.filter((o) => {
      const c = L.cells[o.z * L.W + o.x];
      return !c.secret && !c.crate;
    });
    const c = walkable[Math.floor((t / 12) * walkable.length)];
    let x = c.wx;
    let z = c.wz;
    let steps = 0;
    const limit = 400;
    while (steps < limit) {
      const step = flowStep(L, field, x, z);
      if (!step) break;
      x += step.x * CELL;
      z += step.z * CELL;
      steps++;
    }
    const cx2 = Math.round(x / CELL);
    const cz2 = Math.round(z / CELL);
    if (field[cz2 * L.W + cx2] !== 0) bad(seed, 'following the field from a cell did not reach the spawn');
  }
  L.doorOpen = false;

  // LOS: self is always visible
  if (!hasLineOfSight(L, { x: L.spawn.x, y: 1.6, z: L.spawn.z }, { x: L.spawn.x + 0.1, y: 1.6, z: L.spawn.z }))
    bad(seed, 'LOS to self failed');
}

console.log(`\nseeds=${seeds.length} avgRooms=${(totalRooms / seeds.length).toFixed(1)} doors=${totalDoor}/${seeds.length} minOpenCells=${minOpen}`);
console.log(fails === 0 ? 'ALL LEVEL TESTS PASSED' : `${fails} FAILURES`);
process.exit(fails ? 1 : 0);
