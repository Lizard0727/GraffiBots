// 第一赛季内容测试：5 台新机甲 / 3 位新驾驶员的技能和被动 / 超载技能 / 天赋
// 运行：node test/season.js
'use strict';
const S = require('../public/shared.js');
const E = require('../public/economy.js');
const { Game, Room } = require('../server.js');

let failed = 0;
const ok = (c, msg) => { console.log((c ? '✓ ' : '✗ ') + msg); if (!c) failed++; };

// 两个真人（不动），A 在左，B 在右 120 处，平地
function duel(a, b, opts) {
  const room = new Room('S1', null, { manual: true });
  room.settings = { mode: 'turf', map: 0, duration: 120, teamSize: 1, bots: false };
  room.members.set(1, Object.assign({ id: 1, name: 'A', team: 1, weapon: 'blaster', head: 'antenna', pilot: 'blaze', power: { lv: 1, bt: 0, tal: [] } }, a));
  room.members.set(2, Object.assign({ id: 2, name: 'B', team: 2, weapon: 'blaster', head: 'antenna', pilot: 'frost', power: { lv: 1, bt: 0, tal: [] } }, b));
  const g = new Game(room, { manual: true });
  g.countdown = 0;
  const A = g.players.get(1), B = g.players.get(2);
  const d = (opts && opts.dist) || 120;
  // 找一块开阔平地
  for (let y = 300; y < S.H - 300; y += 32) for (let x = 400; x < S.W - 400; x += 32) {
    let flat = true;
    for (let k = -2; k <= Math.ceil(d / 40) + 2 && flat; k++) for (const dy of [-40, 0, 40]) if (S.topAt(g.M, x + k * 40, y + dy) !== 0) flat = false;
    if (flat && !A.placed) { A.x = x; A.y = y; B.x = x + d; B.y = y; A.placed = true; }
  }
  A.z = B.z = 0; A.input.a = 0; B.input.a = Math.PI;
  for (const p of [A, B]) { p.lastPosT = 0; p.invulnT = 0; }
  const events = [];
  const orig = g.ev.bind(g); g.ev = (e) => { events.push(e); orig(e); };
  return { g, A, B, events, run: (sec) => { for (let i = 0; i < sec * S.TICK; i++) { A.lastPosT = g.time; B.lastPosT = g.time; g.step(); } } };
}
const fire = (p) => { p.input.aq++; };

// ---- 5 台新机甲 ----
for (const w of E.SEASON_MECHS) {
  const { A, B, run } = duel({ weapon: w }, {}, { dist: w === 'wrecker' ? 70 : 110 });
  const hp0 = B.hp;
  for (let i = 0; i < 3; i++) { fire(A); run(0.7); }
  ok(B.hp < hp0 || B.foot, `${S.WEAPONS[w].name}：攻击能打中 ${Math.round(hp0 - B.hp)} 点`);
}
{
  // 喇叭车的音波穿墙：在两人之间立一堵墙
  const { g, A, B, run } = duel({ weapon: 'megaphone' }, {}, { dist: 140 });
  const cx = Math.floor((A.x + 70) / S.CELL), cy = Math.floor(A.y / S.CELL);
  for (let dy = -3; dy <= 3; dy++) for (let dx = 0; dx < 2; dx++) { const i = (cy + dy) * S.GW + cx + dx; g.M.solid[i] = 1; g.M.top[i] = 999; }
  ok(!S.los3(g.M, A.x, A.y, 30, B.x, B.y, 30), '（两人之间有墙挡住视线）');
  const hp0 = B.hp; fire(A); run(0.8);
  ok(B.hp < hp0, `喇叭车：音波穿过墙打中 ${Math.round(hp0 - B.hp)} 点`);
}
{
  // 无人机母舰自动瞄准：准星偏 20°，仍能打中
  const { A, B, run } = duel({ weapon: 'carrier' }, {}, { dist: 200 });
  A.input.a = 0.35; const hp0 = B.hp; fire(A); run(1.2);
  ok(B.hp < hp0, `无人机母舰：准星偏了 20° 也能追踪命中（${Math.round(hp0 - B.hp)} 点）`);
}
// 大招
for (const [w, sp, dist] of [['dozer', 'bulldoze', 140], ['flamer', 'napalm', 160], ['carrier', 'swarm', 160], ['wrecker', 'whirl', 80], ['megaphone', 'sonic', 150]]) {
  const { g, A, B, run, events } = duel({ weapon: w }, {}, { dist });
  A.sp = S.WEAPONS[w].spNeed; A.input.ad = dist; A.input.qq++;
  const hp0 = B.hp; run(sp === 'swarm' ? 3 : sp === 'napalm' ? 2.5 : 1.5);
  ok(events.some((e) => e[0] === 'sp' && e[2] === sp) && (B.hp < hp0 || B.foot), `大招「${S.SPECIALS[sp].name}」：造成 ${Math.round(hp0 - B.hp)} 点伤害${sp === 'napalm' ? `，火海 ${g.helpers.some((h) => h.kind === 'fire') ? '燃烧中' : '已结束'}` : ''}`);
}

// ---- 新驾驶员技能 / 被动 ----
{
  const { A, run } = duel({ pilot: 'flag' }, {});
  A.input.gq++; run(0.1);
  ok(A.rallyT > 4, '岚「集结号」：获得 5 秒集结增益');
  const sm0 = A.sm; ok(sm0 > 0.99 * S.WEAPONS.blaster.spd * 1.14, `集结中移动速度 ×${(A.sm / S.WEAPONS.blaster.spd).toFixed(2)}`);
}
{
  const { A, B, run } = duel({ pilot: 'hammer' }, {}, { dist: 60 });
  A.input.ad = 60; A.input.gq++; const hp0 = B.hp; run(1.6);
  ok(B.hp < hp0 - 30, `石磊「定向爆破」：扔到瞄准位置，0.9 秒后爆炸，伤害 ${Math.round(hp0 - B.hp)}`);
  const d2 = duel({ pilot: 'hammer' }, {});
  d2.g.hurt(d2.A, 999, d2.B);
  ok(d2.A.foot && d2.A.shield >= 35, '石磊被动「安全第一」：弹出时自带 35 护盾');
}
{
  const { A, B, run } = duel({ pilot: 'echo' }, {}, { dist: 150 });
  B.sp = 200; A.input.gq++; run(0.1);
  ok(B.sp < 200 && B.revealT > 3, `叶声「声波干扰」：敌人大招充能 200 → ${Math.round(B.sp)}，暴露 4 秒`);
}
{
  const d1 = duel({}, { pilot: 'flag' }); d1.B.hp = 100; d1.g.hurt(d1.B, 20, d1.A); const solo = 100 - d1.B.hp;
  ok(Math.abs(solo - 20) < 0.01, '岚身边没有队友：伤害不减');
}

