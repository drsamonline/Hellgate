# HELLGATE — handover

Everything a person or an agent needs to pick this up cold. Written at **v1.90.0**, 2026-11-22. Updated at **v2.40.0**, 2026-11-26.

Read this first, then `documentation/architecture.md` for the module map and
`documentation/audit.md` for what has been checked and what was deliberately left alone.

---

## 1. What this is

A Doom-style 2.5D arena FPS in the browser. Nine zones, eight enemy types, four guns plus a blade and
grenades, five powers, three classes, a branching story, a codex, achievements and a daily run.

| | |
| --- | --- |
| Live | https://drsamonline.github.io/Hellgate/play/ |
| Repo | https://github.com/drsamonline/Hellgate |
| Stack | Three.js (vendored, r160 family), ES modules, **no build step**, **no npm at runtime** |
| Assets | **None.** Every texture, model and sound is generated in code |
| Licence | PolyForm Noncommercial 1.0.0 |

## 2. State at handover

| Metric | Value |
| --- | --- |
| Version | 2.40.0 (`VERSION`, and `BUILD` in `play/src/main.js` — they must match) |
| Releases | 144, `v1.0.0` → `v2.40.0` |
| Modules | 40 in `play/src/`, ~13,100 lines |
| Assertions | 1391 playability (all 32 levels) + 764 in the other three suites |
| Browser gates | `smoke`, `audit-run`, `audit-flow`, `audit-invariants`, `soak` |
| Static gates | claims 14/14, docs, links, pages, stub, dead-code |
| Draw calls | **78–85** with eight imps in view, camera level (was 154–181); the old **43** was measured on a frame with no enemy drawn — see audit pass seventeen |
| Roadmap | 60 shipped, 3 measured-and-rejected, 3 open of 66 |
| Audit tail | **closed** at 1.91.0 — all 37 modules read line by line |

## 3. Run it

```bash
cd play && python3 -m http.server 8000   # then open http://localhost:8000/
```

No install, no build. Any static server works. Opening `index.html` from `file://` will not work — ES modules
need a real origin.

### The gates, in the order to run them

```bash
bash tests/run.sh              # 1391 assertions, ~16 s, no browser
node tools/check-claims.js     # 14 checks: README claims vs the code
node tools/check-docs.mjs      # every export has a JSDoc block
node tools/check-links.mjs     # every local reference resolves
node tools/check-pages.mjs     # every declared path exists
node tools/check-stub.mjs      # the three.js stub covers every symbol used
node tools/audit-dead.mjs      # no unused exports, no conflicting constants
node tools/smoke.mjs           # real Chromium: boot, HUD, touch, draw-call budgets
node tools/audit-flow.mjs      # the whole UI journey, 13 steps
node tools/audit-invariants.mjs gate,kiln,cistern,vault   # 900 frames each, no NaN anywhere
node tools/soak.mjs            # 90 s per difficulty, "did it fall over"
```

### Release process

1. Bump `VERSION` **and** `BUILD` in `play/src/main.js` (the claims check enforces the pair).
2. Add a `CHANGELOG.md` entry.
3. Run every gate above.
4. `git commit`, `git push origin main`, `git tag -a vX.Y.Z`, `git push origin vX.Y.Z`.
5. `gh release create vX.Y.Z --title ... --notes-file ...`
6. Confirm both workflows green: `gh run list --workflow test.yml` and `pages.yml`.

`pages.yml` mirrors `main` to `gh-pages` and stamps `?v=<VERSION>` onto every module URL first
(`tools/stamp-cache.mjs`). Source stays unstamped; the stamp is idempotent.

## 4. The map

### `play/src/` — 45 modules

