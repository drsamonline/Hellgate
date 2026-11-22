// ---------------------------------------------------------------------------
// ENEMIES — two compound-mesh types with a finite state machine:
// IDLE -> CHASE -> ATTACK -> PAIN -> DEATH
// ---------------------------------------------------------------------------

import * as THREE from 'three';
import { humanoid, quadruped, PROPORTIONS, rigMat } from './rig.js';
import { getModel } from './models.js';
import { circleBlocked, floorHeightAt, hasLineOfSight, buildFlowField, flowStep, MAX_STEP } from './level.js';

const STATE = { IDLE: 'IDLE', CHASE: 'CHASE', ATTACK: 'ATTACK', PAIN: 'PAIN', DEATH: 'DEATH' };

/**
 * Every enemy type: its stats, its colour, and how it behaves.
 *
 * `telegraph` is the wind-up in seconds, `charges` marks the two that close the
 * distance, `laneColor` is the colour of the warning it draws on the floor.
 */
export const TYPES = {
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
    laneColor: 0xff4422,
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
  const { group, parts } = humanoid({
    ...PROPORTIONS.imp,
    mats: {
      body: M.impBody, dark: M.impDark, eye: M.impEye,
    },
  });
  return { group, parts };
}

function makeGrunt() {
  const M = mats();
  const { group, parts } = humanoid({
    ...PROPORTIONS.grunt,
    mats: {
      body: M.gruntBody, dark: M.gruntDark, eye: M.eye, plate: M.gruntMetal,
    },
  });
  return { group, parts };
}

function makeWarden() {
  const M = mats();
  const { group, parts } = humanoid({
    ...PROPORTIONS.warden,
    mats: {
      body: M.wardenBody, dark: M.wardenDark, eye: M.wardenEye,
      plate: M.wardenDark, glow: M.wardenGlow,
    },
  });
  return { group, parts };
}

