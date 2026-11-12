// 涂鸦机兵 GraffiBots — 对局核心（Node 服务器与浏览器内置服务器共用）
// 包含：对局模拟 Game、AI 机兵、房间 Room、消息处理 Hub
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./shared.js'));
  else root.GBCore = factory(root.GS);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (S) {
'use strict';
const rand = (a, b) => a + Math.random() * (b - a);
const randInt = (n) => Math.floor(Math.random() * n);
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const r1 = (v) => Math.round(v);
const r2 = (v) => Math.round(v * 100) / 100;

// =====================================================================
// 机器人寻路（粗网格 BFS，只走地面）
// =====================================================================
const NAV = 2, NW = S.GW / NAV, NH = S.GH / NAV;
function buildNav(M) {
  const nav = new Uint8Array(NW * NH);
  for (let y = 0; y < NH; y++)
    for (let x = 0; x < NW; x++) {
      let b = 0;
      for (let j = 0; j < NAV; j++) for (let i = 0; i < NAV; i++) if (M.top[(y * NAV + j) * S.GW + x * NAV + i] > 0) b = 1;
      nav[y * NW + x] = b;
    }
  return nav;
}
const NC = S.CELL * NAV;
function navCell(x, y) { return [clamp(Math.floor(x / NC), 0, NW - 1), clamp(Math.floor(y / NC), 0, NH - 1)]; }
function findPath(nav, sx, sy, tx, ty) {
  const [ax, ay] = navCell(sx, sy);
  const [bx, by] = navCell(tx, ty);
  const start = ay * NW + ax;
  let goal = by * NW + bx;
  if (nav[goal]) {
    let best = -1, bd = 1e9;
    for (let r = 1; r < 8 && best < 0; r++)
      for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) {
        const x = bx + i, y = by + j;
        if (x < 0 || y < 0 || x >= NW || y >= NH || nav[y * NW + x]) continue;
        const d = i * i + j * j;
        if (d < bd) { bd = d; best = y * NW + x; }
      }
    if (best < 0) return [];
    goal = best;
  }
  const prev = new Int32Array(NW * NH).fill(-1);
  prev[start] = start;
  const q = [start];
  let qi = 0, found = false;
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
  while (qi < q.length) {
    const c = q[qi++];
    if (c === goal) { found = true; break; }
    const cx = c % NW, cy = (c / NW) | 0;
    for (const [dx, dy] of dirs) {
      const x = cx + dx, y = cy + dy;
      if (x < 0 || y < 0 || x >= NW || y >= NH) continue;
      const n = y * NW + x;
      if (nav[n] || prev[n] >= 0) continue;
      if (dx && dy && (nav[cy * NW + x] || nav[y * NW + cx])) continue;
      prev[n] = c; q.push(n);
    }
  }
  if (!found) return [];
  const pathOut = [];
  for (let c = goal; c !== start; c = prev[c]) pathOut.push({ x: (c % NW) * NC + NC / 2, y: ((c / NW) | 0) * NC + NC / 2 });
  pathOut.reverse();
  return pathOut;
}
function floorLos(M, x0, y0, x1, y1) {
  const a = Math.atan2(y1 - y0, x1 - x0), ox = -Math.sin(a) * 12, oy = Math.cos(a) * 12;
  return S.los3(M, x0, y0, 5, x1, y1, 5) && S.los3(M, x0 + ox, y0 + oy, 5, x1 + ox, y1 + oy, 5) && S.los3(M, x0 - ox, y0 - oy, 5, x1 - ox, y1 - oy, 5);
}

const BOT_NAMES = ['螺丝钉', '齿轮君', '电池仔', '喷漆王', '铁皮罐', '涂涂', '罐头侠', '霓虹', '闪电', '扳手', '像素', '火花', '弹簧', '芯片'];

// =====================================================================
// 对局
// =====================================================================
class Game {
  constructor(room, opts = {}) {
    this.room = room;
    const st = room.settings;
    this.mode = st.mode;
    this.mapIdx = st.map < 0 ? randInt(S.MAPS.length) : st.map;
    this.M = S.buildMap(this.mapIdx);
    this.nav = buildNav(this.M);
    this.grid = new Uint8Array(S.GW * S.GH);
    this.duration = st.duration; this.timeLeft = st.duration;
    this.countdown = 3.5; this.time = 0; this.tick = 0; this.over = false;
    this.players = new Map(); this.projs = []; this.bombs = []; this.missiles = [];
    this.nextId = 1; this.diff = []; this.events = [];
    this.colorSet = room.colorSet;
    const slots = { 1: 0, 2: 0 };
    for (const c of room.members.values()) {
      if (slots[c.team] >= S.MAX_PER_TEAM) continue;
      this.addPlayer(c.id, c.name, c.team, c.weapon, c.head, false, slots[c.team]++);
    }
    if (st.bots) {
      let bi = 0;
      const names = BOT_NAMES.slice().sort(() => Math.random() - 0.5);
      for (const team of [1, 2])
        while (slots[team] < st.teamSize) {
          bi++;
          this.addPlayer(-bi, names[bi % names.length], team, S.WEAPON_ORDER[randInt(S.WEAPON_ORDER.length)],
            S.HEADS[randInt(S.HEADS.length)].id, true, slots[team]++);
        }
    }
    this.initMode();
    if (this.mode === 'zone') {
      this.zoneCells = [];
      for (let y = S.ZONE.y0; y < S.ZONE.y1; y++)
        for (let x = S.ZONE.x0; x < S.ZONE.x1; x++) if (!this.M.solid[y * S.GW + x]) this.zoneCells.push(y * S.GW + x);
    }
    room.broadcast({
      t: 'start', map: this.mapIdx, mode: this.mode, colorSet: this.colorSet, duration: this.duration,
      players: [...this.players.values()].map((p) => ({ id: p.id, name: p.name, team: p.team, weapon: p.weapon, head: p.head, bot: p.bot })),
    });
    if (!opts.manual) this.interval = setInterval(() => this.step(), 1000 / S.TICK);
  }

  addPlayer(id, name, team, weapon, head, bot, slot) {
    const p = {
      id, name, team, weapon, head, bot, slot,
      x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, onGround: true,
      hp: 100, tank: 100, sp: 0, alive: true, respawnT: 0, invulnT: 0,
      lastHurt: -10, fireCd: 0, charge: 0, spin: 0, rolling: false, flickT: -10, prevFire: false,
      spT: 0, spKind: null, spWave: 0, shield: 0, shieldT: 0, sm: 1, carry: 0, hidden: false, wheel: false, firing: false,
      input: { mx: 0, my: 0, a: team === 1 ? 0 : Math.PI, pt: 0, f: false, w: false, j: false, sq: 0, qq: 0 },
      lastSq: 0, lastQq: 0, sync: 0, lastPosT: 0, hitCd: {},
      stats: { kills: 0, deaths: 0, paint: 0, obj: 0 },
    };
    this.players.set(id, p);
    this.respawn(p);
    p.invulnT = 0;
    return p;
  }

  removePlayer(id) {
    const p = this.players.get(id);
    if (!p) return;
    this.dropItems(p);
    this.players.delete(id);
  }
  humanCount() { let n = 0; for (const p of this.players.values()) if (!p.bot) n++; return n; }
  ev(e) { this.events.push(e); }
  top(x, y) { return S.topAt(this.M, x, y); }

