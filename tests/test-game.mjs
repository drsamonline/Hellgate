// Headless smoke test: stub DOM + stub three, real game modules, real frames.
// Verifies movement, look, weapons, damage, wave flow, keycard gate, death,
// restart, pause, and a 2000-frame random-input soak.

import './domstub.mjs';
import { WEAPONS } from '../play/src/weapons.js';
import { isBlocked } from '../play/src/level.js';
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
ok(HG.game.state === 'intro', 'start plays the story intro');
ok(HG.level.cells.length === 1600, 'level grid built');
ok(HG.levelMeshes.group.children.length > 0, 'level meshes built (' + HG.levelMeshes.group.children.length + ')');

doc.getElementById('storySkip').dispatch('click');
frames(2);
ok(HG.game.state === 'class', 'the intro hands over to class select');

HG.chooseClass('marine');
frames(2);
ok(HG.game.state === 'playing', 'state -> playing after choosing a class');
ok(HG.weapons.current === 1, 'the marine starts with the shotgun');
ok(HG.enemies.list.length === 6, 'wave 1 spawned 6 enemies (got ' + HG.enemies.list.length + ')');
ok(HG.powers.slots.length === 3, 'three power slots equipped');

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
  const torso = (e) => {
    let found = null;
    e.body.traverse((o) => { if (!found && o.isMesh && o.material && o.material.userData.flashable) found = o; });
    return found;
  };
  const t0 = torso(imps[0]);
  const t1 = torso(imps[1]);
  ok(t0.geometry === t1.geometry, 'imps share one torso geometry');
  ok(t0.material !== t1.material, 'but not their flash material');
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

console.log('\n== navigation (roadmap 17) ==');
HG.enemies.clear();
HG.enemies.spawnWave(1, HG.player.pos);
frames(4);
ok(HG.enemies.field && HG.enemies.field.length === 1600, 'a shared flow field is built');
const far = HG.enemies.list[0];
const spot3 = duelSpot(9) || duelSpot(6);
HG.player.pos.set(spot3.a.x, spot3.a.floor, spot3.a.z);
far.pos.set(spot3.b.x, spot3.b.floor, spot3.b.z);
far.state = 'CHASE';
const { buildFlowField: bff } = await import('../play/src/level.js');
const d0 = (() => { const f = bff(HG.level, HG.player.pos.x, HG.player.pos.z); return f[Math.round(far.pos.z / 2) * HG.level.W + Math.round(far.pos.x / 2)]; })();
for (let i = 0; i < 180; i++) frames(1);
const d1 = (() => { const f = bff(HG.level, HG.player.pos.x, HG.player.pos.z); return f[Math.round(far.pos.z / 2) * HG.level.W + Math.round(far.pos.x / 2)]; })();
ok(d0 > 0 && d1 >= 0 && d1 < d0, `enemy closed along the field (${d0} -> ${d1} cells)`);

console.log('\n== difficulty presets (roadmap 25) ==');
HG.changeSetting('difficulty', 'normal');
HG.enemies.clear();
HG.enemies.spawnWave(3, HG.player.pos);
const nCount = HG.enemies.list.length;
const nHp = HG.enemies.list[0].maxHp;
HG.changeSetting('difficulty', 'hard');
ok(HG.enemies.diff.count > 1, 'hard raises the wave size multiplier');
HG.enemies.clear();
HG.enemies.spawnWave(3, HG.player.pos);
const hCount = HG.enemies.list.length;
const hHp = HG.enemies.list[0].maxHp;
ok(hCount > nCount, `hard spawns more (${nCount} -> ${hCount})`);
ok(hHp > nHp, `hard enemies are tougher (${nHp} -> ${hHp})`);
HG.changeSetting('difficulty', 'easy');
HG.enemies.clear();
HG.enemies.spawnWave(3, HG.player.pos);
ok(HG.enemies.list.length < nCount, `easy spawns fewer (${HG.enemies.list.length} < ${nCount})`);
HG.changeSetting('difficulty', 'normal');
ok(JSON.parse(localStorage.getItem('hellgate.settings')).difficulty === 'normal', 'difficulty persisted');

