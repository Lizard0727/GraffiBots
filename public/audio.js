// 涂鸦机兵 GraffiBots — 原创音乐与音效（全部由 WebAudio 实时合成，无外部音频文件）
(function () {
  'use strict';
  // 1.7.1：latencyHint 'balanced'——音频缓冲大一点，电脑忙（加载、开局建场景）时不会因为来不及出声而一卡一卡
  const AC = (() => { if (!window.AudioContext) return null; try { return new window.AudioContext({ latencyHint: 'balanced' }); } catch (e) { return new window.AudioContext(); } })();
  const load = () => { try { return JSON.parse(localStorage.getItem('gb_audio')) || {}; } catch (e) { return {}; } };
  const cfg = Object.assign({ music: 0.55, sfx: 0.8, muted: false }, load());
  const save = () => { try { localStorage.setItem('gb_audio', JSON.stringify(cfg)); } catch (e) { /* ignore */ } };

  const A = { ctx: AC, cfg };
  if (!AC) {
    const noop = () => {};
    A.sfx = new Proxy({}, { get: () => noop });
    Object.assign(A, { music: noop, stopMusic: noop, resume: noop, setMusic: noop, setSfx: noop, toggleMute: () => false, current: () => null });
    window.GBAudio = A;
    return;
  }

  // ---------- 总线 ----------
  const master = AC.createGain();
  const comp = AC.createDynamicsCompressor();
  comp.threshold.value = -14; comp.ratio.value = 4; comp.attack.value = 0.005; comp.release.value = 0.2;
  master.connect(comp).connect(AC.destination);
  const musicBus = AC.createGain(), sfxBus = AC.createGain();
  musicBus.connect(master); sfxBus.connect(master);
  function applyVol() {
    master.gain.value = cfg.muted ? 0 : 1;
    musicBus.gain.value = cfg.music * 0.7;
    sfxBus.gain.value = cfg.sfx * 1.5;
  }
  applyVol();

  const noiseBuf = AC.createBuffer(1, AC.sampleRate * 1, AC.sampleRate);
  { const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
  const NOTE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  function parseNote(s) { // "F#5" -> midi
    const m = /^([A-G])(#|b)?(-?\d)$/.exec(s);
    if (!m) return null;
    return NOTE[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + (+m[3] + 1) * 12;
  }
  const melody = (str) => str.trim().split(/\s+/).map((t) => (t === '.' ? null : parseNote(t)));
  const nums = (str) => str.trim().split(/\s+/).map((t) => (t === '.' ? null : +t));

  // ---------- 乐器 ----------
  function noiseSrc(t, dur) { const s = AC.createBufferSource(); s.buffer = noiseBuf; s.start(t, Math.random() * 0.5); s.stop(t + dur); return s; }
  function kick(out, t, v) {
    const o = AC.createOscillator(), g = AC.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.13);
    g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.24);
    o.connect(g).connect(out); o.start(t); o.stop(t + 0.26);
  }
  function snare(out, t, v) {
    const n = noiseSrc(t, 0.18), f = AC.createBiquadFilter(), g = AC.createGain();
    f.type = 'highpass'; f.frequency.value = 1400;
    g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    n.connect(f).connect(g).connect(out);
    const o = AC.createOscillator(), g2 = AC.createGain();
    o.type = 'triangle'; o.frequency.setValueAtTime(200, t); o.frequency.exponentialRampToValueAtTime(120, t + 0.08);
    g2.gain.setValueAtTime(v * 0.7, t); g2.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
    o.connect(g2).connect(out); o.start(t); o.stop(t + 0.12);
  }
  function hat(out, t, v, open) {
    const d = open ? 0.2 : 0.045;
    const n = noiseSrc(t, d + 0.02), f = AC.createBiquadFilter(), g = AC.createGain();
    f.type = 'highpass'; f.frequency.value = 7500;
    g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    n.connect(f).connect(g).connect(out);
  }
  function bass(out, m, t, dur, v, type) {
    const o = AC.createOscillator(), f = AC.createBiquadFilter(), g = AC.createGain();
    o.type = type || 'sawtooth'; o.frequency.value = mtof(m);
    f.type = 'lowpass'; f.Q.value = 7;
    f.frequency.setValueAtTime(1400, t); f.frequency.exponentialRampToValueAtTime(260, t + Math.min(0.25, dur));
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + 0.008);
    g.gain.setValueAtTime(v, t + dur * 0.7); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(f).connect(g).connect(out); o.start(t); o.stop(t + dur + 0.02);
  }
  function lead(out, send, m, t, dur, v, type, cutoff) {
    const f = AC.createBiquadFilter(), g = AC.createGain();
    f.type = 'lowpass'; f.frequency.value = cutoff || 2800; f.Q.value = 2;
    const o1 = AC.createOscillator(), o2 = AC.createOscillator();
    o1.type = type || 'square'; o2.type = 'sawtooth';
    o1.frequency.value = mtof(m); o2.frequency.value = mtof(m); o2.detune.value = 9;
    const lfo = AC.createOscillator(), lg = AC.createGain();
    lfo.frequency.value = 5.5; lg.gain.value = dur > 0.3 ? 6 : 0;
    lfo.connect(lg); lg.connect(o1.detune); lg.connect(o2.detune);
    const g2 = AC.createGain(); g2.gain.value = 0.35;
    o1.connect(f); o2.connect(g2).connect(f);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + 0.012);
    g.gain.exponentialRampToValueAtTime(v * 0.6, t + 0.12);
    g.gain.setValueAtTime(v * 0.6, t + Math.max(0.12, dur - 0.04)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.08);
    f.connect(g); g.connect(out); if (send) g.connect(send);
    for (const o of [o1, o2, lfo]) { o.start(t); o.stop(t + dur + 0.1); }
  }
  function pad(out, notes, t, dur, v) {
    const f = AC.createBiquadFilter(), g = AC.createGain();
    f.type = 'lowpass'; f.frequency.value = 1100;
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(v, t + 0.35);
    g.gain.setValueAtTime(v, t + dur - 0.3); g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.2);
    f.connect(g).connect(out);
    for (const m of notes) for (const dt of [-8, 8]) {
      const o = AC.createOscillator(); o.type = 'sawtooth'; o.frequency.value = mtof(m); o.detune.value = dt;
      o.connect(f); o.start(t); o.stop(t + dur + 0.25);
    }
  }
  function pluck(out, send, m, t, v) {
    const o = AC.createOscillator(), g = AC.createGain(), f = AC.createBiquadFilter();
    o.type = 'triangle'; o.frequency.value = mtof(m);
    f.type = 'lowpass'; f.frequency.value = 3500;
    g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    o.connect(f).connect(g).connect(out); if (send) g.connect(send);
    o.start(t); o.stop(t + 0.2);
  }

  // ---------- 原创曲目 ----------
  // 和弦：root=贝斯根音，pad=和声；鼓谱 16 步；x=普通 X=重音 o=开镲
  const TRACKS = {
    // 主界面：「霓虹喷漆街」轻松律动，A 小调 96 BPM
    menu: {
      bpm: 96, swing: 0.12,
      chords: [
        { root: 45, pad: [57, 60, 64] }, { root: 41, pad: [57, 60, 65] }, { root: 48, pad: [55, 60, 64] }, { root: 43, pad: [55, 59, 62] },
        { root: 45, pad: [57, 60, 64] }, { root: 41, pad: [57, 60, 65] }, { root: 48, pad: [55, 60, 64] }, { root: 43, pad: [55, 59, 62] },
      ],
      kick: 'x.....x...x.....', snare: '....x.......x...', hat: '..x...x...x...xo',
      bass: nums('0 . . 0 . . 7 . 0 . . . 12 . 7 .'), bassType: 'triangle', bassVol: 0.32,
      lead: [
        'E5 . . . D5 . C5 . D5 . . . A4 . . .', 'C5 . . . D5 . E5 . . . G5 . E5 . . .',
        'D5 . . . C5 . D5 . E5 . . . C5 . . .', 'B4 . . . . . G4 . A4 . B4 . D5 . . .',
        'A5 . . . G5 . E5 . G5 . . . E5 . D5 .', 'C5 . D5 . E5 . . . F5 . E5 . D5 . . .',
        'E5 . . . G5 . . . D5 . C5 . D5 . E5 .', 'B4 . . . D5 . . . A4 . . . . . . .',
      ].map(melody),
      leadType: 'square', leadVol: 0.07, leadCut: 2200, padVol: 0.035, arp: false,
      drumVol: { k: 0.55, s: 0.18, h: 0.06 },
    },
    // 对战：「涂装突击」E 小调 128 BPM
    battle: {
      bpm: 128, swing: 0,
      chords: [
        { root: 40, pad: [64, 67, 71] }, { root: 48, pad: [64, 67, 72] }, { root: 50, pad: [62, 66, 69] }, { root: 47, pad: [62, 66, 71] },
        { root: 40, pad: [64, 67, 71] }, { root: 48, pad: [64, 67, 72] }, { root: 50, pad: [62, 66, 69] }, { root: 47, pad: [62, 66, 71] },
      ],
      kick: 'x...x...x...x...', snare: '....x.......x..x', hat: 'x.x.x.xox.x.x.xo',
      fill: { snare: '....x...x.x.xxxx' },
      bass: nums('0 . 0 12 . 0 . 12 0 . 0 12 . 7 . 10'), bassType: 'sawtooth', bassVol: 0.26,
      lead: [
        'E5 . G5 . A5 . G5 E5 . . D5 . E5 . . .', 'G5 . A5 . B5 . A5 G5 . . E5 . G5 . . .',
        'A5 . B5 . D6 . B5 A5 . . G5 . A5 . F#5 .', 'B5 . . . A5 . F#5 . D5 . . . F#5 . . .',
        'E6 . D6 . B5 . D6 . E6 . . . B5 . A5 .', 'G5 . B5 . E6 . . . D6 . B5 . G5 . . .',
        'A5 . D6 . F#6 . E6 D6 . . B5 . A5 . D6 .', 'B5 . . . F#5 . . . B5 . D6 . F#6 . . .',
      ].map(melody),
      leadType: 'square', leadVol: 0.06, leadCut: 3000, padVol: 0.025, arp: true, arpVol: 0.03,
      drumVol: { k: 0.7, s: 0.28, h: 0.07 },
    },
    // 最后 30 秒：「倒数冲刺」E 小调 150 BPM
    final: {
      bpm: 150, swing: 0,
      chords: [
        { root: 40, pad: [64, 67, 71] }, { root: 48, pad: [64, 67, 72] }, { root: 50, pad: [62, 66, 69] }, { root: 47, pad: [62, 66, 71] },
      ],
      kick: 'x...x...x...x.x.', snare: '....X.......X...', hat: 'xxxxxxxxxxxxxxxo',
      fill: { snare: '....X...x.x.XXXX' },
      bass: nums('0 12 0 12 0 12 0 12 0 12 0 12 7 12 10 12'), bassType: 'sawtooth', bassVol: 0.24,
      lead: [
        'E6 . . E6 . . D6 . . B5 . . D6 . E6 .', 'G6 . . G6 . . E6 . . D6 . . E6 . G6 .',
        'F#6 . . F#6 . . E6 . . D6 . . E6 . F#6 .', 'B6 . . . A6 . . . F#6 . . . D6 . B5 .',
      ].map(melody),
      leadType: 'sawtooth', leadVol: 0.055, leadCut: 3600, padVol: 0.02, arp: true, arpVol: 0.035,
      drumVol: { k: 0.75, s: 0.3, h: 0.06 },
    },
  };

  // 1.6 新曲目
  // 大厅：「晚风喷漆」G 大调 88 BPM，轻松的切分律动
  TRACKS.lobby2 = {
    bpm: 88, swing: 0.16,
    chords: [
      { root: 43, pad: [59, 62, 67] }, { root: 40, pad: [59, 64, 67] }, { root: 36, pad: [60, 64, 67] }, { root: 38, pad: [57, 62, 66] },
      { root: 43, pad: [59, 62, 67] }, { root: 47, pad: [59, 62, 66] }, { root: 36, pad: [60, 64, 69] }, { root: 38, pad: [57, 62, 66] },
    ],
    kick: 'x......x..x.....', snare: '....x.......x...', hat: '.x.x.x.x.x.x.xox',
    bass: nums('0 . . 7 . . 12 . 0 . 10 . 7 . 5 .'), bassType: 'triangle', bassVol: 0.3,
    lead: [
      'B5 . . A5 . G5 . . D5 . . . E5 . G5 .', 'G5 . . . E5 . D5 . B4 . . . . . . .',
      'C6 . . B5 . A5 . . G5 . . . E5 . G5 .', 'F#5 . . . A5 . . . D5 . . . . . . .',
      'B5 . D6 . B5 . A5 . G5 . . . A5 . B5 .', 'D6 . . . B5 . . . F#5 . A5 . . . . .',
      'E6 . . D6 . C6 . . A5 . . . C6 . E6 .', 'D6 . . . . . A5 . F#5 . . . . . . .',
    ].map(melody),
    leadType: 'triangle', leadVol: 0.08, leadCut: 2600, padVol: 0.03, arp: true, arpVol: 0.022,
    drumVol: { k: 0.5, s: 0.16, h: 0.05 },
  };
  // 搜刮撤离：「暗巷搜刮」D 小调 100 BPM，低沉紧张，旋律很少
  TRACKS.loot = {
    bpm: 100, swing: 0,
    chords: [
      { root: 38, pad: [50, 53, 57] }, { root: 38, pad: [50, 53, 57] }, { root: 34, pad: [50, 53, 58] }, { root: 36, pad: [48, 52, 55] },
      { root: 38, pad: [50, 53, 57] }, { root: 41, pad: [53, 57, 60] }, { root: 34, pad: [50, 53, 58] }, { root: 37, pad: [49, 52, 57] },
    ],
    kick: 'x.......x..x....', snare: '........x.......', hat: '..x...x...x...x.',
    bass: nums('0 . . 0 . . 0 . 0 . . 0 . 1 . .'), bassType: 'sawtooth', bassVol: 0.28,
    lead: [
      '. . . . . . . . A4 . . . . . . .', '. . . . . . . . . . . . F4 . E4 .',
      '. . . . . . . . D5 . . . . . . .', '. . . . . . . . . . . . C#5 . . .',
      '. . . . A4 . . . . . F4 . . . . .', '. . . . . . . . C5 . . . A4 . . .',
      '. . . . . . . . Bb4 . . . . . A4 .', '. . . . . . . . . . . . E4 . . .',
    ].map(melody),
    leadType: 'sine', leadVol: 0.09, leadCut: 1600, padVol: 0.04, arp: false,
    drumVol: { k: 0.6, s: 0.14, h: 0.045 },
  };
  // 撤离点开放之后：「撤离倒数」D 小调 156 BPM，急促
  TRACKS.extract = {
    bpm: 156, swing: 0,
    chords: [
      { root: 38, pad: [62, 65, 69] }, { root: 46, pad: [62, 65, 70] }, { root: 36, pad: [60, 64, 67] }, { root: 45, pad: [61, 64, 69] },
    ],
    kick: 'x...x...x...x...', snare: '....x.......x.x.', hat: 'x.xxx.xxx.xxx.xo',
    fill: { snare: '....x...xxx.XXXX' },
    bass: nums('0 0 12 0 0 12 0 12 0 0 12 0 7 12 10 12'), bassType: 'sawtooth', bassVol: 0.22,
    lead: [
      'D6 . . D6 . . F6 . . E6 . . D6 . A5 .', 'D6 . . D6 . . F6 . . G6 . . F6 . E6 .',
      'E6 . . E6 . . G6 . . F6 . . E6 . C6 .', 'C#6 . . . E6 . . . A6 . . . G6 . E6 .',
    ].map(melody),
    leadType: 'square', leadVol: 0.05, leadCut: 3400, padVol: 0.02, arp: true, arpVol: 0.03,
    drumVol: { k: 0.72, s: 0.28, h: 0.06 },
  };

  // 1.8 夜都决战：「午夜结界」D 小调 132 BPM——太鼓一样的低音鼓 + 拨弦琶音 + 竹笛般的旋律
  TRACKS.yato = {
    bpm: 132, swing: 0.04,
    chords: [
      { root: 38, pad: [62, 65, 69] }, { root: 34, pad: [62, 65, 70] }, { root: 36, pad: [60, 64, 67] }, { root: 33, pad: [61, 64, 69] },
      { root: 38, pad: [62, 65, 69] }, { root: 41, pad: [60, 65, 69] }, { root: 43, pad: [62, 67, 70] }, { root: 45, pad: [61, 64, 69] },
    ],
    kick: 'X..x..x.X...x.x.', snare: '....x.......x..x', hat: '..x...x...x...xo',
    fill: { snare: '....x...x.xxXXXX' },
    bass: nums('0 . . 0 . . 7 . 0 . 12 . 10 . 7 .'), bassType: 'triangle', bassVol: 0.3,
    lead: [
      'D5 . . . F5 . G5 . A5 . . . . . G5 .', 'F5 . . . E5 . D5 . C5 . . . A4 . . .',
      'D5 . . . F5 . G5 . A5 . . . C6 . A5 .', 'G5 . . . F5 . E5 . C#5 . . . . . . .',
      'A5 . . . . . G5 . F5 . . . D5 . . .', 'C5 . . . D5 . F5 . A5 . . . G5 . F5 .',
      'G5 . . . A5 . Bb5 . D6 . . . C6 . Bb5 .', 'A5 . . . . . E5 . A5 . . . . . . .',
    ].map(melody),
    leadType: 'sine', leadVol: 0.1, leadCut: 2600, padVol: 0.035, arp: true, arpVol: 0.035,
    drumVol: { k: 0.78, s: 0.22, h: 0.045 },
  };
  // ---------- 调度器 ----------
  let cur = null;
  function startTrack(name) {
    if (cur && cur.name === name) return;
    stopTrack(0.8);
    const T = TRACKS[name];
    if (!T) return;
    const g = AC.createGain();
    g.gain.setValueAtTime(0.0001, AC.currentTime);
    g.gain.exponentialRampToValueAtTime(1, AC.currentTime + 1.2);
    g.connect(musicBus);
    const delay = AC.createDelay(1), fb = AC.createGain(), wet = AC.createGain();
    delay.delayTime.value = (60 / T.bpm) * 0.75; fb.gain.value = 0.32; wet.gain.value = 0.28;
    delay.connect(fb).connect(delay); delay.connect(wet).connect(g);
    cur = { name, T, step: 0, next: AC.currentTime + 0.15, g, send: delay };
  }
  function stopTrack(fade = 0.6) {
    if (!cur) return;
    const g = cur.g, t = AC.currentTime;
    g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(Math.max(0.0001, g.gain.value), t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + fade);
    setTimeout(() => { try { g.disconnect(); } catch (e) { /* ignore */ } }, fade * 1000 + 600);
    cur = null;
  }
  function scheduleStep(c, step, t) {
    const T = c.T, bars = T.chords.length, spb = 60 / T.bpm / 4;
    const bar = Math.floor(step / 16) % bars, s = step % 16;
    const ch = T.chords[bar], out = c.g, dv = T.drumVol;
    const lastBar = bar === bars - 1;
    const snarePat = lastBar && T.fill ? T.fill.snare : T.snare;
    if (T.kick[s] !== '.') kick(out, t, dv.k * (T.kick[s] === 'X' ? 1.2 : 1));
    if (snarePat[s] !== '.') snare(out, t, dv.s * (snarePat[s] === 'X' ? 1.25 : 1));
    if (T.hat[s] !== '.') hat(out, t, dv.h * (s % 4 === 2 ? 1.3 : 1), T.hat[s] === 'o');
    const bn = T.bass[s];
    if (bn != null) bass(out, ch.root + bn, t, spb * 1.7, T.bassVol, T.bassType);
    const mel = T.lead[bar % T.lead.length];
    const ln = mel[s];
    if (ln != null) {
      let len = 1;
      while (len < 6 && s + len < 16 && mel[s + len] == null) len++;
      lead(out, c.send, ln, t, spb * len * 0.92, T.leadVol, T.leadType, T.leadCut);
    }
    if (s === 0) pad(out, ch.pad, t, spb * 16, T.padVol);
    if (T.arp && s % 2 === 1) pluck(out, c.send, ch.pad[(step >> 1) % 3] + 12, t, T.arpVol);
  }
  // 1.7.1：提前排 1.2 秒的音符（以前只排 0.15 秒）——主线程被加载 / 建 3D 场景卡住时，音乐照样连续播放
  const AHEAD = 1.2;
  setInterval(() => {
    if (!cur || AC.state !== 'running') return;
    const spb = 60 / cur.T.bpm / 4;
    if (cur.next < AC.currentTime - 0.2) cur.next = AC.currentTime + 0.05;
    while (cur.next < AC.currentTime + AHEAD) {
      const swing = cur.step % 2 ? cur.T.swing * spb : 0;
      scheduleStep(cur, cur.step, cur.next + swing);
      cur.step++; cur.next += spb;
    }
  }, 90);

  // ---------- 音效 ----------
  function tone(freq, dur, type = 'square', vol = 0.05, slide = 0, when = 0) {
    const t = AC.currentTime + when, o = AC.createOscillator(), g = AC.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(sfxBus); o.start(t); o.stop(t + dur + 0.02);
  }
  function noise(dur, vol, freq, type = 'bandpass', when = 0, sweepTo = 0) {
    const t = AC.currentTime + when, s = noiseSrc(t, dur), f = AC.createBiquadFilter(), g = AC.createGain();
    f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = 0.9;
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(sfxBus);
  }
  const arp = (notes, step, dur, type, vol) => notes.forEach((f, i) => tone(f, dur, type, vol, 0, i * step));
  const limit = {};
  const rl = (k, ms) => { const n = performance.now(); if (n - (limit[k] || 0) < ms) return false; limit[k] = n; return true; };
  A.sfx = {
    shoot() { if (rl('shoot', 70)) noise(0.07, 0.05, 2600); },
    snipe() { noise(0.2, 0.08, 1400); tone(1200, 0.14, 'sawtooth', 0.03, 0.4); },
    splat() { if (rl('splat', 90)) noise(0.09, 0.025, 700, 'lowpass'); },
    hit() { tone(900, 0.06, 'square', 0.035, 0.6); },
    hurt() { if (rl('hurt', 120)) { tone(180, 0.12, 'square', 0.05, 0.5); noise(0.08, 0.05, 500); } },
    kill() { tone(523, 0.1, 'square', 0.06); tone(784, 0.18, 'square', 0.06, 0, 0.09); },
    die() { tone(320, 0.5, 'sawtooth', 0.05, 0.25); noise(0.4, 0.06, 900, 'lowpass', 0, 200); },
    respawn() { arp([392, 523, 659, 784], 0.06, 0.12, 'triangle', 0.05); },
    boom() { noise(0.45, 0.14, 320, 'lowpass'); tone(90, 0.3, 'sine', 0.1, 0.4); },
    throw() { noise(0.25, 0.04, 600, 'bandpass', 0, 2400); },
    morph() { if (rl('morph', 120)) { tone(500, 0.12, 'sine', 0.04, 0.4); noise(0.12, 0.03, 1200, 'bandpass', 0, 300); } },
    unmorph() { if (rl('unmorph', 120)) tone(260, 0.1, 'sine', 0.035, 2); },
    special() { tone(280, 0.55, 'sawtooth', 0.05, 3); noise(0.5, 0.04, 400, 'bandpass', 0, 4000); },
    ready() { arp([659, 880, 1175], 0.07, 0.16, 'triangle', 0.05); },
    goal() { arp([523, 659, 784, 1046], 0.085, 0.18, 'square', 0.05); },
    capture() { arp([440, 554, 659], 0.08, 0.2, 'square', 0.045); },
    jump() { if (rl('jump', 90)) { tone(320, 0.12, 'triangle', 0.045, 2.2); noise(0.06, 0.02, 2400, 'highpass'); } },
    land() { if (rl('land', 120)) noise(0.09, 0.05, 500, 'lowpass', 0, 120); },
    pick() { tone(1300, 0.06, 'triangle', 0.05, 1.4); },
    count() { tone(660, 0.12, 'square', 0.05); },
    go() { tone(990, 0.4, 'square', 0.06); tone(1480, 0.4, 'square', 0.03); },
    warn() { tone(880, 0.12, 'square', 0.05); tone(880, 0.12, 'square', 0.05, 0, 0.18); },
    tick() { tone(1500, 0.05, 'square', 0.035); },
    lowInk() { if (rl('low', 1500)) tone(300, 0.08, 'square', 0.03, 0.8); },
    win() { arp([523, 659, 784, 1046, 1318], 0.11, 0.24, 'square', 0.05); tone(1046, 0.8, 'triangle', 0.04, 0, 0.55); },
    lose() { arp([440, 392, 330, 262], 0.15, 0.3, 'triangle', 0.05); },
    click() { tone(720, 0.04, 'square', 0.025); },
    hover() { if (rl('hover', 50)) tone(1100, 0.025, 'sine', 0.015); },
    // 1.6 新音效
    loot(r) {   // 捡到物资：品质越高越亮
      if (!rl('loot', 60)) return;
      if (r >= 5) { arp([784, 988, 1175, 1568, 1976], 0.06, 0.3, 'triangle', 0.06); tone(392, 0.6, 'sawtooth', 0.03, 2, 0.05); noise(0.5, 0.03, 3000, 'bandpass', 0.1, 8000); }
      else if (r >= 4) { arp([659, 880, 1175, 1318], 0.06, 0.22, 'triangle', 0.055); noise(0.3, 0.025, 2500, 'bandpass', 0.05, 6000); }
      else if (r >= 3) arp([784, 1046, 1318], 0.05, 0.14, 'triangle', 0.05);
      else if (r >= 2) arp([880, 1175], 0.05, 0.1, 'triangle', 0.045);
      else tone(1100, 0.07, 'triangle', 0.04, 1.3);
    },
    bagFull() { if (rl('bag', 900)) { tone(220, 0.1, 'square', 0.04); tone(196, 0.14, 'square', 0.04, 0, 0.12); } },
    siren() { for (let i = 0; i < 3; i++) { tone(660, 0.35, 'sawtooth', 0.035, 1.5, i * 0.4); } },
    extracted() { arp([523, 659, 784, 1046, 1318, 1568], 0.08, 0.3, 'square', 0.05); tone(784, 1.2, 'triangle', 0.05, 0, 0.5); noise(0.8, 0.03, 1500, 'bandpass', 0.4, 6000); },
    coin() { tone(1568, 0.06, 'square', 0.04); tone(2093, 0.12, 'square', 0.035, 0, 0.06); },
    domain() { tone(523, 0.5, 'triangle', 0.05, 1, 0); tone(784, 0.5, 'triangle', 0.04, 1, 0.08); tone(1046, 0.7, 'sine', 0.04, 1, 0.16); noise(0.6, 0.05, 600, 'bandpass', 0, 3200); },   // 1.9.1 简易领域展开
    domainHit() { if (rl('dmn', 80)) { noise(0.08, 0.06, 3000, 'bandpass', 0, 800); tone(1568, 0.06, 'triangle', 0.03, 0.6); } },
    // 1.9：部分传说 / 限定传说皮肤有专属的开火声和命中声（手感完全不同）
    skinShoot(k) {
      if (!rl('shoot', 70)) return;
      if (k === 'gold') { tone(1760, 0.05, 'triangle', 0.035, 0.8); tone(2640, 0.04, 'sine', 0.02); noise(0.05, 0.03, 5200, 'highpass'); }   // 金币叮当
      else if (k === 'flag') { tone(150, 0.09, 'sine', 0.09, 0.45); noise(0.06, 0.06, 900, 'lowpass'); }   // 军鼓
      else if (k === 'ice') { tone(2093, 0.09, 'sine', 0.03); tone(3136, 0.07, 'sine', 0.02, 0, 0.02); noise(0.05, 0.02, 7000, 'highpass'); }   // 冰晶风铃
      else if (k === 'yato') { noise(0.09, 0.04, 1200, 'bandpass', 0, 4200); tone(1046, 0.08, 'triangle', 0.025, 0, 0.015); }   // 符纸破空 + 铃
      else if (k === 'wraith') { tone(110, 0.12, 'sawtooth', 0.045, 0.6); noise(0.1, 0.05, 400, 'lowpass', 0, 160); }   // 恶灵低吼
      else if (k === 'martyr') { tone(98, 0.12, 'sine', 0.1, 0.5); tone(392, 0.07, 'square', 0.025, 1.02, 0.01); noise(0.07, 0.05, 700, 'lowpass'); }   // 战鼓 + 号角
      else noise(0.07, 0.05, 2600);
    },
    skinHit(k) {
      if (!rl('hc', 45)) return;
      if (k === 'gold') { tone(2349, 0.06, 'triangle', 0.035); tone(3136, 0.08, 'sine', 0.025, 0, 0.03); }
      else if (k === 'flag' || k === 'martyr') { tone(220, 0.07, 'square', 0.04, 0.6); noise(0.05, 0.05, 1500, 'bandpass'); }
      else if (k === 'ice') { tone(2637, 0.05, 'sine', 0.035); noise(0.06, 0.03, 6000, 'highpass', 0, 9000); }
      else if (k === 'yato') { tone(1318, 0.06, 'triangle', 0.035); tone(1975, 0.05, 'sine', 0.02, 0, 0.03); }
      else if (k === 'wraith') { tone(330, 0.08, 'sawtooth', 0.035, 0.5); noise(0.05, 0.04, 2500, 'bandpass'); }
      else { tone(1500, 0.035, 'square', 0.03, 0.7); noise(0.03, 0.03, 4000, 'highpass'); }
    },
    hitConfirm() { if (rl('hc', 45)) { tone(1500, 0.035, 'square', 0.03, 0.7); noise(0.03, 0.03, 4000, 'highpass'); } },
    killConfirm() { tone(392, 0.08, 'square', 0.06, 1.5); tone(784, 0.16, 'triangle', 0.06, 0, 0.07); noise(0.25, 0.05, 600, 'lowpass', 0, 120); },
  };

  // ---------- 接口 ----------
  A.resume = () => { if (AC.state === 'suspended') AC.resume(); };
  A.music = (name) => startTrack(name);
  A.stopMusic = (fade) => stopTrack(fade);
  A.current = () => (cur ? cur.name : null);
  A.setMusic = (v) => { cfg.music = v; applyVol(); save(); };
  A.setSfx = (v) => { cfg.sfx = v; applyVol(); save(); };
  A.toggleMute = () => { cfg.muted = !cfg.muted; applyVol(); save(); return cfg.muted; };
  A.setMuted = (m) => { cfg.muted = m; applyVol(); save(); };
  A.TRACK_NAMES = { menu: '霓虹喷漆街', lobby2: '晚风喷漆', battle: '涂装突击', final: '倒数冲刺', loot: '暗巷搜刮', extract: '撤离倒数', yato: '午夜结界' };
  addEventListener('pointerdown', A.resume); addEventListener('keydown', A.resume);
  window.GBAudio = A;
})();
