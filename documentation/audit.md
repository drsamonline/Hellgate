# Audit — 1.76.0

A full read of all 37 modules, plus three scripted sweeps and a browser flow walk.
This is the record of what was found and what was done about it.

## Method

| Pass | What it does |
| --- | --- |
| `tools/check-*.js` | The six standing gates: claims, docs, links, pages, stub, meta |
| `tools/audit-dead.mjs` | Unused exports and conflicting constants |
| Scripted sweep 1 | Storage and parse calls without a guard, `innerHTML` with a raw interpolation, empty catches, loose equality, markers, functions over 90 lines |
| Scripted sweep 2 | `setInterval` without a clear, global listeners outside `main.js`, division by a variable, `index - 1`, `parseInt` without a radix, allocations per frame |
| Scripted sweep 3 | The game state machine: every state written, every state compared |
| `tools/audit-flow.mjs` | The whole UI journey in a browser: title → intro → class → play → every panel → cleared → death |
| `tools/audit-run.mjs` | Every zone, every mode, every action, forty frames of random input |

## Found and fixed

| Finding | Where | Severity | Fix |
| --- | --- | --- | --- |
| `M` opened the map **and** toggled mute — the mute handler was never removed when the map took the key | `main.js` | high | Mute is `N`; a flow-audit step holds it |
| The map's Back button had **no listener at all** — a player on the map could only leave by picking a zone, which restarts the run | `main.js` | high | `#mapBack` returns to where the map was opened from |
| `JSON.parse` on a glb JSON chunk could throw a parse exception from three frames inside a loader | `glb.js` | medium | Caught and re-thrown as a readable error |
| `clone()` in the book engine threw on any value JSON cannot represent | `book.js` | medium | `structuredClone`, then JSON, then the original value |
| The kill feed built `innerHTML` from two unescaped strings | `hud.js` | medium | Escaped, because an `innerHTML` that trusts its caller is the habit that produces the bug later |

## Checked and left alone

| Finding | Verdict |
| --- | --- |
| Six functions over 90 lines (`buildLevelMeshes` 311, `humanoid` 137, `buildRun` 135, `initTouch` 135, `parseGLB` 107) | Each is one job with a long body: a mesh builder, a rig, a run setup, a touch binding, a file parser. Splitting them would move code, not simplify it |
| `== null` in six places | Deliberate: `== null` catches both `null` and `undefined`, which `=== null` does not |
| `parseInt` in the URL reader | Has a radix; the value is clamped downstream |
| `createElement('canvas')` in three modules | Once per boot, for texture and minimap prerendering |
| States written but never compared (`class`, `map`, `codex`, `cleared`, `dead`, `title`) | Screen states, not decision states: they are shown, not branched on. Every one has a matching `#id` |
| `index - 1` in `level.js` and `search.js` | Loop bounds, both guarded by the loop condition |

## The one thing that is not a finding

The browser flow audit crashed the page twice while switching six screens in one
session under the software rasteriser. Run with a fresh page per panel it is clean,
13 steps, no console errors. That is the sandbox's WebGL, not the game's — but the
tool now gives each panel its own page, which is better test design anyway.

## Pass two — reading the damage path

Reading `weapons.js` against `enemies.js` rather than sweeping them found the kind of bug a script cannot:
**every hit drew two damage numbers.**

`Enemy.hurt()` draws the number, because it is the one place every damage source passes through. `weapons.js`
drew it again after calling `hurt()`, in both the hitscan path and the blade. So a shotgun blast showed two
numbers per pellet, and a blade swing showed two for one hit.

Fixed by deleting the two calls in `weapons.js`, with a test that counts the pool cursor: one hit, one number.

## Pass three — invariants over 900 frames

`tools/audit-invariants.mjs` (new) runs the game for 900 simulated frames per zone with input that aims at
the nearest enemy and fires, swings the blade and throws grenades, then asserts what must always be true:

