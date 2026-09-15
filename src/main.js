import * as THREE from 'three';

const WORLD_SIZE = 30;
const GRASS_DENSITY = 6;
const PLAYER_SPEED = 0.1;
const MOUSE_SENSITIVITY = 0.002;
const MOW_RADIUS = 1.0;
const MOW_REWARD = 100;

let scene, camera, renderer;
let mower;
let grassBlades = [];
let totalGrass = 0;
let money = 0;
let completed = false;
let clock = new THREE.Clock();

let playerPos = new THREE.Vector3(-6, 1.5, 6);
let playerYaw = 0;
let playerPitch = 0;
let isPointerLocked = false;

let neighbor = null;
let neighborState = 'waiting';
let neighborAnger = 0;
let showingDialog = false;
let playerHealth = 100;

let audioContext = null;
let mowerOscillator = null;
let mowerGain = null;
let ambientStarted = false;

const keys = { w: false, a: false, s: false, d: false, space: false };

const COLORS = {
  skyTop: 0x1a0a2e,
  skyHorizon: 0xff6b35,
  ground: 0x4a6741,
  grassTall: 0x3d5c3a,
  grassCut: 0x6b8e68,
  houseWall: 0xd4c4a8,
  houseBrick: 0x8b4513,
  houseRoof: 0x4a3728,
  houseDoor: 0x5d3a1a,
  houseWindow: 0xffd580,
  windowFrame: 0xf5f5dc,
  mower: 0xcc2222,
  mowerBody: 0x1a1a1a,
  path: 0x8b7355,
  fence: 0xf5f5dc,
  tree: 0x2d4a2d,
  trunk: 0x4a3520,
  neighborShirt: 0xcc3333,
  neighborSkin: 0xd4a574,
  neighborPants: 0x2d4a6d,
  lampPost: 0x2a2a2a,
  lampLight: 0xffdd88,
};

