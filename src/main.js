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
let totalGrass = 0;
let money = 0;
let completed = false;
let clock = new THREE.Clock();

let playerPos = new THREE.Vector3(-6, 1.6, 6);
let playerYaw = 0;
let playerPitch = 0;
let isPointerLocked = false;

let neighbor = null;
let neighborState = 'waiting';
let neighborAnger = 0;
let showingDialog = false;
let playerHealth = 100;

const keys = { w: false, a: false, s: false, d: false, space: false };

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
  fence: 0xFAF8F5,
  tree: 0x2E7D32,
  trunk: 0x5D4037,
  neighborShirt: 0xCC3333,
  neighborSkin: 0xD4A574,
  neighborPants: 0x2D4A6D,
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
  createNeighborHouse();
  createPath();
  createGrass();
  createMower();
  createPicketFence();
  createTrees();
  createNeighbor();

  setupControls();
  window.addEventListener('resize', onWindowResize);
  document.getElementById('restart-btn').addEventListener('click', restartGame);

  renderer.domElement.addEventListener('click', () => {
    if (!showingDialog) {
      renderer.domElement.requestPointerLock();
    }
  });

  document.addEventListener('pointerlockchange', () => {
    isPointerLocked = document.pointerLockElement === renderer.domElement;
    if (!showingDialog) {
      document.getElementById('click-prompt').style.display = isPointerLocked ? 'none' : 'flex';
    }
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

function createNeighborHouse() {
  const house = new THREE.Group();

  const wallGeo = new THREE.BoxGeometry(5, 3.5, 4);
  const wallMat = new THREE.MeshLambertMaterial({ color: 0xB8860B });
  const walls = new THREE.Mesh(wallGeo, wallMat);
  walls.position.y = 1.75;
  walls.castShadow = true;
  house.add(walls);

  const roofGeo = new THREE.ConeGeometry(4, 2, 4);
  const roofMat = new THREE.MeshLambertMaterial({ color: 0x4A4A4A });
  const roof = new THREE.Mesh(roofGeo, roofMat);
  roof.position.y = 4.5;
  roof.rotation.y = Math.PI / 4;
  roof.castShadow = true;
  house.add(roof);

  const doorGeo = new THREE.BoxGeometry(0.9, 2, 0.1);
  const doorMat = new THREE.MeshLambertMaterial({ color: 0x8B0000 });
  const door = new THREE.Mesh(doorGeo, doorMat);
  door.position.set(0, 1, 2.01);
  house.add(door);

  house.position.set(-18, 0, 0);
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

function createPicketFence() {
  const fenceMat = new THREE.MeshLambertMaterial({ color: COLORS.fence });
  
  const createPicket = (x, z, rotY = 0) => {
    const picket = new THREE.Group();
    
    const postGeo = new THREE.BoxGeometry(0.08, 1.0, 0.02);
    const post = new THREE.Mesh(postGeo, fenceMat);
    post.position.y = 0.5;
    picket.add(post);
    
    const pointGeo = new THREE.ConeGeometry(0.055, 0.15, 4);
    const point = new THREE.Mesh(pointGeo, fenceMat);
    point.position.y = 1.08;
    point.rotation.y = Math.PI / 4;
    picket.add(point);
    
    picket.position.set(x, 0, z);
    picket.rotation.y = rotY;
    picket.castShadow = true;
    return picket;
  };

  const createFenceSection = (startX, startZ, endX, endZ, count) => {
    const section = new THREE.Group();
    
    for (let i = 0; i <= count; i++) {
      const t = i / count;
      const x = startX + (endX - startX) * t;
      const z = startZ + (endZ - startZ) * t;
      const picket = createPicket(x, z);
      section.add(picket);
    }
    
    const railGeo = new THREE.BoxGeometry(
      Math.sqrt(Math.pow(endX - startX, 2) + Math.pow(endZ - startZ, 2)) + 0.1,
      0.06, 0.02
    );
    const angle = Math.atan2(endZ - startZ, endX - startX);
    
    [0.25, 0.65].forEach(y => {
      const rail = new THREE.Mesh(railGeo, fenceMat);
      rail.position.set((startX + endX) / 2, y, (startZ + endZ) / 2);
      rail.rotation.y = -angle;
      section.add(rail);
    });
    
    return section;
  };

  const fenceSize = 10;
  const picketSpacing = 0.18;
  
  for (let x = -fenceSize; x < fenceSize; x += 2) {
    if (x > -1.5 && x < 1.5) continue;
    const count = Math.floor(2 / picketSpacing);
    const section = createFenceSection(x, fenceSize, x + 2, fenceSize, count);
    scene.add(section);
  }

  for (let z = -fenceSize; z < fenceSize; z += 2) {
    const count = Math.floor(2 / picketSpacing);
    const sectionRight = createFenceSection(fenceSize, z, fenceSize, z + 2, count);
    scene.add(sectionRight);
    
    if (z > -2 && z < 2) continue;
    const sectionLeft = createFenceSection(-fenceSize, z, -fenceSize, z + 2, count);
    scene.add(sectionLeft);
  }

  const postGeo = new THREE.CylinderGeometry(0.08, 0.1, 1.3, 8);
  const corners = [
    [fenceSize, fenceSize], [fenceSize, -fenceSize],
    [-fenceSize, fenceSize], [-fenceSize, -fenceSize]
  ];
  corners.forEach(([x, z]) => {
    const post = new THREE.Mesh(postGeo, fenceMat);
    post.position.set(x, 0.65, z);
    post.castShadow = true;
    scene.add(post);
    
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), fenceMat);
    cap.position.set(x, 1.3, z);
    scene.add(cap);
  });
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

function createNeighbor() {
  neighbor = new THREE.Group();

  const headGeo = new THREE.SphereGeometry(0.25, 16, 12);
  const headMat = new THREE.MeshLambertMaterial({ color: COLORS.neighborSkin });
  const head = new THREE.Mesh(headGeo, headMat);
  head.position.y = 1.55;
  head.scale.set(1, 1.1, 0.95);
  head.castShadow = true;
  neighbor.add(head);

  const hairGeo = new THREE.SphereGeometry(0.26, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.4);
  const hairMat = new THREE.MeshLambertMaterial({ color: 0x2D2D2D });
  const hair = new THREE.Mesh(hairGeo, hairMat);
  hair.position.y = 1.6;
  neighbor.add(hair);

  const eyeWhiteMat = new THREE.MeshLambertMaterial({ color: 0xFFFFFF });
  const eyePupilMat = new THREE.MeshLambertMaterial({ color: 0x000000 });
  
  [-0.08, 0.08].forEach(x => {
    const eyeWhite = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), eyeWhiteMat);
    eyeWhite.position.set(x, 1.58, 0.2);
    eyeWhite.scale.set(0.8, 1, 0.5);
    neighbor.add(eyeWhite);

    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.025, 6, 4), eyePupilMat);
    pupil.position.set(x, 1.58, 0.23);
    neighbor.add(pupil);
  });

  const eyebrowMat = new THREE.MeshLambertMaterial({ color: 0x2D2D2D });
  neighbor.userData.eyebrows = [];
  [-0.08, 0.08].forEach((x, i) => {
    const eyebrow = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.02, 0.02), eyebrowMat);
    eyebrow.position.set(x, 1.68, 0.2);
    eyebrow.rotation.z = i === 0 ? -0.4 : 0.4;
    neighbor.add(eyebrow);
    neighbor.userData.eyebrows.push(eyebrow);
  });

  const mouthGeo = new THREE.BoxGeometry(0.1, 0.03, 0.02);
  const mouthMat = new THREE.MeshLambertMaterial({ color: 0x8B4513 });
  const mouth = new THREE.Mesh(mouthGeo, mouthMat);
  mouth.position.set(0, 1.42, 0.22);
  neighbor.add(mouth);
  neighbor.userData.mouth = mouth;

  const torsoGeo = new THREE.CylinderGeometry(0.2, 0.25, 0.55, 12);
  const torsoMat = new THREE.MeshLambertMaterial({ color: COLORS.neighborShirt });
  const torso = new THREE.Mesh(torsoGeo, torsoMat);
  torso.position.y = 1.1;
  torso.castShadow = true;
  neighbor.add(torso);

  const armGeo = new THREE.CylinderGeometry(0.05, 0.06, 0.45, 8);
  const armMat = new THREE.MeshLambertMaterial({ color: COLORS.neighborShirt });
  
  const leftArm = new THREE.Group();
  leftArm.position.set(-0.28, 1.15, 0);
  const leftArmMesh = new THREE.Mesh(armGeo, armMat);
  leftArmMesh.castShadow = true;
  leftArm.add(leftArmMesh);
  const leftFist = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), headMat);
  leftFist.position.y = -0.28;
  leftArm.add(leftFist);
  neighbor.add(leftArm);
  neighbor.userData.leftArm = leftArm;

  const rightArm = new THREE.Group();
  rightArm.position.set(0.28, 1.15, 0);
  const rightArmMesh = new THREE.Mesh(armGeo, armMat);
  rightArmMesh.castShadow = true;
  rightArm.add(rightArmMesh);
  const rightFist = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), headMat);
  rightFist.position.y = -0.28;
  rightArm.add(rightFist);
  neighbor.add(rightArm);
  neighbor.userData.rightArm = rightArm;

  const legGeo = new THREE.CylinderGeometry(0.07, 0.08, 0.5, 8);
  const legMat = new THREE.MeshLambertMaterial({ color: COLORS.neighborPants });
  const shoeMat = new THREE.MeshLambertMaterial({ color: 0x1A1A1A });

  const leftLeg = new THREE.Group();
  leftLeg.position.set(-0.1, 0.55, 0);
  const leftLegMesh = new THREE.Mesh(legGeo, legMat);
  leftLegMesh.castShadow = true;
  leftLeg.add(leftLegMesh);
  const leftShoe = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, 0.2), shoeMat);
  leftShoe.position.set(0, -0.28, 0.04);
  leftLeg.add(leftShoe);
  neighbor.add(leftLeg);
  neighbor.userData.leftLeg = leftLeg;

  const rightLeg = new THREE.Group();
  rightLeg.position.set(0.1, 0.55, 0);
  const rightLegMesh = new THREE.Mesh(legGeo, legMat);
  rightLegMesh.castShadow = true;
  rightLeg.add(rightLegMesh);
  const rightShoe = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, 0.2), shoeMat);
  rightShoe.position.set(0, -0.28, 0.04);
  rightLeg.add(rightShoe);
  neighbor.add(rightLeg);
  neighbor.userData.rightLeg = rightLeg;

  neighbor.position.set(-15, 0, 0);
  neighbor.visible = false;
  scene.add(neighbor);
}

