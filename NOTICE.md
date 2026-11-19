# Notice

HELLGATE bundles third-party software. This file records what, under what terms, and where it sits.

## Three.js

| | |
| --- | --- |
| Project | Three.js — <https://threejs.org> |
| Version | r187 |
| Files | `play/vendor/three.module.js`, `play/vendor/three.core.js` |
| Licence | MIT |
| Copyright | Copyright © 2010-2026 Three.js Authors |

The MIT licence text, reproduced as the licence requires:

```
Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
```

The files carry their own SPDX header; this file ships the full permission text that the header alone
does not.

## Everything else

Every texture, sound, model and line of level geometry in this repository is generated at runtime by
the code in `play/src`. There are no image files, audio files or model files to attribute. The
screenshots in `assets/` are captures of this game.

The fonts are the system monospace and sans stacks; no webfont is bundled.

Checked 19 Nov 2026 against commit `07fb599`.
