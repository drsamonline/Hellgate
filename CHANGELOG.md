# Changelog

## 1.83.0 — 2026-11-21

**Ammo had no ceiling at all**

Health and armour each had a hardcoded ceiling. Ammo had none: `p.ammo.rockets += 2` on every rocket pickup,
for ever. By wave twenty a long run carries hundreds of rockets, and the scarcity the four weapons are designed
around stops existing.

| Kind | Carry limit |
| --- | --- |
| Bullets | 200 |
| Shells | 60 |
| Rockets | 20 |

`player.addAmmo(kind, n)` clamps to those, and all three pickup definitions go through it — with a test that
the pickup table itself cannot go around the ceiling.

**And a flaky test, fixed at the cause.** The pickup test set `health = 100` and called that full health. Once
upgrades, trinkets or story flags raise `maxHp` above 100, 100 is not full, so the pickup was consumed when the
test expected it left on the floor. It uses `player.maxHp` now.


## 1.82.0 — 2026-11-21

**The ceilings that disagreed with the run**

Three hardcoded limits where the run's own numbers belonged:

| Finding | Where | What a player saw |
| --- | --- | --- |
| `heal(n)` capped health at a literal **100** | `player.js` | A run with 175 max health could never be healed past 100. Every health upgrade past the starting value was worth less than its card said, and the Ember trinket's "heal 2 on every kill" stopped mattering |
| Starting armour had **no cap**, while `addArmor` caps at 100 | `main.js` | Six PLATE upgrades started a run at 145 armour, and the next `addArmor` dropped it back to 100 |
| Resume clamped saved health to the **class's base hp** | `main.js` | Resuming a 175-health run restored at most 110 |

All three use the run's own numbers now: `Math.min(this.maxHp, …)` for health, `Math.min(100, …)` in both
armour paths, `Math.min(player.maxHp, …)` on resume. Four assertions hold the ceilings.


## 1.81.0 — 2026-11-21

**A resumed run was not the same run**

`saveRun()` wrote the numbers a HUD shows and nothing else. A reload in zone three lost:

| Lost on resume | What it cost the player |
| --- | --- |
| `game.upgrades` | Every upgrade taken between zones, silently |
| `game.flags` | Every story choice's effect |
| `game.bookAt` | Where the book had got to |
| `game.killsByType` | The codex's kill counts |
| Relic progress | How many relics were already collected |

All five are saved and restored now, before `applyClass` runs, because that is the function that reads the flags.

**A structural fault underneath it.** The story flags were applied in `applyClass` as *adjustments*
(`baseSpeed *= f.speedMul`), while `recomputeStats()` was a pure *derivation* that overwrote them. Any later
`recomputeStats()` — a trinket restored on resume, an upgrade taken — wiped the flags back to nothing.

`recomputeStats()` now folds the flags into the derivation, so it can be called any number of times and the
numbers come out the same. That is the invariant the stats system needed and did not have.

Twelve new assertions: the save carries upgrades, flags, book position, codex counts and trinkets, resuming
restores all of them, and the flags reach the stats on resume.


## 1.80.0 — 2026-11-21

**No content table may be inert**

The haste/careful bug generalised into a test. Every entry in every content table must move something a player
can feel, and the suite now walks each one:

| Table | Entries | What is asserted |
| --- | --- | --- |
| Trinkets | 6 | Each changes the stat it names — damage, hp, energy, speed, armour, leech |
| Upgrades | 6 | Each changes something after `recomputeStats()` |
| Modes | 7 + campaign | Each differs from campaign in a key that is not `name` or `blurb` |
| Zones | 9 | Distinct seeds, at least three floor-plan shapes, at least three threat levels |
| Classes | 3 | Distinct signatures across hp, armour, speed, damage, energy, weapon, powers |
| Powers | 5 | Each changes something observable and goes on cooldown |

Twenty-five new assertions, and all of them pass — which is the useful result: the tables were already honest,
and the one table that was not, the story flags, was found by reading rather than by sweeping.

Writing the test found two of my own mistakes before it found any of the game's: `sumEffects` takes trinket
**ids**, not trinket objects, and two modes (`nightmare`, `hardcore`) change rules under keys my first check
did not look at. Both were the test being wrong about the contract, which is worth knowing: a new test that
fails on its first run is usually describing the code it assumed rather than the code that exists.


## 1.79.0 — 2026-11-21

**Two powers drew no numbers, and the smoke test was blaming the game for the pod**

Reading `powers.js` against `weapons.js` found two powers passing a thinner context than every other damage
source:

| Power | Missing | What a player saw |
| --- | --- | --- |
| `shockwave` | `hud`, `camera` | No damage numbers, for a power that hits everything within 6 m |
| `volley` | `hud`, `camera`, `weapon` | No numbers, and the kill feed said `DOWN` instead of `VOLLEY` |

Both pass the same context as the shotgun now.

**A test that would have caught it**: the suite casts all five powers across all three classes and asserts
each one changes something observable and goes on cooldown. Nine new assertions, and the first test in the
suite that would notice a power being silently inert.

**The smoke test kept the desktop page open while opening a mobile one**, so two live WebGL contexts ran under
the software rasteriser and the renderer was killed. The failure read as `Target closed` at the touch step and
looked like a game bug for three runs. The desktop page closes first now.


## 1.78.0 — 2026-11-21

**The story flags: one bug, and one claim that was never true**

Reading `applyClass` against the 1.70.0 release notes found both.

| Finding | What happened |
| --- | --- |
| A choice paid twice | `takeChoice()` granted `effectsFor(game.flags)` — the sum of every flag the run had set — on top of what the zone start had already given. A second mercy choice paid for both mercies again |
| Speed and armour never changed | The 1.70.0 notes promised "haste gives speed, careful gives armour at zone start". The patch was written against a line that did not exist, matched nothing, and shipped silently. Only score and pickups were ever wired |

**Correction to 1.70.0:** of the four flags, only `greed` (score and pickups) and `mercy` (max health, via the
choice) did anything. `haste` and `careful` were inert for eight releases.

Both are fixed: the flags are applied in `applyClass`, which is the one place a run's stats are set, and a
choice applies only the delta it created. Four tests hold it — one per flag, and one that a choice is paid once.


## 1.77.0 — 2026-11-21

**Two damage numbers on every hit, and a fourth gate**

Reading `weapons.js` against `enemies.js` found what a script cannot: **every hit drew two damage numbers**.
`Enemy.hurt()` draws the number, because it is the one place every damage source passes through — and
`weapons.js` drew it again after calling `hurt()`, in both the hitscan path and the blade. A shotgun blast
showed two numbers per pellet; a blade swing showed two for one hit.

The two calls are gone, and a test counts the pool cursor: one hit, one number.

**`tools/audit-invariants.mjs`** runs 900 simulated frames per zone with input that aims at the nearest
enemy and fires, swings the blade and throws grenades, then asserts what must always be true:

| Invariant | Check |
| --- | --- |
| Positions finite | Player and every living enemy |
| Health and armour in range | `0 <= health <= maxHp`, `armour >= 0` |
| Ammo non-negative | Every weapon |
| Player inside the grid | Within the level's own bounds |
| No enemy under the floor | Against the cell's floor height |
| Pools bounded | Particles ≤ 700, decals ≤ 60, projectiles ≤ 120 |
| No orphan enemy mesh | Scene traverse against the enemy list |

Four zones, 900 frames each, all held.


## 1.76.0 — 2026-11-21

**A full audit of all 37 modules, and five real bugs**

Three scripted sweeps plus a browser walk of the entire UI journey
(`tools/audit-flow.mjs`, new). The record is in `documentation/audit.md`.

| Finding | Severity | Fix |
| --- | --- | --- |
| `M` opened the map **and** toggled mute — the mute handler was never removed when the map took the key | high | Mute is `N` |
| The map's Back button had **no listener at all** — a player on the map could only leave by picking a zone, which restarts the run | high | `#mapBack` returns to where the map was opened from |
| `JSON.parse` on a glb chunk threw from three frames inside a loader | medium | A readable error |
| `clone()` in the book engine threw on values JSON cannot represent | medium | `structuredClone`, then JSON, then the original |
| The kill feed built `innerHTML` from two unescaped strings | medium | Escaped |

**Checked and deliberately left alone** — six functions over 90 lines (each one job with a long body), six
`== null` (which catch `undefined` too, unlike `=== null`), a `parseInt` that has a radix, three boot-time
canvas allocations, six screen states that are shown rather than branched on, and two `index - 1` loop
bounds. Each with its reason in the audit file.

**The flow audit is the new gate**: title → intro → class → play → journal, inventory, codex, map → the map
key → pause and resume → copy report → cleared, choice, upgrade, map → death. Thirteen steps, and it found
the two high-severity bugs on its first run.


## 1.75.0 — 2026-11-21

**A daily: one run a day, the same seed for everyone**

The seed is the date, hashed with FNV-1a: no server, no account, and two people playing on the same day
get the same level, the same waves and the same spawns. The best score for the day is kept beside it.

| Detail | Why |
| --- | --- |
| `dayKey()` is the **local** date, not UTC | A player's day is their own |
| The hash is in the seed | Two consecutive days are not adjacent seeds |
| The daily overrides the seed box | A daily you can reseed is not a daily |
| A corrupt record is replaced | Same rule as every other store in the game |

The title screen shows the day's seed and best; the DAILY mode button starts it.

**Two miscounted zones, found while wiring it.** A patch meant for `zoneCleared()` had also landed in
`pauseGame()` and `gameOver()`, so pausing and dying each counted as clearing a zone. The record now counts
a zone only when the zone is cleared, and two tests hold that.

**Tests** — 11 new assertions: the seed is stable per day and different across days, the day key is local,
the record repairs itself, a worse score does not replace the best, pausing and dying do not count as
clearing a zone.


## 1.74.0 — 2026-11-21

**Fifteen things worth keeping**

Every number in this game belonged to one run and died with it. `play/src/achievements.js` keeps the small
set worth keeping: a table of predicates over the player's history, checked at the moments that can change
them, stored beside the zone progress.

| Kind | Examples |
| --- | --- |
| Cumulative | 50 kills, 500 kills, 25 elites, every enemy type at least once |
| Campaign | clear the first zone, clear five, clear all nine in one run |
| In a run | reach wave 10, reach wave 20, score 10,000, collect every relic in a zone, finish without dying |

A predicate reads `(run, history)`, and the split is the design: "kill 500 enemies" is a lifetime number,
"clear a zone without dying" is a run. An unlocked achievement stays unlocked even if the predicate would
now be false.

They appear in the **codex** as `DONE` and `GOAL` entries, so they are searchable like everything else, and
an unlock says so once with a toast.

**A corrupt history is repaired, not trusted** — every field is type-checked on load, because this file is
written mid-run and an interrupted write is the likeliest corruption in the game.

**A shadowed global** — the history variable was first called `history`, which shadows `window.history` and
broke `history.replaceState` in `startGame`. The seed stopped reaching the URL. The suite caught it; the
variable is `record` now.

**Tests** — 8 new assertions, including the corrupt-history repair.


## 1.73.0 — 2026-11-21

**The codex: what the run has taught you, searchable on C**

Twenty-three entries, generated from the live tables so the codex can never disagree with the game:

| Kind | What it shows |
| --- | --- |
| Enemy (8) | Real health, damage, telegraph time, how it behaves, and your kill count against it |
| Trinket (6) | What it actually does, and that it is found on a kill |
| Zone (9) | The blurb, the threat scalar and the ambient bed |

The search is `play/src/search.js`, ported from **`search-kit`** (same licence): a tf-idf inverted index
with prefix matching and a Levenshtein fallback, so "kiln fire" ranks the kiln first and a typed "kilm"
still finds it.

`game.killsByType` is now counted on every kill, which is what turns the enemy entries from a stat sheet
into a record of the run.

**Tests** — 11 new assertions: the entry count matches the tables, a kill count shows, a zone name finds
the zone, a typo still finds it, an effect word finds entries, nonsense finds nothing, C opens the codex,
it renders, the search box filters it, and it closes back to the run.


## 1.72.0 — 2026-11-21

**The textures are pixel art now, not photographic mush**

Every surface was drawn with gradients, noise and grain, which reads as fuzz at close range. `pixel.js`
(ported from `art-kit`, same licence) quantises each finished texture to twelve colours by **median cut**
and then applies a **4x4 Bayer dither** before it becomes a texture.

| Step | What it does |
| --- | --- |
| Median cut | Splits the box with the widest channel range until twelve colours remain, then averages each box |
| Bayer dither | Adds a 4x4 ordered threshold before the nearest-colour lookup, so a gradient becomes two flat tones in a pattern |

The result keeps the brick's variation and loses the fuzz: the surfaces read as deliberately pixel art, and
the dither pattern is what makes a 64-pixel texture hold up when it is repeated across a wall.

**Tests** — 3 new assertions: median cut finds four colours in a grey ramp and orders them, a dithered image
uses only its palette, and the Bayer matrix is 4x4.


## 1.71.0 — 2026-11-21

**Every zone has a sound now**

Ported from `audio-kit` (same licence, same author): a bed is filtered noise with a slow LFO on the cutoff
and sparse events on top. It loops for as long as the zone lasts, so the kiln hisses, the cistern runs, and
the throne has an ocean under it.

