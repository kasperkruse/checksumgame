import * as THREE from 'three';

const WORLD_SIZE = 30;
const GRASS_DENSITY = 5;
const PLAYER_SPEED = 0.08;
const MOW_RADIUS = 0.8;
const MOW_REWARD = 100;

let scene, camera, renderer;
let player, mower;
let grassBlades = [];
let totalGrass = 0;
let money = 0;
let completed = false;
let clock = new THREE.Clock();

let playerPos = new THREE.Vector3(0, 0, 4);
let playerAngle = 0;
let targetAngle = 0;

let audioContext = null;
let mowerOscillator = null;
let mowerGain = null;
let ambientStarted = false;
let gameStarted = false;

const keys = { w: false, a: false, s: false, d: false, up: false, down: false, left: false, right: false };

const COLORS = {
  skyTop: 0x87CEEB,
  skyHorizon: 0xB0E0E6,
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
  playerShirt: 0xB22222,
  playerShirtDark: 0x8B0000,
  playerJeans: 0x4169E1,
  playerSkin: 0xDEB887,
  playerHair: 0x4A3728,
};

function init() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(COLORS.skyTop);
  
  createSky();
  
  camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 200);
  camera.position.set(15, 18, 15);
  camera.lookAt(0, 0, 0);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.4;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  document.getElementById('game-container').prepend(renderer.domElement);

  setupLighting();
  createGround();
  createHouse();
  createDeck();
  createPath();
  createPicketFence();
  createGrass();
  createPlayer();
  createMower();
  createTrees();
  createShrubs();
  createFlowerBeds();
  createMailbox();

  setupControls();
  window.addEventListener('resize', onWindowResize);
  document.getElementById('restart-btn').addEventListener('click', restartGame);

  document.addEventListener('click', () => {
    if (!gameStarted) {
      gameStarted = true;
      document.getElementById('click-prompt').style.display = 'none';
      if (!ambientStarted) {
        initAudio();
        ambientStarted = true;
      }
    }
  });

  document.addEventListener('keydown', () => {
    if (!gameStarted) {
      gameStarted = true;
      document.getElementById('click-prompt').style.display = 'none';
      if (!ambientStarted) {
        initAudio();
        ambientStarted = true;
      }
    }
  });

  animate();
}

