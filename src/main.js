import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const WORLD_SIZE = 30;
const GRASS_DENSITY = 8;
const PLAYER_SPEED = 0.07;
const MOUSE_SENSITIVITY = 0.002;
const MOW_RADIUS = 1.0;
const MOW_REWARD = 100;

let scene, camera, renderer;
let mower;
let mowerTemplate = null;
let house = null;
let playerModel = null;
let playerMixer = null;
let playerActions = { idle: null, walk: null };
let playerFootOffset = 0;
let houseBounds = { minX: -5, maxX: 5, minZ: -4, maxZ: 4 };
let grassBlades = [];
let totalGrass = 0;
let money = 0;
let completed = false;
let clock = new THREE.Clock();

let playerPos = new THREE.Vector3(-6, 1.5, 10);
let playerYaw = 0;
let playerPitch = -0.08;
let isPointerLocked = false;

let neighbor = null;
let neighborState = 'waiting';
let neighborAnger = 0;
let showingDialog = false;
let playerHealth = 100;

let audioContext = null;
let mowerGain = null;
let ambientStarted = false;
let soundBuffers = {};
let mowerSource = null;
let musicGain = null;
let stepTimer = 0;
let neighborShoutAt = 0;

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
let dogIsPeeing = false;
let dogPeeTime = 0;
let dogBarkedAtNeighbor = false;

// Cat
let cat = null;
let catMeowCooldown = 0;

// Wife
let wife = null;
let wifeState = 'inside'; // 'inside', 'coming_out', 'whistling', 'going_in'
let wifeTimer = 0;
let wifeNextAppearance = 0;

// Game levels
let currentLevel = 1; // 1 = mow grass, 2 = paint house
let paintProgress = 0;
let houseMeshes = [];
let paintSplats = [];
let paintedCells = new Set();
let totalPaintSections = 40;
let isPainting = false;
let lastPaintAt = 0;
let lastSplatPoint = null;
let roofBirds = [];
const PAINT_REWARD = 150;
const PAINT_CELL = 0.48;
const PAINT_RANGE = 4.0;
const PAINT_COLOR = 0xF4F1EA;

// Yard size (15% smaller than 14 = ~12)
const FENCE_SIZE = 12;

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

async function init() {
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
  scene.add(camera);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
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
  await loadGltfModels();
  createHouse();
  createNeighborHouse();
  createPlayerCharacter();
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
  createCat();
  createWife();
  collectHouseMeshes();
  createRoofBirds();
  createFirstPersonArms();
  createFirstPersonMower();
  
  // Wife appears randomly
  wifeNextAppearance = 10 + Math.random() * 20;

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
    if (!isPointerLocked) isPainting = false;
    if (!showingDialog) {
      document.getElementById('click-prompt').style.display = isPointerLocked ? 'none' : 'flex';
    }
  });

  animate();
}

function enableShadows(root) {
  root.traverse((obj) => {
    if (obj.isMesh) {
      obj.castShadow = true;
      obj.receiveShadow = true;
      const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
      materials.forEach((mat) => {
        if (!mat) return;
        if (mat.map) {
          mat.map.colorSpace = THREE.SRGBColorSpace;
          mat.map.needsUpdate = true;
        }
        if ('metalness' in mat) mat.metalness = 0;
        if ('roughness' in mat) mat.roughness = 0.8;
      });
    }
  });
}

function loadGltf(url) {
  const loader = new GLTFLoader();
  return loader.loadAsync(url);
}

async function loadGltfModels() {
  const [houseGltf, neighborGltf, playerGltf, mowerGltf] = await Promise.all([
    loadGltf('/models/suburb/house.glb'),
    loadGltf('/models/suburb/neighbor-house.glb'),
    loadGltf('/models/player/player.glb'),
    loadGltf('/models/mower.glb'),
  ]);

  window._houseGltf = houseGltf;
  window._neighborGltf = neighborGltf;
  window._playerGltf = playerGltf;
  mowerTemplate = mowerGltf.scene;
  enableShadows(mowerTemplate);
}

function groundModel(model) {
  model.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model);
  model.position.y -= box.min.y;
  model.updateMatrixWorld(true);
  return new THREE.Box3().setFromObject(model);
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
  house = window._houseGltf.scene.clone(true);
  house.scale.setScalar(4.8);
  house.position.set(0, 0, 0);
  enableShadows(house);
  scene.add(house);
  const grounded = groundModel(house);
  houseBounds = {
    minX: grounded.min.x,
    maxX: grounded.max.x,
    minZ: grounded.min.z,
    maxZ: grounded.max.z,
    minY: grounded.min.y,
    maxY: grounded.max.y,
  };
}

function createNeighborHouse() {
  const neighborHouse = window._neighborGltf.scene.clone(true);
  neighborHouse.scale.setScalar(4.2);
  neighborHouse.position.set(-26, 0, -2);
  enableShadows(neighborHouse);
  scene.add(neighborHouse);
  groundModel(neighborHouse);
}

function createPlayerCharacter() {
  const gltf = window._playerGltf;
  playerModel = gltf.scene;
  playerModel.scale.setScalar(0.95);
  enableShadows(playerModel);
  playerModel.traverse((obj) => {
    if (obj.name === 'head' || obj.name === 'head-mesh') {
      obj.visible = false;
    }
  });
  scene.add(playerModel);
  playerModel.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(playerModel);
  playerFootOffset = -box.min.y;
  playerModel.position.set(playerPos.x, playerFootOffset, playerPos.z);

  playerMixer = new THREE.AnimationMixer(playerModel);
  const idleClip = THREE.AnimationClip.findByName(gltf.animations, 'idle');
  const walkClip = THREE.AnimationClip.findByName(gltf.animations, 'walk');
  if (idleClip) {
    playerActions.idle = playerMixer.clipAction(idleClip);
    playerActions.idle.play();
  }
  if (walkClip) {
    playerActions.walk = playerMixer.clipAction(walkClip);
  }
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

  deck.position.set(houseBounds.maxX + 2.8, 0, 2);
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
  const pathStart = houseBounds.maxZ;
  const pathLen = Math.max(2, FENCE_SIZE - pathStart - 0.4);
  const pathGeo = new THREE.PlaneGeometry(2.5, pathLen);
  const path = new THREE.Mesh(pathGeo, pathMat);
  path.rotation.x = -Math.PI / 2;
  path.position.set(0, 0.02, pathStart + pathLen / 2);
  path.receiveShadow = true;
  scene.add(path);

  // Paving stones on main path
  for (let i = 0; i < 50; i++) {
    const stoneGeo = new THREE.BoxGeometry(0.4 + Math.random() * 0.1, 0.03, 0.3 + Math.random() * 0.1);
    const stone = new THREE.Mesh(stoneGeo, stoneMat);
    stone.position.set(
      (Math.random() - 0.5) * 2,
      0.03,
      pathStart + Math.random() * pathLen
    );
    stone.rotation.y = Math.random() * 0.3;
    stone.receiveShadow = true;
    scene.add(stone);
  }

  // Side path to deck
  const sidePathGeo = new THREE.PlaneGeometry(4, 2);
  const sidePath = new THREE.Mesh(sidePathGeo, pathMat);
  sidePath.rotation.x = -Math.PI / 2;
  sidePath.position.set(houseBounds.maxX + 1.5, 0.02, 1.5);
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
  const model = new THREE.Group();
  
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
  model.add(body);
  
  // Head
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 6), bodyMat);
  head.position.set(0.35, 0.42, 0);
  head.scale.set(1.1, 1, 0.9);
  head.castShadow = true;
  model.add(head);
  
  // Snout
  const snout = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.15, 8), bodyMat);
  snout.rotation.z = Math.PI / 2;
  snout.position.set(0.48, 0.38, 0);
  model.add(snout);
  
  // Nose
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 4), noseMat);
  nose.position.set(0.56, 0.38, 0);
  model.add(nose);
  
  // Eyes
  [-0.05, 0.05].forEach(z => {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.025, 6, 4), eyeMat);
    eye.position.set(0.44, 0.46, z);
    model.add(eye);
  });
  
  // Ears (floppy)
  [-0.12, 0.12].forEach(z => {
    const ear = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 4), darkMat);
    ear.position.set(0.3, 0.5, z);
    ear.scale.set(0.5, 1, 0.8);
    model.add(ear);
  });
  
  // Tongue (happy dog!)
  const tongue = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.02, 0.04), tongueMat);
  tongue.position.set(0.5, 0.32, 0);
  tongue.rotation.x = 0.3;
  model.add(tongue);
  dog.userData.tongue = tongue;
  
  // Legs swing from the hip so they actually walk
  const legGeo = new THREE.CylinderGeometry(0.04, 0.045, 0.26, 6);
  const legPositions = [
    { x: 0.16, z: 0.1, name: 'frontLeft' },
    { x: 0.16, z: -0.1, name: 'frontRight' },
    { x: -0.16, z: 0.1, name: 'backLeft' },
    { x: -0.16, z: -0.1, name: 'backRight' }
  ];
  
  legPositions.forEach(pos => {
    const hip = new THREE.Group();
    hip.position.set(pos.x, 0.26, pos.z);
    const leg = new THREE.Mesh(legGeo, bodyMat);
    leg.position.y = -0.13;
    leg.castShadow = true;
    hip.add(leg);
    model.add(hip);
    dog.userData[pos.name] = hip;
  });
  
  // Tail (wagging!)
  const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.04, 0.2, 6), darkMat);
  tail.position.set(-0.3, 0.45, 0);
  tail.rotation.z = -0.5;
  model.add(tail);
  dog.userData.tail = tail;

  // Model faces +X; rotate so lookAt (which uses -Z) points the nose forward
  model.rotation.y = Math.PI / 2;
  dog.add(model);
  
  // Start in the yard, never inside the house
  dog.position.set(Math.min(FENCE_SIZE - 2, houseBounds.maxX + 2.5), 0, 8);
  dogTarget.copy(dog.position);
  pushOutOfHouse(dog);
  
  scene.add(dog);
}

