// 涂鸦机兵 GraffiBots — 服务器与客户端共用的规则、数据与物理
(function (root, factory) {
  const S = factory();
  if (typeof module === 'object' && module.exports) module.exports = S;
  else root.GS = S;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const S = {};
  const CELL = 16, GW = 120, GH = 80;
  Object.assign(S, {
    CELL, GW, GH, W: GW * CELL, H: GH * CELL,
    TICK: 30,          // 服务器模拟频率
    R: 15,             // 机兵半径
    MAX_HP: 100, MAX_TANK: 100,
    RESPAWN: 5,        // 复活时间（秒）
    SUB_COST: 55,      // 喷漆炸弹消耗
    MAX_PER_TEAM: 4,
  });

  // ---------------- 队伍配色（每局轮换） ----------------
  S.COLOR_SETS = [
    { name: '霓虹粉 vs 电光青', c: [null, '#ff3ea5', '#1fd6ee'] },
    { name: '烈焰橙 vs 幻影紫', c: [null, '#ff8a1f', '#8c5cff'] },
    { name: '酸性绿 vs 熔岩红', c: [null, '#9cff2e', '#ff3b52'] },
    { name: '柠檬黄 vs 深海蓝', c: [null, '#ffdf2e', '#3a6dff'] },
  ];
  S.TEAM_NAMES = [null, 'α队', 'β队'];

  // ---------------- 武器 ----------------
  S.WEAPONS = {
    blaster: {
      name: '喷罐枪', desc: '均衡的全自动喷枪，射速快、好上手，适合任何场合。',
      special: 'storm', rate: 0.1, cost: 1.4, speed: 620, range: 330, dmg: 26, spread: 0.1,
      splat: 22, trail: 13, size: 6, spNeed: 180,
    },
    roller: {
      name: '滚刷机', desc: '按住开火向前滚动，刷出宽阔道路并碾压敌人；每次按下会先甩出一扇涂料。',
      special: 'charge', rate: 0.6, cost: 9, speed: 500, range: 210, dmg: 32, pellets: 5, arc: 0.6, spread: 0.05,
      splat: 20, trail: 0, size: 7, rollCost: 8, rollWidth: 26, rollDmg: 140, spNeed: 170,
    },
    charger: {
      name: '狙击笔', desc: '按住蓄力、松开射出长距离直线，满蓄力一击必杀，蓄力时移动变慢。',
      special: 'missiles', chargeTime: 0.9, range: 760, dmg: 160, cost: 20, minCost: 5, spNeed: 190,
    },
    bucket: {
      name: '泼桶机', desc: '近距离泼出大片涂料，覆盖面积大，贴脸爆发极高。',
      special: 'bubble', rate: 0.75, cost: 8, speed: 480, range: 240, dmg: 22, pellets: 7, arc: 0.55, spread: 0.06,
      splat: 26, trail: 12, size: 7, spNeed: 180,
    },
    gatling: {
      name: '旋转喷管', desc: '需要预热的重型喷管，射程远、火力持续，开火时移动较慢。',
      special: 'beam', spinTime: 0.55, rate: 0.065, cost: 1.0, speed: 700, range: 440, dmg: 15, spread: 0.07,
      splat: 18, trail: 12, size: 5, spNeed: 190,
    },
  };
  S.WEAPON_ORDER = ['blaster', 'roller', 'charger', 'bucket', 'gatling'];
  S.weaponRange = function (id) {
    const w = S.WEAPONS[id];
    if (id === 'charger') return 620;
    if (id === 'roller') return 170;
    return w.range;
  };

  S.SPECIALS = {
    storm: { name: '涂装风暴', desc: '向四周连续爆发三圈涂料弹。' },
    charge: { name: '碾压冲锋', desc: '4 秒无敌高速冲刺，碾过的敌人直接击倒。' },
    missiles: { name: '锁定导弹', desc: '锁定所有敌人当前位置，1.5 秒后导弹落下。' },
    bubble: { name: '气泡护盾', desc: '为自己和附近队友套上吸收伤害的护盾。' },
    beam: { name: '极光喷射', desc: '2.6 秒持续高压光束，贯穿并涂满整条直线。' },
  };
  S.SPECIAL_IDS = [null, 'storm', 'charge', 'missiles', 'bubble', 'beam'];

  // ---------------- 头部涂装（随等级解锁） ----------------
  S.HEADS = [
    { id: 'antenna', name: '天线', lv: 1 },
    { id: 'mohawk', name: '莫西干', lv: 2 },
    { id: 'phones', name: '耳机', lv: 3 },
    { id: 'cone', name: '路锥', lv: 4 },
    { id: 'crown', name: '王冠', lv: 6 },
    { id: 'horns', name: '恶魔角', lv: 8 },
  ];
  // ---------------- 驾驶员（立绘 + 3D 驾驶舱里的角色） ----------------
  // hair/skin/eye 同时用于 SVG 立绘与 3D 模型；style 决定发型
  S.PILOTS = [
    { id: 'blaze', name: '凌焰', code: '烈焰', title: '热血突击手', weapon: 'blaster', accent: '#ff4d3d',
      hair: '#e8382f', hair2: '#8f1022', skin: '#ffd9bf', eye: '#ffb21f', style: 'spiky', eyeShape: 'sharp', mouth: 'grin', outfit: 'jacket',
      line: '涂料都装满了？那就冲啊！', bio: '街头涂鸦队的队长，永远第一个冲进敌阵。说话大声、笑声更大，护目镜是他唯一不肯借人的东西。' },
    { id: 'frost', name: '白夜', code: '霜刃', title: '冷面狙击手', weapon: 'charger', accent: '#5fd3ff',
      hair: '#e6eef8', hair2: '#8796b8', skin: '#fde3d2', eye: '#47c8ff', style: 'swept', eyeShape: 'cool', mouth: 'calm', outfit: 'coat',
      line: '一发，就够了。', bio: '曾经的天台竞速冠军，退役后只用一支狙击笔说话。刘海下藏着一只机械义眼，能看清八百米外的涂料滴。' },
    { id: 'candy', name: '苏糖', code: '电音', title: '元气偶像主播', weapon: 'gatling', accent: '#ff5fc1',
      hair: '#ff8fcf', hair2: '#c0367e', skin: '#ffe2d3', eye: '#b56bff', style: 'twintail', eyeShape: 'round', mouth: 'open', outfit: 'idol',
      line: '大家～今天也要涂得闪闪发光哦！', bio: '拥有百万粉丝的直播主，猫耳耳机连着直播间。看起来软萌，实际是旋转喷管的火力狂人。' },
    { id: 'titan', name: '雷豹', code: '铁拳', title: '重装开路者', weapon: 'roller', accent: '#ffb000',
      hair: '#2a2420', hair2: '#0d0b0a', skin: '#b97a55', eye: '#ffcc33', style: 'dreads', eyeShape: 'bold', mouth: 'smirk', outfit: 'tank',
      line: '挡路的，统统碾过去。', bio: '前码头起重机驾驶员，力气大到能单手扛起滚刷。外表凶悍，其实是全队最会照顾人的大哥。' },
    { id: 'raven', name: '夜鸢', code: '墨鸦', title: '神秘涂鸦师', weapon: 'bucket', accent: '#a46bff',
      hair: '#3b2b5c', hair2: '#160f26', skin: '#f6d8c8', eye: '#c18bff', style: 'hood', eyeShape: 'sleepy', mouth: 'smirk', outfit: 'hoodie',
      line: '这面墙……归我了。', bio: '城市里最神秘的涂鸦作者，没人见过她摘下兜帽。她泼出的每一桶涂料都是一幅画。' },
    { id: 'aurora', name: '星澜', code: '极光', title: '天才机兵工程师', weapon: 'blaster', accent: '#2ee6b0',
      hair: '#35d6c4', hair2: '#1c6f8c', skin: '#ffe4d6', eye: '#3fe0a0', style: 'ponytail', eyeShape: 'round', mouth: 'smile', outfit: 'engineer',
      line: '机兵的参数我都调好啦，交给我吧！', bio: '十四岁就设计出第一台涂鸦机兵的天才少女。头上的护目镜是工作用的，扳手总是插在腰间。' },
  ];
  S.pilot = (id) => S.PILOTS.find((p) => p.id === id) || S.PILOTS[0];

  S.levelFromXp =(xp) => Math.floor(Math.sqrt(Math.max(0, xp) / 120)) + 1;
  S.xpForLevel = (lv) => (lv - 1) * (lv - 1) * 120;

  // ---------------- 模式 ----------------
  S.MODES = {
    turf: { name: '涂地大战', short: '涂地', desc: '比赛结束时涂色面积更大的队伍获胜。最后 30 秒局势将被隐藏！' },
    zone: { name: '抢占据点', short: '据点', desc: '把中央据点涂到 70% 即可占领，占领期间己方倒计时减少，先归零者获胜。' },
    escort: { name: '护送宝物', short: '宝物', desc: '抢下中央的宝物核心，带到敌方一侧的终点台得分（持有者受到的伤害降低 25%），先得 3 分获胜。' },
    soccer: { name: '漆弹足球', short: '足球', desc: '用涂料子弹、炸弹和身体把大球推进对方球门，先进 5 球获胜。', original: true },
    battery: { name: '电池掠夺', short: '电池', desc: '收集地图上的能量电池送回己方基地，被击倒会掉落全部电池，先存满 40 个获胜。', original: true },
  };
  S.MODE_ORDER = ['turf', 'zone', 'escort', 'soccer', 'battery'];
  S.ZONE = { x0: 52, y0: 32, x1: 68, y1: 48 };             // 据点（格子坐标，右/下不含）
  S.SOCCER_GOAL = { depth: 56, half: 140 };                // 球门：距边缘深度、半高
  S.ESCORT_TARGET = 3; S.SOCCER_TARGET = 5; S.BATTERY_TARGET = 40;

  // ---------------- 3D 参数 ----------------
  S.LEVEL_H = [0, 40, 80, 150];   // 地块高度：地面 / 矮台 / 高台 / 高墙（不可攀登、不可涂）
  S.PH = 36;                       // 机兵身高
  S.MUZZLE = 24;                   // 枪口离脚底高度
  S.STEP = 10;                     // 可直接走上的台阶高度
  S.GRAV = 980;
  S.JUMP_V = 360;                  // 普通跳跃：约 66 高，可跳上矮台
  S.JUMP_W = 410;                  // 滚轮形态跳跃：约 86 高，可直接跳上高台
  S.PROJ_G = 1500;                 // 子弹飞完直线距离后的下坠加速度

  // ---------------- 地图（只写左半边，自动中心对称）；[x, y, w, h, 高度等级] ----------------
  S.MAPS = [
    {
      name: '霓虹工厂', desc: '经典对称布局，中路开阔，矮掩体可跳上去，两侧有高台。', goalX: 24,
      rects: [[16, 10, 4, 18, 3], [16, 52, 4, 18, 3], [28, 30, 10, 4, 1], [28, 46, 10, 4, 1], [40, 4, 6, 12, 3],
        [44, 64, 8, 6, 2], [42, 64, 2, 6, 1], [56, 20, 8, 5, 2], [56, 25, 8, 2, 1]],
    },
    {
      name: '涂鸦天台', desc: '长条通道与高台狙击点，基地前有矮墙，适合远程武器。', goalX: 31,
      rects: [[14, 18, 22, 3, 3], [14, 59, 22, 3, 3], [40, 0, 4, 14, 3], [40, 34, 3, 12, 2], [37, 36, 3, 8, 1],
        [24, 36, 6, 8, 1], [52, 10, 16, 3, 3]],
    },
    {
      name: '齿轮广场', desc: '中央被可攀爬的环形高台包围，上下层立体乱斗。', goalX: 37,
      rects: [[44, 22, 12, 3, 2], [44, 22, 3, 10, 2], [64, 22, 12, 3, 2], [73, 22, 3, 10, 2], [48, 19, 4, 3, 1],
        [18, 12, 8, 8, 2], [26, 14, 2, 4, 1], [30, 38, 4, 4, 1], [8, 18, 10, 3, 3], [8, 59, 10, 3, 3]],
    },
  ];
  function mirror(r) { return [GW - r[0] - r[2], GH - r[1] - r[3], r[2], r[3], r[4]]; }
  // M = { top: 每格顶面高度, solid: 高墙（不可涂、不可站）, lv: 等级, rects }
  S.buildMap = function (mapIdx) {
    const m = S.MAPS[mapIdx];
    const lv = new Uint8Array(GW * GH);
    const rects = [];
    for (const r of m.rects) {
      const rr = [r[0], r[1], r[2], r[3], r[4] == null ? 3 : r[4]];
      rects.push(rr);
      const mr = mirror(rr);
      if (mr[0] !== rr[0] || mr[1] !== rr[1]) rects.push(mr);
    }
    for (const [x, y, w, h, l] of rects)
      for (let j = y; j < y + h; j++)
        for (let i = x; i < x + w; i++)
          if (i >= 0 && i < GW && j >= 0 && j < GH) lv[j * GW + i] = Math.max(lv[j * GW + i], l);
    const top = new Float32Array(GW * GH), solid = new Uint8Array(GW * GH);
    for (let i = 0; i < lv.length; i++) { top[i] = S.LEVEL_H[lv[i]]; solid[i] = lv[i] >= 3 ? 1 : 0; }
    return { top, solid, lv, rects };
  };

  S.basePos = (team) => ({ x: team === 1 ? 6 * CELL : S.W - 6 * CELL, y: S.H / 2 });
  S.spawnPoint = (team, slot) => {
    const b = S.basePos(team);
    return { x: b.x, y: b.y + ((slot % 4) - 1.5) * 44 };
  };
  // 护送宝物：该队需要把宝物送到的终点台
  S.goalFor = (team, mapIdx) => {
    const gx = (S.MAPS[mapIdx] || S.MAPS[0]).goalX;
    return team === 1 ? { x: (GW - gx) * CELL, y: S.H / 2 } : { x: gx * CELL, y: S.H / 2 };
  };

  // ---------------- 网格工具 ----------------
  S.inBounds = (cx, cy) => cx >= 0 && cy >= 0 && cx < GW && cy < GH;
  S.topCell = (M, cx, cy) => (S.inBounds(cx, cy) ? M.top[cy * GW + cx] : 1e4);
  S.topAt = (M, x, y) => S.topCell(M, Math.floor(x / CELL), Math.floor(y / CELL));
  S.cellAt = (grid, x, y) => {
    const cx = Math.floor(x / CELL), cy = Math.floor(y / CELL);
    if (!S.inBounds(cx, cy)) return 0;
    return grid[cy * GW + cx];
  };
  S.insideAt = (M, x, y, z) => z < S.topAt(M, x, y) - 0.01; // 该点在方块/地面以下

  // 圆柱与方块碰撞：比脚底高出 STEP 以上的格子视为墙
  S.collide = function (p, r, M) {
    const z = p.z || 0;
    for (let it = 0; it < 3; it++) {
      let moved = false;
      const x0 = Math.floor((p.x - r) / CELL), x1 = Math.floor((p.x + r) / CELL);
      const y0 = Math.floor((p.y - r) / CELL), y1 = Math.floor((p.y + r) / CELL);
      for (let cy = y0; cy <= y1; cy++) {
        for (let cx = x0; cx <= x1; cx++) {
          if (S.topCell(M, cx, cy) <= z + S.STEP) continue;
          const rx = cx * CELL, ry = cy * CELL;
          const qx = Math.max(rx, Math.min(p.x, rx + CELL));
          const qy = Math.max(ry, Math.min(p.y, ry + CELL));
          const dx = p.x - qx, dy = p.y - qy;
          const d2 = dx * dx + dy * dy;
          if (d2 >= r * r) continue;
          if (d2 > 1e-6) {
            const d = Math.sqrt(d2), push = r - d;
            p.x += (dx / d) * push; p.y += (dy / d) * push;
          } else {
            const l = p.x - rx, rr = rx + CELL - p.x, t = p.y - ry, b = ry + CELL - p.y;
            const m = Math.min(l, rr, t, b);
            if (m === l) p.x = rx - r; else if (m === rr) p.x = rx + CELL + r;
            else if (m === t) p.y = ry - r; else p.y = ry + CELL + r;
          }
          moved = true;
        }
      }
      if (!moved) break;
    }
    p.x = Math.max(r, Math.min(S.W - r, p.x));
    p.y = Math.max(r, Math.min(S.H - r, p.y));
  };
  S.collideTest = function (M, x, y, z) {
    const t = { x, y, z: z || 0 };
    S.collide(t, S.R, M);
    return Math.hypot(t.x - x, t.y - y) > 1;
  };

  // ---------------- 移动（含跳跃与重力） ----------------
  S.moveMul = function (weapon, firing, spKind) {
    if (spKind === 'beam') return 0.4;
    if (!firing) return 1;
    return { blaster: 0.85, roller: 0.95, charger: 0.45, bucket: 0.8, gatling: 0.55 }[weapon] || 1;
  };
  // ground: 脚下涂料（-1 表示在空中）
  S.speedFor = function (team, sm, ground, wheel, mul) {
    let s;
    if (ground < 0) s = wheel ? 250 : 165 * mul;
    else {
      const own = ground === team, enemy = ground !== 0 && ground !== team;
      s = wheel ? (own ? 320 : enemy ? 70 : 115) : (enemy ? 80 : 165) * mul;
    }
    return s * (sm || 1);
  };
  // ---------------- 物理手感参数 ----------------
  // 加速度单位：单位/秒²。机兵有质量感：起步要加速、松手会滑行、急转会刹车。
  S.PHYS = {
    walk: { acc: 1500, brake: 2300, coast: 1700 },        // 双足行走：抓地好
    wheelOwn: { acc: 1150, brake: 900, coast: 240 },      // 己方涂料上的滚轮：滑溜、惯性大
    wheelDry: { acc: 700, brake: 1100, coast: 900 },      // 无涂料地面上的滚轮
    sticky: { acc: 520, brake: 2600, coast: 2600 },       // 敌方涂料：又黏又慢
    air: { acc: 520, brake: 620, coast: 90 },             // 空中：保留动量，少量空中控制
    kbGround: 7.5, kbAir: 1.2,                            // 击退速度的衰减（地面摩擦 / 空气阻力）
    coyote: 0.11,                                         // 走出平台边缘后仍可起跳的宽限时间
    jumpBuffer: 0.13,                                     // 落地前提前按跳的缓冲时间
    jumpCut: 2.4,                                         // 松开跳跃键后上升阶段的额外重力倍数（短按小跳）
    fallMul: 1.25,                                        // 下落阶段重力略大：落地更干脆
    maxFall: 1400,
  };
  function surfaceFor(team, ground, wheel) {
    const P = S.PHYS;
    if (ground < 0) return P.air;
    const enemy = ground !== 0 && ground !== team;
    if (enemy) return P.sticky;
    if (wheel) return ground === team ? P.wheelOwn : P.wheelDry;
    return P.walk;
  }
  // 速度向目标速度靠近：同向加速用 acc，反向/超速用 brake，无输入用 coast
  function approach(p, tx, ty, surf, dt) {
    const dvx = tx - p.vx, dvy = ty - p.vy;
    const dl = Math.hypot(dvx, dvy);
    if (dl < 1e-4) return;
    const tl = Math.hypot(tx, ty), vl = Math.hypot(p.vx, p.vy);
    let a;
    if (tl < 1) a = surf.coast;
    else if (p.vx * tx + p.vy * ty < 0 || vl > tl + 5) a = surf.brake;
    else a = surf.acc;
    const m = Math.min(dl, a * dt);
    p.vx += (dvx / dl) * m; p.vy += (dvy / dl) * m;
  }
  // 施加冲量（击退、后坐力、爆炸），kx/ky 独立于操控速度衰减，玩家无法马上抵消
  S.impulse = function (p, ix, iy, iz) {
    p.kx = (p.kx || 0) + ix; p.ky = (p.ky || 0) + iy;
    const kl = Math.hypot(p.kx, p.ky);
    if (kl > 520) { p.kx *= 520 / kl; p.ky *= 520 / kl; }
    if (iz > 0) { p.vz = Math.max(p.vz || 0, 0) + iz; p.onGround = false; p.coy = 0; }
  };

  // p: {x,y,z,vx,vy,vz,kx,ky,onGround,team,sm}; inp: {mx,my,w,j,jh}
  // 返回脚下涂料（空中为 -1）；p.landV 记录本帧落地冲击速度（供镜头 / 动画 / 音效使用）
  S.stepMove = function (p, inp, dt, grid, M, mul) {
    const P = S.PHYS;
    if (p.z == null) { p.z = S.topAt(M, p.x, p.y); p.vz = 0; p.onGround = true; }
    if (p.kx == null) { p.kx = 0; p.ky = 0; p.coy = 0; p.jb = 0; }
    p.landV = 0;
    let mx = inp.mx || 0, my = inp.my || 0;
    const l = Math.hypot(mx, my);
    if (l > 1) { mx /= l; my /= l; }
    const wheel = !!inp.w;
    const ground = p.onGround ? S.cellAt(grid, p.x, p.y) : -1;
    const spd = S.speedFor(p.team, p.sm, ground, wheel, mul);
    approach(p, mx * spd, my * spd, surfaceFor(p.team, ground, wheel), dt);
    // 击退衰减
    const kd = Math.exp(-dt * (p.onGround ? P.kbGround : P.kbAir));
    p.kx *= kd; p.ky *= kd;
    if (Math.abs(p.kx) < 1) p.kx = 0;
    if (Math.abs(p.ky) < 1) p.ky = 0;
    // 跳跃：土狼时间 + 预输入缓冲
    p.coy = p.onGround ? P.coyote : Math.max(0, p.coy - dt);
    if (inp.j && !p.jHeld) p.jb = P.jumpBuffer; else p.jb = Math.max(0, p.jb - dt);
    p.jHeld = !!inp.j;
    if (p.jb > 0 && p.coy > 0) {
      p.vz = wheel ? S.JUMP_W : S.JUMP_V;
      p.onGround = false; p.coy = 0; p.jb = 0; p.jumped = true;
    }
    // 水平位移 + 碰撞；撞墙时去掉速度中朝向墙的分量（贴墙滑行而不是卡住）
    const ox = p.x, oy = p.y;
    const ex = (p.vx + p.kx) * dt, ey = (p.vy + p.ky) * dt;
    p.x += ex; p.y += ey;
    S.collide(p, S.R, M);
    const nx = p.x - (ox + ex), ny = p.y - (oy + ey);
    const nl = Math.hypot(nx, ny);
    if (nl > 0.01) {
      const ux = nx / nl, uy = ny / nl;
      const dv = p.vx * ux + p.vy * uy;
      if (dv < 0) { p.vx -= ux * dv; p.vy -= uy * dv; }
      const dk = p.kx * ux + p.ky * uy;
      if (dk < 0) { p.kx -= ux * dk * 1.4; p.ky -= uy * dk * 1.4; }   // 击退撞墙小幅反弹
    }
    // 垂直
    const gh = S.topAt(M, p.x, p.y);
    if (p.onGround) {
      if (gh < p.z - 0.5) { p.onGround = false; p.vz = 0; }
      else p.z = gh;
    }
    if (!p.onGround) {
      let g = S.GRAV;
      if (p.vz > 0 && inp.jh === false && p.jumped) g *= P.jumpCut;
      else if (p.vz < 0) g *= P.fallMul;
      p.vz = Math.max(-P.maxFall, p.vz - g * dt);
      p.z += p.vz * dt;
      if (p.z <= gh) {
        p.landV = p.vz; p.z = gh; p.vz = 0; p.onGround = true; p.jumped = false;
        // 落地冲击：重落地会损失一点水平速度
        if (p.landV < -520) { const k = wheel ? 0.92 : 0.7; p.vx *= k; p.vy *= k; }
      }
    }
    return p.onGround ? S.cellAt(grid, p.x, p.y) : -1;
  };

  // ---------------- 涂色（只涂与命中高度相近的顶面） ----------------
  S.paintCircle = function (grid, M, x, y, z, r, team, onCell) {
    r = Math.max(12, r);
    let n = 0;
    const r2 = r * r;
    const x0 = Math.max(0, Math.floor((x - r) / CELL)), x1 = Math.min(GW - 1, Math.floor((x + r) / CELL));
    const y0 = Math.max(0, Math.floor((y - r) / CELL)), y1 = Math.min(GH - 1, Math.floor((y + r) / CELL));
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        const dx = cx * CELL + CELL / 2 - x, dy = cy * CELL + CELL / 2 - y;
        if (dx * dx + dy * dy > r2) continue;
        const i = cy * GW + cx;
        if (M.solid[i]) continue;
        const t = M.top[i];
        if (t > z + 12 || t < z - 35) continue;
        if (grid[i] !== team) { grid[i] = team; n++; if (onCell) onCell(i, team); }
      }
    }
    return n;
  };
  S.countTurf = function (grid, M) {
    let a = 0, b = 0, tot = 0;
    for (let i = 0; i < grid.length; i++) {
      if (M.solid[i]) continue;
      tot++;
      if (grid[i] === 1) a++; else if (grid[i] === 2) b++;
    }
    return { a, b, tot };
  };

  // ---------------- 3D 几何 ----------------
  S.dir3 = (yaw, pitch) => ({ x: Math.cos(pitch) * Math.cos(yaw), y: Math.cos(pitch) * Math.sin(yaw), z: Math.sin(pitch) });
  // 沿方向前进，返回碰到方块/地面的距离
  S.ray3 = function (M, x, y, z, d, max, step = 6) {
    for (let t = 0; t < max; t += step) if (S.insideAt(M, x + d.x * t, y + d.y * t, z + d.z * t)) return t;
    return max;
  };
  S.los3 = function (M, x0, y0, z0, x1, y1, z1) {
    const dx = x1 - x0, dy = y1 - y0, dz = z1 - z0;
    const L = Math.hypot(dx, dy, dz);
    if (L < 1) return true;
    const d = { x: dx / L, y: dy / L, z: dz / L };
    return S.ray3(M, x0, y0, z0, d, L, 8) >= L - 2;
  };
  S.segDist = function (px, py, x0, y0, x1, y1) {
    const dx = x1 - x0, dy = y1 - y0;
    const L2 = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((px - x0) * dx + (py - y0) * dy) / L2));
    const qx = x0 + dx * t, qy = y0 + dy * t;
    return { d: Math.hypot(px - qx, py - qy), along: t * Math.sqrt(L2) };
  };
  // 子弹：先直线飞 ts 秒，然后受 PROJ_G 下坠
  S.projPos = function (pr, t) {
    const ex = t > pr.ts ? t - pr.ts : 0;
    return { x: pr.x0 + pr.vx * t, y: pr.y0 + pr.vy * t, z: pr.z0 + pr.vz * t - 0.5 * S.PROJ_G * ex * ex };
  };
  // 炸弹：抛物线 + 撞墙反弹 + 落地停住（服务器与客户端同一套模拟）
  S.stepBomb = function (b, dt, M) {
    if (b.landed) return;
    const steps = 3, sdt = dt / steps;
    for (let i = 0; i < steps && !b.landed; i++) {
      b.vz -= S.GRAV * sdt;
      const nx = b.x + b.vx * sdt, ny = b.y + b.vy * sdt, nz = b.z + b.vz * sdt;
      if (S.insideAt(M, nx, ny, b.z)) { b.vx *= -0.35; b.vy *= -0.35; }
      else { b.x = nx; b.y = ny; }
      const gh = S.topAt(M, b.x, b.y);
      if (nz <= gh) { b.z = gh; b.landed = true; b.vx = b.vy = b.vz = 0; }
      else b.z = nz;
    }
  };
  S.bombVel = function (yaw, pitch) {
    const d = S.dir3(yaw, Math.min(1.1, pitch + 0.42));
    return { vx: d.x * 430, vy: d.y * 430, vz: d.z * 430 };
  };

  S.QUICK_CHAT = ['这边！', '冲啊！', '好样的！', '需要支援！'];
  return S;
});
