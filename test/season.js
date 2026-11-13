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
  A.input.gq++; const hp0 = B.hp; run(1.6);
  ok(B.hp < hp0 - 30, `石磊「定向爆破」：1.2 秒后爆炸，伤害 ${Math.round(hp0 - B.hp)}`);
  const d2 = duel({ pilot: 'hammer' }, {});
  d2.g.hurt(d2.A, 999, d2.B);
  ok(d2.A.foot && d2.A.shield >= 40, '石磊被动「安全第一」：弹出时自带 40 护盾');
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

console.log(failed ? `\n${failed} 项失败` : '\n第一赛季内容测试全部通过');
process.exit(failed ? 1 : 0);
