/* 南京麻将 · 联机服务端（权威判定 + 房间 + 分享链接） */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');
const G = require('./public/game.js');
const NJ = require('./public/core.js');
const RNG = require('./public/rng.js');

const PORT = process.env.PORT || 3000;
const PUBLIC = path.join(__dirname, 'public');
const TURN_MS = Math.max(10, parseInt(process.env.TURN_SEC || '120', 10)) * 1000;  // 出牌限时：默认 2 分钟
const CLAIM_MS = Math.max(5, parseInt(process.env.CLAIM_SEC || '15', 10)) * 1000;  // 碰/杠/胡 响应限时

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg'
};

/* ---------- 微信网页授权（可选：配置 WX_APPID / WX_SECRET 后启用） ---------- */
const WX_APPID = process.env.WX_APPID || '';
const WX_SECRET = process.env.WX_SECRET || '';
const WX_ON = !!(WX_APPID && WX_SECRET);

function reqBase(req) {
  const proto = String(req.headers['x-forwarded-proto'] || 'https').split(',')[0].trim();
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
  return proto + '://' + host;
}
function safeNext(n) {
  if (!n || n[0] !== '/' || n[1] === '/' || n[1] === '\\') return '/';
  return n.slice(0, 300);
}
function go(res, to) {
  res.writeHead(302, { Location: to, 'Cache-Control': 'no-store' });
  res.end();
}
function withParam(url, kv) {
  return url + (url.indexOf('?') >= 0 ? '&' : '?') + kv;
}
async function wxNickname(code) {
  const ac = new AbortController();
  const to = setTimeout(() => ac.abort(), 6000);
  try {
    const tk = await fetch('https://api.weixin.qq.com/sns/oauth2/access_token?appid=' + encodeURIComponent(WX_APPID) +
      '&secret=' + encodeURIComponent(WX_SECRET) + '&code=' + encodeURIComponent(code) +
      '&grant_type=authorization_code', { signal: ac.signal }).then(r => r.json());
    if (!tk || !tk.access_token) throw new Error('token');
    const u = await fetch('https://api.weixin.qq.com/sns/userinfo?access_token=' + encodeURIComponent(tk.access_token) +
      '&openid=' + encodeURIComponent(tk.openid) + '&lang=zh_CN', { signal: ac.signal }).then(r => r.json());
    return (u && u.nickname ? String(u.nickname) : '');
  } finally { clearTimeout(to); }
}

function handleWx(req, res, pathname, q) {
  if (pathname === '/wx/status') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ enabled: WX_ON }));
    return true;
  }
  if (!WX_ON) { go(res, '/?wx=off'); return true; }

  if (pathname === '/wx/auth') {
    const next = safeNext(q.get('next') || '/');
    const cb = reqBase(req) + '/wx/cb?next=' + encodeURIComponent(next);
    go(res, 'https://open.weixin.qq.com/connect/oauth2/authorize?appid=' + encodeURIComponent(WX_APPID) +
      '&redirect_uri=' + encodeURIComponent(cb) +
      '&response_type=code&scope=snsapi_userinfo&state=nj#wechat_redirect');
    return true;
  }

  if (pathname === '/wx/cb') {
    const next = safeNext(q.get('next') || '/');
    const code = q.get('code') || '';
    if (!code) { go(res, withParam(next, 'wx=deny')); return true; }
    wxNickname(code).then(function (name) {
      if (!name) return go(res, withParam(next, 'wx=empty'));
      go(res, withParam(next, 'n=' + encodeURIComponent(name)));
    }).catch(function (e) {
      console.error('[wx] oauth failed:', e && e.message);
      go(res, withParam(next, 'wx=err'));
    });
    return true;
  }

  go(res, '/');
  return true;
}

const server = http.createServer((req, res) => {
  const qs = req.url.indexOf('?') >= 0 ? req.url.slice(req.url.indexOf('?') + 1) : '';
  let urlPath = decodeURIComponent(req.url.split('?')[0]);
  if (urlPath.startsWith('/wx/') && handleWx(req, res, urlPath, new URLSearchParams(qs))) return;
  if (urlPath === '/' || urlPath.startsWith('/r/')) urlPath = '/index.html';
  const file = path.join(PUBLIC, path.normalize(urlPath).replace(/^(\.\.[\/\\])+/, ''));
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not Found'); return; }
    const isVoice = urlPath.startsWith('/voice/');
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
      'Cache-Control': isVoice ? 'public, max-age=604800' : 'no-cache'
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

function newRoom(points) {
  const p = Math.max(100, Math.min(100000, parseInt(points, 10) || 1000));
  return {
    code: genCode(), seats: [null, null, null, null],
    hostId: null, game: null, scores: [p, p, p, p], points: p,
    round: 0, dealer: 0, timer: null, started: false,
    deadline: 0, clockLimit: 0, clockRemain: 0, paused: false, pausedBy: -1
  };
}

function roomInfo(room) {
  return {
    t: 'room', code: room.code, started: room.started,
    hostId: room.hostId, points: room.points,
    scores: room.scores.slice(),
    seats: room.seats.map((s, i) => s ? { seat: i, id: s.id || '', name: s.name, isBot: s.isBot, connected: s.connected, score: room.scores[i] } : null)
  };
}

function send(ws, obj) {
  if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj));
}