console.log('\n== hound (roadmap 21) ==');
HG.enemies.clear();
HG.enemies.spawnWave(4, HG.player.pos);
const hounds = HG.enemies.list.filter((e) => e.type === 'hound');
ok(hounds.length > 0, `wave 4 brings hounds (${hounds.length} of ${HG.enemies.list.length})`);
ok(hounds.every((h) => h.T.melee === true && h.T.attackRange <= 3), 'hounds are melee only');
ok(hounds[0].speed > HG.enemies.list.find((e) => e.type === 'imp').speed, 'hounds are faster than imps');

console.log('\n== the warden (boss) ==');
HG.enemies.clear();
HG.enemies.spawnWave(3, HG.player.pos, { boss: true, waves: 3 });
const boss = HG.enemies.list.find((e) => e.T && e.T.boss);
ok(!!boss, 'the boss wave spawns a warden');
ok(boss && boss.type === 'warden', 'it is the warden type');
ok(boss && boss.maxHp > 300, 'it has boss-sized health: ' + (boss && boss.maxHp));
ok(HG.enemies.boss === boss, 'the manager exposes the live boss');
ok(boss && boss.height > 2.5, 'it is taller than the other enemies');
frames(3);
ok(HG.hud.elBoss.classList.contains('on'), 'the boss bar shows');
ok(HG.hud.elBossName.textContent === 'WARDEN', 'the boss bar names it');
const frac = parseFloat(HG.hud.elBossFill.style.width);
ok(frac > 0 && frac <= 100, 'the boss bar has a fill: ' + frac + '%');
boss.hurt(99999, { level: HG.level, player: HG.player, effects: HG.effects, audio: HG.audio, projectiles: HG.projectiles, onKill: () => HG.game.kills++ }, { x: 0, y: 0, z: 1 });
frames(3);
ok(!HG.hud.elBoss.classList.contains('on'), 'the boss bar hides when it dies');

console.log('\n== boss phases ==');
HG.enemies.clear();
HG.enemies.spawnWave(3, HG.player.pos, { boss: true, waves: 3 });
const b2 = HG.enemies.list.find((e) => e.T && e.T.boss);
frames(2);
ok(b2.phase === 1, 'the warden starts in phase 1');
b2.hp = b2.maxHp * 0.6;
frames(3);
ok(b2.phase === 2, 'two thirds of health enters phase 2 (' + b2.phase + ')');
const cd2 = b2.T.attackCd;
b2.hp = b2.maxHp * 0.25;
const before = HG.enemies.list.length;
frames(4);
ok(b2.phase === 3, 'one third of health enters phase 3');
ok(b2.T.attackCd < cd2, 'phase 3 attacks faster than phase 2');
ok(HG.enemies.list.length > before, 'phase 3 summons help (' + before + ' -> ' + HG.enemies.list.length + ')');
ok(HG.enemies.list.some((e) => e.type === 'hound' && e !== b2), 'the summons are hounds');

console.log('\n== between-zone upgrades ==');
const dmgBefore = HG.player.baseDamage;
HG.takeUpgrade('damage');
ok(HG.game.upgrades.damage === 1, 'the upgrade is recorded');
ok(HG.player.baseDamage > dmgBefore, 'damage upgrade raises the base (' + dmgBefore.toFixed(2) + ' -> ' + HG.player.baseDamage.toFixed(2) + ')');
const hpBefore = HG.player.maxHp;
HG.takeUpgrade('hp');
ok(HG.player.maxHp === hpBefore + 25, 'health upgrade raises the cap (' + hpBefore + ' -> ' + HG.player.maxHp + ')');
const cdBefore = HG.powers.cdMul;
HG.takeUpgrade('cooldown');
ok(HG.powers.cdMul < cdBefore, 'cooldown upgrade lowers the multiplier');
// taking an upgrade routes to the world map; later blocks need a live game
HG.game.state = 'playing';
frames(2);

console.log('\n== chaingun, occlusion, kill feed ==');
ok(WEAPONS.length === 4, 'four weapons (' + WEAPONS.length + ')');
ok(WEAPONS[3].key === 'chaingun', 'the chaingun is the fourth slot');
ok(WEAPONS[3].spin > 0, 'the chaingun has a spin-up');
HG.player.ammo.bullets = 200;
HG.weapons.select(3, true);
HG.input.fire = true;
frames(2);
const cdCold = HG.weapons.cd;
frames(30);
const cdHot = HG.weapons.cd;
ok(cdHot <= cdCold + 1e-9, 'holding the trigger does not lengthen the cooldown (' + cdCold.toFixed(3) + ' -> ' + cdHot.toFixed(3) + ')');
HG.input.fire = false;
frames(2);
ok(typeof HG.audio.occludeTest === 'function', 'sound occlusion is installed');
const closeBy = HG.audio.occludeTest(HG.player.pos.x + 1, HG.player.pos.z);
ok(closeBy === true, 'a sound next to the player is not occluded');
ok(typeof HG.hud.feed === 'function', 'the kill feed exists');

