# Tuning

Every number worth touching, where it lives, and what happens when you move it. Edit, refresh, no
rebuild.

## World

`play/src/level.js`

| Constant | Default | Effect |
| --- | --- | --- |
| `CELL` | `2.0` | Metres per grid cell. Changing it rescales everything: rooms, corridors, the map footprint. Collision and geometry both read it, but the *count* of cells does not change, so the arena gets physically bigger. |
| `MAX_STEP` | `0.5` | Tallest ledge you can walk up. Also the height of the raised platforms. |
| `W`, `H` | `40`, `40` | Grid size in cells. 48 makes a much longer walk between rooms; 32 gets claustrophobic fast. |
| `want` (in `generateLevel`) | `rng.int(9, 13)` | Target room count. Below ~7 the map is a corridor with extra steps; above ~14 rooms stop fitting and placement starts failing (the loop gives up after 800 attempts). |
| room size | `rng.int(4, 8)` | Cells per side. 4×4 rooms are cramped for 24 enemies; 10×10 rooms start to feel like halls. |
| ceiling heights | `rng.range(3.2, 3.9)` / `rng.range(5.4, 6.8)` | Room height. Below 3.0 the ceiling crowds the camera; above 8 the fog makes the top of the room vanish. |
| corridor ceiling | `3.0` | Sets the doorway header height. Lower than the room ceiling, which is what makes corridor mouths read as doorways. |
| ledge coverage | `rng.chance(0.5)` per interior cell, 2 rooms | How much of a room is raised. |
| max doors | `doors.slice(0, 3)` | Caps the door wall. Raise it if you like rooms that are hard to enter. |

## Player

`play/src/player.js`

| Constant | Default | Effect |
| --- | --- | --- |
| `EYE` | `1.62` | Camera height above the floor. |
| `PLAYER_RADIUS` | `0.42` | Collision circle. Above ~0.7 the player cannot fit through a 2 m doorway diagonally. |
| `WALK` / `SPRINT` | `5.4` / `8.6` | Metres per second. Doom is roughly 8–10; below 4 it feels like wading. |
| `ACCEL` | `14` | Exponential approach rate to target velocity. Higher is snappier; below 6 it feels icy. |
| `GRAVITY` / `JUMP` | `22` / `5.4` | A jump of about 0.66 m — enough to clear a 0.5 m ledge, not enough to escape the map. |
| `LOOK_SENS` | `0.0022` | Radians per pixel of mouse movement. |
| `PITCH_LIMIT` | `1.45` | ±83°, so you can look almost straight up without gimbal weirdness. |

## Weapons

`play/src/weapons.js` — the `WEAPONS` array. Add an object to add a weapon, then add a view model in
`buildModels()` and a key binding in `main.js`.

| Field | Meaning |
| --- | --- |
| `damage` | Per pellet for hitscan, total for a projectile |
| `cooldown` | Seconds between shots; also the auto-fire rate |
| `pellets`, `spread` | Pellet count and per-axis jitter added to the direction before normalising |
| `range` | Hitscan distance budget (and the falloff denominator for the shotgun) |
| `falloff` | `true` scales damage by `max(0.35, 1 - dist/range)` |
| `projectile` | `true` spawns a rocket instead of a ray |
| `kick`, `shake` | View-model recoil and camera shake |

## Enemies

`play/src/enemies.js` — the `TYPES` table. Adding a type means a `makeX()` builder plus an entry here;
the FSM is shared.

| Field | Meaning |
| --- | --- |
| `hp`, `speed`, `radius` | Base stats, scaled by wave |
| `attackRange`, `attackCd`, `telegraph` | When it may start an attack, how often, and how long the warning lasts |
| `damage`, `melee`, `meleeRange`, `meleeDamage` | Offence |
| `sight` | Maximum distance at which it will notice you |
| `hitRadius` | Sphere used by hitscan and rocket proximity |

Wave scaling is in `Enemy`'s constructor and in `spawnWave`:

```js
hp     = base * (1 + 0.10 * (wave - 1))
speed  = base * min(1.45, 1 + 0.03 * (wave - 1))
damage = base * min(2.20, 1 + 0.06 * (wave - 1))
count  = min(24, 4 + 2 * wave)
```

The `min()` caps stop wave 20 from turning unplayable and keep it merely hard.

## Effects

`play/src/effects.js` — pool sizes at the top (`MAX_PARTICLES` 600, `MAX_TRACERS` 16, `MAX_DECALS` 40,
`MAX_LIGHTS` 4). Raising them costs memory, not frame time; the update loop touches every slot every
frame, so 600 → 3000 is a real cost on a weak machine.

Decal life is 8 s with the last 40 % fading. Particle gravity defaults to 14 — the `burst()` calls
pass per-effect overrides (gibs fall faster, embers float).

## Camera and fog

`play/src/main.js`

| Value | Default | Effect |
| --- | --- | --- |
| FOV | `76` | Below 70 the game feels zoomed and slow; above 90 walls warp. |
| fog near / far | `9` / `32` | The far value is the real draw distance. Lower it for atmosphere and a bigger frame budget. |
| ambient / hemisphere | `0.6` / `0.85` | Overall brightness. The palette is deliberately dark; below 0.45 rooms stop reading. |
| pixel ratio cap | `1.5` | On a 3× display this is the single biggest frame-time lever. |

## Waves

`play/src/main.js` → `startWave()` and `enemies.spawnWave()`. The keycard gate is `n >= 3` in
`startWave` and the matching check in `checkWave()`; change both or the wave will never unlock.

## Adding a weapon, end to end

1. Append to `WEAPONS` in `weapons.js` (stats).
2. Add a `THREE.Group` of boxes/cylinders in `buildModels()` and push it to `this.models`.
3. Add ammo to `player.ammo` in `player.js` (`reset()` and the initial object).
4. Bind a key in `main.js` (`Digit4`), and a pickup kind in `PICKUP_DEFS` if it needs ammo.
5. Update the HUD ammo label — it reads `player.ammo[weapon.ammo]` automatically.
6. Run `bash tests/run.sh`; `test-game.mjs` fires every weapon by index, so extend it.
