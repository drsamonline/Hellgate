# Enhancement roadmap

Everything I would do next, ordered so that the cheapest, highest-value work is at the top. Nothing
here is implemented; it is a plan, not a changelog.

Seventeen items shipped — marked **✓ shipped** below.

**Tags.** `S` ≈ under 30 min · `M` ≈ an afternoon · `L` ≈ a weekend · `XL` ≈ architectural.
Impact is judged against *how much better the game feels to play*, not how clever the code is.

---

## Tier 0 — Quick wins (do these first)

Cheap, low-risk, immediately noticeable. All `S`.

1. **Settings that persist** — mouse sensitivity, FOV (70–100) and a reduced-motion toggle in a small panel, saved to `localStorage` next to the best run. `main.js` · S · high — ✓ shipped
2. **Reduced motion** — one checkbox that disables screen shake, weapon bob and the vignette pulse. The landing page already honours `prefers-reduced-motion`; the game should too. `effects.js` · S · high (accessibility) — ✓ shipped
3. **Colour-blind-safe palette** — the damage arrow, keycard chip and "EXIT OPEN" state are all colour-coded. Add a shape or icon difference as well as a hue change. `hud.js` · S · high (accessibility) — ◑ keycard chip reads ◇/◆ now; the exit compass and damage arrow are already directional
4. **Volume + mute** — `M` to mute, a gain slider, persisted. `audio.js` · S · medium — ✓ shipped
5. **Weapon cycle on the wheel** — `wheel` already means nothing in a pointer-locked canvas. `main.js` · S · medium — ✓ shipped
6. **Restart from the pause menu** — currently you must die or reload to reseed. `main.js` · S · medium — ✓ shipped
7. **Fullscreen toggle** — `F` calls `requestFullscreen`; pointer lock works better fullscreen anyway. `main.js` · S · medium — ✓ shipped
8. **No wasted pickups** — health and armour are consumed even at 100; refuse the pickup (with a click) instead of eating it. `main.js` · S · medium — ✓ shipped
9. **Seed in the URL** — `history.replaceState` on start so a run is linkable and reload-safe; the game already reads `?seed=`. `main.js` · S · medium — ✓ shipped
10. **Copy-seed button on the game-over screen** — "you died on this seed, try again / share it". `index.html` + `main.js` · S · medium — ✓ shipped
11. **Top-5 best runs** — one best run is a weak hook; keep a small table of waves/kills/seed/date. `main.js` · S · medium — ✓ shipped
12. **Footsteps** — a filtered noise burst on each bob cycle, quieter when walking. Big cheap presence win. `player.js` + `audio.js` · S · high — ✓ shipped
13. **Exit compass** — when the exit opens, a small HUD arrow points at it; finding the pad in a 10-room arena is currently the least fun part of a wave. `hud.js` · S · high — ✓ shipped
14. **Weapon raise/lower on switch** — a 120 ms dip sells the swap. `weapons.js` · S · medium — ✓ shipped
15. **Pause on window blur** — `visibilitychange` covers tab switches, not alt-tab to another window. `main.js` · S · low — ✓ shipped
16. **`Esc` closes the settings panel before it pauses** — small correctness fix once settings exist. `main.js` · S · low — ✓ shipped

## Tier 1 — Small (an afternoon each)

