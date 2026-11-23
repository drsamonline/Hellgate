# HELLGATE — handover

Everything a person or an agent needs to pick this up cold. Written at **v1.90.0**, 2026-11-22. Updated at **v1.96.0**, 2026-11-23.

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
| Version | 1.96.0 (`VERSION`, and `BUILD` in `play/src/main.js` — they must match) |
| Releases | 96, `v1.0.0` → `v1.96.0` |
| Modules | 37 in `play/src/`, ~11,600 lines |
| Assertions | 885 across 4 suites |
| Browser gates | `smoke`, `audit-run`, `audit-flow`, `audit-invariants`, `soak` |
| Static gates | claims 14/14, docs, links, pages, stub, dead-code |
| Draw calls | **78–85** with eight imps in view, camera level (was 154–181); the old **43** was measured on a frame with no enemy drawn — see audit pass seventeen |
| Roadmap | 53 shipped, 4 measured-and-rejected, 8 open of 63 |
| Audit tail | **closed** at 1.91.0 — all 37 modules read line by line |

## 3. Run it

```bash
cd play && python3 -m http.server 8000   # then open http://localhost:8000/
```

No install, no build. Any static server works. Opening `index.html` from `file://` will not work — ES modules
need a real origin.

### The gates, in the order to run them

```bash
bash tests/run.sh              # 885 assertions, ~3 s, no browser
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

### `play/src/` — 37 modules

| Group | Modules |
| --- | --- |
| Core | `main.js` (the loop, state machine, wiring — 2,600 lines), `player.js`, `weapons.js`, `powers.js`, `classes.js` |
| World | `level.js` (cell grid + generation), `levelmesh.js` (merged geometry), `world.js` (zone table), `props.js`, `items.js`, `textures.js`, `pixel.js` |
| Enemies | `enemies.js` (8 types, AI, spawn, pools), `rig.js` (humanoid + quadruped joints), `models.js`, `glb.js` |
| Feel | `effects.js` (pooled particles, decals, tracers, lights), `bloom.js`, `audio.js`, `music.js`, `cinematic.js`, `story.js` |
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

### Roadmap — 10 open of 63

| # | Item | Size | Note |
| --- | --- | --- | --- |
| 37 | Sector portals / true multi-level | XL | Floor+ceiling polygons with portal edges. The last structural item |
| 45 | Instanced enemies | L | Bodies are merged; instancing needs per-instance colour for the hit flash |
| 48 | Weapon sprites instead of meshes | M | Doom-style 2D frames |
| 49 | Better enemy models | M | Same box budget, better silhouette |
| 50 | Animated doors and lifts as sectors | L | Moving floor heights |
| 52 | Real-time shadows | XL | Flat ambient is why rooms read as boxes |
| 54 | Collision broadphase | L | Only matters past ~50 enemies |
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

### Read this first if a player has complained

`documentation/player-report.md` — nine issues reported after playing to zone 6 on 1.98.0, triaged. Two are
critical (pass-through walls, enemies teleporting) and one is the honest verdict on the design (boring by zone 6).

### Traps learned at 1.91–1.96

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
