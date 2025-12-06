/**
 * Snowball Duel - Client
 * Handles WebSocket communication, game rendering, and UI
 */

// ============ Configuration ============
// Auto-detect WebSocket URL based on current location
const WS_PROTOCOL = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const WS_HOST = window.location.hostname;
const WS_PORT = window.location.port ? `:${window.location.port}` : '';
// Use /snowball-ws/ path for WebSocket when behind proxy
const WS_PATH = window.location.port ? '' : '/snowball-ws';
const WS_URL = `${WS_PROTOCOL}//${WS_HOST}${WS_PORT}${WS_PATH}`;

const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 400;
const PLAYER_RADIUS = 25;
const SNOWBALL_RADIUS = 8;
const GROUND_HEIGHT = 50;

// ============ DOM Elements ============
const screens = {
  auth: document.getElementById("authScreen"),
  lobby: document.getElementById("lobbyScreen"),
  game: document.getElementById("gameScreen"),
};

// Auth elements
const tabBtns = document.querySelectorAll(".tab-btn");
const loginForm = document.getElementById("loginForm");
const registerForm = document.getElementById("registerForm");
const loginUsername = document.getElementById("loginUsername");
const loginPassword = document.getElementById("loginPassword");
const loginError = document.getElementById("loginError");
const registerUsername = document.getElementById("registerUsername");
const registerPassword = document.getElementById("registerPassword");
const registerConfirm = document.getElementById("registerConfirm");
const registerError = document.getElementById("registerError");
const registerSuccess = document.getElementById("registerSuccess");

// Lobby elements
const welcomeUser = document.getElementById("welcomeUser");
const statWins = document.getElementById("statWins");
const statLosses = document.getElementById("statLosses");
const statGames = document.getElementById("statGames");
const findGameBtn = document.getElementById("findGameBtn");
const cancelSearchBtn = document.getElementById("cancelSearchBtn");
const searchStatus = document.getElementById("searchStatus");
const logoutBtn = document.getElementById("logoutBtn");

// Game elements
const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
const player1Name = document.getElementById("player1Name");
const player2Name = document.getElementById("player2Name");
const player1Score = document.getElementById("player1Score");
const player2Score = document.getElementById("player2Score");
const roundInfo = document.getElementById("roundInfo");
const turnIndicator = document.getElementById("turnIndicator");
const gameControls = document.getElementById("gameControls");
const angleInput = document.getElementById("angleInput");
const forceInput = document.getElementById("forceInput");
const angleValue = document.getElementById("angleValue");
const forceValue = document.getElementById("forceValue");
const shootBtn = document.getElementById("shootBtn");
const gameMessage = document.getElementById("gameMessage");

// Modal elements
const resultModal = document.getElementById("resultModal");
const resultTitle = document.getElementById("resultTitle");
const resultMessage = document.getElementById("resultMessage");
const finalScore1 = document.getElementById("finalScore1");
const finalScore2 = document.getElementById("finalScore2");
const playAgainBtn = document.getElementById("playAgainBtn");

// ============ Game State ============
let ws = null;
let username = null;
let playerNumber = null;
let isMyTurn = false;
let gameActive = false;
let currentAnimation = null;

// Player positions
let player1Pos = { x: 80, y: CANVAS_HEIGHT - 60 };
let player2Pos = { x: CANVAS_WIDTH - 80, y: CANVAS_HEIGHT - 60 };

// Snowball animation state
let snowball = null;
let trajectoryIndex = 0;

// ============ WebSocket Connection ============
function connectWebSocket() {
  ws = new WebSocket(WS_URL);

  ws.onopen = () => {
    console.log("Connected to server");
  };

  ws.onmessage = (event) => {
    const message = JSON.parse(event.data);
    handleServerMessage(message);
  };

  ws.onclose = () => {
    console.log("Disconnected from server");
    setTimeout(connectWebSocket, 3000);
  };

  ws.onerror = (error) => {
    console.error("WebSocket error:", error);
  };
}

