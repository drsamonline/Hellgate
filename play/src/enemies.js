// ---------------------------------------------------------------------------
// ENEMIES — two compound-mesh types with a finite state machine:
// IDLE -> CHASE -> ATTACK -> PAIN -> DEATH
// ---------------------------------------------------------------------------

import * as THREE from 'three';
import { circleBlocked, floorHeightAt, hasLineOfSight, buildFlowField, flowStep, MAX_STEP } from './level.js';

const STATE = { IDLE: 'IDLE', CHASE: 'CHASE', ATTACK: 'ATTACK', PAIN: 'PAIN', DEATH: 'DEATH' };

const TYPES = {
  imp: {
    hp: 55, speed: 2.5, radius: 0.62, height: 1.85, hitRadius: 0.62,
    attackRange: 14, attackCd: 2.1, telegraph: 0.55, damage: 15,
    melee: false, sight: 22, color: 0x8a3524, label: 'IMP', pitch: 1.0,
  },
  warden: {
    hp: 620, speed: 1.9, radius: 1.05, height: 3.0, hitRadius: 1.45,
    attackRange: 20, attackCd: 2.3, telegraph: 0.7, damage: 18,
    melee: true, meleeRange: 3.4, meleeDamage: 26, sight: 32, color: 0x6a1020, label: 'WARDEN', pitch: 0.55,
    boss: true,
  },
  hound: {
    hp: 22, speed: 4.4, radius: 0.64, height: 1.05, hitRadius: 0.45,
    attackRange: 2.4, attackCd: 0.9, telegraph: 0.25, damage: 9,
    melee: true, meleeRange: 1.9, meleeDamage: 11, sight: 26, color: 0x8a1f6a, label: 'HOUND', pitch: 1.45,
  },
  grunt: {
    hp: 40, speed: 3.3, radius: 0.52, height: 1.7, hitRadius: 0.55,
    attackRange: 16, attackCd: 1.4, telegraph: 0.4, damage: 8,
    melee: true, meleeRange: 2.4, meleeDamage: 12, sight: 24, color: 0x53603c, label: 'GRUNT', pitch: 0.8,
  },
  brute: {
    // slow until it sees you, then it does not stop
    hp: 140, speed: 1.7, chargeSpeed: 5.2, radius: 0.78, height: 2.5, hitRadius: 0.9,
    attackRange: 2.8, attackCd: 1.6, telegraph: 0.6, damage: 10,
    melee: true, meleeRange: 2.6, meleeDamage: 24, sight: 26, color: 0x3d4a63, label: 'BRUTE', pitch: 0.65,
    charges: true,
  },
  wisp: {
    // floats, so it ignores stairs and looks wrong doing it
    hp: 18, speed: 3.6, radius: 0.42, height: 1.2, hitRadius: 0.55,
    attackRange: 15, attackCd: 2.4, telegraph: 0.5, damage: 9,
    melee: false, sight: 24, color: 0x4fd8e8, label: 'WISP', pitch: 1.7,
    hover: 1.15,
  },
  spitter: {
    // holds its distance and lobs: the only enemy that punishes standing still
    hp: 34, speed: 2.0, radius: 0.55, height: 1.95, hitRadius: 0.6,
    attackRange: 18, attackCd: 2.6, telegraph: 0.75, damage: 14,
    melee: false, sight: 26, color: 0x2f6a5e, label: 'SPITTER', pitch: 1.25,
    keepsDistance: 9, lob: true,
  },
};

// Geometry is cached and shared by every enemy of a type: 24 imps on screen
// must not mean 240 separate GPU buffers.
const GEO = new Map();
function boxGeo(w, h, d) {
  const k = `b:${w}:${h}:${d}`;
  let g = GEO.get(k);
  if (!g) { g = new THREE.BoxGeometry(w, h, d); g.userData.shared = true; GEO.set(k, g); }
  return g;
}
function coneGeo(r, h, seg) {
  const k = `c:${r}:${h}:${seg}`;
  let g = GEO.get(k);
  if (!g) { g = new THREE.ConeGeometry(r, h, seg); g.userData.shared = true; GEO.set(k, g); }
  return g;
}

function cylGeo(rt, rb, h, seg) {
  const k = `y:${rt}:${rb}:${h}:${seg}`;
  let g = GEO.get(k);
  if (!g) { g = new THREE.CylinderGeometry(rt, rb, h, seg); g.userData.shared = true; GEO.set(k, g); }
  return g;
}
function sphereGeo(r, seg) {
  const k = `s:${r}:${seg}`;
  let g = GEO.get(k);
  if (!g) { g = new THREE.SphereGeometry(r, seg, Math.max(4, seg >> 1)); g.userData.shared = true; GEO.set(k, g); }
  return g;
}

let MATS = null;
function mats() {
  if (MATS) return MATS;
  const body = (color) => {
    const m = new THREE.MeshLambertMaterial({ color });
    m.userData.shared = true;
    m.userData.flashable = true; // gets cloned per enemy so it can flash on hit
    return m;
  };
  const plain = (color, basic) => {
    const m = basic
      ? new THREE.MeshBasicMaterial({ color })
      : new THREE.MeshLambertMaterial({ color });
    m.userData.shared = true;
    return m;
  };
  MATS = {
    impBody: body(0x8a3524),
    impDark: body(0x5c2018),
    impEye: plain(0xffcf4d, true),
    gruntBody: body(0x53603c),
    gruntDark: body(0x2f3a24),
    gruntMetal: plain(0x6d7278),
    eye: plain(0xff5533, true),
    houndBody: body(0x6d1a52),
    houndDark: body(0x3d0f2e),
    houndEye: plain(0xff4fd8, true),
    wardenBody: body(0x5e1420),
    wardenDark: body(0x320a12),
    wardenEye: plain(0xffb454, true),
    wardenGlow: plain(0xff3b30, true),
    spitterBody: body(0x2f6a5e),
    spitterSac: body(0x7fd67f),
    spitterDark: body(0x1c3f38),
    spitterEye: plain(0xaaffcc, true),
    bruteBody: body(0x3d4a63),
    brutePlate: body(0x232c3d),
    wispBody: body(0x4fd8e8),
    wispGlow: plain(0xd8fbff, true),
  };
  return MATS;
}