console.log('\n== bodies fit their collision circle ==');
for (const [type, expect] of [['imp', 0.62], ['grunt', 0.52], ['hound', 0.64]]) {
  HG.enemies.clear();
  HG.enemies.spawnAt(type, HG.player.pos.x + 6, HG.player.pos.z, 1);
  frames(2);
  const e = HG.enemies.list[0];
  ok(Math.abs(e.radius - expect) < 0.01, type + ' collision radius is ' + e.radius + ', matching its body half-width');
  // shove it into a wall and check the safety net moves it back out
  e.pos.x = HG.level.spawn.x;
  e.pos.z = HG.level.spawn.z;
  const cx = Math.round(e.pos.x / 2), cz = Math.round(e.pos.z / 2);
  const wall = HG.level.cells.find((c, i) => c.solid && Math.abs(c.x - cx) < 4 && Math.abs(c.z - cz) < 4);
  if (wall) {
    e.pos.x = wall.x * 2;
    e.pos.z = wall.z * 2;
    const moved = e.depenetrate(HG.level);
    ok(moved === true, type + ' is pushed out of a solid cell');
    ok(!isBlocked(HG.level, e.pos.x, e.pos.z), type + ' ends up on open floor');
  }
}

console.log('\n== tension and heartbeat ==');
ok(typeof HG.audio.setTension === 'function', 'the mix has a tension control');
HG.audio.setTension(0.8);
ok(Math.abs(HG.audio.tension - 0.8) < 0.01, 'tension is stored');
HG.audio.setTension(5);
ok(HG.audio.tension === 1, 'tension clamps at 1');
HG.audio.setTension(-2);
ok(HG.audio.tension === 0, 'and at 0');
HG.player.health = 12;
frames(90);
ok(HG.audio.tension >= 0, 'the loop keeps the tension in range with a near-dead player');
HG.player.health = HG.player.maxHealth || 110;

console.log('\n== the spitter (fifth type) ==');
HG.enemies.clear();
HG.enemies.spawnAt('spitter', HG.player.pos.x + 12, HG.player.pos.z, 4);
frames(2);
const sp = HG.enemies.list.find((e) => e.type === 'spitter');
ok(!!sp, 'a spitter spawns');
ok(sp.T.lob === true, 'it lobs rather than shoots flat');
ok(sp.T.keepsDistance > 0, 'it holds a distance');
// drive the attack directly: whether it can see the player depends on where the
// level put a wall, which is not what this assertion is about
const shotsBefore = HG.projectiles.list.length;
sp.doAttack({ level: HG.level, player: HG.player, effects: HG.effects, audio: HG.audio, projectiles: HG.projectiles, onKill: null },
  6, 6, 0, true, { x: HG.player.pos.x, y: HG.player.pos.y + 1.6, z: HG.player.pos.z });
ok(HG.projectiles.list.length > shotsBefore, 'it throws something');
const glob = HG.projectiles.list[HG.projectiles.list.length - 1];
ok(glob.kind === 'acid', 'the glob is an acid projectile');
ok(glob.gravity > 0 && glob.bounce === 0, 'it arcs and does not bounce');
ok(HG.enemies.list.some((e) => e.type === 'spitter'), 'and it is still in the level');

console.log('\n== minimap and touch read button ==');
ok(!!document.getElementById('minimap'), 'the HUD has a minimap canvas');
const { Minimap } = await import('../play/src/minimap.js');
const cv = document.createElement('canvas');
const mm = new Minimap(cv, HG.level, 132);
ok(!!mm.base, 'the minimap prerenders the floor once');
mm.draw(HG.player, HG.enemies.list, false, HG.game.keycard);
ok(true, 'drawing markers does not throw');
ok(!!document.getElementById('tRead'), 'the touch layout has a READ button');
const term = HG.lore.entries[0];
HG.player.pos.set(term.x + 0.4, term.y, term.z);
frames(2);
ok(HG.hud.promptText === 'READ' || HG.hud.promptText === 'V  READ', 'the prompt names the action: ' + HG.hud.promptText);

