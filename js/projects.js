'use strict';

let _projectsExpanded = false;

function renderFileMenu() {
  const projects = _getProjects().slice().sort((a, b) => b.updatedAt - a.updatedAt);

  let projHtml = '';
  if (projects.length) {
    for (const proj of projects) {
      const active   = proj.id === currentProjectId;
      const safeName = proj.name.replace(/&/g, '&amp;').replace(/</g, '&lt;');
      projHtml +=
        `<div class="proj-item${active ? ' proj-active' : ''}">` +
        `<button class="proj-open-btn" onclick="openProject('${proj.id}')">` +
        `<span class="proj-dot"></span><span class="proj-name">${safeName}</span></button>` +
        `<button class="proj-del-btn" onclick="deleteProject('${proj.id}')" title="Eliminar">×</button>` +
        `</div>`;
    }
  } else {
    projHtml = '<div style="padding:8px 18px;font-size:12px;color:#c0b8b0">Sin proyectos guardados</div>';
  }

  const arrow = _projectsExpanded ? '▾' : '▸';
  let html = '';
  html += `<button onclick="renameCurrentProject()">✎ &nbsp;Renombrar...</button>`;
  html += `<button onclick="newProject()">+ &nbsp;Nuevo proyecto</button>`;
  html += '<div class="menu-sep"></div>';
  html += `<button onclick="toggleProjectsPanel(event)">Proyectos &nbsp;<span id="proj-arrow">${arrow}</span></button>`;
  html += `<div id="projects-panel" style="display:${_projectsExpanded ? 'block' : 'none'}">${projHtml}</div>`;
  html += '<div class="menu-sep"></div>';
  html += `<button onclick="downloadProject()">↓ &nbsp;Exportar JSON</button>`;
  html += `<button onclick="document.getElementById('upload-input').click()">↑ &nbsp;Importar JSON</button>`;
  html += `<input type="file" id="upload-input" accept=".json" style="display:none" onchange="uploadProject(this)">`;

  document.getElementById('file-menu').innerHTML = html;
}

function toggleProjectsPanel(e) {
  if (e) e.stopPropagation();
  _projectsExpanded = !_projectsExpanded;
  const panel = document.getElementById('projects-panel');
  const arrow = document.getElementById('proj-arrow');
  if (panel) panel.style.display = _projectsExpanded ? 'block' : 'none';
  if (arrow) arrow.textContent = _projectsExpanded ? '▾' : '▸';
}

function toggleFileMenu(e) {
  e.stopPropagation();
  const menu = document.getElementById('file-menu');
  if (!menu.classList.contains('open')) renderFileMenu();
  menu.classList.toggle('open');
}

function closeFileMenu() {
  document.getElementById('file-menu').classList.remove('open');
}
document.addEventListener('click', closeFileMenu);

function renameCurrentProject() {
  if (!currentProjectId) { closeFileMenu(); return; }
  const name = window.prompt('Renombrar proyecto:', currentProjectName);
  if (name === null || !name.trim()) return;
  currentProjectName = name.trim();
  const projects = _getProjects();
  const idx = projects.findIndex(p => p.id === currentProjectId);
  if (idx >= 0) { projects[idx].name = currentProjectName; _setProjects(projects); }
  _updateHeaderTitle();
  closeFileMenu();
}

function openProject(id) {
  if (currentProjectId) saveState();
  const proj = _getProjects().find(p => p.id === id);
  if (!proj) return;
  currentProjectId   = proj.id;
  currentProjectName = proj.name;
  _applyState(proj.state);
  try { localStorage.setItem(CURRENT_ID_KEY, id); } catch {}
  _updateHeaderTitle();
  openCfgModal(false);
  closeFileMenu();
}

function newProject() {
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
  _updateHeaderTitle();
  openCfgModal(false);
  closeFileMenu();
}

function deleteProject(id) {
  const projects = _getProjects();
  const proj = projects.find(p => p.id === id);
  if (!proj) return;
  if (!confirm('¿Eliminar "' + proj.name + '"?\nEsta acción no se puede deshacer.')) return;
  _setProjects(projects.filter(p => p.id !== id));
  if (currentProjectId === id) {
    currentProjectId   = null;
    currentProjectName = null;
    try { localStorage.removeItem(CURRENT_ID_KEY); } catch {}
    _updateHeaderTitle();
  }
  renderFileMenu();
}

function downloadProject() {
  const data = _currentStateSnapshot();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  const name = (currentProjectName || 'plykit-project').replace(/[^a-z0-9_\-]/gi, '-');
  a.href = url; a.download = name + '.json'; a.click();
  URL.revokeObjectURL(url);
  closeFileMenu();
}

function uploadProject(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    try {
      const s    = JSON.parse(ev.target.result);
      const name = window.prompt('Nombre del proyecto importado:', file.name.replace(/\.json$/i, ''));
      if (name === null) { input.value = ''; return; }
      const id = 'proj_' + Date.now();
      currentProjectId   = id;
      currentProjectName = name.trim() || file.name;
      const projects = _getProjects();
      projects.push({ id, name: currentProjectName, state: s, updatedAt: Date.now() });
      _setProjects(projects);
      try { localStorage.setItem(CURRENT_ID_KEY, id); } catch {}
      _applyState(s);
      _updateHeaderTitle();
      buildFurniture();
    } catch { alert('Archivo inválido'); }
    input.value = '';
  };
  reader.readAsText(file);
  closeFileMenu();
}
