// ---------------------------------------------------------------------------
// ENEMIES — two compound-mesh types with a finite state machine:
// IDLE -> CHASE -> ATTACK -> PAIN -> DEATH
// ---------------------------------------------------------------------------

import * as THREE from 'three';
import { circleBlocked, floorHeightAt, hasLineOfSight, buildFlowField, flowStep, MAX_STEP } from './level.js';

const STATE = { IDLE: 'IDLE', CHASE: 'CHASE', ATTACK: 'ATTACK', PAIN: 'PAIN', DEATH: 'DEATH' };

const TYPES = {
  imp: {
    hp: 55, speed: 2.5, radius: 0.45, height: 1.85, hitRadius: 0.62,
    attackRange: 14, attackCd: 2.1, telegraph: 0.55, damage: 15,
    melee: false, sight: 22, color: 0x8a3524, label: 'IMP',
  },
  grunt: {
    hp: 40, speed: 3.3, radius: 0.42, height: 1.7, hitRadius: 0.55,
    attackRange: 16, attackCd: 1.4, telegraph: 0.4, damage: 8,
    melee: true, meleeRange: 2.4, meleeDamage: 12, sight: 24, color: 0x53603c, label: 'GRUNT',
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
  };
  return MATS;
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
  g.add(box(0.8, 0.95, 0.55, M.impBody, 0, 1.05, 0));
  g.add(box(0.55, 0.45, 0.5, M.impDark, 0, 1.75, 0.03));
  const hl = new THREE.Mesh(coneGeo(0.07, 0.3, 5), M.impDark);
  hl.position.set(-0.18, 2.02, 0);
  hl.rotation.z = 0.35;
  const hr = hl.clone();
  hr.position.x = 0.18;
  hr.rotation.z = -0.35;
  g.add(hl, hr);
  g.add(box(0.1, 0.08, 0.06, M.impEye, -0.13, 1.8, 0.26));
  g.add(box(0.1, 0.08, 0.06, M.impEye, 0.13, 1.8, 0.26));
  const armL = limb(0.18, 0.75, 0.18, M.impBody, -0.5, 1.5, 0.05, 0.32);
  const armR = limb(0.18, 0.75, 0.18, M.impBody, 0.5, 1.5, 0.05, 0.32);
  const legL = limb(0.22, 0.75, 0.24, M.impDark, -0.22, 0.75, 0, 0.375);
  const legR = limb(0.22, 0.75, 0.24, M.impDark, 0.22, 0.75, 0, 0.375);
  g.add(armL, armR, legL, legR);
  return { group: g, parts: { armL, armR, legL, legR } };
}

function makeGrunt() {
  const M = mats();
  const g = new THREE.Group();
  g.add(box(0.72, 0.85, 0.45, M.gruntBody, 0, 1.05, 0));
  g.add(box(0.42, 0.38, 0.4, M.gruntDark, 0, 1.65, 0));
  g.add(box(0.5, 0.12, 0.46, M.gruntMetal, 0, 1.85, 0)); // helmet brim
  g.add(box(0.09, 0.06, 0.04, M.eye, -0.1, 1.66, 0.21));
  g.add(box(0.09, 0.06, 0.04, M.eye, 0.1, 1.66, 0.21));
  const gun = new THREE.Group();
  gun.add(box(0.14, 0.14, 0.62, M.gruntMetal, 0, 0, 0.18));
  gun.add(box(0.1, 0.22, 0.1, M.gruntDark, 0, -0.12, -0.05));
  gun.position.set(0.38, 1.22, 0.12);
  g.add(gun);
  const armL = limb(0.16, 0.65, 0.16, M.gruntBody, -0.45, 1.42, 0, 0.28);
  const legL = limb(0.2, 0.7, 0.22, M.gruntDark, -0.2, 0.7, 0, 0.35);
  const legR = limb(0.2, 0.7, 0.22, M.gruntDark, 0.2, 0.7, 0, 0.35);
  g.add(armL, legL, legR);
  return { group: g, parts: { armL, armR: gun, legL, legR } };
}

export class Enemy {
  constructor(typeName, worldPos, wave, scene) {
    const T = TYPES[typeName];
    this.type = typeName;
    this.T = T;
    this.scene = scene;

    const built = typeName === 'imp' ? makeImp() : makeGrunt();
    this.mesh = built.group;
    this.parts = built.parts;

    // clone the body materials for this enemy only, so a hit can flash it
    // without lighting up every other enemy on the map
    this.flashMats = [];
    this.flash = 0;
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

    this.mesh.position.copy(worldPos);
    scene.add(this.mesh);

    const scale = 1 + 0.1 * (wave - 1);
    this.maxHp = Math.round(T.hp * scale);
    this.hp = this.maxHp;
    this.speed = T.speed * Math.min(1.45, 1 + 0.03 * (wave - 1));
    this.damage = T.damage * Math.min(2.2, 1 + 0.06 * (wave - 1));

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
    this.dead = true;
    this.state = STATE.DEATH;
    this.stateT = 0;
    this.deadT = 0;
    const c = this.chestPos();
    ctx.effects.gibs(c);
    ctx.audio.play('enemyDie', this.chestPos());
    if (ctx.onKill) ctx.onKill(this);
  }

