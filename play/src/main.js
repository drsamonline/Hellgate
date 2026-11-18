// ---------------------------------------------------------------------------
// MAIN — bootstrap, input, wave flow, render loop.
// ---------------------------------------------------------------------------

import * as THREE from 'three';
import { generateLevel, raycastWalls, floorHeightAt, CELL } from './level.js';
import { buildLevelMeshes } from './levelmesh.js';
import { makeMaterials, makeDecalTextures } from './textures.js';
import { Player } from './player.js';
import { Weapons } from './weapons.js';
import { EnemyManager } from './enemies.js';
import { Projectiles } from './projectiles.js';
import { Effects } from './effects.js';
import { HUD } from './hud.js';
import { Sfx } from './audio.js';
import { loadSettings, saveSettings, clampSettings } from './settings.js';

// ---------------------------------------------------------------- renderer --
const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight, false);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.autoClear = false;

const camera = new THREE.PerspectiveCamera(76, window.innerWidth / window.innerHeight, 0.05, 90);

const weaponScene = new THREE.Scene();
const weaponCamera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.01, 5);
weaponScene.add(new THREE.AmbientLight(0xffffff, 1.5));
{
  const d = new THREE.DirectionalLight(0xfff0d8, 1.4);
  d.position.set(0.4, 1, 0.8);
  weaponScene.add(d);
}

function newScene() {
  const s = new THREE.Scene();
  s.background = new THREE.Color(0x07070a);
  s.fog = new THREE.Fog(0x07070a, 9, 32);
  s.add(new THREE.AmbientLight(0xffffff, 0.6));
  s.add(new THREE.HemisphereLight(0x9fb4c8, 0x463226, 0.85));
  const d = new THREE.DirectionalLight(0xffd9b0, 0.3);
  d.position.set(1, 2, 0.6);
  s.add(d);
  return s;
}

// ------------------------------------------------------------------- state --
let scene = newScene();
let level = null;
let levelMeshes = null;
let effects = null;
let enemies = null;
let projectiles = null;

const audio = new Sfx();
const hud = new HUD();
const player = new Player(camera);
let weapons = null;

const settings = clampSettings(loadSettings());

const game = {
  state: 'title',       // title | playing | paused | dead
  wave: 0,
  kills: 0,
  hasKey: false,
  exitOpen: false,
  warnedKey: false,
  pickups: [],
  keycard: null,
  seed: 'hellgate',
  best: loadBest(),
};

const input = {
  keys: Object.create(null),
  lookDx: 0,
  lookDy: 0,
  fire: false,
  jumpQueued: false,
  locked: false,
};

let MATS = null;
let DECALS = null;
const clock = new THREE.Clock();
let elapsed = 0;

// ------------------------------------------------------------------ run set-up

function getMats() {
  if (!MATS) MATS = makeMaterials(renderer.capabilities.getMaxAnisotropy());
  return MATS;
}

function getDecals() {
  if (!DECALS) DECALS = makeDecalTextures();
  return DECALS;
}

function disposeRun() {
  if (!scene) return;
  scene.traverse((o) => {
    const geo = o.geometry;
    if (geo && !(geo.userData && geo.userData.shared) && !geo.__disposed) {
      geo.dispose();
      geo.__disposed = true;
    }
    if (!o.material) return;
    const list = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of list) {
      if (!m || (m.userData && m.userData.shared)) continue; // cached across runs
      m.dispose();
    }
  });
}

