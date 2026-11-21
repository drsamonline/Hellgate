// ---------------------------------------------------------------------------
// MAIN — bootstrap, input, wave flow, render loop.
// ---------------------------------------------------------------------------

import * as THREE from 'three';
import { makeRng } from './rng.js';
import { generateLevel, raycastWalls, floorHeightAt, hasLineOfSight, isBlocked, CELL } from './level.js';
import { buildLevelMeshes } from './levelmesh.js';
import { makeMaterials, makeDecalTextures } from './textures.js';
import { Player } from './player.js';
import { Weapons, WEAPONS } from './weapons.js';
import { EnemyManager } from './enemies.js';
import { Projectiles } from './projectiles.js';
import { Effects, glowSprite } from './effects.js';
import { HUD } from './hud.js';
import { Sfx } from './audio.js';
import { loadSettings, saveSettings, clampSettings } from './settings.js';
import { CLASSES, getClass } from './classes.js';
import { Powers } from './powers.js';
import { Story, epilogueFor } from './story.js';
import { ZONES, zoneById, loadProgress, clearZone, isUnlocked } from './world.js';
import { Props } from './props.js';
import { Companion } from './companion.js';
import { initTouch, isTouchDevice } from './touch.js';
import { Lore } from './lore.js';
import { Minimap } from './minimap.js';
import { Bloom } from './bloom.js';
import { Music } from './music.js';
import * as Items from './items.js';
import { Cinematic } from './cinematic.js';
import { TRINKETS, SLOTS, SPARE_VALUE, trinketById, rollDrop, sumEffects } from './loot.js';

// ---------------------------------------------------------------- renderer --
const canvas = document.getElementById('game');
let fillLight = null;

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
  // a shorter, lighter fog: the far wall should be dim, not invisible
  s.fog = new THREE.Fog(fog, 14, 46);
  // never darker than this, whatever the zone says: a corridor you cannot see
  // is not atmospheric, it is broken
  s.add(new THREE.AmbientLight(0xffffff, Math.max(0.85, z ? z.ambient : 0.85)));
  s.add(new THREE.HemisphereLight(z ? z.sky : 0x9fb4c8, z ? z.ground : 0x6a5540, 1.25));
  // a soft light that travels with the player: the thing in front of you is lit
  // even in a room the zone light has given up on
  fillLight = new THREE.PointLight(0xfff2e0, 1.5, 30, 1.4);
  fillLight.position.set(0, 2, 0);
  s.add(fillLight);
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
window.__THREE = THREE; // for tools that measure the scene

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
      trinkets: game.trinkets.slice(),
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
let minimap = null;
let exitBeacon = null;
let bloom = null;
const music = new Music(audio);
const cinematic = new Cinematic(camera, {
  root: document.getElementById('letterbox'),
  name: document.getElementById('cineName'),
  line: document.getElementById('cineLine'),
});
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

// Game modes. Each one changes the rules, not the difficulty preset: a mode you
// can undo by dragging a slider is not a mode.
const MODES = {
  campaign: {
    name: 'CAMPAIGN',
    blurb: 'Eight zones in order. Clear a zone to unlock the next.',
    waves: null,       // the zone decides
    lives: 1,
    endless: false,
    bossRush: false,
  },
  endless: {
    name: 'ENDLESS',
    blurb: 'One zone, waves that never stop. Score until you die.',
    waves: 999,
    lives: 1,
    endless: true,
    bossRush: false,
  },
  bossrush: {
    name: 'BOSS RUSH',
    blurb: 'One wave per zone, and it is the warden every time.',
    waves: 1,
    lives: 1,
    endless: false,
    bossRush: true,
  },
  arena: {
    name: 'ARENA',
    blurb: 'One room, no exit, waves back to back. Survive the clock.',
    waves: 999,
    lives: 1,
    endless: true,
    bossRush: false,
    arena: true,
  },
  nightmare: {
    name: 'NIGHTMARE',
    blurb: 'Campaign on Hard, with the keycard every wave.',
    waves: null,
    lives: 1,
    endless: false,
    bossRush: false,
    forceHard: true,
    keyEveryWave: true,
  },
  hardcore: {
    name: 'HARDCORE',
    blurb: 'Campaign rules, but death ends the run and the save is deleted.',
    waves: null,
    lives: 1,
    endless: false,
    bossRush: false,
    noSave: true,
  },
};

let gameMode = 'campaign';

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
  weaponKills: {},
  trinkets: [],
  drops: [],
  barrels: [],
  loreChoices: {},
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
const perf = { ratio: RATIO_CAP, acc: 0, n: 0, min: 0.7, bloomDropped: false };

