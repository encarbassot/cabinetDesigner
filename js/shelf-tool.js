'use strict';

let shelfToolActive     = false;
let ghostShelves        = [];
let ghostBayIdx         = -1;
let ghostYCm            = -1;
let ghostSubdivision    = null;
let shelfDragging       = false;
let shelfDragStartBay   = -1;
let shelfDragEndBay     = -1;
let shelfDragY          = -1;

let hoverExistingSlab   = null;
let hoverExistingChain  = [];
let extendDragActive    = false;
let extendDragSrcBay    = -1;
let extendDragSrcRelIdx = -1;
let extendDragSrcY      = -1;
let extendDragEndBay    = -1;

const GHOST_REF_W = 40;

function _makeGhostMesh() {
  const f   = furniture;
  const geo = new THREE.BoxGeometry(GHOST_REF_W * CM, f.thickness * CM, f.depth * CM);
  const wood = currentWood();
  const mat = new THREE.MeshStandardMaterial({
    transparent: true, opacity: 0.55, roughness: 0.5, depthWrite: false,
  });
  mat.color.setHSL(wood.h, wood.s, Math.min(1, wood.l + 0.18));
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = 10;
  mesh.visible = false;
  scene.add(mesh);
  return mesh;
}

function _clearGhostShelves() {
  for (const m of ghostShelves) { scene.remove(m); m.geometry.dispose(); m.material.dispose(); }
  ghostShelves = [];
  for (const m of hoverExistingChain) {
    m.material.emissive.set(0x000000);
    m.material.emissiveIntensity = 0;
  }
  hoverExistingChain  = [];
  hoverExistingSlab   = null;
  extendDragActive    = false;
  extendDragSrcBay    = -1;
  extendDragSrcRelIdx = -1;
  extendDragSrcY      = -1;
  extendDragEndBay    = -1;
}

function _ensureGhostCount(n) {
  while (ghostShelves.length > n) {
    const m = ghostShelves.pop();
    scene.remove(m); m.geometry.dispose(); m.material.dispose();
  }
  while (ghostShelves.length < n) ghostShelves.push(_makeGhostMesh());
}

function refreshShelfToolGeometry() {
  const f = furniture;
  for (const m of ghostShelves) {
    m.geometry.dispose();
    m.geometry = new THREE.BoxGeometry(GHOST_REF_W * CM, f.thickness * CM, f.depth * CM);
  }
}

function _positionGhost(mesh, bayIdx, yCm, opacity) {
  const f    = furniture;
  const offX = totalWidth(f) / 2;
  const bays = bayGeometry(f);
  const wood = currentWood();
  mesh.material.color.setHSL(wood.h, wood.s, Math.min(1, wood.l + 0.18));
  mesh.material.opacity = opacity;
  mesh.scale.x = bays[bayIdx].width / GHOST_REF_W;
  mesh.position.set((bays[bayIdx].xCentre - offX) * CM, yCm * CM, 0);
  mesh.visible = true;
}

function _setExistingSlabHover(mesh) {
  if (mesh === hoverExistingSlab) return;
  for (const m of hoverExistingChain) {
    m.material.emissive.set(0x000000);
    m.material.emissiveIntensity = 0;
  }
  hoverExistingChain = [];
  hoverExistingSlab  = mesh;
  if (mesh) {
    const ud = mesh.userData;
    const ri = ud.slabIdx - 1;
    hoverExistingChain = [{ bay: ud.bayIdx, relIdx: ri }, ...getLinkedChain(ud.bayIdx, ri)]
      .map(cp => allMeshes.find(m =>
        m.userData.type === 'slab' && m.userData.bayIdx === cp.bay && m.userData.slabIdx === cp.relIdx + 1
      )).filter(Boolean);
    for (const m of hoverExistingChain) {
      m.material.emissive.setHex(0x116633);
      m.material.emissiveIntensity = 0.28;
    }
  }
}

function activateShelfTool() {
  deactivateActiveBrush();
  shelfToolActive = true;
  document.getElementById('btn-shelf').classList.add('active');
  canvasArea.style.cursor = 'crosshair';
  _ensureGhostCount(1);
  const _maxCols = window.appConfig?.cabinet?.maxColumns ?? Infinity;
  document.querySelectorAll('.ov-add-col').forEach(b => {
    b.style.display = numBays(furniture) < _maxCols ? '' : 'none';
  });
}

