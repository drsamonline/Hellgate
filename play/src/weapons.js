// ---------------------------------------------------------------------------
// WEAPONS — hitscan pistol, 8-pellet shotgun, rocket launcher.
// View models live in their own scene so they never clip into walls.
// ---------------------------------------------------------------------------

import * as THREE from 'three';
import { raycastWalls } from './level.js';

/**
 * The four weapons: ammo, damage, cooldown, spread, range. `spin` is the time
 * the chaingun takes to reach its cooldown from a cold barrel.
 */
export const WEAPONS = [
  {
    key: 'pistol', name: 'PISTOL', ammo: 'bullets',
    damage: 17, cooldown: 0.3, pellets: 1, spread: 0.006, range: 70,
    kick: 0.055, shake: 0.05, sound: 'pistol',
  },
  {
    key: 'shotgun', name: 'SHOTGUN', ammo: 'shells',
    damage: 11, cooldown: 0.85, pellets: 8, spread: 0.075, range: 45,
    kick: 0.13, shake: 0.16, sound: 'shotgun', falloff: true,
  },
  {
    key: 'rocket', name: 'ROCKET', ammo: 'rockets',
    damage: 95, cooldown: 1.0, pellets: 1, spread: 0, range: 0,
    kick: 0.17, shake: 0.2, sound: 'rocket', projectile: true,
  },
  {
    key: 'chaingun', name: 'CHAINGUN', ammo: 'bullets',
    damage: 9, cooldown: 0.075, pellets: 1, spread: 0.05, range: 60,
    kick: 0.03, shake: 0.035, sound: 'chaingun', spin: 0.55,
  },
];

const REST = new THREE.Vector3(0.26, -0.26, -0.55);

/**
 * View models, firing, recoil and weapon switching.
 */
export class Weapons {
  constructor(weaponScene, weaponCamera, camera, effects, audio) {
    this.scene = weaponScene;
    this.camera = camera;
    this.effects = effects;
    this.audio = audio;
    this.current = 0;
    this.cd = 0;
    this.kick = 0;
    this.raise = 0;   // 1 = fully lowered, decays to 0 after a swap
    this.bob = 0;
    this.shots = 0;   // accuracy stat
    this.hits = 0;
    this.spinT = 0;   // chaingun spin-up, decays when the trigger is released
    this.firing = false;
    this.models = [];
    this.muzzleTimer = 0;

    this.buildModels();
    this.buildMuzzleFlash();
    this.select(0, true);
  }

  buildModels() {
    const metal = new THREE.MeshLambertMaterial({ color: 0x3d4148 });
    const dark = new THREE.MeshLambertMaterial({ color: 0x22252a });
    const wood = new THREE.MeshLambertMaterial({ color: 0x4a3320 });

    const bx = (w, h, d, m, x, y, z) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
      mesh.position.set(x, y, z);
      return mesh;
    };

    // pistol
    const pistol = new THREE.Group();
    pistol.add(bx(0.09, 0.1, 0.34, metal, 0, 0.02, -0.1));
    pistol.add(bx(0.07, 0.19, 0.1, dark, 0, -0.13, 0.06));
    pistol.add(bx(0.05, 0.05, 0.06, dark, 0, 0.08, 0.06));
    this.models.push(pistol);

