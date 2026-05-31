'use strict';

function toggleSidePanel() {
  document.getElementById('room-side-panel').classList.toggle('sp-collapsed');
  setTimeout(() => {
    if (typeof appMode !== 'undefined' && appMode === 'room') {
      onResize();
      resizeRoom2d();
      fitRoomToView();
    }
  }, 220);
}

function initSidePanel() {
  refreshSidePanel();
}

function refreshSidePanel() {
  const list = document.getElementById('sp-cabinet-list');
  if (!list) return;

  const projects = _getProjects().slice().sort((a, b) => b.updatedAt - a.updatedAt);

  if (!projects.length) {
    list.innerHTML = '<div class="sp-empty">Sin muebles guardados.<br>Créalos en el Editor.</div>';
    return;
  }

  list.innerHTML = '';
  for (const proj of projects) {
    const f = proj.state && proj.state.furniture;
    if (!f) continue;

    const item       = document.createElement('div');
    item.className   = 'sp-item';
    item.draggable   = true;
    item.dataset.pid = proj.id;

    const tw   = Math.round(totalWidth(f));
    const safe = proj.name.replace(/&/g, '&amp;').replace(/</g, '&lt;');

    item.innerHTML = `
      <div class="sp-thumb">${_makeSvg(f)}</div>
      <div class="sp-info">
        <div class="sp-name">${safe}</div>
        <div class="sp-dims">${tw}&thinsp;&times;&thinsp;${f.height}&thinsp;&times;&thinsp;${f.depth} cm</div>
      </div>
      <button class="sp-add-btn" title="Añadir a sala">+</button>
    `;

    item.querySelector('.sp-add-btn').addEventListener('click', e => {
      e.stopPropagation();
      roomPlaceCabinet(proj.id);
    });

    item.addEventListener('dragstart', e => {
      e.dataTransfer.setData('projId', proj.id);
      e.dataTransfer.effectAllowed = 'copy';
    });

    list.appendChild(item);
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