  // ------------------------------------------------------------------
  step() {
    const dt = 1 / S.TICK;
    this.tick++;
    if (this.countdown > 0) {
      this.countdown -= dt;
    } else if (!this.over) {
      this.time += dt; this.timeLeft -= dt;
      for (const p of this.players.values()) if (p.bot) botThink(this, p, dt);
      for (const p of this.players.values()) this.updatePlayer(p, dt);
      this.updateProjs(dt);
      this.updateBombs(dt);
      this.updateMissiles(dt);
      this.updateMode(dt);
      if (this.timeLeft <= 0) this.finish(null);
    }
    if (!this.room.manual) this.sendSnapshot();
    else { this.diff = []; this.events = []; }
  }

  input(id, m) {
    const p = this.players.get(id);
    if (!p || p.bot) return;
    const inp = p.input;
    inp.mx = clamp(+m.mx || 0, -1, 1); inp.my = clamp(+m.my || 0, -1, 1);
    if (Number.isFinite(m.a)) inp.a = m.a;
    if (Number.isFinite(m.pt)) inp.pt = clamp(m.pt, -1.4, 1.4);
    inp.f = !!m.f; inp.w = !!m.w;
    inp.sq = m.sq | 0; inp.qq = m.qq | 0;
    // 客户端预测移动，服务器校验（限速 + 不穿墙 + 高度合理）
    if (p.alive && this.countdown <= 0 && !this.over && Number.isFinite(m.x) && Number.isFinite(m.y) && Number.isFinite(m.z) && m.sync === p.sync) {
      const dtAllow = Math.min(0.6, this.time - p.lastPosT) + 0.05;
      const maxStep = (330 * p.sm + 40) * dtAllow + 12;
      const d = Math.hypot(m.x - p.x, m.y - p.y);
      const gh = this.top(m.x, m.y);
      const test = { x: m.x, y: m.y, z: m.z };
      S.collide(test, S.R - 2, this.M);
      const bad = Math.hypot(test.x - m.x, test.y - m.y) > 3 || m.z < gh - 2 || m.z > gh + 130 || m.z > p.z + (S.JUMP_W * S.JUMP_W) / (2 * S.GRAV) + 30;
      if (d <= maxStep && !bad) {
        p.x = m.x; p.y = m.y; p.z = Math.max(gh, m.z); p.lastPosT = this.time;
        const vmax = 420 * p.sm;
        p.vx = clamp(+m.vx || 0, -vmax, vmax); p.vy = clamp(+m.vy || 0, -vmax, vmax); p.vz = clamp(+m.vz || 0, -2000, 600);
        p.onGround = p.z <= gh + 1;
      } else {
        p.sync++;
      }
    }
  }

  // ------------------------------------------------------------------
  updatePlayer(p, dt) {
    if (!p.alive) {
      p.respawnT -= dt;
      if (p.respawnT <= 0) this.respawn(p);
      return;
    }
    const inp = p.input, W = S.WEAPONS[p.weapon];
    p.invulnT = Math.max(0, p.invulnT - dt);
    if (p.shieldT > 0) { p.shieldT -= dt; if (p.shieldT <= 0) p.shield = 0; }
    const spAct = p.spT > 0;
    let sm = 1;
    if (this.obj.tr && this.obj.tr.carrier === p.id) sm *= 0.72;
    if (p.carry) sm *= 1 - 0.04 * p.carry;
    if (spAct && p.spKind === 'charge') sm *= 1.45;
    p.sm = sm;
    const wheel = !!inp.w && !(spAct && p.spKind === 'beam');
    p.wheel = wheel;
    if (p.bot) { S.stepMove(p, inp, dt, this.grid, this.M, S.moveMul(p.weapon, inp.f && !wheel, spAct ? p.spKind : null)); inp.j = false; }

    const gh = this.top(p.x, p.y);
    const grounded = p.z <= gh + 1;
    const ground = grounded ? S.cellAt(this.grid, p.x, p.y) : -1;
    const own = ground === p.team, enemy = ground > 0 && !own;
    if (enemy && p.invulnT <= 0 && !(spAct && p.spKind === 'charge') && p.hp > 30) p.hp = Math.max(30, p.hp - 12 * dt);
    if (!enemy && this.time - p.lastHurt > 1.3) p.hp = Math.min(100, p.hp + (wheel && own ? 60 : 22) * dt);

    let firing = false;
    p.hidden = wheel && own;
    if (wheel) {
      p.tank = Math.min(100, p.tank + (own ? 48 : 8) * dt);
      if (p.weapon === 'charger' && p.charge > 0.08 && p.tank >= W.minCost) this.fireCharger(p, p.charge, W);
      p.charge = 0; p.spin = Math.max(0, p.spin - dt * 2); p.rolling = false;
    } else {
      firing = this.weaponLogic(p, inp, dt, W, grounded);
      if (!firing) p.tank = Math.min(100, p.tank + 12 * dt);
    }
    p.firing = firing;

    if (inp.sq !== p.lastSq) {
      p.lastSq = inp.sq;
      if (!wheel && p.tank >= S.SUB_COST) this.throwBomb(p);
    }
    if (inp.qq !== p.lastQq) {
      p.lastQq = inp.qq;
      if (p.sp >= W.spNeed && !spAct) this.activateSpecial(p);
    }
    if (p.spT > 0) this.updateSpecial(p, dt);
    p.prevFire = !!inp.f;
  }

  muzzle(p) {
    const d = S.dir3(p.input.a, p.input.pt);
    return { x: p.x + d.x * 16, y: p.y + d.y * 16, z: p.z + S.MUZZLE + d.z * 16, d };
  }

  weaponLogic(p, inp, dt, W, grounded) {
    if (p.spT > 0 && p.spKind === 'beam') return true;
    p.fireCd -= dt;
    switch (p.weapon) {
      case 'blaster':
      case 'bucket': {
        if (!inp.f) return false;
        if (p.fireCd <= 0 && p.tank >= W.cost) { p.fireCd = W.rate; p.tank -= W.cost; this.fireSpread(p, W); }
        return true;
      }
      case 'gatling': {
        if (!inp.f) { p.spin = Math.max(0, p.spin - dt * 1.5); return false; }
        p.spin = Math.min(W.spinTime, p.spin + dt);
        if (p.spin >= W.spinTime && p.fireCd <= 0 && p.tank >= W.cost) {
          p.fireCd = W.rate; p.tank -= W.cost;
          this.spawnProj(p, inp.a + (Math.random() - 0.5) * W.spread, inp.pt + (Math.random() - 0.5) * W.spread * 0.5, W.speed, W.range, W.dmg, W.splat, W.trail, W.size);
        }
        return true;
      }
      case 'charger': {
        if (inp.f && p.tank >= W.minCost) { p.charge = Math.min(1, p.charge + dt / W.chargeTime); return true; }
        if (p.charge > 0.08) this.fireCharger(p, p.charge, W);
        p.charge = 0;
        return false;
      }
      case 'roller': {
        if (!inp.f) { p.rolling = false; return false; }
        if (!p.prevFire && p.fireCd <= 0 && p.tank >= W.cost) {
          p.fireCd = W.rate; p.tank -= W.cost; p.flickT = this.time;
          this.fireSpread(p, W);
        }
        const spd = Math.hypot(p.vx, p.vy);
        p.rolling = grounded && this.time - p.flickT > 0.3 && spd > 40 && p.tank > 0;
        if (p.rolling) {
          p.tank = Math.max(0, p.tank - W.rollCost * dt);
          const dir = Math.atan2(p.vy, p.vx);
          const fx = p.x + Math.cos(dir) * 14, fy = p.y + Math.sin(dir) * 14;
          this.paint(fx, fy, p.z, W.rollWidth, p.team, p);
          this.contactDamage(p, fx, fy, W.rollWidth + S.R - 4, W.rollDmg, 0.5);
          this.pushBall(p, fx, fy, W.rollWidth, 320);
        }
        return true;
      }
    }
    return false;
  }

