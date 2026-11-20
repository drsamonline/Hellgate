// ---------------------------------------------------------------------------
// PROJECTILES — rockets (player) and fireballs (imps).
// ---------------------------------------------------------------------------

import * as THREE from 'three';
import { raycastWalls, floorHeightAt } from './level.js';

const ROCKET = { speed: 26, radius: 0.18, splash: 4.5, damage: 95, life: 5 };
const FIREBALL = { speed: 13, radius: 0.22, splash: 1.4, damage: 15, life: 6 };
// a thrown grenade: slower than a rocket, bounces, and the fuse is the weapon
const GRENADE = { speed: 15, radius: 0.2, splash: 5, damage: 110, life: 1.7, gravity: 22, bounce: 0.42 };
// a spitter's glob: arcs, does not bounce, splashes where it lands
const ACID = { speed: 11, radius: 0.22, splash: 2.4, damage: 14, life: 3.5, gravity: 20, bounce: 0 };

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
    const spec = kind === 'rocket' ? ROCKET
      : kind === 'grenade' ? GRENADE
      : kind === 'acid' ? ACID
      : FIREBALL;
    let mesh;
    if (kind === 'rocket') {
      mesh = new THREE.Mesh(this.rocketGeo, this.rocketMat);
      mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
    } else if (kind === 'acid') {
      mesh = new THREE.Mesh(this.fireGeo, new THREE.MeshBasicMaterial({ color: 0x7fd67f }));
      mesh.scale.setScalar(0.8);
    } else if (kind === 'grenade') {
      mesh = new THREE.Mesh(this.fireGeo, new THREE.MeshLambertMaterial({ color: 0x4a5a3a }));
      mesh.scale.setScalar(0.9);
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
      // grenades fall and bounce; everything else flies straight
      vy: (kind === 'grenade' || kind === 'acid') ? (opts.vy != null ? opts.vy : 3.2) : 0,
      gravity: spec.gravity || 0,
      bounce: spec.bounce || 0,
    });
  }

  update(dt, player, enemies) {
    for (const p of this.list) {
      if (p.dead) continue;
      p.life -= dt;
      if (p.life <= 0) { this.explode(p, player, enemies); continue; }

      if (p.gravity) {
        p.vy -= p.gravity * dt;
        const floor = floorHeightAt(this.level, p.pos.x, p.pos.z) + p.radius;
        p.pos.y += p.vy * dt;
        if (p.pos.y <= floor) {
          p.pos.y = floor;
          p.vy = Math.abs(p.vy) * p.bounce;
          if (p.vy < 0.6) p.vy = 0;
        }
      }

      const travel = p.speed * dt;
      const steps = Math.max(1, Math.ceil(travel / 0.3));
      const stepLen = travel / steps;

      for (let s = 0; s < steps && !p.dead; s++) {
        const hit = raycastWalls(this.level, p.pos, p.dir, stepLen + 0.06, 0.05);
        if (hit) {
          if (p.bounce) {
            // reflect off the wall and keep going: the fuse decides when it ends
            p.pos.set(hit.point.x, hit.point.y, hit.point.z);
            const n = hit.normal || { x: 0, y: 1, z: 0 };
            const dot = p.dir.x * n.x + p.dir.y * n.y + p.dir.z * n.z;
            p.dir.x -= 2 * dot * n.x;
            p.dir.y -= 2 * dot * n.y;
            p.dir.z -= 2 * dot * n.z;
            p.speed *= 0.6;
            break;
          }
          p.pos.set(hit.point.x, hit.point.y, hit.point.z);
          this.explode(p, player, enemies);
          break;
        }
        p.pos.addScaledVector(p.dir, stepLen);

        if (p.owner === 'player') {
          // enemy proximity
          if (p.bounce) continue; // a grenade passes by; the fuse does the work
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
