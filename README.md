<div align="center">

<img src="assets/banner.svg" alt="HELLGATE — a procedural arena FPS" width="100%" />

**A Doom-style 2.5D arena shooter that runs in a browser tab.**
Sector maps generated from a seed string · three weapons · two enemy types · **zero external assets**.

[![Play the demo](https://img.shields.io/badge/▶_play-live_demo-ff3b30?style=for-the-badge)](https://drsamonline.github.io/hellgate/play/)
[![Read the docs](https://img.shields.io/badge/docs-read-ffb454?style=for-the-badge&logo=readthedocs&logoColor=white)](documentation/architecture.md)
[![Roadmap](https://img.shields.io/badge/roadmap-63_items-39ff9a?style=for-the-badge)](ENHANCEMENTS.md)

[![License](https://img.shields.io/github/license/drsamonline/hellgate?style=flat-square&color=3da639)](LICENSE)
[![Tests](https://img.shields.io/github/actions/workflow/status/drsamonline/hellgate/test.yml?style=flat-square&label=tests)](../../actions/workflows/test.yml)
[![Three.js](https://img.shields.io/badge/three.js-r187-000000?style=flat-square&logo=three.js&logoColor=white)](https://threejs.org)
[![Assets](https://img.shields.io/badge/external_assets-0-c0392b?style=flat-square)](documentation/architecture.md#no-assets)
[![Bundle](https://img.shields.io/badge/build_step-none-8d7f6c?style=flat-square)](#no-build-step)

<img src="assets/arena.png" alt="The arena: imps and a grunt closing in, pistol equipped" width="100%" />

</div>

---

## What this is

A complete little game, and a reference for how far you can get in Three.js without loading a
single image, model or audio file.

Every texture is painted onto a `<canvas>` at boot. Every enemy is a compound of boxes and cones.
Every sound is a WebAudio oscillator or noise burst. The level is a 40×40 grid of sectors generated
from whatever you type into the seed box.

```bash
git clone https://github.com/drsamonline/hellgate.git
cd hellgate
python3 -m http.server 8000   # any static server
# → http://localhost:8000        landing page
# → http://localhost:8000/play/  the game
```

No `npm install`, no bundler, no build step. Three.js is vendored in `play/vendor/`.

## Play

**[▶ Live demo](https://drsamonline.github.io/hellgate/play/)** — served straight from this repo by GitHub Pages.

| Input | Action | Input | Action |
| --- | --- | --- | --- |
| `W A S D` | move | `1` `2` `3` | pistol · shotgun · rocket |
| `Shift` | sprint | `Q` `E` | cycle weapons |
| `Space` | jump | `LMB` | fire (hold for auto) |
| Mouse | look (pointer lock, with a fallback) | `Esc` | pause |
| `` ` `` or `F3` | fps · draw calls · triangles | `M` | mute |
| `F` | fullscreen | | |

Clear a wave and the exit unlocks; walk onto the glowing pad to spawn the next, harder one.
From wave 3 the exit is also keycard-locked.

## Screenshots

Real frames — captured by `tools/shoot.mjs` running the actual game headless in Chromium with
software WebGL. Nothing here is a mockup or a composited image.

| | |
| --- | --- |
| <img src="assets/combat.png" alt="Shotgun blast, blood spray, tracers" /> **Shotgun** — 8 pellets, per-pellet damage falloff, blood decals | <img src="assets/rocket.png" alt="Rocket explosion lighting the room" /> **Rocket** — splash damage, pooled particles, a real point light, screen shake |
| <img src="assets/exit.png" alt="Exit room with glowing pad" /> **Exit** — wave cleared, doors open, pad lit | <img src="assets/title.png" alt="Title screen" /> **Title** — seed entry, best run from localStorage |

<img src="assets/map.svg" alt="Top-down view of a generated level" width="420" align="right" />

### The map is a seed

Rooms are carved as rectangles, joined by L-shaped corridors, then given random ceiling heights
so corridor mouths read as doorways. The exit room is sealed behind its doors, one room gets a
0.5 m raised ledge, and the whole static level is merged into **five meshes** — five draw calls
for the entire map.

`hellgate` → 10 rooms, 3 doors, 1 exit. Type it again and you get the same map down to the brick.
The picture on the right is rendered from the live generator by `tools/map.mjs`, not drawn by hand.

<br clear="right" />

## Features

**Engine** — sector grid with per-cell floor/ceiling heights · hand-built UVs and normals, no geometry library · merged geometry, five draw calls · **baked sun/shade and corner AO in vertex colours** · filmic tone mapping · adaptive resolution (gives up pixels, not frames) · circle-vs-wall sliding collision with a 0.5 m step limit · frame-rate independent movement (`v *= exp(-k·dt)`) · fog culling · anisotropic filtering.

**Combat** — hitscan pistol · 8-pellet shotgun with falloff · rocket with splash, light and shake · muzzle flash lights · tracers · scorch and blood decals · per-enemy hit flash.

**Enemies** — imps (telegraphed fireballs) and grunts (hitscan, melee at close range) on one FSM: `IDLE → CHASE → ATTACK → PAIN → DEATH` · grid line-of-sight · wandering · gibs · shared geometry per type.

**Audio** — synthesised, spatialised: every enemy sound is panned by direction and attenuated by distance, and no two plays are identical.

**Feel** — Doom-style face that degrades with health · damage direction arrows · red edge vignette · weapon sway and bob · pooled particles, tracers, decals and lights (nothing allocates per shot).

**Meta** — seeded maps · wave difficulty curve · procedural pickups · keycard gate · title / pause / game-over screens · best run in `localStorage`.

## Architecture

```
index.html            landing page (GitHub Pages root)
play/index.html       the game: markup, HUD, screens, CSS, import map
play/src/main.js      boot, input, state machine, wave flow, render loop
play/src/level.js     LEVEL GEN + collision + wall raycast — no Three.js, unit-testable
play/src/levelmesh.js sector grid → five merged BufferGeometries
play/src/textures.js  canvas-painted textures and materials
play/src/player.js    movement, look, step-up, damage, ammo
play/src/weapons.js   view models, hitscan, pellets, rockets
play/src/enemies.js   imp + grunt, FSM, LOS, attacks, gibs
play/src/projectiles.js  rockets and fireballs
play/src/effects.js   tracers, decals, particles, lights, shake
play/src/hud.js       face, counters, crosshair, damage arrows
play/src/audio.js     WebAudio synth — no samples
play/src/settings.js  sensitivity, FOV, reduced motion, volume — persisted
play/src/rng.js       seeded PRNG
tests/                three headless suites
tools/                screenshot + map-render tools
documentation/        architecture, level gen, combat, tuning, testing
```

`level.js` deliberately imports nothing from Three.js. That is what lets the generator be tested in
Node — reachability, determinism, collision and raycasts — without a browser or a GPU.

## Testing

```bash
bash tests/run.sh
```

| Suite | What it proves |
| --- | --- |
| `test-level.mjs` | 47 seeds: determinism, every room reachable, spawn free, exit pad unreachable while doors are shut, a 400-step random walk never ends inside a wall, raycast sanity |
| `test-geometry.mjs` | every merged triangle's winding matches its normal **and** its normal points into open space — catches inverted faces, which logic tests cannot see |
| `test-game.mjs` | boots, walks, looks, fires all three weapons, kills, takes damage, clears a wave, opens the exit, advances, checks the keycard gate, dies, restarts, pauses, then 2000 frames of random input without a crash |

Two gates sit on top of the suites:

| Gate | What it proves |
| --- | --- |
| `node tools/check-claims.js` | every number in this README matches the thing that produces it: roadmap count, suite count, module count, lines of code, licence, version, sponsor links |
| `node tools/smoke.mjs` | the real pages load in headless Chromium: import map resolves, images decode, internal links return 200, the game boots, starts a run and honours the URL hooks, with no console errors |

The suites run against a stub of the DOM and of Three.js so they need no browser and no network.
They also pass unmodified against the real library (`three@0.187`, with only `WebGLRenderer` faked) —
which is how the game was checked against the current release rather than against a mock.

## Documentation

- [Architecture](documentation/architecture.md) — modules, data flow, render loop
- [Level generation](documentation/level-generation.md) — sectors, rooms, corridors, doors, sealing
- [Combat](documentation/combat.md) — weapons, enemy FSM, damage model, projectiles
- [HUD and feel](documentation/hud-and-feel.md) — feedback systems and why they exist
- [Tuning](documentation/tuning.md) — every constant worth changing, and what it does
- [Testing](documentation/testing.md) — how the harness works, how to add a suite
- [Enhancement roadmap](ENHANCEMENTS.md) — 63 ideas, quick wins first

## Performance

Five draw calls for the level, ~2.7k triangles, pooled effects, `devicePixelRatio` capped at 1.5,
fog from 9 to 32 units, and frustum culling on enemies. Each enemy is ~12 small meshes, so a packed
room of 24 is a few hundred calls — fine on a desktop GPU. Press `` ` `` in game to see the truth for
your machine.

## Support

| | |
| --- | --- |
| GitHub Sponsors | [github.com/sponsors/drsamonline](https://github.com/sponsors/drsamonline) |
| Ko-fi | [ko-fi.com/matneo](https://ko-fi.com/matneo) |
| PayPal | [paypal.me/drsohilmomin](https://paypal.me/drsohilmomin?locale.x=en_GB&country.x=IN) |
| My books | [Amazon author store](https://www.amazon.com/stores/author/B08ZT331LY/allbooks) |
| More apps | [drsamonline.github.io](https://drsamonline.github.io/) |
| Email | [sohilmomin2000@gmail.com](mailto:sohilmomin2000@gmail.com) |

Nothing is gated behind it: no accounts, no tracking, no network requests. HELLGATE is MIT-licensed
and always will be — the support links pay for the hours that go into
[the roadmap](ENHANCEMENTS.md), not for access to anything.

## Security and privacy

No server, no accounts, no telemetry, no third-party requests. See [SECURITY.md](SECURITY.md) for the
reporting process and [PRIVACY.md](PRIVACY.md) for the one `localStorage` key this game writes.

## Contributing

Issues and PRs are welcome — especially new enemy types, better enemy navigation (see
[roadmap #1](ENHANCEMENTS.md)), and seeds that break the generator. Run `bash tests/run.sh` before
you open a PR; the geometry suite catches the mistakes that are invisible in a diff.
See [CONTRIBUTING.md](CONTRIBUTING.md).

## Credits

Built with [Three.js](https://threejs.org). Inspired by id Software's Doom (1993) — the sector
model, the face in the HUD, and the idea that a game is more fun than a tech demo.

Four techniques are borrowed from [remorses/castle-valley](https://github.com/remorses/castle-valley),
a painterly Three.js game: light and shade baked once into the geometry instead of computed per
frame, a renderer-level grade rather than a flat output, resolution that adapts to the frame budget,
and audio that is heard from where it stands. Credit to [@remorses](https://github.com/remorses).

## License

[MIT](LICENSE) © Dr Sohil Momin
