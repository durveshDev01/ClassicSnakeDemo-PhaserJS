let canvas = document.getElementById("canvas1");
let ctx = canvas.getContext("2d");

const CELL_SIZE = 18;
let CANVAS_WIDTH = (canvas.width = 800);
let CANVAS_HEIGHT = (canvas.height = 800);

// Grid dimensions
const COLS = Math.floor(CANVAS_WIDTH / CELL_SIZE);
const ROWS = Math.floor(CANVAS_HEIGHT / CELL_SIZE);

// Gap positions (middle of each edge)
const GAP_X = Math.floor(COLS / 2);
const GAP_Y = Math.floor(ROWS / 2);

// ═══════════════ IMAGES ═══════════════

let snakeHeadImg = new Image();
snakeHeadImg.src = "snakesprites/png/snake_green_head.png";

let snakeBlobImg = new Image();
snakeBlobImg.src = "snakesprites/png/snake_green_blob.png";

let aiHeadImg = new Image();
aiHeadImg.src = "snakesprites/png/snake_yellow_head.png";

let aiBlobImg = new Image();
aiBlobImg.src = "snakesprites/png/snake_yellow_blob.png";

let wallImg = new Image();
wallImg.src = "snakesprites/png/wall_block.png";

// Preload all item images
const ITEM_IMAGE_SRCS = {
  apple_red: "snakesprites/png/apple_red.png",
  apple_green: "snakesprites/png/apple_green.png",
  apple_alt: "snakesprites/png/apple_alt.png",
  easter_egg: "snakesprites/png/easter_egg.png",
  oliebol: "snakesprites/png/oliebol.png",
  bomb: "snakesprites/png/bomb.png",
};
let itemImages = {};
for (let key in ITEM_IMAGE_SRCS) {
  let img = new Image();
  img.src = ITEM_IMAGE_SRCS[key];
  itemImages[key] = img;
}

// ═══════════════ DIFFICULTY ═══════════════

const DIFFICULTY_SETTINGS = {
  easy: {
    moveInterval: 200,
    aiMoveInterval: 280,
    aiRandomness: 0.35,
    bombWeight: 3,
    bombLifetime: 4500,
  },
  medium: {
    moveInterval: 180,
    aiMoveInterval: 230,
    aiRandomness: 0.2,
    bombWeight: 3,
    bombLifetime: 6000,
  },
  hard: {
    moveInterval: 150,
    aiMoveInterval: 180,
    aiRandomness: 0.1,
    bombWeight: 3,
    bombLifetime: 8000,
  },
};

let difficulty = "medium";
let settings = DIFFICULTY_SETTINGS[difficulty];

// Item types (bomb weight pulled from difficulty settings)
function getItemTypes() {
  return [
    { key: "apple_red", weight: 5, effect: "grow" },
    { key: "apple_green", weight: 3, effect: "grow2" },
    { key: "apple_alt", weight: 2, effect: "grow" },
    { key: "easter_egg", weight: 1, effect: "spawnAI" },
    { key: "oliebol", weight: 2, effect: "shrink5" },
    { key: "bomb", weight: settings.bombWeight, effect: "die" },
  ];
}

// ═══════════════ GAME STATE ═══════════════

let gameState = "menu"; // "menu", "playing", "paused", "gameover"

// Player snake
let direction = "RIGHT";
let nextDirection = "RIGHT";
let snake = [];

// AI snake
let aiSnake = [];
let aiDirection = "LEFT";
let aiAlive = false;
let aiLastMoveTime = 0;

// Items on the field
let items = [];
const MIN_ITEMS = 8;
const MAX_ITEMS = 12;

// Walls
let walls = [];

let gameOver = false;
let lastMoveTime = 0;

let kills = 0;
let highScore = parseInt(localStorage.getItem("snakeHighScore")) || 0;
let highKills = parseInt(localStorage.getItem("snakeHighKills")) || 0;

// Mouse tracking (for menu hover)
let mouseX = 0;
let mouseY = 0;

// ═══════════════ MENU BUTTONS ═══════════════

const BTN_W = 220;
const BTN_H = 55;
const BTN_X = (CANVAS_WIDTH - BTN_W) / 2;
const menuButtons = [
  { label: "Easy", diff: "easy", y: 360 },
  { label: "Medium", diff: "medium", y: 435 },
  { label: "Hard", diff: "hard", y: 510 },
];

// ═══════════════ WALLS ═══════════════