function makeBrute() {
  const M = mats();
  const { group, parts } = humanoid({
    ...PROPORTIONS.brute,
    mats: {
      body: M.bruteBody, dark: M.brutePlate, eye: M.eye, plate: M.brutePlate,
    },
  });
  return { group, parts };
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
  // tendrils, each on its own joint so they can writhe instead of hanging
  const tendrils = [];
  for (let i = 0; i < 3; i++) {
    const joint = new THREE.Group();
    joint.position.set(0, -0.36 - i * 0.02, 0);
    const tail = new THREE.Mesh(coneGeo(0.11 - i * 0.02, 0.34, 5), M.wispBody);
    tail.position.y = -0.17;
    tail.rotation.x = Math.PI;
    joint.add(tail);
    g.add(joint);
    tendrils.push(joint);
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
  return { group: g, parts: { armL, armR, legL: null, legR: null, core, tendrils } };
}

function makeSpitter() {
  const M = mats();
  // hunched over its sac, on the same rig as everything else: the lean is in the
  // proportions, so its knees and elbows bend when it moves
  const { group, parts } = humanoid({
    ...PROPORTIONS.spitter,
    mats: { body: M.spitterBody, dark: M.spitterDark, eye: M.spitterEye, sac: M.spitterSac },
  });
  return { group, parts };
}

function makeHound() {
  const M = mats();
  const { group, parts } = quadruped({
    ...PROPORTIONS.hound,
    mats: { body: M.houndBody, dark: M.houndDark, eye: M.houndEye },
  });
  return { group, parts };
}

/** How many bodies stay in the world before the oldest is cleared. */
const MAX_CORPSES = 12;

// Distance past which an enemy is drawn as one box instead of ten parts. The
// bodies are ~10 meshes each, which is where the draw calls go: at 22 m you
// cannot tell a limb from a slab, and the frame gets 9 calls back per enemy.
const LOD_DIST = 12;
const PROXY_GEO = new THREE.BoxGeometry(1, 1, 1);
// One proxy material per type colour: a distant enemy is one slab, but it is a
// red slab for an imp and a cyan one for a wisp, so you can still tell what is
// walking at you.
const PROXY_MATS = new Map();
function proxyMat(color) {
  let m = PROXY_MATS.get(color);
  if (!m) {
    m = new THREE.MeshLambertMaterial({ color });
    m.userData.shared = true;
    PROXY_MATS.set(color, m);
  }
  return m;
}

// ---------------------------------------------------------------------------
// BODY POOL
//
// A rig body is 19-24 meshes. A wave of twelve enemies builds and disposes about
// 250 meshes, and doing that mid-fight is a hitch on a phone. Bodies are kept
// per type and reused; a body is reset when it is taken back out, so nothing
// carries over from the enemy that died in it.
// ---------------------------------------------------------------------------
const BODY_POOL = new Map();
const POOL_CAP = 14;
let BODIES_BUILT = 0;

function buildBody(typeName) {
  BODIES_BUILT++;
  // an open model, if one was dropped into assets/models/<type>.glb, replaces
  // the procedural body. It has no joints, so the animation guards skip it.
  const model = getModel(typeName);
  if (model) {
    const flashMats = [];
    model.traverse((o) => {
      if (!o.isMesh || !o.material) return;
      const m = o.material.clone();
      m.userData.shared = false;
      m.userData.flashable = true;
      m.userData.baseColor = m.color && m.color.clone ? m.color.clone() : null;
      o.material = m;
      flashMats.push(m);
    });
    return { group: model, parts: {}, flashMats, typeName };
  }
  const built = typeName === 'imp' ? makeImp()
    : typeName === 'hound' ? makeHound()
    : typeName === 'warden' ? makeWarden()
    : typeName === 'spitter' ? makeSpitter()
    : typeName === 'brute' ? makeBrute()
    : typeName === 'wisp' ? makeWisp()
    : makeGrunt();
  // the materials are cloned once per body and reused with it; the hit flash
  // writes to these clones and never to the shared originals
  const flashMats = [];
  const remap = new Map();
  built.group.traverse((o) => {
    if (!o.isMesh || !o.material) return;
    const src = o.material;
    if (!src.userData || !src.userData.flashable) return;
    let m = remap.get(src);
    if (!m) {
      m = src.clone();
      m.userData.shared = false;
      m.userData.flashable = true;
      m.userData.baseColor = m.color.clone();
      remap.set(src, m);
      flashMats.push(m);
    }
    o.material = m;
  });
  return { group: built.group, parts: built.parts, flashMats, typeName };
}

function acquireBody(typeName) {
  const pool = BODY_POOL.get(typeName) || [];
  let body = pool.pop();
  if (!body) body = buildBody(typeName);
  // reset: a body that died mid-wind-up must not come back glowing or folded
  body.group.visible = true;
  body.group.position.set(0, 0, 0);
  body.group.rotation.set(0, 0, 0);
  body.group.scale.set(1, 1, 1);
  body.group.traverse((o) => {
    if (o.rotation) o.rotation.set(o.userData.restX || 0, o.userData.restY || 0, o.userData.restZ || 0);
    if (o.isMesh && o.material && o.material.emissive && o.material.userData.flashable) {
      o.material.emissive.setHex(0x000000);
      o.material.emissiveIntensity = 0;
      if (o.material.color) o.material.color.copy(o.material.userData.baseColor || o.material.color);
    }
  });
  return body;
}

function releaseBody(body) {
  if (!body) return;
  const pool = BODY_POOL.get(body.typeName) || [];
  if (pool.length >= POOL_CAP) return;      // the pool is capped; let the rest go
  body.group.visible = false;
  pool.push(body);
  BODY_POOL.set(body.typeName, pool);
}

/**
 * Drop the parked bodies for a type. A pooled body is the procedural rig; if a
 * model was installed for that type, the pool would keep handing out the old one.
 */
export function clearBodyPool(type) {
  if (type) BODY_POOL.delete(type);
  else BODY_POOL.clear();
}

/** How many bodies are parked per type — for the tests and the stats screen. */
export function poolStats() {
  const out = {};
  for (const [k, v] of BODY_POOL) out[k] = v.length;
  out.built = BODIES_BUILT;
  return out;
}

/**
 * One enemy: mesh, state machine, health. Geometry is shared per type; body materials are cloned for the hit flash.
 */
export class Enemy {
  constructor(typeName, worldPos, wave, scene, opts = {}) {
    const T = TYPES[typeName];
    this.type = typeName;
    this.T = T;
    this.scene = scene;

    const built = acquireBody(typeName);
    this.bodyData = built;
    this.body = built.group;
    this.mesh = new THREE.Group();
    this.mesh.add(this.body);
    this.parts = built.parts;

    // the body owns its cloned materials, so a hit flashes this enemy and no
    // other; they travel with the body through the pool
    this.flashMats = built.flashMats;
    this.flash = 0;
    this.charging = 0;   // 0..1 through the wind-up
    this.charged = false; // true while a wind-up glow needs clearing

    // a single-slab stand-in, shown only when the enemy is far away
    this.proxy = new THREE.Mesh(PROXY_GEO, proxyMat(T.color));
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
    // the number over the body is the clearest feedback in a shooter: it says
    // what landed, and whether the shotgun was worth the walk
    if (ctx.hud && ctx.hud.damageNumber && ctx.camera) {
      ctx.hud.damageNumber(c, amount, ctx.camera, this.hp <= 0);
    }
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
          // a charger draws its lane on the floor: the wind-up says "this is
          // where I am going", and standing in it is a decision you can make
          if (this.T.charges && this.chargeLaneT == null) this.chargeLaneT = 0;
          if (this.T.charges) {
            this.chargeLaneT += dt;
            if (this.chargeLaneT > 0.07) {
              this.chargeLaneT = 0;
              const reach = Math.min(9, dist + 1.5);
              const len = Math.hypot(dx, dz) || 1;
              const nx = dx / len, nz = dz / len;
              for (let i = 1; i <= 5; i++) {
                const t = (i / 6) * reach;
                ctx.effects.burst(
                  { x: this.pos.x + nx * t, y: this.pos.y + 0.12, z: this.pos.z + nz * t },
                  this.T.laneColor || 0xff5522, 1, 0.05, 0.3, 0
                );
              }
            }
          }
        } else if (!this.fired) {
          this.fired = true;
          this.charging = 0;
          this.chargeLaneT = null;
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
    // a wisp floats: its tendrils move even when it is holding position
    this.walkPhase += dt * (this.moving ? 9 : (this.parts.tendrils ? 2.2 : 0));
    const swing = Math.sin(this.walkPhase) * 0.5 * sp;
    if (this.parts.legL) this.parts.legL.rotation.x = swing;
    if (this.parts.legR) this.parts.legR.rotation.x = -swing;
    // knees bend on the back swing, elbows on the forward one: the whole reason
    // to build a rig instead of a box with sticks
    // a wisp has no legs; its tendrils are what moves
    if (this.parts.tendrils) {
      const t = this.walkPhase || 0;
      this.parts.tendrils.forEach((j, i) => {
        j.rotation.x = 0.12 + Math.sin(t * 3 + i * 0.9) * 0.28;
        j.rotation.z = Math.cos(t * 2.4 + i * 1.3) * 0.22;
      });
    }

    // a quadruped gallops: the front pair leads, the back pair follows, and the
    // knees fold on the lift
    if (this.parts.frontL) {
      const g1 = swing * 1.15;
      this.parts.frontL.rotation.x = g1;
      this.parts.frontR.rotation.x = g1;
      this.parts.backL.rotation.x = -g1;
      this.parts.backR.rotation.x = -g1;
      if (this.parts.kneefrontL) {
        this.parts.kneefrontL.rotation.x = Math.max(0, -g1) * 1.5;
        this.parts.kneefrontR.rotation.x = Math.max(0, -g1) * 1.5;
        this.parts.kneebackL.rotation.x = Math.max(0, g1) * 1.5;
        this.parts.kneebackR.rotation.x = Math.max(0, g1) * 1.5;
      }
      if (this.parts.tail) this.parts.tail.rotation.x = 0.9 + Math.sin(swing * 4) * 0.22;
      if (this.parts.neck) this.parts.neck.rotation.x = -0.9 + Math.abs(swing) * 0.12;
    }
    if (this.parts.kneeL) this.parts.kneeL.rotation.x = Math.max(0, -swing) * 1.3;
    if (this.parts.kneeR) this.parts.kneeR.rotation.x = Math.max(0, swing) * 1.3;
    if (this.parts.elbowL) this.parts.elbowL.rotation.x = Math.max(0, swing) * 0.9 - 0.15;
    if (this.parts.elbowR) this.parts.elbowR.rotation.x = Math.max(0, -swing) * 0.9 - 0.15;

    // Pose blending: the walk cycle is the base, and the state adds to it. A
    // shooting enemy raises both arms and leans back; a hurt one folds forward.
    // Blending a target per state is the cheap version of an animation blend
    // tree, and it is what makes the wind-up readable in the body as well as
    // the glow.
    this.blend = this.blend || { attack: 0, pain: 0 };
    const wantAttack = this.state === STATE.ATTACK ? 1 : 0;
    const wantPain = this.state === STATE.PAIN ? 1 : 0;
    this.blend.attack += (wantAttack - this.blend.attack) * Math.min(1, dt * 9);
    this.blend.pain += (wantPain - this.blend.pain) * Math.min(1, dt * 12);
    const a = this.blend.attack;
    const pn = this.blend.pain;
    if (this.parts.shoulderR) this.parts.shoulderR.rotation.x -= a * 1.35;
    if (this.parts.shoulderL) this.parts.shoulderL.rotation.x -= a * 0.9;
    if (this.parts.elbowR) this.parts.elbowR.rotation.x -= a * 0.5;
    if (this.parts.spine) {
      const rest = this.parts.spine.userData.lean || 0;
      this.parts.spine.rotation.x = rest - a * 0.12 + pn * 0.5;
    }
    if (this.parts.head) this.parts.head.rotation.x = a * 0.1 - pn * 0.35;
    if (this.parts.legBL) this.parts.legBL.rotation.x = -swing;
    if (this.parts.legBR) this.parts.legBR.rotation.x = swing;
    if (this.type === 'imp' && this.parts.armL) {
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
    // the body goes back to the pool instead of the bin: its materials live on
    if (this.bodyData) {
      this.mesh.remove(this.body);
      releaseBody(this.bodyData);
      this.bodyData = null;
      this.flashMats = [];
    }
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
      // the spawn jitter has to fit the body: a brute is 0.78 wide and a 0.3 m
      // offset from a cell centre puts half of it inside the wall
      const jitter = Math.max(0, Math.min(0.3, 0.9 - TYPES[type].radius));
      const pos = new THREE.Vector3(
        c.wx + (Math.random() - 0.5) * jitter,
        0,
        c.wz + (Math.random() - 0.5) * jitter
      );
      const e = new Enemy(type, pos, wave, this.scene, { diff });
      e.pos.y = floorHeightAt(this.level, pos.x, pos.z);
      e.mesh.position.y = e.pos.y;
      this.list.push(e);
      this.effects.burst({ x: pos.x, y: e.pos.y + 0.8, z: pos.z }, 0xff3311, 10, 3, 0.5, 2);
    }

    if (bossWave) {
      // the warden is 2.1 m across: a single open cell cannot hold it, so it
      // spawns only where a 3x3 block is open and it is not born inside a wall
      const roomy = pool.filter((c) => {
        for (let dz = -1; dz <= 1; dz++) {
          for (let dx = -1; dx <= 1; dx++) {
            const n = this.level.cells[(c.z + dz) * this.level.W + (c.x + dx)];
            if (!n || n.solid || n.crate) return false;
          }
        }
        return true;
      });
      const c = (roomy.length ? roomy : pool)[Math.floor(Math.random() * (roomy.length || pool.length))];
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

  /**
   * An enemy that has not got closer to the player in a long time is stuck
   * behind geometry or in a room the player cannot reach. Moving it is better
   * than a wave nobody can clear and a door nobody can open.
   */
  unstuck(dt, player) {
    for (const e of this.list) {
      if (!e.alive) continue;
      const d = Math.hypot(e.pos.x - player.pos.x, e.pos.z - player.pos.z);
      if (!e.stuckRef || d < e.stuckRef - 0.5) {
        e.stuckRef = d;
        e.stuckT = 0;
        continue;
      }
      e.stuckT = (e.stuckT || 0) + dt;
      if (e.stuckT > 14 && d > 6) {
        // put it in front of the player, on open floor
        const a = Math.random() * Math.PI * 2;
        const r = 7;
        const x = player.pos.x + Math.cos(a) * r;
        const z = player.pos.z + Math.sin(a) * r;
        if (!circleBlocked(this.level, x, z, e.radius)) {
          e.pos.set(x, floorHeightAt(this.level, x, z), z);
          if (e.mesh) e.mesh.position.copy(e.pos);
          e.stuckT = 0;
          e.stuckRef = r;
        }
      }
    }
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
