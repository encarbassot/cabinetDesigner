'use strict';

class Bulldozer extends BrushTool {
  constructor() {
    super();
    this._pressing   = false;
    this._hoverMesh  = null;
  }

  get btnId()  { return 'btn-bulldozer'; }
  get cursor() {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 15 15"><path fill="%23333" d="M10.5 9c1.5 0 2 1 2 2s-.5 2-2 2H2c-1.5 0-2-1-2-2s.5-2 2-2zm.25 1c-.55 0-1 .45-1 1s.45 1 1 1s1-.45 1-1s-.45-1-1-1m-9 0c-.55 0-1 .45-1 1s.45 1 1 1s1-.45 1-1s-.45-1-1-1m6 0c-.55 0-1 .45-1 1s.45 1 1 1s1-.45 1-1s-.45-1-1-1m-3 0c-.55 0-1 .45-1 1s.45 1 1 1s1-.45 1-1s-.45-1-1-1M14 9c0-4 1.5-4 .5-4s-2 .5-2 4s1 4 2 4s-.5 0-.5-4M6.4 3c.5 0 .6.5.6.5L7.5 6H3V3zM7 2H2.5S2 2 2 2.5V6h-.5S1 6 1 6.45V8c0 .5.5.5.5.5H12S12 6 11 6H8.75l-.9-3.35S7.75 2 7 2"/></svg>`;
    return `url("data:image/svg+xml,${svg}") 2 12, crosshair`;
  }

  _getSlabAt(clientX, clientY) {
    const rect = renderer.domElement.getBoundingClientRect();
    mouse2.set(
       ((clientX - rect.left) / rect.width)  *  2 - 1,
      -((clientY - rect.top)  / rect.height) *  2 + 1
    );
    raycaster.setFromCamera(mouse2, camera);
    const hits = raycaster.intersectObjects(allMeshes, false);
    for (const hit of hits) {
      const m = hit.object;
      if (m.userData.type === 'slab') {
        const { slabIdx, totalSlabs } = m.userData;
        if (slabIdx > 0 && slabIdx < totalSlabs - 1) return m;
      }
    }
    return null;
  }

  _setHover(mesh) {
    if (this._hoverMesh === mesh) return;
    // clear previous group
    if (this._hoverMesh) {
      const { bayIdx, slabIdx } = this._hoverMesh.userData;
      const ri = slabIdx - 1;
      const chain = [{ bay: bayIdx, relIdx: ri }, ...getLinkedChain(bayIdx, ri)];
      for (const cp of chain) {
        const m = allMeshes.find(m =>
          m.userData.type === 'slab' && m.userData.bayIdx === cp.bay && m.userData.slabIdx === cp.relIdx + 1
        );
        if (m) { m.material.emissive.set(0x000000); m.material.emissiveIntensity = 0; }
      }
    }
    this._hoverMesh = mesh;
    if (mesh) {
      const { bayIdx, slabIdx } = mesh.userData;
      const ri = slabIdx - 1;
      const chain = [{ bay: bayIdx, relIdx: ri }, ...getLinkedChain(bayIdx, ri)];
      for (const cp of chain) {
        const m = allMeshes.find(m =>
          m.userData.type === 'slab' && m.userData.bayIdx === cp.bay && m.userData.slabIdx === cp.relIdx + 1
        );
        if (m) { m.material.emissive.setHex(0xaa1100); m.material.emissiveIntensity = 0.5; }
      }
    }
  }

  _eraseAt(clientX, clientY) {
    const mesh = this._getSlabAt(clientX, clientY);
    if (!mesh) return;

    const { bayIdx, slabIdx } = mesh.userData;
    const relIdx = slabIdx - 1;

    slabLinks = slabLinks
      .filter(lk =>
        !(lk.bayA === bayIdx && lk.relIdxA === relIdx) &&
        !(lk.bayB === bayIdx && lk.relIdxB === relIdx)
      )
      .map(lk => {
        const r = { ...lk };
        if (lk.bayA === bayIdx && lk.relIdxA > relIdx) r.relIdxA--;
        if (lk.bayB === bayIdx && lk.relIdxB > relIdx) r.relIdxB--;
        return r;
      });

    removeSlab(furniture, bayIdx, relIdx);
    this._hoverMesh = null;
    buildFurniture();
  }

  onActivate() {
    this._pressing  = false;
    this._hoverMesh = null;
    document.querySelectorAll('.ov-rem').forEach(b => b.style.display = '');
  }

  onDeactivate() {
    this._setHover(null);
    this._pressing = false;
    document.querySelectorAll('.ov-rem').forEach(b => b.style.display = 'none');
  }

  onMouseDown(clientX, clientY) {
    this._pressing = true;
    this._eraseAt(clientX, clientY);
  }

  onMouseMove(clientX, clientY) {
    if (this._pressing) {
      this._eraseAt(clientX, clientY);
    } else {
      this._setHover(this._getSlabAt(clientX, clientY));
    }
  }

  onMouseUp() {
    this._pressing = false;
  }
}

const bulldozer = new Bulldozer();

function toggleBulldozer() {
  if (activeBrush === bulldozer) {
    bulldozer.deactivate();
  } else {
    deactivateActiveBrush();
    if (shelfToolActive) deactivateShelfTool();
    bulldozer.activate();
  }
}
