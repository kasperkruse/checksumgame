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
  sky: 0x9BC4E2,
  ground: 0x7BA05B,
  grassTall: 0x4A9B45,
  grassCut: 0x8FBF7F,
  houseWall: 0xE8DCC8,
  houseRoof: 0x8B5A3C,
  houseDoor: 0x5D4037,
  houseWindow: 0x87CEEB,
  playerShirt: 0xFF8C42,
  playerPants: 0x5D5D5D,
  playerSkin: 0xD4A574,
  playerHair: 0x3D2314,
  eyeWhite: 0xFFFEF0,
  eyePupil: 0x2D2D2D,
  eyebrow: 0x3D2314,
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
  createTrees();

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

  const headGroup = new THREE.Group();
  headGroup.position.y = 1.15;
  
  const headGeo = new THREE.SphereGeometry(0.28, 16, 12);
  const headMat = new THREE.MeshLambertMaterial({ color: COLORS.playerSkin });
  const head = new THREE.Mesh(headGeo, headMat);
  head.scale.set(1, 1.1, 0.95);
  head.castShadow = true;
  headGroup.add(head);

  const hairGeo = new THREE.SphereGeometry(0.29, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.5);
  const hairMat = new THREE.MeshLambertMaterial({ color: COLORS.playerHair });
  const hair = new THREE.Mesh(hairGeo, hairMat);
  hair.position.y = 0.02;
  hair.scale.set(1, 0.8, 0.95);
  headGroup.add(hair);

  const eyeWhiteMat = new THREE.MeshLambertMaterial({ color: COLORS.eyeWhite });
  const eyePupilMat = new THREE.MeshLambertMaterial({ color: COLORS.eyePupil });
  
  [-0.09, 0.09].forEach(x => {
    const eyeWhiteGeo = new THREE.SphereGeometry(0.07, 12, 8);
    const eyeWhite = new THREE.Mesh(eyeWhiteGeo, eyeWhiteMat);
    eyeWhite.position.set(x, 0.03, 0.22);
    eyeWhite.scale.set(0.8, 1, 0.5);
    headGroup.add(eyeWhite);

    const pupilGeo = new THREE.SphereGeometry(0.035, 8, 6);
    const pupil = new THREE.Mesh(pupilGeo, eyePupilMat);
    pupil.position.set(x, 0.03, 0.26);
    headGroup.add(pupil);
  });

  const eyebrowMat = new THREE.MeshLambertMaterial({ color: COLORS.eyebrow });
  [-0.09, 0.09].forEach((x, i) => {
    const eyebrowGeo = new THREE.BoxGeometry(0.08, 0.02, 0.02);
    const eyebrow = new THREE.Mesh(eyebrowGeo, eyebrowMat);
    eyebrow.position.set(x, 0.14, 0.24);
    eyebrow.rotation.z = i === 0 ? 0.15 : -0.15;
    headGroup.add(eyebrow);
  });

  const noseGeo = new THREE.SphereGeometry(0.03, 8, 6);
  const noseMat = new THREE.MeshLambertMaterial({ color: 0xC49660 });
  const nose = new THREE.Mesh(noseGeo, noseMat);
  nose.position.set(0, -0.02, 0.26);
  nose.scale.set(1, 0.8, 0.6);
  headGroup.add(nose);

  const mouthGeo = new THREE.TorusGeometry(0.04, 0.012, 8, 12, Math.PI);
  const mouthMat = new THREE.MeshLambertMaterial({ color: 0x8B5A5A });
  const mouth = new THREE.Mesh(mouthGeo, mouthMat);
  mouth.position.set(0, -0.1, 0.22);
  mouth.rotation.x = Math.PI;
  mouth.rotation.z = Math.PI;
  headGroup.add(mouth);

  const earGeo = new THREE.SphereGeometry(0.05, 8, 6);
  [-0.26, 0.26].forEach(x => {
    const ear = new THREE.Mesh(earGeo, headMat);
    ear.position.set(x, 0, 0);
    ear.scale.set(0.4, 0.7, 0.5);
    headGroup.add(ear);
  });

  player.add(headGroup);
  player.userData.head = headGroup;

  const torsoGeo = new THREE.CylinderGeometry(0.18, 0.22, 0.45, 12);
  const torsoMat = new THREE.MeshLambertMaterial({ color: COLORS.playerShirt });
  const torso = new THREE.Mesh(torsoGeo, torsoMat);
  torso.position.y = 0.7;
  torso.castShadow = true;
  player.add(torso);

  const shoulderGeo = new THREE.SphereGeometry(0.08, 8, 6);
  [-0.22, 0.22].forEach(x => {
    const shoulder = new THREE.Mesh(shoulderGeo, torsoMat);
    shoulder.position.set(x, 0.85, 0);
    shoulder.castShadow = true;
    player.add(shoulder);
  });

  const armGeo = new THREE.CylinderGeometry(0.05, 0.06, 0.35, 8);
  const armMat = new THREE.MeshLambertMaterial({ color: COLORS.playerShirt });
  const skinMat = new THREE.MeshLambertMaterial({ color: COLORS.playerSkin });

  const leftArmGroup = new THREE.Group();
  leftArmGroup.position.set(-0.28, 0.7, 0.1);
  const leftUpperArm = new THREE.Mesh(armGeo, armMat);
  leftUpperArm.rotation.x = -0.4;
  leftUpperArm.castShadow = true;
  leftArmGroup.add(leftUpperArm);
  const leftHand = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), skinMat);
  leftHand.position.set(0, -0.2, 0.08);
  leftArmGroup.add(leftHand);
  player.add(leftArmGroup);

  const rightArmGroup = new THREE.Group();
  rightArmGroup.position.set(0.28, 0.7, 0.1);
  const rightUpperArm = new THREE.Mesh(armGeo, armMat);
  rightUpperArm.rotation.x = -0.4;
  rightUpperArm.castShadow = true;
  rightArmGroup.add(rightUpperArm);
  const rightHand = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), skinMat);
  rightHand.position.set(0, -0.2, 0.08);
  rightArmGroup.add(rightHand);
  player.add(rightArmGroup);

  const legGeo = new THREE.CylinderGeometry(0.06, 0.07, 0.4, 8);
  const legMat = new THREE.MeshLambertMaterial({ color: COLORS.playerPants });
  const shoeMat = new THREE.MeshLambertMaterial({ color: 0x2D2D2D });

  const leftLegGroup = new THREE.Group();
  leftLegGroup.position.set(-0.1, 0.28, 0);
  const leftLeg = new THREE.Mesh(legGeo, legMat);
  leftLeg.castShadow = true;
  leftLegGroup.add(leftLeg);
  const leftShoe = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.06, 0.16), shoeMat);
  leftShoe.position.set(0, -0.22, 0.03);
  leftLegGroup.add(leftShoe);
  player.add(leftLegGroup);
  player.userData.leftLeg = leftLegGroup;

  const rightLegGroup = new THREE.Group();
  rightLegGroup.position.set(0.1, 0.28, 0);
  const rightLeg = new THREE.Mesh(legGeo, legMat);
  rightLeg.castShadow = true;
  rightLegGroup.add(rightLeg);
  const rightShoe = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.06, 0.16), shoeMat);
  rightShoe.position.set(0, -0.22, 0.03);
  rightLegGroup.add(rightShoe);
  player.add(rightLegGroup);
  player.userData.rightLeg = rightLegGroup;

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