function deactivateShelfTool() {
  shelfToolActive   = false;
  shelfDragging     = false;
  shelfDragStartBay = -1;
  shelfDragEndBay   = -1;
  shelfDragY        = -1;
  ghostSubdivision  = null;
  document.getElementById('btn-shelf').classList.remove('active');
  canvasArea.style.cursor = 'grab';
  _clearGhostShelves();
  ghostBayIdx = -1;
  ghostYCm    = -1;
  document.querySelectorAll('.ov-add-col').forEach(b => b.style.display = 'none');
}

function toggleShelfTool() {
  if (shelfToolActive) deactivateShelfTool();
  else activateShelfTool();
}

function _subdivisionSnap(f, bay, intervalIdx, yCm) {
  const yCentres = slabYCentres(f, bay);
  const gapBot   = yCentres[intervalIdx]     + f.thickness / 2;
  const gapTop   = yCentres[intervalIdx + 1] - f.thickness / 2;
  const gapH     = gapTop - gapBot;
  let best = null, bestDist = Infinity;
  for (let n = 2; n <= 6; n++) {
    if (gapH < f.thickness * 2 * n) continue;
    const threshold = gapH / n * 0.25;
    for (let k = 1; k < n; k++) {
      const posY = gapBot + k * gapH / n;
      const dist = Math.abs(yCm - posY);
      if (dist <= threshold && (dist < bestDist || (dist === bestDist && n < best.n))) {
        bestDist = dist;
        best = { n, posY, gapBot, gapH, intervalIdx };
      }
    }
  }
  return best;
}

function _neighborSnap(f, bayA, bayB, targetY) {
  const checkBays = [];
  if (bayA > 0) checkBays.push(bayA - 1);
  if (bayB < numBays(f) - 1) checkBays.push(bayB + 1);
  let best = null, bestDist = SNAP_THRESH;
  for (const ab of checkBays) {
    for (let ri = 0; ri < f.columnSlabs[ab].length; ri++) {
      const aY   = getSlabAbsY(f, ab, ri);
      const dist = Math.abs(targetY - aY);
      if (dist < bestDist) { bestDist = dist; best = { snapY: aY, bay: ab, relIdx: ri }; }
    }
  }
  return best;
}

function _extendBays(srcBay, endBay) {
  const bays = [];
  if (endBay > srcBay) { for (let b = srcBay + 1; b <= endBay; b++) bays.push(b); }
  else if (endBay < srcBay) { for (let b = srcBay - 1; b >= endBay; b--) bays.push(b); }
  return bays;
}

