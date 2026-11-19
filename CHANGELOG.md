# Changelog

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