function createSky() {
  const skyGeo = new THREE.SphereGeometry(100, 32, 32);
  const skyMat = new THREE.ShaderMaterial({
    uniforms: {
      topColor: { value: new THREE.Color(0x4A90D9) },
      bottomColor: { value: new THREE.Color(0x87CEEB) },
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

  createClouds();
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

function setupLighting() {
  const ambientLight = new THREE.AmbientLight(0xFFFFFF, 0.6);
  scene.add(ambientLight);

  const sunLight = new THREE.DirectionalLight(0xFFFAF0, 1.2);
  sunLight.position.set(20, 30, 10);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.width = 2048;
  sunLight.shadow.mapSize.height = 2048;
  sunLight.shadow.camera.near = 0.5;
  sunLight.shadow.camera.far = 80;
  sunLight.shadow.camera.left = -25;
  sunLight.shadow.camera.right = 25;
  sunLight.shadow.camera.top = 25;
  sunLight.shadow.camera.bottom = -25;
  sunLight.shadow.bias = -0.0001;
  sunLight.shadow.radius = 2;
  scene.add(sunLight);

  const fillLight = new THREE.DirectionalLight(0x87CEEB, 0.4);
  fillLight.position.set(-15, 10, -10);
  scene.add(fillLight);

  const backLight = new THREE.DirectionalLight(0xFFE4B5, 0.3);
  backLight.position.set(-10, 15, 20);
  scene.add(backLight);

  const hemi = new THREE.HemisphereLight(0x87CEEB, 0x7CBA5F, 0.4);
  scene.add(hemi);
}

function createGround() {
  const groundGeo = new THREE.PlaneGeometry(80, 80);
  const groundMat = new THREE.MeshLambertMaterial({ color: COLORS.ground });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.01;
  ground.receiveShadow = true;
  scene.add(ground);
}

function createHouse() {
  const house = new THREE.Group();

  const baseGeo = new THREE.BoxGeometry(9, 0.3, 7);
  const baseMat = new THREE.MeshLambertMaterial({ color: 0x808080 });
  const base = new THREE.Mesh(baseGeo, baseMat);
  base.position.y = 0.15;
  base.castShadow = true;
  base.receiveShadow = true;
  house.add(base);

  const wallGeo = new THREE.BoxGeometry(9, 4.5, 7);
  const wallMat = new THREE.MeshLambertMaterial({ color: COLORS.houseWall });
  const walls = new THREE.Mesh(wallGeo, wallMat);
  walls.position.y = 2.55;
  walls.castShadow = true;
  walls.receiveShadow = true;
  house.add(walls);

  const trimMat = new THREE.MeshLambertMaterial({ color: COLORS.houseTrim });
  
  const cornerTrimGeo = new THREE.BoxGeometry(0.2, 4.5, 0.2);
  [[-4.4, 2.55, 3.4], [4.4, 2.55, 3.4], [-4.4, 2.55, -3.4], [4.4, 2.55, -3.4]].forEach(([x, y, z]) => {
    const trim = new THREE.Mesh(cornerTrimGeo, trimMat);
    trim.position.set(x, y, z);
    house.add(trim);
  });

  const roofGeo = new THREE.ConeGeometry(7, 3.5, 4);
  const roofMat = new THREE.MeshLambertMaterial({ color: COLORS.houseRoof });
  const roof = new THREE.Mesh(roofGeo, roofMat);
  roof.position.y = 6.5;
  roof.rotation.y = Math.PI / 4;
  roof.castShadow = true;
  house.add(roof);

  const roofEdgeMat = new THREE.MeshLambertMaterial({ color: COLORS.houseTrim });
  const roofEdge = new THREE.Mesh(new THREE.BoxGeometry(9.5, 0.15, 7.5), roofEdgeMat);
  roofEdge.position.y = 4.85;
  house.add(roofEdge);

  const doorGeo = new THREE.BoxGeometry(1.3, 2.6, 0.15);
  const doorMat = new THREE.MeshLambertMaterial({ color: COLORS.houseDoor });
  const door = new THREE.Mesh(doorGeo, doorMat);
  door.position.set(0, 1.6, 3.52);
  house.add(door);

  const doorFrameGeo = new THREE.BoxGeometry(1.5, 2.8, 0.1);
  const doorFrame = new THREE.Mesh(doorFrameGeo, trimMat);
  doorFrame.position.set(0, 1.7, 3.5);
  house.add(doorFrame);

  const handleGeo = new THREE.SphereGeometry(0.06);
  const handleMat = new THREE.MeshLambertMaterial({ color: 0xD4AF37 });
  const handle = new THREE.Mesh(handleGeo, handleMat);
  handle.position.set(0.5, 1.5, 3.62);
  house.add(handle);

  const windowMat = new THREE.MeshBasicMaterial({ color: COLORS.houseWindow });
  const windowFrameMat = new THREE.MeshLambertMaterial({ color: COLORS.windowFrame });
  
  const windowPositions = [
    [-2.8, 2.8, 3.52], [2.8, 2.8, 3.52],
    [-2.8, 2.8, -3.52], [2.8, 2.8, -3.52],
    [4.52, 2.8, -1], [4.52, 2.8, 1],
    [-4.52, 2.8, -1], [-4.52, 2.8, 1]
  ];
  
  windowPositions.forEach(([x, y, z], i) => {
    const isSide = Math.abs(x) > 4 || Math.abs(z) < 3.5;
    const rotY = Math.abs(x) > 4 ? Math.PI / 2 : 0;
    
    const winGeo = new THREE.BoxGeometry(1.2, 1.5, 0.1);
    const win = new THREE.Mesh(winGeo, windowMat);
    win.position.set(x, y, z);
    win.rotation.y = rotY;
    house.add(win);

    const frameGeo = new THREE.BoxGeometry(1.4, 1.7, 0.08);
    const frame = new THREE.Mesh(frameGeo, windowFrameMat);
    frame.position.set(x, y, z > 0 && Math.abs(x) < 4 ? z - 0.02 : (z < 0 && Math.abs(x) < 4 ? z + 0.02 : z));
    frame.rotation.y = rotY;
    if (Math.abs(x) > 4) {
      frame.position.x = x > 0 ? x - 0.02 : x + 0.02;
    }
    house.add(frame);

    const divH = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.05, 0.12), windowFrameMat);
    divH.position.set(x, y, z);
    divH.rotation.y = rotY;
    house.add(divH);
    
    const divV = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.5, 0.12), windowFrameMat);
    divV.position.set(x, y, z);
    divV.rotation.y = rotY;
    house.add(divV);
  });

  const stepsGeo = new THREE.BoxGeometry(2, 0.15, 0.6);
  const stepsMat = new THREE.MeshLambertMaterial({ color: 0x808080 });
  for (let i = 0; i < 2; i++) {
    const step = new THREE.Mesh(stepsGeo, stepsMat);
    step.position.set(0, 0.08 + i * 0.15, 4 + i * 0.6);
    step.castShadow = true;
    step.receiveShadow = true;
    house.add(step);
  }

  house.position.set(0, 0, -6);
  scene.add(house);
}

