/* 南京麻将 · 联机服务端（权威判定 + 房间 + 分享链接） */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');
const G = require('./public/game.js');
const RNG = require('./public/rng.js');

const PORT = process.env.PORT || 3000;
const PUBLIC = path.join(__dirname, 'public');

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon'
};

const server = http.createServer((req, res) => {
  let urlPath = decodeURIComponent(req.url.split('?')[0]);
  if (urlPath === '/' || urlPath.startsWith('/r/')) urlPath = '/index.html';
  const file = path.join(PUBLIC, path.normalize(urlPath).replace(/^(\.\.[\/\\])+/, ''));
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not Found'); return; }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
      'Cache-Control': 'no-cache'
    });
    res.end(data);
  });
});

const wss = new WebSocketServer({ server });
const rooms = new Map();

function genCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for (;;) {
    let s = '';
    for (let i = 0; i < 4; i++) s += chars[crypto.randomInt(chars.length)];
    if (!rooms.has(s)) return s;
  }
}

function newRoom() {
  return {
    code: genCode(), seats: [null, null, null, null],
    hostId: null, game: null, scores: [0, 0, 0, 0],
    round: 0, dealer: 0, timer: null, started: false
  };
}

function roomInfo(room) {
  return {
    t: 'room', code: room.code, started: room.started,
    hostId: room.hostId,
    seats: room.seats.map((s, i) => s ? { seat: i, name: s.name, isBot: s.isBot, connected: s.connected } : null)
  };
}

function send(ws, obj) {
  if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj));
}

function broadcastRoom(room) {
  const info = roomInfo(room);
  room.seats.forEach(s => { if (s && s.ws) send(s.ws, info); });
}

function broadcastState(room) {
  const g = room.game;
  if (!g) return;
  room.seats.forEach((s, i) => {
    if (s && s.ws && !s.isBot) send(s.ws, { t: 'state', view: G.viewFor(g, i) });
  });
}

function clearTimer(room) { if (room.timer) { clearTimeout(room.timer); room.timer = null; } }

function advance(room) {
  clearTimer(room);
  const g = room.game;
  if (!g) return;

  if (g.over) {
    broadcastState(room);
    room.started = false;
    room.scores = g.players.map(p => p.score);
    room.dealer = g.result && g.result.type !== 'draw' ? g.result.winner : g.dealer;
    broadcastRoom(room);
    return;
  }

  const seat = G.waitingSeat(g);
  if (seat < 0) return;
  const s = room.seats[seat];

  if (!s || s.isBot || !s.ws) {
    if (!s) { // 空座，用机器人代打
      room.seats[seat] = { name: '机器人', isBot: true, ws: null, connected: true };
    }
    const bot = room.seats[seat];
    setTimeout(() => {
      if (room.game !== g || g.over) return;
      const a = G.botAct(g);
      if (!a) return;
      try {
        if (a.kind === 'discard') G.discard(g, a.seat, a.card);
        else if (a.kind === 'respond') G.respond(g, a.seat, a.act);
        else if (a.kind === 'self') G.selfAction(g, a.seat, a.act);
      } catch (e) { console.error(e); }
      advance(room);
    }, 420);
    return;
  }

  broadcastState(room);
  room.timer = setTimeout(() => {
    if (room.game !== g || g.over) return;
    const waiting = G.waitingSeat(g);
    if (waiting !== seat) return;
    // 超时代打
    try {
      if (g.phase === 'claim') G.respond(g, seat, 'pass');
      else {
        const hand = g.players[seat].hand;
        const pick = g.drawnTile && hand.includes(g.drawnTile) ? g.drawnTile : NJFallbackDiscard(hand);
        G.discard(g, seat, pick);
      }
    } catch (e) { console.error(e); }
    advance(room);
  }, 20000);
}

function NJFallbackDiscard(hand) {
  return hand[hand.length - 1];
}

/* ---------------- WebSocket ---------------- */
let nextId = 1;