| Invariant | Checked |
| --- | --- |
| Player position finite | `Number.isFinite` on x, y, z |
| Health and armour in range | `0 <= health <= maxHp`, `armour >= 0` |
| Ammo non-negative | Every weapon |
| Player inside the grid | Cell within the level's own bounds, with 2 cells of slack |
| Enemy positions finite, hp in range | Every living enemy |
| No enemy under the floor | Against the cell's own floor height |
| Pools bounded | Particles ≤ 700, decals ≤ 60, projectiles ≤ 120 |
| No orphan enemy mesh | Scene traverse against the enemy list |

Result: four zones, 900 frames each, **all held**. Two real bugs so far from this audit; the invariant tool
stays as the fourth browser gate.

## Pass four — the story flags, and a claim that was not true

Reading `applyClass` against the release notes for 1.70.0 found two things, and the second is worse than a bug.

**A choice paid twice.** `takeChoice()` called `effectsFor(game.flags)`, which sums every flag the run has ever
set, and granted the whole total on top of what the zone start had already given. Choosing mercy a second time
paid for both mercies again.

**A promise with no code behind it.** The 1.70.0 notes said *"haste gives speed, careful gives armour at zone
start"*. The block that would have done it was written against a line that did not exist, so the patch matched
nothing and shipped silently. Speed and armour never changed; only score and pickups did, because those were
wired separately.

Both are fixed in 1.78.0, with three tests that hold one flag each — speed, armour, max health — plus one that
holds the single payment. The lesson is not "test the flags"; it is that a release note is a claim like any
other, and this audit should have checked the claims it made last week, not only the code it read today.

## Pass five — the powers, and a smoke test that lied about the environment

Reading `powers.js` found two powers passing a thinner context than every other damage source:

| Power | What was missing | Effect |
| --- | --- | --- |
| `shockwave` | `hud`, `camera` | No damage numbers for a power that hits everything within 6 m |
| `volley` | `hud`, `camera`, `weapon` | No numbers, and the kill feed said `DOWN` instead of `VOLLEY` |

Both now pass the same context as the shotgun. A test casts **all five powers across all three classes** and
asserts each one changes something observable and goes on cooldown — the first test in the suite that would
notice a power being silently inert.

**And the smoke test was blaming the game for the pod.** It kept the desktop page open while opening a second
mobile page, so two live WebGL contexts ran under the software rasteriser at once and the renderer was killed.
The failure read as `Target closed` at the touch step. The desktop page is closed before the mobile one opens,
and the run is clean.

## Pass six — nothing in a table may be inert

The haste/careful finding generalised into a test: **every entry in every content table must move something
the player can feel.** The suite now walks each table and asserts the entry does its job.

| Table | Entries | Assertion |
| --- | --- | --- |
| Trinkets | 6 | Each one changes the stat it names — damage, hp, energy, speed, armour, leech |
| Upgrades | 6 | Each one changes something after `recomputeStats()` |
| Modes | 7 + campaign | Each differs from campaign in at least one key that is not `name` or `blurb` |
| Zones | 9 | Distinct seeds, at least three floor-plan shapes, at least three threat levels |
| Classes | 3 | Distinct signatures across hp, armour, speed, damage, energy, weapon and powers |
| Powers | 5 | Each changes something observable and goes on cooldown |

All of them pass. That is the useful result of this pass: the tables were already honest, and the one table
that was not — the story flags — was found by reading rather than by sweeping.

## Pass seven — a resumed run was not the same run

`saveRun()` wrote the numbers a HUD shows — zone, seed, wave, score, kills, class, health, armour, ammo,
trinkets — and nothing else. `resumeRun()` restored exactly those. So a reload in zone three lost:

| Lost on resume | What it cost the player |
| --- | --- |
| `game.upgrades` | Every upgrade taken between zones, silently |
| `game.flags` | Every story choice's effect |
| `game.bookAt` | Where the book had got to |
| `game.killsByType` | The codex's kill counts |
| relic progress | How many relics were already collected |

