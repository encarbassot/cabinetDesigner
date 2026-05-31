'use strict';

const raycaster = new THREE.Raycaster();
const mouse2    = new THREE.Vector2();

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

let hoverMesh      = null;
let hoverMeshGroup = [];
let isDraggingSlab = false;
let dragData       = null;
let isDraggingWall = false;
let wallDragData   = null;

function setHover(mesh) {
  if (hoverMesh === mesh) return;
  if (hoverMesh?.userData.frontHandle) hoverMesh.userData.frontHandle.material.opacity = 0;
  for (const m of hoverMeshGroup) {
    if (m !== selectedMesh) {
      m.material.emissive.set(0x000000);
      m.material.emissiveIntensity = 0;
    }
  }
  hoverMesh = mesh;
  hoverMeshGroup = [];
  if (hoverMesh) {
    if (hoverMesh.userData.frontHandle) hoverMesh.userData.frontHandle.material.opacity = 0.75;
    const d = hoverMesh.userData;
    if (d.type === 'slab' && d.slabIdx > 0 && d.slabIdx < d.totalSlabs - 1) {
      const ri = d.slabIdx - 1;
      hoverMeshGroup = [{ bay: d.bayIdx, relIdx: ri }, ...getLinkedChain(d.bayIdx, ri)]
        .map(cp => allMeshes.find(m =>
          m.userData.type === 'slab' && m.userData.bayIdx === cp.bay && m.userData.slabIdx === cp.relIdx + 1
        )).filter(Boolean);
    } else {
      hoverMeshGroup = [hoverMesh];
    }
    for (const m of hoverMeshGroup) {
      if (m !== selectedMesh) {
        m.material.emissive.setHex(d.type === 'wall' ? 0x2255aa : 0x116633);
        m.material.emissiveIntensity = 0.22;
      }
    }
  }
  const isWall = mesh && mesh.userData.type === 'wall';
  canvasArea.style.cursor = mesh ? (isWall ? 'ew-resize' : 'ns-resize') : (dragging ? 'grabbing' : 'grab');
}

let dragging = false, prevMouse = { x: 0, y: 0 }, clickOrigin = { x: 0, y: 0 };

renderer.domElement.addEventListener('mousedown', e => {
  clickOrigin = { x: e.clientX, y: e.clientY };
  clearCoverHover();
  if (typeof appMode !== 'undefined' && appMode !== 'cabinet') { dragging = true; prevMouse = { x: e.clientX, y: e.clientY }; return; }
  if (activeBrush) { activeBrush.onMouseDown(e.clientX, e.clientY); return; }
  if (shelfToolActive) { shelfToolMouseDown(e.clientX, e.clientY); return; }

  if (hoverMesh && e.button === 0 && hoverMesh.userData.type === 'wall') {
    const d  = hoverMesh.userData;
    const f  = furniture;
    const wi = d.wallIdx;
    if (lockedDimensions.width && (wi === 0 || wi === numWalls(f) - 1)) return;
    const wallPos = new THREE.Vector3();
    hoverMesh.getWorldPosition(wallPos);
    const dist       = camera.position.distanceTo(wallPos);
    const vHalfRad   = (camera.fov / 2) * Math.PI / 180;
    const worldPerPx = (2 * dist * Math.tan(vHalfRad)) / renderer.domElement.clientHeight;
    const camRight   = new THREE.Vector3()
      .crossVectors(camera.getWorldDirection(new THREE.Vector3()), camera.up)
      .normalize();
    isDraggingWall = true;
    document.getElementById('canvas-overlay').style.opacity = '0';
    const wState = wallDragStart(f, wi);
    wallDragData = { mesh: hoverMesh, startClientX: e.clientX, worldPerPx,
      camRightX: camRight.x || 0.001, ...wState };
    return;
  }

  if (hoverMesh && e.button === 0) {
    const d = hoverMesh.userData;
    const f = furniture;

    if (d.slabIdx === d.totalSlabs - 1) {
      if (lockedDimensions.height) return;
      const slabPos = new THREE.Vector3();
      hoverMesh.getWorldPosition(slabPos);
      const dist       = camera.position.distanceTo(slabPos);
      const vHalfRad   = (camera.fov / 2) * Math.PI / 180;
      const worldPerPx = (2 * dist * Math.tan(vHalfRad)) / renderer.domElement.clientHeight;
      isDraggingSlab = true;
      document.getElementById('canvas-overlay').style.opacity = '0';
      dragData = { mesh: hoverMesh, isTopSlab: true,
        startClientY: e.clientY, worldPerPx, startHeight: f.height, lb: 30 };
      return;
    }

    const ri = d.slabIdx - 1;
    const slabPos = new THREE.Vector3();
    hoverMesh.getWorldPosition(slabPos);
    const dist       = camera.position.distanceTo(slabPos);
    const vHalfRad   = (camera.fov / 2) * Math.PI / 180;
    const worldPerPx = (2 * dist * Math.tan(vHalfRad)) / renderer.domElement.clientHeight;

    isDraggingSlab = true;
    document.getElementById('canvas-overlay').style.opacity = '0';

    const sState = slabDragStart(f, d.bayIdx, ri);
    // Attach 3D mesh refs to linked drags (renderer-specific, not in drag-behavior)
    for (const ld of sState.linkedDrags) {
      ld.mesh = allMeshes.find(m =>
        m.userData.type === 'slab' && m.userData.bayIdx === ld.bay && m.userData.slabIdx === ld.relIdx + 1
      ) || null;
    }
    dragData = { mesh: hoverMesh, startClientY: e.clientY, worldPerPx, ...sState };
    return;
  }

  dragging  = true;
  prevMouse = { x: e.clientX, y: e.clientY };
});