function createGrass() {
  grassBlades = [];
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
    if (e.code === 'Space') keys.space = true;
    
    if (e.code === 'Space' && showingDialog) {
      hideDialog();
      neighborState = 'fighting';
    }
  });

  window.addEventListener('keyup', (e) => {
    if (e.code === 'KeyW') keys.w = false;
    if (e.code === 'KeyA') keys.a = false;
    if (e.code === 'KeyS') keys.s = false;
    if (e.code === 'KeyD') keys.d = false;
    if (e.code === 'Space') keys.space = false;
  });

  window.addEventListener('mousemove', (e) => {
    if (!isPointerLocked || showingDialog) return;

    playerYaw -= e.movementX * MOUSE_SENSITIVITY;
    playerPitch -= e.movementY * MOUSE_SENSITIVITY;
    playerPitch = Math.max(-Math.PI / 3, Math.min(Math.PI / 3, playerPitch));
  });

  window.addEventListener('click', () => {
    if (neighborState === 'fighting' && isPointerLocked) {
      const dist = playerPos.distanceTo(neighbor.position);
      if (dist < 3) {
        neighborAnger -= 25;
        neighbor.position.x -= 0.5;
        if (neighborAnger <= 0) {
          neighborState = 'retreating';
          showDialog('NABOEN', 'Okay okay, jeg giver op! Slå dit græs...');
          setTimeout(hideDialog, 2000);
        }
      }
    }
  });
}

