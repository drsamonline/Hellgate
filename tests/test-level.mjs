import { generateLevel, CELL, MAX_STEP, cellAt, isBlocked, circleBlocked, floorHeightAt, raycastWalls, hasLineOfSight, buildFlowField, flowStep } from '../play/src/level.js';
import { STORY_LEVELS, OBJECTIVE_TYPES, storyLevel, storyLevelZone } from '../play/src/story-levels.js';
import { buildCameraPath, sampleCameraPath, cellPath, CAM_EYE } from '../play/src/campath.js';

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

// ---- the campaign table: 32 rows, and every one of them is a level --------
console.log('\n== story levels ==');
if (STORY_LEVELS.length !== 32) bad('table', `32 levels expected, ${STORY_LEVELS.length} present`);

const ids = new Set();
const tableSeeds = new Set();
const actCount = { 1: 0, 2: 0, 3: 0, 4: 0 };
for (const [i, row] of STORY_LEVELS.entries()) {
  const tag = row.id || `row ${i}`;
  if (row.n !== i + 1) bad(tag, 'n does not match the row order');
  if (!row.id || ids.has(row.id)) bad(tag, 'id is missing or repeated');
  ids.add(row.id);
  if (!row.seed || tableSeeds.has(row.seed)) bad(tag, 'seed is missing or repeated');
  tableSeeds.add(row.seed);
  if (!(row.act >= 1 && row.act <= 4)) bad(tag, 'act is not 1-4');
  else actCount[row.act]++;
  const o = row.objective || {};
  if (!OBJECTIVE_TYPES.includes(o.type)) bad(tag, 'objective type is not one that works: ' + o.type);
  if (o.type === 'survive' && !(o.time > 0)) bad(tag, 'a survive level with no clock');
  if (o.type === 'relics' && !(o.relics > 0)) bad(tag, 'a relics level with nothing to break');
  const sh = row.shape || {};
  if (!Array.isArray(sh.rooms) || sh.rooms.length !== 2 || sh.rooms[0] > sh.rooms[1]) bad(tag, 'shape.rooms is not a range');
  if (!Array.isArray(sh.size) || sh.size.length !== 2 || sh.size[0] > sh.size[1]) bad(tag, 'shape.size is not a range');
}
for (const a of [1, 2, 3, 4]) if (actCount[a] !== 8) bad('table', `act ${a} has ${actCount[a]} levels, not 8`);
if (storyLevel(0) !== null || storyLevel(33) !== null) bad('table', 'a level outside 1-32 is not null');
if (storyLevel(32) !== STORY_LEVELS[31]) bad('table', 'storyLevel(32) is not the last row');

// one row per act, generated for real: the table has to be buildable, not just
// well formed. Four seeds keeps the suite at its four seconds.
const storyOpen = [];
for (const n of [1, 9, 17, 25]) {
  const row = storyLevel(n);
  const z = storyLevelZone(row);
  if (!z) { bad(row.id, 'a row does not become a zone definition'); continue; }
  if (z.objectiveType !== row.objective.type) bad(row.id, 'the objective type was lost on the way to the zone');
  if (z.seed !== row.seed) bad(row.id, 'the seed was lost on the way to the zone');
  if (z.id !== row.zone) bad(row.id, 'the zone id changed: progression is keyed on it');
  const SL = generateLevel(z.seed, z.shape);
  storyOpen.push(SL.openCells.length);
  if (SL.rooms.length < 5) bad(row.id, 'too few rooms: ' + SL.rooms.length);
  if (isBlocked(SL, SL.spawn.x, SL.spawn.z)) bad(row.id, 'spawn blocked');
  if (circleBlocked(SL, SL.spawn.x, SL.spawn.z, 0.42)) bad(row.id, 'spawn circle blocked');
  if (!SL.spawnRoomExits) bad(row.id, 'the spawn room has no way out');
}
if (storyOpen.length === 4 && !(storyOpen[3] > storyOpen[0])) {
  bad('table', `the last act is not larger than the first: ${storyOpen.join(' < ')}`);
}