// ---- 超载 ----
{
  const { A, run, events } = duel({ pilot: 'blaze', power: { lv: 5, bt: 1, tal: [] } }, {});
  A.input.oq++; run(0.1);
  ok(A.ovT === 0 && !A.ovUsed, '没充满时按 R 没反应');
  A.ov = S.OV_NEED; A.input.oq++; run(0.1);
  ok(A.ovT > 5 && A.ovUsed && events.some((e) => e[0] === 'ov'), '充满后发动超载「燃烧模式」，持续 6 秒');
  ok(A.sm > S.WEAPONS.blaster.spd * 1.19, '燃烧模式：移动速度 +20%');
  A.ov = S.OV_NEED; A.ovT = 0; A.input.oq++; run(0.1);
  ok(A.ovT === 0, '每局只能用一次');
}
{
  const { A, run } = duel({ pilot: 'blaze', power: { lv: 4, bt: 0, tal: [] } }, {});
  A.ov = S.OV_NEED; A.input.oq++; run(0.1);
  ok(A.ovT === 0, '没突破的驾驶员不能用超载');
}
{
  const { B, run } = duel({}, { pilot: 'titan', power: { lv: 5, bt: 2, tal: [] } });
  B.ov = S.OV_NEED; B.input.oq++; run(0.05);
  ok(B.ovT > 7, '突破 II：超载持续 8 秒');
}
{
  const d = duel({}, { pilot: 'titan', power: { lv: 5, bt: 1, tal: [] } });
  d.B.ovT = 5; d.B.hp = 100; d.g.hurt(d.B, 40, d.A);
  ok(Math.abs(100 - d.B.hp - 20) < 0.01, `雷豹「钢铁意志」：40 伤害只扣 ${100 - d.B.hp}`);
}
{
  const d = duel({}, { pilot: 'vet', power: { lv: 5, bt: 1, tal: [] } });
  d.B.ovT = 5; d.B.hp = 30; d.g.hurt(d.B, 999, d.A);
  ok(!d.B.foot && d.B.hp >= 1, '秦岳「老兵不死」：超载期间不会倒下');
}
{
  const d = duel({ pilot: 'hex', power: { lv: 5, bt: 1, tal: [] } }, {});
  d.A.ov = S.OV_NEED; d.A.input.oq++; d.run(0.1);
  ok(d.B.silenceT > 2, '洛奇「全网瘫痪」：敌人被沉默');
}
{
  const d = duel({ pilot: 'aurora', power: { lv: 5, bt: 1, tal: [] } }, {});
  d.A.ov = S.OV_NEED; d.A.input.oq++; d.run(0.1);
  for (let i = 0; i < 6; i++) { fire(d.A); d.run(0.45); }
  ok(d.A.ammo >= S.AMMO - 0.01, '星澜「超频装配」：连续攻击弹药也不减少');
}
{
  const d = duel({ pilot: 'echo', power: { lv: 5, bt: 1, tal: [] } }, {}, { dist: 150 });
  d.A.ov = S.OV_NEED; d.A.input.oq++; const h0 = d.B.hp; d.run(2.2);
  ok(d.B.hp < h0 - 30, `叶声「音浪风暴」：每秒一圈音波（2 秒掉 ${Math.round(h0 - d.B.hp)}）`);
}
{
  // 超载充能：打出伤害才涨
  const d = duel({ power: { lv: 5, bt: 1, tal: [] } }, {});
  d.g.hurt(d.B, 50, d.A);
  ok(d.A.ov > 49, `打出伤害给超载充能（${Math.round(d.A.ov)} / ${S.OV_NEED}）`);
  const d0 = duel({ power: { lv: 4, bt: 0, tal: [] } }, {}); d0.g.hurt(d0.B, 50, d0.A);
  ok(d0.A.ov === 0, '没突破时不充能');
}
// 每位驾驶员都有超载
ok(S.PILOTS.every((P) => S.OVERLOADS[P.id] && S.OVERLOADS[P.id].name), `14 位驾驶员都有专属超载技能`);

// ---- 天赋 ----
{
  const d = duel({ power: { lv: 1, bt: 0, tal: ['a1', 'd1'] } }, {});
  ok(d.A.maxHp === Math.round(100 * 1.08), `「加厚装甲」：机体生命 ${d.A.maxHp}`);
  d.B.hp = 100; d.g.hurt(d.B, 10, d.A);
  ok(Math.abs(100 - d.B.hp - 10.6) < 0.01, `「精准喷涂」：10 伤害打出 ${(100 - d.B.hp).toFixed(1)}`);
}
{
  const d = duel({ power: { lv: 1, bt: 0, tal: ['s2', 'd2', 'd3'] } }, {});
  ok(d.A.skillUses === S.SKILL_USES + 1, '「额外技能」：技能次数 +1');
  d.g.hurt(d.A, 999, d.B);
  ok(d.A.shield >= 25 && d.A.rebuildT <= S.REBUILD - 1, '「弹射护盾」+「快速重建」：弹出带护盾，重建快 1 秒');
}
{
  const d = duel({ power: { lv: 1, bt: 0, tal: ['a1', 'a2', 'a3', 'a4'] } }, {});
  ok(d.A.tal.size === 3, '每局最多带 3 个天赋');
}
// 天赋点与解锁顺序
{
  const o = E.newProfile('t');
  ok(E.tpTotal(o) === 2, '新号有 2 点天赋点');
  ok(E.apply(o, 'talent', { id: 'a2' }).ok === false, '不能跳级点天赋');
  ok(E.apply(o, 'talent', { id: 'a1' }).ok && E.apply(o, 'talent', { id: 'a2' }).ok && o.tal.join() === 'a1,a2', '按顺序点亮，自动装上');
  ok(E.apply(o, 'talent', { id: 'd1' }).ok === false && E.tpFree(o) === 0, '天赋点用完就不能再点');
  o.xp = S.xpForLevel(4);
  ok(E.tpFree(o) === 3, '账号升到 4 级：多 3 点');
  o.gems = 30;
  ok(E.apply(o, 'resetTalents').ok && o.talents.length === 0 && E.tpFree(o) === 5, '花 30 宝石重置，天赋点全部退回');
  const n = E.normalize(Object.assign(E.newProfile('x'), { talents: ['a1', 'a3', 'd1'], tal: ['a3', 'd1'] }));
  ok(n.talents.join() === 'a1,d1' && n.tal.join() === 'd1', '读档时跳级点亮的天赋会被清掉');
}
// 赛季角色只在街头宝箱里
{
  const o = E.newProfile('s'); o.gems = 1e7;
  let gotSeasonFromHero = false;
  for (let i = 0; i < 300; i++) { const r = E.apply(o, 'buy', { chest: 'hero' }); if (r.items.some((it) => it.k === 'pilot' && E.SEASON_PILOTS.includes(it.id))) gotSeasonFromHero = true; }
  ok(!gotSeasonFromHero, '角色宝箱不会开出赛季角色');
  const o2 = E.newProfile('s2'); o2.gems = 1e7; let seen = new Set();
  for (let i = 0; i < 2000 && seen.size < 3; i++) { const r = E.apply(o2, 'buy', { chest: 'airdrop' }); for (const it of r.items) if (it.k === 'pilot' && E.SEASON_PILOTS.includes(it.id)) seen.add(it.id); }
  ok(seen.size === 3, '金色空投能开出全部 3 位赛季角色');
}

