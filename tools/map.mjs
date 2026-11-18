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

let rects = '';
for (let z = 0; z < L.H; z++) {
  for (let x = 0; x < L.W; x++) {
    const c = L.cells[z * L.W + x];
    rects += `<rect x="${PAD + x * S}" y="${PAD + z * S}" width="${S}" height="${S}" fill="${col(c)}"/>`;
  }
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