function buildRun(seed) {
  disposeRun();
  game.seed = seed;
  game.wave = 0;
  game.kills = 0;
  game.hasKey = false;
  game.exitOpen = false;
  game.warnedKey = false;
  game.pickups = [];
  game.keycard = null;

  scene = newScene();
  level = generateLevel(seed);
  level.doorOpen = false;

  const mats = getMats();
  mats['pad'].color.setHex(0x552222);
  mats['pad'].opacity = 1;
  levelMeshes = buildLevelMeshes(level, mats);
  scene.add(levelMeshes.group);

  effects = new Effects(scene, getDecals());
  projectiles = new Projectiles(scene, level, effects, audio);
  projectiles.onKill = () => { game.kills++; };
  enemies = new EnemyManager(scene, level, effects, audio);
  enemies.onKill = () => { game.kills++; };

  player.reset(level, 0);
  // face the most open direction so the run never starts nose-to-wall
  {
    let bestYaw = 0;
    let bestD = -1;
    for (let i = 0; i < 16; i++) {
      const yaw = (i / 16) * Math.PI * 2;
      const dir = { x: -Math.sin(yaw), y: 0, z: -Math.cos(yaw) };
      const hit = raycastWalls(
        level,
        { x: player.pos.x, y: player.pos.y + 1.6, z: player.pos.z },
        dir, 30, 0.25
      );
      const d = hit ? hit.dist : 30;
      if (d > bestD) { bestD = d; bestYaw = yaw; }
    }
    player.yaw = bestYaw;
    player.syncCamera();
  }
  player.onDamage = (amt, src) => {
    hud.hurt(amt);
    hud.damageFrom(src, camera);
    audio.play('hurt');
    effects.addShake(0.22);
  };

  if (!weapons) weapons = new Weapons(weaponScene, weaponCamera, camera, effects, audio);
  weapons.effects = effects;
  weapons.audio = audio;
  weapons.select(0, true);
  weapons.cd = 0;

  applySettings();
  startWave(1);
}

function startWave(n) {
  game.wave = n;
  game.hasKey = false;
  game.exitOpen = false;
  game.warnedKey = false;
  level.doorOpen = false;
  levelMeshes.doorMeshes.forEach((m) => { m.visible = true; });
  getMats()['pad'].color.setHex(0x552222);

  clearPickups();
  enemies.clear(); // defensive: a wave always starts from an empty arena
  enemies.spawnWave(n, player.pos);
  spawnPickups(n);
  if (n >= 3) spawnKeycard();

  hud.toast('WAVE ' + n, 2);
  audio.play('wave');
}

function applySettings() {
  camera.fov = settings.fov;
  camera.updateProjectionMatrix();
  player.sensitivity = settings.sensitivity;
  player.reducedMotion = settings.reducedMotion;
  if (effects) effects.reducedMotion = settings.reducedMotion;
  audio.setVolume(settings.volume);
  audio.setMuted(settings.muted);
  syncSettingsUI();
}

function syncSettingsUI() {
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = String(val); };
  const text = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  set('setSens', settings.sensitivity);
  set('setFov', settings.fov);
  set('setVol', Math.round(settings.volume * 100));
  text('setSensVal', settings.sensitivity.toFixed(2) + '×');
  text('setFovVal', settings.fov + '°');
  text('setVolVal', Math.round(settings.volume * 100) + '%');
  const m = document.getElementById('setMotion');
  if (m) m.checked = settings.reducedMotion;
  const mu = document.getElementById('setMute');
  if (mu) mu.checked = settings.muted;
}

function changeSetting(key, value) {
  settings[key] = value;
  clampSettings(settings);
  saveSettings(settings);
  applySettings();
}

// -------------------------------------------------------------------- pickups

const PICKUP_DEFS = {
  health: { color: 0xff2f55, geo: () => new THREE.OctahedronGeometry(0.22), toast: 'HEALTH +25', apply: (p) => p.heal(25) },
  armor: { color: 0x3fa9ff, geo: () => new THREE.BoxGeometry(0.3, 0.3, 0.3), toast: 'ARMOR +25', apply: (p) => p.addArmor(25) },
  bullets: { color: 0xffd24a, geo: () => new THREE.BoxGeometry(0.3, 0.16, 0.18), toast: '+20 BULLETS', apply: (p) => { p.ammo.bullets += 20; } },
  shells: { color: 0xff8a3c, geo: () => new THREE.BoxGeometry(0.3, 0.14, 0.2), toast: '+6 SHELLS', apply: (p) => { p.ammo.shells += 6; } },
  rockets: { color: 0x8fe04a, geo: () => new THREE.BoxGeometry(0.13, 0.42, 0.13), toast: '+2 ROCKETS', apply: (p) => { p.ammo.rockets += 2; } },
};

function randomCell(minDist = 0, roomsOnly = true) {
  const pool = level.openCells.filter((c) => {
    if (roomsOnly && c.room < 0) return false;
    if (c.x === level.exit.cx && c.z === level.exit.cz) return false;
    return Math.hypot(c.wx - player.pos.x, c.wz - player.pos.z) > minDist;
  });
  const src = pool.length ? pool : level.openCells;
  return src[Math.floor(Math.random() * src.length)];
}