// ---- 通行证 / 任务 / 皮肤 ----
{
  const o = E.newProfile('p');
  ok(E.apply(o, 'claimPass', { tier: 1 }).ok === false, '通行证 0 级时不能领 1 级奖励');
  const rw = { xp: 100, trophies: 8, won: true, draw: false, mvp: false, kills: 4, paint: 400 };
  const r = E.applyMatch(o, rw, Date.UTC(2026, 10, 14, 4));
  ok(o.pass.xp >= E.matchPassXp(rw), `一局给通行证经验 ${E.matchPassXp(rw)}`);
  o.pass.xp = E.PASS.xpPer * 5;
  ok(E.passLevel(o) === 5, '600 经验 = 1 级');
  ok(E.apply(o, 'claimPass', { tier: 2 }).ok && o.chests.supply === 1, '领 2 级免费奖励：补给箱');
  ok(E.apply(o, 'claimPass', { tier: 2 }).ok === false, '同一级不能重复领');
  ok(E.apply(o, 'claimPass', { tier: 1, prem: true }).ok === false, '没解锁高级通行证不能领高级线');
  o.gems = E.PASS.price;
  ok(E.apply(o, 'buyPass').ok && o.pass.prem && o.gems === 0, `花 ${E.PASS.price} 宝石解锁高级通行证`);
  const all = E.apply(o, 'claimAll');
  ok(all.ok && o.pass.cp.length === 5 && o.pass.cf.length === 5, '一键领取：免费线 + 高级线 1–5 级');
  o.pass.xp = E.PASS.xpPer * 30; E.apply(o, 'claimAll');
  ok(o.skins.includes('blaze_merc') && o.skins.includes('m_desert') && o.mechs.includes('tactic') && o.pilots.hawk, '通行证 30 级：沙漠突击手、沙鹰迷彩、战术机兵（免费 25 级）、霍克（高级 30 级）');
  o.pass.xp = E.PASS.xpPer * 50; E.apply(o, 'claimAll');
  ok(o.skins.includes('hawk_storm'), '通行证 50 级：赛季传说「沙暴统帅」');
  ok(E.normalize(Object.assign({}, o, { pass: Object.assign({}, o.pass, { s: 0 }) })).pass.xp === 0, '新赛季通行证从 0 开始');
}
{
  const o = E.newProfile('q'), day = E.dayIndex(Date.UTC(2026, 10, 15, 4));
  const qs = E.dailyQuests(day);
  ok(qs.length === 3 && JSON.stringify(qs) === JSON.stringify(E.dailyQuests(day)), `每天 3 个任务，同一天客户端和服务器一样：${qs.map(E.questName).join(' / ')}`);
  const big = { xp: 0, trophies: 8, won: true, draw: false, mvp: true, kills: 30, paint: 5000 };
  const xp0 = o.pass.xp; const r = E.applyMatch(o, big, Date.UTC(2026, 10, 15, 4));
  ok(r.quests.length >= 1 && o.pass.xp - xp0 > E.matchPassXp(big), `完成任务自动加通行证经验：${r.quests.join('、')}`);
}
{
  const o = E.newProfile('k'); o.gems = 1000;
  ok(E.apply(o, 'buySkin', { id: 'flag_red' }).ok === false, '通行证皮肤不能直接买');
  const K = S.skin('m_gold'), price = E.skinPrice(K, Date.UTC(2026, 10, 15, 4));
  ok(E.apply(o, 'buySkin', { id: 'm_gold', now: Date.UTC(2026, 10, 15, 4) }).ok && o.gems === 1000 - price, `买「${K.name}」（${S.RARE[K.rare].name}）花 ${price} 宝石`);
  E.setLoadout(o, { wear: { mech: 'm_gold', fx: 'fx_galaxy', pilot: { flag: 'flag_red' } } });
  ok(o.wear.mech === 'm_gold' && !o.wear.fx && !(o.wear.pilot || {}).flag, '只能装上已拥有的皮肤');
  const deal = E.dailyDeal(5); const DK = S.skin(deal.id);
  ok(DK.price > 0 && E.skinPrice(DK, 5 * 86400e3 - 8 * 3600e3 + 1000) === Math.round(DK.price * 0.7), `每日特惠 7 折（${DK.name}）`);
  ok(S.pilot('flag@flag_red').hair === '#c8102e' && S.pilot('flag@nope').hair === S.pilot('flag').hair, '带服装的驾驶员换配色，无效服装不影响');
  ok([1, 2, 3, 4].every((r) => S.SKINS.some((k) => k.rare === r)), '皮肤分普通 / 稀有 / 史诗 / 传说四个等级');
}

// ---- 新模式 ----
{
  const room = new Room('EL', null, { manual: true });
  room.settings = { mode: 'elim', map: 0, duration: 120, teamSize: 3, bots: true };
  const g = new Game(room, { manual: true }); g.countdown = 0;
  const t1 = [...g.players.values()].filter((p) => p.team === 1), t2 = [...g.players.values()].filter((p) => p.team === 2);
  g.hurt(t2[0], 999, t1[0]);
  for (let i = 0; i < 8 * S.TICK; i++) { t2[0].invulnT = 1; g.step(); }   // 不让 AI 把弹出的驾驶员打倒（只看会不会重建）
  ok(t2[0].foot && t2[0].alive, '生死之战：机体被打爆后驾驶员弹出，8 秒后也不会重建');
  t2[0].invulnT = 0; g.hurt(t2[0], 999, t1[0]);
  ok(!t2[0].alive && t2[0].out, '驾驶员倒下就出局');
  for (const p of t2) { p.invulnT = 0; p.alive = false; p.out = true; }
  g.step();
  ok(g.obj.wins[1] === 1 && g.obj.pause > 0, '对面全队出局：我方赢下第 1 局');
  for (let i = 0; i < 4 * S.TICK; i++) g.step();
  ok(g.obj.round === 2 && t2.every((p) => p.alive && !p.out), '3 秒后开始第 2 局，所有人复活');
  for (const p of t2) { p.invulnT = 0; p.alive = false; p.out = true; }
  g.step();
  ok(g.over && g.result.winner === 1 && g.result.rounds[1] === 2, '先赢 2 局的一方获胜');
}
{
  const room = new Room('ES', null, { manual: true });
  room.settings = { mode: 'escape4', map: -1, duration: 120, teamSize: 3, bots: true };
  const g = new Game(room, { manual: true }); g.countdown = 0;
  const teams = new Set([...g.players.values()].map((p) => p.team));
  ok(teams.size === 4 && g.players.size === 8 && S.MAPS[g.mapIdx].name === '废墟逃亡区', '四队逃亡圈：8 人分成 4 队，默认在「废墟逃亡区」');
  const p = [...g.players.values()][0];
  const k = g.obj.crates[0]; p.x = k.x; p.y = k.y; p.z = k.z; const mh = p.maxHp;
  g.step();
  ok(p.cubes >= 1 && p.maxHp > mh, `捡到空投箱：能量 +1，生命上限 ${mh} → ${p.maxHp}`);
  g.obj.circle.r = 50; g.obj.circle.x = 100; g.obj.circle.y = 100; p.x = S.W - 200; p.y = S.H - 200; p.invulnT = 0; const h0 = p.hp;
  g.obj.dmgT = 0; g.step();
  ok(p.hp < h0, '在毒圈外会持续掉血');
  const g8 = new Game(Object.assign(new Room('E8', null, { manual: true }), { settings: { mode: 'escape8', map: -1, duration: 120, teamSize: 3, bots: true } }), { manual: true });
  ok(new Set([...g8.players.values()].map((q) => q.team)).size === 8, '单人逃亡圈：8 人各自一队');
  const r = S.matchReward({ winner: 3, place: [3, 1, 4, 2], players: [{ id: 9, team: 2, kills: 1, paint: 100, obj: 0 }] }, 9);
  ok(r.rank === 4 && r.trophies === -3, '四队第 4 名：奖杯 −3');
}

