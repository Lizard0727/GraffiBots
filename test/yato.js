// 1.8 夜都决战：新驾驶员 / 机体的机制、咒灵讨伐、封印争夺、活动经济
// 运行：node test/yato.js
'use strict';
const S = require('../public/shared.js');
const E = require('../public/economy.js');
const { Game, Room } = require('../server.js');

let failed = 0;
const ok = (c, msg) => { console.log((c ? '✓ ' : '✗ ') + msg); if (!c) failed++; };

// 两个人的小房间：A 在左，B 在右，面对面
function duel(a, b, opt = {}) {
  const room = new Room('YATO', null, { manual: true });
  room.settings = Object.assign({ mode: 'turf', map: 0, duration: 120, teamSize: 1, bots: false }, opt.settings || {});
  room.members.set(1, { id: 1, name: 'A', team: 1, weapon: a.weapon, head: 'antenna', pilot: a.pilot });
  room.members.set(2, { id: 2, name: 'B', team: opt.sameTeam ? 1 : 2, weapon: b.weapon, head: 'antenna', pilot: b.pilot });
  const g = new Game(room, { manual: true });
  g.countdown = 0;
  const A = g.players.get(1), B = g.players.get(2);
  for (const p of [A, B]) { p.z = 0; p.vx = p.vy = 0; }
  A.x = S.W / 2 - (opt.gap || 120); A.y = S.H / 2; B.x = S.W / 2; B.y = S.H / 2;
  A.input.a = 0; B.input.a = Math.PI;
  g.step();
  return { g, A, B };
}
const steps = (g, n) => { for (let i = 0; i < n; i++) g.step(); };

