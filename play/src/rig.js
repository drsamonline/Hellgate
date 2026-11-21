// ---------------------------------------------------------------------------
// RIG — a parametric humanoid, built from joints rather than parts.
//
// The point of a rig is that the limbs bend at the elbow and the knee, which is
// the difference between "a box with sticks" and something that reads as a
// creature walking. Every builder here returns the same joint names, so the
// animation code does not care which body it is driving.
//
// Proportions are per type: an imp is all arms and spine, a grunt is a barrel,
// a brute is shoulders on legs, the warden is a monument.
// ---------------------------------------------------------------------------

import * as THREE from 'three';

const GEO = new Map();
const MAT = new Map();

function cyl(rt, rb, len, seg = 7) {
  const k = `c${rt}:${rb}:${len}:${seg}`;
  let g = GEO.get(k);
  if (!g) { g = new THREE.CylinderGeometry(rt, rb, len, seg); g.userData.shared = true; GEO.set(k, g); }
  return g;
}

function sph(r, seg = 8) {
  const k = `s${r}:${seg}`;
  let g = GEO.get(k);
  if (!g) { g = new THREE.SphereGeometry(r, seg, Math.max(4, seg >> 1)); g.userData.shared = true; GEO.set(k, g); }
  return g;
}

function cone(r, h, seg = 5) {
  const k = `k${r}:${h}:${seg}`;
  let g = GEO.get(k);
  if (!g) { g = new THREE.ConeGeometry(r, h, seg); g.userData.shared = true; GEO.set(k, g); }
  return g;
}

function box(w, h, d) {
  const k = `b${w}:${h}:${d}`;
  let g = GEO.get(k);
  if (!g) { g = new THREE.BoxGeometry(w, h, d); g.userData.shared = true; GEO.set(k, g); }
  return g;
}

/** A material cached by colour; `flash` marks it for the hit flash. */
export function rigMat(color, flash = true) {
  const k = `${color}:${flash ? 1 : 0}`;
  let m = MAT.get(k);
  if (!m) {
    m = new THREE.MeshLambertMaterial({ color });
    m.userData.shared = true;
    m.userData.flashable = flash;
    MAT.set(k, m);
  }
  return m;
}

/**
 * A joint: an empty group at a pivot, with a mesh hanging off it. Everything a
 * limb does is a rotation of the joint, so the elbow bends without the upper
 * arm moving.
 */
function joint(parent, x, y, z) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  parent.add(g);
  return g;
}

/**
 * Build a humanoid.
 *
 * @param {object} p proportions and materials
 * @returns {{group: THREE.Group, parts: object}}
 */