// ============ Message Handler ============
function handleServerMessage(message) {
  switch (message.type) {
    case "registerResult":
      handleRegisterResult(message);
      break;
    case "loginResult":
      handleLoginResult(message);
      break;
    case "logoutResult":
      handleLogoutResult();
      break;
    case "statsResult":
      handleStatsResult(message);
      break;
    case "waiting":
      showSearching(message.message);
      break;
    case "searchCancelled":
      hideSearching();
      break;
    case "gameStart":
      handleGameStart(message);
      break;
    case "shot":
      handleShot(message);
      break;
    case "roundEnd":
      handleRoundEnd(message);
      break;
    case "newRound":
      handleNewRound(message);
      break;
    case "turnSwitch":
      handleTurnSwitch(message);
      break;
    case "gameEnd":
      handleGameEnd(message);
      break;
    case "opponentLeft":
    case "opponentDisconnected":
      handleOpponentLeft(message);
      break;
    case "error":
      console.error("Server error:", message.message);
      break;
  }
}

// ============ Auth Handlers ============
function handleRegisterResult(message) {
  if (message.success) {
    registerSuccess.textContent = "Registration successful! Please login.";
    registerError.textContent = "";
    registerForm.reset();
    setTimeout(() => {
      tabBtns[0].click();
    }, 1500);
  } else {
    registerError.textContent = message.error;
    registerSuccess.textContent = "";
  }
}

function handleLoginResult(message) {
  if (message.success) {
    username = message.username;
    updateStats(message.stats);
    showScreen("lobby");
    loginForm.reset();
    loginError.textContent = "";
  } else {
    loginError.textContent = message.error;
  }
}

function handleLogoutResult() {
  username = null;
  showScreen("auth");
}

function handleStatsResult(message) {
  if (message.success) {
    updateStats(message.stats);
  }
}

function updateStats(stats) {
  welcomeUser.textContent = `Welcome, ${username}!`;
  statWins.textContent = stats.wins;
  statLosses.textContent = stats.losses;
  statGames.textContent = stats.gamesPlayed;
}

// ============ Lobby Handlers ============
function showSearching(message) {
  searchStatus.textContent = message;
  findGameBtn.style.display = "none";
  cancelSearchBtn.style.display = "inline-flex";
}

function hideSearching() {
  searchStatus.textContent = "";
  findGameBtn.style.display = "inline-flex";
  cancelSearchBtn.style.display = "none";
}

// ============ Game Handlers ============
function handleGameStart(message) {
  playerNumber = message.playerNumber;
  isMyTurn = message.yourTurn;
  gameActive = true;

  player1Pos = message.player1Pos;
  player2Pos = message.player2Pos;

  // Set player names
  if (playerNumber === 1) {
    player1Name.textContent = `${username} (You)`;
    player2Name.textContent = message.opponent;
  } else {
    player1Name.textContent = message.opponent;
    player2Name.textContent = `${username} (You)`;
  }

  player1Score.textContent = "0";
  player2Score.textContent = "0";
  roundInfo.textContent = "Round 1";

  updateTurnIndicator();
  showScreen("game");
  hideSearching();
  drawGame();
}

function handleShot(message) {
  const { trajectory, hit, hitPoint, shooter } = message;

  // Disable controls during animation
  setControlsEnabled(false);

  // Animate snowball
  animateSnowball(trajectory, shooter === 1, () => {
    if (hit) {
      showGameMessage("💥 HIT!", "hit");
    } else {
      showGameMessage("❄️ MISS!", "miss");
    }
  });
}

function handleRoundEnd(message) {
  player1Score.textContent = message.player1Score;
  player2Score.textContent = message.player2Score;
}

function handleNewRound(message) {
  roundInfo.textContent = `Round ${message.round}`;
  isMyTurn = message.currentTurn === playerNumber;
  updateTurnIndicator();
  hideGameMessage();
}

function handleTurnSwitch(message) {
  isMyTurn = message.currentTurn === playerNumber;
  updateTurnIndicator();
}