function adaptResolution(dt) {
  perf.acc += dt;
  perf.n++;
  if (perf.acc < 1) return;
  const avg = perf.acc / perf.n;
  perf.acc = 0;
  perf.n = 0;
  // Bloom is four passes at quarter resolution; on a phone that is the first
  // thing worth losing, and it is worth losing before the resolution does.
  if (avg > 0.026 && bloom && bloom.enabled) {
    bloom.enabled = false;
    perf.bloomDropped = true;
  } else if (perf.bloomDropped && avg < 0.014 && bloom) {
    // and it comes back when the machine turns out to be fine
    bloom.enabled = true;
    perf.bloomDropped = false;
  }

  let r = perf.ratio;
  if (avg > 0.021 && r > perf.min) r = Math.max(perf.min, r - 0.15);
  else if (avg < 0.0135 && r < RATIO_CAP) r = Math.min(RATIO_CAP, r + 0.1);
  if (Math.abs(r - perf.ratio) > 0.001) {
    perf.ratio = r;
    renderer.setPixelRatio(r);
    if (bloom) bloom.setSize(Math.floor(canvas.clientWidth * r) || 1, Math.floor(canvas.clientHeight * r) || 1);
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
  if (exitBeacon) { scene.remove(exitBeacon); exitBeacon = null; }
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
  level = generateLevel(seed, zone.shape);
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
  levelMeshes = buildLevelMeshes(level, mats, zone);
  scene.add(levelMeshes.group);

  effects = new Effects(scene, getDecals());
  projectiles = new Projectiles(scene, level, effects, audio);
  projectiles.onKill = () => { game.kills++; };
  enemies = new EnemyManager(scene, level, effects, audio);
  enemies.diff = zoneDiff();
  enemies.onKill = (e, weaponName) => {
    game.kills++;
    game.waveKills++;
    if (weaponName) {
      game.weaponKills[weaponName] = (game.weaponKills[weaponName] || 0) + 1;
    }
    if (hud && e && e.T) {
      hud.feed(
        String(e.T.label || e.type || 'ENEMY').toUpperCase(),
        weaponName || 'DOWN'
      );
    }
    if (player.leech > 0) player.heal(player.leech);
    const id = rollDrop(Math.random);
    if (id && e) dropTrinket(id, e.pos);
  };

  game.secretMeshes = (levelMeshes && levelMeshes.secretMeshes) || [];
  game.crateMeshes = (levelMeshes && levelMeshes.crateMeshes) || [];
  game.barrels = [];
  spawnBarrels();
  if (bloom) bloom.setGrade(zone.grade);

  // a light column over the exit pad: the one thing you should be able to find
  // from across a dark room without reading the HUD
  exitBeacon = glowSprite(0xff3b30, 1.0);
  exitBeacon.scale.set(1.1, 7, 1);
  exitBeacon.position.set(level.exit.x, floorHeightAt(level, level.exit.x, level.exit.z) + 3.2, level.exit.z);
  exitBeacon.material.opacity = 0.55;
  scene.add(exitBeacon);

  const mmCanvas = document.getElementById('minimap');
  if (mmCanvas) minimap = new Minimap(mmCanvas, level);
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
  // footsteps were wired into the player in 1.12.0 and never connected here: the
  // suite tested the callback, not the integration, so the game had no steps
  hud.damageNumbers = !settings.reducedMotion;
  player.onStep = (speed) => audio.play('step', null, { gain: speed > 6.5 ? 1 : 0.7 });

  // one line-of-sight test per sound, only for sounds that carry a position
  audio.occludeTest = (x, z) =>
    hasLineOfSight(level, { x: player.pos.x, y: player.pos.y + 1.5, z: player.pos.z }, { x, y: player.pos.y + 1.2, z });

  player.onDamage = (amt, src) => {
    hud.hurt(amt);
    hud.damageFrom(src, camera);
    audio.play('hurt');
    effects.addShake(0.22);
  };

  if (!weapons) weapons = new Weapons(weaponScene, weaponCamera, camera, effects, audio);
  weapons.effects = effects;
  weapons.audio = audio;

  const mode = MODES[gameMode] || MODES.campaign;
  game.mode = gameMode;
  game.wavesTarget = mode.waves != null ? mode.waves : (zone.boss ? 4 : 3);
  game.bossSeen = false;
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
  if (Array.isArray(save.trinkets)) {
    game.trinkets = save.trinkets.slice(0, SLOTS);
    recomputeStats();
  }
  startWave(Math.max(1, save.wave || 1));
  game.state = 'playing';
  audio.startDrone();
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
  const t = sumEffects(game.trinkets);
  player.baseDamage = def.damage * (1 + 0.15 * (u.damage || 0)) * (1 + (t.damage || 0));
  player.baseSpeed = def.speed * (1 + 0.1 * (u.speed || 0)) * (1 + (t.speed || 0));
  player.maxHp = def.hp + 25 * (u.hp || 0) + (t.hp || 0);
  player.damageMul = player.baseDamage;
  player.speedMul = player.baseSpeed;
  powers.regenMul = (1 + 0.3 * (u.energy || 0)) * (1 + (t.energy || 0));
  powers.cdMul = Math.pow(0.85, u.cooldown || 0);
  player.startArmourBonus = (t.armour || 0);
  player.leech = t.leech || 0;
  player.health = Math.min(player.health, player.maxHp);
}

function applyClass(classId) {
  const def = getClass(classId);
  game.classId = def.id;
  settings.classId = def.id;
  saveSettings(settings);
  recomputeStats();
  player.health = player.maxHp;
  player.grenades = 3;
  player.armor = def.armor + 20 * (game.upgrades.armour || 0) + (player.startArmourBonus || 0);
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
  const pool = level.reachableCells.filter(
    (c) => c.room >= 0 && c.room !== level.exitRoom && Math.hypot(c.wx - level.spawn.x, c.wz - level.spawn.z) > 8
  );
  const use = pool.length ? pool : level.reachableCells;
  for (let i = 0; i < n; i++) {
    const c = use[Math.floor(Math.random() * use.length)];
    const mesh = Items.relicItem();
    const baseY = (level.cells[level.idx(c.x, c.z)] || { floor: 0 }).floor + 0.7;
    mesh.position.set(c.wx, baseY, c.wz);
    scene.add(mesh);
    game.relics.push({ mesh, x: c.wx, z: c.wz, baseY, t: Math.random() * 6 });
  }
}

function clearRelics() {
  for (const r of game.relics) dropMesh(r.mesh);
  game.relics.length = 0;
}

// Doors rise out of the floor over 400 ms rather than popping out of existence.
function updateDoors(dt) {
  if (!levelMeshes || !levelMeshes.doorMeshes) return;
  for (const m of levelMeshes.doorMeshes) {
    if (!m.userData.opening) continue;
    if (m.userData.baseY == null) m.userData.baseY = m.position.y;
    m.userData.slide = Math.min(1, m.userData.slide + dt / 0.45);
    const k = m.userData.slide;
    // translate only: scaling made a shrinking slab that hung in the air when
    // the animation was interrupted by a screen change
    m.position.y = m.userData.baseY + k * (m.userData.height + 0.15);
    if (k >= 1) {
      m.visible = false;
      m.userData.opening = false;
    }
  }
}

function dropTrinket(id, pos) {
  const t = trinketById(id);
  if (!t) return;
  // a coin, a ring or a compass, so a drop looks like something you would pick up
  const mesh = Items.trinketItem(game.trinkets.length % 3);
  const y = floorHeightAt(level, pos.x, pos.z) + 0.6;
  mesh.position.set(pos.x, y, pos.z);
  scene.add(mesh);
  game.drops.push({ id, mesh, x: pos.x, z: pos.z, baseY: y, t: 0 });
}

function updateDrops(dt) {
  for (let i = game.drops.length - 1; i >= 0; i--) {
    const d = game.drops[i];
    d.t += dt;
    d.mesh.rotation.y += dt * 2;
    d.mesh.position.y = d.baseY + Math.sin(d.t * 3) * 0.08;
    if (Math.hypot(d.x - player.pos.x, d.z - player.pos.z) > 1.3) continue;

    const t = trinketById(d.id);
    if (game.trinkets.length < SLOTS) {
      game.trinkets.push(d.id);
      recomputeStats();
      hud.toast('TRINKET  ' + t.name + '  ·  ' + t.blurb, 2.2);
    } else {
      game.score += SPARE_VALUE;
      hud.toast('BELT FULL  ·  ' + t.name + ' sold for ' + SPARE_VALUE, 2);
    }
    audio.play('key', { x: d.x, z: d.z });
    dropMesh(d.mesh);
    game.drops.splice(i, 1);
  }
}

function clearDrops() {
  for (const d of game.drops) dropMesh(d.mesh);
  game.drops.length = 0;
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
      dropMesh(r.mesh);
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
  levelMeshes.doorMeshes.forEach((m) => {
    m.visible = true;
    m.userData.slide = 0;
    m.userData.opening = false;
    m.position.y = m.userData.baseY != null ? m.userData.baseY : m.position.y;
    if (m.userData.lamp) m.userData.lamp.material.color.setHex(0xff3b30);
  });
  getMats()['pad'].color.setHex(0x552222);

  clearPickups();
  enemies.clear(); // defensive: a wave always starts from an empty arena
  const mode = MODES[game.mode] || MODES.campaign;
  enemies.spawnWave(n, player.pos, { boss: mode.bossRush || !!zone.boss, waves: game.wavesTarget });
  spawnPickups(n);
  if (n >= 3) spawnKeycard();
  saveRun();

  hud.toast('WAVE ' + n, 2);
  audio.play('wave');

  // the warden gets an entrance: three seconds, skippable, then control back
  const boss = enemies.boss;
  if (boss && game.state === 'playing' && !game.bossSeen) {
    game.bossSeen = true;
    game.state = 'cinematic';
    releaseLock();
    cinematic.play(boss, 'THE WARDEN', zone.name + ' · ' + game.wave + ' of ' + game.wavesTarget, () => {
      game.state = 'playing';
      requestLock();
      clock.getDelta();
    });
  }
}

// The performance preset drops bloom; the others keep it. A device that cannot
// afford four quarter-res passes should not be given them.
/**
 * The difficulty preset, scaled by which zone you are in. The preset alone made
 * zone 1 wave 3 identical to zone 5 wave 3, so the first level was as hard as
 * the last one at the same wave number — which is how a player dies on level
 * one and never sees the other four.
 */
function zoneDiff() {
  const mode = MODES[gameMode] || MODES.campaign;
  const preset = mode.forceHard ? 'hard' : settings.difficulty;
  const base = DIFF_MULT[preset] || DIFF_MULT.normal;
  const t = (zone && zone.threat) || 1;
  return { hp: base.hp * t, dmg: base.dmg * t, count: base.count * t };
}

function applyBloom() {
  const preset = settings.quality || 'balanced';
  const want = preset !== 'performance' && !settings.reducedMotion;
  if (want && !bloom) {
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    bloom = new Bloom(renderer, w, h, { strength: 1.15, threshold: 0.72 });
  }
  if (bloom) {
    bloom.setGrade(zone && zone.grade);
    bloom.enabled = want;
  }
}

function applySettings() {
  camera.fov = settings.fov;
  camera.updateProjectionMatrix();
  // a portrait phone sees the same model in a much narrower frustum, so the gun
  // fills a third of the screen unless it is scaled down with the aspect
  if (weapons && weapons.setAspectScale) {
    const a = (canvas.clientWidth || window.innerWidth) / (canvas.clientHeight || window.innerHeight);
    weapons.setAspectScale(Math.min(1, Math.max(0.55, a / 1.6)));
  }
  player.sensitivity = settings.sensitivity;
  player.reducedMotion = settings.reducedMotion;
  if (effects) effects.reducedMotion = settings.reducedMotion;
  if (enemies) enemies.diff = zoneDiff();
  audio.setVolume(settings.volume);
  audio.setMuted(settings.muted);
  applyBloom();
  syncSettingsUI();
}

function syncSettingsUI() {
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = String(val); };
  const text = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  set('setSens', settings.sensitivity);
  set('setFov', settings.fov);
  set('setQuality', settings.quality || 'balanced');
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
  // every pickup is a model of the thing it is, not a coloured octahedron
  health: { color: 0xff2f55, build: Items.medkit, toast: 'HEALTH +25', apply: (p) => p.heal(25) },
  armor: { color: 0x3fa9ff, build: Items.armourVest, toast: 'ARMOR +25', apply: (p) => p.addArmor(25) },
  bullets: { color: 0xffd24a, build: () => Items.ammoBox(false), toast: '+20 BULLETS', apply: (p) => { p.ammo.bullets += 20; } },
  shells: { color: 0xff8a3c, build: () => Items.shellPickup(), toast: '+6 SHELLS', apply: (p) => { p.ammo.shells += 6; } },
  rockets: { color: 0x8fe04a, build: Items.rocket, toast: '+2 ROCKETS', apply: (p) => { p.ammo.rockets += 2; } },
};

