import * as THREE from 'three';

const WORLD_SIZE = 30;
const GRASS_DENSITY = 5;
const PLAYER_SPEED = 0.15;
const MOUSE_SENSITIVITY = 0.002;
const MOW_RADIUS = 1.5;
const MOW_REWARD = 100;

let scene, camera, renderer;
let mower, mowerLight;
let grassBlades = [];
let cutGrassCount = 0;
let totalGrass = 0;
let money = 0;
let completed = false;
let clock = new THREE.Clock();

let playerPos = new THREE.Vector3(-8, 1.6, 8);
let playerYaw = 0;
let playerPitch = 0;
let isPointerLocked = false;

const keys = { w: false, a: false, s: false, d: false };

const NEON = {
  pink: 0xFF10F0,
  cyan: 0x00FFFF,
  purple: 0x9D00FF,
  blue: 0x0080FF,
  yellow: 0xFFFF00,
  orange: 0xFF6600,
  green: 0x39FF14,
  darkPurple: 0x1A0A2E,
  darkBlue: 0x0D0221,
  grid: 0xFF10F0,
  grassTall: 0x39FF14,
  grassCut: 0x00AA88,
};

function init() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(NEON.darkBlue);
  scene.fog = new THREE.FogExp2(NEON.darkPurple, 0.02);

  camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 200);
  camera.position.copy(playerPos);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  document.getElementById('game-container').prepend(renderer.domElement);

  const ambientLight = new THREE.AmbientLight(0x331155, 0.3);
  scene.add(ambientLight);

  const sunLight = new THREE.DirectionalLight(NEON.purple, 0.5);
  sunLight.position.set(-10, 20, -10);
  scene.add(sunLight);

  createNeonGrid();
  createNeonHouse();
  createGrass();
  createMower();
  createSkybox();
  createNeonFence();

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

function createNeonGrid() {
  const gridSize = WORLD_SIZE * 2;
  const gridDivisions = 40;
  
  const groundGeo = new THREE.PlaneGeometry(gridSize, gridSize);
  const groundMat = new THREE.MeshBasicMaterial({ 
    color: 0x050510,
    transparent: true,
    opacity: 0.9
  });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.01;
  scene.add(ground);

  const gridHelper = new THREE.GridHelper(gridSize, gridDivisions, NEON.pink, NEON.purple);
  gridHelper.material.transparent = true;
  gridHelper.material.opacity = 0.6;
  scene.add(gridHelper);

  for (let i = 0; i < 20; i++) {
    const lineGeo = new THREE.BufferGeometry();
    const x = (Math.random() - 0.5) * gridSize;
    const z = (Math.random() - 0.5) * gridSize;
    lineGeo.setFromPoints([
      new THREE.Vector3(x, 0, z),
      new THREE.Vector3(x, 8 + Math.random() * 4, z)
    ]);
    const lineMat = new THREE.LineBasicMaterial({ 
      color: Math.random() > 0.5 ? NEON.cyan : NEON.pink,
      transparent: true,
      opacity: 0.3
    });
    const line = new THREE.Line(lineGeo, lineMat);
    scene.add(line);
  }
}

