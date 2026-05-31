'use strict';

// ─── Mode switching ────────────────────────────────────────────────────────────

function enterRoomMode() {
  appMode = 'room';
  try { localStorage.setItem('plykit_appmode', 'room'); } catch {}
  document.getElementById('room-side-panel').style.display = '';
  document.getElementById('room-toolbar').style.display    = 'flex';
  document.getElementById('action-row').style.display      = 'none';
  document.getElementById('editor-back-btn').style.display = 'none';

  document.querySelectorAll('.hdr-view-btn').forEach(b => b.classList.remove('active'));

  if (!currentRoom) currentRoom = loadSavedRoom() || createRoom(400, 300, 250);
  refreshSidePanel();
  setRoomViewMode(roomViewMode || '3d');
}

function enterCabinetMode() {
  appMode = 'cabinet';
  try { localStorage.setItem('plykit_appmode', 'cabinet'); } catch {}
  document.getElementById('room-side-panel').style.display = 'none';
  document.getElementById('room-toolbar').style.display    = 'none';
  document.getElementById('action-row').style.display      = '';
  document.getElementById('editor-back-btn').style.display = 'none';

  clearRoomScene();
  document.getElementById('room-canvas-wrap').style.display = 'none';
  document.getElementById('canvas-area').style.display = '';
  document.getElementById('canvas-area').style.flex    = '';
  setView(activeView || '3d');
}

function setRoomViewMode(mode) {
  if (mode === 'split') mode = '3d'; // split replaced by panel minimap
  roomViewMode = mode;
  try { localStorage.setItem('plykit_roomview', mode); } catch {}
  const area2d  = document.getElementById('room-canvas-wrap');
  const area3d  = document.getElementById('canvas-area');
  const plan    = document.getElementById('view-2d');

  plan.style.display = 'none';
  document.getElementById('rv-btn-2d').classList.toggle('active', mode === '2d');
  document.getElementById('rv-btn-3d').classList.toggle('active', mode === '3d');

  if (mode === '2d') {
    // Move canvas back to canvas-area if it's in the panel
    if (area2d.parentElement !== area3d) {
      area3d.appendChild(area2d);
      area2d.classList.remove('sp-minimap-in-panel');
    }
    area3d.style.display = '';
    area3d.style.flex    = '1';
    area2d.style.cssText = 'position:absolute; inset:0; width:100%; height:100%; border-radius:0; box-shadow:none;';
    resizeRoom2d();
    fitRoomToView();
  } else if (mode === '3d') {
    area3d.style.display = '';
    area3d.style.flex    = '1';
    buildRoomScene();
    onResize();
    if (typeof _syncMinimapLocation === 'function') _syncMinimapLocation(false);
    else area2d.style.display = 'none';
  }
}

function enterCabinetEditorForProject(id) {
  const proj = _getProjects().find(p => p.id === id);
  if (!proj) return;

  appMode = 'cabinet';
  document.getElementById('room-side-panel').style.display = 'none';
  document.getElementById('room-toolbar').style.display    = 'none';
  document.getElementById('action-row').style.display      = '';
  document.getElementById('editor-back-btn').style.display = '';
  document.getElementById('room-canvas-wrap').style.display = 'none';

  clearRoomScene();

  if (currentProjectId) saveState();
  currentProjectId   = proj.id;
  currentProjectName = proj.name;
  _applyState(proj.state);
  try { localStorage.setItem(CURRENT_ID_KEY, proj.id); } catch {}
  _updateHeaderTitle();
  buildFurniture();

  setView('3d');
}

function enterCabinetEditorForPlacement(pl) {
  enterCabinetEditorForProject(pl.furnitureId);
}

