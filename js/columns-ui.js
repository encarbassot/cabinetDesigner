'use strict';

let pinnedTotal = false;
const pinnedCols = new Set();

function togglePinTotal() {
  pinnedTotal = !pinnedTotal;
  updateColumnsUI();
}

function togglePinCol(i) {
  if (pinnedCols.has(i)) pinnedCols.delete(i); else pinnedCols.add(i);
  updateColumnsUI();
}

function getFlexCols(exclude) {
  return furniture.columnWidths.map((_, i) => i).filter(i => i !== exclude && !pinnedCols.has(i));
}

function redistributeAmong(flexIndices, delta) {
  const f = furniture;
  if (!flexIndices.length || delta === 0) return;
  const flexTotal = flexIndices.reduce((s, i) => s + f.columnWidths[i], 0);
  let remaining = delta;
  flexIndices.forEach((i, idx) => {
    const isLast = idx === flexIndices.length - 1;
    const share  = isLast ? remaining : Math.round(delta * f.columnWidths[i] / flexTotal);
    const newW   = Math.max(5, f.columnWidths[i] + share);
    remaining   -= (newW - f.columnWidths[i]);
    f.columnWidths[i] = newW;
  });
}

function openColsModal() {
  document.getElementById('cols-modal-backdrop').style.display = 'flex';
}

function closeColsModal() {
  document.getElementById('cols-modal-backdrop').style.display = 'none';
}

function updateColumnsUI() {
  const f  = furniture;
  const el = document.getElementById('columns-list');
  el.innerHTML = '';
  document.getElementById('col-count').textContent = '(' + numBays(f) + ')';

  const ptb = document.getElementById('pin-total-btn');
  if (ptb) ptb.classList.toggle('pinned', pinnedTotal);

  const gwEl = document.getElementById('in-global-width');
  if (gwEl && document.activeElement !== gwEl)
    gwEl.value = Math.round(usableWidth(f));

  f.columnWidths.forEach((w, i) => {
    const isPinned  = pinnedCols.has(i);
    const row = document.createElement('div');
    row.className    = 'col-row' + (i === selectedBay ? ' active' : '');
    row.dataset.bay  = i;
    const canDelete  = numBays(f) > 1;
    row.innerHTML =
      '<span class="row-badge">C' + i + '</span>' +
      '<input type="number" class="in-sm" value="' + w + '" min="5" max="500"' +
        ' onchange="updateColumnWidthUI(' + i + ', +this.value)">' +
      '<span class="unit-lbl">cm</span>' +
      '<button class="pin-btn' + (isPinned ? ' pinned' : '') + '" onclick="togglePinCol(' + i + ')" title="Fijar columna">⊙</button>' +
      (canDelete ? '<button class="btn btn-danger btn-xs" onclick="removeColumnAt(' + i + ')">×</button>' : '');
    el.appendChild(row);
  });
}

function applyDimensions() {
  if (!lockedDimensions.height)
    furniture.height    = Math.max(30,  parseFloat(document.getElementById('cfg-height').value) || 200);
  if (!lockedDimensions.depth)
    furniture.depth     = Math.max(5,   parseFloat(document.getElementById('cfg-depth').value)  || 32);
  furniture.thickness   = Math.max(0.3, parseFloat(document.getElementById('cfg-thick').value)  || 1.8);
  buildFurniture();
}

function addColumnUI() {
  const f = furniture;
  const newW = 40;
  if (pinnedTotal) {
    const flex = getFlexCols(-1);
    if (!flex.length) { addColumn(f, newW, []); }
    else { redistributeAmong(flex, -newW); addColumn(f, newW, []); }
  } else {
    addColumn(f, newW, []);
  }
  selectedBay = numBays(f) - 1;
  buildFurniture();
}

function addColumnLeftUI() {
  const f = furniture;
  const newW = 40;
  if (pinnedTotal) {
    const flex = getFlexCols(-1);
    if (flex.length) redistributeAmong(flex, -newW);
  }
  f.columnWidths.unshift(newW);
  f.columnSlabs.unshift([]);
  slabLinks = slabLinks.map(lk => ({ ...lk, bayA: lk.bayA + 1, bayB: lk.bayB + 1 }));
  selectedBay = 0;
  buildFurniture();
}

