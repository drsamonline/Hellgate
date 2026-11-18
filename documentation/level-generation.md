# Level generation

`play/src/level.js` turns a seed string into a 2.5D sector map, then answers collision and raycast
queries against it. It imports nothing but the seeded PRNG, so every function here is testable in
Node.

## The grid

40 × 40 cells, 2 m each (`CELL = 2`), so a map is 80 × 80 world units. Each cell is either solid rock
or a **sector**:

```js
{ x, z, solid, floor, ceil, wall, floorTex, ceilTex, door, exit, room }
```

`floor` and `ceil` are world heights. `wall` and `floorTex` are indices into the material tables in
`levelmesh.js`. `room` is the room index, or `-1` for a corridor cell.

A cell is centred on `(x * CELL, z * CELL)` and spans ±`CELL/2`. All world ↔ cell conversion uses
`Math.round`, so `cellAt(level, x, z)` is a lookup, not a search.

## Generation, step by step

1. **Fill with rock.** Every cell starts solid, `floor 0`, `ceil 3.0`.
2. **Place rooms.** 9–13 attempts at random rectangles of 4–8 cells per side, rejected if they come
   within 2 cells of an existing room. Each room gets a random ceiling — 65 % normal (3.2–3.9 m),
   35 % tall (5.4–6.8 m) — plus a wall and floor texture id.
3. **Connect.** Link room *i* to room *i−1* with an L-shaped corridor, horizontal-first or
   vertical-first at random, then add two random extra links so the arena has loops instead of being
   a single chain. Corridors are 1 cell wide with a 3.0 m ceiling; carving only touches solid cells,
   so a corridor never overwrites a room's ceiling.
4. **Raise ledges.** Two rooms get some interior cells lifted to exactly `MAX_STEP` (0.5 m). This is
   the case that exercises the step-up code.
5. **Pick the exit.** The room whose centre is farthest from the spawn room. Its centre cell becomes
   the exit pad.
6. **Place doors.** See below.
7. **Index the open cells** for spawns and pickups.

## Doors, and why the room gets sealed

A door is a *cell* marked `door: true` that is blocked while `level.doorOpen` is false — not a
polygon in a wall. That keeps collision a single boolean check.

The obvious rule — "every corridor cell touching the exit room is a door" — produces a wall of ten
doors when a corridor runs parallel to the room and shares a long boundary with it. So a candidate
only counts if the path actually **turns away** from the room at that cell:

```
door candidate = corridor cell adjacent to the exit room
                 that has a corridor neighbour which is NOT adjacent to the exit room
```

Candidates are sorted by how many such onward neighbours they have, and at most three are kept. If
none qualify, one adjacent cell is used as a fallback.

Then the rest are **sealed**: every other corridor cell sharing a boundary with the exit room is
turned back into solid rock, so the room is entered through its doors only. That can in principle cut
the map in two, so the generator runs a flood fill immediately afterwards — spawn to every room, with
doors treated as passable — and reverts the sealing wholesale if any room or the exit becomes
unreachable. Verified across 47 seeds in `tests/test-level.mjs`.

## Geometry

`buildLevelMeshes(level, mats)` walks the grid and emits quads into per-texture buckets, then uploads
one `BufferGeometry` per bucket. Five buckets in practice: two wall textures, two floor textures, one
ceiling. Plus one box per door and one plane for the exit pad.

For each open cell: a floor quad at `floor`, a ceiling quad at `ceil`, then for each of the four
neighbours:

| Neighbour | Emitted |
| --- | --- |
| solid or out of bounds | full-height wall, `floor → ceil` |
| open, higher floor | step riser, `floor → neighbour.floor` |
| open, lower ceiling | header, `neighbour.ceil → ceil` |
| open, same heights | nothing — the cells share a volume |

Winding is fixed by hand so that every quad's front face points into the open cell. The four wall
cases:

| Boundary | Normal | Vertex order (bottom-left first) |
| --- | --- | --- |
| +X | −X | `(x1,y0,z0) (x1,y0,z1) (x1,y1,z1) (x1,y1,z0)` |
| −X | +X | `(x0,y0,z1) (x0,y0,z0) (x0,y1,z0) (x0,y1,z1)` |
| +Z | −Z | `(x1,y0,z1) (x0,y0,z1) (x0,y1,z1) (x1,y1,z1)` |
| −Z | +Z | `(x0,y0,z0) (x1,y0,z0) (x1,y1,z0) (x0,y1,z0)` |

`tests/test-geometry.mjs` verifies this the hard way: for every triangle it recomputes the normal from
the winding, checks it agrees with the stored normal, then samples a point 0.12 units along the normal
and asserts that point is inside an open cell at a height between that cell's floor and ceiling. An
inverted face fails that test, and inverted faces are invisible to every other kind of test.

UVs are one texture tile per cell: `u` runs 0→1 across the quad, `v` runs 0→`height / CELL`.

## Collision

`circleBlocked(level, x, z, r)` tests a circle against the AABBs of nearby blocked cells (solid, or a
closed door). Movement resolves one axis at a time, which produces sliding along walls for free:

```js
tryStep(dx, 0)   // blocked? stay
tryStep(0, dz)   // then the other axis
```

with sub-steps of at most 0.18 units so a fast sprint cannot tunnel through a 2 m cell. A move is also
refused if the destination floor is more than `MAX_STEP` above the player's current height, which is
what makes a 0.5 m ledge climbable and anything taller a wall.

## Raycasting

`raycastWalls(level, origin, dir, maxDist, step)` marches the ray in fixed steps and returns the first
cell that is solid, a closed door, or outside the vertical span of the cell. The hit normal comes from
which face of the *previous* cell the ray left, so decals sit flush on the right surface.

Two step sizes: **0.09** for bullets and rockets (accuracy matters, and a shotgun is only 8 rays), and
**0.22** for enemy line-of-sight (cheap, and an enemy that thinks it can see you one frame early is not
a bug anyone notices). `hasLineOfSight` is just `raycastWalls` with the target distance as the budget.

## Navigation

Enemies do not steer at the player. `buildFlowField(level, x, z)` runs a breadth-first search from
the player's cell over every open cell, refusing edges that are blocked, that cross a closed door, or
that climb more than `MAX_STEP`. It returns an `Int32Array` of step counts, `-1` for unreachable.

`EnemyManager` rebuilds that field **three times a second, once for all enemies** — 1,600 cells of
BFS costs less than a single enemy's line-of-sight ray. `flowStep(level, field, x, z)` then answers
the only question an enemy asks each frame: which neighbouring cell is one step closer? The answer is
a direction, not a target, so the enemy walks a corridor instead of leaning on the wall between.

Cost: one 6.4 KB allocation per rebuild, no per-enemy work. `tests/test-level.mjs` follows the field
from twelve cells per seed and asserts each walk ends at distance 0, which is the property that makes
the whole thing worth having.

## Invariants the tests enforce

- same seed → identical cells, always
- the spawn cell is open and a 0.42-radius circle fits
- every room has at least one reachable cell from the spawn
- the exit pad is unreachable while every door is shut
- every door cell is non-solid, outside any room, and has at least two open neighbours
- no open cell has a floor above `MAX_STEP`, and none has a ceiling closer than 0.5 m to its floor
- a 400-step random walk from the spawn never ends inside a wall and never leaves the map
- every horizontal ray from the spawn that reports a hit is actually inside a blocked cell just past
  the hit point