| Zone | Bed |
| --- | --- |
| The Gate, Ashfall, The Spine | wind |
| The Foundry, The Kiln | fire |
| The Grove | rain |
| The Vault | hum |
| The Cistern | stream |
| The Throne | ocean |

**A limiter on the master bus.** Twelve explosions at once stack to a clip, and a clipped master is the one
thing a player hears as broken. A `DynamicsCompressor` at -6 dB, ratio 18, 3 ms attack sits between the
master gain and the destination.

**Tests** — 8 new assertions, against a fake AudioContext because Node has none: every zone names a bed,
six distinct beds are in use, the bed starts and stops, a bed that declares an LFO gets one, and the noise
buffer is cached per length rather than remade.


## 1.70.0 — 2026-11-21

**The story is a decision now, not a panel you cannot argue with**

Ported from `app-story-engine` (same licence, same author): a branching narrative engine where the book is
data, a choice moves you to another passage, and the effects of that choice are declarative
`{op, var, value}` triples rather than code. The validation is the original's — a book with a choice
pointing at a missing node is **refused**, not read.

| File | What it is |
| --- | --- |
| `play/src/book.js` | The engine, ported: `compile`, `newGame`, `choicesFor`, `advance`, `trail`, `save`, `load` |
| `play/src/zonebook.js` | The campaign as eleven passages: one per zone, two choices each, two endings |

**The choices change the run.** Each choice writes a flag, and the flags are read by the game:

| Flag | Effect |
| --- | --- |
| `mercy` | +12 max health per kind choice |
| `greed` | +20 % score and two more pickups per greedy choice |
| `haste` | +5 % speed per hurried choice |
| `careful` | +8 armour at the start of each zone per cautious choice |

Clearing a zone now asks the question **before** it offers the upgrade. Two runs with the same seed and
different answers are different runs.

**Tests** — 11 new assertions: the book compiles with no warnings, it starts at the gate, the greedy path
records four zones, the flags produce an effect, the same choices replay to the same flags, a broken book
is refused, and taking a choice in the game writes a flag and moves the book on.


## 1.69.1 — 2026-11-21

**The damage test, for the third and last time**

Each version of it placed the enemy somewhere and waited: a wave spawn, then a fireball from a random duel
spot, then a hound walking across a room. All three were tests of the level's geometry, not of damage.

It now finds an open cell 1.2-2.2 m from the player, stands the player there, and puts a hound inside its
own melee range. Twelve clean runs.


## 1.69.0 — 2026-11-21

**Elites: the same enemy, harder, and you can see it coming**

From wave 4, one spawn in eight is an elite. It is not a ninth type to model and animate — it is the same
body with a harder one:

| Change | Value |
| --- | --- |
| Health | x2.2 |
| Damage | x1.35 |
| Scale | x1.16 |
| Rim light | A gold translucent shell, so it reads as one across the room |
| Score | x3 |
| Drop | Always leaves a trinket |

The kill feed says `ELITE GRUNT`, so the thing that took four shotgun blasts is named.

Never on a boss wave: the warden does not need a rim light to be understood.

**Tests** — 5 new assertions: an elite is marked, it carries a harder body, it hits harder, it wears the
rim, and a late wave produces them (measured 51 over 40 waves at a 12.5 % roll).


## 1.68.1 — 2026-11-21

**A damage test that depended on the level**

`enemies dealt damage` spawned a wave and waited for an imp's fireball to land from a random duel spot.
Whether it landed depended on line of sight, so it failed roughly one run in eight. It spawns a hound
instead: melee, adjacent, deterministic. Ten clean runs.


## 1.68.0 — 2026-11-21

**An eighth enemy: the Stalker**

Every ranged enemy so far announced itself with a glow. The Stalker announces itself with a **line**: during
its 0.95 s wind-up it draws a violet beam from its muzzle to your head, and then fires a hitscan that does
22 damage.

| Property | Value |
| --- | --- |
| Health | 30 — the softest ranged enemy |
| Damage | 22, hitscan, wall-checked |
| Telegraph | 0.95 s, drawn as a beam |
| Behaviour | Backs off below 13 m, so it is a duel and not a rush |
| Body | The humanoid rig, thin, hooded, one bright optic |
| Appears | Wave 6 and later |

The telegraph is the point: the beam tells you where the shot comes from and gives you a second to break
the line. It reuses the tracer pool, so it costs no draw call.

**Tests** — 6 new assertions: it spawns, it has a beam colour, it keeps its distance, it hits harder than
an imp, its body is 23 parts, and it is a rig that walks.


## 1.67.0 — 2026-11-21

**A ninth zone: The Spine**

The service corridor under everything. Narrow rooms (8-12 of 3-5 cells), a cold steel-blue palette, grated
floors, dust that drifts, and a threat of 1.16 — between the kiln and the throne.

| Property | Value |
| --- | --- |
| Rooms | 8-12, of 3-5 cells |
| Walls and floor | tech panels over a grate |
| Palette | `[0.84, 1.0, 1.18]` — the only cool-bright zone |
| Threat | 1.16 |
| Story | Three panels, and an epilogue that hands you to the kiln |

**A seventh mode: Gauntlet**

Every zone, one wave each, back to back, no save and no second chance. It uses the existing `waves: 1` and
`noSave` flags, so it is a data row, not a code path.

**Two tests that assumed a fixed count** — "eight zones have stories" and "six modes are defined" now
derive their numbers from the zone and mode lists, so adding content cannot silently pass.

**A flaky damage test** — it spawned a wave and waited for an enemy to walk over. Enemies now spawn at
least 12 m away, so the walk took longer than the test's window. It places one enemy deliberately instead;
a test that waits for the pathfinder is a test of the pathfinder.


## 1.66.0 — 2026-11-21

**The wave started you sealed inside the exit room**

The exit pad is in the exit room. Clearing a wave opens the doors; you walk in; you step on the pad; the
next wave starts — and `startWave` closed every door behind you. The player was then inside a sealed room
with the enemies outside it, no way to reach them and no way to leave. That is the screenshot: wave 3,
seven left, both doors shut, red lamps.

A wave now returns you to the spawn if you are standing in the exit room or within 3.5 m of the pad when
it starts, and says so in the report events.

**The rule you asked for: nothing spawns in the room you start in**

| Rule | Before | After |
| --- | --- | --- |
| Enemies in the start room | allowed | **none, ever** |
| Enemies within 12 m of you | allowed | **none** |
| Enemies within 12 m of the spawn point | allowed | **none** |

Six waves are checked in the test suite, counting enemies in the spawn room and near the spawn point.

**Also asserted** — the exit room is never the spawn room, and the spawn room index is exposed on the
level so a caller does not have to guess it.


## 1.65.0 — 2026-11-21

**Rooms have architecture now**

Every room was four flat walls and a ceiling. A room of five cells or more now gets pilasters on the walls
where there is actually a wall behind them, and a beam across the ceiling if it is taller than 3.4 m.

They are emitted into the level's own per-texture buckets, so a room gains detail and the frame gains **no
draw call** — the same vertex buffers, the same five materials.

| Detail | Placement |
| --- | --- |
| Pilaster | Inset one cell from each corner, only where the cell behind is solid — never in a doorway |
| Ceiling beam | Tall rooms only, spanning the room's own footprint at `ceil - 0.3` |

**The geometry test caught its own weakness** — "every triangle faces open space" is the invariant that
catches a wall with the wrong winding. Decor legitimately faces the wall it is mounted on, so the decor
goes into its own bucket (`decor:<texture>`) and the test skips it: the shell is still checked at 100 %,
and the decor is measured separately. Zero shell triangles face a wall across all five test seeds.


## 1.64.0 — 2026-11-21

**Open 3-D models are an option now**

The game builds every enemy from joints in code and ships no assets — that is why it loads instantly and
looks the same on every machine. It is a constraint, not a rule, so `play/src/glb.js` reads **glTF 2.0
binary** (`.glb`, the open standard) in 200 lines with no library and no build step.

Drop `assets/models/imp.glb` in, add it to `assets/models/index.json`, and that type uses the model
instead of its procedural body. No manifest, no file, or a file the reader cannot handle: nothing changes
and nothing breaks.

| Supported | Not supported |
| --- | --- |
| The `.glb` container (JSON + BIN chunks) | `.gltf` with external buffers |
| `POSITION`, `NORMAL`, `TEXCOORD_0` | Skinning, bones, animation |
| Indices in u8 / u16 / u32 | Morph targets |
| Node transforms, baked into the geometry | Textures — a material's base colour only |

A model is scaled uniformly to its type's height, because a downloaded model is in whatever units its
author used and an enemy the size of a bus is a bug you cannot unsee. A model has no joints, so the walk
cycle and pose blend skip it; the animation guards were tightened where an imp's arms were assumed.

**Why a manifest and not seven fetches** — the first version requested `<type>.glb` for all seven types at
boot, which is seven 404s in the console for a feature nobody is using. The smoke test caught it.

**Tests** — 7 new: a hand-built glb parses to one mesh with its three vertices and its material colour,
a model is offered for its type, the pool for that type is dropped so a parked procedural body cannot be
handed out, and the model can be removed again.


## 1.63.1 — 2026-11-21

**A budget set from one measurement**

The level-alone draw-call budget was 60, measured on one seed. CI ran a different seed with more props and
hit 66. The budget is a ceiling that catches a regression, not the number of the day: it is 80 for the
level and 240 for the level plus eight rig bodies, with the measured range (55-66) written beside it.


## 1.63.0 — 2026-11-21

**A charger draws its lane on the floor**

The brute and the warden wind up before they commit. The only warning was a scale pulse and a glow, which
says "something is coming" and not "it is coming *here*". During the telegraph a charger now lays sparks
along the floor from itself to its target — five points, every 70 ms, fading in a third of a second.

It reuses the particle pool, so the warning costs no draw call. Standing in the lane is now a decision.

**A pickup test that teleported onto the exit pad**

The flake that survived three fixes: the test placed its pickup at `openCells[0]`, and when that cell was
the exit pad, the teleport completed the wave, the wave change cleared every pickup, and both assertions
failed. It now picks a cell more than 10 m from the exit and clears `exitOpen` first. Ten clean runs.


## 1.62.1 — 2026-11-21

**A pickup test that walked away from its own pickup**

It passed locally and failed in CI. The cause is the fixed-step loop: a slow CI frame lets the accumulator
catch up, so three frames can simulate a quarter of a second and the player walks out of the 1.1 m pickup
radius between the assertion that places it and the one that expects it eaten.

It now zeroes the velocity, releases every key, re-places the player on the cell and runs a single frame.


## 1.62.0 — 2026-11-21

**Damage numbers**

The hit marker said *something* landed. It did not say what. `hud.damageNumber()` projects the point that
was hit to the screen and floats the number up over the body, which is the clearest feedback a shooter has
and the thing that tells you whether the shotgun was worth the walk.

| Detail | Why |
| --- | --- |
| A pool of ten DOM elements | A node per hit is a garbage problem at ten shots a second |
| CSS animation | The float is a keyframe, not a per-frame transform write |
| A killing blow shows `✕` in red and a size larger | The kill and the hit read differently at a glance |
| Off-screen or behind the camera is dropped | A number at the edge of the screen is noise |

No draw call: it is DOM, like the compass and the waypoint.

**A test double that was lying** — `className = 'a b'` did not update `classList`, because the stub backed
`classList` with a `Set` that `className` never wrote to. It is a real property now, so a class set one way
and read the other agrees.

**Tests** — 5 assertions: the pool is ten and made once, a hit puts its damage on screen, it animates, a
killing blow reads differently, and the cursor advances through the pool.


## 1.61.0 — 2026-11-21

**Every zone breathes**

Eight zones had eight palettes, eight textures and eight floor plans, and all eight were perfectly still
between waves. `effects.ambient()` spawns motes into the same particle pool the sparks use, so a zone's
atmosphere costs no draw call and no allocation.

| Zone | Motes |
| --- | --- |
| The Gate | dust drifting |
| The Foundry | embers rising |
| The Grove | spores floating |
| The Vault | cold dust, barely moving |
| Ashfall | ash falling |
| The Cistern | water dripping from the ceiling |
| The Kiln | embers rising fast |
| The Throne | blood motes |

The difference between embers and drips is the sign of gravity and the rate: the kiln spawns nine a second
that rise, the cistern three a second that fall at 4.5 m/s². All eight colours are distinct, and a test
asserts it.

**Tests** — 4 new assertions: every zone has motes, no two share a colour, the kiln's rise while the
cistern's fall, and the emitter actually puts particles in the pool.


## 1.60.1 — 2026-11-21

**The draw-call budget was measuring the wrong thing**

It took a snapshot of `renderStats` whenever the frame happened to land, so it measured the enemy count
as much as the level, and flapped between 86 and 150 calls against a fixed 140. It failed in CI on a wave
that happened to be busier than the one measured locally.

It now measures two controlled states:

| State | Budget |
| --- | --- |
| The level alone, enemies cleared | under 60 calls |
| The level plus eight rig bodies | under 200 calls |

The second bounds the per-enemy cost at about 17 calls. It also restores an enemy afterwards, because
clearing them completes the wave and left every later check on the cleared screen.


