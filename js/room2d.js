'use strict';

let room2dCanvas = null;
let room2dCtx    = null;
let roomViewMode = '2d'; // '2d' | '3d' | 'split'

const r2d = { scale: 1.5, panX: 60, panY: 60, isPanning: false, panStart: null };
let r2dDrag     = { active: false };
let r2dSelected = null;
let _ctxMenu    = null;

function initRoom2d() {
  room2dCanvas = document.getElementById('room-canvas');
  if (!room2dCanvas) return;
  room2dCtx = room2dCanvas.getContext('2d');

  window.addEventListener('resize', _r2dOnWindowResize);
  room2dCanvas.addEventListener('mousedown',   _r2dDown);
  room2dCanvas.addEventListener('mousemove',   _r2dMove);
  room2dCanvas.addEventListener('mouseup',     _r2dUp);
  room2dCanvas.addEventListener('contextmenu', _r2dCtx);
  room2dCanvas.addEventListener('wheel',       _r2dWheel, { passive: false });
  room2dCanvas.addEventListener('dragover',    e => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; });
  room2dCanvas.addEventListener('drop',        _r2dDrop);
  room2dCanvas.addEventListener('dragleave',   () => { if (r2dDrag.fromPanel) { r2dDrag = { active: false }; drawRoom2d(); } });
}

function _r2dOnWindowResize() {
  resizeRoom2d();
  fitRoomToView();
}

function resizeRoom2d() {
  if (!room2dCanvas) return;
  const wrap = room2dCanvas.parentElement;
  if (!wrap) return;
  room2dCanvas.width  = wrap.clientWidth;
  room2dCanvas.height = wrap.clientHeight;
  drawRoom2d();
}

function fitRoomToView() {
  if (!currentRoom || !room2dCanvas) return;
  const minimap = room2dCanvas.width < 400;
  const pad = minimap ? 20 : 70;
  const sx  = (room2dCanvas.width  - 2 * pad) / currentRoom.width;
  const sy  = (room2dCanvas.height - 2 * pad) / currentRoom.depth;
  r2d.scale = Math.min(sx, sy, 4);
  r2d.panX  = (room2dCanvas.width  - currentRoom.width  * r2d.scale) / 2;
  r2d.panY  = (room2dCanvas.height - currentRoom.depth  * r2d.scale) / 2;
  drawRoom2d();
}

function _toRoom(cx, cy)  { return { x: (cx - r2d.panX) / r2d.scale, z: (cy - r2d.panY) / r2d.scale }; }
function _toCanvas(rx,rz) { return { x: rx * r2d.scale + r2d.panX,   y: rz * r2d.scale + r2d.panY   }; }

function _fMap() {
  const m = {};
  for (const p of _getProjects()) if (p.state && p.state.furniture) m[p.id] = p.state.furniture;
  return m;
}

function _getFById(id) {
  const p = _getProjects().find(p => p.id === id);
  return p && p.state ? p.state.furniture : null;
}

function _hitTest(cx, cy) {
  if (!currentRoom) return null;
  const pt = _toRoom(cx, cy);
  for (let i = currentRoom.placements.length - 1; i >= 0; i--) {
    const pl = currentRoom.placements[i];
    const f  = _getFById(pl.furnitureId);
    if (!f) continue;
    const fp = cabinetFootprint(f, pl);
    if (pt.x >= fp.x && pt.x <= fp.x + fp.w && pt.z >= fp.z && pt.z <= fp.z + fp.d) return pl;
  }
  return null;
}

function _applySnap(fp, skipId) {
  const ws = snapToWalls(currentRoom, fp);
  fp.x = ws.x; fp.z = ws.z;
  const cs = snapToCabinets(currentRoom, _fMap(), skipId, fp);
  fp.x = cs.x; fp.z = cs.z;
  const cl = clampToRoom(currentRoom, fp);
  fp.x = cl.x; fp.z = cl.z;
  return fp;
}

// ─── Events ───────────────────────────────────────────────────────────────────

