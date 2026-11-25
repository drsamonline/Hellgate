// ---------------------------------------------------------------------------
// EDITOR — paint the grid, play the grid.
//
// The generator has always made the levels; this is the first place a person can
// make one. It is deliberately small: a grid of cells, a palette, and two
// buttons. Everything it produces is a map in the format `maps.js` already
// reads, so an edited level and a generated one are the same kind of thing.
//
// The canvas draws the grid; the state is a flat array of codes, which is what
// `exportMap` writes and `importMap` reads.
// ---------------------------------------------------------------------------

/** The cells a person can paint, in the order the palette shows them. */
export const PALETTE = [
  { code: '.', name: 'OPEN', color: '#241a16' },
  { code: '#', name: 'ROCK', color: '#6b5a4a' },
  { code: '+', name: 'DOOR', color: '#ffb454' },
  { code: 'X', name: 'EXIT', color: '#39ff9a' },
  { code: '=', name: 'STAIR', color: '#4a3a2c' },
  { code: '^', name: 'LIFT', color: '#8fd0ff' },
  { code: '~', name: 'CRATE', color: '#a07a4a' },
  { code: 's', name: 'SECRET', color: '#8a7a66' },
];

/** A blank room: rock around the edge, open inside. */
export function blankGrid(w = 24, h = 24) {
  const grid = [];
  for (let z = 0; z < h; z++) {
    for (let x = 0; x < w; x++) {
      const edge = x === 0 || z === 0 || x === w - 1 || z === h - 1;
      grid.push(edge ? '#' : '.');
    }
  }
  return { w, h, grid };
}

/** How many states the undo stack keeps. */
const UNDO_MAX = 40;

/** The editor's state: a grid of codes, a palette choice, and a canvas. */
export class Editor {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {{ onPaint?: Function }} [opts]
   */
  constructor(canvas, opts = {}) {
    this.canvas = canvas || null;
    this.ctx = this.canvas && this.canvas.getContext ? this.canvas.getContext('2d') : null;
    this.onPaint = opts.onPaint || null;
    this.w = 24;
    this.h = 24;
    this.grid = blankGrid(24, 24).grid;
    this.brush = '.';
    this.cell = 16;
    // undo is a stack of whole grids: 24 x 24 is 576 characters, so forty of
    // them is 23 kB — cheaper than a diff, and impossible to get wrong
    this.undoStack = [];
    this.redoStack = [];
    this.stroke = false;
  }

  /** Remember the grid before a change, once per stroke. */
  snapshot() {
    this.undoStack.push({ w: this.w, h: this.h, grid: this.grid.join('') });
    if (this.undoStack.length > UNDO_MAX) this.undoStack.shift();
    this.redoStack.length = 0;
  }

  /** A stroke begins at pointer-down: one undo step per drag, not per cell. */
  beginStroke() {
    if (this.stroke) return;
    this.stroke = true;
    this.snapshot();
  }

  /** And ends at pointer-up. */
  endStroke() {
    this.stroke = false;
  }

  /** Undo one stroke. */
  undo() {
    const prev = this.undoStack.pop();
    if (!prev) return false;
    this.redoStack.push({ w: this.w, h: this.h, grid: this.grid.join('') });
    this.w = prev.w;
    this.h = prev.h;
    this.grid = prev.grid.split('');
    this.render();
    return true;
  }

  /** Redo one stroke. */
  redo() {
    const next = this.redoStack.pop();
    if (!next) return false;
    this.undoStack.push({ w: this.w, h: this.h, grid: this.grid.join('') });
    this.w = next.w;
    this.h = next.h;
    this.grid = next.grid.split('');
    this.render();
    return true;
  }

  /**
   * Resize the grid, keeping whatever fits.
   * @param {number} w
   * @param {number} h
   */
  resize(w, h) {
    if (!Number.isFinite(w) || !Number.isFinite(h) || w < 8 || h < 8 || w > 64 || h > 64) return false;
    this.snapshot();
    const next = [];
    for (let z = 0; z < h; z++) {
      for (let x = 0; x < w; x++) {
        // the edge of the new grid is rock, whatever was there
        const edge = x === 0 || z === 0 || x === w - 1 || z === h - 1;
        next.push(edge ? '#' : (this.at(x, z) || '.'));
      }
    }
    this.w = w;
    this.h = h;
    this.grid = next;
    this.render();
    return true;
  }

