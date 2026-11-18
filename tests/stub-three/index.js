// Minimal Three.js stub — ONLY for headless testing in Node.
// The browser build uses the real three from the import map in index.html.

export const NearestFilter = 1003;
export const LinearMipmapLinearFilter = 1008;
export const RepeatWrapping = 1000;
export const SRGBColorSpace = 'srgb';

export class Vector3 {
  constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
  set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
  copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; }
  clone() { return new Vector3(this.x, this.y, this.z); }
  add(v) { this.x += v.x; this.y += v.y; this.z += v.z; return this; }
  addScaledVector(v, s) { this.x += v.x * s; this.y += v.y * s; this.z += v.z * s; return this; }
  normalize() { const l = this.length() || 1; this.x /= l; this.y /= l; this.z /= l; return this; }
  length() { return Math.hypot(this.x, this.y, this.z); }
  distanceTo(v) { return Math.hypot(this.x - v.x, this.y - v.y, this.z - v.z); }
  applyQuaternion() { return this; }
}

export class Color {
  constructor(hex = 0xffffff) { this.setHex(hex); }
  setHex(h) {
    this.r = ((h >> 16) & 255) / 255;
    this.g = ((h >> 8) & 255) / 255;
    this.b = (h & 255) / 255;
    return this;
  }
  set(h) { return typeof h === 'number' ? this.setHex(h) : this; }
  copy(c) { this.r = c.r; this.g = c.g; this.b = c.b; return this; }
  setRGB(r, g, b) { this.r = r; this.g = g; this.b = b; return this; }
}

export class Quaternion {
  setFromUnitVectors() { return this; }
}

export class Object3D {
  constructor() {
    this.position = new Vector3();
    this.rotation = {
      x: 0, y: 0, z: 0, order: 'XYZ',
      set(x, y, z, order) { this.x = x; this.y = y; this.z = z; if (order) this.order = order; },
    };
    this.scale = {
      x: 1, y: 1, z: 1,
      set(x, y, z) { this.x = x; this.y = y; this.z = z; },
      setScalar(s) { this.x = this.y = this.z = s; },
    };
    this.quaternion = new Quaternion();
    this.children = [];
    this.visible = true;
    this.matrixAutoUpdate = true;
    this.frustumCulled = true;
    this.parent = null;
    this.userData = {};
  }
  traverse(fn) {
    fn(this);
    for (const c of this.children) {
      if (typeof c.traverse === 'function') c.traverse(fn);
    }
  }
  add(...objs) { for (const o of objs) { o.parent = this; this.children.push(o); } return this; }
  remove(o) {
    const i = this.children.indexOf(o);
    if (i >= 0) this.children.splice(i, 1);
    if (o) o.parent = null;
    return this;
  }
  updateMatrix() {}
  updateMatrixWorld() {}
  lookAt() {}
  clone() {
    const c = new this.constructor(this.geometry, this.material);
    c.position.copy(this.position);
    c.rotation.set(this.rotation.x, this.rotation.y, this.rotation.z);
    c.scale.set(this.scale.x, this.scale.y, this.scale.z);
    return c;
  }
}

export class Scene extends Object3D {
  constructor() { super(); this.background = null; this.fog = null; }
}

export class Fog {
  constructor(color, near, far) { this.color = new Color(color); this.near = near; this.far = far; }
}

export class PerspectiveCamera extends Object3D {
  constructor(fov, aspect, near, far) {
    super();
    this.fov = fov; this.aspect = aspect; this.near = near; this.far = far;
  }
  updateProjectionMatrix() {}
  getWorldDirection(target) {
    const p = this.rotation.x;
    const y = this.rotation.y;
    target.set(-Math.sin(y) * Math.cos(p), Math.sin(p), -Math.cos(y) * Math.cos(p));
    return target.normalize();
  }
  getWorldPosition(target) { target.copy(this.position); return target; }
  localToWorld(v) {
    // yaw + pitch rotation, then translate
    const cy = Math.cos(this.rotation.y), sy = Math.sin(this.rotation.y);
    const cp = Math.cos(this.rotation.x), sp = Math.sin(this.rotation.x);
    const x = v.x * cy - v.z * sy;
    const z = v.x * sy + v.z * cy;
    const y = v.y * cp - z * sp;
    const z2 = v.y * sp + z * cp;
    v.set(x + this.position.x, y + this.position.y, z2 + this.position.z);
    return v;
  }
}