renderer.domElement.addEventListener('contextmenu', e => e.preventDefault());

window.addEventListener('mousemove', e => {
  const rect = renderer.domElement.getBoundingClientRect();

  if (activeBrush) { activeBrush.onMouseMove(e.clientX, e.clientY); return; }
  if (shelfToolActive) { updateShelfGhost(e.clientX, e.clientY); return; }

  if (plan2dDrag) {
    const f = furniture;
    if (plan2dDrag.type === 'wall') {
      const wd      = plan2dDrag;
      const deltaCm = (e.clientX - wd.startClientX) / wd.scale;
      wallDragApply(f, wd, deltaCm);
      updateColumnsUI(); drawPlan();
      return;
    }
    if (plan2dDrag.type === 'slab') {
      const sd      = plan2dDrag;
      const deltaCm = -(e.clientY - sd.startClientY) / sd.scale;
      if (sd.isTopSlab) {
        f.height = Math.max(sd.lb, Math.round(sd.startHeight + deltaCm));
        const cfgH = document.getElementById('cfg-height'); if (cfgH) cfgH.value = f.height;
        drawPlan();
        return;
      }
      const rawY = clamp(sd.startAbsY + deltaCm, sd.lb, sd.ub);
      slabDragApply(f, sd, rawY);
      drawPlan();
      return;
    }
  }

  if (isDraggingWall && wallDragData) {
    const f  = furniture;
    const wd = wallDragData;
    const screenDX = e.clientX - wd.startClientX;
    const sign     = wd.camRightX > 0 ? 1 : -1;
    const deltaCm  = sign * screenDX * wd.worldPerPx / CM;

    wallDragApply(f, wd, deltaCm);

    // Snap balls for inner wall midpoint snap
    if (wd.snapTarget) {
      showSnapBalls3D(wd.snapTarget.lowerX, f.height / 2, wd.snapTarget.upperX, f.height / 2);
    } else {
      hideSnapBalls3D();
    }

    const offX   = totalWidth(f) / 2;
    const wallXs = wallXPositions(f);
    const bays   = bayGeometry(f);
    for (const m of allMeshes) {
      if (m.userData.type === 'wall') {
        m.position.x = (wallXs[m.userData.wallIdx] - offX) * CM;
      } else if (m.userData.type === 'slab') {
        const bi    = m.userData.bayIdx;
        const bay   = bays[bi];
        const origW = m.geometry.parameters.width / CM;
        m.scale.x    = bay.width / origW;
        m.position.x = (bay.xCentre - offX) * CM;
      }
    }
    updateColumnsUI();
    drawPlan();
    return;
  }

  if (isDraggingSlab && dragData) {
    const f        = furniture;
    const screenDY = e.clientY - dragData.startClientY;
    const deltaCm  = -screenDY * dragData.worldPerPx / CM;

    if (dragData.isTopSlab) {
      f.height = Math.max(dragData.lb, Math.round(dragData.startHeight + deltaCm));
      for (const m of allMeshes) {
        if (m.userData.type === 'slab' && m.userData.slabIdx === m.userData.totalSlabs - 1)
          m.position.y = (f.height - f.thickness / 2) * CM;
        else if (m.userData.type === 'wall') {
          const origH = m.geometry.parameters.height / CM;
          m.scale.y   = f.height / origH;
          m.position.y = (f.height / 2) * CM;
        }
      }
      const cfgH = document.getElementById('cfg-height'); if (cfgH) cfgH.value = f.height;
      drawPlan();
      return;
    }

    const rawY  = clamp(dragData.startAbsY + deltaCm, dragData.lb, dragData.ub);
    const snapY = slabDragApply(f, dragData, rawY);

    // Update 3D mesh positions
    dragData.mesh.position.y = (snapY + f.thickness / 2) * CM;
    for (const ld of dragData.linkedDrags) {
      if (ld.mesh) ld.mesh.position.y = (snapY + f.thickness / 2) * CM;
    }

    // Snap visuals
    const snap = dragData.snapTarget;
    if (snap) {
      const bays = bayGeometry(f);
      const bayX = bays[dragData.bayIdx].xCentre;
      showSnapBalls3D(bayX, snap.lowerY, bayX, snap.upperY);
      if (snap.type === 'crossbay') {
        const chain = [{ bay: snap.bay, relIdx: snap.relIdx }, ...getLinkedChain(snap.bay, snap.relIdx)];
        const snapMeshes = chain.map(cp => allMeshes.find(m =>
          m.userData.type === 'slab' && m.userData.bayIdx === cp.bay && m.userData.slabIdx === cp.relIdx + 1
        )).filter(Boolean);
        setSnapHighlight(snapMeshes);
      } else {
        setSnapHighlight([]);
      }
    } else {
      hideSnapBalls3D();
      setSnapHighlight([]);
    }

    drawPlan();
    return;
  }

  if (dragging) {
    const dx = e.clientX - prevMouse.x, dy = e.clientY - prevMouse.y;
    prevMouse = { x: e.clientX, y: e.clientY };
    if (e.buttons & 1) {
      sph.theta -= dx * 0.006;
      sph.phi    = clamp(sph.phi + dy * 0.006, 0.06, Math.PI / 2 - 0.02);
    } else if (e.buttons & 2) {
      const speed = sph.radius * 0.0012;
      const right = new THREE.Vector3()
        .crossVectors(camera.getWorldDirection(new THREE.Vector3()), camera.up)
        .normalize();
      target.addScaledVector(right, -dx * speed);
      target.y = Math.max(0, target.y + dy * speed);
    }
    applyCameraPos();
    return;
  }

  mouse2.set(
    ((e.clientX - rect.left) / rect.width)  *  2 - 1,
   -((e.clientY - rect.top)  / rect.height) *  2 + 1
  );
  if (typeof appMode !== 'undefined' && appMode !== 'cabinet') return;
  raycaster.setFromCamera(mouse2, camera);
  const hits = raycaster.intersectObjects(allMeshes, false);

  let found = null;
  for (const hit of hits) {
    const obj  = hit.object;
    const type = obj.userData.type;
    if (type === 'slab') {
      const { slabIdx } = obj.userData;
      if (slabIdx > 0) { found = obj; break; }
    } else if (type === 'wall') {
      found = obj; break;
    }
  }
  setHover(found);

  const coverHits = (prettyMode || hoverMesh) ? [] : raycaster.intersectObjects(hitPlanes);
  const newCoverIdx = coverHits.length > 0 ? coverHits[0].object.userData.coverIdx : -1;
  if (newCoverIdx !== hoveredCoverIdx) {
    setCoverOpacity(hoveredCoverIdx, 0);
    hoveredCoverIdx = newCoverIdx;
    setCoverOpacity(hoveredCoverIdx, 0.92);
  }
});