  fireSpread(p, W) {
    const n = W.pellets || 1, a = p.input.a, pt = p.input.pt;
    for (let i = 0; i < n; i++) {
      const off = n > 1 ? (i / (n - 1) - 0.5) * W.arc : 0;
      const k = n > 1 ? rand(0.85, 1.12) : 1;
      this.spawnProj(p, a + off + (Math.random() - 0.5) * W.spread, pt + (Math.random() - 0.5) * W.spread * 0.6 + (n > 1 ? rand(-0.04, 0.06) : 0),
        W.speed * k, W.range * k, W.dmg, W.splat, W.trail, W.size);
    }
  }

  spawnProj(p, yaw, pitch, speed, range, dmg, splat, trail, size) {
    const d = S.dir3(yaw, pitch);
    const x = p.x + d.x * 16, y = p.y + d.y * 16, z = p.z + S.MUZZLE + d.z * 16;
    if (S.insideAt(this.M, x, y, z)) { this.paint(p.x, p.y, p.z, splat * 0.7, p.team, p); return; }
    const pr = { id: this.nextId++, x0: x, y0: y, z0: z, x, y, z, vx: d.x * speed, vy: d.y * speed, vz: d.z * speed, ts: range / speed, t: 0, team: p.team, owner: p.id, dmg, splat, trail, size, acc: 0 };
    this.projs.push(pr);
    this.ev(['pj', pr.id, r1(x), r1(y), r1(z), r1(pr.vx), r1(pr.vy), r1(pr.vz), r2(pr.ts), p.team, size, p.id]);
  }

  // 3D 射线：每步回调 (x,y,z,t) 返回 true 则停止；返回终点
  trace(x, y, z, d, max, cb) {
    let t = 0;
    for (; t < max; t += 6) {
      const px = x + d.x * t, py = y + d.y * t, pz = z + d.z * t;
      if (S.insideAt(this.M, px, py, pz)) break;
      if (cb && cb(px, py, pz, t)) break;
    }
    return { x: x + d.x * t, y: y + d.y * t, z: z + d.z * t, t };
  }
  hitPlayerAt(team, x, y, z, pad) {
    for (const t of this.players.values()) {
      if (!t.alive || t.team === team) continue;
      if (Math.hypot(t.x - x, t.y - y) < S.R + pad && z > t.z - pad && z < t.z + S.PH + pad) return t;
    }
    return null;
  }

  fireCharger(p, ch, W) {
    const cost = W.minCost + (W.cost - W.minCost) * ch;
    p.tank = Math.max(0, p.tank - cost);
    const range = W.range * (0.35 + 0.65 * ch);
    const mz = this.muzzle(p);
    const dmg = ch >= 1 ? W.dmg : 30 + 90 * ch;
    const pr = 10 + 6 * ch;
    let victim = null, lastPaint = -99;
    const b = this.obj.ball && this.obj.resetT <= 0 ? this.obj.ball : null;
    const end = this.trace(mz.x, mz.y, mz.z, mz.d, range, (x, y, z, t) => {
      const gh = this.top(x, y);
      if (z - gh < 45 && t - lastPaint > 12) { lastPaint = t; this.paint(x, y, gh, pr, p.team, p); }
      victim = this.hitPlayerAt(p.team, x, y, z, 5);
      if (victim) return true;
      if (b && Math.hypot(b.x - x, b.y - y, b.r - z) < b.r + 4) { b.vx += mz.d.x * (250 + 450 * ch); b.vy += mz.d.y * (250 + 450 * ch); b.last = p.team; return true; }
      return false;
    });
    if (victim) this.hurt(victim, dmg, p);
    this.paint(end.x, end.y, this.top(end.x, end.y), 18 + 12 * ch, p.team, p);
    this.ev(['ln', r1(mz.x), r1(mz.y), r1(mz.z), r1(end.x), r1(end.y), r1(end.z), p.team, r2(ch), p.id]);
  }

  paint(x, y, z, r, team, owner) {
    const n = S.paintCircle(this.grid, this.M, x, y, z, r, team, (i) => this.diff.push(i * 4 + team));
    if (owner && n) this.credit(owner, n);
    return n;
  }
  credit(owner, n) {
    if (!this.players.has(owner.id)) return;
    owner.stats.paint += n;
    if (!(owner.spT > 0)) owner.sp = Math.min(S.WEAPONS[owner.weapon].spNeed, owner.sp + n * 0.28);
  }

  hurt(t, dmg, by) {
    if (!t.alive || t.invulnT > 0) return;
    if (t.spT > 0 && t.spKind === 'charge') return;
    if (t.shield > 0) {
      const a = Math.min(t.shield, dmg);
      t.shield -= a; dmg -= a;
      if (t.shield <= 0) t.shieldT = 0;
      if (dmg <= 0) { this.ev(['hit', t.id, by ? by.id : 0, 1]); return; }
    }
    if (this.obj.tr && this.obj.tr.carrier === t.id) dmg *= 0.75;
    t.hp -= dmg; t.lastHurt = this.time;
    this.ev(['hit', t.id, by ? by.id : 0, 0]);
    if (t.hp <= 0) this.kill(t, by);
  }

  kill(t, by) {
    t.alive = false; t.hp = 0; t.respawnT = S.RESPAWN; t.stats.deaths++;
    t.charge = 0; t.spin = 0; t.rolling = false; t.spT = 0; t.spKind = null; t.shield = 0; t.shieldT = 0;
    const team = by ? by.team : 3 - t.team;
    this.paint(t.x, t.y, this.top(t.x, t.y), 55, team, by && this.players.has(by.id) ? by : null);
    if (by && by !== t) by.stats.kills++;
    t.sp = Math.floor(t.sp * 0.5);
    this.dropItems(t);
    this.ev(['kill', by ? by.id : 0, t.id, r1(t.x), r1(t.y), r1(t.z)]);
  }

  respawn(p) {
    const sp = S.spawnPoint(p.team, p.slot);
    p.x = sp.x; p.y = sp.y; p.z = 0; p.vx = p.vy = p.vz = 0; p.onGround = true;
    p.hp = 100; p.tank = 100; p.alive = true; p.invulnT = 2.5;
    p.sync++; p.lastPosT = this.time;
    p.input.f = false;
    p.input.a = p.team === 1 ? 0 : Math.PI;
  }

  contactDamage(p, x, y, r, dmg, cd) {
    for (const t of this.players.values()) {
      if (!t.alive || t.team === p.team) continue;
      if (Math.hypot(t.x - x, t.y - y) > r || Math.abs(t.z - p.z) > 40) continue;
      if ((p.hitCd[t.id] || 0) > this.time) continue;
      p.hitCd[t.id] = this.time + cd;
      this.hurt(t, dmg, p);
    }
  }

  dropItems(p) {
    const o = this.obj;
    if (o.tr && o.tr.carrier === p.id) { o.tr.carrier = 0; o.tr.x = p.x; o.tr.y = p.y; o.tr.z = this.top(p.x, p.y); this.ev(['drop', p.id]); }
    if (o.bats && p.carry > 0) {
      for (let i = 0; i < p.carry; i++) {
        const a = rand(0, Math.PI * 2), r = rand(18, 55);
        let x = p.x + Math.cos(a) * r, y = p.y + Math.sin(a) * r;
        if (S.collideTest(this.M, x, y, p.z) || this.top(x, y) > p.z + 5) { x = p.x; y = p.y; }
        o.bats.push({ id: o.batId++, x, y, z: this.top(x, y) });
      }
      p.carry = 0;
    }
  }