function newCabinetFromRoom() {
  if (currentProjectId) saveState();
  Object.assign(furniture, { height: 200, depth: 32, thickness: 1.8 });
  furniture.columnWidths = [40, 50, 40];
  furniture.columnSlabs  = [[60, 60], [80], [40, 80]];
  pinnedTotal = false;
  pinnedCols.clear();
  slabLinks   = [];
  woodPresetIdx = 1;
  document.querySelectorAll('.wood-swatch').forEach((sw, j) => sw.classList.toggle('active', j === 1));
  currentProjectId   = null;
  currentProjectName = null;
  try { localStorage.removeItem(CURRENT_ID_KEY); } catch {}

  appMode = 'cabinet';
  document.getElementById('room-side-panel').style.display = 'none';
  document.getElementById('room-toolbar').style.display    = 'none';
  document.getElementById('action-row').style.display      = '';
  document.getElementById('editor-back-btn').style.display = '';
  document.getElementById('room-canvas-wrap').style.display = 'none';
  clearRoomScene();

  _updateHeaderTitle();
  openCfgModal(false);
  setView('3d');
}

function backToRoom() {
  saveState();
  enterRoomMode();
}

// ─── Room config modal ─────────────────────────────────────────────────────────

function openRoomCfgModal() {
  if (currentRoom) {
    document.getElementById('rcfg-name').value   = currentRoom.name;
    document.getElementById('rcfg-width').value  = currentRoom.width;
    document.getElementById('rcfg-depth').value  = currentRoom.depth;
    document.getElementById('rcfg-height').value = currentRoom.wallHeight;
  }
  document.getElementById('room-cfg-backdrop').style.display = 'flex';
}

function closeRoomCfgModal() {
  document.getElementById('room-cfg-backdrop').style.display = 'none';
}

function applyRoomCfg() {
  const width  = Math.max(100, parseFloat(document.getElementById('rcfg-width').value)  || 400);
  const depth  = Math.max(100, parseFloat(document.getElementById('rcfg-depth').value)  || 300);
  const height = Math.max(150, parseFloat(document.getElementById('rcfg-height').value) || 250);
  const name   = document.getElementById('rcfg-name').value.trim() || 'Mi habitación';

  if (!currentRoom) currentRoom = createRoom(width, depth, height);
  else currentRoom = { ...currentRoom, width, depth, wallHeight: height, name };

  saveCurrentRoom();
  closeRoomCfgModal();
  fitRoomToView();
  drawRoom2d();
  if (roomViewMode !== '2d') buildRoomScene();
}

// ─── Animate + init ────────────────────────────────────────────────────────────

(function initCanvasTip() {
  const tip     = document.getElementById('canvas-tooltip');
  const buttons = document.querySelectorAll('[data-canvas-tip]');
  function syncTip() {
    const active = [...buttons].find(b => b.classList.contains('active'));
    if (active) { tip.innerHTML = active.dataset.canvasTip; tip.classList.add('visible'); }
    else         { tip.classList.remove('visible'); }
  }
  buttons.forEach(btn => new MutationObserver(syncTip).observe(btn, { attributes: true, attributeFilter: ['class'] }));
})();

(function animate() {
  requestAnimationFrame(animate);
  renderer.render(scene, camera);
  if (appMode === 'cabinet') {
    positionOverlayButtons();
    positionLockButtons();
    positionCompartmentLabel();
  }
})();

loadState();

(function syncInputs() {
  const f = furniture;
  const ih = document.getElementById('cfg-height'); if (ih) ih.value = f.height;
  const id = document.getElementById('cfg-depth');  if (id) id.value = f.depth;
  const it = document.getElementById('cfg-thick');  if (it) it.value = f.thickness;
  const iw = document.getElementById('cfg-width');  if (iw) iw.value = Math.round(usableWidth(f));
})();

const _savedView     = localStorage.getItem('plykit_view');
const _savedRoomView = localStorage.getItem('plykit_roomview');
const _savedMode     = localStorage.getItem('plykit_appmode');
if (_savedView)     activeView   = _savedView;
if (_savedRoomView) roomViewMode = _savedRoomView;

initRoom2d();

buildFurniture();
enterRoomMode();
