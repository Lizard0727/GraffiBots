// 1.6 搜刮撤离：超大地图、小队人数、物资刷新 / 捡起 / 掉落、撤离、守卫、AI、结算、仓库
// 运行：node test/loot.js
'use strict';
const S = require('../public/shared.js');
const E = require('../public/economy.js');
const { Game, Room, Hub } = require('../server.js');

let failed = 0;
const ok = (c, msg) => { console.log((c ? '✓ ' : '✗ ') + msg); if (!c) failed++; };
const mk = (st) => { const room = new Room('L', null, { manual: true }); room.settings = Object.assign({ mode: 'loot', map: S.MAP_N, duration: 180, teamSize: 4, bots: true, squad: 3, risk: 'normal', chat: false }, st); return new Game(room, { manual: true }); };

// ---- 地图尺寸切换 ----
{
  const g = mk({});
  ok(S.GW === 240 && S.GH === 160 && g.M.gw === 240, `超大地图 ${S.GW}×${S.GH}（普通地图 120×80）`);
  S.buildMap(0);
  ok(S.GW === 120 && S.W === 1920, '切回普通地图时尺寸也切回来');
  g.step();
  ok(S.GW === 240, '每次模拟前切回本局地图的尺寸（服务器同时跑多张地图）');
  ok(S.MAP_N + 2 === S.MAPS.length && S.MAPS.slice(S.MAP_N).every((m) => m.loot), '两张超大地图排在普通地图后面，不进普通模式的随机池');
  const normal = new Room('N', null, { manual: true }); normal.settings = { mode: 'turf', map: -1, duration: 60, teamSize: 2, bots: true };
  let any = false; for (let i = 0; i < 40; i++) { const gn = new Game(normal, { manual: true }); if (gn.mapIdx >= S.MAP_N) any = true; }
  ok(!any, '普通模式随机不会抽到超大地图');
}
// ---- 小队、守卫、物资 ----
{
  for (const sq of [1, 2, 4]) {
    const g = mk({ squad: sq });
    const teams = [1, 2, 3, 4].map((t) => [...g.players.values()].filter((p) => p.team === t && !p.guard).length);
    ok(teams.every((n) => n === sq), `小队人数 ${sq}：四支小队各 ${teams.join(' / ')} 人`);
  }
  const g = mk({});
  const guards = [...g.players.values()].filter((p) => p.guard);
  ok(guards.length >= 4 && guards.every((p) => p.team === S.LOOT.guardTeam && p.npc), `中立守卫 ${guards.length} 个（单独一队，不算小队）`);
  const n0 = g.obj.items.length, rs = [0, 0, 0, 0, 0, 0];
  for (const it of g.obj.items) rs[S.LOOT.items[it.k].r]++;
  ok(n0 > 100 && rs[1] > rs[4] && rs[5] >= 0, `普通行动刷出 ${n0} 件物资（普通 ${rs[1]} / 优良 ${rs[2]} / 稀有 ${rs[3]} / 史诗 ${rs[4]} / 传说 ${rs[5]}）`);
  const hi = mk({ risk: 'high' });
  const v0 = S.lootValue(g.obj.items.map((i) => i.k)), v1 = S.lootValue(hi.obj.items.map((i) => i.k));
  ok(hi.obj.items.length > n0 * 1.3 && v1 > v0 * 1.5, `高危行动物资更多更好（${hi.obj.items.length} 件，总价值 ${v1} vs ${v0}）`);
  ok(g.obj.ex.length === 4 && g.obj.ex.every((e) => S.LOOT.opens.includes(e.open)), '4 个撤离点，开放时间 ' + g.obj.ex.map((e) => e.open).sort((a, b) => a - b).join(' / ') + ' 秒');
}
// ---- 捡起、背包上限、自动换更值钱的 ----
{
  const g = mk({ bots: false }); g.countdown = 0;
  g.room.members = new Map();
  const p = g.addPlayer(77, 'P', 1, 'blaster', 'antenna', false, 0, 'blaze', { lv: 1, bt: 0 });
  g.obj.items.length = 0;
  for (const k of ['scrap', 'scrap', 'can', 'battery', 'neon', 'circuit', 'spray', 'drive', 'optic', 'rarepaint']) g.dropLoot(k, p.x + 4, p.y + 4);
  for (let i = 0; i < 60; i++) g.step();
  ok(p.bag.length === 10 && S.lootSlots(p.bag) === 10, '走过物资自动捡起，背包 10 格装满');
  g.dropLoot('qchip', p.x + 4, p.y + 4);
  for (let i = 0; i < 10; i++) g.step();
  ok(p.bag.includes('qchip') && !p.bag.includes('scrap') || p.bag.filter((k) => k === 'scrap').length === 1, '背包满了捡到更值钱的：自动扔掉最不值钱的换上');
  ok(g.obj.items.some((it) => it.k === 'scrap'), '被换下的物资掉在地上');
  g.dropLoot('scrap', p.x + 4, p.y + 4);
  const before = p.bag.slice();
  for (let i = 0; i < 10; i++) g.step();
  ok(JSON.stringify(before) === JSON.stringify(p.bag), '背包满了不会捡更不值钱的');
  // 阵亡：整个背包掉在地上
  const n = g.obj.items.length, carried = p.bag.length;
  g.kill(p, null);
  ok(p.out && p.bag.length === 0 && g.obj.items.length === n + carried, `阵亡出局，背包里 ${carried} 件物资全部掉在地上`);
}
// ---- 撤离 ----
{
  const g = mk({ bots: false }); g.countdown = 0;
  g.room.members = new Map();
  const p = g.addPlayer(77, 'P', 1, 'blaster', 'antenna', false, 0, 'blaze', { lv: 1, bt: 0 });
  p.bag = ['goldcan', 'engine'];
  const e = g.obj.ex.slice().sort((a, b) => a.open - b.open)[0];
  p.x = e.x; p.y = e.y;
  g.time = e.open - 5;
  for (let i = 0; i < S.TICK * 4; i++) { g.step(); p.x = e.x; p.y = e.y; }
  ok(p.exT === 0, '撤离点还没开放：不能读条');
  for (let i = 0; i < S.TICK * 5; i++) { g.step(); p.x = e.x; p.y = e.y; }
  ok(p.exT > 3 && !p.extracted, `撤离点开放后读条（${p.exT.toFixed(1)} 秒）`);
  p.lastHurt = g.time;
  const t0 = p.exT; g.step(); p.x = e.x; p.y = e.y;
  ok(p.exT < t0, '挨打时读条倒退');
  for (let i = 0; i < S.TICK * 12 && !p.extracted; i++) { g.step(); p.x = e.x; p.y = e.y; }
  ok(p.extracted && p.out && !p.alive, '读条 10 秒成功撤离');
  ok(g.over, '所有真人都撤离或出局：比赛结束');
  const L = g.result.loot.players[77];
  ok(L.ex && L.items.join() === 'goldcan,engine' && !g.result.players.some((q) => q.id < -400), '结算记下带出的物资，结算表里没有守卫');
  // 奖励：物资进仓库
  const o = E.newProfile('t');
  const rw = S.matchReward(g.result, 77);
  ok(rw.loot.ex && rw.loot.v === 5300 && rw.trophies > 0, `撤离成功：价值 ${rw.loot.v}，+${rw.trophies} 奖杯`);
  const res = E.applyMatch(o, rw);
  ok(o.stash.goldcan === 1 && o.stash.engine === 1 && o.lootRec.ex === 1 && o.lootRec.best === 5300 && res.loot.ex, '物资存进仓库，记录最高单次');
  ok(E.apply(o, 'exLoot', { k: 'goldcan' }).ok && o.gems >= 40 && !o.stash.goldcan, '黄金涂鸦罐兑换宝石');
  const c0 = o.coins;
  ok(E.apply(o, 'sellLoot', { k: 'engine', n: 1 }).ok && o.coins === c0 + 80, '卖出机甲引擎：价值的 1/10 换金币');
  ok(!E.apply(o, 'sellLoot', { k: 'engine', n: 1 }).ok, '卖完了就不能再卖');
}
// ---- 高危：装备 ----
{
  const o = E.newProfile('t'); o.coins = 5000;
  ok(E.apply(o, 'buyGear', { g: 'armor' }).ok && E.apply(o, 'buyGear', { g: 'pack' }).ok && o.coins === 4000, '军需处买战术护甲 + 扩容背包');
  ok(E.apply(o, 'setGear', { on: ['armor', 'pack', 'kit'] }).ok && o.gearOn.join() === 'armor,pack', '只能带有的装备');
  ok(E.power(o, 'blaze').gear.join() === 'armor,pack', '出战数据里带上装备');
  const g = mk({ risk: 'high', bots: false });
  g.room.members = new Map();
  const p = g.addPlayer(78, 'P', 1, 'blaster', 'antenna', false, 0, 'blaze', { lv: 1, bt: 0 });
  const hp0 = p.maxHp; g.applyGear(p, ['armor', 'pack']);
  ok(p.maxHp === Math.round(hp0 * 1.25) && p.bagCap === 16, `装备生效：生命 ${hp0} → ${p.maxHp}，背包 16 格`);
  // 高危阵亡：装备丢失
  const rw = { mode: 'loot', xp: 50, trophies: -2, won: false, kills: 0, paint: 0, loot: { ex: false, items: [], v: 0, risk: 'high', gear: ['armor', 'pack'] } };
  const r = E.applyMatch(o, rw);
  ok(!o.gear.armor && !o.gear.pack && o.gearOn.length === 0 && r.loot.lost.length === 2, '高危行动阵亡：带进去的装备丢失');
  // 普通行动不会丢
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
  for (let i = 0; i < 6; i++) {
    const g = mk({ map: S.MAP_N + (i % 2), squad: 1 + (i % 4), personas: i % 2 === 0 });
    const n0 = g.obj.items.length;
    const guards = [...g.players.values()].filter((p) => p.guard);
    let maxRoam = 0;
    while (!g.over) { g.step(); for (const q of guards) if (q.alive) maxRoam = Math.max(maxRoam, Math.hypot(q.x - q.guard.x, q.y - q.guard.y)); }
    for (const v of Object.values(g.result.loot.players)) { tot++; if (v.ex) ex++; }
    picked += n0 - g.obj.items.length;
    if (i === 0) ok(maxRoam < 950, `守卫守在岗位附近（最远离开 ${Math.round(maxRoam)}）`);
  }
  ok(ex > 0 && picked > 0, `AI 会搜物资、会撤离（6 局里 ${ex}/${tot} 人撤离成功）`);
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

console.log(failed ? `\n${failed} 项失败` : '\n搜刮撤离测试全部通过');
process.exit(failed ? 1 : 0);
