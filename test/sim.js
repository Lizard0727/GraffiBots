// 无头模拟测试：8 个 AI 在每种模式 × 每张地图上完整打一局
// 运行：node test/sim.js
'use strict';
const S = require('../public/shared.js');
const { Game, Room } = require('../server.js');

let failed = 0;
// 出生点 / 终点 / 据点不应落在墙里
for (let m = 0; m < S.MAPS.length; m++) {
  const M = S.buildMap(m);
  const pts = [S.goalFor(1, m), S.goalFor(2, m), { x: S.W / 2, y: S.H / 2 }];
  for (const t of [1, 2]) for (let s = 0; s < 4; s++) pts.push(S.spawnPoint(t, s));
  for (const p of pts) if (S.topAt(M, p.x, p.y) > 0 || S.collideTest(M, p.x, p.y, 0)) { console.log(`✗ 地图 ${S.MAPS[m].name}: 点 (${p.x},${p.y}) 卡在墙里`); failed++; }
}

for (const mode of S.MODE_ORDER) {
  for (let map = 0; map < S.MAPS.length; map++) {
    const room = new Room('TEST', null, { manual: true });
    room.settings = { mode, map, duration: 180, teamSize: 4, bots: true, personas: false };
    const g = new Game(room, { manual: true });
    let ticks = 0;
    const t0 = Date.now();
    const cap = S.MODES[mode].oneLife ? 420 : 200;
    while (!g.over && ticks < cap * S.TICK) { g.step(); ticks++; }
    if (!g.over) { console.log(`✗ ${S.MODES[mode].name} @ ${S.MAPS[map].name}：${cap} 秒内没打完`); failed++; continue; }
    const r = g.result;
    const ms = Date.now() - t0;
    const kills = r.players.reduce((a, p) => a + p.kills, 0);
    const paintless = r.players.filter((p) => p.paint < 50).map((p) => p.name);
    const extra = r.place ? ` 名次 ${r.place.join('>')}` : r.rounds ? ` 回合 ${r.rounds[1]}:${r.rounds[2]}` : mode === 'zone' ? ` 倒计时 ${r.count[1]}/${r.count[2]}` : mode === 'turf' ? '' : ` 比分 ${r.score[1]}:${r.score[2]}`;
    let high = 0;
    for (let i = 0; i < g.grid.length; i++) if (g.grid[i] && g.M.top[i] > 0) high++;
    const ok = g.over && kills > 0 && (S.MODES[mode].oneLife || paintless.length === 0) && (!r.place || r.place.length === r.teams);
    if (!ok) failed++;
    console.log(`${ok ? '✓' : '✗'} ${S.MODES[mode].name.padEnd(5, '　')} @ ${S.MAPS[map].name}  用时 ${(ticks / S.TICK).toFixed(0)}s  胜方 ${r.winner} (${r.reason})  涂地 ${(r.turf[0] * 100).toFixed(1)}%/${(r.turf[1] * 100).toFixed(1)}%${extra}  击倒 ${kills}  高台涂色 ${high}格  模拟耗时 ${ms}ms${paintless.length ? '  ⚠ 几乎没涂地: ' + paintless.join(',') : ''}`);
  }
}
console.log(failed ? `\n${failed} 项失败` : '\n全部通过');
process.exit(failed ? 1 : 0);
