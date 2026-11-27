// ---------------------------------------------------------------------------
// CO-OP — a second body in the arena.
//
// 2.46.0 shipped the lockstep session: two machines agreeing on input, frame by
// frame, with a hash to prove they still agree. This puts a body on the other
// side of it. The peer's input runs through the same `Player.update()` the local
// player runs through — the same movement, the same collision, the same steps —
// because a second body with its own physics is a second game.
//
// What it is not: there is no shooting from the second body, no health, and no
// signalling between machines. Two tabs on one machine, over a BroadcastChannel,
// is the whole of it so far.
// ---------------------------------------------------------------------------

import * as THREE from 'three';
import { Player } from './player.js';
import { humanoid } from './rig.js';
import { Session } from './net.js';
import { raycastWalls, floorHeightAt } from './level.js';

/** The colour the second player is drawn in: a body you can tell from the NPC. */
export const PEER_COLOR = 0x4a8a9a;
/** What one of the peer's shots does: the pistol's damage, so the two sides are
 * the same weight of gun until there is a second arsenal. */
export const PEER_DAMAGE = 11;
/** Seconds between the peer's shots. */
export const PEER_COOLDOWN = 0.28;
/** How far a peer's shot reaches, in metres. */
export const PEER_RANGE = 45;
/** The peer's health: the same body as the local player. */
export const PEER_HP = 110;
/** How close you have to be to pick a downed peer up, in metres. */
export const REVIVE_RANGE = 2.4;
/** What a revive gives back: half a body, not a whole one. */
export const REVIVE_HP = 55;

/**
 * A second player: a body, a player, and the input the peer sent.
 */
export class Coop {
  /**
   * @param {object} opts
   * @param {THREE.Scene} opts.scene
   * @param {object} opts.level
   * @param {number} [opts.player] 0 or 1: which side of the session this is.
   */
  constructor(opts) {
    this.scene = opts.scene;
    this.level = opts.level;
    this.player = opts.player === 1 ? 1 : 0;
    // a camera the second body writes to and nobody looks through
    this.camera = new THREE.PerspectiveCamera(76, 1, 0.05, 90);
    this.body = new Player(this.camera);
    this.body.pos.set(this.level.spawn.x, this.level.spawn.z ? 0 : 0, this.level.spawn.z);
    this.session = new Session({ player: this.player });
    this.frames = 0;
    this.starved = 0;
    this.shots = 0;
    this.fireCd = 0;
    this.hp = PEER_HP;
    this.hpMax = PEER_HP;
    this.alive = true;
    this.downedAt = -1;

    // the mesh: the same humanoid the NPC is built from, in a colour of its own
    const built = humanoid({
      ...(opts.proportions || {}),
      mats: {
        body: new THREE.MeshLambertMaterial({ color: PEER_COLOR }),
        dark: new THREE.MeshLambertMaterial({ color: 0x24343a }),
        eye: new THREE.MeshBasicMaterial({ color: 0xe8f4f8 }),
        plate: new THREE.MeshLambertMaterial({ color: 0x5a9aa8 }),
      },
    });
    this.mesh = built.group;
    // the joints the walk swings, from the same rig the NPC is built from
    this.joints = built.parts || {};
    this.stride = 0;
    this.mesh.position.set(this.body.pos.x, this.body.pos.y, this.body.pos.z);
    this.scene.add(this.mesh);
  }

  /** Put the body somewhere, and its mesh with it. */
  place(x, z) {
    // the floor of the cell it is standing in, not a hard-coded zero: `?coop=1`
    // put the peer at 0 on a level whose spawn cell is 1.1 m up
    this.body.pos.set(x, floorHeightAt(this.level, x, z), z);
    this.mesh.position.set(this.body.pos.x, this.body.pos.y, this.body.pos.z);
    return this;
  }

