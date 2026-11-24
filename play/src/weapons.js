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

const REST = new THREE.Vector3(0.24, -0.19, -0.55);

// ---- the sprites ----------------------------------------------------------
// Every gun is a picture drawn in code, the way every texture in this game is.
// Two frames: the gun at rest, and the gun with its muzzle lit. The palette is
// the one the 3D models used, so the arsenal still reads as one arsenal.

const GUN_W = 256;
const GUN_H = 200;
const GUN_INK = '#22252a';     // the darkest metal
const GUN_METAL = '#3d4148';   // body
const GUN_LIGHT = '#6b7178';   // top edges and highlights
const GUN_WOOD = '#4a3320';    // grips and stocks
const GUN_HAND = '#8a6a4a';    // a hand, because a floating gun reads as a prop
const GUN_FLASH = '#ffd08a';

/**
 * Draw one weapon into a canvas and wrap it as a texture.
 * @param {string} key The weapon key: pistol, shotgun, rocket, chaingun.
 * @param {boolean} firing Whether to draw the lit-muzzle frame.
 * @returns {object|null} A CanvasTexture, or null where there is no canvas.
 */
function gunTexture(key, firing) {
  const canvas = document.createElement('canvas');
  if (!canvas || !canvas.getContext) return null;
  canvas.width = GUN_W;
  canvas.height = GUN_H;
  const g = canvas.getContext('2d');
  if (!g) return null;

  const rect = (x, y, w, h, fill) => {
    g.fillStyle = fill;
    g.fillRect(x, y, w, h);
  };
  const poly = (pts, fill) => {
    g.fillStyle = fill;
    g.beginPath();
    g.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
    g.closePath();
    g.fill();
  };
  const disc = (x, y, r, fill) => {
    g.fillStyle = fill;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  };

  // the hand comes first so the gun sits in front of it
  poly([[150, 200], [196, 132], [232, 144], [214, 200]], GUN_HAND);
  rect(196, 132, 30, 22, '#9a7a58');

  if (key === 'pistol') {
    rect(120, 62, 96, 26, GUN_METAL);          // slide
    rect(120, 62, 96, 7, GUN_LIGHT);           // top edge
    rect(206, 68, 22, 16, GUN_INK);            // barrel
    rect(126, 88, 58, 12, GUN_INK);            // frame
    poly([[132, 88], [186, 88], [178, 150], [146, 150]], GUN_WOOD);  // grip
    rect(150, 44, 8, 10, GUN_INK);             // hammer
    rect(196, 54, 6, 8, GUN_INK);              // front sight
    if (firing) {
      disc(232, 74, 15, GUN_FLASH);
      poly([[228, 74], [256, 62], [256, 86]], GUN_FLASH);
    }
  } else if (key === 'shotgun') {
    rect(96, 56, 150, 16, GUN_METAL);          // top barrel
    rect(96, 76, 150, 16, GUN_METAL);          // bottom barrel
    rect(96, 72, 150, 4, GUN_INK);             // the seam between them
    rect(96, 56, 150, 4, GUN_LIGHT);
    rect(120, 90, 74, 22, GUN_INK);            // receiver
    rect(126, 96, 62, 30, GUN_WOOD);           // pump
    poly([[62, 96], [126, 96], [120, 168], [84, 168]], GUN_WOOD);   // stock
    disc(240, 66, 4, GUN_LIGHT);               // bead
    if (firing) {
      disc(248, 66, 17, GUN_FLASH);
      poly([[244, 66], [256, 50], [256, 82]], GUN_FLASH);
    }
  } else if (key === 'chaingun') {
    rect(104, 52, 84, 54, GUN_METAL);          // receiver
    rect(104, 52, 84, 8, GUN_LIGHT);
    for (let i = 0; i < 6; i++) {              // the barrel cluster
      const a = (i / 6) * Math.PI * 2;
      disc(196 + Math.cos(a) * 13, 78 + Math.sin(a) * 13, 6, GUN_INK);
    }
    rect(186, 68, 54, 20, GUN_INK);
    rect(110, 106, 34, 46, GUN_WOOD);          // grip
    rect(96, 108, 26, 34, GUN_INK);            // ammo box
    rect(112, 36, 60, 10, GUN_INK);            // carry handle
    if (firing) {
      disc(242, 78, 18, GUN_FLASH);
      disc(242, 78, 9, '#fff4d0');
    }
  } else {
    rect(86, 62, 150, 40, GUN_METAL);          // tube
    rect(86, 62, 150, 9, GUN_LIGHT);
    rect(226, 54, 18, 56, GUN_INK);            // muzzle ring
    rect(70, 70, 18, 24, GUN_INK);             // back blast
    rect(120, 102, 26, 44, GUN_INK);           // front grip
    rect(178, 100, 22, 40, GUN_INK);           // rear grip
    rect(120, 46, 76, 10, GUN_INK);            // top rail
    if (firing) {
      disc(252, 82, 20, GUN_FLASH);
      poly([[246, 82], [256, 60], [256, 104]], GUN_FLASH);
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  // the same rule the painted wall textures follow: the canvas holds sRGB, and a
  // texture that does not say so is treated as linear and every dark tone lifts
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}


/**
 * View models, firing, recoil and weapon switching.
 */
/** The blade: reach, arc, damage and how long it takes to swing again. */
const MELEE = {
  damage: 58,
  reach: 2.6,
  arc: 0.35,       // cos of the half-angle: about 70 degrees either side
  cooldown: 0.52,
  lunge: 1.6,      // metres per second of forward shove
};

/** Owns the gun, its cooldown, the blade, and every hit it resolves. */
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
    this.spinT = 0;
    this.meleeCd = 0;
    this.meleeAnim = 0;   // chaingun spin-up, decays when the trigger is released
    this.firing = false;
    this.models = [];
    this.muzzleTimer = 0;

    this.buildModels();
    this.buildMuzzleFlash();
    this.select(0, true);
  }

  /**
   * The four guns, as sprites.
   *
   * They were boxes and cylinders lit in a 3D scene, which is a lot of geometry
   * for something that is always in the same corner of the screen and never
   * clips. A Doom-era gun is a picture, so each one is drawn into a canvas in
   * code — no external art, same as every texture in the game — and put on one
   * plane. Two frames each: the gun, and the gun with its muzzle lit.
   */
  buildModels() {
    const SIZE = { w: 0.44, h: 0.34 };
    for (let i = 0; i < WEAPONS.length; i++) {
      const idle = gunTexture(WEAPONS[i].key, false);
      const fire = gunTexture(WEAPONS[i].key, true);
      const mat = new THREE.MeshBasicMaterial({
        map: idle, transparent: true, depthWrite: false, depthTest: false,
      });
      // the guns are drawn once per page and live as long as the weapons do
      mat.userData.shared = true;
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(SIZE.w, SIZE.h), mat);
      mesh.userData.sprites = { idle, fire };
      mesh.userData.baseScale = 1;
      this.models.push(mesh);
    }

    for (const m of this.models) {
      // fully in frame: the weapon camera's half-width at this depth is 0.51 m
      // and its half-height 0.29 m, and a gun that runs off the corner looks
      // like a bug rather than a view model
      m.position.set(0.2, -0.1, -0.55);
      m.rotation.set(0, 0, 0);
      m.visible = false;
      this.scene.add(m);
    }
  }

  /** Scale the view model for the aspect: a portrait phone gets a smaller gun. */
  setAspectScale(k) {
    if (!Number.isFinite(k) || k <= 0) return;
    this.aspectScale = k;
    for (const m of this.models) m.scale.setScalar(k);
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
    this.models.forEach((m, i) => {
      m.visible = i === index;
      // a swap never leaves a lit frame behind: the flash timer belongs to the
      // gun that fired
      if (m.userData.sprites && m.material) m.material.map = m.userData.sprites.idle;
    });
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
      hud.toast('OUT OF ' + w.ammo.toUpperCase() + '  \u00b7  F BLADE');
      return;
    }
    player.ammo[w.ammo]--;
    this.cd = w.spin ? w.cooldown * (1 + 1.6 * (1 - this.spinT / w.spin)) : w.cooldown;
    if (w.spin) this.spinT = Math.min(w.spin, this.spinT + 0.06);
    this.kick = w.kick;
    this.muzzleTimer = 0.05;
    // the sprite's second frame: the same gun with its muzzle lit
    const held = this.models[this.current];
    if (held && held.userData.sprites && held.material) held.material.map = held.userData.sprites.fire;
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
    this.effects.muzzleFlash(muzzle, w.melee ? 0.3 : 0.42);

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
          hud: ctx.hud,
          camera: ctx.camera,
          level, player, effects: this.effects, audio: this.audio, projectiles,
          onKill: ctx.onKill,
          weapon: w.name,   // so the kill feed can name what killed it
        }, dir);
        // the number is drawn by Enemy.hurt(), which every damage source goes
        // through; drawing it here as well put two numbers on every hit
        this.effects.tracer(muzzle, eh.point, 0xffe0a0);
        this.effects.burst(eh.point, 0xaa1010, 4, 3, 0.4, 14);
        this.effects.impact(eh.point, 0.34);
        if (killed) this.audio.play('hit');
      } else if (ctx.damageBarrels && ctx.damageBarrels(origin, dir, maxD, w.damage)) {
        // the barrel took it; its own explosion does the rest
      } else if (ctx.damageRelic && ctx.damageRelic(origin, dir, maxD, w.damage)) {
        // the relic took it; the burst is drawn by the handler
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

  /**
   * A blade, always available and never out of ammo. It is the answer to
   * "what do I do when the counter says zero": a short wide arc that hits
   * everything in front of you, with a lunge so it can close the gap.
   */
  /**
   * The blade: a short wide arc in front of the player, on its own cooldown and
   * with no ammo cost. Returns true if it swung.
   */
  melee(ctx) {
    const { player, enemies, level } = ctx;
    if (!player.alive || this.meleeCd > 0) return false;
    this.meleeCd = MELEE.cooldown;
    this.meleeAnim = 1;
    this.audio.play('swing');
    this.effects.addShake(0.1);

    const origin = new THREE.Vector3();
    this.camera.getWorldPosition(origin);
    const dir = this.camera.getWorldDirection(new THREE.Vector3());
    this.effects.slash(origin, dir, MELEE.reach);

    let hitAny = false;
    for (const e of enemies.list) {
      if (!e.alive) continue;
      const dx = e.pos.x - player.pos.x;
      const dz = e.pos.z - player.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > MELEE.reach + (e.radius || 0.5)) continue;
      // only what is in front of you: a dot product, not a sphere
      const fx = -Math.sin(player.yaw);
      const fz = -Math.cos(player.yaw);
      const facing = (dx * fx + dz * fz) / (d || 1);
      if (facing < MELEE.arc) continue;
      const dmg = MELEE.damage * (player.damageMul || 1);
      e.hurt(dmg, {
        hud: ctx.hud,
        camera: ctx.camera,
        level, player, effects: this.effects, audio: this.audio, projectiles: ctx.projectiles,
        onKill: ctx.onKill, weapon: 'BLADE',
      }, { x: dx / (d || 1), y: 0, z: dz / (d || 1) });
      this.effects.blood({ x: e.pos.x, y: e.pos.y + 1, z: e.pos.z });
      // the number comes from Enemy.hurt(), like every other damage source
      hitAny = true;
    }

    if (hitAny) {
      this.audio.play('meleeHit');
      if (ctx.hud) ctx.hud.hitmarker();
      this.hits++;
    }
    this.shots++;
    // the lunge: a short shove forward, blocked by walls like any other movement
    if (player.lunge) player.lunge(MELEE.lunge);
    return true;
  }

  update(dt, player) {
    this.meleeCd = Math.max(0, (this.meleeCd || 0) - dt);
    this.meleeAnim = Math.max(0, (this.meleeAnim || 0) - dt * 3.2);
    const w = this.weapon;
    if (w && w.spin && !this.firing) this.spinT = Math.max(0, this.spinT - dt * 2.2);
    this.cd = Math.max(0, this.cd - dt);
    this.kick += (0 - this.kick) * (1 - Math.exp(-16 * dt));
    this.raise += (0 - this.raise) * (1 - Math.exp(-11 * dt));
    this.bob += dt * Math.hypot(player.vel.x, player.vel.z) * 1.7;

    if (this.muzzleTimer > 0) {
      this.muzzleTimer -= dt;
      if (this.muzzleTimer <= 0) {
        this.muzzle.visible = false;
        const held = this.models[this.current];
        if (held && held.userData.sprites && held.material) held.material.map = held.userData.sprites.idle;
      }
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