/** A curved limb: a tapered cylinder that pivots at its joint. */
function limbCyl(rt, rb, len, m, jx, jy, jz) {
  const pivot = new THREE.Group();
  pivot.position.set(jx, jy, jz);
  const mesh = new THREE.Mesh(cylGeo(rt, rb, len, 6), m);
  mesh.position.y = -len / 2;
  pivot.add(mesh);
  return pivot;
}

function sphere(r, m, x = 0, y = 0, z = 0, seg = 8) {
  const mesh = new THREE.Mesh(sphereGeo(r, seg), m);
  mesh.position.set(x, y, z);
  return mesh;
}

function box(w, h, d, m, x = 0, y = 0, z = 0) {
  const mesh = new THREE.Mesh(boxGeo(w, h, d), m);
  mesh.position.set(x, y, z);
  return mesh;
}

// A limb that pivots at its joint (shoulder/hip) instead of its centre, so the
// walk cycle swings properly.
function limb(w, h, d, m, jx, jy, jz, drop) {
  const pivot = new THREE.Group();
  pivot.position.set(jx, jy, jz);
  const mesh = new THREE.Mesh(boxGeo(w, h, d), m);
  mesh.position.y = -drop;
  pivot.add(mesh);
  return pivot;
}

function makeImp() {
  const M = mats();
  const g = new THREE.Group();
  const torso = new THREE.Mesh(cylGeo(0.30, 0.42, 0.9, 8), M.impBody);
  torso.position.set(0, 1.18, 0.02);
  torso.rotation.x = 0.16;
  g.add(torso);
  const hump = sphere(0.34, M.impBody, 0, 1.56, -0.06, 8);
  hump.scale.set(1, 0.8, 0.9);
  g.add(hump);
  const neck = new THREE.Mesh(cylGeo(0.11, 0.14, 0.34, 6), M.impDark);
  neck.position.set(0, 1.74, 0.12);
  neck.rotation.x = 0.5;
  g.add(neck);
  const head = sphere(0.19, M.impDark, 0, 1.9, 0.26, 7);
  head.scale.set(1, 0.85, 1.15);
  g.add(head);
  for (const sx of [-1, 1]) {
    const horn = new THREE.Mesh(coneGeo(0.06, 0.32, 5), M.impDark);
    horn.position.set(sx * 0.12, 2.06, 0.16);
    horn.rotation.z = sx * 0.45;
    horn.rotation.x = -0.3;
    g.add(horn);
    g.add(sphere(0.045, M.impEye, sx * 0.08, 1.92, 0.4, 5));
  }
  const armL = limbCyl(0.055, 0.075, 0.86, M.impBody, -0.34, 1.55, 0.04);
  const armR = limbCyl(0.055, 0.075, 0.86, M.impBody, 0.34, 1.55, 0.04);
  armL.rotation.z = 0.22;
  armR.rotation.z = -0.22;
  const legL = limbCyl(0.08, 0.11, 0.78, M.impDark, -0.17, 0.8, 0);
  const legR = limbCyl(0.08, 0.11, 0.78, M.impDark, 0.17, 0.8, 0);
  g.add(armL, armR, legL, legR);
  return { group: g, parts: { armL, armR, legL, legR } };
}

function makeGrunt() {
  const M = mats();
  const g = new THREE.Group();
  const torso = new THREE.Mesh(cylGeo(0.44, 0.34, 0.95, 8), M.gruntBody);
  torso.position.set(0, 1.16, 0);
  g.add(torso);
  for (const sx of [-1, 1]) {
    const pad = sphere(0.22, M.gruntMetal, sx * 0.42, 1.55, 0, 7);
    pad.scale.set(1.1, 0.85, 1);
    g.add(pad);
  }
  const helm = sphere(0.24, M.gruntMetal, 0, 1.78, 0.02, 8);
  helm.scale.set(1, 0.95, 1.05);
  g.add(helm);
  g.add(box(0.3, 0.06, 0.05, M.eye, 0, 1.79, 0.22));
  const gun = new THREE.Group();
  gun.add(box(0.1, 0.1, 0.56, M.gruntMetal, 0, 0, 0.2));
  gun.add(box(0.08, 0.18, 0.08, M.gruntDark, 0, -0.1, -0.02));
  gun.position.set(0, -0.62, 0.08);
  const armR = limbCyl(0.1, 0.12, 0.8, M.gruntBody, 0.48, 1.5, 0);
  armR.add(gun);
  const armL = limbCyl(0.1, 0.12, 0.8, M.gruntBody, -0.48, 1.5, 0);
  const legL = limbCyl(0.12, 0.14, 0.78, M.gruntDark, -0.19, 0.78, 0);
  const legR = limbCyl(0.12, 0.14, 0.78, M.gruntDark, 0.19, 0.78, 0);
  g.add(armL, armR, legL, legR);
  return { group: g, parts: { armL, armR, legL, legR } };
}

function makeWarden() {
  const M = mats();
  const g = new THREE.Group();
  // three metres of armoured bulk: a barrel chest that tapers to the waist, a
  // slab of shoulder either side, and a furnace in the middle of it
  const chest = new THREE.Mesh(cylGeo(0.86, 0.62, 1.5, 10), M.wardenBody);
  chest.position.set(0, 1.95, 0);
  g.add(chest);
  const gut = new THREE.Mesh(cylGeo(0.62, 0.5, 0.7, 10), M.wardenDark);
  gut.position.set(0, 1.15, 0);
  g.add(gut);
  for (const sx of [-1, 1]) {
    const pad = sphere(0.52, M.wardenDark, sx * 0.92, 2.62, 0, 8);
    pad.scale.set(1.15, 0.8, 1.05);
    g.add(pad);
  }
  // head sunk between the shoulders, horned
  const head = sphere(0.34, M.wardenDark, 0, 2.92, 0.06, 8);
  head.scale.set(1, 0.92, 1.05);
  g.add(head);
  for (const sx of [-1, 1]) {
    const horn = new THREE.Mesh(coneGeo(0.1, 0.62, 6), M.wardenDark);
    horn.position.set(sx * 0.3, 3.18, 0.02);
    horn.rotation.z = sx * 0.55;
    g.add(horn);
    g.add(sphere(0.07, M.wardenEye, sx * 0.15, 2.96, 0.34, 6));
  }
  // the furnace: what the health bar is actually measuring
  const core = sphere(0.26, M.wardenGlow, 0, 1.95, 0.56, 8);
  g.add(core);
  const ring = new THREE.Mesh(cylGeo(0.34, 0.34, 0.12, 10), M.wardenDark);
  ring.rotation.x = Math.PI / 2;
  ring.position.set(0, 1.95, 0.5);
  g.add(ring);

  const armL = limbCyl(0.26, 0.34, 1.5, M.wardenBody, -0.95, 2.5, 0);
  const armR = limbCyl(0.26, 0.34, 1.5, M.wardenBody, 0.95, 2.5, 0);
  const legL = limbCyl(0.34, 0.42, 1.0, M.wardenDark, -0.4, 1.0, 0);
  const legR = limbCyl(0.34, 0.42, 1.0, M.wardenDark, 0.4, 1.0, 0);
  g.add(armL, armR, legL, legR);
  return { group: g, parts: { armL, armR, legL, legR, core } };
}

