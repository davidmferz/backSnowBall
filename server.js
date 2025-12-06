/**
 * Snowball Duel - Server
 * Node.js + WebSocket Server with Login System
 */

const http = require("http");
const fs = require("fs");
const path = require("path");
const WebSocket = require("ws");

// ============ Configuration ============
const PORT = 3000;
const GRAVITY = 9.8; // Standard gravity
const TIME_STEP = 0.016; // ~60fps for smooth animation
const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 400;
const PLAYER_RADIUS = 25;
const SNOWBALL_RADIUS = 8;
const FORCE_MULTIPLIER = 8; // Strong multiplier so 100 force reaches across the map
const GRAVITY_SCALE = 15; // Scale factor for gravity effect

// ============ Data Storage (In-Memory) ============
const users = new Map(); // username -> { password, wins, losses, gamesPlayed }
const activeSessions = new Map(); // sessionId -> username

// ============ Game State ============
let waitingPlayer = null;
const games = new Map(); // gameId -> { player1, player2, currentTurn, ... }

// ============ HTTP Server ============
const server = http.createServer((req, res) => {
  let filePath = req.url === "/" ? "/index.html" : req.url;
  filePath = path.join(__dirname, "public", filePath);

  const extname = path.extname(filePath);
  const contentTypes = {
    ".html": "text/html",
    ".css": "text/css",
    ".js": "application/javascript",
  };

  const contentType = contentTypes[extname] || "text/plain";

  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404);
      res.end("File not found");
    } else {
      res.writeHead(200, { "Content-Type": contentType });
      res.end(content);
    }
  });
});

// ============ WebSocket Server ============
const wss = new WebSocket.Server({ server });

// Generate unique IDs
function generateId() {
  return Math.random().toString(36).substring(2, 15);
}

// Calculate snowball trajectory and check for hit
function calculateTrajectory(angle, force, fromLeft) {
  const trajectory = [];
  const radians = (angle * Math.PI) / 180;

  // Starting position (player positions)
  const startX = fromLeft ? 80 : CANVAS_WIDTH - 80;
  const startY = CANVAS_HEIGHT - 60;

  // Initial velocity with force multiplier for better reach
  // Force 100 with angle 45° should easily reach the other side
  const actualForce = force * FORCE_MULTIPLIER;
  const vx = Math.cos(radians) * actualForce * (fromLeft ? 1 : -1);
  const vy = -Math.sin(radians) * actualForce;

  let x = startX;
  let y = startY;
  let t = 0;
  const maxIterations = 500; // Prevent infinite loops
  let iterations = 0;

  // Calculate trajectory points
  while (
    y <= CANVAS_HEIGHT &&
    x >= 0 &&
    x <= CANVAS_WIDTH &&
    iterations < maxIterations
  ) {
    trajectory.push({ x: Math.round(x), y: Math.round(y), t });
    t += TIME_STEP;
    x = startX + vx * t;
    // Physics formula: y = y0 + vy*t + 0.5*g*t² (scaled for game feel)
    y = startY + vy * t + 0.5 * GRAVITY * GRAVITY_SCALE * t * t;
    iterations++;
  }

  return trajectory;
}

// Check if snowball hits target
function checkHit(trajectory, targetX, targetY) {
  for (const point of trajectory) {
    const dx = point.x - targetX;
    const dy = point.y - targetY;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance < PLAYER_RADIUS + SNOWBALL_RADIUS) {
      return { hit: true, hitPoint: point };
    }
  }
  return { hit: false, hitPoint: null };
}

// Handle WebSocket connections
wss.on("connection", (ws) => {
  ws.id = generateId();
  ws.isAlive = true;
  ws.sessionId = null;
  ws.username = null;
  ws.gameId = null;

  console.log(`Client connected: ${ws.id}`);

  ws.on("message", (data) => {
    try {
      const message = JSON.parse(data);
      handleMessage(ws, message);
    } catch (e) {
      console.error("Error parsing message:", e);
    }
  });

  ws.on("close", () => {
    console.log(`Client disconnected: ${ws.id}`);
    handleDisconnect(ws);
  });

  ws.on("pong", () => {
    ws.isAlive = true;
  });
});