  /** Start from a map or a blank grid. */
  load(map) {
    if (map && map.grid && map.w && map.h) {
      this.w = map.w;
      this.h = map.h;
      this.grid = map.grid.split('');
    } else {
      const b = blankGrid(this.w, this.h);
      this.grid = b.grid;
    }
    this.render();
    return this;
  }

  /** Start from a generated level. */
  fromLevel(level) {
    const { exportMap } = this.maps || {};
    if (exportMap && level) return this.load(exportMap(level));
    return this;
  }

  /** The code at a cell, or null when it is off the grid. */
  at(cx, cz) {
    if (cx < 0 || cz < 0 || cx >= this.w || cz >= this.h) return null;
    return this.grid[cz * this.w + cx];
  }

  /**
   * Paint one cell.
   * @returns {boolean} True when something changed.
   */
  paint(cx, cz, code = this.brush) {
    if (cx < 0 || cz < 0 || cx >= this.w || cz >= this.h) return false;
    const i = cz * this.w + cx;
    if (this.grid[i] === code) return false;
    // a paint outside a stroke (a test, a keyboard nudge) is its own step
    if (!this.stroke) this.snapshot();
    this.grid[i] = code;
    if (this.onPaint) this.onPaint(cx, cz, code);
    return true;
  }

  /** Paint from a pointer position on the canvas. */
  paintAt(px, py, code = this.brush) {
    const cx = Math.floor(px / this.cell);
    const cz = Math.floor(py / this.cell);
    return this.paint(cx, cz, code);
  }

  /** The spawn: the first open cell, top left. */
  spawnCell() {
    for (let z = 0; z < this.h; z++) {
      for (let x = 0; x < this.w; x++) {
        const c = this.grid[z * this.w + x];
        if (c === '.' || c === 'X') return { x, z };
      }
    }
    return { x: 1, z: 1 };
  }

  /** The exit: the first painted one, or the far corner. */
  exitCell() {
    for (let z = 0; z < this.h; z++) {
      for (let x = 0; x < this.w; x++) if (this.grid[z * this.w + x] === 'X') return { x, z };
    }
    return { x: this.w - 2, z: this.h - 2 };
  }

  /**
   * The grid as a map, in the format `maps.js` reads.
   * @returns {object}
   */
  toMap() {
    const spawn = this.spawnCell();
    const exit = this.exitCell();
    return {
      v: 1,
      w: this.w,
      h: this.h,
      grid: this.grid.join(''),
      // one flat room: the editor paints cells, not heights
      heights: [[this.w * this.h, 0, 3.4]],
      spawn: { x: spawn.x * 2, z: spawn.z * 2 },
      exit: { x: exit.x * 2, z: exit.z * 2 },
      rooms: [[1, 1, this.w - 2, this.h - 2, this.w >> 1, this.h >> 1, 3.4]],
      spawnRoom: 0,
      exitRoom: 0,
    };
  }

  /** Draw the grid. */
  render() {
    const g = this.ctx;
    if (!g) return;
    const S = this.cell;
    this.canvas.width = this.w * S;
    this.canvas.height = this.h * S;
    g.fillStyle = '#07070a';
    g.fillRect(0, 0, this.canvas.width, this.canvas.height);
    const color = {};
    for (const p of PALETTE) color[p.code] = p.color;
    for (let z = 0; z < this.h; z++) {
      for (let x = 0; x < this.w; x++) {
        g.fillStyle = color[this.grid[z * this.w + x]] || '#3a1020';
        g.fillRect(x * S, z * S, S - 1, S - 1);
      }
    }
  }

  /** How many of each code the grid holds — the read-out under the canvas. */
  counts() {
    const out = {};
    for (const c of this.grid) out[c] = (out[c] || 0) + 1;
    return out;
  }
}
