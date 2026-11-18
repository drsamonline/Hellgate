## What this changes

<!-- One paragraph. What was wrong or missing, and what the change does. -->

## Why

<!-- The reason, not the mechanics. Link the issue or roadmap item if there is one. -->

## Checks

- [ ] `bash tests/run.sh` passes
- [ ] `node tools/check-claims.js` passes (run it if you touched a number in the README)
- [ ] `node tools/smoke.mjs` passes (run it if you touched the pages or the renderer)
- [ ] No new dependency beyond the vendored Three.js
- [ ] `play/src/level.js` still imports nothing from Three.js

## Notes for the reviewer

<!-- Anything subtle: a shader change, a tuning number, a test that now covers less. -->
