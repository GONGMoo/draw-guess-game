const socket = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}`);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/service-worker.js").catch(() => {});
  });
}

const state = {
  playerId: "",
  room: null,
  isDrawing: false,
  lastPoint: null,
  timerId: null
};

const lobby = document.querySelector("#lobby");
const game = document.querySelector("#game");
const statusText = document.querySelector("#statusText");
const roomCode = document.querySelector("#roomCode");
const nameInput = document.querySelector("#nameInput");
const wordBankSelect = document.querySelector("#wordBankSelect");
const joinInput = document.querySelector("#joinInput");
const createBtn = document.querySelector("#createBtn");
const joinBtn = document.querySelector("#joinBtn");
const playersEl = document.querySelector("#players");
const messagesEl = document.querySelector("#messages");
const roleLabel = document.querySelector("#roleLabel");
const answerLabel = document.querySelector("#answerLabel");
const timerLabel = document.querySelector("#timerLabel");
const wordBankLabel = document.querySelector("#wordBankLabel");
const guessForm = document.querySelector("#guessForm");
const guessInput = document.querySelector("#guessInput");
const clearBtn = document.querySelector("#clearBtn");
const colorInput = document.querySelector("#colorInput");
const sizeInput = document.querySelector("#sizeInput");
const canvas = document.querySelector("#board");
const ctx = canvas.getContext("2d");

ctx.lineCap = "round";
ctx.lineJoin = "round";

socket.addEventListener("message", event => {
  const message = JSON.parse(event.data);
  const { type, payload } = message;

  if (type === "welcome") {
    state.playerId = payload.playerId;
  }

  if (type === "room-updated") {
    state.room = payload;
    renderRoom();
    redraw(payload.strokes || []);
  }

  if (type === "draw") {
    drawLine(payload);
  }

  if (type === "clear-canvas") {
    clearCanvas();
  }

  if (type === "chat") {
    addMessage(`${payload.name}: ${payload.text}`, payload.correct);
  }

  if (type === "round-over") {
    addMessage(payload.winnerId ? `猜对了！答案是：${payload.answer}` : `时间到！答案是：${payload.answer}`, true);
  }

  if (type === "player-left") {
    addMessage("对方已离开，等待新的玩家加入。");
  }

  if (type === "error") {
    addMessage(payload.message);
    statusText.textContent = payload.message;
  }
});

createBtn.addEventListener("click", () => {
  send("create-room", { name: nameInput.value, wordBank: wordBankSelect.value });
});

joinBtn.addEventListener("click", () => {
  send("join-room", { name: nameInput.value, roomId: joinInput.value });
});

guessForm.addEventListener("submit", event => {
  event.preventDefault();
  const text = guessInput.value.trim();
  if (!text) return;
  send("guess", { text });
  guessInput.value = "";
});

clearBtn.addEventListener("click", () => {
  send("clear-canvas", {});
});

canvas.addEventListener("pointerdown", event => {
  if (!canDraw()) return;
  canvas.setPointerCapture(event.pointerId);
  state.isDrawing = true;
  state.lastPoint = getPoint(event);
});

canvas.addEventListener("pointermove", event => {
  if (!state.isDrawing || !canDraw()) return;
  const point = getPoint(event);
  const line = {
    from: state.lastPoint,
    to: point,
    color: colorInput.value,
    width: Number(sizeInput.value)
  };
  drawLine(line);
  send("draw", line);
  state.lastPoint = point;
});

canvas.addEventListener("pointerup", stopDrawing);
canvas.addEventListener("pointercancel", stopDrawing);
window.addEventListener("resize", () => redraw(state.room?.strokes || []));

function send(type, payload) {
  if (socket.readyState !== WebSocket.OPEN) {
    statusText.textContent = "连接还没准备好，请稍等。";
    return;
  }
  socket.send(JSON.stringify({ type, payload }));
}

function renderRoom() {
  const room = state.room;
  lobby.classList.add("hidden");
  game.classList.remove("hidden");
  roomCode.textContent = room.roomId;

  const drawer = room.players.find(player => player.id === room.drawerId);
  statusText.textContent = room.players.length < 2
    ? "把房间号发给朋友，等对方加入。"
    : `${drawer?.name || "玩家"} 正在画，第 ${room.round} 轮。`;

  roleLabel.textContent = room.isDrawer ? "你来画" : "你来猜";
  answerLabel.textContent = room.answer || "猜一猜";
  wordBankLabel.textContent = room.wordBankLabel || "日常";
  guessInput.disabled = room.isDrawer || room.status !== "playing";
  clearBtn.disabled = !room.isDrawer || room.status !== "playing";
  colorInput.disabled = !room.isDrawer;
  sizeInput.disabled = !room.isDrawer;

  playersEl.innerHTML = room.players.map(player => `
    <div class="player ${player.id === room.drawerId ? "active" : ""}">
      <span>${escapeHtml(player.name)}${player.id === state.playerId ? "（你）" : ""}</span>
      <strong>${player.score}</strong>
    </div>
  `).join("");

  updateTimer();
  clearInterval(state.timerId);
  state.timerId = setInterval(updateTimer, 500);
}

function updateTimer() {
  if (!state.room?.endsAt) {
    timerLabel.textContent = "--";
    return;
  }
  const left = Math.max(0, Math.ceil((state.room.endsAt - Date.now()) / 1000));
  timerLabel.textContent = left;
}

function getPoint(event) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: ((event.clientX - rect.left) / rect.width) * canvas.width,
    y: ((event.clientY - rect.top) / rect.height) * canvas.height
  };
}

function drawLine(line) {
  ctx.strokeStyle = line.color;
  ctx.lineWidth = line.width;
  ctx.beginPath();
  ctx.moveTo(line.from.x, line.from.y);
  ctx.lineTo(line.to.x, line.to.y);
  ctx.stroke();
}

function redraw(strokes) {
  clearCanvas();
  strokes.forEach(drawLine);
}

function clearCanvas() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
}

function canDraw() {
  return state.room?.isDrawer && state.room?.status === "playing";
}

function stopDrawing() {
  state.isDrawing = false;
  state.lastPoint = null;
}

function addMessage(text, correct = false) {
  const message = document.createElement("div");
  message.className = `message ${correct ? "correct" : ""}`;
  message.textContent = text;
  messagesEl.appendChild(message);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#039;"
  })[char]);
}
