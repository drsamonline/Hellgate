// ---------------------------------------------------------------------------
// MAIN — bootstrap, input, wave flow, render loop.
// ---------------------------------------------------------------------------

import * as THREE from 'three';
import { makeRng } from './rng.js';
import { generateLevel, raycastWalls, floorHeightAt, hasLineOfSight, isBlocked, cellAt, circleBlocked, CELL } from './level.js';
import { exportMap, importMap, mapToJSON, mapFromJSON } from './maps.js';
import { Editor, PALETTE, blankGrid } from './editor.js';
import * as mapLib from './maplib.js';
import { buildCameraPath, sampleCameraPath } from './campath.js';
import { buildLevelMeshes } from './levelmesh.js';
import { humanoid, PROPORTIONS, rigMat } from './rig.js';
import { makeMaterials, makeDecalTextures } from './textures.js';
import { Player } from './player.js';
import { Weapons, WEAPONS } from './weapons.js';
import { EnemyManager, poolStats, clearBodyPool, TYPES } from './enemies.js';
import { loadModels, modelReport, installModel, uninstallModel } from './models.js';
import { ZONE_BOOK, effectsFor } from './zonebook.js';
import { buildCodex } from './codex.js';
import { dailySeed, loadDaily, recordDaily } from './daily.js';
import { ACHIEVEMENTS, loadHistory, saveHistory, check as checkAchievements, achievementName, progressOf } from './achievements.js';
import * as Book from './book.js';
import { Projectiles } from './projectiles.js';
import { Effects, glowSprite } from './effects.js';
import { HUD } from './hud.js';
import { Sfx } from './audio.js';
import { loadSettings, saveSettings, clampSettings } from './settings.js';
import { CLASSES, getClass } from './classes.js';
import { Powers } from './powers.js';
import { Story, epilogueFor } from './story.js';
import { ZONES, zoneById, loadProgress, clearZone, clearLevel, isUnlocked, isLevelUnlocked } from './world.js';
import { STORY_LEVELS, storyLevel, storyLevelZone, ACT_THREAT, LEVEL_HINTS, BOSS_FOR_ACT, ROSTER_FOR_ACT, BOSS_FOR_ZONE } from './story-levels.js';
import { Props } from './props.js';
import { Companion } from './companion.js';
import { initTouch, isTouchDevice } from './touch.js';
import { Lore } from './lore.js';
import { Minimap } from './minimap.js';
import { Bloom } from './bloom.js';
import { Music } from './music.js';
import * as Items from './items.js';
import { Cinematic } from './cinematic.js';
import { Dialogue, sceneFor } from './dialogue.js';
import { simRand, simInt, seedSim, simDraws } from './simrng.js';
import { Recorder, Player as ReplayPlayer, stateHash } from './replay.js';
import { TRINKETS, SLOTS, SPARE_VALUE, trinketById, rollDrop, sumEffects } from './loot.js';

// ---------------------------------------------------------------- renderer --
const canvas = document.getElementById('game');
let fillLight = null;
let sun = null;
let npcBody = null;

const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight, false);
renderer.outputColorSpace = THREE.SRGBColorSpace;
// #52 — one directional shadow map with tight bounds, following the player. A map
// that covers the arena is useless: at 40x40 cells the texel is a hand's width and
// every shadow is a smear. A 14 m box is 1.4 cm per texel at 1024.
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
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
  const d = new THREE.DirectionalLight(0xffd9b0, 0.55);
  d.position.set(1, 2, 0.6);
  d.castShadow = true;
  d.shadow.mapSize.set(1024, 1024);
  const sc = d.shadow.camera;
  sc.left = -14; sc.right = 14; sc.top = 14; sc.bottom = -14;
  sc.near = 0.5; sc.far = 46;
  sc.updateProjectionMatrix();
  d.shadow.bias = -0.0012;
  d.shadow.normalBias = 0.03;
  sun = d;
  s.add(d);
  s.add(d.target);
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
const record = loadHistory();
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
      // everything a resumed run needs to be the same run. The first version of
      // this saved only the numbers a HUD shows, so a reload after zone two lost
      // every upgrade, every story flag and the codex counts.
      upgrades: { ...game.upgrades },
      flags: { ...game.flags },
      bookAt: game.bookAt,
      killsByType: { ...game.killsByType },
      relicsLeft: game.relics.length,
      relicsTotal: game.relicsTotal,
      sideDone: !!game.sideDone,
      // which campaign level this run is: a zone run saves 0
      level: game.level,
      // the clock is part of the run: a reload on a survive level would otherwise
      // restart it at full time, which is a free 75 seconds
      objectiveType: game.objectiveType,
      objectiveT: game.objectiveT,
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
// the same letterbox, used as a caption instead of a camera: the story is
// written down and shown, not left on a wall for the player to walk past
const dialogue = new Dialogue({
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
    blurb: 'Thirty-two levels in four acts. Clear one to unlock the next.',
    waves: null,       // the level decides
    lives: 1,
    endless: false,
    bossRush: false,
    levels: true,      // plays the campaign table, not the nine zones
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
    blurb: 'One wave per zone, and a boss at the end of each. Four of them.',
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
    levels: true,
  },
  hardcore: {
    name: 'HARDCORE',
    blurb: 'Campaign rules, but death ends the run and the save is deleted.',
    waves: null,
    lives: 1,
    endless: false,
    bossRush: false,
    noSave: true,
    levels: true,
  },
  daily: {
    name: 'DAILY',
    blurb: 'One run a day, the same seed for everyone. The best of the day is kept.',
    waves: null,
    lives: 1,
    endless: false,
    bossRush: false,
    daily: true,
  },
  gauntlet: {
    name: 'GAUNTLET',
    blurb: 'Every zone, one wave each, back to back. No save, no second chance.',
    waves: 1,
    lives: 1,
    endless: false,
    bossRush: false,
    noSave: true,
    gauntlet: true,
  },
};

let gameMode = 'campaign';
// a map handed in by `?map=`, played instead of a generated level
let pendingMap = null;
// and the one being played now: Try again has to replay the map, not the seed the
// campaign level would have used
let playingMap = null;

// a relic takes this much damage to break: three pistol shots or two blasts.
// High enough that breaking one is a decision, low enough that it is not a chore.
const RELIC_HP = 40;

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
  objectiveType: 'clear',
  objectiveT: 0,
  storyLevel: 0,
  level: 0,           // the campaign level being played, 0 for a zone run
  coins: 0,
  sideDone: false,
  buffs: { damage: 0, speed: 0, shield: 0 },
  upgrades: {},
  killsByType: {},      // what the codex counts
  flags: {},            // what the story choices have made you
  bookAt: null,         // where the zone book has got to
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

/**
 * Build a level.
 * @param {string} seed The map seed.
 * @param {object} [zoneDef] The zone to dress it in.
 * @param {boolean} [fresh] True when this is the first level of a run: the
 *   money and the per-run counters start at zero. They carry across levels
 *   inside a run, which is what makes the shop and the codex count a run.
 */
function buildRun(seed, zoneDef, fresh = false) {
  disposeRun();
  zone = zoneDef || zone;
  game.zoneId = zone.id;
  game.seed = seed;
  game.wave = 0;
  game.kills = 0;
  if (fresh) {
    // a new run starts with no money and a clean per-run tally. Neither was
    // reset, so a second run began with the first one's coins and the codex
    // counted every kill twice — which is how a replay of the same seed scored
    // differently from the run it recorded
    game.coins = 0;
    game.killsByType = {};
  }
  game.waveKills = 0;
  game.score = 0;
  game.waveStart = 0;
  game.hasKey = false;
  game.exitOpen = false;
  game.warnedKey = false;
  game.pickups = [];
  game.keycard = null;

  scene = newScene(zone);
  // the run's random stream starts from the seed, so the same seed and the same
  // inputs are the same run. `level.js` keeps its own generator stream.
  seedSim(seed);
  // the run's clock starts at zero: it used to carry over from the last run, so
  // a time bonus at the end of a wave depended on how long the session had been
  // open — which is the same as saying two identical runs scored differently
  elapsed = 0;
  // a shared map is played as it is; everything else is generated from the seed
  level = pendingMap || generateLevel(seed, zone.shape);
  playingMap = pendingMap || null;
  // a shared map carries its own objective: the editor asks the designer what
  // ends the level, and this is where that answer is applied
  const mapObjective = pendingMap && pendingMap.objective ? pendingMap.objective : null;
  pendingMap = null;
  // A level states what ends it. 'reach' opens the way from the first frame, so
  // the level is somewhere you cross rather than a pen you empty; 'clear' keeps
  // the wave arena's rule and the pad opens when the room is empty.
  const objType = (mapObjective && mapObjective.type) || zone.objectiveType;
  level.doorOpen = objType === 'reach';
  game.exitOpen = objType === 'reach';
  // 'survive': the pad opens when the clock runs out, whatever is still standing
  // 'relics': the pad opens when the last relic is broken, whatever is standing
  game.objectiveType = objType || 'clear';
  game.objectiveT = (mapObjective && mapObjective.time) || zone.objectiveTime || 0;
  game.storyLevel = zone.storyLevel || 0;
  // the helper: a body, a coat, and a room he never leaves. He shoots what walks
  // in, and he is where the coins get spent.
  npcBody = null;
  if (level.npc) {
    const coat = rigMat(0x4a5a6a, true);
    const skin = rigMat(0x8a7a6a, true);
    const built = humanoid({ ...PROPORTIONS.grunt, mats: { body: coat, dark: skin, eye: rigMat(0xffd24a, false), plate: coat } });
    npcBody = built.group;
    npcBody.position.set(level.npc.wx, floorHeightAt(level, level.npc.wx, level.npc.wz), level.npc.wz);
    npcBody.rotation.y = Math.PI;
    scene.add(npcBody);
    level.npc.quest = npcQuestState();
  }

  // chests: a box in a room that pays coins when you walk up to it. Coins are
  // money — from chests and from kills — and they are what the NPC's shop spends.
  if (level.chests) {
    const coinMat = new THREE.MeshLambertMaterial({ color: 0x8a6a2a });
    const lidMat = new THREE.MeshLambertMaterial({ color: 0xb08a3a });
    for (const ch of level.chests) {
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.42, 0.46), coinMat);
      body.position.y = 0.21;
      g.add(body);
      const lid = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.12, 0.5), lidMat);
      lid.position.y = 0.48;
      g.add(lid);
      g.position.set(ch.wx, floorHeightAt(level, ch.wx, ch.wz), ch.wz);
      scene.add(g);
      ch.mesh = g;
      ch.lid = lid;
    }
  }
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
    // money from kills as well as chests: a boss pays for a rocket, a hound for
    // a fifth of one. The helper's kills pay too — the coins are the run's.
    game.coins = (game.coins || 0) + (e && e.T && e.T.boss ? 120 : e && e.type === 'hound' ? 8 : 12);
    if (e && e.type) {
      game.killsByType = game.killsByType || {};
      game.killsByType[e.type] = (game.killsByType[e.type] || 0) + 1;
      record.byType[e.type] = (record.byType[e.type] || 0) + 1;
      record.kills++;
      if (e.elite) record.elites++;
      if (weaponName === 'BLADE') record.blade++;
      record.types = Object.keys(record.byType).length;
      awardFor();
    }
    // an elite is worth more than the same body without the rim light
    const worth = e && e.elite ? 3 : 1;
    game.score += Math.round(50 * worth * (game.wave || 1) * effectsFor(game.flags).scoreMul);
    if (weaponName) {
      game.weaponKills[weaponName] = (game.weaponKills[weaponName] || 0) + 1;
    }
    if (hud && e && e.T) {
      hud.feed(
        (e.elite ? 'ELITE ' : '') + String(e.T.label || e.type || 'ENEMY').toUpperCase(),
        weaponName || 'DOWN'
      );
    }
    if (player.leech > 0) player.heal(player.leech);
    const id = rollDrop(simRand);
    // an elite always leaves something behind
    if (e && (id || e.elite)) dropTrinket(id || 'edge', e.pos);
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
  game.wavesTarget = mode.waves != null ? mode.waves
    : game.level ? 1                                   // a level is one objective, not three waves
      : (zone.boss ? 4 : 3);
  if (game.level) game.storyLevel = game.level;
  // the act's own boss, on the act's own last level: the story table carries the
  // flag, so a level dressed in a boss zone is not automatically a boss fight
  const row = game.level ? storyLevel(game.level) : null;
  game.bossLevel = !!(row && row.boss);
  game.bossAct = row ? row.act : 0;
  game.bossSeen = false;
  // a level gated on relics must have some even if the zone forgot a count: an
  // objective with nothing to break is a door that never opens
  const relicCount = (mapObjective && mapObjective.relics) || zone.relics || (game.objectiveType === 'relics' ? 3 : 0);
  spawnRelics(relicCount);
  applyClass(game.classId);
  applySettings();
  startWave(1);
}

