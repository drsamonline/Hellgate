# HELLGATE — start here

A cold-start brief. Read this, then `HANDOVER.md`, then `documentation/design-brief.md`.

## The prompt to give the next session

> Continue HELLGATE — a Doom-style 2.5D browser arena FPS at https://github.com/drsamonline/Hellgate,
> live at https://drsamonline.github.io/Hellgate/play/. It is at **v2.0.0** on `main`.
>
> START BY READING, in this order: `START-HERE.md` (this), `HANDOVER.md`, `documentation/design-brief.md`,
> `documentation/player-report.md`.
>
> Then clone, `git pull`, and run `bash tests/run.sh | grep -E "FAIL|all suites"` — **not `tail -1`**, which
> hides the verdict — before changing anything.
>
> CONSTRAINTS THAT DO NOT MOVE: multi-file build, no build step, no npm at runtime, zero external assets (every
> texture, model and sound is generated in code); no enemy may ever spawn in the player's spawn room, never
> within 12 m; `VERSION` and `BUILD` in `play/src/main.js` must match; `recomputeStats()` is a pure, idempotent
> derivation and nothing may "adjust" a stat after it; `openExit()` is the only writer of `game.exitOpen` and
> `updateObjective()` is the only decider; do not redo work marked measured-and-rejected in `ENHANCEMENTS.md`
> without new numbers.
>
> WORK THIS NEXT, in order: (1) the cutscene camera that walks the level — `buildFlowField` from the camera's
> cell to its target, `floorHeightAt` at each waypoint, a Catmull-Rom through the centres, in `cinematic.js`
> (roadmap 64); (2) the dialogue system — lines with a speaker and a beat, letterboxed and skippable, driven by
> the `story-levels.js` rows (roadmap 65); (3) the NPC's first quest — one dialogue, two choices, one sets a
> flag that pays a trinket (roadmap 66).
>
> FLAKY ASSERTIONS: four were diagnosed and fixed at 2.0.0 (the pistol target, the pickup keeper, the resume
> score and the hit-flash decay). If one goes red, re-run before believing it — three of those blamed innocent
> commits. The rule they all broke: never assert on a value the loop can move between the write and the read.
>
> REPORTING: tables and bullets, no paragraphs. Blunt, information-dense, no filler, no emojis, no questions.
> End every report with a "Your steps" table for the actions only the user can take.

## State, verified

| | |
| --- | --- |
| Version | 2.0.0 (`VERSION` and `BUILD` agree) |
| Branch | `main`, clean, pushed, CI green (tests + pages) |
| Tests | 885 playability + 604 in the other three suites; seven static gates; smoke, flow, run, invariants |
| Modules | 38 in `play/src/` |
| Releases | 100, `v1.0.0` → `v2.0.0` |
| Roadmap | 54 shipped, 3 measured-and-rejected, 9 open of 66 |

## What shipped in this run

| Release | Item |
| --- | --- |
| 1.91.0 → 1.99.1 | Nine releases: the audit tail, instanced bodies, silhouettes, shadows, catwalks, lifts, the pause panels |
| **2.0.0** | **The campaign: the `relics` objective, a HUD that counts, and 32 levels** |

### 2.0.0 in detail

| Piece | What it does |
| --- | --- |
| `relics` objective | a level spawns N relics of 40 hp; a shot chips one, the last one opens the door |
| `updateObjective()` | the only decider: `survive` counts the clock, `relics` reads the count. Idempotent |
| HUD objective line | `SURVIVE · 1:14` counts down, `BREAK THE RELICS · 2 LEFT` counts relics |
| `story-levels.js` | 32 rows of id, seed, shape, objective in four acts; `?level=N` plays one |
| save | `objectiveT` survives a reload; the clock used to restart at full time |

## The objectives, and which levels use them

| Type | Ends the level when | Levels |
| --- | --- | --- |
| `reach` | the pad opens from the first frame | 1, 3, 7, 10, 14, 18, 22, 29 |
| `clear` | the room is empty and the keycard is in hand | 2, 6, 8, 9, 13, 17, 21, 24, 25, 30, 32 |
| `survive` | the clock runs out, or the room is cleared first | 5, 11, 15, 19, 23, 27, 31 |
| `relics` | the last relic breaks | 4, 12, 16, 20, 26, 28 |

## What is next, in order

| # | Item | Where | Size |
| --- | --- | --- | --- |
| 64 | The cutscene camera walks the level instead of flying through walls | `cinematic.js` | M |
| 65 | Written dialogue with a speaker and a beat, driven by the level rows | `cinematic.js` + `story-levels.js` | L |
| 66 | The NPC's first quest: a dialogue, a choice, a flag, a reward | `main.js` | M |

**The first slice of the brief is still the test:** one level start to finish with a cutscene in, a dialogue
line out and no terminal. Levels 1 and 4 are the two to build it on — `reach` and `relics`, both already
proven.
