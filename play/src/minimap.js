// ---------------------------------------------------------------------------
// MINIMAP — the floor plan, drawn once, with live markers on top.
//
// The level is a grid, so the walls are prerendered into an offscreen canvas at
// build time and every frame is a blit plus a handful of dots. That keeps it
// cheap enough to run on a phone beside the game.
// ---------------------------------------------------------------------------

import { CELL } from './level.js';

/** A small map of the floor: walls, exit, keycard, enemies, and you. */
export class Minimap {
  constructor(canvas, level, size = 132) {
    this.canvas = canvas;
    this.level = level;
    this.size = size;
    this.dpr = Math.min(2, (typeof devicePixelRatio === 'number' ? devicePixelRatio : 1));
    canvas.width = size * this.dpr;
    canvas.height = size * this.dpr;
    this.ctx = canvas.getContext('2d');
    this.scale = size / (Math.max(level.W, level.H) * CELL);
    this.acc = 0;
    this.base = this.prerender();
  }

  // walls, doors and the exit pad, drawn once
  prerender() {
    const L = this.level;
    const c = document.createElement('canvas');
    c.width = this.canvas.width;
    c.height = this.canvas.height;
    const g = c.getContext('2d');
    const s = this.scale * this.dpr;
    const px = (wx) => (wx + CELL / 2) * s;
    const pz = (wz) => (wz + CELL / 2) * s;

    g.fillStyle = 'rgba(8,7,6,0.72)';
    g.fillRect(0, 0, c.width, c.height);

    for (const cell of L.cells) {
      // solid rock is the background; a secret wall is solid too, and drawing it
      // would give the room away
      if (cell.solid) continue;
      const x = px(cell.x * CELL);
      const z = pz(cell.z * CELL);
      if (cell.room >= 0) g.fillStyle = 'rgba(120,104,84,0.30)';
      else g.fillStyle = 'rgba(84,74,60,0.20)';
      g.fillRect(x - s / 2, z - s / 2, s + 0.5, s + 0.5);
    }

    // exit pad
    g.fillStyle = 'rgba(57,255,154,0.55)';
    g.fillRect(px(L.exit.x) - s, pz(L.exit.z) - s, s * 2, s * 2);
    return c;
  }

  /** Redraw the markers. Called at ~10 Hz, not per frame. */
  draw(player, enemies, exitOpen, keycard) {
    const g = this.ctx;
    const s = this.scale * this.dpr;
    const px = (wx) => (wx + CELL / 2) * s;
    const pz = (wz) => (wz + CELL / 2) * s;

    g.clearRect(0, 0, this.canvas.width, this.canvas.height);
    g.drawImage(this.base, 0, 0);

    // the waypoint: the keycard while it is missing, the exit once it is open
    const wp = exitOpen ? this.level.exit : keycard;
    if (wp) {
      g.strokeStyle = exitOpen ? '#39ff9a' : '#ffd24a';
      g.lineWidth = 1.5 * this.dpr;
      g.beginPath();
      g.arc(px(wp.x), pz(wp.z), 3.5 * this.dpr, 0, Math.PI * 2);
      g.stroke();
    }

    for (const e of enemies) {
      if (!e.alive) continue;
      g.fillStyle = e.T && e.T.boss ? '#ff3b30' : '#e0432f';
      const r = (e.T && e.T.boss ? 3 : 1.6) * this.dpr;
      g.beginPath();
      g.arc(px(e.pos.x), pz(e.pos.z), r, 0, Math.PI * 2);
      g.fill();
    }

    // the player: a triangle pointing where you are looking
    const x = px(player.pos.x);
    const z = pz(player.pos.z);
    const a = player.yaw;
    g.fillStyle = '#ffd9a8';
    g.beginPath();
    g.moveTo(x + Math.sin(-a) * 5 * this.dpr, z + Math.cos(-a) * 5 * this.dpr);
    g.lineTo(x + Math.sin(-a + 2.5) * 3.2 * this.dpr, z + Math.cos(-a + 2.5) * 3.2 * this.dpr);
    g.lineTo(x + Math.sin(-a - 2.5) * 3.2 * this.dpr, z + Math.cos(-a - 2.5) * 3.2 * this.dpr);
    g.closePath();
    g.fill();
  }
}