function spawnPickups(wave) {
  const kinds = Object.keys(PICKUP_DEFS);
  const count = 3 + Math.min(5, wave);
  for (let i = 0; i < count; i++) {
    const cell = randomCell(4);
    const kind = kinds[Math.floor(Math.random() * kinds.length)];
    addPickup(kind, cell.wx, cell.wz);
  }
}

function addPickup(kind, x, z) {
  const def = PICKUP_DEFS[kind];
  const mesh = new THREE.Mesh(def.geo(), new THREE.MeshBasicMaterial({ color: def.color }));
  const baseY = (level.cells[level.idx(Math.round(x / CELL), Math.round(z / CELL))] || { floor: 0 }).floor + 0.45;
  mesh.position.set(x, baseY, z);
  scene.add(mesh);
  game.pickups.push({ kind, mesh, x, z, baseY, t: Math.random() * 6 });
}

function clearPickups() {
  for (const p of game.pickups) {
    scene.remove(p.mesh);
    p.mesh.geometry.dispose();
    p.mesh.material.dispose();
  }
  game.pickups.length = 0;
  if (game.keycard) {
    scene.remove(game.keycard.mesh);
    game.keycard.mesh.geometry.dispose();
    game.keycard.mesh.material.dispose();
    game.keycard = null;
  }
}

function pickKeycardCell() {
  const pool = level.openCells.filter(
    (c) => c.room >= 0 && c.room !== level.exitRoom &&
      Math.hypot(c.wx - player.pos.x, c.wz - player.pos.z) > 8
  );
  const src = pool.length ? pool : level.openCells.filter((c) => c.room !== level.exitRoom);
  const use = src.length ? src : level.openCells;
  return use[Math.floor(Math.random() * use.length)];
}

function spawnKeycard() {
  // never inside the locked exit room, or the run would be unwinnable
  const cell = pickKeycardCell();
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(0.34, 0.07, 0.22),
    new THREE.MeshBasicMaterial({ color: 0xffd24a })
  );
  const baseY = (level.cells[level.idx(Math.round(cell.wx / CELL), Math.round(cell.wz / CELL))] || { floor: 0 }).floor + 0.55;
  mesh.position.set(cell.wx, baseY, cell.wz);
  scene.add(mesh);
  game.keycard = { mesh, x: cell.wx, z: cell.wz, baseY, t: 0 };
}

function updatePickups(dt) {
  for (let i = game.pickups.length - 1; i >= 0; i--) {
    const p = game.pickups[i];
    p.t += dt;
    p.mesh.rotation.y += dt * 1.8;
    p.mesh.position.y = p.baseY + Math.sin(p.t * 2.6) * 0.09;
    const d = Math.hypot(p.x - player.pos.x, p.z - player.pos.z);
    if (d < 1.1) {
      // refuse a pickup that would be wasted rather than consuming it
      if (p.kind === 'health' && player.health >= 100) continue;
      if (p.kind === 'armor' && player.armor >= 100) continue;
      PICKUP_DEFS[p.kind].apply(player);
      hud.toast(PICKUP_DEFS[p.kind].toast);
      audio.play('pickup');
      effects.burst({ x: p.x, y: p.baseY, z: p.z }, PICKUP_DEFS[p.kind].color, 8, 2.4, 0.4, 4);
      scene.remove(p.mesh);
      p.mesh.geometry.dispose();
      p.mesh.material.dispose();
      game.pickups.splice(i, 1);
    }
  }

  const k = game.keycard;
  if (k) {
    k.t += dt;
    k.mesh.rotation.y += dt * 2.2;
    k.mesh.position.y = k.baseY + Math.sin(k.t * 3) * 0.1;
    if (Math.hypot(k.x - player.pos.x, k.z - player.pos.z) < 1.2) {
      game.hasKey = true;
      hud.toast('KEYCARD ACQUIRED', 2.2);
      audio.play('key');
      effects.burst({ x: k.x, y: k.baseY, z: k.z }, 0xffd24a, 14, 3, 0.5, 4);
      scene.remove(k.mesh);
      k.mesh.geometry.dispose();
      k.mesh.material.dispose();
      game.keycard = null;
    }
  }
}

// ----------------------------------------------------------------- wave logic

function openExit() {
  game.exitOpen = true;
  level.doorOpen = true;
  levelMeshes.doorMeshes.forEach((m) => { m.visible = false; });
  getMats()['pad'].color.setHex(0x39ff9a);
  audio.play('door');
  effects.addShake(0.3);
  hud.toast('EXIT OPEN', 2.2);
}

