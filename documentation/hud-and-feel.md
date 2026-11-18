# HUD and feel

A shooter lives or dies on whether the player can tell what just happened. This file lists every
feedback channel in the game, what it is for, and where it lives.

## The HUD

DOM, not canvas — it is text and a small bitmap, and the browser is better at text than I am.

```
#hud  (pointer-events: none, sits above the canvas)
├─ #topbar      WAVE n · KILLS n · LEFT n
├─ #keycard     dim chip → amber when held
├─ #crosshair   4 ticks, turns red on a hit
├─ #hitmarker   ✕ flash, 140 ms
├─ #vignette    red edge gradient, opacity driven by damage
├─ #dmgdir      rotated arrows, one per recent hit
├─ #toast       WAVE n / EXIT OPEN / FIND THE KEYCARD
└─ #bottombar   face canvas · HEALTH · ARMOR · AMMO · WEAPON
```

The `<b>` elements inside the top bar hold **only the number**; the labels live in the markup. (An
earlier version wrote `"WAVE " + n` into an element whose parent already said `WAVE `, and the first
screenshot of the game read `WAVE WAVE 2`. Screenshots catch what unit tests do not.)

## The face

A 72×72 canvas redrawn only when health changes, in the spirit of Doom's status bar:

| Health | Face |
| --- | --- |
| > 60 % | intact, neutral mouth |
| 30–60 % | darker skin, brow lowered, mouth flat, two blood streaks |
| < 30 % | sunken eyes, open mouth, four blood streaks |

It exists because a number is easy to ignore and a face is not. It costs one `clearRect` and a dozen
`fillRect` calls, and only when the value changes.

## Damage feedback

Three channels fire on every hit you take:

1. **Vignette** — a radial red gradient whose opacity jumps by `0.18 + damage × 0.01` and decays at
   1.6/s. Peripheral, so it does not obscure aim.
2. **Direction arrow** — the signed angle between the camera forward and the damage source is computed
   on the ground plane and used to rotate a chevron around the screen centre, which fades over 1.1 s.
   This is the channel that tells you *where to turn*.
3. **Screen shake** — a small additive offset, 0.22 on player damage, up to 1.4 on a nearby rocket.

Plus a low sawtooth "hurt" tone. Four channels for one event is not too many; it is the difference
between "I died" and "I died to something on my left".

## Weapon feel

| Channel | Value | Why |
| --- | --- | --- |
| Muzzle flash light | point light, 9 intensity, 60 ms | briefly lights the room, sells the shot |
| Muzzle flash mesh | in the weapon scene, 50 ms | the sprite version of the same thing |
| Recoil | kick 0.055 (pistol) → 0.17 (rocket), decays at 16/s | moves the view model back and up |
| Sway | ±0.012 units at walk speed, driven by the bob phase | the gun feels attached to a body |
| Tracer | 90 ms line from the muzzle to the hit point | shows *where the shot went* |
| Hitmarker | crosshair red + ✕ for 140 ms | instant "that connected" |
| Screen shake | 0.05 / 0.16 / 0.2 by weapon | weight |

## Enemy feedback

- **Hit flash** — each enemy clones its two body materials at spawn, so `hurt()` can drive `emissive`
  red for 160 ms on *that* enemy only. Shared materials would flash the whole room.
- **Flinch** — 55 % chance of a 0.26 s PAIN state with a body tilt.
- **Walk cycle** — limbs pivot at the shoulder and hip, swinging with a phase driven by movement speed,
  plus a vertical bob and a small roll.
- **Telegraph** — a scale pulse and chest particles before an imp's fireball; a raised gun before a
  grunt's shot.
- **Death** — gibs (two particle bursts), a fall over 0.45 s, then sinking into the floor for 1.2 s
  before removal. Materials are shared per type, so a fade-out would need another clone; sinking is
  the cheap, readable alternative.

## Pooling

Everything transient is pre-allocated: 600 particles in one `Points` object, 16 tracer lines, 40 decal
quads, 4 point lights. Firing a shotgun allocates nothing. This matters more than it sounds — GC
spikes are the usual cause of a 60 fps game that stutters.

## What is missing

Honest list, all of it on the [roadmap](../ENHANCEMENTS.md):

- no colour-blind-safe palette for the damage arrow and keycard chip
- no subtitle or caption for synthesised sounds
- no FOV or sensitivity settings, no key rebinding
- the face is decorative; nothing reads it out for a screen reader
- no reduced-motion mode for shake (the landing page respects the media query, the game does not)
