# Changelog

## 2.83.1 — 2026-11-28

**The new controls gate failed on its first CI run — the third tool to hard-code this machine's Chromium.**

| Piece | What it does |
| --- | --- |
| the fix | `audit-controls` reads `CHROME_PATH` first, then looks in the three usual places — the same pattern as `smoke`, `drawcalls`, `audit-flow` and `audit-run` |
| **the guard, widened** | `check-stamp.mjs` now also fails on `executablePath: '/...'` — a hard-coded browser path is the same mistake wearing a different hat |
| the tally | 2.66.1 a browser path · 2.82.1 a sandbox root · 2.83.0 the same browser path again |

**Why the guard matters more than the fix:** each of these cost one CI run and one release, and each was invisible locally
because the path existed here. The guard turns a class of mistake into a red build.

## 2.83.0 — 2026-11-28

**The map and the codex could not be closed with Escape.** Found by turning `audit-controls` from a reporter into a gate —
it printed a list and exited 0, and its weapon probe read `.id` off an index, so two working keys were reported as dead.

| Bug | Detail |
| --- | --- |
| **the map** | `M` calls `pauseGame()` then `showZoneMap()`, which leaves the **pause screen on underneath the map**. Escape matched no branch — `map` was not in the ladder — so a keyboard player was stuck until they clicked |
| **the codex** | `C` sets state `codex`, which Escape did not know either |
| the fix | both have Escape branches now, and the map's Back button shares `closeZoneMap()` so the two cannot drift apart |
| the gate | 17 keys, 4 panels: every key must change something, every panel must open and close. **CONTROLS CLEAN**, in CI |

**Two false findings first:** `KeyN` is mute, not a panel — my panel map guessed and reported a working key as broken. The
lesson is the same one as the rest of this week: a probe that cannot tell a bug from a guess produces neither.

## 2.82.1 — 2026-11-28

**The check that guards the deploy failed on the deploy runner — for the same reason the deploy could have.** It
hard-coded `/scratch/work/Hellgate`, the path it was written in, and the CI job died with `ENOENT` before it checked
anything.

| Piece | What it does |
| --- | --- |
| the fix | the root is derived from `import.meta.url`, the way every other tool does it |
| **the guard** | the same check now scans `tools/` for a hard-coded `/scratch`, `/home` or `/Users` path and fails |
| another one found | `audit-controls.mjs` pointed at `/scratch/work/repo` — a path that has never existed anywhere. Fixed |
| the detail | comments are stripped before the scan: this file's own header names the path to explain the bug |

**Third time this class of bug has cost a CI run** — a hard-coded Chromium path in 2.66.1, a hard-coded root here, and
the draw-call gate reading a stale scene before that. The pattern is the same every time: a tool that only works on the
machine it was written on.

## 2.82.0 — 2026-11-28

**The cache stamp skipped the import map.** `stamp-cache.mjs` appends `?v=<version>` to every module URL at deploy time,
so a reload after a release is always the new code. It rewrote `play/src/*.js` and `play/index.html` — and left
`"three": "./vendor/three.module.js"` alone, because that URL lives in an **import map**, not in a `from '...'`.

| Piece | What it does |
| --- | --- |
| the gap | the one module URL a browser could keep forever. A three upgrade would have shipped new game code against a cached old three — the hardest kind of bug report to read |
| the fix | a third pattern in the stamper for import-map entries |
| a gate | `tools/check-stamp.mjs` runs the stamper in a **temp copy** — the source tree stays unstamped, which is the design — and asserts the import map is stamped and a second run changes nothing |
| CI | the check is a step |

**Why the source stays unstamped:** `stamp-cache.mjs` rewrites in place and runs only in the deploy workflow. A check
that stamped the working tree would leave the repo dirty after every CI run, so the check copies first.

## 2.81.0 — 2026-11-28

**The daily mode said one thing and did another.** `daily.js` opened with *"one run a day, the same one for everybody"* —
and then used the player's **local** date, so two people in different time zones were never playing the same run.

| Piece | What it does |
| --- | --- |
| the code | unchanged: the local date is the right call. A daily that rolls at **05:30** for an Indian player because it is midnight in UTC is a worse daily for everybody east of Greenwich |
| the comment | says what it does now, and names the cost: no shared run between zones — and the line that has to change if a leaderboard ever exists |
| a test | the same day is the same seed · the next day is a different one · the seed carries a **hash, not a counter** · the key pads month and day (`2026-01-05`) · a different salt is a different run |

**This is a documentation bug with a decision inside it.** The comment described a leaderboard the game does not have;
the code served the player in front of it. The fix was to write down which one is intended, and to pin the behaviour so
nobody "corrects" it by accident.

## 2.80.0 — 2026-11-28

**A readiness pass: every gate run, every number checked.** No features. What the project claims, verified or corrected.

| Gate | Result |
| --- | --- |
| `test-game` | **1,137** assertions, green |
| `test-playability` | **1,391**, all 32 levels, green |
| `test-level` / `test-geometry` | green — 47 seeds, 10.7 rooms average, doors on 47/47 |
| static (8) | green: claims, docs, links, pages, stub, meta, dead code, assets |
| `balance-report check` | green — the act ladder is inside 2.5× per step |
| `audit-flow` | **14 steps** clean, co-op included |
| `audit-run` | every zone, every mode |
| `drawcalls` | median **131**, worst **170**, **190** with a co-op peer — budget 200 |
| `audit-invariants` | 8 targets × 9 checks, then the local browser gives out under SwiftShader |
| `smoke` | **35 checks** pass, then a 20 s wait times out locally — CI runs it on real Chrome |

**Two numbers in the docs were stale and are corrected:** `START-HERE.md` and `HANDOVER.md` both said *764* assertions in
the other suites; it is **1,137**, and has been for weeks. The claims gate checks the numbers it knows about, and it did
not know about this one.

## 2.79.0 — 2026-11-28

**The exit and the relics are checked too — after two wrong checks of my own.** 2.78.0 asked whether each objective was
satisfiable; it did not ask whether the exit could be *walked to*, or whether a relic had spawned inside rock.

| Attempt | What it actually measured |
| --- | --- |
| `reachableCells` contains the exit | **wrong**: that set is the *spawn pool* and deliberately excludes the exit room. All 32 levels reported "the exit is not reachable" — 32 false alarms |
| `doors.filter(d => d.room === exitRoom)` | **wrong again**: door cells carry no `room`, so every level reported "the exit room has no door" |
| the door found by **adjacency** | correct: an exit-room cell with a door beside it. 0 problems |
| relics | each relic's cell must not be rock — 0 problems |

**Two false alarms in a row is the useful outcome.** Both would have looked like catastrophic content bugs in a report;
both were the test asking the wrong question of the right data. The third question is the one the generator actually
guarantees, and it is now the one that is asserted.

## 2.78.0 — 2026-11-28

**Every level's objective can be met — asserted over all 32.** A level whose objective cannot be satisfied is a dead end
twenty levels into a run, and nothing checked it. The playability suite walks the levels; this asks whether each one can
be *finished*.

| Objective | What is asserted |
| --- | --- |
| reach (8) | the exit cell exists, is not rock, and the exit is open from the first frame |
| clear (11) | there is somewhere to spawn that is not the start room |
| survive (7) | the clock is above zero |
| relics (6) | relics were asked for, and **as many are on the floor as were asked for** |
| boss rows | the act has a boss, and the run agrees the level is a boss level |

Result: **0 problems across 32 levels**, and all four objectives in use — `{"reach":8,"clear":11,"relics":6,"survive":7}`.

**One test bug, mine:** the row's `objective` is an object (`{ type: 'reach' }`), not a string, so the first version
counted 32 levels under `"[object Object]"` — the assertion caught it, which is what it is for.

## 2.77.0 — 2026-11-28

**The melee test now drives the AI, not a hand-made attack.** 2.75.0's test called `doAttack()` directly, which proved
the branch and nothing about the machine around it. The AI had, in fact, been fixed in 2.76.0 — the peer is picked as
the target when it is nearer — and the test was still bypassing it.

| Piece | What it does |
| --- | --- |
| the test | a brute one metre from the peer, the player 14 m away, **200 frames of the real game loop**: the brute picks the peer, walks to it and swings |
| what it asserts | it attacks on its own · the peer goes **110 → 82.6** · the player 14 m away is untouched |
| the doc | `HANDOVER.md` said enemies "still hunt the local player"; they have not since 2.76.0. Corrected |

**A test that drives the function instead of the game proves the function.** That is the difference between 2.75.0's
green assertion and this one — and it is why the second one found the documentation was a release behind the code.

## 2.76.0 — 2026-11-28

**Enemies hunt the nearer player.** 2.75.0 made the peer hittable; it was still not a *target* — a brute across the room
from you walked past your friend, because the flow field and every distance in the state machine were built from the
local player's cell.

| Piece | What it does |
| --- | --- |
| the target | `Enemy.update()` picks the nearer body: the local player, or co-op's peer |
| the field | a **second flow field** to the peer, rebuilt with the first every 0.35 s |
| the damage | `doAttack()` takes the target and damages **the body it measured** — the melee and hitscan branches reached for `ctx.player` |
| a test | a grunt closes to **1.0 m** of the peer, never goes near the player **28 m** away, and the peer takes it (**110 → 85**) |

**And a bug this introduced and the suite caught in the same run:** with the target threaded but the damage still
pointing at `ctx.player`, a melee body hit the player from **across the room** — distance measured to the peer, damage
applied to the player. `victim = target || player` is the whole fix, and it is the kind of line that only looks obvious
afterwards.

**Single player is untouched by construction:** every branch hangs off `ctx.other`, which is `null` without co-op.

## 2.75.0 — 2026-11-28

**A melee body can hit the peer.** Every melee branch reached for `ctx.player`, so a brute swinging next to your friend
did nothing to them — and a peer who cannot be hurt by half the enemies is not in the fight.

| Piece | What it does |
| --- | --- |
| `ctx.other` | `enemies.update()` takes the peer and puts it in the context every enemy sees |
| the melee branch | hits **whichever body is nearer** — peer or player — with the same damage |
| the attack trigger | a melee body already chasing you now also swings at a peer standing in its face |
| a test | the brute's melee lands on the peer (**110 → 82.6**) · the player 14 m away is untouched · without a peer the same attack still hits the player (110 → 96.3) |

**And what it is not, said plainly in `HANDOVER.md`:** the peer is a body that can be hit, not a second target the AI
reasons about. Enemies still hunt the **local** player — the flow field is built from the player's cell and `dist` is
player-relative through the whole state machine. A brute across the room from you walks past your friend. Making the
peer a real target needs a second flow field and a target choice in every branch: a slice, not a line.

**Two test lessons, both mine:** the first attempt fought the helper, who shoots anything near him, so the brute died of
Keshi fire before it could swing; the second waited for an AI that never picks the peer as a target. The test drives the
attack directly and asserts the thing that is actually true.

## 2.74.0 — 2026-11-28

**Co-op is in the journey gate now.** Nothing in `audit-flow` touched co-op, which is how three connection bugs shipped
behind a green pipeline: the offer without candidates, the link that died at the first level change, and the desync
check nobody called.

| The step asserts | In a real browser |
| --- | --- |
| a peer body exists | `HG.coop` after `?auto=1&level=1&coop=1` |
| and it is in the scene | `coop.mesh.parent === HG.scene` |
| the HUD reads it | `PEER 110 / 110` |
| **it stalls with nobody there** | `session.starved > 0` — no peer, no step, no guess |
| damage reaches the HUD | `PEER 70 / 110` after 40 |
| nothing threw | a page error fails the step |

The gate is **14 steps** now, and it runs in CI.

**The lesson, one more time:** every gate that did not look at co-op was green while co-op could not connect. A test that
does not exercise a feature is not evidence about it.

## 2.73.0 — 2026-11-28

**The two machines now check they agree — and the check itself was half-blind.** `Session.hash()` existed since 2.46.0
and nothing ever called it, so a desync was silent. Wiring it found a second bug inside it.

| Piece | What it does |
| --- | --- |
| the wire | one channel now carries two shapes: `{kind:'input'}` per frame and `{kind:'hash'}` once a second; `routeCoop()` sorts them |
| the check | every 60 frames the loop sends `stateHash(game, player, enemies)`; a mismatch sets `desyncAt` |
| the report | the game says so: **`OUT OF SYNC AT FRAME n`** on the HUD, and a line in the event log — a desync is now a fact the player sees, not a silent divergence |
| **the bug in the check** | a hash that arrived **before** the local one was dropped, because `receiveHash()` only compared against a hash already recorded. Whichever side sent second was caught; the other half of all mismatches went unseen. It compares whichever arrives second now, and the peer's hashes are kept in a bounded map |

**A test that proved the ordering:** send the peer's hash first and ours second — the mismatch is caught at frame 61, and
`inSync` goes false.

## 2.72.0 — 2026-11-28

**The peer connection survived exactly one level.** `spawnCoopIfWanted()` built a fresh `BroadcastChannel` on every
level start, so a real connection made through the panel was dropped the first time the level changed — and the
incoming half was never wired at all outside the panel's Start button.

| Piece | What it does |
| --- | --- |
| outgoing | a ready `coopLink` wins over the local channel: the session sends over the peer connection on every level |
| incoming | `coopUseLink()` wires `onmessage` too, so what the peer sends reaches whichever session is alive **now**, not the one that existed when the link opened |
| a test | level 1 sends over the link · level 2 sends over the link · and the link has somewhere to deliver |

**Both halves of one bug, found by asserting the second half.** The first test passed with only the outgoing direction
wired — a session that talks and never listens looks identical from the sender's side.

## 2.71.0 — 2026-11-28

**The co-op offer was sent before it had any candidates.** This is the bug that would have made the first real
two-machine test fail, and nothing in the suite could have caught it, because the suite's fake peer connection had no
gathering to wait for.

| Piece | What it does |
| --- | --- |
| the bug | `offer()` encoded `localDescription.sdp` the instant `setLocalDescription()` returned — **before ICE gathered a single candidate**. There is no trickle channel here: the paste *is* the transport, so a candidate-free SDP is a connection that never opens |
| the fix | `waitForIce(pc, 3000)` — wait for `icegatheringstate === 'complete'`, with a three-second ceiling so a slow STUN server cannot hang the button |
| a test | a fake peer connection that gathers slowly: the offer waits **39 ms**, the string **carries a candidate**, a stuck gather gives up, a finished one costs nothing |
| the limit, said out loud | STUN only. Two machines behind **symmetric NATs** need a TURN relay, and a relay is a server — the one thing this project does not have. The panel says so under the state line |

**Why the suite missed it:** every fake `RTCPeerConnection` in the tests returns an SDP instantly and never gathers. A
test double that cannot reproduce the failure cannot catch it.

## 2.70.0 — 2026-11-27

**Every brush says what it does.** Thirteen buttons with no explanation is thirteen guesses — and a `title` tooltip
does not exist on a touch screen, which is where a third of these screens are opened.

| Piece | What it does |
| --- | --- |
| `hint` on every palette entry | one line each: *"ROCK — wall: nothing gets through it"*, *"EXIT — the way out; paint one, or the map has no end"*, *"LIFT — a plate that rises and falls; stand on it"* |
| the line | under the canvas, above the counts, and it follows the brush you are holding **and** the button you are hovering |
| a test | all 13 brushes have a hint · the spawn and exit say what they are for · an unknown code has none · the line names the brush you hold |
| the fit | the canvas cap dropped 46vh → **41vh** so the new line does not push the size row below the fold: 783 of 800 |

**The copy is the feature.** An editor that needs a manual has already failed; these are the thirteen sentences that
replace it.

## 2.69.0 — 2026-11-27

**The fix from 2.68.0 is a gate now.** `balance-report.mjs` gained a `check` mode, and it runs in CI beside the suites:
no act may land more than **2.5×** what the act before it lands, and the first step — the tutorial ramp — is allowed
**3.2×**.

| | |
| --- | --- |
| the rule | arithmetic over `play/src`, no browser, about a second |
| the first step | act 1 is five imps and act 2 is the first real wave, so it is allowed to be steeper |
| proved | with act 4 back at 1.8 the gate exits 1: *"act 4 lands 4.4x what act 3 lands (315 -> 1389)"*; at 1.55 it exits 0 |
| the docs | `HANDOVER.md` lists it under a new **Arithmetic gates** row |

**Why it belongs in CI and the act-shape test does not:** the test reads `ACT_THREAT`, which is the knob. The gate
reads the *measured* ladder, which is what a player meets — and it moves when a roster changes, not only when a
multiplier does.

## 2.68.0 — 2026-11-27

**Act 4 was a wall, and the arithmetic said so.** `tools/balance-report.mjs` measured the act ladder — the hp a player
loses standing still in the first wave of each act:

| act | before | after |
| --- | --- | --- |
| 1 | 61 | 61 |
| 2 | 164 (2.7×) | 164 (2.7×) |
| 3 | 315 (1.9×) | 315 (1.9×) |
| 4 | **1389 (4.4×)** | **689 (2.2×)** |

| Piece | What it does |
| --- | --- |
| the cause | act 4 doubled twice at once: `ACT_THREAT` up **29%** *and* the roster widened from five body types to **seven**, adding the brute and the stalker |
| the fix | act 4's threat 1.8 → **1.55**. The roster stays: seven types is what act 4 is *for* |
| a test | the ladder's shape, not its numbers: four acts, each harder than the last, the last step under **2×**, and act 4 still the hardest |

**This is arithmetic, not a playtest.** It says act 4 was 4.4× act 3 while the acts before it were 2.7× and 1.9×; it does
not say 689 is the right number. A playtest says that.

## 2.67.0 — 2026-11-27

**A downed peer stops walking.** It was still driven by the peer's input after it died, so a dead body strolled around
the arena and the player had to chase a corpse to revive it.

| Piece | What it does |
| --- | --- |
| down | `step()` returns early while the peer is down: no walk, no shoot, no feet |
| the body | it **lies over** (`rotation.z` 1.43 rad, lifted 0.3 m) — a peer at zero health standing up straight reads as a bug |
| up | a revive stands it back up before it takes a step |
| a test | alive it walks 0.59 m · down it lies over · **thirty frames of the peer's own input move it zero** · a downed peer reports no step · revived it stands, holds 55 hp, and walks again |

## 2.66.1 — 2026-11-27

**The new CI steps failed on their first run, for a reason worth keeping.** Both gates hard-coded
`executablePath: '/usr/local/bin/chromium'` — this machine's browser. On the runner the file does not exist, and the job
died with *"Browser was not found at the configured executablePath"*.

| Piece | What it does |
| --- | --- |
| `audit-flow`, `audit-run` | read `CHROME_PATH` first, then look in the three usual places — the pattern `smoke.mjs` and `drawcalls.mjs` already used |
| the reason | a gate that works only on the machine it was written on is not a gate; it is a note to self |

Both pass locally after the change: **13 journey steps**, and **every zone and mode**.

## 2.66.0 — 2026-11-27

**Two gates nobody ran had rotted, and now they run in CI.** `audit-flow` (the journey: title → intro → class → play →
every panel → cleared → death) and `audit-run` (every zone, every mode) existed and were never wired into the pipeline.

| Finding | Detail |
| --- | --- |
| **a 1.x build number in a 2.x game** | `audit-flow` asserted `/build\s+1\./` against the report's build line. It had been failing since 2.0.0, on a regex nobody re-read |
| **a panel read before it arrives** | it asserted the cleared screen's two choice cards on the frame `zoneCleared()` returns — but the panel arrives after the camera's walk back across the room. It waits for the cards now |
| **a boot window too short for a software renderer** | `audit-controls` waited 25 s for `window.HG`; it needs 90 s under SwiftShader — and even then it does not finish here, so it stays a by-hand tool and `HANDOVER.md` says so |
| **the pipeline** | `audit-flow` and `audit-run` are CI steps now, next to `smoke`, `drawcalls` and `audit-invariants` |

Both gates pass locally: **13 journey steps** and **every zone and mode**, in one run each.

**The pattern, for the third time this week:** a check that is not run is not a check. The draw-call gate read a stale
scene for 39 releases; these two asserted a version that no longer exists. What they have in common is that nobody was
reading their output.

## 2.65.0 — 2026-11-27

**The class of bug behind 2.64.0 is now a gate.** `window.HG` had **five** duplicate keys — `scene`, `level`, `enemies`,
`effects`, `projectiles` — and an object literal keeps the last one, so the earlier copies were dead. The dead `scene`
was the one the draw-call gate read for 39 releases.

| Piece | What it does |
| --- | --- |
| `audit-dead.mjs` | parses `window.HG`'s keys and **fails on a duplicate** — "the last one wins, the rest are dead" |
| proved | a duplicate introduced on purpose makes it exit 1 and name the key; the clean tree exits 0 |
| **two more found** | `camera` and `dropTrinket` were each written twice; both removed |
| the export block | the five dead snapshots are gone, with a comment saying why nothing may be added back |

**Also verified, because 2.64.0 implied it:** `audit-invariants.mjs` traverses `HG.scene` to look for enemy meshes that
belong to no enemy. Until 2.61.0 that traversal was of the stale scene, which contains no enemies — the check was
passing because it was looking at nothing. It looks at the live scene now, and it is green.

## 2.64.0 — 2026-11-27

**The draw-call gate had been measuring the wrong scene for 39 releases.** `window.HG.scene` was a snapshot taken at
module load; `scene` is replaced on every level. Every number the gate printed from 2.25.0 to 2.63.0 was of a scene
nobody renders.

| | Old claim | Real |
| --- | --- | --- |
| median | 90 | **131** |
| worst | 122 | **170** (level 9) |
| headroom to 200 | "70%" | **18%** |

On level 9 the stale scene draws **77** calls; the live one draws **170**. The 2.61.0 getter fixed the API; this release
corrects the numbers, the budget's rationale, the docs that quoted them, and adds the measurement nothing had made:

