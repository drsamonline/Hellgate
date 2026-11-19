// ---------------------------------------------------------------------------
// EFFECTS — tracers, impact decals, gib/particle bursts, muzzle & explosion
// lights, screen shake. All pooled, nothing allocated per shot.
// ---------------------------------------------------------------------------

import * as THREE from 'three';

// A soft round dot so particles read as embers rather than hard squares when
// they are close to the camera. 32x32, drawn once at boot.
let EMBER = null;
function emberTexture() {
  if (EMBER) return EMBER;
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.45, 'rgba(255,255,255,0.85)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 32, 32);
  EMBER = new THREE.CanvasTexture(c);
  EMBER.colorSpace = THREE.SRGBColorSpace;
  return EMBER;
}

const MAX_PARTICLES = 600;
const MAX_TRACERS = 16;
const MAX_DECALS = 40;
const MAX_LIGHTS = 4;

/**
 * Pooled tracers, decals, particles, lights and screen shake. Nothing allocates per shot.
 */
let glowTex = null;

/** A soft radial sprite used as a halo on pickups, so they read in the dark. */
/**
 * A soft radial halo for a pickup, so it reads in the dark. Falls back to a flat
 * sprite when there is no 2d canvas context (headless tests, canvas disabled).
 */
export function glowSprite(color, size = 0.9) {
  if (!glowTex) {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext && c.getContext('2d');
    // no 2d context (headless stub, or a browser with canvas disabled): a flat
    // sprite still marks the pickup, it just does not fade at the edges
    if (!g) {
      const mat = new THREE.SpriteMaterial({ color, transparent: true, opacity: 0.35, depthWrite: false });
      const flat = new THREE.Sprite(mat);
      flat.scale.setScalar(size);
      return flat;
    }
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.4, 'rgba(255,255,255,0.35)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    glowTex = new THREE.CanvasTexture(c);
  }
  const mat = new THREE.SpriteMaterial({ map: glowTex, color, transparent: true, opacity: 0.55, depthWrite: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.setScalar(size);
  return sprite;
}

/** Pooled tracers, decals, particles, lights and screen shake. Nothing allocates per shot. */
export class Effects {
  constructor(scene, decalTextures) {
    this.scene = scene;
    this.shake = 0;
    this.reducedMotion = false;
    this.decalTex = decalTextures;

    // ---- particles -------------------------------------------------------
    const pgeo = new THREE.BufferGeometry();
    this.pPos = new Float32Array(MAX_PARTICLES * 3);
    this.pCol = new Float32Array(MAX_PARTICLES * 3);
    for (let i = 0; i < MAX_PARTICLES; i++) this.pPos[i * 3 + 1] = -1000;
    pgeo.setAttribute('position', new THREE.BufferAttribute(this.pPos, 3));
    pgeo.setAttribute('color', new THREE.BufferAttribute(this.pCol, 3));
    this.points = new THREE.Points(
      pgeo,
      new THREE.PointsMaterial({
        size: 0.17,
        vertexColors: true,
        sizeAttenuation: true,
        transparent: true,
        opacity: 0.95,
        depthWrite: false,
        map: emberTexture(),
        alphaTest: 0.02,
      })
    );
    this.points.frustumCulled = false;
    scene.add(this.points);

    this.parts = [];
    for (let i = 0; i < MAX_PARTICLES; i++) {
      this.parts.push({ life: 0, max: 1, vx: 0, vy: 0, vz: 0, g: 12, r: 1, gg: 1, b: 1 });
    }
    this.pCursor = 0;

    // ---- tracers ---------------------------------------------------------
    this.tracers = [];
    for (let i = 0; i < MAX_TRACERS; i++) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
      const m = new THREE.LineBasicMaterial({ color: 0xffd27f, transparent: true, opacity: 0, depthWrite: false });
      const line = new THREE.Line(g, m);
      line.frustumCulled = false;
      line.visible = false;
      scene.add(line);
      this.tracers.push({ line, life: 0, max: 0.09 });
    }
    this.tCursor = 0;

    // ---- decals ----------------------------------------------------------
    this.decals = [];
    const dgeo = new THREE.PlaneGeometry(1, 1);
    for (let i = 0; i < MAX_DECALS; i++) {
      const m = new THREE.MeshBasicMaterial({
        map: decalTextures.blood,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -4,
      });
      const mesh = new THREE.Mesh(dgeo, m);
      mesh.visible = false;
      mesh.frustumCulled = false;
      scene.add(mesh);
      this.decals.push({ mesh, life: 0, max: 8 });
    }
    this.dCursor = 0;

    // ---- pooled point lights --------------------------------------------
    this.lights = [];
    for (let i = 0; i < MAX_LIGHTS; i++) {
      const l = new THREE.PointLight(0xffaa55, 0, 14, 2);
      l.visible = false;
      scene.add(l);
      this.lights.push({ light: l, life: 0, max: 0.1, peak: 0 });
    }
    this.lCursor = 0;
  }

  // ---------------------------------------------------------------- emitters

  burst(pos, color, count = 10, speed = 4, life = 0.7, gravity = 14, size = 1) {
    const c = new THREE.Color(color);
    for (let i = 0; i < count; i++) {
      const p = this.parts[this.pCursor];
      const idx = this.pCursor;
      this.pCursor = (this.pCursor + 1) % MAX_PARTICLES;

      const a = Math.random() * Math.PI * 2;
      const up = Math.random() * 0.9 + 0.1;
      const s = speed * (0.4 + Math.random() * 0.8);
      p.vx = Math.cos(a) * s;
      p.vy = up * s;
      p.vz = Math.sin(a) * s;
      p.g = gravity;
      p.life = p.max = life * (0.6 + Math.random() * 0.7);
      p.r = c.r * (0.7 + Math.random() * 0.5);
      p.gg = c.g * (0.7 + Math.random() * 0.5);
      p.b = c.b * (0.7 + Math.random() * 0.5);

      this.pPos[idx * 3] = pos.x;
      this.pPos[idx * 3 + 1] = pos.y;
      this.pPos[idx * 3 + 2] = pos.z;
      this.pCol[idx * 3] = p.r;
      this.pCol[idx * 3 + 1] = p.gg;
      this.pCol[idx * 3 + 2] = p.b;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.color.needsUpdate = true;
  }

  tracer(a, b, color = 0xffd27f) {
    const t = this.tracers[this.tCursor];
    this.tCursor = (this.tCursor + 1) % MAX_TRACERS;
    const arr = t.line.geometry.attributes.position.array;
    arr[0] = a.x; arr[1] = a.y; arr[2] = a.z;
    arr[3] = b.x; arr[4] = b.y; arr[5] = b.z;
    t.line.geometry.attributes.position.needsUpdate = true;
    t.line.material.color.setHex(color);
    t.line.material.opacity = 0.9;
    t.line.visible = true;
    t.life = t.max;
  }

  /**
   * A soft dark quad on the floor, parented to nothing: the caller moves it.
   * Used as a contact shadow under each enemy.
   */
  groundShadow(size = 1) {
    const mat = new THREE.MeshBasicMaterial({
      color: 0x000000, transparent: true, opacity: 0.34, depthWrite: false,
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat);
    mesh.rotation.x = -Math.PI / 2;
    this.scene.add(mesh);
    return mesh;
  }

  decal(point, normal, kind = 'blood', size = 0.55) {
    const d = this.decals[this.dCursor];
    this.dCursor = (this.dCursor + 1) % MAX_DECALS;
    d.mesh.material.map = this.decalTex[kind];
    d.mesh.material.opacity = 0.95;
    d.mesh.material.needsUpdate = true;
    d.mesh.scale.set(size, size, size);
    d.mesh.position.set(point.x + normal.x * 0.03, point.y + normal.y * 0.03, point.z + normal.z * 0.03);
    d.mesh.lookAt(point.x + normal.x, point.y + normal.y, point.z + normal.z);
    d.mesh.visible = true;
    d.life = d.max;
  }

  flash(pos, color = 0xffbb66, peak = 8, duration = 0.08, distance = 16) {
    const l = this.lights[this.lCursor];
    this.lCursor = (this.lCursor + 1) % MAX_LIGHTS;
    l.light.position.copy(pos);
    l.light.color.setHex(color);
    l.light.distance = distance;
    l.light.intensity = peak;
    l.light.visible = true;
    l.peak = peak;
    l.life = l.max = duration;
  }

  explosion(pos, scale = 1) {
    this.burst(pos, 0xffa030, 26 * scale, 9 * scale, 0.6, 8);
    this.burst(pos, 0xff5522, 14 * scale, 5 * scale, 0.9, 4);
    this.burst(pos, 0x333333, 10, 3, 1.4, 2);
    this.flash(pos, 0xff8833, 26 * scale, 0.22, 26);
  }

  blood(pos, dir) {
    const p = { x: pos.x, y: pos.y, z: pos.z };
    this.burst(p, 0xaa1010, 12, 4, 0.6, 16);
    if (dir) this.decal({ x: pos.x + dir.x * 0.2, y: pos.y + dir.y * 0.2, z: pos.z + dir.z * 0.2 }, dir, 'blood', 0.45);
  }

  gibs(pos) {
    this.burst(pos, 0x991414, 20, 6, 0.9, 18);
    this.burst(pos, 0x552222, 10, 4, 1.2, 20);
  }

  addShake(amount) {
    if (this.reducedMotion) return;
    this.shake = Math.min(1.4, this.shake + amount);
  }

  // ------------------------------------------------------------------ update

  update(dt) {
    // particles
    let dirty = false;
    for (let i = 0; i < MAX_PARTICLES; i++) {
      const p = this.parts[i];
      if (p.life <= 0) continue;
      p.life -= dt;
      dirty = true;
      const i3 = i * 3;
      if (p.life <= 0) {
        this.pPos[i3 + 1] = -1000;
        this.pCol[i3] = this.pCol[i3 + 1] = this.pCol[i3 + 2] = 0;
        continue;
      }
      p.vy -= p.g * dt;
      this.pPos[i3] += p.vx * dt;
      this.pPos[i3 + 1] += p.vy * dt;
      this.pPos[i3 + 2] += p.vz * dt;
      if (this.pPos[i3 + 1] < -0.2) {
        this.pPos[i3 + 1] = -0.2;
        p.vy *= -0.25;
        p.vx *= 0.6;
        p.vz *= 0.6;
      }
      const f = Math.min(1, p.life / p.max);
      this.pCol[i3] = p.r * f;
      this.pCol[i3 + 1] = p.gg * f;
      this.pCol[i3 + 2] = p.b * f;
    }
    if (dirty) {
      this.points.geometry.attributes.position.needsUpdate = true;
      this.points.geometry.attributes.color.needsUpdate = true;
    }

    // tracers
    for (const t of this.tracers) {
      if (t.life <= 0) continue;
      t.life -= dt;
      t.line.material.opacity = Math.max(0, (t.life / t.max) * 0.9);
      if (t.life <= 0) t.line.visible = false;
    }

    // decals
    for (const d of this.decals) {
      if (d.life <= 0) continue;
      d.life -= dt;
      const f = Math.min(1, d.life / (d.max * 0.4));
      d.mesh.material.opacity = 0.95 * f;
      if (d.life <= 0) d.mesh.visible = false;
    }

    // lights
    for (const l of this.lights) {
      if (l.life <= 0) continue;
      l.life -= dt;
      l.light.intensity = Math.max(0, (l.life / l.max) * l.peak);
      if (l.life <= 0) {
        l.light.visible = false;
        l.light.intensity = 0;
      }
    }

    // shake decay
    this.shake *= Math.exp(-6 * dt);
    if (this.shake < 0.001) this.shake = 0;
  }

  applyShake(camera) {
    if (this.shake <= 0) return;
    const s = this.shake;
    camera.position.x += (Math.random() - 0.5) * 0.12 * s;
    camera.position.y += (Math.random() - 0.5) * 0.12 * s;
    camera.position.z += (Math.random() - 0.5) * 0.12 * s;
    camera.rotation.z += (Math.random() - 0.5) * 0.06 * s;
  }
}
