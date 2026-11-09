/* 南京麻将核心引擎 —— 牌型、番型、AI、可验证随机 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.NJ = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ---------------- 牌 ---------------- */
  // w1-w9 万 | t1-t9 条 | b1-b9 筒 | f1-f4 东南西北 | h1-h3 中发白 | h4-h11 春夏秋冬梅兰竹菊
  var CN = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
  var FLOWER_CN = ['春', '夏', '秋', '冬', '梅', '兰', '竹', '菊'];
  var ORD = { w: 0, t: 1, b: 2, f: 3, h: 4 };

  function buildWall() {
    var w = [], s, n, i;
    var suits = ['w', 't', 'b'];
    for (var a = 0; a < 3; a++) {
      s = suits[a];
      for (n = 1; n <= 9; n++) for (i = 0; i < 4; i++) w.push(s + n);
    }
    for (n = 1; n <= 4; n++) for (i = 0; i < 4; i++) w.push('f' + n);
    for (n = 1; n <= 3; n++) for (i = 0; i < 4; i++) w.push('h' + n);
    for (n = 4; n <= 11; n++) w.push('h' + n);
    return w; // 144
  }

  function isFlower(c) { return c[0] === 'h'; }
  function isHonor(c) { return c[0] === 'f'; }

  function cardName(c) {
    var s = c[0], n = parseInt(c.slice(1), 10);
    if (s === 'w') return CN[n] + '万';
    if (s === 't') return CN[n] + '条';
    if (s === 'b') return CN[n] + '筒';
    if (s === 'f') return ['东', '南', '西', '北'][n - 1] + '风';
    if (s === 'h') return n <= 3 ? ['中', '发', '白'][n - 1] : FLOWER_CN[n - 4];
    return c;
  }

  function cmpCard(a, b) {
    var d = ORD[a[0]] - ORD[b[0]];
    return d !== 0 ? d : parseInt(a.slice(1), 10) - parseInt(b.slice(1), 10);
  }
  function sortHand(h) { return h.slice().sort(cmpCard); }

  /* ---------------- 洗牌 ---------------- */
  // randInt(n) 必须返回 [0, n) 的整数，由调用方提供密码学安全实现
  function shuffle(arr, randInt) {
    var a = arr.slice(), i, j, t;
    for (i = a.length - 1; i > 0; i--) {
      j = randInt(i + 1);
      t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  /* ---------------- 胡牌判定 ---------------- */
  function countsOf(tiles) {
    var m = {};
    for (var i = 0; i < tiles.length; i++) m[tiles[i]] = (m[tiles[i]] || 0) + 1;
    return m;
  }

  function canSplitAll(m) {
    var keys = Object.keys(m).filter(function (k) { return m[k] > 0; }).sort(cmpCard);
    if (!keys.length) return true;
    var k = keys[0];

    if (m[k] >= 3) {
      m[k] -= 3;
      if (canSplitAll(m)) { m[k] += 3; return true; }
      m[k] += 3;
    }
    var s = k[0], n = parseInt(k.slice(1), 10);
    if (s !== 'f' && s !== 'h' && n <= 7) {
      var k2 = s + (n + 1), k3 = s + (n + 2);
      if (m[k2] > 0 && m[k3] > 0) {
        m[k]--; m[k2]--; m[k3]--;
        if (canSplitAll(m)) { m[k]++; m[k2]++; m[k3]++; return true; }
        m[k]++; m[k2]++; m[k3]++;
      }
    }
    return false;
  }

  function isSevenPairs(m) {
    var pairs = 0;
    for (var k in m) {
      if (m[k] % 2 !== 0) return false;
      pairs += m[k] / 2;
    }
    return pairs === 7;
  }

  // hand: 手牌（含胡的那张）, meldCount: 副露组数
  function isWin(hand, meldCount) {
    if (hand.length + meldCount * 3 !== 14) return false;
    var m = countsOf(hand);
    if (meldCount === 0 && isSevenPairs(m)) return true;
    var keys = Object.keys(m);
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      if (m[k] >= 2) {
        m[k] -= 2;
        var ok = canSplitAll(m);
        m[k] += 2;
        if (ok) return true;
      }
    }
    return false;
  }

  // 听牌列表：返回可胡的牌数组
  function tingList(hand, meldCount) {
    var res = [];
    var all = buildKinds();
    for (var i = 0; i < all.length; i++) {
      var c = all[i];
      if (isWin(hand.concat([c]), meldCount)) res.push(c);
    }
    return res;
  }

  // 全部 34 种可参与组合的牌（不含花）
  var KINDS_CACHE = null;
  function buildKinds() {
    if (KINDS_CACHE) return KINDS_CACHE;
    var a = [], s, n;
    var suits = ['w', 't', 'b'];
    for (var i = 0; i < 3; i++) { s = suits[i]; for (n = 1; n <= 9; n++) a.push(s + n); }
    for (n = 1; n <= 4; n++) a.push('f' + n);
    KINDS_CACHE = a;
    return a;
  }

  /* ---------------- 番型 / 算花 ---------------- */
  // 南京麻将主流算花：基数 20，硬花每张 +1，软花累计
  function evaluateWin(o) {
    var hand = o.hand, melds = o.melds || [], flowers = o.flowers || [];
    var selfDraw = !!o.selfDraw, gangKai = o.gangKai || 0, isTian = !!o.isTian, isDi = !!o.isDi;

    // 先校验确实成胡，再算番
    if (!isWin(hand, melds.length)) return null;

    var all = hand.slice();
    melds.forEach(function (m) {
      var cnt = (m.type === 'peng') ? 3 : 4;
      for (var i = 0; i < cnt; i++) all.push(m.card);
    });

    var fans = [];
    var big = false;
    var add = function (name, pt, isBig) { fans.push({ name: name, pt: pt }); if (isBig) big = true; };

    // 门清：没有吃/碰/明杠（暗杠不算破门清）
    var menqing = !melds.some(function (m) { return m.type === 'peng' || m.type === 'gang' || m.type === 'bugang'; });

    // 七对
    var seven = melds.length === 0 && hand.length === 14 && isSevenPairs(countsOf(hand));
    var quads = 0;
    if (seven) {
      var cm = countsOf(hand);
      for (var k in cm) if (cm[k] === 4) quads++;
      if (quads >= 2) add('超豪华七对', 240, true);
      else if (quads === 1) add('豪华七对', 160, true);
      else add('七对', 80, true);
    }

    // 花色
    var suitSet = {};
    var hasHonor = false;
    all.forEach(function (c) {
      if (c[0] === 'f') hasHonor = true;
      else if (!isFlower(c)) suitSet[c[0]] = 1;
    });
    var suitCount = Object.keys(suitSet).length;

    if (!seven) {
      if (suitCount === 1 && !hasHonor) add('清一色', 60, true);
      else if (suitCount === 1 && hasHonor) add('混一色', 40, true);
    } else {
      if (suitCount === 1 && !hasHonor) add('清一色', 60, true);
      else if (suitCount === 1 && hasHonor) add('混一色', 40, true);
    }

    // 碰碰胡
    var allPeng = melds.every(function (m) { return m.type !== 'chi'; });
    if (!seven && allPeng && isAllTriplets(hand, melds)) add('碰碰胡', 40, true);

    // 全球独钓
    if (melds.length === 4 && hand.length === 1) add('全球独钓', 60, true);

    // 门清（七对不计门清）
    if (menqing && !seven) add('门清', 20, false);

    if (isTian) add('天胡', 60, true);
    if (isDi) add('地胡', 40, true);
    if (gangKai === 1) add('小杠开花', 20, false);
    if (gangKai === 2) add('大杠开花', 40, true);
    if (selfDraw) add('自摸', 0, false);

    // 无花果：一个硬花都没有，且必须是门清（否则不成立）
    if (flowers.length === 0 && menqing) add('无花果', 40, true);

    var hard = flowers.length; // 硬花数
    var soft = 0;
    melds.forEach(function (m) {
      if (m.type === 'gang') soft += 1;
      if (m.type === 'angang') soft += 2;
      if (m.type === 'bugang') soft += 1;
    });

    // 小胡限制：非门清且硬花 < 4 不能和
    if (!big && !menqing && hard < 4) return null;

    var total = 20 + hard + soft;
    fans.forEach(function (f) { total += f.pt; });

    return { fans: fans, hard: hard, soft: soft, total: total, menqing: menqing, seven: seven };
  }

  function isAllTriplets(hand, melds) {
    var m = countsOf(hand);
    var pairUsed = false;
    for (var k in m) {
      if (m[k] === 2 && !pairUsed) { pairUsed = true; continue; }
      if (m[k] !== 3) return false;
    }
    return pairUsed;
  }

  /* ---------------- 副露辅助 ---------------- */
  function meldCount(melds) { return melds.length; }

  /* ---------------- AI ---------------- */
  // 手牌结构打分：面子*10 + 搭子*3 + 对子*2
  function splitScore(m) {
    var best = 0;
    (function rec(mm, meld, partial, pair) {
      var keys = Object.keys(mm).filter(function (k) { return mm[k] > 0; }).sort(cmpCard);
      if (!keys.length) {
        best = Math.max(best, meld * 10 + partial * 3 + pair * 2);
        return;
      }
      var k = keys[0];
      // 刻子
      if (mm[k] >= 3) {
        mm[k] -= 3; rec(mm, meld + 1, partial, pair); mm[k] += 3;
      }
      // 顺子
      var s = k[0], n = parseInt(k.slice(1), 10);
      if (s !== 'f' && s !== 'h' && n <= 7) {
        var k2 = s + (n + 1), k3 = s + (n + 2);
        if (mm[k2] > 0 && mm[k3] > 0) {
          mm[k]--; mm[k2]--; mm[k3]--;
          rec(mm, meld + 1, partial, pair);
          mm[k]++; mm[k2]++; mm[k3]++;
        }
      }
      // 对子
      if (mm[k] >= 2) {
        mm[k] -= 2; rec(mm, meld, partial, pair + 1); mm[k] += 2;
      }
      // 搭子（连张/隔张）
      if (s !== 'f' && s !== 'h' && n <= 8) {
        var kk = s + (n + 1);
        if (mm[kk] > 0) {
          mm[k]--; mm[kk]--; rec(mm, meld, partial + 1, pair); mm[kk]++; mm[k]++;
        }
      }
      if (s !== 'f' && s !== 'h' && n <= 7) {
        var kj = s + (n + 2);
        if (mm[kj] > 0) {
          mm[k]--; mm[kj]--; rec(mm, meld, partial + 1, pair); mm[kj]++; mm[k]++;
        }
      }
      // 单张丢弃
      mm[k]--; rec(mm, meld, partial, pair); mm[k]++;
    })(Object.assign({}, m), 0, 0, 0);
    return best;
  }

  function handScore(tiles) {
    var m = countsOf(tiles);
    var best = splitScore(m);
    var keys = Object.keys(m);
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      if (m[k] >= 2) {
        m[k] -= 2;
        best = Math.max(best, splitScore(m) + 6);
        m[k] += 2;
      }
    }
    return best;
  }

  function aiChooseDiscard(pl) {
    var hand = pl.hand.slice();
    var melds = pl.melds || [];
    var bestCard = hand[0], bestScore = -1e9;
    var uniq = {};
    for (var i = 0; i < hand.length; i++) {
      var c = hand[i];
      if (uniq[c]) continue;
      uniq[c] = 1;
      var rest = hand.slice(0, i).concat(hand.slice(i + 1));
      var sc = handScore(rest);
      // 略微偏好打字牌/风牌
      if (c[0] === 'f') sc += 3;
      // 略微保留成对的
      var cnt = 0;
      for (var j = 0; j < hand.length; j++) if (hand[j] === c) cnt++;
      if (cnt === 1) sc += 1;
      if (sc > bestScore) { bestScore = sc; bestCard = c; }
    }
    return bestCard;
  }

  /* ---------------- 可行动作 ---------------- */
  function claimsFor(state, fromP, card) {
    var res = [];
    for (var i = 1; i <= 3; i++) {
      var p = (fromP + i) % 4;
      if (p === fromP) continue;
      var pl = state.players[p];
      if (pl.hand.length + pl.melds.length * 3 !== 13) continue;
      var acts = [];
      if (isWin(pl.hand.concat([card]), pl.melds.length)) acts.push('hu');
      var cnt = 0;
      for (var j = 0; j < pl.hand.length; j++) if (pl.hand[j] === card) cnt++;
      if (cnt >= 3) acts.push('gang');
      if (cnt >= 2) acts.push('peng');
      if (acts.length) res.push({ p: p, actions: acts });
    }
    return res;
  }

  function aiChooseAction(state, p, claim) {
    var pl = state.players[p];
    var acts = claim.actions;
    if (acts.indexOf('hu') >= 0) {
      var ev = evaluateWin({
        hand: sortHand(pl.hand.concat([state.lastDiscard])),
        melds: pl.melds, flowers: pl.flowers, selfDraw: false
      });
      if (ev) return 'hu';
    }
    if (acts.indexOf('gang') >= 0) {
      // 简单判断：杠不破坏听牌就杠
      return 'gang';
    }
    if (acts.indexOf('peng') >= 0) {
      var before = handScore(pl.hand);
      var rest = pl.hand.slice();
      var removed = 0;
      for (var i = 0; i < rest.length && removed < 2; i++) {
        if (rest[i] === state.lastDiscard) { rest.splice(i, 1); i--; removed++; }
      }
      if (handScore(rest) > before - 4) return 'peng';
    }
    return 'pass';
  }

  return {
    buildWall: buildWall, shuffle: shuffle, cardName: cardName, cmpCard: cmpCard, sortHand: sortHand,
    isFlower: isFlower, countsOf: countsOf, isWin: isWin, isSevenPairs: isSevenPairs,
    tingList: tingList, buildKinds: buildKinds, evaluateWin: evaluateWin,
    handScore: handScore, aiChooseDiscard: aiChooseDiscard, aiChooseAction: aiChooseAction,
    claimsFor: claimsFor, CN: CN, FLOWER_CN: FLOWER_CN
  };
});
