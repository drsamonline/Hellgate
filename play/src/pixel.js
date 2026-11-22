// ---------------------------------------------------------------------------
// PIXEL — quantise and dither a drawn texture into a deliberate palette.
//
// The textures are drawn with gradients, noise and grain, which is why they read
// as photographic mush at close range. A median-cut to a dozen colours plus a
// Bayer dither turns the same drawing into pixel art with a fixed palette: the
// bricks keep their variation, the noise becomes texture instead of fuzz, and
// every surface in a zone shares one palette.
//
// Ported from `art-kit` (PolyForm Noncommercial 1.0.0, same author): the
// median-cut, the Bayer matrix and the error diffusion are that kit's.
// ---------------------------------------------------------------------------

/** The classic 4x4 Bayer matrix, 0-15. */
export const BAYER4 = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];

/**
 * Median-cut to at most `n` colours.
 *
 * `pixels` is a flat Uint8ClampedArray of RGBA. Returns [{r,g,b}] — the box with
 * the widest channel range is split until there are `n` boxes, and each box
 * contributes its average colour.
 */
export function quantize(pixels, n) {
  const count = Math.max(1, n | 0);
  const pts = [];
  for (let i = 0; i < pixels.length; i += 4) pts.push({ r: pixels[i], g: pixels[i + 1], b: pixels[i + 2] });
  if (!pts.length) return [{ r: 0, g: 0, b: 0 }];

  const range = (box) => {
    let lo = [255, 255, 255];
    let hi = [0, 0, 0];
    for (const p of box) {
      const v = [p.r, p.g, p.b];
      for (let c = 0; c < 3; c++) {
        if (v[c] < lo[c]) lo[c] = v[c];
        if (v[c] > hi[c]) hi[c] = v[c];
      }
    }
    let ch = 0;
    let max = -1;
    for (let c = 0; c < 3; c++) {
      const d = hi[c] - lo[c];
      if (d > max) { max = d; ch = c; }
    }
    return { channel: ['r', 'g', 'b'][ch], max };
  };
  const average = (box) => {
    let r = 0; let g = 0; let b = 0;
    for (const p of box) { r += p.r; g += p.g; b += p.b; }
    return { r: Math.round(r / box.length), g: Math.round(g / box.length), b: Math.round(b / box.length) };
  };

  const boxes = [pts];
  while (boxes.length < count) {
    let bi = -1;
    let br = 0;
    boxes.forEach((b, i) => {
      if (b.length < 2) return;
      const r = range(b);
      if (r.max > br) { br = r.max; bi = i; }
    });
    if (bi < 0 || br <= 0) break;
    const box = boxes[bi];
    const ch = range(box).channel;
    box.sort((a, b) => a[ch] - b[ch]);
    const mid = box.length >> 1;
    boxes.splice(bi, 1, box.slice(0, mid), box.slice(mid));
  }
  return boxes.filter((b) => b.length).map(average);
}

/** The nearest palette entry to a colour, squared distance. */
function nearest(palette, r, g, b) {
  let best = palette[0];
  let bestD = Infinity;
  for (const p of palette) {
    const dr = r - p.r; const dg = g - p.g; const db = b - p.b;
    const d = dr * dr + dg * dg + db * db;
    if (d < bestD) { bestD = d; best = p; }
  }
  return best;
}

/**
 * Map an ImageData onto a palette with a Bayer dither.
 *
 * The dither threshold is added to each channel before the nearest-colour
 * lookup, so a gradient becomes two flat tones in a pattern rather than a band
 * of grey: that pattern is the whole point.
 */
export function ditherTo(imageData, palette, strength = 26) {
  const { data, width, height } = imageData;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const t = ((BAYER4[y & 3][x & 3] + 0.5) / 16 - 0.5) * strength;
      const p = nearest(palette, data[i] + t, data[i + 1] + t, data[i + 2] + t);
      data[i] = p.r; data[i + 1] = p.g; data[i + 2] = p.b;
    }
  }
  return imageData;
}

/**
 * Quantise and dither a 2D canvas in place.
 *
 * @param {CanvasRenderingContext2D} ctx  the context that was drawn into
 * @param {number} colours               palette size; 10-16 reads as pixel art
 * @param {number} strength              dither amount; 0 is a flat quantise
 */
export function pixelise(ctx, colours = 12, strength = 26) {
  const canvas = ctx.canvas;
  if (!canvas || !canvas.width || !canvas.height) return null;
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const palette = quantize(img.data, colours);
  ditherTo(img, palette, strength);
  ctx.putImageData(img, 0, 0);
  return palette;
}