All five are in the save now, and restored **before** `applyClass` runs, because that is the function that
reads the flags.

**And a structural fault underneath it.** The story flags were applied in `applyClass` as adjustments
(`baseSpeed *= f.speedMul`), while `recomputeStats()` was a pure derivation that overwrote them. Any later
`recomputeStats()` — a trinket restored on resume, an upgrade taken — wiped the flags back to nothing.

`recomputeStats()` now folds the flags into the derivation, so it can be called any number of times and the
numbers come out the same. That is the invariant the whole stats system needed and did not have.

## Pass eight — the ceilings that disagreed

Following the "two owners of one value" pattern into `player.js` found two hardcoded numbers where the run's
own maximum belonged.

| Finding | Where | What a player saw |
| --- | --- | --- |
| `heal(n)` capped health at a literal **100** | `player.js` | A run with 175 max health could never be healed past 100. Every health upgrade past the starting value was worth less than its card said, and the Ember trinket's "heal 2 on every kill" stopped mattering |
| `applyClass` set starting armour with **no cap**, while `addArmor` caps at 100 | `main.js` | Six PLATE upgrades started a run at 145 armour, and the next `addArmor` dropped it back to 100 |
| `resumeRun` clamped saved health to the **class's base hp** | `main.js` | Resuming a 175-health run restored at most 110 |

All three now use the run's own numbers: `Math.min(this.maxHp, …)` for health, `Math.min(100, …)` in both
armour paths, and `Math.min(player.maxHp, …)` on resume. Four assertions hold the ceilings.

The count of this defect class is now four: damage numbers, the zone counter, the stats derivation, and these
two ceilings. Every one of them was a value written in two places that disagreed about its own limit.

## Pass nine — the value with no ceiling at all

Health and armour each had a hardcoded ceiling. Ammo had **none**: `p.ammo.rockets += 2` on every rocket
pickup, for ever. By wave twenty a long run carries hundreds of rockets, and the scarcity the four weapons are
designed around stops existing.

`player.addAmmo(kind, n)` now clamps to a carry limit — 200 bullets, 60 shells, 20 rockets — and all three
pickup definitions go through it. Three assertions hold the ceiling, including one that the pickup table itself
cannot go around it.

**And the pickup test was flaky for a related reason.** It set `health = 100` and called that full health. Once
upgrades, trinkets or story flags raise `maxHp` above 100, 100 is not full, so the pickup was consumed when the
test expected it left on the floor. It uses `player.maxHp` now. Five clean runs.

## Pass ten — the drone

Two findings in `companion.js`, both the same defect class as the rest of this audit.

**The visibility guard was written twice.** `update()` set
`group.visible = this.pos.distanceTo(player.pos) > 1.1` — the guard that stops the drone filling the screen —
and the next line set `group.visible = true`. The guard never took effect. `spawn()` had the same two lines.

**The drone's kills did not count.** Its `hurt()` call passed `onKill: null` and no `hud`, `camera` or `weapon`,
so a kill the drone made did not increase `game.kills`, did not score, did not appear in the kill feed and drew
no damage number. The drone is a companion that helps; a kill it makes is a kill the run made. `main.js` now
wires `onKill`, `hud` and `camera` onto the drone before its update, and the hurt context names `DRONE`.

**A note on the test.** The first version of the drone-kill test waited for the drone to find a target it could
see, which depends on where the player happens to spawn. It failed three runs in five. It now asserts the wiring
(one real update frame, then check `onKill === enemies.onKill`) and drives the kill through the drone's own
context — deterministic, and it tests the thing that changed rather than the level's geometry.

## Pass eleven — the mobile fire button

The touch fire button fired **once per tap**:

```js
input.fire = true;
weapons.tryFire(fireCtx());
setTimeout(() => { input.fire = false; }, 120);
```

Three problems in three lines. The game loop already reads `input.fire` every frame, so a tap produced one shot
and then a flag that stayed true for 120 ms doing nothing. Holding the button did not give automatic fire, which
is what every mobile shooter does. And every tap scheduled its own timer, so tapping quickly stacked them.

