# Player report — 1.98.0

Reported after playing to zone 6. Verbatim, then triaged. Nothing here is fixed yet.

> SOME WALLS ARE PASS THROUGH, I CAN FIND LIFT, ENEMIES TELEPORT TO ROOMS RANDOMLY I GO, FIX THEIR PETROL PATH,
> THERE IS NO GAME SAVE AND RELOAD, JOURNAL AND INVENTORY DOESNT WORK OR OPEN, CHECK ALL BUTTONS SETTINGS AND
> CONROL TO WORK, ENEMIES REDER BOXES AT FAR AFTER NEAR THEY RENDER PROPERLY, SOME GET STUCK IN WALL, I PLAYED
> TILL LEVEL 6, GAMES IS BIT BORING

## Triage

| # | Report | Severity | Where to look first |
| --- | --- | --- | --- |
| 1 | Some walls are pass-through | **critical** | `circleBlocked` in `level.js`; the cell extent it tests against is `[c-0.5, c+0.5] * CELL`, so a wall drawn on a cell boundary and collided one cell off would let a body through. Check a door cell, a secret wall and a crate: all three are `solid` in different ways |
| 2 | Enemies teleport to rooms | **critical** | `enemies.js` `tryStep` fallback: when a step fails it may snap to `best` from the flow field, which is a teleport if `best` is a distant cell. Also the warden's `summon` and `spawnWave` place bodies directly |
| 3 | Enemies stuck in a wall | high | `circleBlocked` with `this.radius`; a body spawned or pushed into a solid cell never leaves it because every step is blocked |
| 4 | No save and reload | high | `saveRun`/`loadRun` exist and smoke asserts them; the *UI* path may be missing — the continue button and the menu that offers it |
| 5 | Journal and inventory do not open | high | `toggleInventory` / `showDiary` set `game.state = 'paused'` and show a screen; check the key handlers and that `hideScreens` does not close them immediately |
| 6 | Check every button, setting and control | high | `audit-flow.mjs` walks 13 steps and passes, so this needs a *complete* pass: every key, every button, every slider |
| 7 | Enemies render as boxes at distance | medium | the LOD proxy: `LOD_DIST = 12` swaps the rig for a single slab. It was a draw-call saving; at 12 m it is close enough to see |
| 8 | The lift cannot be found | medium | one per level, in 2 of 9 zones, with no marker. It is a discoverability problem, not a generator one |
| 9 | "A bit boring" by level 6 | design | nine zones of "clear the room, walk to the pad". This is the item that matters most and is measured by nothing |

## What the report says about the gates

The suite passes 885 assertions and the flow audit walks thirteen steps, and a player still found nine problems in
six zones. Every one of the nine is a thing a *player* does that no test does: walk into a wall, look for a lift,
press every key, play past zone three.

## Issue 5 — what has been ruled out

| Suspect | Verdict |
| --- | --- |
| The markup | `#diary` and `#inventory` are `<section class="screen">` inside `#screens`, both present |
| The CSS | `.screen { display:none }` and `.screen.on { display:flex }`, no per-id override that would hide either |
| The wiring | `showDiary()` and `toggleInventory()` both call `showScreen(...)` and `releaseLock()` |
| The key handler | `if (e.code === 'Tab') toggleInventory(); if (e.code === 'KeyJ') showDiary();`, behind `if (game.state !== 'playing') return;` |
| A programmatic keydown | `tools/audit-controls.mjs` dispatches every bound key and both panels change state |
| The harness | it could not have caught a visibility bug: the DOM stub knew four screens by name, so `showScreen` could not turn these on at all. Fixed at 1.99.0 — a panel assertion now checks `.on` and content, not just `game.state` |

**What is left** is how a real keypress reaches the page while the pointer is locked: browser focus, or `Tab` being consumed as focus traversal before the handler sees it. The player's one-word answer — does the game freeze, or does nothing happen — separates those two, and nothing else does.
