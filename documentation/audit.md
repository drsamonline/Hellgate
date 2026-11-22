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

## Pass two — reading the damage path

Reading `weapons.js` against `enemies.js` rather than sweeping them found the kind of bug a script cannot:
**every hit drew two damage numbers.**

`Enemy.hurt()` draws the number, because it is the one place every damage source passes through. `weapons.js`
drew it again after calling `hurt()`, in both the hitscan path and the blade. So a shotgun blast showed two
numbers per pellet, and a blade swing showed two for one hit.

Fixed by deleting the two calls in `weapons.js`, with a test that counts the pool cursor: one hit, one number.

## Pass three — invariants over 900 frames

`tools/audit-invariants.mjs` (new) runs the game for 900 simulated frames per zone with input that aims at
the nearest enemy and fires, swings the blade and throws grenades, then asserts what must always be true:

| Invariant | Checked |
| --- | --- |
| Player position finite | `Number.isFinite` on x, y, z |
| Health and armour in range | `0 <= health <= maxHp`, `armour >= 0` |
| Ammo non-negative | Every weapon |
| Player inside the grid | Cell within the level's own bounds, with 2 cells of slack |
| Enemy positions finite, hp in range | Every living enemy |
| No enemy under the floor | Against the cell's own floor height |
| Pools bounded | Particles ≤ 700, decals ≤ 60, projectiles ≤ 120 |
| No orphan enemy mesh | Scene traverse against the enemy list |

Result: four zones, 900 frames each, **all held**. Two real bugs so far from this audit; the invariant tool
stays as the fourth browser gate.

## Pass four — the story flags, and a claim that was not true

Reading `applyClass` against the release notes for 1.70.0 found two things, and the second is worse than a bug.

**A choice paid twice.** `takeChoice()` called `effectsFor(game.flags)`, which sums every flag the run has ever
set, and granted the whole total on top of what the zone start had already given. Choosing mercy a second time
paid for both mercies again.

**A promise with no code behind it.** The 1.70.0 notes said *"haste gives speed, careful gives armour at zone
start"*. The block that would have done it was written against a line that did not exist, so the patch matched
nothing and shipped silently. Speed and armour never changed; only score and pickups did, because those were
wired separately.

Both are fixed in 1.78.0, with three tests that hold one flag each — speed, armour, max health — plus one that
holds the single payment. The lesson is not "test the flags"; it is that a release note is a claim like any
other, and this audit should have checked the claims it made last week, not only the code it read today.

## Pass five — the powers, and a smoke test that lied about the environment

Reading `powers.js` found two powers passing a thinner context than every other damage source:

| Power | What was missing | Effect |
| --- | --- | --- |
| `shockwave` | `hud`, `camera` | No damage numbers for a power that hits everything within 6 m |
| `volley` | `hud`, `camera`, `weapon` | No numbers, and the kill feed said `DOWN` instead of `VOLLEY` |

Both now pass the same context as the shotgun. A test casts **all five powers across all three classes** and
asserts each one changes something observable and goes on cooldown — the first test in the suite that would
notice a power being silently inert.

**And the smoke test was blaming the game for the pod.** It kept the desktop page open while opening a second
mobile page, so two live WebGL contexts ran under the software rasteriser at once and the renderer was killed.
The failure read as `Target closed` at the touch step. The desktop page is closed before the mobile one opens,
and the run is clean.
