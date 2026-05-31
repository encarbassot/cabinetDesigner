'use strict';

const lockedDimensions = { height: false, width: false, depth: false };

function openCfgModal(showCancel = false) {
  const f = furniture;
  document.getElementById('cfg-height').value = f.height;
  document.getElementById('cfg-width').value  = Math.round(usableWidth(f));
  document.getElementById('cfg-depth').value  = f.depth;
  document.getElementById('cfg-thick').value  = f.thickness;
  const cancelBtn = document.getElementById('cfg-cancel-btn');
  if (cancelBtn) cancelBtn.style.display = showCancel ? '' : 'none';
  document.getElementById('cfg-modal-backdrop').style.display = 'flex';
}

function closeCfgModal() {
  document.getElementById('cfg-modal-backdrop').style.display = 'none';
}

function applyCfgModal() {
  const f = furniture;
  if (!lockedDimensions.height)
    f.height    = Math.max(30,  parseFloat(document.getElementById('cfg-height').value) || 200);
  if (!lockedDimensions.depth)
    f.depth     = Math.max(5,   parseFloat(document.getElementById('cfg-depth').value)  || 32);
  f.thickness   = Math.max(0.3, parseFloat(document.getElementById('cfg-thick').value)  || 1.8);
  if (!lockedDimensions.width) {
    const newW = Math.max(20, parseFloat(document.getElementById('cfg-width').value) || 130);
    applyGlobalWidth(newW, true);
  }
  buildFurniture();
  closeCfgModal();
}

function toggleCfgLock(dim) {
  lockedDimensions[dim] = !lockedDimensions[dim];
  const btn = document.getElementById('cfg-lock-' + dim);
  const inp = document.getElementById('cfg-' + dim);
  const locked = lockedDimensions[dim];
  btn.classList.toggle('locked', locked);
  btn.title = locked ? 'Desbloquear' : 'Bloquear';
  inp.disabled = locked;
  btn.querySelector('svg').innerHTML = locked
    ? '<rect x="2" y="7" width="10" height="8" rx="1.5"/><path d="M4.5 7V4.5a2.5 2.5 0 0 1 5 0V7"/>'
    : '<rect x="2" y="7" width="10" height="8" rx="1.5"/><path d="M4.5 7V4a2.5 2.5 0 0 1 5 0"/>';
}

document.getElementById('cfg-modal-backdrop').addEventListener('click', e => {
  if (e.target === e.currentTarget) closeCfgModal();
});
