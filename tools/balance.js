// 平衡分析：让 AI 用随机驾驶员 + 随机机体打很多局，统计每个驾驶员 / 机体的胜率和 K/D
// 运行：node tools/balance.js [局数，默认 240]
// 说明：AI 的打法对不同机体并不完全公平（比如近战机体更吃走位），所以只把明显偏离的当成调整依据
'use strict';
const S = require('../public/shared.js');
const { Game, Room } = require('../server.js');

const N = +process.argv[2] || 240;
const modes = ['turf', 'zone', 'escort', 'soccer', 'battery', 'elim'];
const stat = (map, k) => map[k] || (map[k] = { n: 0, win: 0, kills: 0, deaths: 0, paint: 0 });
const byW = {}, byP = {};
let seed = 7;
Math.random = (() => { let s = 0x2545f491; return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 1e9) / 1e9; }; })();   // 固定随机种子，前后对比更可靠
const t0 = Date.now();
for (let i = 0; i < N; i++) {
  const room = new Room('BAL', null, { manual: true });
  room.settings = { mode: modes[i % modes.length], map: i % S.MAP_N, duration: 150, teamSize: 4, bots: true, personas: false };
  const g = new Game(room, { manual: true });
  for (const p of g.players.values()) {   // 随机搭配，等级统一
    p.pilot = S.PILOTS[Math.floor(Math.random() * S.PILOTS.length)].id;
    p.weapon = S.WEAPON_ORDER[Math.floor(Math.random() * S.WEAPON_ORDER.length)];
    p.maxHp = Math.round(S.WEAPONS[p.weapon].hp * (p.pilot === 'titan' ? 1.15 : 1)); p.hp = p.maxHp; p.lv = 7; p.bt = 1; p.pmul = 1;
  }
  let ticks = 0;
  while (!g.over && ticks < 320 * S.TICK) { g.step(); ticks++; }
  if (!g.over) g.finish(null);
  const r = g.result;
  if (!r.winner) continue;
  for (const p of r.players) {
    const pp = g.players.get(p.id);
    for (const s of [stat(byW, pp.weapon), stat(byP, pp.pilot)]) {
      s.n++; if (p.team === r.winner) s.win++;
      s.kills += p.kills; s.deaths += p.deaths; s.paint += p.paint;
    }
  }
}
void seed;
const show = (title, map, nameOf) => {
  console.log(`\n${title}`);
  const rows = Object.entries(map).map(([k, s]) => ({ k, wr: s.win / s.n, kd: s.kills / Math.max(1, s.deaths), paint: s.paint / s.n, n: s.n }));
  rows.sort((a, b) => b.wr - a.wr);
  for (const r of rows) {
    const flag = r.wr > 0.56 ? '  ▲ 偏强' : r.wr < 0.44 ? '  ▼ 偏弱' : '';
    console.log(`${nameOf(r.k).padEnd(6, '　')} 胜率 ${(r.wr * 100).toFixed(1).padStart(5)}%  K/D ${r.kd.toFixed(2)}  涂地 ${r.paint.toFixed(0).padStart(4)}  样本 ${r.n}${flag}`);
  }
  return rows;
};
const W = show('机体', byW, (k) => S.WEAPONS[k].name);
const P = show('驾驶员', byP, (k) => S.pilot(k).name);
console.log(`\n${N} 局，用时 ${((Date.now() - t0) / 1000).toFixed(0)} 秒`);
if (process.argv.includes('--json')) console.log(JSON.stringify({ W, P }));