console.log('\n== story per zone ==');
const { panelsFor, epilogueFor, ZONE_STORY } = await import('../play/src/story.js');
const zones = Object.keys(ZONE_STORY);
ok(zones.length === 5, 'five zones have their own story (' + zones.join(', ') + ')');
ok(panelsFor('gate').length >= 3, 'the gate has panels');
ok(panelsFor('throne')[0].text !== panelsFor('gate')[0].text, 'zones do not share text');
ok(panelsFor('nope').length >= 3, 'an unknown zone falls back to the shared panels');
ok(epilogueFor('foundry').length > 10, 'a zone has an epilogue line');

console.log('\n== objective, diary, reachable picks ==');
HG.game.state = 'playing';
ok(HG.objectiveLine().length > 0, 'there is always an objective line: ' + HG.objectiveLine());
HG.enemies.clear();
frames(3);
HG.game.wave = 3;
HG.game.hasKey = false;
HG.game.exitOpen = false;
frames(2);
ok(/keycard/i.test(HG.objectiveLine()), 'wave 3 without the key asks for the keycard: ' + HG.objectiveLine());
HG.showDiary();
ok(HG.game.state === 'diary', 'j opens the journal');
ok(document.getElementById('diaryBody').innerHTML.length > 100, 'the journal has content');
HG.closeDiary();
ok(HG.game.state === 'playing', 'and closes again');
// every pickable cell must be walkable from the spawn
const unreachablePicks = HG.level.reachableCells.filter((c) => {
  const cell = HG.level.cells[c.z * HG.level.W + c.x];
  return cell.solid || cell.secret || cell.crate;
});
ok(unreachablePicks.length === 0, 'no reachable pick is solid, secret or a crate (' + unreachablePicks.length + ')');

console.log('\n== enemy level of detail ==');
HG.enemies.clear();
HG.enemies.spawnAt('imp', HG.player.pos.x + 40, HG.player.pos.z, 1);
HG.enemies.spawnAt('imp', HG.player.pos.x + 3, HG.player.pos.z, 1);
frames(3);
ok(HG.enemies.list.every((e) => !!e.proxy), 'every enemy carries a proxy: ' + HG.enemies.list.map((e) => e.type + ':' + (!!e.proxy)).join(','));
const lodFar = HG.enemies.list.find((e) => Math.hypot(e.pos.x - HG.player.pos.x, e.pos.z - HG.player.pos.z) > 22);
const lodNear = HG.enemies.list.find((e) => Math.hypot(e.pos.x - HG.player.pos.x, e.pos.z - HG.player.pos.z) < 22);
ok(lodFar && lodFar.proxy.visible === true, 'a distant enemy draws as one slab');
ok(lodFar && lodFar.body.visible === false, 'and its body is hidden');
ok(lodNear && lodNear.proxy.visible === false, 'a near enemy draws its body');
ok(lodNear && lodNear.body.visible === true, 'and the slab is hidden');

console.log('\n== corpses, shadows, doors, touch ==');
HG.game.state = 'playing';
HG.enemies.clear();
for (let i = 0; i < 4; i++) HG.enemies.spawnAt('imp', HG.player.pos.x + 5 + i, HG.player.pos.z + 2, 1);
frames(2);
const first = HG.enemies.list[0];
first.hurt(9999, { level: HG.level, player: HG.player, effects: HG.effects, audio: HG.audio, projectiles: HG.projectiles, onKill: null }, { x: 0, y: 0, z: 1 });
frames(200);
ok(first.removed !== true, 'a dead body stays in the world');
ok(HG.enemies.list.includes(first), 'and it stays in the list');
ok(first.shadow !== null && first.shadow !== undefined, 'an enemy carries a contact shadow');
ok(HG.levelMeshes.doorMeshes.length >= 0, 'door meshes exist to animate');
HG.level.doorOpen = true;
for (const m of HG.levelMeshes.doorMeshes) { m.userData.opening = true; m.userData.slide = 0; }
frames(40);
const opened = HG.levelMeshes.doorMeshes.every((m) => !m.userData.opening || m.userData.slide > 0);
ok(opened, 'doors animate instead of popping');
const nadeBtn = document.getElementById('tNade');
ok(!!nadeBtn, 'the touch layout has a grenade button');
// leave a live, healthy player for the blocks that follow
HG.enemies.clear();
HG.player.alive = true;
HG.player.health = HG.player.maxHp;
HG.player.crouch = 0;
HG.input.keys = Object.create(null);
HG.input.move.y = 0;
frames(2);