function resumeRun(save) {
  audio.init();
  // a campaign run resumes on its own level, not on whatever zone id was saved:
  // two levels can share a zone, and the level decides the seed and the objective
  const row = save.level ? storyLevel(save.level) : null;
  const ldef = row ? storyLevelZone(row) : null;
  zone = ldef || zoneById(save.zoneId);
  game.zoneId = zone.id;
  buildRun(save.seed, zone);
  game.level = ldef ? save.level : 0;
  game.storyLevel = ldef ? save.level : 0;
  if (ldef) game.wavesTarget = 1;
  // restore the run's memory before the stats are computed: applyClass reads
  // game.flags, and a flag restored afterwards would do nothing until next zone
  game.upgrades = (save.upgrades && typeof save.upgrades === 'object') ? { ...save.upgrades } : {};
  game.flags = (save.flags && typeof save.flags === 'object') ? { ...save.flags } : {};
  game.bookAt = typeof save.bookAt === 'string' ? save.bookAt : null;
  game.killsByType = (save.killsByType && typeof save.killsByType === 'object') ? { ...save.killsByType } : {};
  applyClass(save.classId);
  if (Number.isFinite(save.objectiveT) && save.objectiveType === game.objectiveType) {
    game.objectiveT = Math.max(0, save.objectiveT);
  }
  // relics are respawned by buildRun at fresh positions, so the count is what
  // survives: take the excess back off the floor rather than let them be collected twice
  if (Number.isFinite(save.relicsLeft) && save.relicsTotal === game.relicsTotal) {
    while (game.relics.length > save.relicsLeft) {
      const r = game.relics.pop();
      dropMesh(r.mesh);
    }
  }
  game.score = save.score || 0;
  game.kills = save.kills || 0;
  // clamp to the run's own ceiling, which includes upgrades, trinkets and flags —
  // the class's base hp is only the floor of that
  player.health = Math.min(player.maxHp, save.hp || player.maxHp);
  player.armor = save.armor || 0;
  if (save.ammo) Object.assign(player.ammo, save.ammo);
  if (Array.isArray(save.trinkets)) {
    game.trinkets = save.trinkets.slice(0, SLOTS);
    recomputeStats();
  }
  startWave(Math.max(1, save.wave || 1));
  game.state = 'playing';
  audio.startDrone();
  if (zone && zone.bed) audio.startBed(zone.bed);
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

/**
 * Derive every stat from class + upgrades + trinkets + the story flags.
 *
 * It is a pure derivation, not an adjustment: calling it twice gives the same
 * numbers. That matters because it is called from several places, and an
 * adjustment-style version drifted — a flag applied in `applyClass` was wiped by
 * the next `recomputeStats`, so haste and careful silently stopped working after
 * a resume.
 */
function recomputeStats() {
  const def = getClass(game.classId);
  const u = game.upgrades;
  const t = sumEffects(game.trinkets);
  const f = effectsFor(game.flags);
  player.baseDamage = def.damage * (1 + 0.15 * (u.damage || 0)) * (1 + (t.damage || 0));
  player.baseSpeed = def.speed * (1 + 0.1 * (u.speed || 0)) * (1 + (t.speed || 0)) * f.speedMul;
  player.maxHp = def.hp + 25 * (u.hp || 0) + (t.hp || 0) + f.maxHp;
  player.damageMul = player.baseDamage;
  player.speedMul = player.baseSpeed;
  powers.regenMul = (1 + 0.3 * (u.energy || 0)) * (1 + (t.energy || 0));
  powers.cdMul = Math.pow(0.85, u.cooldown || 0);
  player.startArmourBonus = (t.armour || 0) + f.armour;
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
  // recomputeStats already folded in the story flags: speed, max health and the
  // armour bonus, which is where they belong and where they survive a resume
  // addArmor() caps armour at 100, so the starting armour has to be capped the
  // same way: six PLATE upgrades used to start a run at 145
  player.armor = Math.min(100, def.armor + 20 * (game.upgrades.armour || 0) + (player.startArmourBonus || 0));
  player.health = player.maxHp;
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
  // not in the exit room, not in the spawn room, and not within 8 m of the spawn:
  // a big spawn room has cells more than 8 m out, and a relic standing in the room
  // you start in is a relic you break before you have walked anywhere
  const pool = level.reachableCells.filter(
    (c) => c.room >= 0 && c.room !== level.exitRoom && c.room !== level.spawnRoom &&
      Math.hypot(c.wx - level.spawn.x, c.wz - level.spawn.z) > 8
  );
  const use = pool.length ? pool : level.reachableCells;
  for (let i = 0; i < n; i++) {
    const c = use[simInt(0, use.length - 1)];
    const mesh = Items.relicItem();
    const baseY = (level.cells[level.idx(c.x, c.z)] || { floor: 0 }).floor + 0.7;
    mesh.position.set(c.wx, baseY, c.wz);
    scene.add(mesh);
    // hp, so a relic is something you break rather than only something you walk
    // into: the 'relics' objective is a shooting objective
    game.relics.push({ mesh, x: c.wx, z: c.wz, baseY, t: simRand() * 6, hp: RELIC_HP, maxHp: RELIC_HP });
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
  note('drop ' + id);
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
    if (Math.hypot(r.x - player.pos.x, r.z - player.pos.z) < 1.2) breakRelic(i);
  }
}

/**
 * A relic comes apart: score, a burst, one less on the floor.
 *
 * It never touches `exitOpen`. The door is opened by `updateObjective()`, which
 * reads the relic count — one writer for the gate, which is the rule this
 * codebase has paid for four times over.
 * @param {number} i Index into `game.relics`.
 */
function breakRelic(i) {
  const r = game.relics[i];
  if (!r) return;
  game.score += 150;
  effects.burst({ x: r.x, y: r.baseY, z: r.z }, 0xc77dff, 14, 3, 0.5, 3);
  audio.play('key', { x: r.x, z: r.z });
  dropMesh(r.mesh);
  game.relics.splice(i, 1);
  if (!game.relics.length) {
    game.sideDone = true;
    game.score += 400;
    hud.toast('SIDE OBJECTIVE COMPLETE  +400', 2.4);
    // he pays for the relics he asked for, once. The door is still updateObjective's
    if (game.flags && game.flags.keshiRelics === 1) {
      game.flags.keshiRelics = 2;
      game.coins = (game.coins || 0) + NPC_RELICS.pays;
      hud.toast('KESHI PAYS  +' + NPC_RELICS.pays + ' COINS', 2.4);
      note('npc relic job paid');
    }
  } else {
    hud.toast('RELIC  ' + (game.relicsTotal - game.relics.length) + '/' + game.relicsTotal);
  }
}

/**
 * A shot at a relic: the ray is tested against the relic's column, the same way
 * a barrel is, so a shot over the top of it misses.
 * @param {{x:number,y:number,z:number}} origin The muzzle.
 * @param {{x:number,y:number,z:number}} dir Normalised ray.
 * @param {number} maxDist How far the shot carries before a wall stops it.
 * @param {number} amount Damage.
 * @returns {boolean} True when a relic took the shot.
 */
function damageRelic(origin, dir, maxDist, amount) {
  let best = -1;
  let bestT = Infinity;
  const len = Math.hypot(dir.x, dir.z) || 1;
  for (let i = 0; i < game.relics.length; i++) {
    const r = game.relics[i];
    const t = ((r.x - origin.x) * dir.x + (r.z - origin.z) * dir.z) / len;
    if (t < 0 || t > maxDist) continue;
    const px = origin.x + (dir.x / len) * t;
    const pz = origin.z + (dir.z / len) * t;
    if (Math.hypot(r.x - px, r.z - pz) > 0.5) continue;
    const rayY = origin.y + (dir.y / len) * t;
    if (rayY < r.baseY - 0.9 || rayY > r.baseY + 0.6) continue;
    if (t < bestT) { bestT = t; best = i; }
  }
  if (best < 0) return false;
  const r = game.relics[best];
  r.hp -= amount;
  effects.burst({ x: r.x, y: r.baseY, z: r.z }, 0xc77dff, 5, 2.5, 0.35, 12);
  if (r.hp <= 0) breakRelic(best);
  return true;
}

function startWave(n) {
  note('wave ' + game.wave + ' start');

  // The pad is inside the exit room, so stepping on it to start the next wave
  // re-locked the doors with the player already inside: sealed in a room with
  // the enemies outside and no way to reach them. A wave now always starts you
  // where the level started you.
  const cellNow = level.cells[Math.round(player.pos.z / CELL) * level.W + Math.round(player.pos.x / CELL)];
  const nearPad = Math.hypot(player.pos.x - level.exit.x, player.pos.z - level.exit.z) < 3.5;
  if ((cellNow && cellNow.room === level.exitRoom) || nearPad) {
    player.pos.set(level.spawn.x, 0, level.spawn.z);
    if (player.vel && player.vel.set) player.vel.set(0, 0, 0);
    note('wave start: player was in the exit room, returned to the spawn');
  }

  game.wave = n;
  game.waveKills = 0;
  game.waveStart = elapsed;
  game.hasKey = false;
  // a 'reach' level is open from the first frame — buildRun() says so and this
  // function shut it again on every level since 1.99, which is why the gate read
  // as a pen you empty rather than a place you cross
  const reach = game.objectiveType === 'reach';
  game.exitOpen = reach;
  game.warnedKey = false;
  level.doorOpen = reach;
  if (reach) {
    for (const m of levelMeshes.doorMeshes) {
      m.visible = false;
      m.userData.slide = 1;
      m.userData.opening = false;
      if (m.userData.lamp) m.userData.lamp.material.color.setHex(0x39ff9a);
    }
    getMats()['pad'].color.setHex(0x39ff9a);
  } else {
    levelMeshes.doorMeshes.forEach((m) => {
      m.visible = true;
      m.userData.slide = 0;
      m.userData.opening = false;
      m.position.y = m.userData.baseY != null ? m.userData.baseY : m.position.y;
      if (m.userData.lamp) m.userData.lamp.material.color.setHex(0xff3b30);
    });
    getMats()['pad'].color.setHex(0x552222);
  }

  clearPickups();
  enemies.clear(); // defensive: a wave always starts from an empty arena
  // A map that places its own bodies spawns exactly those: a level's encounters
  // are a design decision, and a roster rolled from a seed is not one. No wave,
  // no roster, no boss unless one was placed.
  if (level.enemies && level.enemies.length) {
    for (const e of level.enemies) {
      enemies.spawnAt(e.type, e.x * CELL, e.z * CELL, n);
    }
    saveRun();
    hud.toast('WAVE ' + n, 2);
    audio.play('wave');
    return;
  }
  const mode = MODES[game.mode] || MODES.campaign;
  // the last level of each act is a boss level, and the boss is that act's own
  const bossLevel = game.bossLevel === true;
  enemies.spawnWave(n, player.pos, {
    // On a campaign level the LEVEL decides, not the zone: the throne's zone flag
    // put THE GATE on levels 25 to 31 as well, so a player met the act boss seven
    // times before the level it belongs to.
    boss: game.level ? bossLevel : (mode.bossRush || !!zone.boss),
    // boss rush is per zone, so the zone picks the boss; a campaign level picks
    // by its act
    bossType: mode.bossRush ? (BOSS_FOR_ZONE[zone.id] || 'warden') : BOSS_FOR_ACT[game.bossAct || 1],
    // the act decides what walks towards you: a level is one wave, so the
    // wave-number ladder inside spawnWave never got past imps in the campaign
    roster: game.bossAct ? ROSTER_FOR_ACT[game.bossAct] : null,
    waves: game.wavesTarget,
  });
  spawnPickups(n);
  if (n >= 3) spawnKeycard();
  saveRun();

  hud.toast('WAVE ' + n, 2);
  audio.play('wave');

  // the warden gets an entrance: skippable, then control back. The camera walks
  // in along a real path from the far side of his own room — the old arc orbited
  // him and could end up inside a wall
  const boss = enemies.boss;
  if (boss && game.state === 'playing' && !game.bossSeen) {
    game.bossSeen = true;
    game.state = 'cinematic';
    releaseLock();
    const back = () => {
      game.state = 'playing';
      requestLock();
      clock.getDelta();
    };
    // the boss's own name, not the warden's: four acts, four entrances
    const title = (boss.T && boss.T.label) || 'A BOSS';
    const line = (game.bossLevel ? 'ACT ' + game.bossAct + ' ENDS' : zone.name) + ' · ' + game.wave + ' of ' + game.wavesTarget;
    const path = bossApproach(boss);
    if (!path || !cinematic.playWalk(path, {
      title,
      line,
      lookAt: { x: boss.pos.x, y: boss.pos.y + boss.height * 0.62, z: boss.pos.z },
      speed: 3.2,
      onDone: back,
    })) {
      cinematic.play(boss, title, line, back);
    }
  }
}

/**
 * A camera path to the boss from the far side of the room he stands in.
 *
 * His own room, not the player's: the doors are shut when a wave starts, so a
 * path from the player would cross a door and the flow field would refuse it.
 * @param {object} boss The enemy to walk towards.
 * @returns {object|null} A path from `buildCameraPath`, or null.
 */
function bossApproach(boss) {
  if (!level || !boss) return null;
  const room = cellAt(level, boss.pos.x, boss.pos.z);
  if (!room || room.room < 0) return null;
  let from = null;
  let best = 3;   // shorter than this is not worth a cut at all
  for (const c of level.reachableCells) {
    if (c.room !== room.room) continue;
    const d = Math.hypot(c.wx - boss.pos.x, c.wz - boss.pos.z);
    if (d > best) { best = d; from = c; }
  }
  if (!from) return null;
  return buildCameraPath(level, { x: from.wx, z: from.wz }, { x: boss.pos.x, z: boss.pos.z });
}

// The performance preset drops bloom; the others keep it. A device that cannot
// afford four quarter-res passes should not be given them.
/**
 * The difficulty preset, scaled by which zone you are in. The preset alone made
 * zone 1 wave 3 identical to zone 5 wave 3, so the first level was as hard as
 * the last one at the same wave number — which is how a player dies on level
 * one and never sees the other four.
 */
/**
 * The threat floor for the level being played, or 0 for a zone run.
 * @returns {number} A multiplier.
 */
function levelThreat() {
  if (!game.level) return 0;
  const row = storyLevel(game.level);
  if (!row) return 0;
  return ACT_THREAT[Math.min(ACT_THREAT.length - 1, Math.max(0, row.act - 1))];
}

function zoneDiff() {
  const mode = MODES[gameMode] || MODES.campaign;
  const preset = mode.forceHard ? 'hard' : settings.difficulty;
  const base = DIFF_MULT[preset] || DIFF_MULT.normal;
  const t = Math.max((zone && zone.threat) || 1, levelThreat());
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
  bullets: { color: 0xffd24a, build: () => Items.ammoBox(false), toast: '+20 BULLETS', apply: (p) => { p.addAmmo('bullets', 20); } },
  shells: { color: 0xff8a3c, build: () => Items.shellPickup(), toast: '+6 SHELLS', apply: (p) => { p.addAmmo('shells', 6); } },
  rockets: { color: 0x8fe04a, build: Items.rocket, toast: '+2 ROCKETS', apply: (p) => { p.addAmmo('rockets', 2); } },
};

function randomCell(minDist = 0, roomsOnly = true) {
  const pool = level.reachableCells.filter((c) => {
    if (roomsOnly && c.room < 0) return false;
    // not on a deck: a pickup 2.4 m up is a pickup you cannot see from the floor,
    // and the cell is in the flow field at ground level either way
    if (c.sectors) return false;
    if (c.x === level.exit.cx && c.z === level.exit.cz) return false;
    return Math.hypot(c.wx - player.pos.x, c.wz - player.pos.z) > minDist;
  });
  const src = pool.length ? pool : level.reachableCells;
  return src[Math.floor(simRand() * src.length)];
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
    // the barrel is 1.1 m tall and stands on the floor: a shot that passes over
    // it, or into the ceiling above it, must miss. Without this you could set a
    // barrel off by firing at the wall above it.
    const floorY = floorHeightAt(level, b.x, b.z);
    const rayY = origin.y + (dir.y / len) * t;
    if (rayY < floorY - 0.1 || rayY > floorY + 1.25) continue;
    if (t < bestT) { bestT = t; best = b; }
  }
  if (!best) return false;
  best.hp -= amount;
  if (best.hp <= 0) explodeBarrel(best);
  return true;
}

