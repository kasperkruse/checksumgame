import * as THREE from 'three';

const WORLD_SIZE = 30;
const GRASS_DENSITY = 5;
const PLAYER_SPEED = 0.12;
const MOUSE_SENSITIVITY = 0.002;
const MOW_RADIUS = 1.2;
const MOW_REWARD = 100;

let scene, camera, renderer;
let mower;
let grassBlades = [];
let cutGrassCount = 0;
let totalGrass = 0;
let money = 0;
let completed = false;
let clock = new THREE.Clock();

let playerPos = new THREE.Vector3(-6, 1.6, 6);
let playerYaw = 0;
let playerPitch = 0;
let isPointerLocked = false;

const keys = { w: false, a: false, s: false, d: false };

const COLORS = {
  sky: 0x87CEEB,
  skyHorizon: 0xB4D7E8,
  ground: 0x7BA05B,
  grassTall: 0x4A9B45,
  grassCut: 0x8FBF7F,
  houseWall: 0xE8DCC8,
  houseRoof: 0x8B5A3C,
  houseDoor: 0x5D4037,
  houseWindow: 0x87CEEB,
  mower: 0xE53935,
  mowerBody: 0x2D2D2D,
  path: 0xD4C4A8,
  fence: 0xFFFFFF,
  tree: 0x2E7D32,
  trunk: 0x5D4037,
};

function init() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(COLORS.sky);
  scene.fog = new THREE.Fog(COLORS.skyHorizon, 30, 80);

  camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 200);
  camera.position.copy(playerPos);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  document.getElementById('game-container').prepend(renderer.domElement);

  const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
  scene.add(ambientLight);

  const sunLight = new THREE.DirectionalLight(0xffffff, 1.0);
  sunLight.position.set(10, 30, 10);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.width = 2048;
  sunLight.shadow.mapSize.height = 2048;
  sunLight.shadow.camera.near = 0.5;
  sunLight.shadow.camera.far = 80;
  sunLight.shadow.camera.left = -30;
  sunLight.shadow.camera.right = 30;
  sunLight.shadow.camera.top = 30;
  sunLight.shadow.camera.bottom = -30;
  scene.add(sunLight);

  createGround();
  createHouse();
  createPath();
  createGrass();
  createMower();
  createFence();
  createTrees();

  setupControls();
  window.addEventListener('resize', onWindowResize);
  document.getElementById('restart-btn').addEventListener('click', restartGame);

  renderer.domElement.addEventListener('click', () => {
    renderer.domElement.requestPointerLock();
  });

  document.addEventListener('pointerlockchange', () => {
    isPointerLocked = document.pointerLockElement === renderer.domElement;
    document.getElementById('click-prompt').style.display = isPointerLocked ? 'none' : 'flex';
  });

  animate();
}

function createGround() {
  const groundGeo = new THREE.PlaneGeometry(WORLD_SIZE * 3, WORLD_SIZE * 3);
  const groundMat = new THREE.MeshLambertMaterial({ color: COLORS.ground });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
}

function createHouse() {
  const house = new THREE.Group();

  const wallGeo = new THREE.BoxGeometry(6, 4, 5);
  const wallMat = new THREE.MeshLambertMaterial({ color: COLORS.houseWall });
  const walls = new THREE.Mesh(wallGeo, wallMat);
  walls.position.y = 2;
  walls.castShadow = true;
  walls.receiveShadow = true;
  house.add(walls);

  const roofGeo = new THREE.ConeGeometry(5, 2.5, 4);
  const roofMat = new THREE.MeshLambertMaterial({ color: COLORS.houseRoof });
  const roof = new THREE.Mesh(roofGeo, roofMat);
  roof.position.y = 5.25;
  roof.rotation.y = Math.PI / 4;
  roof.castShadow = true;
  house.add(roof);

  const doorGeo = new THREE.BoxGeometry(1, 2.2, 0.1);
  const doorMat = new THREE.MeshLambertMaterial({ color: COLORS.houseDoor });
  const door = new THREE.Mesh(doorGeo, doorMat);
  door.position.set(0, 1.1, 2.51);
  house.add(door);

  const handleGeo = new THREE.SphereGeometry(0.08);
  const handleMat = new THREE.MeshLambertMaterial({ color: 0xFFD700 });
  const handle = new THREE.Mesh(handleGeo, handleMat);
  handle.position.set(0.3, 1.1, 2.6);
  house.add(handle);

  const windowGeo = new THREE.BoxGeometry(1, 1, 0.1);
  const windowMat = new THREE.MeshLambertMaterial({ color: COLORS.houseWindow });
  
  [[-1.8, 2.2, 2.51], [1.8, 2.2, 2.51]].forEach(([x, y, z]) => {
    const win = new THREE.Mesh(windowGeo, windowMat);
    win.position.set(x, y, z);
    house.add(win);

    const frameMat = new THREE.MeshLambertMaterial({ color: 0xFFFFFF });
    const frameH = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.06, 0.12), frameMat);
    frameH.position.set(x, y, z + 0.02);
    house.add(frameH);
    const frameV = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.1, 0.12), frameMat);
    frameV.position.set(x, y, z + 0.02);
    house.add(frameV);
  });

  house.position.set(0, 0, -4);
  scene.add(house);
}