function createDeck() {
  const deck = new THREE.Group();

  const deckMat = new THREE.MeshLambertMaterial({ color: COLORS.deck });
  const deckDarkMat = new THREE.MeshLambertMaterial({ color: COLORS.deckDark });

  const baseGeo = new THREE.BoxGeometry(6, 0.2, 5);
  const base = new THREE.Mesh(baseGeo, deckMat);
  base.position.y = 0.1;
  base.castShadow = true;
  base.receiveShadow = true;
  deck.add(base);

  for (let x = -2.5; x <= 2.5; x += 0.25) {
    const plankGeo = new THREE.BoxGeometry(0.2, 0.05, 5);
    const isAlternate = Math.floor((x + 2.5) / 0.5) % 2 === 0;
    const plank = new THREE.Mesh(plankGeo, isAlternate ? deckMat : deckDarkMat);
    plank.position.set(x, 0.22, 0);
    deck.add(plank);
  }

  const umbrellaPole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.05, 0.05, 2.5, 8),
    new THREE.MeshLambertMaterial({ color: 0x8B7355 })
  );
  umbrellaPole.position.set(-1.5, 1.25, 0);
  umbrellaPole.castShadow = true;
  deck.add(umbrellaPole);

  const umbrellaTop = new THREE.Mesh(
    new THREE.ConeGeometry(1.5, 0.6, 8),
    new THREE.MeshLambertMaterial({ color: COLORS.umbrella })
  );
  umbrellaTop.position.set(-1.5, 2.6, 0);
  umbrellaTop.castShadow = true;
  deck.add(umbrellaTop);

  const tableGeo = new THREE.CylinderGeometry(0.8, 0.8, 0.08, 16);
  const tableMat = new THREE.MeshLambertMaterial({ color: COLORS.furniture });
  const table = new THREE.Mesh(tableGeo, tableMat);
  table.position.set(-1.5, 0.74, 0);
  table.castShadow = true;
  deck.add(table);

  const tableLeg = new THREE.Mesh(
    new THREE.CylinderGeometry(0.08, 0.08, 0.5, 8),
    tableMat
  );
  tableLeg.position.set(-1.5, 0.45, 0);
  deck.add(tableLeg);

  const chairPositions = [
    { x: -2.5, z: 0, rot: Math.PI / 2 },
    { x: -0.5, z: 0, rot: -Math.PI / 2 },
    { x: -1.5, z: 1, rot: 0 },
    { x: -1.5, z: -1, rot: Math.PI }
  ];

  chairPositions.forEach(pos => {
    const chair = createChair();
    chair.position.set(pos.x, 0.2, pos.z);
    chair.rotation.y = pos.rot;
    deck.add(chair);
  });

  const grillMat = new THREE.MeshLambertMaterial({ color: 0x2a2a2a });
  const grill = new THREE.Group();
  
  const grillBody = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.5, 0.4), grillMat);
  grillBody.position.y = 0.7;
  grill.add(grillBody);
  
  const grillLid = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.6, 8, 1, false, 0, Math.PI), grillMat);
  grillLid.rotation.z = Math.PI / 2;
  grillLid.rotation.y = Math.PI / 2;
  grillLid.position.set(0, 1.0, 0);
  grill.add(grillLid);
  
  const legGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.45, 6);
  [[-0.25, 0.22, 0.15], [0.25, 0.22, 0.15], [-0.25, 0.22, -0.15], [0.25, 0.22, -0.15]].forEach(([x, y, z]) => {
    const leg = new THREE.Mesh(legGeo, grillMat);
    leg.position.set(x, y, z);
    grill.add(leg);
  });
  
  grill.position.set(2.2, 0.2, 1.5);
  deck.add(grill);

  deck.position.set(6, 0, -4);
  scene.add(deck);
}

function createChair() {
  const chair = new THREE.Group();
  const chairMat = new THREE.MeshLambertMaterial({ color: COLORS.furniture });
  
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.08, 0.5), chairMat);
  seat.position.y = 0.35;
  chair.add(seat);
  
  const back = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.6, 0.08), chairMat);
  back.position.set(0, 0.65, -0.21);
  chair.add(back);
  
  const legGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.35, 6);
  [[-0.2, 0.17, 0.2], [0.2, 0.17, 0.2], [-0.2, 0.17, -0.2], [0.2, 0.17, -0.2]].forEach(([x, y, z]) => {
    const leg = new THREE.Mesh(legGeo, chairMat);
    leg.position.set(x, y, z);
    chair.add(leg);
  });
  
  return chair;
}

function createPath() {
  const pathGroup = new THREE.Group();
  
  const pathMat = new THREE.MeshLambertMaterial({ color: COLORS.path });
  const stoneMat = new THREE.MeshLambertMaterial({ color: COLORS.pathStone });
  
  const mainPath = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 10), pathMat);
  mainPath.rotation.x = -Math.PI / 2;
  mainPath.position.set(0, 0.02, 3);
  mainPath.receiveShadow = true;
  pathGroup.add(mainPath);

  for (let z = -2; z < 8; z += 0.8) {
    for (let x = -0.8; x < 0.8; x += 0.6) {
      const stone = new THREE.Mesh(
        new THREE.BoxGeometry(0.45 + Math.random() * 0.1, 0.03, 0.35 + Math.random() * 0.1),
        stoneMat
      );
      stone.position.set(x + (Math.random() - 0.5) * 0.1, 0.025, z + (Math.random() - 0.5) * 0.1);
      stone.rotation.y = Math.random() * 0.3;
      stone.receiveShadow = true;
      pathGroup.add(stone);
    }
  }

  const sidePathGeo = new THREE.PlaneGeometry(3, 1.5);
  const sidePath = new THREE.Mesh(sidePathGeo, pathMat);
  sidePath.rotation.x = -Math.PI / 2;
  sidePath.position.set(4.5, 0.02, -3);
  sidePath.receiveShadow = true;
  pathGroup.add(sidePath);

  scene.add(pathGroup);
}

