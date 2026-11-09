/* 南京麻将 · 声音（Web Audio 实时合成，无外部音频文件） */
(function (root) {
  'use strict';
  var ctx = null, master = null, musicBus = null, sfxBus = null, voiceBus = null, fxVoiceBus = null;
  var started = false, timer = null, nextTime = 0, step = 0, melodyIdx = 4;
  var enabled = true;
  try { enabled = localStorage.getItem('nj_sound') !== '0'; } catch (e) {}

  /* 报牌语音（edge-tts 晓晓，女声，本地 mp3，解码后走 Web Audio） */
  var voiceOn = true;
  try { voiceOn = localStorage.getItem('nj_voice') !== '0'; } catch (e) {}
  var vbuf = {}, vloading = {}, vfetching = false;
  // 普通报牌（牌名 + 超时）与动作/番种报牌分开：后者走更响的通道，可连播多段
  var CARD_KEYS = ['w1','w2','w3','w4','w5','w6','w7','w8','w9',
    't1','t2','t3','t4','t5','t6','t7','t8','t9',
    'b1','b2','b3','b4','b5','b6','b7','b8','b9',
    'f1','f2','f3','f4','h1','h2','h3','timeout'];
  var FX_KEYS = ['peng','gang','angang','bugang','hu','zimo','dianpao','gangkai',
    'qys','hys','pph','qidui','hhqd','chhqd','menqing','tianhu','dihu','whg','qqdd'];
  var VOICE_KEYS = CARD_KEYS.concat(FX_KEYS);
  var VOICE_DIR = 'voice/';
  var VOICE_VER = '4';   // 语音包版本，改内容时递增，避免浏览器用旧缓存
  var FX_GAIN = 1.42;   // 动作/番种报牌比普通报牌略大

  var PENTA = [293.66, 329.63, 369.99, 440.00, 493.88, 587.33, 659.25, 739.99];
  var BASS = [73.42, 73.42, 110.00, 98.00];
  var BPM = 74, SPB = 60 / BPM;

  function init() {
    if (ctx) return ctx;
    var AC = root.AudioContext || root.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = 1; master.connect(ctx.destination);
    musicBus = ctx.createGain(); musicBus.gain.value = enabled ? 0.5 : 0; musicBus.connect(master);
    sfxBus = ctx.createGain(); sfxBus.gain.value = 1; sfxBus.connect(master);
    voiceBus = ctx.createGain(); voiceBus.gain.value = 1; voiceBus.connect(master);
    // 动作/番种专用通道：音量比普通报牌略大，且 duck 时不被压得过低
    fxVoiceBus = ctx.createGain(); fxVoiceBus.gain.value = FX_GAIN; fxVoiceBus.connect(master);
    return ctx;
  }

  function noiseBuf(dur) {
    var n = Math.floor(ctx.sampleRate * dur);
    var b = ctx.createBuffer(1, n, ctx.sampleRate), d = b.getChannelData(0);
    for (var i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }

  /* 拨弦音色：三角波 + 八度泛音，快速衰减 */
  function pluck(freq, when, gain, dur, bus) {
    var t = when || ctx.currentTime, g = gain || 0.12, d = dur || 1.1;
    var lp = ctx.createBiquadFilter(); lp.type = 'lowpass';
    lp.frequency.setValueAtTime(3200, t); lp.frequency.exponentialRampToValueAtTime(900, t + d);
    var out = ctx.createGain();
    out.gain.setValueAtTime(0, t);
    out.gain.linearRampToValueAtTime(g, t + 0.008);
    out.gain.exponentialRampToValueAtTime(0.0008, t + d);
    lp.connect(out); out.connect(bus || musicBus);

    var o1 = ctx.createOscillator(); o1.type = 'triangle'; o1.frequency.value = freq;
    var o2 = ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = freq * 2.002;
    var g2 = ctx.createGain(); g2.gain.value = 0.32;
    o1.connect(lp); o2.connect(g2); g2.connect(lp);
    o1.start(t); o2.start(t); o1.stop(t + d + 0.05); o2.stop(t + d + 0.05);
  }

  function bassNote(freq, when) {
    var t = when, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine'; o.frequency.value = freq;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.09, t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0006, t + 3.4);
    o.connect(g); g.connect(musicBus); o.start(t); o.stop(t + 3.5);
  }

  function pad(freqs, when) {
    freqs.forEach(function (f, i) {
      var t = when, o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine'; o.frequency.value = f; o.detune.value = i % 2 ? 4 : -4;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.028, t + 1.4);
      g.gain.linearRampToValueAtTime(0.0005, t + 5.2);
      o.connect(g); g.connect(musicBus); o.start(t); o.stop(t + 5.3);
    });
  }

  function schedule() {
    if (!ctx || !started) return;
    var horizon = ctx.currentTime + 0.35;
    while (nextTime < horizon) {
      var t = nextTime;
      // 旋律：五声音阶随机游走，留白更自然
      if (step % 2 === 0 && Math.random() > 0.22) {
        melodyIdx += [-2, -1, -1, 0, 1, 1, 2][Math.floor(Math.random() * 7)];
        if (melodyIdx < 0) melodyIdx = 0;
        if (melodyIdx > PENTA.length - 1) melodyIdx = PENTA.length - 1;
        pluck(PENTA[melodyIdx], t, 0.1 + Math.random() * 0.04, 0.9 + Math.random() * 0.5);
      }
      // 低音，每两拍
      if (step % 4 === 0) bassNote(BASS[Math.floor(step / 8) % 4], t);
      // 和声铺底，每 16 步
      if (step % 16 === 0) pad([146.83, 220.00, 293.66], t);
      nextTime += SPB / 2;
      step++;
    }
  }

  function startMusic() {
    if (!enabled) return;
    if (!init()) return;
    if (ctx.state === 'suspended') ctx.resume();
    if (started) return;
    started = true;
    nextTime = ctx.currentTime + 0.2;
    step = 0; melodyIdx = 4;
    schedule();
    timer = setInterval(schedule, 200);
  }

  function stopMusic() {
    started = false;
    if (timer) { clearInterval(timer); timer = null; }
  }

  function setEnabled(v) {
    enabled = !!v;
    try { localStorage.setItem('nj_sound', enabled ? '1' : '0'); } catch (e) {}
    if (musicBus) musicBus.gain.setTargetAtTime(enabled ? 0.5 : 0, ctx.currentTime, 0.15);
    if (enabled) startMusic(); else stopMusic();
  }

  function tone(freq, when, dur, gain, type) {
    var o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type || 'sine'; o.frequency.setValueAtTime(freq, when);
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(gain, when + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0005, when + dur);
    o.connect(g); g.connect(sfxBus); o.start(when); o.stop(when + dur + 0.05);
  }

  function noise(when, dur, gain, freq, q) {
    var s = ctx.createBufferSource(); s.buffer = noiseBuf(dur);
    var f = ctx.createBiquadFilter(); f.type = 'bandpass';
    f.frequency.value = freq || 1200; f.Q.value = q || 1.2;
    var g = ctx.createGain();
    g.gain.setValueAtTime(gain, when);
    g.gain.exponentialRampToValueAtTime(0.0005, when + dur);
    s.connect(f); f.connect(g); g.connect(sfxBus);
    s.start(when); s.stop(when + dur);
  }

  function sfx(name) {
    if (!enabled || !init()) return;
    if (ctx.state === 'suspended') ctx.resume();
    var t = ctx.currentTime;
    if (name === 'tap') {
      noise(t, 0.05, 0.18, 2600, 2.5);
      tone(880, t, 0.07, 0.05, 'triangle');
    } else if (name === 'deal') {
      noise(t, 0.04, 0.12, 3200, 2);
    } else if (name === 'peng') {
      noise(t, 0.16, 0.42, 780, 1.1);
      tone(196, t, 0.28, 0.28, 'sine');
      tone(392, t + 0.01, 0.2, 0.12, 'square');
      noise(t + 0.05, 0.3, 0.12, 4200, 3);
    } else if (name === 'gang') {
      noise(t, 0.2, 0.4, 520, 0.9);
      tone(147, t, 0.42, 0.3, 'sine');
      tone(294, t, 0.3, 0.14, 'triangle');
      noise(t + 0.06, 0.4, 0.14, 3000, 2.4);
    } else if (name === 'hu') {
      // 古筝刮奏 + 锣
      var seq = [293.66, 369.99, 440.00, 587.33, 739.99, 880.00];
      seq.forEach(function (f, i) { pluck(f, t + i * 0.07, 0.2, 1.6, sfxBus); });
      noise(t + 0.3, 1.6, 0.16, 900, 0.7);
      tone(110, t + 0.3, 1.8, 0.22, 'sine');
      tone(165, t + 0.3, 1.4, 0.1, 'sine');
      for (var i = 0; i < 5; i++) tone(1760 + i * 220, t + 0.42 + i * 0.06, 0.5, 0.03, 'sine');
    } else if (name === 'win') {
      [523.25, 659.25, 783.99, 1046.5].forEach(function (f, i) { tone(f, t + i * 0.09, 0.5, 0.1, 'triangle'); });
    }
  }

  /* ---------- 报牌女声（mp3 解码后走 Web Audio，iOS 也能稳定播放） ---------- */
  function loadOne(key) {
    if (vbuf[key] || vloading[key] || !ctx) return;
    vloading[key] = true;
    fetch(VOICE_DIR + key + '.mp3?v=' + VOICE_VER)
      .then(function (r) { if (!r.ok) throw new Error('voice 404'); return r.arrayBuffer(); })
      .then(function (b) { return ctx.decodeAudioData(b); })
      .then(function (buf) { vbuf[key] = buf; })
      .catch(function () {})
      .then(function () { vloading[key] = false; });
  }

  function preloadVoices() {
    if (vfetching || !ctx) return;
    vfetching = true;
    var i = 0;
    (function next() {
      if (i >= VOICE_KEYS.length) return;
      loadOne(VOICE_KEYS[i++]);
      setTimeout(next, 30);
    })();
  }

  var curVoice = null;
  function playBuffer(buf) {
    if (curVoice) { try { curVoice.stop(); } catch (e) {} }
    var s = ctx.createBufferSource(), g = ctx.createGain();
    s.buffer = buf; g.gain.value = 1;
    s.connect(g); g.connect(voiceBus);
    s.start(0);
    curVoice = s;
    s.onended = function () { if (curVoice === s) curVoice = null; };
  }

  function duck() {
    if (!musicBus || !enabled) return;
    var t = ctx.currentTime;
    musicBus.gain.cancelScheduledValues(t);
    musicBus.gain.setValueAtTime(musicBus.gain.value, t);
    musicBus.gain.linearRampToValueAtTime(0.14, t + 0.08);
    musicBus.gain.setTargetAtTime(0.5, t + 0.7, 0.35);
  }

  // 极端浏览器兜底：系统中文语音合成
  function sysSay(text) {
    try {
      var S = root.speechSynthesis, U = root.SpeechSynthesisUtterance;
      if (!S || !U) return;
      var u = new U(text);
      u.lang = 'zh-CN'; u.rate = 0.95; u.pitch = 1.12; u.volume = 1;
      var vs = S.getVoices() || [];
      for (var i = 0; i < vs.length; i++) {
        if (/zh|Chinese/i.test(vs[i].lang + ' ' + vs[i].name)) { u.voice = vs[i]; break; }
      }
      S.cancel(); S.speak(u);
    } catch (e) {}
  }

  /* ---------- 动作 / 番种报牌：更响、可连播、优先级高于普通报牌 ---------- */
  var curFx = null, fxQueue = [], fxActive = false;

  function stopFx() {
    // 摘掉 onended 再停，避免旧队列的回调抢跑新队列
    if (curFx) { curFx.onended = null; try { curFx.stop(); } catch (e) {} curFx = null; }
  }

  function startFx(item) {
    if (!vbuf[item.key]) return false;
    // 打断尚未播完的普通报牌，让动作语音先说清楚
    if (curVoice) { try { curVoice.stop(); } catch (e) {} curVoice = null; }
    var s = ctx.createBufferSource(), g = ctx.createGain();
    s.buffer = vbuf[item.key]; g.gain.value = 1;
    s.connect(g); g.connect(fxVoiceBus);
    s.onended = function () {
      if (curFx === s) curFx = null;
      setTimeout(playNextFx, 100);   // 两句之间留一点气口
    };
    s.start(0);
    curFx = s;
    duck();
    return true;
  }

  function playNextFx() {
    if (!fxQueue.length) { fxActive = false; return; }
    var item = fxQueue.shift();
    if (startFx(item)) return;
    loadOne(item.key);
    // 语音包还没解码完，短暂等待后重试；实在没有就用系统语音兜底
    var tries = 0;
    var wait = setInterval(function () {
      if (vbuf[item.key]) {
        clearInterval(wait);
        if (fxActive) startFx(item); else playNextFx();
      } else if (++tries > 25) {
        clearInterval(wait);
        if (item.text) sysSay(item.text);
        setTimeout(playNextFx, 350);
      }
    }, 60);
  }

  // items: [{ key:'peng', text:'碰' }, ...]，依次播报
  function callFx(items) {
    if (!voiceOn || !items || !items.length) return false;
    if (!init()) { sysSay(items[0].text || ''); return false; }
    if (ctx.state === 'suspended') { try { ctx.resume(); } catch (e) {} }
    stopFx();
    fxQueue = items.slice(0, 5);   // 最多连播 5 段，避免结算时报太久
    fxActive = true;
    playNextFx();
    return true;
  }

  function say(key, text) {
    if (!voiceOn) return false;
    // 动作/番种语音优先：正在播时不抢麦，避免把「碰」「清一色」打断
    if (fxActive) return true;
    if (!init()) { sysSay(text || ''); return false; }
    if (ctx.state === 'suspended') { try { ctx.resume(); } catch (e) {} }
    var buf = vbuf[key];
    if (buf) { playBuffer(buf); duck(); return true; }
    loadOne(key);
    setTimeout(function () {
      if (fxActive) return;
      if (vbuf[key]) { playBuffer(vbuf[key]); duck(); }
      else if (text) sysSay(text);
    }, 200);
    return true;
  }

  root.NJAudio = {
    init: init,
    start: startMusic,
    stop: stopMusic,
    sfx: sfx,
    say: say,
    call: callFx,
    preload: preloadVoices,
    isOn: function () { return enabled; },
    isVoiceOn: function () { return voiceOn; },
    voiceCount: function () { return Object.keys(vbuf).length; },
    fxGain: function () { return FX_GAIN; },
    toggle: function () { setEnabled(!enabled); return enabled; },
    toggleVoice: function () {
      voiceOn = !voiceOn;
      try { localStorage.setItem('nj_voice', voiceOn ? '1' : '0'); } catch (e) {}
      if (voiceOn) { fxActive = false; preloadVoices(); say('f1', '东风'); }
      else { fxQueue = []; fxActive = false; stopFx(); }
      return voiceOn;
    },
    unlock: function () {
      if (!init()) return;
      if (ctx.state === 'suspended') ctx.resume();
      if (enabled) startMusic();
      preloadVoices();
    }
  };
})(typeof self !== 'undefined' ? self : this);