// Handle incoming messages
function handleMessage(ws, message) {
  switch (message.type) {
    case "register":
      handleRegister(ws, message);
      break;
    case "login":
      handleLogin(ws, message);
      break;
    case "logout":
      handleLogout(ws);
      break;
    case "getStats":
      handleGetStats(ws);
      break;
    case "findGame":
      handleFindGame(ws);
      break;
    case "cancelSearch":
      handleCancelSearch(ws);
      break;
    case "shoot":
      handleShoot(ws, message);
      break;
  }
}

// ============ Auth Handlers ============
function handleRegister(ws, message) {
  const { username, password } = message;

  if (!username || !password) {
    ws.send(
      JSON.stringify({
        type: "registerResult",
        success: false,
        error: "Username and password required",
      })
    );
    return;
  }

  if (username.length < 3 || username.length > 15) {
    ws.send(
      JSON.stringify({
        type: "registerResult",
        success: false,
        error: "Username must be 3-15 characters",
      })
    );
    return;
  }

  if (password.length < 4) {
    ws.send(
      JSON.stringify({
        type: "registerResult",
        success: false,
        error: "Password must be at least 4 characters",
      })
    );
    return;
  }

  if (users.has(username)) {
    ws.send(
      JSON.stringify({
        type: "registerResult",
        success: false,
        error: "Username already exists",
      })
    );
    return;
  }

  users.set(username, {
    password,
    wins: 0,
    losses: 0,
    gamesPlayed: 0,
  });

  console.log(`User registered: ${username}`);
  ws.send(JSON.stringify({ type: "registerResult", success: true }));
}

function handleLogin(ws, message) {
  const { username, password } = message;

  if (!username || !password) {
    ws.send(
      JSON.stringify({
        type: "loginResult",
        success: false,
        error: "Username and password required",
      })
    );
    return;
  }

  const user = users.get(username);

  if (!user || user.password !== password) {
    ws.send(
      JSON.stringify({
        type: "loginResult",
        success: false,
        error: "Invalid credentials",
      })
    );
    return;
  }

  // Check if already logged in elsewhere
  for (const [sessionId, uname] of activeSessions) {
    if (uname === username) {
      activeSessions.delete(sessionId);
    }
  }

  const sessionId = generateId();
  activeSessions.set(sessionId, username);
  ws.sessionId = sessionId;
  ws.username = username;

  console.log(`User logged in: ${username}`);

  ws.send(
    JSON.stringify({
      type: "loginResult",
      success: true,
      username,
      stats: {
        wins: user.wins,
        losses: user.losses,
        gamesPlayed: user.gamesPlayed,
      },
    })
  );
}

function handleLogout(ws) {
  if (ws.sessionId) {
    activeSessions.delete(ws.sessionId);
  }

  // Leave current game if any
  if (ws.gameId) {
    const game = games.get(ws.gameId);
    if (game) {
      const opponent = game.player1.ws === ws ? game.player2 : game.player1;
      if (opponent && opponent.ws.readyState === WebSocket.OPEN) {
        opponent.ws.send(JSON.stringify({ type: "opponentLeft" }));
        opponent.ws.gameId = null;
      }
      games.delete(ws.gameId);
    }
  }

  // Remove from waiting queue
  if (waitingPlayer === ws) {
    waitingPlayer = null;
  }

  ws.sessionId = null;
  ws.username = null;
  ws.gameId = null;

  ws.send(JSON.stringify({ type: "logoutResult", success: true }));
}

function handleGetStats(ws) {
  if (!ws.username) {
    ws.send(
      JSON.stringify({
        type: "statsResult",
        success: false,
        error: "Not logged in",
      })
    );
    return;
  }

  const user = users.get(ws.username);
  ws.send(
    JSON.stringify({
      type: "statsResult",
      success: true,
      stats: {
        wins: user.wins,
        losses: user.losses,
        gamesPlayed: user.gamesPlayed,
      },
    })
  );
}