function init() {
  scene = new THREE.Scene();
  
  const skyGeo = new THREE.SphereGeometry(100, 32, 32);
  const skyMat = new THREE.ShaderMaterial({
    uniforms: {
      topColor: { value: new THREE.Color(COLORS.skyTop) },
      bottomColor: { value: new THREE.Color(COLORS.skyHorizon) },
    },
    vertexShader: `
      varying vec3 vWorldPosition;
      void main() {
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPosition.xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 topColor;
      uniform vec3 bottomColor;
      varying vec3 vWorldPosition;
      void main() {
        float h = normalize(vWorldPosition).y;
        gl_FragColor = vec4(mix(bottomColor, topColor, max(h, 0.0)), 1.0);
      }
    `,
    side: THREE.BackSide,
  });
  const sky = new THREE.Mesh(skyGeo, skyMat);
  scene.add(sky);

  scene.fog = new THREE.FogExp2(0x2a1a3a, 0.012);

  camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.1, 200);
  camera.position.copy(playerPos);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.8;
  document.getElementById('game-container').prepend(renderer.domElement);

  const ambientLight = new THREE.AmbientLight(0x4a3a5a, 0.4);
  scene.add(ambientLight);

  const sunLight = new THREE.DirectionalLight(0xff8844, 0.8);
  sunLight.position.set(-20, 15, -30);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.width = 2048;
  sunLight.shadow.mapSize.height = 2048;
  sunLight.shadow.camera.near = 0.5;
  sunLight.shadow.camera.far = 100;
  sunLight.shadow.camera.left = -40;
  sunLight.shadow.camera.right = 40;
  sunLight.shadow.camera.top = 40;
  sunLight.shadow.camera.bottom = -40;
  sunLight.shadow.bias = -0.0001;
  scene.add(sunLight);

  const fillLight = new THREE.DirectionalLight(0x6644aa, 0.3);
  fillLight.position.set(10, 10, 20);
  scene.add(fillLight);

  createGround();
  createStreet();
  createHouse();
  createNeighborHouse();
  createPath();
  createGrass();
  createMower();
  createPicketFence();
  createTrees();
  createLampPosts();
  createMailbox();
  createGardenDetails();
  createNeighbor();

  setupControls();
  window.addEventListener('resize', onWindowResize);
  document.getElementById('restart-btn').addEventListener('click', restartGame);

  renderer.domElement.addEventListener('click', () => {
    if (!showingDialog) {
      renderer.domElement.requestPointerLock();
      if (!ambientStarted) {
        initAudio();
        ambientStarted = true;
      }
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
  const groundGeo = new THREE.PlaneGeometry(100, 100, 50, 50);
  const vertices = groundGeo.attributes.position.array;
  for (let i = 0; i < vertices.length; i += 3) {
    vertices[i + 2] += (Math.random() - 0.5) * 0.05;
  }
  groundGeo.computeVertexNormals();
  
  const groundMat = new THREE.MeshLambertMaterial({ color: COLORS.ground });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
}

function createStreet() {
  const streetGeo = new THREE.PlaneGeometry(12, 100);
  const streetMat = new THREE.MeshLambertMaterial({ color: 0x2a2a2a });
  const street = new THREE.Mesh(streetGeo, streetMat);
  street.rotation.x = -Math.PI / 2;
  street.position.set(20, 0.02, 0);
  street.receiveShadow = true;
  scene.add(street);

  const lineGeo = new THREE.PlaneGeometry(0.2, 3);
  const lineMat = new THREE.MeshBasicMaterial({ color: 0xffff00 });
  for (let z = -45; z < 45; z += 8) {
    const line = new THREE.Mesh(lineGeo, lineMat);
    line.rotation.x = -Math.PI / 2;
    line.position.set(20, 0.03, z);
    scene.add(line);
  }

  const sidewalkGeo = new THREE.PlaneGeometry(3, 100);
  const sidewalkMat = new THREE.MeshLambertMaterial({ color: 0x888888 });
  const sidewalk = new THREE.Mesh(sidewalkGeo, sidewalkMat);
  sidewalk.rotation.x = -Math.PI / 2;
  sidewalk.position.set(12.5, 0.03, 0);
  sidewalk.receiveShadow = true;
  scene.add(sidewalk);
}

function createHouse() {
  const house = new THREE.Group();

  const baseGeo = new THREE.BoxGeometry(8, 0.3, 6);
  const baseMat = new THREE.MeshLambertMaterial({ color: 0x666666 });
  const base = new THREE.Mesh(baseGeo, baseMat);
  base.position.y = 0.15;
  base.castShadow = true;
  house.add(base);

  const wallGeo = new THREE.BoxGeometry(8, 4, 6);
  const wallMat = new THREE.MeshLambertMaterial({ color: COLORS.houseWall });
  const walls = new THREE.Mesh(wallGeo, wallMat);
  walls.position.y = 2.3;
  walls.castShadow = true;
  walls.receiveShadow = true;
  house.add(walls);

  const brickMat = new THREE.MeshLambertMaterial({ color: COLORS.houseBrick });
  for (let y = 0; y < 3; y++) {
    for (let x = -3.5; x < 3.5; x += 0.6) {
      const offset = (y % 2) * 0.3;
      const brick = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.2, 0.1), brickMat);
      brick.position.set(x + offset, 0.5 + y * 0.25, 3.01);
      house.add(brick);
    }
  }

  const roofGeo = new THREE.ConeGeometry(6.5, 3, 4);
  const roofMat = new THREE.MeshLambertMaterial({ color: COLORS.houseRoof });
  const roof = new THREE.Mesh(roofGeo, roofMat);
  roof.position.y = 5.8;
  roof.rotation.y = Math.PI / 4;
  roof.castShadow = true;
  house.add(roof);

  const chimneyGeo = new THREE.BoxGeometry(0.8, 2, 0.8);
  const chimneyMat = new THREE.MeshLambertMaterial({ color: 0x8b4513 });
  const chimney = new THREE.Mesh(chimneyGeo, chimneyMat);
  chimney.position.set(2.5, 6.5, 0);
  chimney.castShadow = true;
  house.add(chimney);

  const doorGeo = new THREE.BoxGeometry(1.2, 2.4, 0.15);
  const doorMat = new THREE.MeshLambertMaterial({ color: COLORS.houseDoor });
  const door = new THREE.Mesh(doorGeo, doorMat);
  door.position.set(0, 1.5, 3.05);
  house.add(door);

  const doorFrameMat = new THREE.MeshLambertMaterial({ color: COLORS.windowFrame });
  const doorFrame = new THREE.Mesh(new THREE.BoxGeometry(1.4, 2.6, 0.1), doorFrameMat);
  doorFrame.position.set(0, 1.5, 3.02);
  house.add(doorFrame);

  const handleGeo = new THREE.SphereGeometry(0.06);
  const handleMat = new THREE.MeshLambertMaterial({ color: 0xd4af37 });
  const handle = new THREE.Mesh(handleGeo, handleMat);
  handle.position.set(0.4, 1.4, 3.15);
  house.add(handle);

  const porchLightGeo = new THREE.CylinderGeometry(0.1, 0.15, 0.3, 8);
  const porchLightMat = new THREE.MeshBasicMaterial({ color: COLORS.lampLight });
  const porchLight = new THREE.Mesh(porchLightGeo, porchLightMat);
  porchLight.position.set(-0.9, 2.8, 3.1);
  house.add(porchLight);

  const porchGlow = new THREE.PointLight(COLORS.lampLight, 1, 8);
  porchGlow.position.set(-0.9, 2.8, 4);
  house.add(porchGlow);

  const windowPositions = [[-2.5, 2.5, 3.01], [2.5, 2.5, 3.01], [-2.5, 2.5, -3.01], [2.5, 2.5, -3.01]];
  const windowMat = new THREE.MeshBasicMaterial({ color: COLORS.houseWindow });
  const frameMat = new THREE.MeshLambertMaterial({ color: COLORS.windowFrame });
  
  windowPositions.forEach(([x, y, z]) => {
    const win = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.4, 0.1), windowMat);
    win.position.set(x, y, z);
    house.add(win);

    const frame = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.6, 0.08), frameMat);
    frame.position.set(x, y, z > 0 ? z - 0.02 : z + 0.02);
    house.add(frame);

    const dividerH = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.06, 0.12), frameMat);
    dividerH.position.set(x, y, z > 0 ? z + 0.02 : z - 0.02);
    house.add(dividerH);
    
    const dividerV = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.4, 0.12), frameMat);
    dividerV.position.set(x, y, z > 0 ? z + 0.02 : z - 0.02);
    house.add(dividerV);

    const glow = new THREE.PointLight(COLORS.houseWindow, 0.5, 5);
    glow.position.set(x, y, z > 0 ? z + 1 : z - 1);
    house.add(glow);
  });

  const stepsGeo = new THREE.BoxGeometry(1.8, 0.15, 0.5);
  const stepsMat = new THREE.MeshLambertMaterial({ color: 0x666666 });
  for (let i = 0; i < 3; i++) {
    const step = new THREE.Mesh(stepsGeo, stepsMat);
    step.position.set(0, 0.08 + i * 0.15, 3.5 + i * 0.5);
    step.castShadow = true;
    house.add(step);
  }

  house.position.set(0, 0, -5);
  scene.add(house);
}

