/* 可验证公平随机：SHA-256 承诺 + CSPRNG 派生 + 拒绝采样洗牌
 * 流程：开局公布 commit = H(serverSeed|round)；结束时公布 serverSeed，
 * 任何玩家可用 verifyDeal() 重放洗牌，逐张比对，证明牌局未被篡改。 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.NJRng = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
  ];

  function rotr(x, n) { return (x >>> n) | (x << (32 - n)); }

  // 输入 ascii 字符串，输出 64 位 hex
  function sha256(str) {
    var bytes = [];
    for (var i = 0; i < str.length; i++) {
      var c = str.charCodeAt(i);
      if (c < 0x80) bytes.push(c);
      else if (c < 0x800) { bytes.push(0xc0 | (c >> 6), 0x80 | (c & 63)); }
      else { bytes.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63)); }
    }
    var bitLen = bytes.length * 8;
    bytes.push(0x80);
    while (bytes.length % 64 !== 56) bytes.push(0);
    var hi = Math.floor(bitLen / 0x100000000), lo = bitLen >>> 0;
    bytes.push((hi >>> 24) & 255, (hi >>> 16) & 255, (hi >>> 8) & 255, hi & 255);
    bytes.push((lo >>> 24) & 255, (lo >>> 16) & 255, (lo >>> 8) & 255, lo & 255);

    var h = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
    var w = new Array(64);

    for (var off = 0; off < bytes.length; off += 64) {
      for (var i2 = 0; i2 < 16; i2++) {
        var j = off + i2 * 4;
        w[i2] = (bytes[j] << 24) | (bytes[j + 1] << 16) | (bytes[j + 2] << 8) | bytes[j + 3];
      }
      for (var t = 16; t < 64; t++) {
        var s0 = rotr(w[t - 15], 7) ^ rotr(w[t - 15], 18) ^ (w[t - 15] >>> 3);
        var s1 = rotr(w[t - 2], 17) ^ rotr(w[t - 2], 19) ^ (w[t - 2] >>> 10);
        w[t] = (w[t - 16] + s0 + w[t - 7] + s1) | 0;
      }
      var a = h[0], b = h[1], c2 = h[2], d = h[3], e = h[4], f = h[5], g = h[6], hh = h[7];
      for (var t2 = 0; t2 < 64; t2++) {
        var S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
        var ch = (e & f) ^ (~e & g);
        var temp1 = (hh + S1 + ch + K[t2] + w[t2]) | 0;
        var S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
        var maj = (a & b) ^ (a & c2) ^ (b & c2);
        var temp2 = (S0 + maj) | 0;
        hh = g; g = f; f = e; e = (d + temp1) | 0;
        d = c2; c2 = b; b = a; a = (temp1 + temp2) | 0;
      }
      h[0] = (h[0] + a) | 0; h[1] = (h[1] + b) | 0; h[2] = (h[2] + c2) | 0; h[3] = (h[3] + d) | 0;
      h[4] = (h[4] + e) | 0; h[5] = (h[5] + f) | 0; h[6] = (h[6] + g) | 0; h[7] = (h[7] + hh) | 0;
    }
    var out = '';
    for (var i3 = 0; i3 < 8; i3++) {
      for (var j3 = 3; j3 >= 0; j3--) {
        var by = (h[i3] >>> (j3 * 8)) & 255;
        out += (by < 16 ? '0' : '') + by.toString(16);
      }
    }
    return out;
  }

  // 由种子派生确定性随机整数发生器（SHA-256 计数器模式）
  function createRng(seedHex) {
    var counter = 0, buf = [], pos = 0;
    function refill() {
      var h = sha256(seedHex + '|ctr:' + counter);
      counter++;
      for (var i = 0; i < h.length; i += 2) buf.push(parseInt(h.substr(i, 2), 16));
    }
    function nextByte() {
      if (pos >= buf.length) refill();
      return buf[pos++];
    }
    return function randInt(n) {
      if (n <= 1) return 0;
      var bits = Math.ceil(Math.log(n) / Math.LN2);
      var need = Math.ceil(bits / 8);
      var max = Math.pow(256, need);
      var limit = max - (max % n);
      for (;;) {
        var v = 0;
        for (var i = 0; i < need; i++) v = v * 256 + nextByte();
        if (v < limit) return v % n;
      }
    };
  }

  function randomHex(nBytes) {
    var a, i;
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      a = new Uint8Array(nBytes);
      crypto.getRandomValues(a);
    } else if (typeof require === 'function') {
      var nodeCrypto = require('crypto');
      a = nodeCrypto.randomBytes(nBytes);
    } else {
      throw new Error('无可用安全随机源');
    }
    var s = '';
    for (i = 0; i < a.length; i++) s += (a[i] < 16 ? '0' : '') + a[i].toString(16);
    return s;
  }

  function deriveSeed(serverSeed, salts, round) {
    return sha256([serverSeed].concat(salts || []).join(':') + '|round:' + round);
  }

  function commitOf(serverSeed, round) {
    return sha256(serverSeed + '|round:' + round);
  }

  return {
    sha256: sha256,
    createRng: createRng,
    randomHex: randomHex,
    deriveSeed: deriveSeed,
    commitOf: commitOf
  };
});