function makeBrute() {
  const M = mats();
  const g = new THREE.Group();
  // a wedge of plate with the head low between the shoulders
  const chest = new THREE.Mesh(cylGeo(0.72, 0.56, 1.25, 8), M.bruteBody);
  chest.position.set(0, 1.55, 0);
  chest.rotation.x = 0.12;
  g.add(chest);
  for (const sx of [-1, 1]) {
    const pad = sphere(0.46, M.brutePlate, sx * 0.72, 2.16, -0.04, 7);
    pad.scale.set(1.2, 0.75, 1.05);
    g.add(pad);
  }
  const head = sphere(0.26, M.brutePlate, 0, 2.34, 0.28, 7);
  head.scale.set(1, 0.8, 1.25);
  g.add(head);
  g.add(box(0.34, 0.05, 0.06, M.eye, 0, 2.36, 0.5));
  // knuckles on the floor: the silhouette that says "it charges"
  const armL = limbCyl(0.2, 0.3, 1.5, M.bruteBody, -0.76, 2.0, 0);
  const armR = limbCyl(0.2, 0.3, 1.5, M.bruteBody, 0.76, 2.0, 0);
  for (const a of [armL, armR]) {
    const fist = sphere(0.24, M.brutePlate, 0, -1.5, 0, 6);
    a.add(fist);
  }
  const legL = limbCyl(0.24, 0.3, 0.95, M.brutePlate, -0.3, 0.95, 0);
  const legR = limbCyl(0.24, 0.3, 0.95, M.brutePlate, 0.3, 0.95, 0);
  g.add(armL, armR, legL, legR);
  return { group: g, parts: { armL, armR, legL, legR } };
}

function makeWisp() {
  const M = mats();
  const g = new THREE.Group();
  // a hood and a light: nothing below the waist, because it floats
  const hood = sphere(0.3, M.wispBody, 0, 0, 0, 8);
  hood.scale.set(1, 1.25, 1);
  g.add(hood);
  const core = sphere(0.16, M.wispGlow, 0, 0.02, 0.06, 7);
  g.add(core);
  for (let i = 0; i < 3; i++) {
    const tail = new THREE.Mesh(coneGeo(0.11 - i * 0.02, 0.34, 5), M.wispBody);
    tail.position.set(0, -0.42 - i * 0.16, 0);
    tail.rotation.x = Math.PI;
    g.add(tail);
  }
  const armL = new THREE.Group();
  const armR = new THREE.Group();
  for (const [grp, sx] of [[armL, -1], [armR, 1]]) {
    const wisp = new THREE.Mesh(coneGeo(0.06, 0.3, 4), M.wispBody);
    wisp.position.set(sx * 0.3, 0.02, 0);
    wisp.rotation.z = sx * -1.2;
    grp.add(wisp);
    grp.position.set(0, 0.1, 0);
    g.add(grp);
  }
  return { group: g, parts: { armL, armR, legL: null, legR: null, core } };
}

function makeSpitter() {
  const M = mats();
  const g = new THREE.Group();
  // thin and tall, bent forward over a sac that is the whole silhouette
  const spine = new THREE.Mesh(cylGeo(0.16, 0.22, 1.1, 7), M.spitterBody);
  spine.position.set(0, 1.32, -0.04);
  spine.rotation.x = -0.22;
  g.add(spine);
  const sac = sphere(0.42, M.spitterSac, 0, 1.16, 0.26, 9);
  sac.scale.set(1, 0.92, 1.05);
  g.add(sac);
  const head = sphere(0.2, M.spitterDark, 0, 1.86, 0.16, 7);
  head.scale.set(1, 0.9, 1.2);
  g.add(head);
  for (const sx of [-1, 1]) {
    g.add(sphere(0.05, M.spitterEye, sx * 0.09, 1.88, 0.32, 5));
  }
  // a dripping maw
  const maw = new THREE.Mesh(coneGeo(0.12, 0.26, 6), M.spitterSac);
  maw.rotation.x = Math.PI;
  maw.position.set(0, 1.76, 0.36);
  g.add(maw);
  const armL = limbCyl(0.05, 0.07, 0.9, M.spitterDark, -0.26, 1.62, 0);
  const armR = limbCyl(0.05, 0.07, 0.9, M.spitterDark, 0.26, 1.62, 0);
  const legL = limbCyl(0.07, 0.1, 0.86, M.spitterDark, -0.16, 0.86, 0);
  const legR = limbCyl(0.07, 0.1, 0.86, M.spitterDark, 0.16, 0.86, 0);
  g.add(armL, armR, legL, legR);
  return { group: g, parts: { armL, armR, legL, legR } };
}

