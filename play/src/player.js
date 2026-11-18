// ---------------------------------------------------------------------------
// PLAYER — movement, look, collision, health/armour, ammo.
// ---------------------------------------------------------------------------

import * as THREE from 'three';
import { circleBlocked, floorHeightAt, MAX_STEP } from './level.js';

export const PLAYER_RADIUS = 0.42;
const EYE = 1.62;
const WALK = 5.4;
const SPRINT = 8.6;
const ACCEL = 14;
const GRAVITY = 22;
const JUMP = 5.4;
const LOOK_SENS = 0.0022;
const PITCH_LIMIT = 1.45;

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export class Player {
  constructor(camera) {
    this.camera = camera;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.vy = 0;
    this.grounded = true;
    this.yaw = 0;
    this.pitch = 0;
    this.eyeY = EYE;
    this.bob = 0;
    this.roll = 0;

    this.health = 100;
    this.armor = 0;
    this.ammo = { bullets: 60, shells: 16, rockets: 3 };
    this.alive = true;

    this.sensitivity = 1;   // set from settings
    this.speedMul = 1;      // set from the class
    this.damageMul = 1;     // set from the class
    this.invuln = 0;        // seconds of immunity, set by powers
    this.guard = 0;         // seconds of half damage, set by powers
    this.reducedMotion = false;

    this.onDamage = null;   // (amount, sourcePos) => void
    this.onDeath = null;
  }

  reset(level, lookYaw = 0) {
    this.pos.set(level.spawn.x, floorHeightAt(level, level.spawn.x, level.spawn.z), level.spawn.z);
    this.vel.set(0, 0, 0);
    this.vy = 0;
    this.grounded = true;
    this.yaw = lookYaw;
    this.pitch = 0;
    this.eyeY = this.pos.y + EYE;
    this.bob = 0;
    this.roll = 0;
    this.health = 100;
    this.armor = 0;
    this.ammo = { bullets: 60, shells: 16, rockets: 3 };
    this.alive = true;
    this.syncCamera();
  }

  look(dx, dy) {
    const k = LOOK_SENS * this.sensitivity;
    this.yaw -= dx * k;
    this.pitch = clamp(this.pitch - dy * k, -PITCH_LIMIT, PITCH_LIMIT);
  }

  update(dt, input, level) {
    const keys = input.keys;

    // ---- wish direction (camera relative) --------------------------------
    let ix = 0;
    let iz = 0;
    if (input.move && (input.move.x || input.move.y)) {
      ix = input.move.x;
      iz = input.move.y;
    } else {
    if (keys['KeyW'] || keys['ArrowUp']) iz -= 1;
    if (keys['KeyS'] || keys['ArrowDown']) iz += 1;
    if (keys['KeyA'] || keys['ArrowLeft']) ix -= 1;
    if (keys['KeyD'] || keys['ArrowRight']) ix += 1;
    }
    const len = Math.hypot(ix, iz) || 1;
    ix /= len;
    iz /= len;

    const sinY = Math.sin(this.yaw);
    const cosY = Math.cos(this.yaw);
    const wx = ix * cosY + iz * sinY;
    const wz = -ix * sinY + iz * cosY;

    const sprint = !!(keys['ShiftLeft'] || keys['ShiftRight']);
    const speed = (sprint ? SPRINT : WALK) * this.speedMul;
    const k = 1 - Math.exp(-ACCEL * dt);
    this.vel.x += (wx * speed - this.vel.x) * k;
    this.vel.z += (wz * speed - this.vel.z) * k;
    if (!ix && !iz) {
      const damp = Math.exp(-8 * dt);
      this.vel.x *= damp;
      this.vel.z *= damp;
    }

    // ---- horizontal move, sub-stepped + axis separated (slide) -----------
    const dx = this.vel.x * dt;
    const dz = this.vel.z * dt;
    const dist = Math.hypot(dx, dz);
    const steps = Math.max(1, Math.ceil(dist / 0.18));
    for (let s = 0; s < steps; s++) {
      this.tryStep(level, dx / steps, 0);
      this.tryStep(level, 0, dz / steps);
    }

    // ---- jump / gravity --------------------------------------------------
    if (input.jumpQueued && this.grounded) {
      this.vy = JUMP;
      this.grounded = false;
    }
    input.jumpQueued = false;

    const target = floorHeightAt(level, this.pos.x, this.pos.z);
    if (this.pos.y <= target + 0.001 && this.vy <= 0) {
      this.pos.y = target;
      this.vy = 0;
      this.grounded = true;
    } else {
      this.vy -= GRAVITY * dt;
      this.pos.y += this.vy * dt;
      this.grounded = false;
      if (this.pos.y <= target) {
        this.pos.y = target;
        this.vy = 0;
        this.grounded = true;
      }
    }

    // ---- camera smoothing + head bob ------------------------------------
    const sp = Math.hypot(this.vel.x, this.vel.z);
    this.bob += dt * sp * 1.7;
    const bobAmt = this.reducedMotion ? 0 : Math.min(1, sp / WALK);
    const bobY = Math.sin(this.bob * 2) * 0.035 * bobAmt;
    const bobRoll = this.reducedMotion ? 0 : Math.cos(this.bob) * 0.012 * bobAmt;

    this.eyeY += (this.pos.y + EYE - this.eyeY) * (1 - Math.exp(-16 * dt));
    this.roll += (bobRoll - this.roll) * (1 - Math.exp(-12 * dt));

    this.camera.position.set(this.pos.x, this.eyeY + bobY, this.pos.z);
    this.camera.rotation.set(this.pitch, this.yaw, this.roll, 'YXZ');
  }

  tryStep(level, dx, dz) {
    if (!dx && !dz) return;
    const nx = this.pos.x + dx;
    const nz = this.pos.z + dz;
    if (circleBlocked(level, nx, nz, PLAYER_RADIUS)) return;
    const f = floorHeightAt(level, nx, nz);
    if (f - this.pos.y > MAX_STEP + 0.001) return; // too tall to walk up
    this.pos.x = nx;
    this.pos.z = nz;
  }

  syncCamera() {
    this.camera.position.set(this.pos.x, this.eyeY, this.pos.z);
    this.camera.rotation.set(this.pitch, this.yaw, this.roll, 'YXZ');
  }

  get forward() {
    const v = new THREE.Vector3();
    this.camera.getWorldDirection(v);
    return v;
  }

  damage(amount, sourcePos) {
    if (!this.alive) return 0;
    if (this.invuln > 0) return 0;
    let dmg = this.guard > 0 ? amount * 0.5 : amount;
    if (this.armor > 0) {
      const absorbed = Math.min(this.armor, dmg * 0.5);
      this.armor -= absorbed;
      dmg -= absorbed;
    }
    this.health -= dmg;
    if (this.health <= 0) {
      this.health = 0;
      this.alive = false;
      if (this.onDeath) this.onDeath();
    }
    if (this.onDamage) this.onDamage(dmg, sourcePos);
    return dmg;
  }

  heal(n) { this.health = Math.min(100, this.health + n); }
  addArmor(n) { this.armor = Math.min(100, this.armor + n); }
}