It is a held button now: `pointerdown` sets the flag and fires immediately, `pointerup`, `pointercancel` and
`pointerleave` clear it. Same shape as the mouse.

The smoke test holds the button, checks the flag is true mid-hold and false after release — in an emulated phone
viewport, on the real element.

## Pass twelve — the soak bot never left wave one

The 90-second soak reported `waves 1` on every difficulty, every seed. The game was fine; the bot was standing
still. It fought until the last enemy died, then held position — and in this game the next wave starts when you
walk to the exit pad, not when the room is clear.

Two changes:

| Change | Why |
| --- | --- |
| With no enemies alive, walk to `level.exit` | Otherwise the soak never sees a wave after the first, which is most of what a soak is for |
| Close to 5 m instead of holding at 9 m | A shotgun at 9 m is a slow kill, and a slow bot is a shallow soak |

The first version of the exit walk stopped at 1.2 m. The pad triggers at 1.15 m, so the bot stood a tenth of a
metre outside the door it was trying to open — the same off-by-a-limit shape as everything else in this audit,
this time in the tool rather than the game.

**The honest limit of this tool**: it is a coarse proxy. Its job is "it did not fall over", and it now reaches
wave two on hard rather than one everywhere. It is not a balance measurement, and the numbers should not be read
as one.

## Pass thirteen — a barrel was a circle, not a volume

`damageBarrels()` projects the shot onto the ground plane and asks whether the barrel's centre is within 0.55 m
of that line. There was **no vertical test at all**, so a shot fired at the ceiling above a barrel, or over the
top of it, still hit.

The barrel is 1.1 m tall and stands on the floor, so the check now reconstructs the ray's height at the hit
distance and requires it to be within the barrel's own span. Aiming over a barrel misses it; aiming at it hits
it, which is the thing the player expects and the thing the code did not do.

Two existing barrel tests had to be corrected: both fired from `y = 0`, which was fine when height did not
matter. They now fire from the barrel's own floor height. That is the second time in this audit that a correct
fix broke a test that had encoded the wrong assumption — and both times the test was the thing that had to
change, not the fix.

## Pass fourteen — optimisation, measured before written