function createPicketFence() {
  const fenceMat = new THREE.MeshLambertMaterial({ color: COLORS.fence });
  
  const createPicket = (x, z, rotY = 0) => {
    const picket = new THREE.Group();
    
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.9, 0.03), fenceMat);
    post.position.y = 0.45;
    post.castShadow = true;
    picket.add(post);
    
    const point = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.15, 4), fenceMat);
    point.position.y = 0.97;
    point.rotation.y = Math.PI / 4;
    picket.add(point);
    
    picket.position.set(x, 0, z);
    picket.rotation.y = rotY;
    return picket;
  };

  const fenceSize = 9;
  const spacing = 0.12;

  for (let x = -fenceSize; x <= fenceSize; x += spacing) {
    if (x > -1.3 && x < 1.3) continue;
    scene.add(createPicket(x, fenceSize));
  }

  for (let z = -fenceSize; z <= fenceSize; z += spacing) {
    if (z > 4.5 && z <= fenceSize) continue;
    scene.add(createPicket(fenceSize, z, 0));
    if (z > -1.5 && z < 1.5) continue;
    scene.add(createPicket(-fenceSize, z, 0));
  }

  const railGeo = new THREE.BoxGeometry(18, 0.06, 0.03);
  [0.25, 0.65].forEach(y => {
    const rail = new THREE.Mesh(railGeo, fenceMat);
    rail.position.set(0, y, fenceSize);
    scene.add(rail);
  });

  const sideRailGeo = new THREE.BoxGeometry(0.03, 0.06, 18);
  [0.25, 0.65].forEach(y => {
    const railR = new THREE.Mesh(sideRailGeo, fenceMat);
    railR.position.set(fenceSize, y, 0);
    scene.add(railR);
    
    const railL = new THREE.Mesh(sideRailGeo, fenceMat);
    railL.position.set(-fenceSize, y, 0);
    scene.add(railL);
  });

  const postMat = new THREE.MeshLambertMaterial({ color: COLORS.fencePost });
  const postGeo = new THREE.BoxGeometry(0.12, 1.1, 0.12);
  [[fenceSize, fenceSize], [fenceSize, -fenceSize], [-fenceSize, fenceSize], [-fenceSize, -fenceSize],
   [1.3, fenceSize], [-1.3, fenceSize], [-fenceSize, 1.5], [-fenceSize, -1.5]].forEach(([x, z]) => {
    const post = new THREE.Mesh(postGeo, postMat);
    post.position.set(x, 0.55, z);
    post.castShadow = true;
    scene.add(post);
    
    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.08, 0.15), postMat);
    cap.position.set(x, 1.14, z);
    scene.add(cap);
  });
}