// ==================== 1.1 维护更新 ====================
{
  // 防暴盾卫：正面减伤，背面不减
  const d = duel({}, { weapon: 'riot' });
  d.B.input.a = Math.PI; d.B.hp = 150; d.g.hurt(d.B, 20, d.A);
  const front = 150 - d.B.hp;
  d.B.input.a = 0; d.B.hp = 150; d.g.hurt(d.B, 20, d.A);
  const back = 150 - d.B.hp;
  ok(Math.abs(front - 11) < 0.01 && Math.abs(back - 20) < 0.01, `防暴盾卫：正面 20 伤害只扣 ${front}，背后扣 ${back}`);
}
{
  // 盾墙挡住子弹
  const d = duel({ weapon: 'blaster' }, { weapon: 'riot' }, { dist: 200 });
  d.B.sp = S.WEAPONS.riot.spNeed; d.B.input.a = Math.PI; d.B.input.qq++; d.run(0.1);
  ok(d.g.helpers.some((h) => h.kind === 'wall'), '防暴盾卫大招：立起盾墙');
  d.B.ovT = 0; const hp0 = d.B.hp; for (let i = 0; i < 3; i++) { d.A.input.aq++; d.run(0.6); }
  ok(d.B.hp === hp0 && d.events.some((e) => e[0] === 'blk' && e[1] === 0), '盾墙挡住了对面的全部子弹');
}
{
  const d = duel({ pilot: 'han' }, {}, { dist: 120 });
  d.A.input.gq++; d.run(0.1);
  ok(d.B.slowT > 1 && d.B.revealT > 3 && d.B.hp < 100, '韩冰「闪光弹」：前方敌人受伤、减速、暴露');
  const d2 = duel({}, { pilot: 'han', power: { lv: 5, bt: 1, tal: [] } });
  d2.B.ovT = 5; d2.A.hp = 100; d2.g.hurt(d2.B, 40, d2.A);
  ok(d2.A.hp < 100, `韩冰超载「反戈一击」：反弹 ${Math.round(100 - d2.A.hp)} 点伤害给攻击者`);
}
{
  // 新天赋
  const d = duel({ power: { lv: 1, bt: 0, tal: ['a5'] } }, {});
  let hits = []; for (let i = 0; i < 5; i++) { d.B.hp = 100; d.g.hurt(d.B, 10, d.A); hits.push(100 - d.B.hp); }
  ok(Math.abs(hits[4] - 16) < 0.01 && Math.abs(hits[0] - 10) < 0.01, `「连击喷涂」：第 5 次命中 ${hits[4]}`);
  const d2 = duel({}, { power: { lv: 1, bt: 0, tal: ['d5'] } });
  d2.g.hurt(d2.B, 999, d2.A);
  ok(!d2.B.foot && d2.B.hp >= 1 && d2.B.invulnT > 1, '「不屈装甲」：致命伤害保留 1 血');
  d2.B.invulnT = 0; d2.g.hurt(d2.B, 999, d2.A);
  ok(d2.B.foot, '「不屈装甲」每台机体只生效一次');
  const d3 = duel({}, { power: { lv: 1, bt: 0, tal: ['d6'] } }); d3.B.hp = 100; d3.g.hurt(d3.B, 50, d3.A);
  ok(Math.abs(100 - d3.B.hp - 40) < 0.01, '「堡垒」：50 点的一击只扣 40');
  const d4 = duel({ power: { lv: 5, bt: 1, tal: ['s6'] } }, {}); d4.A.ov = S.OV_NEED; d4.A.input.oq++; d4.run(0.05);
  ok(d4.A.ovT > 7, '「超载共鸣」：超载持续 8 秒');
  const o = E.newProfile('t6'); o.xp = S.xpForLevel(12);
  for (const id of ['a1', 'a2', 'a3', 'a4', 'a5']) E.apply(o, 'talent', { id });
  ok(o.talents.includes('a5') && S.TALENTS.length === 24, '天赋树每支 6 级，共 24 个天赋');
}
{
  // 叛将档案
  const o = E.newProfile('story');
  ok(E.apply(o, 'claimStory', { n: 3 }).ok === false, '叛将档案：没完成任务不能领');
  const rw = { xp: 0, trophies: 8, won: true, draw: false, mvp: false, kills: 8, paint: 2000, mode: 'elim' };
  for (let i = 0; i < 3; i++) E.applyMatch(o, rw, Date.UTC(2026, 11, 20, 4));
  ok(E.apply(o, 'claimStory', { n: 3 }).ok && o.mechs.includes('riot'), '完成 3 个任务：获得防暴盾卫');
  ok(E.apply(o, 'claimStory', { n: 5 }).ok && o.pilots.han, '全部完成：韩冰加入');
}
{
  // 活动 / 信箱 / 限时购买
  const o = E.newProfile('ev'), now = Date.UTC(2026, 10, 21, 4);
  const box = E.mailbox(o, now);
  const t11 = Date.UTC(2026, 10, 13, 4);
  ok(E.mailbox(o, t11).some((m) => m.id === 'v11') && E.apply(o, 'claimMail', { id: 'v11', now: t11 }).ok && o.gems === E.START.gems + 100, '信箱：领取 1.1 补偿（100 宝石 + 军用箱）');
  ok(E.apply(o, 'claimMail', { id: 'v11', now: t11 }).ok === false, '同一封邮件不能领两次');
  ok(box.every((m) => now < m.t + E.MAIL_UNCLAIMED * 86400e3), '没领取的邮件 3 天后自动删除');
  ok(E.mailbox(o, Date.UTC(2027, 1, 1)).length === 0, '邮件 30 天后过期');
  const c0 = o.coins; E.applyMatch(o, { xp: 0, trophies: 8, won: false, draw: false, mvp: false, kills: 0, paint: 0, mode: 'turf' }, now);
  ok(o.coins - c0 === Math.round(E.matchCoins({ won: false, draw: false, kills: 0, mvp: false }) * 1.5), '「灰城反击周」期间金币 ×1.5');
  for (let i = 0; i < 5; i++) E.applyMatch(o, { xp: 0, trophies: 0, won: false, draw: false, mvp: false, kills: 0, paint: 0, mode: 'turf' }, now);
  ok(E.apply(o, 'claimEvent', { id: 'fightback', i: 0, now }).ok && o.chests.military >= 1, '活动任务「完成 5 局对战」：领军用箱');
  ok(E.apply(o, 'claimEvent', { id: 'fightback', i: 0, now: Date.UTC(2026, 11, 30) }).ok === false, '活动结束后不能再领');
  const of1 = E.offers(o, now), of2 = E.offers(o, now + 3 * 3600e3);
  ok(of1.pilots.length === 2 && of1.mech && JSON.stringify(of1) !== JSON.stringify(of2), `限时购买：${of1.pilots.map((id) => S.pilot(id).name).join('、')} + ${S.WEAPONS[of1.mech].name}，3 小时后刷新`);
  ok([...of1.pilots, ...of2.pilots].every((id) => !E.SEASON_PILOTS.includes(id) && !E.QUEST_ONLY.includes(id)) && !E.SEASON_MECHS.includes(of1.mech), '限时购买只出常驻角色');
  o.gems = 1000;
  ok(E.apply(o, 'buyOffer', { id: of1.pilots[0], now }).ok && o.pilots[of1.pilots[0]] && o.gems === 1000 - E.OFFER.pilotPrice, '用宝石买下限时驾驶员');
  ok(E.apply(o, 'buyOffer', { id: of1.mech, now: now + 3 * 3600e3 + 1 }).ok === false || of2.mech === of1.mech, '刷新后旧商品买不到');
}
{
  // 逃亡圈提前退出：按当前名次结算
  const { Hub } = require('../server.js');
  const hub = new Hub(); const box = []; const c = hub.connect({ send: (m) => box.push(m), sendRaw: (str) => box.push(JSON.parse(str)) });
  hub.message(c, { t: 'hello', name: 'X', pilot: 'blaze', weapon: 'blaster' });
  hub.message(c, { t: 'create' });
  const room = c.room; room.settings = Object.assign({}, room.settings, { mode: 'escape8', bots: true }); room.manual = true;
  room.game = new Game(room, { manual: true }); room.state = 'playing'; const g = room.game; g.countdown = 0;
  const me = g.players.get(c.id);
  for (const p of g.players.values()) if (p !== me && p.team % 2) { p.alive = false; p.out = true; }
  g.step();
  me.alive = false; me.out = true; g.step();
  hub.message(c, { t: 'leave' });
  const end = box.find((m) => m.t === 'end' && m.early);
  const rank = end && end.result.place.indexOf(me.team) + 1;
  ok(end && rank >= 4 && rank <= 8, `逃亡圈：淘汰后退出，立刻结算（第 ${rank} 名）`);
  g.stop();
}

