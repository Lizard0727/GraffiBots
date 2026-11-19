// 2.2：战斗定位 / 克制 / 六边形 / 适合模式 —— 每个机体和驾驶员都必须登记（以后出新角色也会被这里卡住）
'use strict';
const S = require('../public/shared.js');
const E = require('../public/economy.js');
let fail = 0;
const ok = (c, m) => { console.log((c ? '✓ ' : '✗ ') + m); if (!c) fail++; };
const mechs = S.WEAPON_ORDER, pilots = S.PILOTS.map((P) => P.id);
ok(mechs.length === Object.keys(S.WEAPONS).length, `所有机体都在 WEAPON_ORDER 里（${mechs.length} 台）`);
const miss = [];
for (const id of mechs) { const c = S.CLASS[id]; if (!c || !S.MECH_ROLES.includes(c[0]) || !S.TAGS[c[1]] || !(c[2] >= 1 && c[2] <= 5)) miss.push(id); }
for (const id of pilots) { const c = S.CLASS[id]; if (!c || !S.PILOT_ROLES.includes(c[0]) || !S.TAGS[c[1]] || !(c[2] >= 1 && c[2] <= 5)) miss.push(id); }
ok(!miss.length, `每个机体 / 驾驶员都有主定位 + 副标签 + 难度 ${miss.join(',')}`);
const nofit = [...mechs, ...pilots].filter((id) => { const f = S.fitOf(id); return !f || f.modes.length < 2 || !f.modes.every((m) => S.MODES[m]) || !f.weak; });
ok(!nofit.length, `每个角色都写了适合的模式和弱项 ${nofit.join(',')}`);
const thin = [...mechs, ...pilots].filter((id) => { const c = S.countersOf(id); return c.beats.length < 2 || c.weak.length < 2; });
ok(!thin.length, `每个角色至少克制 2 个、被 2 个克制 ${thin.join(',')}`);
const cross = S.MATCHUPS.filter((m) => !S.CLASS[m[0]] || !S.CLASS[m[1]] || (S.WEAPONS[m[0]] ? 1 : 0) !== (S.WEAPONS[m[1]] ? 1 : 0) || !m[2]);
ok(!cross.length, '克制关系只在机体之间 / 驾驶员之间，并且都写了原因');
const dup = S.MATCHUPS.filter((m, i) => S.MATCHUPS.some((n, j) => j !== i && ((n[0] === m[0] && n[1] === m[1]) || (n[0] === m[1] && n[1] === m[0]))));
ok(!dup.length, `没有重复或互相克制的组合 ${dup.map((m) => m.slice(0, 2).join('>')).join(' ')}`);
for (const k of ['mech', 'pilot']) { const R = S.ROLE_RING[k]; ok(R.every((r) => S.ROLES[r] && S.RING_WHY[r + '>' + R[(R.indexOf(r) + 1) % R.length]]), `${k} 定位环每一环都有原因`); }
const hx = [...mechs.map((id) => S.hex('mech', id)), ...pilots.map((id) => S.hex('pilot', id))];
ok(hx.every((h) => h.grades.length === 6 && h.grades.every((g) => 'ABCDE'.includes(g))), '六边形面板都是 6 项 A~E');
const spread = [0, 1, 2, 3, 4].every((k) => new Set(mechs.map((id) => S.hex('mech', id).grades[k])).size >= 4);
ok(spread, '机体六边形每一项都拉得开（至少 4 种等级）');
ok(S.mechEdge('gatling', 'blade') > 1 && S.mechEdge('blade', 'gatling') === 1, '定位克制：压制 → 刺客 +6%，反过来没有');
// 任务角色
for (const id of ['doc', 'zero', 'prism', 'lancer']) ok(E.QUEST_ONLY.includes(id) && E.noDrop(id), `${id} 只能从任务线拿到`);
const o = E.newProfile ? E.newProfile('t') : null;
if (o) {
  ok(!E.chapterOpen(o, 'zero') && E.chapterOpen(o, 'prism'), '第二章「零号档案」要先完成第一章');
  const st = E.taskState(o, 'prism'); st.p[0] = 3; st.p[1] = 1;
  const r1 = E.apply(o, 'claimTask', { id: 'prism', i: 1 });
  ok(!r1.ok, '章节任务要按顺序领取');
  ok(E.apply(o, 'claimTask', { id: 'prism', i: 0 }).ok && E.apply(o, 'claimTask', { id: 'prism', i: 1 }).ok, '按顺序领取第 1、2 步');
}
// ---------------- 2.2 机制：充能制、超载多次、新角色 ----------------
{
  const { Game, Room } = require('../server.js');
  const duel = (a, b, gap) => {
    const room = new Room('R22', null, { manual: true });
    room.settings = { mode: 'turf', map: 0, duration: 120, teamSize: 1, bots: false };
    room.members.set(1, { id: 1, name: 'A', team: 1, weapon: a.weapon, head: 'antenna', pilot: a.pilot });
    room.members.set(2, { id: 2, name: 'B', team: 2, weapon: b.weapon, head: 'antenna', pilot: b.pilot });
    const g = new Game(room, { manual: true }); g.countdown = 0;
    const A = g.players.get(1), B = g.players.get(2);
    for (const p of [A, B]) { p.z = 0; p.vx = p.vy = 0; }
    A.x = S.W / 2 - (gap || 150); A.y = S.H / 2; B.x = S.W / 2; B.y = S.H / 2; A.input.a = 0; B.input.a = Math.PI;
    g.step();
    return { g, A, B };
  };
  const steps = (g, n) => { for (let i = 0; i < n; i++) g.step(); };
  // 充能
  let { g, A, B } = duel({ pilot: 'blaze', weapon: 'blaster' }, { pilot: 'frost', weapon: 'blaster' });
  ok(A.skillUses === S.SKILL_CHARGES && A.skillMax === S.SKILL_CHARGES, `开局技能充能满（${A.skillUses}/${A.skillMax}）`);
  A.input.gq++; steps(g, 2); const u1 = A.skillUses; A.input.gq++; steps(g, 2);
  ok(u1 === S.SKILL_CHARGES - 1 && A.skillUses === u1, '放完一次后，3 秒间隔内不能再放');
  steps(g, S.TICK * 3.2); A.input.gq++; steps(g, 2);
  ok(A.skillUses === 0, '间隔过后可以接着放第二次');
  steps(g, S.TICK * (S.SKILL_REGEN + 0.5));
  ok(A.skillUses === 1, `${S.SKILL_REGEN} 秒回复 1 次充能`);
  // 超载可以多次
  A.bt = 1; A.ov = S.OV_NEED; A.input.oq++; steps(g, 2);
  ok(A.ovT > 0, '第一次超载'); A.ovT = 0.01; steps(g, 2); A.ov = S.OV_NEED; A.input.oq++; steps(g, 2);
  ok(A.ovT > 0, '第二次超载');
  // 姜黎：纳米雾场
  ({ g, A, B } = duel({ pilot: 'doc', weapon: 'prism' }, { pilot: 'blaze', weapon: 'blaster' }));
  A.input.ad = 150; A.input.gq++; steps(g, 3);
  ok(g.helpers.some((h) => h.kind === 'nano') && B.dslowT > 0 && B.nanoT > 0, '纳米雾场：敌人减速 + 装填变慢');
  // 棱镜：光束减速 + 相位冻结
  B.hp = B.maxHp = 999; A.input.f = true; steps(g, S.TICK); A.input.f = false; steps(g, 2);
  ok(B.hp < 999 && B.slowT > 0, '棱镜光束命中减速');
  A.sp = S.WEAPONS.prism.spNeed; A.input.ad = 150; A.input.qq++; steps(g, S.TICK);
  ok(B.bindT > 0 || B.silenceT > 0, '相位冻结：冻住敌人');
  // 姜黎超载：协议覆写
  A.bt = 1; A.ov = S.OV_NEED; A.input.oq++; steps(g, 3);
  ok(B.dslowT > 0 && A.auraT > 0, '协议覆写：自己有减伤光环，敌人减速');
  // 沈零：战场感知 + 相位突进 + 枪骑
  ({ g, A, B } = duel({ pilot: 'zero', weapon: 'lancer' }, { pilot: 'raven', weapon: 'phantom' }, 180));
  B.smokeT = 5; steps(g, 8);
  ok(B.revealT > 0 && !B.hidden, '战场感知：附近隐身的敌人也被暴露');
  A.input.gq++; steps(g, 2);
  ok(A.blinkT > 0 && A.invulnT > 0, '相位突进：短暂无敌 + 下一击强化');
  B.hp = B.maxHp = 999; A.x = B.x - 90; A.lastAtk = -10; A.input.f = true; steps(g, 2); A.input.f = false; steps(g, 4);
  ok(B.hp < 999 - S.WEAPONS.lancer.dmg * 1.3, `先手突刺 + 突进强化（造成 ${Math.round(999 - B.hp)} 伤害）`);
  A.sp = S.WEAPONS.lancer.spNeed; A.x = B.x - 120; B.hp = 999; A.input.qq++; steps(g, S.TICK);
  ok(B.hp < 999 && A.shield >= 30, '三段突袭：穿过敌人造成伤害，结束时获得护盾');
}
console.log(fail ? `\n${fail} 项失败` : '\n战斗定位测试全部通过');
process.exit(fail ? 1 : 0);