function resetDogLegs() {
  if (!dog) return;
  ['frontLeft', 'frontRight', 'backLeft', 'backRight'].forEach((name) => {
    const hip = dog.userData[name];
    if (!hip) return;
    hip.rotation.x = 0;
    hip.rotation.z = 0;
  });
}

function createCat() {
  cat = new THREE.Group();
  
  const furMat = new THREE.MeshLambertMaterial({ color: 0x808080 }); // Gray cat
  const darkMat = new THREE.MeshLambertMaterial({ color: 0x505050 });
  const whiteMat = new THREE.MeshLambertMaterial({ color: 0xFFFFFF });
  const noseMat = new THREE.MeshLambertMaterial({ color: 0xFFB6C1 }); // Pink nose
  const eyeMat = new THREE.MeshLambertMaterial({ color: 0x90EE90 }); // Green eyes
  const pupilMat = new THREE.MeshLambertMaterial({ color: 0x000000 });
  
  // Body (lying down)
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 0.4, 8), furMat);
  body.rotation.z = Math.PI / 2;
  body.position.set(0, 0.12, 0);
  body.castShadow = true;
  cat.add(body);
  
  // Head
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), furMat);
  head.position.set(0.22, 0.18, 0);
  head.scale.set(1.1, 1, 0.9);
  head.castShadow = true;
  cat.add(head);
  
  // Ears
  [-0.06, 0.06].forEach(z => {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.08, 4), furMat);
    ear.position.set(0.2, 0.28, z);
    ear.rotation.x = z > 0 ? 0.2 : -0.2;
    cat.add(ear);
    
    const earInner = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.05, 4), noseMat);
    earInner.position.set(0.2, 0.27, z);
    earInner.rotation.x = z > 0 ? 0.2 : -0.2;
    cat.add(earInner);
  });
  
  // Eyes
  [-0.04, 0.04].forEach(z => {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.025, 6, 4), eyeMat);
    eye.position.set(0.3, 0.2, z);
    eye.scale.set(0.6, 1, 0.8);
    cat.add(eye);
    
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.012, 4, 3), pupilMat);
    pupil.position.set(0.31, 0.2, z);
    pupil.scale.set(0.5, 1, 0.8);
    cat.add(pupil);
  });
  
  // Nose
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.015, 4, 3), noseMat);
  nose.position.set(0.32, 0.15, 0);
  cat.add(nose);
  
  // Whiskers (simplified as small lines)
  const whiskerMat = new THREE.MeshBasicMaterial({ color: 0xCCCCCC });
  [-0.03, 0, 0.03].forEach(y => {
    [-1, 1].forEach(side => {
      const whisker = new THREE.Mesh(new THREE.CylinderGeometry(0.002, 0.002, 0.08, 4), whiskerMat);
      whisker.rotation.z = Math.PI / 2;
      whisker.rotation.y = side * 0.3;
      whisker.position.set(0.32, 0.14 + y * 0.02, side * 0.06);
      cat.add(whisker);
    });
  });
  
  // Front paws (tucked under)
  [-0.08, 0.08].forEach(z => {
    const paw = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 4), furMat);
    paw.position.set(0.15, 0.04, z);
    paw.scale.set(1, 0.6, 0.8);
    cat.add(paw);
  });
  
  // Back paws
  [-0.1, 0.1].forEach(z => {
    const paw = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 4), furMat);
    paw.position.set(-0.15, 0.04, z);
    paw.scale.set(1, 0.6, 0.8);
    cat.add(paw);
  });
  
  // Tail (curled around body)
  const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.03, 0.25, 6), darkMat);
  tail.rotation.z = Math.PI / 2;
  tail.position.set(-0.25, 0.1, 0.12);
  cat.add(tail);
  
  const tailTip = new THREE.Mesh(new THREE.SphereGeometry(0.025, 6, 4), darkMat);
  tailTip.position.set(-0.35, 0.1, 0.15);
  cat.add(tailTip);
  
  // Lie outside the front wall — never inside the house footprint
  cat.position.set(2.6, 0, houseBounds.maxZ + 1.4);
  cat.rotation.y = Math.PI * 0.85;
  
  scene.add(cat);
}