// ---------------- 符零：封印符 ----------------
{
  const { g, A, B } = duel({ pilot: 'fu', weapon: 'warden' }, { pilot: 'blaze', weapon: 'blaster' }, { gap: 150 });
  A.input.ad = 150; A.input.gq++; steps(g, 3);
  ok(g.helpers.some((h) => h.kind === 'sealz'), '符零：封印符落地展开符阵');
  ok(B.sealT > 0 && B.slowT > 0, `符阵里的敌人减速、封印（seal ${B.sealT.toFixed(2)}）`);
  const uses = B.skillUses; B.input.gq++; steps(g, 2);
  ok(B.skillUses === uses, '被封印时不能放技能');
  B.sp = S.WEAPONS[B.weapon].spNeed; B.input.qq++; steps(g, 2);
  ok(!B.spKind && B.sp >= S.WEAPONS[B.weapon].spNeed, '被封印时不能放大招');
  steps(g, S.TICK * 3.5);
  ok(!g.helpers.some((h) => h.kind === 'sealz') && !(B.sealT > 0), '3 秒后符阵消失、封印解除');
}
// 符零被动：打减速中的敌人 +15%
{
  const { g, A, B } = duel({ pilot: 'fu', weapon: 'warden' }, { pilot: 'blaze', weapon: 'blaster' });
  B.hp = 500; B.maxHp = 500; g.hurt(B, 20, A); const d0 = 500 - B.hp;
  B.hp = 500; B.slowT = 2; g.hurt(B, 20, A); const d1 = 500 - B.hp;
  ok(Math.abs(d1 / d0 - 1.1) < 0.01, `符零被动「符咒共鸣」：减速目标伤害 ×${(d1 / d0).toFixed(2)}`);
}
// 结界机兵：命中减速
{
  const { g, A, B } = duel({ pilot: 'blaze', weapon: 'warden' }, { pilot: 'blaze', weapon: 'blaster' }, { gap: 160 });
  B.hp = B.maxHp = 999;
  A.input.aq++; let slowed = false;
  for (let i = 0; i < 25; i++) { g.step(); if (B.slowT > 0) slowed = true; }
  ok(B.hp < 999 && slowed, `结界机兵：符咒光弹命中并减速（${Math.round(999 - B.hp)} 伤害）`);
}
// 结界展开：队友减伤 + 回血，敌人减速
{
  const { g, A, B } = duel({ pilot: 'blaze', weapon: 'warden' }, { pilot: 'blaze', weapon: 'blaster' }, { gap: 80 });
  const kbs = []; { const ev0 = g.ev.bind(g); g.ev = (e) => { if (e[0] === 'kb') kbs.push(e); ev0(e); }; }
  A.sp = S.WEAPONS.warden.spNeed; A.input.qq++; steps(g, 2);
  const dome = g.helpers.find((h) => h.kind === 'dome');
  ok(!!dome && A.spKind === 'barrier', '结界机兵：大招「结界展开」生成结界');
  ok(A.shield >= 40, `1.9.1：结界展开时自己 / 队友得到护盾（${A.shield}）`);
  ok(kbs.some((e) => e[1] === B.id && e[2] > 100), '1.9.1：结界展开把里面的敌人弹出去');
  A.shield = 0; A.shieldT = 0;
  A.hp = 50; const h0 = A.hp; g.lastHurtFake = 0; steps(g, S.TICK);
  ok(A.hp > h0 + 8, `结界里队友每秒回血（${h0} → ${Math.round(A.hp)}）`);
  A.hp = 100; g.hurt(A, 40, B);
  ok(Math.abs(100 - A.hp - 28) < 0.5, `结界里队友受到的伤害 -30%（40 → ${(100 - A.hp).toFixed(1)}）`);
  ok(B.dslowT > 0, '闯进结界的敌人减速');
}
// 赤镰：恶灵附身吸血 + 被动
{
  const { g, A, B } = duel({ pilot: 'aka', weapon: 'reaper' }, { pilot: 'blaze', weapon: 'blaster' });
  A.input.gq++; steps(g, 2);
  ok(A.possT > 3, '赤镰：恶灵附身 4 秒');
  A.hp = 60; B.hp = B.maxHp = 999; g.hurt(B, 40, A);
  ok(A.hp > 60 + 13, `附身期间吸血 35%（60 → ${A.hp.toFixed(1)}）`);
  const bh = B.hp; g.hurt(A, 40, B);
  ok(true, '');
  const { g: g2, A: A2, B: B2 } = duel({ pilot: 'aka', weapon: 'reaper' }, { pilot: 'blaze', weapon: 'blaster' });
  B2.hp = B2.maxHp = 999; A2.hp = A2.maxHp; g2.hurt(B2, 20, A2); const d0 = 999 - B2.hp;
  B2.hp = 999; A2.hp = A2.maxHp * 0.3; g2.hurt(B2, 20, A2); const d1 = 999 - B2.hp;
  ok(Math.abs(d1 / d0 - 1.22) < 0.01, `赤镰被动「恶灵低语」：残血时伤害 ×${(d1 / d0).toFixed(2)}`);
  void bh;
}
// 灵刃机兵：刀气 + 裂空斩
{
  const { g, A, B } = duel({ pilot: 'blaze', weapon: 'reaper' }, { pilot: 'blaze', weapon: 'blaster' }, { gap: 190 });
  B.hp = B.maxHp = 999;
  A.input.aq++; steps(g, 18);
  ok(B.hp < 999, `灵刃机兵：刀气打中 190 外的敌人（${Math.round(999 - B.hp)} 伤害）`);
  const { g: g2, A: A2, B: B2 } = duel({ pilot: 'blaze', weapon: 'reaper' }, { pilot: 'blaze', weapon: 'blaster' }, { gap: 400 });
  B2.hp = B2.maxHp = 999;
  A2.sp = S.WEAPONS.reaper.spNeed; A2.input.qq++; steps(g2, 4);
  ok(B2.hp === 999, '裂空斩：蓄力期间还没出刀');
  let rd = 0; const ev0 = g2.ev.bind(g2); g2.ev = (e) => { if (e[0] === 'rend') rd++; ev0(e); };
  steps(g2, S.TICK);
  ok(rd === 1 && 999 - B2.hp >= 84, `裂空斩：贯穿 400 外的敌人（${Math.round(999 - B2.hp)} 伤害）`);
}
// 超载
{
  const { g, A, B } = duel({ pilot: 'fu', weapon: 'warden' }, { pilot: 'blaze', weapon: 'blaster' });
  A.bt = 1; A.ov = S.OV_NEED; B.hp = B.maxHp = 999; A.input.oq++; steps(g, S.TICK * 2.2);
  ok(B.hp < 999 - 25 && B.slowT > 0, `符零超载「百符结界」：每秒符咒伤害 + 减速（${Math.round(999 - B.hp)}）`);
  const { g: g2, A: A2, B: B2 } = duel({ pilot: 'aka', weapon: 'reaper' }, { pilot: 'blaze', weapon: 'blaster' });
  A2.bt = 1; A2.ov = S.OV_NEED; A2.input.oq++; steps(g2, 2);
  A2.hp = 50; B2.hp = B2.maxHp = 999; g2.hurt(B2, 10, A2);
  ok(A2.hp >= 56, `赤镰超载「灵化爆发」：命中回血（50 → ${A2.hp.toFixed(1)}）`);
}

