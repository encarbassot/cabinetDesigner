'use strict';

let slabLinks      = [];
let lockBtnData    = [];
let snapHighlightMeshes = [];
const SNAP_THRESH  = 10;  // cm

function getSlabAbsY(f, bay, relIdx) {
  const rels = f.columnSlabs[bay];
  let y = 0;
  for (let i = 0; i <= relIdx; i++) y += rels[i];
  return y;
}

function setSnapHighlight(meshes) {
  for (const m of snapHighlightMeshes) {
    if (m !== selectedMesh) {
      m.material.emissive.set(0x000000);
      m.material.emissiveIntensity = 0;
    }
  }
  snapHighlightMeshes = (meshes && meshes.length) ? meshes : [];
  for (const m of snapHighlightMeshes) {
    m.material.emissive.setHex(0xdd7700);
    m.material.emissiveIntensity = 0.40;
  }
}

function buildLockButtons() {
  for (const item of lockBtnData) item.btn.remove();
  lockBtnData = [];
  const f      = furniture;
  const offX   = totalWidth(f) / 2;
  const walls  = wallXPositions(f);
  const overlay = document.getElementById('canvas-overlay');
  for (let li = 0; li < slabLinks.length; li++) {
    const lk      = slabLinks[li];
    const absY    = getSlabAbsY(f, lk.bayA, lk.relIdxA);
    const wallIdx = lk.bayA + 1;
    const btn = document.createElement('button');
    btn.className   = 'ov-btn ov-lock';
    btn.textContent = '⊟';
    btn.title       = 'Desanclar baldas';
    const _li = li;
    btn.addEventListener('click', e => { e.stopPropagation(); unlinkSlabs(_li); });
    overlay.appendChild(btn);
    lockBtnData.push({
      btn,
      wx: (walls[wallIdx] - offX) * CM,
      wy: (absY + f.thickness / 2) * CM,
      wz: (f.depth / 2) * CM,
      dy: 0,
    });
  }
}

function positionLockButtons() {
  if (!lockBtnData.length) return;
  const el = renderer.domElement;
  const w  = el.clientWidth, h = el.clientHeight;
  for (const item of lockBtnData) {
    const v  = new THREE.Vector3(item.wx, item.wy, item.wz).project(camera);
    const sx = (v.x + 1) / 2 * w;
    const sy = -(v.y - 1) / 2 * h;
    const ok = v.z < 1 && sx > 10 && sx < w - 10 && sy > 0 && sy < h;
    item.btn.style.left       = sx + 'px';
    item.btn.style.top        = sy + 'px';
    item.btn.style.visibility = ok ? 'visible' : 'hidden';
  }
}

function unlinkSlabs(li) {
  slabLinks.splice(li, 1);
  buildLockButtons();
  saveState();
}

function getLinkedChain(bayIdx, relIdx) {
  const visited = new Set([`${bayIdx}:${relIdx}`]);
  const queue   = [{ bay: bayIdx, relIdx }];
  const result  = [];
  while (queue.length) {
    const cur = queue.shift();
    for (const lk of slabLinks) {
      let partnerBay = -1, partnerRi = -1;
      if (lk.bayA === cur.bay && lk.relIdxA === cur.relIdx) { partnerBay = lk.bayB; partnerRi = lk.relIdxB; }
      if (lk.bayB === cur.bay && lk.relIdxB === cur.relIdx) { partnerBay = lk.bayA; partnerRi = lk.relIdxA; }
      if (partnerBay < 0) continue;
      const key = `${partnerBay}:${partnerRi}`;
      if (visited.has(key)) continue;
      visited.add(key);
      result.push({ bay: partnerBay, relIdx: partnerRi });
      queue.push({ bay: partnerBay, relIdx: partnerRi });
    }
  }
  return result;
}