function updateShelfGhost(clientX, clientY) {
  if (!ghostShelves.length) return;

  const rect = renderer.domElement.getBoundingClientRect();
  mouse2.set(
    ((clientX - rect.left) / rect.width)  *  2 - 1,
   -((clientY - rect.top)  / rect.height) *  2 + 1
  );
  raycaster.setFromCamera(mouse2, camera);

  // ── extend drag in progress ──
  if (extendDragActive) {
    const f        = furniture;
    const wallXs   = wallXPositions(f);
    const bays     = bayGeometry(f);
    const offX     = totalWidth(f) / 2;
    const frontPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -(f.depth / 2) * CM);
    const pt       = new THREE.Vector3();
    if (raycaster.ray.intersectPlane(frontPlane, pt)) {
      const xCm = pt.x / CM + offX;
      for (let b = 0; b < bays.length; b++) {
        const lx = wallXs[b]     + f.thickness / 2 + 0.1;
        const rx = wallXs[b + 1] - f.thickness / 2 - 0.1;
        if (xCm >= lx && xCm <= rx) { extendDragEndBay = b; break; }
      }
    }
    const extBays = _extendBays(extendDragSrcBay, extendDragEndBay);
    _ensureGhostCount(extBays.length);
    for (let i = 0; i < extBays.length; i++) _positionGhost(ghostShelves[i], extBays[i], extendDragSrcY, 0.65);
    for (let i = extBays.length; i < ghostShelves.length; i++) ghostShelves[i].visible = false;
    return;
  }

  // ── check if cursor is over an existing interior slab ──
  const hits = raycaster.intersectObjects(allMeshes, false);
  let hitSlab = null;
  for (const hit of hits) {
    const ud = hit.object.userData;
    if (ud.type === 'slab' && ud.slabIdx > 0 && ud.slabIdx < ud.totalSlabs - 1) {
      hitSlab = hit.object; break;
    }
  }
  _setExistingSlabHover(hitSlab);
  if (hitSlab) {
    for (const m of ghostShelves) m.visible = false;
    ghostBayIdx = -1; ghostSubdivision = null;
    canvasArea.style.cursor = 'ew-resize';
    return;
  }
  canvasArea.style.cursor = 'crosshair';

  const f          = furniture;
  const frontPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -(f.depth / 2) * CM);
  const pt         = new THREE.Vector3();

  if (!raycaster.ray.intersectPlane(frontPlane, pt)) {
    if (!shelfDragging) { for (const m of ghostShelves) m.visible = false; ghostBayIdx = -1; ghostSubdivision = null; }
    return;
  }

  const offX   = totalWidth(f) / 2;
  const xCm    = pt.x / CM + offX;
  const wallXs = wallXPositions(f);
  const bays   = bayGeometry(f);

  let curBay = -1;
  for (let b = 0; b < bays.length; b++) {
    const lx = wallXs[b]     + f.thickness / 2 + 0.1;
    const rx = wallXs[b + 1] - f.thickness / 2 - 0.1;
    if (xCm >= lx && xCm <= rx) { curBay = b; break; }
  }

  if (shelfDragging) {
    if (curBay >= 0) shelfDragEndBay = curBay;
    const bayA     = Math.min(shelfDragStartBay, shelfDragEndBay);
    const bayB     = Math.max(shelfDragStartBay, shelfDragEndBay);
    const snap     = _neighborSnap(f, bayA, bayB, shelfDragY);
    const displayY = snap ? snap.snapY : shelfDragY;
    const count    = bayB - bayA + 1;
    _ensureGhostCount(count);
    for (let i = 0; i < count; i++) _positionGhost(ghostShelves[i], bayA + i, displayY, snap ? 0.75 : 0.65);
    ghostYCm = displayY;
    return;
  }

  // ── single-bay hover ──────────────────────────────────
  if (curBay < 0) {
    for (const m of ghostShelves) m.visible = false;
    ghostBayIdx = -1; ghostSubdivision = null;
    return;
  }

  const yCm      = pt.y / CM;
  const yCentres = slabYCentres(f, curBay);

  let intervalIdx = -1;
  let clampedY    = yCm;
  for (let s = 0; s < yCentres.length - 1; s++) {
    const gapBot = yCentres[s]     + f.thickness / 2;
    const gapTop = yCentres[s + 1] - f.thickness / 2;
    if (yCm >= gapBot - f.thickness && yCm <= gapTop + f.thickness) {
      if (gapTop - gapBot < f.thickness * 3) break;
      intervalIdx = s;
      clampedY    = Math.max(gapBot + f.thickness / 2 + 1, Math.min(gapTop - f.thickness / 2 - 1, yCm));
      break;
    }
  }

  if (intervalIdx < 0) {
    _ensureGhostCount(1);
    ghostShelves[0].visible = false;
    ghostBayIdx = -1; ghostSubdivision = null;
    return;
  }

  // ── subdivision snap (empty bay only) ──
  const subSnap = yCentres.length === 2 ? _subdivisionSnap(f, curBay, intervalIdx, yCm) : null;
  if (subSnap) {
    ghostSubdivision = { ...subSnap, bay: curBay };
    _ensureGhostCount(subSnap.n - 1);
    for (let k = 1; k < subSnap.n; k++) {
      _positionGhost(ghostShelves[k - 1], curBay, subSnap.gapBot + k * subSnap.gapH / subSnap.n, 0.60);
    }
    ghostBayIdx = curBay;
    ghostYCm    = subSnap.posY;
    return;
  }

  ghostSubdivision = null;

  const snap   = _neighborSnap(f, curBay, curBay, clampedY);
  const finalY = snap ? snap.snapY : clampedY;
  _ensureGhostCount(1);
  ghostBayIdx = curBay;
  ghostYCm    = finalY;
  _positionGhost(ghostShelves[0], curBay, finalY, snap ? 0.75 : 0.55);
}

function shelfToolMouseDown(clientX, clientY) {
  if (hoverExistingSlab) {
    const ud        = hoverExistingSlab.userData;
    extendDragActive    = true;
    extendDragSrcBay    = ud.bayIdx;
    extendDragSrcRelIdx = ud.slabIdx - 1;
    extendDragSrcY      = getSlabAbsY(furniture, ud.bayIdx, ud.slabIdx - 1);
    extendDragEndBay    = ud.bayIdx;
    return;
  }
  if (ghostSubdivision) return;
  if (!ghostShelves[0]?.visible || ghostBayIdx < 0) return;
  shelfDragging     = true;
  shelfDragStartBay = ghostBayIdx;
  shelfDragEndBay   = ghostBayIdx;
  shelfDragY        = ghostYCm;
}

