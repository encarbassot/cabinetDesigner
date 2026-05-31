'use strict';

const ROOM_STORAGE_KEY = 'plykit_room_v1';

let currentRoom = null;
let appMode = 'cabinet'; // 'cabinet' | 'room'

function createRoom(width, depth, wallHeight) {
  return {
    id: 'room_' + Date.now(),
    name: 'Mi habitación',
    width:      width      || 400,
    depth:      depth      || 300,
    wallHeight: wallHeight || 250,
    placements: [],
  };
}

function _pid() {
  return 'pl_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
}

function addPlacement(room, furnitureId, x, z, rotation) {
  return {
    ...room,
    placements: [...room.placements, { id: _pid(), furnitureId, x, z, rotation: rotation || 0 }],
  };
}

function removePlacement(room, id) {
  return { ...room, placements: room.placements.filter(p => p.id !== id) };
}

function movePlacement(room, id, x, z) {
  return { ...room, placements: room.placements.map(p => p.id === id ? { ...p, x, z } : p) };
}

function rotatePlacement(room, id) {
  return { ...room, placements: room.placements.map(p => {
    if (p.id !== id) return p;
    const snapped = ((Math.round(p.rotation / 90) * 90) + 90) % 360;
    return { ...p, rotation: snapped };
  })};
}

function setPlacementRotation(room, id, rotation) {
  return { ...room, placements: room.placements.map(p => p.id === id ? { ...p, rotation } : p) };
}

// Bounding box {x, z, w, d} in room coords (rotation-aware, supports any angle)
function cabinetFootprint(f, placement) {
  const tw = totalWidth(f);
  const d  = f.depth;
  const r  = ((placement.rotation % 360) + 360) % 360;
  const swapped = (r >= 45 && r < 135) || (r >= 225 && r < 315);
  return swapped
    ? { x: placement.x, z: placement.z, w: d, d: tw }
    : { x: placement.x, z: placement.z, w: tw, d };
}

function snapToWalls(room, fp, threshold) {
  const t = (threshold !== undefined) ? threshold : 5;
  let x = fp.x, z = fp.z;
  if (fp.x < t)                         x = 0;
  if (room.width - (fp.x + fp.w) < t)  x = room.width - fp.w;
  if (fp.z < t)                         z = 0;
  if (room.depth - (fp.z + fp.d) < t)  z = room.depth - fp.d;
  return { x, z };
}

function snapToCabinets(room, furnituresMap, skipId, fp, threshold) {
  const t = (threshold !== undefined) ? threshold : 5;
  let x = fp.x, z = fp.z;
  for (const pl of room.placements) {
    if (pl.id === skipId) continue;
    const f = furnituresMap[pl.furnitureId];
    if (!f) continue;
    const o = cabinetFootprint(f, pl);
    if (Math.abs(fp.x - (o.x + o.w)) < t) x = o.x + o.w;
    if (Math.abs(fp.x + fp.w - o.x) < t)  x = o.x - fp.w;
    if (Math.abs(fp.z - (o.z + o.d)) < t) z = o.z + o.d;
    if (Math.abs(fp.z + fp.d - o.z) < t)  z = o.z - fp.d;
  }
  return { x, z };
}

function clampToRoom(room, fp) {
  return {
    x: Math.max(0, Math.min(room.width  - fp.w, fp.x)),
    z: Math.max(0, Math.min(room.depth  - fp.d, fp.z)),
  };
}

function saveCurrentRoom() {
  if (!currentRoom) return;
  try { localStorage.setItem(ROOM_STORAGE_KEY, JSON.stringify(currentRoom)); } catch {}
}

function loadSavedRoom() {
  try {
    const raw = localStorage.getItem(ROOM_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