function createWife() {
  wife = new THREE.Group();
  
  const skinMat = new THREE.MeshLambertMaterial({ color: 0xFFDBC4 });
  const hairMat = new THREE.MeshLambertMaterial({ color: 0x4A3728 }); // Brown hair
  const dressMat = new THREE.MeshLambertMaterial({ color: 0x87CEEB }); // Light blue dress
  const shoeMat = new THREE.MeshLambertMaterial({ color: 0x8B4513 });
  
  // Head
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 10), skinMat);
  head.position.y = 1.5;
  head.scale.set(0.9, 1, 0.85);
  head.castShadow = true;
  wife.add(head);
  
  // Hair (longer, styled)
  const hairTop = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.6), hairMat);
  hairTop.position.y = 1.55;
  wife.add(hairTop);
  
  // Hair sides/back (ponytail style)
  const hairBack = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.06, 0.4, 8), hairMat);
  hairBack.position.set(0, 1.3, -0.15);
  hairBack.rotation.x = 0.3;
  wife.add(hairBack);
  
  // Eyes
  const eyeMat = new THREE.MeshLambertMaterial({ color: 0x4169E1 }); // Blue eyes
  [-0.07, 0.07].forEach(x => {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 4), eyeMat);
    eye.position.set(x, 1.52, 0.16);
    wife.add(eye);
  });
  
  // Smile
  const smileMat = new THREE.MeshLambertMaterial({ color: 0xCC6666 });
  const smile = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.01, 8, 8, Math.PI), smileMat);
  smile.position.set(0, 1.42, 0.16);
  smile.rotation.x = Math.PI;
  wife.add(smile);
  
  // Body/Dress
  const dress = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.25, 0.7, 12), dressMat);
  dress.position.y = 0.95;
  dress.castShadow = true;
  wife.add(dress);
  
  // Arms
  const armGeo = new THREE.CylinderGeometry(0.04, 0.045, 0.35, 8);
  
  const leftArm = new THREE.Group();
  leftArm.position.set(-0.2, 1.15, 0);
  const leftArmMesh = new THREE.Mesh(armGeo, skinMat);
  leftArm.add(leftArmMesh);
  wife.add(leftArm);
  wife.userData.leftArm = leftArm;
  
  const rightArm = new THREE.Group();
  rightArm.position.set(0.2, 1.15, 0);
  const rightArmMesh = new THREE.Mesh(armGeo, skinMat);
  rightArm.add(rightArmMesh);
  wife.add(rightArm);
  wife.userData.rightArm = rightArm;
  
  // Legs
  const legGeo = new THREE.CylinderGeometry(0.05, 0.05, 0.4, 8);
  
  const leftLeg = new THREE.Group();
  leftLeg.position.set(-0.08, 0.4, 0);
  leftLeg.add(new THREE.Mesh(legGeo, skinMat));
  const leftShoe = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.05, 0.12), shoeMat);
  leftShoe.position.y = -0.22;
  leftLeg.add(leftShoe);
  wife.add(leftLeg);
  wife.userData.leftLeg = leftLeg;
  
  const rightLeg = new THREE.Group();
  rightLeg.position.set(0.08, 0.4, 0);
  rightLeg.add(new THREE.Mesh(legGeo, skinMat));
  const rightShoe = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.05, 0.12), shoeMat);
  rightShoe.position.y = -0.22;
  rightLeg.add(rightShoe);
  wife.add(rightLeg);
  wife.userData.rightLeg = rightLeg;
  
  // Start inside house (hidden)
  wife.position.set(0, 0, houseBounds.maxZ);
  wife.visible = false;
  
  scene.add(wife);
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

  const viewMower = mowerTemplate.clone(true);
  enableShadows(viewMower);
  viewMower.scale.setScalar(0.4);
  // Keep a walk-behind mower low in the view, not up in the player's face
  viewMower.rotation.set(0.06, Math.PI, 0);
  viewMower.position.set(0, -1.05, -1.35);
  fpMowerHandle.add(viewMower);

  const skinMat = new THREE.MeshLambertMaterial({ color: 0xDEB887 });
  const shirtMat = new THREE.MeshLambertMaterial({ color: 0xE07A3D });
  const shirtDarkMat = new THREE.MeshLambertMaterial({ color: 0xC45C22 });

  const leftArm = new THREE.Group();
  const leftForearm = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.055, 0.28, 8), skinMat);
  leftForearm.rotation.z = Math.PI / 2 + 0.35;
  leftForearm.rotation.x = 0.2;
  leftForearm.position.set(-0.1, 0.02, 0);
  leftArm.add(leftForearm);
  const leftSleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.075, 0.2, 8), shirtMat);
  leftSleeve.rotation.z = Math.PI / 2 + 0.45;
  leftSleeve.position.set(-0.22, 0.08, 0.02);
  leftArm.add(leftSleeve);
  const leftHand = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), skinMat);
  leftHand.scale.set(1.2, 0.7, 0.9);
  leftHand.position.set(0.04, -0.04, -0.02);
  leftArm.add(leftHand);
  leftArm.position.set(-0.18, -0.38, -0.42);
  fpMowerHandle.add(leftArm);

  const rightArm = new THREE.Group();
  const rightForearm = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.055, 0.28, 8), skinMat);
  rightForearm.rotation.z = -Math.PI / 2 - 0.35;
  rightForearm.rotation.x = 0.2;
  rightForearm.position.set(0.1, 0.02, 0);
  rightArm.add(rightForearm);
  const rightSleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.075, 0.2, 8), shirtMat);
  rightSleeve.rotation.z = -Math.PI / 2 - 0.45;
  rightSleeve.position.set(0.22, 0.08, 0.02);
  rightArm.add(rightSleeve);
  const rightHand = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), skinMat);
  rightHand.scale.set(1.2, 0.7, 0.9);
  rightHand.position.set(-0.04, -0.04, -0.02);
  rightArm.add(rightHand);
  rightArm.position.set(0.18, -0.38, -0.42);
  fpMowerHandle.add(rightArm);

  fpMowerHandle.visible = true;
  camera.add(fpMowerHandle);
}
  

function createGrass() {
  grassBlades = [];
  totalGrass = 0;

  const fenceInner = FENCE_SIZE - 0.5;
  
  // First pass: count how many grass positions we need
  const grassPositions = [];
  for (let x = -fenceInner; x < fenceInner; x += 1 / GRASS_DENSITY) {
    for (let z = -fenceInner; z < fenceInner; z += 1 / GRASS_DENSITY) {
      if (isInHouseArea(x, z) || isOnPath(x, z) || isOnDeck(x, z)) continue;
      
      const stripeIndex = Math.floor((x + fenceInner) * 2);
      const isLightStripe = stripeIndex % 2 === 0;
      
      grassPositions.push({
        x: x + (Math.random() - 0.5) * 0.05,
        z: z + (Math.random() - 0.5) * 0.05,
        isLightStripe
      });
    }
  }
  
  // Create instanced meshes for grass (much faster!)
  const bladeGeo = new THREE.ConeGeometry(0.02, 0.3, 3);
  const lightGrassMat = new THREE.MeshLambertMaterial({ color: COLORS.grassTall });
  const darkGrassMat = new THREE.MeshLambertMaterial({ color: darkenColor(COLORS.grassTall, 0.92) });
  
  // Separate light and dark grass for stripe effect
  const lightPositions = grassPositions.filter(p => p.isLightStripe);
  const darkPositions = grassPositions.filter(p => !p.isLightStripe);
  
  // Create instanced mesh for light grass
  const lightGrassInstanced = new THREE.InstancedMesh(bladeGeo, lightGrassMat, lightPositions.length * 2);
  lightGrassInstanced.castShadow = true;
  
  const darkGrassInstanced = new THREE.InstancedMesh(bladeGeo, darkGrassMat, darkPositions.length * 2);
  darkGrassInstanced.castShadow = true;
  
  const dummy = new THREE.Object3D();
  
  // Set up light grass instances (2 blades per position for density)
  lightPositions.forEach((pos, i) => {
    for (let b = 0; b < 2; b++) {
      dummy.position.set(
        pos.x + (Math.random() - 0.5) * 0.06,
        0.15,
        pos.z + (Math.random() - 0.5) * 0.06
      );
      dummy.rotation.set(
        (Math.random() - 0.5) * 0.3,
        Math.random() * Math.PI,
        (Math.random() - 0.5) * 0.3
      );
      dummy.scale.set(1, 0.8 + Math.random() * 0.4, 1);
      dummy.updateMatrix();
      lightGrassInstanced.setMatrixAt(i * 2 + b, dummy.matrix);
    }
  });
  
  // Set up dark grass instances
  darkPositions.forEach((pos, i) => {
    for (let b = 0; b < 2; b++) {
      dummy.position.set(
        pos.x + (Math.random() - 0.5) * 0.06,
        0.15,
        pos.z + (Math.random() - 0.5) * 0.06
      );
      dummy.rotation.set(
        (Math.random() - 0.5) * 0.3,
        Math.random() * Math.PI,
        (Math.random() - 0.5) * 0.3
      );
      dummy.scale.set(1, 0.8 + Math.random() * 0.4, 1);
      dummy.updateMatrix();
      darkGrassInstanced.setMatrixAt(i * 2 + b, dummy.matrix);
    }
  });
  
  lightGrassInstanced.instanceMatrix.needsUpdate = true;
  darkGrassInstanced.instanceMatrix.needsUpdate = true;
  
  scene.add(lightGrassInstanced);
  scene.add(darkGrassInstanced);
  
  // Store grass data for mowing with direct instance index reference
  let lightIdx = 0;
  let darkIdx = 0;
  grassPositions.forEach(pos => {
    const instanceIndex = pos.isLightStripe ? lightIdx++ : darkIdx++;
    grassBlades.push({
      x: pos.x,
      z: pos.z,
      isTall: true,
      stripeLight: pos.isLightStripe,
      instanceIndex: instanceIndex // Direct reference to instanced mesh index
    });
    totalGrass++;
  });
  
  // Store instanced meshes for later modification
  window.grassInstancedLight = lightGrassInstanced;
  window.grassInstancedDark = darkGrassInstanced;
}

function darkenColor(hex, factor) {
  const color = new THREE.Color(hex);
  color.multiplyScalar(factor);
  return color.getHex();
}

function isInHouseArea(x, z) {
  const pad = 0.85;
  return (
    x > houseBounds.minX - pad &&
    x < houseBounds.maxX + pad &&
    z > houseBounds.minZ - pad &&
    z < houseBounds.maxZ + pad
  );
}