function createGrass() {
  grassBlades = [];
  totalGrass = 0;

  const fenceInner = 8.5;
  
  for (let x = -fenceInner; x < fenceInner; x += 1 / GRASS_DENSITY) {
    for (let z = -fenceInner; z < fenceInner; z += 1 / GRASS_DENSITY) {
      if (isInHouseArea(x, z) || isOnPath(x, z) || isOnDeck(x, z)) continue;

      const stripeIndex = Math.floor((x + fenceInner) * 2);
      const isLightStripe = stripeIndex % 2 === 0;
      
      const blade = new THREE.Group();
      blade.userData.isTall = true;
      blade.userData.stripeLight = isLightStripe;
      blade.userData.swayOffset = Math.random() * Math.PI * 2;
      blade.userData.gridX = Math.floor((x + fenceInner) * 2);
      blade.userData.gridZ = Math.floor((z + fenceInner) * 2);
      
      const bladeCount = 3 + Math.floor(Math.random() * 2);
      for (let i = 0; i < bladeCount; i++) {
        const bladeGeo = new THREE.ConeGeometry(0.02, 0.25 + Math.random() * 0.15, 4);
        const bladeMat = new THREE.MeshLambertMaterial({ 
          color: isLightStripe ? COLORS.grassTall : darkenColor(COLORS.grassTall, 0.9)
        });
        const singleBlade = new THREE.Mesh(bladeGeo, bladeMat);
        singleBlade.position.set(
          (Math.random() - 0.5) * 0.08,
          0.12 + Math.random() * 0.05,
          (Math.random() - 0.5) * 0.08
        );
        singleBlade.rotation.x = (Math.random() - 0.5) * 0.3;
        singleBlade.rotation.z = (Math.random() - 0.5) * 0.3;
        blade.add(singleBlade);
      }
      
      blade.position.set(
        x + (Math.random() - 0.5) * 0.05,
        0,
        z + (Math.random() - 0.5) * 0.05
      );
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
  return x > -5.5 && x < 5.5 && z > -10 && z < -2;
}

function isOnPath(x, z) {
  if (Math.abs(x) < 1.3 && z > -2 && z < 9) return true;
  if (x > 3 && x < 6 && z > -4.5 && z < -2) return true;
  return false;
}

function isOnDeck(x, z) {
  return x > 2.5 && x < 9.5 && z > -7 && z < -1;
}

function createPlayer() {
  player = new THREE.Group();

  const headGeo = new THREE.SphereGeometry(0.18, 12, 10);
  const headMat = new THREE.MeshLambertMaterial({ color: COLORS.playerSkin });
  const head = new THREE.Mesh(headGeo, headMat);
  head.position.y = 1.55;
  head.scale.set(1, 1.1, 0.95);
  head.castShadow = true;
  player.add(head);

  const hairGeo = new THREE.SphereGeometry(0.19, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.5);
  const hairMat = new THREE.MeshLambertMaterial({ color: COLORS.playerHair });
  const hair = new THREE.Mesh(hairGeo, hairMat);
  hair.position.y = 1.58;
  player.add(hair);

  const beardGeo = new THREE.SphereGeometry(0.12, 8, 6, 0, Math.PI * 2, Math.PI * 0.4, Math.PI * 0.4);
  const beard = new THREE.Mesh(beardGeo, hairMat);
  beard.position.set(0, 1.42, 0.08);
  beard.scale.set(1.2, 1, 0.8);
  player.add(beard);

  const torsoGeo = new THREE.CylinderGeometry(0.2, 0.22, 0.5, 12);
  const torsoMat = new THREE.MeshLambertMaterial({ color: COLORS.playerShirt });
  const torso = new THREE.Mesh(torsoGeo, torsoMat);
  torso.position.y = 1.15;
  torso.castShadow = true;
  player.add(torso);

  const plaidMat = new THREE.MeshLambertMaterial({ color: COLORS.playerShirtDark });
  for (let i = 0; i < 4; i++) {
    const stripe = new THREE.Mesh(
      new THREE.BoxGeometry(0.42, 0.03, 0.01),
      plaidMat
    );
    stripe.position.set(0, 1.0 + i * 0.1, 0.21);
    player.add(stripe);
  }

  const armGeo = new THREE.CylinderGeometry(0.05, 0.055, 0.4, 8);
  const armMat = new THREE.MeshLambertMaterial({ color: COLORS.playerShirt });
  
  const leftArm = new THREE.Group();
  leftArm.position.set(-0.26, 1.2, 0);
  const leftArmMesh = new THREE.Mesh(armGeo, armMat);
  leftArmMesh.castShadow = true;
  leftArm.add(leftArmMesh);
  const leftHand = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), headMat);
  leftHand.position.y = -0.22;
  leftArm.add(leftHand);
  player.add(leftArm);
  player.userData.leftArm = leftArm;

  const rightArm = new THREE.Group();
  rightArm.position.set(0.26, 1.2, 0);
  const rightArmMesh = new THREE.Mesh(armGeo, armMat);
  rightArmMesh.castShadow = true;
  rightArm.add(rightArmMesh);
  const rightHand = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), headMat);
  rightHand.position.y = -0.22;
  rightArm.add(rightHand);
  player.add(rightArm);
  player.userData.rightArm = rightArm;

  const legGeo = new THREE.CylinderGeometry(0.07, 0.075, 0.45, 8);
  const legMat = new THREE.MeshLambertMaterial({ color: COLORS.playerJeans });
  const shoeMat = new THREE.MeshLambertMaterial({ color: 0x4A3728 });

  const leftLeg = new THREE.Group();
  leftLeg.position.set(-0.1, 0.65, 0);
  const leftLegMesh = new THREE.Mesh(legGeo, legMat);
  leftLegMesh.castShadow = true;
  leftLeg.add(leftLegMesh);
  const leftShoe = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.06, 0.18), shoeMat);
  leftShoe.position.set(0, -0.24, 0.03);
  leftLeg.add(leftShoe);
  player.add(leftLeg);
  player.userData.leftLeg = leftLeg;

  const rightLeg = new THREE.Group();
  rightLeg.position.set(0.1, 0.65, 0);
  const rightLegMesh = new THREE.Mesh(legGeo, legMat);
  rightLegMesh.castShadow = true;
  rightLeg.add(rightLegMesh);
  const rightShoe = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.06, 0.18), shoeMat);
  rightShoe.position.set(0, -0.24, 0.03);
  rightLeg.add(rightShoe);
  player.add(rightLeg);
  player.userData.rightLeg = rightLeg;

  player.position.copy(playerPos);
  scene.add(player);
}