wss.on('connection', ws => {
  ws.id = 'u' + (nextId++);
  ws.room = null;
  ws.seat = -1;

  ws.on('message', raw => {
    let msg;
    try { msg = JSON.parse(raw); } catch (e) { return; }
    handle(ws, msg);
  });

  ws.on('close', () => {
    const room = ws.room;
    if (!room) return;
    const s = room.seats[ws.seat];
    if (!s) return;
    s.connected = false;
    s.ws = null;
    s.isBot = true;      // 掉线由机器人接管，不卡局
    broadcastRoom(room);
    if (room.game && !room.game.over && G.waitingSeat(room.game) === ws.seat) advance(room);
  });

  send(ws, { t: 'welcome', id: ws.id });
});

function handle(ws, msg) {
  switch (msg.t) {
    case 'create': return doCreate(ws, msg);
    case 'join': return doJoin(ws, msg);
    case 'start': return doStart(ws);
    case 'again': return doAgain(ws);
    case 'discard': return doDiscard(ws, msg);
    case 'act': return doAct(ws, msg);
    case 'name': {
      const room = ws.room;
      if (!room) return;
      const s = room.seats[ws.seat];
      if (s) { s.name = String(msg.name || s.name).slice(0, 8); broadcastRoom(room); }
      return;
    }
    case 'ping': return send(ws, { t: 'pong' });
  }
}

function doCreate(ws, msg) {
  const room = newRoom();
  room.hostId = ws.id;
  const name = String(msg.name || '玩家').slice(0, 8);
  room.seats[0] = { name, isBot: false, ws, connected: true };
  rooms.set(room.code, room);
  ws.room = room; ws.seat = 0;
  send(ws, roomInfo(room));
}

function doJoin(ws, msg) {
  const code = String(msg.code || '').toUpperCase().trim();
  const room = rooms.get(code);
  if (!room) return send(ws, { t: 'error', msg: '房间不存在或已解散' });
  if (room.started) {
    // 允许观战？简化：拒绝
    const free = room.seats.findIndex(s => !s);
    if (free < 0) return send(ws, { t: 'error', msg: '房间已开始' });
  }
  let idx = room.seats.findIndex(s => s && s.isBot && !s.ws);
  if (idx < 0) idx = room.seats.findIndex(s => !s);
  if (idx < 0) return send(ws, { t: 'error', msg: '房间已满' });
  const name = String(msg.name || '玩家').slice(0, 8);
  room.seats[idx] = { name, isBot: false, ws, connected: true };
  ws.room = room; ws.seat = idx;
  broadcastRoom(room);
  if (room.game) broadcastState(room);
}

function doStart(ws) {
  const room = ws.room;
  if (!room) return;
  if (ws.id !== room.hostId) return send(ws, { t: 'error', msg: '只有房主可以开始' });
  if (room.game && !room.game.over) return;
  startRound(room);
}

function doAgain(ws) {
  const room = ws.room;
  if (!room) return;
  if (ws.id !== room.hostId) return send(ws, { t: 'error', msg: '只有房主可以开局' });
  if (room.game && !room.game.over) return;
  startRound(room);
}

function startRound(room) {
  room.round++;
  const names = room.seats.map((s, i) => (s && s.name) || ('机器人' + (i + 1)));
  const bots = room.seats.map(s => !s || s.isBot || !s.ws);
  room.game = G.createGame({
    names, bots, scores: room.scores.slice(), dealer: room.dealer, round: room.round
  });
  room.started = true;
  broadcastRoom(room);
  broadcastState(room);
  advance(room);
}

function doDiscard(ws, msg) {
  const room = ws.room;
  if (!room || !room.game) return;
  const r = G.discard(room.game, ws.seat, msg.card);
  if (r.err) return send(ws, { t: 'error', msg: r.err });
  advance(room);
}

function doAct(ws, msg) {
  const room = ws.room;
  if (!room || !room.game) return;
  const g = room.game;
  let r;
  if (g.phase === 'claim') r = G.respond(g, ws.seat, msg.act);
  else r = G.selfAction(g, ws.seat, msg.action || { type: msg.act });
  if (r.err) return send(ws, { t: 'error', msg: r.err });
  advance(room);
}

server.listen(PORT, () => {
  console.log('南京麻将已启动： http://localhost:' + PORT);
});