function pushOutOfHouse(obj) {
  if (!obj || !isInHouseArea(obj.position.x, obj.position.z)) return;
  const pad = 1.05;
  const x = obj.position.x;
  const z = obj.position.z;
  const dist = {
    minX: x - (houseBounds.minX - pad),
    maxX: (houseBounds.maxX + pad) - x,
    minZ: z - (houseBounds.minZ - pad),
    maxZ: (houseBounds.maxZ + pad) - z,
  };
  const nearest = Object.keys(dist).reduce((a, b) => (dist[a] < dist[b] ? a : b));
  if (nearest === 'minX') obj.position.x = houseBounds.minX - pad;
  else if (nearest === 'maxX') obj.position.x = houseBounds.maxX + pad;
  else if (nearest === 'minZ') obj.position.z = houseBounds.minZ - pad;
  else obj.position.z = houseBounds.maxZ + pad;
}

function tryMoveAroundHouse(obj, dx, dz) {
  const x = obj.position.x;
  const z = obj.position.z;
  const nx = x + dx;
  const nz = z + dz;
  if (!isInHouseArea(nx, nz)) {
    obj.position.x = nx;
    obj.position.z = nz;
    return true;
  }
  if (!isInHouseArea(nx, z)) {
    obj.position.x = nx;
    return true;
  }
  if (!isInHouseArea(x, nz)) {
    obj.position.z = nz;
    return true;
  }
  return false;
}

function collectHouseMeshes() {
  houseMeshes = [];
  if (!house) return;
  house.updateMatrixWorld(true);
  house.traverse((child) => {
    if (child.isMesh) houseMeshes.push(child);
  });
}

function createSittingBird(color) {
  const bird = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color });
  const bellyMat = new THREE.MeshLambertMaterial({ color: 0xF3E6D0 });
  const beakMat = new THREE.MeshLambertMaterial({ color: 0xE8A317 });
  const eyeMat = new THREE.MeshLambertMaterial({ color: 0x1a1a1a });
  const legMat = new THREE.MeshLambertMaterial({ color: 0xC45C26 });

  const body = new THREE.Mesh(new THREE.SphereGeometry(0.075, 8, 6), bodyMat);
  body.scale.set(1.2, 0.85, 1);
  body.position.y = 0.08;
  body.castShadow = true;
  bird.add(body);

  const belly = new THREE.Mesh(new THREE.SphereGeometry(0.048, 6, 5), bellyMat);
  belly.position.set(0.01, 0.05, 0.015);
  belly.scale.set(0.95, 0.7, 0.8);
  bird.add(belly);

  const head = new THREE.Group();
  head.position.set(0.06, 0.13, 0);
  const headMesh = new THREE.Mesh(new THREE.SphereGeometry(0.042, 8, 6), bodyMat);
  head.add(headMesh);
  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.038, 5), beakMat);
  beak.rotation.z = -Math.PI / 2;
  beak.position.set(0.032, -0.004, 0);
  head.add(beak);
  [-0.014, 0.014].forEach((side) => {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.008, 5, 4), eyeMat);
    eye.position.set(0.024, 0.01, side);
    head.add(eye);
  });
  bird.add(head);
  bird.userData.head = head;

  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.032, 0.085, 4), bodyMat);
  tail.rotation.z = Math.PI / 2.5;
  tail.position.set(-0.085, 0.09, 0);
  bird.add(tail);

  [-1, 1].forEach((side) => {
    const wing = new THREE.Mesh(new THREE.SphereGeometry(0.042, 6, 5), bodyMat);
    wing.scale.set(0.95, 0.32, 0.55);
    wing.position.set(-0.01, 0.08, side * 0.052);
    wing.rotation.y = side * 0.25;
    bird.add(wing);
  });

  [-1, 1].forEach((side) => {
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.028, 4), legMat);
    foot.position.set(0.012, 0.014, side * 0.02);
    bird.add(foot);
  });

  bird.userData.phase = Math.random() * Math.PI * 2;
  bird.userData.turn = (Math.random() - 0.5) * 0.8;
  return bird;
}

function createRoofBirds() {
  roofBirds.forEach((b) => scene.remove(b));
  roofBirds = [];
  if (!house || houseMeshes.length === 0) return;

  const colors = [0x8B6914, 0x6B5B4F, 0xC45C26, 0x5C6570, 0xA67C52];
  const cx = (houseBounds.minX + houseBounds.maxX) * 0.5;
  const cz = (houseBounds.minZ + houseBounds.maxZ) * 0.5;
  const spots = [
    [cx + 0.1, cz + 0.15],
    [cx + 0.9, cz - 0.5],
    [cx - 0.8, cz + 0.4],
    [cx + 0.4, cz + 0.95],
    [cx - 0.35, cz - 0.85],
  ];
  const minRoofY = (houseBounds.minY || 0) + ((houseBounds.maxY || 5) - (houseBounds.minY || 0)) * 0.48;
  const raycaster = new THREE.Raycaster();
  const down = new THREE.Vector3(0, -1, 0);

  spots.forEach((spot, i) => {
    const origin = new THREE.Vector3(spot[0], (houseBounds.maxY || 6) + 2.5, spot[1]);
    raycaster.set(origin, down);
    const hits = raycaster.intersectObjects(houseMeshes, false);
    if (!hits.length || hits[0].point.y < minRoofY) return;
    const bird = createSittingBird(colors[i % colors.length]);
    bird.position.copy(hits[0].point);
    bird.position.y += 0.02;
    bird.rotation.y = Math.random() * Math.PI * 2;
    bird.userData.baseY = bird.position.y;
    scene.add(bird);
    roofBirds.push(bird);
  });
}

function updateRoofBirds(time) {
  roofBirds.forEach((bird) => {
    const phase = bird.userData.phase || 0;
    bird.position.y = bird.userData.baseY + Math.sin(time * 2.2 + phase) * 0.008;
    if (bird.userData.head) {
      bird.userData.head.rotation.y = Math.sin(time * 0.7 + phase) * 0.45;
      bird.userData.head.rotation.x = Math.sin(time * 1.4 + phase * 1.3) * 0.08;
    }
    bird.rotation.y += Math.sin(time * 0.15 + phase) * 0.002;
  });
}

function isOnPath(x, z) {
  if (Math.abs(x) < 1.5 && z > houseBounds.maxZ - 0.2 && z < FENCE_SIZE) return true;
  if (x > houseBounds.maxX - 0.5 && x < houseBounds.maxX + 4 && z > 0 && z < 3.5) return true;
  return false;
}

function isOnDeck(x, z) {
  return x > houseBounds.maxX + 0.2 && x < houseBounds.maxX + 6 && z > -1 && z < 5;
}

function createMower() {
  mower = mowerTemplate.clone(true);
  enableShadows(mower);
  mower.scale.setScalar(1);
  mower.position.set(playerPos.x, 0, playerPos.z - 1.6);
  mower.visible = false;
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
  loadGameSounds().then(() => {
    startAmbientSounds();
    startMowerLoop();
  }).catch((err) => {
    console.warn('Could not load sound files, falling back to simple tones', err);
    createAmbientSounds();
    createMowerSound();
  });
}

const SOUND_FILES = {
  mower: '/sounds/mower.ogg',
  punch: '/sounds/punch.ogg',
  punchAlt: '/sounds/punch-alt.ogg',
  punchHeavy: '/sounds/punch-heavy.ogg',
  hurt: '/sounds/hurt.ogg',
  bark: '/sounds/bark.ogg',
  meow: '/sounds/meow.ogg',
  whistle: '/sounds/whistle.ogg',
  paint: '/sounds/paint.ogg',
  birds: '/sounds/birds.ogg',
  music: '/sounds/music.ogg',
  step0: '/sounds/step-0.ogg',
  step1: '/sounds/step-1.ogg',
  step2: '/sounds/step-2.ogg',
  success: '/sounds/success.ogg',
};

async function loadGameSounds() {
  const entries = Object.entries(SOUND_FILES);
  await Promise.all(entries.map(async ([name, url]) => {
    const res = await fetch(url);
    const data = await res.arrayBuffer();
    soundBuffers[name] = await audioContext.decodeAudioData(data);
  }));
}

function playSound(name, { volume = 1, rate = 1, loop = false } = {}) {
  if (!audioContext || !soundBuffers[name]) return null;
  const src = audioContext.createBufferSource();
  src.buffer = soundBuffers[name];
  src.loop = loop;
  src.playbackRate.value = rate;
  const gain = audioContext.createGain();
  gain.gain.value = volume;
  src.connect(gain);
  gain.connect(audioContext.destination);
  src.start();
  return { src, gain };
}

