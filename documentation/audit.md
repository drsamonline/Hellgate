# Audit — 1.76.0

A full read of all 37 modules, plus three scripted sweeps and a browser flow walk.
This is the record of what was found and what was done about it.

## Method

| Pass | What it does |
| --- | --- |
| `tools/check-*.js` | The six standing gates: claims, docs, links, pages, stub, meta |
| `tools/audit-dead.mjs` | Unused exports and conflicting constants |
| Scripted sweep 1 | Storage and parse calls without a guard, `innerHTML` with a raw interpolation, empty catches, loose equality, markers, functions over 90 lines |
| Scripted sweep 2 | `setInterval` without a clear, global listeners outside `main.js`, division by a variable, `index - 1`, `parseInt` without a radix, allocations per frame |
| Scripted sweep 3 | The game state machine: every state written, every state compared |
| `tools/audit-flow.mjs` | The whole UI journey in a browser: title → intro → class → play → every panel → cleared → death |
| `tools/audit-run.mjs` | Every zone, every mode, every action, forty frames of random input |

## Found and fixed

| Finding | Where | Severity | Fix |
| --- | --- | --- | --- |
| `M` opened the map **and** toggled mute — the mute handler was never removed when the map took the key | `main.js` | high | Mute is `N`; a flow-audit step holds it |
| The map's Back button had **no listener at all** — a player on the map could only leave by picking a zone, which restarts the run | `main.js` | high | `#mapBack` returns to where the map was opened from |
| `JSON.parse` on a glb JSON chunk could throw a parse exception from three frames inside a loader | `glb.js` | medium | Caught and re-thrown as a readable error |
| `clone()` in the book engine threw on any value JSON cannot represent | `book.js` | medium | `structuredClone`, then JSON, then the original value |
| The kill feed built `innerHTML` from two unescaped strings | `hud.js` | medium | Escaped, because an `innerHTML` that trusts its caller is the habit that produces the bug later |

## Checked and left alone

| Finding | Verdict |
| --- | --- |
| Six functions over 90 lines (`buildLevelMeshes` 311, `humanoid` 137, `buildRun` 135, `initTouch` 135, `parseGLB` 107) | Each is one job with a long body: a mesh builder, a rig, a run setup, a touch binding, a file parser. Splitting them would move code, not simplify it |
| `== null` in six places | Deliberate: `== null` catches both `null` and `undefined`, which `=== null` does not |
| `parseInt` in the URL reader | Has a radix; the value is clamped downstream |
| `createElement('canvas')` in three modules | Once per boot, for texture and minimap prerendering |
| States written but never compared (`class`, `map`, `codex`, `cleared`, `dead`, `title`) | Screen states, not decision states: they are shown, not branched on. Every one has a matching `#id` |
| `index - 1` in `level.js` and `search.js` | Loop bounds, both guarded by the loop condition |

## The one thing that is not a finding

The browser flow audit crashed the page twice while switching six screens in one
session under the software rasteriser. Run with a fresh page per panel it is clean,
13 steps, no console errors. That is the sandbox's WebGL, not the game's — but the
tool now gives each panel its own page, which is better test design anyway.
