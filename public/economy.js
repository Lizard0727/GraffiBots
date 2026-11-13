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
    standard: () => S.PILOTS.map((p) => p.id).filter((id) => !E.SEASON_PILOTS.includes(id)),
    all: () => S.PILOTS.map((p) => p.id),
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
      skins: [], wear: {},
    }, E.START);
  };
  // 读取任意来源的资料：旧版本直接重置成新手号；字段做类型和范围检查
  E.normalize = function (p, name) {
    if (!p || typeof p !== 'object' || p.v !== E.VERSION) return E.newProfile(name != null ? name : p && typeof p.name === 'string' ? p.name : '');
    const o = E.newProfile(typeof p.name === 'string' ? p.name : name || '');
    o.tut = p.tut ? 1 : 0;
    for (const k of ['coins', 'gems', 'parts', 'crystals', 'trophies', 'xp', 'matches', 'wins', 'kills', 'paint', 'day', 'dayWin', 'tpBonus']) o[k] = int(p[k], 0, 1e9);
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
  E.power = (o, id) => { const q = o.pilots && o.pilots[id]; return Object.assign(q ? { lv: q.lv, bt: q.bt } : { lv: 1, bt: 0 }, { tal: (o.tal || []).slice(0, S.TALENT_SLOTS) }); };
  E.dayIndex = (now) => Math.floor(((now || Date.now()) + 8 * 3600e3) / 86400e3);   // 按北京时间换天

  // ---------------- 宝箱概率（给界面显示） ----------------
  E.odds = function (cid) {
    const C = E.CHESTS[cid];
    return C.drops.map((d) => {
      const nm = d.k === 'pilot' ? (d.pool === 'starter' ? '常驻驾驶员（5 选 1）' : d.pool === 'standard' ? '未拥有的常驻驾驶员' : '未拥有的驾驶员（含赛季新角色）')
        : d.k === 'mech' ? '未拥有的机体（含赛季新机体）' : E.CUR[d.k].name + (d.min === d.max ? ` ×${d.min}` : ` ×${d.min}–${d.max}`);
      return { k: d.k, name: nm, p: d.p };
    });
  };

  function roll(o, cid, rand) {
    const C = E.CHESTS[cid], items = [];
    for (const d of C.drops) {
      if (rand() >= d.p) continue;
      if (d.k === 'pilot' || d.k === 'mech') {
        const pool = d.k === 'pilot' ? POOL[d.pool]().filter((id) => !o.pilots[id]) : S.WEAPON_ORDER.filter((id) => !o.mechs.includes(id));
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
      case 'resetTalents': {
        if (o.gems < 30) return no('重置天赋需要 30 宝石');
        o.gems -= 30; o.talents = []; o.tal = [];
        return { ok: true, items: [], spent: { gems: 30 } };
      }
      default: return no('未知操作');
    }
  };

  // 比赛结算：经验、奖杯、战绩、金币、每日首胜、账号升级奖励（本机和服务器同一套）
  E.applyMatch = function (o, rw, now) {
    const lvBefore = S.levelFromXp(o.xp), trBefore = o.trophies || 0;
    o.xp += rw.xp; o.matches++; if (rw.won) o.wins++;
    o.kills += rw.kills; o.paint += rw.paint;
    o.trophies = Math.max(0, trBefore + rw.trophies);
    const items = [{ k: 'coins', n: E.matchCoins(rw) }];
    const d = E.dayIndex(now);
    if (o.day !== d) { o.day = d; o.dayWin = 0; }
    if (rw.won && !o.dayWin) { o.dayWin = 1; items.push({ k: 'gems', n: E.FIRST_WIN_GEMS, why: '每日首胜' }); }
    // 通行证经验 + 每日 / 每周任务
    const pxp = E.matchPassXp(rw);
    items.push({ k: 'passxp', n: pxp, why: '对战' });
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
    return { items: E.merge(items), lvBefore, trBefore, lvUps: ups, passBefore, passAfter: E.passLevel(o), quests: done };
  };
  return E;
});