function startAmbientSounds() {
  playSound('birds', { volume: 0.12, loop: true });
  if (soundBuffers.music) {
    const played = playSound('music', { volume: 0.14, loop: true });
    if (played) musicGain = played.gain;
  }
}

function setMusicVolume(volume) {
  if (!musicGain || !audioContext) return;
  musicGain.gain.cancelScheduledValues(audioContext.currentTime);
  musicGain.gain.linearRampToValueAtTime(volume, audioContext.currentTime + 0.4);
}

function shoutNeighbor(text) {
  if (!window.speechSynthesis) return;
  const speak = () => {
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = 'da-DK';
    utter.pitch = 0.35;
    utter.rate = 1.08;
    utter.volume = 1;
    const voices = window.speechSynthesis.getVoices();
    const danish = voices.find((v) => v.lang && v.lang.toLowerCase().startsWith('da'));
    const male = voices.find((v) => /male|daniel|david|fred|google uk/i.test(v.name));
    utter.voice = danish || male || voices[0] || null;
    window.speechSynthesis.speak(utter);
  };
  if (window.speechSynthesis.getVoices().length) speak();
  else {
    window.speechSynthesis.addEventListener('voiceschanged', speak, { once: true });
    speak();
  }
}

function startMowerLoop() {
  if (!soundBuffers.mower) return;
  mowerGain = audioContext.createGain();
  mowerGain.gain.value = 0;
  mowerGain.connect(audioContext.destination);
  mowerSource = audioContext.createBufferSource();
  mowerSource.buffer = soundBuffers.mower;
  mowerSource.loop = true;
  mowerSource.connect(mowerGain);
  mowerSource.start();
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
  if (!mowerGain || !audioContext) return;
  const targetVolume = isMoving ? 0.28 : 0;
  mowerGain.gain.cancelScheduledValues(audioContext.currentTime);
  mowerGain.gain.linearRampToValueAtTime(targetVolume, audioContext.currentTime + 0.12);
}

