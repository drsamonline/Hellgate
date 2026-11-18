// ---------------------------------------------------------------------------
// PROJECTILES — rockets (player) and fireballs (imps).
// ---------------------------------------------------------------------------

import * as THREE from 'three';
import { raycastWalls } from './level.js';

const ROCKET = { speed: 26, radius: 0.18, splash: 4.5, damage: 95, life: 5 };
const FIREBALL = { speed: 13, radius: 0.22, splash: 1.4, damage: 15, life: 6 };

/**
 * Rockets and fireballs: spawn, travel, explode, and what they hit on the way.
 */
export class Projectiles {
  constructor(scene, level, effects, audio) {
    this.scene = scene;
    this.level = level;
    this.effects = effects;
    this.audio = audio;
    this.list = [];
    this.onKill = null;

    this.rocketMat = new THREE.MeshBasicMaterial({ color: 0xffcf6a });
    this.rocketGeo = new THREE.CylinderGeometry(0.07, 0.09, 0.45, 6);
    this.fireMat = new THREE.MeshBasicMaterial({ color: 0xff7722 });
    this.fireGeo = new THREE.SphereGeometry(0.2, 8, 6);
  }

  spawn(kind, pos, dir, opts = {}) {
    const spec = kind === 'rocket' ? ROCKET : FIREBALL;
    let mesh;
    if (kind === 'rocket') {
      mesh = new THREE.Mesh(this.rocketGeo, this.rocketMat);
      mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
    } else {
      mesh = new THREE.Mesh(this.fireGeo, this.fireMat);
    }
    mesh.position.copy(pos);
    this.scene.add(mesh);

    this.list.push({
      kind,
      mesh,
      pos: pos.clone(),
      dir: dir.clone().normalize(),
      speed: spec.speed,
      radius: spec.radius,
      splash: spec.splash,
      damage: opts.damage != null ? opts.damage : spec.damage,
      owner: opts.owner || 'player',
      life: spec.life,
      dead: false,
    });
  }

  update(dt, player, enemies) {
    for (const p of this.list) {
      if (p.dead) continue;
      p.life -= dt;
      if (p.life <= 0) { this.explode(p, player, enemies); continue; }

      const travel = p.speed * dt;
      const steps = Math.max(1, Math.ceil(travel / 0.3));
      const stepLen = travel / steps;

      for (let s = 0; s < steps && !p.dead; s++) {
        const hit = raycastWalls(this.level, p.pos, p.dir, stepLen + 0.06, 0.05);
        if (hit) {
          p.pos.set(hit.point.x, hit.point.y, hit.point.z);
          this.explode(p, player, enemies);
          break;
        }
        p.pos.addScaledVector(p.dir, stepLen);

        if (p.owner === 'player') {
          // enemy proximity
          for (const e of enemies.list) {
            if (!e.alive) continue;
            const c = e.chestPos();
            const d = Math.hypot(c.x - p.pos.x, c.y - p.pos.y, c.z - p.pos.z);
            if (d < e.hitRadius + p.radius) { this.explode(p, player, enemies); break; }
          }
        } else {
          const eye = { x: player.pos.x, y: player.pos.y + 1.2, z: player.pos.z };
          const d = Math.hypot(eye.x - p.pos.x, eye.y - p.pos.y, eye.z - p.pos.z);
          if (d < 0.85) { this.explode(p, player, enemies); break; }
        }
      }

      if (!p.dead) {
        p.mesh.position.copy(p.pos);
        if (p.kind === 'fireball') {
          const f = 0.85 + Math.sin(performance.now() * 0.03) * 0.2;
          p.mesh.scale.setScalar(f);
          if (Math.random() < 0.5) {
            this.effects.burst({ x: p.pos.x, y: p.pos.y, z: p.pos.z }, 0xff5511, 1, 0.7, 0.3, -1);
          }
        } else if (Math.random() < 0.7) {
          this.effects.burst({ x: p.pos.x, y: p.pos.y, z: p.pos.z }, 0xffaa33, 1, 0.6, 0.25, -1);
        }
      }
    }

    this.list = this.list.filter((p) => {
      if (p.dead) {
        this.scene.remove(p.mesh);
        return false;
      }
      return true;
    });
  }

  explode(p, player, enemies) {
    if (p.dead) return;
    p.dead = true;
    const pos = p.pos.clone();

    if (p.owner === 'player') {
      this.effects.explosion(pos, p.kind === 'rocket' ? 1.1 : 0.5);
      this.audio.play('boom');
      enemies.damageSphere(pos, p.splash, p.damage, {
        level: this.level,
        player,
        effects: this.effects,
        audio: this.audio,
        projectiles: this,
        onKill: this.onKill,
      });
      const dp = pos.distanceTo(new THREE.Vector3(player.pos.x, player.pos.y + 1, player.pos.z));
      if (dp < 10) this.effects.addShake(Math.max(0.12, 0.9 - dp / 12));
    } else {
      this.effects.explosion(pos, 0.45);
      this.audio.play('hit');
      const eye = new THREE.Vector3(player.pos.x, player.pos.y + 1.2, player.pos.z);
      if (pos.distanceTo(eye) < p.splash + 0.8) {
        player.damage(p.damage, { x: pos.x, y: pos.y, z: pos.z });
      }
      this.effects.addShake(0.08);
    }
  }

  clear() {
    for (const p of this.list) this.scene.remove(p.mesh);
    this.list.length = 0;
  }
}
