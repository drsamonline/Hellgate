import { generateLevel, CELL, MAX_STEP, cellAt, isBlocked, circleBlocked, floorHeightAt, raycastWalls, hasLineOfSight } from '../play/src/level.js';

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

  // walking from spawn: step heights must never exceed MAX_STEP on a legal path
  // (checked implicitly: no cell floor exceeds MAX_STEP except ledges of exactly MAX_STEP)
  for (const c of L.cells) {
    if (!c.solid && c.floor > MAX_STEP + 1e-6) bad(seed, 'floor above max step');
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

  // LOS: self is always visible
  if (!hasLineOfSight(L, { x: L.spawn.x, y: 1.6, z: L.spawn.z }, { x: L.spawn.x + 0.1, y: 1.6, z: L.spawn.z }))
    bad(seed, 'LOS to self failed');
}

console.log(`\nseeds=${seeds.length} avgRooms=${(totalRooms / seeds.length).toFixed(1)} doors=${totalDoor}/${seeds.length} minOpenCells=${minOpen}`);
console.log(fails === 0 ? 'ALL LEVEL TESTS PASSED' : `${fails} FAILURES`);
process.exit(fails ? 1 : 0);
