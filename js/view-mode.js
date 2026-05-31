'use strict';

let prettyMode = false;
let activeView = '3d';

let _modelsConfig = null;
const _loadedModels = {};   // filename -> THREE.Group
const _activeProps  = [];   // currently in scene
const _usedSlots    = new Set(); // "b:s" keys for occupied shelf slots

function _fetchConfig(cb) {
  if (_modelsConfig !== null) { cb(); return; }
  fetch('/models/index.json', { cache: 'no-store' })
    .then(r => r.json())
    .then(cfg => { _modelsConfig = cfg; cb(); })
    .catch(() => { _modelsConfig = {}; cb(); });
}

function _loadModel(filename, cb) {
  if (_loadedModels[filename]) { cb(_loadedModels[filename]); return; }
  const loader = new THREE.GLTFLoader();
  loader.load('/models/' + filename, gltf => {
    const model = gltf.scene;
    model.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    _loadedModels[filename] = model;
    cb(model);
  });
}

function _placeModel(model, cfg) {
  const f    = furniture;
  const offX = totalWidth(f) / 2;

  model.scale.set(1, 1, 1);
  model.position.set(0, 0, 0);
  model.rotation.set(0, 0, 0);

  const box0 = new THREE.Box3().setFromObject(model);
  const size = new THREE.Vector3();
  box0.getSize(size);
  const native = Math.max(size.x, size.y, size.z);

  if (cfg.placement === 'shelf') {
    const bays = bayGeometry(f);
    let slots = [];
    for (let b = 0; b < bays.length; b++) {
      const yCentres = slabYCentres(f, b);
      for (let s = 0; s < yCentres.length - 1; s++) {
        const key = `${b}:${s}`;
        if (_usedSlots.has(key)) continue;
        const yBottom = yCentres[s]     + f.thickness / 2;
        const yTop    = yCentres[s + 1] - f.thickness / 2;
        const hCm     = yTop - yBottom;
        if (hCm > 15 && bays[b].width > 20)
          slots.push({ key, bay: bays[b], yBottom, hCm });
      }
    }
    if (!slots.length) return;

    // When targetCm is set, check actual bbox fits each slot
    if (cfg.targetCm != null) {
      const targetWorld = cfg.targetCm * CM * (cfg.scaleMult ?? 1);
      model.scale.setScalar(targetWorld / native);
      model.rotation.set(
        ((cfg.rotationX ?? 0) * Math.PI) / 180,
        ((cfg.rotationY ?? 0) * Math.PI) / 180,
        ((cfg.rotationZ ?? 0) * Math.PI) / 180
      );
      const tmpBox  = new THREE.Box3().setFromObject(model);
      const tmpSize = new THREE.Vector3();
      tmpBox.getSize(tmpSize);
      const modelH = tmpSize.y / CM;
      const modelW = tmpSize.x / CM;
      slots = slots.filter(sl => sl.hCm >= modelH * 0.92 && sl.bay.width >= modelW * 0.85);
      if (!slots.length) return;
    }

    const c = slots[Math.floor(Math.random() * slots.length)];
    _usedSlots.add(c.key);

    const autoWorld  = Math.min(c.hCm * CM * 0.82, c.bay.width * CM * 0.78);
    const targetWorld = (cfg.targetCm != null ? cfg.targetCm * CM : autoWorld) * (cfg.scaleMult ?? 1);
    model.scale.setScalar(targetWorld / native);
    model.rotation.set(
      ((cfg.rotationX ?? 0) * Math.PI) / 180,
      ((cfg.rotationY ?? 0) * Math.PI) / 180,
      ((cfg.rotationZ ?? 0) * Math.PI) / 180
    );

    const box2 = new THREE.Box3().setFromObject(model);
    const bayLeft   = (c.bay.xCentre - c.bay.width / 2 - offX) * CM;
    const bayCenter = (c.bay.xCentre - offX) * CM;
    const bayRight  = (c.bay.xCentre + c.bay.width / 2 - offX) * CM;
    const align = cfg.align ?? 'center';
    let posX;
    if (align === 'left')       posX = bayLeft  - box2.min.x;
    else if (align === 'right') posX = bayRight - box2.max.x;
    else                        posX = bayCenter - (box2.min.x + box2.max.x) / 2;
    model.position.set(
      posX + (cfg.xOffsetCm ?? 0) * CM,
      c.yBottom * CM - box2.min.y + (cfg.yOffsetCm ?? 0) * CM,
      (f.depth / 2 - 5) * CM - box2.max.z + (cfg.zOffsetCm ?? 0) * CM
    );

  } else {
    const targetWorld = (cfg.targetCm ?? 30) * CM * (cfg.scaleMult ?? 1);
    model.scale.setScalar(targetWorld / native);
    model.rotation.set(
      ((cfg.rotationX ?? 0) * Math.PI) / 180,
      ((cfg.rotationY ?? 0) * Math.PI) / 180,
      ((cfg.rotationZ ?? 0) * Math.PI) / 180
    );

    const bays = bayGeometry(f);
    let widestIdx = 0;
    for (let i = 1; i < bays.length; i++) {
      if (bays[i].width > bays[widestIdx].width) widestIdx = i;
    }
    const widestBay = bays[widestIdx];
    _usedSlots.add(`${widestIdx}:0`);
    const xFrac = cfg.xFraction ?? 0.5;
    const xWorld = (widestBay.xCentre + widestBay.width * (xFrac - 0.5) - offX) * CM;

    const box2   = new THREE.Box3().setFromObject(model);
    const frontZ = (f.depth / 2) * CM + (cfg.zOffsetCm ?? 4) * CM;
    model.position.set(
      xWorld,
      -box2.min.y + (cfg.yOffsetCm ?? 0) * CM,
      frontZ - box2.min.z
    );
  }

  scene.add(model);
  _activeProps.push(model);
}

