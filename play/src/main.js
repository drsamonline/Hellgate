// ---------------------------------------------------------------------------
// MAIN — bootstrap, input, wave flow, render loop.
// ---------------------------------------------------------------------------

import * as THREE from 'three';
import { generateLevel, raycastWalls, floorHeightAt, CELL } from './level.js';
import { buildLevelMeshes } from './levelmesh.js';
import { makeMaterials, makeDecalTextures } from './textures.js';
import { Player } from './player.js';
import { Weapons, WEAPONS } from './weapons.js';
import { EnemyManager } from './enemies.js';
import { Projectiles } from './projectiles.js';
import { Effects } from './effects.js';
import { HUD } from './hud.js';
import { Sfx } from './audio.js';
import { loadSettings, saveSettings, clampSettings } from './settings.js';
import { CLASSES, getClass } from './classes.js';
import { Powers } from './powers.js';
import { Story } from './story.js';
import { ZONES, zoneById, loadProgress, clearZone, isUnlocked } from './world.js';
import { Props } from './props.js';
import { Companion } from './companion.js';
import { initTouch, isTouchDevice } from './touch.js';
import { Lore } from './lore.js';

// ---------------------------------------------------------------- renderer --
const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight, false);
renderer.outputColorSpace = THREE.SRGBColorSpace;
// A renderer-level grade in place of castle-valley's post filter: filmic tone
// mapping compresses the highlights instead of clipping them, which is what
// stops the muzzle flashes and the exit pad from going pure white.
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.45;
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

function newScene(z) {
  const fog = z ? z.fog : 0x07070a;
  const s = new THREE.Scene();
  s.background = new THREE.Color(fog);
  s.fog = new THREE.Fog(fog, 9, 32);
  s.add(new THREE.AmbientLight(0xffffff, z ? z.ambient : 0.55));
  s.add(new THREE.HemisphereLight(z ? z.sky : 0x9fb4c8, z ? z.ground : 0x6a5540, 0.95));
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
const progress = loadProgress();

// A run in progress: written at the start of every wave, cleared on death or on
// clearing a zone, offered as Continue on the title screen.
const SAVE_KEY = 'hellgate.save';

function saveRun() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      zoneId: zone.id,
      seed: game.seed,
      wave: game.wave,
      score: game.score,
      kills: game.kills,
      classId: game.classId,
      hp: Math.round(player.health),
      armor: Math.round(player.armor),
      ammo: { ...player.ammo },
      ts: Date.now(),
    }));
  } catch (e) { /* private mode */ }
}

function loadRun() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}

function clearRun() {
  try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ }
}
const TOUCH = isTouchDevice();
const powers = new Powers();
const story = new Story();
let props = null;
let companion = null;
let lore = null;
let touchCleanup = null;
let zone = ZONES[0];

// One multiplier table, three presets. Enemy hp and damage scale here; the wave
// size scales in EnemyManager.spawnWave.
// Between zones you pick one. They stack for the rest of the session.
const UPGRADES = [
  { id: 'damage', name: 'KILLING EDGE', blurb: '+15% weapon damage' },
  { id: 'hp', name: 'THICKER HIDE', blurb: '+25 max health' },
  { id: 'energy', name: 'DEEP WELL', blurb: '+30% energy regeneration' },
  { id: 'cooldown', name: 'FAST HANDS', blurb: '-15% power cooldowns' },
  { id: 'speed', name: 'LIGHT STEP', blurb: '+10% movement speed' },
  { id: 'armour', name: 'PLATE', blurb: '+20 starting armour' },
];

const DIFF_MULT = {
  easy: { hp: 0.8, dmg: 0.7, count: 0.75 },
  normal: { hp: 1, dmg: 1, count: 1 },
  hard: { hp: 1.3, dmg: 1.25, count: 1.3 },
};

