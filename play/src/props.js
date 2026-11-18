// ---------------------------------------------------------------------------
// PROPS — what makes a room a place: trees, rocks, grass, and animals that
// wander and bolt. Everything static is instanced, so a grove of 26 trees and
// 60 tufts of grass costs four draw calls, not eighty-six.
// ---------------------------------------------------------------------------

import * as THREE from 'three';
import { makeRng } from './rng.js';
import { CELL, circleBlocked, floorHeightAt } from './level.js';

const dummy = new THREE.Object3D();

/**
 * Instanced trees, rocks and grass, plus animals that wander and bolt.
 */
export class Props {
  constructor(scene, level, zone) {
    this.scene = scene;
    this.level = level;
    this.group = new THREE.Group();
    this.meshes = [];
    this.grassMesh = null;
    this.animals = [];
    this.rng = makeRng(level.seed + ':props');
    this.t = 0;

    const cfg = zone.props || { trees: 0, rocks: 0, grass: 0, animals: 0 };
    const spots = this.candidateCells();

    if (cfg.trees > 0) this.buildTrees(spots, cfg.trees);
    if (cfg.rocks > 0) this.buildRocks(spots, cfg.rocks);
    if (cfg.grass > 0) this.buildGrass(spots, cfg.grass);
    if (cfg.animals > 0) this.buildAnimals(cfg.animals);

    scene.add(this.group);
  }