function buildWalls() {
  walls = [];
  for (let i = 0; i < COLS; i++) {
    if (i !== GAP_X) walls.push({ x: i, y: 0 });
    if (i !== GAP_X) walls.push({ x: i, y: ROWS - 1 });
  }
  for (let j = 0; j < ROWS; j++) {
    if (j !== GAP_Y) walls.push({ x: 0, y: j });
    if (j !== GAP_Y) walls.push({ x: COLS - 1, y: j });
  }
}

// ═══════════════ ITEM SPAWNING ═══════════════

function pickRandomItemType() {
  let types = getItemTypes();
  let totalWeight = types.reduce((sum, t) => sum + t.weight, 0);
  let r = Math.random() * totalWeight;
  for (let type of types) {
    r -= type.weight;
    if (r <= 0) return type;
  }
  return types[0];
}

function isCellOccupied(x, y) {
  if (snake.some((s) => s.x === x && s.y === y)) return true;
  if (walls.some((w) => w.x === x && w.y === y)) return true;
  if (items.some((i) => i.x === x && i.y === y)) return true;
  if (aiAlive && aiSnake.some((s) => s.x === x && s.y === y)) return true;
  return false;
}

function spawnItem() {
  let x, y;
  let attempts = 0;
  do {
    x = Math.floor(Math.random() * COLS);
    y = Math.floor(Math.random() * ROWS);
    attempts++;
    if (attempts > 200) return;
  } while (isCellOccupied(x, y));

  let type = pickRandomItemType();
  items.push({
    x,
    y,
    type: type.key,
    effect: type.effect,
    spawnTime: performance.now(),
  });
}

function fillItems() {
  let target =
    MIN_ITEMS + Math.floor(Math.random() * (MAX_ITEMS - MIN_ITEMS + 1));
  while (items.length < target) {
    spawnItem();
  }
}

function removeExpiredBombs(timestamp) {
  items = items.filter((item) => {
    if (item.effect === "die" && timestamp - item.spawnTime > settings.bombLifetime)
      return false;
    return true;
  });
}

// ═══════════════ AI SNAKE ═══════════════

function spawnAISnake() {
  if (aiAlive) return; // only one at a time
  // Find a spot at least 10 cells away from player
  let startX, startY;
  let attempts = 0;
  do {
    startX = 3 + Math.floor(Math.random() * (COLS - 6));
    startY = 3 + Math.floor(Math.random() * (ROWS - 6));
    attempts++;
    if (attempts > 100) break;
  } while (
    Math.abs(startX - snake[0].x) + Math.abs(startY - snake[0].y) < 10
  );

  aiSnake = [
    { x: startX, y: startY },
    { x: startX + 1, y: startY },
    { x: startX + 2, y: startY },
  ];
  aiDirection = "LEFT";
  aiAlive = true;
  aiLastMoveTime = performance.now();
}