## 1.60.0 — 2026-11-21

**Copy report, on the pause screen**

Every bug report so far has been a sentence and a screenshot, and every one has cost a round trip to find
out which build, which seed, which wave — and several turned out to be a cached page. The pause screen now
has **Copy report**, which assembles one block and puts it on the clipboard:

| Line | What it answers |
| --- | --- |
| `build` | Which version is actually running |
| `url`, `seed` | Exactly which level, reproducible |
| `zone`, `wave`, `mode`, `class` | Where in the run |
| `state`, `exitOpen`, `doors` | Whether a door is meant to be locked |
| `player` | Health and position — "stuck in a room" is a position |
| `enemies` | How many are alive, which explains a wave that will not clear |
| `level` | Grid size, rooms, doors, and **reachable cells** — the number that was wrong |
| `render` | Draw calls and triangles |
| `pool` | Bodies parked per type |
| `events` | The last 40 notable events with timestamps |

Events are recorded for: wave start, zone cleared, game over, a locked door touched, the stuck-spawn
fail-safe firing, and every trinket drop.

If the clipboard is blocked, the same block is shown in a selectable panel under the buttons.

**Tests** — 7 new assertions on the report: it names the build, the seed, the zone, the reachability, and
carries the events.


## 1.59.0 — 2026-11-21

**Enemy bodies are pooled**

A rig body is 19-24 meshes. A wave of twelve enemies built and disposed about 250 meshes, mid-fight, which
is a hitch on a phone and garbage for the collector to sweep.

`BODY_POOL` keeps bodies per type, capped at 14 each. A body is reset when it is taken back out — joint
rotations to their rest values, materials to their base colour, scale and visibility — so nothing carries
over from the enemy that died in it. The cloned flash materials travel with the body, so a hit still
flashes only the enemy that was hit.

**Measured, not assumed** — five waves spawning 4 + 6 + 7 + 9 + 10 = 36 enemies built **16 bodies**, and
reused the other 20. The test asserts the reuse rate, not just that a pool exists.

**Tests** — 3 new assertions: a removed body returns to the pool, the next enemy of that type reuses the
same object, and the reused body starts from rest rather than mid-stride.


## 1.58.0 — 2026-11-21

**Decals on floors and ceilings were misoriented**

`lookAt(point + normal)` orients a decal correctly on a wall and is degenerate on a floor or a ceiling:
the plane's up vector is parallel to the look direction, so there is no roll to resolve and the rotation
is undefined. Blood and scorch marks on the floor were therefore randomly spun, and a ceiling decal could
end up edge-on.

| Surface | How it is set now |
| --- | --- |
| Floor (`normal.y > 0.9`) | `rotation.x = -PI/2`, random spin |
| Ceiling (`normal.y < -0.9`) | `rotation.x = +PI/2`, random spin |
| Wall | `lookAt`, then a random roll |

Three new assertions: a floor decal lies flat, a ceiling decal faces down, and a wall decal gets a finite
roll.

**Not done, and why** — the texture atlas (roadmap 47) is the obvious next draw-call win, but the level
geometry tiles every surface with UV repeats. An atlas cannot tile: a quad whose UVs run 0-2 to repeat a
brick twice would sample the neighbouring tile. It needs a `sampler2DArray` or a per-material repeat,
which is a different change from the one the roadmap describes. Recorded rather than attempted.


## 1.57.0 — 2026-11-21

**The last two enemies without joints**

| Type | Before | After |
| --- | --- | --- |
| Spitter | A bent spine with four straight cylinders | The humanoid rig with exaggerated proportions: a 0.42 rad hunch, knees, elbows, and a sac on the chest |
| Wisp | Three static cones hanging under a hood | Three tendrils on their own joints, writhing while it floats |

The wisp has no legs, so its walk phase now advances even when it is holding position — the tendrils are
what moves, and a floating enemy that is perfectly still reads as a prop.

Every enemy type is now either a humanoid rig, a quadruped rig, or a body with jointed limbs. Measured in
the browser in the vault: the spitter reads as a hunched creature carrying a glowing sac, the wisp as a
hooded light with tendrils.

**Tests** — 5 new assertions: the spitter has knees, elbows and a sac; it is hunched over 0.2 rad; the
wisp has three tendrils on joints; and they move while it floats.


## 1.56.2 — 2026-11-21

**The quadruped cost draw calls, and CI said so**

1.56.0 failed the smoke test at 147 calls against a 140 budget. Two changes:

| Change | Effect |
| --- | --- |
| No separate paw mesh | Four fewer meshes per hound; at this size the paw was a draw call you cannot see |
| LOD distance 15 m → 12 m | More of a wave is one coloured slab |

Measured after: under budget, smoke green.


## 1.56.1 — 2026-11-21

**The pickup test, again, and this time the cause**

The isolation enemy was spawned at `spawn.x + 40`, which can land outside the grid — so `spawnAt` created
nothing, the wave cleared, the wave change cleared the pickups the test had just placed, and the test
failed. It now takes a cell from the level's own open floor, and asserts the enemy exists so a broken
setup fails loudly instead of looking like a pickup bug.


## 1.56.0 — 2026-11-21

**The hound is a real quadruped now**

It was a body with four straight cylinders for legs. `rig.js` gained `quadruped()` — the same joint
hierarchy as the humanoid, on four legs instead of two:

| Part | Detail |
| --- | --- |
| Spine | Trunk, haunch and chest, so the back has a shape |
| Neck and head | A jointed neck, a boxed skull, a snout, eyes and ears |
| Tail | A joint that swings |
| Legs | Four, each hip → knee → paw, so the legs bend |

The gait is a gallop: the front pair and the back pair in opposition, knees folding on the lift, tail
swinging, neck dipping. Before, all four legs rotated together and it read as a table walking.

Measured in the browser beside a grunt: the hound reads as a beast with a head, a back and four legs, and
the grunt as a soldier. 23 parts, no mesh at NaN, four new assertions.


## 1.55.0 — 2026-11-21

**The old-build problem, fixed at the source**

Browsers cache ES modules hard. A player who reloads after a fix can keep running the old file, and from a
bug report "it is fixed" and "you are on the old build" are indistinguishable. That is the most likely
explanation for several reports that survived their fix.

`tools/stamp-cache.mjs` appends `?v=<VERSION>` to every relative import and to the entry script, so each
release is a different set of URLs and a reload is always the new code.

| Where | What it does |
| --- | --- |
| `pages.yml` | Runs the stamp between checkout and the mirror to `gh-pages`; the source stays clean |
| The stamp | Idempotent — running it twice does not produce `?v=1.55.0?v=1.55.0` |
| Tests | 3 new assertions: a relative import gets the version, the entry script gets it, and a second run changes nothing |

The title screen also prints `BUILD 1.55.0 · seed …`, so a report can name the build it came from.


## 1.54.0 — 2026-11-21

**A level whose spawn is a box is now refused**

The report was "no way out of the room, all rooms blocked". Measured on the current campaign seeds, no
zone does that — the foundry spawn reaches 476 of 506 cells with every door shut, and its spawn room has
five exits that are not doors. But the generator never *checked*, so a layout that boxed the player in
would have shipped.

`generateLevel` now measures two things and re-rolls the seed if either fails:

| Measure | Threshold |
| --- | --- |
| Cells reachable from the spawn with every door shut | at least 220 |
| Exits from the spawn room that are not door cells | at least 1 |

Eight attempts, then the best of them. The playability suite asserts both for the campaign seed and five
derived seeds of every zone.

**And if it happens anyway, the doors open**

If the player has not got more than 5 m from the spawn in 20 s while a wave is live, every door opens and
a toast says `DOORS OPEN · THE PAD STILL NEEDS A CLEAR WAVE`. The pad still only advances on a cleared
wave, so nothing is skipped — it just means a boxed spawn can no longer end a run.

**A trinket test that measured the wrong thing** — it compared against a base captured before other tests
ran. It now takes a bare baseline and a belted one in the same breath.


## 1.53.0 — 2026-11-21

**A build stamp, because "I fixed it" and "you are running the old file" look the same in a bug report**

The title screen now prints `BUILD 1.53.0 · seed hellgate` under the best-run line. If a fix does not
appear, the stamp says whether the page is the one that was built.

`check-claims` now fails when the stamp and `VERSION` disagree, so it cannot drift, and a test asserts the
stamp exists and names a version.

**Stale text fixed** — the title, the mode blurb and the zone map all said "five zones". There are eight.


## 1.52.0 — 2026-11-21

**The door axis, third attempt, and this one is right**

1.49.2 decided the door's orientation by "which neighbour is open". That is the wrong question: the exit
room itself is open, and it is not the corridor. A door beside the room concluded "the corridor runs
along X" and lay flat again.

The right question is "which neighbour is the room". You walk from the corridor into the room along that
axis, so the panel is thin along it:

```js
const intoX = cellAt(d.x - 1, d.z).room === level.exitRoom || cellAt(d.x + 1, d.z).room === level.exitRoom;
const intoZ = cellAt(d.x, d.z - 1).room === level.exitRoom || cellAt(d.x, d.z + 1).room === level.exitRoom;
const thinX = intoX || !intoZ;
```

Verified for every door in the first four zones: room on Z → thin in Z, room on X → thin in X, zero
misaligned. Captured in the browser in both corridor directions.

**A locked door now says it is locked**

| Change | Detail |
| --- | --- |
| Lock lamp | A lamp on the door face: red while locked, green when the wave clears |
| Toast | Walking within 3 m of a locked door shows `LOCKED · CLEAR THE WAVE` and plays the door sound, at most once every 3 s |

The door is locked because the wave is not clear. Standing in front of it guessing is the most common way
to think the level is broken, so the game now says it.

**Spawn positions do vary** — measured per zone: gate (50, 50), foundry (20, 20), grove (38, 40), vault
(58, 44), ashfall (32, 36), cistern (10, 24), kiln (36, 36), throne (46, 44). If a level still starts in
the same room every time, that is a different bug and I need to know which zone.


## 1.51.1 — 2026-11-21

**A test that failed only in CI**

`no wasted pickups` cleared every enemy to isolate itself, which completed the wave, opened the exit, and
let a wave change clear the pickups the test had just placed. It passed locally and failed in CI because
whether the player was standing near the exit depended on the seed.

It now leaves one enemy alive, far away, so the wave cannot complete.


## 1.51.0 — 2026-11-21

**One deep audit pass, and the bug it found**

`tools/audit-run.mjs` is new: it opens every zone, every mode and every screen in a browser, fires every
action, plays forty frames of random input, and reports anything that throws, anything non-finite, and
any state the game should not be in afterwards.

It found a real bug on the first run:

> `blade: Failed to execute 'setValueAtTime' on 'AudioParam': The provided float value is non-finite.`

The blade's swing sound passed its arguments in the wrong order — `noise(dur, gain, 1800, 'bandpass', 900)`
where the signature is `noise(dur, gain, type, f0, f1)`. The filter type became `1800` and the frequency
became `'bandpass'`, so every swing threw. Both blade sounds are fixed.

After the fix: **every zone clean, every mode starts, every action works.** The audit is in the repo so
the next regression has somewhere to fail.

**UI polish**

| Change | Detail |
| --- | --- |
| One palette | Six slightly different ambers became `--amber`, `--amber-dim`, `--amber-faint` |
| One scale | `--r` for radius, `--gap` for spacing, `--ease` for transitions |
| Button states | hover, active, `:focus-visible` with a real focus ring, and `:disabled` |
| Ghost buttons | A hover state; they had none |
| Screen headings | One rhythm: 26px, 0.3em tracking, 6px below |
| Screen backdrop | 0.9/0.985 with a 3px blur, so the HUD behind it stops competing |
| Journal rows | Aligned label and value columns, and the objective row spans the full width because it is a sentence, not a number |


## 1.50.0 — 2026-11-21

**The rig was building every body at NaN**

`humanoid()` read `p.legLen`, and no proportions object has a `legLen` — it has `thigh` and `shin`. The
hip height was `undefined`, so every joint position became `NaN` and the body rendered as nothing at all
or as disconnected parts. That is why the enemies looked wrong however the models were shaped.

The hip is now `thigh + shin`, and a test walks every biped asserting no mesh sits at a NaN position.

**Human proportions**

| Change | Why |
| --- | --- |
| A neck | The head was sitting on the shoulders |
| Two torso sections | A single cylinder read as a barrel; chest over abdomen tapers |
| Narrower shoulders | 0.44 → 0.32 on a grunt |
| Smaller pauldrons | 0.22 → 0.15 on a grunt; the shoulders were the silhouette |
| Smaller eyes | 0.22 of the head radius → 0.14 |
| Bigger head | A head is about a seventh of a body |

**The maps were too dark, and are not now**

| Change | Before | After |
| --- | --- | --- |
| Ambient light | floor 0.62 | floor 0.85 |
| Hemisphere light | 1.05 | 1.25 |
| Fill light | 0.9, 22 m | 1.5, 30 m |
| Fog | 9-32 m | 14-46 m |
| Zone ambient | 0.44-0.82 | 0.72-0.95 |
| Fog colours | near-black | lifted by 0x14 on every channel |
| Tech texture | panels at 34-48 | panels at 64-84 |