function createNeighborHouse() {
  const house = new THREE.Group();

  const wallGeo = new THREE.BoxGeometry(7, 4, 5);
  const wallMat = new THREE.MeshLambertMaterial({ color: 0x8fbc8f });
  const walls = new THREE.Mesh(wallGeo, wallMat);
  walls.position.y = 2;
  walls.castShadow = true;
  house.add(walls);

  const roofGeo = new THREE.ConeGeometry(5.5, 2.5, 4);
  const roofMat = new THREE.MeshLambertMaterial({ color: 0x2f4f4f });
  const roof = new THREE.Mesh(roofGeo, roofMat);
  roof.position.y = 5;
  roof.rotation.y = Math.PI / 4;
  roof.castShadow = true;
  house.add(roof);

  const doorMat = new THREE.MeshLambertMaterial({ color: 0x4a0000 });
  const door = new THREE.Mesh(new THREE.BoxGeometry(1, 2.2, 0.1), doorMat);
  door.position.set(0, 1.1, 2.51);
  house.add(door);

  const windowMat = new THREE.MeshBasicMaterial({ color: 0x333333 });
  [[-2, 2.2], [2, 2.2]].forEach(([x, y]) => {
    const win = new THREE.Mesh(new THREE.BoxGeometry(1, 1.2, 0.1), windowMat);
    win.position.set(x, y, 2.51);
    house.add(win);
  });

  house.position.set(-22, 0, -2);
  scene.add(house);
}

function createPath() {
  const pathGeo = new THREE.PlaneGeometry(2.5, 12);
  const pathMat = new THREE.MeshLambertMaterial({ color: COLORS.path });
  const path = new THREE.Mesh(pathGeo, pathMat);
  path.rotation.x = -Math.PI / 2;
  path.position.set(0, 0.02, 2);
  path.receiveShadow = true;
  scene.add(path);

  for (let i = 0; i < 40; i++) {
    const stoneGeo = new THREE.CylinderGeometry(0.08 + Math.random() * 0.1, 0.08, 0.03, 6);
    const stoneMat = new THREE.MeshLambertMaterial({ color: 0x9a8b7a });
    const stone = new THREE.Mesh(stoneGeo, stoneMat);
    stone.position.set(
      (Math.random() - 0.5) * 2,
      0.03,
      Math.random() * 11 - 3
    );
    stone.rotation.y = Math.random() * Math.PI;
    scene.add(stone);
  }
}

