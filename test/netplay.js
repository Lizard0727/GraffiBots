// 联机冒烟测试：启动服务器，两个模拟玩家建房 / 加入 / 开局，像浏览器一样预测移动并开火
// 运行：node test/netplay.js
'use strict';
const S = require('../public/shared.js');
const { createServer } = require('../server.js');

const PORT = 3999;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class Bot {
  constructor(name) { this.name = name; this.msgs = []; this.snaps = 0; this.handlers = []; }
  async open() {
    this.ws = new WebSocket(`ws://localhost:${PORT}/ws`);
    await new Promise((res, rej) => { this.ws.onopen = res; this.ws.onerror = rej; });
    this.ws.onmessage = (e) => this.onMsg(JSON.parse(e.data));
    this.send({ t: 'hello', name: this.name, weapon: 'blaster', head: 'antenna', level: 1 });
  }
  send(o) { this.ws.send(JSON.stringify(o)); }
  wait(t, ms = 3000) {
    return new Promise((res, rej) => {
      const to = setTimeout(() => rej(new Error(`${this.name} 等待 ${t} 超时`)), ms);
      this.handlers.push({ t, res: (m) => { clearTimeout(to); res(m); } });
    });
  }
  onMsg(m) {
    if (m.t === 'welcome') this.id = m.id;
    if (m.t === 'start') { this.game = m; this.grid = new Uint8Array(S.GW * S.GH); this.M = S.buildMap(m.map); this.sync = -1; this.gq = 0; }
    if (m.t === 's') {
      this.snaps++;
      for (const v of m.d) this.grid[v >> 4] = v & 15;
      this.last = m;
      const me = m.p.find((a) => a[0] === this.id);
      if (me && (me[13] !== this.sync || !(me[7] & 1))) { this.sync = me[13]; this.pos = { x: me[1], y: me[2], z: me[17], vx: 0, vy: 0, vz: 0, onGround: true }; this.resyncs = (this.resyncs || 0) + 1; }
      if (me) this.server = { x: me[1], y: me[2], z: me[17], ammo: me[5] / 100, skills: me[21], team: this.team, sm: me[10] / 100 };
    }
    if (m.t === 'lobby') { const me = m.room.players.find((p) => p.id === this.id); if (me) this.team = me.team; this.room = m.room; }
    this.handlers = this.handlers.filter((h) => { if (h.t === m.t) { h.res(m); return false; } return true; });
  }
  // 以 30Hz 预测并发送输入
  async drive(ms, mx, my, fire, aim, jump = false, pitch = -0.1) {
    const dt = 1 / 30;
    for (let t = 0; t < ms; t += 1000 / 30) {
      if (this.pos && this.last && this.last.cd <= 0) {
        const st = { ...this.pos, team: this.team, sm: (this.server && this.server.sm) || 1 };
        S.stepMove(st, { mx, my, w: false, j: jump }, dt, this.grid, this.M, S.moveMul('blaster', fire, null));
        this.pos = { x: st.x, y: st.y, z: st.z, vx: st.vx, vy: st.vy, vz: st.vz, onGround: st.onGround };
        this.maxZ = Math.max(this.maxZ || 0, st.z);
      }
      if (this.pos) this.send({ t: 'in', mx, my, a: aim, pt: pitch, f: fire, w: false, gq: this.gq, qq: 0, x: this.pos.x, y: this.pos.y, z: this.pos.z, vx: this.pos.vx, vy: this.pos.vy, vz: this.pos.vz, sync: this.sync });
      await sleep(1000 / 30);
    }
  }
}