// ============ Game Handlers ============
function handleFindGame(ws) {
  if (!ws.username) {
    ws.send(
      JSON.stringify({ type: "error", message: "Must be logged in to play" })
    );
    return;
  }

  if (ws.gameId) {
    ws.send(JSON.stringify({ type: "error", message: "Already in a game" }));
    return;
  }

  if (waitingPlayer === null) {
    waitingPlayer = ws;
    ws.send(
      JSON.stringify({ type: "waiting", message: "Waiting for opponent..." })
    );
    console.log(`${ws.username} is waiting for opponent`);
  } else if (waitingPlayer !== ws) {
    // Match found!
    const gameId = generateId();
    const player1 = waitingPlayer;
    const player2 = ws;

    const game = {
      id: gameId,
      player1: {
        ws: player1,
        username: player1.username,
        x: 80,
        y: CANVAS_HEIGHT - 60,
        score: 0,
      },
      player2: {
        ws: player2,
        username: player2.username,
        x: CANVAS_WIDTH - 80,
        y: CANVAS_HEIGHT - 60,
        score: 0,
      },
      currentTurn: 1,
      round: 1,
      maxRounds: 3,
    };

    games.set(gameId, game);
    player1.gameId = gameId;
    player2.gameId = gameId;
    waitingPlayer = null;

    console.log(`Game started: ${player1.username} vs ${player2.username}`);

    // Notify both players
    player1.send(
      JSON.stringify({
        type: "gameStart",
        gameId,
        playerNumber: 1,
        opponent: player2.username,
        yourTurn: true,
        player1Pos: { x: game.player1.x, y: game.player1.y },
        player2Pos: { x: game.player2.x, y: game.player2.y },
      })
    );

    player2.send(
      JSON.stringify({
        type: "gameStart",
        gameId,
        playerNumber: 2,
        opponent: player1.username,
        yourTurn: false,
        player1Pos: { x: game.player1.x, y: game.player1.y },
        player2Pos: { x: game.player2.x, y: game.player2.y },
      })
    );
  }
}

function handleCancelSearch(ws) {
  if (waitingPlayer === ws) {
    waitingPlayer = null;
    ws.send(JSON.stringify({ type: "searchCancelled" }));
  }
}