function broadcastRoom(room) {
  const info = roomInfo(room);
  room.seats.forEach(s => { if (s && s.ws) send(s.ws, info); });
}

function clockOf(room) {
  if (!room.game || room.game.over) return null;
  const remain = room.paused
    ? Math.max(0, room.clockRemain || 0)
    : Math.max(0, (room.deadline || 0) - Date.now());
  return {
    limit: room.clockLimit || 0,
    remain: remain,
    paused: !!room.paused,
    by: room.pausedBy == null ? -1 : room.pausedBy,
    now: Date.now()
  };
}

function broadcastState(room) {
  const g = room.game;
  if (!g) return;
  const clock = clockOf(room);
  room.seats.forEach((s, i) => {
    if (s && s.ws && !s.isBot) {
      const view = G.viewFor(g, i);
      view.clock = clock;
      view.paused = !!room.paused;
      view.pausedBy = room.pausedBy;
      send(s.ws, { t: 'state', view: view });
    }
  });
}

function broadcastNotice(room, obj) {
  room.seats.forEach(s => { if (s && s.ws) send(s.ws, obj); });
}

function clearTimer(room) { if (room.timer) { clearTimeout(room.timer); room.timer = null; } }

// 计时器：到点强制出牌 / 自动过牌
function armTimer(room, seat) {
  clearTimer(room);
  const g = room.game;
  if (!g || g.over || room.paused) return;
  const limit = g.phase === 'claim' ? CLAIM_MS : TURN_MS;
  room.clockLimit = limit;
  room.deadline = Date.now() + limit;
  room.timer = setTimeout(() => {
    if (room.game !== g || g.over || room.paused) return;
    if (G.waitingSeat(g) !== seat) return;
    try {
      if (g.phase === 'claim') {
        G.respond(g, seat, 'pass');
      } else {
        const pl = g.players[seat];
        const hand = pl.hand;
        let pick = (g.drawnTile && hand.indexOf(g.drawnTile) >= 0)
          ? g.drawnTile
          : NJ.aiChooseDiscard(pl);
        if (hand.indexOf(pick) < 0) pick = hand[hand.length - 1];
        G.discard(g, seat, pick);
        broadcastNotice(room, { t: 'notice', kind: 'timeout', seat: seat, card: pick });
      }
    } catch (e) { console.error(e); }
    advance(room);
  }, limit);
}

function advance(room) {
  clearTimer(room);
  const g = room.game;
  if (!g) return;

  if (g.over) {
    broadcastState(room);
    room.started = false;
    room.paused = false;
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
    setTimeout(() => {
      if (room.game !== g || g.over || room.paused) return;
      const a = G.botAct(g);
      if (!a) return;
      try {
        if (a.kind === 'discard') G.discard(g, a.seat, a.card);
        else if (a.kind === 'respond') G.respond(g, a.seat, a.act);
        else if (a.kind === 'self') G.selfAction(g, a.seat, a.act);
      } catch (e) { console.error(e); }
      advance(room);
    }, 420);
    // 机器人回合不占用人类倒计时，但仍广播（保持牌桌进度）
    room.clockLimit = 0; room.deadline = 0;
    broadcastState(room);
    return;
  }

  if (!room.paused) armTimer(room, seat);
  else { room.clockLimit = g.phase === 'claim' ? CLAIM_MS : TURN_MS; }
  broadcastState(room);
}

// 暂停 / 继续
function setPaused(room, on, seat) {
  if (!room.game || room.game.over) return;
  if (!!room.paused === !!on) return;
  if (on) {
    room.clockRemain = Math.max(0, (room.deadline || 0) - Date.now());
    room.paused = true;
    room.pausedBy = seat;
    clearTimer(room);
    broadcastNotice(room, { t: 'notice', kind: 'pause', seat: seat });
  } else {
    room.paused = false;
    const remain = Math.max(5000, room.clockRemain || 0);
    room.deadline = Date.now() + remain;
    const waiting = G.waitingSeat(room.game);
    const s = waiting >= 0 ? room.seats[waiting] : null;
    if (s && s.ws && !s.isBot) armTimer(room, waiting);
    broadcastNotice(room, { t: 'notice', kind: 'resume', seat: seat });
    if (!(s && s.ws && !s.isBot)) { advance(room); return; }
  }
  broadcastState(room);
}


/* ---------------- WebSocket ---------------- */
let nextId = 1;