function createPicketFence() {
  const fenceMat = new THREE.MeshLambertMaterial({ color: COLORS.fence });
  
  const createPicket = (x, z) => {
    const picket = new THREE.Group();
    
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.1, 0.025), fenceMat);
    post.position.y = 0.55;
    post.castShadow = true;
    picket.add(post);
    
    const point = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.18, 4), fenceMat);
    point.position.y = 1.18;
    point.rotation.y = Math.PI / 4;
    picket.add(point);
    
    picket.position.set(x, 0, z);
    return picket;
  };

  const fenceSize = 10;
  const spacing = 0.15;

  for (let x = -fenceSize; x <= fenceSize; x += spacing) {
    if (x > -1.5 && x < 1.5) continue;
    scene.add(createPicket(x, fenceSize));
  }

  for (let z = -fenceSize; z <= fenceSize; z += spacing) {
    scene.add(createPicket(fenceSize, z));
    if (z > -1.5 && z < 1.5) continue;
    scene.add(createPicket(-fenceSize, z));
  }

  const railGeo = new THREE.BoxGeometry(20, 0.08, 0.04);
  [0.3, 0.75].forEach(y => {
    const rail = new THREE.Mesh(railGeo, fenceMat);
    rail.position.set(0, y, fenceSize);
    scene.add(rail);
  });

  const sideRailGeo = new THREE.BoxGeometry(0.04, 0.08, 20);
  [0.3, 0.75].forEach(y => {
    const railR = new THREE.Mesh(sideRailGeo, fenceMat);
    railR.position.set(fenceSize, y, 0);
    scene.add(railR);
    
    const railL = new THREE.Mesh(sideRailGeo, fenceMat);
    railL.position.set(-fenceSize, y, 0);
    scene.add(railL);
  });

  const postGeo = new THREE.CylinderGeometry(0.1, 0.12, 1.4, 8);
  [[fenceSize, fenceSize], [fenceSize, -fenceSize], [-fenceSize, fenceSize], [-fenceSize, -fenceSize]].forEach(([x, z]) => {
    const post = new THREE.Mesh(postGeo, fenceMat);
    post.position.set(x, 0.7, z);
    post.castShadow = true;
    scene.add(post);
    
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), fenceMat);
    cap.position.set(x, 1.4, z);
    scene.add(cap);
  });
}

function createTrees() {
  const createTree = (x, z, scale = 1) => {
    const tree = new THREE.Group();

    const trunkGeo = new THREE.CylinderGeometry(0.2 * scale, 0.3 * scale, 2 * scale, 8);
    const trunkMat = new THREE.MeshLambertMaterial({ color: COLORS.trunk });
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.y = scale;
    trunk.castShadow = true;
    tree.add(trunk);

    const foliageMat = new THREE.MeshLambertMaterial({ color: COLORS.tree });
    
    const foliage1 = new THREE.Mesh(new THREE.SphereGeometry(1.8 * scale, 8, 6), foliageMat);
    foliage1.position.y = 2.8 * scale;
    foliage1.scale.y = 0.8;
    foliage1.castShadow = true;
    tree.add(foliage1);

    const foliage2 = new THREE.Mesh(new THREE.SphereGeometry(1.4 * scale, 8, 6), foliageMat);
    foliage2.position.set(0.8 * scale, 3.2 * scale, 0);
    foliage2.castShadow = true;
    tree.add(foliage2);

    const foliage3 = new THREE.Mesh(new THREE.SphereGeometry(1.2 * scale, 8, 6), foliageMat);
    foliage3.position.set(-0.6 * scale, 3.5 * scale, 0.5 * scale);
    foliage3.castShadow = true;
    tree.add(foliage3);

    tree.position.set(x, 0, z);
    return tree;
  };

  const treePositions = [
    [-14, -10, 1.2], [-16, 2, 1], [-15, 8, 1.3],
    [14, -8, 1.1], [16, 4, 1.2], [15, 10, 1],
    [-18, -5, 0.9], [18, -2, 1.1], [-13, 12, 1],
    [13, -14, 1.2], [-17, -14, 1.1], [17, 12, 1]
  ];

  treePositions.forEach(([x, z, scale]) => {
    scene.add(createTree(x, z, scale));
  });
}