export class WebGLRenderer {
  constructor() {
    this.autoClear = true;
    this.outputColorSpace = SRGBColorSpace;
    this.renders = 0;
    this.capabilities = { getMaxAnisotropy: () => 8, isWebGL2: true };
    this.info = { render: { calls: 0, triangles: 0 }, memory: { geometries: 0, textures: 0 } };
  }
  setPixelRatio() {}
  setSize() {}
  clear() {}
  clearDepth() {}
  render(scene) {
    this.renders++;
    let calls = 0;
    let tris = 0;
    if (scene && typeof scene.traverse === 'function') {
      scene.traverse((o) => {
        if (!o.isMesh || !o.visible) return;
        calls++;
        const idx = o.geometry && o.geometry.index;
        if (idx) tris += (idx.array ? idx.array.length : idx.length) / 3;
      });
    }
    this.info.render.calls = calls;
    this.info.render.triangles = tris;
  }
}

class Light extends Object3D {
  constructor(color = 0xffffff, intensity = 1) {
    super();
    this.color = new Color(color);
    this.intensity = intensity;
    this.distance = 0;
  }
}
export class AmbientLight extends Light {}
export class HemisphereLight extends Light {}
export class DirectionalLight extends Light {}
export class PointLight extends Light {}

export class BufferAttribute {
  constructor(array, itemSize) { this.array = array; this.itemSize = itemSize; this.needsUpdate = false; }
}
export class Float32BufferAttribute extends BufferAttribute {}

export class BufferGeometry {
  constructor() { this.attributes = {}; this.index = null; this.userData = {}; }
  setAttribute(name, attr) { this.attributes[name] = attr; return this; }
  setIndex(i) { this.index = i; return this; }
  computeBoundingSphere() {}
  dispose() {}
}

class Primitive extends BufferGeometry {
  constructor() { super(); this.kind = this.constructor.name; }
  translate() { return this; }
}
export class BoxGeometry extends Primitive {}
export class PlaneGeometry extends Primitive {}
export class SphereGeometry extends Primitive {}
export class CylinderGeometry extends Primitive {}
export class ConeGeometry extends Primitive {}
export class OctahedronGeometry extends Primitive {}

class Material {
  constructor(params = {}) {
    Object.assign(this, params);
    this.color = new Color(params.color != null ? params.color : 0xffffff);
    this.emissive = new Color(0x000000);
    this.opacity = params.opacity != null ? params.opacity : 1;
    this.transparent = !!params.transparent;
    this.userData = {};
    this.disposed = 0;
    this.dispose = () => { this.disposed++; };
  }
  clone() {
    const c = new this.constructor({});
    c.color.copy(this.color);
    c.emissive.copy(this.emissive);
    c.map = this.map;
    c.opacity = this.opacity;
    c.transparent = this.transparent;
    c.userData = { ...this.userData };
    return c;
  }
}
export class MeshBasicMaterial extends Material {}
export class MeshLambertMaterial extends Material {}
export class PointsMaterial extends Material {}
export class LineBasicMaterial extends Material {}

export class Mesh extends Object3D {
  constructor(geometry, material) { super(); this.geometry = geometry; this.material = material; this.isMesh = true; }
}
export class Points extends Object3D {
  constructor(geometry, material) { super(); this.geometry = geometry; this.material = material; }
}
export class Line extends Object3D {
  constructor(geometry, material) { super(); this.geometry = geometry; this.material = material; }
}
export class Group extends Object3D {}

export class CanvasTexture {
  constructor(canvas) {
    this.canvas = canvas;
    this.repeat = { set() {} };
    this.needsUpdate = false;
  }
}

export class Clock {
  constructor() { this.t = 0; }
  getDelta() { return globalThis.__FAKE_DT || 0.016; }
  getElapsedTime() { return this.t; }
}
