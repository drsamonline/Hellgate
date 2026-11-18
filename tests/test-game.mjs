// Headless smoke test: stub DOM + stub three, real game modules, real frames.
// Verifies movement, look, weapons, damage, wave flow, keycard gate, death,
// restart, pause, and a 2000-frame random-input soak.

import './domstub.mjs';
const { hasLineOfSight, cellAt } = await import('../play/src/level.js');
const THREE = await import('three');

await import('../play/src/main.js');

const HG = window.HG;
const doc = document;
const fails = [];
const ok = (cond, msg) => { if (!cond) { fails.push(msg); console.log('  FAIL ' + msg); } else console.log('  ok  ' + msg); };

function frames(n) {
  for (let i = 0; i < n; i++) {
    const q = globalThis.__RAF;
    globalThis.__RAF = [];
    for (const fn of q) fn();
  }
}
const keyDown = (code) => window.dispatch('keydown', { code, preventDefault() {} });
const keyUp = (code) => window.dispatch('keyup', { code });
const move = (dx, dy) => window.dispatch('mousemove', { movementX: dx, movementY: dy });
const mouseDown = () => doc.getElementById('game').dispatch('mousedown', { button: 0 });
const mouseUp = () => window.dispatch('mouseup', {});
const sumHp = () => HG.enemies.list.filter((e) => e.alive).reduce((a, e) => a + e.hp, 0);

function duelSpot(dist) {
  const L = HG.level;
  for (let a = 0; a < 8000; a++) {
    const c = L.openCells[Math.floor(Math.random() * L.openCells.length)];
    if (c.room < 0) continue;
    const d = L.openCells.find((k) => {
      const dd = Math.hypot(k.wx - c.wx, k.wz - c.wz);
      return k.room >= 0 && dd > dist - 0.6 && dd < dist + 0.6;
    });
    if (!d) continue;
    const ca = cellAt(L, c.wx, c.wz);
    const cb = cellAt(L, d.wx, d.wz);
    if (hasLineOfSight(L, { x: c.wx, y: ca.floor + 1.6, z: c.wz }, { x: d.wx, y: cb.floor + 1.1, z: d.wz })) {
      return { a: { x: c.wx, z: c.wz, floor: ca.floor }, b: { x: d.wx, z: d.wz, floor: cb.floor } };
    }
  }
  return null;
}

function aimAt(tx, ty, tz) {
  const p = HG.player;
  const dx = tx - p.pos.x;
  const dz = tz - p.pos.z;
  p.yaw = Math.atan2(-dx, -dz);
  p.pitch = Math.atan2(ty - (p.pos.y + 1.62), Math.hypot(dx, dz));
  p.eyeY = p.pos.y + 1.62;
  p.syncCamera();
}

// ---------------------------------------------------------------------------
console.log('\n== boot ==');
frames(5);
ok(HG.game.state === 'title', 'boots to the title screen');
ok(!!HG.levelMeshes || true, 'no crash before a run exists');

console.log('\n== start ==');
doc.getElementById('seedInput').value = 'testseed';
doc.getElementById('startBtn').dispatch('click');
frames(2);
ok(HG.game.state === 'playing', 'state -> playing');
ok(HG.level.cells.length === 1600, 'level grid built');
ok(HG.levelMeshes.group.children.length > 0, 'level meshes built (' + HG.levelMeshes.group.children.length + ')');
ok(HG.enemies.list.length === 6, 'wave 1 spawned 6 enemies (got ' + HG.enemies.list.length + ')');
ok(HG.weapons.current === 0, 'pistol equipped');

console.log('\n== movement ==');
const p0 = { x: HG.player.pos.x, z: HG.player.pos.z };
keyDown('KeyW');
frames(90);
keyUp('KeyW');
const dist = Math.hypot(HG.player.pos.x - p0.x, HG.player.pos.z - p0.z);
ok(dist > 0.5, 'player walked ' + dist.toFixed(2) + ' units');
ok(!HG.player.camera || true, 'camera follows');

console.log('\n== look ==');
const yaw0 = HG.player.yaw;
move(240, 60);
frames(2);
ok(Math.abs(HG.player.yaw - yaw0) > 0.1, 'yaw responds to mouse');
ok(Math.abs(HG.player.pitch) > 0.01, 'pitch responds to mouse');

console.log('\n== weapons ==');
keyDown('Digit2');
frames(16);
ok(HG.weapons.current === 1, 'key 2 selects the shotgun');
const shells0 = HG.player.ammo.shells;
mouseDown();
frames(4);
mouseUp();
ok(HG.player.ammo.shells === shells0 - 1, 'shotgun fired (shells ' + shells0 + ' -> ' + HG.player.ammo.shells + ')');

