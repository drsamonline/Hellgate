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
