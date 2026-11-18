// Geometry validation: every merged triangle must face into open space.
// Catches inverted winding, which is invisible to logic tests but ruins the look.

import './domstub.mjs';
const { generateLevel, CELL, cellAt } = await import('../play/src/level.js');
const { buildLevelMeshes } = await import('../play/src/levelmesh.js');
const THREE = await import('three');

const fails = [];
const ok = (c, m) => { if (!c) { fails.push(m); console.log('  FAIL ' + m); } else console.log('  ok  ' + m); };

const mats = {};
for (const k of ['wall_brick', 'wall_tech', 'floor_tile', 'floor_plate', 'ceil', 'door', 'pad']) {
  mats[k] = new THREE.MeshBasicMaterial({});
}

let totalTris = 0;
const shadeRange = [1, 0];
let bad = 0;
let checked = 0;

for (const seed of ['geom1', 'geom2', 'geom3', 'hellgate', 'doom']) {
  const L = generateLevel(seed);
  const out = buildLevelMeshes(L, mats);
  let tris = 0;

  for (const mesh of out.group.children) {
    const g = mesh.geometry;
    if (!mesh.userData || !mesh.userData.merged) continue; // door box / exit pad
    const pos = g.attributes.position.array;
    const nor = g.attributes.normal.array;
    const idx = g.index.array || g.index; // real three wraps the index in a BufferAttribute
    const col = g.attributes.color;
    if (!col) { ok(false, 'merged mesh has no baked vertex colours'); break; }
    let cmin = 1, cmax = 0;
    for (let i = 0; i < col.array.length; i++) {
      cmin = Math.min(cmin, col.array[i]);
      cmax = Math.max(cmax, col.array[i]);
    }
    if (col.array.length !== pos.length) ok(false, 'colour attribute length mismatch');
    if (cmin < 0 || cmax > 1) ok(false, 'baked shade outside 0..1');
    shadeRange[0] = Math.min(shadeRange[0], cmin);
    shadeRange[1] = Math.max(shadeRange[1], cmax);

    const ntris = idx.length / 3;
    tris += ntris;
    totalTris += ntris;

    for (let t = 0; t < ntris; t++) {
      const i0 = idx[t * 3] * 3, i1 = idx[t * 3 + 1] * 3, i2 = idx[t * 3 + 2] * 3;
      const ax = pos[i0], ay = pos[i0 + 1], az = pos[i0 + 2];
      const bx = pos[i1], by = pos[i1 + 1], bz = pos[i1 + 2];
      const cx = pos[i2], cy = pos[i2 + 1], cz = pos[i2 + 2];

      // winding must match the stored normal
      const ux = bx - ax, uy = by - ay, uz = bz - az;
      const vx = cx - ax, vy = cy - ay, vz = cz - az;
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const nl = Math.hypot(nx, ny, nz) || 1;
      const snx = nor[i0], sny = nor[i0 + 1], snz = nor[i0 + 2];
      const dot = (nx / nl) * snx + (ny / nl) * sny + (nz / nl) * snz;
      if (dot < 0.9) { bad++; continue; }

      // a point just off the face along its normal must be in open space
      const mx = (ax + bx + cx) / 3 + snx * 0.12;
      const my = (ay + by + cy) / 3 + sny * 0.12;
      const mz = (az + bz + cz) / 3 + snz * 0.12;
      const c = cellAt(L, mx, mz);
      checked++;
      if (!c || c.solid) { bad++; continue; }
      if (Math.abs(sny) < 0.5) {
        // vertical wall: the sample point must be inside the sector volume
        if (my < c.floor - 0.01 || my > c.ceil + 0.01) bad++;
      }
    }
  }

  ok(bad === 0, seed + ': all ' + tris + ' triangles face open space (bad=' + bad + ')');
  if (bad > 0) break;
}

ok(totalTris > 5000, 'level produces a merged mesh (' + totalTris + ' triangles over 5 seeds)');
ok(shadeRange[1] - shadeRange[0] > 0.25,
  `baked shade varies across the level (${shadeRange[0].toFixed(2)}..${shadeRange[1].toFixed(2)})`);
console.log('\n' + (fails.length ? fails.length + ' FAILURES' : 'ALL GEOMETRY TESTS PASSED'));
process.exit(fails.length ? 1 : 0);