function randomCell(minDist = 0, roomsOnly = true) {
  const pool = level.reachableCells.filter((c) => {
    if (roomsOnly && c.room < 0) return false;
    if (c.x === level.exit.cx && c.z === level.exit.cz) return false;
    return Math.hypot(c.wx - player.pos.x, c.wz - player.pos.z) > minDist;
  });
  const src = pool.length ? pool : level.reachableCells;
  return src[Math.floor(Math.random() * src.length)];
}

function spawnBarrels() {
  const rng = makeRng(game.seed + ':barrels');
  const rooms = level.rooms.filter((r, i) => i !== level.exitRoom && i !== level.spawnRoom);
  const mat = new THREE.MeshLambertMaterial({ color: 0x8a4a1e });
  const band = new THREE.MeshLambertMaterial({ color: 0x2a2a30 });
  for (let i = 0; i < 6 && rooms.length; i++) {
    const room = rooms[Math.floor(rng.next() * rooms.length)];
    const x = room.cx * CELL + (rng.next() - 0.5) * 3;
    const z = room.cz * CELL + (rng.next() - 0.5) * 3;
    if (isBlocked(level, x, z)) continue;
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.92, 10), mat);
    body.position.y = 0.46;
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.1, 10), band);
    ring.position.y = 0.46;
    g.add(body, ring);
    g.position.set(x, floorHeightAt(level, x, z), z);
    scene.add(g);
    game.barrels.push({ mesh: g, x, z, hp: 30, alive: true });
  }
}

function explodeBarrel(b) {
  if (!b.alive) return;
  b.alive = false;
  scene.remove(b.mesh);
  b.mesh.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
  const at = { x: b.x, y: floorHeightAt(level, b.x, b.z) + 0.5, z: b.z };
  effects.burst(at, 0xff8a3d, 40, 9, 0.9, 2);
  effects.flash(at, 0xffa040, 26, 0.12, 30);
  effects.addShake(0.6);
  audio.play('boom', at);

  // everything in the radius takes it, including you
  for (const e of enemies.list) {
    if (!e.alive) continue;
    const d = Math.hypot(e.pos.x - b.x, e.pos.z - b.z);
    if (d > 4) continue;
    e.hurt(70 * (1 - d / 5), { level, player, effects, audio, projectiles, onKill: enemies.onKill, weapon: 'BARREL' }, { x: b.x, y: 0, z: b.z });
  }
  const pd = Math.hypot(player.pos.x - b.x, player.pos.z - b.z);
  if (pd < 4) {
    player.damage(45 * (1 - pd / 5), { x: b.x, y: at.y, z: b.z });
    hud.hurt(20);
  }
}