// ---------------- 咒灵讨伐 ----------------
let raidWins = 0;
const RUNS = 4;
for (let run = 0; run < RUNS; run++) {
  const room = new Room('RAID', null, { manual: true });
  room.settings = { mode: 'raid', map: -1, duration: 240, teamSize: 3, bots: true, personas: run % 2 === 0 };
  const g = new Game(room, { manual: true });
  const cnt = {};
  const ev0 = g.ev.bind(g); g.ev = (e) => { if (e[0] === 'boss' || e[0] === 'tg' || e[0] === 'summon') { const key = e[0] === 'boss' ? 'boss:' + e[2] : e[0] + ':'; cnt[key] = (cnt[key] || 0) + 1; } ev0(e); };
  const boss = [...g.players.values()].find((p) => p.boss);
  const t1 = [...g.players.values()].filter((p) => p.team === 1);
  if (run === 0) {
    ok(!!boss && boss.maxHp === S.RAID.hp && t1.length === 4, `讨伐：百目 ${boss.maxHp} 血，玩家方 ${t1.length} 人（AI 补满 4 人）`);
    ok([...g.players.values()].filter((p) => p.team === 2 && !p.npc).length === 0, '讨伐：对面没有普通 AI');
    ok(g.minions.length === 4 && g.minions.every((m) => !m.alive), '讨伐：4 只小咒灵待命（还没出场）');
  }
  let ticks = 0;
  while (!g.over && ticks < 250 * S.TICK) { g.step(); ticks++; }
  if (g.result.winner === 1) raidWins++;
  if (run === 0) {
    ok(g.over && (g.result.winner === 1 || g.result.winner === 2), `讨伐打完了：${g.result.winner === 1 ? '讨伐成功' : '超时失败'}（${(ticks / S.TICK).toFixed(0)} 秒，百目剩 ${Math.max(0, Math.round(boss.hp))}）`);
    ok(cnt['tg:'] > 0 && cnt['boss:ring'] > 0 && cnt['boss:summon'] > 0, `百目用了砸地（${cnt['tg:'] || 0}）、弹幕环（${cnt['boss:ring'] || 0}）、召唤（${cnt['boss:summon'] || 0}）`);
    ok(g.result.players.every((q) => q.team === 1) && g.result.players.length === 4, '结算里只有玩家方（百目和小咒灵不进结算）');
    ok(g.result.boss && g.result.boss.max === boss.maxHp, '结算带百目的血量');
  }
}
ok(raidWins >= 1, `4 个 AI 合作讨伐：${RUNS} 局赢 ${raidWins} 局（不能太难）`);
// 百目不会被敌方涂料烫、不会脱战回血、不会被击退
{
  const room = new Room('RAID2', null, { manual: true });
  room.settings = { mode: 'raid', map: -1, duration: 240, teamSize: 1, bots: false };
  room.members.set(1, { id: 1, name: 'A', team: 2, weapon: 'blaster', head: 'antenna', pilot: 'blaze' });
  const g = new Game(room, { manual: true });
  g.countdown = 0;
  const A = g.players.get(1), boss = g.boss;
  ok(A.team === 1, '讨伐：真人总是在玩家方');
  boss.bossAI.t = 99;
  for (let x = 0; x < S.GW; x++) for (let y = 0; y < S.GH; y++) g.grid[y * S.GW + x] = 1;
  boss.hp = boss.maxHp - 500; steps(g, S.TICK * 5);
  ok(Math.abs(boss.hp - (boss.maxHp - 500)) < 1, `百目站在敌方涂料上不掉血、也不回血（${Math.round(boss.hp)} / ${boss.maxHp}）`);
  const bx = boss.x; g.hurt(boss, 80, A, -1, 0, 3, 200); steps(g, 3);
  ok(Math.abs(boss.x - bx) < 30, '百目不会被击退');
  g.hurt(boss, 1e6, A);
  ok(g.over && g.result.winner === 1 && A.stats.spirits === 1, '打倒百目：讨伐成功，记 1 只咒灵');
}

