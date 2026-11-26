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
  // the spawn is not a cell code: you stand on it, so the cell stays open and the
  // marker is carried beside the grid
  { code: '@', name: 'SPAWN', color: '#e8dcc8' },
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
/** The ceiling a blank grid gets, and the height a floor starts at. */
const DEFAULT_CEIL = 3.4;

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
    // heights, per cell: the floor you stand on and the ceiling above it. A map
    // carries them run-length encoded, so a flat level is a handful of numbers.
    // Plain arrays, not Float32Array: 2.4 is not 2.4 in single precision, and a
    // format that must round-trip cannot lose the number on the way through.
    this.floors = new Array(this.w * this.h).fill(0);
    this.ceils = new Array(this.w * this.h).fill(DEFAULT_CEIL);
    this.spawn = null;         // where the player starts, or null for the first open cell
    // what ends the level. 'reach' is the default because a painted exit is the
    // one objective a grid already answers
    this.objective = { type: 'reach', time: 60, relics: 3 };
    this.heightMode = false;   // the brush paints heights instead of cells
    this.brushFloor = 0;
    this.brushCeil = DEFAULT_CEIL;
    this.undoStack = [];
    this.redoStack = [];
    this.stroke = false;
  }

  /** Remember the grid before a change, once per stroke. */
  snapshot() {
    this.undoStack.push({
      w: this.w, h: this.h, grid: this.grid.join(''),
      floors: Array.from(this.floors), ceils: Array.from(this.ceils),
      spawn: this.spawn ? { ...this.spawn } : null,
    });
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
    this.redoStack.push({
      w: this.w, h: this.h, grid: this.grid.join(''),
      floors: Array.from(this.floors), ceils: Array.from(this.ceils),
      spawn: this.spawn ? { ...this.spawn } : null,
    });
    this.w = prev.w;
    this.h = prev.h;
    this.grid = prev.grid.split('');
    if (prev.floors) { this.floors = prev.floors.slice(); this.ceils = prev.ceils.slice(); }
    this.spawn = prev.spawn ? { ...prev.spawn } : null;
    this.render();
    return true;
  }

  /** Redo one stroke. */
  redo() {
    const next = this.redoStack.pop();
    if (!next) return false;
    this.undoStack.push({
      w: this.w, h: this.h, grid: this.grid.join(''),
      floors: Array.from(this.floors), ceils: Array.from(this.ceils),
      spawn: this.spawn ? { ...this.spawn } : null,
    });
    this.w = next.w;
    this.h = next.h;
    this.grid = next.grid.split('');
    if (next.floors) { this.floors = next.floors.slice(); this.ceils = next.ceils.slice(); }
    this.spawn = next.spawn ? { ...next.spawn } : null;
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
    const floors = [];
    const ceils = [];
    for (let z = 0; z < h; z++) {
      for (let x = 0; x < w; x++) {
        // the edge of the new grid is rock, whatever was there
        const edge = x === 0 || z === 0 || x === w - 1 || z === h - 1;
        next.push(edge ? '#' : (this.at(x, z) || '.'));
        floors.push(this.floorAt(x, z));
        ceils.push(this.ceilAt(x, z));
      }
    }
    this.w = w;
    this.h = h;
    this.grid = next;
    this.floors = floors;
    this.ceils = ceils;
    this.render();
    return true;
  }

  /** Start from a map or a blank grid. */
  load(map) {
    if (map && map.grid && map.w && map.h) {
      this.w = map.w;
      this.h = map.h;
      this.grid = map.grid.split('');
      this.floors = new Array(this.w * this.h).fill(0);
      this.ceils = new Array(this.w * this.h).fill(DEFAULT_CEIL);
      // the spawn comes back as a cell, because that is how a map carries it
      this.spawn = map.spawn ? { x: Math.round(map.spawn.x / 2), z: Math.round(map.spawn.z / 2) } : null;
      this.objective = map.objective && map.objective.type
        ? { type: map.objective.type, time: map.objective.time || 60, relics: map.objective.relics || 3 }
        : { type: 'reach', time: 60, relics: 3 };
      let i = 0;
      for (const run of map.heights || []) {
        const [n, floor, ceil] = run;
        for (let k = 0; k < n && i < this.floors.length; k++, i++) {
          this.floors[i] = floor;
          this.ceils[i] = ceil;
        }
      }
    } else {
      const b = blankGrid(this.w, this.h);
      this.grid = b.grid;
      this.floors = new Array(this.w * this.h).fill(0);
      this.ceils = new Array(this.w * this.h).fill(DEFAULT_CEIL);
    }
    this.render();
    return this;
  }

  /** The floor height of a cell. */
  floorAt(cx, cz) {
    if (cx < 0 || cz < 0 || cx >= this.w || cz >= this.h) return 0;
    return this.floors[cz * this.w + cx] || 0;
  }

  /** The ceiling height of a cell. */
  ceilAt(cx, cz) {
    if (cx < 0 || cz < 0 || cx >= this.w || cz >= this.h) return DEFAULT_CEIL;
    return this.ceils[cz * this.w + cx] || DEFAULT_CEIL;
  }

  /**
   * Set the heights of one cell.
   * @returns {boolean} True when something changed.
   */
  paintHeight(cx, cz, floor = this.brushFloor, ceil = this.brushCeil) {
    if (cx < 0 || cz < 0 || cx >= this.w || cz >= this.h) return false;
    const i = cz * this.w + cx;
    // a ceiling has to be above its floor, or the cell is a wall you can walk in
    // rounded to a centimetre: 2.4 + 1.2 is 3.5999999999999996, and a height
    // that reads as 3.6 everywhere except in the file is a bug waiting
    const c = Math.round(Math.max(ceil, floor + 1.2) * 100) / 100;
    if (this.floors[i] === floor && this.ceils[i] === c) return false;
    if (!this.stroke) this.snapshot();
    this.floors[i] = floor;
    this.ceils[i] = c;
    if (this.onPaint) this.onPaint(cx, cz, floor);
    return true;
  }

  /** Paint heights from a pointer position. */
  paintHeightAt(px, py) {
    return this.paintHeight(Math.floor(px / this.cell), Math.floor(py / this.cell));
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
    // the spawn is one cell, and it has to be a cell you can stand in
    if (code === '@') {
      if (!this.stroke) this.snapshot();
      this.spawn = { x: cx, z: cz };
      const j = cz * this.w + cx;
      if (this.grid[j] === '#') this.grid[j] = '.';
      if (this.onPaint) this.onPaint(cx, cz, code);
      return true;
    }
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

  /** The spawn: the one you placed, or the first open cell, top left. */
  spawnCell() {
    if (this.spawn && this.at(this.spawn.x, this.spawn.z) !== '#') return this.spawn;
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
      heights: this.heightRuns(),
      spawn: { x: spawn.x * 2, z: spawn.z * 2 },
      objective: { ...this.objective },
      exit: { x: exit.x * 2, z: exit.z * 2 },
      rooms: [[1, 1, this.w - 2, this.h - 2, this.w >> 1, this.h >> 1, 3.4]],
      spawnRoom: 0,
      exitRoom: 0,
    };
  }

  /** The heights, run-length encoded the way a map carries them. */
  heightRuns() {
    const runs = [];
    let prev = null;
    for (let i = 0; i < this.floors.length; i++) {
      const floor = this.floors[i] || 0;
      const ceil = this.ceils[i] || DEFAULT_CEIL;
      if (prev && prev[1] === floor && prev[2] === ceil) prev[0]++;
      else {
        prev = [1, floor, ceil];
        runs.push(prev);
      }
    }
    return runs;
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
        const code = this.grid[z * this.w + x];
        g.fillStyle = color[code] || '#3a1020';
        g.fillRect(x * S, z * S, S - 1, S - 1);
        // a raised floor is brighter: a balcony you cannot see is a balcony you
        // will not build
        if (this.spawn && this.spawn.x === x && this.spawn.z === z) {
          g.fillStyle = '#e8dcc8';
          g.beginPath();
          g.arc(x * S + S / 2, z * S + S / 2, Math.max(2, S * 0.26), 0, Math.PI * 2);
          g.fill();
        }
        const f = this.floorAt(x, z);
        if (f > 0.01) {
          g.fillStyle = 'rgba(255,180,84,' + Math.min(0.5, 0.12 * f) + ')';
          g.fillRect(x * S, z * S, S - 1, S - 1);
        }
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
