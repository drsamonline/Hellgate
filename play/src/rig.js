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
    m.userData.baseColor = m.color.clone();
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
  // the rest rotation, so a pooled body can be reset to it
  g.userData.restX = 0;
  g.userData.restY = 0;
  g.userData.restZ = 0;
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

  // the hip sits at the top of the leg: thigh + shin. There is no `legLen` on a
  // proportions object, and reading one put every joint at NaN.
  const hipY = (p.thigh || 0) + (p.shin || 0);
  const shoulderY = hipY + p.torsoLen * 0.92;

  // ---- pelvis and torso -------------------------------------------------
  const pelvis = joint(g, 0, hipY, 0);
  const hipMesh = new THREE.Mesh(cyl(p.hipR * 1.05, p.hipR * 0.9, p.hipLen, 8), M.body);
  hipMesh.position.y = -p.hipLen * 0.1;
  pelvis.add(hipMesh);

  const spine = joint(g, 0, hipY, 0);
  // two sections so the body tapers at the waist instead of reading as a barrel
  const abdomen = new THREE.Mesh(cyl(p.waistR * 1.02, p.waistR * 0.94, p.torsoLen * 0.42, 9), M.body);
  abdomen.position.y = p.torsoLen * 0.21;
  spine.add(abdomen);
  const chest = new THREE.Mesh(cyl(p.chestR, p.waistR * 1.04, p.torsoLen * 0.6, 10), M.body);
  chest.position.y = p.torsoLen * 0.7;
  spine.add(chest);
  spine.rotation.x = p.lean || 0;
  spine.userData.restX = p.lean || 0;
  spine.userData.lean = p.lean || 0; // the pose blend needs the rest value

  // shoulders and head ride the spine so a lean carries them
  const shoulders = joint(spine, 0, p.torsoLen * 0.92, p.hunch || 0);
  const neckMesh = new THREE.Mesh(cyl(p.headR * 0.42, p.headR * 0.5, p.neckLen + 0.06, 7), M.dark || M.body);
  neckMesh.position.y = p.neckLen * 0.5;
  shoulders.add(neckMesh);
  const head = joint(shoulders, 0, p.neckLen + 0.1, 0);
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
      const eye = new THREE.Mesh(sph(p.headR * 0.14, 5), M.eye);
      eye.position.set(sx * p.headR * 0.34, p.headR * 0.12, p.headR * 0.92);
      head.add(eye);
    }
  }
  if (p.brow) {
    // a heavy brow over the eyes: the cheapest way to stop a sphere reading as a
    // face and start it reading as a predator
    const brow = new THREE.Mesh(box(p.headR * 1.5, p.headR * 0.3, p.headR * 0.5), M.dark || M.body);
    brow.position.set(0, p.headR * 0.42, p.headR * 0.72);
    brow.rotation.x = 0.22;
    head.add(brow);
  }
  if (p.jaw) {
    const jaw = new THREE.Mesh(box(p.headR * 1.05, p.headR * 0.42, p.headR * 0.95), M.dark || M.body);
    jaw.position.set(0, -p.headR * 0.62, p.headR * 0.34);
    head.add(jaw);
    for (const sx of [-1, 1]) {
      const tooth = new THREE.Mesh(cone(p.headR * 0.09, p.headR * 0.34, 4), M.dark || M.body);
      tooth.position.set(sx * p.headR * 0.28, -p.headR * 0.38, p.headR * 0.76);
      tooth.rotation.x = Math.PI;         // pointing down, out of the jaw
      head.add(tooth);
    }
  }
  if (p.muzzle) {
    // a snout: a tapered box out of the front of the skull, with a nose on the
    // end. A sphere with a brow reads as a head at 2 m and as a dot at 10.
    const snout = new THREE.Mesh(cyl(p.headR * 0.34, p.headR * 0.62, p.headR * 0.95, 5), M.dark || M.body);
    snout.rotation.x = Math.PI / 2;
    snout.position.set(0, -p.headR * 0.1, p.headR * 0.86);
    head.add(snout);
    const nose = new THREE.Mesh(sph(p.headR * 0.16, 5), M.dark || M.body);
    nose.position.set(0, -p.headR * 0.1, p.headR * 1.34);
    head.add(nose);
  }
  if (p.spikes) {
    // a ridge down the back: hunched things have spines you can count
    for (let i = 0; i < p.spikes; i++) {
      const t = (i + 1) / (p.spikes + 1);
      const spike = new THREE.Mesh(cone(p.chestR * 0.16, p.chestR * 0.72, 4), M.dark || M.body);
      spike.position.set(0, p.torsoLen * (0.18 + t * 0.72), -p.chestR * (0.92 - t * 0.16));
      spike.rotation.x = -0.9;            // swept back along the spine
      spine.add(spike);
    }
  }
  parts.head = head;
  parts.spine = spine;

  // ---- arms: shoulder -> elbow -> hand ----------------------------------
  for (const [side, sx] of [['L', -1], ['R', 1]]) {
    const shoulder = joint(shoulders, sx * p.shoulderX, 0, 0);
    const deltoid = new THREE.Mesh(sph(p.armR * 1.25, 7), M.body);
    deltoid.scale.set(1, 0.9, 1);
    shoulder.add(deltoid);
    const upper = new THREE.Mesh(cyl(p.armR * 0.98, p.armR * 1.08, p.upperArm, 7), M.body);
    upper.position.y = -p.upperArm / 2;
    shoulder.add(upper);

    const elbow = joint(shoulder, 0, -p.upperArm, 0);
    const lower = new THREE.Mesh(cyl(p.armR * 0.85, p.armR * 0.62, p.lowerArm, 7), M.dark || M.body);
    lower.position.y = -p.lowerArm / 2;
    elbow.add(lower);
    // a joint with a bulge reads as a limb; a bare cylinder reads as a pipe
    const elbowCap = new THREE.Mesh(sph(p.armR * 0.95, 6), M.body);
    elbow.add(elbowCap);
    const wrist = new THREE.Mesh(cyl(p.armR * 0.62, p.armR * 0.7, p.armR * 0.5, 6), M.dark || M.body);
    wrist.position.y = -p.lowerArm + p.armR * 0.2;
    elbow.add(wrist);

    const hand = new THREE.Mesh(sph(p.armR * (p.fists ? 1.5 : 0.95), 6), M.dark || M.body);
    hand.position.y = -p.lowerArm;
    elbow.add(hand);

    parts[`shoulder${side}`] = shoulder;
    parts[`elbow${side}`] = elbow;
    parts[`hand${side}`] = hand;
  }

  // ---- legs: hip -> knee -> foot ----------------------------------------
  for (const [side, sx] of [['L', -1], ['R', 1]]) {
    const hip = joint(g, sx * p.legX, hipY, 0);
    const thigh = new THREE.Mesh(cyl(p.legR * 1.12, p.legR * 0.82, p.thigh, 7), M.body);
    thigh.position.y = -p.thigh / 2;
    hip.add(thigh);

    const knee = joint(hip, 0, -p.thigh, 0);
    const shin = new THREE.Mesh(cyl(p.legR * 0.85, p.legR * 0.58, p.shin, 7), M.dark || M.body);
    shin.position.y = -p.shin / 2;
    knee.add(shin);
    const kneeCap = new THREE.Mesh(sph(p.legR * 1.0, 6), M.body);
    knee.add(kneeCap);
    if (p.kneepads) {
      const pad = new THREE.Mesh(sph(p.legR * 1.15, 6), M.dark || M.body);
      pad.scale.set(1, 0.85, 0.7);
      pad.position.set(0, -0.02, p.legR * 0.55);
      knee.add(pad);
    }

    const foot = new THREE.Mesh(box(p.legR * 1.7, p.legR * 0.7, p.legR * 3), M.dark || M.body);
    foot.position.set(0, -p.shin, p.legR * 0.8);
    knee.add(foot);
    const toe = new THREE.Mesh(box(p.legR * 1.5, p.legR * 0.45, p.legR * 0.8), M.dark || M.body);
    toe.position.set(0, -p.shin - p.legR * 0.1, p.legR * 2.1);
    knee.add(toe);

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
  if (p.traps) {
    // a wedge of muscle from neck to shoulder: shoulders on legs, not a box on a box
    // it sits ON the shoulder line, not above the head: the first version put it at
    // 0.86 of a torso up from a joint already 0.92 up, and it floated clear of the
    // body like a signboard
    // narrow and shallow: wide enough to bridge neck to shoulder, not so deep that
    // it becomes a breastplate across the chest
    const traps = new THREE.Mesh(box(p.shoulderX * 1.35, p.torsoLen * 0.16, p.chestR * 0.55), M.body);
    traps.position.set(0, -p.torsoLen * 0.02, -p.chestR * 0.34);
    shoulders.add(traps);
  }
  if (p.pack) {
    // a visible backpack, with a canister on it: from behind, a grunt is now a
    // soldier carrying something instead of a barrel with legs
    const pack = new THREE.Mesh(box(p.chestR * 1.15, p.torsoLen * 0.5, p.chestR * 0.55), M.body);
    pack.position.set(0, p.torsoLen * 0.62, -p.chestR * 0.78);
    spine.add(pack);
    const tank = new THREE.Mesh(cyl(p.chestR * 0.24, p.chestR * 0.24, p.torsoLen * 0.56, 7), M.dark || M.body);
    tank.position.set(p.chestR * 0.5, p.torsoLen * 0.66, -p.chestR * 1.0);
    spine.add(tank);
    parts.pack = pack;
  }
  if (p.sac) {
    const sac = new THREE.Mesh(sph(p.sacR || 0.42, 9), M.sac || M.body);
    sac.scale.set(1, 0.92, 1.05);
    sac.position.set(0, p.torsoLen * 0.62, p.chestR * 0.5);
    spine.add(sac);
    parts.sac = sac;
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
    // a muzzle brake, so the thing in its hands reads as a weapon and not a pipe
    const brake = new THREE.Mesh(box(0.13, 0.13, 0.12), M.plate || M.dark || M.body);
    brake.position.z = 0.44;
    gun.add(brake);
    gun.position.set(0, -p.lowerArm * 0.7, 0.1);
    parts.elbowR.add(gun);
  }

  return { group: g, parts };
}