    // chaingun: a fat barrel cluster on a boxy receiver
    const chain = new THREE.Group();
    chain.add(bx(0.16, 0.15, 0.4, metal, 0, 0.0, -0.1));
    for (const [ox, oy] of [[-0.045, -0.03], [0.045, -0.03], [-0.045, 0.05], [0.045, 0.05]]) {
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.42, 6), dark);
      b.rotation.x = Math.PI / 2;
      b.position.set(ox, oy, -0.34);
      chain.add(b);
    }
    chain.add(bx(0.06, 0.12, 0.08, dark, 0, -0.12, 0.06));
    this.models.push(chain);

    // shotgun
    const shotgun = new THREE.Group();
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.62, 8), metal);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.03, -0.16);
    shotgun.add(barrel);
    const pump = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.2, 8), dark);
    pump.rotation.x = Math.PI / 2;
    pump.position.set(0, 0.0, -0.08);
    shotgun.add(pump);
    shotgun.add(bx(0.1, 0.1, 0.22, wood, 0, -0.05, 0.16));
    shotgun.add(bx(0.08, 0.16, 0.09, wood, 0, -0.14, 0.24));
    this.models.push(shotgun);

    // rocket launcher
    const rocket = new THREE.Group();
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.11, 0.66, 10), dark);
    tube.rotation.x = Math.PI / 2;
    tube.position.set(0, 0.02, -0.14);
    rocket.add(tube);
    rocket.add(bx(0.07, 0.17, 0.1, metal, 0, -0.13, 0.02));
    rocket.add(bx(0.05, 0.08, 0.12, metal, 0, 0.13, -0.02));
    this.models.push(rocket);

    for (const m of this.models) {
      m.position.copy(REST);
      m.rotation.set(0, -0.06, 0);
      m.visible = false;
      this.scene.add(m);
    }
  }

  buildMuzzleFlash() {
    const g = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ color: 0xffd08a, transparent: true, opacity: 0.95, depthWrite: false });
    const star = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 4), mat);
    g.add(star);
    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.22, 4), mat);
    spike.rotation.x = -Math.PI / 2;
    spike.position.z = -0.12;
    g.add(spike);
    g.position.copy(REST).add(new THREE.Vector3(0, 0.03, -0.34));
    g.visible = false;
    this.scene.add(g);
    this.muzzle = g;
  }

  select(index, silent = false) {
    if (index < 0 || index >= WEAPONS.length) return;
    this.current = index;
    this.models.forEach((m, i) => { m.visible = i === index; });
    this.cd = 0.18; // fixed swap delay, not the old weapon's cooldown
    this.raise = 1; // dip the model out of frame and back
    if (!silent) this.audio.play('switch');
  }

  next(dir) {
    this.select((this.current + dir + WEAPONS.length) % WEAPONS.length);
  }

  get weapon() {
    return WEAPONS[this.current];
  }

  ammoFor(player) {
    return player.ammo[this.weapon.ammo];
  }

  tryFire(ctx) {
    const { player, level, enemies, projectiles, hud } = ctx;
    if (this.cd > 0 || !player.alive) return;
    const w = this.weapon;

    if (player.ammo[w.ammo] <= 0) {
      this.audio.play('empty');
      this.cd = 0.3;
      hud.toast('OUT OF ' + w.ammo.toUpperCase());
      return;
    }
    player.ammo[w.ammo]--;
    this.cd = w.spin ? w.cooldown * (1 + 1.6 * (1 - this.spinT / w.spin)) : w.cooldown;
    if (w.spin) this.spinT = Math.min(w.spin, this.spinT + 0.06);
    this.kick = w.kick;
    this.muzzleTimer = 0.05;
    this.muzzle.visible = true;
    this.muzzle.rotation.z = Math.random() * Math.PI;
    this.audio.play(w.sound);
    this.effects.addShake(w.shake);

    const origin = new THREE.Vector3();
    this.camera.getWorldPosition(origin);
    const baseDir = this.camera.getWorldDirection(new THREE.Vector3());
    const muzzle = this.camera.localToWorld(new THREE.Vector3(0.24, -0.16, -0.55));

    this.effects.flash(muzzle, 0xffcc88, 9, 0.06, 14);
    this.effects.muzzleSmoke(muzzle, baseDir);

    if (w.projectile) {
      projectiles.spawn('rocket', muzzle, baseDir, { damage: w.damage, owner: 'player' });
      return;
    }

    const tmp = new THREE.Vector3();
    let anyHit = false;

    for (let p = 0; p < w.pellets; p++) {
      const dir = tmp.copy(baseDir);
      if (w.spread > 0) {
        dir.x += (Math.random() - 0.5) * w.spread * 2;
        dir.y += (Math.random() - 0.5) * w.spread * 2;
        dir.z += (Math.random() - 0.5) * w.spread * 2;
        dir.normalize();
      }
      const wallHit = raycastWalls(level, origin, dir, w.range);
      const maxD = wallHit ? wallHit.dist : w.range;
      const eh = enemies.raycast(origin, dir, maxD);

      if (eh) {
        anyHit = true;
        let dmg = w.damage * (player.damageMul || 1);
        if (w.falloff) dmg *= Math.max(0.35, 1 - eh.dist / w.range);
        const killed = eh.enemy.hurt(dmg, {
          level, player, effects: this.effects, audio: this.audio, projectiles,
          onKill: ctx.onKill,
          weapon: w.name,   // so the kill feed can name what killed it
        }, dir);
        if (ctx.hud && ctx.hud.damageNumber) {
          ctx.hud.damageNumber(eh.point, dmg, this.camera, dmg >= 60);
        }
        this.effects.tracer(muzzle, eh.point, 0xffe0a0);
        this.effects.burst(eh.point, 0xaa1010, 4, 3, 0.4, 14);
        if (killed) this.audio.play('hit');
      } else if (ctx.damageBarrels && ctx.damageBarrels(origin, dir, maxD, w.damage)) {
        // the barrel took it; its own explosion does the rest
      } else if (wallHit && ctx.damageCrate && ctx.damageCrate(wallHit.cell, w.damage)) {
        // the crate took it
      } else if (wallHit && ctx.damageSecret && ctx.damageSecret(wallHit.cell, w.damage)) {
        // the wall took it; enough of them and it opens
      } else if (wallHit) {
        this.effects.tracer(muzzle, new THREE.Vector3(wallHit.point.x, wallHit.point.y, wallHit.point.z), 0xffd27f);
        this.effects.burst(
          { x: wallHit.point.x, y: wallHit.point.y, z: wallHit.point.z },
          0xffddaa, 3, 2.5, 0.3, 10
        );
        this.effects.decal(wallHit.point, wallHit.normal, 'scorch', 0.3);
        this.effects.sparks(wallHit.point, wallHit.normal, 8);
      } else {
        this.effects.tracer(muzzle, new THREE.Vector3(
          origin.x + dir.x * w.range,
          origin.y + dir.y * w.range,
          origin.z + dir.z * w.range
        ), 0xffd27f);
      }
    }

    this.shots++;
    if (anyHit) {
      this.hits++;
      hud.hitmarker();
    }
    else this.audio.play('wall');
  }

  update(dt, player) {
    const w = this.weapon;
    if (w && w.spin && !this.firing) this.spinT = Math.max(0, this.spinT - dt * 2.2);
    this.cd = Math.max(0, this.cd - dt);
    this.kick += (0 - this.kick) * (1 - Math.exp(-16 * dt));
    this.raise += (0 - this.raise) * (1 - Math.exp(-11 * dt));
    this.bob += dt * Math.hypot(player.vel.x, player.vel.z) * 1.7;

    if (this.muzzleTimer > 0) {
      this.muzzleTimer -= dt;
      if (this.muzzleTimer <= 0) this.muzzle.visible = false;
    }

    const m = this.models[this.current];
    if (!m) return;
    const sway = Math.min(1, Math.hypot(player.vel.x, player.vel.z) / 5.4);
    m.position.set(
      REST.x + Math.sin(this.bob) * 0.012 * sway,
      REST.y + Math.cos(this.bob * 2) * 0.01 * sway - this.kick * 0.2 - this.raise * 0.42,
      REST.z + this.kick
    );
    m.rotation.x = this.kick * 1.6;
    m.rotation.y = -0.06 + Math.sin(this.bob) * 0.01 * sway;

    this.muzzle.position.set(m.position.x, m.position.y + 0.03, m.position.z - 0.34);
  }
}