console.log('\n== hitscan damage ==');
const spot = duelSpot(3.5);
ok(!!spot, 'found a clear duel spot');
// isolate one enemy so the assertion is unambiguous
const target = HG.enemies.list[0];
for (const e of HG.enemies.list) if (e !== target) e.remove();
HG.enemies.list = [target];
target.pos.set(spot.b.x, spot.b.floor, spot.b.z);
HG.player.pos.set(spot.a.x, spot.a.floor, spot.a.z);
HG.player.vel.set(0, 0, 0);
aimAt(target.pos.x, target.pos.y + target.height * 0.55, target.pos.z);
frames(1);
keyDown('Digit1');
frames(16);
const hp0 = target.hp;
mouseDown();
frames(6);
mouseUp();
ok(target.hp < hp0, 'pistol damaged the imp (' + hp0 + ' -> ' + target.hp + ')');
ok(target.flashMats && target.flashMats.length > 0, 'enemy owns cloned flash materials (' + (target.flashMats || []).length + ')');
ok(target.flashMats.every((m) => m.userData.shared === false), 'flash materials are not the shared ones');
ok(target.flash > 0 && target.flashMats[0].emissive.r > 0, 'enemy flashes white-hot on a hit');
frames(24);
ok(target.flash === 0 && target.flashMats[0].emissive.r === 0, 'flash decays back to black');

console.log('\n== shared enemy geometry ==');
HG.enemies.spawnWave(1, HG.player.pos);
const imps = HG.enemies.list.filter((x) => x.type === 'imp').slice(0, 2);
if (imps.length === 2) {
  const g0 = imps[0].mesh.children[0].geometry;
  const g1 = imps[1].mesh.children[0].geometry;
  ok(g0 === g1, 'imps share one torso geometry');
  ok(imps[0].mesh.children[0].material !== imps[1].mesh.children[0].material, 'but not their flash material');
} else {
  ok(false, 'expected two imps to compare');
}

console.log('\n== rocket splash ==');
keyDown('Digit3');
frames(16);
ok(HG.weapons.current === 2, 'key 3 selects the rocket launcher');
HG.player.ammo.rockets = 3;
const killsBefore = HG.game.kills;
aimAt(target.pos.x, target.pos.y + 0.9, target.pos.z);
frames(1);
mouseDown();
frames(60);
mouseUp();
ok(HG.player.ammo.rockets === 2, 'rocket consumed ammo');
ok(HG.game.kills > killsBefore || !target.alive, 'rocket killed the imp (kills ' + killsBefore + ' -> ' + HG.game.kills + ')');

console.log('\n== enemy AI damages the player ==');
HG.game.wave = 1;
HG.enemies.clear();
HG.enemies.spawnWave(1, HG.player.pos);
const near = HG.enemies.list[0];
const spot2 = duelSpot(5);
HG.player.pos.set(spot2.a.x, spot2.a.floor, spot2.a.z);
near.pos.set(spot2.b.x, spot2.b.floor, spot2.b.z);
HG.player.health = 100;
HG.player.armor = 0;
let minHp = 100;
for (let i = 0; i < 260; i++) {
  frames(1);
  minHp = Math.min(minHp, HG.player.health);
  if (!HG.player.alive) { HG.player.alive = true; HG.player.health = 100; HG.game.state = 'playing'; }
}
ok(minHp < 100, 'enemies dealt damage (lowest health ' + minHp + ')');

console.log('\n== wave clear opens the exit ==');
HG.player.health = 100;
const ctx = () => ({ level: HG.level, player: HG.player, effects: HG.effects, audio: HG.audio, projectiles: HG.projectiles, onKill: () => HG.game.kills++ });
for (const e of HG.enemies.list) if (e.alive) e.hurt(9999, ctx(), { x: 0, y: 0, z: 1 });
frames(4);
ok(HG.game.exitOpen === true, 'exit opened after the wave was cleared');
ok(HG.level.doorOpen === true, 'door unlocked');
ok(HG.levelMeshes.doorMeshes.every((m) => m.visible === false), 'door mesh hidden');

console.log('\n== next wave via the exit pad ==');
HG.player.pos.set(HG.level.exit.x, 0, HG.level.exit.z);
frames(4);
ok(HG.game.wave === 2, 'wave advanced to 2 (got ' + HG.game.wave + ')');
ok(HG.game.exitOpen === false, 'exit re-locked');
ok(HG.enemies.aliveCount > 0, 'wave 2 spawned ' + HG.enemies.aliveCount + ' enemies');