Measured in screenshots: the gate is warm brick, the foundry is hot rust, the cistern is blue-grey panels
with hazard stripes. All three are readable at a glance and none is a black corridor.

**Stronger palettes** — the wall tints are up from about ±6 % to ±30 % per channel, so the same geometry
and the same nine textures read as different places.


## 1.49.2 — 2026-11-21

**The door was facing the wrong way in half the corridors**

1.47.0 made doors thin panels, and got the axis backwards: it made the panel wide along the corridor
instead of across it. In a corridor running along X the door lay flat along the walkway, blocking
nothing and reading exactly like the slab in the air it was supposed to fix. That is why the report
survived the fix — it was right, and my fix only worked in the other half of the corridors.

The panel is now thin across the corridor and wide across the doorway, computed from which neighbours
are open.

**Test** — for every door in the level, the thin axis must match the corridor's direction. Zero
misaligned, and it would have failed before this fix.


## 1.49.1 — 2026-11-21

**The rig cost more draw calls than the budget allowed**

1.49.0 failed CI: 143 calls against a 140 budget. A rig body is 19-23 parts where the old compound body
was 10, and six enemies on screen is the difference. The level-of-detail distance drops from 22 m to 15 m,
so more of a wave is one coloured slab instead of twenty meshes. Measured after: 86 calls in the same
scenario, and the budget still catches a regression.


## 1.49.0 — 2026-11-21

**Pose blending on the rig**

The walk cycle was the only animation. The rig now blends a pose on top of it per state, the cheap version
of an animation blend tree:

| State | What the body does |
| --- | --- |
| Attack | Both arms up and forward, a slight lean back, head lifts — the shot is readable in the silhouette and not only in the glow |
| Pain | Folds forward, head drops |

The blend is a lerp toward a target at 9-12 per second, so a state change reads as movement rather than a
snap. This is the idea behind the Three.js blending examples applied to joints instead of skinned
vertices: same principle, no skinning.

**Level of detail tightened to pay for the rig** — the rig is 19-23 parts per body where the old bodies
were 10, and the CI draw-call budget caught it at 143 calls. The distance at which an enemy becomes a
single coloured slab drops from 22 m to 15 m, which brings the frame back to 86 calls in the same
scenario.

**The kit got the four reusable pieces** — `game-kit` 1.9.0 now has `flowField`, `pool`, `minimap` and
`audio.gen`, extracted from this game. Details are in that repository's changelog.


## 1.48.0 — 2026-11-21

**A real rig for the bipeds**

The imp, grunt, brute and warden were compound meshes: a torso with sticks hanging off it. They are
built by `play/src/rig.js` now, which is a parametric humanoid with actual joints.

| Joint | What it does |
| --- | --- |
| Spine | Carries the shoulders and head, and leans |
| Shoulder → elbow → hand | Two segments, so the arm bends at the elbow |
| Hip → knee → foot | Two segments, so the leg bends at the knee |

The walk cycle drives the knees and elbows: knees bend on the back swing, elbows on the forward one. That
is the whole difference between a box with sticks and something that reads as walking.

Proportions are per type — the imp is all spine and arm, the grunt is a barrel with pauldrons and a
rifle in its hand, the brute is shoulders on legs, the warden is a monument with a furnace core. Every
body is 19-23 parts.

**A wave you cannot clear can no longer lock the level**

Two fixes, both about being unable to find or reach the last enemy:

- the compass points at the nearest enemy when the exit is shut and the keycard is not the objective, so
  the last one is findable
- `enemies.unstuck()` — an enemy that has not got closer for 14 s is moved to open floor near the player.
  It is a compromise, and better than a door that never opens.

**Tests** — 16 new assertions: every biped is a rig with a head, spine, shoulders, elbows, hips and
knees; the knee hangs off the hip and the elbow off the shoulder; and each body is 19+ parts.


## 1.47.0 — 2026-11-21

Six reports from playing past the first level.

**The gates were horizontal slabs in the air**

Doors were cubes, and the opening animation shrank them (`scale.y` to 0.02) while lifting them 3.2 m —
so an interrupted open left a flat sliver hanging above the corridor. Doors are now thin bulkhead panels
that translate up into the lintel and are hidden when they arrive, and `updateDoors` runs from the main
loop rather than the playing-state branch, so a pause or a screen change can no longer freeze one
half-open.

**Every zone is now a different floor plan**

`generateLevel` took no options, so all eight zones were 9-13 rooms of 4-8 cells. Each zone now passes a
`shape`:

| Zone | Rooms | Room size | Tall rooms |
| --- | --- | --- | --- |
| The Gate | 8-11 | 4-7 | 25% |
| The Foundry | 10-14 | 3-6 | 50% |
| The Grove | 6-9 | 6-9 | 15% |
| The Vault | 11-15 | 3-5 | 20% |
| Ashfall | 5-8 | 7-10 | 60% |
| The Cistern | 9-13 | 3-5 | 10% |
| The Kiln | 7-10 | 5-8 | 45% |
| The Throne | 6-9 | 7-10 | 70% |

Measured: Ashfall is 5 rooms averaging 73 cells, the Vault is 14 rooms averaging 17, the Throne is 8
rooms averaging 70 with 6 of them over 5 m tall. They are not the same map any more.

**Distant enemies were all the same grey slab**

The level-of-detail proxy shared one material, so past 22 m every type was an identical dark box. It is
now coloured per type: red for an imp, cyan for a wisp, magenta for a hound.

**A card between levels** — the screen fades to black with the zone name for 0.7 s when a level starts, so
the change is visible.

**Journal and inventory are on the pause screen** — both existed behind `J` and `Tab` and were invisible
if you did not know. There are buttons now, and the pause screen lists the keys.

**A test double gap** — `BoxGeometry` recorded no dimensions, so "a door is a thin panel" could not be
asserted. It records them now.


## 1.46.0 — 2026-11-21

**Four more surfaces, and a pair for every zone**

The game had five textures and used two of them for walls and two for floors, so a palette change was
mostly a tint over the same bricks. There are nine now — brick, tech, **rust**, **moss**, **stained** for
walls; tile, plate, **grate** for floors — and every zone picks its own pair.

| Zone | Walls | Floor |
| --- | --- | --- |
| The Gate | brick | tile |
| The Foundry | rust | plate |
| The Grove | moss | tile |
| The Vault | tech | plate |
| Ashfall | stained | plate |
| The Cistern | tech | grate |
| The Kiln | rust | tile |
| The Throne | stained | plate |

The foundry now reads as oxidised metal, the grove as wet green stone, the cistern as a dark service
tunnel with a grated floor. Same geometry, same vertex shading, different surfaces.

Each new texture is drawn on a 64x64 canvas at boot like the others: no assets, no downloads.


## 1.45.0 — 2026-11-21

**A palette per zone, not just a tint over the same bricks**

The level geometry's vertex colours are shading only, so every zone drew the same walls. They are now
multiplied by a per-zone `wallTint`, which means the foundry rusts, the cistern goes teal and the kiln
goes orange out of the same geometry and the same five textures:

| Zone | wallTint | Reads as |
| --- | --- | --- |
| The Gate | `[1.0, 0.97, 0.92]` | warm brick |
| The Foundry | `[1.12, 0.92, 0.78]` | rust |
| The Grove | `[0.88, 1.05, 0.9]` | moss |
| The Vault | `[0.9, 0.96, 1.06]` | steel |
| Ashfall | `[1.05, 1.0, 0.95]` | ash |
| The Cistern | `[0.82, 1.0, 1.08]` | teal |
| The Kiln | `[1.18, 0.86, 0.74]` | firebrick |
| The Throne | `[1.15, 0.78, 0.78]` | blood |

**It is brighter, and it cannot be too dark**

- ambient light has a floor of 0.62, whatever a zone asks for: a corridor you cannot see is broken, not
  atmospheric
- a point light travels with the player, 3.5 m ahead and 2.4 m up, so the thing in front of you is lit
- the hemisphere light is up from 0.95 to 1.05

**The HUD on a phone**

Measured at 390x844 and 360x640 before and after: the objective pill is 215x21 and fits, the keycard chip
is hidden, the power slots drop their labels and keep their keys, the touch grid drops to 38 px buttons on
the smallest screens, and the whole bar is 82 px tall instead of eating a third of the screen.

**The gun no longer eats a portrait screen**

The view model scales with the aspect ratio, clamped to 0.55, and re-applies on resize — a phone held
sideways and turned upright gets the right size without a reload.


## 1.44.0 — 2026-11-21

**The guns look like guns**

The view models were two boxes and a cylinder. All four are rebuilt with the parts that make them
recognisable:

| Weapon | What is new |
| --- | --- |
| Pistol | Slide, grip, hammer, front sight, muzzle |
| Chaingun | Six barrels on a bearing, ammo box, carry handle, sight |
| Shotgun | Twin barrels, wooden pump, stock and grip, bead sight |
| Rocket launcher | Muzzle ring, back blast, two grips, top rail, sight |

The rest position also moved up 7 cm: at a 900x520 viewport the HUD bar was eating the gun.

**Sprites**

| Sprite | Where |
| --- | --- |
| Muzzle flash | A bright additive quad at the barrel, six reused, 60 ms |
| Impact flash | A small bright hit where a shot lands on a body |
| Keycard beacon | A gold light column over the card, the same idea as the exit beacon |

**Four real disposal bugs**

A pickup, a relic and the keycard are Groups now, but three collection paths still called
`mesh.geometry.dispose()` on them, which throws on a Group. The soak test caught it as an intermittent
"no crash in 2000 frames" failure; it took a 60-run loop to reproduce reliably. `dropMesh()` is the one
path now, and it handles a bare Sprite as well as a Group.

**Two more flaky assertions fixed** — the pistol test aimed, waited sixteen frames, then fired, so an imp
that wandered out of the crosshair failed it. Aim and fire are now the same frame.


## 1.43.0 — 2026-11-21

**A colour grade per zone, and a light column over the exit**

The composite pass now takes three more uniforms — a tint, a saturation and a vignette — and every zone
carries its own:

| Zone | Tint | Saturation | Vignette | Reads as |
| --- | --- | --- | --- | --- |
| The Gate | neutral, warm | 1.05 | 0.42 | cold brick |
| The Foundry | amber | 1.10 | 0.40 | heat and dust |
| The Grove | green | 1.12 | 0.36 | alive |
| Ashfall | grey | 0.86 | 0.46 | drained |
| The Cistern | blue | 0.95 | 0.42 | wet and cold |
| The Vault | cool | 0.92 | 0.48 | sealed |
| The Kiln | deep orange | 1.16 | 0.44 | hot |
| The Throne | red | 1.20 | 0.50 | the end |

The grade rides on the composite, so `Graphics: Performance` (which drops bloom) keeps the flat colour —
one pass, one place.

**The exit beacon** — a soft light column over the pad, red while the exit is shut and green the moment it
opens, pulsing slowly. It is the one thing you should be able to find from across a dark room without
reading the HUD.

**The three new zones were too dark to play.** Measured in a screenshot, not by feel: the Kiln's tech
walls and 0.5 ambient rendered as near-black with orange dots. Ambient up, fog lighter, and the Kiln now
uses the brick set. It reads as a warm brick corridor instead of a cave.

**Test double** — `SpriteMaterial` had no `color`, so the first sprite that tried to change colour threw.


## 1.42.0 — 2026-11-21

**The blade: a run with no ammo is still a run**

`F`, middle-click, or the BLADE button on a phone. It costs nothing, so "out of shells" is a change of
plan and not the end of the run.

| Property | Value |
| --- | --- |
| Damage | 58 per swing |
| Reach | 2.6 m, plus the target's own radius |
| Arc | cos 0.35 — about 70 degrees either side of where you are looking |
| Cooldown | 0.52 s |
| Lunge | a 1.6 m/s shove forward, blocked by walls like any other movement |

It hits everything in the arc, not just the nearest thing. The swing draws a wedge where it went, so a
miss is legible: the arc is drawn in front of you and the enemy was not in it. Blood, a damage number and
a hitmarker on connect, two new sounds, and a small screen kick.

When a gun runs dry the toast now says what to do about it: `OUT OF SHELLS · F BLADE`.

**Four flaky assertions fixed**, all of which had been failing about once in ten runs:

| Test | Why it was flaky |
| --- | --- |
| `enemy closed along the field` | picked a walkable pair, but a wide body can wedge in a corridor the flow field calls open. It now also requires a clear straight run, and tries three pairs |
| `the blade damaged what was in front of it` | aimed, then ran two frames, then swung: the imp walked out of the arc. Aim and swing are now the same frame |
| `with every gun empty the blade still kills` | same aim-then-wait problem |
| `addShake is a no-op under reduced motion` | the soak above it left a shake mid-decay |

**`F` is the blade now; fullscreen moved to `F11`.** `Q` was already a power.


## 1.41.0 — 2026-11-21

**The warden gets an entrance**

When the boss wave starts, the letterbox closes, the camera orbits the thing that just arrived, its name
and the zone type out over the bars, and control comes back. Three seconds, skippable on any key, click
or tap — a cutscene you cannot skip is a hostage situation. The game loop hands the camera to the cut and
takes it back, so nothing else runs while it plays.