  /**
   * Advance the peer's body by one step of its input.
   * @param {number} dt
   * @param {object} input The peer's input: `{ keys, look, move }`.
   */
  step(dt, input, ctx = null) {
    if (!input) { this.starved++; return false; }
    this.fireCd = Math.max(0, this.fireCd - dt);
    this.body.update(dt, input, this.level);
    // the legs walk when the body does: a peer that slides is a peer that reads
    // as a bug, however correct its position is
    const speed = Math.hypot(this.body.vel.x, this.body.vel.z);
    this.stride += dt * Math.min(11, speed * 2.2);
    const swing = Math.sin(this.stride) * Math.min(0.62, speed * 0.16);
    if (this.joints.legL) this.joints.legL.rotation.x = swing;
    if (this.joints.legR) this.joints.legR.rotation.x = -swing;
    if (this.joints.armL) this.joints.armL.rotation.x = -swing * 0.7;
    if (this.joints.armR) this.joints.armR.rotation.x = swing * 0.7;
    if (input.fire && this.fireCd <= 0 && ctx) this.shoot(ctx);
    this.mesh.position.set(this.body.pos.x, this.body.pos.y, this.body.pos.z);
    // the body faces where the peer is looking
    if (input.look) this.mesh.rotation.y = -input.look.x;
    this.frames++;
    return true;
  }

  /**
   * The peer's shot: a hitscan down the barrel of their look, through the same
   * wall test everything else uses. The nearest body in front takes it.
   * @param {object} ctx `{ enemies, effects, audio, hud, camera, level }`
   * @returns {object|null} The body that was hit.
   */
  shoot(ctx) {
    this.fireCd = PEER_COOLDOWN;
    this.shots++;
    const eye = { x: this.body.pos.x, y: this.body.pos.y + 1.6, z: this.body.pos.z };
    const yaw = this.body.yaw;
    const pitch = this.body.pitch || 0;
    const dir = {
      x: -Math.sin(yaw) * Math.cos(pitch),
      y: Math.sin(pitch),
      z: -Math.cos(yaw) * Math.cos(pitch),
    };
    // what the walls allow
    const wall = ctx.level ? raycastWalls(ctx.level, eye, dir, PEER_RANGE) : null;
    const limit = wall && Number.isFinite(wall.dist) ? wall.dist : PEER_RANGE;
    let best = null;
    let bestT = limit;
    for (const e of (ctx.enemies && ctx.enemies.list) || []) {
      if (!e.alive) continue;
      const c = e.chestPos();
      const t = (c.x - eye.x) * dir.x + (c.y - eye.y) * dir.y + (c.z - eye.z) * dir.z;
      if (t <= 0 || t > bestT) continue;
      // how far the body is from the ray, sideways
      const px = eye.x + dir.x * t;
      const py = eye.y + dir.y * t;
      const pz = eye.z + dir.z * t;
      const off = Math.hypot(c.x - px, c.y - py, c.z - pz);
      if (off > (e.T.hitRadius || 0.6) + 0.25) continue;
      best = e;
      bestT = t;
    }
    // the muzzle: you have to be able to see your friend firing, or their shots
    // arrive from nowhere and read as a bug
    if (ctx.effects) ctx.effects.burst(eye, 0xffd24a, 5, 1.6, 0.14, 2, 0.7);
    if (best) {
      best.hurt(PEER_DAMAGE, ctx, { x: dir.x, y: dir.y, z: dir.z });
      if (ctx.audio) ctx.audio.play('hit', best.chestPos());
    } else if (ctx.audio) {
      ctx.audio.play('shot', eye);
    }
    return best;
  }

  /**
   * Take damage. The peer dies the same way the local player does — at zero, and
   * not before.
   * @returns {number} What landed.
   */
  damage(amount, from = null) {
    if (!this.alive) return 0;
    const n = Math.max(0, Number(amount) || 0);
    this.hp = Math.max(0, this.hp - n);
    if (this.hp <= 0) {
      this.alive = false;
      this.downedAt = this.frames;
    }
    return n;
  }

  /** True when you are close enough to pick the peer up. */
  inReviveRange(x, z) {
    if (this.alive) return false;
    return Math.hypot(this.pos.x - x, this.pos.z - z) <= REVIVE_RANGE;
  }

  /**
   * Pick a downed peer up. Half health, and only within reach: a revive you can
   * do from across the room is not a revive.
   * @param {number} x
   * @param {number} z
   * @returns {boolean} True when the peer is back up.
   */
  revive(x, z) {
    if (!this.inReviveRange(x, z)) return false;
    this.alive = true;
    this.hp = REVIVE_HP;
    this.downedAt = -1;
    return true;
  }

  /** Where the peer is, for a HUD or a test. */
  get pos() {
    return this.body.pos;
  }

  /** Remove the mesh from the scene. */
  dispose() {
    this.scene.remove(this.mesh);
  }
}
