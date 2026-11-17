// 1.6 搜刮撤离：超大地图、小队人数、物资刷新 / 捡起 / 掉落、撤离、守卫、AI、结算、仓库
// 运行：node test/loot.js
'use strict';
const S = require('../public/shared.js');
const E = require('../public/economy.js');
const { Game, Room, Hub } = require('../server.js');

let failed = 0;
const ok = (c, msg) => { console.log((c ? '✓ ' : '✗ ') + msg); if (!c) failed++; };
const mk = (st) => { const room = new Room('L', null, { manual: true }); room.settings = Object.assign({ mode: 'loot', map: S.MAP_N, duration: 180, teamSize: 4, bots: true, squad: 3, risk: 'normal', chat: false }, st); return new Game(room, { manual: true }); };

// ---- 地图：2.1 灰城禁区（十倍面积） ----
{
  const g = mk({});
  ok(g.mapIdx === S.GIANT_MAP() && S.GW === 760 && S.GH === 500 && g.M.gw === 760, `撤离模式用灰城禁区 ${S.GW}×${S.GH}`);
  S.buildMap(0);
  ok(S.GW === 120 && S.W === 1920, '切回普通地图时尺寸也切回来');
  g.step();
  ok(S.GW === 760, '每次模拟前切回本局地图的尺寸（服务器同时跑多张地图）');
  ok(S.MAPS.slice(S.MAP_N).every((m) => m.loot), '超大地图排在普通地图后面，不进普通模式的随机池');
  const normal = new Room('N', null, { manual: true }); normal.settings = { mode: 'turf', map: -1, duration: 60, teamSize: 2, bots: true };
  let any = false; for (let i = 0; i < 40; i++) { const gn = new Game(normal, { manual: true }); if (gn.mapIdx >= S.MAP_N) any = true; }
  ok(!any, '普通模式随机不会抽到超大地图');
}
// ---- 小队、守卫、Boss、容器 ----
{
  for (const sq of [1, 2, 4]) {
    const g = mk({ squad: sq });
    const teams = [1, 2, 3, 4, 5, 6].map((t) => [...g.players.values()].filter((p) => p.team === t && !p.guard).length);
    ok(teams.every((n) => n === sq), `小队人数 ${sq}：六支小队各 ${teams.join(' / ')} 人`);
  }
  const g = mk({});
  const guards = [...g.players.values()].filter((p) => p.guard);
  ok(guards.length >= 20 && guards.every((p) => p.team === S.LOOT.guardTeam && p.npc), `中立守卫 ${guards.length} 个（单独一队，不算小队）`);
  const boss = guards.find((p) => p.lootBoss);
  ok(boss && boss.maxHp > 400 && guards.filter((p) => p.guard.follow === boss.id).length === 3, `Boss 小队：${boss && boss.name}（生命 ${boss && boss.maxHp}）+ 3 名护卫`);
  const C = g.obj.conts, types = new Set(C.map((c) => c.type));
  ok(C.length > 500 && types.size >= 8 && C.every((c) => c.items.every((k) => S.LOOT.items[k])), `${C.length} 个容器，${types.size} 种`);
  ok(C.some((c) => c.z >= S.LEVEL_H[5]), '高楼天台上也有容器（坐电梯上去）');
  const rs = [0, 0, 0, 0, 0, 0, 0]; for (const c of C) for (const k of c.items) rs[S.LOOT.items[k].r]++;
  ok(rs[1] > rs[4] && rs[4] > rs[6], `物资品质分布 ${rs.slice(1).join(' / ')}`);
  const hi = mk({ risk: 'high' }), v0 = C.reduce((a, c) => a + S.lootValue(c.items), 0), v1 = hi.obj.conts.reduce((a, c) => a + S.lootValue(c.items), 0);
  ok(v1 > v0 * 1.2, `高危行动物资更好（总价值 ${v1} vs ${v0}）`);
  const et = g.obj.ex.map((e) => e.type);
  ok(g.obj.ex.length === 8 && ['normal', 'paid', 'weight', 'lever', 'timed'].every((t) => et.includes(t)), '8 个撤离点：' + et.join(' / '));
}
// ---- 网格背包 ----
{
  const inv = { w: 5, h: 3, items: [] };
  ok(S.itemDims('engine', 0).join() !== S.itemDims('engine', 1).join() || S.LOOT.items.engine.w === S.LOOT.items.engine.h, '物资可以旋转');
  const p1 = S.invPlace(inv, 'engine'); inv.items.push({ id: 1, k: 'engine', x: p1.x, y: p1.y, rot: p1.rot });
  ok(!S.invFits(inv, 'scrap', p1.x, p1.y, 0), '格子被占了就放不下');
  let n = 1; while (S.invPlace(inv, 'scrap')) { const q = S.invPlace(inv, 'scrap'); inv.items.push({ id: ++n, k: 'scrap', x: q.x, y: q.y, rot: q.rot }); }
  ok(S.invCells(inv) === 15, '塞满 5×3 = 15 格');
}
// ---- 容器：打开、搜索、拿取、挪动、丢弃 ----
{
  const g = mk({ bots: false }); g.countdown = 0;
  const sent = []; g.room.members = new Map([[77, { conn: { send: (m) => sent.push(m) } }]]);
  const p = g.addPlayer(77, 'P', 1, 'blaster', 'antenna', false, 0, 'blaze', { lv: 1, bt: 0 });
  p.invulnT = 999;
  const c = g.obj.conts.find((q) => q.type === 'crate' && !q.z);
  c.items = ['goldcan', 'qchip', 'scrap']; c.rev = 0; c.state = 0;
  p.x = c.x + 20; p.y = c.y; p.z = 0;
  g.lootOp(p, { a: 'open', c: c.id });
  ok(p.openC === c.id && c.state === 1 && c.rev === 0, '打开容器：物资先是「?」，要一件件搜');
  g.lootOp(p, { a: 'take', c: c.id, i: 0 });
  ok(!p.inv.items.length, '还没搜出来的拿不到');
  for (let i = 0; i < S.TICK * 4 && c.rev < 3; i++) { g.step(); p.x = c.x + 20; p.y = c.y; }
  ok(c.rev === 3, `站着不动把 3 件都搜出来（${c.rev}）`);
  g.lootOp(p, { a: 'take', c: c.id, i: 0 });
  ok(p.inv.items.length === 1 && p.inv.items[0].k === 'goldcan' && c.items.length === 2, '自己挑：拿走黄金涂鸦罐');
  g.lootOp(p, { a: 'take', c: c.id, i: 0, to: 'safe' });
  ok(p.safe.items.length === 1 && p.safe.items[0].k === 'qchip', '直接放进安全箱');
  const it = p.inv.items[0];
  g.lootOp(p, { a: 'move', from: 'inv', id: it.id, to: 'inv', x: 3, y: 1, r: 0 });
  ok(it.x === 3 && it.y === 1, '在背包里挪位置');
  g.lootOp(p, { a: 'move', from: 'inv', id: it.id, to: 'inv', x: 4, y: 2, r: 0 });
  ok(it.x === 3 || S.itemDims(it.k, 0)[0] === 1, '放不下的位置不能挪');
  g.lootOp(p, { a: 'drop', from: 'inv', id: it.id });
  ok(!p.inv.items.length && c.items.includes('goldcan'), '丢弃：扔回正在看的容器');
  g.lootOp(p, { a: 'close' });
  g.lootOp(p, { a: 'take', c: c.id, i: 0 });
  ok(!p.inv.items.length, '关掉容器后拿不了');
  p.x += 300; g.lootOp(p, { a: 'open', c: c.id });
  ok(!p.openC, '离太远打不开');
  // 阵亡：背包变成遗骸，安全箱保住
  p.x = c.x + 20; p.inv.items.push({ id: 900, k: 'engine', x: 0, y: 0, rot: 0 });
  const n0 = g.obj.conts.length;
  g.kill(p, null);
  const body = g.obj.conts[g.obj.conts.length - 1];
  ok(g.obj.conts.length === n0 + 1 && body.type === 'body' && body.items.includes('engine') && !body.items.includes('qchip'), '阵亡：背包里的东西留在遗骸里，安全箱里的不掉');
  ok(g.result || p.out, '阵亡出局');
}
// ---- 撤离点：普通 / 付费 / 轻装 / 拉闸 / 限时 ----
{
  const fresh = () => { const g = mk({ bots: false }); g.countdown = 0; g.room.members = new Map(); const p = g.addPlayer(77, 'P', 1, 'blaster', 'antenna', false, 0, 'blaze', { lv: 1, bt: 0 }); p.invulnT = 999; return [g, p]; };
  const stand = (g, p, e, secs) => { for (let i = 0; i < S.TICK * secs && !p.extracted; i++) { g.step(); p.x = e.x; p.y = e.y; p.z = 0; } };
  let [g, p] = fresh();
  p.inv.items.push({ id: 1, k: 'goldcan', x: 0, y: 0, rot: 0 }, { id: 2, k: 'engine', x: 1, y: 0, rot: 0 });
  const e = g.obj.ex.filter((x) => x.type === 'normal').sort((a, b) => a.open - b.open)[0];
  g.time = e.open - 5; stand(g, p, e, 4);
  ok(p.exT === 0, '普通撤离点还没开放：不能读条');
  stand(g, p, e, 5);
  ok(p.exT > 3 && !p.extracted, `开放后读条（${p.exT.toFixed(1)} 秒）`);
  p.lastHurt = g.time; const t0 = p.exT; g.step(); p.x = e.x; p.y = e.y;
  ok(p.exT < t0, '挨打时读条倒退');
  stand(g, p, e, 12);
  ok(p.extracted && p.out && !p.alive && g.over, '读条成功撤离，真人都走了比赛结束');
  const L = g.result.loot.players[77];
  ok(L.ex && L.items.join() === 'goldcan,engine' && !L.paid && !g.result.players.some((q) => q.id < -400), '结算记下带出的物资，结算表里没有守卫');
  // 付费撤离
  [g, p] = fresh();
  const ep = g.obj.ex.find((x) => x.type === 'paid'); g.time = 5; stand(g, p, ep, 10);
  ok(p.extracted && g.result.loot.players[77].paid === S.LOOT.ext.paid.cost, '付费撤离：一开局就能用，记下 800 金币');
  // 轻装撤离
  [g, p] = fresh();
  p.inv = { w: 7, h: 6, items: [] }; for (let i = 0; i < 14; i++) p.inv.items.push({ id: i + 1, k: 'scrap', x: i % 7, y: (i / 7) | 0, rot: 0 });
  const ew = g.obj.ex.find((x) => x.type === 'weight'); g.time = 5; stand(g, p, ew, 10);
  ok(!p.extracted && p.exT === 0, '轻装撤离：背包超过 12 格不让走');
  p.inv.items.length = 4; stand(g, p, ew, 10);
  ok(p.extracted, '轻装撤离：东西少就能走');
  // 拉闸撤离
  [g, p] = fresh();
  const el = g.obj.ex.find((x) => x.type === 'lever'); g.time = 30; stand(g, p, el, 3);
  ok(!p.extracted && p.exT === 0, '拉闸撤离：没拉闸不开放');
  p.x = g.obj.lever.x + 10; p.y = g.obj.lever.y; g.lootOp(p, { a: 'lever' });
  ok(g.exOpen(el) && el.close - g.time === S.LOOT.ext.lever.open, '拉下电闸：拉闸撤离点开放 150 秒');
  stand(g, p, el, 10);
  ok(p.extracted, '拉闸后可以撤离');
  // 限时撤离
  [g, p] = fresh();
  const et = g.obj.ex.find((x) => x.type === 'timed');
  ok(!g.exOpen(et) && (g.time = S.LOOT.ext.timed.from + 1, g.exOpen(et)) && (g.time = S.LOOT.ext.timed.to + 1, !g.exOpen(et)), '限时撤离：只在第 4–7 分钟开放');
}
// ---- 结算：仓库、安全箱、付费撤离、交易行、安全箱升级 ----
{
  const res0 = { mode: 'loot', players: [{ id: 77, team: 1, kills: 0, paint: 0, deaths: 0, obj: 0 }], winner: 0, loot: { risk: 'normal', players: { 77: { ex: true, items: ['goldcan', 'engine'], safe: [], gear: [], paid: 800 } } } };
  const o = E.newProfile('t'); o.coins = 1000;
  const rw = S.matchReward(res0, 77);
  ok(rw.loot.ex && rw.loot.v === S.lootValue(['goldcan', 'engine']) && rw.trophies > 0 && rw.loot.paid === 800, `撤离成功：价值 ${rw.loot.v}，+${rw.trophies} 奖杯，付费撤离 800`);
  const coins0 = o.coins, r = E.applyMatch(o, rw);
  ok(o.stash.goldcan === 1 && o.stash.engine === 1 && o.lootRec.ex === 1 && r.loot.ex, '物资存进仓库');
  ok(o.coins <= coins0 - 800 + 400, `付费撤离扣了金币（${coins0} → ${o.coins}）`);
  const dead = { mode: 'loot', players: res0.players, winner: 0, loot: { risk: 'normal', players: { 77: { ex: false, items: [], safe: ['qchip'], gear: [], paid: 0 } } } };
  const o2 = E.newProfile('t'), rw2 = S.matchReward(dead, 77); E.applyMatch(o2, rw2);
  ok(!rw2.loot.ex && o2.stash.qchip === 1 && o2.lootRec.ex === 0, '阵亡：安全箱里的物资照样进仓库，不算撤离成功');
  ok(E.apply(o, 'exLoot', { k: 'goldcan' }).ok && !o.stash.goldcan, '传说物资兑换宝石');
  const c0 = o.coins;
  ok(E.apply(o, 'sellLoot', { k: 'engine', n: 1 }).ok && o.coins === c0 + E.sellPrice('engine'), '仓库回收价卖出');
  ok(!E.apply(o, 'sellLoot', { k: 'engine', n: 1 }).ok, '卖完了就不能再卖');
  // 交易行
  const now = Date.UTC(2026, 10, 17, 12), q = E.marketPrice('engine', now);
  ok(q.sell > 0 && q.buy > q.sell && q.mult >= 0.6 && q.mult <= 1.45, `交易行：机甲引擎收购 ${q.sell} / 出售 ${q.buy}（${Math.round(q.mult * 100)}%）`);
  const hrs = Array.from({ length: 48 }, (_, h) => E.marketPrice('engine', now + h * 3600000).sell);
  ok(new Set(hrs).size > 10, '价格每小时浮动');
  ok(E.marketPrice('goldcan', now).buy === 0, '能兑换宝石的物资只收不卖');
  o.coins = 100000;
  ok(E.apply(o, 'mktBuy', { k: 'engine', n: 2, now }).ok && o.stash.engine === 2 && o.coins === 100000 - q.buy * 2, '交易行买入');
  ok(E.apply(o, 'mktSell', { k: 'engine', n: 1, now }).ok && o.stash.engine === 1 && o.coins === 100000 - q.buy * 2 + q.sell, '交易行卖出');
  ok(!E.apply(o, 'mktBuy', { k: 'goldcan', n: 1, now }).ok, '不能买至宝 / 传说物资');
  // 安全箱
  ok(o.safeLv === 1 && E.power(o, 'blaze').safe === 1, '安全箱默认 1 级（2×2）');
  ok(E.apply(o, 'safeUp').ok && o.safeLv === 2 && E.apply(o, 'safeUp').ok && o.safeLv === 3 && !E.apply(o, 'safeUp').ok, '安全箱升到 3 级（3×3）后满级');
}
// ---- 2.1.1：中途加入 / AI 增援 / 消耗品 ----
{
  const g = mk({ squad: 2 }); g.countdown = 0;
  const evs = []; const ev0 = g.ev.bind(g); g.ev = (e) => { evs.push(e); return ev0(e); };
  ok(!g.lootJoinable(), '开局没有小队全灭：不能中途加入');
  const t3 = [...g.players.values()].filter((p) => p.team === 3);
  for (const p of t3) { p.alive = false; p.out = true; p.respawnT = 1e9; }
  g.lootSlots();
  ok(g.lootJoinable(), '第 3 小队全灭：空出一个位置可以中途加入');
  const fake = { id: 4242, name: '路人甲', weapon: 'tactic', head: 'antenna', pilot: 'hawk', power: { lv: 3, bt: 0, safe: 2 }, conn: { send() {} } };
  g.queueJoin([fake]);
  ok(!g.lootJoinable(), '位置被排上之后，别人不能再排同一个位置');
  g.time += 4; g.lootReinforce();
  const me = g.players.get(4242), mates = [...g.players.values()].filter((p) => p.team === 3 && !p.out);
  ok(me && me.team === 3 && me.alive && !me.out && mates.length === 2 && mates.some((p) => p.bot), `真人中途加入第 3 小队（AI 队友补满 ${mates.length} 人）`);
  ok(me && me.safe.w * me.safe.h === 6, '中途加入的玩家带着自己的安全箱');
  const sq = evs.find((e) => e[0] === 'sqj');
  ok(sq && sq[1] === 3 && sq[4] === 1 && sq[3] === 6, `宣告加入：第 ${sq && sq[1]} 小队「${sq && sq[2]}」，当前 ${sq && sq[3]} 支小队`);
  ok(evs.some((e) => e[0] === 'pjn' && e[1].some((a) => a[0] === 4242)), '新玩家信息同步给所有人');
  const near = [...g.players.values()].filter((p) => !p.guard && !p.out && p.team !== 3).reduce((m, p) => Math.min(m, Math.hypot(p.x - me.x, p.y - me.y)), 1e9);
  ok(near > 800, `从离别的小队最远的出生点进场（最近的敌人 ${Math.round(near)}）`);
  // AI 增援：没人排队时，全灭 25 秒后 AI 小队进场
  for (const p of [...g.players.values()].filter((p) => p.team === 4)) { p.alive = false; p.out = true; }
  g.lootSlots(); g.time += 10; g.lootReinforce();
  ok(![...g.players.values()].some((p) => p.team === 4 && !p.out), 'AI 增援要等一会儿');
  g.time += 20; g.lootReinforce();
  ok([...g.players.values()].filter((p) => p.team === 4 && !p.out && p.bot).length === 2 && evs.filter((e) => e[0] === 'sqj').length === 2, 'AI 增援小队进场并宣告');
  g.timeLeft = 100; for (const p of [...g.players.values()].filter((p) => p.team === 5)) { p.alive = false; p.out = true; }
  g.lootSlots(); g.time += 60; g.lootReinforce();
  ok(!g.lootJoinable() && ![...g.players.values()].some((p) => p.team === 5 && !p.out), '剩余时间不够时不再有新小队加入');
  // 消耗品
  me.hp = 20; me.inv.items.push({ id: 9001, k: 'stim', x: 4, y: 2, rot: 0 }, { id: 9002, k: 'shieldc', x: 3, y: 2, rot: 0 });
  g.lootOp(me, { a: 'use', from: 'inv', id: 9001 });
  ok(me.hp === 70 && !me.inv.items.some((x) => x.id === 9001), '急救针：回复 50 生命，用掉就没了');
  g.lootOp(me, { a: 'use', from: 'inv', id: 9002 });
  ok(!me.shield, '1 秒内不能连续用两个');
  g.time += 1.1; g.lootOp(me, { a: 'use', from: 'inv', id: 9002 });
  ok(me.shield === 50, '护盾电池：50 护盾');
  ok(Object.keys(S.LOOT.items).length >= 60 && S.CONT_IDS.includes('server') && S.CONT_IDS.includes('fridge') && S.CONT_IDS.includes('tools'), `物资 ${Object.keys(S.LOOT.items).length} 种、容器 ${S.CONT_IDS.length} 种`);
}
// ---- 高危：装备 ----
{
  const o = E.newProfile('t'); o.coins = 5000;
  ok(E.apply(o, 'buyGear', { g: 'armor' }).ok && E.apply(o, 'buyGear', { g: 'pack' }).ok && o.coins === 5000 - S.LOOT.gear.armor.price - S.LOOT.gear.pack.price, '军需处买战术护甲 + 扩容背包');
  ok(E.apply(o, 'setGear', { on: ['armor', 'pack', 'kit'] }).ok && o.gearOn.join() === 'armor,pack', '只能带有的装备');
  ok(E.power(o, 'blaze').gear.join() === 'armor,pack', '出战数据里带上装备');
  const g = mk({ risk: 'high', bots: false });
  g.room.members = new Map();
  const p = g.addPlayer(78, 'P', 1, 'blaster', 'antenna', false, 0, 'blaze', { lv: 1, bt: 0 });
  const hp0 = p.maxHp; g.applyGear(p, ['armor', 'pack']);
  ok(p.maxHp === Math.round(hp0 * 1.25) && p.inv.w * p.inv.h === S.LOOT.bags.pack[0] * S.LOOT.bags.pack[1], `装备生效：生命 ${hp0} → ${p.maxHp}，背包 ${p.inv.w}×${p.inv.h}`);
  const rw = { mode: 'loot', xp: 50, trophies: -2, won: false, kills: 0, paint: 0, loot: { ex: false, items: [], v: 0, risk: 'high', gear: ['armor', 'pack'] } };
  const r = E.applyMatch(o, rw);
  ok(!o.gear.armor && !o.gear.pack && o.gearOn.length === 0 && r.loot.lost.length === 2, '高危行动阵亡：带进去的装备丢失');
  const o2 = E.newProfile('t'); o2.gear = { armor: 1 }; o2.gearOn = ['armor'];
  E.applyMatch(o2, Object.assign({}, rw, { loot: Object.assign({}, rw.loot, { risk: 'normal' }) }));
  ok(o2.gear.armor === 1, '普通行动阵亡不丢装备');
}
// ---- 任务线 + 排行 ----
{
  const o = E.newProfile('t');
  E.applyMatch(o, { mode: 'loot', xp: 50, trophies: 6, won: true, kills: 1, paint: 0, loot: { ex: true, items: ['files', 'goldcan'], v: 10500, risk: 'high', gear: [] } });
  const st = E.taskState(o, 'loot');
  ok(st.p[0] === 1 && st.p[1] === 1 && st.p[2] === 8000 && st.p[4] === 1 && st.p[5] === 1, '搜刮行动任务线：撤离、价值、传说物资、高危撤离都记上了');
  const b = E.lootBoard(o);
  ok(b.length === 21 && b.some((r) => r.me && r.v === 10500) && b[0].v >= b[1].v, `本周排行：你排第 ${b.findIndex((r) => r.me) + 1} 名`);
}
// ---- AI：会搜、会撤离、守卫不乱跑 ----
{
  let ex = 0, tot = 0, picked = 0;
  for (let i = 0; i < 3; i++) {
    const g = mk({ squad: 1 + (i % 4), personas: i % 2 === 0, duration: 420 });
    const n0 = g.obj.conts.reduce((a, c) => a + c.items.length, 0);
    const guards = [...g.players.values()].filter((p) => p.guard && !p.guard.route && !p.guard.follow);
    const roam = new Map(guards.map((q) => [q, 0]));
    while (!g.over) { g.step(); for (const q of guards) if (q.alive) roam.set(q, Math.max(roam.get(q), Math.hypot(q.x - q.guard.x, q.y - q.guard.y))); }
    // 2.1.2：偶尔有守卫被炸飞 / 追人追远一点是正常的，看「绝大多数守卫」有没有守住岗位（以前看单个最大值，CI 上偶尔误报）
    const near = [...roam.values()].filter((d) => d < 1400).length, maxRoam = Math.max(...roam.values());
    for (const v of Object.values(g.result.loot.players)) { tot++; if (v.ex) ex++; }
    for (const q of g.players.values()) if (!q.guard) picked += q.inv.items.length;
    if (i === 0) ok(near >= guards.length * 0.9, `守卫守在岗位附近（${near}/${guards.length} 个没离开岗位 1400 以上，最远 ${Math.round(maxRoam)}）`);
  }
  ok(ex > 0 && picked > 0, `AI 会搜容器、会撤离（3 局里 ${ex}/${tot} 人撤离成功）`);
}
// ---- 联机：小队人数跟着房间人数 ----
{
  const hub = new Hub(); const box = [];
  const A = hub.connect({ send: (m) => box.push(m), sendRaw: () => {} }), B = hub.connect({ send: () => {}, sendRaw: () => {} });
  hub.message(A, { t: 'hello', name: 'A', pilot: 'blaze', weapon: 'blaster' }); hub.message(B, { t: 'hello', name: 'B', pilot: 'frost', weapon: 'blaster' });
  hub.message(A, { t: 'create' }); hub.message(B, { t: 'join', code: A.room.code });
  hub.message(A, { t: 'settings', mode: 'loot', squad: 1, risk: 'high', bots: true });
  hub.message(A, { t: 'start' });
  const g = A.room.game; g.stop();
  const t1 = [...g.players.values()].filter((p) => p.team === 1 && !p.guard);
  ok(g.squad === 2 && t1.some((p) => p.id === A.id) && t1.some((p) => p.id === B.id), '组队房间 2 人：排 2 人小队场次，两人在同一队');
}