function makeHound() {
  const M = mats();
  const g = new THREE.Group();
  const body = new THREE.Mesh(cylGeo(0.22, 0.26, 1.15, 7), M.houndBody);
  body.rotation.x = Math.PI / 2;
  body.position.set(0, 0.62, 0);
  g.add(body);
  const haunch = sphere(0.28, M.houndBody, 0, 0.66, -0.44, 7);
  haunch.scale.set(1, 0.85, 1);
  g.add(haunch);
  const neck = new THREE.Mesh(cylGeo(0.13, 0.18, 0.4, 6), M.houndDark);
  neck.position.set(0, 0.7, 0.5);
  neck.rotation.x = 1.15;
  g.add(neck);
  const head = new THREE.Mesh(coneGeo(0.17, 0.44, 6), M.houndDark);
  head.rotation.x = Math.PI / 2;
  head.position.set(0, 0.66, 0.82);
  g.add(head);
  for (const sx of [-1, 1]) {
    g.add(sphere(0.04, M.houndEye, sx * 0.09, 0.74, 0.78, 5));
    const ear = new THREE.Mesh(coneGeo(0.05, 0.2, 4), M.houndDark);
    ear.position.set(sx * 0.12, 0.88, 0.62);
    ear.rotation.z = sx * 0.3;
    g.add(ear);
  }
  for (let i = 0; i < 3; i++) {
    const spike = new THREE.Mesh(coneGeo(0.06, 0.22, 4), M.houndDark);
    spike.position.set(0, 0.9, -0.1 - i * 0.28);
    spike.rotation.x = -0.25;
    g.add(spike);
  }
  const legL = limbCyl(0.06, 0.08, 0.62, M.houndDark, -0.2, 0.62, 0.36);
  const legR = limbCyl(0.06, 0.08, 0.62, M.houndDark, 0.2, 0.62, 0.36);
  const backL = limbCyl(0.06, 0.08, 0.62, M.houndDark, -0.2, 0.62, -0.4);
  const backR = limbCyl(0.06, 0.08, 0.62, M.houndDark, 0.2, 0.62, -0.4);
  g.add(legL, legR, backL, backR);
  return { group: g, parts: { armL: legL, armR: legR, legL: backL, legR: backR } };
}

/** How many bodies stay in the world before the oldest is cleared. */
const MAX_CORPSES = 12;

// Distance past which an enemy is drawn as one box instead of ten parts. The
// bodies are ~10 meshes each, which is where the draw calls go: at 22 m you
// cannot tell a limb from a slab, and the frame gets 9 calls back per enemy.
const LOD_DIST = 22;
const PROXY_GEO = new THREE.BoxGeometry(1, 1, 1);
const PROXY_MAT = new THREE.MeshLambertMaterial({ color: 0x2a1a18 });

/**
 * One enemy: mesh, state machine, health. Geometry is shared per type; body materials are cloned for the hit flash.
 */
export class Enemy {
  constructor(typeName, worldPos, wave, scene, opts = {}) {
    const T = TYPES[typeName];
    this.type = typeName;
    this.T = T;
    this.scene = scene;

    const built = typeName === 'imp' ? makeImp()
      : typeName === 'hound' ? makeHound()
      : typeName === 'warden' ? makeWarden()
      : typeName === 'spitter' ? makeSpitter()
      : typeName === 'brute' ? makeBrute()
      : typeName === 'wisp' ? makeWisp()
      : makeGrunt();
    this.body = built.group;
    this.mesh = new THREE.Group();
    this.mesh.add(this.body);
    this.parts = built.parts;

    // clone the body materials for this enemy only, so a hit can flash it
    // without lighting up every other enemy on the map
    this.flashMats = [];
    this.flash = 0;
    this.charging = 0;   // 0..1 through the wind-up
    this.charged = false; // true while a wind-up glow needs clearing
    const remap = new Map();
    this.mesh.traverse((o) => {
      if (!o.isMesh || !o.material) return;
      const src = o.material;
      if (!src.userData || !src.userData.flashable) return;
      let m = remap.get(src);
      if (!m) {
        m = src.clone();
        m.userData.shared = false;
        remap.set(src, m);
        this.flashMats.push(m);
      }
      o.material = m;
    });

    // a single-slab stand-in, shown only when the enemy is far away
    this.proxy = new THREE.Mesh(PROXY_GEO, PROXY_MAT);
    this.proxy.scale.set(T.radius * 2.2, T.height, T.radius * 2.2);
    this.proxy.position.y = T.height / 2;
    this.proxy.visible = false;
    this.mesh.add(this.proxy);

    this.mesh.position.copy(worldPos);
    scene.add(this.mesh);

    const diff = opts.diff || { hp: 1, dmg: 1, count: 1 };
    const scale = (1 + 0.1 * (wave - 1)) * diff.hp;
    this.maxHp = Math.max(1, Math.round(T.hp * scale));
    this.hp = this.maxHp;
    this.speed = T.speed * Math.min(1.45, 1 + 0.03 * (wave - 1));
    this.damage = T.damage * Math.min(2.2, 1 + 0.06 * (wave - 1)) * diff.dmg;

    this.pos = worldPos.clone();
    this.state = STATE.IDLE;
    this.stateT = 0;
    this.attackCd = 0.6 + Math.random() * 0.8;
    this.fired = false;
    this.walkPhase = Math.random() * 6.28;
    this.wanderAngle = Math.random() * Math.PI * 2;
    this.wanderT = 0;
    this.lostSight = 0;
    this.dead = false;
    this.deadT = 0;
    this.radius = T.radius;
    this.height = T.height;
    this.hitRadius = T.hitRadius;
    this.moving = false;
  }

  get alive() { return !this.dead && this.state !== STATE.DEATH; }

  eyePos() {
    return { x: this.pos.x, y: this.pos.y + this.height * 0.85, z: this.pos.z };
  }

  chestPos() {
    return { x: this.pos.x, y: this.pos.y + this.height * 0.55, z: this.pos.z };
  }

  setState(s) {
    this.state = s;
    this.stateT = 0;
  }

  hurt(amount, ctx, fromDir) {
    if (!this.alive) return false;
    this.hp -= amount;
    this.flash = 0.16;
    const c = this.chestPos();
    ctx.effects.blood(c, fromDir);
    if (this.hp <= 0) {
      this.die(ctx);
      return true;
    }
    ctx.audio.play('pain', this.chestPos());
    if (Math.random() < 0.55) this.setState(STATE.PAIN);
    return false;
  }