window.addEventListener('mouseup', () => {
  if (activeBrush) { activeBrush.onMouseUp(); return; }
  if (shelfToolActive) { if (extendDragActive) { commitExtendDrag(); return; } if (shelfDragging) commitShelfGroup(); return; }
  if (plan2dDrag) {
    const pd = plan2dDrag;
    plan2dDrag = null;
    if (pd.type === 'slab' && pd.snapTarget?.type === 'crossbay' && !pd.linkedDrags.length) {
      const st   = pd.snapTarget;
      const bayA = Math.min(pd.bayIdx, st.bay);
      const bayB = Math.max(pd.bayIdx, st.bay);
      const riA  = bayA === pd.bayIdx ? pd.relIdx : st.relIdx;
      const riB  = bayB === pd.bayIdx ? pd.relIdx : st.relIdx;
      slabLinks.push({ bayA, relIdxA: riA, bayB, relIdxB: riB });
      buildLockButtons();
    }
    buildFurniture();
    return;
  }
  if (isDraggingWall) {
    isDraggingWall = false;
    wallDragData   = null;
    hideSnapBalls3D();
    document.getElementById('canvas-overlay').style.opacity = '';
    buildFurniture();
    return;
  }
  if (isDraggingSlab) {
    isDraggingSlab = false;
    if (dragData && dragData.snapTarget?.type === 'crossbay' && !dragData.linkedDrags.length) {
      const st   = dragData.snapTarget;
      const bayA = Math.min(dragData.bayIdx, st.bay);
      const bayB = Math.max(dragData.bayIdx, st.bay);
      const riA  = bayA === dragData.bayIdx ? dragData.relIdx : st.relIdx;
      const riB  = bayB === dragData.bayIdx ? dragData.relIdx : st.relIdx;
      slabLinks.push({ bayA, relIdxA: riA, bayB, relIdxB: riB });
    }
    setSnapHighlight([]);
    hideSnapBalls3D();
    dragData       = null;
    document.getElementById('canvas-overlay').style.opacity = '';
    buildFurniture();
    return;
  }
  dragging = false;
  const isWall = hoverMesh && hoverMesh.userData.type === 'wall';
  canvasArea.style.cursor = hoverMesh ? (isWall ? 'ew-resize' : 'ns-resize') : 'grab';
});