const game = {
  state: 'title',       // title | intro | class | map | playing | paused | dead | cleared
  zoneId: 'gate',
  classId: settings.classId,
  wavesTarget: 3,
  relics: [],
  relicsTotal: 0,
  sideDone: false,
  buffs: { damage: 0, speed: 0, shield: 0 },
  upgrades: {},
  wave: 0,
  kills: 0,
  waveKills: 0,
  score: 0,
  waveStart: 0,
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
  move: { x: 0, y: 0 },
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

// Adaptive resolution, in the manner of castle-valley: draw at the screen's own
// pixels until frames get slow, then give up pixels instead of frame rate.
const RATIO_CAP = Math.min(window.devicePixelRatio || 1, 1.5);
const perf = { ratio: RATIO_CAP, acc: 0, n: 0, min: 0.7 };

function adaptResolution(dt) {
  perf.acc += dt;
  perf.n++;
  if (perf.acc < 1) return;
  const avg = perf.acc / perf.n;
  perf.acc = 0;
  perf.n = 0;
  let r = perf.ratio;
  if (avg > 0.021 && r > perf.min) r = Math.max(perf.min, r - 0.15);
  else if (avg < 0.0135 && r < RATIO_CAP) r = Math.min(RATIO_CAP, r + 0.1);
  if (Math.abs(r - perf.ratio) > 0.001) {
    perf.ratio = r;
    renderer.setPixelRatio(r);
    // grass is the first thing to go when the machine is struggling: it is the
    // cheapest visual and the most instances
    if (props) props.setQuality(r >= 1.0 ? 1 : 0);
  }
}

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

function buildRun(seed, zoneDef) {
  disposeRun();
  zone = zoneDef || zone;
  game.zoneId = zone.id;
  game.seed = seed;
  game.wave = 0;
  game.kills = 0;
  game.waveKills = 0;
  game.score = 0;
  game.waveStart = 0;
  game.hasKey = false;
  game.exitOpen = false;
  game.warnedKey = false;
  game.pickups = [];
  game.keycard = null;

  scene = newScene(zone);
  level = generateLevel(seed);
  level.doorOpen = false;
  // the zone decides the palette: same generator, different surface
  for (const c of level.cells) {
    if (c.solid) continue;
    c.wall = zone.wall;
    c.floorTex = zone.floor;
  }

  const mats = getMats();
  mats['pad'].color.setHex(0x552222);
  mats['pad'].opacity = 1;
  levelMeshes = buildLevelMeshes(level, mats);
  scene.add(levelMeshes.group);

  effects = new Effects(scene, getDecals());
  projectiles = new Projectiles(scene, level, effects, audio);
  projectiles.onKill = () => { game.kills++; };
  enemies = new EnemyManager(scene, level, effects, audio);
  enemies.diff = DIFF_MULT[settings.difficulty] || DIFF_MULT.normal;
  enemies.onKill = () => { game.kills++; game.waveKills++; };

  props = new Props(scene, level, zone);
  lore = new Lore(scene, level, zone);
  companion = new Companion(scene, level, effects, audio);

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

  game.wavesTarget = zone.boss ? 4 : 3;
  spawnRelics(zone.relics || 0);
  applyClass(game.classId);
  applySettings();
  startWave(1);
}

function resumeRun(save) {
  audio.init();
  zone = zoneById(save.zoneId);
  game.zoneId = zone.id;
  buildRun(save.seed, zone);
  applyClass(save.classId);
  game.score = save.score || 0;
  game.kills = save.kills || 0;
  player.health = Math.min(getClass(save.classId).hp, save.hp || getClass(save.classId).hp);
  player.armor = save.armor || 0;
  if (save.ammo) Object.assign(player.ammo, save.ammo);
  startWave(Math.max(1, save.wave || 1));
  game.state = 'playing';
  hud.setVisible(true);
  hideScreens();
  requestLock();
  hud.toast('RESUMED  ·  ' + zone.name + '  ·  WAVE ' + game.wave, 2.4);
  clock.getDelta();
}

// ---- class ---------------------------------------------------------------
function syncHud() {
  hud.lastHealth = -1;
  hud.lastArmor = -1;
  hud.lastAmmo = -1;
  hud.lastWeapon = '';
  hud.slotSig = '';
}

function recomputeStats() {
  const def = getClass(game.classId);
  const u = game.upgrades;
  player.baseDamage = def.damage * (1 + 0.15 * (u.damage || 0));
  player.baseSpeed = def.speed * (1 + 0.1 * (u.speed || 0));
  player.maxHp = def.hp + 25 * (u.hp || 0);
  player.damageMul = player.baseDamage;
  player.speedMul = player.baseSpeed;
  powers.regenMul = 1 + 0.3 * (u.energy || 0);
  powers.cdMul = Math.pow(0.85, u.cooldown || 0);
  player.health = Math.min(player.health, player.maxHp);
}

function applyClass(classId) {
  const def = getClass(classId);
  game.classId = def.id;
  settings.classId = def.id;
  saveSettings(settings);
  recomputeStats();
  player.health = player.maxHp;
  player.armor = def.armor + 20 * (game.upgrades.armour || 0);
  weapons.select(def.weapon, true);
  weapons.cd = 0;
  powers.equip(def);
  if (companion) companion.spawn(player);
  syncHud();
}

// ---- relics: the side objective -----------------------------------------
function spawnRelics(n) {
  clearRelics();
  game.relicsTotal = n;
  game.sideDone = false;
  if (!n) return;
  const pool = level.openCells.filter(
    (c) => c.room >= 0 && c.room !== level.exitRoom && Math.hypot(c.wx - level.spawn.x, c.wz - level.spawn.z) > 8
  );
  const use = pool.length ? pool : level.openCells;
  for (let i = 0; i < n; i++) {
    const c = use[Math.floor(Math.random() * use.length)];
    const mesh = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.26, 0),
      new THREE.MeshBasicMaterial({ color: 0xc77dff })
    );
    const baseY = (level.cells[level.idx(c.x, c.z)] || { floor: 0 }).floor + 0.7;
    mesh.position.set(c.wx, baseY, c.wz);
    scene.add(mesh);
    game.relics.push({ mesh, x: c.wx, z: c.wz, baseY, t: Math.random() * 6 });
  }
}