(async () => {
  const server = createServer();
  await new Promise((r) => server.listen(PORT, r));
  let ok = true;
  const check = (cond, msg) => { console.log(`${cond ? '✓' : '✗'} ${msg}`); if (!cond) ok = false; };
  try {
    const A = new Bot('测试A'), B = new Bot('测试B');
    await A.open(); await B.open();
    A.send({ t: 'create' });
    const j = await A.wait('joined');
    check(/^[A-Z]{4}$/.test(j.code), `建房成功，房间码 ${j.code}`);
    B.send({ t: 'join', code: j.code });
    await B.wait('joined');
    await sleep(200);
    check(A.room.players.length === 2 && A.team !== B.team, `B 加入成功，自动分到不同队伍（A=${A.team} B=${B.team}）`);
    B.send({ t: 'join', code: 'ZZZZ' });
    const err = await B.wait('err');
    check(err.msg.includes('找不到'), `错误房间码提示：「${err.msg}」`);
    B.send({ t: 'start' });
    await sleep(200);
    check(!A.game, '非房主不能开始');
    A.send({ t: 'settings', mode: 'turf', map: 0, teamSize: 2, bots: true });
    A.send({ t: 'start' });
    await A.wait('start'); await sleep(50);
    check(A.game.players.length === 4, `开局：2v2，共 ${A.game.players.length} 名机兵（含 AI 补位）`);
    await sleep(3800); // 倒计时
    const start = { ...A.pos };
    const dir = A.team === 1 ? 1 : -1;
    await A.drive(2500, dir, 0, true, dir > 0 ? 0 : Math.PI);
    await sleep(150);
    const moved = Math.abs(A.server.x - start.x);
    check(moved > 250, `A 客户端预测移动被服务器接受：移动了 ${moved.toFixed(0)}px（重新同步 ${A.resyncs} 次）`);
    check(A.server.ammo < 2.9, `A 开火消耗了弹药（剩余 ${A.server.ammo.toFixed(2)} 格）`);
    let mine = 0;
    for (let i = 0; i < A.grid.length; i++) if (A.grid[i] === A.team) mine++;
    check(mine > 40, `地面被涂色：A 队 ${mine} 格`);
    const seen = B.last.p.find((p) => p[0] === A.id);
    check(seen && Math.abs(seen[1] - A.server.x) < 40, 'B 的快照里能看到 A 的最新位置');
    // 作弊校验：瞬移应被拒绝
    const before = { ...A.server };
    A.send({ t: 'in', mx: 0, my: 0, a: 0, pt: 0, f: false, w: false, gq: 0, qq: 0, x: before.x + 600 * dir, y: before.y, z: 0, vx: 0, vy: 0, vz: 0, sync: A.sync });
    await sleep(200);
    check(Math.abs(A.server.x - before.x) < 50, '瞬移被服务器拒绝并强制同步');
    // 跳跃：客户端预测的高度被服务器接受
    A.maxZ = 0; let peak = 0;
    const jt = setInterval(() => { if (A.server) peak = Math.max(peak, A.server.z); }, 10);
    await A.drive(700, 0, 0, false, 0, true);
    clearInterval(jt);
    check(A.maxZ > 40 && peak > 25, `跳跃：本地最高 ${A.maxZ.toFixed(0)}，服务器确认最高 ${peak}`);
    // 浮空作弊：直接报告 z=300 应被拒绝
    const zb = A.server.z;
    A.send({ t: 'in', mx: 0, my: 0, a: 0, pt: 0, f: false, w: false, gq: A.gq, qq: 0, x: A.server.x, y: A.server.y, z: 300, vx: 0, vy: 0, vz: 0, sync: A.sync });
    await sleep(200);
    check(A.server.z < 150, `浮空作弊被拒绝（z 报告 300，服务器保持 ${A.server.z}，原 ${zb}）`);
    await A.drive(300, 0, 0, false, 0);
    // 驾驶员技能（每局 3 次）
    const skBefore = A.server.skills;
    A.gq++;
    await A.drive(400, 0, 0, false, 0);
    check(skBefore === S.SKILL_USES && A.server.skills === S.SKILL_USES - 1, `使用驾驶员技能：剩余次数 ${skBefore} → ${A.server.skills}`);
    // 快捷语音
    A.send({ t: 'chat', k: 1 });
    const qc = await B.wait('qc');
    check(qc.id === A.id && qc.k === 1, `快捷语音广播：「${S.QUICK_CHAT[qc.k]}」`);
    check(A.snaps > 150, `收到快照 ${A.snaps} 个（约 30/s）`);
    // 离开：房主转移
    A.ws.close();
    await sleep(300);
    check(B.room.hostId === B.id, '房主离开后，房主自动转给 B');
    B.ws.close();
  } catch (e) {
    console.error('✗ 异常:', e.message); ok = false;
  }
  server.close();
  console.log(ok ? '\n联机测试全部通过' : '\n联机测试有失败项');
  process.exit(ok ? 0 : 1);
})();
