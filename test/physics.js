// 物理手感测试：加速、滑行、跳跃高度、土狼时间、跳跃缓冲、贴墙滑行、击退
// 运行：node test/physics.js
'use strict';
const S = require('../public/shared.js');
const { Game, Room } = require('../server.js');

let failed = 0;
const ok = (c, msg) => { console.log((c ? '✓ ' : '✗ ') + msg); if (!c) failed++; };
const M0 = S.buildMap(0);
const flat = { top: new Float32Array(S.GW * S.GH), solid: new Uint8Array(S.GW * S.GH), lv: new Uint8Array(S.GW * S.GH) };
const grid = new Uint8Array(S.GW * S.GH);
const DT = 1 / 120;
const bot = (x = 900, y = 640) => ({ x, y, z: 0, vx: 0, vy: 0, vz: 0, onGround: true, team: 1, sm: 1 });
const run = (p, inp, sec, M = flat, g = grid) => { let maxZ = p.z; for (let t = 0; t < sec; t += DT) { S.stepMove(p, typeof inp === 'function' ? inp(t) : inp, DT, g, M, 1); maxZ = Math.max(maxZ, p.z); } return maxZ; };

// 1. 起步加速有过程，不是瞬间满速
{ const W = S.SPEED.walk; const p = bot(); run(p, { mx: 1, my: 0 }, 0.03); const v1 = p.vx; run(p, { mx: 1, my: 0 }, 0.5); ok(v1 > W * 0.3 && v1 < W * 0.7 && Math.abs(p.vx - W) < 2, `行走起步：0.03s 时 ${v1.toFixed(0)}，之后满速 ${p.vx.toFixed(0)}（${W}）`); }
// 2. 松手后有短暂滑行
{ const p = bot(); run(p, { mx: 1, my: 0 }, 0.6); const x0 = p.x; run(p, {}, 0.5); ok(p.x - x0 > 2 && p.x - x0 < 20 && p.vx === 0, `行走急停滑行 ${(p.x - x0).toFixed(1)} 单位`); }
// 3. 己方涂料上滚轮惯性大、滑得远
{ const g = new Uint8Array(S.GW * S.GH).fill(1); const p = bot(); run(p, { mx: 1, my: 0, w: true }, 1, flat, g); const v = p.vx, x0 = p.x; run(p, { w: true }, 0.6, flat, g); ok(Math.abs(v - S.SPEED.wheelOwn) < 2 && p.x - x0 > 80, `滚轮满速 ${v.toFixed(0)}，松手滑行 ${(p.x - x0).toFixed(0)} 单位`); }
// 4. 敌方涂料又黏又慢
{ const g = new Uint8Array(S.GW * S.GH).fill(2); const p = bot(); run(p, { mx: 1, my: 0 }, 1, flat, g); ok(p.vx <= S.SPEED.enemy + 0.5, `敌方涂料上行走速度 ${p.vx.toFixed(0)}`); }
// 5. 跳跃高度：长按全跳能上矮台(40)，短按小跳更低；滚轮跳能上高台(80)
{ const p = bot(); const h = run(p, (t) => ({ j: t < 0.6, jh: t < 0.6 }), 1.2); const q = bot(); const hs = run(q, (t) => ({ j: t < 0.06, jh: t < 0.06 }), 1.2);
  const w = bot(); const hw = run(w, (t) => ({ j: t < 0.6, jh: t < 0.6, w: true }), 1.2);
  ok(h > 55 && hs < h - 15 && hw > 82, `跳跃高度：长按 ${h.toFixed(0)}，短按 ${hs.toFixed(0)}，滚轮 ${hw.toFixed(0)}`); }
// 6. 土狼时间：走出平台边缘后 0.08s 内仍可起跳
{ const M = S.buildMap(0); const p = bot(); // 找一个矮台边缘：直接构造一个 40 高的平台
  const top = new Float32Array(S.GW * S.GH); for (let y = 0; y < S.GH; y++) for (let x = 0; x < 60; x++) top[y * S.GW + x] = 40;
  const Mp = { top, solid: new Uint8Array(S.GW * S.GH), lv: new Uint8Array(S.GW * S.GH) };
  const q = { ...bot(60 * S.CELL - 4, 640), z: 40, vx: 165 }; let leftT = -1, jumpedAt = -1;
  for (let t = 0; t < 0.4; t += DT) { const air = !q.onGround; if (air && leftT < 0) leftT = t; const want = leftT >= 0 && t - leftT > 0.06; S.stepMove(q, { mx: 1, my: 0, j: want, jh: want }, DT, grid, Mp, 1); if (q.vz > 300 && jumpedAt < 0) jumpedAt = t; }
  ok(jumpedAt > 0, `土狼时间：离开边缘 ${leftT >= 0 ? '后' : '？'} 仍然跳了起来`); }