  die(ctx) {
    if (ctx && ctx.effects) {
      const f = floorHeightAt(ctx.level, this.pos.x, this.pos.z);
      ctx.effects.decal({ x: this.pos.x, y: f + 0.012, z: this.pos.z }, { x: 0, y: 1, z: 0 }, 'blood', 1.5);
    }
    this.dead = true;
    this.state = STATE.DEATH;
    this.stateT = 0;
    this.deadT = 0;
    const c = this.chestPos();
    ctx.effects.gibs(c);
    ctx.audio.play('enemyDie', this.chestPos());
    if (ctx.onKill) ctx.onKill(this, ctx.weapon || null);
  }

  update(dt, ctx) {
    const { level, player } = ctx;
    this.stateT += dt;

    // ground follow, unless it floats
    const f = floorHeightAt(level, this.pos.x, this.pos.z);
    if (this.T.hover) {
      this.bobT = (this.bobT || 0) + dt;
      this.pos.y = f + this.T.hover + Math.sin(this.bobT * 1.9) * 0.12;
    } else {
      this.pos.y = f;
    }
    this.mesh.position.x = this.pos.x;
    this.mesh.position.z = this.pos.z;
    this.mesh.position.y = f;

    // contact shadow: cheap, one quad, follows the body and fades when it dies
    if (!this.shadow && ctx && ctx.effects && ctx.effects.groundShadow) {
      this.shadow = ctx.effects.groundShadow(this.hitRadius * 2.2);
    }
    if (this.shadow) {
      this.shadow.position.set(this.pos.x, f + 0.02, this.pos.z);
      this.shadow.material.opacity = this.state === STATE.DEATH ? 0.18 : 0.34;
    }

    if (this.state === STATE.DEATH) {
      this.deadT += dt;
      const t = Math.min(1, this.deadT / 0.45);
      this.mesh.rotation.x = (Math.PI / 2) * t * 0.92;
      // the body stays on the floor: a wave that clears leaves a room that
      // looks like a fight happened in it
      if (this.deadT > 1.4) {
        const sink = Math.min(1, (this.deadT - 1.4) / 1.2);
        this.mesh.position.y = f - 0.12 * sink;   // settles, does not sink away
      }
      return;
    }

    // safety net: a body inside rock is a bug, but it should never be visible
    if (this.depenetrate(level)) this.depenetrated = (this.depenetrated || 0) + 1;

    // level of detail: one slab when it is far away, the full body up close
    const lodDist = Math.hypot(player.pos.x - this.pos.x, player.pos.z - this.pos.z);
    const far = lodDist > LOD_DIST && this.state !== STATE.DEATH;
    if (this.proxy) {
      if (this.proxy.visible !== far) {
        this.proxy.visible = far;
        this.body.visible = !far;
      }
    }

    const dx = player.pos.x - this.pos.x;
    const dz = player.pos.z - this.pos.z;
    const dist = Math.hypot(dx, dz);
    const playerEye = { x: player.pos.x, y: player.pos.y + 1.6 - 0.57 * (player.crouch || 0), z: player.pos.z };
    const canSee = player.alive && dist < this.T.sight && hasLineOfSight(level, this.eyePos(), playerEye);

    this.attackCd -= dt;

    switch (this.state) {
      case STATE.IDLE: {
        this.wanderT -= dt;
        if (this.wanderT <= 0) {
          this.wanderT = 1.2 + Math.random() * 2;
          this.wanderAngle = Math.random() * Math.PI * 2;
        }
        this.moving = this.stepMove(level, Math.cos(this.wanderAngle) * 0.5, Math.sin(this.wanderAngle) * 0.5, dt);
        if (canSee) {
          this.setState(STATE.CHASE);
          // a bark on first sight, pitched by body type so you can hear what found you
          ctx.audio.play('spot', this.chestPos(), { pitch: this.T.pitch || 1 });
        }
        break;
      }
      case STATE.CHASE: {
        if (this.T.keepsDistance && canSee && dist < this.T.keepsDistance) {
          // hold the range it lobs from
          this.moving = this.stepMove(level, -dx / (dist || 1), -dz / (dist || 1), dt);
          this.faceTo(dx, dz);
          if (this.attackCd <= 0) this.setState(STATE.ATTACK);
          break;
        }
        const nav = this.navDir(level, ctx.field, dx, dz, dist);
        if (this.T.charges && canSee && dist < 12) this.speed = this.T.chargeSpeed;
        else if (this.T.charges) this.speed = this.T.speed;
        if (dist > 0.9 && nav) this.moving = this.stepMove(level, nav.x, nav.z, dt);
        else this.moving = false;
        this.faceTo(dx, dz);
        if (canSee) this.lostSight = 0;
        else this.lostSight += dt;

        if (canSee && this.attackCd <= 0) {
          const inMelee = this.T.melee && dist < this.T.meleeRange;
          if (dist < this.T.attackRange || inMelee) this.setState(STATE.ATTACK);
        }
        if (this.lostSight > 4) this.setState(STATE.IDLE);
        break;
      }
      case STATE.ATTACK: {
        this.moving = false;
        this.faceTo(dx, dz);
        const tg = this.T.telegraph;
        if (this.stateT < tg) {
          // telegraph: wind up, and glow while doing it
          this.charging = this.stateT / tg;
          this.charged = true;
          this.mesh.scale.set(1, 1 + Math.sin(this.stateT * 30) * 0.04, 1);
          if (this.type === 'imp' && Math.random() < 0.35) {
            const c = this.chestPos();
            ctx.effects.burst({ x: c.x, y: c.y + 0.3, z: c.z }, 0xff7a22, 1, 1.2, 0.35, -2);
          }
        } else if (!this.fired) {
          this.fired = true;
          this.charging = 0;
          this.mesh.scale.set(1, 1, 1);
          this.doAttack(ctx, dist, dx, dz, canSee, playerEye);
        } else if (this.stateT > tg + 0.35) {
          this.fired = false;
          this.attackCd = this.T.attackCd;
          this.setState(STATE.CHASE);
        }
        break;
      }
      case STATE.PAIN: {
        this.moving = false;
        this.charging = 0;
        if (this.stateT > 0.26) this.setState(STATE.CHASE);
        break;
      }
    }

    this.updatePhase(ctx);
    this.animate(dt);
  }

