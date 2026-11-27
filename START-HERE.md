# HELLGATE — start here

A cold-start brief. Read this, then `HANDOVER.md`, then `documentation/design-brief.md`.

## The prompt to give the next session

> Continue HELLGATE — a Doom-style 2.5D browser arena FPS at https://github.com/drsamonline/Hellgate,
> live at https://drsamonline.github.io/Hellgate/play/. It is at **v2.68.0** on `main`.
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
> WORK THIS NEXT, in order: (1) the level select on the title screen — the map exists but the title screen
> still offers only Start; (2) three of the 32 levels are `survive` clocks with nothing else happening, and the
> brief's NPC quest exists in one room: a second quest, in a room the objective sends you through; (3) the
> nine-zone playability suite runs six seeds of nine zones — give it the 32 levels instead.
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
| Version | 2.68.0 (`VERSION` and `BUILD` agree) |
| Branch | `main`, clean, pushed, CI green (tests + pages) |
| Tests | 1391 playability (all 32 levels) + 764 in the other three suites; eight static gates; smoke, flow, run, invariants |
| Modules | 48 in `play/src/` |
| Releases | 173, `v1.0.0` → `v2.68.0` |
| Performance | **131** draw calls a frame at the median, **170** at the worst level, budget 200 — `node tools/drawcalls.mjs` |
| Roadmap | 61 shipped, 3 measured-and-rejected, 2 open of 66 |

## What shipped in this run

| Release | Item |
| --- | --- |
| 1.91.0 → 1.99.1 | Nine releases: the audit tail, instanced bodies, silhouettes, shadows, catwalks, lifts, the pause panels |
| **2.0.0** | **The campaign: the `relics` objective, a HUD that counts, and 32 levels** |
| **2.1.0** | **The story on screen: a camera that walks the level, written dialogue, and a job for the helper** |
| **2.2.0** | **The campaign is the game: 32 levels, level progression, and a map in four acts** |
| **2.3.0** | **The gate is a place you cross — the `reach` door fixed, and all 32 levels in the playability suite** |
| **2.3.1** | **Start actually starts the campaign — the seed box was never empty, so nobody saw 2.2.0** |
| **2.4.0** | **The helper sells the door — a choice that changes what ends the level** |
| **2.5.0** | **The helper changes the objective — three relics, and the room stops ending the level** |
| **2.6.0** | **A cutscene out — the camera steps back, and the panel waits for it** |
| **2.7.0** | **The act is the difficulty curve — 0.8 to 1.4 across the four acts** |
| **2.8.0** | **The shop asks first — `V` opens the counter, nothing is bought for you** |
| **2.9.0** | **The guns are sprites; a steeper ladder; richer money; the dialogue spine finished** |
| **2.10.0** | **The guns, second pass — machined bodies, four silhouettes, a fist on the grip** |
| **2.11.0** | **A run is reproducible — the sim stream, the recorder, and a state hash** |
| **2.12.0** | **The replay reaches the player — copy, watch, `?play=1` — and the missing Next button** |
| **2.13.0** | **Catwalks tested and marked — and a crate that stood on one** |
| **2.13.1** | **The level list was off the top of the window — the map scrolls, and smoke now checks layout** |
| **2.14.0** | **Three panels could not be closed on a phone — and a sweep that checks every button the way a thumb does** |
| **2.14.1** | **Every control on all five screens, checked at a desktop and a phone size** |
| **2.15.0** | **The ladder as arithmetic — the act table beside the level table, and a guard against a one-shot** |
| **2.16.0** | **The codex and the achievements learn the campaign — four objectives, four achievements** |
| **2.17.0** | **Every key documented in the game, and a test that keeps the list honest** |
| **2.18.0** | **The game speaks in levels, not zones — the cleared screen, the journal, the toast** |
| **2.19.0** | **A level teaches the first time — five hint sets, and a toast that wraps** |
| **2.20.0** | **The intro follows the floor, and the guns point up the screen** |
| **2.21.0** | **A distant enemy is a figure, not a crate** |
| **2.22.0** | **"Some walls are pass through" — walked into 32 times, never reproduced** |
| **2.23.0** | **The campaign has an end — CAMPAIGN COMPLETE, and the last button goes home** |
| **2.24.0** | **Harden and ship: real screenshots, a working landing CTA, the flake killed, coarser grain** |
| **2.25.0** | **Draw calls measured per level, budget 200, in CI** (the numbers until 2.64.0 were of the wrong scene: median 90 was really 131) |
| **2.26.0** | **The first five minutes, walked and asserted — harden-and-ship complete** |
| **2.27.0** | **One boss per act — the warden, the cinder, the spine and the gate** |
| **2.27.1** | **The four bosses are four fights, asserted by behaviour** |
| **2.28.0** | **Each act brings its own enemies — every campaign body was an imp** |
| **2.29.0** | **The four bosses get their lines — and a scene written twice** |
| **2.30.0** | **The invariants audit plays the campaign — and found a boss on level 25** |
| **2.31.0** | **The act is named where it ends — the cleared panel and the codex** |
| **2.32.0** | **The ladder measured against the rosters it actually sends** |
| **2.33.0** | **Boss rush is four bosses — it played the warden nine times** |
| **2.34.0** | **The guns are 3D models again — the sprites are gone** |
| **2.35.0** | **A lift carries you — #50 shipped with evidence, and a flow-field crash fixed** |
| **2.36.0** | **A level is a document — the map format #63 needs, and `?map=` to play one** |
| **2.37.0** | **The editor — paint the grid, play it, copy it** |
| **2.38.0** | **The editor keeps your work — undo, save, resize** |
| **2.39.0** | **The editor paints heights — a floor that is not the floor** |
| **2.40.0** | **The editor keeps more than one map — a named library** |
| **2.41.0** | **The editor places the spawn — where you start is a decision** |
| **2.42.0** | **A custom map carries its objective — reach, clear, survive or relics** |
| **2.43.0** | **The editor places the bodies — a map fights what you put in it** |
| **2.44.0** | **A map can be sent — a share link, and a name on the HUD** |
| **2.45.0** | **Try again replays the map — and #63 closes** |
| **2.46.0** | **The floor co-op is built on — a lockstep session** |
| **2.47.0** | **The peer has a body — `?coop=1` puts a second player in the arena** |
| **2.48.0** | **The peer can shoot — a hitscan through the same wall test** |
| **2.49.0** | **The peer can be hurt — enemy fire hits whoever is in the way** |
| **2.50.0** | **The peer is on the HUD — `PEER 110 / 110`, and `PEER DOWN`** |
| **2.51.0** | **Two machines, no server — an offer and an answer, pasted** |
| **2.52.0** | **A co-op panel two people can use — host, join, connect, play** |
| **2.53.0** | **#59 measured and deferred with numbers — WebGPU is not a renderer swap** |
| **2.54.0** | **Two runs of the same seed are the same run — asserted** |
| **2.55.0** | **A downed peer can be picked up — `V`, within 2.4 m, for half a body** |
| **2.56.0** | **The 12 m rule was flaky because it was broken — a body-sized margin** |
| **2.57.0** | **The peer walks — legs that swing with the body's own speed** |
| **2.58.0** | **The peer's shot is visible — a muzzle flash on every shot** |
| **2.59.0** | **Co-op on a map somebody painted — three features, together** |
| **2.60.0** | **The front page caught up — bosses, editor and co-op on it** |
| **2.61.0** | **The peer survives a level change — and `HG.scene` is a live getter** |
| **2.62.0** | **An audit pass — five defects, one dead end, one clipped screen** |
| **2.63.0** | **The shotgun read as a grey block — the view was 1.02 m from a 0.34 m receiver** |
| **2.64.0** | **The draw-call gate had measured the wrong scene for 39 releases — real numbers, and co-op measured** |
| **2.65.0** | **A duplicate-key gate — five dead keys in `window.HG`, and two more found** |
| **2.66.0** | **Two gates nobody ran had rotted — `audit-flow` and `audit-run` now run in CI** |
| **2.66.1** | **The new CI steps hard-coded this machine's Chromium — they read `CHROME_PATH` now** |
| **2.67.0** | **A downed peer stops walking — and lies over** |
| **2.68.0** | **Act 4 was a wall — 4.4× the act before it, now 2.2×** |

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