  throwBomb(p) {
    p.tank -= S.SUB_COST;
    const mz = this.muzzle(p);
    const v = S.bombVel(p.input.a, p.input.pt);
    const b = { id: this.nextId++, x: mz.x, y: mz.y, z: mz.z, vx: v.vx, vy: v.vy, vz: v.vz, landed: false, fuse: 0.55, life: 0, team: p.team, owner: p.id };
    if (S.insideAt(this.M, b.x, b.y, b.z)) { b.x = p.x; b.y = p.y; b.z = p.z + S.MUZZLE; }
    this.bombs.push(b);
    this.ev(['bm', b.id, r1(b.x), r1(b.y), r1(b.z), r1(b.vx), r1(b.vy), r1(b.vz), b.team, p.id]);
  }
  updateBombs(dt) {
    this.bombs = this.bombs.filter((b) => {
      S.stepBomb(b, dt, this.M);
      b.life += dt;
      if (b.landed) b.fuse -= dt;
      if (b.fuse > 0 && b.life < 4) return true;
      this.explode(b.x, b.y, b.z, 72, 180, 30, b.team, this.players.get(b.owner));
      this.ev(['bx', r1(b.x), r1(b.y), r1(b.z), b.team, 72, b.id]);
      return false;
    });
  }
  updateMissiles(dt) {
    this.missiles = this.missiles.filter((m) => {
      m.t -= dt;
      if (m.t > 0) return true;
      this.explode(m.x, m.y, m.z, 80, 140, 50, m.team, this.players.get(m.owner));
      this.ev(['bx', r1(m.x), r1(m.y), r1(m.z), m.team, 80, 0]);
      return false;
    });
  }
  explode(x, y, z, r, maxD, minD, team, owner) {
    this.paint(x, y, z, r, team, owner);
    for (const t of this.players.values()) {
      if (!t.alive || t.team === team) continue;
      const d = Math.hypot(t.x - x, t.y - y, t.z + 18 - z - 10);
      if (d < r + S.R && S.los3(this.M, x, y, z + 10, t.x, t.y, t.z + 18)) this.hurt(t, minD + (maxD - minD) * Math.max(0, 1 - d / (r + S.R)), owner);
    }
    const b = this.obj.ball;
    if (b && this.obj.resetT <= 0) {
      const d = Math.hypot(b.x - x, b.y - y);
      if (d < r + b.r && d > 0.1 && Math.abs(z) < 60) {
        const k = 1 - d / (r + b.r);
        b.vx += ((b.x - x) / d) * 700 * k; b.vy += ((b.y - y) / d) * 700 * k; b.last = team;
      }
    }
  }
  pushBall(p, x, y, r, power) {
    const b = this.obj.ball;
    if (!b || this.obj.resetT > 0 || p.z > 30) return;
    const d = Math.hypot(b.x - x, b.y - y);
    if (d < r + b.r && d > 0.1) {
      b.vx += ((b.x - x) / d) * power * 0.25; b.vy += ((b.y - y) / d) * power * 0.25; b.last = p.team;
    }
  }

  // ------------------------------------------------------------------
  activateSpecial(p) {
    const W = S.WEAPONS[p.weapon];
    p.sp = 0; p.spKind = W.special;
    this.ev(['sp', p.id, p.spKind]);
    switch (p.spKind) {
      case 'storm': p.spT = 0.8; p.spWave = 0; break;
      case 'charge': p.spT = 4; break;
      case 'beam': p.spT = 2.6; break;
      case 'missiles': {
        p.spT = 0.3;
        const targets = [];
        for (const e of this.players.values()) if (e.alive && e.team !== p.team) targets.push({ x: e.x, y: e.y });
        let guard = 0;
        while (targets.length < 4 && guard++ < 50) {
          const x = p.team === 1 ? rand(S.W / 2, S.W - 120) : rand(120, S.W / 2), y = rand(80, S.H - 80);
          if (!this.M.solid[Math.floor(y / S.CELL) * S.GW + Math.floor(x / S.CELL)]) targets.push({ x, y });
        }
        for (const t of targets) {
          const z = this.top(t.x, t.y);
          this.missiles.push({ x: t.x, y: t.y, z, t: 1.5, team: p.team, owner: p.id });
          this.ev(['ms', r1(t.x), r1(t.y), r1(z), p.team]);
        }
        break;
      }
      case 'bubble': {
        p.spT = 0.3;
        for (const a of this.players.values()) {
          if (!a.alive || a.team !== p.team || dist(a, p) > 170) continue;
          a.shield = Math.max(a.shield, a === p ? 130 : 80); a.shieldT = 7;
        }
        break;
      }
    }
  }
  updateSpecial(p, dt) {
    p.spT -= dt;
    switch (p.spKind) {
      case 'storm': {
        const elapsed = 0.8 - p.spT;
        while (p.spWave < 3 && elapsed >= p.spWave * 0.35) {
          for (let i = 0; i < 18; i++) this.spawnProj(p, (i / 18) * Math.PI * 2 + p.spWave * 0.17, 0.12, 500, 280, 45, 24, 12, 8);
          this.paint(p.x, p.y, p.z, 70 + p.spWave * 15, p.team, p);
          p.spWave++;
        }
        break;
      }
      case 'charge':
        this.paint(p.x, p.y, p.z, 42, p.team, p);
        this.contactDamage(p, p.x, p.y, S.R + 30, 200, 0.3);
        this.pushBall(p, p.x, p.y, S.R + 10, 900);
        break;
      case 'beam': {
        const mz = this.muzzle(p);
        let lastPaint = -99;
        const hitOnce = new Set();
        const b = this.obj.ball && this.obj.resetT <= 0 ? this.obj.ball : null;
        const end = this.trace(mz.x, mz.y, mz.z, mz.d, 950, (x, y, z, t) => {
          const gh = this.top(x, y);
          if (z - gh < 70 && t - lastPaint > 14) { lastPaint = t; this.paint(x, y, gh, 20, p.team, p); }
          const v = this.hitPlayerAt(p.team, x, y, z, 16);
          if (v && !hitOnce.has(v.id)) { hitOnce.add(v.id); this.hurt(v, 230 * dt, p); }
          if (b && Math.hypot(b.x - x, b.y - y, b.r - z) < b.r + 16) { b.vx += mz.d.x * 900 * dt; b.vy += mz.d.y * 900 * dt; b.last = p.team; }
          return false;
        });
        this.paint(end.x, end.y, this.top(end.x, end.y), 24, p.team, p);
        break;
      }
    }
    if (p.spT <= 0) { p.spT = 0; p.spKind = null; }
  }