// Point-to-ray distance on the ground plane: a barrel is hit when the shot
// passes through it, wherever it is along the ray.
// A shot that lands on a secret wall chips it; at zero the wall goes and the
// alcove behind it is a room you can walk into.
function damageSecret(cell, amount) {
  if (!cell || !cell.secretWall) return false;
  const sec = (level.secrets || []).find((s) => s.idx === level.idx(cell.x, cell.z));
  if (!sec || sec.broken) return false;
  sec.hp -= amount;
  if (sec.hp > 0) return true;

  sec.broken = true;
  level.broken.add(sec.idx);
  const hit = (game.secretMeshes || []).find((m) => m.secret === sec);
  if (hit) {
    scene.remove(hit.mesh);
    hit.mesh.geometry.dispose();
    hit.mesh.material.dispose();
  }
  effects.burst({ x: sec.wx, y: 1.2, z: sec.wz }, 0x8a7a66, 30, 5, 0.8, 2);
  effects.addShake(0.35);
  audio.play('door', { x: sec.wx, y: 1, z: sec.wz });
  hud.toast('SECRET', 2);
  game.score += 250;
  return true;
}

// A crate blocks the cell it stands in until it is shot apart. Unlike a barrel
// it does not explode: it is cover, and cover that can be removed.
function damageCrate(cell, amount) {
  if (!cell || !cell.crate) return false;
  const cr = (level.crates || []).find((k) => k.idx === level.idx(cell.x, cell.z));
  if (!cr || cr.broken) return false;
  cr.hp -= amount;
  if (cr.hp > 0) return true;

  cr.broken = true;
  cell.crate = false;
  level.broken.add(cr.idx);
  const hit = (game.crateMeshes || []).find((m) => m.crate === cr);
  if (hit) {
    scene.remove(hit.mesh);
    hit.mesh.geometry.dispose();
    hit.mesh.material.dispose();
  }
  effects.burst({ x: cr.wx, y: 0.6, z: cr.wz }, 0x8a6a44, 18, 4, 0.6, 2);
  audio.play('wall', { x: cr.wx, y: 0.6, z: cr.wz });
  return true;
}

function damageBarrels(origin, dir, maxDist, amount) {
  let best = null;
  let bestT = Infinity;
  for (const b of game.barrels) {
    if (!b.alive) continue;
    const dx = b.x - origin.x;
    const dz = b.z - origin.z;
    const len = Math.hypot(dir.x, dir.z) || 1;
    const t = (dx * dir.x + dz * dir.z) / len;
    if (t < 0 || t > maxDist) continue;
    const px = origin.x + (dir.x / len) * t;
    const pz = origin.z + (dir.z / len) * t;
    if (Math.hypot(b.x - px, b.z - pz) > 0.55) continue;
    if (t < bestT) { bestT = t; best = b; }
  }
  if (!best) return false;
  best.hp -= amount;
  if (best.hp <= 0) explodeBarrel(best);
  return true;
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
  const mesh = def.build ? def.build() : new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), new THREE.MeshBasicMaterial({ color: def.color }));
  mesh.add(glowSprite(def.color, 1.1));
  const baseY = (level.cells[level.idx(Math.round(x / CELL), Math.round(z / CELL))] || { floor: 0 }).floor + 0.45;
  mesh.position.set(x, baseY, z);
  scene.add(mesh);
  game.pickups.push({ kind, mesh, x, z, baseY, t: Math.random() * 6 });
}

// the item models share their geometry and materials, so only the sprite that
// hangs off them is per-pickup and only that is disposed here
function dropMesh(mesh) {
  if (!mesh) return;
  scene.remove(mesh);
  const free = (o) => { if (o && o.isSprite && o.material) o.material.dispose(); };
  // a Sprite has no traverse; a Group does. Both get here.
  if (typeof mesh.traverse === 'function') mesh.traverse(free);
  else free(mesh);
}

function clearPickups() {
  for (const p of game.pickups) dropMesh(p.mesh);
  game.pickups.length = 0;
  if (game.keycard) {
    dropMesh(game.keycard.mesh);
    dropMesh(game.keycard.beacon);
    game.keycard = null;
  }
}

function pickKeycardCell() {
  // only cells the player can walk to: the sealed alcove and a crate cell are
  // open floor and would put the keycard behind a wall
  const pool = level.reachableCells.filter(
    (c) => c.room >= 0 && c.room !== level.exitRoom &&
      Math.hypot(c.wx - player.pos.x, c.wz - player.pos.z) > 8
  );
  const src = pool.length ? pool : level.reachableCells.filter((c) => c.room !== level.exitRoom);
  const use = src.length ? src : level.reachableCells;
  return use[Math.floor(Math.random() * use.length)];
}