function showDialog(speaker, text) {
  showingDialog = true;
  document.getElementById('dialog-box').classList.remove('hidden');
  document.getElementById('dialog-speaker').textContent = speaker;
  document.getElementById('dialog-text').textContent = text;
  document.getElementById('click-prompt').style.display = 'none';
  document.exitPointerLock();
}

function hideDialog() {
  showingDialog = false;
  document.getElementById('dialog-box').classList.add('hidden');
  renderer.domElement.requestPointerLock();
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
  playerHealth = 100;
  completed = false;
  neighborState = 'waiting';
  neighborAnger = 0;
  neighbor.visible = false;
  neighbor.position.set(-15, 0, 0);
  document.getElementById('completion-modal').classList.add('hidden');
  document.getElementById('health-bar').classList.add('hidden');
  updateHUD();
}

function updateNeighbor() {
  const time = clock.getElapsedTime();
  const mowed = grassBlades.filter(b => !b.userData.isTall).length;
  const percent = (mowed / totalGrass) * 100;

  if (neighborState === 'waiting' && percent > 20) {
    neighborState = 'approaching';
    neighbor.visible = true;
    neighbor.position.set(-12, 0, 0);
    showDialog('SUR NABO', 'HEY! Kan du ikke stoppe den larm?! Jeg prøver at sove!');
    setTimeout(() => {
      hideDialog();
      showDialog('SUR NABO', 'Jeg kommer over og smadrer dig!');
      setTimeout(hideDialog, 2000);
    }, 2500);
    document.getElementById('health-bar').classList.remove('hidden');
    neighborAnger = 100;
  }

  if (neighborState === 'approaching' && !showingDialog) {
    const dir = new THREE.Vector3();
    dir.subVectors(playerPos, neighbor.position);
    dir.y = 0;
    dir.normalize();
    
    neighbor.position.x += dir.x * 0.04;
    neighbor.position.z += dir.z * 0.04;
    neighbor.lookAt(playerPos.x, neighbor.position.y, playerPos.z);

    const walkCycle = Math.sin(time * 10) * 0.4;
    neighbor.userData.leftLeg.rotation.x = walkCycle;
    neighbor.userData.rightLeg.rotation.x = -walkCycle;

    const dist = playerPos.distanceTo(neighbor.position);
    if (dist < 2) {
      neighborState = 'fighting';
      showDialog('SUR NABO', 'Nu skal du få TÆSK!');
      setTimeout(hideDialog, 1500);
    }
  }

  if (neighborState === 'fighting' && !showingDialog) {
    neighbor.lookAt(playerPos.x, neighbor.position.y, playerPos.z);
    
    const punchCycle = Math.sin(time * 8);
    neighbor.userData.leftArm.rotation.x = punchCycle > 0 ? -punchCycle * 1.5 : 0;
    neighbor.userData.rightArm.rotation.x = punchCycle < 0 ? punchCycle * 1.5 : 0;

    neighbor.userData.eyebrows.forEach((eb, i) => {
      eb.rotation.z = i === 0 ? -0.6 : 0.6;
    });

    const dist = playerPos.distanceTo(neighbor.position);
    if (dist < 2 && Math.random() < 0.02) {
      playerHealth -= 5;
      document.getElementById('health-fill').style.width = playerHealth + '%';
      
      if (playerHealth <= 0) {
        showDialog('GAME OVER', 'Naboen slog dig ud! Tryk R for at prøve igen.');
        neighborState = 'won';
      }
    }

    if (dist > 2) {
      const dir = new THREE.Vector3();
      dir.subVectors(playerPos, neighbor.position);
      dir.y = 0;
      dir.normalize();
      neighbor.position.x += dir.x * 0.06;
      neighbor.position.z += dir.z * 0.06;
    }
  }

  if (neighborState === 'retreating') {
    const dir = new THREE.Vector3(-15 - neighbor.position.x, 0, 0 - neighbor.position.z);
    dir.normalize();
    neighbor.position.x += dir.x * 0.05;
    neighbor.position.z += dir.z * 0.05;
    neighbor.lookAt(neighbor.position.x + dir.x, neighbor.position.y, neighbor.position.z + dir.z);

    const walkCycle = Math.sin(time * 10) * 0.4;
    neighbor.userData.leftLeg.rotation.x = walkCycle;
    neighbor.userData.rightLeg.rotation.x = -walkCycle;

    if (neighbor.position.x < -14) {
      neighbor.visible = false;
      neighborState = 'defeated';
      document.getElementById('health-bar').classList.add('hidden');
    }
  }
}

function update() {
  if (completed || neighborState === 'won') return;

  const moveDir = new THREE.Vector3();
  
  if (keys.w) moveDir.z -= 1;
  if (keys.s) moveDir.z += 1;
  if (keys.a) moveDir.x -= 1;
  if (keys.d) moveDir.x += 1;

  if (moveDir.length() > 0 && !showingDialog) {
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

  updateNeighbor();
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