renderer.domElement.addEventListener('wheel', e => {
  e.preventDefault();
  sph.radius = clamp(sph.radius + e.deltaY * 0.025, 5, 60);
  applyCameraPos();
}, { passive: false });

renderer.domElement.addEventListener('click', e => {
  if (typeof appMode !== 'undefined' && appMode !== 'cabinet') return;
  if (isDraggingSlab) return;
  if (shelfToolActive) {
    if (ghostShelves[0]?.visible && ghostBayIdx >= 0) commitShelfGroup();
    return;
  }
  if (Math.hypot(e.clientX - clickOrigin.x, e.clientY - clickOrigin.y) > 5) return;
  const rect = renderer.domElement.getBoundingClientRect();
  mouse2.set(
    ((e.clientX - rect.left) / rect.width)  *  2 - 1,
   -((e.clientY - rect.top)  / rect.height) *  2 + 1
  );
  raycaster.setFromCamera(mouse2, camera);
  const hits = raycaster.intersectObjects(allMeshes, false);
  if (hits.length) {
    selectMesh(hits[0].object);
  } else {
    deselectCurrent();
  }
});

// ── Touch support ────────────────────────────────────
let _touch1 = null;  // single-finger gesture state
let _pinch  = null;  // two-finger pinch/pan state

function _pinchDist(a, b) { return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY); }
function _pinchMid(a, b)  { return { x: (a.clientX + b.clientX) * 0.5, y: (a.clientY + b.clientY) * 0.5 }; }

function _initSlabDragTouch(mesh, ty) {
  const d = mesh.userData, f = furniture;
  const slabPos    = new THREE.Vector3();
  mesh.getWorldPosition(slabPos);
  const dist       = camera.position.distanceTo(slabPos);
  const vHalfRad   = (camera.fov / 2) * Math.PI / 180;
  const worldPerPx = (2 * dist * Math.tan(vHalfRad)) / renderer.domElement.clientHeight;
  document.getElementById('canvas-overlay').style.opacity = '0';
  if (d.slabIdx === d.totalSlabs - 1) {
    if (lockedDimensions.height) return false;
    isDraggingSlab = true;
    dragData = { mesh, isTopSlab: true, startClientY: ty, worldPerPx, startHeight: f.height, lb: 30 };
  } else {
    const ri     = d.slabIdx - 1;
    const sState = slabDragStart(f, d.bayIdx, ri);
    for (const ld of sState.linkedDrags)
      ld.mesh = allMeshes.find(m =>
        m.userData.type === 'slab' && m.userData.bayIdx === ld.bay && m.userData.slabIdx === ld.relIdx + 1
      ) || null;
    isDraggingSlab = true;
    dragData = { mesh, startClientY: ty, worldPerPx, ...sState };
  }
  return true;
}

