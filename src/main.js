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

let playerPos = new THREE.Vector3(-6, 1.5, 10);
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

// First-person arms and mower handle
let playerArms = null;
let fpMowerHandle = null;
let isPunching = false;
let punchTime = 0;

// Garden gate
let gardenGate = null;
const GATE_POSITION = { x: -14, z: 0 };

// Dog
let dog = null;
let dogTarget = new THREE.Vector3();
let dogWaitTime = 0;

// Yard size
const FENCE_SIZE = 14;

const keys = { w: false, a: false, s: false, d: false, space: false };

// Bright suburban midday color palette
const COLORS = {
  skyTop: 0x4A90D9,
  skyHorizon: 0x87CEEB,
  ground: 0x7CBA5F,
  grassTall: 0x4A8B3C,
  grassCut: 0x8BC34A,
  grassStripeLight: 0x9ACD32,
  grassStripeDark: 0x7CB342,
  houseWall: 0x5B7A9D,
  houseAccent: 0x4A6380,
  houseRoof: 0x4A5568,
  houseTrim: 0xFAFAFA,
  houseDoor: 0x8B4513,
  houseWindow: 0xADD8E6,
  windowFrame: 0xFAFAFA,
  mower: 0xCC2222,
  mowerBody: 0x1a1a1a,
  path: 0xC4B8A8,
  pathStone: 0xA39482,
  fence: 0xFAFAFA,
  fencePost: 0xF0F0F0,
  tree: 0x3D8B3D,
  treeDark: 0x2E7D32,
  trunk: 0x5D4037,
  deck: 0xA0826D,
  deckDark: 0x8B7355,
  umbrella: 0xE8DCC8,
  furniture: 0x8B7355,
  flowerPink: 0xFF69B4,
  flowerYellow: 0xFFD700,
  flowerWhite: 0xFFFAF0,
  flowerPurple: 0x9370DB,
  shrub: 0x228B22,
  shrubDark: 0x1B5E20,
  neighborShirt: 0xCC3333,
  neighborSkin: 0xD4A574,
  neighborPants: 0x2D4A6D,
};