function moveAISnake(timestamp) {
  if (!aiAlive || aiSnake.length === 0) return;
  if (timestamp - aiLastMoveTime < settings.aiMoveInterval) return;
  aiLastMoveTime = timestamp;

  const opposite = { UP: "DOWN", DOWN: "UP", LEFT: "RIGHT", RIGHT: "LEFT" };

  // Find nearest food (skip bombs)
  let target = null;
  let bestDist = Infinity;
  for (let item of items) {
    if (item.effect === "die") continue;
    let dist =
      Math.abs(item.x - aiSnake[0].x) + Math.abs(item.y - aiSnake[0].y);
    if (dist < bestDist) {
      bestDist = dist;
      target = item;
    }
  }

  // Build preferred direction list toward target
  let preferred = [];
  if (target) {
    let dx = target.x - aiSnake[0].x;
    let dy = target.y - aiSnake[0].y;
    if (Math.abs(dx) >= Math.abs(dy)) {
      preferred.push(dx > 0 ? "RIGHT" : "LEFT");
      if (dy !== 0) preferred.push(dy > 0 ? "DOWN" : "UP");
    } else {
      preferred.push(dy > 0 ? "DOWN" : "UP");
      if (dx !== 0) preferred.push(dx > 0 ? "RIGHT" : "LEFT");
    }
  }

  // Apply randomness — sometimes pick a random direction
  if (Math.random() < settings.aiRandomness || preferred.length === 0) {
    preferred = ["UP", "DOWN", "LEFT", "RIGHT"].sort(
      () => Math.random() - 0.5
    );
  }

  // Remove reverse direction
  preferred = preferred.filter((d) => d !== opposite[aiDirection]);

  // Add remaining directions as fallbacks
  for (let d of ["UP", "DOWN", "LEFT", "RIGHT"]) {
    if (!preferred.includes(d) && d !== opposite[aiDirection]) {
      preferred.push(d);
    }
  }

  // Avoidance chance for walls/bombs degrades with size
  let avoidChance = Math.max(0.75, 0.95 - aiSnake.length * 0.01);

  // Try each direction
  let chosenDir = null;
  for (let dir of preferred) {
    let test = { ...aiSnake[0] };
    if (dir === "UP") test.y--;
    else if (dir === "DOWN") test.y++;
    else if (dir === "LEFT") test.x--;
    else if (dir === "RIGHT") test.x++;

    // Wrap through gaps
    if (test.y < 0) test.y = ROWS - 1;
    if (test.y >= ROWS) test.y = 0;
    if (test.x < 0) test.x = COLS - 1;
    if (test.x >= COLS) test.x = 0;

    let hitsSelf = aiSnake.some(
      (s, i) => i > 0 && s.x === test.x && s.y === test.y
    );
    let hitsPlayer = snake.some((s) => s.x === test.x && s.y === test.y);
    let hitsWall = walls.some((w) => w.x === test.x && w.y === test.y);
    let hitsBomb = items.some(
      (i) => i.x === test.x && i.y === test.y && i.effect === "die"
    );

    // Always avoid self and player body
    if (hitsSelf) continue;
    if (hitsPlayer) continue;

    // Walls/bombs: avoid with decreasing probability as AI grows
    if ((hitsWall || hitsBomb) && Math.random() < avoidChance) continue;

    chosenDir = dir;
    break;
  }

  // Fallback: pick any non-reverse direction
  if (!chosenDir) {
    chosenDir = preferred[0] || aiDirection;
  }

  aiDirection = chosenDir;

  let head = { ...aiSnake[0] };
  if (aiDirection === "UP") head.y--;
  else if (aiDirection === "DOWN") head.y++;
  else if (aiDirection === "LEFT") head.x--;
  else if (aiDirection === "RIGHT") head.x++;

  // Wrap through gaps
  if (head.y < 0) head.y = ROWS - 1;
  if (head.y >= ROWS) head.y = 0;
  if (head.x < 0) head.x = COLS - 1;
  if (head.x >= COLS) head.x = 0;

  // Wall collision → AI dies
  if (walls.some((w) => w.x === head.x && w.y === head.y)) {
    aiAlive = false;
    aiSnake = [];
    return;
  }

  // Self collision → AI dies
  if (aiSnake.some((s, i) => i > 0 && s.x === head.x && s.y === head.y)) {
    aiAlive = false;
    aiSnake = [];
    return;
  }

  aiSnake.unshift(head);

  // Check if AI ate an item
  let eatenIdx = items.findIndex(
    (item) => item.x === head.x && item.y === head.y
  );
  if (eatenIdx !== -1) {
    let eaten = items[eatenIdx];
    items.splice(eatenIdx, 1);

    // Bomb → AI dies
    if (eaten.effect === "die") {
      aiAlive = false;
      aiSnake = [];
      fillItems();
      return;
    }

    switch (eaten.effect) {
      case "grow":
        break; // grow by 1 (don't pop)
      case "grow2":
        aiSnake.push({ ...aiSnake[aiSnake.length - 1] });
        break;
      case "spawnAI":
        // Egg just gives AI big growth (+5)
        for (let i = 0; i < 4; i++)
          aiSnake.push({ ...aiSnake[aiSnake.length - 1] });
        break;
      case "shrink5":
        if (aiSnake.length <= 5) {
          aiAlive = false;
          aiSnake = [];
          fillItems();
          return;
        }
        aiSnake.pop();
        for (let i = 0; i < 4 && aiSnake.length > 1; i++) aiSnake.pop();
        break;
    }
    fillItems();
  } else {
    aiSnake.pop();
  }
}

// ═══════════════ SNAKE-VS-SNAKE COLLISION ═══════════════