function commitExtendDrag() {
  if (!extendDragActive) return;
  const extBays = _extendBays(extendDragSrcBay, extendDragEndBay);
  const inserted = [];
  for (const b of extBays) {
    const relIdx = _insertSlabAt(b, extendDragSrcY);
    if (relIdx >= 0) inserted.push({ bay: b, relIdx });
  }
  let prevBay = extendDragSrcBay, prevRelIdx = extendDragSrcRelIdx;
  for (const ins of inserted) {
    const lkA = Math.min(prevBay, ins.bay);
    const lkB = Math.max(prevBay, ins.bay);
    slabLinks.push({
      bayA: lkA, relIdxA: lkA === prevBay ? prevRelIdx : ins.relIdx,
      bayB: lkB, relIdxB: lkB === prevBay ? prevRelIdx : ins.relIdx,
    });
    prevBay    = ins.bay;
    prevRelIdx = ins.relIdx;
  }
  extendDragActive    = false;
  extendDragSrcBay    = -1;
  extendDragSrcRelIdx = -1;
  extendDragSrcY      = -1;
  extendDragEndBay    = -1;
  if (inserted.length > 0) buildFurniture();
}

// Insert slab at given Y in one bay. Returns inserted relIdx, or -1 if no room.
// Does NOT call buildFurniture.
function _insertSlabAt(bay, targetY) {
  const f        = furniture;
  const yCentres = slabYCentres(f, bay);
  let intervalIdx = -1;
  for (let s = 0; s < yCentres.length - 1; s++) {
    const gapBot = yCentres[s]     + f.thickness / 2;
    const gapTop = yCentres[s + 1] - f.thickness / 2;
    if (targetY - f.thickness / 2 >= gapBot && targetY + f.thickness / 2 <= gapTop) {
      intervalIdx = s; break;
    }
  }
  if (intervalIdx < 0) return -1;

  const cursor_s    = yCentres[intervalIdx]     - f.thickness / 2;
  const cursor_next = yCentres[intervalIdx + 1] - f.thickness / 2;
  const new_rel     = Math.max(Math.ceil(f.thickness) + 1, Math.round((targetY - f.thickness / 2) - cursor_s));
  if (cursor_s + new_rel + f.thickness >= cursor_next - 1) return -1;

  const insertAt = intervalIdx;
  const adj      = Math.max(1, Math.round(cursor_next - cursor_s - new_rel));
  if (insertAt < f.columnSlabs[bay].length) {
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
  return insertAt;
}

function commitShelfGroup() {
  if (!ghostShelves.some(m => m.visible)) return;

  if (ghostSubdivision && !shelfDragging) {
    const { n, gapBot, gapH, bay } = ghostSubdivision;
    for (let k = 1; k < n; k++) _insertSlabAt(bay, gapBot + k * gapH / n);
    ghostSubdivision = null;
    ghostBayIdx = -1; ghostYCm = -1;
    buildFurniture();
    return;
  }

  const rawY = shelfDragY >= 0 ? shelfDragY : ghostYCm;
  if (rawY < 0) return;

  const bayA = shelfDragging ? Math.min(shelfDragStartBay, shelfDragEndBay) : ghostBayIdx;
  const bayB = shelfDragging ? Math.max(shelfDragStartBay, shelfDragEndBay) : ghostBayIdx;

  const snap    = _neighborSnap(furniture, bayA, bayB, rawY);
  const targetY = snap ? snap.snapY : rawY;

  const inserted = [];
  for (let b = bayA; b <= bayB; b++) {
    const relIdx = _insertSlabAt(b, targetY);
    if (relIdx >= 0) inserted.push({ bay: b, relIdx });
  }
  for (let i = 0; i < inserted.length - 1; i++) {
    slabLinks.push({
      bayA:    inserted[i].bay,     relIdxA: inserted[i].relIdx,
      bayB:    inserted[i + 1].bay, relIdxB: inserted[i + 1].relIdx,
    });
  }
  if (snap && inserted.length > 0) {
    const borderBay      = snap.bay < bayA ? bayA : bayB;
    const borderInserted = inserted.find(ins => ins.bay === borderBay);
    if (borderInserted) {
      const lkA = Math.min(borderInserted.bay, snap.bay);
      const lkB = Math.max(borderInserted.bay, snap.bay);
      slabLinks.push({
        bayA: lkA, relIdxA: lkA === borderInserted.bay ? borderInserted.relIdx : snap.relIdx,
        bayB: lkB, relIdxB: lkB === borderInserted.bay ? borderInserted.relIdx : snap.relIdx,
      });
    }
  }

  shelfDragging     = false;
  shelfDragStartBay = -1;
  shelfDragEndBay   = -1;
  shelfDragY        = -1;
  ghostBayIdx       = -1;
  ghostYCm          = -1;
  buildFurniture();
}

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    if (shelfToolActive) deactivateShelfTool();
    else deactivateActiveBrush();
  }
});
