// 涂鸦机兵 — 程序生成的涂鸦墙背景（砖墙 + 喷漆标签 + 滴落 + 贴纸），作为界面底图
(() => {
  'use strict';
  function rng(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 100000) / 100000; }; }
  const NEON = ['#ff3ea5', '#ffe600', '#1fd6ee', '#9cff2e', '#ff8a1f', '#a46bff'];

  function make(w, h, seed, dark) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const x = c.getContext('2d'), R = rng(seed);
    // 砖墙
    x.fillStyle = dark ? '#1a1622' : '#2a2433'; x.fillRect(0, 0, w, h);
    const bw = 96, bh = 40;
    for (let row = 0, y = 0; y < h; row++, y += bh) {
      for (let bx = (row % 2) * -bw / 2; bx < w; bx += bw) {
        const v = R() * 14 - 7;
        const base = dark ? 34 : 50;
        x.fillStyle = `rgb(${base + 10 + v},${base - 2 + v},${base + 14 + v})`;
        x.fillRect(bx + 2, y + 2, bw - 4, bh - 4);
        x.fillStyle = 'rgba(255,255,255,0.03)'; x.fillRect(bx + 2, y + 2, bw - 4, 4);
        x.fillStyle = 'rgba(0,0,0,0.18)'; x.fillRect(bx + 2, y + bh - 8, bw - 4, 6);
      }
    }
    // 噪点
    const img = x.getImageData(0, 0, w, h), d = img.data;
    for (let i = 0; i < d.length; i += 4) { const n = (R() - 0.5) * 18; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
    x.putImageData(img, 0, 0);
    // 旧涂鸦：大字母喷漆（低透明度，叠几层）
    const words = ['GRAFFI', 'BOTS', 'XA', 'INK!', 'SPLAT', 'ZAP', 'YO', 'GB', 'WOW', 'POW', '涂鸦', '机兵'];
    for (let i = 0; i < 9; i++) {
      x.save();
      x.translate(R() * w, R() * h); x.rotate((R() - 0.5) * 0.5);
      const col = NEON[Math.floor(R() * NEON.length)];
      const size = 60 + R() * 110;
      x.font = `${size}px GBTag, GBHead, Impact, sans-serif`; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.globalAlpha = dark ? 0.12 : 0.18;
      x.lineJoin = 'round'; x.lineWidth = size * 0.12; x.strokeStyle = '#000'; x.strokeText(words[i % words.length], 0, 0);
      x.fillStyle = col; x.fillText(words[i % words.length], 0, 0);
      x.restore();
    }
    // 喷漆滴落线
    for (let i = 0; i < 26; i++) {
      x.globalAlpha = dark ? 0.16 : 0.24;
      x.fillStyle = NEON[Math.floor(R() * NEON.length)];
      const px = R() * w, py = R() * h, l = 20 + R() * 120, wd = 2 + R() * 4;
      x.fillRect(px, py, wd, l); x.beginPath(); x.arc(px + wd / 2, py + l, wd * 0.9, 0, 7); x.fill();
    }
    // 喷溅点
    for (let i = 0; i < 14; i++) {
      const px = R() * w, py = R() * h, r = 8 + R() * 30, col = NEON[Math.floor(R() * NEON.length)];
      x.globalAlpha = dark ? 0.12 : 0.18; x.fillStyle = col;
      x.beginPath(); x.arc(px, py, r, 0, 7); x.fill();
      for (let k = 0; k < 7; k++) { const a = R() * 7, dd = r * (1.2 + R()); x.beginPath(); x.arc(px + Math.cos(a) * dd, py + Math.sin(a) * dd, 1 + R() * 3, 0, 7); x.fill(); }
    }
    // 线条涂写（马克笔圈、箭头、星）
    x.globalAlpha = dark ? 0.14 : 0.2; x.strokeStyle = '#fff'; x.lineWidth = 3; x.lineCap = 'round';
    for (let i = 0; i < 8; i++) {
      const px = R() * w, py = R() * h;
      x.beginPath();
      if (i % 3 === 0) { x.arc(px, py, 18 + R() * 20, 0, 6); }
      else if (i % 3 === 1) { x.moveTo(px, py); x.lineTo(px + 50, py - 14); x.moveTo(px + 50, py - 14); x.lineTo(px + 38, py - 24); x.moveTo(px + 50, py - 14); x.lineTo(px + 40, py - 2); }
      else { for (let k = 0; k < 6; k++) { const a = -Math.PI / 2 + k * 2.513; x.lineTo(px + Math.cos(a) * 16, py + Math.sin(a) * 16); } }
      x.stroke();
    }
    x.globalAlpha = 1;
    // 暗角
    const g = x.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.75);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, dark ? 'rgba(0,0,0,0.55)' : 'rgba(0,0,0,0.4)');
    x.fillStyle = g; x.fillRect(0, 0, w, h);
    return c.toDataURL('image/jpeg', 0.86);
  }
  function apply() {
    const seed = (Date.now() / 86400000) | 0;   // 每天换一面墙
    const root = document.documentElement.style;
    root.setProperty('--wall', `url(${make(1280, 800, seed, false)})`);
    root.setProperty('--wall-dark', `url(${make(1280, 800, seed + 7, true)})`);
  }
  window.GWall = { make, apply };
})();