function createLampPosts() {
  const createLampPost = (x, z) => {
    const lamp = new THREE.Group();

    const poleMat = new THREE.MeshLambertMaterial({ color: COLORS.lampPost });
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 4, 8), poleMat);
    pole.position.y = 2;
    pole.castShadow = true;
    lamp.add(pole);

    const armGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.8, 6);
    const arm = new THREE.Mesh(armGeo, poleMat);
    arm.position.set(0.35, 3.8, 0);
    arm.rotation.z = Math.PI / 2;
    lamp.add(arm);

    const lightHousing = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.15, 0.4, 8), poleMat);
    lightHousing.position.set(0.7, 3.7, 0);
    lamp.add(lightHousing);

    const bulbMat = new THREE.MeshBasicMaterial({ color: COLORS.lampLight });
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), bulbMat);
    bulb.position.set(0.7, 3.45, 0);
    lamp.add(bulb);

    const light = new THREE.PointLight(COLORS.lampLight, 2, 15);
    light.position.set(0.7, 3.4, 0);
    light.castShadow = true;
    lamp.add(light);

    lamp.position.set(x, 0, z);
    return lamp;
  };

  scene.add(createLampPost(11, -8));
  scene.add(createLampPost(11, 8));
}

function createMailbox() {
  const mailbox = new THREE.Group();

  const postMat = new THREE.MeshLambertMaterial({ color: 0x4a3520 });
  const post = new THREE.Mesh(new THREE.BoxGeometry(0.15, 1.2, 0.15), postMat);
  post.position.y = 0.6;
  post.castShadow = true;
  mailbox.add(post);

  const boxMat = new THREE.MeshLambertMaterial({ color: 0x1a1a1a });
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.25, 0.5), boxMat);
  box.position.y = 1.3;
  box.castShadow = true;
  mailbox.add(box);

  const flagMat = new THREE.MeshLambertMaterial({ color: 0xff0000 });
  const flag = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.15, 0.08), flagMat);
  flag.position.set(0.16, 1.35, 0);
  mailbox.add(flag);

  mailbox.position.set(8, 0, 9);
  scene.add(mailbox);
}

function createGardenDetails() {
  const createFlowerBed = (x, z, length) => {
    const bed = new THREE.Group();
    
    const soilMat = new THREE.MeshLambertMaterial({ color: 0x3d2817 });
    const soil = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.15, length), soilMat);
    soil.position.y = 0.08;
    bed.add(soil);

    const borderMat = new THREE.MeshLambertMaterial({ color: 0x8b4513 });
    const border = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.2, length + 0.1), borderMat);
    border.position.y = 0.05;
    bed.add(border);

    for (let i = 0; i < length * 3; i++) {
      const flowerColors = [0xff6b6b, 0xffd93d, 0xff8fd8, 0xffffff, 0x9b59b6];
      const stemMat = new THREE.MeshLambertMaterial({ color: 0x228b22 });
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.3, 4), stemMat);
      stem.position.set(
        (Math.random() - 0.5) * 0.8,
        0.3,
        (Math.random() - 0.5) * (length - 0.2)
      );
      bed.add(stem);

      const petalMat = new THREE.MeshLambertMaterial({ color: flowerColors[Math.floor(Math.random() * flowerColors.length)] });
      const petals = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 4), petalMat);
      petals.position.copy(stem.position);
      petals.position.y += 0.2;
      bed.add(petals);
    }

    bed.position.set(x, 0, z);
    return bed;
  };

  scene.add(createFlowerBed(-3.5, -8.5, 3));
  scene.add(createFlowerBed(3.5, -8.5, 3));

  const gnome = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color: 0x4169e1 });
  const body = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.4, 8), bodyMat);
  body.position.y = 0.2;
  gnome.add(body);
  
  const headMat = new THREE.MeshLambertMaterial({ color: 0xffdab9 });
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), headMat);
  head.position.y = 0.45;
  gnome.add(head);
  
  const hatMat = new THREE.MeshLambertMaterial({ color: 0xff0000 });
  const hat = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.25, 8), hatMat);
  hat.position.y = 0.65;
  gnome.add(hat);
  
  gnome.position.set(5, 0, -7);
  scene.add(gnome);

  const bike = new THREE.Group();
  const frameMat = new THREE.MeshLambertMaterial({ color: 0xff4444 });
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x1a1a1a });
  
  const frame = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.05, 0.05), frameMat);
  frame.position.y = 0.35;
  frame.rotation.z = 0.2;
  bike.add(frame);
  
  const wheel1 = new THREE.Mesh(new THREE.TorusGeometry(0.25, 0.03, 8, 16), wheelMat);
  wheel1.position.set(-0.35, 0.25, 0);
  wheel1.rotation.y = Math.PI / 2;
  bike.add(wheel1);
  
  const wheel2 = new THREE.Mesh(new THREE.TorusGeometry(0.25, 0.03, 8, 16), wheelMat);
  wheel2.position.set(0.35, 0.25, 0);
  wheel2.rotation.y = Math.PI / 2;
  bike.add(wheel2);
  
  bike.position.set(-6, 0, 7);
  bike.rotation.y = 0.3;
  scene.add(bike);
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
  leftArm.add(new THREE.Mesh(armGeo, armMat));
  const leftFist = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), headMat);
  leftFist.position.y = -0.28;
  leftArm.add(leftFist);
  neighbor.add(leftArm);
  neighbor.userData.leftArm = leftArm;

  const rightArm = new THREE.Group();
  rightArm.position.set(0.28, 1.15, 0);
  rightArm.add(new THREE.Mesh(armGeo, armMat));
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
  leftLeg.add(new THREE.Mesh(legGeo, legMat));
  const leftShoe = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, 0.2), shoeMat);
  leftShoe.position.set(0, -0.28, 0.04);
  leftLeg.add(leftShoe);
  neighbor.add(leftLeg);
  neighbor.userData.leftLeg = leftLeg;

  const rightLeg = new THREE.Group();
  rightLeg.position.set(0.1, 0.55, 0);
  rightLeg.add(new THREE.Mesh(legGeo, legMat));
  const rightShoe = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, 0.2), shoeMat);
  rightShoe.position.set(0, -0.28, 0.04);
  rightLeg.add(rightShoe);
  neighbor.add(rightLeg);
  neighbor.userData.rightLeg = rightLeg;

  neighbor.position.set(-18, 0, 0);
  neighbor.visible = false;
  scene.add(neighbor);
}

