# Getting started

Five minutes from a clone to a run.

## Run it

```bash
git clone https://github.com/drsamonline/Hellgate.git
cd Hellgate
python3 -m http.server 8000
```

Open <http://localhost:8000>. `/` is the landing page, `/play/` is the game.

ES modules and an import map need a real HTTP origin, so opening `index.html` from the file system
will not work. Any static server does: `npx serve`, `php -S localhost:8000`, Live Server.

Three.js is vendored in `play/vendor`, so there is nothing to install and no network request after the
page loads.

## First run

1. `Enter the gate` — the cold open plays over the level you are about to get. `Skip` or `Esc`.
2. Pick a class. Marine is the balanced one; it starts with the shotgun.
3. `WASD` to move, mouse to look, left button to fire. `Q` `E` `R` are your powers.
4. Clear three waves. The exit opens when the room is empty; walk onto the green pad.
5. `Tab` shows everything you have. `V` reads a terminal. `Esc` pauses.

## Where things are

| Path | What |
| --- | --- |
| `play/src/level.js` | level generation, collision, wall raycast, navigation. No Three.js |
| `play/src/main.js` | boot, input, state machine, waves, saving |
| `documentation/` | architecture, level generation, combat, RPG systems, tuning, testing, API |
| `ENHANCEMENTS.md` | 63 items, ordered by value |
| `AGENTS.md` | invariants and traps, if you are an agent or a first-time contributor |

## Before you change anything

```bash
bash tests/run.sh          # 3 suites, ~4 s, no install
node tools/check-claims.js # README numbers vs the code
node tools/check-docs.mjs  # every export has a JSDoc block
```

If those three are green before you start and after you finish, you have not broken anything the
project already promised.

## Tuning without reading everything

Everything worth changing is a named constant: `WALK` and `SPRINT` in `player.js`, `WEAPONS` in
`weapons.js`, `TYPES` in `enemies.js`, `DIFF_MULT` and `UPGRADES` in `main.js`, `ZONES` in `world.js`.
`documentation/tuning.md` says what each one does to the game.