function clearRelics() {
  for (const r of game.relics) {
    scene.remove(r.mesh);
    r.mesh.geometry.dispose();
    r.mesh.material.dispose();
  }
  game.relics.length = 0;
}

function updateRelics(dt) {
  for (let i = game.relics.length - 1; i >= 0; i--) {
    const r = game.relics[i];
    r.t += dt;
    r.mesh.rotation.y += dt * 1.6;
    r.mesh.position.y = r.baseY + Math.sin(r.t * 2.4) * 0.1;
    if (Math.hypot(r.x - player.pos.x, r.z - player.pos.z) < 1.2) {
      game.score += 150;
      effects.burst({ x: r.x, y: r.baseY, z: r.z }, 0xc77dff, 14, 3, 0.5, 3);
      audio.play('key', { x: r.x, z: r.z });
      scene.remove(r.mesh);
      r.mesh.geometry.dispose();
      r.mesh.material.dispose();
      game.relics.splice(i, 1);
      if (!game.relics.length) {
        game.sideDone = true;
        game.score += 400;
        hud.toast('SIDE OBJECTIVE COMPLETE  +400', 2.4);
      } else {
        hud.toast('RELIC  ' + (game.relicsTotal - game.relics.length) + '/' + game.relicsTotal);
      }
    }
  }
}

function startWave(n) {
  game.wave = n;
  game.waveKills = 0;
  game.waveStart = elapsed;
  game.hasKey = false;
  game.exitOpen = false;
  game.warnedKey = false;
  level.doorOpen = false;
  levelMeshes.doorMeshes.forEach((m) => { m.visible = true; });
  getMats()['pad'].color.setHex(0x552222);

  clearPickups();
  enemies.clear(); // defensive: a wave always starts from an empty arena
  enemies.spawnWave(n, player.pos, { boss: !!zone.boss, waves: game.wavesTarget });
  spawnPickups(n);
  if (n >= 3) spawnKeycard();
  saveRun();

  hud.toast('WAVE ' + n, 2);
  audio.play('wave');
}