| Piece | What it does |
| --- | --- |
| **co-op measured** | `drawcalls.mjs` also renders level 9 with the peer in the room and **fails** over budget |
| **the peer was expensive** | 32 draw calls unmerged, which put level 9 at **202** — over the budget. `mergeJointMeshes()`, which the enemy bodies already do, brings it to **190** |
| a test | the peer costs about what an enemy body costs (27 meshes against a grunt's 40) |

**Nothing about the game got slower.** It was always 131 and 170; the gate was reading a scene with no level geometry
in it and reporting a comfortable number about nothing.

## 2.63.0 — 2026-11-27

**The shotgun read as a grey block.** The model was right — twin barrels, receiver, pump, wooden stock, bead sight — and
the camera was 1.02 m from a receiver 0.34 m deep, so the receiver filled the corner and the barrels were seen end-on.

| | Before | After |
| --- | --- | --- |
| view | `z −1.02 · yaw −0.10 · scale 0.82` | `z −1.34 · yaw −0.24 · scale 0.80` |
| what you see | one grey rectangle, barrels invisible | the barrels along their length, the bead, the pump |

**The rest of the audit, in the same release:** the invariants gate ran over eight targets locally (gate, kiln, cistern,
levels 1, 9, 17, 25 and 8 with the warden) — nine checks each, no NaN, no leak, nothing under the floor — before the
local Chromium gave out under SwiftShader, which is the known limit here. CI runs the same gate on a real Chrome and is
green.

## 2.62.0 — 2026-11-27

**An audit pass: five defects, one dead end, one clipped screen.** Nothing was added. Everything below was already
shipped and already wrong.

### Code

| # | Finding | Fix |
| --- | --- | --- |
| 1 | **`Editor.fromLevel()` did nothing.** It read `this.maps`, which is never set, so it returned `this` and seeded no grid — the editor opened blank instead of from the run you were in | it imports `exportMap` and seeds the grid (92 → **1168** rock cells at 40×40) |
| 2 | **The lockstep input buffer grew without bound.** With no peer answering, `tick()` never consumes a frame, so `local` grew by one entry per frame — **36,000 entries in ten minutes** | `put()` refuses frames past `frame + LOOKAHEAD`; `LOOKAHEAD` finally does the job its name promised (13 entries after 500 frames) |
| 3 | **`Coop.place()` put the peer at y = 0** — both branches of a ternary passed 0 — so `?coop=1` stood the peer at 0 on a spawn cell 1.1 m up | it uses `floorHeightAt()` (1.10 vs 1.10) |

### Interface

| # | Finding | Fix |
| --- | --- | --- |
| 4 | **Co-op's `Start the run` was pressable before connecting**, which started a level with a peer that could never arrive | disabled until the channel opens, and a line of copy says who hosts and who joins |
| 5 | **The editor clipped its objective row** at 1280×800 — the most common laptop size | tighter gaps, canvas capped at 46vh: the size row now ends at **780 of 800** |
| 6 | Two `#editorCanvas` CSS blocks | one |

### Docs

| # | Finding | Fix |
| --- | --- | --- |
| 7 | `HANDOVER.md` claimed **40 modules and ~13,100 lines**; it is 48 and ~17,600, and its assertion count was three releases stale | corrected |

**Verified:** suite green three runs, eight static gates, a four-route browser sweep with no page or console errors, and
both changed screens measured in a real browser.

## 2.61.0 — 2026-11-27

**The peer survives a level change — and `HG.scene` was a snapshot.** A co-op run is more than one level, and nobody
had ever walked the peer across a boundary.

| Asserted | Result |
| --- | --- |
| the peer exists on the first level | ✓ |
| and again on the second, as a **new** body | ✓ |
| with a fresh frame count, at full health, in the scene | ✓ |
| the old body was removed | ✓ |
| the scene did not grow by a body per level | `145 → 145` |
| standing near the new spawn | `59.5` against `58` |

**The bug the test found was in the debug API, not the game.** `window.HG` exported `scene` **by value**, and `scene`
is replaced on every level (`scene = newScene(zone)`), so `HG.scene` handed out the *first* level's scene forever. Any
probe that added a mesh to it added to a scene nobody renders. It is a live getter now.

## 2.60.0 — 2026-11-27

**The front page caught up with the game.** Two months of work were invisible to anyone who had not been following the
releases: the landing page still described waves, a keycard and five cards of combat, and said nothing about 32 levels,
four bosses, the editor, or co-op.

| Card added | Says |
| --- | --- |
| 32 LEVELS · Four acts, four bosses | the warden, the cinder, the spine and the gate — and each level states what ends it |
| BUILD ONE · Level editor | paint a grid, set heights, place the spawn, the bodies and the objective, play it or send it as a link |
| TWO PLAYERS · Co-op, no server | lockstep: a frame plays when both players' input is in; two pastes to connect |
| the heading | `Clear the wave, open the exit` was one of four objectives — now `Every level says how it ends` |

**Why it matters:** `check-claims.js` keeps the page honest about numbers, but nothing keeps it honest about *scope*.
Three features shipped this month and the page did not mention one of them.

## 2.59.0 — 2026-11-27

**Co-op on a map somebody painted.** Three features built in different weeks, exercised together for the first time: a
painted map, the bodies placed in it, and a second player in the same room.

| Asserted | Result |
| --- | --- |
| the level is the painted map | `coop yard` |
| the spawn is the one that was placed | `6,6` |
| the two bodies that were placed, and no roster | `hound,imp` |
| the peer is in the room, near the spawn | ✓ |
| its health is on the HUD | `PEER 110 / 110` |
| **its shot lands on a body that was painted in** | `37 -> 26` |

**One thing this caught:** my first version aimed the peer with `yaw = π` at a body in front of it. `yaw 0` looks down
`-z`; `π` looks down `+z`. The shot went the other way, which is a test bug — but it is the same sign error that
would have shipped a peer that shoots backwards.

## 2.58.0 — 2026-11-27

**The peer's shot is visible.** It damaged what it hit and made a sound, and nothing on screen said a shot had
happened — so on your machine your friend's kills arrived from nowhere.

| Piece | What it does |
| --- | --- |
| the muzzle | a five-particle flash at the peer's eye, every shot, hit or miss |
| a test | a shot throws a muzzle flash — **17 particles** against the effects counter, which exists so a test can trust it |

## 2.57.0 — 2026-11-27

**The peer walks.** Its position was right and its legs were frozen, so it slid across the floor — a thing that reads
as a bug however correct the numbers are.

| Piece | What it does |
| --- | --- |
| the stride | the legs swing from the body's own speed: `sin(stride)` at up to 0.62 rad, and the arms counter-swing |
| standing still | no stride, no swing: the legs rest |
| a test | the peer has legs to swing · standing still the legs rest · walking they swing **1.24 rad** through the cycle · and the two legs are always exactly opposite |
| **and a guard** | every campaign level still has somewhere to spawn after 2.56.0's margin: **0 empty pools**, smallest **154 cells** (level 24) |

## 2.56.0 — 2026-11-27

**The 12 m rule was flaky because it was broken.** `and none within 12 m of the spawn point` failed twice this month.
Both times it was a real bug, not a flake.

| What | Detail |
| --- | --- |
| the rule | nothing spawns within 12 m of the spawn point — a hard constraint |
| the bug | the pool filter excluded cells whose **centre** was within 12 m. A body is jittered up to **0.3 m** and a brute is **0.78 m** wide, so part of a body could sit inside the rule |
| the fix | a **1.4 m margin** on both exclusions in `spawnWave()` — the largest jitter plus the widest body |
| the pool | still healthy: smallest is **154 cells** (level 24), and no level empties |
| the test | now asserts the body **edge**, not only its centre: `distance − radius <= 12` must never happen |

**The lesson, again:** a flaky assertion on a hard constraint is not a flake. Re-run once to rule out timing, and if it
comes back, look at the code the assertion describes.

## 2.55.0 — 2026-11-27

**A downed peer can be picked up.** The peer could die and then lay there for the rest of the run, which made dying
the end of the partnership.

| Piece | What it does |
| --- | --- |
| `V` next to a downed peer | brings it back at **55 hp** — half a body, not a whole one |
| the reach | **2.4 m**: a revive you can do from across the room is not a revive |
| the order | a downed peer is the first thing `V` picks up, before the helper and before a terminal, because it is the most urgent thing on the floor |
| a test | a standing peer cannot be revived · one across the room is out of reach and cannot be picked up · one at arm's length can · it comes back at exactly 55 · and `V` on a standing peer still does what `V` always did |

## 2.54.0 — 2026-11-27

**Two runs of the same seed are the same run — asserted.** Co-op and every replay rest on that sentence, and nothing
had ever tested it end to end: the RNG is a module global, so a run that leaves it dirty changes the next one.

| What is asserted | How |
| --- | --- |
| the same seed and inputs give the same state hash | a scripted 90-frame input (forward, then strafe, then stop) through `Player.update()` on a level built from the seed |
| the same position, to a millimetre | `22.561,11.410` both times |
| the same twenty random numbers | drawn the way a wave would draw them, compared digit for digit |
| and the same number of draws | `simDraws()` |
| another seed is another run | so the test is not comparing a constant |

**What this would have caught:** any `simRand()` drawn from a stream left over from the previous run — the exact
failure mode that makes two machines drift apart while both look correct locally.

## 2.53.0 — 2026-11-27

**#59 measured, and deferred with numbers.** The roadmap said "measure before committing". Measured.

| Question | Answer |
| --- | --- |
| Is WebGPU a renderer swap? | **No.** The vendored three is **r187**, which ships its WebGPU backend as a *third* file (`three.webgpu.js`) that is not vendored here |
| What breaks under `WebGPURenderer`? | the classic materials are not the path: **51** `MeshLambertMaterial`/`MeshBasicMaterial` constructions across `play/src/` each become a node material, and **3** hand-written `ShaderMaterial`s in `bloom.js` become TSL |
| What else moves? | `renderer.info.render.calls`, which the draw-call gate reads, is a different shape there — the gate would need a rewrite to keep measuring the same thing |
| What would it buy? | nothing measured: the game runs at **88 draw calls median, 115 worst**, against a budget of 200 |

**Deferred, not rejected.** Three to five days of material work for a renderer the game does not need at this draw
count. If a future level or effect pushes the count past 200, that is the signal to reopen it — with the number.

**And the sweep that came first:** title, level 1, level 32 (boss) and `?coop=1` all load and play with no page
errors, and the draw-call gate still passes across all 32 levels after seven co-op releases.

## 2.52.0 — 2026-11-27

**A panel two people can use.** 2.51.0 built the wire; nothing carried the strings. Now there is a screen for it.

| Piece | What it does |
| --- | --- |
| **Co-op** on the title | opens the panel: *two machines · no server · two pastes* |
| Host | makes an offer, shows it, **Copy** puts it on the clipboard — 720 characters in a real browser |
| Join | paste an offer, get an answer to send back |
| Connect | paste the answer, and the data channel opens |
| Start the run | begins a level with the peer in it, and the session sends over the data channel instead of `BroadcastChannel` |
| a test | every control exists, the panel opens as a state, and the offer → answer → finish flow runs against a fake peer connection |

**And the test stub taught me something about itself:** `document.querySelectorAll('.screen')` finds nothing in it,
because the stub creates elements on demand and they carry no markup classes. The test puts the class on first, which
is what the real page does.

## 2.51.0 — 2026-11-27

**Two machines, no server.** `BroadcastChannel` is a wire for two tabs on one machine. This is the wire for two
machines, built with nothing to host — because this project hosts nothing.

| Piece | What it does |
| --- | --- |
| `play/src/rtc.js` | an offer becomes a **string you can paste**; the other side answers with another; the first pastes it back. Two pastes and a data channel |
| the signal | base64 JSON with a version and an app tag, so a paste from another build or another project is **refused**, not half-accepted, and whitespace from a chat window is not a failure |
| the transport | `send`, `onmessage`, `close` — the same shape as `broadcastTransport()`, so `Session` does not know which wire it is on |
| no WebRTC | an inert transport rather than a crash: the game can ask for one and carry on |
| a test | the codec round-trips, rubbish and foreign signals are refused, and the plumbing is exercised against a fake peer connection: offer → answer → finish, remote descriptions set, send after close goes nowhere |

**One fix the fake found:** a data channel can arrive **already open** (`ondatachannel` fires after the handshake), and
waiting for an `onopen` that has been and gone never ends. The transport reads `readyState` on attach now.

**What it is not yet:** there is no lobby, no matchmaking, and no `?rtc=` in the game — the transport exists and is
tested, and wiring it to the paste flow is the next slice.

## 2.50.0 — 2026-11-26

**The peer is on the HUD.** A second body whose state you cannot see is a second body you cannot help.

| Piece | What it does |
| --- | --- |
| the line | `PEER 110 / 110` under the zone line, in the same lettering, and `PEER DOWN` when the peer is out |
| the state | `coop: { hp, max, alive }` on the HUD state, so the HUD reads the peer rather than reaching for it |
| a test | full health, then `PEER 73 / 110` after 37 damage, then `PEER DOWN`, then empty when nobody else is playing |

**It took three placements to be readable.** At `bottom: 78px` it sat across the armour and ammo row; at `132px` it
sat behind the ability bar; both looked fine in the code and were unreadable in the screenshot. Top left, under the
zone line, is the only place on this HUD with room.

## 2.49.0 — 2026-11-26

**The peer can be hurt.** A second body that cannot be hit is not in the fight.

| Piece | What it does |
| --- | --- |
| the peer's health | 110 hp, the same body as the local player; `damage()` takes it off, zero downs it, and a downed peer takes nothing more |
| enemy fire | `projectiles.update(dt, player, enemies, other)` — an enemy projectile hits **whoever is in the way**, so a peer standing between the imp and the player is the one who takes the fireball |
| the loop | `update()` hands the projectiles the peer, and only while it is alive |
| a test | 30 damage off 110, still standing · a lethal hit downs it · nothing lands on a downed peer · **a fireball hits the peer in the way for 12 and leaves the local player untouched** |

**Two test mistakes, both mine again:** the fireball was spawned four metres back, which is through the spawn room's
wall — a projectile that hits a wall reaches nobody — and the test built its own `Coop` while `HG.update()` hands the
*module's* one to the projectiles. Both are the same lesson: a probe that sets up state the game does not have is not
a probe.

## 2.48.0 — 2026-11-26

**The peer can shoot.** A second body that cannot hurt anything is scenery.

| Piece | What it does |
| --- | --- |
| the trigger | `makeInput(keys, look, fire)` — the local side sends its trigger with its input, so both machines know when the other is firing |
| the shot | a hitscan down the peer's own look, through `raycastWalls()` like everything else, stopping at the nearest body inside its hit radius |
| the numbers | the pistol's 11 damage and a 0.28 s cooldown, so the two sides are the same weight of gun until there is a second arsenal |
| a test | no trigger, no damage · a shot fires once and hits the body in front for 11 · a held trigger does not fire twice in a frame · a body behind the peer is not hit · **a body behind a wall is not hit** |

**Three things the test found, all mine.** The first target was six metres out, behind the spawn room's far wall at
5.06 m — a shot that stops at a wall, which is the system working. The second was 1.7 m *below* the peer's eye line,
because the spawn cell is 1.1 m up and I placed the body on the floor below it. The third was that `coop.pos.y` is
only correct after the peer's first update, so the target has to be placed with `floorHeightAt()`.

## 2.47.0 — 2026-11-26

**The peer has a body.** 2.46.0 shipped the lockstep session; this puts something on the other side of it. `?coop=1`
spawns a second player in the arena, driven by whatever arrives over the channel.

| Piece | What it does |
| --- | --- |
| `play/src/coop.js` | a second `Player`, a mesh, and a session. The peer's input runs through **the same `Player.update()`** the local player runs through — the same movement, the same collision, the same steps |
| the body | the humanoid the NPC is built from, in a colour of its own, facing where the peer looks |
| no peer, no step | `updateCoop()` sends this side's input and steps the peer only when the session has both. With nobody there it stands still and `starved` counts the frames — a guess is a desync |
| `?coop=1` | spawns the body once per level, next to the spawn, with a `BroadcastChannel` for a transport |
| a test | the body exists, moves 4.5 m on a second of forward input, follows with its mesh, stands on the floor, stalls with no input, and does not move the local player |

**A flag read too late.** `?coop=1` was parsed *after* `startGame()` inside `applyUrlOverrides()`, so the level was
built before the flag was set and no body appeared. The browser probe caught it; the flag is read first now.

**What it is still not:** there is no shooting from the second body, no health, no second camera, and no signalling
between machines. Two tabs on one machine is the whole of it.

## 2.46.0 — 2026-11-26

**The floor co-op is built on.** #60 is two players in one arena. It needs three things: agreement on the starting
state, a way to exchange input, and a way to know the machines are still in the same world. 2.11.0's determinism gave
the first and the third; this is the middle one.

| Piece | What it does |
| --- | --- |
| `play/src/net.js` | a **lockstep** session: a frame is played only when both players' input for it is in hand. Neither machine can run ahead, and neither trusts the other's physics |
| player order | inputs come back **player 0 first on both machines**, not local-first — the first version did it local-first and the two machines disagreed about who was player one |
| a stall, not a guess | a frame with no peer input is counted (`starved`) and skipped. A guess is a desync |
| the desync check | `hash(frame, stateHash)` and `receiveHash()` — a mismatch is a fact at a frame, not a suspicion |
| the transport | `broadcastTransport()` over `BroadcastChannel`: two tabs today, a data channel later |
| a test | two sessions exchange inputs, agree on player order, stall rather than guess, detect a desync, and one real message crosses a real `BroadcastChannel` |

**What it is not:** co-op. There is no second body on screen, no rendering of the other player, and no signalling for
two machines. This is the part that has to be right before any of that can be built, and it is the part that can be
tested without a second person.

## 2.45.0 — 2026-11-26

**Try again replays the map, and #63 is closed.** Dying on a custom map and pressing **Try again** called
`startGame(game.seed)`, which builds campaign level 1 from a seed — so the death screen silently replaced the level
you were in with a generated one.

| Piece | What it does |
| --- | --- |
| `playingMap` | the run remembers the map it is playing, not only the one it was handed |
| Try again | replays the map, by name and by grid — asserted: 24 × 24, `retry me`, still the map |
| **#63** | marked shipped in `ENHANCEMENTS.md`: 61 shipped, 3 rejected, **2 open** — WebGPU and co-op, both XL |

**The editor, end to end, in nine releases:** a map format that round-trips all 32 generated levels with zero cell
differences; `?map=` to play one; a paint-the-cells editor with undo, save and resize; per-cell floor and ceiling
heights; a named library; a placed spawn; four objectives; hand-placed bodies; a share link; and a name in the HUD.

## 2.44.0 — 2026-11-26

**A map can be sent to somebody, and it has a name.** `?map=` has taken a base64 map since 2.36.0; nothing in the
editor ever produced one.

| Piece | What it does |
| --- | --- |
| **Share link** | `editor.shareUrl()` builds `<page>?map=<base64 of the whole map>` and puts it on the clipboard. A 24 × 24 map is about 1 kB of URL |
| the name | `toMap()` carries `name`, the map keeps it, `importMap` passes it as `mapName` |
| the HUD | reads the map's name instead of the zone it was dressed in: `THE YARD · RELICS 0/3` |
| Save as | sets the map's name too, so the library entry and the HUD agree |
| a test | the link decodes back into the same grid, the same size, the same exit, the same name — and the HUD reads `THE YARD` |

**And the name went into the wrong object first.** My patch put `name:` in the undo *snapshot* rather than in
`toMap()`, so the map had no name, the link carried none, and the HUD showed the zone. The test caught all three at
once, which is what a test that follows the data from the editor to the HUD is for.

## 2.43.0 — 2026-11-26

**The editor places the bodies.** A custom map fought the act's roster — the same four imps a generated level gets.
A level's encounters are a design decision, and a roster rolled from a seed is not one.

| Piece | What it does |
| --- | --- |
| four bodies in the palette | IMP, GRUNT, HOUND, BRUTE — one per cell, and placing on an occupied cell replaces what is there |
| the cell under a body | stays what it was: a body is not a kind of floor |
| the map | `enemies: [{ type, x, z }]`, carried by `importMap` |
| the game | `startWave()` spawns exactly those and skips the roster entirely — no wave, no boss, unless one was placed |
| the canvas | a body is a dot in its type's colour |
| the read-out | `24 × 24 · 484 open · 92 rock · 3 placed · objective: reach` |
| a test | placed, replaced, counted, carried by the map, undone, and played: **three bodies, no roster, of the types placed** |

## 2.42.0 — 2026-11-26

**A custom map carries its objective.** A painted map was always "reach the exit", because it was played as campaign
level 1 and level 1 is a reach level. The designer decides now.

| Piece | What it does |
| --- | --- |
| four objectives | REACH, CLEAR, SURVIVE 60s, 3 RELICS — one row in the editor, and the choice is written into the map |
| the map | `objective: { type, time, relics }`, carried through `importMap` |
| the game | `buildRun()` reads the map's objective instead of the level row's: the door state, the clock and the relic count all follow it |
| the read-out | the editor's line ends with `objective: relics` |
| a test | each of the four plays as itself — reach opens the door at once, clear shuts it, survive carries 45 s, relics puts five on the floor and the HUD reads `BREAK THE RELICS · 5 LEFT` |

**And two things the test caught in my own plumbing:** `setPendingMap()` was handed a map document and `buildRun()`
wanted a level (it threw on `level.cells`), and relics live on `game.relics`, not on `level.relics`. Both fixed, and
`setPendingMap()` now imports a map document on the way in.

## 2.41.0 — 2026-11-26

**The editor places the spawn.** A map's spawn was the first open cell, top left — fine for a room, wrong for a level:
where you start is the first thing a designer decides and the last thing a corner can guess.

| Piece | What it does |
| --- | --- |
| a SPAWN brush | one marker, carried beside the grid rather than painted into it, because you stand on it and the cell has to stay open |
| on rock | placing it on rock opens the rock: a spawn you cannot stand on is not a spawn |
| the canvas | drawn as a pale dot, so you can see where it is |
| the map | carried as `spawn: { x, z }` in world coordinates, which `importMap` already read |
| undo, resize, load | all carry it: undo puts the marker back where it was |
| a test | placed, carried by the map, restored on import and on load into the editor, and undone |

## 2.40.0 — 2026-11-26

**The editor keeps more than one map.** One slot is the wrong shape for the thing people do: keep four ideas and play
them in turn.

| Piece | What it does |
| --- | --- |
| `play/src/maplib.js` | a named library in `localStorage['hellgate.maps']`: `save`, `load`, `remove`, `names`. Twelve maps, 24 kB each, newest first |
| the UI | a name box, **Save as**, a picker, **Load**, **Delete** |
| the name box | cleared after a save and the picker pointed at what was saved — otherwise the next name types onto the end of the last one, which is exactly what happened in the browser walk |
| a corrupt store | reads as empty, not as a crash: the store is JSON in localStorage and localStorage can be anything |
| a test | two maps save, both list newest-first, each loads by name, a nameless map is refused, a long name is cut to 24, delete works twice-safely, and a corrupt store reads empty |

**And the dead-export audit could not see a namespace import.** `import * as mapLib` then `mapLib.save()` is a use of
`save`, but the audit only parsed named imports and reported four exports of the new module as unused. It understands
`import * as` now.

## 2.39.0 — 2026-11-26

**The editor paints heights.** The last thing it could not do, and the one that turns a room painter into a level
designer: a cell that is not at floor level.

| Piece | What it does |
| --- | --- |
| the height brush | a HEIGHTS toggle, four floor presets (0, 1.2, 2.4, 3.6) and two ceilings (3.4, 6.0) |
| the map | `toMap()` writes the real per-cell heights, run-length encoded, so a flat level is still five numbers |
| the canvas | a raised floor is drawn amber, brighter the higher it is — a balcony you cannot see is a balcony you will not build |
| the read-out | `24 × 24 · 484 open · 92 rock · 11 raised · heights: floor 2.4, ceil 3.4` |
| undo and resize | both carry heights, not just cells |
| a test | a cell raised to 2.4 with six metres of air survives the map, imports as a sector, and `floorHeightAt` puts a body at 2.4 there |

**A float cost a run.** Heights were stored in a `Float32Array`, where 2.4 is 2.4000000953674316 — every equality in
the map, the import and the test was wrong, and `2.4 + 1.2` came out as 3.5999999999999996. Plain arrays, and the
ceiling is rounded to a centimetre. A format that must round-trip cannot lose the number on the way through.

## 2.38.0 — 2026-11-24

**The editor keeps your work, takes it back, and changes size.** Three of the four things 2.37.0 was missing.

| Piece | What it does |
| --- | --- |
| **undo, redo** | one step per *stroke*, not per cell: a drag across twenty cells is one undo. Forty states deep — a 24 × 24 grid is 576 characters, so the whole stack is 23 kB |
| **save** | the grid goes to `localStorage` on every stroke end, every resize and on the Save button, and comes back when you open the editor. Verified across a full page reload |
| **resize** | 16 / 24 / 32 / 40, keeping whatever fits and rocking the new edge. Undoable, like everything else |
| the tests | a six-cell drag undoes in one step; redo puts it back; the stack says when it is empty; a painted exit survives a resize; a grid under 8 is refused; save and load round-trip through a stubbed `localStorage` |

**What is still missing:** per-cell heights. A map is one flat room at 3.4 m, so there are no balconies and the lifts
in it go nowhere. That is the next slice, and it is the one that turns this into a level designer rather than a room
painter.

## 2.37.0 — 2026-11-24

**The editor.** #63, second slice: a grid you can paint, and the two buttons that matter — play it, and take it away.

| Piece | What it does |
| --- | --- |
| `play/src/editor.js` | a flat grid of cell codes, a brush, a canvas, and `toMap()` — the same document format 2.36.0 shipped |
| the palette | open, rock, door, exit, stair, lift, crate, secret |
| the canvas | pointer down and drag paints; a pointer position is converted to a cell and back, so it works on a phone at any size |
| the read-out | `24 × 24 · 476 open · 100 rock`, live under the canvas |
| play it | the painted grid becomes a map, the map becomes a level, and the game plays it — 24×24, the size you painted |
| copy it | the map JSON on the clipboard, which is also what `?map=` takes |
| seeded | opened from a run, the editor starts from the level you are standing in |

**What it is not yet:** there is no save, no undo, no resize, and no way to set a cell's height. A map is one flat
room at 3.4 m. Those are the next three slices, in that order.

## 2.36.0 — 2026-11-24

**A level is a document.** #63 has been the roadmap's biggest item for a year — a level editor — and the thing it
needs first is a level that can leave the generator: a grid you can write down, send, and play.

| Piece | What it does |
| --- | --- |
| `play/src/maps.js` | `exportMap(level)` → a grid of one character per cell (`#` solid, `.` open, `+` door, `X` exit, `=` stair, `^` lift, `~` crate, `s` secret, `c` chest, `n` the helper) plus run-length encoded floor/ceiling heights |
| the round trip | **all 32 levels, 0 cells differ** — solid, floor, ceiling, door, exit and secret all survive |
| the size | the largest is **6,812 bytes** of JSON, which is a URL, not a file |
| `?map=<json>` or `?map=<base64>` | the game plays a map it was handed instead of generating one, once, and only for that run |
| a test | the round trip over every level, a map that is not one refused, and a shared map played: same 1,600 cells, 429 of them walkable |

**Two bugs the round trip found, both in the map, not the game:** a secret wall came back solid (it is walk-through
after it breaks), and crates and secrets came back without their grid index, which the mesh builder reads. The mesh
builder threw on both — which is exactly what a test that *plays* the imported level is for.

## 2.35.0 — 2026-11-24

**A lift carries you — and a crash under a stale flow field.** Item #50 has been on the roadmap as open since 1.98.0,
when the lift shipped. It works; nothing had ever asked whether the *player* rides it.

| Piece | What it does |
| --- | --- |
| the ride | a lift cell carries its own `c.lift.y`, rises and falls at 1.6 m/s with a 1.2 s dwell, and `updateLifts()` moves the plate mesh with it. **12 of the 32 levels** generate one |
| the assertion | the player stands on the plate and is 1.97 m higher three seconds later, foot within 5 cm of it |
| #50 | marked shipped in `ENHANCEMENTS.md` with that evidence — 60 shipped, 3 rejected, 3 open |
| **a crash** | `buildFlowField()` threw on an out-of-range start cell (`level.cells[start].solid` of undefined) instead of returning an empty field. It returns one now |

**And a test that lied for one run.** A raw cell has `x` and `z`; `wx` and `wz` live on `reachableCells`. My first
version placed the player at `c.wx` — `undefined` — and reported "the player rises 0.00 m", which reads exactly like
a product bug. It is the second time this session that mistake has cost a run.

## 2.34.0 — 2026-11-24

**The guns are models again.** 2.9.0 replaced four 3D view models with canvas sprites — one flat quad per gun — and a
picture in the corner of the screen does not read as a weapon you are holding. The models are back, and framed
properly for the first time.

| Piece | What it does |
| --- | --- |
| the four models | restored from 2.8.0: the pistol's slide, grip, hammer and sight; the chaingun's six barrels, bearing, ammo box and carry handle; the shotgun's twin barrels, pump, wooden stock and bead; the rocket launcher's tube, muzzle ring, back blast and two grips |
| `VIEW` | each gun framed on its own — position, yaw and scale — because a chaingun and a pistol do not want the same corner |
| the distance | at the old 0.55 m the receiver sat under the near plane and the gun filled the screen; they are at 1.0–1.12 m now, at 0.78–0.82 scale |
| the flash | it rides the muzzle, which moved with the gun |
| a test | four groups of parts, not flat quads; no sprite frames left; the muzzle flash lights on a shot and goes out |

**What went with the sprites:** the canvas gun art, its palette, and the two-frame texture swap. Nothing else did —
the kick, the sway, the swap dip, the aspect scale and the muzzle flash are the same code.

## 2.33.0 — 2026-11-24

**Boss rush played the warden nine times.** It spawns by zone, and the boss type came from the act — which is zero
outside the campaign — so every zone got the warden, and its own blurb said so.

| Piece | What it does |
| --- | --- |
| `BOSS_FOR_ZONE` | nine zones, four bosses: gate and ashfall the warden, kiln and vault the cinder, spine and cistern the spine, throne and foundry the gate, grove the warden |
| the blurb | `One wave per zone, and a boss at the end of each. Four of them.` |
| a test | every zone has a boss, the table names four different ones, and a boss-rush wave on the kiln brings the cinder |

**And a test that set a mode by passing it as an argument.** `beginZone()` takes `(zone, level, fresh)`; the mode is
a module variable that `selectMode()` writes. My first version passed `'bossrush'` as a fourth argument, which was
ignored, so the wave had no boss and the test looked like a product bug for one run.

## 2.32.0 — 2026-11-24

**The ladder, measured against the enemies it actually sends.** 2.28.0 gave each act its own roster, and the
difficulty report still computed every wave from the imp. It uses the roster now, and the numbers are the fight.

| Act | Enemies | Wave hp | Seconds of shotgun | Incoming dps | Standing-still hp |
| --- | --- | --- | --- | --- | --- |
| I | 5 | 220 | 2.1 | 29 | 61 |
| II | 7 | 347 | 3.4 | 49 | 164 |
| III | 8 | 429 | 4.1 | 76 | 315 |
| IV | 11 | 971 | 9.4 | 148 | 1389 |

| Piece | What it does |
| --- | --- |
| `node tools/balance-report.mjs acts` | the table above, from `ROSTER_FOR_ACT` and the real `TYPES` |
| a guard | no act's first wave may take fifteen seconds of shotgun, and each act must take longer than the one before |
| the footer | it explained a column that had been replaced; it explains the ones that are there |

Act IV takes **9.4 seconds of sustained shotgun** to clear one wave — four and a half times act I, and under the
fifteen-second ceiling the guard now holds it to.

## 2.31.0 — 2026-11-24

**The act is named where it ends.** Beating a boss produced the same panel as beating any other level — `LEVEL
CLEARED` — and the codex listed four bosses without saying what they were for.

| Where | Before | Now |
| --- | --- | --- |
| the cleared screen after a boss | `LEVEL CLEARED` | `ACT 1 COMPLETE`, `ACT 2 COMPLETE`, … and still `CAMPAIGN COMPLETE` on 32 |
| the codex | `not yet met` for every boss | `closes act 1` … `closes act 4` |

Two assertions each: a boss level says the act, a level that is not one still says `LEVEL CLEARED`, and every boss's
codex note names the right act while an ordinary enemy keeps its kill count.

## 2.30.0 — 2026-11-24

**The invariants audit never played the campaign.** It ran three zones — which have three waves each — and asserted
that nothing goes NaN, nothing leaves the level, nothing leaks. The campaign has one wave per level, its own
objectives, its own rosters and four bosses, and none of it had ever been played by the tool built to play it.

| Target | What it covers |
| --- | --- |
| gate, kiln, cistern | the zone path, as before |
| levels 1, 9, 17, 25 | the four act openings — `reach`, `clear`, `survive`, `relics` |
| levels 8, 16, 24, 32 | the four bosses |

**It found a boss on level 25.** The throne's zone carries `boss: true`, and `spawnWave` read `zone.boss` on every
level — so THE GATE appeared on levels 25, 26, 27, 28, 29, 30 and 31, and then again on the level it belongs to. A
campaign level decides by its own row now.

| And | |
| --- | --- |
| in CI | the audit runs after the draw-call gate, on the Chrome the workflow installs |
| `CHROME_PATH` | the audit hardcoded this pod's path; it reads the environment first |

## 2.29.0 — 2026-11-24

**The four bosses get their lines, and a scene written twice.** 2.27.0 added four bosses; the story still had
**THE WARDEN** speaking on the throne floor, where the boss is **THE GATE**.

| Piece | What it does |
| --- | --- |
| four death lines | each boss speaks on its own level's outro: the warden at 8, the cinder at 16, the spine at 24, the gate at 32 |
| the labels | `WARDEN` → `THE WARDEN`, `CINDER` → `THE CINDER`, `SPINE` → `THE SPINE`, so the boss bar, the entrance and the dialogue all say the same name |
| **a scene written twice** | `'the-throne-outro'` existed in the act II block *and* at the end of the table. An object literal keeps the last key, so the first one — the copy with the gate's line in it — was dead data that silently lost |
| a test | no scene key appears twice in `dialogue.js`, checked against the source; every boss level's outro is spoken in by that level's boss |

**Why the first attempt missed:** I keyed the new scenes `the-cinder-outro` and `the-spine-outro`, but those levels
are `the-first-relic` and `the-hinge` — a level with its own outro never falls through to an act scene. The test
caught it in one run; the keys moved into the outros those levels actually use.

## 2.28.0 — 2026-11-24

**Every enemy in the campaign was an imp.** A campaign level is one wave, and `spawnWave` picked its bodies by wave
number — grunts at wave 2, hounds at 4, everything at 6. Wave 1 means imps, so all 32 levels were imps, and the
variety the game has had since 1.9x was unreachable in the campaign.

| Act | Roster | Mean body hp at that act's threat |
| --- | --- | --- |
| I | imp | 44 |
| II | imp, grunt, wisp | 50 |
| III | imp, grunt, hound, spitter | 54 |
| IV | imp, grunt, hound, spitter, brute, stalker | 88 |

| Piece | What it does |
| --- | --- |
| `ROSTER_FOR_ACT` | the act decides what walks at you, in `story-levels.js` beside the boss table |
| `spawnWave({ roster })` | takes the list from the caller; the wave-number ladder stays for endless and boss-rush |
| each act adds | act II adds grunt and wisp, act III hound and spitter, act IV brute and stalker — asserted |
| the balance report | its enemy table was a four-entry mirror; it imports the real `TYPES` now, and prints the roster's mean health beside the imp's |

Act IV's first wave is now 11 bodies with a mean of 88 hp rather than 99-hp imps: a mix is harder than a rank of
the same thing, because a brute soaks a shotgun and a stalker does not stand still.

## 2.27.1 — 2026-11-24

**The four bosses are four fights, not four stat blocks.** 2.27.0 gave them different numbers; this asks them what
they *do*.

| Boss | Asserted |
| --- | --- |
| CINDER | puts a lob in the air within six seconds of seeing you (1 in flight) |
| WARDEN | never lobs (0) — so the lob is a real difference, not a property of bosses |
| SPINE | charges at **9.5 m/s** against a walk of 2.0, and closes 10 m to 1 m in four seconds |
| THE GATE | does both: lobs (1 in flight) and charges (8.0 m/s) |

The warden is the control: a test that only showed "the cinder lobs" would pass if every boss lobbed.

## 2.27.0 — 2026-11-24

**One boss per act.** The campaign had one boss and it was hardcoded: `spawnWave` built a `'warden'` and the entrance
cinematic said `THE WARDEN` whoever walked in. Four acts now end on four different fights, each built from a rule the
act before it taught.

| Act | Level | Boss | Health | The rule it tests |
| --- | --- | --- | --- | --- |
| I | 8 | **WARDEN** | 620 | the brute you spend eight levels learning to circle |
| II | 16 | **CINDER** | 700 | it lobs the arcs the kiln taught you to sidestep |
| III | 24 | **SPINE** | 780 | it charges the way the hounds do |
| IV | 32 | **THE GATE** | 900 | all three at once |

| Piece | What it does |
| --- | --- |
| three new types | `cinder` (lobs, heavier arc), `spine` (charges at 9.5 m/s), `gate` (lobs and charges) — each a boss with its own colour, height and hit radius |
| `BOSS_FOR_ACT` | act → type, in `story-levels.js` beside the level table |
| the level flag | `boss: true` on levels 8, 16, 24 and 32 — the act endings, not every level dressed in a boss zone |
| the entrance | the cinematic now says the boss's own name and `ACT n ENDS`, instead of always `THE WARDEN` |
| the lob | a boss lobs for `lobDamage` (24 / 28) rather than the imp's 15 |
| the bestiary | it counts `Object.keys(TYPES).length`, so the four new bodies did not silently make "kill every type" easier |

## 2.26.0 — 2026-11-24

**The first five minutes, walked and asserted.** The last item of harden-and-ship that does not need you.

| Step | What happens | Asserted |
| --- | --- | --- |
| title | 8 modes, `Enter the gate`, Levels, Watch a replay, Controls, Settings — all reachable | yes, at two sizes (2.14.1) |
| start | the intro panel, typed at 34 characters a second over a camera that follows the floor | words appear; the camera never leaves a solid cell (2.20.0, 2.22.0) |
| class | three cards, each pressable | yes |
| level 1 | `reach` — the door is open from the first frame and the HUD says **REACH THE EXIT** | yes |
| the first hint | three lines, one every four seconds, on a level you have not cleared | arrives within five seconds |
| dying | the death screen, with Copy replay, Try again, World map | yes |

**What I could not measure:** the wall-clock timings. This pod renders at about one frame a second, so the browser walk reported 15 s from Start to the intro and 71 s to playing — numbers about the renderer, not the game. The assertions are driven by `HG.update()` at a fixed step instead, so they say something true.

**Two things the walk did find**, both in my own test rather than the game: the HUD is drawn by the loop, so reading it before a frame reads the previous level's line; and the intro panel types itself, so its text is empty for the first frame.

## 2.25.0 — 2026-11-24

**The performance number nobody had measured.** A draw call is not the whole frame, but it is the part this game
controls, and no release had ever counted one.

| Measured | |
| --- | --- |
| Median, 20 bodies on the floor | **90 draw calls** |
| Worst level (3) | **122** |
| Best level (6) | **14** |
| Budget, now enforced | 200 |

The level geometry is merged, so a frame is bodies and props rather than quads — which is why the numbers are this
low with twenty imps standing in the room. 200 is 70% of headroom above the worst level; the tool fails CI above it.

| Piece | What it does |
| --- | --- |
| `tools/drawcalls.mjs` | loads the game in a real browser, walks all 32 levels with twenty bodies each, renders one frame per level and reads `renderer.info.render.calls` |
| in CI | after the smoke test, on the Chrome the workflow already installs |
| why a browser | the three.js double the suites use has no renderer, so a headless count of the scene graph answers **zero for every level** — and looks exactly like a pass. It did, for one commit, before this was measured properly |

## 2.24.0 — 2026-11-24

**Harden and ship, part one.** Three things that stood between the game and a player who was not me.

| What | Was | Now |
| --- | --- | --- |
| **The landing page's images** | `assets/arena.webp`, `combat.webp`, `exit.webp`, `rocket.webp`, `map.svg`, `favicon.svg`, `og.jpg` — none of them existed. Six 404s on the first page a visitor sees | real screenshots of the game, a map drawn from a generated level's own cells, a favicon and a 1200×630 social card |
| **The landing page's button** | `href="./play/"` — the page lives at `docs/play/`, so "play" pointed at `docs/play/play/` and went nowhere | `../../play/`, which is the game |
| **The flaky assertion** | "resuming restores the score" resumed the save the previous line had just written and asserted 1234 survived. A wave with no live enemy cleared on the first tick, paid the exit bonus, and moved it — for two releases | `resumeRun()` is a function of the save it is handed, so it is handed a synthetic one: `{ ...sv1, score: 4242, wave: 3 }`. The round trip is asserted separately |

| And | |
| --- | --- |
| a new gate | `tools/check-assets.mjs` — every local file a page in `docs/` points at must exist. `check-links.mjs` skips `docs/` as a deploy artefact, which is exactly why six 404s shipped |
| wall grain | per-pixel noise on a 64 px texture, quantised to twelve colours, read as television static at close range. The grain is drawn in 2 × 2 blocks at half the amplitude now, so it reads as a surface instead of fuzz |

## 2.23.0 — 2026-11-24

**The campaign has an end.** Clearing level 32 and pressing **Next level** restarted level 32: `beginLevel()` clamps
to the table's length, so the last button in the game was a loop, and the panel said `LEVEL CLEARED` as if there
were a thirty-third.

| Piece | What it does |
| --- | --- |
| the last level | the panel says **CAMPAIGN COMPLETE** and the button says **Back to the title** |
| the button | on level 32 it returns to the title and clears `game.level`; on any other level it still starts the next one |
| a test | level 5 → `LEVEL CLEARED` → click → level 6; level 32 → `CAMPAIGN COMPLETE` → click → the title, no level left over |

**And a test that dirtied the record.** `zoneCleared()` writes `progress` — level, cleared list, best — so calling
it in a test left the level-select assertion ("level 32 is locked at level 33") reading a world where level 32 was
already cleared. The campaign test snapshots `progress` and puts it back now. A test that changes the state every
other test reads is not a test of the code; it is a test of the order.

## 2.22.0 — 2026-11-24

**"Some walls are pass through" — checked, and not reproducible.** It was the first line of the first player
report and, in three months of releases, nothing had ever walked a player into a wall to see. This does.

| The test | Result |
| --- | --- |
| 32 walks: four levels, eight directions, 90 frames each, from the middle of a room | never ended up inside a solid cell, never overlapping one |
| six bodies chasing the player for four seconds | none ended up inside a wall |

So either the pass-through was fixed by `circleBlocked`'s cell-extent fix at 1.9x and never re-checked, or it is
something the test cannot reach — a *door* left open, a *lift* mid-move, a cell whose geometry and collision
disagree. If you can still walk through a wall, tell me which room and I will start from that cell.

**And the other half of that report** — "some get stuck in wall" — is now asserted too.

## 2.21.0 — 2026-11-24

**A distant enemy is a figure, not a crate.** Past 24 m an enemy is drawn as one mesh instead of ten parts. That
mesh was a box, and a box at 30 m reads as a crate — which is what the first player report said: "enemies render
boxes at far after near they render properly".

| Piece | What it does |
| --- | --- |
| the proxy | a six-sided body that tapers from the shoulders up, in the enemy's own colour, instead of a cube |
| the cost | none: one mesh before, one mesh now |
| a test | the proxy geometry must taper and must not be a box |

**What I could not do:** reproduce the "graphical glitches" you mentioned from a still frame. I looked at the game
at 1280×720 — walls, floor, ceiling, HUD, gun — and found nothing obvious. Flicker, z-fighting and pop-in do not
survive a screenshot, so that one needs a description or a moment: what you see and when.

## 2.20.0 — 2026-11-24

Two things from play: **"the intro still cuts through walls"** and **"the guns are in side views … it seems
sideways"**. Both were true, and both were mine.

| Bug | What it was |
| --- | --- |
| the intro flew through walls | `Story.start()` lerped the camera between the three biggest room centres and the exit — a straight chord between two rooms crosses whatever stands between them. It follows `campath.js` now, the same flow field the enemies use, with the doors opened for the path so the camera flies the level as it will be |
| the guns were side-on | the sprites were drawn in **profile**: a silhouette of a gun lying across the canvas. A first-person weapon points up the screen — the muzzle at the top, the receiver filling the bottom, the barrel short because you are looking down it |

**The third gun pass.** The barrel is a tube now, not a slab: five vertical bands from a lit left edge to a
shadowed right one, a muzzle ring at the far end, and the art drawn at 78% and pushed into the corner so it sits
in the frame like a view model instead of filling it.

**What it still is:** functional art, not good art. A pistol, a shotgun, a chaingun and a rocket launcher that read
as themselves at a glance, in the game's palette, drawn in code. If it wants a fourth pass, it wants one from
someone who can see it while drawing — every judgement here was made from a screenshot after the fact.

## 2.19.0 — 2026-11-24

**A level teaches the first time you play it.** The brief's complaint was "games is bit boring", and a player who
does not know that `V` talks, that the pad is the ring on the minimap, or that a relic takes a shot rather than a
walk is playing a worse game than the one that exists.

| Piece | What it does |
| --- | --- |
| `LEVEL_HINTS` | one line at a time, four seconds apart, on levels 1, 4, 5, 9 and 16 — the places where a rule first bites |
| only on a level you have not cleared | `progress.levels` decides; a hint on a beaten level is a nag |
| **a long toast wraps** | the hint ran off both edges of the screen on its first render: `#toast` was `white-space: nowrap` with no width limit. Over 48 characters it wraps to two centred lines inside `min(92vw, 860px)` |

The toast fix is the part that matters beyond this feature: it was the widest text in the game with no constraint
on it, and any future line of that length would have done the same.

## 2.18.0 — 2026-11-24

**The game speaks in levels, not zones.** The campaign replaced the zones everywhere except the words: clearing
level 12 said **ZONE CLEARED**, the journal was headed with the zone the level is dressed in, and the class toast
named the place rather than the level.

| Where | Before | Now |
| --- | --- | --- |
| the cleared screen | `ZONE CLEARED` always | `LEVEL CLEARED` on a level, `ZONE CLEARED` on a zone run |
| the journal | headed `THE RELIQUARY` (the zone's name) | `LEVEL 12 OF 32 · The Reliquary`, with `ACT 2 of 4 · not cleared yet` |
| the class toast | `MARINE · THE VAULT` | `MARINE · LEVEL 12 · The Reliquary` |

Three assertions pin it: the journal names the level, its title and its act; the cleared screen says LEVEL for a
level and ZONE for a zone.

## 2.17.0 — 2026-11-24

**Every key is documented in the game.** The title screen listed eleven of them; the game answers twenty-one.
`V` (read, talk, shop), `G` (grenade), `F` (blade), `X`, `Q E R`, `TAB`, `J`, `C`, `M`, `N`, `F3` and `F11` were
nowhere a player would look — which is most of what "check all buttons and control" meant.

| Piece | What it does |
| --- | --- |
| a controls screen | every key and its job, in the same row style as the journal, opened from the title and from the pause menu, closed by its own button or `ESC` |
| one table, `CONTROLS` | the list is data, and the panel is drawn from it |
| a test that keeps it honest | it reads the key handler's own source for `e.code === '…'` and fails if any binding is missing from the table. A control added without a line on the screen is a red run |
| it returns where it came from | opened from the title it closes to the title; opened from pause it closes into the run |

**The test is the interesting part.** A documentation table rots; a documentation table checked against the code
that implements it cannot silently rot.

## 2.16.0 — 2026-11-24

**The codex and the achievements learn the campaign.** Both were written for nine zones, and the campaign has 32
levels: `THE GATE IS YOURS` could never fire, because it counts `progress.cleared`, which only zone clears fill.

| Piece | What it does |
| --- | --- |
| four campaign achievements | ACT ONE (every level of act I), TEN DEEP, THE WHOLE GATE (all 32), BOUGHT AND PAID FOR (buy the door) |
| the tally they read | `record.levels`, `record.acts`, `record.doors`, written in `zoneCleared()` from the same `progress` the map reads |
| four codex entries | REACH, CLEAR, SURVIVE, RELICS — what each objective type means, in the words the HUD uses, so "what does BREAK THE RELICS mean" has an answer in the game |

**And an assertion that was a count:** "the codex has an entry for every enemy, trinket and zone" compared the
entry list against a hardcoded total, so adding a fifth kind of entry failed it. It checks coverage by kind now —
eight enemies, six trinkets, nine zones, four objectives.

## 2.15.0 — 2026-11-24

**The ladder, as arithmetic.** The act table moved next to the level table it belongs to, the balance report learned
to read a level, and the four numbers the campaign actually runs on are now printed and guarded.

| Act | Level | Zone | Enemies | Imp hp | Damage per hit | Hits to kill | First wave, standing still |
| --- | --- | --- | --- | --- | --- | --- | --- |
| I | 1 | gate | 5 | 44 | 12 | 10 | 61 |
| II | 9 | kiln | 7 | 65 | 18 | 7 | 259 |
| III | 17 | spine | 8 | 77 | 21 | 6 | 476 |
| IV | 25 | throne | 11 | 99 | 27 | 5 | 1488 |

| Piece | What it does |
| --- | --- |
| `ACT_THREAT` lives in `story-levels.js` | it is a property of the campaign, not of the loop; `main.js` imports it |
| `node tools/balance-report.mjs acts` | the table above, derived from the constants the game reads |
| `node tools/balance-report.mjs normal 26` | the full wave report for one campaign level, act floor included |
| a test | the acts must climb in order, an imp must be tougher each act, and **no act may kill a full-health player in fewer than three hits** |

The last column is an upper bound — the whole first wave landing every hit while you do nothing — and it exists to
compare acts with each other, not to describe a fight. Act IV is 24× act I by that measure and 2× by hits-to-kill,
which is what "steep" means in practice.

## 2.14.1 — 2026-11-24

**Every control on every screen, checked the way a thumb checks it.** The player report said "check all buttons
settings and control to work". This asks the question of all five screens a button can lead to — title, class,
pause, cleared, death — at a desktop and a phone size.

| Screen | Controls found | Unreachable |
| --- | --- | --- |
| title | 12 (Continue is hidden until there is a run) | 0 |
| class | 3 cards | 0 |
| pause | 7 | 0 |
| cleared | 3 | 0 |
| death | 4 | 0 |

**It found nothing.** That is the point: the buttons work, and now a regression makes a red run instead of a
bug report. The two controls that were genuinely broken this week — the level list at y = −404 and the three
panels with no way out — would both have been caught by it.

Two things it had to learn: a `display:none` control is not a broken control (Continue), and the class screen
draws its cards when it is *opened*, not when it is *shown*.

## 2.14.0 — 2026-11-24

**Three panels could not be closed on a phone.** The journal, the codex and the status panel answered `Escape`
and nothing else. A touch device has no `Escape`, so opening any of them on a phone left the player looking at a
panel with no way out — which is what "journal and inventory doesn't work" was.

| Piece | What it does |
| --- | --- |
| a close button on each | a 44 px target in the corner of the journal, the codex and the status panel, wired to the same close functions the keys call |
| and a sweep that would have found it | `smoke.mjs` opens every panel a player can reach, asserts it is on, that it scrolls when it is taller than the window, that **every** button on it is the element under the pointer, and that it closes from its own button |

The sweep is the first thing in this project that checks the UI the way a thumb does. Everything before it asked
the DOM for `innerHTML` or called the handler directly.

## 2.13.1 — 2026-11-24

**The level list was off the top of the window.** Reported from play: "level selector is not accessible from main
menu and unclickable". The button worked and the map opened — but its list started at **y = −404 px**, above the
top of the window, so the first twenty levels could not be seen or clicked.

| Cause | Fix |
| --- | --- |
| `.screen` is a flex column with `justify-content: center`. With 32 rows and four act headers the content is taller than the window, and a centred flex container puts the overflow **above** the top — where nothing can reach it | `.screen` scrolls (`overflow-y: auto`), and the two tall screens (`#map`, `#codex`) start at the top with padding instead of centring |
| nothing checked layout | `smoke.mjs` now opens `Levels` from the title with a **real pointer**, asserts the first row is inside the window and is the element under the pointer, and clicks it to start level 1 |

That is the first check in this project that can see a layout bug: the headless suite has no layout engine, and
every assertion about the map up to now was about `innerHTML`.

## 2.13.0 — 2026-11-24

**Catwalks are tested, marked, and no longer blocked.** The sector model — a cell with two floors, shipped at
1.96.0 — has never had a single assertion about the second one. It has 78 deck cells across 14 levels, and
writing the test found a crate standing on one of them.

| Piece | What it does |
| --- | --- |
| the test | for every level with a deck: a body arriving from the deck height lands on the deck, a body arriving from the floor lands on the floor, and every deck cell is reachable from the spawn. 78 cells, 14 levels |
| **a crate on a deck** | `level.js` placed crates in rooms without checking `c.sectors`, so a crate could stand on a catwalk — its mesh sits at the cell's floor, so it hung 2.4 m up and blocked the deck. Crates skip deck cells now |
| pickups | `randomCell()` skips deck cells: a pickup 2.4 m up is one you cannot see from the floor |
| the minimap | a deck shows as a pale blue square, the way a lift does — otherwise a catwalk is a place you find by walking into a wall and looking up |

**What this is not:** #37's second half — a hole in the mesh so you can see and shoot between sectors — is still
open, and it is the last structural item.

## 2.12.0 — 2026-11-24

**The replay reaches the player.** 2.11.0 made a run reproducible; this gives you the run. `Copy replay` on the
death and cleared screens puts the JSON on the clipboard (or saves it as `hellgate-<seed>-<frames>.json`),
`Watch a replay` on the title loads one back, and `?play=1` plays the last one copied.

| Piece | What it does |
| --- | --- |
| `copyReplay()` | clipboard if the page has one, a download if not, and it keeps a copy in `localStorage` so `?play=1` has something to play |
| `watchReplay(json)` | reads the meta, starts that level fresh, picks that class, and hands the frames to the loop |
| `replayFileName()` | `hellgate-l02-gate-412-60.json` — the seed and the frame count, so two files never collide |

**And a hole this found: the cleared screen had no Next button.** The handler for `#clearedNext` has been
attached since 2.2.0 to an id that is not in the page — `?.addEventListener` made it a silent no-op, so "Next
starts level 6" was a changelog line for a button nobody could press. It exists now, and it works.

## 2.11.0 — 2026-11-24

**A run is reproducible.** `?rec=1` records the input stream and the seed; `HG.replayJSON()` hands you the run as
a string; `HG.loadReplay()` plays it back through the same `update()`. It works because the simulation's
randomness now comes from a stream the seed controls.

| Piece | What it does |
| --- | --- |
| `simrng.js` | mulberry32 seeded from the run's seed. Every random number that changes the world draws from it: enemy wander, spawn cells, pain chance, elite rolls, drops, relic and pickup placement, weapon spread |
| `replay.js` | `Recorder` (a keys bitmask, the fire flag, two look deltas per step), `Player`, and `stateHash()` — an FNV-1a over score, kills, wave, the player's position and stats, and every enemy's type, position and hp, rounded to a centimetre |
| the loop | a replay drives `input` at the top of `update()`; a recorder is fed the same frame before the game consumes it |

**Cosmetic randomness stays on `Math.random`** — particles, music, texture noise. It changes nothing in the
state, and routing it through the stream would spend the stream.

**Two bugs, both found by the determinism test:**

- **A new run began with the last run's money.** `buildRun()` reset kills and score but not `coins` or
  `killsByType`, so a second run started rich and the codex counted every kill twice. `buildRun(seed, zone,
  fresh)` resets both when a run starts — they still carry across levels inside a run, which is what makes the
  shop and the codex a run.
- **The run's clock carried over too.** `elapsed` was never reset, so a wave's time bonus at the end of a run
  depended on how long the session had been open.

**Proven, not asserted:** the same seed and the same inputs hash the same twice; a different seed does not; a
120-frame recording replays to the identical hash (`bd73fe2a`).

## 2.10.0 — 2026-11-24

**The guns, second pass.** The first sprite pass was flat rectangles — the right weapon at a glance, and crude
next to the walls. This one gives each gun a machined body (a three-stop gradient, a lit top edge, a shadow
under it), its own silhouette, and a fist over the grip.

| Piece | What it does |
| --- | --- |
| `metal()` / `wood()` | a gradient body with a 2 px lit edge and a 2 px shadow, the cheapest way to make a rectangle read as metal |
| the four silhouettes | pistol: slide, ejection port, trigger guard, hammer, two sights. Shotgun: twin barrels with a gap, ribbed pump, stock. Chaingun: receiver, six-barrel cluster with rims, an ammo box with rounds, carry handle. Rocket: tube with two bands, a bore, two grips, a railed top |
| the hand | a fist with knuckles and a thumb, drawn **over** the grip — drawn behind it, it read as a plank lying on the floor |
| the firing frame | a muzzle star with a white core, at the barrel, on every gun |

**Still zero external assets:** every gun is drawn into a canvas at load.

## 2.9.0 — 2026-11-24

Four answers from play, shipped together.

**The guns are sprites.** The four weapons were boxes and cylinders lit in a 3D scene — a lot of geometry for
something that is always in the same corner of the screen and never clips. A Doom-era gun is a picture, so each
one is drawn into a canvas in code and put on one plane, with two frames: the gun, and the gun with its muzzle
lit. Zero external assets, as before.

| Piece | What it does |
| --- | --- |
| `gunTexture()` | pistol, shotgun, chaingun and rocket, drawn with rectangles and discs in the palette the models used |
| two frames each | `fire()` swaps to the lit frame, the muzzle timer swaps it back, and a weapon swap always resets to idle |
| one quad per gun | `MeshBasicMaterial`, transparent, `depthTest: false`, 0.44 × 0.34 m at the corner |

**The difficulty ladder is steeper:** `0.80 / 1.10 / 1.40 / 1.80`. Act IV is now more than double act I.

**The money is richer:** the job pays 150 up front and 250 on a cleared room, the relics job pays 300 — so the
250-coin door is one level's work rather than three. The door, the shop prices and the relic's 40 hp are
unchanged.

**The dialogue is the spine:** outros added for the first relic (16), the second relic (28) and the throne (32),
so every scene at an act boundary, both relic levels and the finale has a written intro and outro. The other
levels keep their act's lines.

**Two traps, both found by looking at the render:**

- `WEAPONS[i].id` does not exist — the field is `key`, so all four guns drew the fallback art and looked
  identical. No test could see it: the sprite existed, was the right size, and had two frames.
- A canvas texture needs `colorSpace = SRGBColorSpace`, the same as the painted wall textures. Without it the
  renderer treats the canvas as linear and every dark tone lifts to grey — the guns rendered as white slabs.

## 2.8.0 — 2026-11-24

**The shop asks first.** It used to buy the cheapest thing you were short of the moment you walked within 2.1 m
with coins in your pocket, every 1.2 seconds, without asking — which spent the 250 the door costs while you
stood there reading the offer, and made the offer unreachable. Reported from play, decided: a key press.

| Piece | What it does |
| --- | --- |
| `V` opens the counter | `[1] 20 bullets 40   [2] 8 shells 60   [3] 3 rockets 100   [4] leave   ·   you have N coins` |
| it stays open | a counter you have to walk back to between purchases is worse than the one it replaced. It redraws with the new balance after every buy |
| short of the price | nothing is taken, the line says `NEED n COINS`, the shop stays open |
| the prompt | `V  SHOP` when he has nothing to ask, `V  TALK` when he does |
| no new key, no new panel | the brief asked for that, and it still holds: `V` is the interact key, and the caption is the letterbox |

**What it costs:** the shop is no longer a thing that happens to you when you are rich. Ammo is a decision.

## 2.7.0 — 2026-11-23

**The act is the difficulty curve.** Difficulty was `zone.threat`, and that is a curve over nine places rather
than over 32 levels: a level in act IV dressed in the gate was as easy as the first one. The act is a floor now —
`0.8, 1.0, 1.2, 1.4` — and a zone that is already harder than its act keeps its own number.

| Level | Zone | Act | threat |
| --- | --- | --- | --- |
| 1 | gate | I | 0.80 |
| 12 | vault | II | 1.12 |
| 20 | vault | III | 1.20 |
| 26 | vault | IV | 1.40 |
| 32 | throne | IV | 1.40 |

The same zone at three acts is the proof: 1.12 → 1.20 → 1.40. A zone run is untouched — it is still scaled by
its zone's own threat, because a zone played on its own has no act.

**The level number had to move.** `beginZone(zoneDef, levelN)` takes it now, before `buildRun()` computes the
difficulty. Setting `game.level` after the call — which is what 2.2.0 did — left every level on its zone's
threat, and the curve was inert.

**The pickup pair stops measuring the world.** Its two assertions counted `game.pickups.length` before and after
three frames; a wave that clears drops every pickup and a wave that starts adds some, so the count was a claim
about the level, not about the pickup. They assert the specific pickup now, and the pair has passed six
consecutive suite runs since.

## 2.6.0 — 2026-11-23

**A cutscene out.** The level ends with the camera stepping back across the room instead of a panel appearing
the instant your foot touches the pad. The bookkeeping is done on the first line of `zoneCleared()` — the state
is `cleared` immediately, and every gate that reads it reads the truth — but the panel waits for the camera.

| Piece | What it does |
| --- | --- |
| `outroPath()` | the farthest reachable cell within 12 m, preferring the room you finished in; the exit room is usually the smallest on the level, so it steps back through the open door when it has to |
| the walk | 2.6 m/s, capped at 4.5 s, looking at where you stood; then the panel, the choice cards and the level's last line |
| `cinematic.stop()` and `dialogue.stop()` | a level change cancels a cutscene instead of completing it. A previous level's outro used to fire its callback into the next run and show a panel over it |

**Three bugs found on the way.**

| Bug | What it was |
| --- | --- |
| the camera could sit 15 cm above a raised floor | `sampleCameraPath` interpolates between samples, and a path across a deck edge or a lift cuts through it. Samples are clamped to at least 1.1 m above the floor now |
| `?auto=1&level=N` played a zone | the deep link went through `startGame()`, which never learned about levels: three waves and the zone's objective. It is a level run now, and `?zone=` is still a zone run |
| **a wave could spawn inside 12 m of the player** | `spawnWave()` fell back to *every* reachable cell when its filter emptied — which it does when the player stands at the exit on a small level. That is the rule the brief says must never bend, and CI caught it on a seed the suite plays. Nothing spawns now; an empty wave opens the door, an ambush in a doorway does not |

## 2.5.0 — 2026-11-23

**The helper's third offer: he changes what ends the level.** The brief's line was "a flag that changes the
objective or pays a reward". The job pays, the door pays, and this one changes the objective: on a `clear`
level he tells you there are three relics under the floor, and taking the job turns the level into a `relics`
level — the room stops ending it and the relics start.

| Piece | What it does |
| --- | --- |
| the relics offer | `spawnRelics(3)`, `objectiveType = 'relics'`, the door shut again, `game.flags.keshiRelics = 1`. He pays 200 when the last one breaks, once |
| the order | it comes before the door while it is available: a player who takes it should not be sold a door in the same breath |
| what it does not do | it does not touch the gate. `updateObjective()` reads the relic count exactly as it does on level 4, so the door opens on the count, not on the coins |
| when it is not offered | on a level that already has relics, on a `reach` level, or once the flag is set |

**The shop resumes once he has nothing to ask.** Standing next to him when the door opens buys 60 coins of
shells in the same second the 200 lands — the auto-shop is the shipped design ("the coins are the interface"),
and it is worth a decision rather than a silent fix.

## 2.4.0 — 2026-11-23

**The helper's second offer: he sells the door.** The brief asked for two things from the NPC — a job that
pays, and a choice that *changes the objective*. The job shipped at 2.1.0. This is the other half: once he has
been paid, he will open the door where you stand for 250 coins, relics or no relics.

| Piece | What it does |
| --- | --- |
| the door offer | 250 coins, `game.flags.keshiDoor`, and `openExit()` — he sells the door, he does not open it himself, so the gate keeps one writer |
| when he offers it | after the job is paid, on a level that is not `reach` (which is already open) and whose door is not already open |
| when he does not | a `reach` level, an open door, or a bought door: `npcOfferKind()` decides, and `V` falls through to the terminal |

**A bug the browser found, not the suite.** Standing next to him with 300 coins spent 60 of them on shells
every 1.2 seconds — his shop — so the 250-coin door could never be afforded. The shop does not run while he has
an offer for you now. The headless suite could not see it: the purchase assertion set the coins and called the
handler in the same breath, with no frame in between.

## 2.3.1 — 2026-11-23

**The title screen never started the campaign.** Reported from play: "level 1 has 3 waves still, and gate is
the same as before". Both were true, and both had one cause.

`Start` decided between the campaign and a zone run by asking whether the seed box was empty. The box ships with
`value="hellgate"` in the markup, so it was never empty: every player who pressed Start got the nine-zone gate
with three waves, and 2.2.0's campaign was reachable only through the `Levels` button or a URL.

| Fix | What it was |
| --- | --- |
| `seedTouched` | a flag set by the box's `input` event. A seed the player actually typed still starts a zone on that seed; an untouched box starts the next campaign level, and the box is then set to that level's own seed |
| `beginZone()` clears `game.level` | a zone started after a level kept the level's number, so the zone inherited the level's rules — one wave, and a level's objective |

**Why the probes missed it:** they cleared the seed box before clicking Start, which no player does. The suite
could not see it either — the DOM stub has no markup, so its seed box is empty. The new assertion sets the box
to its shipped value, leaves it untouched, and expects level 1; and a second one types into it and expects a
zone. The probe that found it does nothing but load the page and press Start.

## 2.3.0 — 2026-11-23

**The gate is a place you cross.** A `reach` level has been broken since 1.99: `buildRun()` opened the door on
the first frame and `startWave(1)` shut it again, on every level, every time. The zone that shipped the
objective — the gate — read as a pen you empty, and the six `reach` levels in the campaign did the same.

| Fix | What it was |
| --- | --- |
| the `reach` door | `startWave()` locks the doors unconditionally. It now leaves them open, with the lamps green and the pad lit, when the level's objective is `reach` |
| a relic in the spawn room | `spawnRelics()` kept relics out of the exit room and 8 m from the spawn, but a big spawn room has cells further out than 8 m, and level 28 put one of its five relics in the room you start in |

**The campaign is now what the playability suite plays.** All 32 levels, through `beginLevel()`, once each:
the objective the row names, the door state that follows it, the relic count, the clock, and the two spawn
rules — no enemy in the spawn room, none within 12 m — plus the pad ending the level and the campaign recording
it. 885 assertions became 1391, and the two bugs above were the first two it found.

**And a level select on the title screen.** The map existed but only mid-run. `Levels` on the title opens it,
locked levels cannot be picked, and Back returns to the title rather than to a run.

## 2.2.0 — 2026-11-23

**The campaign is the game.** The 32-level table stopped being a thing you could reach with a URL and became
the progression: START begins the next level you have not cleared, the pad ends the level, and the map is four
acts of eight.

| Piece | What it does |
| --- | --- |
| `beginLevel(n)` | a row from `story-levels.js` dressed on its zone. One wave, one objective: `wavesTarget` is 1, so the pad ends the level instead of advancing to wave two |
| progression | `progress.level` and `progress.levels` in the same record the zones use. A record written before 2.2 is repaired, not discarded — its zones survive and the campaign starts at level 1 |
| the map | 32 rows in four acts, locked past the level you have reached, with the objective and the best score on each. It listed nine zones |
| the cleared screen | `LEVEL 5 · The Cold Stores`, not `ZONE …`, and Next starts level 6 |
| save and resume | the run carries its level. Two levels can share a zone, so the level — not the zone id — decides the seed and the objective on a resume |
| modes | Campaign, Nightmare and Hardcore play the levels. Endless, Boss Rush, Arena and Daily still play zones, and a seed typed in the box still starts a zone |

**What did not change:** the nine zones. They are the palette, the props and the threat each level is dressed
in, and `?zone=` still plays one on its own — which is what the playability suite does, over six seeds each.

**A test caught the pattern again.** The barrel assertions picked `barrels[0]` and fired along a ray that a
nearer barrel could intercept: barrels are placed at random, so the assertion measured the layout. It is
isolated to one barrel now, the same way the hitscan test keeps one enemy.

## 2.1.0 — 2026-11-23

**The story moves off the wall and onto the screen.** Three of the four pieces the design brief asked for.

| Piece | What it does |
| --- | --- |
| `campath.js` | a cutscene camera that walks the level. The path is `buildFlowField` — the BFS the enemies use — so it cannot cross a wall, and `floorHeightAt` gives the height, so it follows stairs and decks. 16 paths over four seeds: no sampled point on a solid cell |
| the warden's entrance | walks in from the far side of his own room instead of orbiting him on a fixed arc that could end inside a wall. 8–12 m, 2.5–3.8 s |
| `dialogue.js` | the story as scenes of a speaker and a line, typed out, letterboxed, skippable. All 32 levels have an intro scene; a finished line advances itself after 2.1 s |
| the helper's job | he asks for something at last. `V` offers it, `1` takes it: 120 coins and a trinket up front, 180 when his room is clear. `2` declines. The flag is in the run save, so a resumed run is not offered it twice |

**Two bugs this found.**

- The cinematic has documented itself as "skippable on any key, any click and any tap" since 1.x. Nothing ever called `skip()` except the tests — the same shape as the `fireCtx()` bug at 2.0.0: a handler that only a test ever calls. Any key or click skips it now.
- `?level=N` only worked with `&auto=1`: `applyUrlOverrides()` returned before it read the parameter, so a deep link to level 4 started the gate. It is resolved before that return, and the title screen is prefilled with the level's own seed.

**A cutscene has a budget.** A long path is walked faster rather than for longer: 4.5 s of walk, then a 0.5 s hold.

## 2.0.0 — 2026-11-23

**The wave arena becomes a campaign.** A level states its objective, and clearing it ends the level.

| Piece | What it does |
| --- | --- |
| `relics` objective | a level spawns N relics, each with 40 hp; a shot chips one, the last one opens the door. Break-by-touch still works, so the old side objective is the same object |
| `updateObjective()` | the one place the gate is decided. `survive` counts the clock down, `relics` reads the count, and a second call in the same frame opens nothing twice — `openExit()` is still the only writer of `exitOpen` |
| HUD objective line | `SURVIVE · 1:14` counts down while the clock runs, `BREAK THE RELICS · 2 LEFT` counts the relics. It was showing `CLEAR THE WAVE` on both |
| `story-levels.js` | 32 rows: id, seed, shape, objective, in four acts of eight. `storyLevelZone()` dresses a row on its zone, so unlocks and the save format are untouched. `?level=N` plays one |
| the clock survives a reload | `saveRun` carries `objectiveT`; a reload on a survive level used to restart the clock at full time |

**A bug this found:** `weapons.js` has had `ctx.damageBarrels`, `ctx.damageCrate` and `ctx.damageSecret`
branches since they were written, and `fireCtx()` never passed any of them. Shooting a barrel, a crate or a
secret wall did nothing at all — only the tests called the handlers directly. All four are wired now, which is
also what makes a relic shootable.

**Rooms grow, and the table says what it delivers.** Acts III and IV ask for 7–11 and 6–9 rooms of 6–10 cells;
on a 40×40 grid that is what fits. Open floor area goes from 429 cells in level 1 to about 580 in level 32.

## 1.99.1 — 2026-11-23

**The pause menu's Journal and Inventory buttons did nothing**

Both handlers set `game.state = 'paused'` and then called `showDiary()` / `toggleInventory()`, and both of those
begin with `if (game.state !== 'playing') return;`. The buttons returned before drawing anything. Reported as
"when they r clicked nothing happens", which is exactly what they did.

That also explains Tab and J doing nothing from the pause screen: same guard, same silent return.

**And the LOD proxy is at 24 m.** It was 12, when a body was 13 draw calls and a slab at distance was worth it.
Since #45 the bodies are instanced, so the cost is per type rather than per enemy — the proxy saved almost
nothing and a box at 12 m was just a box the player could see.

## 1.99.0 — 2026-11-23

**From a player's report, after six zones**

Nine issues, reported in the player's own words and recorded in
`documentation/player-report.md`. This release fixes five of them.

| Report | What it was |
| --- | --- |
| "Enemies teleport to rooms randomly" | `depenetrate` snapped a body to the nearest open cell centre from a two-cell search — up to 2 m in one frame. It steps out at 0.35 m a time from a one-cell search now |
| "Some walls are pass-through" | the catwalk rim was drawn from the neighbour's floor up to the deck on a cell that is open at ground level. It is a thin lip now, so from below the deck is a slab edge above your head |
| "There is no game save and reload" | the save existed and the title screen read it, but nothing wrote one on demand. **Save & quit** is in the pause menu |
| "I can't find lift" | one cell in one room with nothing pointing at it. A hollow blue square on the minimap |
| "Check all buttons settings and control" | `tools/audit-controls.mjs` presses every bound key and reports which one does nothing: all of them work but 3 and 4, which select weapons the marine does not carry |

**Two harness faults found on the way**, both of which had been hiding the truth:

- The DOM stub answered `querySelectorAll('.screen')` with a hard-coded four screens, so `showScreen('inventory')` and `showScreen('diary')` could not turn those panels on in the harness at all. Every panel assertion tested `game.state` and nothing else. The stub now creates the twelve screens the page ships, and a new block asserts both panels are actually on screen with content.
- `depenetrate`'s test held the old one-frame snap, which is the bug.

**Still open from the report:** the journal and inventory need one observation from the player (does the game freeze, or does nothing happen), the LOD proxy boxes need the pickup tests understood first, and "a bit boring by zone 6" is a design decision.

## 1.98.0 — 2026-11-23

**Lifts — #50, on the sector model**

One cell per level rises between the room floor and a balcony 2.4 m up. The balcony is a second sector, which
the catwalk machinery from 1.96.0 already draws and collides with, so the only new thing is a cell whose floor
moves.

| Piece | Change |
| --- | --- |
| Data | `c.lift = { low, high, y, dir, wait }`; `floorHeightAt` returns `c.lift.y` for that cell |
| Generator | a lift beside a balcony sector in a tall room |
| Mesh | the merged level skips that cell's floor and draws a plate in its own mesh, because a merged mesh cannot move |
| Drive | 1.6 m/s, a 1.2 s pause at each end, and the plate follows the cell |

The lift was held back for two releases because `HG.level.lifts` read empty in the browser against one in Node.
It was not a defect: the run had a **different seed** from the one I checked — a level is seed plus shape, and
neither alone identifies one. See pass twenty-three in `documentation/audit.md`.

## 1.97.0 — 2026-11-23

**The enemy body, from cylinders to creatures**

Everything below is inside joints that already existed, so the merged mesh count per body moves by one or two
and the draw calls do not move.

| Part | Before | After |
| --- | --- | --- |
| Shoulder | a cylinder starting at a pivot | a deltoid where the arm meets the torso, then a tapered upper arm |
| Elbow | one cylinder for the forearm | an elbow cap, a forearm narrowing to the wrist, a wrist band |
| Hip and knee | a straight thigh, one cylinder for the shin | a thigh wider at the hip than at the knee, a knee cap |
| Foot | one brick | a foot and a toe box |
| Pose | straight arms at the sides — the walk cycle set absolute rotations, so that was the only pose | folded elbows (−0.62) and arms forward, with the swing riding on top |
| Head | a sphere with a brow | a brow, a jaw with teeth, and a snout with a nose on the imp, spitter and brute |
| Brute | a trapezius floating above its head, then a breastplate across its chest | a narrow bridge from neck to shoulder |

Two of these were defects rather than taste: the trapezius was placed 0.86 of a torso above a joint already 0.92
up, so it hung clear of the body, and the rest pose could not exist because the animation overwrote it.

**Also in this release, from the harness:** the draw-call budgets pin the player's position and both camera
angles, so the same level measures the same frame every run — the level-only number had moved 57 → 80 between
runs because the frustum depended on where the run happened to leave the camera. The level-only ceiling follows
its measurement at 100, and the smoke reload step gets 60 s after timing out twice.

## 1.96.0 — 2026-11-23

**Catwalks — #37 step one: two sectors in one cell**

A tall room gets a deck 2.4 m up across one side, and **the floor below it is still a floor**. That is the
sector model in miniature: `c.sectors = [{floor}, {floor: +2.4, catwalk}]`, and `floorHeightAt(x, z, fromY)`
answers with the one you can stand on from where you are.

| Piece | Change |
| --- | --- |
| Generator | a deck in one tall room per level, plus two stair cells to reach it — one band may only rise 3 × `MAX_STEP`, so the 2.4 m climb is split in two |
| Collision | the player's ground and step queries pass their own height, so the deck is a floor from above and the ground is a floor from below |
| Mesh | the deck surface, and a rim on every side that drops to open air, so it reads as a platform |

The deck appears only in rooms at least 8 cells along, 5 across and 5.2 m tall, which is not every zone: the
zone the game boots into has none. Loosening that is the next commit, not this one.

## 1.95.0 — 2026-11-23

**The ground under #37 — a height-aware floor query**

`floorHeightAt(level, x, z, fromY)` now takes the height you are coming from, and picks the sector you could
step up to when a cell carries more than one. Today every cell carries exactly one sector, so it returns
`c.floor` and all 31 call sites behave identically — the query is in place before the data is, which is the
order that keeps a migration honest.

The selection rule is the one the collision already uses: the highest floor at or below `fromY + MAX_STEP`.
Three assertions hold it: a one-sector cell answers the same with and without a height, a two-sector cell puts
you on the catwalk when you can reach it, and leaves you on the floor when you cannot.

#37 itself is scoped in `ENHANCEMENTS.md` with what it touches: the cell model, this query, the mesh, the 2-D
flow field and every reachability test. Step one is a catwalk on this query; portal edges and lifts follow.

## 1.94.0 — 2026-11-23

**Real-time shadows — #52**

One directional shadow map with a tight 14 m box that follows the player, 1024², PCF, cast by the instanced
enemy bodies and received by the level shell and the doors. The weak 0.3 directional that was already there is
now the caster at 0.55, so the light that draws the shadow is also the light that makes it readable.

| Frame, camera level, gate | Before | After |
| --- | --- | --- |
| The level alone | 56–63 | 57 |
| Eight imps in front | 78–85 | 94 |
| Triangles, eight imps | 8.7k | 24.7k |

The shadow pass costs about 12 draw calls and re-renders the geometry it shadows — the trade the item asked
for, and the ceiling of 120 still holds at 94.

A map covering the arena was the wrong shape: at 40×40 cells the texel is a hand's width. A 14 m box around the
player is 1.4 cm per texel, which is enough for an enemy to cast a legible shadow onto the floor it stands on.
The level does not cast into itself — that is what needs the arena-sized map, and it is why rooms still read
partly as boxes.

## 1.93.0 — 2026-11-23

**Enemy silhouettes — #49 — and an invisibility bug 1.92.0 shipped with**

Same joints, same mesh budget after the merge, more creature: the imp is hunched with its arms hanging below
its knees, a ridge of three spikes down its spine, a heavy brow and a jaw with teeth; the grunt carries a
visible backpack and canister, knee pads, a brow and a muzzle brake on its gun; the brute gets a trapezius
wedge, fists and a short ridge; the spitter and the warden get brows, and the warden a longer ridge.

| Type | Meshes before | After |
| --- | --- | --- |
| imp | 13 | 14 |
| grunt | 16 | 17 |
| brute | 14 | 15 |
| spitter | 13 | 14 |
| warden | 14 | 15 |

Everything added sits inside a joint that already existed, so the merge still gives one mesh per joint and the
draw calls do not move.

**The bug.** 1.92.0 trimmed each instanced mesh's `count` to the number of live bodies. `count` is a draw
*range*, not a liveness filter, and slots are not compacted: with four imp bodies attached and one alive at
slot 3, the mesh drew slot 0 and that enemy was invisible. Found by looking at a screenshot of an imp that
would not appear, not by a test. `count` is the full capacity now, and dead slots hold a zero-scale matrix.

## 1.92.0 — 2026-11-23

**Instanced enemy bodies — #45, and the measurement that had to be fixed first**

A body is 13–16 meshes, one per joint, and every one of them was a draw call. Eight imps in view cost **154**.
Now every body of a type writes its joint matrices into one `InstancedMesh` per joint, so the cost is per type
instead of per enemy: **78**.

| Frame, camera level, gate | Before | After |
| --- | --- | --- |
| The level alone | 47 | 56–63 |
| Eight imps in front of the camera | 154–181 | **78–85** |
| Sixteen imps | 266 | — |

The joints still exist and still animate exactly as before; they simply stop being drawn. The hit flash moves
from per-material `emissive` to per-instance colour — there is no per-instance emissive, and instance colour
multiplies the diffuse, so a body pushed past white reads as white-hot at this art scale. The eyes keep their
own instanced part and their emissive.

A body that arrives after the capacity of 16 is full is drawn the old way, with its own meshes, so this can
never render an enemy twice or drop one. A type with nothing alive sets `visible = false` and costs nothing.

**And the measurement this depended on was broken.** `smoke.mjs` spawned its eight imps at `player.pos + (4, 4)`
— behind the camera — and measured through whatever pitch the run started with. Both draw-call budgets were
green against a frame containing no enemy body: 21 calls with eight imps "spawned", against 47 with the camera
level and nothing spawned. The harness now levels the camera, spawns along the forward vector, and the ceiling
drops 220 → **120**. See pass seventeen and eighteen in `documentation/audit.md`.

Six assertions hold the instancing: bodies take slots, their own meshes stop drawing, the instance matrix is
the joint's world matrix, the flash reaches the instance colour, and an empty type draws nothing.

## 1.91.0 — 2026-11-23

**Audit pass sixteen — the eleven modules nobody had read**

The audit had found a real bug in every module it read closely. It read the last eleven and found nine more,
plus one test that could not fail and two that measured the world instead of the code.

| Finding | Module | What a player saw |
| --- | --- | --- |
| The stair ramp interpolated over the far half of its cell | `level.js` | The last step was `rise/2` — up to 0.7 m, past `MAX_STEP`. A dais taller than a metre was a wall |
| z-band treads and risers were built inside out | `levelmesh.js` | 13 of 20 bands on a test level were see-through from above: every tread faced the void |
| Stair heights ignored `flip` | `levelmesh.js` | 55 of 282 bands rendered climbing the opposite way to the ramp you walked up |
| A full-height wall was drawn at the top of every band | `levelmesh.js` | A staircase you could climb but not see over |
| The dais ignored a 0.5 m ledge already in the room | `level.js` | A seam exactly `MAX_STEP` tall at the platform, and over it once the ramp was short |
| The flow field routed enemies through crates | `level.js` | Enemies walked into a crate and ground against it — the stall #17 fixed for walls |
| Terminals were drawn with replacement | `lore.js` | ~52 % of levels had two terminals with one title; the second paid nothing and read as already read |
| Secret rooms were only offered on the west and east walls | `level.js` | The south wall never held one, and the north wall only at a corner |
| `HUD.damageNumber` was defined twice | `hud.js` | The reduced-motion toggle for damage numbers was in the copy that never ran, so it did nothing |
| `loadProgress` did not validate `best` | `world.js` | A saved record without it threw on the next zone clear |
| The minimap's secret-wall branch was dead | `minimap.js` | Nothing — but two `continue`s where one was meant is how the next bug starts |

**The tests were part of the finding.** The stair normals were invisible to the shell check, because a tread
facing down still has open space under it; the geometry suite now reads every stair cell and requires three
upward treads, its risers, and a ramp that climbs the whole cell. The reduced-motion assertion counted
`document.body.children`, and the numbers live in `#dmgnums`, so it passed either way; it reads the pool
cursor now. The damage-number cursor assertion compared an absolute value against a pool that earlier tests
also advance; it compares the delta. The hit-flash assertion waited a fixed 24 frames and called that "decays
to nothing"; it waits for the decay.

Twelve assertions hold all of it, and the winding one fails on the old code: 13 of 20, 22 of 36 and 10 of 31
bands, exactly the z-band counts.

## 1.90.1 — 2026-11-22

**`HANDOVER.md` — the project in one file**

State, the gates and their order, the release process, the module map, the traps that cost a failed attempt
each, the defect class this codebase keeps producing, what is left on the roadmap, what was measured and
rejected, and how to work on it.

Written so a person or an agent can pick this up cold. Linked from the README.


## 1.90.0 — 2026-11-21

**Every enemy has a voice**

Eight enemy types fired the same 620 Hz blip. `play()` now takes a `pitch` option that multiplies the per-play
jitter, and every type declares a `voice`:

| Type | Voice | Type | Voice |
| --- | --- | --- | --- |
| Wisp | 1.80 | Spitter | 1.10 |
| Imp | 1.45 | Grunt | 1.00 |
| Stalker | 1.30 | Brute | 0.62 |
| Hound | 1.25 | Warden | 0.50 |

Its shot, its pain and its death all use it, so an imp chirps and a brute growls from the same three synth calls.
The melee hit uses the voice too, so a hound's bite is not the player's own swing.

**Four assertions**: every type declares a voice, all eight are distinct, the brute is lower than the imp, and a
pitch of 2 doubles the base jitter.

Roadmap #62 moves from unstarted to partly shipped — the beds and the voices are in, a full bark grammar is not.


## 1.89.0 — 2026-11-21

**One mesh per joint: 68 draw calls down to 43**

The atlas was the wrong target — the level is 4 draw calls of 68, and enemy bodies are 21–23 meshes each. So the
optimisation went where the meshes are.

A joint's own children never move relative to each other; the joint animates as a unit. So the boxes inside a
joint merge without touching the animation. Materials are not merged, so the emissive eyes stay their own mesh.

| Measurement | Before | After |
| --- | --- | --- |
| Imp body | 21 meshes | **13** |
| Grunt body | 23 meshes | **16** |
| Draw calls, gate, wave 2, 1280×720 | **68** | **43** |

A 37 % cut, and the bodies render identically — checked in a screenshot before shipping, because a merge that
loses a transform looks like a body missing an arm, not like a failed test.

**The budgets were tightened to match**: eight enemies under 160 calls (was 240), a merged body at most 18
meshes. A ceiling that is never lowered is not a budget.

Roadmap #45 is half done: bodies are merged, true instancing is still open and would need per-instance colour for
the hit flash.


## 1.88.0 — 2026-11-21

**The texture atlas was measured, and rejected**

The plan was roadmap #47: one material for every surface, five draw calls down to one. The measurement said no.

| Measurement | Value |
| --- | --- |
| Total draw calls, gate, wave 2 | **68** |
| Level meshes | **4** — `floor_tile`, `ceil`, `wall_brick`, `decor:wall_brick` |
| Meshes per enemy body | **21–23** (imp 21, grunt 23, wisp 7) |

An atlas saves at most two calls of sixty-eight and cannot tile: walls use a UV repeat of 2.4, which an atlas
cell cannot express without a `fract()` in a custom shader or subdividing every quad. Two calls saved, a shader
introduced. The real cost is enemy bodies — eight enemies at 21–23 meshes is ~170 meshes — and that is roadmap
#45's job. Recorded in `ENHANCEMENTS.md` with the numbers.

**What was optimised instead**

| Change | Why |
| --- | --- |
| The drone's two per-frame `Vector3` allocations hoisted to module scope | 120 objects a second into the young generation |
| `Player.forward` getter removed | Dead code that allocated on every access and nothing called |
| `classId` validated in `clampSettings` | The one setting that was not validated |

**A settings bug on the way**: `clampSettings` validated seven fields and not `classId`, so a stale or edited
setting could carry a class name no class has into the run. Six assertions hold it now.


## 1.87.0 — 2026-11-21

**A barrel was a circle, not a volume**

`damageBarrels()` projected the shot onto the ground plane and asked whether the barrel's centre was within
0.55 m of that line. There was **no vertical test at all**, so a shot fired at the ceiling above a barrel — or
over the top of it — still set it off.

The barrel is 1.1 m tall and stands on the floor, so the check now reconstructs the ray's height at the hit
distance and requires it to be within the barrel's own span. Aiming over a barrel misses; aiming at it hits.

Two existing barrel tests fired from `y = 0`, which was fine while height did not matter. They fire from the
barrel's own floor height now.


## 1.86.0 — 2026-11-21

**The soak bot never left wave one**

The 90-second soak reported `waves 1` on every difficulty and every seed. The game was fine; the bot was
standing still. It fought until the last enemy died and then held position — and in this game the next wave
starts when you walk to the exit pad, not when the room is clear.

| Change | Why |
| --- | --- |
| With no enemies alive, walk to `level.exit` | Otherwise the soak never sees a wave after the first |
| Close to 5 m instead of holding at 9 m | A shotgun at 9 m is a slow kill, and a slow bot is a shallow soak |

The first version of the exit walk stopped at 1.2 m. The pad triggers at 1.15 m, so the bot stood a tenth of a
metre outside the door it was trying to open — the same off-by-a-limit shape as everything else in this audit,
this time in the tool rather than the game.

It reaches wave two on hard now instead of one everywhere. It is still a coarse proxy: it answers "did it fall
over", not "is it balanced".


## 1.85.0 — 2026-11-21

**The mobile fire button fired once per tap**

```js
input.fire = true;
weapons.tryFire(fireCtx());
setTimeout(() => { input.fire = false; }, 120);
```

Three problems in three lines. The game loop already reads `input.fire` every frame, so a tap produced one shot
and then a flag that stayed true for 120 ms doing nothing. Holding the button did not give automatic fire, which
is what every mobile shooter does. And every tap scheduled its own timer, so tapping quickly stacked them.

It is a held button now: `pointerdown` sets the flag and fires immediately; `pointerup`, `pointercancel` and
`pointerleave` clear it. Same shape as the mouse.

**The smoke test holds the button** in an emulated phone viewport, on the real element, and checks the flag is
true mid-hold and false after release.


## 1.84.0 — 2026-11-21

**The drone: a guard that never ran, and kills that did not count**

Two findings in `companion.js`, both the same defect class as the rest of this audit.

| Finding | What a player saw |
| --- | --- |
| The visibility guard was written twice — `visible = dist > 1.1` followed immediately by `visible = true` | The drone could fill the screen when it drifted onto the camera |
| The drone's `hurt()` passed `onKill: null`, no `hud`, no `camera`, no `weapon` | A kill the drone made did not increase the run's kills, did not score, drew no damage number and never appeared in the kill feed |

`main.js` now wires `onKill`, `hud` and `camera` onto the drone before its update, and the hurt context names
`DRONE`.

**The test is worth describing.** Its first version waited for the drone to find a target it could see — which
depends on where the player happens to spawn. It failed three runs in five. It now asserts the wiring after one
real update frame and drives the kill through the drone's own context: deterministic, and it tests the thing
that changed rather than the level's geometry.


## 1.83.0 — 2026-11-21

**Ammo had no ceiling at all**

Health and armour each had a hardcoded ceiling. Ammo had none: `p.ammo.rockets += 2` on every rocket pickup,
for ever. By wave twenty a long run carries hundreds of rockets, and the scarcity the four weapons are designed
around stops existing.

| Kind | Carry limit |
| --- | --- |
| Bullets | 200 |
| Shells | 60 |
| Rockets | 20 |

`player.addAmmo(kind, n)` clamps to those, and all three pickup definitions go through it — with a test that
the pickup table itself cannot go around the ceiling.

**And a flaky test, fixed at the cause.** The pickup test set `health = 100` and called that full health. Once
upgrades, trinkets or story flags raise `maxHp` above 100, 100 is not full, so the pickup was consumed when the
test expected it left on the floor. It uses `player.maxHp` now.


## 1.82.0 — 2026-11-21

**The ceilings that disagreed with the run**

Three hardcoded limits where the run's own numbers belonged:

| Finding | Where | What a player saw |
| --- | --- | --- |
| `heal(n)` capped health at a literal **100** | `player.js` | A run with 175 max health could never be healed past 100. Every health upgrade past the starting value was worth less than its card said, and the Ember trinket's "heal 2 on every kill" stopped mattering |
| Starting armour had **no cap**, while `addArmor` caps at 100 | `main.js` | Six PLATE upgrades started a run at 145 armour, and the next `addArmor` dropped it back to 100 |
| Resume clamped saved health to the **class's base hp** | `main.js` | Resuming a 175-health run restored at most 110 |

All three use the run's own numbers now: `Math.min(this.maxHp, …)` for health, `Math.min(100, …)` in both
armour paths, `Math.min(player.maxHp, …)` on resume. Four assertions hold the ceilings.


## 1.81.0 — 2026-11-21

**A resumed run was not the same run**

`saveRun()` wrote the numbers a HUD shows and nothing else. A reload in zone three lost:

| Lost on resume | What it cost the player |
| --- | --- |
| `game.upgrades` | Every upgrade taken between zones, silently |
| `game.flags` | Every story choice's effect |
| `game.bookAt` | Where the book had got to |
| `game.killsByType` | The codex's kill counts |
| Relic progress | How many relics were already collected |

All five are saved and restored now, before `applyClass` runs, because that is the function that reads the flags.

**A structural fault underneath it.** The story flags were applied in `applyClass` as *adjustments*
(`baseSpeed *= f.speedMul`), while `recomputeStats()` was a pure *derivation* that overwrote them. Any later
`recomputeStats()` — a trinket restored on resume, an upgrade taken — wiped the flags back to nothing.

`recomputeStats()` now folds the flags into the derivation, so it can be called any number of times and the
numbers come out the same. That is the invariant the stats system needed and did not have.

Twelve new assertions: the save carries upgrades, flags, book position, codex counts and trinkets, resuming
restores all of them, and the flags reach the stats on resume.


## 1.80.0 — 2026-11-21

**No content table may be inert**

The haste/careful bug generalised into a test. Every entry in every content table must move something a player
can feel, and the suite now walks each one:

| Table | Entries | What is asserted |
| --- | --- | --- |
| Trinkets | 6 | Each changes the stat it names — damage, hp, energy, speed, armour, leech |
| Upgrades | 6 | Each changes something after `recomputeStats()` |
| Modes | 7 + campaign | Each differs from campaign in a key that is not `name` or `blurb` |
| Zones | 9 | Distinct seeds, at least three floor-plan shapes, at least three threat levels |
| Classes | 3 | Distinct signatures across hp, armour, speed, damage, energy, weapon, powers |
| Powers | 5 | Each changes something observable and goes on cooldown |

Twenty-five new assertions, and all of them pass — which is the useful result: the tables were already honest,
and the one table that was not, the story flags, was found by reading rather than by sweeping.

Writing the test found two of my own mistakes before it found any of the game's: `sumEffects` takes trinket
**ids**, not trinket objects, and two modes (`nightmare`, `hardcore`) change rules under keys my first check
did not look at. Both were the test being wrong about the contract, which is worth knowing: a new test that
fails on its first run is usually describing the code it assumed rather than the code that exists.


## 1.79.0 — 2026-11-21

**Two powers drew no numbers, and the smoke test was blaming the game for the pod**

Reading `powers.js` against `weapons.js` found two powers passing a thinner context than every other damage
source:

| Power | Missing | What a player saw |
| --- | --- | --- |
| `shockwave` | `hud`, `camera` | No damage numbers, for a power that hits everything within 6 m |
| `volley` | `hud`, `camera`, `weapon` | No numbers, and the kill feed said `DOWN` instead of `VOLLEY` |

Both pass the same context as the shotgun now.

**A test that would have caught it**: the suite casts all five powers across all three classes and asserts
each one changes something observable and goes on cooldown. Nine new assertions, and the first test in the
suite that would notice a power being silently inert.

**The smoke test kept the desktop page open while opening a mobile one**, so two live WebGL contexts ran under
the software rasteriser and the renderer was killed. The failure read as `Target closed` at the touch step and
looked like a game bug for three runs. The desktop page closes first now.


## 1.78.0 — 2026-11-21

**The story flags: one bug, and one claim that was never true**

Reading `applyClass` against the 1.70.0 release notes found both.

| Finding | What happened |
| --- | --- |
| A choice paid twice | `takeChoice()` granted `effectsFor(game.flags)` — the sum of every flag the run had set — on top of what the zone start had already given. A second mercy choice paid for both mercies again |
| Speed and armour never changed | The 1.70.0 notes promised "haste gives speed, careful gives armour at zone start". The patch was written against a line that did not exist, matched nothing, and shipped silently. Only score and pickups were ever wired |

**Correction to 1.70.0:** of the four flags, only `greed` (score and pickups) and `mercy` (max health, via the
choice) did anything. `haste` and `careful` were inert for eight releases.

Both are fixed: the flags are applied in `applyClass`, which is the one place a run's stats are set, and a
choice applies only the delta it created. Four tests hold it — one per flag, and one that a choice is paid once.


## 1.77.0 — 2026-11-21

**Two damage numbers on every hit, and a fourth gate**

Reading `weapons.js` against `enemies.js` found what a script cannot: **every hit drew two damage numbers**.
`Enemy.hurt()` draws the number, because it is the one place every damage source passes through — and
`weapons.js` drew it again after calling `hurt()`, in both the hitscan path and the blade. A shotgun blast
showed two numbers per pellet; a blade swing showed two for one hit.

The two calls are gone, and a test counts the pool cursor: one hit, one number.

**`tools/audit-invariants.mjs`** runs 900 simulated frames per zone with input that aims at the nearest
enemy and fires, swings the blade and throws grenades, then asserts what must always be true:

| Invariant | Check |
| --- | --- |
| Positions finite | Player and every living enemy |
| Health and armour in range | `0 <= health <= maxHp`, `armour >= 0` |
| Ammo non-negative | Every weapon |
| Player inside the grid | Within the level's own bounds |
| No enemy under the floor | Against the cell's floor height |
| Pools bounded | Particles ≤ 700, decals ≤ 60, projectiles ≤ 120 |
| No orphan enemy mesh | Scene traverse against the enemy list |

Four zones, 900 frames each, all held.


## 1.76.0 — 2026-11-21

**A full audit of all 37 modules, and five real bugs**

Three scripted sweeps plus a browser walk of the entire UI journey
(`tools/audit-flow.mjs`, new). The record is in `documentation/audit.md`.

| Finding | Severity | Fix |
| --- | --- | --- |
| `M` opened the map **and** toggled mute — the mute handler was never removed when the map took the key | high | Mute is `N` |
| The map's Back button had **no listener at all** — a player on the map could only leave by picking a zone, which restarts the run | high | `#mapBack` returns to where the map was opened from |
| `JSON.parse` on a glb chunk threw from three frames inside a loader | medium | A readable error |
| `clone()` in the book engine threw on values JSON cannot represent | medium | `structuredClone`, then JSON, then the original |
| The kill feed built `innerHTML` from two unescaped strings | medium | Escaped |

**Checked and deliberately left alone** — six functions over 90 lines (each one job with a long body), six
`== null` (which catch `undefined` too, unlike `=== null`), a `parseInt` that has a radix, three boot-time
canvas allocations, six screen states that are shown rather than branched on, and two `index - 1` loop
bounds. Each with its reason in the audit file.

**The flow audit is the new gate**: title → intro → class → play → journal, inventory, codex, map → the map
key → pause and resume → copy report → cleared, choice, upgrade, map → death. Thirteen steps, and it found
the two high-severity bugs on its first run.


## 1.75.0 — 2026-11-21

**A daily: one run a day, the same seed for everyone**

The seed is the date, hashed with FNV-1a: no server, no account, and two people playing on the same day
get the same level, the same waves and the same spawns. The best score for the day is kept beside it.

| Detail | Why |
| --- | --- |
| `dayKey()` is the **local** date, not UTC | A player's day is their own |
| The hash is in the seed | Two consecutive days are not adjacent seeds |
| The daily overrides the seed box | A daily you can reseed is not a daily |
| A corrupt record is replaced | Same rule as every other store in the game |

The title screen shows the day's seed and best; the DAILY mode button starts it.

**Two miscounted zones, found while wiring it.** A patch meant for `zoneCleared()` had also landed in
`pauseGame()` and `gameOver()`, so pausing and dying each counted as clearing a zone. The record now counts
a zone only when the zone is cleared, and two tests hold that.

**Tests** — 11 new assertions: the seed is stable per day and different across days, the day key is local,
the record repairs itself, a worse score does not replace the best, pausing and dying do not count as
clearing a zone.


## 1.74.0 — 2026-11-21

**Fifteen things worth keeping**

Every number in this game belonged to one run and died with it. `play/src/achievements.js` keeps the small
set worth keeping: a table of predicates over the player's history, checked at the moments that can change
them, stored beside the zone progress.

| Kind | Examples |
| --- | --- |
| Cumulative | 50 kills, 500 kills, 25 elites, every enemy type at least once |
| Campaign | clear the first zone, clear five, clear all nine in one run |
| In a run | reach wave 10, reach wave 20, score 10,000, collect every relic in a zone, finish without dying |

A predicate reads `(run, history)`, and the split is the design: "kill 500 enemies" is a lifetime number,
"clear a zone without dying" is a run. An unlocked achievement stays unlocked even if the predicate would
now be false.

They appear in the **codex** as `DONE` and `GOAL` entries, so they are searchable like everything else, and
an unlock says so once with a toast.

**A corrupt history is repaired, not trusted** — every field is type-checked on load, because this file is
written mid-run and an interrupted write is the likeliest corruption in the game.

**A shadowed global** — the history variable was first called `history`, which shadows `window.history` and
broke `history.replaceState` in `startGame`. The seed stopped reaching the URL. The suite caught it; the
variable is `record` now.

**Tests** — 8 new assertions, including the corrupt-history repair.


## 1.73.0 — 2026-11-21

**The codex: what the run has taught you, searchable on C**

Twenty-three entries, generated from the live tables so the codex can never disagree with the game:

| Kind | What it shows |
| --- | --- |
| Enemy (8) | Real health, damage, telegraph time, how it behaves, and your kill count against it |
| Trinket (6) | What it actually does, and that it is found on a kill |
| Zone (9) | The blurb, the threat scalar and the ambient bed |

The search is `play/src/search.js`, ported from **`search-kit`** (same licence): a tf-idf inverted index
with prefix matching and a Levenshtein fallback, so "kiln fire" ranks the kiln first and a typed "kilm"
still finds it.

`game.killsByType` is now counted on every kill, which is what turns the enemy entries from a stat sheet
into a record of the run.

**Tests** — 11 new assertions: the entry count matches the tables, a kill count shows, a zone name finds
the zone, a typo still finds it, an effect word finds entries, nonsense finds nothing, C opens the codex,
it renders, the search box filters it, and it closes back to the run.


## 1.72.0 — 2026-11-21

**The textures are pixel art now, not photographic mush**

Every surface was drawn with gradients, noise and grain, which reads as fuzz at close range. `pixel.js`
(ported from `art-kit`, same licence) quantises each finished texture to twelve colours by **median cut**
and then applies a **4x4 Bayer dither** before it becomes a texture.

| Step | What it does |
| --- | --- |
| Median cut | Splits the box with the widest channel range until twelve colours remain, then averages each box |
| Bayer dither | Adds a 4x4 ordered threshold before the nearest-colour lookup, so a gradient becomes two flat tones in a pattern |

The result keeps the brick's variation and loses the fuzz: the surfaces read as deliberately pixel art, and
the dither pattern is what makes a 64-pixel texture hold up when it is repeated across a wall.

**Tests** — 3 new assertions: median cut finds four colours in a grey ramp and orders them, a dithered image
uses only its palette, and the Bayer matrix is 4x4.


## 1.71.0 — 2026-11-21

**Every zone has a sound now**

Ported from `audio-kit` (same licence, same author): a bed is filtered noise with a slow LFO on the cutoff
and sparse events on top. It loops for as long as the zone lasts, so the kiln hisses, the cistern runs, and
the throne has an ocean under it.

| Zone | Bed |
| --- | --- |
| The Gate, Ashfall, The Spine | wind |
| The Foundry, The Kiln | fire |
| The Grove | rain |
| The Vault | hum |
| The Cistern | stream |
| The Throne | ocean |

**A limiter on the master bus.** Twelve explosions at once stack to a clip, and a clipped master is the one
thing a player hears as broken. A `DynamicsCompressor` at -6 dB, ratio 18, 3 ms attack sits between the
master gain and the destination.

**Tests** — 8 new assertions, against a fake AudioContext because Node has none: every zone names a bed,
six distinct beds are in use, the bed starts and stops, a bed that declares an LFO gets one, and the noise
buffer is cached per length rather than remade.


## 1.70.0 — 2026-11-21

**The story is a decision now, not a panel you cannot argue with**

Ported from `app-story-engine` (same licence, same author): a branching narrative engine where the book is
data, a choice moves you to another passage, and the effects of that choice are declarative
`{op, var, value}` triples rather than code. The validation is the original's — a book with a choice
pointing at a missing node is **refused**, not read.

| File | What it is |
| --- | --- |
| `play/src/book.js` | The engine, ported: `compile`, `newGame`, `choicesFor`, `advance`, `trail`, `save`, `load` |
| `play/src/zonebook.js` | The campaign as eleven passages: one per zone, two choices each, two endings |

**The choices change the run.** Each choice writes a flag, and the flags are read by the game:

| Flag | Effect |
| --- | --- |
| `mercy` | +12 max health per kind choice |
| `greed` | +20 % score and two more pickups per greedy choice |
| `haste` | +5 % speed per hurried choice |
| `careful` | +8 armour at the start of each zone per cautious choice |

Clearing a zone now asks the question **before** it offers the upgrade. Two runs with the same seed and
different answers are different runs.

**Tests** — 11 new assertions: the book compiles with no warnings, it starts at the gate, the greedy path
records four zones, the flags produce an effect, the same choices replay to the same flags, a broken book
is refused, and taking a choice in the game writes a flag and moves the book on.


## 1.69.1 — 2026-11-21

**The damage test, for the third and last time**

Each version of it placed the enemy somewhere and waited: a wave spawn, then a fireball from a random duel
spot, then a hound walking across a room. All three were tests of the level's geometry, not of damage.

It now finds an open cell 1.2-2.2 m from the player, stands the player there, and puts a hound inside its
own melee range. Twelve clean runs.


## 1.69.0 — 2026-11-21

**Elites: the same enemy, harder, and you can see it coming**

From wave 4, one spawn in eight is an elite. It is not a ninth type to model and animate — it is the same
body with a harder one:

| Change | Value |
| --- | --- |
| Health | x2.2 |
| Damage | x1.35 |
| Scale | x1.16 |
| Rim light | A gold translucent shell, so it reads as one across the room |
| Score | x3 |
| Drop | Always leaves a trinket |

The kill feed says `ELITE GRUNT`, so the thing that took four shotgun blasts is named.

Never on a boss wave: the warden does not need a rim light to be understood.

**Tests** — 5 new assertions: an elite is marked, it carries a harder body, it hits harder, it wears the
rim, and a late wave produces them (measured 51 over 40 waves at a 12.5 % roll).


## 1.68.1 — 2026-11-21

**A damage test that depended on the level**

`enemies dealt damage` spawned a wave and waited for an imp's fireball to land from a random duel spot.
Whether it landed depended on line of sight, so it failed roughly one run in eight. It spawns a hound
instead: melee, adjacent, deterministic. Ten clean runs.


## 1.68.0 — 2026-11-21

**An eighth enemy: the Stalker**

Every ranged enemy so far announced itself with a glow. The Stalker announces itself with a **line**: during
its 0.95 s wind-up it draws a violet beam from its muzzle to your head, and then fires a hitscan that does
22 damage.

| Property | Value |
| --- | --- |
| Health | 30 — the softest ranged enemy |
| Damage | 22, hitscan, wall-checked |
| Telegraph | 0.95 s, drawn as a beam |
| Behaviour | Backs off below 13 m, so it is a duel and not a rush |
| Body | The humanoid rig, thin, hooded, one bright optic |
| Appears | Wave 6 and later |

The telegraph is the point: the beam tells you where the shot comes from and gives you a second to break
the line. It reuses the tracer pool, so it costs no draw call.

**Tests** — 6 new assertions: it spawns, it has a beam colour, it keeps its distance, it hits harder than
an imp, its body is 23 parts, and it is a rig that walks.


## 1.67.0 — 2026-11-21

**A ninth zone: The Spine**

The service corridor under everything. Narrow rooms (8-12 of 3-5 cells), a cold steel-blue palette, grated
floors, dust that drifts, and a threat of 1.16 — between the kiln and the throne.

| Property | Value |
| --- | --- |
| Rooms | 8-12, of 3-5 cells |
| Walls and floor | tech panels over a grate |
| Palette | `[0.84, 1.0, 1.18]` — the only cool-bright zone |
| Threat | 1.16 |
| Story | Three panels, and an epilogue that hands you to the kiln |

**A seventh mode: Gauntlet**

Every zone, one wave each, back to back, no save and no second chance. It uses the existing `waves: 1` and
`noSave` flags, so it is a data row, not a code path.

**Two tests that assumed a fixed count** — "eight zones have stories" and "six modes are defined" now
derive their numbers from the zone and mode lists, so adding content cannot silently pass.

**A flaky damage test** — it spawned a wave and waited for an enemy to walk over. Enemies now spawn at
least 12 m away, so the walk took longer than the test's window. It places one enemy deliberately instead;
a test that waits for the pathfinder is a test of the pathfinder.


## 1.66.0 — 2026-11-21

**The wave started you sealed inside the exit room**

The exit pad is in the exit room. Clearing a wave opens the doors; you walk in; you step on the pad; the
next wave starts — and `startWave` closed every door behind you. The player was then inside a sealed room
with the enemies outside it, no way to reach them and no way to leave. That is the screenshot: wave 3,
seven left, both doors shut, red lamps.

A wave now returns you to the spawn if you are standing in the exit room or within 3.5 m of the pad when
it starts, and says so in the report events.

**The rule you asked for: nothing spawns in the room you start in**

| Rule | Before | After |
| --- | --- | --- |
| Enemies in the start room | allowed | **none, ever** |
| Enemies within 12 m of you | allowed | **none** |
| Enemies within 12 m of the spawn point | allowed | **none** |

Six waves are checked in the test suite, counting enemies in the spawn room and near the spawn point.

**Also asserted** — the exit room is never the spawn room, and the spawn room index is exposed on the
level so a caller does not have to guess it.


## 1.65.0 — 2026-11-21

**Rooms have architecture now**

Every room was four flat walls and a ceiling. A room of five cells or more now gets pilasters on the walls
where there is actually a wall behind them, and a beam across the ceiling if it is taller than 3.4 m.

They are emitted into the level's own per-texture buckets, so a room gains detail and the frame gains **no
draw call** — the same vertex buffers, the same five materials.

| Detail | Placement |
| --- | --- |
| Pilaster | Inset one cell from each corner, only where the cell behind is solid — never in a doorway |
| Ceiling beam | Tall rooms only, spanning the room's own footprint at `ceil - 0.3` |

**The geometry test caught its own weakness** — "every triangle faces open space" is the invariant that
catches a wall with the wrong winding. Decor legitimately faces the wall it is mounted on, so the decor
goes into its own bucket (`decor:<texture>`) and the test skips it: the shell is still checked at 100 %,
and the decor is measured separately. Zero shell triangles face a wall across all five test seeds.


## 1.64.0 — 2026-11-21

**Open 3-D models are an option now**

The game builds every enemy from joints in code and ships no assets — that is why it loads instantly and
looks the same on every machine. It is a constraint, not a rule, so `play/src/glb.js` reads **glTF 2.0
binary** (`.glb`, the open standard) in 200 lines with no library and no build step.

Drop `assets/models/imp.glb` in, add it to `assets/models/index.json`, and that type uses the model
instead of its procedural body. No manifest, no file, or a file the reader cannot handle: nothing changes
and nothing breaks.

| Supported | Not supported |
| --- | --- |
| The `.glb` container (JSON + BIN chunks) | `.gltf` with external buffers |
| `POSITION`, `NORMAL`, `TEXCOORD_0` | Skinning, bones, animation |
| Indices in u8 / u16 / u32 | Morph targets |
| Node transforms, baked into the geometry | Textures — a material's base colour only |

A model is scaled uniformly to its type's height, because a downloaded model is in whatever units its
author used and an enemy the size of a bus is a bug you cannot unsee. A model has no joints, so the walk
cycle and pose blend skip it; the animation guards were tightened where an imp's arms were assumed.

**Why a manifest and not seven fetches** — the first version requested `<type>.glb` for all seven types at
boot, which is seven 404s in the console for a feature nobody is using. The smoke test caught it.

**Tests** — 7 new: a hand-built glb parses to one mesh with its three vertices and its material colour,
a model is offered for its type, the pool for that type is dropped so a parked procedural body cannot be
handed out, and the model can be removed again.


## 1.63.1 — 2026-11-21

**A budget set from one measurement**

The level-alone draw-call budget was 60, measured on one seed. CI ran a different seed with more props and
hit 66. The budget is a ceiling that catches a regression, not the number of the day: it is 80 for the
level and 240 for the level plus eight rig bodies, with the measured range (55-66) written beside it.


## 1.63.0 — 2026-11-21

**A charger draws its lane on the floor**

The brute and the warden wind up before they commit. The only warning was a scale pulse and a glow, which
says "something is coming" and not "it is coming *here*". During the telegraph a charger now lays sparks
along the floor from itself to its target — five points, every 70 ms, fading in a third of a second.

It reuses the particle pool, so the warning costs no draw call. Standing in the lane is now a decision.

**A pickup test that teleported onto the exit pad**

The flake that survived three fixes: the test placed its pickup at `openCells[0]`, and when that cell was
the exit pad, the teleport completed the wave, the wave change cleared every pickup, and both assertions
failed. It now picks a cell more than 10 m from the exit and clears `exitOpen` first. Ten clean runs.


## 1.62.1 — 2026-11-21

**A pickup test that walked away from its own pickup**

It passed locally and failed in CI. The cause is the fixed-step loop: a slow CI frame lets the accumulator
catch up, so three frames can simulate a quarter of a second and the player walks out of the 1.1 m pickup
radius between the assertion that places it and the one that expects it eaten.

It now zeroes the velocity, releases every key, re-places the player on the cell and runs a single frame.


## 1.62.0 — 2026-11-21

**Damage numbers**

The hit marker said *something* landed. It did not say what. `hud.damageNumber()` projects the point that
was hit to the screen and floats the number up over the body, which is the clearest feedback a shooter has
and the thing that tells you whether the shotgun was worth the walk.

| Detail | Why |
| --- | --- |
| A pool of ten DOM elements | A node per hit is a garbage problem at ten shots a second |
| CSS animation | The float is a keyframe, not a per-frame transform write |
| A killing blow shows `✕` in red and a size larger | The kill and the hit read differently at a glance |
| Off-screen or behind the camera is dropped | A number at the edge of the screen is noise |

No draw call: it is DOM, like the compass and the waypoint.

**A test double that was lying** — `className = 'a b'` did not update `classList`, because the stub backed
`classList` with a `Set` that `className` never wrote to. It is a real property now, so a class set one way
and read the other agrees.

**Tests** — 5 assertions: the pool is ten and made once, a hit puts its damage on screen, it animates, a
killing blow reads differently, and the cursor advances through the pool.


## 1.61.0 — 2026-11-21

**Every zone breathes**

Eight zones had eight palettes, eight textures and eight floor plans, and all eight were perfectly still
between waves. `effects.ambient()` spawns motes into the same particle pool the sparks use, so a zone's
atmosphere costs no draw call and no allocation.

| Zone | Motes |
| --- | --- |
| The Gate | dust drifting |
| The Foundry | embers rising |
| The Grove | spores floating |
| The Vault | cold dust, barely moving |
| Ashfall | ash falling |
| The Cistern | water dripping from the ceiling |
| The Kiln | embers rising fast |
| The Throne | blood motes |

The difference between embers and drips is the sign of gravity and the rate: the kiln spawns nine a second
that rise, the cistern three a second that fall at 4.5 m/s². All eight colours are distinct, and a test
asserts it.

**Tests** — 4 new assertions: every zone has motes, no two share a colour, the kiln's rise while the
cistern's fall, and the emitter actually puts particles in the pool.


## 1.60.1 — 2026-11-21

**The draw-call budget was measuring the wrong thing**

It took a snapshot of `renderStats` whenever the frame happened to land, so it measured the enemy count
as much as the level, and flapped between 86 and 150 calls against a fixed 140. It failed in CI on a wave
that happened to be busier than the one measured locally.

It now measures two controlled states:

| State | Budget |
| --- | --- |
| The level alone, enemies cleared | under 60 calls |
| The level plus eight rig bodies | under 200 calls |

The second bounds the per-enemy cost at about 17 calls. It also restores an enemy afterwards, because
clearing them completes the wave and left every later check on the cleared screen.


## 1.60.0 — 2026-11-21

**Copy report, on the pause screen**

Every bug report so far has been a sentence and a screenshot, and every one has cost a round trip to find
out which build, which seed, which wave — and several turned out to be a cached page. The pause screen now
has **Copy report**, which assembles one block and puts it on the clipboard:

| Line | What it answers |
| --- | --- |
| `build` | Which version is actually running |
| `url`, `seed` | Exactly which level, reproducible |
| `zone`, `wave`, `mode`, `class` | Where in the run |
| `state`, `exitOpen`, `doors` | Whether a door is meant to be locked |
| `player` | Health and position — "stuck in a room" is a position |
| `enemies` | How many are alive, which explains a wave that will not clear |
| `level` | Grid size, rooms, doors, and **reachable cells** — the number that was wrong |
| `render` | Draw calls and triangles |
| `pool` | Bodies parked per type |
| `events` | The last 40 notable events with timestamps |

Events are recorded for: wave start, zone cleared, game over, a locked door touched, the stuck-spawn
fail-safe firing, and every trinket drop.

If the clipboard is blocked, the same block is shown in a selectable panel under the buttons.

**Tests** — 7 new assertions on the report: it names the build, the seed, the zone, the reachability, and
carries the events.


## 1.59.0 — 2026-11-21

**Enemy bodies are pooled**

A rig body is 19-24 meshes. A wave of twelve enemies built and disposed about 250 meshes, mid-fight, which
is a hitch on a phone and garbage for the collector to sweep.

`BODY_POOL` keeps bodies per type, capped at 14 each. A body is reset when it is taken back out — joint
rotations to their rest values, materials to their base colour, scale and visibility — so nothing carries
over from the enemy that died in it. The cloned flash materials travel with the body, so a hit still
flashes only the enemy that was hit.

**Measured, not assumed** — five waves spawning 4 + 6 + 7 + 9 + 10 = 36 enemies built **16 bodies**, and
reused the other 20. The test asserts the reuse rate, not just that a pool exists.

**Tests** — 3 new assertions: a removed body returns to the pool, the next enemy of that type reuses the
same object, and the reused body starts from rest rather than mid-stride.


## 1.58.0 — 2026-11-21

**Decals on floors and ceilings were misoriented**

`lookAt(point + normal)` orients a decal correctly on a wall and is degenerate on a floor or a ceiling:
the plane's up vector is parallel to the look direction, so there is no roll to resolve and the rotation
is undefined. Blood and scorch marks on the floor were therefore randomly spun, and a ceiling decal could
end up edge-on.

| Surface | How it is set now |
| --- | --- |
| Floor (`normal.y > 0.9`) | `rotation.x = -PI/2`, random spin |
| Ceiling (`normal.y < -0.9`) | `rotation.x = +PI/2`, random spin |
| Wall | `lookAt`, then a random roll |

Three new assertions: a floor decal lies flat, a ceiling decal faces down, and a wall decal gets a finite
roll.

**Not done, and why** — the texture atlas (roadmap 47) is the obvious next draw-call win, but the level
geometry tiles every surface with UV repeats. An atlas cannot tile: a quad whose UVs run 0-2 to repeat a
brick twice would sample the neighbouring tile. It needs a `sampler2DArray` or a per-material repeat,
which is a different change from the one the roadmap describes. Recorded rather than attempted.


## 1.57.0 — 2026-11-21

**The last two enemies without joints**

| Type | Before | After |
| --- | --- | --- |
| Spitter | A bent spine with four straight cylinders | The humanoid rig with exaggerated proportions: a 0.42 rad hunch, knees, elbows, and a sac on the chest |
| Wisp | Three static cones hanging under a hood | Three tendrils on their own joints, writhing while it floats |

The wisp has no legs, so its walk phase now advances even when it is holding position — the tendrils are
what moves, and a floating enemy that is perfectly still reads as a prop.

Every enemy type is now either a humanoid rig, a quadruped rig, or a body with jointed limbs. Measured in
the browser in the vault: the spitter reads as a hunched creature carrying a glowing sac, the wisp as a
hooded light with tendrils.

**Tests** — 5 new assertions: the spitter has knees, elbows and a sac; it is hunched over 0.2 rad; the
wisp has three tendrils on joints; and they move while it floats.


## 1.56.2 — 2026-11-21

**The quadruped cost draw calls, and CI said so**

1.56.0 failed the smoke test at 147 calls against a 140 budget. Two changes:

| Change | Effect |
| --- | --- |
| No separate paw mesh | Four fewer meshes per hound; at this size the paw was a draw call you cannot see |
| LOD distance 15 m → 12 m | More of a wave is one coloured slab |

Measured after: under budget, smoke green.


## 1.56.1 — 2026-11-21

**The pickup test, again, and this time the cause**

The isolation enemy was spawned at `spawn.x + 40`, which can land outside the grid — so `spawnAt` created
nothing, the wave cleared, the wave change cleared the pickups the test had just placed, and the test
failed. It now takes a cell from the level's own open floor, and asserts the enemy exists so a broken
setup fails loudly instead of looking like a pickup bug.


## 1.56.0 — 2026-11-21

**The hound is a real quadruped now**

It was a body with four straight cylinders for legs. `rig.js` gained `quadruped()` — the same joint
hierarchy as the humanoid, on four legs instead of two:

| Part | Detail |
| --- | --- |
| Spine | Trunk, haunch and chest, so the back has a shape |
| Neck and head | A jointed neck, a boxed skull, a snout, eyes and ears |
| Tail | A joint that swings |
| Legs | Four, each hip → knee → paw, so the legs bend |

The gait is a gallop: the front pair and the back pair in opposition, knees folding on the lift, tail
swinging, neck dipping. Before, all four legs rotated together and it read as a table walking.

Measured in the browser beside a grunt: the hound reads as a beast with a head, a back and four legs, and
the grunt as a soldier. 23 parts, no mesh at NaN, four new assertions.


## 1.55.0 — 2026-11-21

**The old-build problem, fixed at the source**

Browsers cache ES modules hard. A player who reloads after a fix can keep running the old file, and from a
bug report "it is fixed" and "you are on the old build" are indistinguishable. That is the most likely
explanation for several reports that survived their fix.

`tools/stamp-cache.mjs` appends `?v=<VERSION>` to every relative import and to the entry script, so each
release is a different set of URLs and a reload is always the new code.

| Where | What it does |
| --- | --- |
| `pages.yml` | Runs the stamp between checkout and the mirror to `gh-pages`; the source stays clean |
| The stamp | Idempotent — running it twice does not produce `?v=1.55.0?v=1.55.0` |
| Tests | 3 new assertions: a relative import gets the version, the entry script gets it, and a second run changes nothing |

The title screen also prints `BUILD 1.55.0 · seed …`, so a report can name the build it came from.


## 1.54.0 — 2026-11-21

**A level whose spawn is a box is now refused**

The report was "no way out of the room, all rooms blocked". Measured on the current campaign seeds, no
zone does that — the foundry spawn reaches 476 of 506 cells with every door shut, and its spawn room has
five exits that are not doors. But the generator never *checked*, so a layout that boxed the player in
would have shipped.

`generateLevel` now measures two things and re-rolls the seed if either fails:

| Measure | Threshold |
| --- | --- |
| Cells reachable from the spawn with every door shut | at least 220 |
| Exits from the spawn room that are not door cells | at least 1 |

Eight attempts, then the best of them. The playability suite asserts both for the campaign seed and five
derived seeds of every zone.

**And if it happens anyway, the doors open**

If the player has not got more than 5 m from the spawn in 20 s while a wave is live, every door opens and
a toast says `DOORS OPEN · THE PAD STILL NEEDS A CLEAR WAVE`. The pad still only advances on a cleared
wave, so nothing is skipped — it just means a boxed spawn can no longer end a run.

**A trinket test that measured the wrong thing** — it compared against a base captured before other tests
ran. It now takes a bare baseline and a belted one in the same breath.


## 1.53.0 — 2026-11-21

**A build stamp, because "I fixed it" and "you are running the old file" look the same in a bug report**

The title screen now prints `BUILD 1.53.0 · seed hellgate` under the best-run line. If a fix does not
appear, the stamp says whether the page is the one that was built.

`check-claims` now fails when the stamp and `VERSION` disagree, so it cannot drift, and a test asserts the
stamp exists and names a version.

**Stale text fixed** — the title, the mode blurb and the zone map all said "five zones". There are eight.


## 1.52.0 — 2026-11-21

**The door axis, third attempt, and this one is right**

1.49.2 decided the door's orientation by "which neighbour is open". That is the wrong question: the exit
room itself is open, and it is not the corridor. A door beside the room concluded "the corridor runs
along X" and lay flat again.

The right question is "which neighbour is the room". You walk from the corridor into the room along that
axis, so the panel is thin along it:

```js
const intoX = cellAt(d.x - 1, d.z).room === level.exitRoom || cellAt(d.x + 1, d.z).room === level.exitRoom;
const intoZ = cellAt(d.x, d.z - 1).room === level.exitRoom || cellAt(d.x, d.z + 1).room === level.exitRoom;
const thinX = intoX || !intoZ;
```

Verified for every door in the first four zones: room on Z → thin in Z, room on X → thin in X, zero
misaligned. Captured in the browser in both corridor directions.

**A locked door now says it is locked**

| Change | Detail |
| --- | --- |
| Lock lamp | A lamp on the door face: red while locked, green when the wave clears |
| Toast | Walking within 3 m of a locked door shows `LOCKED · CLEAR THE WAVE` and plays the door sound, at most once every 3 s |

The door is locked because the wave is not clear. Standing in front of it guessing is the most common way
to think the level is broken, so the game now says it.

**Spawn positions do vary** — measured per zone: gate (50, 50), foundry (20, 20), grove (38, 40), vault
(58, 44), ashfall (32, 36), cistern (10, 24), kiln (36, 36), throne (46, 44). If a level still starts in
the same room every time, that is a different bug and I need to know which zone.


## 1.51.1 — 2026-11-21

**A test that failed only in CI**

`no wasted pickups` cleared every enemy to isolate itself, which completed the wave, opened the exit, and
let a wave change clear the pickups the test had just placed. It passed locally and failed in CI because
whether the player was standing near the exit depended on the seed.

It now leaves one enemy alive, far away, so the wave cannot complete.


## 1.51.0 — 2026-11-21

**One deep audit pass, and the bug it found**

`tools/audit-run.mjs` is new: it opens every zone, every mode and every screen in a browser, fires every
action, plays forty frames of random input, and reports anything that throws, anything non-finite, and
any state the game should not be in afterwards.

It found a real bug on the first run:

> `blade: Failed to execute 'setValueAtTime' on 'AudioParam': The provided float value is non-finite.`

The blade's swing sound passed its arguments in the wrong order — `noise(dur, gain, 1800, 'bandpass', 900)`
where the signature is `noise(dur, gain, type, f0, f1)`. The filter type became `1800` and the frequency
became `'bandpass'`, so every swing threw. Both blade sounds are fixed.

After the fix: **every zone clean, every mode starts, every action works.** The audit is in the repo so
the next regression has somewhere to fail.

**UI polish**

| Change | Detail |
| --- | --- |
| One palette | Six slightly different ambers became `--amber`, `--amber-dim`, `--amber-faint` |
| One scale | `--r` for radius, `--gap` for spacing, `--ease` for transitions |
| Button states | hover, active, `:focus-visible` with a real focus ring, and `:disabled` |
| Ghost buttons | A hover state; they had none |
| Screen headings | One rhythm: 26px, 0.3em tracking, 6px below |
| Screen backdrop | 0.9/0.985 with a 3px blur, so the HUD behind it stops competing |
| Journal rows | Aligned label and value columns, and the objective row spans the full width because it is a sentence, not a number |


## 1.50.0 — 2026-11-21

**The rig was building every body at NaN**

`humanoid()` read `p.legLen`, and no proportions object has a `legLen` — it has `thigh` and `shin`. The
hip height was `undefined`, so every joint position became `NaN` and the body rendered as nothing at all
or as disconnected parts. That is why the enemies looked wrong however the models were shaped.

The hip is now `thigh + shin`, and a test walks every biped asserting no mesh sits at a NaN position.

**Human proportions**

| Change | Why |
| --- | --- |
| A neck | The head was sitting on the shoulders |
| Two torso sections | A single cylinder read as a barrel; chest over abdomen tapers |
| Narrower shoulders | 0.44 → 0.32 on a grunt |
| Smaller pauldrons | 0.22 → 0.15 on a grunt; the shoulders were the silhouette |
| Smaller eyes | 0.22 of the head radius → 0.14 |
| Bigger head | A head is about a seventh of a body |

**The maps were too dark, and are not now**

| Change | Before | After |
| --- | --- | --- |
| Ambient light | floor 0.62 | floor 0.85 |
| Hemisphere light | 1.05 | 1.25 |
| Fill light | 0.9, 22 m | 1.5, 30 m |
| Fog | 9-32 m | 14-46 m |
| Zone ambient | 0.44-0.82 | 0.72-0.95 |
| Fog colours | near-black | lifted by 0x14 on every channel |
| Tech texture | panels at 34-48 | panels at 64-84 |

Measured in screenshots: the gate is warm brick, the foundry is hot rust, the cistern is blue-grey panels
with hazard stripes. All three are readable at a glance and none is a black corridor.

**Stronger palettes** — the wall tints are up from about ±6 % to ±30 % per channel, so the same geometry
and the same nine textures read as different places.


## 1.49.2 — 2026-11-21

**The door was facing the wrong way in half the corridors**

1.47.0 made doors thin panels, and got the axis backwards: it made the panel wide along the corridor
instead of across it. In a corridor running along X the door lay flat along the walkway, blocking
nothing and reading exactly like the slab in the air it was supposed to fix. That is why the report
survived the fix — it was right, and my fix only worked in the other half of the corridors.

The panel is now thin across the corridor and wide across the doorway, computed from which neighbours
are open.

**Test** — for every door in the level, the thin axis must match the corridor's direction. Zero
misaligned, and it would have failed before this fix.


## 1.49.1 — 2026-11-21

**The rig cost more draw calls than the budget allowed**

1.49.0 failed CI: 143 calls against a 140 budget. A rig body is 19-23 parts where the old compound body
was 10, and six enemies on screen is the difference. The level-of-detail distance drops from 22 m to 15 m,
so more of a wave is one coloured slab instead of twenty meshes. Measured after: 86 calls in the same
scenario, and the budget still catches a regression.


## 1.49.0 — 2026-11-21

**Pose blending on the rig**

The walk cycle was the only animation. The rig now blends a pose on top of it per state, the cheap version
of an animation blend tree:

| State | What the body does |
| --- | --- |
| Attack | Both arms up and forward, a slight lean back, head lifts — the shot is readable in the silhouette and not only in the glow |
| Pain | Folds forward, head drops |

The blend is a lerp toward a target at 9-12 per second, so a state change reads as movement rather than a
snap. This is the idea behind the Three.js blending examples applied to joints instead of skinned
vertices: same principle, no skinning.

**Level of detail tightened to pay for the rig** — the rig is 19-23 parts per body where the old bodies
were 10, and the CI draw-call budget caught it at 143 calls. The distance at which an enemy becomes a
single coloured slab drops from 22 m to 15 m, which brings the frame back to 86 calls in the same
scenario.

**The kit got the four reusable pieces** — `game-kit` 1.9.0 now has `flowField`, `pool`, `minimap` and
`audio.gen`, extracted from this game. Details are in that repository's changelog.


## 1.48.0 — 2026-11-21

**A real rig for the bipeds**

The imp, grunt, brute and warden were compound meshes: a torso with sticks hanging off it. They are
built by `play/src/rig.js` now, which is a parametric humanoid with actual joints.

| Joint | What it does |
| --- | --- |
| Spine | Carries the shoulders and head, and leans |
| Shoulder → elbow → hand | Two segments, so the arm bends at the elbow |
| Hip → knee → foot | Two segments, so the leg bends at the knee |

The walk cycle drives the knees and elbows: knees bend on the back swing, elbows on the forward one. That
is the whole difference between a box with sticks and something that reads as walking.

Proportions are per type — the imp is all spine and arm, the grunt is a barrel with pauldrons and a
rifle in its hand, the brute is shoulders on legs, the warden is a monument with a furnace core. Every
body is 19-23 parts.

**A wave you cannot clear can no longer lock the level**

Two fixes, both about being unable to find or reach the last enemy:

- the compass points at the nearest enemy when the exit is shut and the keycard is not the objective, so
  the last one is findable
- `enemies.unstuck()` — an enemy that has not got closer for 14 s is moved to open floor near the player.
  It is a compromise, and better than a door that never opens.

**Tests** — 16 new assertions: every biped is a rig with a head, spine, shoulders, elbows, hips and
knees; the knee hangs off the hip and the elbow off the shoulder; and each body is 19+ parts.


## 1.47.0 — 2026-11-21

Six reports from playing past the first level.

**The gates were horizontal slabs in the air**

Doors were cubes, and the opening animation shrank them (`scale.y` to 0.02) while lifting them 3.2 m —
so an interrupted open left a flat sliver hanging above the corridor. Doors are now thin bulkhead panels
that translate up into the lintel and are hidden when they arrive, and `updateDoors` runs from the main
loop rather than the playing-state branch, so a pause or a screen change can no longer freeze one
half-open.

**Every zone is now a different floor plan**

`generateLevel` took no options, so all eight zones were 9-13 rooms of 4-8 cells. Each zone now passes a
`shape`:

| Zone | Rooms | Room size | Tall rooms |
| --- | --- | --- | --- |
| The Gate | 8-11 | 4-7 | 25% |
| The Foundry | 10-14 | 3-6 | 50% |
| The Grove | 6-9 | 6-9 | 15% |
| The Vault | 11-15 | 3-5 | 20% |
| Ashfall | 5-8 | 7-10 | 60% |
| The Cistern | 9-13 | 3-5 | 10% |
| The Kiln | 7-10 | 5-8 | 45% |
| The Throne | 6-9 | 7-10 | 70% |

Measured: Ashfall is 5 rooms averaging 73 cells, the Vault is 14 rooms averaging 17, the Throne is 8
rooms averaging 70 with 6 of them over 5 m tall. They are not the same map any more.

**Distant enemies were all the same grey slab**

The level-of-detail proxy shared one material, so past 22 m every type was an identical dark box. It is
now coloured per type: red for an imp, cyan for a wisp, magenta for a hound.

**A card between levels** — the screen fades to black with the zone name for 0.7 s when a level starts, so
the change is visible.

**Journal and inventory are on the pause screen** — both existed behind `J` and `Tab` and were invisible
if you did not know. There are buttons now, and the pause screen lists the keys.

**A test double gap** — `BoxGeometry` recorded no dimensions, so "a door is a thin panel" could not be
asserted. It records them now.


## 1.46.0 — 2026-11-21

**Four more surfaces, and a pair for every zone**

The game had five textures and used two of them for walls and two for floors, so a palette change was
mostly a tint over the same bricks. There are nine now — brick, tech, **rust**, **moss**, **stained** for
walls; tile, plate, **grate** for floors — and every zone picks its own pair.

| Zone | Walls | Floor |
| --- | --- | --- |
| The Gate | brick | tile |
| The Foundry | rust | plate |
| The Grove | moss | tile |
| The Vault | tech | plate |
| Ashfall | stained | plate |
| The Cistern | tech | grate |
| The Kiln | rust | tile |
| The Throne | stained | plate |

The foundry now reads as oxidised metal, the grove as wet green stone, the cistern as a dark service
tunnel with a grated floor. Same geometry, same vertex shading, different surfaces.

Each new texture is drawn on a 64x64 canvas at boot like the others: no assets, no downloads.


## 1.45.0 — 2026-11-21

**A palette per zone, not just a tint over the same bricks**

The level geometry's vertex colours are shading only, so every zone drew the same walls. They are now
multiplied by a per-zone `wallTint`, which means the foundry rusts, the cistern goes teal and the kiln
goes orange out of the same geometry and the same five textures:

| Zone | wallTint | Reads as |
| --- | --- | --- |
| The Gate | `[1.0, 0.97, 0.92]` | warm brick |
| The Foundry | `[1.12, 0.92, 0.78]` | rust |
| The Grove | `[0.88, 1.05, 0.9]` | moss |
| The Vault | `[0.9, 0.96, 1.06]` | steel |
| Ashfall | `[1.05, 1.0, 0.95]` | ash |
| The Cistern | `[0.82, 1.0, 1.08]` | teal |
| The Kiln | `[1.18, 0.86, 0.74]` | firebrick |
| The Throne | `[1.15, 0.78, 0.78]` | blood |

**It is brighter, and it cannot be too dark**

- ambient light has a floor of 0.62, whatever a zone asks for: a corridor you cannot see is broken, not
  atmospheric
- a point light travels with the player, 3.5 m ahead and 2.4 m up, so the thing in front of you is lit
- the hemisphere light is up from 0.95 to 1.05

**The HUD on a phone**

Measured at 390x844 and 360x640 before and after: the objective pill is 215x21 and fits, the keycard chip
is hidden, the power slots drop their labels and keep their keys, the touch grid drops to 38 px buttons on
the smallest screens, and the whole bar is 82 px tall instead of eating a third of the screen.

**The gun no longer eats a portrait screen**

The view model scales with the aspect ratio, clamped to 0.55, and re-applies on resize — a phone held
sideways and turned upright gets the right size without a reload.


## 1.44.0 — 2026-11-21

**The guns look like guns**

The view models were two boxes and a cylinder. All four are rebuilt with the parts that make them
recognisable:

| Weapon | What is new |
| --- | --- |
| Pistol | Slide, grip, hammer, front sight, muzzle |
| Chaingun | Six barrels on a bearing, ammo box, carry handle, sight |
| Shotgun | Twin barrels, wooden pump, stock and grip, bead sight |
| Rocket launcher | Muzzle ring, back blast, two grips, top rail, sight |

The rest position also moved up 7 cm: at a 900x520 viewport the HUD bar was eating the gun.

**Sprites**

| Sprite | Where |
| --- | --- |
| Muzzle flash | A bright additive quad at the barrel, six reused, 60 ms |
| Impact flash | A small bright hit where a shot lands on a body |
| Keycard beacon | A gold light column over the card, the same idea as the exit beacon |

**Four real disposal bugs**

A pickup, a relic and the keycard are Groups now, but three collection paths still called
`mesh.geometry.dispose()` on them, which throws on a Group. The soak test caught it as an intermittent
"no crash in 2000 frames" failure; it took a 60-run loop to reproduce reliably. `dropMesh()` is the one
path now, and it handles a bare Sprite as well as a Group.

**Two more flaky assertions fixed** — the pistol test aimed, waited sixteen frames, then fired, so an imp
that wandered out of the crosshair failed it. Aim and fire are now the same frame.


## 1.43.0 — 2026-11-21

**A colour grade per zone, and a light column over the exit**

The composite pass now takes three more uniforms — a tint, a saturation and a vignette — and every zone
carries its own:

| Zone | Tint | Saturation | Vignette | Reads as |
| --- | --- | --- | --- | --- |
| The Gate | neutral, warm | 1.05 | 0.42 | cold brick |
| The Foundry | amber | 1.10 | 0.40 | heat and dust |
| The Grove | green | 1.12 | 0.36 | alive |
| Ashfall | grey | 0.86 | 0.46 | drained |
| The Cistern | blue | 0.95 | 0.42 | wet and cold |
| The Vault | cool | 0.92 | 0.48 | sealed |
| The Kiln | deep orange | 1.16 | 0.44 | hot |
| The Throne | red | 1.20 | 0.50 | the end |

The grade rides on the composite, so `Graphics: Performance` (which drops bloom) keeps the flat colour —
one pass, one place.

**The exit beacon** — a soft light column over the pad, red while the exit is shut and green the moment it
opens, pulsing slowly. It is the one thing you should be able to find from across a dark room without
reading the HUD.

**The three new zones were too dark to play.** Measured in a screenshot, not by feel: the Kiln's tech
walls and 0.5 ambient rendered as near-black with orange dots. Ambient up, fog lighter, and the Kiln now
uses the brick set. It reads as a warm brick corridor instead of a cave.

**Test double** — `SpriteMaterial` had no `color`, so the first sprite that tried to change colour threw.


## 1.42.0 — 2026-11-21

**The blade: a run with no ammo is still a run**

`F`, middle-click, or the BLADE button on a phone. It costs nothing, so "out of shells" is a change of
plan and not the end of the run.

| Property | Value |
| --- | --- |
| Damage | 58 per swing |
| Reach | 2.6 m, plus the target's own radius |
| Arc | cos 0.35 — about 70 degrees either side of where you are looking |
| Cooldown | 0.52 s |
| Lunge | a 1.6 m/s shove forward, blocked by walls like any other movement |

It hits everything in the arc, not just the nearest thing. The swing draws a wedge where it went, so a
miss is legible: the arc is drawn in front of you and the enemy was not in it. Blood, a damage number and
a hitmarker on connect, two new sounds, and a small screen kick.

When a gun runs dry the toast now says what to do about it: `OUT OF SHELLS · F BLADE`.

**Four flaky assertions fixed**, all of which had been failing about once in ten runs:

| Test | Why it was flaky |
| --- | --- |
| `enemy closed along the field` | picked a walkable pair, but a wide body can wedge in a corridor the flow field calls open. It now also requires a clear straight run, and tries three pairs |
| `the blade damaged what was in front of it` | aimed, then ran two frames, then swung: the imp walked out of the arc. Aim and swing are now the same frame |
| `with every gun empty the blade still kills` | same aim-then-wait problem |
| `addShake is a no-op under reduced motion` | the soak above it left a shake mid-decay |

**`F` is the blade now; fullscreen moved to `F11`.** `Q` was already a power.


## 1.41.0 — 2026-11-21

**The warden gets an entrance**

When the boss wave starts, the letterbox closes, the camera orbits the thing that just arrived, its name
and the zone type out over the bars, and control comes back. Three seconds, skippable on any key, click
or tap — a cutscene you cannot skip is a hostage situation. The game loop hands the camera to the cut and
takes it back, so nothing else runs while it plays.

**More effects**

| Effect | Where |
| --- | --- |
| Shockwave ring | Explosions: a flat disc that expands and fades, so a blast reads as pressure |
| Sparks | Bullet meets wall: hot core plus embers plus a scorch |
| Muzzle smoke | A puff at the barrel on every shot |

The rings are four reused meshes, not four per explosion.

**A real bug the new tests found**

The warden is 2.1 m across and a cell is 2 m, so it was **born inside the wall** of whatever cell it
spawned on. It now spawns only where a 3x3 block of cells is open. The same test found that the spawn
jitter (±0.3 m) put a brute's shoulder into the wall; the jitter now scales with the body.

**Test double fix** — the DOM stub had a no-op `classList` shadowing the real one, which broke five HUD
assertions the moment a test needed `contains()`. The stub now has one `classList`, backed by a Set.


## 1.40.0 — 2026-11-20

**Items look like items** (roadmap 58)

Every pickup was a coloured octahedron or box. They are models now, in a new `play/src/items.js`:

| Pickup | What it is |
| --- | --- |
| Health | A white case with a red cross and a handle — a medkit |
| Armour | A flattened plate with shoulder straps and a V-neck — a vest, not a can |
| Bullets | A green ammo can with a stencilled stripe and rounds glimpsed in the lid |
| Shells | Three loose shotgun shells, brass on red |
| Rockets | A tube, a nose cone and three fins |
| Keycard | A card with a magnetic stripe and a chip |
| Relics | A stone idol on a plinth with a chip of light in its skull |
| Trinkets | A coin, a ring or a compass, one per slot |

Geometry and materials are shared and cached, so eight pickups on a floor cost tens of draw calls. Disposal
had to change with them: a pickup is a Group now, so `dropMesh()` removes it and disposes only the sprite
that hangs off it, never the shared geometry.

**Three more zones** — Ashfall (open sky, ash falling), The Cistern (standing water, something under it)
and The Kiln (the last heat before the throne). Eight zones total, each with its own palette, props,
threat, cold open and epilogue. Seeds chosen by `tools/pick-seeds.mjs`, not typed.

**Two more modes** — Arena (one room, waves back to back) and Nightmare (Campaign on Hard, keycard from
the first wave, whatever the settings say). Six modes total.

**One test updated** — it asserted five zones have story; it now asserts every zone does and that each is
at least three panels, which is the invariant that matters.


## 1.39.0 — 2026-11-20

**Music, generated**

No audio files and no samples. A minor pentatonic, a tempo per scene, and a rule for which note comes
next, scheduled from the game loop so it stops when the tab does.

| Scene | Tempo | What it does |
| --- | --- | --- |
| Menu | 68 BPM | Sparse arpeggio, no drums |
| Explore | 82 BPM | Adds a bass root, occasional hat |
| Combat | 132 BPM | Drums on, arpeggio dense |
| Boss | 150 BPM | Faster, higher root, double-time kick |

The game's own tension number — the one the mix already uses — decides how busy it plays, so the music
and the pad move together. `Music.update()` schedules a quarter second ahead and refuses to queue more
than half a second of backlog, so a tab left in the background does not come back with an hour of notes.

**Two more enemies**

| Type | Behaviour | Body |
| --- | --- | --- |
| Brute | Walks at 1.7 m/s until it sees you, then charges at 5.2. 140 hp | A wedge of plate with the head low between the shoulders and knuckles near the floor |
| Wisp | Floats 1.15 m up and ignores stairs. 18 hp, fires slow orbs | A hood and a light with nothing below the waist |

**Four game modes**

| Mode | Rule |
| --- | --- |
| Campaign | Five zones in order |
| Endless | One zone, waves that never stop |
| Boss Rush | One wave per zone, the warden every time |
| Hardcore | Campaign rules, but death deletes the run |

A mode changes the rules, not a slider: endless never fires the zone-clear path, boss rush forces the
boss flag on every wave, hardcore clears the save on death.

**A flaky test fixed** — `enemy closed along the field` used a line-of-sight pair, which is the wrong
criterion for a pathing test: an enemy can see you across a crate it cannot walk around. It now asks the
flow field for a pair that is actually walkable, and five consecutive runs are clean.


## 1.38.0 — 2026-11-20

**The wind-up is visible now**

Every enemy that shoots glows while it winds up: the body's emissive channel ramps from black to hot
orange across the telegraph — 0.55 s for an imp, 0.4 s for a grunt, 0.75 s for a spitter, 0.7 s for the
warden. Before this, the only tell was a small particle burst on the imp and the enemy's own scale
animation, which reads as a twitch rather than a warning.

A hit flash uses the same emissive channel, so the flash wins while it lasts and the charge colour is
restored after it — the two never fight over the pixel.

This follows from "kills you if not properly played": the game was asking the player to read a 0.55 s
window off a health bar.

**One test asserted the wrong thing** — `flash decays back to black` checked `emissive.r === 0`, which is
no longer true once an enemy is winding up. It now checks that the flash ended and that whatever is left
is the charge colour (no blue), which is the real invariant.

**`documentation/combat.md`** describes the telegraph timings per type.


## 1.37.0 — 2026-11-20

**The campaign ramps across zones, not just across waves**

The first playtest report: died on **The Gate, wave 3, Normal**. The arithmetic agreed with it. The
difficulty preset alone made zone 1 wave 3 identical to zone 5 wave 3 — the first level was as hard as
the last one at the same wave number, which is how a player dies on level one and never sees level five.

Each zone now carries a `threat` scalar applied to health, damage and count:

| Zone | threat | Wave 3 enemies | Wave 3 total hp |
| --- | --- | --- | --- |
| The Gate | 0.72 | 7 | 281 |
| The Foundry | 0.86 | 8 | 335 |
| The Grove | 1.00 | 10 | 390 |
| The Vault | 1.12 | 11 | 437 |
| The Throne | 1.22 | 12 | 476 |

Before: every zone was 10 enemies and 526 hp at wave 3. The Gate is now about half the threat it was at
the point where that run ended; The Throne is harder than it was.

**`tools/balance-report.mjs` takes a zone** — `node tools/balance-report.mjs normal gate`. Without that
it would have kept printing the old numbers and describing a game that no longer exists.

**Two tests asserted absolute numbers** that this change moved: `wave 1 spawned 6 enemies` and
`hard raises the wave size multiplier` (compared against 1 rather than against normal). Both now assert
the relationship — the count the zone threat implies, and hard > normal — so the next tuning pass does
not have to rewrite them.


## 1.36.0 — 2026-11-20

**The mix tells you what the HUD tells you**

The ambient pad was a fixed drone at 320 Hz. It now opens up and gets louder as the room fills:
`audio.setTension(0..1)` moves the lowpass from 300 Hz to 1080 Hz and the gain from 0.026 to 0.058 over
about half a second, and the loop feeds it a number built from three things.

| Input | Weight |
| --- | --- |
| How crowded the room is (alive / 10) | 0.55 |
| How close the nearest enemy is (0 at 26 m) | 0.55 |
| A boss being alive | 0.25 |

Clamped to 1, so a boss with ten enemies on top of you is as loud as it gets.

**A heartbeat under 30 % health**

Two soft sub thumps, 0.55 s apart when you are nearly dead and slower as you recover. It is the one piece
of information in the game that is easier to hear than to read.

**Tests** — 4 new assertions on the tension control (exists, stores, clamps at both ends), and the smoke
test's sound sweep now covers `heart`, `sprint` and `crouch`, which it had been missing.


## 1.35.0 — 2026-11-20

**The draw-call budget had stopped measuring anything**

With bloom on, `render()` read `renderer.info` after the composite, so `renderStats.calls` described one
quad — 1 call — and the smoke test's "under 140" passed trivially. The budget was written to catch a
regression and had quietly become decoration.

`Bloom.render()` now returns the scene pass's own counts and `render()` uses them. Measured after the
fix: 41 calls with bloom, 40 without, on the same frame.

**Bloom drops itself on a slow machine**

The adaptive pass already traded resolution for frame time. It now drops bloom first — four passes at
quarter resolution are worth more than the resolution they cost — and brings it back if the machine
turns out to be fine.

| Average frame time | Action |
| --- | --- |
| over 26 ms | bloom off |
| under 14 ms, previously dropped | bloom back on |
| over 21 ms | pixel ratio down 0.15, floor 0.7 |
| under 13.5 ms | pixel ratio up 0.1, ceiling 1.5 |

**Measurement honesty** — `documentation/testing.md` now says plainly that frame time cannot be measured
in this sandbox: Chromium runs on SwiftShader, so every frame takes 150-200 ms whatever the game draws.
Draw-call counts are trustworthy here; milliseconds are not, and a phone is needed for those.


## 1.34.0 — 2026-11-20

**The campaign seeds are chosen now, not typed**

`world.js` held five seed strings somebody typed. Two of them — `grove` and `throne` — had **no room
bigger than 7×7**, so the grove was the flattest level in the game and the warden fought in an ordinary
room. That is a design flaw a string cannot tell you about.

`tools/pick-seeds.mjs` scores 300 candidates per zone against what that zone needs and prints the best:

| Zone | Was | Now | Rooms | Big rooms | Stairs |
| --- | --- | --- | --- | --- | --- |
| The Gate | `hellgate` | `gate-238` | 9 | 3 | 66 |
| The Foundry | `foundry-7` | `foundry-101` | 12 | 3 | 65 |
| The Grove | `grove-3` | `grove-234` | 11 | 3 | 75 |
| The Vault | `vault-11` | `vault-199` | 12 | 2 | 70 |
| The Throne | `throne-0` | `throne-173` | 11 | 5 | 60 |

The throne now has five rooms of 7×7 or larger, so the warden has somewhere to be a boss.

**The playability suite tests the campaign seed itself** — it used to test `zone.seed + '-0..5'`, which
are five levels nobody plays. It now runs the real seed first and five derived ones after, so 350
assertions instead of 300.

**A candidate is rejected outright** if it has fewer than 9 rooms, no 7×7 room, fewer stairs than the
zone wants, no secret, fewer than two crates, under 330 open cells, or more than 60 cells cut off behind
shut doors.


## 1.33.0 — 2026-11-20

**Licence: MIT to PolyForm Noncommercial 1.0.0**

The fleet's other games are PolyForm Noncommercial; HELLGATE was the outlier. It now matches: play it,
read it, fork it for anything noncommercial; do not sell it.

| File | Change |
| --- | --- |
| `LICENSE` | The full PolyForm Noncommercial 1.0.0 text with the required notice |
| `NOTICE.md` | Says the project licence and the Three.js licence are two different things, because they are |
| `README.md` | The sentence and the footer |
| `index.html` | The landing-page footer |
| `SPONSORS.md` | The one line that called it MIT |
| `CONTRIBUTING.md` | A contribution clause: a PR is offered under the same terms, no CLA, no sign-off |
| `tools/check-claims.js` | Names the licence in the file and fails if it is neither PolyForm nor MIT — the badge can no longer drift from the file |

**Three.js stays MIT.** It is a separate work under its own licence; relicensing this repository does not
and cannot change that. `NOTICE.md` says so explicitly, because that is the mistake people make.

**Verified** — the legal scanner now reports `PolyForm-Noncommercial-1.0.0` and six legal files:
LICENSE, NOTICE, PRIVACY, SECURITY, CODE_OF_CONDUCT, CONTRIBUTING.


## 1.32.0 — 2026-11-20

**A fifth enemy: the spitter**

Four types covered flat shots, closing, and melee. None of them punished standing still. The spitter
holds nine metres, backs off when you close, and lobs an arcing glob that splashes where it lands.

| Property | Value |
| --- | --- |
| Health | 34, and it is thin — two shotgun pellets put it down |
| Range | Lobbed from up to 18 m, holds 9 |
| Behaviour | Backs away when you close, so it is the one enemy you have to chase |
| Body | Tall, thin, bent over a swollen green sac — the silhouette is the sac |
| Appears | Wave 3, one in six; more from wave 4 |

**The glob** is a new projectile kind: gravity, no bounce, a 2.4 m splash. It arcs, so it misses if you
keep moving — which is the point of the enemy.

**Tests** — 4 new assertions: it spawns, it lobs rather than shoots flat, it holds a distance, and the
glob is an acid projectile that arcs without bouncing.


## 1.31.0 — 2026-11-20

**Bloom** (roadmap 44)

Muzzle flashes, explosions, the warden's furnace and the enemy eyes now glow. Three.js ships
`UnrealBloomPass`, but that is an example module and this project vendors the core library only, so the
pass is written here: the scene renders into a target, the bright pixels are kept at quarter resolution,
blurred twice, and added back.

| Detail | Choice |
| --- | --- |
| Cost | Four quarter-res passes, then the composite |
| Threshold | 0.72, with a 0.25 soft edge |
| Blur | Nine-tap separable, two passes |
| Switch | `Graphics: Performance` turns it off; reduced motion turns it off |

**The first version came out dark** — the scene renders into a linear target and the renderer's sRGB
conversion only runs on the final pass, which was now this shader. The composite encodes sRGB itself and
the brightness matches the pre-bloom game.

**Graphics quality setting** — Performance / Balanced / Pretty in the settings panel, persisted like the
rest. Performance drops bloom and the prop detail pass.

**Stub** — `Vector2`, `ShaderMaterial`, `OrthographicCamera`, `WebGLRenderTarget` and
`renderer.setRenderTarget` added, because `check-stub` refuses to let the test double drift.


## 1.30.0 — 2026-11-20

**The warden, in curves**

It was the last body still built from boxes, which made the boss the least convincing thing on screen.
It is now a barrel chest tapering to the waist, slabs of shoulder either side, a head sunk between them
with two glowing eyes and horns, and the furnace core in the chest that the health bar is measuring.

Same part names again, so the slam animation, the phase escalation, the hit flash and the distance slab
all work unchanged. The core still scales with the phase.

**Objective pill moves out of the boss bar's way** — when a boss is on screen the pill drops to 104 px so
the two do not sit on top of each other.

**Screenshots** — all eleven regenerated with the new bodies.


## 1.29.1 — 2026-11-20

**The READ button was declared nowhere**

1.29.0 shipped a touch module that referenced `readBtn` in `setReadable` without ever declaring it. Every
frame threw `readBtn is not defined`, the loop died before it could turn the overlay on, and the phone
had no controls at all. The browser smoke test caught it; the suites could not, because the stub DOM has
no touch overlay to break.

**Touch layout, two rows instead of three**

Three rows of 42 px buttons ran under the health bar. The grid is now `Q E R FIRE` over `GUN JMP NADE`,
with `READ` taking the last cell when a terminal is in reach, and the HUD bar moved down to 108 px.

**Objective pill** — `white-space: nowrap`, so `CLEAR THE WAVE · 10 LEFT` is one line instead of two.

**Measured on a 390x844 viewport after the change**: objective (84, 76) 223x21, waypoint (147, 128),
minimap (284, 498) 96x96, NADE (287, 788) — every element inside the viewport, none overlapping.


## 1.29.0 — 2026-11-20

Five reports from play on a phone, and a request for bodies that look like bodies.

**Minimap** — a 132 px floor plan in the corner: walls prerendered once at level build, then a blit plus
markers at 10 Hz. You, the enemies, the keycard ring and the exit pad. It shrinks to 96 px below 620 px
and moves above the touch controls.

**READ button on touch** — terminals were readable only with `V`, which a phone does not have. A seventh
touch button appears when a terminal is in reach and does nothing otherwise.

**Quest marker with a distance** — the compass chevron now carries `KEYCARD 37 m` or `EXIT 12 m` above
it, so it is a waypoint and not decoration.

**Objective line** — it was there since 1.24.0 but read as part of the top bar; it is now a bordered pill
in the middle of the screen, amber for the keycard, green for the exit.

**The exit label is gone** — `EXIT SHUT ▪` sat under the power bar and said what the objective pill and
the waypoint already say.

**Enemy bodies rebuilt** (roadmap 49)
- every body was boxes. They are now tapered cylinders, spheres and cones, cached and shared like the
  boxes were: the imp is a hunched egg with horns and arms past its knees, the grunt a barrel torso with
  shoulder pads, a helmet and a rifle in its right hand, the hound a low four-legged body with a wedge
  head and spine spikes. The warden keeps its shape, which was already distinct.
- same part names, so the walk cycle, the hit flash, the death fall and the level-of-detail slab all work
  unchanged.

**Tests** — 4 new assertions: the minimap canvas exists and prerenders, drawing markers does not throw,
the touch READ button exists, and the prompt names the action.


## 1.28.0 — 2026-11-20

**The difficulty curve, as arithmetic instead of opinion**

`documentation/balance.md` said plainly that no constant in the repository was backed by data. A bot is
not the answer — `tools/soak.mjs` aims badly and its kill count says more about the bot than the game —
so the gap is filled the other way: `tools/balance-report.mjs` reads the same constants the game uses
and prints what a wave costs.

| Wave | Enemies | Total hp | Shells to clear | Enemy dps if all in range |
| --- | --- | --- | --- | --- |
| 1 | 6 | 330 | 4 | 43 |
| 4 | 12 | 684 | 8 | 91 |
| 8 | 20 | 1382 | 16 | 140 |

Two findings, both from the numbers and neither a matter of taste:

- **Ammo is the clock.** You carry 16 shells; wave 8 needs all of them. From wave 7 the run is about
  finding ammo, not aiming.
- **Enemy dps passes your health pool at wave 2.** 110 hp plus 25 armour against 55 dps means four
  seconds in the open is fatal from the second wave.

The dps column assumes every enemy is in range and attacking on cooldown — an upper bound, and labelled
as one. The report moves when the code moves, because it imports the code.

**Also** — the soak bot now closes to 9 m before firing instead of shooting through its own spread at
26 m, which is why its kill count was meaningless before. It is still not a balance instrument and the
tool says so in its own output.


## 1.27.0 — 2026-11-19

**A playability suite: every level must be completable**

The two bugs reported from play — a keycard behind a sealed wall, and bodies wider than their collision
circle — were both "the level works" failures. Neither was visible to a test of a single function, and
my earlier checks asked the easier question.

`tests/test-playability.mjs` plays five zones × six seeds and asks, per level:

| Check | Why |
| --- | --- |
| The spawn is open floor | a level you cannot stand in is not a level |
| The exit is reachable once doors open | the only way out |
| Wave 3 places a keycard, on reachable floor | the gate's precondition |
| No pickup, relic or barrel is out of reach | the keycard bug, generalised |
| Every enemy spawned on reachable floor | an enemy you cannot reach is a wave you cannot clear |
| No enemy body stands inside rock | the wall bug, measured against a constant rather than the radius under test |
| Clearing the wave opens the exit | the whole loop, end to end |

300 assertions, four suites, every gate green.

**A bug the new suite found immediately**

`depenetrate()` used a circle test at half the body radius. In a legal spot near a wall that test fires,
and the enemy was snapped to its cell centre every frame — frozen in place. The navigation test caught
it ("enemy closed along the field 6 → 6 cells"). It now tests the cell the enemy stands in, not a
circle, so it only acts when the centre is genuinely inside rock.


## 1.26.0 — 2026-11-19

**Enemies through walls: found, measured, fixed**

The report was right and my earlier headless test was looking in the wrong place. It tested whether an
enemy's *centre* was inside a solid cell — which never happens. The body is what the player sees.

Measured with `Box3.setFromObject` in a real browser:

| Type | Collision radius | Body width | Poked through walls by |
| --- | --- | --- | --- |
| Imp | 0.45 | 1.21 | 0.16 m |
| Grunt | 0.42 | 0.99 | 0.08 m |
| Hound | 0.36 | 1.25 | 0.27 m |

Every enemy's shoulders and arms were inside the wall it stood beside. Collision radii are now the
measured half-widths — 0.62, 0.52, 0.64 — so the body fits the circle it is stopped by.

**Safety net** — `depenetrate()` runs every frame: if a body ever is inside rock, it is walked to the
nearest open cell centre and counted. A body inside a wall is now a bug that corrects itself rather
than one the player sees.

**Tests** — 9 new assertions: each radius matches its body half-width, and each type is pushed out of a
solid cell onto open floor.

**Tooling** — `window.__THREE` is exposed so a browser tool can measure scene geometry; that is how the
body widths were measured.


## 1.25.0 — 2026-11-19

**Story mode, per zone**
- five cold opens instead of one. The gate, the foundry, the grove, the spire and the throne each type
  their own panels over their own level, and each closes with an epilogue line on the cleared screen.
- `panelsFor(zoneId)` falls back to the shared set, so a sixth zone added later still works.

**The map says what to do next**
- the zone screen opens with `NEXT — <zone> · <blurb>`, or `EVERY ZONE CLEARED` once all five are done.
- it is reachable mid-run on `M` as of 1.24.0, so it is the answer to "where am I supposed to go".

**Five levels**
- the progression is unchanged (five zones, unlocked in sequence, the last one the warden) but it now
  reads as five places: distinct cold open, distinct epilogue, distinct palette and props, and the map
  shows which are cleared.

**Tests**
- 5 new assertions: five zones with story, zones do not share text, unknown zone falls back, epilogue
  exists.


## 1.24.0 — 2026-11-19

Four reports from play, two of them real defects.

**Fixed: the keycard could be placed where nobody could reach it**
- cell pickers used `openCells`, which includes the sealed secret alcove (open floor, unreachable by
  design) and crate cells (open floor until shot apart). A keycard in either made the level
  uncompletable, which is exactly "the gate never opens".
- `generateLevel` now computes a reachability field once from the spawn and exposes `reachableCells`;
  the keycard, relics, pickups and enemy spawns all draw from it.
- a test asserts no reachable pick is solid, secret or a crate.

**Fixed: an unhandled pointer-lock rejection**
- `requestPointerLock` without a user gesture throws `NotAllowedError`. The retry path did not catch its
  own promise, so pausing and resuming could throw in the console. Both paths swallow it now.

**New: the objective line**
- one line at the top of the HUD that answers "what am I doing": `CLEAR THE WAVE · 6 LEFT`, then
  `FIND THE KEYCARD`, then `REACH THE EXIT`. This is the fix for standing in front of a shut gate with
  no idea why it is shut.

**New: the journal** (`J`)
- zone, objective, wave, score, what you have found (relics, secrets, terminals, trinkets) and the five
  zones with their state.

**New: the world map mid-run** (`M`)
- pauses and opens the zone map instead of only being reachable from the menu.

**Compass retargets**
- the waypoint points at the keycard while it is missing and at the exit once it is open.

**Note on enemies through walls** — not reproduced: ten enemies crowded near a wall for ten seconds
never entered a solid cell in the headless harness, and `tryMove` uses a circle test against the same
collision the player uses. If it still happens in a browser, the next step is a recording of the
position, not a guess.


## 1.23.0 — 2026-11-19

**Enemy level of detail** — the draw-call win the measurement pointed at

1.22.1 established that the level is 11 of 117 draw calls and the rest is bodies and effects. Each
enemy is ten meshes. Past 22 m an enemy is now a single slab instead of ten parts.

| Scene | Draw calls | Triangles |
| --- | --- | --- |
| Before, 8 enemies | 66 | 5088 |
| After, 8 enemies | **32** | 4738 |

Same camera, same seed, 1280×720. The proxy shares one geometry and one material across every enemy,
so the switch allocates nothing, and it hides the whole body group rather than walking the parts.

**Guard** — the smoke test's draw-call budget drops from 160 to 140, which is the number the LOD change
earns.

**Test** — the geometry-sharing assertion had to reach through the new body group; it now finds the
flashable torso by walking `e.body` rather than indexing `mesh.children[0]`.


## 1.22.1 — 2026-11-19

**Chunked level meshes: measured, then rejected** (roadmap 46)

The plan was to split the merged geometry into 4×4-cell chunks so the renderer could cull most of the
level each frame. Measured on the arena at 1280×720, with the same camera and seed:

| Geometry | Level meshes | Draw calls | Triangles |
| --- | --- | --- | --- |
| One mesh per texture | 11 | **117** | 3642 |
| 4×4-cell chunks | 158 | **255** | 3610 |

Chunking more than doubled the draw calls and removed 32 triangles. The arena is 32×32 cells; from the
spawn you can see most of it, so almost every chunk is in the frustum and the split only adds per-mesh
overhead.

The code keeps the chunk mechanism behind a `CHUNK` constant set to a single chunk, with the numbers in
the comment, and the roadmap records the rejection. The real cost is enemies — 117 calls for a level
that is 11 of them means the other ~106 are bodies and effects, so instancing (roadmap 45) is the
change worth making, not chunking.

**Guard** — the smoke test now asserts the arena stays under 160 draw calls, so this cannot be
re-introduced without the number moving.


## 1.22.0 — 2026-11-19

Tier A of the audit replan: seven quick wins, one of them a legal obligation.

**`NOTICE.md`** — Three.js is vendored under MIT. The file keeps its SPDX header but the full
permission text was not shipped; `NOTICE.md` now carries it, the version, the file paths and a
statement that every other asset is generated at runtime.

**Grenade on touch** — a seventh button in the touch grid. The feature shipped in 1.21.0 was
unreachable on a phone.

**Colour-blind cues finished** (roadmap 3) — the exit reads `EXIT OPEN ▸` or `EXIT SHUT ▪` in words as
well as colour, the keycard chip is ◇ or ◆, and the damage indicator is a triangle, not a hue.

**Doors animate** (roadmap 39) — they slide up over 400 ms instead of vanishing.

**Corpses persist** (roadmap 40) — bodies settle on the floor and stay; the last twelve are kept and
the oldest is cleared, so a wave leaves a room that looks like a fight happened in it.

**Blood pools** (roadmap 41) and **contact shadows** (roadmap 43) — a decal at the death position and a
soft quad under every enemy.

**Tests** — 6 new assertions: a body stays and stays listed, an enemy carries a shadow, doors animate,
the touch layout has a grenade button.


## 1.21.0 — 2026-11-19

**Grenades** (roadmap 24)
- `G` or right-click lobs one: 15 m/s with an upward toss, gravity 22, bounce 0.42 off walls and floor,
  a 1.7 s fuse and a 5 m blast for 110 damage. Three per run, shown as pips above the stamina bar.
- the fuse is the weapon: it passes by enemies without detonating, so a bounce around a corner works.

**Under the hood**
- `Projectiles` gained gravity and bounce, both zero for rockets and fireballs, so nothing else changed.
- a bouncing projectile reflects off the wall normal and slows to 60 % rather than exploding.


## 1.20.0 — 2026-11-19

**Sprint stamina** (roadmap 30)
- sprint is a resource now: 3.3 seconds of it, drained at 0.30/s, refilled at 0.20/s while moving and
  0.40/s standing still, starting 0.55 s after you stop. Below 2 % you walk. A thin bar under the health
  appears only when it is not full, and turns orange below a quarter.

**Crates** (roadmap 33, second half)
- one or two per room: solid cells you can shoot apart. 45 health, they block movement and line of
  sight through `circleBlocked`, and breaking one opens the cell and leaves debris. Unlike a barrel, a
  crate does not explode — it is cover, and cover that can be removed.

**Tests**
- 7 new assertions: sprint draining, refilling while still, a crate marking its cell, chipping,
  breaking, and the cell being recorded as open.


## 1.19.0 — 2026-11-19

**Stairs and raised platforms** (roadmap 38)
- a room can carry a dais: part of its floor is lifted 0.8–1.4 m and the one-cell band between the two
  levels is a stair that interpolates across the cell, drawn as three steps with risers. Height changes
  stop being a cliff you have to jump.
- `floorHeightAt` interpolates across a stair cell, so the player, the pickups and the enemies all
  follow the ramp rather than the cell's nominal floor.
- corridors are carved at floor 0 and can meet a raised platform at its edge, so a reconciliation pass
  turns any open cell that touches a platform into a stair.
- each platform is verified before it is accepted: if it leaves any open cell unreachable, that room's
  platform is rolled back and the level is generated without it.

**Test invariants**
- the step-height check now distinguishes a stair band (rise ÷ 3) from a ledge, and skips platform cells
  reached across one.
- the walk-the-flow-field test skips the sealed secret alcove, which is open floor by design and
  unreachable until broken.


## 1.18.0 — 2026-11-19

**Secret rooms** (roadmap 32)
- one per level: a wall cell on the edge of a room with a one-cell alcove carved behind it, sealed
  until you break it. It renders a shade off the surrounding rock, so it can be spotted up close and is
  invisible from across the room.
- 90 health, any weapon chips it, breaking it pays 250 and toasts `SECRET`. The alcove is open floor
  from then on, and `isBlocked` treats a broken secret as a doorway.

**Test invariants changed with it**
- the level suite asserts every open cell is reachable from the spawn. A sealed alcove breaks that by
  design, so secret cells are excluded — and a new assertion checks the secret is solid before and
  passable after, rather than quietly dropping the coverage.
- `raycastWalls` now returns the cell it hit, so a caller can tell what it shot.


## 1.17.0 — 2026-11-19

**Exploding barrels** (roadmap 33, partial)
- six per level, placed on open floor away from the spawn and the exit. 30 health each; a shot that
  passes through one takes it down, and then it goes: 70 damage falling off over 4 m to everything in
  range, including you, with a flash, a shake and the boom.
- hits are a point-to-ray test on the ground plane, not a distance from the wall behind it, so a barrel
  in the open is hit wherever it stands.

**Crouch finishes** (roadmap 31)
- enemies now aim at the crouched eye, so going low actually changes what they can hit.

**Not built:** crates that block. The item was "barrels that explode, crates that block"; only the first
half exists and the roadmap says so.


## 1.16.0 — 2026-11-19

**Crouch** (roadmap 31)
- `Ctrl` or `C` lowers the eye from 1.62 m to 1.05 m and takes 45 % off your speed, easing in over about
  80 ms. Sprint is disabled while crouched. The hit sphere is still a fixed cylinder — that half of the
  item is not built.

**Damage numbers** (roadmap 29)
- the damage a shot lands floats up from the hit point and fades over 0.7 s, larger and orange above 60.
  Off when reduced motion is on, because it is motion.

**Guarded**
- `damageNumber` needs a `Vector3` to project; a plain `{x, y, z}` is refused rather than throwing.


## 1.15.0 — 2026-11-19

**Weapon attribution**
- a kill records the weapon that made it, so the kill feed reads `IMP → CHAINGUN` and the game-over
  screen shows the favourite weapon with its count.

**Enemy barks** (roadmap 35)
- a growl the first time an enemy sees you, pitched per type: the warden low, the hound high, the imp
  and the grunt between. Positioned and occluded like every other sound.

**Two audio bugs found on the way**
- `play(name, at)` took no options, so `play('step', { gain })` passed an option object where a
  position was expected, and `panGain` turned it into `NaN` — footsteps were silent even after being
  wired in 1.14.0. `play` now takes `(name, at, opts)` and `spatialOut` refuses a position without
  numeric `x`/`z`.
- the step sound ignored its gain option entirely.

**Feed**
- `hud.feed` used `prepend` and `lastChild.remove()`, neither of which the test DOM has. Falls back to
  append and `removeChild`.


## 1.14.0 — 2026-11-19

**Chaingun** (roadmap 23)
- a fourth weapon on `4`: 9 damage, 0.075 s cooldown once spun up, wide spread, shared bullet pool.
  The cooldown starts at 2.6× and reaches its floor after 0.55 s of held fire, so it rewards staying on
  target rather than tapping. Its own view model and its own synthesised report.

**Sound occlusion** (roadmap 18)
- a positioned sound with no line of sight to the player now runs through a 640 Hz lowpass at 55 % gain.
  `main.js` installs the test; without it every sound is direct.

**Kill feed** (roadmap 28)
- enemy name and outcome in the corner, five rows, fading after three seconds.

**A bug from 1.12.0, found while wiring occlusion**
- footsteps were never connected: `player.onStep` was implemented and never assigned in `main.js`. The
  suite passed because it attached its own callback, which tested the mechanism rather than the
  integration. Now wired, and the smoke test asserts the game sets it.


## 1.13.0 — 2026-11-19

**Ambient drone** (roadmap 36)
- three detuned sawtooths under a lowpass, 0.07 Hz LFO on the gain, 0.028 peak: present, never noticed.
  Starts with a run, fades out over 0.8 s on pause, death and zone clear.

**Pickup glow** (roadmap 34)
- every pickup carries a soft radial sprite halo, so it reads in the dark. Falls back to a flat sprite
  when there is no 2d canvas context.

**Accessibility** (roadmap 3, partial)
- the keycard chip is ◇ when you do not have it and ◆ when you do, so it reads in greyscale. The exit
  compass and the damage arrow were already directional, not colour-only.

**Small fixes**
- alt-tab to another window pauses the game; `visibilitychange` alone missed it (roadmap 15)
- `Esc` closes the settings screen instead of doing nothing (roadmap 16)

**Stub**
- `Sprite`, `SpriteMaterial` and `CanvasTexture` added, which the halo needs. `check-stub` caught the gap
  before the suites did.


## 1.12.0 — 2026-11-19

Back to the game after the fleet work. Four roadmap items.

**Footsteps** (roadmap 12)
- a bandpass-filtered noise burst on each half cycle of the head bob, quieter when walking, silent
  when standing. The player's own feet, synthesised like everything else.

**Accuracy and damage on the game-over screen** (roadmap 27)
- shots fired and hit percentage, tracked in `weapons.js`; damage taken, tracked through
  `player.onDamage`. Favourite weapon is not built.

**Top five runs** (roadmap 11)
- a table of the five best runs by score, with wave and kill count, kept in `localStorage` under
  `hellgate.runs`. The run you just finished is highlighted.

**Copy seed** (roadmap 10)
- a button under the seed that copies a linkable `?seed=` URL, with a clipboard fallback for browsers
  without `navigator.clipboard`.

**Tests**
- 6 new assertions: accuracy arithmetic, the step callback firing while walking, the table capped at
  five and sorted by score.

**Screenshots** regenerated: 11 frames, 297 KB total after WebP conversion.


## 1.11.2 — 2026-11-19

**`neon-engine` went from 2 to 86 documented exports**
- every exported symbol in that repo now carries a JSDoc block: 86 of 86, up from 2. Its `docs`
  workflow switched from `--warn` to hard mode, so the next export without a block fails its build.
- 34 files changed, 252 lines added, nothing else touched. Every module still parses; the repo's own
  `tests`, `docs` and `meta` workflows are all green.

That closes the last gate running in warn mode anywhere in the fleet.


## 1.11.1 — 2026-11-19

**The two fleet drifts, resolved**
- `saga-vn-engine`: `VERSION` said 1.0.1 while `CHANGELOG.md` documented 1.0.2, and both version badges
  still read 1.0.1. Version and badges now follow the changelog.
- `aethelgard-rpg-engine`: `VERSION` 1.0.1 against a newest heading of 1.0.0. That is a version bumped
  for work in progress, not a release the changelog forgot, so the tool now separates the two: behind
  the changelog is a failure, ahead of it is a warning. Both repos run in hard mode.

All eight sibling repos are now green in hard mode, with no `--warn` left in the fleet.


## 1.11.0 — 2026-11-19

**A portable metadata gate, and two real drifts found with it**
- `tools/check-meta.mjs`: `VERSION` vs the newest `CHANGELOG` heading, `package.json` vs `VERSION`,
  `LICENSE` vs the licence the README names. Absent files are skipped; a missing `VERSION` is a
  warning, not a failure. Wired into CI as step 14 and pushed to all eight sibling game repos.
- it found two genuine mismatches in the fleet: `saga-vn-engine` ships `VERSION 1.0.1` with a
  `CHANGELOG` heading of `1.0.2`, and `aethelgard-rpg-engine` ships `VERSION 1.0.1` with `1.0.0`.
  Both run in `--warn` mode until those are resolved; the other six run in hard mode.

**Fixed while making it portable**
- the licence comparison read the shields.io URL out of the README and reported `PolyForm
  Noncommercial` against `PolyForm%20Noncommercial%201.0.0-2e7d32` — eight false positives. Both sides
  are now normalised to a licence family.
- `--warn` was referenced by two workflows before it existed; the tool grew the flag rather than the
  workflows growing a workaround.


## 1.10.3 — 2026-11-19

**The JSDoc gate reached exactly one sibling, and that is the honest answer**
- `check-docs.mjs` gained `--src` and `--warn`, and a fix for a false green: with no exports found it
  reported 0/0 as 100 %. It now says so and fails in hard mode.
- of the eight sibling game repos, only `neon-engine` is an ES-module codebase (36 files with
  `export`). The other seven are IIFE or single-file scripts, so an export-level rule does not apply.
- `neon-engine` now runs it in warn mode: 2 of 86 exports documented (2 %). The number is the point;
  the badge stays green until the coverage earns a rule.


## 1.10.2 — 2026-11-19

**The link gate is in all eight sibling game repos**
- `Scrap-and-Gun`, `retro-strike`, `app-story-engine`, `saga-vn-engine`, `neon-engine`,
  `aethelgard-rpg-engine`, `game-kit`, `eon-commando` — every one has `tools/check-links.mjs` and a
  `links` workflow, and every one is green.
- `eon-commando` needed a new `--ignore 'src/*'` flag: its `src/*.html` are build fragments that carry a
  doctype but are concatenated into `index.html`, so their relative paths resolve against the output
  rather than against where they sit.

Four of those repos had no CI before this. The workflows pin `actions/checkout` and
`actions/setup-node` by SHA and set `permissions: contents: read`.


## 1.10.1 — 2026-11-19

**Link checker, and a fleet result**
- `tools/check-links.mjs`: every local `href` and `src` in every page must resolve. Wired into CI as
  step 13. It resolves root-absolute paths against the domain root, a project sub-path and `docs/`,
  which is what makes it portable.
- run against the eight sibling game repos: seven pass cleanly. `eon-commando` fails on
  `src/00_head.html → icon-192.png`, which is a build fragment concatenated at build time, not a
  broken page — a false positive the tool cannot see past.
- piloted into `Scrap-and-Gun`, the closest genre sibling and the only one with no CI at all. Its
  `links` workflow is green.

**Fixed while making it portable**
- `upi:` and every other scheme was treated as a local path; the check now skips anything with a
  scheme.
- root-absolute links to a project Pages root were reported broken in three repos before the
  multi-base resolution.


## 1.10.0 — 2026-11-19

Everything here came from the fleet comparison: five things the sibling game repos do better, ported.

**Fixed timestep** (from `game-kit`)
- the simulation advances in 1/60 s steps whatever the display does, so 30 fps and 144 fps produce the
  same game. The backlog is capped at four steps so a stalled tab cannot simulate a minute at once.
  Closes roadmap item 57.

**Save round-trip and zone completion** (from `aethelgard-rpg-engine/tools/verify.js`)
- the smoke test now saves a run, reloads the page, asserts Continue appears with the wave in its
  label, resumes, and checks the score and wave came back. It also plays a zone to the end and asserts
  the progress record.

**Dead-code audit** (from `aethelgard-rpg-engine/tools/static-audit.py`)
- `tools/audit-dead.mjs`: exports nothing imports, and constants declared twice with different values.
  Its first run found two dead exports (`ceilHeightAt`, `STORY_PANELS`), now deleted, and one false
  positive (`isBlocked`, used by the level suite) that exposed the tool not scanning `tests/`.

**PAGES.json guard** (from `neon-engine/tests/pages.cjs`)
- `tools/check-pages.mjs`: every path declared in `PAGES.json` still exists, so a rename cannot quietly
  404 the live site. The file protected nothing before this.

**Onboarding and balance docs** (gap against `neon-engine`)
- `documentation/getting-started.md` and `documentation/balance.md`. The second says plainly that no
  constant in this repository is backed by playtest data.

**CI**
- 10 steps to 12.


## 1.9.1 — 2026-11-19

**Unattended play harness**
- `tools/soak.mjs`: a bot that aims at the nearest enemy, follows the flow field to it, fires only with
  line of sight and switches weapons when one runs dry. 90 seconds per seed per difficulty.
- it is documented as a stability check, not a balance measurement: the bot kills slowly because it
  fires through a shotgun's spread at range, and its kill count says more about the bot than the game.

**What the investigation found**
- the first version fired with no line-of-sight check and every pellet ate a wall; the second walked
  straight at the target and stuck on walls. Both were bot defects, not game defects — the hitscan
  path is already covered by the gameplay suite.


## 1.9.0 — 2026-11-19

**Branching terminals**
- two terminals ask a question with two answers: 20 health for a relic or 150 score; open the
  maintenance shaft and get three imps, or leave it shut.
- every level is guaranteed to hold at least one, so the mechanic cannot be missed by luck of the draw.
- an answer is recorded by terminal title: `resolveChoice()` returns early on a second call and the
  panel shows what you chose instead of the buttons.

**Documented limit**
- Firefox and WebKit cannot run here: Playwright's builds need `libXcursor`, `libgtk-3` and `libgdk-3`,
  and the sandbox has no package manager. Recorded in `documentation/testing.md` rather than left as a
  vague "not tested".

**Tests**
- 6 new assertions: a choice terminal opens, the reward lands, the answer is recorded, a repeat pays
  nothing, and the ambush answer spawns enemies.


## 1.8.0 — 2026-11-19

**Trinkets**
- six passive trinkets drop from kills at 12%: damage, max health, energy regeneration, movement
  speed, starting armour, and 2 health per kill.
- three fit in the belt; a fourth is sold for 100 score rather than displacing anything.
- effects are summed by `sumEffects()` and folded into `recomputeStats()`, so trinkets compose with the
  class, the between-zone upgrades and the timed pickups. The belt is part of the run save and shown
  in the status panel.

**Tests**
- 8 new assertions: the table, the slot count, effect summing, each effect reaching the player, a
  fourth drop not fitting, and spares paying score.


## 1.7.0 — 2026-11-19

**The warden's phases**
- three phases at two thirds and one third of health. Phase 2 shortens the cooldown and widens the
  slam; phase 3 shortens it again and summons two hounds, once. The health bar carries the phase
  number and the chest core brightens with it.

**Upgrades between zones**
- clearing a zone offers three of six upgrades; taking one stacks it for the rest of the session:
  damage, max health, energy regeneration, power cooldowns, movement speed, starting armour.
- `recomputeStats()` rebuilds the class's base numbers from scratch, so upgrades compose cleanly with
  the class and the timed pickups. Reset when a campaign starts at the first zone.

**Tests**
- 12 new assertions: the three phases, the faster cooldown, the summon and that the summons are
  hounds; each upgrade's effect on the base numbers.


## 1.6.1 — 2026-11-19

**Documentation**
- every one of the 52 module-level exports now carries a JSDoc block: 0% to 100%
- `documentation/api.md`, one line per export, generated from those blocks
- `tools/check-docs.mjs` fails the build when an export loses its doc block, wired into CI next to
  the claim checker

The checker had a bug worth recording: its own header comment contained a closing delimiter, which
ended the comment early and made the file unparseable. The tool that enforces comments was broken by a
comment.


## 1.6.0 — 2026-11-19

**Status panel**
- `Tab` freezes the game and shows class, health, armour, energy, the three weapons with ammo and
  which is equipped, the three powers with cost and cooldown, live buff timers, and the zone's wave,
  score, kills and relics. Reads from the same objects the HUD does.

**Continue**
- a run is written to `localStorage` at the start of every wave: zone, seed, wave, score, kills,
  class, health, armour, ammo. The title screen offers it as Continue, labelled with the zone, wave
  and score. Cleared on death and on clearing a zone.

**Tests**
- 10 new assertions: the save exists and carries zone, wave and score; resuming restores state and
  wave; the panel opens with content and closes; the save clears. Smoke covers the panel and the save
  in a real browser.


## 1.5.1 — 2026-11-19

Touch controls, fixed. They were present but effectively unusable on a phone.

- the overlay is now shown only while playing; on the title, intro, class and map screens it was
  either hidden behind them or in the way of their buttons
- the layout fits a phone: below 620 px the HUD bar shrinks to the viewport width, the power bar
  lifts above it, and the six buttons become two rows of three. Below 420 px of height everything
  scales to the corners. Both use `env(safe-area-inset-bottom)`.
- pointer lock is never requested on a touch device, and losing a lock no longer pauses the run —
  rotating the phone was dropping the lock and freezing the game
- the companion drone was the size of the player's head at 1.2 m; it is smaller and sits behind the
  shoulder, and hides if it would sit on the camera

Verified by driving the real pages at 390x844 and 844x390 in Chromium with touch emulation: the
overlay appears, every control is inside the viewport, and dragging the stick moves the player.


## 1.5.0 — 2026-11-19

**Terminals**
- three readable terminals per zone, on a post with a green screen. Walk within 2.2 m, press V, get a
  two-paragraph note from whoever was here before. First read pays 75.
- a prompt appears when one is in reach; the screen dims once read

**Timed pickups**
- damage (x1.5) and haste (x1.25) pickups, 20 seconds each, shown as HUD chips. Multipliers are
  recomputed from the class base every frame, so they stack and expire cleanly.

**Fix**
- releasing the pointer lock on purpose (reading a terminal, clearing a zone) could pause the game a
  frame later, because the pointerlockchange event arrives after the state has already returned to
  playing. A lock-intent flag now distinguishes an intentional release from the player pressing Escape.
  Found by the browser smoke test, which failed to cast a power immediately after closing a terminal.


## 1.4.0 — 2026-11-19

**The warden**
- a real boss for the last zone: 620 hp, 3 m tall, a glowing chest core and a health bar across the
  top of the screen. Roadmap item 22.
- two alternating attacks: a ground slam that hits everything within 5 m, and a three-ball fireball
  spread. Both telegraphed for 0.7 s.
- spawns on the final wave of The Throne alongside three trash enemies

**Performance**
- prop LOD: the grass mesh hides itself when the adaptive resolution drops below a 1.0 pixel ratio,
  because grass is the cheapest visual and the most instances

**Tests**
- 12 new assertions: the warden spawns, its health, the manager's boss accessor, the health bar
  showing, naming and hiding, and the grass LOD switch


## 1.3.0 — 2026-11-19

The RPG pass: classes, powers, a companion, five zones, a cold open and touch controls.

**Systems**
- three classes (marine, ranger, warden) setting HP, armour, speed, damage, energy, starting weapon
  and power set
- five powers on an energy pool with cooldowns: dash, shockwave, ward, volley, bulwark. Bound to
  Q, E and R, with an energy bar and per-slot cooldown fill in the HUD
- companion drone: follows, engages what it can see for 7 damage every 0.85 s, goes dormant past 26 m
- five zones with palettes, props and objectives; clearing one unlocks the next; progress and best
  score per zone in localStorage
- relic side objective in every zone: 150 each, 400 for the set
- cold open: four typed panels over a camera flythrough of the level you are about to play
- instanced trees, rocks and grass; animals that wander and bolt
- mobile touch controls: virtual stick, look-and-tap-to-fire, buttons for jump, powers and weapon

**Verification**
- the smoke test now walks title -> intro -> class -> play in a real browser and asserts powers,
  energy, props, instancing, the companion and the relics exist; a power spends energy and starts its
  cooldown
- 4 new screenshots: cold open, class select, world map, grove


## 1.2.0 — 2026-11-19

**Gameplay**
- hounds: a third enemy type from wave 4. Fast, melee only, 22 hp, so one shotgun blast kills it and
  the pistol cannot keep up with a pack. Roadmap item 21.
- difficulty presets: easy, normal and hard, multiplying enemy hp, damage and wave size. Persisted
  with the other settings. Roadmap item 25.
- score: kills, a wave bonus and a shrinking time bonus, shown in the HUD and recorded as the best
  run. Roadmap item 26.

**Tests**
- 12 new assertions: wave size and enemy hp across the three presets, hound composition and speed,
  score awarded on wave clear, HUD score, best-run score.


## 1.1.0 — 2026-11-19

**Gameplay**
- BFS flow-field navigation: one field for every enemy, rebuilt three times a second from the player's
  cell. Enemies walk around walls instead of leaning on them. Roadmap item 17, the last known gameplay
  defect.

**Verification**
- the smoke test now exercises audio in a real browser: AudioContext creation, master gain against the
  volume setting, a spatialised play call, and mute/unmute. The Node suites cannot touch this path.
- path-following assertions per seed: from twelve cells, following the field always ends at distance 0

**Performance**
- Lighthouse pass on the landing page: map SVG 96 KB of `<rect>` to 6.4 KB of paths, the blend-mode
  grain layer replaced, two contrast failures fixed. Accessibility 91 to 100, LCP 2.0 s to 1.2 s.


## 1.0.0 — 2026-11-18

First public release.

**The game**
- 2.5D sector world: 40×40 grid, per-cell floor and ceiling heights, canvas-painted textures on all
  surfaces, merged into five draw calls
- seeded level generation — rooms, L-shaped corridors, varied ceiling heights, raised ledges, a sealed
  exit room with up to three doors
- three weapons: hitscan pistol, 8-pellet shotgun with damage falloff, rocket launcher with splash,
  light and screen shake
- two enemies on one FSM: imps (telegraphed fireballs) and grunts (hitscan, melee), with grid
  line-of-sight, wandering, pain flinch, gibs and per-enemy hit flash
- wave loop with difficulty scaling, procedural pickups, and a keycard gate from wave 3
- HUD: Doom-style face, damage-direction arrows, vignette, crosshair hit marker, weapon sway
- title / pause / game-over screens, best run in `localStorage`, `?auto=&seed=&wave=&cam=` URL hooks

**Player settings (roadmap Tier 0)**
- settings screen: mouse sensitivity, FOV, volume, mute, reduced motion — persisted in `localStorage`
- reduced motion disables screen shake and weapon bob
- `M` mutes, `F` toggles fullscreen, the mouse wheel cycles weapons
- restart from the pause menu
- pickups are refused when they would be wasted (full health or armour)
- the seed is written into the URL so a run is linkable and reload-safe
- exit compass: a chevron points at the pad once the wave is cleared
- weapons dip out of frame and rise back on a swap

**Look and sound (transfers from castle-valley)**
- light and shade baked once into vertex colours: a fixed sun on every wall face, a floor-to-ceiling
  gradient, and corner AO where two walls meet. No shadow map, no extra draw call
- ACES filmic tone mapping, so muzzle flashes and the exit pad compress instead of clipping
- adaptive resolution: the pixel ratio drops toward 0.7 when frames exceed 21 ms and climbs back
  under 13.5 ms, capped at 1.5
- spatialised audio: `panGain()` computes stereo pan and distance gain per sound; enemy pain, death,
  shots and fireballs are heard from where the enemy stands, and every play is detuned slightly

**Engine work**
- vendored Three.js r187 (up from r160), verified headlessly against the real library
- anisotropic filtering, shared enemy geometry, per-run GPU disposal, raw pointer-lock request
- pooled effects: 600 particles, 16 tracers, 40 decals, 4 lights, zero allocation per shot
- debug overlay (`\``) with fps, draw calls and triangles

**Quality**
- three headless suites: 47-seed generator invariants, winding/normal validation over ~14k triangles,
  and a full gameplay run including a 2000-frame random-input soak
- `tools/check-claims.js`: 12 assertions tying every README number to the code that produces it
- `tools/smoke.mjs`: boots both real pages in headless Chromium and fails on any console error
- CI runs syntax check, suites, claims and smoke, with actions pinned by SHA and read-only permissions
- fleet conventions adopted: `SECURITY.md`, `PRIVACY.md`, `VERSION`, `PAGES.json`, `.editorconfig`,
  `CODE_OF_CONDUCT.md`, `404.html`, `robots.txt`, `sitemap.xml`
- support table uses the real handles instead of invented sponsor tiers
- landing page, documentation, and an enhancement roadmap

**Fixed during the build**
- HUD top bar printed `WAVE WAVE 2` (labels were written twice)
- rocket splash kills were not credited to the kill counter
- switching weapons inherited the previous weapon's full cooldown
- waves stacked enemies instead of starting from an empty arena
- a corridor running parallel to the exit room produced a wall of ten doors; doors now only appear
  where a corridor actually turns into the room, and the rest of the boundary is sealed behind rock
  with a reachability check
- the geometry test itself was silently passing — `geometry.index` is a `BufferAttribute` in real
  Three.js, not an array
