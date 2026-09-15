import * as THREE from 'three';

const WORLD_SIZE = 20;
const GRASS_DENSITY = 8;
const PLAYER_SPEED = 0.12;
const MOW_RADIUS = 0.8;
const MOW_REWARD = 100;

let scene, camera, renderer;
let player, playerMixer, mower;
let grassBlades = [];
let cutGrassCount = 0;
let totalGrass = 0;
let money = 0;
let completed = false;
let clock = new THREE.Clock();

const keys = { up: false, down: false, left: false, right: false };

const COLORS = {
  sky: 0x87CEEB,
  ground: 0x90B060,
  grassTall: 0x3D8B37,
  grassCut: 0xA8D08D,
  houseWall: 0xE8DCC8,
  houseRoof: 0x8B5A3C,
  houseDoor: 0x5D4037,
  houseWindow: 0x87CEEB,
  playerShirt: 0x4A90D9,
  playerPants: 0x4A5568,
  playerSkin: 0xFFDBAC,
  playerHair: 0x4A3728,
  mower: 0xE53935,
  mowerHandle: 0x424242,
  path: 0xD4C4A8,
};

function init() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(COLORS.sky);
  scene.fog = new THREE.Fog(COLORS.sky, 30, 60);

  camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
  camera.position.set(15, 18, 15);
  camera.lookAt(0, 0, 0);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.VSMShadowMap;
  document.getElementById('game-container').prepend(renderer.domElement);

  const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
  scene.add(ambientLight);

  const sunLight = new THREE.DirectionalLight(0xffffff, 1.0);
  sunLight.position.set(10, 20, 10);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.width = 2048;
  sunLight.shadow.mapSize.height = 2048;
  sunLight.shadow.camera.near = 0.5;
  sunLight.shadow.camera.far = 50;
  sunLight.shadow.camera.left = -20;
  sunLight.shadow.camera.right = 20;
  sunLight.shadow.camera.top = 20;
  sunLight.shadow.camera.bottom = -20;
  scene.add(sunLight);

  createGround();
  createHouse();
  createPath();
  createGrass();
  createPlayer();
  createFence();

  setupControls();
  window.addEventListener('resize', onWindowResize);
  document.getElementById('restart-btn').addEventListener('click', restartGame);

  animate();
}

function createGround() {
  const groundGeo = new THREE.PlaneGeometry(WORLD_SIZE * 2, WORLD_SIZE * 2);
  const groundMat = new THREE.MeshLambertMaterial({ color: COLORS.ground });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
}

function createHouse() {
  const house = new THREE.Group();

  const wallGeo = new THREE.BoxGeometry(5, 3, 4);
  const wallMat = new THREE.MeshLambertMaterial({ color: COLORS.houseWall });
  const walls = new THREE.Mesh(wallGeo, wallMat);
  walls.position.y = 1.5;
  walls.castShadow = true;
  walls.receiveShadow = true;
  house.add(walls);

  const roofGeo = new THREE.ConeGeometry(4, 2, 4);
  const roofMat = new THREE.MeshLambertMaterial({ color: COLORS.houseRoof });
  const roof = new THREE.Mesh(roofGeo, roofMat);
  roof.position.y = 4;
  roof.rotation.y = Math.PI / 4;
  roof.castShadow = true;
  house.add(roof);

  const doorGeo = new THREE.BoxGeometry(0.8, 1.6, 0.1);
  const doorMat = new THREE.MeshLambertMaterial({ color: COLORS.houseDoor });
  const door = new THREE.Mesh(doorGeo, doorMat);
  door.position.set(0, 0.8, 2.01);
  house.add(door);

  const handleGeo = new THREE.SphereGeometry(0.06);
  const handleMat = new THREE.MeshLambertMaterial({ color: 0xFFD700 });
  const handle = new THREE.Mesh(handleGeo, handleMat);
  handle.position.set(0.25, 0.8, 2.12);
  house.add(handle);

  const windowGeo = new THREE.BoxGeometry(0.8, 0.8, 0.1);
  const windowMat = new THREE.MeshLambertMaterial({ color: COLORS.houseWindow });
  
  const window1 = new THREE.Mesh(windowGeo, windowMat);
  window1.position.set(-1.5, 1.8, 2.01);
  house.add(window1);

  const window2 = new THREE.Mesh(windowGeo, windowMat);
  window2.position.set(1.5, 1.8, 2.01);
  house.add(window2);

  const frameGeo = new THREE.BoxGeometry(0.9, 0.05, 0.12);
  const frameMat = new THREE.MeshLambertMaterial({ color: 0xFFFFFF });
  [-1.5, 1.5].forEach(x => {
    const frameH = new THREE.Mesh(frameGeo, frameMat);
    frameH.position.set(x, 1.8, 2.02);
    house.add(frameH);
    const frameV = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.9, 0.12), frameMat);
    frameV.position.set(x, 1.8, 2.02);
    house.add(frameV);
  });

  house.position.set(0, 0, -2);
  house.userData.isHouse = true;
  scene.add(house);
}