/**
 * A quadruped: a spine, a head on a neck, a tail, and four legs that bend at the
 * knee. Built the same way as the humanoid — joints, not parts — because a leg
 * that cannot bend reads as a table leg however good the body is.
 *
 * The parts it returns are named for the two gaits the animation uses: the front
 * pair and the back pair move in opposition, which is what a gallop is.
 */
export function quadruped(p) {
  const M = p.mats;
  const g = new THREE.Group();
  const parts = {};

  const hipY = (p.thigh || 0) + (p.shin || 0);
  const spineY = hipY + p.bodyR * 0.55;

  // ---- spine and haunch --------------------------------------------------
  const spine = joint(g, 0, spineY, 0);
  const trunk = new THREE.Mesh(cyl(p.bodyR, p.bodyR * 1.1, p.bodyLen, 8), M.body);
  trunk.rotation.x = Math.PI / 2;
  spine.add(trunk);
  const haunch = new THREE.Mesh(sph(p.bodyR * 1.12, 8), M.body);
  haunch.scale.set(1, 0.9, 1);
  haunch.position.z = -p.bodyLen * 0.45;
  spine.add(haunch);
  const chest = new THREE.Mesh(sph(p.bodyR * 0.95, 8), M.body);
  chest.position.z = p.bodyLen * 0.42;
  spine.add(chest);

  // ---- neck, head, tail --------------------------------------------------
  const neck = joint(spine, 0, p.bodyR * 0.5, p.bodyLen * 0.45);
  const neckMesh = new THREE.Mesh(cyl(p.bodyR * 0.55, p.bodyR * 0.75, p.neckLen, 7), M.body);
  neckMesh.position.y = p.neckLen * 0.4;
  neck.add(neckMesh);
  neck.rotation.x = -0.9;
  neck.userData.restX = -0.9;

  const head = joint(neck, 0, p.neckLen * 0.85, 0);
  const skull = new THREE.Mesh(box(p.bodyR * 1.1, p.bodyR * 0.85, p.bodyR * 1.9), M.dark || M.body);
  skull.position.z = p.bodyR * 0.8;
  head.add(skull);
  const snout = new THREE.Mesh(cone(p.bodyR * 0.5, p.bodyR * 1.5, 5), M.dark || M.body);
  snout.rotation.x = Math.PI / 2;
  snout.position.z = p.bodyR * 1.9;
  head.add(snout);
  if (p.eyes) {
    for (const sx of [-1, 1]) {
      const eye = new THREE.Mesh(sph(p.bodyR * 0.16, 5), M.eye);
      eye.position.set(sx * p.bodyR * 0.42, p.bodyR * 0.22, p.bodyR * 1.1);
      head.add(eye);
    }
  }
  for (const sx of [-1, 1]) {
    const ear = new THREE.Mesh(cone(p.bodyR * 0.22, p.bodyR * 0.8, 4), M.dark || M.body);
    ear.position.set(sx * p.bodyR * 0.5, p.bodyR * 0.55, -p.bodyR * 0.1);
    ear.rotation.z = sx * 0.35;
    head.add(ear);
  }
  parts.head = head;
  parts.neck = neck;

  const tail = joint(spine, 0, p.bodyR * 0.35, -p.bodyLen * 0.55);
  const tailMesh = new THREE.Mesh(cyl(p.bodyR * 0.16, p.bodyR * 0.3, p.tailLen, 5), M.dark || M.body);
  tailMesh.position.y = -p.tailLen * 0.4;
  tail.add(tailMesh);
  tail.rotation.x = 0.9;
  tail.userData.restX = 0.9;
  parts.tail = tail;

  // ---- four legs, each with a knee --------------------------------------
  const leg = (name, sx, sz) => {
    const hip = joint(g, sx * p.legX, hipY, sz);
    const thigh = new THREE.Mesh(cyl(p.legR * 0.9, p.legR * 0.75, p.thigh, 6), M.body);
    thigh.position.y = -p.thigh / 2;
    hip.add(thigh);
    const knee = joint(hip, 0, -p.thigh, 0);
    const shin = new THREE.Mesh(cyl(p.legR * 0.7, p.legR * 0.5, p.shin, 6), M.dark || M.body);
    shin.position.y = -p.shin / 2;
    knee.add(shin);
    // no separate paw: at this size a fourth mesh per leg is a draw call you
    // cannot see, and four of them is a hound's whole LOD budget
    parts[name] = hip;
    parts['knee' + name] = knee;
    return hip;
  };
  leg('frontL', -1, p.bodyLen * 0.38);
  leg('frontR', 1, p.bodyLen * 0.38);
  leg('backL', -1, -p.bodyLen * 0.42);
  leg('backR', 1, -p.bodyLen * 0.42);

  // the shared animation names
  parts.armL = parts.frontL;
  parts.armR = parts.frontR;
  parts.legL = parts.backL;
  parts.legR = parts.backR;

  return { group: g, parts };
}

