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
  // 每张地图一套天空 / 光照 / 配色
  const SKIES = [
    { // 霓虹工厂：黄昏
      zen: 0x231f5c, mid: 0xc4528c, hor: 0xffb877, sunC: 0xffd7a8, sunI: 0.95, hemiS: 0xffe2ef, hemiG: 0x4a3656, hemiI: 0.78, fill: 0x6f8dff, fog: 0x9a5f8a,
      sun: [-0.55, 0.42, -0.72], floor: ['#7d7f96', '#73758c'], seam: '#5e6078', tops: ['#8d8fa8', '#a3a6c2', '#55586e'], win: 0.95,
      sides: [['#ffb02e', '#14151d'], ['#4f7cff', '#2a3d8f'], ['#e9e6f2', '#9a97b0']], trim: ['#14151d', '#f4f2ff', '#ffd23f'], night: false,
    },
    { // 涂鸦天台：晴天
      zen: 0x2a6ee8, mid: 0x6fb4ff, hor: 0xe4f5ff, sunC: 0xfff3dc, sunI: 0.9, hemiS: 0xeaf4ff, hemiG: 0x5a6070, hemiI: 0.75, fill: 0x9ab8ff, fog: 0xb3d2f2,
      sun: [0.5, 0.75, -0.45], floor: ['#80848f', '#7a7e89'], seam: '#6a6e7a', tops: ['#9497a6', '#a88b66', '#5b5f70'], win: 0.35,
      sides: [['#ff6a3d', '#2b2b33'], ['#2ec7a6', '#1b6e6a'], ['#f2efe6', '#a8a39a']], trim: ['#2b2b33', '#ffffff', '#ff6a3d'], night: false,
    },
    { // 齿轮广场：霓虹夜
      zen: 0x05071a, mid: 0x1b1450, hor: 0x5b2a80, sunC: 0xb7c6ff, sunI: 0.62, hemiS: 0x8f9cff, hemiG: 0x2a1a3a, hemiI: 0.72, fill: 0xff4fd8, fog: 0x2a1f52,
      sun: [0.35, 0.6, 0.6], floor: ['#4d4f6a', '#45475f'], seam: '#35364c', tops: ['#5b5e7c', '#6a5a8c', '#33354a'], win: 1.25,
      sides: [['#ff3ea5', '#20142e'], ['#3a4a8a', '#1fd6ee'], ['#2a2c40', '#8c5cff']], trim: ['#1fd6ee', '#ff3ea5', '#ffdf2e'], night: true,
    },
  ];

  function build(G) {
    if (!init()) return false;
    dispose();
    shared();
    scene = new T.Scene();
    const SK = SKIES[G.map % SKIES.length];
    scene.background = new T.Color(SK.hor);
    scene.fog = new T.Fog(SK.fog, 1500, 5200);
    scene.add(new T.HemisphereLight(SK.hemiS, SK.hemiG, SK.hemiI));
    const sun = new T.DirectionalLight(SK.sunC, SK.sunI);
    const sd = new T.Vector3(...SK.sun).normalize();
    sun.position.set(S.W / 2 + sd.x * 1500, sd.y * 1500 + 300, S.H / 2 + sd.z * 1500);
    sun.target.position.set(S.W / 2, 0, S.H / 2);
    sun.castShadow = true;
    sun.shadow.mapSize.set(HQ ? 2048 : 1024, HQ ? 2048 : 1024);
    const sc = sun.shadow.camera;
    sc.left = -1250; sc.right = 1250; sc.top = 1250; sc.bottom = -1250; sc.near = 200; sc.far = 3800;
    sun.shadow.bias = -0.0006;
    scene.add(sun, sun.target);
    // 冷色补光（从背光侧打轮廓）
    const fill = new T.DirectionalLight(SK.fill, 0.32);
    fill.position.set(S.W / 2 - sd.x * 1200, 600, S.H / 2 - sd.z * 1200);
    scene.add(fill);

    W = { G, M: G.M, colors: G.colors, bots: new Map(), pools: {}, dirty: true, pd: new Array(PN).fill(null), pi: 0, SK };
    buildSky(SK, sd);
    buildSurface(G);
    buildFloor();
    buildBlocks();
    buildBounds();
    buildCity(G.map);
    buildProps(G.map);
    buildModeDecor(G);
    buildDynamic(G);
    buildParticles();
    show(true);
    return true;
  }

  // ---------------- 天空穹顶：渐变 + 太阳光晕 + 云 ----------------
  function buildSky(SK, sd) {
    const mat = new T.ShaderMaterial({
      side: T.BackSide, depthWrite: false, fog: false,
      uniforms: { zen: { value: new T.Color(SK.zen) }, mid: { value: new T.Color(SK.mid) }, hor: { value: new T.Color(SK.hor) },
        sunC: { value: new T.Color(SK.sunC) }, sunD: { value: sd.clone() }, night: { value: SK.night ? 1 : 0 } },
      vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform vec3 zen, mid, hor, sunC, sunD; uniform float night; varying vec3 vD;
        float h(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,45.164))) * 43758.5453); }
        void main(){
          float y = clamp(vD.y, -0.2, 1.0);
          vec3 c = y < 0.18 ? mix(hor, mid, smoothstep(-0.05, 0.18, y)) : mix(mid, zen, smoothstep(0.18, 0.85, y));
          float s = max(dot(normalize(vD), normalize(sunD)), 0.0);
          c += sunC * (pow(s, 600.0) * 2.5 + pow(s, 24.0) * 0.35 + pow(s, 4.0) * 0.12);
          if (night > 0.5) { vec3 q = floor(vD * 260.0); float st = step(0.9975, h(q)) * smoothstep(0.1, 0.5, y); c += vec3(st); }
          gl_FragColor = vec4(c, 1.0);
        }`,
    });
    const sky = new T.Mesh(new T.SphereGeometry(5500, 32, 16), mat);
    sky.position.set(S.W / 2, 0, S.H / 2);
    sky.renderOrder = -10;
    scene.add(sky);
    // 云：柔和的贴图平面
    const c = document.createElement('canvas'); c.width = 256; c.height = 128;
    const x = c.getContext('2d'), R = rng(7);
    for (let i = 0; i < 26; i++) {
      const px = 40 + R() * 176, py = 60 + (R() - 0.5) * 40, r = 18 + R() * 30;
      const g = x.createRadialGradient(px, py, 0, px, py, r);
      g.addColorStop(0, 'rgba(255,255,255,0.55)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = g; x.beginPath(); x.arc(px, py, r, 0, 7); x.fill();
    }
    const tex = new T.CanvasTexture(c);
    const cm = new T.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, fog: false, color: SK.night ? 0x6a5a9a : new T.Color(SK.mid).lerp(new T.Color(0xffffff), 0.6), opacity: SK.night ? 0.35 : 0.85 });
    const R2 = rng(31);
    for (let i = 0; i < 14; i++) {
      const a = R2() * Math.PI * 2, d = 4200 + R2() * 900, y = 700 + R2() * 1400;
      const m = new T.Mesh(new T.PlaneGeometry(1400 + R2() * 1400, 500 + R2() * 300), cm);
      m.position.set(S.W / 2 + Math.cos(a) * d, y, S.H / 2 + Math.sin(a) * d);
      m.lookAt(S.W / 2, y * 0.6, S.H / 2);
      m.renderOrder = -9;
      scene.add(m);
    }
  }

  // ---------------- 地面材质：细节贴图 + 环境光遮蔽 + 涂料光泽（着色器注入） ----------------
  function detailTexture(SK) {
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const x = c.getContext('2d'), R = rng(5);
    x.fillStyle = '#ffffff'; x.fillRect(0, 0, 256, 256);
    // 混凝土噪点
    const img = x.getImageData(0, 0, 256, 256), d = img.data;
    for (let i = 0; i < d.length; i += 4) { const v = 232 + R() * 23 - (R() < 0.02 ? 30 : 0); d[i] = d[i + 1] = d[i + 2] = v; }
    x.putImageData(img, 0, 0);
    // 斑驳
    for (let i = 0; i < 14; i++) { x.fillStyle = `rgba(0,0,0,${0.02 + R() * 0.04})`; x.beginPath(); x.ellipse(R() * 256, R() * 256, 10 + R() * 40, 6 + R() * 20, R() * 3, 0, 7); x.fill(); }
    // 板缝（每 4 格一块地砖）
    x.fillStyle = 'rgba(0,0,0,0.28)'; x.fillRect(0, 0, 256, 3); x.fillRect(0, 0, 3, 256);
    x.fillStyle = 'rgba(255,255,255,0.35)'; x.fillRect(0, 3, 256, 1); x.fillRect(3, 0, 1, 256);
    // 裂纹
    x.strokeStyle = 'rgba(0,0,0,0.18)'; x.lineWidth = 1;
    for (let i = 0; i < 3; i++) { x.beginPath(); let px = R() * 256, py = R() * 256; x.moveTo(px, py); for (let k = 0; k < 5; k++) { px += (R() - 0.5) * 40; py += (R() - 0.5) * 40; x.lineTo(px, py); } x.stroke(); }
    const t = new T.CanvasTexture(c);
    t.wrapS = t.wrapT = T.RepeatWrapping;
    t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    return t;
  }
  function aoTexture(M) {
    // 每格统计周围更高的格子数量 → 墙根变暗；低分辨率 + 线性过滤 = 柔和渐变
    const K = 2, w = S.GW * K, h = S.GH * K;
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const x = c.getContext('2d'), img = x.createImageData(w, h), d = img.data;
    for (let py = 0; py < h; py++)
      for (let px = 0; px < w; px++) {
        const fx = (px + 0.5) / K, fy = (py + 0.5) / K, cx = Math.floor(fx), cy = Math.floor(fy);
        const t0 = M.top[cy * S.GW + cx];
        let occ = 0;
        for (let dy = -2; dy <= 2; dy++)
          for (let dx = -2; dx <= 2; dx++) {
            const nx = cx + dx, ny = cy + dy;
            if (nx < 0 || ny < 0 || nx >= S.GW || ny >= S.GH) continue;
            const dt = M.top[ny * S.GW + nx] - t0;
            if (dt <= 5) continue;
            const ddx = Math.max(0, Math.abs(nx + 0.5 - fx) - 0.5), ddy = Math.max(0, Math.abs(ny + 0.5 - fy) - 0.5);
            const dist = Math.hypot(ddx, ddy);
            occ += Math.max(0, 1 - dist / 2.2) * Math.min(1, dt / 60) * 0.22;
          }
        const v = Math.round(255 * (1 - Math.min(0.55, occ)));
        const i = (py * w + px) * 4; d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255;
      }
    x.putImageData(img, 0, 0);
    const t = new T.CanvasTexture(c);
    t.magFilter = t.minFilter = T.LinearFilter;
    return t;
  }
  function groundMaterial() {
    const m = lambert(0xffffff, { map: W.surfTex });
    const detail = W.detailTex, ao = W.aoTex;
    m.onBeforeCompile = (sh) => {
      sh.uniforms.detailMap = { value: detail };
      sh.uniforms.aoTex = { value: ao };
      sh.uniforms.detailRep = { value: new T.Vector2(S.W / 64, S.H / 64) };
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP;')
        .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform sampler2D detailMap; uniform sampler2D aoTex; uniform vec2 detailRep; varying vec3 vWP;')
        .replace('#include <map_fragment>', `#include <map_fragment>
          vec3 dtl = texture2D(detailMap, vUv * detailRep).rgb;
          float sat = max(diffuseColor.r, max(diffuseColor.g, diffuseColor.b)) - min(diffuseColor.r, min(diffuseColor.g, diffuseColor.b));
          float ink = smoothstep(0.25, 0.5, sat);
          diffuseColor.rgb *= mix(dtl * 1.04, vec3(0.97 + dtl.r * 0.05), ink);
          diffuseColor.rgb *= texture2D(aoTex, vUv).r;`)
        .replace('#include <output_fragment>', `#include <output_fragment>
          // 涂料光泽：饱和度高的像素（涂料）加一层随视角变化的高光
          vec3 Vd = normalize(cameraPosition - vWP);
          float fres = pow(1.0 - clamp(Vd.y, 0.0, 1.0), 3.0);
          float glint = pow(max(0.0, sin(vWP.x * 0.21 + vWP.z * 0.17) * sin(vWP.x * 0.13 - vWP.z * 0.23)), 8.0);
          gl_FragColor.rgb += ink * (fres * 0.22 + glint * 0.12) * vec3(1.0);`);
    };
    return m;
  }

  // ---------------- 地面 + 平台顶面共用的涂料贴图 ----------------
  function buildSurface(G) {
    const SK = W.SK;
    const cv = document.createElement('canvas');
    cv.width = S.W * PK; cv.height = S.H * PK;
    const x = cv.getContext('2d'), M = G.M, C = S.CELL * PK, R = rng(G.map * 977 + 13);
    for (let cy = 0; cy < S.GH; cy++)
      for (let cx = 0; cx < S.GW; cx++) {
        const lv = M.lv[cy * S.GW + cx];
        x.fillStyle = lv ? SK.tops[lv - 1] : SK.floor[((cx >> 3) + (cy >> 3)) % 2];
        x.fillRect(cx * C, cy * C, C, C);
      }
    x.save(); x.scale(PK, PK);
    // 车道线 / 中线 / 中圈
    x.globalAlpha = 0.5; x.strokeStyle = '#f4f4ff'; x.lineWidth = 6; x.setLineDash([28, 22]);
    x.beginPath(); x.moveTo(S.W / 2, 20); x.lineTo(S.W / 2, S.H - 20); x.stroke();
    x.setLineDash([]); x.lineWidth = 8;
    x.beginPath(); x.arc(S.W / 2, S.H / 2, 150, 0, 7); x.stroke();
    x.lineWidth = 4; x.beginPath(); x.arc(S.W / 2, S.H / 2, 130, 0, 7); x.stroke();
    // 两侧基地：队伍色箭头
    for (const t of [1, 2]) {
      const b = S.basePos(t), col = G.colors[t];
      x.globalAlpha = 0.35; x.fillStyle = col;
      for (let k = 0; k < 3; k++) {
        const ox = b.x + (t === 1 ? 1 : -1) * (130 + k * 46);
        x.beginPath();
        const s = t === 1 ? 1 : -1;
        x.moveTo(ox, b.y - 60); x.lineTo(ox + s * 30, b.y); x.lineTo(ox, b.y + 60); x.lineTo(ox - s * 16, b.y + 60); x.lineTo(ox + s * 14, b.y); x.lineTo(ox - s * 16, b.y - 60);
        x.closePath(); x.fill();
      }
      x.globalAlpha = 0.25; x.strokeStyle = col; x.lineWidth = 10;
      x.strokeRect(b.x - 80, b.y - 200, 160, 400);
    }
    // 地面涂鸦（低透明度）
    const words = ['GB', '07', 'SPRAY', '★', 'BOTS', '42', 'INK!', 'NO.9'];
    for (let i = 0; i < 22; i++) {
      x.save(); x.translate(R() * S.W, R() * S.H); x.rotate(R() * 6.28);
      x.globalAlpha = 0.07 + R() * 0.06; x.fillStyle = '#fff'; x.strokeStyle = '#fff';
      const t = R();
      if (t < 0.35) { x.beginPath(); x.moveTo(-30, -10); x.lineTo(10, -10); x.lineTo(10, -24); x.lineTo(36, 0); x.lineTo(10, 24); x.lineTo(10, 10); x.lineTo(-30, 10); x.closePath(); x.fill(); }
      else if (t < 0.7) { x.font = '900 46px Impact, sans-serif'; x.fillText(words[Math.floor(R() * words.length)], -40, 16); }
      else { x.lineWidth = 6; x.beginPath(); x.arc(0, 0, 20 + R() * 30, 0, 7); x.stroke(); }
      x.restore();
    }
    // 场地边缘警示条
    x.globalAlpha = 0.55;
    for (let i = 0; i < S.W; i += 32) { x.fillStyle = (i / 32) % 2 ? '#ffd23f' : '#14151d'; x.fillRect(i, 0, 32, 10); x.fillRect(i, S.H - 10, 32, 10); }
    for (let i = 0; i < S.H; i += 32) { x.fillStyle = (i / 32) % 2 ? '#ffd23f' : '#14151d'; x.fillRect(0, i, 10, 32); x.fillRect(S.W - 10, i, 10, 32); }
    x.restore();
    // 平台顶面：边缘警示带 + 高墙顶部斜纹
    for (const [rx, ry, rw, rh, lv] of M.rects) {
      x.save(); x.beginPath(); x.rect(rx * C, ry * C, rw * C, rh * C); x.clip();
      if (lv >= 3) {
        x.strokeStyle = 'rgba(255,210,63,0.45)'; x.lineWidth = 5;
        for (let k = -rh * C; k < rw * C; k += 14) { x.beginPath(); x.moveTo(rx * C + k, ry * C); x.lineTo(rx * C + k + rh * C, ry * C + rh * C); x.stroke(); }
      } else {
        x.strokeStyle = lv === 1 ? 'rgba(255,190,40,0.7)' : 'rgba(255,255,255,0.55)'; x.lineWidth = 3;
        x.strokeRect(rx * C + 2.5, ry * C + 2.5, rw * C - 5, rh * C - 5);
        x.fillStyle = 'rgba(0,0,0,0.12)';
        for (let k = 0; k < rw * C; k += 6) x.fillRect(rx * C + k, ry * C, 1, rh * C);
      }
      x.restore();
    }
    W.surf = cv; W.sctx = x;
    W.surfTex = new T.CanvasTexture(cv);
    W.surfTex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    W.detailTex = detailTexture(SK);
    W.aoTex = aoTexture(M);
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

  // 涂料：大一点、互相重叠的圆 → 连成一片的涂料，而不是一颗颗圆点
  function paintCell(i, team) {
    if (!W || !team) return;
    const x = W.sctx, C = S.CELL * PK, cx = i % S.GW, cy = (i / S.GW) | 0;
    const sh = W.G.shades[team];
    if (W.edge[i]) { x.fillStyle = sh[0]; x.fillRect(cx * C, cy * C, C, C); }
    else {
      const ox = cx * C + C / 2 + (((i * 13) % 5) - 2) * 0.6 * PK, oy = cy * C + C / 2 + (((i * 29) % 5) - 2) * 0.6 * PK;
      x.fillStyle = sh[(i * 7919) % 3 === 2 ? 2 : 0];
      x.beginPath(); x.arc(ox, oy, 13.5 * PK, 0, 6.2832); x.fill();
      if ((i * 31) % 7 === 0) { x.fillStyle = sh[1]; x.beginPath(); x.arc(ox - 3 * PK, oy - 3 * PK, 4 * PK, 0, 6.2832); x.fill(); }
    }
    W.dirty = true;
  }

  function buildFloor() {
    const g = new T.PlaneGeometry(S.W, S.H);
    g.rotateX(-Math.PI / 2); g.translate(S.W / 2, 0, S.H / 2);
    W.groundMat = groundMaterial();
    const m = new T.Mesh(g, W.groundMat);
    m.receiveShadow = true;
    scene.add(m);
    // 场外的天台地面
    const g2 = new T.PlaneGeometry(9000, 9000);
    g2.rotateX(-Math.PI / 2); g2.translate(S.W / 2, -40, S.H / 2);
    scene.add(new T.Mesh(g2, lambert(new T.Color(W.SK.floor[1]).multiplyScalar(0.45))));
  }

  // ---------------- 方块侧面贴图（三种高度三种风格） ----------------
  function sideTexture(lv, SK, seed) {
    const [a, b] = SK.sides[lv - 1];
    const c = document.createElement('canvas'); c.width = 256; c.height = lv === 3 ? 512 : 256;
    const x = c.getContext('2d'), R = rng(seed), H = c.height;
    if (lv === 1) {
      // 矮掩体：工业路障箱，上下警示斜纹 + 铆钉
      x.fillStyle = a; x.fillRect(0, 0, 256, H);
      const g = x.createLinearGradient(0, 0, 0, H); g.addColorStop(0, 'rgba(255,255,255,0.18)'); g.addColorStop(1, 'rgba(0,0,0,0.25)');
      x.fillStyle = g; x.fillRect(0, 0, 256, H);
      for (const y0 of [0, H - 46]) {
        x.save(); x.beginPath(); x.rect(0, y0, 256, 46); x.clip();
        x.fillStyle = b; x.fillRect(0, y0, 256, 46);
        x.fillStyle = a; for (let k = -60; k < 300; k += 40) { x.beginPath(); x.moveTo(k, y0 + 46); x.lineTo(k + 20, y0 + 46); x.lineTo(k + 66, y0); x.lineTo(k + 46, y0); x.closePath(); x.fill(); }
        x.restore();
      }
      x.fillStyle = 'rgba(0,0,0,0.35)'; x.fillRect(0, 46, 256, 3); x.fillRect(0, H - 49, 256, 3); x.fillRect(126, 49, 4, H - 98);
      x.fillStyle = 'rgba(255,255,255,0.5)';
      for (const px of [14, 112, 144, 242]) for (const py of [62, H - 62]) { x.beginPath(); x.arc(px, py, 4, 0, 7); x.fill(); }
      x.font = '900 40px Impact, sans-serif'; x.fillStyle = 'rgba(0,0,0,0.45)'; x.textAlign = 'center'; x.fillText(['01', 'B7', '42', 'GB'][seed % 4], 64, H / 2 + 14);
    } else if (lv === 2) {
      // 高台：拼接金属板 + 通风格栅 + 指示灯
      x.fillStyle = a; x.fillRect(0, 0, 256, H);
      x.fillStyle = 'rgba(0,0,0,0.22)';
      for (let k = 0; k < 4; k++) x.fillRect(0, k * 64, 256, 3);
      x.fillRect(0, 0, 3, H); x.fillRect(128, 0, 3, H);
      x.fillStyle = 'rgba(255,255,255,0.16)';
      for (let k = 0; k < 4; k++) x.fillRect(0, k * 64 + 3, 256, 2);
      x.fillStyle = b; x.fillRect(150, 90, 86, 74);
      x.fillStyle = 'rgba(0,0,0,0.55)'; for (let k = 0; k < 7; k++) x.fillRect(156, 96 + k * 10, 74, 5);
      x.fillStyle = 'rgba(255,255,255,0.75)'; x.fillRect(20, 26, 80, 10);
      x.fillStyle = SK.night ? '#7dfcff' : '#ffe14d'; x.beginPath(); x.arc(40, 200, 8, 0, 7); x.fill();
      x.fillStyle = 'rgba(0,0,0,0.3)'; x.fillRect(0, H - 16, 256, 16);
    } else {
      // 高墙：大面积涂鸦壁画（宽 1024 像素，两段不同内容，减少重复感）
      c.width = 1024; x.fillStyle = a; x.fillRect(0, 0, 1024, H);
      const cols = ['#ff3ea5', '#ffd23f', '#1fd6ee', '#9cff2e', '#ff8a1f', '#8c5cff'];
      const words = ['INK', 'GB!', 'ZAP', 'POW', 'YO!', 'SPLAT', 'BOTS', 'WOW'];
      for (let seg = 0; seg < 2; seg++) {
        const ox = seg * 512;
        for (let i = 0; i < 4; i++) { x.fillStyle = cols[Math.floor(R() * cols.length)]; x.globalAlpha = 0.75; x.beginPath(); x.ellipse(ox + 40 + R() * 430, 140 + R() * 260, 60 + R() * 90, 40 + R() * 70, R(), 0, 7); x.fill(); }
        x.globalAlpha = 1;
        const word = words[(seed + seg * 3) % words.length], col = cols[(seed + seg * 2) % cols.length];
        x.font = `900 ${word.length > 3 ? 110 : 140}px Impact, "Arial Black", sans-serif`; x.textAlign = 'center'; x.lineJoin = 'round';
        x.save(); x.translate(ox + 256, 300 + (seg ? 30 : 0)); x.rotate(seg ? 0.08 : -0.12);
        x.lineWidth = 20; x.strokeStyle = '#14151d'; x.strokeText(word, 0, 0);
        x.fillStyle = '#fff'; x.fillText(word, -5, -6); x.fillStyle = col; x.fillText(word, 0, 0);
        x.restore();
        // 喷漆滴落
        for (let i = 0; i < 8; i++) { x.fillStyle = cols[Math.floor(R() * cols.length)]; const px = ox + R() * 512, py = 210 + R() * 150, l = 30 + R() * 90; x.fillRect(px, py, 5, l); x.beginPath(); x.arc(px + 2.5, py + l, 4, 0, 7); x.fill(); }
        // 小图案：星星 / 箭头 / 笑脸
        x.strokeStyle = '#fff'; x.lineWidth = 6; x.lineCap = 'round';
        const k = (seed + seg) % 3, sx = ox + 60 + R() * 380, sy = 90 + R() * 40;
        x.beginPath();
        if (k === 0) { for (let j = 0; j < 5; j++) { const an = -Math.PI / 2 + j * 2.513; x.lineTo(sx + Math.cos(an) * 28, sy + Math.sin(an) * 28); } x.closePath(); }
        else if (k === 1) { x.moveTo(sx - 30, sy + 20); x.lineTo(sx + 30, sy - 10); x.lineTo(sx + 18, sy - 28); x.moveTo(sx + 30, sy - 10); x.lineTo(sx + 8, sy - 2); }
        else { x.arc(sx, sy, 26, 0, 7); x.moveTo(sx - 14, sy + 8); x.quadraticCurveTo(sx, sy + 20, sx + 14, sy + 8); }
        x.stroke();
      }
      // 顶部压顶与底部踢脚线
      x.fillStyle = b; x.fillRect(0, 0, 1024, 22); x.fillRect(0, H - 40, 1024, 40);
      x.fillStyle = 'rgba(0,0,0,0.25)'; x.fillRect(0, 22, 1024, 4); x.fillRect(0, H - 44, 1024, 4);
      x.fillStyle = 'rgba(0,0,0,0.15)'; for (let k = 0; k < 1024; k += 256) x.fillRect(k, 0, 3, H);
    }
    const t = new T.CanvasTexture(c);
    t.wrapS = t.wrapT = T.RepeatWrapping;
    t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    return t;
  }

  // ---------------- 方块（由高度网格合并） ----------------
  function buildBlocks() {
    const M = W.M, GW = S.GW, GH = S.GH, C = S.CELL, SK = W.SK;
    const used = new Uint8Array(GW * GH);
    const geo = () => ({ p: [], n: [], uv: [] });
    const top = geo(), sides = [null, geo(), geo(), geo()], trim = [null, geo(), geo(), geo()];
    const quad = (o, v, n, uv) => {
      for (const k of [0, 1, 2, 0, 2, 3]) { o.p.push(v[k][0], v[k][1], v[k][2]); o.n.push(n[0], n[1], n[2]); o.uv.push(uv[k][0], uv[k][1]); }
    };
    const cuboid = (o, x0, y0, z0, x1, y1, z1) => {
      const uv = [[0, 0], [1, 0], [1, 1], [0, 1]];
      quad(o, [[x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0]], [0, 1, 0], uv);
      quad(o, [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]], [0, 0, -1], uv);
      quad(o, [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], [0, 0, 1], uv);
      quad(o, [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], [-1, 0, 0], uv);
      quad(o, [[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]], [1, 0, 0], uv);
    };
    let faceSeed = 0;
    const box = (x0, z0, w, d, H, lv) => {
      const x1 = x0 + w, z1 = z0 + d;
      const tuv = (x, z) => [x / S.W, 1 - z / S.H];
      quad(top, [[x0, H, z0], [x0, H, z1], [x1, H, z1], [x1, H, z0]], [0, 1, 0], [tuv(x0, z0), tuv(x0, z1), tuv(x1, z1), tuv(x1, z0)]);
      const o = sides[lv];
      // 每个面随机水平偏移，避免相邻墙面图案一模一样
      const ul = lv === 3 ? 512 : 128;
      const suv = (len) => { const u0 = (faceSeed++ * 0.37) % 1; return [[u0, 0], [u0 + len / ul, 0], [u0 + len / ul, 1], [u0, 1]]; };
      quad(o, [[x1, 0, z0], [x0, 0, z0], [x0, H, z0], [x1, H, z0]], [0, 0, -1], suv(w));
      quad(o, [[x0, 0, z1], [x1, 0, z1], [x1, H, z1], [x0, H, z1]], [0, 0, 1], suv(w));
      quad(o, [[x0, 0, z0], [x0, 0, z1], [x0, H, z1], [x0, H, z0]], [-1, 0, 0], suv(d));
      quad(o, [[x1, 0, z1], [x1, 0, z0], [x1, H, z0], [x1, H, z1]], [1, 0, 0], suv(d));
      // 顶部外沿压边（只在外侧，不挡住顶面涂料）
      const t = 2.2, y0 = H - 4, y1 = H + 0.8, tg = trim[lv];
      cuboid(tg, x0 - t, y0, z0 - t, x1 + t, y1, z0);
      cuboid(tg, x0 - t, y0, z1, x1 + t, y1, z1 + t);
      cuboid(tg, x0 - t, y0, z0, x0, y1, z1);
      cuboid(tg, x1, y0, z0, x1 + t, y1, z1);
      // 底部踢脚
      cuboid(tg, x0 - 1.2, 0, z0 - 1.2, x1 + 1.2, 3, z0); cuboid(tg, x0 - 1.2, 0, z1, x1 + 1.2, 3, z1 + 1.2);
      cuboid(tg, x0 - 1.2, 0, z0, x0, 3, z1); cuboid(tg, x1, 0, z0, x1 + 1.2, 3, z1);
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
      return g;
    };
    if (top.p.length) {
      const tm = new T.Mesh(mk(top), W.groundMat);
      tm.receiveShadow = true; tm.castShadow = true; scene.add(tm);
    }
    for (let lv = 1; lv <= 3; lv++) {
      if (!sides[lv].p.length) continue;
      const sm = new T.Mesh(mk(sides[lv]), lambert(0xffffff, { map: sideTexture(lv, SK, lv * 3 + W.G.map) }));
      sm.receiveShadow = true; sm.castShadow = true; scene.add(sm);
      const tc = new T.Color(SK.trim[lv - 1]);
      const glow = SK.night && lv !== 3;
      const tmm = new T.Mesh(mk(trim[lv]), glow ? basic(tc) : lambert(tc));
      tmm.castShadow = true; tmm.receiveShadow = !glow; scene.add(tmm);
    }
  }

  // ---------------- 场地围栏：矮墙 + 玻璃护栏 + 立柱 ----------------
  function buildBounds() {
    const th = 40, SK = W.SK;
    const wall = lambert(new T.Color(SK.sides[2][0]).multiplyScalar(0.8));
    const capM = lambert(SK.trim[2]);
    const glass = new T.MeshPhongMaterial({ color: SK.night ? 0x7af0ff : 0xbfefff, transparent: true, opacity: 0.22, shininess: 90, depthWrite: false, side: T.DoubleSide });
    const post = lambert(0x3a3e52);
    const lampM = basic(SK.night ? 0x7dfcff : 0xfff1c2);
    const segs = [[S.W / 2, -th / 2, S.W + th * 2, th, 0], [S.W / 2, S.H + th / 2, S.W + th * 2, th, 0], [-th / 2, S.H / 2, th, S.H, 1], [S.W + th / 2, S.H / 2, th, S.H, 1]];
    for (const [x, z, w, d, vert] of segs) {
      const m = part(SH.box, wall, w, 30, d, x, 15, z); m.receiveShadow = true; scene.add(m);
      scene.add(part(SH.box, capM, w + 2, 4, d + 2, x, 32, z));
      // 玻璃护栏（外侧一圈）
      const len = vert ? d : w;
      const gx = vert ? x + (x < 0 ? -th / 2 + 4 : th / 2 - 4) : x, gz = vert ? z : z + (z < 0 ? -th / 2 + 4 : th / 2 - 4);
      // 护栏比镜头低（镜头在出生点会退到场外这一圈上方）
      const gp = new T.Mesh(new T.PlaneGeometry(len, 14), glass);
      gp.position.set(gx, 41, gz); if (vert) gp.rotation.y = Math.PI / 2; scene.add(gp);
      scene.add(part(SH.box, capM, vert ? 3 : len, 2, vert ? len : 3, gx, 48.5, gz));
      for (let k = -len / 2; k <= len / 2; k += 160) {
        const px = vert ? gx : gx + k, pz = vert ? gz + k : gz;
        scene.add(part(SH.box, post, 4, 18, 4, px, 42, pz));
        scene.add(part(SH.sph, lampM, 2.6, 2.6, 2.6, px, 52, pz));
      }
    }
  }

  // ---------------- 远景城市 ----------------
  function buildCity(mapIdx) {
    const SK = W.SK, R = rng(mapIdx * 131 + 5);
    const wc = document.createElement('canvas'); wc.width = 64; wc.height = 128;
    const x = wc.getContext('2d');
    x.fillStyle = '#000'; x.fillRect(0, 0, 64, 128);
    const lit = ['#ffd58a', '#9ae6ff', '#ff9ad5', '#fff3c4'];
    for (let j = 3; j < 128; j += 8) for (let i = 3; i < 64; i += 8) if (R() < (SK.night ? 0.45 : 0.3)) { x.fillStyle = lit[Math.floor(R() * lit.length)]; x.fillRect(i, j, 4, 5); }
    const wt = new T.CanvasTexture(wc); wt.wrapS = wt.wrapT = T.RepeatWrapping; wt.repeat.set(3, 5);
    const tones = SK.night ? [0x141628, 0x1b1d34, 0x221c38] : SK.win < 0.5 ? [0x8fa3c4, 0xb6c0d6, 0x7d8db0, 0xd2c6b8] : [0x2a2648, 0x3a3060, 0x4a3a66];
    const mats = tones.map((c) => lambert(c, { emissive: 0xffffff, emissiveMap: wt, emissiveIntensity: SK.win }));
    const roofM = lambert(new T.Color(tones[0]).multiplyScalar(0.7));
    const neon = ['#ff3ea5', '#1fd6ee', '#9cff2e', '#ffdf2e', '#8c5cff'];
    let placed = 0;
    for (let k = 0; k < 500 && placed < 80; k++) {
      const px = -1700 + R() * (S.W + 3400), pz = -1700 + R() * (S.H + 3400);
      if (px > -280 && px < S.W + 280 && pz > -280 && pz < S.H + 280) continue;
      const w = 140 + R() * 240, d = 140 + R() * 240, h = 160 + R() * 1000;
      const b = part(SH.box, mats[Math.floor(R() * mats.length)], w, h, d, px, h / 2 - 40, pz);
      b.castShadow = false; scene.add(b);
      // 屋顶：压顶 + 水塔 / 天线
      scene.add(part(SH.box, roofM, w + 6, 8, d + 6, px, h - 36, pz));
      if (R() < 0.45) { const tw = part(SH.cyl, roofM, 18, 30, 18, px + (R() - 0.5) * w * 0.5, h - 10, pz + (R() - 0.5) * d * 0.5); tw.castShadow = false; scene.add(tw); }
      if (R() < 0.35) { scene.add(part(SH.cyl, roofM, 2, 90, 2, px, h + 5, pz)); scene.add(part(SH.sph, basic(0xff3b52), 4, 4, 4, px, h + 52, pz)); }
      if (R() < 0.5) scene.add(part(SH.box, basic(neon[Math.floor(R() * neon.length)]), w + 2, 5, d + 2, px, h - 44 - R() * h * 0.5, pz));
      placed++;
    }
    // 远处天际线剪影（一圈贴图圆柱）
    const sc = document.createElement('canvas'); sc.width = 1024; sc.height = 128;
    const sx = sc.getContext('2d');
    sx.fillStyle = '#fff';
    for (let px = 0; px < 1024;) { const w = 10 + R() * 40, h = 20 + R() * 100; sx.fillRect(px, 128 - h, w, h); if (R() < 0.2) sx.fillRect(px + w / 2 - 1, 128 - h - 20, 2, 20); px += w + R() * 4; }
    const stex = new T.CanvasTexture(sc); stex.wrapS = T.RepeatWrapping; stex.repeat.set(3, 1);
    const ring = new T.Mesh(new T.CylinderGeometry(4600, 4600, 900, 48, 1, true),
      new T.MeshBasicMaterial({ map: stex, transparent: true, side: T.BackSide, depthWrite: false, fog: false, color: new T.Color(SK.mid).lerp(new T.Color(SK.zen), 0.55) }));
    ring.position.set(S.W / 2, 380, S.H / 2); ring.renderOrder = -8;
    scene.add(ring);
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
      const bb = new T.Mesh(new T.PlaneGeometry(520, 130), basic(0xffffff, { map: tex, fog: false }));
      const ang = (i / 4) * Math.PI * 2 + 0.6;
      bb.position.set(S.W / 2 + Math.cos(ang) * 1700, 420 + i * 60, S.H / 2 + Math.sin(ang) * 1400);
      bb.lookAt(S.W / 2, 200, S.H / 2);
      scene.add(bb);
    }
  }

  // ---------------- 装饰物：只放在不可站立的高墙顶和场外，不影响碰撞 ----------------
  function buildProps(mapIdx) {
    const R = rng(mapIdx * 71 + 3), SK = W.SK, M = W.M, C = S.CELL;
    const g = new T.Group();
    const metal = lambert(0xb9bfd0), dark = lambert(0x3a3e52), fan = lambert(0x23252f);
    const lamp = basic(SK.night ? 0x7dfcff : 0xfff1c2);
    for (const [rx, ry, rw, rh, lv] of M.rects) {
      if (lv < 3) continue;
      const H = S.LEVEL_H[3], cx = (rx + rw / 2) * C, cz = (ry + rh / 2) * C;
      const long = rw >= rh, L = (long ? rw : rh) * C;
      const n = Math.max(1, Math.floor(L / 110));
      for (let k = 0; k < n; k++) {
        const t = (k + 0.5) / n - 0.5;
        const px = long ? cx + t * L : cx, pz = long ? cz : cz + t * L;
        const kind = R();
        if (kind < 0.4) {
          // 空调外机
          g.add(part(SH.box, metal, 26, 16, 20, px, H + 8, pz));
          const f = part(SH.cyl, fan, 8, 1, 8, px, H + 16.6, pz); g.add(f);
        } else if (kind < 0.65) {
          // 通风管
          const v = part(SH.cyl, metal, 6, 22, 6, px, H + 11, pz); g.add(v);
          g.add(part(SH.cyl, dark, 8, 4, 8, px, H + 23, pz));
        } else if (kind < 0.85) {
          // 灯柱
          g.add(part(SH.cyl, dark, 1.6, 40, 1.6, px, H + 20, pz));
          g.add(part(SH.box, dark, 10, 3, 4, px, H + 40, pz));
          g.add(part(SH.sph, lamp, 3, 2, 3, px, H + 38, pz));
        } else {
          // 小天线
          g.add(part(SH.cyl, dark, 1, 30, 1, px, H + 15, pz));
          g.add(part(SH.sph, basic(0xff3b52), 2, 2, 2, px, H + 31, pz));
        }
      }
    }
    // 场外：水塔、管道、配电箱
    for (let i = 0; i < 10; i++) {
      const side = i % 4, t = R();
      let px, pz;
      if (side === 0) { px = t * S.W; pz = -140 - R() * 120; } else if (side === 1) { px = t * S.W; pz = S.H + 140 + R() * 120; }
      else if (side === 2) { px = -140 - R() * 120; pz = t * S.H; } else { px = S.W + 140 + R() * 120; pz = t * S.H; }
      if (R() < 0.5) {
        g.add(part(SH.cyl, lambert(0x8a6a4a), 40, 60, 40, px, 50, pz));
        g.add(part(SH.cone, lambert(0x5a4632), 44, 24, 44, px, 92, pz));
        for (const [ox, oz] of [[-26, -26], [26, -26], [-26, 26], [26, 26]]) g.add(part(SH.cyl, dark, 2, 40, 2, px + ox, 0, pz + oz));
      } else {
        g.add(part(SH.box, metal, 50, 40, 30, px, -20, pz));
        g.add(part(SH.box, lambert(0xffd23f), 50, 4, 30.5, px, -4, pz));
      }
    }
    scene.add(g);
    bakeStatic(g);
  }
  // 场景静态物体合并（复用机兵的 bake）
  function bakeStatic(g) { bake(g, true); for (const m of g.children) { m.receiveShadow = true; } }

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
    const s = SH, cm = toon(color), dk = toon(0x2a2d3a), mt = toon(0x8c94ab);
    const lt = toon(new T.Color(color).lerp(new T.Color(0xffffff), 0.5));
    const add = (o) => { g.add(o); return o; };
    const cylX = (m, r, len, x, y, z) => { const o = part(s.cyl, m, r, len, r, x, y, z); o.rotation.z = -Math.PI / 2; return add(o); };
    switch (weapon) {
      case 'blaster':
        add(outlined(rbox(15, 6, 6, 2), mt, 1, 1, 1, 5, 0, 0));
        add(outlined(rbox(7, 5, 5.4, 1.8), cm, 1, 1, 1, 9, 0.4, 0));
        cylX(dk, 1.6, 7, 16, 0.5, 0); cylX(cm, 2.2, 1.6, 19.5, 0.5, 0);
        add(outlined(rbox(4, 7, 3.4, 1.2), dk, 1, 1, 1, 1, -5, 0));
        { const can = part(s.cyl, lt, 2.4, 7, 2.4, 3, 5.2, 0); can.rotation.z = Math.PI / 2 - 0.2; add(can); }
        break;
      case 'roller': {
        g.position.z = 4;
        add(part(s.cyl, mt, 1.2, 20, 1.2, 8, -6, -4)).rotation.z = -Math.PI / 2;
        add(outlined(rbox(4, 4, 4, 1.4), dk, 1, 1, 1, 18, -8, -4));
        add(part(s.box, mt, 2, 2, 40, 20, -12, -19));
        const r = add(part(s.cyl, cm, 6.5, 40, 6.5, 22, -12, -19)); r.rotation.x = Math.PI / 2;
        for (const z of [1.5, -39.5]) { const cap = add(part(s.cyl, dk, 7.2, 1.6, 7.2, 22, -12, z)); cap.rotation.x = Math.PI / 2; }
        g.userData.roller = r;
        break;
      }
      case 'charger':
        add(outlined(rbox(14, 5, 5, 1.8), cm, 1, 1, 1, 6, 0, 0));
        cylX(mt, 1.4, 30, 24, 0.5, 0); cylX(dk, 2.1, 2, 38, 0.5, 0);
        cylX(dk, 1.8, 10, 8, 4.6, 0);                                       // 瞄准镜
        { const lens = part(s.sph, toon(0x7af0ff, { emissive: 0x1a6070 }), 1.4, 1.4, 1.4, 13.2, 4.6, 0); add(lens); }
        add(outlined(rbox(4, 7, 3.4, 1.2), dk, 1, 1, 1, 0, -5, 0));
        g.userData.tip = add(part(s.sph, basic(0xffffff, { transparent: true, opacity: 0.9 }), 2, 2, 2, 40, 0.5, 0));
        break;
      case 'bucket': {
        const b = add(new T.Mesh(new T.CylinderGeometry(9, 5, 18, 16, 1, true), toon(color, { side: T.DoubleSide })));
        b.rotation.z = -Math.PI / 2; b.position.set(12, 0, 0); b.castShadow = true;
        const rim = add(new T.Mesh(new T.TorusGeometry(9, 1.1, 6, 18), dk)); rim.rotation.y = Math.PI / 2; rim.position.set(21, 0, 0);
        add(part(s.cyl, dk, 5.2, 1.4, 5.2, 3, 0, 0)).rotation.z = -Math.PI / 2;
        add(outlined(rbox(7, 7, 7, 2), mt, 1, 1, 1, 0, 0, 0));
        { const h = add(new T.Mesh(new T.TorusGeometry(6, 0.7, 5, 12, Math.PI), mt)); h.position.set(12, 0, 0); h.rotation.x = Math.PI / 2; }
        break;
      }
      case 'gatling': {
        add(outlined(rbox(13, 13, 12, 3), mt, 1, 1, 1, 1, 0, 0));
        { const drum = part(s.cyl, cm, 5.5, 7, 5.5, -1, 0, -8.5); drum.rotation.x = Math.PI / 2; add(drum); }
        const sp = new T.Group(); sp.position.set(8, 0, 0); g.add(sp);
        for (let i = 0; i < 4; i++) {
          const a = (i / 4) * Math.PI * 2;
          const br = part(s.cyl, dk, 1.6, 22, 1.6, 11, Math.cos(a) * 3.4, Math.sin(a) * 3.4);
          br.rotation.z = -Math.PI / 2; sp.add(br);
        }
        for (const x of [9, 20]) { const ring = part(s.cyl, cm, 5.4, 2, 5.4, x, 0, 0); ring.rotation.z = -Math.PI / 2; sp.add(ring); }
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
  // 卡通材质 + 轮廓光（菲涅尔边缘提亮），让机兵在任何背景下都有清晰的边
  const RIM = { color: new T.Color(0xcfe0ff), k: 0.55 };
  function rimCompile(sh) {
    sh.uniforms.rimC = { value: RIM.color };
    sh.uniforms.rimK = { value: RIM.k };
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 rimC; uniform float rimK;')
      .replace('#include <output_fragment>', `float rimF = pow(1.0 - clamp(abs(dot(normalize(normal), normalize(vViewPosition))), 0.0, 1.0), 2.6);
        outgoingLight += rimC * rimF * rimK * (0.35 + 0.65 * max(0.0, normal.y + 0.4));
        #include <output_fragment>`);
  }
  const toon = (c, extra) => { const m = new T.MeshToonMaterial(Object.assign({ color: c, gradientMap: toonGrad() }, extra)); m.onBeforeCompile = rimCompile; return m; };
  // 装甲面板贴图：板缝、铆钉、散热孔（灰度，乘以机兵颜色）
  let PANEL = null;
  function panelTex() {
    if (PANEL) return PANEL;
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const x = c.getContext('2d');
    x.fillStyle = '#ffffff'; x.fillRect(0, 0, 128, 128);
    const g = x.createLinearGradient(0, 0, 0, 128); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(0,0,0,0.12)');
    x.fillStyle = g; x.fillRect(0, 0, 128, 128);
    x.strokeStyle = 'rgba(30,20,50,0.55)'; x.lineWidth = 2;
    x.strokeRect(10, 10, 108, 108);
    x.beginPath(); x.moveTo(10, 64); x.lineTo(50, 64); x.lineTo(58, 56); x.lineTo(118, 56); x.stroke();
    x.strokeStyle = 'rgba(255,255,255,0.5)'; x.lineWidth = 1;
    x.strokeRect(12, 12, 104, 104);
    x.fillStyle = 'rgba(30,20,50,0.5)';
    for (const [px, py] of [[16, 16], [112, 16], [16, 112], [112, 112]]) { x.beginPath(); x.arc(px, py, 2.4, 0, 7); x.fill(); }
    for (let k = 0; k < 4; k++) x.fillRect(74, 74 + k * 8, 34, 4);
    PANEL = new T.CanvasTexture(c);
    PANEL.anisotropy = 4;
    return PANEL;
  }
  // 机身侧面的驾驶员代号贴花
  function decalTex(text, color) {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const x = c.getContext('2d');
    x.fillStyle = '#14101f'; x.beginPath(); x.roundRect ? x.roundRect(8, 8, 112, 112, 22) : x.rect(8, 8, 112, 112); x.fill();
    x.strokeStyle = '#fff'; x.lineWidth = 6; x.stroke();
    x.fillStyle = color; x.font = '900 76px "Microsoft YaHei", "PingFang SC", sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(text, 64, 70);
    const t = new T.CanvasTexture(c); t.anisotropy = 4;
    return t;
  }
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
      const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = mat.map ? new Float32Array(n * 2) : null;
      let o = 0;
      for (const gg of parts) {
        pos.set(gg.attributes.position.array, o * 3); nor.set(gg.attributes.normal.array, o * 3);
        if (uv && gg.attributes.uv) uv.set(gg.attributes.uv.array, o * 2);
        o += gg.attributes.position.count; gg.dispose();
      }
      const geo = new T.BufferGeometry();
      geo.setAttribute('position', new T.BufferAttribute(pos, 3));
      geo.setAttribute('normal', new T.BufferAttribute(nor, 3));
      if (uv) geo.setAttribute('uv', new T.BufferAttribute(uv, 2));
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
    const bodyMat = toon(color, { map: panelTex() });
    const tint = toon(new T.Color(color).multiplyScalar(0.62), { map: panelTex() });
    const light = toon(new T.Color(color).lerp(new T.Color(0xffffff), 0.55));
    const frame = toon(0x3a3e52), joint = toon(0x23252f), steel = toon(0xaab2c8);
    const glowC = new T.Color(color).lerp(new T.Color(0xffffff), 0.45);
    const strip = basic(glowC);                     // 发光灯条
    const P = S.pilot(pilotId);
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
      knee.add(part(s.box, strip, 0.6, LEG.L2 * 0.55, 1.4, 2.45, -LEG.L2 * 0.55, 0));    // 小腿灯条
      knee.add(part(s.cyl, steel, 0.7, LEG.L2 * 0.8, 0.7, -2.6, -LEG.L2 * 0.45, side * 1.4)); // 液压杆
      const ankle = dyn(new T.Group()); ankle.position.y = -LEG.L2; knee.add(ankle);
      ankle.add(outlined(rbox(10, 3, 6.4, 1.3), tint, 1, 1, 1, 1.4, -0.4, 0));
      ankle.add(part(s.box, joint, 3, 1.2, 6.6, -2.6, -1.4, 0));
      ankle.add(outlined(rbox(3.2, 2.2, 6.8, 1), light, 1, 1, 1, 6, -0.9, 0));     // 鞋尖
      hip.add(part(s.cyl, steel, 0.8, LEG.L1 * 0.9, 0.8, 2.6, -LEG.L1 * 0.5, side * 1.6)); // 大腿液压杆
      legs.push({ hip, knee, ankle, side });
    }
    // ---- 上身 ----
    const torso = outlined(rbox(18, 13, 20, 4.5), bodyMat, 1, 1, 1, 0, 9, 0); lean.add(torso);
    lean.add(outlined(rbox(4, 9, 14, 2), light, 1, 1, 1, 8.4, 8.2, 0));           // 胸甲
    lean.add(part(s.box, s.glow, 0.6, 1.4, 9, 10.5, 9.6, 0));                      // 胸口发光条
    lean.add(outlined(rbox(17, 3, 21, 1.4), tint, 1, 1, 1, 0, 3, 0));             // 腰带
    for (const side of [-1, 1]) {
      const sh = outlined(rbox(9, 7, 6, 2.4), tint, 1, 1, 1, 0, 13, side * 12.5); lean.add(sh);
      lean.add(part(s.box, strip, 6, 0.8, 0.6, 0.5, 11, side * 15.6));                  // 肩甲灯条
      lean.add(part(s.box, s.yellow, 3, 1, 0.6, 2.5, 14.5, side * 15.6));
      // 侧裙甲
      const sk = outlined(rbox(10, 5, 2, 1), light, 1, 1, 1, 0.5, 2, side * 10.6); sk.rotation.x = side * 0.12; lean.add(sk);
      // 机身代号贴花
      const dm = new T.Mesh(new T.PlaneGeometry(6.4, 6.4), new T.MeshBasicMaterial({ map: decalTex(P.code[0], P.accent), transparent: true }));
      dm.position.set(-1.5, 9.5, side * 10.15); dm.rotation.y = side > 0 ? 0 : Math.PI; dm.userData.keep = true; lean.add(dm);
    }
    // 胸口散热格栅 + 发光眼
    for (let k = 0; k < 3; k++) lean.add(part(s.box, frame, 0.6, 0.7, 6, 10.6, 5.6 - k * 1.2, 0));
    lean.add(part(s.box, strip, 0.5, 0.6, 15, 9.3, 12.6, 0));
    // 背部推进器（空中会喷火）
    const flames = [];
    for (const side of [-1, 1]) {
      const nz = part(s.cyl, frame, 2.6, 4, 2.6, -11, 1.5, side * 4.6); lean.add(nz);
      lean.add(part(s.cyl, strip, 1.8, 0.6, 1.8, -11, -0.7, side * 4.6));
      const fl = new T.Mesh(s.cone, new T.MeshBasicMaterial({ color: glowC, transparent: true, opacity: 0.85, blending: T.AdditiveBlending, depthWrite: false }));
      fl.scale.set(1.8, 7, 1.8); fl.rotation.x = Math.PI; fl.position.set(-11, -4.5, side * 4.6);
      fl.visible = false; fl.userData.keep = true; lean.add(fl); flames.push(fl);
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
    cockpit.add(part(s.cyl, frame, 0.35, 9, 0.35, -6, 5.5, -5));
    cockpit.add(part(s.sph, strip, 0.9, 0.9, 0.9, -6, 10.2, -5));
    for (const z of [-6.4, 6.4]) cockpit.add(part(s.box, strip, 2.2, 0.6, 0.6, 5.2, 1.4, z));
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
      root, body, hips, lower, upper, lean, legs, flames, wheel, wheelTilt, spinG, wpn, wpnMount, arm, pilot, tankFill, bodyMat,
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
    // 推进器火焰：上升时喷射，长短随速度闪烁
    const fOn = air && vz > -60;
    for (const fl of b.flames) {
      fl.visible = fOn;
      if (fOn) { const L = 4 + Math.max(0, vz) / 60 + Math.random() * 2; fl.scale.set(1.6 + Math.random() * 0.4, L, 1.6); fl.position.y = -2.5 - L / 2; }
    }
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
    get scene() { return scene; },
    build, paintCell, burst, setCamera, project, render, clear, show, preview, previewFrame, setQuality,
    info: () => (renderer ? { calls: renderer.info.render.calls, tris: renderer.info.render.triangles, geos: renderer.info.memory.geometries } : null),
  };
})();
