#!/usr/bin/env bash
# Finish the GitHub setup in one shot: description, topics, homepage, Pages.
# Run this after the empty repo exists and you have pushed main.
#
#   bash tools/publish.sh drsamonline/hellgate
set -euo pipefail

REPO="${1:-drsamonline/hellgate}"
OWNER="${REPO%%/*}"
NAME="${REPO##*/}"
PAGES_URL="https://${OWNER}.github.io/${NAME}/"

echo "→ description, homepage, topics"
gh repo edit "$REPO" \
  --description "A Doom-style 2.5D arena FPS in the browser — procedural sector maps, three weapons, zero external assets. Built with Three.js." \
  --homepage "$PAGES_URL" \
  --add-topic threejs --add-topic webgl --add-topic fps --add-topic doom \
  --add-topic javascript --add-topic browser-game --add-topic procedural-generation \
  --add-topic html5 --add-topic web-audio --add-topic shooter --add-topic game-development \
  --add-topic es-modules --add-topic canvas --add-topic threejs-game \
  --enable-issues --enable-wiki=false

echo "→ GitHub Pages from main / (root)"
if ! gh api "repos/$REPO/pages" >/dev/null 2>&1; then
  gh api -X POST "repos/$REPO/pages" -f "source[branch]=main" -f "source[path]=/" >/dev/null
else
  gh api -X PUT "repos/$REPO/pages" -f "source[branch]=main" -f "source[path]=/" >/dev/null
fi
gh api -X PUT "repos/$REPO/pages" -F https_enforced=true >/dev/null || true

echo "→ building"
for i in $(seq 1 30); do
  status=$(gh api "repos/$REPO/pages" --jq '.status' 2>/dev/null || echo pending)
  [ "$status" = "built" ] && break
  sleep 4
done

echo
echo "landing : $PAGES_URL"
echo "play    : ${PAGES_URL}play/"
echo "pages   : $(gh api "repos/$REPO/pages" --jq '.html_url' 2>/dev/null || echo 'check the Actions tab')"
