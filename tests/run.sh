#!/usr/bin/env bash
# Headless test suite. Needs Node 18+. Copies the Three.js stub into
# node_modules/three (browser build uses the CDN import map instead).
set -e
cd "$(dirname "$0")/.."
mkdir -p node_modules
rm -rf node_modules/three
cp -r tests/stub-three node_modules/three
node tests/test-level.mjs
node tests/test-geometry.mjs
node tests/test-game.mjs
echo
echo "all suites passed"
