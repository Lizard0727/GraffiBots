// 玩法机制测试：让 AI 用遍所有机体和驾驶员打几局，检查攻击 / 大招 / 技能 / 弹出驾驶员 / 空投新机体都真的发生了
// 运行：node test/mechanics.js
'use strict';
const S = require('../public/shared.js');
const { Game, Room } = require('../server.js');

let failed = 0;
const ok = (c, msg) => { console.log((c ? '✓ ' : '✗ ') + msg); if (!c) failed++; };
const count = {};
const add = (k) => { count[k] = (count[k] || 0) + 1; };

// 每局把 8 个 AI 的驾驶员 / 机体轮换成指定组合，保证 11 位驾驶员和 7 种机体都上场
for (let round = 0; round < 6; round++) {
  const room = new Room('MECH', null, { manual: true });
  room.settings = { mode: S.MODE_ORDER[round % 5], map: round % S.MAP_N, duration: 150, teamSize: 4, bots: true, personas: false };
  const g = new Game(room, { manual: true });
  let k = round * 8;
  for (const p of g.players.values()) {
    if (p.npc) continue;   // 1.8：百目 / 咒灵不换
    p.pilot = S.PILOTS[k % S.PILOTS.length].id; p.weapon = S.WEAPON_ORDER[k % S.WEAPON_ORDER.length];
    p.maxHp = S.WEAPONS[p.weapon].hp; p.hp = p.maxHp; k++;
  }
  const origEv = g.ev.bind(g);
  g.ev = (e) => {
    origEv(e);
    if (e[0] === 'sk') add('skill:' + e[2]);
    else if (e[0] === 'sp') add('super:' + e[2]);
    else add(e[0]);
  };
  let ticks = 0;
  while (!g.over && ticks < 170 * S.TICK) { g.step(); ticks++; }
  // 弹药机制：每个 AI 都应该在 0~3 之间
  for (const p of g.players.values()) if (!(p.ammo >= 0 && p.ammo <= S.AMMO)) { failed++; console.log('✗ 弹药越界', p.name, p.ammo); }
}

ok(count.wreck > 10, `机体被摧毁、驾驶员弹出：${count.wreck || 0} 次`);
ok(count.mdrop > 3, `驾驶员活下来，新机体在原地空投：${count.mdrop || 0} 次`);
ok(count.kill > 3, `驾驶员被击倒：${count.kill || 0} 次`);
ok(count.lb > 20, `迫击炮弹：${count.lb || 0} 发`);
ok(count.pu > 10, `重拳：${count.pu || 0} 次`);
for (const sp of Object.keys(S.SPECIALS)) ok(count['super:' + sp] > 0, `大招「${S.SPECIALS[sp].name}」：${count['super:' + sp] || 0} 次`);
for (const sk of Object.keys(S.SKILLS)) ok(count['skill:' + sk] > 0, `技能「${S.SKILLS[sk].name}」：${count['skill:' + sk] || 0} 次`);

// 单元：弹药与装填
{
  const room = new Room('AMMO', null, { manual: true });
  room.settings = { mode: 'turf', map: 0, duration: 60, teamSize: 1, bots: false };
  room.members.set(1, { id: 1, name: 'A', team: 1, weapon: 'blaster', head: 'antenna', pilot: 'blaze' });
  const g = new Game(room, { manual: true });
  g.countdown = 0; g.step();
  const a = g.players.get(1);
  for (let i = 0; i < 3; i++) { a.input.aq++; for (let t = 0; t < 15; t++) g.step(); }
  ok(a.ammo < 0.6, `连续攻击 3 次后弹药耗尽（剩 ${a.ammo.toFixed(2)}）`);
  const before = g.projs.length + 0;
  a.input.aq++; g.step();
  ok(g.projs.length <= before + 0 || a.ammo >= 1, '没弹药时不能攻击');
  for (let t = 0; t < S.TICK * 4.5; t++) g.step();
  ok(a.ammo > 2.9, `4.5 秒后自动装满（${a.ammo.toFixed(2)}）`);
  // 被打爆 → 弹出驾驶员 → 6 秒后原地空投
  g.hurt(a, 999, null);
  ok(a.foot && a.alive && a.hp === S.PILOT_HP, '机体被摧毁后驾驶员弹出（50 生命）');
  const px = a.x;
  for (let t = 0; t < S.TICK * (S.REBUILD + 0.2); t++) g.step();
  ok(!a.foot && a.hp === a.maxHp && Math.abs(a.x - px) < 80, '6 秒后新机体在驾驶员身边空投，满血');
  a.invulnT = 0; g.hurt(a, 999, null); a.invulnT = 0; g.hurt(a, 999, null);
  ok(!a.alive && a.respawnT > 0, '驾驶员也被击倒后才算倒下，回基地复活');
}

console.log(failed ? `\n${failed} 项失败` : '\n玩法机制测试全部通过');
process.exit(failed ? 1 : 0);
