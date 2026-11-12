// 涂鸦机兵 GraffiBots — Three.js 3D 渲染
// 坐标约定：游戏 (x, y, z朝上) → three (x, z, y)
(() => {
  'use strict';
  const S = window.GS;
  const T = window.THREE;
  const PK = 0.5;              // 涂料贴图分辨率（像素/游戏单位）
  const PN = 2500;             // 粒子上限
  let renderer = null, scene = null, camera = null, W = null, failed = false, HQ = true;

  function rng(seed) { let s = (seed >>> 0) || 1; return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 100000) / 100000; }; }
  const lambert = (c, extra) => new T.MeshLambertMaterial(Object.assign({ color: c }, extra));
  const basic = (c, extra) => new T.MeshBasicMaterial(Object.assign({ color: c }, extra));

  function init() {
    if (renderer) return true;
    if (failed || !T) { failed = true; return false; }
    try {
      renderer = new T.WebGLRenderer({ canvas: document.getElementById('gl'), antialias: true, powerPreference: 'high-performance' });
    } catch (e) { failed = true; console.error(e); return false; }
    renderer.setPixelRatio(Math.min(HQ ? 1.5 : 1, window.devicePixelRatio || 1));
    renderer.shadowMap.enabled = HQ;
    renderer.shadowMap.type = T.PCFSoftShadowMap;
    camera = new T.PerspectiveCamera(72, 1, 2, 7000);
    resize();
    addEventListener('resize', resize);
    return true;
  }
  function resize() {
    if (!renderer) return;
    renderer.setSize(innerWidth, innerHeight, false);
    camera.aspect = innerWidth / Math.max(1, innerHeight);
    camera.updateProjectionMatrix();
  }
  function show(on) { const c = document.getElementById('gl'); if (c) c.style.visibility = on ? 'visible' : 'hidden'; }

  function dispose() {
    if (!scene) return;
    const seen = new Set();
    scene.traverse((o) => {
      if (o.geometry && !seen.has(o.geometry)) { seen.add(o.geometry); o.geometry.dispose(); }
      const ms = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
      for (const m of ms) {
        if (seen.has(m)) continue;
        seen.add(m);
        for (const k of ['map', 'emissiveMap']) if (m[k] && !seen.has(m[k])) { seen.add(m[k]); m[k].dispose(); }
        m.dispose();
      }
    });
    scene = null; W = null; SH.ok = false;
  }

  // =====================================================================
  // 共享几何体 / 材质
  // =====================================================================
  const SH = {};
  function shared() {
    if (SH.ok) return SH;
    SH.ok = true;
    SH.dark = lambert(0x1b1c26); SH.metal = lambert(0x3c4056); SH.visor = lambert(0x0d0e15);
    SH.glow = basic(0xc4fbff); SH.yellow = basic(0xfff36b); SH.white = lambert(0xf4efe6); SH.orange = lambert(0xff7a1a);
    SH.gold = lambert(0xffd23f, { emissive: 0x4a2c00 }); SH.red = basic(0xff3e6c); SH.phone = lambert(0x23252f);
    SH.box = new T.BoxGeometry(1, 1, 1); SH.cyl = new T.CylinderGeometry(1, 1, 1, 14); SH.sph = new T.SphereGeometry(1, 12, 8); SH.sphL = new T.SphereGeometry(1, 8, 6);
    SH.cone = new T.ConeGeometry(1, 1, 12); SH.ring = new T.RingGeometry(0.86, 1, 56); SH.tube = new T.CylinderGeometry(1, 1, 1, 8, 1, true);
    SH.disc = new T.CircleGeometry(1, 40); SH.glowW = basic(0xffffff);
    return SH;
  }
  function part(g, m, sx, sy, sz, x, y, z) {
    const o = new T.Mesh(g, m);
    o.scale.set(sx, sy, sz); o.position.set(x, y, z); o.castShadow = true;
    return o;
  }

  // =====================================================================
  // 构建场景
  // =====================================================================
  function build(G) {
    if (!init()) return false;
    dispose();
    shared();
    scene = new T.Scene();
    scene.background = new T.Color(0x1d1636);
    scene.fog = new T.Fog(0x1d1636, 1300, 4200);
    scene.add(new T.HemisphereLight(0xd4dcff, 0x3a2f4a, 0.9));
    const sun = new T.DirectionalLight(0xfff0dc, 0.72);
    sun.position.set(S.W / 2 - 520, 1400, S.H / 2 - 760);
    sun.target.position.set(S.W / 2, 0, S.H / 2);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera;
    sc.left = -1250; sc.right = 1250; sc.top = 1250; sc.bottom = -1250; sc.near = 200; sc.far = 3600;
    sun.shadow.bias = -0.0006;
    scene.add(sun, sun.target);

    W = { G, M: G.M, colors: G.colors, bots: new Map(), pools: {}, dirty: true, pd: new Array(PN).fill(null), pi: 0 };
    buildSurface(G);
    buildFloor();
    buildBlocks();
    buildBounds();
    buildCity(G.map);
    buildModeDecor(G);
    buildDynamic(G);
    buildParticles();
    show(true);
    return true;
  }

  // ---------------- 地面 + 平台顶面共用的涂料贴图 ----------------
  function buildSurface(G) {
    const cv = document.createElement('canvas');
    cv.width = S.W * PK; cv.height = S.H * PK;
    const x = cv.getContext('2d'), M = G.M, C = S.CELL * PK, R = rng(G.map * 977 + 13);
    const A = ['#2b2e40', '#3f4565', '#4c5479', '#1e1f2a'];
    const B = ['#272a3a', '#3a405e', '#474e72', '#1a1b25'];
    for (let cy = 0; cy < S.GH; cy++)
      for (let cx = 0; cx < S.GW; cx++) {
        const lv = M.lv[cy * S.GW + cx];
        x.fillStyle = ((cx >> 2) + (cy >> 2)) % 2 ? A[lv] : B[lv];
        x.fillRect(cx * C, cy * C, C, C);
      }
    x.strokeStyle = 'rgba(255,255,255,0.05)'; x.lineWidth = 1;
    for (let i = 0; i <= S.GW; i += 4) { x.beginPath(); x.moveTo(i * C, 0); x.lineTo(i * C, cv.height); x.stroke(); }
    for (let j = 0; j <= S.GH; j += 4) { x.beginPath(); x.moveTo(0, j * C); x.lineTo(cv.width, j * C); x.stroke(); }
    // 地面涂鸦装饰
    x.save(); x.scale(PK, PK);
    const words = ['GB', '07', 'SPRAY', '★', 'BOTS', '42', 'INK?', 'NO.9'];
    for (let i = 0; i < 34; i++) {
      x.save(); x.translate(R() * S.W, R() * S.H); x.rotate(R() * 6.28);
      x.globalAlpha = 0.05 + R() * 0.05; x.fillStyle = '#fff'; x.strokeStyle = '#fff';
      const t = R();
      if (t < 0.35) { x.beginPath(); x.moveTo(-30, -10); x.lineTo(10, -10); x.lineTo(10, -24); x.lineTo(36, 0); x.lineTo(10, 24); x.lineTo(10, 10); x.lineTo(-30, 10); x.closePath(); x.fill(); }
      else if (t < 0.7) { x.font = 'bold 46px sans-serif'; x.fillText(words[Math.floor(R() * words.length)], -40, 16); }
      else { x.lineWidth = 6; x.beginPath(); x.arc(0, 0, 20 + R() * 30, 0, 7); x.stroke(); }
      x.restore();
    }
    // 场地边缘警示条
    x.globalAlpha = 0.3;
    for (let i = 0; i < S.W; i += 32) { x.fillStyle = (i / 32) % 2 ? '#ffd23f' : '#14151d'; x.fillRect(i, 0, 32, 8); x.fillRect(i, S.H - 8, 32, 8); }
    for (let i = 0; i < S.H; i += 32) { x.fillStyle = (i / 32) % 2 ? '#ffd23f' : '#14151d'; x.fillRect(0, i, 8, 32); x.fillRect(S.W - 8, i, 8, 32); }
    x.restore();
    // 高墙顶部：黄黑斜纹
    x.save();
    for (const [rx, ry, rw, rh, lv] of M.rects) {
      if (lv < 3) continue;
      x.save(); x.beginPath(); x.rect(rx * C, ry * C, rw * C, rh * C); x.clip();
      x.strokeStyle = 'rgba(255,210,63,0.35)'; x.lineWidth = 4;
      for (let k = -rh * C; k < rw * C; k += 14) { x.beginPath(); x.moveTo(rx * C + k, ry * C); x.lineTo(rx * C + k + rh * C, ry * C + rh * C); x.stroke(); }
      x.restore();
    }
    x.restore();
    W.surf = cv; W.sctx = x;
    W.surfTex = new T.CanvasTexture(cv);
    W.surfTex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    // 高度交界的格子：涂料只填满本格，避免溢到台阶上/下
    W.edge = new Uint8Array(S.GW * S.GH);
    for (let cy = 0; cy < S.GH; cy++)
      for (let cx = 0; cx < S.GW; cx++) {
        const t = M.top[cy * S.GW + cx];
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
          const nx = cx + dx, ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= S.GW || ny >= S.GH) continue;
          if (M.top[ny * S.GW + nx] !== t) { W.edge[cy * S.GW + cx] = 1; break; }
        }
      }
  }

  function paintCell(i, team) {
    if (!W || !team) return;
    const x = W.sctx, C = S.CELL * PK, cx = i % S.GW, cy = (i / S.GW) | 0;
    x.fillStyle = W.G.shades[team][(i * 7919) % 3];
    if (W.edge[i]) x.fillRect(cx * C, cy * C, C, C);
    else {
      x.beginPath();
      x.arc(cx * C + C / 2 + (((i * 13) % 5) - 2) * PK, cy * C + C / 2 + (((i * 29) % 5) - 2) * PK, 11.5 * PK, 0, 6.2832);
      x.fill();
    }
    W.dirty = true;
  }

  function buildFloor() {
    const g = new T.PlaneGeometry(S.W, S.H);
    g.rotateX(-Math.PI / 2); g.translate(S.W / 2, 0, S.H / 2);
    const m = new T.Mesh(g, lambert(0xffffff, { map: W.surfTex }));
    m.receiveShadow = true;
    scene.add(m);
    const g2 = new T.PlaneGeometry(9000, 9000);
    g2.rotateX(-Math.PI / 2); g2.translate(S.W / 2, -3, S.H / 2);
    scene.add(new T.Mesh(g2, lambert(0x17142a)));
  }

  function wallTexture() {
    const c = document.createElement('canvas'); c.width = 128; c.height = 128;
    const x = c.getContext('2d'), R = rng(99);
    x.fillStyle = '#c9cde0'; x.fillRect(0, 0, 128, 128);
    x.fillStyle = '#b4b9d0'; x.fillRect(0, 60, 128, 4); x.fillRect(62, 0, 4, 128);
    const cols = ['#ff5fa2', '#ffd23f', '#3ee8ff', '#a3ff3a', '#ff8a1f', '#b38cff'];
    for (let i = 0; i < 5; i++) {
      x.strokeStyle = cols[Math.floor(R() * cols.length)]; x.globalAlpha = 0.55; x.lineWidth = 4 + R() * 6; x.lineCap = 'round';
      x.beginPath(); x.moveTo(R() * 128, R() * 128);
      for (let k = 0; k < 3; k++) x.quadraticCurveTo(R() * 128, R() * 128, R() * 128, R() * 128);
      x.stroke();
    }
    x.globalAlpha = 1; x.fillStyle = '#8a8fa8';
    for (const [px, py] of [[8, 8], [120, 8], [8, 120], [120, 120], [56, 56], [72, 72]]) { x.beginPath(); x.arc(px, py, 3, 0, 7); x.fill(); }
    const t = new T.CanvasTexture(c);
    t.wrapS = t.wrapT = T.RepeatWrapping;
    t.anisotropy = 4;
    return t;
  }

  // ---------------- 方块（由高度网格合并） ----------------
  function buildBlocks() {
    const M = W.M, GW = S.GW, GH = S.GH, C = S.CELL;
    const used = new Uint8Array(GW * GH);
    const top = { p: [], n: [], uv: [] }, side = { p: [], n: [], uv: [], c: [] }, edge = { p: [], c: [] };
    const sideCol = [null, new T.Color(0x8f98c8), new T.Color(0xa7b0e2), new T.Color(0x666b8c)];
    const edgeCol = [null, new T.Color(0x5ef0ff), new T.Color(0xff5fd2), new T.Color(0xffd23f)];
    const quad = (o, v, n, uv, color) => {
      for (const k of [0, 1, 2, 0, 2, 3]) {
        o.p.push(v[k][0], v[k][1], v[k][2]); o.n.push(n[0], n[1], n[2]); o.uv.push(uv[k][0], uv[k][1]);
        if (o.c) o.c.push(color.r, color.g, color.b);
      }
    };
    const box = (x0, z0, w, d, H, lv) => {
      const x1 = x0 + w, z1 = z0 + d;
      const tuv = (x, z) => [x / S.W, 1 - z / S.H];
      quad(top, [[x0, H, z0], [x0, H, z1], [x1, H, z1], [x1, H, z0]], [0, 1, 0], [tuv(x0, z0), tuv(x0, z1), tuv(x1, z1), tuv(x1, z0)]);
      const sc = sideCol[lv];
      const suv = (len) => [[0, 0], [len / 64, 0], [len / 64, H / 64], [0, H / 64]];
      quad(side, [[x1, 0, z0], [x0, 0, z0], [x0, H, z0], [x1, H, z0]], [0, 0, -1], suv(w), sc);
      quad(side, [[x0, 0, z1], [x1, 0, z1], [x1, H, z1], [x0, H, z1]], [0, 0, 1], suv(w), sc);
      quad(side, [[x0, 0, z0], [x0, 0, z1], [x0, H, z1], [x0, H, z0]], [-1, 0, 0], suv(d), sc);
      quad(side, [[x1, 0, z1], [x1, 0, z0], [x1, H, z0], [x1, H, z1]], [1, 0, 0], suv(d), sc);
      const e = edgeCol[lv], y = H + 0.4;
      const pts = [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
      for (let k = 0; k < 4; k++) {
        const a = pts[k], b = pts[(k + 1) % 4];
        edge.p.push(a[0], y, a[1], b[0], y, b[1]);
        edge.c.push(e.r, e.g, e.b, e.r, e.g, e.b);
      }
    };
    for (let cy = 0; cy < GH; cy++)
      for (let cx = 0; cx < GW; cx++) {
        const i = cy * GW + cx, lv = M.lv[i];
        if (!lv || used[i]) continue;
        let w = 1;
        while (cx + w < GW && M.lv[i + w] === lv && !used[i + w]) w++;
        let h = 1;
        outer: while (cy + h < GH) {
          for (let k = 0; k < w; k++) { const j = (cy + h) * GW + cx + k; if (M.lv[j] !== lv || used[j]) break outer; }
          h++;
        }
        for (let j = 0; j < h; j++) for (let k = 0; k < w; k++) used[(cy + j) * GW + cx + k] = 1;
        box(cx * C, cy * C, w * C, h * C, S.LEVEL_H[lv], lv);
      }
    const mk = (o) => {
      const g = new T.BufferGeometry();
      g.setAttribute('position', new T.Float32BufferAttribute(o.p, 3));
      g.setAttribute('normal', new T.Float32BufferAttribute(o.n, 3));
      g.setAttribute('uv', new T.Float32BufferAttribute(o.uv, 2));
      if (o.c) g.setAttribute('color', new T.Float32BufferAttribute(o.c, 3));
      return g;
    };
    if (top.p.length) {
      const tm = new T.Mesh(mk(top), lambert(0xffffff, { map: W.surfTex }));
      tm.receiveShadow = true; tm.castShadow = true; scene.add(tm);
      W.wallTex = wallTexture();
      const sm = new T.Mesh(mk(side), lambert(0xffffff, { map: W.wallTex, vertexColors: true }));
      sm.receiveShadow = true; sm.castShadow = true; scene.add(sm);
      const eg = new T.BufferGeometry();
      eg.setAttribute('position', new T.Float32BufferAttribute(edge.p, 3));
      eg.setAttribute('color', new T.Float32BufferAttribute(edge.c, 3));
      scene.add(new T.LineSegments(eg, new T.LineBasicMaterial({ vertexColors: true })));
    }
  }

  function buildBounds() {
    const H = 30, th = 40;
    const mat = lambert(0x4b4f6c);
    const trim = basic(0xffd23f);
    for (const [x, z, w, d] of [[S.W / 2, -th / 2, S.W + th * 2, th], [S.W / 2, S.H + th / 2, S.W + th * 2, th], [-th / 2, S.H / 2, th, S.H], [S.W + th / 2, S.H / 2, th, S.H]]) {
      const m = part(SH.box, mat, w, H, d, x, H / 2, z);
      m.receiveShadow = true; scene.add(m);
      scene.add(part(SH.box, trim, w + 1, 3, d + 1, x, H + 1.5, z));
    }
  }

  function buildCity(mapIdx) {
    const R = rng(mapIdx * 131 + 5);
    const wc = document.createElement('canvas'); wc.width = 32; wc.height = 64;
    const x = wc.getContext('2d');
    x.fillStyle = '#000'; x.fillRect(0, 0, 32, 64);
    const lit = ['#ffd58a', '#9ae6ff', '#ff9ad5', '#fff3c4'];
    for (let j = 2; j < 64; j += 6) for (let i = 2; i < 32; i += 6) if (R() < 0.38) { x.fillStyle = lit[Math.floor(R() * lit.length)]; x.fillRect(i, j, 3, 3); }
    const wt = new T.CanvasTexture(wc); wt.wrapS = wt.wrapT = T.RepeatWrapping; wt.repeat.set(3, 6);
    const mat = lambert(0x161828, { emissive: 0xffffff, emissiveMap: wt, emissiveIntensity: 0.9 });
    const neon = ['#ff3ea5', '#1fd6ee', '#9cff2e', '#ffdf2e', '#8c5cff'];
    let placed = 0;
    for (let k = 0; k < 400 && placed < 70; k++) {
      const px = -1500 + R() * (S.W + 3000), pz = -1500 + R() * (S.H + 3000);
      if (px > -260 && px < S.W + 260 && pz > -260 && pz < S.H + 260) continue;
      const w = 120 + R() * 220, d = 120 + R() * 220, h = 180 + R() * 900;
      const b = part(SH.box, mat, w, h, d, px, h / 2 - 3, pz);
      b.castShadow = false; scene.add(b);
      if (R() < 0.5) scene.add(part(SH.box, basic(neon[Math.floor(R() * neon.length)]), w + 2, 4, d + 2, px, h - 3, pz));
      placed++;
    }
    // 霓虹广告牌
    const texts = ['GRAFFI BOTS', '涂鸦机兵', 'SPRAY ON!', 'INK ZONE'];
    for (let i = 0; i < 4; i++) {
      const c = document.createElement('canvas'); c.width = 512; c.height = 128;
      const g = c.getContext('2d');
      g.fillStyle = '#0d0b18'; g.fillRect(0, 0, 512, 128);
      g.strokeStyle = neon[i]; g.lineWidth = 6; g.strokeRect(6, 6, 500, 116);
      g.font = '900 64px "Microsoft YaHei", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.shadowColor = neon[i]; g.shadowBlur = 18; g.fillStyle = '#fff'; g.fillText(texts[i], 256, 68);
      const tex = new T.CanvasTexture(c);
      const bb = new T.Mesh(new T.PlaneGeometry(520, 130), basic(0xffffff, { map: tex }));
      const ang = (i / 4) * Math.PI * 2 + 0.6;
      bb.position.set(S.W / 2 + Math.cos(ang) * 1700, 420 + i * 60, S.H / 2 + Math.sin(ang) * 1400);
      bb.lookAt(S.W / 2, 200, S.H / 2);
      scene.add(bb);
    }
  }

  function flat(mesh, x, y, z) { mesh.rotation.x = -Math.PI / 2; mesh.position.set(x, z, y); return mesh; }

  function buildModeDecor(G) {
    const cs = G.colors;
    for (const t of [1, 2]) {
      const b = S.basePos(t);
      scene.add(flat(part(SH.disc, basic(cs[t], { transparent: true, opacity: 0.3, depthWrite: false }), 66, 66, 1), b.x, b.y, 0.7));
      scene.add(flat(part(SH.ring, basic(cs[t]), 66, 66, 1), b.x, b.y, 0.9));
    }
    if (G.mode === 'zone') {
      const Z = S.ZONE, C = S.CELL;
      const w = (Z.x1 - Z.x0) * C, h = (Z.y1 - Z.y0) * C;
      W.zoneMat = basic(0xffffff, { transparent: true, opacity: 0.12, depthWrite: false });
      const zp = new T.Mesh(new T.PlaneGeometry(w, h), W.zoneMat);
      flat(zp, Z.x0 * C + w / 2, Z.y0 * C + h / 2, 1.2); scene.add(zp);
      W.zoneLineMat = new T.LineBasicMaterial({ color: 0xffffff });
      const pts = [[Z.x0, Z.y0], [Z.x1, Z.y0], [Z.x1, Z.y1], [Z.x0, Z.y1], [Z.x0, Z.y0]].map(([a, b]) => new T.Vector3(a * C, 1.6, b * C));
      scene.add(new T.Line(new T.BufferGeometry().setFromPoints(pts), W.zoneLineMat));
      // 四角立柱
      W.zonePosts = [];
      for (const [a, b] of [[Z.x0, Z.y0], [Z.x1, Z.y0], [Z.x1, Z.y1], [Z.x0, Z.y1]]) {
        const m = basic(0xffffff);
        W.zonePosts.push(m);
        scene.add(part(SH.cyl, m, 3, 70, 3, a * C, 35, b * C));
      }
    }
    if (G.mode === 'escort') {
      for (const t of [1, 2]) {
        const g = S.goalFor(t, G.map);
        scene.add(flat(part(SH.disc, basic(cs[t], { transparent: true, opacity: 0.35, depthWrite: false }), 52, 52, 1), g.x, g.y, 1));
        scene.add(flat(part(SH.ring, basic(cs[t]), 52, 52, 1), g.x, g.y, 1.2));
        const beam = part(SH.tube, basic(cs[t], { transparent: true, opacity: 0.18, side: T.DoubleSide, depthWrite: false, blending: T.AdditiveBlending }), 52, 300, 52, g.x, 150, g.y);
        beam.castShadow = false; scene.add(beam);
      }
    }
    if (G.mode === 'soccer') {
      const gl = S.SOCCER_GOAL;
      for (const [t, gx] of [[1, gl.depth], [2, S.W - gl.depth]]) {
        const m = lambert(cs[t], { emissive: new T.Color(cs[t]).multiplyScalar(0.3) });
        for (const s of [-1, 1]) scene.add(part(SH.cyl, m, 4, 100, 4, gx, 50, S.H / 2 + s * gl.half));
        const bar = part(SH.cyl, m, 4, gl.half * 2, 4, gx, 100, S.H / 2); bar.rotation.x = Math.PI / 2; scene.add(bar);
        const back = t === 1 ? 2 : S.W - 2;
        const net = new T.Mesh(new T.PlaneGeometry(gl.half * 2, 100), basic(cs[t], { transparent: true, opacity: 0.18, side: T.DoubleSide, depthWrite: false }));
        net.position.set(back, 50, S.H / 2); net.rotation.y = Math.PI / 2; scene.add(net);
        const area = new T.Mesh(new T.PlaneGeometry(gl.depth, gl.half * 2), basic(cs[t], { transparent: true, opacity: 0.22, depthWrite: false }));
        flat(area, t === 1 ? gl.depth / 2 : S.W - gl.depth / 2, S.H / 2, 1); scene.add(area);
      }
    }
    if (G.mode === 'battery') {
      for (const t of [1, 2]) {
        const b = S.basePos(t);
        scene.add(flat(part(SH.ring, basic(cs[t]), 120, 120, 1), b.x, b.y, 1.1));
        const wall = part(SH.tube, basic(cs[t], { transparent: true, opacity: 0.12, side: T.DoubleSide, depthWrite: false, blending: T.AdditiveBlending }), 120, 40, 120, b.x, 20, b.y);
        wall.castShadow = false; scene.add(wall);
      }
    }
  }

  // ---------------- 动态物体 ----------------
  function pool(make) {
    const items = [];
    let n = 0;
    return {
      begin() { n = 0; },
      next() { let m = items[n]; if (!m) { m = make(); items.push(m); scene.add(m); } m.visible = true; n++; return m; },
      end() { for (let i = n; i < items.length; i++) items[i].visible = false; },
    };
  }
  function buildDynamic(G) {
    const cs = G.colors, P = W.pools;
    for (const t of [1, 2]) {
      const pm = basic(cs[t]);
      P['proj' + t] = pool(() => { const m = new T.Mesh(SH.sph, pm); return m; });
      const bm = lambert(cs[t], { emissive: new T.Color(cs[t]).multiplyScalar(0.25) });
      P['bomb' + t] = pool(() => {
        const g = new T.Group();
        const s = new T.Mesh(SH.sph, bm); s.scale.setScalar(8); s.castShadow = true; g.add(s);
        const cap = part(SH.cyl, SH.dark, 3, 5, 3, 0, 8, 0); g.add(cap);
        return g;
      });
      const mm = basic(cs[t], { transparent: true, opacity: 0.8, side: T.DoubleSide, depthWrite: false });
      P['mark' + t] = pool(() => new T.Mesh(SH.ring, mm));
      const cm = lambert(cs[t], { emissive: new T.Color(cs[t]).multiplyScalar(0.4) });
      P['missile' + t] = pool(() => { const m = new T.Mesh(SH.cone, cm); m.scale.set(9, 34, 9); m.rotation.x = Math.PI; return m; });
    }
    P.ring = pool(() => new T.Mesh(SH.ring, basic(0xffffff, { transparent: true, side: T.DoubleSide, depthWrite: false })));
    P.line = pool(() => new T.Mesh(SH.tube, basic(0xffffff, { transparent: true, depthWrite: false, blending: T.AdditiveBlending })));
    P.beam = pool(() => new T.Mesh(SH.tube, basic(0xffffff, { transparent: true, opacity: 0.75, depthWrite: false, blending: T.AdditiveBlending })));
    P.beamCore = pool(() => new T.Mesh(SH.tube, basic(0xffffff)));
    const batMat = lambert(0x9cff2e, { emissive: 0x3c7a00 });
    P.bat = pool(() => {
      const g = new T.Group();
      g.add(part(SH.cyl, batMat, 6, 16, 6, 0, 0, 0));
      g.add(part(SH.cyl, SH.white, 3, 4, 3, 0, 10, 0));
      return g;
    });
    if (G.mode === 'escort') {
      W.treasure = new T.Group();
      const core = new T.Mesh(new T.OctahedronGeometry(15), lambert(0xffd23f, { emissive: 0x8a5a00 }));
      core.castShadow = true; W.treasure.add(core); W.treasureCore = core;
      const halo = new T.Mesh(SH.ring, basic(0xfff3a0, { transparent: true, opacity: 0.6, side: T.DoubleSide, depthWrite: false }));
      halo.scale.setScalar(24); halo.rotation.x = Math.PI / 2; W.treasure.add(halo);
      scene.add(W.treasure);
    }
    if (G.mode === 'soccer') {
      const c = document.createElement('canvas'); c.width = 256; c.height = 128;
      const x = c.getContext('2d');
      x.fillStyle = '#f5f6ff'; x.fillRect(0, 0, 256, 128);
      x.fillStyle = '#2a2d3d';
      for (let i = 0; i < 8; i++) { x.beginPath(); x.arc(16 + i * 32, i % 2 ? 40 : 88, 12, 0, 7); x.fill(); }
      x.fillRect(0, 60, 256, 8);
      W.ballMat = lambert(0xffffff, { map: new T.CanvasTexture(c) });
      W.ball = new T.Mesh(new T.SphereGeometry(26, 24, 16), W.ballMat);
      W.ball.castShadow = true; scene.add(W.ball);
      W.ballPrev = null;
    }
  }

  function buildParticles() {
    const g = new T.BufferGeometry();
    W.pPos = new Float32Array(PN * 3); W.pCol = new Float32Array(PN * 3);
    for (let i = 0; i < PN; i++) W.pPos[i * 3 + 1] = -9999;
    g.setAttribute('position', new T.BufferAttribute(W.pPos, 3));
    g.setAttribute('color', new T.BufferAttribute(W.pCol, 3));
    const m = new T.PointsMaterial({ size: 7, vertexColors: true, sizeAttenuation: true, transparent: true, depthWrite: false });
    W.points = new T.Points(g, m);
    W.points.frustumCulled = false;
    scene.add(W.points);
  }
  function burst(x, y, z, color, n, spd = 220, up = 1) {
    if (!W) return;
    const c = new T.Color(color);
    for (let k = 0; k < n; k++) {
      const i = W.pi; W.pi = (W.pi + 1) % PN;
      const a = Math.random() * 6.283, e = 0.15 + Math.random() * 1.1 * up, v = spd * (0.3 + Math.random());
      W.pd[i] = { x, y, z, vx: Math.cos(a) * Math.cos(e) * v, vy: Math.sin(a) * Math.cos(e) * v, vz: Math.sin(e) * v, life: 0.35 + Math.random() * 0.5 };
      W.pCol[i * 3] = c.r; W.pCol[i * 3 + 1] = c.g; W.pCol[i * 3 + 2] = c.b;
    }
    W.points.geometry.attributes.color.needsUpdate = true;
  }
  function stepParticles(dt) {
    const P = W.pPos;
    for (let i = 0; i < PN; i++) {
      const p = W.pd[i];
      if (!p) continue;
      p.life -= dt;
      if (p.life <= 0) { W.pd[i] = null; P[i * 3 + 1] = -9999; continue; }
      p.vz -= 760 * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      const gh = S.topAt(W.M, p.x, p.y);
      if (p.z < gh && gh < 1e3) { p.z = gh + 0.5; p.vx *= 0.4; p.vy *= 0.4; p.vz = 0; }
      P[i * 3] = p.x; P[i * 3 + 1] = p.z; P[i * 3 + 2] = p.y;
    }
    W.points.geometry.attributes.position.needsUpdate = true;
  }

  // =====================================================================
  // 机兵模型
  // =====================================================================
  function buildWeapon(g, weapon, color) {
    const s = SH, cm = lambert(color);
    const add = (o) => { g.add(o); return o; };
    switch (weapon) {
      case 'blaster':
        add(part(s.box, s.metal, 18, 6, 6, 5, 0, 0));
        add(part(s.box, cm, 7, 5, 5, 15, 0, 0));
        add(part(s.box, s.dark, 4, 7, 3, 0, -5, 0));
        break;
      case 'roller': {
        g.position.z = 4;
        add(part(s.box, s.metal, 20, 3, 3, 8, -6, -4));
        const r = add(part(s.cyl, cm, 7, 42, 7, 20, -12, -19)); r.rotation.x = Math.PI / 2;
        g.userData.roller = r;
        break;
      }
      case 'charger':
        add(part(s.box, s.metal, 40, 4, 4, 14, 0, 0));
        add(part(s.box, cm, 12, 5, 5, 6, 4, 0));
        add(part(s.box, s.dark, 5, 8, 3, 0, -5, 0));
        g.userData.tip = add(part(s.sph, basic(0xffffff, { transparent: true, opacity: 0.9 }), 2, 2, 2, 35, 0, 0));
        break;
      case 'bucket': {
        const b = add(new T.Mesh(new T.CylinderGeometry(9, 4, 18, 14, 1, true), new T.MeshLambertMaterial({ color, side: T.DoubleSide })));
        b.rotation.z = -Math.PI / 2; b.position.set(12, 0, 0); b.castShadow = true;
        add(part(s.box, s.metal, 6, 6, 6, 1, 0, 0));
        break;
      }
      case 'gatling': {
        add(part(s.box, s.metal, 12, 14, 12, 1, 0, 0));
        const sp = new T.Group(); sp.position.set(8, 0, 0); g.add(sp);
        for (let i = 0; i < 3; i++) {
          const a = (i / 3) * Math.PI * 2;
          const br = part(s.cyl, s.dark, 1.8, 22, 1.8, 11, Math.cos(a) * 3.6, Math.sin(a) * 3.6);
          br.rotation.z = -Math.PI / 2; sp.add(br);
        }
        const ring = part(s.cyl, cm, 5.5, 3, 5.5, 18, 0, 0); ring.rotation.z = -Math.PI / 2; sp.add(ring);
        g.userData.spinner = sp;
        break;
      }
    }
  }
  function buildHead(g, head, color) {
    const s = SH;
    const add = (o) => { g.add(o); return o; };
    switch (head) {
      case 'antenna': {
        const a = add(part(s.cyl, s.metal, 0.9, 13, 0.9, -5, 6, -5)); a.rotation.set(-0.35, 0, 0.35);
        add(part(s.sph, s.yellow, 2.8, 2.8, 2.8, -7.2, 12.2, -7.2));
        break;
      }
      case 'mohawk': {
        const m = lambert(new T.Color(color).lerp(new T.Color(0xffffff), 0.5));
        for (let i = 0; i < 4; i++) add(part(s.cone, m, 2.6, 9, 2.6, -7 + i * 4.6, 4.5, 0));
        break;
      }
      case 'phones': {
        const arc = add(new T.Mesh(new T.TorusGeometry(13.5, 1.5, 6, 18, Math.PI), s.phone));
        arc.rotation.y = Math.PI / 2; arc.position.y = -7; arc.castShadow = true;
        for (const z of [-13.5, 13.5]) {
          const c = add(part(s.cyl, s.phone, 5, 4, 5, 0, -7, z)); c.rotation.x = Math.PI / 2;
          const d = add(part(s.cyl, lambert(color), 2.4, 4.4, 2.4, 0, -7, z)); d.rotation.x = Math.PI / 2;
        }
        break;
      }
      case 'cone':
        add(part(s.cone, s.orange, 7, 15, 7, 0, 7.5, 0));
        add(part(s.cyl, s.white, 5.2, 2.2, 5.2, 0, 6, 0));
        break;
      case 'crown': {
        const band = add(new T.Mesh(new T.CylinderGeometry(9, 9, 6, 12, 1, true), new T.MeshLambertMaterial({ color: 0xffd23f, emissive: 0x4a2c00, side: T.DoubleSide })));
        band.position.y = 3; band.castShadow = true;
        for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; add(part(s.cone, s.gold, 2.4, 6, 2.4, Math.cos(a) * 8.5, 9, Math.sin(a) * 8.5)); }
        add(part(s.sph, s.red, 2.2, 2.2, 2.2, 9, 3, 0));
        break;
      }
      case 'horns':
        for (const z of [-1, 1]) { const h = add(part(s.cone, s.white, 2.8, 13, 2.8, 2, 6, z * 9)); h.rotation.x = z * 0.55; }
        break;
    }
  }
  // ---------------- 卡通着色工具 ----------------
  let TOON_GRAD = null;
  function toonGrad() {
    if (TOON_GRAD) return TOON_GRAD;
    const v = [70, 150, 220, 255], d = new Uint8Array(v.length * 4);
    v.forEach((x, i) => { d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = x; d[i * 4 + 3] = 255; });
    TOON_GRAD = new T.DataTexture(d, v.length, 1, T.RGBAFormat);
    TOON_GRAD.minFilter = TOON_GRAD.magFilter = T.NearestFilter;
    TOON_GRAD.needsUpdate = true;
    return TOON_GRAD;
  }
  const toon = (c, extra) => new T.MeshToonMaterial(Object.assign({ color: c, gradientMap: toonGrad() }, extra));
  // 圆角方块：把细分方块的顶点推到「内盒 + 半径」的表面上
  const RB = new Map();
  function rbox(w, h, d, r, seg = 2) {
    const key = [w, h, d, r, seg].join(',');
    if (RB.has(key)) return RB.get(key);
    const g = new T.BoxGeometry(w, h, d, seg * 2, seg * 2, seg * 2);
    const p = g.attributes.position, v = new T.Vector3(), c = new T.Vector3();
    const ix = w / 2 - r, iy = h / 2 - r, iz = d / 2 - r;
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      c.set(Math.max(-ix, Math.min(ix, v.x)), Math.max(-iy, Math.min(iy, v.y)), Math.max(-iz, Math.min(iz, v.z)));
      v.sub(c);
      if (v.lengthSq() > 1e-8) v.setLength(r);
      p.setXYZ(i, c.x + v.x, c.y + v.y, c.z + v.z);
    }
    g.computeVertexNormals();
    RB.set(key, g);
    return g;
  }
  const OUTLINE = new T.MeshBasicMaterial({ color: 0x1a1024, side: T.BackSide });
  // 画质：低画质关闭阴影、描边，降低分辨率（阴影开关在下一次建场景时生效）
  function setQuality(hq) {
    HQ = !!hq;
    OUTLINE.visible = HQ;
    if (renderer) {
      renderer.setPixelRatio(Math.min(HQ ? 1.5 : 1, window.devicePixelRatio || 1));
      resize();
      if (renderer.shadowMap.enabled !== HQ) {
        renderer.shadowMap.enabled = HQ;
        if (scene) scene.traverse((o) => { if (o.material) for (const m of [].concat(o.material)) m.needsUpdate = true; });
      }
    }
  }
  // 反向外壳描边：同一几何体放大一点、只画背面
  function outlined(geo, mat, sx, sy, sz, x, y, z, k = 1) {
    const g = new T.Group();
    g.position.set(x, y, z);
    const m = new T.Mesh(geo, mat); m.scale.set(sx, sy, sz); m.castShadow = true;
    const o = new T.Mesh(geo, OUTLINE);
    const e = 0.9 * k;
    // 统一用绝对描边宽度：根据几何体包围盒换算缩放
    geo.computeBoundingBox();
    const bb = geo.boundingBox, gw = bb.max.x - bb.min.x, gh = bb.max.y - bb.min.y, gd = bb.max.z - bb.min.z;
    o.scale.set(sx * (1 + (2 * e) / Math.max(0.01, gw * Math.abs(sx))), sy * (1 + (2 * e) / Math.max(0.01, gh * Math.abs(sy))), sz * (1 + (2 * e) / Math.max(0.01, gd * Math.abs(sz))));
    g.add(o, m);
    g.userData.mesh = m;
    return g;
  }

  // 合并静态部件：同一材质的网格合成一个，大幅减少绘制调用。
  // 带 userData.dyn（会动的关节组）或 userData.keep（单独动画的零件）的对象不会被合并。
  function bake(g, shadows = true) {
    g.updateMatrixWorld(true);
    const inv = new T.Matrix4().copy(g.matrixWorld).invert();
    const buckets = new Map(), removed = [];
    const visit = (o) => {
      for (const c of o.children) {
        if (c.userData.dyn || c.userData.keep) continue;
        if (c.isMesh) {
          const m = new T.Matrix4().multiplyMatrices(inv, c.matrixWorld);
          if (!buckets.has(c.material)) buckets.set(c.material, { items: [], shadow: false });
          const bk = buckets.get(c.material);
          bk.items.push([c.geometry, m]); bk.shadow = bk.shadow || c.castShadow;
          removed.push(c);
        } else if (c.children.length) visit(c);
      }
    };
    visit(g);
    for (const c of removed) c.parent.remove(c);
    // 清理空掉的静态子组
    const prune = (o) => { for (const c of [...o.children]) { if (c.userData.dyn || c.userData.keep || c.isMesh) continue; prune(c); if (!c.children.length) o.remove(c); } };
    prune(g);
    for (const [mat, bk] of buckets) {
      let n = 0;
      const parts = bk.items.map(([geo, m]) => { const gg = (geo.index ? geo.toNonIndexed() : geo.clone()).applyMatrix4(m); n += gg.attributes.position.count; return gg; });
      const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3);
      let o = 0;
      for (const gg of parts) { pos.set(gg.attributes.position.array, o * 3); nor.set(gg.attributes.normal.array, o * 3); o += gg.attributes.position.count; gg.dispose(); }
      const geo = new T.BufferGeometry();
      geo.setAttribute('position', new T.BufferAttribute(pos, 3));
      geo.setAttribute('normal', new T.BufferAttribute(nor, 3));
      geo.computeBoundingSphere();
      const mesh = new T.Mesh(geo, mat);
      mesh.castShadow = shadows && bk.shadow && mat !== OUTLINE;
      g.add(mesh);
    }
    return g;
  }
  const dyn = (o) => { o.userData.dyn = true; return o; };

  // =====================================================================
  // 驾驶员（驾驶舱里的 3D 小人头）
  // =====================================================================
  function buildPilot(pilotId, headCosmetic, teamColor) {
    const P = S.pilot(pilotId);
    const g = new T.Group();
    const skin = toon(P.skin), hair = toon(P.hair), hair2 = toon(P.hair2), acc = toon(P.accent);
    const sph = SH.sphL;
    const add = (o) => { g.add(o); return o; };
    // 身体（驾驶服）+ 脖子
    add(part(sph, toon(teamColor), 4.4, 3.2, 4.8, -0.6, -5.2, 0));
    add(part(SH.cyl, skin, 1.4, 2.4, 1.4, 0, -3.2, 0));
    // 头
    add(part(SH.sph, skin, 4.2, 4.5, 4.2, 0, 0.4, 0));
    // 眼睛（大大的动漫眼：白底 + 彩色虹膜 + 高光）
    for (const z of [-1.5, 1.5]) {
      add(part(sph, SH.white, 0.5, 1.25, 0.95, 3.75, 0.2, z));
      add(part(sph, toon(P.eye), 0.45, 1.0, 0.72, 3.98, 0.05, z));
      add(part(sph, SH.glowW, 0.2, 0.32, 0.3, 4.3, 0.55, z - 0.2));
    }
    // 头发主体
    const cap = add(part(SH.sph, hair, 4.7, 4.5, 4.7, -0.7, 1.4, 0));
    cap.scale.set(4.75, 4.4, 4.75);
    // 刘海
    for (let i = -2; i <= 2; i++) {
      const b = add(part(SH.cone, hair, 1.2, 3.2, 1.3, 3.2, 2.6 - Math.abs(i) * 0.2, i * 1.25));
      b.rotation.z = Math.PI - 0.5; b.rotation.x = i * 0.12;
    }
    switch (P.style) {
      case 'spiky':
        for (let i = 0; i < 9; i++) {
          const a = (i / 8) * Math.PI * 1.25 - 0.2, s2 = add(part(SH.cone, hair, 1.5, 5, 1.5, -1.6 * Math.cos(a) - 0.6, 3.6 + Math.sin(a) * 1.2, (i - 4) * 1.05));
          s2.rotation.z = 0.9 + Math.cos(a) * 0.5; s2.rotation.x = (i - 4) * 0.22;
        }
        break;
      case 'swept': {
        const b = add(part(sph, hair, 1.6, 3.6, 2.4, 3.4, 0.6, 1.4)); b.rotation.x = -0.3;
        add(part(sph, hair, 2.2, 4, 1.4, -0.4, -2, -3.7)); add(part(sph, hair, 2.2, 4, 1.4, -0.4, -2, 3.7));
        break;
      }
      case 'twintail':
        for (const z of [-1, 1]) {
          const t2 = add(part(sph, hair, 1.8, 5.4, 1.8, -1.2, -2.6, z * 5.6)); t2.rotation.x = -z * 0.35;
          add(part(sph, acc, 0.9, 0.9, 0.9, -1.0, 2.2, z * 4.8));
        }
        break;
      case 'dreads':
        for (let i = 0; i < 7; i++) {
          const a = (i / 6 - 0.5) * 2.4;
          const d2 = add(part(SH.cyl, hair2, 0.55, 5.5, 0.55, -3.4 * Math.cos(a) - 0.6, -0.8, 3.4 * Math.sin(a))); d2.rotation.z = -0.25 * Math.cos(a); d2.rotation.x = 0.25 * Math.sin(a);
        }
        break;
      case 'hood': {
        const h2 = add(part(sph, toon(0x2e2442), 5.4, 5.4, 5.4, -1.2, 1.0, 0)); h2.scale.set(5.3, 5.4, 5.6);
        const rim = add(new T.Mesh(new T.TorusGeometry(4.6, 0.45, 6, 18), acc)); rim.rotation.y = Math.PI / 2; rim.position.set(1.8, 0.9, 0);
        break;
      }
      case 'ponytail': {
        const t2 = add(part(sph, hair, 1.8, 6, 1.8, -4.6, 0.6, 0)); t2.rotation.z = -1.0;
        add(part(sph, acc, 1, 1, 1, -3.6, 3, 0));
        break;
      }
    }
    // 驾驶员的标志配件
    if (P.id === 'blaze' || P.id === 'aurora') {
      for (const z of [-1.7, 1.7]) { const gg = add(new T.Mesh(new T.TorusGeometry(1.15, 0.45, 6, 12), SH.dark)); gg.rotation.y = Math.PI / 2 - 0.2; gg.position.set(2.6, 3.6, z); add(part(sph, toon(P.accent, { emissive: new T.Color(P.accent).multiplyScalar(0.4) }), 0.5, 1, 1, 2.7, 3.6, z)); }
    }
    if (P.id === 'candy') for (const z of [-1, 1]) { const e = add(part(SH.cone, SH.white, 1.4, 2.6, 1.0, -0.4, 5.0, z * 2.5)); e.rotation.x = z * 0.35; }
    if (P.id === 'titan') { const band = add(new T.Mesh(new T.TorusGeometry(4.45, 0.55, 6, 20), acc)); band.rotation.x = Math.PI / 2; band.rotation.z = 0.15; band.position.y = 2.2; }
    // 等级解锁的头部涂装，缩小后戴在驾驶员头上
    const hc = new T.Group(); hc.position.set(-0.5, 4.2, 0); hc.scale.setScalar(0.42); g.add(hc);
    buildHead(hc, headCosmetic, teamColor);
    return bake(g, false);
  }

  // =====================================================================
  // 机兵模型：双足 + 圆角装甲 + 驾驶舱
  // 层级：root(位置/朝向) → lower(腿部朝向移动方向) / upper(上身朝向瞄准方向, 弹簧倾斜)
  // =====================================================================
  const LEG = { L1: 6.6, L2: 6.4, foot: 1.6, hipZ: 6.2 };
  function makeBot(color, head, weapon, pilotId) {
    const s = SH;
    const root = new T.Group();
    const bodyMat = toon(color);
    const tint = toon(new T.Color(color).multiplyScalar(0.62));
    const light = toon(new T.Color(color).lerp(new T.Color(0xffffff), 0.55));
    const frame = toon(0x3a3e52), joint = toon(0x23252f);
    const body = dyn(new T.Group()); root.add(body);            // 双足形态（滚轮形态时隐藏）
    const hips = dyn(new T.Group()); body.add(hips);              // 髋部高度随步态 / 悬挂变化
    const lower = dyn(new T.Group()); hips.add(lower);            // 腿部朝向
    const upper = dyn(new T.Group()); hips.add(upper);            // 上身（朝向瞄准方向）
    const lean = dyn(new T.Group()); upper.add(lean);              // 弹簧倾斜
    // ---- 腿 ----
    lower.add(outlined(rbox(10, 5, 15, 2), frame, 1, 1, 1, 0, 0, 0));
    const legs = [];
    for (const side of [-1, 1]) {
      const hip = dyn(new T.Group()); hip.position.set(0, -0.5, side * LEG.hipZ); lower.add(hip);
      hip.add(part(s.sph, joint, 2.4, 2.4, 2.4, 0, 0, 0));
      hip.add(outlined(rbox(5.4, LEG.L1 + 1.4, 5, 1.8), bodyMat, 1, 1, 1, 0, -LEG.L1 / 2, 0));
      const knee = dyn(new T.Group()); knee.position.y = -LEG.L1; hip.add(knee);
      knee.add(part(s.sph, joint, 2.1, 2.1, 2.1, 0, 0, 0));
      knee.add(outlined(rbox(4.6, LEG.L2 + 1, 4.4, 1.5), frame, 1, 1, 1, 0, -LEG.L2 / 2, 0));
      knee.add(outlined(rbox(3, 4, 4.8, 1.2), light, 1, 1, 1, 2.4, -1.6, 0));      // 膝盖护甲
      const ankle = dyn(new T.Group()); ankle.position.y = -LEG.L2; knee.add(ankle);
      ankle.add(outlined(rbox(10, 3, 6.4, 1.3), tint, 1, 1, 1, 1.4, -0.4, 0));
      ankle.add(part(s.box, joint, 3, 1.2, 6.6, -2.6, -1.4, 0));
      legs.push({ hip, knee, ankle, side });
    }
    // ---- 上身 ----
    const torso = outlined(rbox(18, 13, 20, 4.5), bodyMat, 1, 1, 1, 0, 9, 0); lean.add(torso);
    lean.add(outlined(rbox(4, 9, 14, 2), light, 1, 1, 1, 8.4, 8.2, 0));           // 胸甲
    lean.add(part(s.box, s.glow, 0.6, 1.4, 9, 10.5, 9.6, 0));                      // 胸口发光条
    lean.add(outlined(rbox(17, 3, 21, 1.4), tint, 1, 1, 1, 0, 3, 0));             // 腰带
    for (const side of [-1, 1]) {
      const sh = outlined(rbox(9, 7, 6, 2.4), tint, 1, 1, 1, 0, 13, side * 12.5); lean.add(sh);
      lean.add(part(s.box, s.yellow, 4, 1, 0.6, 2, 14.5, side * 15.6));
    }
    // 背后涂料罐（玻璃 + 液位）
    lean.add(outlined(rbox(6, 15, 11, 2.4), frame, 1, 1, 1, -10.5, 9.5, 0));
    const tankGlass = new T.Mesh(s.cyl, new T.MeshLambertMaterial({ color: 0xd8f3ff, transparent: true, opacity: 0.35, depthWrite: false }));
    tankGlass.scale.set(3.4, 12, 3.4); tankGlass.position.set(-13.6, 9.5, 0); tankGlass.userData.keep = true; lean.add(tankGlass);
    const tankFill = part(s.cyl, basic(color), 2.9, 11, 2.9, -13.6, 9.5, 0); tankFill.userData.keep = true; tankFill.castShadow = false; lean.add(tankFill);
    // 驾驶舱 + 驾驶员
    const cockpit = new T.Group(); cockpit.position.set(2, 16, 0); lean.add(cockpit);
    cockpit.add(outlined(rbox(14, 3, 14, 1.4), frame, 1, 1, 1, 0, 0, 0));
    const pilot = dyn(buildPilot(pilotId, head, color)); pilot.position.set(0, 7, 0); cockpit.add(pilot);
    const dome = new T.Mesh(new T.SphereGeometry(8.2, 22, 14, 0, Math.PI * 2, 0, Math.PI * 0.55),
      new T.MeshPhongMaterial({ color: 0xbdefff, transparent: true, opacity: 0.22, shininess: 120, specular: 0xffffff, depthWrite: false }));
    dome.position.y = 1; dome.userData.keep = true; cockpit.add(dome);
    const rim = new T.Mesh(new T.TorusGeometry(7.7, 0.8, 6, 24), frame); rim.rotation.x = Math.PI / 2; rim.position.y = 1.4; cockpit.add(rim);
    // 武器臂
    const wpnMount = dyn(new T.Group()); wpnMount.position.set(3, 9, 15.5); lean.add(wpnMount);
    wpnMount.add(part(s.sph, joint, 3, 3, 3, -2, 0, 0));
    const wpn = dyn(new T.Group()); wpnMount.add(wpn);
    buildWeapon(wpn, weapon, color);
    for (const k of ['roller', 'spinner', 'tip']) if (wpn.userData[k]) wpn.userData[k].userData.keep = true;
    const arm = dyn(new T.Group()); arm.position.set(1, 10, -15.5); lean.add(arm);
    arm.add(outlined(rbox(9, 4, 4, 1.6), frame, 1, 1, 1, 2.6, -1, 0));
    arm.add(outlined(rbox(3.6, 4.6, 4.6, 1.6), bodyMat, 1, 1, 1, 7, -1, 0));
    // ---- 滚轮形态 ----
    const wheel = dyn(new T.Group()); wheel.position.y = 14; root.add(wheel);
    const wheelTilt = dyn(new T.Group()); wheel.add(wheelTilt);
    const spinG = dyn(new T.Group()); wheelTilt.add(spinG);
    const wheelMat = toon(color, { transparent: true });
    const tireMat = toon(0x24242e, { transparent: true });
    const tor = new T.Mesh(new T.TorusGeometry(10.5, 3.8, 10, 26), tireMat); tor.castShadow = true; spinG.add(tor);
    const stripe = new T.Mesh(new T.TorusGeometry(10.5, 3.95, 4, 26, Math.PI * 2), wheelMat); stripe.scale.z = 0.45; spinG.add(stripe);
    const treadMat = toon(0x15151c, { transparent: true });
    for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; const tr = part(s.box, treadMat, 2, 2, 8.6, Math.cos(a) * 14, Math.sin(a) * 14, 0); tr.rotation.z = a; spinG.add(tr); }
    const hubMat = toon(0x1b1c26, { transparent: true });
    const hub = part(s.cyl, hubMat, 7.5, 6, 7.5, 0, 0, 0); hub.rotation.x = Math.PI / 2; spinG.add(hub);
    const spokeMat = basic(new T.Color(color).lerp(new T.Color(0xffffff), 0.4), { transparent: true });
    for (let i = 0; i < 3; i++) { const sp = part(s.box, spokeMat, 18, 2.2, 6.6, 0, 0, 0); sp.rotation.z = (i * Math.PI) / 3; spinG.add(sp); }
    wheel.visible = false;
    const shield = new T.Mesh(s.sph, new T.MeshBasicMaterial({ color: 0xbef6ff, transparent: true, opacity: 0.22, depthWrite: false }));
    shield.scale.setScalar(31); shield.position.y = 18; shield.visible = false; shield.userData.keep = true; root.add(shield);
    // 合并每个关节组里的静态零件
    for (const g of [lower, lean, wpnMount, wpn, arm, spinG]) bake(g);
    for (const L of legs) { bake(L.hip); bake(L.knee); bake(L.ankle); }
    return {
      root, body, hips, lower, upper, lean, legs, wheel, wheelTilt, spinG, wpn, wpnMount, arm, pilot, tankFill, bodyMat,
      fadeMats: [wheelMat, hubMat, spokeMat, tireMat, treadMat], shield, ud: wpn.userData,
      // 动画状态
      spin: 0, moveA: 0, phase: 0, legYaw: 0, face: null, zs: null, lvx: 0, lvy: 0, avx: 0, avy: 0,
      pitch: 0, pitchV: 0, roll: 0, rollV: 0, susp: 0, suspV: 0, recoil: 0, recoilV: 0, wroll: 0,
      lastVz: 0, lastFlash: 0, lastCharge: 0, lastFire: false, fireT: 0, airT: 0, walkAmt: 0,
    };
  }

  // ---------------- 程序化动画 ----------------
  const wrapA = (a) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };
  const clampN = (v, a, b) => Math.max(a, Math.min(b, v));
  function spring(b, k, target, stiff, damp, dt) {
    b[k + 'V'] += (stiff * (target - b[k]) - damp * b[k + 'V']) * dt;
    b[k] += b[k + 'V'] * dt;
  }
  // 腿长投影：给定大腿角 a、膝弯 k，脚底低于髋部的高度
  const legDrop = (a, k) => LEG.L1 * Math.cos(a) + LEG.L2 * Math.cos(a - k) + LEG.foot;
  const SP_CHARGE = S.SPECIAL_IDS.indexOf('charge'), SP_BEAM = S.SPECIAL_IDS.indexOf('beam');

  // st: {x,y,z,vx,vy,vz,a,pt,flags,charge,tank,flash,weapon}
  function animateBot(b, st, now, dt) {
    dt = Math.min(dt, 0.05);
    const wheel = !!(st.flags & 2);
    const vx = st.vx || 0, vy = st.vy || 0;
    const sp = Math.hypot(vx, vy);
    // 平滑速度 / 加速度（快照速度有抖动）
    const k = Math.min(1, dt * 12);
    const nvx = b.lvx + (vx - b.lvx) * k, nvy = b.lvy + (vy - b.lvy) * k;
    const ax = (nvx - b.lvx) / Math.max(dt, 1e-3), ay = (nvy - b.lvy) / Math.max(dt, 1e-3);
    b.avx += (ax - b.avx) * Math.min(1, dt * 8); b.avy += (ay - b.avy) * Math.min(1, dt * 8);
    b.lvx = nvx; b.lvy = nvy;
    if (sp > 20) b.moveA = Math.atan2(vy, vx);
    // 走上台阶时平滑抬升，跳跃/下落时直接跟随
    const z = st.z || 0;
    if (b.zs == null || Math.abs(z - b.zs) > 24 || Math.abs(st.vz || 0) > 30) b.zs = z;
    else b.zs += (z - b.zs) * Math.min(1, dt * 18);
    b.root.position.set(st.x, b.zs, st.y);
    // 落地检测 → 悬挂压缩
    const vz = st.vz || 0;
    const air = Math.abs(vz) > 30;
    if (air) b.airT += dt; else {
      if (b.airT > 0.12 && b.lastVz < -120) b.suspV -= Math.min(140, -b.lastVz * 0.16);
      b.airT = 0;
    }
    b.lastVz = vz;
    // 受击硬直
    if (st.flash > 0.05 && b.lastFlash <= 0.05) { b.pitchV -= 9; b.rollV += (Math.random() - 0.5) * 14; b.suspV -= 25; }
    b.lastFlash = st.flash;
    spring(b, 'susp', 0, 260, 15, dt);
    b.susp = clampN(b.susp, -6, 3);

    if (wheel) {
      b.root.rotation.y = -b.moveA;
      b.spin -= (sp * dt) / 12;
      b.spinG.rotation.z = b.spin;
      // 转弯时轮子向内侧倾斜，落地时压扁
      const turn = (b.avx * -Math.sin(b.moveA) + b.avy * Math.cos(b.moveA));
      b.wroll += (clampN(-turn * 0.0009, -0.5, 0.5) - b.wroll) * Math.min(1, dt * 8);
      b.wheelTilt.rotation.x = b.wroll;
      b.wheel.position.y = 14 + b.susp * 0.6;
      b.wheel.scale.set(1 - b.susp * 0.02, 1 + b.susp * 0.03, 1 - b.susp * 0.02);
      return;
    }
    // ---- 双足 ----
    const face = st.flags & 32 ? b.moveA : st.a;
    b.face = b.face == null ? face : b.face + wrapA(face - b.face) * Math.min(1, dt * 18);
    b.root.rotation.y = -b.face;
    // 相对朝向的速度
    const cf = Math.cos(b.face), sf = Math.sin(b.face);
    const vF = b.lvx * cf + b.lvy * sf, vS = -b.lvx * sf + b.lvy * cf;
    const aF = b.avx * cf + b.avy * sf, aS = -b.avx * sf + b.avy * cf;
    // 腿朝移动方向，后退时倒着走
    let legTarget = 0, dir = 1;
    if (sp > 25) {
      let rel = wrapA(b.moveA - b.face);
      if (Math.abs(rel) > Math.PI / 2 + 0.2) { rel = wrapA(rel - Math.PI); dir = -1; }
      legTarget = clampN(rel, -1.2, 1.2);
    }
    b.legYaw += (legTarget - b.legYaw) * Math.min(1, dt * 10);
    b.lower.rotation.y = -b.legYaw;
    // 步态
    const s01 = clampN(sp / 165, 0, 1.6);
    b.walkAmt += ((air ? 0 : Math.min(1, s01 * 1.5)) - b.walkAmt) * Math.min(1, dt * 10);
    b.phase += (dir * Math.PI * 2 * sp * dt) / 30;
    const A = 0.55 * Math.min(1.25, s01) * b.walkAmt, KS = 1.1 * Math.min(1.25, s01) * b.walkAmt, K0 = 0.18;
    let maxDrop = 0;
    const pose = [];
    for (const L of b.legs) {
      const ph = b.phase + (L.side > 0 ? Math.PI : 0);
      let a = A * Math.sin(ph), kk = K0 + KS * Math.max(0, Math.cos(ph));
      if (air) {
        // 空中：上升时收腿，下落时伸腿准备落地
        const tuck = clampN(vz / 360, -0.6, 1);
        a = 0.35 + 0.35 * tuck + L.side * 0.12; kk = 0.5 + 0.8 * Math.max(0, tuck);
      }
      kk += Math.max(0, -b.susp) * 0.09;
      pose.push([a, kk]);
      maxDrop = Math.max(maxDrop, legDrop(a, kk));
    }
    for (let i = 0; i < 2; i++) {
      const L = b.legs[i], [a, kk] = pose[i];
      L.hip.rotation.z = -a; L.knee.rotation.z = kk; L.ankle.rotation.z = a - kk;
    }
    const hipY = air ? legDrop(0.2, 0.4) : maxDrop;
    b.hips.position.y = hipY + 0.5 + b.susp + (air ? 0 : Math.sin(now / 520) * 0.25);
    // 上身弹簧倾斜：加速时前倾、刹车时后仰、转弯时侧倾
    const tP = clampN(-aF * 0.00032 - vF * 0.0007, -0.4, 0.4) + b.recoil * -0.16;
    const tR = clampN(aS * 0.00028 + vS * 0.0004, -0.35, 0.35);
    spring(b, 'pitch', tP, 120, 13, dt);
    spring(b, 'roll', tR, 110, 12, dt);
    b.lean.rotation.z = b.pitch;
    b.lean.rotation.x = b.roll;
    b.lower.rotation.z = b.pitch * 0.25;
    // 后坐力：狙击松手 / 泼桶 / 滚刷甩出的瞬间
    const fire = !!(st.flags & 16);
    const ch = st.charge || 0;
    if (st.weapon === 'charger' && b.lastCharge > 0.2 && ch < 0.05) b.recoilV += 10 + 20 * b.lastCharge;
    if ((st.weapon === 'bucket' || st.weapon === 'roller') && fire && !b.lastFire) b.recoilV += 16;
    if (fire && (st.weapon === 'blaster' || st.weapon === 'gatling')) {
      b.fireT += dt;
      const rate = st.weapon === 'blaster' ? 0.1 : 0.065;
      if (b.fireT >= rate) { b.fireT = 0; b.recoilV += st.weapon === 'gatling' ? 3 : 5; }
    } else b.fireT = 0.2;
    b.lastCharge = ch; b.lastFire = fire;
    spring(b, 'recoil', 0, 300, 18, dt);
    b.recoil = clampN(b.recoil, -0.4, 1.5);
    // 武器俯仰 + 后坐
    const pt = clampN(st.pt || 0, -0.9, 0.9);
    b.wpnMount.rotation.z = pt * 0.95 - b.pitch;
    b.wpn.position.x = -b.recoil * 3.2;
    b.arm.rotation.z = pt * 0.4 + Math.sin(b.phase) * 0.15 * b.walkAmt;
    // 驾驶员：轻微抬头 / 跟着身体晃
    b.pilot.rotation.z = pt * 0.35 - b.pitch * 0.6;
    b.pilot.rotation.x = -b.roll * 0.8;
    if (b.ud.spinner) b.ud.spinner.rotation.x += dt * (4 + 40 * ch);
    if (b.ud.tip) { b.ud.tip.visible = ch > 0.02; b.ud.tip.scale.setScalar(1.5 + 4 * ch); }
    if (b.ud.roller && sp > 25) b.ud.roller.rotation.y += (sp * dt) / 7;
    const f = clampN((st.tank == null ? 100 : st.tank) / 100, 0.03, 1);
    b.tankFill.scale.y = 11 * f; b.tankFill.position.y = 4 + 5.5 * f;
  }

  // =====================================================================
  // 每帧同步
  // =====================================================================
  function syncBots(G, now, dt, myId) {
    const me = G.me;
    for (const b of W.bots.values()) b.root.visible = false;
    for (const id of G.cur) {
      const p = G.players.get(id);
      if (!p) continue;
      let b = W.bots.get(id);
      if (!b) { b = makeBot(G.colors[p.team], p.head, p.weapon, p.pilot); W.bots.set(id, b); scene.add(b.root); }
      if (!(p.flags & 1)) { b.zs = null; b.face = null; continue; }
      const enemy = me && p.team !== me.team;
      let vis = true, fade = 1;
      if (p.flags & 4) {
        if (enemy) { const d = me ? Math.hypot(me.px - p.x, me.py - p.y) : 1e9; vis = d < 110; fade = 0.3; }
        else fade = 0.45;
      }
      if (p.flags & 8 && Math.sin(now / 45) < -0.3) vis = false;
      if (id === myId && G.camClose) vis = false;
      const wheel = !!(p.flags & 2);
      b.body.visible = !wheel; b.wheel.visible = wheel;
      animateBot(b, { x: p.x, y: p.y, z: p.z, vx: p.vx, vy: p.vy, vz: p.vz, a: p.a, pt: p.pt, flags: p.flags, charge: p.charge, tank: p.tank, flash: p.flash, weapon: p.weapon }, now, dt);
      if (!vis) continue;
      b.root.visible = true;
      if (wheel) for (const m of b.fadeMats) m.opacity = fade;
      if (p.flash > 0) b.bodyMat.emissive.setRGB(0.8, 0.8, 0.8);
      else if (p.spk === SP_CHARGE && p.flags & 128) b.bodyMat.emissive.set(G.colors[p.team]).multiplyScalar(0.4 + 0.3 * Math.sin(now / 60));
      else b.bodyMat.emissive.setRGB(0, 0, 0);
      b.shield.visible = p.shield > 0;
      if (p.shield > 0) b.shield.material.opacity = 0.16 + 0.08 * Math.sin(now / 120);
    }
  }

  // =====================================================================
  // 菜单里的机兵展示台（独立的小渲染器）
  // =====================================================================
  const PV = { r: null, scene: null, cam: null, bot: null, key: '', canvas: null, t0: 0, demo: 0 };
  function preview(canvas, opt) {
    if (!T) return false;
    try {
      if (!PV.r || PV.canvas !== canvas) {
        if (PV.r) PV.r.dispose();
        PV.r = new T.WebGLRenderer({ canvas, antialias: true, alpha: true });
        PV.canvas = canvas;
        PV.scene = new T.Scene();
        PV.scene.add(new T.HemisphereLight(0xe8ecff, 0x4a3a5a, 1.0));
        const sun = new T.DirectionalLight(0xffffff, 0.8); sun.position.set(60, 120, 80); PV.scene.add(sun);
        const ring = new T.Mesh(new T.CylinderGeometry(30, 32, 3, 40), new T.MeshLambertMaterial({ color: 0x2a2440 }));
        ring.position.y = -1.5; PV.scene.add(ring);
        const glow = new T.Mesh(new T.RingGeometry(26, 30, 48), new T.MeshBasicMaterial({ color: 0xffdf2e, transparent: true, opacity: 0.7 }));
        glow.rotation.x = -Math.PI / 2; glow.position.y = 0.1; PV.scene.add(glow); PV.glow = glow;
        PV.cam = new T.PerspectiveCamera(32, 1, 1, 1000);
      }
    } catch (e) { return false; }
    shared();
    const key = [opt.color, opt.head, opt.weapon, opt.pilot].join('|');
    if (key !== PV.key) {
      if (PV.bot) PV.scene.remove(PV.bot.root);
      PV.bot = makeBot(opt.color, opt.head, opt.weapon, opt.pilot);
      PV.scene.add(PV.bot.root);
      PV.bot.wpnType = opt.weapon;
      PV.key = key;
      PV.glow.material.color.set(opt.color);
    }
    const w = canvas.clientWidth || canvas.width, h = canvas.clientHeight || canvas.height;
    PV.r.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    PV.r.setSize(w, h, false);
    PV.cam.aspect = w / Math.max(1, h); PV.cam.updateProjectionMatrix();
    PV.cam.position.set(78, 44, 78); PV.cam.lookAt(0, 17, 0);
    return true;
  }
  function previewFrame(now, dt) {
    if (!PV.r || !PV.bot || !PV.canvas.isConnected || PV.canvas.offsetParent === null) return;
    const t = now / 1000;
    // 原地踏步 → 待机，循环展示动作
    const cyc = t % 8;
    const walking = cyc < 3.5;
    const sp = walking ? 120 : 0;
    const a = t * 0.5;
    const st = { x: 0, y: 0, z: 0, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, vz: 0, a: a, pt: walking ? 0 : Math.sin(t * 1.3) * 0.25, flags: 1 | (cyc > 5 && cyc < 6.2 ? 16 : 0), charge: 0, tank: 60 + 40 * Math.sin(t), flash: 0, weapon: PV.bot.wpnType || '' };
    animateBot(PV.bot, st, now, dt);
    PV.bot.root.position.set(0, 0, 0);
    PV.r.render(PV.scene, PV.cam);
  }

  const _v = new T.Vector3(), _up = new T.Vector3(0, 1, 0), _q = new T.Quaternion();
  function placeTube(m, x0, y0, z0, x1, y1, z1, w) {
    _v.set(x1 - x0, z1 - z0, y1 - y0);
    const len = _v.length() || 1;
    m.position.set((x0 + x1) / 2, (z0 + z1) / 2, (y0 + y1) / 2);
    m.quaternion.setFromUnitVectors(_up, _v.multiplyScalar(1 / len));
    m.scale.set(w, len, w);
  }

  function syncWorld(G, now, dt) {
    const P = W.pools, cs = G.colors;
    for (const k in P) P[k].begin();
    // 子弹
    for (const pr of G.projs.values()) {
      const m = P['proj' + pr.team].next();
      m.position.set(pr.x, pr.z, pr.y);
      m.scale.setScalar(Math.max(3, pr.s * 0.8));
    }
    // 炸弹
    for (const b of G.bombs.values()) {
      const g = P['bomb' + b.team].next();
      g.position.set(b.x, b.z + 8, b.y);
      const pulse = b.landed ? 1 + 0.18 * Math.sin(now / 40) : 1;
      g.scale.setScalar(pulse);
    }
    // 导弹
    for (const m of G.missiles) {
      const k = (now - m.t0) / m.dur;
      if (k > 1) continue;
      const mk = P['mark' + m.team].next();
      flat(mk, m.x, m.y, m.z + 1.5);
      mk.scale.setScalar(80 * (1 - 0.5 * k) + 4 * Math.sin(now / 50));
      if (k > 0.45) {
        const ms = P['missile' + m.team].next();
        const h = (1 - (k - 0.45) / 0.55) * 700;
        ms.position.set(m.x, m.z + 17 + h, m.y);
      }
    }
    // 特效
    for (const f of G.fx) {
      const k = (now - f.t0) / f.dur;
      if (k < 0 || k > 1) continue;
      if (f.k === 'ring') {
        const m = P.ring.next();
        flat(m, f.x, f.y, (f.z || 0) + 2);
        m.scale.setScalar(f.r * (0.3 + 0.7 * Math.sqrt(k)));
        m.material.color.set(f.color); m.material.opacity = 0.85 * (1 - k);
      } else if (f.k === 'line') {
        const m = P.line.next();
        placeTube(m, f.x0, f.y0, f.z0, f.x1, f.y1, f.z1, f.w * (1 - k * 0.6));
        m.material.color.set(f.color); m.material.opacity = 0.9 * (1 - k);
      }
    }
    // 极光喷射光束
    for (const id of G.cur) {
      const p = G.players.get(id);
      if (!p || !(p.flags & 1) || !(p.flags & 128) || p.spk !== SP_BEAM) continue;
      const d = S.dir3(p.a, p.pt || 0);
      const x0 = p.x + d.x * 16, y0 = p.y + d.y * 16, z0 = (p.z || 0) + S.MUZZLE + d.z * 16;
      const L = S.ray3(W.M, x0, y0, z0, d, 950);
      const x1 = x0 + d.x * L, y1 = y0 + d.y * L, z1 = z0 + d.z * L;
      const m = P.beam.next();
      placeTube(m, x0, y0, z0, x1, y1, z1, 13 + 3 * Math.sin(now / 30));
      m.material.color.set(cs[p.team]);
      placeTube(P.beamCore.next(), x0, y0, z0, x1, y1, z1, 4);
      if (Math.random() < 0.6) burst(x1, y1, z1, cs[p.team], 2, 160);
    }
    // 模式物体
    const o = G.obj, oa = G.objA || o, k = G.objK == null ? 1 : G.objK;
    const lp = (i) => (oa ? oa[i] : o[i]) + (o[i] - (oa ? oa[i] : o[i])) * k;
    if (W.treasure) {
      const show = o && !o[5];
      W.treasure.visible = !!show;
      if (show) {
        let x = lp(0), y = lp(1), z = (o[6] || 0) + 22 + Math.sin(now / 300) * 4;
        if (o[2]) { const c = G.players.get(o[2]); if (c) { x = c.x; y = c.y; z = (c.z || 0) + 58; } }
        W.treasure.position.set(x, z, y);
        W.treasureCore.rotation.y = now / 500; W.treasureCore.rotation.x = Math.sin(now / 700) * 0.3;
      }
    }
    if (W.ball && o) {
      const x = lp(0), y = lp(1);
      if (W.ballPrev) {
        const dx = x - W.ballPrev.x, dz = y - W.ballPrev.y, dl = Math.hypot(dx, dz);
        if (dl > 0.01 && dl < 200) { _v.set(dz, 0, -dx).normalize(); _q.setFromAxisAngle(_v, dl / 26); W.ball.quaternion.premultiply(_q); }
      }
      W.ballPrev = { x, y };
      W.ball.position.set(x, 26, y);
      const last = o[4];
      W.ballMat.color.set(last ? new T.Color(cs[last]).lerp(new T.Color(0xffffff), 0.55) : 0xffffff);
    }
    if (G.mode === 'battery' && o && o[2]) {
      const f = o[2];
      for (let i = 0; i < f.length; i += 4) {
        const g = P.bat.next();
        g.position.set(f[i + 1], (f[i + 3] || 0) + 12 + Math.sin(now / 250 + f[i]) * 3, f[i + 2]);
        g.rotation.y = now / 400 + f[i];
      }
    }
    if (G.mode === 'zone' && o && W.zoneMat) {
      const owner = o[0];
      const c = owner ? cs[owner] : '#ffffff';
      W.zoneMat.color.set(c); W.zoneMat.opacity = owner ? 0.2 + 0.06 * Math.sin(now / 200) : 0.1;
      W.zoneLineMat.color.set(c);
      for (const m of W.zonePosts) m.color.set(c);
    }
    for (const k2 in P) P[k2].end();
  }

  // =====================================================================
  // 对外接口
  // =====================================================================
  function setCamera(cx, cy, cz, tx, ty, tz, fov) {
    if (!camera) return;
    camera.position.set(cx, cz, cy);
    camera.lookAt(tx, tz, ty);
    if (fov && Math.abs(camera.fov - fov) > 0.05) { camera.fov = fov; camera.updateProjectionMatrix(); }
  }
  const _p = new T.Vector3();
  function project(x, y, z) {
    if (!camera) return null;
    _p.set(x, z, y).project(camera);
    if (_p.z > 1 || _p.z < -1) return null;
    return { x: ((_p.x + 1) / 2) * innerWidth, y: ((1 - _p.y) / 2) * innerHeight };
  }
  function render(G, now, dt, myId) {
    if (!W || W.G !== G) return;
    if (W.dirty) { W.surfTex.needsUpdate = true; W.dirty = false; }
    syncBots(G, now, dt, myId);
    syncWorld(G, now, dt);
    stepParticles(dt);
    renderer.render(scene, camera);
  }
  function clear() { dispose(); show(false); }

  window.GB3D = {
    get ok() { return init(); },
    build, paintCell, burst, setCamera, project, render, clear, show, preview, previewFrame, setQuality,
    info: () => (renderer ? { calls: renderer.info.render.calls, tris: renderer.info.render.triangles, geos: renderer.info.memory.geometries } : null),
  };
})();
