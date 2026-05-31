'use strict';

let allMeshes        = [];
let selectedMesh     = null;
let selectedBay      = -1;
let overlayBtnData   = [];
let coverData        = [];
let hitPlanes        = [];
let hoveredCoverIdx  = -1;
let _mouseScreenX    = -9999;
let _mouseScreenY    = -9999;
let _camReady        = false;
window.addEventListener('mousemove', e => { _mouseScreenX = e.clientX; _mouseScreenY = e.clientY; }, { passive: true });

function buildFurniture() {
  while (furnitureGroup.children.length) {
    const o = furnitureGroup.children[0];
    if (o.geometry) o.geometry.dispose();
    if (o.material) { o.material.dispose(); }
    furnitureGroup.remove(o);
  }
  allMeshes    = [];
  selectedMesh = null;
  coverData = []; hitPlanes = []; hoveredCoverIdx = -1;
  const _cl = document.getElementById('compartment-label'); if (_cl) _cl.style.display = 'none';

  const f    = furniture;
  const tw   = totalWidth(f);
  const offX = tw / 2;

  const wallXs = wallXPositions(f);
  const bays   = bayGeometry(f);

  const edgeMat = new THREE.LineBasicMaterial({
    color: 0x6a4c30, transparent: true, opacity: 0.18
  });

  function makePanel(w, h, d, cx, cy, cz, userData) {
    const geo = new THREE.BoxGeometry(w * CM, h * CM, d * CM);
    const mat = new THREE.MeshStandardMaterial({
      roughness: 0.66, metalness: 0.03,
    });
    const wood = currentWood();
    mat.color.setHSL(wood.h, wood.s, wood.l);
    mat._base = mat.color.clone();
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set((cx - offX) * CM, cy * CM, cz * CM);
    mesh.castShadow    = true;
    mesh.receiveShadow = true;
    mesh.userData      = userData;
    mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo), edgeMat.clone()));
    furnitureGroup.add(mesh);
    allMeshes.push(mesh);
    return mesh;
  }

  for (let i = 0; i < wallXs.length; i++) {
    const wMesh = makePanel(
      f.thickness, f.height, f.depth,
      wallXs[i], f.height / 2, 0,
      { type: 'wall', wallIdx: i, bayIdx: Math.min(i, numBays(f) - 1) }
    );
    if (i > 0 && i < wallXs.length - 1) {
      const hMat = new THREE.MeshBasicMaterial({
        color: 0x4499ff, transparent: true, opacity: 0,
        side: THREE.DoubleSide, depthTest: false,
      });
      const hMesh = new THREE.Mesh(
        new THREE.PlaneGeometry(f.thickness * CM * 0.82, f.height * CM * 0.88),
        hMat
      );
      hMesh.position.z = (f.depth / 2) * CM + 0.002;
      hMesh.userData   = { isHandle: true };
      wMesh.add(hMesh);
      wMesh.userData.frontHandle = hMesh;
    }
  }

  for (let b = 0; b < bays.length; b++) {
    const bay = bays[b];
    const yCentres = slabYCentres(f, b);
    const total = yCentres.length;
    for (let s = 0; s < total; s++) {
      const mesh = makePanel(
        bay.width, f.thickness, f.depth,
        bay.xCentre, yCentres[s], 0,
        { type: 'slab', bayIdx: b, slabIdx: s, totalSlabs: total }
      );
      const cw = currentWood();
      mesh.material.color.setHSL(cw.h, cw.s, cw.l + (b % 2) * 0.04 - 0.02);
      mesh.material._base = mesh.material.color.clone();

      if (s > 0 && s < total - 1) {
        const hMat = new THREE.MeshBasicMaterial({
          color: 0x22dd66, transparent: true, opacity: 0,
          side: THREE.DoubleSide, depthTest: false,
        });
        const hMesh = new THREE.Mesh(
          new THREE.PlaneGeometry(bay.width * CM * 0.96, f.thickness * CM * 0.82),
          hMat
        );
        hMesh.position.z = (f.depth / 2) * CM + 0.002;
        hMesh.userData   = { isHandle: true };
        mesh.add(hMesh);
        mesh.userData.frontHandle = hMesh;
      }
    }
  }

  const midY = (f.height / 2) * CM;
  if (!_camReady) {
    target.set(0, midY, 0);
    sph.radius = fitRadius(f, renderer.domElement.clientWidth,
                               renderer.domElement.clientHeight, 30);
    _camReady = true;
  } else {
    target.y = midY;  // track furniture height, preserve pan x/z and zoom
  }
  applyCameraPos();

  updateColumnsUI();
  buildOverlayButtons();
  buildLockButtons();
  buildCompartmentCovers();
  updateBackdrop();
  saveState();
  resizePlan();
  drawPlan();
  if (typeof shelfToolActive !== 'undefined' && shelfToolActive) { _clearGhostShelves(); refreshShelfToolGeometry(); _ensureGhostCount(1); }
}

