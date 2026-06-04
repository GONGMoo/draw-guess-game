const http = require("http");
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");

const PORT = Number(process.env.PORT || 3000);
const PUBLIC_DIR = path.join(__dirname, "public");
const CLASSIC_ROUND_MS = 90_000;
const RELAY_STEP_MS = 60_000;
const MAX_RELAY_PLAYERS = 6;
const WORD_BANKS = {
  daily: {
    label: "日常",
    words: [
      "雨伞", "书包", "钥匙", "手机", "牙刷", "闹钟", "眼镜", "拖鞋", "电梯", "台灯",
      "水杯", "枕头", "毛巾", "镜子", "钱包", "耳机", "日历", "窗帘", "垃圾桶", "洗衣机",
      "冰箱", "空调", "遥控器", "纸巾", "梳子", "风扇", "门铃", "衣架", "被子", "筷子",
      "勺子", "铅笔", "橡皮", "尺子", "地图", "报纸", "雨靴", "手表", "帽子", "口罩"
    ]
  },
  animals: {
    label: "动物",
    words: [
      "猫头鹰", "熊猫", "长颈鹿", "企鹅", "海豚", "兔子", "狮子", "章鱼", "蝴蝶", "袋鼠",
      "老虎", "大象", "斑马", "猴子", "狐狸", "松鼠", "乌龟", "鲸鱼", "鲨鱼", "海马",
      "孔雀", "鹦鹉", "骆驼", "河马", "犀牛", "刺猬", "考拉", "鹿", "青蛙", "蜗牛",
      "蜜蜂", "蚂蚁", "螃蟹", "海星", "水母", "天鹅", "鸽子", "公鸡", "小狗", "小猫"
    ]
  },
  food: {
    label: "食物",
    words: [
      "苹果", "火锅", "披萨", "冰淇淋", "汉堡", "饺子", "蛋糕", "西瓜", "面条", "寿司",
      "香蕉", "草莓", "葡萄", "橙子", "桃子", "菠萝", "玉米", "土豆", "番茄", "胡萝卜",
      "鸡蛋", "牛奶", "面包", "包子", "粽子", "汤圆", "烤鸭", "米饭", "薯条", "热狗",
      "三明治", "巧克力", "棒棒糖", "爆米花", "咖啡", "奶茶", "豆腐", "南瓜", "蘑菇", "煎饼"
    ]
  },
  objects: {
    label: "物品",
    words: [
      "自行车", "电脑", "飞机", "篮球", "吉他", "相机", "沙发", "剪刀", "蜡烛", "机器人",
      "汽车", "火车", "轮船", "滑板", "足球", "排球", "羽毛球", "乒乓球", "钢琴", "小提琴",
      "电视", "音箱", "麦克风", "键盘", "鼠标", "打印机", "帐篷", "手电筒", "锤子", "螺丝刀",
      "梯子", "水壶", "花盆", "钟表", "台阶", "信封", "邮票", "礼物", "皇冠", "气球"
    ]
  }
};
const WORD_BANK_OPTIONS = Object.entries(WORD_BANKS).map(([id, bank]) => ({ id, label: bank.label }));
const MIXED_WORDS = Object.values(WORD_BANKS).flatMap(bank => bank.words);

const clients = new Map();
const rooms = new Map();

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".svg": "image/svg+xml; charset=utf-8"
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname === "/healthz") {
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  const requestedPath = url.pathname === "/" ? "/index.html" : url.pathname;
  const filePath = path.normalize(path.join(PUBLIC_DIR, requestedPath));

  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }

    res.writeHead(200, { "Content-Type": mimeTypes[path.extname(filePath)] || "application/octet-stream" });
    res.end(content);
  });
});

