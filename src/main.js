const TILE_SIZE = 32;
const GRID_WIDTH = 20;
const GRID_HEIGHT = 15;
const CANVAS_WIDTH = GRID_WIDTH * TILE_SIZE;
const CANVAS_HEIGHT = GRID_HEIGHT * TILE_SIZE;

const PLAYER_SPEED = 4;
const MOW_REWARD = 100;

const TILE = {
  GRASS_TALL: 0,
  GRASS_CUT: 1,
  HOUSE: 2,
  PATH: 3,
};

const COLORS = {
  GRASS_TALL: ['#228B22', '#2E8B2E', '#1E7B1E'],
  GRASS_CUT: ['#90EE90', '#98FB98', '#8FBC8F'],
  HOUSE_WALL: '#D2691E',
  HOUSE_ROOF: '#8B4513',
  HOUSE_DOOR: '#654321',
  HOUSE_WINDOW: '#87CEEB',
  PATH: '#C4A76C',
  PLAYER_BODY: '#4169E1',
  PLAYER_SKIN: '#FFDAB9',
  PLAYER_HAIR: '#4A4A4A',
  MOWER: '#FF6B6B',
};

let canvas, ctx;
let gameState = {
  player: { x: 2 * TILE_SIZE, y: 7 * TILE_SIZE },
  money: 0,
  totalGrass: 0,
  mowedGrass: 0,
  tiles: [],
  completed: false,
  particles: [],
  mowerSound: null,
};

let keys = {
  up: false,
  down: false,
  left: false,
  right: false,
};

function createLevel() {
  const tiles = [];
  gameState.totalGrass = 0;
  gameState.mowedGrass = 0;

  for (let y = 0; y < GRID_HEIGHT; y++) {
    tiles[y] = [];
    for (let x = 0; x < GRID_WIDTH; x++) {
      tiles[y][x] = TILE.GRASS_TALL;
      gameState.totalGrass++;
    }
  }

  const houseX = 8;
  const houseY = 5;
  const houseW = 5;
  const houseH = 4;

  for (let y = houseY; y < houseY + houseH; y++) {
    for (let x = houseX; x < houseX + houseW; x++) {
      tiles[y][x] = TILE.HOUSE;
      gameState.totalGrass--;
    }
  }

  for (let y = houseY + houseH; y < GRID_HEIGHT; y++) {
    tiles[y][houseX + 2] = TILE.PATH;
    gameState.totalGrass--;
  }

  return tiles;
}

function init() {
  canvas = document.getElementById('game-canvas');
  ctx = canvas.getContext('2d');
  
  canvas.width = CANVAS_WIDTH;
  canvas.height = CANVAS_HEIGHT;

  gameState.tiles = createLevel();
  
  setupControls();
  gameLoop();
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

  document.getElementById('restart-btn').addEventListener('click', restartGame);
}

function restartGame() {
  gameState.player = { x: 2 * TILE_SIZE, y: 7 * TILE_SIZE };
  gameState.tiles = createLevel();
  gameState.mowedGrass = 0;
  gameState.completed = false;
  gameState.particles = [];
  document.getElementById('completion-modal').classList.add('hidden');
  updateHUD();
}

function update() {
  if (gameState.completed) return;

  let dx = 0, dy = 0;
  
  if (keys.up) dy -= PLAYER_SPEED;
  if (keys.down) dy += PLAYER_SPEED;
  if (keys.left) dx -= PLAYER_SPEED;
  if (keys.right) dx += PLAYER_SPEED;

  if (dx !== 0 && dy !== 0) {
    dx *= 0.707;
    dy *= 0.707;
  }

  const newX = gameState.player.x + dx;
  const newY = gameState.player.y + dy;

  if (canMoveTo(newX, gameState.player.y)) {
    gameState.player.x = newX;
  }
  if (canMoveTo(gameState.player.x, newY)) {
    gameState.player.y = newY;
  }

  gameState.player.x = Math.max(0, Math.min(CANVAS_WIDTH - TILE_SIZE, gameState.player.x));
  gameState.player.y = Math.max(0, Math.min(CANVAS_HEIGHT - TILE_SIZE, gameState.player.y));

  checkMowing();
  updateParticles();
  updateHUD();
  checkCompletion();
}