function initAudio() {
  audioContext = new (window.AudioContext || window.webkitAudioContext)();
  createAmbientSounds();
  createMowerSound();
}

function createAmbientSounds() {
  const windGain = audioContext.createGain();
  windGain.gain.value = 0.025;
  windGain.connect(audioContext.destination);

  const windFilter = audioContext.createBiquadFilter();
  windFilter.type = 'lowpass';
  windFilter.frequency.value = 300;
  windFilter.connect(windGain);

  const bufferSize = 2 * audioContext.sampleRate;
  const noiseBuffer = audioContext.createBuffer(1, bufferSize, audioContext.sampleRate);
  const output = noiseBuffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    output[i] = Math.random() * 2 - 1;
  }

  const windNoise = audioContext.createBufferSource();
  windNoise.buffer = noiseBuffer;
  windNoise.loop = true;
  windNoise.connect(windFilter);
  windNoise.start();

  scheduleBirdSounds();
  scheduleCrickets();
}

function scheduleBirdSounds() {
  const playBird = () => {
    if (!audioContext || audioContext.state === 'closed') return;
    
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();
    
    osc.frequency.value = 2000 + Math.random() * 1000;
    osc.type = 'sine';
    
    gain.gain.setValueAtTime(0, audioContext.currentTime);
    gain.gain.linearRampToValueAtTime(0.03, audioContext.currentTime + 0.05);
    gain.gain.linearRampToValueAtTime(0, audioContext.currentTime + 0.12);
    
    osc.connect(gain);
    gain.connect(audioContext.destination);
    
    osc.start(audioContext.currentTime);
    osc.stop(audioContext.currentTime + 0.15);

    setTimeout(playBird, 3000 + Math.random() * 8000);
  };

  setTimeout(playBird, 2000);
}

function scheduleCrickets() {
  const playCricket = () => {
    if (!audioContext || audioContext.state === 'closed') return;
    
    for (let i = 0; i < 3; i++) {
      const osc = audioContext.createOscillator();
      const gain = audioContext.createGain();
      
      osc.frequency.value = 4000 + Math.random() * 500;
      osc.type = 'sine';
      
      const startTime = audioContext.currentTime + i * 0.08;
      gain.gain.setValueAtTime(0, startTime);
      gain.gain.linearRampToValueAtTime(0.015, startTime + 0.02);
      gain.gain.linearRampToValueAtTime(0, startTime + 0.05);
      
      osc.connect(gain);
      gain.connect(audioContext.destination);
      
      osc.start(startTime);
      osc.stop(startTime + 0.06);
    }

    setTimeout(playCricket, 1000 + Math.random() * 3000);
  };

  setTimeout(playCricket, 1500);
}

function createMowerSound() {
  mowerGain = audioContext.createGain();
  mowerGain.gain.value = 0;
  
  const mowerFilter = audioContext.createBiquadFilter();
  mowerFilter.type = 'lowpass';
  mowerFilter.frequency.value = 600;
  mowerFilter.connect(mowerGain);
  mowerGain.connect(audioContext.destination);

  mowerOscillator = audioContext.createOscillator();
  mowerOscillator.type = 'sawtooth';
  mowerOscillator.frequency.value = 45;
  mowerOscillator.connect(mowerFilter);
  mowerOscillator.start();

  const mowerOsc2 = audioContext.createOscillator();
  mowerOsc2.type = 'square';
  mowerOsc2.frequency.value = 22;
  const gain2 = audioContext.createGain();
  gain2.gain.value = 0.4;
  mowerOsc2.connect(gain2);
  gain2.connect(mowerFilter);
  mowerOsc2.start();

  const lfo = audioContext.createOscillator();
  lfo.frequency.value = 6;
  const lfoGain = audioContext.createGain();
  lfoGain.gain.value = 2;
  lfo.connect(lfoGain);
  lfoGain.connect(mowerOscillator.frequency);
  lfo.start();
}