// 7. 跳跃缓冲：落地前 0.1s 按跳，落地瞬间自动起跳
{ const p = bot(); p.z = 30; p.onGround = false; p.vz = -200; let jumped = false;
  for (let t = 0; t < 0.4; t += DT) { const j = t > 0.0 && t < 0.02; S.stepMove(p, { j, jh: true }, DT, grid, flat, 1); if (p.vz > 300) jumped = true; }
  ok(jumped, '跳跃缓冲：提前按跳在落地时生效'); }
// 8. 贴墙滑行：斜着撞墙不会卡死，沿墙方向保留速度
{ const p = bot(15 * S.CELL - 20, 20 * S.CELL); // 霓虹工厂 x=16 处有高墙
  run(p, { mx: 0.7, my: 0.7 }, 0.6, M0); ok(p.vy > 80 && Math.abs(p.vx) < 30, `贴墙滑行：沿墙速度 ${p.vy.toFixed(0)}，撞墙方向 ${p.vx.toFixed(0)}`); }
// 9. 击退：独立于操控衰减，推人后 0.4s 内明显位移
{ const p = bot(), q = bot(); S.impulse(p, 300, 0, 0); run(p, { mx: -1, my: 0 }, 0.6); run(q, { mx: -1, my: 0 }, 0.6); ok(p.x - q.x > 30, `击退：反向推摇杆仍被推开 ${(p.x - q.x).toFixed(0)} 单位`); }
// 9b. 弹跳板：走上去被弹向空中并朝箭头方向飞出去；楼梯可以直接走上高台
{ const M = S.buildMap(0); const [px, py, ang] = M.pads[0];
  const p = bot((px + 1) * S.CELL - 40 * Math.cos(ang * Math.PI / 180), (py + 1) * S.CELL - 40 * Math.sin(ang * Math.PI / 180));
  const x0 = p.x, y0 = p.y; const a = ang * Math.PI / 180;
  const h = run(p, { mx: Math.cos(a), my: Math.sin(a) }, 1.6, M);
  ok(h > 120 && Math.hypot(p.x - x0, p.y - y0) > 250, `弹跳板：最高 ${h.toFixed(0)}，飞出 ${Math.hypot(p.x - x0, p.y - y0).toFixed(0)} 单位`); }
{ const M = S.buildMap(0); const [sx, sy, w, h, d] = M.stairs[0];   // 霓虹工厂左上角楼梯：向北走上 80 高台
  const p = bot((sx + w / 2) * S.CELL, (sy + h + 1.5) * S.CELL);
  run(p, { mx: 0, my: -1 }, 2.5, M);
  ok(p.z === 80, `楼梯：一路走上高台（高度 ${p.z}）`); }
// 10. 服务器：命中会给真人发击退事件，给 AI 直接施加冲量；被击退后的预测位置不会被判作弊
{ const room = new Room('PHYS', null, { manual: true });
  room.settings = { mode: 'turf', map: 0, duration: 60, teamSize: 1, bots: false };
  room.members.set(1, { id: 1, name: 'A', team: 1, weapon: 'blaster', head: 'antenna', pilot: 'blaze' });
  room.members.set(2, { id: 2, name: 'B', team: 2, weapon: 'blaster', head: 'antenna', pilot: 'frost' });
  const g = new Game(room, { manual: true });
  g.countdown = 0; g.step();
  const a = g.players.get(1), b = g.players.get(2);
  b.bot = true; b.x = a.x + 60; b.y = a.y;
  g.events = [];
  g.hurt(a, 30, b);
  const kb = g.events.find((e) => e[0] === 'kb' && e[1] === 1);
  ok(kb && kb[2] < 0, `真人被击中收到击退事件 ${JSON.stringify(kb)}`);
  g.hurt(b, 30, a);
  ok(b.kx > 0, `AI 被击中直接获得冲量 kx=${b.kx && b.kx.toFixed(0)}`);
  const sync = a.sync; g.time += 0.2;
  g.input(1, { mx: 0, my: 0, a: 0, pt: 0, x: a.x - 55, y: a.y, z: 0, vx: -260, vy: 0, vz: 0, sync: a.sync });
  ok(a.sync === sync && Math.abs(a.vx + 260) < 1, '被击退后的客户端位置被服务器接受');
  // 狙击满蓄力后坐力
  a.weapon = 'charger'; g.events = [];
  g.fireCharger(a, 1, S.WEAPONS.charger);
  ok(g.events.some((e) => e[0] === 'kb' && e[1] === 1), '狙击满蓄力产生后坐力');
}

console.log(failed ? `\n${failed} 项失败` : '\n物理测试全部通过');
process.exit(failed ? 1 : 0);