function createPath() {
  const pathGeo = new THREE.PlaneGeometry(2, 10);
  const pathMat = new THREE.MeshLambertMaterial({ color: COLORS.path });
  const path = new THREE.Mesh(pathGeo, pathMat);
  path.rotation.x = -Math.PI / 2;
  path.position.set(0, 0.01, 3);
  path.receiveShadow = true;
  scene.add(path);

  for (let i = 0; i < 30; i++) {
    const stoneGeo = new THREE.CylinderGeometry(0.1 + Math.random() * 0.12, 0.1, 0.04, 6);
    const stoneMat = new THREE.MeshLambertMaterial({ color: 0xC0B090 });
    const stone = new THREE.Mesh(stoneGeo, stoneMat);
    stone.position.set(
      (Math.random() - 0.5) * 1.6,
      0.02,
      Math.random() * 9 - 1
    );
    stone.rotation.y = Math.random() * Math.PI;
    scene.add(stone);
  }
}

function createFence() {
  const postGeo = new THREE.BoxGeometry(0.12, 1, 0.12);
  const postMat = new THREE.MeshLambertMaterial({ color: COLORS.fence });
  const railGeo = new THREE.BoxGeometry(0.06, 0.06, 2);

  for (let i = -10; i <= 10; i += 2) {
    if (Math.abs(i) < 1.5) continue;

    [[i, 10], [10, i], [-10, i]].forEach(([x, z]) => {
      const post = new THREE.Mesh(postGeo, postMat);
      post.position.set(x, 0.5, z);
      post.castShadow = true;
      scene.add(post);
    });
  }

  for (let i = -10; i < 10; i += 2) {
    if (i > -2 && i < 1) continue;

    [0.3, 0.7].forEach(y => {
      const rail = new THREE.Mesh(railGeo, postMat);
      rail.position.set(i + 1, y, 10);
      scene.add(rail);
    });

    [0.3, 0.7].forEach(y => {
      const rail = new THREE.Mesh(railGeo, postMat);
      rail.rotation.y = Math.PI / 2;
      rail.position.set(10, y, i + 1);
      scene.add(rail);

      const rail2 = new THREE.Mesh(railGeo, postMat);
      rail2.rotation.y = Math.PI / 2;
      rail2.position.set(-10, y, i + 1);
      scene.add(rail2);
    });
  }
}

function createTrees() {
  const treePositions = [
    [-12, -8], [-14, 0], [-13, 6], [12, -6], [14, 2], [13, 8],
    [-12, -12], [12, -12], [-15, -4], [15, 5]
  ];

  treePositions.forEach(([x, z]) => {
    const tree = new THREE.Group();

    const trunkGeo = new THREE.CylinderGeometry(0.2, 0.25, 1.5, 8);
    const trunkMat = new THREE.MeshLambertMaterial({ color: COLORS.trunk });
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.y = 0.75;
    trunk.castShadow = true;
    tree.add(trunk);

    const foliageMat = new THREE.MeshLambertMaterial({ color: COLORS.tree });
    
    const foliage1 = new THREE.Mesh(new THREE.ConeGeometry(1.5, 2.5, 8), foliageMat);
    foliage1.position.y = 2.5;
    foliage1.castShadow = true;
    tree.add(foliage1);

    const foliage2 = new THREE.Mesh(new THREE.ConeGeometry(1.2, 2, 8), foliageMat);
    foliage2.position.y = 3.8;
    foliage2.castShadow = true;
    tree.add(foliage2);

    const foliage3 = new THREE.Mesh(new THREE.ConeGeometry(0.8, 1.5, 8), foliageMat);
    foliage3.position.y = 4.8;
    foliage3.castShadow = true;
    tree.add(foliage3);

    tree.position.set(x, 0, z);
    scene.add(tree);
  });
}