  // ------------------------------------------------------------------
  updateProjs(dt) {
    const out = [];
    const ball = this.obj.ball && this.obj.resetT <= 0 ? this.obj.ball : null;
    for (const pr of this.projs) {
      const owner = this.players.get(pr.owner) || null;
      let dead = false;
      const speed = Math.hypot(pr.vx, pr.vy, pr.vz) + (pr.t > pr.ts ? S.PROJ_G * (pr.t - pr.ts) : 0);
      const steps = Math.max(1, Math.ceil((speed * dt) / 8));
      const sdt = dt / steps;
      for (let s = 0; s < steps && !dead; s++) {
        pr.t += sdt;
        const np = S.projPos(pr, pr.t);
        const gh = this.top(np.x, np.y);
        if (np.z <= gh) {
          if (gh > pr.z + 2) {
            // 侧面撞墙：涂在墙脚
            this.paint(pr.x, pr.y, this.top(pr.x, pr.y), pr.splat * 0.8, pr.team, owner);
          } else {
            this.paint(np.x, np.y, gh, pr.splat, pr.team, owner);
            pr.x = np.x; pr.y = np.y; pr.z = gh;
          }
          dead = true; break;
        }
        const segLen = Math.hypot(np.x - pr.x, np.y - pr.y);
        pr.x = np.x; pr.y = np.y; pr.z = np.z; pr.acc += segLen;
        if (pr.trail && pr.acc >= 26) {
          pr.acc = 0;
          if (pr.z - gh < 55) this.paint(pr.x, pr.y, gh, pr.trail, pr.team, owner);
        }
        const victim = this.hitPlayerAt(pr.team, pr.x, pr.y, pr.z, pr.size);
        if (victim) {
          this.hurt(victim, pr.dmg, owner);
          this.paint(pr.x, pr.y, victim.z, pr.splat * 0.6, pr.team, owner);
          dead = true; break;
        }
        if (ball && Math.hypot(ball.x - pr.x, ball.y - pr.y, ball.r - pr.z) < ball.r + pr.size) {
          const hs = Math.hypot(pr.vx, pr.vy) || 1;
          ball.vx += (pr.vx / hs) * pr.dmg * 7; ball.vy += (pr.vy / hs) * pr.dmg * 7; ball.last = pr.team;
          this.paint(pr.x, pr.y, 0, pr.splat * 0.5, pr.team, owner);
          dead = true;
        }
      }
      if (!dead && pr.t > 3) dead = true;
      if (dead) this.ev(['px', pr.id, r1(pr.x), r1(pr.y), r1(pr.z)]);
      else out.push(pr);
    }
    this.projs = out;
  }

  // ------------------------------------------------------------------
  initMode() {
    const o = (this.obj = { score: [0, 0, 0], resetT: 0 });
    switch (this.mode) {
      case 'zone': o.owner = 0; o.count = [0, 100, 100]; o.share = [0, 0, 0]; break;
      case 'escort': o.tr = { x: S.W / 2, y: S.H / 2, z: this.top(S.W / 2, S.H / 2), carrier: 0, resetT: 0 }; break;
      case 'soccer': o.ball = { x: S.W / 2, y: S.H / 2, vx: 0, vy: 0, r: 26, last: 0, acc: 0 }; break;
      case 'battery': o.bats = []; o.batT = 2; o.batId = 1; break;
    }
  }