function createPath() {
  const pathGeo = new THREE.PlaneGeometry(1.5, 8);
  const pathMat = new THREE.MeshLambertMaterial({ color: COLORS.path });
  const path = new THREE.Mesh(pathGeo, pathMat);
  path.rotation.x = -Math.PI / 2;
  path.position.set(0, 0.01, 4);
  path.receiveShadow = true;
  scene.add(path);

  for (let i = 0; i < 20; i++) {
    const stoneGeo = new THREE.CylinderGeometry(0.1 + Math.random() * 0.1, 0.1, 0.05, 6);
    const stoneMat = new THREE.MeshLambertMaterial({ color: 0xC0B090 });
    const stone = new THREE.Mesh(stoneGeo, stoneMat);
    stone.position.set(
      (Math.random() - 0.5) * 1.2,
      0.02,
      Math.random() * 7 + 0.5
    );
    stone.rotation.y = Math.random() * Math.PI;
    scene.add(stone);
  }
}

function createGrass() {
  grassBlades = [];
  cutGrassCount = 0;
  totalGrass = 0;

  const grassGeo = new THREE.ConeGeometry(0.05, 0.4, 4);
  
  for (let x = -WORLD_SIZE / 2 + 1; x < WORLD_SIZE / 2 - 1; x += 1 / GRASS_DENSITY) {
    for (let z = -WORLD_SIZE / 2 + 1; z < WORLD_SIZE / 2 - 1; z += 1 / GRASS_DENSITY) {
      if (isInHouseArea(x, z) || isOnPath(x, z)) continue;

      const blade = new THREE.Mesh(
        grassGeo,
        new THREE.MeshLambertMaterial({ color: COLORS.grassTall })
      );
      
      blade.position.set(
        x + (Math.random() - 0.5) * 0.1,
        0.2,
        z + (Math.random() - 0.5) * 0.1
      );
      blade.rotation.x = (Math.random() - 0.5) * 0.3;
      blade.rotation.z = (Math.random() - 0.5) * 0.3;
      blade.scale.y = 0.8 + Math.random() * 0.4;
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
  return x > -3.5 && x < 3.5 && z > -5 && z < 1;
}

function isOnPath(x, z) {
  return Math.abs(x) < 0.8 && z > 0 && z < 8;
}

function createPlayer() {
  player = new THREE.Group();

  const bodyGeo = new THREE.BoxGeometry(0.4, 0.5, 0.25);
  const bodyMat = new THREE.MeshLambertMaterial({ color: COLORS.playerShirt });
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.position.y = 0.6;
  body.castShadow = true;
  player.add(body);

  const headGeo = new THREE.BoxGeometry(0.3, 0.3, 0.3);
  const headMat = new THREE.MeshLambertMaterial({ color: COLORS.playerSkin });
  const head = new THREE.Mesh(headGeo, headMat);
  head.position.y = 1.0;
  head.castShadow = true;
  player.add(head);

  const hairGeo = new THREE.BoxGeometry(0.32, 0.12, 0.32);
  const hairMat = new THREE.MeshLambertMaterial({ color: COLORS.playerHair });
  const hair = new THREE.Mesh(hairGeo, hairMat);
  hair.position.y = 1.2;
  player.add(hair);

  const legGeo = new THREE.BoxGeometry(0.15, 0.35, 0.15);
  const legMat = new THREE.MeshLambertMaterial({ color: COLORS.playerPants });
  const leftLeg = new THREE.Mesh(legGeo, legMat);
  leftLeg.position.set(-0.1, 0.18, 0);
  leftLeg.castShadow = true;
  player.add(leftLeg);
  player.userData.leftLeg = leftLeg;

  const rightLeg = new THREE.Mesh(legGeo, legMat);
  rightLeg.position.set(0.1, 0.18, 0);
  rightLeg.castShadow = true;
  player.add(rightLeg);
  player.userData.rightLeg = rightLeg;

  const armGeo = new THREE.BoxGeometry(0.12, 0.4, 0.12);
  const armMat = new THREE.MeshLambertMaterial({ color: COLORS.playerShirt });
  const leftArm = new THREE.Mesh(armGeo, armMat);
  leftArm.position.set(-0.3, 0.55, 0.15);
  leftArm.rotation.x = -0.5;
  player.add(leftArm);

  const rightArm = new THREE.Mesh(armGeo, armMat);
  rightArm.position.set(0.3, 0.55, 0.15);
  rightArm.rotation.x = -0.5;
  player.add(rightArm);

  createMower();

  player.position.set(-5, 0, 5);
  scene.add(player);
}

function createMower() {
  mower = new THREE.Group();

  const bodyGeo = new THREE.BoxGeometry(0.6, 0.3, 0.8);
  const bodyMat = new THREE.MeshLambertMaterial({ color: COLORS.mower });
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.position.y = 0.25;
  body.castShadow = true;
  mower.add(body);

  const engineGeo = new THREE.CylinderGeometry(0.15, 0.15, 0.2, 8);
  const engineMat = new THREE.MeshLambertMaterial({ color: 0x333333 });
  const engine = new THREE.Mesh(engineGeo, engineMat);
  engine.position.set(0, 0.45, -0.1);
  mower.add(engine);

  const wheelGeo = new THREE.CylinderGeometry(0.12, 0.12, 0.08, 12);
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x222222 });
  [[-0.25, -0.3], [0.25, -0.3], [-0.25, 0.3], [0.25, 0.3]].forEach(([x, z]) => {
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(x, 0.12, z);
    mower.add(wheel);
  });

  const handleGeo = new THREE.CylinderGeometry(0.03, 0.03, 1.2, 8);
  const handleMat = new THREE.MeshLambertMaterial({ color: COLORS.mowerHandle });
  
  const leftHandle = new THREE.Mesh(handleGeo, handleMat);
  leftHandle.position.set(-0.2, 0.6, -0.8);
  leftHandle.rotation.x = 0.5;
  mower.add(leftHandle);

  const rightHandle = new THREE.Mesh(handleGeo, handleMat);
  rightHandle.position.set(0.2, 0.6, -0.8);
  rightHandle.rotation.x = 0.5;
  mower.add(rightHandle);

  const gripGeo = new THREE.BoxGeometry(0.5, 0.05, 0.08);
  const gripMat = new THREE.MeshLambertMaterial({ color: 0x111111 });
  const grip = new THREE.Mesh(gripGeo, gripMat);
  grip.position.set(0, 1.0, -1.1);
  mower.add(grip);

  mower.position.set(0, 0, 0.8);
  player.add(mower);
}