function checkSnakeVsSnake() {
  if (!aiAlive || aiSnake.length === 0 || snake.length === 0) return;

  let playerHead = snake[0];
  let aiHead = aiSnake[0];

  // Head-to-head → both get cut to just the head
  if (playerHead.x === aiHead.x && playerHead.y === aiHead.y) {
    snake = [snake[0]];
    aiSnake = [aiSnake[0]];
    return;
  }

  // AI head barges into player body → AI dies, player gets cut at that point
  for (let i = 1; i < snake.length; i++) {
    if (aiHead.x === snake[i].x && aiHead.y === snake[i].y) {
      aiAlive = false;
      aiSnake = [];
      snake = snake.slice(0, i);
      kills++;
      if (kills > highKills) {
        highKills = kills;
        localStorage.setItem("snakeHighKills", highKills);
      }
      return;
    }
  }

  // Player head hits AI body → game over for player, AI gets cut
  for (let i = 1; i < aiSnake.length; i++) {
    if (playerHead.x === aiSnake[i].x && playerHead.y === aiSnake[i].y) {
      aiSnake = aiSnake.slice(0, i);
      gameOver = true;
      gameState = "gameover";
      return;
    }
  }
}

// ═══════════════ INPUT ═══════════════

document.addEventListener("keydown", (e) => {
  // ── Menu ──
  if (gameState === "menu") return;

  // ── Game Over → back to menu ──
  if (gameState === "gameover" && e.key === " ") {
    gameState = "menu";
    return;
  }

  // ── Pause toggle ──
  if (
    (e.key === "p" || e.key === "P" || e.key === "Escape") &&
    (gameState === "playing" || gameState === "paused")
  ) {
    gameState = gameState === "playing" ? "paused" : "playing";
    return;
  }

  // ── Direction (only while playing) ──
  if (gameState !== "playing") return;

  // Arrow keys
  if (e.key === "ArrowUp" && direction !== "DOWN") nextDirection = "UP";
  else if (e.key === "ArrowDown" && direction !== "UP") nextDirection = "DOWN";
  else if (e.key === "ArrowLeft" && direction !== "RIGHT")
    nextDirection = "LEFT";
  else if (e.key === "ArrowRight" && direction !== "LEFT")
    nextDirection = "RIGHT";

  // WASD
  if ((e.key === "w" || e.key === "W") && direction !== "DOWN")
    nextDirection = "UP";
  else if ((e.key === "s" || e.key === "S") && direction !== "UP")
    nextDirection = "DOWN";
  else if ((e.key === "a" || e.key === "A") && direction !== "RIGHT")
    nextDirection = "LEFT";
  else if ((e.key === "d" || e.key === "D") && direction !== "LEFT")
    nextDirection = "RIGHT";
});

// Mouse events for menu
canvas.addEventListener("mousemove", (e) => {
  let rect = canvas.getBoundingClientRect();
  mouseX = (e.clientX - rect.left) * (CANVAS_WIDTH / rect.width);
  mouseY = (e.clientY - rect.top) * (CANVAS_HEIGHT / rect.height);
});

canvas.addEventListener("click", (e) => {
  if (gameState !== "menu") return;
  let rect = canvas.getBoundingClientRect();
  let cx = (e.clientX - rect.left) * (CANVAS_WIDTH / rect.width);
  let cy = (e.clientY - rect.top) * (CANVAS_HEIGHT / rect.height);

  for (let btn of menuButtons) {
    if (cx >= BTN_X && cx <= BTN_X + BTN_W && cy >= btn.y && cy <= btn.y + BTN_H) {
      startGame(btn.diff);
      return;
    }
  }
});

// ═══════════════ PLAYER MOVEMENT ═══════════════

