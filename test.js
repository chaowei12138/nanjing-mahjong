const NJ = require('./public/core.js');
const RNG = require('./public/rng.js');
const G = require('./public/game.js');

let pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name); }
}

console.log('\n[1] 牌墙');
const wall = NJ.buildWall();
ok('牌数 144', wall.length === 144);
const c = NJ.countsOf(wall);
ok('万条筒各 36', ['w', 't', 'b'].every(s => {
  let n = 0; for (let k in c) if (k[0] === s) n += c[k]; return n === 36;
}));
ok('风牌 16', Object.keys(c).filter(k => k[0] === 'f').reduce((a, k) => a + c[k], 0) === 16);
ok('花牌 20', Object.keys(c).filter(k => k[0] === 'h').reduce((a, k) => a + c[k], 0) === 20);

console.log('\n[2] 胡牌判定');
const win1 = ['w1', 'w2', 'w3', 'w4', 'w5', 'w6', 'w7', 'w8', 'w9', 't1', 't1', 't1', 'f1', 'f1'];
ok('三顺+刻子+将', NJ.isWin(win1, 0));
const win2 = ['w1', 'w1', 'w2', 'w2', 'w3', 'w3', 'w4', 'w4', 't1', 't1', 't2', 't2', 't3', 't3'];
ok('七对', NJ.isWin(win2, 0));
const notwin = ['w1', 'w2', 'w3', 'w4', 'w5', 'w6', 'w7', 'w8', 'w9', 't1', 't1', 't2', 'f1', 'f3'];
ok('不成型不胡', !NJ.isWin(notwin, 0));
const win3 = ['w1', 'w1', 'w1', 't3', 't4', 't5', 'b7', 'b8', 'b9', 'f2', 'f2'];
ok('带副露 11 张 + 1 副露', NJ.isWin(win3, 1));

console.log('\n[3] 听牌');
const t = NJ.tingList(win1.slice(0, 13), 0);
console.log('  听：', t.map(NJ.cardName).join(' '));

console.log('\n[4] 洗牌与可验证随机');
const seed = 'a'.repeat(64);
const r1 = RNG.createRng(seed);
const s1 = NJ.shuffle(NJ.buildWall(), r1);
const r2 = RNG.createRng(seed);
const s2 = NJ.shuffle(NJ.buildWall(), r2);
ok('同种子结果一致（可复现）', s1.join() === s2.join());
ok('洗牌后仍是 144 张', s1.length === 144);
ok('哈希稳定', RNG.sha256(s1.join(',')) === RNG.sha256(s2.join(',')));
ok('不同种子结果不同', (() => {
  const r3 = RNG.createRng('b'.repeat(64));
  return NJ.shuffle(NJ.buildWall(), r3).join() !== s1.join();
})());

// 均匀性：每张牌出现的频率应正比于它在牌堆中的张数
console.log('\n[5] 随机均匀性（首张牌 14400 次抽样）');
const freq = {};
for (let i = 0; i < 14400; i++) {
  const rr = RNG.createRng(RNG.randomHex(16));
  const sh = NJ.shuffle(NJ.buildWall(), rr);
  freq[sh[0]] = (freq[sh[0]] || 0) + 1;
}
const wallCnt = NJ.countsOf(wall);
let chi = 0;
for (const k in wallCnt) {
  const exp = 14400 * wallCnt[k] / 144;
  chi += ((freq[k] || 0) - exp) ** 2 / exp;
}
console.log('  牌种数', Object.keys(freq).length, '/ 42，卡方', chi.toFixed(2), '阈值(自由度41, p=0.001)≈75');
ok('分布符合理论比例（卡方检验通过）', chi < 75);
ok('覆盖全部 42 种牌', Object.keys(freq).length === 42);

console.log('\n[6] 开局与发牌');
const st = G.createGame({ names: ['A', 'B', 'C', 'D'] });
ok('4 家手牌 13 或 14', st.players.every((p, i) => p.hand.length === (i === st.dealer ? 14 : 13)));
ok('手牌无花牌', st.players.every(p => p.hand.every(x => !NJ.isFlower(x))));
ok('总数守恒', st.players.reduce((a, p) => a + p.hand.length + p.flowers.length, 0) + st.wall.length === 144);

console.log('\n[7] AI 出牌');
const d = NJ.aiChooseDiscard(st.players[1]);
ok('AI 能选出牌', typeof d === 'string' && st.players[1].hand.includes(d));

console.log('\n[8] 番型');
const ev = NJ.evaluateWin({
  hand: ['w1', 'w2', 'w3', 'w4', 'w5', 'w6', 'w7', 'w8', 'w9', 'w1', 'w1', 'w9', 'w9', 'w5'],
  melds: [], flowers: ['h1', 'h4'], selfDraw: true
});
console.log('  番型：', ev ? ev.fans.map(f => f.name + f.pt).join(' / ') + ' = ' + ev.total + '花' : 'null');
ok('能算出番型', !!ev);