server.on("upgrade", (req, socket) => {
  if (req.headers.upgrade !== "websocket") {
    socket.destroy();
    return;
  }

  const acceptKey = crypto
    .createHash("sha1")
    .update(`${req.headers["sec-websocket-key"]}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
    .digest("base64");

  socket.write([
    "HTTP/1.1 101 Switching Protocols",
    "Upgrade: websocket",
    "Connection: Upgrade",
    `Sec-WebSocket-Accept: ${acceptKey}`,
    "",
    ""
  ].join("\r\n"));

  const client = {
    id: crypto.randomUUID(),
    name: "玩家",
    roomId: null,
    socket,
    buffer: Buffer.alloc(0)
  };

  clients.set(client.id, client);
  socket.on("data", chunk => handleSocketData(client, chunk));
  socket.on("close", () => handleDisconnect(client));
  socket.on("error", () => handleDisconnect(client));

  send(client, "welcome", { playerId: client.id });
});

function handleSocketData(client, chunk) {
  client.buffer = Buffer.concat([client.buffer, chunk]);

  while (client.buffer.length >= 2) {
    const secondByte = client.buffer[1];
    let offset = 2;
    let payloadLength = secondByte & 0x7f;

    if (payloadLength === 126) {
      if (client.buffer.length < offset + 2) return;
      payloadLength = client.buffer.readUInt16BE(offset);
      offset += 2;
    } else if (payloadLength === 127) {
      closeClient(client);
      return;
    }

    const masked = (secondByte & 0x80) !== 0;
    const maskLength = masked ? 4 : 0;
    const frameLength = offset + maskLength + payloadLength;

    if (client.buffer.length < frameLength) return;

    const opcode = client.buffer[0] & 0x0f;
    const mask = masked ? client.buffer.subarray(offset, offset + 4) : null;
    offset += maskLength;

    const payload = client.buffer.subarray(offset, offset + payloadLength);
    client.buffer = client.buffer.subarray(frameLength);

    if (opcode === 8) {
      closeClient(client);
      return;
    }

    if (opcode !== 1) continue;

    const decoded = Buffer.alloc(payload.length);
    for (let index = 0; index < payload.length; index += 1) {
      decoded[index] = masked ? payload[index] ^ mask[index % 4] : payload[index];
    }

    try {
      const message = JSON.parse(decoded.toString("utf8"));
      handleMessage(client, message);
    } catch {
      send(client, "error", { message: "消息格式错误" });
    }
  }
}

function handleMessage(client, message) {
  const { type, payload = {} } = message;

  if (type === "create-room") {
    client.name = cleanName(payload.name);
    const roomId = makeRoomId();
    const room = createRoom(roomId, client, payload.wordBank, payload.mode);
    rooms.set(roomId, room);
    client.roomId = roomId;
    emitRoom(room, "room-updated", serializeRoom(room, client.id));
    return;
  }

  if (type === "join-room") {
    client.name = cleanName(payload.name);
    const roomId = String(payload.roomId || "").trim();
    const room = rooms.get(roomId);

    if (!room) {
      send(client, "error", { message: "房间不存在" });
      return;
    }

    if (room.mode === "relay" && room.status !== "waiting" && !room.players.includes(client.id)) {
      send(client, "error", { message: "接龙已经开始，请等下一轮" });
      return;
    }

    if (room.players.length >= getMaxPlayers(room) && !room.players.includes(client.id)) {
      send(client, "error", { message: "房间已满" });
      return;
    }

    leaveRoom(client);
    room.players.push(client.id);
    room.scores[client.id] = room.scores[client.id] || 0;
    client.roomId = roomId;

    if (room.mode === "classic" && room.players.length === 2 && room.status === "waiting") {
      startRound(room);
    }

    emitRoomState(room);
    return;
  }

  const room = rooms.get(client.roomId);
  if (!room) {
    send(client, "error", { message: "请先创建或加入房间" });
    return;
  }

  if (type === "start-round") {
    if (room.players.length < 2) {
      send(client, "error", { message: "需要两名玩家才能开始" });
      return;
    }
    if (room.mode === "relay") {
      if (client.id !== room.ownerId) {
        send(client, "error", { message: "只有房主可以开始接龙" });
        return;
      }
      startRelayRound(room);
      emitRoomState(room);
      return;
    }
    startRound(room);
    emitRoomState(room);
    return;
  }

  if (type === "draw") {
    if (room.mode !== "classic") return;
    if (room.drawerId !== client.id || room.status !== "playing") return;
    room.strokes.push(payload);
    broadcast(room, client.id, "draw", payload);
    return;
  }

  if (type === "clear-canvas") {
    if (room.mode !== "classic") return;
    if (room.drawerId !== client.id || room.status !== "playing") return;
    room.strokes = [];
    emitRoom(room, "clear-canvas", {});
    return;
  }

  if (type === "guess") {
    handleGuess(room, client, String(payload.text || ""));
    return;
  }

  if (type === "relay-submit") {
    handleRelaySubmit(room, client, payload);
  }
}

function createRoom(roomId, owner, wordBank, mode) {
  return {
    id: roomId,
    ownerId: owner.id,
    mode: getMode(mode),
    players: [owner.id],
    scores: { [owner.id]: 0 },
    status: "waiting",
    drawerId: owner.id,
    wordBank: getWordBankId(wordBank),
    answer: "",
    round: 0,
    strokes: [],
    usedWords: [],
    relay: null,
    timer: null,
    endsAt: null
  };
}

function startRound(room) {
  clearTimeout(room.timer);
  room.round += 1;
  room.status = "playing";
  room.answer = pickWord(room);
  room.drawerId = room.players[room.round % 2];
  room.strokes = [];
  room.endsAt = Date.now() + CLASSIC_ROUND_MS;
  room.timer = setTimeout(() => finishRound(room, null), CLASSIC_ROUND_MS);
}

function handleGuess(room, client, rawText) {
  if (room.mode !== "classic") return;
  const text = rawText.trim();
  if (!text || room.status !== "playing" || client.id === room.drawerId) return;

  emitRoom(room, "chat", {
    playerId: client.id,
    name: client.name,
    text,
    correct: text === room.answer
  });

  if (text === room.answer) {
    room.scores[client.id] = (room.scores[client.id] || 0) + 1;
    finishRound(room, client.id);
  }
}

function finishRound(room, winnerId) {
  if (room.status !== "playing") return;
  clearTimeout(room.timer);
  room.status = "round-over";
  room.endsAt = null;

  emitRoom(room, "round-over", {
    answer: room.answer,
    winnerId,
    scores: room.scores
  });

  setTimeout(() => {
    if (rooms.has(room.id) && room.players.length === 2) {
      startRound(room);
      emitRoomState(room);
    }
  }, 3500);
}

function emitRoomState(room) {
  room.players.forEach(playerId => {
    const client = clients.get(playerId);
    if (client) send(client, "room-updated", serializeRoom(room, playerId));
  });
}

function serializeRoom(room, viewerId) {
  return {
    roomId: room.id,
    playerId: viewerId,
    ownerId: room.ownerId,
    isOwner: room.ownerId === viewerId,
    mode: room.mode,
    maxPlayers: getMaxPlayers(room),
    players: room.players.map(playerId => ({
      id: playerId,
      name: clients.get(playerId)?.name || "离线玩家",
      score: room.scores[playerId] || 0
    })),
    status: room.status,
    round: room.round,
    wordBank: room.wordBank,
    wordBankLabel: getWordBankLabel(room.wordBank),
    wordBankOptions: WORD_BANK_OPTIONS,
    drawerId: room.drawerId,
    isDrawer: room.drawerId === viewerId,
    answer: room.drawerId === viewerId || room.status === "round-over" ? room.answer : null,
    strokes: room.strokes,
    endsAt: room.endsAt,
    relay: serializeRelay(room, viewerId)
  };
}

function leaveRoom(client) {
  const room = rooms.get(client.roomId);
  if (!room) return;

  room.players = room.players.filter(playerId => playerId !== client.id);
  delete room.scores[client.id];
  clearTimeout(room.timer);

  if (room.players.length === 0) {
    rooms.delete(room.id);
  } else {
    room.status = "waiting";
    room.drawerId = room.players[0];
    room.answer = "";
    room.strokes = [];
    room.usedWords = [];
    room.relay = null;
    room.endsAt = null;
    emitRoom(room, "player-left", { playerId: client.id });
    emitRoomState(room);
  }
}

function handleDisconnect(client) {
  if (!clients.has(client.id)) return;
  leaveRoom(client);
  clients.delete(client.id);
  closeClient(client);
}

function emitRoom(room, type, payload) {
  room.players.forEach(playerId => {
    const client = clients.get(playerId);
    if (client) send(client, type, payload);
  });
}

function broadcast(room, senderId, type, payload) {
  room.players.forEach(playerId => {
    if (playerId === senderId) return;
    const client = clients.get(playerId);
    if (client) send(client, type, payload);
  });
}

function send(client, type, payload) {
  if (client.socket.destroyed) return;
  const data = Buffer.from(JSON.stringify({ type, payload }), "utf8");
  const header = data.length < 126
    ? Buffer.from([0x81, data.length])
    : Buffer.from([0x81, 126, data.length >> 8, data.length & 0xff]);
  client.socket.write(Buffer.concat([header, data]));
}

function closeClient(client) {
  if (!client.socket.destroyed) client.socket.destroy();
}

function makeRoomId() {
  let roomId;
  do {
    roomId = String(Math.floor(1000 + Math.random() * 9000));
  } while (rooms.has(roomId));
  return roomId;
}

function cleanName(name) {
  const text = String(name || "").trim();
  return text.slice(0, 12) || "玩家";
}

function getWordBankId(wordBank) {
  const id = String(wordBank || "").trim();
  return id === "mixed" || WORD_BANKS[id] ? id : "daily";
}

function getWordBankLabel(wordBank) {
  return wordBank === "mixed" ? "混合" : WORD_BANKS[wordBank]?.label || WORD_BANKS.daily.label;
}

function getMode(mode) {
  return mode === "relay" ? "relay" : "classic";
}

function getMaxPlayers(room) {
  return room.mode === "relay" ? MAX_RELAY_PLAYERS : 2;
}

function pickWord(room) {
  const words = room.wordBank === "mixed" ? MIXED_WORDS : WORD_BANKS[room.wordBank]?.words || WORD_BANKS.daily.words;
  const usedWords = new Set(room.usedWords);
  let availableWords = words.filter(word => !usedWords.has(word));

  if (availableWords.length === 0) {
    room.usedWords = [];
    availableWords = words;
  }

  const word = availableWords[Math.floor(Math.random() * availableWords.length)];
  room.usedWords.push(word);
  return word;
}

function startRelayRound(room) {
  clearTimeout(room.timer);
  room.round += 1;
  room.status = "relay-playing";
  room.drawerId = null;
  room.answer = "";
  room.strokes = [];
  room.endsAt = Date.now() + RELAY_STEP_MS;
  room.relay = {
    step: 0,
    totalSteps: room.players.length,
    submissions: {},
    results: null,
    chains: room.players.map(playerId => ({
      originPlayerId: playerId,
      originalWord: pickWord(room),
      items: []
    }))
  };
  room.timer = setTimeout(() => advanceRelayStep(room), RELAY_STEP_MS);
}

function handleRelaySubmit(room, client, payload) {
  if (room.mode !== "relay" || room.status !== "relay-playing" || !room.relay) return;
  if (!room.players.includes(client.id)) return;
  if (room.relay.submissions[client.id]) return;

  const phase = getRelayPhase(room);
  room.relay.submissions[client.id] = phase === "draw"
    ? { type: "draw", strokes: normalizeStrokes(payload.strokes) }
    : { type: "guess", text: String(payload.text || "").trim().slice(0, 24) };

  if (Object.keys(room.relay.submissions).length >= room.players.length) {
    advanceRelayStep(room);
  } else {
    emitRoomState(room);
  }
}

function advanceRelayStep(room) {
  if (room.mode !== "relay" || room.status !== "relay-playing" || !room.relay) return;
  clearTimeout(room.timer);

  const phase = getRelayPhase(room);
  room.players.forEach(playerId => {
    const chain = room.relay.chains[getRelayChainIndex(room, playerId)];
    const submission = room.relay.submissions[playerId] || getEmptyRelaySubmission(phase);
    chain.items.push({ ...submission, playerId });
  });

  if (room.relay.step >= room.relay.totalSteps - 1) {
    finishRelayRound(room);
    return;
  }

  room.relay.step += 1;
  room.relay.submissions = {};
  room.endsAt = Date.now() + RELAY_STEP_MS;
  room.timer = setTimeout(() => advanceRelayStep(room), RELAY_STEP_MS);
  emitRoomState(room);
}

function finishRelayRound(room) {
  room.status = "relay-over";
  room.endsAt = null;
  const results = room.relay.chains.map(chain => {
    const lastGuess = [...chain.items].reverse().find(item => item.type === "guess");
    const finalGuess = lastGuess?.text || "";
    return {
      originPlayerId: chain.originPlayerId,
      originName: clients.get(chain.originPlayerId)?.name || "离线玩家",
      originalWord: chain.originalWord,
      finalGuess,
      correct: normalizeAnswer(finalGuess) === normalizeAnswer(chain.originalWord),
      itemCount: chain.items.length
    };
  });
  const correctCount = results.filter(result => result.correct).length;
  room.relay.results = {
    correctCount,
    totalCount: results.length,
    accuracy: results.length ? Math.round((correctCount / results.length) * 100) : 0,
    chains: results
  };
  emitRoom(room, "relay-over", room.relay.results);
  emitRoomState(room);
}

function serializeRelay(room, viewerId) {
  if (room.mode !== "relay") return null;

  const base = {
    step: room.relay?.step || 0,
    totalSteps: room.relay?.totalSteps || room.players.length,
    phase: getRelayPhase(room),
    submittedCount: room.relay ? Object.keys(room.relay.submissions).length : 0,
    hasSubmitted: Boolean(room.relay?.submissions?.[viewerId]),
    results: room.relay?.results || null
  };

  if (!room.relay || room.status !== "relay-playing") return base;

  const chain = room.relay.chains[getRelayChainIndex(room, viewerId)];
  const previousItem = chain.items.at(-1);
  return {
    ...base,
    prompt: getRelayPrompt(room, chain),
    previousStrokes: previousItem?.type === "draw" ? previousItem.strokes : [],
    previousText: previousItem?.type === "guess" ? previousItem.text : ""
  };
}

function getRelayPhase(room) {
  if (!room.relay) return "draw";
  return room.relay.step % 2 === 0 ? "draw" : "guess";
}

function getRelayChainIndex(room, playerId) {
  const playerIndex = room.players.indexOf(playerId);
  const playerCount = room.players.length;
  return (playerIndex - room.relay.step + playerCount) % playerCount;
}

function getRelayPrompt(room, chain) {
  if (getRelayPhase(room) === "draw") {
    const latestGuess = [...chain.items].reverse().find(item => item.type === "guess");
    return latestGuess?.text || chain.originalWord;
  }
  return "看图猜词";
}

function getEmptyRelaySubmission(phase) {
  return phase === "draw" ? { type: "draw", strokes: [] } : { type: "guess", text: "" };
}

function normalizeStrokes(strokes) {
  if (!Array.isArray(strokes)) return [];
  return strokes.slice(0, 2000).filter(line => line?.from && line?.to).map(line => ({
    from: normalizePoint(line.from),
    to: normalizePoint(line.to),
    color: String(line.color || "#202124").slice(0, 16),
    width: Math.max(1, Math.min(32, Number(line.width) || 6))
  }));
}

function normalizePoint(point) {
  return {
    x: Math.max(0, Math.min(960, Number(point.x) || 0)),
    y: Math.max(0, Math.min(640, Number(point.y) || 0))
  };
}

function normalizeAnswer(text) {
  return String(text || "").trim().replace(/\s+/g, "").toLowerCase();
}

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Draw Guess server running at http://localhost:${PORT}`);
  getLanUrls().forEach(url => console.log(`iPhone on same Wi-Fi: ${url}`));
});

function getLanUrls() {
  const addresses = Object.values(os.networkInterfaces())
    .flat()
    .filter(info => info && info.family === "IPv4" && !info.internal)
    .map(info => info.address);

  const physicalFirst = addresses.sort((left, right) => {
    const leftLooksVirtual = left.endsWith(".1") ? 1 : 0;
    const rightLooksVirtual = right.endsWith(".1") ? 1 : 0;
    return leftLooksVirtual - rightLooksVirtual;
  });

  return physicalFirst.map(address => `http://${address}:${PORT}`);
}
