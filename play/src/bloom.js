// ---------------------------------------------------------------------------
// BLOOM — a cheap post pass so muzzle flashes, explosions and the warden's core
// actually glow.
//
// Three.js ships UnrealBloomPass, but that is a whole example module and this
// project vendors the core library only. So: render the scene into a target,
// keep the bright pixels at quarter resolution, blur them twice, and add them
// back. Four draw calls at quarter res, and the whole thing is switched off by
// the performance preset.
// ---------------------------------------------------------------------------

import * as THREE from 'three';

const VERT = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

// keep only what is brighter than the threshold, and soften the edge
const BRIGHT = `
uniform sampler2D tDiffuse;
uniform float threshold;
varying vec2 vUv;
void main() {
  vec3 c = texture2D(tDiffuse, vUv).rgb;
  float l = max(c.r, max(c.g, c.b));
  float k = smoothstep(threshold, threshold + 0.25, l);
  gl_FragColor = vec4(c * k, 1.0);
}
`;

// nine-tap blur, separable by the direction uniform
const BLUR = `
uniform sampler2D tDiffuse;
uniform vec2 dir;
varying vec2 vUv;
void main() {
  vec3 sum = texture2D(tDiffuse, vUv).rgb * 0.227;
  sum += texture2D(tDiffuse, vUv + dir * 1.3846).rgb * 0.316;
  sum += texture2D(tDiffuse, vUv - dir * 1.3846).rgb * 0.316;
  sum += texture2D(tDiffuse, vUv + dir * 3.2308).rgb * 0.070;
  sum += texture2D(tDiffuse, vUv - dir * 3.2308).rgb * 0.070;
  gl_FragColor = vec4(sum, 1.0);
}
`;

// The scene renders into a linear target, and the renderer's own sRGB conversion
// only runs on the final pass — which is this shader. Without the encode the
// whole game comes out dark.
const COMPOSITE = `
uniform sampler2D tScene;
uniform sampler2D tBloom;
uniform float strength;
varying vec2 vUv;
void main() {
  vec3 base = texture2D(tScene, vUv).rgb;
  vec3 glow = texture2D(tBloom, vUv).rgb;
  vec3 lin = base + glow * strength;
  vec3 srgb = pow(max(lin, 0.0), vec3(1.0 / 2.2));
  gl_FragColor = vec4(srgb, 1.0);
}
`;

/** A two-target bloom pass: bright pass at quarter res, two blurs, composite. */
export class Bloom {
  constructor(renderer, width, height, opts = {}) {
    this.renderer = renderer;
    this.enabled = opts.enabled !== false;
    this.strength = opts.strength != null ? opts.strength : 1.15;
    this.threshold = opts.threshold != null ? opts.threshold : 0.72;

    const qw = Math.max(1, Math.floor(width / 4));
    const qh = Math.max(1, Math.floor(height / 4));

    const target = (w, h) => new THREE.WebGLRenderTarget(w, h, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
    });

    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
    this.quad.frustumCulled = false;
    this.scene.add(this.quad);

    this.sceneTarget = target(width, height);
    this.brightTarget = target(qw, qh);
    this.blurA = target(qw, qh);
    this.blurB = target(qw, qh);

    this.brightMat = new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: null }, threshold: { value: this.threshold } },
      vertexShader: VERT, fragmentShader: BRIGHT, depthTest: false, depthWrite: false,
    });
    this.blurMat = new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: null }, dir: { value: new THREE.Vector2() } },
      vertexShader: VERT, fragmentShader: BLUR, depthTest: false, depthWrite: false,
    });
    this.compMat = new THREE.ShaderMaterial({
      uniforms: {
        tScene: { value: null },
        tBloom: { value: null },
        strength: { value: this.strength },
      },
      vertexShader: VERT, fragmentShader: COMPOSITE, depthTest: false, depthWrite: false,
    });
  }

  setSize(width, height) {
    const qw = Math.max(1, Math.floor(width / 4));
    const qh = Math.max(1, Math.floor(height / 4));
    this.sceneTarget.setSize(width, height);
    this.brightTarget.setSize(qw, qh);
    this.blurA.setSize(qw, qh);
    this.blurB.setSize(qw, qh);
  }

  pass(material, target) {
    this.quad.material = material;
    this.renderer.setRenderTarget(target);
    this.renderer.clear();
    this.renderer.render(this.scene, this.camera);
  }

  /**
   * Render the world into the target, then bloom it to the screen.
   * Returns the scene pass's own draw-call count: after the composite the
   * renderer's info describes one quad, and a budget that reads that number
   * measures nothing.
   */
  render(scene, camera) {
    const r = this.renderer;
    r.setRenderTarget(this.sceneTarget);
    r.clear();
    r.render(scene, camera);
    const stats = { calls: r.info.render.calls, tris: r.info.render.triangles };
    r.setRenderTarget(null);
    this.composite();
    return stats;
  }

  composite() {
    const r = this.renderer;
    const w = this.brightTarget.width;
    const h = this.brightTarget.height;

    this.brightMat.uniforms.tDiffuse.value = this.sceneTarget.texture;
    this.brightMat.uniforms.threshold.value = this.threshold;
    this.pass(this.brightMat, this.brightTarget);

    this.blurMat.uniforms.tDiffuse.value = this.brightTarget.texture;
    this.blurMat.uniforms.dir.value.set(1 / w, 0);
    this.pass(this.blurMat, this.blurA);

    this.blurMat.uniforms.tDiffuse.value = this.blurA.texture;
    this.blurMat.uniforms.dir.value.set(0, 1 / h);
    this.pass(this.blurMat, this.blurB);

    this.compMat.uniforms.tScene.value = this.sceneTarget.texture;
    this.compMat.uniforms.tBloom.value = this.blurB.texture;
    this.compMat.uniforms.strength.value = this.strength;
    this.quad.material = this.compMat;
    r.setRenderTarget(null);
    r.clear();
    r.render(this.scene, this.camera);
  }

  dispose() {
    for (const t of [this.sceneTarget, this.brightTarget, this.blurA, this.blurB]) t.dispose();
    this.brightMat.dispose();
    this.blurMat.dispose();
    this.compMat.dispose();
    this.quad.geometry.dispose();
  }
}
