// 涂鸦机兵 GraffiBots — Three.js 3D 渲染
// 坐标约定：游戏 (x, y, z朝上) → three (x, z, y)
(() => {
  'use strict';
  const S = window.GS;
  const T = window.THREE;
  let PK = 0.5;                // 涂料贴图分辨率（像素/游戏单位）；2.1：超大地图自动降低，贴图不超过 4096
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
    renderer.setPixelRatio(Math.min(HQ ? 1.5 : 1, window.devicePixelRatio || 1) * (typeof DYN === 'object' ? DYN.scale : 1));
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
    SH.sphH = new T.SphereGeometry(1, 22, 16); SH.cylH = new T.CylinderGeometry(1, 1, 1, 18);
    SH.eyeW = basic(0xffffff); SH.pupil = basic(0x14101c); SH.blush = basic(0xff8aa8, { transparent: true, opacity: 0.55, depthWrite: false });
    SH.mouth = basic(0x5a1a2a); SH.tongue = basic(0xff6a8a);
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
      sun: [-0.55, 0.42, -0.72], floor: ['#7d7f96', '#73758c'], seam: '#5e6078', tops: ['#8d8fa8', '#a3a6c2', '#55586e', '#9a9cb4'], win: 0.95,
      sides: [['#ffb02e', '#14151d'], ['#4f7cff', '#2a3d8f'], ['#e9e6f2', '#9a97b0'], ['#8a8ea8', '#ffd23f']], trim: ['#14151d', '#f4f2ff', '#ffd23f', '#ffd23f'], night: false,
    },
    { // 涂鸦天台：晴天
      zen: 0x2a6ee8, mid: 0x6fb4ff, hor: 0xe4f5ff, sunC: 0xfff3dc, sunI: 0.9, hemiS: 0xeaf4ff, hemiG: 0x5a6070, hemiI: 0.75, fill: 0x9ab8ff, fog: 0xb3d2f2,
      sun: [0.5, 0.75, -0.45], floor: ['#80848f', '#7a7e89'], seam: '#6a6e7a', tops: ['#9497a6', '#a88b66', '#5b5f70', '#a0a3b0'], win: 0.35,
      sides: [['#ff6a3d', '#2b2b33'], ['#2ec7a6', '#1b6e6a'], ['#f2efe6', '#a8a39a'], ['#9a9ea8', '#ff6a3d']], trim: ['#2b2b33', '#ffffff', '#ff6a3d', '#ff6a3d'], night: false,
    },
    { // 齿轮广场：霓虹夜
      zen: 0x05071a, mid: 0x1b1450, hor: 0x5b2a80, sunC: 0xb7c6ff, sunI: 0.62, hemiS: 0x8f9cff, hemiG: 0x2a1a3a, hemiI: 0.72, fill: 0xff4fd8, fog: 0x2a1f52,
      sun: [0.35, 0.6, 0.6], floor: ['#4d4f6a', '#45475f'], seam: '#35364c', tops: ['#5b5e7c', '#6a5a8c', '#33354a', '#626584'], win: 1.25,
      sides: [['#ff3ea5', '#20142e'], ['#3a4a8a', '#1fd6ee'], ['#2a2c40', '#8c5cff'], ['#3a3d58', '#1fd6ee']], trim: ['#1fd6ee', '#ff3ea5', '#ffdf2e', '#1fd6ee'], night: true,
    },
    { // 樱花庭院：粉色黄昏 + 飘落的花瓣
      zen: 0x3a2a6a, mid: 0xf08cb4, hor: 0xffd8c8, sunC: 0xffe4d4, sunI: 0.9, hemiS: 0xffeaf2, hemiG: 0x5a4256, hemiI: 0.8, fill: 0xa08cff, fog: 0xd8a0b8,
      sun: [-0.4, 0.5, 0.75], floor: ['#8e8698', '#867e90'], tops: ['#b48a68', '#a493b4', '#5a5266', '#a88060'], win: 0.6,
      sides: [['#c46a4a', '#3a2420'], ['#efe4d8', '#b84a4a'], ['#f6eee6', '#7a3a3a'], ['#b88a60', '#5a3a24']], trim: ['#3a2420', '#b83a3a', '#7a3a3a', '#5a3a24'], night: false, fx: 'petals',
    },
    { // 集装箱码头：阴天的港口
      zen: 0x5a7aa8, mid: 0x9fbad6, hor: 0xe2eaf0, sunC: 0xfff4e4, sunI: 0.8, hemiS: 0xeef4ff, hemiG: 0x58606c, hemiI: 0.85, fill: 0x9ab8ff, fog: 0xbac8d8,
      sun: [0.3, 0.7, -0.6], floor: ['#7a838e', '#747d88'], tops: ['#9a8a6a', '#a05a50', '#3a5a80', '#8a9098'], win: 0.3,
      sides: [['#d8a030', '#3a3a40'], ['#c4463a', '#7a2a24'], ['#2f70b2', '#1d4a7a'], ['#8a9098', '#ffd23f']], trim: ['#3a3a40', '#ffffff', '#ffd23f', '#ffd23f'], night: false,
    },
    { // 雪夜冰场：下雪的夜晚
      zen: 0x0a1430, mid: 0x2a3a6a, hor: 0x7a8ab8, sunC: 0xd0e0ff, sunI: 0.7, hemiS: 0xc0d0ff, hemiG: 0x3a4460, hemiI: 0.85, fill: 0x7dfcff, fog: 0x4a5a8a,
      sun: [-0.3, 0.6, -0.7], floor: ['#bcc8da', '#b2bfd2'], tops: ['#dfe8f4', '#e8f0fa', '#9aa8c0', '#cfdbea'], win: 1.0,
      sides: [['#6a8ab0', '#e8f0fa'], ['#4a5a7a', '#dfe8f4'], ['#2a3450', '#c8d8f0'], ['#7a8aa8', '#ffffff']], trim: ['#e8f0fa', '#7dfcff', '#ffffff', '#7dfcff'], night: true, fx: 'snow',
    },
    { // 熔炉工厂：橙红色的炉火
      zen: 0x2a1010, mid: 0xa03c1a, hor: 0xffa050, sunC: 0xffc488, sunI: 0.95, hemiS: 0xffe0c8, hemiG: 0x4a2a20, hemiI: 0.78, fill: 0xff6a3a, fog: 0x8a4a30,
      sun: [0.6, 0.45, 0.5], floor: ['#6c605a', '#645852'], tops: ['#8a6a50', '#7a6a64', '#4a3e3a', '#8a7060'], win: 0.9,
      sides: [['#a85a2a', '#2a1a14'], ['#5a5050', '#ff7a2a'], ['#3a3030', '#ff9a3a'], ['#6a5a50', '#ffb03a']], trim: ['#2a1a14', '#ff7a2a', '#ffb03a', '#ffb03a'], night: false, glow: true, fx: 'embers',
    },
    { // 灰城广场：阴沉的灰城黄昏，彩色涂料格外显眼
      zen: 0x3a3d48, mid: 0x7a7d88, hor: 0xd8c8b8, sunC: 0xffe6c8, sunI: 0.85, hemiS: 0xf0f0f4, hemiG: 0x4a4c56, hemiI: 0.8, fill: 0xff8a5a, fog: 0x8a8c96,
      sun: [-0.4, 0.6, -0.6], floor: ['#8a8d96', '#82858e'], seam: '#6d707a', tops: ['#9a9da6', '#b0b3bc', '#6d707a', '#a4a7b0'], win: 0.5,
      sides: [['#c9ccd4', '#5b5e68'], ['#ff5a36', '#3a3d46'], ['#e6e7ea', '#9aa0a8'], ['#8a8d96', '#ffe600']], trim: ['#3a3d46', '#ffffff', '#ff5a36', '#ffe600'], night: false,
    },
    { // 废墟逃亡区：尘土飞扬的废墟傍晚
      zen: 0x2a2228, mid: 0x8a5a48, hor: 0xffb070, sunC: 0xffc890, sunI: 0.9, hemiS: 0xffe0c8, hemiG: 0x4a3a34, hemiI: 0.76, fill: 0x6f8dff, fog: 0x9a7060,
      sun: [0.6, 0.4, -0.6], floor: ['#8a7f76', '#82776e'], seam: '#6a5f56', tops: ['#9a8f86', '#a89a88', '#6a6058', '#b0a494'], win: 0.25,
      sides: [['#b8aa98', '#5a4e44'], ['#ff8a1f', '#4a3a30'], ['#d8ccbc', '#8a7e70'], ['#9a8e80', '#9cff2e']], trim: ['#3a302a', '#f4ece0', '#ff8a1f', '#9cff2e'], night: false,
    },
    { // 地铁中转站：地下站台的冷光和霓虹指示牌
      zen: 0x0b1424, mid: 0x1c3550, hor: 0x3a7a8a, sunC: 0xcfe8ff, sunI: 0.7, hemiS: 0xa8d8ff, hemiG: 0x20283a, hemiI: 0.78, fill: 0x2ef0c8, fog: 0x1a3040,
      sun: [-0.3, 0.8, -0.4], floor: ['#5a6270', '#525a68'], seam: '#3e4654', tops: ['#6a7280', '#8a92a0', '#454c5a', '#7a8290'], win: 0.9,
      sides: [['#2ef0c8', '#1a2a3a'], ['#ffe600', '#3a3d46'], ['#d8dce4', '#7a808c'], ['#5a6270', '#ff3ea5']], trim: ['#1a2a3a', '#e8f4ff', '#2ef0c8', '#ffe600'], night: true,
    },
    { // 欢乐乐园：晴朗的乐园午后，粉蓝糖果色
      zen: 0x3a8cff, mid: 0x8fd0ff, hor: 0xfff0d8, sunC: 0xfff4dc, sunI: 0.95, hemiS: 0xfff0f8, hemiG: 0x6a5a70, hemiI: 0.82, fill: 0xff9ad6, fog: 0xc8e4ff,
      sun: [0.45, 0.7, -0.5], floor: ['#9a94a6', '#928ca0'], seam: '#7e788c', tops: ['#ff9ad6', '#8fe3ff', '#7a7490', '#ffe28a'], win: 0.3,
      sides: [['#ff6ec4', '#ffffff'], ['#1fd6ee', '#ffffff'], ['#fff4dc', '#ff6ec4'], ['#ffd23f', '#b06bff']], trim: ['#ffffff', '#ff3ea5', '#1fd6ee', '#ffd23f'], night: false, fx: 'petals',
    },
    { // 1.8 夜都十字路口：紫色午夜 + 霓虹 + 飘起的灵火
      zen: 0x07041a, mid: 0x24104a, hor: 0x7a2a78, sunC: 0xc8b8ff, sunI: 0.55, hemiS: 0x9a8cff, hemiG: 0x24122e, hemiI: 0.72, fill: 0xff2d6a, fog: 0x261438,
      sun: [-0.3, 0.55, 0.6], floor: ['#403c54', '#3a364c'], seam: '#2a2638', tops: ['#4c4864', '#5a3a6a', '#2c2a3c', '#544f70'], win: 1.35,
      sides: [['#8a6bff', '#1a1028'], ['#ff2d4b', '#2a1020'], ['#2a2c40', '#d8b25a'], ['#3a3458', '#8a6bff']], trim: ['#d8b25a', '#ff2d4b', '#8a6bff', '#d8b25a'], night: true, fx: 'wisps',
    },
  ];

  function build(G) {
    if (!init()) return false;
    dispose();
    shared();
    scene = new T.Scene();
    const SK = SKIES[(S.MAPS[G.map].sky == null ? G.map : S.MAPS[G.map].sky) % SKIES.length];
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

    PK = Math.min(0.5, Math.min(HQ ? 4096 : 3072, renderer.capabilities.maxTextureSize || 4096) / Math.max(S.W, S.H));
    W = { G, M: G.M, colors: G.colors, bots: new Map(), pools: {}, dirty: true, pd: new Array(PN).fill(null), pi: 0, SK, sun, sd, giant: !!G.M.giant };
    if (W.giant) { scene.fog.near = 1300; scene.fog.far = 4200; }
    buildSky(SK, sd);
    buildSurface(G);
    buildFloor();
    buildBlocks();
    buildBounds();
    buildCity(G.map);
    buildProps(G.map);
    buildBushes();
    buildPads();
    buildAmbient(SK);
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
        x.fillStyle = lv ? SK.tops[lv === 5 ? 1 : lv - 1] : SK.floor[((cx >> 3) + (cy >> 3)) % 2];
        x.fillRect(cx * C, cy * C, C, C);
      }
    x.save(); x.scale(PK, PK);
    // 车道线 / 中线 / 中圈
    x.globalAlpha = 0.5; x.strokeStyle = '#f4f4ff'; x.lineWidth = 6; x.setLineDash([28, 22]);
    x.beginPath(); x.moveTo(S.W / 2, 20); x.lineTo(S.W / 2, S.H - 20); x.stroke();
    x.setLineDash([]); x.lineWidth = 8;
    x.beginPath(); x.arc(S.W / 2, S.H / 2, 150, 0, 7); x.stroke();
    x.lineWidth = 4; x.beginPath(); x.arc(S.W / 2, S.H / 2, 130, 0, 7); x.stroke();
    // 两侧基地：队伍色箭头（多队模式没有基地）
    for (const t of (G.teams || 2) > 2 ? [] : [1, 2]) {
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
    // 楼梯顶面：每级台阶前沿一道亮线
    for (let cy = 0; cy < S.GH; cy++)
      for (let cx = 0; cx < S.GW; cx++) {
        if (M.lv[cy * S.GW + cx] !== S.STAIR_LV) continue;
        x.fillStyle = 'rgba(255,255,255,0.28)';
        x.fillRect(cx * C, cy * C, C, 1.5); x.fillRect(cx * C, cy * C, 1.5, C);
        x.fillStyle = 'rgba(0,0,0,0.18)'; x.fillRect(cx * C, cy * C + C - 1.5, C, 1.5);
      }
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
    // 1.6：记下改动范围，只把这一块传给显卡（超大地图整张贴图很大，每帧整张上传很卡）
    const r = 14 * PK, x0 = Math.max(0, Math.floor(cx * C - r)), y0 = Math.max(0, Math.floor(cy * C - r)), x1 = Math.ceil((cx + 1) * C + r), y1 = Math.ceil((cy + 1) * C + r);
    const d = W.dr || (W.dr = [1e9, 1e9, -1, -1]);
    if (x0 < d[0]) d[0] = x0; if (y0 < d[1]) d[1] = y0; if (x1 > d[2]) d[2] = x1; if (y1 > d[3]) d[3] = y1;
  }
  // 把改动的那一块涂料贴图上传（第一次 / 改动太大时整张上传）
  function flushSurface() {
    const tex = W.surfTex, d = W.dr, cv = W.surf;
    W.dirty = false;
    const props = renderer.properties.get(tex), glt = props && props.__webglTexture;
    if (!glt || !d || d[2] < 0 || (d[2] - d[0]) * (d[3] - d[1]) > cv.width * cv.height * 0.5) { tex.needsUpdate = true; W.dr = null; return; }
    const x0 = d[0], y0 = d[1], w = Math.min(cv.width, d[2]) - x0, h = Math.min(cv.height, d[3]) - y0;
    W.dr = null;
    if (w <= 0 || h <= 0) return;
    try {
      const gl = renderer.getContext();
      renderer.state.bindTexture(gl.TEXTURE_2D, glt);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, tex.flipY);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, tex.premultiplyAlpha);
      const img = W.sctx.getImageData(x0, y0, w, h);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, x0, tex.flipY ? cv.height - y0 - h : y0, gl.RGBA, gl.UNSIGNED_BYTE, img);
      if (tex.generateMipmaps && tex.minFilter !== T.LinearFilter && tex.minFilter !== T.NearestFilter) gl.generateMipmap(gl.TEXTURE_2D);
    } catch (e) { tex.needsUpdate = true; }
  }

  function buildFloor() {
    const g = new T.PlaneGeometry(S.W, S.H);
    g.rotateX(-Math.PI / 2); g.translate(S.W / 2, 0, S.H / 2);
    W.groundMat = groundMaterial();
    const m = new T.Mesh(g, W.groundMat);
    m.receiveShadow = true;
    scene.add(m);
    // 场外的天台地面
    const ext = Math.max(9000, Math.max(S.W, S.H) + 6000), g2 = new T.PlaneGeometry(ext, ext);
    g2.rotateX(-Math.PI / 2); g2.translate(S.W / 2, -40, S.H / 2);
    scene.add(new T.Mesh(g2, lambert(new T.Color(W.SK.floor[1]).multiplyScalar(0.45))));
  }

  // ---------------- 方块侧面贴图（三种高度三种风格） ----------------
  function sideTexture(lv, SK, seed) {
    if (lv === 5) lv = 3;   // 2.1：高楼天台的外墙用高墙风格
    const [a, b] = SK.sides[lv - 1];
    const c = document.createElement('canvas'); c.width = 256; c.height = lv === 3 ? 512 : 256;
    const x = c.getContext('2d'), R = rng(seed), H = c.height;
    if (lv === 4) {
      // 楼梯：混凝土台阶侧面，顶部一道警示色
      x.fillStyle = a; x.fillRect(0, 0, 256, H);
      const g = x.createLinearGradient(0, 0, 0, H); g.addColorStop(0, 'rgba(255,255,255,0.15)'); g.addColorStop(1, 'rgba(0,0,0,0.3)');
      x.fillStyle = g; x.fillRect(0, 0, 256, H);
      x.fillStyle = b; x.fillRect(0, 0, 256, 18);
      x.fillStyle = 'rgba(0,0,0,0.25)'; x.fillRect(0, 18, 256, 4);
      for (let k = 0; k < 256; k += 64) x.fillRect(k, 22, 2, H - 22);
    } else if (lv === 1) {
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
    // 2.1：超大地图按区块分开建网格，镜头外的区块整块剔除
    const CH = W.giant ? 96 : 1e9, chunks = new Map();
    let top, sides, trim;
    const useChunk = (cx, cy) => {
      const k = Math.floor(cx / CH) + ',' + Math.floor(cy / CH);
      let c = chunks.get(k);
      if (!c) chunks.set(k, (c = { top: geo(), sides: [null, geo(), geo(), geo(), geo(), geo()], trim: [null, geo(), geo(), geo(), geo(), geo()] }));
      top = c.top; sides = c.sides; trim = c.trim;
    };
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
      const ul = lv === 3 || lv === 5 ? 512 : lv === 4 ? 64 : 128;
      const suv = (len) => { const u0 = (faceSeed++ * 0.37) % 1; return [[u0, 0], [u0 + len / ul, 0], [u0 + len / ul, 1], [u0, 1]]; };
      quad(o, [[x1, 0, z0], [x0, 0, z0], [x0, H, z0], [x1, H, z0]], [0, 0, -1], suv(w));
      quad(o, [[x0, 0, z1], [x1, 0, z1], [x1, H, z1], [x0, H, z1]], [0, 0, 1], suv(w));
      quad(o, [[x0, 0, z0], [x0, 0, z1], [x0, H, z1], [x0, H, z0]], [-1, 0, 0], suv(d));
      quad(o, [[x1, 0, z1], [x1, 0, z0], [x1, H, z0], [x1, H, z1]], [1, 0, 0], suv(d));
      if (lv === S.STAIR_LV) return;   // 楼梯不加压边，免得挡住台阶
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
        const i = cy * GW + cx, lv = M.lv[i], tp = M.top[i];
        if (!lv || used[i]) continue;
        // 贪心合并：样式和高度都相同的格子合成一个方块（楼梯每一级单独一块）
        const same = (j) => M.lv[j] === lv && M.top[j] === tp && !used[j];
        let w = 1;
        while (cx + w < GW && same(i + w)) w++;
        let h = 1;
        outer: while (cy + h < GH) {
          for (let k = 0; k < w; k++) if (!same((cy + h) * GW + cx + k)) break outer;
          h++;
        }
        for (let j = 0; j < h; j++) for (let k = 0; k < w; k++) used[(cy + j) * GW + cx + k] = 1;
        useChunk(cx, cy);
        box(cx * C, cy * C, w * C, h * C, tp, lv);
      }
    const mk = (o) => {
      const g = new T.BufferGeometry();
      g.setAttribute('position', new T.Float32BufferAttribute(o.p, 3));
      g.setAttribute('normal', new T.Float32BufferAttribute(o.n, 3));
      g.setAttribute('uv', new T.Float32BufferAttribute(o.uv, 2));
      return g;
    };
    const sideM = [], trimM = [];
    for (let lv = 1; lv <= 5; lv++) {
      const sl = lv === 5 ? 3 : lv, tc = new T.Color(SK.trim[sl - 1]), glow = (SK.night || SK.glow) && sl !== 3;
      sideM[lv] = lv === 5 && sideM[3] ? sideM[3] : null; trimM[lv] = [glow ? basic(tc) : lambert(tc), glow];
    }
    for (const c of chunks.values()) {
      if (c.top.p.length) {
        const tm = new T.Mesh(mk(c.top), W.groundMat);
        tm.receiveShadow = true; tm.castShadow = true; scene.add(tm);
      }
      for (let lv = 1; lv <= 5; lv++) {
        if (!c.sides[lv].p.length) continue;
        if (!sideM[lv]) sideM[lv] = lambert(0xffffff, { map: sideTexture(lv, SK, lv * 3 + W.G.map) });
        const sm = new T.Mesh(mk(c.sides[lv]), sideM[lv]);
        sm.receiveShadow = true; sm.castShadow = true; scene.add(sm);
        if (!c.trim[lv].p.length) continue;
        const tmm = new T.Mesh(mk(c.trim[lv]), trimM[lv][0]);
        tmm.castShadow = true; tmm.receiveShadow = !trimM[lv][1]; scene.add(tmm);
      }
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
    W.ring = ring;
    if (W.giant) return;   // 2.1：超大地图里天际线跟着镜头走，不放广告牌
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
      if (lv < 3 || lv === 4) continue;
      if (W.giant && (Math.min(rw, rh) < 3 || R() < 0.5)) continue;
      const H = S.LEVEL_H[lv === 5 ? 5 : 3], cx = (rx + rw / 2) * C, cz = (ry + rh / 2) * C;
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
  // ---------------- 草丛：每块草丛一个网格，自己站在里面时变半透明 ----------------
  function buildBushes() {
    const SK = W.SK, C = S.CELL;
    W.bushes = [];
    let base = SK.night ? 0x2a7d6a : 0x3d8f45, tip = SK.night ? 0x5fcfae : 0x86c95a;
    if (SK.fx === 'petals') { base = 0xc8578a; tip = 0xffb8d8; }     // 樱花庭院：开花的杜鹃丛
    if (SK.fx === 'snow') { base = 0x3a7a8a; tip = 0xeef6ff; }        // 雪夜：积雪的灌木
    for (const [bx, by, bw, bh] of W.M.bushes || []) {
      const R = rng(bx * 31 + by * 7);
      const mat = toon(base, { transparent: true });
      const matT = toon(tip, { transparent: true });
      const g = new T.Group();
      for (let j = 0; j < bh; j++)
        for (let i = 0; i < bw; i++) {
          const cx = bx + i, cy = by + j;
          if (!W.M.bush[cy * S.GW + cx]) continue;
          const x = (cx + 0.5) * C, y = (cy + 0.5) * C;
          const r = 10 + R() * 5;
          g.add(part(SH.sphL, mat, r, r * (0.9 + R() * 0.5), r, x + (R() - 0.5) * 6, 8 + R() * 4, y + (R() - 0.5) * 6));
          if (R() < 0.6) { const b = part(SH.cone, matT, 3, 10 + R() * 8, 3, x + (R() - 0.5) * 10, 20 + R() * 4, y + (R() - 0.5) * 10); b.rotation.z = (R() - 0.5) * 0.6; g.add(b); }
        }
      scene.add(g);
      bake(g, true);
      W.bushes.push({ g, mats: [mat, matT], rect: [bx, by, bw, bh], fade: 1 });
    }
  }
  // ---------------- 弹跳板：发光圆盘 + 指向弹飞方向的箭头 ----------------
  function buildPads() {
    const C = S.CELL;
    W.pads = [];
    const baseM = toon(0x2a2d3a), ringM = basic(0x7dfcff, { transparent: true, opacity: 0.9 });
    for (const [px, py, ang] of W.M.pads || []) {
      if (!W.M.pad[py * S.GW + px]) continue;
      const g = new T.Group();
      g.position.set((px + 1) * C, 0, (py + 1) * C);
      g.add(part(SH.cyl, baseM, 15, 3, 15, 0, 1.5, 0));
      const ring = new T.Mesh(SH.ring, ringM); ring.rotation.x = -Math.PI / 2; ring.position.y = 3.2; ring.scale.setScalar(13); g.add(ring);
      const arrows = new T.Group(); arrows.rotation.y = -ang * Math.PI / 180; arrows.position.y = 3.3; g.add(arrows);
      const am = basic(0xffdf2e);
      for (let k = 0; k < 2; k++) {
        const a1 = part(SH.box, am, 2, 0.6, 9, -2 + k * 6, 0, -3.2); a1.rotation.y = 0.7; arrows.add(a1);
        const a2 = part(SH.box, am, 2, 0.6, 9, -2 + k * 6, 0, 3.2); a2.rotation.y = -0.7; arrows.add(a2);
      }
      scene.add(g);
      W.pads.push({ g, ring, ringM });
    }
    // 2.1：电梯——发光底座 + 一直升到天台的光柱和钢架
    const liftM = basic(0x5ee36a, { transparent: true, opacity: 0.18, depthWrite: false, side: T.DoubleSide });
    const frameM = toon(0x3a3e52), lampM = basic(0x5ee36a);
    const HL = S.LEVEL_H[5] + 14;
    for (const [lx, ly] of W.M.lifts || []) {
      const g = new T.Group();
      g.position.set((lx + 1) * C, 0, (ly + 1) * C);
      g.add(part(SH.box, frameM, 30, 3, 30, 0, 1.5, 0));
      const ring = new T.Mesh(SH.ring, basic(0x5ee36a, { transparent: true, opacity: 0.9 })); ring.rotation.x = -Math.PI / 2; ring.position.y = 3.2; ring.scale.setScalar(12); g.add(ring);
      const beam = new T.Mesh(new T.CylinderGeometry(12, 12, HL, 12, 1, true), liftM); beam.position.y = HL / 2; g.add(beam);
      for (const [ox, oz] of [[-15, -15], [15, -15], [-15, 15], [15, 15]]) g.add(part(SH.box, frameM, 2.4, HL, 2.4, ox, HL / 2, oz));
      for (let y = 40; y < HL; y += 56) { g.add(part(SH.box, frameM, 32, 2, 2, 0, y, -15)); g.add(part(SH.box, frameM, 32, 2, 2, 0, y, 15)); }
      g.add(part(SH.box, lampM, 32, 2, 32, 0, HL, 0));
      scene.add(g);
      W.pads.push({ g, ring, ringM: ring.material });
    }
  }
  // ---------------- 环境粒子：樱花花瓣 / 雪 / 炉火余烬 ----------------
  function buildAmbient(SK) {
    W.amb = null;
    if (!SK.fx) return;
    const N = HQ ? 420 : 220;
    const pos = new Float32Array(N * 3), vel = new Float32Array(N * 3);
    const R = rng(77);
    for (let i = 0; i < N; i++) { pos[i * 3] = R() * S.W; pos[i * 3 + 1] = R() * 500; pos[i * 3 + 2] = R() * S.H; vel[i * 3] = R(); vel[i * 3 + 1] = R(); vel[i * 3 + 2] = R(); }
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.BufferAttribute(pos, 3));
    const color = SK.fx === 'petals' ? 0xffb8d8 : SK.fx === 'snow' ? 0xffffff : SK.fx === 'wisps' ? 0xb48cff : 0xffa040;
    const glowy = SK.fx === 'embers' || SK.fx === 'wisps';
    const m = new T.PointsMaterial({ color, size: SK.fx === 'snow' ? 6 : SK.fx === 'petals' ? 7 : SK.fx === 'wisps' ? 6 : 4, transparent: true, opacity: glowy ? 0.9 : 0.85, depthWrite: false,
      blending: glowy ? T.AdditiveBlending : T.NormalBlending });
    const pts = new T.Points(g, m); pts.frustumCulled = false;
    scene.add(pts);
    W.amb = { pts, pos, vel, N, kind: SK.fx };
  }
  function stepAmbient(dt, now) {
    const A = W.amb;
    if (!A) return;
    const { pos, vel, N, kind } = A;
    for (let i = 0; i < N; i++) {
      const k = i * 3;
      if (kind === 'wisps') { pos[k + 1] += (12 + vel[k + 1] * 18) * dt; pos[k] += Math.sin(now / 1100 + vel[k] * 9) * 14 * dt; pos[k + 2] += Math.cos(now / 1300 + vel[k + 2] * 9) * 10 * dt; if (pos[k + 1] > 300) pos[k + 1] = 0; }
      else if (kind === 'embers') { pos[k + 1] += (30 + vel[k + 1] * 50) * dt; pos[k] += Math.sin(now / 900 + vel[k] * 9) * 20 * dt; if (pos[k + 1] > 420) pos[k + 1] = 0; }
      else {
        const fall = kind === 'snow' ? 40 + vel[k + 1] * 30 : 30 + vel[k + 1] * 25;
        pos[k + 1] -= fall * dt;
        pos[k] += (Math.sin(now / 1300 + vel[k] * 7) * 25 + (kind === 'petals' ? 18 : 6)) * dt;
        pos[k + 2] += Math.cos(now / 1700 + vel[k + 2] * 7) * 15 * dt;
        if (pos[k + 1] < 0) { pos[k + 1] = 480; pos[k] = Math.random() * S.W; pos[k + 2] = Math.random() * S.H; }
      }
      if (pos[k] > S.W) pos[k] -= S.W;
    }
    A.pts.geometry.attributes.position.needsUpdate = true;
  }
  // 场景静态物体合并（复用机兵的 bake）
  function bakeStatic(g) { bake(g, true); for (const m of g.children) { m.receiveShadow = true; } }

  function flat(mesh, x, y, z) { mesh.rotation.x = -Math.PI / 2; mesh.position.set(x, z, y); return mesh; }

  function buildModeDecor(G) {
    const cs = G.colors;
    for (const t of (G.teams || 2) > 2 ? [] : [1, 2]) {
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
    if (G.mode === 'seal') {   // 1.8：己方祭坛（鸟居门 + 石台 + 符纹圈）
      for (const t of [1, 2]) {
        const b = S.basePos(t), g = new T.Group(), red = toon(0xc8102e), dk = toon(0x2a1a22);
        g.add(flat(part(SH.ring, basic(cs[t]), 120, 120, 1), 0, 0, 1.1));
        g.add(flat(part(SH.ring, basic(0xd8b25a), 90, 90, 1), 0, 0, 1.2));
        for (const z of [-46, 46]) g.add(outlined(SH.cylH, red, 3.4, 70, 3.4, 0, 35, z, 1));
        g.add(outlined(rbox(8, 5, 116, 1.4), red, 1, 1, 1, 0, 70, 0, 1)); g.add(part(SH.box, dk, 9, 3, 124, 0, 74, 0)); g.add(part(SH.box, red, 6, 4, 96, 0, 58, 0));
        g.add(outlined(rbox(30, 10, 30, 3), toon(0x8a8ea0), 1, 1, 1, 0, 5, 0, 1));
        g.add(part(SH.sphL, basic(cs[t], { transparent: true, opacity: 0.25, depthWrite: false, blending: T.AdditiveBlending }), 22, 22, 22, 0, 18, 0));
        g.position.set(b.x, 0, b.y); g.rotation.y = Math.PI / 2;
        bake(g); scene.add(g);
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
    const TEAMS = Array.from({ length: cs.length - 1 }, (_, i) => i + 1);
    for (const t of TEAMS) {
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
    // 迫击炮弹 + 落点预警圈
    for (const t of TEAMS) {
      const sm = toon(cs[t], { emissive: new T.Color(cs[t]).multiplyScalar(0.3) });
      P['shell' + t] = pool(() => { const m = new T.Mesh(SH.sph, sm); m.scale.setScalar(7); m.castShadow = true; return m; });
      const wm = basic(cs[t], { transparent: true, opacity: 0.5, side: T.DoubleSide, depthWrite: false });
      P['warn' + t] = pool(() => new T.Mesh(SH.ring, wm));
      // 炮台 / 无人机 / 便当
      P['turret' + t] = pool(() => {
        const g = new T.Group();
        g.add(part(SH.cyl, toon(0x3a3e52), 9, 6, 9, 0, 3, 0));
        g.add(part(SH.cyl, toon(0x3a3e52), 2, 14, 2, 0, 12, 0));
        const head = new T.Group(); head.position.y = 19; g.add(head);
        head.add(part(SH.sphL, toon(cs[t]), 6, 5, 6, 0, 0, 0));
        head.add(part(SH.cyl, toon(0x23252f), 1.6, 12, 1.6, 7, 0, 0)).rotation.z = -Math.PI / 2;
        g.userData.head = head; return g;
      });
      P['drone' + t] = pool(() => {
        const g = new T.Group();
        g.add(part(SH.sphL, toon(0xfff3e0), 6, 5, 6, 0, 0, 0));
        for (const z of [-3, 3]) g.add(part(SH.cone, toon(cs[t]), 2, 4, 1.6, 0, 5, z));
        for (const z of [-2, 2]) g.add(part(SH.sphL, basic(0x222222), 0.9, 1.2, 0.9, 5.3, 1, z));
        const rotor = part(SH.box, toon(0x3a3e52), 18, 0.6, 2, 0, 7, 0); g.add(rotor); g.userData.rotor = rotor;
        return g;
      });
    }
    // 盾墙（每队一个颜色）
    for (const t of TEAMS) {
      const wm = basic(cs[t], { transparent: true, opacity: 0.35, side: T.DoubleSide, depthWrite: false, blending: T.AdditiveBlending });
      P['wall' + t] = pool(() => {
        const g = new T.Group();
        g.add(part(SH.box, wm, 140, 80, 4, 0, 40, 0));
        g.add(part(SH.box, toon(0x2a2d3a), 144, 6, 8, 0, 3, 0));
        g.add(part(SH.box, basic(cs[t]), 144, 3, 5, 0, 80, 0));
        return g;
      });
    }
    // 1.8：结界机兵的结界（每队一个颜色）：半透明穹顶 + 地上的符纹圈 + 一圈立着的符纸
    for (const t of TEAMS) {
      const dm = basic(cs[t], { transparent: true, opacity: 0.16, side: T.DoubleSide, depthWrite: false, blending: T.AdditiveBlending });
      P['dome' + t] = pool(() => {
        const g = new T.Group();
        g.add(new T.Mesh(new T.SphereGeometry(150, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2), dm));
        const runes = new T.Group(); g.add(runes);
        runes.add(flat(part(SH.ring, basic(0xd8b25a, { transparent: true, opacity: 0.8, side: T.DoubleSide }), 150, 150, 1), 0, 0, 1.5));
        runes.add(flat(part(SH.ring, basic(cs[t], { transparent: true, opacity: 0.6, side: T.DoubleSide }), 110, 110, 1), 0, 0, 1.6));
        for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; const tg = part(SH.box, basic(0xf4e6c8), 1, 14, 6, Math.cos(a) * 146, 9, Math.sin(a) * 146); tg.rotation.y = -a; runes.add(tg); const st2 = part(SH.box, basic(0xc8102e), 1.2, 8, 1.6, Math.cos(a) * 146, 9, Math.sin(a) * 146); st2.rotation.y = -a; runes.add(st2); }
        return g;
      });
    }
    // 1.9.1：符零的简易领域（每队一个颜色）：地面符阵 + 半透明边界墙 + 旋转的八芒星 + 一圈立着的符纸
    for (const t of TEAMS) {
      const R0 = 170;
      P['domain' + t] = pool(() => {
        const g = new T.Group();
        g.add(flat(new T.Mesh(new T.CircleGeometry(R0, 48), basic(cs[t], { transparent: true, opacity: 0.1, depthWrite: false, blending: T.AdditiveBlending })), 0, 0, 0.8));
        const wall = new T.Mesh(new T.CylinderGeometry(R0, R0, 70, 48, 1, true), basic(cs[t], { transparent: true, opacity: 0.16, side: T.DoubleSide, depthWrite: false, blending: T.AdditiveBlending }));
        wall.position.y = 35; g.add(wall);
        const gold = basic(0xd8b25a, { transparent: true, opacity: 0.9, side: T.DoubleSide, depthWrite: false });
        const star = new T.Group(); g.add(star);
        star.add(flat(part(SH.ring, gold, R0, R0, 1), 0, 0, 1.4));
        star.add(flat(part(SH.ring, basic(cs[t], { transparent: true, opacity: 0.7, side: T.DoubleSide, depthWrite: false }), R0 - 22, R0 - 22, 1), 0, 0, 1.5));
        star.add(flat(part(SH.ring, gold, 56, 56, 1), 0, 0, 1.6));
        for (let i = 0; i < 8; i++) {   // 八芒星：每个点连到隔 3 个的点
          const a = (i / 8) * Math.PI * 2, b = ((i + 3) / 8) * Math.PI * 2, r = R0 - 30, x0 = Math.cos(a) * r, y0 = Math.sin(a) * r, x1 = Math.cos(b) * r, y1 = Math.sin(b) * r;
          const ln = part(SH.box, gold, Math.hypot(x1 - x0, y1 - y0), 0.6, 2.2, (x0 + x1) / 2, 1.7, (y0 + y1) / 2); ln.rotation.y = -Math.atan2(y1 - y0, x1 - x0); star.add(ln);
        }
        const tal = new T.Group(); g.add(tal);
        for (let i = 0; i < 14; i++) {
          const a = (i / 14) * Math.PI * 2, tg = part(SH.box, basic(0xf4e6c8), 1, 16, 7, Math.cos(a) * (R0 - 2), 12, Math.sin(a) * (R0 - 2)); tg.rotation.y = -a; tal.add(tg);
          const st2 = part(SH.box, basic(0xc8102e), 1.2, 9, 2, Math.cos(a) * (R0 - 1.4), 12, Math.sin(a) * (R0 - 1.4)); st2.rotation.y = -a; tal.add(st2);
        }
        const orb = new T.Group(); g.add(orb);
        for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2; orb.add(part(SH.box, basic(0xffe9a8), 5, 9, 1, Math.cos(a) * 60, 48, Math.sin(a) * 60)); }
        return g;
      });
    }
    // 1.8：符零的封印符阵（金色符纹 + 红色五角星线 + 漂浮的符纸）
    P.sealz = pool(() => {
      const g = new T.Group(), gm = basic(0xd8b25a, { transparent: true, opacity: 0.85, side: T.DoubleSide, depthWrite: false });
      g.add(flat(part(SH.ring, gm, 105, 105, 1), 0, 0, 0.5));
      g.add(flat(part(SH.ring, gm, 80, 80, 1), 0, 0, 0.5));
      for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2, b = ((i + 2) / 5) * Math.PI * 2, x0 = Math.cos(a) * 80, y0 = Math.sin(a) * 80, x1 = Math.cos(b) * 80, y1 = Math.sin(b) * 80; const ln = part(SH.box, basic(0xff2d4b, { transparent: true, opacity: 0.8 }), Math.hypot(x1 - x0, y1 - y0), 0.6, 3, (x0 + x1) / 2, 0.8, (y0 + y1) / 2); ln.rotation.y = -Math.atan2(y1 - y0, x1 - x0); g.add(ln); }
      for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; const tg = part(SH.box, basic(0xf4e6c8), 1, 12, 5, Math.cos(a) * 100, 24, Math.sin(a) * 100); tg.rotation.y = -a; g.add(tg); }
      return g;
    });
    // 1.8：封印石（紫色发光晶体）
    P.stone = pool(() => {
      const g = new T.Group();
      g.add(new T.Mesh(new T.OctahedronGeometry(7), toon(0x8a6bff, { emissive: new T.Color(0x3a1a7a) })));
      g.add(part(SH.sphL, basic(0xb48cff, { transparent: true, opacity: 0.3, depthWrite: false, blending: T.AdditiveBlending }), 13, 13, 13, 0, 0, 0));
      g.add(flat(part(SH.ring, basic(0xd8b25a, { transparent: true, opacity: 0.7, side: T.DoubleSide }), 9, 9, 1), 0, 0, -10));
      return g;
    });
    // 1.8：百目砸地的预警圈（实心圆从中间慢慢填满）
    P.disc = pool(() => new T.Mesh(new T.CircleGeometry(1, 32), basic(0xff2d4b, { transparent: true, opacity: 0.3, depthWrite: false, side: T.DoubleSide })));
    // 2.0：近战命中扇形（按角度缓存几何体）+ 敌方近战的攻击距离圈
    W.wedge = {};   // 不放进 P：P 里每一项都是 pool（每帧 begin / end）
    W.wedgeOf = (arc) => {
      const key = Math.round(arc * 20);
      if (!W.wedge[key]) { const g = new T.CircleGeometry(1, 28, -arc / 2, arc); W.wedge[key] = pool(() => { const m = new T.Mesh(g, basic(0xffffff, { transparent: true, depthWrite: false, side: T.DoubleSide })); m.rotation.x = -Math.PI / 2; m.renderOrder = 4; return m; }); W.wedge[key].begin(); }
      return W.wedge[key].next();
    };
    // 1.8：裂空斩的月牙刀气
    P.cres = pool(() => new T.Mesh(new T.TorusGeometry(26, 4, 6, 18, Math.PI), basic(0xffffff, { transparent: true, opacity: 0.85, depthWrite: false, blending: T.AdditiveBlending })));
    // 逃亡圈：空投箱（金色补给箱 + 降落伞）
    P.crate = pool(() => {
      const g = new T.Group();
      g.add(outlined(rbox(18, 14, 18, 2.5), toon(0xffb42e), 1, 1, 1, 0, 7, 0));
      g.add(part(SH.box, toon(0x141018), 18.6, 2.2, 18.6, 0, 9, 0));
      g.add(part(SH.box, toon(0xfff6e3), 4, 14.4, 18.8, 0, 7, 0));
      const glow = part(SH.sphL, basic(0xffe600, { transparent: true, opacity: 0.25, depthWrite: false, blending: T.AdditiveBlending }), 20, 20, 20, 0, 10, 0);
      g.add(glow);
      return g;
    });
    P.bento = pool(() => {
      const g = new T.Group();
      g.add(part(SH.box, toon(0xd8492e), 16, 7, 12, 0, 3.5, 0));
      g.add(part(SH.box, toon(0xffe0a0), 16.5, 2, 12.5, 0, 7.5, 0));
      g.add(part(SH.box, basic(0xffffff), 3, 2.2, 13, 0, 7.6, 0));
      return g;
    });
    // 瞄准指示（地面上的半透明条 / 扇形 / 圆）
    const am = new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.25, depthWrite: false, side: T.DoubleSide });
    W.aimMat = am;
    W.aimLine = new T.Mesh(new T.PlaneGeometry(1, 1).translate(0.5, 0, 0), am); W.aimLine.rotation.x = -Math.PI / 2;
    W.aimFan = new T.Mesh(new T.CircleGeometry(1, 24, -0.5, 1), am); W.aimFan.rotation.x = -Math.PI / 2;
    W.aimCircle = new T.Mesh(new T.CircleGeometry(1, 40), am); W.aimCircle.rotation.x = -Math.PI / 2;
    W.aimRing = new T.Mesh(SH.ring, new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7, depthWrite: false, side: T.DoubleSide })); W.aimRing.rotation.x = -Math.PI / 2;
    for (const m of [W.aimLine, W.aimFan, W.aimCircle, W.aimRing]) { m.visible = false; m.renderOrder = 5; scene.add(m); }
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
    // 卡卡：替身全息影像 + 惊喜礼盒
    P.decoy = pool(() => {
      const g = new T.Group(), hm = basic(0xb06bff, { transparent: true, opacity: 0.45, depthWrite: false, blending: T.AdditiveBlending });
      g.add(part(SH.cyl, hm, 9, 30, 9, 0, 15, 0)); g.add(part(SH.cyl, hm, 6, 9, 6, 0, 36, 0)); g.add(part(SH.cyl, hm, 9, 1.2, 9, 0, 31, 0));
      const ring = part(SH.ring, basic(0xffd23f, { transparent: true, opacity: 0.8, side: T.DoubleSide, depthWrite: false }), 16, 16, 1, 0, 1, 0); ring.rotation.x = -Math.PI / 2; g.add(ring);
      for (let i = 0; i < 4; i++) { const c = part(SH.box, basic(i % 2 ? 0xff3e6c : 0xffffff), 4, 6, 0.4, Math.cos(i * 1.57) * 14, 20, Math.sin(i * 1.57) * 14); g.add(c); }
      return g;
    });
    P.gift = pool(() => {
      const g = new T.Group();
      g.add(part(SH.box, lambert(0xb06bff), 12, 10, 12, 0, 5, 0));
      g.add(part(SH.box, lambert(0xffd23f), 13, 2.4, 3, 0, 5, 0)); g.add(part(SH.box, lambert(0xffd23f), 3, 2.4, 13, 0, 5, 0));
      g.add(part(SH.box, lambert(0xffd23f), 13, 10.4, 3, 0, 5, 0)); g.add(part(SH.sph, lambert(0xffd23f), 3, 2, 3, 0, 11, 0));
      return g;
    });
    if (G.mode === 'loot') {
      // 1.6：地上的物资——发光的小箱子（颜色 = 品质），史诗 / 传说加一道光柱；撤离点 = 地面光圈 + 信号灯
      // 用实例化网格：每种品质一次绘制（几百件物资也不卡）
      W.lootInst = [null];
      const CAP = 600, boxG = new T.BoxGeometry(1, 1, 1);
      for (let r = 1; r <= 5; r++) {
        const c = S.LOOT.rare[r].c;
        const im = new T.InstancedMesh(boxG, lambert(c, { emissive: new T.Color(c).multiplyScalar(r >= 4 ? 0.6 : 0.35) }), CAP);
        im.count = 0; im.frustumCulled = false; scene.add(im);
        const bm = r >= 4 ? new T.InstancedMesh(new T.CylinderGeometry(1, 1, 1, 8, 1, true), basic(c, { transparent: true, opacity: 0.3, depthWrite: false, blending: T.AdditiveBlending }), CAP) : null;
        if (bm) { bm.count = 0; bm.frustumCulled = false; scene.add(bm); }
        W.lootInst.push({ im, bm, s: 7 + r * 0.7 });
      }
      W.lootM = new T.Matrix4(); W.lootQ = new T.Quaternion(); W.lootE = new T.Euler(); W.lootV = new T.Vector3(); W.lootSc = new T.Vector3();
      W.exZones = null;
      // 2.1：可搜索的容器——每种容器一个实例化网格（箱体 + 一道色带），颜色随状态变暗（开过 / 空了）
      const CV = { crate: [24, 18, 16, 0x9a6a3a, 0xffc46b], locker: [16, 11, 36, 0x5a7a9a, 0xc8d8ea], safe: [18, 16, 20, 0x3a3e4a, 0xd8b25a], pc: [20, 12, 14, 0x2a2d3a, 0x1fd6ee],
        med: [20, 14, 12, 0xf2f2f2, 0xff3b52], weapon: [36, 12, 10, 0x5a6a3a, 0xffd23f], duffel: [24, 12, 10, 0x2a2a30, 0xff8a1f], vault: [32, 32, 30, 0xb08a3a, 0xffe58a],
        body: [22, 14, 8, 0x3a3448, 0xff3b52], pile: [16, 16, 8, 0x6a6a6a, 0xffffff] };
      W.contInst = {}; W.contCV = CV;
      const unit = new T.BoxGeometry(1, 1, 1); unit.translate(0, 0.5, 0);
      for (const type of S.CONT_IDS) {
        const v = CV[type] || CV.crate, cap = Math.max(64, ((G.contArr || []).filter((c) => c.type === type).length + 64));
        const body = new T.InstancedMesh(unit, lambert(0xffffff), cap), band = new T.InstancedMesh(unit, basic(0xffffff), cap);
        body.count = band.count = 0; body.castShadow = true; body.receiveShadow = true; body.frustumCulled = band.frustumCulled = false;
        scene.add(body, band);
        W.contInst[type] = { body, band, cap, v };
      }
      if (G.lever) {   // 电闸：配电柜 + 拉杆 + 警示灯
        const [lx, ly] = G.lever, lz = S.topAt(W.M, lx, ly), g = new T.Group(); g.position.set(lx, lz, ly);
        g.add(part(SH.box, toon(0x3a3e4a), 26, 40, 14, 0, 20, 0));
        g.add(part(SH.box, toon(0xffd23f), 26.5, 4, 14.5, 0, 34, 0));
        W.leverArm = part(SH.box, toon(0xff3b52), 3, 18, 3, 0, 9, 0); const pv = new T.Group(); pv.position.set(0, 24, 8); pv.add(W.leverArm); g.add(pv); W.leverPivot = pv;
        W.leverLamp = part(SH.sph, basic(0xff9a3d), 4, 4, 4, 0, 46, 0); g.add(W.leverLamp);
        scene.add(g);
      }
    }
    if (G.mode === 'park') {
      // 气球：每个颜色随 id 变化
      P.balloon = pool(() => {
        const g = new T.Group(), m = toon(0xff3ea5);
        const b = part(SH.sphH, m, 9, 11, 9, 0, 0, 0); g.add(b); g.userData.mat = m;
        g.add(part(SH.cone, m, 2, 3, 2, 0, -11.5, 0));
        g.add(part(SH.cyl, basic(0xffffff), 0.35, 44, 0.35, 0, -34, 0));
        g.add(part(SH.sph, basic(0xffffff, { transparent: true, opacity: 0.7 }), 2.2, 3, 2.2, -3.5, 4, -3.5));
        return g;
      });
      // 嘉年华花车：底盘 + 旋转木马顶棚 + 彩灯；地上一圈得分光圈
      const fl = new T.Group();
      fl.add(outlined(rbox(64, 10, 40, 4), toon(0xffd23f), 1, 1, 1, 0, 8, 0));
      for (const [x, z] of [[-22, -17], [22, -17], [-22, 17], [22, 17]]) { const wh = part(SH.cyl, toon(0x2a2d3a), 5, 4, 5, x, 4, z); wh.rotation.x = Math.PI / 2; fl.add(wh); }
      const top = new T.Group(); top.position.y = 13; fl.add(top);
      top.add(part(SH.cyl, toon(0xff3ea5), 3, 34, 3, 0, 17, 0));
      for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; top.add(part(SH.cyl, toon(0xf4efe6), 0.9, 26, 0.9, Math.cos(a) * 16, 13, Math.sin(a) * 16)); top.add(part(SH.sphH, toon([0x1fd6ee, 0xff3ea5, 0x9cff2e, 0xffd23f, 0xff8a1f, 0xb06bff][i]), 4, 3, 5, Math.cos(a) * 16, 10 + (i % 2) * 5, Math.sin(a) * 16)); }
      const roof = part(SH.cone, toon(0x1fd6ee), 24, 14, 24, 0, 33, 0); top.add(roof);
      for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; top.add(part(SH.sph, basic(i % 2 ? 0xfff36b : 0xff3ea5), 1.6, 1.6, 1.6, Math.cos(a) * 23, 26, Math.sin(a) * 23)); }
      top.add(part(SH.sph, basic(0xfff36b), 3, 3, 3, 0, 41, 0));
      W.float = fl; W.floatTop = top; fl.name = 'parkFloat'; scene.add(fl);
      W.floatRingM = basic(0xffffff, { transparent: true, opacity: 0.85, side: T.DoubleSide, depthWrite: false });
      W.floatDiscM = basic(0xffffff, { transparent: true, opacity: 0.12, depthWrite: false });
      W.floatRing = flat(part(SH.ring, W.floatRingM, S.PARK.r, S.PARK.r, 1), 0, 0, 1.5); scene.add(W.floatRing);
      W.floatDisc = flat(part(SH.disc, W.floatDiscM, S.PARK.r, S.PARK.r, 1), 0, 0, 1.2); scene.add(W.floatDisc);
    }
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

  // ---------------- 粒子：每颗有自己的大小、透明度、寿命；分普通（涂料、烟）和发光叠加两套 ----------------
  const PVS = `attribute float size; attribute float alpha; varying vec3 vC; varying float vA;
    void main(){ vC = color; vA = alpha; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = size * (520.0 / -mv.z); gl_Position = projectionMatrix * mv; }`;
  const PFS = `varying vec3 vC; varying float vA; uniform float soft;
    void main(){ vec2 d = gl_PointCoord - 0.5; float r = length(d); if (r > 0.5) discard;
      float a = soft > 0.5 ? smoothstep(0.5, 0.0, r) : smoothstep(0.5, 0.38, r); gl_FragColor = vec4(vC, a * vA); }`;
  function makePS(n, additive, soft) {
    const g = new T.BufferGeometry();
    const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), size = new Float32Array(n), alpha = new Float32Array(n);
    for (let i = 0; i < n; i++) pos[i * 3 + 1] = -9999;
    g.setAttribute('position', new T.BufferAttribute(pos, 3)); g.setAttribute('color', new T.BufferAttribute(col, 3));
    g.setAttribute('size', new T.BufferAttribute(size, 1)); g.setAttribute('alpha', new T.BufferAttribute(alpha, 1));
    const m = new T.ShaderMaterial({ vertexShader: PVS, fragmentShader: PFS, vertexColors: true, transparent: true, depthWrite: false,
      blending: additive ? T.AdditiveBlending : T.NormalBlending, uniforms: { soft: { value: soft ? 1 : 0 } } });
    const pts = new T.Points(g, m); pts.frustumCulled = false; scene.add(pts);
    return { pts, pos, col, size, alpha, d: new Array(n).fill(null), i: 0, n };
  }
  function buildParticles() {
    W.ps = makePS(PN, false, false);        // 涂料飞溅、碎片
    W.pg = makePS(900, true, true);         // 发光：枪口火光、火花、能量
    W.pk = makePS(500, false, true);        // 烟雾：柔和的大颗粒
  }
  const _c = new T.Color();
  // opt: { size, life, grav, drag, grow, sys: 'ps'|'pg'|'pk', spread, dir: {x,y,z} }
  // 2.0：自适应画质——帧率不够时降低渲染分辨率和粒子数量，恢复后再调回来
  const DYN = { scale: 1, pk: 1 };
  function setDyn(scale, pk) {
    scale = Math.max(0.5, Math.min(1, scale)); DYN.pk = Math.max(0.3, Math.min(1, pk));
    if (Math.abs(scale - DYN.scale) < 0.01) return; DYN.scale = scale;
    if (renderer) { renderer.setPixelRatio(Math.min(HQ ? 1.5 : 1, window.devicePixelRatio || 1) * DYN.scale); resize(); }
  }
  function emit(x, y, z, color, n, spd = 220, up = 1, opt = {}) {
    if (!W) return;
    if (DYN.pk < 1) { n *= DYN.pk; n = Math.floor(n) + (Math.random() < n % 1 ? 1 : 0); if (!n) return; }
    const S2 = W[opt.sys || 'ps'];
    _c.set(color);
    for (let k = 0; k < n; k++) {
      const i = S2.i; S2.i = (S2.i + 1) % S2.n;
      const a = Math.random() * 6.283, e = 0.15 + Math.random() * 1.1 * up, v = spd * (0.3 + Math.random());
      let vx = Math.cos(a) * Math.cos(e) * v, vy = Math.sin(a) * Math.cos(e) * v, vz = Math.sin(e) * v;
      if (opt.dir) { const sp = opt.spread == null ? 0.35 : opt.spread; vx = (opt.dir.x + (Math.random() - 0.5) * sp) * v; vy = (opt.dir.y + (Math.random() - 0.5) * sp) * v; vz = (opt.dir.z + (Math.random() - 0.3) * sp) * v; }
      const life = (opt.life || 0.5) * (0.6 + Math.random() * 0.8);
      S2.d[i] = { x, y, z, vx, vy, vz, life, max: life, s0: (opt.size || 7) * (0.7 + Math.random() * 0.6), grow: opt.grow || 0, grav: opt.grav == null ? 760 : opt.grav, drag: opt.drag || 0 };
      S2.col[i * 3] = _c.r; S2.col[i * 3 + 1] = _c.g; S2.col[i * 3 + 2] = _c.b;
    }
    S2.pts.geometry.attributes.color.needsUpdate = true;
  }
  function burst(x, y, z, color, n, spd = 220, up = 1) { emit(x, y, z, color, n, spd, up, { size: 7, life: 0.6 }); }
  function stepPS(S2, dt) {
    const P = S2.pos;
    for (let i = 0; i < S2.n; i++) {
      const p = S2.d[i];
      if (!p) continue;
      p.life -= dt;
      if (p.life <= 0) { S2.d[i] = null; P[i * 3 + 1] = -9999; S2.alpha[i] = 0; continue; }
      p.vz -= p.grav * dt;
      if (p.drag) { const f = Math.exp(-p.drag * dt); p.vx *= f; p.vy *= f; p.vz *= f; }
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      const gh = S.topAt(W.M, p.x, p.y);
      if (p.grav > 0 && p.z < gh && gh < 1e3) { p.z = gh + 0.5; p.vx *= 0.4; p.vy *= 0.4; p.vz = 0; }
      const k = p.life / p.max;
      P[i * 3] = p.x; P[i * 3 + 1] = p.z; P[i * 3 + 2] = p.y;
      S2.size[i] = p.s0 * (1 + p.grow * (1 - k));
      S2.alpha[i] = Math.min(1, k * 2.2);
    }
    const g = S2.pts.geometry.attributes;
    g.position.needsUpdate = true; g.size.needsUpdate = true; g.alpha.needsUpdate = true;
  }
  function stepParticles(dt) { stepPS(W.ps, dt); stepPS(W.pg, dt); stepPS(W.pk, dt); }

  // =====================================================================
  // 机兵模型
  // =====================================================================
  function buildWeapon(g, weapon, color) {
    const s = SH, cm = toon(color), dk = toon(0x2a2d3a), mt = toon(0x8c94ab);
    const lt = toon(new T.Color(color).lerp(new T.Color(0xffffff), 0.5));
    const add = (o) => { g.add(o); return o; };
    const cylX = (m, r, len, x, y, z) => { const o = part(s.cyl, m, r, len, r, x, y, z); o.rotation.z = -Math.PI / 2; return add(o); };
    switch (weapon) {
      case 'warden': {    // 1.8 结界机兵：符咒法杖 + 发光宝珠 + 金色符环 + 垂下的符纸
        add(outlined(rbox(8, 5, 5, 1.6), dk, 1, 1, 1, 2, 0, 0));
        cylX(toon(0x3a2a1c), 1.1, 24, 16, 0, 0);
        add(part(s.sph, basic(color), 2.8, 2.8, 2.8, 29.5, 0, 0));
        { const ring = add(new T.Mesh(new T.TorusGeometry(5, 0.5, 6, 20), basic(0xd8b25a))); ring.rotation.y = Math.PI / 2; ring.position.set(29.5, 0, 0); }
        for (const [x, z] of [[19, 2.4], [23, -2.4], [26.5, 1.8]]) { add(part(s.box, toon(0xf4e6c8), 0.3, 6.4, 2.2, x, -4.2, z)); add(part(s.box, toon(0xc8102e), 0.35, 3.6, 0.5, x, -4.2, z)); }
        add(outlined(rbox(4, 7, 3.4, 1.2), dk, 1, 1, 1, 1, -5, 0));
        break;
      }
      case 'reaper': {    // 1.8 灵刃机兵：长柄弯刀 + 金色刀镡 + 发光刃口
        add(outlined(rbox(8, 4, 4, 1.4), dk, 1, 1, 1, 1, 0, 0));
        cylX(toon(0x1d1a26), 1.0, 22, 14, 0, 0);
        add(part(s.box, toon(0xd8b25a), 2, 3.6, 3.6, 25, 0, 0));
        { const bl = add(outlined(rbox(20, 1.6, 5, 0.6), toon(0xdfe6ee), 1, 1, 1, 35, 2, 0)); bl.rotation.z = 0.28; }
        { const ed = add(part(s.box, basic(color), 19, 0.5, 1.4, 35.4, 2.9, 2.5)); ed.rotation.z = 0.28; }
        add(outlined(rbox(4, 7, 3.4, 1.2), dk, 1, 1, 1, 1, -5, 0));
        break;
      }
      case 'slinger': {   // 弹弓：Y 形叉 + 皮筋 + 涂料球
        add(outlined(rbox(10, 5, 5, 1.8), mt, 1, 1, 1, 4, 0, 0));
        for (const z of [-3.4, 3.4]) { const arm = add(outlined(rbox(10, 2.4, 2.4, 0.9), cm, 1, 1, 1, 12.5, 2.6, z)); arm.rotation.y = z > 0 ? -0.32 : 0.32; }
        add(part(s.box, dk, 1, 0.9, 10, 17.5, 3.4, 0));
        add(part(s.sph, lt, 3.2, 3.2, 3.2, 13, 3.4, 0));
        add(outlined(rbox(4, 7, 3.4, 1.2), dk, 1, 1, 1, 1, -5, 0));
        break;
      }
      case 'blade': {     // 影刃：长刀 + 发光刃口
        add(outlined(rbox(8, 4, 4, 1.4), dk, 1, 1, 1, 2, 0, 0));
        add(part(s.box, mt, 1.8, 7.5, 7.5, 6.8, 0, 0));
        add(outlined(rbox(30, 1.8, 5.4, 0.7), toon(0xdfe6ee), 1, 1, 1, 22, 0, 0));
        add(part(s.box, basic(color), 28, 0.6, 1.2, 22.5, 0, 2.7));
        add(part(s.cone, toon(0xdfe6ee), 2.7, 4, 0.9, 38.5, 0, 0)).rotation.z = -Math.PI / 2;
        break;
      }
      case 'stinger': {   // 毒针：细长针管 + 绿色毒液罐
        add(outlined(rbox(14, 4.5, 4.5, 1.6), cm, 1, 1, 1, 6, 0, 0));
        cylX(mt, 0.8, 18, 21, 0.5, 0); cylX(dk, 1.5, 1.8, 30, 0.5, 0);
        { const vial = part(s.cyl, toon(0x9cff2e, { emissive: 0x2a5a00, transparent: true, opacity: 0.85 }), 2.3, 9, 2.3, 6, 5.8, 0); vial.rotation.z = Math.PI / 2; add(vial); }
        add(outlined(rbox(4, 7, 3.4, 1.2), dk, 1, 1, 1, 1, -5, 0));
        break;
      }
      case 'phantom': {   // 幻影：双管霰弹 + 半透明迷彩面板
        add(outlined(rbox(16, 5, 6.4, 1.8), toon(0x2a2d3a), 1, 1, 1, 6, 0, 0));
        cylX(mt, 1.4, 11, 18, 1.2, 1.7); cylX(mt, 1.4, 11, 18, 1.2, -1.7);
        add(part(s.box, basic(color, { transparent: true, opacity: 0.75 }), 11, 1.3, 6.6, 5, 3, 0));
        add(outlined(rbox(4, 7, 3.4, 1.2), dk, 1, 1, 1, 1, -5, 0));
        break;
      }
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
      case 'mortar': {
        // 肩扛迫击炮：粗炮管斜向上
        add(outlined(rbox(12, 8, 10, 2.5), mt, 1, 1, 1, 0, 0, 0));
        const tube = new T.Group(); tube.position.set(3, 3, 0); tube.rotation.z = 0.75; g.add(tube);
        tube.add(part(s.cyl, cm, 5, 22, 5, 0, 10, 0));
        tube.add(part(s.cyl, dk, 6, 3, 6, 0, 21, 0));
        tube.add(part(s.cyl, lt, 5.3, 2, 5.3, 0, 4, 0));
        add(part(s.box, s.yellow, 6, 1.2, 10.4, 0, -3.5, 0));
        break;
      }
      case 'fist': {
        // 重拳手套
        add(outlined(rbox(9, 6, 6, 2), mt, 1, 1, 1, 2, 0, 0));
        add(outlined(rbox(10, 10, 10, 3.5), cm, 1, 1, 1, 11, 0, 0));
        for (let i = 0; i < 4; i++) add(part(s.box, lt, 1.6, 2, 2, 16.2, 3.6 - i * 2.4, 0));
        add(part(s.box, dk, 6, 2, 10.6, 9, -4.6, 0));
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
      // ---- 1.1：防暴盾卫（警棍 + 大盾牌） ----
      case 'riot': {
        add(outlined(rbox(9, 6, 6, 2), mt, 1, 1, 1, 2, 0, 0));
        cylX(dk, 1.3, 14, 12, 0, 0);
        g.userData.tip = add(part(s.sph, basic(0x7af0ff, { transparent: true, opacity: 0.9 }), 1.8, 1.8, 1.8, 19.5, 0, 0));
        const sh = add(outlined(rbox(3, 26, 20, 2), toon(0x2a2d3a), 1, 1, 1, 9, -2, 13));
        sh.rotation.y = -0.25;
        const win = add(part(s.box, toon(color, { emissive: new T.Color(color).multiplyScalar(0.25) }), 3.4, 6, 14, 9.2, 5, 13)); win.rotation.y = -0.25;
        const st2 = add(part(s.box, s.yellow, 3.4, 2.2, 20.4, 9.2, -9, 13)); st2.rotation.y = -0.25;
        break;
      }
      // ---- S1 灰城重涂：赛季机甲 ----
      case 'dozer': {
        // 推土铲：一块宽大的弧形铲斗挡在前面
        add(outlined(rbox(10, 8, 8, 2.5), mt, 1, 1, 1, 1, 0, 0));
        add(part(s.box, dk, 10, 2, 2, 8, -2, 4)); add(part(s.box, dk, 10, 2, 2, 8, -2, -4));
        const blade = add(outlined(rbox(3.2, 16, 26, 1.4), cm, 1, 1, 1, 16, -1, 0)); blade.rotation.z = 0.22;
        for (let i = -1; i <= 1; i++) add(part(s.box, dk, 1.2, 12, 2, 17.8, 0, i * 8)).rotation.z = 0.22;
        add(part(s.box, s.yellow, 2.4, 3, 26, 17.6, -7, 0));
        for (let i = -2; i <= 2; i++) add(part(s.box, mt, 3, 2, 2, 19, -9.5, i * 5.5));    // 铲齿
        add(part(s.box, dk, 1.2, 14, 1.2, 15.5, 2, 11)); add(part(s.box, dk, 1.2, 14, 1.2, 15.5, 2, -11));
        break;
      }
      case 'flamer': {
        // 背着燃料罐的喷火枪：粗枪身 + 喇叭口 + 小火苗
        add(outlined(rbox(14, 6, 6, 2), mt, 1, 1, 1, 5, 0, 0));
        { const tank = part(s.cyl, cm, 4.5, 14, 4.5, -2, 6, 0); tank.rotation.z = Math.PI / 2; add(tank); }
        { const cap = part(s.sph, dk, 4.6, 4.6, 4.6, 5, 6, 0); add(cap); }
        add(part(s.box, s.yellow, 1.2, 9.4, 9.4, -2, 6, 0));
        const nz = add(new T.Mesh(new T.CylinderGeometry(3.6, 1.8, 6, 12, 1, true), toon(0x2a2d3a, { side: T.DoubleSide })));
        nz.rotation.z = -Math.PI / 2; nz.position.set(15, 0.4, 0);
        g.userData.tip = add(part(s.sph, basic(0xff9a2e, { transparent: true, opacity: 0.85 }), 2.2, 2.2, 2.2, 18.5, 0.4, 0));
        add(outlined(rbox(4, 7, 3.4, 1.2), dk, 1, 1, 1, 1, -5, 0));
        break;
      }
      case 'carrier': {
        // 肩上的无人机发射架：三个小机库 + 停着的无人机
        add(outlined(rbox(14, 9, 12, 2.5), mt, 1, 1, 1, 2, 2, 0));
        for (let i = -1; i <= 1; i++) {
          add(outlined(rbox(5, 4, 3.4, 1), dk, 1, 1, 1, 8, 6.5, i * 4));
          add(part(s.sph, cm, 1.6, 1, 1.6, 10.5, 9, i * 4));
          const rot = part(s.cyl, lt, 2.6, 0.3, 2.6, 10.5, 9.8, i * 4); add(rot);
        }
        add(part(s.box, s.yellow, 14.4, 1.2, 1.2, 2, -2.4, 6.2));
        { const ant = add(part(s.cyl, s.metal, 0.6, 9, 0.6, -3, 10, -4)); ant.rotation.z = 0.3; }
        g.userData.tip = add(part(s.sph, basic(0x7af0ff, { transparent: true, opacity: 0.9 }), 1.4, 1.4, 1.4, -4.4, 14.4, -4));
        break;
      }
      case 'wrecker': {
        // 拆楼大锤：长柄 + 方锤头
        add(outlined(rbox(8, 6, 6, 2), mt, 1, 1, 1, 1, 0, 0));
        cylX(dk, 1.4, 24, 14, 0, 0);
        add(outlined(rbox(9, 12, 12, 2.6), cm, 1, 1, 1, 27, 0, 0));
        add(part(s.box, mt, 10, 2, 12.6, 27, 4.4, 0)); add(part(s.box, mt, 10, 2, 12.6, 27, -4.4, 0));
        add(part(s.box, s.yellow, 2, 12.6, 2, 31.6, 0, 0));
        break;
      }
      case 'megaphone': {
        // 巨型喇叭：喇叭口朝前，侧面一个音箱
        add(outlined(rbox(10, 8, 8, 2.5), mt, 1, 1, 1, 1, 0, 0));
        const horn = add(new T.Mesh(new T.CylinderGeometry(9.5, 3, 16, 16, 1, true), toon(color, { side: T.DoubleSide })));
        horn.rotation.z = -Math.PI / 2; horn.position.set(13, 1, 0); horn.castShadow = true;
        const rim = add(new T.Mesh(new T.TorusGeometry(9.5, 1, 6, 18), dk)); rim.rotation.y = Math.PI / 2; rim.position.set(21, 1, 0);
        add(part(s.sph, dk, 3, 3, 3, 6, 1, 0));
        add(outlined(rbox(6, 7, 4, 1.4), dk, 1, 1, 1, 0, 0, -7));
        add(part(s.cyl, lt, 2.2, 0.6, 2.2, 0, 0, -9.3)).rotation.x = Math.PI / 2;
        add(part(s.box, s.yellow, 1.2, 8.4, 8.4, 4, 0, 0));
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
      renderer.setPixelRatio(Math.min(HQ ? 1.5 : 1, window.devicePixelRatio || 1) * (typeof DYN === 'object' ? DYN.scale : 1));
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
  // 驾驶员 3D 角色（1.3）：大头、短身、粗描边的卡通全身模型
  // 坐标：脚底 y = 0，面朝 +x，+z 是右手边（拿武器的手）
  // 层级：root → hips(腿) / torso → head、armL、armR(随身武器)
  // =====================================================================
  const CH = { hip: 7.2, chest: 8, shoulder: 6.4, headY: 9.6, headR: 5.7 };
  // 头发、帽子、配件（沿用原来驾驶舱小人头的造型，头的中心在 (0, 0.4, 0)，半径约 4.3）
  function headDecor(g, P, headCosmetic, teamColor) {
    const hair = toon(P.hair), hair2 = toon(P.hair2), acc = toon(P.accent);
    const sph = SH.sph;
    const add = (o) => { g.add(o); return o; };
    const cap = add(part(SH.sphH, hair, 4.75, 4.4, 4.75, -0.75, 1.5, 0));
    cap.scale.set(4.75, 4.4, 4.75);
    for (let i = -2; i <= 2; i++) {
      const b = add(part(SH.cone, hair, 1.25, 3.2, 1.35, 3.25, 2.75 - Math.abs(i) * 0.22, i * 1.2));
      b.rotation.z = Math.PI - 0.55; b.rotation.x = i * 0.14;
    }
    switch (P.style) {
      case 'spiky':
        for (let i = 0; i < 9; i++) {
          const a = (i / 8) * Math.PI * 1.25 - 0.2, s2 = add(part(SH.cone, hair, 1.5, 5, 1.5, -1.6 * Math.cos(a) - 0.6, 3.6 + Math.sin(a) * 1.2, (i - 4) * 1.05));
          s2.rotation.z = 0.9 + Math.cos(a) * 0.5; s2.rotation.x = (i - 4) * 0.22;
        }
        break;
      case 'swept': {
        const b = add(part(sph, hair, 1.6, 3.6, 2.4, 3.3, 0.9, 1.6)); b.rotation.x = -0.3;
        add(part(sph, hair, 2.2, 4, 1.4, -0.4, -2, -3.7)); add(part(sph, hair, 2.2, 4, 1.4, -0.4, -2, 3.7));
        break;
      }
      case 'twintail':
        for (const z of [-1, 1]) {
          const t2 = add(part(SH.sphH, hair, 1.9, 5.8, 1.9, -1.3, -2.8, z * 5.7)); t2.rotation.x = -z * 0.35;
          add(part(sph, hair2, 1.2, 1.6, 1.2, -1.3, -7.6, z * 6.9));
          add(part(sph, acc, 0.95, 0.95, 0.95, -1.0, 2.2, z * 4.8));
        }
        break;
      case 'dreads':
        for (let i = 0; i < 9; i++) {
          const a = (i / 8 - 0.5) * 2.9;
          const d2 = add(part(SH.cyl, hair2, 0.6, 6, 0.6, -3.4 * Math.cos(a) - 0.8, -1.2, 3.6 * Math.sin(a))); d2.rotation.z = -0.25 * Math.cos(a); d2.rotation.x = 0.25 * Math.sin(a);
          add(part(sph, toon(P.accent), 0.7, 0.5, 0.7, -3.6 * Math.cos(a) - 0.8, -3.9, 3.8 * Math.sin(a)));
        }
        break;
      case 'hood': {
        const h2 = add(part(SH.sphH, toon(0x2e2442), 5.4, 5.4, 5.4, -1.3, 1.0, 0)); h2.scale.set(5.2, 5.4, 5.6);
        const rim = add(new T.Mesh(new T.TorusGeometry(4.6, 0.5, 6, 18), acc)); rim.rotation.y = Math.PI / 2; rim.position.set(1.7, 0.9, 0);
        for (const z of [-1, 1]) add(part(SH.cone, toon(0x2e2442), 1.3, 2.4, 1.3, -1.6, 5.8, z * 2.6)).rotation.x = z * 0.4;   // 兜帽上的猫耳
        break;
      }
      case 'braid':
        for (let i = 0; i < 6; i++) add(part(sph, hair, 1.35 - i * 0.08, 1.45, 1.35 - i * 0.08, 0.4 - i * 0.35, -1.5 - i * 2.1, 4.5));
        add(part(sph, acc, 0.9, 0.7, 0.9, -1.8, -14.2, 4.5));
        break;
      case 'undercut': {
        const sw = add(part(sph, hair, 3.4, 2.2, 4.6, 0.8, 3.7, 0.9)); sw.rotation.x = -0.28;
        add(part(sph, hair2, 4.3, 2.4, 4.4, -0.9, -0.6, 0));
        break;
      }
      case 'chef':
        add(part(SH.cylH, SH.white, 4.4, 4, 4.4, -0.4, 6, 0));
        for (const [x, z] of [[0, 0], [-1.6, 2.2], [-1.6, -2.2], [1.4, 1.8], [1.4, -1.8]]) add(part(SH.sphH, SH.white, 2.6, 2.4, 2.6, x - 0.4, 9, z));
        break;
      case 'veteran':
        add(part(SH.sphH, hair2, 3.6, 2.7, 3.9, 0.9, -2.0, 0));                  // 胡子
        add(part(sph, SH.dark, 0.5, 1.5, 1.3, 4.25, 0.5, 1.7));                  // 眼罩
        { const st = add(part(SH.box, SH.dark, 0.25, 0.35, 9, 2.6, 1.6, 0)); st.rotation.x = -0.35; }
        break;
      case 'buns':
        for (const z of [-3.3, 3.3]) { add(part(SH.sphH, hair, 2.3, 2.3, 2.3, -0.8, 5.2, z)); add(part(SH.cylH, acc, 1.6, 0.6, 1.6, -0.8, 3.4, z * 0.94)); }
        break;
      case 'ponytail': {
        const t2 = add(part(SH.sphH, hair, 1.9, 6.4, 1.9, -4.8, 0.2, 0)); t2.rotation.z = -1.0;
        add(part(sph, acc, 1.05, 1.05, 1.05, -3.7, 2.9, 0));
        break;
      }
    }
    if (P.id === 'hex') add(part(SH.box, toon(P.accent, { emissive: new T.Color(P.accent).multiplyScalar(0.5), transparent: true, opacity: 0.8 }), 0.6, 1.4, 5.2, 4.6, 0.4, 0));
    if (P.id === 'blaze' || P.id === 'aurora' || P.id === 'gale') {
      const band = add(new T.Mesh(new T.TorusGeometry(4.45, 0.42, 6, 22), SH.dark)); band.rotation.x = Math.PI / 2; band.rotation.z = 0.35; band.position.y = 3.2;
      for (const z of [-1.7, 1.7]) { const gg = add(new T.Mesh(new T.TorusGeometry(1.2, 0.48, 8, 14), SH.dark)); gg.rotation.y = Math.PI / 2 - 0.2; gg.position.set(2.7, 3.7, z); add(part(sph, toon(P.accent, { emissive: new T.Color(P.accent).multiplyScalar(0.4) }), 0.5, 1.05, 1.05, 2.8, 3.7, z)); }
    }
    if (P.id === 'candy') for (const z of [-1, 1]) { const e = add(part(SH.cone, SH.white, 1.4, 2.6, 1.0, -0.4, 5.0, z * 2.5)); e.rotation.x = z * 0.35; add(part(SH.cone, toon(0xff9ad0), 0.8, 1.6, 0.5, -0.3, 4.8, z * 2.55)).rotation.x = z * 0.35; }
    if (P.id === 'titan') { const band = add(new T.Mesh(new T.TorusGeometry(4.5, 0.6, 6, 20), acc)); band.rotation.x = Math.PI / 2; band.rotation.z = 0.15; band.position.y = 2.2; }
    if (P.id === 'flag') { const b = add(part(SH.sphH, acc, 4.9, 1.8, 4.9, -0.3, 5.0, 0.6)); b.rotation.z = 0.25; add(part(sph, SH.yellow, 0.75, 0.75, 0.75, 1.6, 5.4, -1.8)); }
    if (P.id === 'hammer') { add(part(SH.sphH, SH.yellow, 4.95, 3.6, 4.95, -0.2, 4.4, 0)); add(part(SH.cylH, SH.yellow, 6.2, 0.5, 6.2, 0.4, 3.2, 0)); add(part(SH.box, toon(0xffffff), 1.4, 1, 1.4, 3.4, 5.2, 0)); }
    if (P.id === 'han') { add(part(SH.box, toon(0x7af0ff, { emissive: new T.Color(0x3a8aa8), transparent: true, opacity: 0.75 }), 0.6, 1.2, 4.8, 4.5, 0.7, 0)); add(part(sph, SH.dark, 0.7, 0.9, 0.7, 0, 0.6, 4.5)); }
    if (P.id === 'echo') for (const z of [-1, 1]) { add(part(SH.cylH, SH.dark, 1.9, 1.2, 1.9, 0, 1.4, z * 4.6)).rotation.x = Math.PI / 2; add(part(sph, acc, 1.2, 1.2, 0.6, 0, 1.4, z * 5.3)); if (z > 0) { const band = add(new T.Mesh(new T.TorusGeometry(4.6, 0.45, 6, 16, Math.PI), SH.dark)); band.rotation.y = Math.PI / 2; band.position.y = 1.6; } }
    if (P.id === 'vet') { add(part(SH.sphH, toon(0x5a6a3a), 4.7, 1.9, 4.7, -0.2, 4.2, 0)); add(part(SH.box, toon(0x5a6a3a), 3, 0.4, 5, 3.4, 3.6, 0)); add(part(sph, SH.gold, 0.6, 0.6, 0.6, 3.6, 4.6, 0)); }
    if (headCosmetic) { const hc = new T.Group(); hc.position.set(-0.5, 4.6, 0); hc.scale.setScalar(0.4); g.add(hc); buildHead(hc, headCosmetic, teamColor); }
  }

  // 脸：大眼睛（白底 + 虹膜 + 瞳孔 + 两个高光）、眉毛、鼻子、嘴、腮红、耳朵
  function buildFace(g, P, R) {
    const add = (o) => { g.add(o); return o; };
    const skin = toon(P.skin), skinD = toon(new T.Color(P.skin).lerp(new T.Color(0x8a4a6a), 0.3));
    const brow = toon(new T.Color(P.hair2).lerp(new T.Color(0x14101c), 0.35));
    add(outlined(SH.sphH, skin, R * 0.98, R * 0.95, R, 0, 0, 0, 1.2));
    for (const z of [-1, 1]) add(part(SH.sphH, skin, 1.0, 1.45, 0.75, -0.3, -0.2, z * R * 0.97));   // 耳朵
    const S0 = P.eyeShape;
    const eyeH = S0 === 'round' ? 2.0 : S0 === 'sharp' ? 1.5 : S0 === 'cool' || S0 === 'sleepy' ? 1.35 : 1.75, eyeW = S0 === 'round' ? 1.45 : 1.3;
    const ez = 2.05, ex = R * 0.86;
    for (const z of [-1, 1]) {
      if (S0 === 'happy') {
        const arc = add(new T.Mesh(new T.TorusGeometry(0.95, 0.28, 6, 12, Math.PI), SH.dark));
        arc.rotation.y = Math.PI / 2; arc.position.set(ex + 0.55, 0.0, z * ez);
        continue;
      }
      add(part(SH.sphH, SH.eyeW, 0.9, eyeH, eyeW, ex, 0.15, z * ez));
      add(part(SH.sphH, toon(P.eye), 0.75, eyeH * 0.78, eyeW * 0.72, ex + 0.35, 0.0, z * (ez - 0.12)));
      add(part(SH.sphH, SH.pupil, 0.6, eyeH * 0.42, eyeW * 0.38, ex + 0.62, -0.05, z * (ez - 0.14)));
      add(part(SH.sph, SH.glowW, 0.3, 0.42, 0.38, ex + 0.85, eyeH * 0.32, z * (ez - 0.12) - 0.32));
      add(part(SH.sph, SH.glowW, 0.22, 0.2, 0.2, ex + 0.85, -eyeH * 0.3, z * (ez - 0.12) + 0.3));
      // 眼皮：冷淡 / 困倦的半闭眼，凶的上挑眼线
      if (S0 === 'cool' || S0 === 'sleepy') { const lid = add(part(SH.sphH, skin, 1.0, eyeH * 0.62, eyeW * 1.12, ex + 0.1, eyeH * (S0 === 'sleepy' ? 0.52 : 0.62), z * ez)); lid.userData.lid = true; }
      const line = add(part(SH.box, SH.dark, 0.35, 0.32, eyeW * 1.9, ex + 0.62, eyeH * (S0 === 'sleepy' ? 0.12 : S0 === 'cool' ? 0.28 : 0.86), z * ez));
      line.rotation.x = z * (S0 === 'sharp' ? 0.32 : S0 === 'cool' ? 0.12 : -0.05);
    }
    // 眉毛
    const bt = { sharp: 0.38, bold: 0.3, cool: 0.08, sleepy: -0.12, round: -0.22, happy: -0.2 }[S0] || 0;
    for (const z of [-1, 1]) {
      const b = add(part(SH.box, brow, 0.45, S0 === 'bold' ? 0.7 : 0.45, 1.7, R * 0.84 + 0.55, eyeH * 0.5 + 1.25, z * 2.0));
      b.rotation.x = z * bt;
    }
    add(part(SH.sph, skinD, 0.4, 0.33, 0.42, R * 0.98, -1.05, 0));                     // 鼻子
    for (const z of [-1, 1]) add(part(SH.sph, SH.blush, 0.3, 0.55, 0.95, R * 0.86, -1.25, z * 3.05));   // 腮红
    // 嘴
    const my = -2.25, mx = R * 0.9;
    switch (P.mouth) {
      case 'grin': {   // 咧嘴大笑：张开的 D 形嘴 + 上排牙 + 舌头
        const m = add(part(SH.sphH, SH.mouth, 0.55, 1.15, 1.65, mx, my - 0.15, 0)); m.userData.mouth = true;
        add(part(SH.box, SH.eyeW, 0.5, 0.42, 2.4, mx + 0.32, my + 0.55, 0));
        add(part(SH.sph, SH.tongue, 0.35, 0.4, 0.9, mx + 0.3, my - 0.75, 0));
        break;
      }
      case 'open': {
        add(part(SH.sphH, SH.mouth, 0.55, 1.05, 1.25, mx, my, 0));
        add(part(SH.sph, SH.tongue, 0.4, 0.45, 0.8, mx + 0.25, my - 0.45, 0));
        break;
      }
      case 'smirk': { const m = add(new T.Mesh(new T.TorusGeometry(0.95, 0.2, 6, 10, Math.PI * 0.75), SH.dark)); m.rotation.y = Math.PI / 2; m.rotation.x = Math.PI + 0.35; m.position.set(mx + 0.25, my + 0.55, 0.45); break; }
      case 'smile': { const m = add(new T.Mesh(new T.TorusGeometry(1.0, 0.2, 6, 12, Math.PI), SH.dark)); m.rotation.y = Math.PI / 2; m.rotation.x = Math.PI; m.position.set(mx + 0.25, my + 0.6, 0); break; }
      default: add(part(SH.box, SH.dark, 0.3, 0.26, 1.3, mx + 0.25, my + 0.1, 0));
    }
  }

  // 每套衣服：上衣、袖子、裤子、鞋子、额外细节
  const OUTFITS = {
    jacket:   { top: '#e8382f', inner: '#f4efe6', pants: '#2a2d3a', shoes: '#e8382f', sleeve: 'long', open: true },
    coat:     { top: '#e6eef8', inner: '#3a4a66', pants: '#2c3448', shoes: '#3a4a66', sleeve: 'long', coat: true },
    idol:     { top: '#ff6ec4', inner: '#ffffff', pants: '#ffe1f2', shoes: '#ffffff', sleeve: 'short', skirt: '#ff9ad6' },
    tank:     { top: '#3a3d48', inner: '#3a3d48', pants: '#5a6a3a', shoes: '#2a221c', sleeve: 'none', buff: true },
    hoodie:   { top: '#3a2c55', inner: '#2a2040', pants: '#1f1b2a', shoes: '#8a6cff', sleeve: 'long', pocket: true },
    engineer: { top: '#f4efe6', inner: '#2bb8a8', pants: '#2bb8a8', shoes: '#ffb21f', sleeve: 'short', overall: true },
    aviator:  { top: '#8a5a34', inner: '#f4e6c8', pants: '#3a3226', shoes: '#4a3020', sleeve: 'long', fur: true },
    hacker:   { top: '#1d1f2c', inner: '#7af0ff', pants: '#2a2d3a', shoes: '#7af0ff', sleeve: 'long', neon: true },
    chefcoat: { top: '#ffffff', inner: '#ffffff', pants: '#3a3d48', shoes: '#2a2d3a', sleeve: 'long', chef: true, wide: true },
    military: { top: '#5a6a3a', inner: '#7a8a52', pants: '#4a5530', shoes: '#2a221c', sleeve: 'long', medals: true },
    kid:      { top: '#ffd23f', inner: '#ff7ab8', pants: '#5a8cff', shoes: '#ff7ab8', sleeve: 'short', backpack: true },
    rebel:    { top: '#5b5e68', inner: '#2a2d36', pants: '#2a2d36', shoes: '#ff5a36', sleeve: 'long', scarf: '#ff5a36' },
    worker:   { top: '#ff8a1f', inner: '#3a4a66', pants: '#3a4a66', shoes: '#4a3020', sleeve: 'long', vest: true },
    dj:       { top: '#1fd6ee', inner: '#1d1f2c', pants: '#1d1f2c', shoes: '#ff3ea5', sleeve: 'long', chain: true },
    security: { top: '#23252f', inner: '#3a3d48', pants: '#23252f', shoes: '#14151d', sleeve: 'long', armor: true },
    // 1.4：卡卡的魔术师燕尾服；夏日系列皮肤
    magician: { top: '#2a1f3a', inner: '#ffffff', pants: '#1d1a26', shoes: '#141018', sleeve: 'long', tailcoat: true, bowtie: '#ff3b52', cape: '#8f1a3a' },
    surf:     { top: '#1fd6ee', inner: '#ffffff', pants: '#ff8a1f', shoes: '#ffd23f', sleeve: 'short', hawaii: '#ffe14d', shorts: true },
    swim:     { top: '#ff6ec4', inner: '#ffe14d', pants: '#ff6ec4', shoes: '#ffffff', sleeve: 'none', swim: true, shorts: true, skirt: '#ffe14d' },
    sorbet:   { top: '#e8faff', inner: '#7af0ff', pants: '#bff3ff', shoes: '#7af0ff', sleeve: 'short', skirt: '#bff3ff', ice: true },
    // 1.8：夜都术师学院制服（原创设计）
    academy:  { top: '#1d2140', inner: '#8a6bff', pants: '#1d2140', shoes: '#14151d', sleeve: 'long', coat: true, gakuran: '#d8b25a' },
    academyH: { top: '#16141c', inner: '#ff2d4b', pants: '#16141c', shoes: '#2a2430', sleeve: 'long', gakuran: '#c8c8d0', hood: '#16141c' },
    academyW: { top: '#eef0fa', inner: '#8a6bff', pants: '#1d2140', shoes: '#1d2140', sleeve: 'long', coat: true, gakuran: '#d8b25a', haori: '#8a6bff' },
    // 1.9：排位赛季传说「烈士·不灭战旗」——深色长大衣 + 金扣 + 红色围巾
    martyr:   { top: '#2a2420', inner: '#c8102e', pants: '#1d1a18', shoes: '#2a2420', sleeve: 'long', coat: true, gakuran: '#ffd35e', scarf: '#c8102e' },
  };

  // 随身武器模型：枪口朝 +x，握把在原点
  function buildSidearm(g, pid, P, teamColor) {
    const add = (o) => { g.add(o); return o; };
    const dk = toon(0x2a2d3a), acc = toon(P.accent), tc = toon(teamColor), gl = (c) => basic(c);
    switch (pid) {
      case 'fu': {   // 1.8 符纸飞镖：一叠扇形符纸
        for (let i = -1; i <= 1; i++) { const t = add(part(SH.box, toon(0xf4e6c8), 3.6, 0.15, 1.5, 1.8, 0.4 + i * 0.1, i * 0.7)); t.rotation.y = i * 0.35; add(part(SH.box, toon(0x8a6bff), 2.2, 0.2, 0.4, 1.9, 0.5 + i * 0.1, i * 0.7)).rotation.y = i * 0.35; }
        break;
      }
      case 'aka': {  // 1.8 断骨短镰
        add(part(SH.cylH, toon(0x2a2430), 0.35, 4, 0.35, 0, 0.5, 0)).rotation.z = Math.PI / 2;
        { const bl = add(new T.Mesh(new T.TorusGeometry(2.4, 0.45, 5, 12, Math.PI * 0.9), toon(0xdfe6ee))); bl.position.set(2.2, 2.2, 0); bl.rotation.z = -0.4; }
        add(part(SH.box, basic(0xff2d4b), 0.6, 0.3, 0.5, 3.6, 3.4, 0));
        break;
      }
      case 'blaze': case 'flag': {
        add(outlined(rbox(4.2, 1.7, 1.1, 0.5), pid === 'flag' ? toon(0xff8a1f) : acc, 1, 1, 1, 1.7, 0.7, 0));
        add(part(SH.box, dk, 1.1, 2.4, 1, 0, -0.5, 0));
        if (pid === 'flag') add(part(SH.cylH, dk, 1.1, 1.4, 1.1, 4.2, 0.8, 0)).rotation.z = Math.PI / 2;
        add(part(SH.sph, gl(pid === 'flag' ? 0xffe600 : 0xffb21f), 0.5, 0.5, 0.5, 4.0 + (pid === 'flag' ? 0.8 : 0), 0.8, 0));
        break;
      }
      case 'frost': {
        add(outlined(rbox(5, 1.6, 1.1, 0.5), toon(0xdfe8f4), 1, 1, 1, 1.8, 0.6, 0));
        add(part(SH.cylH, dk, 0.4, 5, 0.4, 6.2, 0.9, 0)).rotation.z = Math.PI / 2;
        add(part(SH.cylH, toon(0x7ac8ff), 0.6, 2.4, 0.6, 2.4, 2.0, 0)).rotation.z = Math.PI / 2;
        add(part(SH.box, dk, 1, 2.2, 0.9, 0, -0.5, 0)); add(part(SH.box, toon(0xdfe8f4), 2.4, 1.3, 0.9, -1.6, 0.4, 0));
        break;
      }
      case 'candy': {
        add(outlined(SH.sphH, acc, 2.4, 1.7, 1.7, 1.8, 0.8, 0));
        add(part(SH.cone, toon(0xffe600), 1.4, 2.4, 1.4, 4.4, 0.8, 0)).rotation.z = -Math.PI / 2;
        add(part(SH.box, dk, 1, 2.2, 0.9, 0, -0.5, 0));
        add(part(SH.sph, gl(0xffffff), 0.6, 0.6, 0.6, 1.8, 2.3, 0));
        break;
      }
      case 'kaka':
        for (const k of [-1, 0, 1]) { const c = add(part(SH.box, toon(k ? 0xffffff : 0xff3b52), 2.6, 0.12, 1.8, 1.6, 0.4 + k * 0.2, k * 0.9)); c.rotation.y = k * 0.35; add(part(SH.box, basic(k ? 0xff3b52 : 0xffffff), 0.8, 0.14, 0.6, 1.6, 0.42 + k * 0.2, k * 0.9)); }
        break;
      case 'raven':
        for (const k of [-1, 0, 1]) { const d = add(part(SH.cone, toon(0x6a4cc8), 0.35, 4.2, 0.35, 2.2, 0.4 + k * 0.5, k * 0.5)); d.rotation.z = -Math.PI / 2 + k * 0.2; add(part(SH.cone, gl(0x2a1f3a), 0.5, 1.0, 0.18, 0.4, 0.4 + k * 0.5, k * 0.5)).rotation.z = -Math.PI / 2; }
        break;
      case 'aurora': {
        add(outlined(rbox(4.6, 2.2, 1.4, 0.5), toon(0xffb21f), 1, 1, 1, 1.8, 0.7, 0));
        add(part(SH.cylH, dk, 0.5, 1.6, 0.5, 4.7, 0.6, 0)).rotation.z = Math.PI / 2;
        add(part(SH.box, dk, 1.1, 2.6, 1, 0, -0.7, 0)); add(part(SH.box, toon(0x2bb8a8), 1.2, 1.8, 1.1, 2.2, -0.9, 0));
        break;
      }
      case 'gale': {
        add(part(SH.box, toon(0x8a5a34), 5, 0.9, 0.9, 1.6, 0.4, 0));
        const bow = add(new T.Mesh(new T.TorusGeometry(2.8, 0.32, 6, 16, Math.PI * 0.8), acc)); bow.rotation.y = Math.PI / 2; bow.rotation.x = Math.PI / 2 + 0; bow.position.set(3.6, 0.4, 0); bow.rotation.z = Math.PI * 0.6;
        add(part(SH.cylH, toon(0xf4efe6), 0.2, 5.4, 0.2, 2.6, 1.0, 0)).rotation.z = Math.PI / 2;
        add(part(SH.cone, gl(0x9cff2e), 0.35, 0.9, 0.35, 5.5, 1.0, 0)).rotation.z = -Math.PI / 2;
        break;
      }
      case 'hex': {
        add(outlined(rbox(3.6, 2, 1.3, 0.5), toon(0x2a2d3a), 1, 1, 1, 1.4, 0.7, 0));
        for (const z of [-0.35, 0.35]) add(part(SH.box, toon(0xcfd4e0), 1.4, 0.25, 0.25, 3.8, 0.9, z));
        add(part(SH.sph, gl(0x7af0ff), 0.6, 0.6, 0.6, 4.4, 0.9, 0));
        add(part(SH.box, gl(0x7af0ff), 2.4, 0.2, 1.35, 1.4, 1.4, 0));
        add(part(SH.box, dk, 1, 2.2, 0.9, 0, -0.5, 0));
        break;
      }
      case 'chef': {
        add(part(SH.cylH, dk, 0.45, 4, 0.45, 2, 0, 0)).rotation.z = Math.PI / 2;
        const pan = add(outlined(SH.cylH, toon(0x3a3d48), 3, 0.6, 3, 6.4, 0, 0)); pan.rotation.x = Math.PI / 2;
        add(part(SH.cylH, toon(0x1b1c26), 2.4, 0.2, 2.4, 6.4, 0, 0.35)).rotation.x = Math.PI / 2;
        break;
      }
      case 'vet': {
        add(outlined(SH.sphH, toon(0x5a7a3a), 1.5, 1.7, 1.5, 0.8, 1.0, 0));
        add(part(SH.cylH, dk, 0.7, 0.8, 0.7, 0.8, 2.8, 0));
        add(new T.Mesh(new T.TorusGeometry(0.5, 0.12, 6, 10), SH.gold)).position.set(1.4, 3.0, 0);
        break;
      }
      case 'yuzu': {
        add(outlined(rbox(2.6, 1.6, 1.6, 0.5), toon(0xffd23f), 1, 1, 1, 0.8, 0.4, 0));
        add(part(SH.cylH, dk, 0.15, 2.2, 0.15, 0.8, 2.2, 0.4));
        add(part(SH.sph, gl(0xff3ea5), 0.35, 0.35, 0.35, 0.8, 3.3, 0.4));
        break;
      }
      case 'echo': {
        add(outlined(rbox(3.2, 3, 2, 0.6), toon(0x1d1f2c), 1, 1, 1, 1.4, 0.8, 0));
        add(part(SH.cylH, acc, 1.1, 0.4, 1.1, 3.05, 0.8, 0)).rotation.z = Math.PI / 2;
        add(part(SH.cylH, gl(0xff3ea5), 0.5, 0.45, 0.5, 3.15, 0.8, 0)).rotation.z = Math.PI / 2;
        add(part(SH.box, gl(0x1fd6ee), 2.8, 0.25, 2.05, 1.4, -0.5, 0));
        break;
      }
      case 'han': {
        add(part(SH.cylH, dk, 0.55, 7, 0.55, 3, 0, 0)).rotation.z = Math.PI / 2;
        add(part(SH.cylH, toon(0x3a3d48), 0.75, 1.8, 0.75, 0, 0, 0)).rotation.z = Math.PI / 2;
        add(part(SH.sph, gl(0x7af0ff), 0.85, 0.85, 0.85, 6.6, 0, 0));
        break;
      }
      case 'hammer': {
        add(part(SH.cylH, toon(0x8a5a34), 0.5, 7.5, 0.5, 3.2, 0, 0)).rotation.z = Math.PI / 2;
        add(outlined(rbox(2.4, 4.2, 2.4, 0.5), toon(0x5b5e68), 1, 1, 1, 6.6, 0.4, 0));
        add(part(SH.box, SH.yellow, 2.5, 0.6, 2.5, 6.6, -0.6, 0));
        break;
      }
      default: { // 通用手枪
        add(outlined(rbox(4, 1.6, 1.1, 0.5), tc, 1, 1, 1, 1.6, 0.7, 0));
        add(part(SH.box, dk, 1.1, 2.4, 1, 0, -0.5, 0));
      }
    }
  }

  // opts.bust：只要上半身（驾驶舱里）
  function buildChar(pilotId, teamColor, headCosmetic, opts = {}) {
    shared();
    const P = S.pilot(pilotId), pid = P.id;
    const O = OUTFITS[P.outfit] || OUTFITS.jacket;
    const A = S.sidearm(pid);
    const mats = new Map();
    const M = (c) => { const k = String(c); if (!mats.has(k)) mats.set(k, toon(c)); return mats.get(k); };
    const skin = M(P.skin), top = M(O.top), inner = M(O.inner), pants = M(O.pants), shoes = M(O.shoes), team = M(teamColor), acc = M(P.accent);
    const root = new T.Group();
    const W0 = O.wide ? 1.18 : O.buff ? 1.1 : 1;
    // ---- 腿 ----
    const hips = dyn(new T.Group()); hips.position.y = CH.hip; root.add(hips);
    hips.add(outlined(SH.sphH, pants, 2.9 * W0, 2.1, 3.5 * W0, 0, 0.2, 0, 1));
    const legs = [];
    for (const side of [-1, 1]) {
      const lg = dyn(new T.Group()); lg.position.set(0, 0, side * 1.75 * W0); hips.add(lg);
      if (O.shorts) { lg.add(outlined(SH.cylH, pants, 1.35, 2.2, 1.35, 0, -1.3, 0, 1)); lg.add(outlined(SH.cylH, skin, 1.05, 2.8, 1.05, 0, -3.6, 0, 1)); }
      else lg.add(outlined(SH.cylH, pants, 1.25, 4.6, 1.25, 0, -2.6, 0, 1));
      lg.add(part(SH.cylH, team, 1.3, 0.6, 1.3, 0, -4.3, 0));
      lg.add(outlined(rbox(4.2, 2, 2.6, 0.9), shoes, 1, 1, 1, 0.7, -5.6, 0, 1));
      lg.add(part(SH.box, M('#f4efe6'), 4.3, 0.5, 2.7, 0.7, -6.4, 0));
      legs.push(lg);
    }
    if (opts.bust) hips.visible = false;
    // ---- 身体 ----
    const torso = dyn(new T.Group()); torso.position.y = CH.hip + 0.4; root.add(torso);
    const tb = new T.Group(); torso.add(tb);
    const TA = (o) => { tb.add(o); return o; };
    TA(outlined(SH.sphH, top, 3.2 * W0, 4.2, 3.9 * W0, 0, 3.6, 0, 1.1));
    if (O.skirt) { const sk = TA(outlined(SH.cone, M(O.skirt), 4.4, 3.2, 4.8, 0, 0.4, 0, 1)); sk.rotation.x = 0; TA(part(SH.cylH, M('#ffffff'), 4.5, 0.4, 4.9, 0, -1.1, 0)); }
    if (O.coat) { TA(outlined(SH.cone, top, 4.0, 5.4, 4.5, -0.3, -0.4, 0, 1)); TA(part(SH.box, inner, 0.4, 7, 1.0, 3.25, 2.4, 0)); }
    if (O.open) { TA(part(SH.box, inner, 0.6, 5.4, 2.6, 2.75, 3.2, 0)); for (const z of [-1, 1]) TA(part(SH.box, top, 1.2, 1.4, 1.6, 2.6, 6.6, z * 1.8)).rotation.x = z * 0.4; }
    if (O.overall) { TA(part(SH.box, inner, 0.7, 3.6, 4.2, 2.75, 2.0, 0)); for (const z of [-1, 1]) TA(part(SH.box, inner, 0.6, 3.6, 0.8, 2.4, 5.2, z * 1.5)); TA(part(SH.box, M('#ffb21f'), 0.8, 0.8, 0.8, 3.1, 3.2, 0)); }
    if (O.fur) TA(part(SH.sphH, inner, 3.4, 1.4, 4.0, 0.3, 7.1, 0));
    if (O.neon) for (const z of [-1, 1]) TA(part(SH.box, basic(O.inner), 0.3, 4.6, 0.3, 3.1, 3.4, z * 1.4));
    if (O.chef) { for (let i = 0; i < 3; i++) for (const z of [-0.9, 0.9]) TA(part(SH.sph, M('#3a3d48'), 0.35, 0.35, 0.35, 3.75 * W0, 5.2 - i * 1.4, z)); TA(part(SH.box, M('#f4efe6'), 0.5, 3.6, 4.4, 3.4, 0.8, 0)); TA(part(SH.box, M('#ff5a36'), 3.6, 0.9, 4.4 * W0, 0.2, 7.0, 0)); }
    if (O.medals) { TA(part(SH.box, inner, 0.5, 1.2, 1.4, 3.2, 5.6, -1.4)); for (let i = 0; i < 3; i++) TA(part(SH.sph, i ? M('#ff3e6c') : SH.gold, 0.45, 0.45, 0.25, 3.3, 4.4, -0.8 - i * 0.7)); TA(part(SH.box, M('#3a2a1c'), 3.4, 0.7, 4.2, 0, 1.0, 0)); }
    if (O.backpack) { TA(outlined(rbox(2.6, 4, 3.6, 1), inner, 1, 1, 1, -3.4, 3.8, 0, 1)); }
    if (O.scarf) { TA(new T.Mesh(new T.TorusGeometry(2.4, 0.9, 8, 16), M(O.scarf))).rotation.x = Math.PI / 2; tb.children[tb.children.length - 1].position.set(0.3, 7.0, 0); TA(part(SH.box, M(O.scarf), 0.8, 3.6, 1.4, -2.6, 5, 1.4)).rotation.x = 0.3; }
    if (O.vest) { for (const y of [2.2, 4.4]) TA(part(SH.cylH, SH.yellow, 3.3, 0.5, 4.0, 0, y, 0)); }
    if (O.chain) { const ch = TA(new T.Mesh(new T.TorusGeometry(2.0, 0.22, 6, 18), SH.gold)); ch.rotation.y = Math.PI / 2; ch.rotation.z = 0.25; ch.position.set(2.2, 5.6, 0); TA(part(SH.box, SH.gold, 0.4, 1.0, 1.0, 3.6, 3.8, 0)); }
    if (O.armor) { TA(outlined(rbox(1.4, 4.4, 4.8, 0.5), M('#3a3d48'), 1, 1, 1, 2.8, 3.6, 0, 1)); TA(part(SH.box, basic(0x7af0ff), 0.3, 0.4, 2.4, 3.55, 4.6, 0)); }
    if (O.pocket) TA(part(SH.box, inner, 0.5, 1.6, 3.0, 3.0, 1.6, 0));
    if (O.tailcoat) {   // 燕尾服：白衬衫 + 红领结 + 燕尾 + 披风
      TA(part(SH.box, inner, 0.6, 4.6, 2.2, 3.0, 4.4, 0));
      for (const z of [-1, 1]) TA(part(SH.box, top, 0.5, 4.6, 1.4, 3.05, 4.2, z * 1.6));
      for (const z of [-1, 1]) { const b = TA(part(SH.cone, M(O.bowtie), 0.9, 1.6, 0.9, 3.4, 6.9, z * 0.75)); b.rotation.x = z * Math.PI / 2; }
      TA(part(SH.sph, M(O.bowtie), 0.5, 0.5, 0.5, 3.45, 6.9, 0));
      for (const z of [-1, 1]) { const t = TA(part(SH.cone, top, 1.3, 5.5, 1.6, -2.2, -1.2, z * 1.2)); t.rotation.x = Math.PI; t.rotation.z = -0.2; }
      const cape = TA(outlined(rbox(1.2, 9, 8.4, 0.5), M(O.cape), 1, 1, 1, -3.4, 2.6, 0, 1)); cape.rotation.z = 0.12;
      for (const y of [3.4, 2.0]) TA(part(SH.sph, SH.gold, 0.3, 0.3, 0.3, 3.3, y, 0));
    }
    if (O.hawaii) {     // 夏威夷衬衫：大花朵 + 敞开的领子
      TA(part(SH.box, inner, 0.6, 5, 1.8, 3.0, 3.6, 0));
      for (const [y, z] of [[5.6, -2.2], [3.2, 2.4], [1.6, -1.6], [5.0, 2.0], [2.4, -2.8]]) { TA(part(SH.sph, M(O.hawaii), 0.3, 0.9, 0.9, 3.25, y, z)); TA(part(SH.sph, M('#ff3ea5'), 0.32, 0.35, 0.35, 3.35, y, z)); }
      for (const z of [-1, 1]) TA(part(SH.box, top, 1.2, 1.4, 1.8, 2.7, 6.7, z * 1.6)).rotation.x = z * 0.5;
    }
    if (O.swim) {       // 泳装：露出锁骨，胸前蝴蝶结 + 波点
      TA(part(SH.sphH, skin, 3.0, 1.6, 3.5, 0.2, 7.1, 0));
      TA(part(SH.box, M(O.inner), 0.5, 1.0, 2.6, 3.1, 5.6, 0));
      for (const [y, z] of [[4.4, -1.6], [3.0, 1.4], [2.0, -0.4], [4.0, 1.8]]) TA(part(SH.sph, M('#ffffff'), 0.25, 0.45, 0.45, 3.2, y, z));
    }
    if (O.ice) {        // 冰沙女王：冰晶肩甲 + 胸前宝石 + 渐变裙摆
      for (const z of [-1, 1]) for (let i = 0; i < 3; i++) { const c = TA(part(SH.cone, M('#7af0ff'), 0.7, 3 - i * 0.6, 0.7, -0.4 + i * 0.6, 7.6 + (2 - i) * 0.4, z * (3.2 + i * 0.25))); c.rotation.x = z * (0.5 + i * 0.25); }
      TA(part(SH.sph, basic(0xff6ec4), 0.6, 0.8, 0.8, 3.2, 5.0, 0));
      TA(part(SH.cylH, M('#7af0ff'), 4.6, 0.5, 5.0, 0, -0.6, 0));
    }
    if (O.gakuran) {    // 1.8 学院制服：高立领 + 一排扣子 + 衣摆内衬色
      TA(part(SH.cylH, top, 2.1, 1.5, 2.3, 0.2, 7.7, 0));
      TA(part(SH.cylH, M(O.inner), 2.15, 0.25, 2.35, 0.2, 8.4, 0));
      for (let i = 0; i < 4; i++) TA(part(SH.sph, M(O.gakuran), 0.42, 0.42, 0.42, 3.3 * W0, 6.0 - i * 1.35, 0));
    }
    if (O.hood) TA(outlined(SH.sphH, M(O.hood), 2.6, 2.3, 3.3, -1.7, 7.4, 0, 1));
    if (O.haori) for (const z of [-1, 1]) TA(part(SH.box, M(O.haori), 0.5, 6.6, 0.9, 3.2, 3.4, z * 1.9));
    // 队伍色：腰带 + 胸前徽章
    TA(part(SH.cylH, team, 3.15 * W0, 0.9, 3.8 * W0, 0, 0.9, 0));
    TA(part(SH.sph, team, 0.4, 1.0, 1.0, 3.0 * W0, 4.9, O.open ? 1.6 : -1.6));
    TA(part(SH.cylH, skin, 1.3, 1.6, 1.3, 0, 8.2, 0));
    // ---- 头 ----
    const headG = dyn(new T.Group()); headG.position.y = CH.headY + 4.3; torso.add(headG);
    buildFace(headG, P, CH.headR);
    const deco = new T.Group(); const k = CH.headR / 4.3; deco.scale.setScalar(k); deco.position.set(0, -0.4 * k, 0); headG.add(deco);
    headDecor(deco, P, headCosmetic, teamColor);
    const X = new Set(P.extra || []);
    // 卡卡：高礼帽 + 帽檐上插着一张扑克牌
    if (pid === 'kaka') {
      deco.add(part(SH.cylH, toon(0x141018), 3.6, 6, 3.6, -0.4, 7.4, 0)); deco.add(part(SH.cylH, toon(0x141018), 5.6, 0.5, 5.6, -0.2, 4.6, 0));
      deco.add(part(SH.cylH, toon(P.accent), 3.65, 1, 3.65, -0.4, 5.4, 0));
      const card = part(SH.box, toon(0xffffff), 0.15, 2.2, 1.6, 2.6, 6.2, 2.3); card.rotation.x = 0.3; deco.add(card);
      deco.add(part(SH.sph, basic(0xff3b52), 0.2, 0.45, 0.45, 2.72, 6.2, 2.3));
    }
    // 1.8 符零：发髻上插着红符 + 两根金发簪
    if (pid === 'fu') {
      const tag = part(SH.box, toon(0xf4e6c8), 0.2, 3.4, 1.4, -3.6, 5.4, 1.4); tag.rotation.x = 0.45; deco.add(tag);
      const st = part(SH.box, toon(0xc8102e), 0.25, 2.2, 0.4, -3.66, 5.4, 1.4); st.rotation.x = 0.45; deco.add(st);
      for (const z of [-0.8, 0.8]) { const pin = part(SH.cylH, toon(0xd8b25a), 0.15, 4.2, 0.15, -3.2, 6.4, z); pin.rotation.z = 1.1; deco.add(pin); }
    }
    // 1.8 赤镰：眼下的红色咒纹
    if (pid === 'aka') for (const [y, z] of [[-0.9, -1.9], [-1.5, -1.6]]) headG.add(part(SH.box, basic(0xff2d4b), 0.25, 0.22, 1.1, CH.headR * 0.93, y, z));
    if (X.has('moonpin')) { const mn = new T.Mesh(new T.TorusGeometry(1.5, 0.4, 6, 14, Math.PI * 1.3), basic(0xffd35e)); mn.position.set(-1.2, 6.6, 3.4); mn.rotation.y = 0.4; deco.add(mn); }
    if (X.has('halfmask')) {   // 恶灵觉醒：半边骨质面具
      headG.add(outlined(SH.sphH, toon(0xe8e2d6), 0.8, 2.4, 2.3, CH.headR * 0.84 + 0.4, 0.4, 1.7, 0.8));
      headG.add(part(SH.box, basic(0xff2d4b), 0.3, 0.35, 1.2, CH.headR * 0.84 + 1.2, 0.8, 1.8));
      for (const z of [-1, 1]) { const hn = part(SH.cone, basic(0xff2d4b, { transparent: true, opacity: 0.8 }), 0.9, 4, 0.9, -0.6, 7.2, z * 2.4); hn.rotation.x = z * 0.5; deco.add(hn); }
    }
    if (X.has('sunglasses')) {   // 墨镜
      const lx = CH.headR * 0.86 + 1.25;
      for (const z of [-2.1, 2.1]) headG.add(outlined(SH.sphH, toon(0x1b1530), 0.55, 1.45, 1.75, lx, 0.25, z, 0.8));
      headG.add(part(SH.box, toon(0x141018), 0.4, 0.35, 1.4, lx, 0.55, 0));
      for (const z of [-2.1, 2.1]) headG.add(part(SH.sph, basic(0x7af0ff), 0.12, 0.5, 0.8, lx + 0.5, 0.7, z - 0.4));
    }
    if (X.has('strawhat')) {     // 草帽 + 粉色缎带
      deco.add(part(SH.cylH, toon(0xf2d38a), 7.6, 0.45, 7.6, -0.4, 4.8, 0));
      deco.add(part(SH.sphH, toon(0xf2d38a), 4.4, 2.6, 4.4, -0.4, 5.6, 0));
      deco.add(part(SH.cylH, toon(0xff6ec4), 4.5, 0.8, 4.5, -0.4, 5.3, 0));
      const bow = part(SH.sph, toon(0xff6ec4), 0.8, 1.2, 1.6, -0.2, 5.4, 4.4); deco.add(bow);
    }
    if (X.has('icecrown')) {     // 冰晶王冠
      const im = toon(0x7af0ff, { emissive: new T.Color(0x2a8aa8), transparent: true, opacity: 0.9 });
      for (let i = 0; i < 7; i++) { const a = (i / 7) * Math.PI * 2, h = i % 2 ? 2 : 3.4; const c = part(SH.cone, im, 0.7, h, 0.7, -0.4 + Math.cos(a) * 3.6, 6.2 + h / 2, Math.sin(a) * 3.6); deco.add(c); }
      deco.add(part(SH.cylH, im, 3.9, 0.7, 3.9, -0.4, 6.0, 0));
      deco.add(part(SH.sph, basic(0xff6ec4), 0.6, 0.8, 0.6, 3.2, 6.5, 0));
    }
    // ---- 手臂 ----
    const arms = [];
    const sleeve = O.sleeve === 'none' ? skin : top;
    for (const side of [-1, 1]) {
      const arm = dyn(new T.Group()); arm.position.set(0, CH.shoulder + 0.4, side * 3.9 * W0); torso.add(arm);
      arm.add(outlined(SH.sphH, sleeve, 1.5 * (O.buff ? 1.2 : 1), 1.5, 1.5 * (O.buff ? 1.2 : 1), 0, -0.3, 0, 1));
      arm.add(outlined(SH.cylH, O.sleeve === 'long' ? sleeve : skin, 1.05 * (O.buff ? 1.3 : 1), 4.4, 1.05 * (O.buff ? 1.3 : 1), 0, -2.6, 0, 1));
      if (O.sleeve === 'short') arm.add(part(SH.cylH, sleeve, 1.3, 1.6, 1.3, 0, -1.2, 0));
      if (O.sleeve === 'long') arm.add(part(SH.cylH, O.fur ? inner : team, 1.2, 0.6, 1.2, 0, -4.4, 0));
      const big = pid === 'titan';
      arm.add(outlined(SH.sphH, big ? acc : skin, big ? 2.1 : 1.3, big ? 2.1 : 1.3, big ? 2.1 : 1.3, 0, -5.4, 0, 1));
      if (big) arm.add(part(SH.box, M('#ffffff'), 0.5, 1.2, 2.6, 1.6, -5.4, 0));
      arms.push(arm);
    }
    if (X.has('warbanner')) {   // 背后插着一面金边战旗
      const fb = new T.Group(); fb.position.set(-3.6, 4, -1.6); fb.rotation.z = 0.12; tb.add(fb);
      fb.add(part(SH.cylH, M('#3a2a1c'), 0.25, 22, 0.25, 0, 9, 0));
      fb.add(outlined(rbox(0.4, 7, 9, 0.2), M('#c8102e'), 1, 1, 1, 0, 16, -4.6, 0.6));
      fb.add(part(SH.box, M('#ffd35e'), 0.5, 7.4, 0.5, 0, 16, -9.1)); fb.add(part(SH.box, M('#ffd35e'), 0.5, 0.5, 9.4, 0, 19.6, -4.6));
      fb.add(part(SH.sph, basic(0xffe14d), 0.3, 1.2, 1.2, 0.3, 16.5, -4.6));
    }
    if (X.has('sealband')) { arms[0].add(part(SH.cylH, M('#c8102e'), 1.25, 0.9, 1.25, 0, -1.6, 0)); arms[0].add(part(SH.box, M('#f4e6c8'), 0.5, 1.4, 1.0, 1.2, -1.6, 0)); }
    if (pid === 'aka') for (const y of [-2.4, -3.2, -4.0]) arms[0].add(part(SH.cylH, M('#f4efe6'), 1.12, 0.45, 1.12, 0, y, 0));   // 左臂缠着绷带
    if (X.has('surfboard')) { const sb = outlined(rbox(1.2, 13, 4.6, 0.6), M('#ffffff'), 1, 1, 1, -4.3, 4.6, 0, 1); sb.rotation.z = 0.12; tb.add(sb); tb.add(part(SH.box, M(P.accent), 1.3, 12, 1.2, -4.25, 4.6, 0)); tb.add(part(SH.box, M('#ff8a1f'), 1.3, 1.2, 4.7, -4.25, 9.4, 0)); }
    if (X.has('float')) { const ring = new T.Mesh(new T.TorusGeometry(4.2, 1.3, 10, 20), M('#ff6ec4')); ring.rotation.x = Math.PI / 2; ring.position.y = 1.2; tb.add(ring); for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2 + 0.4; tb.add(part(SH.sphH, M('#ffffff'), 1.35, 1.35, 1.35, Math.cos(a) * 4.2, 1.2, Math.sin(a) * 4.2)); } }
    if (X.has('parasol')) {   // 冰沙女王左手的小阳伞
      const ps = new T.Group(); ps.position.set(0, -5.4, 0); arms[0].add(ps);
      ps.add(part(SH.cylH, M('#ffffff'), 0.2, 12, 0.2, 0, 4, 0));
      ps.add(part(SH.cone, M('#bff3ff'), 6.5, 3, 6.5, 0, 10.6, 0));
      for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; ps.add(part(SH.sph, M(i % 2 ? '#ff6ec4' : '#7af0ff'), 0.7, 0.7, 0.7, Math.cos(a) * 6.3, 9.2, Math.sin(a) * 6.3)); }
      bake(ps);
    }
    // 随身武器放在右手；凌焰双枪，左手也有一把
    const prop = dyn(new T.Group()); prop.position.set(0, -5.4, 0); prop.rotation.z = -Math.PI / 2; arms[1].add(prop);
    if (pid !== 'titan') buildSidearm(prop, pid, P, teamColor);
    let propL = null;
    if (pid === 'blaze') { propL = dyn(new T.Group()); propL.position.set(0, -5.4, 0); propL.rotation.z = -Math.PI / 2; arms[0].add(propL); buildSidearm(propL, pid, P, teamColor); }
    // 枪口火光（开火 / 展示动作时闪一下）
    const flashes = [];
    if (A.kind === 'gun') for (const pg of [prop, propL]) {
      if (!pg) continue;
      root.updateMatrixWorld(true);
      const inv = new T.Matrix4().copy(pg.matrixWorld).invert(), m = new T.Matrix4(), bx = new T.Box3();
      let mx = 0;
      pg.traverse((o) => { if (o.isMesh && o.geometry && o.material !== OUTLINE) { o.geometry.computeBoundingBox(); m.multiplyMatrices(inv, o.matrixWorld); bx.copy(o.geometry.boundingBox).applyMatrix4(m); mx = Math.max(mx, bx.max.x); } });
      const tip = new T.Vector3(mx + 0.9, 0.75, 0);
      const fl = new T.Mesh(SH.sph, basic(0xfff36b, { transparent: true, opacity: 0.95, depthWrite: false, blending: T.AdditiveBlending }));
      fl.position.copy(tip); fl.scale.set(1.6, 1.1, 1.1); fl.visible = false; fl.userData.keep = true; pg.add(fl);
      flashes.push(fl);
    }
    // 小柚的迷你无人机跟在肩膀旁边
    let drone = null;
    if (pid === 'yuzu' && !opts.bust) {
      drone = dyn(new T.Group()); drone.position.set(-2, 27, -6); root.add(drone);
      drone.add(outlined(SH.sphH, M('#ffd23f'), 2.2, 1.4, 2.2, 0, 0, 0, 1));
      drone.add(part(SH.sph, basic(0x7af0ff), 0.9, 0.7, 0.9, 1.6, -0.2, 0));
      for (const [x, z] of [[2, 2], [2, -2], [-2, 2], [-2, -2]]) { drone.add(part(SH.cylH, M('#2a2d3a'), 0.2, 0.8, 0.2, x, 0.6, z)); drone.add(part(SH.cylH, basic(0xffffff, { transparent: true, opacity: 0.5 }), 1.4, 0.1, 1.4, x, 1.0, z)); }
      bake(drone);
    }
    // 传说皮肤：身边环绕的冰晶 / 符纸 / 恶灵火
    let orbit = null;
    if (X.has('talismans') && !opts.bust) {
      orbit = dyn(new T.Group()); orbit.position.y = 14; root.add(orbit);
      for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2, tg = new T.Group(); tg.position.set(Math.cos(a) * 10, (i % 2) * 3, Math.sin(a) * 10); tg.rotation.y = -a; tg.add(part(SH.box, basic(0xf4e6c8), 0.2, 4.4, 1.8, 0, 0, 0)); tg.add(part(SH.box, basic(0x8a6bff), 0.25, 2.6, 0.5, 0, 0, 0)); orbit.add(tg); }
    }
    if (X.has('wraith') && !opts.bust) {
      orbit = dyn(new T.Group()); orbit.position.y = 10; root.add(orbit);
      const fm = basic(0xff2d4b, { transparent: true, opacity: 0.55, depthWrite: false, blending: T.AdditiveBlending }), dm = basic(0x3a0a18, { transparent: true, opacity: 0.6, depthWrite: false });
      for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; const fl = part(SH.cone, i % 2 ? dm : fm, 2.2, 7, 2.2, Math.cos(a) * 8, 2 + (i % 2) * 3, Math.sin(a) * 8); orbit.add(fl); }
    }
    if (X.has('icecrown') && !opts.bust) {
      orbit = dyn(new T.Group()); orbit.position.y = 14; root.add(orbit);
      const im = basic(0xbff6ff, { transparent: true, opacity: 0.9 });
      for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2; const c = new T.Mesh(new T.OctahedronGeometry(1.4), im); c.position.set(Math.cos(a) * 9, (i % 2) * 4, Math.sin(a) * 9); orbit.add(c); }
    }
    for (const g of [hips, ...legs, tb, ...arms, prop, headG]) bake(g, !opts.bust);
    if (propL) bake(propL, true);
    return { root, hips, legs, torso, head: headG, arms, prop, propL, drone, flashes, orbit, kind: A.kind, pid, phase: 0, recoil: 0, swing: 0, lastAmmo: 3, idleT: Math.random() * 6, face: null, act: null, yawOff: 0, lift: 0 };
  }

  // 驾驶舱里的小人：同一个角色模型的上半身
  function buildPilot(pilotId, headCosmetic, teamColor) {
    const c = buildChar(pilotId, teamColor, headCosmetic, { bust: true });
    const g = new T.Group();
    c.root.scale.setScalar(0.62); c.root.position.y = -(CH.headY + 4.3 + CH.hip + 0.4) * 0.62 + 0.6;
    c.arms[0].rotation.z = 0.9; c.arms[1].rotation.z = 0.9; c.arms[0].rotation.x = -0.25; c.arms[1].rotation.x = 0.25;
    c.prop.visible = false; if (c.propL) c.propL.visible = false;
    g.add(c.root);
    return g;
  }

  // 角色动画：st = 玩家状态（x, y, vx, vy, a 朝向, ammo, flags），dt 秒
  // mode：'game'（游戏里）/ 'show'（展示台，没有移动时做待机动作）
  function animateChar(c, st, dt, sp, opts = {}) {
    c.idleT += dt;
    const aimA = st.a;
    c.face = c.face == null ? aimA : c.face + wrapA(aimA - c.face) * Math.min(1, dt * 16);
    const moveA = Math.atan2(st.vy || 0, st.vx || 0);
    c.phase += (Math.PI * 2 * sp * dt) / 26;
    const sw = Math.min(1, sp / 140);
    // 开火：弹药减少 = 刚开过一次火
    const am = st.ammo == null ? 3 : st.ammo;
    if (am < c.lastAmmo - 0.2 || opts.fire) { c.recoil = 1; c.swing = 1; }
    c.lastAmmo = am;
    c.recoil = Math.max(0, c.recoil - dt * 7); c.swing = Math.max(0, c.swing - dt * 4.2);
    // 腿朝移动方向，身体朝瞄准方向
    const back = sp > 20 && Math.cos(wrapA(moveA - c.face)) < -0.2 ? -1 : 1;
    c.legs[0].rotation.z = Math.sin(c.phase) * 0.85 * sw * back; c.legs[1].rotation.z = -Math.sin(c.phase) * 0.85 * sw * back;
    const bob = Math.abs(Math.sin(c.phase)) * 0.9 * sw;
    const breathe = Math.sin(c.idleT * 2.4) * 0.12 * (1 - sw);
    c.torso.position.y = CH.hip + 0.4 + bob + breathe;
    c.hips.position.y = CH.hip + bob * 0.6;
    c.torso.rotation.z = -0.12 * sw - (c.kind === 'melee' ? c.swing * 0.3 : 0);
    c.torso.rotation.y = c.kind === 'melee' ? Math.sin(c.swing * Math.PI) * 0.7 : 0;
    c.head.rotation.z = 0.08 * sw + Math.sin(c.idleT * 1.3) * 0.04;
    c.head.rotation.x = Math.sin(c.idleT * 0.9) * 0.06 * (1 - sw);
    // 手臂：枪 = 右手举起瞄准；近战 = 举在身侧，攻击时横扫；抛投 = 攻击时甩臂
    const L = c.arms[0], R = c.arms[1];
    const swingL = Math.sin(c.phase) * 0.7 * sw;
    if (c.kind === 'gun') {
      R.rotation.z = 1.45 - c.recoil * 0.35; R.rotation.x = -0.12;
      if (c.propL) { L.rotation.z = 1.45 - c.recoil * 0.25; L.rotation.x = 0.12; } else { L.rotation.z = -swingL + 0.1; L.rotation.x = 0.15; }
    } else if (c.kind === 'melee') {
      const s = c.swing;
      R.rotation.z = 0.9 + Math.sin(s * Math.PI) * 0.9; R.rotation.x = -0.5 + s * 1.4;
      if (c.pid === 'titan') { L.rotation.z = 1.1 + Math.sin((1 - s) * Math.PI) * 0.5; L.rotation.x = 0.4; } else { L.rotation.z = -swingL + 0.1; L.rotation.x = 0.15; }
    } else {
      R.rotation.z = c.swing > 0 ? 2.6 - (1 - c.swing) * 2.2 : 0.4 - swingL; R.rotation.x = -0.2;
      L.rotation.z = -swingL + 0.2; L.rotation.x = 0.2;
    }
    if (c.drone) { c.drone.position.y = 27 + Math.sin(c.idleT * 3) * 1.2; c.drone.rotation.y = c.idleT * 0.8; }
    if (c.orbit) { c.orbit.rotation.y = c.idleT * 1.4; c.orbit.position.y = 14 + Math.sin(c.idleT * 2) * 1.5; }
    c.yawOff = 0; c.lift = 0;
    c.prop.rotation.y = 0; if (c.propL) c.propL.rotation.y = 0;
    if (c.act) charActionTick(c, dt);
    if (c.lift) { c.torso.position.y += c.lift; c.hips.position.y += c.lift; }
    for (const f of c.flashes) { f.visible = c.recoil > 0.55; if (f.visible) f.scale.setScalar(0.9 + Math.random() * 0.9); }
  }

  // ---------------- 展示动作：打招呼 → 招牌攻击 → 胜利 ----------------
  // 'show' = 整套（选中驾驶员时自动播放），也可以单独播 'hello' / 'attack' / 'victory'
  const ACT_LEN = { hello: 1.1, attack: 1.9, victory: 1.5 };
  const ease = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
  const hump = (t, a, b) => (t <= a || t >= b ? 0 : Math.sin(((t - a) / (b - a)) * Math.PI));
  // ---------------- 1.9：史诗及以上皮肤的专属进场动作（约 2.6 秒）----------------
  //   c.enterOff = { x, y, s }：角色整体的平移 / 缩放；特效通过 c.fx(type, ...) 交给宿主（展示台）画
  const ENTER_LEN = 2.6;
  function entranceTick(c, a, dt) {
    const t = a.t, L = c.arms[0], R = c.arms[1], once = (k, at) => { if (t >= at && !a[k]) { a[k] = 1; return true; } return false; };
    const fx = c.fx || (() => {}), col = c.accent || '#ffffff';
    const eo = c.enterOff || (c.enterOff = { x: 0, y: 0, s: 1 });
    eo.x = 0; eo.y = 0; eo.s = 1;
    switch (a.type) {
      case 'hammer': {   // 金牌工头：蹲下蓄力 → 高高跳起 → 砸地出金色冲击波 → 叉腰
        if (t < 0.5) { c.lift = -1.5 * ease(t / 0.5); R.rotation.z = -0.6; L.rotation.z = -0.6; }
        else if (t < 1.2) { const u = (t - 0.5) / 0.7; c.lift = hump(u, 0, 1) * 14; R.rotation.z = 3 - u; L.rotation.z = 3 - u; L.rotation.x = 0.3; }
        else { const u = Math.min(1, (t - 1.2) / 0.5); c.lift = -1.2 * (1 - u); R.rotation.z = 0.4; L.rotation.z = 0.4; R.rotation.x = -0.9; L.rotation.x = 0.9; }
        if (once('s1', 1.2)) { fx('ring', '#ffd35e', 26); fx('ring', '#ffffff', 18); fx('burst', '#ffd35e', 26); }
        break;
      }
      case 'flag': case 'warbanner': {   // 红旗特装 / 烈士·不灭战旗：走进来 → 插下战旗 → 敬礼
        eo.x = -16 * (1 - ease(t / 0.8));
        const sp = t < 0.8 ? 1 : 0; for (const lg of c.legs) lg.rotation.z = Math.sin(t * 14) * 0.6 * sp;
        if (t > 0.8 && t < 1.6) { L.rotation.z = 0.2; L.rotation.x = 0.15 + 2.6 * hump(t, 0.8, 1.6); }
        if (once('s1', 0.9)) fx('flag', a.type === 'warbanner' ? '#ffd35e' : '#c8102e', a.type === 'warbanner' ? 1.4 : 1);
        if (once('s2', 1.3)) { fx('ring', a.type === 'warbanner' ? '#ffd35e' : '#ff5a36', 22); fx('burst', a.type === 'warbanner' ? '#ffe14d' : '#ff5a36', 22); }
        if (t > 1.7) { R.rotation.z = 2.6; R.rotation.x = -1.4; c.head.rotation.x = -0.1; }
        break;
      }
      case 'ice': {   // 冰沙女王：被冰晶包着 → 冰晶炸开 → 张开双手
        if (once('s0', 0)) fx('crystal', '#bff6ff', 1.0);
        if (once('s1', 1.0)) { fx('shards', '#dff8ff', 24); fx('ring', '#7af0ff', 24); fx('ring', '#ffffff', 16); }
        if (t > 1.0) { const u = ease((t - 1.0) / 0.5); L.rotation.x = 0.15 + 1.6 * u; R.rotation.x = -0.12 - 1.6 * u; L.rotation.z = R.rotation.z = 0.3; c.lift = hump(t, 1.0, 1.6) * 3; }
        else c.lift = 0;
        break;
      }
      case 'sealer': {   // 夜都·封咒师：符纸围着转圈越收越紧 → 紫光炸开 → 双手抱胸
        if (once('s0', 0)) fx('talismans', '#f4e6c8', 1.2);
        eo.s = t < 1.2 ? 0.25 + 0.75 * ease(t / 1.2) : 1; c.yawOff = t < 1.2 ? (1 - ease(t / 1.2)) * Math.PI * 4 : 0;
        if (once('s1', 1.2)) { fx('ring', '#8a6bff', 26); fx('ring', '#d8b25a', 18); fx('burst', '#b48cff', 30); }
        if (t > 1.3) { L.rotation.z = R.rotation.z = 1.2; L.rotation.x = 0.9; R.rotation.x = -0.9; c.head.rotation.x = 0.08; }
        break;
      }
      case 'wraith': {   // 恶灵觉醒：脚下升起红黑火柱 → 从地底升上来 → 红光炸开 → 弓身狞笑
        if (once('s0', 0)) fx('pillar', '#ff2d4b', 1.4);
        eo.y = t < 0.3 ? -32 : t < 1.1 ? -32 * (1 - ease((t - 0.3) / 0.8)) : 0;
        if (once('s1', 1.1)) { fx('ring', '#ff2d4b', 26); fx('burst', '#ff2d4b', 32); fx('burst', '#3a0a18', 20); }
        if (t > 1.2) { const u = ease((t - 1.2) / 0.4); c.torso.rotation.z = -0.25 * u; c.lift = -1.5 * u; c.head.rotation.z = 0.2 * u; R.rotation.z = 0.6; R.rotation.x = -0.4 - 0.5 * u; L.rotation.x = 0.6 * u; }
        break;
      }
      case 'dj': {   // 午夜频道：搓碟 + 低音音波 + 最后指天
        c.head.rotation.x = Math.sin(t * 12) * 0.12; c.lift = Math.abs(Math.sin(t * 6)) * 1.2;
        R.rotation.z = 1.2; R.rotation.x = -0.6 + Math.sin(t * 18) * 0.35;
        for (const [k, at] of [['s1', 0.3], ['s2', 0.9], ['s3', 1.5]]) if (once(k, at)) fx('ring', at === 0.9 ? '#ffffff' : col, 20 + at * 6);
        if (t > 2.0) { L.rotation.z = 0.1; L.rotation.x = 2.8; }
        break;
      }
      case 'surf': {   // 冲浪少年：踩着冲浪板滑进来 → 跳下 → 竖大拇指
        if (once('s0', 0)) fx('board', '#1fd6ee', 1.1);
        eo.x = -40 * (1 - ease(Math.min(1, t / 1.0))); c.torso.rotation.z = t < 1 ? 0.25 : 0;
        L.rotation.x = t < 1 ? 1.2 : L.rotation.x; R.rotation.x = t < 1 ? -1.2 : R.rotation.x;
        c.lift = 2 + hump(t, 1.0, 1.4) * 6 - (t > 1.4 ? 2 : 0);
        if (once('s1', 1.4)) fx('burst', '#1fd6ee', 18);
        if (t > 1.6) { R.rotation.z = 1.6; R.rotation.x = -0.4; }
        break;
      }
      case 'idol': {   // 海滩偶像：转两圈 → 飘出爱心 → 比心眨眼
        c.yawOff = t < 1.2 ? ease(t / 1.2) * Math.PI * 4 : 0; c.lift = hump(t, 0, 1.2) * 3;
        if (once('s1', 1.0)) fx('hearts', '#ff6ec4', 10);
        if (t > 1.2) { L.rotation.z = 0.3; L.rotation.x = 2.4; R.rotation.z = 0.3; R.rotation.x = -2.4; c.head.rotation.z = 0.25; }
        break;
      }
      case 'academy': {   // 夜都·学院生：从天而降 → 落地蹲下，符纸散开 → 站起来
        eo.y = t < 0.5 ? 40 * (1 - ease(t / 0.5)) : 0;
        if (once('s1', 0.5)) { fx('papers', '#f4e6c8', 20); fx('ring', col, 20); }
        c.lift = t > 0.5 && t < 1.0 ? -2.2 * hump(t, 0.5, 1.0) : 0;
        if (t > 1.1) { R.rotation.z = 1.4; R.rotation.x = -0.2; }
        break;
      }
      case 'moon': {   // 月下符姬：月光照下来 → 慢慢飘落 → 双手合十
        if (once('s0', 0)) fx('beam', '#ffd35e', 1.6);
        eo.y = t < 1.4 ? 26 * (1 - ease(t / 1.4)) : 0; eo.s = t < 0.6 ? 0.4 + ease(t / 0.6) * 0.6 : 1;
        if (once('s1', 1.4)) { fx('crescent', '#ffd35e', 1.2); fx('burst', '#ffe9a8', 16); }
        if (t > 1.5) { L.rotation.z = R.rotation.z = 1.0; L.rotation.x = 1.15; R.rotation.x = -1.15; }
        break;
      }
    }
  }
  function charActionTick(c, dt) {
    const a = c.act; a.t += dt;
    if (a.name === 'enter') { if (a.t >= ENTER_LEN) { c.act = null; if (c.enterOff) { c.enterOff.x = c.enterOff.y = 0; c.enterOff.s = 1; } return; } entranceTick(c, a, dt); return; }
    let name = a.name, t = a.t;
    if (name === 'show') {
      if (t < ACT_LEN.hello) name = 'hello';
      else if (t < ACT_LEN.hello + ACT_LEN.attack) { name = 'attack'; t -= ACT_LEN.hello; }
      else { name = 'victory'; t -= ACT_LEN.hello + ACT_LEN.attack; }
    }
    const total = a.name === 'show' ? ACT_LEN.hello + ACT_LEN.attack + ACT_LEN.victory : ACT_LEN[a.name];
    if (a.t >= total) { c.act = null; return; }
    const L = c.arms[0], R = c.arms[1];
    if (name === 'hello') {
      // 小跳一下 + 举起左手挥手 + 歪头笑
      c.lift = hump(t, 0, 0.42) * 4;
      for (const lg of c.legs) lg.rotation.z = -hump(t, 0, 0.42) * 0.5;
      const up = ease(t / 0.25) * (1 - ease((t - 0.85) / 0.25));
      L.rotation.z = 0.25 * up; L.rotation.x = 0.15 + up * (2.45 + Math.sin(t * 16) * 0.35);
      c.head.rotation.x = -0.18 * up; c.head.rotation.z = 0.12 * up;
      c.torso.rotation.x = -0.08 * up;
    } else if (name === 'attack') {
      const k = c.kind;
      if (k === 'gun') {
        // 连开三枪，最后转一圈枪
        for (const ft of [0.15, 0.5, 0.85]) if (t >= ft && t - dt < ft) { c.recoil = 1; }
        const aim = ease(t / 0.12) * (1 - ease((t - 1.15) / 0.2));
        R.rotation.z = 1.5 * aim - c.recoil * 0.45 * aim + (1 - aim) * 0.3; R.rotation.x = -0.12;
        if (c.propL) { L.rotation.z = R.rotation.z; L.rotation.x = 0.12; }
        c.torso.rotation.z = -c.recoil * 0.08;
        c.torso.rotation.y = Math.sin(t * 3) * 0.12 * aim;
        if (t > 1.15) { const sp = ease((t - 1.15) / 0.6) * Math.PI * 4; c.prop.rotation.y = sp; if (c.propL) c.propL.rotation.y = -sp; R.rotation.z = 0.9; if (c.propL) L.rotation.z = 0.9; }
      } else if (k === 'melee') {
        // 左右横扫两下，最后跳起来往下砸
        const s1 = hump(t, 0.05, 0.45), s2 = hump(t, 0.5, 0.9);
        c.torso.rotation.y = s1 * 0.9 - s2 * 0.9;
        R.rotation.z = 1.1 + s1 * 0.6 + s2 * 0.6; R.rotation.x = -0.5 + s1 * 1.6 - s2 * 0.6;
        if (c.pid === 'titan') { L.rotation.z = 1.1 + s2 * 0.8; L.rotation.x = 0.4 - s2 * 1.2; }
        if (t > 1.0) {
          const u = (t - 1.0) / 0.9, rise = hump(u, 0, 0.55);
          c.lift = rise * 6;
          R.rotation.z = u < 0.45 ? 1.2 + ease(u / 0.45) * 1.9 : 3.1 - ease((u - 0.45) / 0.15) * 2.4; R.rotation.x = -0.3;
          if (c.pid === 'titan') { L.rotation.z = R.rotation.z; L.rotation.x = 0.3; }
          if (u > 0.55 && u - dt / 0.9 <= 0.55) c.recoil = 1;
          c.torso.rotation.z = u > 0.55 ? -0.25 * (1 - ease((u - 0.6) / 0.4)) : 0.1;
        }
      } else {
        // 抛投：后摆 → 甩出，两次
        for (const [a0] of [[0.05], [0.9]]) {
          const u = (t - a0) / 0.75;
          if (u < 0 || u > 1) continue;
          R.rotation.z = u < 0.45 ? 0.4 - ease(u / 0.45) * 1.6 : -1.2 + ease((u - 0.45) / 0.2) * 3.9 - ease((u - 0.7) / 0.3) * 1.2;
          R.rotation.x = -0.25;
          c.torso.rotation.y = u < 0.45 ? -0.35 * ease(u / 0.45) : -0.35 + ease((u - 0.45) / 0.25) * 0.7;
          L.rotation.z = u < 0.45 ? 0.9 : 0.2;
        }
      }
    } else if (name === 'victory') {
      // 双手举高跳起来转一圈，落地摆姿势
      const j = hump(t, 0.05, 0.75);
      c.lift = j * 7;
      c.yawOff = ease((t - 0.05) / 0.7) * Math.PI * 2;
      for (const lg of c.legs) lg.rotation.z = -j * 0.6;
      const up = ease(t / 0.15) * (1 - ease((t - 1.05) / 0.3));
      L.rotation.z = 0.2 * up; L.rotation.x = 0.15 + up * 2.5;
      R.rotation.z = 0.2 * up + (1 - up) * R.rotation.z; R.rotation.x = -0.12 - up * 2.5;
      c.head.rotation.x = -0.25 * up;
      if (t > 0.85) { const p2 = ease((t - 0.85) / 0.2); c.torso.rotation.z = -0.1 * p2; c.head.rotation.z = 0.15 * p2; }
    }
  }
  const skinEntrance = (pilotId) => { const P = S.pilot(pilotId), K = P.skinId && S.skin(P.skinId); return K && K.entrance; };
  function charAction(name) {
    if (!CP.ch) return;
    if (name === 'enter') { const tp = skinEntrance(CP.key.split('|')[0]); if (!tp) return; cpFxClear(); CP.ch.act = { name: 'enter', type: tp, t: 0 }; }
    else CP.ch.act = { name: name || 'show', t: 0 };
    CP.t0 = performance.now();
  }
  // 展示台上的进场特效（光圈 / 碎片 / 战旗 / 冰晶 / 火柱……）；CP.fx 在 CP 定义处初始化
  function cpFxClear() { for (const f of CP.fx) CP.scene.remove(f.m); CP.fx = []; }
  function cpAdd(m, life, update) { CP.scene.add(m); CP.fx.push({ m, t: 0, life, update }); }
  const add3 = (c, o) => { const m = new T.MeshBasicMaterial(Object.assign({ color: c, transparent: true, depthWrite: false }, o)); return m; };
  function cpFxSpawn(type, color, k) {
    if (!CP.scene) return;
    if (type === 'ring') { const m = new T.Mesh(new T.RingGeometry(0.85, 1, 48), add3(color, { side: T.DoubleSide, blending: T.AdditiveBlending })); m.rotation.x = -Math.PI / 2; m.position.y = 0.3; cpAdd(m, 0.6, (o, u) => { o.scale.setScalar(k * (0.2 + 0.8 * Math.sqrt(u))); o.material.opacity = 1 - u; }); return; }
    if (type === 'burst' || type === 'shards' || type === 'papers' || type === 'hearts') {
      for (let i = 0; i < k; i++) {
        const geo = type === 'shards' ? new T.OctahedronGeometry(0.8) : type === 'papers' ? new T.BoxGeometry(0.15, 1.6, 1) : type === 'hearts' ? new T.SphereGeometry(0.7, 8, 6) : new T.SphereGeometry(0.45, 6, 4);
        const m = new T.Mesh(geo, add3(color, { blending: type === 'burst' ? T.AdditiveBlending : T.NormalBlending })); const a = Math.random() * 6.28, e = Math.random() * 1.2, v = 14 + Math.random() * 18;
        const vel = new T.Vector3(Math.cos(a) * Math.cos(e) * v, (type === 'hearts' ? 6 : 10) + Math.sin(e) * v, Math.sin(a) * Math.cos(e) * v); m.position.set(0, type === 'hearts' ? 22 : 12, 0);
        cpAdd(m, type === 'hearts' ? 1.4 : 0.9, (o, u, dt) => { o.position.addScaledVector(vel, dt); vel.y -= (type === 'hearts' ? -4 : 30) * dt; vel.multiplyScalar(type === 'hearts' ? 0.97 : 0.985); o.rotation.x += dt * 6; o.rotation.y += dt * 4; o.material.opacity = 1 - u; });
      }
      return;
    }
    if (type === 'flag') {   // 战旗：旗杆从地里升起，旗面展开
      const g = new T.Group(); g.position.set(-9, 0, -7);
      g.add(new T.Mesh(new T.CylinderGeometry(0.35, 0.35, 34 * k, 8), add3(0x3a2a1c, { transparent: false }))); g.children[0].position.y = 17 * k;
      const cloth = new T.Mesh(new T.PlaneGeometry(14 * k, 9 * k), add3(color, { side: T.DoubleSide, transparent: false })); cloth.position.set(7 * k, 29 * k, 0); g.add(cloth);
      const star = new T.Mesh(new T.CircleGeometry(1.8 * k, 5), add3(color === '#c8102e' ? 0xffe14d : 0xc8102e, { side: T.DoubleSide, transparent: false })); star.position.set(4 * k, 30 * k, 0.05); g.add(star);
      cpAdd(g, ENTER_LEN + 1.6, (o, u, dt, tt) => { const up = Math.min(1, tt / 0.4); o.position.y = -34 * k * (1 - up); const un = Math.min(1, Math.max(0, (tt - 0.35) / 0.5)); cloth.scale.x = Math.max(0.05, un); cloth.position.x = 7 * k * un; star.scale.setScalar(un); cloth.rotation.y = Math.sin(tt * 5) * 0.12; });
      return;
    }
    if (type === 'crystal') { const m = new T.Mesh(new T.OctahedronGeometry(1), add3(color, { opacity: 0.7 })); m.scale.set(13, 22, 13); m.position.y = 15; cpAdd(m, k, (o, u, dt, tt) => { o.rotation.y = tt * 0.6; o.material.opacity = 0.75 * (u > 0.85 ? (1 - u) / 0.15 : 1); }); return; }
    if (type === 'talismans') { const g = new T.Group(); for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2, tg = new T.Mesh(new T.BoxGeometry(0.2, 4.4, 1.8), add3(color, { transparent: false })); tg.position.set(Math.cos(a) * 16, 14 + (i % 2) * 4, Math.sin(a) * 16); tg.rotation.y = -a; g.add(tg); } cpAdd(g, k, (o, u, dt, tt) => { o.rotation.y = tt * 7; const s2 = 1 - 0.75 * u; o.scale.set(s2, 1, s2); }); return; }
    if (type === 'pillar') { const m = new T.Mesh(new T.CylinderGeometry(7, 11, 46, 16, 1, true), add3(color, { opacity: 0.55, side: T.DoubleSide, blending: T.AdditiveBlending })); m.position.y = 23; cpAdd(m, k, (o, u, dt, tt) => { o.rotation.y = tt * 3; o.scale.set(1 + Math.sin(tt * 20) * 0.05, Math.min(1, tt * 4), 1); o.material.opacity = 0.55 * (1 - u); }); return; }
    if (type === 'board') { const m = new T.Mesh(new T.BoxGeometry(18, 0.8, 5), add3(color, { transparent: false })); m.position.y = 0.5; cpAdd(m, k + 0.4, (o, u, dt, tt) => { const x = CP.ch && CP.ch.enterOff ? CP.ch.enterOff.x : 0; o.position.x = tt < 1 ? x : x - (tt - 1) * 30; o.material.opacity = tt > 1 ? 1 - (tt - 1) / 0.4 : 1; o.material.transparent = tt > 1; }); return; }
    if (type === 'beam') { const m = new T.Mesh(new T.CylinderGeometry(9, 9, 80, 20, 1, true), add3(color, { opacity: 0.3, side: T.DoubleSide, blending: T.AdditiveBlending })); m.position.y = 40; cpAdd(m, k, (o, u) => { o.material.opacity = 0.32 * (u < 0.8 ? 1 : (1 - u) / 0.2); }); return; }
    if (type === 'crescent') { const m = new T.Mesh(new T.TorusGeometry(12, 0.8, 6, 30, Math.PI * 1.4), add3(color, { blending: T.AdditiveBlending })); m.rotation.x = -Math.PI / 2; m.position.y = 0.6; cpAdd(m, k, (o, u, dt, tt) => { o.rotation.z = tt * 2; o.material.opacity = 1 - u; }); }
  }

  // =====================================================================
  // 机兵模型：双足 + 圆角装甲 + 驾驶舱
  // 层级：root(位置/朝向) → lower(腿部朝向移动方向) / upper(上身朝向瞄准方向, 弹簧倾斜)
  // =====================================================================
  const LEG = { L1: 6.6, L2: 6.4, foot: 1.6, hipZ: 6.2 };
  function makeBot(color, head, weapon, pilotId, paintId) {
    const s = SH;
    const root = new T.Group();
    const bodyMat = toon(color, { map: panelTex() });
    const tint = toon(new T.Color(color).multiplyScalar(0.62), { map: panelTex() });
    const light = toon(new T.Color(color).lerp(new T.Color(0xffffff), 0.55));
    let frame = toon(0x3a3e52), joint = toon(0x23252f);
    const steel = toon(0xaab2c8);
    // 机甲涂装皮肤：只换框架 / 高光 / 关节的颜色，机身还是队伍色（一眼分清敌我）
    const PK = paintId && S.skin && S.skin(paintId);
    if (PK && PK.paint) {
      const P2 = PK.paint;
      frame = toon(P2.frame, P2.glow ? { emissive: new T.Color(P2.light).multiplyScalar(0.25) } : undefined);
      joint = toon(P2.joint);
      light.color.set(P2.light);
      if (P2.glow) light.emissive = new T.Color(P2.light).multiplyScalar(0.55);
    }
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
    if (weapon === 'fist') { arm.add(outlined(rbox(10, 10, 10, 3.5), bodyMat, 1, 1, 1, 11, -1, 0)); for (let i = 0; i < 4; i++) arm.add(part(s.box, light, 1.6, 2, 2, 16.2, 2.6 - i * 2.4, 0)); }
    // ---- 弹出后的驾驶员（步行） ----
    const foot = dyn(new T.Group()); root.add(foot); foot.visible = false;
    const fchar = buildChar(pilotId, color, head); fchar.root.scale.setScalar(1.45); foot.add(fchar.root);
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
      root, body, hips, lower, upper, lean, legs, flames, foot, fchar, color, fxAcc: 0, stepPh: 0, wheel, wheelTilt, spinG, wpn, wpnMount, arm, pilot, tankFill, bodyMat, lightMat: light,
      fadeMats: [wheelMat, hubMat, spokeMat, tireMat, treadMat], shield, ud: wpn.userData,
      // 动画状态
      punch: 0, punchV: 0, spin: 0, moveA: 0, phase: 0, legYaw: 0, face: null, zs: null, lvx: 0, lvy: 0, avx: 0, avy: 0,
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
      if (b.airT > 0.12 && b.lastVz < -120) {
        b.suspV -= Math.min(140, -b.lastVz * 0.16);
        // 落地扬尘：一圈往外推的烟
        if (W && b.root.visible !== false) { const n = Math.min(14, 4 + (-b.lastVz) / 60); for (let k = 0; k < n; k++) { const a = (k / n) * 6.283; emit(st.x + Math.cos(a) * 10, st.y + Math.sin(a) * 10, z + 2, '#d8d4e4', 1, 90, 0.1, { sys: 'pk', size: 16, life: 0.55, grav: -20, drag: 4, grow: 1.4, dir: { x: Math.cos(a), y: Math.sin(a), z: 0.1 }, spread: 0.2 }); } }
      }
      b.airT = 0;
    }
    b.lastVz = vz;
    // 受击硬直
    if (st.flash > 0.05 && b.lastFlash <= 0.05) { b.pitchV -= 9; b.rollV += (Math.random() - 0.5) * 14; b.suspV -= 25; }
    b.lastFlash = st.flash;
    spring(b, 'susp', 0, 260, 15, dt);
    b.susp = clampN(b.susp, -6, 3);

    const onFoot = !!(st.flags & 512);
    b.foot.visible = onFoot;
    if (onFoot) {
      b.body.visible = false; b.wheel.visible = false;
      b.face = b.face == null ? st.a : b.face + wrapA(st.a - b.face) * Math.min(1, dt * 16);
      b.root.rotation.y = -b.face;
      animateChar(b.fchar, st, dt, sp);
      return;
    }
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
      // 滚轮高速：身后拖出队伍色光迹
      if (sp > 240 && W && !air) { b.fxAcc += dt; if (b.fxAcc > 0.025) { b.fxAcc = 0; emit(st.x - Math.cos(b.moveA) * 12, st.y - Math.sin(b.moveA) * 12, z + 6, b.color, 1, 20, 0.2, { sys: 'pg', size: 12, life: 0.35, grav: 0, drag: 2 }); } }
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
    b.phase += (dir * Math.PI * 2 * sp * dt) / 26;
    // 脚步扬尘：每一步落地时在脚下冒一小团烟
    if (!air && sp > 110 && W && Math.floor(b.phase / Math.PI) !== b.stepPh) {
      b.stepPh = Math.floor(b.phase / Math.PI);
      const side = b.stepPh % 2 ? 1 : -1, fx = st.x - Math.sin(b.face) * 6 * side, fy = st.y + Math.cos(b.face) * 6 * side;
      emit(fx, fy, z + 1, '#cfcbdc', 2, 30, 0.3, { sys: 'pk', size: 10, life: 0.45, grav: -15, drag: 3, grow: 1.2 });
    }
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
    if (st.weapon === 'fist' && fire && !b.lastFireP) b.punchV += 60;
    b.lastFireP = fire;
    spring(b, 'punch', 0, 240, 16, dt);
    spring(b, 'recoil', 0, 300, 18, dt);
    b.recoil = clampN(b.recoil, -0.4, 1.5);
    // 武器俯仰 + 后坐
    const pt = clampN(st.pt || 0, -0.9, 0.9);
    b.wpnMount.rotation.z = pt * 0.95 - b.pitch;
    b.wpn.position.x = -b.recoil * 3.2 + Math.max(0, b.punch) * 1.2;
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
  // 1.8：咒灵——百目（Boss：一团长满眼睛的暗紫色肉块，长角、四条触手）和小咒灵（单眼小幽灵）
  const _white = new T.Color(1, 1, 1);
  function makeCreature(kind) {
    shared();
    const B = kind === 'boss', root = new T.Group(), body = new T.Group(); root.add(body);
    const skin = toon(B ? 0x5a2a8a : 0x7a4ab8, { emissive: new T.Color(B ? 0x1e0830 : 0x220c40) }), dark = toon(B ? 0x2a1040 : 0x3a1a60);
    const eyeW = basic(0xfff6e8), pupil = basic(0xff2d4b), eyes = [], arms = [];
    if (B) {
      body.add(outlined(SH.sph, skin, 30, 28, 30, 0, 44, 0, 1.04));
      for (const [x, y, z, r] of [[-8, 68, 14, 13], [-6, 70, -14, 12], [-16, 52, 0, 15], [6, 22, 20, 11], [6, 22, -20, 11]]) body.add(outlined(SH.sph, skin, r, r, r, x, y, z, 1.05));
      { const sk = part(SH.cone, dark, 30, 22, 30, 0, 10, 0); sk.rotation.x = Math.PI; body.add(sk); }   // 下面拖着的暗影
      for (let i = 0; i < 9; i++) {   // 一堆眼睛，全长在正面
        const a = (i / 9 - 0.5) * 1.9, e = ((i % 3) - 1) * 0.42 + 0.15, R2 = 29;
        const ex = Math.cos(e) * Math.cos(a) * R2, ey = 44 + Math.sin(e) * R2, ez = Math.cos(e) * Math.sin(a) * R2, er = i === 4 ? 6.5 : 3.6 + (i % 2) * 1.2;
        const eg = new T.Group(); eg.position.set(ex, ey, ez); eg.lookAt(ex * 2, ey, ez * 2);
        eg.add(part(SH.sph, eyeW, er, er, er * 0.6, 0, 0, 0)); eg.add(part(SH.sph, pupil, er * 0.5, er * 0.5, er * 0.4, 0, 0, er * 0.45));
        body.add(eg); eyes.push(eg);
      }
      for (let i = 0; i < 6; i++) {   // 头顶也长着眼睛（俯视镜头看得见）
        const a = (i / 6) * Math.PI * 2, eg = new T.Group(); eg.position.set(Math.cos(a) * 15 - 4, 70, Math.sin(a) * 15); eg.lookAt(Math.cos(a) * 40, 140, Math.sin(a) * 40);
        eg.add(part(SH.sph, eyeW, 4.2, 4.2, 2.6, 0, 0, 0)); eg.add(part(SH.sph, pupil, 2.1, 2.1, 1.6, 0, 0, 2.2)); body.add(eg); eyes.push(eg);
      }
      for (let i = 0; i < 7; i++) { const a = (i / 6 - 0.5) * 0.9; const th = part(SH.cone, eyeW, 1.6, 5, 1.6, 26 * Math.cos(a) + 2, 26, 26 * Math.sin(a)); th.rotation.x = Math.PI; body.add(th); }   // 牙
      for (const z of [-1, 1]) { const h = part(SH.cone, toon(0xe8e2d6), 4, 22, 4, -6, 78, z * 14); h.rotation.x = z * 0.55; h.rotation.z = 0.35; body.add(h); }
      for (let k = 0; k < 4; k++) {   // 四条触手
        const arm = new T.Group(), side = k < 2 ? -1 : 1, front = k % 2 ? 1 : -1;
        arm.position.set(front * 8, 40, side * 28); body.add(arm);
        let seg = arm;
        for (let j = 0; j < 4; j++) { const sg = new T.Group(); sg.position.set(0, -2, side * (j ? 7 : 2)); sg.add(part(SH.sph, j === 3 ? basic(0xff2d4b) : skin, 5 - j, 5 - j, 5 - j, 0, 0, 0)); seg.add(sg); seg = sg; }
        arms.push(arm);
      }
      body.add(part(SH.sphL, basic(0xff2d4b, { transparent: true, opacity: 0.18, depthWrite: false, blending: T.AdditiveBlending }), 44, 44, 44, 0, 44, 0));
    } else {
      body.add(outlined(SH.sph, skin, 11, 12, 11, 0, 20, 0, 1.06));
      { const tl = part(SH.cone, skin, 8, 14, 8, -3, 6, 0); tl.rotation.x = Math.PI; body.add(tl); }
      const eg = new T.Group(); eg.position.set(9, 22, 0); eg.rotation.y = Math.PI / 2;
      eg.add(part(SH.sph, eyeW, 5, 5, 3, 0, 0, 0)); eg.add(part(SH.sph, pupil, 2.4, 2.4, 2, 0, 0, 2.2)); body.add(eg); eyes.push(eg);
      body.add(part(SH.box, dark, 1, 1.4, 7, 10, 14, 0));
      for (const z of [-1, 1]) { const h = part(SH.cone, toon(0xe8e2d6), 1.6, 6, 1.6, -2, 32, z * 5); h.rotation.x = z * 0.5; body.add(h); }
      body.add(part(SH.sphL, basic(0xb48cff, { transparent: true, opacity: 0.2, depthWrite: false, blending: T.AdditiveBlending }), 18, 18, 18, 0, 20, 0));
    }
    bake(body);
    return { root, body, eyes, arms, creature: kind, skin, phase: Math.random() * 6, scale: 1 };
  }
  function animateCreature(c, p, now, dt, rage) {
    c.phase += dt;
    c.root.position.set(p.x, (p.z || 0) + (c.creature === 'boss' ? 0 : 4 + Math.sin(c.phase * 3) * 3), p.y);
    c.root.rotation.y = -(p.a || 0);
    c.body.position.y = Math.sin(c.phase * (c.creature === 'boss' ? 1.6 : 4)) * (c.creature === 'boss' ? 2.5 : 1.2);
    c.arms.forEach((a, i) => { a.rotation.x = Math.sin(c.phase * 2.2 + i) * 0.5; a.rotation.z = Math.cos(c.phase * 1.7 + i * 1.3) * 0.4; });
    const blink = Math.sin(c.phase * 0.9) > 0.97;
    for (const e of c.eyes) e.scale.y = blink ? 0.15 : 1;
    if (c.creature === 'boss') {
      c.skin.emissive.setRGB(rage ? 0.4 + 0.18 * Math.sin(now / 120) : 0.14, 0.04, rage ? 0.1 : 0.22);
      if (Math.random() < (rage ? 0.6 : 0.25)) emit(p.x + (Math.random() - 0.5) * 70, p.y + (Math.random() - 0.5) * 70, (p.z || 0) + 6, rage ? '#ff2d4b' : '#8a6bff', 1, 30, 1, { sys: 'pg', size: 18, life: 0.7, grav: -90, drag: 2 });
    } else { c.skin.emissive.setRGB(0.13, 0.05, 0.25); if (Math.random() < 0.15) emit(p.x, p.y, (p.z || 0) + 8, '#b48cff', 1, 20, 1, { sys: 'pg', size: 9, life: 0.5, grav: -60, drag: 2 }); }
    if (p.flash > 0) { const k = Math.min(0.45, p.flash * 0.45); c.skin.emissive.lerp(_white, k); }   // 受击：淡淡地发白一下（不要整只变白）
  }
  function syncBots(G, now, dt, myId) {
    const me = G.me;
    for (const b of W.bots.values()) b.root.visible = false;
    for (const id of G.cur) {
      const p = G.players.get(id);
      if (!p) continue;
      let b = W.bots.get(id);
      if (p.boss || p.spirit) {   // 1.8：咒灵用自己的模型
        if (b && !b.creature) { scene.remove(b.root); b = null; }   // 之前按普通机兵建过模型
        if (!b) { b = makeCreature(p.boss ? 'boss' : 'spirit'); W.bots.set(id, b); scene.add(b.root); }
        if (!(p.flags & 1)) continue;
        b.root.visible = true;
        animateCreature(b, p, now, dt, p.boss && G.obj && G.obj[1] === 1);
        continue;
      }
      if (!b) {
        b = makeBot(G.colors[p.team], p.head, p.weapon, p.looks && p.looks.pskin ? p.pilot + '@' + p.looks.pskin : p.pilot, p.looks && p.looks.paint);
        // 皮肤等级：取驾驶员服装和机甲涂装里更高的那个
        const ks = [p.looks && p.looks.pskin, p.looks && p.looks.paint].map((k) => k && S.skin(k)).filter(Boolean);
        b.rare = ks.reduce((m, k) => Math.max(m, k.rare), 0);
        const top = ks.sort((x, y) => y.rare - x.rare)[0];
        b.skinCol = top ? (top.over ? top.over.accent : top.paint.light) : null;
        b.theme = top && top.bg || null;
        if (b.rare >= 4) { b.halo = new T.Mesh(new T.RingGeometry(20, 24, 40), basic(b.skinCol, { transparent: true, opacity: 0.55, side: T.DoubleSide, depthWrite: false })); b.halo.rotation.x = -Math.PI / 2; b.root.add(b.halo); }
        W.bots.set(id, b); scene.add(b.root);
      }
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
      // 持续光环：冲锋火焰 / 加速 / 火力全开 / 跳跃砸地的尾迹 / 大招发动中发光
      b.auraAcc = (b.auraAcc || 0) + dt;
      if (b.auraAcc > 0.03) {
        b.auraAcc = 0;
        const z = p.z || 0, bf = p.buffs || 0;
        if (p.flags & 128 && p.spk === SP_CHARGE) for (let k = 0; k < 3; k++) emit(p.x + (Math.random() - 0.5) * 26, p.y + (Math.random() - 0.5) * 26, z + 6 + Math.random() * 20, k ? '#ffb02e' : G.colors[p.team], 1, 40, 1, { sys: 'pg', size: 16, life: 0.4, grav: -120, drag: 2, grow: -0.4 });
        if (bf & 1 && Math.hypot(p.vx || 0, p.vy || 0) > 60) emit(p.x, p.y, z + 18, '#fff36b', 2, 30, 0.3, { sys: 'pg', size: 9, life: 0.35, grav: 0, drag: 3 });
        if (bf & 16) emit(p.x + Math.cos(p.a) * 18, p.y + Math.sin(p.a) * 18, z + 22, '#ff7a2e', 2, 40, 1, { sys: 'pg', size: 11, life: 0.35, grav: -160, drag: 2 });
        if (bf & 32) emit(p.x, p.y, z + 14, G.colors[p.team], 3, 30, 0.5, { sys: 'pg', size: 14, life: 0.4, grav: 0, drag: 3 });
        if (bf & 2) emit(p.x, p.y, z + 30, '#7af0ff', 1, 20, 0.5, { sys: 'pg', size: 8, life: 0.3, grav: 0 });
        // 皮肤特效：稀有 = 移动拖尾；史诗 = 再加呼吸灯；传说 = 再加环绕光环
        if (b.rare >= 2 && Math.hypot(p.vx || 0, p.vy || 0) > 60) emit(p.x - (p.vx || 0) * 0.03, p.y - (p.vy || 0) * 0.03, z + 10 + Math.random() * 14, b.skinCol, b.rare >= 3 ? 2 : 1, 25, 0.5, { sys: 'pg', size: b.rare >= 3 ? 11 : 8, life: 0.4, grav: 0, drag: 3 });
        if (b.rare >= 4) { const a = now / 260; for (let k = 0; k < 2; k++) { const aa = a + k * Math.PI; emit(p.x + Math.cos(aa) * 24, p.y + Math.sin(aa) * 24, z + 22 + Math.sin(now / 200 + k) * 10, k ? '#ffffff' : b.skinCol, 1, 8, 1, { sys: 'pg', size: 10, life: 0.5, grav: -30, drag: 2 }); } }
        // 1.9：传说 = 更强的光环 + 往上飘的星光；限定传说 = 主题粒子 + 主题脚印
        if (b.rare >= 5 && Math.random() < 0.5) emit(p.x + (Math.random() - 0.5) * 30, p.y + (Math.random() - 0.5) * 30, z + 4, Math.random() < 0.4 ? '#ffffff' : b.skinCol, 1, 12, 1, { sys: 'pg', size: 9, life: 0.7, grav: -110, drag: 2 });
        if (b.rare >= 6 && b.theme) {
          const TC = { ice: ['#dff8ff', '#7af0ff'], yato: ['#f4e6c8', '#8a6bff'], wraith: ['#ff2d4b', '#3a0a18'], martyr: ['#ffd35e', '#c8102e'] }[b.theme] || ['#fff', '#fff'];
          if (b.theme === 'ice' && Math.random() < 0.6) emit(p.x + (Math.random() - 0.5) * 60, p.y + (Math.random() - 0.5) * 60, z + 50 + Math.random() * 20, TC[Math.random() < 0.5 ? 0 : 1], 1, 6, 0, { sys: 'pg', size: 8, life: 1.2, grav: 40, drag: 1 });
          if (b.theme === 'yato') { const a = now / 330; emit(p.x + Math.cos(a) * 28, p.y + Math.sin(a) * 28, z + 26 + Math.sin(now / 240) * 6, TC[0], 1, 4, 0, { sys: 'pg', size: 10, life: 0.5, grav: 0, drag: 2 }); }
          if (b.theme === 'wraith' && Math.random() < 0.7) emit(p.x + (Math.random() - 0.5) * 26, p.y + (Math.random() - 0.5) * 26, z + 2, TC[Math.random() < 0.65 ? 0 : 1], 1, 20, 1, { sys: Math.random() < 0.5 ? 'pg' : 'pk', size: 14, life: 0.6, grav: -160, drag: 2 });
          b.stepAcc = (b.stepAcc || 0) + 0.03;
          if (Math.hypot(p.vx || 0, p.vy || 0) > 60 && b.stepAcc > 0.15 && (p.z || 0) < (W.M ? S.topAt(W.M, p.x, p.y) : 0) + 2) { b.stepAcc = 0; emit(p.x, p.y, z + 1, TC[0], 1, 0, 0, { sys: 'pg', size: 12, life: 1.1, grav: 0, drag: 8 }); }
        }
        if ((bf & 512) && Math.random() < 0.7) emit(p.x + (Math.random() - 0.5) * 22, p.y + (Math.random() - 0.5) * 22, z + 8 + Math.random() * 24, Math.random() < 0.5 ? '#ff7a1a' : '#ffd23f', 1, 20, 1, { sys: 'pg', size: 10, life: 0.4, grav: -160, drag: 2, grow: 1.3 });   // 2.0 着火
        if (bf & 1024) { const a = now / 160; for (let k = 0; k < 2; k++) emit(p.x + Math.cos(a + k * Math.PI) * 24, p.y + Math.sin(a + k * Math.PI) * 24, z + 14, '#f4e6c8', 1, 0, 0, { sys: 'pg', size: 8, life: 0.25, grav: 0 }); }   // 2.0 符印束缚
        if (bf & 64) for (let k = 0; k < 2; k++) emit(p.x + (Math.random() - 0.5) * 30, p.y + (Math.random() - 0.5) * 30, z + 4 + Math.random() * 36, k ? '#b78cff' : '#ffffff', 1, 30, 1, { sys: 'pg', size: 12, life: 0.45, grav: -140, drag: 2 });   // 超载
        if (bf & 128) emit(p.x, p.y, z + 44, '#ff5a36', 1, 20, 0.3, { sys: 'pg', size: 8, life: 0.3, grav: -40 });   // 集结
      }
      if (wheel) for (const m of b.fadeMats) m.opacity = fade;
      if (p.flash > 0) b.bodyMat.emissive.setRGB(0.8, 0.8, 0.8);
      else if (p.flags & 128) b.bodyMat.emissive.set(G.colors[p.team]).multiplyScalar(0.35 + 0.3 * Math.sin(now / 50));
      else b.bodyMat.emissive.setRGB(0, 0, 0);
      if (b.rare >= 3 && b.lightMat) b.lightMat.emissive.set(b.skinCol).multiplyScalar(0.25 + 0.25 * Math.sin(now / 260));
      if (b.halo) { b.halo.visible = !p.foot && !!p.alive; b.halo.position.y = 1.5 - (p.z || 0) + (G.M ? Math.min(150, S.topAt(G.M, p.x, p.y)) : 0); b.halo.material.opacity = 0.35 + 0.25 * Math.sin(now / 180); b.halo.scale.setScalar(1 + 0.08 * Math.sin(now / 240)); }
      b.shield.visible = p.shield > 0;
      if (p.shield > 0) b.shield.material.opacity = 0.16 + 0.08 * Math.sin(now / 120);
    }
  }

  // =====================================================================
  // 菜单里的机兵展示台：一个渲染器 + 一块画布，在主界面和整备界面之间移动
  // =====================================================================
  const PV = { r: null, scene: null, cam: null, bot: null, key: '', canvas: null, host: null, mode: 'auto', yaw: 0, drag: null, big: false, t0: 0 };
  function pvInit() {
    if (PV.r) return true;
    if (!T) return false;
    try {
      PV.canvas = document.createElement('canvas');
      PV.canvas.className = 'pv-canvas';
      PV.r = new T.WebGLRenderer({ canvas: PV.canvas, antialias: true, alpha: true });
    } catch (e) { PV.r = null; return false; }
    PV.r.shadowMap.enabled = true;
    PV.scene = new T.Scene();
    PV.scene.add(new T.HemisphereLight(0xe8ecff, 0x4a3a5a, 0.95));
    const sun = new T.DirectionalLight(0xfff2e0, 0.85); sun.position.set(60, 140, 90); sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024); Object.assign(sun.shadow.camera, { left: -50, right: 50, top: 50, bottom: -50, near: 10, far: 400 });
    PV.scene.add(sun);
    const back = new T.DirectionalLight(0x8fa8ff, 0.5); back.position.set(-80, 60, -90); PV.scene.add(back);
    PV.rim = new T.DirectionalLight(0xffffff, 0.45); PV.rim.position.set(-60, 90, -120); PV.scene.add(PV.rim);   // 1.5：驾驶员色的轮廓光
    const stage = new T.Mesh(new T.CylinderGeometry(34, 37, 4, 48), new T.MeshLambertMaterial({ color: 0x2a2440 }));
    stage.position.y = -2; stage.receiveShadow = true; PV.scene.add(stage);
    const glow = new T.Mesh(new T.RingGeometry(30, 34, 64), new T.MeshBasicMaterial({ color: 0xffdf2e, transparent: true, opacity: 0.8 }));
    glow.rotation.x = -Math.PI / 2; glow.position.y = 0.1; PV.scene.add(glow); PV.glow = glow;
    // 地面网格光
    const grid = new T.Mesh(new T.RingGeometry(8, 29, 48, 3), new T.MeshBasicMaterial({ color: 0xffffff, wireframe: true, transparent: true, opacity: 0.07 }));
    grid.rotation.x = -Math.PI / 2; grid.position.y = 0.15; PV.scene.add(grid);
    PV.cam = new T.PerspectiveCamera(30, 1, 1, 1000);
    // 拖动旋转（鼠标和触屏都用 pointer 事件）
    const c = PV.canvas;
    c.style.touchAction = 'none';
    c.addEventListener('pointerdown', (e) => { PV.drag = { x: e.clientX, yaw: PV.yaw }; try { c.setPointerCapture(e.pointerId); } catch (er) { /* ignore */ } });
    c.addEventListener('pointermove', (e) => { if (PV.drag) PV.yaw = PV.drag.yaw + (e.clientX - PV.drag.x) * 0.012; });
    const up = () => { PV.drag = null; };
    c.addEventListener('pointerup', up); c.addEventListener('pointercancel', up);
    return true;
  }
  // host: 承载画布的元素；opt: 机兵外观；big: 大展示台（相机更近）
  function preview(host, opt, big) {
    if (!pvInit()) return false;
    shared();
    if (PV.host !== host) { host.appendChild(PV.canvas); PV.host = host; }
    PV.big = !!big;
    const key = [opt.color, opt.head, opt.weapon, opt.pilot, opt.paint || ''].join('|');
    if (key !== PV.key) {
      if (PV.bot) PV.scene.remove(PV.bot.root);
      PV.bot = makeBot(opt.color, opt.head, opt.weapon, opt.pilot, opt.paint);
      PV.bot.wpnType = opt.weapon;
      PV.bot.root.traverse((o) => { if (o.isMesh && o.castShadow) o.castShadow = true; });
      PV.scene.add(PV.bot.root);
      PV.key = key;
      PV.glow.material.color.set(opt.color);
      if (PV.rim) PV.rim.color.set(opt.color);
    }
    pvResize();
    return true;
  }
  function pvResize() {
    const w = PV.host.clientWidth || 200, h = PV.host.clientHeight || 200;
    PV.r.setPixelRatio(Math.min(1.5, window.devicePixelRatio || 1));   // 1.7.1：2 倍分辨率 + 抗锯齿太吃显卡
    PV.r.setSize(w, h, false);
    PV.cam.aspect = w / Math.max(1, h); PV.cam.updateProjectionMatrix();
    const d = PV.big ? 132 : 104;
    PV.cam.position.set(d * 0.78, PV.big ? 46 : 44, d * 0.78); PV.cam.lookAt(0, PV.big ? 22 : 17, 0);
    PV.w = w; PV.h = h;
  }
  // 机体卡片缩略图：用展示台的渲染器单独拍一张（结果缓存）
  const THUMBS = new Map();
  let TH = null;
  function mechThumb(opt) {
    const key = [opt.color, opt.head, opt.weapon, opt.pilot, opt.paint || ''].join('|');
    if (THUMBS.has(key)) return THUMBS.get(key);
    if (!pvInit()) return '';
    shared();
    if (!TH) {
      TH = { scene: new T.Scene(), cam: new T.PerspectiveCamera(30, 1, 1, 1000), canvas: document.createElement('canvas') };
      TH.r = new T.WebGLRenderer({ canvas: TH.canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
      TH.r.setPixelRatio(1); TH.r.setSize(200, 200, false);
      TH.scene.add(new T.HemisphereLight(0xe8ecff, 0x4a3a5a, 1.0));
      const sun = new T.DirectionalLight(0xffffff, 0.8); sun.position.set(60, 140, 90); TH.scene.add(sun);
      TH.cam.position.set(66, 40, 82); TH.cam.lookAt(0, 18, 0);
    }
    const b = makeBot(opt.color, opt.head, opt.weapon, opt.pilot, opt.paint);
    b.wpnType = opt.weapon;
    animateBot(b, { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, a: 0.75, pt: 0, flags: 1, charge: 0, tank: 100, flash: 0, weapon: opt.weapon }, 0, 0.05);
    b.root.position.set(0, 0, 0);
    TH.scene.add(b.root);
    TH.r.render(TH.scene, TH.cam);
    const url = TH.canvas.toDataURL('image/png');
    TH.scene.remove(b.root);
    THUMBS.set(key, url);
    return url;
  }
  function previewMode(m) { PV.mode = m; PV.t0 = performance.now(); }
  function previewFrame(now, dt) {
    if (!PV.r || !PV.bot || !PV.host || !PV.canvas.isConnected || PV.canvas.offsetParent === null) return;
    if (PV.host.clientWidth !== PV.w || PV.host.clientHeight !== PV.h) pvResize();
    const t = now / 1000;
    let mode = PV.mode;
    if (mode === 'auto') mode = ['idle', 'walk', 'fire', 'jump', 'walk', 'wheel'][Math.floor(t / 3.2) % 6];
    if (!PV.drag) PV.yaw += dt * (PV.mode === 'auto' ? 0.35 : 0.15);
    const face = PV.yaw + 0.7;
    const st = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, a: face, pt: 0, flags: 1, charge: 0, tank: 70 + 30 * Math.sin(t), flash: 0, weapon: PV.bot.wpnType || '' };
    if (mode === 'walk' || mode === 'wheel') { const sp = mode === 'wheel' ? 230 : 140; st.vx = Math.cos(face) * sp; st.vy = Math.sin(face) * sp; if (mode === 'wheel') st.flags |= 2; }
    if (mode === 'fire') {
      st.pt = 0.05 + Math.sin(t * 2) * 0.08;
      if (st.weapon === 'charger') { const c = (t % 1.6) / 1.1; st.charge = c < 1 ? c : 0; }
      else { const ph = t % 1.2; st.flags |= ph < 0.8 ? 16 : 0; if (st.weapon === 'gatling') st.charge = 1; }
    }
    if (mode === 'jump') {
      // 每 1.6 秒跳一次：z = v·t − g·t²/2
      const ph = (t % 1.6), T0 = 380 / 980 * 2;
      if (ph < T0) { st.z = (380 * ph - 490 * ph * ph) * 0.3; st.vz = 380 - 980 * ph; }
    }
    PV.bot.body.visible = !(st.flags & 2); PV.bot.wheel.visible = !!(st.flags & 2);
    animateBot(PV.bot, st, now, dt);
    PV.bot.root.position.set(0, st.z, 0);
    PV.r.render(PV.scene, PV.cam);
  }

  // ---------------- 驾驶员展示台：转台上的全身 3D 角色（待机 → 走两步 → 开火） ----------------
  const CP = { yaw: -0.5, fx: [] };
  function cpInit() {
    if (CP.r) return true;
    if (!T) return false;
    try {
      CP.canvas = document.createElement('canvas'); CP.canvas.className = 'cp-canvas';
      CP.r = new T.WebGLRenderer({ canvas: CP.canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
    } catch (e) { CP.r = null; return false; }
    CP.scene = new T.Scene();
    CP.scene.add(new T.HemisphereLight(0xeef0ff, 0x4a3a5a, 0.62));
    const sun = new T.DirectionalLight(0xfff2e0, 0.62); sun.position.set(90, 110, 40); CP.scene.add(sun);
    const back = new T.DirectionalLight(0x9fb4ff, 0.3); back.position.set(-70, 50, -80); CP.scene.add(back);
    // 1.5：角色色的轮廓光 + 脚下的接触阴影
    CP.rim = new T.DirectionalLight(0xffffff, 0.55); CP.rim.position.set(-40, 60, -90); CP.scene.add(CP.rim);
    const sc = document.createElement('canvas'); sc.width = sc.height = 64;
    { const x = sc.getContext('2d'), g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(0,0,0,0.55)'); g.addColorStop(0.6, 'rgba(0,0,0,0.25)'); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64); }
    CP.shadow = new T.Mesh(new T.PlaneGeometry(22, 22), new T.MeshBasicMaterial({ map: new T.CanvasTexture(sc), transparent: true, depthWrite: false }));
    CP.shadow.rotation.x = -Math.PI / 2; CP.shadow.position.y = 0.12; CP.scene.add(CP.shadow);
    const disc = new T.Mesh(new T.CylinderGeometry(15, 16, 1.6, 40), new T.MeshLambertMaterial({ color: 0x2a2440 })); disc.position.y = -0.8; CP.scene.add(disc); CP.disc = disc;
    CP.ring = new T.Mesh(new T.RingGeometry(13.5, 15.2, 48), new T.MeshBasicMaterial({ color: 0xffdf2e, transparent: true, opacity: 0.85 })); CP.ring.rotation.x = -Math.PI / 2; CP.ring.position.y = 0.05; CP.scene.add(CP.ring);
    CP.cam = new T.PerspectiveCamera(28, 1, 1, 600);
    const c = CP.canvas; c.style.touchAction = 'none';
    c.addEventListener('pointerdown', (e) => { CP.drag = { x: e.clientX, yaw: CP.yaw }; try { c.setPointerCapture(e.pointerId); } catch (er) { /* ignore */ } });
    c.addEventListener('pointermove', (e) => { if (CP.drag) CP.yaw = CP.drag.yaw + (e.clientX - CP.drag.x) * 0.012; });
    const up = () => { CP.drag = null; };
    c.addEventListener('pointerup', up); c.addEventListener('pointercancel', up);
    return true;
  }
  function cpModel(pilotId, color) {
    const key = pilotId + '|' + color;
    if (CP.key === key) return;
    if (CP.ch) CP.scene.remove(CP.ch.root);
    CP.ch = buildChar(pilotId, color, null);
    CP.scene.add(CP.ch.root); CP.key = key; CP.t0 = performance.now();
    CP.ring.material.color.set(S.pilot(pilotId).accent);
    if (CP.rim) CP.rim.color.set(S.pilot(pilotId).accent);
    cpFxClear();
    CP.ch.accent = S.pilot(pilotId).accent; CP.ch.fx = cpFxSpawn;
    const tp = skinEntrance(pilotId);
    CP.ch.act = tp ? { name: 'enter', type: tp, t: 0 } : { name: 'show', t: 0 };   // 史诗以上皮肤：先播专属进场动作；否则播一整套展示动作
  }
  function cpSize(w, h) {
    CP.r.setPixelRatio(Math.min(1.5, window.devicePixelRatio || 1)); CP.r.setSize(w, h, false);
    CP.cam.aspect = w / Math.max(1, h); CP.cam.updateProjectionMatrix();
    const far = h > w * 1.15 ? 88 : 98;   // 留出跳跃和帽子的空间
    CP.cam.position.set(far * 0.8, 23, far * 0.6); CP.cam.lookAt(0, 16.5, 0);
    CP.w = w; CP.h = h;
  }
  function charPreview(host, pilotId, color) {
    if (!cpInit()) return false;
    shared();
    if (CP.host !== host) { host.appendChild(CP.canvas); CP.host = host; }
    cpModel(pilotId, color || S.pilot(pilotId).accent);
    cpSize(host.clientWidth || 220, host.clientHeight || 260);
    return true;
  }
  function charFrame(now, dt) {
    if (!CP.r || !CP.ch || !CP.host || !CP.canvas.isConnected || CP.canvas.offsetParent === null) return;
    if (CP.host.clientWidth !== CP.w || CP.host.clientHeight !== CP.h) cpSize(CP.host.clientWidth || 220, CP.host.clientHeight || 260);
    const t = (now - (CP.t0 || 0)) / 1000, ph = t % 7.5;
    if (!CP.drag && !CP.ch.act) CP.yaw += dt * 0.3;
    const face = CP.yaw;
    let sp = 0, fire = false;
    if (!CP.ch.act) {
      if (ph > 2.6 && ph < 4.4) sp = 120;
      if (ph > 4.8 && ph < 7) fire = Math.floor((ph - 4.8) / 0.7) !== Math.floor((ph - 4.8 - dt) / 0.7);
    }
    // 展示动作时转到正面朝向镜头，慢慢转回来
    const front = 0.45;
    if (CP.ch.act) CP.yaw += wrapA(front - CP.yaw) * Math.min(1, dt * 5);
    animateChar(CP.ch, { a: face, vx: Math.cos(face) * sp, vy: Math.sin(face) * sp }, dt, sp, { fire });
    CP.ch.root.rotation.y = -face + CP.ch.yawOff;
    const eo = CP.ch.enterOff;   // 1.9：进场动作的位移 / 缩放
    CP.ch.root.position.set(eo ? eo.x * Math.cos(face) : 0, eo ? eo.y : 0, eo ? -eo.x * Math.sin(face) : 0); CP.ch.root.scale.setScalar(eo ? eo.s : 1);
    for (let i = CP.fx.length - 1; i >= 0; i--) { const f = CP.fx[i]; f.t += dt; f.update(f.m, Math.min(1, f.t / f.life), dt, f.t); if (f.t >= f.life) { CP.scene.remove(f.m); CP.fx.splice(i, 1); } }
    CP.r.render(CP.scene, CP.cam);
  }

  // =====================================================================
  // 1.8：联动皮肤的 3D 战斗动画（约 20 秒，6 个镜头）
  //   夜都街头 → 角色登场 → 打小咒灵 → 百目现身、机兵空降 → 大招 → 胜利定格
  //   坐标沿用游戏里的 (x, y, z 朝上)；hooks.on(事件, 数据) 让 client 更新字幕 / 横幅 / 音效
  // =====================================================================
  const TRAILERS = {
    blaze_yato: { pilot: 'blaze', mech: 'blaster', atk: 'gun', sup: 'storm', col: '#ff4d3d' },
    fu_moon: { pilot: 'fu', mech: 'warden', atk: 'seal', sup: 'barrier', col: '#ffd35e' },
    frost_yato: { pilot: 'frost', mech: 'charger', atk: 'snipe', sup: 'beam', col: '#8a6bff' },
    aka_wraith: { pilot: 'aka', mech: 'reaper', atk: 'slash', sup: 'rend', col: '#ff2d4b' },
  };
  const TR = { r: null, on: false };
  const TR_LEN = 20.5;
  function trInit() {
    if (TR.r) return true;
    try { TR.canvas = document.createElement('canvas'); TR.canvas.className = 'tr-canvas'; TR.r = new T.WebGLRenderer({ canvas: TR.canvas, antialias: true }); } catch (e) { TR.r = null; return false; }
    TR.r.setClearColor(0x07041a);
    return true;
  }
  const g3 = (x, y, z) => new T.Vector3(x, z, y);   // 游戏坐标 → three.js
  function trStage() {
    const sc = new T.Scene(); sc.fog = new T.Fog(0x1a0d30, 260, 900);
    sc.add(new T.HemisphereLight(0x9a8cff, 0x24122e, 0.75));
    const moon = new T.DirectionalLight(0xd8ccff, 0.75); moon.position.set(-200, 300, -260); sc.add(moon);
    const rim = new T.DirectionalLight(0xff2d6a, 0.45); rim.position.set(220, 80, 200); sc.add(rim); TR.rim = rim;
    // 天空：渐变球 + 月亮
    const sky = new T.Mesh(new T.SphereGeometry(1200, 24, 12), new T.ShaderMaterial({ side: T.BackSide, depthWrite: false, fog: false, uniforms: {},
      vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'varying vec3 vP; void main(){ float h = normalize(vP).y; vec3 c = mix(vec3(0.48,0.16,0.47), vec3(0.03,0.02,0.1), smoothstep(-0.05,0.55,h)); gl_FragColor = vec4(c,1.0); }' }));
    sc.add(sky);
    const mn = new T.Mesh(new T.SphereGeometry(46, 24, 16), new T.MeshBasicMaterial({ color: 0xfff0d8, fog: false })); mn.position.set(-380, 420, -820); sc.add(mn);
    const halo = new T.Mesh(new T.SphereGeometry(80, 24, 16), new T.MeshBasicMaterial({ color: 0xb48cff, transparent: true, opacity: 0.18, fog: false, depthWrite: false })); halo.position.copy(mn.position); sc.add(halo);
    // 地面：柏油路 + 斑马线 + 霓虹车道线
    const gc = document.createElement('canvas'); gc.width = gc.height = 512;
    { const x = gc.getContext('2d'); x.fillStyle = '#26222f'; x.fillRect(0, 0, 512, 512); for (let i = 0; i < 900; i++) { x.fillStyle = `rgba(255,255,255,${Math.random() * 0.05})`; x.fillRect(Math.random() * 512, Math.random() * 512, 2, 2); }
      x.fillStyle = '#d8d4e4'; for (let i = 0; i < 8; i++) x.fillRect(40 + i * 56, 360, 30, 110);
      x.strokeStyle = '#8a6bff'; x.lineWidth = 5; x.setLineDash([40, 30]); x.beginPath(); x.moveTo(0, 256); x.lineTo(512, 256); x.stroke(); }
    const gt = new T.CanvasTexture(gc); gt.wrapS = gt.wrapT = T.RepeatWrapping; gt.repeat.set(4, 4);
    const ground = new T.Mesh(new T.PlaneGeometry(1600, 1600), new T.MeshLambertMaterial({ map: gt })); ground.rotation.x = -Math.PI / 2; sc.add(ground);
    // 两排高楼：亮着的窗户 + 霓虹招牌
    const wc = document.createElement('canvas'); wc.width = 64; wc.height = 128;
    { const x = wc.getContext('2d'); x.fillStyle = '#1a1626'; x.fillRect(0, 0, 64, 128); const lit = ['#ffd38a', '#b48cff', '#7af0ff', '#ff6e9a']; for (let j = 4; j < 128; j += 9) for (let i = 4; i < 64; i += 9) if (Math.random() < 0.45) { x.fillStyle = lit[Math.floor(Math.random() * 4)]; x.fillRect(i, j, 5, 6); } }
    const wt = new T.CanvasTexture(wc); wt.wrapS = wt.wrapT = T.RepeatWrapping;
    const neon = (txt, col) => { const c = document.createElement('canvas'); c.width = 256; c.height = 96; const x = c.getContext('2d'); x.fillStyle = '#0d0818'; x.fillRect(0, 0, 256, 96); x.font = 'bold 64px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.shadowColor = col; x.shadowBlur = 18; x.fillStyle = col; x.fillText(txt, 128, 50); return new T.MeshBasicMaterial({ map: new T.CanvasTexture(c), fog: false }); };
    const signs = [['夜都', '#ff2d6a'], ['符', '#ffd35e'], ['灵', '#8a6bff'], ['24H', '#7af0ff'], ['拉面', '#ff8a1f'], ['结界', '#b48cff']];
    for (let i = 0; i < 12; i++) for (const side of [-1, 1]) {
      const h = 140 + ((i * 53) % 5) * 45, w = 70 + ((i * 31) % 3) * 20, x = -260 + i * 90, y = side * (170 + ((i * 17) % 3) * 20);
      const m = new T.MeshLambertMaterial({ map: wt.clone(), emissive: new T.Color(0x2a1a3a), emissiveMap: wt });
      m.map.repeat.set(w / 64, h / 128); m.map.needsUpdate = true;
      const b = new T.Mesh(new T.BoxGeometry(w, h, 60), m); b.position.copy(g3(x, y, h / 2)); sc.add(b);
      if (i % 2 === 0) { const [tx, col] = signs[(i / 2 + (side > 0 ? 3 : 0)) % signs.length]; const s = new T.Mesh(new T.PlaneGeometry(48, 18), neon(tx, col)); s.position.copy(g3(x, y - side * 31, 60 + (i % 3) * 20)); s.rotation.y = side > 0 ? 0 : Math.PI; sc.add(s); }
    }
    // 鸟居门 + 两排石灯笼（远处）
    const red = new T.MeshLambertMaterial({ color: 0xc8102e });
    for (const y of [-60, 60]) { const p = new T.Mesh(new T.CylinderGeometry(4, 4.6, 120, 10), red); p.position.copy(g3(330, y, 60)); sc.add(p); }
    { const b1 = new T.Mesh(new T.BoxGeometry(14, 10, 170), red); b1.position.copy(g3(330, 0, 122)); sc.add(b1); const b2 = new T.Mesh(new T.BoxGeometry(10, 7, 140), red); b2.position.copy(g3(330, 0, 98)); sc.add(b2); }
    for (let i = 0; i < 6; i++) for (const y of [-110, 110]) { const L = new T.Group(); L.add(new T.Mesh(new T.BoxGeometry(10, 26, 10), new T.MeshLambertMaterial({ color: 0x8a8ea0 }))); const lt = new T.Mesh(new T.BoxGeometry(12, 10, 12), new T.MeshBasicMaterial({ color: 0xffd38a })); lt.position.y = 18; L.add(lt); L.position.copy(g3(-140 + i * 80, y, 13)); sc.add(L); }
    // 粒子（加色发光）
    const N = 700, pos = new Float32Array(N * 3), col = new Float32Array(N * 3), size = new Float32Array(N), alpha = new Float32Array(N);
    for (let i = 0; i < N; i++) pos[i * 3 + 1] = -9999;
    const pg = new T.BufferGeometry(); pg.setAttribute('position', new T.BufferAttribute(pos, 3)); pg.setAttribute('color', new T.BufferAttribute(col, 3)); pg.setAttribute('size', new T.BufferAttribute(size, 1)); pg.setAttribute('alpha', new T.BufferAttribute(alpha, 1));
    const pm = new T.ShaderMaterial({ vertexShader: PVS, fragmentShader: PFS, vertexColors: true, transparent: true, depthWrite: false, blending: T.AdditiveBlending, uniforms: { soft: { value: 1 } } });
    const pts = new T.Points(pg, pm); pts.frustumCulled = false; sc.add(pts);
    TR.ps = { pts, pos, col, size, alpha, d: new Array(N).fill(null), i: 0, n: N };
    // 飘着的灵火
    TR.wisps = [];
    for (let i = 0; i < 60; i++) TR.wisps.push({ x: -260 + Math.random() * 640, y: (Math.random() - 0.5) * 300, z: Math.random() * 160, s: 0.4 + Math.random() });
    return sc;
  }
  function trEmit(x, y, z, color, n, spd = 160, opt = {}) {
    const P2 = TR.ps; if (!P2) return;
    _c.set(color);
    for (let k = 0; k < n; k++) {
      const i = P2.i; P2.i = (P2.i + 1) % P2.n;
      const a = Math.random() * 6.283, e = (Math.random() - 0.2) * (opt.up == null ? 1.2 : opt.up), v = spd * (0.3 + Math.random());
      let vx = Math.cos(a) * Math.cos(e) * v, vy = Math.sin(a) * Math.cos(e) * v, vz = Math.sin(e) * v;
      if (opt.dir) { vx = opt.dir.x * v + (Math.random() - 0.5) * v * 0.4; vy = opt.dir.y * v + (Math.random() - 0.5) * v * 0.4; vz = (opt.dir.z || 0) * v + (Math.random() - 0.3) * v * 0.4; }
      const life = (opt.life || 0.6) * (0.6 + Math.random() * 0.8);
      P2.d[i] = { x, y, z, vx, vy, vz, life, max: life, s0: (opt.size || 10) * (0.7 + Math.random() * 0.6), grav: opt.grav == null ? 200 : opt.grav, drag: opt.drag || 1.5, grow: opt.grow || 0 };
      P2.col[i * 3] = _c.r; P2.col[i * 3 + 1] = _c.g; P2.col[i * 3 + 2] = _c.b;
    }
    P2.pts.geometry.attributes.color.needsUpdate = true;
  }
  function trStepPS(dt) {
    const P2 = TR.ps;
    for (let i = 0; i < P2.n; i++) {
      const p = P2.d[i]; if (!p) continue;
      p.life -= dt;
      if (p.life <= 0) { P2.d[i] = null; P2.pos[i * 3 + 1] = -9999; P2.alpha[i] = 0; continue; }
      const f = Math.exp(-p.drag * dt); p.vx *= f; p.vy *= f; p.vz = p.vz * f - p.grav * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z = Math.max(0.5, p.z + p.vz * dt);
      P2.pos[i * 3] = p.x; P2.pos[i * 3 + 1] = p.z; P2.pos[i * 3 + 2] = p.y;
      const k = p.life / p.max; P2.size[i] = p.s0 * (1 + p.grow * (1 - k)); P2.alpha[i] = Math.min(1, k * 1.6);
    }
    for (const a of ['position', 'size', 'alpha']) P2.pts.geometry.attributes[a].needsUpdate = true;
  }
  // 小工具：发光球（子弹）/ 光圈 / 月牙刀气 / 光束
  const trMeshes = [];
  function trFx(make, life, update) { const m = make(); TR.scene.add(m); trMeshes.push({ m, t: 0, life, update }); return m; }
  function trRing(x, y, z, r, color, life = 0.5) {
    trFx(() => { const m = new T.Mesh(new T.RingGeometry(0.85, 1, 48), new T.MeshBasicMaterial({ color, transparent: true, side: T.DoubleSide, depthWrite: false, blending: T.AdditiveBlending })); m.rotation.x = -Math.PI / 2; m.position.copy(g3(x, y, z + 1)); return m; },
      life, (m, k) => { m.scale.setScalar(r * (0.25 + 0.75 * Math.sqrt(k))); m.material.opacity = 0.95 * (1 - k); });
  }
  function trShot(x0, y0, z0, x1, y1, z1, color, dur, size = 3, onHit) {
    trFx(() => new T.Mesh(new T.SphereGeometry(size, 10, 8), new T.MeshBasicMaterial({ color, transparent: true, blending: T.AdditiveBlending, depthWrite: false })), dur,
      (m, k, dt) => { m.position.copy(g3(x0 + (x1 - x0) * k, y0 + (y1 - y0) * k, z0 + (z1 - z0) * k + Math.sin(k * Math.PI) * 6)); if (Math.random() < 0.7) trEmit(m.position.x, m.position.z, m.position.y, color, 1, 20, { size: size * 2.2, life: 0.25, grav: 0 }); if (k >= 0.999 && onHit) { onHit(); onHit = null; } void dt; });
  }
  function trBeam(x0, y0, z0, x1, y1, z1, color, dur, w) {
    trFx(() => { const g = new T.Group(); const o = new T.Mesh(new T.CylinderGeometry(1, 1, 1, 12, 1, true), new T.MeshBasicMaterial({ color, transparent: true, opacity: 0.6, blending: T.AdditiveBlending, depthWrite: false })); const c = new T.Mesh(new T.CylinderGeometry(0.4, 0.4, 1, 8), new T.MeshBasicMaterial({ color: 0xffffff })); g.add(o); g.add(c); const a = g3(x0, y0, z0), b = g3(x1, y1, z1), L = a.distanceTo(b); g.position.copy(a).add(b).multiplyScalar(0.5); g.lookAt(b); g.rotateX(Math.PI / 2); g.scale.set(w, L, w); return g; },
      dur, (m, k) => { const s = w * (k < 0.1 ? k / 0.1 : 1 - Math.max(0, k - 0.75) / 0.25) * (0.85 + Math.random() * 0.3); m.scale.x = m.scale.z = Math.max(0.01, s); });
  }
  function trCres(x, y, z, a, len, color, dur) {
    trFx(() => new T.Mesh(new T.TorusGeometry(30, 5, 6, 20, Math.PI), new T.MeshBasicMaterial({ color, transparent: true, blending: T.AdditiveBlending, depthWrite: false })), dur,
      (m, k) => { const d = len * k; m.position.copy(g3(x + Math.cos(a) * d, y + Math.sin(a) * d, z)); m.rotation.set(Math.PI / 2, 0, -a - Math.PI / 2); m.scale.set(1.6 + k, 1.6 + k, 1); m.material.opacity = 1 - k * 0.6; trEmit(m.position.x, m.position.z, m.position.y, color, 4, 80, { size: 14, life: 0.4, grav: 0 }); });
  }
  function trDome(x, y, r, color, dur) {
    trFx(() => { const g = new T.Group(); g.add(new T.Mesh(new T.SphereGeometry(1, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), new T.MeshBasicMaterial({ color, transparent: true, opacity: 0.25, side: T.DoubleSide, blending: T.AdditiveBlending, depthWrite: false }))); const rg = new T.Mesh(new T.RingGeometry(0.9, 1, 64), new T.MeshBasicMaterial({ color: 0xd8b25a, transparent: true, side: T.DoubleSide })); rg.rotation.x = -Math.PI / 2; rg.position.y = 0.01; g.add(rg); g.position.copy(g3(x, y, 0)); return g; },
      dur, (m, k) => { const s = r * Math.min(1, k * 4); m.scale.set(s, s, s); m.children[0].material.opacity = 0.28 * (1 - Math.max(0, k - 0.8) / 0.2); m.rotation.y = k * 2; });
  }
  // 镜头关键帧：[时间, 机位 x y z, 看向 x y z, 视角]
  const TR_CAM = [
    [0, -190, 120, 70, 60, 0, 30, 46], [3.2, -95, 60, 36, 40, 0, 24, 46],
    [3.3, 86, -72, 14, 0, 0, 18, 40], [6.1, 74, 80, 20, 0, 0, 18, 36],
    [6.2, -70, -24, 34, 80, 0, 18, 44], [10.1, 10, -40, 30, 120, 0, 20, 44],
    [10.2, -120, -150, 80, 150, 0, 60, 50], [14.1, -70, -110, 50, 140, 0, 60, 52],
    [14.2, 30, -122, 40, 150, -10, 40, 56], [18.1, 100, -132, 74, 165, 0, 46, 60],
    [18.2, 96, -74, 24, 10, -10, 20, 38], [20.5, 78, -60, 22, 10, -10, 20, 34],
  ];
  function trCam(t) {
    let i = 0; while (i < TR_CAM.length - 2 && t >= TR_CAM[i + 1][0]) i++;
    const a = TR_CAM[i], b = TR_CAM[i + 1], k = ease(Math.max(0, Math.min(1, (t - a[0]) / Math.max(0.01, b[0] - a[0]))));
    const L = (j) => a[j] + (b[j] - a[j]) * k;
    const sh = TR.shake || 0;
    TR.cam.position.copy(g3(L(1) + (Math.random() - 0.5) * sh, L(2) + (Math.random() - 0.5) * sh, L(3) + (Math.random() - 0.5) * sh));
    TR.cam.lookAt(g3(L(4), L(5), L(6))); TR.cam.fov = L(7); TR.cam.updateProjectionMatrix();
  }
  function trailerStart(host, skinId, hooks) {
    const K = S.skin(skinId), C = TRAILERS[skinId];
    if (!K || !C || !trInit()) return false;
    shared(); trailerStop(true);
    TR.scene = trStage(); TR.hooks = hooks || { on() {} }; TR.cfg = C; TR.skin = K; TR.t = 0; TR.shake = 0; TR.fired = {}; TR.on = true; TR.slow = 1; TR.sx = null; TR.sy = null; TR.bossHit = 0;
    const P = S.pilot(C.pilot + '@' + skinId);
    TR.hero = buildChar(C.pilot + '@' + skinId, P.accent, null); TR.scene.add(TR.hero.root); TR.hero.root.visible = false;
    TR.mech = makeBot(P.accent, 'antenna', C.mech, C.pilot + '@' + skinId, C.mech === 'warden' || C.pilot === 'fu' ? 'm_talisman' : null); TR.scene.add(TR.mech.root); TR.mech.root.visible = false;
    TR.boss = makeCreature('boss'); TR.boss.root.scale.setScalar(1.25); TR.scene.add(TR.boss.root); TR.boss.root.visible = false;
    TR.spirits = [[90, -40], [120, 30], [150, -10], [100, 60]].map(([x, y]) => { const c = makeCreature('spirit'); c.root.scale.setScalar(1.3); TR.scene.add(c.root); c.root.visible = false; return { c, x, y, hp: 1, hit: 0, dead: 0 }; });
    TR.cam = new T.PerspectiveCamera(46, 1, 1, 3000);
    if (TR.canvas.parentNode !== host) host.appendChild(TR.canvas);
    TR.host = host; trSize();
    TR.last = performance.now();
    const loop = (now) => { if (!TR.on) return; TR.raf = requestAnimationFrame(loop); trFrame(now); };
    TR.raf = requestAnimationFrame(loop);
    return true;
  }
  function trSize() { const w = TR.host.clientWidth || 800, h = TR.host.clientHeight || 450; TR.r.setPixelRatio(Math.min(1.5, window.devicePixelRatio || 1)); TR.r.setSize(w, h, false); TR.cam.aspect = w / Math.max(1, h); TR.cam.updateProjectionMatrix(); TR.w = w; TR.h = h; }
  function trailerStop(silent) {
    if (!TR.on && !TR.scene) return;
    TR.on = false; if (TR.raf) cancelAnimationFrame(TR.raf);
    for (const f of trMeshes.splice(0)) { TR.scene && TR.scene.remove(f.m); }
    if (TR.scene) TR.scene.traverse((o) => { if (o.geometry && !Object.values(SH).includes(o.geometry)) o.geometry.dispose(); });
    TR.scene = null; TR.ps = null;
    if (!silent && TR.hooks) TR.hooks.on('end');
  }
  function trOnce(key, t, at) { if (t >= at && !TR.fired[key]) { TR.fired[key] = true; return true; } return false; }
  function trFrame(now) {
    if (TR.host.clientWidth !== TR.w || TR.host.clientHeight !== TR.h) trSize();
    const rdt = Math.min(0.05, (now - TR.last) / 1000); TR.last = now;
    const t0 = TR.t;
    TR.slow = TR.t > 16.6 && TR.t < 17.5 ? 0.35 : 1;   // 百目爆炸前的慢动作
    const dt = rdt * TR.slow; TR.t += dt;
    const t = TR.t, C = TR.cfg, H = TR.hero, M = TR.mech, B = TR.boss, on = TR.hooks.on, col = C.col;
    if (t >= TR_LEN) { trailerStop(); return; }
    TR.shake = Math.max(0, TR.shake - rdt * 18);
    // ---- 镜头 1：夜都街头，小咒灵从地里冒出来 ----
    if (trOnce('cap', t, 0.3)) on('cap', '夜都 · 午夜零点');
    TR.spirits.forEach((s, i) => {
      const rise = Math.max(0, Math.min(1, (t - 0.9 - i * 0.45) / 0.8));
      if (rise > 0 && !s.dead) s.c.root.visible = true;
      if (rise > 0 && rise < 1 && Math.random() < 0.5) trEmit(s.x, s.y, 4, '#2a0a3a', 2, 40, { size: 26, life: 0.8, grav: -40, up: 1.5 });
      if (s.dead) { s.dead += dt; s.c.root.scale.setScalar(Math.max(0.01, 1.3 * (1 - s.dead * 3))); if (s.dead > 0.35) s.c.root.visible = false; }
      const kx = s.hit > 0 ? (s.hit -= dt, s.hit * 60) : 0;
      animateCreature(s.c, { x: s.x + kx, y: s.y, z: -18 * (1 - rise), a: Math.PI + Math.sin(t + i) * 0.4, flash: s.hit > 0.15 ? 0.8 : 0 }, now, dt, false);
    });
    // ---- 镜头 2：角色从天而降 ----
    if (t >= 3.3) {
      H.root.visible = t < 11.9 || t >= 18.2;
      const drop = Math.max(0, 1 - (t - 3.3) / 0.35);
      let hx = 0, hy = 0, face = -0.5, sp = 0, fire = false;
      if (trOnce('land', t, 3.65)) { trRing(0, 0, 0, 70, col, 0.6); trRing(0, 0, 0, 110, '#ffffff', 0.5); trEmit(0, 0, 4, '#5a5266', 30, 160, { size: 22, life: 0.8, grav: -20, up: 0.4 }); TR.shake = 7; on('sfx', 'boom'); H.act = { name: 'hello', t: 0 }; }
      if (trOnce('name', t, 3.9)) on('name', { skin: TR.skin.name, pilot: S.pilot(C.pilot) });
      if (trOnce('line', t, 4.8)) on('line', S.pilot(C.pilot).line);
      // ---- 镜头 3：打小咒灵（每个角色的招式不一样） ----
      if (t >= 6.2 && t < 10.2) {
        const u = t - 6.2; face = 0;
        hx = Math.min(40, u * 40); sp = u < 1 ? 120 : 0;
        const tg = TR.spirits.filter((s) => !s.dead);
        const target = tg[0];
        const hitS = (s, color) => { s.hit = 0.3; trEmit(s.x, s.y, 26, color, 26, 220, { size: 12, life: 0.5 }); if (++s.hp > 3) { s.dead = 0.001; trEmit(s.x, s.y, 24, '#b48cff', 40, 260, { size: 14, life: 0.8, grav: -60 }); trRing(s.x, s.y, 0, 70, '#b48cff', 0.5); on('sfx', 'kill'); } else on('sfx', 'hit'); };
        if (target) face = Math.atan2(target.y - hy, target.x - hx);
        if (C.atk === 'gun' || C.atk === 'seal') {
          const every = C.atk === 'gun' ? 0.22 : 0.3;
          if (u > 1 && Math.floor((u - 1) / every) !== Math.floor((u - 1 - dt) / every) && target) {
            fire = true; H.swing = 1;
            const s = target, cc = C.atk === 'seal' ? '#f4e6c8' : col;
            trShot(hx + 8, hy, 18, s.x, s.y, 24, cc, 0.28, C.atk === 'seal' ? 2.6 : 3, () => hitS(s, cc));
            on('sfx', 'shoot');
          }
          if (C.atk === 'seal' && trOnce('sealz', t, 8.0)) { const cx = 120, cy = 10; trRing(cx, cy, 0, 130, '#d8b25a', 1.6); trRing(cx, cy, 0, 100, '#ff2d4b', 1.6); for (const s of tg) { s.hit = 0.6; trBeam(cx, cy, 2, s.x, s.y, 26, '#d8b25a', 1.2, 1.2); } on('sfx', 'special'); }
        } else if (C.atk === 'snipe') {
          if (u > 1 && u < 3.6 && target) {
            if (Math.random() < 0.4) trEmit(hx + 10, hy, 20, col, 1, 20, { size: 10, life: 0.3, grav: 0 });
            const ph = (u - 1) % 0.9;
            if (ph < dt) { fire = true; trBeam(hx + 10, hy, 20, target.x, target.y, 24, col, 0.25, 2.4); target.hp = 3; hitS(target, col); TR.shake = 4; on('sfx', 'snipe'); }
          }
        } else if (C.atk === 'slash') {
          if (TR.sx == null) { TR.sx = hx; TR.sy = 0; }
          if (target && u > 0.6) {
            const tx = target.x - 24, ty = target.y, dd = Math.hypot(tx - TR.sx, ty - TR.sy), st = Math.min(dd, 380 * dt);
            if (dd > 0.5) { TR.sx += ((tx - TR.sx) / dd) * st; TR.sy += ((ty - TR.sy) / dd) * st; sp = dd > 4 ? 300 : 0; }
            hx = TR.sx; hy = TR.sy;
            if (Math.floor(u / 0.45) !== Math.floor((u - dt) / 0.45)) { fire = true; H.swing = 1; trCres(hx, hy, 16, face, 30, col, 0.25); trEmit(target.x, target.y, 22, col, 20, 200, { size: 12, life: 0.4 }); hitS(target, col); TR.shake = 3; }
          }
          if (Math.random() < 0.5) trEmit(hx + (Math.random() - 0.5) * 16, hy + (Math.random() - 0.5) * 16, 6, Math.random() < 0.5 ? col : '#3a0a18', 1, 30, { size: 14, life: 0.5, grav: -90 });
        }
      }
      else if (C.atk === 'slash' && t >= 6.2 && t < 10.2 && TR.sx != null) { hx = TR.sx; hy = TR.sy; }
      if (t >= 10.2) { hx = 40; hy = 0; face = 0.3; }
      if (t >= 18.2) { hx = 0; hy = 0; face = -0.6; if (trOnce('vic', t, 18.3)) H.act = { name: 'victory', t: 0 }; }
      H.root.position.copy(g3(hx, hy, drop * 90));
      animateChar(H, { a: face, vx: Math.cos(face) * sp, vy: Math.sin(face) * sp }, rdt, sp, { fire });
      H.root.rotation.y = -face + H.yawOff;
    }
    // ---- 镜头 4：百目现身 + 机兵空降 ----
    if (t >= 10.2 && t < 18.2) {
      B.root.visible = true;
      const rise = Math.min(1, (t - 10.2) / 1.6), hurtK = TR.bossHit > 0 ? (TR.bossHit -= dt, 1) : 0;
      if (rise < 1 && Math.random() < 0.8) trEmit(240 + (Math.random() - 0.5) * 120, (Math.random() - 0.5) * 120, 4, '#2a0a3a', 3, 60, { size: 40, life: 1.2, grav: -40, up: 1.6 });
      if (trOnce('boss', t, 10.6)) { on('cap', '咒灵「百目」'); on('sfx', 'siren'); TR.shake = 5; }
      if (trOnce('absorb', t, 10.5)) for (const s of TR.spirits) if (!s.dead) { s.dead = 0.001; trEmit(s.x, s.y, 24, '#b48cff', 30, 220, { size: 14, life: 0.7, grav: -80 }); trBeam(s.x, s.y, 24, 240, 0, 60, '#b48cff', 0.4, 1.2); }   // 剩下的小咒灵被百目吸走
      const dying = t >= 17.3;
      animateCreature(B, { x: 240 + hurtK * 6, y: 0, z: -120 * (1 - rise), a: Math.PI, flash: hurtK ? 0.6 : 0 }, now, dt, t > 12.5);
      if (dying) { const k = (t - 17.3) / 0.9; B.root.scale.setScalar(1.25 * Math.max(0.01, 1 - k)); if (Math.random() < 0.9) trEmit(240, 0, 50 + Math.random() * 60, Math.random() < 0.5 ? '#b48cff' : '#ff2d4b', 8, 260, { size: 18, life: 1, grav: -40 }); }
      if (trOnce('bossdie', t, 17.3)) { trRing(240, 0, 0, 220, '#ffffff', 0.8); trRing(240, 0, 0, 300, '#b48cff', 1); TR.shake = 12; on('flash'); on('sfx', 'boom'); }
      // 机兵从天而降
      const md = Math.max(0, 1 - (t - 11.2) / 0.4);
      if (t >= 11.2) M.root.visible = true;
      if (trOnce('mech', t, 11.6)) { trRing(60, -30, 0, 90, col, 0.6); trRing(60, -30, 0, 140, '#ffffff', 0.6); trEmit(60, -30, 4, '#5a5266', 40, 200, { size: 26, life: 0.9, grav: -20, up: 0.4 }); TR.shake = 9; on('sfx', 'boom'); }
      if (trOnce('board', t, 11.9)) { trEmit(40, 0, 20, col, 20, 120, { size: 10, life: 0.5, grav: -100 }); on('cap', '机兵出击！'); }
      let firing = false;
      if (t > 12.4 && t < 14.1 && Math.floor((t - 12.4) / 0.32) !== Math.floor((t - 12.4 - dt) / 0.32)) {
        firing = true; on('sfx', 'shoot');
        if (C.mech === 'charger') trBeam(70, -30, 26, 230, 0, 60, col, 0.2, 2);
        else if (C.mech === 'reaper') trCres(70, -30, 24, Math.atan2(30, 170), 160, col, 0.35);
        else for (let i = 0; i < (C.mech === 'warden' ? 2 : 1); i++) trShot(70, -30, 28, 230, (Math.random() - 0.5) * 30, 60, C.mech === 'warden' ? '#d8b25a' : col, 0.3, 4, () => { TR.bossHit = 0.2; trEmit(225, 0, 60, col, 16, 200, { size: 12, life: 0.4 }); });
      }
      // ---- 镜头 5：大招 ----
      if (trOnce('cut', t, 14.2)) { on('cut', { pilot: S.pilot(C.pilot + '@' + TR.skin.id), sup: S.SPECIALS[C.sup] ? S.SPECIALS[C.sup].name : '', mech: S.WEAPONS[C.mech].name }); on('flash'); on('sfx', 'special'); TR.shake = 6; }
      if (t > 15.1 && t < 17.3) {
        const u = t - 15.1;
        if (C.sup === 'storm' && Math.floor(u / 0.45) !== Math.floor((u - dt) / 0.45)) { trRing(60, -30, 0, 160, col, 0.6); for (let i = 0; i < 14; i++) { const a = (i / 14) * Math.PI * 2; trShot(60, -30, 26, 60 + Math.cos(a) * 200 + (a > -1 && a < 1 ? 60 : 0), -30 + Math.sin(a) * 200, 30, col, 0.5, 3.5); } TR.bossHit = 0.3; TR.shake = 5; on('sfx', 'boom'); }
        if (C.sup === 'barrier') { if (trOnce('dome', t, 15.15)) { trDome(60, -30, 170, col, 2.2); on('sfx', 'special'); } if (Math.floor(u / 0.3) !== Math.floor((u - dt) / 0.3)) { trBeam(60 + (Math.random() - 0.5) * 80, -30 + (Math.random() - 0.5) * 80, 60, 240, 0, 60, '#d8b25a', 0.3, 1.6); TR.bossHit = 0.2; } }
        if (C.sup === 'beam' && trOnce('beam', t, 15.2)) { trBeam(70, -30, 26, 240, 0, 60, col, 2, 9); TR.shake = 8; on('sfx', 'snipe'); }
        if (C.sup === 'beam') { TR.bossHit = 0.1; if (Math.random() < 0.8) trEmit(235, 0, 60, col, 6, 260, { size: 14, life: 0.4 }); }
        if (C.sup === 'rend') { if (u < 0.6 && Math.random() < 0.9) trEmit(60 + (Math.random() - 0.5) * 30, -30 + (Math.random() - 0.5) * 30, 10 + Math.random() * 40, col, 2, 40, { size: 16, life: 0.4, grav: -120 }); if (trOnce('rend', t, 15.8)) { trCres(60, -30, 30, Math.atan2(30, 180), 220, col, 0.5); trBeam(60, -30, 30, 300, 10, 40, '#ffffff', 0.4, 3); TR.bossHit = 0.6; TR.shake = 10; on('flash'); on('sfx', 'boom'); } }
      }
      M.root.position.copy(g3(60, -30, md * 140));
      animateBot(M, { x: 60, y: -30, z: md * 140, vx: 0, vy: 0, vz: md ? -400 : 0, a: Math.atan2(30, 180), pt: 0.05, flags: 1 | (firing ? 16 : 0) | (t > 15.1 && t < 17.3 ? 128 : 0), charge: 0, tank: 100, flash: 0, weapon: C.mech }, now, rdt);
    } else if (t >= 18.2) { B.root.visible = false; M.root.visible = true; animateBot(M, { x: 60, y: -30, z: 0, vx: 0, vy: 0, vz: 0, a: -0.4, pt: 0, flags: 1, charge: 0, tank: 100, flash: 0, weapon: C.mech }, now, rdt); }
    // ---- 镜头 6：胜利定格 ----
    if (trOnce('title', t, 18.6)) on('title', { skin: TR.skin, pilot: S.pilot(C.pilot) });
    if (trOnce('fade', t, 19.9)) on('fade');
    // 灵火 + 粒子
    for (const w of TR.wisps) { w.z += dt * 10 * w.s; w.x += Math.sin(t + w.y) * dt * 6; if (w.z > 170) w.z = 0; if (Math.random() < 0.06) trEmit(w.x, w.y, w.z, '#b48cff', 1, 4, { size: 9 * w.s, life: 0.8, grav: -10 }); }
    for (let i = trMeshes.length - 1; i >= 0; i--) { const f = trMeshes[i]; f.t += dt; const k = Math.min(1, f.t / f.life); f.update(f.m, k, dt); if (f.t >= f.life) { TR.scene.remove(f.m); trMeshes.splice(i, 1); } }
    trStepPS(dt);
    TR.rim.color.set(t > 12.5 && t < 17.5 ? '#ff2d4b' : col);
    trCam(t);
    TR.r.render(TR.scene, TR.cam);
    void t0;
  }
  const hx0 = (u) => Math.min(40, u * 40);

  // ---------------- 1.5：结算台——我方全队 3D 模型，赢了轮流庆祝 + 彩纸，输了垂头丧气 ----------------
  const TS = { list: [] };
  function tsInit() {
    if (TS.r) return true;
    if (!T) return false;
    try {
      TS.canvas = document.createElement('canvas'); TS.canvas.className = 'ts-canvas';
      TS.r = new T.WebGLRenderer({ canvas: TS.canvas, antialias: true, alpha: true });
    } catch (e) { TS.r = null; return false; }
    TS.scene = new T.Scene();
    TS.scene.add(new T.HemisphereLight(0xeef0ff, 0x4a3a5a, 0.66));
    const sun = new T.DirectionalLight(0xfff2e0, 0.66); sun.position.set(40, 110, 90); TS.scene.add(sun);
    TS.rim = new T.DirectionalLight(0xffffff, 0.5); TS.rim.position.set(-30, 60, -90); TS.scene.add(TS.rim);
    // 舞台：一条长台 + 每人脚下一个光圈
    TS.stage = new T.Mesh(new T.CylinderGeometry(1, 1, 1, 48), new T.MeshLambertMaterial({ color: 0x2a2440 }));
    TS.stage.scale.set(70, 2, 26); TS.stage.position.y = -1; TS.scene.add(TS.stage);
    const sc = document.createElement('canvas'); sc.width = sc.height = 64;
    { const x = sc.getContext('2d'), g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(0,0,0,0.5)'); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64); }
    TS.shadowTex = new T.CanvasTexture(sc);
    // 彩纸：一堆小方片从天上飘下来
    const N = 160, pos = new Float32Array(N * 3), col = new Float32Array(N * 3);
    const pal = [0xff3ea5, 0x1fd6ee, 0x9cff2e, 0xffe600, 0xff8a1f, 0xb78cff].map((c) => new T.Color(c));
    TS.conf = [];
    for (let i = 0; i < N; i++) { const c = pal[i % pal.length]; col.set([c.r, c.g, c.b], i * 3); TS.conf.push({ x: 0, y: 0, z: 0, vy: 0, sx: 0, ph: 0 }); }
    const g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(pos, 3)); g.setAttribute('color', new T.BufferAttribute(col, 3));
    TS.points = new T.Points(g, new T.PointsMaterial({ size: 2.2, vertexColors: true, sizeAttenuation: true }));
    TS.points.frustumCulled = false; TS.scene.add(TS.points);
    TS.cam = new T.PerspectiveCamera(30, 2, 1, 900);
    return true;
  }
  function resetConf(c, top) { c.x = (Math.random() - 0.5) * 150; c.y = top ? 60 + Math.random() * 70 : Math.random() * 120; c.z = (Math.random() - 0.5) * 50 - 5; c.vy = 9 + Math.random() * 12; c.sx = (Math.random() - 0.5) * 6; c.ph = Math.random() * 6; }
  // list: [{ pilot: 'id@skin', color, mvp }]（第一个放中间）
  function teamShow(host, list, won) {
    if (!tsInit()) return false;
    shared();
    if (TS.host !== host) { host.appendChild(TS.canvas); TS.host = host; }
    for (const m of TS.list) TS.scene.remove(m.g);
    TS.list = [];
    const n = Math.min(4, list.length);
    const gap = n >= 4 ? 30 : 33;
    // 中间站 MVP，其余左右交替
    const xs = n === 1 ? [0] : n === 2 ? [-gap / 2, gap / 2] : n === 3 ? [0, -gap, gap] : [-gap / 2, gap / 2, -gap * 1.5, gap * 1.5];
    for (let i = 0; i < n; i++) {
      const it = list[i], ch = buildChar(it.pilot, it.color, null);
      const g = new T.Group(); g.add(ch.root);
      const sh = new T.Mesh(new T.PlaneGeometry(20, 20), new T.MeshBasicMaterial({ map: TS.shadowTex, transparent: true, depthWrite: false }));
      sh.rotation.x = -Math.PI / 2; sh.position.y = 0.1; g.add(sh);
      const ring = new T.Mesh(new T.RingGeometry(9.2, 10.6, 40), new T.MeshBasicMaterial({ color: it.mvp ? 0xffd23f : new T.Color(it.color), transparent: true, opacity: it.mvp ? 0.95 : 0.6 }));
      ring.rotation.x = -Math.PI / 2; ring.position.y = 0.15; g.add(ring);
      const k = it.mvp ? 1.12 : 1;
      g.scale.setScalar(k);
      g.position.set(xs[i], 0, it.mvp ? 5 : (i >= 3 || (n === 3 && i > 0) ? -3 : 0));
      TS.scene.add(g);
      TS.list.push({ g, ch, mvp: !!it.mvp, delay: 0.25 + i * 0.35, next: 0.25 + i * 0.35, yaw: 0.25 * (xs[i] > 0 ? -1 : xs[i] < 0 ? 1 : 0) });
    }
    TS.won = !!won; TS.t = 0; TS.n = n;
    TS.rim.color.set(list[0] ? list[0].color : '#ffffff');
    TS.points.visible = !!won;
    for (const c of TS.conf) resetConf(c, false);
    tsSize();
    return true;
  }
  function tsSize() {
    const w = TS.host.clientWidth || 600, h = TS.host.clientHeight || 300;
    TS.r.setPixelRatio(Math.min(1.5, window.devicePixelRatio || 1)); TS.r.setSize(w, h, false);
    TS.cam.aspect = w / Math.max(1, h); TS.cam.updateProjectionMatrix();
    // 让整排人都在画面里：宽度不够时拉远镜头
    const span = (TS.n >= 4 ? 120 : TS.n === 3 ? 100 : TS.n === 2 ? 70 : 46);
    const vfov = (TS.cam.fov * Math.PI) / 180, hfov = 2 * Math.atan(Math.tan(vfov / 2) * TS.cam.aspect);
    const dist = Math.max(span / 2 / Math.tan(hfov / 2), 44 / Math.tan(vfov / 2)) * 1.05;
    TS.cam.position.set(0, 22 + dist * 0.12, dist); TS.cam.lookAt(0, 14, 0);
    TS.w = w; TS.h = h;
  }
  function teamFrame(now, dt) {
    if (!TS.r || !TS.list.length || !TS.host || !TS.canvas.isConnected || TS.canvas.offsetParent === null) return;
    if (TS.host.clientWidth !== TS.w || TS.host.clientHeight !== TS.h) tsSize();
    TS.t += dt;
    for (const m of TS.list) {
      const c = m.ch;
      // 赢了：每个人隔一会儿播一次庆祝（错开），MVP 先整套展示
      if (TS.won && TS.t >= m.next && !c.act) { c.act = { name: m.mvp && m.next === m.delay ? 'show' : Math.random() < 0.7 ? 'victory' : 'hello', t: 0 }; m.next = TS.t + 2.2 + Math.random() * 1.6; }
      const face = Math.PI / 2 + m.yaw;   // 面向镜头（+z）
      animateChar(c, { a: face, vx: 0, vy: 0 }, dt, 0, {});
      if (!TS.won) {
        // 输了：低头、肩膀垂下、偶尔摇头叹气
        const t = TS.t + m.delay * 3, shake = Math.max(0, Math.sin(t * 0.9)) ** 8;
        c.head.rotation.x = 0.42 + Math.sin(t * 1.3) * 0.03; c.head.rotation.z = Math.sin(t * 9) * 0.18 * shake;
        c.torso.rotation.x = 0.16; c.torso.position.y -= 0.6;
        c.arms[0].rotation.z = -0.05; c.arms[0].rotation.x = 0.05; c.arms[1].rotation.z = 0.05; c.arms[1].rotation.x = -0.05;
      }
      c.root.rotation.y = -face + c.yawOff;
    }
    if (TS.points.visible) {
      const P = TS.points.geometry.attributes.position;
      TS.conf.forEach((c, i) => {
        c.y -= c.vy * dt; c.x += Math.sin(TS.t * 2 + c.ph) * c.sx * dt;
        if (c.y < -2) resetConf(c, true);
        P.setXYZ(i, c.x, c.y, c.z);
      });
      P.needsUpdate = true;
    }
    TS.r.render(TS.scene, TS.cam);
  }
  // 屏幕位置：结算台上第 i 个人头顶（给名字标签定位）
  function teamSlots() {
    if (!TS.r || !TS.list.length) return [];
    TS.cam.updateMatrixWorld();
    return TS.list.map((m) => { const v = new T.Vector3(m.g.position.x, 0, m.g.position.z).project(TS.cam); return { x: (v.x + 1) / 2, y: (1 - v.y) / 2 }; });
  }
  // 拍一张角色照（展示用，结果缓存）
  const CSHOTS = new Map();
  function charShot(pilotId, color, w = 360, h = 440, stage = true) {
    const key = [pilotId, color, w, h, stage].join('|');
    if (CSHOTS.has(key)) return CSHOTS.get(key);
    if (!cpInit()) return '';
    shared();
    const keep = { host: CP.host, key: CP.key, ch: CP.ch };
    if (CP.ch) CP.scene.remove(CP.ch.root);
    const ch = buildChar(pilotId, color || S.pilot(pilotId).accent, null);
    animateChar(ch, { a: 0, vx: 0, vy: 0 }, 0.016, 0);
    ch.root.rotation.y = -0.3;
    CP.scene.add(ch.root); CP.ring.material.color.set(S.pilot(pilotId).accent);
    CP.disc.visible = CP.ring.visible = stage;
    cpSize(w, h); CP.r.setPixelRatio(1); CP.r.setSize(w, h, false);
    CP.r.render(CP.scene, CP.cam);
    const url = CP.canvas.toDataURL('image/png');
    CP.disc.visible = CP.ring.visible = true;
    CP.scene.remove(ch.root);
    if (keep.ch) { CP.scene.add(keep.ch.root); CP.ring.material.color.set(S.pilot(keep.key.split('|')[0]).accent); }
    CP.w = 0;
    CSHOTS.set(key, url);
    return url;
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
    for (const k in W.wedge || {}) W.wedge[k].begin();
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
    // 迫击炮弹：抛物线 + 落点预警圈
    for (const [id, sh] of G.shells) {
      const k = (now - sh.t0) / 1000 / sh.T;
      if (k >= 1) { G.shells.delete(id); continue; }
      const dist = Math.hypot(sh.x1 - sh.x0, sh.y1 - sh.y0), h = 60 + dist * 0.35;
      const m = P['shell' + sh.team].next();
      m.position.set(sh.x0 + (sh.x1 - sh.x0) * k, sh.z0 + (sh.z1 - sh.z0) * k + 4 * h * k * (1 - k), sh.y0 + (sh.y1 - sh.y0) * k);
      const w = P['warn' + sh.team].next();
      flat(w, sh.x1, sh.y1, sh.z1 + 1.2);
      w.scale.setScalar(sh.r * (0.6 + 0.4 * k));
    }
    // 驾驶员技能召唤物
    for (const h of G.helpers || []) {
      const [, kind, x, y, z, team] = h;
      if (kind === 'fire') continue;   // 火海用粒子画（client 收到 fz 事件）
      if (kind === 'wall') {   // 防暴盾卫的盾墙：半透明能量墙
        const g = P['wall' + team].next(); g.position.set(x, z, y); g.rotation.y = -(h[6] || 0); g.children[0].material.opacity = 0.32 + 0.12 * Math.sin(now / 120); continue;
      }
      if (kind === 'crate') { const g = P.crate.next(); g.position.set(x, z + Math.abs(Math.sin(now / 400 + x)) * 4, y); g.rotation.y = now / 900; continue; }
      if (kind === 'charge') {         // 炸药：一闪一闪的涂料弹
        const m = P['shell' + team].next(); m.position.set(x, z + 6, y); m.scale.setScalar(1.3 + 0.4 * Math.abs(Math.sin(now / 70))); continue;
      }
      if (kind === 'fog') continue;    // 毒雾用粒子画（client 收到 fg 事件）
      if (kind === 'dome') { const g = P['dome' + team].next(); g.position.set(x, z, y); g.children[0].material.opacity = 0.13 + 0.05 * Math.sin(now / 220); g.children[1].rotation.y = now / 1600; continue; }
      if (kind === 'domain') {   // 1.9.1 简易领域
        const g = P['domain' + team].next(); g.position.set(x, z + 0.5, y);
        g.children[1].material.opacity = 0.13 + 0.06 * Math.sin(now / 180);
        g.children[2].rotation.y = now / 2400; g.children[3].rotation.y = -now / 1500; g.children[4].rotation.y = now / 700; g.children[4].position.y = Math.sin(now / 300) * 4;
        continue;
      }
      if (kind === 'sealz') { const g = P.sealz.next(); g.position.set(x, z + 1, y); g.rotation.y = now / 900; continue; }
      if (kind === 'decoy') { const g = P.decoy.next(); g.position.set(x, z + Math.sin(now / 160) * 1.5, y); g.rotation.y = now / 260; continue; }
      if (kind === 'bento' && h[6] === 7) { const g = P.gift.next(); g.position.set(x, z + Math.abs(Math.sin(now / 250)) * 3, y); g.rotation.y = now / 600; continue; }
      if (kind === 'bento') { const g = P.bento.next(); g.position.set(x, z + Math.abs(Math.sin(now / 250)) * 3, y); g.rotation.y = now / 600; continue; }
      const g = P[kind + team].next();
      g.position.set(x, z, y);
      if (kind === 'turret') g.userData.head.rotation.y = now / 300;
      else { g.userData.rotor.rotation.y = now / 30; g.position.y = z + Math.sin(now / 200) * 2; }
    }
    // 逃亡圈：毒圈是一圈半透明的灰色涂料墙，下一个安全区画在地上
    if ((G.teams || 2) > 2 && G.obj && G.mode !== 'loot') {
      const o = G.obj;
      if (!W.circle) {
        W.circle = part(SH.tube, basic(0xff5a36, { transparent: true, opacity: 0.22, side: T.DoubleSide, depthWrite: false }), 1, 220, 1, 0, 110, 0);
        W.circleIn = part(SH.tube, basic(0x5b5e68, { transparent: true, opacity: 0.35, side: T.DoubleSide, depthWrite: false }), 1, 60, 1, 0, 30, 0);
        W.safe = flat(part(SH.ring, basic(0xffffff, { transparent: true, opacity: 0.6, side: T.DoubleSide, depthWrite: false }), 1, 1, 1), 0, 0, 2);
        scene.add(W.circle); scene.add(W.circleIn); scene.add(W.safe);
      }
      W.circle.position.set(o[0], 110, o[1]); W.circle.scale.set(o[2] * 2, 220, o[2] * 2);
      W.circleIn.position.set(o[0], 30, o[1]); W.circleIn.scale.set(o[2] * 2 + 6, 60, o[2] * 2 + 6);
      W.circle.material.opacity = 0.18 + 0.08 * Math.sin(now / 300);
      W.safe.position.set(o[3], 2, o[4]); W.safe.scale.set(o[5] * 2, o[5] * 2, 1); W.safe.visible = o[6] !== 2;
    }
    // 草丛：自己站在里面时那一块变半透明
    if (W.bushes) {
      const me = G.me, C = S.CELL;
      for (const b of W.bushes) {
        const [bx, by, bw, bh] = b.rect;
        const inside = me && me.px > bx * C - 10 && me.px < (bx + bw) * C + 10 && me.py > by * C - 10 && me.py < (by + bh) * C + 10;
        b.fade += ((inside ? 0.42 : 1) - b.fade) * Math.min(1, dt * 8);
        for (const m of b.mats) { m.opacity = b.fade; m.depthWrite = b.fade > 0.95; }
      }
    }
    // 瞄准指示
    const A = G.aimShow;
    for (const m of [W.aimLine, W.aimFan, W.aimCircle, W.aimRing]) m.visible = false;
    if (A) {
      W.aimMat.color.set(A.strong ? (A.color || '#ffffff') : '#ffffff'); W.aimMat.opacity = A.strong ? 0.42 : 0.2;
      const y = A.z + 1.6;
      if (A.kind === 'line') { const m = W.aimLine; m.visible = true; m.position.set(A.x, y, A.y); m.rotation.z = -A.a; m.scale.set(A.len, A.w, 1); }
      else if (A.kind === 'fan') { const m = W.aimFan; m.visible = true; m.position.set(A.x, y, A.y); m.rotation.z = -A.a; m.scale.set(A.len, A.len, 1); if (W.fanArc !== A.arc) { W.fanArc = A.arc; m.geometry.dispose(); m.geometry = new T.CircleGeometry(1, 24, -A.arc / 2, A.arc); } }
      else if (A.kind === 'circle') { const m = W.aimCircle; m.visible = true; m.position.set(A.x, y, A.y); m.scale.set(A.len, A.len, 1); }
      if (A.tx != null) { const r = W.aimRing; r.visible = true; r.position.set(A.tx, A.tz + 1.8, A.ty); r.scale.setScalar(A.tr || 20); r.material.color.set(A.color || '#ffffff'); }
    }
    // 2.0：敌方近战机体靠近时，脚下显示它的攻击距离（圈 + 朝向扇形）；大摆锤显示旋转范围
    for (const q of G.reach || []) {
      const o = P.ring.next(); flat(o, q.x, q.y, q.z + 1.2); o.scale.setScalar(q.r); o.material.color.set(q.color); o.material.opacity = q.op;
      if (q.arc) { const m = W.wedgeOf(q.arc); m.position.set(q.x, q.z + 1.1, q.y); m.rotation.z = -q.a; m.scale.set(q.r, q.r, 1); m.material.color.set(q.color); m.material.opacity = q.op * 0.45; }
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
      } else if (f.k === 'arc') {   // 2.0 近战挥击：真实命中范围的扇形，先亮后淡
        const m = W.wedgeOf(f.arc); m.position.set(f.x, (f.z || 0) + 1.8, f.y); m.rotation.z = -f.a;
        const s2 = f.r * (0.82 + 0.18 * Math.min(1, k * 3)); m.scale.set(s2, s2, 1);
        m.material.color.set(f.color); m.material.opacity = (f.heavy ? 0.5 : 0.38) * (1 - k);
        const o = P.ring.next(); flat(o, f.x, f.y, (f.z || 0) + 2); o.scale.setScalar(f.r); o.material.color.set('#ffffff'); o.material.opacity = (f.arc > 6 ? 0.6 : 0) * (1 - k);
      } else if (f.k === 'goo') {   // 2.0 迫击黏稠墨水
        const d = P.disc.next(); flat(d, f.x, f.y, (f.z || 0) + 1.4); d.scale.setScalar(f.r * (0.8 + 0.2 * Math.min(1, k * 4))); d.material.color.set(f.color); d.material.opacity = 0.32 * (1 - k * k);
      } else if (f.k === 'tele') {   // 1.8 预警：外圈闪烁，里面的实心圆慢慢长满
        const o2 = P.ring.next(); flat(o2, f.x, f.y, (f.z || 0) + 2); o2.scale.setScalar(f.r); o2.material.color.set('#ff2d4b'); o2.material.opacity = 0.5 + 0.4 * Math.abs(Math.sin(now / 90));
        const d = P.disc.next(); flat(d, f.x, f.y, (f.z || 0) + 1.6); d.scale.setScalar(f.r * k); d.material.opacity = 0.18 + 0.25 * k;
      } else if (f.k === 'cres') {   // 1.8 裂空斩：月牙刀气沿直线飞出去
        const m = P.cres.next(), dd = f.len * Math.min(1, k * 1.4);
        m.position.set(f.x + Math.cos(f.a) * dd, (f.z || 0) + 26, f.y + Math.sin(f.a) * dd);
        m.rotation.set(Math.PI / 2, 0, -f.a - Math.PI / 2); m.scale.set(1.5, 1.5, 1);
        m.material.color.set(f.color); m.material.opacity = 0.95 * (1 - k * 0.7);
        if (Math.random() < 0.8) emit(m.position.x, m.position.z, m.position.y, f.color, 3, 90, 0.5, { sys: 'pg', size: 12, life: 0.35, grav: 0, drag: 3 });
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
    if ((G.mode === 'battery' || G.mode === 'seal') && o && o[2]) {
      const f = o[2];
      for (let i = 0; i < f.length; i += 4) {
        const g = (G.mode === 'seal' ? P.stone : P.bat).next();
        g.position.set(f[i + 1], (f[i + 3] || 0) + 12 + Math.sin(now / 250 + f[i]) * 3, f[i + 2]);
        g.rotation.y = now / 400 + f[i];
      }
    }
    if (G.mode === 'park' && o && W.float) {
      const fx = lp(2), fy = lp(3), own = o[4];
      const dx = fx - (W.floatPrev ? W.floatPrev.x : fx), dy = fy - (W.floatPrev ? W.floatPrev.y : fy);
      if (Math.hypot(dx, dy) > 0.05) W.floatYaw = Math.atan2(dy, dx);
      W.floatPrev = { x: fx, y: fy };
      W.float.position.set(fx, 0, fy); W.float.rotation.y = -(W.floatYaw || 0);
      W.floatTop.rotation.y = now / 900;
      W.floatTop.position.y = 13 + Math.sin(now / 300) * 0.8;
      const c = own ? cs[own] : '#ffffff';
      W.floatRingM.color.set(c); W.floatDiscM.color.set(c); W.floatDiscM.opacity = own ? 0.18 + 0.06 * Math.sin(now / 180) : 0.08;
      W.floatRing.position.set(fx, 1.5, fy); W.floatDisc.position.set(fx, 1.2, fy);
      const f = o[5] || [], BC = ['#ff3ea5', '#1fd6ee', '#ffd23f', '#9cff2e', '#ff8a1f', '#b06bff'];
      for (let i = 0; i < f.length; i += 4) {
        const g = P.balloon.next();
        g.position.set(f[i + 1] + Math.sin(now / 700 + f[i]) * 3, f[i + 3] + 10 + Math.sin(now / 420 + f[i]) * 3, f[i + 2]);
        g.rotation.z = Math.sin(now / 600 + f[i]) * 0.12;
        g.userData.mat.color.set(BC[f[i] % BC.length]);
      }
    }
    if (G.mode === 'loot') {
      const o = G.obj;
      if (G.items && W.lootInst) {
        const L = W.lootInst, M4 = W.lootM, Q = W.lootQ, E3 = W.lootE, V = W.lootV, SC = W.lootSc;
        for (let r = 1; r <= 5; r++) { L[r].im.count = 0; if (L[r].bm) L[r].bm.count = 0; }
        for (const it of G.items.values()) {
          const I = S.LOOT.items[it.k]; if (!I) continue;
          const slot = L[I.r], n = slot.im.count;
          if (n >= 600) continue;
          V.set(it.x, (it.z || 0) + 7 + Math.sin(now / 400 + it.x) * 1.5, it.y);
          Q.setFromEuler(E3.set(0, now / 900 + it.y, 0)); SC.set(slot.s, slot.s * 0.85, slot.s);
          slot.im.setMatrixAt(n, M4.compose(V, Q, SC)); slot.im.count = n + 1;
          if (slot.bm) { V.set(it.x, (it.z || 0) + (I.r === 5 ? 90 : 60), it.y); Q.identity(); SC.set(I.r === 5 ? 3.2 : 2.2, I.r === 5 ? 180 : 120, I.r === 5 ? 3.2 : 2.2); slot.bm.setMatrixAt(slot.bm.count, M4.compose(V, Q, SC)); slot.bm.count++; }
        }
        for (let r = 1; r <= 5; r++) { L[r].im.instanceMatrix.needsUpdate = true; if (L[r].bm) L[r].bm.instanceMatrix.needsUpdate = true; }
      }
      // 2.1：容器（状态变了才重新写实例）
      if (G.contArr && W.contInst && G.contDirty) {
        const M4 = W.lootM, Q = W.lootQ, E3 = W.lootE, V = W.lootV, SC = W.lootSc, col = new T.Color();
        for (const k in W.contInst) { W.contInst[k].body.count = 0; W.contInst[k].band.count = 0; }
        for (const c of G.contArr) {
          const ci = W.contInst[c.type]; if (!ci || ci.body.count >= ci.cap) continue;
          const [w, d, h, bc, lc] = ci.v, n = ci.body.count, k = c.st === 2 ? 0.35 : c.st === 1 ? 0.7 : 1;
          Q.setFromEuler(E3.set(0, (c.id * 1.7) % 6.283, 0));
          V.set(c.x, c.z, c.y); SC.set(w, h, d); ci.body.setMatrixAt(n, M4.compose(V, Q, SC));
          ci.body.setColorAt(n, col.set(bc).multiplyScalar(k));
          V.set(c.x, c.z + h * 0.62, c.y); SC.set(w + 1.2, Math.max(2, h * 0.14), d + 1.2); ci.band.setMatrixAt(n, M4.compose(V, Q, SC));
          ci.band.setColorAt(n, col.set(c.st === 2 ? 0x333640 : lc));
          ci.body.count = ci.band.count = n + 1;
        }
        for (const k in W.contInst) { const ci = W.contInst[k]; ci.body.instanceMatrix.needsUpdate = ci.band.instanceMatrix.needsUpdate = true; if (ci.body.instanceColor) ci.body.instanceColor.needsUpdate = true; if (ci.band.instanceColor) ci.band.instanceColor.needsUpdate = true; }
        G.contDirty = 0;
      }
      if (W.leverPivot) { const on = o && o[2] > 0; W.leverPivot.rotation.x = on ? 1.1 : -0.5; W.leverLamp.material.color.set(on ? 0x5ee36a : (Math.floor(now / 400) % 2 ? 0xff9a3d : 0x5a3a1a)); }
      if (o && o[0] && !W.exZones) {
        W.exZones = [];
        for (let i = 0; i + 4 < o[0].length; i += 5) {
          const x = o[0][i], y = o[0][i + 1], z = S.topAt(W.M, x, y);
          const ringM = basic(0x9aa0a8, { transparent: true, opacity: 0.85, side: T.DoubleSide, depthWrite: false });
          const ring = new T.Mesh(new T.RingGeometry(S.LOOT.extR - 6, S.LOOT.extR, 48), ringM); ring.rotation.x = -Math.PI / 2; ring.position.set(x, z + 1.5, y);
          const discM = basic(0x5ee36a, { transparent: true, opacity: 0.0, depthWrite: false }); const disc = new T.Mesh(new T.CircleGeometry(S.LOOT.extR - 6, 40), discM); disc.rotation.x = -Math.PI / 2; disc.position.set(x, z + 1.2, y);
          const beacon = part(SH.cyl, basic(0x5ee36a, { transparent: true, opacity: 0.0, depthWrite: false, blending: T.AdditiveBlending }), 10, 260, 10, x, z + 130, y);
          const pole = part(SH.cyl, toon(0x2a2d3a), 2.5, 46, 2.5, x, z + 23, y); const lamp = part(SH.sph, basic(0x9aa0a8), 5, 5, 5, x, z + 48, y);
          scene.add(ring, disc, beacon, pole, lamp);
          W.exZones.push({ ringM, discM, beacon, lamp });
        }
      }
      if (o && o[0] && W.exZones) W.exZones.forEach((z, j) => {
        const EC = [0x5ee36a, 0xffd23f, 0x4fd8ff, 0xff9a3d, 0xc78cff];
        const open = !!o[0][j * 5 + 3], c = open ? EC[o[0][j * 5 + 2]] || 0x5ee36a : 0x9aa0a8;
        z.ringM.color.set(c); z.lamp.material.color.set(open ? c : (Math.floor(now / 500) % 2 ? 0xffd23f : 0x9aa0a8)); z.discM.color.set(c); z.beacon.material.color.set(c);
        z.discM.opacity = open ? 0.14 + 0.06 * Math.sin(now / 250) : 0;
        z.beacon.material.opacity = open ? 0.22 + 0.08 * Math.sin(now / 300) : 0;
      });
    }
    if (G.mode === 'zone' && o && W.zoneMat) {
      const owner = o[0];
      const c = owner ? cs[owner] : '#ffffff';
      W.zoneMat.color.set(c); W.zoneMat.opacity = owner ? 0.2 + 0.06 * Math.sin(now / 200) : 0.1;
      W.zoneLineMat.color.set(c);
      for (const m of W.zonePosts) m.color.set(c);
    }
    for (const k2 in P) P[k2].end();
    for (const k2 in W.wedge || {}) W.wedge[k2].end();
  }

  // =====================================================================
  // 对外接口
  // =====================================================================
  function setCamera(cx, cy, cz, tx, ty, tz, fov) {
    if (!camera) return;
    camera.position.set(cx, cz, cy);
    camera.lookAt(tx, tz, ty);
    if (W && W.giant && W.sun) {
      // 2.1：超大地图的阴影范围跟着镜头（按 64 取整，避免阴影抖动）
      const sx = Math.round(tx / 64) * 64, sz = Math.round(ty / 64) * 64, sd = W.sd;
      W.sun.target.position.set(sx, 0, sz);
      W.sun.position.set(sx + sd.x * 1500, sd.y * 1500 + 300, sz + sd.z * 1500);
      if (W.ring) W.ring.position.set(cx, 380, cy);
    }
    if (fov && Math.abs(camera.fov - fov) > 0.05) { camera.fov = fov; camera.updateProjectionMatrix(); }
  }
  const _p = new T.Vector3();
  function project(x, y, z) {
    if (!camera) return null;
    _p.set(x, z, y).project(camera);
    if (_p.z > 1 || _p.z < -1) return null;
    return { x: ((_p.x + 1) / 2) * innerWidth, y: ((1 - _p.y) / 2) * innerHeight };
  }
  // 屏幕坐标 → 游戏世界里的射线（用于鼠标在地面上瞄准）
  const _r0 = new T.Vector3(), _r1 = new T.Vector3();
  function screenRay(sx, sy) {
    if (!camera) return null;
    camera.updateMatrixWorld();
    _r0.set((sx / innerWidth) * 2 - 1, -(sy / innerHeight) * 2 + 1, 0.5).unproject(camera);
    _r1.copy(_r0).sub(camera.position).normalize();
    return { x: camera.position.x, y: camera.position.z, z: camera.position.y, dx: _r1.x, dy: _r1.z, dz: _r1.y };
  }

  // ---------------- 1.5：后期处理（高画质）：霓虹泛光 + 调色 + 暗角 ----------------
  const POST = { k: 0.42, th: 0.8, sat: 1.12, con: 1.06, vig: 0.22 };
  const PV_VS = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
  function postInit() {
    if (POST.rt) return true;
    try {
      const gl2 = renderer.capabilities.isWebGL2;
      POST.rt = new T.WebGLRenderTarget(4, 4, { samples: gl2 ? 4 : 0 });
      POST.a = new T.WebGLRenderTarget(4, 4); POST.b = new T.WebGLRenderTarget(4, 4);
      POST.c = new T.WebGLRenderTarget(4, 4); POST.d = new T.WebGLRenderTarget(4, 4);
      POST.cam = new T.OrthographicCamera(-1, 1, 1, -1, 0, 1);
      POST.quad = new T.Mesh(new T.PlaneGeometry(2, 2)); POST.quad.frustumCulled = false;
      POST.scene = new T.Scene(); POST.scene.add(POST.quad);
      POST.bright = new T.ShaderMaterial({ uniforms: { t: { value: null }, th: { value: POST.th } }, vertexShader: PV_VS, depthTest: false, depthWrite: false,
        fragmentShader: `uniform sampler2D t; uniform float th; varying vec2 vUv;
          void main(){ vec3 c = texture2D(t, vUv).rgb; float l = dot(c, vec3(0.2126, 0.7152, 0.0722)); float m = max(c.r, max(c.g, c.b));
            float w = smoothstep(th, th + 0.22, mix(l, m, 0.35)); gl_FragColor = vec4(c * w, 1.0); }` });
      POST.blur = new T.ShaderMaterial({ uniforms: { t: { value: null }, dir: { value: new T.Vector2() } }, vertexShader: PV_VS, depthTest: false, depthWrite: false,
        fragmentShader: `uniform sampler2D t; uniform vec2 dir; varying vec2 vUv;
          void main(){ vec3 c = texture2D(t, vUv).rgb * 0.227;
            c += (texture2D(t, vUv + dir * 1.385).rgb + texture2D(t, vUv - dir * 1.385).rgb) * 0.316;
            c += (texture2D(t, vUv + dir * 3.231).rgb + texture2D(t, vUv - dir * 3.231).rgb) * 0.070;
            gl_FragColor = vec4(c, 1.0); }` });
      POST.comp = new T.ShaderMaterial({ uniforms: { t: { value: null }, b1: { value: null }, b2: { value: null }, k: { value: POST.k }, sat: { value: POST.sat }, con: { value: POST.con }, vig: { value: POST.vig }, asp: { value: 1 } },
        vertexShader: PV_VS, depthTest: false, depthWrite: false,
        fragmentShader: `uniform sampler2D t, b1, b2; uniform float k, sat, con, vig, asp; varying vec2 vUv;
          void main(){
            vec3 c = texture2D(t, vUv).rgb;
            vec3 bl = texture2D(b1, vUv).rgb * 0.6 + texture2D(b2, vUv).rgb * 0.8;
            c += bl * k;
            float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
            c = mix(vec3(l), c, sat);
            c = (c - 0.5) * con + 0.5;
            c = c / (1.0 + max(c - 1.0, 0.0) * 0.6);   // 高光柔和压回，不会一片死白
            vec2 d = (vUv - 0.5) * vec2(asp, 1.0);
            c *= 1.0 - vig * smoothstep(0.35, 1.05, length(d));
            gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
          }` });
    } catch (e) { console.warn('post off', e); POST.fail = true; return false; }
    return true;
  }
  const _ps = new T.Vector2();
  function postSize() {
    renderer.getDrawingBufferSize(_ps);
    const w = Math.max(4, _ps.x | 0), h = Math.max(4, _ps.y | 0);
    if (POST.w === w && POST.h === h) return;
    POST.w = w; POST.h = h;
    POST.rt.setSize(w, h);
    const w4 = Math.max(4, w >> 2), h4 = Math.max(4, h >> 2), w8 = Math.max(4, w >> 3), h8 = Math.max(4, h >> 3);
    POST.a.setSize(w4, h4); POST.b.setSize(w4, h4); POST.c.setSize(w8, h8); POST.d.setSize(w8, h8);
    POST.comp.uniforms.asp.value = w / h;
  }
  function pass(mat, target) { POST.quad.material = mat; renderer.setRenderTarget(target); renderer.render(POST.scene, POST.cam); }
  function renderPost() {
    if (!HQ || POST.off || POST.fail || !postInit()) { renderer.setRenderTarget(null); renderer.render(scene, camera); return; }
    postSize();
    renderer.setRenderTarget(POST.rt); renderer.render(scene, camera);
    POST.bright.uniforms.t.value = POST.rt.texture; pass(POST.bright, POST.a);
    const B = POST.blur.uniforms;
    B.t.value = POST.a.texture; B.dir.value.set(1 / POST.a.width, 0); pass(POST.blur, POST.b);
    B.t.value = POST.b.texture; B.dir.value.set(0, 1 / POST.a.height); pass(POST.blur, POST.a);
    B.t.value = POST.a.texture; B.dir.value.set(1 / POST.c.width, 0); pass(POST.blur, POST.c);   // 再缩小一半，泛光更柔更大
    B.t.value = POST.c.texture; B.dir.value.set(0, 1 / POST.c.height); pass(POST.blur, POST.d);
    const C = POST.comp.uniforms;
    C.t.value = POST.rt.texture; C.b1.value = POST.a.texture; C.b2.value = POST.d.texture;
    pass(POST.comp, null);
  }
  function render(G, now, dt, myId) {
    if (!W || W.G !== G) return;
    if (W.dirty) flushSurface();
    syncBots(G, now, dt, myId);
    syncWorld(G, now, dt);
    stepAmbient(dt, now);
    if (W.pads) for (const p of W.pads) { const k = (now / 600) % 1; p.ring.scale.setScalar(9 + k * 6); p.ringM.opacity = 0.9 * (1 - k); }
    stepParticles(dt);
    renderPost();
  }
  function clear() { dispose(); show(false); }

  window.GB3D = {
    get ok() { return init(); },
    get scene() { return scene; },
    setPost(on, o) { POST.off = !on; if (o && POST.comp) for (const k in o) { if (POST.comp.uniforms[k]) POST.comp.uniforms[k].value = o[k]; if (k === 'th') POST.bright.uniforms.th.value = o[k]; } },
    teamShow, teamFrame, teamSlots,
    build, paintCell, burst, emit, trailerStart, trailerStop, TRAILERS, __trT: () => (TR.on ? TR.t : -1), setCamera, project, screenRay, render, clear, show, preview, previewFrame, previewMode, mechThumb, charPreview, charFrame, charShot, charAction, setQuality,
    setDyn, dyn: () => DYN,
    info: () => (renderer ? { calls: renderer.info.render.calls, tris: renderer.info.render.triangles, geos: renderer.info.memory.geometries } : null),
  };
})();
