// AI 挂机检测：统计 AI 在「附近没有敌人可打」时，3 秒内几乎没挪动（原地踏步）的次数
// 运行：node tools/ai_idle.js [局数]
'use strict';
const S = require('../public/shared.js');
const { Game, Room } = require('../server.js');
const N = +process.argv[2] || 30;
const modes = ['turf', 'zone', 'escort', 'soccer', 'battery', 'elim', 'escape4', 'escape8'];
const idleW = {};
let windows = 0, idle = 0, footIdle = 0, footWin = 0;
const byMode = {};
for (let i = 0; i < N; i++) {
  const mode = modes[i % modes.length];
  const room = new Room('AI', null, { manual: true });
  room.settings = { mode, map: i % S.MAP_N, duration: 150, teamSize: 4, bots: true, personas: false };
  const g = new Game(room, { manual: true });
  const track = new Map();
  let t = 0;
  while (!g.over && t < 200 * S.TICK) {
    const before = new Map([...g.players.values()].map((p) => [p.id, [p.x, p.y]]));
    g.step(); t++;
    for (const p of g.players.values()) { const b = before.get(p.id); if (b) p._walk = (p._walk || 0) + Math.min(30, Math.hypot(p.x - b[0], p.y - b[1])); }
    if (t % (3 * S.TICK)) continue;
    for (const p of g.players.values()) {
      const prev = track.get(p.id); track.set(p.id, { x: p.x, y: p.y, alive: p.alive && !p.out, walk: p._walk || 0 });
      if (!prev || !prev.alive || !p.alive || p.out || g.countdown > 0) continue;
      let near = false;
      for (const e of g.players.values()) if (e.alive && !e.out && e.team !== p.team && Math.hypot(e.x - p.x, e.y - p.y) < (p.foot ? 450 : S.weaponRange(p.weapon) + 260)) near = true;
      if (near) continue;
      const walked = p._walk - (prev.walk || 0), net = Math.hypot(p.x - prev.x, p.y - prev.y);
      const moved = walked < 40 ? 0 : net;   // 站着不动，或者走来走去但位置几乎没变，都算挂机
      const m = byMode[mode] || (byMode[mode] = { w: 0, idle: 0 });
      m.w++; windows++;
      if (p.foot) footWin++;
      if (moved < 40) { idle++; m.idle++; if (p.foot) footIdle++; const wk = p.foot ? '驾驶员' : p.weapon; idleW[wk] = (idleW[wk] || 0) + 1;
        if (process.argv.includes('--why') && p.foot) { const ai = p.ai || {}; const gd = ai.goal ? Math.round(Math.hypot(ai.goal.x - p.x, ai.goal.y - p.y)) : -1;
          console.log(`  ${mode} ${p.name} foot=${p.foot ? 1 : 0} goalDist=${gd} path=${(ai.path || []).length} pi=${ai.pi} stuckT=${(ai.stuckT || 0).toFixed(1)} replan=${(ai.replan || 0).toFixed(1)} mx=${p.input.mx.toFixed(2)},${p.input.my.toFixed(2)} z=${p.z.toFixed(0)} calm=${ai.goal && ai.goal.calm} near=${ai.goal && ai.goal.near} lock=${(ai.lockT||0).toFixed(1)} unstick=${(ai.unstickT||0).toFixed(1)} walked=${Math.round(walked)} net=${Math.round(net)} hp=${Math.round(p.hp)} rebuild=${p.rebuildT > 1e6 ? 'never' : p.rebuildT.toFixed(1)}`); } }
    }
  }
}
console.log(`没有敌人时的 3 秒窗口 ${windows} 个，原地不动 / 来回踱步（3 秒净位移 <40）${idle} 个 = ${(idle / Math.max(1, windows) * 100).toFixed(1)}%`);
const wk = {}; for (const [k, v] of Object.entries(idleW)) wk[S.WEAPONS[k] ? S.WEAPONS[k].name : k] = v; console.log('按机体：', JSON.stringify(wk));
console.log(`其中弹出的驾驶员：${footIdle}/${footWin}`);
for (const [m, v] of Object.entries(byMode)) console.log(`  ${S.MODES[m].name.padEnd(8, '　')} ${(v.idle / Math.max(1, v.w) * 100).toFixed(1)}%  (${v.idle}/${v.w})`);