function deselectCurrent() {
  if (!selectedMesh) return;
  const m = selectedMesh.material;
  m.color.copy(m._base);
  m.emissive.set(0x000000);
  m.emissiveIntensity = 0;
  selectedMesh = null;
}

function selectMesh(mesh) {
  deselectCurrent();
  selectedMesh = mesh;
  const m = mesh.material;
  m.color.setHex(0xb84020);
  m.emissive.setHex(0xb84020);
  m.emissiveIntensity = 0.18;

  const d   = mesh.userData;
  const bay = (d.bayIdx !== undefined) ? d.bayIdx : -1;
  if (bay !== selectedBay) {
    selectedBay = bay;
    updateColumnsUI();
  }
}

function buildOverlayButtons() {
  const overlay = document.getElementById('canvas-overlay');
  overlay.innerHTML = '';
  overlayBtnData = [];

  const f    = furniture;
  const offX = totalWidth(f) / 2;
  const bays = bayGeometry(f);

  bays.forEach((bay, i) => {
    const btn = document.createElement('button');
    btn.className   = 'ov-btn ov-rem';
    const bulldozerOn = typeof activeBrush !== 'undefined' && activeBrush && activeBrush.btnId === 'btn-bulldozer';
    btn.style.display = bulldozerOn ? '' : 'none';
    btn.textContent = '−';
    btn.title       = 'Eliminar columna ' + i;
    btn.addEventListener('click', e => { e.stopPropagation(); removeColumnAt(i); });
    overlay.appendChild(btn);
    overlayBtnData.push({
      btn,
      wx: (bay.xCentre - offX) * CM,
      wy: 0,
      wz: (f.depth / 2) * CM,
      dy: 22,
    });
  });



  const shelfOn  = typeof shelfToolActive !== 'undefined' && shelfToolActive;
  const maxCols  = window.appConfig?.cabinet?.maxColumns ?? Infinity;
  const canAddCol = numBays(f) < maxCols;

  const addBtnL = document.createElement('button');
  addBtnL.className    = 'ov-btn ov-add ov-add-col';
  addBtnL.style.display = (shelfOn && canAddCol) ? '' : 'none';
  addBtnL.textContent  = '+';
  addBtnL.title        = 'Añadir columna a la izquierda';
  addBtnL.addEventListener('click', e => { e.stopPropagation(); addColumnLeftUI(); });
  overlay.appendChild(addBtnL);
  overlayBtnData.push({
    btn: addBtnL,
    wx: -(totalWidth(f) / 2 + 2.8) * CM,
    wy: (f.height / 2) * CM,
    wz: (f.depth / 2) * CM,
    dy: 0,
  });

  const addBtn = document.createElement('button');
  addBtn.className   = 'ov-btn ov-add ov-add-col';
  addBtn.style.display = (shelfOn && canAddCol) ? '' : 'none';
  addBtn.textContent = '+';
  addBtn.title       = 'Añadir columna';
  addBtn.addEventListener('click', e => { e.stopPropagation(); addColumnUI(); });
  overlay.appendChild(addBtn);
  overlayBtnData.push({
    btn: addBtn,
    wx: (totalWidth(f) / 2 + 2.8) * CM,
    wy: (f.height / 2) * CM,
    wz: (f.depth / 2) * CM,
    dy: 0,
  });
}

function positionOverlayButtons() {
  if (!overlayBtnData.length) return;
  const el = renderer.domElement;
  const w  = el.clientWidth, h = el.clientHeight;
  const rect = el.getBoundingClientRect();
  for (const item of overlayBtnData) {
    const v  = new THREE.Vector3(item.wx, item.wy, item.wz).project(camera);
    const sx = (v.x + 1) / 2 * w;
    const sy = -(v.y - 1) / 2 * h + (item.dy || 0);
    const ok = v.z < 1 && sx > 10 && sx < w - 10 && sy > 0 && sy < h + 40;
    item.btn.style.left = sx + 'px';
    item.btn.style.top  = sy + 'px';
    if (item.btn.classList.contains('ov-add-slab')) {
      const bx = rect.left + sx, by = rect.top + sy;
      const near = Math.hypot(_mouseScreenX - bx, _mouseScreenY - by) < 50;
      item.btn.style.visibility = (ok && near) ? 'visible' : 'hidden';
    } else {
      item.btn.style.visibility = ok ? 'visible' : 'hidden';
    }
  }
}

function _roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r); ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h); ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r); ctx.arcTo(x, y, x + r, y, r); ctx.closePath();
}

