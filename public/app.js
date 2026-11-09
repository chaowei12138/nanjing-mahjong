/* 南京麻将 · 前端 */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var CN = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
  var FLOWER = ['春', '夏', '秋', '冬', '梅', '兰', '竹', '菊'];

  var mode = 'solo';
  var soloGame = null;
  var ws = null, mySeat = 0, myId = null, isHost = false;
  var currentView = null;
  var selectedIdx = -1;
  var lastResult = null;
  var autoAdvanced = false;

  /* ---------- 工具 ---------- */
  function show(id) {
    document.querySelectorAll('.screen').forEach(function (s) { s.classList.remove('active'); });
    $(id).classList.add('active');
  }
  function toast(msg) {
    var t = $('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(t._t);
    t._t = setTimeout(function () { t.classList.remove('show'); }, 1600);
  }
  function nick() {
    var n = $('nickname').value.trim();
    return n || '玩家';
  }

  function makeTile(card, size) {
    var el = document.createElement('div');
    el.className = 'tile suit-' + card[0] + (size ? ' ' + size : '');
    var n = parseInt(card.slice(1), 10);
    var nEl = document.createElement('span');
    nEl.className = 'tn';
    if (card[0] === 'f') {
      nEl.textContent = ['东', '南', '西', '北'][n - 1];
      el.appendChild(nEl);
    } else if (card[0] === 'h') {
      nEl.textContent = n <= 3 ? ['中', '发', '白'][n - 1] : FLOWER[n - 4];
      el.appendChild(nEl);
    } else {
      nEl.textContent = CN[n];
      var sEl = document.createElement('span');
      sEl.className = 'ts';
      sEl.textContent = card[0] === 'w' ? '萬' : card[0] === 't' ? '条' : '筒';
      el.appendChild(nEl);
      el.appendChild(sEl);
    }
    return el;
  }
  function makeBack(size) {
    var el = document.createElement('div');
    el.className = 'tile back' + (size ? ' ' + size : '');
    return el;
  }

  /* ---------- 路由 ---------- */
  function boot() {
    var saved = localStorage.getItem('nj_nick');
    if (saved) { $('nickname').value = saved; }

    $('btn-create').onclick = function () {
      localStorage.setItem('nj_nick', nick());
      if (!ws || ws.readyState > 1) connect();
      sendWhenOpen({ t: 'create', name: nick() });
    };
    $('btn-join').onclick = joinRoom;
    $('join-code').onkeydown = function (e) { if (e.key === 'Enter') joinRoom(); };
    $('btn-solo').onclick = startSolo;
    $('btn-leave').onclick = leaveRoom;
    $('btn-copy').onclick = copyLink;
    $('btn-start').onclick = function () { if (ws) sendWhenOpen({ t: 'start' }); };
    $('btn-fair').onclick = function () { if (lastResult) openVerify(lastResult); else toast('本局数据还没生成'); };
    $('btn-verify').onclick = function () { openVerify(lastResult); };
    $('btn-vclose').onclick = function () { $('verify').classList.remove('show'); };
    $('btn-again').onclick = again;

    var room = new URLSearchParams(location.search).get('room');
    if (room) {
      $('join-code').value = room.toUpperCase();
      if (saved) setTimeout(joinRoom, 200);
    }
  }

  function joinRoom() {
    var code = $('join-code').value.trim().toUpperCase();
    if (code.length !== 4) return toast('请输入 4 位房间码');
    localStorage.setItem('nj_nick', nick());
    if (!ws || ws.readyState > 1) connect();
    sendWhenOpen({ t: 'join', code: code, name: nick() });
  }

  function copyLink() {
    var url = location.origin + '/?room=' + (roomCode || '');
    var done = function () { toast('链接已复制，去微信粘贴给好友'); };
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(url).then(done, fallback);
    } else fallback();
    function fallback() {
      var ta = document.createElement('textarea');
      ta.value = url; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); done(); } catch (e) { toast('请手动复制：' + url); }
      document.body.removeChild(ta);
    }
  }

  var roomCode = '';

  function leaveRoom() {
    if (ws) { try { ws.close(); } catch (e) {} ws = null; }
    roomCode = '';
    history.replaceState(null, '', '/');
    show('lobby');
  }

  /* ---------- 联机 ---------- */
  function sendWhenOpen(obj) {
    var go = function () { try { ws.send(JSON.stringify(obj)); } catch (e) { toast('发送失败，请重试'); } };
    if (ws.readyState === 1) go();
    else ws.addEventListener('open', go, { once: true });
  }

  function connect() {
    var proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(proto + '//' + location.host);
    ws.onmessage = function (ev) {
      var m;
      try { m = JSON.parse(ev.data); } catch (e) { return; }
      handle(m);
    };
    ws.onclose = function () { if (mode === 'online') toast('连接已断开'); };
  }

  function handle(m) {
    if (m.t === 'welcome') { myId = m.id; return; }
    if (m.t === 'error') { toast(m.msg); return; }
    if (m.t === 'room') {
      mode = 'online';
      roomCode = m.code;
      isHost = (m.hostId === myId);
      renderRoom(m);
      if (!m.started) { show('room'); }
      return;
    }
    if (m.t === 'state') {
      mode = 'online';
      mySeat = m.view.seat;
      currentView = m.view;
      show('table');
      if (!m.view.over) $('result').classList.remove('show');
      render(m.view);
      if (m.view.over && m.view.result) {
        lastResult = m.view.result;
        showResult(m.view.result, m.view);
      }
      return;
    }
  }

  function renderRoom(m) {
    $('room-code').textContent = m.code;
    var list = $('seat-list');
    list.innerHTML = '';
    m.seats.forEach(function (s, i) {
      var d = document.createElement('div');
      d.className = 'seat-item' + (s ? '' : ' empty');
      var idx = document.createElement('span');
      idx.className = 'idx';
      idx.textContent = ['东', '南', '西', '北'][i];
      var nm = document.createElement('span');
      nm.className = 'nm';
      nm.textContent = s ? s.name : '等待好友加入';
      d.appendChild(idx); d.appendChild(nm);
      if (s) {
        var tag = document.createElement('span');
        tag.className = 'tag' + (s.isBot ? ' bot' : '');
        tag.textContent = s.isBot ? 'AI' : (s.connected ? (isHost && i === 0 ? '房主' : '在线') : '离线');
        d.appendChild(tag);
      }
      list.appendChild(d);
    });
    $('btn-start').style.display = isHost ? 'flex' : 'none';
    $('btn-start').textContent = m.started ? '进行中' : '开始游戏';
  }

  /* ---------- 单机 ---------- */
  function startSolo() {
    localStorage.setItem('nj_nick', nick());
    mode = 'solo';
    mySeat = 0;
    var n = nick();
    soloGame = NJGame.createGame({
      names: [n, '小南', '阿京', '老陵'],
      bots: [false, true, true, true],
      dealer: 0
    });
    currentView = NJGame.viewFor(soloGame, 0);
    show('table');
    render(currentView);
    soloStep();
  }

  function soloStep() {
    if (!soloGame) return;
    currentView = NJGame.viewFor(soloGame, 0);
    render(currentView);
    if (soloGame.over) {
      lastResult = currentView.result;
      showResult(currentView.result, currentView);
      return;
    }
    var seat = NJGame.waitingSeat(soloGame);
    if (seat === 0) return;
    setTimeout(function () {
      var a = NJGame.botAct(soloGame);
      if (!a) return;
      if (a.kind === 'discard') NJGame.discard(soloGame, a.seat, a.card);
      else if (a.kind === 'respond') NJGame.respond(soloGame, a.seat, a.act);
      else if (a.kind === 'self') NJGame.selfAction(soloGame, a.seat, a.act);
      soloStep();
    }, 480);
  }

  function again() {
    $('result').classList.remove('show');
    if (mode === 'solo') { startSolo(); return; }
    if (ws) sendWhenOpen({ t: 'again' });
  }

  /* ---------- 渲染牌桌 ---------- */
  function render(v) {
    var me = v.seat;
    var seats = {
      top: (me + 2) % 4,
      left: (me + 3) % 4,
      right: (me + 1) % 4,
      me: me
    };
    $('round-info').textContent = '第 ' + v.round + ' 局 · ' +
      ['东', '南', '西', '北'][v.dealer] + '家坐庄';
    $('wall-info').textContent = '余 ' + v.wallCount + ' 张';
    $('center-wall').textContent = v.wallCount;

    var turnName = v.over ? '本局结束' :
      (v.turn === me ? '轮到你出牌' : v.players[v.turn].name + ' 出牌中');
    if (v.phase === 'claim' && !v.over) turnName = '等待响应';
    $('center-turn').textContent = turnName;

    var VIS = { top: 'p2', left: 'p1', right: 'p3' };
    ['top', 'left', 'right'].forEach(function (k) {
      var si = seats[k];
      var s = v.players[si];
      var root = $(VIS[k]);
      if (!root) return;
      root.classList.toggle('active', !v.over && v.turn === si);
      root.querySelector('.pname').textContent = s.name;
      root.querySelector('.pscore').textContent = s.score > 0 ? '+' + s.score : s.score;
      var av = root.querySelector('.avatar');
      av.textContent = s.name.charAt(0);
    });

    // 对家
    var top = v.players[seats.top];
    var back = $('p2-back');
    if (back) {
      back.innerHTML = '';
      var cnt = Math.min(top.handCount, 14);
      for (var i = 0; i < cnt; i++) {
        var b = document.createElement('div');
        b.className = 'mini-back';
        back.appendChild(b);
      }
    }
    renderMelds($('p2-melds'), top.melds, false, 'xxs');
    renderFlowers($('p2-flowers'), top.flowers);

    // 左右
    renderSideBacks($('p1-backs'), v.players[seats.left].handCount);
    renderSideBacks($('p3-backs'), v.players[seats.right].handCount);
    renderMelds($('p1-melds'), v.players[seats.left].melds, false, 'xxs');
    renderMelds($('p3-melds'), v.players[seats.right].melds, false, 'xxs');

    // 牌河
    renderRiver($('river0'), v.players[me].river, v.lastPlayer === me ? v.lastDiscard : null);
    renderRiver($('river1'), v.players[seats.left].river, v.lastPlayer === seats.left ? v.lastDiscard : null);
    renderRiver($('river2'), v.players[seats.top].river, v.lastPlayer === seats.top ? v.lastDiscard : null);
    renderRiver($('river3'), v.players[seats.right].river, v.lastPlayer === seats.right ? v.lastDiscard : null);

    // 自己
    renderMelds($('p0-melds'), v.melds, true, 'sm');
    renderFlowers($('p0-flowers'), v.flowers);
    renderHand(v);
    renderActions(v);
  }

  function renderSideBacks(el, count) {
    if (!el) return;
    el.innerHTML = '';
    var n = Math.min(count, 13);
    for (var i = 0; i < n; i++) {
      var d = document.createElement('div');
      d.className = 'sb';
      el.appendChild(d);
    }
  }

  function renderRiver(el, cards, lastCard) {    if (!el) return;
    el.innerHTML = '';
    var lastIdx = -1;
    if (lastCard) { for (var i = cards.length - 1; i >= 0; i--) if (cards[i] === lastCard) { lastIdx = i; break; } }
    cards.forEach(function (c, i) {
      var t = makeTile(c, 'xs');
      if (i === lastIdx) t.classList.add('last');
      el.appendChild(t);
    });
  }

  function renderMelds(el, melds, faceUp, size) {
    if (!el) return;
    el.innerHTML = '';
    (melds || []).forEach(function (m) {
      var wrap = document.createElement('div');
      wrap.className = 'meld';
      var cnt = m.type === 'peng' ? 3 : 4;
      var hide = (m.type === 'angang' && !faceUp);
      for (var i = 0; i < cnt; i++) {
        wrap.appendChild(hide ? makeBack(size) : makeTile(m.card, size));
      }
      el.appendChild(wrap);
    });
  }

  function renderFlowers(el, flowers) {
    if (!el) return;
    el.innerHTML = '';
    var n = (flowers || []).length;
    if (!n) return;
    var b = document.createElement('span');
    b.className = 'flower-badge';
    b.textContent = '花 ' + n;
    el.appendChild(b);
  }

  function renderHand(v) {
    var el = $('p0-hand');
    el.innerHTML = '';
    if (!v.hand) return;
    var drawn = v.drawn;
    var rest = v.hand.slice();
    if (drawn) {
      var di = rest.indexOf(drawn);
      if (di >= 0) rest.splice(di, 1);
    }
    rest = NJ.sortHand(rest);
    var all = drawn ? rest.concat([drawn]) : rest;

    var canAct = !v.over && v.phase === 'discard' && v.turn === v.seat;

    all.forEach(function (c, idx) {
      var t = makeTile(c);
      if (drawn && idx === all.length - 1) t.classList.add('gap', 'drawn');
      if (selectedIdx === idx) t.classList.add('sel');
      if (v.ting && v.ting[c]) t.classList.add('ting');
      if (canAct) {
        t.addEventListener('click', function () {
          if (selectedIdx === idx) { playTile(c); }
          else { selectedIdx = idx; renderHand(v); }
        });
      }
      el.appendChild(t);
    });
  }

  function renderActions(v) {
    var bar = $('actions');
    bar.innerHTML = '';
    if (v.over) return;
    var acts = v.actions || [];
    if (!acts.length) return;

    var order = ['hu', 'gang', 'peng', 'angang', 'bugang', 'pass'];
    acts.sort(function (a, b) { return order.indexOf(a.type) - order.indexOf(b.type); });

    acts.forEach(function (a) {
      var b = document.createElement('button');
      b.className = 'act-btn' + (a.type === 'hu' ? ' hu' : '') + (a.type === 'pass' ? ' pass' : '');
      var label = { hu: '胡', peng: '碰', gang: '杠', angang: '暗杠', bugang: '补杠', pass: '过' }[a.type] || a.type;
      b.textContent = label;
      b.onclick = function () { doAction(a); };
      bar.appendChild(b);
    });
  }

  function doAction(a) {
    selectedIdx = -1;
    if (mode === 'solo') {
      var r;
      if (soloGame.phase === 'claim') r = NJGame.respond(soloGame, 0, a.type);
      else r = NJGame.selfAction(soloGame, 0, a);
      if (r && r.err) { toast(r.err); return; }
      soloStep();
    } else {
      var msg;
      if (currentView.phase === 'claim') msg = { t: 'act', act: a.type };
      else msg = { t: 'act', action: a };
      sendWhenOpen(msg);
    }
  }

  function playTile(card) {
    selectedIdx = -1;
    if (mode === 'solo') {
      var r = NJGame.discard(soloGame, 0, card);
      if (r.err) { toast(r.err); return; }
      soloStep();
    } else {
      sendWhenOpen({ t: 'discard', card: card });
    }
  }

  /* ---------- 结算 ---------- */
  function showResult(r, v) {
    if (!r) return;
    var againBtn = $('btn-again');
    if (mode === 'online' && !isHost) {
      againBtn.textContent = '等待房主开局';
      againBtn.disabled = true;
      againBtn.style.opacity = '.45';
    } else {
      againBtn.textContent = '再来一局';
      againBtn.disabled = false;
      againBtn.style.opacity = '1';
    }
    var title = $('result-title');
    var body = $('result-body');
    if (r.type === 'draw') {
      title.textContent = '荒庄';
      body.innerHTML = '<p>牌墙摸完，本局无人胡牌，庄家连庄。</p>';
      $('result').classList.add('show');
      return;
    }
    var winner = v.players[r.winner];
    var isMe = r.winner === v.seat;
    title.textContent = isMe ? '你胡了！' : (winner.name + ' 胡牌');
    var ev = r.ev || {};
    var fans = (ev.fans || []).map(function (f) {
      return '<span class="fan">' + f.name + (f.pt ? ' +' + f.pt : '') + '</span>';
    }).join('');
    if (!fans) fans = '<span class="fan">平胡</span>';

    var html = '';
    html += '<div class="res-win">' + (r.type === 'zimo' ? '自摸' : '点炮 · 出自 ' + v.players[r.loser].name) + ' · ' + r.total + ' 花</div>';
    html += '<div class="fan-list">' + fans + '</div>';
    html += '<div style="font-size:11.5px;color:#8ba396">硬花 ' + (ev.hard || 0) + ' 张 · 软花 ' + (ev.soft || 0) + ' 花</div>';

    html += '<table class="score-table">';
    v.players.forEach(function (p, i) {
      var d = r.delta[i];
      html += '<tr><td>' + p.name + (i === v.seat ? '（你）' : '') + '</td><td class="' +
        (d > 0 ? 'pos' : d < 0 ? 'neg' : '') + '">' + (d > 0 ? '+' : '') + d + '</td></tr>';
    });
    html += '</table>';
    body.innerHTML = html;
    $('result').classList.add('show');
  }

  /* ---------- 公平性验证 ---------- */
  function openVerify(r) {
    if (!r || !r.serverSeed) { toast('暂无本局数据'); return; }
    $('v-commit').textContent = r.commit || '（本局未记录）';
    $('v-seed').textContent = r.serverSeed;
    $('v-salts').textContent = (r.salts || []).join(' / ');
    $('v-wall').textContent = r.wallHash;

    var seed = NJRng.deriveSeed(r.serverSeed, r.salts, r.round);
    var randInt = NJRng.createRng(seed);
    var wall = NJ.shuffle(NJ.buildWall(), randInt);
    var calc = NJRng.sha256(wall.join(','));
    $('v-calc').textContent = calc;

    var st = $('v-status');
    if (calc === r.wallHash) {
      st.className = 'vstatus ok';
      st.textContent = '✓ 重算结果与公布哈希完全一致，本局发牌可验证未被篡改';
    } else {
      st.className = 'vstatus bad';
      st.textContent = '✗ 哈希不一致，请勿继续对局';
    }
    $('verify').classList.add('show');
  }

  document.addEventListener('DOMContentLoaded', boot);
})();
