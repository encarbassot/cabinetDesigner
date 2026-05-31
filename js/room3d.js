'use strict';

let roomSceneGroup = null;
const _roomCabinetGroups = {};

function buildRoomScene() {
  if (!currentRoom) return;

  if (roomSceneGroup) {
    scene.remove(roomSceneGroup);
    roomSceneGroup.traverse(o => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        if (Array.isArray(o.material)) o.material.forEach(m => m.dispose());
        else o.material.dispose();
      }
    });
    roomSceneGroup = null;
  }
  for (const id in _roomCabinetGroups) delete _roomCabinetGroups[id];

  roomSceneGroup = new THREE.Group();
  scene.add(roomSceneGroup);

  const r  = currentRoom;
  const rw = r.width      * CM;
  const rd = r.depth      * CM;
  const rh = r.wallHeight * CM;

  // Floor
  const floorGeo  = new THREE.PlaneGeometry(rw, rd);
  const floorMat  = new THREE.MeshStandardMaterial({ color: 0xd8c8b0, roughness: 0.95, side: THREE.DoubleSide });
  const floorMesh = new THREE.Mesh(floorGeo, floorMat);
  floorMesh.rotation.x = -Math.PI / 2;
  floorMesh.position.set(rw / 2, 0.001, rd / 2);
  floorMesh.receiveShadow = true;
  roomSceneGroup.add(floorMesh);

  // Ceiling — transparent so camera can see inside from above
  const ceilMat  = new THREE.MeshStandardMaterial({ color: 0xf0ece6, roughness: 1, side: THREE.BackSide, transparent: true, opacity: 0 });
  const ceilMesh = new THREE.Mesh(new THREE.PlaneGeometry(rw, rd), ceilMat);
  ceilMesh.rotation.x = Math.PI / 2;
  ceilMesh.position.set(rw / 2, rh, rd / 2);
  roomSceneGroup.add(ceilMesh);

  const wt = 0.3; // wall thickness kept for baseboard
  function makeWall(w, h, px, py, pz, ry, color) {
    const geo  = new THREE.PlaneGeometry(w, h);
    const mat  = new THREE.MeshStandardMaterial({ color, roughness: 0.97, side: THREE.FrontSide });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(px, py, pz);
    mesh.rotation.y = ry;
    mesh.receiveShadow = true;
    roomSceneGroup.add(mesh);
  }

  // Each wall normal points INWARD → visible from inside only
  makeWall(rw, rh, rw/2, rh/2, 0,        0,              0xdcd5cc); // back   (faces +z)
  makeWall(rw, rh, rw/2, rh/2, rd,       Math.PI,        0xdcd5cc); // front  (faces -z)
  makeWall(rd, rh, 0,    rh/2, rd/2,     Math.PI/2,      0xd8d0c8); // left   (faces +x)
  makeWall(rd, rh, rw,   rh/2, rd/2,    -Math.PI/2,      0xd8d0c8); // right  (faces -x)

  // Baseboard
  const baseH = 0.1, baseD = 0.04;
  function makeBase(w, cz, ry) {
    const geo  = new THREE.BoxGeometry(w, baseH, baseD);
    const mat  = new THREE.MeshStandardMaterial({ color: 0xfaf7f2, roughness: 0.8 });
    const m    = new THREE.Mesh(geo, mat);
    m.rotation.y = ry;
    m.position.set(rw / 2, baseH / 2, cz);
    roomSceneGroup.add(m);
  }
  makeBase(rw, 0, 0);

  // Place each cabinet
  const projects = _getProjects();
  for (const pl of r.placements) {
    const proj = projects.find(p => p.id === pl.furnitureId);
    if (!proj || !proj.state) continue;
    const f    = proj.state.furniture;
    const wood = WOOD_PRESETS[proj.state.woodPresetIdx || 0];

    const fp = cabinetFootprint(f, pl);
    const cx = (fp.x + fp.w / 2) * CM;
    const cz = (fp.z + fp.d / 2) * CM;

    const group = _buildCabinetGroup(f, wood);
    group.position.set(cx, 0, cz);
    group.rotation.y = pl.rotation * Math.PI / 180;
    roomSceneGroup.add(group);
    _roomCabinetGroups[pl.id] = group;
  }

  // Reposition camera
  floor.visible         = false;
  backdropMesh.visible  = false;
  furnitureGroup.visible = false;
  scene.fog             = null;

  target.set(rw / 2, rh * 0.75, rd / 2);
  const diag    = Math.sqrt(rw * rw + rd * rd);
  sph.radius    = diag * 1.4 + rh * 0.5;
  sph.phi       = Math.PI / 2 - 0.72;
  sph.theta     = -Math.PI / 4;
  applyCameraPos();
}

function clearRoomScene() {
  if (roomSceneGroup) {
    scene.remove(roomSceneGroup);
    roomSceneGroup.traverse(o => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        if (Array.isArray(o.material)) o.material.forEach(m => m.dispose());
        else o.material.dispose();
      }
    });
    roomSceneGroup = null;
  }
  for (const id in _roomCabinetGroups) delete _roomCabinetGroups[id];
  floor.visible          = true;
  backdropMesh.visible   = true;
  furnitureGroup.visible = true;
  scene.fog              = new THREE.FogExp2(0xd2ebfa, 0.010);
}

function moveCabinetGroupInScene(placementId, fp, rotationDeg) {
  const group = _roomCabinetGroups[placementId];
  if (!group) return;
  group.position.set((fp.x + fp.w / 2) * CM, 0, (fp.z + fp.d / 2) * CM);
  group.rotation.y = rotationDeg * Math.PI / 180;
}

function _buildCabinetGroup(f, wood) {
  const group = new THREE.Group();
  const tw    = totalWidth(f);
  const offX  = tw / 2;
  const w     = wood || WOOD_PRESETS[0];

  function makePanel(pw, ph, pd, cx, cy, cz) {
    const geo  = new THREE.BoxGeometry(pw * CM, ph * CM, pd * CM);
    const mat  = new THREE.MeshStandardMaterial({
      roughness: 0.66, metalness: 0.03,
      color: new THREE.Color().setHSL(w.h, w.s, w.l),
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set((cx - offX) * CM, cy * CM, cz * CM);
    mesh.castShadow    = true;
    mesh.receiveShadow = true;
    const edgeMat = new THREE.LineBasicMaterial({ color: 0x6a4c30, transparent: true, opacity: 0.18 });
    mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo), edgeMat));
    group.add(mesh);
  }

  for (const wx of wallXPositions(f)) {
    makePanel(f.thickness, f.height, f.depth, wx, f.height / 2, 0);
  }
  const bays = bayGeometry(f);
  for (let b = 0; b < bays.length; b++) {
    const bay = bays[b];
    for (const yc of slabYCentres(f, b)) {
      makePanel(bay.width, f.thickness, f.depth, bay.xCentre, yc, 0);
    }
  }
  return group;
}