wss.on('connection', (ws, req) => {
  // 客户端带稳定 id：同一浏览器刷新 / 多标签 / 重复点链接都算同一个人
  let cid = '';
  try {
    const u = new URL(req.url, 'http://x');
    const c = u.searchParams.get('cid') || '';
    if (/^[A-Za-z0-9_-]{6,40}$/.test(c)) cid = c;
  } catch (e) {}
  ws.id = cid || ('u' + (nextId++));
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
    if (s.ws !== ws) return;   // 座位已被同一人的新连接接管，别把新连接标成掉线
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
    case 'kick': return doKick(ws, msg);
    case 'leave': return doLeave(ws);
    case 'discard': return doDiscard(ws, msg);
    case 'act': return doAct(ws, msg);
    case 'pause': {
      const room = ws.room;
      if (!room || !room.game || room.game.over) return;
      setPaused(room, true, ws.seat);
      return;
    }
    case 'resume': {
      const room = ws.room;
      if (!room || !room.game || room.game.over) return;
      setPaused(room, false, ws.seat);
      return;
    }
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
  // 重复点「创建房间」：还坐在自己没开局的房里就直接回去，不新建垃圾房
  if (ws.room && !ws.room.started && ws.room.hostId === ws.id) {
    ws.room.points = Math.max(100, Math.min(100000, parseInt(msg.points, 10) || ws.room.points));
    return send(ws, roomInfo(ws.room));
  }
  const room = newRoom(msg.points);
  room.hostId = ws.id;
  const name = String(msg.name || '玩家').slice(0, 8);
  room.seats[0] = { id: ws.id, name, isBot: false, ws, connected: true };
  rooms.set(room.code, room);
  ws.room = room; ws.seat = 0;
  send(ws, roomInfo(room));
}

function doJoin(ws, msg) {
  const code = String(msg.code || '').toUpperCase().trim();
  const room = rooms.get(code);
  if (!room) return send(ws, { t: 'error', msg: '房间不存在或已解散' });
  const name = String(msg.name || '玩家').slice(0, 8);

  // 同一个人（同一浏览器）重复进房 / 刷新 / 多标签：复用原座位，顶掉旧连接
  const mine = room.seats.findIndex(s => s && s.id && s.id === ws.id);
  if (mine >= 0) {
    const old = room.seats[mine];
    if (old.ws && old.ws !== ws) {
      old.ws.room = null; old.ws.seat = -1;
      send(old.ws, { t: 'info', msg: '你已在另一处打开牌桌，这里已断开' });
      try { old.ws.close(); } catch (e) {}
    }
    room.seats[mine] = { id: ws.id, name, isBot: false, ws, connected: true };
    ws.room = room; ws.seat = mine;
    broadcastRoom(room);
    if (room.game) broadcastState(room);
    return;
  }

  if (room.started) {
    const free = room.seats.findIndex(s => !s);
    if (free < 0) return send(ws, { t: 'error', msg: '房间已开始' });
  }
  let idx = room.seats.findIndex(s => s && s.isBot && !s.ws && !s.id);
  if (idx < 0) idx = room.seats.findIndex(s => !s);
  if (idx < 0) return send(ws, { t: 'error', msg: '房间已满' });
  room.seats[idx] = { id: ws.id, name, isBot: false, ws, connected: true };
  ws.room = room; ws.seat = idx;
  broadcastRoom(room);
  if (room.game) broadcastState(room);
}

function doKick(ws, msg) {
  const room = ws.room;
  if (!room) return;
  if (room.hostId !== ws.id) return send(ws, { t: 'error', msg: '只有房主可以踢人' });
  if (room.started && room.game && !room.game.over) return send(ws, { t: 'error', msg: '牌局进行中不能踢人' });
  const i = parseInt(msg.seat, 10);
  if (!(i >= 0 && i < 4) || i === ws.seat) return;
  const s = room.seats[i];
  if (!s || (!s.ws && !s.id)) return;
  const victim = s.ws;
  room.seats[i] = null;
  if (victim) {
    victim.room = null; victim.seat = -1;
    send(victim, { t: 'kicked', msg: '你已被房主移出房间' });
    try { victim.close(); } catch (e) {}
  }
  broadcastRoom(room);
}

function doLeave(ws) {
  const room = ws.room;
  if (!room) return;
  const i = ws.seat;
  const s = room.seats[i];
  ws.room = null; ws.seat = -1;
  if (!s || s.ws !== ws) return;
  const playing = room.game && !room.game.over;
  if (playing) {
    s.connected = false; s.ws = null; s.isBot = true;   // 牌局中退出：AI 接管
  } else {
    room.seats[i] = null;
  }
  // 房主走了，交给下一个真人
  if (room.hostId === ws.id) {
    const ni = room.seats.findIndex(x => x && x.ws && !x.isBot);
    room.hostId = ni >= 0 ? room.seats[ni].id : '';
  }
  broadcastRoom(room);
  if (!room.seats.some(x => x && x.ws)) {
    clearTimer(room);
    if (!playing) rooms.delete(room.code);
  }
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
  room.paused = false; room.pausedBy = -1;
  room.clockLimit = 0; room.clockRemain = 0; room.deadline = 0;
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
  if (room.paused) return;
  const r = G.discard(room.game, ws.seat, msg.card);
  if (r.err) return send(ws, { t: 'error', msg: r.err });
  advance(room);
}

function doAct(ws, msg) {
  const room = ws.room;
  if (!room || !room.game) return;
  if (room.paused) return;
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