function spawnKeycard() {
  // never inside the locked exit room, or the run would be unwinnable
  const cell = pickKeycardCell();
  const mesh = Items.keycardItem();
  const baseY = (level.cells[level.idx(Math.round(cell.wx / CELL), Math.round(cell.wz / CELL))] || { floor: 0 }).floor + 0.55;
  mesh.position.set(cell.wx, baseY, cell.wz);
  scene.add(mesh);
  // the same light column the exit gets, so the keycard is findable
  const beacon = glowSprite(0xffd24a, 0.8);
  beacon.scale.set(0.7, 3.2, 0.7);
  beacon.position.set(cell.wx, baseY + 1.6, cell.wz);
  beacon.material.opacity = 0.5;
  scene.add(beacon);
  game.keycard = { mesh, beacon, x: cell.wx, z: cell.wz, baseY, t: 0 };
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
      dropMesh(p.mesh);
      game.pickups.splice(i, 1);
    }
  }

  const k = game.keycard;
  if (k) {
    k.t += dt;
    k.mesh.rotation.y += dt * 2.2;
    k.mesh.position.y = k.baseY + Math.sin(k.t * 3) * 0.1;
    if (k.beacon) k.beacon.material.opacity = 0.45 + Math.sin(k.t * 2.4) * 0.12;
    if (Math.hypot(k.x - player.pos.x, k.z - player.pos.z) < 1.2) {
      game.hasKey = true;
      hud.toast('KEYCARD ACQUIRED', 2.2);
      audio.play('key', { x: k.x, z: k.z });
      effects.burst({ x: k.x, y: k.baseY, z: k.z }, 0xffd24a, 14, 3, 0.5, 4);
      dropMesh(k.mesh);
      dropMesh(k.beacon);
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
  // doors slide up instead of vanishing: the mesh stays, the animation sells it
  for (const m of levelMeshes.doorMeshes) {
    m.userData.slide = 0;
    m.userData.opening = true;
    if (m.userData.lamp) m.userData.lamp.material.color.setHex(0x39ff9a);
  }
  getMats()['pad'].color.setHex(0x39ff9a);
  audio.play('door');
  effects.addShake(0.3);
  hud.toast('EXIT OPEN  +' + gained, 2.2);
}

// ------------------------------------------------------------------ tension

let heartT = 0;

/** The pad follows the room; the heart follows the health bar. */
function updateTension(dt) {
  if (!audio || !audio.ctx) return;
  let near = 99;
  for (const e of enemies.list) {
    if (!e.alive) continue;
    const d = Math.hypot(e.pos.x - player.pos.x, e.pos.z - player.pos.z);
    if (d < near) near = d;
  }
  const crowd = Math.min(1, enemies.aliveCount / 10);
  const close = Math.max(0, 1 - near / 26);
  const boss = enemies.boss && enemies.boss.alive ? 0.25 : 0;
  audio.setTension(Math.min(1, crowd * 0.55 + close * 0.55 + boss));

  const hp = player.health / (player.maxHealth || 110);
  if (hp < 0.3 && player.alive) {
    heartT -= dt;
    if (heartT <= 0) {
      heartT = 0.55 + hp * 2.4; // faster the closer to death
      audio.play('heart');
    }
  } else {
    heartT = 0;
  }
}

/**
 * Which piece of music belongs to what is happening. The scene is a mode, not a
 * track: menu, explore, combat, boss, and the tension the game already computes
 * decides how busy it plays.
 */
function updateMusic(dt) {
  if (!music) return;
  if (audio.ctx && !music.playing) music.start();
  if (!audio.ctx) return;
  const bossUp = enemies.boss && enemies.boss.alive;
  let scene = 'explore';
  if (game.state !== 'playing') scene = 'menu';
  else if (bossUp) scene = 'boss';
  else if (enemies.aliveCount > 0) scene = 'combat';
  music.setScene(scene);
  music.setIntensity(audio.tension || 0);
  music.update();
}

/** The live enemy closest to the player, for the compass and the anti-stuck check. */
function nearestEnemy() {
  let best = null;
  let bestD = Infinity;
  for (const e of enemies.list) {
    if (!e.alive) continue;
    const d = Math.hypot(e.pos.x - player.pos.x, e.pos.z - player.pos.z);
    if (d < bestD) { bestD = d; best = e; }
  }
  return best ? { x: best.pos.x, z: best.pos.z, d: bestD, enemy: best } : null;
}

/** The blade: the one attack that cannot run out. */
function swingBlade() {
  if (game.state !== 'playing') return;
  weapons.melee({
    player, level, enemies, projectiles, hud,
    onKill: enemies.onKill,
  });
}

function checkWave() {
  if (game.exitOpen) {
    const d = Math.hypot(player.pos.x - level.exit.x, player.pos.z - level.exit.z);
    if (d < 1.15) {
      audio.play('switch');
      if (game.wave >= game.wavesTarget && !MODES[game.mode]?.endless) zoneCleared();
      else startWave(game.wave + 1);
    }
    return;
  }
  if (enemies.aliveCount > 0) return;
  const modeNow = MODES[game.mode] || MODES.campaign;
  const keyWave = modeNow.keyEveryWave ? 1 : 3;
  if (game.wave >= keyWave && !game.hasKey) {
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
  // a card between levels: the zone changes and you are told which one
  const card = document.getElementById('zonecard');
  const cardName = document.getElementById('zonecardName');
  if (card && cardName) {
    cardName.textContent = zone.name;
    card.classList.add('on');
    setTimeout(() => card.classList.remove('on'), 700);
  }
  story.start(camera, level, () => showClassScreen(), zone.id);
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
  audio.startDrone();
  hud.setVisible(true);
  hideScreens();
  requestLock();
  hud.toast(getClass(id).name + '  ·  ' + zone.name, 2.4);
  clock.getDelta();
}

function showZoneMap() {
  // the map is the "what now" screen: every zone, its state, and the one line
  // that says what the next action is
  game.state = 'map';
  hud.setVisible(false);
  // the next thing to do, in one line, above the list
  const nextIdx = ZONES.findIndex((z, i) => isUnlocked(progress, i) && !progress.cleared.includes(z.id));
  const hint = document.getElementById('mapHint');
  if (hint) {
    hint.textContent = nextIdx >= 0
      ? 'NEXT — ' + ZONES[nextIdx].name + ' · ' + ZONES[nextIdx].blurb
      : 'EVERY ZONE CLEARED · play any of them again for a better score';
  }
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
  renderLoreChoices(r.entry);
  if (r.fresh) {
    game.score += 75;
    hud.toast('TERMINAL READ  +75', 1.8);
  }
  showScreen('lore');
  releaseLock();
}

// Two of the terminals ask a question. The answer is applied once and recorded,
// so the same terminal cannot be farmed.
function renderLoreChoices(entry) {
  const wrap = document.getElementById('loreChoices');
  if (!wrap) return;
  const chosen = game.loreChoices[entry.title];
  if (!entry.choice || chosen) {
    wrap.innerHTML = chosen ? `<p class="sub">You chose: ${chosen}</p>` : '';
    return;
  }
  wrap.innerHTML =
    `<p class="sub">${entry.choice.prompt}</p>` +
    entry.choice.options
      .map((o) => `<button class="card choicecard" data-choice="${o.id}"><h3>${o.label}</h3></button>`)
      .join('');
  wrap.querySelectorAll('[data-choice]').forEach((el) => {
    el.addEventListener('click', () => {
      const opt = entry.choice.options.find((o) => o.id === el.getAttribute('data-choice'));
      if (opt) resolveChoice(entry, opt);
    });
  });
}

function resolveChoice(entry, opt) {
  if (game.loreChoices[entry.title]) return; // one answer per terminal
  game.loreChoices[entry.title] = opt.label;
  switch (opt.effect) {
    case 'relic':
      player.damage(20, null);
      spawnRelicAt(player.pos.x, player.pos.z);
      hud.toast('A RELIC, PAID FOR', 2.2);
      break;
    case 'score':
      game.score += 150;
      hud.toast('+150', 1.6);
      break;
    case 'ambush': {
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2;
        enemies.spawnAt('imp', player.pos.x + Math.cos(a) * 4, player.pos.z + Math.sin(a) * 4, game.wave);
      }
      hud.toast('SOMETHING WAS IN THERE', 2.4);
      effects.addShake(0.4);
      break;
    }
    default:
      hud.toast('LEFT ALONE', 1.6);
  }
  audio.play('pickup');
  renderLoreChoices(entry);
}

function spawnRelicAt(x, z) {
  const mesh = Items.relicItem();
  const baseY = floorHeightAt(level, x, z) + 0.7;
  mesh.position.set(x, baseY, z);
  scene.add(mesh);
  game.relics.push({ mesh, x, z, baseY, t: 0 });
  game.relicsTotal = Math.max(game.relicsTotal, game.relicsTotal);
}

function closeLore() {
  if (game.state !== 'lore') return;
  game.state = 'playing';
  hideScreens();
  requestLock();
  clock.getDelta();
}

function throwGrenade() {
  if (game.state !== 'playing' || !player.alive) return;
  if ((player.grenades || 0) <= 0) {
    hud.toast('NO GRENADES');
    audio.play('empty');
    return;
  }
  player.grenades--;
  const dir = camera.getWorldDirection(new THREE.Vector3());
  const from = camera.localToWorld(new THREE.Vector3(0.2, -0.12, -0.5));
  projectiles.spawn('grenade', from, dir, { vy: 3.4, owner: 'player' });
  audio.play('pickup');
  hud.toast('GRENADE  ·  ' + player.grenades + ' LEFT', 1.4);
}

/**
 * If the player has not got more than 5 m from the spawn in 20 s while a wave is
 * live, the doors open anyway. It is a compromise, and better than a player who
 * cannot reach the enemies and cannot reach the exit either. The exit pad still
 * only advances once the wave is clear, so nothing is skipped.
 */
let stuckT = 0;
let stuckFrom = null;
function checkStuckSpawn(dt) {
  if (level.doorOpen) return;
  if (!stuckFrom) stuckFrom = { x: player.pos.x, z: player.pos.z };
  const moved = Math.hypot(player.pos.x - stuckFrom.x, player.pos.z - stuckFrom.z);
  if (moved > 5) { stuckFrom = null; stuckT = 0; return; }
  stuckT += dt;
  if (stuckT > 20) {
    level.doorOpen = true;
    for (const m of levelMeshes.doorMeshes) {
      m.userData.slide = 0;
      m.userData.opening = true;
      if (m.userData.lamp) m.userData.lamp.material.color.setHex(0x39ff9a);
    }
    hud.toast('DOORS OPEN \u00b7 THE PAD STILL NEEDS A CLEAR WAVE', 2.6);
    stuckT = 0;
  }
}

/**
 * Say it out loud when the player walks into a locked door: the door is locked
 * because the wave is not clear, and standing in front of it guessing is the
 * most common way to think the level is broken.
 */
let lockedDoorT = 0;
function checkLockedDoors(dt) {
  lockedDoorT -= dt;
  if (lockedDoorT > 0 || level.doorOpen) return;
  for (const d of level.doors || []) {
    const dx = player.pos.x - d.x * CELL;
    const dz = player.pos.z - d.z * CELL;
    if (dx * dx + dz * dz < 9) {
      hud.toast('LOCKED \u00b7 CLEAR THE WAVE', 1.8);
      lockedDoorT = 3;
      audio.play('door');
      return;
    }
  }
}

/** The exit beacon leans green the moment the pad opens. */
/** The fill light follows the player, a little ahead and above. */
function updateFillLight() {
  if (!fillLight) return;
  const fx = -Math.sin(player.yaw);
  const fz = -Math.cos(player.yaw);
  fillLight.position.set(player.pos.x + fx * 3.5, player.pos.y + 2.4, player.pos.z + fz * 3.5);
}

function updateBeacon(dt) {
  if (!exitBeacon) return;
  const t = performance.now() * 0.001;
  exitBeacon.material.opacity = (game.exitOpen ? 0.75 : 0.4) + Math.sin(t * 2.2) * 0.12;
  const s = game.exitOpen ? 1.5 : 1.0;
  exitBeacon.scale.set(s, 6.5 + Math.sin(t * 1.4) * 0.4, s);
  exitBeacon.material.color.setHex(game.exitOpen ? 0x39ff9a : 0xff3b30);
}

function objectiveLine() {
  if (game.exitOpen) return 'Reach the exit pad.';
  if (enemies.aliveCount > 0) return 'Clear the wave: ' + enemies.aliveCount + ' left.';
  if (game.wave >= 3 && !game.hasKey) return 'Find the keycard. It is somewhere on this floor.';
  return 'The exit is open.';
}

function showDiary() {
  if (game.state !== 'playing') return;
  game.state = 'diary';
  const el = document.getElementById('diaryBody');
  if (el) {
    const zoneDone = (progress.cleared || []).includes(zone.id);
    const relicsLeft = game.relicsTotal - game.relics.length;
    el.innerHTML = `
      <div class="diarycol">
        <h4>${zone.name}</h4>
        <ul>
          <li class="wide"><b>OBJECTIVE</b><span>${objectiveLine()}</span></li>
          <li><b>WAVE</b><span>${game.wave} of ${game.wavesTarget}</span></li>
          <li><b>SCORE</b><span>${game.score}</span></li>
          <li><b>ZONE</b><span>${zoneDone ? 'cleared before' : 'not cleared yet'}</span></li>
        </ul>
      </div>
      <div class="diarycol">
        <h4>FOUND</h4>
        <ul>
          <li><b>RELICS</b><span>${game.relicsTotal - relicsLeft}/${game.relicsTotal}</span></li>
          <li><b>SECRETS</b><span>${(level.secrets || []).filter((x) => x.broken).length}/${(level.secrets || []).length}</span></li>
          <li><b>TERMINALS</b><span>${lore ? lore.read.size : 0}/${lore ? lore.entries.length : 0}</span></li>
          <li><b>TRINKETS</b><span>${game.trinkets.length}/${SLOTS}</span></li>
        </ul>
      </div>
      <div class="diarycol">
        <h4>NEXT</h4>
        <ul>${ZONES.map((z, i) => {
          const done = (progress.cleared || []).includes(z.id);
          const here = z.id === zone.id;
          return `<li class="${here ? 'here' : ''}"><b>${i + 1}. ${z.name}</b><span>${done ? 'cleared' : here ? 'you are here' : 'locked'}</span></li>`;
        }).join('')}</ul>
      </div>`;
  }
  showScreen('diary');
  releaseLock();
}

function closeDiary() {
  if (game.state !== 'diary') return;
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
      <h4>BELT ${game.trinkets.length}/${SLOTS}</h4>
      <ul>${game.trinkets.map((id) => {
        const t = trinketById(id);
        return `<li><b>${t.name}</b><span>${t.blurb}</span></li>`;
      }).join('') || '<li class="dim"><b>empty</b></li>'}</ul>
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
  if (audio) audio.stopDrone();
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
  const epi = document.getElementById('clearedEpilogue');
  if (epi) epi.textContent = epilogueFor(zone.id);
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
  audio.startDrone();
  hud.setVisible(true);
  hideScreens();
  if (!opts.auto) requestLock();
  clock.getDelta();
}

function pauseGame() {
  if (audio) audio.stopDrone();
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

function runStats() {
  const acc = weapons.shots ? Math.round((weapons.hits / weapons.shots) * 100) : 0;
  return {
    waves: game.wave,
    kills: game.kills,
    score: game.score,
    accuracy: acc,
    shots: weapons.shots,
    damageTaken: Math.round(game.damageTaken || 0),
    relic: game.relicsTotal - game.relics.length,
    grenades: player.grenades || 0,
    favourite: Object.entries(game.weaponKills || {}).sort((a, b) => b[1] - a[1])[0] || null,
    seed: game.seed,
  };
}

function topRuns() {
  try {
    return JSON.parse(localStorage.getItem('hellgate.runs') || '[]');
  } catch (e) { return []; }
}

function recordRun(st) {
  const runs = topRuns();
  runs.push({ score: st.score, wave: st.waves, kills: st.kills, seed: st.seed, date: Date.now() });
  runs.sort((a, b) => b.score - a.score);
  const top = runs.slice(0, 5);
  try { localStorage.setItem('hellgate.runs', JSON.stringify(top)); } catch (e) { /* private mode */ }
  return top;
}

function gameOver() {
  if (game.state !== 'playing') return;
  game.state = 'dead';
  if (audio) audio.stopDrone();
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

  const st = runStats();
  const top = recordRun(st);
  const rows = top
    .map((r, i) => `<li class="${r.seed === st.seed && r.score === st.score ? 'you' : ''}">
      <b>${i + 1}</b><span>${r.score}</span><i>wave ${r.wave} · ${r.kills} kills</i></li>`)
    .join('');

  document.getElementById('stats').innerHTML = `
    <div class="goGrid">
      <div>
        <p>SCORE <b>${st.score}</b></p>
        <p>WAVES SURVIVED <b>${wavesSurvived}</b></p>
        <p>REACHED WAVE <b>${st.waves}</b></p>
        <p>KILLS <b>${st.kills}</b></p>
      </div>
      <div>
        <p>ACCURACY <b>${st.accuracy}%</b></p>
        <p>SHOTS <b>${st.shots}</b></p>
        <p>DAMAGE TAKEN <b>${st.damageTaken}</b></p>
        <p>RELICS <b>${st.relic}/${game.relicsTotal}</b></p>
        <p>FAVOURITE <b>${st.favourite ? st.favourite[0] + ' · ' + st.favourite[1] : '—'}</b></p>
      </div>
    </div>
    <p class="seedline">SEED <b>${escapeHtml(st.seed)}</b>
      <button id="copySeed" class="ghost tiny">copy</button></p>
    <h4 class="tophdr">BEST RUNS</h4>
    <ol class="topruns">${rows}</ol>`;

  const copy = document.getElementById('copySeed');
  if (copy) {
    copy.addEventListener('click', () => {
      const url = location.origin + location.pathname + 'play/?seed=' + encodeURIComponent(st.seed);
      const done = () => { copy.textContent = 'copied'; setTimeout(() => { copy.textContent = 'copy'; }, 1400); };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(done).catch(done);
      } else {
        const t = document.createElement('textarea');
        t.value = url;
        document.body.appendChild(t);
        t.select();
        try { document.execCommand('copy'); } catch (e) { /* nothing else to try */ }
        document.body.removeChild(t);
        done();
      }
    });
  }

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
  // Every path must swallow its own rejection: a lock request without a user
  // gesture throws NotAllowedError, and an unhandled rejection surfaces as a
  // page error even though nothing is broken.
  const plain = () => {
    try {
      const q = canvas.requestPointerLock();
      if (q && typeof q.catch === 'function') q.catch(() => {});
    } catch (e) { /* no lock available */ }
  };
  try {
    // unadjustedMovement asks for raw input (no OS mouse acceleration), which
    // makes aiming predictable. Not every browser supports it, hence the retry.
    const p = canvas.requestPointerLock({ unadjustedMovement: true });
    if (p && typeof p.catch === 'function') p.catch(plain).catch(() => {});
  } catch (e) {
    plain();
  }
}

// alt-tab to another window does not fire visibilitychange on every browser
window.addEventListener('blur', () => {
  if (game.state === 'playing') pauseGame();
});

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
  if (e.button === 2) { throwGrenade(); return; }   // right-click: lob a grenade
  if (e.button === 1) { swingBlade(); e.preventDefault(); return; } // middle: swing
  if (e.button !== 0) return;
  if (game.state === 'playing') {
    input.fire = true;
    if (!input.locked) requestLock();
  }
});
window.addEventListener('mouseup', () => { input.fire = false; });
window.addEventListener('blur', () => { input.fire = false; input.keys = Object.create(null); });