17. **Enemy navigation** — replace direct steering with a flow field over the grid (BFS from the player, recomputed every ~0.5 s, shared by all enemies). This is the single biggest gameplay fix: enemies currently stall on long walls. `level.js` + `enemies.js` · M · very high — ✓ shipped
18. **Sound occlusion** — attenuate enemy sounds by line of sight, so a grunt behind a wall is muffled. `audio.js` · M · high — ✓ shipped (lowpass at 640 Hz, −55 % gain)
19. **Directional audio** — a `PannerNode` per enemy, or at least a left/right gain based on the angle to the camera. `audio.js` · M · high — ✓ shipped
20. **Hit-direction indicator on enemies** — a brief arc showing where damage came from, so you can find the imp shooting you from behind. `enemies.js` · M · high — ✓ shipped (`hud.damageFrom`)
21. **A third enemy type** — a fast melee "hound" that dies in one shotgun blast. Forces weapon switching. `enemies.js` · M · high — ✓ shipped
22. **Boss wave every 5th wave** — one large, slow, high-HP enemy with a telegraphed area attack. Gives a run a shape. `enemies.js` · M · high — ✓ shipped
23. **Weapon 4: chaingun** — sustained fire, wide spread, spin-up. Exercises the ammo/pickup path and rewards holding a lane. `weapons.js` · M · medium — ✓ shipped
24. **Grenade / alt-fire** — a right-click with a bounce and a fuse. `projectiles.js` · M · medium
25. **Difficulty presets** — Easy/Normal/Hard as multipliers on enemy hp, damage and count. One object, three numbers. `main.js` · S · high — ✓ shipped
26. **Wave timer + score** — time bonus per wave, score = kills × wave × accuracy. Turns a survival loop into a score attack. `main.js` · M · high — ✓ shipped
27. **Accuracy + damage stats on the game-over screen** — shots fired, hit percentage, damage taken, favourite weapon. `main.js` · S · medium — ✓ shipped
28. **Kill feed** — "IMP → ROCKET" lines in the corner. Cheap personality. `hud.js` · S · low — ✓ shipped
29. **Damage numbers** — floating text on hits, toggleable. Divisible, but players love them. `effects.js` · M · low — ✓ shipped (off with reduced motion)
30. **Sprint stamina** — or explicitly not: the current infinite sprint is a design choice. Decide and document it. `player.js` · S · low
31. **Crouch** — lowers the eye and the hit sphere; makes cover meaningful. `player.js` · M · medium — ✓ shipped (enemies now aim at the crouched eye)
32. **Secret rooms** — a wall texture that differs by one pixel, and a room behind it. Pure Doom. `level.js` · M · medium — ✓ shipped (one per level, 90 hp, a shade off the rock)
33. **Destructible props** — barrels that explode, crates that block. `level.js` + `projectiles.js` · L · medium — ✓ shipped (barrels; crates not built)
34. **Pickup bob + glow** — pickups already rotate; add a small point light or a sprite halo so they read in the dark. `main.js` · S · medium — ✓ shipped (sprite halo)
35. **Enemy audio barks** — a synthesised growl on sight, a death cry per type. `audio.js` · S · medium — ✓ shipped (bark on sight, pitched per type)
36. **Ambient drone** — a low, slowly modulated pad so silence is not dead air. `audio.js` · S · medium — ✓ shipped

## Tier 2 — Medium (a weekend each)

37. **Sector portals / real 2.5D** — the current model is one floor and one ceiling per cell. Storing per-cell floor *and* ceiling polygons with portal edges would allow true multi-level rooms, stairs and catwalks. This is the big one. `level.js` + `levelmesh.js` · XL · very high
38. **Stairs and ramps** — a stair cell type with 2–3 sub-steps, so height changes stop being a hard 0.5 m cliff. `level.js` · L · high
39. **Door animation** — doors currently pop out of existence. Slide them up over 400 ms with a sound. `levelmesh.js` · M · high
40. **Enemy corpses persist** — leave the last N bodies instead of sinking them all. Needs per-enemy material cloning for a fade (already half-done for the hit flash). `enemies.js` · M · medium
41. **Blood pools on the floor** — a decal at the death position, oriented to the floor normal. `effects.js` · S · medium
42. **Bullet-hole decals with correct orientation on every surface** — already works on walls; verify floors and ceilings and cap by surface type. `effects.js` · S · medium
43. **Shadow or fake contact shadow under enemies** — a dark blob decal that follows each enemy; makes them feel grounded without a shadow map. `enemies.js` · M · high
44. **Post-processing** — a cheap bloom for muzzle flashes and explosions, plus a slight vignette and colour grade. UnrealBloomPass needs the addons build; a hand-written single-pass bloom is lighter. `main.js` · L · high
45. **Instanced enemies** — one `InstancedMesh` per body part across all enemies, with per-instance matrices and colours. Would cut ~12 draw calls per enemy to 12 per *wave*. `enemies.js` · L · high
46. **Chunked level meshes** — split the merged geometry into 4×4-cell chunks so frustum culling actually removes geometry. Trades 5 draw calls for ~25. `levelmesh.js` · M · medium
47. **Texture atlas** — one 256×256 atlas for all surfaces, so the level is one draw call instead of five. `textures.js` · M · medium
48. **Weapon sprites instead of meshes** — a 2D canvas sprite per weapon, Doom-style, with frames for idle/fire. Cheaper and more authentic than boxes. `weapons.js` · M · medium
49. **Better enemy models** — same box budget, more silhouette: hunched imps, a grunt with a visible backpack and muzzle. Cheap art direction. `enemies.js` · M · medium
50. **Animated doors and lifts as sectors** — a lift that moves between floor heights on a trigger. `level.js` · L · medium
51. **Save/resume a run** — serialise the wave, seed, player state and remaining enemies. Nice for long sessions. `main.js` · L · low

