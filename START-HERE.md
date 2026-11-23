# HELLGATE — start here

A cold-start brief. Read this, then `HANDOVER.md`, then `documentation/design-brief.md`.

## The prompt to give the next session

> Continue HELLGATE — a Doom-style 2.5D browser arena FPS at https://github.com/drsamonline/Hellgate,
> live at https://drsamonline.github.io/Hellgate/play/. It is at **v1.99.1** on `main` (`c47607a`).
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
> derivation and nothing may "adjust" a stat after it; do not redo work marked measured-and-rejected in
> `ENHANCEMENTS.md` without new numbers.
>
> WORK THIS NEXT, in order: (1) the `relics` objective — break N relics and the door opens, in
> `updateObjective()` in `main.js`; (2) the HUD line counting `game.objectiveT` while a timer runs; (3) a
> `story-levels.js` table of 32 rows — id, seed, shape, objective — on top of the three objective types that
> already work.
>
> TWO FLAKY ASSERTIONS EXIST: `resuming restores the score`, and the pickup pair before it was fixed. Re-run
> before believing a failure; they have blamed two innocent commits.
>
> REPORTING: tables and bullets, no paragraphs. Blunt, information-dense, no filler, no emojis, no questions.
> End every report with a "Your steps" table for the actions only the user can take.

## State, verified

| | |
| --- | --- |
| Version | 1.99.1 (`VERSION` and `BUILD` agree) |
| Branch | `main`, clean, pushed, CI green |
| Tests | 885 playability + all suites; six static gates; smoke, flow, run, invariants |
| Releases this run | 1.91.0 → 1.99.1, nine of them |

## What shipped in this run

| Release | Item |
| --- | --- |
| 1.91.0 | Audit tail closed — nine findings in the last eleven modules |
| 1.92.0 | #45 instanced enemy bodies — 154 → 78 draw calls at eight imps |
| 1.93.0 | #49 enemy silhouettes, and the invisibility bug 1.92.0 shipped |
| 1.94.0 | #52 object shadows — one tight directional map |
| 1.95.0 | #37 step zero — a height-aware floor query |
| 1.96.0 | #37 step one — catwalks, two sectors in one cell |
| 1.97.0 | The enemy body: joints, muscle, folded arms, muzzles |
| 1.98.0 | #50 lifts — a cell whose floor moves |
| 1.99.1 | The pause-menu panels, and LOD at 24 m |

## Since 1.99.1, on `main`, unreleased

| Commit | Change |
| --- | --- |
| `5d2cb64` | a lift shows on the minimap |
| `1dcc8b9` | the Journal and Inventory buttons did nothing — they set `paused` then called a function that bails unless `playing` |
| `ac7cc1e` | no wall along the side of a ramp |
| `0e68710` | the minimap arrow is a long tapered arrow, and it points at where to go |
| `f0e9485` | chests and coins — 1–3 a level, 25–85 coins |
| `bf268c5` | the helper — a stationary NPC who shoots what walks into his room |
| `9a2081d` | the shop — coins buy ammo, no new key or panel |
| `6a327b3` | kills pay coins |
| `a25d986` | the flaky pickup pair fixed |
| `0abae20` | `objectiveType` — the Gate is a level you cross |
| `c47607a` | `survive` — the Foundry's door opens on a 75-second clock |

**Cut 2.0.0 from this when the objectives work**, and say so in the notes: the wave arena becomes a campaign.
