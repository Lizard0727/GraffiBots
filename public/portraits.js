// 涂鸦机兵 GraffiBots — 驾驶员立绘（程序化 SVG，赛璐璐上色，离线可用）
(() => {
  'use strict';
  const S = window.GS;
  let UID = 0;
  const LINE = '#24162e';

  // ---------------- 颜色工具 ----------------
  const hx = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  const toHex = (r, g, b) => '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
  const mix = (a, b, t) => { const A = hx(a), B = hx(b); return toHex(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t); };

  // 平滑闭合路径：点 [x, y, sharp?]，sharp 点处不做圆滑（发梢尖角）
  function shape(pts, closed = true, tension = 0.5) {
    const n = pts.length;
    const P = (i) => (closed ? pts[(i + n) % n] : pts[Math.max(0, Math.min(n - 1, i))]);
    let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
    const segs = closed ? n : n - 1;
    for (let i = 0; i < segs; i++) {
      const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
      const k1 = p1[2] ? 0 : tension / 3, k2 = p2[2] ? 0 : tension / 3;
      const c1x = p1[0] + (p2[0] - p0[0]) * k1, c1y = p1[1] + (p2[1] - p0[1]) * k1;
      const c2x = p2[0] - (p3[0] - p1[0]) * k2, c2y = p2[1] - (p3[1] - p1[1]) * k2;
      d += `C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
    }
    return closed ? d + 'Z' : d;
  }
  const mirrorPts = (pts) => pts.map(([x, y, s]) => [400 - x, y, s]);
  const path = (d, fill, extra = '') => `<path d="${d}" fill="${fill}" ${extra}/>`;
  const ol = (w = 3) => `stroke="${LINE}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round"`;

  // ---------------- 脸部 ----------------
  const FACE = [[128, 150], [131, 205], [148, 248], [178, 281], [200, 292, 1], [222, 281], [252, 248], [269, 205], [272, 150], [250, 96], [200, 82], [150, 96]];

  function eye(cx, cy, flip, P, id) {
    const sh = P.eyeShape;
    if (sh === 'happy') {
      // 笑眯眯的弯眼 ^^
      const tr0 = `translate(${cx},${cy}) scale(${flip ? -1.12 : 1.12},1.12)`;
      return `<g transform="${tr0}"><path d="M-20,6 Q0,-16 20,6" fill="none" stroke="${LINE}" stroke-width="6" stroke-linecap="round"/><path d="M-22,4 l-7,4" stroke="${LINE}" stroke-width="4" stroke-linecap="round"/></g>`;
    }
    const h = { round: 46, sharp: 36, cool: 31, sleepy: 40, bold: 36 }[sh] || 40;
    const lift = { sharp: -7, cool: -5, bold: -3 }[sh] || 0;      // 外眼角上挑
    const ec = P.eye;
    const sc = [[-23, 3 + lift, 1], [-12, -h * 0.5], [8, -h * 0.52], [21, 5, 1], [10, h * 0.44], [-10, h * 0.46]];
    const scD = shape(sc);
    const tr = `translate(${cx},${cy}) scale(${flip ? -1.12 : 1.12},1.12)`;
    const ir = sh === 'round' ? [15, 20] : sh === 'cool' ? [12, 16] : [13.5, 18];
    const iy = sh === 'sleepy' ? 6 : 3;
    let s = `<g transform="${tr}">`;
    s += `<clipPath id="${id}c"><path d="${scD}"/></clipPath>`;
    s += path(scD, '#fffaf6');
    s += `<g clip-path="url(#${id}c)">`;
    s += `<rect x="-30" y="${-h}" width="60" height="${h * 0.42}" fill="${mix(P.skin, '#7a5a8a', 0.35)}" opacity="0.35"/>`;
    s += `<ellipse cx="1" cy="${iy}" rx="${ir[0]}" ry="${ir[1]}" fill="url(#${id}i)" stroke="${mix(ec, '#000', 0.55)}" stroke-width="2"/>`;
    s += `<ellipse cx="1" cy="${iy + 4}" rx="${ir[0] * 0.62}" ry="${ir[1] * 0.45}" fill="${mix(ec, '#fff', 0.45)}" opacity="0.55"/>`;
    s += `<ellipse cx="1" cy="${iy - 1}" rx="${ir[0] * 0.42}" ry="${ir[1] * 0.5}" fill="${mix(ec, '#000', 0.7)}"/>`;
    s += `<ellipse cx="-5" cy="${iy - 8}" rx="${ir[0] * 0.36}" ry="${ir[1] * 0.33}" fill="#fff"/>`;
    s += `<circle cx="7" cy="${iy + 9}" r="2.6" fill="#fff"/>`;
    if (sh === 'round') s += `<circle cx="-7" cy="${iy + 7}" r="1.6" fill="#fff" opacity="0.8"/>`;
    s += `<rect x="-30" y="${-h}" width="60" height="${h * 0.5 + 2}" fill="${mix(ec, '#000', 0.5)}" opacity="0.18"/>`;
    if (sh === 'sleepy') s += path(shape([[-30, -h], [30, -h], [30, -4, 1], [0, -9], [-30, -2, 1]]), P.skin);
    s += `</g>`;
    // 上睫毛（粗）+ 眼尾
    const ly = sh === 'sleepy' ? 8 : 0;
    const lash = sh === 'sleepy'
      ? shape([[-27, 1 + lift, 1], [-12, -7], [8, -9], [23, 3, 1], [21, 6, 1], [8, -4], [-12, -2], [-24, 5 + lift, 1]])
      : shape([[-28, 5 + lift, 1], [-14, -h * 0.58 + ly], [8, -h * 0.62], [23, 3, 1], [21, 7, 1], [8, -h * 0.46], [-12, -h * 0.44], [-23, 6 + lift, 1]]);
    s += path(lash, LINE);
    s += path(shape([[-27, 2 + lift, 1], [-33, 9 + lift, 1], [-22, 6 + lift, 1]], true), LINE);
    if (P.eyeShape === 'round') s += path(shape([[-24, -h * 0.25, 1], [-31, -h * 0.4, 1], [-21, -h * 0.33, 1]]), LINE);
    // 下睫毛
    s += `<path d="M-17,${h * 0.4} Q-4,${h * 0.52} 9,${h * 0.45}" fill="none" stroke="${mix(LINE, P.skin, 0.25)}" stroke-width="1.8" stroke-linecap="round"/>`;
    s += `</g>`;
    return s;
  }

  function brows(P) {
    const c = mix(P.hair2, LINE, 0.3);
    const sh = P.eyeShape;
    const y = 166;
    let L;
    if (sh === 'sharp' || sh === 'bold') L = [[140, y + 2, 1], [160, y - 2], [184, y + 8, 1], [182, y + 12, 1], [160, y + 4], [142, y + 6, 1]];
    else if (sh === 'cool') L = [[142, y + 4, 1], [162, y], [184, y + 3, 1], [184, y + 7, 1], [162, y + 5], [143, y + 8, 1]];
    else if (sh === 'sleepy') L = [[142, y + 8, 1], [162, y + 2], [183, y + 4, 1], [183, y + 7, 1], [162, y + 6], [143, y + 11, 1]];
    else L = [[143, y + 2, 1], [162, y - 6], [182, y - 1, 1], [182, y + 3, 1], [162, y - 2], [144, y + 6, 1]];
    const w = sh === 'bold' ? 1.5 : 1;
    const Lw = L.map(([x, yy, s], i) => [x, i >= 3 ? yy + (w - 1) * 4 : yy, s]);
    return path(shape(Lw), c) + path(shape(mirrorPts(Lw)), c);
  }

  function mouth(P) {
    const dk = '#6a1f2e';
    switch (P.mouth) {
      case 'grin':
        return path('M180,262 Q200,270 222,258 Q216,284 200,285 Q185,283 180,262 Z', dk, ol(2.4)) +
          path('M182,263 Q200,270 220,259 L218,266 Q200,274 184,269 Z', '#fff') +
          path('M187,279 Q200,272 213,278 Q206,285 200,285 Q192,285 187,279 Z', '#ff7c8f') +
          path('M208,266 L212,275 L215,264 Z', '#fff');
      case 'open':
        return path('M188,262 Q200,267 212,262 Q209,278 200,279 Q191,278 188,262 Z', dk, ol(2.2)) +
          path('M192,273 Q200,269 208,273 Q204,279 200,279 Q196,279 192,273 Z', '#ff8095');
      case 'smile':
        return `<path d="M185,263 Q200,276 215,263" fill="none" ${ol(2.6)}/>` +
          path('M190,267 Q200,273 210,267 Q205,272 200,272 Q195,272 190,267 Z', '#ff8a9a');
      case 'smirk':
        return `<path d="M187,270 Q203,272 215,261" fill="none" ${ol(2.6)}/><path d="M213,258 Q217,261 216,265" fill="none" ${ol(2)}/>`;
      default:
        return `<path d="M191,268 Q200,271 209,268" fill="none" ${ol(2.4)}/>`;
    }
  }

  // ---------------- 发型（back：脑后/身后；front：刘海；hl：高光带） ----------------
  const HAIR = {
    spiky() {
      const back = [[124, 236, 1], [112, 196], [80, 204, 1], [104, 164], [70, 140, 1], [106, 120], [88, 76, 1], [138, 88], [146, 30, 1], [180, 70], [212, 14, 1], [228, 66], [276, 30, 1], [268, 84], [326, 78, 1], [296, 118], [334, 146, 1], [296, 162], [320, 204, 1], [286, 198], [278, 238, 1], [240, 200], [160, 200]];
      const front = [[124, 196, 1], [126, 140], [146, 102], [200, 86], [254, 102], [274, 140], [276, 196, 1], [262, 158], [258, 190, 1], [244, 140], [232, 182, 1], [216, 132], [202, 186, 1], [188, 134], [168, 178, 1], [156, 138], [140, 194, 1], [134, 160]];
      return { back, front, hl: [[132, 128], [164, 112, 1], [176, 124], [204, 106, 1], [216, 120], [246, 108, 1], [262, 122], [264, 132], [246, 120, 1], [214, 132], [204, 118, 1], [176, 136], [164, 124, 1], [134, 140]] };
    },
    swept() {
      const back = [[118, 300, 1], [112, 230], [108, 160], [128, 96], [176, 64], [236, 64], [282, 98], [296, 160], [292, 232], [286, 304, 1], [262, 262], [250, 200], [150, 200], [138, 262]];
      const front = [[122, 200, 1], [120, 146], [142, 98], [196, 76], [256, 90], [284, 134], [286, 254, 1], [274, 204], [268, 268, 1], [252, 200], [236, 256, 1], [224, 184], [208, 214, 1], [196, 150], [180, 182, 1], [168, 140], [150, 188, 1], [140, 150]];
      return { back, front, hl: [[136, 130], [170, 106, 1], [182, 118], [216, 98, 1], [228, 112], [262, 104, 1], [270, 118], [270, 128], [256, 116, 1], [228, 124], [216, 110, 1], [182, 130], [170, 118, 1], [138, 142]] };
    },
    twintail() {
      const back = [[124, 250, 1], [116, 170], [132, 104], [200, 74], [268, 104], [284, 170], [276, 250, 1], [250, 200], [150, 200]];
      const front = [[118, 262, 1], [118, 150], [140, 100], [200, 80], [260, 100], [282, 150], [282, 262, 1], [270, 220], [266, 176, 1], [252, 140], [246, 178, 1], [230, 138], [222, 176, 1], [208, 140], [200, 172, 1], [190, 140], [176, 176, 1], [166, 138], [152, 178, 1], [146, 140], [134, 176, 1], [130, 220]];
      return { back, front, hl: [[136, 126], [168, 108, 1], [180, 120], [204, 100, 1], [218, 116], [244, 104, 1], [262, 120], [262, 130], [244, 116, 1], [218, 128], [204, 112, 1], [180, 132], [168, 120, 1], [138, 138]] };
    },
    dreads() {
      const back = [[134, 214, 1], [124, 150], [138, 96], [200, 70], [262, 96], [276, 150], [266, 214, 1], [240, 180], [160, 180]];
      const front = [[130, 168, 1], [128, 128], [150, 92], [200, 78], [250, 92], [272, 128], [270, 168, 1], [256, 138], [232, 126], [200, 124], [168, 126], [144, 138]];
      return { back, front, hl: [[146, 112], [176, 98, 1], [188, 106], [214, 94, 1], [226, 104], [252, 104, 1], [258, 114], [252, 112, 1], [226, 112], [214, 102, 1], [188, 114], [176, 106, 1], [146, 120]] };
    },
    hood() {
      const back = [[126, 262, 1], [118, 180], [134, 108], [200, 84], [266, 108], [282, 180], [274, 262, 1], [250, 210], [150, 210]];
      const front = [[124, 242, 1], [122, 156], [146, 108], [200, 92], [254, 108], [278, 156], [276, 236, 1], [264, 190], [258, 214, 1], [248, 160], [238, 186, 1], [226, 150], [212, 196, 1], [200, 144], [178, 214, 1], [176, 156], [156, 226, 1], [150, 168], [138, 240, 1], [134, 190]];
      return { back, front, hl: [[142, 132], [172, 116, 1], [184, 126], [210, 110, 1], [222, 122], [250, 118, 1], [258, 128], [250, 126, 1], [222, 132], [210, 120, 1], [184, 136], [172, 126, 1], [144, 144]] };
    },
    braid() {
      const back = [[124, 250, 1], [114, 168], [130, 100], [200, 72], [270, 100], [286, 168], [276, 250, 1], [250, 200], [150, 200]];
      const front = [[120, 230, 1], [118, 150], [140, 98], [200, 78], [262, 98], [284, 150], [284, 236, 1], [270, 186], [262, 150, 1], [244, 168], [228, 128], [214, 160, 1], [196, 124], [176, 168, 1], [166, 132], [150, 182, 1], [140, 150], [132, 208, 1]];
      return { back, front, hl: [[136, 126], [168, 108, 1], [180, 120], [204, 100, 1], [218, 114], [246, 104, 1], [262, 120], [262, 130], [246, 116, 1], [218, 126], [204, 112, 1], [180, 132], [168, 120, 1], [138, 138]] };
    },
    undercut() {
      const back = [[134, 200, 1], [126, 140], [146, 92], [200, 70], [256, 90], [276, 140], [268, 200, 1], [240, 170], [160, 170]];
      const front = [[132, 150, 1], [134, 112], [160, 82], [214, 70], [264, 88], [284, 128], [290, 196, 1], [270, 168], [262, 200, 1], [250, 156], [232, 182, 1], [226, 146], [204, 160, 1], [196, 132], [172, 140, 1], [160, 124], [144, 150]];
      return { back, front, hl: [[150, 108], [180, 90, 1], [192, 100], [222, 84, 1], [234, 96], [262, 98, 1], [270, 110], [262, 108, 1], [234, 106], [222, 94, 1], [192, 110], [180, 100, 1], [152, 118]] };
    },
    chef() {
      const back = [[130, 200, 1], [124, 150], [140, 104], [200, 86], [260, 104], [276, 150], [270, 200, 1], [240, 176], [160, 176]];
      const front = [[126, 176, 1], [126, 138], [148, 112], [200, 104], [252, 112], [274, 138], [274, 176, 1], [262, 150], [250, 166, 1], [238, 140], [222, 158, 1], [210, 138], [196, 156, 1], [182, 138], [168, 160, 1], [156, 140], [142, 168, 1], [136, 150]];
      return { back, front, hl: [[144, 128], [172, 118, 1], [184, 124], [210, 114, 1], [222, 122], [250, 120, 1], [256, 128], [250, 126, 1], [222, 130], [210, 122, 1], [184, 132], [172, 126, 1], [146, 136]] };
    },
    veteran() {
      const back = [[134, 196, 1], [126, 146], [142, 102], [200, 82], [258, 102], [274, 146], [266, 196, 1], [240, 168], [160, 168]];
      const front = [[130, 172, 1], [128, 136], [144, 108], [176, 96], [200, 100], [228, 94], [256, 106], [272, 136], [270, 172, 1], [262, 140], [250, 124], [228, 118, 1], [210, 124], [196, 118, 1], [176, 124], [156, 126], [140, 142]];
      return { back, front, hl: [[146, 120], [172, 106, 1], [184, 112], [212, 104, 1], [224, 110], [252, 114, 1], [256, 122], [252, 120, 1], [224, 118], [212, 112, 1], [184, 120], [172, 114, 1], [148, 128]] };
    },
    buns() {
      const back = [[122, 272, 1], [114, 180], [128, 108], [200, 78], [272, 108], [286, 180], [278, 272, 1], [256, 230], [144, 230]];
      const front = [[118, 268, 1], [118, 152], [138, 104], [200, 84], [262, 104], [282, 152], [282, 268, 1], [266, 226], [264, 172, 1], [236, 176], [208, 170, 1], [192, 176], [164, 170, 1], [138, 176], [134, 226]];
      return { back, front, hl: [[136, 126], [168, 108, 1], [180, 120], [204, 100, 1], [218, 114], [246, 104, 1], [262, 120], [262, 130], [246, 116, 1], [218, 126], [204, 112, 1], [180, 132], [168, 120, 1], [138, 138]] };
    },
    ponytail() {
      const back = [[124, 250, 1], [114, 170], [130, 100], [200, 70], [270, 100], [286, 170], [276, 250, 1], [250, 200], [150, 200]];
      const front = [[120, 246, 1], [118, 150], [138, 100], [196, 76], [256, 96], [282, 148], [282, 250, 1], [268, 200], [264, 168, 1], [248, 136], [236, 170, 1], [222, 128], [216, 152, 1], [200, 120], [184, 160, 1], [172, 132], [160, 178, 1], [150, 140], [136, 196, 1], [132, 210]];
      return { back, front, hl: [[134, 126], [166, 106, 1], [178, 118], [204, 98, 1], [216, 112], [246, 102, 1], [262, 118], [262, 128], [246, 114, 1], [216, 124], [204, 110, 1], [178, 130], [166, 118, 1], [136, 138]] };
    },
  };

  // 发型专属的额外部件（在身体后面 / 在脸前面）
  function hairExtrasBack(P, g) {
    const st = P.style, hairFill = `url(#${g}h)`;
    let s = '';
    if (st === 'twintail') {
      for (const f of [false, true]) {
        const T = [[128, 120], [92, 150], [62, 230], [58, 330], [74, 420], [106, 470, 1], [92, 400], [98, 320], [112, 240], [134, 170]];
        const pts = f ? mirrorPts(T) : T;
        s += path(shape(pts), hairFill, ol(3));
        const st2 = (f ? mirrorPts : (x) => x)([[92, 200], [76, 280, 1], [84, 360], [90, 430, 1]]);
        s += `<path d="${shape(st2, false)}" fill="none" stroke="${P.hair2}" stroke-width="3" opacity="0.6" stroke-linecap="round"/>`;
      }
    }
    if (st === 'ponytail') {
      const T = [[230, 84], [292, 50], [340, 80], [360, 160], [352, 260], [330, 340], [344, 410, 1], [306, 350], [314, 260], [316, 170], [300, 112], [262, 96]];
      s += path(shape(T), hairFill, ol(3));
      s += `<path d="${shape([[300, 70], [338, 120], [340, 220, 1], [326, 300]], false)}" fill="none" stroke="${P.hair2}" stroke-width="3" opacity="0.55" stroke-linecap="round"/>`;
    }
    if (st === 'dreads') {
      for (let i = 0; i < 9; i++) {
        const x = 140 + i * 15, len = 120 + (i % 3) * 25;
        const sw = (i - 4) * 4;
        s += `<path d="M${x},150 Q${x + sw},${200 + len / 2} ${x + sw * 2},${200 + len}" fill="none" stroke="${LINE}" stroke-width="15" stroke-linecap="round"/>`;
        s += `<path d="M${x},150 Q${x + sw},${200 + len / 2} ${x + sw * 2},${200 + len}" fill="none" stroke="${P.hair}" stroke-width="10" stroke-linecap="round"/>`;
      }
    }
    if (st === 'buns') {
      for (const x of [134, 266]) { s += `<circle cx="${x}" cy="96" r="30" fill="${hairFill}" ${ol(3)}/><path d="M${x - 16},88 q16,-14 32,0" fill="none" stroke="${P.hair2}" stroke-width="3" opacity="0.6"/>`; }
    }
    if (st === 'swept') {
      s += path(shape([[262, 230], [300, 300], [296, 360, 1], [274, 300], [252, 250]]), hairFill, ol(3));
      s += path(shape([[138, 230], [104, 300], [110, 352, 1], [128, 300], [148, 250]]), hairFill, ol(3));
    }
    return s;
  }
  function hairExtrasFront(P, g) {
    const st = P.style, hairFill = `url(#${g}h)`;
    let s = '';
    if (st === 'braid') {
      // 搭在右肩前面的长辫子
      for (let i = 0; i < 7; i++) {
        const y = 240 + i * 30, x = 262 + Math.sin(i * 0.9) * 6 + i * 3, r = 17 - i * 0.9;
        s += `<ellipse cx="${x}" cy="${y}" rx="${r}" ry="${r * 1.15}" fill="${hairFill}" ${ol(2.6)}/>`;
        s += `<path d="M${x - r * 0.6},${y - 4} q${r * 0.6},${r * 0.7} ${r * 1.2},0" fill="none" stroke="${P.hair2}" stroke-width="2.2" opacity="0.6"/>`;
      }
      s += `<rect x="276" y="446" width="22" height="10" rx="4" fill="${P.accent}" ${ol(2)}/>`;
      s += path(shape([[300, 456], [292, 492, 1], [286, 462], [282, 494, 1], [276, 456]]), hairFill, ol(2.4));
    }
    if (st === 'undercut') {
      // 剃短的两侧
      for (const f of [false, true]) s += path(shape((f ? mirrorPts : (x) => x)([[128, 150], [126, 196], [134, 222, 1], [142, 190], [140, 150]])), mix(P.skin, P.hair, 0.55), 'opacity="0.85"');
    }
    if (st === 'veteran') {
      for (const f of [false, true]) s += path(shape((f ? mirrorPts : (x) => x)([[130, 150], [128, 200], [136, 228, 1], [142, 196], [142, 152]])), `url(#${g}h)`, ol(2));
    }
    if (st === 'twintail' || st === 'ponytail' || st === 'swept' || st === 'buns') {
      // 鬓角长发
      const L = [[126, 170], [118, 230], [124, 300], [132, 330, 1], [138, 286], [140, 220], [140, 176]];
      s += path(shape(L), hairFill, ol(2.6)) + path(shape(mirrorPts(L)), hairFill, ol(2.6));
    }
    if (st === 'dreads') {
      for (const [x, sw, len] of [[136, -6, 96], [150, -8, 70], [262, 6, 100]]) {
        s += `<path d="M${x},128 Q${x + sw},${150 + len / 2} ${x + sw * 2},${140 + len}" fill="none" stroke="${LINE}" stroke-width="14" stroke-linecap="round"/>`;
        s += `<path d="M${x},128 Q${x + sw},${150 + len / 2} ${x + sw * 2},${140 + len}" fill="none" stroke="${P.hair}" stroke-width="9" stroke-linecap="round"/>`;
        for (let k = 1; k < 5; k++) { const t = k / 5; const yy = 128 + (12 + len) * t; s += `<path d="M${x + sw * 2 * t - 4},${yy} l8,3" stroke="${P.hair2}" stroke-width="2"/>`; }
      }
    }
    return s;
  }

  // ---------------- 配件 ----------------
  function accessories(P, g) {
    const a = P.accent;
    let s = '';
    switch (P.id) {
      case 'blaze': // 额头护目镜 + 创可贴
        s += path(shape([[118, 128], [200, 112], [282, 128], [284, 140], [200, 126], [116, 142]]), '#2d2a36', ol(2.6));
        for (const x of [164, 236]) {
          s += `<ellipse cx="${x}" cy="${118 + (x < 200 ? 4 : 4)}" rx="27" ry="19" fill="#3a3646" ${ol(3)}/>`;
          s += `<ellipse cx="${x}" cy="122" rx="20" ry="13" fill="url(#${g}lens)"/>`;
          s += `<path d="M${x - 12},116 q6,-5 14,-3" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round" opacity="0.85"/>`;
        }
        s += `<g transform="rotate(-18 246 246)"><rect x="232" y="240" width="30" height="12" rx="5" fill="#ffe3b8" ${ol(2)}/><rect x="243" y="240" width="8" height="12" fill="#f2c890"/></g>`;
        break;
      case 'frost': // 机械义眼光（被刘海挡住的一侧）+ 耳麦
        s += `<circle cx="236" cy="210" r="5" fill="#9ff0ff" opacity="0.9"/><circle cx="236" cy="210" r="11" fill="#5fd3ff" opacity="0.25"/>`;
        s += `<rect x="114" y="192" width="14" height="34" rx="6" fill="#2b3550" ${ol(2.4)}/><path d="M121,226 Q130,262 168,270" fill="none" stroke="#2b3550" stroke-width="4"/><circle cx="170" cy="270" r="4" fill="${a}" ${ol(1.5)}/>`;
        break;
      case 'candy': { // 猫耳耳机
        s += `<path d="M112,196 Q110,72 200,64 Q290,72 288,196" fill="none" stroke="${LINE}" stroke-width="15"/>`;
        s += `<path d="M112,196 Q110,72 200,64 Q290,72 288,196" fill="none" stroke="#fff0fa" stroke-width="9"/>`;
        for (const f of [false, true]) {
          const ear = [[138, 92, 1], [124, 36, 1], [176, 70, 1]];
          const inner = [[142, 84, 1], [132, 50, 1], [164, 72, 1]];
          s += path(shape(f ? mirrorPts(ear) : ear), '#fff0fa', ol(3)) + path(shape(f ? mirrorPts(inner) : inner), a);
          const cx = f ? 290 : 110;
          s += `<rect x="${cx - 18}" y="176" width="36" height="52" rx="16" fill="#fff0fa" ${ol(3)}/><rect x="${cx - 10}" y="188" width="20" height="28" rx="9" fill="${a}"/>`;
          s += `<circle cx="${cx}" cy="202" r="4" fill="#fff"/>`;
        }
        // 星星发夹
        s += `<path d="M250,118 l5,10 l11,1 l-8,7 l3,11 l-11,-6 l-10,6 l3,-11 l-8,-7 l11,-1 Z" fill="#ffe14d" ${ol(2)}/>`;
        break;
      }
      case 'titan': // 头巾 + 鼻梁疤
        s += path(shape([[128, 136], [200, 116], [272, 136], [272, 152], [200, 134], [128, 154]]), a, ol(3));
        s += path(shape([[262, 142], [300, 160, 1], [290, 172], [268, 156]]), mix(a, '#000', 0.2), ol(2.4));
        s += `<path d="M186,228 L214,236" stroke="${mix(P.skin, '#3a1a10', 0.45)}" stroke-width="3" stroke-linecap="round"/>`;
        s += `<path d="M196,224 L193,234 M206,227 L203,237" stroke="${mix(P.skin, '#3a1a10', 0.45)}" stroke-width="2"/>`;
        break;
      case 'raven': // 面颊涂料痕
        s += `<path d="M146,236 q10,-3 22,2" stroke="${a}" stroke-width="5" stroke-linecap="round" fill="none"/><path d="M150,246 q8,-2 15,1" stroke="#ffe14d" stroke-width="4" stroke-linecap="round" fill="none"/>`;
        break;
      case 'gale': // 棕色飞行护目镜 + 风线
        s += path(shape([[120, 124], [200, 104], [280, 124], [282, 136], [200, 118], [118, 138]]), '#6b4a32', ol(2.4));
        for (const x of [166, 234]) { s += `<ellipse cx="${x}" cy="116" rx="24" ry="17" fill="#8a6244" ${ol(3)}/><ellipse cx="${x}" cy="116" rx="17" ry="11" fill="url(#${g}lens)"/><path d="M${x - 10},110 q6,-5 13,-3" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round"/>`; }
        s += `<path d="M30,150 q60,-10 90,8 M40,180 q50,-6 76,6" stroke="#fff" stroke-width="3" fill="none" opacity="0.5" stroke-linecap="round"/>`;
        break;
      case 'hex': // 透明数据护目镜 + 耳机
        s += `<rect x="128" y="186" width="144" height="40" rx="18" fill="${P.accent}" opacity="0.32" ${ol(3)}/>`;
        s += `<path d="M140,198 h30 M150,206 h44 M210,198 h24 M226,214 h34" stroke="#fff" stroke-width="2.4" opacity="0.8" stroke-linecap="round"/>`;
        s += `<rect x="112" y="190" width="18" height="32" rx="7" fill="#20182e" ${ol(2.4)}/><rect x="270" y="190" width="18" height="32" rx="7" fill="#20182e" ${ol(2.4)}/>`;
        s += `<circle cx="279" cy="206" r="4" fill="${P.accent}"/>`;
        break;
      case 'chef': // 高高的厨师帽
        s += path(shape([[140, 118], [128, 70], [150, 30], [186, 30], [200, 14], [222, 26], [256, 30], [274, 66], [262, 118]]), '#ffffff', ol(3));
        s += `<path d="M168,40 q8,30 4,70 M224,36 q-6,30 -2,74" fill="none" stroke="#d8dce4" stroke-width="3"/>`;
        s += path(shape([[134, 132], [200, 116], [266, 132], [266, 148], [200, 132], [134, 148]]), '#f2f2f2', ol(3));
        s += `<circle cx="200" cy="218" r="0" fill="none"/>`;
        break;
      case 'vet': // 眼罩 + 疤 + 胡茬
        s += `<path d="M118,160 L282,230" stroke="${LINE}" stroke-width="4"/>`;
        s += `<ellipse cx="238" cy="210" rx="26" ry="22" fill="#1d1d24" ${ol(3)}/><path d="M226,202 q12,-6 22,0" stroke="#4a4a58" stroke-width="2" fill="none"/>`;
        s += `<path d="M150,196 L170,232" stroke="${mix(P.skin, '#7a2a1a', 0.5)}" stroke-width="3" stroke-linecap="round"/>`;
        s += `<path d="M150,250 Q200,312 250,250 Q246,286 200,296 Q154,286 150,250 Z" fill="${P.hair2}" opacity="0.35"/>`;
        for (let i = 0; i < 26; i++) { const a = Math.PI * (0.15 + 0.7 * (i / 25)); s += `<circle cx="${(200 + Math.cos(a) * 46).toFixed(1)}" cy="${(258 + Math.sin(a) * 30).toFixed(1)}" r="1.4" fill="${P.hair2}" opacity="0.7"/>`; }
        break;
      case 'flag': // 红色贝雷帽 + 黄色五角星 + 脸上一道喷漆
        s += path(shape([[116, 132], [118, 96], [160, 66], [222, 58], [276, 72], [300, 104], [290, 128], [200, 118]]), a, ol(3));
        s += `<path d="M128,124 Q200,108 288,122" fill="none" stroke="${mix(a, '#000', 0.35)}" stroke-width="5"/>`;
        s += `<path d="M252,86 l5,10 l11,1 l-8,7 l3,11 l-11,-6 l-10,6 l3,-11 l-8,-7 l11,-1 Z" fill="#ffe14d" ${ol(2)}/>`;
        s += `<path d="M142,226 q22,-6 44,2" stroke="${a}" stroke-width="7" stroke-linecap="round" opacity="0.85" fill="none"/>`;
        break;
      case 'hammer': // 黄色安全帽 + 胡茬 + 创可贴
        s += path(shape([[112, 142], [116, 96], [150, 64], [200, 52], [250, 64], [284, 96], [288, 142]]), '#ffc531', ol(3));
        s += path(shape([[96, 146], [200, 132], [304, 146], [304, 160], [200, 148], [96, 160]]), '#ffb000', ol(3));
        s += `<path d="M200,56 L200,136" stroke="#e09a00" stroke-width="8"/><rect x="186" y="88" width="28" height="18" rx="3" fill="#fff" ${ol(2)}/><path d="M192,97 h16" stroke="${LINE}" stroke-width="3"/>`;
        s += `<path d="M150,250 Q200,306 250,250 Q246,282 200,292 Q154,282 150,250 Z" fill="${P.hair2}" opacity="0.3"/>`;
        s += `<g transform="rotate(14 250 214)"><rect x="232" y="208" width="36" height="12" rx="5" fill="#ffe3b8" ${ol(2)}/></g>`;
        break;
      case 'echo': // 大耳机 + 麦克风 + 音符
        s += `<path d="M110,190 Q104,70 200,64 Q296,70 290,190" fill="none" stroke="${LINE}" stroke-width="14"/><path d="M110,190 Q104,70 200,64 Q296,70 290,190" fill="none" stroke="#2a2d3a" stroke-width="9"/>`;
        for (const x of [104, 296]) s += `<rect x="${x - 20}" y="170" width="40" height="58" rx="16" fill="#2a2d3a" ${ol(3)}/><rect x="${x - 12}" y="180" width="24" height="38" rx="10" fill="${a}"/>`;
        s += `<path d="M104,226 Q120,280 172,286" fill="none" stroke="${LINE}" stroke-width="4"/><circle cx="176" cy="286" r="8" fill="#2a2d3a" ${ol(2)}/>`;
        s += `<path d="M300,96 v-26 l14,-4 v22" fill="none" stroke="${a}" stroke-width="4"/><circle cx="296" cy="96" r="5" fill="${a}"/><circle cx="310" cy="88" r="5" fill="${a}"/>`;
        break;
      case 'han': // 战术护目镜 + 耳麦 + 眉骨疤
        s += path(shape([[118, 176], [200, 166], [282, 176], [278, 200], [200, 192], [122, 200]]), 'rgba(122,240,255,0.55)', ol(3));
        s += `<path d="M130,182 L270,182" stroke="#ffffff" stroke-width="3" opacity="0.7"/>`;
        s += `<rect x="96" y="196" width="18" height="34" rx="7" fill="#2a2d3a" ${ol(2.4)}/><path d="M104,230 Q116,268 160,276" fill="none" stroke="${LINE}" stroke-width="3"/><circle cx="162" cy="276" r="5" fill="#2a2d3a" ${ol(2)}/>`;
        s += `<path d="M232,150 L248,168" stroke="${mix(P.skin, '#7a2a1a', 0.55)}" stroke-width="3.4" stroke-linecap="round"/>`;
        break;
      case 'yuzu': // 鼻贴 + 星星发夹
        s += `<g transform="rotate(-8 200 240)"><rect x="184" y="234" width="32" height="11" rx="5" fill="#ffe3b8" ${ol(2)}/><rect x="196" y="234" width="8" height="11" fill="#f2c890"/></g>`;
        for (const [x, y] of [[112, 108], [288, 108]]) s += `<path d="M${x},${y - 12} l4,8 l9,1 l-7,6 l2,9 l-8,-5 l-8,5 l2,-9 l-7,-6 l9,-1 Z" fill="#7be0ff" ${ol(1.8)}/>`;
        break;
      case 'aurora': // 头顶护目镜 + 发夹
        s += path(shape([[124, 116], [200, 92], [276, 112], [276, 124], [200, 104], [124, 128]]), '#e9edf2', ol(2.4));
        for (const x of [170, 230]) {
          s += `<circle cx="${x}" cy="${x < 200 ? 104 : 102}" r="17" fill="#c9d3dc" ${ol(3)}/><circle cx="${x}" cy="${x < 200 ? 104 : 102}" r="11" fill="url(#${g}lens)"/>`;
        }
        s += `<rect x="136" y="150" width="22" height="7" rx="3" fill="${a}" transform="rotate(-28 147 153)" ${ol(1.8)}/><rect x="140" y="164" width="22" height="7" rx="3" fill="#ffe14d" transform="rotate(-28 151 167)" ${ol(1.8)}/>`;
        break;
    }
    return s;
  }

  // ---------------- 服装 ----------------
  function outfit(P, g) {
    const a = P.accent, skinS = mix(P.skin, '#7a3a5a', 0.3);
    const SH = [[40, 520, 1], [56, 420], [100, 368], [168, 338], [232, 338], [300, 368], [344, 420], [360, 520, 1]];
    let s = '';
    // 脖子
    s += path('M172,262 L170,346 L230,346 L228,262 Z', P.skin, ol(3));
    s += path('M171,276 Q200,312 229,276 L229,300 Q200,326 171,300 Z', skinS, 'opacity="0.75"');
    switch (P.outfit) {
      case 'jacket': {
        s += path(shape(SH), '#2a2533', ol(3));
        s += path('M168,338 L200,410 L232,338 Z', '#f4f0ea', ol(2.6));
        s += path(shape([[96, 372], [168, 336], [150, 300, 1], [184, 342], [196, 430, 1], [150, 520, 1], [70, 520, 1]]), a, ol(3));
        s += path(shape(mirrorPts([[96, 372], [168, 336], [150, 300, 1], [184, 342], [196, 430, 1], [150, 520, 1], [70, 520, 1]])), a, ol(3));
        s += `<path d="M84,430 L140,420 M316,430 L260,420" stroke="#fff" stroke-width="6" opacity="0.85"/>`;
        s += `<circle cx="268" cy="460" r="17" fill="#ffe14d" ${ol(2.4)}/><path d="M262,452 l12,8 l-12,8 Z" fill="${LINE}"/>`;
        break;
      }
      case 'coat': {
        s += path(shape(SH), '#1f2840', ol(3));
        s += path(shape([[150, 350, 1], [156, 268, 1], [200, 300], [244, 268, 1], [250, 350, 1], [200, 372]]), '#2c3a5c', ol(3));
        s += path('M156,268 L200,300 L244,268 L240,282 L200,312 L160,282 Z', '#e9f2ff');
        s += `<path d="M200,372 L200,520" stroke="${LINE}" stroke-width="3"/>`;
        for (const y of [404, 444, 484]) s += `<circle cx="214" cy="${y}" r="5" fill="#cfe4ff" ${ol(1.8)}/>`;
        s += `<path d="M90,400 L300,520" stroke="#3b2a20" stroke-width="16"/><path d="M90,400 L300,520" stroke="#6a4a34" stroke-width="10"/>`;
        s += `<path d="M66,450 L120,388 M334,450 L280,388" stroke="${a}" stroke-width="5"/>`;
        break;
      }
      case 'idol': {
        s += path(shape(SH), '#fff3fa', ol(3));
        s += path(shape([[110, 372], [170, 338], [200, 380], [148, 420, 1]]), a, ol(3)) + path(shape(mirrorPts([[110, 372], [170, 338], [200, 380], [148, 420, 1]])), a, ol(3));
        s += path('M200,380 L176,350 L170,380 Z', '#ffe14d', ol(2)) + path('M200,380 L224,350 L230,380 Z', '#ffe14d', ol(2));
        s += path('M200,380 L182,440 L196,436 L200,420 L204,436 L218,440 Z', '#ff3ea5', ol(2.4));
        s += `<circle cx="200" cy="380" r="9" fill="#ff3ea5" ${ol(2.4)}/>`;
        s += `<path d="M262,452 l4,8 l9,1 l-7,6 l2,9 l-8,-5 l-8,5 l2,-9 l-7,-6 l9,-1 Z" fill="#7be0ff" ${ol(1.8)}/>`;
        break;
      }
      case 'tank': {
        s += path(shape([[30, 520, 1], [44, 410], [96, 356], [170, 334], [230, 334], [304, 356], [356, 410], [370, 520, 1]]), P.skin, ol(3));
        s += path(shape([[48, 420], [96, 366], [130, 356], [110, 420], [70, 520, 1], [36, 520, 1]]), skinS, 'opacity="0.55"');
        s += path(shape([[132, 350], [170, 340], [200, 368], [230, 340], [268, 350], [282, 520, 1], [118, 520, 1]]), '#3d4a3a', ol(3));
        s += `<path d="M150,350 L140,520 M250,350 L260,520" stroke="${a}" stroke-width="10"/><path d="M150,350 L140,520 M250,350 L260,520" stroke="${LINE}" stroke-width="2" opacity="0.5"/>`;
        s += `<path d="M184,346 Q200,410 216,346" fill="none" stroke="#bfc6cf" stroke-width="2.4"/><rect x="190" y="404" width="20" height="28" rx="4" fill="#d9dee5" ${ol(2)}/>`;
        break;
      }
      case 'hoodie': {
        s += path(shape(SH), '#2e2442', ol(3));
        // 兜帽外沿 + 面罩
        s += path(shape([[120, 340], [200, 330], [280, 340], [262, 380], [200, 392], [138, 380]]), '#1c1630', ol(3));
        s += path(shape([[150, 300, 1], [200, 318], [250, 300, 1], [258, 344], [200, 366], [142, 344]]), '#15111f', ol(3));
        s += `<path d="M166,330 q12,10 22,0 q10,12 24,0 q10,10 22,0" fill="none" stroke="${a}" stroke-width="4" stroke-linecap="round"/>`;
        s += `<path d="M178,390 L172,470 M222,390 L228,470" stroke="#e8e0ff" stroke-width="3"/><circle cx="172" cy="474" r="5" fill="#e8e0ff"/><circle cx="228" cy="474" r="5" fill="#e8e0ff"/>`;
        for (const [x, y, r, c] of [[96, 450, 12, a], [110, 476, 6, '#ffe14d'], [292, 430, 9, '#3dffb4'], [276, 470, 5, a]]) s += `<circle cx="${x}" cy="${y}" r="${r}" fill="${c}"/>`;
        break;
      }
      case 'aviator': {
        s += path(shape(SH), '#7a4e30', ol(3));
        s += path(shape([[96, 380], [170, 334], [200, 360], [230, 334], [304, 380], [270, 402], [200, 384], [130, 402]]), '#f4e6c8', ol(3));
        // 围巾
        s += path(shape([[160, 312], [200, 336], [240, 312], [250, 346], [200, 368], [150, 346]]), P.accent, ol(3));
        s += path(shape([[214, 356], [250, 420], [236, 470, 1], [222, 424], [200, 368]]), P.accent, ol(3));
        s += `<path d="M168,330 q32,20 64,0" fill="none" stroke="#fff" stroke-width="3" opacity="0.5"/>`;
        s += `<path d="M200,384 L200,520" stroke="${LINE}" stroke-width="2.4"/>`;
        s += `<circle cx="132" cy="456" r="15" fill="#e8c24a" ${ol(2.4)}/><path d="M124,456 h16 M132,448 v16" stroke="#7a4e30" stroke-width="3"/>`;
        break;
      }
      case 'hacker': {
        s += path(shape(SH), '#1c1628', ol(3));
        s += path(shape([[120, 344], [200, 334], [280, 344], [262, 382], [200, 394], [138, 382]]), '#2a2140', ol(3));
        s += `<path d="M60,470 L130,400 L180,400 M340,470 L270,400 L220,400" stroke="${P.accent}" stroke-width="4" fill="none"/>`;
        for (const [x, y] of [[130, 400], [270, 400], [180, 400], [220, 400]]) s += `<circle cx="${x}" cy="${y}" r="5" fill="${P.accent}"/>`;
        // 挂在脖子上的耳机
        s += `<path d="M150,330 Q200,372 250,330" fill="none" stroke="#3a3050" stroke-width="8"/>`;
        s += `<rect x="134" y="318" width="24" height="30" rx="10" fill="#3a3050" ${ol(2.4)}/><rect x="242" y="318" width="24" height="30" rx="10" fill="#3a3050" ${ol(2.4)}/>`;
        s += `<text x="200" y="470" text-anchor="middle" font-family="monospace" font-size="26" font-weight="900" fill="${P.accent}">&lt;/&gt;</text>`;
        break;
      }
      case 'chefcoat': {
        s += path(shape([[34, 520, 1], [50, 414], [98, 362], [168, 336], [232, 336], [302, 362], [350, 414], [366, 520, 1]]), '#fbfbf8', ol(3));
        s += path(shape([[160, 330], [200, 356], [240, 330], [246, 356], [200, 380], [154, 356]]), '#e0402e', ol(3));
        s += path(shape([[194, 372], [182, 410, 1], [200, 396], [218, 410, 1], [206, 372]]), '#e0402e', ol(2.4));
        for (const y of [410, 444, 478]) for (const x of [168, 232]) s += `<circle cx="${x}" cy="${y}" r="6" fill="#d8dce4" ${ol(1.8)}/>`;
        s += `<path d="M90,420 q20,-10 40,0" stroke="#d8dce4" stroke-width="3" fill="none"/>`;
        s += `<rect x="252" y="420" width="44" height="26" rx="5" fill="${P.accent}" ${ol(2)}/><text x="274" y="439" text-anchor="middle" font-size="15" font-weight="900" fill="#fff" font-family="sans-serif">夜宵</text>`;
        break;
      }
      case 'military': {
        s += path(shape(SH), '#4c5a34', ol(3));
        s += path(shape([[150, 350, 1], [164, 326, 1], [200, 368], [236, 326, 1], [250, 350, 1], [200, 392]]), '#5d6c40', ol(3));
        s += path('M164,326 L200,368 L236,326 L232,340 L200,380 L168,340 Z', '#e8e2d0');
        s += `<path d="M200,392 L200,520" stroke="${LINE}" stroke-width="2.4"/>`;
        for (const x of [70, 330]) s += `<rect x="${x - 34}" y="374" width="68" height="14" rx="5" fill="#d6b44a" ${ol(2.4)} transform="rotate(${x < 200 ? -24 : 24} ${x} 381)"/>`;
        for (let i = 0; i < 3; i++) s += `<rect x="${226 + i * 18}" y="420" width="14" height="8" fill="${['#c94a3a', '#3a6dc9', '#d6b44a'][i]}" ${ol(1.4)}/>`;
        s += `<circle cx="244" cy="452" r="10" fill="#d6b44a" ${ol(2)}/><path d="M238,452 l4,4 l8,-8" stroke="#6b5a1a" stroke-width="2.4" fill="none"/>`;
        break;
      }
      case 'security': {   // 深蓝防弹背心，胸前灰石集团标志被喷漆划掉
        s += path(shape(SH), '#2a3346', ol(3));
        s += path(shape([[90, 380], [160, 346], [176, 520, 1], [84, 520, 1]]), '#1d2433', ol(3));
        s += path(shape(mirrorPts([[90, 380], [160, 346], [176, 520, 1], [84, 520, 1]])), '#1d2433', ol(3));
        s += `<rect x="236" y="410" width="54" height="30" rx="4" fill="#9aa0a8" ${ol(2.4)}/><text x="263" y="431" text-anchor="middle" font-size="14" font-family="Impact, sans-serif" fill="#2a2d3a">GRAYCO</text>`;
        s += `<path d="M228,442 L298,404" stroke="#ff5a36" stroke-width="7" stroke-linecap="round"/>`;
        for (const y of [452, 476]) s += `<rect x="110" y="${y}" width="44" height="16" rx="3" fill="#3a4458" ${ol(2)}/>`;
        s += `<path d="M168,338 L200,396 L232,338" fill="none" stroke="${P.accent}" stroke-width="5"/>`;
        break;
      }
      case 'rebel': {   // 灰色军装外套 + 红色喷漆臂章
        s += path(shape(SH), '#5b5e68', ol(3));
        s += path(shape([[150, 350, 1], [164, 326, 1], [200, 372], [236, 326, 1], [250, 350, 1], [200, 396]]), '#6d707a', ol(3));
        s += path('M164,326 L200,372 L236,326 L232,340 L200,384 L168,340 Z', '#2a2533');
        s += `<path d="M200,396 L200,520" stroke="${LINE}" stroke-width="2.4"/>`;
        s += `<path d="M60,438 L118,414 L126,446 L68,470 Z" fill="${a}" ${ol(2.4)}/><path d="M80,446 l26,-10" stroke="#fff" stroke-width="5" stroke-linecap="round"/>`;
        s += `<path d="M236,430 q30,-14 60,6 q-8,20 -30,22 q-26,-2 -30,-28 Z" fill="${a}" opacity="0.85"/><path d="M250,470 l4,24 M268,466 l2,30" stroke="${a}" stroke-width="5" stroke-linecap="round" opacity="0.85"/>`;
        break;
      }
      case 'worker': {  // 灰色工作服 + 荧光橙反光背心
        s += path(shape(SH), '#6a6e78', ol(3));
        s += path(shape([[70, 400], [150, 352], [176, 420], [176, 520, 1], [62, 520, 1]]), '#ff8a1f', ol(3));
        s += path(shape(mirrorPts([[70, 400], [150, 352], [176, 420], [176, 520, 1], [62, 520, 1]])), '#ff8a1f', ol(3));
        for (const y of [452, 488]) s += `<path d="M66,${y} L176,${y} M224,${y} L334,${y}" stroke="#f4f4f4" stroke-width="9"/>`;
        s += `<rect x="236" y="404" width="34" height="22" rx="4" fill="#2a2d3a" ${ol(2)}/><path d="M242,415 h22" stroke="#ffc531" stroke-width="3"/>`;
        break;
      }
      case 'dj': {      // 黑色飞行夹克 + 声波图案 + 磁带吊坠
        s += path(shape(SH), '#1d1b2a', ol(3));
        s += path('M168,338 L200,404 L232,338 Z', '#2ef0c8', ol(2.4));
        let wave = 'M70,450'; for (let i = 0; i < 12; i++) wave += ` l11,${i % 2 ? 26 : -26}`;
        s += `<path d="${wave}" fill="none" stroke="${a}" stroke-width="5" stroke-linejoin="round"/>`;
        s += `<path d="M206,420 L210,440" stroke="${LINE}" stroke-width="2"/><rect x="190" y="440" width="44" height="28" rx="4" fill="#ff3ea5" ${ol(2.4)}/><circle cx="203" cy="454" r="5" fill="#fff"/><circle cx="221" cy="454" r="5" fill="#fff"/>`;
        s += `<path d="M300,400 l6,14 l15,2 l-11,10 l3,15 l-13,-8 l-13,8 l3,-15 l-11,-10 l15,-2 Z" fill="#ffe14d" ${ol(2)}/>`;
        break;
      }
      case 'kid': {
        s += path(shape([[26, 520, 1], [40, 408], [92, 358], [168, 334], [232, 334], [308, 358], [360, 408], [374, 520, 1]]), '#ffd23f', ol(3));
        s += path(shape([[110, 352], [200, 336], [290, 352], [276, 392], [200, 404], [124, 392]]), '#f2b820', ol(3));
        s += `<path d="M176,400 L170,470 M224,400 L230,470" stroke="#fff" stroke-width="3"/><circle cx="170" cy="474" r="5" fill="#fff"/><circle cx="230" cy="474" r="5" fill="#fff"/>`;
        s += `<rect x="146" y="470" width="108" height="40" rx="12" fill="#f2b820" ${ol(2.4)}/>`;
        s += `<circle cx="200" cy="452" r="18" fill="#fff6e8" ${ol(2.4)}/><path d="M188,440 l4,-10 l6,8 M212,440 l-4,-10 l-6,8" fill="#fff6e8" ${ol(2)}/><circle cx="194" cy="452" r="2.4" fill="${LINE}"/><circle cx="206" cy="452" r="2.4" fill="${LINE}"/>`;
        break;
      }
      case 'engineer': {
        s += path(shape(SH), '#f2f5f7', ol(3));
        s += path(shape([[150, 350, 1], [166, 330, 1], [200, 376], [234, 330, 1], [250, 350, 1], [200, 400]]), a, ol(3));
        s += `<path d="M200,400 L200,520" stroke="${LINE}" stroke-width="2.4"/>`;
        s += `<rect x="226" y="430" width="52" height="40" rx="6" fill="#dfe6ea" ${ol(2.4)}/><rect x="232" y="420" width="10" height="26" rx="3" fill="#ffb000" ${ol(1.8)}/>`;
        s += `<path d="M110,420 L150,410" stroke="${a}" stroke-width="7"/>`;
        s += `<circle cx="132" cy="460" r="14" fill="${a}" ${ol(2.4)}/><path d="M126,460 l5,5 l8,-10" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round"/>`;
        break;
      }
    }
    return s;
  }

  // ---------------- 背景 ----------------
  function background(P, g) {
    const a = P.accent;
    let s = `<rect width="400" height="520" fill="url(#${g}bg)"/>`;
    s += `<g opacity="0.16" fill="#fff">`;
    for (let y = 10; y < 520; y += 18) for (let x = (y / 18) % 2 ? 9 : 0; x < 400; x += 18) s += `<circle cx="${x}" cy="${y}" r="${1.2 + (y / 520) * 3.2}"/>`;
    s += `</g>`;
    s += `<path d="M-20,140 L420,60 L420,120 L-20,210 Z" fill="#fff" opacity="0.08"/><path d="M-20,330 L420,250 L420,272 L-20,354 Z" fill="#fff" opacity="0.1"/>`;
    // 涂料喷溅
    const sp = [[60, 90, 46], [340, 300, 58], [320, 70, 22], [40, 360, 26], [86, 150, 10], [366, 170, 12]];
    for (const [x, y, r] of sp) {
      s += `<circle cx="${x}" cy="${y}" r="${r}" fill="${mix(a, '#fff', 0.15)}" opacity="0.45"/>`;
      for (let k = 0; k < 5; k++) { const an = k * 1.3 + x; s += `<circle cx="${(x + Math.cos(an) * r * 1.4).toFixed(0)}" cy="${(y + Math.sin(an) * r * 1.4).toFixed(0)}" r="${(r * 0.18).toFixed(1)}" fill="${a}" opacity="0.45"/>`; }
    }
    s += `<text x="384" y="508" text-anchor="end" font-family="Impact,'Arial Black',sans-serif" font-size="92" font-weight="900" fill="#fff" opacity="0.12" font-style="italic">${P.id.toUpperCase()}</text>`;
    return s;
  }

  // ================= 组装 =================
  function portrait(P, opt = {}) {
    if (typeof P === 'string') P = S.pilot(P);
    const g = 'gp' + (++UID);
    const H = HAIR[P.style]();
    const skinS = mix(P.skin, '#8a4a6a', 0.28);
    const hairL = mix(P.hair, '#ffffff', 0.45);
    const vb = opt.face ? '108 104 184 184' : opt.bust ? '40 40 320 320' : '0 0 400 520';
    let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" class="${opt.cls || 'portrait'}" preserveAspectRatio="xMidYMid slice">`;
    s += `<defs>
      <linearGradient id="${g}bg" x1="0" y1="0" x2="0.4" y2="1"><stop offset="0" stop-color="${mix(P.accent, '#1a1030', 0.25)}"/><stop offset="1" stop-color="${mix(P.accent, '#140c24', 0.78)}"/></linearGradient>
      <linearGradient id="${g}h" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${mix(P.hair, '#fff', 0.12)}"/><stop offset="0.55" stop-color="${P.hair}"/><stop offset="1" stop-color="${P.hair2}"/></linearGradient>
      <linearGradient id="${g}i" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${mix(P.eye, '#000', 0.55)}"/><stop offset="0.5" stop-color="${P.eye}"/><stop offset="1" stop-color="${mix(P.eye, '#fff', 0.5)}"/></linearGradient>
      <linearGradient id="${g}lens" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#bff6ff"/><stop offset="0.5" stop-color="${P.accent}"/><stop offset="1" stop-color="${mix(P.accent, '#000', 0.5)}"/></linearGradient>
      <clipPath id="${g}fc"><path d="${shape(FACE)}"/></clipPath>
      <clipPath id="${g}fh"><path d="${shape(H.front)}"/></clipPath>
    </defs>`;
    if (opt.bg !== false) s += background(P, g);
    // 身后头发
    s += path(shape(H.back), `url(#${g}h)`, ol(3));
    s += hairExtrasBack(P, g);
    if (P.style === 'hood') s += path(shape([[100, 330, 1], [92, 200], [112, 104], [200, 54], [288, 104], [308, 200], [300, 330, 1], [200, 340]]), '#2e2442', ol(3));
    s += outfit(P, g);
    // 耳朵 + 脸
    for (const f of [false, true]) {
      const ear = [[132, 192], [116, 186], [114, 214], [134, 230]];
      s += path(shape(f ? mirrorPts(ear) : ear), P.skin, ol(3));
    }
    const faceD = shape(FACE);
    s += path(faceD, P.skin, ol(3));
    // 刘海投影 + 侧脸阴影
    s += `<g clip-path="url(#${g}fc)">`;
    s += path(shape(H.front.map(([x, y, sh]) => [x + 4, y + 12, sh])), skinS, 'opacity="0.55"');
    s += path('M262,150 Q262,240 210,292 L280,292 L280,150 Z', skinS, 'opacity="0.35"');
    s += `</g>`;
    // 腮红
    const blushC = P.id === 'titan' ? '#a8503a' : '#ff8aa0';
    s += `<ellipse cx="152" cy="244" rx="17" ry="8" fill="${blushC}" opacity="0.38"/><ellipse cx="248" cy="244" rx="17" ry="8" fill="${blushC}" opacity="0.38"/>`;
    if (P.mouth === 'open' || P.mouth === 'smile') for (const x of [144, 240]) s += `<path d="M${x},248 l5,-8 M${x + 7},248 l5,-8 M${x + 14},248 l5,-8" stroke="#ff6f8a" stroke-width="1.6" opacity="0.7"/>`;
    // 五官
    s += brows(P);
    s += eye(164, 208, false, P, g + 'el') + eye(236, 208, true, P, g + 'er');
    s += `<path d="M203,232 L198,247 L205,248" fill="none" stroke="${mix(P.skin, LINE, 0.45)}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`;
    s += mouth(P);
    // 刘海（白夜的长刘海盖住右眼，所以在五官之后画）
    s += hairExtrasFront(P, g);
    s += path(shape(H.front), `url(#${g}h)`, ol(3));
    s += `<g clip-path="url(#${g}fh)">`;
    s += path(shape(H.hl), hairL, 'opacity="0.75"');
    // 发丝分缝线
    for (let i = 0; i < H.front.length; i++) {
      const p = H.front[i];
      if (!p[2] || p[1] < 150) continue;
      s += `<path d="M${p[0]},${p[1] - 6} Q${p[0] + (200 - p[0]) * 0.1},${p[1] - 40} ${p[0] + (200 - p[0]) * 0.25},${p[1] - 70}" fill="none" stroke="${P.hair2}" stroke-width="2.2" opacity="0.5"/>`;
    }
    s += `</g>`;
    if (P.style === 'hood') {
      s += path(shape([[100, 330, 1], [92, 200], [112, 104], [200, 54], [288, 104], [308, 200], [300, 330, 1], [282, 300], [286, 190], [266, 116], [200, 82], [134, 116], [114, 190], [118, 300]]), '#3b2f58', ol(3));
      s += `<path d="${shape([[118, 300], [114, 190], [134, 116], [200, 82], [266, 116], [286, 190], [282, 300]], false)}" fill="none" stroke="${P.accent}" stroke-width="5"/>`;
      s += `<path d="M150,72 L156,96 M250,72 L244,96" stroke="${P.accent}" stroke-width="4" stroke-linecap="round"/>`;
    }
    s += accessories(P, g);
    s += `</svg>`;
    return s;
  }

  window.GP = { portrait, mix };
})();