  // open cells inside rooms, away from the spawn and the exit pad
  candidateCells() {
    const out = [];
    const L = this.level;
    for (const c of L.openCells) {
      if (c.room < 0) continue;
      if (c.x === L.exit.cx && c.z === L.exit.cz) continue;
      if (Math.hypot(c.wx - L.spawn.x, c.wz - L.spawn.z) < 4) continue;
      // is it against a wall? trees look better rooted at the edge of a room
      let edge = false;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = c.x + dx;
        const nz = c.z + dz;
        if (nx < 0 || nz < 0 || nx >= L.W || nz >= L.H) continue;
        if (L.cells[nz * L.W + nx].solid) edge = true;
      }
      out.push({ ...c, edge });
    }
    return out;
  }

  pick(spots, count, edgeOnly) {
    const pool = edgeOnly ? spots.filter((s) => s.edge) : spots;
    const use = pool.length ? pool : spots;
    const out = [];
    for (let i = 0; i < count && use.length; i++) {
      out.push(use[Math.floor(this.rng.next() * use.length)]);
    }
    return out;
  }

  instance(geo, mat, count) {
    const mesh = new THREE.InstancedMesh(geo, mat, count);
    mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
    mesh.frustumCulled = true;
    this.group.add(mesh);
    this.meshes.push(mesh);
    return mesh;
  }

  buildTrees(spots, count) {
    const picks = this.pick(spots, count, true);
    if (!picks.length) return;
    const trunk = this.instance(
      new THREE.CylinderGeometry(0.11, 0.19, 1.7, 5),
      new THREE.MeshLambertMaterial({ color: 0x3b2a1c }),
      picks.length
    );
    const canopy = this.instance(
      new THREE.ConeGeometry(0.95, 2.4, 6),
      new THREE.MeshLambertMaterial({ color: 0x24402a }),
      picks.length
    );
    picks.forEach((c, i) => {
      const x = c.wx + (this.rng.next() - 0.5) * 0.9;
      const z = c.wz + (this.rng.next() - 0.5) * 0.9;
      const y = floorHeightAt(this.level, x, z);
      const s = 0.8 + this.rng.next() * 0.7;
      dummy.position.set(x, y + 0.85 * s, z);
      dummy.rotation.set(0, this.rng.next() * 6.28, 0);
      dummy.scale.set(s, s, s);
      dummy.updateMatrix();
      trunk.setMatrixAt(i, dummy.matrix);
      dummy.position.set(x, y + 2.1 * s, z);
      dummy.updateMatrix();
      canopy.setMatrixAt(i, dummy.matrix);
    });
    trunk.instanceMatrix.needsUpdate = true;
    canopy.instanceMatrix.needsUpdate = true;
  }

  buildRocks(spots, count) {
    const picks = this.pick(spots, count, false);
    if (!picks.length) return;
    const rocks = this.instance(
      new THREE.OctahedronGeometry(0.34, 0),
      new THREE.MeshLambertMaterial({ color: 0x4a4640 }),
      picks.length
    );
    picks.forEach((c, i) => {
      const x = c.wx + (this.rng.next() - 0.5) * 1.2;
      const z = c.wz + (this.rng.next() - 0.5) * 1.2;
      const y = floorHeightAt(this.level, x, z);
      const s = 0.5 + this.rng.next() * 0.9;
      dummy.position.set(x, y + 0.16 * s, z);
      dummy.rotation.set(this.rng.next(), this.rng.next() * 6.28, this.rng.next());
      dummy.scale.set(s, s * 0.7, s);
      dummy.updateMatrix();
      rocks.setMatrixAt(i, dummy.matrix);
    });
    rocks.instanceMatrix.needsUpdate = true;
  }

  buildGrass(spots, count) {
    const picks = this.pick(spots, count, false);
    if (!picks.length) return;
    const tufts = this.instance(
      new THREE.ConeGeometry(0.09, 0.46, 3),
      new THREE.MeshLambertMaterial({ color: 0x3f5a34 }),
      picks.length
    );
    picks.forEach((c, i) => {
      const x = c.wx + (this.rng.next() - 0.5) * 1.6;
      const z = c.wz + (this.rng.next() - 0.5) * 1.6;
      const y = floorHeightAt(this.level, x, z);
      const s = 0.6 + this.rng.next() * 0.8;
      dummy.position.set(x, y + 0.23 * s, z);
      dummy.rotation.set(0, this.rng.next() * 6.28, (this.rng.next() - 0.5) * 0.3);
      dummy.scale.set(s, s, s);
      dummy.updateMatrix();
      tufts.setMatrixAt(i, dummy.matrix);
    });
    tufts.instanceMatrix.needsUpdate = true;
    this.grassMesh = tufts;
  }

  // 0 hides the grass, 1 restores it. Called when the pixel ratio drops.
  setQuality(level) {
    if (this.grassMesh) this.grassMesh.visible = level > 0;
  }

  buildAnimals(count) {
    const spots = this.candidateCells();
    const picks = this.pick(spots, count, false);
    for (const c of picks) {
      const g = new THREE.Group();
      const body = new THREE.Mesh(
        new THREE.BoxGeometry(0.22, 0.2, 0.46),
        new THREE.MeshLambertMaterial({ color: 0x8a7358 })
      );
      body.position.y = 0.3;
      g.add(body);
      const head = new THREE.Mesh(
        new THREE.BoxGeometry(0.16, 0.16, 0.18),
        new THREE.MeshLambertMaterial({ color: 0x9a8163 })
      );
      head.position.set(0, 0.36, 0.28);
      g.add(head);
      const legs = [];
      for (const [dx, dz] of [[-0.08, 0.16], [0.08, 0.16], [-0.08, -0.16], [0.08, -0.16]]) {
        const leg = new THREE.Mesh(
          new THREE.BoxGeometry(0.05, 0.22, 0.05),
          new THREE.MeshLambertMaterial({ color: 0x5a4a38 })
        );
        leg.position.set(dx, 0.11, dz);
        g.add(leg);
        legs.push(leg);
      }
      const y = floorHeightAt(this.level, c.wx, c.wz);
      g.position.set(c.wx, y, c.wz);
      this.group.add(g);
      this.animals.push({
        mesh: g,
        legs,
        x: c.wx,
        z: c.wz,
        y,
        angle: this.rng.next() * 6.28,
        turn: 0,
        phase: this.rng.next() * 6.28,
        speed: 1.1 + this.rng.next() * 0.7,
      });
    }
  }

  update(dt, player) {
    this.t += dt;
    for (const a of this.animals) {
      const dx = a.x - player.pos.x;
      const dz = a.z - player.pos.z;
      const d = Math.hypot(dx, dz);

      if (d < 5.5) {
        // bolt away from the player
        a.turn = Math.atan2(dx, dz);
        a.speedNow = 3.4;
      } else {
        a.turn += (this.rng.next() - 0.5) * 0.6 * dt;
        a.speedNow = 0.9;
      }
      // turn toward the heading, then walk
      let diff = ((a.turn - a.angle + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      a.angle += diff * Math.min(1, dt * 5);

      const step = a.speedNow * dt;
      const nx = a.x + Math.sin(a.angle) * step;
      const nz = a.z + Math.cos(a.angle) * step;
      if (!circleBlocked(this.level, nx, nz, 0.28)) {
        a.x = nx;
        a.z = nz;
        a.y = floorHeightAt(this.level, nx, nz);
      } else {
        a.turn = a.angle + Math.PI * 0.6;
      }

      a.mesh.position.set(a.x, a.y, a.z);
      a.mesh.rotation.y = a.angle;
      a.phase += dt * (a.speedNow > 2 ? 14 : 6);
      const swing = Math.sin(a.phase) * 0.4;
      a.legs.forEach((leg, i) => { leg.rotation.x = i % 2 === 0 ? swing : -swing; });
    }
  }

  dispose() {
    this.scene.remove(this.group);
    this.group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) o.material.dispose();
    });
    this.animals.length = 0;
  }
}