function createFence() {
  const postGeo = new THREE.BoxGeometry(0.15, 0.8, 0.15);
  const postMat = new THREE.MeshLambertMaterial({ color: 0xFFFFFF });
  const railGeo = new THREE.BoxGeometry(0.08, 0.08, 1.5);

  for (let i = -8; i <= 8; i += 1.5) {
    if (Math.abs(i) < 1) continue;

    const post1 = new THREE.Mesh(postGeo, postMat);
    post1.position.set(i, 0.4, 8);
    post1.castShadow = true;
    scene.add(post1);

    const post2 = new THREE.Mesh(postGeo, postMat);
    post2.position.set(8, 0.4, i);
    post2.castShadow = true;
    scene.add(post2);

    const post3 = new THREE.Mesh(postGeo, postMat);
    post3.position.set(-8, 0.4, i);
    post3.castShadow = true;
    scene.add(post3);
  }

  for (let i = -8; i < 8; i += 1.5) {
    if (i > -1 && i < 0.5) continue;

    [0.25, 0.55].forEach(y => {
      const rail = new THREE.Mesh(railGeo, postMat);
      rail.position.set(i + 0.75, y, 8);
      scene.add(rail);
    });

    [0.25, 0.55].forEach(y => {
      const rail = new THREE.Mesh(railGeo, postMat);
      rail.rotation.y = Math.PI / 2;
      rail.position.set(8, y, i + 0.75);
      scene.add(rail);

      const rail2 = new THREE.Mesh(railGeo, postMat);
      rail2.rotation.y = Math.PI / 2;
      rail2.position.set(-8, y, i + 0.75);
      scene.add(rail2);
    });
  }
}