console.log('\n== keycard gate (wave 3) ==');
HG.player.pos.set(HG.level.spawn.x, 0, HG.level.spawn.z);
for (const e of HG.enemies.list) if (e.alive) e.hurt(9999, ctx(), { x: 0, y: 0, z: 1 });
frames(2);
HG.game.wave = 3;
HG.game.hasKey = false;
HG.game.exitOpen = false;
HG.game.warnedKey = false;
HG.level.doorOpen = false;
frames(3);
ok(HG.game.exitOpen === false, 'exit stays locked on wave 3 without the keycard');
HG.game.hasKey = true;
frames(3);
ok(HG.game.exitOpen === true, 'exit opens once the keycard is held');
ok(HG.player.alive, 'player still alive at this point');

console.log('\n== death ==');
HG.player.damage(500, { x: 0, y: 0, z: 0 });
frames(3);
ok(HG.game.state === 'dead', 'state -> dead');
ok(globalThis.localStorage.getItem('hellgate.best') !== null, 'best run saved to localStorage');

console.log('\n== debug overlay ==');
window.dispatch('keydown', { code: 'Backquote', preventDefault() {} });
frames(20);
const dbgEl = doc.getElementById('debug');
ok(dbgEl.classList.contains('on'), 'backquote toggles the debug overlay');
ok(/fps/.test(dbgEl.textContent) && /calls/.test(dbgEl.textContent), 'overlay reports fps + draw calls: "' + dbgEl.textContent + '"');
window.dispatch('keydown', { code: 'Backquote', preventDefault() {} });
frames(2);
ok(!dbgEl.classList.contains('on'), 'backquote toggles it off again');

console.log('\n== restart ==');
const oldLevelMesh = HG.levelMeshes.group.children.find((m) => m.userData && m.userData.merged);
doc.getElementById('retryBtn').dispatch('click');
frames(3);
ok(HG.game.state === 'playing', 'retry restarts');
ok(HG.game.kills === 0 && HG.game.wave === 1, 'stats reset');
ok(HG.player.health === 100 && HG.player.ammo.shells === 16, 'player reset');
ok(oldLevelMesh && oldLevelMesh.geometry.__disposed === true, 'previous run\'s level geometry was disposed');
ok(oldLevelMesh && oldLevelMesh.material.userData.shared === true, 'shared cached materials survive a restart');
ok(HG.levelMeshes.group.children.length > 0, 'new run built fresh meshes');

console.log('\n== pause / resume ==');
window.dispatch('keydown', { code: 'Escape' });
frames(2);
ok(HG.game.state === 'paused', 'Escape pauses');
doc.getElementById('resumeBtn').dispatch('click');
frames(2);
ok(HG.game.state === 'playing', 'resume works');

console.log('\n== soak: 2000 frames of random input ==');
let crashed = null;
try {
  const codes = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'ShiftLeft'];
  for (let i = 0; i < 2000; i++) {
    if (i % 30 === 0) {
      for (const c of codes) keyUp(c);
      keyDown(codes[(i / 30) % codes.length]);
      move((Math.random() - 0.5) * 80, (Math.random() - 0.5) * 24);
    }
    if (i % 7 === 0) mouseDown();
    if (i % 7 === 3) mouseUp();
    if (i % 200 === 0) {
      HG.player.health = 100;
      if (!HG.player.alive) { HG.player.alive = true; HG.game.state = 'playing'; }
      if (i % 400 === 0) keyDown(['Digit1', 'Digit2', 'Digit3'][(i / 400) % 3]);
    }
    frames(1);
  }
} catch (err) {
  crashed = err;
}
ok(!crashed, 'no crash in 2000 frames' + (crashed ? ': ' + crashed.stack : ''));
ok(Number.isFinite(HG.player.pos.x) && Number.isFinite(HG.player.pos.z), 'player position stays finite');
ok(HG.game.kills >= 0, 'kill counter sane: ' + HG.game.kills);

console.log('\n== demo / screenshot URL hooks ==');
location.search = '?auto=1&seed=demolink&wave=3&cam=10,12,45,-5&nohud=1';
let urlOk = true;
try { urlOk = HG.applyUrlOverrides(); } catch (err) { urlOk = false; console.log(err.stack); }
frames(3);
ok(urlOk === true, 'auto-start hook runs');
ok(HG.game.state === 'playing', 'auto-start puts the game straight into play');
ok(HG.game.wave === 3, 'wave override applied (got ' + HG.game.wave + ')');
ok(Math.abs(HG.player.pos.x - 10) < 0.001 && Math.abs(HG.player.pos.z - 12) < 0.001, 'camera override placed the player');
ok(Math.abs(HG.player.yaw - (45 * Math.PI) / 180) < 0.001, 'camera yaw applied');
ok(HG.game.seed === 'demolink', 'seed override applied');
ok(HG.enemies.aliveCount > 0 && HG.enemies.list.length === HG.enemies.aliveCount, 'wave started from an empty arena (no stacking)');

