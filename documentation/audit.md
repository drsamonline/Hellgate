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
