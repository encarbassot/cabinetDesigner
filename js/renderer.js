'use strict';

const canvasArea = document.getElementById('canvas-area');
const renderer   = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type    = THREE.PCFSoftShadowMap;
canvasArea.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xd2ebfa);
scene.fog = new THREE.FogExp2(0xd2ebfa, 0.010);

const camera = new THREE.PerspectiveCamera(46, 1, 0.1, 300);
let sph    = { theta: 0.40, phi: Math.PI / 2 - 0.16, radius: 30 };
let target = new THREE.Vector3(0, 10, 0);
let backWallZ = 0;

function applyCameraPos() {
  sph.phi = Math.max(0.06, Math.min(Math.PI / 2 - 0.02, sph.phi));
  const x = target.x + sph.radius * Math.sin(sph.phi) * Math.sin(sph.theta);
  const y = target.y + sph.radius * Math.cos(sph.phi);
  const z = target.z + sph.radius * Math.sin(sph.phi) * Math.cos(sph.theta);
  camera.position.set(x, Math.max(0.3, y), Math.max(backWallZ + 0.5, z));
  camera.lookAt(target);
  updateCamResetBtn();
}

function updateCamResetBtn() {
  const btn = document.getElementById('btn-cam-reset');
  if (!btn) return;
  const h         = furniture.height * CM;
  const defRadius = fitRadius(furniture,
    renderer.domElement.clientWidth, renderer.domElement.clientHeight, 30);
  const tNorm     = ((sph.theta % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  const dNorm     = ((0.40      % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  const dTheta    = Math.min(Math.abs(tNorm - dNorm), Math.PI * 2 - Math.abs(tNorm - dNorm));
  const atDefault =
    Math.abs(sph.phi - (Math.PI / 2 - 0.16)) < 0.07 &&
    dTheta < 0.07 &&
    Math.abs(sph.radius - defRadius) / defRadius < 0.04 &&
    Math.abs(target.x) < 0.5 &&
    Math.abs(target.y - h / 2) < 1.5 &&
    Math.abs(target.z) < 0.5;
  btn.classList.toggle('muted', atDefault);
}
applyCameraPos();

const ambLight = new THREE.AmbientLight(0xfff8f2, 0.60);
scene.add(ambLight);

const sun = new THREE.DirectionalLight(0xfff4e8, 0.92);
sun.position.set(14, 22, 20);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.near = 0.5;
sun.shadow.camera.far  = 90;
sun.shadow.camera.left = sun.shadow.camera.bottom = -35;
sun.shadow.camera.right = sun.shadow.camera.top   =  35;
scene.add(sun);

const fill = new THREE.DirectionalLight(0xc8d8ff, 0.22);
fill.position.set(-12, 6, -8);
scene.add(fill);

const rimA = new THREE.DirectionalLight(0xffe0c0, 0); rimA.position.set(-10, 20, -12); scene.add(rimA);
const rimB = new THREE.DirectionalLight(0xc0d8ff, 0); rimB.position.set( 12, -4,  -8); scene.add(rimB);

const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(600, 600),
  new THREE.MeshStandardMaterial({ color: 0xb8d8ee, roughness: 0.98, metalness: 0 })
);
floor.rotation.x = -Math.PI / 2;
floor.position.y = 0;
floor.receiveShadow = true;
scene.add(floor);

const backdropMat  = new THREE.MeshStandardMaterial({ color: 0xcec7be, roughness: 0.95, metalness: 0 });
const backdropMesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), backdropMat);
backdropMesh.receiveShadow = true;
backdropMesh.visible = true;
scene.add(backdropMesh);

function updateBackdrop() {
  const f = furniture;
  backWallZ = -(f.depth / 2) * CM;
  backdropMesh.geometry.dispose();
  backdropMesh.geometry = new THREE.PlaneGeometry(600, 300);
  backdropMesh.position.set(0, 80, backWallZ - 0.01);
}

const furnitureGroup = new THREE.Group();
scene.add(furnitureGroup);

// Compute the camera radius that fits the furniture within the viewport
// with at least `pad` pixels of clearance on every side.
// Uses the default reset angles (theta=0.40, phi=PI/2-0.16) to project
// all 8 corners of the furniture bounding box onto the camera plane.
function fitRadius(f, W, H, pad) {
  const h     = f.height      * CM;
  const hw    = totalWidth(f) * CM / 2;
  const hd    = f.depth       * CM / 2;
  const tHalf = Math.tan((camera.fov / 2) * Math.PI / 180);
  // Default reset angles
  const theta = 0.40, phi = Math.PI / 2 - 0.16;
  const cosTh = Math.cos(theta), sinTh = Math.sin(theta);
  const sinPh = Math.sin(phi),   cosPh = Math.cos(phi);
  // Camera right  = (cosTh, 0, -sinTh)
  // Camera up     = (-sinTh*cosPh, sinPh, -cosTh*cosPh)
  // Max |dot(corner, right)| and |dot(corner, up)| over all 8 bounding-box corners:
  const maxRight = hw * cosTh       + hd * sinTh;
  const maxUp    = hw * sinTh*cosPh + (h / 2) * sinPh + hd * cosTh*cosPh;
  // At radius r, world unit → pixels: H / (2·r·tHalf)
  // Fit constraint: extent·H/(2·r·tHalf) ≤ half_dim - pad
  const safeW = Math.max(1, W - 2 * pad);
  const safeH = Math.max(1, H - 2 * pad);
  return Math.max(22, maxRight * H / (tHalf * safeW),
                      maxUp    * H / (tHalf * safeH));
}

function resetCamera() {
  const f = furniture;
  const h = f.height * CM;
  target.set(0, h / 2, 0);
  sph = { theta: 0.40, phi: Math.PI / 2 - 0.16,
          radius: fitRadius(f, renderer.domElement.clientWidth,
                               renderer.domElement.clientHeight, 30) };
  applyCameraPos();
}
