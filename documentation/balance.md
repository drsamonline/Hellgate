# Balance

The numbers, what they are trying to achieve, and what is known to be unmeasured.

## What the difficulty curve is doing

| Wave | Enemies | Composition | Intent |
| --- | --- | --- | --- |
| 1 | 6 | imps | teach the fireball telegraph |
| 2 | 8 | imps + grunts | teach that one enemy closes and shoots |
| 3 | 10 | imps + grunts, keycard | teach the exit gate |
| 4 | 12 | + hounds | force a weapon switch: one shotgun blast kills a hound |
| 5+ | 14+ | all three | pressure |

Five enemy types: the imp shoots flat, the grunt closes and shoots, the hound only closes, the spitter
holds its distance and lobs an arcing glob, and the warden is the warden. The spitter exists to punish
standing still, which is the one thing the other four let you get away with.

Health scales +10 % per wave, speed +3 %, damage +6 %, each capped (see `documentation/tuning.md`).
The caps are what stop wave 20 from being unplayable and keep it merely hard.

## The three dials a player owns

| Preset | Enemy hp | Enemy damage | Wave size |
| --- | --- | --- | --- |
| Easy | × 0.8 | × 0.7 | × 0.75 |
| Normal | × 1 | × 1 | × 1 |
| Hard | × 1.3 | × 1.25 | × 1.3 |

On top of that: an upgrade choice between zones and three trinkets from a belt of three. Both are
deliberately multiplicative with the class rather than additive with each other, so a good run
snowballs without a lucky one becoming trivial.

## The first playtest datapoint

**2026-11-20** — one player, one run: died on **The Gate, wave 3, Normal**. Their own read: "mostly easy
to play, kills you if not properly played".

That is n=1 and it is not a balance study, but it is the first number in this file that did not come from
arithmetic, and it agrees with the arithmetic: the preset alone made **zone 1 wave 3 identical to zone 5
wave 3**, so the first level was as hard as the last one at the same wave number. Dying on level one and
never seeing levels two to five is exactly what that produces.

### What changed

Each zone now carries a `threat` scalar, applied to health, damage and count:

| Zone | threat | Wave 3 enemies | Wave 3 total hp |
| --- | --- | --- | --- |
| The Gate | 0.72 | 7 | 281 |
| The Foundry | 0.86 | 8 | 335 |
| The Grove | 1.00 | 10 | 390 |
| The Vault | 1.12 | 11 | 437 |
| The Throne | 1.22 | 12 | 476 |

Before this, every zone was 10 enemies and 526 hp at wave 3. The Gate is now about half the threat it was
at the point where that run ended, and The Throne is harder than it was.

## The curve, as arithmetic over the code

`node tools/balance-report.mjs` reads the same constants the game uses and prints what a wave costs. Normal
difficulty:

| Wave | Enemies | Total hp | Shells to clear | Seconds (shotgun only) | Enemy dps if all in range |
| --- | --- | --- | --- | --- | --- |
| 1 | 6 | 330 | 4 | 3.2 | 43 |
| 2 | 8 | 454 | 6 | 4.4 | 55 |
| 3 | 10 | 526 | 6 | 5.1 | 69 |
| 4 | 12 | 684 | 8 | 6.6 | 91 |
| 5 | 14 | 810 | 10 | 7.8 | 98 |
| 6 | 16 | 963 | 11 | 9.3 | 112 |
| 7 | 18 | 1111 | 13 | 10.7 | 119 |
| 8 | 20 | 1382 | 16 | 13.3 | 140 |

Two things follow from those numbers and nothing else does:

- **Ammo is the real clock.** You carry 16 shells. Wave 8 needs all of them, so from wave 7 the run is
  about finding ammo rather than aiming. That is deliberate, and it is why pickups matter more than score.
- **Enemy dps passes your health pool at wave 2.** 110 hp + 25 armour against 55 dps means standing in the
  open for four seconds is fatal from wave 2 onward. The game is a movement game from the second wave.

The dps column assumes every enemy is in range and attacking on cooldown, which never happens. It is an
upper bound, not a prediction.

## What is measured, and what is not

Measured: the suites assert wave size and enemy health across the three presets, that hounds are
melee-only and faster than imps, that the warden's phases trigger at two thirds and one third, and that
every upgrade and trinket changes the number it claims to.

**Not measured: whether the game is fun, or whether normal is the right normal.** `tools/soak.mjs` runs
a bot for 90 s per seed, but the bot fires through a shotgun's spread at range and kills slowly, so its
numbers say more about the bot than the game. There is no playtest data behind any constant in this
repository. The curve above is reasoned, not observed.

## If you want to change it

Change one thing, then run `bash tests/run.sh` and `node tools/soak.mjs`. The suites will tell you if
you broke an invariant; the soak will tell you if the game still runs unattended. Neither will tell you
if it feels right — that needs a person and a stopwatch.
