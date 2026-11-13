// 地图检查：出生点 / 终点 / 中心 / 球门不被挡；据点能涂；全图连通；楼梯真的能走上平台；弹跳板在地面上
// 运行：node test/maps.js
'use strict';
const S = require('../public/shared.js');
const { GW, GH, CELL } = S;
let failed = 0;
const ok = (c, msg) => { if (!c) { console.log('✗ ' + msg); failed++; } return c; };

for (let mi = 0; mi < S.MAPS.length; mi++) {
  const M = S.buildMap(mi), name = S.MAPS[mi].name;
  const at = (x, y) => S.topAt(M, x, y);
  const clearAround = (x, y, r) => { for (let dy = -r; dy <= r; dy += 4) for (let dx = -r; dx <= r; dx += 4) if (at(x + dx, y + dy) > 0) return false; return true; };
  let good = true;
  for (const t of [1, 2]) for (let s = 0; s < 4; s++) { const p = S.spawnPoint(t, s); good &= ok(clearAround(p.x, p.y, 20) && !S.collideTest(M, p.x, p.y, 0), `${name}：出生点 ${t}-${s} 被挡住`); }
  for (const t of [1, 2]) { const g = S.goalFor(t, mi); good &= ok(clearAround(g.x, g.y, 14), `${name}：护送终点被挡住`); }
  good &= ok(clearAround(S.W / 2, S.H / 2, 40), `${name}：地图中心（宝物 / 足球出生点）被挡住`);
  const G = S.SOCCER_GOAL;
  for (const gx of [G.depth / 2, S.W - G.depth / 2]) for (let y = S.H / 2 - G.half; y <= S.H / 2 + G.half; y += 8) good &= ok(at(gx, y) === 0, `${name}：球门口被挡住`);
  let zs = 0, zn = 0;
  for (let y = S.ZONE.y0; y < S.ZONE.y1; y++) for (let x = S.ZONE.x0; x < S.ZONE.x1; x++) { zn++; if (!M.solid[y * GW + x]) zs++; }
  good &= ok(zs / zn > 0.85, `${name}：据点里墙太多（可涂 ${(zs / zn * 100).toFixed(0)}%）`);
  // 连通性：允许跳上 80 以内的高差（滚轮跳）
  const seen = new Uint8Array(GW * GH);
  const sp = S.spawnPoint(1, 0), q = [Math.floor(sp.y / CELL) * GW + Math.floor(sp.x / CELL)];
  seen[q[0]] = 1;
  while (q.length) {
    const c = q.pop(), cx = c % GW, cy = (c / GW) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const x = cx + dx, y = cy + dy, n = y * GW + x;
      if (!S.inBounds(x, y) || seen[n] || M.solid[n] || M.top[n] > M.top[c] + 80) continue;
      seen[n] = 1; q.push(n);
    }
  }
  let open = 0, reach = 0;
  for (let i = 0; i < GW * GH; i++) if (!M.solid[i]) { open++; if (seen[i]) reach++; }
  good &= ok(reach / open > 0.995, `${name}：有 ${open - reach} 格到不了`);
  // 楼梯：只靠走路（每步高差 ≤ 10）能从地面走到每段楼梯的顶端平台
  const walk = new Uint8Array(GW * GH), wq = [];
  for (let i = 0; i < GW * GH; i++) if (M.top[i] === 0) { walk[i] = 1; wq.push(i); }
  while (wq.length) {
    const c = wq.pop(), cx = c % GW, cy = (c / GW) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const x = cx + dx, y = cy + dy, n = y * GW + x;
      if (!S.inBounds(x, y) || walk[n] || M.solid[n] || M.top[n] > M.top[c] + S.STEP) continue;
      walk[n] = 1; wq.push(n);
    }
  }
  for (const [x, y, w, h, d, to] of M.stairs) {
    const H = S.LEVEL_H[to];
    // 楼梯顶端外侧那一格应该是目标平台，而且能走到
    const tx = d === 'E' ? x + w : d === 'W' ? x - 1 : x + (w >> 1), ty = d === 'S' ? y + h : d === 'N' ? y - 1 : y + (h >> 1);
    const i = ty * GW + tx;
    good &= ok(S.inBounds(tx, ty) && M.top[i] === H && walk[i], `${name}：楼梯 (${x},${y},${d}) 走不上高度 ${H} 的平台（顶端外是 ${S.inBounds(tx, ty) ? M.top[i] : '界外'}）`);
  }
  for (const [x, y] of M.pads) good &= ok(M.pad[y * GW + x] > 0, `${name}：弹跳板 (${x},${y}) 不在地面上`);
  if (good) console.log(`✓ ${name}：${M.stairs.length} 段楼梯、${M.pads.length} 个弹跳板、${M.bushes.length} 片草丛，可走 ${reach}/${open} 格`);
}
console.log(failed ? `\n${failed} 项失败` : '\n地图检查全部通过');
process.exit(failed ? 1 : 0);
