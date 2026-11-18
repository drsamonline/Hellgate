# Changelog

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
