'use strict';

let selectedCabinetId = null;
let minimapVisible = localStorage.getItem('plykit_minimap') !== '0';

function toggleSidePanel() {
  document.getElementById('room-side-panel').classList.toggle('sp-collapsed');
  _syncMinimapLocation(true);
}

function toggleMinimapPanel() {
  minimapVisible = !minimapVisible;
  try { localStorage.setItem('plykit_minimap', minimapVisible ? '1' : '0'); } catch {}
  _syncMinimapLocation(true);
}

function _syncMinimapLocation(withDelay) {
  if (typeof appMode === 'undefined' || appMode !== 'room') return;
  const wrap      = document.getElementById('room-canvas-wrap');
  const slot      = document.getElementById('sp-minimap-slot');
  const section   = document.getElementById('sp-minimap-section');
  const panel     = document.getElementById('room-side-panel');
  const canvasArea = document.getElementById('canvas-area');
  if (!wrap || !slot || !panel || !canvasArea) return;

  const collapsed   = panel.classList.contains('sp-collapsed');
  const showInPanel = minimapVisible && !collapsed;
  const showOverlay = minimapVisible && collapsed;

  // Update toggle button
  const toggleBtn = document.querySelector('.sp-minimap-toggle');
  if (toggleBtn) toggleBtn.textContent = minimapVisible ? '▾' : '▸';

  // Show/hide slot
  slot.style.display = minimapVisible ? '' : 'none';

  if (showInPanel) {
    if (wrap.parentElement !== slot) {
      wrap.style.cssText = '';
      slot.appendChild(wrap);
      wrap.classList.add('sp-minimap-in-panel');
    }
    wrap.style.display = '';
  } else {
    if (wrap.parentElement !== canvasArea) {
      wrap.style.cssText = '';
      wrap.classList.remove('sp-minimap-in-panel');
      canvasArea.appendChild(wrap);
    }
    wrap.style.display = showOverlay ? '' : 'none';
  }

  const delay = withDelay ? 220 : 0;
  setTimeout(() => {
    if (typeof appMode === 'undefined' || appMode !== 'room') return;
    onResize();
    resizeRoom2d();
    if (minimapVisible) fitRoomToView();
  }, delay);
}

function initSidePanel() {
  refreshSidePanel();
}

function selectCabinet(id) {
  selectedCabinetId = (selectedCabinetId === id) ? null : id;
  refreshSidePanel();
}

function refreshSidePanel() {
  const list = document.getElementById('sp-cabinet-list');
  if (!list) return;

  const projects = _getProjects().slice().sort((a, b) => b.updatedAt - a.updatedAt);

  if (!projects.length) {
    list.innerHTML = '<div class="sp-empty">Sin muebles guardados.<br>Crea el primero con el botón +.</div>';
    return;
  }

  list.innerHTML = '';
  for (const proj of projects) {
    const f = proj.state && proj.state.furniture;
    if (!f) continue;

    const isSelected = proj.id === selectedCabinetId;
    const tw   = Math.round(totalWidth(f));
    const safe = proj.name.replace(/&/g, '&amp;').replace(/</g, '&lt;');

    const item       = document.createElement('div');
    item.className   = 'sp-item' + (isSelected ? ' sp-item--selected' : '');
    item.draggable   = true;
    item.dataset.pid = proj.id;

    item.innerHTML = `
      <div class="sp-thumb">${_makeSvg(f)}</div>
      <div class="sp-info">
        <div class="sp-name">${safe}</div>
        <div class="sp-dims">${tw}&thinsp;&times;&thinsp;${f.height}&thinsp;&times;&thinsp;${f.depth} cm</div>
      </div>
    `;

    item.addEventListener('click', () => selectCabinet(proj.id));

    item.addEventListener('dragstart', e => {
      e.dataTransfer.setData('projId', proj.id);
      e.dataTransfer.effectAllowed = 'copy';
    });

    list.appendChild(item);

    if (isSelected) {
      const infoEl = document.createElement('div');
      infoEl.className = 'sp-item-info';
      infoEl.innerHTML = `
        <div class="sp-front-thumb">${_makeFrontSvg(f)}</div>
        <div class="sp-info-dims">${tw}&thinsp;&times;&thinsp;${f.height}&thinsp;&times;&thinsp;${f.depth} cm</div>
        <div class="sp-info-actions">
          <button class="sp-place-btn" onclick="roomPlaceCabinet('${proj.id}');event.stopPropagation()">+ Sala</button>
          <button class="sp-edit-full-btn" onclick="enterCabinetEditorForProject('${proj.id}');event.stopPropagation()">Editar</button>
        </div>
      `;
      list.appendChild(infoEl);
    }
  }
}

function _makeSvg(f) {
  const tw = totalWidth(f);
  const W = 52, H = 36;
  const s  = Math.min((W - 4) / tw, (H - 4) / f.depth) * 0.92;
  const pw = tw * s, ph = f.depth * s;
  const ox = (W - pw) / 2, oy = (H - ph) / 2;

  const lines = wallXPositions(f).map(wx => {
    const lx = (ox + wx * s).toFixed(1);
    return `<line x1="${lx}" y1="${oy.toFixed(1)}" x2="${lx}" y2="${(oy + ph).toFixed(1)}" stroke="#9b8f86" stroke-width="1.2"/>`;
  }).join('');

  return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
    <rect x="${ox.toFixed(1)}" y="${oy.toFixed(1)}" width="${pw.toFixed(1)}" height="${ph.toFixed(1)}" fill="#e8d8c0" stroke="#9b8f86" stroke-width="1.4" rx="1"/>
    ${lines}
  </svg>`;
}

function _makeFrontSvg(f) {
  const tw = totalWidth(f);
  const W = 150, H = 100;
  const s  = Math.min((W - 8) / tw, (H - 8) / f.height) * 0.9;
  const pw = tw * s, ph = f.height * s;
  const ox = (W - pw) / 2, oy = (H - ph) / 2;

  const walls = wallXPositions(f).map(wx => {
    const lx = (ox + wx * s).toFixed(1);
    return `<line x1="${lx}" y1="${oy.toFixed(1)}" x2="${lx}" y2="${(oy + ph).toFixed(1)}" stroke="#9b8f86" stroke-width="1.4"/>`;
  }).join('');

  let slabLines = '';
  const bgs = bayGeometry(f);
  for (let b = 0; b < f.columnSlabs.length; b++) {
    const bx = ox + (bgs[b].xCentre - bgs[b].width / 2) * s;
    const bw = bgs[b].width * s;
    for (const cy of f.columnSlabs[b]) {
      const ly = (oy + ph - cy * s).toFixed(1);
      slabLines += `<line x1="${bx.toFixed(1)}" y1="${ly}" x2="${(bx + bw).toFixed(1)}" y2="${ly}" stroke="#9b8f86" stroke-width="1.2"/>`;
    }
  }

  return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
    <rect x="${ox.toFixed(1)}" y="${oy.toFixed(1)}" width="${pw.toFixed(1)}" height="${ph.toFixed(1)}" fill="#e8d8c0" stroke="#9b8f86" stroke-width="1.6" rx="1"/>
    ${walls}${slabLines}
  </svg>`;
}