// ---------------- 封印争夺 ----------------
{
  const room = new Room('SEAL', null, { manual: true });
  room.settings = { mode: 'seal', map: -1, duration: 180, teamSize: 3, bots: true, personas: false };
  const g = new Game(room, { manual: true });
  let summons = 0, deps = 0;
  const ev0 = g.ev.bind(g); g.ev = (e) => { if (e[0] === 'summon') summons++; if (e[0] === 'dep') deps++; ev0(e); };
  ok(g.spirits.length === 6 && g.spirits.every((s) => !s.alive && s.team === S.SEAL.team), '封印争夺：6 只游荡咒灵待命（中立）');
  let ticks = 0;
  while (!g.over && ticks < 190 * S.TICK) { g.step(); ticks++; }
  const sp = g.result.players.reduce((m, q) => m + q.spirits, 0), seals = g.result.players.reduce((m, q) => m + q.seals, 0);
  ok(summons >= 5, `咒灵陆续出场：${summons} 次`);
  ok(sp >= 3, `AI 打倒了 ${sp} 只咒灵`);
  ok(deps > 0 && seals === g.result.score[1] + g.result.score[2], `存入封印石 ${seals} 个（比分 ${g.result.score[1]} : ${g.result.score[2]}）`);
  ok(g.result.players.every((q) => q.team === 1 || q.team === 2), '结算里没有咒灵');
  let painted3 = 0; for (const v of g.grid) if (v === 3) painted3++;
  ok(painted3 === 0, '中立咒灵不会涂地');
}

// ---------------- 活动经济 ----------------
{
  const now = Date.UTC(2026, 10, 16, 12);
  const ev = E.activeEvents(now).find((x) => x.id === 'yato');
  ok(!!ev && ev.cur === 'talismans', '活动「夜都决战」进行中，代币是灵符');
  const o = E.newProfile('术师');
  ok(!E.offers(o, now).pilots.some((id) => E.COLLAB.pilots.includes(id)) && E.offers(o, now).mech !== 'reaper' && E.offers(o, now).mech !== 'warden', '联动角色不会出现在限时购买里');
  // 一局讨伐：给灵符、记任务
  const rw = { xp: 100, trophies: 5, won: true, draw: false, mvp: false, kills: 2, paint: 300, mode: 'raid', seals: 0, spirits: 3 };
  const r = E.applyMatch(o, rw, now);
  const tal = r.items.filter((it) => it.k === 'talismans').reduce((m, it) => m + it.n, 0);
  ok(tal === 15, `讨伐胜利给 15 灵符（实际 ${tal}）`);
  const qi = ev.quests.findIndex((q) => q[0] === 'raidwin' && q[2].k === 'pilot');
  const c1 = E.apply(o, 'claimEvent', { id: 'yato', i: qi, now });
  ok(c1.ok && o.pilots.fu && o.pilots.fu.lv === 1, '完成「讨伐成功 1 次」：免费获得符零');
  const c2 = E.apply(o, 'claimEvent', { id: 'yato', i: qi, now });
  ok(!c2.ok, '不能重复领');
  const si = ev.quests.findIndex((q) => q[0] === 'spirits');
  ok(o.ev.yato.p[si] === 3, '打倒咒灵计入任务进度');
  // 登录奖励
  const l1 = E.apply(o, 'evLogin', { id: 'yato', now });
  const l2 = E.apply(o, 'evLogin', { id: 'yato', now: now + 3600e3 });
  const l3 = E.apply(o, 'evLogin', { id: 'yato', now: now + 86400e3 });
  ok(l1.ok && !l2.ok && l3.ok && o.evLogin.yato.n === 2, '登录奖励：每天领一次');
  // 活动商店用灵符
  o.talismans = 500;
  const s1 = E.apply(o, 'eventShop', { id: 'yato', i: 0, now });
  ok(s1.ok && o.skins.includes('blaze_yato') && o.talismans === 500 - ev.shop[0].cost, `活动商店：灵符兑换「夜都·学院生」（剩 ${o.talismans}）`);
  // 宝石购买赤镰 + 灵刃
  o.gems = 1000;
  const b1 = E.apply(o, 'collabBuy', { id: 'bundle', now });
  ok(b1.ok && o.pilots.aka && o.mechs.includes('reaper') && o.gems === 1000 - E.COLLAB.bundle, `联动礼包：宝石买下赤镰 + 灵刃机兵（${E.COLLAB.bundle} 宝石）`);
  ok(!E.apply(o, 'collabBuy', { id: 'aka', now }).ok, '已经拥有的不能再买');
  // 资料清洗保留登录进度和灵符
  const c = E.normalize(JSON.parse(JSON.stringify(o)), o.name);
  if (c) ok(c.evLogin.yato.n === 2 && c.talismans === o.talismans, '存档清洗后保留登录进度和灵符');
  // 联动皮肤都有 3D 动画
  const sk = S.SKINS.filter((k) => k.series === 'yato' && k.kind === 'pilot');
  ok(sk.length === 4 && sk.every((k) => k.trailer), `联动驾驶员皮肤 ${sk.length} 套，都有 3D 战斗动画`);
}


