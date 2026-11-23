# Design brief — from wave arena to 32 story levels

Written from the player's direction, 2026-11-23. This supersedes the wave model. Nothing here is built yet.

> OBJECTIVES IS BETTER, LARGER ROOMS ARE NO PROBLEM, AND RATHER THAN WAVES IN SAME LEVEL CREATE DIRECT A LEVEL
> CLEARABLE, STORYDRIVEN, ATLEAST 32 LEVELS, NO READING FROM TABLETS, RATHER A STORY CUTSCENE AND DIALOGES IN
> WRITTEN WOULD BE BETTER, LIKE A MONOGRAPH

## What changes

| Today | Becomes |
| --- | --- |
| Nine zones, endless waves per zone | **32 levels**, each with one objective and an end |
| Waves spawn on a timer and the exit opens when the room is clear | the level states its objective, and **clearing it ends the level** |
| Story told by three wall terminals per level | **cutscenes and written dialogue** between levels |
| Rooms are 4–8 cells because the arena must be small | **larger rooms are fine** — a level is a place, not a pen |
| Progression: unlock the next zone | progression: **the next chapter** |

## The four things that have to be built

| # | Piece | Where | Notes |
| --- | --- | --- | --- |
| 1 | **Objective types**, one per level | `level.js`, `main.js` | hold a point for N seconds; destroy N relics; survive until the door opens; reach the far side; escort the drone; kill the named enemy. The wave loop becomes one of these with a timer |
| 2 | **A level script** — 32 entries | new `story-levels.js` | each: id, seed, shape overrides (bigger rooms), objective, intro cutscene id, outro cutscene id, dialogue |
| 3 | **Cutscene and dialogue system** | `cinematic.js` exists; needs a script format | lines with a speaker and a beat, letterboxed, skippable, and *written*, not read off a tablet |
| 4 | **Retire the terminals as the story vehicle** | `lore.js` | keep them as optional colour, or drop them; the story moves to dialogue |

## What this costs, honestly

`main.js` is 2,600 lines and its loop is built around `wave`. Turning a wave into a level with an objective touches the spawner, the exit gate, the HUD's objective line, the save format (a level index, not a wave number), and the zone map (32 entries, not 9). It is not a patch; it is the second version of the game's spine.

**The first slice, and the only thing I would build first:** one story level, start to finish — a stated objective, a clear ending, a cutscene in, a dialogue line out, no terminal. If that one level is good, the other 31 are content. If it is not, the shape is wrong and 31 more would be 31 more of the wrong thing.

## What must not be lost

| Constraint | Why it still holds |
| --- | --- |
| No build step, no npm at runtime, zero external assets | it is what makes the game load instantly and identically everywhere |
| `recomputeStats()` stays a pure derivation | four separate bugs came from the alternative |
| No enemy in the spawn room, never within 12 m | it is the first rule in the handover |
| The gates stay green | 885 assertions, six static gates, four browser gates |

## Additions — 2026-11-23, second pass

> ALSO THE CUTSCENES PASS THROUGH WALL RATHER THAN THAT THEY SHOULD TRAVEL THE REAL PATH AND PROPER CUTSCENE, U
> CAN ADD NPCS DIFFERENT VIEW OF BODY TYPES AND CLOTHS WHICH SOMETIMES GIVE QUESTS AND REWARDS

### Cutscenes travel the level, they do not fly through it

The boss entrance in `cinematic.js` orbits its subject on a fixed arc, which is why it can end up inside a wall.
A cutscene camera has to move along **walkable ground**, which the game already knows how to compute:

| Piece | How |
| --- | --- |
| The path | `buildFlowField` from the camera's start cell to its end cell — the same BFS the enemies use, so the camera cannot cross a wall any more than they can |
| The height | `floorHeightAt` at each waypoint, plus the eye height, so the camera follows stairs and decks |
| The smoothing | a Catmull-Rom through the waypoint centres, cut to the cell interior, not a straight lerp |
| The look-at | a target that is also on a path, or the subject's chest when it is in sight |