// 小胡限制：破门清且 0 硬花，不能胡
const badWin = NJ.evaluateWin({
  hand: ['w1', 'w2', 'w3', 'w4', 'w5', 'w6', 'w7', 'w8', 'w9', 't1', 't1'],
  melds: [{ type: 'peng', card: 'f1' }], flowers: [], selfDraw: false
});
ok('非门清 + 0 硬花不能胡', badWin === null);
const goodWin = NJ.evaluateWin({
  hand: ['w1', 'w2', 'w3', 'w4', 'w5', 'w6', 'w7', 'w8', 'w9', 't1', 't1'],
  melds: [{ type: 'peng', card: 'f1' }], flowers: ['h1', 'h2', 'h3', 'h4'], selfDraw: false
});
ok('非门清 + 4 硬花可胡', !!goodWin);

console.log('\n[8.5] 胡牌按钮与结算判定一致（缺花不能胡不再弹胡按钮）');
// 构造：玩家1 破门清（有碰）、手牌差一张成胡，响应玩家0 打出的 t1
function claimState(drawCount, flowers) {
  const g = G.createGame({ names: ['A', 'B', 'C', 'D'] });
  const p = g.players[1];
  p.hand = ['w1','w2','w3','w4','w5','w6','w7','w8','w9','t1'];
  p.melds = [{ type: 'peng', card: 'f1', from: 0 }];
  p.flowers = flowers;
  g.drawCount = drawCount;
  g.lastDiscard = 't1'; g.lastPlayer = 0; g.phase = 'claim';
  g.claimQueue = NJ.claimsFor(g, 0, 't1'); g.claimIdx = 0;
  return g;
}
const lack = claimState(8, []);
ok('缺花破门清：牌型成立但 evaluateWin 判不能胡', NJ.evaluateWin({
  hand: NJ.sortHand(lack.players[1].hand.concat(['t1'])),
  melds: lack.players[1].melds, flowers: [], selfDraw: false
}) === null);
ok('缺花破门清：claimsFor 不再下发 hu 按钮',
  !NJ.claimsFor(lack, 0, 't1').some(c => c.p === 1 && c.actions.indexOf('hu') >= 0));
const rich = claimState(8, ['h1','h2','h3','h4']);
ok('硬花够 4 张：claimsFor 正常下发 hu',
  NJ.claimsFor(rich, 0, 't1').some(c => c.p === 1 && c.actions.indexOf('hu') >= 0));
const vRich = G.viewFor(rich, 1);
ok('响应阶段必有「过」按钮（不会卡住）', vRich.actions.some(a => a.type === 'pass'));
ok('点胡能被服务端接受（按钮与结算一致）', (() => {
  const r = G.respond(rich, 1, 'hu'); return r && !r.err && !!r.hu;
})());
const rich2 = claimState(8, ['h1','h2','h3','h4']);
ok('点「过」能正常推进', !G.respond(rich2, 1, 'pass').err);

console.log('\n[8.6] 动作 / 番种语音包');
const fs = require('fs');
const FX = ['peng','gang','angang','bugang','hu','zimo','dianpao','gangkai',
  'qys','hys','pph','qidui','hhqd','chhqd','menqing','tianhu','dihu','whg','qqdd'];
ok('19 个动作/番种语音文件齐全', FX.every(k => fs.existsSync('./public/voice/' + k + '.mp3')));

console.log('\n[9] 整局模拟（4 个 AI 打到底）');
let games = 0, huGames = 0, drawGames = 0;
for (let gi = 0; gi < 200; gi++) {
  const s = G.createGame({ names: ['A', 'B', 'C', 'D'], bots: [true, true, true, true] });
  let guard = 0;
  while (!s.over && guard++ < 600) {
    const a = G.botAct(s);
    if (!a) { console.log('  ! 卡住 phase=' + s.phase); break; }
    if (a.kind === 'discard') G.discard(s, a.seat, a.card);
    else if (a.kind === 'respond') G.respond(s, a.seat, a.act);
    else if (a.kind === 'self') G.selfAction(s, a.seat, a.act);
  }
  games++;
  if (s.over && s.result && s.result.type !== 'draw') huGames++;
  else if (s.over) drawGames++;
  if (guard >= 600) console.log('  ! 第' + gi + '局超步数');
}
console.log('  完成', games, '局：胡牌', huGames, '荒庄', drawGames);
ok('200 局全部正常结束', games === 200 && huGames + drawGames === 200);
ok('胡牌率合理(>30%)', huGames / games > 0.3);

console.log('\n结果：' + pass + ' 通过 / ' + fail + ' 失败\n');
process.exit(fail ? 1 : 0);