function _initWallDragTouch(mesh, tx) {
  const d = mesh.userData, f = furniture, wi = d.wallIdx;
  if (lockedDimensions.width && (wi === 0 || wi === numWalls(f) - 1)) return false;
  const wallPos    = new THREE.Vector3();
  mesh.getWorldPosition(wallPos);
  const dist       = camera.position.distanceTo(wallPos);
  const vHalfRad   = (camera.fov / 2) * Math.PI / 180;
  const worldPerPx = (2 * dist * Math.tan(vHalfRad)) / renderer.domElement.clientHeight;
  const camRight   = new THREE.Vector3()
    .crossVectors(camera.getWorldDirection(new THREE.Vector3()), camera.up).normalize();
  isDraggingWall = true;
  document.getElementById('canvas-overlay').style.opacity = '0';
  const wState = wallDragStart(f, wi);
  wallDragData = { mesh, startClientX: tx, worldPerPx, camRightX: camRight.x || 0.001, ...wState };
  return true;
}

function _tapSelect(cx, cy) {
  const rect = renderer.domElement.getBoundingClientRect();
  mouse2.set(
    ((cx - rect.left) / rect.width)  *  2 - 1,
   -((cy - rect.top)  / rect.height) *  2 + 1
  );
  raycaster.setFromCamera(mouse2, camera);
  const hits = raycaster.intersectObjects(allMeshes, false);
  if (hits.length) selectMesh(hits[0].object); else deselectCurrent();
}

renderer.domElement.addEventListener('touchstart', e => {
  e.preventDefault();
  const ts = e.touches;

  if (ts.length >= 2) {
    // Escalate to pinch/pan — cancel any active single-touch drag
    if (isDraggingSlab)  { isDraggingSlab = false;  dragData = null;     document.getElementById('canvas-overlay').style.opacity = ''; }
    if (isDraggingWall)  { isDraggingWall = false;  wallDragData = null; document.getElementById('canvas-overlay').style.opacity = ''; }
    dragging = false; _touch1 = null;
    _pinch = { prevDist: _pinchDist(ts[0], ts[1]), prevMid: _pinchMid(ts[0], ts[1]) };
    return;
  }

  const t = ts[0];
  clickOrigin = { x: t.clientX, y: t.clientY };
  clearCoverHover();

  if (typeof appMode !== 'undefined' && appMode !== 'cabinet') {
    dragging  = true;
    prevMouse = { x: t.clientX, y: t.clientY };
    _touch1   = { type: 'orbit' };
    return;
  }

  if (shelfToolActive) {
    updateShelfGhost(t.clientX, t.clientY);
    shelfToolMouseDown(t.clientX, t.clientY);
    _touch1 = { type: 'shelf' };
    return;
  }

  // Raycast to detect slabs / walls under finger
  const rect = renderer.domElement.getBoundingClientRect();
  mouse2.set(
    ((t.clientX - rect.left) / rect.width)  *  2 - 1,
   -((t.clientY - rect.top)  / rect.height) *  2 + 1
  );
  raycaster.setFromCamera(mouse2, camera);
  const hits = raycaster.intersectObjects(allMeshes, false);
  let found = null;
  for (const h of hits) {
    const tp = h.object.userData.type;
    if (tp === 'slab' && h.object.userData.slabIdx > 0) { found = h.object; break; }
    if (tp === 'wall') { found = h.object; break; }
  }
  if (found) {
    setHover(found);
    if (found.userData.type === 'wall' && _initWallDragTouch(found, t.clientX)) { _touch1 = { type: 'wall' };  return; }
    if (found.userData.type === 'slab' && _initSlabDragTouch(found, t.clientY)) { _touch1 = { type: 'slab' };  return; }
  }

  // No interactive object hit → camera orbit (1 finger)
  dragging  = true;
  prevMouse = { x: t.clientX, y: t.clientY };
  _touch1   = { type: 'orbit' };
}, { passive: false });

