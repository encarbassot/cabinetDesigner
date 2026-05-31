'use strict';

const PROJECTS_KEY   = 'plykit_projects_v1';
const CURRENT_ID_KEY = 'plykit_current_id';
const LEGACY_KEY     = 'plykit_v1';

let currentProjectId   = null;
let currentProjectName = null;

function _getProjects() {
  try { return JSON.parse(localStorage.getItem(PROJECTS_KEY) || '[]'); } catch { return []; }
}

function _setProjects(arr) {
  try { localStorage.setItem(PROJECTS_KEY, JSON.stringify(arr)); } catch {}
}

function _currentStateSnapshot() {
  return {
    furniture:     JSON.parse(JSON.stringify(furniture)),
    pinnedTotal,
    pinnedCols:    [...pinnedCols],
    woodPresetIdx,
    slabLinks:     JSON.parse(JSON.stringify(slabLinks)),
  };
}

function _applyState(s) {
  if (!s) return;
  if (s.furniture) {
    Object.assign(furniture, s.furniture);
    furniture.columnWidths = [...s.furniture.columnWidths];
    furniture.columnSlabs  = s.furniture.columnSlabs.map(a => [...a]);
  }
  if (typeof s.pinnedTotal === 'boolean') pinnedTotal = s.pinnedTotal;
  if (Array.isArray(s.pinnedCols)) { pinnedCols.clear(); s.pinnedCols.forEach(i => pinnedCols.add(i)); }
  if (typeof s.woodPresetIdx === 'number' && s.woodPresetIdx < WOOD_PRESETS.length) {
    woodPresetIdx = s.woodPresetIdx;
    document.querySelectorAll('.wood-swatch').forEach((sw, j) => sw.classList.toggle('active', j === woodPresetIdx));
  }
  if (Array.isArray(s.slabLinks)) slabLinks = s.slabLinks;
  const ih = document.getElementById('cfg-height'); if (ih) ih.value = furniture.height;
  const id = document.getElementById('cfg-depth');  if (id) id.value = furniture.depth;
  const it = document.getElementById('cfg-thick');  if (it) it.value = furniture.thickness;
}

function _updateHeaderTitle() {
  const el = document.getElementById('hdr-project-name');
  if (!el) return;
  if (currentProjectName) {
    el.textContent = currentProjectName;
    el.style.color = '';
  } else {
    el.textContent = 'Sin guardar';
    el.style.color = '#a09488';
  }
}

let _saveTimer = null;

function _showSaveIndicator() {
  const el = document.getElementById('save-indicator');
  if (!el) return;
  el.style.opacity = '1';
  if (_saveTimer) clearTimeout(_saveTimer);
  _saveTimer = setTimeout(() => { el.style.opacity = '0'; }, 1600);
}

function saveState() {
  const projects = _getProjects();
  if (!currentProjectId) {
    const id   = 'proj_' + Date.now();
    const name = 'Proyecto ' + (projects.length + 1);
    currentProjectId   = id;
    currentProjectName = name;
    projects.push({ id, name, state: _currentStateSnapshot(), updatedAt: Date.now() });
    _setProjects(projects);
    try { localStorage.setItem(CURRENT_ID_KEY, id); } catch {}
    _updateHeaderTitle();
  } else {
    const idx = projects.findIndex(p => p.id === currentProjectId);
    if (idx < 0) return;
    projects[idx].state     = _currentStateSnapshot();
    projects[idx].updatedAt = Date.now();
    _setProjects(projects);
  }
  _showSaveIndicator();
}

function loadState() {
  const legacyRaw = localStorage.getItem(LEGACY_KEY);
  if (legacyRaw && !_getProjects().length) {
    try {
      const s  = JSON.parse(legacyRaw);
      const id = 'proj_' + Date.now();
      _setProjects([{ id, name: 'Mi proyecto', state: s, updatedAt: Date.now() }]);
      localStorage.setItem(CURRENT_ID_KEY, id);
      localStorage.removeItem(LEGACY_KEY);
    } catch {}
  }
  const savedId  = localStorage.getItem(CURRENT_ID_KEY);
  const projects = _getProjects();
  let proj = savedId ? projects.find(p => p.id === savedId) : null;
  if (!proj && projects.length) proj = projects.slice().sort((a, b) => b.updatedAt - a.updatedAt)[0];
  if (!proj) return;
  currentProjectId   = proj.id;
  currentProjectName = proj.name;
  _applyState(proj.state);
  _updateHeaderTitle();
}