**More effects**

| Effect | Where |
| --- | --- |
| Shockwave ring | Explosions: a flat disc that expands and fades, so a blast reads as pressure |
| Sparks | Bullet meets wall: hot core plus embers plus a scorch |
| Muzzle smoke | A puff at the barrel on every shot |

The rings are four reused meshes, not four per explosion.

**A real bug the new tests found**

The warden is 2.1 m across and a cell is 2 m, so it was **born inside the wall** of whatever cell it
spawned on. It now spawns only where a 3x3 block of cells is open. The same test found that the spawn
jitter (±0.3 m) put a brute's shoulder into the wall; the jitter now scales with the body.

**Test double fix** — the DOM stub had a no-op `classList` shadowing the real one, which broke five HUD
assertions the moment a test needed `contains()`. The stub now has one `classList`, backed by a Set.


## 1.40.0 — 2026-11-20

**Items look like items** (roadmap 58)

Every pickup was a coloured octahedron or box. They are models now, in a new `play/src/items.js`:

| Pickup | What it is |
| --- | --- |
| Health | A white case with a red cross and a handle — a medkit |
| Armour | A flattened plate with shoulder straps and a V-neck — a vest, not a can |
| Bullets | A green ammo can with a stencilled stripe and rounds glimpsed in the lid |
| Shells | Three loose shotgun shells, brass on red |
| Rockets | A tube, a nose cone and three fins |
| Keycard | A card with a magnetic stripe and a chip |
| Relics | A stone idol on a plinth with a chip of light in its skull |
| Trinkets | A coin, a ring or a compass, one per slot |

Geometry and materials are shared and cached, so eight pickups on a floor cost tens of draw calls. Disposal
had to change with them: a pickup is a Group now, so `dropMesh()` removes it and disposes only the sprite
that hangs off it, never the shared geometry.

**Three more zones** — Ashfall (open sky, ash falling), The Cistern (standing water, something under it)
and The Kiln (the last heat before the throne). Eight zones total, each with its own palette, props,
threat, cold open and epilogue. Seeds chosen by `tools/pick-seeds.mjs`, not typed.

**Two more modes** — Arena (one room, waves back to back) and Nightmare (Campaign on Hard, keycard from
the first wave, whatever the settings say). Six modes total.

**One test updated** — it asserted five zones have story; it now asserts every zone does and that each is
at least three panels, which is the invariant that matters.


## 1.39.0 — 2026-11-20

**Music, generated**

No audio files and no samples. A minor pentatonic, a tempo per scene, and a rule for which note comes
next, scheduled from the game loop so it stops when the tab does.

| Scene | Tempo | What it does |
| --- | --- | --- |
| Menu | 68 BPM | Sparse arpeggio, no drums |
| Explore | 82 BPM | Adds a bass root, occasional hat |
| Combat | 132 BPM | Drums on, arpeggio dense |
| Boss | 150 BPM | Faster, higher root, double-time kick |

The game's own tension number — the one the mix already uses — decides how busy it plays, so the music
and the pad move together. `Music.update()` schedules a quarter second ahead and refuses to queue more
than half a second of backlog, so a tab left in the background does not come back with an hour of notes.

**Two more enemies**

| Type | Behaviour | Body |
| --- | --- | --- |
| Brute | Walks at 1.7 m/s until it sees you, then charges at 5.2. 140 hp | A wedge of plate with the head low between the shoulders and knuckles near the floor |
| Wisp | Floats 1.15 m up and ignores stairs. 18 hp, fires slow orbs | A hood and a light with nothing below the waist |

**Four game modes**

| Mode | Rule |
| --- | --- |
| Campaign | Five zones in order |
| Endless | One zone, waves that never stop |
| Boss Rush | One wave per zone, the warden every time |
| Hardcore | Campaign rules, but death deletes the run |

A mode changes the rules, not a slider: endless never fires the zone-clear path, boss rush forces the
boss flag on every wave, hardcore clears the save on death.

**A flaky test fixed** — `enemy closed along the field` used a line-of-sight pair, which is the wrong
criterion for a pathing test: an enemy can see you across a crate it cannot walk around. It now asks the
flow field for a pair that is actually walkable, and five consecutive runs are clean.


## 1.38.0 — 2026-11-20

**The wind-up is visible now**

Every enemy that shoots glows while it winds up: the body's emissive channel ramps from black to hot
orange across the telegraph — 0.55 s for an imp, 0.4 s for a grunt, 0.75 s for a spitter, 0.7 s for the
warden. Before this, the only tell was a small particle burst on the imp and the enemy's own scale
animation, which reads as a twitch rather than a warning.

A hit flash uses the same emissive channel, so the flash wins while it lasts and the charge colour is
restored after it — the two never fight over the pixel.

This follows from "kills you if not properly played": the game was asking the player to read a 0.55 s
window off a health bar.

**One test asserted the wrong thing** — `flash decays back to black` checked `emissive.r === 0`, which is
no longer true once an enemy is winding up. It now checks that the flash ended and that whatever is left
is the charge colour (no blue), which is the real invariant.

**`documentation/combat.md`** describes the telegraph timings per type.


## 1.37.0 — 2026-11-20

**The campaign ramps across zones, not just across waves**

The first playtest report: died on **The Gate, wave 3, Normal**. The arithmetic agreed with it. The
difficulty preset alone made zone 1 wave 3 identical to zone 5 wave 3 — the first level was as hard as
the last one at the same wave number, which is how a player dies on level one and never sees level five.

Each zone now carries a `threat` scalar applied to health, damage and count:

| Zone | threat | Wave 3 enemies | Wave 3 total hp |
| --- | --- | --- | --- |
| The Gate | 0.72 | 7 | 281 |
| The Foundry | 0.86 | 8 | 335 |
| The Grove | 1.00 | 10 | 390 |
| The Vault | 1.12 | 11 | 437 |
| The Throne | 1.22 | 12 | 476 |

Before: every zone was 10 enemies and 526 hp at wave 3. The Gate is now about half the threat it was at
the point where that run ended; The Throne is harder than it was.

**`tools/balance-report.mjs` takes a zone** — `node tools/balance-report.mjs normal gate`. Without that
it would have kept printing the old numbers and describing a game that no longer exists.

**Two tests asserted absolute numbers** that this change moved: `wave 1 spawned 6 enemies` and
`hard raises the wave size multiplier` (compared against 1 rather than against normal). Both now assert
the relationship — the count the zone threat implies, and hard > normal — so the next tuning pass does
not have to rewrite them.


## 1.36.0 — 2026-11-20

**The mix tells you what the HUD tells you**

The ambient pad was a fixed drone at 320 Hz. It now opens up and gets louder as the room fills:
`audio.setTension(0..1)` moves the lowpass from 300 Hz to 1080 Hz and the gain from 0.026 to 0.058 over
about half a second, and the loop feeds it a number built from three things.

| Input | Weight |
| --- | --- |
| How crowded the room is (alive / 10) | 0.55 |
| How close the nearest enemy is (0 at 26 m) | 0.55 |
| A boss being alive | 0.25 |

Clamped to 1, so a boss with ten enemies on top of you is as loud as it gets.

**A heartbeat under 30 % health**

Two soft sub thumps, 0.55 s apart when you are nearly dead and slower as you recover. It is the one piece
of information in the game that is easier to hear than to read.

**Tests** — 4 new assertions on the tension control (exists, stores, clamps at both ends), and the smoke
test's sound sweep now covers `heart`, `sprint` and `crouch`, which it had been missing.


## 1.35.0 — 2026-11-20

**The draw-call budget had stopped measuring anything**

With bloom on, `render()` read `renderer.info` after the composite, so `renderStats.calls` described one
quad — 1 call — and the smoke test's "under 140" passed trivially. The budget was written to catch a
regression and had quietly become decoration.

`Bloom.render()` now returns the scene pass's own counts and `render()` uses them. Measured after the
fix: 41 calls with bloom, 40 without, on the same frame.

**Bloom drops itself on a slow machine**

The adaptive pass already traded resolution for frame time. It now drops bloom first — four passes at
quarter resolution are worth more than the resolution they cost — and brings it back if the machine
turns out to be fine.

| Average frame time | Action |
| --- | --- |
| over 26 ms | bloom off |
| under 14 ms, previously dropped | bloom back on |
| over 21 ms | pixel ratio down 0.15, floor 0.7 |
| under 13.5 ms | pixel ratio up 0.1, ceiling 1.5 |

**Measurement honesty** — `documentation/testing.md` now says plainly that frame time cannot be measured
in this sandbox: Chromium runs on SwiftShader, so every frame takes 150-200 ms whatever the game draws.
Draw-call counts are trustworthy here; milliseconds are not, and a phone is needed for those.


## 1.34.0 — 2026-11-20

**The campaign seeds are chosen now, not typed**

`world.js` held five seed strings somebody typed. Two of them — `grove` and `throne` — had **no room
bigger than 7×7**, so the grove was the flattest level in the game and the warden fought in an ordinary
room. That is a design flaw a string cannot tell you about.

`tools/pick-seeds.mjs` scores 300 candidates per zone against what that zone needs and prints the best:

| Zone | Was | Now | Rooms | Big rooms | Stairs |
| --- | --- | --- | --- | --- | --- |
| The Gate | `hellgate` | `gate-238` | 9 | 3 | 66 |
| The Foundry | `foundry-7` | `foundry-101` | 12 | 3 | 65 |
| The Grove | `grove-3` | `grove-234` | 11 | 3 | 75 |
| The Vault | `vault-11` | `vault-199` | 12 | 2 | 70 |
| The Throne | `throne-0` | `throne-173` | 11 | 5 | 60 |

The throne now has five rooms of 7×7 or larger, so the warden has somewhere to be a boss.

**The playability suite tests the campaign seed itself** — it used to test `zone.seed + '-0..5'`, which
are five levels nobody plays. It now runs the real seed first and five derived ones after, so 350
assertions instead of 300.

**A candidate is rejected outright** if it has fewer than 9 rooms, no 7×7 room, fewer stairs than the
zone wants, no secret, fewer than two crates, under 330 open cells, or more than 60 cells cut off behind
shut doors.


## 1.33.0 — 2026-11-20

**Licence: MIT to PolyForm Noncommercial 1.0.0**

The fleet's other games are PolyForm Noncommercial; HELLGATE was the outlier. It now matches: play it,
read it, fork it for anything noncommercial; do not sell it.

| File | Change |
| --- | --- |
| `LICENSE` | The full PolyForm Noncommercial 1.0.0 text with the required notice |
| `NOTICE.md` | Says the project licence and the Three.js licence are two different things, because they are |
| `README.md` | The sentence and the footer |
| `index.html` | The landing-page footer |
| `SPONSORS.md` | The one line that called it MIT |
| `CONTRIBUTING.md` | A contribution clause: a PR is offered under the same terms, no CLA, no sign-off |
| `tools/check-claims.js` | Names the licence in the file and fails if it is neither PolyForm nor MIT — the badge can no longer drift from the file |

**Three.js stays MIT.** It is a separate work under its own licence; relicensing this repository does not
and cannot change that. `NOTICE.md` says so explicitly, because that is the mistake people make.

**Verified** — the legal scanner now reports `PolyForm-Noncommercial-1.0.0` and six legal files:
LICENSE, NOTICE, PRIVACY, SECURITY, CODE_OF_CONDUCT, CONTRIBUTING.


## 1.32.0 — 2026-11-20

**A fifth enemy: the spitter**

Four types covered flat shots, closing, and melee. None of them punished standing still. The spitter
holds nine metres, backs off when you close, and lobs an arcing glob that splashes where it lands.

| Property | Value |
| --- | --- |
| Health | 34, and it is thin — two shotgun pellets put it down |
| Range | Lobbed from up to 18 m, holds 9 |
| Behaviour | Backs away when you close, so it is the one enemy you have to chase |
| Body | Tall, thin, bent over a swollen green sac — the silhouette is the sac |
| Appears | Wave 3, one in six; more from wave 4 |

**The glob** is a new projectile kind: gravity, no bounce, a 2.4 m splash. It arcs, so it misses if you
keep moving — which is the point of the enemy.

**Tests** — 4 new assertions: it spawns, it lobs rather than shoots flat, it holds a distance, and the
glob is an acid projectile that arcs without bouncing.


## 1.31.0 — 2026-11-20

**Bloom** (roadmap 44)

Muzzle flashes, explosions, the warden's furnace and the enemy eyes now glow. Three.js ships
`UnrealBloomPass`, but that is an example module and this project vendors the core library only, so the
pass is written here: the scene renders into a target, the bright pixels are kept at quarter resolution,
blurred twice, and added back.

| Detail | Choice |
| --- | --- |
| Cost | Four quarter-res passes, then the composite |
| Threshold | 0.72, with a 0.25 soft edge |
| Blur | Nine-tap separable, two passes |
| Switch | `Graphics: Performance` turns it off; reduced motion turns it off |

**The first version came out dark** — the scene renders into a linear target and the renderer's sRGB
conversion only runs on the final pass, which was now this shader. The composite encodes sRGB itself and
the brightness matches the pre-bloom game.

**Graphics quality setting** — Performance / Balanced / Pretty in the settings panel, persisted like the
rest. Performance drops bloom and the prop detail pass.

