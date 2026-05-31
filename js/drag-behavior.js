'use strict';

// Shared drag logic for shelves (slabs) and column dividers (walls).
// Pure functions on the furniture data model — no rendering concerns.
// Both 2D and 3D renderers call these; only coordinate conversion differs.

const MID_SNAP_THRESH = 12;  // cm — proximity to midpoint triggers midpoint snap

// ── Slab drag ────────────────────────────────────────────────────────────────

function slabDragStart(f, bayIdx, relIdx) {
  const rels = f.columnSlabs[bayIdx];
  let absY = 0;
  for (let i = 0; i <= relIdx; i++) absY += rels[i];

  const lb      = (absY - rels[relIdx]) + f.thickness;
  const nextRel = relIdx + 1 < rels.length ? rels[relIdx + 1] : null;
  const ub      = nextRel !== null
    ? absY + nextRel - Math.max(f.thickness, 1)
    : f.height - f.thickness * 2;

  const chain = getLinkedChain(bayIdx, relIdx);
  const linkedDrags = [];
  let effLb = lb, effUb = ub;
  for (const cp of chain) {
    const pRels = f.columnSlabs[cp.bay];
    const pAbsY = getSlabAbsY(f, cp.bay, cp.relIdx);
    const pLb   = (pAbsY - pRels[cp.relIdx]) + f.thickness;
    const pNR   = cp.relIdx + 1 < pRels.length ? pRels[cp.relIdx + 1] : null;
    const pUb   = pNR !== null ? pAbsY + pNR - Math.max(f.thickness, 1) : f.height - f.thickness * 2;
    effLb = Math.max(effLb, pLb);
    effUb = Math.min(effUb, pUb);
    linkedDrags.push({ bay: cp.bay, relIdx: cp.relIdx, startAbsY: pAbsY,
      startRel: pRels[cp.relIdx], nextRel: pNR });
  }

  return { bayIdx, relIdx, startAbsY: absY, startRel: rels[relIdx], nextRel,
    lb: effLb, ub: effUb, linkedDrags, snapTarget: null };
}

function computeSlabSnap(f, state, newAbsY) {
  const lowerY = state.lb;
  const upperY = state.ub;

  const midY = (lowerY + upperY) / 2;
  if (Math.abs(newAbsY - midY) <= MID_SNAP_THRESH) {
    return { type: 'midpoint', absY: midY, lowerY, upperY };
  }
  return null;
}

// Applies clamped absY to the furniture model and sets state.snapTarget.
// Returns the final Y after snapping.
function slabDragApply(f, state, newAbsY) {
  state.snapTarget = computeSlabSnap(f, state, newAbsY);
  const snapY = state.snapTarget ? state.snapTarget.absY : newAbsY;

  const newRel = Math.max(1, Math.round(snapY - (state.startAbsY - state.startRel)));
  f.columnSlabs[state.bayIdx][state.relIdx] = newRel;
  if (state.nextRel !== null)
    f.columnSlabs[state.bayIdx][state.relIdx + 1] =
      Math.max(1, state.nextRel - (newRel - state.startRel));

  for (const ld of state.linkedDrags) {
    const pNewRel = Math.max(1, Math.round(snapY - (ld.startAbsY - ld.startRel)));
    f.columnSlabs[ld.bay][ld.relIdx] = pNewRel;
    if (ld.nextRel !== null)
      f.columnSlabs[ld.bay][ld.relIdx + 1] =
        Math.max(1, ld.nextRel - (pNewRel - ld.startRel));
  }

  return snapY;
}

// ── Wall drag ────────────────────────────────────────────────────────────────

function wallDragStart(f, wallIdx) {
  const nb    = numBays(f);
  const walls = wallXPositions(f);

  if (wallIdx === 0) {
    return { wallIdx, outerSide: 'left', startRightW: f.columnWidths[0], lb: 5,
      snapTarget: null };
  }
  if (wallIdx === numWalls(f) - 1) {
    return { wallIdx, outerSide: 'right', startLeftW: f.columnWidths[nb - 1], lb: 5,
      snapTarget: null };
  }

  const totalSpan   = f.columnWidths[wallIdx - 1] + f.columnWidths[wallIdx];
  // Inner edges of the two fixed bounding walls — used as snap ball positions
  const leftBoundX  = walls[wallIdx - 1] + f.thickness / 2;
  const rightBoundX = walls[wallIdx + 1] - f.thickness / 2;
  return { wallIdx, startLeftW: f.columnWidths[wallIdx - 1],
    startRightW: f.columnWidths[wallIdx], lb: 5, ub: totalSpan - 5,
    totalSpan, leftBoundX, rightBoundX, snapTarget: null };
}

function computeWallSnap(state, deltaCm) {
  if (state.outerSide) return null;  // no snap for outer walls
  const midDelta = state.totalSpan / 2 - state.startLeftW;
  if (Math.abs(deltaCm - midDelta) <= SNAP_THRESH) {
    return { type: 'midpoint', deltaCm: midDelta,
      lowerX: state.leftBoundX, upperX: state.rightBoundX };
  }
  return null;
}

// Applies deltaCm to the furniture model and sets state.snapTarget.
function wallDragApply(f, state, deltaCm) {
  state.snapTarget = computeWallSnap(state, deltaCm);
  if (state.outerSide === 'right') {
    f.columnWidths[numBays(f) - 1] = Math.max(state.lb, Math.round(state.startLeftW + deltaCm));
  } else if (state.outerSide === 'left') {
    f.columnWidths[0] = Math.max(state.lb, Math.round(state.startRightW - deltaCm));
  } else {
    const snapDelta = state.snapTarget ? state.snapTarget.deltaCm : deltaCm;
    const newLeftW  = clamp(Math.round(state.startLeftW + snapDelta), state.lb, state.ub);
    f.columnWidths[state.wallIdx - 1] = newLeftW;
    f.columnWidths[state.wallIdx]     =
      Math.max(state.lb, state.startRightW - (newLeftW - state.startLeftW));
  }
}