function moveSnake() {
  direction = nextDirection;

  let head = { ...snake[0] };
  if (direction === "UP") head.y--;
  else if (direction === "DOWN") head.y++;
  else if (direction === "LEFT") head.x--;
  else if (direction === "RIGHT") head.x++;

  // Wrap through gaps
  if (head.y < 0) head.y = ROWS - 1;
  if (head.y >= ROWS) head.y = 0;
  if (head.x < 0) head.x = COLS - 1;
  if (head.x >= COLS) head.x = 0;

  // Wall collision
  if (walls.some((w) => w.x === head.x && w.y === head.y)) {
    gameOver = true;
    gameState = "gameover";
    return;
  }

  // Self collision
  if (snake.some((seg) => seg.x === head.x && seg.y === head.y)) {
    gameOver = true;
    gameState = "gameover";
    return;
  }

  snake.unshift(head);

  // Check if head hit any item
  let eatenIndex = items.findIndex(
    (item) => item.x === head.x && item.y === head.y
  );
  if (eatenIndex !== -1) {
    let eaten = items[eatenIndex];
    items.splice(eatenIndex, 1);

    switch (eaten.effect) {
      case "grow":
        // Grow by 1 (don't pop tail)
        break;
      case "grow2":
        // Grow by 2
        snake.push({ ...snake[snake.length - 1] });
        break;
      case "spawnAI":
        // Spawn AI snake + grow player by 10 as bonus
        for (let i = 0; i < 9; i++)
          snake.push({ ...snake[snake.length - 1] });
        spawnAISnake();
        break;
      case "shrink5":
        if (snake.length <= 5) {
          gameOver = true;
          gameState = "gameover";
          return;
        }
        snake.pop(); // normal pop
        for (let i = 0; i < 4 && snake.length > 1; i++) snake.pop();
        break;
      case "die":
        gameOver = true;
        gameState = "gameover";
        return;
    }
    fillItems();
  } else {
    snake.pop(); // normal move
  }

  // Update high score
  if (snake.length > highScore) {
    highScore = snake.length;
    localStorage.setItem("snakeHighScore", highScore);
  }
}

// ═══════════════ DRAWING HELPERS ═══════════════

function getRotation(dir) {
  if (dir === "RIGHT") return Math.PI / 2;
  if (dir === "DOWN") return Math.PI;
  if (dir === "LEFT") return -Math.PI / 2;
  return 0; // UP
}

function drawRotatedImg(img, gridX, gridY, rotation) {
  let px = gridX * CELL_SIZE;
  let py = gridY * CELL_SIZE;
  ctx.save();
  ctx.translate(px + CELL_SIZE / 2, py + CELL_SIZE / 2);
  ctx.rotate(rotation);
  ctx.drawImage(img, -CELL_SIZE / 2, -CELL_SIZE / 2, CELL_SIZE, CELL_SIZE);
  ctx.restore();
}

function drawImg(img, gridX, gridY) {
  ctx.drawImage(img, gridX * CELL_SIZE, gridY * CELL_SIZE, CELL_SIZE, CELL_SIZE);
}

// ═══════════════ DRAW GAME ELEMENTS ═══════════════

function drawWalls() {
  for (let w of walls) drawImg(wallImg, w.x, w.y);
}

function drawItems() {
  for (let item of items) {
    let img = itemImages[item.type];
    if (img) drawImg(img, item.x, item.y);
  }
}

function drawSnake() {
  for (let i = snake.length - 1; i >= 1; i--) {
    drawImg(snakeBlobImg, snake[i].x, snake[i].y);
  }
  if (snake.length > 0) {
    drawRotatedImg(snakeHeadImg, snake[0].x, snake[0].y, getRotation(direction));
  }
}

function drawAISnake() {
  if (!aiAlive || aiSnake.length === 0) return;
  for (let i = aiSnake.length - 1; i >= 1; i--) {
    drawImg(aiBlobImg, aiSnake[i].x, aiSnake[i].y);
  }
  drawRotatedImg(aiHeadImg, aiSnake[0].x, aiSnake[0].y, getRotation(aiDirection));
}

function drawHUD() {
  ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
  ctx.fillRect(0, 0, CANVAS_WIDTH, 40);
  ctx.fillStyle = "#fff";
  ctx.font = "bold 20px Arial";
  ctx.textAlign = "left";
  ctx.fillText(`Length: ${snake.length} | High: ${highScore}`, 20, 27);
  ctx.textAlign = "right";
  ctx.fillText(`Kills: ${kills} | High: ${highKills}`, CANVAS_WIDTH - 20, 27);
}

// ═══════════════ DRAW SCREENS ═══════════════