window.addEventListener('touchmove', e => {
  const ts = e.touches;

  if (ts.length === 1) {
    const t = ts[0];

    // 2D plan drag (state set by plan2d.js touchstart)
    if (plan2dDrag) {
      e.preventDefault();
      const f = furniture;
      if (plan2dDrag.type === 'wall') {
        wallDragApply(f, plan2dDrag, (t.clientX - plan2dDrag.startClientX) / plan2dDrag.scale);
        updateColumnsUI(); drawPlan();
      } else if (plan2dDrag.type === 'slab') {
        const dc = -(t.clientY - plan2dDrag.startClientY) / plan2dDrag.scale;
        if (plan2dDrag.isTopSlab) {
          f.height = Math.max(plan2dDrag.lb, Math.round(plan2dDrag.startHeight + dc));
          const cfgH = document.getElementById('cfg-height'); if (cfgH) cfgH.value = f.height;
          drawPlan();
        } else {
          slabDragApply(f, plan2dDrag, clamp(plan2dDrag.startAbsY + dc, plan2dDrag.lb, plan2dDrag.ub));
          drawPlan();
        }
      }
      return;
    }

    if (!_touch1) return;

    if (_touch1.type === 'shelf') { e.preventDefault(); updateShelfGhost(t.clientX, t.clientY); return; }

    if (isDraggingWall && wallDragData) {
      e.preventDefault();
      const f = furniture, wd = wallDragData;
      const deltaCm = (wd.camRightX > 0 ? 1 : -1) * (t.clientX - wd.startClientX) * wd.worldPerPx / CM;
      wallDragApply(f, wd, deltaCm);
      if (wd.snapTarget) showSnapBalls3D(wd.snapTarget.lowerX, f.height / 2, wd.snapTarget.upperX, f.height / 2);
      else hideSnapBalls3D();
      const offX = totalWidth(f) / 2, wallXs = wallXPositions(f), bays = bayGeometry(f);
      for (const m of allMeshes) {
        if (m.userData.type === 'wall') {
          m.position.x = (wallXs[m.userData.wallIdx] - offX) * CM;
        } else if (m.userData.type === 'slab') {
          const bay = bays[m.userData.bayIdx];
          m.scale.x    = bay.width / (m.geometry.parameters.width / CM);
          m.position.x = (bay.xCentre - offX) * CM;
        }
      }
      updateColumnsUI(); drawPlan();
      return;
    }

    if (isDraggingSlab && dragData) {
      e.preventDefault();
      const f = furniture, deltaCm = -(t.clientY - dragData.startClientY) * dragData.worldPerPx / CM;
      if (dragData.isTopSlab) {
        f.height = Math.max(dragData.lb, Math.round(dragData.startHeight + deltaCm));
        for (const m of allMeshes) {
          if (m.userData.type === 'slab' && m.userData.slabIdx === m.userData.totalSlabs - 1)
            m.position.y = (f.height - f.thickness / 2) * CM;
          else if (m.userData.type === 'wall') {
            m.scale.y    = f.height / (m.geometry.parameters.height / CM);
            m.position.y = (f.height / 2) * CM;
          }
        }
        const cfgH = document.getElementById('cfg-height'); if (cfgH) cfgH.value = f.height;
        drawPlan(); return;
      }
      const rawY  = clamp(dragData.startAbsY + deltaCm, dragData.lb, dragData.ub);
      const snapY = slabDragApply(f, dragData, rawY);
      dragData.mesh.position.y = (snapY + f.thickness / 2) * CM;
      for (const ld of dragData.linkedDrags) if (ld.mesh) ld.mesh.position.y = (snapY + f.thickness / 2) * CM;
      const snap = dragData.snapTarget;
      if (snap) {
        const bayX = bayGeometry(f)[dragData.bayIdx].xCentre;
        showSnapBalls3D(bayX, snap.lowerY, bayX, snap.upperY);
        if (snap.type === 'crossbay') {
          setSnapHighlight([{ bay: snap.bay, relIdx: snap.relIdx }, ...getLinkedChain(snap.bay, snap.relIdx)]
            .map(cp => allMeshes.find(m =>
              m.userData.type === 'slab' && m.userData.bayIdx === cp.bay && m.userData.slabIdx === cp.relIdx + 1
            )).filter(Boolean));
        } else setSnapHighlight([]);
      } else { hideSnapBalls3D(); setSnapHighlight([]); }
      drawPlan(); return;
    }

    if (dragging) {
      e.preventDefault();
      const dx = t.clientX - prevMouse.x, dy = t.clientY - prevMouse.y;
      prevMouse = { x: t.clientX, y: t.clientY };
      sph.theta -= dx * 0.006;
      sph.phi    = clamp(sph.phi - dy * 0.006, 0.06, Math.PI / 2 - 0.02);
      applyCameraPos();
    }
    return;
  }

  // Two fingers: pinch zoom + pan
  if (ts.length >= 2 && _pinch) {
    e.preventDefault();
    const newDist = _pinchDist(ts[0], ts[1]);
    const newMid  = _pinchMid(ts[0], ts[1]);
    sph.radius = clamp(sph.radius + (_pinch.prevDist - newDist) * 0.04, 5, 60);
    const dx = newMid.x - _pinch.prevMid.x, dy = newMid.y - _pinch.prevMid.y;
    const right = new THREE.Vector3()
      .crossVectors(camera.getWorldDirection(new THREE.Vector3()), camera.up).normalize();
    target.addScaledVector(right, -dx * sph.radius * 0.0012);
    target.y = Math.max(0, target.y + dy * sph.radius * 0.0012);
    _pinch.prevDist = newDist;
    _pinch.prevMid  = newMid;
    applyCameraPos();
  }
}, { passive: false });