  doAttack(ctx, dist, dx, dz, canSee, playerEye) {
    const { player, projectiles, audio } = ctx;

    if (this.T.lob) {
      // aim up so the arc lands on the player, not at their feet
      const from = this.chestPos();
      const to = { x: player.pos.x, y: player.pos.y + 1.0, z: player.pos.z };
      const flat = Math.hypot(to.x - from.x, to.z - from.z);
      const dir = new THREE.Vector3(to.x - from.x, 0, to.z - from.z).normalize();
      projectiles.spawn('acid', new THREE.Vector3(from.x, from.y + 0.3, from.z), dir, {
        damage: this.damage,
        owner: 'enemy',
        vy: 2.2 + flat * 0.28,
      });
      audio.play('fireball', from);
      ctx.effects.burst({ x: from.x, y: from.y, z: from.z }, 0x7fd67f, 6, 2, 0.4, 2);
      return;
    }

    if (this.T.boss) {
      // alternate a ground slam with a three-ball volley
      this.attackMode = this.attackMode === 'slam' ? 'volley' : 'slam';
      const from = this.chestPos();
      if (this.attackMode === 'slam') {
        const reach = this.T.meleeRange + 1.6;
        if (dist <= reach) {
          player.damage(this.T.meleeDamage, from);
          ctx.effects.addShake(0.8);
        }
        ctx.effects.explosion({ x: this.pos.x, y: this.pos.y + 0.2, z: this.pos.z }, 1.3);
        audio.play('boom', from);
      } else {
        for (let i = -1; i <= 1; i++) {
          const dir = new THREE.Vector3(playerEye.x - from.x, playerEye.y - from.y, playerEye.z - from.z).normalize();
          dir.x += i * 0.11;
          dir.y += i * 0.02;
          dir.normalize();
          projectiles.spawn('fireball', new THREE.Vector3(from.x, from.y + 0.4, from.z), dir, {
            damage: this.damage,
            owner: 'enemy',
          });
        }
        audio.play('fireball', from);
      }
      return;
    }

    if (this.type === 'imp') {
      if (!canSee) return;
      const from = this.chestPos();
      const target = { x: playerEye.x, y: playerEye.y - 0.15, z: playerEye.z };
      const dir = new THREE.Vector3(target.x - from.x, target.y - from.y, target.z - from.z).normalize();
      projectiles.spawn('fireball', new THREE.Vector3(from.x, from.y + 0.2, from.z), dir, {
        damage: this.damage,
        owner: 'enemy',
      });
      audio.play('fireball', this.chestPos());
      ctx.effects.flash(new THREE.Vector3(from.x, from.y, from.z), 0xff6622, 6, 0.12, 10);
    } else {
      const inMelee = dist < this.T.meleeRange;
      if (inMelee) {
        player.damage(this.T.meleeDamage * Math.min(2, 1 + 0.05 * (this.maxHp / 40)), this.chestPos());
        audio.play('enemyShoot', this.chestPos());
        return;
      }
      if (!canSee) return;
      // hitscan with a wall check
      const from = this.chestPos();
      const dir = { x: playerEye.x - from.x, y: playerEye.y - from.y, z: playerEye.z - from.z };
      const len = Math.hypot(dir.x, dir.y, dir.z) || 1;
      dir.x /= len; dir.y /= len; dir.z /= len;
      const blocked = hasLineOfSight(ctx.level, from, playerEye) === false;
      if (!blocked) {
        player.damage(this.damage, from);
        ctx.effects.tracer(
          new THREE.Vector3(from.x, from.y, from.z),
          new THREE.Vector3(playerEye.x, playerEye.y, playerEye.z),
          0xff5522
        );
      }
      audio.play('enemyShoot', this.chestPos());
    }
  }

  // Follow the flow field when there is one, so a wall between us and the player
  // is walked around instead of leaned on. Falls back to direct steering when the
  // field has nothing to say (same cell, or no path at all).
  navDir(level, field, dx, dz, dist) {
    if (field) {
      const step = flowStep(level, field, this.pos.x, this.pos.z);
      if (step) return step;
    }
    if (dist < 0.001) return null;
    return { x: dx / dist, z: dz / dist };
  }

  faceTo(dx, dz) {
    this.mesh.rotation.y = Math.atan2(dx, dz);
  }

  stepMove(level, dirX, dirZ, dt) {
    const step = this.speed * dt;
    const mx = dirX * step;
    const mz = dirZ * step;
    let moved = false;
    if (this.tryMove(level, mx, 0)) moved = true;
    if (this.tryMove(level, 0, mz)) moved = true;
    if (!moved) {
      // slide along the blocked axis
      if (this.tryMove(level, -mz * 0.7, mx * 0.7)) moved = true;
    }
    return moved;
  }

  /**
   * If the centre is inside a solid cell, walk it to the nearest open one.
   * The test is the cell, not a circle: a circle test with a body-sized radius
   * fires in legal spots near a wall, and snapping to the cell centre every
   * frame freezes the enemy in place.
   */
  depenetrate(level) {
    const cx = Math.round(this.pos.x / 2);
    const cz = Math.round(this.pos.z / 2);
    if (cx < 0 || cz < 0 || cx >= level.W || cz >= level.H) return false;
    const here = level.cells[cz * level.W + cx];
    if (here && !here.solid && !here.crate) return false;
    let best = null;
    let bestD = Infinity;
    for (let dz = -2; dz <= 2; dz++) {
      for (let dx = -2; dx <= 2; dx++) {
        const nx = cx + dx;
        const nz = cz + dz;
        if (nx < 0 || nz < 0 || nx >= level.W || nz >= level.H) continue;
        const c = level.cells[nz * level.W + nx];
        if (c.solid || c.crate) continue;
        const wx = nx * 2;
        const wz = nz * 2;
        const d = Math.hypot(wx - this.pos.x, wz - this.pos.z);
        if (d < bestD) { bestD = d; best = { x: wx, z: wz }; }
      }
    }
    if (!best) return false;
    this.pos.x = best.x;
    this.pos.z = best.z;
    this.pos.y = floorHeightAt(level, best.x, best.z);
    return true;
  }

  tryMove(level, dx, dz) {
    if (!dx && !dz) return false;
    const nx = this.pos.x + dx;
    const nz = this.pos.z + dz;
    if (circleBlocked(level, nx, nz, this.radius)) return false;
    const f = floorHeightAt(level, nx, nz);
    if (f - this.pos.y > MAX_STEP) return false;
    this.pos.x = nx;
    this.pos.z = nz;
    return true;
  }