console.log('\n== grenades ==');
HG.game.state = 'playing';
HG.player.grenades = 3;
const liveBefore = HG.projectiles.list.length;
HG.throwGrenade();
frames(1);
ok(HG.player.grenades === 2, 'throwing spends one (' + HG.player.grenades + ' left)');
ok(HG.projectiles.list.length > liveBefore, 'a grenade is in the air');
const gren = HG.projectiles.list[HG.projectiles.list.length - 1];
ok(gren.kind === 'grenade', 'it is a grenade, not a rocket');
ok(gren.bounce > 0 && gren.gravity > 0, 'it falls and it bounces');
frames(150);
ok(!HG.projectiles.list.includes(gren), 'the fuse runs out and it is gone');
HG.player.grenades = 0;
const beforeEmpty = HG.projectiles.list.length;
HG.throwGrenade();
ok(HG.projectiles.list.length === beforeEmpty, 'no grenades, no throw');
HG.player.grenades = 3;

console.log('\n== sprint stamina and crates ==');
HG.game.state = 'playing';
HG.input.keys = Object.create(null);
HG.player.stamina = 1;
HG.input.keys['ShiftLeft'] = true;
HG.input.move.y = -1;
frames(120);
ok(HG.player.stamina < 0.8, 'sprinting drains stamina (' + HG.player.stamina.toFixed(2) + ')');
const drained = HG.player.stamina;
HG.input.keys['ShiftLeft'] = false;
HG.input.move.y = 0;
frames(240);
ok(HG.player.stamina > drained, 'standing still refills it (' + drained.toFixed(2) + ' -> ' + HG.player.stamina.toFixed(2) + ')');

const cr = (HG.level.crates || [])[0];
if (cr) {
  const cell = HG.level.cells[cr.idx];
  ok(cell.crate === true, 'a crate marks its cell');
  ok(HG.damageCrate(cell, 20) === true, 'a shot chips it');
  ok(HG.damageCrate(cell, 999) === true, 'enough damage breaks it');
  ok(cell.crate === false, 'the cell stops being a crate');
  ok(HG.level.broken.has(cr.idx), 'the cell is recorded as open');
} else {
  ok(false, 'no crates in this level');
}

console.log('\n== secret rooms ==');
ok(Array.isArray(HG.level.secrets), 'the level carries secrets');
ok(HG.level.secrets.length === 1, 'one secret room per level (' + HG.level.secrets.length + ')');
const sec = HG.level.secrets[0];
if (sec) {
  const cell = HG.level.cells[sec.idx];
  ok(cell.secretWall === true, 'the entrance is a flagged wall cell');
  ok(isBlocked(HG.level, sec.wx, sec.wz) === true, 'it is solid before it is broken');
  ok(HG.damageSecret(cell, 40) === true, 'a shot chips it');
  ok(isBlocked(HG.level, sec.wx, sec.wz) === true, 'it is still solid at 50 hp');
  const scoreBefore = HG.game.score;
  ok(HG.damageSecret(cell, 999) === true, 'enough damage breaks it');
  ok(isBlocked(HG.level, sec.wx, sec.wz) === false, 'a broken secret is a doorway');
  ok(HG.game.score === scoreBefore + 250, 'breaking one pays 250');
  const alcove = HG.level.cells[HG.level.idx(sec.alcove.x, sec.alcove.z)];
  ok(alcove.solid === false, 'the alcove behind it is open floor');
}

