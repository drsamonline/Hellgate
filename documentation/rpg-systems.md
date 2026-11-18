# RPG systems

What turned a wave shooter into something with a campaign. Seven modules, each small enough to read
in one sitting.

## Classes — `play/src/classes.js`

Chosen once per run, after the cold open. A class sets four numbers, a starting weapon and a power
set; nothing else in the game knows what a class is.

| | HP | Armour | Speed | Damage | Energy | Weapon | Powers |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Marine | 110 | 25 | ×1.0 | ×1.0 | 100 | shotgun | dash, shockwave, ward |
| Ranger | 85 | 10 | ×1.16 | ×1.18 | 130 | pistol | dash, volley, ward |
| Warden | 135 | 60 | ×0.90 | ×0.92 | 80 | rocket | shockwave, bulwark, dash |

`speed` and `damage` are multipliers applied in `player.js` and `weapons.js`. The class is persisted in
settings, so a reload keeps it.

## Powers — `play/src/powers.js`

An energy pool that regenerates at 11 per second, three slots bound to `Q`, `E` and `R`, and a
per-power cooldown. Casting is refused if either budget is short, and the HUD shows both: a blue bar
for energy, a red fill from the bottom of each slot for its cooldown.

| Power | Cost | Cooldown | Effect |
| --- | --- | --- | --- |
| Dash | 20 | 2.6 s | 16 units/s impulse along the view direction, 0.35 s of immunity |
| Shockwave | 35 | 5.5 s | 45 damage in a 6 m sphere, plus screen shake and a light |
| Ward | 25 | 9 s | 40 armour, instantly |
| Volley | 30 | 6 s | six hitscan shots, no ammo, small spread |
| Bulwark | 45 | 14 s | heal 30, halve all incoming damage for 6 s |

`cast()` takes a context object and calls into the systems that already exist — `enemies.damageSphere`
for the shockwave, `enemies.raycast` for the volley, `effects` for everything visible. A power is
therefore a small piece of glue, not a second combat system.

## Companion — `play/src/companion.js`

A drone. It floats, so it ignores collision and pathing entirely: it hovers to a point behind the
player, and shoots the nearest enemy it can see for 7 damage every 0.85 s. It cannot die. It goes
dormant when you leave it more than 26 m behind, which is the cost of running away from a fight.

## Zones — `play/src/world.js`

Five arenas, unlocked in order. A zone is a seed, a palette and an objective:

| # | Zone | Seed | Palette | Props | Objective |
| --- | --- | --- | --- | --- | --- |
| 1 | The Gate | `hellgate` | brick, warm | 10 rocks, 24 grass, 3 animals | Clear the arena |
| 2 | The Foundry | `foundry-7` | tech, industrial | 18 rocks, 8 grass, 1 animal | Clear the foundry |
| 3 | The Grove | `grove-3` | brick, green | 26 trees, 60 grass, 8 animals | Clear the grove |
| 4 | The Vault | `vault-11` | tech, violet | 14 rocks | Clear the vault |
| 5 | The Throne | `throne-0` | brick, red | 8 trees, 20 rocks, 2 animals | Kill the warden (4 waves, the last one is the boss) |

The zone overrides every cell's wall and floor texture after generation, and sets the fog, ambient and
hemisphere colours, so one generator produces five looks. Progress — which zones are cleared, and the
best score in each — lives in `localStorage` under `hellgate.progress`.

Clearing a zone means clearing three waves (four in the last) and stepping onto the exit pad.

## Side objectives — relics

Every zone hides 1–3 relics, placed in rooms other than the exit. Each is worth 150, and collecting
all of them is worth another 400 and a toast. They are the reason to walk into a room you do not have
to.

## Story — `play/src/story.js`

The cold open is four typed panels over a camera flythrough of the level you are about to play: the
three biggest rooms and the exit, at ceiling height, easing between them. No video, no assets, about
14 seconds, skippable with the button or `Esc`. It exists because a generated arena with no framing
reads as a tech demo.

## Touch — `play/src/touch.js`

Enabled on a touch device or with `?touch=1`. The left third is a virtual stick; the right half looks
on drag and fires on a tap under 260 ms and 14 px of movement. Six buttons for the three powers, the
weapon, jump and fire sit bottom-right. The stick writes into the same `input.move` vector the
keyboard uses, so nothing downstream knows the difference.

The overlay is shown **only while playing**. On the title, intro, class and map screens it is hidden,
because it is either behind those screens or in the way of their buttons.

Two layouts, switched by media query: below 620 px the HUD bar shrinks to the viewport width, the
power bar lifts above it and the buttons go two rows of three; below 420 px of height (a landscape
phone) the HUD scales to 0.86 and the stick and buttons tighten to the corners. Both use
`env(safe-area-inset-bottom)` so a home indicator does not sit on the fire button.

Pointer lock is never requested on a touch device, and losing a lock never pauses the game there.

## Terminals — `play/src/lore.js`

Three per zone, stuck to a floor post with a green screen, readable once with `V` when you are within
2.2 m. The nearest one lights up and a prompt appears. A first read pays 75 and dims the screen; a
second read shows the same text and pays nothing. It is the closest thing here to an NPC: somebody was
in this room before you and left a note.

## Timed pickups

Two more pickup kinds, both on a 20-second clock and shown as chips in the HUD:

| Pickup | Effect | Duration |
| --- | --- | --- |
| Damage | ×1.5 on every weapon | 20 s |
| Haste | ×1.25 movement speed | 20 s |

The multipliers are recomputed every frame from the class base, so they stack with a class bonus and
expire cleanly rather than leaving a multiplied value behind.

## What this is not

- No dialogue and no branching. Terminals are monologues; nothing replies.
- One boss, two attacks, no phases. It is a fight, not an encounter design.
- No inventory: powers are fixed per class, pickups are ammo and health only.
- No saving mid-run. Progress is per zone, not per step.
- The zones are separate arenas, not one continuous world. "Open" means unlocked, not seamless.