  updateMode(dt) {
    const o = this.obj;
    switch (this.mode) {
      case 'zone': {
        let a = 0, b = 0;
        for (const i of this.zoneCells) { if (this.grid[i] === 1) a++; else if (this.grid[i] === 2) b++; }
        const n = this.zoneCells.length;
        o.share = [0, a / n, b / n];
        if (o.owner !== 1 && a / n >= 0.7) { o.owner = 1; this.ev(['zn', 1]); }
        else if (o.owner !== 2 && b / n >= 0.7) { o.owner = 2; this.ev(['zn', 2]); }
        else if (o.owner && o.share[o.owner] < 0.4) { o.owner = 0; this.ev(['zn', 0]); }
        if (o.owner) {
          o.count[o.owner] -= dt;
          if (o.count[o.owner] <= 0) { o.count[o.owner] = 0; this.finish(o.owner); }
        }
        break;
      }
      case 'escort': {
        const tr = o.tr;
        if (tr.resetT > 0) {
          tr.resetT -= dt;
          if (tr.resetT <= 0) { tr.x = S.W / 2; tr.y = S.H / 2; tr.z = this.top(tr.x, tr.y); this.ev(['trr']); }
          break;
        }
        if (tr.carrier) {
          const c = this.players.get(tr.carrier);
          if (!c || !c.alive) { tr.carrier = 0; break; }
          tr.x = c.x; tr.y = c.y; tr.z = c.z;
          const g = S.goalFor(c.team, this.mapIdx);
          if (dist(c, g) < 52 && c.z < 20) {
            o.score[c.team]++; c.stats.obj++;
            this.ev(['goal', c.team, c.id]);
            this.paint(g.x, g.y, 0, 110, c.team, c);
            tr.carrier = 0; tr.resetT = 3;
            if (o.score[c.team] >= S.ESCORT_TARGET) this.finish(c.team);
          }
        } else {
          for (const p of this.players.values()) {
            if (p.alive && dist(p, tr) < 30 && Math.abs(p.z - tr.z) < 30) { tr.carrier = p.id; this.ev(['grab', p.id]); break; }
          }
        }
        break;
      }
      case 'soccer': {
        const b = o.ball;
        if (o.resetT > 0) { o.resetT -= dt; break; }
        for (const p of this.players.values()) {
          if (!p.alive || p.z > b.r * 2) continue;
          const dx = b.x - p.x, dy = b.y - p.y, d = Math.hypot(dx, dy), min = b.r + S.R;
          if (d < min && d > 0.01) {
            const nx = dx / d, ny = dy / d;
            const tx = p.x + nx * min, ty = p.y + ny * min;
            if (!this.ballHitsWall(tx, ty, b.r)) { b.x = tx; b.y = ty; }
            const rel = (p.vx - b.vx) * nx + (p.vy - b.vy) * ny;
            if (rel > 0) { b.vx += nx * rel * 1.2; b.vy += ny * rel * 1.2; }
            b.last = p.team;
          }
        }
        let sp = Math.hypot(b.vx, b.vy);
        if (sp > 950) { b.vx *= 950 / sp; b.vy *= 950 / sp; sp = 950; }
        const steps = Math.max(1, Math.ceil((sp * dt) / 8)), sdt = dt / steps;
        for (let i = 0; i < steps; i++) {
          const nx = b.x + b.vx * sdt;
          if (this.ballHitsWall(nx, b.y, b.r)) b.vx *= -0.75; else b.x = nx;
          const ny = b.y + b.vy * sdt;
          if (this.ballHitsWall(b.x, ny, b.r)) b.vy *= -0.75; else b.y = ny;
        }
        const f = Math.exp(-0.9 * dt);
        b.vx *= f; b.vy *= f;
        b.acc += sp * dt;
        if (b.last && sp > 60 && b.acc > 20) { b.acc = 0; this.paint(b.x, b.y, 0, 20, b.last, null); }
        const g = S.SOCCER_GOAL;
        if (Math.abs(b.y - S.H / 2) < g.half) {
          if (b.x < g.depth) this.soccerGoal(2);
          else if (b.x > S.W - g.depth) this.soccerGoal(1);
        }
        break;
      }
      case 'battery': {
        o.batT -= dt;
        if (o.batT <= 0 && o.bats.length < 12) {
          o.batT = 1.4;
          for (let k = 0; k < 20; k++) {
            const x = (randInt(S.GW) + 0.5) * S.CELL, y = (randInt(S.GH) + 0.5) * S.CELL;
            const z = this.top(x, y);
            if (z > 80 || S.collideTest(this.M, x, y, z)) continue;
            if (dist({ x, y }, S.basePos(1)) < 260 || dist({ x, y }, S.basePos(2)) < 260) continue;
            o.bats.push({ id: o.batId++, x, y, z });
            break;
          }
        }
        for (const p of this.players.values()) {
          if (!p.alive) continue;
          if (p.carry < 5) {
            for (let i = o.bats.length - 1; i >= 0; i--) {
              const bt = o.bats[i];
              if (Math.hypot(bt.x - p.x, bt.y - p.y) < 28 && Math.abs(bt.z - p.z) < 30) {
                p.carry++; o.bats.splice(i, 1); this.ev(['bp', p.id]);
                if (p.carry >= 5) break;
              }
            }
          }
          if (p.carry > 0 && dist(p, S.basePos(p.team)) < 120) {
            o.score[p.team] += p.carry; p.stats.obj += p.carry;
            this.ev(['dep', p.id, p.carry]);
            p.carry = 0;
            if (o.score[p.team] >= S.BATTERY_TARGET) { this.finish(p.team); return; }
          }
        }
        break;
      }
    }
  }
  ballHitsWall(x, y, r) {
    if (this.top(x, y) > 0) return true;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      if (this.top(x + Math.cos(a) * r, y + Math.sin(a) * r) > 0) return true;
    }
    return false;
  }
  soccerGoal(team) {
    const o = this.obj, b = o.ball;
    o.score[team]++;
    this.ev(['goal', team, 0]);
    this.paint(b.x, b.y, 0, 110, team, null);
    b.x = S.W / 2; b.y = S.H / 2; b.vx = b.vy = 0; b.last = 0;
    o.resetT = 2;
    if (o.score[team] >= S.SOCCER_TARGET) this.finish(team);
  }

  objState() {
    const o = this.obj;
    switch (this.mode) {
      case 'zone': return [o.owner, Math.ceil(o.count[1]), Math.ceil(o.count[2]), Math.round(o.share[1] * 100), Math.round(o.share[2] * 100)];
      case 'escort': return [r1(o.tr.x), r1(o.tr.y), o.tr.carrier, o.score[1], o.score[2], o.tr.resetT > 0 ? 1 : 0, r1(o.tr.z)];
      case 'soccer': return [r1(o.ball.x), r1(o.ball.y), o.score[1], o.score[2], o.ball.last, o.resetT > 0 ? 1 : 0];
      case 'battery': {
        const flat = [];
        for (const b of o.bats) flat.push(b.id, r1(b.x), r1(b.y), r1(b.z));
        return [o.score[1], o.score[2], flat];
      }
    }
    return null;
  }

  sendSnapshot() {
    const pl = [];
    for (const p of this.players.values()) {
      const W = S.WEAPONS[p.weapon];
      let flags = 0;
      if (p.alive) flags |= 1;
      if (p.wheel) flags |= 2;
      if (p.hidden) flags |= 4;
      if (p.invulnT > 0) flags |= 8;
      if (p.firing) flags |= 16;
      if (p.rolling) flags |= 32;
      if (this.obj.tr && this.obj.tr.carrier === p.id) flags |= 64;
      if (p.spT > 0) flags |= 128;
      if (p.sp >= W.spNeed) flags |= 256;
      const ch = p.weapon === 'charger' ? p.charge : p.weapon === 'gatling' ? p.spin / W.spinTime : 0;
      pl.push([p.id, r1(p.x), r1(p.y), r2(p.input.a), Math.ceil(p.hp), r1(p.tank), r1(p.sp), flags,
        Math.ceil(p.respawnT * 10), p.carry, Math.round(p.sm * 100), Math.round(ch * 100), r1(p.shield), p.sync,
        r1(p.vx), r1(p.vy), S.SPECIAL_IDS.indexOf(p.spKind), r1(p.z), r2(p.input.pt)]);
    }
    const msg = { t: 's', k: this.tick, tl: Math.max(0, Math.round(this.timeLeft * 10) / 10), cd: Math.max(0, Math.round(this.countdown * 10) / 10), p: pl, d: this.diff, e: this.events, o: this.objState() };
    if (this.tick % 15 === 0) msg.sb = [...this.players.values()].map((p) => [p.id, p.stats.kills, p.stats.deaths, p.stats.paint, p.stats.obj]);
    this.room.broadcast(msg, true);
    this.diff = []; this.events = [];
  }

  finish(winner) {
    if (this.over) return;
    this.over = true;
    if (this.interval) clearInterval(this.interval);
    const turf = S.countTurf(this.grid, this.M);
    const pa = turf.a / turf.tot, pb = turf.b / turf.tot;
    const byTurf = turf.a > turf.b ? 1 : turf.b > turf.a ? 2 : 0;
    const o = this.obj;
    let reason = 'ko';
    if (winner == null) {
      reason = 'time';
      if (this.mode === 'turf') winner = byTurf;
      else if (this.mode === 'zone') winner = o.count[1] < o.count[2] ? 1 : o.count[2] < o.count[1] ? 2 : byTurf;
      else winner = o.score[1] > o.score[2] ? 1 : o.score[2] > o.score[1] ? 2 : byTurf;
      if (this.mode !== 'turf' && ((this.mode === 'zone' && o.count[1] === o.count[2]) || (this.mode !== 'zone' && o.score[1] === o.score[2]))) reason = 'turf';
    }
    const result = {
      mode: this.mode, map: this.mapIdx, winner, reason, turf: [pa, pb], score: o.score.slice(),
      count: o.count ? o.count.map((c) => Math.ceil(c)) : null, colorSet: this.colorSet,
      players: [...this.players.values()].map((p) => ({ id: p.id, name: p.name, team: p.team, weapon: p.weapon, head: p.head, bot: p.bot, ...p.stats })),
    };
    this.result = result;
    if (this.room.manual) return;
    this.sendSnapshot();
    this.room.broadcast({ t: 'over', winner });
    setTimeout(() => { if (this.room.game === this) this.room.onGameEnd(result); }, 3000);
  }

  stop() { this.over = true; if (this.interval) clearInterval(this.interval); }
}