  // A boss reads its own health each frame and escalates at two thirds and one
  // third. Phase 2 shortens the cooldown and widens the slam; phase 3 summons
  // once and drops the cooldown again.
  updatePhase(ctx) {
    if (!this.T.boss) return;
    const frac = this.hp / this.maxHp;
    const next = frac > 0.66 ? 1 : frac > 0.33 ? 2 : 3;
    if (next === this.phase) return;
    this.phase = next;

    if (this.phase === 2) {
      this.T = { ...this.T, attackCd: this.T.attackCd * 0.75, meleeRange: this.T.meleeRange + 1 };
      if (ctx && ctx.effects) {
        ctx.effects.burst({ x: this.pos.x, y: this.pos.y + 1.6, z: this.pos.z }, 0xffb454, 24, 5, 0.7, 2);
        ctx.effects.addShake(0.5);
      }
    }
    if (this.phase === 3) {
      this.T = { ...this.T, attackCd: this.T.attackCd * 0.7 };
      if (!this.summoned && ctx && ctx.summon) {
        this.summoned = true;
        ctx.summon(this, 2);
      }
      if (ctx && ctx.effects) {
        ctx.effects.burst({ x: this.pos.x, y: this.pos.y + 1.6, z: this.pos.z }, 0xff3b30, 36, 7, 1, 2);
        ctx.effects.addShake(0.9);
      }
    }
  }

  animate(dt) {
    if (this.T.boss && this.parts && this.parts.core) {
      const k = this.phase === 3 ? 1.4 : this.phase === 2 ? 1.15 : 1;
      this.parts.core.scale.setScalar(k);
    }
    if (this.flash > 0) {
      this.flash = Math.max(0, this.flash - dt);
      const e = this.flash / 0.16;
      for (const m of this.flashMats) m.emissive.setRGB(e * 0.85, e * 0.12, e * 0.08);
    } else if (this.charging > 0) {
      // the wind-up is the read: the body heats up over the telegraph, so a
      // player can see the shot coming instead of being told by their health bar
      const k = Math.min(1, this.charging);
      for (const m of this.flashMats) m.emissive.setRGB(k * 0.55, k * 0.22, 0);
    } else if (this.charged) {
      this.charged = false;
      for (const m of this.flashMats) m.emissive.setRGB(0, 0, 0);
    }
    const sp = this.moving ? 1 : 0;
    this.walkPhase += dt * (this.moving ? 9 : 0);
    const swing = Math.sin(this.walkPhase) * 0.5 * sp;
    if (this.parts.legL) this.parts.legL.rotation.x = swing;
    if (this.parts.legR) this.parts.legR.rotation.x = -swing;
    if (this.parts.legBL) this.parts.legBL.rotation.x = -swing;
    if (this.parts.legBR) this.parts.legBR.rotation.x = swing;
    if (this.type === 'imp') {
      this.parts.armL.rotation.x = -swing * 0.7;
      this.parts.armR.rotation.x = swing * 0.7;
      this.parts.armR.rotation.x -= this.state === STATE.ATTACK ? 1.6 : 0;
    } else if (this.parts.armL) {
      this.parts.armL.rotation.x = -swing * 0.7;
      if (this.parts.armR) this.parts.armR.rotation.x = this.state === STATE.ATTACK ? -0.35 : 0;
    }
    const bob = Math.sin(this.walkPhase * 2) * 0.045 * sp;
    this.mesh.position.y = this.pos.y + bob;
    const painTilt = this.state === STATE.PAIN ? Math.sin(this.stateT * 40) * 0.12 : 0;
    this.mesh.rotation.z = Math.sin(this.walkPhase) * 0.04 * sp + painTilt;
  }

  remove() {
    this.scene.remove(this.mesh);
    if (this.shadow) {
      this.scene.remove(this.shadow);
      this.shadow.geometry.dispose();
      this.shadow.material.dispose();
      this.shadow = null;
    }
    for (const m of this.flashMats) m.dispose();
    this.flashMats.length = 0;
    this.removed = true;
  }

  dispose() {
    this.remove();
  }
}

// ---------------------------------------------------------------------------

/**
 * Owns the enemies, the shared flow field, wave composition and difficulty multipliers.
 */
export class EnemyManager {
  constructor(scene, level, effects, audio) {
    this.scene = scene;
    this.level = level;
    this.effects = effects;
    this.audio = audio;
    this.list = [];
    this.onKill = null;
    this.field = null;
    this.fieldT = 0;
    this.diff = { hp: 1, dmg: 1, count: 1 };
  }

  get aliveCount() {
    return this.list.filter((e) => e.alive).length;
  }

  clear() {
    for (const e of this.list) e.dispose();
    this.list.length = 0;
  }

  spawnWave(wave, playerPos, opts = {}) {
    const diff = this.diff || { hp: 1, dmg: 1, count: 1 };
    const bossWave = !!opts.boss && wave >= (opts.waves || 3);
    const base = bossWave ? 3 : 4 + wave * 2;
    const count = Math.max(2, Math.min(30, Math.round(base * diff.count)));
    const cells = (this.level.reachableCells || this.level.openCells).filter((c) => {
      if (c.room < 0) return false;
      if (c.x === this.level.exit.cx && c.z === this.level.exit.cz) return false;
      const d = Math.hypot(c.wx - playerPos.x, c.wz - playerPos.z);
      return d > 9;
    });
    const pool = cells.length ? cells : (this.level.reachableCells || this.level.openCells);

    for (let i = 0; i < count; i++) {
      const c = pool[Math.floor(Math.random() * pool.length)];
      // wave 2 brings grunts, wave 4 brings hounds; after that it is a mix
      let type = 'imp';
      if (wave >= 5 && i % 9 === 8) type = 'brute';
      else if (wave >= 2 && i % 5 === 4) type = 'wisp';
      else if (wave >= 4 && i % 5 === 3) type = 'spitter';
      else if (wave >= 4 && i % 4 === 3) type = 'hound';
      else if (wave >= 3 && i % 6 === 5) type = 'spitter';
      else if (wave >= 2 && i % 3 === 2) type = 'grunt';
      const pos = new THREE.Vector3(c.wx + (Math.random() - 0.5) * 0.6, 0, c.wz + (Math.random() - 0.5) * 0.6);
      const e = new Enemy(type, pos, wave, this.scene, { diff });
      e.pos.y = floorHeightAt(this.level, pos.x, pos.z);
      e.mesh.position.y = e.pos.y;
      this.list.push(e);
      this.effects.burst({ x: pos.x, y: e.pos.y + 0.8, z: pos.z }, 0xff3311, 10, 3, 0.5, 2);
    }

    if (bossWave) {
      const c = pool[Math.floor(Math.random() * pool.length)];
      const pos = new THREE.Vector3(c.wx, 0, c.wz);
      const boss = new Enemy('warden', pos, wave, this.scene, { diff });
      boss.pos.y = floorHeightAt(this.level, pos.x, pos.z);
      boss.mesh.position.y = boss.pos.y;
      this.list.push(boss);
      this.effects.burst({ x: pos.x, y: boss.pos.y + 1.5, z: pos.z }, 0xff3b30, 30, 6, 0.9, 3);
    }
  }