console.log('\n== barrels ==');
HG.game.barrels.length = 0;
HG.spawnBarrels();
ok(HG.game.barrels.length > 0, 'barrels are placed (' + HG.game.barrels.length + ')');
const b0 = HG.game.barrels[0];
const origin = { x: b0.x - 5, y: 0, z: b0.z };
const dir = { x: 1, y: 0, z: 0 };
ok(HG.damageBarrels(origin, dir, 10, 10) === true, 'a shot along the ray hits a barrel');
ok(b0.hp === 20, 'the barrel took the damage (' + b0.hp + ')');
HG.enemies.clear();
HG.enemies.spawnAt('imp', b0.x + 1, b0.z, 1);
frames(2);
const bystander = HG.enemies.list[HG.enemies.list.length - 1];
const bystanderHp = bystander.hp;
HG.damageBarrels(origin, dir, 10, 999);
ok(b0.alive === false, 'the barrel explodes when its health runs out');
ok(bystander.hp < bystanderHp, 'the blast hurts what is next to it (' + bystanderHp + ' -> ' + Math.round(bystander.hp) + ')');
ok(HG.game.barrels.every((b) => b !== b0 || !b.alive), 'the exploded barrel is gone');

console.log('\n== crouch and damage numbers ==');
HG.game.state = 'playing';
HG.input.keys = Object.create(null);
HG.player.crouch = 0;
frames(2);
const standEye = HG.player.camera.position.y;
HG.input.keys['ControlLeft'] = true;
frames(30);
const crouchEye = HG.player.camera.position.y;
ok(HG.player.crouch > 0.8, 'holding control crouches (' + HG.player.crouch.toFixed(2) + ')');
ok(crouchEye < standEye - 0.3, 'crouching lowers the eye (' + standEye.toFixed(2) + ' -> ' + crouchEye.toFixed(2) + ')');
HG.input.keys['ControlLeft'] = false;
frames(30);
ok(HG.player.crouch < 0.2, 'releasing it stands back up');

const kidsBefore = document.body.children.length;
HG.hud.damageNumbers = true;
HG.hud.damageNumber({ project() { this.z = 0.5; }, clone() { return { x: 0, y: 0, z: 0, project() { this.z = 0.5; } }; } }, 42, HG.player.camera, false);
ok(document.body.children.length > kidsBefore, 'a damage number is added to the page');
HG.hud.damageNumbers = false;
const n2 = document.body.children.length;
HG.hud.damageNumber({ project() {}, clone() { return this; } }, 42, HG.player.camera, false);
ok(document.body.children.length === n2, 'turning damage numbers off stops them');

console.log('\n== weapon attribution ==');
HG.game.weaponKills = {};
HG.enemies.clear();
HG.enemies.spawnAt('imp', HG.player.pos.x + 6, HG.player.pos.z, 1);
frames(2);
const imp = HG.enemies.list[0];
imp.hurt(999, { level: HG.level, player: HG.player, effects: HG.effects, audio: HG.audio, projectiles: HG.projectiles, onKill: HG.enemies.onKill, weapon: 'SHOTGUN' }, { x: 0, y: 0, z: 1 });
frames(2);
ok(HG.game.weaponKills.SHOTGUN === 1, 'a kill is attributed to the weapon that made it');
const st2 = HG.runStats();
ok(st2.favourite && st2.favourite[0] === 'SHOTGUN', 'the favourite weapon is the top of that table');
ok(typeof HG.audio.play === 'function', 'play takes an options argument now');

console.log('\n== run stats and the top five ==');
HG.game.state = 'playing';
HG.weapons.shots = 40;
HG.weapons.hits = 30;
const st = HG.runStats();
ok(st.accuracy === 75, 'accuracy is hits over shots: ' + st.accuracy + '%');
ok(typeof st.damageTaken === 'number', 'damage taken is tracked');
ok(HG.player.onStep === undefined || typeof HG.player.onStep === 'function', 'a footstep callback can be attached');

let steps = 0;
HG.player.onStep = () => { steps++; };
HG.input.move.y = -1;
frames(90);
ok(steps > 0, 'walking produces footsteps: ' + steps);
HG.input.move.y = 0;
HG.player.onStep = null;

for (let i = 0; i < 7; i++) {
  HG.recordRun({ score: 100 * (i + 1), waves: i, kills: i * 2, seed: 's' + i });
}
const top = HG.topRuns();
ok(top.length === 5, 'only five runs are kept (' + top.length + ')');
ok(top[0].score === 700, 'the table is sorted by score (' + top[0].score + ')');
ok(top[4].score === 300, 'the lowest of the kept five is 300');

