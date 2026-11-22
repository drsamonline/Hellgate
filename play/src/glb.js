// ---------------------------------------------------------------------------
// GLB — a minimal reader for the open 3-D format.
//
// The game builds its enemies from joints in code, which is why it ships no
// assets. That is a constraint, not a rule: this reads a .glb (glTF 2.0 binary,
// the open standard) so a real model can be dropped into `assets/models/` and
// used in place of the procedural body, with no build step and no library.
//
// It handles what a static character model needs and nothing else:
//
//   - the JSON and BIN chunks of a .glb container
//   - POSITION, NORMAL, TEXCOORD_0 and indices (u8, u16, u32)
//   - node transforms, flattened into one geometry per primitive
//   - a material's base colour
//
// It does NOT do skinning, morph targets, animation, textures, or the .gltf
// JSON form with external buffers. A model that needs those needs the official
// loader; a model that does not needs 200 lines, and this is the 200 lines.
// ---------------------------------------------------------------------------

import * as THREE from 'three';

/** Read a .glb ArrayBuffer into { meshes: [{ geometry, color, name }] }. */
export function parseGLB(buffer) {
  const dv = new DataView(buffer);
  if (dv.getUint32(0, true) !== 0x46546c67) throw new Error('not a glb: bad magic'); // "glTF"
  const version = dv.getUint32(4, true);
  if (version !== 2) throw new Error('glb version ' + version + ', expected 2');

  let offset = 12;
  let json = null;
  let bin = null;
  while (offset < dv.byteLength) {
    const len = dv.getUint32(offset, true);
    const type = dv.getUint32(offset + 4, true);
    const start = offset + 8;
    if (type === 0x4e4f534a) json = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, start, len)));
    else if (type === 0x004e4942) bin = new Uint8Array(buffer, start, len);
    offset = start + len + ((4 - (len % 4)) % 4);
  }
  if (!json) throw new Error('glb has no JSON chunk');

  const accessors = json.accessors || [];
  const views = json.bufferViews || [];
  const COMP = { 5120: Int8Array, 5121: Uint8Array, 5122: Int16Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array };
  const SIZE = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };

  /** An accessor as a typed array, honouring byteOffset and byteStride. */
  function readAccessor(i) {
    const a = accessors[i];
    const view = views[a.bufferView];
    const Ctor = COMP[a.componentType];
    const comps = SIZE[a.type];
    const base = (view.byteOffset || 0) + (a.byteOffset || 0);
    if (!view.byteStride || view.byteStride === comps * Ctor.BYTES_PER_ELEMENT) {
      return new Ctor(bin.buffer, bin.byteOffset + base, a.count * comps);
    }
    // interleaved: copy out, because three cannot use a stride without an
    // InterleavedBufferAttribute and this loader is not that clever
    const out = new Ctor(a.count * comps);
    const step = view.byteStride;
    const dv2 = new DataView(bin.buffer, bin.byteOffset);
    for (let n = 0; n < a.count; n++) {
      for (let c = 0; c < comps; c++) {
        const at = base + n * step + c * Ctor.BYTES_PER_ELEMENT;
        out[n * comps + c] = Ctor === Float32Array ? dv2.getFloat32(at, true)
          : Ctor === Uint16Array ? dv2.getUint16(at, true)
          : Ctor === Uint32Array ? dv2.getUint32(at, true)
          : Ctor === Uint8Array ? dv2.getUint8(at)
          : Ctor === Int16Array ? dv2.getInt16(at, true)
          : dv2.getInt8(at);
      }
    }
    return out;
  }

  const meshes = [];
  const nodes = json.nodes || [];

  // a node's world matrix, from its TRS or its matrix
  function nodeMatrix(n) {
    const m = new THREE.Matrix4();
    if (n.matrix) m.fromArray(n.matrix);
    else {
      const t = n.translation || [0, 0, 0];
      const r = n.rotation || [0, 0, 0, 1];
      const s = n.scale || [1, 1, 1];
      m.compose(
        new THREE.Vector3(t[0], t[1], t[2]),
        new THREE.Quaternion(r[0], r[1], r[2], r[3]),
        new THREE.Vector3(s[0], s[1], s[2])
      );
    }
    return m;
  }

  function walk(nodeIndex, parentMatrix) {
    const n = nodes[nodeIndex];
    if (!n) return;
    const world = parentMatrix.clone().multiply(nodeMatrix(n));
    if (n.mesh != null) {
      const mesh = json.meshes[n.mesh];
      for (const prim of mesh.primitives || []) {
        const attrs = prim.attributes || {};
        if (attrs.POSITION == null) continue;
        const geo = new THREE.BufferGeometry();
        const pos = readAccessor(attrs.POSITION);
        geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        if (attrs.NORMAL != null) geo.setAttribute('normal', new THREE.BufferAttribute(readAccessor(attrs.NORMAL), 3));
        if (attrs.TEXCOORD_0 != null) geo.setAttribute('uv', new THREE.BufferAttribute(readAccessor(attrs.TEXCOORD_0), 2));
        if (prim.indices != null) geo.setIndex(new THREE.BufferAttribute(readAccessor(prim.indices), 1));
        // the node transform is baked in, so the caller gets world-space meshes
        if (n.matrix || n.translation || n.rotation || n.scale) geo.applyMatrix4(world);
        const mat = prim.material != null ? json.materials[prim.material] : null;
        const pbr = mat && mat.pbrMetallicRoughness;
        const base = pbr && pbr.baseColorFactor;
        const color = base
          ? new THREE.Color(base[0], base[1], base[2])
          : new THREE.Color(0x888888);
        meshes.push({ geometry: geo, color, name: (n.name || mesh.name || 'mesh') });
      }
    }
    for (const child of n.children || []) walk(child, world);
  }

  const scene = json.scenes && json.scenes[json.scene || 0];
  const roots = (scene && scene.nodes) || nodes.map((_, i) => i);
  for (const r of roots) walk(r, new THREE.Matrix4());

  return { meshes, meta: { generator: (json.asset || {}).generator || 'unknown' } };
}

/**
 * Fetch and parse a .glb into a Group. Rejects on anything the reader does not
 * handle, so a caller can fall back to its own geometry.
 */
export async function loadGLB(url, material) {
  const res = await fetch(url);
  if (!res.ok) throw new Error('glb fetch ' + res.status);
  const { meshes } = parseGLB(await res.arrayBuffer());
  if (!meshes.length) throw new Error('glb has no meshes');
  const group = new THREE.Group();
  for (const m of meshes) {
    const mat = material ? material.clone() : new THREE.MeshLambertMaterial({ color: m.color });
    if (material) mat.color = m.color.clone ? m.color.clone() : mat.color;
    group.add(new THREE.Mesh(m.geometry, mat));
  }
  return group;
}

/** A model's bounding box, so a caller can scale it to a known height. */
export function measure(group) {
  const box = new THREE.Box3().setFromObject(group);
  const size = new THREE.Vector3();
  box.getSize(size);
  return { size, box };
}