export function humanoid(p) {
  const M = p.mats;
  const g = new THREE.Group();
  const parts = {};

  const hipY = p.legLen;
  const shoulderY = hipY + p.torsoLen * 0.92;

  // ---- pelvis and torso -------------------------------------------------
  const pelvis = joint(g, 0, hipY, 0);
  const hipMesh = new THREE.Mesh(cyl(p.hipR * 1.05, p.hipR * 0.9, p.hipLen, 8), M.body);
  hipMesh.position.y = -p.hipLen * 0.1;
  pelvis.add(hipMesh);

  const spine = joint(g, 0, hipY, 0);
  const torso = new THREE.Mesh(cyl(p.chestR, p.waistR, p.torsoLen, 9), M.body);
  torso.position.y = p.torsoLen / 2;
  spine.add(torso);
  spine.rotation.x = p.lean || 0;

  // shoulders and head ride the spine so a lean carries them
  const shoulders = joint(spine, 0, p.torsoLen * 0.92, 0);
  const head = joint(shoulders, 0, p.neckLen, 0);
  const skull = new THREE.Mesh(sph(p.headR, 8), M.dark || M.body);
  skull.scale.set(1, p.headTall || 0.92, 1.05);
  head.add(skull);
  if (p.horns) {
    for (const sx of [-1, 1]) {
      const horn = new THREE.Mesh(cone(p.headR * 0.32, p.headR * 1.9, 5), M.dark || M.body);
      horn.position.set(sx * p.headR * 0.65, p.headR * 0.7, 0);
      horn.rotation.z = sx * 0.5;
      head.add(horn);
    }
  }
  if (p.eyes) {
    for (const sx of [-1, 1]) {
      const eye = new THREE.Mesh(sph(p.headR * 0.22, 5), M.eye);
      eye.position.set(sx * p.headR * 0.38, p.headR * 0.1, p.headR * 0.9);
      head.add(eye);
    }
  }
  parts.head = head;
  parts.spine = spine;

  // ---- arms: shoulder -> elbow -> hand ----------------------------------
  for (const [side, sx] of [['L', -1], ['R', 1]]) {
    const shoulder = joint(shoulders, sx * p.shoulderX, 0, 0);
    const upper = new THREE.Mesh(cyl(p.armR * 0.92, p.armR, p.upperArm, 7), M.body);
    upper.position.y = -p.upperArm / 2;
    shoulder.add(upper);

    const elbow = joint(shoulder, 0, -p.upperArm, 0);
    const lower = new THREE.Mesh(cyl(p.armR * 0.85, p.armR * 0.7, p.lowerArm, 7), M.dark || M.body);
    lower.position.y = -p.lowerArm / 2;
    elbow.add(lower);

    const hand = new THREE.Mesh(sph(p.armR * 0.95, 6), M.dark || M.body);
    hand.position.y = -p.lowerArm;
    elbow.add(hand);

    parts[`shoulder${side}`] = shoulder;
    parts[`elbow${side}`] = elbow;
    parts[`hand${side}`] = hand;
  }

  // ---- legs: hip -> knee -> foot ----------------------------------------
  for (const [side, sx] of [['L', -1], ['R', 1]]) {
    const hip = joint(g, sx * p.legX, hipY, 0);
    const thigh = new THREE.Mesh(cyl(p.legR, p.legR * 0.9, p.thigh, 7), M.body);
    thigh.position.y = -p.thigh / 2;
    hip.add(thigh);

    const knee = joint(hip, 0, -p.thigh, 0);
    const shin = new THREE.Mesh(cyl(p.legR * 0.85, p.legR * 0.65, p.shin, 7), M.dark || M.body);
    shin.position.y = -p.shin / 2;
    knee.add(shin);

    const foot = new THREE.Mesh(box(p.legR * 1.7, p.legR * 0.7, p.legR * 3), M.dark || M.body);
    foot.position.set(0, -p.shin, p.legR * 0.8);
    knee.add(foot);

    parts[`hip${side}`] = hip;
    parts[`knee${side}`] = knee;
  }

  // the animation code drives these four names
  parts.armL = parts.shoulderL;
  parts.armR = parts.shoulderR;
  parts.legL = parts.hipL;
  parts.legR = parts.hipR;

  // ---- extras -----------------------------------------------------------
  if (p.pauldrons) {
    for (const sx of [-1, 1]) {
      const pad = new THREE.Mesh(sph(p.pauldronR, 7), M.plate || M.dark || M.body);
      pad.scale.set(1.15, 0.8, 1.05);
      pad.position.set(sx * p.shoulderX * 0.95, 0.02, 0);
      shoulders.add(pad);
    }
  }
  if (p.core) {
    const core = new THREE.Mesh(sph(p.coreR || 0.22, 8), M.glow);
    core.position.set(0, p.torsoLen * 0.45, p.chestR * 0.92);
    spine.add(core);
    parts.core = core;
  }
  if (p.gun) {
    const gun = new THREE.Group();
    const barrel = new THREE.Mesh(box(0.09, 0.09, 0.5), M.plate || M.dark || M.body);
    barrel.position.z = 0.2;
    gun.add(barrel);
    const mag = new THREE.Mesh(box(0.07, 0.16, 0.07), M.dark || M.body);
    mag.position.set(0, -0.1, 0.02);
    gun.add(mag);
    gun.position.set(0, -p.lowerArm * 0.7, 0.1);
    parts.elbowR.add(gun);
  }

  return { group: g, parts };
}

/** The proportions for each enemy body. */
export const PROPORTIONS = {
  imp: {
    hipR: 0.24, hipLen: 0.2, waistR: 0.26, chestR: 0.34, torsoLen: 0.72,
    shoulderX: 0.36, neckLen: 0.16, headR: 0.19, headTall: 0.85,
    armR: 0.075, upperArm: 0.42, lowerArm: 0.44,
    legR: 0.1, thigh: 0.4, shin: 0.4, legX: 0.17,
    lean: 0.22, horns: true, eyes: true,
  },
  grunt: {
    hipR: 0.28, hipLen: 0.22, waistR: 0.32, chestR: 0.42, torsoLen: 0.8,
    shoulderX: 0.44, neckLen: 0.12, headR: 0.23, headTall: 0.95,
    armR: 0.11, upperArm: 0.4, lowerArm: 0.38,
    legR: 0.13, thigh: 0.4, shin: 0.38, legX: 0.2,
    lean: 0.06, eyes: true, pauldrons: true, pauldronR: 0.22, gun: true,
  },
  brute: {
    hipR: 0.36, hipLen: 0.26, waistR: 0.46, chestR: 0.66, torsoLen: 1.0,
    shoulderX: 0.7, neckLen: 0.08, headR: 0.26, headTall: 0.8,
    armR: 0.2, upperArm: 0.6, lowerArm: 0.62,
    legR: 0.24, thigh: 0.5, shin: 0.48, legX: 0.3,
    lean: 0.2, eyes: true, pauldrons: true, pauldronR: 0.42,
  },
  warden: {
    hipR: 0.5, hipLen: 0.32, waistR: 0.62, chestR: 0.86, torsoLen: 1.4,
    shoulderX: 0.92, neckLen: 0.1, headR: 0.34, headTall: 0.92,
    armR: 0.26, upperArm: 0.72, lowerArm: 0.7,
    legR: 0.34, thigh: 0.62, shin: 0.6, legX: 0.4,
    lean: 0.04, horns: true, eyes: true, pauldrons: true, pauldronR: 0.52,
    core: true, coreR: 0.26,
  },
};