## Tier 3 — Large (architectural)

52. **Real-time shadows** — a single directional shadow map with tight bounds, or baked vertex AO. The current lighting is flat ambient, which is why rooms read as boxes. `main.js` · XL · high
53. **Lightmap / baked lighting per sector** — a per-cell light value baked at generation and written into vertex colours; the cheapest way to get contrast and mood. `levelmesh.js` · L · high — ✓ shipped
54. **Collision broadphase** — a uniform grid or BVH for enemies and projectiles instead of scanning the list. Only matters past ~50 enemies, but that is where this is headed. `enemies.js` · L · medium
55. **Object pooling for enemies** — reuse meshes instead of building and disposing per wave. `enemies.js` · L · medium
56. **Deterministic replay** — record the input stream + seed, replay a run exactly. Turns bug reports into test cases and enables ghost runs. `main.js` · L · medium
57. **Split the game loop from the renderer** — fixed-timestep simulation with an interpolated render. Removes the dt-dependent behaviour that makes 30 fps and 144 fps feel different. `main.js` · L · medium
58. **Mobile/touch controls** — a virtual stick and a look area. Pointer lock does not exist on touch, and the fallback path is already there. `main.js` · L · medium — ✓ shipped

## Tier 4 — Research / stretch

59. **WebGPU renderer** — Three.js ships a WebGPU backend; the geometry is simple enough that a port is mostly a renderer swap. Measure before committing. `main.js` · XL · low
60. **Co-op over WebRTC** — two players, one arena, host-authoritative enemies. Huge scope, big payoff. `main.js` · XL · medium
61. **A campaign of hand-tuned seeds** — ten seeds with verified, escalating layouts, plus a level-select screen. Cheap to produce once the generator is frozen. `level.js` · M · medium
62. **Procedural audio** — generate the ambient bed and enemy barks from a small grammar instead of hard-coded calls. `audio.js` · L · low
63. **A level editor** — the sector model is a grid; a paint-the-cells editor that exports a seed-independent map is a week of work and makes the project a platform. `tools/` · XL · medium

---

## Explicit non-goals

Written down so they do not creep in:

- **A build step.** No bundler, no transpiler. The moment it needs `npm run build` to run locally, the
  "open the file and read it" property is gone.
- **External art or audio.** The whole point is that there is none. A texture is 64 lines of canvas
  code or it does not exist.
- **A monetisation loop.** No ads, no telemetry, no accounts, no paid tier.
- **Mobile-first redesign.** Touch support is a nice-to-have; the game is designed for a keyboard and
  a mouse, and pretending otherwise would compromise the aiming.
- **Multiplayer as a first-class mode.** Co-op (60) is a stretch goal, not a plan.

## How to pick something

If you want to contribute and do not know where to start: take anything in Tier 0, or item **17**
(flow-field navigation). Both are self-contained, both are testable with the existing harness, and
both make the game measurably better. Read [documentation/testing.md](documentation/testing.md) first —
the geometry suite will catch mistakes that look fine in a diff.