**Stub** — `Vector2`, `ShaderMaterial`, `OrthographicCamera`, `WebGLRenderTarget` and
`renderer.setRenderTarget` added, because `check-stub` refuses to let the test double drift.


## 1.30.0 — 2026-11-20

**The warden, in curves**

It was the last body still built from boxes, which made the boss the least convincing thing on screen.
It is now a barrel chest tapering to the waist, slabs of shoulder either side, a head sunk between them
with two glowing eyes and horns, and the furnace core in the chest that the health bar is measuring.

Same part names again, so the slam animation, the phase escalation, the hit flash and the distance slab
all work unchanged. The core still scales with the phase.

**Objective pill moves out of the boss bar's way** — when a boss is on screen the pill drops to 104 px so
the two do not sit on top of each other.

**Screenshots** — all eleven regenerated with the new bodies.


## 1.29.1 — 2026-11-20

**The READ button was declared nowhere**

1.29.0 shipped a touch module that referenced `readBtn` in `setReadable` without ever declaring it. Every
frame threw `readBtn is not defined`, the loop died before it could turn the overlay on, and the phone
had no controls at all. The browser smoke test caught it; the suites could not, because the stub DOM has
no touch overlay to break.

**Touch layout, two rows instead of three**

Three rows of 42 px buttons ran under the health bar. The grid is now `Q E R FIRE` over `GUN JMP NADE`,
with `READ` taking the last cell when a terminal is in reach, and the HUD bar moved down to 108 px.

**Objective pill** — `white-space: nowrap`, so `CLEAR THE WAVE · 10 LEFT` is one line instead of two.

**Measured on a 390x844 viewport after the change**: objective (84, 76) 223x21, waypoint (147, 128),
minimap (284, 498) 96x96, NADE (287, 788) — every element inside the viewport, none overlapping.


## 1.29.0 — 2026-11-20

Five reports from play on a phone, and a request for bodies that look like bodies.

**Minimap** — a 132 px floor plan in the corner: walls prerendered once at level build, then a blit plus
markers at 10 Hz. You, the enemies, the keycard ring and the exit pad. It shrinks to 96 px below 620 px
and moves above the touch controls.

**READ button on touch** — terminals were readable only with `V`, which a phone does not have. A seventh
touch button appears when a terminal is in reach and does nothing otherwise.

**Quest marker with a distance** — the compass chevron now carries `KEYCARD 37 m` or `EXIT 12 m` above
it, so it is a waypoint and not decoration.

**Objective line** — it was there since 1.24.0 but read as part of the top bar; it is now a bordered pill
in the middle of the screen, amber for the keycard, green for the exit.

**The exit label is gone** — `EXIT SHUT ▪` sat under the power bar and said what the objective pill and
the waypoint already say.

**Enemy bodies rebuilt** (roadmap 49)
- every body was boxes. They are now tapered cylinders, spheres and cones, cached and shared like the
  boxes were: the imp is a hunched egg with horns and arms past its knees, the grunt a barrel torso with
  shoulder pads, a helmet and a rifle in its right hand, the hound a low four-legged body with a wedge
  head and spine spikes. The warden keeps its shape, which was already distinct.
- same part names, so the walk cycle, the hit flash, the death fall and the level-of-detail slab all work
  unchanged.

**Tests** — 4 new assertions: the minimap canvas exists and prerenders, drawing markers does not throw,
the touch READ button exists, and the prompt names the action.


## 1.28.0 — 2026-11-20

**The difficulty curve, as arithmetic instead of opinion**

`documentation/balance.md` said plainly that no constant in the repository was backed by data. A bot is
not the answer — `tools/soak.mjs` aims badly and its kill count says more about the bot than the game —
so the gap is filled the other way: `tools/balance-report.mjs` reads the same constants the game uses
and prints what a wave costs.

| Wave | Enemies | Total hp | Shells to clear | Enemy dps if all in range |
| --- | --- | --- | --- | --- |
| 1 | 6 | 330 | 4 | 43 |
| 4 | 12 | 684 | 8 | 91 |
| 8 | 20 | 1382 | 16 | 140 |

Two findings, both from the numbers and neither a matter of taste:

- **Ammo is the clock.** You carry 16 shells; wave 8 needs all of them. From wave 7 the run is about
  finding ammo, not aiming.
- **Enemy dps passes your health pool at wave 2.** 110 hp plus 25 armour against 55 dps means four
  seconds in the open is fatal from the second wave.

The dps column assumes every enemy is in range and attacking on cooldown — an upper bound, and labelled
as one. The report moves when the code moves, because it imports the code.

**Also** — the soak bot now closes to 9 m before firing instead of shooting through its own spread at
26 m, which is why its kill count was meaningless before. It is still not a balance instrument and the
tool says so in its own output.


## 1.27.0 — 2026-11-19

**A playability suite: every level must be completable**

The two bugs reported from play — a keycard behind a sealed wall, and bodies wider than their collision
circle — were both "the level works" failures. Neither was visible to a test of a single function, and
my earlier checks asked the easier question.

`tests/test-playability.mjs` plays five zones × six seeds and asks, per level:

| Check | Why |
| --- | --- |
| The spawn is open floor | a level you cannot stand in is not a level |
| The exit is reachable once doors open | the only way out |
| Wave 3 places a keycard, on reachable floor | the gate's precondition |
| No pickup, relic or barrel is out of reach | the keycard bug, generalised |
| Every enemy spawned on reachable floor | an enemy you cannot reach is a wave you cannot clear |
| No enemy body stands inside rock | the wall bug, measured against a constant rather than the radius under test |
| Clearing the wave opens the exit | the whole loop, end to end |

300 assertions, four suites, every gate green.

**A bug the new suite found immediately**

`depenetrate()` used a circle test at half the body radius. In a legal spot near a wall that test fires,
and the enemy was snapped to its cell centre every frame — frozen in place. The navigation test caught
it ("enemy closed along the field 6 → 6 cells"). It now tests the cell the enemy stands in, not a
circle, so it only acts when the centre is genuinely inside rock.


## 1.26.0 — 2026-11-19

**Enemies through walls: found, measured, fixed**

The report was right and my earlier headless test was looking in the wrong place. It tested whether an
enemy's *centre* was inside a solid cell — which never happens. The body is what the player sees.

Measured with `Box3.setFromObject` in a real browser:

| Type | Collision radius | Body width | Poked through walls by |
| --- | --- | --- | --- |
| Imp | 0.45 | 1.21 | 0.16 m |
| Grunt | 0.42 | 0.99 | 0.08 m |
| Hound | 0.36 | 1.25 | 0.27 m |

Every enemy's shoulders and arms were inside the wall it stood beside. Collision radii are now the
measured half-widths — 0.62, 0.52, 0.64 — so the body fits the circle it is stopped by.

**Safety net** — `depenetrate()` runs every frame: if a body ever is inside rock, it is walked to the
nearest open cell centre and counted. A body inside a wall is now a bug that corrects itself rather
than one the player sees.

**Tests** — 9 new assertions: each radius matches its body half-width, and each type is pushed out of a
solid cell onto open floor.

**Tooling** — `window.__THREE` is exposed so a browser tool can measure scene geometry; that is how the
body widths were measured.


## 1.25.0 — 2026-11-19

**Story mode, per zone**
- five cold opens instead of one. The gate, the foundry, the grove, the spire and the throne each type
  their own panels over their own level, and each closes with an epilogue line on the cleared screen.
- `panelsFor(zoneId)` falls back to the shared set, so a sixth zone added later still works.

**The map says what to do next**
- the zone screen opens with `NEXT — <zone> · <blurb>`, or `EVERY ZONE CLEARED` once all five are done.
- it is reachable mid-run on `M` as of 1.24.0, so it is the answer to "where am I supposed to go".

**Five levels**
- the progression is unchanged (five zones, unlocked in sequence, the last one the warden) but it now
  reads as five places: distinct cold open, distinct epilogue, distinct palette and props, and the map
  shows which are cleared.

**Tests**
- 5 new assertions: five zones with story, zones do not share text, unknown zone falls back, epilogue
  exists.


## 1.24.0 — 2026-11-19

Four reports from play, two of them real defects.

**Fixed: the keycard could be placed where nobody could reach it**
- cell pickers used `openCells`, which includes the sealed secret alcove (open floor, unreachable by
  design) and crate cells (open floor until shot apart). A keycard in either made the level
  uncompletable, which is exactly "the gate never opens".
- `generateLevel` now computes a reachability field once from the spawn and exposes `reachableCells`;
  the keycard, relics, pickups and enemy spawns all draw from it.
- a test asserts no reachable pick is solid, secret or a crate.

**Fixed: an unhandled pointer-lock rejection**
- `requestPointerLock` without a user gesture throws `NotAllowedError`. The retry path did not catch its
  own promise, so pausing and resuming could throw in the console. Both paths swallow it now.

**New: the objective line**
- one line at the top of the HUD that answers "what am I doing": `CLEAR THE WAVE · 6 LEFT`, then
  `FIND THE KEYCARD`, then `REACH THE EXIT`. This is the fix for standing in front of a shut gate with
  no idea why it is shut.

**New: the journal** (`J`)
- zone, objective, wave, score, what you have found (relics, secrets, terminals, trinkets) and the five
  zones with their state.

**New: the world map mid-run** (`M`)
- pauses and opens the zone map instead of only being reachable from the menu.

**Compass retargets**
- the waypoint points at the keycard while it is missing and at the exit once it is open.

**Note on enemies through walls** — not reproduced: ten enemies crowded near a wall for ten seconds
never entered a solid cell in the headless harness, and `tryMove` uses a circle test against the same
collision the player uses. If it still happens in a browser, the next step is a recording of the
position, not a guess.


## 1.23.0 — 2026-11-19

**Enemy level of detail** — the draw-call win the measurement pointed at

1.22.1 established that the level is 11 of 117 draw calls and the rest is bodies and effects. Each
enemy is ten meshes. Past 22 m an enemy is now a single slab instead of ten parts.

| Scene | Draw calls | Triangles |
| --- | --- | --- |
| Before, 8 enemies | 66 | 5088 |
| After, 8 enemies | **32** | 4738 |

Same camera, same seed, 1280×720. The proxy shares one geometry and one material across every enemy,
so the switch allocates nothing, and it hides the whole body group rather than walking the parts.

**Guard** — the smoke test's draw-call budget drops from 160 to 140, which is the number the LOD change
earns.

**Test** — the geometry-sharing assertion had to reach through the new body group; it now finds the
flashable torso by walking `e.body` rather than indexing `mesh.children[0]`.


## 1.22.1 — 2026-11-19

**Chunked level meshes: measured, then rejected** (roadmap 46)

The plan was to split the merged geometry into 4×4-cell chunks so the renderer could cull most of the
level each frame. Measured on the arena at 1280×720, with the same camera and seed:

| Geometry | Level meshes | Draw calls | Triangles |
| --- | --- | --- | --- |
| One mesh per texture | 11 | **117** | 3642 |
| 4×4-cell chunks | 158 | **255** | 3610 |

Chunking more than doubled the draw calls and removed 32 triangles. The arena is 32×32 cells; from the
spawn you can see most of it, so almost every chunk is in the frustum and the split only adds per-mesh
overhead.

The code keeps the chunk mechanism behind a `CHUNK` constant set to a single chunk, with the numbers in
the comment, and the roadmap records the rejection. The real cost is enemies — 117 calls for a level
that is 11 of them means the other ~106 are bodies and effects, so instancing (roadmap 45) is the
change worth making, not chunking.

**Guard** — the smoke test now asserts the arena stays under 160 draw calls, so this cannot be
re-introduced without the number moving.


## 1.22.0 — 2026-11-19

Tier A of the audit replan: seven quick wins, one of them a legal obligation.

**`NOTICE.md`** — Three.js is vendored under MIT. The file keeps its SPDX header but the full
permission text was not shipped; `NOTICE.md` now carries it, the version, the file paths and a
statement that every other asset is generated at runtime.

**Grenade on touch** — a seventh button in the touch grid. The feature shipped in 1.21.0 was
unreachable on a phone.

**Colour-blind cues finished** (roadmap 3) — the exit reads `EXIT OPEN ▸` or `EXIT SHUT ▪` in words as
well as colour, the keycard chip is ◇ or ◆, and the damage indicator is a triangle, not a hue.

**Doors animate** (roadmap 39) — they slide up over 400 ms instead of vanishing.

**Corpses persist** (roadmap 40) — bodies settle on the floor and stay; the last twelve are kept and
the oldest is cleared, so a wave leaves a room that looks like a fight happened in it.

**Blood pools** (roadmap 41) and **contact shadows** (roadmap 43) — a decal at the death position and a
soft quad under every enemy.

**Tests** — 6 new assertions: a body stays and stays listed, an enemy carries a shadow, doors animate,
the touch layout has a grenade button.


## 1.21.0 — 2026-11-19

**Grenades** (roadmap 24)
- `G` or right-click lobs one: 15 m/s with an upward toss, gravity 22, bounce 0.42 off walls and floor,
  a 1.7 s fuse and a 5 m blast for 110 damage. Three per run, shown as pips above the stamina bar.