function canMoveTo(x, y) {
  const corners = [
    { x: x + 4, y: y + 4 },
    { x: x + TILE_SIZE - 4, y: y + 4 },
    { x: x + 4, y: y + TILE_SIZE - 4 },
    { x: x + TILE_SIZE - 4, y: y + TILE_SIZE - 4 },
  ];

  for (const corner of corners) {
    const tileX = Math.floor(corner.x / TILE_SIZE);
    const tileY = Math.floor(corner.y / TILE_SIZE);
    
    if (tileX >= 0 && tileX < GRID_WIDTH && tileY >= 0 && tileY < GRID_HEIGHT) {
      if (gameState.tiles[tileY][tileX] === TILE.HOUSE) {
        return false;
      }
    }
  }
  return true;
}

function checkMowing() {
  const playerCenterX = gameState.player.x + TILE_SIZE / 2;
  const playerCenterY = gameState.player.y + TILE_SIZE / 2;
  
  const tileX = Math.floor(playerCenterX / TILE_SIZE);
  const tileY = Math.floor(playerCenterY / TILE_SIZE);

  if (tileX >= 0 && tileX < GRID_WIDTH && tileY >= 0 && tileY < GRID_HEIGHT) {
    if (gameState.tiles[tileY][tileX] === TILE.GRASS_TALL) {
      gameState.tiles[tileY][tileX] = TILE.GRASS_CUT;
      gameState.mowedGrass++;
      spawnGrassParticles(tileX * TILE_SIZE + TILE_SIZE / 2, tileY * TILE_SIZE + TILE_SIZE / 2);
    }
  }
}

function spawnGrassParticles(x, y) {
  for (let i = 0; i < 8; i++) {
    gameState.particles.push({
      x,
      y,
      vx: (Math.random() - 0.5) * 6,
      vy: Math.random() * -4 - 2,
      life: 30 + Math.random() * 20,
      color: COLORS.GRASS_TALL[Math.floor(Math.random() * COLORS.GRASS_TALL.length)],
      size: 3 + Math.random() * 3,
    });
  }
}

function updateParticles() {
  gameState.particles = gameState.particles.filter(p => {
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.2;
    p.life--;
    p.size *= 0.97;
    return p.life > 0;
  });
}

function updateHUD() {
  const percent = Math.floor((gameState.mowedGrass / gameState.totalGrass) * 100);
  document.getElementById('grass-percent').textContent = percent;
  document.getElementById('money').textContent = gameState.money;
}

function checkCompletion() {
  const percent = (gameState.mowedGrass / gameState.totalGrass) * 100;
  
  if (percent >= 100 && !gameState.completed) {
    gameState.completed = true;
    gameState.money += MOW_REWARD;
    document.getElementById('reward-amount').textContent = MOW_REWARD;
    document.getElementById('money').textContent = gameState.money;
    
    setTimeout(() => {
      document.getElementById('completion-modal').classList.remove('hidden');
    }, 500);
  }
}

function render() {
  ctx.fillStyle = '#2D5A27';
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  for (let y = 0; y < GRID_HEIGHT; y++) {
    for (let x = 0; x < GRID_WIDTH; x++) {
      renderTile(x, y, gameState.tiles[y][x]);
    }
  }

  renderHouse();
  renderPlayer();
  renderParticles();
}

function renderTile(x, y, tile) {
  const px = x * TILE_SIZE;
  const py = y * TILE_SIZE;

  switch (tile) {
    case TILE.GRASS_TALL:
      renderTallGrass(px, py);
      break;
    case TILE.GRASS_CUT:
      renderCutGrass(px, py);
      break;
    case TILE.PATH:
      ctx.fillStyle = COLORS.PATH;
      ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
      ctx.fillStyle = '#B8996C';
      for (let i = 0; i < 3; i++) {
        const sx = px + Math.random() * 24;
        const sy = py + Math.random() * 24;
        ctx.fillRect(sx, sy, 4, 4);
      }
      break;
  }
}

function renderTallGrass(x, y) {
  const baseColor = COLORS.GRASS_TALL[0];
  ctx.fillStyle = baseColor;
  ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);

  ctx.strokeStyle = '#1E6B1E';
  ctx.lineWidth = 2;
  
  const seed = (x * 7 + y * 13) % 100;
  for (let i = 0; i < 6; i++) {
    const bx = x + 4 + (i * 5) % 24;
    const by = y + TILE_SIZE;
    const height = 12 + ((seed + i * 17) % 10);
    const sway = Math.sin(Date.now() / 500 + seed + i) * 2;
    
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.quadraticCurveTo(bx + sway, by - height / 2, bx + sway * 1.5, by - height);
    ctx.stroke();
  }
}