function _clearProps() {
  for (const m of _activeProps) scene.remove(m);
  _activeProps.length = 0;
  _usedSlots.clear();
}

function _loadAndPlaceAll() {
  _fetchConfig(() => {
    const entries = Object.entries(_modelsConfig);

    // Random probability filter (default 85%)
    const active = entries.filter(([, cfg]) =>
      Math.random() < (cfg.probability ?? 0.85)
    );
    if (!active.length) return;

    // Shelf items sorted big-first, floor items at end
    const shelf = active
      .filter(([, cfg]) => cfg.placement !== 'floor')
      .sort(([, a], [, b]) => (b.targetCm ?? 50) - (a.targetCm ?? 50));
    const floor = active.filter(([, cfg]) => cfg.placement === 'floor');
    const ordered = [...shelf, ...floor];

    // Load all in parallel, then place in sorted order once all ready
    const loaded = {};
    let pending = ordered.length;

    for (const [filename] of ordered) {
      _loadModel(filename, model => {
        loaded[filename] = model;
        if (--pending === 0) {
          for (const [fn, cfg] of ordered) {
            if (loaded[fn]) _placeModel(loaded[fn], cfg);
          }
        }
      });
    }
  });
}

function setView(v) {
  if (typeof appMode !== 'undefined' && appMode === 'room') return;
  prettyMode = v === 'pretty';
  activeView = v === '2d' ? '2d' : '3d';
  try { localStorage.setItem('plykit_view', v); } catch {}
  const is2d = v === '2d';

  document.getElementById('canvas-area').style.display = is2d ? 'none' : '';
  document.getElementById('view-2d').style.display     = is2d ? 'flex' : 'none';

  document.getElementById('hdr-btn-3d').classList.toggle('active',     v === '3d');
  document.getElementById('hdr-btn-pretty').classList.toggle('active', v === 'pretty');
  document.getElementById('hdr-btn-2d').classList.toggle('active',     v === '2d');

  const overlay = document.getElementById('canvas-overlay');
  const hint    = document.getElementById('hint');
  if (prettyMode) {
    overlay.style.opacity       = '0';
    overlay.style.pointerEvents = 'none';
    hint.style.display          = 'none';
    ambLight.intensity = 0.55;
    sun.intensity      = 1.10;
    fill.intensity     = 0.30;
    rimA.intensity     = 0.35;
    rimB.intensity     = 0.14;
    renderer.toneMapping         = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    _loadAndPlaceAll();
  } else {
    overlay.style.opacity       = '';
    overlay.style.pointerEvents = '';
    hint.style.display          = '';
    ambLight.intensity = 0.60;
    sun.intensity      = 0.92;
    fill.intensity     = 0.22;
    rimA.intensity     = 0;
    rimB.intensity     = 0;
    renderer.toneMapping         = THREE.NoToneMapping;
    renderer.toneMappingExposure = 1.0;
    _clearProps();
  }

  if (is2d) { resizePlan(); drawPlan(); }
  else       { onResize(); }
}

function onResize() {
  if (typeof appMode !== 'undefined' && appMode === 'room') {
    if (roomViewMode === '3d' || roomViewMode === 'split') {
      const w = canvasArea.clientWidth, h = canvasArea.clientHeight;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
    resizeRoom2d();
    return;
  }
  const w = canvasArea.clientWidth, h = canvasArea.clientHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  if (activeView === '2d') { resizePlan(); drawPlan(); }
}
window.addEventListener('resize', onResize);
onResize();