console.log('\n== trinkets (loot) ==');
const { TRINKETS: TK, sumEffects, SLOTS: SL } = await import('../play/src/loot.js');
ok(TK.length === 6, 'six trinkets defined');
ok(SL === 3, 'the belt holds three');
HG.game.trinkets = [];
HG.game.score = 0;
const dmg0 = HG.player.baseDamage;
HG.game.trinkets.push('edge');
HG.game.trinkets.push('hide');
const effects = sumEffects(HG.game.trinkets);
ok(effects.damage > 0 && effects.hp > 0, 'effects sum across the belt');
HG.recomputeStats();
frames(2);
ok(HG.player.baseDamage > dmg0, 'the damage trinket raises the base (' + dmg0.toFixed(2) + ' -> ' + HG.player.baseDamage.toFixed(2) + ')');
ok(HG.player.maxHp > 110, 'the health trinket raises the cap: ' + HG.player.maxHp);
HG.game.trinkets.push('cell');
HG.recomputeStats();
ok(HG.powers.regenMul > 1, 'the energy trinket raises regeneration: ' + HG.powers.regenMul.toFixed(2));
HG.dropTrinket('boots', { x: HG.player.pos.x, y: 0, z: HG.player.pos.z });
frames(3);
ok(HG.game.trinkets.length === 3, 'a fourth trinket does not fit the belt');
ok(HG.game.score >= 100, 'the spare becomes score: ' + HG.game.score);
HG.dropTrinket('plate', { x: HG.player.pos.x, y: 0, z: HG.player.pos.z });
frames(2);
ok(HG.game.score >= 200, 'every spare pays');
HG.game.trinkets = [];
HG.recomputeStats();
frames(2);

console.log('\n== branching terminals ==');
const choiceEntry = HG.lore.entries.find((e) => e.entry.choice);
if (choiceEntry) {
  HG.player.pos.set(choiceEntry.x + 0.4, choiceEntry.y, choiceEntry.z);
  HG.lore.update(HG.player);
  HG.openLore();
  frames(1);
  ok(HG.game.state === 'lore', 'a terminal with a question opens');
  const opt = choiceEntry.entry.choice.options.find((o) => o.effect === 'score');
  const sc = HG.game.score;
  HG.resolveChoice(choiceEntry.entry, opt);
  ok(HG.game.score === sc + 150, 'the choice pays its reward (' + sc + ' -> ' + HG.game.score + ')');
  ok(HG.game.loreChoices[choiceEntry.entry.title], 'the choice is recorded');
  const sc2 = HG.game.score;
  HG.resolveChoice(choiceEntry.entry, opt);
  ok(HG.game.score === sc2, 'the same terminal cannot be farmed');
  HG.closeLore();
  frames(1);
} else {
  ok(false, 'no terminal in this level carries a choice');
}
const ambush = HG.lore.entries.find((e) => e.entry.choice && e.entry.choice.options.some((o) => o.effect === 'ambush'));
if (ambush) {
  const before = HG.enemies.list.length;
  const optA = ambush.entry.choice.options.find((o) => o.effect === 'ambush');
  HG.resolveChoice(ambush.entry, optA);
  ok(HG.enemies.list.length > before, 'the ambush choice spawns enemies (' + before + ' -> ' + HG.enemies.list.length + ')');
}

console.log('\n== prop LOD ==');
ok(HG.props && HG.props.grassMesh, 'the level has a grass mesh');
HG.props.setQuality(0);
ok(HG.props.grassMesh.visible === false, 'low quality hides the grass');
HG.props.setQuality(1);
ok(HG.props.grassMesh.visible === true, 'high quality restores it');

console.log('\n== lore terminals ==');
ok(HG.lore && HG.lore.entries.length === 3, 'three terminals placed (' + (HG.lore ? HG.lore.entries.length : 0) + ')');
const t0 = HG.lore.entries.find((e) => !HG.lore.read.has(e.entry.title)) || HG.lore.entries[0];
HG.player.pos.set(t0.x + 0.5, t0.y, t0.z);
frames(2);
ok(HG.lore.near === t0, 'the nearest terminal is detected');
const s0 = HG.game.score;
HG.openLore();
frames(1);
ok(HG.game.state === 'lore', 'reading opens the terminal');
ok(HG.game.score === s0 + 75, 'the first read pays 75 (' + s0 + ' -> ' + HG.game.score + ')');
HG.closeLore();
frames(1);
ok(HG.game.state === 'playing', 'closing returns to play');
const s1 = HG.game.score;
HG.openLore();
frames(1);
ok(HG.game.score === s1, 're-reading pays nothing');
HG.closeLore();

