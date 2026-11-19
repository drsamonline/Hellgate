// ---------------------------------------------------------------------------
// LEVEL MESHES — turns the sector grid into merged BufferGeometries.
// One geometry (and therefore one draw call) per texture, plus a door box and
// a glowing exit pad.
// ---------------------------------------------------------------------------

import * as THREE from 'three';
import { CELL } from './level.js';

const WALL_KEY = ['wall_brick', 'wall_tech'];
const FLOOR_KEY = ['floor_tile', 'floor_plate'];

/**
 * Turn the sector grid into merged geometry with baked vertex shade, plus the door boxes and the exit pad.
 */
export function buildLevelMeshes(level, mats) {
  const buckets = {};
  const bucket = (k) => (buckets[k] || (buckets[k] = { p: [], n: [], u: [], i: [], c: [] }));

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
      bk.c.push(v, v, v);
    }
    bk.i.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  const group = new THREE.Group();
  const doorMeshes = [];

  for (let z = 0; z < level.H; z++) {
    for (let x = 0; x < level.W; x++) {
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
      quad(FLOOR_KEY[c.floorTex], [x0, c.floor, z1], [x1, c.floor, z1], [x1, c.floor, z0], [x0, c.floor, z0], 1, 1,
        [fNW, fNE, fSE, fSW]);
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

        const spans = [];
        if (!ncell || ncell.solid) {
          spans.push([c.floor, c.ceil]);
        } else {
          if (ncell.floor > c.floor + 1e-4) spans.push([c.floor, ncell.floor]);
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
    const mesh = new THREE.Mesh(g, mats[key]);
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    mesh.userData.merged = true;
    mesh.userData.bucket = key;
    group.add(mesh);
  }

  // ---- doors ------------------------------------------------------------
  for (const d of level.doors) {
    const dc = level.cells[d.z * level.W + d.x];
    const h = dc.ceil - dc.floor;
    const geo = new THREE.BoxGeometry(CELL * 0.94, h, CELL * 0.94);
    const mesh = new THREE.Mesh(geo, mats['door_plain'] || mats['door']);
    mesh.position.set(d.x * CELL, dc.floor + h / 2, d.z * CELL);
    mesh.visible = true;
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

  return { group, doorMeshes, exitPad: pad, secretMeshes };
}
