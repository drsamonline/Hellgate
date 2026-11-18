# API

Every module-level export, one line each. Generated from the doc blocks by `tools/check-docs.mjs`'s rule: if it is exported, it is described here and in the source.

## `play/src/audio.js`

- **`panGain`** (function) — Stereo pan and distance gain for a sound at `at`, heard from `listener`. Pure, so it can be tested without an AudioContext.
- **`Sfx`** (class) — The synthesiser. Every sound in the game is built here from oscillators and noise buffers.

## `play/src/classes.js`

- **`CLASSES`** (const) — The three playable classes. Each sets a body, a starting weapon and a power set.
- **`getClass`** (function) — Look a class up by id, falling back to the first.

## `play/src/companion.js`

- **`Companion`** (class) — The ally drone: floats behind the player, shoots what it can see, cannot die.

## `play/src/effects.js`

- **`Effects`** (class) — Pooled tracers, decals, particles, lights and screen shake. Nothing allocates per shot.

## `play/src/enemies.js`

- **`Enemy`** (class) — One enemy: mesh, state machine, health. Geometry is shared per type; body materials are cloned for the hit flash.
- **`EnemyManager`** (class) — Owns the enemies, the shared flow field, wave composition and difficulty multipliers.

## `play/src/hud.js`

- **`HUD`** (class) — The DOM overlay: counters, face, crosshair, compass, energy and power slots, boss bar, prompts, toasts.

## `play/src/level.js`

- **`CELL`** (const) — World units per grid cell.
- **`MAX_STEP`** (const) — Tallest ledge the player and the enemies can walk up.
- **`generateLevel`** (function) — Build a whole level from a seed string. Pure data: no Three.js, no DOM, no clock.
- **`cellAt`** (function) — The cell containing a world position, or null outside the map.
- **`isBlocked`** (function) — True when a world position is solid rock, out of bounds, or a closed door.
- **`floorHeightAt`** (function) — Floor height at a world position.
- **`ceilHeightAt`** (function) — Ceiling height at a world position.
- **`circleBlocked`** (function) — True when a circle of radius r at (x, z) overlaps anything solid.
- **`raycastWalls`** (function) — March a ray through the grid and return the first wall hit with its normal, or null.
- **`buildFlowField`** (function) — Breadth-first search from a world position over every reachable cell. -1 where unreachable.
- **`flowStep`** (function) — The neighbouring cell one step closer to the flow field's target, or null.
- **`hasLineOfSight`** (function) — True when nothing solid stands between two world points.

## `play/src/levelmesh.js`

- **`buildLevelMeshes`** (function) — Turn the sector grid into merged geometry with baked vertex shade, plus the door boxes and the exit pad.

## `play/src/lore.js`

- **`TERMINALS`** (const) — The notes left on the wall terminals.
- **`Lore`** (class) — Places the readable terminals in a level and answers what is in reach.

## `play/src/player.js`

- **`PLAYER_RADIUS`** (const) — Collision radius of the player.
- **`Player`** (class) — The player: movement, look, collision, health, armour, ammo and the class multipliers.

## `play/src/powers.js`

- **`POWERS`** (const) — Every power: cost, cooldown, key and effect.
- **`Powers`** (class) — The energy pool, the three equipped slots and their cooldowns.

## `play/src/projectiles.js`

- **`Projectiles`** (class) — Rockets and fireballs: spawn, travel, explode, and what they hit on the way.

## `play/src/props.js`

- **`Props`** (class) — Instanced trees, rocks and grass, plus animals that wander and bolt.

## `play/src/rng.js`

- **`hashString`** (function) — FNV-1a hash of a seed string.
- **`mulberry32`** (function) — A 32-bit seeded PRNG. Same seed, same sequence, forever.
- **`makeRng`** (function) — A small RNG facade: next, range, int, pick, chance.

## `play/src/settings.js`

- **`DEFAULTS`** (const) — Default settings, and the shape every stored setting is validated against.
- **`DIFFICULTIES`** (const) — The three difficulty presets.
- **`loadSettings`** (function) — Read settings from localStorage, falling back to the default for any key that is missing or the wrong type.
- **`saveSettings`** (function) — Persist settings. Silently does nothing in private mode.
- **`clampSettings`** (function) — Clamp every setting into its legal range. Called on read and on write.

## `play/src/story.js`

- **`Story`** (class) — The cold open: typed panels over a camera flythrough of the generated level.
- **`STORY_PANELS`** (const) — The four panels, in order.

## `play/src/textures.js`

- **`makeMaterials`** (function) — Build every surface material once, with canvas textures and anisotropic filtering.
- **`makeDecalTextures`** (function) — The two impact decal textures: scorch and blood.

## `play/src/touch.js`

- **`isTouchDevice`** (function) — True on a touch device, or when ?touch=1 is in the URL.
- **`initTouch`** (function) — Bind the touch overlay to the shared input object. Returns a cleanup carrying setVisible().

## `play/src/weapons.js`

- **`WEAPONS`** (const) — The three weapons: ammo, damage, cooldown, spread, range.
- **`Weapons`** (class) — View models, firing, recoil and weapon switching.

## `play/src/world.js`

- **`ZONES`** (const) — The five zones: seed, palette, props, objective.
- **`loadProgress`** (function) — Read zone progress from localStorage, or a fresh record.
- **`saveProgress`** (function) — Persist zone progress.
- **`zoneById`** (function) — Look a zone up by id, falling back to the first.
- **`isUnlocked`** (function) — True when the zone at this index has been unlocked.
- **`clearZone`** (function) — Record a zone as cleared, unlock the next and keep the best score.