function _r2dDown(e) {
  if (e.button === 1) {
    r2d.isPanning = true;
    r2d.panStart  = { x: e.offsetX - r2d.panX, y: e.offsetY - r2d.panY };
    return;
  }
  if (e.button === 2) return;

  const cornerHit = _hitCorner(e.offsetX, e.offsetY);
  if (cornerHit) {
    const { pl } = cornerHit;
    const f  = _getFById(pl.furnitureId);
    const fp = cabinetFootprint(f, pl);
    const centerRoom   = { x: fp.x + fp.w / 2, z: fp.z + fp.d / 2 };
    const centerCanvas = _toCanvas(centerRoom.x, centerRoom.z);
    r2dSelected = pl.id;
    r2dDrag = {
      active: true, fromPanel: false, type: 'rotate',
      placementId: pl.id, furnitureId: pl.furnitureId,
      centerRoom, centerCanvas,
      ghostRotation: pl.rotation,
      ghostFp: { ...fp },
    };
    drawRoom2d();
    return;
  }

  const pl = _hitTest(e.offsetX, e.offsetY);
  if (pl) {
    r2dSelected = pl.id;
    const f  = _getFById(pl.furnitureId);
    const fp = cabinetFootprint(f, pl);
    const pt = _toRoom(e.offsetX, e.offsetY);
    r2dDrag = {
      active: true, fromPanel: false,
      placementId: pl.id, furnitureId: pl.furnitureId,
      rotation: pl.rotation,
      ghostFp: { ...fp },
      ox: pt.x - fp.x, oz: pt.z - fp.z,
    };
  } else {
    r2dSelected   = null;
    r2d.isPanning = true;
    r2d.panStart  = { x: e.offsetX - r2d.panX, y: e.offsetY - r2d.panY };
  }
  drawRoom2d();
}

function _r2dMove(e) {
  if (r2d.isPanning && r2d.panStart) {
    r2d.panX = e.offsetX - r2d.panStart.x;
    r2d.panY = e.offsetY - r2d.panStart.y;
    drawRoom2d();
    return;
  }
  if (r2dDrag.active && r2dDrag.type === 'rotate') {
    const dx = e.offsetX - r2dDrag.centerCanvas.x;
    const dy = e.offsetY - r2dDrag.centerCanvas.y;
    const rawAngle = Math.atan2(dy, dx) * 180 / Math.PI;
    const nearest90  = Math.round(rawAngle / 90) * 90;
    const displayAng = (Math.abs(rawAngle - nearest90) < 12) ? nearest90 : rawAngle;
    const freeRot    = ((displayAng % 360) + 360) % 360;
    const snap90     = ((nearest90 % 360) + 360) % 360;
    r2dDrag.ghostRotation = freeRot;
    const f = _getFById(r2dDrag.furnitureId);
    if (f) {
      const tw = totalWidth(f), fd = f.depth;
      const newW = (snap90 === 0 || snap90 === 180) ? tw : fd;
      const newD = (snap90 === 0 || snap90 === 180) ? fd : tw;
      r2dDrag.ghostFp = {
        x: r2dDrag.centerRoom.x - newW / 2,
        z: r2dDrag.centerRoom.z - newD / 2,
        w: newW, d: newD,
      };
      if (roomViewMode !== '2d') moveCabinetGroupInScene(r2dDrag.placementId, r2dDrag.ghostFp, freeRot);
    }
    drawRoom2d();
    return;
  }
  if (!r2dDrag.active) {
    room2dCanvas.style.cursor = _hitCorner(e.offsetX, e.offsetY) ? 'grab' : '';
    return;
  }

  const pt = _toRoom(e.offsetX, e.offsetY);
  const f  = _getFById(r2dDrag.furnitureId);
  if (!f) return;

  const fp = { ...r2dDrag.ghostFp, x: pt.x - r2dDrag.ox, z: pt.z - r2dDrag.oz };
  _applySnap(fp, r2dDrag.placementId);
  r2dDrag.ghostFp = fp;
  if (roomViewMode !== '2d') moveCabinetGroupInScene(r2dDrag.placementId, fp, r2dDrag.rotation || 0);
  drawRoom2d();
}