function playPunchSound(isPlayerPunch) {
  if (!audioContext) return;
  if (soundBuffers.punch) {
    const name = isPlayerPunch
      ? (Math.random() < 0.5 ? 'punch' : 'punchAlt')
      : 'punchHeavy';
    playSound(name, {
      volume: isPlayerPunch ? 0.55 : 0.7,
      rate: 0.92 + Math.random() * 0.16,
    });
    return;
  }
  
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
  if (soundBuffers.hurt) {
    playSound('hurt', { volume: 0.55, rate: 0.9 + Math.random() * 0.2 });
    return;
  }
  
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

function playDogBark() {
  if (!audioContext) return;
  if (soundBuffers.bark) {
    playSound('bark', { volume: 0.55, rate: 0.95 + Math.random() * 0.1 });
    return;
  }
  
  // Two-tone bark
  for (let i = 0; i < 2; i++) {
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();
    
    osc.type = 'sawtooth';
    const startTime = audioContext.currentTime + i * 0.25;
    osc.frequency.setValueAtTime(250 + i * 50, startTime);
    osc.frequency.exponentialRampToValueAtTime(150, startTime + 0.15);
    
    gain.gain.setValueAtTime(0, startTime);
    gain.gain.linearRampToValueAtTime(0.15, startTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.01, startTime + 0.15);
    
    osc.connect(gain);
    gain.connect(audioContext.destination);
    
    osc.start(startTime);
    osc.stop(startTime + 0.2);
  }
}

function playCatMeow() {
  if (!audioContext) return;
  if (soundBuffers.meow) {
    playSound('meow', { volume: 0.7, rate: 0.94 + Math.random() * 0.12 });
    return;
  }
  
  const osc = audioContext.createOscillator();
  const gain = audioContext.createGain();
  const filter = audioContext.createBiquadFilter();
  
  filter.type = 'bandpass';
  filter.frequency.value = 800;
  filter.Q.value = 2;
  
  osc.type = 'sine';
  osc.frequency.setValueAtTime(500, audioContext.currentTime);
  osc.frequency.linearRampToValueAtTime(700, audioContext.currentTime + 0.15);
  osc.frequency.linearRampToValueAtTime(400, audioContext.currentTime + 0.4);
  
  gain.gain.setValueAtTime(0, audioContext.currentTime);
  gain.gain.linearRampToValueAtTime(0.12, audioContext.currentTime + 0.05);
  gain.gain.linearRampToValueAtTime(0.08, audioContext.currentTime + 0.2);
  gain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
  
  osc.connect(filter);
  filter.connect(gain);
  gain.connect(audioContext.destination);
  
  osc.start(audioContext.currentTime);
  osc.stop(audioContext.currentTime + 0.5);
}

function playWifeWhistle() {
  if (!audioContext) return;
  if (soundBuffers.whistle) {
    playSound('whistle', { volume: 0.45 });
    return;
  }
  
  // Two-tone whistle
  const notes = [800, 1000, 800, 600];
  const noteDuration = 0.2;
  
  notes.forEach((freq, i) => {
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();
    
    osc.type = 'sine';
    const startTime = audioContext.currentTime + i * noteDuration;
    osc.frequency.setValueAtTime(freq, startTime);
    
    gain.gain.setValueAtTime(0, startTime);
    gain.gain.linearRampToValueAtTime(0.1, startTime + 0.02);
    gain.gain.setValueAtTime(0.1, startTime + noteDuration - 0.05);
    gain.gain.linearRampToValueAtTime(0, startTime + noteDuration);
    
    osc.connect(gain);
    gain.connect(audioContext.destination);
    
    osc.start(startTime);
    osc.stop(startTime + noteDuration);
  });
}

function setupControls() {
  window.addEventListener('keydown', (e) => {
    if (e.code === 'KeyW') keys.w = true;
    if (e.code === 'KeyA') keys.a = true;
    if (e.code === 'KeyS') keys.s = true;
    if (e.code === 'KeyD') keys.d = true;
    if (e.code === 'Space') keys.space = true;
    if (e.code === 'KeyR' && neighborState === 'won') restartGame();
    
    // Debug shortcut: Press 2 to skip to Level 2 (paint house)
    if (e.code === 'Digit2' && currentLevel === 1) {
      startLevel2();
    }
    
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
          if (window.speechSynthesis) window.speechSynthesis.cancel();
          shoutNeighbor('Okay okay, jeg giver op!');
          setMusicVolume(0.14);
          showDialog('NABOEN', 'Okay okay, jeg giver op! Slå dit græs...');
          setTimeout(hideDialog, 2000);
        }
      }
    }
  });

  window.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    if (currentLevel === 2 && isPointerLocked && !showingDialog && neighborState !== 'fighting') {
      isPainting = true;
    }
  });

  window.addEventListener('mouseup', () => {
    isPainting = false;
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
  // Reset to level 1
  currentLevel = 1;
  
  // Reset grass (remove instanced meshes)
  if (window.grassInstancedLight) scene.remove(window.grassInstancedLight);
  if (window.grassInstancedDark) scene.remove(window.grassInstancedDark);
  createGrass();
  
  clearPaintSplats();
  paintProgress = 0;
  isPainting = false;
  const crosshair = document.getElementById('paint-crosshair');
  if (crosshair) crosshair.classList.add('hidden');
  
  if (window.speechSynthesis) window.speechSynthesis.cancel();
  setMusicVolume(0.14);
  
  // Reset player
  playerPos.set(-6, 1.5, 10);
  playerYaw = 0;
  playerPitch = -0.08;
  playerHealth = 100;
  completed = false;
  
  // Reset neighbor
  neighborState = 'waiting';
  neighborAnger = 0;
  isPunching = false;
  neighbor.visible = false;
  neighbor.position.set(-FENCE_SIZE - 6, 0, 0);
  
  // Reset dog
  if (dog) {
    dog.position.set(Math.min(FENCE_SIZE - 2, houseBounds.maxX + 2.5), 0, 8);
    dogTarget.copy(dog.position);
    dogWaitTime = 0;
    dogIsPeeing = false;
    dogPeeTime = 0;
    dogBarkedAtNeighbor = false;
    resetDogLegs();
  }
  
  // Reset cat
  catMeowCooldown = 0;
  if (cat) {
    cat.position.set(2.6, 0, houseBounds.maxZ + 1.4);
    pushOutOfHouse(cat);
  }
  
  // Reset wife
  wifeState = 'inside';
  wifeTimer = 0;
  wifeNextAppearance = 10 + Math.random() * 20;
  if (wife) wife.visible = false;
  
  // Show first-person mower, keep world mower as a hidden mow-point
  if (mower) mower.visible = false;
  if (fpMowerHandle) fpMowerHandle.visible = true;
  
  // Remove paintbrush if exists
  const paintbrush = camera.getObjectByName('paintbrush');
  if (paintbrush) camera.remove(paintbrush);
  
  // Reset HUD
  document.getElementById('grass-display').innerHTML = '🌿 Græs slået: <span id="grass-percent">0</span>%';
  document.getElementById('controls-hint').textContent = '⌨️ WASD + Mus';
  document.querySelector('.modal-content h2').textContent = '🎉 Græsset er slået!';
  document.getElementById('restart-btn').textContent = '🔄 Ny dag';
  document.getElementById('restart-btn').onclick = restartGame;
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
  const mowed = grassBlades.filter(b => !b.isTall).length;
  const percent = (mowed / totalGrass) * 100;

  if (neighborState === 'waiting' && percent > 25) {
    neighborState = 'walking_to_gate';
    neighbor.visible = true;
    // Start outside the fence, will walk to gate
    neighbor.position.set(-FENCE_SIZE - 4, 0, 0);
    setMusicVolume(0.05);
    shoutNeighbor('HEY! Kan du ikke stoppe den larm? Det er søndag formiddag!');
    showDialog('SUR NABO', 'HEY! Kan du ikke stoppe den larm?! Det er søndag formiddag!');
    setTimeout(() => {
      hideDialog();
      shoutNeighbor('Jeg kommer ind og smadrer dig!');
      showDialog('SUR NABO', 'Jeg kommer ind og smadrer dig!');
      setTimeout(hideDialog, 2000);
    }, 2500);
    document.getElementById('health-bar').classList.remove('hidden');
    neighborAnger = 100;
    dogBarkedAtNeighbor = false;
    
    // Open the gate animation
    if (gardenGate) {
      gardenGate.rotation.y = Math.PI / 2 - 0.8; // Gate swings open
    }
  }
  
  // Dog barks when neighbor enters the yard
  if ((neighborState === 'walking_to_gate' || neighborState === 'approaching') && !dogBarkedAtNeighbor) {
    if (neighbor.position.x > -FENCE_SIZE - 1) {
      playDogBark();
      dogBarkedAtNeighbor = true;
      // Dog runs to bark at neighbor
      dogTarget.set(-FENCE_SIZE + 3, 0, 2);
      dogWaitTime = 0;
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
      shoutNeighbor('Nu skal du få tæsk!');
      showDialog('SUR NABO', 'Nu skal du få TÆSK!');
      setTimeout(hideDialog, 1500);
      neighborShoutAt = time + 2;
    }
  }

  if (neighborState === 'fighting' && !showingDialog) {
    neighbor.lookAt(playerPos.x, neighbor.position.y, playerPos.z);

    if (time > neighborShoutAt) {
      const yells = [
        'Stop den larm!',
        'Hold kæft med den maskine!',
        'Ud af haven!',
        'Jeg smadrer dig!',
        'Det er søndag!',
      ];
      shoutNeighbor(yells[Math.floor(Math.random() * yells.length)]);
      neighborShoutAt = time + 2.2 + Math.random() * 1.8;
    }
    
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
        shoutNeighbor('Ha! Så blev der stille!');
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
      setMusicVolume(0.14);
      if (window.speechSynthesis) window.speechSynthesis.cancel();
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

  const dt = clock.getDelta();
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

  if (isMoving && currentLevel === 1) {
    stepTimer -= dt;
    if (stepTimer <= 0) {
      const step = `step${Math.floor(Math.random() * 3)}`;
      playSound(step, { volume: 0.22, rate: 0.92 + Math.random() * 0.16 });
      stepTimer = 0.38;
    }
  } else {
    stepTimer = 0;
  }
  
  // Only play mower sound in Level 1
  if (currentLevel === 1) {
    updateMowerSound(isMoving);
  } else {
    updateMowerSound(false); // Silence mower in Level 2
  }

  // First-person camera
  camera.position.copy(playerPos);
  camera.rotation.order = 'YXZ';
  camera.rotation.y = playerYaw;
  camera.rotation.x = playerPitch;

  // World mower stays in front of the player (camera looks down -Z)
  const mowerOffset = new THREE.Vector3(0, 0, -1.7);
  mowerOffset.applyAxisAngle(new THREE.Vector3(0, 1, 0), playerYaw);
  mower.position.set(
    playerPos.x + mowerOffset.x,
    0,
    playerPos.z + mowerOffset.z
  );
  mower.rotation.y = playerYaw + Math.PI;

  if (playerModel) {
    playerModel.position.set(playerPos.x, playerFootOffset, playerPos.z);
    playerModel.rotation.y = playerYaw;
  }
  if (playerMixer) playerMixer.update(dt);
  if (playerActions.walk && playerActions.idle) {
    const shouldWalk = isMoving && currentLevel === 1;
    if (shouldWalk && !playerActions.walk.isRunning()) {
      playerActions.idle.fadeOut(0.15);
      playerActions.walk.reset().fadeIn(0.15).play();
    } else if (!shouldWalk && !playerActions.idle.isRunning()) {
      playerActions.walk.fadeOut(0.15);
      playerActions.idle.reset().fadeIn(0.15).play();
    }
  }

  // Grass sway animation is now handled by wind via shader (instanced mesh optimization)

  updateNeighbor();
  updateDog();
  updateCat();
  updateWife();
  updateRoofBirds(clock.getElapsedTime());
  
  if (currentLevel === 1) {
    checkMowing();
  } else if (currentLevel === 2) {
    updatePaintbrush();
    if (isPainting && isPointerLocked && !showingDialog) {
      applyPaintStroke();
    }
  }
  updateHUD();
  checkCompletion();
}

function pickYardTarget() {
  let newX;
  let newZ;
  let tries = 0;
  do {
    newX = (Math.random() - 0.5) * (FENCE_SIZE - 2) * 2;
    newZ = (Math.random() - 0.5) * (FENCE_SIZE - 2) * 2;
    tries++;
  } while ((isInHouseArea(newX, newZ) || isOnDeck(newX, newZ)) && tries < 20);
  if (isInHouseArea(newX, newZ)) {
    newX = houseBounds.maxX + 2.2;
    newZ = houseBounds.maxZ + 2.2;
  }
  return { x: newX, z: newZ };
}

function updateDog() {
  if (!dog) return;
  
  const time = clock.getElapsedTime();
  pushOutOfHouse(dog);
  
  // Check if player is too close - run away!
  const distToPlayer = dog.position.distanceTo(playerPos);
  if (distToPlayer < 3 && !dogIsPeeing) {
    // Run away from player
    const awayDir = new THREE.Vector3();
    awayDir.subVectors(dog.position, playerPos);
    awayDir.y = 0;
    awayDir.normalize();
    
    // Set new target away from player
    let newX = dog.position.x + awayDir.x * 5;
    let newZ = dog.position.z + awayDir.z * 5;
    
    // Clamp to yard bounds
    newX = Math.max(-FENCE_SIZE + 1, Math.min(FENCE_SIZE - 1, newX));
    newZ = Math.max(-FENCE_SIZE + 1, Math.min(FENCE_SIZE - 1, newZ));
    
    // Avoid house — don't run through walls
    if (isInHouseArea(newX, newZ)) {
      const around = pickYardTarget();
      newX = around.x;
      newZ = around.z;
    }
    
    dogTarget.set(newX, 0, newZ);
    dogWaitTime = 0;
  }
  
  // Peeing animation
  if (dogIsPeeing) {
    dogPeeTime -= 0.016;
    // Lift leg pose
    dog.userData.backRight.rotation.z = 0;
    dog.userData.backRight.rotation.x = 0.9;
    dog.userData.tail.rotation.z = -0.3;
    
    if (dogPeeTime <= 0) {
      dogIsPeeing = false;
      resetDogLegs();
      dogWaitTime = 1 + Math.random() * 2;
    }
    return;
  }
  
  // Dog AI - wander around happily
  if (dogWaitTime > 0) {
    dogWaitTime -= 0.016;
    resetDogLegs();
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
    const running = distToPlayer < 3.5;
    const speed = running ? 0.07 : 0.045;
    const moved = tryMoveAroundHouse(dog, dir.x * speed, dir.z * speed);
    if (!moved) {
      const around = pickYardTarget();
      dogTarget.set(around.x, 0, around.z);
    }
    dog.lookAt(dog.position.x + dir.x, dog.position.y, dog.position.z + dir.z);
    
    // Trot: opposite legs move together
    const walkCycle = Math.sin(time * (running ? 16 : 11));
    const amp = running ? 0.7 : 0.5;
    dog.userData.frontLeft.rotation.z = walkCycle * amp;
    dog.userData.backRight.rotation.z = walkCycle * amp;
    dog.userData.frontRight.rotation.z = -walkCycle * amp;
    dog.userData.backLeft.rotation.z = -walkCycle * amp;
    
    // Tail wag while walking
    dog.userData.tail.rotation.z = -0.5 + Math.sin(time * 12) * 0.3;
  } else {
    // Reached target - maybe pee on flowers?
    // Check if near flower beds
    const flowerBedPositions = [
      [-3.5, -4], [3.5, -4], [-8, 10], [8, 10], [-10, -8], [10, -8]
    ];
    
    let nearFlowers = false;
    for (const [fx, fz] of flowerBedPositions) {
      const distToFlower = Math.sqrt(
        Math.pow(dog.position.x - fx, 2) + Math.pow(dog.position.z - fz, 2)
      );
      if (distToFlower < 2) {
        nearFlowers = true;
        break;
      }
    }
    
    // 30% chance to pee if near flowers
    if (nearFlowers && Math.random() < 0.3) {
      dogIsPeeing = true;
      dogPeeTime = 2 + Math.random();
      return;
    }
    
    // Pick new random target and wait
    dogWaitTime = 2 + Math.random() * 3;
    
    const around = pickYardTarget();
    dogTarget.set(around.x, 0, around.z);
  }
}

function updateCat() {
  if (!cat) return;
  pushOutOfHouse(cat);
  
  // Cat just lies there, but meows if player comes close
  if (catMeowCooldown > 0) {
    catMeowCooldown -= 0.016;
  }
  
  const distToPlayer = cat.position.distanceTo(playerPos);
  if (distToPlayer < 2.5 && catMeowCooldown <= 0 && audioContext) {
    playCatMeow();
    catMeowCooldown = 3 + Math.random() * 3; // Don't meow too often
  }
}

function wifeSideSpawn() {
  // Come out of the right side wall, not the front door
  return {
    x: houseBounds.maxX - 0.2,
    z: (houseBounds.minZ + houseBounds.maxZ) * 0.5 + 0.7,
  };
}

function updateWife() {
  if (!wife) return;
  
  const time = clock.getElapsedTime();
  const spawn = wifeSideSpawn();
  const outX = houseBounds.maxX + 2.6;
  
  if (wifeState === 'inside') {
    wifeTimer += 0.016;
    if (wifeTimer >= wifeNextAppearance) {
      wifeState = 'coming_out';
      wife.visible = true;
      wife.position.set(spawn.x, 0, spawn.z);
      wife.rotation.y = -Math.PI / 2; // Face +X, out of the wall
      wifeTimer = 0;
    }
  }
  
  if (wifeState === 'coming_out') {
    wife.position.x += 0.03;
    wife.rotation.y = -Math.PI / 2;
    
    const walkCycle = Math.sin(time * 10) * 0.3;
    wife.userData.leftLeg.rotation.x = walkCycle;
    wife.userData.rightLeg.rotation.x = -walkCycle;
    
    if (wife.position.x >= outX) {
      wifeState = 'whistling';
      wifeTimer = 0;
      if (audioContext) playWifeWhistle();
      wife.userData.rightArm.rotation.z = -0.5;
      wife.userData.rightArm.rotation.x = -1.2;
    }
  }
  
  if (wifeState === 'whistling') {
    wifeTimer += 0.016;
    
    wife.userData.rightArm.rotation.x = -1.2 + Math.sin(time * 8) * 0.3;
    
    if (wifeTimer >= 3) {
      wifeState = 'going_in';
      wife.userData.rightArm.rotation.z = 0;
      wife.userData.rightArm.rotation.x = 0;
      wife.rotation.y = Math.PI / 2; // Face back into the wall
    }
  }
  
  if (wifeState === 'going_in') {
    wife.position.x -= 0.03;
    wife.rotation.y = Math.PI / 2;
    
    const walkCycle = Math.sin(time * 10) * 0.3;
    wife.userData.leftLeg.rotation.x = walkCycle;
    wife.userData.rightLeg.rotation.x = -walkCycle;
    
    if (wife.position.x <= spawn.x) {
      wifeState = 'inside';
      wife.visible = false;
      wifeTimer = 0;
      wifeNextAppearance = 15 + Math.random() * 30;
    }
  }
}

function checkMowing() {
  const dummy = new THREE.Object3D();
  let lightUpdated = false;
  let darkUpdated = false;
  
  grassBlades.forEach((grass) => {
    if (!grass.isTall) return;

    const dist = Math.sqrt(
      Math.pow(grass.x - mower.position.x, 2) +
      Math.pow(grass.z - mower.position.z, 2)
    );

    if (dist < MOW_RADIUS) {
      grass.isTall = false;
      
      // Use direct instance index to hide grass (no searching needed)
      const idx = grass.instanceIndex;
      
      // Hide both blades at this position
      for (let b = 0; b < 2; b++) {
        dummy.position.set(0, -10, 0); // Move far below ground
        dummy.scale.set(0, 0, 0); // Scale to zero
        dummy.updateMatrix();
        
        if (grass.stripeLight) {
          window.grassInstancedLight.setMatrixAt(idx * 2 + b, dummy.matrix);
          lightUpdated = true;
        } else {
          window.grassInstancedDark.setMatrixAt(idx * 2 + b, dummy.matrix);
          darkUpdated = true;
        }
      }
    }
  });
  
  // Update instance matrices if needed
  if (lightUpdated) window.grassInstancedLight.instanceMatrix.needsUpdate = true;
  if (darkUpdated) window.grassInstancedDark.instanceMatrix.needsUpdate = true;
}

function computePaintGoal() {
  const w = houseBounds.maxX - houseBounds.minX;
  const d = houseBounds.maxZ - houseBounds.minZ;
  const h = Math.min(3.6, Math.max(2.5, (houseBounds.maxY || 4) * 0.42));
  const area = 2 * (w + d) * h * 0.22;
  return Math.max(36, Math.min(55, Math.round(area / 0.55)));
}

function paintCellKey(point) {
  const s = PAINT_CELL;
  return `${Math.round(point.x / s)},${Math.round(point.y / s)},${Math.round(point.z / s)}`;
}

function clearPaintSplats() {
  paintSplats.forEach((splat) => scene.remove(splat));
  paintSplats = [];
  paintedCells = new Set();
  lastSplatPoint = null;
}

function addPaintSplat(point, normal) {
  const radius = 0.08 + Math.random() * 0.07;
  const geo = new THREE.CircleGeometry(radius, 10);
  const tint = 0.92 + Math.random() * 0.06;
  const mat = new THREE.MeshLambertMaterial({
    color: new THREE.Color(tint, tint * 0.99, tint * 0.96),
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  const splat = new THREE.Mesh(geo, mat);
  splat.position.copy(point).addScaledVector(normal, 0.02);
  splat.lookAt(point.clone().add(normal));
  splat.rotateZ(Math.random() * Math.PI);
  splat.scale.set(1.35 + Math.random() * 0.5, 0.65 + Math.random() * 0.35, 1);
  scene.add(splat);
  paintSplats.push(splat);
}

function applyPaintStroke() {
  if (!houseMeshes.length) return;
  const now = clock.getElapsedTime();
  if (now - lastPaintAt < 0.028) return;

  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
  const hits = raycaster.intersectObjects(houseMeshes, false);
  if (!hits.length) return;

  const hit = hits[0];
  if (hit.distance > PAINT_RANGE) return;

  const normal = new THREE.Vector3();
  if (hit.face) {
    normal.copy(hit.face.normal).transformDirection(hit.object.matrixWorld).normalize();
  } else {
    normal.copy(hit.normal || new THREE.Vector3(0, 0, 1));
  }
  // Skip roof and ground-facing hits — only paint walls
  if (normal.y > 0.62 || normal.y < -0.5) return;

  if (lastSplatPoint && hit.point.distanceTo(lastSplatPoint) < 0.07) return;

  const jitter = new THREE.Vector3(
    (Math.random() - 0.5) * 0.05,
    (Math.random() - 0.5) * 0.05,
    (Math.random() - 0.5) * 0.05
  );
  const point = hit.point.clone().add(jitter);
  lastSplatPoint = hit.point.clone();
  lastPaintAt = now;

  const key = paintCellKey(hit.point);
  const already = paintedCells.has(key);
  if (already && Math.random() < 0.65) return;

  addPaintSplat(point, normal);
  if (Math.random() < 0.55) {
    addPaintSplat(point.clone().add(new THREE.Vector3(
      (Math.random() - 0.5) * 0.08,
      (Math.random() - 0.5) * 0.08,
      (Math.random() - 0.5) * 0.08
    )), normal);
  }

  paintedCells.add(key);
  paintProgress = paintedCells.size;
  while (paintSplats.length > 380) {
    const old = paintSplats.shift();
    scene.remove(old);
  }

  if (Math.random() < 0.35) {
    playSound('paint', { volume: 0.28, rate: 0.85 + Math.random() * 0.35 });
  }
}

function updatePaintbrush() {
  const brush = camera.getObjectByName('paintbrush');
  if (!brush) return;
  const t = clock.getElapsedTime();
  if (isPainting) {
    const stroke = Math.sin(t * 16);
    brush.position.set(0.30 + stroke * 0.015, -0.30 + Math.abs(stroke) * 0.02, -0.52 + stroke * 0.045);
    brush.rotation.set(-0.32 + stroke * 0.14, 0.12, -0.22);
  } else {
    brush.position.lerp(new THREE.Vector3(0.32, -0.28, -0.55), 0.18);
    brush.rotation.x += (-0.22 - brush.rotation.x) * 0.18;
    brush.rotation.y += (0.12 - brush.rotation.y) * 0.18;
    brush.rotation.z += (-0.18 - brush.rotation.z) * 0.18;
  }
}

function updateHUD() {
  if (currentLevel === 1) {
    const mowed = grassBlades.filter(b => !b.isTall).length;
    const percent = Math.floor((mowed / totalGrass) * 100);
    document.getElementById('grass-percent').textContent = percent;
  } else if (currentLevel === 2) {
    const percent = Math.min(100, Math.floor((paintedCells.size / Math.max(1, totalPaintSections)) * 100));
    document.getElementById('grass-percent').textContent = percent;
  }
  document.getElementById('money').textContent = money;
}

function checkCompletion() {
  if (currentLevel === 1) {
    const mowed = grassBlades.filter(b => !b.isTall).length;
    const percent = (mowed / totalGrass) * 100;

    if (percent >= 100 && !completed) {
      completed = true;
      money += MOW_REWARD;
      document.getElementById('reward-amount').textContent = MOW_REWARD;
      document.getElementById('money').textContent = money;
      document.exitPointerLock();
      updateMowerSound(false);
      playSound('success', { volume: 0.5 });

      // Show completion modal with option to continue to level 2
      document.getElementById('completion-modal').classList.remove('hidden');
      document.getElementById('restart-btn').textContent = '🎨 Mal huset';
      document.getElementById('restart-btn').onclick = startLevel2;
    }
  } else if (currentLevel === 2) {
    const percent = (paintedCells.size / Math.max(1, totalPaintSections)) * 100;
    
    if (percent >= 100 && !completed) {
      completed = true;
      money += PAINT_REWARD;
      document.getElementById('reward-amount').textContent = PAINT_REWARD;
      document.getElementById('money').textContent = money;
      document.exitPointerLock();
      playSound('success', { volume: 0.5 });
      
      document.getElementById('completion-modal').classList.remove('hidden');
      document.querySelector('.modal-content h2').textContent = '🎨 Huset er malet!';
      document.getElementById('restart-btn').textContent = '🔄 Spil igen';
      document.getElementById('restart-btn').onclick = restartGame;
    }
  }
}

function startLevel2() {
  currentLevel = 2;
  completed = false;
  isPainting = false;
  
  // Hide grass (already mowed) - hide instanced meshes
  if (window.grassInstancedLight) window.grassInstancedLight.visible = false;
  if (window.grassInstancedDark) window.grassInstancedDark.visible = false;
  
  collectHouseMeshes();
  clearPaintSplats();
  totalPaintSections = computePaintGoal();
  
  // Hide mower, show paintbrush
  if (mower) mower.visible = false;
  if (fpMowerHandle) fpMowerHandle.visible = false;
  createFirstPersonPaintbrush();
  
  document.getElementById('grass-display').innerHTML = '🎨 Malet: <span id="grass-percent">0</span>%';
  document.getElementById('controls-hint').textContent = '🎨 Hold musen nede';
  const crosshair = document.getElementById('paint-crosshair');
  if (crosshair) crosshair.classList.remove('hidden');
  
  document.getElementById('completion-modal').classList.add('hidden');
  renderer.domElement.requestPointerLock();
}

function createFirstPersonPaintbrush() {
  const existing = camera.getObjectByName('paintbrush');
  if (existing) camera.remove(existing);
  if (fpMowerHandle) fpMowerHandle.visible = false;

  const brush = new THREE.Group();
  const tool = new THREE.Group();

  const wood = new THREE.MeshStandardMaterial({ color: 0x6B3E26, roughness: 0.72, metalness: 0 });
  const ferruleMat = new THREE.MeshStandardMaterial({ color: 0xC5CDD4, roughness: 0.28, metalness: 0.82 });
  const bristleMat = new THREE.MeshStandardMaterial({ color: 0xC4A882, roughness: 0.92, metalness: 0 });
  const paintMat = new THREE.MeshStandardMaterial({ color: 0xF7F4EE, roughness: 0.32, metalness: 0.04 });
  const skinMat = new THREE.MeshStandardMaterial({ color: 0xE0B090, roughness: 0.7, metalness: 0 });
  const shirtMat = new THREE.MeshStandardMaterial({ color: 0xB22222, roughness: 0.8, metalness: 0 });

  // Wooden handle
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.016, 0.40, 10), wood);
  handle.rotation.z = Math.PI / 2.05;
  tool.add(handle);

  // Metal ferrule
  const ferrule = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.016, 0.05, 10), ferruleMat);
  ferrule.rotation.z = Math.PI / 2.05;
  ferrule.position.set(-0.20, 0.01, 0);
  tool.add(ferrule);

  // Bristle bundle, slightly fanned
  const bristles = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.015, 0.095, 10), bristleMat);
  bristles.rotation.z = Math.PI / 2.05;
  bristles.position.set(-0.275, 0.018, 0);
  tool.add(bristles);

  const paint = new THREE.Mesh(new THREE.SphereGeometry(0.026, 8, 6), paintMat);
  paint.scale.set(1.35, 0.5, 1.15);
  paint.position.set(-0.33, 0.022, 0);
  tool.add(paint);

  tool.position.set(0.04, -0.02, 0);
  tool.rotation.set(0.2, 0.45, -1.2);
  brush.add(tool);

  const palm = new THREE.Mesh(new THREE.SphereGeometry(0.042, 8, 6), skinMat);
  palm.scale.set(1.2, 0.72, 0.95);
  palm.position.set(0.1, -0.015, 0.02);
  brush.add(palm);

  for (let i = 0; i < 4; i++) {
    const finger = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.011, 0.052, 6), skinMat);
    finger.rotation.z = 1.15;
    finger.position.set(0.035 + i * 0.011, -0.038, 0.012 - i * 0.007);
    brush.add(finger);
  }

  const thumb = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.012, 0.042, 6), skinMat);
  thumb.rotation.set(0.7, 0, 0.35);
  thumb.position.set(0.135, 0.0, 0.028);
  brush.add(thumb);

  const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.052, 0.16, 8), shirtMat);
  sleeve.rotation.set(0.45, 0, -0.5);
  sleeve.position.set(0.22, 0.05, 0.08);
  brush.add(sleeve);

  brush.position.set(0.32, -0.28, -0.55);
  brush.rotation.set(-0.22, 0.12, -0.18);
  brush.name = 'paintbrush';
  camera.add(brush);
}

function animate() {
  requestAnimationFrame(animate);
  update();
  renderer.render(scene, camera);
}

document.addEventListener('DOMContentLoaded', init);
