// ---------------------------------------------------------------------------
// COMPANION — the ally you pick up in the second zone. A drone: it floats, so
// it ignores collision and pathing, follows at a distance, and takes pot shots
// at whatever is nearest. It cannot die; it goes dormant when you leave it far
// behind, which is the cost of running away.
// ---------------------------------------------------------------------------

import * as THREE from 'three';
import { hasLineOfSight } from './level.js';

const FOLLOW_NEAR = 2.6;
const FOLLOW_FAR = 4.2;
const ENGAGE_RANGE = 15;
const FIRE_CD = 0.85;
const DAMAGE = 7;

/**
 * The ally drone: floats behind the player, shoots what it can see, cannot die.
 */
export class Companion {
  constructor(scene, level, effects, audio) {
    this.scene = scene;
    this.level = level;
    this.effects = effects;
    this.audio = audio;

    this.group = new THREE.Group();
    const shell = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.17, 0),
      new THREE.MeshLambertMaterial({ color: 0x3fa9ff })
    );
    this.core = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.07, 0),
      new THREE.MeshBasicMaterial({ color: 0xbdeaff })
    );
    this.group.add(shell, this.core);
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.22, 0.014, 4, 16),
      new THREE.MeshBasicMaterial({ color: 0x66ccff, transparent: true, opacity: 0.7 })
    );
    ring.rotation.x = Math.PI / 2;
    this.group.add(ring);
    this.ring = ring;

    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.t = 0;
    this.fireT = 0;
    this.active = false;
    this.dormant = false;
    this.kills = 0;
    this.group.visible = false;
    scene.add(this.group);
  }

  spawn(player) {
    this.active = true;
    this.dormant = false;
    this.pos.set(player.pos.x - 1.4, player.pos.y + 1.9, player.pos.z - 1.4);
    this.group.position.copy(this.pos);
    // never let it sit on top of the camera
    this.group.visible = this.pos.distanceTo(player.pos) > 1.1;
    this.group.visible = true;
  }

  dispose() {
    this.scene.remove(this.group);
    this.group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) o.material.dispose();
    });
  }

  update(dt, player, enemies) {
    if (!this.active) return;
    this.t += dt;
    this.fireT -= dt;

    // hover toward a point behind and above the player
    // sits behind and above the shoulder, far enough not to fill the screen
    const target = new THREE.Vector3(
      player.pos.x + Math.sin(player.yaw) * 2.1,
      player.pos.y + 2.05,
      player.pos.z + Math.cos(player.yaw) * 2.1
    );
    const d = this.pos.distanceTo(target);
    this.dormant = d > 26;

    if (!this.dormant) {
      const pull = Math.min(1, Math.max(0, (d - FOLLOW_NEAR) / (FOLLOW_FAR - FOLLOW_NEAR)));
      this.vel.lerp(target.clone().sub(this.pos).normalize().multiplyScalar(6.5 * pull), 1 - Math.exp(-6 * dt));
    } else {
      this.vel.multiplyScalar(0.9);
    }
    this.pos.addScaledVector(this.vel, dt);
    this.pos.y += Math.sin(this.t * 2.2) * 0.004;
    this.group.position.copy(this.pos);
    // never let it sit on top of the camera
    this.group.visible = this.pos.distanceTo(player.pos) > 1.1;
    this.core.rotation.y += dt * 3;
    this.ring.rotation.z += dt * 1.4;

    // engage
    if (!this.dormant && this.fireT <= 0) {
      let best = null;
      let bestD = ENGAGE_RANGE;
      for (const e of enemies.list) {
        if (!e.alive) continue;
        const dd = Math.hypot(e.pos.x - this.pos.x, e.pos.z - this.pos.z);
        if (dd > bestD) continue;
        const eye = { x: this.pos.x, y: this.pos.y, z: this.pos.z };
        const chest = e.chestPos();
        if (!hasLineOfSight(this.level, eye, chest)) continue;
        best = e;
        bestD = dd;
      }
      if (best) {
        this.fireT = FIRE_CD;
        const chest = best.chestPos();
        this.effects.tracer(this.pos.clone(), new THREE.Vector3(chest.x, chest.y, chest.z), 0x8fd6ff);
        const killed = best.hurt(DAMAGE, {
          level: this.level,
          player,
          effects: this.effects,
          audio: this.audio,
          projectiles: null,
          onKill: null,
        }, new THREE.Vector3(chest.x - this.pos.x, 0, chest.z - this.pos.z).normalize());
        if (killed) this.kills++;
        this.audio.play('pistol', { x: this.pos.x, z: this.pos.z });
      }
    }
  }
}