function createGrass() {
  grassBlades = [];
  cutGrassCount = 0;
  totalGrass = 0;

  const bladeGeo = new THREE.ConeGeometry(0.06, 0.5, 4);
  const bladeMat = new THREE.MeshLambertMaterial({ color: COLORS.grassTall });

  for (let x = -WORLD_SIZE / 2 + 2; x < WORLD_SIZE / 2 - 2; x += 1 / GRASS_DENSITY) {
    for (let z = -WORLD_SIZE / 2 + 2; z < WORLD_SIZE / 2 - 2; z += 1 / GRASS_DENSITY) {
      if (isInHouseArea(x, z) || isOnPath(x, z)) continue;

      const blade = new THREE.Mesh(bladeGeo, bladeMat.clone());
      blade.position.set(
        x + (Math.random() - 0.5) * 0.12,
        0.25,
        z + (Math.random() - 0.5) * 0.12
      );
      blade.rotation.x = (Math.random() - 0.5) * 0.3;
      blade.rotation.z = (Math.random() - 0.5) * 0.3;
      blade.scale.y = 0.7 + Math.random() * 0.5;
      blade.userData.isTall = true;
      blade.userData.swayOffset = Math.random() * Math.PI * 2;
      blade.castShadow = true;

      grassBlades.push(blade);
      scene.add(blade);
      totalGrass++;
    }
  }
}

function isInHouseArea(x, z) {
  return x > -4 && x < 4 && z > -8 && z < 0;
}

function isOnPath(x, z) {
  return Math.abs(x) < 1.2 && z > -2 && z < 8;
}

function createMower() {
  mower = new THREE.Group();

  const bodyGeo = new THREE.BoxGeometry(0.7, 0.35, 1);
  const bodyMat = new THREE.MeshLambertMaterial({ color: COLORS.mower });
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.position.y = 0.28;
  body.castShadow = true;
  mower.add(body);

  const deckGeo = new THREE.BoxGeometry(0.75, 0.1, 1.05);
  const deckMat = new THREE.MeshLambertMaterial({ color: COLORS.mowerBody });
  const deck = new THREE.Mesh(deckGeo, deckMat);
  deck.position.y = 0.1;
  mower.add(deck);

  const engineGeo = new THREE.CylinderGeometry(0.12, 0.12, 0.18, 8);
  const engineMat = new THREE.MeshLambertMaterial({ color: 0x222222 });
  const engine = new THREE.Mesh(engineGeo, engineMat);
  engine.position.set(0, 0.52, -0.1);
  mower.add(engine);

  const wheelGeo = new THREE.CylinderGeometry(0.1, 0.1, 0.06, 12);
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x222222 });
  [[-0.3, -0.4], [0.3, -0.4], [-0.3, 0.4], [0.3, 0.4]].forEach(([x, z]) => {
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(x, 0.1, z);
    mower.add(wheel);
  });

  const handleGeo = new THREE.CylinderGeometry(0.025, 0.025, 1, 8);
  const handleMat = new THREE.MeshLambertMaterial({ color: 0x444444 });
  
  [[-0.25, -0.7], [0.25, -0.7]].forEach(([x, z]) => {
    const handle = new THREE.Mesh(handleGeo, handleMat);
    handle.position.set(x, 0.6, z);
    handle.rotation.x = 0.4;
    mower.add(handle);
  });

  const gripGeo = new THREE.BoxGeometry(0.6, 0.04, 0.06);
  const gripMat = new THREE.MeshLambertMaterial({ color: 0x111111 });
  const grip = new THREE.Mesh(gripGeo, gripMat);
  grip.position.set(0, 0.95, -1);
  mower.add(grip);

  mower.position.set(playerPos.x, 0, playerPos.z);
  scene.add(mower);
}