function _r2dUp(e) {
  if (r2d.isPanning) { r2d.isPanning = false; r2d.panStart = null; return; }
  if (!r2dDrag.active) return;

  if (r2dDrag.type === 'rotate') {
    const f = _getFById(r2dDrag.furnitureId);
    if (f) {
      const rot = r2dDrag.ghostRotation;
      const tw = totalWidth(f), fd = f.depth;
      const newW = (rot === 0 || rot === 180) ? tw : fd;
      const newD = (rot === 0 || rot === 180) ? fd : tw;
      const newX = r2dDrag.centerRoom.x - newW / 2;
      const newZ = r2dDrag.centerRoom.z - newD / 2;
      let r = setPlacementRotation(currentRoom, r2dDrag.placementId, rot);
      currentRoom = movePlacement(r, r2dDrag.placementId, newX, newZ);
      saveCurrentRoom();
      if (roomViewMode !== '2d') buildRoomScene();
    }
    r2dDrag = { active: false };
    drawRoom2d();
    return;
  }

  if (r2dDrag.placementId && !r2dDrag.fromPanel) {
    currentRoom = movePlacement(currentRoom, r2dDrag.placementId, r2dDrag.ghostFp.x, r2dDrag.ghostFp.z);
    saveCurrentRoom();
    if (roomViewMode !== '2d') buildRoomScene();
  }
  r2dDrag = { active: false };
  drawRoom2d();
}

function _r2dCtx(e) {
  e.preventDefault();
  const pl = _hitTest(e.offsetX, e.offsetY);
  if (pl) _showCtxMenu(e.clientX, e.clientY, pl);
}

function _r2dWheel(e) {
  e.preventDefault();
  const f  = e.deltaY > 0 ? 0.88 : 1.14;
  r2d.panX  = e.offsetX - (e.offsetX - r2d.panX) * f;
  r2d.panY  = e.offsetY - (e.offsetY - r2d.panY) * f;
  r2d.scale = Math.max(0.2, Math.min(25, r2d.scale * f));
  drawRoom2d();
}

function _r2dDrop(e) {
  e.preventDefault();
  const projId = e.dataTransfer.getData('projId');
  if (!projId || !currentRoom) return;
  const f = _getFById(projId);
  if (!f) return;
  const tw = totalWidth(f);
  const pt = _toRoom(e.offsetX, e.offsetY);
  const fp = { x: pt.x - tw / 2, z: pt.z - f.depth / 2, w: tw, d: f.depth };
  _applySnap(fp, null);
  currentRoom = addPlacement(currentRoom, projId, fp.x, fp.z, 0);
  saveCurrentRoom();
  r2dDrag = { active: false };
  drawRoom2d();
  if (roomViewMode !== '2d') buildRoomScene();
}

function _showCtxMenu(cx, cy, pl) {
  if (_ctxMenu) { _ctxMenu.remove(); _ctxMenu = null; }
  const menu = document.createElement('div');
  menu.className = 'r2d-ctx-menu';
  menu.style.left = cx + 'px';
  menu.style.top  = cy + 'px';

  const items = [
    { label: '↻ Rotar 90°', fn: () => {
        currentRoom = rotatePlacement(currentRoom, pl.id);
        saveCurrentRoom(); drawRoom2d();
        if (roomViewMode !== '2d') buildRoomScene();
    }},
    { label: '✎ Editar mueble', fn: () => enterCabinetEditorForPlacement(pl) },
    { label: '✕ Eliminar', danger: true, fn: () => {
        currentRoom = removePlacement(currentRoom, pl.id);
        r2dSelected = null; saveCurrentRoom(); drawRoom2d();
        if (roomViewMode !== '2d') buildRoomScene();
    }},
  ];
  for (const it of items) {
    const btn = document.createElement('button');
    btn.textContent = it.label;
    if (it.danger) btn.className = 'danger';
    btn.onclick = () => { menu.remove(); _ctxMenu = null; it.fn(); };
    menu.appendChild(btn);
  }
  document.body.appendChild(menu);
  _ctxMenu = menu;
  setTimeout(() => document.addEventListener('click', () => { if (_ctxMenu) { _ctxMenu.remove(); _ctxMenu = null; } }, { once: true }), 0);
}