function makeDimSprite(text, sizeCm) {
  const W = 300, H = 80;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(255,248,242,0.96)'; _roundRect(ctx, 3, 3, W - 6, H - 6, 13); ctx.fill();
  ctx.strokeStyle = 'rgba(184,64,32,0.38)'; ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = '#b84020'; ctx.font = 'bold 40px system-ui,sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, W / 2, H / 2);
  const tex = new THREE.CanvasTexture(cv);
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0, depthTest: false });
  const sp = new THREE.Sprite(mat);
  const s = Math.max(3.2, Math.min(6.5, sizeCm * CM * 0.7));
  sp.scale.set(s, s * H / W, 1);
  return sp;
}

function buildDimLines(xL, xR, yB, yT, cx, cy, z, wCm, hCm) {
  const objs = [];
  const tk = 0.13;
  const dz = z + 0.003;

  function dashed() {
    return new THREE.LineDashedMaterial({ color: 0x9a7a60, dashSize: 0.14, gapSize: 0.08, transparent: true, opacity: 0 });
  }
  function solid() {
    return new THREE.LineBasicMaterial({ color: 0x9a7a60, transparent: true, opacity: 0 });
  }

  const wL = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(xL, yB, dz), new THREE.Vector3(xR, yB, dz)]),
    dashed());
  wL.computeLineDistances(); objs.push(wL);

  const wT = new THREE.LineSegments(
    new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(xL, yB - tk, dz), new THREE.Vector3(xL, yB + tk, dz),
      new THREE.Vector3(xR, yB - tk, dz), new THREE.Vector3(xR, yB + tk, dz),
    ]), solid());
  objs.push(wT);

  const hL = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(xL, yB, dz), new THREE.Vector3(xL, yT, dz)]),
    dashed());
  hL.computeLineDistances(); objs.push(hL);

  const hT = new THREE.LineSegments(
    new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(xL - tk, yB, dz), new THREE.Vector3(xL + tk, yB, dz),
      new THREE.Vector3(xL - tk, yT, dz), new THREE.Vector3(xL + tk, yT, dz),
    ]), solid());
  objs.push(hT);

  return objs;
}

function setCoverOpacity(idx, opacity) {
  if (idx < 0 || !coverData[idx]) return;
  const c = coverData[idx];
  c.cover.material.opacity = opacity;
  for (const o of c.dimObjs) {
    if (o.material) o.material.opacity = opacity;
  }
}

function buildCompartmentCovers() {
  const f    = furniture;
  const offX = totalWidth(f) / 2;
  const bays = bayGeometry(f);
  for (let b = 0; b < bays.length; b++) {
    const bay      = bays[b];
    const yCentres = slabYCentres(f, b);
    for (let s = 0; s < yCentres.length - 1; s++) {
      const yBottom = yCentres[s]     + f.thickness / 2;
      const yTop    = yCentres[s + 1] - f.thickness / 2;
      const hCm     = yTop - yBottom;
      if (hCm < 1) continue;
      const yCentre = (yBottom + yTop) / 2;
      const zFront  = f.depth / 2;
      const posX    = (bay.xCentre - offX) * CM;
      const posY    = yCentre * CM;
      const posZ    = -zFront * CM - 0.004;
      const xL      = (bay.xCentre - offX - bay.width / 2) * CM;
      const xR      = (bay.xCentre - offX + bay.width / 2) * CM;
      const yB3     = yBottom * CM;
      const yT3     = yTop    * CM;

      const geo = new THREE.PlaneGeometry(bay.width * CM, hCm * CM);
      const mat = new THREE.MeshBasicMaterial({
        color: 0xfaf5ef, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide,
      });
      const cover = new THREE.Mesh(geo, mat);
      cover.position.set(posX, posY, posZ);
      furnitureGroup.add(cover);

      const hitGeo = new THREE.PlaneGeometry(bay.width * CM, hCm * CM);
      const hitMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0 });
      const hitPlane = new THREE.Mesh(hitGeo, hitMat);
      hitPlane.position.set(posX, posY, posZ - 0.001);
      hitPlane.userData = { type: 'compartmentHit', coverIdx: coverData.length };
      furnitureGroup.add(hitPlane);
      hitPlanes.push(hitPlane);

      const dimObjs = buildDimLines(xL, xR, yB3, yT3, posX, posY, posZ, bay.width, hCm);
      dimObjs.forEach(o => furnitureGroup.add(o));

      coverData.push({ cover, hitPlane, dimObjs,
        data: { wcm: Math.round(bay.width * 10) / 10, hcm: Math.round(hCm * 10) / 10, wx: posX, wy: posY, wz: posZ },
      });
    }
  }
}

function positionCompartmentLabel() {}

function clearCoverHover() {
  setCoverOpacity(hoveredCoverIdx, 0);
  hoveredCoverIdx = -1;
}
