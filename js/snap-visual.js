'use strict';

// Snap visualization: two solid colored balls shown at the snap boundaries.
// One ball per boundary endpoint — one at each "end" of the snappable space.
// Works in both 3D (Three.js spheres) and 2D (canvas circles).

const SNAP_BALL_COLOR    = 0x00c8ff;
const SNAP_BALL_COLOR_2D = '#00c8ff';
const SNAP_BALL_RADIUS   = 2.5;  // cm

let snapBalls3D = null;

function ensureSnapBalls3D() {
  if (snapBalls3D) return;
  const geo = new THREE.SphereGeometry(SNAP_BALL_RADIUS * CM, 16, 12);
  const matA = new THREE.MeshBasicMaterial({ color: SNAP_BALL_COLOR, depthTest: false, depthWrite: false });
  const matB = matA.clone();
  const a = new THREE.Mesh(geo, matA);
  const b = new THREE.Mesh(geo, matB);
  a.renderOrder = 10;
  b.renderOrder = 10;
  a.visible = false;
  b.visible = false;
  scene.add(a);
  scene.add(b);
  snapBalls3D = { a, b };
}

function showSnapBalls3D(x1, y1, x2, y2) {
  ensureSnapBalls3D();
  const f    = furniture;
  const offX = totalWidth(f) / 2;
  const z    = (f.depth / 2 + 1) * CM;  // 1cm proud of front face to avoid z-fight
  snapBalls3D.a.position.set((x1 - offX) * CM, y1 * CM, z);
  snapBalls3D.b.position.set((x2 - offX) * CM, y2 * CM, z);
  snapBalls3D.a.visible = true;
  snapBalls3D.b.visible = true;
}

function hideSnapBalls3D() {
  if (!snapBalls3D) return;
  snapBalls3D.a.visible = false;
  snapBalls3D.b.visible = false;
}

// Called inside drawPlan — transform = { scale, ox, oy, fh2 }
// x1,y1 and x2,y2 are cm positions in furniture space (from bottom-left).
function drawSnapBalls2D(ctx, transform, x1cm, y1cm, x2cm, y2cm) {
  const { scale, ox, oy, fh2 } = transform;
  const toX = x => ox + x * scale;
  const toY = y => oy + fh2 - y * scale;
  const r   = Math.max(5, Math.min(10, SNAP_BALL_RADIUS * scale));
  ctx.save();
  ctx.fillStyle = SNAP_BALL_COLOR_2D;
  ctx.beginPath();
  ctx.arc(toX(x1cm), toY(y1cm), r, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(toX(x2cm), toY(y2cm), r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