function createSkybox() {
  const sunGeo = new THREE.CircleGeometry(8, 32);
  const sunMat = new THREE.MeshBasicMaterial({ 
    color: NEON.orange,
    side: THREE.DoubleSide
  });
  const sun = new THREE.Mesh(sunGeo, sunMat);
  sun.position.set(0, 15, -50);
  scene.add(sun);

  for (let i = 0; i < 5; i++) {
    const ringGeo = new THREE.RingGeometry(9 + i * 2, 9.5 + i * 2, 32);
    const ringMat = new THREE.MeshBasicMaterial({
      color: i % 2 === 0 ? NEON.pink : NEON.purple,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.8 - i * 0.15
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.set(0, 15, -50);
    scene.add(ring);
  }

  for (let i = 0; i < 100; i++) {
    const starGeo = new THREE.SphereGeometry(0.05 + Math.random() * 0.1, 4, 4);
    const starMat = new THREE.MeshBasicMaterial({ 
      color: Math.random() > 0.7 ? NEON.cyan : 0xFFFFFF 
    });
    const star = new THREE.Mesh(starGeo, starMat);
    star.position.set(
      (Math.random() - 0.5) * 100,
      20 + Math.random() * 30,
      -30 - Math.random() * 40
    );
    scene.add(star);
  }

  const mountainMat = new THREE.MeshBasicMaterial({ 
    color: 0x1A0A2E,
    wireframe: false
  });
  
  for (let i = 0; i < 8; i++) {
    const mountainGeo = new THREE.ConeGeometry(8 + Math.random() * 6, 12 + Math.random() * 8, 4);
    const mountain = new THREE.Mesh(mountainGeo, mountainMat);
    mountain.position.set(-40 + i * 12, 0, -40);
    scene.add(mountain);

    const wireGeo = new THREE.ConeGeometry(8.1 + Math.random() * 6, 12.1 + Math.random() * 8, 4);
    const wireMat = new THREE.MeshBasicMaterial({ 
      color: NEON.purple,
      wireframe: true,
      transparent: true,
      opacity: 0.5
    });
    const wire = new THREE.Mesh(wireGeo, wireMat);
    wire.position.copy(mountain.position);
    scene.add(wire);
  }
}

function createNeonHouse() {
  const house = new THREE.Group();

  const wallMat = new THREE.MeshBasicMaterial({ color: 0x151525 });
  const walls = new THREE.Mesh(new THREE.BoxGeometry(6, 4, 5), wallMat);
  walls.position.y = 2;
  house.add(walls);

  const edgeMat = new THREE.LineBasicMaterial({ color: NEON.cyan });
  const wallEdges = new THREE.EdgesGeometry(new THREE.BoxGeometry(6.02, 4.02, 5.02));
  const wallLines = new THREE.LineSegments(wallEdges, edgeMat);
  wallLines.position.y = 2;
  house.add(wallLines);

  const roofGeo = new THREE.ConeGeometry(5, 2.5, 4);
  const roofMat = new THREE.MeshBasicMaterial({ color: 0x1A1A30 });
  const roof = new THREE.Mesh(roofGeo, roofMat);
  roof.position.y = 5.25;
  roof.rotation.y = Math.PI / 4;
  house.add(roof);

  const roofEdges = new THREE.EdgesGeometry(roofGeo);
  const roofLines = new THREE.LineSegments(roofEdges, new THREE.LineBasicMaterial({ color: NEON.pink }));
  roofLines.position.y = 5.25;
  roofLines.rotation.y = Math.PI / 4;
  house.add(roofLines);

  const windowMat = new THREE.MeshBasicMaterial({ color: NEON.cyan, transparent: true, opacity: 0.8 });
  [[-1.5, 2.2, 2.51], [1.5, 2.2, 2.51]].forEach(([x, y, z]) => {
    const win = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 1), windowMat);
    win.position.set(x, y, z);
    house.add(win);

    const winLight = new THREE.PointLight(NEON.cyan, 1, 5);
    winLight.position.set(x, y, z + 0.5);
    house.add(winLight);
  });

  const doorMat = new THREE.MeshBasicMaterial({ color: NEON.pink, transparent: true, opacity: 0.8 });
  const door = new THREE.Mesh(new THREE.PlaneGeometry(1, 2), doorMat);
  door.position.set(0, 1.5, 2.51);
  house.add(door);

  const doorLight = new THREE.PointLight(NEON.pink, 2, 6);
  doorLight.position.set(0, 2, 4);
  house.add(doorLight);

  const signGeo = new THREE.PlaneGeometry(4, 0.6);
  const signMat = new THREE.MeshBasicMaterial({ color: NEON.yellow });
  const sign = new THREE.Mesh(signGeo, signMat);
  sign.position.set(0, 4.8, 2.6);
  house.add(sign);

  house.position.set(0, 0, -5);
  scene.add(house);
}

function createNeonFence() {
  const postMat = new THREE.MeshBasicMaterial({ color: 0x1A1A30 });
  const glowMat = new THREE.MeshBasicMaterial({ color: NEON.pink, transparent: true, opacity: 0.8 });

  for (let i = -12; i <= 12; i += 2) {
    if (Math.abs(i) < 2) continue;

    [[i, 12], [12, i], [-12, i]].forEach(([x, z]) => {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.5, 8), postMat);
      post.position.set(x, 0.75, z);
      scene.add(post);

      const glow = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 8), glowMat);
      glow.position.set(x, 1.55, z);
      scene.add(glow);

      const light = new THREE.PointLight(NEON.pink, 0.3, 3);
      light.position.set(x, 1.55, z);
      scene.add(light);
    });
  }

  const railMat = new THREE.LineBasicMaterial({ color: NEON.cyan, transparent: true, opacity: 0.6 });
  
  [12, -12].forEach(fixed => {
    const points = [];
    for (let i = -12; i <= 12; i += 2) {
      if (Math.abs(i) >= 2) points.push(new THREE.Vector3(i, 1, fixed));
    }
    if (points.length > 1) {
      const railGeo = new THREE.BufferGeometry().setFromPoints(points);
      scene.add(new THREE.Line(railGeo, railMat));
    }
  });
}

