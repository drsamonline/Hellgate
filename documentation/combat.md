# Combat

## Weapons

Defined in `play/src/weapons.js` as a plain array — adding a weapon is adding an object and a view
model.

| | Pistol | Shotgun | Rocket launcher |
| --- | --- | --- | --- |
| Ammo | bullets | shells | rockets |
| Damage | 17 per shot | 11 per pellet × 8 | 95 splash, radius 4.5 |
| Cooldown | 0.30 s | 0.85 s | 1.00 s |
| Spread | 0.006 | 0.075 | — |
| Range | 70 | 45, falloff to 35 % | projectile, 26 u/s |
| Feel | precise, always useful | close-range delete button | crowd control, self-shake |

Switching weapons sets a fixed 0.18 s delay instead of inheriting the old weapon's cooldown, so
you cannot swap-cancel a shotgun blast, and you are not locked out for a second either.

### How a hitscan shot resolves

```
origin = camera world position
dir    = camera forward (+ spread jitter, per pellet)
wall   = raycastWalls(level, origin, dir, weapon.range)     # grid march, 0.09 steps
maxD   = wall ? wall.dist : weapon.range                    # enemies can't be behind walls
enemy  = enemies.raycast(origin, dir, maxD)                 # ray vs. chest sphere
```

- enemy hit → damage (with falloff), blood particles, a decal, a tracer from the muzzle
- wall hit → spark particles, a scorch decal, a tracer to the impact point
- nothing → a tracer that fades into the dark

The wall test runs **before** the enemy test and caps the enemy ray at the wall distance. That single
ordering is what stops bullets killing through walls, and it is cheaper than testing enemies first and
then validating.

### Projectiles

`projectiles.js` handles both rockets (yours) and fireballs (the imps'), differing only in speed,
radius, damage and which side they hurt. Each moves in sub-steps of at most 0.3 units and calls
`raycastWalls` for the step length — so a fast rocket cannot skip a wall.

A rocket detonates on: wall hit, proximity to an enemy (`hitRadius + 0.18`), or 5 s of flight. The
explosion damages everything within 4.5 units with linear falloff, adds screen shake scaled by the
player's distance, and spawns a 0.22 s point light. Kills made by splash damage are credited through
the same `onKill` callback the weapons use.

## Enemies

One FSM, two parameter sets (`TYPES` in `enemies.js`).

```
                 sees player
      ┌────────┐ ─────────────▶ ┌────────┐  in range & cooldown ready  ┌────────┐
      │  IDLE  │                │ CHASE  │ ──────────────────────────▶ │ ATTACK │
      │ wander │ ◀───────────── │  walk  │ ◀────────────────────────── │ windup │
      └────────┘  lost sight 4s └────────┘      after the shot        └────────┘
                        ▲            │
                        │            │ took damage (55 % chance)
                        │            ▼
                        │       ┌────────┐ 0.26 s
                        └────── │  PAIN  │ ────────▶ CHASE
                                └────────┘
                        any state + hp ≤ 0
                                ▼
                           ┌────────┐ fall 0.45 s → sink 1.2 s → removed
                           │ DEATH  │
                           └────────┘
```

| | Imp | Grunt |
| --- | --- | --- |
| Health | 55 (scales +10 %/wave) | 40 |
| Speed | 2.5 | 3.3 |
| Attack | fireball, 15 dmg, 13 u/s | hitscan 8 dmg, melee 12 |
| Range | 14 | 16 ranged, 2.4 melee |
| Telegraph | 0.55 s, charging particles at the chest | 0.40 s |
| Cooldown | 2.1 s | 1.4 s |
| Sight | 22 | 24 |

- **Telegraph.** During the windup an imp emits particles and pulses; a grunt raises its gun. Both are
  the player's cue to break line of sight. The shot fires once, at the end of the windup.
- **Line of sight** is a grid march at 0.22 steps from the enemy's eye (85 % of its height) to the
  player's eye. Losing sight for 4 s returns it to wandering.
- **Wandering** picks a random heading every 1.2–3.2 s at half speed.
- **Movement** is direct steering with the same axis-separated sliding as the player, plus a
  perpendicular slide when both axes are blocked. There is no pathfinding: an enemy behind a long wall
  will stall against it. This is the top item on the [roadmap](../ENHANCEMENTS.md).
- **Separation.** A cheap O(n²) pass pushes overlapping enemies apart so they do not stack into one
  blob, with a `circleBlocked` check so the push cannot shove one into a wall.

## Damage model

```js
if (armor > 0) {
  absorbed = min(armor, damage * 0.5);
  armor -= absorbed;
  damage -= absorbed;
}
health -= damage;
```

Armour eats half of every hit until it runs out, so 100 armour is worth 100 extra effective health
spread over many hits. Health caps at 100; pickups heal 25 and add 25 armour. There is no death
animation for the player — the game-over screen is the feedback.

## Waves

| Wave | Enemies | Composition |
| --- | --- | --- |
| 1 | 6 | imps |
| 2 | 8 | imps, every 3rd is a grunt |
| 3 | 10 | + keycard required |
| n | min(24, 4 + 2n) | hp × (1 + 0.1(n−1)), speed × (1 + 0.03(n−1)), damage × (1 + 0.06(n−1)) |

Enemies spawn in room cells at least 9 units from the player, in a burst of red particles. Pickups are
scattered at least 4 units away. The exit unlocks when `aliveCount === 0` and — from wave 3 — the
keycard is held; the pad itself only advances the wave when `exitOpen` is true, so walking into the
exit room early does nothing.
