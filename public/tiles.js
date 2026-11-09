/* 南京麻将 · 牌面绘制（SVG，传统牙牌画风） */
(function (root) {
  'use strict';
  var CN = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
  var FLOWER = ['春', '夏', '秋', '冬', '梅', '兰', '竹', '菊'];
  var INK = '#1a1a1a', RED = '#b02a20', RED2 = '#8f1f18';
  var GRN = '#17713e', GRN2 = '#2c9555', BLU = '#254e6b', GOLD = '#8f6b1f';
  var cache = {};

  function text(x, y, size, color, str, weight) {
    return '<text x="' + x + '" y="' + y + '" font-size="' + size + '" fill="' + color +
      '" text-anchor="middle" dominant-baseline="central" font-family="Songti SC,STSong,SimSun,Noto Serif CJK SC,serif" font-weight="' +
      (weight || 700) + '">' + str + '</text>';
  }

  /* 竹节（条） */
  function stick(cx, cy, h, color, dark) {
    var w = h * 0.42, x = cx - w / 2, y = cy - h / 2, r = w / 2;
    return '<g>' +
      '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="' + r + '" fill="' + color + '"/>' +
      '<rect x="' + (x + w * 0.2) + '" y="' + (y + h * 0.1) + '" width="' + (w * 0.22) + '" height="' + (h * 0.8) +
      '" rx="' + (w * 0.11) + '" fill="#fff" opacity=".22"/>' +
      '<rect x="' + x + '" y="' + (y + h * 0.33) + '" width="' + w + '" height="' + (h * 0.045) + '" fill="' + dark + '"/>' +
      '<rect x="' + x + '" y="' + (y + h * 0.62) + '" width="' + w + '" height="' + (h * 0.045) + '" fill="' + dark + '"/>' +
      '</g>';
  }

  /* 筒 */
  function dot(cx, cy, r, color, core) {
    return '<g fill="none" stroke="' + color + '">' +
      '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" stroke-width="' + (r * 0.26) + '"/>' +
      '<circle cx="' + cx + '" cy="' + cy + '" r="' + (r * 0.44) + '" stroke-width="' + (r * 0.2) + '"/>' +
      '</g><circle cx="' + cx + '" cy="' + cy + '" r="' + (r * 0.17) + '" fill="' + (core || color) + '"/>';
  }

  function wan(n) {
    return text(30, 33, 33, INK, CN[n], 700) + text(30, 68, 34, RED, '萬', 700);
  }

  function tiao(n) {
    var s = '';
    if (n === 1) {
      // 一条：翠鸟（侧身立于枝上）
      return '<g transform="translate(31,40)">' +
        '<path d="M-2,20 q-2,10 -8,14" stroke="' + GRN + '" stroke-width="2" fill="none" stroke-linecap="round"/>' +
        '<path d="M6,20 q2,10 -2,15" stroke="' + GRN + '" stroke-width="2" fill="none" stroke-linecap="round"/>' +
        '<path d="M-8,33 l-5,2 M-8,33 l1,5" stroke="' + GRN + '" stroke-width="1.6" stroke-linecap="round"/>' +
        '<path d="M-4,35 l-4,3 M-4,35 l2,4" stroke="' + GRN + '" stroke-width="1.6" stroke-linecap="round"/>' +
        '<path d="M-9,16 q-9,-2 -19,-12 q7,14 17,17z" fill="' + GRN + '"/>' +
        '<path d="M-6,18 q-8,3 -16,0 q8,8 17,5z" fill="' + GRN2 + '" opacity=".9"/>' +
        '<ellipse cx="0" cy="3" rx="13" ry="16" fill="' + GRN + '" transform="rotate(-9)"/>' +
        '<path d="M-10,2 q8,-9 15,-2 q-6,10 -14,7z" fill="' + GRN2 + '"/>' +
        '<path d="M-6,4 q6,-4 9,0" stroke="#0d5230" stroke-width="1" fill="none" opacity=".55"/>' +
        '<circle cx="7" cy="-14" r="9" fill="' + GRN + '"/>' +
        '<path d="M15,-16 L27,-12.5 L15,-9 Z" fill="' + RED + '"/>' +
        '<circle cx="9" cy="-16.5" r="2.2" fill="#fff"/><circle cx="9.6" cy="-16.5" r="1" fill="#12351f"/>' +
        '<path d="M3,-22 q2,-7 8,-8 q-4,4 -4,8z" fill="' + RED + '"/>' +
        '<path d="M-13,4 q-6,4 -9,9" stroke="' + RED + '" stroke-width="1.6" fill="none" opacity=".75"/>' +
        '</g>';
    }
    var V = [
      [], [],
      [[30, 25], [30, 59]],
      [[30, 15], [20, 58], [40, 58]],
      [[19, 22], [41, 22], [19, 60], [41, 60]],
      [[17, 18], [43, 18], [30, 42], [17, 66], [43, 66]],
      [[12, 24], [30, 24], [48, 24], [12, 60], [30, 60], [48, 60]],
      [[30, 12], [12, 40], [30, 40], [48, 40], [12, 66], [30, 66], [48, 66]],
      [[9, 23], [23, 23], [37, 23], [51, 23], [9, 61], [23, 61], [37, 61], [51, 61]],
      [[12, 15], [30, 15], [48, 15], [12, 42], [30, 42], [48, 42], [12, 69], [30, 69], [48, 69]]
    ][n];
    var h = [0, 0, 26, 24, 28, 26, 26, 20, 25, 20][n];
    V.forEach(function (p, i) {
      var red = (n === 5 && i === 2) || (n === 7 && i === 0);
      s += stick(p[0], p[1], red ? h + 2 : h, red ? RED : GRN, red ? RED2 : '#0d5230');
    });
    return s;
  }

  function tong(n) {
    var color = (n === 8 || n === 9) ? BLU : (n === 1 ? GRN : GRN);
    var s = '';
    if (n === 1) {
      return '<g fill="none" stroke="' + GRN + '">' +
        '<circle cx="30" cy="42" r="23" stroke-width="4"/>' +
        '<circle cx="30" cy="42" r="15" stroke-width="2.4"/>' +
        '</g>' +
        '<circle cx="30" cy="42" r="8.5" fill="' + RED + '"/>' +
        '<circle cx="30" cy="42" r="3" fill="#fff" opacity=".55"/>' +
        '<g fill="' + GRN + '" opacity=".85">' +
        '<circle cx="30" cy="13" r="2.2"/><circle cx="30" cy="71" r="2.2"/>' +
        '<circle cx="1.5" cy="42" r="2.2"/><circle cx="58.5" cy="42" r="2.2"/>' +
        '</g>';
    }
    var V = [
      [], [], [[30, 24], [30, 60]],
      [[16, 18], [30, 42], [44, 66]],
      [[19, 24], [41, 24], [19, 60], [41, 60]],
      [[18, 20], [42, 20], [30, 42], [18, 64], [42, 64]],
      [[20, 16], [40, 16], [20, 42], [40, 42], [20, 68], [40, 68]],
      [[13, 15], [30, 21], [47, 27], [19, 52], [41, 52], [19, 71], [41, 71]],
      [[10, 23], [24, 23], [38, 23], [52, 23], [10, 60], [24, 60], [38, 60], [52, 60]],
      [[13, 16], [30, 16], [47, 16], [13, 42], [30, 42], [47, 42], [13, 68], [30, 68], [47, 68]]
    ][n];
    var r = [0, 0, 13, 12, 12, 11, 10.5, 9, 8, 9][n];
    V.forEach(function (p, i) {
      var center = (n === 5 && i === 2);
      s += dot(p[0], p[1], center ? r + 1 : r, center ? RED : color, center ? RED : (n === 5 ? RED : color));
    });
    return s;
  }

  function honor(n) {
    if (n === 1) return text(30, 43, 46, INK, '東', 700);
    if (n === 2) return text(30, 43, 46, INK, '南', 700);
    if (n === 3) return text(30, 43, 46, INK, '西', 700);
    if (n === 4) return text(30, 43, 46, INK, '北', 700);
  }

  function hua(n) {
    if (n === 1) return text(30, 43, 44, RED, '中', 700);
    if (n === 2) return text(30, 43, 44, GRN, '發', 700);
    if (n === 3) {
      return '<rect x="17" y="20" width="26" height="44" rx="3" fill="none" stroke="' + BLU + '" stroke-width="4"/>' +
        '<rect x="22" y="25" width="16" height="34" rx="1.5" fill="none" stroke="' + BLU + '" stroke-width="1.4" opacity=".7"/>';
    }
    var ch = FLOWER[n - 4];
    return text(30, 36, 30, n <= 7 ? GRN : GOLD, ch, 700) +
      '<rect x="24" y="56" width="12" height="12" rx="2" fill="none" stroke="' + RED + '" stroke-width="2" opacity=".75"/>' +
      '<circle cx="30" cy="62" r="2" fill="' + RED + '" opacity=".75"/>';
  }

  function face(card) {
    var suit = card[0], n = parseInt(card.slice(1), 10);
    if (suit === 'w') return wan(n);
    if (suit === 't') return tiao(n);
    if (suit === 'b') return tong(n);
    if (suit === 'f') return honor(n);
    if (suit === 'h') return hua(n);
    return '';
  }

  function svg(card) {
    if (cache[card]) return cache[card];
    var out = '<svg class="tsvg" viewBox="0 0 60 84" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
      '<rect x="0" y="0" width="60" height="84" rx="6" fill="#fbf7ea"/>' +
      '<rect x="0.8" y="0.8" width="58.4" height="82.4" rx="5.4" fill="none" stroke="#e2d9bf" stroke-width="1.2"/>' +
      face(card) + '</svg>';
    cache[card] = out;
    return out;
  }

  function backSvg() {
    return '<svg class="tsvg" viewBox="0 0 60 84" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
      '<defs><linearGradient id="bk" x1="0" y1="0" x2="1" y2="1">' +
      '<stop offset="0" stop-color="#2b7d5d"/><stop offset=".55" stop-color="#1a6047"/><stop offset="1" stop-color="#124a37"/>' +
      '</linearGradient></defs>' +
      '<rect x="0" y="0" width="60" height="84" rx="6" fill="url(#bk)"/>' +
      '<rect x="4" y="4" width="52" height="76" rx="4" fill="none" stroke="#8fd3b4" stroke-width="1.4" opacity=".45"/>' +
      '<g stroke="#8fd3b4" stroke-width="1.1" opacity=".22" fill="none">' +
      '<path d="M12,14 L30,26 L48,14"/><path d="M12,42 L30,54 L48,42"/><path d="M12,70 L30,82 L48,70"/>' +
      '<path d="M12,14 L12,70"/><path d="M48,14 L48,70"/>' +
      '</g>' +
      '<circle cx="30" cy="42" r="8" fill="none" stroke="#d8b96f" stroke-width="1.6" opacity=".55"/>' +
      '<circle cx="30" cy="42" r="3" fill="#d8b96f" opacity=".5"/>' +
      '</svg>';
  }

  root.NJTiles = { svg: svg, backSvg: backSvg, face: face };
})(typeof self !== 'undefined' ? self : this);