/** The proportions for each enemy body. */
export const PROPORTIONS = {
  // #49 — same joints, same mesh budget after the merge, more silhouette. The
  // imp is a crouched thing with its arms below its knees and a ridge down its
  // back; the grunt is a soldier with a pack and a muzzle; the brute is shoulders
  // with a neck buried in them.
  imp: {
    hipR: 0.22, hipLen: 0.18, waistR: 0.22, chestR: 0.3, torsoLen: 0.7,
    shoulderX: 0.28, neckLen: 0.13, headR: 0.22, headTall: 0.86,
    armR: 0.075, upperArm: 0.5, lowerArm: 0.52,
    legR: 0.1, thigh: 0.34, shin: 0.34, legX: 0.17,
    lean: 0.34, hunch: 0.07, horns: true, eyes: true, brow: true, jaw: true, spikes: 3, muzzle: true,
  },
  grunt: {
    hipR: 0.24, hipLen: 0.2, waistR: 0.26, chestR: 0.38, torsoLen: 0.78,
    shoulderX: 0.34, neckLen: 0.11, headR: 0.24, headTall: 0.98,
    armR: 0.11, upperArm: 0.4, lowerArm: 0.38,
    legR: 0.13, thigh: 0.4, shin: 0.38, legX: 0.2,
    lean: 0.04, eyes: true, pauldrons: true, pauldronR: 0.15, gun: true,
    pack: true, kneepads: true, brow: true,
  },
  brute: {
    hipR: 0.32, hipLen: 0.24, waistR: 0.36, chestR: 0.54, torsoLen: 0.98,
    shoulderX: 0.5, neckLen: 0.08, headR: 0.27, headTall: 0.86,
    armR: 0.2, upperArm: 0.6, lowerArm: 0.62,
    legR: 0.24, thigh: 0.5, shin: 0.48, legX: 0.3,
    lean: 0.16, eyes: true, pauldrons: true, pauldronR: 0.3,
    traps: true, fists: true, spikes: 2, jaw: true, muzzle: true,
  },
  hound: {
    bodyR: 0.26, bodyLen: 1.15, neckLen: 0.34, tailLen: 0.42,
    legR: 0.075, thigh: 0.34, shin: 0.3, legX: 0.21,
    eyes: true,
  },
  spitter: {
    hipR: 0.2, hipLen: 0.16, waistR: 0.16, chestR: 0.22, torsoLen: 1.05,
    shoulderX: 0.26, neckLen: 0.14, headR: 0.2, headTall: 0.9,
    armR: 0.06, upperArm: 0.45, lowerArm: 0.42,
    legR: 0.08, thigh: 0.45, shin: 0.42, legX: 0.17,
    lean: 0.42, eyes: true, sac: true, sacR: 0.42, jaw: true, brow: true, muzzle: true,
  },
  warden: {
    hipR: 0.44, hipLen: 0.3, waistR: 0.5, chestR: 0.72, torsoLen: 1.35,
    shoulderX: 0.68, neckLen: 0.1, headR: 0.36, headTall: 0.95,
    armR: 0.26, upperArm: 0.72, lowerArm: 0.7,
    legR: 0.34, thigh: 0.62, shin: 0.6, legX: 0.4,
    lean: 0.04, horns: true, eyes: true, pauldrons: true, pauldronR: 0.3,
    core: true, coreR: 0.26, spikes: 4, brow: true,
  },
};