function drawMenu() {
  // Background
  ctx.fillStyle = "#1a1a2e";
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  // Title
  ctx.textAlign = "center";
  ctx.fillStyle = "#16db93";
  ctx.font = "bold 64px Arial";
  ctx.fillText("🐍 SNAKE GAME", CANVAS_WIDTH / 2, 200);

  ctx.fillStyle = "#aaa";
  ctx.font = "22px Arial";
  ctx.fillText("Select Difficulty", CANVAS_WIDTH / 2, 310);

  // Buttons
  const colors = { easy: "#2ecc71", medium: "#f39c12", hard: "#e74c3c" };
  for (let btn of menuButtons) {
    let hover =
      mouseX >= BTN_X &&
      mouseX <= BTN_X + BTN_W &&
      mouseY >= btn.y &&
      mouseY <= btn.y + BTN_H;

    ctx.fillStyle = hover ? colors[btn.diff] : "#2a2a4a";
    ctx.strokeStyle = colors[btn.diff];
    ctx.lineWidth = 2;

    // Rounded rect
    let r = 10;
    ctx.beginPath();
    ctx.moveTo(BTN_X + r, btn.y);
    ctx.lineTo(BTN_X + BTN_W - r, btn.y);
    ctx.quadraticCurveTo(BTN_X + BTN_W, btn.y, BTN_X + BTN_W, btn.y + r);
    ctx.lineTo(BTN_X + BTN_W, btn.y + BTN_H - r);
    ctx.quadraticCurveTo(BTN_X + BTN_W, btn.y + BTN_H, BTN_X + BTN_W - r, btn.y + BTN_H);
    ctx.lineTo(BTN_X + r, btn.y + BTN_H);
    ctx.quadraticCurveTo(BTN_X, btn.y + BTN_H, BTN_X, btn.y + BTN_H - r);
    ctx.lineTo(BTN_X, btn.y + r);
    ctx.quadraticCurveTo(BTN_X, btn.y, BTN_X + r, btn.y);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = hover ? "#fff" : colors[btn.diff];
    ctx.font = "bold 26px Arial";
    ctx.fillText(btn.label, CANVAS_WIDTH / 2, btn.y + BTN_H / 2 + 9);
  }

  // Controls hint
  ctx.fillStyle = "#666";
  ctx.font = "16px Arial";
  ctx.fillText("Arrow Keys / WASD to move  •  P / Esc to pause", CANVAS_WIDTH / 2, 630);
}

function drawPauseOverlay() {
  ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  ctx.textAlign = "center";
  ctx.fillStyle = "#fff";
  ctx.font = "bold 52px Arial";
  ctx.fillText("PAUSED", CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 10);
  ctx.font = "22px Arial";
  ctx.fillStyle = "#aaa";
  ctx.fillText("Press P or Esc to resume", CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 35);
}

function drawGameOver() {
  ctx.fillStyle = "rgba(0, 0, 0, 0.65)";
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  ctx.textAlign = "center";
  ctx.fillStyle = "#e74c3c";
  ctx.font = "bold 52px Arial";
  ctx.fillText("GAME OVER", CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 10);
  ctx.fillStyle = "#aaa";
  ctx.font = "22px Arial";
  ctx.fillText("Press Space to return to menu", CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 35);
}

// ═══════════════ START / RESET ═══════════════

function startGame(diff) {
  difficulty = diff;
  settings = DIFFICULTY_SETTINGS[difficulty];

  snake = [{ x: Math.floor(COLS / 2), y: Math.floor(ROWS / 2) }];
  direction = "RIGHT";
  nextDirection = "RIGHT";

  aiSnake = [];
  aiAlive = false;
  aiLastMoveTime = 0;

  items = [];
  gameOver = false;
  lastMoveTime = 0;
  kills = 0;

  buildWalls();
  fillItems();
  gameState = "playing";
}

// ═══════════════ MAIN LOOP ═══════════════

function animate(timestamp) {
  // ── Menu ──
  if (gameState === "menu") {
    drawMenu();
    requestAnimationFrame(animate);
    return;
  }

  // ── Playing: update logic ──
  if (gameState === "playing") {
    // Remove expired bombs
    removeExpiredBombs(timestamp);
    // Refill if bombs disappearing left us short
    if (items.length < MIN_ITEMS) fillItems();

    // Player movement
    if (timestamp - lastMoveTime >= settings.moveInterval) {
      moveSnake();
      lastMoveTime = timestamp;
    }

    // AI movement
    if (aiAlive) {
      moveAISnake(timestamp);
    }

    // Snake-vs-snake collision
    if (!gameOver) {
      checkSnakeVsSnake();
    }
  }

  // ── Draw game field (playing, paused, and gameover) ──
  ctx.fillStyle = "#111";
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  drawWalls();
  drawItems();
  drawAISnake();
  drawSnake();
  drawHUD();

  // ── Overlays ──
  if (gameState === "paused") drawPauseOverlay();
  if (gameState === "gameover") drawGameOver();

  requestAnimationFrame(animate);
}

// ═══════════════ INIT ═══════════════

buildWalls();
requestAnimationFrame(animate);