function createTrees() {
  const treePositions = [
    [-9, -6], [-11, 2], [-10, 7], [9, -5], [11, 0], [10, 6],
    [-9, -9], [9, -9], [-12, -3], [12, 3]
  ];

  treePositions.forEach(([x, z]) => {
    const tree = new THREE.Group();

    const trunkGeo = new THREE.CylinderGeometry(0.15, 0.2, 1.2, 8);
    const trunkMat = new THREE.MeshLambertMaterial({ color: 0x5D4037 });
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.y = 0.6;
    trunk.castShadow = true;
    tree.add(trunk);

    const foliageMat = new THREE.MeshLambertMaterial({ color: 0x2E7D32 });
    
    const foliage1 = new THREE.Mesh(new THREE.ConeGeometry(1.2, 2, 8), foliageMat);
    foliage1.position.y = 2.2;
    foliage1.castShadow = true;
    tree.add(foliage1);

    const foliage2 = new THREE.Mesh(new THREE.ConeGeometry(0.9, 1.5, 8), foliageMat);
    foliage2.position.y = 3.2;
    foliage2.castShadow = true;
    tree.add(foliage2);

    const foliage3 = new THREE.Mesh(new THREE.ConeGeometry(0.6, 1.2, 8), foliageMat);
    foliage3.position.y = 4;
    foliage3.castShadow = true;
    tree.add(foliage3);

    tree.position.set(x, 0, z);
    tree.rotation.y = Math.random() * Math.PI;
    scene.add(tree);
  });
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