function checkWave() {
  if (game.exitOpen) {
    const d = Math.hypot(player.pos.x - level.exit.x, player.pos.z - level.exit.z);
    if (d < 1.15) {
      audio.play('switch');
      startWave(game.wave + 1);
    }
    return;
  }
  if (enemies.aliveCount > 0) return;
  if (game.wave >= 3 && !game.hasKey) {
    if (!game.warnedKey) {
      game.warnedKey = true;
      hud.toast('FIND THE KEYCARD', 2.6);
    }
    return;
  }
  openExit();
}

// ------------------------------------------------------------------ game flow

function startGame(seed, opts = {}) {
  audio.init();
  try { history.replaceState(null, '', '?seed=' + encodeURIComponent(seed)); } catch (e) { /* no history */ }
  buildRun(seed);
  game.state = 'playing';
  hud.setVisible(true);
  hideScreens();
  if (!opts.auto) requestLock();
  clock.getDelta();
}

function pauseGame() {
  if (game.state !== 'playing') return;
  game.state = 'paused';
  input.fire = false;
  showScreen('pause');
  if (document.pointerLockElement) document.exitPointerLock();
}

function resumeGame() {
  if (game.state !== 'paused') return;
  game.state = 'playing';
  hideScreens();
  requestLock();
  clock.getDelta();
}

function gameOver() {
  if (game.state !== 'playing') return;
  game.state = 'dead';
  input.fire = false;
  audio.play('dead');
  if (document.pointerLockElement) document.exitPointerLock();

  const wavesSurvived = Math.max(0, game.wave - 1);
  const prev = game.best;
  if (!prev || wavesSurvived > prev.waves || (wavesSurvived === prev.waves && game.kills > prev.kills)) {
    game.best = { waves: wavesSurvived, kills: game.kills, seed: game.seed };
    saveBest(game.best);
  }

  document.getElementById('stats').innerHTML =
    `WAVES SURVIVED <b>${wavesSurvived}</b><br />` +
    `KILLS <b>${game.kills}</b><br />` +
    `REACHED WAVE <b>${game.wave}</b><br />` +
    `SEED <b>${escapeHtml(game.seed)}</b>`;
  showScreen('gameover');
  hud.setVisible(false);
}

function toMenu() {
  try { history.replaceState(null, '', location.pathname); } catch (e) { /* no history */ }
  game.state = 'title';
  hud.setVisible(false);
  showScreen('title');
  refreshBest();
}

function showScreen(id) {
  for (const el of document.querySelectorAll('.screen')) el.classList.toggle('on', el.id === id);
}

function hideScreens() {
  for (const el of document.querySelectorAll('.screen')) el.classList.remove('on');
}