// =====================================================================
// AI 机器人
// =====================================================================
function aimAt(p, tx, ty, tz) {
  const d = Math.hypot(tx - p.x, ty - p.y);
  return { a: Math.atan2(ty - p.y, tx - p.x), pt: Math.atan2(tz - (p.z + S.MUZZLE), d) + d * 0.00011, d };
}
function botThink(g, p, dt) {
  const inp = p.input;
  if (!p.alive) { inp.f = false; inp.w = false; p.ai = null; return; }
  const ai = p.ai || (p.ai = { goal: null, path: [], pi: 0, replan: 0, nextSub: g.time + rand(2, 6), stuckT: 0, lastX: p.x, lastY: p.y, wob: rand(0, 6), strafe: 1, strafeT: 0, jumpT: rand(1, 4) });
  const W = S.WEAPONS[p.weapon];
  const range = S.weaponRange(p.weapon);
  ai.replan -= dt;

  let enemy = null, ed = Infinity;
  for (const e of g.players.values()) {
    if (!e.alive || e.team === p.team) continue;
    const d = Math.hypot(e.x - p.x, e.y - p.y, e.z - p.z);
    if (e.hidden && d > 110) continue;
    if (d < range + 160 && d < ed && S.los3(g.M, p.x, p.y, p.z + S.MUZZLE, e.x, e.y, e.z + 18)) { enemy = e; ed = d; }
  }

  ai.stuckT += dt;
  if (ai.stuckT > 1.2) {
    if (Math.hypot(p.x - ai.lastX, p.y - ai.lastY) < 12 && ai.goal && dist(p, ai.goal) > 40) { ai.replan = 0; ai.forceRandom = true; }
    ai.stuckT = 0; ai.lastX = p.x; ai.lastY = p.y;
  }

  if (ai.replan <= 0 || !ai.goal) {
    ai.replan = rand(0.5, 0.9);
    ai.goal = ai.forceRandom ? randomGoal(g, p) : chooseGoal(g, p);
    ai.forceRandom = false;
    ai.path = findPath(g.nav, p.x, p.y, ai.goal.x, ai.goal.y);
    ai.pi = 0;
  }

  let tx = ai.goal.x, ty = ai.goal.y;
  if (ai.path.length) {
    while (ai.pi < ai.path.length && dist(p, ai.path[ai.pi]) < 20) ai.pi++;
    if (ai.pi + 1 < ai.path.length && floorLos(g.M, p.x, p.y, ai.path[ai.pi + 1].x, ai.path[ai.pi + 1].y)) ai.pi++;
    if (ai.pi < ai.path.length) { tx = ai.path[ai.pi].x; ty = ai.path[ai.pi].y; }
  }
  let mx = tx - p.x, my = ty - p.y;
  const dl = Math.hypot(mx, my);
  if (dl > 8) { mx /= dl; my /= dl; } else { mx = 0; my = 0; }

  const gh = S.topAt(g.M, p.x, p.y);
  const onOwn = p.z <= gh + 1 && S.cellAt(g.grid, p.x, p.y) === p.team;
  let wantFire = false;
  let aim = { a: mx || my ? Math.atan2(my, mx) : inp.a, pt: -0.12 };

  if (enemy && ed < range * 1.05) {
    const lead = ed / 650;
    aim = aimAt(p, enemy.x + enemy.vx * lead * 0.6, enemy.y + enemy.vy * lead * 0.6, enemy.z + 16);
    aim.a += (Math.random() - 0.5) * 0.2; aim.pt += (Math.random() - 0.5) * 0.08;
    wantFire = true;
    ai.strafeT -= dt;
    if (ai.strafeT <= 0) { ai.strafeT = rand(0.4, 1.1); ai.strafe = Math.random() < 0.5 ? -1 : 1; }
    const ea = Math.atan2(enemy.y - p.y, enemy.x - p.x);
    if (p.weapon === 'roller' || p.weapon === 'bucket') { mx = Math.cos(ea); my = Math.sin(ea); }
    else if (p.weapon === 'charger') { mx = Math.cos(ea + Math.PI / 2) * ai.strafe * 0.5; my = Math.sin(ea + Math.PI / 2) * ai.strafe * 0.5; }
    else {
      const back = ed < range * 0.5 ? -0.5 : 0.3;
      mx = Math.cos(ea) * back + Math.cos(ea + Math.PI / 2) * ai.strafe * 0.8;
      my = Math.sin(ea) * back + Math.sin(ea + Math.PI / 2) * ai.strafe * 0.8;
    }
    if (g.mode === 'escort' && g.obj.tr.carrier === p.id) { const a2 = Math.atan2(ty - p.y, tx - p.x); mx = Math.cos(a2); my = Math.sin(a2); }
    ai.jumpT -= dt;
    if (ai.jumpT <= 0) { ai.jumpT = rand(1.2, 3.5); inp.j = true; }
  } else {
    ai.wob += dt * 2.2;
    aim.a += Math.sin(ai.wob) * 0.5;
    aim.pt = -0.1 + Math.sin(ai.wob * 0.7) * 0.08;
    wantFire = p.tank > 22 || (p.weapon === 'roller' && p.tank > 6);
    if (g.mode === 'soccer' && g.obj.resetT <= 0) {
      const b = g.obj.ball, bd = dist(p, b);
      const gx = p.team === 1 ? S.W : 0;
      const toGoal = Math.atan2(S.H / 2 - b.y, gx - b.x), toBall = Math.atan2(b.y - p.y, b.x - p.x);
      let diff = Math.abs(toGoal - toBall); if (diff > Math.PI) diff = Math.PI * 2 - diff;
      if (bd < 380 && diff < 0.9 && S.los3(g.M, p.x, p.y, p.z + S.MUZZLE, b.x, b.y, b.r)) { aim = aimAt(p, b.x, b.y, b.r); wantFire = p.tank > 3; }
    }
  }

  let wheel = false;
  if (!wantFire || !enemy) {
    if (onOwn && (p.tank < 25 || (!enemy && dl > 260 && p.tank < 85))) { wheel = true; wantFire = false; }
  }
  if (p.weapon === 'charger') {
    if (wantFire) inp.f = p.charge < (enemy ? 0.92 : 0.45);
    else inp.f = false;
  } else inp.f = wantFire;
  if (p.carry >= 3 && onOwn && !enemy) { wheel = true; inp.f = false; }

  inp.w = wheel;
  inp.mx = mx; inp.my = my; inp.a = aim.a; inp.pt = clamp(aim.pt, -1.2, 1.2);

  if (enemy && ed < 270 && ed > 90 && p.tank > 75 && g.time > ai.nextSub) {
    inp.sq++;
    const a2 = aimAt(p, enemy.x, enemy.y, enemy.z);
    inp.a = a2.a; inp.pt = clamp(-0.42 + (ed - 90) / 600, -0.4, 0.3);
    ai.nextSub = g.time + rand(4, 9);
  }
  if (p.sp >= W.spNeed && p.spT <= 0) {
    const use = W.special === 'missiles' || (enemy && ed < (W.special === 'beam' ? 700 : 300)) || Math.random() < 0.003;
    if (use) { inp.qq++; if (enemy) { const a2 = aimAt(p, enemy.x, enemy.y, enemy.z + 16); inp.a = a2.a; inp.pt = a2.pt; } }
  }
}

function randomGoal(g, p) {
  for (let k = 0; k < 30; k++) {
    const x = (randInt(S.GW) + 0.5) * S.CELL, y = (randInt(S.GH) + 0.5) * S.CELL;
    if (S.topAt(g.M, x, y) === 0 && Math.hypot(x - p.x, y - p.y) < 500) return { x, y };
  }
  return { x: S.W / 2, y: S.H / 2 };
}

function chooseGoal(g, p) {
  const o = g.obj;
  switch (g.mode) {
    case 'zone':
      if (Math.random() < 0.75) return { x: rand(S.ZONE.x0 + 1, S.ZONE.x1 - 1) * S.CELL, y: rand(S.ZONE.y0 + 1, S.ZONE.y1 - 1) * S.CELL };
      break;
    case 'escort': {
      const tr = o.tr;
      if (tr.resetT > 0) return { x: S.W / 2 + rand(-120, 120), y: S.H / 2 + rand(-120, 120) };
      if (tr.carrier === p.id) return S.goalFor(p.team, g.mapIdx);
      if (tr.carrier) {
        const c = g.players.get(tr.carrier);
        if (c && c.team === p.team) { const gl = S.goalFor(p.team, g.mapIdx); return { x: c.x + (gl.x - c.x) * 0.35 + rand(-60, 60), y: c.y + (gl.y - c.y) * 0.35 + rand(-60, 60) }; }
        if (c) return { x: c.x, y: c.y };
      }
      return { x: tr.x, y: tr.y };
    }
    case 'soccer': {
      const b = o.ball;
      const gx = p.team === 1 ? S.W : 0;
      let dx = gx - b.x, dy = S.H / 2 - b.y;
      const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
      const ownGoalX = p.team === 1 ? 0 : S.W;
      if (p.slot === 3 && Math.abs(b.x - ownGoalX) < S.W * 0.45) return { x: ownGoalX + (p.team === 1 ? 120 : -120), y: clamp(b.y, S.H / 2 - 120, S.H / 2 + 120) };
      return { x: b.x - dx * 90 + rand(-30, 30), y: b.y - dy * 90 + rand(-30, 30) };
    }
    case 'battery': {
      if (p.carry >= 3 || (p.carry > 0 && o.bats.length === 0)) return S.basePos(p.team);
      let best = null, bd = Infinity;
      for (const b of o.bats) { if (b.z > 0) continue; const d = dist(b, p) + rand(0, 120); if (d < bd) { bd = d; best = b; } }
      if (best) return { x: best.x, y: best.y };
      break;
    }
  }
  let best = null, bs = -Infinity;
  for (let k = 0; k < 24; k++) {
    const cx = randInt(S.GW), cy = randInt(S.GH), i = cy * S.GW + cx;
    if (g.M.top[i] > 0) continue;
    const x = (cx + 0.5) * S.CELL, y = (cy + 0.5) * S.CELL;
    const v = g.grid[i];
    const score = (v === p.team ? -400 : v === 0 ? 0 : 140) - Math.hypot(x - p.x, y - p.y) * 0.5 + rand(0, 120);
    if (score > bs) { bs = score; best = { x, y }; }
  }
  return best || { x: S.W / 2, y: S.H / 2 };
}

