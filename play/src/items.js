// ---------------------------------------------------------------------------
// ITEMS — the things on the floor, built to look like the thing they are.
//
// A medkit should read as a medkit at four metres in a dark corridor: white box,
// red cross, a handle on top. Every builder here returns a Group of small meshes
// using shared geometry and shared materials, so eight pickups on a floor cost
// tens of draw calls, not hundreds, and the shapes are still legible.
// ---------------------------------------------------------------------------

import * as THREE from 'three';

const GEO = new Map();
const MAT = new Map();

function geo(key, make) {
  let g = GEO.get(key);
  if (!g) { g = make(); g.userData.shared = true; GEO.set(key, g); }
  return g;
}

function mat(color, basic = false) {
  const key = color + (basic ? 'b' : 'l');
  let m = MAT.get(key);
  if (!m) {
    m = basic ? new THREE.MeshBasicMaterial({ color }) : new THREE.MeshLambertMaterial({ color });
    m.userData.shared = true;
    MAT.set(key, m);
  }
  return m;
}

const box = (w, h, d, color, x = 0, y = 0, z = 0, basic = false) => {
  const m = new THREE.Mesh(geo(`b${w}:${h}:${d}`, () => new THREE.BoxGeometry(w, h, d)), mat(color, basic));
  m.position.set(x, y, z);
  return m;
};

const cyl = (rt, rb, h, seg, color, x = 0, y = 0, z = 0, basic = false) => {
  const m = new THREE.Mesh(geo(`c${rt}:${rb}:${h}:${seg}`, () => new THREE.CylinderGeometry(rt, rb, h, seg)), mat(color, basic));
  m.position.set(x, y, z);
  return m;
};

const ball = (r, seg, color, x = 0, y = 0, z = 0, basic = false) => {
  const m = new THREE.Mesh(geo(`s${r}:${seg}`, () => new THREE.SphereGeometry(r, seg, Math.max(4, seg >> 1))), mat(color, basic));
  m.position.set(x, y, z);
  return m;
};

const torus = (r, tube, color, x = 0, y = 0, z = 0) => {
  const m = new THREE.Mesh(geo(`t${r}:${tube}`, () => new THREE.TorusGeometry(r, tube, 6, 12)), mat(color));
  m.position.set(x, y, z);
  return m;
};

// ---------------------------------------------------------------- the items

/** A white case with a red cross and a handle: a medkit. */
export function medkit() {
  const g = new THREE.Group();
  g.add(box(0.34, 0.22, 0.26, 0xe8e6e1, 0, 0, 0));
  g.add(box(0.34, 0.03, 0.27, 0xb9b6ae, 0, 0.11, 0));   // lid
  g.add(box(0.19, 0.05, 0.02, 0xd8342a, 0, 0.02, 0.135, true)); // cross, horizontal
  g.add(box(0.05, 0.19, 0.02, 0xd8342a, 0, 0.02, 0.135, true)); // cross, vertical
  g.add(box(0.14, 0.035, 0.05, 0x6d6a63, 0, 0.145, 0)); // handle
  return g;
}

/** A green ammo can with brass showing under the lid. */
export function ammoBox(shells = false) {
  const g = new THREE.Group();
  const body = shells ? 0x5a4a2a : 0x3f4a2c;
  g.add(box(0.32, 0.2, 0.22, body, 0, 0, 0));
  g.add(box(0.33, 0.03, 0.23, 0x2a3120, 0, 0.1, 0));
  // a stencilled stripe so it reads as military rather than a crate
  g.add(box(0.33, 0.035, 0.02, shells ? 0xd8892a : 0x9aa06a, 0, 0.03, 0.115, true));
  if (shells) {
    // four shells standing in the open top
    for (let i = 0; i < 4; i++) {
      g.add(cyl(0.035, 0.035, 0.16, 6, 0xc23a2a, -0.11 + i * 0.073, 0.19, 0));
      g.add(cyl(0.037, 0.037, 0.04, 6, 0xd8b24a, -0.11 + i * 0.073, 0.28, 0, true));
    }
  } else {
    g.add(box(0.06, 0.02, 0.1, 0x8a8f6a, -0.08, 0.115, 0)); // rounds glimpsed in the lid
    g.add(box(0.06, 0.02, 0.1, 0x8a8f6a, 0.02, 0.115, 0));
  }
  return g;
}

/** A flak vest on a stand: a curved plate with straps. */
export function armourVest() {
  const g = new THREE.Group();
  // wider than it is tall and flattened front to back: a vest, not a can
  const plate = cyl(0.24, 0.2, 0.26, 8, 0x3f6fa8, 0, 0, 0);
  plate.scale.set(1, 1, 0.34);
  g.add(plate);
  // a V-neck cut and two straps over the shoulders
  for (const sx of [-1, 1]) {
    const strap = box(0.09, 0.05, 0.1, 0x2b4c74, sx * 0.1, 0.15, 0);
    strap.rotation.z = sx * 0.35;
    g.add(strap);
    const side = box(0.06, 0.2, 0.16, 0x2b4c74, sx * 0.23, 0, 0);
    g.add(side);
  }
  g.add(box(0.16, 0.13, 0.02, 0x9fc3e8, 0, -0.01, 0.075, true)); // front plate highlight
  g.add(box(0.05, 0.05, 0.02, 0x2b4c74, 0, -0.01, 0.078));        // webbing
  return g;
}