function applySettings() {
  camera.fov = settings.fov;
  camera.updateProjectionMatrix();
  player.sensitivity = settings.sensitivity;
  player.reducedMotion = settings.reducedMotion;
  if (effects) effects.reducedMotion = settings.reducedMotion;
  if (enemies) enemies.diff = DIFF_MULT[settings.difficulty] || DIFF_MULT.normal;
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
  const df = document.getElementById('setDiff');
  if (df) df.value = settings.difficulty;
}

function changeSetting(key, value) {
  settings[key] = value;
  clampSettings(settings);
  saveSettings(settings);
  applySettings();
}

// -------------------------------------------------------------------- pickups

const PICKUP_DEFS = {
  damage: {
    color: 0xff8a3d,
    geo: () => new THREE.BoxGeometry(0.3, 0.3, 0.3),
    label: 'DAMAGE x1.5',
    apply: () => { game.buffs.damage = 20; audio.play('key'); },
  },
  speed: {
    color: 0x7fd6ff,
    geo: () => new THREE.OctahedronGeometry(0.2, 0),
    label: 'HASTE x1.25',
    apply: () => { game.buffs.speed = 20; audio.play('key'); },
  },
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
      audio.play('pickup', { x: p.x, z: p.z });
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
      audio.play('key', { x: k.x, z: k.z });
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
  // score: kills this wave, a bonus for the wave, and a shrinking time bonus
  const secs = Math.max(0, elapsed - game.waveStart);
  const timeBonus = Math.max(0, Math.round((45 - secs) * 10));
  const gained = game.waveKills * 50 + game.wave * 100 + timeBonus;
  game.score += gained;
  game.exitOpen = true;
  level.doorOpen = true;
  levelMeshes.doorMeshes.forEach((m) => { m.visible = false; });
  getMats()['pad'].color.setHex(0x39ff9a);
  audio.play('door');
  effects.addShake(0.3);
  hud.toast('EXIT OPEN  +' + gained, 2.2);
}

