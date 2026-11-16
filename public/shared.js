// 涂鸦机兵 GraffiBots — 服务器与客户端共用的规则、数据与物理
(function (root, factory) {
  const S = factory();
  if (typeof module === 'object' && module.exports) module.exports = S;
  else root.GS = S;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const S = {};
  const CELL = 16;
  let GW = 120, GH = 80;   // 1.6：地图尺寸跟着当前地图变（超大地图 240×160），用 S.useDims 切换
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
      speed: 650, range: 325, dmg: 9.7, spread: 0.05, splat: 22, trail: 13, size: 6, special: 'storm', spNeed: 260, finale: 1.4,
    },
    roller: {
      name: '滚刷机兵', short: '滚刷', role: '冲锋开路', desc: '甩出一扇涂料并向前突进滚压，碾过的敌人受到伤害。生命值高。',
      hp: 110, spd: 1, reload: 1.15, atkCd: 0.5, attack: 'flick', pellets: 5, arc: 0.7, speed: 520, range: 200, dmg: 22,
      spread: 0.05, splat: 20, trail: 0, size: 7, rollWidth: 26, rollDmg: 19, lunge: 280, special: 'charge', spNeed: 230,
    },
    charger: {
      name: '狙击机兵', short: '狙击', role: '远程狙击', desc: '按住蓄力、松开射出贯穿直线，满蓄力伤害极高。蓄力时移动变慢，生命值低。',
      hp: 80, spd: 0.95, reload: 1.9, atkCd: 0.3, attack: 'charge', chargeTime: 0.95, range: 720, dmg: 88, minDmg: 32,
      special: 'missiles', spNeed: 240, pierce: 0.7,
    },
    bucket: {
      name: '泼桶机兵', short: '泼桶', role: '近距爆发', desc: '近距离泼出一大片涂料弹，覆盖面积大，贴脸伤害很高。',
      hp: 115, spd: 0.95, reload: 1.6, atkCd: 0.55, attack: 'fan', pellets: 7, arc: 0.6, speed: 480, range: 240, dmg: 12.3,
      spread: 0.06, splat: 26, trail: 12, size: 7, special: 'bubble', spNeed: 250, close: 1.2,
    },
    gatling: {
      name: '旋转机兵', short: '旋转', role: '持续压制', desc: '每次攻击持续扫射 1 秒，射程远、火力持续，但装填慢。',
      hp: 100, spd: 0.88, reload: 2.8, atkCd: 0.3, attack: 'burst', shots: 12, interval: 0.075,
      speed: 700, range: 380, dmg: 4.7, spread: 0.13, splat: 13, trail: 9, size: 5, special: 'beam', spNeed: 300, spinup: [0.72, 1.1],
    },
    mortar: {
      name: '迫击机兵', short: '迫击', role: '曲射炮手', desc: '把涂料炮弹抛到瞄准的位置，能越过墙壁和掩体，落地爆炸涂一大片。',
      hp: 85, spd: 0.95, reload: 1.6, atkCd: 0.5, attack: 'lob', range: 420, minRange: 70, dmg: 45, blast: 62, flight: 0.68,
      special: 'barrage', spNeed: 250, isNew: true, sticky: 1.2,
    },
    fist: {
      name: '重拳机兵', short: '重拳', role: '贴身格斗', desc: '向前冲出一记重拳，伤害高并把敌人击飞。厚重装甲减伤 25%，移动最快，但只能近身。',
      hp: 185, spd: 1.12, reload: 0.85, atkCd: 0.38, attack: 'punch', range: 68, arc: 1.7, dmg: 60, kb: 260, lunge: 240,
      armor: 0.75, special: 'quake', spNeed: 180, isNew: true, combo: 3, comboKind: 'upper',
    },
    // ---- 1.1：任务奖励机甲 ----
    riot: {
      name: '防暴盾卫', short: '盾卫', role: '护盾前排', desc: '举着灰石集团的防暴盾牌：正面受到的伤害 -40%，电击警棍近距离放电。大招立起一面能挡住子弹的盾墙。',
      hp: 160, spd: 0.96, reload: 1.25, atkCd: 0.45, attack: 'fan', pellets: 4, arc: 0.5, speed: 520, range: 190, dmg: 23, front: 0.6,
      spread: 0.04, splat: 22, trail: 12, size: 7, special: 'aegis', spNeed: 230, quest: 1,
    },
    // ---- S1 灰城重涂：赛季机甲 ----
    dozer: {
      name: '推土机兵', short: '推土', role: '前排推进', desc: '铲斗推出一排厚重涂料，近距离把敌人推开。生命值极高，是冲在最前面的墙。',
      hp: 165, spd: 0.94, reload: 1.35, atkCd: 0.5, attack: 'fan', pellets: 6, arc: 0.95, speed: 480, range: 175, dmg: 16, kb: 2.2,
      spread: 0.04, splat: 24, trail: 14, size: 8, special: 'bulldoze', spNeed: 240, season: 1,
    },
    flamer: {
      name: '喷火罐车', short: '喷火', role: '近距压制', desc: '持续喷出一道滚烫的涂料火焰，射程短但覆盖面极大，能把整条巷子烧成你的颜色。',
      hp: 120, spd: 0.97, reload: 1.7, atkCd: 0.3, attack: 'burst', shots: 12, interval: 0.055, speed: 430, range: 215, dmg: 8.5,
      spread: 0.24, splat: 25, trail: 15, size: 7, special: 'napalm', spNeed: 260, season: 1, burn: 2,
    },
    carrier: {
      name: '无人机母舰', short: '母舰', role: '追踪骚扰', desc: '放出会自动追踪敌人的小型涂装无人机，打不准也能命中，适合远距离骚扰。',
      hp: 130, spd: 0.96, reload: 1.35, atkCd: 0.45, attack: 'burst', shots: 4, interval: 0.13, speed: 400, range: 500, dmg: 27, homing: 2.6,
      spread: 0.12, splat: 22, trail: 10, size: 6, special: 'swarm', spNeed: 270, season: 1,
    },
    wrecker: {
      name: '拆楼锤', short: '拆楼', role: '重型挥击', desc: '抡起拆楼大锤横扫一大片，命中的敌人被狠狠砸飞。厚重装甲减伤 25%，一锤定音。',
      hp: 200, spd: 1.12, reload: 1.15, atkCd: 0.5, attack: 'punch', range: 104, arc: 2.6, dmg: 78, kb: 340, lunge: 170,
      armor: 0.75, special: 'whirl', spNeed: 190, season: 1, stagger: 0.8,
    },
    megaphone: {
      name: '喇叭车', short: '喇叭', role: '穿墙音波', desc: '用巨型喇叭放出音波涂料，音波能穿过墙壁和掩体，专治躲在墙后的敌人。',
      hp: 105, spd: 1, reload: 1.3, atkCd: 0.45, attack: 'fan', pellets: 3, arc: 0.42, speed: 560, range: 350, dmg: 25, ghost: true,
      spread: 0.02, splat: 16, trail: 10, size: 10, special: 'sonic', spNeed: 250, season: 1, reveal: 2,
    },
    // ---- 1.4：常驻新机体 ----
    slinger: {
      name: '弹弓机兵', short: '弹弓', role: '弹跳炮手', desc: '弹射一颗会弹跳的涂料球：落地爆炸后再往前弹出去炸第二次，能越过掩体打击后排。',
      hp: 100, spd: 1, reload: 1.1, atkCd: 0.5, attack: 'lob', range: 360, minRange: 60, dmg: 49, blast: 58, flight: 0.55, bounce: 1,
      special: 'cluster', spNeed: 250, isNew: true,
    },
    // ---- 1.4：袭击！特攻队（刺客型机体，只能从「特攻队补给箱」开出） ----
    blade: {
      name: '影刃机兵', short: '影刃', role: '突袭刺客', desc: '高速突进挥出一记影刃，从背后命中伤害 +30%。移动极快，但生命值低，一定要找准时机切入。',
      hp: 160, spd: 1.22, reload: 0.95, atkCd: 0.33, attack: 'punch', range: 62, arc: 1.9, dmg: 66, paintR: 54, kb: 120, lunge: 330, backstab: 1.4,
      special: 'shadowstep', spNeed: 180, strike: 1, isNew: true,
    },
    stinger: {
      name: '毒针机兵', short: '毒针', role: '毒素刺客', desc: '连射 3 根毒针，命中的敌人中毒 3 秒（每秒掉 6 点生命并减速）。射程远、生命值低，擅长消耗。',
      hp: 85, spd: 1.12, reload: 1.3, atkCd: 0.4, attack: 'burst', shots: 3, interval: 0.08, speed: 950, range: 400, dmg: 8.4, poison: 3,
      spread: 0.035, splat: 12, trail: 8, size: 4, special: 'venom', spNeed: 240, strike: 1, isNew: true,
    },
    phantom: {
      name: '幻影机兵', short: '幻影', role: '隐形刺客', desc: '近距离霰弹，从背后命中伤害 +30%；大招让自己隐身，隐身状态下的第一击伤害再 +50%。',
      hp: 118, spd: 1.15, reload: 1.25, atkCd: 0.5, attack: 'fan', pellets: 4, arc: 0.36, speed: 560, range: 230, dmg: 22, backstab: 1.3,
      spread: 0.04, splat: 18, trail: 8, size: 6, special: 'cloak', spNeed: 220, strike: 1, isNew: true,
    },
    // ---- 1.8：夜都决战（联动活动机体） ----
    warden: {
      name: '结界机兵', short: '结界', role: '结界支援', desc: '连发两枚符咒光弹，命中的敌人减速；同一个敌人连中 4 发会被符印束缚 0.7 秒。大招展开结界：把里面的敌人弹开，队友获得护盾、减伤并持续回血。',
      hp: 120, spd: 0.98, reload: 1.0, atkCd: 0.44, attack: 'burst', shots: 2, interval: 0.1, speed: 760, range: 330, dmg: 18, slowHit: 0.35, ward: 4,
      spread: 0.03, splat: 18, trail: 8, size: 6, special: 'barrier', spNeed: 240, collab: 'yato', isNew: true,
    },
    reaper: {
      name: '灵刃机兵', short: '灵刃', role: '灵能剑士', desc: '挥刀时向前斩出一道灵能刀气；连续第 3 刀是回旋斩（360° + 三道刀气）。大招「裂空斩」蓄力后贯穿一整条直线，人也跟着刀光冲过去。',
      hp: 150, spd: 1.08, reload: 0.95, atkCd: 0.44, attack: 'punch', range: 64, arc: 2.0, dmg: 42, paintR: 48, kb: 110, lunge: 220,
      wave: { dmg: 18, range: 230, speed: 820, size: 9, splat: 20 }, special: 'rend', combo: 3, spNeed: 220, collab: 'yato', isNew: true,
    },
  };
  // 2.0：每台机体的攻击特性（机体页面显示；数值写在 S.WEAPONS 里）
  S.TRAITS = {
    blaster: { name: '爆裂收尾', desc: '每轮 5 连发的最后一发是爆裂弹：伤害 ×1.4、涂地范围更大。' },
    roller: { name: '甩刷冲锋', desc: '甩刷时向前冲一小步，冲刺中撞到的敌人会被滚压。' },
    charger: { name: '穿甲弹', desc: '蓄力到 90% 以上的一枪会贯穿第一个敌人，继续命中后面的敌人（第二个目标伤害 ×0.7）。' },
    bucket: { name: '近身爆发', desc: '在 110 距离以内命中的涂料伤害 +20%。' },
    gatling: { name: '枪管预热', desc: '一轮 12 发越打越狠：伤害从 72% 一路涨到 110%。' },
    mortar: { name: '黏稠墨水', desc: '炮弹炸开的地方会粘住敌人，减速 1.2 秒。' },
    fist: { name: '三连上勾拳', desc: '连续第 3 拳是上勾拳：伤害 ×1.3，把敌人打飞到空中。' },
    slinger: { name: '弹跳炮弹', desc: '炮弹落地爆炸后会沿原方向再弹一次。' },
    dozer: { name: '推土铲', desc: '涂料把敌人推得特别远，适合把人推出据点。' },
    flamer: { name: '点燃', desc: '被火焰命中的敌人会着火 2 秒，每 0.5 秒受到 3 点伤害。' },
    carrier: { name: '追踪弹', desc: '无人机弹会自动转向附近的敌人。' },
    wrecker: { name: '震荡', desc: '被大锤砸中的敌人头晕眼花，减速 0.8 秒。' },
    megaphone: { name: '声纳', desc: '被音波打中的敌人暴露位置 2 秒，躲进草丛也没用。' },
    riot: { name: '正面护盾', desc: '正面受到的伤害 -40%，从侧面和背后打才有效。' },
    blade: { name: '背刺', desc: '从背后命中伤害 ×1.4。' },
    stinger: { name: '毒素', desc: '毒针让敌人中毒：持续掉血并减速。' },
    phantom: { name: '伏击', desc: '隐身状态下的第一击伤害 ×1.5。' },
    warden: { name: '符印束缚', desc: '同一个敌人连中 4 发会被束缚 0.7 秒，并额外受到 16 伤害。' },
    reaper: { name: '三连回旋斩', desc: '连续第 3 刀是 360° 回旋斩：伤害 ×1.3，一次斩出三道刀气。' },
  };
  S.WEAPON_ORDER = ['blaster', 'roller', 'charger', 'bucket', 'gatling', 'mortar', 'fist', 'slinger', 'dozer', 'flamer', 'carrier', 'wrecker', 'megaphone', 'riot', 'blade', 'stinger', 'phantom', 'warden', 'reaper'];
  S.weaponRange = function (id) {
    const w = S.WEAPONS[id];
    if (id === 'charger') return 620;
    if (id === 'roller') return 180;
    if (id === 'fist') return 80;
    if (id === 'wrecker') return 108;
    if (id === 'blade') return 110;   // 算上突进距离
    if (id === 'reaper') return 230;  // 刀气
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
    cluster: { name: '连环弹', desc: '朝瞄准方向扇形弹出 5 颗弹跳涂料球，每颗都会弹两次。' },
    shadowstep: { name: '影袭', desc: '瞬间冲向瞄准方向，穿过路上的敌人造成 60 点伤害，随后隐身 1.5 秒。' },
    venom: { name: '毒雾', desc: '把毒雾罐扔到瞄准位置，5 秒内雾里的敌人持续中毒、减速并暴露位置。' },
    cloak: { name: '光学迷彩', desc: '隐身 4 秒，移动速度 +25%；隐身时的第一击伤害 +50%（攻击后现形）。' },
    barrier: { name: '结界展开', desc: '以自己为中心展开 6 秒的半透明结界：里面的队友受到的伤害 -30%、每秒回复 10 生命，闯进来的敌人减速 25%。' },
    rend: { name: '裂空斩', desc: '蓄力 0.35 秒，朝瞄准方向斩出一道巨大的灵能刀气：贯穿 520 距离内的所有敌人，造成 85 点伤害并击退，沿路涂满。' },
  };
  S.SPECIAL_IDS = [null, 'storm', 'charge', 'missiles', 'bubble', 'beam', 'barrage', 'quake', 'bulldoze', 'napalm', 'swarm', 'whirl', 'sonic', 'aegis', 'cluster', 'shadowstep', 'venom', 'cloak', 'barrier', 'rend'];
  S.superAimed = (sp) => sp === 'beam' || sp === 'barrage' || sp === 'quake' || sp === 'charge' || sp === 'bulldoze' || sp === 'napalm' || sp === 'cluster' || sp === 'shadowstep' || sp === 'venom' || sp === 'rend';

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
    bento: { short: '便当', name: '能量便当', desc: '在脚下放一份便当，第一个碰到的队友回复 90 点生命。' },
    overdrive: { short: '火力', name: '火力全开', desc: '立即装满弹药，接下来 3 次攻击伤害 +40%。' },
    drone: { short: '无人机', name: '猫猫无人机', desc: '召唤跟随自己的无人机，6 秒内自动射击附近敌人。' },
    rally: { short: '集结', name: '集结号', desc: '插下反抗军旗帜，5 秒内自己和附近队友伤害 +20%、移动速度 +15%。' },
    blast: { short: '爆破', name: '定向爆破', desc: '在脚下放一包炸药，0.9 秒后爆炸，造成 72 点伤害并涂满周围。' },
    jam: { short: '干扰', name: '声波干扰', desc: '附近敌人的大招充能减少 30%，并暴露位置 4 秒（草丛里也藏不住）。' },
    decoy: { short: '替身', name: '魔术替身', desc: '原地留下一个替身，2 秒后炸开造成 40 点伤害；自己隐身 2 秒。' },
    flash: { short: '闪光', name: '闪光弹', desc: '朝前方扔出闪光弹：扇形范围内的敌人受到 10 点伤害、减速 1.2 秒、0.8 秒内无法攻击，并暴露 4 秒。' },
    seal: { short: '封印', name: '封印符', desc: '朝瞄准方向甩出一张封印符，落地展开 3 秒符阵：阵里的敌人减速 40%、不能放技能和大招，并暴露位置。' },
    possess: { short: '附身', name: '恶灵附身', desc: '4 秒内攻击吸血 35%，移动速度 +20%，受到的伤害 -15%。' },
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
    chef: { name: '满汉全席', desc: '立刻为自己和附近队友回复 50 生命，之后每秒回复 10。', burstHeal: 50, regen: 10 },
    vet: { name: '老兵不死', desc: '持续期间不会倒下，伤害 +20%。', undying: 1, dmg: 1.2 },
    yuzu: { name: '喵喵军团', desc: '召唤 2 架猫猫无人机，攻击速度 +20%。', drones: 2, rof: 1.2 },
    flag: { name: '全军突击', desc: '附近 300 范围内的队友伤害 +20%、移动速度 +15%。', rally: 1 },
    hammer: { name: '爆破专家', desc: '伤害 +40%，击退距离翻倍。', dmg: 1.4, kb: 2 },
    echo: { name: '音浪风暴', desc: '每秒向四周放出一圈音波，穿墙造成 22 点伤害。', pulse: 22 },
    han: { name: '反戈一击', desc: '受到的伤害 -25%，并把受到伤害的 60% 反弹给攻击者。', def: 0.75, reflect: 0.6 },
    kaka: { name: '魔术秀', desc: '攻击速度 +45%，大招充能 +70%。', rof: 1.45, spGain: 1.7 },
    fu: { name: '简易领域', desc: '以自己为中心展开半径 170 的简易领域（跟着自己移动）：飞进领域的敌方子弹全部被中和；闯进领域的敌人会被自动反击——符咒斩 22 伤害、往外弹开、减速并封住技能；自己减伤 25%、伤害 +15%。', dmg: 1.15, def: 0.75, domain: { r: 170, counter: 22, cd: 0.7 } },   // 1.9.1：百符结界 → 简易领域
    aka: { name: '灵化爆发', desc: '伤害 +35%，受到的伤害 -20%，每次命中回复 6 生命。', dmg: 1.35, def: 0.8, hitHeal: 6 },
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
    { id: 'echo_midnight', kind: 'pilot', pilot: 'echo', name: '午夜频道', rare: 3, entrance: 'dj', price: 0, pass: 'p14', over: { hair: '#ff3ea5', hair2: '#8f1060', accent: '#ff3ea5', eye: '#2ef0c8' } },
    { id: 'hammer_gold', snd: 'gold', kind: 'pilot', pilot: 'hammer', name: '金牌工头', rare: 5, entrance: 'hammer', price: 380, over: { accent: '#ffd35e', hair: '#1e120a' } },
    { id: 'flag_red', snd: 'flag', kind: 'pilot', pilot: 'flag', name: '红旗特装', rare: 5, entrance: 'flag', price: 0, pass: 'p30', over: { hair: '#c8102e', hair2: '#5a0012', accent: '#ffe14d', eye: '#ffe14d' } },
    // ---- 1.4：夏日系列 ----
    { id: 'blaze_surf', kind: 'pilot', pilot: 'blaze', name: '冲浪少年', rare: 3, entrance: 'surf', price: 320, series: 'summer', over: { hair: '#ffb21f', hair2: '#c45a0c', accent: '#1fd6ee', outfit: 'surf', extra: ['sunglasses', 'surfboard'] } },
    { id: 'candy_beach', kind: 'pilot', pilot: 'candy', name: '海滩偶像', rare: 3, entrance: 'idol', price: 320, series: 'summer', over: { hair: '#ff9ad6', hair2: '#d1408e', accent: '#ffe14d', eye: '#1fd6ee', outfit: 'swim', extra: ['strawhat', 'float'] } },
    { id: 'frost_sorbet', snd: 'ice', kind: 'pilot', pilot: 'frost', name: '冰沙女王', rare: 6, entrance: 'ice', bg: 'ice', price: 680, series: 'summer', over: { hair: '#bff3ff', hair2: '#5ec8f0', accent: '#7af0ff', eye: '#ff6ec4', outfit: 'sorbet', extra: ['icecrown', 'parasol'] } },
    { id: 'm_camo', kind: 'mech', name: '灰城迷彩', rare: 2, price: 0, pass: 'p5', paint: { frame: '#4a4d56', light: '#9aa0a8', joint: '#2a2c33' } },
    { id: 'm_chrome', kind: 'mech', name: '铬合金', rare: 2, price: 180, paint: { frame: '#c9d3dc', light: '#ffffff', joint: '#8c94ab' } },
    { id: 'm_graffiti', kind: 'mech', name: '涂鸦大师', rare: 3, price: 240, paint: { frame: '#ff3ea5', light: '#ffe600', joint: '#1fd6ee' } },
    { id: 'm_neon', kind: 'mech', name: '霓虹描边', rare: 3, price: 0, pass: 'p20', paint: { frame: '#141018', light: '#2ef0c8', joint: '#141018', glow: 1 } },
    { id: 'm_gold', kind: 'mech', name: '金色传说', rare: 5, price: 380, paint: { frame: '#b88a1a', light: '#ffd35e', joint: '#7a5a10', glow: 1 } },
    { id: 'fx_stars', kind: 'fx', name: '星星涂料', rare: 2, price: 0, pass: 'p10', fx: { cols: ['#ffe600', '#ffffff'], n: 3 } },
    { id: 'fx_confetti', kind: 'fx', name: '派对彩纸', rare: 3, price: 0, pass: 'p28', fx: { cols: ['#ff3ea5', '#1fd6ee', '#9cff2e', '#ffe600'], n: 5 } },
    { id: 'fx_notes', kind: 'fx', name: '电台音符', rare: 2, price: 160, fx: { cols: ['#2ef0c8', '#a46bff'], n: 3 } },
    { id: 'fx_galaxy', kind: 'fx', name: '星河涂料', rare: 5, price: 400, fx: { cols: ['#b78cff', '#4fb8ff', '#ffffff'], n: 6 } },
    { id: 'fr_tape', kind: 'frame', name: '胶带框', rare: 1, price: 0, pass: 'f10', frame: 'tape' },
    { id: 'fr_neon', kind: 'frame', name: '霓虹框', rare: 2, price: 120, frame: 'neon' },
    { id: 'fr_rebel', kind: 'frame', name: '反抗军框', rare: 3, price: 0, pass: 'p23', frame: 'rebel' },
    { id: 'fr_gold', kind: 'frame', name: '金框', rare: 3, price: 220, frame: 'gold' },
    { id: 'fr_flame', kind: 'frame', name: '烈焰框', rare: 5, price: 300, frame: 'flame' },
    { id: 'av_flag', kind: 'avatar', name: '反抗军旗', rare: 2, price: 0, pass: 'f20', avatar: 'flag' },
    { id: 'av_can', kind: 'avatar', name: '喷漆罐', rare: 1, price: 60, avatar: 'can' },
    { id: 'av_cat', kind: 'avatar', name: '灰城猫', rare: 2, price: 90, avatar: 'cat' },
    { id: 'av_balloon', kind: 'avatar', name: '乐园气球', rare: 2, price: 0, event: 'parkfest', avatar: 'balloon' },
    { id: 'fr_master', kind: 'frame', name: '大师段位框', rare: 5, price: 0, rank: 'master', frame: 'master' },
    // ---- 1.8：夜都决战联动系列（每套驾驶员皮肤都有一段约 20 秒的 3D 战斗动画） ----
    { id: 'blaze_yato', kind: 'pilot', pilot: 'blaze', name: '夜都·学院生', rare: 3, entrance: 'academy', price: 0, event: 'yato', series: 'yato', trailer: 1, over: { hair: '#e8382f', hair2: '#8f1022', accent: '#ff4d3d', outfit: 'academy', extra: ['sealband'] } },
    { id: 'fu_moon', kind: 'pilot', pilot: 'fu', name: '月下符姬', rare: 3, entrance: 'moon', price: 0, event: 'yato', series: 'yato', trailer: 1, over: { hair: '#2a2f5a', hair2: '#0d1030', accent: '#ffd35e', eye: '#ffd35e', outfit: 'academyW', extra: ['moonpin'] } },
    { id: 'frost_yato', snd: 'yato', kind: 'pilot', pilot: 'frost', name: '夜都·封咒师', rare: 6, entrance: 'sealer', bg: 'yato', price: 880, series: 'yato', trailer: 1, over: { hair: '#f2f6ff', hair2: '#9aa6c8', accent: '#8a6bff', eye: '#b48cff', outfit: 'academyW', extra: ['talismans'] } },
    { id: 'aka_wraith', snd: 'wraith', kind: 'pilot', pilot: 'aka', name: '恶灵觉醒', rare: 6, entrance: 'wraith', bg: 'wraith', price: 880, series: 'yato', trailer: 1, over: { hair: '#14101a', hair2: '#ff2d4b', accent: '#ff2d4b', eye: '#ff2d4b', outfit: 'academyH', extra: ['wraith', 'halfmask'] } },
    { id: 'm_talisman', kind: 'mech', name: '符纹', rare: 3, price: 0, event: 'yato', series: 'yato', paint: { frame: '#1d2140', light: '#d8b25a', joint: '#8a6bff', glow: 1 } },
    { id: 'fr_yato', kind: 'frame', name: '夜都结界框', rare: 3, price: 0, event: 'yato', frame: 'yato' },
    { id: 'av_talisman', kind: 'avatar', name: '封印符', rare: 2, price: 0, event: 'yato', avatar: 'talisman' },
    // ---- 1.9：排位赛第一赛季「烈士」 ----
    { id: 'blaze_martyr', kind: 'pilot', pilot: 'blaze', name: '烈士·战火', rare: 2, price: 0, road: 1, series: 's1rank', over: { hair: '#e8382f', hair2: '#8f1022', accent: '#c8102e', outfit: 'rebel', extra: ['sealband'] } },
    { id: 'flag_martyr', snd: 'martyr', kind: 'pilot', pilot: 'flag', name: '烈士·不灭战旗', rare: 4, price: 0, shards: 20, series: 's1rank', entrance: 'warbanner', bg: 'martyr', over: { hair: '#f2f2f6', hair2: '#a8a8b8', accent: '#ffd35e', eye: '#ffd35e', outfit: 'martyr', extra: ['warbanner'] } },
    { id: 'fr_final', kind: 'frame', name: '终末传说框', rare: 5, price: 0, road: 1, frame: 'final' },
  ];
  S.skin = (id) => S.SKINS.find((k) => k.id === id);
  S.SKIN_KINDS = [['pilot', '驾驶员服装'], ['mech', '机甲涂装'], ['fx', '涂料特效'], ['frame', '名片框'], ['avatar', '头像']];
  // 皮肤等级：等级越高特效越多（对战里的表现见 render3d.js / client.js）
  // 1.9：皮肤品质重做——史诗 < 赛季传说 < 传说 < 限定传说（史诗起都有专属进场动作）
  S.RARE = [null,
    { name: '普通', c: '#9aa0a8', fx: '专属配色' },
    { name: '稀有', c: '#4fb8ff', fx: '专属配色 + 移动闪光拖尾' },
    { name: '史诗', c: '#b78cff', fx: '专属进场动作 + 闪光拖尾 + 发光部件呼吸灯 + 空投 / 复活爆发特效' },
    { name: '赛季传说', c: '#ff9a3d', fx: '专属进场动作 + 史诗全部特效 + 环绕光环 + 地面光圈 + 金边大招横幅' },
    { name: '传说', c: '#ffc531', fx: '赛季传说全部 + 更强的光环 + 子弹星光拖尾 + 专属击倒特效 + 专属开火 / 命中音效' },
    { name: '限定传说', c: '#ff3e8a', fx: '传说全部 + 专属背景 + 主题粒子特效（脚印 / 环绕 / 击倒）+ 专属大招横幅 + 主题开火手感' },
  ];
  S.FX_RARE = [null, '命中时少量彩色涂料', '命中时迸出彩色光点', '命中时迸出大片光点 + 枪口闪光', '命中光点 + 子弹拖尾 + 枪口星爆', '命中光点 + 子弹拖尾 + 枪口星爆', '命中光点 + 子弹拖尾 + 枪口星爆'];
  S.FRAME_RARE = [null, '静态边框', '霓虹呼吸光', '流动条纹动画', '火焰流光动画', '火焰流光动画', '火焰流光动画'];
  S.rareName = (r) => (S.RARE[r] || S.RARE[1]).name;
  S.TALENT_SLOTS = 3;

  // ---------------- 驾驶员被摧毁后：弹出继续战斗 ----------------
  S.PILOT_HP = 50;          // 弹出驾驶员的生命值
  S.PILOT_R = 9;            // 驾驶员碰撞半径
  S.PILOT_SPEED = 205;
  S.REBUILD = 6;            // 新机体重建时间（秒），驾驶员活下来就在原地空投新机体
  S.KO_RESPAWN = 4;         // 驾驶员被击倒后回基地复活的时间
  S.PISTOL = { range: 260, dmg: 13, speed: 620, reload: 0.85, atkCd: 0.32, size: 5, splat: 12, trail: 0 };
  // 1.3：每位驾驶员弹出后用自己的随身武器（都比机体弱得多）
  //   kind: gun 子弹 / melee 近身挥击 / lob 抛投；shots 连发、pellets 散射、cost 每发弹药、quiet 草丛里开火不暴露、
  //   homing 自动锁定、ghost 穿墙、fx.slow 减速秒数、fx.reveal 暴露秒数、heal 命中回血
  S.SIDEARMS = {
    blaze:  { name: '火花双枪', desc: '一次连开 2 枪，近中距离压制。', kind: 'gun', shots: 2, interval: 0.08, dmg: 8, range: 240, speed: 640, spread: 0.06, reload: 0.8, atkCd: 0.36 },
    frost:  { name: '袖珍狙击枪', desc: '射程最远、单发伤害高，但开火很慢。', kind: 'gun', dmg: 22, range: 380, speed: 1150, reload: 1.15, atkCd: 0.7, size: 4, splat: 10 },
    candy:  { name: '彩带喷枪', desc: '一次喷出 3 道彩带，近距离很难躲。', kind: 'gun', pellets: 3, arc: 0.42, dmg: 5, range: 200, speed: 560, reload: 0.8, atkCd: 0.38, splat: 14 },
    titan:  { name: '涂料拳套', desc: '近身连拳，把敌人打飞。', kind: 'melee', dmg: 14, range: 46, arc: 1.8, kb: 140, lunge: 140, reload: 0.75, atkCd: 0.38 },
    raven:  { name: '墨汁飞镖', desc: '在草丛和墨雾里投掷不会暴露自己。', kind: 'gun', dmg: 11, range: 290, speed: 760, quiet: true, reload: 0.85, atkCd: 0.34, size: 4 },
    aurora: { name: '铆钉枪', desc: '射速很快，每发只用半格弹药。', kind: 'gun', dmg: 6, range: 230, speed: 700, cost: 0.5, spread: 0.08, reload: 0.9, atkCd: 0.16, size: 4 },
    gale:   { name: '疾风弩', desc: '箭矢飞得很快，装填也最快。', kind: 'gun', dmg: 12, range: 300, speed: 1000, reload: 0.7, atkCd: 0.3, size: 4 },
    hex:    { name: '电击枪', desc: '射程短，命中后让敌人减速 0.8 秒。', kind: 'gun', dmg: 9, range: 210, speed: 800, fx: { slow: 0.8 }, reload: 0.9, atkCd: 0.4 },
    chef:   { name: '平底锅', desc: '近身拍击，每次打中给自己回 4 点生命。', kind: 'melee', dmg: 15, range: 44, arc: 2.0, kb: 180, lunge: 120, heal: 4, reload: 0.75, atkCd: 0.42 },
    vet:    { name: '手雷', desc: '抛出一颗会越过墙的小手雷，小范围爆炸。', kind: 'lob', dmg: 18, r: 46, range: 250, T: 0.6, reload: 1.2, atkCd: 0.8 },
    yuzu:   { name: '迷你无人机', desc: '小无人机自动锁定准星附近的敌人。', kind: 'gun', homing: true, dmg: 8, range: 260, speed: 600, reload: 0.85, atkCd: 0.34, size: 5 },
    flag:   { name: '信号枪', desc: '打中的敌人会暴露 2.5 秒，全队都能看见。', kind: 'gun', dmg: 10, range: 270, speed: 700, fx: { reveal: 2.5 }, reload: 0.85, atkCd: 0.35 },
    hammer: { name: '钉锤', desc: '挥得慢，但一锤很重，能把人砸退。', kind: 'melee', dmg: 18, range: 50, arc: 1.6, kb: 200, lunge: 100, reload: 0.95, atkCd: 0.62 },
    echo:   { name: '口袋音箱', desc: '短距离音波，可以穿过墙壁。', kind: 'gun', ghost: true, dmg: 9, range: 180, speed: 520, reload: 0.85, atkCd: 0.4, size: 7 },
    kaka:   { name: '扑克飞牌', desc: '一次甩出 3 张飞牌，扇形散开。', kind: 'gun', pellets: 3, arc: 0.32, dmg: 5, range: 240, speed: 700, reload: 0.8, atkCd: 0.36, size: 4 },
    han:    { name: '警用电棍', desc: '近身电击，命中让敌人减速 0.6 秒。', kind: 'melee', dmg: 14, range: 44, arc: 1.5, kb: 110, lunge: 130, fx: { slow: 0.6 }, reload: 0.75, atkCd: 0.38 },
    fu:     { name: '符纸飞镖', desc: '一次甩出 2 张符纸，命中的敌人减速 0.5 秒。', kind: 'gun', pellets: 2, arc: 0.18, dmg: 8, range: 260, speed: 760, fx: { slow: 0.5 }, reload: 0.85, atkCd: 0.36, size: 4 },
    aka:    { name: '断骨短镰', desc: '近身横扫一大片，刃口比别的近战武器更宽。', kind: 'melee', dmg: 15, range: 52, arc: 2.3, kb: 150, lunge: 150, reload: 0.8, atkCd: 0.42 },
  };
  S.sidearm = (pid) => Object.assign({ kind: 'gun', size: 5, splat: 12, trail: 0, cost: 1, spread: 0.04 }, S.PISTOL, S.SIDEARMS[String(pid || '').split('@')[0]] || {});
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
      skill: 'rush', passive: { name: '越战越勇', desc: '击毁机体或击倒驾驶员后回复 40% 生命。' },
      line: '涂料都装满了？那就冲啊！', bio: '街头涂鸦队的队长，永远第一个冲进敌阵。说话大声、笑声更大，护目镜是他唯一不肯借人的东西。' },
    { id: 'frost', name: '白夜', code: '霜刃', title: '冷面狙击手', weapon: 'charger', accent: '#5fd3ff',
      hair: '#e6eef8', hair2: '#8796b8', skin: '#fde3d2', eye: '#47c8ff', style: 'swept', eyeShape: 'cool', mouth: 'calm', outfit: 'coat',
      skill: 'scan', passive: { name: '远距精准', desc: '对 60% 射程以外的目标伤害 +15%。' },
      line: '一发，就够了。', bio: '曾经的天台竞速冠军，退役后只用一支狙击笔说话。刘海下藏着一只机械义眼，能看清八百米外的涂料滴。' },
    { id: 'candy', name: '苏糖', code: '电音', title: '元气偶像主播', weapon: 'gatling', accent: '#ff5fc1',
      hair: '#ff8fcf', hair2: '#c0367e', skin: '#ffe2d3', eye: '#b56bff', style: 'twintail', eyeShape: 'round', mouth: 'open', outfit: 'idol',
      skill: 'cheer', passive: { name: '人气爆棚', desc: '大招充能速度 +30%。' },
      line: '大家～今天也要涂得闪闪发光哦！', bio: '拥有百万粉丝的直播主，猫耳耳机连着直播间。看起来软萌，实际是旋转喷管的火力狂人。' },
    { id: 'titan', name: '雷豹', code: '铁拳', title: '重装开路者', weapon: 'roller', accent: '#ffb000',
      hair: '#2a2420', hair2: '#0d0b0a', skin: '#b97a55', eye: '#ffcc33', style: 'dreads', eyeShape: 'bold', mouth: 'smirk', outfit: 'tank',
      skill: 'guard', passive: { name: '钢筋铁骨', desc: '机体生命值 +18%。' },
      line: '挡路的，统统碾过去。', bio: '前码头起重机驾驶员，力气大到能单手扛起滚刷。外表凶悍，其实是全队最会照顾人的大哥。' },
    { id: 'raven', name: '夜鸢', code: '墨鸦', title: '神秘涂鸦师', weapon: 'bucket', accent: '#a46bff',
      hair: '#3b2b5c', hair2: '#160f26', skin: '#f6d8c8', eye: '#c18bff', style: 'hood', eyeShape: 'sleepy', mouth: 'smirk', outfit: 'hoodie',
      skill: 'smoke', passive: { name: '暗影步', desc: '在草丛和己方涂料上移动速度 +12%。' },
      line: '这面墙……归我了。', bio: '城市里最神秘的涂鸦作者，没人见过她摘下兜帽。她泼出的每一桶涂料都是一幅画。' },
    { id: 'aurora', name: '星澜', code: '极光', title: '天才机兵工程师', weapon: 'blaster', accent: '#2ee6b0',
      hair: '#35d6c4', hair2: '#1c6f8c', skin: '#ffe4d6', eye: '#3fe0a0', style: 'ponytail', eyeShape: 'round', mouth: 'smile', outfit: 'engineer',
      skill: 'turret', passive: { name: '快速装配', desc: '机体被摧毁后，新机体重建时间 -2 秒。' },
      line: '机兵的参数我都调好啦，交给我吧！', bio: '十四岁就设计出第一台涂鸦机兵的天才少女。头上的护目镜是工作用的，扳手总是插在腰间。' },
    // ---- 新驾驶员 ----
    { id: 'gale', name: '风羽', code: '疾风', title: '天空竞速手', weapon: 'fist', accent: '#4fb8ff', isNew: true,
      hair: '#d6ecff', hair2: '#6f8fc8', skin: '#ffe0cc', eye: '#2f9bff', style: 'braid', eyeShape: 'sharp', mouth: 'smile', outfit: 'aviator',
      skill: 'dash', passive: { name: '轻装上阵', desc: '机体移动速度 +8%；弹出后的驾驶员移动速度 +45%，冲刺无敌时间更长。' },
      line: '追得上我的话，就来试试吧！', bio: '滑翔伞联赛三连冠，把机兵当成会走路的滑翔翼来开。长辫子和围巾是她在风里最好认的标志。' },
    { id: 'hex', name: '洛奇', code: '骇客', title: '天才黑客', weapon: 'charger', accent: '#c06bff', isNew: true,
      hair: '#2b2140', hair2: '#120a1c', skin: '#f4d9c6', eye: '#ff6bf0', style: 'undercut', eyeShape: 'cool', mouth: 'smirk', outfit: 'hacker',
      skill: 'emp', passive: { name: '信号侦测', desc: '能看见更远处草丛里的敌人（170 范围）。' },
      line: '你的机兵，现在归我了。', bio: '十六岁黑进了城市所有的广告屏，只为播放自己的涂鸦动画。护目镜上永远滚动着看不懂的代码。' },
    { id: 'chef', name: '包大福', code: '大厨', title: '后勤大厨', weapon: 'bucket', accent: '#ff9f2e', isNew: true,
      hair: '#c4652c', hair2: '#7a3612', skin: '#ffd9b8', eye: '#7a4a24', style: 'chef', eyeShape: 'happy', mouth: 'grin', outfit: 'chefcoat',
      skill: 'bento', passive: { name: '吃饱才有力气', desc: '脱离战斗后回血速度 +100%。' },
      line: '打完这局，大家来吃饭！', bio: '街角夜宵摊老板，用泼桶机兵炒菜火候刚好。队友受伤了，他总能从驾驶舱里掏出热腾腾的便当。' },
    { id: 'vet', name: '秦岳', code: '老兵', title: '退役王牌', weapon: 'mortar', accent: '#9bc94a', isNew: true,
      hair: '#c2c6ce', hair2: '#6c7078', skin: '#e3b894', eye: '#7aa8c0', style: 'veteran', eyeShape: 'bold', mouth: 'calm', outfit: 'military',
      skill: 'overdrive', passive: { name: '同归于尽', desc: '机体被摧毁时自爆，对周围敌人造成 65 点伤害。' },
      line: '小鬼们，看好了。', bio: '第一代机兵测试驾驶员，一只眼睛在当年的事故里留下了伤。退休后在训练场当教官，嘴硬心软。' },
    { id: 'yuzu', name: '小柚', code: '机仆', title: '无人机少女', weapon: 'gatling', accent: '#ffc531', isNew: true,
      hair: '#ff9a3d', hair2: '#c25a12', skin: '#ffe4d2', eye: '#ff6a2e', style: 'buns', eyeShape: 'round', mouth: 'open', outfit: 'kid',
      skill: 'drone', passive: { name: '涂鸦小能手', desc: '涂地给大招的充能 +70%。' },
      line: '小喵，出动！把那边涂满！', bio: '星澜的邻居小妹妹，自己改装了一架猫咪无人机。个子最小，背包里的零件却最多。' },
    // ---- S1 灰城重涂：赛季驾驶员 ----
    { id: 'flag', name: '岚', code: '旗手', title: '灰城反抗军队长', weapon: 'dozer', accent: '#ff5a36', season: 1,
      hair: '#3a3a44', hair2: '#16161c', skin: '#f2c9a8', eye: '#ff7a3d', style: 'swept', eyeShape: 'sharp', mouth: 'calm', outfit: 'rebel',
      skill: 'rally', passive: { name: '众志成城', desc: '附近每有 1 名队友，受到的伤害 -10%（最多 -30%）。' },
      line: '墙刷白一次，我们就涂回去一次。', bio: '灰石集团把整座城刷成灰色的那天，她在市政厅门口喷下了第一面红旗。现在，整个反抗军都跟着那面旗走。' },
    { id: 'hammer', name: '石磊', code: '拆楼', title: '拆迁队工头', weapon: 'wrecker', accent: '#ffb000', season: 1,
      hair: '#4a3020', hair2: '#1e120a', skin: '#c98f66', eye: '#8a5a2e', style: 'veteran', eyeShape: 'bold', mouth: 'grin', outfit: 'worker',
      skill: 'blast', passive: { name: '安全第一', desc: '驾驶员弹出时自动获得 45 点护盾（安全帽）。' },
      line: '这堵灰墙？三锤之内给你拆了。', bio: '原本是灰石集团的拆迁队工头，被派去拆掉城里所有的涂鸦墙。拆到第一百面墙时，他扔下合同，扛着大锤加入了反抗军。' },
    { id: 'echo', name: '叶声', code: '电台', title: '地下电台 DJ', weapon: 'megaphone', accent: '#2ef0c8', season: 1,
      hair: '#1fd6a8', hair2: '#0b6b5a', skin: '#ffe0cf', eye: '#a46bff', style: 'spiky', eyeShape: 'cool', mouth: 'open', outfit: 'dj',
      skill: 'jam', passive: { name: '节拍同步', desc: '附近 180 范围内的队友装填速度 +15%。' },
      line: '各位灰城的夜猫子，今晚的歌，叫《反击》！', bio: '每天午夜，灰城所有的收音机都会被一个神秘频道占领。没人知道 DJ 长什么样，只知道她的音波能震碎灰石集团的扩音器。' },
    // ---- 1.1：任务奖励驾驶员 ----
    { id: 'han', name: '韩冰', code: '叛将', title: '灰石集团前安保主管', weapon: 'riot', accent: '#5fa8ff', quest: 1,
      hair: '#dfe6ee', hair2: '#8e9aa8', skin: '#f6dccb', eye: '#5fa8ff', style: 'undercut', eyeShape: 'sharp', mouth: 'calm', outfit: 'security',
      skill: 'flash', passive: { name: '倒戈', desc: '对生命高于 90% 的敌人伤害 +14%。' },
      line: '我刷过的灰墙，我亲手涂回来。', bio: '灰石集团最年轻的安保主管，负责镇压所有涂鸦行动。直到她在档案室里看到「刷白计划」的真相——第二天，她带着整支防暴队的盾牌投奔了反抗军。' },
    // ---- 1.4：常驻新驾驶员 ----
    { id: 'kaka', name: '卡卡', code: '魔术', title: '街头魔术师', weapon: 'slinger', accent: '#b06bff', isNew: true,
      hair: '#2a1f3a', hair2: '#120b1e', skin: '#ffe1cc', eye: '#ffd23f', style: 'swept', eyeShape: 'round', mouth: 'smirk', outfit: 'magician',
      skill: 'decoy', passive: { name: '惊喜礼盒', desc: '击毁机体或击倒驾驶员时掉落一个礼盒，第一个碰到的队友回复 60 生命。' },
      line: '看好了——涂料会从帽子里飞出来！', bio: '灰城夜市最受欢迎的街头魔术师，能把一罐喷漆变成一群鸽子。灰石集团没收了他的舞台，于是他把整座城市变成了舞台。' },
    // ---- 1.8：夜都决战（联动活动驾驶员，原创角色） ----
    { id: 'fu', name: '符零', code: '符咒', title: '夜都符术师', weapon: 'warden', accent: '#8a6bff', isNew: true, collab: 'yato',
      hair: '#1b1d33', hair2: '#0a0b16', skin: '#fde3d2', eye: '#b48cff', style: 'ponytail', eyeShape: 'cool', mouth: 'calm', outfit: 'academy',
      skill: 'seal', passive: { name: '符咒共鸣', desc: '对减速中的敌人伤害 +15%。' },
      line: '一张符，镇一方。', bio: '夜都术师学院最年轻的符术讲师，袖子里永远藏着几百张亲手写的符。她能用一张纸符封住整条街，却总是忘记带伞。' },
    { id: 'aka', name: '赤镰', code: '恶灵', title: '恶灵宿主', weapon: 'reaper', accent: '#ff2d4b', isNew: true, collab: 'yato',
      hair: '#2a2430', hair2: '#ff2d4b', skin: '#f6d6c2', eye: '#ff3b52', style: 'spiky', eyeShape: 'sharp', mouth: 'grin', outfit: 'academyH',
      skill: 'possess', passive: { name: '恶灵低语', desc: '生命低于 40% 时伤害 +20%。' },
      line: '别靠太近……它会饿。', bio: '在废弃地铁站里误吞了一枚封着恶灵的符核，从此影子会自己动，镰刃上的红光也越来越亮。学院决定让他上前线——赶在恶灵醒来之前。' },
  ];
  const pilotCache = new Map();
  S.pilot = (id) => {
    if (typeof id === 'string' && id.includes('@')) {   // 带皮肤的驾驶员：flag@flag_red
      if (pilotCache.has(id)) return pilotCache.get(id);
      const [pid, sk] = id.split('@'), base = S.PILOTS.find((p) => p.id === pid) || S.PILOTS[0], K = S.skin && S.skin(sk);
      const P = K && K.pilot === base.id ? Object.assign({}, base, K.over, { skinId: K.id }) : base;   // 注意：skin 是肤色，皮肤 id 放在 skinId
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
    park: { name: '乐园模式', short: '乐园', desc: '嘉年华花车沿着环形路线巡游：花车光圈里人多的队伍每秒得 1 分，打爆飘着的气球再得 3 分。先到 100 分获胜。', original: true, isNew: true },
    loot: { name: '搜刮撤离', short: '撤离', desc: '超大地图上搜刮物资、和其他小队争夺，在撤离点读条 10 秒成功撤离，带出来的物资存进仓库。只有一条命，阵亡或没来得及撤离，这局搜到的东西全部丢失。', original: true, oneLife: true, teams: 4, size: 3, isNew: true },
    escape8: { name: '逃亡圈 · 单人', short: '单人逃亡', desc: '8 名驾驶员各自为战。毒圈缩小、空投箱变强、只有一条命，活到最后就是赢家。', original: true, oneLife: true, teams: 8, size: 1, isNew: true },
    // ---- 1.8：夜都决战限时玩法 ----
    raid: { name: '咒灵讨伐', short: '讨伐', desc: '最多 4 人合作讨伐巨型咒灵「百目」：它会砸地、放弹幕、召唤小咒灵、冲撞，血量过半后进入狂暴。4 分钟内打倒它就赢了！', original: true, coop: true, size: 4, isNew: true, limited: 'yato' },
    seal: { name: '封印争夺', short: '封印', desc: '打倒四处游荡的咒灵会掉落封印石，地图上也会不时出现。把封印石带回己方祭坛存起来，被击倒会掉落身上全部封印石。先存满 25 个获胜！', original: true, isNew: true, limited: 'yato' },
  };
  S.MODE_ORDER = ['raid', 'seal', 'park', 'turf', 'zone', 'escort', 'soccer', 'battery', 'elim', 'escape4', 'escape8'];
  S.teamsOf = (mode) => (S.MODES[mode] && S.MODES[mode].teams) || 2;
  S.isEscape = (mode) => mode === 'escape4' || mode === 'escape8';
  // ---------------- 1.6：搜刮撤离 ----------------
  //   物资 5 种品质；size = 占几格背包；v = 价值（卖给仓库得 v/10 金币）；ex = 可以兑换的特殊奖励
  S.LOOT = {
    duration: 420, bag: 10, pickR: 28, extTime: 10, extR: 70, opens: [180, 230, 280, 330], guardTeam: 5,
    rare: [null, { name: '普通', c: '#c9ccd4' }, { name: '优良', c: '#5ee36a' }, { name: '稀有', c: '#4fb8ff' }, { name: '史诗', c: '#b78cff' }, { name: '传说', c: '#ffc531' }],
    items: {
      scrap: { name: '废旧零件', r: 1, size: 1, v: 60 }, can: { name: '空涂料罐', r: 1, size: 1, v: 80 }, battery: { name: '旧电池', r: 1, size: 1, v: 100 }, cable: { name: '电缆卷', r: 1, size: 2, v: 160 },
      neon: { name: '霓虹灯管', r: 2, size: 1, v: 240 }, circuit: { name: '电路板', r: 2, size: 1, v: 280 }, toolbox: { name: '工具箱', r: 2, size: 2, v: 420 }, spray: { name: '专业喷枪', r: 2, size: 1, v: 320 },
      engine: { name: '机甲引擎', r: 3, size: 2, v: 800 }, drive: { name: '加密硬盘', r: 3, size: 1, v: 700 }, rarepaint: { name: '限定喷漆', r: 3, size: 1, v: 650 }, optic: { name: '狙击镜', r: 3, size: 1, v: 720 },
      qchip: { name: '量子芯片', r: 4, size: 1, v: 1600 }, proto: { name: '原型装甲', r: 4, size: 3, v: 2600 }, radio: { name: '古董收音机', r: 4, size: 2, v: 1900 }, cell: { name: '能量电池组', r: 4, size: 2, v: 2000 },
      goldcan: { name: '黄金涂鸦罐', r: 5, size: 1, v: 4500, ex: { gems: 40 } }, reactor: { name: '核心反应堆', r: 5, size: 4, v: 9000, ex: { crystals: 1, gems: 60 } }, files: { name: '灰城机密档案', r: 5, size: 1, v: 6000, ex: { crystals: 1 } },
    },
    // 物资点品质 → 各品质的权重
    tiers: { 1: [0, 70, 25, 5, 0, 0], 2: [0, 40, 40, 17, 3, 0], 3: [0, 0, 35, 40, 22, 3], 5: [0, 0, 0, 0, 50, 50] },
    // 军需处：用金币买的装备，只能带进「高危」行动，阵亡会丢
    gear: {
      armor: { name: '战术护甲', price: 600, desc: '机体生命 +25%' },
      pack: { name: '扩容背包', price: 400, desc: '背包 +6 格' },
      kit: { name: '急救包', price: 200, desc: '生命低于 30% 时自动回复 60 生命（一次）' },
    },
    risks: { normal: { name: '普通行动', desc: '阵亡只丢这局搜到的物资' }, high: { name: '高危行动', desc: '物资更多、品质更高，可以带装备进场，但阵亡时装备也会丢' } },
  };
  S.lootItem = (k) => S.LOOT.items[k];
  S.LOOT_KEYS = Object.keys(S.LOOT.items);
  S.lootValue = (items) => (items || []).reduce((a, k) => a + ((S.LOOT.items[k] || {}).v || 0), 0);
  S.lootSlots = (items) => (items || []).reduce((a, k) => a + ((S.LOOT.items[k] || {}).size || 1), 0);
  // 按物资点品质抽一件物资（高危：30% 概率升一档）
  S.rollLoot = (tier, high, rnd) => {
    rnd = rnd || Math.random;
    const w = S.LOOT.tiers[tier] || S.LOOT.tiers[1], tot = w.reduce((a, b) => a + b, 0);
    let x = rnd() * tot, r = 1;
    for (let i = 1; i < w.length; i++) { x -= w[i]; if (x < 0) { r = i; break; } }
    if (high && r < 5 && rnd() < 0.3) r++;
    const pool = S.LOOT_KEYS.filter((k) => S.LOOT.items[k].r === r);
    return pool[Math.floor(rnd() * pool.length)];
  };
  // 多队模式的涂料颜色（第 1–8 队）
  S.TEAM8 = [null, '#ff3ea5', '#1fd6ee', '#ffdf2e', '#9cff2e', '#ff8a1f', '#8c5cff', '#ff3b52', '#3a6dff'];
  S.TEAM8_NAMES = [null, '粉队', '青队', '黄队', '绿队', '橙队', '紫队', '红队', '蓝队'];
  // 逃亡圈：毒圈阶段（等待秒数、收缩秒数、收缩到初始半径的比例、圈外每秒伤害）
  S.ESCAPE = { stages: [[32, 18, 0.62, 6], [24, 16, 0.4, 9], [18, 14, 0.24, 13], [14, 12, 0.12, 18], [10, 10, 0.05, 26]], crateHeal: 40, crateDmg: 0.1, crateHp: 0.1, maxCubes: 8 };
  S.ELIM = { wins: 2, roundTime: 90, pause: 3 };
  S.ZONE = { x0: 52, y0: 32, x1: 68, y1: 48 };             // 据点（格子坐标，右/下不含）
  S.SOCCER_GOAL = { depth: 56, half: 140 };                // 球门：距边缘深度、半高
  S.ESCORT_TARGET = 3; S.SOCCER_TARGET = 5; S.BATTERY_TARGET = 40;
  // 乐园模式：花车沿路线巡游（格子坐标），光圈半径、每秒得分、气球分数、目标分
  // 1.8：咒灵讨伐 / 封印争夺
  S.RAID = { hp: 10000, r: 46, time: 240, rage: 0.5 };   // 百目（玩家方总是 4 人：真人 + AI 补位）
  S.SEAL = { target: 25, carry: 6, spiritMax: 5, spiritT: 6, stoneT: 7, stoneMax: 8, drop: 2, team: 3 };
  S.PARK = { path: [[38, 22], [82, 22], [82, 58], [38, 58]], loop: 64, r: 92, tick: 1, balloon: 3, target: 100, maxBalloons: 6, balloonT: 3.5 };

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
    // ---- 1.2：新地图 ----
    {
      name: '地铁中转站', desc: '午夜的地下中转站：两条站台高台夹着中间的轨道层，楼梯和通道连起上下两层，柱子后面最好埋伏。', goalX: 30, sky: 9, isNew: true,
      rects: [[12, 10, 20, 4, 2], [12, 66, 20, 4, 2], [36, 10, 4, 4, 3], [36, 66, 4, 4, 3], [22, 30, 2, 2, 3], [22, 48, 2, 2, 3], [34, 30, 2, 2, 3], [34, 48, 2, 2, 3],
        [46, 22, 10, 3, 2], [46, 55, 10, 3, 2], [44, 36, 3, 8, 1], [6, 22, 6, 2, 1]],
      stairs: [[14, 14, 4, 7, 'N', 2], [26, 59, 4, 7, 'S', 2], [48, 25, 4, 7, 'N', 2], [48, 48, 4, 7, 'S', 2]],
      pads: [[30, 40, 0], [10, 70, 20]],
      bush: [[26, 18, 5, 4], [40, 40, 3, 4], [16, 46, 4, 5], [52, 64, 5, 4]],
    },
    {
      name: '灰石总部', desc: '灰石集团的总部大楼前：两座办公塔居高临下，玻璃幕墙之间是开阔的广场，喷泉池挡住中路的视线。', goalX: 28, sky: 7, isNew: true,
      rects: [[16, 6, 8, 10, 3], [16, 64, 8, 10, 3], [28, 18, 6, 6, 2], [28, 56, 6, 6, 2], [40, 34, 3, 3, 1], [40, 43, 3, 3, 1], [48, 12, 6, 3, 1], [48, 65, 6, 3, 1],
        [10, 30, 2, 6, 1], [10, 44, 2, 6, 1], [36, 8, 2, 8, 3], [36, 64, 2, 8, 3]],
      stairs: [[28, 24, 6, 7, 'N', 2], [28, 49, 6, 7, 'S', 2]],
      pads: [[44, 40, 0], [26, 40, 330]],
      bush: [[8, 12, 6, 5], [8, 63, 6, 5], [44, 22, 5, 5], [44, 53, 5, 5], [32, 38, 4, 4]],
    },
    {
      name: '夜市长街', desc: '灯笼挂满的夜市长街：一排排小吃摊隔出窄巷，摊位顶棚可以站人，草丛般的盆栽到处都是。', goalX: 26, sky: 2, isNew: true,
      rects: [[14, 14, 4, 4, 1], [20, 14, 4, 4, 1], [26, 14, 4, 4, 1], [14, 62, 4, 4, 1], [20, 62, 4, 4, 1], [26, 62, 4, 4, 1], [36, 24, 3, 12, 2], [36, 44, 3, 12, 2],
        [46, 8, 8, 3, 1], [46, 69, 8, 3, 1], [50, 36, 2, 2, 3], [50, 42, 2, 2, 3], [8, 4, 4, 4, 2]],
      stairs: [[29, 26, 7, 4, 'E', 2], [29, 50, 7, 4, 'E', 2]],
      pads: [[24, 40, 0], [44, 18, 330]],
      bush: [[14, 20, 16, 3], [14, 57, 16, 3], [42, 30, 4, 6], [42, 44, 4, 6], [4, 10, 4, 6], [54, 20, 4, 4]],
    },
    {
      name: '欢乐乐园', desc: '乐园祭的主会场：中央旋转木马、摩天轮底座和售票亭，花车绕着木马巡游。乐园模式默认在这里。', goalX: 24, sky: 10, isNew: true, park: true,
      rects: [[51, 32, 6, 5, 1], [51, 43, 6, 5, 1], [28, 8, 6, 6, 3], [16, 30, 4, 4, 1], [16, 46, 4, 4, 1], [42, 3, 14, 3, 1], [8, 18, 3, 8, 2], [64, 66, 6, 3, 1]],
      stairs: [],
      pads: [[30, 40, 0], [48, 12, 330]],
      bush: [[44, 26, 6, 3], [44, 51, 6, 3], [22, 12, 4, 6], [6, 32, 4, 8], [30, 64, 8, 3]],
    },
  ];
  // 1.8：夜都决战的地图（插在普通地图的最后）
  S.MAPS.push({
    name: '夜都十字路口', desc: '深夜的夜都十字路口：四栋高楼夹着空旷的路口，两侧有天桥和神社石台，翻倒的车辆是最好的掩体。', goalX: 26, sky: 11, isNew: true, event: 'yato',
    rects: [[18, 8, 8, 8, 3], [18, 64, 8, 8, 3], [34, 20, 10, 6, 3], [34, 54, 10, 6, 3], [46, 36, 3, 8, 1], [10, 30, 6, 6, 2], [10, 44, 6, 6, 2],
      [28, 36, 4, 3, 1], [28, 41, 4, 3, 1], [50, 10, 8, 3, 2], [50, 67, 8, 3, 2], [40, 4, 3, 3, 1], [40, 73, 3, 3, 1]],
    stairs: [[11, 23, 4, 7, 'S', 2], [11, 50, 4, 7, 'N', 2], [52, 13, 4, 7, 'N', 2], [52, 60, 4, 7, 'S', 2]],
    pads: [[44, 30, 0], [24, 28, 330]],
    bush: [[26, 18, 6, 4], [26, 58, 6, 4], [44, 22, 4, 5], [44, 53, 4, 5], [4, 6, 5, 5], [4, 69, 5, 5]],
  });
  S.MAP_N = S.MAPS.length;   // 普通地图数量（之后追加的是搜刮撤离用的超大地图）
  // ---------------- 1.6：地图尺寸切换 ----------------
  const DIM_HOOKS = [];
  S.onDims = (f) => { DIM_HOOKS.push(f); f(); };
  S.useDims = (gw, gh) => {
    if (gw === GW && gh === GH) return;
    GW = gw; GH = gh; S.GW = gw; S.GH = gh; S.W = gw * CELL; S.H = gh * CELL;
    for (const f of DIM_HOOKS) f();
  };
  S.mapDims = (i) => { const m = S.MAPS[i] || S.MAPS[0]; return [m.gw || 120, m.gh || 80]; };
  S.useMap = (M) => { if (M && M.gw) S.useDims(M.gw, M.gh); };
  S.isLootMap = (i) => !!(S.MAPS[i] && S.MAPS[i].loot);
  // ---------------- 1.6：搜刮撤离的超大地图（按种子生成，保证全图连通） ----------------
  function genLootMap(seed, theme) {
    let st = seed >>> 0;
    const R = () => { st = (st * 1664525 + 1013904223) >>> 0; return st / 4294967296; };
    const RI = (a, b) => a + Math.floor(R() * (b - a + 1));
    const gw = 240, gh = 160, cx = gw / 2, cy = gh / 2;
    const rects = [], stairs = [], bush = [], pads = [];
    const occ = new Uint8Array(gw * gh);   // 已经放了东西（含留白通道）
    const keep = [];                       // 不能放东西的区域：出生点、撤离点、中心
    const free = (x, y, w, h, m = 1) => {
      if (x < 2 || y < 2 || x + w > gw - 2 || y + h > gh - 2) return false;
      for (const k of keep) if (x < k[0] + k[2] && x + w > k[0] && y < k[1] + k[3] && y + h > k[1]) return false;
      for (let j = y - m; j < y + h + m; j++) for (let i = x - m; i < x + w + m; i++) if (i >= 0 && j >= 0 && i < gw && j < gh && occ[j * gw + i]) return false;
      return true;
    };
    const mark = (x, y, w, h) => { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) if (i >= 0 && j >= 0 && i < gw && j < gh) occ[j * gw + i] = 1; };
    const add = (x, y, w, h, l) => { rects.push([x, y, w, h, l]); mark(x, y, w, h); };
    // 四个角是四支小队的出生点，四条边中间是撤离点（第 3 分钟起陆续开放），中间是危险区
    const spawns = [[14, 14], [gw - 14, 14], [14, gh - 14], [gw - 14, gh - 14]];
    const extract = [[cx, 9], [gw - 9, cy], [cx, gh - 9], [9, cy]];
    for (const [x, y] of spawns) keep.push([x - 9, y - 9, 18, 18]);
    for (const [x, y] of extract) keep.push([x - 7, y - 7, 14, 14]);
    const spots = [], guards = [];
    // ===== 中心危险区 =====
    if (theme === 'harbor') {
      // 货轮：一块长长的高台甲板，两头有楼梯；甲板上是金色物资，周围有守卫
      const sx = cx - 22, sy = cy - 7;
      add(sx, sy, 44, 14, 2);
      add(sx + 16, sy + 4, 4, 6, 3); add(sx + 26, sy + 4, 4, 6, 3);   // 船舱
      stairs.push([sx - 7, sy + 2, 7, 3, 'E', 2], [sx + 44, sy + 9, 7, 3, 'W', 2]);
      mark(sx - 7, sy + 2, 7, 3); mark(sx + 44, sy + 9, 7, 3);
      keep.push([sx - 12, sy - 6, 68, 26]);
      for (const [x, y] of [[sx + 6, sy + 7], [sx + 23, sy + 7], [sx + 38, sy + 7]]) spots.push([x, y, 5, 2]);
      for (const [x, y] of [[sx - 4, sy - 4], [sx + 48, sy + 17], [sx + 22, sy - 4], [sx + 22, sy + 17]]) guards.push([x, y, 0]);
      // 两座吊臂（高墙）
      add(sx + 8, sy - 10, 2, 6, 3); add(sx + 34, sy + 18, 2, 6, 3);
    } else {
      // 反应堆大厅：中间一圈高台围着反应堆（高墙），外面有楼梯和弹跳板
      //   1.8：东西两边各开一个 4 格宽的门洞（地面直接走进走出），里面也有两段楼梯上高台——不会再掉进去出不来
      add(cx - 4, cy - 4, 8, 8, 3);
      for (const [x, y, w, h] of [[cx - 16, cy - 16, 32, 6], [cx - 16, cy + 10, 32, 6], [cx - 16, cy - 10, 6, 8], [cx - 16, cy + 2, 6, 8], [cx + 10, cy - 10, 6, 8], [cx + 10, cy + 2, 6, 8]]) add(x, y, w, h, 2);
      stairs.push([cx - 3, cy - 23, 3, 7, 'S', 2], [cx, cy + 16, 3, 7, 'N', 2], [cx - 9, cy - 10, 3, 6, 'N', 2], [cx + 6, cy + 4, 3, 6, 'S', 2]);
      mark(cx - 3, cy - 23, 3, 7); mark(cx, cy + 16, 3, 7);
      pads.push([cx - 24, cy - 1, 0], [cx + 22, cy - 1, 180]);
      keep.push([cx - 28, cy - 26, 56, 52]);
      for (const [x, y] of [[cx - 13, cy - 13], [cx + 12, cy - 13], [cx - 13, cy + 12], [cx + 12, cy + 12], [cx - 7, cy]]) spots.push([x, y, 5, 2]);
      for (const [x, y] of [[cx - 8, cy - 8], [cx + 8, cy + 8], [cx + 8, cy - 8], [cx - 8, cy + 8]]) guards.push([x, y, 0]);
    }
    // ===== 建筑群 =====
    // 仓库 / 实验室：四面墙、每面留门（3 格宽），里面放物资
    const nRooms = theme === 'harbor' ? 9 : 16;
    for (let k = 0, tries = 0; k < nRooms && tries < 600; tries++) {
      const w = RI(theme === 'harbor' ? 14 : 12, theme === 'harbor' ? 22 : 18), h = RI(10, 15), x = RI(4, gw - w - 4), y = RI(4, gh - h - 4);
      if (!free(x, y, w, h, 3)) continue;
      k++;
      const l = 3, dTop = RI(2, w - 5), dBot = RI(2, w - 5), dL = RI(2, h - 5), dR = RI(2, h - 5);
      add(x, y, dTop, 1, l); add(x + dTop + 3, y, w - dTop - 3, 1, l);
      add(x, y + h - 1, dBot, 1, l); add(x + dBot + 3, y + h - 1, w - dBot - 3, 1, l);
      add(x, y + 1, 1, dL, l); add(x, y + dL + 4, 1, h - dL - 5, l);
      add(x + w - 1, y + 1, 1, dR, l); add(x + w - 1, y + dR + 4, 1, h - dR - 5, l);
      mark(x, y, w, h);
      // 房间里：一两个货架（矮台）+ 物资点
      add(x + 3, y + 3, 2, h - 6, 1);
      const tier = Math.hypot(x + w / 2 - cx, y + h / 2 - cy) < 60 ? 3 : 2;
      spots.push([x + Math.floor(w / 2) + 1, y + Math.floor(h / 2), tier, 3]);
      if (R() < 0.5) spots.push([x + w - 4, y + 3, tier, 1]);
    }
    // 集装箱 / 机柜：散落的方块（矮台 / 高台 / 墙），形成掩体和小巷
    const nBox = theme === 'harbor' ? 150 : 110;
    for (let k = 0, tries = 0; k < nBox && tries < 4000; tries++) {
      const horiz = R() < 0.5, w = horiz ? RI(5, 8) : RI(2, 3), h = horiz ? RI(2, 3) : RI(5, 8);
      const x = RI(3, gw - w - 3), y = RI(3, gh - h - 3);
      if (!free(x, y, w, h, 2)) continue;
      k++;
      const r = R(), l = r < 0.45 ? 1 : r < 0.75 ? 2 : 3;
      add(x, y, w, h, l);
      if (R() < 0.18) spots.push([horiz ? x + RI(0, w - 1) : x + w + 1, horiz ? y + h + 1 : y + RI(0, h - 1), Math.hypot(x - cx, y - cy) < 50 ? 3 : 1, 1]);
    }
    // 草丛 + 弹跳板
    for (let k = 0, tries = 0; k < 34 && tries < 2000; tries++) {
      const w = RI(3, 7), h = RI(3, 6), x = RI(3, gw - w - 3), y = RI(3, gh - h - 3);
      if (!free(x, y, w, h, 1)) continue;
      k++; bush.push([x, y, w, h]); mark(x, y, w, h);
    }
    for (let k = 0, tries = 0; k < 8 && tries < 800; tries++) {
      const x = RI(6, gw - 8), y = RI(6, gh - 8);
      if (!free(x, y, 2, 2, 2)) continue;
      k++; pads.push([x, y, Math.round(Math.atan2(cy - y, cx - x) * 180 / Math.PI)]); mark(x, y, 2, 2);
    }
    // 野外零散物资：越靠中间品质越高
    for (let k = 0, tries = 0; k < 70 && tries < 3000; tries++) {
      const x = RI(4, gw - 5), y = RI(4, gh - 5);
      if (!free(x, y, 1, 1, 1)) continue;
      const d = Math.hypot(x - cx, y - cy) / Math.hypot(cx, cy);
      spots.push([x, y, d < 0.3 ? 3 : d < 0.6 ? 2 : 1, 1]); k++;
    }
    // ===== 连通性：被高墙围死的空地填成墙 =====
    const wall = new Uint8Array(gw * gh);
    for (const [x, y, w, h, l] of rects) if (l === 3) for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) wall[j * gw + i] = 1;
    const seen = new Uint8Array(gw * gh), q = [spawns[0][1] * gw + spawns[0][0]];
    seen[q[0]] = 1;
    while (q.length) {
      const c = q.pop(), x0 = c % gw, y0 = (c / gw) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const x = x0 + dx, y = y0 + dy, n = y * gw + x;
        if (x < 0 || y < 0 || x >= gw || y >= gh || seen[n] || wall[n]) continue;
        seen[n] = 1; q.push(n);
      }
    }
    for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) {
      if (wall[y * gw + x] || seen[y * gw + x]) continue;
      let w = 1; while (x + w < gw && !wall[y * gw + x + w] && !seen[y * gw + x + w]) w++;
      rects.push([x, y, w, 1, 3]); for (let i = 0; i < w; i++) wall[y * gw + x + i] = 1;
      x += w - 1;
    }
    const okSpot = (s2) => !wall[s2[1] * gw + s2[0]];
    return { rects, stairs, bush, pads, gw, gh, nomirror: true, loot: { spawns, extract, spots: spots.filter(okSpot), guards } };
  }
  const LOOT_DEFS = [
    { name: '废弃港口', desc: '超大地图：集装箱迷宫和废弃仓库，中央的货轮甲板上有金色物资，但有守卫看守。', sky: 2, seed: 7341, theme: 'harbor', isNew: true },
    { name: '地下研究所', desc: '超大地图：一间间实验室和走廊，中央反应堆大厅藏着最值钱的东西，守卫重重。', sky: 8, seed: 9127, theme: 'lab', isNew: true },
  ];
  for (const d of LOOT_DEFS) S.MAPS.push(Object.assign({ goalX: 24 }, d, genLootMap(d.seed, d.theme)));
  const DIR_FLIP = { E: 'W', W: 'E', N: 'S', S: 'N' };
  const mirror0 = (r) => [GW - r[0] - r[2], GH - r[1] - r[3], r[2], r[3]];
  S.PAD = { v: 560, push: 360 };
  S.STAIR_LV = 4;   // 楼梯格的样式编号
  // M = { top: 每格顶面高度, solid: 高墙, lv: 样式（0 地面 1 矮台 2 高台 3 高墙 4 楼梯）, pad: 弹跳板方向+1, rects, stairs, pads, bush }
  S.buildMap = function (mapIdx) {
    const m = S.MAPS[mapIdx];
    S.useDims(m.gw || 120, m.gh || 80);
    const mirror = m.nomirror ? (r) => r.slice(0, 4) : mirror0;
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
      for (const [rx, ry, rw, rh, d] of m.nomirror ? [[x, y, w, h, dir]] : [[x, y, w, h, dir], mirror(st).concat(DIR_FLIP[dir])]) {
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
      for (const [px, py, a] of m.nomirror ? [[x, y, ang]] : [[x, y, ang], [GW - x - 2, GH - y - 2, ang + 180]]) {
        pads.push([px, py, ((a % 360) + 360) % 360]);
        const code = 1 + Math.round(((((a % 360) + 360) % 360) / 360) * 250) % 251;
        for (let j = py; j < py + 2; j++) for (let i = px; i < px + 2; i++) if (S.inBounds(i, j) && top[j * GW + i] === 0) pad[j * GW + i] = code;
      }
    }
    // 草丛：只长在地面上，进去之后敌人看不见你（靠得很近或你攻击时会暴露）
    const bush = new Uint8Array(GW * GH), bushes = [];
    for (const r of m.bush || []) {
      for (const rr of m.nomirror ? [r] : [r, mirror(r)]) {
        bushes.push(rr);
        for (let j = rr[1]; j < rr[1] + rr[3]; j++)
          for (let i = rr[0]; i < rr[0] + rr[2]; i++)
            if (i >= 0 && i < GW && j >= 0 && j < GH && !top[j * GW + i] && !pad[j * GW + i]) bush[j * GW + i] = 1;
      }
    }
    return { top, solid, lv, rects, stairs, pad, pads, bush, bushes, gw: GW, gh: GH, loot: m.loot || null };
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
    wheelDry: { acc: 820, brake: 1150, coast: 900 },      // 无涂料地面上的滚轮（1.6：起步更跟手）
    sticky: { acc: 520, brake: 2600, coast: 2600 },       // 敌方涂料：又黏又慢
    air: { acc: 640, brake: 700, coast: 90 },             // 空中：保留动量，少量空中控制（1.6：空中转向更灵）
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
  // 1.9：表现评分（击毁 / 涂地 / 目标 / 助攻 − 倒下）和结算评级：MVP > 钻石标 > 黄金标 > 白银标 > 青铜标
  // 2.0：涂地占比下调（每 5 格涂地 = 1 分；一局涂 2500 格约等于 5 次击倒）
  S.perfScore = (p) => Math.max(0, Math.round((p.kills || 0) * 100 + (p.paint || 0) * 0.2 + (p.obj || 0) * 150 + (p.assists || 0) * 60 - (p.deaths || 0) * 40));
  S.BADGES = [
    { id: 'bronze', name: '青铜标', c: '#c27a3e' }, { id: 'silver', name: '白银标', c: '#cfd8e2' }, { id: 'gold', name: '黄金标', c: '#ffcf3a' },
    { id: 'diamond', name: '钻石标', c: '#7ae0ff' }, { id: 'mvp', name: 'MVP', c: '#ff5aa8' },
  ];
  S.badgesOf = function (result) {
    const ps = result.players.filter((p) => !p.npc), top = Math.max(1, ...ps.map(S.perfScore)), out = {};
    const mv = new Set(), teams = result.winner && !result.place ? [...new Set(ps.map((p) => p.team))] : result.winner ? [result.winner] : [];
    for (const t of teams) { const m = S.mvpOf(result, t); if (m) mv.add(m.id); }
    for (const p of ps) {
      const f = S.perfScore(p) / top;
      out[p.id] = mv.has(p.id) ? 4 : f >= 0.75 ? 3 : f >= 0.5 ? 2 : f >= 0.25 ? 1 : 0;
    }
    return out;
  };
  S.mvpOf = function (result, team) {   // 默认是胜方 MVP；传 team 就是那一队的最佳（1.9：败方 MVP）
    if (team == null) team = result.winner;
    const val = (p) => S.perfScore(p) + 0.001 * (p.kills * 100 + p.paint * 0.2 + p.obj * 150);
    let mvp = null;
    for (const p of result.players) if (p.team === team && !p.npc && (!mvp || val(p) > val(mvp))) mvp = p;
    return mvp;
  };
  S.matchReward = function (result, pid) {
    const me = result.players.find((p) => p.id === pid);
    if (!me) return null;
    const won = result.winner === me.team, draw = !result.winner, mvp = S.mvpOf(result);
    const lm = !won && !draw && !result.place && result.mode !== 'loot' ? S.mvpOf(result, me.team) : null;
    const isMvp = !!(mvp && mvp.id === pid) || !!(lm && lm.id === pid);   // 1.9：败方 MVP 也算（排位输了只扣一半）
    if (result.mode === 'loot') {   // 1.6：搜刮撤离——撤离成功才有物资；奖杯按是否撤离
      const L = (result.loot && result.loot.players[pid]) || { ex: false, items: [] };
      const v = L.ex ? S.lootValue(L.items) : 0;
      return { xp: 60 + me.kills * 12 + (L.ex ? 80 + Math.min(120, Math.floor(v / 100)) : 0), trophies: L.ex ? 6 : -2, won: L.ex, draw: false, mvp: isMvp, kills: me.kills, paint: me.paint, mode: 'loot',
        loot: { ex: !!L.ex, items: L.ex ? L.items.slice(0, 40) : [], v, risk: result.loot ? result.loot.risk : 'normal', gear: L.gear || [] } };
    }
    // 逃亡圈按名次：四队 +10/+5/0/−3，单人 +10/+7/+4/+2/0/−2/−3/−4
    if (result.place) {
      const rank = result.place.indexOf(me.team) + 1, n = result.place.length;
      const table = n <= 4 ? [10, 5, 0, -3] : [10, 7, 4, 2, 0, -2, -3, -4];
      const xp = 60 + Math.max(0, n - rank) * 15 + me.kills * 10 + Math.floor(me.paint / 25) + (isMvp ? 40 : 0);
      return { xp, trophies: table[rank - 1] || 0, won: rank === 1, draw: false, mvp: isMvp, kills: me.kills, paint: me.paint, rank, of: n, mode: result.mode, cubes: me.cubes || 0 };
    }
    const xp = 60 + (won ? 60 : draw ? 30 : 0) + me.kills * 10 + Math.floor(me.paint / 25) + me.obj * 12 + (isMvp ? 40 : 0);
    const trophies = won ? S.TROPHY_WIN : draw ? S.TROPHY_DRAW : -S.TROPHY_LOSS;
    const raid = result.mode === 'raid';   // 1.8：合作讨伐不扣奖杯
    return { xp: xp + Math.min(60, me.float || 0), trophies: raid ? (won ? 5 : 0) : trophies, won, draw, mvp: isMvp, kills: me.kills, paint: me.paint, mode: result.mode, balloons: me.balloons || 0, float: me.float || 0, ranked: !!result.ranked,
      seals: me.seals || 0, spirits: me.spirits || 0 };
  };
  // 强度参考（AI 在排位赛禁用阶段用）：tools/balance.js 跑出来的胜率
  S.META = {"pilots":{"fu":0.558,"yuzu":0.534,"aurora":0.532,"flag":0.527,"hex":0.521,"candy":0.521,"gale":0.521,"blaze":0.517,"frost":0.512,"vet":0.508,"titan":0.497,"chef":0.478,"raven":0.477,"aka":0.475,"kaka":0.472,"echo":0.46,"hammer":0.459,"han":0.434},"mechs":{"blaster":0.574,"gatling":0.569,"charger":0.555,"dozer":0.553,"stinger":0.548,"roller":0.541,"megaphone":0.525,"bucket":0.523,"blade":0.521,"mortar":0.5,"reaper":0.476,"slinger":0.462,"fist":0.461,"wrecker":0.449,"flamer":0.448,"carrier":0.445,"phantom":0.438,"warden":0.438,"riot":0.428}};
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
  S.VERSION = '2.0';
  // 每条公告：zh 写在 sections 里；en（可选）是英文版。官网（site/）和游戏里的公告用的是同一份数据
  S.PATCH_NOTES = [
    { v: '2.0', date: '2026-11-16', title: '2.0 更新 · 机兵个性', en_title: 'Update 2.0 · Mech Identity', sections: [
      ['每台机体都不一样了', [
        '19 台机体各自有了专属的开火声、命中声和大招声：喷罐的嘶啪、旋转机兵的哒哒哒、狙击的轨道炮、拆楼锤的沉重一抡、喇叭车的嗡鸣……别人开火也听得见，越近越响',
        '每台机体的手感不同：后坐力震屏从旋转机兵的轻微抖动到拆楼锤、狙击的重重一震',
        '专属的枪口火光、弹道和命中效果：喷火罐车喷出火焰和黑烟、毒针拖着绿色毒线、喇叭车一圈圈音波、旋转机兵曳光弹和弹壳、母舰的发射硝烟、盾卫的电火花、结界机兵的金色符光',
        '近战挥击也各有样子：重拳的冲击波、拆楼锤的大范围扫击和尘土、影刃的紫色细斩、灵刃的灵气刀光',
        '每个驾驶员技能也有了自己的音效']],
      ['新的攻击特性（机体页面可以看到）', [
        '喷罐机兵「爆裂收尾」：每轮第 5 发是爆裂弹，伤害 ×1.4、涂地更大',
        '旋转机兵「枪管预热」：一轮 12 发伤害从 72% 涨到 110%',
        '狙击机兵「穿甲弹」：蓄力 90% 以上贯穿第一个敌人，后面的敌人受到 70% 伤害',
        '泼桶机兵「近身爆发」：110 距离内命中伤害 +20%',
        '迫击机兵「黏稠墨水」：炸开的地方让敌人减速 1.2 秒',
        '重拳机兵「三连上勾拳」：连续第 3 拳伤害 ×1.3，把敌人打飞到空中',
        '喷火罐车「点燃」：命中的敌人着火 2 秒，每 0.5 秒掉 3 血',
        '拆楼锤「震荡」：砸中的敌人减速 0.8 秒',
        '喇叭车「声纳」：被音波打中的敌人暴露 2 秒',
        '其余机体原有的特点也整理成了特性：甩刷冲锋、弹跳炮弹、推土铲、追踪弹、正面护盾、背刺、毒素、伏击、符印束缚、三连回旋斩']],
      ['攻击范围看得见', [
        '近战机体每次挥击都会在地上画出真实的命中扇形，其他玩家也看得到',
        '敌方近战机体靠近你时，脚下会显示它的攻击距离和朝向；大摆锤旋转时显示旋转范围',
        '着火、被符印束缚的敌人身上有明显的特效']],
      ['界面与修复', [
        '大招 / 超载横幅移到屏幕右上角斜放，不再挡住中间的视线',
        '修复记分板（Tab / 手机记分板按钮）的数据一直是 0：1.9 版本的开局倒计时改动不小心让对局计时器失效了，这也让其他玩家的移动不够平滑、搜刮撤离的物资同步变慢。现在全部恢复',
        '记分板在手机上放到左边、避开触控按钮，人多时自动缩小行高，新增「助攻」一栏',
        '表现评分下调涂地的占比：每 5 格涂地算 1 分（以前 1 格 1 分），助攻 60 分；击倒和目标更重要了']],
      ['更流畅', [
        '新增 Windows 版：解压后双击「涂鸦机兵.bat」，用 Edge / Chrome 的独立应用窗口打开游戏，显卡加速、没有地址栏和插件拖慢；装了 Node.js 会自动开本地服务器',
        '自动调节画质：对局中帧率持续不够时，自动降低渲染分辨率和粒子数量，恢复后再调回来（设置里可以关）',
        '修复对局计时器后，其他玩家的移动恢复平滑插值']],
      ['平衡调整', [
        '喷罐机兵伤害 10.9 → 9.7（第 5 发爆裂弹 ×1.4），狙击机兵 92 → 88，滚刷机兵 23 → 22，泼桶机兵 12.7 → 12.3',
        '重拳机兵 57 → 60，弹弓机兵 46 → 49，推土机兵 15 → 16，母舰 26 → 27，防暴盾卫 21.5 → 23，结界机兵 17 → 18',
        '影刃机兵伤害 63 → 66、生命 145 → 160；幻影机兵伤害 21 → 22、生命 110 → 118']],
      ['更新奖励', ['信箱里有一份 2.0 更新礼包：150 宝石 + 军用箱 + 5 个传说碎片']],
    ], en: [
      ['Every mech feels different now', [
        'All 19 mechs have their own shot, hit and Super sounds — the Spray Bot’s hiss-pop, the Gatling Bot’s rattle, the Sniper Bot’s railgun, the Wrecking Hammer’s heavy swing, the Megaphone Truck’s hum… and you can hear other players’ mechs too, louder when they’re close',
        'Each mech has its own feel: recoil shake ranges from a light buzz on the Gatling Bot to a heavy kick on the Wrecking Hammer and Sniper Bot',
        'Unique muzzle flashes, projectile trails and impacts: flames and black smoke for the Flame Tanker, green toxin trails for the Venom Stinger, sound rings for the Megaphone Truck, tracers and shell casings for the Gatling Bot, launch smoke for the Drone Carrier, sparks for the Riot Guard, golden talisman light for the Warden',
        'Melee swings look different too: a shockwave for the Fist Bot, a wide sweep with dust for the Wrecking Hammer, thin purple slashes for the Shadow Blade and spirit arcs for the Spiritblade',
        'Every pilot skill has its own sound as well']],
      ['New attack traits (shown on each mech page)', [
        'Spray Bot “Explosive Finale”: the 5th shot of each burst is an explosive round, ×1.4 damage and bigger paint',
        'Gatling Bot “Spin-Up”: damage ramps from 72% to 110% across the 12-shot burst',
        'Sniper Bot “Armor Piercing”: shots charged above 90% pierce the first enemy and hit the one behind for 70%',
        'Bucket Bot “Point Blank”: +20% damage on hits within 110',
        'Mortar Bot “Sticky Ink”: the blast slows enemies for 1.2 s',
        'Fist Bot “Triple Uppercut”: every third punch in a row deals ×1.3 and launches the enemy into the air',
        'Flame Tanker “Ignite”: enemies hit catch fire for 2 s, losing 3 HP every 0.5 s',
        'Wrecking Hammer “Concussion”: enemies hit are slowed for 0.8 s',
        'Megaphone Truck “Sonar”: enemies hit by sound waves are revealed for 2 s',
        'The other mechs’ existing quirks are now listed as traits too: Flick Charge, Bouncing Shells, Dozer Blade, Homing Rounds, Front Shield, Backstab, Toxin, Ambush, Talisman Bind and Triple Spin Slash']],
      ['Visible attack ranges', [
        'Every melee swing now draws its real hit area on the ground, visible to everyone',
        'When an enemy melee mech gets close, its reach and facing show under it; the Wrecking Hammer’s spin shows its radius',
        'Burning and talisman-bound enemies have clear status effects']],
      ['UI and fixes', [
        'The Super / overload banner now sits diagonally in the top-right corner instead of covering the middle of the screen',
        'Fixed the scoreboard (Tab / phone scoreboard button) always showing 0: a 1.9 countdown change accidentally broke the match tick counter, which also made other players’ movement less smooth and slowed loot syncing in Extraction. All of that works again',
        'On phones the scoreboard now sits on the left, clear of the touch buttons, shrinks its rows when there are many players, and has a new Assists column',
        'Performance score: paint counts for less — 1 point per 5 cells painted (it used to be 1 per cell), assists are 60; takedowns and objectives matter more']],
      ['Smoother', [
        'New Windows download: unzip and double-click the launcher .bat file to open the game in its own Edge / Chrome app window with GPU acceleration and no toolbar or extensions; if Node.js is installed it starts a local server automatically',
        'Auto quality: if the frame rate stays low during a match, render resolution and particle count drop automatically and come back when things recover (can be turned off in Settings)',
        'With the match tick fixed, other players’ movement is smoothly interpolated again']],
      ['Balance', [
        'Spray Bot damage 10.9 → 9.7 (5th shot ×1.4), Sniper Bot 92 → 88, Roller Bot 23 → 22, Bucket Bot 12.7 → 12.3',
        'Fist Bot 57 → 60, Slinger Bot 46 → 49, Dozer Bot 15 → 16, Drone Carrier 26 → 27, Riot Guard 21.5 → 23, Warden 17 → 18',
        'Shadow Blade damage 63 → 66 and HP 145 → 160; Phantom damage 21 → 22 and HP 110 → 118']],
      ['Update reward', ['Your mailbox has an Update 2.0 gift: 150 gems + a Military Crate + 5 Legend Shards']],
    ] },
    { v: '1.9.1', date: '2026-11-15', title: '1.9.1 更新 · 简易领域 & 战力平衡', en_title: 'Update 1.9.1 · Simple Domain & Balance', sections: [
      ['符零新超载「简易领域」（替换「百符结界」）', [
        '以自己为中心展开半径 170 的领域，跟着符零移动：地上铺开金色符阵、八芒星和一圈立着的符纸，边缘有半透明的结界墙',
        '中和：飞进领域的敌方子弹、落进领域的炮弹和导弹全部被中和，队友站在里面也一样受保护',
        '自动反击：敌人一踏进领域就会被符咒斩自动反击——22 伤害（突破 II 后 ×1.25）、往外弹开、减速并封住技能；同一个敌人每 0.7 秒最多反击一次',
        '符零自己减伤 25%、伤害 +15%；展开时有专属的符阵铺开动画和音效']],
      ['新机体机制优化', [
        '结界机兵：同一个敌人连中 4 发符咒光弹会被「符印束缚」0.7 秒（几乎不能移动）并额外受到 16 伤害；伤害 16 → 17',
        '结界机兵大招「结界展开」：展开瞬间把里面的敌人弹出去并减速，队友（包括自己）获得 40 点护盾',
        '灵刃机兵：连续第 3 刀变成「回旋斩」——360° 范围、伤害 ×1.3、一次斩出三道刀气',
        '灵刃机兵大招「裂空斩」：出刀时人跟着刀光冲过去，冲刺途中短暂无敌']],
      ['机体战力平衡（根据 2100 局 AI 对战模拟）', [
        '削弱：喷罐机兵伤害 12 → 10.9，旋转机兵生命 110 → 100、移速 0.92 → 0.88，毒针机兵 9 → 8.4，泼桶机兵 13.3 → 12.7，狙击机兵 96 → 92，滚刷机兵 24 → 23（滚压 20 → 19）',
        '加强：影刃机兵伤害 54 → 63、攻击间隔 0.36 → 0.33 秒、生命 135 → 145；拆楼锤 68 → 78；防暴盾卫生命 150 → 160、伤害 20 → 21.5',
        '加强：幻影机兵 20 → 21，弹弓机兵 44 → 46，重拳机兵 55 → 57，喇叭车 23 → 25',
        '调整后机体胜率从 40%–60% 收窄到约 44%–56%']],
      ['驾驶员平衡', [
        '小柚：涂地给大招的充能 ×2 → +70%',
        '白夜：远距精准伤害 +20% → +15%',
        '岚：众志成城每名队友减伤 8% → 10%（最多 30%），范围 200 → 260',
        '韩冰：倒戈伤害 +8% → +14%；超载「反戈一击」减伤 20% → 25%、反弹 50% → 60%',
        '包大福：超载「满汉全席」每秒回复 8 → 10',
        '咒灵讨伐：百目生命 11000 → 10000',
        '调整后驾驶员胜率从 39%–58% 收窄到约 46%–53%；AI 的排位禁用参考数据也同步更新']],
      ['更新奖励', ['信箱里有一份 1.9.1 更新礼包：80 宝石 + 3 个传说碎片']],
    ], en: [
      ['Sigil’s new overload: Simple Domain (replaces Hundred-Talisman Ward)', [
        'Unfolds a domain with a 170 radius around Sigil that moves with her: a golden talisman circle, an eight-pointed star, a ring of standing talismans and a see-through barrier wall at the edge',
        'Neutralize: enemy shots that fly in, and shells or missiles that land inside, are all neutralized — teammates standing inside are protected too',
        'Auto-counter: enemies who step in are struck by a talisman slash automatically — 22 damage (×1.25 after Breakthrough II), knocked out, slowed and skill-sealed; at most once every 0.7 s per enemy',
        'Sigil takes 25% less damage and deals 15% more, with its own unfolding animation and sound']],
      ['New mech mechanics', [
        'Warden: an enemy hit by 4 talisman orbs in a row is Talisman-Bound for 0.7 s (barely able to move) and takes 16 extra damage; damage 16 → 17',
        'Warden Super Barrier Unfold: knocks enemies inside out and slows them, and gives allies (including you) a 40-point shield',
        'Spiritblade: every third swing in a row is a Spinning Slash — 360°, ×1.3 damage and three spirit waves at once',
        'Spiritblade Super Skyrend Slash: you now dash along with the blade, briefly invulnerable']],
      ['Mech balance (based on 2,100 simulated AI matches)', [
        'Nerfs: Spray Bot damage 12 → 10.9, Gatling Bot HP 110 → 100 and speed 0.92 → 0.88, Venom Stinger 9 → 8.4, Bucket Bot 13.3 → 12.7, Sniper Bot 96 → 92, Roller Bot 24 → 23 (rolling 20 → 19)',
        'Buffs: Shadow Blade damage 54 → 63, attack interval 0.36 → 0.33 s, HP 135 → 145; Wrecking Hammer 68 → 78; Riot Guard HP 150 → 160, damage 20 → 21.5',
        'Buffs: Phantom 20 → 21, Slinger Bot 44 → 46, Fist Bot 55 → 57, Megaphone Truck 23 → 25',
        'Mech win rates went from 40%–60% to about 44%–56%']],
      ['Pilot balance', [
        'Yuzu: Little Tagger — Super charge from painting ×2 → +70%',
        'Frost: Long Shot +20% → +15% damage',
        'Lan: Strength in Numbers damage reduction per ally 8% → 10% (up to 30%), range 200 → 260',
        'Han: Turncoat damage +8% → +14%; overload Turncoat Strike damage reduction 20% → 25%, reflect 50% → 60%',
        'Bao: overload Grand Feast healing per second 8 → 10',
        'Curse Raid: Hundred-Eyes HP 11000 → 10000',
        'Pilot win rates went from 39%–58% to about 46%–53%; the AI’s ranked ban data was updated to match']],
      ['Update reward', ['Your mailbox has an Update 1.9.1 gift: 80 gems + 3 Legend Shards']],
    ] },
    { v: '1.9', date: '2026-11-15', title: '1.9 更新 · 排位赛第一赛季「烈士」', en_title: 'Update 1.9 · Ranked Season 1 “Martyr”', sections: [
      ['排位赛第一赛季「烈士」', [
        '全新的排位赛界面：中间是你的大段位徽章和分数，左边是规则，右边是本时段玩法',
        '10 个段位：铜铁 → 白铁 → 黄铁 → 白金 → 黄金 → 钻石 → 星耀 → 荣誉传说 → 至尊传说 → 终末传说（铁段每段 100 分，金段 150 分，钻石 / 星耀 200 分，传说段 400 分）',
        '赢一局 +10 分，拿到 MVP 翻倍 +20；输一局 −5 分，钻石起输了扣 10 分；输了但拿到 MVP（败方 MVP）只扣一半',
        '黄铁及以下掉分不掉段；新赛季开始时分数减半（例如星耀 800 分 → 白金 400 分）']],
      ['夺冠之路', [
        '打到指定分数自动领奖：宝石、军用箱、特攻队补给箱、稀有赛季皮肤「烈士·战火」、金色空投、水晶……',
        '荣誉传说起每 200 分送 5 个传说碎片；集齐 20 个兑换赛季传说皮肤「烈士·不灭战旗」（带专属进场动作和战旗背景）',
        '打到终末传说送「终末传说框」']],
      ['MLBB 式禁用 / 选人', [
        '钻石起先进入禁用阶段：双方轮流各禁 2 个驾驶员或机体',
        '然后按 1-2-2-2-1 的顺序一个一个选人，双方加起来同一个驾驶员 / 机体只能出现一次',
        'AI 队友和对手也会选：有的秒选，有的想一想，有的犹豫半天换来换去，有的不小心挂机让系统帮选']],
      ['开局观察界面', [
        '每局开始前约 5 秒：左右两边是双方的驾驶员、机体、等级和皮肤品质，中间是你的驾驶员在 3D 里做进场动作',
        '排位赛还会显示本局被禁用的驾驶员和机体']],
      ['皮肤品质重做', [
        '品质分成：普通 → 稀有 → 史诗 → 赛季传说 → 传说 → 限定传说',
        '限定传说（夜都·封咒师、恶灵觉醒、冰沙女王）：专属进场动作、专属背景、主题粒子（冰雪 / 符纸 / 恶灵火）、主题脚印和击倒特效',
        '传说（金牌工头、红旗特装）：专属进场动作、更强的光环、子弹星光拖尾',
        '部分传说 / 限定传说皮肤有专属的开火声和命中声，手感也完全不同：金牌工头是金币叮当，红旗特装和烈士·不灭战旗是军鼓（带后坐震动），冰沙女王是冰晶风铃，夜都·封咒师是符纸破空，恶灵觉醒是恶灵低吼',
        '赛季传说（烈士·不灭战旗）：专属进场动作和背景，特效比传说稍弱',
        '史诗（午夜频道、冲浪少年、海滩偶像、夜都·学院生、月下符姬）：每套都有不一样的进场动作',
        '进场动作在角色页面（新按钮「✦ 进场动作」）、开局观察界面和开打瞬间的落地特效里都能看到']],
      ['结算评级', [
        '按表现评分（击毁、涂地、目标、助攻，减去倒下）给每个人评级：MVP、钻石标、黄金标、白银标、青铜标',
        '新增「助攻」数据：敌人倒下前 8 秒内打中过它就算助攻',
        '输的一方表现最好的人是「败方 MVP」']],
      ['更新奖励', ['信箱里有一份 1.9 更新礼包：100 宝石 + 特攻队补给箱 + 5 个传说碎片']],
    ], en: [
      ['Ranked Season 1 “Martyr”', [
        'A brand-new Ranked screen: your big tier badge and points in the middle, the rules on the left and the current mode on the right',
        '10 tiers: Rust Iron → Steel Iron → Brass Iron → Platinum → Gold → Diamond → Starlight → Honor Legend → Supreme Legend → Final Legend (100 points per iron tier, 150 per gold tier, 200 for Diamond / Starlight, 400 per legend tier)',
        'A win gives +10, doubled to +20 with MVP. A loss costs 5, or 10 from Diamond up. If you lose but are the losing-side MVP, you only lose half',
        'At Brass Iron and below you can lose points but never drop a tier. Points are halved when a new season starts (e.g. Starlight 800 → Platinum 400)']],
      ['Road to Glory', [
        'Rewards unlock automatically at each score: gems, a Military Crate, a Strike Team Chest, the rare season skin Martyr · Warfire, a Golden Airdrop, crystals…',
        'From Honor Legend, every 200 points gives 5 Legend Shards. Collect 20 to exchange for the Season Legendary skin Martyr · Undying Banner (with its own entrance and war-banner background)',
        'Reach Final Legend to get the Final Legend Frame']],
      ['MLBB-style bans and picks', [
        'From Diamond up, a ban phase comes first: each team bans 2 pilots or mechs, taking turns',
        'Then picks go one by one in a 1-2-2-2-1 order, and no pilot or mech can appear twice across both teams',
        'AI teammates and opponents pick too: some lock in instantly, some think for a moment, some hesitate and switch, and some go AFK and let the system pick']],
      ['Pre-match scouting screen', [
        'About 5 seconds before each match: both teams’ pilots, mechs, levels and skin rarities on either side, and your pilot doing their entrance in 3D in the middle',
        'Ranked also shows the pilots and mechs banned this match']],
      ['Skin rarity rework', [
        'Rarities are now: Common → Rare → Epic → Season Legendary → Legendary → Limited Legendary',
        'Limited Legendary (Night City · Sealer, Wraith Awakened, Sorbet Queen): unique entrance, unique background, themed particles (snow / talismans / wraith fire), themed footsteps and KO effects',
        'Legendary (Golden Foreman, Red Banner): unique entrance, a stronger halo and starlight bullet trails',
        'Some Legendary and Limited Legendary skins have their own shot and hit sounds and a completely different feel: coin clinks for Golden Foreman, war drums with recoil kick for Red Banner and Martyr · Undying Banner, crystal chimes for Sorbet Queen, paper-talisman whooshes for Night City · Sealer and a wraith growl for Wraith Awakened',
        'Season Legendary (Martyr · Undying Banner): unique entrance and background, with slightly lighter effects than Legendary',
        'Epic (Midnight Channel, Surf Kid, Beach Idol, Night City · Student, Moonlit Charm Maiden): each one has its own entrance',
        'See entrances on the pilot page (new “✦ Entrance” button), on the scouting screen, and in the drop-in effect when the match starts']],
      ['Match ratings', [
        'Everyone gets a rating from their performance score (takedowns, paint, objectives and assists, minus deaths): MVP, Diamond Badge, Gold Badge, Silver Badge or Bronze Badge',
        'New Assists stat: hitting an enemy in the 8 seconds before they go down counts as an assist',
        'The best player on the losing team is the losing-side MVP']],
      ['Update reward', ['Your mailbox has an Update 1.9 gift: 100 gems + a Strike Team Chest + 5 Legend Shards']],
    ] },
    { v: '1.8', date: '2026-11-15', title: '1.8 更新 · 夜都决战', en_title: 'Update 1.8 · Night City Showdown', sections: [
      ['联动活动「夜都决战」（14 天）', [
        '原创都市咒术风联动：午夜的夜都，咒灵从地铁站里涌了出来！',
        '新代币「灵符」：限时玩法每局给 10 灵符（赢了再 +5），其它模式每局 3 灵符',
        '活动任务：完成「咒灵讨伐成功 1 次」免费获得新驾驶员符零，打倒 25 只咒灵免费获得结界机兵',
        '7 天登录奖励：灵符、金币、军用箱、宝石、金色空投',
        '活动商店：联动皮肤、符纹机甲涂装、夜都结界框、封印符头像、宝箱和资源']],
      ['新驾驶员', [
        '符零「符咒」夜都符术师——技能「封印符」：甩出符阵，阵里的敌人减速、不能放技能和大招；被动「符咒共鸣」：打减速中的敌人伤害 +15%；超载「百符结界」：每秒放出一圈符咒',
        '赤镰「恶灵」恶灵宿主——技能「恶灵附身」：4 秒吸血 35%、加速、减伤；被动「恶灵低语」：残血时伤害 +20%；超载「灵化爆发」：伤害 +35%、每次命中回血',
        '两位都有全新的学院制服 3D 模型、立绘和随身武器（符纸飞镖 / 断骨短镰）']],
      ['新机体', [
        '结界机兵：连发两枚会减速的符咒光弹；大招「结界展开」——队友在结界里减伤 30%、每秒回血，敌人进来会减速',
        '灵刃机兵：挥刀时斩出灵能刀气，近身和中距离都能打；大招「裂空斩」——蓄力后一刀贯穿 520 距离的直线',
        '符零和结界机兵：活动任务免费获得；赤镰（480 宝石）和灵刃机兵（360 宝石）在活动页购买，一起买只要 720 宝石']],
      ['联动皮肤（都带约 20 秒的 3D 战斗动画）', [
        '传说：白夜「夜都·封咒师」、赤镰「恶灵觉醒」（皮肤商店，880 宝石）',
        '史诗：凌焰「夜都·学院生」、符零「月下符姬」（活动商店，灵符兑换）',
        '在皮肤商店或活动商店点「▶ 3D 战斗动画」：夜都街头 → 角色登场 → 打倒小咒灵 → 百目现身、机兵空降 → 大招 → 胜利定格，每套皮肤的招式都不一样']],
      ['限时玩法', [
        '咒灵讨伐：最多 4 人合作（人不够 AI 补位）讨伐巨型咒灵「百目」——它会砸地（红圈预警）、放弹幕环、召唤小咒灵、冲撞，血量过半进入狂暴；4 分钟内打倒它就赢，输了不扣奖杯',
        '封印争夺：打倒游荡的中立咒灵会掉落封印石，地图上也会刷出封印石；带回己方祭坛存起来，先存满 25 个获胜',
        '新地图「夜都十字路口」：紫色午夜、霓虹招牌、飘起的灵火，两侧有天桥和神社石台；新曲「午夜结界」']],
      ['修复', [
        '修复机体页面的 3D 模型不会刷新的问题（换机体后展示台一直停在上一台）',
        '修复「地下研究所」中央反应堆大厅：围着反应堆的高台中间没有楼梯，掉进去就上不来。现在东西两边开了门洞，里面也加了两段楼梯；地图检查也会自动找出这种坑']],
      ['更新奖励', ['信箱里有一份 1.8 更新礼包：150 灵符 + 100 宝石 + 军用箱']],
    ], en: [
      ['Collab event: Night City Showdown (14 days)', [
        'An original urban-sorcery collab: at midnight, curse spirits pour out of the Night City subway!',
        'New currency, Talismans: each limited-mode match gives 10 (+5 for a win), other modes give 3',
        'Event quests: clear one Curse Raid to get the new pilot Sigil for free, and defeat 25 curse spirits to get the Warden mech for free',
        '7-day login rewards: Talismans, coins, a Military Crate, gems and a Golden Airdrop',
        'Event shop: collab skins, the Talisman Runes mech paint, the Night City Ward frame, the Seal Talisman avatar, chests and resources']],
      ['New pilots', [
        'Sigil "Charm", Night City talisman mage. Skill Seal Talisman: throws a circle that slows enemies and stops their skills and supers. Passive Charm Resonance: +15% damage to slowed enemies. Overload Hundred-Talisman Ward: releases a ring of talismans every second',
        'Crimson "Wraith", wraith host. Skill Wraith Possession: 4 s of 35% lifesteal, extra speed and damage reduction. Passive Wraith Whisper: +20% damage at low HP. Overload Spirit Burst: +35% damage and every hit heals',
        'Both come with new academy-uniform 3D models, portraits and sidearms (Talisman Darts / Bonebreaker Sickle)']],
      ['New mechs', [
        'Warden: fires two slowing talisman orbs. Super Barrier Unfold: allies inside take 30% less damage and heal every second, and enemies who enter are slowed',
        'Spiritblade: every swing also sends a spirit wave, so it fights up close and at mid range. Super Skyrend Slash: charges up, then cuts through a 520-long line',
        'Sigil and the Warden are free from event quests. Crimson (480 gems) and the Spiritblade (360 gems) are on the event page, or 720 gems for both']],
      ['Collab skins (each with a ~20-second 3D battle trailer)', [
        'Legendary: Frost "Night City · Sealer" and Crimson "Wraith Awakened" (skin shop, 880 gems)',
        'Epic: Blaze "Night City · Student" and Sigil "Moonlit Charm Maiden" (event shop, for Talismans)',
        'Tap "▶ 3D battle trailer" in the skin shop or event shop: Night City streets → the hero arrives → spirits defeated → Hundred-Eyes appears and the mech drops in → super → victory pose. Every skin fights differently']],
      ['Limited modes', [
        'Curse Raid: up to 4 players team up (AI fills empty slots) against the giant curse spirit Hundred-Eyes. It slams the ground (watch the red circles), fires bullet rings, summons minions and charges, and enrages below half HP. Win within 4 minutes; losing costs no trophies',
        'Seal Clash: neutral wandering spirits drop seal stones when defeated, and more stones appear on the map. Bank them at your altar; first to 25 wins',
        'New map Night City Crossing: purple midnight, neon signs and drifting wisps, with overpasses and shrine platforms. New track: Midnight Ward']],
      ['Fixes', [
        'Fixed the 3D model on mech pages not updating (the stage kept showing the previous mech after you switched)',
        'Fixed the reactor hall in the middle of Underground Lab: the high platforms around the reactor had no stairs on the inside, so you couldn\'t get out once you dropped in. There are now openings on the east and west sides and two inner staircases, and the map checks now catch this kind of pit automatically']],
      ['Update rewards', ['There is an Update 1.8 gift in your mailbox: 150 Talismans + 100 gems + a Military Crate']],
    ] },
    { v: '1.7.1', date: '2026-11-15', title: '1.7.1 更新 · 断线重连 & 好友申请', en_title: 'Update 1.7.1 · Reconnect & Friend Requests', sections: [
      ['好友申请', [
        '好友页新增「好友申请」分页：每个申请显示头像、名字、奖杯、段位、好友码和申请时间，可以一个个「通过」或「拒绝」，也可以「全部通过」/「全部拒绝」',
        '收到好友申请时会弹出提示，可以直接点「通过」，也可以点「查看」去申请页；有待处理的申请时，打开好友页会直接进入申请页',
        '拒绝后对方那边的「等待通过」会消失；你发出的申请也在申请页里，显示对方是否在线']],
      ['声音卡顿 / 电脑变卡', [
        '修复打开游戏时音乐一卡一卡：音乐会提前准备好 1.2 秒（以前只有 0.15 秒），加载和进入对局时电脑再忙也不会断断续续；音频缓冲也加大了',
        '新增「帧率上限」设置（30 / 60 / 120 / 不限制，默认 60）：高刷新率显示器上不会再每秒渲染 144 帧以上，显卡和 CPU 占用大幅降低',
        '大厅最多 60 帧；背景涂鸦动画改成 30 帧、半分辨率；打开商店、好友、通行证等全屏页面时，后面的大厅不再继续渲染',
        '展示台 3D 模型的渲染分辨率上限从 2 倍降到 1.5 倍']],
      ['断线重连', [
        '网络断开时不会再直接退回大厅：画面停在对局里，显示「网络断开，正在重连…」，网络一恢复就自动接回原来的对局',
        '对局中断线会为你保留 60 秒，期间由 AI 暂时帮你操作（不会站着被打）；大厅和组队中断线保留 20 秒，回来时还在原来的队伍里',
        '重连后会重新同步整张地图的涂料、背包和比分；如果对局在断线期间打完了，重连后照样能看到结算、拿到奖励',
        '下载版 / 官网的 P2P 联机：和房主断开后会在 45 秒内自动重试，不会马上退回单机']],
      ['连接更稳定', [
        '新增心跳检测：8 秒收不到任何数据就判定连接已断，马上重连（以前手机切后台、Wi-Fi 换 4G 时可能会卡住很久）',
        '重连间隔从固定 2 秒改成逐步增加（0.3 秒起）；网络恢复、切回游戏页面时立刻重连',
        'P2P 房主和联机服务器断开后会一直自动重试，朋友仍然能用房间码找到你']],
    ], en: [
      ['Friend requests', [
        'New Requests tab on the Friends screen: each request shows the avatar, name, trophies, rank, friend code and when it was sent. Accept or decline them one by one, or use Accept all / Decline all',
        'A pop-up appears when someone sends you a request: accept it right there or tap View to open the Requests tab. If you have pending requests, the Friends screen opens on that tab',
        'Declining removes the request from the sender\'s pending list. Your own sent requests are listed in the Requests tab too, with whether the other player is online']],
      ['Audio stutter / slow computer', [
        'Fixed choppy music when the game starts: music is now queued 1.2 seconds ahead (it was 0.15 s), so it keeps playing smoothly while the game loads or builds a match, and the audio buffer is larger',
        'New Frame rate cap setting (30 / 60 / 120 / Unlimited, default 60): high-refresh monitors no longer render 144+ frames a second, which greatly cuts GPU and CPU use',
        'The lobby runs at up to 60 fps, the graffiti background animates at 30 fps and half resolution, and the lobby stops rendering behind full-screen pages such as the Shop, Friends or Pass',
        'The 3D showroom now renders at up to 1.5× resolution instead of 2×']],
      ['Reconnect', [
        'Losing your connection no longer throws you back to the lobby. You stay in the match with a "Connection lost, reconnecting…" notice and rejoin the same match as soon as the network is back',
        'In a match your spot is held for 60 seconds and an AI plays for you meanwhile, so you are not a sitting duck. In the lobby or a party it is held for 20 seconds and you come back to the same party',
        'After reconnecting, the whole paint map, your bag and the score are re-synced. If the match ended while you were away, you still see the results and get your rewards',
        'Download / website P2P games: if you lose the host, the game keeps retrying for 45 seconds instead of dropping you to offline mode right away']],
      ['More stable connections', [
        'New heartbeat check: if no data arrives for 8 seconds the connection is treated as lost and reconnects right away (before, switching apps on a phone or moving from Wi-Fi to mobile data could leave you stuck for a long time)',
        'Reconnect attempts now start after 0.3 s and back off gradually instead of a fixed 2 s, and they fire immediately when the network comes back or you return to the game',
        'A P2P host that loses the signalling server keeps retrying, so friends can still find you by room code']],
    ] },
    { v: '1.7', date: '2026-11-15', title: '1.7 更新 · 开黑', en_title: 'Update 1.7 · Squad Up', sections: [
      ['好友系统', [
        '大厅右上角新增「好友」：每个人都有一个 6 位好友码，把它发给朋友，对方输入后发出好友申请，同意后就成为好友',
        '好友列表显示在线状态：绿色 = 在大厅，青色 = 组队中，橙色 = 对战中；还能看到对方的驾驶员、奖杯和段位',
        '有新的好友申请或邀请时，好友按钮上会出现红点；对方不在线时申请会保存下来，等他上线自动送达']],
      ['组队开黑', [
        '在好友列表点「邀请」，好友会收到弹窗邀请，点「加入」就进到你的队伍；也可以对在大厅的好友点「申请加入」',
        '大厅中间的队伍栏显示所有队员和他们选的驾驶员 / 机体，空位点一下就能邀请；队长有皇冠，可以请人出队',
        '队长选模式和地图，队员会看到「队长选择」；队长点「开战」全队一起进入对战，打完回到大厅时队伍还在',
        '最多 4 人一队']],
      ['所有模式都能组队', [
        '涂鸦争夺、点位占领、生死之战、逃亡圈、乐园模式、搜刮撤离都可以组队，队友一定分在同一边',
        '排位赛也能组队：所有队员都必须满足排位条件，按队伍里最高的段位匹配对手；每个人分别结算排位分',
        '排位的禁用规则对队员同样有效：选了被禁的驾驶员或机体会自动换掉',
        '人数不够时用 AI 队友补满；4 人组队时自动开 4v4，搜刮撤离的小队人数也会跟着队伍人数走']],
      ['单排', [
        '不组队也完全没问题：直接点「开战」就是单排，系统会给你匹配 AI 队友和对手']],
      ['AI 对手调整', [
        '最常遇到的是「不错」和「菜鸟」水平的玩家',
        '普通赛按你的等级、排位赛按段位：越高，遇到「高手」的概率越大（满级约 26%，传奇段位约 43%）',
        '「挂机」「操作顶尖」「大神」变得少见：普通赛加起来不到 12%，青铜段位只有 6%']],
      ['更新奖励', ['信箱里有一份 1.7 更新礼包：100 宝石 + 1500 金币 + 军用箱']],
    ], en: [
      ['Friends', [
        'New Friends button at the top right of the lobby. Everyone has a 6-character friend code: share yours, your friend enters it to send a request, and once accepted you are friends',
        'The friend list shows who is online: green = in the lobby, cyan = in a party, orange = in a match. You can also see their pilot, trophies and rank',
        'A red dot on the Friends button means a new request or invite. Requests to offline players are kept and delivered when they come online']],
      ['Party play', [
        'Tap Invite in your friend list and your friend gets a pop-up invite; they tap Join to enter your party. You can also ask to join a friend who is in the lobby',
        'The party bar in the middle of the lobby shows every member with their pilot and mech. Tap an empty slot to invite someone. The leader has a crown and can remove members',
        'The leader picks the mode and map, and members see "Leader\'s pick". When the leader taps Play the whole party jumps in together, and the party stays together when you return to the lobby',
        'Up to 4 players per party']],
      ['Parties in every mode', [
        'Turf War, Zone Control, Elimination, Escape Circle, Park and Extraction all support parties, and party members are always on the same team',
        'Ranked works too: every member must meet the ranked requirements, matchmaking uses the highest rank in the party, and each player gets their own ranked points',
        'Ranked bans apply to party members too: a banned pilot or mech is swapped out automatically',
        'Empty slots are filled with AI teammates. A 4-player party automatically plays 4v4, and Extraction squads match your party size']],
      ['Solo play', [
        'No party? No problem: just tap Play to queue solo and you get AI teammates and opponents']],
      ['AI opponent changes', [
        'Decent and Rookie players are now the ones you meet most often',
        'Your level (normal matches) or rank (Ranked) decides how many Experts show up: the higher you are, the more Experts you meet (about 26% at max level, 43% at Legend)',
        'AFK, Mechanical and Godlike players are now rare: under 12% combined in normal matches, and just 6% in Bronze']],
      ['Update rewards', ['There is an Update 1.7 gift in your mailbox: 100 gems + 1500 coins + a Military Crate']],
    ] },
    { v: '1.6', date: '2026-11-15', title: '1.6 更新 · 搜刮撤离', en_title: 'Update 1.6 · Extraction', sections: [
      ['全新玩法「搜刮撤离」', [
        '两张超大地图（普通地图的 4 倍大）：「废弃港口」集装箱迷宫 + 中央货轮，「地下研究所」实验室走廊 + 中央反应堆大厅',
        '四支小队从四个角出发搜刮物资；小队人数跟着组队人数（1–4 人），可以用 AI 队友补位',
        '物资分 5 种品质（普通 / 优良 / 稀有 / 史诗 / 传说），越靠中间越值钱；传说物资有光柱，但中间有中立守卫看守',
        '背包有格子上限，满了捡到更值钱的东西会自动换掉最不值钱的；阵亡时整个背包掉在地上，谁都能捡',
        '撤离点第 3 分钟起陆续开放，站进去读条 10 秒成功撤离（挨打会倒退）；只有一条命，阵亡或没来得及撤离就全丢',
        '普通行动：阵亡只丢这局搜到的；高危行动：物资更多更好，可以带装备进场，但阵亡装备也会丢']],
      ['仓库与军需处', [
        '带出来的物资存进仓库：卖掉换金币（价值的 1/10），传说物资可以兑换宝石和能量结晶',
        '军需处用金币买高危行动的装备：战术护甲（生命 +25%）、扩容背包（+6 格）、急救包（残血自动回 60）',
        '搜刮记录（行动次数、撤离成功、最高单次、累计价值）和本周最佳撤离排行',
        '新任务线「搜刮行动」：7 个任务，奖励宝石、金币、特攻队补给箱、能量结晶和金色空投']],
      ['活动界面', [
        '改成一个活动一个页面：左边是可以往下滑的活动列表，分「限时活动」和「任务」两页，右边是带大横幅的活动详情',
        '有奖励可领的活动在列表里有红点']],
      ['信箱', [
        '改成左边信件列表、右边看信；列表可以正常往下滑动',
        '只有往右滑才会删除领过的邮件，上下滑动不会再误删']],
      ['通行证', [
        '更霓虹的配色，彩色进度线一直走到你当前的等级',
        '拖动有惯性，拖到两头会弹回来；靠近中间的等级会放大发光，背景跟着视差移动',
        '领取奖励时，奖励会带着火花飞出去']],
      ['帧数与操作手感', [
        '单人模式下，画面卡的时候游戏节奏不再变慢（模拟按真实时间补帧）',
        '涂料贴图只上传改动的部分，超大地图上也不卡；地上的物资用实例化渲染',
        '帧率太低时自动换成流畅画质；设置里可以显示帧率',
        '新增瞄准辅助（鼠标附近的敌人会把准星吸过去一点，可以在设置里关）',
        '命中时准星张开、有清脆的命中音，击倒敌人时屏幕边缘闪一下；空中转向和滚轮起步更跟手']],
      ['新音乐与音效', [
        '三首原创新曲：大厅「晚风喷漆」（和「霓虹喷漆街」轮流播放）、搜刮撤离「暗巷搜刮」、撤离点开放后的「撤离倒数」',
        '新音效：按品质不同的捡物资音、撤离点开放警报、成功撤离、卖出金币、命中确认、击倒确认']],
      ['更新奖励', ['信箱里有一份 1.6 更新礼包：150 宝石 + 2000 金币 + 军用箱']],
    ], en: [
      ['New mode: Extraction', [
        'Two giant maps (4× a normal map): Abandoned Harbor, a container maze around a cargo ship, and Underground Lab, labs and corridors around a reactor hall',
        'Four squads start in the four corners and loot the map; squad size matches your party (1–4 players), with optional AI teammates',
        'Loot comes in 5 rarities (Common / Uncommon / Rare / Epic / Legendary) and gets better toward the middle; legendary loot shines with a light beam, but neutral guards protect the center',
        'Your backpack has limited slots: when it is full, picking up something more valuable swaps out the least valuable item. If you die, your whole backpack drops for anyone to grab',
        'Extraction points open from minute 3; hold one for 10 seconds to escape (taking damage sets you back). One life only: die or miss extraction and you lose it all',
        'Normal Run: dying only loses what you found. High-Risk Run: more and better loot, and you can bring gear, but you lose that gear if you die']],
      ['Warehouse & Quartermaster', [
        'Extracted loot goes to your warehouse: sell it for coins (1/10 of its value) or trade legendary items for gems and power crystals',
        'Buy High-Risk gear with coins at the Quartermaster: Tactical Armor (+25% HP), Big Backpack (+6 slots) and Med Kit (auto-heals 60 at low HP)',
        'Extraction records (runs, successful extractions, best run, total value) and a weekly best-extraction leaderboard',
        'New quest line Operation Scavenge: 7 quests rewarding gems, coins, a Strike Team chest, a power crystal and a golden airdrop']],
      ['Events screen', [
        'One page per event: a scrollable list on the left with Limited and Quests tabs, and the event page with a big banner on the right',
        'Events with rewards to claim get a red dot in the list']],
      ['Mailbox', [
        'Mail list on the left, reading pane on the right; the list now scrolls normally',
        'Only a swipe to the right deletes claimed mail, so scrolling up and down never deletes anything by accident']],
      ['Season pass', [
        'Brighter neon colors, with a rainbow progress line running up to your current tier',
        'Dragging has momentum and bounces back at both ends; tiers near the center grow and glow, and the background scrolls with parallax',
        'Claimed rewards fly off with a burst of sparks']],
      ['Frame rate & controls', [
        'In single-player, the game no longer slows down when frames drop (the simulation catches up in real time)',
        'Only the changed part of the paint texture is uploaded, so giant maps stay smooth; loot on the ground uses instanced rendering',
        'Quality drops automatically if the frame rate stays low, and Settings can show an FPS counter',
        'New aim assist: enemies near your mouse pull the crosshair slightly toward them (can be turned off in Settings)',
        'The crosshair kicks open with a crisp sound when you hit, the screen edges flash on a knockout, and air steering and roller starts feel snappier']],
      ['New music & sound', [
        'Three new original tracks: lobby theme Evening Spray (alternates with Neon Spray Street), Back Alley Loot for Extraction, and Extraction Countdown once extraction opens',
        'New sounds: rarity-based loot pickups, the extraction siren, successful extraction, selling for coins, hit confirm and knockout confirm']],
      ['Update rewards', ['A 1.6 update gift is waiting in your mailbox: 150 gems + 2,000 coins + a military chest']],
    ] },
    { v: '1.5.1', date: '2026-11-14', title: '1.5.1 更新 · 全新结算', en_title: 'Update 1.5.1 · New Results Screen', sections: [
      ['结算画面', [
        '比赛结束后，我方全队的 3D 角色站上结算台：赢了轮流跳起来庆祝、漫天彩纸，MVP 站在中间先来一整套展示；输了全队垂头丧气，背景下起小雨',
        '每个人脚下有名字和本局数据，MVP 戴金色标记',
        '数据改成卡片：每队一张，每人一行（头像、驾驶员和机体、击毁 / 倒下 / 涂地），击毁和涂地带对比条',
        '奖励分成一个个小卡片依次弹出（奖杯、经验、金币、宝石、任务……）']],
    ], en: [
      ['Results screen', [
        'After a match your whole team steps onto a 3D stage: win and they take turns jumping to celebrate under falling confetti, with the MVP in the middle doing a full routine; lose and the team hangs their heads in the rain',
        'Each player has their name and match stats under their feet, and the MVP gets a gold badge',
        'Stats are now cards: one per team, one row per player (portrait, pilot and mech, takedowns / KOs / paint) with comparison bars for takedowns and paint',
        'Rewards pop in one by one as separate chips (trophies, XP, coins, gems, quests…)']],
    ] },
    { v: '1.5', date: '2026-11-14', title: '1.5 更新 · 焕然一新', en_title: 'Update 1.5 · Fresh Coat', sections: [
      ['角色页面', [
        '点驾驶员或机体就进入专属页面：中间是可以拖动旋转的大型 3D 模型，左右切换上一个 / 下一个',
        '驾驶员页面：「能力」（技能、被动、弹出武器、超载）、「升级」（直接升级 / 突破，看 1–11 级成长表）、「皮肤」（点一下就在 3D 模型上预览，装上或购买）、「介绍」（故事和擅长机体）',
        '机体页面：「武器」（完整数值）、「大招」、「涂装」（预览所有涂装）、「驾驶员」（擅长这台机体的驾驶员）',
        '大厅里点展示台上的角色进入当前驾驶员的页面，点机体标签进入机体页面；底部一键「选择出战」']],
      ['画面升级', [
        '高画质下新增后期处理：霓虹灯、涂料高光和特效会柔和发光，色彩更饱满，画面边缘加了轻微暗角',
        '展示台：驾驶员颜色的轮廓光、脚下柔和的接触阴影、背后缓缓旋转的光芒',
        '驾驶员和机体卡片鼠标移上去会扫过一道光泽']],
      ['AI 改进', [
        '近战机体（重拳、影刃、拆楼锤）会绕到敌人侧后方再出拳，接近时走之字形躲子弹，出拳时会对准目标',
        '迫击、弹弓按炮弹落地时间计算提前量，打移动目标更准']],
      ['机体平衡（全部 17 台重新审视）', [
        '狙击机兵：满蓄力伤害 108 → 96，蓄力时间 0.9 → 0.95 秒',
        '旋转机兵：伤害 5 → 4.7，射程 400 → 380，涂料范围略减',
        '泼桶机兵：伤害 15.2 → 13.3　｜　滚刷机兵：生命 115 → 110，碾压伤害 24 → 20　｜　迫击机兵：伤害 48 → 45',
        '影刃机兵：生命 115 → 135，伤害 46 → 54，移速 1.18 → 1.22，前冲 300 → 330，背刺 +30% → +40%，挥刀涂地范围变大',
        '幻影机兵：生命 95 → 110，伤害 17 → 20　｜　重拳机兵：伤害 52 → 55　｜　拆楼锤：生命 190 → 200，伤害 64 → 68',
        '弹弓机兵：伤害 40 → 44，爆炸范围 54 → 58，装填 1.3 → 1.1 秒　｜　无人机母舰：生命 125 → 130，伤害 24 → 26　｜　防暴盾卫：伤害 19 → 20',
        '所有近战机体：出拳的前冲距离也算进攻击范围，更容易打中']],
      ['驾驶员平衡（全部 16 位重新审视）', [
        '卡卡：礼盒回血 40 → 60，超载攻速 +35% → +45%、大招充能 +50% → +70%',
        '雷豹：机体生命 +15% → +18%　｜　秦岳：自爆伤害 55 → 65　｜　石磊：弹出护盾 35 → 45　｜　岚：每个队友减伤 -7% → -8%（最多 -24%）　｜　风羽：机体移速 +6% → +8%',
        '白夜：远距伤害 +22% → +20%　｜　夜鸢：草丛 / 己方涂料上移速 +15% → +12%　｜　韩冰：满血目标伤害 +10% → +8%',
        '雷豹「涂料拳套」伤害 16 → 14、石磊「钉锤」伤害 20 → 18（弹出驾驶员始终弱于任何机体）']],
      ['更新奖励', ['信箱里有一份 1.5 更新礼包：150 宝石 + 角色宝箱 + 1500 金币']],
    ], en: [
      ['Character pages', [
        'Tap any pilot or mech to open their own page: a large 3D model you can drag to rotate, with previous / next arrows',
        'Pilot page: Abilities (skill, passive, sidearm, overload), Upgrade (level up or break through right there, with the full level 1–11 table), Skins (tap to preview on the 3D model, then equip or buy) and About (story and signature mech)',
        'Mech page: Weapon (full stats), Super, Paint (preview every paint job) and Pilots (who specializes in it)',
        'In the lobby, tap the character on the stage to open your pilot\'s page, or the mech tag for the mech page; one big Select button at the bottom']],
      ['Graphics upgrade', [
        'High quality now adds post-processing: neon, paint highlights and effects glow softly, colors are richer, and the screen edges get a light vignette',
        'Showcase stages: rim light in the pilot\'s color, soft contact shadows and slowly turning light rays behind the model',
        'Pilot and mech cards get a shine sweep on hover']],
      ['AI improvements', [
        'Melee mechs (Fist Bot, Shadow Blade, Wrecking Hammer) circle to the enemy\'s side or back before striking, zigzag to dodge on the way in, and aim properly when they swing',
        'Mortar Bot and Slinger Bot lead moving targets by the shell\'s flight time, so they hit far more often']],
      ['Mech balance (all 17 reviewed)', [
        'Sniper Bot: full-charge damage 108 → 96, charge time 0.9 → 0.95 s',
        'Gatling Bot: damage 5 → 4.7, range 400 → 380, slightly smaller paint splats',
        'Bucket Bot: damage 15.2 → 13.3 | Roller Bot: HP 115 → 110, roll damage 24 → 20 | Mortar Bot: damage 48 → 45',
        'Shadow Blade: HP 115 → 135, damage 46 → 54, speed 1.18 → 1.22, lunge 300 → 330, backstab +30% → +40%, bigger paint swipe',
        'Phantom: HP 95 → 110, damage 17 → 20 | Fist Bot: damage 52 → 55 | Wrecking Hammer: HP 190 → 200, damage 64 → 68',
        'Slinger Bot: damage 40 → 44, blast 54 → 58, reload 1.3 → 1.1 s | Drone Carrier: HP 125 → 130, damage 24 → 26 | Riot Guard: damage 19 → 20',
        'All melee mechs: the lunge now counts toward punch reach, so hits land more easily']],
      ['Pilot balance (all 16 reviewed)', [
        'Kaka: gift box heal 40 → 60, overload attack speed +35% → +45% and Super charge +50% → +70%',
        'Titan: mech HP +15% → +18% | Qin: self-destruct 55 → 65 | Rocky: eject shield 35 → 45 | Lan: −7% → −8% damage per ally (up to −24%) | Gale: mech speed +6% → +8%',
        'Frost: long-range bonus +22% → +20% | Raven: speed in bushes / on own paint +15% → +12% | Han: bonus vs full-HP targets +10% → +8%',
        'Titan\'s Paint Knuckles damage 16 → 14, Rocky\'s Nail Hammer 20 → 18 (an ejected pilot is always weaker than any mech)']],
      ['Update rewards', ['A 1.5 update gift is waiting in your mailbox: 150 gems + a Pilot chest + 1,500 coins']],
    ] },
    { v: '1.4.1', date: '2026-11-14', title: '1.4.1 更新 · 开麦了', en_title: 'Update 1.4.1 · Chat Is Live', sections: [
      ['打字聊天', [
        '对战中按 Enter 打字，Tab 切换「全部」和「队伍」频道，Esc 取消；手机点右上角的 💬，还能一键发快捷语',
        '队伍频道只有队友看得到；说的话会显示在左边的聊天框，也会短暂出现在角色头顶',
        '设置里可以关闭「显示聊天消息」；刷屏会被限速（10 秒最多 5 句）']],
      ['对手更像真人', [
        '对局里的 AI 机兵有了各自的水平和打法：有人枪法稳、走位飘，有人冲动乱放大招，也有人开局半天不动',
        '普通赛里什么水平的人都可能遇到；排位赛段位越高，遇到的高手越多（队友和对手都是）',
        'AI 也会打字：打招呼、报点、夸人、甩锅、嘴硬、回你的话，还会打错字',
        'AI 换上了玩家风格的名字，也会穿皮肤、戴名片框；结算表不再标出谁是 AI']],
      ['更新奖励', ['信箱里有一份 1.4.1 更新礼包：80 宝石 + 1500 金币 + 50 乐园票']],
    ], en: [
      ['Text chat', [
        'Press Enter in a match to type, Tab to switch between All and Team, Esc to cancel; on phones tap 💬 at the top right, with one-tap quick phrases too',
        'Team chat is only seen by your teammates; messages show in the chat box on the left and briefly above the speaker\'s head',
        'You can turn off Show chat in Settings; spamming is rate-limited (5 messages per 10 seconds)']],
      ['Opponents feel more human', [
        'AI mechs in matches now have their own skill levels and playstyles: some have steady aim and slick movement, some charge in and waste their supers, and some stand still for a while at the start',
        'Casual matches can put you against anyone; the higher your ranked tier, the more strong players you meet, on both teams',
        'AI players type too: greetings, callouts, compliments, blaming teammates, comebacks and replies to you, typos included',
        'AI players now use player-style names and wear skins and frames, and the results table no longer marks who is AI']],
      ['Update rewards', ['A 1.4.1 update gift is waiting in your mailbox: 80 gems + 1,500 coins + 50 Park Tickets']],
    ] },
    { v: '1.4', date: '2026-11-14', title: '1.4 更新 · 乐园祭', en_title: 'Update 1.4 · Park Fest', sections: [
      ['限时活动「乐园祭」', [
        '全新模式「乐园模式」：嘉年华花车沿环形路线巡游，光圈里人多的队伍每秒得分；打爆飘在空中的气球再得 3 分，先到 100 分获胜',
        '全新地图「欢乐乐园」：旋转木马、摩天轮底座、售票亭，乐园模式默认在这里',
        '玩乐园模式赚「乐园票」（每局 10 张，赢了再 +5），完成活动任务拿更多',
        '活动商店：用乐园票兑换特攻队补给箱、夏日皮肤「海滩偶像」、头像「乐园气球」、金色空投、宝石、能量结晶和金币']],
      ['新机体组「袭击！特攻队」', [
        '影刃机兵：高速突进挥刀，从背后命中 +30%；大招「影袭」冲过敌人造成 60 伤害并隐身',
        '毒针机兵：连射毒针，中毒 3 秒持续掉血并减速；大招「毒雾」让雾里的敌人中毒、减速、暴露',
        '幻影机兵：近距离霰弹，背后命中 +30%；大招「光学迷彩」隐身 4 秒，隐身时第一击 +50%',
        '只能从「特攻队补给箱」开出：完成「活动 → 袭击！特攻队」任务线，或在乐园祭商店兑换']],
      ['夏日系列皮肤', [
        '凌焰「冲浪少年」（史诗）：夏威夷花衬衫、冲浪短裤、墨镜，背着冲浪板',
        '苏糖「海滩偶像」（史诗）：波点泳装、草帽和游泳圈',
        '白夜「冰沙女王」（传说）：冰晶王冠、冰裙和小阳伞，身边环绕冰晶，全套传说特效',
        '3D 模型、立绘和对战特效都是全新制作']],
      ['新常驻角色与机体', [
        '新驾驶员「卡卡 · 魔术」：技能「魔术替身」留下会爆炸的替身并隐身；被动「惊喜礼盒」击倒敌人掉落回血礼盒；随身武器「扑克飞牌」',
        '新机体「弹弓机兵」：弹射会弹跳两次的涂料球，越过掩体打击后排；大招「连环弹」',
        '两周内限时购买必出卡卡和弹弓机兵，之后也会出现在宝箱里']],
      ['排位赛', [
        '新增排位赛（4 对 4 单排）：七个段位，从青铜到传奇；赢了加分、输了扣分，MVP 额外加分',
        '至少拥有 3 位驾驶员和 3 台机体才能参加；青铜、白银段位输了不会掉段',
        '黄金段位起有禁用阶段：你和 AI 队友各禁 1 个，对手禁 2 个；AI 会根据强度和克制关系选择禁用',
        '每个段位第一次到达都有奖励（宝石、特攻队补给箱、金色空投、能量结晶、大师段位框）；排位赛金币和通行证经验 ×1.5',
        '排位玩法每 2 小时轮换；AI 的强度跟着你的段位提高']],
      ['新兵之路', [
        '新账号开局送新手宝箱后，跟着「新兵之路」任务走：完成第一局送宝石，赢一局、击倒 10 次各送一个新手宝箱（必出新驾驶员），升到 3 级送角色宝箱',
        '很快就能凑齐 3 位驾驶员、3 台机体，参加排位赛']],
      ['信箱', [
        '领过的邮件可以往右滑掉，或者点「删除已领取」一键清空',
        '没领取的奖励 3 天后自动删除，邮件上会显示还剩多久']],
      ['更多新内容', [
        '连胜奖励：3 连胜起每局额外金币，结算时显示连胜火焰',
        '结算界面的 MVP 会用 3D 模型摆出胜利动作',
        '修复：驾驶员服装皮肤的肤色显示错误（立绘发黑、3D 发白）']],
      ['平衡调整', [
        '旋转机兵：伤害 5.4 → 5，装填 2.6 → 2.8 秒　｜　喷罐机兵：伤害 13 → 12　｜　泼桶机兵：伤害 15.8 → 15.2',
        '滚刷机兵：生命 120 → 115，滚压伤害 27 → 24　｜　狙击机兵：满蓄力伤害 115 → 108',
        '拆楼锤：伤害 60 → 64，生命 180 → 190　｜　无人机母舰：伤害 23 → 24',
        '白夜「远距精准」+18% → +22%　｜　岚「众志成城」每个队友 -6% → -7%（最多 -21%）　｜　风羽：机体移速 +6%，弹出后 +40% → +45%',
        '苏糖「彩带喷枪」伤害 6 → 5（随身武器强度不能超过机体）']],
      ['更新奖励', ['信箱里有一份 1.4 更新礼包：200 宝石 + 特攻队补给箱 + 100 乐园票']],
    ], en: [
      ['Limited event: Park Fest', [
        'New mode Park Mode: a carnival float parades around a loop; the team with more players in its ring scores every second, and popping floating balloons scores 3 more. First to 100 wins',
        'New map Fun Park: a carousel, Ferris wheel base and ticket booths; Park Mode plays here by default',
        'Earn Park Tickets by playing Park Mode (10 per match, +5 for a win) and from event quests',
        'Event shop: trade tickets for Strike Team chests, the summer skin Beach Idol, the Park Balloons avatar, Golden Airdrops, gems, energy crystals and coins']],
      ['New mech squad: Strike Team', [
        'Shadow Blade: dashes in with a blade, +30% damage from behind; Super Shadowstep dashes through enemies for 60 damage and turns you invisible',
        'Venom Stinger: fires poison needles that deal damage over 3s and slow; Super Venom Fog poisons, slows and reveals enemies inside the cloud',
        'Phantom: close-range shotgun, +30% from behind; Super Optical Camo makes you invisible for 4s, and your first hit from stealth deals +50%',
        'Only from Strike Team chests: complete the Events → Strike Team task line, or trade for them in the Park Fest shop']],
      ['Summer skins', [
        'Blaze "Surf Kid" (Epic): Hawaiian shirt, board shorts, sunglasses and a surfboard',
        'Candy "Beach Idol" (Epic): polka-dot swimsuit, straw hat and swim ring',
        'Frost "Sorbet Queen" (Legendary): ice crown, ice dress and parasol, with orbiting ice crystals and full Legendary effects',
        'All-new 3D models, portraits and in-match effects']],
      ['New standard pilot and mech', [
        'New pilot Kaka "Trick": skill Magic Decoy leaves an exploding decoy and turns you invisible; passive Surprise Box drops a healing gift when you score a takedown; sidearm Card Throw',
        'New mech Slinger Bot: launches paint balls that bounce twice, hitting the backline over cover; Super Cluster Shot',
        'For two weeks Limited Offers always include Kaka and the Slinger Bot; they also drop from chests']],
      ['Ranked', [
        'New Ranked mode (4v4 solo queue): seven tiers from Bronze to Legend; win to gain points, lose to drop them, MVP earns extra',
        'Requires 3 pilots and 3 mechs; Bronze and Silver never drop a tier on a loss',
        'From Gold up there is a ban phase: you and your AI teammate ban 1 each, the enemy bans 2; the AI picks bans by strength and counters',
        'Rewards the first time you reach each tier (gems, Strike Team chest, Golden Airdrop, energy crystals, Master frame); Ranked coins and pass XP ×1.5',
        'The Ranked mode rotates every 2 hours, and AI strength rises with your tier']],
      ['Rookie Path', [
        'After the starter chest, new accounts follow the Rookie Path: gems for your first match, a starter chest (guaranteed new pilot) for your first win and for 10 takedowns, and a Hero Chest at level 3',
        'You will have 3 pilots and 3 mechs for Ranked in no time']],
      ['Mailbox', [
        'Swipe right on claimed mail to delete it, or tap Delete Claimed to clear them all',
        'Unclaimed rewards are deleted automatically after 3 days, and each mail shows how long is left']],
      ['More', [
        'Win streaks: extra coins from a 3-win streak onward, with a streak flame on the results screen',
        'The MVP strikes a 3D victory pose on the results screen',
        'Fix: pilot outfit skins showed the wrong skin color (black portraits, white 3D faces)']],
      ['Balance changes', [
        'Gatling Bot: damage 5.4 → 5, reload 2.6 → 2.8s | Spray Bot: damage 13 → 12 | Bucket Bot: damage 15.8 → 15.2',
        'Roller Bot: HP 120 → 115, roll damage 27 → 24 | Sniper Bot: full-charge damage 115 → 108',
        'Wrecking Hammer: damage 60 → 64, HP 180 → 190 | Drone Carrier: damage 23 → 24',
        'Frost Long Shot +18% → +22% | Lan Strength in Numbers −6% → −7% per ally (up to −21%) | Gale: +6% mech speed, ejected +40% → +45%',
        'Candy\'s Confetti Blaster damage 6 → 5 (sidearms must stay weaker than mechs)']],
      ['Update rewards', ['A 1.4 update gift is waiting in your mailbox: 200 gems + Strike Team chest + 100 Park Tickets']],
    ] },
    { v: '1.3.1', date: '2026-11-14', title: '1.3.1 更新 · 官网上线', en_title: 'Update 1.3.1 · Website Launch', sections: [
      ['驾驶员展示动作', [
        '选中驾驶员时，3D 模型会播放一整套动作：打招呼、招牌攻击、跳起来庆祝',
        '枪手连开三枪再转枪，近战驾驶员横扫两下再跳起来往下砸，秦岳连扔两颗手雷',
        '展示台下面新增「打招呼」「攻击」「庆祝」按钮，可以单独再看一次']],
      ['官网', [
        '官网改为独立的公开网站，不再需要通过 Claude 打开，支持被 Google 等搜索引擎收录',
        '官网的「驾驶员与机兵」新增 3D 展示台：点任意驾驶员就能看到会动的 3D 模型，以及技能、被动、超载和弹出武器']],
      ['更新奖励', ['信箱里有一份 1.3.1 更新礼包：50 宝石 + 1000 金币']],
    ], en: [
      ['Pilot showcase moves', [
        'When you select a pilot, their 3D model plays a full routine: a hello, a signature attack and a victory jump',
        'Gunners fire three shots and twirl their weapon, melee pilots swing twice then leap into a smash, and Qin lobs two grenades',
        'New Hello, Attack and Celebrate buttons under the showcase let you replay each move']],
      ['Website', [
        'The website is now a standalone public site: no Claude needed to open it, and search engines like Google can index it',
        'The Pilots & mechs section on the website has a new 3D showcase: pick any pilot to see their animated 3D model along with their skill, passive, overload and sidearm']],
      ['Update rewards', ['A 1.3.1 update gift is waiting in your mailbox: 50 gems + 1,000 coins']],
    ] },
    { v: '1.3', date: '2026-11-14', title: '1.3 更新 · 驾驶员出击', en_title: 'Update 1.3 · Pilots Unleashed', sections: [
      ['全新 3D 驾驶员模型', [
        '15 位驾驶员都有了精致的全身 3D 模型：大头卡通造型，专属的服装、发型、表情和配件',
        '弹出后在战场上奔跑、瞄准、开火、挥击都有专属动作；驾驶舱里坐着的也是同一个角色',
        '「驾驶员」界面新增 3D 展示台，可以拖动旋转，官网的角色介绍也换成了 3D 模型']],
      ['驾驶员专属随身武器', [
        '机体被打爆后，每位驾驶员会拿出自己的武器，不再是统一的手枪（强度都远低于机体）',
        '凌焰「火花双枪」、白夜「袖珍狙击枪」、雷豹「涂料拳套」、包大福「平底锅」、秦岳「手雷」、叶声「口袋音箱」、韩冰「警用电棍」等 15 种',
        '电击枪、警用电棍会减速，信号枪会暴露敌人，平底锅打中回血，口袋音箱能穿墙，夜鸢的飞镖在草丛里扔不会暴露',
        '「驾驶员」详情里可以查看每个人的弹出武器']],
      ['下载版必须更新', [
        '离线 HTML、单文件版和安卓版：官网发布新版本后，旧版本会显示更新页面，更新到最新版本才能继续游玩',
        '更新页面会列出新版本的内容，点「去官网下载新版本」直接打开官网下载页',
        '没联网时无法检查新版本，可以继续玩']],
      ['更新奖励', ['信箱里有一份 1.3 更新礼包：100 宝石 + 角色宝箱 + 2000 金币']],
    ], en: [
      ['All-new 3D pilot models', [
        'All 15 pilots now have detailed full-body 3D models: big-head cartoon style with their own outfits, hair, expressions and gear',
        'Ejected pilots run, aim, shoot and swing with their own animations, and the pilot in the cockpit is the same character',
        'The Pilots screen has a new 3D showcase you can drag to rotate, and the website roster now shows the 3D models']],
      ['Pilot sidearms', [
        'When your mech is destroyed, each pilot pulls out their own weapon instead of the same pistol (all far weaker than a mech)',
        '15 in total, including Blaze\'s Spark Twins, Frost\'s Pocket Sniper, Titan\'s Paint Knuckles, Bao\'s Frying Pan, Qin\'s Grenade, Echo\'s Pocket Speaker and Han\'s Stun Baton',
        'The Taser and Stun Baton slow, the Flare Pistol reveals, the Frying Pan heals on hit, the Pocket Speaker goes through walls, and Raven\'s darts don\'t reveal her in bushes',
        'Check every pilot\'s sidearm in their Pilots screen details']],
      ['Downloaded versions must update', [
        'Offline HTML, single-file and Android versions: once a new version is released on the website, older versions show an update screen and must update before you can keep playing',
        'The update screen lists what\'s new, and “Download the new version” opens the website download page',
        'Without an internet connection the game can\'t check for updates, so you can keep playing']],
      ['Update rewards', ['A 1.3 update gift is waiting in your mailbox: 100 gems + Hero Chest + 2,000 coins']],
    ] },
    { v: '1.2', date: '2026-11-14', title: '1.2 更新 · 地下战线', en_title: 'Update 1.2 · Underground Front', sections: [
      ['新地图 ×3', ['「地铁中转站」：午夜的地下站台，上下两层，柱子后面最好埋伏', '「灰石总部」：两座办公塔居高临下，喷泉广场挡住中路视线', '「夜市长街」：灯笼下的小吃摊窄巷，摊位顶棚可以站人']],
      ['平衡调整（根据 900 局 AI 对战数据）', [
        '韩冰：被动「倒戈」+15% → +10%，闪光弹伤害 15 → 10、减速 1.5 → 1.2 秒',
        '石磊：炸药伤害 80 → 72，弹出护盾 40 → 35',
        '白夜「远距精准」+12% → +18%　｜　凌焰回血 35% → 40%　｜　秦岳自爆 45 → 55',
        '包大福脱战回血 +80% → +100%，便当 75 → 90　｜　风羽弹出后移速 +30% → +40%，冲刺无敌更久',
        '岚「众志成城」每个队友 -5% → -6%（最多 -18%）',
        '旋转机兵：伤害 5.8 → 5.4，散布更大　｜　喷罐机兵：伤害 13.5 → 13　｜　滚刷机兵：生命 125 → 120，突进缩短',
        '喇叭车：伤害 21 → 23，射程 330 → 350　｜　无人机母舰：伤害 21 → 23，生命 115 → 125，装填更快',
        '重拳机兵：生命 175 → 185　｜　拆楼锤：伤害 56 → 60，横扫范围更大，生命 170 → 180，移速更快']],
      ['AI 改进', ['机体被打爆后弹出的驾驶员不再在原地走来走去：会跑去队友身边抱团，或者躲进草丛等空投', '卡在墙边会自动侧移、跳跃脱困；走不到的目标会马上换掉', '到了目的地、附近又没敌人时会继续行动，不再站桩']],
      ['English 语言', ['全部界面、角色资料、技能说明、活动和公告都支持英文，可以在登录页或「设置」里切换']],
      ['官方网站', ['涂鸦机兵官网上线：所有更新都会先发布在官网，游戏里也会提示「有新版本」并带你去下载']],
      ['更新奖励', ['信箱里有一份 1.2 更新礼包：150 宝石 + 金色空投 + 300 零件']],
    ], en: [
      ['3 new maps', ['Metro Hub: a midnight underground station with two levels — great ambushes behind the pillars', 'Grayco HQ: two office towers loom over a plaza where the fountain blocks the mid lane', 'Night Market: narrow food-stall alleys under the lanterns, and you can stand on the stall roofs']],
      ['Balance (based on 900 AI matches)', [
        'Han: passive Turncoat +15% → +10%, Flashbang damage 15 → 10, slow 1.5 → 1.2s',
        'Rocky: charge damage 80 → 72, eject shield 40 → 35',
        'Frost Long Shot +12% → +18% | Blaze heal 35% → 40% | Qin self-destruct 45 → 55',
        'Bao out-of-combat regen +80% → +100%, bento 75 → 90 | Gale ejected speed +30% → +40%, longer dash invulnerability',
        'Lan Strength in Numbers −5% → −6% per ally (up to −18%)',
        'Gatling Bot: damage 5.8 → 5.4, wider spread | Spray Bot: damage 13.5 → 13 | Roller Bot: HP 125 → 120, shorter lunge',
        'Megaphone Truck: damage 21 → 23, range 330 → 350 | Drone Carrier: damage 21 → 23, HP 115 → 125, faster reload',
        'Fist Bot: HP 175 → 185 | Wrecking Hammer: damage 56 → 60, wider swing, HP 170 → 180, faster']],
      ['AI improvements', ['Ejected pilots no longer pace back and forth in place: they regroup with teammates or hide in bushes until the airdrop', 'Bots stuck on walls sidestep and jump free; unreachable goals are swapped immediately', 'Bots keep moving after reaching their destination instead of standing still']],
      ['English language', ['The entire UI, pilot bios, skill descriptions, events and patch notes are now in English — switch on the sign-in screen or in Settings']],
      ['Official website', ['The GraffiBots website is live: every update is posted there first, and the game now tells you when a new version is out and where to get it']],
      ['Update rewards', ['A 1.2 update gift is waiting in your mailbox: 150 gems + Golden Airdrop + 300 parts']],
    ] },
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
  S.CHAT_MAX = 60;   // 打字聊天每句最多 60 个字
  return S;
});