// ---- the cutscene camera walks the level --------------------------------
// The whole point of building the path from the flow field is that the camera
// cannot cross a wall. That is what these sample for, densely, on four seeds.
console.log('\n== camera paths ==');
{
  let paths = 0;
  let worstOff = 0;
  for (const seed of ['gate-238', 'foundry-101', 'l04-grove-427', 'l28-vault-726']) {
    const L = generateLevel(seed);
    L.doorOpen = true;
    const roomCells = L.reachableCells.filter((c) => c.room >= 0);
    for (let i = 0; i < 4; i++) {
      const a = roomCells[Math.floor(Math.random() * roomCells.length)];
      const b = roomCells[Math.floor(Math.random() * roomCells.length)];
      if (a === b) continue;
      const p = buildCameraPath(L, { x: a.wx, z: a.wz }, { x: b.wx, z: b.wz });
      if (!p) { bad(seed, 'no camera path between two reachable cells'); continue; }
      paths++;
      if (!(p.length > 0)) bad(seed, 'a camera path with no length');
      const end = sampleCameraPath(p, p.length);
      if (Math.hypot(end.x - b.wx, end.z - b.wz) > 0.01) bad(seed, 'the path does not end at its target');
      const start = sampleCameraPath(p, 0);
      if (Math.hypot(start.x - a.wx, start.z - a.wz) > 1.5) bad(seed, 'the path does not start near its origin');
      // dense sampling: a quarter of a metre, every sample on open floor, and the
      // camera always ABOVE that floor. Not "exactly eye height": a stair is a
      // 0.5 m step at a cell boundary, and the polyline between two samples either
      // side of it crosses the step over 0.4 m of travel. Above the floor is the
      // invariant that matters — a camera inside a step is the bug.
      for (let d = 0; d <= p.length; d += 0.25) {
        const q = sampleCameraPath(p, d);
        const c = cellAt(L, q.x, q.z);
        if (!c || c.solid) { bad(seed, `the camera leaves the floor at ${d.toFixed(1)} m`); break; }
        const above = q.y - floorHeightAt(L, q.x, q.z);
        worstOff = Math.max(worstOff, Math.abs(above - CAM_EYE));
        if (above < 0.35) { bad(seed, `the camera is ${above.toFixed(2)} m above the floor at ${d.toFixed(1)} m`); break; }
        if (above > 3.2) { bad(seed, `the camera is ${above.toFixed(2)} m above the floor at ${d.toFixed(1)} m`); break; }
      }
    }
  }
  if (paths < 8) bad('campath', `only ${paths} paths were built, the check is not doing much`);
  console.log(`  camera paths: ${paths}, worst eye-height error ${worstOff.toFixed(2)} m (a stair step)`);

  // sampling clamps instead of extrapolating
  const L2 = generateLevel('gate-238');
  L2.doorOpen = true;
  const two = L2.reachableCells.filter((c) => c.room >= 0);
  const p2 = buildCameraPath(L2, { x: two[0].wx, z: two[0].wz }, { x: two[two.length - 1].wx, z: two[two.length - 1].wz });
  if (p2) {
    const under = sampleCameraPath(p2, -50);
    const over = sampleCameraPath(p2, p2.length + 50);
    const first = sampleCameraPath(p2, 0);
    const last = sampleCameraPath(p2, p2.length);
    if (Math.hypot(under.x - first.x, under.z - first.z) > 1e-9) bad('campath', 'a negative distance does not clamp to the start');
    if (Math.hypot(over.x - last.x, over.z - last.z) > 1e-9) bad('campath', 'a distance past the end does not clamp');
  }

  // a place the player cannot walk to has no camera path, and null is the answer
  const L3 = generateLevel('gate-238');
  const sec = L3.secrets && L3.secrets[0];
  if (sec) {
    const into = cellPath(L3, { x: L3.spawn.x, z: L3.spawn.z }, { x: sec.alcove.wx, z: sec.alcove.wz });
    if (into !== null) bad('campath', 'a path was built through a secret wall');
  } else {
    bad('campath', 'no secret room to test the sealed case with');
  }
}

console.log(`\nseeds=${seeds.length} avgRooms=${(totalRooms / seeds.length).toFixed(1)} doors=${totalDoor}/${seeds.length} minOpenCells=${minOpen}`);
console.log(fails === 0 ? 'ALL LEVEL TESTS PASSED' : `${fails} FAILURES`);
process.exit(fails ? 1 : 0);