function renderCutGrass(x, y) {
  ctx.fillStyle = COLORS.GRASS_CUT[0];
  ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);

  ctx.fillStyle = COLORS.GRASS_CUT[1];
  const seed = (x * 7 + y * 13) % 100;
  for (let i = 0; i < 4; i++) {
    const sx = x + ((seed + i * 23) % 28);
    const sy = y + ((seed + i * 17) % 28);
    ctx.fillRect(sx, sy, 3, 2);
  }
}

function renderHouse() {
  const houseX = 8 * TILE_SIZE;
  const houseY = 5 * TILE_SIZE;
  const houseW = 5 * TILE_SIZE;
  const houseH = 4 * TILE_SIZE;

  ctx.fillStyle = '#2D5A27';
  ctx.fillRect(houseX, houseY, houseW, houseH);

  ctx.fillStyle = COLORS.HOUSE_WALL;
  ctx.fillRect(houseX + 8, houseY + 40, houseW - 16, houseH - 40);

  ctx.fillStyle = COLORS.HOUSE_ROOF;
  ctx.beginPath();
  ctx.moveTo(houseX, houseY + 50);
  ctx.lineTo(houseX + houseW / 2, houseY + 10);
  ctx.lineTo(houseX + houseW, houseY + 50);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = '#5D2E0C';
  ctx.lineWidth = 3;
  ctx.stroke();

  ctx.fillStyle = COLORS.HOUSE_DOOR;
  const doorX = houseX + houseW / 2 - 15;
  const doorY = houseY + houseH - 50;
  ctx.fillRect(doorX, doorY, 30, 50);
  
  ctx.fillStyle = '#FFD700';
  ctx.beginPath();
  ctx.arc(doorX + 24, doorY + 28, 4, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = COLORS.HOUSE_WINDOW;
  ctx.fillRect(houseX + 24, houseY + 60, 30, 25);
  ctx.fillRect(houseX + houseW - 54, houseY + 60, 30, 25);

  ctx.strokeStyle = '#FFFFFF';
  ctx.lineWidth = 2;
  [houseX + 24, houseX + houseW - 54].forEach(wx => {
    ctx.beginPath();
    ctx.moveTo(wx + 15, houseY + 60);
    ctx.lineTo(wx + 15, houseY + 85);
    ctx.moveTo(wx, houseY + 72);
    ctx.lineTo(wx + 30, houseY + 72);
    ctx.stroke();
  });

  ctx.strokeStyle = '#4A3520';
  ctx.lineWidth = 2;
  ctx.strokeRect(houseX + 24, houseY + 60, 30, 25);
  ctx.strokeRect(houseX + houseW - 54, houseY + 60, 30, 25);
}

function renderPlayer() {
  const { x, y } = gameState.player;
  const isMoving = keys.up || keys.down || keys.left || keys.right;
  const bobOffset = isMoving ? Math.sin(Date.now() / 100) * 2 : 0;

  ctx.fillStyle = COLORS.MOWER;
  ctx.fillRect(x + 8, y + 20 + bobOffset, 16, 10);
  ctx.fillStyle = '#CC4444';
  ctx.fillRect(x + 10, y + 22 + bobOffset, 4, 6);

  if (isMoving) {
    ctx.fillStyle = '#888';
    for (let i = 0; i < 3; i++) {
      const ox = (Date.now() / 50 + i * 30) % 20;
      ctx.globalAlpha = 0.3 - ox / 100;
      ctx.beginPath();
      ctx.arc(x + 16, y + 30 - ox, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  ctx.fillStyle = COLORS.PLAYER_BODY;
  ctx.fillRect(x + 10, y + 8 + bobOffset, 12, 14);

  ctx.fillStyle = COLORS.PLAYER_SKIN;
  ctx.beginPath();
  ctx.arc(x + 16, y + 4 + bobOffset, 7, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = COLORS.PLAYER_HAIR;
  ctx.beginPath();
  ctx.arc(x + 16, y + 2 + bobOffset, 7, Math.PI, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = COLORS.PLAYER_SKIN;
  ctx.fillRect(x + 6, y + 12 + bobOffset, 4, 8);
  ctx.fillRect(x + 22, y + 12 + bobOffset, 4, 8);

  ctx.fillStyle = '#333';
  ctx.fillRect(x + 10, y + 22 + bobOffset, 5, 8);
  ctx.fillRect(x + 17, y + 22 + bobOffset, 5, 8);
}

function renderParticles() {
  for (const p of gameState.particles) {
    ctx.globalAlpha = p.life / 50;
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
  }
  ctx.globalAlpha = 1;
}

function gameLoop() {
  update();
  render();
  requestAnimationFrame(gameLoop);
}

document.addEventListener('DOMContentLoaded', init);
