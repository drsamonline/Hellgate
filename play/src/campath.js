// ---------------------------------------------------------------------------
// CAMERA PATH — a cutscene camera that walks the level instead of flying
// through it.
//
// The boss entrance orbited its subject on a fixed arc, which is why it could
// end up inside a wall. A camera has to move along walkable ground, and the game
// already knows how to compute that: `buildFlowField` is the same BFS the
// enemies use, so a camera built on it cannot cross a wall any more than they
// can. `floorHeightAt` gives the height at each waypoint, so the camera follows
// stairs and decks.
//
// No Three.js here, for the same reason `level.js` has none: the path is a list
// of numbers and it is testable in Node.
// ---------------------------------------------------------------------------

import { CELL, buildFlowField, flowStep, floorHeightAt } from './level.js?v=2.84.0';

/** Eye height above the floor, the same number the player's camera uses. */
export const CAM_EYE = 1.62;

/** How far a corner may be rounded off the cell centres. Cells are 2 m wide, so
 * half of one is the most that can be cut without leaving the corridor. */
export const CORNER = 0.7;

/** Path spacing in metres. Small enough that interpolating between two samples
 * cannot cut a step: a stair is 0.35 m a tread, this is a quarter of a cell. */
export const SAMPLE = 0.4;

/**
 * The cells to walk through, from one point to another, nearest-first.
 *
 * Returns the cell centres inclusive of both ends, or null when the destination
 * cannot be reached — a shut door, a wall, a crate in the way. Null is the
 * honest answer: the caller falls back rather than flying through geometry.
 * @param {object} level The level from `generateLevel`.
 * @param {{x:number,z:number}} from World coordinates to start at.
 * @param {{x:number,z:number}} to World coordinates to end at.
 * @returns {{x:number,z:number}[]|null} Waypoints, or null.
 */
export function cellPath(level, from, to) {
  if (!level || !from || !to) return null;
  const W = level.W;
  const H = level.H;
  const field = buildFlowField(level, to.x, to.z);

  let cx = Math.round(from.x / CELL);
  let cz = Math.round(from.z / CELL);
  if (cx < 0 || cz < 0 || cx >= W || cz >= H) return null;
  if (field[cz * W + cx] < 0) return null; // no path at all

  const out = [{ x: cx * CELL, z: cz * CELL }];
  // bounded by the grid: the field strictly decreases, so this cannot loop
  for (let guard = 0; guard < W * H; guard++) {
    const here = field[cz * W + cx];
    if (here <= 0) break;
    const step = flowStep(level, field, cx * CELL, cz * CELL);
    if (!step) break;
    cx += step.x;
    cz += step.z;
    out.push({ x: cx * CELL, z: cz * CELL });
  }
  // end on the real target, not on the cell centre it happens to share
  out[out.length - 1] = { x: to.x, z: to.z };
  return out;
}

/**
 * A walkable camera path: cell centres with the floor height at each, resampled
 * into a curve whose corners are rounded but never leave the corridor.
 * @param {object} level The level.
 * @param {{x:number,z:number}} from Where the camera starts.
 * @param {{x:number,z:number}} to Where it ends.
 * @param {object} [opts] `eye` (metres above the floor), `corner` (rounding cap).
 * @returns {{points:{x:number,y:number,z:number}[],length:number}|null} The path.
 */
