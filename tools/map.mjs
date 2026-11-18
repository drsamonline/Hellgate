// Renders a real generated level to SVG (docs asset). Uses the same generator
// the game uses, so the picture is always truthful.
//
//   node tools/map.mjs hellgate > assets/map.svg

import { generateLevel, CELL } from '../play/src/level.js';

const seed = process.argv[2] || 'hellgate';
const L = generateLevel(seed);

const PAD = 8;
const S = 11; // px per cell
const W = L.W * S + PAD * 2;
const H = L.H * S + PAD * 2;

const col = (c) => {
  if (c.solid) return '#141118';
  if (c.exit) return '#39ff9a';
  if (c.door) return '#ffd24a';
  if (c.floor > 0) return '#4a3a2a';
  if (c.room >= 0) return c.room % 2 ? '#2a2620' : '#332d25';
  return '#241f1a';
};

// One path per colour, built from horizontal runs. 1600 <rect> elements cost the
// browser real parse and paint time; eight paths cost almost nothing.
const runs = new Map();
for (let z = 0; z < L.H; z++) {
  let x = 0;
  while (x < L.W) {
    const c = col(L.cells[z * L.W + x]);
    let w = 1;
    while (x + w < L.W && col(L.cells[z * L.W + x + w]) === c) w++;
    if (!runs.has(c)) runs.set(c, []);
    runs.get(c).push(`M${PAD + x * S},${PAD + z * S}h${w * S}v${S}h-${w * S}z`);
    x += w;
  }
}
let rects = '';
for (const [fill, segs] of runs) {
  rects += `<path fill="${fill}" d="${segs.join('')}"/>\n`;
}

// room outlines
let outlines = '';
for (const r of L.rooms) {
  outlines += `<rect x="${PAD + r.x * S + 0.5}" y="${PAD + r.z * S + 0.5}" width="${r.w * S - 1}" height="${r.h * S - 1}" fill="none" stroke="#5c4a34" stroke-width="1"/>`;
}

const sx = PAD + (L.spawn.x / CELL) * S;
const sz = PAD + (L.spawn.z / CELL) * S;
const ex = PAD + (L.exit.x / CELL) * S;
const ez = PAD + (L.exit.z / CELL) * S;

process.stdout.write(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="ui-monospace,monospace">
<rect width="${W}" height="${H}" fill="#0a0a0c"/>
${rects}
${outlines}
<circle cx="${sx + S / 2}" cy="${sz + S / 2}" r="5" fill="#3fa9ff" stroke="#0a0a0c" stroke-width="1.5"/>
<circle cx="${ex + S / 2}" cy="${ez + S / 2}" r="5.5" fill="#39ff9a" stroke="#0a0a0c" stroke-width="1.5"/>
<text x="${PAD + 4}" y="${H - 3}" font-size="9" fill="#6f6455">seed "${seed}" · ${L.rooms.length} rooms · ${L.doors.length} doors</text>
</svg>
`);
