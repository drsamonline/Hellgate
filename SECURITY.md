# Security Policy

## Supported versions

The `main` branch and the current release tag are supported. Older tags are not maintained and fixes
are not backported to them.

## Scope

HELLGATE is a static site: no server, no accounts, no network requests after the page loads, no
storage beyond `localStorage` for the best run and (from roadmap item 1) settings. That removes most
of the usual attack surface. What remains is worth reporting:

- cross-site scripting through the seed field, the URL parameters (`?seed=`, `?cam=`, `?wave=`), or
  the game-over stats rendered with `innerHTML`
- denial of service through a seed that makes the generator loop, allocate without bound, or produce
  a level that cannot be completed
- a vendored dependency (`play/vendor/`) that does not match the stated Three.js version
- pointer-lock or fullscreen behaviour that leaves the browser in a state the user cannot exit

## Reporting a vulnerability

**Do not open a public issue.**

Report privately to sohilmomin2000@gmail.com, or use GitHub's private security advisory on this
repository (*Security → Report a vulnerability*). A private advisory is preferred: it keeps the
report, the fix and the release in one place.

Please include:

- what the issue is, and which commit or version it affects
- the seed string or URL that reproduces it
- browser and OS
- the impact you believe it has
- any suggested fix

## What to expect

Acknowledgement within a few days. Fixes land on `main` and in a patch release, with credit in
`CHANGELOG.md` unless you ask to stay anonymous.

## Out of scope

- Anything requiring a modified local copy of the game.
- Bugs that only affect a browser no longer receiving security updates.
- The absence of anti-cheat: there is no scoreboard and no server, so a modified client cheats only
  against itself.