- the fuse is the weapon: it passes by enemies without detonating, so a bounce around a corner works.

**Under the hood**
- `Projectiles` gained gravity and bounce, both zero for rockets and fireballs, so nothing else changed.
- a bouncing projectile reflects off the wall normal and slows to 60 % rather than exploding.


## 1.20.0 — 2026-11-19

**Sprint stamina** (roadmap 30)
- sprint is a resource now: 3.3 seconds of it, drained at 0.30/s, refilled at 0.20/s while moving and
  0.40/s standing still, starting 0.55 s after you stop. Below 2 % you walk. A thin bar under the health
  appears only when it is not full, and turns orange below a quarter.

**Crates** (roadmap 33, second half)
- one or two per room: solid cells you can shoot apart. 45 health, they block movement and line of
  sight through `circleBlocked`, and breaking one opens the cell and leaves debris. Unlike a barrel, a
  crate does not explode — it is cover, and cover that can be removed.

**Tests**
- 7 new assertions: sprint draining, refilling while still, a crate marking its cell, chipping,
  breaking, and the cell being recorded as open.


## 1.19.0 — 2026-11-19

**Stairs and raised platforms** (roadmap 38)
- a room can carry a dais: part of its floor is lifted 0.8–1.4 m and the one-cell band between the two
  levels is a stair that interpolates across the cell, drawn as three steps with risers. Height changes
  stop being a cliff you have to jump.
- `floorHeightAt` interpolates across a stair cell, so the player, the pickups and the enemies all
  follow the ramp rather than the cell's nominal floor.
- corridors are carved at floor 0 and can meet a raised platform at its edge, so a reconciliation pass
  turns any open cell that touches a platform into a stair.
- each platform is verified before it is accepted: if it leaves any open cell unreachable, that room's
  platform is rolled back and the level is generated without it.

**Test invariants**
- the step-height check now distinguishes a stair band (rise ÷ 3) from a ledge, and skips platform cells
  reached across one.
- the walk-the-flow-field test skips the sealed secret alcove, which is open floor by design and
  unreachable until broken.


## 1.18.0 — 2026-11-19

**Secret rooms** (roadmap 32)
- one per level: a wall cell on the edge of a room with a one-cell alcove carved behind it, sealed
  until you break it. It renders a shade off the surrounding rock, so it can be spotted up close and is
  invisible from across the room.
- 90 health, any weapon chips it, breaking it pays 250 and toasts `SECRET`. The alcove is open floor
  from then on, and `isBlocked` treats a broken secret as a doorway.

**Test invariants changed with it**
- the level suite asserts every open cell is reachable from the spawn. A sealed alcove breaks that by
  design, so secret cells are excluded — and a new assertion checks the secret is solid before and
  passable after, rather than quietly dropping the coverage.
- `raycastWalls` now returns the cell it hit, so a caller can tell what it shot.


## 1.17.0 — 2026-11-19

**Exploding barrels** (roadmap 33, partial)
- six per level, placed on open floor away from the spawn and the exit. 30 health each; a shot that
  passes through one takes it down, and then it goes: 70 damage falling off over 4 m to everything in
  range, including you, with a flash, a shake and the boom.
- hits are a point-to-ray test on the ground plane, not a distance from the wall behind it, so a barrel
  in the open is hit wherever it stands.

**Crouch finishes** (roadmap 31)
- enemies now aim at the crouched eye, so going low actually changes what they can hit.

**Not built:** crates that block. The item was "barrels that explode, crates that block"; only the first
half exists and the roadmap says so.


## 1.16.0 — 2026-11-19

**Crouch** (roadmap 31)
- `Ctrl` or `C` lowers the eye from 1.62 m to 1.05 m and takes 45 % off your speed, easing in over about
  80 ms. Sprint is disabled while crouched. The hit sphere is still a fixed cylinder — that half of the
  item is not built.

**Damage numbers** (roadmap 29)
- the damage a shot lands floats up from the hit point and fades over 0.7 s, larger and orange above 60.
  Off when reduced motion is on, because it is motion.

**Guarded**
- `damageNumber` needs a `Vector3` to project; a plain `{x, y, z}` is refused rather than throwing.


## 1.15.0 — 2026-11-19

**Weapon attribution**
- a kill records the weapon that made it, so the kill feed reads `IMP → CHAINGUN` and the game-over
  screen shows the favourite weapon with its count.

**Enemy barks** (roadmap 35)
- a growl the first time an enemy sees you, pitched per type: the warden low, the hound high, the imp
  and the grunt between. Positioned and occluded like every other sound.

**Two audio bugs found on the way**
- `play(name, at)` took no options, so `play('step', { gain })` passed an option object where a
  position was expected, and `panGain` turned it into `NaN` — footsteps were silent even after being
  wired in 1.14.0. `play` now takes `(name, at, opts)` and `spatialOut` refuses a position without
  numeric `x`/`z`.
- the step sound ignored its gain option entirely.

**Feed**
- `hud.feed` used `prepend` and `lastChild.remove()`, neither of which the test DOM has. Falls back to
  append and `removeChild`.


## 1.14.0 — 2026-11-19

**Chaingun** (roadmap 23)
- a fourth weapon on `4`: 9 damage, 0.075 s cooldown once spun up, wide spread, shared bullet pool.
  The cooldown starts at 2.6× and reaches its floor after 0.55 s of held fire, so it rewards staying on
  target rather than tapping. Its own view model and its own synthesised report.

**Sound occlusion** (roadmap 18)
- a positioned sound with no line of sight to the player now runs through a 640 Hz lowpass at 55 % gain.
  `main.js` installs the test; without it every sound is direct.

**Kill feed** (roadmap 28)
- enemy name and outcome in the corner, five rows, fading after three seconds.

**A bug from 1.12.0, found while wiring occlusion**
- footsteps were never connected: `player.onStep` was implemented and never assigned in `main.js`. The
  suite passed because it attached its own callback, which tested the mechanism rather than the
  integration. Now wired, and the smoke test asserts the game sets it.


## 1.13.0 — 2026-11-19

**Ambient drone** (roadmap 36)
- three detuned sawtooths under a lowpass, 0.07 Hz LFO on the gain, 0.028 peak: present, never noticed.
  Starts with a run, fades out over 0.8 s on pause, death and zone clear.

**Pickup glow** (roadmap 34)
- every pickup carries a soft radial sprite halo, so it reads in the dark. Falls back to a flat sprite
  when there is no 2d canvas context.

**Accessibility** (roadmap 3, partial)
- the keycard chip is ◇ when you do not have it and ◆ when you do, so it reads in greyscale. The exit
  compass and the damage arrow were already directional, not colour-only.

**Small fixes**
- alt-tab to another window pauses the game; `visibilitychange` alone missed it (roadmap 15)
- `Esc` closes the settings screen instead of doing nothing (roadmap 16)

**Stub**
- `Sprite`, `SpriteMaterial` and `CanvasTexture` added, which the halo needs. `check-stub` caught the gap
  before the suites did.


## 1.12.0 — 2026-11-19

Back to the game after the fleet work. Four roadmap items.

**Footsteps** (roadmap 12)
- a bandpass-filtered noise burst on each half cycle of the head bob, quieter when walking, silent
  when standing. The player's own feet, synthesised like everything else.

**Accuracy and damage on the game-over screen** (roadmap 27)
- shots fired and hit percentage, tracked in `weapons.js`; damage taken, tracked through
  `player.onDamage`. Favourite weapon is not built.

**Top five runs** (roadmap 11)
- a table of the five best runs by score, with wave and kill count, kept in `localStorage` under
  `hellgate.runs`. The run you just finished is highlighted.

**Copy seed** (roadmap 10)
- a button under the seed that copies a linkable `?seed=` URL, with a clipboard fallback for browsers
  without `navigator.clipboard`.

**Tests**
- 6 new assertions: accuracy arithmetic, the step callback firing while walking, the table capped at
  five and sorted by score.

**Screenshots** regenerated: 11 frames, 297 KB total after WebP conversion.


## 1.11.2 — 2026-11-19

**`neon-engine` went from 2 to 86 documented exports**
- every exported symbol in that repo now carries a JSDoc block: 86 of 86, up from 2. Its `docs`
  workflow switched from `--warn` to hard mode, so the next export without a block fails its build.
- 34 files changed, 252 lines added, nothing else touched. Every module still parses; the repo's own
  `tests`, `docs` and `meta` workflows are all green.

That closes the last gate running in warn mode anywhere in the fleet.


## 1.11.1 — 2026-11-19

**The two fleet drifts, resolved**
- `saga-vn-engine`: `VERSION` said 1.0.1 while `CHANGELOG.md` documented 1.0.2, and both version badges
  still read 1.0.1. Version and badges now follow the changelog.
- `aethelgard-rpg-engine`: `VERSION` 1.0.1 against a newest heading of 1.0.0. That is a version bumped
  for work in progress, not a release the changelog forgot, so the tool now separates the two: behind
  the changelog is a failure, ahead of it is a warning. Both repos run in hard mode.

All eight sibling repos are now green in hard mode, with no `--warn` left in the fleet.


## 1.11.0 — 2026-11-19

**A portable metadata gate, and two real drifts found with it**
- `tools/check-meta.mjs`: `VERSION` vs the newest `CHANGELOG` heading, `package.json` vs `VERSION`,
  `LICENSE` vs the licence the README names. Absent files are skipped; a missing `VERSION` is a
  warning, not a failure. Wired into CI as step 14 and pushed to all eight sibling game repos.
- it found two genuine mismatches in the fleet: `saga-vn-engine` ships `VERSION 1.0.1` with a
  `CHANGELOG` heading of `1.0.2`, and `aethelgard-rpg-engine` ships `VERSION 1.0.1` with `1.0.0`.
  Both run in `--warn` mode until those are resolved; the other six run in hard mode.

**Fixed while making it portable**
- the licence comparison read the shields.io URL out of the README and reported `PolyForm
  Noncommercial` against `PolyForm%20Noncommercial%201.0.0-2e7d32` — eight false positives. Both sides
  are now normalised to a licence family.
- `--warn` was referenced by two workflows before it existed; the tool grew the flag rather than the
  workflows growing a workaround.


## 1.10.3 — 2026-11-19

**The JSDoc gate reached exactly one sibling, and that is the honest answer**
- `check-docs.mjs` gained `--src` and `--warn`, and a fix for a false green: with no exports found it
  reported 0/0 as 100 %. It now says so and fails in hard mode.
- of the eight sibling game repos, only `neon-engine` is an ES-module codebase (36 files with
  `export`). The other seven are IIFE or single-file scripts, so an export-level rule does not apply.
- `neon-engine` now runs it in warn mode: 2 of 86 exports documented (2 %). The number is the point;
  the badge stays green until the coverage earns a rule.


## 1.10.2 — 2026-11-19

**The link gate is in all eight sibling game repos**
- `Scrap-and-Gun`, `retro-strike`, `app-story-engine`, `saga-vn-engine`, `neon-engine`,
  `aethelgard-rpg-engine`, `game-kit`, `eon-commando` — every one has `tools/check-links.mjs` and a
  `links` workflow, and every one is green.
- `eon-commando` needed a new `--ignore 'src/*'` flag: its `src/*.html` are build fragments that carry a
  doctype but are concatenated into `index.html`, so their relative paths resolve against the output
  rather than against where they sit.

Four of those repos had no CI before this. The workflows pin `actions/checkout` and
`actions/setup-node` by SHA and set `permissions: contents: read`.


## 1.10.1 — 2026-11-19

**Link checker, and a fleet result**
- `tools/check-links.mjs`: every local `href` and `src` in every page must resolve. Wired into CI as
  step 13. It resolves root-absolute paths against the domain root, a project sub-path and `docs/`,
  which is what makes it portable.
- run against the eight sibling game repos: seven pass cleanly. `eon-commando` fails on
  `src/00_head.html → icon-192.png`, which is a build fragment concatenated at build time, not a
  broken page — a false positive the tool cannot see past.
- piloted into `Scrap-and-Gun`, the closest genre sibling and the only one with no CI at all. Its
  `links` workflow is green.

**Fixed while making it portable**
- `upi:` and every other scheme was treated as a local path; the check now skips anything with a
  scheme.
- root-absolute links to a project Pages root were reported broken in three repos before the
  multi-base resolution.


## 1.10.0 — 2026-11-19

Everything here came from the fleet comparison: five things the sibling game repos do better, ported.

**Fixed timestep** (from `game-kit`)
- the simulation advances in 1/60 s steps whatever the display does, so 30 fps and 144 fps produce the
  same game. The backlog is capped at four steps so a stalled tab cannot simulate a minute at once.
  Closes roadmap item 57.

**Save round-trip and zone completion** (from `aethelgard-rpg-engine/tools/verify.js`)
- the smoke test now saves a run, reloads the page, asserts Continue appears with the wave in its
  label, resumes, and checks the score and wave came back. It also plays a zone to the end and asserts
  the progress record.

**Dead-code audit** (from `aethelgard-rpg-engine/tools/static-audit.py`)
- `tools/audit-dead.mjs`: exports nothing imports, and constants declared twice with different values.
  Its first run found two dead exports (`ceilHeightAt`, `STORY_PANELS`), now deleted, and one false
  positive (`isBlocked`, used by the level suite) that exposed the tool not scanning `tests/`.

