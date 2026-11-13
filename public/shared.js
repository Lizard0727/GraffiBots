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

  // ---------------- 机体（每种机体 = 一套武器 + 大招 + 属性） ----------------
  // 攻击消耗 1 格弹药（共 3 格），不攻击时自动装填；击中敌人给大招充能
  S.AMMO = 3;
  S.WEAPONS = {
    blaster: {
      name: '喷罐机兵', short: '喷罐', role: '均衡射手', desc: '每次攻击连射 5 发涂料弹，射程中等、上手简单，适合任何场合。',
      hp: 100, spd: 1, reload: 1.3, atkCd: 0.42, attack: 'burst', shots: 5, interval: 0.07,
      speed: 650, range: 340, dmg: 15, spread: 0.05, splat: 22, trail: 13, size: 6, special: 'storm', spNeed: 260,
    },
    roller: {
      name: '滚刷机兵', short: '滚刷', role: '冲锋开路', desc: '甩出一扇涂料并向前突进滚压，碾过的敌人受到伤害。生命值高。',
      hp: 130, spd: 1, reload: 1.15, atkCd: 0.5, attack: 'flick', pellets: 5, arc: 0.7, speed: 520, range: 200, dmg: 24,
      spread: 0.05, splat: 20, trail: 0, size: 7, rollWidth: 26, rollDmg: 36, lunge: 330, special: 'charge', spNeed: 230,
    },
    charger: {
      name: '狙击机兵', short: '狙击', role: '远程狙击', desc: '按住蓄力、松开射出贯穿直线，满蓄力伤害极高。蓄力时移动变慢，生命值低。',
      hp: 80, spd: 0.95, reload: 1.9, atkCd: 0.3, attack: 'charge', chargeTime: 0.9, range: 720, dmg: 115, minDmg: 32,
      special: 'missiles', spNeed: 240,
    },
    bucket: {
      name: '泼桶机兵', short: '泼桶', role: '近距爆发', desc: '近距离泼出一大片涂料弹，覆盖面积大，贴脸伤害很高。',
      hp: 115, spd: 0.95, reload: 1.6, atkCd: 0.55, attack: 'fan', pellets: 7, arc: 0.6, speed: 480, range: 240, dmg: 17,
      spread: 0.06, splat: 26, trail: 12, size: 7, special: 'bubble', spNeed: 250,
    },
    gatling: {
      name: '旋转机兵', short: '旋转', role: '持续压制', desc: '每次攻击持续扫射 1 秒，射程远、火力持续，但装填慢。',
      hp: 110, spd: 0.92, reload: 2.1, atkCd: 0.3, attack: 'burst', shots: 14, interval: 0.075,
      speed: 700, range: 430, dmg: 8, spread: 0.09, splat: 18, trail: 12, size: 5, special: 'beam', spNeed: 300,
    },
    mortar: {
      name: '迫击机兵', short: '迫击', role: '曲射炮手', desc: '把涂料炮弹抛到瞄准的位置，能越过墙壁和掩体，落地爆炸涂一大片。',
      hp: 85, spd: 0.95, reload: 1.6, atkCd: 0.5, attack: 'lob', range: 420, minRange: 70, dmg: 44, blast: 54, flight: 0.75,
      special: 'barrage', spNeed: 250, isNew: true,
    },
    fist: {
      name: '重拳机兵', short: '重拳', role: '贴身格斗', desc: '向前冲出一记重拳，伤害高并把敌人击飞。生命值最高、移动最快，但只能近身。',
      hp: 150, spd: 1.08, reload: 0.85, atkCd: 0.38, attack: 'punch', range: 68, arc: 1.7, dmg: 40, kb: 260, lunge: 200,
      special: 'quake', spNeed: 210, isNew: true,
    },
  };
  S.WEAPON_ORDER = ['blaster', 'roller', 'charger', 'bucket', 'gatling', 'mortar', 'fist'];
  S.weaponRange = function (id) {
    const w = S.WEAPONS[id];
    if (id === 'charger') return 620;
    if (id === 'roller') return 180;
    if (id === 'fist') return 80;
    return w.range;
  };

  S.SPECIALS = {
    storm: { name: '涂装风暴', desc: '向四周连续爆发三圈涂料弹。' },
    charge: { name: '碾压冲锋', desc: '4 秒无敌高速冲刺，碾过的敌人受到重创。' },
    missiles: { name: '锁定导弹', desc: '锁定所有敌人当前位置，1.5 秒后导弹落下。' },
    bubble: { name: '气泡护盾', desc: '为自己和附近队友套上吸收伤害的护盾。' },
    beam: { name: '极光喷射', desc: '2.6 秒持续高压光束，贯穿并涂满整条直线。' },
    barrage: { name: '地毯轰炸', desc: '沿瞄准方向连续落下 6 发炮弹。' },
    quake: { name: '地震重锤', desc: '跳向瞄准位置，落地砸出冲击波，击飞周围敌人。' },
  };
  S.SPECIAL_IDS = [null, 'storm', 'charge', 'missiles', 'bubble', 'beam', 'barrage', 'quake'];
  S.superAimed = (sp) => sp === 'beam' || sp === 'barrage' || sp === 'quake' || sp === 'charge';

  // ---------------- 驾驶员技能（每局 3 次，冷却 6 秒；驾驶员弹出后也能用） ----------------
  S.SKILL_USES = 3; S.SKILL_CD = 6;
  S.SKILLS = {
    rush: { short: '加速', name: '肾上腺素', desc: '3 秒内移动速度 +35%，装填速度翻倍。' },
    scan: { short: '扫描', name: '义眼扫描', desc: '5 秒内全队能看到所有敌人，包括草丛里和隐身的。' },
    cheer: { short: '应援', name: '应援音波', desc: '为自己和附近队友回复 40 点生命。' },
    guard: { short: '护盾', name: '钢铁护盾', desc: '获得可吸收 60 点伤害的护盾，持续 4 秒。' },
    smoke: { short: '墨雾', name: '墨雾', desc: '在脚下炸开一片己方涂料，并隐身 3 秒（攻击也不会现形）。' },
    turret: { short: '炮台', name: '涂装炮台', desc: '在原地放下一座自动炮台，7 秒内攻击附近敌人。' },
    dash: { short: '冲刺', name: '冲刺推进', desc: '朝移动方向高速冲刺，冲刺瞬间无敌。' },
    emp: { short: '脉冲', name: '电磁脉冲', desc: '附近敌人减速 45%，并在 1.2 秒内无法攻击。' },
    bento: { short: '便当', name: '能量便当', desc: '在脚下放一份便当，第一个碰到的队友回复 60 点生命。' },
    overdrive: { short: '火力', name: '火力全开', desc: '立即装满弹药，接下来 3 次攻击伤害 +40%。' },
    drone: { short: '无人机', name: '猫猫无人机', desc: '召唤跟随自己的无人机，6 秒内自动射击附近敌人。' },
  };

  // ---------------- 驾驶员被摧毁后：弹出继续战斗 ----------------
  S.PILOT_HP = 50;          // 弹出驾驶员的生命值
  S.PILOT_R = 9;            // 驾驶员碰撞半径
  S.PILOT_SPEED = 205;
  S.REBUILD = 6;            // 新机体重建时间（秒），驾驶员活下来就在原地空投新机体
  S.KO_RESPAWN = 4;         // 驾驶员被击倒后回基地复活的时间
  S.PISTOL = { range: 260, dmg: 13, speed: 620, reload: 0.85, atkCd: 0.32, size: 5, splat: 12, trail: 0 };
  S.BUSH_DETECT = 90;       // 草丛里的敌人在这个距离内会被看见

  // ---------------- 奖杯之路（解锁头部涂装） ----------------
  S.TROPHY_WIN = 8; S.TROPHY_DRAW = 2; S.TROPHY_LOSS = 3;

  // ---------------- 头部涂装（随等级解锁） ----------------
  S.HEADS = [
    { id: 'antenna', name: '天线', lv: 1, tr: 0 },
    { id: 'mohawk', name: '莫西干', lv: 2, tr: 30 },
    { id: 'phones', name: '耳机', lv: 3, tr: 80 },
    { id: 'cone', name: '路锥', lv: 4, tr: 150 },
    { id: 'crown', name: '王冠', lv: 6, tr: 250 },
    { id: 'horns', name: '恶魔角', lv: 8, tr: 400 },
  ];
  // ---------------- 驾驶员（立绘 + 3D 驾驶舱里的角色） ----------------
  // hair/skin/eye 同时用于 SVG 立绘与 3D 模型；style 决定发型
  S.PILOTS = [
    { id: 'blaze', name: '凌焰', code: '烈焰', title: '热血突击手', weapon: 'blaster', accent: '#ff4d3d',
      hair: '#e8382f', hair2: '#8f1022', skin: '#ffd9bf', eye: '#ffb21f', style: 'spiky', eyeShape: 'sharp', mouth: 'grin', outfit: 'jacket',
      skill: 'rush', passive: { name: '越战越勇', desc: '击毁机体或击倒驾驶员后回复 30% 生命。' },
      line: '涂料都装满了？那就冲啊！', bio: '街头涂鸦队的队长，永远第一个冲进敌阵。说话大声、笑声更大，护目镜是他唯一不肯借人的东西。' },
    { id: 'frost', name: '白夜', code: '霜刃', title: '冷面狙击手', weapon: 'charger', accent: '#5fd3ff',
      hair: '#e6eef8', hair2: '#8796b8', skin: '#fde3d2', eye: '#47c8ff', style: 'swept', eyeShape: 'cool', mouth: 'calm', outfit: 'coat',
      skill: 'scan', passive: { name: '远距精准', desc: '对 60% 射程以外的目标伤害 +12%。' },
      line: '一发，就够了。', bio: '曾经的天台竞速冠军，退役后只用一支狙击笔说话。刘海下藏着一只机械义眼，能看清八百米外的涂料滴。' },
    { id: 'candy', name: '苏糖', code: '电音', title: '元气偶像主播', weapon: 'gatling', accent: '#ff5fc1',
      hair: '#ff8fcf', hair2: '#c0367e', skin: '#ffe2d3', eye: '#b56bff', style: 'twintail', eyeShape: 'round', mouth: 'open', outfit: 'idol',
      skill: 'cheer', passive: { name: '人气爆棚', desc: '大招充能速度 +20%。' },
      line: '大家～今天也要涂得闪闪发光哦！', bio: '拥有百万粉丝的直播主，猫耳耳机连着直播间。看起来软萌，实际是旋转喷管的火力狂人。' },
    { id: 'titan', name: '雷豹', code: '铁拳', title: '重装开路者', weapon: 'roller', accent: '#ffb000',
      hair: '#2a2420', hair2: '#0d0b0a', skin: '#b97a55', eye: '#ffcc33', style: 'dreads', eyeShape: 'bold', mouth: 'smirk', outfit: 'tank',
      skill: 'guard', passive: { name: '钢筋铁骨', desc: '机体生命值 +15%。' },
      line: '挡路的，统统碾过去。', bio: '前码头起重机驾驶员，力气大到能单手扛起滚刷。外表凶悍，其实是全队最会照顾人的大哥。' },
    { id: 'raven', name: '夜鸢', code: '墨鸦', title: '神秘涂鸦师', weapon: 'bucket', accent: '#a46bff',
      hair: '#3b2b5c', hair2: '#160f26', skin: '#f6d8c8', eye: '#c18bff', style: 'hood', eyeShape: 'sleepy', mouth: 'smirk', outfit: 'hoodie',
      skill: 'smoke', passive: { name: '暗影步', desc: '在草丛和己方涂料上移动速度 +10%。' },
      line: '这面墙……归我了。', bio: '城市里最神秘的涂鸦作者，没人见过她摘下兜帽。她泼出的每一桶涂料都是一幅画。' },
    { id: 'aurora', name: '星澜', code: '极光', title: '天才机兵工程师', weapon: 'blaster', accent: '#2ee6b0',
      hair: '#35d6c4', hair2: '#1c6f8c', skin: '#ffe4d6', eye: '#3fe0a0', style: 'ponytail', eyeShape: 'round', mouth: 'smile', outfit: 'engineer',
      skill: 'turret', passive: { name: '快速装配', desc: '机体被摧毁后，新机体重建时间 -2 秒。' },
      line: '机兵的参数我都调好啦，交给我吧！', bio: '十四岁就设计出第一台涂鸦机兵的天才少女。头上的护目镜是工作用的，扳手总是插在腰间。' },
    // ---- 新驾驶员 ----
    { id: 'gale', name: '风羽', code: '疾风', title: '天空竞速手', weapon: 'fist', accent: '#4fb8ff', isNew: true,
      hair: '#d6ecff', hair2: '#6f8fc8', skin: '#ffe0cc', eye: '#2f9bff', style: 'braid', eyeShape: 'sharp', mouth: 'smile', outfit: 'aviator',
      skill: 'dash', passive: { name: '轻装上阵', desc: '弹出后的驾驶员移动速度 +30%。' },
      line: '追得上我的话，就来试试吧！', bio: '滑翔伞联赛三连冠，把机兵当成会走路的滑翔翼来开。长辫子和围巾是她在风里最好认的标志。' },
    { id: 'hex', name: '洛奇', code: '骇客', title: '天才黑客', weapon: 'charger', accent: '#c06bff', isNew: true,
      hair: '#2b2140', hair2: '#120a1c', skin: '#f4d9c6', eye: '#ff6bf0', style: 'undercut', eyeShape: 'cool', mouth: 'smirk', outfit: 'hacker',
      skill: 'emp', passive: { name: '信号侦测', desc: '能看见更远处草丛里的敌人（170 范围）。' },
      line: '你的机兵，现在归我了。', bio: '十六岁黑进了城市所有的广告屏，只为播放自己的涂鸦动画。护目镜上永远滚动着看不懂的代码。' },
    { id: 'chef', name: '包大福', code: '大厨', title: '后勤大厨', weapon: 'bucket', accent: '#ff9f2e', isNew: true,
      hair: '#c4652c', hair2: '#7a3612', skin: '#ffd9b8', eye: '#7a4a24', style: 'chef', eyeShape: 'happy', mouth: 'grin', outfit: 'chefcoat',
      skill: 'bento', passive: { name: '吃饱才有力气', desc: '脱离战斗后回血速度 +50%。' },
      line: '打完这局，大家来吃饭！', bio: '街角夜宵摊老板，用泼桶机兵炒菜火候刚好。队友受伤了，他总能从驾驶舱里掏出热腾腾的便当。' },
    { id: 'vet', name: '秦岳', code: '老兵', title: '退役王牌', weapon: 'mortar', accent: '#9bc94a', isNew: true,
      hair: '#c2c6ce', hair2: '#6c7078', skin: '#e3b894', eye: '#7aa8c0', style: 'veteran', eyeShape: 'bold', mouth: 'calm', outfit: 'military',
      skill: 'overdrive', passive: { name: '同归于尽', desc: '机体被摧毁时自爆，对周围敌人造成 60 点伤害。' },
      line: '小鬼们，看好了。', bio: '第一代机兵测试驾驶员，一只眼睛在当年的事故里留下了伤。退休后在训练场当教官，嘴硬心软。' },
    { id: 'yuzu', name: '小柚', code: '机仆', title: '无人机少女', weapon: 'gatling', accent: '#ffc531', isNew: true,
      hair: '#ff9a3d', hair2: '#c25a12', skin: '#ffe4d2', eye: '#ff6a2e', style: 'buns', eyeShape: 'round', mouth: 'open', outfit: 'kid',
      skill: 'drone', passive: { name: '涂鸦小能手', desc: '涂地给大招的充能翻倍。' },
      line: '小喵，出动！把那边涂满！', bio: '星澜的邻居小妹妹，自己改装了一架猫咪无人机。个子最小，背包里的零件却最多。' },
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
      bush: [[22, 14, 6, 6], [30, 57, 8, 5], [46, 35, 5, 10], [9, 22, 5, 5]],
      rects: [[16, 10, 4, 18, 3], [16, 52, 4, 18, 3], [28, 30, 10, 4, 1], [28, 46, 10, 4, 1], [40, 4, 6, 12, 3],
        [44, 64, 8, 6, 2], [42, 64, 2, 6, 1], [56, 20, 8, 5, 2], [56, 25, 8, 2, 1]],
    },
    {
      name: '涂鸦天台', desc: '长条通道与高台狙击点，基地前有矮墙，适合远程武器。', goalX: 31,
      bush: [[16, 22, 10, 5], [28, 50, 8, 6], [46, 20, 6, 6], [50, 50, 6, 8]],
      rects: [[14, 18, 22, 3, 3], [14, 59, 22, 3, 3], [40, 0, 4, 14, 3], [40, 34, 3, 12, 2], [37, 36, 3, 8, 1],
        [24, 36, 6, 8, 1], [52, 10, 16, 3, 3]],
    },
    {
      name: '齿轮广场', desc: '中央被可攀爬的环形高台包围，上下层立体乱斗。', goalX: 37,
      bush: [[12, 24, 6, 8], [22, 48, 8, 6], [36, 26, 6, 6], [53, 33, 5, 5]],
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
    // 草丛：只长在地面上，进去之后敌人看不见你（靠得很近或你攻击时会暴露）
    const bush = new Uint8Array(GW * GH), bushes = [];
    for (const r of m.bush || []) {
      for (const rr of [r, [GW - r[0] - r[2], GH - r[1] - r[3], r[2], r[3]]]) {
        bushes.push(rr);
        for (let j = rr[1]; j < rr[1] + rr[3]; j++)
          for (let i = rr[0]; i < rr[0] + rr[2]; i++)
            if (i >= 0 && i < GW && j >= 0 && j < GH && !lv[j * GW + i]) bush[j * GW + i] = 1;
      }
    }
    return { top, solid, lv, rects, bush, bushes };
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
  S.inBush = (M, x, y, z) => { const cx = Math.floor(x / CELL), cy = Math.floor(y / CELL); return S.inBounds(cx, cy) && M.bush[cy * GW + cx] === 1 && z < 6; };
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
    return { blaster: 0.9, roller: 1, charger: 0.5, bucket: 0.85, gatling: 0.6, mortar: 0.9, fist: 1 }[weapon] || 1;
  };
  // ground: 脚下涂料（-1 表示在空中）
  S.speedFor = function (team, sm, ground, wheel, mul, foot) {
    let s;
    if (foot) {
      // 弹出的驾驶员：跑得快，不能变滚轮
      const enemy = ground > 0 && ground !== team;
      return (enemy ? 125 : S.PILOT_SPEED) * (sm || 1);
    }
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
    const foot = !!p.foot;
    const wheel = !!inp.w && !foot;
    const ground = p.onGround ? S.cellAt(grid, p.x, p.y) : -1;
    const spd = S.speedFor(p.team, p.sm, ground, wheel, mul, foot);
    const RAD = foot ? S.PILOT_R : S.R;
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
    S.collide(p, RAD, M);
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