function handleGameEnd(message) {
  gameActive = false;

  const isWinner = message.winner === playerNumber;

  resultTitle.textContent = isWinner ? "🎉 Victory!" : "😢 Defeat";
  resultMessage.textContent = isWinner
    ? "You won the snowball duel!"
    : `${message.winnerName} won the duel!`;

  finalScore1.textContent = message.player1Score;
  finalScore2.textContent = message.player2Score;

  resultModal.classList.add("show");

  // Request updated stats
  ws.send(JSON.stringify({ type: "getStats" }));
}

function handleOpponentLeft(message) {
  gameActive = false;

  resultTitle.textContent = "🏆 You Win!";
  resultMessage.textContent = message.message || "Your opponent left the game.";
  finalScore1.textContent = "-";
  finalScore2.textContent = "-";

  resultModal.classList.add("show");

  // Request updated stats
  ws.send(JSON.stringify({ type: "getStats" }));
}

// ============ UI Functions ============
function showScreen(screenName) {
  Object.values(screens).forEach((screen) => screen.classList.remove("active"));
  screens[screenName].classList.add("active");
}

function updateTurnIndicator() {
  if (isMyTurn) {
    turnIndicator.textContent = "Your Turn!";
    turnIndicator.className = "turn-indicator your-turn";
    setControlsEnabled(true);
  } else {
    turnIndicator.textContent = "Opponent's Turn";
    turnIndicator.className = "turn-indicator opponent-turn";
    setControlsEnabled(false);
  }
}

function setControlsEnabled(enabled) {
  angleInput.disabled = !enabled;
  forceInput.disabled = !enabled;
  shootBtn.disabled = !enabled;
}

function showGameMessage(text, type) {
  gameMessage.textContent = text;
  gameMessage.className = `game-message show ${type}`;

  setTimeout(() => {
    hideGameMessage();
  }, 1500);
}

function hideGameMessage() {
  gameMessage.classList.remove("show");
}

