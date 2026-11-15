// 涂鸦机兵 — 养成与经济规则（客户端和服务器共用同一套代码）
// 本机账号 / 游客：在浏览器里执行；在线账号：只在服务器上执行（开箱随机数、扣钱都在服务器），客户端只负责显示。
// 货币：金币（升级、突破）、宝石（买宝箱、兑换）、零件（升级材料）、能量结晶（突破）
(function (root, factory) {
  const S = typeof module === 'object' && module.exports ? require('./shared.js') : root.GS;
  const E = factory(S);
  S.ECO = E;
  if (typeof module === 'object' && module.exports) module.exports = E;
  else root.GE = E;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (S) {
  'use strict';
  const E = {};
  E.VERSION = 2;                  // 资料版本：低于这个版本的账号会重置成新手号
  E.CUR = {
    coins: { name: '金币', short: '金币', color: '#ffc531' },
    gems: { name: '宝石', short: '宝石', color: '#ff3ea5' },
    parts: { name: '零件', short: '零件', color: '#7af0ff' },
    crystals: { name: '能量结晶', short: '结晶', color: '#b78cff' },
    tickets: { name: '乐园票', short: '乐园票', color: '#ff6ec4' },   // 乐园祭活动代币
  };
  // 常驻角色：新手宝箱从这 5 位里给 1 位
  E.STARTER_PILOTS = ['blaze', 'frost', 'candy', 'titan', 'raven'];
  E.STARTER_MECHS = ['blaster', 'roller', 'charger'];
  E.SEASON = { id: 1, name: '灰城重涂', en: 'REPAINT', start: Date.UTC(2026, 10, 13), end: Date.UTC(2026, 11, 11) };
  // ---------------- 赛季通行证：30 级，免费线 + 高级线（宝石解锁） ----------------
  E.PASS = { tiers: 30, xpPer: 600, price: 480 };
  const C = (k, n) => ({ k, n }), CH = (id) => ({ k: 'chest', id, n: 1 }), SK = (id) => ({ k: 'skin', id }), TP = () => ({ k: 'tp', n: 1 });
  E.PASS.free = [C('coins', 100), CH('supply'), C('parts', 60), C('gems', 20), CH('military'), C('coins', 150), TP(), C('parts', 80), CH('supply'), SK('fr_tape'),
    C('coins', 200), C('gems', 30), CH('supply'), C('parts', 100), CH('military'), C('coins', 250), TP(), C('crystals', 1), CH('supply'), SK('av_flag'),
    C('coins', 300), C('gems', 40), CH('military'), C('parts', 150), C('crystals', 1), C('coins', 400), TP(), CH('supply'), C('gems', 50), CH('airdrop')];
  E.PASS.prem = [SK('blaze_grey'), C('gems', 30), CH('military'), C('coins', 300), SK('m_camo'), C('parts', 150), CH('airdrop'), C('gems', 50), C('crystals', 1), SK('fx_stars'),
    CH('military'), C('coins', 500), TP(), SK('echo_midnight'), CH('airdrop'), C('parts', 250), C('gems', 80), CH('military'), C('crystals', 2), SK('m_neon'),
    CH('airdrop'), C('coins', 800), SK('fr_rebel'), TP(), CH('airdrop'), C('gems', 100), C('crystals', 2), SK('fx_confetti'), CH('airdrop'), SK('flag_red')];
  E.passLevel = (o) => Math.min(E.PASS.tiers, Math.floor(((o.pass && o.pass.xp) || 0) / E.PASS.xpPer));
  E.matchPassXp = (rw) => 30 + (rw.won ? 30 : rw.draw ? 15 : 0) + Math.min(20, rw.kills * 2) + (rw.mvp ? 10 : 0);
  // ---------------- 每日 / 每周任务（按日期挑选，客户端和服务器一样） ----------------
  E.QUESTS = {
    win: { name: '赢 {n} 局', stat: 'won' }, play: { name: '完成 {n} 局对战', stat: 'play' }, kills: { name: '击毁 / 击倒 {n} 次', stat: 'kills' },
    paint: { name: '涂地 {n} 格', stat: 'paint' }, mvp: { name: '拿到 {n} 次 MVP', stat: 'mvp' },
  };
  E.DAILY_POOL = [['win', 2, 150], ['play', 3, 120], ['kills', 8, 120], ['paint', 1500, 120], ['mvp', 1, 150], ['kills', 12, 150], ['paint', 2500, 150]];
  E.WEEKLY = [['win', 10, 700], ['play', 25, 600], ['kills', 60, 600], ['paint', 15000, 600]];
  E.weekIndex = (now) => Math.floor((E.dayIndex(now) + 3) / 7);
  E.dailyQuests = (day) => { const out = [], used = new Set(); let h = (day * 2654435761) >>> 0; while (out.length < 3) { h = (h * 1103515245 + 12345) >>> 0; const i = h % E.DAILY_POOL.length; if (!used.has(i)) { used.add(i); out.push(E.DAILY_POOL[i]); } } return out; };
  E.questName = (q) => E.QUESTS[q[0]].name.replace('{n}', q[1]);
  E.SEASON_PILOTS = ['flag', 'hammer', 'echo'];      // 本赛季新角色：只能从街头宝箱开出
  E.SEASON_MECHS = ['dozer', 'flamer', 'carrier', 'wrecker', 'megaphone'];
  E.QUEST_ONLY = ['han', 'riot'];   // 只能通过任务获得，不会从宝箱开出
  E.STRIKE_MECHS = ['blade', 'stinger', 'phantom'];   // 袭击！特攻队：只会从「特攻队补给箱」开出
  E.NEW_OFFER = { pilot: 'kaka', mech: 'slinger', until: Date.UTC(2026, 10, 28, 16) };   // 新常驻角色上架期间，限时购买必出
  // ---------------- 限时活动 ----------------
  const RW = (k, n) => ({ k, n }), RC = (id) => ({ k: 'chest', id, n: 1 }), RS = (id) => ({ k: 'skin', id });
  E.EVENTS = [
    { id: 'fightback', name: '灰城反击周', start: Date.UTC(2026, 10, 12, 16), end: Date.UTC(2026, 10, 26, 16), color: '#ff5a36',
      desc: '反抗军发起总攻！活动期间每局对战的金币 ×1.5，完成下面的任务领取限定奖励。', coinMul: 1.5,
      quests: [['play', 5, RC('military')], ['win', 5, RW('gems', 60)], ['kills', 30, RW('coins', 500)], ['paint', 8000, RS('av_can')], ['elim', 3, RC('airdrop')]] },
    { id: 'escapefest', name: '逃亡圈狂欢', start: Date.UTC(2026, 10, 19, 16), end: Date.UTC(2026, 11, 3, 16), color: '#9cff2e',
      desc: '毒圈又缩小了！活动期间逃亡圈对局的通行证经验 ×2，冲进前三名吧。', escPassMul: 2,
      quests: [['escape', 5, RW('crystals', 1)], ['top3', 3, RW('gems', 80)], ['crates', 10, RC('military')]] },
    { id: 'parkfest', name: '乐园祭', start: Date.UTC(2026, 10, 13, 16), end: Date.UTC(2026, 10, 28, 16), color: '#ff6ec4',
      desc: '嘉年华来到灰城！玩新模式「乐园模式」完成任务赚取乐园票，在活动商店兑换特攻队补给箱、夏日皮肤等丰富奖励。每局乐园模式还会额外给乐园票。',
      ticketsPerPark: 10, ticketsWin: 5,
      quests: [['park', 3, RW('tickets', 60)], ['parkwin', 3, RW('tickets', 80)], ['balloons', 15, RW('tickets', 80)], ['float', 120, RW('tickets', 100)], ['play', 10, RW('tickets', 60)], ['park', 10, RW('tickets', 150)]],
      shop: [{ it: RC('strike'), cost: 120, limit: 5 }, { it: RS('candy_beach'), cost: 400, limit: 1 }, { it: RS('av_balloon'), cost: 60, limit: 1 }, { it: RC('airdrop'), cost: 200, limit: 2 },
        { it: RW('gems', 50), cost: 80, limit: 5 }, { it: RW('crystals', 1), cost: 150, limit: 2 }, { it: RW('coins', 800), cost: 60, limit: 5 }] },
  ];
  E.EVENT_STAT = { play: '完成 {n} 局对战', win: '赢 {n} 局', kills: '击毁 / 击倒 {n} 次', paint: '涂地 {n} 格', elim: '玩 {n} 局生死之战', escape: '玩 {n} 局逃亡圈', top3: '逃亡圈进入前三名 {n} 次', crates: '逃亡圈捡 {n} 个空投箱',
    park: '玩 {n} 局乐园模式', parkwin: '乐园模式赢 {n} 局', balloons: '打爆 {n} 个气球', float: '在花车光圈里累计 {n} 秒', ranked: '玩 {n} 局排位赛', lvl: '账号升到 {n} 级',
    lootex: '搜刮撤离成功撤离 {n} 次', lootv: '累计撤离价值 {n} 的物资', lootgold: '带出 {n} 件传说物资', loothi: '高危行动成功撤离 {n} 次', loot: '玩 {n} 局搜刮撤离' };
  E.statName = (k, n) => E.EVENT_STAT[k].replace('{n}', n);
  E.activeEvents = (now) => E.EVENTS.filter((ev) => (now || Date.now()) >= ev.start && (now || Date.now()) < ev.end);
  // ---------------- 任务线：叛将档案（永久） ----------------
  E.STORY = { id: 'defector', name: '叛将档案', desc: '灰石集团的安保主管想要投诚……完成她的考验，把她和她的防暴盾卫带回反抗军。',
    steps: [['play', 3], ['win', 3], ['kills', 20], ['elim', 2], ['paint', 5000]],
    rewards: [[3, { k: 'mech', id: 'riot' }], [5, { k: 'pilot', id: 'han' }]] };
  // ---------------- 任务线：每完成一个任务就领一次奖励（永久） ----------------
  E.TASKLINES = {
    strike: { name: '袭击！特攻队', desc: '灰石集团派出了刺客型机兵特攻队。完成作战任务领取「特攻队补给箱」，有机会开出影刃、毒针、幻影三台刺客机体。', color: '#2a1f3a',
      steps: [['play', 5, RC('strike')], ['kills', 25, RC('strike')], ['win', 5, RC('strike')], ['paint', 6000, RC('strike')], ['ranked', 3, RC('strike')], ['balloons', 20, RC('strike')]] },
    rookie: { name: '新兵之路', desc: '刚加入反抗军？跟着任务走，很快就能凑齐 3 位驾驶员、3 台机体，参加排位赛！', color: '#9cff2e',
      steps: [['play', 1, RW('gems', 100)], ['win', 1, RC('starter')], ['play', 3, RW('gems', 150)], ['kills', 10, RC('starter')], ['lvl', 3, RC('hero')], ['ranked', 1, RW('gems', 200)]] },
  };
  E.TASKLINES.loot = { name: '搜刮行动', desc: '灰城外围发现了大量废弃物资！进入超大地图搜刮、和其他小队争夺，活着撤离才算数。', color: '#ffb000',
    steps: [['loot', 1, RW('gems', 60)], ['lootex', 1, RW('coins', 1000)], ['lootv', 8000, RW('gems', 120)], ['lootex', 5, RC('strike')], ['lootgold', 1, RW('gems', 150)], ['loothi', 1, RW('crystals', 1)], ['lootv', 60000, RC('airdrop')]] };
  E.TASKLINE_ORDER = ['rookie', 'loot', 'strike'];
  // ---------------- 排位赛：段位、分数、段位奖励 ----------------
  E.RANK = {
    need: { pilots: 3, mechs: 3 },   // 至少拥有 3 位驾驶员和 3 台机体
    banFrom: 2,                       // 从黄金段位开始有禁用阶段
    win: 24, draw: 4, loss: -14, mvp: 6, protect: 1,   // 青铜 / 白银掉分不会掉段
    coinMul: 1.5, passMul: 1.5,
    tiers: [
      { id: 'bronze', name: '青铜', rp: 0, color: '#c8814a' },
      { id: 'silver', name: '白银', rp: 100, color: '#c9d3dc', reward: RW('gems', 80) },
      { id: 'gold', name: '黄金', rp: 250, color: '#ffd23f', reward: RC('strike') },
      { id: 'plat', name: '铂金', rp: 450, color: '#5fe8d0', reward: RC('airdrop') },
      { id: 'diamond', name: '钻石', rp: 700, color: '#7ab8ff', reward: RW('crystals', 2) },
      { id: 'master', name: '大师', rp: 1000, color: '#b06bff', reward: RS('fr_master') },
      { id: 'legend', name: '传奇', rp: 1400, color: '#ff3b52', reward: RW('gems', 500) },
    ],
  };
  E.rankTier = (rp) => { let i = 0; E.RANK.tiers.forEach((t, k) => { if ((rp || 0) >= t.rp) i = k; }); return i; };
  E.canRanked = (o) => Object.keys(o.pilots || {}).length >= E.RANK.need.pilots && (o.mechs || []).length >= E.RANK.need.mechs;
  // 排位赛玩法每 2 小时轮换
  E.RANK_MODES = ['zone', 'escort', 'park', 'turf', 'battery', 'elim'];
  E.RANK_HOURS = 2;
  E.rankedMode = (now) => E.RANK_MODES[Math.floor((now || Date.now()) / (E.RANK_HOURS * 3600e3)) % E.RANK_MODES.length];
  E.rankedModeEnds = (now) => (Math.floor((now || Date.now()) / (E.RANK_HOURS * 3600e3)) + 1) * E.RANK_HOURS * 3600e3;
  // 克制关系：key 机体会被 value 里的机体克制
  E.COUNTERS = {
    charger: ['blade', 'phantom'], mortar: ['blade', 'stinger'], slinger: ['blade', 'phantom'], carrier: ['riot', 'blade'], gatling: ['mortar', 'charger'],
    blaster: ['bucket', 'phantom'], bucket: ['charger', 'stinger'], roller: ['charger', 'stinger'], fist: ['stinger', 'charger'], wrecker: ['stinger', 'charger'],
    riot: ['megaphone', 'mortar'], dozer: ['stinger', 'mortar'], flamer: ['charger', 'carrier'], megaphone: ['blade', 'fist'],
    blade: ['riot', 'fist', 'wrecker'], stinger: ['blade', 'phantom'], phantom: ['megaphone', 'carrier', 'flamer'],
  };
  // 禁用阶段：自己禁 1 个，AI 队友禁 1 个（保护你的选择），对手禁 2 个（针对你的王牌 + 强势机体）
  // ctx = { myBan: { k: 'pilot'|'mech', id }, pick: { pilot, mech }, o: 玩家资料 }
  E.draftBans = function (ctx) {
    const meta = S.META || { pilots: {}, mechs: {} }, o = ctx.o;
    const bans = [{ side: 'me', k: ctx.myBan.k, id: ctx.myBan.id, why: 'mine' }];
    const banned = (k, id) => bans.some((b) => b.k === k && b.id === id);
    const ownedLeft = (k, extra) => (k === 'pilot' ? Object.keys(o.pilots) : o.mechs).filter((id) => !banned(k, id) && id !== extra).length;
    const safe = (k, id) => id && !banned(k, id) && !((k === 'pilot' ? !!o.pilots[id] : o.mechs.includes(id)) && ownedLeft(k, id) < 1);   // 保证玩家至少还有 1 个能用
    const sc = (k, id) => (k === 'pilot' ? meta.pilots[id] : meta.mechs[id]) || 0.5;
    const allP = S.PILOTS.map((P) => P.id), allM = S.WEAPON_ORDER.slice();
    const best = (k, list) => list.filter((id) => safe(k, id)).sort((a, b2) => sc(k, b2) - sc(k, a))[0];
    // 队友：如果你禁的是驾驶员，就替你禁掉克制你机体的；否则禁当前强度最高的驾驶员
    const ctr = best('mech', E.COUNTERS[ctx.pick.mech] || []);
    if (ctx.myBan.k === 'pilot' && ctr) bans.push({ side: 'ally', k: 'mech', id: ctr, why: 'counter', vs: ctx.pick.mech });
    else { const pp = best('pilot', allP.filter((id) => id !== ctx.pick.pilot && !o.pilots[id])) || best('pilot', allP.filter((id) => id !== ctx.pick.pilot)); if (pp) bans.push({ side: 'ally', k: 'pilot', id: pp, why: 'meta' }); }
    // 对手：你的王牌驾驶员（等级最高、强度高），以及强势机体（优先你拥有的）
    const ace = Object.entries(o.pilots).filter(([id]) => safe('pilot', id)).sort((a, b2) => (b2[1].lv + b2[1].bt * 2 + sc('pilot', b2[0]) * 4) - (a[1].lv + a[1].bt * 2 + sc('pilot', a[0]) * 4))[0];
    const ep = ace ? ace[0] : best('pilot', allP);
    if (ep) bans.push({ side: 'enemy', k: 'pilot', id: ep, why: ace ? 'ace' : 'meta' });
    const mine = o.mechs.filter((id) => safe('mech', id)).sort((a, b2) => sc('mech', b2) - sc('mech', a))[0];
    const em = mine && sc('mech', mine) >= 0.5 ? mine : best('mech', allM);
    if (em) bans.push({ side: 'enemy', k: 'mech', id: em, why: em === mine ? 'yours' : 'meta' });
    return bans;
  };
  E.BAN_WHY = { mine: '你的选择', counter: '克制你的{v}', meta: '当前强度最高', ace: '针对你的王牌驾驶员', yours: '你拥有的强势机体' };
  E.rankBotPower = (tier) => ({ lv: Math.min(11, 3 + tier + (tier >= 4 ? 1 : 0)), bt: tier >= 5 ? 2 : tier >= 2 ? 1 : 0 });   // AI 强度跟着段位
  // ---------------- 信箱（系统邮件：版本补偿 / 活动礼包） ----------------
  E.MAILS = [
    { id: 'v15', t: Date.UTC(2026, 10, 14, 4), from: '灰城反抗军指挥部', title: '1.5 更新礼包', body: '1.5 版本上线啦：点驾驶员和机体就能进入全新的角色页面，画面更精致，所有角色和机体都重新调整了平衡。这份更新礼包请收下！', items: [RW('gems', 150), RC('hero'), RW('coins', 1500)] },
    { id: 'v16', t: Date.UTC(2026, 10, 15, 2), from: '灰城反抗军指挥部', title: '1.6 更新礼包', body: '全新玩法「搜刮撤离」上线！进入两张超大地图搜刮物资、和其他小队争夺，活着撤离就能把物资带回仓库。送你几件装备，去高危行动碰碰运气吧！', items: [RW('gems', 150), RW('coins', 2000), RC('military')] },
    { id: 'v141', t: Date.UTC(2026, 10, 14, 3), from: '灰城反抗军指挥部', title: '1.4.1 更新礼包', body: '对战里可以打字聊天啦！按 Enter（手机点 💬）就能和队友、对手说话。排位赛的对手也按段位重新划分了水平。这份小礼物请收下！', items: [RW('gems', 80), RW('coins', 1500), RW('tickets', 50)] },
    { id: 'v14', t: Date.UTC(2026, 10, 14, 2), from: '灰城反抗军指挥部', title: '1.4 更新礼包', body: '乐园祭开幕啦！新模式「乐园模式」、袭击！特攻队、夏日皮肤和排位赛都上线了。这份更新礼包请收下！', items: [RW('gems', 200), RC('strike'), RW('tickets', 100)] },
    { id: 'v131', t: Date.UTC(2026, 10, 14, 1), from: '灰城反抗军指挥部', title: '1.3.1 更新礼包', body: '官网正式上线啦！在「驾驶员」里选中角色，看看他们的 3D 展示动作。这份小礼物请收下！', items: [RW('gems', 50), RW('coins', 1000)] },
    { id: 'v13', t: Date.UTC(2026, 10, 14, 0), from: '灰城反抗军指挥部', title: '1.3 更新礼包', body: '1.3 版本上线啦：15 位驾驶员换上了全新的 3D 模型，弹出后还会拿出自己的专属武器。这份更新礼包请收下！', items: [RW('gems', 100), RC('hero'), RW('coins', 2000)] },
    { id: 'v12', t: Date.UTC(2026, 10, 13, 16), from: '灰城反抗军指挥部', title: '1.2 更新礼包', body: '1.2 版本上线啦：3 张新地图、平衡调整、更聪明的 AI、英文版和官方网站。这份更新礼包请收下！', items: [RW('gems', 150), RC('airdrop'), RW('parts', 300)] },
    { id: 'v11', t: Date.UTC(2026, 10, 12, 16), from: '灰城反抗军指挥部', title: '1.1 维护更新补偿', body: '感谢等待！1.1 版本带来了新驾驶员「韩冰」、防暴盾卫、限时活动、新天赋和观战模式。这是本次维护的补偿，请收下。', items: [RW('gems', 100), RC('military')] },
    { id: 'fightback_gift', t: Date.UTC(2026, 10, 12, 16), from: '活动组', title: '「灰城反击周」开幕礼包', body: '总攻开始！先送上一份物资，活动期间对战金币 ×1.5。', items: [RW('coins', 500), RC('supply'), RC('supply')] },
    { id: 'han_gift', t: Date.UTC(2026, 10, 12, 16), from: '韩冰', title: '叛将的见面礼', body: '我知道你们不信任我。这些零件是从灰石集团仓库里带出来的，就当是投名状吧。完成「叛将档案」，我就正式加入你们。', items: [RW('parts', 200), RW('crystals', 1)] },
    { id: 'escapefest_gift', t: Date.UTC(2026, 10, 19, 16), from: '活动组', title: '「逃亡圈狂欢」礼包', body: '毒圈来了！逃亡圈通行证经验 ×2，这个空投箱祝你吃鸡。', items: [RC('airdrop')] },
  ];
  // ---------------- 限时购买：每 3 小时刷新，2 位驾驶员 + 1 台机体（只出常驻角色） ----------------
  E.OFFER = { hours: 3, pilotPrice: 320, mechPrice: 260 };
  E.offerSlot = (now) => Math.floor((now || Date.now()) / (E.OFFER.hours * 3600e3));
  E.offers = function (o, now) {
    const slot = E.offerSlot(now);
    let h = (slot * 2654435761 + 97) >>> 0;
    const rnd = () => { h = (h * 1103515245 + 12345) >>> 0; return h / 4294967296; };
    const shuffle = (arr) => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
    const pp = shuffle(S.PILOTS.map((p) => p.id).filter((id) => !E.SEASON_PILOTS.includes(id) && !E.QUEST_ONLY.includes(id)));
    const mm = shuffle(S.WEAPON_ORDER.filter((id) => !E.SEASON_MECHS.includes(id) && !E.QUEST_ONLY.includes(id) && !E.STRIKE_MECHS.includes(id)));
    // 新常驻角色 / 机体上架期间排在最前面
    if ((now || Date.now()) < E.NEW_OFFER.until) { pp.sort((a, b) => (b === E.NEW_OFFER.pilot) - (a === E.NEW_OFFER.pilot)); mm.sort((a, b) => (b === E.NEW_OFFER.mech) - (a === E.NEW_OFFER.mech)); }
    // 优先给还没有的；都有了就照常显示（标成已拥有）
    const pick = (list, has, n) => [...list.filter((id) => !has(id)), ...list.filter((id) => has(id))].slice(0, n);
    return { slot, ends: (slot + 1) * E.OFFER.hours * 3600e3, pilots: pick(pp, (id) => !!o.pilots[id], 2), mech: pick(mm, (id) => o.mechs.includes(id), 1)[0] };
  };
  E.MAIL_DAYS = 30;        // 领过的邮件最多保留 30 天（可以手动删除）
  E.MAIL_UNCLAIMED = 3;    // 没领取的奖励 3 天后自动删除
  E.mailbox = (o, now) => {
    now = now || Date.now();
    const got = o.mailGot || [], del = o.mailDel || [];
    return E.MAILS.filter((m) => now >= m.t && !del.includes(m.id) && now < m.t + (got.includes(m.id) ? E.MAIL_DAYS : E.MAIL_UNCLAIMED) * 86400e3)
      .map((m) => Object.assign({}, m, { got: got.includes(m.id), expires: m.t + E.MAIL_UNCLAIMED * 86400e3 }));
  };
  E.START = { coins: 200, gems: 40, parts: 30, crystals: 0 };

  // ---------------- 升级与突破 ----------------
  E.MAX_LV = 11;
  E.LV_BONUS = 0.04;              // 每级生命和伤害 +4%（满级 +40%）
  E.FAIR_LV = 7; E.FAIR_BT = 1;   // 公平模式：所有人按 7 级、突破 I 计算
  // 第 i 项 = 从 i 级升到 i+1 级的花费
  E.UP_COINS = [0, 20, 35, 75, 140, 290, 480, 800, 1250, 1875, 2800];
  E.UP_PARTS = [0, 10, 20, 30, 50, 80, 130, 210, 340, 550, 800];
  E.BREAKS = [null,
    { at: 5, crystals: 1, coins: 500, name: '突破 I', desc: '解锁超载技能，等级上限提升到 9' },
    { at: 9, crystals: 3, coins: 1500, name: '突破 II', desc: '被动特性强化，超载技能更强，等级上限提升到 11' },
  ];
  E.lvCap = (bt) => (bt >= 2 ? 11 : bt >= 1 ? 9 : 5);
  E.statMul = (lv) => 1 + (Math.max(1, Math.min(E.MAX_LV, lv | 0)) - 1) * E.LV_BONUS;

  // ---------------- 宝箱（概率公开，没有保底） ----------------
  // drops：每一项独立判定。pilot / mech 只会给还没拥有的；都拥有了就换成金币（dup）
  E.CHESTS = {
    starter: { name: '新手宝箱', tier: 0, price: 0, buy: false, desc: '必得 1 位常驻驾驶员', dup: 300,
      drops: [{ k: 'pilot', p: 1, pool: 'starter' }, { k: 'coins', p: 1, min: 100, max: 100 }, { k: 'parts', p: 1, min: 40, max: 40 }] },
    supply: { name: '补给箱', tier: 1, price: 40, buy: true, desc: '街头宝箱 · 普通', dup: 120,
      drops: [{ k: 'coins', p: 1, min: 40, max: 90 }, { k: 'parts', p: 1, min: 15, max: 30 }, { k: 'gems', p: 0.25, min: 5, max: 15 },
        { k: 'crystals', p: 0.03, min: 1, max: 1 }, { k: 'pilot', p: 0.02, pool: 'all' }, { k: 'mech', p: 0.04 }] },
    military: { name: '军用箱', tier: 2, price: 100, buy: true, desc: '街头宝箱 · 稀有', dup: 300,
      drops: [{ k: 'coins', p: 1, min: 150, max: 260 }, { k: 'parts', p: 1, min: 40, max: 80 }, { k: 'gems', p: 0.45, min: 15, max: 40 },
        { k: 'crystals', p: 0.1, min: 1, max: 1 }, { k: 'pilot', p: 0.06, pool: 'all' }, { k: 'mech', p: 0.1 }] },
    airdrop: { name: '金色空投', tier: 3, price: 260, buy: true, desc: '街头宝箱 · 传说', dup: 800,
      drops: [{ k: 'coins', p: 1, min: 500, max: 900 }, { k: 'parts', p: 1, min: 120, max: 220 }, { k: 'gems', p: 0.7, min: 60, max: 150 },
        { k: 'crystals', p: 0.35, min: 1, max: 2 }, { k: 'pilot', p: 0.2, pool: 'all' }, { k: 'mech', p: 0.3 }] },
    hero: { name: '角色宝箱', tier: 2, price: 180, buy: true, desc: '更容易开出常驻驾驶员', dup: 400,
      drops: [{ k: 'pilot', p: 0.3, pool: 'standard' }, { k: 'coins', p: 1, min: 200, max: 300 }, { k: 'parts', p: 1, min: 60, max: 100 }] },
    strike: { name: '特攻队补给箱', tier: 3, price: 0, buy: false, desc: '有机会开出「袭击！特攻队」刺客机体', dup: 500,
      drops: [{ k: 'mech', p: 0.35, pool: 'strike' }, { k: 'coins', p: 1, min: 250, max: 400 }, { k: 'parts', p: 1, min: 60, max: 120 }, { k: 'gems', p: 0.4, min: 20, max: 50 }] },
  };
  E.CHEST_ORDER = ['supply', 'military', 'airdrop', 'hero'];
  // 宝石兑换（一次兑换的量）
  E.EXCHANGE = {
    parts: { name: '零件包', gems: 10, give: { parts: 60 } },
    coins: { name: '金币袋', gems: 10, give: { coins: 120 } },
    crystal: { name: '能量结晶', gems: 150, give: { crystals: 1 } },
  };
  // 一局的金币 / 每日首胜宝石
  E.matchCoins = (rw) => 20 + (rw.won ? 20 : rw.draw ? 10 : 0) + Math.min(30, rw.kills * 3) + (rw.mvp ? 10 : 0);
  E.FIRST_WIN_GEMS = 20;
  E.LEVELUP = { coins: 100, gems: 10 };   // 账号每升 1 级

  // ---------------- 资料 ----------------
  const POOL = {
    starter: () => E.STARTER_PILOTS,
    standard: () => S.PILOTS.map((p) => p.id).filter((id) => !E.SEASON_PILOTS.includes(id) && !E.QUEST_ONLY.includes(id)),
    all: () => S.PILOTS.map((p) => p.id).filter((id) => !E.QUEST_ONLY.includes(id)),
  };
  const int = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.floor(+v || 0)));
  E.newProfile = function (name) {
    return Object.assign({
      v: E.VERSION, name: name || '', tut: 0,
      pilots: {}, mechs: E.STARTER_MECHS.slice(), chests: {},
      pilot: '', weapon: E.STARTER_MECHS[0], head: 'antenna', mode: 'turf', map: -1, size: 3, dur: 180, fair: false,
      trophies: 0, xp: 0, matches: 0, wins: 0, kills: 0, paint: 0, day: 0, dayWin: 0,
      talents: [], tal: [], tpBonus: 0,
      pass: { s: 1, xp: 0, prem: false, cf: [], cp: [] }, q: { d: 0, dp: [0, 0, 0], w: 0, wp: [0, 0, 0, 0] },
      skins: [], wear: {}, mailGot: [], mailDel: [], stash: {}, gear: {}, gearOn: [], lootRec: { runs: 0, ex: 0, best: 0, total: 0, gold: 0, wk: 0, wbest: 0 }, ev: {}, story: { p: [0, 0, 0, 0, 0], c: [] },
      tl: {}, rank: { rp: 0, best: 0, got: [], n: 0 }, streak: 0, bestStreak: 0,
    }, E.START);
  };
  // 读取任意来源的资料：旧版本直接重置成新手号；字段做类型和范围检查
  E.normalize = function (p, name) {
    if (!p || typeof p !== 'object' || p.v !== E.VERSION) return E.newProfile(name != null ? name : p && typeof p.name === 'string' ? p.name : '');
    const o = E.newProfile(typeof p.name === 'string' ? p.name : name || '');
    o.tut = p.tut ? 1 : 0;
    for (const k of ['coins', 'gems', 'parts', 'crystals', 'tickets', 'trophies', 'xp', 'matches', 'wins', 'kills', 'paint', 'day', 'dayWin', 'tpBonus', 'streak', 'bestStreak']) o[k] = int(p[k], 0, 1e9);
    // 天赋：只保留按顺序点亮的（同一支必须先点前一级）
    const want = new Set(Array.isArray(p.talents) ? p.talents : []);
    o.talents = S.TALENTS.filter((t) => want.has(t.id)).filter((t, _, arr) => t.tier === 1 || arr.some((u) => u.br === t.br && u.tier === t.tier - 1)).map((t) => t.id);
    while (E.tpSpent(o) > E.tpTotal(o)) o.talents.pop();
    o.pilots = {};
    if (p.pilots && typeof p.pilots === 'object') {
      for (const P of S.PILOTS) {
        const q = p.pilots[P.id];
        if (!q) continue;
        const bt = int(q.bt, 0, 2);
        o.pilots[P.id] = { lv: int(q.lv, 1, E.lvCap(bt)), bt };
      }
    }
    o.mechs = Array.isArray(p.mechs) ? [...new Set(p.mechs.filter((w) => S.WEAPONS[w]))] : E.STARTER_MECHS.slice();
    for (const w of E.STARTER_MECHS) if (!o.mechs.includes(w)) o.mechs.push(w);
    // 通行证 / 任务 / 皮肤
    const ps = p.pass && typeof p.pass === 'object' && p.pass.s === E.SEASON.id ? p.pass : null;
    if (ps) {
      const tierList = (a) => (Array.isArray(a) ? [...new Set(a.filter((t) => Number.isInteger(t) && t >= 1 && t <= E.PASS.tiers))] : []);
      o.pass = { s: E.SEASON.id, xp: int(ps.xp, 0, E.PASS.tiers * E.PASS.xpPer), prem: !!ps.prem, cf: tierList(ps.cf), cp: tierList(ps.cp) };
    }
    if (p.q && typeof p.q === 'object') {
      const arr = (a, n, hi) => Array.from({ length: n }, (_, i) => int(Array.isArray(a) ? a[i] : 0, 0, hi));
      o.q = { d: int(p.q.d, 0, 1e7), dp: arr(p.q.dp, 3, 1e6), w: int(p.q.w, 0, 1e7), wp: arr(p.q.wp, 4, 1e7) };
    }
    o.skins = Array.isArray(p.skins) ? [...new Set(p.skins.filter((id) => S.skin(id)))] : [];
    // 1.6：仓库 / 装备 / 搜刮记录
    o.stash = {}; if (p.stash && typeof p.stash === 'object') for (const k of S.LOOT_KEYS) { const n = int(p.stash[k], 0, 9999); if (n) o.stash[k] = n; }
    o.gear = {}; if (p.gear && typeof p.gear === 'object') for (const g of Object.keys(S.LOOT.gear)) { const n = int(p.gear[g], 0, 99); if (n) o.gear[g] = n; }
    o.gearOn = Array.isArray(p.gearOn) ? [...new Set(p.gearOn.filter((g) => o.gear[g] > 0))] : [];
    if (p.lootRec && typeof p.lootRec === 'object') for (const k of Object.keys(o.lootRec)) o.lootRec[k] = int(p.lootRec[k], 0, 1e9);
    o.mailGot = Array.isArray(p.mailGot) ? [...new Set(p.mailGot.filter((id) => E.MAILS.some((m) => m.id === id)))] : [];
    o.mailDel = Array.isArray(p.mailDel) ? [...new Set(p.mailDel.filter((id) => E.MAILS.some((m) => m.id === id)))] : [];
    o.ev = {};
    if (p.ev && typeof p.ev === 'object') for (const ev of E.EVENTS) { const q = p.ev[ev.id]; if (q) o.ev[ev.id] = { p: ev.quests.map((_, i) => int(Array.isArray(q.p) ? q.p[i] : 0, 0, 1e7)), c: ev.quests.map((_, i) => !!(Array.isArray(q.c) && q.c[i])), s: (ev.shop || []).map((_, i) => int(Array.isArray(q.s) ? q.s[i] : 0, 0, 999)) }; }
    o.tl = {};
    if (p.tl && typeof p.tl === 'object') for (const id of Object.keys(E.TASKLINES)) { const q = p.tl[id], L = E.TASKLINES[id]; if (q) o.tl[id] = { p: L.steps.map((_, i) => int(Array.isArray(q.p) ? q.p[i] : 0, 0, 1e7)), c: L.steps.map((_, i) => !!(Array.isArray(q.c) && q.c[i])) }; }
    if (p.rank && typeof p.rank === 'object') { const rp = int(p.rank.rp, 0, 1e6); o.rank = { rp, best: Math.max(E.rankTier(rp), int(p.rank.best, 0, E.RANK.tiers.length - 1)), got: (Array.isArray(p.rank.got) ? p.rank.got : []).filter((n) => Number.isInteger(n) && n > 0 && n < E.RANK.tiers.length), n: int(p.rank.n, 0, 1e7) }; }
    if (p.story && typeof p.story === 'object') o.story = { p: E.STORY.steps.map((_, i) => int(Array.isArray(p.story.p) ? p.story.p[i] : 0, 0, 1e7)), c: (Array.isArray(p.story.c) ? p.story.c : []).filter((n) => E.STORY.rewards.some((r) => r[0] === n)) };
    o.chests = {};
    if (p.chests && typeof p.chests === 'object') for (const c in E.CHESTS) { const n = int(p.chests[c], 0, 999); if (n) o.chests[c] = n; }
    E.setLoadout(o, p);
    return o;
  };
  // 出战配置：只能选已拥有的驾驶员和机体
  E.setLoadout = function (o, p) {
    p = p || {};
    if (o.pilots[p.pilot]) o.pilot = p.pilot;
    if (!o.pilots[o.pilot]) o.pilot = Object.keys(o.pilots)[0] || '';
    if (o.mechs.includes(p.weapon)) o.weapon = p.weapon;
    if (!o.mechs.includes(o.weapon)) o.weapon = o.mechs[0];
    if (S.MODES && S.MODES[p.mode]) o.mode = p.mode;
    if (Number.isInteger(p.map) && S.MAPS && p.map >= -1 && p.map < S.MAPS.length) o.map = p.map;
    if (Number.isInteger(p.size) && p.size >= 1 && p.size <= 4) o.size = p.size;
    if ([120, 180, 240].includes(p.dur)) o.dur = p.dur;
    if (typeof p.fair === 'boolean') o.fair = p.fair;
    if (p.wear && typeof p.wear === 'object') {
      const w = { pilot: {} };
      if (p.wear.pilot && typeof p.wear.pilot === 'object') for (const [pid, sk] of Object.entries(p.wear.pilot)) { const K = S.skin(sk); if (K && K.kind === 'pilot' && K.pilot === pid && o.skins.includes(sk)) w.pilot[pid] = sk; }
      for (const k of ['mech', 'fx', 'frame', 'avatar']) { const K = S.skin(p.wear[k]); if (K && K.kind === k && o.skins.includes(K.id)) w[k] = K.id; }
      o.wear = w;
    }
    if (Array.isArray(p.tal)) o.tal = [...new Set(p.tal)].filter((id) => o.talents.includes(id)).slice(0, S.TALENT_SLOTS);
    o.tal = (o.tal || []).filter((id) => o.talents.includes(id));
    const head = S.HEADS.find((h) => h.id === p.head);
    if (head && head.tr <= (o.trophies || 0)) o.head = p.head;
    if (!S.HEADS.some((h) => h.id === o.head && h.tr <= (o.trophies || 0))) o.head = 'antenna';
    return o;
  };
  E.LOADOUT_FIELDS = ['pilot', 'weapon', 'head', 'mode', 'map', 'size', 'dur', 'fair', 'tal', 'wear'];
  // 对战里别人看得到的外观
  E.looks = (o) => { const w = o.wear || {}; return { pskin: (w.pilot || {})[o.pilot] || '', paint: w.mech || '', fx: w.fx || '', frame: w.frame || '', avatar: w.avatar || '' }; };
  E.dailyDeal = (day) => { const list = S.SKINS.filter((k) => k.price > 0); return { id: list[((day * 7) >>> 0) % list.length].id, off: 0.3 }; };
  E.skinPrice = (K, now) => { const d = E.dailyDeal(E.dayIndex(now)); return d.id === K.id ? Math.round(K.price * (1 - d.off)) : K.price; };
  // 天赋点：账号每升 1 级 +1，开局送 2 点，通行证还会给
  E.tpTotal = (o) => 2 + S.levelFromXp(o.xp || 0) - 1 + (o.tpBonus || 0);
  E.tpSpent = (o) => (o.talents || []).reduce((a, id) => a + ((S.talent(id) || {}).cost || 0), 0);
  E.tpFree = (o) => E.tpTotal(o) - E.tpSpent(o);
  E.hasPilot = (o, id) => !!(o.pilots && o.pilots[id]);
  E.hasMech = (o, id) => !!(o.mechs && o.mechs.includes(id));
  E.power = (o, id) => { const q = o.pilots && o.pilots[id]; return Object.assign(q ? { lv: q.lv, bt: q.bt } : { lv: 1, bt: 0 }, { tal: (o.tal || []).slice(0, S.TALENT_SLOTS), gear: (o.gearOn || []).filter((g) => (o.gear || {})[g] > 0) }); };
  // 1.6：仓库价值 + 每周最佳撤离排行（同一周里固定的一批对手成绩）
  E.stashValue = (o) => Object.entries(o.stash || {}).reduce((a, [k, n]) => a + (S.LOOT.items[k] ? S.LOOT.items[k].v * n : 0), 0);
  E.sellPrice = (k) => Math.floor(((S.LOOT.items[k] || {}).v || 0) / 10);
  E.lootBoard = (o, now) => {
    const wk = E.weekIndex(now);
    let st = (wk * 2654435761) >>> 0;
    const R = () => { st = (st * 1664525 + 1013904223) >>> 0; return st / 4294967296; };
    const NAMES = ['今晚吃涂料', 'xXSniperXx', '摸鱼专业户', 'Kiwi', '喷漆小王子', 'ZeroLag', '奶茶三分糖', 'Tofu', '涂鸦大王', 'ghost404', '老六', 'paintgod', '夜猫子', 'Blitz', '熬夜冠军', 'momo233', '稳住别浪', 'Nova', '一只咸鱼', 'Ace'];
    const rows = NAMES.map((n) => ({ name: n, v: Math.round((3000 + Math.pow(R(), 2.2) * 42000) / 10) * 10 }));
    const mine = o.lootRec && o.lootRec.wk === wk ? o.lootRec.wbest : 0;
    rows.push({ name: o.name || '你', v: mine, me: true });
    rows.sort((a, b) => b.v - a.v);
    return rows;
  };
  E.dayIndex = (now) => Math.floor(((now || Date.now()) + 8 * 3600e3) / 86400e3);   // 按北京时间换天

  // ---------------- 宝箱概率（给界面显示） ----------------
  E.odds = function (cid) {
    const C = E.CHESTS[cid];
    return C.drops.map((d) => {
      const nm = d.k === 'pilot' ? (d.pool === 'starter' ? '常驻驾驶员（5 选 1）' : d.pool === 'standard' ? '未拥有的常驻驾驶员' : '未拥有的驾驶员（含赛季新角色）')
        : d.k === 'mech' ? (d.pool === 'strike' ? '未拥有的特攻队刺客机体（影刃 / 毒针 / 幻影）' : '未拥有的机体（含赛季新机体）') : E.CUR[d.k].name + (d.min === d.max ? ` ×${d.min}` : ` ×${d.min}–${d.max}`);
      return { k: d.k, name: nm, p: d.p };
    });
  };

  function roll(o, cid, rand) {
    const C = E.CHESTS[cid], items = [];
    for (const d of C.drops) {
      if (rand() >= d.p) continue;
      if (d.k === 'pilot' || d.k === 'mech') {
        const pool = d.k === 'pilot' ? POOL[d.pool]().filter((id) => !o.pilots[id])
          : (d.pool === 'strike' ? E.STRIKE_MECHS : S.WEAPON_ORDER.filter((id) => !E.QUEST_ONLY.includes(id) && !E.STRIKE_MECHS.includes(id))).filter((id) => !o.mechs.includes(id));
        if (!pool.length) { items.push({ k: 'coins', n: C.dup, dup: d.k }); continue; }
        const id = pool[Math.floor(rand() * pool.length) % pool.length];
        items.push({ k: d.k, id });
      } else items.push({ k: d.k, n: d.min + Math.floor(rand() * (d.max - d.min + 1)) });
    }
    return items;
  }
  function grant(o, items) {
    for (const it of items) {
      if (it.k === 'pilot') { o.pilots[it.id] = { lv: 1, bt: 0 }; if (!o.pilots[o.pilot]) o.pilot = it.id; }
      else if (it.k === 'mech') { if (!o.mechs.includes(it.id)) o.mechs.push(it.id); }
      else if (it.k === 'chest') o.chests[it.id] = (o.chests[it.id] || 0) + it.n;
      else if (it.k === 'skin') { if (!o.skins.includes(it.id)) o.skins.push(it.id); }
      else if (it.k === 'tp') o.tpBonus = (o.tpBonus || 0) + it.n;
      else if (it.k === 'passxp') o.pass.xp = Math.min(E.PASS.tiers * E.PASS.xpPer, o.pass.xp + it.n);
      else if (E.CUR[it.k]) o[it.k] = (o[it.k] || 0) + it.n;
    }
  }
  E.grant = grant;
  // 合并同类奖励，方便显示
  E.merge = function (items) {
    const out = [], by = {};
    for (const it of items) {
      if (E.CUR[it.k] && !it.dup && !it.why) { if (by[it.k]) by[it.k].n += it.n; else { by[it.k] = { k: it.k, n: it.n }; out.push(by[it.k]); } }
      else out.push(it);
    }
    return out;
  };

  // ---------------- 所有改变资料的操作都走这里 ----------------
  // 返回 { ok, err, items }；成功时直接修改 o
  E.apply = function (o, op, a, rand) {
    a = a || {}; rand = rand || Math.random;
    const no = (err) => ({ ok: false, err });
    switch (op) {
      case 'tutorial': {
        if (o.tut) return no('已经完成过新手教程');
        o.tut = 1;
        const items = [{ k: 'chest', id: 'starter', n: 1 }];
        grant(o, items);
        return { ok: true, items };
      }
      case 'open': {
        const C = E.CHESTS[a.chest];
        if (!C || !(o.chests[a.chest] > 0)) return no('没有这个宝箱');
        o.chests[a.chest]--;
        if (!o.chests[a.chest]) delete o.chests[a.chest];
        const items = roll(o, a.chest, rand);
        grant(o, items);
        return { ok: true, items: E.merge(items), chest: a.chest };
      }
      case 'buy': {
        const C = E.CHESTS[a.chest];
        if (!C || !C.buy) return no('这个宝箱不能购买');
        if (o.gems < C.price) return no(`宝石不够（需要 ${C.price}）`);
        o.gems -= C.price;
        const items = roll(o, a.chest, rand);
        grant(o, items);
        return { ok: true, items: E.merge(items), chest: a.chest, spent: { gems: C.price } };
      }
      case 'exchange': {
        const X = E.EXCHANGE[a.what], n = [1, 5, 10].includes(a.n) ? a.n : 1;
        if (!X) return no('不能兑换');
        if (o.gems < X.gems * n) return no(`宝石不够（需要 ${X.gems * n}）`);
        o.gems -= X.gems * n;
        const items = Object.entries(X.give).map(([k, v]) => ({ k, n: v * n }));
        grant(o, items);
        return { ok: true, items, spent: { gems: X.gems * n } };
      }
      case 'upgrade': {
        const q = o.pilots[a.pilot];
        if (!q) return no('还没有这位驾驶员');
        if (q.lv >= E.MAX_LV) return no('已经满级了');
        if (q.lv >= E.lvCap(q.bt)) return no(`需要先${E.BREAKS[q.bt + 1].name}`);
        const c = E.UP_COINS[q.lv], pt = E.UP_PARTS[q.lv];
        if (o.coins < c) return no(`金币不够（需要 ${c}）`);
        if (o.parts < pt) return no(`零件不够（需要 ${pt}）`);
        o.coins -= c; o.parts -= pt; q.lv++;
        return { ok: true, items: [], lv: q.lv, spent: { coins: c, parts: pt } };
      }
      case 'break': {
        const q = o.pilots[a.pilot];
        if (!q) return no('还没有这位驾驶员');
        const B = E.BREAKS[q.bt + 1];
        if (!B) return no('已经完成全部突破');
        if (q.lv < B.at) return no(`需要先升到 ${B.at} 级`);
        if (o.crystals < B.crystals) return no(`能量结晶不够（需要 ${B.crystals}）`);
        if (o.coins < B.coins) return no(`金币不够（需要 ${B.coins}）`);
        o.crystals -= B.crystals; o.coins -= B.coins; q.bt++;
        return { ok: true, items: [], bt: q.bt, spent: { crystals: B.crystals, coins: B.coins } };
      }
      case 'talent': {
        const T = S.talent(a.id);
        if (!T) return no('没有这个天赋');
        if (o.talents.includes(T.id)) return no('已经点亮了');
        if (T.tier > 1 && !o.talents.some((id) => { const u = S.talent(id); return u.br === T.br && u.tier === T.tier - 1; })) return no('要先点亮这一支的上一级天赋');
        if (E.tpFree(o) < T.cost) return no(`天赋点不够（需要 ${T.cost}）`);
        o.talents.push(T.id);
        if (o.tal.length < S.TALENT_SLOTS) o.tal.push(T.id);   // 有空位就直接装上
        return { ok: true, items: [] };
      }
      case 'buyPass': {
        if (o.pass.prem) return no('已经解锁高级通行证了');
        if (o.gems < E.PASS.price) return no(`宝石不够（需要 ${E.PASS.price}）`);
        o.gems -= E.PASS.price; o.pass.prem = true;
        return { ok: true, items: [], spent: { gems: E.PASS.price } };
      }
      case 'claimPass': {
        const t = a.tier | 0, prem = !!a.prem;
        if (t < 1 || t > E.PASS.tiers) return no('没有这一级');
        if (E.passLevel(o) < t) return no(`通行证升到 ${t} 级才能领`);
        if (prem && !o.pass.prem) return no('需要先解锁高级通行证');
        const list = prem ? o.pass.cp : o.pass.cf;
        if (list.includes(t)) return no('已经领过了');
        list.push(t);
        const it = Object.assign({}, (prem ? E.PASS.prem : E.PASS.free)[t - 1]);
        grant(o, [it]);
        return { ok: true, items: [it] };
      }
      case 'claimAll': {
        const items = [], lv = E.passLevel(o);
        for (let t = 1; t <= lv; t++) {
          if (!o.pass.cf.includes(t)) { o.pass.cf.push(t); items.push(Object.assign({}, E.PASS.free[t - 1])); }
          if (o.pass.prem && !o.pass.cp.includes(t)) { o.pass.cp.push(t); items.push(Object.assign({}, E.PASS.prem[t - 1])); }
        }
        if (!items.length) return no('没有可以领的奖励');
        grant(o, items);
        return { ok: true, items: E.merge(items) };
      }
      case 'claimMail': {
        const box = E.mailbox(o, a.now), ids = a.id === '*' ? box.filter((m) => !m.got).map((m) => m.id) : [a.id];
        const items = [];
        for (const id of ids) { const m = box.find((x) => x.id === id); if (!m || m.got) continue; o.mailGot.push(id); items.push(...m.items.map((it) => Object.assign({}, it))); }
        if (!items.length) return no('没有可以领取的邮件');
        grant(o, items);
        return { ok: true, items: E.merge(items) };
      }
      case 'claimEvent': {
        const ev = E.activeEvents(a.now).find((x) => x.id === a.id), i = a.i | 0;
        if (!ev) return no('活动已经结束了');
        const q = ev.quests[i], st = o.ev[ev.id];
        if (!q || !st || st.p[i] < q[1]) return no('任务还没完成');
        if (st.c[i]) return no('已经领过了');
        st.c[i] = true;
        const it = Object.assign({}, q[2]);
        grant(o, [it]);
        return { ok: true, items: [it] };
      }
      case 'claimStory': {
        const R = E.STORY.rewards.find((r) => r[0] === (a.n | 0));
        if (!R) return no('没有这个奖励');
        const done = E.STORY.steps.filter((st, i) => o.story.p[i] >= st[1]).length;
        if (done < R[0]) return no(`要先完成 ${R[0]} 个任务`);
        if (o.story.c.includes(R[0])) return no('已经领过了');
        o.story.c.push(R[0]);
        const it = Object.assign({}, R[1]);
        grant(o, [it]);
        return { ok: true, items: [it] };
      }
      case 'buyOffer': {
        const of = E.offers(o, a.now), isP = of.pilots.includes(a.id), isM = of.mech === a.id;
        if (!isP && !isM) return no('这个限时商品已经刷新掉了');
        if (isP ? o.pilots[a.id] : o.mechs.includes(a.id)) return no('已经拥有了');
        const price = isP ? E.OFFER.pilotPrice : E.OFFER.mechPrice;
        if (o.gems < price) return no(`宝石不够（需要 ${price}）`);
        o.gems -= price;
        const it = { k: isP ? 'pilot' : 'mech', id: a.id };
        grant(o, [it]);
        return { ok: true, items: [it], spent: { gems: price } };
      }
      case 'buySkin': {
        const K = S.skin(a.id);
        if (!K) return no('没有这个皮肤');
        if (o.skins.includes(K.id)) return no('已经拥有了');
        if (!K.price) return no('这个皮肤只能从通行证获得');
        const price = E.skinPrice(K, a.now);
        if (o.gems < price) return no(`宝石不够（需要 ${price}）`);
        o.gems -= price; o.skins.push(K.id);
        return { ok: true, items: [{ k: 'skin', id: K.id }], spent: { gems: price } };
      }
      case 'delMail': {   // 删除领过的邮件（'*' = 全部领过的）
        const box = E.mailbox(o, a.now), ids = a.id === '*' ? box.filter((m) => m.got).map((m) => m.id) : [a.id];
        let n = 0;
        for (const id of ids) { const m = box.find((x) => x.id === id); if (!m) continue; if (!m.got) return no('奖励还没领取，不能删除'); o.mailDel.push(id); n++; }
        if (!n) return no('没有可以删除的邮件');
        return { ok: true, items: [], deleted: n };
      }
      case 'sellLoot': {   // 1.6：仓库卖物资（价值的 1/10 换金币）
        const k = a.k, n = Math.max(1, a.n | 0);
        if (!S.LOOT.items[k]) return no('没有这种物资');
        if ((o.stash[k] || 0) < n) return no('仓库里没有这么多');
        o.stash[k] -= n; if (!o.stash[k]) delete o.stash[k];
        const it = { k: 'coins', n: E.sellPrice(k) * n };
        grant(o, [it]);
        return { ok: true, items: [it] };
      }
      case 'sellAll': {   // 一键卖出：只卖普通 / 优良 / 稀有，史诗和传说留着
        let c = 0;
        for (const [k, n] of Object.entries(o.stash)) if (S.LOOT.items[k].r <= (a.maxR | 0 || 3)) { c += E.sellPrice(k) * n; delete o.stash[k]; }
        if (!c) return no('没有可以卖的物资');
        const it = { k: 'coins', n: c };
        grant(o, [it]);
        return { ok: true, items: [it] };
      }
      case 'exLoot': {   // 传说物资兑换宝石 / 能量结晶
        const I = S.LOOT.items[a.k];
        if (!I || !I.ex) return no('这件物资不能兑换');
        if (!o.stash[a.k]) return no('仓库里没有');
        o.stash[a.k]--; if (!o.stash[a.k]) delete o.stash[a.k];
        const its = Object.entries(I.ex).map(([k, n]) => ({ k, n }));
        grant(o, its);
        return { ok: true, items: its };
      }
      case 'buyGear': {   // 军需处：金币买装备
        const G = S.LOOT.gear[a.g];
        if (!G) return no('没有这件装备');
        if ((o.gear[a.g] || 0) >= 99) return no('已经满了');
        if (o.coins < G.price) return no(`金币不够（需要 ${G.price}）`);
        o.coins -= G.price; o.gear[a.g] = (o.gear[a.g] || 0) + 1;
        return { ok: true, items: [], spent: { coins: G.price } };
      }
      case 'setGear': {   // 选择带进高危行动的装备
        const on = Array.isArray(a.on) ? [...new Set(a.on.filter((g) => S.LOOT.gear[g] && o.gear[g] > 0))] : [];
        o.gearOn = on;
        return { ok: true, items: [] };
      }
      case 'eventShop': {
        const ev = E.activeEvents(a.now).find((x) => x.id === a.id), i = a.i | 0;
        if (!ev || !ev.shop) return no('活动已经结束了');
        const item = ev.shop[i];
        if (!item) return no('没有这个商品');
        const st = o.ev[ev.id] || (o.ev[ev.id] = { p: ev.quests.map(() => 0), c: ev.quests.map(() => false), s: ev.shop.map(() => 0) });
        if (!st.s) st.s = ev.shop.map(() => 0);
        if (st.s[i] >= item.limit) return no('已经兑换完了');
        if (item.it.k === 'skin' && o.skins.includes(item.it.id)) return no('已经拥有了');
        if ((o.tickets || 0) < item.cost) return no(`乐园票不够（需要 ${item.cost}）`);
        o.tickets -= item.cost; st.s[i]++;
        const it = Object.assign({}, item.it);
        grant(o, [it]);
        return { ok: true, items: [it], spent: { tickets: item.cost } };
      }
      case 'claimTask': {
        const L = E.TASKLINES[a.id], i = a.i | 0;
        if (!L || !L.steps[i]) return no('没有这个任务');
        const st = E.taskState(o, a.id);
        if (st.p[i] < L.steps[i][1]) return no('任务还没完成');
        if (st.c[i]) return no('已经领过了');
        st.c[i] = true;
        const it = Object.assign({}, L.steps[i][2]);
        grant(o, [it]);
        return { ok: true, items: [it] };
      }
      case 'resetTalents': {
        if (o.gems < 30) return no('重置天赋需要 30 宝石');
        o.gems -= 30; o.talents = []; o.tal = [];
        return { ok: true, items: [], spent: { gems: 30 } };
      }
      default: return no('未知操作');
    }
  };

  // 「账号升到 N 级」这类任务：直接看当前等级
  E.syncLevelTasks = (o) => { for (const id of Object.keys(E.TASKLINES)) { const L = E.TASKLINES[id], st = E.taskState(o, id); L.steps.forEach((q, i) => { if (q[0] === 'lvl') st.p[i] = Math.min(q[1], S.levelFromXp(o.xp || 0)); }); } };
  E.taskState = (o, id) => { const L = E.TASKLINES[id]; o.tl = o.tl || {}; return o.tl[id] || (o.tl[id] = { p: L.steps.map(() => 0), c: L.steps.map(() => false) }); };
  // 比赛结算：经验、奖杯、战绩、金币、每日首胜、账号升级奖励（本机和服务器同一套）
  E.applyMatch = function (o, rw, now) {
    const lvBefore = S.levelFromXp(o.xp), trBefore = o.trophies || 0;
    o.xp += rw.xp; o.matches++; if (rw.won) o.wins++;
    o.kills += rw.kills; o.paint += rw.paint;
    o.trophies = Math.max(0, trBefore + rw.trophies);
    const evs = E.activeEvents(now), esc = rw.mode === 'escape4' || rw.mode === 'escape8';
    const R = E.RANK, park = rw.mode === 'park';
    const coinMul = evs.reduce((m, ev) => m * (ev.coinMul || 1), 1) * (rw.ranked ? R.coinMul : 1);
    const items = [{ k: 'coins', n: Math.round(E.matchCoins(rw) * coinMul), why: rw.ranked ? '排位赛加成' : coinMul > 1 ? '活动加成' : undefined }];
    if (!items[0].why) delete items[0].why;
    // 连胜：3 连胜起每局多给金币
    if (rw.won) { o.streak = (o.streak || 0) + 1; o.bestStreak = Math.max(o.bestStreak || 0, o.streak); } else if (!rw.draw) o.streak = 0;
    if (rw.won && o.streak >= 3) items.push({ k: 'coins', n: Math.min(10, o.streak) * 10, why: `${o.streak} 连胜` });
    // 排位赛：段位分
    let rankInfo = null;
    if (rw.ranked) {
      const rp0 = o.rank.rp, t0 = E.rankTier(rp0);
      let d = rw.won ? R.win : rw.draw ? R.draw : R.loss;
      if (rw.mvp) d += R.mvp;
      let rp1 = Math.max(0, rp0 + d);
      if (!rw.won && !rw.draw && t0 <= R.protect) rp1 = Math.max(rp1, R.tiers[t0].rp);   // 低段位掉分不掉段
      o.rank.rp = rp1; o.rank.n = (o.rank.n || 0) + 1;
      const t1 = E.rankTier(rp1);
      for (let t = 1; t <= t1; t++) if (!o.rank.got.includes(t) && R.tiers[t].reward) { o.rank.got.push(t); items.push(Object.assign({}, R.tiers[t].reward, { why: `首次到达${R.tiers[t].name}` })); }
      o.rank.best = Math.max(o.rank.best || 0, t1);
      rankInfo = { rp0, rp1, d: rp1 - rp0, t0, t1 };
    }
    // 1.6：搜刮撤离——撤离成功：物资进仓库；高危行动阵亡：带进去的装备丢失
    let lootInfo = null;
    if (rw.mode === 'loot' && rw.loot) {
      const L = rw.loot, R2 = o.lootRec, wk = E.weekIndex(now);
      R2.runs++;
      if (R2.wk !== wk) { R2.wk = wk; R2.wbest = 0; }
      const lost = [];
      if (L.ex) {
        for (const k of L.items) if (S.LOOT.items[k]) o.stash[k] = Math.min(9999, (o.stash[k] || 0) + 1);
        R2.ex++; R2.total += L.v; R2.best = Math.max(R2.best, L.v); R2.wbest = Math.max(R2.wbest, L.v);
        R2.gold += L.items.filter((k) => S.LOOT.items[k] && S.LOOT.items[k].r === 5).length;
      } else if (L.risk === 'high') {
        for (const g of L.gear || []) if (o.gear[g] > 0) { o.gear[g]--; lost.push(g); if (!o.gear[g]) { delete o.gear[g]; o.gearOn = o.gearOn.filter((x) => x !== g); } }
      }
      lootInfo = { ex: L.ex, v: L.v, items: L.items, lost };
    }
    // 乐园祭：乐园模式每局给乐园票
    for (const ev of evs) if (park && ev.ticketsPerPark) items.push({ k: 'tickets', n: ev.ticketsPerPark + (rw.won ? ev.ticketsWin || 0 : 0), why: ev.name });
    const gainS = { play: 1, win: rw.won ? 1 : 0, kills: rw.kills, paint: rw.paint, elim: rw.mode === 'elim' ? 1 : 0, escape: esc ? 1 : 0, top3: esc && rw.rank && rw.rank <= 3 ? 1 : 0, crates: rw.cubes || 0,
      park: park ? 1 : 0, parkwin: park && rw.won ? 1 : 0, balloons: rw.balloons || 0, float: rw.float || 0, ranked: rw.ranked ? 1 : 0,
      loot: rw.mode === 'loot' ? 1 : 0, lootex: lootInfo && lootInfo.ex ? 1 : 0, lootv: lootInfo && lootInfo.ex ? lootInfo.v : 0, lootgold: lootInfo && lootInfo.ex ? lootInfo.items.filter((k) => S.LOOT.items[k] && S.LOOT.items[k].r === 5).length : 0, loothi: lootInfo && lootInfo.ex && rw.loot.risk === 'high' ? 1 : 0 };
    for (const ev of evs) {
      const st = o.ev[ev.id] || (o.ev[ev.id] = { p: ev.quests.map(() => 0), c: ev.quests.map(() => false) });
      ev.quests.forEach((q, i) => { st.p[i] = Math.min(q[1], st.p[i] + (gainS[q[0]] || 0)); });
    }
    E.STORY.steps.forEach((q, i) => { o.story.p[i] = Math.min(q[1], o.story.p[i] + (gainS[q[0]] || 0)); });
    for (const id of Object.keys(E.TASKLINES)) { const L = E.TASKLINES[id], st = E.taskState(o, id); L.steps.forEach((q, i) => { if (q[0] !== 'lvl') st.p[i] = Math.min(q[1], st.p[i] + (gainS[q[0]] || 0)); }); }
    const d = E.dayIndex(now);
    if (o.day !== d) { o.day = d; o.dayWin = 0; }
    if (rw.won && !o.dayWin) { o.dayWin = 1; items.push({ k: 'gems', n: E.FIRST_WIN_GEMS, why: '每日首胜' }); }
    // 通行证经验 + 每日 / 每周任务
    const pmul = (esc ? evs.reduce((m, ev) => m * (ev.escPassMul || 1), 1) : 1) * (rw.ranked ? R.passMul : 1);
    const pxp = E.matchPassXp(rw) * pmul;
    items.push({ k: 'passxp', n: Math.round(pxp), why: rw.ranked ? '排位赛' : pmul > 1 ? '对战（活动 ×2）' : '对战' });
    const wk = E.weekIndex(now);
    if (o.q.d !== d) { o.q.d = d; o.q.dp = [0, 0, 0]; }
    if (o.q.w !== wk) { o.q.w = wk; o.q.wp = [0, 0, 0, 0]; }
    const gain = { won: rw.won ? 1 : 0, play: 1, kills: rw.kills, paint: rw.paint, mvp: rw.mvp ? 1 : 0 };
    const done = [];
    E.dailyQuests(d).forEach((q, i) => { const before = o.q.dp[i]; o.q.dp[i] = Math.min(q[1], before + gain[E.QUESTS[q[0]].stat]); if (before < q[1] && o.q.dp[i] >= q[1]) { items.push({ k: 'passxp', n: q[2], why: '每日任务：' + E.questName(q) }); done.push(E.questName(q)); } });
    E.WEEKLY.forEach((q, i) => { const before = o.q.wp[i]; o.q.wp[i] = Math.min(q[1], before + gain[E.QUESTS[q[0]].stat]); if (before < q[1] && o.q.wp[i] >= q[1]) { items.push({ k: 'passxp', n: q[2], why: '每周任务：' + E.questName(q) }); done.push(E.questName(q)); } });
    const passBefore = E.passLevel(o);
    const ups = S.levelFromXp(o.xp) - lvBefore;
    if (ups > 0) items.push({ k: 'coins', n: E.LEVELUP.coins * ups, why: '账号升级' }, { k: 'gems', n: E.LEVELUP.gems * ups, why: '账号升级' });
    grant(o, items);
    E.syncLevelTasks(o);
    return { items: E.merge(items), lvBefore, trBefore, lvUps: ups, passBefore, passAfter: E.passLevel(o), quests: done, rank: rankInfo, streak: o.streak, loot: lootInfo };
  };
  return E;
});