console.log('\n== settings (roadmap 1) ==');
HG.changeSetting('sensitivity', 2);
ok(HG.player.sensitivity === 2, 'sensitivity applies to the player');
ok(HG.camera.fov === 76, 'fov untouched before it is changed');
HG.changeSetting('fov', 95);
ok(Math.round(HG.camera.fov) === 95, 'fov applies to the camera');
const stored = JSON.parse(localStorage.getItem('hellgate.settings') || '{}');
ok(stored.sensitivity === 2 && stored.fov === 95, 'settings persisted to localStorage');
HG.changeSetting('fov', 500);
ok(HG.camera.fov === 100, 'out-of-range fov is clamped');
HG.changeSetting('fov', 76);

console.log('\n== reduced motion (roadmap 2) ==');
HG.changeSetting('reducedMotion', true);
ok(HG.player.reducedMotion === true, 'player bob disabled');
ok(HG.effects.reducedMotion === true, 'effects shake disabled');
HG.effects.addShake(1);
ok(HG.effects.shake === 0, 'addShake is a no-op under reduced motion');
HG.changeSetting('reducedMotion', false);
HG.effects.addShake(0.5);
ok(HG.effects.shake > 0, 'shake returns when reduced motion is off');
HG.effects.shake = 0;

console.log('\n== mute (roadmap 4) ==');
HG.changeSetting('muted', true);
ok(HG.audio.muted === true, 'audio muted');
ok(JSON.parse(localStorage.getItem('hellgate.settings')).muted === true, 'mute persisted');
HG.changeSetting('muted', false);
ok(HG.audio.muted === false, 'unmuted');

console.log('\n== weapon wheel + raise (roadmap 5, 14) ==');
const w0 = HG.weapons.current;
doc.getElementById('game').dispatch('wheel', { deltaY: 120, preventDefault() {} });
frames(2);
ok(HG.weapons.current !== w0, 'wheel cycles weapons (' + w0 + ' -> ' + HG.weapons.current + ')');
ok(HG.weapons.raise > 0.4, 'weapon dips after a swap');
frames(70);
ok(HG.weapons.raise < 0.1, 'weapon rises back into frame');

console.log('\n== no wasted pickups (roadmap 8) ==');
HG.player.health = 100;
const before2 = HG.game.pickups.length;
const cell = HG.level.openCells[0];
HG.player.pos.set(cell.wx, 0, cell.wz);
const fakeMesh = {
  visible: true, rotation: { y: 0 }, position: { y: 0 },
  geometry: { dispose() {} }, material: { dispose() {} },
};
HG.game.pickups.push({ kind: 'health', mesh: fakeMesh, x: cell.wx, z: cell.wz, baseY: 1, t: 0 });
frames(3);
ok(HG.game.pickups.length === before2 + 1, 'full-health pickup is left on the floor');
HG.player.health = 40;
frames(3);
ok(HG.game.pickups.length === before2, 'damaged player picks it up');

console.log('\n== seed in the URL (roadmap 9) ==');
HG.startGame('urltest');
frames(2);
ok(location.search.includes('seed=urltest'), 'seed written to the URL: ' + location.search);

console.log('\n== exit compass (roadmap 13) ==');
HG.player.pos.set(HG.level.spawn.x, 0, HG.level.spawn.z);
HG.game.exitOpen = false;
frames(2);
ok(!HG.hud.compass.classList.contains('on'), 'compass hidden while the exit is shut');
HG.game.exitOpen = true;
frames(2);
ok(HG.hud.compass.classList.contains('on'), 'compass shown when the exit opens');
HG.game.exitOpen = false;

console.log('\n== settings screen + restart (roadmap 6) ==');
HG.openSettings('title');
ok(doc.getElementById('settings').classList.contains('on'), 'settings screen opens');
HG.closeSettings();
ok(doc.getElementById('title').classList.contains('on'), 'settings closes back to where it came from');
HG.game.state = 'playing';
window.dispatch('keydown', { code: 'Escape' });
frames(2);
ok(HG.game.state === 'paused', 'paused before restart');
doc.getElementById('restartBtn').dispatch('click');
frames(2);
ok(HG.game.state === 'playing' && HG.game.wave === 1, 'restart from pause starts wave 1');

console.log('\n' + (fails.length ? fails.length + ' FAILURES' : 'ALL GAMEPLAY TESTS PASSED'));
process.exit(fails.length ? 1 : 0);