function updateMowerSound(isMoving) {
  if (!mowerGain) return;
  const targetVolume = isMoving ? 0.06 : 0;
  mowerGain.gain.linearRampToValueAtTime(targetVolume, audioContext.currentTime + 0.1);
}

function createGrass() {
  grassBlades = [];
  totalGrass = 0;

  const bladeGeo = new THREE.ConeGeometry(0.04, 0.4, 4);
  const bladeMat = new THREE.MeshLambertMaterial({ color: COLORS.grassTall });

  const fenceInner = 9.5;
  for (let x = -fenceInner; x < fenceInner; x += 1 / GRASS_DENSITY) {
    for (let z = -fenceInner; z < fenceInner; z += 1 / GRASS_DENSITY) {
      if (isInHouseArea(x, z) || isOnPath(x, z)) continue;

      const blade = new THREE.Mesh(bladeGeo, bladeMat.clone());
      blade.position.set(
        x + (Math.random() - 0.5) * 0.1,
        0.2,
        z + (Math.random() - 0.5) * 0.1
      );
      blade.rotation.x = (Math.random() - 0.5) * 0.2;
      blade.rotation.z = (Math.random() - 0.5) * 0.2;
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
  return x > -5 && x < 5 && z > -10 && z < -1;
}

function isOnPath(x, z) {
  return Math.abs(x) < 1.5 && z > -3 && z < 9;
}

function createMower() {
  mower = new THREE.Group();

  const deckGeo = new THREE.BoxGeometry(0.6, 0.12, 0.8);
  const deckMat = new THREE.MeshLambertMaterial({ color: COLORS.mowerBody });
  const deck = new THREE.Mesh(deckGeo, deckMat);
  deck.position.y = 0.08;
  deck.castShadow = true;
  mower.add(deck);

  const bodyGeo = new THREE.BoxGeometry(0.5, 0.3, 0.6);
  const bodyMat = new THREE.MeshLambertMaterial({ color: COLORS.mower });
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.position.y = 0.28;
  body.castShadow = true;
  mower.add(body);

  const engineGeo = new THREE.CylinderGeometry(0.1, 0.1, 0.15, 8);
  const engineMat = new THREE.MeshLambertMaterial({ color: 0x111111 });
  const engine = new THREE.Mesh(engineGeo, engineMat);
  engine.position.set(0, 0.48, -0.1);
  mower.add(engine);

  const wheelGeo = new THREE.CylinderGeometry(0.1, 0.1, 0.05, 12);
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x1a1a1a });
  const hubMat = new THREE.MeshLambertMaterial({ color: 0x666666 });
  [[-0.28, -0.35], [0.28, -0.35], [-0.28, 0.35], [0.28, 0.35]].forEach(([x, z]) => {
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(x, 0.1, z);
    mower.add(wheel);
    
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.06, 8), hubMat);
    hub.rotation.z = Math.PI / 2;
    hub.position.set(x, 0.1, z);
    mower.add(hub);
  });

  const handleMat = new THREE.MeshLambertMaterial({ color: 0x333333 });
  
  const leftHandle = new THREE.Group();
  const leftPole = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.9, 8), handleMat);
  leftPole.rotation.x = 0.5;
  leftPole.position.y = 0.4;
  leftHandle.add(leftPole);
  leftHandle.position.set(-0.2, 0, -0.5);
  mower.add(leftHandle);

  const rightHandle = new THREE.Group();
  const rightPole = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.9, 8), handleMat);
  rightPole.rotation.x = 0.5;
  rightPole.position.y = 0.4;
  rightHandle.add(rightPole);
  rightHandle.position.set(0.2, 0, -0.5);
  mower.add(rightHandle);

  const gripGeo = new THREE.CylinderGeometry(0.035, 0.035, 0.5, 8);
  const gripMat = new THREE.MeshLambertMaterial({ color: 0x111111 });
  const grip = new THREE.Mesh(gripGeo, gripMat);
  grip.rotation.z = Math.PI / 2;
  grip.position.set(0, 0.85, -0.9);
  mower.add(grip);

  mower.position.set(playerPos.x, 0, playerPos.z + 1.2);
  scene.add(mower);
}

