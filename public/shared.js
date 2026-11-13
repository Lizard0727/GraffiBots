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
      hp: 100, spd: 1, reload: 1.4, atkCd: 0.42, attack: 'burst', shots: 5, interval: 0.07,
      speed: 650, range: 325, dmg: 13.5, spread: 0.05, splat: 22, trail: 13, size: 6, special: 'storm', spNeed: 260,
    },
    roller: {
      name: '滚刷机兵', short: '滚刷', role: '冲锋开路', desc: '甩出一扇涂料并向前突进滚压，碾过的敌人受到伤害。生命值高。',
      hp: 125, spd: 1, reload: 1.15, atkCd: 0.5, attack: 'flick', pellets: 5, arc: 0.7, speed: 520, range: 200, dmg: 24,
      spread: 0.05, splat: 20, trail: 0, size: 7, rollWidth: 26, rollDmg: 27, lunge: 300, special: 'charge', spNeed: 230,
    },
    charger: {
      name: '狙击机兵', short: '狙击', role: '远程狙击', desc: '按住蓄力、松开射出贯穿直线，满蓄力伤害极高。蓄力时移动变慢，生命值低。',
      hp: 80, spd: 0.95, reload: 1.9, atkCd: 0.3, attack: 'charge', chargeTime: 0.9, range: 720, dmg: 115, minDmg: 32,
      special: 'missiles', spNeed: 240,
    },
    bucket: {
      name: '泼桶机兵', short: '泼桶', role: '近距爆发', desc: '近距离泼出一大片涂料弹，覆盖面积大，贴脸伤害很高。',
      hp: 115, spd: 0.95, reload: 1.6, atkCd: 0.55, attack: 'fan', pellets: 7, arc: 0.6, speed: 480, range: 240, dmg: 15.8,
      spread: 0.06, splat: 26, trail: 12, size: 7, special: 'bubble', spNeed: 250,
    },
    gatling: {
      name: '旋转机兵', short: '旋转', role: '持续压制', desc: '每次攻击持续扫射 1 秒，射程远、火力持续，但装填慢。',
      hp: 110, spd: 0.92, reload: 2.6, atkCd: 0.3, attack: 'burst', shots: 12, interval: 0.075,
      speed: 700, range: 400, dmg: 5.8, spread: 0.11, splat: 15, trail: 9, size: 5, special: 'beam', spNeed: 300,
    },
    mortar: {
      name: '迫击机兵', short: '迫击', role: '曲射炮手', desc: '把涂料炮弹抛到瞄准的位置，能越过墙壁和掩体，落地爆炸涂一大片。',
      hp: 85, spd: 0.95, reload: 1.6, atkCd: 0.5, attack: 'lob', range: 420, minRange: 70, dmg: 48, blast: 62, flight: 0.68,
      special: 'barrage', spNeed: 250, isNew: true,
    },
    fist: {
      name: '重拳机兵', short: '重拳', role: '贴身格斗', desc: '向前冲出一记重拳，伤害高并把敌人击飞。厚重装甲减伤 25%，移动最快，但只能近身。',
      hp: 175, spd: 1.12, reload: 0.85, atkCd: 0.38, attack: 'punch', range: 68, arc: 1.7, dmg: 52, kb: 260, lunge: 240,
      armor: 0.75, special: 'quake', spNeed: 180, isNew: true,
    },
    // ---- 1.1：任务奖励机甲 ----
    riot: {
      name: '防暴盾卫', short: '盾卫', role: '护盾前排', desc: '举着灰石集团的防暴盾牌：正面受到的伤害 -40%，电击警棍近距离放电。大招立起一面能挡住子弹的盾墙。',
      hp: 150, spd: 0.96, reload: 1.25, atkCd: 0.45, attack: 'fan', pellets: 4, arc: 0.5, speed: 520, range: 190, dmg: 19, front: 0.6,
      spread: 0.04, splat: 22, trail: 12, size: 7, special: 'aegis', spNeed: 230, quest: 1,
    },
    // ---- S1 灰城重涂：赛季机甲 ----
    dozer: {
      name: '推土机兵', short: '推土', role: '前排推进', desc: '铲斗推出一排厚重涂料，近距离把敌人推开。生命值极高，是冲在最前面的墙。',
      hp: 165, spd: 0.94, reload: 1.35, atkCd: 0.5, attack: 'fan', pellets: 6, arc: 0.95, speed: 480, range: 175, dmg: 15, kb: 2.2,
      spread: 0.04, splat: 24, trail: 14, size: 8, special: 'bulldoze', spNeed: 240, season: 1,
    },
    flamer: {
      name: '喷火罐车', short: '喷火', role: '近距压制', desc: '持续喷出一道滚烫的涂料火焰，射程短但覆盖面极大，能把整条巷子烧成你的颜色。',
      hp: 120, spd: 0.97, reload: 1.7, atkCd: 0.3, attack: 'burst', shots: 12, interval: 0.055, speed: 430, range: 215, dmg: 8.5,
      spread: 0.24, splat: 25, trail: 15, size: 7, special: 'napalm', spNeed: 260, season: 1,
    },
    carrier: {
      name: '无人机母舰', short: '母舰', role: '追踪骚扰', desc: '放出会自动追踪敌人的小型涂装无人机，打不准也能命中，适合远距离骚扰。',
      hp: 115, spd: 0.96, reload: 1.45, atkCd: 0.45, attack: 'burst', shots: 4, interval: 0.13, speed: 400, range: 500, dmg: 21, homing: 2.6,
      spread: 0.12, splat: 22, trail: 10, size: 6, special: 'swarm', spNeed: 270, season: 1,
    },
    wrecker: {
      name: '拆楼锤', short: '拆楼', role: '重型挥击', desc: '抡起拆楼大锤横扫一大片，命中的敌人被狠狠砸飞。厚重装甲减伤 25%，一锤定音。',
      hp: 170, spd: 1.08, reload: 1.15, atkCd: 0.5, attack: 'punch', range: 104, arc: 2.4, dmg: 56, kb: 340, lunge: 170,
      armor: 0.75, special: 'whirl', spNeed: 190, season: 1,
    },
    megaphone: {
      name: '喇叭车', short: '喇叭', role: '穿墙音波', desc: '用巨型喇叭放出音波涂料，音波能穿过墙壁和掩体，专治躲在墙后的敌人。',
      hp: 105, spd: 1, reload: 1.3, atkCd: 0.45, attack: 'fan', pellets: 3, arc: 0.42, speed: 560, range: 330, dmg: 21, ghost: true,
      spread: 0.02, splat: 16, trail: 10, size: 10, special: 'sonic', spNeed: 250, season: 1,
    },
  };
  S.WEAPON_ORDER = ['blaster', 'roller', 'charger', 'bucket', 'gatling', 'mortar', 'fist', 'dozer', 'flamer', 'carrier', 'wrecker', 'megaphone', 'riot'];
  S.weaponRange = function (id) {
    const w = S.WEAPONS[id];
    if (id === 'charger') return 620;
    if (id === 'roller') return 180;
    if (id === 'fist') return 80;
    if (id === 'wrecker') return 108;
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
    bulldoze: { name: '推平', desc: '朝瞄准方向推出一整排涂料墙，沿路碾过并推飞所有敌人。' },
    napalm: { name: '燃料罐', desc: '把燃料罐扔到瞄准位置，烧出一片持续 4 秒的火海，站在里面的敌人不断掉血。' },
    swarm: { name: '蜂群', desc: '放出 3 架跟随自己的攻击无人机，8 秒内自动扫射附近敌人。' },
    whirl: { name: '大摆锤', desc: '抡着大锤原地旋转 2.2 秒，持续砸飞靠近的敌人，移动速度不减。' },
    sonic: { name: '音爆', desc: '以自己为中心炸开一圈巨大音波，穿墙伤害并击退周围所有敌人。' },
    aegis: { name: '盾墙', desc: '在面前立起一面 6 秒的能量盾墙，挡住敌人的所有子弹（队友可以从后面开火）。' },
  };
  S.SPECIAL_IDS = [null, 'storm', 'charge', 'missiles', 'bubble', 'beam', 'barrage', 'quake', 'bulldoze', 'napalm', 'swarm', 'whirl', 'sonic', 'aegis'];
  S.superAimed = (sp) => sp === 'beam' || sp === 'barrage' || sp === 'quake' || sp === 'charge' || sp === 'bulldoze' || sp === 'napalm';

  // ---------------- 驾驶员技能（每局 3 次，冷却 6 秒；驾驶员弹出后也能用） ----------------
  S.SKILL_USES = 3; S.SKILL_CD = 6;
  S.SKILLS = {
    rush: { short: '加速', name: '肾上腺素', desc: '3 秒内移动速度 +35%，装填速度翻倍。' },
    scan: { short: '扫描', name: '义眼扫描', desc: '5 秒内全队能看到所有敌人，包括草丛里和隐身的。' },
    cheer: { short: '应援', name: '应援音波', desc: '为自己和附近队友（200 范围）回复 50 点生命。' },
    guard: { short: '护盾', name: '钢铁护盾', desc: '获得可吸收 60 点伤害的护盾，持续 4 秒。' },
    smoke: { short: '墨雾', name: '墨雾', desc: '在脚下炸开一片己方涂料，并隐身 3 秒（攻击也不会现形）。' },
    turret: { short: '炮台', name: '涂装炮台', desc: '在原地放下一座自动炮台，7 秒内攻击附近敌人。' },
    dash: { short: '冲刺', name: '冲刺推进', desc: '朝移动方向高速冲刺，冲刺瞬间无敌。' },
    emp: { short: '脉冲', name: '电磁脉冲', desc: '附近敌人（190 范围）减速 45%，并在 1.3 秒内无法攻击。' },
    bento: { short: '便当', name: '能量便当', desc: '在脚下放一份便当，第一个碰到的队友回复 75 点生命。' },
    overdrive: { short: '火力', name: '火力全开', desc: '立即装满弹药，接下来 3 次攻击伤害 +40%。' },
    drone: { short: '无人机', name: '猫猫无人机', desc: '召唤跟随自己的无人机，6 秒内自动射击附近敌人。' },
    rally: { short: '集结', name: '集结号', desc: '插下反抗军旗帜，5 秒内自己和附近队友伤害 +20%、移动速度 +15%。' },
    blast: { short: '爆破', name: '定向爆破', desc: '在脚下放一包炸药，0.9 秒后爆炸，造成 80 点伤害并涂满周围。' },
    jam: { short: '干扰', name: '声波干扰', desc: '附近敌人的大招充能减少 30%，并暴露位置 4 秒（草丛里也藏不住）。' },
    flash: { short: '闪光', name: '闪光弹', desc: '朝前方扔出闪光弹：扇形范围内的敌人受到 15 点伤害、减速 1.5 秒、0.8 秒内无法攻击，并暴露 4 秒。' },
  };
  // ---------------- 超载技能（突破 I 解锁，每局 1 次，打出伤害充能） ----------------
  // dmg / def：伤害倍率 / 受伤倍率；spd：移速倍率；其余字段是专属效果
  S.OV_NEED = 360;      // 充满需要打出的伤害
  S.OV_TIME = 6;        // 持续时间（突破 II 后 +2 秒、效果更强）
  S.OVERLOADS = {
    blaze: { name: '燃烧模式', desc: '伤害 +30%，移动速度 +20%。', dmg: 1.3, spd: 1.2 },
    frost: { name: '绝对零度', desc: '伤害 +40%，被命中的敌人减速 1 秒。', dmg: 1.4, frostHit: 1 },
    candy: { name: '安可！', desc: '每秒为自己和附近队友回复 14 生命，大招充能翻倍。', regen: 14, spGain: 2 },
    titan: { name: '钢铁意志', desc: '受到的伤害 -50%，不会被击退。', def: 0.5, noKb: 1 },
    raven: { name: '影袭', desc: '完全隐身，移动速度 +25%。', stealth: 1, spd: 1.25 },
    aurora: { name: '超频装配', desc: '弹药无限，攻击不用等装填。', infAmmo: 1 },
    gale: { name: '乘风', desc: '移动速度 +45%，立刻刷新技能冷却并多 1 次技能。', spd: 1.45, skillReset: 1 },
    hex: { name: '全网瘫痪', desc: '发动时全部敌人暴露并沉默 3 秒（不能放技能和大招）。', hack: 1 },
    chef: { name: '满汉全席', desc: '立刻为自己和附近队友回复 50 生命，之后每秒回复 8。', burstHeal: 50, regen: 8 },
    vet: { name: '老兵不死', desc: '持续期间不会倒下，伤害 +20%。', undying: 1, dmg: 1.2 },
    yuzu: { name: '喵喵军团', desc: '召唤 2 架猫猫无人机，攻击速度 +20%。', drones: 2, rof: 1.2 },
    flag: { name: '全军突击', desc: '附近 300 范围内的队友伤害 +20%、移动速度 +15%。', rally: 1 },
    hammer: { name: '爆破专家', desc: '伤害 +40%，击退距离翻倍。', dmg: 1.4, kb: 2 },
    echo: { name: '音浪风暴', desc: '每秒向四周放出一圈音波，穿墙造成 22 点伤害。', pulse: 22 },
    han: { name: '反戈一击', desc: '受到的伤害 -20%，并把受到伤害的 50% 反弹给攻击者。', def: 0.8, reflect: 0.5 },
  };
  // ---------------- 天赋树（账号共用；每局最多装 3 个已点亮的天赋） ----------------
  S.TALENT_BRANCHES = [
    { id: 'atk', name: '进攻', color: '#ff4d3d' },
    { id: 'def', name: '防守', color: '#4fb8ff' },
    { id: 'paint', name: '涂装', color: '#ffc531' },
    { id: 'sup', name: '辅助', color: '#9cff2e' },
  ];
  S.TALENTS = [
    { id: 'a1', br: 'atk', tier: 1, cost: 1, name: '精准喷涂', desc: '伤害 +6%' },
    { id: 'a2', br: 'atk', tier: 2, cost: 1, name: '快速装填', desc: '装填速度 +12%' },
    { id: 'a3', br: 'atk', tier: 3, cost: 2, name: '大招猎手', desc: '打中敌人给的大招充能 +15%' },
    { id: 'a4', br: 'atk', tier: 4, cost: 2, name: '终结者', desc: '对生命低于 30% 的敌人伤害 +15%' },
    { id: 'd1', br: 'def', tier: 1, cost: 1, name: '加厚装甲', desc: '机体生命 +8%' },
    { id: 'd2', br: 'def', tier: 2, cost: 1, name: '弹射护盾', desc: '驾驶员弹出时获得 25 点护盾' },
    { id: 'd3', br: 'def', tier: 3, cost: 2, name: '快速重建', desc: '新机体重建时间 -1 秒' },
    { id: 'd4', br: 'def', tier: 4, cost: 2, name: '背水一战', desc: '生命低于 30% 时受到的伤害 -15%' },
    { id: 'p1', br: 'paint', tier: 1, cost: 1, name: '大号喷嘴', desc: '涂料溅开的范围 +12%' },
    { id: 'p2', br: 'paint', tier: 2, cost: 1, name: '滑行高手', desc: '在己方涂料上移动速度 +6%' },
    { id: 'p3', br: 'paint', tier: 3, cost: 2, name: '涂地充能', desc: '涂地给的大招充能 +25%' },
    { id: 'p4', br: 'paint', tier: 4, cost: 2, name: '墨水回复', desc: '站在己方涂料上每秒回复 3 生命' },
    { id: 's1', br: 'sup', tier: 1, cost: 1, name: '技能专精', desc: '技能冷却 -25%' },
    { id: 's2', br: 'sup', tier: 2, cost: 1, name: '额外技能', desc: '每局技能次数 +1' },
    { id: 's3', br: 'sup', tier: 3, cost: 2, name: '超载预热', desc: '超载技能充能速度 +20%' },
    { id: 's4', br: 'sup', tier: 4, cost: 2, name: '急救包', desc: '击毁机体或击倒驾驶员后回复 15 生命' },
    // ---- 1.1 新增：第 5、6 级 ----
    { id: 'a5', br: 'atk', tier: 5, cost: 3, name: '连击喷涂', desc: '每第 5 次命中敌人，伤害 ×1.6', isNew: true },
    { id: 'a6', br: 'atk', tier: 6, cost: 3, name: '弱点打击', desc: '对被减速、沉默或暴露的敌人伤害 +20%', isNew: true },
    { id: 'd5', br: 'def', tier: 5, cost: 3, name: '不屈装甲', desc: '每台机体一次：受到致命伤害时保留 1 点生命并无敌 1.5 秒', isNew: true },
    { id: 'd6', br: 'def', tier: 6, cost: 3, name: '堡垒', desc: '单次超过 30 点的伤害 -20%', isNew: true },
    { id: 'p5', br: 'paint', tier: 5, cost: 3, name: '主场优势', desc: '站在己方涂料上时伤害 +8%', isNew: true },
    { id: 'p6', br: 'paint', tier: 6, cost: 3, name: '墨迹疾行', desc: '滚轮形态在己方涂料上移动速度再 +10%', isNew: true },
    { id: 's5', br: 'sup', tier: 5, cost: 3, name: '战术掩护', desc: '发动大招时，附近队友获得 30 点护盾', isNew: true },
    { id: 's6', br: 'sup', tier: 6, cost: 3, name: '超载共鸣', desc: '超载技能持续时间 +2 秒', isNew: true },
  ];
  S.talent = (id) => S.TALENTS.find((t) => t.id === id);
  // ---------------- 皮肤（第一赛季商店 / 通行证） ----------------
  // pilot：驾驶员服装（换配色，立绘和 3D 都会变）；mech：机甲涂装；fx：涂料特效；frame：名片框；avatar：头像
  S.SKINS = [
    { id: 'blaze_grey', kind: 'pilot', pilot: 'blaze', name: '灰城游击', rare: 2, price: 0, pass: 'p1', over: { hair: '#ff8a1f', hair2: '#a3420c', accent: '#ff8a1f' } },
    { id: 'frost_night', kind: 'pilot', pilot: 'frost', name: '夜巡', rare: 2, price: 150, over: { hair: '#1d2233', hair2: '#06080f', accent: '#2ef0c8', eye: '#2ef0c8' } },
    { id: 'candy_neon', kind: 'pilot', pilot: 'candy', name: '霓虹偶像', rare: 2, price: 150, over: { hair: '#a46bff', hair2: '#5b2bb0', accent: '#a46bff', eye: '#ff3ea5' } },
    { id: 'titan_hivis', kind: 'pilot', pilot: 'titan', name: '拆迁工装', rare: 1, price: 100, over: { accent: '#ff8a1f', hair: '#4a3020' } },
    { id: 'raven_ash', kind: 'pilot', pilot: 'raven', name: '灰烬', rare: 2, price: 150, over: { hair: '#c9ccd4', hair2: '#6c7078', accent: '#ff3b52', eye: '#ff3b52' } },
    { id: 'echo_midnight', kind: 'pilot', pilot: 'echo', name: '午夜频道', rare: 3, price: 0, pass: 'p14', over: { hair: '#ff3ea5', hair2: '#8f1060', accent: '#ff3ea5', eye: '#2ef0c8' } },
    { id: 'hammer_gold', kind: 'pilot', pilot: 'hammer', name: '金牌工头', rare: 4, price: 380, over: { accent: '#ffd35e', hair: '#1e120a' } },
    { id: 'flag_red', kind: 'pilot', pilot: 'flag', name: '红旗特装', rare: 4, price: 0, pass: 'p30', over: { hair: '#c8102e', hair2: '#5a0012', accent: '#ffe14d', eye: '#ffe14d' } },
    { id: 'm_camo', kind: 'mech', name: '灰城迷彩', rare: 2, price: 0, pass: 'p5', paint: { frame: '#4a4d56', light: '#9aa0a8', joint: '#2a2c33' } },
    { id: 'm_chrome', kind: 'mech', name: '铬合金', rare: 2, price: 180, paint: { frame: '#c9d3dc', light: '#ffffff', joint: '#8c94ab' } },
    { id: 'm_graffiti', kind: 'mech', name: '涂鸦大师', rare: 3, price: 240, paint: { frame: '#ff3ea5', light: '#ffe600', joint: '#1fd6ee' } },
    { id: 'm_neon', kind: 'mech', name: '霓虹描边', rare: 3, price: 0, pass: 'p20', paint: { frame: '#141018', light: '#2ef0c8', joint: '#141018', glow: 1 } },
    { id: 'm_gold', kind: 'mech', name: '金色传说', rare: 4, price: 380, paint: { frame: '#b88a1a', light: '#ffd35e', joint: '#7a5a10', glow: 1 } },
    { id: 'fx_stars', kind: 'fx', name: '星星涂料', rare: 2, price: 0, pass: 'p10', fx: { cols: ['#ffe600', '#ffffff'], n: 3 } },
    { id: 'fx_confetti', kind: 'fx', name: '派对彩纸', rare: 3, price: 0, pass: 'p28', fx: { cols: ['#ff3ea5', '#1fd6ee', '#9cff2e', '#ffe600'], n: 5 } },
    { id: 'fx_notes', kind: 'fx', name: '电台音符', rare: 2, price: 160, fx: { cols: ['#2ef0c8', '#a46bff'], n: 3 } },
    { id: 'fx_galaxy', kind: 'fx', name: '星河涂料', rare: 4, price: 400, fx: { cols: ['#b78cff', '#4fb8ff', '#ffffff'], n: 6 } },
    { id: 'fr_tape', kind: 'frame', name: '胶带框', rare: 1, price: 0, pass: 'f10', frame: 'tape' },
    { id: 'fr_neon', kind: 'frame', name: '霓虹框', rare: 2, price: 120, frame: 'neon' },
    { id: 'fr_rebel', kind: 'frame', name: '反抗军框', rare: 3, price: 0, pass: 'p23', frame: 'rebel' },
    { id: 'fr_gold', kind: 'frame', name: '金框', rare: 3, price: 220, frame: 'gold' },
    { id: 'fr_flame', kind: 'frame', name: '烈焰框', rare: 4, price: 300, frame: 'flame' },
    { id: 'av_flag', kind: 'avatar', name: '反抗军旗', rare: 2, price: 0, pass: 'f20', avatar: 'flag' },
    { id: 'av_can', kind: 'avatar', name: '喷漆罐', rare: 1, price: 60, avatar: 'can' },
    { id: 'av_cat', kind: 'avatar', name: '灰城猫', rare: 2, price: 90, avatar: 'cat' },
  ];
  S.skin = (id) => S.SKINS.find((k) => k.id === id);
  S.SKIN_KINDS = [['pilot', '驾驶员服装'], ['mech', '机甲涂装'], ['fx', '涂料特效'], ['frame', '名片框'], ['avatar', '头像']];
  // 皮肤等级：等级越高特效越多（对战里的表现见 render3d.js / client.js）
  S.RARE = [null,
    { name: '普通', c: '#9aa0a8', fx: '专属配色' },
    { name: '稀有', c: '#4fb8ff', fx: '专属配色 + 移动闪光拖尾' },
    { name: '史诗', c: '#b78cff', fx: '专属配色 + 闪光拖尾 + 发光部件呼吸灯 + 空投 / 复活爆发特效' },
    { name: '传说', c: '#ffc531', fx: '以上全部 + 常驻环绕光环 + 地面光圈 + 击倒特效 + 金边大招横幅' },
  ];
  S.FX_RARE = [null, '命中时少量彩色涂料', '命中时迸出彩色光点', '命中时迸出大片光点 + 枪口闪光', '命中光点 + 子弹拖尾 + 枪口星爆'];
  S.FRAME_RARE = [null, '静态边框', '霓虹呼吸光', '流动条纹动画', '火焰流光动画'];
  S.TALENT_SLOTS = 3;

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
      skill: 'rush', passive: { name: '越战越勇', desc: '击毁机体或击倒驾驶员后回复 35% 生命。' },
      line: '涂料都装满了？那就冲啊！', bio: '街头涂鸦队的队长，永远第一个冲进敌阵。说话大声、笑声更大，护目镜是他唯一不肯借人的东西。' },
    { id: 'frost', name: '白夜', code: '霜刃', title: '冷面狙击手', weapon: 'charger', accent: '#5fd3ff',
      hair: '#e6eef8', hair2: '#8796b8', skin: '#fde3d2', eye: '#47c8ff', style: 'swept', eyeShape: 'cool', mouth: 'calm', outfit: 'coat',
      skill: 'scan', passive: { name: '远距精准', desc: '对 60% 射程以外的目标伤害 +12%。' },
      line: '一发，就够了。', bio: '曾经的天台竞速冠军，退役后只用一支狙击笔说话。刘海下藏着一只机械义眼，能看清八百米外的涂料滴。' },
    { id: 'candy', name: '苏糖', code: '电音', title: '元气偶像主播', weapon: 'gatling', accent: '#ff5fc1',
      hair: '#ff8fcf', hair2: '#c0367e', skin: '#ffe2d3', eye: '#b56bff', style: 'twintail', eyeShape: 'round', mouth: 'open', outfit: 'idol',
      skill: 'cheer', passive: { name: '人气爆棚', desc: '大招充能速度 +30%。' },
      line: '大家～今天也要涂得闪闪发光哦！', bio: '拥有百万粉丝的直播主，猫耳耳机连着直播间。看起来软萌，实际是旋转喷管的火力狂人。' },
    { id: 'titan', name: '雷豹', code: '铁拳', title: '重装开路者', weapon: 'roller', accent: '#ffb000',
      hair: '#2a2420', hair2: '#0d0b0a', skin: '#b97a55', eye: '#ffcc33', style: 'dreads', eyeShape: 'bold', mouth: 'smirk', outfit: 'tank',
      skill: 'guard', passive: { name: '钢筋铁骨', desc: '机体生命值 +15%。' },
      line: '挡路的，统统碾过去。', bio: '前码头起重机驾驶员，力气大到能单手扛起滚刷。外表凶悍，其实是全队最会照顾人的大哥。' },
    { id: 'raven', name: '夜鸢', code: '墨鸦', title: '神秘涂鸦师', weapon: 'bucket', accent: '#a46bff',
      hair: '#3b2b5c', hair2: '#160f26', skin: '#f6d8c8', eye: '#c18bff', style: 'hood', eyeShape: 'sleepy', mouth: 'smirk', outfit: 'hoodie',
      skill: 'smoke', passive: { name: '暗影步', desc: '在草丛和己方涂料上移动速度 +15%。' },
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
      skill: 'bento', passive: { name: '吃饱才有力气', desc: '脱离战斗后回血速度 +80%。' },
      line: '打完这局，大家来吃饭！', bio: '街角夜宵摊老板，用泼桶机兵炒菜火候刚好。队友受伤了，他总能从驾驶舱里掏出热腾腾的便当。' },
    { id: 'vet', name: '秦岳', code: '老兵', title: '退役王牌', weapon: 'mortar', accent: '#9bc94a', isNew: true,
      hair: '#c2c6ce', hair2: '#6c7078', skin: '#e3b894', eye: '#7aa8c0', style: 'veteran', eyeShape: 'bold', mouth: 'calm', outfit: 'military',
      skill: 'overdrive', passive: { name: '同归于尽', desc: '机体被摧毁时自爆，对周围敌人造成 45 点伤害。' },
      line: '小鬼们，看好了。', bio: '第一代机兵测试驾驶员，一只眼睛在当年的事故里留下了伤。退休后在训练场当教官，嘴硬心软。' },
    { id: 'yuzu', name: '小柚', code: '机仆', title: '无人机少女', weapon: 'gatling', accent: '#ffc531', isNew: true,
      hair: '#ff9a3d', hair2: '#c25a12', skin: '#ffe4d2', eye: '#ff6a2e', style: 'buns', eyeShape: 'round', mouth: 'open', outfit: 'kid',
      skill: 'drone', passive: { name: '涂鸦小能手', desc: '涂地给大招的充能翻倍。' },
      line: '小喵，出动！把那边涂满！', bio: '星澜的邻居小妹妹，自己改装了一架猫咪无人机。个子最小，背包里的零件却最多。' },
    // ---- S1 灰城重涂：赛季驾驶员 ----
    { id: 'flag', name: '岚', code: '旗手', title: '灰城反抗军队长', weapon: 'dozer', accent: '#ff5a36', season: 1,
      hair: '#3a3a44', hair2: '#16161c', skin: '#f2c9a8', eye: '#ff7a3d', style: 'swept', eyeShape: 'sharp', mouth: 'calm', outfit: 'rebel',
      skill: 'rally', passive: { name: '众志成城', desc: '附近每有 1 名队友，受到的伤害 -5%（最多 -15%）。' },
      line: '墙刷白一次，我们就涂回去一次。', bio: '灰石集团把整座城刷成灰色的那天，她在市政厅门口喷下了第一面红旗。现在，整个反抗军都跟着那面旗走。' },
    { id: 'hammer', name: '石磊', code: '拆楼', title: '拆迁队工头', weapon: 'wrecker', accent: '#ffb000', season: 1,
      hair: '#4a3020', hair2: '#1e120a', skin: '#c98f66', eye: '#8a5a2e', style: 'veteran', eyeShape: 'bold', mouth: 'grin', outfit: 'worker',
      skill: 'blast', passive: { name: '安全第一', desc: '驾驶员弹出时自动获得 40 点护盾（安全帽）。' },
      line: '这堵灰墙？三锤之内给你拆了。', bio: '原本是灰石集团的拆迁队工头，被派去拆掉城里所有的涂鸦墙。拆到第一百面墙时，他扔下合同，扛着大锤加入了反抗军。' },
    { id: 'echo', name: '叶声', code: '电台', title: '地下电台 DJ', weapon: 'megaphone', accent: '#2ef0c8', season: 1,
      hair: '#1fd6a8', hair2: '#0b6b5a', skin: '#ffe0cf', eye: '#a46bff', style: 'spiky', eyeShape: 'cool', mouth: 'open', outfit: 'dj',
      skill: 'jam', passive: { name: '节拍同步', desc: '附近 180 范围内的队友装填速度 +15%。' },
      line: '各位灰城的夜猫子，今晚的歌，叫《反击》！', bio: '每天午夜，灰城所有的收音机都会被一个神秘频道占领。没人知道 DJ 长什么样，只知道她的音波能震碎灰石集团的扩音器。' },
    // ---- 1.1：任务奖励驾驶员 ----
    { id: 'han', name: '韩冰', code: '叛将', title: '灰石集团前安保主管', weapon: 'riot', accent: '#5fa8ff', quest: 1,
      hair: '#dfe6ee', hair2: '#8e9aa8', skin: '#f6dccb', eye: '#5fa8ff', style: 'undercut', eyeShape: 'sharp', mouth: 'calm', outfit: 'security',
      skill: 'flash', passive: { name: '倒戈', desc: '对生命高于 90% 的敌人伤害 +15%。' },
      line: '我刷过的灰墙，我亲手涂回来。', bio: '灰石集团最年轻的安保主管，负责镇压所有涂鸦行动。直到她在档案室里看到「刷白计划」的真相——第二天，她带着整支防暴队的盾牌投奔了反抗军。' },
  ];
  const pilotCache = new Map();
  S.pilot = (id) => {
    if (typeof id === 'string' && id.includes('@')) {   // 带皮肤的驾驶员：flag@flag_red
      if (pilotCache.has(id)) return pilotCache.get(id);
      const [pid, sk] = id.split('@'), base = S.PILOTS.find((p) => p.id === pid) || S.PILOTS[0], K = S.skin && S.skin(sk);
      const P = K && K.pilot === base.id ? Object.assign({}, base, K.over, { skin: K.id }) : base;
      pilotCache.set(id, P);
      return P;
    }
    return S.PILOTS.find((p) => p.id === id) || S.PILOTS[0];
  };

  S.levelFromXp =(xp) => Math.floor(Math.sqrt(Math.max(0, xp) / 120)) + 1;
  S.xpForLevel = (lv) => (lv - 1) * (lv - 1) * 120;

  // ---------------- 模式 ----------------
  S.MODES = {
    turf: { name: '涂地大战', short: '涂地', desc: '比赛结束时涂色面积更大的队伍获胜。最后 30 秒局势将被隐藏！' },
    zone: { name: '抢占据点', short: '据点', desc: '把中央据点涂到 70% 即可占领，占领期间己方倒计时减少，先归零者获胜。' },
    escort: { name: '护送宝物', short: '宝物', desc: '抢下中央的宝物核心，带到敌方一侧的终点台得分（持有者受到的伤害降低 25%），先得 3 分获胜。' },
    soccer: { name: '漆弹足球', short: '足球', desc: '用涂料子弹、炸弹和身体把大球推进对方球门，先进 5 球获胜。', original: true },
    battery: { name: '电池掠夺', short: '电池', desc: '收集地图上的能量电池送回己方基地，被击倒会掉落全部电池，先存满 40 个获胜。', original: true },
    elim: { name: '生死之战', short: '生死', desc: '只有一条命：机体被打爆不会重建，驾驶员也倒下就出局。先把对面全队消灭赢一局，三局两胜。', original: true, oneLife: true, isNew: true },
    escape4: { name: '逃亡圈 · 四队', short: '逃亡', desc: '4 队 × 2 人分散空降。灰色毒圈不断缩小，捡空投箱变强，只有一条命，最后活下来的队伍获胜。', original: true, oneLife: true, teams: 4, size: 2, isNew: true },
    escape8: { name: '逃亡圈 · 单人', short: '单人逃亡', desc: '8 名驾驶员各自为战。毒圈缩小、空投箱变强、只有一条命，活到最后就是赢家。', original: true, oneLife: true, teams: 8, size: 1, isNew: true },
  };
  S.MODE_ORDER = ['turf', 'zone', 'escort', 'soccer', 'battery', 'elim', 'escape4', 'escape8'];
  S.teamsOf = (mode) => (S.MODES[mode] && S.MODES[mode].teams) || 2;
  S.isEscape = (mode) => mode === 'escape4' || mode === 'escape8';
  // 多队模式的涂料颜色（第 1–8 队）
  S.TEAM8 = [null, '#ff3ea5', '#1fd6ee', '#ffdf2e', '#9cff2e', '#ff8a1f', '#8c5cff', '#ff3b52', '#3a6dff'];
  S.TEAM8_NAMES = [null, '粉队', '青队', '黄队', '绿队', '橙队', '紫队', '红队', '蓝队'];
  // 逃亡圈：毒圈阶段（等待秒数、收缩秒数、收缩到初始半径的比例、圈外每秒伤害）
  S.ESCAPE = { stages: [[32, 18, 0.62, 6], [24, 16, 0.4, 9], [18, 14, 0.24, 13], [14, 12, 0.12, 18], [10, 10, 0.05, 26]], crateHeal: 40, crateDmg: 0.1, crateHp: 0.1, maxCubes: 8 };
  S.ELIM = { wins: 2, roundTime: 90, pause: 3 };
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

  // ---------------- 地图（只写左半边，自动中心对称） ----------------
  // rects: [x, y, w, h, 等级 1 矮台 / 2 高台 / 3 高墙]
  // stairs: [x, y, w, h, 上坡方向 'E'|'W'|'N'|'S', 通往的等级, 起始等级=0]，每级台阶高 10，直接走上去
  // pads: [x, y, 角度°]，2×2 格的弹跳板，把机兵朝这个方向弹飞
  // bush: [x, y, w, h] 草丛；sky: 天空 / 配色预设
  S.MAPS = [
    {
      name: '霓虹工厂', desc: '经典对称布局，中路开阔；两侧高台可以走楼梯上去，中路弹跳板直飞据点。', goalX: 24, sky: 0,
      rects: [[16, 10, 4, 18, 3], [16, 52, 4, 18, 3], [28, 30, 10, 4, 1], [28, 46, 10, 4, 1], [40, 4, 6, 12, 3],
        [44, 64, 8, 6, 2], [42, 64, 2, 6, 1], [56, 20, 8, 5, 2], [56, 25, 8, 2, 1],
        [22, 0, 12, 4, 2], [34, 22, 2, 2, 3], [34, 56, 2, 2, 3], [8, 66, 6, 2, 1], [48, 50, 2, 6, 1]],
      stairs: [[28, 4, 4, 7, 'N', 2], [52, 64, 7, 6, 'W', 2]],
      pads: [[44, 39, 0], [11, 18, 30]],
      bush: [[22, 14, 6, 6], [30, 57, 8, 5], [44, 26, 5, 8], [9, 22, 5, 5], [36, 10, 3, 6]],
    },
    {
      name: '涂鸦天台', desc: '长条通道与高台狙击点；基地旁的狙击台有楼梯，屋顶之间用弹跳板连通。', goalX: 31, sky: 1,
      rects: [[14, 18, 22, 3, 3], [14, 59, 22, 3, 3], [40, 0, 4, 14, 3], [40, 34, 3, 12, 2], [37, 36, 3, 8, 1],
        [24, 36, 6, 8, 1], [52, 10, 16, 3, 3], [6, 6, 8, 7, 2], [46, 58, 6, 2, 1], [30, 66, 2, 7, 1], [26, 26, 3, 3, 1]],
      stairs: [[14, 8, 7, 4, 'W', 2], [43, 36, 7, 8, 'W', 2]],
      pads: [[32, 28, 330], [20, 70, 20]],
      bush: [[16, 22, 10, 5], [28, 50, 8, 6], [46, 20, 6, 6], [50, 50, 6, 8], [4, 52, 6, 5]],
    },
    {
      name: '齿轮广场', desc: '中央被环形高台包围，从里侧的楼梯能爬上齿轮环，弹跳板把你送进场中央。', goalX: 37, sky: 2,
      rects: [[44, 22, 12, 3, 2], [44, 22, 3, 10, 2], [64, 22, 12, 3, 2], [73, 22, 3, 10, 2], [48, 19, 4, 3, 1],
        [18, 12, 8, 8, 2], [26, 14, 2, 4, 1], [30, 38, 4, 4, 1], [8, 18, 10, 3, 3], [8, 59, 10, 3, 3],
        [20, 56, 3, 3, 3], [30, 64, 6, 2, 1], [36, 6, 2, 6, 1]],
      stairs: [[47, 25, 3, 7, 'N', 2], [18, 20, 4, 7, 'N', 2]],
      pads: [[34, 48, 330], [12, 30, 0]],
      bush: [[12, 24, 6, 8], [22, 48, 8, 6], [36, 26, 6, 6], [53, 33, 5, 5], [40, 64, 6, 5]],
    },
    {
      name: '樱花庭院', desc: '花瓣飘落的天台庭院：石灯笼和矮墙围出一条条小路，到处是可以埋伏的花丛。', goalX: 26, sky: 3, isNew: true,
      rects: [[14, 22, 2, 10, 3], [14, 48, 2, 10, 3], [24, 12, 7, 3, 1], [30, 15, 3, 5, 1], [22, 60, 8, 3, 1],
        [38, 30, 3, 3, 3], [38, 47, 3, 3, 3], [44, 6, 10, 4, 2], [48, 36, 3, 2, 1], [48, 42, 3, 2, 1], [28, 36, 2, 8, 1],
        [6, 4, 3, 3, 3], [50, 66, 6, 3, 1]],
      stairs: [[44, 10, 4, 7, 'N', 2]],
      pads: [[20, 39, 0], [40, 20, 35]],
      bush: [[18, 4, 8, 5], [33, 26, 4, 6], [33, 48, 4, 6], [8, 58, 6, 6], [42, 52, 6, 4], [52, 14, 4, 6]],
    },
    {
      name: '集装箱码头', desc: '堆满集装箱的港口：长长的箱墙隔出三条路，楼梯通往箱顶，弹跳板能直接飞上去。', goalX: 32, sky: 4, isNew: true,
      rects: [[16, 4, 14, 3, 3], [16, 73, 14, 3, 3], [26, 22, 3, 12, 2], [38, 48, 12, 3, 2], [34, 14, 3, 3, 1], [46, 28, 3, 3, 1],
        [30, 60, 4, 3, 1], [50, 62, 3, 3, 1], [44, 34, 2, 8, 3], [8, 20, 8, 2, 1], [36, 0, 3, 8, 3]],
      stairs: [[26, 34, 3, 7, 'N', 2], [50, 48, 7, 3, 'W', 2]],
      pads: [[20, 40, 0], [40, 66, 330]],
      bush: [[8, 11, 6, 5], [33, 38, 6, 5], [48, 4, 6, 4], [6, 64, 6, 5], [18, 52, 5, 5]],
    },
    {
      name: '雪夜冰场', desc: '下雪的夜晚广场：四角是楼梯环绕的高地基地，中间一圈矮墙，适合来回拉扯。', goalX: 28, sky: 5, isNew: true,
      rects: [[4, 4, 12, 9, 2], [4, 67, 12, 9, 2], [50, 26, 6, 2, 1], [50, 52, 6, 2, 1], [46, 30, 2, 6, 1], [46, 44, 2, 6, 1],
        [24, 18, 3, 3, 3], [30, 30, 3, 3, 3], [24, 59, 3, 3, 3], [34, 48, 3, 3, 3], [38, 12, 6, 2, 1], [38, 66, 6, 2, 1]],
      stairs: [[16, 5, 7, 4, 'W', 2], [16, 71, 7, 4, 'W', 2]],
      pads: [[12, 22, 20], [12, 56, 340]],
      bush: [[20, 26, 5, 5], [20, 49, 5, 5], [38, 4, 6, 5], [38, 71, 6, 5], [52, 36, 4, 8]],
    },
    {
      name: '熔炉工厂', desc: '层层叠叠的工厂梯田：从矮台走楼梯上高台，两座熔炉塔居高临下，弹跳板直通塔顶。', goalX: 34, sky: 6, isNew: true,
      rects: [[18, 6, 20, 8, 1], [24, 6, 8, 4, 2], [18, 66, 20, 8, 1], [50, 26, 5, 5, 2], [8, 28, 6, 2, 3], [8, 50, 6, 2, 3],
        [40, 36, 3, 8, 1], [32, 30, 2, 2, 3], [32, 48, 2, 2, 3], [44, 56, 8, 3, 1], [36, 18, 3, 3, 3]],
      stairs: [[22, 14, 4, 3, 'N', 1], [26, 10, 4, 4, 'N', 2, 1], [22, 63, 4, 3, 'S', 1], [43, 26, 7, 5, 'E', 2]],
      pads: [[42, 22, 30], [28, 40, 0]],
      bush: [[10, 14, 6, 5], [12, 62, 6, 5], [42, 46, 5, 6], [24, 44, 5, 5], [54, 6, 5, 5]],
    },
    // ---- S1 灰城重涂：新地图 ----
    {
      name: '灰城广场', desc: '灰石集团的市政广场：刷白的广告牌墙隔出两条侧路，楼梯通往牌顶，花坛和草丛围着中央。', goalX: 28, sky: 7, isNew: true, season: 1,
      rects: [[14, 8, 3, 16, 3], [14, 56, 3, 16, 3], [24, 18, 8, 3, 2], [24, 59, 8, 3, 2], [44, 8, 8, 4, 2], [44, 68, 8, 4, 2],
        [36, 30, 2, 6, 1], [50, 30, 3, 3, 1], [50, 47, 3, 3, 1], [32, 46, 6, 2, 1], [6, 4, 6, 2, 1], [40, 40, 2, 2, 3]],
      stairs: [[26, 21, 4, 7, 'N', 2], [26, 52, 4, 7, 'S', 2], [46, 12, 4, 7, 'N', 2]],
      pads: [[34, 40, 0], [20, 40, 40]],
      bush: [[8, 10, 5, 6], [19, 28, 4, 6], [36, 58, 6, 5], [46, 22, 5, 5], [30, 70, 6, 4]],
    },
    {
      name: '废墟逃亡区', desc: '被拆了一半的旧城区：到处是碎墙和瓦砾堆，草丛和高处很多，最适合「逃亡圈」的混战。', goalX: 30, sky: 8, isNew: true, season: 1,
      rects: [[10, 10, 6, 3, 2], [10, 13, 2, 5, 2], [22, 3, 4, 4, 3], [30, 14, 8, 2, 1], [38, 6, 3, 6, 2], [48, 4, 6, 4, 1], [18, 22, 5, 5, 2],
        [28, 24, 2, 7, 3], [40, 22, 6, 3, 1], [50, 16, 4, 4, 3], [16, 34, 3, 3, 2], [36, 33, 4, 4, 2], [46, 30, 3, 6, 1], [8, 58, 6, 3, 2],
        [18, 52, 4, 6, 1], [26, 62, 6, 4, 3], [36, 52, 8, 2, 1], [44, 62, 4, 6, 2], [52, 54, 5, 3, 1], [12, 70, 4, 4, 1], [34, 70, 6, 3, 2], [48, 72, 6, 3, 1]],
      stairs: [[12, 13, 4, 7, 'N', 2], [18, 27, 5, 7, 'N', 2], [36, 37, 4, 7, 'N', 2], [8, 51, 6, 7, 'S', 2]],
      pads: [[31, 41, 0], [22, 66, 30]],
      bush: [[3, 3, 6, 5], [32, 17, 5, 5], [22, 30, 5, 3], [41, 42, 5, 6], [30, 55, 5, 5], [50, 64, 5, 5], [42, 12, 4, 4], [56, 26, 4, 5]],
    },
  ];
  const DIR_FLIP = { E: 'W', W: 'E', N: 'S', S: 'N' };
  const mirror = (r) => [GW - r[0] - r[2], GH - r[1] - r[3], r[2], r[3]];
  S.PAD = { v: 560, push: 360 };
  S.STAIR_LV = 4;   // 楼梯格的样式编号
  // M = { top: 每格顶面高度, solid: 高墙, lv: 样式（0 地面 1 矮台 2 高台 3 高墙 4 楼梯）, pad: 弹跳板方向+1, rects, stairs, pads, bush }
  S.buildMap = function (mapIdx) {
    const m = S.MAPS[mapIdx];
    const lv = new Uint8Array(GW * GH), top = new Float32Array(GW * GH);
    const rects = [];
    const put = (i, l, h) => { if (h > top[i]) { top[i] = h; lv[i] = l; } };
    for (const r of m.rects) {
      const rr = [r[0], r[1], r[2], r[3], r[4] == null ? 3 : r[4]];
      const mr = mirror(rr).concat(rr[4]);
      rects.push(rr);
      if (mr[0] !== rr[0] || mr[1] !== rr[1]) rects.push(mr);
    }
    for (const [x, y, w, h, l] of rects)
      for (let j = y; j < y + h; j++)
        for (let i = x; i < x + w; i++)
          if (i >= 0 && i < GW && j >= 0 && j < GH) put(j * GW + i, l, S.LEVEL_H[l]);
    // 楼梯：沿上坡方向每格高 10
    const stairs = [];
    for (const st of m.stairs || []) {
      const [x, y, w, h, dir, to, from] = st;
      for (const [rx, ry, rw, rh, d] of [[x, y, w, h, dir], mirror(st).concat(DIR_FLIP[dir])]) {
        stairs.push([rx, ry, rw, rh, d, to]);
        const h0 = S.LEVEL_H[from || 0], h1 = S.LEVEL_H[to];
        for (let j = ry; j < ry + rh; j++)
          for (let i = rx; i < rx + rw; i++) {
            if (i < 0 || i >= GW || j < 0 || j >= GH) continue;
            const k = d === 'E' ? i - rx : d === 'W' ? rx + rw - 1 - i : d === 'S' ? j - ry : ry + rh - 1 - j;
            const hh = Math.min(h1 - 10, h0 + 10 * (k + 1));
            const idx = j * GW + i;
            if (lv[idx] === 3) continue;
            if (hh >= top[idx]) { top[idx] = hh; lv[idx] = S.STAIR_LV; }
          }
      }
    }
    const solid = new Uint8Array(GW * GH);
    for (let i = 0; i < lv.length; i++) solid[i] = lv[i] === 3 ? 1 : 0;
    // 弹跳板（只放在地面上）
    const pad = new Uint8Array(GW * GH), pads = [];
    for (const [x, y, ang] of m.pads || []) {
      for (const [px, py, a] of [[x, y, ang], [GW - x - 2, GH - y - 2, ang + 180]]) {
        pads.push([px, py, ((a % 360) + 360) % 360]);
        const code = 1 + Math.round(((((a % 360) + 360) % 360) / 360) * 250) % 251;
        for (let j = py; j < py + 2; j++) for (let i = px; i < px + 2; i++) if (S.inBounds(i, j) && top[j * GW + i] === 0) pad[j * GW + i] = code;
      }
    }
    // 草丛：只长在地面上，进去之后敌人看不见你（靠得很近或你攻击时会暴露）
    const bush = new Uint8Array(GW * GH), bushes = [];
    for (const r of m.bush || []) {
      for (const rr of [r, mirror(r)]) {
        bushes.push(rr);
        for (let j = rr[1]; j < rr[1] + rr[3]; j++)
          for (let i = rr[0]; i < rr[0] + rr[2]; i++)
            if (i >= 0 && i < GW && j >= 0 && j < GH && !top[j * GW + i] && !pad[j * GW + i]) bush[j * GW + i] = 1;
      }
    }
    return { top, solid, lv, rects, stairs, pad, pads, bush, bushes };
  };
  S.padAngle = (code) => ((code - 1) / 250) * Math.PI * 2;
  S.padAt = (M, x, y) => { const cx = Math.floor(x / CELL), cy = Math.floor(y / CELL); return S.inBounds(cx, cy) ? M.pad[cy * GW + cx] : 0; };

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
  // 速度表：比旧版快一档，起步和急停更干脆（手感参考快节奏的俯视乱斗游戏）
  S.SPEED = { walk: 190, enemy: 88, wheelOwn: 345, wheelDry: 130, wheelEnemy: 75, airWalk: 190, airWheel: 270 };
  S.speedFor = function (team, sm, ground, wheel, mul, foot) {
    let s;
    if (foot) {
      // 弹出的驾驶员：跑得快，不能变滚轮
      const enemy = ground > 0 && ground !== team;
      return (enemy ? 125 : S.PILOT_SPEED) * (sm || 1);
    }
    const V = S.SPEED;
    if (ground < 0) s = wheel ? V.airWheel : V.airWalk * mul;
    else {
      const own = ground === team, enemy = ground !== 0 && ground !== team;
      s = wheel ? (own ? V.wheelOwn : enemy ? V.wheelEnemy : V.wheelDry) : (enemy ? V.enemy : V.walk) * mul;
    }
    return s * (sm || 1);
  };
  // ---------------- 物理手感参数 ----------------
  // 加速度单位：单位/秒²。机兵有质量感：起步要加速、松手会滑行、急转会刹车。
  S.PHYS = {
    walk: { acc: 2800, brake: 3800, coast: 3300 },        // 双足行走：抓地好，几乎即按即走、即松即停
    wheelOwn: { acc: 1500, brake: 1000, coast: 260 },     // 己方涂料上的滚轮：滑溜、惯性大
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
    // 弹跳板：站上去就被弹向空中
    p.padT = Math.max(0, (p.padT || 0) - dt);
    if (p.onGround && p.padT <= 0 && M.pad) {
      const pc = S.padAt(M, p.x, p.y);
      if (pc) {
        const a = S.padAngle(pc);
        p.vz = S.PAD.v; p.onGround = false; p.coy = 0; p.jumped = false; p.padT = 0.6; p.padded = true;
        p.kx += Math.cos(a) * S.PAD.push; p.ky += Math.sin(a) * S.PAD.push;
      }
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

  // ---------------- 比赛奖励（客户端显示和服务器结算用同一套算法） ----------------
  S.mvpOf = function (result) {
    const val = (p) => p.kills * 100 + p.paint + p.obj * 150;
    let mvp = null;
    for (const p of result.players) if (p.team === result.winner && (!mvp || val(p) > val(mvp))) mvp = p;
    return mvp;
  };
  S.matchReward = function (result, pid) {
    const me = result.players.find((p) => p.id === pid);
    if (!me) return null;
    const won = result.winner === me.team, draw = !result.winner, mvp = S.mvpOf(result);
    const isMvp = !!(mvp && mvp.id === pid);
    // 逃亡圈按名次：四队 +10/+5/0/−3，单人 +10/+7/+4/+2/0/−2/−3/−4
    if (result.place) {
      const rank = result.place.indexOf(me.team) + 1, n = result.place.length;
      const table = n <= 4 ? [10, 5, 0, -3] : [10, 7, 4, 2, 0, -2, -3, -4];
      const xp = 60 + Math.max(0, n - rank) * 15 + me.kills * 10 + Math.floor(me.paint / 25) + (isMvp ? 40 : 0);
      return { xp, trophies: table[rank - 1] || 0, won: rank === 1, draw: false, mvp: isMvp, kills: me.kills, paint: me.paint, rank, of: n, mode: result.mode, cubes: me.cubes || 0 };
    }
    const xp = 60 + (won ? 60 : draw ? 30 : 0) + me.kills * 10 + Math.floor(me.paint / 25) + me.obj * 12 + (isMvp ? 40 : 0);
    const trophies = won ? S.TROPHY_WIN : draw ? S.TROPHY_DRAW : -S.TROPHY_LOSS;
    return { xp, trophies, won, draw, mvp: isMvp, kills: me.kills, paint: me.paint, mode: result.mode };
  };
  // ---------------- 账号规则 ----------------
  S.ACCOUNT = {
    nameOk: (n) => typeof n === 'string' && /^[\u4e00-\u9fa5A-Za-z0-9_]{2,12}$/.test(n),
    passOk: (p) => typeof p === 'string' && p.length >= 6 && p.length <= 64,
    nameHint: '账号名 2–12 个字：中文、字母、数字或下划线',
    passHint: '密码至少 6 位',
  };
  // 可以由客户端保存的资料（奖杯、经验、战绩只能由服务器在比赛结束时结算）
  S.PROFILE_FIELDS = ['pilot', 'weapon', 'head', 'mode', 'map', 'size', 'dur'];
  S.cleanProfile = function (p, base) {
    const o = Object.assign({ name: '', weapon: 'blaster', head: 'antenna', pilot: 'blaze', trophies: 0, mode: 'turf', map: -1, size: 3, dur: 180, xp: 0, matches: 0, wins: 0, kills: 0, paint: 0 }, base || {});
    p = p || {};
    if (S.WEAPONS[p.weapon]) o.weapon = p.weapon;
    if (S.PILOTS.some((x) => x.id === p.pilot)) o.pilot = p.pilot;
    if (S.MODES[p.mode]) o.mode = p.mode;
    if (Number.isInteger(p.map) && p.map >= -1 && p.map < S.MAPS.length) o.map = p.map;
    if (Number.isInteger(p.size) && p.size >= 1 && p.size <= 4) o.size = p.size;
    if ([120, 180, 240].includes(p.dur)) o.dur = p.dur;
    const head = S.HEADS.find((h) => h.id === p.head);
    if (head && head.tr <= (o.trophies || 0)) o.head = p.head;
    return o;
  };

  // ---------------- 更新公告（每个版本第一次进大厅时弹出） ----------------
  S.VERSION = '1.1';
  S.PATCH_NOTES = [
    { v: '1.1', date: '2026-11-13', title: '1.1 维护更新 · 叛将来袭', sections: [
      ['新角色与机甲', ['新驾驶员「韩冰 · 叛将」：技能「闪光弹」、被动「倒戈」、超载「反戈一击」', '新机甲「防暴盾卫」：正面减伤 40%，大招「盾墙」挡住敌人子弹', '在「活动 → 叛将档案」完成任务免费获得：完成 3 个送机甲，全部完成送驾驶员']],
      ['限时活动', ['「灰城反击周」11/13–11/27：对战金币 ×1.5，完成活动任务领限定奖励', '「逃亡圈狂欢」11/20–12/4：逃亡圈对局通行证经验 ×2']],
      ['信箱', ['新增信箱：版本补偿、活动礼包都会发到信箱，点一下就能领取']],
      ['限时购买', ['宝箱商店新增「限时购买」：每 3 小时刷新 2 位驾驶员 + 1 台机体（常驻角色，优先出你还没有的），用宝石直接购买']],
      ['天赋树', ['每支天赋新增第 5、6 级，共 8 个新天赋（连击喷涂、不屈装甲、主场优势、超载共鸣……）']],
      ['视角调整', ['为保证公平，第三人称视角正式下线，所有对局统一使用俯视视角（第三人称下狙击、迫击等机体的视野和瞄准优势过大）']],
      ['观战', ['生死之战：出局后自动观战存活的队友，可以切换视角', '逃亡圈：被淘汰后可以选择继续观战，或直接退出并按名次结算']],
      ['平衡调整（根据 3000 局 AI 对战数据）', [
        '旋转机兵：伤害 8 → 5.8，装填 2.1 → 2.6 秒，每次扫射 14 → 12 发，射程 430 → 400，涂料范围缩小',
        '喷罐机兵：伤害 15 → 13.5，射程 340 → 325，装填 1.3 → 1.4 秒',
        '泼桶机兵：伤害 17 → 15.8　｜　滚刷机兵：生命 130 → 125，碾压伤害 36 → 27，突进距离缩短',
        '重拳机兵：生命 150 → 175，伤害 40 → 52，突进更远，新增 25% 装甲减伤，大招充能更快',
        '拆楼锤：生命 145 → 170，伤害 50 → 56，出手更快，新增 25% 装甲减伤，大招充能更快',
        '无人机母舰：每次 3 → 4 架，伤害 17 → 21，生命 95 → 115，射程 470 → 500，飞行时会涂地',
        '迫击机兵：伤害 44 → 48，爆炸范围 54 → 62，炮弹飞得更快　｜　喇叭车：伤害 18 → 21，装填 1.45 → 1.3 秒',
        '秦岳「同归于尽」60 → 45　｜　凌焰回血 30% → 35%　｜　包大福回血 +50% → +80%，便当 60 → 75',
        '夜鸢移速加成 10% → 15%　｜　苏糖充能 +20% → +30%，应援 40 → 50　｜　洛奇脉冲范围更大',
        '石磊炸药 1.2 → 0.9 秒、伤害 70 → 80',
        'AI 改进：近战机体的 AI 会主动冲上去，不再站着挨打']],
    ] },
  ];

  S.QUICK_CHAT = ['这边！', '冲啊！', '好样的！', '需要支援！'];
  return S;
});