/**
 * Merge the direct mesh children of a joint that share a material into one mesh.
 *
 * A grunt body is 23 meshes across 13 joints, and every one of those is a draw
 * call. A joint's own children never move relative to each other — the joint
 * animates as a unit — so merging them per joint keeps the animation and drops
 * the calls. Materials are not merged: the emissive eyes stay their own mesh.
 *
 * Returns the number of meshes removed. Any geometry without positions (a stub,
 * or a primitive the merge cannot read) is left alone rather than corrupted.
 */
export function mergeJointMeshes(root) {
  let removed = 0;
  const joints = [];
  root.traverse((o) => { if (o.isGroup) joints.push(o); });
  for (const j of joints) {
    const byMat = new Map();
    for (const c of j.children) {
      if (!c.isMesh || c.isSkinnedMesh) continue;
      const list = byMat.get(c.material) || [];
      list.push(c);
      byMat.set(c.material, list);
    }
    for (const [mat, list] of byMat) {
      if (list.length < 2) continue;
      const merged = mergeMeshList(list);
      if (!merged) continue;
      const mesh = new THREE.Mesh(merged, mat);
      mesh.userData.shared = true;
      mesh.userData.mergedJoint = true;
      for (const m of list) j.remove(m);
      j.add(mesh);
      removed += list.length - 1;
    }
  }
  return removed;
}