  /** Put one enemy of a type at a world position, mid-wave. */
  spawnAt(type, x, z, wave) {
    const e = new Enemy(type, new THREE.Vector3(x, 0, z), wave, this.scene, { diff: this.diff });
    e.pos.y = floorHeightAt(this.level, x, z);
    e.mesh.position.y = e.pos.y;
    this.list.push(e);
    this.effects.burst({ x, y: e.pos.y + 0.8, z }, 0xff3311, 10, 3, 0.5, 2);
    return e;
  }

  get boss() {
    return this.list.find((e) => e.alive && e.T.boss) || null;
  }

  update(dt, player, projectiles) {
    // one field for every enemy, rebuilt from the player's cell a few times a
    // second: 1600 cells of BFS costs less than one enemy's line-of-sight check
    this.fieldT -= dt;
    if (this.fieldT <= 0) {
      this.field = buildFlowField(this.level, player.pos.x, player.pos.z);
      this.fieldT = 0.35;
    }

    const ctx = {
      level: this.level,
      field: this.field,
      player,
      effects: this.effects,
      audio: this.audio,
      projectiles,
      onKill: this.onKill,
      // the warden calls this at a third of its health
      summon: (boss, n) => {
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2;
          const x = boss.pos.x + Math.cos(a) * 2.4;
          const z = boss.pos.z + Math.sin(a) * 2.4;
          const h = new Enemy('hound', new THREE.Vector3(x, 0, z), 4, this.scene, { diff: this.diff });
          h.pos.y = floorHeightAt(this.level, x, z);
          h.mesh.position.y = h.pos.y;
          this.list.push(h);
          this.effects.burst({ x, y: h.pos.y + 0.6, z }, 0xff3b30, 10, 3, 0.5, 2);
        }
      },
    };
    for (const e of this.list) e.update(dt, ctx);

    // corpses stay, but not forever: the last MAX_CORPSES bodies, oldest first
    const dead = this.list.filter((e) => e.state === STATE.DEATH || !e.alive);
    if (dead.length > MAX_CORPSES) {
      for (const e of dead.slice(0, dead.length - MAX_CORPSES)) e.remove();
      this.list = this.list.filter((e) => !e.removed);
    }

    // soft separation so they do not stack into one blob
    const n = this.list.length;
    for (let i = 0; i < n; i++) {
      const a = this.list[i];
      if (!a.alive) continue;
      for (let j = i + 1; j < n; j++) {
        const b = this.list[j];
        if (!b.alive) continue;
        const dx = b.pos.x - a.pos.x;
        const dz = b.pos.z - a.pos.z;
        const d2 = dx * dx + dz * dz;
        const min = a.radius + b.radius;
        if (d2 > 0.0001 && d2 < min * min) {
          const d = Math.sqrt(d2);
          const push = (min - d) * 0.5;
          const ux = dx / d;
          const uz = dz / d;
          if (!circleBlocked(this.level, a.pos.x - ux * push, a.pos.z - uz * push, a.radius)) {
            a.pos.x -= ux * push;
            a.pos.z -= uz * push;
          }
          if (!circleBlocked(this.level, b.pos.x + ux * push, b.pos.z + uz * push, b.radius)) {
            b.pos.x += ux * push;
            b.pos.z += uz * push;
          }
        }
      }
    }

    // drop fully removed bodies
    this.list = this.list.filter((e) => !e.removed);
  }

  // nearest enemy hit by a ray, or null
  raycast(origin, dir, maxDist) {
    let best = null;
    for (const e of this.list) {
      if (!e.alive) continue;
      const c = e.chestPos();
      const t = raySphere(origin, dir, c, e.hitRadius);
      if (t !== null && t <= maxDist && (!best || t < best.dist)) best = { enemy: e, dist: t };
    }
    if (best) {
      best.point = {
        x: origin.x + dir.x * best.dist,
        y: origin.y + dir.y * best.dist,
        z: origin.z + dir.z * best.dist,
      };
    }
    return best;
  }

  damageSphere(center, radius, damage, ctx) {
    let hit = 0;
    for (const e of this.list) {
      if (!e.alive) continue;
      const c = e.chestPos();
      const d = Math.hypot(c.x - center.x, c.y - center.y, c.z - center.z);
      if (d > radius) continue;
      const falloff = 1 - d / radius;
      const dir = new THREE.Vector3(c.x - center.x, c.y - center.y, c.z - center.z).normalize();
      e.hurt(damage * falloff, ctx, dir);
      hit++;
    }
    return hit;
  }
}

function raySphere(o, d, c, r) {
  const ox = o.x - c.x;
  const oy = o.y - c.y;
  const oz = o.z - c.z;
  const b = ox * d.x + oy * d.y + oz * d.z;
  const cc = ox * ox + oy * oy + oz * oz - r * r;
  const disc = b * b - cc;
  if (disc < 0) return null;
  const sq = Math.sqrt(disc);
  const t1 = -b - sq;
  if (t1 >= 0) return t1;
  const t2 = -b + sq;
  return t2 >= 0 ? 0 : null;
}
