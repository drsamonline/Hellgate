// ---------------------------------------------------------------------------
// POWERS — the class ability layer: an energy pool, three slots, cooldowns.
// Keys are Q, E and R. Energy regenerates on its own; casting is free otherwise.
// ---------------------------------------------------------------------------

import * as THREE from 'three';
import { raycastWalls } from './level.js';

export const POWERS = {
  dash: {
    id: 'dash',
    name: 'DASH',
    blurb: 'Lunge forward. Brief immunity.',
    cost: 20,
    cd: 2.6,
    key: 'Q',
  },
  shockwave: {
    id: 'shockwave',
    name: 'SHOCK',
    blurb: 'Blast everything within 6 m.',
    cost: 35,
    cd: 5.5,
    key: 'E',
  },
  ward: {
    id: 'ward',
    name: 'WARD',
    blurb: '40 armour, instantly.',
    cost: 25,
    cd: 9,
    key: 'R',
  },
  volley: {
    id: 'volley',
    name: 'VOLLEY',
    blurb: 'Six fast shots, no ammo.',
    cost: 30,
    cd: 6,
    key: 'R',
  },
  bulwark: {
    id: 'bulwark',
    name: 'BULWARK',
    blurb: 'Heal 30, halve damage for 6 s.',
    cost: 45,
    cd: 14,
    key: 'R',
  },
};

const REGEN = 11; // energy per second

export class Powers {
  constructor() {
    this.slots = [];
    this.energy = 100;
    this.maxEnergy = 100;
    this.cd = {};
    this.invuln = 0;
    this.guard = 0;   // seconds of half damage
    this.lastCast = '';
  }

  equip(classDef) {
    this.slots = classDef.powers.map((id) => POWERS[id]);
    this.maxEnergy = classDef.energy;
    this.energy = classDef.energy;
    this.cd = {};
    for (const p of this.slots) this.cd[p.id] = 0;
    this.invuln = 0;
    this.guard = 0;
  }

  ready(i) {
    const p = this.slots[i];
    if (!p) return false;
    return this.cd[p.id] <= 0 && this.energy >= p.cost;
  }

  update(dt, player) {
    this.energy = Math.min(this.maxEnergy, this.energy + REGEN * dt);
    for (const k of Object.keys(this.cd)) this.cd[k] = Math.max(0, this.cd[k] - dt);
    if (this.invuln > 0) this.invuln -= dt;
    if (this.guard > 0) this.guard -= dt;
  }

  // Returns true when the power fired. The caller owns the scene pieces.
  cast(i, ctx) {
    const p = this.slots[i];
    if (!p || !this.ready(i)) {
      if (p && this.energy < p.cost) ctx.hud.toast('NOT ENOUGH ENERGY');
      return false;
    }
    const { player, level, enemies, effects, audio, camera, projectiles } = ctx;

    switch (p.id) {
      case 'dash': {
        const fwd = camera.getWorldDirection(new THREE.Vector3());
        fwd.y = 0;
        fwd.normalize();
        player.vel.x += fwd.x * 16;
        player.vel.z += fwd.z * 16;
        this.invuln = 0.35;
        effects.burst({ x: player.pos.x, y: player.pos.y + 0.6, z: player.pos.z }, 0x66ccff, 12, 3, 0.35, 2);
        audio.play('switch');
        break;
      }
      case 'shockwave': {
        const c = { x: player.pos.x, y: player.pos.y + 0.8, z: player.pos.z };
        effects.explosion(c, 0.8);
        effects.addShake(0.5);
        audio.play('boom');
        enemies.damageSphere(c, 6, 45, {
          level, player, effects, audio, projectiles,
          onKill: ctx.onKill,
        });
        break;
      }
      case 'ward': {
        player.addArmor(40);
        effects.burst({ x: player.pos.x, y: player.pos.y + 0.9, z: player.pos.z }, 0x66ffcc, 16, 2.5, 0.5, 1);
        effects.flash(new THREE.Vector3(player.pos.x, player.pos.y + 1.2, player.pos.z), 0x66ffcc, 10, 0.25, 10);
        audio.play('pickup');
        break;
      }
      case 'volley': {
        const origin = new THREE.Vector3();
        camera.getWorldPosition(origin);
        const base = camera.getWorldDirection(new THREE.Vector3());
        for (let s = 0; s < 6; s++) {
          const dir = base.clone();
          dir.x += (Math.random() - 0.5) * 0.05;
          dir.y += (Math.random() - 0.5) * 0.05;
          dir.z += (Math.random() - 0.5) * 0.05;
          dir.normalize();
          const wallHit = raycastWalls(level, origin, dir, 60);
          const maxD = wallHit ? wallHit.dist : 60;
          const eh = enemies.raycast(origin, dir, maxD);
          if (eh) {
            eh.enemy.hurt(14 * player.damageMul, { level, player, effects, audio, projectiles, onKill: ctx.onKill }, dir);
            effects.tracer(origin, eh.point, 0xaaffcc);
          }
        }
        audio.play('pistol');
        effects.addShake(0.12);
        break;
      }
      case 'bulwark': {
        player.heal(30);
        this.guard = 6;
        effects.flash(new THREE.Vector3(player.pos.x, player.pos.y + 1.2, player.pos.z), 0xffd24a, 14, 0.35, 12);
        audio.play('key');
        break;
      }
    }

    this.energy -= p.cost;
    this.cd[p.id] = p.cd;
    this.lastCast = p.id;
    return true;
  }
}