function createMower() {
  mower = new THREE.Group();

  const deckGeo = new THREE.BoxGeometry(0.55, 0.1, 0.7);
  const deckMat = new THREE.MeshLambertMaterial({ color: COLORS.mowerBody });
  const deck = new THREE.Mesh(deckGeo, deckMat);
  deck.position.y = 0.06;
  deck.castShadow = true;
  mower.add(deck);

  const bodyGeo = new THREE.BoxGeometry(0.45, 0.25, 0.55);
  const bodyMat = new THREE.MeshLambertMaterial({ color: COLORS.mower });
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.position.y = 0.23;
  body.castShadow = true;
  mower.add(body);

  const topGeo = new THREE.BoxGeometry(0.35, 0.1, 0.4);
  const top = new THREE.Mesh(topGeo, bodyMat);
  top.position.y = 0.4;
  top.castShadow = true;
  mower.add(top);

  const engineGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.12, 8);
  const engineMat = new THREE.MeshLambertMaterial({ color: 0x111111 });
  const engine = new THREE.Mesh(engineGeo, engineMat);
  engine.position.set(0, 0.5, -0.08);
  mower.add(engine);

  const logoGeo = new THREE.BoxGeometry(0.2, 0.08, 0.01);
  const logoMat = new THREE.MeshBasicMaterial({ color: 0xFFFFFF });
  const logo = new THREE.Mesh(logoGeo, logoMat);
  logo.position.set(0, 0.28, 0.28);
  mower.add(logo);

  const wheelGeo = new THREE.CylinderGeometry(0.09, 0.09, 0.04, 12);
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x1a1a1a });
  const hubMat = new THREE.MeshLambertMaterial({ color: 0x555555 });
  
  [[-0.26, -0.3], [0.26, -0.3], [-0.26, 0.3], [0.26, 0.3]].forEach(([x, z]) => {
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(x, 0.09, z);
    wheel.castShadow = true;
    mower.add(wheel);
    
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.05, 8), hubMat);
    hub.rotation.z = Math.PI / 2;
    hub.position.set(x, 0.09, z);
    mower.add(hub);
  });

  const handleMat = new THREE.MeshLambertMaterial({ color: 0x2a2a2a });
  
  const leftHandleGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.75, 8);
  const leftHandle = new THREE.Mesh(leftHandleGeo, handleMat);
  leftHandle.rotation.x = 0.45;
  leftHandle.position.set(-0.18, 0.55, -0.55);
  mower.add(leftHandle);

  const rightHandle = new THREE.Mesh(leftHandleGeo, handleMat);
  rightHandle.rotation.x = 0.45;
  rightHandle.position.set(0.18, 0.55, -0.55);
  mower.add(rightHandle);

  const gripGeo = new THREE.CylinderGeometry(0.025, 0.025, 0.42, 8);
  const gripMat = new THREE.MeshLambertMaterial({ color: 0x111111 });
  const grip = new THREE.Mesh(gripGeo, gripMat);
  grip.rotation.z = Math.PI / 2;
  grip.position.set(0, 0.82, -0.82);
  mower.add(grip);

  mower.position.set(playerPos.x, 0, playerPos.z + 0.7);
  scene.add(mower);
}

function createTrees() {
  const createTree = (x, z, scale = 1, type = 'round') => {
    const tree = new THREE.Group();

    const trunkGeo = new THREE.CylinderGeometry(0.15 * scale, 0.2 * scale, 1.8 * scale, 8);
    const trunkMat = new THREE.MeshLambertMaterial({ color: COLORS.trunk });
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.y = 0.9 * scale;
    trunk.castShadow = true;
    tree.add(trunk);

    const foliageMat = new THREE.MeshLambertMaterial({ color: COLORS.tree });
    const foliageDarkMat = new THREE.MeshLambertMaterial({ color: COLORS.treeDark });
    
    if (type === 'round') {
      const foliage1 = new THREE.Mesh(new THREE.SphereGeometry(1.2 * scale, 10, 8), foliageMat);
      foliage1.position.y = 2.4 * scale;
      foliage1.castShadow = true;
      tree.add(foliage1);

      const foliage2 = new THREE.Mesh(new THREE.SphereGeometry(0.9 * scale, 10, 8), foliageDarkMat);
      foliage2.position.set(0.6 * scale, 2.8 * scale, 0.3 * scale);
      foliage2.castShadow = true;
      tree.add(foliage2);

      const foliage3 = new THREE.Mesh(new THREE.SphereGeometry(0.7 * scale, 10, 8), foliageMat);
      foliage3.position.set(-0.4 * scale, 3.0 * scale, -0.2 * scale);
      foliage3.castShadow = true;
      tree.add(foliage3);
    }

    tree.position.set(x, 0, z);
    return tree;
  };

  const treePositions = [
    [-12, -7, 1.1, 'round'],
    [-13, 3, 1.2, 'round'],
    [-11, 7, 0.9, 'round'],
    [12, -6, 1.0, 'round'],
    [13, 5, 1.15, 'round'],
    [-14, -12, 1.0, 'round'],
    [14, -10, 1.1, 'round'],
  ];

  treePositions.forEach(([x, z, scale, type]) => {
    scene.add(createTree(x, z, scale, type));
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
    [-4, -8.5, 0.8], [4, -8.5, 0.8],
    [-4.5, -7, 1.0], [4.5, -7, 1.0],
    [8.5, -3, 0.9], [8.5, 0, 0.9], [8.5, 3, 0.9],
    [-8.5, -3, 0.9], [-8.5, 0, 0.9], [-8.5, 3, 0.9],
    [8.5, 7, 1.0], [-8.5, 7, 1.0],
  ];

  shrubPositions.forEach(([x, z, scale]) => {
    scene.add(createShrub(x, z, scale));
  });
}

function createFlowerBeds() {
  const createFlowerBed = (x, z, width, depth, rotation = 0) => {
    const bed = new THREE.Group();
    
    const borderMat = new THREE.MeshLambertMaterial({ color: 0x6B4423 });
    const soilMat = new THREE.MeshLambertMaterial({ color: 0x3D2817 });
    
    const border = new THREE.Mesh(new THREE.BoxGeometry(width + 0.1, 0.12, depth + 0.1), borderMat);
    border.position.y = 0.06;
    bed.add(border);
    
    const soil = new THREE.Mesh(new THREE.BoxGeometry(width, 0.08, depth), soilMat);
    soil.position.y = 0.1;
    bed.add(soil);

    const flowerColors = [COLORS.flowerPink, COLORS.flowerYellow, COLORS.flowerWhite, COLORS.flowerPurple];
    const stemMat = new THREE.MeshLambertMaterial({ color: 0x228B22 });
    
    const flowerCount = Math.floor(width * depth * 8);
    for (let i = 0; i < flowerCount; i++) {
      const stemGeo = new THREE.CylinderGeometry(0.01, 0.015, 0.15 + Math.random() * 0.1, 4);
      const stem = new THREE.Mesh(stemGeo, stemMat);
      stem.position.set(
        (Math.random() - 0.5) * (width - 0.15),
        0.2,
        (Math.random() - 0.5) * (depth - 0.15)
      );
      stem.rotation.x = (Math.random() - 0.5) * 0.2;
      stem.rotation.z = (Math.random() - 0.5) * 0.2;
      bed.add(stem);

      const flowerColor = flowerColors[Math.floor(Math.random() * flowerColors.length)];
      const petalMat = new THREE.MeshLambertMaterial({ color: flowerColor });
      const petals = new THREE.Mesh(new THREE.SphereGeometry(0.04 + Math.random() * 0.02, 6, 4), petalMat);
      petals.position.copy(stem.position);
      petals.position.y += 0.1;
      bed.add(petals);

      if (Math.random() > 0.5) {
        const leafMat = new THREE.MeshLambertMaterial({ color: 0x32CD32 });
        const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.025, 4, 3), leafMat);
        leaf.scale.set(1, 0.5, 2);
        leaf.position.copy(stem.position);
        leaf.position.y -= 0.05;
        leaf.position.x += 0.03;
        leaf.rotation.z = Math.PI / 4;
        bed.add(leaf);
      }
    }
    
    bed.position.set(x, 0, z);
    bed.rotation.y = rotation;
    return bed;
  };

  scene.add(createFlowerBed(-4, -9.3, 2, 0.8));
  scene.add(createFlowerBed(4, -9.3, 2, 0.8));
  scene.add(createFlowerBed(-5.5, -5.5, 0.8, 2.5, Math.PI / 2));
  scene.add(createFlowerBed(5.5, -5.5, 0.8, 2.5, Math.PI / 2));
  scene.add(createFlowerBed(6.5, 8, 3, 0.8));
  scene.add(createFlowerBed(-6.5, 8, 3, 0.8));
}