function spawnPickups(wave) {
  const kinds = Object.keys(PICKUP_DEFS);
  // a greedy run finds more on the floor
  const count = 3 + Math.min(5, wave) + (effectsFor(game.flags).pickups || 0);
  for (let i = 0; i < count; i++) {
    const cell = randomCell(4);
    const kind = kinds[Math.floor(simRand() * kinds.length)];
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
  game.pickups.push({ kind, mesh, x, z, baseY, t: simRand() * 6 });
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
  return use[Math.floor(simRand() * use.length)];
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
  // a 'relics' level must not open its door because the room happens to be empty:
  // the relics own it. 'survive' keeps the clear path as a second way out, which
  // is how 1.99.0 shipped it and what the playability suite plays.
  if (game.objectiveType === 'relics') return;
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

/**
 * Start a campaign level.
 *
 * The level is a row in `story-levels.js` dressed on its zone, so the palette,
 * the props and the threat still come from the zone table. One wave, one
 * objective, and the pad ends the level rather than advancing to wave two.
 * @param {number} n 1-based level number.
 * @returns {boolean} False when there is no such level.
 */
function beginLevel(n, fresh = false) {
  const row = storyLevel(n);
  const def = row ? storyLevelZone(row) : null;
  if (!def) return false;
  // the number goes in through beginZone, before buildRun: the difficulty table
  // reads it, and setting it afterwards left every level on its zone's threat
  beginZone(def, n, fresh);
  // the box shows the level's own seed, and stops counting as a typed override
  const box = document.getElementById('seedInput');
  if (box) box.value = def.seed;
  seedTouched = false;
  return true;
}

/**
 * The level to start from: the first one not yet cleared, or the last.
 * @returns {number} A 1-based level number.
 */
function nextLevel() {
  const done = progress.levels || [];
  for (let n = 1; n <= STORY_LEVELS.length; n++) if (!done.includes(n)) return n;
  return STORY_LEVELS.length;
}

/**
 * Start a run: a zone, or one campaign level.
 * @param {object} zoneDef The zone definition to dress the run in.
 * @param {number} [levelN] The campaign level, or 0 for a zone run.
 */
function beginZone(zoneDef, levelN = 0, fresh = false) {
  audio.init();
  // a level change cancels a cutscene and a caption: they belong to the level
  // that started them, and one left running fired its callback into the next run
  cinematic.stop();
  dialogue.stop();
  // a zone run is not a level: without this, starting a zone after playing a
  // level kept the level's number, and the zone inherited the level's rules
  game.level = levelN || 0;
  if (!zoneDef || zoneDef.id === ZONES[0].id) game.upgrades = {};
  zone = zoneDef || zone;
  game.zoneId = zone.id;
  try { history.replaceState(null, '', '?zone=' + encodeURIComponent(zone.id)); } catch (e) { /* no history */ }
  buildRun(zone.seed, zone, fresh);
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
  if (zone && zone.bed) audio.startBed(zone.bed);
  hud.setVisible(true);
  hideScreens();
  const row = game.level ? storyLevel(game.level) : null;
  hud.toast(getClass(id).name + '  ·  ' + (row ? 'LEVEL ' + row.n + ' · ' + row.title : zone.name), 2.4);
  queueHints();
  clock.getDelta();
  // a story level opens with its scene, and control waits for it: a caption you
  // are being shot through is not a cutscene. A zone played outside the level
  // table has no scene and starts at once, which is how 1.x shipped.
  const intro = dialogueFor('intro');
  if (intro && dialogue.play(intro, {
    onDone: () => {
      game.state = 'playing';
      requestLock();
      clock.getDelta();
    },
  })) {
    game.state = 'cinematic';
    return;
  }
  requestLock();
}

/**
 * The written scene for the level being played, or null.
 *
 * Only the campaign table has scenes: the nine-zone campaign predates it and
 * keeps its terminals, so a zone run starts and ends with no caption at all.
 * @param {string} kind `intro` or `outro`.
 * @returns {{who:string,text:string}[]|null} The lines.
 */
function dialogueFor(kind) {
  if (!game.storyLevel) return null;
  return sceneFor(storyLevel(game.storyLevel), kind);
}

let mapReturn = 'playing';
/**
 * The campaign map: 32 levels in four acts, locked past the one you reached.
 */
function renderLevelMap() {
  const hint = document.getElementById('mapHint');
  const next = nextLevel();
  const row = storyLevel(next);
  if (hint) {
    hint.textContent = row
      ? 'NEXT — LEVEL ' + next + ' · ' + row.title + ' · ' + (row.objective.type || 'clear')
      : 'EVERY LEVEL CLEARED';
  }
  const wrap = document.getElementById('zoneList');
  if (!wrap) return;
  const done = progress.levels || [];
  let html = '';
  let act = 0;
  for (const l of STORY_LEVELS) {
    if (l.act !== act) {
      act = l.act;
      html += `<div class="actrow">ACT ${act}</div>`;
    }
    const open = isLevelUnlocked(progress, l.n);
    const cleared = done.includes(l.n);
    const best = (progress.best || {})['l' + l.n] || 0;
    html += `<button class="zonerow ${open ? '' : 'locked'}" data-level="${l.n}" ${open ? '' : 'disabled'}>
      <span class="zi">${String(l.n).padStart(2, '0')}</span>
      <span class="zn">${l.title}</span>
      <span class="zb">${open ? l.objective.type + (l.objective.time ? ' · ' + l.objective.time + 's' : '') +
        (l.objective.relics ? ' · ' + l.objective.relics + ' relics' : '') : 'Locked'}</span>
      <span class="zs">${cleared ? 'CLEARED' : ''}${best ? ' · ' + best : ''}</span>
    </button>`;
  }
  wrap.innerHTML = html;
  wrap.querySelectorAll('[data-level]').forEach((el) => {
    el.addEventListener('click', () => beginLevel(Number(el.getAttribute('data-level'))));
  });
}

function showZoneMap() {
  // the map is the "what now" screen: every zone, its state, and the one line
  // that says what the next action is. In campaign mode it lists the 32 levels
  // instead, grouped by act — the zones are the dressing now, not the run.
  game.state = 'map';
  hud.setVisible(false);
  if ((MODES[gameMode] || {}).levels || game.level) {
    renderLevelMap();
    showScreen('map');
    return;
  }
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

/**
 * The interact key: the helper first, then the terminal. One key, two things to
 * talk to, and the one you are standing next to is the one that answers.
 */
function interact() {
  if (game.state !== 'playing') return;
  const n = level && level.npc;
  if (n && npcBody && Math.hypot(player.pos.x - n.wx, player.pos.z - n.wz) < 2.1) {
    if (openNpcOffer()) return;
    if (openNpcShop()) return;
  }
  openLore();
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
    note('stuck-spawn fail-safe fired, doors opened');
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
      note('locked door at ' + d.x + ',' + d.z + ' wave ' + game.wave);
      lockedDoorT = 3;
      audio.play('door');
      return;
    }
  }
}

/** The exit beacon leans green the moment the pad opens. */
/** #50 — a lift cell moves its own floor, and the plate that draws it moves too. */
function updateLifts(dt) {
  if (!level || !level.lifts) return;
  for (const l of level.lifts) {
    const c = l.cell;
    const L2 = c.lift;
    if (L2.wait > 0) { L2.wait -= dt; continue; }
    L2.y += L2.dir * 1.6 * dt;
    if (L2.y >= L2.high) { L2.y = L2.high; L2.dir = -1; L2.wait = 1.2; }
    else if (L2.y <= L2.low) { L2.y = L2.low; L2.dir = 1; L2.wait = 1.2; }
  }
  if (levelMeshes && levelMeshes.group) {
    for (const m of levelMeshes.group.children) {
      if (m.userData && m.userData.liftCell) m.position.y = m.userData.liftCell.lift.y - 0.08;
    }
  }
}

/**
 * The helper: nearest live enemy inside his room, in range, shot on a cooldown.
 * A stationary fighter is the drone's update loop with a room instead of a leash
 * and a target instead of a follow point.
 */
// ---- the editor ------------------------------------------------------------
// A grid you can paint, and the two buttons that matter: play it, and take it
// away. Everything it makes is a map, so it is the same kind of thing as a
// generated level.
let editor = null;

/** Build the editor on first open, and keep it after. */
function editorState() {
  if (editor) return editor;
  const canvas = document.getElementById('editorCanvas');
  editor = new Editor(canvas, { onPaint: () => renderEditorCounts() });
  const pal = document.getElementById('editorPalette');
  if (pal) {
    pal.innerHTML = PALETTE.map((p) =>
      `<button class="mode${p.code === editor.brush ? ' on' : ''}" data-code="${p.code}">${p.name}</button>`).join('');
    for (const b of pal.querySelectorAll('[data-code]')) {
      b.addEventListener('click', () => {
        editor.brush = b.getAttribute('data-code');
        for (const o of pal.querySelectorAll('[data-code]')) o.classList.toggle('on', o === b);
      });
    }
  }
  const cv = document.getElementById('editorCanvas');
  if (cv) {
    const paint = (e) => {
      const r = cv.getBoundingClientRect();
      const px = ((e.clientX - r.left) / r.width) * cv.width;
      const py = ((e.clientY - r.top) / r.height) * cv.height;
      // the brush paints a cell, or the heights of one, depending on the toggle
      const changed = editor.heightMode ? editor.paintHeightAt(px, py) : editor.paintAt(px, py);
      if (changed) { editor.render(); renderEditorCounts(); }
    };
    cv.addEventListener('pointerdown', (e) => {
      cv.setPointerCapture(e.pointerId);
      editor.beginStroke();
      paint(e);
    });
    cv.addEventListener('pointermove', (e) => { if (e.buttons) paint(e); });
    // one undo step per drag: the stroke ends when the pointer does
    cv.addEventListener('pointerup', () => { editor.endStroke(); saveEditor(); });
    cv.addEventListener('pointercancel', () => { editor.endStroke(); saveEditor(); });
  }
  // heights: a toggle and two rows of presets. A floor is what you stand on, a
  // ceiling is how much air is above it — the two numbers a sector has.
  const heightRow = document.getElementById('editorHeight');
  if (heightRow) {
    const toggle = document.getElementById('editorHeightToggle');
    if (toggle) {
      toggle.addEventListener('click', () => {
        editor.heightMode = !editor.heightMode;
        toggle.classList.toggle('on', editor.heightMode);
        hud.toast(editor.heightMode ? 'PAINTING HEIGHTS' : 'PAINTING CELLS', 1.6);
      });
    }
    for (const b of heightRow.querySelectorAll('[data-floor]')) {
      b.addEventListener('click', () => {
        editor.brushFloor = Number(b.getAttribute('data-floor'));
        editor.heightMode = true;
        if (toggle) toggle.classList.add('on');
        for (const o of heightRow.querySelectorAll('[data-floor]')) o.classList.toggle('on', o === b);
      });
    }
    for (const b of heightRow.querySelectorAll('[data-ceil]')) {
      b.addEventListener('click', () => {
        editor.brushCeil = Number(b.getAttribute('data-ceil'));
        editor.heightMode = true;
        if (toggle) toggle.classList.add('on');
        for (const o of heightRow.querySelectorAll('[data-ceil]')) o.classList.toggle('on', o === b);
      });
    }
  }
  // what ends the level: four objectives, and the map carries the choice
  const objRow = document.getElementById('editorObjective');
  if (objRow) {
    for (const b of objRow.querySelectorAll('[data-obj]')) {
      b.addEventListener('click', () => {
        const type = b.getAttribute('data-obj');
        editor.objective = { type, time: 60, relics: 3 };
        for (const o of objRow.querySelectorAll('[data-obj]')) o.classList.toggle('on', o === b);
        renderEditorCounts();
        saveEditor();
      });
    }
  }
  const sizeRow = document.getElementById('editorSize');
  if (sizeRow) {
    for (const b of sizeRow.querySelectorAll('[data-size]')) {
      b.addEventListener('click', () => {
        const n = Number(b.getAttribute('data-size'));
        if (editor.resize(n, n)) {
          for (const o of sizeRow.querySelectorAll('[data-size]')) o.classList.toggle('on', o === b);
          renderEditorCounts();
          saveEditor();
        }
      });
    }
  }
  return editor;
}

/**
 * Keep the grid between visits. localStorage is the same place the best run and
 * the campaign live, and a map is 6 kB at its largest.
 */
function saveEditor() {
  if (!editor) return;
  try { localStorage.setItem('hellgate.editor', mapToJSON(editor.toMap())); } catch (e) { /* private mode */ }
}

/** The saved grid, or null. */
function loadEditor() {
  try {
    const text = localStorage.getItem('hellgate.editor');
    return text ? mapFromJSON(text) : null;
  } catch (e) { return null; }
}

/** Fill the library picker with the names there are. */
function renderMapLib() {
  const pick = document.getElementById('editorPick');
  if (!pick) return;
  const names = mapLib.names();
  pick.innerHTML = names.length
    ? names.map((n) => `<option value="${n}">${n}</option>`).join('')
    : '<option value="">no saved maps</option>';
}

/** The read-out under the canvas: what is on the grid. */
function renderEditorCounts() {
  const el = document.getElementById('editorCounts');
  if (!el || !editor) return;
  const c = editor.counts();
  // how many cells stand above the floor: the number that says whether this is a
  // room or a level
  let raised = 0;
  for (let i = 0; i < editor.floors.length; i++) if (editor.floors[i] > 0.01) raised++;
  el.textContent = editor.w + ' × ' + editor.h + '  ·  ' +
    PALETTE.filter((p) => c[p.code]).map((p) => c[p.code] + ' ' + p.name.toLowerCase()).join('  ·  ') +
    (raised ? '  ·  ' + raised + ' raised' : '') +
    (editor.heightMode ? '  ·  heights: floor ' + editor.brushFloor + ', ceil ' + editor.brushCeil : '') +
    (editor.enemies.length ? '  ·  ' + editor.enemies.length + ' placed' : '') +
    '  ·  objective: ' + editor.objective.type;
}

/** Open the editor, seeded from the level you are on if there is one. */
function openEditor() {
  const ed = editorState();
  // the grid you left, then the level you are standing in, then a blank one
  const saved = loadEditor();
  if (saved) ed.load({ w: saved.W, h: saved.H, grid: saved.cells.map((c) => (c.solid ? '#' : c.exit ? 'X' : c.door ? '+' : c.stair ? '=' : c.lift ? '^' : c.crate ? '~' : '.')).join('') });
  else if (level) ed.fromLevel(level);
  else ed.load(null);
  renderEditorCounts();
  renderMapLib();
  game.state = 'editor';
  hud.setVisible(false);
  showScreen('editor');
}

/** Play what is on the grid, now. */
function playEditorMap() {
  if (!editor) return;
  const map = importMap(editor.toMap());
  if (!map) { hud.toast('THE MAP IS NOT PLAYABLE', 2); return; }
  pendingMap = map;
  hideScreens();
  beginLevel(1, true);
  hud.toast('YOUR MAP', 2);
}

// ---- the first time a level is played --------------------------------------
// One line at a time, four seconds apart, on a level the player has not cleared.
// A hint on a level you have beaten is a nag.
let hintQueue = [];
let hintAt = 0;

/** Queue the level's hints, unless it has been cleared before. */
function queueHints() {
  hintQueue = [];
  hintAt = 0;
  if (!game.level) return;
  if ((progress.levels || []).includes(game.level)) return;
  hintQueue = (LEVEL_HINTS[game.level] || []).slice();
}

/** Show the next hint when its turn comes. */
function updateHints(dt) {
  if (!hintQueue.length) return;
  hintAt += dt;
  if (hintAt < 4) return;
  hintAt = 0;
  hud.toast(hintQueue.shift(), 3.2);
}

// ---- the controls screen ---------------------------------------------------
// Every key the game answers, in one table, rendered into a panel. The suite
// checks this table against the key handler: a binding added without a line here
// is a red run, because a control nobody documents is a control nobody uses.
const CONTROLS = [
  { keys: 'W A S D', does: 'move' },
  { keys: 'MOUSE', does: 'look' },
  { keys: 'LMB', does: 'fire' },
  { keys: 'SHIFT', does: 'sprint' },
  { keys: 'SPACE', does: 'jump' },
  { keys: '1 2 3 4', does: 'pistol · shotgun · rocket · chaingun' },
  { keys: 'X', does: 'next weapon' },
  { keys: 'Q E R', does: 'the three powers' },
  { keys: 'G', does: 'grenade' },
  { keys: 'F', does: 'blade' },
  { keys: 'V', does: 'read · talk · shop — whatever is in front of you' },
  { keys: 'TAB', does: 'status: class, weapons, powers, buffs' },
  { keys: 'J', does: 'journal' },
  { keys: 'C', does: 'codex, searchable' },
  { keys: 'M', does: 'the map' },
  { keys: 'N', does: 'sound on or off' },
  { keys: 'ESC', does: 'pause, or close the panel you are in' },
  { keys: '`', does: 'frame time' },
  { keys: 'F3', does: 'draw calls and body count' },
  { keys: 'F11', does: 'fullscreen' },
];

/** Draw the controls table. */
function renderControls() {
  const body = document.getElementById('controlsBody');
  if (!body) return;
  // the same list the journal uses, so a key and its job read like every other
  // row of numbers in this game
  body.innerHTML = `<div class="diarycol"><ul>` + CONTROLS.map((c) =>
    `<li><b>${c.keys}</b><span>${c.does}</span></li>`).join('') + `</ul></div>`;
}

/** Where the panel was opened from, so closing it goes back there. */
let controlsFrom = 'title';

/**
 * Open the controls panel.
 * @param {string} [from] 'title' or 'playing'; guessed from the state.
 */
function showControls(from) {
  controlsFrom = from || (game.state === 'title' || game.state === 'class' ? 'title' : 'playing');
  renderControls();
  game.state = 'controls';
  hud.setVisible(false);
  showScreen('controls');
}

/** Close it, back to wherever it was opened from. */
function closeControls() {
  hideScreens();
  if (controlsFrom === 'title') {
    game.state = 'title';
    showScreen('title');
    return;
  }
  hud.setVisible(true);
  game.state = 'playing';
  requestLock();
}

// ---- the helper's job ------------------------------------------------------
// He fights from his room and he sells ammo. This is the third thing the brief
// asks of him: he asks for something, and he pays for it. The offer is a caption
// with two keys, not a new panel — the letterbox is already on screen and the
// player already knows how to read it.
let npcOffer = null;

/** The job, and what he pays for it. Two stages: taken, then done. */
const NPC_JOB = { first: 150, second: 250 };

/** What he charges to open the door for you, once the job is paid. */
const NPC_DOOR = 250;

/** What he pays for three relics, and how many he asks for. */
const NPC_RELICS = { count: 3, pays: 300 };

/** The shop, in the order the keys list it. Sold on `V`, never on arrival. */
const NPC_SHOP = [
  { kind: 'bullets', n: 20, price: 40 },
  { kind: 'shells', n: 8, price: 60 },
  { kind: 'rockets', n: 3, price: 100 },
];

/**
 * The quest state for the helper in this level, restored from the run's flags.
 * A resumed run must not be offered the same job twice.
 * @returns {string} 'none' | 'declined' | 'taken' | 'done'
 */
function npcQuestState() {
  const paid = (game.flags && game.flags.keshi) || 0;
  if (paid >= 2) return 'done';
  if (paid >= 1) return 'taken';
  return 'none';
}

/**
 * Which offer he has for you right now, or null.
 *
 * Two of them, and the second is the brief's other half: a job that pays, and a
 * price that changes what ends the level. He will not sell you a door you have
 * already walked through, or one a `reach` level left open.
 * @param {object|null} n `level.npc`.
 * @returns {string|null} 'job' | 'door' | null
 */
function npcOfferKind(n) {
  if (!n) return null;
  if (n.quest === 'none') return 'job';
  if (n.quest !== 'done' || game.exitOpen) return null;
  // the third offer comes first once it is available: it changes what the level
  // is, and a player who takes it should not be sold a door in the same breath
  const relics = (game.flags && game.flags.keshiRelics) || 0;
  if (!relics && game.objectiveType === 'clear' && !game.relicsTotal) return 'relics';
  const bought = (game.flags && game.flags.keshiDoor) || 0;
  if (!bought && game.objectiveType !== 'reach') return 'door';
  return null;
}

/**
 * His shop, as a caption with three keys and a way out.
 * @returns {boolean} True when the shop opened.
 */
function openNpcShop() {
  const n = level && level.npc;
  if (!n || npcOffer) return false;
  npcOffer = { n, kind: 'shop' };
  renderNpcShop();
  return true;
}

/** The shop line, redrawn after every purchase so the coins and the stock are current. */
function renderNpcShop() {
  const line = document.getElementById('cineLine');
  const name = document.getElementById('cineName');
  const root = document.getElementById('letterbox');
  if (name) name.textContent = 'KESHI';
  if (line) {
    line.textContent = NPC_SHOP
      .map((it, i) => '[' + (i + 1) + '] ' + it.n + ' ' + it.kind + '  ' + it.price)
      .join('   ') + '   [4] leave   ·   you have ' + (game.coins || 0) + ' coins';
  }
  if (root) {
    root.classList.add('on');
    root.classList.add('talking');
  }
}

/** Stand next to him and he asks. */
function openNpcOffer() {
  const n = level && level.npc;
  if (!n || npcOffer) return false;
  const kind = npcOfferKind(n);
  if (!kind) return false;
  npcOffer = { n, kind };
  const root = document.getElementById('letterbox');
  const name = document.getElementById('cineName');
  const line = document.getElementById('cineLine');
  if (name) name.textContent = 'KESHI';
  if (line) {
    line.textContent = kind === 'job'
      ? 'Clear this room and it is worth ' + NPC_JOB.second + ' to me. Up front, ' +
        NPC_JOB.first + ' and a trinket.   [1] take the job   [2] not now'
      : kind === 'relics'
        ? 'There are ' + NPC_RELICS.count + ' relics under this floor. Break them and I pay ' +
          NPC_RELICS.pays + '. The door answers to them, not to an empty room.   [1] do it   [2] not now'
        : 'The door. ' + NPC_DOOR + ' and I open it where you stand, relics or no relics.   [1] pay   [2] not now';
  }
  if (root) {
    root.classList.add('on');
    root.classList.add('talking');
  }
  return true;
}

/** Close the caption. The letterbox is shared, so it goes back the way it was. */
function closeNpcOffer() {
  npcOffer = null;
  const root = document.getElementById('letterbox');
  if (root) {
    root.classList.remove('on');
    root.classList.remove('talking');
  }
}

/**
 * Answer the helper: 0 takes what he is offering, 1 declines it.
 * @param {number} i Which option.
 * @returns {boolean} True when an offer was open to answer.
 */
function takeNpcOffer(i) {
  if (!npcOffer) return false;
  const n = npcOffer.n;
  const kind = npcOffer.kind;
  closeNpcOffer();
  if (!n) return true;
  game.flags = game.flags || {};

  if (kind === 'shop') {
    // the shop stays open: a counter you have to walk back to between purchases
    // is worse than the one it replaced
    if (i === 3 || i == null) return true;
    const it = NPC_SHOP[i];
    if (!it) return true;
    if ((game.coins || 0) < it.price) {
      hud.toast('NEED ' + it.price + ' COINS', 1.2);
    } else {
      game.coins -= it.price;
      player.addAmmo(it.kind, it.n);
      hud.toast('BOUGHT ' + it.n + ' ' + it.kind.toUpperCase() + '  -' + it.price, 1.4);
      audio.play('pickup');
    }
    npcOffer = { n, kind: 'shop' };
    renderNpcShop();
    return true;
  }

  if (kind === 'relics') {
    if (i !== 0) {
      hud.toast('KESHI  ·  ANOTHER TIME', 1.6);
      return true;
    }
    // the flag changes the objective: the room no longer ends this level, the
    // relics do, and updateObjective() already knows how to read that
    game.flags.keshiRelics = 1;
    game.objectiveType = 'relics';
    game.objectiveT = 0;
    game.exitOpen = false;
    level.doorOpen = false;
    spawnRelics(NPC_RELICS.count);
    hud.toast(NPC_RELICS.count + ' RELICS  ·  BREAK THEM ALL', 2.4);
    audio.play('key');
    note('npc relic job taken');
    return true;
  }

  if (kind === 'door') {
    if (i !== 0) {
      hud.toast('KESHI  ·  THE DOOR STAYS SHUT', 1.6);
      return true;
    }
    if ((game.coins || 0) < NPC_DOOR) {
      hud.toast('NEED ' + NPC_DOOR + ' COINS', 1.4);
      return true;
    }
    game.coins -= NPC_DOOR;
    game.flags.keshiDoor = 1;
    // openExit() stays the only writer of exitOpen: he sells the door, he does
    // not open it himself
    openExit();
    hud.toast('DOOR BOUGHT  -' + NPC_DOOR + ' COINS', 2.2);
    audio.play('door');
    note('npc door bought');
    return true;
  }

  if (i !== 0) {
    n.quest = 'declined';
    hud.toast('KESHI  ·  ANOTHER TIME', 1.6);
    return true;
  }
  n.quest = 'taken';
  game.flags.keshi = 1;
  game.coins = (game.coins || 0) + NPC_JOB.first;
  const id = (TRINKETS[Math.floor(simRand() * TRINKETS.length)] || {}).id;
  if (id) dropTrinket(id, { x: n.wx + 0.9, z: n.wz });
  hud.toast('JOB TAKEN  +' + NPC_JOB.first + ' COINS', 2.2);
  audio.play('pickup');
  note('npc job taken');
  return true;
}

/** The second half: the room he stands in has to be empty of the living. */
function checkNpcJob() {
  const n = level && level.npc;
  if (!n || n.quest !== 'taken') return;
  const here = cellAt(level, player.pos.x, player.pos.z);
  if (!here || here.room !== n.room) return;
  for (const e of enemies.list) {
    if (!e.alive) continue;
    const c = cellAt(level, e.pos.x, e.pos.z);
    if (c && c.room === n.room) return;
  }
  n.quest = 'done';
  game.flags.keshi = 2;
  game.coins = (game.coins || 0) + NPC_JOB.second;
  hud.toast('KESHI PAYS UP  +' + NPC_JOB.second + ' COINS', 2.4);
  audio.play('wave');
  note('npc job paid');
}

function updateNpc(dt) {
  const n = level && level.npc;
  if (!n || !npcBody || !enemies) return;
  n.cd -= dt;
  let best = null;
  let bestD = 9;
  for (const e of enemies.list) {
    if (!e.alive) continue;
    const d = Math.hypot(e.pos.x - n.wx, e.pos.z - n.wz);
    if (d < bestD) { bestD = d; best = e; }
  }
  // the shop is on `V` now. It used to buy the cheapest thing you were short of
  // the moment you walked up with coins in your pocket, every 1.2 s, without
  // asking — which spent the 250 the door costs while you were reading the offer
  const pd = Math.hypot(player.pos.x - n.wx, player.pos.z - n.wz);
  // the prompt is set after update()'s lore prompt, so it wins when both are near
  if (pd < 2.1 && !npcOffer) {
    const talk = !!npcOfferKind(n);
    hud.setPrompt(TOUCH ? (talk ? 'TALK' : 'SHOP') : (talk ? 'V  TALK' : 'V  SHOP'));
  }
  checkNpcJob();

  if (!best) return;
  npcBody.rotation.y = Math.atan2(best.pos.x - n.wx, best.pos.z - n.wz);
  if (n.cd > 0) return;
  n.cd = 0.55;
  const from = new THREE.Vector3(n.wx, npcBody.position.y + 1.35, n.wz);
  const to = new THREE.Vector3(best.pos.x, best.pos.y + best.height * 0.5, best.pos.z);
  if (effects) {
    effects.tracer(from, to, 0xffd24a);
    effects.muzzleFlash(from, 0.22);
  }
  if (audio) audio.play('shot', from);
  best.hurt(14, {
    level, player, effects, audio, projectiles,
    onKill: enemies.onKill, weapon: 'KESHI', hud, camera,
  }, { x: (to.x - from.x) / bestD, y: 0, z: (to.z - from.z) / bestD });
  n.fired++;
}

/**
 * The one place the objective decides whether the door opens.
 *
 * `clear` and `reach` are handled by `checkWave()`; the clock and the relics are
 * derived here every frame from state that other code only ever writes to. That
 * makes it idempotent, and `openExit()` stays the only function that writes
 * `exitOpen`.
 * @param {number} dt Seconds.
 */
function updateObjective(dt) {
  if (game.state !== 'playing') return;
  if (game.exitOpen) return;
  if (game.objectiveType === 'survive') {
    game.objectiveT = Math.max(0, game.objectiveT - dt);
    if (game.objectiveT <= 0) {
      openExit();
      hud.toast('THE DOOR IS OPEN', 2);
    }
    return;
  }
  if (game.objectiveType === 'relics' && game.relicsTotal > 0 && !game.relics.length) {
    openExit();
    hud.toast('THE DOOR IS OPEN', 2);
  }
}

/** Walk up to a chest and it opens: coins, and the lid tips back. */
function updateChests(dt) {
  if (!level || !level.chests || !player) return;
  for (const ch of level.chests) {
    if (ch.opened || !ch.mesh) continue;
    if (Math.hypot(ch.wx - player.pos.x, ch.wz - player.pos.z) > 1.25) continue;
    ch.opened = true;
    game.coins = (game.coins || 0) + ch.coins;
    if (ch.lid) ch.lid.rotation.x = -1.1;
    hud.toast('+' + ch.coins + ' COINS', 1.4);
    audio.play('pickup', ch.mesh.position);
  }
}

/** The sun follows the player: the shadow camera is a 14 m box, so it has to. */
function updateSun() {
  if (!sun || !player) return;
  sun.position.set(player.pos.x + 9, player.pos.y + 16, player.pos.z + 7);
  sun.target.position.set(player.pos.x, player.pos.y, player.pos.z);
  sun.target.updateMatrixWorld();
}

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
  if (game.objectiveType === 'survive') {
    return 'Survive ' + Math.ceil(game.objectiveT) + ' s. The door opens on the clock.';
  }
  if (game.objectiveType === 'relics') {
    return 'Break the relics: ' + game.relics.length + ' of ' + game.relicsTotal + ' left.';
  }
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
    // a campaign level says which level it is: the zone it is dressed in is not
    // the thing the player is working through
    const row = game.level ? storyLevel(game.level) : null;
    const cleared = row ? (progress.levels || []).includes(row.n) : zoneDone;
    el.innerHTML = `
      <div class="diarycol">
        <h4>${row ? 'LEVEL ' + row.n + ' OF ' + STORY_LEVELS.length + ' · ' + row.title : zone.name}</h4>
        <ul>
          <li class="wide"><b>OBJECTIVE</b><span>${objectiveLine()}</span></li>
          <li><b>WAVE</b><span>${game.wave} of ${game.wavesTarget}</span></li>
          <li><b>SCORE</b><span>${game.score}</span></li>
          <li><b>${row ? 'ACT' : 'ZONE'}</b><span>${row ? 'act ' + row.act + ' of 4 · ' + (cleared ? 'cleared before' : 'not cleared yet') : (cleared ? 'cleared before' : 'not cleared yet')}</span></li>
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

/**
 * The codex: every enemy, trinket and zone the run knows about, searchable.
 * It is built from the live tables each time it opens, so it cannot go stale.
 */
let codexState = null;
function showCodex() {
  if (game.state !== 'playing') return;
  game.state = 'codex';
  const el = document.getElementById('codexBody');
  const input = document.getElementById('codexSearch');
  codexState = buildCodex({ TYPES, TRINKETS, ZONES, kills: game.killsByType || {}, BOSS_FOR_ACT, achievements: { table: ACHIEVEMENTS, hist: record } });
  if (input) input.value = '';
  renderCodex('');
  showScreen('codex');
  if (input && input.focus) input.focus();
}

function renderCodex(q) {
  const el = document.getElementById('codexBody');
  if (!el || !codexState) return;
  const rows = codexState.search(q, 40);
  el.innerHTML = rows.length
    ? rows.map((r) => `<div class="codexentry"><b>${escapeHtml(r.item.kind)} · ${escapeHtml(r.item.name)}</b><span>${escapeHtml(r.item.text)}${r.item.note ? ' — ' + escapeHtml(r.item.note) : ''}</span></div>`).join('')
    : '<div class="codexentry"><b>NOTHING</b><span>no entry matches that</span></div>';
}

function closeCodex() {
  if (game.state !== 'codex') return;
  game.state = 'playing';
  hideScreens();
  requestLock();
  clock.getDelta();
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

/**
 * Check the achievement table against the live run, say what was unlocked, and
 * keep the history. Called at every moment that can change it.
 */
function awardFor(extra = {}) {
  const run = {
    kills: game.kills,
    wave: game.wave,
    zone: zone && zone.id,
    score: game.score,
    elite: false,
    relic: game.relicsTotal > 0 && game.relics.length >= game.relicsTotal,
    survived: game.state !== 'dead',
    ...extra,
  };
  const fresh = checkAchievements(run, record);
  if (fresh.length) {
    saveHistory(record);
    for (const id of fresh) {
      hud.toast('UNLOCKED \u00b7 ' + achievementName(id), 2.6);
      audio.play('key');
      note('achievement: ' + id);
    }
  }
  return fresh;
}

function zoneCleared() {
  note('zone cleared: ' + (zone && zone.id));

  if (audio) { audio.stopDrone(); audio.stopBed(); }
  record.zones++;
  record.zonesCleared = Math.max(record.zonesCleared, (progress.cleared || []).length + 1);
  // the campaign's tally, from the same record the map reads: how many of the 32
  // levels are behind you, and how many whole acts
  record.levels = Math.max(record.levels || 0, (progress.levels || []).length);
  if (game.level) {
    const row = storyLevel(game.level);
    const actDone = row ? STORY_LEVELS.filter((r) => r.act === row.act)
      .every((r) => (progress.levels || []).includes(r.n)) : false;
    if (actDone) record.acts = Math.max(record.acts || 0, row.act);
  }
  if (game.flags && game.flags.keshiDoor) record.doors = Math.max(record.doors || 0, 1);
  record.best = Math.max(record.best || 0, game.score);
  saveHistory(record);
  awardFor();
  game.state = 'cleared';
  releaseLock();
  if (game.level) clearLevel(progress, game.level, game.score);
  else clearZone(progress, zone.id, game.score);
  clearRun();
  // the last level ends the campaign, and the screen has to say so: "Next level"
  // on level 32 used to restart level 32, because beginLevel clamps to 32
  const last = game.level === STORY_LEVELS.length;
  const actEnd = !last && game.level && game.bossLevel === true;
  const title = document.getElementById('clearedTitle');
  if (title) {
    title.textContent = last ? 'CAMPAIGN COMPLETE'
      : actEnd ? 'ACT ' + game.bossAct + ' COMPLETE'
        : game.level ? 'LEVEL CLEARED' : 'ZONE CLEARED';
  }
  const nextBtn = document.getElementById('clearedNext');
  if (nextBtn) nextBtn.textContent = last ? 'Back to the title' : 'Next level';
  const el = document.getElementById('clearedStats');
  if (el) {
    el.innerHTML =
      `${game.level ? 'LEVEL <b>' + game.level + ' · ' + zone.name + '</b>' : 'ZONE <b>' + zone.name + '</b>'}<br />` +
      `SCORE <b>${game.score}</b><br />KILLS <b>${game.kills}</b><br />` +
      `RELICS <b>${game.relicsTotal - game.relics.length}/${game.relicsTotal}</b>`;
  }
  const epi = document.getElementById('clearedEpilogue');
  if (epi) epi.textContent = epilogueFor(zone.id);

  // The panel arrives after the camera has stepped back across the room. The
  // state is 'cleared' from the first line of this function — the bookkeeping is
  // done, and every gate that reads it reads the truth — but the screen waits.
  const finish = () => {
    hud.setVisible(false);
    showScreen('cleared');
    audio.play('wave');
    renderChoice();
    // the level's last line, over the screen that says the level is done
    const outro = dialogueFor('outro');
    if (outro) dialogue.play(outro);
  };
  const path = outroPath();
  const look = { x: player.pos.x, y: player.pos.y + 1.3, z: player.pos.z };
  if (path && cinematic.playWalk(path, { lookAt: look, speed: 2.6, hold: 0.2, onDone: finish })) {
    hud.setVisible(false);
    return;
  }
  finish();
}

/**
 * The camera's way out: the farthest reachable cell in the room you cleared, so
 * it steps back and watches rather than turning away. Null when the room is too
 * small to be worth a cut, and the panel arrives at once.
 * @returns {object|null} A path from `buildCameraPath`.
 */
function outroPath() {
  if (!level || !player) return null;
  const here = cellAt(level, player.pos.x, player.pos.z);
  if (!here || here.room < 0) return null;
  // the room you finished in is often the smallest one on the level — the exit
  // room — so the camera steps back through the open door when it has to. The
  // doors are open by the time this runs; the field would refuse the path
  // otherwise, and null is the answer then.
  let same = null;
  let sameD = 3;
  let any = null;
  let anyD = 3;
  for (const c of level.reachableCells) {
    const d = Math.hypot(c.wx - player.pos.x, c.wz - player.pos.z);
    if (d > 12) continue;
    if (c.room === here.room && d > sameD) { sameD = d; same = c; }
    if (d > anyD) { anyD = d; any = c; }
  }
  const best = same || any;
  if (!best) return null;
  return buildCameraPath(level, { x: player.pos.x, z: player.pos.z }, { x: best.wx, z: best.wz });
}

/**
 * The story asks a question before it offers an upgrade. Two choices, both of
 * which lead to the next zone: what changes is the run, not the route.
 */
function renderChoice() {
  const wrap = document.getElementById('upgradeCards');
  if (!wrap) return;
  const node = ZONE_BOOK.nodes[game.bookAt || zone.id];
  if (!node || node.ending || !node.choices) { renderUpgrades(); return; }
  wrap.innerHTML = node.choices.map((c, i) => `
    <button class="card upgradecard" data-choice="${i}">
      <span class="n">CHOICE</span>
      <h3>${escapeHtml(c.label)}</h3>
      <p>${escapeHtml(node.text)}</p>
    </button>`).join('');
  wrap.querySelectorAll('[data-choice]').forEach((el) => {
    el.addEventListener('click', () => takeChoice(Number(el.getAttribute('data-choice'))));
  });
}

/** Take a book choice: apply its effects to the run's flags, then show upgrades. */
function takeChoice(index) {
  const node = ZONE_BOOK.nodes[game.bookAt || zone.id];
  const choice = node && node.choices && node.choices[index];
  if (!choice) { renderUpgrades(); return; }
  game.flags = game.flags || {};
  // apply only what THIS choice changed. effectsFor() sums every flag the run
  // has ever set, and beginZone() already granted that total at the start of the
  // zone — applying the sum again here paid the player twice for one choice.
  const before = effectsFor(game.flags);
  for (const e of choice.effects || []) {
    if (e.op === 'add') game.flags[e.var] = (game.flags[e.var] || 0) + e.value;
    else if (e.op === 'set') game.flags[e.var] = e.value;
  }
  game.bookAt = choice.to;
  note('choice: ' + choice.label + ' -> ' + JSON.stringify(game.flags));
  const after = effectsFor(game.flags);
  const dHp = after.maxHp - before.maxHp;
  const dArmour = after.armour - before.armour;
  if (dHp) { player.maxHp += dHp; player.health = Math.min(player.maxHp, player.health + dHp); }
  if (dArmour) player.addArmor(dArmour);
  audio.play('pickup');
  hud.toast(choice.label.toUpperCase(), 2);
  renderUpgrades();
}

function renderUpgrades() {
  const wrap = document.getElementById('upgradeCards');
  if (!wrap) return;
  const pool = UPGRADES.slice();
  const picks = [];
  for (let i = 0; i < 3 && pool.length; i++) {
    picks.push(pool.splice(Math.floor(simRand() * pool.length), 1)[0]);
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
  buildRun(seed, undefined, true);
  game.state = 'playing';
  audio.startDrone();
  if (zone && zone.bed) audio.startBed(zone.bed);
  hud.setVisible(true);
  hideScreens();
  if (!opts.auto) requestLock();
  clock.getDelta();
}

function pauseGame() {
  if (audio) { audio.stopDrone(); audio.stopBed(); }
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
  note('game over at wave ' + game.wave);

  if (game.state !== 'playing') return;
  game.state = 'dead';
  if (audio) { audio.stopDrone(); audio.stopBed(); }
  // dying is not clearing a zone: the record only counts the zone when it is
  // cleared, in zoneCleared()
  record.best = Math.max(record.best || 0, game.score);
  saveHistory(record);
  awardFor({ survived: false });
  if (MODES[gameMode] && MODES[gameMode].daily) recordDaily(game.score, game.wave, game.kills);
  refreshDaily();
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
  refreshDaily();
}

function showScreen(id) {
  for (const el of document.querySelectorAll('.screen')) el.classList.toggle('on', el.id === id);
}

function hideScreens() {
  for (const el of document.querySelectorAll('.screen')) el.classList.remove('on');
}

/** The daily line under the best run: today's seed and today's best. */
function refreshDaily() {
  const el = document.getElementById('dailyline');
  if (!el) return;
  const rec = loadDaily();
  const seed = dailySeed();
  el.innerHTML = `DAILY <b>${escapeHtml(seed.replace('daily-', ''))}</b> · BEST <b>${rec.best || 0}</b>` +
    (rec.runs ? ` · ${rec.runs} RUN${rec.runs === 1 ? '' : 'S'}` : '');
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
  // a click moves the caption on, and skips a cutscene that has no caption
  if (dialogue.playing) { dialogue.advance(); return; }
  if (cinematic.playing) { cinematic.skip(); return; }
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
  // any key advances the caption; with no caption, any key skips the cut. The
  // cinematic has documented itself as skippable on any key since 1.x and nothing
  // ever called skip() except the tests, which is how that stayed true for so long
  if (dialogue.playing) {
    dialogue.advance();
    e.preventDefault();
    return;
  }
  if (cinematic.playing) {
    cinematic.skip();
    e.preventDefault();
    return;
  }
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
  if (npcOffer) {
    const digit = /^Digit([1-4])$/.exec(e.code);
    if (digit) {
      const i = Number(digit[1]) - 1;
      // the shop has four answers; a quest has two, and anything above its last
      // option means "not now"
      takeNpcOffer(npcOffer.kind === 'shop' ? i : (i > 0 ? 1 : 0));
      e.preventDefault();
      return;
    }
    if (e.code === 'Escape') { closeNpcOffer(); e.preventDefault(); return; }
  }
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
  if (e.code === 'KeyV') interact();
  if (e.code === 'KeyG') throwGrenade();
  if (e.code === 'KeyF') swingBlade();
  if (e.code === 'Tab') { toggleInventory(); e.preventDefault(); }
  if (e.code === 'KeyJ') showDiary();
  if (e.code === 'KeyC') showCodex();
  if (e.code === 'KeyM' && game.state === 'playing') { mapReturn = 'playing'; pauseGame(); showZoneMap(); }
  if (e.code === 'F11') { toggleFullscreen(); e.preventDefault(); }
  // M is the map. It used to be mute as well, and both handlers fired on the
  // same press: opening the map silenced the game.
  if (e.code === 'KeyN') {
    changeSetting('muted', !settings.muted);
    hud.toast(settings.muted ? 'MUTED' : 'SOUND ON');
  }
});

window.addEventListener('keyup', (e) => {
  input.keys[e.code] = false;
});

// The seed box ships with a value in the markup, so "the box has text" is not
// the same as "the player typed a seed": the campaign start keyed off that and
// never fired, which is how 2.2.0 shipped a title screen that still started the
// nine-zone gate with three waves.
let seedTouched = false;
document.getElementById('seedInput').addEventListener('input', () => { seedTouched = true; });

document.getElementById('startBtn').addEventListener('click', () => {
  // a mode that plays the campaign starts the next level, not a zone. A seed the
  // player actually typed is a deliberate override and still starts a zone.
  if (MODES[gameMode] && MODES[gameMode].levels && !seedTouched) {
    beginLevel(nextLevel(), true);   // a new run: fresh money, fresh tally
    return;
  }
  // the daily overrides the seed box: a daily you can reseed is not a daily
  if (MODES[gameMode] && MODES[gameMode].daily) {
    const seed = dailySeed();
    const input = document.getElementById('seedInput');
    if (input) input.value = seed;
    beginZone({ ...zone, seed });
    return;
  }
  const typed = document.getElementById('seedInput').value.trim();
  const z = typed && typed !== zone.seed ? { ...zone, seed: typed } : zone;
  beginZone(z);
});
document.getElementById('storySkip')?.addEventListener('click', () => story.skip());
// a phone has no Escape key: the read-only panels need a visible way out
document.getElementById('editorBtnTitle')?.addEventListener('click', () => openEditor());
document.getElementById('editorClose')?.addEventListener('click', () => {
  hideScreens();
  game.state = 'title';
  showScreen('title');
});
document.getElementById('editorPlay')?.addEventListener('click', () => playEditorMap());
document.getElementById('editorSave')?.addEventListener('click', () => {
  saveEditor();
  hud.toast('MAP SAVED', 1.8);
});
document.getElementById('editorShare')?.addEventListener('click', () => {
  const ed = editorState();
  const url = ed.shareUrl();
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url);
      hud.toast('LINK COPIED  ·  ' + (url.length / 1024).toFixed(1) + ' KB', 2.6);
    }
  } catch (e) { hud.toast('COULD NOT COPY', 2); }
});
document.getElementById('editorSaveAs')?.addEventListener('click', () => {
  const ed = editorState();
  const input = document.getElementById('editorName');
  const name = (input && input.value || '').trim();
  if (!name) { hud.toast('NAME IT FIRST', 1.8); return; }
  ed.name = name;
  if (mapLib.save(name, ed.toMap())) {
    hud.toast('SAVED AS ' + name.toUpperCase(), 2);
    renderMapLib();
    // the name is spent: clear the box and point the picker at what was saved,
    // or the next name types onto the end of this one
    if (input) input.value = '';
    const pick = document.getElementById('editorPick');
    if (pick) pick.value = name;
  } else hud.toast('COULD NOT SAVE', 2);
});
document.getElementById('editorLoad')?.addEventListener('click', () => {
  const pick = document.getElementById('editorPick');
  const name = pick && pick.value;
  const map = name ? mapLib.load(name) : null;
  if (!map) { hud.toast('NO MAP PICKED', 1.8); return; }
  editorState().load(map);
  renderEditorCounts();
  hud.toast('LOADED ' + name.toUpperCase(), 1.8);
});
document.getElementById('editorDelete')?.addEventListener('click', () => {
  const pick = document.getElementById('editorPick');
  const name = pick && pick.value;
  if (!name) { hud.toast('NO MAP PICKED', 1.8); return; }
  if (mapLib.remove(name)) { hud.toast('DELETED ' + name.toUpperCase(), 1.8); renderMapLib(); }
});
document.getElementById('editorUndo')?.addEventListener('click', () => {
  if (editorState().undo()) { renderEditorCounts(); saveEditor(); }
  else hud.toast('NOTHING TO UNDO', 1.4);
});
document.getElementById('editorClear')?.addEventListener('click', () => {
  const ed = editorState();
  ed.load(null);
  renderEditorCounts();
});
document.getElementById('editorCopy')?.addEventListener('click', () => {
  const ed = editorState();
  const json = mapToJSON(ed.toMap());
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(json);
      hud.toast('MAP COPIED  ·  ' + (json.length / 1024).toFixed(1) + ' KB', 2.4);
    }
  } catch (e) { hud.toast('COULD NOT COPY', 2); }
});
document.getElementById('controlsBtnTitle')?.addEventListener('click', () => showControls('title'));
document.getElementById('controlsBtn')?.addEventListener('click', () => showControls('playing'));
document.getElementById('controlsClose')?.addEventListener('click', () => closeControls());
document.getElementById('diaryClose')?.addEventListener('click', () => closeDiary());
document.getElementById('invClose')?.addEventListener('click', () => toggleInventory());
document.getElementById('codexClose')?.addEventListener('click', () => closeCodex());
// the replay: a copy from the death and cleared screens, and a file to watch
document.getElementById('replayBtn')?.addEventListener('click', () => copyReplay());
document.getElementById('replayBtnCleared')?.addEventListener('click', () => copyReplay());
document.getElementById('watchBtn')?.addEventListener('click', () => document.getElementById('replayFile').click());
document.getElementById('replayFile')?.addEventListener('change', (e) => {
  const f = e.target.files && e.target.files[0];
  if (!f) return;
  const reader = new FileReader();
  reader.onload = () => {
    if (!watchReplay(String(reader.result))) hud.toast('NOT A REPLAY', 2);
  };
  reader.readAsText(f);
});
// the level select: the map, from the title, before a run exists
document.getElementById('levelSelectBtn')?.addEventListener('click', () => {
  mapReturn = 'title';
  showZoneMap();
});
document.getElementById('loreClose')?.addEventListener('click', closeLore);
document.getElementById('mapBtn')?.addEventListener('click', () => { mapReturn = game.state === 'cleared' ? 'cleared' : 'playing'; showZoneMap(); });
document.getElementById('mapBack')?.addEventListener('click', () => {
  // the map's Back button had no listener at all: a player on the map could not
  // leave it without picking a zone, which restarts the run
  if (mapReturn === 'cleared') { showScreen('cleared'); return; }
  if (mapReturn === 'title') {
    game.state = 'title';
    showScreen('title');
    return;
  }
  hideScreens();
  if (game.state === 'map') game.state = 'playing';
  requestLock();
  clock.getDelta();
});
document.getElementById('mapFromCleared')?.addEventListener('click', () => { mapReturn = 'cleared'; showZoneMap(); });
document.getElementById('clearedNext')?.addEventListener('click', () => {
  if (game.level >= STORY_LEVELS.length) {
    // the campaign is over: the title, not the last level again
    game.level = 0;
    hideScreens();
    game.state = 'title';
    showScreen('title');
    return;
  }
  if (game.level) { beginLevel(game.level + 1); return; }
  const i = ZONES.findIndex((z) => z.id === zone.id);
  beginZone(ZONES[Math.min(ZONES.length - 1, i + 1)]);
});
document.getElementById('seedInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') document.getElementById('startBtn').click();
});
document.getElementById('resumeBtn').addEventListener('click', resumeGame);
// A way to save on purpose. The save existed and the title screen's Continue
// button read it, but nothing in the game ever wrote one except the wave
// transitions, so a player who quit had no way to keep a run.
document.getElementById('saveQuitBtn')?.addEventListener('click', () => {
  if (game.state !== 'paused' && game.state !== 'inventory' && game.state !== 'diary') return;
  saveRun();
  hud.toast('RUN SAVED');
  // reload so the title screen builds Continue from the save just written
  setTimeout(() => location.reload(), 350);
});

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
const BUILD = '2.46.0';

// ---------------------------------------------------------------------------
// REPORT
//
// Every bug report so far has been a sentence and a screenshot, and every one
// has cost a round trip to find out which build, which seed, which wave. This
// keeps the last 40 notable events and assembles them into a block the player
// can copy in one tap.
// ---------------------------------------------------------------------------
const EVENTS = [];
function note(what) {
  EVENTS.push(`[${(performance.now() / 1000).toFixed(1)}s] ${what}`);
  if (EVENTS.length > 40) EVENTS.shift();
}

function buildReport() {
  const rs = lastRenderStats || {};
  const lines = [
    'HELLGATE report',
    'build   ' + BUILD,
    'url     ' + location.href,
    'seed    ' + (game.seed || '-'),
    'zone    ' + (zone ? zone.id + ' (' + zone.name + ')' : '-'),
    'wave    ' + game.wave + '  mode ' + gameMode + '  class ' + (game.classId || '-'),
    'state   ' + game.state + '  exitOpen ' + !!game.exitOpen + '  doors ' + !!(level && level.doorOpen),
    'player  ' + (player ? `hp ${player.health.toFixed(0)} pos ${player.pos.x.toFixed(1)},${player.pos.y.toFixed(1)},${player.pos.z.toFixed(1)}` : '-'),
    'enemies ' + (enemies ? enemies.list.length + ' (' + enemies.aliveCount + ' alive)' : '-'),
    'bodies  ' + (enemies ? JSON.stringify(enemies.instances()) : '-'),
    'level   ' + (level ? `${level.W}x${level.H} rooms ${level.rooms.length} doors ${level.doors.length} reach ${level.reachCount}` : '-'),
    'render  ' + (rs.calls != null ? `calls ${rs.calls} tris ${rs.tris}` : '-'),
    'pool    ' + JSON.stringify(poolStats()),
    'gpu     ' + (game.gpu || '-'),
    '',
    'events  (oldest first)',
    ...EVENTS,
  ];
  return lines.join('\n');
}

async function copyReport() {
  const text = buildReport();
  const out = document.getElementById('reportOut');
  if (out) {
    out.textContent = text;
    out.classList.add('on');
  }
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      hud.toast('REPORT COPIED \u00b7 PASTE IT WITH THE BUG', 2.4);
      return;
    }
  } catch (e) {
    // clipboard blocked: the panel above is the fallback, and it is selectable
  }
  hud.toast('CLIPBOARD BLOCKED \u00b7 SELECT THE TEXT ABOVE', 2.6);
}

function stampBuild() {
  const el = document.getElementById('build');
  if (!el) return;
  el.textContent = 'BUILD ' + BUILD + ' \u00b7 seed ' + (game.seed || '\u2014');
}

stampBuild();
document.getElementById('settingsBtnTitle').addEventListener('click', () => openSettings('title'));
// Both of these used to set `game.state = 'paused'` and then call a function that
// begins `if (game.state !== 'playing') return;` — so the two buttons in the pause
// menu did nothing at all, which is what the player reported. The functions set
// the state themselves; they only need to be allowed to run from paused.
document.getElementById('journalBtn')?.addEventListener('click', () => { game.state = 'playing'; showDiary(); });
document.getElementById('invBtn')?.addEventListener('click', () => { game.state = 'playing'; toggleInventory(); });
document.getElementById('settingsBtnPause').addEventListener('click', () => openSettings('pause'));
document.getElementById('reportBtn')?.addEventListener('click', () => { copyReport(); });
document.getElementById('codexSearch')?.addEventListener('input', (e) => renderCodex(e.target.value));
document.getElementById('codexSearch')?.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeCodex(); e.stopPropagation(); });
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
document.getElementById('retryBtn').addEventListener('click', () => {
  // a custom map is replayed as itself: startGame(game.seed) would build campaign
  // level 1 from a seed and quietly replace the level the player was in
  if (playingMap) {
    pendingMap = playingMap;
    beginLevel(1, true);
    return;
  }
  startGame(game.seed);
});
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
    camera,
    onKill: () => { game.kills++; },
    // weapons.js has always supported the first three; nothing passed them, so a
    // shot at a barrel, a crate or a secret wall did nothing at all. The relic is
    // the fourth, and the reason this was found.
    damageBarrels,
    damageCrate,
    damageSecret,
    damageRelic,
  };
}

// ---- replay ---------------------------------------------------------------
// `?rec=1` records the run. The recorder is fed the input *before* the game
// consumes it, and it is the only thing that ever reads the replay back.
let recorder = null;
let replayPlayer = null;

/**
 * Start recording the run that is about to begin.
 * @returns {object} The recorder.
 */
function startRecording() {
  recorder = new Recorder({
    seed: game.seed,
    level: game.level,
    zone: game.zoneId,
    classId: game.classId,
    mode: game.mode,
    difficulty: settings.difficulty,
  });
  return recorder;
}

/** The replay of the run so far, as a string, or null when nothing is recorded. */
function replayJSON() {
  return recorder ? recorder.toJSON() : null;
}

/** What the file is called: the zone, the seed and the number of frames. */
function replayFileName() {
  const r = recorder;
  const seed = (r && r.meta.seed) || game.seed || 'run';
  const n = (r && r.frames.length) || 0;
  return 'hellgate-' + String(seed).replace(/[^a-z0-9-]/gi, '') + '-' + n + '.json';
}

/**
 * Hand the replay to the player: the clipboard if there is one, a download if
 * not. A bug report is a sentence; this makes it the run.
 * @returns {string} 'copied' | 'saved' | 'none'.
 */
function copyReplay() {
  const json = replayJSON();
  if (!json) {
    hud.toast('NO REPLAY RECORDED', 1.6);
    return 'none';
  }
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(json);
      try { localStorage.setItem('hellgate.replay', json); } catch (e) { /* private mode */ }
      hud.toast('REPLAY COPIED  ·  ' + (json.length / 1024).toFixed(1) + ' KB', 2.4);
      return 'copied';
    }
  } catch (e) { /* fall through to the download */ }
  try {
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = replayFileName();
    a.click();
    URL.revokeObjectURL(url);
    hud.toast('REPLAY SAVED  ·  ' + replayFileName(), 2.4);
    return 'saved';
  } catch (e) {
    hud.toast('COULD NOT SAVE THE REPLAY', 2);
    return 'none';
  }
}

/**
 * Start a run from a replay file and hand the frames to the loop.
 * @param {string} json From `replayJSON()`.
 * @returns {boolean} True when the replay is playing.
 */
function watchReplay(json) {
  let meta = {};
  try { meta = (JSON.parse(json).meta) || {}; } catch (e) { return false; }
  if (meta.level) beginLevel(meta.level, true);
  else beginZone(zoneById(meta.zone || ZONES[0].id), 0, true);
  story.skip();
  chooseClass(meta.classId || game.classId);
  dialogue.stop();
  cinematic.stop();
  game.state = 'playing';
  if (!loadReplay(json)) return false;
  hud.setVisible(true);
  note('replay: ' + (meta.seed || '?'));
  return true;
}

/**
 * Load a replay: the meta goes into the run, the frames are played by the loop.
 * @param {string|object} data From `replayJSON()`.
 * @returns {boolean} True when a replay was loaded.
 */
function loadReplay(data) {
  try {
    replayPlayer = new ReplayPlayer(data);
    return true;
  } catch (e) {
    return false;
  }
}

function update(dt) {
  // a replay drives the input; a recording is taken before the game eats it
  if (replayPlayer) {
    if (!replayPlayer.apply(input)) {
      replayPlayer = null;
      note('replay finished');
    }
  }
  if (recorder) recorder.frame(input);
  updateHints(dt);
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
  if (companion) {
    // the drone's kills count: a kill the player did not make is still a kill
    // the run made, and the feed should say DRONE rather than nothing
    companion.onKill = enemies.onKill;
    companion.hud = hud;
    companion.camera = camera;
    companion.update(dt, player, enemies);
  }
  if (props) props.update(dt, player);
  updateRelics(dt);
  updateDrops(dt);
  updateDoors(dt);
  updateTension(dt);
  updateMusic(dt);
  updateBeacon(dt);
  updateObjective(dt);
  updateChests(dt);
  updateNpc(dt);
  updateFillLight();
  updateSun();
  updateLifts(dt);
  checkLockedDoors(dt);
  checkStuckSpawn(dt);
  // each zone breathes: embers, drips, spores. It is the same particle pool the
  // sparks use, so it costs no draw call.
  if (zone && zone.ambientFx) effects.ambient(dt, player, zone.ambientFx);
  audio.updateBed();
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
    mapName: level && level.mapName ? level.mapName : null,
    relics: game.relicsTotal - game.relics.length,
    relicsTotal: game.relicsTotal,
    objectiveType: game.objectiveType,
    objectiveT: game.objectiveT,
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
    // the caption and the camera are exclusive: whichever is playing gets the
    // frame, whatever the state — a caption or an outro runs over 'cleared' too
    if (dialogue.playing) dialogue.update(frameDt);
    else if (cinematic.playing) cinematic.update(frameDt);
    if (game.state === 'cinematic' && effects) effects.applyShake(camera);
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

  // ?level=N dresses a campaign row on top of its zone: the same palette and
  // props, the row's seed, shape and objective. The zone id stays, so unlocks and
  // the save format do not learn a second kind of key. It is resolved before the
  // early return below, because ?level= has to work on the title screen too —
  // it did not, and a deep link to level 4 started the gate instead.
  const lv = parseInt(p.get('level') || '', 10);
  if (Number.isFinite(lv) && lv >= 1 && lv <= STORY_LEVELS.length) {
    const row = storyLevel(lv);
    const lz = row ? storyLevelZone(row) : null;
    if (lz) {
      zone = lz;
      game.storyLevel = lv;
      // and the run is that level, not a zone that happens to share its map: a
      // deep link played three waves of the zone until 2.6.0
      game.level = lv;
    }
  }

  // ?seed=name without auto just prefills the title screen, so the landing page
  // can hand a seed over to the game.
  if (!p.has('auto')) {
    const el = document.getElementById('seedInput');
    if (el) {
      if (p.has('seed')) el.value = p.get('seed').slice(0, 24);
      // a level brings its own seed, and a player who starts from the title
      // screen must get the level's map rather than whatever was in the box
      else if (game.storyLevel) el.value = zone.seed.slice(0, 24);
    }
    return false;
  }

  // a zone named on the URL wins over the level's own zone, and it is a zone run
  const z = p.has('zone') ? zoneById(p.get('zone')) : zone;
  if (z) zone = z;
  if (p.has('zone')) {
    game.level = 0;
    game.storyLevel = 0;
  }
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
  // ?rec=1 records this run; the replay is on `HG.replayJSON()` when it ends
  if (p.get('rec') === '1') startRecording();
  // ?map=<json> or ?map=<base64 json>: play somebody else's level. The map is a
  // grid of characters and a few numbers — 6.8 kB at the largest — so it fits in
  // a URL, which is the whole point of a shareable map.
  const mapArg = p.get('map');
  if (mapArg) {
    let text = mapArg;
    if (!text.trim().startsWith('{')) {
      try { text = decodeURIComponent(escape(atob(text))); } catch (e) { text = ''; }
    }
    const lv = text ? mapFromJSON(text) : null;
    if (lv) {
      pendingMap = lv;
      note('map: ' + lv.W + 'x' + lv.H);
    } else {
      hud.toast('NOT A MAP', 2);
    }
  }
  // ?play=1 plays the replay left in localStorage by the last copy
  if (p.get('play') === '1') {
    try {
      const saved = localStorage.getItem('hellgate.replay');
      if (saved) watchReplay(saved);
    } catch (e) { /* private mode */ }
  }
  return true;
}

// --------------------------------------------------------------------- boot

// optional open-3-D bodies: assets/models/<type>.glb, if anyone drops them in.
// It never blocks the game and a failure is silent by design.
loadModels(Object.keys(TYPES), {
  heights: Object.fromEntries(Object.entries(TYPES).map(([k, t]) => [k, t.height])),
}).then((rep) => {
  // a parked procedural body would keep being handed out for a type that now
  // has a model, so the pool for those types is dropped
  for (const t of rep.loaded) clearBodyPool(t);
  if (rep.loaded.length) note('models loaded: ' + rep.loaded.join(','));
  if (rep.failed.length) note('models failed: ' + rep.failed.join(', '));
}).catch(() => {});

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
    fireDown: () => {
      if (game.state !== 'playing') return;
      input.fire = true;
      weapons.tryFire(fireCtx());
    },
    fireUp: () => { input.fire = false; },
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
  beginZone, beginLevel, nextLevel, renderLevelMap, showZoneMap, outroPath, showClassScreen, chooseClass, castPower, zoneCleared,
  resumeRun, saveRun, loadRun, clearRun, toggleInventory, throwGrenade, swingBlade,
  selectMode, get mode() { return gameMode; }, MODES, addPickup, dropTrinket, cinematic, dialogue, openExit,
  interact, takeNpcOffer, openNpcOffer, openNpcShop, renderNpcShop, closeNpcOffer, npcQuestState,
  startRecording, replayJSON, replayFileName, copyReplay, watchReplay, loadReplay, stateHash, simDraws,
  samplePath: sampleCameraPath, cellAt, floorHeightAt, circleBlocked,
  exportMap, importMap, mapToJSON, mapFromJSON, get pendingMap() { return pendingMap; },
  openEditor, playEditorMap, get editor() { return editor; }, mapLib,
  get playingMap() { return playingMap; },
  // the editor's save and load, for the suite: they are two localStorage calls
  editorSaveTest(ed) { const keep = editor; editor = ed; saveEditor(); editor = keep; },
  editorLoadTest() { return loadEditor(); },
  // a map document is imported on the way in: buildRun wants a level
  setPendingMap(m) { pendingMap = m && m.v === 1 ? importMap(m) : m; },
  CONTROLS, showControls, closeControls, renderControls, queueHints, updateHints,
  get hintQueue() { return hintQueue; },
  NPC_JOB, NPC_DOOR, NPC_RELICS, NPC_SHOP, ACT_THREAT,
  get npcOffer() { return npcOffer; },
  poolStats, buildReport, note, modelReport, installModel, uninstallModel, startWave,
  takeChoice, renderChoice, ZONE_BOOK, showCodex, closeCodex, renderCodex, hideScreens, showScreen,
  history: record, awardFor, achievementProgress: () => progressOf(record),
  showDiary, closeDiary, objectiveLine,
  get renderStats() { return lastRenderStats; },
  // tools measure the post pass by switching it; nothing in the game reads this
  get bloom() { return bloom; },
  get perfState() { return { ratio: perf.ratio, bloomDropped: perf.bloomDropped }; },
  takeUpgrade, UPGRADES, TRINKETS, PICKUP_DEFS, dropTrinket, recomputeStats, applyClass,
  // the simulation step, for tools that advance the game without a display
  update, effects, projectiles, level, enemies, scene, camera, renderer,
  explodeBarrel, damageBarrels, spawnBarrels, damageSecret, damageCrate, damageRelic,
  spawnRelics, breakRelic, updateObjective, STORY_LEVELS, storyLevel, storyLevelZone,
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