function checkWave() {
  if (game.exitOpen) {
    const d = Math.hypot(player.pos.x - level.exit.x, player.pos.z - level.exit.z);
    if (d < 1.15) {
      audio.play('switch');
      if (game.wave >= game.wavesTarget) zoneCleared();
      else startWave(game.wave + 1);
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

function beginZone(zoneDef) {
  audio.init();
  if (!zoneDef || zoneDef.id === ZONES[0].id) game.upgrades = {};
  zone = zoneDef || zone;
  game.zoneId = zone.id;
  try { history.replaceState(null, '', '?zone=' + encodeURIComponent(zone.id)); } catch (e) { /* no history */ }
  buildRun(zone.seed, zone);
  game.state = 'intro';
  hud.setVisible(false);
  showScreen('intro');
  story.start(camera, level, () => showClassScreen());
  clock.getDelta();
}

function showClassScreen() {
  game.state = 'class';
  renderClassCards();
  showScreen('class');
}

function renderClassCards() {
  const wrap = document.getElementById('classCards');
  if (!wrap) return;
  wrap.innerHTML = CLASSES.map((c) => `
    <button class="card classcard" data-class="${c.id}">
      <span class="n">${c.hp} HP · ${c.armor} ARMOUR</span>
      <h3>${c.name}</h3>
      <p>${c.blurb}</p>
      <span class="pips">${c.powers.map((p) => p.toUpperCase()).join(' · ')}</span>
    </button>`).join('');
  wrap.querySelectorAll('[data-class]').forEach((el) => {
    el.addEventListener('click', () => chooseClass(el.getAttribute('data-class')));
  });
}

function chooseClass(id) {
  applyClass(id);
  game.state = 'playing';
  hud.setVisible(true);
  hideScreens();
  requestLock();
  hud.toast(getClass(id).name + '  ·  ' + zone.name, 2.4);
  clock.getDelta();
}

function showZoneMap() {
  game.state = 'map';
  hud.setVisible(false);
  const wrap = document.getElementById('zoneList');
  if (wrap) {
    wrap.innerHTML = ZONES.map((z, i) => {
      const open = isUnlocked(progress, i);
      const done = progress.cleared.includes(z.id);
      const best = progress.best[z.id] || 0;
      return `<button class="zonerow ${open ? '' : 'locked'}" data-zone="${z.id}" ${open ? '' : 'disabled'}>
        <span class="zi">${String(i + 1).padStart(2, '0')}</span>
        <span class="zn">${z.name}</span>
        <span class="zb">${open ? z.blurb : 'Locked'}</span>
        <span class="zs">${done ? 'CLEARED' : ''}${best ? ' · ' + best : ''}</span>
      </button>`;
    }).join('');
    wrap.querySelectorAll('[data-zone]').forEach((el) => {
      el.addEventListener('click', () => {
        const z = zoneById(el.getAttribute('data-zone'));
        if (z) beginZone(z);
      });
    });
  }
  showScreen('map');
}

function openLore() {
  if (game.state !== 'playing' || !lore) return;
  const r = lore.readNear();
  if (!r) return;
  game.state = 'lore';
  const t = document.getElementById('loreTitle');
  const b = document.getElementById('loreBody');
  if (t) t.textContent = r.entry.title;
  if (b) b.textContent = r.entry.lines.join('\n\n');
  if (r.fresh) {
    game.score += 75;
    hud.toast('TERMINAL READ  +75', 1.8);
  }
  showScreen('lore');
  releaseLock();
}

function closeLore() {
  if (game.state !== 'lore') return;
  game.state = 'playing';
  hideScreens();
  requestLock();
  clock.getDelta();
}

function toggleInventory() {
  if (game.state === 'inventory') {
    game.state = 'playing';
    hideScreens();
    requestLock();
    clock.getDelta();
    return;
  }
  if (game.state !== 'playing') return;
  game.state = 'inventory';
  renderInventory();
  showScreen('inventory');
  releaseLock();
}

function renderInventory() {
  const el = document.getElementById('invBody');
  if (!el) return;
  const def = getClass(game.classId);
  const w = WEAPONS.map((wep, i) => {
    const on = i === weapons.current;
    return `<li class="${on ? 'on' : ''}"><b>${wep.name}</b><span>${player.ammo[wep.ammo] ?? 0} ${wep.ammo}</span>${on ? '<i>equipped</i>' : ''}</li>`;
  }).join('');
  const pw = powers.slots.map((p) => {
    const cd = powers.cd[p.id] || 0;
    return `<li class="${cd > 0 ? 'cool' : ''}"><b>${p.name}</b><span>${p.key} · ${p.cost} energy</span><i>${cd > 0 ? Math.ceil(cd) + 's' : 'ready'}</i></li>`;
  }).join('');
  const buffs = Object.entries(game.buffs).filter(([, v]) => v > 0)
    .map(([k, v]) => `<li><b>${k.toUpperCase()}</b><span>${Math.ceil(v)}s</span></li>`).join('') || '<li class="dim"><b>none</b></li>';
  el.innerHTML = `
    <div class="invcol">
      <h4>${def.name}</h4>
      <ul><li><b>HEALTH</b><span>${Math.round(player.health)}/${def.hp}</span></li>
      <li><b>ARMOUR</b><span>${Math.round(player.armor)}</span></li>
      <li><b>ENERGY</b><span>${Math.round(powers.energy)}/${powers.maxEnergy}</span></li></ul>
      <h4>WEAPONS</h4><ul>${w}</ul>
    </div>
    <div class="invcol">
      <h4>POWERS</h4><ul>${pw}</ul>
      <h4>BUFFS</h4><ul>${buffs}</ul>
    </div>
    <div class="invcol">
      <h4>${zone.name}</h4>
      <ul>
        <li><b>WAVE</b><span>${game.wave}/${game.wavesTarget}</span></li>
        <li><b>SCORE</b><span>${game.score}</span></li>
        <li><b>KILLS</b><span>${game.kills}</span></li>
        <li><b>RELICS</b><span>${game.relicsTotal - game.relics.length}/${game.relicsTotal}</span></li>
      </ul>
    </div>`;
}

function zoneCleared() {
  game.state = 'cleared';
  releaseLock();
  clearZone(progress, zone.id, game.score);
  clearRun();
  const el = document.getElementById('clearedStats');
  if (el) {
    el.innerHTML =
      `ZONE <b>${zone.name}</b><br />SCORE <b>${game.score}</b><br />KILLS <b>${game.kills}</b><br />` +
      `RELICS <b>${game.relicsTotal - game.relics.length}/${game.relicsTotal}</b>`;
  }
  hud.setVisible(false);
  showScreen('cleared');
  audio.play('wave');
  renderUpgrades();
}

function renderUpgrades() {
  const wrap = document.getElementById('upgradeCards');
  if (!wrap) return;
  const pool = UPGRADES.slice();
  const picks = [];
  for (let i = 0; i < 3 && pool.length; i++) {
    picks.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  }
  wrap.innerHTML = picks.map((u) => `
    <button class="card upgradecard" data-up="${u.id}">
      <span class="n">UPGRADE</span>
      <h3>${u.name}</h3>
      <p>${u.blurb}</p>
    </button>`).join('');
  wrap.querySelectorAll('[data-up]').forEach((el) => {
    el.addEventListener('click', () => takeUpgrade(el.getAttribute('data-up')));
  });
}

function takeUpgrade(id) {
  game.upgrades[id] = (game.upgrades[id] || 0) + 1;
  recomputeStats();
  audio.play('pickup');
  showZoneMap();
}

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
  clearRun();
  input.fire = false;
  audio.play('dead');
  if (document.pointerLockElement) document.exitPointerLock();

  const wavesSurvived = Math.max(0, game.wave - 1);
  const prev = game.best;
  const prevScore = prev ? prev.score || 0 : -1;
  if (!prev || game.score > prevScore || (game.score === prevScore && wavesSurvived > prev.waves)) {
    game.best = { waves: wavesSurvived, kills: game.kills, score: game.score, seed: game.seed };
    saveBest(game.best);
  }

  document.getElementById('stats').innerHTML =
    `SCORE <b>${game.score}</b><br />` +
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

// Releasing the pointer on purpose must not be mistaken for the player pressing
// Escape: the change event arrives a frame later, when the state may be back to
// 'playing' again (reading a terminal does exactly that).
let lockIntentional = false;
let lockPendingAt = 0;

function releaseLock() {
  lockIntentional = true;
  if (document.pointerLockElement) document.exitPointerLock();
}

function requestLock() {
  if (TOUCH) return; // there is no pointer lock on a touch device, and asking for one fails
  if (document.pointerLockElement === canvas) return;
  if (typeof canvas.requestPointerLock !== 'function') return;
  lockPendingAt = performance.now();
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
  if (TOUCH) return; // losing a lock that touch never took must not pause the run
  if (input.locked) return;
  if (lockIntentional) {
    lockIntentional = false;
    return;
  }
  // a request that just failed (no gesture, or the browser refused) also fires
  // this event; that is not the player pausing
  if (performance.now() - lockPendingAt < 1500) return;
  if (game.state === 'playing') pauseGame();
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
  if (e.code === 'Escape' && game.state === 'inventory') {
    toggleInventory();
    e.preventDefault();
    return;
  }
  if (e.code === 'Escape' && game.state === 'lore') {
    closeLore();
    e.preventDefault();
    return;
  }
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
  if (e.code === 'KeyQ') castPower(0);
  if (e.code === 'KeyE') castPower(1);
  if (e.code === 'KeyR') castPower(2);
  if (e.code === 'KeyX') weapons.next(1);
  if (e.code === 'KeyV') openLore();
  if (e.code === 'Tab') { toggleInventory(); e.preventDefault(); }
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
  const typed = document.getElementById('seedInput').value.trim();
  const z = typed && typed !== zone.seed ? { ...zone, seed: typed } : zone;
  beginZone(z);
});
document.getElementById('storySkip')?.addEventListener('click', () => story.skip());
document.getElementById('loreClose')?.addEventListener('click', closeLore);
document.getElementById('mapBtn')?.addEventListener('click', showZoneMap);
document.getElementById('mapFromCleared')?.addEventListener('click', showZoneMap);
document.getElementById('clearedNext')?.addEventListener('click', () => {
  const i = ZONES.findIndex((z) => z.id === zone.id);
  beginZone(ZONES[Math.min(ZONES.length - 1, i + 1)]);
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
document.getElementById('setDiff').addEventListener('change', (e) => changeSetting('difficulty', e.target.value));
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

function castCtx() {
  return {
    player, level, enemies, effects, audio, camera, projectiles, hud,
    onKill: () => { game.kills++; game.waveKills++; },
  };
}

function castPower(i) {
  if (game.state !== 'playing') return;
  powers.cast(i, castCtx());
}

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
  audio.setListener(player.pos.x, player.pos.z, player.yaw);
  weapons.update(dt, player);

  if (input.fire) weapons.tryFire(fireCtx());

  powers.update(dt, player);
  player.invuln = powers.invuln;
  player.guard = powers.guard;

  // timed pickups: multipliers are recomputed from the class base every frame
  for (const k of Object.keys(game.buffs)) {
    if (game.buffs[k] > 0) game.buffs[k] = Math.max(0, game.buffs[k] - dt);
  }
  player.damageMul = (player.baseDamage || 1) * (game.buffs.damage > 0 ? 1.5 : 1);
  player.speedMul = (player.baseSpeed || 1) * (game.buffs.speed > 0 ? 1.25 : 1);

  const near = lore ? lore.update(player) : null;
  hud.setPrompt(near ? 'V  READ' : '');

  enemies.update(dt, player, projectiles);
  projectiles.update(dt, player, enemies);
  if (companion) companion.update(dt, player, enemies);
  if (props) props.update(dt, player);
  updateRelics(dt);
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
    score: game.score,
    powers,
    zone,
    relics: game.relicsTotal - game.relics.length,
    relicsTotal: game.relicsTotal,
    sideDone: game.sideDone,
    boss: enemies.boss,
    buffs: game.buffs,
    near: !!(lore && lore.near),
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
    adaptResolution(dt);
  } else if (game.state === 'intro') {
    story.update(dt, level);
  }
  if (touchCleanup && touchCleanup.setVisible) touchCleanup.setVisible(game.state === 'playing');
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

  const z = p.has('zone') ? zoneById(p.get('zone')) : zone;
  if (z) zone = z;
  const seed = p.get('seed') || zone.seed;
  game.zoneId = zone.id;
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
{
  const save = loadRun();
  const btn = document.getElementById('continueBtn');
  if (btn && save) {
    const z = zoneById(save.zoneId);
    btn.style.display = '';
    btn.textContent = 'Continue — ' + z.name + ' · wave ' + save.wave + ' · ' + (save.score || 0);
    btn.addEventListener('click', () => resumeRun(save));
  }
}
hud.setVisible(false);
if (TOUCH) {
  document.body.classList.add('has-touch');
  touchCleanup = initTouch(input, {
    jump: () => { input.jumpQueued = true; },
    fire: () => {
      if (game.state !== 'playing') return;
      input.fire = true;
      weapons.tryFire(fireCtx());
      setTimeout(() => { input.fire = false; }, 120);
    },
    power: (i) => castPower(i),
    weapon: () => weapons.next(1),
  });
}
if (!applyUrlOverrides()) hud.setVisible(false);
loop();

// exposed for console debugging and for the headless test harness
window.HG = {
  game, player, camera, hud, audio, input, settings, perf,
  powers, story, progress, zones: ZONES,
  get props() { return props; },
  get companion() { return companion; },
  get zone() { return zone; },
  beginZone, showZoneMap, showClassScreen, chooseClass, castPower, zoneCleared,
  resumeRun, saveRun, loadRun, clearRun, toggleInventory,
  takeUpgrade, UPGRADES,
  openLore, closeLore, get lore() { return lore; },
  applySettings, changeSetting, openSettings, closeSettings,
  get weapons() { return weapons; },
  get level() { return level; },
  get enemies() { return enemies; },
  get projectiles() { return projectiles; },
  get effects() { return effects; },
  get levelMeshes() { return levelMeshes; },
  startGame, pauseGame, resumeGame, applyUrlOverrides,
};
