// 2.0：每台机体的攻击特性
'use strict';
const S = require('../public/shared.js');
const { Game, Room } = require('../server.js');
let failed = 0;
const ok = (c, msg) => { console.log((c ? '✓ ' : '✗ ') + msg); if (!c) failed++; };
function duel(a, b, opt = {}) {
  const room = new Room('TRAIT', null, { manual: true });
  room.settings = { mode: 'turf', map: 0, duration: 120, teamSize: 1, bots: false };
  room.members.set(1, { id: 1, name: 'A', team: 1, weapon: a, head: 'antenna', pilot: 'blaze' });
  room.members.set(2, { id: 2, name: 'B', team: 2, weapon: b || 'blaster', head: 'antenna', pilot: 'blaze' });
  const g = new Game(room, { manual: true });
  g.countdown = 0;
  const A = g.players.get(1), B = g.players.get(2);
  for (const p of [A, B]) { p.z = 0; p.vx = p.vy = 0; }
  A.x = S.W / 2 - (opt.gap || 120); A.y = S.H / 2; B.x = S.W / 2; B.y = S.H / 2;
  A.input.a = 0; B.input.a = Math.PI;
  g.step();
  const evs = []; const ev0 = g.ev.bind(g); g.ev = (e) => { evs.push(e); ev0(e); };
  return { g, A, B, evs };
}
const steps = (g, n) => { for (let i = 0; i < n; i++) g.step(); };
ok(S.WEAPON_ORDER.every((id) => S.TRAITS[id] && S.TRAITS[id].name && S.TRAITS[id].desc), `${S.WEAPON_ORDER.length} 台机体都有攻击特性`);
ok(new Set(S.WEAPON_ORDER.map((id) => S.TRAITS[id].name)).size === S.WEAPON_ORDER.length, '攻击特性名字各不相同');
{ // 喷罐：最后一发爆裂弹
  const { g, A, evs } = duel('blaster');
  A.burst = { n: S.WEAPONS.blaster.shots, t: 0, aim: null, fl: null }; g.stepBurst(A, S.WEAPONS.blaster, 0);
  for (let i = 0; i < 10 && A.burst; i++) g.stepBurst(A, S.WEAPONS.blaster, S.WEAPONS.blaster.interval);
  const pj = g.projs.filter((p) => p.owner === A.id), last = pj[pj.length - 1];
  ok(evs.some((e) => e[0] === 'fin') && last && Math.abs(last.dmg / pj[0].dmg - S.WEAPONS.blaster.finale) < 0.01, `喷罐：第 5 发爆裂弹伤害 ×${last ? (last.dmg / pj[0].dmg).toFixed(2) : '?'}`);
}
{ // 旋转：越打越狠
  const { g, A } = duel('gatling'); const W = S.WEAPONS.gatling;
  A.burst = { n: W.shots, t: 0, aim: null, fl: null }; g.stepBurst(A, W, 0);
  for (let i = 0; i < 30 && A.burst; i++) g.stepBurst(A, W, W.interval);
  const pj = g.projs.filter((p) => p.owner === A.id);
  ok(pj.length === W.shots && pj[pj.length - 1].dmg > pj[0].dmg * 1.4, `旋转机兵：第 1 发 ${pj[0].dmg.toFixed(2)} → 第 12 发 ${pj[pj.length - 1].dmg.toFixed(2)}`);
}
{ // 狙击：蓄满贯穿第一个敌人
  const room = new Room('PIERCE', null, { manual: true });
  room.settings = { mode: 'turf', map: 0, duration: 120, teamSize: 2, bots: false };
  room.members.set(1, { id: 1, name: 'A', team: 1, weapon: 'charger', head: 'antenna', pilot: 'blaze' });
  room.members.set(2, { id: 2, name: 'B', team: 2, weapon: 'blaster', head: 'antenna', pilot: 'blaze' });
  room.members.set(3, { id: 3, name: 'C', team: 2, weapon: 'blaster', head: 'antenna', pilot: 'blaze' });
  const g = new Game(room, { manual: true }); g.countdown = 0;
  const [A, B, C] = [1, 2, 3].map((i) => g.players.get(i));
  for (const p of [A, B, C]) { p.z = 0; p.vx = p.vy = 0; p.invulnT = 0; p.y = S.H / 2; }
  A.x = S.W / 2 - 200; B.x = S.W / 2; C.x = S.W / 2 + 60; A.input.a = 0; A.input.pt = 0;
  g.step(); for (const p of [A, B, C]) { p.x = [S.W / 2 - 200, S.W / 2, S.W / 2 + 60][p.id - 1]; p.y = S.H / 2; p.invulnT = 0; }
  const hb = B.hp, hc = C.hp; g.fireCharger(A, 1, S.WEAPONS.charger);
  ok(B.hp < hb && C.hp < hc, `狙击：蓄满一枪贯穿（B ${hb} → ${Math.round(B.hp)}，后面的 C ${hc} → ${Math.round(C.hp)}）`);
  const hb2 = B.hp, hc2 = C.hp; B.hp = hb2; g.fireCharger(A, 0.5, S.WEAPONS.charger);
  ok(C.hp === hc2, '狙击：没蓄满的一枪不会贯穿');
}
{ // 泼桶：近身 +25%
  const near = duel('bucket', 'blaster', { gap: 60 }), far = duel('bucket', 'blaster', { gap: 180 });
  for (const d of [near, far]) { d.A.input.pt = 0; d.g.fireSpread(d.A, S.WEAPONS.bucket); steps(d.g, 30); }
  const lostN = near.B.maxHp - near.B.hp, lostF = far.B.maxHp - far.B.hp;
  ok(lostN > lostF, `泼桶：贴脸掉血 ${Math.round(lostN)} > 远处 ${Math.round(lostF)}`);
}
{ // 迫击：黏稠墨水
  const { g, A, B, evs } = duel('mortar', 'blaster', { gap: 200 });
  const sh = g.spawnShellRet(A, B.x, B.y, 45, 62, 0.3); sh.sticky = S.WEAPONS.mortar.sticky; B.slowT = 0;
  steps(g, 20);
  ok(B.slowT > 0.5 && evs.some((e) => e[0] === 'bx' && e[6] === 4), `迫击：落点的敌人被墨水粘住（减速 ${B.slowT.toFixed(2)} 秒）`);
}
{ // 重拳：第 3 拳上勾拳
  const { g, A, evs } = duel('fist', 'blaster', { gap: 60 });
  for (let i = 0; i < 3; i++) g.punch(A, S.WEAPONS.fist);
  ok(evs.filter((e) => e[0] === 'upper').length === 1, '重拳：连续第 3 拳是上勾拳');
}
{ // 喷火：点燃
  const { g, B } = duel('flamer');
  B.invulnT = 0; g.sideFx(B, { burn: 2, by: 1 }); const hp0 = B.hp; steps(g, Math.ceil(S.TICK * 1.2));
  ok(B.hp < hp0 - 4 && B.slowT === 0, `喷火：着火 1.2 秒掉 ${Math.round(hp0 - B.hp)} 血，不减速`);
}
{ // 拆楼锤：震荡减速
  const { g, A, B } = duel('wrecker', 'blaster', { gap: 70 });
  B.slowT = 0; g.punch(A, S.WEAPONS.wrecker);
  ok(B.slowT > 0.5, `拆楼锤：砸中后减速 ${B.slowT.toFixed(2)} 秒`);
}
{ // 喇叭：声纳暴露
  const { g, A, B } = duel('megaphone', 'blaster', { gap: 150 });
  A.input.pt = 0; g.fireSpread(A, S.WEAPONS.megaphone); steps(g, 30);
  ok(B.revealT > 1, `喇叭：被音波打中暴露 ${B.revealT.toFixed(1)} 秒`);
}
console.log(failed ? `\n${failed} 项失败` : '\n攻击特性测试全部通过');
process.exit(failed ? 1 : 0);
