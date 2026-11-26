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

/** The colour the second player is drawn in: a body you can tell from the NPC. */
export const PEER_COLOR = 0x4a8a9a;

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
    this.mesh.position.set(this.body.pos.x, this.body.pos.y, this.body.pos.z);
    this.scene.add(this.mesh);
  }

  /** Put the body somewhere, and its mesh with it. */
  place(x, z) {
    this.body.pos.set(x, this.level.spawn ? 0 : 0, z);
    this.body.pos.y = this.body.pos.y || 0;
    this.mesh.position.set(this.body.pos.x, this.body.pos.y, this.body.pos.z);
    return this;
  }

  /**
   * Advance the peer's body by one step of its input.
   * @param {number} dt
   * @param {object} input The peer's input: `{ keys, look, move }`.
   */
  step(dt, input) {
    if (!input) { this.starved++; return false; }
    this.body.update(dt, input, this.level);
    this.mesh.position.set(this.body.pos.x, this.body.pos.y, this.body.pos.z);
    // the body faces where the peer is looking
    if (input.look) this.mesh.rotation.y = -input.look.x;
    this.frames++;
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