function setupControls() {
  const keyMap = {
    'ArrowUp': 'up', 'KeyW': 'up',
    'ArrowDown': 'down', 'KeyS': 'down',
    'ArrowLeft': 'left', 'KeyA': 'left',
    'ArrowRight': 'right', 'KeyD': 'right',
  };

  window.addEventListener('keydown', (e) => {
    if (keyMap[e.code]) {
      keys[keyMap[e.code]] = true;
      e.preventDefault();
    }
  });

  window.addEventListener('keyup', (e) => {
    if (keyMap[e.code]) {
      keys[keyMap[e.code]] = false;
    }
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
  player.position.set(-5, 0, 5);
  player.rotation.y = 0;
  completed = false;
  document.getElementById('completion-modal').classList.add('hidden');
  updateHUD();
}

function update(delta) {
  if (completed) return;

  let dx = 0, dz = 0;
  const isMoving = keys.up || keys.down || keys.left || keys.right;

  if (keys.up) dz -= PLAYER_SPEED;
  if (keys.down) dz += PLAYER_SPEED;
  if (keys.left) dx -= PLAYER_SPEED;
  if (keys.right) dx += PLAYER_SPEED;

  if (dx !== 0 && dz !== 0) {
    dx *= 0.707;
    dz *= 0.707;
  }

  if (dx !== 0 || dz !== 0) {
    player.rotation.y = Math.atan2(dx, dz);
  }

  const newX = player.position.x + dx;
  const newZ = player.position.z + dz;

  if (!isInHouseArea(newX, newZ)) {
    player.position.x = Math.max(-7.5, Math.min(7.5, newX));
    player.position.z = Math.max(-7.5, Math.min(7.5, newZ));
  }

  if (isMoving) {
    const walkCycle = Math.sin(clock.getElapsedTime() * 12) * 0.4;
    player.userData.leftLeg.rotation.x = walkCycle;
    player.userData.rightLeg.rotation.x = -walkCycle;
    player.position.y = Math.abs(Math.sin(clock.getElapsedTime() * 12)) * 0.05;
  } else {
    player.userData.leftLeg.rotation.x = 0;
    player.userData.rightLeg.rotation.x = 0;
    player.position.y = 0;
  }

  const time = clock.getElapsedTime();
  grassBlades.forEach(blade => {
    if (blade.userData.isTall) {
      const sway = Math.sin(time * 2 + blade.userData.swayOffset) * 0.1;
      blade.rotation.x = sway;
      blade.rotation.z = Math.cos(time * 1.5 + blade.userData.swayOffset) * 0.05;
    }
  });

  checkMowing();
  updateHUD();
  checkCompletion();

  camera.position.x = player.position.x + 12;
  camera.position.z = player.position.z + 12;
  camera.lookAt(player.position.x, 0, player.position.z);
}

function checkMowing() {
  const mowerWorldPos = new THREE.Vector3();
  mower.getWorldPosition(mowerWorldPos);

  grassBlades.forEach(blade => {
    if (!blade.userData.isTall) return;

    const dist = Math.sqrt(
      Math.pow(blade.position.x - mowerWorldPos.x, 2) +
      Math.pow(blade.position.z - mowerWorldPos.z, 2)
    );

    if (dist < MOW_RADIUS) {
      blade.userData.isTall = false;
      blade.material.color.setHex(COLORS.grassCut);
      blade.scale.y = 0.2;
      blade.position.y = 0.05;
      blade.rotation.x = Math.PI / 2 * (Math.random() - 0.5);
      cutGrassCount++;
    }
  });
}

function updateHUD() {
  const percent = totalGrass > 0 ? Math.floor((cutGrassCount / totalGrass) * 100) : 0;
  document.getElementById('grass-percent').textContent = percent;
  document.getElementById('money').textContent = money;
}

function checkCompletion() {
  const percent = totalGrass > 0 ? (cutGrassCount / totalGrass) * 100 : 0;

  if (percent >= 100 && !completed) {
    completed = true;
    money += MOW_REWARD;
    document.getElementById('reward-amount').textContent = MOW_REWARD;
    document.getElementById('money').textContent = money;

    setTimeout(() => {
      document.getElementById('completion-modal').classList.remove('hidden');
    }, 500);
  }
}

function animate() {
  requestAnimationFrame(animate);
  const delta = clock.getDelta();
  update(delta);
  renderer.render(scene, camera);
}

document.addEventListener('DOMContentLoaded', init);