function handleShoot(ws, message) {
  const game = games.get(ws.gameId);

  if (!game) {
    ws.send(JSON.stringify({ type: "error", message: "Not in a game" }));
    return;
  }

  const playerNumber = game.player1.ws === ws ? 1 : 2;

  if (game.currentTurn !== playerNumber) {
    ws.send(JSON.stringify({ type: "error", message: "Not your turn" }));
    return;
  }

  const { angle, force } = message;
  const clampedAngle = Math.max(0, Math.min(90, angle));
  const clampedForce = Math.max(10, Math.min(100, force));

  const fromLeft = playerNumber === 1;
  const trajectory = calculateTrajectory(clampedAngle, clampedForce, fromLeft);

  // Determine target
  const target = playerNumber === 1 ? game.player2 : game.player1;
  const hitResult = checkHit(trajectory, target.x, target.y);

  // Prepare shot data
  const shotData = {
    type: "shot",
    shooter: playerNumber,
    trajectory,
    hit: hitResult.hit,
    hitPoint: hitResult.hitPoint,
  };

  // Send to both players
  game.player1.ws.send(JSON.stringify(shotData));
  game.player2.ws.send(JSON.stringify(shotData));

  // Process result after animation
  setTimeout(() => {
    if (hitResult.hit) {
      // Update score
      if (playerNumber === 1) {
        game.player1.score++;
      } else {
        game.player2.score++;
      }

      const roundResult = {
        type: "roundEnd",
        winner: playerNumber,
        player1Score: game.player1.score,
        player2Score: game.player2.score,
        round: game.round,
      };

      game.player1.ws.send(JSON.stringify(roundResult));
      game.player2.ws.send(JSON.stringify(roundResult));

      // Check for game winner
      const winsNeeded = Math.ceil(game.maxRounds / 2);
      if (
        game.player1.score >= winsNeeded ||
        game.player2.score >= winsNeeded
      ) {
        const gameWinner = game.player1.score >= winsNeeded ? 1 : 2;

        // Update user stats
        const winnerUser = users.get(
          gameWinner === 1 ? game.player1.username : game.player2.username
        );
        const loserUser = users.get(
          gameWinner === 1 ? game.player2.username : game.player1.username
        );

        if (winnerUser) {
          winnerUser.wins++;
          winnerUser.gamesPlayed++;
        }
        if (loserUser) {
          loserUser.losses++;
          loserUser.gamesPlayed++;
        }

        const gameEndData = {
          type: "gameEnd",
          winner: gameWinner,
          winnerName:
            gameWinner === 1 ? game.player1.username : game.player2.username,
          player1Score: game.player1.score,
          player2Score: game.player2.score,
        };

        game.player1.ws.send(JSON.stringify(gameEndData));
        game.player2.ws.send(JSON.stringify(gameEndData));

        // Clean up
        game.player1.ws.gameId = null;
        game.player2.ws.gameId = null;
        games.delete(game.id);

        console.log(
          `Game ended: ${game.player1.username} ${game.player1.score} - ${game.player2.score} ${game.player2.username}`
        );
      } else {
        // Next round
        game.round++;
        game.currentTurn = game.round % 2 === 1 ? 1 : 2;

        setTimeout(() => {
          const newRoundData = {
            type: "newRound",
            round: game.round,
            currentTurn: game.currentTurn,
          };
          game.player1.ws.send(JSON.stringify(newRoundData));
          game.player2.ws.send(JSON.stringify(newRoundData));
        }, 1500);
      }
    } else {
      // Miss - switch turns
      game.currentTurn = playerNumber === 1 ? 2 : 1;

      const turnSwitch = {
        type: "turnSwitch",
        currentTurn: game.currentTurn,
      };

      game.player1.ws.send(JSON.stringify(turnSwitch));
      game.player2.ws.send(JSON.stringify(turnSwitch));
    }
  }, trajectory.length * 20 + 500);
}

function handleDisconnect(ws) {
  // Handle logout on disconnect
  if (ws.sessionId) {
    activeSessions.delete(ws.sessionId);
  }

  // Remove from waiting queue
  if (waitingPlayer === ws) {
    waitingPlayer = null;
  }

  // Handle active game
  if (ws.gameId) {
    const game = games.get(ws.gameId);
    if (game) {
      const opponent = game.player1.ws === ws ? game.player2 : game.player1;
      if (opponent && opponent.ws.readyState === WebSocket.OPEN) {
        // Award win to remaining player
        const opponentUser = users.get(opponent.username);
        const disconnectedUser = users.get(ws.username);

        if (opponentUser) {
          opponentUser.wins++;
          opponentUser.gamesPlayed++;
        }
        if (disconnectedUser) {
          disconnectedUser.losses++;
          disconnectedUser.gamesPlayed++;
        }

        opponent.ws.send(
          JSON.stringify({
            type: "opponentDisconnected",
            message: "Opponent disconnected. You win!",
          })
        );
        opponent.ws.gameId = null;
      }
      games.delete(ws.gameId);
    }
  }
}

// Heartbeat to detect broken connections
setInterval(() => {
  wss.clients.forEach((ws) => {
    if (!ws.isAlive) {
      return ws.terminate();
    }
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

// ============ Start Server ============
server.listen(PORT, () => {
  console.log(`\n❄️  Snowball Duel Server running on http://localhost:${PORT}`);
  console.log("Open this URL in two browser tabs to play!\n");
});