function refreshBest() {
  const el = document.getElementById('best');
  const b = game.best;
  el.innerHTML = b
    ? `BEST RUN — WAVES <b>${b.waves}</b> · KILLS <b>${b.kills}</b> · SEED <b>${escapeHtml(b.seed || '')}</b>`
    : 'NO RUN RECORDED YET';
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function loadBest() {
  try {
    const raw = localStorage.getItem('hellgate.best');
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

function saveBest(b) {
  try {
    localStorage.setItem('hellgate.best', JSON.stringify(b));
  } catch (e) { /* private mode: ignore */ }
}

// --------------------------------------------------------------------- input

function requestLock() {
  if (document.pointerLockElement === canvas) return;
  if (typeof canvas.requestPointerLock !== 'function') return;
  const plain = () => {
    try { canvas.requestPointerLock(); } catch (e) { /* no lock available */ }
  };
  try {
    // unadjustedMovement asks for raw input (no OS mouse acceleration), which
    // makes aiming predictable. Not every browser supports it, hence the retry.
    const p = canvas.requestPointerLock({ unadjustedMovement: true });
    if (p && typeof p.catch === 'function') p.catch(plain);
  } catch (e) {
    plain();
  }
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden && game.state === 'playing') pauseGame();
});

document.addEventListener('pointerlockchange', () => {
  input.locked = document.pointerLockElement === canvas;
  if (!input.locked && game.state === 'playing') pauseGame();
});

window.addEventListener('mousemove', (e) => {
  if (game.state !== 'playing') return;
  // pointer lock gives movementX; without it (iframes, preview panes) we use the
  // same deltas, which browsers still report for plain mouse movement.
  input.lookDx += e.movementX || 0;
  input.lookDy += e.movementY || 0;
});

canvas.addEventListener('wheel', (e) => {
  if (game.state !== 'playing') return;
  e.preventDefault();
  weapons.next(e.deltaY > 0 ? 1 : -1);
}, { passive: false });

function toggleFullscreen() {
  try {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen();
  } catch (e) { /* blocked in an iframe */ }
}

canvas.addEventListener('mousedown', (e) => {
  if (e.button !== 0) return;
  if (game.state === 'playing') {
    input.fire = true;
    if (!input.locked) requestLock();
  }
});
window.addEventListener('mouseup', () => { input.fire = false; });
window.addEventListener('blur', () => { input.fire = false; input.keys = Object.create(null); });

window.addEventListener('keydown', (e) => {
  if (e.code === 'Escape') {
    if (game.state === 'playing') { pauseGame(); return; }
    if (game.state === 'paused') { resumeGame(); return; }
  }
  if (game.state !== 'playing') return;
  input.keys[e.code] = true;
  if (e.code === 'Space') { input.jumpQueued = true; e.preventDefault(); }
  if (e.code === 'Digit1') weapons.select(0);
  if (e.code === 'Digit2') weapons.select(1);
  if (e.code === 'Digit3') weapons.select(2);
  if (e.code === 'KeyQ') weapons.next(-1);
  if (e.code === 'KeyE') weapons.next(1);
  if (e.code === 'KeyF') toggleFullscreen();
  if (e.code === 'KeyM') {
    changeSetting('muted', !settings.muted);
    hud.toast(settings.muted ? 'MUTED' : 'SOUND ON');
  }
});

window.addEventListener('keyup', (e) => {
  input.keys[e.code] = false;
});

document.getElementById('startBtn').addEventListener('click', () => {
  const seed = document.getElementById('seedInput').value.trim() || 'hellgate';
  startGame(seed);
});
document.getElementById('seedInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') document.getElementById('startBtn').click();
});
document.getElementById('resumeBtn').addEventListener('click', resumeGame);

// ---- settings screen ------------------------------------------------------
let settingsReturn = 'title';

function openSettings(from) {
  settingsReturn = from;
  syncSettingsUI();
  if (game.state === 'playing') pauseGame();
  showScreen('settings');
}

function closeSettings() {
  showScreen(settingsReturn);
  if (settingsReturn === 'pause' && game.state === 'paused') return;
}

document.getElementById('settingsBtnTitle').addEventListener('click', () => openSettings('title'));
document.getElementById('settingsBtnPause').addEventListener('click', () => openSettings('pause'));
document.getElementById('settingsBack').addEventListener('click', closeSettings);
document.getElementById('restartBtn').addEventListener('click', () => {
  hideScreens();
  startGame(game.seed);
});

document.getElementById('setSens').addEventListener('input', (e) => changeSetting('sensitivity', Number(e.target.value)));
document.getElementById('setFov').addEventListener('input', (e) => changeSetting('fov', Number(e.target.value)));
document.getElementById('setVol').addEventListener('input', (e) => changeSetting('volume', Number(e.target.value) / 100));
document.getElementById('setMotion').addEventListener('change', (e) => changeSetting('reducedMotion', e.target.checked));
document.getElementById('setMute').addEventListener('change', (e) => changeSetting('muted', e.target.checked));
document.getElementById('retryBtn').addEventListener('click', () => startGame(game.seed));
document.getElementById('menuBtn').addEventListener('click', toMenu);

// ---- debug overlay (Backquote or F3) --------------------------------------
const dbg = { el: document.getElementById('debug'), on: false, acc: 0, frames: 0 };

window.addEventListener('keydown', (e) => {
  if (e.code === 'Backquote' || e.code === 'F3') {
    e.preventDefault();
    dbg.on = !dbg.on;
    dbg.el.classList.toggle('on', dbg.on);
  }
});

function updateDebug(dt) {
  if (!dbg.on) return;
  dbg.acc += dt;
  dbg.frames++;
  if (dbg.acc < 0.25) return;
  const fps = Math.round(dbg.frames / dbg.acc);
  const st = lastRenderStats;
  dbg.el.textContent =
    `${fps} fps · ${st.calls} calls · ${(st.tris / 1000).toFixed(1)}k tris · seed ${game.seed}`;
  dbg.acc = 0;
  dbg.frames = 0;
}

