/* 南京麻将 · 牌面绘制（SVG，传统牙牌画风） */
(function (root) {
  'use strict';
  var CN = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
  var FLOWER = ['春', '夏', '秋', '冬', '梅', '兰', '竹', '菊'];
  var INK = '#1a1a1a', RED = '#b02a20', RED2 = '#8f1f18';
  var GRN = '#17713e', GRN2 = '#2c9555', BLU = '#254e6b', GOLD = '#8f6b1f';
  var DARK = '#2e3235';
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
    return text(30, 29, 30, INK, CN[n], 700) + text(30, 65, 32, RED, '萬', 700);
  }

  function tiao(n) {
    var s = '';
    if (n === 1) {
      // 一条：翠鸟（侧立，三根细长尾羽，朱喙朱冠）
      return '<g>' +
        // 尾羽（三根细羽）
        '<path d="M24,53 C17,57 10,59 4,59" stroke="' + GRN + '" stroke-width="3.6" stroke-linecap="round" fill="none"/>' +
        '<path d="M24,56 C17,61 11,65 7,70" stroke="' + GRN2 + '" stroke-width="3.2" stroke-linecap="round" fill="none"/>' +
        '<path d="M25,59 C22,64 20,69 19,74" stroke="' + GRN + '" stroke-width="2.8" stroke-linecap="round" fill="none"/>' +
        // 腿爪
        '<path d="M28,59 L27,69 M33,59 L34,69" stroke="#1f7a49" stroke-width="2" stroke-linecap="round"/>' +
        '<path d="M27,69 L22,72 M27,69 L28,74 M34,69 L39,72 M34,69 L33,74" stroke="#1f7a49" stroke-width="1.5" stroke-linecap="round"/>' +
        // 身体
        '<ellipse cx="30" cy="46" rx="10.6" ry="13.6" fill="' + GRN + '" transform="rotate(-6 30 46)"/>' +
        // 胸腹亮面
        '<path d="M33,34 C39,41 39,53 33,59 C36,51 36,42 33,34 Z" fill="' + GRN2 + '" opacity=".75"/>' +
        // 翅膀
        '<ellipse cx="26" cy="47" rx="6.2" ry="9.4" fill="' + GRN2 + '" transform="rotate(-8 26 47)"/>' +
        '<path d="M24,42 C21,46 21,52 24,55 M27,41 C24,45 24,51 27,54" stroke="#0d5230" stroke-width="1" fill="none" opacity=".45"/>' +
        // 头
        '<circle cx="33.5" cy="27" r="7.6" fill="' + GRN + '"/>' +
        // 冠羽
        '<path d="M31,20 C31,15 35,12 40,13 C35,15 34,18 34,21 Z" fill="' + RED + '"/>' +
        // 喙
        '<path d="M40.5,25 L48,28.5 L40.5,32 Z" fill="' + RED + '"/>' +
        // 眼
        '<circle cx="36.5" cy="25.5" r="2.1" fill="#fff"/><circle cx="37.1" cy="25.5" r="1" fill="#12351f"/>' +
        '</g>';
    }
    if (n === 8) {
      // 八条：按参考牌面，两条粗竹带折成 M / W（左竖—上斜—下斜—右竖）
      var bar = function (d) {
        return '<path d="' + d + '" fill="none" stroke="#0d5433" stroke-width="8.2" stroke-linecap="round" stroke-linejoin="round"/>' +
          '<path d="' + d + '" fill="none" stroke="' + GRN2 + '" stroke-width="5.9" stroke-linecap="round" stroke-linejoin="round"/>' +
          '<path d="' + d + '" fill="none" stroke="#eef6ea" stroke-width="1.15" stroke-linecap="round" stroke-linejoin="round" opacity=".62"/>';
      };
      return bar('M14,10 L14,34 L30,18 L46,34 L46,10') +
        bar('M14,74 L14,50 L30,66 L46,50 L46,74');
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
      var red = (n === 3 && i === 0) || (n === 5 && i === 2) || (n === 7 && i === 0);
      s += stick(p[0], p[1], red ? h + 2 : h, red ? RED : GRN, red ? RED2 : '#0d5230');
    });
    return s;
  }

  /* 筒：严格按参考牌面排布（位置 + 配色） */
  function tong(n) {
    if (n === 1) {
      return '<g fill="none" stroke="' + GRN + '">' +
        '<circle cx="30" cy="42" r="22" stroke-width="4.2"/>' +
        '<circle cx="30" cy="42" r="13.5" stroke-width="2.2"/>' +
        '</g>' +
        '<circle cx="30" cy="42" r="8" fill="' + RED + '"/>' +
        '<circle cx="27.4" cy="39.4" r="2.4" fill="#fff" opacity=".45"/>' +
        '<g fill="' + GRN + '">' +
        '<circle cx="30" cy="13" r="2.1"/><circle cx="30" cy="71" r="2.1"/>' +
        '<circle cx="3" cy="42" r="2.1"/><circle cx="57" cy="42" r="2.1"/>' +
        '</g>';
    }
    var L = {
      // [x, y, r, color]
      2: [[30, 25, 14, GRN], [30, 60, 14, GRN]],
      3: [[17, 23, 12.5, GRN], [30, 42, 12.5, RED], [43, 61, 12.5, DARK]],
      4: [[19, 25, 12, GRN], [41, 25, 12, DARK], [19, 60, 12, DARK], [41, 60, 12, GRN]],
      5: [[17, 22, 11.5, GRN], [43, 22, 11.5, DARK], [30, 42, 11.5, RED],
          [17, 62, 11.5, DARK], [43, 62, 11.5, GRN]],
      6: [[20, 20, 10.4, GRN], [40, 20, 10.4, GRN],
          [20, 42, 10.4, RED], [40, 42, 10.4, RED],
          [20, 64, 10.4, RED], [40, 64, 10.4, RED]],
      7: [[16, 16, 8.5, GRN], [30, 27, 8.5, GRN], [44, 38, 8.5, RED],
          [20, 56, 7.9, GRN], [40, 56, 7.9, GRN], [20, 71, 7.9, GRN], [40, 71, 7.9, GRN]],
      // 八筒：2 列 × 4 行，深色（参考图排布）
      8: [[20, 14, 8.6, DARK], [40, 14, 8.6, DARK],
          [20, 32, 8.6, DARK], [40, 32, 8.6, DARK],
          [20, 50, 8.6, DARK], [40, 50, 8.6, DARK],
          [20, 68, 8.6, DARK], [40, 68, 8.6, DARK]],
      9: [[14, 17, 8.2, DARK], [30, 17, 8.2, DARK], [46, 17, 8.2, DARK],
          [14, 42, 8.2, RED], [30, 42, 8.2, RED], [46, 42, 8.2, RED],
          [14, 67, 8.2, GRN], [30, 67, 8.2, GRN], [46, 67, 8.2, GRN]]
    }[n] || [];
    var s = '';
    L.forEach(function (d) { s += dot(d[0], d[1], d[2], d[3], d[3]); });
    return s;
  }

  function honor(n) {
    if (n === 1) return text(30, 43, 46, INK, '東', 700);
    if (n === 2) return text(30, 43, 46, INK, '南', 700);
    if (n === 3) return text(30, 43, 46, INK, '西', 700);
    if (n === 4) return text(30, 43, 46, INK, '北', 700);
  }

  function hua(n) {
    if (n === 1) return text(30, 44, 46, RED, '中', 700);
    if (n === 2) return text(30, 44, 46, GRN, '發', 700);
    if (n === 3) {
      return '<rect x="16" y="19" width="28" height="46" rx="3" fill="none" stroke="' + BLU + '" stroke-width="4"/>' +
        '<rect x="22" y="25" width="16" height="34" rx="1.5" fill="none" stroke="' + BLU + '" stroke-width="1.4" opacity=".7"/>';
    }
    // 花牌：牌面只放一个汉字
    var ch = FLOWER[n - 4];
    return text(30, 44, 47, n <= 7 ? RED : GRN, ch, 700);
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