function setupControls() {
  window.addEventListener('keydown', (e) => {
    if (e.code === 'KeyW') keys.w = true;
    if (e.code === 'KeyA') keys.a = true;
    if (e.code === 'KeyS') keys.s = true;
    if (e.code === 'KeyD') keys.d = true;
    if (e.code === 'Space') keys.space = true;
    if (e.code === 'KeyR' && neighborState === 'won') restartGame();
    
    if (e.code === 'Space' && showingDialog) {
      hideDialog();
      if (neighborState === 'approaching') neighborState = 'fighting';
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
    playerPitch = Math.max(-Math.PI / 4, Math.min(Math.PI / 4, playerPitch));
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
  playerPos.set(-6, 1.5, 6);
  playerYaw = 0;
  playerPitch = 0;
  playerHealth = 100;
  completed = false;
  neighborState = 'waiting';
  neighborAnger = 0;
  neighbor.visible = false;
  neighbor.position.set(-18, 0, 0);
  document.getElementById('completion-modal').classList.add('hidden');
  document.getElementById('health-bar').classList.add('hidden');
  document.getElementById('health-fill').style.width = '100%';
  updateHUD();
}

function updateNeighbor() {
  const time = clock.getElapsedTime();
  const mowed = grassBlades.filter(b => !b.userData.isTall).length;
  const percent = (mowed / totalGrass) * 100;

  if (neighborState === 'waiting' && percent > 25) {
    neighborState = 'approaching';
    neighbor.visible = true;
    neighbor.position.set(-12, 0, 0);
    showDialog('SUR NABO', 'HEY! Kan du ikke stoppe den larm?! Det er søndag formiddag!');
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

    if (playerPos.distanceTo(neighbor.position) < 2) {
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

    if (playerPos.distanceTo(neighbor.position) < 2 && Math.random() < 0.02) {
      playerHealth -= 5;
      document.getElementById('health-fill').style.width = playerHealth + '%';
      
      if (playerHealth <= 0) {
        showDialog('GAME OVER', 'Naboen slog dig ud! Tryk R for at prøve igen.');
        neighborState = 'won';
      }
    }

    if (playerPos.distanceTo(neighbor.position) > 2) {
      const dir = new THREE.Vector3();
      dir.subVectors(playerPos, neighbor.position);
      dir.y = 0;
      dir.normalize();
      neighbor.position.x += dir.x * 0.05;
      neighbor.position.z += dir.z * 0.05;
    }
  }

  if (neighborState === 'retreating') {
    const dir = new THREE.Vector3(-18 - neighbor.position.x, 0, 0 - neighbor.position.z);
    dir.normalize();
    neighbor.position.x += dir.x * 0.05;
    neighbor.position.z += dir.z * 0.05;
    neighbor.lookAt(neighbor.position.x + dir.x, neighbor.position.y, neighbor.position.z + dir.z);

    const walkCycle = Math.sin(time * 10) * 0.4;
    neighbor.userData.leftLeg.rotation.x = walkCycle;
    neighbor.userData.rightLeg.rotation.x = -walkCycle;

    if (neighbor.position.x < -16) {
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

  const isMoving = moveDir.length() > 0 && !showingDialog;
  
  if (isMoving) {
    moveDir.normalize();
    moveDir.applyAxisAngle(new THREE.Vector3(0, 1, 0), playerYaw);
    
    const newX = playerPos.x + moveDir.x * PLAYER_SPEED;
    const newZ = playerPos.z + moveDir.z * PLAYER_SPEED;

    if (!isInHouseArea(newX, newZ)) {
      playerPos.x = Math.max(-9.3, Math.min(9.3, newX));
      playerPos.z = Math.max(-9.3, Math.min(9.3, newZ));
    }
  }
  
  updateMowerSound(isMoving);

  camera.position.copy(playerPos);
  camera.rotation.order = 'YXZ';
  camera.rotation.y = playerYaw;
  camera.rotation.x = playerPitch;

  const mowerOffset = new THREE.Vector3(0, -0.6, 1.5);
  mowerOffset.applyAxisAngle(new THREE.Vector3(0, 1, 0), playerYaw);
  mower.position.set(
    playerPos.x + mowerOffset.x,
    0,
    playerPos.z + mowerOffset.z
  );
  mower.rotation.y = playerYaw;

  const time = clock.getElapsedTime();
  grassBlades.forEach(blade => {
    if (blade.userData.isTall) {
      const sway = Math.sin(time * 1.5 + blade.userData.swayOffset) * 0.08;
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
      blade.scale.y = 0.12;
      blade.position.y = 0.03;
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
