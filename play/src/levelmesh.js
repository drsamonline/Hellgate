// ---------------------------------------------------------------------------
// LEVEL MESHES — turns the sector grid into merged BufferGeometries.
// One geometry (and therefore one draw call) per texture, plus a door box and
// a glowing exit pad.
// ---------------------------------------------------------------------------

import * as THREE from 'three';
import { CELL, floorHeightAt } from './level.js';

const WALL_KEY = ['wall_brick', 'wall_tech', 'wall_rust', 'wall_moss', 'wall_stained'];
const FLOOR_KEY = ['floor_tile', 'floor_plate', 'floor_grate'];

/**
 * Turn the sector grid into merged geometry with baked vertex shade, plus the door boxes and the exit pad.
 */
export function buildLevelMeshes(level, mats, zone) {
  // every zone leans the same geometry a different way: the vertex colours are
  // shading only, so multiplying them by a zone tint is what makes the foundry
  // rust and the cistern teal out of the same bricks
  const T = (zone && zone.wallTint) || [1, 1, 1];
  // Geometry is bucketed by (chunk, texture) so a chunk can be culled. Measured
  // on this arena at 1280x720: 4x4-cell chunks cost 255 draw calls against 117
  // for one mesh per texture, because the level is small enough that almost
  // every chunk is in the frustum. Chunking is off by default and the number is
  // in the changelog; a bigger level should re-measure before flipping it.
  const CHUNK = 999;
  const buckets = {};
  let chunkX = 0;
  let chunkZ = 0;
  const bucket = (k) => {
    const key = k + '@' + chunkX + ',' + chunkZ;
    return (buckets[key] || (buckets[key] = { key: k, p: [], n: [], u: [], i: [], c: [] }));
  };

  // Baked shade, in the manner of castle-valley's "sun and shade drawn once":
  // every face gets a light value at build time from a fixed sun plus a cheap
  // corner AO, written into vertex colours. No shadow map, no extra draw call.
  const SUN = { x: -0.45, y: 0.85, z: 0.35 };
  {
    const l = Math.hypot(SUN.x, SUN.y, SUN.z);
    SUN.x /= l; SUN.y /= l; SUN.z /= l;
  }
  const shadeOf = (nx, nz) => {
    const h = Math.hypot(nx, nz) || 1;
    const d = Math.max(0, (nx / h) * SUN.x + (nz / h) * SUN.z);
    return 0.74 + 0.26 * d;
  };

  function quad(key, a, b, c, d, u1, v1, shades) {
    const bk = bucket(key);
    const base = bk.p.length / 3;
    bk.p.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2], d[0], d[1], d[2]);

    const e1x = b[0] - a[0], e1y = b[1] - a[1], e1z = b[2] - a[2];
    const e2x = c[0] - b[0], e2y = c[1] - b[1], e2z = c[2] - b[2];
    let nx = e1y * e2z - e1z * e2y;
    let ny = e1z * e2x - e1x * e2z;
    let nz = e1x * e2y - e1y * e2x;
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len; ny /= len; nz /= len;
    for (let i = 0; i < 4; i++) bk.n.push(nx, ny, nz);

    bk.u.push(0, 0, u1, 0, u1, v1, 0, v1);
    const sh = shades || [1, 1, 1, 1];
    for (let i = 0; i < 4; i++) {
      const v = Math.max(0, Math.min(1, sh[i]));
      bk.c.push(v * T[0], v * T[1], v * T[2]);
    }
    bk.i.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  const group = new THREE.Group();
  const doorMeshes = [];

  for (let z = 0; z < level.H; z++) {
    chunkZ = Math.floor(z / CHUNK);
    for (let x = 0; x < level.W; x++) {
      chunkX = Math.floor(x / CHUNK);
      const c = level.cells[z * level.W + x];
      if (c.solid) continue;

      const x0 = (x - 0.5) * CELL, x1 = (x + 0.5) * CELL;
      const z0 = (z - 0.5) * CELL, z1 = (z + 0.5) * CELL;

      // corner occlusion: 0, 1 or 2 of the two cells meeting at that corner are solid
      const solidAt = (nx, nz) => {
        if (nx < 0 || nz < 0 || nx >= level.W || nz >= level.H) return true;
        return level.cells[nz * level.W + nx].solid;
      };
      const ao = (a, b) => 1 - 0.09 * (a + b);
      const jitter = 0.97 + ((x * 7 + z * 13) % 7) * 0.01;
      const fNE = ao(solidAt(x + 1, z), solidAt(x, z + 1)) * jitter;
      const fSE = ao(solidAt(x + 1, z), solidAt(x, z - 1)) * jitter;
      const fSW = ao(solidAt(x - 1, z), solidAt(x, z - 1)) * jitter;
      const fNW = ao(solidAt(x - 1, z), solidAt(x, z + 1)) * jitter;

      // floor (+Y): lit from above, softened into the wall bases
      if (c.lift) {
        // the lift draws its own platform, in its own mesh, because it moves
        const plate = new THREE.Mesh(
          new THREE.BoxGeometry(CELL * 0.92, 0.16, CELL * 0.92),
          mats[FLOOR_KEY[c.floorTex]] || mats['floor_tile']
        );
        plate.position.set(x * CELL, c.lift.y - 0.08, z * CELL);
        plate.receiveShadow = true;
        plate.userData.liftCell = c;
        group.add(plate);
      } else if (c.stair) {
        // Three steps across the cell, and every height sampled from
        // floorHeightAt: the visible stair and the collision ramp are then the
        // same surface. Two bugs lived here. The treads and risers were built in
        // descending order on a z band, so their normals pointed into the floor
        // and away from the player; and the step heights were computed from
        // stairLow/stairHigh directly, which ignored `flip` — a band that climbed
        // towards -x was drawn climbing towards +x.
        const steps = 3;
        const hAt = (t) => (c.stair === 'z'
          ? floorHeightAt(level, x * CELL, z0 + (z1 - z0) * t)
          : floorHeightAt(level, x0 + (x1 - x0) * t, z * CELL));
        // treads, then a riser at every band boundary — including the two cell
        // edges, so nothing is left open between the ramp and the floors it joins
        for (let sIdx = 0; sIdx < steps; sIdx++) {
          const t0 = sIdx / steps;
          const t1 = (sIdx + 1) / steps;
          const h = hAt((t0 + t1) / 2);
          if (c.stair === 'z') {
            const za = z0 + (z1 - z0) * t0;
            const zb = z0 + (z1 - z0) * t1;
            quad(FLOOR_KEY[c.floorTex], [x0, h, za], [x0, h, zb], [x1, h, zb], [x1, h, za], 1, 1,
              [fNW, fSW, fSE, fNE]);
          } else {
            const xa = x0 + (x1 - x0) * t0;
            const xb = x0 + (x1 - x0) * t1;
            quad(FLOOR_KEY[c.floorTex], [xa, h, z1], [xb, h, z1], [xb, h, z0], [xa, h, z0], 1, 1,
              [fNW, fNE, fSE, fSW]);
          }
        }
        for (let bIdx = 0; bIdx <= steps; bIdx++) {
          const tb = bIdx / steps;
          const hL = bIdx > 0 ? hAt(tb - 1 / (steps * 2)) : hAt(tb);
          const hR = bIdx < steps ? hAt(tb + 1 / (steps * 2)) : hAt(tb);
          const lo = Math.min(hL, hR);
          const hi = Math.max(hL, hR);
          if (hi - lo < 0.01) continue;
          const rises = hR > hL;   // the ramp climbs towards +axis
          if (c.stair === 'z') {
            const zb = z0 + (z1 - z0) * tb;
            if (rises) quad(WALL_KEY[c.wall], [x0, lo, zb], [x0, hi, zb], [x1, hi, zb], [x1, lo, zb], 1, 1, [0.6, 0.6, 0.7, 0.7]);
            else quad(WALL_KEY[c.wall], [x0, hi, zb], [x1, hi, zb], [x1, lo, zb], [x0, lo, zb], 1, 1, [0.6, 0.6, 0.7, 0.7]);
          } else {
            const xb = x0 + (x1 - x0) * tb;
            if (rises) quad(WALL_KEY[c.wall], [xb, lo, z0], [xb, lo, z1], [xb, hi, z1], [xb, hi, z0], 1, 1, [0.6, 0.6, 0.7, 0.7]);
            else quad(WALL_KEY[c.wall], [xb, hi, z0], [xb, hi, z1], [xb, lo, z1], [xb, lo, z0], 1, 1, [0.6, 0.6, 0.7, 0.7]);
          }
        }
      } else {
        quad(FLOOR_KEY[c.floorTex], [x0, c.floor, z1], [x1, c.floor, z1], [x1, c.floor, z0], [x0, c.floor, z0], 1, 1,
          [fNW, fNE, fSE, fSW]);
      }
      // the deck: a second floor in the same cell, with a rim on every side that
      // drops to open air, so it reads as a platform and not a floating plane
      if (c.sectors && c.sectors.length > 1) {
        const deck = c.sectors[1];
        quad(FLOOR_KEY[c.floorTex], [x0, deck.floor, z1], [x1, deck.floor, z1], [x1, deck.floor, z0], [x0, deck.floor, z0], 1, 1,
          [fNW, fNE, fSE, fSW]);
        const NB4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
        for (let d = 0; d < 4; d++) {
          const nx2 = x + NB4[d][0];
          const nz2 = z + NB4[d][1];
          const ncell = (nx2 >= 0 && nz2 >= 0 && nx2 < level.W && nz2 < level.H) ? level.cells[nz2 * level.W + nx2] : null;
          const nTop = ncell && !ncell.solid && ncell.sectors && ncell.sectors.length > 1
            ? ncell.sectors[1].floor : (ncell && !ncell.solid ? ncell.floor : -99);
          if (nTop >= deck.floor - 1e-4) continue;      // a deck next door: no rim
          // A thin lip, not a face down to the floor. The deck cell is open at
          // ground level — that is the point of two sectors — so a full-height
          // rim was a wall the player could see and walk straight through. The
          // deck's underside is a slab edge above your head, which is what a
          // catwalk looks like from below.
          const y0 = deck.floor - 0.18;
          const sh = [0.62, 0.62, 0.72, 0.72];
          if (d === 0) quad(WALL_KEY[c.wall], [x1, y0, z0], [x1, y0, z1], [x1, deck.floor, z1], [x1, deck.floor, z0], 1, 1, sh);
          else if (d === 1) quad(WALL_KEY[c.wall], [x0, y0, z1], [x0, y0, z0], [x0, deck.floor, z0], [x0, deck.floor, z1], 1, 1, sh);
          else if (d === 2) quad(WALL_KEY[c.wall], [x1, y0, z1], [x0, y0, z1], [x0, deck.floor, z1], [x1, deck.floor, z1], 1, 1, sh);
          else quad(WALL_KEY[c.wall], [x0, y0, z0], [x1, y0, z0], [x1, deck.floor, z0], [x0, deck.floor, z0], 1, 1, sh);
        }
      }
      // ceiling (-Y): dark, and darker in the corners
      quad('ceil', [x0, c.ceil, z0], [x1, c.ceil, z0], [x1, c.ceil, z1], [x0, c.ceil, z1], 1, 1,
        [fSW * 0.88, fSE * 0.88, fNE * 0.88, fNW * 0.88]);

      const wallKey = WALL_KEY[c.wall];
      const nb = [[1, 0], [-1, 0], [0, 1], [0, -1]];

      for (let d = 0; d < 4; d++) {
        const nx2 = x + nb[d][0];
        const nz2 = z + nb[d][1];
        const inBounds = nx2 >= 0 && nz2 >= 0 && nx2 < level.W && nz2 < level.H;
        const ncell = inBounds ? level.cells[nz2 * level.W + nx2] : null;

        // The floor at a shared edge, not at the cell's centre: a stair band's
        // floor varies across the cell, and using the centre value drew a
        // full-height wall across the top of every band — a staircase you could
        // walk up but not see over.
        const ex = d === 0 ? x1 : d === 1 ? x0 : x * CELL;
        const ez = d === 2 ? z1 : d === 3 ? z0 : z * CELL;
        const hC = c.stair ? floorHeightAt(level, ex, ez) : c.floor;
        const hN = ncell && ncell.stair ? floorHeightAt(level, ex, ez) : (ncell ? ncell.floor : 0);

        const spans = [];
        if (!ncell || ncell.solid) {
          spans.push([hC, c.ceil]);
        } else {
          if (hN > hC + 1e-4) spans.push([hC, hN]);
          if (ncell.ceil < c.ceil - 1e-4) spans.push([ncell.ceil, c.ceil]);
        }

        const nxw = d === 0 ? 1 : d === 1 ? -1 : 0;
        const nzw = d === 2 ? 1 : d === 3 ? -1 : 0;
        const face = shadeOf(nxw, nzw);

        for (const [y0, y1] of spans) {
          if (y1 - y0 < 0.01) continue;
          const v1 = (y1 - y0) / CELL;
          const sh = [face * 1.0, face * 1.0, face * 0.84, face * 0.84]; // bottom lit, top in shade
          if (d === 0) {
            quad(wallKey, [x1, y0, z0], [x1, y0, z1], [x1, y1, z1], [x1, y1, z0], 1, v1, sh);
          } else if (d === 1) {
            quad(wallKey, [x0, y0, z1], [x0, y0, z0], [x0, y1, z0], [x0, y1, z1], 1, v1, sh);
          } else if (d === 2) {
            quad(wallKey, [x1, y0, z1], [x0, y0, z1], [x0, y1, z1], [x1, y1, z1], 1, v1, sh);
          } else {
            quad(wallKey, [x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], 1, v1, sh);
          }
        }
      }
    }
  }

  // ---- decor ------------------------------------------------------------
  // Pilasters on a room's walls and a beam across a tall room's ceiling. They
  // are emitted into the same per-texture buckets as the walls, so the room
  // gains detail and the frame gains no draw call.
  {
    const solidAt2 = (x, z) => {
      if (x < 0 || z < 0 || x >= level.W || z >= level.H) return true;
      return level.cells[z * level.W + x].solid;
    };
    // one box, four sides, no bottom: it stands on the floor
    // the 'decor:' prefix is stripped when the material is looked up; it exists
    // so the geometry test can check the shell and skip the detail
    const dkey = (k) => 'decor:' + k;
    const boxQuads = (key, cx, cz, hw, hd, y0, y1, shade) => {
      const v = (y1 - y0) / CELL;
      quad(dkey(key), [cx - hw, y0, cz + hd], [cx + hw, y0, cz + hd], [cx + hw, y1, cz + hd], [cx - hw, y1, cz + hd], 0.4, v, [shade, shade, shade * 0.9, shade * 0.9]);
      quad(dkey(key), [cx + hw, y0, cz - hd], [cx - hw, y0, cz - hd], [cx - hw, y1, cz - hd], [cx + hw, y1, cz - hd], 0.4, v, [shade * 0.9, shade * 0.9, shade * 0.8, shade * 0.8]);
      quad(dkey(key), [cx + hw, y0, cz + hd], [cx + hw, y0, cz - hd], [cx + hw, y1, cz - hd], [cx + hw, y1, cz + hd], 0.4, v, [shade, shade, shade * 0.9, shade * 0.9]);
      quad(dkey(key), [cx - hw, y0, cz - hd], [cx - hw, y0, cz + hd], [cx - hw, y1, cz + hd], [cx - hw, y1, cz - hd], 0.4, v, [shade * 0.9, shade * 0.9, shade * 0.8, shade * 0.8]);
    };

    for (const r of level.rooms || []) {
      if (r.w < 5 || r.h < 5) continue;
      const mid = level.cells[r.cz * level.W + r.cx];
      if (!mid) continue;
      const key = WALL_KEY[mid.wall] || WALL_KEY[0];
      const y0 = mid.floor;
      const y1 = Math.min(mid.ceil, mid.floor + 2.6);
      if (y1 - y0 < 1.2) continue;

      // pilasters only where there is actually a wall behind them, inset one
      // cell from each corner so they never sit in a doorway
      const spots = [];
      for (let x = r.x + 1; x < r.x + r.w - 1; x += Math.max(2, r.w >> 1)) {
        if (solidAt2(x, r.z - 1)) spots.push([x, r.z, 'z', -1]);
        if (solidAt2(x, r.z + r.h)) spots.push([x, r.z + r.h - 1, 'z', 1]);
      }
      for (let z = r.z + 1; z < r.z + r.h - 1; z += Math.max(2, r.h >> 1)) {
        if (solidAt2(r.x - 1, z)) spots.push([r.x, z, 'x', -1]);
        if (solidAt2(r.x + r.w, z)) spots.push([r.x + r.w - 1, z, 'x', 1]);
      }
      for (const [cx, cz, axis, dir] of spots) {
        const wx = cx * CELL + (axis === 'x' ? dir * (CELL * 0.5 - 0.16) : 0);
        const wz = cz * CELL + (axis === 'z' ? dir * (CELL * 0.5 - 0.16) : 0);
        boxQuads(key, wx, wz, axis === 'x' ? 0.16 : 0.26, axis === 'x' ? 0.26 : 0.16, y0, y1, 0.96);
      }

      // a beam across the ceiling of a tall room, inside its own footprint
      if (mid.ceil - mid.floor > 3.4 && r.w >= 5) {
        const by = mid.ceil - 0.3;
        const x0 = (r.x - 0.5) * CELL + 0.3;
        const x1 = (r.x + r.w - 0.5) * CELL - 0.3;
        const z = (r.z + Math.floor(r.h / 2)) * CELL;
        const v = 0.28 / CELL;
        quad(dkey(key), [x0, by, z - 0.22], [x1, by, z - 0.22], [x1, by + 0.28, z - 0.22], [x0, by + 0.28, z - 0.22], 3, v, [0.82, 0.82, 0.74, 0.74]);
        quad(dkey(key), [x1, by, z + 0.22], [x0, by, z + 0.22], [x0, by + 0.28, z + 0.22], [x1, by + 0.28, z + 0.22], 3, v, [0.82, 0.82, 0.74, 0.74]);
        quad(dkey(key), [x0, by, z + 0.22], [x1, by, z + 0.22], [x1, by, z - 0.22], [x0, by, z - 0.22], 3, 0.22, [0.72, 0.72, 0.66, 0.66]);
      }
    }
  }

  for (const key of Object.keys(buckets)) {
    const bk = buckets[key];
    if (!bk.i.length) continue;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(bk.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(bk.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(bk.u, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(bk.c, 3));
    g.setIndex(bk.i);
    g.computeBoundingSphere();
    const mesh = new THREE.Mesh(g, mats[bk.key.replace('decor:', '')]);
    mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    mesh.userData.merged = true;
    mesh.userData.bucket = bk.key;
    mesh.userData.chunk = key.split('@')[1];
    group.add(mesh);
  }

  // ---- doors ------------------------------------------------------------
  for (const d of level.doors) {
    const dc = level.cells[d.z * level.W + d.x];
    const h = dc.ceil - dc.floor;
    // A bulkhead panel sits ACROSS the way you walk through it. The reliable way
    // to know which way that is: find the neighbour that belongs to the exit
    // room. You walk from the corridor into the room along that axis, so the
    // panel is thin along it. Guessing from "which neighbour is open" is wrong —
    // the room itself is open, and it is not the corridor.
    const cellAt = (x, z) => level.cells[z * level.W + x] || { solid: true, room: -1 };
    const intoX = cellAt(d.x - 1, d.z).room === level.exitRoom || cellAt(d.x + 1, d.z).room === level.exitRoom;
    const intoZ = cellAt(d.x, d.z - 1).room === level.exitRoom || cellAt(d.x, d.z + 1).room === level.exitRoom;
    // if the room is on the X side you walk through in X: thin in X
    const thinX = intoX || !intoZ;
    const geo = new THREE.BoxGeometry(
      thinX ? 0.34 : CELL * 0.96,
      h,
      thinX ? CELL * 0.96 : 0.34
    );
    const mesh = new THREE.Mesh(geo, mats['door_plain'] || mats['door']);
    mesh.receiveShadow = true;
    mesh.position.set(d.x * CELL, dc.floor + h / 2, d.z * CELL);
    mesh.userData.height = h;
    mesh.userData.baseY = dc.floor + h / 2;
    mesh.visible = true;
    // a lamp on the door: red while it is locked, green when it opens, so the
    // state is readable from down the corridor
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.12), new THREE.MeshBasicMaterial({ color: 0xff3b30 }));
    // proud of the face, or the lamp is buried inside the panel and never seen
    lamp.position.set(0, h / 2 - 0.42, thinX ? 0 : 0.23);
    if (thinX) lamp.rotation.y = Math.PI / 2;
    lamp.userData.lamp = true;
    mesh.add(lamp);
    mesh.userData.lamp = lamp;
    group.add(mesh);
    doorMeshes.push(mesh);
  }

  // ---- exit pad ---------------------------------------------------------
  const ec = level.cells[level.exit.cz * level.W + level.exit.cx];
  const padGeo = new THREE.PlaneGeometry(CELL * 0.8, CELL * 0.8);
  const pad = new THREE.Mesh(padGeo, mats['pad']);
  pad.rotation.x = -Math.PI / 2;
  pad.position.set(level.exit.x, ec.floor + 0.03, level.exit.z);
  group.add(pad);

  // ---- secret walls ----------------------------------------------------
  // Each secret wall gets its own mesh, a shade off the surrounding rock, so it
  // can be removed the moment it is broken and can be spotted up close.
  const secretMeshes = [];
  for (const sec of level.secrets || []) {
    const c = level.cells[sec.idx];
    const mat = new THREE.MeshLambertMaterial({ color: 0x6b5a4a });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(CELL * 0.98, c.ceil, CELL * 0.98), mat);
    mesh.position.set(sec.wx, c.floor + c.ceil / 2, sec.wz);
    group.add(mesh);
    secretMeshes.push({ mesh, secret: sec });
  }

  // ---- crates ----------------------------------------------------------
  const crateMeshes = [];
  for (const cr of level.crates || []) {
    const c = level.cells[cr.idx];
    const box = new THREE.Mesh(
      new THREE.BoxGeometry(CELL * 0.62, 0.9, CELL * 0.62),
      new THREE.MeshLambertMaterial({ color: 0x6a5136 })
    );
    box.position.set(cr.wx, c.floor + 0.45, cr.wz);
    group.add(box);
    crateMeshes.push({ mesh: box, crate: cr });
  }

  return { group, doorMeshes, exitPad: pad, secretMeshes, crateMeshes };
}
