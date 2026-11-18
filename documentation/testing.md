# Testing

Three suites, no browser, no GPU, no network. `bash tests/run.sh` runs all of them in about four
seconds.

```
tests/
├─ run.sh              copies stub-three into node_modules/three, then runs the suites
├─ domstub.mjs         a fake document, window, localStorage and rAF queue
├─ stub-three/         a small stand-in for Three.js (renderer, geometry, materials)
├─ test-level.mjs      47 seeds of generator + collision + raycast invariants
├─ test-geometry.mjs   winding and normals of every merged triangle
└─ test-game.mjs       the whole game, driven frame by frame
```

## Why a stub at all

The interesting logic — level generation, collision, raycasts, the FSM, wave flow — does not need a
GPU. Stubbing Three.js and the DOM lets the *real* game modules run in Node, so the tests exercise the
shipping code rather than a reimplementation of it.

The stub is deliberately thin: vectors with real maths, geometries that hold their buffers, materials
that hold their colours, and a renderer that does nothing but count. It is not a Three.js emulator and
should not become one.

**The stub is not the only check.** The same suites run unmodified against the real library — replace
`tests/stub-three` with a shim that re-exports `three@0.187` and overrides only `WebGLRenderer` and
`Clock`:

```js
export * from '../three-real/three.module.js';
export class WebGLRenderer { /* counts calls, fakes capabilities */ }
export class Clock { getDelta() { return globalThis.__FAKE_DT; } }
```

That is how the game was validated against the current Three.js release. Doing it once caught a bug in
*the test itself*: `geometry.index` is a plain array in the stub but a `BufferAttribute` in real
Three.js, so the geometry suite was reading `NaN` and passing everything.

## test-level.mjs

For each of 47 seeds:

- determinism — the same seed produces byte-identical cells
- the spawn is open and a player-sized circle fits
- flood fill from the spawn reaches every room and the exit pad
- every door cell is non-solid, outside a room, and a genuine chokepoint
- with all doors shut, the exit **pad** is unreachable (the pad is what gates the wave)
- no open cell has a floor above `MAX_STEP` or a ceiling within 0.5 m of its floor
- a 400-step random walk from the spawn never ends inside a wall or off the map
- 8 rays from the spawn: any reported horizontal hit is inside a blocked cell just past the hit point
- line of sight to a point 0.1 units away is always clear

## test-geometry.mjs

The one that catches what a logic test cannot. For every triangle in every merged level mesh:

1. recompute the normal from the winding order
2. assert it agrees with the stored normal (dot > 0.9)
3. sample the point 0.12 units along the normal
4. assert that point is inside an open cell, and for vertical faces, inside that cell's floor/ceiling span

Inverted or mis-wound faces fail immediately. Run over five seeds, ~14k triangles.

## test-game.mjs

Drives the real game through a fake DOM, one frame at a time, with a fixed `dt = 1/60`:

| Stage | Assertion |
| --- | --- |
| boot | starts on the title screen, no run exists yet |
| start | state → playing, 1600 cells, meshes built, 6 enemies, pistol equipped |
| movement | 90 frames of `W` moves the player, camera follows |
| look | mouse deltas change yaw and pitch |
| weapons | `2` selects the shotgun, firing consumes exactly one shell |
| hitscan | a posed duel: pistol damages an imp, flash materials are per-enemy, flash decays |
| geometry sharing | two imps share one torso geometry but not their flash material |
| rocket | consumes ammo, splash kills, kill counter increments |
| AI | an imp at 5 units with line of sight reduces player health |
| wave clear | killing the wave opens the exit and hides the door meshes |
| next wave | stepping on the pad advances the wave and re-locks the exit |
| keycard | wave 3 stays locked without the card, opens with it |
| debug overlay | `` ` `` toggles it and it reports fps + draw calls |
| death | state → dead, best run written to `localStorage` |
| restart | stats reset, previous level geometry disposed, cached materials survive |
| pause | `Esc` pauses, the resume button resumes |
| URL hooks | `?auto=1&seed=&wave=&cam=&nohud=1` places the camera and starts the run |
| soak | 2000 frames of random input, no exception, position stays finite |

The harness can teleport the player and pose enemies through `window.HG`, which is also how the
screenshot tool works — so the test and the marketing images exercise the same surface.

## Adding a test

Append to the relevant suite and use the helpers already there:

```js
const ok = (cond, msg) => { if (!cond) { fails.push(msg); } };
frames(10);                                  // advance the game loop
window.dispatch('keydown', { code: 'KeyW' });
HG.player.pos.set(x, 0, z);                  // pose through the debug handle
```

Keep assertions behavioural ("the exit opened") rather than incidental ("`doorMeshes[0].visible` is
false"), except where the incidental thing *is* the bug you are guarding against.

## What the tests do not cover

- **Visual output.** Winding is checked; lighting, palette, readability and z-fighting are not.
- **Audio.** `AudioContext` does not exist in Node, so every `play()` is a no-op. Nothing verifies a
  sound is audible, mixed sanely, or that the master gain is not clipping.
- **Feel.** Speed, sensitivity, enemy aggression. Those need hands.
- **Performance.** Draw calls are counted, frame time is not. Press `` ` `` in a real browser.
- **Browsers.** Chromium is where the screenshots and these tests run. Safari and Firefox are
  untested; pointer lock and `unadjustedMovement` in particular differ.

## Screenshots and the map

`node tools/shoot.mjs` runs the game in headless Chromium (SwiftShader software WebGL), poses the
camera through `window.HG`, and writes `assets/*.png`. `node tools/map.mjs <seed>` renders the live
generator output to SVG. Both need `puppeteer-core` and a Chromium binary; neither ships in the game.
