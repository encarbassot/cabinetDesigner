'use strict';
/**
 * PlyKit — Furniture Data Model  (sketch.js)
 * All dimensions in centimetres (cm).
 * Three.js display scale: 1 unit = 10 cm  →  multiply by CM = 0.1
 *
 * Structure:
 *   N+1 full-height walls  |  N bays, each with per-bay horizontal slabs
 *
 *    wall  bay-0  wall  bay-1  wall  bay-2  wall
 *     |   ┌─────┐  |   ┌─────┐  |          |
 *     |   ├─────┤  |   │     │  |   ┌─────┐|
 *     |   ├─────┤  |   ├─────┤  |   ├─────┤|
 *     |   └─────┘  |   └─────┘  |   └─────┘|   ← bottom always implicit
 *
 *  columnSlabs:  relative heights from previous slab bottom (or unit bottom for first).
 *  Example: [30, 50]  →  slabs at y = 30 cm  and  y = 30+50 = 80 cm.
 *  Bottom slab (y=0) and top slab (y=height) are always implicit – not stored.
 */

const CM = 0.1; // cm → Three.js units (1 unit = 10 cm)

// ─── Default model ────────────────────────────────────────────────────────────

const furniture = {
  height:    200,   // cm — total unit height
  depth:      32,   // cm — depth (front to back)
  thickness:  1.8,  // cm — panel thickness, walls & slabs (18 mm plywood)

  // Width of each bay in cm.  N bays  →  N+1 walls.
  columnWidths: [40, 50, 40],

  // Per bay: cumulative relative slab heights (cm).
  // [] = only implicit bottom + top.
  columnSlabs: [
    [60, 60],   // bay 0: slabs at y=60, y=120
    [80],       // bay 1: slab  at y=80
    [40, 80],   // bay 2: slabs at y=40, y=120
  ],
};

// ─── Derived ──────────────────────────────────────────────────────────────────

/** Sum of all bay widths (cm) — excludes wall thicknesses. */
function usableWidth(f) {
  return f.columnWidths.reduce((s, w) => s + w, 0);
}

/** Full structural width including all wall panels (cm). */
function totalWidth(f) {
  return usableWidth(f) + (f.columnWidths.length + 1) * f.thickness;
}

/** Number of walls in the unit (= bays + 1). */
function numWalls(f) { return f.columnWidths.length + 1; }

/** Number of bays (column openings). */
function numBays(f)  { return f.columnWidths.length; }

/**
 * Centre X position (cm from left face = 0) of each wall.
 * Returns array of length numWalls.
 */
function wallXPositions(f) {
  const pos = [];
  let x = f.thickness / 2;
  pos.push(x);
  for (const w of f.columnWidths) {
    x += f.thickness / 2 + w + f.thickness / 2;
    pos.push(x);
  }
  return pos;
}

/**
 * Returns { xCentre, width } (cm) for each bay.
 */
function bayGeometry(f) {
  const walls = wallXPositions(f);
  return f.columnWidths.map((w, i) => ({
    xCentre: walls[i] + f.thickness / 2 + w / 2,
    width:   w,
  }));
}

/**
 * Centre Y positions (cm from unit bottom = 0) of ALL slabs in a bay,
 * including the always-implicit bottom and top slabs.
 * Sorted bottom → top.
 */
function slabYCentres(f, bayIdx) {
  const rels = f.columnSlabs[bayIdx] ?? [];
  const ys   = [f.thickness / 2];   // bottom slab centre
  let cursor  = 0;
  for (const rel of rels) {
    cursor += rel;
    // only add if slab fits within the unit
    if (cursor > 0 && cursor + f.thickness < f.height) {
      ys.push(cursor + f.thickness / 2);
    }
  }
  ys.push(f.height - f.thickness / 2); // top slab centre
  return ys;
}

// ─── Mutation helpers ─────────────────────────────────────────────────────────

function addColumn(f, width = 40, slabs = []) {
  f.columnWidths.push(width);
  f.columnSlabs.push([...slabs]);
}

function removeLastColumn(f) {
  if (numBays(f) > 1) { f.columnWidths.pop(); f.columnSlabs.pop(); }
}

function addSlab(f, bay, relDist) {
  if (bay >= 0 && bay < numBays(f)) f.columnSlabs[bay].push(relDist);
}

function removeSlab(f, bay, i) {
  if (bay >= 0 && bay < numBays(f)) f.columnSlabs[bay].splice(i, 1);
}

function updateColumnWidth(f, bay, w) {
  if (bay >= 0 && bay < numBays(f)) f.columnWidths[bay] = Math.max(1, w);
}

function updateSlab(f, bay, i, v) {
  if (bay >= 0 && bay < numBays(f) && i >= 0 && i < f.columnSlabs[bay].length)
    f.columnSlabs[bay][i] = Math.max(1, v);
}
