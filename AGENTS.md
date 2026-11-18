# AGENTS.md

Orientation for anyone — human or model — making changes to HELLGATE. Read this before touching a
file; it is shorter than the documentation and it names the traps.

## What this is

A browser arena shooter. Static site, ES modules, an import map, no build step. `play/src/level.js` is
the only file with real logic that does not need a browser.

## Commands

```bash
bash tests/run.sh            # 3 suites, ~4 s, no install, no network
node tools/check-claims.js   # README numbers vs the code, ~200 ms
node tools/smoke.mjs         # both pages in headless Chromium (needs puppeteer-core + a browser)
node tools/shoot.mjs         # re-capture the screenshots into assets/*.png
python3 tools/optimise_assets.py   # assets/*.png -> assets/*.webp (what the pages load)
node tools/map.mjs <seed>    # render a generated level to SVG
python3 -m http.server 8000  # local dev: / is the landing page, /play/ is the game
```

`tests/run.sh` copies `tests/stub-three` into `node_modules/three` first. Install `puppeteer-core`
**before** running it if you also want the smoke test — a later `npm install` prunes the stub.

## Layout

| Path | Owns |
| --- | --- |
| `index.html` | landing page. Static, no game code |
| `play/index.html` | game markup, HUD, screens, CSS, import map |
| `play/src/main.js` | boot, input, state machine, wave flow, render loop |
| `play/src/level.js` | level generation, collision, wall raycast, flow-field navigation. **No Three.js import** |
| `play/src/levelmesh.js` | grid to merged geometry, including baked vertex shade |
| `play/src/enemies.js` | imp and grunt, one FSM, line of sight, shared geometry |
| `play/src/effects.js` | pooled particles, tracers, decals, lights, shake |
| `play/src/classes.js` | three classes: body, weapon, powers |
| `play/src/powers.js` | energy, cooldowns, five powers |
| `play/src/world.js` | zones, unlock progress |
| `play/src/story.js` | the cold open |
| `play/src/props.js` | instanced decor and animals |
| `play/src/companion.js` | the ally drone |
| `play/src/touch.js` | mobile controls |
| `play/src/settings.js` | the persisted settings |
| `tests/` | three suites plus a DOM stub and a Three.js stub |
| `tools/` | screenshot, map render, claim checker, smoke test, asset optimiser |

## Invariants — break one of these and CI should fail

1. `play/src/level.js` imports nothing but `./rng.js`. That is what makes it testable in Node.
2. Every merged triangle's winding agrees with its normal, and the normal points into open space.
   `tests/test-geometry.mjs` recomputes both from the buffer.
3. Every merged mesh carries a `color` attribute inside 0..1 that varies by more than 0.25 across a
   level. A flat bake is a bug.
4. The exit pad is unreachable while every door is shut. Enforced per seed in `tests/test-level.mjs`.
5. No number in `README.md` is unverified. `tools/check-claims.js` reads the README and the code.
6. Materials and geometries that survive a restart are marked `userData.shared = true`. Everything
   else is disposed by `disposeRun()`.
7. No dependency beyond the vendored Three.js. No bundler. No external art or audio.

## Traps

- **`renderer.info` resets on every `render()` call.** Read it between the level pass and the weapon
  pass, or the debug overlay reports the pistol's draw calls.
- **`networkidle0` never fires on a page running a render loop.** Wait for `window.HG.game.state`.
- **`geometry.index` is a `BufferAttribute` in real Three.js and a plain array in the stub.** Use
  `idx.array || idx`.
- **A material with `vertexColors: true` on a geometry without a colour attribute renders black.**
  The door box uses `mats.door_plain` for this reason.
- **`gh-pages` is force-pushed by CI on every push to `main`.** A manual commit there is destroyed.
- **Pointer lock is not guaranteed.** Iframes and preview panes fall back to raw mouse-move; do not
  assume `input.locked`.
- **The flow field is shared and rebuilt 3×/s.** Never build one per enemy or per frame.
- **Audio is a no-op in Node.** `AudioContext` does not exist, so `play()` returns early. Nothing in
  the suites proves a sound is audible.

## Style

Two-space indent, semicolons, single quotes, ~110 columns. Comments explain why, not what. A comment
that restates the line is deleted. Commit messages are imperative and conventional-ish.

## Where to start

`ENHANCEMENTS.md` is ordered by value. Tier 0 is exhausted; item 17 (flow-field navigation) is the
single biggest gameplay fix and it is self-contained enough to be a first contribution.