## 2.1.0 in detail

| Piece | What it does |
| --- | --- |
| `campath.js` | the cutscene camera's path: `buildFlowField` + `floorHeightAt`, corners rounded to 0.7 m, resampled every 0.4 m |
| `cinematic.playWalk()` | the walk mode, with a 4.5 s budget. The warden's entrance uses it, from the far side of his own room |
| `dialogue.js` | scenes of a speaker and a line, typed at 52 cps, self-advancing after 2.1 s, skipped by any key. All 32 levels have an intro |
| the helper's job | `V` offers it, `1` takes it (120 coins + a trinket, 180 when his room is clear), `2` declines. Carried in `game.flags.keshi` |

## 2.2.0 in detail

| Piece | What it does |
| --- | --- |
| `beginLevel(n)` | a table row dressed on its zone; `wavesTarget` 1, so the pad ends the level |
| progression | `progress.level` / `progress.levels`; an old record is repaired, not discarded |
| the map | 32 rows in four acts with objective, lock state and best score |
| save and resume | the run carries its level; the level decides the seed and the objective |
| modes | Campaign, Nightmare, Hardcore play levels; Endless, Boss Rush, Arena, Daily play zones |

## What is next, in order

| # | Item | Where | Size |
| --- | --- | --- | --- |
| — | Sector portals, second half (#37): a hole in the mesh so you can see and shoot between two sectors | `levelmesh.js` + `level.js` | XL |
| — | Sector portals (#37): a cell with two floors you can walk between | `level.js` + `levelmesh.js` | XL |
| — | Sector portals (#37): a cell with two floors you can walk between | `level.js` + `levelmesh.js` | XL |
| — | The auto-shop has no consent: decide whether it needs a key press | `main.js` | S |
| — | The level select shows no cutscene stills; a thumbnail per act would sell the campaign | `tools/shoot.mjs` | M |

**The first slice of the brief is still the test:** one level start to finish with a cutscene in, a dialogue
line out and no terminal. Levels 1 and 4 are the two to build it on — `reach` and `relics`, both already
proven.
