// ---------------------------------------------------------------------------
// TEXTURES — every surface is drawn on a 64x64 canvas at boot. No external
// assets. NearestFilter magnification keeps the chunky 1993 look.
// ---------------------------------------------------------------------------

import * as THREE from 'three';

import { pixelise } from './pixel.js';

const S = 64;

function ctx2d() {
  const c = document.createElement('canvas');
  c.width = S;
  c.height = S;
  const x = c.getContext('2d');
  x.imageSmoothingEnabled = false;
  return x;
}

function toTex(ctx, repeat = 1) {
  // quantise and dither before it becomes a texture: the same drawing reads as
  // pixel art with a fixed palette instead of photographic mush at close range
  try { pixelise(ctx, 12, 24); } catch (e) { /* no 2d context in a stub */ }
  const t = new THREE.CanvasTexture(ctx.canvas);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.repeat.set(repeat, repeat);
  return t;
}

/**
 * Grain, in blocks.
 *
 * Per-pixel noise on a 64 px texture that is then quantised to twelve colours
 * becomes television static: every pixel a different shade, and the dither step
 * pushes the difference up rather than down. A block of 2 x 2 shares one offset,
 * so the noise reads as the surface of a thing at close range instead of fuzz.
 */
function grain(ctx, amount) {
  const img = ctx.getImageData(0, 0, S, S);
  const d = img.data;
  const B = 2;
  for (let by = 0; by < S; by += B) {
    for (let bx = 0; bx < S; bx += B) {
      const n = (Math.random() - 0.5) * amount;
      for (let y = by; y < Math.min(S, by + B); y++) {
        for (let x = bx; x < Math.min(S, bx + B); x++) {
          const i = (y * S + x) * 4;
          d[i] = Math.max(0, Math.min(255, d[i] + n));
          d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + n));
          d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + n));
        }
      }
    }
  }
  ctx.putImageData(img, 0, 0);
}

function brick() {
  const c = ctx2d();
  c.fillStyle = '#2a2018';
  c.fillRect(0, 0, S, S);
  const rows = 8;
  const rh = S / rows;
  for (let r = 0; r < rows; r++) {
    const offset = (r % 2) * 16;
    for (let x = -32; x < S; x += 32) {
      const shade = 60 + Math.random() * 26;
      c.fillStyle = `rgb(${shade + 22},${shade - 4},${shade - 20})`;
      c.fillRect(x + offset + 1, r * rh + 1, 30, rh - 2);
    }
  }
  grain(c, 14);
  return toTex(c);
}

function tech() {
  const c = ctx2d();
  c.fillStyle = '#333c44';
  c.fillRect(0, 0, S, S);
  // panels
  for (let y = 0; y < S; y += 16) {
    for (let x = 0; x < S; x += 32) {
      const v = 64 + Math.random() * 20;
      c.fillStyle = `rgb(${v},${v + 6},${v + 10})`;
      c.fillRect(x + 1, y + 1, 30, 14);
    }
  }
  // rivets
  c.fillStyle = '#8b9aa4';
  for (let y = 8; y < S; y += 16) {
    for (let x = 6; x < S; x += 32) {
      c.fillRect(x, y, 2, 2);
      c.fillRect(x + 24, y, 2, 2);
    }
  }
  // hazard stripe
  c.fillStyle = '#8a6a1e';
  c.fillRect(0, 30, S, 4);
  c.fillStyle = '#20242a';
  for (let x = 0; x < S; x += 8) c.fillRect(x, 30, 4, 4);
  grain(c, 16);
  return toTex(c);
}

function tile() {
  const c = ctx2d();
  c.fillStyle = '#141a16';
  c.fillRect(0, 0, S, S);
  for (let y = 0; y < S; y += 32) {
    for (let x = 0; x < S; x += 32) {
      const v = 40 + Math.random() * 16;
      c.fillStyle = `rgb(${v},${v + 8},${v - 4})`;
      c.fillRect(x + 2, y + 2, 28, 28);
      c.fillStyle = 'rgba(0,0,0,0.35)';
      c.fillRect(x + 2, y + 26, 28, 4);
    }
  }
  grain(c, 12);
  return toTex(c);
}

function plate() {
  const c = ctx2d();
  c.fillStyle = '#221c1a';
  c.fillRect(0, 0, S, S);
  for (let i = 0; i < 90; i++) {
    const v = 30 + Math.random() * 30;
    c.fillStyle = `rgba(${v + 18},${v + 8},${v},0.7)`;
    const w = 4 + Math.random() * 18;
    c.fillRect(Math.random() * S, Math.random() * S, w, w * 0.5);
  }
  c.strokeStyle = '#3d3230';
  c.lineWidth = 2;
  c.strokeRect(1, 1, S - 2, S - 2);
  grain(c, 10);
  return toTex(c);
}