// =====================================================================
// 房间
// =====================================================================
function genCode(rooms) {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  for (;;) {
    let c = '';
    for (let i = 0; i < 4; i++) c += A[randInt(A.length)];
    if (!rooms.has(c)) return c;
  }
}

class Room {
  constructor(code, host, opts = {}) {
    this.code = code; this.hostId = host ? host.id : 0;
    this.members = new Map();
    this.settings = { mode: 'turf', map: -1, duration: 180, teamSize: 4, bots: true };
    this.state = 'lobby'; this.game = null;
    this.colorSet = randInt(S.COLOR_SETS.length);
    this.manual = !!opts.manual;
    this.hub = opts.hub || null;
  }
  teamCount(t) { let n = 0; for (const c of this.members.values()) if (c.team === t) n++; return n; }
  add(c) {
    c.room = this;
    c.team = this.teamCount(1) <= this.teamCount(2) ? 1 : 2;
    this.members.set(c.id, c);
    c.conn.send({ t: 'joined', code: this.code });
    this.broadcastLobby();
  }
  remove(c) {
    this.members.delete(c.id);
    c.room = null;
    if (this.game) {
      this.game.removePlayer(c.id);
      if (this.game.humanCount() === 0) { this.game.stop(); this.game = null; this.state = 'lobby'; }
    }
    if (this.members.size === 0) { if (this.game) this.game.stop(); if (this.hub) this.hub.rooms.delete(this.code); return; }
    if (this.hostId === c.id) this.hostId = this.members.keys().next().value;
    this.broadcastLobby();
  }
  lobbyInfo() {
    return {
      code: this.code, hostId: this.hostId, state: this.state, settings: this.settings, colorSet: this.colorSet,
      players: [...this.members.values()].map((c) => ({ id: c.id, name: c.name, team: c.team, weapon: c.weapon, head: c.head, level: c.level })),
    };
  }
  broadcastLobby() { this.broadcast({ t: 'lobby', room: this.lobbyInfo() }); }
  broadcast(msg, droppable) {
    if (this.manual) return;
    const str = JSON.stringify(msg);
    for (const c of this.members.values()) {
      if (droppable && c.conn.congested) continue;
      c.conn.sendRaw(str);
    }
  }
  applySettings(m) {
    const s = this.settings;
    if (m.mode in S.MODES) s.mode = m.mode;
    if (Number.isInteger(m.map) && m.map >= -1 && m.map < S.MAPS.length) s.map = m.map;
    if ([120, 180, 240, 300].includes(m.duration)) s.duration = m.duration;
    if (Number.isInteger(m.teamSize) && m.teamSize >= 1 && m.teamSize <= 4) s.teamSize = m.teamSize;
    if (typeof m.bots === 'boolean') s.bots = m.bots;
    this.broadcastLobby();
  }
  start() {
    this.state = 'playing';
    this.game = new Game(this);
    this.broadcastLobby();
  }
  onGameEnd(result) {
    this.state = 'lobby'; this.game = null;
    this.broadcast({ t: 'end', result });
    this.colorSet = (this.colorSet + 1 + randInt(S.COLOR_SETS.length - 1)) % S.COLOR_SETS.length;
    this.broadcastLobby();
  }
}

function sanitizeName(n) {
  n = String(n || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 12);
  return n || '机兵' + randInt(1000);
}
function setProfile(c, m) {
  if (m.name !== undefined) c.name = sanitizeName(m.name);
  if (m.weapon in S.WEAPONS) c.weapon = m.weapon;
  if (S.HEADS.some((h) => h.id === m.head)) c.head = m.head;
  if (Number.isInteger(m.level)) c.level = clamp(m.level, 1, 999);
}

function handle(hub, c, m) {
  if (!m || typeof m.t !== 'string') return;
  const r = c.room;
  switch (m.t) {
    case 'hello': setProfile(c, m); break;
    case 'create': {
      if (r) r.remove(c);
      const room = new Room(genCode(hub.rooms), c, { hub });
      hub.rooms.set(room.code, room);
      room.add(c);
      break;
    }
    case 'join': {
      const code = String(m.code || '').toUpperCase().trim();
      const room = hub.rooms.get(code);
      if (!room) return c.conn.send({ t: 'err', msg: `找不到房间 ${code}` });
      if (room === r) return;
      if (room.members.size >= S.MAX_PER_TEAM * 2) return c.conn.send({ t: 'err', msg: '房间已满（最多 8 人）' });
      if (r) r.remove(c);
      room.add(c);
      break;
    }
    case 'leave': if (r) r.remove(c); c.conn.send({ t: 'left' }); break;
    case 'team': {
      if (!r || r.state !== 'lobby') return;
      const t = m.team === 2 ? 2 : 1;
      if (t !== c.team && r.teamCount(t) >= S.MAX_PER_TEAM) return c.conn.send({ t: 'err', msg: '该队伍已满' });
      c.team = t; r.broadcastLobby();
      break;
    }
    case 'loadout': setProfile(c, m); if (r) r.broadcastLobby(); break;
    case 'settings': if (r && r.hostId === c.id && r.state === 'lobby') r.applySettings(m); break;
    case 'start': if (r && r.hostId === c.id && r.state === 'lobby') r.start(); break;
    case 'in': if (r && r.game) r.game.input(c.id, m); break;
    case 'chat': {
      if (!r) return;
      const now = Date.now();
      if (now - (c.lastChat || 0) < 800) return;
      c.lastChat = now;
      const k = m.k | 0;
      if (k >= 0 && k < S.QUICK_CHAT.length) r.broadcast({ t: 'qc', id: c.id, k });
      break;
    }
    case 'ping': c.conn.send({ t: 'pong', ts: m.ts }); break;
  }
}


// =====================================================================
// Hub：一个"服务器"（Node 服务器、或房主浏览器里的内置服务器）
// conn 需要实现 send(obj) / sendRaw(str) / congested
// =====================================================================
class Hub {
  constructor() { this.clients = new Map(); this.rooms = new Map(); this.nextId = 1; }
  connect(conn) {
    const c = { id: this.nextId++, conn, name: '机兵', weapon: 'blaster', head: 'antenna', level: 1, room: null, team: 1 };
    this.clients.set(c.id, c);
    conn.send({ t: 'welcome', id: c.id });
    return c;
  }
  message(c, m) { if (this.clients.has(c.id)) handle(this, c, m); }
  disconnect(c) {
    if (!this.clients.delete(c.id)) return;
    if (c.room) c.room.remove(c);
  }
}

return { Game, Room, Hub, findPath, buildNav };
});