function removeColumnAt(i) {
  if (numBays(furniture) <= 1) return;
  slabLinks = slabLinks
    .filter(lk => lk.bayA !== i && lk.bayB !== i)
    .map(lk => {
      const r = { ...lk };
      if (lk.bayA > i) r.bayA--;
      if (lk.bayB > i) r.bayB--;
      return r;
    });
  const freedW = furniture.columnWidths[i];
  furniture.columnWidths.splice(i, 1);
  furniture.columnSlabs.splice(i, 1);
  const newPinned = new Set();
  for (const p of pinnedCols) {
    if (p < i) newPinned.add(p);
    else if (p > i) newPinned.add(p - 1);
  }
  pinnedCols.clear(); newPinned.forEach(p => pinnedCols.add(p));
  if (pinnedTotal) {
    const flex = getFlexCols(-1);
    if (flex.length) redistributeAmong(flex, freedW);
  }
  selectedBay = Math.min(selectedBay, numBays(furniture) - 1);
  buildFurniture();
}

function updateColumnWidthUI(bay, w) {
  const f = furniture;
  w = Math.max(5, w);
  if (pinnedTotal && !pinnedCols.has(bay)) {
    const delta = w - f.columnWidths[bay];
    const flex  = getFlexCols(bay);
    if (flex.length) redistributeAmong(flex, -delta);
  }
  updateColumnWidth(f, bay, w);
  selectedBay = bay;
  buildFurniture();
}

function applyGlobalWidth(newUsable, skipBuild = false) {
  const f = furniture;
  if (!newUsable || newUsable < 1) return;
  const pinnedW = [...pinnedCols].reduce((s, i) => s + f.columnWidths[i], 0);
  const flexIdx = f.columnWidths.map((_, i) => i).filter(i => !pinnedCols.has(i));
  if (!flexIdx.length) return;
  const targetFlex = newUsable - pinnedW;
  if (targetFlex < flexIdx.length * 5) return;
  const currentFlex = flexIdx.reduce((s, i) => s + f.columnWidths[i], 0);
  if (currentFlex <= 0) return;
  const ratio = targetFlex / currentFlex;
  flexIdx.forEach(i => { f.columnWidths[i] = Math.max(5, Math.round(f.columnWidths[i] * ratio)); });
  const driftTarget = targetFlex - flexIdx.reduce((s, i) => s + f.columnWidths[i], 0);
  const lastFlex = flexIdx[flexIdx.length - 1];
  f.columnWidths[lastFlex] = Math.max(5, f.columnWidths[lastFlex] + driftTarget);
  if (!skipBuild) buildFurniture();
}

function insertSlabAbove(bay, slabIdx) {
  const f        = furniture;
  const yCentres = slabYCentres(f, bay);
  const cursor_s    = yCentres[slabIdx]     - f.thickness / 2;
  const cursor_next = yCentres[slabIdx + 1] - f.thickness / 2;
  const new_cursor  = cursor_s + f.thickness + 20;
  if (new_cursor + f.thickness >= cursor_next - 1) return;
  const new_rel = Math.round(new_cursor - cursor_s);
  const insertAt = slabIdx;
  if (insertAt < f.columnSlabs[bay].length) {
    const adj = Math.max(1, Math.round(cursor_next - new_cursor));
    f.columnSlabs[bay].splice(insertAt, 0, new_rel);
    f.columnSlabs[bay][insertAt + 1] = adj;
    slabLinks = slabLinks.map(lk => {
      const r = { ...lk };
      if (lk.bayA === bay && lk.relIdxA >= insertAt) r.relIdxA++;
      if (lk.bayB === bay && lk.relIdxB >= insertAt) r.relIdxB++;
      return r;
    });
  } else {
    f.columnSlabs[bay].push(new_rel);
  }
  selectedBay = bay;
  buildFurniture();
}

document.getElementById('cols-modal-backdrop').addEventListener('click', e => {
  if (e.target === e.currentTarget) closeColsModal();
});