window.addEventListener('keydown', (e) => {
  if (e.code === 'Escape' && document.getElementById('settings').classList.contains('on')) {
    closeSettings();
    e.preventDefault();
    return;
  }
  if (e.code === 'Escape' && game.state === 'diary') {
    closeDiary();
    e.preventDefault();
    return;
  }
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
  if (e.code === 'Digit4') weapons.select(3);
  if (e.code === 'KeyQ') castPower(0);
  if (e.code === 'KeyE') castPower(1);
  if (e.code === 'KeyR') castPower(2);
  if (e.code === 'KeyX') weapons.next(1);
  if (e.code === 'KeyV') openLore();
  if (e.code === 'KeyG') throwGrenade();
  if (e.code === 'KeyF') swingBlade();
  if (e.code === 'Tab') { toggleInventory(); e.preventDefault(); }
  if (e.code === 'KeyJ') showDiary();
  if (e.code === 'KeyM' && game.state === 'playing') { pauseGame(); showZoneMap(); }
  if (e.code === 'F11') { toggleFullscreen(); e.preventDefault(); }
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

// The build stamp exists because "I fixed it" and "you are running the old file"
// look identical from a bug report. Bump this with VERSION; check-claims enforces
// that they match.
const BUILD = '1.56.2';

function stampBuild() {
  const el = document.getElementById('build');
  if (!el) return;
  el.textContent = 'BUILD ' + BUILD + ' \u00b7 seed ' + (game.seed || '\u2014');
}

stampBuild();
document.getElementById('settingsBtnTitle').addEventListener('click', () => openSettings('title'));
document.getElementById('journalBtn')?.addEventListener('click', () => { game.state = 'paused'; showDiary(); });
document.getElementById('invBtn')?.addEventListener('click', () => { game.state = 'paused'; toggleInventory(); });
document.getElementById('settingsBtnPause').addEventListener('click', () => openSettings('pause'));
// bound by id, not by a class query: the test double can find an id and cannot
// find a selector, and a mode you cannot test is a mode that breaks quietly
const modeButtons = Object.keys(MODES).map((k) => [k, document.getElementById('mode' + k[0].toUpperCase() + k.slice(1))]);
function selectMode(name) {
  if (!MODES[name]) return;
  gameMode = name;
  for (const [key, btn] of modeButtons) if (btn) btn.classList.toggle('on', key === name);
  const blurb = document.getElementById('modeBlurb');
  if (blurb) blurb.textContent = MODES[name].blurb;
}
for (const [key, btn] of modeButtons) if (btn) btn.addEventListener('click', () => selectMode(key));

document.getElementById('setQuality')?.addEventListener('change', (e) => changeSetting('quality', e.target.value));
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
    `${fps} fps · ${st.calls} calls · ${(st.tris / 1000).toFixed(1)}k tris · ${st.chunks} chunks · seed ${game.seed}`;
  dbg.acc = 0;
  dbg.frames = 0;
}

window.addEventListener('resize', () => {
  if (weapons && weapons.setAspectScale) {
    const a = (canvas.clientWidth || window.innerWidth) / (canvas.clientHeight || window.innerHeight);
    weapons.setAspectScale(Math.min(1, Math.max(0.55, a / 1.6)));
  }
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
  weapons.firing = !!input.fire;
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
  hud.setPrompt(near ? (TOUCH ? 'READ' : 'V  READ') : '');
  if (touchCleanup && touchCleanup.setReadable) touchCleanup.setReadable(!!near);

  enemies.update(dt, player, projectiles);
  enemies.unstuck(dt, player);
  projectiles.update(dt, player, enemies);
  if (companion) companion.update(dt, player, enemies);
  if (props) props.update(dt, player);
  updateRelics(dt);
  updateDrops(dt);
  updateDoors(dt);
  updateTension(dt);
  updateMusic(dt);
  updateBeacon(dt);
  updateFillLight();
  checkLockedDoors(dt);
  checkStuckSpawn(dt);
  if (minimap) {
    minimap.acc += dt;
    if (minimap.acc > 0.1) {
      minimap.acc = 0;
      minimap.draw(player, enemies.list, game.exitOpen, game.keycard);
    }
  }
  effects.update(dt);
  updatePickups(dt);
  checkWave();

  // exit pad pulse
  const pad = levelMeshes.exitPad;
  pad.material.opacity = game.exitOpen ? 0.65 + Math.sin(elapsed * 5) * 0.3 : 0.28;

  hud.update(dt, player, weapons, {
    player,
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
    keycard: game.keycard ? { x: game.keycard.x, z: game.keycard.z } : null,
    nearest: nearestEnemy(),
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
  let levelCalls;
  let levelTris;
  if (bloom && bloom.enabled) {
    // the scene pass's own numbers, not the composite's one quad
    const st = bloom.render(scene, camera);
    levelCalls = st.calls;
    levelTris = st.tris;
  } else {
    renderer.render(scene, camera);
    levelCalls = renderer.info.render.calls;
    levelTris = renderer.info.render.triangles;
  }
  const info = renderer.info.render;
  renderer.clearDepth();
  renderer.render(weaponScene, weaponCamera);
  lastRenderStats.calls = levelCalls + info.calls;
  lastRenderStats.tris = levelTris + info.triangles;
  lastRenderStats.chunks = levelMeshes && levelMeshes.group ? levelMeshes.group.children.length : 0;
}

// Fixed timestep, taken from game-kit: the simulation advances in 1/60 s steps
// whatever the display does, so 30 fps and 144 fps produce the same game. The
// backlog is capped so a stalled tab cannot simulate a minute in one frame.
const FIXED = 1 / 60;
const MAX_STEPS = 4;
let accumulator = 0;

function loop() {
  requestAnimationFrame(loop);
  const frameDt = Math.min(0.25, clock.getDelta());
  elapsed += frameDt;

  if (game.state === 'playing') {
    accumulator += frameDt;
    let steps = 0;
    while (accumulator >= FIXED && steps < MAX_STEPS) {
      update(FIXED);
      accumulator -= FIXED;
      steps++;
    }
    if (steps === MAX_STEPS) accumulator = 0; // drop the backlog, do not spiral
    if (effects) effects.applyShake(camera);
    adaptResolution(frameDt);
  } else {
    accumulator = 0;
    updateDoors(frameDt); // finish opening even if a screen is up
    if (game.state === 'intro') story.update(frameDt, level);
    if (game.state === 'cinematic') {
      cinematic.update(frameDt);
      if (effects) effects.applyShake(camera);
    }
  }
  if (touchCleanup && touchCleanup.setVisible) touchCleanup.setVisible(game.state === 'playing');
  render();
  updateDebug(frameDt);
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
    grenade: () => throwGrenade(),
    melee: () => swingBlade(),
    read: () => openLore(),
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
  resumeRun, saveRun, loadRun, clearRun, toggleInventory, throwGrenade, swingBlade,
  selectMode, get mode() { return gameMode; }, MODES, addPickup, dropTrinket, cinematic, openExit,
  showDiary, closeDiary, objectiveLine,
  get renderStats() { return lastRenderStats; },
  // tools measure the post pass by switching it; nothing in the game reads this
  get bloom() { return bloom; },
  get perfState() { return { ratio: perf.ratio, bloomDropped: perf.bloomDropped }; },
  takeUpgrade, UPGRADES, TRINKETS, dropTrinket, recomputeStats,
  explodeBarrel, damageBarrels, spawnBarrels, damageSecret, damageCrate,
  runStats, topRuns, recordRun, gameOver,
  openLore, closeLore, resolveChoice, get lore() { return lore; },
  applySettings, changeSetting, openSettings, closeSettings,
  get weapons() { return weapons; },
  get level() { return level; },
  get enemies() { return enemies; },
  get projectiles() { return projectiles; },
  get effects() { return effects; },
  get levelMeshes() { return levelMeshes; },
  startGame, pauseGame, resumeGame, applyUrlOverrides,
};