function concrete() {
  const c = ctx2d();
  c.fillStyle = '#34312e';
  c.fillRect(0, 0, S, S);
  for (let i = 0; i < 60; i++) {
    const v = 40 + Math.random() * 24;
    c.fillStyle = `rgba(${v},${v},${v},0.8)`;
    c.fillRect(Math.random() * S, Math.random() * S, 3 + Math.random() * 10, 2 + Math.random() * 6);
  }
  c.strokeStyle = 'rgba(0,0,0,0.5)';
  c.beginPath();
  c.moveTo(0, 22);
  c.lineTo(30, 26);
  c.lineTo(64, 18);
  c.stroke();
  grain(c, 24);
  return toTex(c);
}

// ---- four more surfaces, so a zone can pick a pair that is not a recolour ----

/** Rusted plate: pitted metal with runnels of oxide. */
function rust() {
  const c = ctx2d();
  c.fillStyle = '#2e1d14';
  c.fillRect(0, 0, S, S);
  for (let i = 0; i < 220; i++) {
    const x = Math.random() * S;
    const y = Math.random() * S;
    const r = 1 + Math.random() * 4;
    const t = Math.random();
    c.fillStyle = t < 0.5 ? `rgba(${120 + Math.random() * 50 | 0},${60 + Math.random() * 30 | 0},30,0.7)`
      : `rgba(${70 + Math.random() * 30 | 0},${40 + Math.random() * 20 | 0},26,0.8)`;
    c.beginPath();
    c.arc(x, y, r, 0, Math.PI * 2);
    c.fill();
  }
  // rivets along the seam
  for (let x = 4; x < S; x += 15) {
    c.fillStyle = 'rgba(150,140,120,0.35)';
    c.fillRect(x, 30, 3, 3);
  }
  c.fillStyle = 'rgba(0,0,0,0.45)';
  c.fillRect(0, 30, S, 2);
  grain(c, 30);
  return toTex(c);
}

/** Moss over stone: green blotches eating a grey wall. */
function moss() {
  const c = ctx2d();
  c.fillStyle = '#232a22';
  c.fillRect(0, 0, S, S);
  for (let y = 0; y < S; y += 16) {
    for (let x = 0; x < S; x += 16) {
      const v = 38 + Math.random() * 14;
      c.fillStyle = `rgb(${v},${v + 10},${v})`;
      c.fillRect(x + 1, y + 1, 14, 14);
    }
  }
  for (let i = 0; i < 70; i++) {
    const x = Math.random() * S;
    const y = Math.random() * S;
    c.fillStyle = `rgba(${40 + Math.random() * 40 | 0},${80 + Math.random() * 60 | 0},40,0.55)`;
    c.beginPath();
    c.arc(x, y, 2 + Math.random() * 6, 0, Math.PI * 2);
    c.fill();
  }
  grain(c, 20);
  return toTex(c);
}

/** A floor grate: bars over darkness. */
function grate() {
  const c = ctx2d();
  c.fillStyle = '#0a0c0e';
  c.fillRect(0, 0, S, S);
  for (let x = 0; x < S; x += 8) {
    const v = 52 + Math.random() * 18;
    c.fillStyle = `rgb(${v},${v + 4},${v + 6})`;
    c.fillRect(x, 0, 4, S);
  }
  c.fillStyle = 'rgba(0,0,0,0.5)';
  for (let y = 0; y < S; y += 32) c.fillRect(0, y, S, 3);
  grain(c, 24);
  return toTex(c);
}

/** A wall someone died against: brick with old stains. */
function stained() {
  const c = ctx2d();
  c.fillStyle = '#241a16';
  c.fillRect(0, 0, S, S);
  const rows = 8;
  const rh = S / rows;
  for (let r = 0; r < rows; r++) {
    const offset = (r % 2) * 16;
    for (let x = -32; x < S; x += 32) {
      const shade = 46 + Math.random() * 22;
      c.fillStyle = `rgb(${shade + 16},${shade - 6},${shade - 14})`;
      c.fillRect(x + offset + 1, r * rh + 1, 30, rh - 2);
    }
  }
  for (let i = 0; i < 12; i++) {
    const x = Math.random() * S;
    const y = Math.random() * S * 0.7;
    const w = 3 + Math.random() * 9;
    const h = 10 + Math.random() * 30;
    c.fillStyle = `rgba(${70 + Math.random() * 30 | 0},12,10,0.5)`;
    c.fillRect(x, y, w, h);
  }
  grain(c, 28);
  return toTex(c);
}