/** A rocket: tube, nose cone, fins. */
export function rocket() {
  const g = new THREE.Group();
  g.add(cyl(0.055, 0.055, 0.34, 8, 0x8fe04a, 0, 0, 0));
  const nose = new THREE.Mesh(geo('cone', () => new THREE.ConeGeometry(0.055, 0.14, 8)), mat(0xd8d0c0));
  nose.position.y = 0.24;
  g.add(nose);
  for (let i = 0; i < 3; i++) {
    const fin = box(0.02, 0.1, 0.09, 0x4a7a2a, 0, -0.14, 0);
    fin.rotation.y = (i / 3) * Math.PI * 2;
    fin.position.x = Math.sin(fin.rotation.y) * 0.05;
    fin.position.z = Math.cos(fin.rotation.y) * 0.05;
    g.add(fin);
  }
  return g;
}

/** A grenade: body, lever, pin ring. */
export function grenadeItem() {
  const g = new THREE.Group();
  const body = ball(0.1, 8, 0x4a5a2a, 0, 0, 0);
  body.scale.set(1, 1.2, 1);
  g.add(body);
  g.add(cyl(0.045, 0.05, 0.06, 6, 0x6a6a6a, 0, 0.12, 0));
  g.add(box(0.02, 0.08, 0.05, 0x8a8a8a, 0.05, 0.11, 0));
  g.add(torus(0.035, 0.008, 0xb0b0b0, -0.05, 0.11, 0));
  return g;
}

/** A keycard: card, stripe, chip. */
export function keycardItem() {
  const g = new THREE.Group();
  g.add(box(0.3, 0.02, 0.2, 0xf0d264, 0, 0, 0, true));
  g.add(box(0.3, 0.021, 0.045, 0x2a2a2a, 0, 0.001, -0.05));
  g.add(box(0.06, 0.022, 0.05, 0xfff2b0, -0.09, 0.002, 0.06));
  return g;
}

/** A relic: a small stone idol on a plinth, with a chip of light in its skull. */
export function relicItem() {
  const g = new THREE.Group();
  g.add(cyl(0.14, 0.16, 0.08, 8, 0x6a5a4a, 0, -0.16, 0));
  const torso = cyl(0.08, 0.11, 0.2, 7, 0x8a7a66, 0, -0.02, 0);
  g.add(torso);
  g.add(ball(0.1, 8, 0xb0a08a, 0, 0.13, 0));
  g.add(box(0.05, 0.03, 0.02, 0xc77dff, -0.04, 0.15, 0.09, true));
  g.add(box(0.05, 0.03, 0.02, 0xc77dff, 0.04, 0.15, 0.09, true));
  return g;
}

/** A trinket: a coin, a ring or a compass — one per slot. */
export function trinketItem(kind = 0) {
  const g = new THREE.Group();
  if (kind === 0) {
    const coin = cyl(0.11, 0.11, 0.02, 12, 0xd8b24a, 0, 0, 0);
    coin.rotation.x = Math.PI / 2;
    g.add(coin);
    g.add(torus(0.11, 0.012, 0xb08a2a, 0, 0, 0));
  } else if (kind === 1) {
    const ring = torus(0.1, 0.02, 0xd8d0c0, 0, 0, 0);
    g.add(ring);
    g.add(ball(0.03, 6, 0xff3b30, 0, 0.11, 0, true));
  } else {
    g.add(cyl(0.1, 0.1, 0.035, 10, 0x8a7a5a, 0, 0, 0));
    g.add(box(0.012, 0.01, 0.13, 0xff3b30, 0, 0.02, 0, true));
    g.add(box(0.13, 0.01, 0.012, 0xe8e6e1, 0, 0.02, 0, true));
  }
  return g;
}

/** A shell pickup: three loose shotgun shells. */
export function shellPickup() {
  const g = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const x = (i - 1) * 0.07;
    g.add(cyl(0.035, 0.035, 0.14, 6, 0xc23a2a, x, 0, 0));
    g.add(cyl(0.037, 0.037, 0.035, 6, 0xd8b24a, x, 0.085, 0, true));
  }
  return g;
}

/**
 * Every builder by name. The game calls them directly; this exists so a tool can
 * enumerate what a floor can hold without importing each one.
 */
const ITEM_BUILDERS = {
  medkit,
  ammoBox,
  armourVest,
  rocket,
  grenadeItem,
  keycardItem,
  relicItem,
  trinketItem,
  shellPickup,
};

/** The builder table, for tools that need to enumerate what a floor can hold. */
export default ITEM_BUILDERS;