function init() {
  scene = new THREE.Scene();
  
  // Bright blue sky gradient
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
        gl_FragColor = vec4(mix(bottomColor, topColor, max(h * 0.5 + 0.5, 0.0)), 1.0);
      }
    `,
    side: THREE.BackSide,
  });
  const sky = new THREE.Mesh(skyGeo, skyMat);
  scene.add(sky);

  // Add clouds for bright daytime feel
  createClouds();

  // Light fog for depth (bright blue tint, not dark)
  scene.fog = new THREE.FogExp2(0x87CEEB, 0.008);

  camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.1, 200);
  camera.position.copy(playerPos);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.4;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  document.getElementById('game-container').prepend(renderer.domElement);

  // Bright midday lighting
  const ambientLight = new THREE.AmbientLight(0xFFFFFF, 0.6);
  scene.add(ambientLight);

  // Strong white sun (midday position)
  const sunLight = new THREE.DirectionalLight(0xFFFAF0, 1.2);
  sunLight.position.set(15, 30, 10);
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
  sunLight.shadow.radius = 2;
  scene.add(sunLight);

  // Sky fill light (blue bounce from sky)
  const fillLight = new THREE.DirectionalLight(0x87CEEB, 0.4);
  fillLight.position.set(-10, 10, 20);
  scene.add(fillLight);

  // Back rim light
  const backLight = new THREE.DirectionalLight(0xFFE4B5, 0.3);
  backLight.position.set(-15, 15, -20);
  scene.add(backLight);

  // Hemisphere light for natural outdoor feel
  const hemi = new THREE.HemisphereLight(0x87CEEB, 0x7CBA5F, 0.4);
  scene.add(hemi);

  createGround();
  createStreet();
  createHouse();
  createNeighborHouse();
  createDeck();
  createPath();
  createGrass();
  createMower();
  createPicketFence();
  createGardenGate();
  createTrees();
  createShrubs();
  createFlowerBeds();
  createMailbox();
  createNeighbor();
  createDog();
  createFirstPersonArms();
  createFirstPersonMower();

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

function createClouds() {
  const cloudMat = new THREE.MeshBasicMaterial({ 
    color: 0xFFFFFF,
    transparent: true,
    opacity: 0.9
  });
  
  const cloudPositions = [
    { x: -30, y: 35, z: -40, scale: 1.2 },
    { x: 20, y: 40, z: -50, scale: 1.5 },
    { x: 45, y: 38, z: -30, scale: 1.0 },
    { x: -50, y: 42, z: -20, scale: 1.3 },
    { x: 10, y: 45, z: -60, scale: 1.1 },
    { x: -20, y: 38, z: 50, scale: 1.4 },
    { x: 35, y: 43, z: 40, scale: 1.2 },
  ];

  cloudPositions.forEach(pos => {
    const cloud = new THREE.Group();
    
    for (let i = 0; i < 5; i++) {
      const puff = new THREE.Mesh(
        new THREE.SphereGeometry(3 + Math.random() * 2, 8, 6),
        cloudMat
      );
      puff.position.set(
        (Math.random() - 0.5) * 8,
        (Math.random() - 0.5) * 2,
        (Math.random() - 0.5) * 4
      );
      puff.scale.y = 0.6;
      cloud.add(puff);
    }
    
    cloud.position.set(pos.x, pos.y, pos.z);
    cloud.scale.setScalar(pos.scale);
    scene.add(cloud);
  });
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
  const streetMat = new THREE.MeshLambertMaterial({ color: 0x505050 });
  const street = new THREE.Mesh(streetGeo, streetMat);
  street.rotation.x = -Math.PI / 2;
  street.position.set(20, 0.02, 0);
  street.receiveShadow = true;
  scene.add(street);

  const lineGeo = new THREE.PlaneGeometry(0.2, 3);
  const lineMat = new THREE.MeshBasicMaterial({ color: 0xFFFF00 });
  for (let z = -45; z < 45; z += 8) {
    const line = new THREE.Mesh(lineGeo, lineMat);
    line.rotation.x = -Math.PI / 2;
    line.position.set(20, 0.03, z);
    scene.add(line);
  }

  const sidewalkGeo = new THREE.PlaneGeometry(3, 100);
  const sidewalkMat = new THREE.MeshLambertMaterial({ color: 0xB8B8B8 });
  const sidewalk = new THREE.Mesh(sidewalkGeo, sidewalkMat);
  sidewalk.rotation.x = -Math.PI / 2;
  sidewalk.position.set(12.5, 0.03, 0);
  sidewalk.receiveShadow = true;
  scene.add(sidewalk);
}

function createHouse() {
  const house = new THREE.Group();

  // Foundation
  const baseGeo = new THREE.BoxGeometry(8, 0.3, 6);
  const baseMat = new THREE.MeshLambertMaterial({ color: 0x808080 });
  const base = new THREE.Mesh(baseGeo, baseMat);
  base.position.y = 0.15;
  base.castShadow = true;
  house.add(base);

  // Blue siding walls
  const wallGeo = new THREE.BoxGeometry(8, 4, 6);
  const wallMat = new THREE.MeshLambertMaterial({ color: COLORS.houseWall });
  const walls = new THREE.Mesh(wallGeo, wallMat);
  walls.position.y = 2.3;
  walls.castShadow = true;
  walls.receiveShadow = true;
  house.add(walls);

  // White trim on corners
  const trimMat = new THREE.MeshLambertMaterial({ color: COLORS.houseTrim });
  const cornerTrimGeo = new THREE.BoxGeometry(0.2, 4, 0.2);
  [[-3.9, 2.3, 2.9], [3.9, 2.3, 2.9], [-3.9, 2.3, -2.9], [3.9, 2.3, -2.9]].forEach(([x, y, z]) => {
    const trim = new THREE.Mesh(cornerTrimGeo, trimMat);
    trim.position.set(x, y, z);
    house.add(trim);
  });

  // Gray roof
  const roofGeo = new THREE.ConeGeometry(6.5, 3, 4);
  const roofMat = new THREE.MeshLambertMaterial({ color: COLORS.houseRoof });
  const roof = new THREE.Mesh(roofGeo, roofMat);
  roof.position.y = 5.8;
  roof.rotation.y = Math.PI / 4;
  roof.castShadow = true;
  house.add(roof);

  // Roof edge trim
  const roofEdge = new THREE.Mesh(new THREE.BoxGeometry(8.5, 0.15, 6.5), trimMat);
  roofEdge.position.y = 4.35;
  house.add(roofEdge);

  // Chimney
  const chimneyGeo = new THREE.BoxGeometry(0.8, 2, 0.8);
  const chimneyMat = new THREE.MeshLambertMaterial({ color: 0x8b4513 });
  const chimney = new THREE.Mesh(chimneyGeo, chimneyMat);
  chimney.position.set(2.5, 6.5, 0);
  chimney.castShadow = true;
  house.add(chimney);

  // Brown door
  const doorGeo = new THREE.BoxGeometry(1.2, 2.4, 0.15);
  const doorMat = new THREE.MeshLambertMaterial({ color: COLORS.houseDoor });
  const door = new THREE.Mesh(doorGeo, doorMat);
  door.position.set(0, 1.5, 3.05);
  house.add(door);

  // Door frame (white)
  const doorFrame = new THREE.Mesh(new THREE.BoxGeometry(1.4, 2.6, 0.1), trimMat);
  doorFrame.position.set(0, 1.5, 3.02);
  house.add(doorFrame);

  // Door handle
  const handleGeo = new THREE.SphereGeometry(0.06);
  const handleMat = new THREE.MeshLambertMaterial({ color: 0xD4AF37 });
  const handle = new THREE.Mesh(handleGeo, handleMat);
  handle.position.set(0.4, 1.4, 3.15);
  house.add(handle);

  // Windows with blue glass and white frames
  const windowMat = new THREE.MeshBasicMaterial({ color: COLORS.houseWindow });
  const frameMat = new THREE.MeshLambertMaterial({ color: COLORS.windowFrame });
  
  const windowPositions = [[-2.5, 2.5, 3.01], [2.5, 2.5, 3.01], [-2.5, 2.5, -3.01], [2.5, 2.5, -3.01]];
  
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
  });

  // Front steps
  const stepsGeo = new THREE.BoxGeometry(1.8, 0.15, 0.5);
  const stepsMat = new THREE.MeshLambertMaterial({ color: 0x808080 });
  for (let i = 0; i < 3; i++) {
    const step = new THREE.Mesh(stepsGeo, stepsMat);
    step.position.set(0, 0.08 + i * 0.15, 3.5 + i * 0.5);
    step.castShadow = true;
    house.add(step);
  }

  house.position.set(0, 0, 0);
  scene.add(house);
}

function createNeighborHouse() {
  const house = new THREE.Group();

  // Green walls
  const wallGeo = new THREE.BoxGeometry(7, 4, 5);
  const wallMat = new THREE.MeshLambertMaterial({ color: 0x6B8E6B });
  const walls = new THREE.Mesh(wallGeo, wallMat);
  walls.position.y = 2;
  walls.castShadow = true;
  house.add(walls);

  // Dark roof
  const roofGeo = new THREE.ConeGeometry(5.5, 2.5, 4);
  const roofMat = new THREE.MeshLambertMaterial({ color: 0x3D5A5A });
  const roof = new THREE.Mesh(roofGeo, roofMat);
  roof.position.y = 5;
  roof.rotation.y = Math.PI / 4;
  roof.castShadow = true;
  house.add(roof);

  // Dark red door
  const doorMat = new THREE.MeshLambertMaterial({ color: 0x6B0000 });
  const door = new THREE.Mesh(new THREE.BoxGeometry(1, 2.2, 0.1), doorMat);
  door.position.set(0, 1.1, 2.51);
  house.add(door);

  // Windows
  const windowMat = new THREE.MeshBasicMaterial({ color: 0x87CEEB });
  [[-2, 2.2], [2, 2.2]].forEach(([x, y]) => {
    const win = new THREE.Mesh(new THREE.BoxGeometry(1, 1.2, 0.1), windowMat);
    win.position.set(x, y, 2.51);
    house.add(win);
  });

  house.position.set(-28, 0, -2);
  scene.add(house);
}

function createDeck() {
  const deck = new THREE.Group();

  const deckMat = new THREE.MeshLambertMaterial({ color: COLORS.deck });
  const deckDarkMat = new THREE.MeshLambertMaterial({ color: COLORS.deckDark });

  // Deck base
  const baseGeo = new THREE.BoxGeometry(5, 0.2, 4);
  const base = new THREE.Mesh(baseGeo, deckMat);
  base.position.y = 0.1;
  base.castShadow = true;
  base.receiveShadow = true;
  deck.add(base);

  // Deck planks
  for (let x = -2; x <= 2; x += 0.25) {
    const plankGeo = new THREE.BoxGeometry(0.2, 0.05, 4);
    const isAlternate = Math.floor((x + 2) / 0.5) % 2 === 0;
    const plank = new THREE.Mesh(plankGeo, isAlternate ? deckMat : deckDarkMat);
    plank.position.set(x, 0.22, 0);
    deck.add(plank);
  }

  // Umbrella
  const umbrellaPole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.04, 0.04, 2.2, 8),
    new THREE.MeshLambertMaterial({ color: 0x8B7355 })
  );
  umbrellaPole.position.set(-1, 1.1, 0);
  umbrellaPole.castShadow = true;
  deck.add(umbrellaPole);

  const umbrellaTop = new THREE.Mesh(
    new THREE.ConeGeometry(1.3, 0.5, 8),
    new THREE.MeshLambertMaterial({ color: COLORS.umbrella })
  );
  umbrellaTop.position.set(-1, 2.3, 0);
  umbrellaTop.castShadow = true;
  deck.add(umbrellaTop);

  // Table
  const tableMat = new THREE.MeshLambertMaterial({ color: COLORS.furniture });
  const table = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.06, 12), tableMat);
  table.position.set(-1, 0.65, 0);
  table.castShadow = true;
  deck.add(table);

  const tableLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.4, 8), tableMat);
  tableLeg.position.set(-1, 0.4, 0);
  deck.add(tableLeg);

  // Chairs
  const chairPositions = [
    { x: -1.8, z: 0, rot: Math.PI / 2 },
    { x: -0.2, z: 0, rot: -Math.PI / 2 },
  ];

  chairPositions.forEach(pos => {
    const chair = createChair();
    chair.position.set(pos.x, 0.2, pos.z);
    chair.rotation.y = pos.rot;
    deck.add(chair);
  });

  // BBQ Grill
  const grillMat = new THREE.MeshLambertMaterial({ color: 0x2a2a2a });
  const grill = new THREE.Group();
  
  const grillBody = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.4, 0.35), grillMat);
  grillBody.position.y = 0.6;
  grill.add(grillBody);
  
  const grillLid = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.5, 8, 1, false, 0, Math.PI), grillMat);
  grillLid.rotation.z = Math.PI / 2;
  grillLid.rotation.y = Math.PI / 2;
  grillLid.position.set(0, 0.85, 0);
  grill.add(grillLid);
  
  grill.position.set(1.8, 0.2, 1);
  deck.add(grill);

  deck.position.set(6, 0, 2);
  scene.add(deck);
}

function createChair() {
  const chair = new THREE.Group();
  const chairMat = new THREE.MeshLambertMaterial({ color: COLORS.furniture });
  
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.06, 0.4), chairMat);
  seat.position.y = 0.3;
  chair.add(seat);
  
  const back = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.5, 0.06), chairMat);
  back.position.set(0, 0.55, -0.17);
  chair.add(back);
  
  const legGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.3, 6);
  [[-0.15, 0.15, 0.15], [0.15, 0.15, 0.15], [-0.15, 0.15, -0.15], [0.15, 0.15, -0.15]].forEach(([x, y, z]) => {
    const leg = new THREE.Mesh(legGeo, chairMat);
    leg.position.set(x, y, z);
    chair.add(leg);
  });
  
  return chair;
}

function createPath() {
  const pathMat = new THREE.MeshLambertMaterial({ color: COLORS.path });
  const stoneMat = new THREE.MeshLambertMaterial({ color: COLORS.pathStone });
  
  // Main path from house to front fence
  const pathLen = FENCE_SIZE - 4;
  const pathGeo = new THREE.PlaneGeometry(2.5, pathLen);
  const path = new THREE.Mesh(pathGeo, pathMat);
  path.rotation.x = -Math.PI / 2;
  path.position.set(0, 0.02, 4 + pathLen/2);
  path.receiveShadow = true;
  scene.add(path);

  // Paving stones on main path
  for (let i = 0; i < 50; i++) {
    const stoneGeo = new THREE.BoxGeometry(0.4 + Math.random() * 0.1, 0.03, 0.3 + Math.random() * 0.1);
    const stone = new THREE.Mesh(stoneGeo, stoneMat);
    stone.position.set(
      (Math.random() - 0.5) * 2,
      0.03,
      4 + Math.random() * pathLen
    );
    stone.rotation.y = Math.random() * 0.3;
    stone.receiveShadow = true;
    scene.add(stone);
  }

  // Side path to deck
  const sidePathGeo = new THREE.PlaneGeometry(4, 2);
  const sidePath = new THREE.Mesh(sidePathGeo, pathMat);
  sidePath.rotation.x = -Math.PI / 2;
  sidePath.position.set(4.5, 0.02, 1.5);
  sidePath.receiveShadow = true;
  scene.add(sidePath);
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

  const fenceSize = FENCE_SIZE;
  const spacing = 0.15;

  // Front fence (with path gap)
  for (let x = -fenceSize; x <= fenceSize; x += spacing) {
    if (x > -1.5 && x < 1.5) continue;
    scene.add(createPicket(x, fenceSize));
  }

  // Right side fence (full)
  for (let z = -fenceSize; z <= fenceSize; z += spacing) {
    scene.add(createPicket(fenceSize, z));
  }

  // Left side fence (with gate gap for neighbor)
  for (let z = -fenceSize; z <= fenceSize; z += spacing) {
    // Gate gap at z = 0 (neighbor entrance)
    if (z > -1.2 && z < 1.2) continue;
    scene.add(createPicket(-fenceSize, z));
  }

  // Back fence (full)
  for (let x = -fenceSize; x <= fenceSize; x += spacing) {
    scene.add(createPicket(x, -fenceSize));
  }

  // Horizontal rails - front
  const frontRailGeo = new THREE.BoxGeometry(fenceSize * 2, 0.08, 0.04);
  [0.3, 0.75].forEach(y => {
    const rail = new THREE.Mesh(frontRailGeo, fenceMat);
    rail.position.set(0, y, fenceSize);
    scene.add(rail);
  });

  // Horizontal rails - back
  [0.3, 0.75].forEach(y => {
    const rail = new THREE.Mesh(frontRailGeo, fenceMat);
    rail.position.set(0, y, -fenceSize);
    scene.add(rail);
  });

  // Horizontal rails - right side (full)
  const sideRailGeo = new THREE.BoxGeometry(0.04, 0.08, fenceSize * 2);
  [0.3, 0.75].forEach(y => {
    const railR = new THREE.Mesh(sideRailGeo, fenceMat);
    railR.position.set(fenceSize, y, 0);
    scene.add(railR);
  });

  // Horizontal rails - left side (split for gate)
  const leftRailLen = (fenceSize - 1.2);
  const leftRailGeo = new THREE.BoxGeometry(0.04, 0.08, leftRailLen);
  [0.3, 0.75].forEach(y => {
    const railTop = new THREE.Mesh(leftRailGeo, fenceMat);
    railTop.position.set(-fenceSize, y, -fenceSize/2 - 0.6);
    scene.add(railTop);
    
    const railBottom = new THREE.Mesh(leftRailGeo, fenceMat);
    railBottom.position.set(-fenceSize, y, fenceSize/2 + 0.6);
    scene.add(railBottom);
  });

  // Corner posts and gate posts
  const postMat = new THREE.MeshLambertMaterial({ color: COLORS.fencePost });
  const postGeo = new THREE.CylinderGeometry(0.1, 0.12, 1.4, 8);
  
  // Four corners
  [[fenceSize, fenceSize], [fenceSize, -fenceSize], [-fenceSize, fenceSize], [-fenceSize, -fenceSize]].forEach(([x, z]) => {
    const post = new THREE.Mesh(postGeo, postMat);
    post.position.set(x, 0.7, z);
    post.castShadow = true;
    scene.add(post);
    
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), postMat);
    cap.position.set(x, 1.4, z);
    scene.add(cap);
  });

  // Gate posts on left side
  [[-fenceSize, 1.2], [-fenceSize, -1.2]].forEach(([x, z]) => {
    const post = new THREE.Mesh(postGeo, postMat);
    post.position.set(x, 0.7, z);
    post.castShadow = true;
    scene.add(post);
    
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), postMat);
    cap.position.set(x, 1.4, z);
    scene.add(cap);
  });

  // Front gate posts
  [[-1.5, fenceSize], [1.5, fenceSize]].forEach(([x, z]) => {
    const post = new THREE.Mesh(postGeo, postMat);
    post.position.set(x, 0.7, z);
    post.castShadow = true;
    scene.add(post);
    
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), postMat);
    cap.position.set(x, 1.4, z);
    scene.add(cap);
  });
}

function createGardenGate() {
  gardenGate = new THREE.Group();
  
  const gateMat = new THREE.MeshLambertMaterial({ color: COLORS.fence });
  
  // Gate frame
  const gateWidth = 2.2;
  const gateHeight = 1.1;
  
  // Vertical bars
  for (let i = 0; i < 8; i++) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.06, gateHeight, 0.025), gateMat);
    bar.position.set(-gateWidth/2 + 0.15 + i * 0.28, gateHeight/2, 0);
    gardenGate.add(bar);
    
    // Pointed tops
    const point = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.12, 4), gateMat);
    point.position.set(-gateWidth/2 + 0.15 + i * 0.28, gateHeight + 0.06, 0);
    point.rotation.y = Math.PI / 4;
    gardenGate.add(point);
  }
  
  // Horizontal rails
  const railGeo = new THREE.BoxGeometry(gateWidth, 0.06, 0.04);
  [0.25, 0.7].forEach(y => {
    const rail = new THREE.Mesh(railGeo, gateMat);
    rail.position.set(0, y, 0);
    gardenGate.add(rail);
  });
  
  // Diagonal brace
  const braceLen = Math.sqrt(gateWidth * gateWidth + 0.45 * 0.45);
  const brace = new THREE.Mesh(new THREE.BoxGeometry(braceLen, 0.04, 0.03), gateMat);
  brace.position.set(0, 0.475, 0);
  brace.rotation.z = Math.atan2(0.45, gateWidth);
  gardenGate.add(brace);
  
  // Gate is on the left side fence
  gardenGate.position.set(-FENCE_SIZE, 0, 0);
  gardenGate.rotation.y = Math.PI / 2;
  
  scene.add(gardenGate);
}

function createDog() {
  dog = new THREE.Group();
  
  const bodyMat = new THREE.MeshLambertMaterial({ color: 0xD2691E }); // Golden brown
  const darkMat = new THREE.MeshLambertMaterial({ color: 0x8B4513 }); // Darker brown
  const noseMat = new THREE.MeshLambertMaterial({ color: 0x1a1a1a });
  const eyeMat = new THREE.MeshLambertMaterial({ color: 0x1a1a1a });
  const tongueMat = new THREE.MeshLambertMaterial({ color: 0xFF6B6B });
  
  // Body
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.2, 0.5, 8), bodyMat);
  body.rotation.z = Math.PI / 2;
  body.position.set(0, 0.35, 0);
  body.castShadow = true;
  dog.add(body);
  
  // Head
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 6), bodyMat);
  head.position.set(0.35, 0.42, 0);
  head.scale.set(1.1, 1, 0.9);
  head.castShadow = true;
  dog.add(head);
  
  // Snout
  const snout = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.15, 8), bodyMat);
  snout.rotation.z = Math.PI / 2;
  snout.position.set(0.48, 0.38, 0);
  dog.add(snout);
  
  // Nose
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 4), noseMat);
  nose.position.set(0.56, 0.38, 0);
  dog.add(nose);
  
  // Eyes
  [-0.05, 0.05].forEach(z => {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.025, 6, 4), eyeMat);
    eye.position.set(0.44, 0.46, z);
    dog.add(eye);
  });
  
  // Ears (floppy)
  [-0.12, 0.12].forEach(z => {
    const ear = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 4), darkMat);
    ear.position.set(0.3, 0.5, z);
    ear.scale.set(0.5, 1, 0.8);
    dog.add(ear);
  });
  
  // Tongue (happy dog!)
  const tongue = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.02, 0.04), tongueMat);
  tongue.position.set(0.5, 0.32, 0);
  tongue.rotation.x = 0.3;
  dog.add(tongue);
  dog.userData.tongue = tongue;
  
  // Legs
  const legGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.25, 6);
  const legPositions = [
    { x: 0.15, z: 0.1, name: 'frontLeft' },
    { x: 0.15, z: -0.1, name: 'frontRight' },
    { x: -0.15, z: 0.1, name: 'backLeft' },
    { x: -0.15, z: -0.1, name: 'backRight' }
  ];
  
  legPositions.forEach(pos => {
    const leg = new THREE.Mesh(legGeo, bodyMat);
    leg.position.set(pos.x, 0.12, pos.z);
    leg.castShadow = true;
    dog.add(leg);
    dog.userData[pos.name] = leg;
  });
  
  // Tail (wagging!)
  const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.04, 0.2, 6), darkMat);
  tail.position.set(-0.3, 0.45, 0);
  tail.rotation.z = -0.5;
  dog.add(tail);
  dog.userData.tail = tail;
  
  // Start position
  dog.position.set(5, 0, 8);
  dogTarget.set(5, 0, 8);
  
  scene.add(dog);
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
    const foliageDarkMat = new THREE.MeshLambertMaterial({ color: COLORS.treeDark });
    
    const foliage1 = new THREE.Mesh(new THREE.SphereGeometry(1.8 * scale, 10, 8), foliageMat);
    foliage1.position.y = 2.8 * scale;
    foliage1.scale.y = 0.8;
    foliage1.castShadow = true;
    tree.add(foliage1);

    const foliage2 = new THREE.Mesh(new THREE.SphereGeometry(1.4 * scale, 10, 8), foliageDarkMat);
    foliage2.position.set(0.8 * scale, 3.2 * scale, 0);
    foliage2.castShadow = true;
    tree.add(foliage2);

    const foliage3 = new THREE.Mesh(new THREE.SphereGeometry(1.2 * scale, 10, 8), foliageMat);
    foliage3.position.set(-0.6 * scale, 3.5 * scale, 0.5 * scale);
    foliage3.castShadow = true;
    tree.add(foliage3);

    tree.position.set(x, 0, z);
    return tree;
  };

  const treePositions = [
    // Outside fence - decorative
    [-18, -12, 1.2], [-20, 2, 1], [-19, 10, 1.3],
    [18, -10, 1.1], [20, 4, 1.2], [19, 12, 1],
    [-22, -5, 0.9], [22, -2, 1.1], [-17, 16, 1],
    [17, -16, 1.2], [-21, -16, 1.1], [21, 16, 1],
    // Inside yard corners
    [-12, -12, 0.8], [12, -12, 0.8], [-12, 12, 0.9], [12, 12, 0.9]
  ];

  treePositions.forEach(([x, z, scale]) => {
    scene.add(createTree(x, z, scale));
  });
}

function createShrubs() {
  const shrubMat = new THREE.MeshLambertMaterial({ color: COLORS.shrub });
  const shrubDarkMat = new THREE.MeshLambertMaterial({ color: COLORS.shrubDark });
  
  const createShrub = (x, z, scale = 1) => {
    const shrub = new THREE.Group();
    
    for (let i = 0; i < 4; i++) {
      const size = (0.3 + Math.random() * 0.2) * scale;
      const bush = new THREE.Mesh(
        new THREE.SphereGeometry(size, 8, 6),
        i % 2 === 0 ? shrubMat : shrubDarkMat
      );
      bush.position.set(
        (Math.random() - 0.5) * 0.4 * scale,
        size * 0.8,
        (Math.random() - 0.5) * 0.4 * scale
      );
      bush.scale.y = 0.8;
      bush.castShadow = true;
      shrub.add(bush);
    }
    
    shrub.position.set(x, 0, z);
    return shrub;
  };

  const shrubPositions = [
    // Around house
    [-4, -3.5, 0.8], [4, -3.5, 0.8],
    [-4.5, -1, 1.0], [4.5, -1, 1.0],
    // Along right fence
    [FENCE_SIZE - 0.5, -6, 0.9], [FENCE_SIZE - 0.5, -2, 0.9], [FENCE_SIZE - 0.5, 6, 0.9], [FENCE_SIZE - 0.5, 10, 0.9],
    // Along left fence
    [-FENCE_SIZE + 0.5, -6, 0.9], [-FENCE_SIZE + 0.5, -2, 0.9], [-FENCE_SIZE + 0.5, 6, 0.9], [-FENCE_SIZE + 0.5, 10, 0.9],
    // Along back fence
    [-6, -FENCE_SIZE + 0.5, 0.9], [0, -FENCE_SIZE + 0.5, 1.0], [6, -FENCE_SIZE + 0.5, 0.9],
  ];

  shrubPositions.forEach(([x, z, scale]) => {
    scene.add(createShrub(x, z, scale));
  });
}

function createFlowerBeds() {
  const createFlowerBed = (x, z, length) => {
    const bed = new THREE.Group();
    
    const soilMat = new THREE.MeshLambertMaterial({ color: 0x3D2817 });
    const soil = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.15, length), soilMat);
    soil.position.y = 0.08;
    bed.add(soil);

    const borderMat = new THREE.MeshLambertMaterial({ color: 0x6B4423 });
    const border = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.2, length + 0.1), borderMat);
    border.position.y = 0.05;
    bed.add(border);

    const flowerColors = [COLORS.flowerPink, COLORS.flowerYellow, COLORS.flowerWhite, COLORS.flowerPurple];
    const stemMat = new THREE.MeshLambertMaterial({ color: 0x228B22 });
    
    for (let i = 0; i < length * 4; i++) {
      const stemGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.3, 4);
      const stem = new THREE.Mesh(stemGeo, stemMat);
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

  // Flower beds around yard
  scene.add(createFlowerBed(-3.5, -4, 2));
  scene.add(createFlowerBed(3.5, -4, 2));
  scene.add(createFlowerBed(-8, 10, 3));
  scene.add(createFlowerBed(8, 10, 3));
  scene.add(createFlowerBed(-10, -8, 3));
  scene.add(createFlowerBed(10, -8, 3));
}

function createMailbox() {
  const mailbox = new THREE.Group();

  const postMat = new THREE.MeshLambertMaterial({ color: COLORS.fence });
  const post = new THREE.Mesh(new THREE.BoxGeometry(0.15, 1.2, 0.15), postMat);
  post.position.y = 0.6;
  post.castShadow = true;
  mailbox.add(post);

  const boxMat = new THREE.MeshLambertMaterial({ color: 0x1a1a1a });
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.25, 0.5), boxMat);
  box.position.y = 1.3;
  box.castShadow = true;
  mailbox.add(box);

  const flagMat = new THREE.MeshLambertMaterial({ color: 0xFF0000 });
  const flag = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.15, 0.08), flagMat);
  flag.position.set(0.16, 1.35, 0);
  mailbox.add(flag);

  mailbox.position.set(2, 0, FENCE_SIZE - 0.5);
  scene.add(mailbox);
}

function createFirstPersonArms() {
  playerArms = new THREE.Group();
  
  const skinMat = new THREE.MeshLambertMaterial({ color: 0xDEB887 });
  const shirtMat = new THREE.MeshLambertMaterial({ color: 0xB22222 }); // Red plaid shirt
  const shirtDarkMat = new THREE.MeshLambertMaterial({ color: 0x8B0000 });
  
  // Left arm
  const leftArm = new THREE.Group();
  
  // Upper arm (shirt sleeve)
  const leftSleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.25, 8), shirtMat);
  leftSleeve.rotation.z = Math.PI / 2 + 0.3;
  leftSleeve.position.set(-0.15, -0.12, 0);
  leftArm.add(leftSleeve);
  
  // Plaid stripe
  const leftStripe = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.02, 0.08), shirtDarkMat);
  leftStripe.position.set(-0.15, -0.12, 0.05);
  leftStripe.rotation.z = 0.3;
  leftArm.add(leftStripe);
  
  // Forearm (skin)
  const leftForearm = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.2, 8), skinMat);
  leftForearm.rotation.z = Math.PI / 2 + 0.5;
  leftForearm.position.set(-0.28, -0.18, 0);
  leftArm.add(leftForearm);
  
  // Hand
  const leftHand = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), skinMat);
  leftHand.position.set(-0.38, -0.22, 0);
  leftHand.scale.set(1, 0.6, 0.8);
  leftArm.add(leftHand);
  
  leftArm.position.set(-0.25, -0.3, -0.5);
  playerArms.add(leftArm);
  playerArms.userData.leftArm = leftArm;
  
  // Right arm (mirror)
  const rightArm = new THREE.Group();
  
  const rightSleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.25, 8), shirtMat);
  rightSleeve.rotation.z = -Math.PI / 2 - 0.3;
  rightSleeve.position.set(0.15, -0.12, 0);
  rightArm.add(rightSleeve);
  
  const rightStripe = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.02, 0.08), shirtDarkMat);
  rightStripe.position.set(0.15, -0.12, 0.05);
  rightStripe.rotation.z = -0.3;
  rightArm.add(rightStripe);
  
  const rightForearm = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.2, 8), skinMat);
  rightForearm.rotation.z = -Math.PI / 2 - 0.5;
  rightForearm.position.set(0.28, -0.18, 0);
  rightArm.add(rightForearm);
  
  const rightHand = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), skinMat);
  rightHand.position.set(0.38, -0.22, 0);
  rightHand.scale.set(1, 0.6, 0.8);
  rightArm.add(rightHand);
  
  rightArm.position.set(0.25, -0.3, -0.5);
  playerArms.add(rightArm);
  playerArms.userData.rightArm = rightArm;
  
  // Arms are hidden by default (shown during fight)
  playerArms.visible = false;
  camera.add(playerArms);
}

function createFirstPersonMower() {
  fpMowerHandle = new THREE.Group();
  
  const handleMat = new THREE.MeshLambertMaterial({ color: 0x333333 });
  const gripMat = new THREE.MeshLambertMaterial({ color: 0x111111 });
  const skinMat = new THREE.MeshLambertMaterial({ color: 0xDEB887 });
  const shirtMat = new THREE.MeshLambertMaterial({ color: 0xB22222 });
  const shirtDarkMat = new THREE.MeshLambertMaterial({ color: 0x8B0000 });
  const mowerRedMat = new THREE.MeshLambertMaterial({ color: COLORS.mower });
  const mowerBlackMat = new THREE.MeshLambertMaterial({ color: 0x1a1a1a });
  
  // Mower body visible at bottom of screen
  const mowerBody = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.2, 0.4), mowerRedMat);
  mowerBody.position.set(0, -0.55, -0.6);
  fpMowerHandle.add(mowerBody);
  
  // Mower deck
  const mowerDeck = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.08, 0.5), mowerBlackMat);
  mowerDeck.position.set(0, -0.62, -0.6);
  fpMowerHandle.add(mowerDeck);
  
  // Left handle bar
  const leftHandle = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.7, 8), handleMat);
  leftHandle.rotation.x = 0.5;
  leftHandle.position.set(-0.2, -0.35, -0.45);
  fpMowerHandle.add(leftHandle);
  
  // Right handle bar  
  const rightHandle = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.7, 8), handleMat);
  rightHandle.rotation.x = 0.5;
  rightHandle.position.set(0.2, -0.35, -0.45);
  fpMowerHandle.add(rightHandle);
  
  // Cross grip bar
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.48, 8), gripMat);
  grip.rotation.z = Math.PI / 2;
  grip.position.set(0, -0.12, -0.18);
  fpMowerHandle.add(grip);
  
  // Left arm and hand on grip
  const leftArm = new THREE.Group();
  // Forearm
  const leftForearm = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.22, 8), skinMat);
  leftForearm.rotation.z = Math.PI / 2 + 0.4;
  leftForearm.rotation.x = 0.2;
  leftForearm.position.set(-0.08, 0.02, 0);
  leftArm.add(leftForearm);
  // Sleeve
  const leftSleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.065, 0.18, 8), shirtMat);
  leftSleeve.rotation.z = Math.PI / 2 + 0.5;
  leftSleeve.position.set(-0.2, 0.08, 0.02);
  leftArm.add(leftSleeve);
  // Plaid stripe
  const leftStripe = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.015, 0.07), shirtDarkMat);
  leftStripe.position.set(-0.2, 0.08, 0.06);
  leftStripe.rotation.z = 0.5;
  leftArm.add(leftStripe);
  // Hand
  const leftHand = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), skinMat);
  leftHand.scale.set(1.2, 0.7, 0.9);
  leftHand.position.set(0.02, -0.02, 0);
  leftArm.add(leftHand);
  leftArm.position.set(-0.15, -0.1, -0.18);
  fpMowerHandle.add(leftArm);
  
  // Right arm and hand on grip
  const rightArm = new THREE.Group();
  // Forearm
  const rightForearm = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.22, 8), skinMat);
  rightForearm.rotation.z = -Math.PI / 2 - 0.4;
  rightForearm.rotation.x = 0.2;
  rightForearm.position.set(0.08, 0.02, 0);
  rightArm.add(rightForearm);
  // Sleeve
  const rightSleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.065, 0.18, 8), shirtMat);
  rightSleeve.rotation.z = -Math.PI / 2 - 0.5;
  rightSleeve.position.set(0.2, 0.08, 0.02);
  rightArm.add(rightSleeve);
  // Plaid stripe
  const rightStripe = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.015, 0.07), shirtDarkMat);
  rightStripe.position.set(0.2, 0.08, 0.06);
  rightStripe.rotation.z = -0.5;
  rightArm.add(rightStripe);
  // Hand
  const rightHand = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), skinMat);
  rightHand.scale.set(1.2, 0.7, 0.9);
  rightHand.position.set(-0.02, -0.02, 0);
  rightArm.add(rightHand);
  rightArm.position.set(0.15, -0.1, -0.18);
  fpMowerHandle.add(rightArm);
  
  // Mower visible in first person is shown by default
  fpMowerHandle.visible = true;
  camera.add(fpMowerHandle);
}

function createGrass() {
  grassBlades = [];
  totalGrass = 0;

  const fenceInner = FENCE_SIZE - 0.5;
  for (let x = -fenceInner; x < fenceInner; x += 1 / GRASS_DENSITY) {
    for (let z = -fenceInner; z < fenceInner; z += 1 / GRASS_DENSITY) {
      if (isInHouseArea(x, z) || isOnPath(x, z) || isOnDeck(x, z)) continue;

      const stripeIndex = Math.floor((x + fenceInner) * 2);
      const isLightStripe = stripeIndex % 2 === 0;

      const bladeGeo = new THREE.ConeGeometry(0.04, 0.4, 4);
      const bladeMat = new THREE.MeshLambertMaterial({ 
        color: isLightStripe ? COLORS.grassTall : darkenColor(COLORS.grassTall, 0.92)
      });

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
      blade.userData.stripeLight = isLightStripe;
      blade.userData.swayOffset = Math.random() * Math.PI * 2;
      blade.castShadow = true;

      grassBlades.push(blade);
      scene.add(blade);
      totalGrass++;
    }
  }
}

function darkenColor(hex, factor) {
  const color = new THREE.Color(hex);
  color.multiplyScalar(factor);
  return color.getHex();
}

function isInHouseArea(x, z) {
  // House is now centered at z=0
  return x > -5 && x < 5 && z > -4 && z < 4;
}

function isOnPath(x, z) {
  // Path from house front door to front fence
  if (Math.abs(x) < 1.5 && z > 3.5 && z < FENCE_SIZE) return true;
  // Side path to deck
  if (x > 2.5 && x < 6.5 && z > 0 && z < 3) return true;
  return false;
}

function isOnDeck(x, z) {
  return x > 3 && x < 9.5 && z > -1 && z < 5;
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

function createNeighbor() {
  neighbor = new THREE.Group();

  // Head
  const headGeo = new THREE.SphereGeometry(0.25, 16, 12);
  const headMat = new THREE.MeshLambertMaterial({ color: COLORS.neighborSkin });
  const head = new THREE.Mesh(headGeo, headMat);
  head.position.y = 1.55;
  head.scale.set(1, 1.1, 0.95);
  head.castShadow = true;
  neighbor.add(head);

  // Hair
  const hairGeo = new THREE.SphereGeometry(0.26, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.4);
  const hairMat = new THREE.MeshLambertMaterial({ color: 0x2D2D2D });
  const hair = new THREE.Mesh(hairGeo, hairMat);
  hair.position.y = 1.6;
  neighbor.add(hair);

  // Eyes
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

  // Angry eyebrows
  const eyebrowMat = new THREE.MeshLambertMaterial({ color: 0x2D2D2D });
  neighbor.userData.eyebrows = [];
  [-0.08, 0.08].forEach((x, i) => {
    const eyebrow = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.02, 0.02), eyebrowMat);
    eyebrow.position.set(x, 1.68, 0.2);
    eyebrow.rotation.z = i === 0 ? -0.4 : 0.4;
    neighbor.add(eyebrow);
    neighbor.userData.eyebrows.push(eyebrow);
  });

  // Mouth
  const mouthGeo = new THREE.BoxGeometry(0.1, 0.03, 0.02);
  const mouthMat = new THREE.MeshLambertMaterial({ color: 0x8B4513 });
  const mouth = new THREE.Mesh(mouthGeo, mouthMat);
  mouth.position.set(0, 1.42, 0.22);
  neighbor.add(mouth);

  // Torso (red shirt)
  const torsoGeo = new THREE.CylinderGeometry(0.2, 0.25, 0.55, 12);
  const torsoMat = new THREE.MeshLambertMaterial({ color: COLORS.neighborShirt });
  const torso = new THREE.Mesh(torsoGeo, torsoMat);
  torso.position.y = 1.1;
  torso.castShadow = true;
  neighbor.add(torso);

  // Arms
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

  // Legs
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

  neighbor.position.set(-FENCE_SIZE - 6, 0, 0);
  neighbor.visible = false;
  scene.add(neighbor);
}

function initAudio() {
  audioContext = new (window.AudioContext || window.webkitAudioContext)();
  createAmbientSounds();
  createMowerSound();
}

function createAmbientSounds() {
  // Light wind
  const windGain = audioContext.createGain();
  windGain.gain.value = 0.02;
  windGain.connect(audioContext.destination);

  const windFilter = audioContext.createBiquadFilter();
  windFilter.type = 'lowpass';
  windFilter.frequency.value = 400;
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
}

function scheduleBirdSounds() {
  const playBird = () => {
    if (!audioContext || audioContext.state === 'closed') return;
    
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();
    
    osc.frequency.value = 1800 + Math.random() * 800;
    osc.type = 'sine';
    
    gain.gain.setValueAtTime(0, audioContext.currentTime);
    gain.gain.linearRampToValueAtTime(0.025, audioContext.currentTime + 0.05);
    gain.gain.linearRampToValueAtTime(0, audioContext.currentTime + 0.12);
    
    osc.connect(gain);
    gain.connect(audioContext.destination);
    
    osc.start(audioContext.currentTime);
    osc.stop(audioContext.currentTime + 0.15);

    setTimeout(playBird, 3000 + Math.random() * 8000);
  };

  setTimeout(playBird, 2000);
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

function playPunchSound(isPlayerPunch) {
  if (!audioContext) return;
  
  // Create punch impact sound
  const osc = audioContext.createOscillator();
  const gain = audioContext.createGain();
  const filter = audioContext.createBiquadFilter();
  
  filter.type = 'lowpass';
  filter.frequency.value = isPlayerPunch ? 200 : 150;
  
  osc.type = 'sawtooth';
  osc.frequency.value = isPlayerPunch ? 80 : 60;
  
  gain.gain.setValueAtTime(0.3, audioContext.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.15);
  
  osc.connect(filter);
  filter.connect(gain);
  gain.connect(audioContext.destination);
  
  osc.start(audioContext.currentTime);
  osc.stop(audioContext.currentTime + 0.15);
  
  // Add noise burst for impact
  const noiseGain = audioContext.createGain();
  noiseGain.gain.setValueAtTime(0.15, audioContext.currentTime);
  noiseGain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.1);
  
  const noiseFilter = audioContext.createBiquadFilter();
  noiseFilter.type = 'bandpass';
  noiseFilter.frequency.value = isPlayerPunch ? 1000 : 800;
  noiseFilter.Q.value = 1;
  
  const bufferSize = audioContext.sampleRate * 0.1;
  const noiseBuffer = audioContext.createBuffer(1, bufferSize, audioContext.sampleRate);
  const output = noiseBuffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    output[i] = Math.random() * 2 - 1;
  }
  
  const noise = audioContext.createBufferSource();
  noise.buffer = noiseBuffer;
  noise.connect(noiseFilter);
  noiseFilter.connect(noiseGain);
  noiseGain.connect(audioContext.destination);
  noise.start(audioContext.currentTime);
}

function playHurtSound() {
  if (!audioContext) return;
  
  const osc = audioContext.createOscillator();
  const gain = audioContext.createGain();
  
  osc.type = 'sine';
  osc.frequency.setValueAtTime(300, audioContext.currentTime);
  osc.frequency.exponentialRampToValueAtTime(100, audioContext.currentTime + 0.2);
  
  gain.gain.setValueAtTime(0.15, audioContext.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.2);
  
  osc.connect(gain);
  gain.connect(audioContext.destination);
  
  osc.start(audioContext.currentTime);
  osc.stop(audioContext.currentTime + 0.2);
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
    if (neighborState === 'fighting' && isPointerLocked && !isPunching) {
      const dist = playerPos.distanceTo(neighbor.position);
      
      // Trigger punch animation
      isPunching = true;
      punchTime = clock.getElapsedTime();
      playPunchSound(true); // Player punch sound
      
      if (dist < 3) {
        neighborAnger -= 25;
        // Push neighbor back
        const pushDir = new THREE.Vector3();
        pushDir.subVectors(neighbor.position, playerPos);
        pushDir.y = 0;
        pushDir.normalize();
        neighbor.position.x += pushDir.x * 0.8;
        neighbor.position.z += pushDir.z * 0.8;
        
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
  playerPos.set(-6, 1.5, 10);
  playerYaw = 0;
  playerPitch = 0;
  playerHealth = 100;
  completed = false;
  neighborState = 'waiting';
  neighborAnger = 0;
  isPunching = false;
  neighbor.visible = false;
  neighbor.position.set(-FENCE_SIZE - 6, 0, 0);
  // Reset dog
  if (dog) {
    dog.position.set(5, 0, 8);
    dogTarget.set(5, 0, 8);
    dogWaitTime = 0;
  }
  // Reset gate
  if (gardenGate) {
    gardenGate.rotation.y = Math.PI / 2;
  }
  // Reset first-person view
  if (playerArms) playerArms.visible = false;
  if (fpMowerHandle) fpMowerHandle.visible = true;
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
    neighborState = 'walking_to_gate';
    neighbor.visible = true;
    // Start outside the fence, will walk to gate
    neighbor.position.set(-FENCE_SIZE - 4, 0, 0);
    showDialog('SUR NABO', 'HEY! Kan du ikke stoppe den larm?! Det er søndag formiddag!');
    setTimeout(() => {
      hideDialog();
      showDialog('SUR NABO', 'Jeg kommer ind og smadrer dig!');
      setTimeout(hideDialog, 2000);
    }, 2500);
    document.getElementById('health-bar').classList.remove('hidden');
    neighborAnger = 100;
    
    // Open the gate animation
    if (gardenGate) {
      gardenGate.rotation.y = Math.PI / 2 - 0.8; // Gate swings open
    }
  }

  // Walk to gate, then through it
  if (neighborState === 'walking_to_gate' && !showingDialog) {
    // Walk toward gate position
    const gateTarget = new THREE.Vector3(-FENCE_SIZE, 0, 0);
    const dir = new THREE.Vector3();
    dir.subVectors(gateTarget, neighbor.position);
    dir.y = 0;
    
    if (dir.length() > 0.5) {
      dir.normalize();
      neighbor.position.x += dir.x * 0.05;
      neighbor.position.z += dir.z * 0.05;
      neighbor.lookAt(gateTarget.x, neighbor.position.y, gateTarget.z);
      
      const walkCycle = Math.sin(time * 10) * 0.4;
      neighbor.userData.leftLeg.rotation.x = walkCycle;
      neighbor.userData.rightLeg.rotation.x = -walkCycle;
    } else {
      // Reached gate, now approach player
      neighborState = 'approaching';
    }
  }

  if (neighborState === 'approaching' && !showingDialog) {
    const dir = new THREE.Vector3();
    dir.subVectors(playerPos, neighbor.position);
    dir.y = 0;
    dir.normalize();
    
    neighbor.position.x += dir.x * 0.05;
    neighbor.position.z += dir.z * 0.05;
    neighbor.lookAt(playerPos.x, neighbor.position.y, playerPos.z);

    const walkCycle = Math.sin(time * 10) * 0.4;
    neighbor.userData.leftLeg.rotation.x = walkCycle;
    neighbor.userData.rightLeg.rotation.x = -walkCycle;

    if (playerPos.distanceTo(neighbor.position) < 2) {
      neighborState = 'fighting';
      // Show first-person arms, hide mower handle
      if (playerArms) playerArms.visible = true;
      if (fpMowerHandle) fpMowerHandle.visible = false;
      showDialog('SUR NABO', 'Nu skal du få TÆSK!');
      setTimeout(hideDialog, 1500);
    }
  }

  if (neighborState === 'fighting' && !showingDialog) {
    neighbor.lookAt(playerPos.x, neighbor.position.y, playerPos.z);
    
    const punchCycle = Math.sin(time * 8);
    neighbor.userData.leftArm.rotation.x = punchCycle > 0 ? -punchCycle * 1.5 : 0;
    neighbor.userData.rightArm.rotation.x = punchCycle < 0 ? punchCycle * 1.5 : 0;

    // Neighbor hits player
    if (playerPos.distanceTo(neighbor.position) < 2 && Math.random() < 0.015) {
      playerHealth -= 5;
      document.getElementById('health-fill').style.width = playerHealth + '%';
      playPunchSound(false); // Neighbor punch
      playHurtSound();
      
      if (playerHealth <= 0) {
        showDialog('GAME OVER', 'Naboen slog dig ud! Tryk R for at prøve igen.');
        neighborState = 'won';
        if (playerArms) playerArms.visible = false;
        if (fpMowerHandle) fpMowerHandle.visible = true;
      }
    }

    // Follow player if too far
    if (playerPos.distanceTo(neighbor.position) > 2) {
      const dir = new THREE.Vector3();
      dir.subVectors(playerPos, neighbor.position);
      dir.y = 0;
      dir.normalize();
      neighbor.position.x += dir.x * 0.05;
      neighbor.position.z += dir.z * 0.05;
    }
    
    // Animate player arms during fight
    if (playerArms && isPunching) {
      const punchProgress = (time - punchTime) * 10;
      if (punchProgress < 1) {
        // Punch forward
        playerArms.userData.rightArm.position.z = -0.5 - punchProgress * 0.3;
        playerArms.userData.rightArm.position.y = -0.3 + punchProgress * 0.1;
      } else if (punchProgress < 2) {
        // Return
        playerArms.userData.rightArm.position.z = -0.5 - (2 - punchProgress) * 0.3;
        playerArms.userData.rightArm.position.y = -0.3 + (2 - punchProgress) * 0.1;
      } else {
        isPunching = false;
        playerArms.userData.rightArm.position.z = -0.5;
        playerArms.userData.rightArm.position.y = -0.3;
      }
    }
  }

  if (neighborState === 'retreating') {
    // Walk back through gate
    const gateTarget = new THREE.Vector3(-FENCE_SIZE - 4, 0, 0);
    const dir = new THREE.Vector3();
    dir.subVectors(gateTarget, neighbor.position);
    dir.y = 0;
    dir.normalize();
    
    neighbor.position.x += dir.x * 0.05;
    neighbor.position.z += dir.z * 0.05;
    neighbor.lookAt(neighbor.position.x + dir.x, neighbor.position.y, neighbor.position.z + dir.z);

    const walkCycle = Math.sin(time * 10) * 0.4;
    neighbor.userData.leftLeg.rotation.x = walkCycle;
    neighbor.userData.rightLeg.rotation.x = -walkCycle;

    if (neighbor.position.x < -FENCE_SIZE - 2) {
      neighbor.visible = false;
      neighborState = 'defeated';
      document.getElementById('health-bar').classList.add('hidden');
      // Close the gate
      if (gardenGate) {
        gardenGate.rotation.y = Math.PI / 2;
      }
      // Show mower handle again
      if (playerArms) playerArms.visible = false;
      if (fpMowerHandle) fpMowerHandle.visible = true;
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

    if (!isInHouseArea(newX, newZ) && !isOnDeck(newX, newZ)) {
      playerPos.x = Math.max(-FENCE_SIZE + 0.7, Math.min(FENCE_SIZE - 0.7, newX));
      playerPos.z = Math.max(-FENCE_SIZE + 0.7, Math.min(FENCE_SIZE - 0.7, newZ));
    }
  }
  
  updateMowerSound(isMoving);

  // First-person camera
  camera.position.copy(playerPos);
  camera.rotation.order = 'YXZ';
  camera.rotation.y = playerYaw;
  camera.rotation.x = playerPitch;

  // Mower in front of player
  const mowerOffset = new THREE.Vector3(0, -0.6, 1.5);
  mowerOffset.applyAxisAngle(new THREE.Vector3(0, 1, 0), playerYaw);
  mower.position.set(
    playerPos.x + mowerOffset.x,
    0,
    playerPos.z + mowerOffset.z
  );
  mower.rotation.y = playerYaw;

  // Grass sway animation
  const time = clock.getElapsedTime();
  grassBlades.forEach(blade => {
    if (blade.userData.isTall) {
      const sway = Math.sin(time * 1.5 + blade.userData.swayOffset) * 0.08;
      blade.rotation.x = sway;
    }
  });

  updateNeighbor();
  updateDog();
  checkMowing();
  updateHUD();
  checkCompletion();
}

function updateDog() {
  if (!dog) return;
  
  const time = clock.getElapsedTime();
  
  // Dog AI - wander around happily
  if (dogWaitTime > 0) {
    dogWaitTime -= 0.016;
    // Idle animation - wag tail
    dog.userData.tail.rotation.z = -0.5 + Math.sin(time * 15) * 0.4;
    // Pant (tongue bob)
    dog.userData.tongue.position.y = 0.32 + Math.sin(time * 8) * 0.01;
    return;
  }
  
  // Move toward target
  const dir = new THREE.Vector3();
  dir.subVectors(dogTarget, dog.position);
  dir.y = 0;
  
  if (dir.length() > 0.3) {
    dir.normalize();
    dog.position.x += dir.x * 0.03;
    dog.position.z += dir.z * 0.03;
    dog.lookAt(dogTarget.x, dog.position.y, dogTarget.z);
    
    // Walking animation
    const walkCycle = Math.sin(time * 12);
    dog.userData.frontLeft.position.y = 0.12 + Math.abs(walkCycle) * 0.03;
    dog.userData.frontRight.position.y = 0.12 + Math.abs(-walkCycle) * 0.03;
    dog.userData.backLeft.position.y = 0.12 + Math.abs(-walkCycle) * 0.03;
    dog.userData.backRight.position.y = 0.12 + Math.abs(walkCycle) * 0.03;
    
    // Tail wag while walking
    dog.userData.tail.rotation.z = -0.5 + Math.sin(time * 12) * 0.3;
  } else {
    // Reached target, pick new random target and wait
    dogWaitTime = 2 + Math.random() * 4;
    
    // Pick new target within yard bounds (avoid house)
    let newX, newZ;
    do {
      newX = (Math.random() - 0.5) * (FENCE_SIZE - 2) * 2;
      newZ = (Math.random() - 0.5) * (FENCE_SIZE - 2) * 2;
    } while (isInHouseArea(newX, newZ) || isOnDeck(newX, newZ));
    
    dogTarget.set(newX, 0, newZ);
  }
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
      // Stripe pattern based on mow direction
      const stripeColor = blade.userData.stripeLight ? COLORS.grassStripeLight : COLORS.grassStripeDark;
      blade.material.color.setHex(stripeColor);
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