function door() {
  const c = ctx2d();
  c.fillStyle = '#2b2b30';
  c.fillRect(0, 0, S, S);
  c.fillStyle = '#3a3a42';
  c.fillRect(4, 0, S - 8, S);
  // hazard band
  c.save();
  c.beginPath();
  c.rect(4, 24, S - 8, 16);
  c.clip();
  c.fillStyle = '#0e0e10';
  c.fillRect(4, 24, S - 8, 16);
  c.fillStyle = '#c8951a';
  for (let x = -16; x < S; x += 16) {
    c.beginPath();
    c.moveTo(x, 40);
    c.lineTo(x + 8, 24);
    c.lineTo(x + 16, 24);
    c.lineTo(x + 8, 40);
    c.closePath();
    c.fill();
  }
  c.restore();
  // seam + rivets
  c.fillStyle = '#15151a';
  c.fillRect(31, 0, 2, S);
  c.fillStyle = '#6a6a74';
  for (let y = 6; y < S; y += 12) {
    c.fillRect(7, y, 2, 2);
    c.fillRect(S - 9, y, 2, 2);
  }
  grain(c, 14);
  return toTex(c);
}

function pad() {
  const c = ctx2d();
  c.fillStyle = '#0b1a12';
  c.fillRect(0, 0, S, S);
  c.strokeStyle = '#39ff9a';
  c.lineWidth = 3;
  c.strokeRect(8, 8, S - 16, S - 16);
  c.strokeStyle = 'rgba(57,255,154,0.45)';
  c.lineWidth = 1;
  c.strokeRect(16, 16, S - 32, S - 32);
  c.fillStyle = 'rgba(57,255,154,0.25)';
  c.fillRect(24, 24, 16, 16);
  return toTex(c);
}

function splat() {
  const c = ctx2d();
  c.clearRect(0, 0, S, S);
  for (let i = 0; i < 26; i++) {
    const r = 2 + Math.random() * 9;
    const a = Math.random() * Math.PI * 2;
    const d = Math.random() * 22;
    c.fillStyle = `rgba(${90 + Math.random() * 40},8,10,${0.5 + Math.random() * 0.4})`;
    c.beginPath();
    c.arc(32 + Math.cos(a) * d, 32 + Math.sin(a) * d, r, 0, Math.PI * 2);
    c.fill();
  }
  c.fillStyle = 'rgba(30,4,4,0.6)';
  c.beginPath();
  c.arc(32, 32, 11, 0, Math.PI * 2);
  c.fill();
  const t = new THREE.CanvasTexture(c.canvas);
  t.magFilter = THREE.NearestFilter;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function scorch() {
  const c = ctx2d();
  c.clearRect(0, 0, S, S);
  const g = c.createRadialGradient(32, 32, 2, 32, 32, 30);
  g.addColorStop(0, 'rgba(0,0,0,0.95)');
  g.addColorStop(0.55, 'rgba(20,14,10,0.7)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  c.fillStyle = g;
  c.fillRect(0, 0, S, S);
  const t = new THREE.CanvasTexture(c.canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/**
 * Build every surface material once, with canvas textures and anisotropic filtering.
 */
export function makeMaterials(maxAnisotropy = 1) {
  const aniso = Math.max(1, Math.min(8, maxAnisotropy || 1));
  const L = (map) => {
    const m = new THREE.MeshLambertMaterial({ map, vertexColors: true });
    m.userData.shared = true;
    return m;
  };
  const mats = {
    'wall_brick': L(brick()),
    'wall_tech': L(tech()),
    'wall_rust': L(rust()),
    'wall_moss': L(moss()),
    'wall_stained': L(stained()),
    'floor_grate': L(grate()),
    'floor_tile': L(tile()),
    'floor_plate': L(plate()),
    'ceil': L(concrete()),
    'door': L(door()),
    'pad': new THREE.MeshBasicMaterial({ map: pad(), transparent: true }),
    // the door box has no baked vertex colours, so it gets a material without them
    'door_plain': new THREE.MeshLambertMaterial({ map: door() }),
  };
  mats['door_plain'].userData.shared = true;
  mats['pad'].userData.shared = true;
  // Anisotropic filtering keeps floors and long walls from smearing at grazing
  // angles — the biggest single win for a corridor shooter's image quality.
  for (const m of Object.values(mats)) if (m.map) m.map.anisotropy = aniso;
  return mats;
}

/**
 * The two impact decal textures: scorch and blood.
 */
export function makeDecalTextures() {
  return { blood: splat(), scorch: scorch(), spark: scorch() };
}
