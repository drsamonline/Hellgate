# Contributing

Thanks for looking. This is a small project, so the process is short.

## Before you open a PR

```bash
bash tests/run.sh            # three suites, ~4 seconds, no install, no network
node tools/check-claims.js   # README numbers vs reality, 200 ms
node tools/smoke.mjs         # real pages in headless Chromium (needs puppeteer-core + a browser)
```

If you change a number in the README, `check-claims` will tell you whether the code agrees.

All three suites must pass. The geometry suite is the one that matters most: it recomputes every
triangle's normal from its winding order and checks that the face points into open space. An inverted
face is invisible in a diff and obvious to that test.

## What is welcome

- **Bugs**, especially seeds that break the generator. Include the seed string and what you saw.
- **New enemy types, weapons, and level features.** Read
  [documentation/tuning.md](documentation/tuning.md) — it lists exactly which constants and builders
  a new type touches.
- **Enemy navigation** ([roadmap #17](ENHANCEMENTS.md)) — the biggest known gameplay weakness.
- **Accessibility**: colour-blind-safe cues, reduced motion, remapping. Tier 0 of the roadmap.

## What will be turned down

- A build step (bundler, transpiler, task runner).
- Any external art, model or audio file. Textures are canvas code, enemies are boxes, sounds are
  oscillators. That constraint is the project.
- Ads, analytics, accounts, or anything that phones home.

## Style

- ES modules, no dependencies beyond the vendored Three.js.
- 2-space indent, semicolons, single quotes, ~110 column lines.
- Comments explain *why*, not what. A comment that restates the line is deleted.
- Keep `play/src/level.js` free of Three.js imports — that is what makes it testable in Node.

## Commits

Conventional-ish and in the imperative: `feat: flow-field navigation`, `fix: hud label duplication`.
One logical change per commit; the message should make the diff optional.