// Called from side panel "+" button to place at room center
function roomPlaceCabinet(projId) {
  if (!currentRoom) return;
  const f = _getFById(projId);
  if (!f) return;
  const tw = totalWidth(f);
  let fp = {
    x: currentRoom.width  / 2 - tw    / 2,
    z: 0,
    w: tw, d: f.depth,
  };
  fp = _applySnap(fp, null);
  currentRoom = addPlacement(currentRoom, projId, fp.x, fp.z, 0);
  saveCurrentRoom();
  r2dSelected = currentRoom.placements[currentRoom.placements.length - 1].id;
  drawRoom2d();
  if (roomViewMode !== '2d') buildRoomScene();
}

// ─── Drawing ──────────────────────────────────────────────────────────────────

function drawRoom2d() {
  if (!room2dCtx || !room2dCanvas) return;
  const ctx = room2dCtx;
  const W = room2dCanvas.width, H = room2dCanvas.height;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#f0ebe5';
  ctx.fillRect(0, 0, W, H);

  if (!currentRoom) {
    ctx.fillStyle = '#b0a49a';
    ctx.font = '14px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText('Configura la sala para empezar →', W / 2, H / 2);
    return;
  }

  _drawBgGrid(ctx, W, H);

  const ro = _toCanvas(0, 0);
  const rw = currentRoom.width  * r2d.scale;
  const rd = currentRoom.depth  * r2d.scale;

  // Floor
  ctx.fillStyle = '#faf7f4';
  ctx.fillRect(ro.x, ro.y, rw, rd);

  // In-room grid
  ctx.save();
  ctx.beginPath(); ctx.rect(ro.x, ro.y, rw, rd); ctx.clip();
  _drawRoomGrid(ctx, ro, rw, rd);
  ctx.restore();

  // Walls
  ctx.strokeStyle = '#2a2520';
  ctx.lineWidth = 7;
  ctx.strokeRect(ro.x, ro.y, rw, rd);

  // Dimension labels
  _drawRoomDims(ctx, ro, rw, rd);

  // Placed cabinets
  for (const pl of currentRoom.placements) {
    const f = _getFById(pl.furnitureId);
    if (!f) continue;
    const isDragging = r2dDrag.active && r2dDrag.placementId === pl.id;
    if (isDragging) continue;
    _drawCabinet(ctx, f, pl, pl.id === r2dSelected);
  }

  // Ghost
  if (r2dDrag.active && r2dDrag.ghostFp) {
    const f = _getFById(r2dDrag.furnitureId);
    if (f) _drawGhost(ctx, f, r2dDrag.ghostFp, r2dDrag.ghostRotation !== undefined ? r2dDrag.ghostRotation : (r2dDrag.rotation || 0));
  }
}

// ─── Corner rotation handles ──────────────────────────────────────────────────

function _cornerHandles(f, pl) {
  const tw  = totalWidth(f);
  const fd  = f.depth;
  const fp  = cabinetFootprint(f, pl);
  const cc  = _toCanvas(fp.x + fp.w / 2, fp.z + fp.d / 2);
  const ang = pl.rotation * Math.PI / 180;
  const hw  = (tw / 2) * r2d.scale;
  const hd  = (fd / 2) * r2d.scale;
  const cos = Math.cos(ang), sin = Math.sin(ang);
  return [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]].map(([lx, ly]) => ({
    x: cc.x + lx * cos - ly * sin,
    y: cc.y + lx * sin + ly * cos,
  }));
}

function _hitCorner(cx, cy) {
  if (!currentRoom) return null;
  const R = 10;
  for (let i = currentRoom.placements.length - 1; i >= 0; i--) {
    const pl = currentRoom.placements[i];
    const f  = _getFById(pl.furnitureId);
    if (!f) continue;
    const hs = _cornerHandles(f, pl);
    for (let j = 0; j < hs.length; j++) {
      if (Math.hypot(cx - hs[j].x, cy - hs[j].y) < R) return { pl, cornerIdx: j };
    }
  }
  return null;
}