  update(dt, ctx) {
    const { level, player } = ctx;
    this.stateT += dt;

    // ground follow
    const f = floorHeightAt(level, this.pos.x, this.pos.z);
    this.pos.y = f;
    this.mesh.position.x = this.pos.x;
    this.mesh.position.z = this.pos.z;
    this.mesh.position.y = f;

    if (this.state === STATE.DEATH) {
      this.deadT += dt;
      const t = Math.min(1, this.deadT / 0.45);
      this.mesh.rotation.x = (Math.PI / 2) * t * 0.92;
      if (this.deadT > 1.4) this.mesh.position.y = f - (this.deadT - 1.4) * 0.55;
      if (this.deadT > 2.6) this.remove();
      return;
    }

    const dx = player.pos.x - this.pos.x;
    const dz = player.pos.z - this.pos.z;
    const dist = Math.hypot(dx, dz);
    const playerEye = { x: player.pos.x, y: player.pos.y + 1.6, z: player.pos.z };
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
        if (canSee) this.setState(STATE.CHASE);
        break;
      }
      case STATE.CHASE: {
        const nav = this.navDir(level, ctx.field, dx, dz, dist);
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
          // telegraph: wind up
          this.mesh.scale.set(1, 1 + Math.sin(this.stateT * 30) * 0.04, 1);
          if (this.type === 'imp' && Math.random() < 0.35) {
            const c = this.chestPos();
            ctx.effects.burst({ x: c.x, y: c.y + 0.3, z: c.z }, 0xff7a22, 1, 1.2, 0.35, -2);
          }
        } else if (!this.fired) {
          this.fired = true;
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
        if (this.stateT > 0.26) this.setState(STATE.CHASE);
        break;
      }
    }

    this.animate(dt);
  }

  doAttack(ctx, dist, dx, dz, canSee, playerEye) {
    const { player, projectiles, audio } = ctx;
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

  animate(dt) {
    if (this.flash > 0) {
      this.flash = Math.max(0, this.flash - dt);
      const e = this.flash / 0.16;
      for (const m of this.flashMats) m.emissive.setRGB(e * 0.85, e * 0.12, e * 0.08);
    }
    const sp = this.moving ? 1 : 0;
    this.walkPhase += dt * (this.moving ? 9 : 0);
    const swing = Math.sin(this.walkPhase) * 0.5 * sp;
    if (this.parts.legL) this.parts.legL.rotation.x = swing;
    if (this.parts.legR) this.parts.legR.rotation.x = -swing;
    if (this.type === 'imp') {
      this.parts.armL.rotation.x = -swing * 0.7;
      this.parts.armR.rotation.x = swing * 0.7;
      this.parts.armR.rotation.x -= this.state === STATE.ATTACK ? 1.6 : 0;
    } else {
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
    for (const m of this.flashMats) m.dispose();
    this.flashMats.length = 0;
    this.removed = true;
  }

  dispose() {
    this.remove();
  }
}

// ---------------------------------------------------------------------------

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
  }

  get aliveCount() {
    return this.list.filter((e) => e.alive).length;
  }

  clear() {
    for (const e of this.list) e.dispose();
    this.list.length = 0;
  }

  spawnWave(wave, playerPos) {
    const count = Math.min(24, 4 + wave * 2);
    const cells = this.level.openCells.filter((c) => {
      if (c.room < 0) return false;
      if (c.x === this.level.exit.cx && c.z === this.level.exit.cz) return false;
      const d = Math.hypot(c.wx - playerPos.x, c.wz - playerPos.z);
      return d > 9;
    });
    const pool = cells.length ? cells : this.level.openCells;

    for (let i = 0; i < count; i++) {
      const c = pool[Math.floor(Math.random() * pool.length)];
      const type = wave >= 2 && i % 3 === 2 ? 'grunt' : 'imp';
      const pos = new THREE.Vector3(c.wx + (Math.random() - 0.5) * 0.6, 0, c.wz + (Math.random() - 0.5) * 0.6);
      const e = new Enemy(type, pos, wave, this.scene);
      e.pos.y = floorHeightAt(this.level, pos.x, pos.z);
      e.mesh.position.y = e.pos.y;
      this.list.push(e);
      this.effects.burst({ x: pos.x, y: e.pos.y + 0.8, z: pos.z }, 0xff3311, 10, 3, 0.5, 2);
    }
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
    };
    for (const e of this.list) e.update(dt, ctx);

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