// ---- 1.3：驾驶员弹出后的随身武器 ----
{
  const ids = S.PILOTS.map((P) => P.id);
  ok(ids.every((id) => S.SIDEARMS[id]), `${ids.length} 位驾驶员都有自己的随身武器`);
  ok(new Set(ids.map((id) => S.SIDEARMS[id].name)).size === ids.length, '随身武器名字各不相同');
  // 强度：每秒伤害（受弹药限制）都远低于任何机体
  const sideDps = (A) => (A.dmg * (A.shots || 1) * (A.pellets || 1)) / (A.reload * (A.cost || 1));
  const mechDps = (W) => (({ burst: W.shots * W.dmg, fan: W.pellets * W.dmg, flick: W.pellets * W.dmg, charge: W.dmg, lob: W.dmg, punch: W.dmg }[W.attack] || W.dmg) + (W.poison ? W.poison * 6 : 0)) / W.reload;
  const maxSide = Math.max(...ids.map((id) => sideDps(S.sidearm(id))));
  const minMech = Math.min(...Object.values(S.WEAPONS).map(mechDps));
  ok(maxSide < minMech, `最强随身武器每秒 ${maxSide.toFixed(1)} 伤害，低于最弱机体的 ${minMech.toFixed(1)}`);
  for (const id of ids) {
    const A = S.sidearm(id);
    const dist = A.kind === 'melee' ? 40 : Math.min(150, A.range - 40);
    const { g, A: me, B, run, events } = duel({ pilot: id }, { pilot: 'blaze' }, { dist });
    g.wreck(me, null); me.invulnT = 0; me.rebuildT = 99; B.invulnT = 0;
    me.input.ad = dist;
    const hp0 = B.hp;
    let slowed = false, revealed = false;
    for (let i = 0; i < 2; i++) { fire(me); for (let k = 0; k < (A.atkCd + 0.5) * S.TICK; k++) { run(1 / S.TICK); slowed = slowed || B.slowT > 0; revealed = revealed || B.revealT > 0; } }
    const dealt = hp0 - B.hp;
    ok(me.foot && dealt > 0 && dealt < 60, `${S.pilot(id).name}「${A.name}」（${A.kind}）弹出后能打中 ${Math.round(dealt)} 点`);
    if (A.fx && A.fx.slow) ok(slowed, `　${A.name}：命中后减速`);
    if (A.fx && A.fx.reveal) ok(revealed, `　${A.name}：命中后暴露`);
    if (A.heal) ok(events.some((e) => e[0] === 'heal' && e[1] === me.id), `　${A.name}：打中回血`);
  }
  {
    // 叶声的口袋音箱穿墙
    const { g, A: me, B, run } = duel({ pilot: 'echo' }, {}, { dist: 120 });
    g.wreck(me, null); me.rebuildT = 99; me.invulnT = 0; B.invulnT = 0;
    const cx = Math.floor((me.x + 60) / S.CELL), cy = Math.floor(me.y / S.CELL);
    for (let dy = -3; dy <= 3; dy++) { const i = (cy + dy) * S.GW + cx; g.M.solid[i] = 1; g.M.top[i] = 999; }
    const hp0 = B.hp; fire(me); run(0.8);
    ok(B.hp < hp0, `口袋音箱：音波穿墙命中 ${Math.round(hp0 - B.hp)} 点`);
  }
  {
    // 夜鸢在草丛里扔飞镖不暴露；凌焰开枪会暴露
    for (const [pid, want] of [['raven', true], ['blaze', false]]) {
      const { g, A: me, run } = duel({ pilot: pid }, {}, { dist: 200 });
      g.wreck(me, null); me.rebuildT = 99;
      me.smokeT = 5; fire(me); run(0.2);
      const cx = Math.floor(me.x / S.CELL), cy = Math.floor(me.y / S.CELL);
      g.M.bush = g.M.bush || new Uint8Array(S.GW * S.GH);
      me.smokeT = 0; g.M.bush[cy * S.GW + cx] = 1; run(0.1);
      ok(me.hidden === want, `${S.pilot(pid).name}：草丛里刚开过火 ${want ? '仍然隐身' : '会暴露'}`);
    }
  }
}