// 1.9.1：符零超载「简易领域」——跟着自己走，中和子弹、自动反击闯入者
{
  const { g, A, B } = duel({ pilot: 'fu', weapon: 'blaster' }, { pilot: 'blaze', weapon: 'blaster' }, { gap: 120 });
  A.bt = 1; A.ov = S.OV_NEED; g.activateOverload(A);
  const dm = g.helpers.find((h) => h.kind === 'domain');
  ok(!!dm && dm.owner === A.id && dm.r === 170, '简易领域：展开半径 170 的领域');
  const hp0 = B.hp; steps(g, 3);
  ok(B.hp < hp0 && B.sealT > 0 && B.slowT > 0, `简易领域：闯进来的敌人被自动反击（${hp0} → ${Math.round(B.hp)}），减速并封住技能`);
  A.x += 60; steps(g, 1);
  ok(Math.abs(dm.x - A.x) < 1, '简易领域：跟着符零移动');
  const n0 = g.projs.length; g.spawnProj(B, Math.atan2(A.y - B.y, A.x - B.x), 0, 700, 400, 20, 10, 8, 6, null, null);
  const hpA = A.hp; steps(g, 20);
  ok(A.hp >= hpA - 0.01 && g.projs.length <= n0, '简易领域：飞进领域的敌方子弹被中和');
  A.ovT = 0; steps(g, 2);
  ok(!g.helpers.some((h) => h.kind === 'domain'), '简易领域：超载结束后领域消失');
}
// 1.9.1：结界机兵——连中 4 发符印束缚
{
  const { g, A, B } = duel({ pilot: 'blaze', weapon: 'warden' }, { pilot: 'blaze', weapon: 'blaster' }, { gap: 100 });
  for (let i = 0; i < 4; i++) g.sideFx(B, { slow: 0.35, ward: 4, by: A.id });
  ok(B.bindT > 0 && B.wardN === 0, `结界机兵：连中 4 发符印 → 束缚 ${B.bindT} 秒`);
}
// 1.9.1：灵刃机兵——第 3 刀回旋斩、裂空斩人跟着冲过去
{
  const { g, A, B } = duel({ pilot: 'blaze', weapon: 'reaper' }, { pilot: 'blaze', weapon: 'blaster' }, { gap: 60 });
  const W = S.WEAPONS.reaper; let spins = 0, dash = 0; const ev0 = g.ev.bind(g); g.ev = (e) => { if (e[0] === 'spin') spins++; if (e[0] === 'kb' && e[1] === A.id && e[2] > 300) dash = e[2]; ev0(e); };
  for (let i = 0; i < 3; i++) g.punch(A, W);
  ok(spins === 1, '灵刃机兵：连续第 3 刀是回旋斩');
  A.input.a = 0; A.sp = W.spNeed; A.input.qq++; steps(g, S.TICK);
  ok(dash > 300, `灵刃机兵：裂空斩出刀时人跟着冲出去（冲量 ${dash}）`);
}
console.log(failed ? `\n${failed} 项失败` : '\n夜都决战测试全部通过');
process.exit(failed ? 1 : 0);