window.addEventListener('touchend', e => {
  const remaining = e.touches.length;
  const et        = e.changedTouches[0];
  const wasTap    = et && Math.hypot(et.clientX - clickOrigin.x, et.clientY - clickOrigin.y) < 10;

  if (remaining === 0) {
    _pinch  = null;
    _touch1 = null;

    // 2D plan drag cleanup (mirrors mouseup plan2dDrag handling)
    if (plan2dDrag) {
      const pd = plan2dDrag; plan2dDrag = null;
      if (pd.type === 'slab' && pd.snapTarget?.type === 'crossbay' && !pd.linkedDrags.length) {
        const st   = pd.snapTarget;
        const bayA = Math.min(pd.bayIdx, st.bay), bayB = Math.max(pd.bayIdx, st.bay);
        slabLinks.push({ bayA, relIdxA: bayA === pd.bayIdx ? pd.relIdx : st.relIdx,
                         bayB, relIdxB: bayB === pd.bayIdx ? pd.relIdx : st.relIdx });
        buildLockButtons();
      }
      buildFurniture(); return;
    }

    if (shelfToolActive) {
      if (shelfDragging || (wasTap && ghostShelf?.visible && ghostBayIdx >= 0)) commitShelfGroup();
      return;
    }

    if (isDraggingWall) {
      isDraggingWall = false; wallDragData = null; hideSnapBalls3D();
      document.getElementById('canvas-overlay').style.opacity = '';
      buildFurniture();
      // fall through to tap-select
    }

    if (isDraggingSlab) {
      isDraggingSlab = false;
      if (dragData?.snapTarget?.type === 'crossbay' && !dragData.linkedDrags.length) {
        const st   = dragData.snapTarget;
        const bayA = Math.min(dragData.bayIdx, st.bay), bayB = Math.max(dragData.bayIdx, st.bay);
        slabLinks.push({ bayA, relIdxA: bayA === dragData.bayIdx ? dragData.relIdx : st.relIdx,
                         bayB, relIdxB: bayB === dragData.bayIdx ? dragData.relIdx : st.relIdx });
      }
      setSnapHighlight([]); hideSnapBalls3D(); dragData = null;
      document.getElementById('canvas-overlay').style.opacity = '';
      buildFurniture();
      // fall through to tap-select
    }

    dragging = false;
    canvasArea.style.cursor = 'grab';
    if (wasTap && et) _tapSelect(et.clientX, et.clientY);

  } else if (remaining === 1) {
    // Dropped from two fingers to one — transition to orbit
    _pinch = null;
    if (!isDraggingSlab && !isDraggingWall) {
      const t   = e.touches[0];
      dragging  = true;
      prevMouse = { x: t.clientX, y: t.clientY };
      _touch1   = { type: 'orbit' };
    }
  }
});
