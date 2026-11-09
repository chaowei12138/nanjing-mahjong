/* 南京麻将 · 牌桌特效（字幕砸击 / 冲击波 / 金粒 / 震屏） */
(function (root) {
  'use strict';
  var cvs, ctx, parts = [], raf = null, dpr = 1, W = innerWidth, H = innerHeight;

  function init() {
    cvs = document.getElementById('fx-canvas');
    if (!cvs) return;
    ctx = cvs.getContext('2d');
    resize();
    window.addEventListener('resize', resize);
  }

  function resize() {
    if (!cvs) return;
    var board = document.querySelector('#table .board');
    W = board ? board.clientWidth : innerWidth;
    H = board ? board.clientHeight : innerHeight;
    if (!W || !H) { W = innerWidth; H = innerHeight; }
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    cvs.width = Math.floor(W * dpr);
    cvs.height = Math.floor(H * dpr);
    cvs.style.width = W + 'px';
    cvs.style.height = H + 'px';
  }

  function add(p) { parts.push(p); }

  function burst(x, y, n, opt) {
    opt = opt || {};
    for (var i = 0; i < n; i++) {
      var a = Math.random() * Math.PI * 2;
      var sp = (opt.speed || 4) * (0.35 + Math.random());
      add({
        x: x, y: y,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - (opt.lift || 1.6),
        g: opt.g === undefined ? 0.13 : opt.g,
        life: 1, decay: 0.012 + Math.random() * 0.014,
        size: (opt.size || 3) * (0.6 + Math.random()),
        color: opt.colors[Math.floor(Math.random() * opt.colors.length)],
        shape: opt.shape || 'circle', rot: Math.random() * 6.28, vr: (Math.random() - 0.5) * 0.3
      });
    }
    loop();
  }

  function confetti(n) {
    var colors = ['#ffe6a8', '#f3c463', '#d99b33', '#fff8e2', '#ffb35c', '#ffd166', '#e8622c'];
    for (var i = 0; i < n; i++) {
      add({
        x: W / 2 + (Math.random() - 0.5) * W * 0.5,
        y: H * 0.42 + (Math.random() - 0.5) * H * 0.18,
        vx: (Math.random() - 0.5) * 9,
        vy: -Math.random() * 11 - 2,
        g: 0.22, life: 1, decay: 0.0055 + Math.random() * 0.005,
        size: 3 + Math.random() * 5,
        color: colors[Math.floor(Math.random() * colors.length)],
        shape: Math.random() > 0.45 ? 'rect' : 'circle',
        rot: Math.random() * 6.28, vr: (Math.random() - 0.5) * 0.45
      });
    }
    loop();
  }

  function loop() {
    if (raf) return;
    var last = performance.now();
    function tick(now) {
      var dt = Math.min((now - last) / 16.67, 2.2); last = now;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      for (var i = parts.length - 1; i >= 0; i--) {
        var p = parts[i];
        p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt;
        p.vx *= 0.995; p.rot += p.vr * dt;
        p.life -= p.decay * dt * 1.6;
        if (p.life <= 0 || p.y > H + 40) { parts.splice(i, 1); continue; }
        ctx.globalAlpha = Math.max(p.life, 0);
        ctx.fillStyle = p.color;
        if (p.shape === 'rect') {
          ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
          ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
          ctx.restore();
        } else {
          ctx.beginPath(); ctx.arc(p.x, p.y, p.size * 0.6, 0, 6.283); ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
      if (parts.length) { raf = requestAnimationFrame(tick); }
      else { raf = null; ctx.clearRect(0, 0, W, H); }
    }
    raf = requestAnimationFrame(tick);
  }

  function flash(color) {
    var d = document.createElement('div');
    d.className = 'fx-flash';
    if (color) d.style.background = color;
    document.body.appendChild(d);
    setTimeout(function () { d.remove(); }, 480);
  }

  function shake() {
    var b = document.querySelector('.board');
    if (!b) return;
    b.classList.remove('fx-shake');
    void b.offsetWidth;
    b.classList.add('fx-shake');
    setTimeout(function () { b.classList.remove('fx-shake'); }, 480);
  }

  function charFx(text, cls, sub) {
    var layer = document.getElementById('fx-layer');
    if (!layer) return;
    var wrap = document.createElement('div');
    wrap.className = 'fx-char-wrap ' + (cls || '');
    var ring = document.createElement('div'); ring.className = 'fx-ring';
    var ring2 = document.createElement('div'); ring2.className = 'fx-ring r2';
    var el = document.createElement('div'); el.className = 'fx-char ' + (cls || '');
    el.textContent = text;
    wrap.appendChild(ring); wrap.appendChild(ring2); wrap.appendChild(el);
    if (sub) {
      var s = document.createElement('div'); s.className = 'fx-sub'; s.textContent = sub;
      wrap.appendChild(s);
    }
    layer.appendChild(wrap);
    setTimeout(function () { wrap.remove(); }, 1500);
  }

  function center() { return { x: W / 2, y: H * 0.42 }; }

  root.NJFx = {
    init: init,
    resize: resize,
    peng: function (sub) {
      var c = center();
      charFx('碰', 'peng', sub);
      flash('rgba(240,210,140,.16)');
      burst(c.x, c.y, 44, { speed: 6.5, size: 3.4, colors: ['#fff3cf', '#f0c96e', '#e0a33c', '#fffdf5'], lift: 2.6 });
      shake();
    },
    gang: function (sub) {
      var c = center();
      charFx('杠', 'gang', sub);
      flash('rgba(180,220,190,.16)');
      burst(c.x, c.y, 52, { speed: 7, size: 3.6, colors: ['#d8ffe9', '#8fe6b6', '#4fbd82', '#f2fff8'], lift: 2.8 });
      shake();
    },
    hu: function (sub) {
      var c = center();
      charFx('胡', 'hu', sub);
      flash('rgba(255,215,140,.22)');
      burst(c.x, c.y, 110, { speed: 11, size: 4.2, colors: ['#ffe6a8', '#f3c463', '#fff8e2', '#ffb35c', '#e8622c'], lift: 3.4 });
      confetti(130);
      setTimeout(function () { burst(c.x, c.y, 60, { speed: 8, size: 3.4, colors: ['#fff8e2', '#ffd166'], lift: 4 }); }, 180);
      shake();
    },
    zimo: function () {
      var c = center();
      burst(c.x, c.y - 40, 40, { speed: 6, size: 3, colors: ['#fff3cf', '#f0c96e'], lift: 3 });
    },
    tap: function (x, y) {
      burst(x, y, 6, { speed: 2.4, size: 2, colors: ['#e8dcc0'], lift: 0.6, g: 0.18 });
    }
  };
})(typeof self !== 'undefined' ? self : this);
