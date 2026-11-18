#!/usr/bin/env python3
"""tools/optimise_assets.py — PNG screenshots in, WebP out.

The screenshots are 1280x720 dark game frames; as PNG they are ~450 KB each and
the landing page ships four of them. WebP at q=82 is visually identical here and
about a sixth of the size.

    python3 tools/optimise_assets.py

Reads assets/*.png, writes assets/*.webp next to them. Nothing is deleted: the
caller decides whether the PNGs go, so a bad conversion cannot lose the source.
Requires Pillow.
"""
import os
import sys

try:
    from PIL import Image
except ImportError:
    sys.exit("Pillow is required: pip install Pillow")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSETS = os.path.join(ROOT, "assets")
QUALITY = 82

total_in = total_out = 0
rows = []
for name in sorted(os.listdir(ASSETS)):
    if not name.endswith(".png"):
        continue
    src = os.path.join(ASSETS, name)
    dst = os.path.join(ASSETS, name[:-4] + ".webp")
    im = Image.open(src).convert("RGB")
    im.save(dst, "WEBP", quality=QUALITY, method=6)
    a, b = os.path.getsize(src), os.path.getsize(dst)
    total_in += a
    total_out += b
    rows.append((name, a, b, b / a))

for name, a, b, ratio in rows:
    print(f"{name:16} {a/1024:7.0f} KB -> {b/1024:7.0f} KB  ({ratio*100:.0f}%)")
if rows:
    print(f"{'total':16} {total_in/1024:7.0f} KB -> {total_out/1024:7.0f} KB  ({total_out/total_in*100:.0f}%)")
else:
    print("no PNGs found")