// ============ Canvas Drawing ============
function drawGame() {
  // Clear canvas
  ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  // Draw background gradient (night sky)
  const gradient = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
  gradient.addColorStop(0, "#0d1b2a");
  gradient.addColorStop(0.5, "#1b263b");
  gradient.addColorStop(1, "#415a77");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  // Draw stars
  drawStars();

  // Draw moon
  drawMoon();

  // Draw mountains/hills
  drawMountains();

  // Draw ground (snow)
  ctx.fillStyle = "#e0e7ee";
  ctx.fillRect(0, CANVAS_HEIGHT - GROUND_HEIGHT, CANVAS_WIDTH, GROUND_HEIGHT);

  // Draw snow texture
  ctx.fillStyle = "#ffffff";
  for (let i = 0; i < 50; i++) {
    const x = Math.random() * CANVAS_WIDTH;
    const y = CANVAS_HEIGHT - GROUND_HEIGHT + Math.random() * GROUND_HEIGHT;
    ctx.beginPath();
    ctx.arc(x, y, 2, 0, Math.PI * 2);
    ctx.fill();
  }

  // Draw Christmas trees
  drawTree(150, CANVAS_HEIGHT - GROUND_HEIGHT);
  drawTree(650, CANVAS_HEIGHT - GROUND_HEIGHT);

  // Draw players
  drawPlayer(player1Pos.x, player1Pos.y, "#64b5f6", 1);
  drawPlayer(player2Pos.x, player2Pos.y, "#ef5350", 2);

  // Draw snowball if animating
  if (snowball) {
    ctx.beginPath();
    ctx.arc(snowball.x, snowball.y, SNOWBALL_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.strokeStyle = "#b0bec5";
    ctx.lineWidth = 2;
    ctx.stroke();

    // Snowball trail
    ctx.beginPath();
    ctx.arc(snowball.x - 5, snowball.y, 4, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
    ctx.fill();
  }
}

function drawStars() {
  ctx.fillStyle = "#ffffff";
  const stars = [
    { x: 50, y: 30, r: 1.5 },
    { x: 150, y: 50, r: 1 },
    { x: 250, y: 20, r: 2 },
    { x: 350, y: 60, r: 1 },
    { x: 450, y: 25, r: 1.5 },
    { x: 550, y: 45, r: 1 },
    { x: 650, y: 35, r: 2 },
    { x: 750, y: 55, r: 1 },
    { x: 100, y: 80, r: 1 },
    { x: 300, y: 90, r: 1.5 },
    { x: 500, y: 70, r: 1 },
    { x: 700, y: 85, r: 1.5 },
  ];

  stars.forEach((star) => {
    ctx.beginPath();
    ctx.arc(star.x, star.y, star.r, 0, Math.PI * 2);
    ctx.fill();
  });
}

function drawMoon() {
  ctx.beginPath();
  ctx.arc(700, 60, 35, 0, Math.PI * 2);
  ctx.fillStyle = "#ffd54f";
  ctx.fill();

  // Moon shadow
  ctx.beginPath();
  ctx.arc(710, 55, 30, 0, Math.PI * 2);
  ctx.fillStyle = "#0d1b2a";
  ctx.fill();
}

function drawMountains() {
  ctx.fillStyle = "#2d4a6f";

  // Mountain 1
  ctx.beginPath();
  ctx.moveTo(0, CANVAS_HEIGHT - GROUND_HEIGHT);
  ctx.lineTo(150, CANVAS_HEIGHT - GROUND_HEIGHT - 100);
  ctx.lineTo(300, CANVAS_HEIGHT - GROUND_HEIGHT);
  ctx.fill();

  // Mountain 2
  ctx.fillStyle = "#1f3651";
  ctx.beginPath();
  ctx.moveTo(200, CANVAS_HEIGHT - GROUND_HEIGHT);
  ctx.lineTo(400, CANVAS_HEIGHT - GROUND_HEIGHT - 150);
  ctx.lineTo(600, CANVAS_HEIGHT - GROUND_HEIGHT);
  ctx.fill();

  // Mountain 3
  ctx.fillStyle = "#2d4a6f";
  ctx.beginPath();
  ctx.moveTo(500, CANVAS_HEIGHT - GROUND_HEIGHT);
  ctx.lineTo(650, CANVAS_HEIGHT - GROUND_HEIGHT - 80);
  ctx.lineTo(800, CANVAS_HEIGHT - GROUND_HEIGHT);
  ctx.fill();

  // Snow caps
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.moveTo(400, CANVAS_HEIGHT - GROUND_HEIGHT - 150);
  ctx.lineTo(380, CANVAS_HEIGHT - GROUND_HEIGHT - 120);
  ctx.lineTo(420, CANVAS_HEIGHT - GROUND_HEIGHT - 120);
  ctx.fill();
}

function drawTree(x, y) {
  // Tree trunk
  ctx.fillStyle = "#5d4037";
  ctx.fillRect(x - 5, y - 20, 10, 20);

  // Tree layers
  ctx.fillStyle = "#2e7d32";

  ctx.beginPath();
  ctx.moveTo(x - 30, y - 20);
  ctx.lineTo(x, y - 60);
  ctx.lineTo(x + 30, y - 20);
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(x - 25, y - 45);
  ctx.lineTo(x, y - 80);
  ctx.lineTo(x + 25, y - 45);
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(x - 18, y - 65);
  ctx.lineTo(x, y - 95);
  ctx.lineTo(x + 18, y - 65);
  ctx.fill();

  // Star on top
  ctx.fillStyle = "#ffd54f";
  ctx.beginPath();
  ctx.arc(x, y - 95, 5, 0, Math.PI * 2);
  ctx.fill();

  // Snow on tree
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(x - 15, y - 35, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x + 10, y - 55, 4, 0, Math.PI * 2);
  ctx.fill();
}

function drawPlayer(x, y, color, playerNum) {
  // Body (snowman style)
  ctx.beginPath();
  ctx.arc(x, y, PLAYER_RADIUS, 0, Math.PI * 2);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.stroke();

  // Face
  ctx.fillStyle = "#333";

  // Eyes
  const eyeOffset = playerNum === 1 ? 5 : -5;
  ctx.beginPath();
  ctx.arc(x - 7 + eyeOffset, y - 5, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x + 7 + eyeOffset, y - 5, 3, 0, Math.PI * 2);
  ctx.fill();

  // Carrot nose
  ctx.fillStyle = "#ff9800";
  ctx.beginPath();
  if (playerNum === 1) {
    ctx.moveTo(x, y);
    ctx.lineTo(x + 15, y + 3);
    ctx.lineTo(x, y + 6);
  } else {
    ctx.moveTo(x, y);
    ctx.lineTo(x - 15, y + 3);
    ctx.lineTo(x, y + 6);
  }
  ctx.fill();

  // Hat
  ctx.fillStyle = color;
  ctx.fillRect(x - 15, y - PLAYER_RADIUS - 15, 30, 15);
  ctx.fillRect(x - 10, y - PLAYER_RADIUS - 30, 20, 15);

  // Hat pom-pom
  ctx.beginPath();
  ctx.arc(x, y - PLAYER_RADIUS - 30, 6, 0, Math.PI * 2);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
}

// ============ Animation ============
function animateSnowball(trajectory, fromLeft, onComplete) {
  if (currentAnimation) {
    cancelAnimationFrame(currentAnimation);
  }

  trajectoryIndex = 0;

  function animate() {
    if (trajectoryIndex >= trajectory.length) {
      snowball = null;
      drawGame();
      if (onComplete) onComplete();
      return;
    }

    snowball = trajectory[trajectoryIndex];
    trajectoryIndex++;

    drawGame();

    currentAnimation = requestAnimationFrame(animate);
  }

  animate();
}

// ============ Event Listeners ============

// Auth tabs
tabBtns.forEach((btn) => {
  btn.addEventListener("click", () => {
    tabBtns.forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");

    const tab = btn.dataset.tab;
    loginForm.classList.toggle("active", tab === "login");
    registerForm.classList.toggle("active", tab === "register");

    // Clear messages
    loginError.textContent = "";
    registerError.textContent = "";
    registerSuccess.textContent = "";
  });
});

// Login form
loginForm.addEventListener("submit", (e) => {
  e.preventDefault();
  ws.send(
    JSON.stringify({
      type: "login",
      username: loginUsername.value.trim(),
      password: loginPassword.value,
    })
  );
});

// Register form
registerForm.addEventListener("submit", (e) => {
  e.preventDefault();

  if (registerPassword.value !== registerConfirm.value) {
    registerError.textContent = "Passwords do not match";
    return;
  }

  ws.send(
    JSON.stringify({
      type: "register",
      username: registerUsername.value.trim(),
      password: registerPassword.value,
    })
  );
});

// Lobby buttons
findGameBtn.addEventListener("click", () => {
  ws.send(JSON.stringify({ type: "findGame" }));
});

cancelSearchBtn.addEventListener("click", () => {
  ws.send(JSON.stringify({ type: "cancelSearch" }));
});

logoutBtn.addEventListener("click", () => {
  ws.send(JSON.stringify({ type: "logout" }));
});

// Game controls
angleInput.addEventListener("input", () => {
  angleValue.textContent = `${angleInput.value}°`;
});

forceInput.addEventListener("input", () => {
  forceValue.textContent = forceInput.value;
});

shootBtn.addEventListener("click", () => {
  if (!isMyTurn || !gameActive) return;

  ws.send(
    JSON.stringify({
      type: "shoot",
      angle: parseInt(angleInput.value),
      force: parseInt(forceInput.value),
    })
  );
});

// Play again button
playAgainBtn.addEventListener("click", () => {
  resultModal.classList.remove("show");
  showScreen("lobby");
});

// ============ Initialize ============
connectWebSocket();

// Initial draw
drawGame();