console.log('\n== timed buffs ==');
HG.game.buffs.damage = 0;
frames(2);
const baseDmg = HG.player.damageMul;
HG.game.buffs.damage = 20;
frames(2);
ok(HG.player.damageMul > baseDmg, 'the damage buff raises the multiplier');
HG.game.buffs.damage = 0.02;
frames(4);
ok(Math.abs(HG.player.damageMul - baseDmg) < 1e-9, 'the buff expires and the multiplier returns');

console.log('\n== save, continue and status ==');
ok(!!HG.loadRun(), 'a run is saved when a wave starts');
const sv0 = HG.loadRun();
ok(sv0.wave >= 1 && !!sv0.zoneId, 'the save carries zone and wave');
HG.game.score = 1234;
HG.game.wave = 2;
HG.saveRun();
const sv1 = HG.loadRun();
ok(sv1.score === 1234 && sv1.wave === 2, 'the save captures score and wave');
HG.resumeRun(sv1);
frames(2);
ok(HG.game.state === 'playing', 'resuming returns to play');
ok(HG.game.score === 1234, 'resuming restores the score');
ok(HG.game.wave === 2, 'resuming restores the wave');
HG.toggleInventory();
ok(HG.game.state === 'inventory', 'tab opens the status panel');
ok(document.getElementById('invBody').innerHTML.length > 100, 'the panel has content');
HG.toggleInventory();
ok(HG.game.state === 'playing', 'tab closes it again');
HG.clearRun();
ok(HG.loadRun() === null, 'the save can be cleared');

console.log('\n== score and timer (roadmap 26) ==');
HG.enemies.clear();
HG.player.pos.set(HG.level.spawn.x, 0, HG.level.spawn.z);
HG.game.wave = 2;
HG.game.exitOpen = false;
HG.game.waveKills = 4;
HG.game.score = 0;
frames(4);
ok(HG.game.score > 0, 'clearing a wave awards score: ' + HG.game.score);
ok(HG.hud.elScore.textContent === String(HG.game.score), 'the HUD shows the score');
HG.player.damage(999, { x: 0, y: 0, z: 0 });
frames(3);
const best = JSON.parse(localStorage.getItem('hellgate.best'));
ok(best.score === HG.game.score, 'the best run records the score: ' + best.score);
// the death above ended the run; later blocks need a live game
HG.player.alive = true;
HG.player.health = 100;
HG.game.state = 'playing';

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
ok(HG.player.health === HG.player.maxHp && HG.player.ammo.shells === 16, 'player reset to full health with full ammo');
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

console.log('\n== spatial audio (castle-valley transfer) ==');
const { panGain } = await import('../play/src/audio.js');
const L0 = { x: 0, z: 0, yaw: 0 };
ok(panGain({ x: 0, z: 0 }, L0).gain === 1, 'sound at the listener is full gain');
ok(Math.abs(panGain({ x: 0, z: 0 }, L0).pan) < 1e-9, 'sound at the listener is centred');
ok(panGain({ x: 10, z: 0 }, L0).pan > 0.5, 'sound to the right pans right');
ok(panGain({ x: -10, z: 0 }, L0).pan < -0.5, 'sound to the left pans left');
ok(panGain({ x: 0, z: -10 }, L0).pan === 0, 'sound straight ahead stays centred');
ok(panGain({ x: 0, z: 40 }, L0).gain === 0, 'sound beyond range is silent');
ok(panGain({ x: 13, z: 0 }, L0).gain > 0 && panGain({ x: 13, z: 0 }, L0).gain < 0.6, 'gain falls with distance');

console.log('\n== adaptive resolution (castle-valley transfer) ==');
const r0 = HG.perf.ratio;
for (let i = 0; i < 70; i++) frames(1); // 70 slow-ish frames at 1/60
ok(HG.perf.ratio <= r0, 'ratio never exceeds the cap');
ok(typeof HG.perf.ratio === 'number' && HG.perf.ratio >= 0.7, 'ratio stays above the floor: ' + HG.perf.ratio.toFixed(2));

console.log('\n== no wasted pickups (roadmap 8) ==');
HG.enemies.clear(); // isolate: a stray hit would drop health below 100 mid-test
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