window.addEventListener('resize', () => {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  weaponCamera.aspect = w / h;
  weaponCamera.updateProjectionMatrix();
});

// ----------------------------------------------------------------- main loop

function fireCtx() {
  return {
    player,
    level,
    enemies,
    projectiles,
    hud,
    onKill: () => { game.kills++; },
  };
}

function update(dt) {
  player.look(input.lookDx, input.lookDy);
  input.lookDx = 0;
  input.lookDy = 0;

  player.update(dt, input, level);
  weapons.update(dt, player);

  if (input.fire) weapons.tryFire(fireCtx());

  enemies.update(dt, player, projectiles);
  projectiles.update(dt, player, enemies);
  effects.update(dt);
  updatePickups(dt);
  checkWave();

  // exit pad pulse
  const pad = levelMeshes.exitPad;
  pad.material.opacity = game.exitOpen ? 0.65 + Math.sin(elapsed * 5) * 0.3 : 0.28;

  hud.update(dt, player, weapons, {
    wave: game.wave,
    kills: game.kills,
    enemies: enemies.aliveCount,
    hasKey: game.hasKey,
    exitOpen: game.exitOpen,
    exit: level.exit,
    camera,
  });

  if (!player.alive) gameOver();
}

// draw calls / triangles for the debug overlay. renderer.info resets on every
// render() call, so the level pass is captured before the weapon pass runs.
const lastRenderStats = { calls: 0, tris: 0 };

function render() {
  renderer.clear();
  renderer.render(scene, camera);
  const info = renderer.info.render;
  const levelCalls = info.calls;
  const levelTris = info.triangles;
  renderer.clearDepth();
  renderer.render(weaponScene, weaponCamera);
  lastRenderStats.calls = levelCalls + info.calls;
  lastRenderStats.tris = levelTris + info.triangles;
}

function loop() {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, clock.getDelta());
  elapsed += dt;

  if (game.state === 'playing') {
    update(dt);
    if (effects) effects.applyShake(camera);
  }
  render();
  updateDebug(dt);
}

// ----------------------------------------------------------------- URL hooks
// ?auto=1            start a run immediately (no click, no pointer lock)
// &seed=name         pick the map
// &wave=N            jump to a wave
// &cam=x,z,yaw,pitch place the camera (for screenshots and demos)
// &nohud=1           hide the HUD
// These are also how the screenshot tool and any kiosk/demo link works.
function applyUrlOverrides() {
  const p = new URLSearchParams(location.search);

  // ?seed=name without auto just prefills the title screen, so the landing page
  // can hand a seed over to the game.
  if (!p.has('auto')) {
    if (p.has('seed')) {
      const el = document.getElementById('seedInput');
      if (el) el.value = p.get('seed').slice(0, 24);
    }
    return false;
  }

  const seed = p.get('seed') || 'hellgate';
  startGame(seed, { auto: true });

  const wave = parseInt(p.get('wave') || '1', 10);
  if (wave > 1) {
    startWave(Math.min(40, wave));
    game.state = 'playing';
  }

  const cam = (p.get('cam') || '').split(',').map(Number);
  if (cam.length >= 4 && cam.every((n) => Number.isFinite(n))) {
    player.pos.set(cam[0], 0, cam[1]);
    player.pos.y = floorHeightAt(level, cam[0], cam[1]);
    player.yaw = (cam[2] * Math.PI) / 180;
    player.pitch = (cam[3] * Math.PI) / 180;
    player.eyeY = player.pos.y + 1.62;
    player.syncCamera();
  }
  if (p.get('nohud') === '1') hud.setVisible(false);
  return true;
}

// --------------------------------------------------------------------- boot

refreshBest();
document.getElementById('seedInput').value = 'hellgate';
hud.setVisible(false);
if (!applyUrlOverrides()) hud.setVisible(false);
loop();

// exposed for console debugging and for the headless test harness
window.HG = {
  game, player, camera, hud, audio, input, settings,
  applySettings, changeSetting, openSettings, closeSettings,
  get weapons() { return weapons; },
  get level() { return level; },
  get enemies() { return enemies; },
  get projectiles() { return projectiles; },
  get effects() { return effects; },
  get levelMeshes() { return levelMeshes; },
  startGame, pauseGame, resumeGame, applyUrlOverrides,
};