function createGrass() {
  grassBlades = [];
  cutGrassCount = 0;
  totalGrass = 0;

  const bladeMat = new THREE.MeshBasicMaterial({ color: NEON.grassTall });
  const bladeGeo = new THREE.ConeGeometry(0.08, 0.6, 4);

  for (let x = -WORLD_SIZE / 2 + 2; x < WORLD_SIZE / 2 - 2; x += 1 / GRASS_DENSITY) {
    for (let z = -WORLD_SIZE / 2 + 2; z < WORLD_SIZE / 2 - 2; z += 1 / GRASS_DENSITY) {
      if (isInHouseArea(x, z)) continue;

      const blade = new THREE.Mesh(bladeGeo, bladeMat.clone());
      blade.position.set(
        x + (Math.random() - 0.5) * 0.15,
        0.3,
        z + (Math.random() - 0.5) * 0.15
      );
      blade.rotation.x = (Math.random() - 0.5) * 0.3;
      blade.rotation.z = (Math.random() - 0.5) * 0.3;
      blade.scale.y = 0.7 + Math.random() * 0.6;
      blade.userData.isTall = true;
      blade.userData.swayOffset = Math.random() * Math.PI * 2;

      grassBlades.push(blade);
      scene.add(blade);
      totalGrass++;
    }
  }
}

function isInHouseArea(x, z) {
  return x > -4 && x < 4 && z > -9 && z < -1;
}

function createMower() {
  mower = new THREE.Group();

  const bodyMat = new THREE.MeshBasicMaterial({ color: 0x1A1A2E });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.4, 1.2), bodyMat);
  body.position.y = 0.3;
  mower.add(body);

  const edgeMat = new THREE.LineBasicMaterial({ color: NEON.cyan });
  const bodyEdges = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(0.82, 0.42, 1.22)),
    edgeMat
  );
  bodyEdges.position.y = 0.3;
  mower.add(bodyEdges);

  const stripeMat = new THREE.MeshBasicMaterial({ color: NEON.pink });
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.08, 0.1), stripeMat);
  stripe.position.set(0, 0.35, 0.55);
  mower.add(stripe);

  const handleMat = new THREE.MeshBasicMaterial({ color: NEON.cyan });
  [[-0.3, 0.6], [0.3, 0.6]].forEach(([x]) => {
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1), handleMat);
    handle.position.set(x, 0.7, -0.8);
    handle.rotation.x = 0.4;
    mower.add(handle);
  });

  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.06, 0.06), handleMat);
  grip.position.set(0, 1.0, -1.1);
  mower.add(grip);

  mowerLight = new THREE.PointLight(NEON.green, 2, 4);
  mowerLight.position.set(0, 0.3, 0.7);
  mower.add(mowerLight);

  const lightMesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.1, 8, 8),
    new THREE.MeshBasicMaterial({ color: NEON.green })
  );
  lightMesh.position.set(0, 0.3, 0.65);
  mower.add(lightMesh);

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
  playerPos.set(-8, 1.6, 8);
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
      playerPos.x = Math.max(-11, Math.min(11, newX));
      playerPos.z = Math.max(-11, Math.min(11, newZ));
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
      const sway = Math.sin(time * 3 + blade.userData.swayOffset) * 0.15;
      blade.rotation.x = sway;
    }
  });

  mowerLight.intensity = 2 + Math.sin(time * 10) * 0.5;

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
      blade.material.color.setHex(NEON.grassCut);
      blade.scale.y = 0.15;
      blade.position.y = 0.05;
    }
  });
}

function updateHUD() {
  const percent = totalGrass > 0 ? Math.floor((cutGrassCount / totalGrass) * 100) : 0;
  const mowed = grassBlades.filter(b => !b.userData.isTall).length;
  const actualPercent = Math.floor((mowed / totalGrass) * 100);
  document.getElementById('grass-percent').textContent = actualPercent;
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