// ---- 1.4：乐园祭 / 特攻队 / 排位赛 / 信箱 ----
{
  // 特攻队补给箱：只开出三台刺客机体；普通宝箱开不出来
  const q = E.newProfile('strike'); q.chests.strike = 400;
  let mechs = 0; for (let i = 0; i < 400; i++) { const r = E.apply(q, 'open', { chest: 'strike' }, Math.random); mechs += r.items.filter((it) => it.k === 'mech').length; }
  ok(E.STRIKE_MECHS.every((m) => q.mechs.includes(m)) && q.mechs.length === E.STARTER_MECHS.length + 3, `特攻队补给箱开出全部刺客机体（影刃 / 毒针 / 幻影），没有别的机体`);
  ok(E.STRIKE_MECHS.every((m) => !E.offers(q, Date.UTC(2026, 10, 20)).mech || E.offers(q, Date.UTC(2026, 10, 20)).mech !== m), '限时购买不卖特攻队机体');
  const of = E.offers(E.newProfile('x'), Date.UTC(2026, 10, 20));
  ok(of.pilots[0] === 'kaka' && of.mech === 'slinger', `新常驻角色上架：限时购买必出卡卡 + 弹弓机兵`);
}
{
  // 乐园祭：乐园模式给乐园票、活动任务、活动商店
  const o = E.newProfile('park'), now = Date.UTC(2026, 10, 20, 4);
  const rw = (won) => ({ xp: 0, trophies: 0, won, draw: false, mvp: false, kills: 2, paint: 300, mode: 'park', balloons: 3, float: 20 });
  for (let i = 0; i < 3; i++) E.applyMatch(o, rw(true), now);
  ok(o.tickets === 45, `乐园模式每局 10 张乐园票，赢了多 5 张（3 局 = ${o.tickets}）`);
  ok(E.apply(o, 'claimEvent', { id: 'parkfest', i: 0, now }).ok && o.tickets === 105, '活动任务「玩 3 局乐园模式」：+60 乐园票');
  ok(E.apply(o, 'eventShop', { id: 'parkfest', i: 0, now }).ok === false || o.tickets >= 120, '乐园票不够时不能兑换');
  o.tickets = 1000;
  ok(E.apply(o, 'eventShop', { id: 'parkfest', i: 0, now }).ok && o.chests.strike === 1 && o.tickets === 880, '活动商店：120 乐园票兑换特攻队补给箱');
  ok(E.apply(o, 'eventShop', { id: 'parkfest', i: 1, now }).ok && o.skins.includes('candy_beach') && !E.apply(o, 'eventShop', { id: 'parkfest', i: 1, now }).ok, '活动商店：夏日皮肤「海滩偶像」限兑 1 次');
  ok(E.normalize(JSON.parse(JSON.stringify(o))).ev.parkfest.s[0] === 1, '兑换次数会保存');
}
{
  // 任务线：新兵之路 / 特攻队
  const o = E.newProfile('rookie');
  E.applyMatch(o, { xp: 2000, trophies: 0, won: true, draw: false, mvp: false, kills: 10, paint: 100, mode: 'turf' }, Date.UTC(2026, 10, 30));
  ok(E.apply(o, 'claimTask', { id: 'rookie', i: 0 }).ok && E.apply(o, 'claimTask', { id: 'rookie', i: 1 }).ok && o.chests.starter === 1, '新兵之路：完成 1 局、赢 1 局 → 新手宝箱');
  ok(E.apply(o, 'claimTask', { id: 'rookie', i: 4 }).ok && o.chests.hero === 1, `新兵之路：账号升到 3 级（现在 ${S.levelFromXp(o.xp)} 级）→ 角色宝箱`);
  ok(!E.apply(o, 'claimTask', { id: 'rookie', i: 2 }).ok, '没完成的任务不能领');
  ok(E.apply(o, 'claimTask', { id: 'strike', i: 1 }).ok === false, '特攻队任务按进度领取');
}
{
  // 信箱：删除领过的；没领的不能删
  const o = E.newProfile('mail'), now = Date.UTC(2026, 10, 14, 6);
  const box = E.mailbox(o, now);
  ok(!E.apply(o, 'delMail', { id: box[0].id, now }).ok, '没领取的邮件不能删除');
  E.apply(o, 'claimMail', { id: '*', now });
  ok(E.apply(o, 'delMail', { id: '*', now }).ok && E.mailbox(o, now).length === 0, '一键删除所有领过的邮件');
}
{
  // 排位赛：门槛、加减分、低段位保护、段位奖励、AI 禁用
  const o = E.newProfile('rank');
  ok(!E.canRanked(o), '新手号（1 位驾驶员以下）不能打排位');
  o.pilots = { blaze: { lv: 5, bt: 1 }, frost: { lv: 1, bt: 0 }, candy: { lv: 3, bt: 0 } };
  ok(E.canRanked(o), '3 位驾驶员 + 3 台机体：可以打排位');
  const R = (won, mvp) => ({ xp: 0, trophies: 0, won, draw: false, mvp: !!mvp, kills: 0, paint: 0, mode: 'zone', ranked: true });
  const T = Date.UTC(2026, 10, 30);
  E.applyMatch(o, R(false), T);
  ok(o.rank.rp === 0, '铜铁输了不会掉到 0 分以下');
  for (let i = 0; i < 11; i++) E.applyMatch(o, R(true), T);
  ok(E.rankTier(o.rank.rp) === 1 && o.rank.rp === 110 && o.rank.road.includes(0), `1.9：连赢 11 局 110 分到达${E.RANK.tiers[E.rankTier(o.rank.rp)].name}，领到夺冠之路第一个奖励`);
  E.applyMatch(o, R(true, true), T);
  ok(o.rank.rp === 130, 'MVP 赢一局 +20');
  o.rank.rp = 230; E.applyMatch(o, R(false), T);
  ok(o.rank.rp === 225, '黄铁输一局 -5');
  E.applyMatch(o, R(false, true), T);
  ok(o.rank.rp === 223, '输了但拿到 MVP 只扣一半（-2）');
  o.rank.rp = 200; E.applyMatch(o, R(false), T);
  ok(o.rank.rp === 200, '铁段掉分不会掉段');
  o.rank.rp = 640; E.applyMatch(o, R(false), T);
  ok(o.rank.rp === 630, '钻石起输一局 -10（和赢的分数一样）');
  o.rank.rp = 440; o.rank.road = [0, 1, 2]; E.applyMatch(o, R(true), T);
  ok(o.skins.includes('blaze_martyr'), '夺冠之路：打到黄金送稀有赛季皮肤「烈士·战火」');
  o.rank.rp = 990; o.rank.road = [0, 1, 2, 3, 4, 5]; o.shards = 0;
  E.applyMatch(o, R(true), T);
  ok(o.shards === 5, '到达荣誉传说：传说碎片 ×5');
  o.rank.rp = 1595; E.applyMatch(o, R(true), T);
  ok(o.shards === 20, `荣誉传说起每 200 分 5 个碎片，到 1600 分凑齐 20 个（${o.shards}）`);
  const rs = E.apply(o, 'roadSkin', {});
  ok(rs.ok && o.skins.includes(E.RANK.legendSkin) && o.shards === 0 && S.skin(E.RANK.legendSkin).rare === 4, '20 个传说碎片兑换赛季传说皮肤「烈士·不灭战旗」');
  // 赛季切换：分数减半
  o.rank.rp = 800; o.rank.s = 0; E.rankSeason(o);
  ok(o.rank.rp === 400 && E.RANK.tiers[E.rankTier(o.rank.rp)].name === '白金' && o.rank.road.length === 0, '新赛季：星耀 800 分 → 白金 400 分，夺冠之路重新开始');
  ok(E.normalize({ v: 2, rank: { rp: 900, s: 0 } }, 'x').rank.rp === 450, '老存档进入第一赛季时分数减半');
  const bans = E.draftBans({ myBan: { k: 'mech', id: 'blade' }, pick: { pilot: 'blaze', mech: 'blaster' }, o });
  const pl = bans.filter((b) => b.k === 'pilot').map((b) => b.id), mc = bans.filter((b) => b.k === 'mech').map((b) => b.id);
  ok(bans.length === 4 && !bans.some((b) => b.side === 'ally' && b.id === 'blaze'), `禁用阶段：${bans.map((b) => b.side + ':' + b.id).join(' ')}（队友不会禁你的驾驶员）`);
  ok(Object.keys(o.pilots).some((id) => !pl.includes(id)) && o.mechs.some((id) => !mc.includes(id)), '禁用后玩家仍然有可以用的驾驶员和机体');
  const room = new Room('RK', null, { manual: true });
  room.settings = { mode: 'zone', map: 0, duration: 120, teamSize: 4, bots: true, ranked: true, bans: { pilots: ['blaze', 'kaka'], mechs: ['blade', 'blaster'] }, botPower: { lv: 8, bt: 1 } };
  const g = new Game(room, { manual: true });
  ok([...g.players.values()].every((p) => !['blaze', 'kaka'].includes(p.pilot) && !['blade', 'blaster'].includes(p.weapon)) && [...g.players.values()].every((p) => Math.abs(p.lv - 8) <= 2), '排位赛：AI 不会用被禁用的驾驶员 / 机体，等级跟着段位（按性格 ±2）');
}
{
  // 乐园模式：花车得分 + 打气球
  const room = new Room('PK', null, { manual: true });
  room.settings = { mode: 'park', map: -1, duration: 150, teamSize: 4, bots: true };
  const g = new Game(room, { manual: true });
  ok(S.MAPS[g.mapIdx].park, '乐园模式默认在「欢乐乐园」');
  let t = 0; while (!g.over && t < 160 * S.TICK) { g.step(); t++; }
  const pops = [...g.players.values()].reduce((a, p) => a + p.stats.balloons, 0);
  ok(g.over && Math.max(g.obj.score[1], g.obj.score[2]) > 30 && pops > 0, `乐园模式打完一局：比分 ${g.obj.score[1]} : ${g.obj.score[2]}，打爆 ${pops} 个气球`);
}
{
  // 毒针：中毒持续掉血；幻影：大招隐身、攻击现形；弹弓：落地后再弹一次
  const { g, A, B, run } = duel({ weapon: 'stinger' }, {}, { dist: 200 });
  B.invulnT = 0; fire(A); run(0.4); const hp1 = B.hp; run(1.5);
  ok(B.poisonT > 0 || B.hp < hp1, `毒针：命中后中毒，1.5 秒里又掉了 ${Math.round(hp1 - B.hp)} 点`);
  const d2 = duel({ weapon: 'phantom' }, {}, { dist: 160 });
  d2.A.sp = S.WEAPONS.phantom.spNeed; d2.A.input.qq++; d2.run(0.2);
  ok(d2.A.hidden && d2.A.cloakT > 0, '幻影：光学迷彩隐身');
  fire(d2.A); d2.run(0.1);
  ok(d2.A.cloakT === 0, '幻影：攻击后现形');
  const d3 = duel({ weapon: 'slinger' }, {}, { dist: 200 });
  d3.A.input.ad = 200; fire(d3.A); let lbs = 0; for (let i = 0; i < 40; i++) { d3.run(1 / S.TICK); } lbs = d3.events.filter((e) => e[0] === 'lb').length;
  ok(lbs >= 2, `弹弓：涂料球落地后再弹一次（${lbs} 次抛物线）`);
  const d4 = duel({ pilot: 'kaka' }, {}, { dist: 120 });
  d4.g.kill(d4.B, d4.A);
  ok(d4.g.helpers.some((h) => h.kind === 'bento' && h.gift), '卡卡：击倒敌人掉落惊喜礼盒');
  void g;
}