export function buildCameraPath(level, from, to, opts = {}) {
  const cells = cellPath(level, from, to);
  if (!cells || cells.length < 2) return null;
  const eye = opts.eye != null ? opts.eye : CAM_EYE;
  const corner = opts.corner != null ? opts.corner : CORNER;

  // heights from the one source of truth, so a stair or a deck is followed
  const raw = cells.map((c) => ({ x: c.x, y: floorHeightAt(level, c.x, c.z) + eye, z: c.z }));
  // rounding a corner moves the point horizontally, and over a step that leaves
  // it up to half a metre off the floor it is now above. Re-project each rounded
  // point onto its own floor: a camera inside a stair is worse than a camera
  // that rises 10 cm as it turns.
  const rounded = roundCorners(raw, corner);
  // and resampled at a fixed spacing, each sample on its own floor: interpolating
  // between two points either side of a step cuts through the step, which is a
  // camera 40 cm inside a stair for a frame
  const points = [];
  for (let i = 0; i < rounded.length; i++) {
    const p = rounded[i];
    if (!i) {
      points.push({ x: p.x, y: floorHeightAt(level, p.x, p.z) + eye, z: p.z });
      continue;
    }
    const q = rounded[i - 1];
    const seg = Math.hypot(p.x - q.x, p.z - q.z);
    const n = Math.max(1, Math.ceil(seg / SAMPLE));
    for (let k = 1; k <= n; k++) {
      const t = k / n;
      const x = q.x + (p.x - q.x) * t;
      const z = q.z + (p.z - q.z) * t;
      points.push({ x, y: floorHeightAt(level, x, z) + eye, z });
    }
  }
  let length = 0;
  for (let i = 1; i < points.length; i++) length += dist3(points[i - 1], points[i]);
  // the level is kept so sampling can keep the camera out of the floor: a cell
  // can carry two sectors, and a path that crosses a deck edge interpolates
  // through the deck itself
  return { points, length, eye, level };
}

/**
 * The point at a given distance along a path, clamped to its ends.
 * @param {{points:object[],length:number}} path From `buildCameraPath`.
 * @param {number} d Distance in metres from the start.
 * @returns {{x:number,y:number,z:number}} The position.
 */
export function sampleCameraPath(path, d) {
  const pts = path.points;
  if (pts.length === 1 || d <= 0) return lift(path, { ...pts[0] });
  let left = Math.max(0, d);
  for (let i = 1; i < pts.length; i++) {
    const seg = dist3(pts[i - 1], pts[i]);
    if (left <= seg || i === pts.length - 1) {
      const k = seg > 0 ? Math.min(1, left / seg) : 0;
      return lift(path, {
        x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * k,
        y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * k,
        z: pts[i - 1].z + (pts[i].z - pts[i - 1].z) * k,
      });
    }
    left -= seg;
  }
  return lift(path, { ...pts[pts.length - 1] });
}

// Never inside the floor. Interpolating between two samples either side of a
// step, a deck edge or a lift cuts through it; a camera 15 cm above a raised
// floor is a camera in a wall. The clamp costs a small hop and nothing else.
const MIN_CLEAR = 1.1;
function lift(path, p) {
  if (!path.level) return p;
  const f = floorHeightAt(path.level, p.x, p.z);
  if (p.y < f + MIN_CLEAR) p.y = f + MIN_CLEAR;
  return p;
}

// A Catmull-Rom through the waypoints, cut at each corner to a maximum offset
// from the straight line. A plain spline through cell centres bows out of the
// corridor on a tight turn; clamping keeps the camera inside the cells it was
// told to walk through, which is the whole point of building the path this way.
function roundCorners(pts, maxOffset) {
  if (pts.length < 3) return pts;
  const out = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) {
    const p0 = pts[i - 1];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] || p2;
    const n = 6;
    for (let s = 1; s <= n; s++) {
      const t = s / (n + 1);
      const p = catmull(p0, p1, p2, p3, t);
      // the straight line from p1 to p2, and how far p has strayed from it
      const seg = Math.hypot(p2.x - p1.x, p2.z - p1.z) || 1;
      const ux = (p2.x - p1.x) / seg;
      const uz = (p2.z - p1.z) / seg;
      const rx = p.x - p1.x;
      const rz = p.z - p1.z;
      const along = Math.max(0, Math.min(seg, rx * ux + rz * uz));
      const offX = rx - ux * along;
      const offZ = rz - uz * along;
      const off = Math.hypot(offX, offZ);
      const k = off > maxOffset ? maxOffset / off : 1;
      out.push({ x: p1.x + ux * along + offX * k, y: p.y, z: p1.z + uz * along + offZ * k });
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}

function catmull(p0, p1, p2, p3, t) {
  const t2 = t * t;
  const t3 = t2 * t;
  const f = (a, b, c, d) =>
    0.5 * ((2 * b) + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
  return { x: f(p0.x, p1.x, p2.x, p3.x), y: f(p0.y, p1.y, p2.y, p3.y), z: f(p0.z, p1.z, p2.z, p3.z) };
}

function dist3(a, b) {
  return Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
}