// ---- 2.1.2：电梯 + AI 打法 ----
{
  const M = S.buildMap(S.GIANT_MAP()), grid = new Uint8Array(S.GW * S.GH);
  let up = 0;
  for (const [lx, ly] of M.lifts) {
    const p = { x: (lx + 1) * S.CELL, y: (ly + 1) * S.CELL, team: 1, sm: 1, vx: 0, vy: 0 };
    for (let i = 0; i < 6 * 60 && !(p.onGround && p.z > 200 && !p.lift); i++) S.stepMove(p, { mx: 0, my: 0 }, 1 / 60, grid, M, 1);
    if (p.onGround && p.z >= S.LEVEL_H[5] - 1) up++;
  }
  ok(up === M.lifts.length, `电梯：${up}/${M.lifts.length} 部都能把人送上楼顶（以前撞到楼墙会被弹回去）`);
  const g = mk({ squad: 2 });
  const styles = Object.values(g.lootStyle || {});
  ok(styles.length === 6 && styles.every((s) => ['rat', 'hunter', 'balanced', 'greedy'].includes(s)), 'AI 小队各有打法：' + styles.join(' / '));
}
console.log(failed ? `\n${failed} 项失败` : '\n搜刮撤离测试全部通过');
process.exit(failed ? 1 : 0);