function createMailbox() {
  const mailbox = new THREE.Group();

  const postMat = new THREE.MeshLambertMaterial({ color: 0xFAFAFA });
  const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.1, 0.12), postMat);
  post.position.y = 0.55;
  post.castShadow = true;
  mailbox.add(post);

  const boxMat = new THREE.MeshLambertMaterial({ color: 0x1a1a1a });
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.2, 0.4), boxMat);
  box.position.y = 1.2;
  box.castShadow = true;
  mailbox.add(box);

  const lidGeo = new THREE.CylinderGeometry(0.125, 0.125, 0.25, 8, 1, false, 0, Math.PI);
  const lid = new THREE.Mesh(lidGeo, boxMat);
  lid.rotation.z = Math.PI / 2;
  lid.rotation.y = Math.PI / 2;
  lid.position.set(0, 1.3, 0.08);
  mailbox.add(lid);

  const flagMat = new THREE.MeshLambertMaterial({ color: 0xFF0000 });
  const flag = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.12, 0.06), flagMat);
  flag.position.set(0.14, 1.25, 0.1);
  mailbox.add(flag);

  mailbox.position.set(1.5, 0, 8.2);
  scene.add(mailbox);
}

function initAudio() {
  audioContext = new (window.AudioContext || window.webkitAudioContext)();
  createAmbientSounds();
  createMowerSound();
}

function createAmbientSounds() {
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
    gain.gain.linearRampToValueAtTime(0.02, audioContext.currentTime + 0.05);
    gain.gain.linearRampToValueAtTime(0, audioContext.currentTime + 0.15);
    
    osc.connect(gain);
    gain.connect(audioContext.destination);
    
    osc.start(audioContext.currentTime);
    osc.stop(audioContext.currentTime + 0.2);

    setTimeout(playBird, 4000 + Math.random() * 8000);
  };

  setTimeout(playBird, 2000);
}

function createMowerSound() {
  mowerGain = audioContext.createGain();
  mowerGain.gain.value = 0;
  
  const mowerFilter = audioContext.createBiquadFilter();
  mowerFilter.type = 'lowpass';
  mowerFilter.frequency.value = 500;
  mowerFilter.connect(mowerGain);
  mowerGain.connect(audioContext.destination);

  mowerOscillator = audioContext.createOscillator();
  mowerOscillator.type = 'sawtooth';
  mowerOscillator.frequency.value = 50;
  mowerOscillator.connect(mowerFilter);
  mowerOscillator.start();

  const mowerOsc2 = audioContext.createOscillator();
  mowerOsc2.type = 'square';
  mowerOsc2.frequency.value = 25;
  const gain2 = audioContext.createGain();
  gain2.gain.value = 0.3;
  mowerOsc2.connect(gain2);
  gain2.connect(mowerFilter);
  mowerOsc2.start();

  const lfo = audioContext.createOscillator();
  lfo.frequency.value = 8;
  const lfoGain = audioContext.createGain();
  lfoGain.gain.value = 3;
  lfo.connect(lfoGain);
  lfoGain.connect(mowerOscillator.frequency);
  lfo.start();
}