// ---------------- 1.4.1：AI 性格 + 打字聊天 ----------------
{
  const GB = require('../public/bots.js');
  // 段位越高，强手越多
  const avgPow = (tier) => { let s = 0; for (let i = 0; i < 4000; i++) s += GB.persona(GB.roll(tier)).pow; return s / 4000; };
  const pw = [null, 0, 2, 4, 6].map(avgPow);
  ok(pw[1] < pw[2] && pw[2] < pw[3] && pw[3] < pw[4], `AI 实力：普通赛 ${pw[0].toFixed(2)}，青铜 ${pw[1].toFixed(2)} → 黄金 ${pw[2].toFixed(2)} → 钻石 ${pw[3].toFixed(2)} → 传奇 ${pw[4].toFixed(2)}`);
  const seen = new Set(); for (let i = 0; i < 3000; i++) seen.add(GB.roll(null));
  ok(GB.ORDER.every((id) => seen.has(id)), '普通赛 7 种性格都会出现：' + GB.ORDER.map((id) => GB.persona(id).name).join('、'));
  // 1.7：「不错」「菜鸟」最常见；等级越高「高手」越多；挂机 / 顶尖 / 大神少见
  const share = (w) => { const t = w.reduce((a, b) => a + b, 0); const o = {}; GB.ORDER.forEach((id, i) => { o[id] = w[i] / t; }); return o; };
  const lo = share(GB.mix(null, 1)), hi = share(GB.mix(null, 11)), mid = share(GB.mix(null, 6));
  const top2 = (o) => Object.keys(o).sort((a, b) => o[b] - o[a]).slice(0, 2).sort().join(',');
  ok(top2(lo) === 'decent,noob' && top2(mid) === 'decent,noob', `普通赛最常见的是不错和菜鸟（Lv1 ${top2(lo)}，Lv6 ${top2(mid)}）`);
  ok(lo.expert < mid.expert && mid.expert < hi.expert, `等级越高高手越多：${(lo.expert * 100).toFixed(0)}% → ${(mid.expert * 100).toFixed(0)}% → ${(hi.expert * 100).toFixed(0)}%`);
  const rare = (o) => o.afk + o.top + o.god;
  ok(rare(lo) < 0.1 && rare(hi) < 0.13 && rare(share(GB.mix(0))) < 0.08, `挂机 + 顶尖 + 大神少见：Lv1 ${(rare(lo) * 100).toFixed(0)}%，满级 ${(rare(hi) * 100).toFixed(0)}%，青铜 ${(rare(share(GB.mix(0))) * 100).toFixed(0)}%`);
  ok(GB.ORDER.every((id) => share(GB.mix(6))[id] < share(GB.mix(6)).expert || id === 'expert') && share(GB.mix(6)).god < 0.12, '传奇段位：高手最多，大神依然少见');
  // 两队实力差不多
  let gapMax = 0;
  for (let i = 0; i < 300; i++) {
    const slots = [{ team: 1 }, { team: 1 }, { team: 1 }, { team: 2 }, { team: 2 }, { team: 2 }, { team: 2 }];
    const ids = GB.assign(slots, 3, { 1: 1 }), pow = { 1: 1.2, 2: 0 };
    slots.forEach((sl, k) => { pow[sl.team] += GB.persona(ids[k]).pow; });
    gapMax = Math.max(gapMax, Math.abs(pow[1] - pow[2]));
  }
  ok(gapMax < 4.5, `分配性格时两队实力差距不会太大（最大差 ${gapMax.toFixed(1)}）`);
  // 对局：名字像玩家、不是驾驶员名字；有性格；排位按段位
  const room = new Room('P1', null, { manual: true });
  room.settings = { mode: 'turf', map: 0, duration: 90, teamSize: 4, bots: true, ranked: true, rankTier: 6, botPower: { lv: 10, bt: 2 }, lang: 'en' };
  const g = new Game(room, { manual: true });
  const bots = [...g.players.values()].filter((p) => p.bot);
  ok(bots.every((p) => p.persona && !S.PILOTS.some((P) => P.name === p.name)) && new Set(bots.map((p) => p.name)).size === bots.length, 'AI 用玩家风格的名字：' + bots.map((p) => p.name).join('、'));
  ok(bots.some((p) => p.looks && Object.keys(p.looks).length), 'AI 也会穿皮肤 / 戴名片框');
  while (!g.over) g.step();
  const log = g.chatLog || [];
  ok(log.length >= 1 && log.every((m) => typeof m.text === 'string' && m.text.length <= 60), `AI 会打字：一局 ${log.length} 句，例如「${log.slice(0, 3).map((m) => m.text || m.en).join('」「')}」`);
  ok(log.every((m) => m.text === '' ? m.en && m.en.startsWith('*') : true), '英文打错字后补的「*改正」只给英文玩家看');
  // 挂机 AI 真的会站着不动一阵
  const r2 = new Room('P2', null, { manual: true });
  r2.settings = { mode: 'turf', map: 0, duration: 60, teamSize: 2, bots: true, chat: false };
  const g2 = new Game(r2, { manual: true }); g2.countdown = 0;
  const afk = [...g2.players.values()][0]; afk.persona = 'afk'; afk.pst = { afk: { mode: 'load', until: 10, spin: 0 }, afkOn: true };
  const x0 = afk.x; for (let i = 0; i < S.TICK * 5; i++) g2.step();
  ok(Math.hypot(afk.x - x0) < 5 && afk.pst.afkOn, '挂机 AI：开局站着不动');
  for (let i = 0; i < S.TICK * 9; i++) g2.step();
  ok(!afk.pst.afkOn, '挂机 AI：过一会儿回来继续打');
}
{
  // 真人打字：全部 / 队伍频道、限速、AI 被说是人机会回嘴
  const { Hub } = require('../server.js');
  const hub = new Hub(); const boxA = [], boxB = [];
  const A = hub.connect({ send: (m) => boxA.push(m), sendRaw: (str) => boxA.push(JSON.parse(str)) });
  const B2 = hub.connect({ send: (m) => boxB.push(m), sendRaw: (str) => boxB.push(JSON.parse(str)) });
  hub.message(A, { t: 'hello', name: 'Alice', pilot: 'blaze', weapon: 'blaster' });
  hub.message(B2, { t: 'hello', name: 'Bob', pilot: 'frost', weapon: 'blaster' });
  hub.message(A, { t: 'create' }); hub.message(B2, { t: 'join', code: A.room.code });
  hub.message(A, { t: 'settings', teamSize: 4, bots: true, mode: 'turf' });
  hub.message(A, { t: 'start' });
  const g = A.room.game; g.stop(); g.countdown = 0;
  const chats = (box) => box.filter((m) => m.t === 'chat');
  hub.message(A, { t: 'chat', text: '  大家好<script>  ', ch: 0 });
  ok(chats(boxB).some((m) => m.text === '大家好script' && m.name === 'Alice'), '全部频道：别人看得到（去掉了 < >）');
  const teamOfB = g.players.get(B2.id).team, teamOfA = g.players.get(A.id).team;
  boxB.length = 0;
  hub.message(A, { t: 'chat', text: '我去左边', ch: 1 });
  ok(chats(boxB).some((m) => m.text === '我去左边') === (teamOfA === teamOfB), '队伍频道：只有队友看得到');
  A.lastText = 0;
  for (let i = 0; i < 8; i++) { A.lastText = 0; hub.message(A, { t: 'chat', text: 'spam' + i }); }
  ok(boxA.some((m) => m.t === 'chatSlow') && chats(boxA).filter((m) => /^spam/.test(m.text)).length <= 5, '刷屏限速：10 秒最多 5 句');
  // 说 AI 是人机：AI 回嘴（多试几次，有概率）
  let replied = 0;
  for (let k = 0; k < 30 && !replied; k++) {
    A.chatTimes = []; A.lastText = 0; boxA.length = 0;
    hub.message(A, { t: 'chat', text: '你们是人机吧', ch: 0 });
    for (let i = 0; i < S.TICK * 6; i++) g.step();
    replied = chats(boxA).filter((m) => g.players.get(m.id) && g.players.get(m.id).bot).length;
  }
  ok(replied > 0, '被说是人机：AI 会回一句（' + (g.chatLog || []).filter((m) => g.players.get(m.id) && g.players.get(m.id).bot).slice(-2).map((m) => m.text).join(' / ') + '）');
}