/** Concatenate meshes into one geometry, baking each mesh's local transform. */
function mergeMeshList(list) {
  const pos = [];
  const nor = [];
  const uv = [];
  const idx = [];
  let base = 0;
  try {
    for (const m of list) {
      m.updateMatrix();
      const g = m.geometry;
      const p = g && g.attributes && g.attributes.position;
      if (!p) return null;               // nothing readable to merge
      const n = g.attributes.normal;
      const u = g.attributes.uv;
      const v = new THREE.Vector3();
      for (let i = 0; i < p.count; i++) {
        v.fromBufferAttribute(p, i).applyMatrix4(m.matrix);
        pos.push(v.x, v.y, v.z);
        if (n) nor.push(n.getX(i), n.getY(i), n.getZ(i));
        else nor.push(0, 1, 0);
        if (u) uv.push(u.getX(i), u.getY(i));
        else uv.push(0, 0);
      }
      if (g.index) for (let i = 0; i < g.index.count; i++) idx.push(base + g.index.getX(i));
      else for (let i = 0; i < p.count; i++) idx.push(base + i);
      base += p.count;
    }
  } catch (e) {
    return null;                         // a stub without buffer attributes
  }
  if (!pos.length) return null;
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  out.setIndex(idx);
  out.computeBoundingSphere();
  return out;
}