| Group | Modules |
| --- | --- |
| Core | `main.js` (the loop, state machine, wiring — 2,600 lines), `player.js`, `weapons.js`, `powers.js`, `classes.js` |
| World | `level.js` (cell grid + generation), `levelmesh.js` (merged geometry), `world.js` (zone table), `story-levels.js` (the 32-level campaign table), `campath.js` (the cutscene camera's path), `props.js`, `items.js`, `textures.js`, `pixel.js` |
| Enemies | `enemies.js` (8 types, AI, spawn, pools), `rig.js` (humanoid + quadruped joints), `models.js`, `glb.js` |
| Feel | `effects.js` (pooled particles, decals, tracers, lights), `bloom.js`, `audio.js`, `music.js`, `cinematic.js`, `dialogue.js`, `story.js` |
| UI | `hud.js`, `minimap.js`, `codex.js`, `search.js`, `touch.js`, `settings.js` |
| Meta | `achievements.js`, `daily.js`, `loot.js`, `lore.js`, `book.js`, `zonebook.js`, `companion.js`, `projectiles.js`, `rng.js` |

### `tools/` — 20 scripts

Audits (`audit-*.mjs`), gates (`check-*.js`), measurement (`soak`, `balance-report`, `shoot`, `map`,
`lighthouse`), and `pick-seeds.mjs` (scores candidate seeds and picks the nine zone seeds).

### `documentation/` — 11 files

`architecture`, `api`, `level-generation`, `combat`, `rpg-systems`, `hud-and-feel`, `balance`, `tuning`,
`testing`, `getting-started`, and **`audit.md`** — the record of every audit pass, finding and deliberate
non-finding. Read `audit.md` before changing anything it covers.

## 5. Traps — read these before touching the code

Each of these cost a failed attempt or a shipped bug. They are the expensive knowledge.

### Geometry and level

- **Door orientation**: the door is thin along the axis whose neighbour belongs to `level.exitRoom`. Asking
  "which neighbour is open" is wrong — the room itself is open — and cost two failed attempts.
- **Rig hip height** is `thigh + shin`. There is no `p.legLen`; reading one put every joint at NaN and the
  bodies rendered as nothing.
- **Barrels are a volume**, not a circle: `damageBarrels` needs the ray's height at the hit distance, or a shot
  at the ceiling above a barrel sets it off.
- **Decor geometry** goes into a `decor:<texture>` bucket so the geometry test can skip it. Shell triangles must
  all face open space (0 violations across 5 seeds).
- `generateLevel(seed, opts)` wraps `buildLevel` with 8 attempts requiring `reachCount >= 220` and
  `spawnRoomExits >= 1`.

### Enemies

- **No enemy may ever spawn in the spawn room**, and never within 12 m of the player or the spawn point.
- `BODY_POOL` per type, cap 14; call `clearBodyPool(type)` after installing a model. Reset joints to
  `userData.restX` and materials to `userData.baseColor` when a body returns to the pool.
- `LOD_DIST = 12`. No paw meshes — four invisible draw calls each.
- Bodies are merged to **one mesh per joint** (`mergeJointMeshes` in `rig.js`): 13 for an imp, 16 for a grunt.
  Materials are not merged, so the emissive eyes keep their own mesh.

### Stats — the defect class this codebase keeps producing

Four separate bugs in this project came from **one value written in two places that disagreed about its limit**:

| Value | The two writers |
| --- | --- |
| Damage numbers | `Enemy.hurt()` and `weapons.js` (both drew one) |
| Zone counter | `zoneCleared()` and, by a bad patch, `pauseGame()` and `gameOver()` |
| Player stats | `applyClass()` adjusting and `recomputeStats()` deriving |
| Health/armour/ammo ceilings | `heal()` capping at a literal 100, `addArmor()` capping at 100, `applyClass` not capping |

**The rule**: `recomputeStats()` is a pure derivation from class + upgrades + trinkets + story flags. It is
idempotent and it is the only place stats are computed. Anything that "adjusts" a stat afterwards will be
wiped by the next call.

### The map library

- **`play/src/maplib.js`** holds named maps in `localStorage['hellgate.maps']`: twelve of them, 24 kB each, newest
  first, and a corrupt store reads as empty rather than throwing.
- **`audit-dead.mjs` understands `import * as`** now: a namespace import then `alias.name()` is a use. It reported
  four live exports as dead before that.

### Observed once, not reproduced

- **`and none within 12 m of the spawn point`** failed once on 2.38.0's tree and has not failed in ten runs since.
  That is a hard constraint — nothing may spawn within 12 m — so if it ever fails twice in a row it is a real bug in
  `spawnWave`'s pool, not a flake. Re-run before believing it; then look at the pool, not the test.
- **`enemy owns cloned flash materials` / `enemy flashes white-hot on a hit`** failed once, same day, same pattern.

### The editor

- **Undo is one step per stroke.** `beginStroke()` snapshots on pointer-down, `endStroke()` closes it; a paint
  outside a stroke snapshots on its own. Forty states deep.
- **Save writes `localStorage['hellgate.editor']`** on stroke end, on resize and on the button; `openEditor()` reads
  it before it looks at the level you are standing in.
- **Heights are per cell now**: `paintHeight(cx, cz, floor, ceil)`, four floor presets and two ceilings, carried
  through `toMap()` run-length, undo and resize. Stored in plain arrays — a `Float32Array` makes 2.4 into
  2.4000000953674316 and every equality in the format wrong.

- **`play/src/editor.js`** holds a grid of codes, a brush and a canvas; `toMap()` writes the format `maps.js` reads,
  so an edited level and a generated one are the same kind of thing. Opened from the title, or seeded from the run
  you are in.
- **What it does not have yet:** save, undo, resize, and per-cell heights. A map is one flat room at 3.4 m.

### Maps, and what a level cannot carry

- **`play/src/maps.js`** exports a level as a grid of characters plus run-length heights: 6,812 bytes at the
  largest, 0 cells different on the way back for all 32 levels. `?map=` plays one.
- **A map does not carry reachability**, so `importMap` treats every open cell as reachable. That is right for a
  hand-drawn map and wrong for a generated one with sealed rooms — if a map format ever needs it, flood-fill on
  import.
- **Crates and secrets need `idx`**: the mesh builder indexes `level.cells` by it.

### Lifts, and the coordinates that are not there

- **A lift cell carries `c.lift.y`** and `updateLifts()` moves the plate; the player rides it because
  `floorHeightAt` reads the lift first and the player snaps up to the floor. Asserted: 1.97 m in three seconds.
- **A raw cell has `x` and `z`, not `wx` and `wz`.** Those live on `reachableCells`. Using them in a probe puts the
  player at `NaN` and the report reads like a product bug — it has cost two runs in this session.
- **`buildFlowField()` guards its start cell.** An out-of-range start used to throw on `level.cells[start].solid`.

### The guns are models

- **`VIEW` in `weapons.js` frames each gun on its own** — position, yaw, scale — in the weapon camera's space. The
  models are built at real scale (a shotgun is 0.62 m of barrel), so they sit at 1.0–1.12 m; at 0.55 m the receiver
  was under the near plane.
- **2.9.0 made them sprites and 2.34.0 put the models back.** The canvas gun art is gone; the kick, sway, swap dip,
  aspect scale and muzzle flash are unchanged. If a fourth pass is wanted, it is `VIEW` plus the part lists in
  `buildModels()`.

### Bosses, by level and by zone

- **A campaign level picks its boss by act** (`BOSS_FOR_ACT`, on levels 8/16/24/32). **A boss rush picks by zone**
  (`BOSS_FOR_ZONE`). Before 2.33.0 boss rush used the act, which is zero outside the campaign, so it was the warden
  nine times.
- **`beginZone(zone, level, fresh)` takes three arguments.** The mode is a module variable; `selectMode()` writes it.

### The ladder, in the rosters' terms

- **`node tools/balance-report.mjs acts`** computes each act's first wave from `ROSTER_FOR_ACT`: wave health, the
  seconds a shotgun needs, incoming dps, and the upper-bound damage of standing still. Act IV is 971 hp and 9.4 s.
- **The guard:** no act's wave may take fifteen seconds of shotgun, and each act must take longer than the one
  before. A future roster change that turns the finale into a slog fails the suite.

### Naming the act

- **The cleared panel knows when an act ended**: `game.bossLevel` is true on 8, 16, 24 and 32, so those read
  `ACT n COMPLETE`; 32 reads `CAMPAIGN COMPLETE`; everything else reads `LEVEL CLEARED`.
- **The codex says which act each boss closes** — `BOSS_FOR_ACT` is passed into `buildCodex` for that note only.

### What the audit plays

- **`node tools/audit-invariants.mjs`** runs 900 frames of real play per target with random input and asserts no
  NaN, nothing out of bounds, no unbounded pool. It now includes the campaign: the four act openings and the four
  boss levels, not only the zones. In CI.
- **A campaign level decides its boss by its own row.** `zone.boss` is true for the throne, and reading it on every
  level put THE GATE on 25 through 31 as well as 32.

### Scenes, and the key that wins

- **A scene is keyed by the level's id first**, then by act. A level with its own outro never falls through — so a
  new `the-cinder-outro` is dead data when the level is `the-first-relic`.
- **A duplicate key in the object literal silently wins with the last one.** `'the-throne-outro'` was written twice;
  the copy with the gate's line lost. A test reads the source and fails on any repeated key.

### What walks at you

- **`ROSTER_FOR_ACT` in `story-levels.js`.** A campaign level is one wave, and `spawnWave` picked bodies by wave
  number — so every enemy in all 32 levels was an imp, and six of the ten types were unreachable in the campaign.
- **`spawnWave({ roster })`** takes the list from the caller. The wave-number ladder stays for endless and boss-rush.
- **A mirrored table drifts.** The balance report carried a four-entry copy of `TYPES`; the bosses and rosters made
  every entry past those four `undefined`. It imports the real table now.

### The four bosses

- **Behaviour is asserted, not just data.** The cinder must put a lob in the air within six seconds; the warden
  must never lob — it is the control that proves the difference is real; the spine must exceed its walk speed and
  close the distance; the gate must do both.

- **`BOSS_FOR_ACT` in `story-levels.js`**: act → type (`warden`, `cinder`, `spine`, `gate`). The level row carries
  `boss: true` on 8, 16, 24 and 32; `buildRun` copies it to `game.bossLevel` and `startWave` passes the type.
- **The entrance cinematic reads the boss's own label.** It said `THE WARDEN` for every boss until 2.27.0, because
  the string was hardcoded in `startWave`.
- **An achievement that says "every type" must derive the count.** `BESTIARY` read `h.types >= 8`; four new bodies
  would have made it fire early. It reads `Object.keys(TYPES).length` now.

### Reading the DOM in a test

- **The HUD is drawn by the loop.** Reading `#objective` before a frame reads the *previous* level's line — the first
  version of the first-run test reported `CLEAR THE WAVE` on a `reach` level because of it.
- **The intro panel types itself** at 34 characters a second, so its text is empty on the frame the intro opens.
- **Wall-clock timings from this pod are about the renderer** (~1 fps), not the game. Drive `HG.update()` at a fixed
  step when the assertion is about behaviour.

### Performance, and the gate that lied

- **`node tools/drawcalls.mjs`** measures `renderer.info.render.calls` per level in a real browser: median 90, worst
  122 (level 3) with twenty bodies on the floor. Budget 200, enforced in CI.
- **It has to be a browser.** The three.js double has no renderer, so a headless scene-graph count answered zero for
  every level and reported "ok every level is inside the budget" — a gate that passes because it measured nothing.

### Shippable, and the three things that were not

- **`tools/check-assets.mjs`** checks every local file a page in `docs/` points at. `check-links.mjs` skips `docs/`
  as a deploy artefact, and six 404s shipped on the landing page because of it. In CI.
- **The landing page's CTA was `./play/`** from a page that already lives in `docs/play/` — it pointed at
  `docs/play/play/`. The game is at `../../play/`.
- **The flaky resume assertion is gone.** `resumeRun()` is tested with a synthetic save, not with the save the line
  above wrote; the wave-clear side effect cannot reach it.
- **`grain()` draws in 2 × 2 blocks at half the amplitude.** Per-pixel noise on a 64 px texture quantised to twelve
  colours is television static at close range.

### The end of the campaign, and a test that dirtied the record

- **`beginLevel()` clamps to `STORY_LEVELS.length`**, so "Next level" on level 32 restarted level 32. The cleared
  screen says `CAMPAIGN COMPLETE` on the last level and its button returns to the title.
- **`zoneCleared()` writes `progress`** — level, cleared list, best. A test that calls it must snapshot and restore
  the whole object, or the level-select assertion later in the same file reads a world where level 32 is already
  cleared. A test that changes the state other tests read is a test of the order, not of the code.

### The wall invariant

- **`tests/test-game.mjs` walks the player into a wall 32 times** — four levels, eight directions, 90 frames each,
  from the middle of a room — and fails if the player ends up inside a solid cell or overlapping one. Six bodies
  chase the player for four seconds under the same rule.
- It passes, so "some walls are pass through" from the first player report is either fixed (by the `circleBlocked`
  cell-extent fix at 1.9x) or is something the walk cannot reach: a door left open, a lift mid-move, or a cell
  whose mesh and collision disagree. Ask for the room.

### The LOD proxy

- **Past `LOD_DIST` (24 m) an enemy is one mesh**, not ten parts: that is where the draw calls go. The proxy is a
  six-sided body tapering from the shoulders up, in the enemy's colour. It was a cube, and a cube at 30 m reads as
  a crate — a player said so before I did.

### Two cameras, and one rule for both

- **A camera follows the floor.** The intro used to lerp between room centres — a chord through walls. It uses
  `buildCameraPath()` now, and a test samples its whole length and fails on any point that lands in a solid cell.
  `Story.start()` opens the doors for the path build and closes them again: the camera flies the level as it will
  be, not as it is in the half-second before a wave.
- **A first-person gun points up the screen.** The first two sprite passes drew a profile silhouette, which reads
  as a gun lying on the floor. Muzzle at the top, receiver filling the bottom, barrel short and shaded as a tube.

### Teaching, and the widest text in the game

- **`LEVEL_HINTS` in `story-levels.js`**, queued by `queueHints()` after the class is chosen and shown by
  `updateHints(dt)` four seconds apart, only on a level `progress.levels` does not already contain.
- **`#toast` wraps above 48 characters.** It was `white-space: nowrap` with no width limit, so the first hint ran off
  both edges of the screen. `hud.toast()` adds `.wrap` past that length; the rule is `min(92vw, 860px)`.

### The vocabulary

- **A campaign level is a level, not a zone.** The zone is what dresses it. The cleared screen, the journal and the
  class toast say `LEVEL n · title` when `game.level` is set, and keep the zone's words for a zone run.

### The controls table

- **`CONTROLS` in `main.js` is the list the controls screen draws**, and a test reads the key handler's source for
  `e.code === '…'` and fails if a binding is missing from it. Add a key, add a row, or CI goes red.
- **`showControls(from)` remembers where it came from.** Opened from the title it closes to the title; opened from
  the pause menu it closes into the run.

### The record, and the two tables that read it

- **`record` (achievements history) now carries the campaign's tally**: `levels`, `acts`, `doors`, written in
  `zoneCleared()` from `progress`, the same object the map draws. `THE GATE IS YOURS` reads `progress.cleared`,
  which only *zone* clears fill — it could never fire in the campaign.
- **The codex has an OBJECTIVE kind**: REACH, CLEAR, SURVIVE, RELICS, in the words the HUD uses.
- **An assertion that counted entries** broke the moment a fifth kind was added. Coverage by kind is the honest
  assertion; a total is a claim about today.

### The ladder

- **`ACT_THREAT` is in `story-levels.js`**, not `main.js`: it is a property of the campaign. `0.80 / 1.10 / 1.40 /
  1.80`, applied as a floor, so a zone already harder than its act keeps its own threat.
- **`node tools/balance-report.mjs acts`** prints what each act costs: enemies, imp hp, damage per hit, hits to
  kill a 110 hp player, and the upper-bound damage of the whole first wave.
- **The guard:** acts must climb, an imp must be tougher each act, and no act may kill a full-health player in
  fewer than three hits. That last one is the difference between steep and broken.

### Layout, and the one gate that can see it

- **A `display:none` control is not a broken control.** `#continueBtn` is hidden until there is a run to
  continue; the sweep skips it rather than reporting it.
- **The class screen draws its cards when it is opened, not when it is shown.** `showScreen('class')` alone
  gives an empty screen; `showClassScreen()` is what a player sees.
- **Every panel needs a pointer exit.** The journal, codex and status panel answered `Escape` only; a phone has no
  `Escape`. Each carries a `.panelclose` button now, and `smoke.mjs` asserts every panel closes from its own
  button.

- **`.screen` is a centred flex column.** More content than window height puts the overflow *above* the top, at a
  negative y, where it cannot be seen or clicked. `.screen` scrolls now and `#map`/`#codex` start at the top.
- **The headless suite has no layout engine.** Every assertion about the map was about `innerHTML`. `smoke.mjs`
  is the only gate that can see this, and it now opens `Levels` with a real pointer, checks the first row is
  inside the window and is the element under the pointer, and clicks it.
- **A real pointer click is a different test from `.click()`.** `page.click` hit-tests; `element.click()` does not.
  The map rows passed the second and failed the first for a release.

### Sectors, and what stands on them

- **A cell may carry `c.sectors`**: `[ground, deck]`. `floorHeightAt(level, x, z, fromY)` picks the sector you
  land on from the height you arrive at — pass `fromY` or you get the ground every time. The player does.
- **Nothing may be placed on a deck cell.** A crate's mesh sits at the cell's floor, so a crate on a catwalk hangs
  2.4 m up and blocks it; a pickup there is invisible from the floor. Crates and `randomCell()` skip `c.sectors`.
- **The flow field is at ground level.** A deck cell is reachable because you can walk under it — that is not the
  same as walking onto it, which is what the ramps and the lift are for.

### Replay, and what determinism costs

- **`?.addEventListener` on an id that is not in the page is a silent no-op.** `#clearedNext` was wired at 2.2.0
  and did not exist in the markup until 2.12.0, so a changelog line described a button nobody could press. Grep
  the id in `play/index.html` before believing a handler.

- **Every random number that changes the world draws from `simrng.js`**, seeded per level from the run's seed.
  Cosmetic randomness (particles, music, texture noise) stays on `Math.random` on purpose.
- **`buildRun(seed, zone, fresh)`** — `fresh` resets `coins` and `killsByType`. They carry across levels inside a
  run and must not carry across runs; without it a second run began with the first one's money.
- **`elapsed` resets per level.** A wave's time bonus depended on how long the session had been open.
- **`stateHash()` rounds to a centimetre.** Comparing raw floats fails for reasons nobody can see.
- **A replay runs exactly as many steps as it recorded.** One extra `update()` advances the world past the end of
  the recording and the hash stops meaning anything — that cost an hour of chasing a phantom.

### The guns are sprites

- **One quad per weapon**, drawn by `gunTexture()` into a canvas at load: `userData.sprites = { idle, fire }`,
  and `fire()` swaps the map while the muzzle timer runs. `select()` resets to idle, so a swap never leaves a
  lit frame behind.
- **The field is `key`, not `id`.** `WEAPONS[i].id` is undefined, and every gun drew the fallback art for a
  while because of it. Nothing in the suite could see it — the sprite was the right size with two frames.
- **A canvas texture needs `colorSpace = SRGBColorSpace`**, exactly as the painted wall textures do. Without it
  the renderer treats it as linear and every dark tone lifts: the guns rendered as white slabs.
- **Look at the render when the change is visual.** Both of those were found by taking a screenshot, not by an
  assertion. The second pass found a third: a hand drawn *behind* the gun reads as a plank on the floor — it has
  to be drawn over the grip.
- **A gradient body is three lines of code**: `createLinearGradient`, a lit edge above, a shadow under. It is the
  difference between a rectangle and a machined part.

### Cutscenes, and the two entry points

- **A level change cancels a cutscene; it does not complete it.** `cinematic.stop()` and `dialogue.stop()` run at
  the top of `beginZone()`. Without them the previous level's outro fired its callback into the next run and
  raised a cleared panel over it.
- **`?auto=1&level=N` is a level run.** It goes through `startGame()`, which reads `game.level` — set before the
  call in `applyUrlOverrides()`. It played three waves of the zone until 2.6.0: the same shape as the title
  screen bug at 2.3.1, in the other entry point.
- **The outro camera can leave the room you cleared.** The exit room is usually the smallest on the level, so
  `outroPath()` falls back to any reachable cell within 12 m — through the door, which is open by then.
- **The act is the difficulty floor** (`ACT_THREAT` in `main.js`). `zone.threat` alone is a curve over nine
  places, not 32 levels. `beginZone(zoneDef, levelN)` takes the number *before* `buildRun()` computes the
  difficulty — setting `game.level` after the call leaves the curve inert, which is how 2.2.0 shipped it.
- **The spawn rule has no fallback.** `spawnWave()` filtered cells to those more than 12 m from the player and the
  spawn and outside the spawn room, and then fell back to every reachable cell when the filter emptied — the
  player standing at the exit does that on a small level. Nothing spawns now (`enemies.starved` counts it). The
  brief's two rules are absolute, so the code must have no branch that ignores them.
- **`sampleCameraPath` clamps to 1.1 m above the floor.** Interpolating between two samples either side of a
  deck edge or a lift cuts through it, and a camera 15 cm above a raised floor is a camera in a wall.

### The helper, and his two offers

- **He has three offers, and `npcOfferKind()` is the only decider.** `job` while the job is unpaid; `relics` on
  a `clear` level with no relics on it (it turns the level into a `relics` level and pays 200 when the last one
  breaks); `door` once the job is paid, on a level whose door is shut and whose objective is not `reach`. `V`
  falls through to the terminal when there is none.
- **An offer that changes the objective writes the objective, nothing else.** The relics offer sets
  `objectiveType`, spawns the relics and shuts the door; `updateObjective()` opens it on the count, as on any
  `relics` level. Do not open the gate from the offer.
- **The shop is on `V` and nowhere else.** It used to buy the cheapest thing you were short of within 2.1 m,
  every 1.2 s, without asking — and spent the 250 the door costs while you read the offer. `openNpcShop()` is
  the only way in; `updateNpc()` never sells. The prompt is `V  SHOP` when he has nothing to ask and
  `V  TALK` when he does.
- **He sells the door; `openExit()` opens it.** The gate still has one writer.

### The campaign, and what a level is

- **A probe that sets up state the player cannot reach is not a probe.** 2.2.0 shipped a title screen whose
  Start never began the campaign, and every automated check passed: the probes cleared the seed box before
  clicking Start and the stub's box is empty, while the real markup ships `value="hellgate"`. The check that
  found it loads `/play/` with no parameters and clicks Start. Do that first, before any state setup.
- **Start reads a flag, not the box.** `seedTouched` is set by the input event; an untouched box starts the
  next campaign level, a typed one starts a zone on that seed.

- **A level is a row in `story-levels.js`, not a zone.** `beginLevel(n)` dresses the row on its base zone and
  sets `wavesTarget = 1`: one wave, one objective, and the pad ends the level. `game.level` is 0 for a zone run.
- **Two levels can share a zone**, so a save carries `level`, and `resumeRun()` resolves the zone from the
  level. Reading the zone id back instead gives level 12 the wrong seed.
- **`progress` holds both**: `unlocked`/`cleared`/`best` for zones, `level`/`levels` for the campaign. An old
  record has no `level`, and `loadProgress()` repairs it rather than throwing it away.
- **The modes that play levels say so**: `levels: true` on campaign, nightmare and hardcore. A seed typed in
  the box still starts a zone, which is how the playability suite plays nine zones over six seeds each.

### The objective gate

- **`startWave()` used to lock the doors on every level, `reach` included.** `buildRun()` opened them and
  `startWave(1)` shut them in the same call, so a `reach` level — the gate, and six campaign levels — read as
  a pen you empty. Found by the 32-level sweep at 2.3.0, not by any gate that existed before it.
- **`spawnRelics()` keeps relics out of the exit room and 8 m from the spawn**, which is not the same as out
  of the spawn room: a big room has cells 9 m from the spawn. Level 28 had one. It excludes the spawn room by
  room id now.

- **`openExit()` is the only writer of `game.exitOpen`.** `checkWave()` calls it for `clear` and `reach`;
  `updateObjective()` calls it for `survive` and `relics`. Nothing else may, and `updateObjective()` returns
  immediately when the door is already open, so a second call in the same frame opens nothing twice.
- **A `relics` level must not open its door because the room is empty.** `checkWave()` returns early for
  `relics` before it reaches the wave-clear path. `survive` deliberately keeps the clear path as a second way
  out — that is how 1.99.0 shipped it and what the playability suite plays, so narrowing it breaks 24
  assertions across four seeds.
- **`breakRelic()` never touches the gate.** It scores, bursts and splices; the door follows from the count.

### Save and resume

`saveRun()` must carry everything `resumeRun()` needs: zone, seed, wave, score, kills, class, health, armour,
ammo, trinkets, **upgrades, flags, bookAt, killsByType, relicsLeft, relicsTotal, sideDone**. The flags must be
restored *before* `applyClass`, which is what reads them.

### Tests

- A test that measures the world instead of the code will flake: three were rewritten (waiting for a fireball,
  waiting for a walk, waiting for a sightline). Assert the wiring, not the geometry.
- A test that hardcodes a number the game derives will fail the day the game improves: "seven modes" broke when
  an eighth was added; `health = 100` stopped meaning "full" once upgrades raised `maxHp`.
- `sumEffects()` takes trinket **ids**, not objects.
- The DOM stub has no `AudioContext`; the audio tests inject a fake context.
- `smoke.mjs` must close the desktop page before opening the mobile one — two live WebGL contexts under the
  software rasteriser kill the renderer, and the crash reads as a game bug.

### Environment

- The sandbox **cannot reach** `drsamonline.github.io` (egress blocked). A live-site check returns 502 HTML.
  Do not conclude the site is stale from that.
- The GitHub App cannot modify repo metadata (`PATCH /repos`, `PUT /topics` → 403): description and topics
  cannot be set from here.
- No Firefox or WebKit (missing `libXcursor.so.1`, `libgtk-3.so.0`). Frame time is unmeasurable under
  SwiftShader (150–200 ms); only draw-call counts are trustworthy.
- The pod restarts and resets `/scratch/work`. Always `git pull` before editing, and push early — an
  uncommitted fix does not survive.

## 6. What is left

### Roadmap — 9 open of 66, of which 3 are measured-and-rejected

| # | Item | Size | Note |
| --- | --- | --- | --- |
| 37 | Sector portals / true multi-level | XL | Floor+ceiling polygons with portal edges. The last structural item |
| 46 | Chunked level meshes | L | **Measured and rejected** — 255 draw calls against 117 |
| 47 | Texture atlas | L | **Measured and rejected** — cannot tile; walls repeat UV 2.4 |
| 48 | Weapon sprites instead of meshes | M | Doom-style 2D frames |
| 50 | Animated doors and lifts as sectors | L | Moving floor heights |
| 54 | Collision broadphase | L | **Measured and rejected** — 0.68 ms for fifty enemies |
| 56 | Deterministic replay | L | Input stream + seed; needs a sim RNG stream |
| 59 | WebGPU renderer | XL | Measure before committing |
| 60 | Co-op over WebRTC | XL | Host-authoritative |
| 63 | Level editor | XL | Paint-the-cells, exports a map |

### Measured and rejected — do not redo without new numbers

| Item | Why it stays rejected |
| --- | --- |
| Chunked level meshes | 4×4 chunks cost 255 draw calls against 117 for one mesh per texture: the arena is small enough that nearly every chunk is in frustum |
| Texture atlas | The whole level is **4 draw calls of 43**, and an atlas cannot tile — walls repeat UV 2.4, which needs a `fract()` shader or subdivided quads |
| Collision broadphase | Not needed at the current enemy counts; the list scan is not the bottleneck |

### Audit tail — closed at 1.91.0

All 37 modules have now been read line by line. The last eleven (`world.js`, `lore.js`, `items.js`,
`props.js`, `minimap.js`, `models.js`, `textures.js`, `level.js`, `levelmesh.js`, `cinematic.js`,
`effects.js`) produced nine findings in six modules — pass sixteen in `documentation/audit.md`, with the
measurements. The pattern held: every module read closely had something in it.

Two of those findings are worth remembering as traps:

- **A stair band's floor is a function of position, not a number.** `floorHeightAt` is the single source of
  truth for it, and `levelmesh` now samples that function rather than recomputing heights from
  `stairLow`/`stairHigh`. Recomputing is how the mesh ended up inside out on one axis and flipped on another.
- **`test-geometry.mjs` cannot see a surface that faces into its own open cell.** A tread facing down has open
  space under it, so the shell check passes. Stairs have their own assertions now.

## 7. How to work on it

- **Measure before optimising.** The atlas was planned, measured, and cancelled in twenty minutes; the win was
  in enemy bodies instead.
- **Verify visually when the change is visual.** A merge that loses a transform looks like a body missing an
  arm, not like a failed test.
- **Fix the cause, not the flake.** Three tests were rewritten because they measured the world; one harness was
  fixed because it opened two WebGL pages.
- **Write down the numbers with the decision.** `ENHANCEMENTS.md` and `documentation/audit.md` carry the
  measurements so the next person does not repeat the work.
- **Keep `VERSION` and `BUILD` in step**, and let `check-claims` fail if they drift.

### Read this first

`documentation/design-brief.md` — the player's direction, 2026-11-23: **32 story levels with objectives, cutscenes
and written dialogue**, replacing endless waves per zone and the wall terminals. The first slice is one level
start to finish, not thirty-two.

### Read this second if a player has complained

`documentation/player-report.md` — nine issues reported after playing to zone 6 on 1.98.0, triaged. Two are
critical (pass-through walls, enemies teleporting) and one is the honest verdict on the design (boring by zone 6).

### Traps learned at 1.91–1.99

| Trap | What it cost |
| --- | --- |
| **The pickup tests were flaky.** `full-health pickup is left on the floor` and `damaged player picks it up` failed about one run in five | They blamed `LOD_DIST` and then chests, both innocent. The cause: when the last enemy died in those frames the wave cleared and every pickup was dropped. Fixed by keeping one enemy alive across the assertion |
| **`resuming restores the score` was flaky** | Diagnosed and fixed at 2.0.0. It read the score two frames after `resumeRun()`, and a wave that spawned no enemy clears in two frames and pays the exit bonus into the score. The score is read before the loop runs now |
| **Four assertions went red on CI and green here** | All four were the same shape: a value the loop can move between the write and the read. The pistol target could be a corpse from an earlier section (`-2 -> -2`); the pickup keeper spawned at `player.pos + 22`, which can land in a wall and clear the wave; the hit-flash decay ran 90 rAF frames against a dt-scaled decay; the build stamp hardcoded `'1.'` and would have failed on 2.0.0 for no reason |


Four of these cost a release or a failed verification each.

| Trap | What it cost |
| --- | --- |
| **A seed is half a level.** `?seed=` replaces the seed, not the zone; `?zone=` only prefills the title screen. A harness that overrides one must override the other | A "catwalk missing" hunt that was building the gate's floor plan with an ashfall seed |
| **`InstancedMesh.count` is a draw range, not a liveness filter.** Slots are not compacted, so trimming `count` to the live body count hides every enemy above that index | 1.92.0 shipped invisible enemies; found by looking at a screenshot, not by a test |
| **A test that samples a cell boundary reads the neighbour.** `cellAt` rounds, so a sample at `t = 1` lands in the next cell and compares two different floors | A correct ramp failed the stair check on four seeds |
| **`bash tests/run.sh \| tail -1` hides the verdict.** The `FAIL` lines come before the last line, and `tail` exits 0, so a chain keeps going | A breaking commit pushed green-by-accident, reverted an hour later |

The gate line that reads the answer:

```bash
bash tests/run.sh | grep -E "FAIL|all suites"
```

### What 1.96 leaves open

| Item | State |
| --- | --- |
| #37 portal edges | Catwalks are step one: `c.sectors` exists, `floorHeightAt` takes a height, the deck is drawn with a rim. Portal edges between sectors and true multi-level rooms are untouched |
| #50 lifts | Not started. Needs a moving floor under a **merged, static** level mesh: exclude the lift cell from the merge, build it as its own mesh, move it per frame |
| #52 room shadows | Object shadows shipped; the level still does not cast into itself. Cascaded map or the per-cell bake #53 already writes |
| #54 broadphase | Measured and left alone: 0.68 ms for fifty enemies |
| #48, #56, #59, #60, #63 | Untouched |