// ---- 2.1.2：狙击机兵「锁定导弹」不能无限刷新大招 ----
{
  const { g, A, B, run } = duel({ weapon: 'charger', pilot: 'blaze' }, { weapon: 'blaster' }, { dist: 300 });
  B.hp = B.maxHp = 2000;
  let dealt = 0; const h0 = g.hurt.bind(g); g.hurt = (t, d, by, ...r) => { const hp = t.hp; const out = h0(t, d, by, ...r); if (t === B && new Error().stack.includes('explode')) dealt += hp - t.hp; return out; };
  A.sp = S.WEAPONS.charger.spNeed; A.input.qq++; run(2.2);
  ok(dealt > 30 && dealt <= S.MISSILE.dmg * 2 + 1, `锁定导弹命中 ${Math.round(dealt)} 伤害（每发最多 ${S.MISSILE.dmg}）`);
  ok(A.sp < S.WEAPONS.charger.spNeed * 0.05, `导弹伤害不给大招充能（充能 ${Math.round(A.sp)} / ${S.WEAPONS.charger.spNeed}）`);
  B.x = A.x + 1600; B.hp = 2000; g.time += 5; A.sp = S.WEAPONS.charger.spNeed; A.input.qq++; run(2.2);
  ok(B.hp === 2000, '1100 范围外的敌人不会被锁定');
}
console.log(failed ? `\n${failed} 项失败` : '\n第一赛季内容测试全部通过');
process.exit(failed ? 1 : 0);