function updateMowerSound(isMoving) {
  if (!mowerGain) return;
  const targetVolume = isMoving ? 0.04 : 0;
  mowerGain.gain.linearRampToValueAtTime(targetVolume, audioContext.currentTime + 0.1);
}

function setupControls() {
  window.addEventListener('keydown', (e) => {
    if (e.code === 'KeyW' || e.code === 'ArrowUp') { keys.w = true; keys.up = true; }
    if (e.code === 'KeyA' || e.code === 'ArrowLeft') { keys.a = true; keys.left = true; }
    if (e.code === 'KeyS' || e.code === 'ArrowDown') { keys.s = true; keys.down = true; }
    if (e.code === 'KeyD' || e.code === 'ArrowRight') { keys.d = true; keys.right = true; }
  });

  window.addEventListener('keyup', (e) => {
    if (e.code === 'KeyW' || e.code === 'ArrowUp') { keys.w = false; keys.up = false; }
    if (e.code === 'KeyA' || e.code === 'ArrowLeft') { keys.a = false; keys.left = false; }
    if (e.code === 'KeyS' || e.code === 'ArrowDown') { keys.s = false; keys.down = false; }
    if (e.code === 'KeyD' || e.code === 'ArrowRight') { keys.d = false; keys.right = false; }
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
  playerPos.set(0, 0, 4);
  playerAngle = 0;
  targetAngle = 0;
  completed = false;
  document.getElementById('completion-modal').classList.add('hidden');
  updateHUD();
}

function update() {
  if (completed || !gameStarted) return;

  const moveDir = new THREE.Vector3();
  
  if (keys.w || keys.up) moveDir.z -= 1;
  if (keys.s || keys.down) moveDir.z += 1;
  if (keys.a || keys.left) moveDir.x -= 1;
  if (keys.d || keys.right) moveDir.x += 1;

  const isMoving = moveDir.length() > 0;
  
  if (isMoving) {
    moveDir.normalize();
    
    targetAngle = Math.atan2(moveDir.x, moveDir.z);
    
    let angleDiff = targetAngle - playerAngle;
    while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
    while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
    playerAngle += angleDiff * 0.15;
    
    const rotatedDir = new THREE.Vector3(
      Math.sin(playerAngle),
      0,
      Math.cos(playerAngle)
    );
    
    const newX = playerPos.x + rotatedDir.x * PLAYER_SPEED;
    const newZ = playerPos.z + rotatedDir.z * PLAYER_SPEED;

    if (!isInHouseArea(newX, newZ) && !isOnDeck(newX, newZ)) {
      playerPos.x = Math.max(-8.3, Math.min(8.3, newX));
      playerPos.z = Math.max(-8.3, Math.min(8.3, newZ));
    }

    const time = clock.getElapsedTime();
    const walkCycle = Math.sin(time * 12) * 0.35;
    player.userData.leftLeg.rotation.x = walkCycle;
    player.userData.rightLeg.rotation.x = -walkCycle;
    player.userData.leftArm.rotation.x = -walkCycle * 0.5;
    player.userData.rightArm.rotation.x = walkCycle * 0.5;
  } else {
    player.userData.leftLeg.rotation.x *= 0.9;
    player.userData.rightLeg.rotation.x *= 0.9;
    player.userData.leftArm.rotation.x *= 0.9;
    player.userData.rightArm.rotation.x *= 0.9;
  }
  
  updateMowerSound(isMoving);

  player.position.set(playerPos.x, 0, playerPos.z);
  player.rotation.y = playerAngle;

  const mowerOffset = new THREE.Vector3(0, 0, 0.7);
  mowerOffset.applyAxisAngle(new THREE.Vector3(0, 1, 0), playerAngle);
  mower.position.set(
    playerPos.x + mowerOffset.x,
    0,
    playerPos.z + mowerOffset.z
  );
  mower.rotation.y = playerAngle;

  const targetCamX = playerPos.x + 12;
  const targetCamZ = playerPos.z + 12;
  camera.position.x += (targetCamX - camera.position.x) * 0.05;
  camera.position.z += (targetCamZ - camera.position.z) * 0.05;
  camera.lookAt(playerPos.x, 0, playerPos.z);

  const time = clock.getElapsedTime();
  grassBlades.forEach(blade => {
    if (blade.userData.isTall) {
      const sway = Math.sin(time * 2 + blade.userData.swayOffset) * 0.05;
      blade.rotation.x = sway;
      blade.rotation.z = Math.cos(time * 1.5 + blade.userData.swayOffset) * 0.03;
    }
  });

  checkMowing();
  updateHUD();
  checkCompletion();
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
      
      const mowDirection = Math.floor(playerAngle / (Math.PI / 4)) % 2 === 0;
      const stripeColor = mowDirection ? COLORS.grassStripeLight : COLORS.grassStripeDark;
      
      blade.children.forEach(child => {
        if (child.material) {
          child.material.color.setHex(stripeColor);
        }
        child.scale.y = 0.15;
        child.position.y = 0.02;
      });
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