The plan was a texture atlas (roadmap #47): one material for every surface, five draw calls down to one. The
measurement said no.

| Measurement | Value |
| --- | --- |
| Total draw calls, gate, wave 2 | **68** |
| Level meshes | **4** — `floor_tile`, `ceil`, `wall_brick`, `decor:wall_brick` |
| Meshes per enemy body | **21–23** (imp 21, grunt 23, wisp 7) |
| Visible meshes in the scene | 218 of 281 |

An atlas would save at most two calls of sixty-eight, and it cannot tile: walls use a UV repeat of 2.4, which an
atlas cell cannot express without a `fract()` in a custom shader or subdividing every quad into tiles. Two calls
saved, a shader introduced, the brick pattern broken until the shader is right.

**The real cost is enemy bodies.** Eight enemies at 21–23 meshes is ~170 meshes, and that is roadmap #45
(instancing), not the atlas. Recorded as measured-and-rejected in `ENHANCEMENTS.md` with the numbers, so the next
person does not spend the day on it.

### What was actually optimised

| Change | Why |
| --- | --- |
| The drone's two per-frame `Vector3` allocations hoisted to module scope | 120 objects a second into the young generation for nothing |
| `Player.forward` getter removed | Dead code that allocated a `Vector3` on every access and nothing called |
| `classId` validated in `clampSettings` | Every other setting was validated; a stale or edited one carried a class name no class has into the run |

### And a settings bug found on the way

`clampSettings` validated sensitivity, fov, volume, muted, reducedMotion, quality and difficulty — and not
`classId`. `getClass()` falls back to the first class, so it never crashed, but a stored setting could hold a
value the game cannot use. It is validated against `CLASS_IDS` now, with six assertions.

## Pass fifteen — the win the measurement pointed at

The atlas was the wrong target: the level is 4 draw calls of 68, and enemy bodies are 21–23 meshes each. So the
optimisation went where the meshes are.

**One mesh per joint.** A joint's own children never move relative to each other — the joint animates as a unit —
so the boxes inside a joint can be merged without touching the animation. Materials are not merged, so the
emissive eyes stay their own mesh.

| Measurement | Before | After |
| --- | --- | --- |
| Imp body | 21 meshes | **13** |
| Grunt body | 23 meshes | **16** |
| Draw calls, gate, wave 2, 1280×720 | **68** | **43** |

A 37 % cut in draw calls, and the bodies render identically — checked in a screenshot before shipping, because a
merge that silently loses a transform looks like a body that is missing an arm, not like a failed test.

The smoke budgets were tightened to match: eight enemies under **160** calls (was 240) and a merged body at most
**18** meshes. A ceiling that is never lowered is not a budget.

## Pass sixteen — the last eleven modules, and a surface no test could see

The audit tail was `world.js`, `lore.js`, `items.js`, `props.js`, `minimap.js`, `models.js`, `textures.js`,
`level.js`, `levelmesh.js`, `cinematic.js`, `effects.js`. Read line by line, nine findings, six modules.

| Finding | Module | Severity | Fix |
| --- | --- | --- | --- |
| The stair ramp interpolated over the far half of its cell | `level.js` | high | `t + 0.5`: a cell spans half a cell either side of its centre |
| z-band treads and risers were built in descending order | `levelmesh.js` | high | Winding derived from the two heights |
| Stair heights were computed from `stairLow/High`, ignoring `flip` | `levelmesh.js` | high | Every height sampled from `floorHeightAt` |
| A full-height wall at the top of every band | `levelmesh.js` | high | Neighbour spans read the floor at the shared edge |
| The dais ignored a 0.5 m ledge in the room | `level.js` | medium | The room is levelled to its own floor first |
| The flow field routed enemies through crates | `level.js` | high | A crate is skipped until it is in `level.broken` |
| Terminals drawn with replacement, by title and by room | `lore.js` | medium | Drawn without replacement, `read` keyed by title |
| Secret candidates held `x` fixed on the north and south walls | `level.js` | medium | Each wall walked along its own axis |
| `damageNumber` defined twice; the toggle in the dead copy | `hud.js` | medium | One definition, guard on the live one |
| `loadProgress` did not validate `best` | `world.js` | low | Repaired on load |
| The minimap's secret-wall branch was dead code | `minimap.js` | low | One `continue`, with the reason |

### The numbers

Measured before and after, over the nine zone seeds:

| Measurement | Before | After |
| --- | --- | --- |
| Stair cells on the nine zones | 282 | 282 |
| Bands whose ramp missed the platform at the shared edge | 223 | **0** |
| Worst height change between two samples 0.1 m apart | **1.19 m** | **0.07 m** |
| z-band treads facing the void, geom1 | 13 of 20 | **0** |
| Bands rendered against `flip`, nine zones | 55 | **0** |
| Crate cells the flow field routed through | 14 of 14 | **0** |
| Levels with two terminals of one title | ~52 % | **0** |

### Why the shell test could not see it

`test-geometry.mjs` checks that a point just off each triangle, along its normal, is in open space. A tread
facing down at the floor of an open cell passes that: the space under the tread is the same open cell. The
suite now reads every stair cell directly — three upward treads, risers present, and a ramp that climbs the
whole cell — and the winding assertion fails on the old code with exactly the z-band counts (13 of 20,
22 of 36, 10 of 31), which is the proof that it was the z branch and nothing else.

### Two tests that could not fail, and one that measured the harness

| Test | Why it could not fail | Now |
| --- | --- | --- |
| "turning damage numbers off stops them" | Counted `document.body.children`; the numbers live in `#dmgnums` | Reads the pool cursor |
| "the cursor advances through the pool" | `dmgCursor > 0` against a cursor earlier tests also advance — it failed the one run where it wrapped to 0 | Compares the delta |
| "the hit flash decays to nothing" | Waited a fixed 24 frames, which is a claim about `dt` | Waits for the decay, bounded |

### Checked and left alone

| Finding | Verdict |
| --- | --- |
| `props.js` animals are six meshes each with three materials per animal | Real, and it is a draw-call cost, not a bug: a grove pays ~6 calls per animal. Belongs with #45's work, measured there |
| `props.pick()` draws with replacement | Two trees can share a cell. Cosmetic, and fixing it would thin the grove |
| `cinematic.js` slash/arc geometry | The `-PI/2` at construction is overwritten by `slash()`; the arc is meant to face the swing |
| `models.js` `getModel()` returns a clone with shared materials | Not a defect: `buildBody` clones every material before use |
| `textures.js`, `items.js`, `effects.js` | Read; nothing found. Pools are bounded, decal orientation is explicit, every key in `FLOOR_KEY`/`WALL_KEY` resolves |

## Pass seventeen — the draw-call budget measured a frame with no enemy in it

`smoke.mjs` has two draw-call budgets. Both spawned their enemies at `player.pos + (4, 4)`, which is behind
the camera on most spawns, and both were measured through whatever pitch the run started with — often 47°
upward, which puts the floor itself out of frustum.

| Frame, camera level, gate | Calls | Triangles |
| --- | --- | --- |
| No enemies | 47 | 3 886 |
| 2 imps in front | 76 | 5 060 |
| 4 imps | 104 | 6 232 |
| 8 imps | 154 | 8 504 |
| 16 imps | 266 | 13 192 |

**About 14 draw calls per imp in view** — 13 merged joints plus its ground shadow. The old budget measured 21
calls with eight imps "spawned", i.e. a frame containing no body at all, and passed.

Two wrong readings on the way to this table, both recorded because both cost a run:

1. First reading: the spawn is behind the camera. Plausible, but I then "disproved" it by spawning along
   `camera.getWorldDirection()` and seeing no change — because the camera was pitched 47° up, so the bodies
   were below the frame.
2. Second reading: the bodies never reach the draw pass. Also wrong, and caused by reading `e.body.group` in
   my own probe when `e.body` *is* the group: the count came back 0 meshes for a body that has 13.

The lesson is the same one pass fourteen recorded about the atlas: the number is only worth what the setup
around it is worth. The harness now levels the camera, spawns along the forward vector, and the ceiling is
re-baselined to 200 for eight bodies against a measured 154.

Chasing a number for #45 turned up a measurement fault rather than a code fault. `smoke.mjs` has two draw-call
budgets, and both spawn their enemies at a fixed corner of the world. The two frames print their own numbers:

| Frame | Calls | Triangles |
| --- | --- | --- |
| The level alone | 20 | 3 382 |
| Eight imps spawned by the budget check | 21 | 3 384 |

Eight imp bodies at 13 meshes each cannot fit in **one draw call and two triangles**, so those enemies were not
drawn. The first reading of this was frustum placement — the spawn was `player.pos + (4, 4)`, behind the camera
on most spawns. **That reading was wrong, and the measurement says so:** re-spawning the same eight imps along
`camera.getWorldDirection()` at 4–6 m, in the same harness, still gives **21 calls and 3 384 triangles**. The
bodies are built (13 meshes each, asserted elsewhere), the enemies are in `enemies.list`, and they still do not
reach the draw pass in this harness.

So the fault is somewhere between "body constructed" and "renderer draws it", under SwiftShader with no input
focused — not in where the test puts them. **Not diagnosed, not fixed.** What is certain:

- every draw-call number taken from this harness — including the "eight enemies under 160 calls" ceiling, and
  by extension the 43-call figure the last two optimisation passes were judged against — was taken from a frame
  with no enemy body in it;
- #45 (instancing) cannot be measured, let alone justified, until that is resolved.

**Next step, in order:** assert inside `smoke.mjs` that a spawned enemy body's mesh is drawn — e.g. that
`renderer.info.render.calls` rises by at least one per visible body — then fix the cause, then re-baseline both
ceilings in the same commit. A budget that cannot fail is worse than no budget, and this one has been green
through two optimisation passes.

## Pass eighteen — instanced bodies, and what the flash cost

Roadmap #45, done against the measurement from pass seventeen.

| Frame, camera level, gate | Before | After |
| --- | --- | --- |
| The level alone | 47 | 56–63 |
| Eight imps in front | 154–181 | **78–85** |
| Sixteen imps | 266 | — |

One `InstancedMesh` per (type, joint, material), capacity 16, written from each body's joint
`matrixWorld` once a frame after the joints animate. The bodies still exist and still animate; they stop being
drawn. Two details that are not optional:

- **The flash is per-instance colour, not emissive.** There is no per-instance emissive. Instance colour
  multiplies the diffuse, so a body pushed to `(3.4, 1.5, 1.35)` reads as white-hot. The per-material emissive
  path is kept because the pooled-body reset and the existing flash tests use it, and it costs nothing on an
  invisible mesh.
- **Membership is per set, not per body.** The first version guarded on `body.instanced`, so a body that had
  been instanced before a scene change never joined the new set: it rendered nothing, and the enemy was
  invisible. The guard is `body.set === set`.

An empty type sets `visible = false` and costs no draw call; `count` follows the living bodies so empty slots
draw nothing. A body past capacity 16 falls back to its own meshes, so this cannot double-draw or drop one.

**The level-only number went up**, 47 → 56–63: the instanced sets exist as soon as a type has been built, and
until every body of that type is released they are still in the pass. That is the honest shape of the trade —
the cost is now paid once per type rather than once per enemy, and the eight-body frame is 50 % cheaper.

## Pass nineteen — an enemy nobody could see, and what a screenshot is for

Roadmap #49 (better enemy silhouettes) was a visual change, so it was checked by looking. The first shot of an
imp came back with the imp missing — its spawn particles on screen, its body absent — and the obvious readings
were all wrong: the body was built (14 meshes), in the scene, `visible`, at a finite position, with a correct
instance matrix.

| Reading | Why it was wrong |
| --- | --- |
| The viewmodel is covering it | Hiding the weapon scene changed nothing |
| The camera is pitched up, as in pass seventeen | The pitch was forced to 0 for the shot |
| Pausing broke the instance sync | Not pausing, and freezing the enemies instead, changed nothing |

The cause was in the previous release. `syncEnemyInstances` set `part.inst.count = Math.max(1, liveCount)` as a
liveness filter. `count` is a draw *range*, and slots are not compacted: four imp bodies attached with one alive
at slot 3 meant the mesh drew slot 0 only, and that enemy was invisible. Every enemy whose slot index was at or
above the live count was not drawn — which is most of a wave once bodies start pooling.

Fixed by drawing the full capacity and letting dead slots hold a zero-scale matrix; `visible` alone decides
whether a type costs a draw call.

**The lesson is the one this audit keeps relearning.** Pass fourteen said "verify visually when the change is
visual" and pass fifteen shipped a merge checked by a screenshot. This time the screenshot was the only thing
that could have found it: every headless assertion passed, because every headless assertion tests the body, not
the pixels. A draw-call budget cannot see a missing enemy either — 78 calls with one imp drawn and seven not is
still under the ceiling.

## Pass twenty — shadows, and the size of the box

Roadmap #52. One directional light casts, 1024² PCF, into a 14 m box that follows the player; the level shell
and the doors receive; the instanced bodies cast.

| Frame, camera level, gate | Before | After |
| --- | --- | --- |
| The level alone | 56–63 | 57 |
| Eight imps in front | 78–85 | 94 |
| Triangles, eight imps | 8.7k | 24.7k |

The cost is the shadow pass re-rendering what it shadows: +12 draw calls, and the triangle count triples because
every caster is drawn twice. Frame time cannot be measured here — SwiftShader runs at 150–200 ms whatever the
scene — so draw calls and triangles are the numbers, and they are the ones the budget already watches.

**What was deliberately not done.** The level does not cast into itself. That needs a map covering the arena,
and at 40×40 cells a 1024² map is a hand's width per texel: every wall shadow becomes a smear, which is worse
than the flat ambient it replaces. So the shadows are object shadows — enemies, props, barrels onto the floor —
and the "rooms read as boxes" half of the item is still open. Doing it properly is a cascaded map or a baked
lightmap per sector; #53 already writes a per-cell light value into vertex colours, and that is the cheaper
path from here.

Verified by eye, twice: a grunt at 4 m with the map on and off, same camera. The shadow under it is there and
legible; it is subtle, because ambient 0.85 plus hemisphere 1.25 still carries most of the light. Dropping the
ambient to make shadows read is a different change with a different risk, and it was not taken here.

## Pass twenty-one — scoping #37 instead of starting it

The roadmap's last structural item. Nothing was built; what follows is the measurement of what it touches, so the
next person does not start from a blank page.

| Subsystem | Change | Where it lands |
| --- | --- | --- |
| Cell data | one floor/ceiling scalar pair → a list of sectors, each with a floor polygon, a ceiling polygon and a portal edge | `level.js` |
| `floorHeightAt` | needs the height you came from; **31 call sites in 7 modules** | enemies 10, main 8, props 6, player 4, lore 2, level 1 |
| `levelmesh` | one floor quad per cell → one per sector; 8 `c.floor` and 9 `c.ceil` reads | `levelmesh.js` |
| Flow field | BFS is 2-D; two levels per cell needs a level index or enemies path to a catwalk they cannot reach | `enemies.js`, `level.js` |
| Reachability | `reachCount >= 220`, the playability flood fill and the invariants tool are all 2-D | `level.js`, `tests/` |

That is an XL change by the project's own definition, and it is not a change to start at the end of a session in
which the pod reset six times: a half-migrated `floorHeightAt` is 31 call sites reading the wrong floor, which
looks like enemies falling through catwalks and pickups floating.

**The smallest honest first slice** is a catwalk: a raised floor over part of a room, walkable from below, joined
by a stair. It needs the height-aware query and nothing else structural — and it is still a breaking API change
to 31 call sites, so it is a release of its own.

## Pass twenty-two — the catwalk existed; my measurement was looking at another zone

The browser reported zero catwalk decks for `?seed=ashfall-187` while the same seed built headlessly with the
ashfall shape returned ten. Neither the generator nor the sectors were at fault:

| Call | Shape used | Decks |
| --- | --- | --- |
| `generateLevel('ashfall-187', ashfall.shape)` | ashfall | 10 |
| `generateLevel('ashfall-187', gate.shape)` | gate | 0 |
| the game at `?seed=ashfall-187` | **gate** | 0 |

`applyUrlOverrides` reads `?zone=` into the title screen's selection but the run still starts in whatever zone
`beginZone` is given, and `?seed=` only replaces the seed. So the URL built the gate's floor plan with an
ashfall seed — a legitimate combination that has no catwalk, because the gate's rooms are 4–7 cells and none is
tall enough for a deck.

Forcing the zone in the page — `HG.beginZone(HG.zones.find(z => z.id === 'ashfall'))` — reports **10 deck cells
at 2.4 m**, which matches the headless count. The catwalk is real and it is in the game.

**Still not seen.** Two framing attempts failed: the first caught the story overlay (the overlay DOM survives a
forced `state = 'playing'`; it needs `hideScreens()`), the second landed in a corridor 7 m from the deck with a
wall in between. The deck has been confirmed to exist by number, never by eye.

**The trap for the next person:** a zone's look and floor plan come from `zone.shape`, and a seed is only half
of a level. Any harness that overrides one must override the other, or it measures a different arena.
