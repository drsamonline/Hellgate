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
  const ring = (x, y, r, w, stroke) => {
    g.strokeStyle = stroke;
    g.lineWidth = w;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.stroke();
  };
  // a body with a light top, a dark underside and a hard edge: the cheapest way
  // to make a rectangle read as machined metal
  const metal = (x, y, w, h) => {
    const grad = g.createLinearGradient(0, y, 0, y + h);
    if (grad && grad.addColorStop) {
      grad.addColorStop(0, GUN_LIGHT);
      grad.addColorStop(0.28, GUN_METAL);
      grad.addColorStop(1, GUN_INK);
      g.fillStyle = grad;
    } else {
      g.fillStyle = GUN_METAL;
    }
    g.fillRect(x, y, w, h);
    rect(x, y, w, 2, '#8a9098');   // the lit edge
    rect(x, y + h - 2, w, 2, '#12141a'); // the shadow under it
  };
  const wood = (x, y, w, h) => {
    const grad = g.createLinearGradient(0, y, 0, y + h);
    if (grad && grad.addColorStop) {
      grad.addColorStop(0, '#6b4a2c');
      grad.addColorStop(1, '#2e1f12');
      g.fillStyle = grad;
    } else {
      g.fillStyle = GUN_WOOD;
    }
    g.fillRect(x, y, w, h);
  };
  // a fist: palm, four knuckles, a thumb over the top — a gun floating in the
  // corner reads as a prop, a gun held reads as yours
  const fist = (x, y, w, h) => {
    poly([[x, y + h], [x + w * 0.16, y], [x + w, y - h * 0.06], [x + w, y + h]], GUN_HAND);
    for (let i = 0; i < 3; i++) {
      const fy = y + h * (0.22 + i * 0.24);
      rect(x + w * 0.12, fy, w * 0.74, 3, '#6f5238');
    }
    rect(x + w * 0.06, y + h * 0.04, w * 0.34, 8, '#a08060');   // thumb
    rect(x + w * 0.9, y - h * 0.02, 4, h * 0.9, '#5e452f');      // the shadowed edge
  };

  // where the fist goes for this gun, in canvas coordinates: it is drawn after
  // the body, over the grip, because a hand behind the gun reads as a plank
  let handAt = null;

  if (key === 'pistol') {
    metal(112, 54, 104, 30);                   // slide
    rect(118, 60, 26, 6, '#0e1014');           // ejection port
    rect(206, 60, 26, 18, GUN_INK);            // barrel
    metal(112, 84, 74, 14);                    // frame
    wood(128, 96, 52, 62);                     // grip
    for (let i = 0; i < 4; i++) rect(132, 106 + i * 12, 44, 2, '#241708');
    poly([[112, 84], [126, 84], [126, 116], [116, 116]], GUN_INK); // trigger guard
    rect(146, 40, 10, 14, GUN_INK);            // hammer
    rect(198, 46, 8, 10, GUN_METAL);           // front sight
    rect(120, 46, 8, 10, GUN_METAL);           // rear sight
    handAt = [124, 118, 64, 82];
    if (firing) {
      disc(240, 68, 13, GUN_FLASH);
      poly([[234, 68], [256, 46], [256, 90]], GUN_FLASH);
      disc(240, 68, 6, '#fff6d8');
    }
  } else if (key === 'shotgun') {
    metal(78, 50, 158, 20);                    // top barrel
    metal(78, 76, 158, 20);                    // bottom barrel
    rect(78, 70, 158, 6, '#0e1014');           // the gap between them
    metal(96, 96, 86, 26);                     // receiver
    wood(104, 100, 70, 36);                    // pump
    for (let i = 0; i < 5; i++) rect(108 + i * 13, 102, 4, 32, '#1e1409');
    wood(46, 104, 56, 78);                     // stock
    poly([[46, 104], [104, 104], [104, 118], [46, 182]], GUN_WOOD);
    disc(240, 60, 4, '#c9ced6');               // bead
    handAt = [108, 108, 66, 86];
    if (firing) {
      disc(246, 60, 16, GUN_FLASH);
      poly([[240, 60], [256, 38], [256, 82]], GUN_FLASH);
      disc(246, 60, 7, '#fff6d8');
    }
  } else if (key === 'chaingun') {
    metal(96, 44, 88, 62);                     // receiver
    rect(104, 52, 72, 10, '#0e1014');          // feed cover
    for (let i = 0; i < 6; i++) {              // the barrel cluster
      const a = (i / 6) * Math.PI * 2;
      const bx = 196 + Math.cos(a) * 14;
      const by = 76 + Math.sin(a) * 14;
      disc(bx, by, 7, '#2a2e35');
      ring(bx, by, 7, 2, '#12141a');
      disc(bx, by, 3, '#0b0c10');
    }
    metal(182, 62, 46, 28);                    // barrel housing
    wood(106, 106, 36, 52);                    // grip
    metal(84, 100, 30, 40);                    // ammo box
    for (let i = 0; i < 4; i++) rect(88, 106 + i * 9, 22, 4, '#c9a34a'); // rounds
    rect(104, 28, 66, 12, GUN_INK);            // carry handle
    handAt = [100, 118, 62, 82];
    if (firing) {
      disc(244, 76, 20, GUN_FLASH);
      disc(244, 76, 10, '#fff6d8');
      poly([[236, 76], [256, 54], [256, 98]], GUN_FLASH);
    }
  } else {
    metal(64, 54, 176, 44);                    // tube
    rect(96, 62, 10, 28, '#12141a');           // a band
    rect(150, 62, 10, 28, '#12141a');
    metal(232, 44, 20, 64);                    // muzzle ring
    disc(252, 76, 10, '#0b0c10');              // the bore
    metal(44, 64, 24, 26);                     // back blast
    wood(112, 98, 30, 52);                     // front grip
    wood(176, 94, 26, 46);                     // rear grip
    metal(112, 34, 84, 14);                    // top rail
    for (let i = 0; i < 4; i++) rect(118 + i * 20, 36, 8, 4, '#12141a');
    rect(150, 26, 12, 10, GUN_METAL);          // sight
    handAt = [104, 110, 60, 86];
    if (firing) {
      disc(252, 76, 18, GUN_FLASH);
      poly([[244, 76], [256, 48], [256, 104]], GUN_FLASH);
      disc(252, 76, 8, '#fff6d8');
    }
  }

  // the hand, over the grip
  if (handAt) fist(handAt[0], handAt[1], handAt[2], handAt[3]);

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
