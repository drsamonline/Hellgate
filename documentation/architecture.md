# Architecture

HELLGATE is a browser game with no build step: ES modules loaded through an import map, one HTML
page per entry point, and Three.js vendored locally.

## Entry points

| File | Purpose |
| --- | --- |
| `index.html` | Landing page. Static, no game code. |
| `play/index.html` | The game. Markup, HUD, screens, CSS, import map. |
| `play/src/main.js` | Boot, input, state machine, wave flow, render loop. |

`play/index.html` holds the import map:

```html
<script type="importmap">
{ "imports": { "three": "./vendor/three.module.js" } }
</script>
```

Everything else is a relative import. Three.js is vendored, not pulled from a CDN, so the demo
works offline and the version cannot drift under the game.

## Module map

```
                        main.js
        ┌──────────┬────────┼─────────┬──────────┬──────────┐
        ▼          ▼        ▼         ▼          ▼          ▼
    level.js   player.js  weapons.js enemies.js projectiles.js hud.js
        │          │        │         │          │
        ▼          │        ▼         ▼          ▼
   levelmesh.js    │     effects.js  (uses level.js for LOS + collision)
        │          │        │
        ▼          ▼        ▼
   textures.js  (Three.js)  audio.js
        │
        ▼
     rng.js
```

## The campaign table

`story-levels.js` is data, not logic: 32 rows of `id`, `seed`, `shape` and `objective`, in four acts of
eight. It imports `world.js` for the zone lookup and nothing else.

| Function | Does |
| --- | --- |
| `storyLevel(n)` | the row for a 1-based level number, or null |
| `storyLevelZone(row)` | the row dressed on its base zone: seed, shape, objective, title. The zone **id** is kept, so unlocks, progression and the save format are untouched |
| `OBJECTIVE_TYPES` | `reach`, `clear`, `survive`, `relics` — a row naming a fifth fails `tests/test-level.mjs` |

`?level=N` on the game URL resolves a row and starts it. `game.storyLevel` carries the number for the
status panel and for debugging.


`level.js` imports **only** `rng.js`. No Three.js, no DOM. That is deliberate: it is the file with
the most logic worth testing, so it must run in Node.

## Frame lifecycle

```
requestAnimationFrame
  └─ dt = min(clock.getDelta(), 0.05)        # clamp after a tab switch
     if state === 'playing':
        player.look(accumulated mouse delta)  # consumed and zeroed
        player.update(dt, input, level)       # move, collide, gravity, camera
        weapons.update(dt, player)            # cooldowns, sway, recoil decay
        if input.fire: weapons.tryFire(ctx)   # raycast / spawn projectile
        enemies.update(dt, player, projectiles)
        projectiles.update(dt, player, enemies)
        effects.update(dt)                    # particles, tracers, decals, lights
        updatePickups(dt)
        checkWave()                           # exit state, next wave
        hud.update(dt, player, weapons, state)
        if !player.alive: gameOver()
     render()
     updateDebug(dt)                          # only when the overlay is on
```

The loop keeps rendering while paused or dead, so the overlay screens sit on top of a frozen frame
instead of a black canvas.

## Render pipeline

Two scenes, two cameras, one renderer with `autoClear = false`:

```js
renderer.clear();
renderer.render(scene, camera);          // world
const info = renderer.info.render;       // draw calls for this pass
renderer.clearDepth();
renderer.render(weaponScene, weaponCamera); // view model, drawn on top
```

The weapon lives in its own scene so it can never clip into a wall — the classic FPS trick. The
debug overlay sums both passes because `renderer.info` resets on every `render()` call.

## State machine

```
title ──start(seed)──▶ playing ──Esc / pointer-lock lost / tab hidden──▶ paused
                         │  ▲                                               │
                         │  └──────────────resume──────────────────────────┘
                         │
                         └──health 0──▶ dead ──retry──▶ playing
                                    └──menu───▶ title
```

- `startGame(seed)` builds a whole run: level, meshes, effects, enemies, projectiles, pickups.
- `buildRun` calls `disposeRun()` first, which disposes every non-shared geometry and material from
  the previous scene. Cached materials and shared enemy geometry are marked `userData.shared` and
  survive.
- Pausing releases pointer lock; resuming re-requests it from the click that resumed.

## Data ownership

| Data | Owner | Notes |
| --- | --- | --- |
| Level grid, doors, spawn, exit | `level.js` result object | plain data, no Three.js |
| Meshes, materials | `main.js` (`scene`, `levelMeshes`) | rebuilt per run, cached materials reused |
| Player state | `Player` instance | created once, `reset()` per run |
| Ammo, health, armour | `Player` | HUD reads, never writes |
| Wave, kills, keycard | `game` object in `main.js` | |
| Enemy instances | `EnemyManager` | spawn, update, remove |
| Effects pools | `Effects` | fixed-size pools, no per-shot allocation |

`window.HG` exposes the game object, player, level, enemies, weapons and `input` for the console, the
screenshot tool and the test harness. It is the only debug surface and it is intentionally small.

## Baked light

There is no shadow map. Every face carries its light value in vertex colours, computed once in
`levelmesh.js` when the level is built:

| Surface | Shade |
| --- | --- |
| wall | `0.74 + 0.26 × max(0, N·sun)` on the face, times a floor-to-ceiling gradient (1.0 at the base, 0.84 at the top) |
| floor | per-corner occlusion: `1 − 0.09 × (number of the two cells meeting at that corner that are solid)`, times a small per-cell jitter |
| ceiling | the same corner occlusion at 0.88, then darkened overall |

The sun is fixed at `(-0.45, 0.85, 0.35)`. The result is a room that reads as lit from one side and
from below, with the wall bases sitting in their own shadow, for the cost of one `Float32BufferAttribute`
per mesh and no runtime work at all. The door box has no colour attribute, so it uses a material
without `vertexColors`.

`tests/test-geometry.mjs` asserts the attribute exists on every merged mesh, stays inside 0..1, and
varies by more than 0.25 across a level — a flat bake is a bug, not a style.

## No assets

Nothing is fetched at runtime except the JS modules.

| Asset type | How it is made |
| --- | --- |
| Wall, floor, ceiling, door textures | 64×64 canvases drawn at boot (`textures.js`) |
| Blood / scorch decals | canvas with random circles / radial gradient |
| Particle sprite | 32×32 radial gradient, additive-ish blending |
| Enemies | `BoxGeometry`, `ConeGeometry`, `SphereGeometry` |
| Weapon view models | boxes and cylinders |
| Sounds | `OscillatorNode` + `AudioBufferSourceNode` noise, filtered and enveloped |
| Music | none (deliberate) |

The only binary files in the repo are the vendored Three.js build and the screenshots.

## No build step

There is no bundler, transpiler or task runner. `python3 -m http.server` is a valid dev server and
GitHub Pages is a valid production one. The trade-off is real: no tree-shaking (Three.js ships whole,
~2 MB) and no module minification. For a project this size, the ability to open a file and read it is
worth more than the bytes.
