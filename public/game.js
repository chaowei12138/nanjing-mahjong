/* 南京麻将状态机：前后端共用（服务端权威） */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./core.js'), require('./rng.js'));
  } else {
    root.NJGame = factory(root.NJ, root.NJRng);
  }
})(typeof self !== 'undefined' ? self : this, function (NJ, RNG) {
  'use strict';

  function dealAll(wall, dealer) {
    var hands = [[], [], [], []], flowers = [[], [], [], []];
    function give(p) {
      for (;;) {
        var c = wall.shift();
        if (c === undefined) return false;
        if (NJ.isFlower(c)) { flowers[p].push(c); continue; }
        hands[p].push(c);
        return true;
      }
    }
    for (var r = 0; r < 13; r++) for (var i = 0; i < 4; i++) give((dealer + i) % 4);
    give(dealer);
    return { hands: hands, flowers: flowers };
  }

  function createGame(opts) {
    opts = opts || {};
    var round = opts.round || 1;
    var serverSeed = opts.serverSeed || RNG.randomHex(32);
    var salts = opts.salts || [RNG.randomHex(8), RNG.randomHex(8), RNG.randomHex(8), RNG.randomHex(8)];
    var seedHex = RNG.deriveSeed(serverSeed, salts, round);
    var randInt = RNG.createRng(seedHex);
    var wall = NJ.shuffle(NJ.buildWall(), randInt);
    var wallHash = RNG.sha256(wall.join(','));
    var commit = RNG.commitOf(serverSeed, round);
    var dealer = opts.dealer || 0;
    var names = opts.names || ['我', '下家', '对家', '上家'];

    var players = [];
    for (var i = 0; i < 4; i++) {
      players.push({
        seat: i, name: names[i], hand: [], melds: [], flowers: [], river: [],
        score: (opts.scores && opts.scores[i]) || 0,
        isBot: !!(opts.bots && opts.bots[i]),
        connected: true, ready: true
      });
    }

    var deal = dealAll(wall, dealer);
    for (var j = 0; j < 4; j++) {
      players[j].hand = NJ.sortHand(deal.hands[j]);
      players[j].flowers = deal.flowers[j];
    }

    return {
      players: players, wall: wall, dealer: dealer, turn: dealer,
      phase: 'discard', lastDiscard: null, lastPlayer: -1,
      claimQueue: [], claimIdx: 0, round: round,
      serverSeed: serverSeed, salts: salts, seedHex: seedHex,
      commit: commit, wallHash: wallHash, initialWall: wall.slice(),
      over: false, result: null, log: [], drawnTile: null,
      gangKai: 0, drawCount: 0, actionCount: 0, huCount: 0,
      startedAt: Date.now()
    };
  }

  function pushLog(state, text) {
    state.log.push(text);
    if (state.log.length > 60) state.log.shift();
  }

  function drawFor(state, p) {
    var pl = state.players[p], got = null;
    while (state.wall.length) {
      var c = state.wall.shift();
      if (NJ.isFlower(c)) { pl.flowers.push(c); continue; }
      pl.hand.push(c); got = c; break;
    }
    if (got === null) return null;
    state.drawnTile = got;
    state.drawCount++;
    return got;
  }

  function canSelfHu(state, p) {
    var pl = state.players[p];
    if (pl.hand.length + pl.melds.length * 3 !== 14) return null;
    return NJ.evaluateWin({
      hand: pl.hand, melds: pl.melds, flowers: pl.flowers,
      selfDraw: true, gangKai: state.gangKai,
      isTian: (p === state.dealer && state.drawCount === 0 && state.actionCount === 0),
      isDi: false
    });
  }

  function selfActions(state, p) {
    var pl = state.players[p];
    var acts = [];
    if (canSelfHu(state, p)) acts.push({ type: 'hu' });
    var cnt = NJ.countsOf(pl.hand);
    for (var k in cnt) {
      if (cnt[k] === 4) acts.push({ type: 'angang', card: k });
    }
    pl.melds.forEach(function (m) {
      if (m.type === 'peng' && cnt[m.card] >= 1) acts.push({ type: 'bugang', card: m.card });
    });
    return acts;
  }

  // 打牌
  function discard(state, p, card) {
    if (state.over) return { err: '牌局已结束' };
    if (state.phase !== 'discard' || state.turn !== p) return { err: '还没轮到你出牌' };
    var pl = state.players[p];
    var idx = pl.hand.indexOf(card);
    if (idx < 0) return { err: '手里没有这张牌' };
    pl.hand.splice(idx, 1);
    pl.hand = NJ.sortHand(pl.hand);
    pl.river.push(card);
    state.lastDiscard = card;
    state.lastPlayer = p;
    state.drawnTile = null;
    state.gangKai = 0;
    state.actionCount++;
    pushLog(state, pl.name + ' 打出 ' + NJ.cardName(card));

    var claims = NJ.claimsFor(state, p, card);
    if (claims.length) {
      claims.sort(function (a, b) {
        var pa = a.actions.indexOf('hu') >= 0 ? 0 : 1;
        var pb = b.actions.indexOf('hu') >= 0 ? 0 : 1;
        if (pa !== pb) return pa - pb;
        return ((a.p - p + 4) % 4) - ((b.p - p + 4) % 4);
      });
      state.phase = 'claim';
      state.claimQueue = claims;
      state.claimIdx = 0;
    } else {
      nextTurn(state, p);
    }
    return { ok: true };
  }

  function nextTurn(state, p) {
    state.turn = (p + 1) % 4;
    state.phase = 'discard';
    state.gangKai = 0;
    var got = drawFor(state, state.turn);
    if (got === null) {
      state.over = true;
      state.result = { type: 'draw', log: '牌墙摸完，荒庄' };
      pushLog(state, '牌墙摸完，本局荒庄');
      return;
    }
  }

  // 响应别人打出的牌
  function respond(state, p, act) {
    if (state.over) return { err: '牌局已结束' };
    if (state.phase !== 'claim') return { err: '当前不能响应' };
    var cur = state.claimQueue[state.claimIdx];
    if (!cur || cur.p !== p) return { err: '该你响应的时机已过' };

    if (act === 'pass') {
      state.claimIdx++;
      if (state.claimIdx >= state.claimQueue.length) {
        state.claimQueue = []; state.claimIdx = 0;
        nextTurn(state, state.lastPlayer);
      }
      return { ok: true };
    }

    var pl = state.players[p], card = state.lastDiscard;

    if (act === 'hu') {
      var ev = NJ.evaluateWin({
        hand: NJ.sortHand(pl.hand.concat([card])), melds: pl.melds, flowers: pl.flowers,
        selfDraw: false, gangKai: 0,
        isDi: state.drawCount <= 1 && p !== state.dealer
      });
      if (!ev) return { err: '这张牌不能胡' };
      pl.hand = NJ.sortHand(pl.hand.concat([card]));
      settle(state, p, 'dianpao', ev, state.lastPlayer);
      return { ok: true, hu: true };
    }

    if (act === 'peng') {
      var cnt = 0;
      for (var i = pl.hand.length - 1; i >= 0 && cnt < 2; i--) {
        if (pl.hand[i] === card) { pl.hand.splice(i, 1); cnt++; }
      }
      if (cnt < 2) return { err: '无法碰' };
      pl.melds.push({ type: 'peng', card: card, from: state.lastPlayer });
      state.lastDiscard = null; state.lastPlayer = -1;
      state.claimQueue = []; state.claimIdx = 0;
      state.phase = 'discard'; state.turn = p; state.drawnTile = null; state.gangKai = 0;
      state.actionCount++;
      pushLog(state, pl.name + ' 碰 ' + NJ.cardName(card));
      return { ok: true };
    }

    if (act === 'gang') {
      var c2 = 0;
      for (var k = pl.hand.length - 1; k >= 0 && c2 < 3; k--) {
        if (pl.hand[k] === card) { pl.hand.splice(k, 1); c2++; }
      }
      if (c2 < 3) return { err: '无法杠' };
      pl.melds.push({ type: 'gang', card: card, from: state.lastPlayer });
      state.players[state.lastPlayer].score -= 20;
      pl.score += 20;
      state.lastDiscard = null; state.lastPlayer = -1;
      state.claimQueue = []; state.claimIdx = 0;
      state.phase = 'discard'; state.turn = p; state.gangKai = 2;
      state.actionCount++;
      pushLog(state, pl.name + ' 明杠 ' + NJ.cardName(card) + '（+20）');
      var got = drawFor(state, p);
      if (got === null) { state.over = true; state.result = { type: 'draw' }; return { ok: true }; }
      return { ok: true };
    }

    return { err: '未知操作' };
  }

  // 自己回合的动作：暗杠 / 补杠 / 自摸
  function selfAction(state, p, act) {
    if (state.over) return { err: '牌局已结束' };
    if (state.phase !== 'discard' || state.turn !== p) return { err: '还没轮到你' };
    var pl = state.players[p];

    if (act.type === 'hu') {
      var ev = canSelfHu(state, p);
      if (!ev) return { err: '还不能胡' };
      settle(state, p, 'zimo', ev, -1);
      return { ok: true, hu: true };
    }

    if (act.type === 'angang') {
      var card = act.card, cnt = 0;
      for (var i = pl.hand.length - 1; i >= 0 && cnt < 4; i--) {
        if (pl.hand[i] === card) { pl.hand.splice(i, 1); cnt++; }
      }
      if (cnt < 4) return { err: '无法暗杠' };
      pl.melds.push({ type: 'angang', card: card });
      state.players.forEach(function (q, i) {
        if (i !== p) { q.score -= 10; pl.score += 10; }
      });
      state.gangKai = 2;
      state.actionCount++;
      pushLog(state, pl.name + ' 暗杠（+30）');
      var got = drawFor(state, p);
      if (got === null) { state.over = true; state.result = { type: 'draw' }; return { ok: true }; }
      return { ok: true };
    }

    if (act.type === 'bugang') {
      var card2 = act.card;
      var mi = -1;
      pl.melds.forEach(function (m, i) { if (m.type === 'peng' && m.card === card2) mi = i; });
      if (mi < 0) return { err: '没有可补杠的碰' };
      var hi = pl.hand.indexOf(card2);
      if (hi < 0) return { err: '手里没有这张牌' };
      pl.hand.splice(hi, 1);
      pl.melds[mi] = { type: 'bugang', card: card2, from: pl.melds[mi].from };
      state.players.forEach(function (q, i) {
        if (i !== p) { q.score -= 10; pl.score += 10; }
      });
      state.gangKai = 2;
      state.actionCount++;
      pushLog(state, pl.name + ' 补杠（+30）');
      var got2 = drawFor(state, p);
      if (got2 === null) { state.over = true; state.result = { type: 'draw' }; return { ok: true }; }
      return { ok: true };
    }

    return { err: '未知操作' };
  }

  function settle(state, winner, kind, ev, loser) {
    var total = ev.total;
    var delta = [0, 0, 0, 0];
    if (kind === 'zimo') {
      for (var i = 0; i < 4; i++) if (i !== winner) { delta[i] -= total; delta[winner] += total; }
    } else {
      delta[loser] -= total; delta[winner] += total;
    }
    for (var j = 0; j < 4; j++) state.players[j].score += delta[j];
    state.over = true;
    state.phase = 'over';
    state.huCount++;
    state.result = {
      type: kind, winner: winner, loser: loser, ev: ev, delta: delta,
      total: total, hand: state.players[winner].hand.slice(),
      melds: state.players[winner].melds.slice(),
      flowers: state.players[winner].flowers.slice(),
      seedHex: state.seedHex, serverSeed: state.serverSeed,
      salts: state.salts, wallHash: state.wallHash, round: state.round,
      commit: state.commit
    };
    pushLog(state, state.players[winner].name + (kind === 'zimo' ? ' 自摸' : ' 胡牌') +
      '（' + total + ' 花）');
  }

  // 给某个玩家生成视图（隐藏他人手牌）
  function viewFor(state, seat) {
    var me = state.players[seat];
    var myActs = [];
    if (!state.over) {
      if (state.phase === 'discard' && state.turn === seat) {
        myActs = selfActions(state, seat);
      } else if (state.phase === 'claim') {
        var cur = state.claimQueue[state.claimIdx];
        if (cur && cur.p === seat) {
          myActs = cur.actions.map(function (a) { return { type: a }; });
        }
      }
    }
    return {
      seat: seat, turn: state.turn, phase: state.phase, dealer: state.dealer,
      wallCount: state.wall.length, round: state.round,
      over: state.over, result: state.result && sanitizeResult(state.result),
      lastDiscard: state.lastDiscard, lastPlayer: state.lastPlayer,
      drawn: state.drawnTile, gangKai: state.gangKai,
      actions: myActs,
      hand: me.hand, flowers: me.flowers, melds: me.melds,
      players: state.players.map(function (pl, i) {
        return {
          seat: i, name: pl.name, handCount: pl.hand.length,
          melds: pl.melds.map(function (m) {
            if (i !== seat && m.type === 'angang') return { type: 'angang', card: null, from: m.from };
            return m;
          }),
          flowers: pl.flowers, river: pl.river,
          score: pl.score, isBot: pl.isBot, connected: pl.connected
        };
      }),
      log: state.log.slice(-12),
      commit: state.commit, wallHash: state.wallHash,
      ting: (state.phase === 'discard' && state.turn === seat) ? tingHints(me) : null
    };
  }

  function sanitizeResult(r) {
    return {
      type: r.type, winner: r.winner, loser: r.loser, ev: r.ev, delta: r.delta,
      total: r.total, hand: r.hand, melds: r.melds, flowers: r.flowers,
      seedHex: r.seedHex, serverSeed: r.serverSeed, salts: r.salts,
      wallHash: r.wallHash, round: r.round, commit: r.commit
    };
  }

  // 每一张手牌打出后听什么
  function tingHints(pl) {
    var res = {};
    var uniq = {};
    for (var i = 0; i < pl.hand.length; i++) {
      var c = pl.hand[i];
      if (uniq[c]) continue;
      uniq[c] = 1;
      var rest = pl.hand.slice(0, i).concat(pl.hand.slice(i + 1));
      var t = NJ.tingList(rest, pl.melds.length);
      if (t.length) res[c] = t;
    }
    return res;
  }

  // 机器人决策
  function botAct(state) {
    if (state.over) return null;
    if (state.phase === 'claim') {
      var cur = state.claimQueue[state.claimIdx];
      if (!cur) return null;
      var pl = state.players[cur.p];
      if (!pl.isBot) return null;
      var act = NJ.aiChooseAction(state, cur.p, cur);
      return { kind: 'respond', seat: cur.p, act: act };
    }
    if (state.phase === 'discard') {
      var p = state.turn, me = state.players[p];
      if (!me.isBot) return null;
      var acts = selfActions(state, p);
      for (var i = 0; i < acts.length; i++) {
        if (acts[i].type === 'hu') return { kind: 'self', seat: p, act: acts[i] };
      }
      // 暗杠：手牌够多时杠
      for (var k = 0; k < acts.length; k++) {
        if (acts[k].type === 'angang' && me.hand.length >= 8) {
          return { kind: 'self', seat: p, act: acts[k] };
        }
      }
      return { kind: 'discard', seat: p, card: NJ.aiChooseDiscard(me) };
    }
    return null;
  }

  // 供 AI 轮转使用的"谁该动"
  function waitingSeat(state) {
    if (state.over) return -1;
    if (state.phase === 'claim') {
      var cur = state.claimQueue[state.claimIdx];
      return cur ? cur.p : -1;
    }
    if (state.phase === 'discard') return state.turn;
    return -1;
  }

  return {
    createGame: createGame, discard: discard, respond: respond, selfAction: selfAction,
    viewFor: viewFor, botAct: botAct, waitingSeat: waitingSeat, canSelfHu: canSelfHu,
    dealAll: dealAll
  };
});