function _drawBgGrid(ctx, W, H) {
  const step = 50 * r2d.scale;
  if (step < 8) return;
  ctx.strokeStyle = 'rgba(0,0,0,0.04)';
  ctx.lineWidth = 0.5;
  const ox = ((r2d.panX % step) + step) % step;
  const oy = ((r2d.panY % step) + step) % step;
  for (let x = ox; x < W; x += step) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
  for (let y = oy; y < H; y += step) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
}

function _drawRoomGrid(ctx, ro, rw, rd) {
  const step = 100 * r2d.scale;
  if (step < 15) return;
  ctx.strokeStyle = 'rgba(0,0,0,0.07)';
  ctx.lineWidth = 0.5;
  for (let x = step; x < rw; x += step) { ctx.beginPath(); ctx.moveTo(ro.x + x, ro.y); ctx.lineTo(ro.x + x, ro.y + rd); ctx.stroke(); }
  for (let y = step; y < rd; y += step) { ctx.beginPath(); ctx.moveTo(ro.x, ro.y + y); ctx.lineTo(ro.x + rw, ro.y + y); ctx.stroke(); }
}

function _drawRoomDims(ctx, ro, rw, rd) {
  if (r2d.scale < 0.4 || roomViewMode === 'split') return;
  ctx.fillStyle = '#9b8f86';
  ctx.font = '11px system-ui';
  ctx.textAlign = 'center';
  ctx.fillText(currentRoom.width + ' cm', ro.x + rw / 2, ro.y - 10);
  ctx.save();
  ctx.translate(ro.x - 10, ro.y + rd / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText(currentRoom.depth + ' cm', 0, 0);
  ctx.restore();
}

function _drawCabinet(ctx, f, pl, isSelected) {
  const tw = totalWidth(f);
  const fd = f.depth;
  const fp = cabinetFootprint(f, pl);
  const cc = _toCanvas(fp.x + fp.w / 2, fp.z + fp.d / 2);

  ctx.save();
  ctx.translate(cc.x, cc.y);
  ctx.rotate(pl.rotation * Math.PI / 180);

  const W = tw * r2d.scale;
  const D = fd * r2d.scale;

  ctx.fillStyle = isSelected ? '#fde8de' : '#e8d8c0';
  ctx.fillRect(-W / 2, -D / 2, W, D);

  // Wall dividers
  const walls = wallXPositions(f);
  ctx.strokeStyle = 'rgba(120,100,80,0.55)';
  ctx.lineWidth = 1;
  for (const wx of walls) {
    const lx = -W / 2 + (wx / tw) * W;
    ctx.beginPath(); ctx.moveTo(lx, -D / 2); ctx.lineTo(lx, D / 2); ctx.stroke();
  }

  ctx.strokeStyle = isSelected ? '#b84020' : '#7a6a5a';
  ctx.lineWidth   = isSelected ? 2 : 1.5;
  ctx.strokeRect(-W / 2, -D / 2, W, D);

  // Front face thick line
  ctx.strokeStyle = isSelected ? '#b84020' : '#4a3a2a';
  ctx.lineWidth = 3.5;
  ctx.beginPath();
  ctx.moveTo(-W / 2, D / 2); ctx.lineTo(W / 2, D / 2);
  ctx.stroke();

  ctx.restore();

  if (isSelected) {
    const hs = _cornerHandles(f, pl);
    for (const h of hs) {
      ctx.beginPath();
      ctx.arc(h.x, h.y, 5, 0, Math.PI * 2);
      ctx.fillStyle = '#fff';
      ctx.fill();
      ctx.strokeStyle = '#b84020';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }
}

function _drawGhost(ctx, f, fp, rotation) {
  const tw = totalWidth(f);
  const fd = f.depth;
  const cc = _toCanvas(fp.x + fp.w / 2, fp.z + fp.d / 2);

  ctx.save();
  ctx.translate(cc.x, cc.y);
  ctx.rotate(rotation * Math.PI / 180);

  const W = tw * r2d.scale;
  const D = fd * r2d.scale;

  ctx.fillStyle = 'rgba(184,64,32,0.10)';
  ctx.fillRect(-W / 2, -D / 2, W, D);
  ctx.strokeStyle = '#b84020';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([4, 4]);
  ctx.strokeRect(-W / 2, -D / 2, W, D);
  ctx.setLineDash([]);
  ctx.restore();
}