**PAGES.json guard** (from `neon-engine/tests/pages.cjs`)
- `tools/check-pages.mjs`: every path declared in `PAGES.json` still exists, so a rename cannot quietly
  404 the live site. The file protected nothing before this.

**Onboarding and balance docs** (gap against `neon-engine`)
- `documentation/getting-started.md` and `documentation/balance.md`. The second says plainly that no
  constant in this repository is backed by playtest data.

**CI**
- 10 steps to 12.


## 1.9.1 — 2026-11-19

**Unattended play harness**
- `tools/soak.mjs`: a bot that aims at the nearest enemy, follows the flow field to it, fires only with
  line of sight and switches weapons when one runs dry. 90 seconds per seed per difficulty.
- it is documented as a stability check, not a balance measurement: the bot kills slowly because it
  fires through a shotgun's spread at range, and its kill count says more about the bot than the game.

**What the investigation found**
- the first version fired with no line-of-sight check and every pellet ate a wall; the second walked
  straight at the target and stuck on walls. Both were bot defects, not game defects — the hitscan
  path is already covered by the gameplay suite.


## 1.9.0 — 2026-11-19

**Branching terminals**
- two terminals ask a question with two answers: 20 health for a relic or 150 score; open the
  maintenance shaft and get three imps, or leave it shut.
- every level is guaranteed to hold at least one, so the mechanic cannot be missed by luck of the draw.
- an answer is recorded by terminal title: `resolveChoice()` returns early on a second call and the
  panel shows what you chose instead of the buttons.

**Documented limit**
- Firefox and WebKit cannot run here: Playwright's builds need `libXcursor`, `libgtk-3` and `libgdk-3`,
  and the sandbox has no package manager. Recorded in `documentation/testing.md` rather than left as a
  vague "not tested".

**Tests**
- 6 new assertions: a choice terminal opens, the reward lands, the answer is recorded, a repeat pays
  nothing, and the ambush answer spawns enemies.


## 1.8.0 — 2026-11-19

**Trinkets**
- six passive trinkets drop from kills at 12%: damage, max health, energy regeneration, movement
  speed, starting armour, and 2 health per kill.
- three fit in the belt; a fourth is sold for 100 score rather than displacing anything.
- effects are summed by `sumEffects()` and folded into `recomputeStats()`, so trinkets compose with the
  class, the between-zone upgrades and the timed pickups. The belt is part of the run save and shown
  in the status panel.

**Tests**
- 8 new assertions: the table, the slot count, effect summing, each effect reaching the player, a
  fourth drop not fitting, and spares paying score.


## 1.7.0 — 2026-11-19

**The warden's phases**
- three phases at two thirds and one third of health. Phase 2 shortens the cooldown and widens the
  slam; phase 3 shortens it again and summons two hounds, once. The health bar carries the phase
  number and the chest core brightens with it.

**Upgrades between zones**
- clearing a zone offers three of six upgrades; taking one stacks it for the rest of the session:
  damage, max health, energy regeneration, power cooldowns, movement speed, starting armour.
- `recomputeStats()` rebuilds the class's base numbers from scratch, so upgrades compose cleanly with
  the class and the timed pickups. Reset when a campaign starts at the first zone.

**Tests**
- 12 new assertions: the three phases, the faster cooldown, the summon and that the summons are
  hounds; each upgrade's effect on the base numbers.


## 1.6.1 — 2026-11-19

**Documentation**
- every one of the 52 module-level exports now carries a JSDoc block: 0% to 100%
- `documentation/api.md`, one line per export, generated from those blocks
- `tools/check-docs.mjs` fails the build when an export loses its doc block, wired into CI next to
  the claim checker

The checker had a bug worth recording: its own header comment contained a closing delimiter, which
ended the comment early and made the file unparseable. The tool that enforces comments was broken by a
comment.


## 1.6.0 — 2026-11-19

**Status panel**
- `Tab` freezes the game and shows class, health, armour, energy, the three weapons with ammo and
  which is equipped, the three powers with cost and cooldown, live buff timers, and the zone's wave,
  score, kills and relics. Reads from the same objects the HUD does.

**Continue**
- a run is written to `localStorage` at the start of every wave: zone, seed, wave, score, kills,
  class, health, armour, ammo. The title screen offers it as Continue, labelled with the zone, wave
  and score. Cleared on death and on clearing a zone.

**Tests**
- 10 new assertions: the save exists and carries zone, wave and score; resuming restores state and
  wave; the panel opens with content and closes; the save clears. Smoke covers the panel and the save
  in a real browser.


## 1.5.1 — 2026-11-19

Touch controls, fixed. They were present but effectively unusable on a phone.

- the overlay is now shown only while playing; on the title, intro, class and map screens it was
  either hidden behind them or in the way of their buttons
- the layout fits a phone: below 620 px the HUD bar shrinks to the viewport width, the power bar
  lifts above it, and the six buttons become two rows of three. Below 420 px of height everything
  scales to the corners. Both use `env(safe-area-inset-bottom)`.
- pointer lock is never requested on a touch device, and losing a lock no longer pauses the run —
  rotating the phone was dropping the lock and freezing the game
- the companion drone was the size of the player's head at 1.2 m; it is smaller and sits behind the
  shoulder, and hides if it would sit on the camera

Verified by driving the real pages at 390x844 and 844x390 in Chromium with touch emulation: the
overlay appears, every control is inside the viewport, and dragging the stick moves the player.


## 1.5.0 — 2026-11-19

**Terminals**
- three readable terminals per zone, on a post with a green screen. Walk within 2.2 m, press V, get a
  two-paragraph note from whoever was here before. First read pays 75.
- a prompt appears when one is in reach; the screen dims once read

**Timed pickups**
- damage (x1.5) and haste (x1.25) pickups, 20 seconds each, shown as HUD chips. Multipliers are
  recomputed from the class base every frame, so they stack and expire cleanly.

**Fix**
- releasing the pointer lock on purpose (reading a terminal, clearing a zone) could pause the game a
  frame later, because the pointerlockchange event arrives after the state has already returned to
  playing. A lock-intent flag now distinguishes an intentional release from the player pressing Escape.
  Found by the browser smoke test, which failed to cast a power immediately after closing a terminal.


## 1.4.0 — 2026-11-19

**The warden**
- a real boss for the last zone: 620 hp, 3 m tall, a glowing chest core and a health bar across the
  top of the screen. Roadmap item 22.
- two alternating attacks: a ground slam that hits everything within 5 m, and a three-ball fireball
  spread. Both telegraphed for 0.7 s.
- spawns on the final wave of The Throne alongside three trash enemies

**Performance**
- prop LOD: the grass mesh hides itself when the adaptive resolution drops below a 1.0 pixel ratio,
  because grass is the cheapest visual and the most instances

**Tests**
- 12 new assertions: the warden spawns, its health, the manager's boss accessor, the health bar
  showing, naming and hiding, and the grass LOD switch


## 1.3.0 — 2026-11-19

The RPG pass: classes, powers, a companion, five zones, a cold open and touch controls.

**Systems**
- three classes (marine, ranger, warden) setting HP, armour, speed, damage, energy, starting weapon
  and power set
- five powers on an energy pool with cooldowns: dash, shockwave, ward, volley, bulwark. Bound to
  Q, E and R, with an energy bar and per-slot cooldown fill in the HUD
- companion drone: follows, engages what it can see for 7 damage every 0.85 s, goes dormant past 26 m
- five zones with palettes, props and objectives; clearing one unlocks the next; progress and best
  score per zone in localStorage
- relic side objective in every zone: 150 each, 400 for the set
- cold open: four typed panels over a camera flythrough of the level you are about to play
- instanced trees, rocks and grass; animals that wander and bolt
- mobile touch controls: virtual stick, look-and-tap-to-fire, buttons for jump, powers and weapon

**Verification**
- the smoke test now walks title -> intro -> class -> play in a real browser and asserts powers,
  energy, props, instancing, the companion and the relics exist; a power spends energy and starts its
  cooldown
- 4 new screenshots: cold open, class select, world map, grove


## 1.2.0 — 2026-11-19

**Gameplay**
- hounds: a third enemy type from wave 4. Fast, melee only, 22 hp, so one shotgun blast kills it and
  the pistol cannot keep up with a pack. Roadmap item 21.
- difficulty presets: easy, normal and hard, multiplying enemy hp, damage and wave size. Persisted
  with the other settings. Roadmap item 25.
- score: kills, a wave bonus and a shrinking time bonus, shown in the HUD and recorded as the best
  run. Roadmap item 26.

**Tests**
- 12 new assertions: wave size and enemy hp across the three presets, hound composition and speed,
  score awarded on wave clear, HUD score, best-run score.


## 1.1.0 — 2026-11-19

**Gameplay**
- BFS flow-field navigation: one field for every enemy, rebuilt three times a second from the player's
  cell. Enemies walk around walls instead of leaning on them. Roadmap item 17, the last known gameplay
  defect.

**Verification**
- the smoke test now exercises audio in a real browser: AudioContext creation, master gain against the
  volume setting, a spatialised play call, and mute/unmute. The Node suites cannot touch this path.
- path-following assertions per seed: from twelve cells, following the field always ends at distance 0

**Performance**
- Lighthouse pass on the landing page: map SVG 96 KB of `<rect>` to 6.4 KB of paths, the blend-mode
  grain layer replaced, two contrast failures fixed. Accessibility 91 to 100, LCP 2.0 s to 1.2 s.


## 1.0.0 — 2026-11-18

First public release.

**The game**
- 2.5D sector world: 40×40 grid, per-cell floor and ceiling heights, canvas-painted textures on all
  surfaces, merged into five draw calls
- seeded level generation — rooms, L-shaped corridors, varied ceiling heights, raised ledges, a sealed
  exit room with up to three doors
- three weapons: hitscan pistol, 8-pellet shotgun with damage falloff, rocket launcher with splash,
  light and screen shake
- two enemies on one FSM: imps (telegraphed fireballs) and grunts (hitscan, melee), with grid
  line-of-sight, wandering, pain flinch, gibs and per-enemy hit flash
- wave loop with difficulty scaling, procedural pickups, and a keycard gate from wave 3
- HUD: Doom-style face, damage-direction arrows, vignette, crosshair hit marker, weapon sway
- title / pause / game-over screens, best run in `localStorage`, `?auto=&seed=&wave=&cam=` URL hooks

**Player settings (roadmap Tier 0)**
- settings screen: mouse sensitivity, FOV, volume, mute, reduced motion — persisted in `localStorage`
- reduced motion disables screen shake and weapon bob
- `M` mutes, `F` toggles fullscreen, the mouse wheel cycles weapons
- restart from the pause menu
- pickups are refused when they would be wasted (full health or armour)
- the seed is written into the URL so a run is linkable and reload-safe
- exit compass: a chevron points at the pad once the wave is cleared
- weapons dip out of frame and rise back on a swap

**Look and sound (transfers from castle-valley)**
- light and shade baked once into vertex colours: a fixed sun on every wall face, a floor-to-ceiling
  gradient, and corner AO where two walls meet. No shadow map, no extra draw call
- ACES filmic tone mapping, so muzzle flashes and the exit pad compress instead of clipping
- adaptive resolution: the pixel ratio drops toward 0.7 when frames exceed 21 ms and climbs back
  under 13.5 ms, capped at 1.5
- spatialised audio: `panGain()` computes stereo pan and distance gain per sound; enemy pain, death,
  shots and fireballs are heard from where the enemy stands, and every play is detuned slightly

**Engine work**
- vendored Three.js r187 (up from r160), verified headlessly against the real library
- anisotropic filtering, shared enemy geometry, per-run GPU disposal, raw pointer-lock request
- pooled effects: 600 particles, 16 tracers, 40 decals, 4 lights, zero allocation per shot
- debug overlay (`\``) with fps, draw calls and triangles

**Quality**
- three headless suites: 47-seed generator invariants, winding/normal validation over ~14k triangles,
  and a full gameplay run including a 2000-frame random-input soak
- `tools/check-claims.js`: 12 assertions tying every README number to the code that produces it
- `tools/smoke.mjs`: boots both real pages in headless Chromium and fails on any console error
- CI runs syntax check, suites, claims and smoke, with actions pinned by SHA and read-only permissions
- fleet conventions adopted: `SECURITY.md`, `PRIVACY.md`, `VERSION`, `PAGES.json`, `.editorconfig`,
  `CODE_OF_CONDUCT.md`, `404.html`, `robots.txt`, `sitemap.xml`
- support table uses the real handles instead of invented sponsor tiers
- landing page, documentation, and an enhancement roadmap

**Fixed during the build**
- HUD top bar printed `WAVE WAVE 2` (labels were written twice)
- rocket splash kills were not credited to the kill counter
- switching weapons inherited the previous weapon's full cooldown
- waves stacked enemies instead of starting from an empty arena
- a corridor running parallel to the exit room produced a wall of ten doors; doors now only appear
  where a corridor actually turns into the room, and the rest of the boundary is sealed behind rock
  with a reachability check
- the geometry test itself was silently passing — `geometry.index` is a `BufferAttribute` in real
  Three.js, not an array