That is one function and it reuses three things that already work.

### NPCs

The rig is parametric — `humanoid(p)` takes proportions and a materials set — so a new body type is a proportions
object, and clothes are extra meshes on joints that already exist. What is missing is not the geometry:

| Piece | Notes |
| --- | --- |
| Body types | 3–4 more `PROPORTIONS` entries: tall/thin, short/wide, armoured. All the same joint names, so the animation code does not change |
| Clothes | a coat, a hood, a tabard — boxes and cylinders on the spine and shoulders, the way the grunt's pack already works |
| Placement | one or two per level, in a room the objective sends you through, never in the spawn room |
| Quests | a dialogue with two or three options, one of which sets a flag; the flag changes the objective or pays a reward |
| Rewards | a trinket, ammo, a relic, or an upgrade — all of which already exist as tables |

**The smallest version that is worth having:** one NPC in the first story level, with one line of dialogue and one
choice that pays something. Everything else is content on top of that shape.

## Third pass — the NPC is a helper, and the trader needs money

> NPC IS JUST HELPER, WHEN HE IS NEAR HE HELPS KILLING ENEMY BUT NEVER LEAVES HIS ROOM, HE IS QUEST GIVER AND
> TRADER, BUT ADDING TRADER NEEDS TO ADD MONEY TOO, AND THE MONEY IS FOUND IN CHESTS IN ROOMS

That corrects the plan it came with, in three places, and the corrections are the binding ones.

### The NPC

| Property | Value |
| --- | --- |
| Body | a real `humanoid()` body with a coat — he fights, so he is seen at close range and from the side |
| Movement | **none**. He never leaves his room, so no pathing, no follow, no stuck-in-a-wall case |
| Combat | when an enemy is inside his room and within range, he shoots it. Same damage path as the drone: `hurt()` with a weapon name, `onKill` wired, kill feed and score count |
| Role | quest giver **and** trader — one character, one room, both functions |
| Frequency | one per level is affordable now that he is stationary; the earlier "act boundaries only" was a cost decision for a character who had to be somewhere |

This is the companion code the game already has, with the follow removed and a room as its leash. `companion.js`
drops visibility inside 1.1 m and follows the player; the NPC needs the same update loop, a room test instead of
a distance test, and a target test instead of a follow target.

### Money, and where it comes from

| Piece | Notes |
| --- | --- |
| **Chests** | a new prop: a box in a room, opened with the interact key, pays coins. One to three per level, placed on reachable floor, never in the spawn room |
| **Coins** | a counter on the run, carried in the save, shown in the HUD next to score |
| **Prices** | ammo, a trinket, an upgrade, a hint — the four tables already exist, so a price is a number on an existing entry |

Coins from **chests in rooms**, not from kills: that is the correction, and it changes the shape of a level — a
chest is a reason to search a room, which is exactly what "clear the room and walk to the pad" was missing.

### Three conflicts with the plan that came with it

| The plan says | The direction says | Which wins |
| --- | --- | --- |
| NPCs are text-only, "no 3D model required" | he fights when you are near | **the direction** — he needs a body, a weapon and a room |
| Readable terminals in every level ("echo logs") for lore and hints | **no reading from tablets** | **the direction** — the story is cutscene and dialogue; terminals stop carrying it |
| Currency from enemy kills ("5–20 Scrap per kill") | money is found in **chests** | **the direction** — chests, so rooms are worth searching |

Everything else in the plan is compatible and worth keeping: 32 levels in four acts, the two relics at **16** and
**28**, the ending determined by relic count, the act bosses at 8, 24 and 32, and the trader appearing on a fixed
schedule of levels.

### What this adds to the first slice

The first story level now needs, to be a fair test of the shape: an objective, a cutscene that walks the level, one
NPC in a room who shoots what comes in and sells one thing, one chest with coins in it, and no terminal.