function setupControls() {
  window.addEventListener('keydown', (e) => {
    if (e.code === 'KeyW') keys.w = true;
    if (e.code === 'KeyA') keys.a = true;
    if (e.code === 'KeyS') keys.s = true;
    if (e.code === 'KeyD') keys.d = true;
  });

  window.addEventListener('keyup', (e) => {
    if (e.code === 'KeyW') keys.w = false;
    if (e.code === 'KeyA') keys.a = false;
    if (e.code === 'KeyS') keys.s = false;
    if (e.code === 'KeyD') keys.d = false;
  });

  window.addEventListener('mousemove', (e) => {
    if (!isPointerLocked) return;

    playerYaw -= e.movementX * MOUSE_SENSITIVITY;
    playerPitch -= e.movementY * MOUSE_SENSITIVITY;
    playerPitch = Math.max(-Math.PI / 3, Math.min(Math.PI / 3, playerPitch));
  });
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

function restartGame() {
  grassBlades.forEach(blade => scene.remove(blade));
  createGrass();
  playerPos.set(-6, 1.6, 6);
  playerYaw = 0;
  playerPitch = 0;
  completed = false;
  document.getElementById('completion-modal').classList.add('hidden');
  updateHUD();
}

function update() {
  if (completed) return;

  const moveDir = new THREE.Vector3();
  
  if (keys.w) moveDir.z -= 1;
  if (keys.s) moveDir.z += 1;
  if (keys.a) moveDir.x -= 1;
  if (keys.d) moveDir.x += 1;

  if (moveDir.length() > 0) {
    moveDir.normalize();
    moveDir.applyAxisAngle(new THREE.Vector3(0, 1, 0), playerYaw);
    
    const newX = playerPos.x + moveDir.x * PLAYER_SPEED;
    const newZ = playerPos.z + moveDir.z * PLAYER_SPEED;

    if (!isInHouseArea(newX, newZ)) {
      playerPos.x = Math.max(-9, Math.min(9, newX));
      playerPos.z = Math.max(-9, Math.min(9, newZ));
    }
  }

  camera.position.copy(playerPos);
  camera.rotation.order = 'YXZ';
  camera.rotation.y = playerYaw;
  camera.rotation.x = playerPitch;

  mower.position.x = playerPos.x;
  mower.position.z = playerPos.z;
  mower.rotation.y = playerYaw;

  const time = clock.getElapsedTime();
  grassBlades.forEach(blade => {
    if (blade.userData.isTall) {
      const sway = Math.sin(time * 2 + blade.userData.swayOffset) * 0.1;
      blade.rotation.x = sway;
    }
  });

  checkMowing();
  updateHUD();
  checkCompletion();
}

function checkMowing() {
  grassBlades.forEach(blade => {
    if (!blade.userData.isTall) return;

    const dist = Math.sqrt(
      Math.pow(blade.position.x - mower.position.x, 2) +
      Math.pow(blade.position.z - mower.position.z, 2)
    );

    if (dist < MOW_RADIUS) {
      blade.userData.isTall = false;
      blade.material.color.setHex(COLORS.grassCut);
      blade.scale.y = 0.15;
      blade.position.y = 0.04;
    }
  });
}

function updateHUD() {
  const mowed = grassBlades.filter(b => !b.userData.isTall).length;
  const percent = Math.floor((mowed / totalGrass) * 100);
  document.getElementById('grass-percent').textContent = percent;
  document.getElementById('money').textContent = money;
}

function checkCompletion() {
  const mowed = grassBlades.filter(b => !b.userData.isTall).length;
  const percent = (mowed / totalGrass) * 100;

  if (percent >= 100 && !completed) {
    completed = true;
    money += MOW_REWARD;
    document.getElementById('reward-amount').textContent = MOW_REWARD;
    document.getElementById('money').textContent = money;
    document.exitPointerLock();

    setTimeout(() => {
      document.getElementById('completion-modal').classList.remove('hidden');
    }, 500);
  }
}

function animate() {
  requestAnimationFrame(animate);
  update();
  renderer.render(scene, camera);
}

document.addEventListener('DOMContentLoaded', init);
