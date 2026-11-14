// 涂鸦机兵 GraffiBots — 对局核心（Node 服务器与浏览器内置服务器共用）
// 包含：对局模拟 Game、AI 机兵、房间 Room、消息处理 Hub
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./shared.js'), require('./economy.js'));
  else root.GBCore = factory(root.GS, root.GE);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (S, E) {
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
// 导航格：每 2×2 格一个节点，记录高度；墙、弹跳板、内部高差太大的格子不能走
function buildNav(M) {
  const nav = new Uint8Array(NW * NH), navH = new Float32Array(NW * NH);
  for (let y = 0; y < NH; y++)
    for (let x = 0; x < NW; x++) {
      let lo = 1e9, hi = -1, bad = 0;
      for (let j = 0; j < NAV; j++) for (let i = 0; i < NAV; i++) {
        const k = (y * NAV + j) * S.GW + x * NAV + i;
        if (M.solid[k] || M.pad[k]) bad = 1;
        lo = Math.min(lo, M.top[k]); hi = Math.max(hi, M.top[k]);
      }
      nav[y * NW + x] = bad || hi - lo > S.STEP ? 1 : 0;
      navH[y * NW + x] = hi;
    }
  nav.h = navH;
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
      if (nav.h[n] > nav.h[c] + S.STEP) continue;   // 只能走上一级台阶，可以往下跳
      if (dx && dy && (nav[cy * NW + x] || nav[y * NW + cx] || nav.h[n] !== nav.h[c])) continue;
      prev[n] = c; q.push(n);
    }
  }
  if (!found) return [];
  const pathOut = [];
  for (let c = goal; c !== start; c = prev[c]) pathOut.push({ x: (c % NW) * NC + NC / 2, y: ((c / NW) | 0) * NC + NC / 2 });
  pathOut.reverse();
  return pathOut;
}
// 能不能沿直线直接走过去（中间不能有比一级台阶更高的坎，也不能有墙或弹跳板）
function floorLos(M, x0, y0, x1, y1, z0) {
  const a = Math.atan2(y1 - y0, x1 - x0), ox = -Math.sin(a) * 12, oy = Math.cos(a) * 12;
  const L = Math.hypot(x1 - x0, y1 - y0), n = Math.ceil(L / 8);
  for (const k of [0, 1, -1]) {
    let h = z0 == null ? S.topAt(M, x0, y0) : z0;
    for (let i = 1; i <= n; i++) {
      const x = x0 + ((x1 - x0) * i) / n + ox * k, y = y0 + ((y1 - y0) * i) / n + oy * k;
      const t = S.topAt(M, x, y);
      if (t > h + S.STEP || S.padAt(M, x, y)) return false;
      h = t;
    }
  }
  return true;
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
    // 逃亡圈默认用「废墟逃亡区」
    const ruins = S.MAPS.findIndex((m) => m.name === '废墟逃亡区');
    this.mapIdx = st.map < 0 ? (S.isEscape(this.mode) && ruins >= 0 ? ruins : randInt(S.MAPS.length)) : st.map;
    this.teams = S.teamsOf(this.mode);
    this.oneLife = !!(S.MODES[this.mode] && S.MODES[this.mode].oneLife);
    this.M = S.buildMap(this.mapIdx);
    this.nav = buildNav(this.M);
    this.grid = new Uint8Array(S.GW * S.GH);
    this.duration = st.duration; this.timeLeft = st.duration;
    this.countdown = 3.5; this.time = 0; this.tick = 0; this.over = false;
    this.players = new Map(); this.projs = []; this.bombs = []; this.missiles = []; this.shells = []; this.helpers = [];
    this.reveal = new Array(this.teams + 1).fill(0);   // 全队扫描（义眼扫描）结束时间
    this.nextId = 1; this.diff = []; this.events = [];
    this.colorSet = room.colorSet;
    const slots = {};
    for (let t = 1; t <= this.teams; t++) slots[t] = 0;
    const teamCap = this.teams > 2 ? S.MODES[this.mode].size : S.MAX_PER_TEAM;
    // 多队模式：真人按加入顺序分队（四队：每 2 人一队；单人：每人一队）
    if (this.teams > 2) { let i = 0; for (const c of room.members.values()) c.gTeam = 1 + (Math.floor(i++ / teamCap) % this.teams); }
    if (S.isEscape(this.mode)) this.spawns = this.escapeSpawns();
    // 角色等级：公平模式下所有人按同一等级；AI 的等级跟着真人玩家的平均等级
    this.fair = !!st.fair;
    this.tutorial = !!st.tutorial;   // 新手教程：敌人是不动的训练靶，时间不走，玩家不会倒下
    const FAIR = { lv: E.FAIR_LV, bt: E.FAIR_BT };
    const humans = [];
    for (const c of room.members.values()) {
      const team = this.teams > 2 ? c.gTeam : c.team;
      if (slots[team] >= teamCap) continue;
      const pw = this.fair ? FAIR : c.power || { lv: 1, bt: 0 };
      humans.push(pw);
      const pl = this.addPlayer(c.id, c.name, team, c.weapon, c.head, false, slots[team]++, c.pilot, pw);
      pl.looks = c.looks || null;
    }
    const avgLv = humans.length ? Math.round(humans.reduce((a, b) => a + b.lv, 0) / humans.length) : 1;
    const botPw = this.fair ? FAIR : { lv: avgLv, bt: avgLv >= 9 ? 2 : avgLv >= 5 ? 1 : 0 };
    if (st.bots) {
      let bi = 0;
      const names = BOT_NAMES.slice().sort(() => Math.random() - 0.5);
      // AI 机兵由驾驶员们驾驶：优先使用还没人选的驾驶员（名字就是驾驶员的名字）
      const taken = new Set([...this.players.values()].map((p) => p.pilot));
      const free = S.PILOTS.filter((pp) => !taken.has(pp.id)).sort(() => Math.random() - 0.5);
      const perTeam = this.teams > 2 ? teamCap : st.teamSize;
      for (let team = 1; team <= this.teams; team++)
        while (slots[team] < perTeam && !(this.tutorial && team === 1)) {
          bi++;
          const pp = free.shift();
          const pil = pp || S.PILOTS[randInt(S.PILOTS.length)];
          // 驾驶员和机体分开选：一半用擅长机体，一半随机
          this.addPlayer(-bi, pp ? pp.name : names[bi % names.length], team, Math.random() < 0.5 ? pil.weapon : S.WEAPON_ORDER[randInt(S.WEAPON_ORDER.length)],
            S.HEADS[randInt(S.HEADS.length)].id, true, slots[team]++, pil.id, botPw);
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
      players: [...this.players.values()].map((p) => ({ id: p.id, name: p.name, team: p.team, weapon: p.weapon, head: p.head, pilot: p.pilot, bot: p.bot, lv: p.lv, bt: p.bt, looks: p.looks || null })),
      fair: this.fair, teams: this.teams,
    });
    if (!opts.manual) this.interval = setInterval(() => this.step(), 1000 / S.TICK);
  }

  addPlayer(id, name, team, weapon, head, bot, slot, pilot, power) {
    if (!S.WEAPONS[weapon]) weapon = 'blaster';
    const pid = S.pilot(pilot).id;
    const W = S.WEAPONS[weapon];
    const lv = clamp((power && power.lv) | 0 || 1, 1, E.MAX_LV), bt = clamp((power && power.bt) | 0, 0, 2);
    const pmul = E.statMul(lv);   // 等级加成：生命和伤害每级 +4%
    const tal = new Set(power && Array.isArray(power.tal) ? power.tal.filter((t) => S.talent(t)).slice(0, S.TALENT_SLOTS) : []);
    const p = {
      id, name, team, weapon, head, bot, slot, pilot: pid, lv, bt, pmul, tal,
      ov: 0, ovT: 0, ovUsed: false, lastOq: 0, rallyT: 0, revealT: 0, ovPulse: 0,
      maxHp: Math.round(W.hp * (pid === 'titan' ? 1.15 : 1) * pmul * (tal.has('d1') ? 1.08 : 1)),
      x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, onGround: true,
      hp: 100, ammo: S.AMMO, sp: 0, alive: true, respawnT: 0, invulnT: 0,
      lastHurt: -10, lastAtk: -10, atkCd: 0, burst: null, rollT: 0, charge: 0, prevFire: false,
      spT: 0, spKind: null, spWave: 0, shield: 0, shieldT: 0, sm: 1, carry: 0, hidden: false, wheel: false, firing: false,
      foot: false, rebuildT: 0, skillUses: S.SKILL_USES + (tal.has('s2') ? 1 : 0), skillCd: 0, rushT: 0, slowT: 0, silenceT: 0, smokeT: 0, odN: 0, dmgMul: 1,
      quakeT: 0, quakeArm: 0,
      input: { mx: 0, my: 0, a: team === 1 ? 0 : Math.PI, pt: 0, f: false, w: false, j: false, qq: 0, gq: 0, aq: 0, oq: 0, ad: 200 },
      lastQq: 0, lastGq: 0, lastAq: 0, sync: 0, lastPosT: 0, hitCd: {},
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
      this.time += dt; if (!this.tutorial) this.timeLeft -= dt;
      for (const p of this.players.values()) if (p.bot) botThink(this, p, dt);
      for (const p of this.players.values()) this.updatePlayer(p, dt);
      this.updateProjs(dt);
      this.updateBombs(dt);
      this.updateShells(dt);
      this.updateHelpers(dt);
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
    inp.qq = m.qq | 0; inp.gq = m.gq | 0; inp.aq = m.aq | 0; inp.oq = m.oq | 0;
    if (Number.isFinite(m.ad)) inp.ad = clamp(m.ad, 0, 1200);
    // 客户端预测移动，服务器校验（限速 + 不穿墙 + 高度合理）
    if (p.alive && this.countdown <= 0 && !this.over && Number.isFinite(m.x) && Number.isFinite(m.y) && Number.isFinite(m.z) && m.sync === p.sync) {
      const dtAllow = Math.min(0.6, this.time - p.lastPosT) + 0.05;
      if (S.padAt(this.M, p.x, p.y) || S.padAt(this.M, m.x, m.y)) p.kbT = this.time;   // 踩到弹跳板也会被弹飞
      const kb = this.time - (p.kbT || -9) < 1.2 ? 540 : 0;     // 刚被击退：放宽速度上限
      const maxStep = (380 * p.sm + 40 + kb) * dtAllow + 12;
      const d = Math.hypot(m.x - p.x, m.y - p.y);
      const gh = this.top(m.x, m.y);
      const test = { x: m.x, y: m.y, z: m.z };
      S.collide(test, (p.foot ? S.PILOT_R : S.R) - 2, this.M);
      const bad = Math.hypot(test.x - m.x, test.y - m.y) > 3 || m.z < gh - 2 || m.z > gh + 130 || m.z > p.z + (S.JUMP_W * S.JUMP_W) / (2 * S.GRAV) + 30 + (kb ? (S.PAD.v * S.PAD.v) / (2 * S.GRAV) : 0);
      if (d <= maxStep && !bad) {
        p.x = m.x; p.y = m.y; p.z = Math.max(gh, m.z); p.lastPosT = this.time;
        const vmax = 460 * p.sm + kb;
        p.vx = clamp(+m.vx || 0, -vmax, vmax); p.vy = clamp(+m.vy || 0, -vmax, vmax); p.vz = clamp(+m.vz || 0, -2000, 600);
        p.onGround = p.z <= gh + 1;
      } else {
        p.sync++;
      }
    }
  }

  // ------------------------------------------------------------------
  maxHpOf(p) { return p.foot ? S.PILOT_HP : p.maxHp; }
  updatePlayer(p, dt) {
    const wheel0 = (q) => !!q.input.w && !q.foot;
    if (!p.alive) {
      p.respawnT -= dt;
      if (p.respawnT <= 0) this.respawn(p);
      return;
    }
    const inp = p.input, W = S.WEAPONS[p.weapon];
    p.invulnT = Math.max(0, p.invulnT - dt);
    if (p.shieldT > 0) { p.shieldT -= dt; if (p.shieldT <= 0) p.shield = 0; }
    p.skillCd = Math.max(0, p.skillCd - dt);
    p.rushT = Math.max(0, p.rushT - dt); p.slowT = Math.max(0, p.slowT - dt);
    p.silenceT = Math.max(0, p.silenceT - dt); p.smokeT = Math.max(0, p.smokeT - dt);
    p.rallyT = Math.max(0, p.rallyT - dt); p.revealT = Math.max(0, p.revealT - dt);
    const OV = p.ovT > 0 ? S.OVERLOADS[p.pilot] : null;
    if (p.ovT > 0) { p.ovT -= dt; if (p.ovT <= 0) p.ovT = 0; }
    const spAct = p.spT > 0;
    const gh = this.top(p.x, p.y);
    const grounded = p.z <= gh + 1;
    const ground = grounded ? S.cellAt(this.grid, p.x, p.y) : -1;
    const own = ground === p.team, enemy = ground > 0 && !own;
    const inBush = S.inBush(this.M, p.x, p.y, p.z);
    let sm = p.foot ? (p.pilot === 'gale' ? 1.4 : 1) : W.spd;
    if (this.obj.tr && this.obj.tr.carrier === p.id) sm *= 0.72;
    if (p.carry) sm *= 1 - 0.04 * p.carry;
    if (spAct && p.spKind === 'charge') sm *= 1.45;
    if (p.rushT > 0) sm *= 1.35;
    if (p.slowT > 0) sm *= 0.55;
    if (p.pilot === 'raven' && (inBush || own)) sm *= 1.15;
    if (OV && OV.spd) sm *= OV.spd;
    if (p.rallyT > 0) sm *= 1.15;
    if (own && p.tal.has('p2')) sm *= 1.06;
    if (own && wheel0(p) && p.tal.has('p6')) sm *= 1.1;
    p.sm = sm;
    const wheel = !!inp.w && !p.foot && !(spAct && p.spKind === 'beam');
    p.wheel = wheel;
    if (p.bot) { S.stepMove(p, inp, dt, this.grid, this.M, S.moveMul(p.weapon, p.firing && !wheel, spAct ? p.spKind : null)); inp.j = false; }

    // 敌方涂料持续掉血；脱战 3 秒后快速回血（大厨更快）
    const maxHp = this.maxHpOf(p);
    if (enemy && p.invulnT <= 0 && !(spAct && p.spKind === 'charge') && p.hp > maxHp * 0.3) p.hp = Math.max(maxHp * 0.3, p.hp - maxHp * 0.1 * dt);
    if (!enemy && this.time - p.lastHurt > 3 && this.time - p.lastAtk > 2) {
      const k = (wheel && own ? 0.32 : 0.16) * (p.pilot === 'chef' ? 2 : 1);
      p.hp = Math.min(maxHp, p.hp + maxHp * k * dt);
    }
    if (own && p.tal.has('p4')) p.hp = Math.min(maxHp, p.hp + 3 * dt);   // 天赋：墨水回复
    if (OV) this.overloadTick(p, OV, dt);

    // 装填：攻击过程中不装填；己方涂料上的滚轮形态装填更快
    if (!p.burst && p.rollT <= 0 && !(p.charge > 0)) {
      const rt = p.foot ? S.sidearm(p.pilot).reload : W.reload;
      let rk = (p.rushT > 0 ? 2 : 1) * (wheel && own ? 1.6 : 1) * (p.tal.has('a2') ? 1.12 : 1);
      if (this.nearPilot(p, 'echo', 180)) rk *= 1.15;   // 叶声被动：节拍同步
      p.ammo = Math.min(S.AMMO, p.ammo + (dt / rt) * rk);
    }
    if (OV && OV.infAmmo && !p.foot) p.ammo = S.AMMO;

    let firing = false;
    if (wheel) {
      if (inp.aq !== p.lastAq) p.lastAq = inp.aq;
      p.charge = 0; p.burst = null;
    } else firing = this.weaponLogic(p, inp, dt, W, grounded);
    p.firing = firing;

    // 隐身：草丛 / 己方涂料里的滚轮 / 墨雾；攻击后 0.9 秒内会暴露（墨雾除外）
    const recentAtk = this.time - p.lastAtk < 0.9 && p.quietAtk !== p.lastAtk;   // 夜鸢的飞镖不暴露
    p.hidden = (p.smokeT > 0 || ((inBush || (wheel && own)) && !recentAtk)) && !(p.revealT > 0);

    if (inp.qq !== p.lastQq) {
      p.lastQq = inp.qq;
      if (!p.foot && p.sp >= W.spNeed && !spAct && p.silenceT <= 0) this.activateSpecial(p);
    }
    if (inp.gq !== p.lastGq) {
      p.lastGq = inp.gq;
      if (p.skillUses > 0 && p.skillCd <= 0 && p.silenceT <= 0) this.useSkill(p);
    }
    if (inp.oq !== p.lastOq) {
      p.lastOq = inp.oq;
      if (p.bt >= 1 && !p.ovUsed && p.ov >= S.OV_NEED && p.silenceT <= 0) this.activateOverload(p);
    }
    if (p.spT > 0) this.updateSpecial(p, dt);
    if (p.quakeT > 0) {
      p.quakeT -= dt;
      if ((this.time > p.quakeArm && grounded) || p.quakeT <= 0) this.quakeSlam(p);
    }
    if (p.foot) {
      p.rebuildT -= dt;
      if (p.rebuildT <= 0) this.redeploy(p);
    }
    p.prevFire = !!inp.f;
  }

  muzzle(p) {
    const d = S.dir3(p.input.a, p.input.pt);
    const r = p.foot ? 8 : 16, h = p.foot ? 14 : S.MUZZLE;
    return { x: p.x + d.x * r, y: p.y + d.y * r, z: p.z + h + d.z * r, d };
  }

  // 每次攻击消耗 1 格弹药；inp.f = 按住（电脑），inp.aq 计数 = 点一下 / 松开摇杆（手机）
  weaponLogic(p, inp, dt, W, grounded) {
    p.atkCd -= dt;
    if (p.spT > 0 && p.spKind === 'beam') return true;
    let pulse = false;
    if (inp.aq !== p.lastAq) { p.lastAq = inp.aq; pulse = true; }
    if (p.silenceT > 0) { p.charge = 0; return false; }
    if (p.burst) { this.stepBurst(p, p.foot ? S.sidearm(p.pilot) : W, dt); return true; }
    if (p.rollT > 0) this.stepRoll(p, W, dt);
    if (p.foot) {
      const A = S.sidearm(p.pilot);
      if ((inp.f || pulse) && p.atkCd <= 0 && p.ammo >= A.cost) {
        p.ammo -= A.cost; p.atkCd = A.atkCd; p.lastAtk = this.time; p.dmgMul = 1;
        p.quietAtk = A.quiet ? this.time : -1;
        this.fireSidearm(p, A, inp);
        return true;
      }
      return false;
    }
    if (W.attack === 'charge') {
      if (inp.f && p.ammo >= 1) { p.charge = Math.min(1, p.charge + dt / W.chargeTime); return true; }
      const ch = Math.max(p.charge, pulse ? 0.35 : 0);
      if (ch > 0.08 && p.ammo >= 1 && p.atkCd <= 0) {
        p.ammo -= 1; p.atkCd = W.atkCd; p.lastAtk = this.time; this.takeOverdrive(p);
        this.fireCharger(p, ch, W);
      }
      p.charge = 0;
      return false;
    }
    const want = inp.f || pulse;
    if (want && p.atkCd <= 0 && p.ammo >= 1) {
      const OVr = p.ovT > 0 && S.OVERLOADS[p.pilot].rof;
      p.ammo -= 1; p.atkCd = W.atkCd / (OVr || 1); p.lastAtk = this.time; this.takeOverdrive(p);
      switch (W.attack) {
        case 'burst': p.burst = { n: W.shots, t: 0, aim: W.homing ? this.autoAim(p, W) : null }; this.stepBurst(p, W, 0); break;
        case 'fan': this.fireSpread(p, W); break;
        case 'flick':
          this.fireSpread(p, W);
          if (grounded) { this.knock(p, Math.cos(inp.a), Math.sin(inp.a), W.lunge, 0); p.rollT = 0.45; p.rollA = inp.a; }
          break;
        case 'lob': {
          const d = clamp(inp.ad || 200, W.minRange, W.range);
          this.spawnShell(p, p.x + Math.cos(inp.a) * d, p.y + Math.sin(inp.a) * d, W.dmg * p.dmgMul, W.blast, W.flight);
          break;
        }
        case 'punch': this.punch(p, W); break;
      }
      return true;
    }
    return p.rollT > 0;
  }
  takeOverdrive(p) { p.dmgMul = p.odN > 0 ? 1.4 : 1; if (p.odN > 0) p.odN--; }
  // 驾驶员的随身武器（S.SIDEARMS）
  fireSidearm(p, A, inp) {
    const fl = { ghost: A.ghost, fx: A.fx };
    if (A.kind === 'melee') return this.footMelee(p, A);
    if (A.kind === 'lob') {
      const d = clamp(inp.ad || 180, 60, A.range);
      const sh = this.spawnShellRet(p, p.x + Math.cos(inp.a) * d, p.y + Math.sin(inp.a) * d, A.dmg, A.r, A.T);
      if (sh) sh.foot = true;
      return;
    }
    if (A.shots > 1) { p.burst = { n: A.shots, t: 0, aim: null, fl }; this.stepBurst(p, A, 0); return; }
    const aim = A.homing ? this.autoAim(p, A) : null;
    const n = A.pellets || 1;
    for (let i = 0; i < n; i++) {
      const off = n > 1 ? (i / (n - 1) - 0.5) * A.arc : 0;
      this.spawnProj(p, (aim ? aim.a : inp.a) + off + (Math.random() - 0.5) * A.spread, aim ? aim.pt : inp.pt, A.speed, A.range, A.dmg, A.splat, A.trail, A.size, null, fl);
    }
  }
  footMelee(p, A) {
    const a = p.input.a;
    this.knock(p, Math.cos(a), Math.sin(a), A.lunge || 120, 0);
    const fx = p.x + Math.cos(a) * 22, fy = p.y + Math.sin(a) * 22;
    this.paint(fx, fy, p.z, 18, p.team, p);
    let hit = 0;
    for (const t of this.players.values()) {
      if (!t.alive || t.team === p.team) continue;
      const dx = t.x - p.x, dy = t.y - p.y, d = Math.hypot(dx, dy);
      if (d > A.range + (t.foot ? S.PILOT_R : S.R) + 6 || Math.abs(t.z - p.z) > 34) continue;
      let da = Math.atan2(dy, dx) - a; while (da > Math.PI) da -= Math.PI * 2; while (da < -Math.PI) da += Math.PI * 2;
      if (Math.abs(da) > A.arc / 2) continue;
      this.hurt(t, A.dmg, p, dx, dy, A.kb / (A.dmg * 1.8), 80);
      this.sideFx(t, A.fx);
      hit++;
    }
    if (hit && A.heal) { p.hp = Math.min(this.maxHpOf(p), p.hp + A.heal * hit); this.ev(['heal', p.id, A.heal * hit]); }
    this.pushBall(p, fx, fy, A.range, 600);
    this.ev(['pu', p.id, r2(a), A.range, 1]);
  }
  sideFx(t, fx) {
    if (!fx || !t.alive) return;
    if (fx.slow) t.slowT = Math.max(t.slowT, fx.slow);
    if (fx.reveal) t.revealT = Math.max(t.revealT || 0, fx.reveal);
  }
  stepBurst(p, W, dt) {
    const b = p.burst;
    b.t -= dt;
    while (b.t <= 0 && b.n > 0) {
      const ya = b.aim ? b.aim.a : p.input.a, pa = b.aim ? b.aim.pt : p.input.pt;
      this.spawnProj(p, ya + (Math.random() - 0.5) * W.spread, pa + (Math.random() - 0.5) * W.spread * 0.4, W.speed, W.range, W.dmg, W.splat, W.trail, W.size, null, b.fl);
      b.n--; b.t += W.interval;
    }
    if (b.n <= 0) p.burst = null;
  }
  stepRoll(p, W, dt) {
    p.rollT -= dt;
    const fx = p.x + Math.cos(p.rollA) * 14, fy = p.y + Math.sin(p.rollA) * 14;
    this.paint(fx, fy, p.z, W.rollWidth, p.team, p);
    this.contactDamage(p, fx, fy, W.rollWidth + S.R - 4, W.rollDmg * p.dmgMul, 0.45);
    this.pushBall(p, fx, fy, W.rollWidth, 320);
  }
  punch(p, W) {
    const a = p.input.a;
    this.knock(p, Math.cos(a), Math.sin(a), W.lunge, 0);
    const fx = p.x + Math.cos(a) * 30, fy = p.y + Math.sin(a) * 30;
    this.paint(fx, fy, p.z, 30, p.team, p);
    for (const t of this.players.values()) {
      if (!t.alive || t.team === p.team) continue;
      const dx = t.x - p.x, dy = t.y - p.y, d = Math.hypot(dx, dy);
      if (d > W.range + S.R + 10 || Math.abs(t.z - p.z) > 40) continue;
      let da = Math.atan2(dy, dx) - a; while (da > Math.PI) da -= Math.PI * 2; while (da < -Math.PI) da += Math.PI * 2;
      if (Math.abs(da) > W.arc / 2) continue;
      const dmg = W.dmg * p.dmgMul;
      this.hurt(t, dmg, p, dx, dy, W.kb / (dmg * 1.8), 120);
    }
    this.pushBall(p, fx, fy, W.range, 1100);
    this.ev(['pu', p.id, r2(a)]);
  }

  fireSpread(p, W) {
    const n = W.pellets || 1, a = p.input.a, pt = p.input.pt;
    if (W.attack === 'fan' && !W.ghost) this.knock(p, -Math.cos(a), -Math.sin(a), W.kb ? 40 : 100, 0);   // 泼桶的后坐力
    for (let i = 0; i < n; i++) {
      const off = n > 1 ? (i / (n - 1) - 0.5) * W.arc : 0;
      const k = n > 1 ? rand(0.85, 1.12) : 1;
      this.spawnProj(p, a + off + (Math.random() - 0.5) * W.spread, pt + (Math.random() - 0.5) * W.spread * 0.6 + (n > 1 ? rand(-0.02, 0.04) : 0),
        W.speed * k, W.range * k, W.dmg, W.splat, W.trail, W.size, null, { ghost: W.ghost, kb: W.kb });
    }
  }

  // 无人机母舰：朝视野内离准星最近的敌人发射（客户端和服务器弹道一致，所以用发射时锁定代替中途转弯）
  autoAim(p, W) {
    let best = null, bs = 0.5;
    for (const e of this.players.values()) {
      if (!e.alive || e.team === p.team || (e.hidden && !(this.reveal[p.team] > this.time))) continue;
      const dx = e.x - p.x, dy = e.y - p.y, d = Math.hypot(dx, dy);
      if (d > W.range + 30) continue;
      let da = Math.atan2(dy, dx) - p.input.a; while (da > Math.PI) da -= Math.PI * 2; while (da < -Math.PI) da += Math.PI * 2;
      if (Math.abs(da) < bs && S.los3(this.M, p.x, p.y, p.z + S.MUZZLE, e.x, e.y, e.z + 16)) { bs = Math.abs(da); best = { a: Math.atan2(dy, dx), pt: Math.atan2(e.z + 16 - (p.z + S.MUZZLE), d) + d * 0.00011 }; }
    }
    return best;
  }
  nearPilot(p, pid, r) {
    for (const a of this.players.values()) if (a !== p && a.alive && a.team === p.team && a.pilot === pid && Math.hypot(a.x - p.x, a.y - p.y) < r) return true;
    return false;
  }
  spawnProj(p, yaw, pitch, speed, range, dmg, splat, trail, size, origin, fl) {
    const d = S.dir3(yaw, pitch);
    const o = origin || { x: p.x, y: p.y, z: p.z + (p.foot ? 14 : S.MUZZLE), r: p.foot ? 8 : 16 };
    const x = o.x + d.x * (o.r || 0), y = o.y + d.y * (o.r || 0), z = o.z + d.z * (o.r || 0);
    if (S.insideAt(this.M, x, y, z)) { this.paint(o.x, o.y, o.z - 10, splat * 0.7, p.team, p); return; }
    const pr = { id: this.nextId++, x0: x, y0: y, z0: z, x, y, z, vx: d.x * speed, vy: d.y * speed, vz: d.z * speed, ts: range / speed, t: 0, team: p.team, owner: p.id,
      dmg: dmg * (origin ? 1 : p.dmgMul || 1), splat, trail, size, acc: 0, range, ghost: !!(fl && fl.ghost), kb: (fl && fl.kb) || 1, fx: (fl && fl.fx) || null };
    this.projs.push(pr);
    this.ev(['pj', pr.id, r1(x), r1(y), r1(z), r1(pr.vx), r1(pr.vy), r1(pr.vz), r2(pr.ts), p.team, size, p.id, pr.ghost ? 1 : 0]);
    return pr;
  }
  // 曲射炮弹：飞行 T 秒后落在 (x1, y1)，可以越过墙
  spawnShellRet(p, x1, y1, dmg, r, T) { this.spawnShell(p, x1, y1, dmg, r, T); return this.shells[this.shells.length - 1]; }
  spawnShell(p, x1, y1, dmg, r, T) {
    x1 = clamp(x1, 10, S.W - 10); y1 = clamp(y1, 10, S.H - 10);
    let z1 = this.top(x1, y1);
    if (this.M.solid[Math.floor(y1 / S.CELL) * S.GW + Math.floor(x1 / S.CELL)]) z1 = S.LEVEL_H[3];
    const sh = { id: this.nextId++, x0: p.x, y0: p.y, z0: p.z + (p.foot ? 18 : S.MUZZLE + 6), x1, y1, z1, T, t: 0, team: p.team, owner: p.id, dmg, r };
    this.shells.push(sh);
    this.ev(['lb', sh.id, r1(sh.x0), r1(sh.y0), r1(sh.z0), r1(x1), r1(y1), r1(z1), r2(T), p.team]);
  }
  updateShells(dt) {
    this.shells = this.shells.filter((s) => {
      s.t += dt;
      if (s.t < s.T) return true;
      this.explode(s.x1, s.y1, s.z1, s.r, s.dmg, s.dmg * 0.45, s.team, this.players.get(s.owner));
      this.ev(['bx', r1(s.x1), r1(s.y1), r1(s.z1), s.team, s.r, 0]);
      if (s.fire) { this.helpers.push({ id: this.nextId++, kind: 'fire', x: s.x1, y: s.y1, z: s.z1, r: 110, team: s.team, owner: s.owner, t: 4, cd: 0 }); this.ev(['fz', r1(s.x1), r1(s.y1), r1(s.z1), 110, 4, s.team]); }
      return false;
    });
  }

  // ---------------- 驾驶员技能 ----------------
  useSkill(p) {
    const P = S.pilot(p.pilot);
    p.skillUses--; p.skillCd = S.SKILL_CD;
    this.ev(['sk', p.id, P.skill, r1(p.x), r1(p.y), r1(p.z)]);
    switch (P.skill) {
      case 'rush': p.rushT = 3; break;
      case 'scan': this.reveal[p.team] = this.time + 5; break;
      case 'cheer':
        for (const a of this.players.values()) if (a.alive && a.team === p.team && dist(a, p) < 200) a.hp = Math.min(this.maxHpOf(a), a.hp + 50);
        break;
      case 'guard': p.shield = Math.max(p.shield, 60); p.shieldT = 4; break;
      case 'smoke': this.paint(p.x, p.y, p.z, 95, p.team, p); p.smokeT = 3; break;
      case 'turret': this.helpers.push({ id: this.nextId++, kind: 'turret', x: p.x, y: p.y, z: p.z, team: p.team, owner: p.id, t: 7, cd: 0.3 }); break;
      case 'dash': {
        let dx = p.input.mx, dy = p.input.my;
        if (Math.hypot(dx, dy) < 0.2) { dx = Math.cos(p.input.a); dy = Math.sin(p.input.a); }
        this.knock(p, dx, dy, 520, 0); p.invulnT = Math.max(p.invulnT, p.pilot === 'gale' ? 0.5 : 0.35);
        break;
      }
      case 'emp':
        for (const e of this.players.values()) if (e.alive && e.team !== p.team && dist(e, p) < 190) { e.slowT = 2.5; e.silenceT = 1.3; e.charge = 0; e.burst = null; }
        break;
      case 'bento': this.helpers.push({ id: this.nextId++, kind: 'bento', x: p.x, y: p.y, z: p.z, team: p.team, owner: p.id, t: 15, armed: 0.6 }); break;
      case 'overdrive': p.ammo = S.AMMO; p.odN = 3; break;
      case 'drone': this.helpers.push({ id: this.nextId++, kind: 'drone', x: p.x, y: p.y, z: p.z + 40, team: p.team, owner: p.id, t: 6, cd: 0.3, ang: 0 }); break;
      case 'rally':
        for (const a of this.players.values()) if (a.alive && a.team === p.team && dist(a, p) < 180) a.rallyT = Math.max(a.rallyT, 5);
        break;
      case 'blast': this.helpers.push({ id: this.nextId++, kind: 'charge', x: p.x, y: p.y, z: this.top(p.x, p.y), team: p.team, owner: p.id, t: 0.9, cd: 99 }); break;
      case 'flash':
        for (const e of this.players.values()) {
          if (!e.alive || e.team === p.team || dist(e, p) > 230) continue;
          let da = Math.atan2(e.y - p.y, e.x - p.x) - p.input.a; while (da > Math.PI) da -= Math.PI * 2; while (da < -Math.PI) da += Math.PI * 2;
          if (Math.abs(da) > 1.25) continue;
          e.slowT = Math.max(e.slowT, 1.2); e.silenceT = Math.max(e.silenceT, 0.8); e.revealT = 4; e.charge = 0; e.burst = null;
          this.hurt(e, 10, p);
        }
        break;
      case 'jam':
        for (const e of this.players.values()) {
          if (!e.alive || e.team === p.team || dist(e, p) > 220) continue;
          e.sp = Math.max(0, e.sp - S.WEAPONS[e.weapon].spNeed * 0.3); e.revealT = 4;
        }
        break;
    }
    if (p.tal.has('s1')) p.skillCd *= 0.75;
  }
  // ---------------- 超载技能 ----------------
  activateOverload(p) {
    const O = S.OVERLOADS[p.pilot];
    p.ovUsed = true; p.ov = 0; p.ovT = S.OV_TIME + (p.bt >= 2 ? 2 : 0) + (p.tal.has('s6') ? 2 : 0); p.ovPulse = 0;
    this.ev(['ov', p.id, p.pilot, r1(p.x), r1(p.y), r1(p.z)]);
    const near = (r) => [...this.players.values()].filter((a) => a.alive && a.team === p.team && dist(a, p) < r);
    if (O.skillReset) { p.skillCd = 0; p.skillUses++; }
    if (O.stealth) p.smokeT = Math.max(p.smokeT, p.ovT);
    if (O.hack) {
      this.reveal[p.team] = this.time + p.ovT;
      for (const e of this.players.values()) if (e.alive && e.team !== p.team) { e.silenceT = Math.max(e.silenceT, 3); e.charge = 0; e.burst = null; }
    }
    if (O.burstHeal) for (const a of near(220)) { a.hp = Math.min(this.maxHpOf(a), a.hp + O.burstHeal); this.ev(['heal', a.id, O.burstHeal]); }
    if (O.drones) for (let i = 0; i < O.drones; i++) this.helpers.push({ id: this.nextId++, kind: 'drone', x: p.x, y: p.y, z: p.z + 40, team: p.team, owner: p.id, t: p.ovT, cd: 0.3 + i * 0.2, ang: i * Math.PI });
    if (O.rally) for (const a of near(300)) a.rallyT = Math.max(a.rallyT, p.ovT);
  }
  overloadTick(p, O, dt) {
    const k = p.bt >= 2 ? 1.25 : 1;
    if (O.regen) {
      const list = O.burstHeal ? [p] : [...this.players.values()].filter((a) => a.alive && a.team === p.team && dist(a, p) < 200);
      for (const a of list) a.hp = Math.min(this.maxHpOf(a), a.hp + O.regen * k * dt);
    }
    if (O.pulse) {
      p.ovPulse -= dt;
      if (p.ovPulse <= 0) {
        p.ovPulse = 1;
        this.explode(p.x, p.y, p.z + 10, 180, O.pulse * k, O.pulse * k * 0.7, p.team, p, true);
        this.ev(['bx', r1(p.x), r1(p.y), r1(p.z + 10), p.team, 180, 2]);
      }
    }
  }
  updateHelpers(dt) {
    this.helpers = this.helpers.filter((h) => {
      h.t -= dt;
      const o = this.players.get(h.owner);
      if (!o) return false;
      if (h.kind === 'charge' && h.t <= 0) h.t = 0.01;
      if (h.t <= 0) return false;
      if (h.kind === 'bento') {
        h.armed -= dt;
        if (h.armed > 0) return true;
        for (const a of this.players.values()) {
          if (a.alive && a.team === h.team && Math.hypot(a.x - h.x, a.y - h.y) < 26 && Math.abs(a.z - h.z) < 30) {
            a.hp = Math.min(this.maxHpOf(a), a.hp + 90); this.ev(['heal', a.id, 90]); return false;
          }
        }
        return true;
      }
      if (h.kind === 'charge') {   // 石磊的炸药：时间到就爆
        if (h.t <= 0.04) { this.explode(h.x, h.y, h.z + 8, 110, 72, 30, h.team, o); this.ev(['bx', r1(h.x), r1(h.y), r1(h.z + 8), h.team, 110, 0]); return false; }
        return true;
      }
      if (h.kind === 'wall') return true;   // 盾墙：挡子弹的判定在 updateProjs
      if (h.kind === 'fire') {     // 燃料罐的火海：每 0.4 秒伤害并涂色
        h.cd -= dt;
        if (h.cd <= 0) {
          h.cd = 0.4;
          this.paint(h.x, h.y, h.z, h.r * 0.8, h.team, o);
          for (const e of this.players.values()) if (e.alive && e.team !== h.team && Math.hypot(e.x - h.x, e.y - h.y) < h.r && Math.abs(e.z - h.z) < 40) this.hurt(e, 12, o);
        }
        return true;
      }
      if (h.kind === 'drone') {
        if (!o.alive) return false;
        h.ang += dt * 2.4;
        h.x = o.x + Math.cos(h.ang) * 26; h.y = o.y + Math.sin(h.ang) * 26; h.z = o.z + 44;
      }
      h.cd -= dt;
      if (h.cd > 0) return true;
      const range = h.kind === 'turret' ? 300 : 260;
      let best = null, bd = range;
      for (const e of this.players.values()) {
        if (!e.alive || e.team === h.team || (e.hidden && !(this.reveal[h.team] > this.time))) continue;
        const d = Math.hypot(e.x - h.x, e.y - h.y);
        if (d < bd && S.los3(this.M, h.x, h.y, h.z + 16, e.x, e.y, e.z + 16)) { bd = d; best = e; }
      }
      if (best) {
        h.cd = h.kind === 'turret' ? 0.45 : 0.5;
        const hz = h.kind === 'turret' ? h.z + 18 : h.z;
        const a = Math.atan2(best.y - h.y, best.x - h.x), pt = Math.atan2(best.z + 16 - hz, bd);
        this.spawnProj(o, a, pt, 620, range + 20, h.kind === 'turret' ? 12 : 11, 12, 0, 5, { x: h.x, y: h.y, z: hz, r: 6 });
      } else h.cd = 0.15;
      return true;
    });
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
      const R = t.foot ? S.PILOT_R : S.R, H = t.foot ? 22 : S.PH;
      if (Math.hypot(t.x - x, t.y - y) < R + pad && z > t.z - pad && z < t.z + H + pad) return t;
    }
    return null;
  }

  fireCharger(p, ch, W) {
    const range = W.range * (0.35 + 0.65 * ch);
    const mz = this.muzzle(p);
    let dmg = (W.minDmg + (W.dmg - W.minDmg) * ch) * p.dmgMul;
    const pr = 10 + 6 * ch;
    let victim = null, lastPaint = -99, hitT = 0;
    const b = this.obj.ball && this.obj.resetT <= 0 ? this.obj.ball : null;
    const end = this.trace(mz.x, mz.y, mz.z, mz.d, range, (x, y, z, t) => {
      const gh = this.top(x, y);
      if (z - gh < 45 && t - lastPaint > 12) { lastPaint = t; this.paint(x, y, gh, pr, p.team, p); }
      victim = this.hitPlayerAt(p.team, x, y, z, 5);
      if (victim) { hitT = t; return true; }
      if (b && Math.hypot(b.x - x, b.y - y, b.r - z) < b.r + 4) { b.vx += mz.d.x * (250 + 450 * ch); b.vy += mz.d.y * (250 + 450 * ch); b.last = p.team; return true; }
      return false;
    });
    if (victim) {
      if (p.pilot === 'frost' && hitT > W.range * 0.6) dmg *= 1.12;
      this.hurt(victim, dmg, p, mz.d.x, mz.d.y);
    }
    this.paint(end.x, end.y, this.top(end.x, end.y), 18 + 12 * ch, p.team, p);
    this.ev(['ln', r1(mz.x), r1(mz.y), r1(mz.z), r1(end.x), r1(end.y), r1(end.z), p.team, r2(ch), p.id]);
    if (ch > 0.5) this.knock(p, -mz.d.x, -mz.d.y, 170 * ch, 0);   // 狙击后坐力
  }

  paint(x, y, z, r, team, owner) {
    if (owner && owner.tal && owner.tal.has('p1')) r *= 1.12;   // 天赋：大号喷嘴
    const n = S.paintCircle(this.grid, this.M, x, y, z, r, team, (i) => this.diff.push(i * 16 + team));
    if (owner && n) this.credit(owner, n);
    return n;
  }
  credit(owner, n) {
    if (!this.players.has(owner.id)) return;
    owner.stats.paint += n;
    if (!(owner.spT > 0)) owner.sp = Math.min(S.WEAPONS[owner.weapon].spNeed, owner.sp + n * 0.6 * (owner.pilot === 'yuzu' ? 2 : 1) * (owner.tal.has('p3') ? 1.25 : 1));
  }

  // 冲量：AI 直接作用在服务器状态上；真人玩家的位置由客户端预测，所以发事件让客户端施加
  knock(t, dx, dy, power, up) {
    const l = Math.hypot(dx, dy);
    if (l < 1e-6 || !t.alive) return;
    const ix = (dx / l) * power, iy = (dy / l) * power, iz = up || 0;
    t.kbT = this.time;
    if (t.bot) S.impulse(t, ix, iy, iz);
    else this.ev(['kb', t.id, Math.round(ix), Math.round(iy), Math.round(iz)]);
  }
  hurt(t, dmg, by, kdx, kdy, kmul, kup) {
    if (!t.alive || t.invulnT > 0) return;
    if (t.spT > 0 && t.spKind === 'charge') return;
    // 受击击退：伤害越高推得越远，滚轮形态和驾驶员更轻
    if (kdx == null && by) { kdx = t.x - by.x; kdy = t.y - by.y; }
    // 伤害倍率：攻击方（等级、天赋、超载、集结）× 防守方（被动、天赋、超载）
    const tOV = t.ovT > 0 ? S.OVERLOADS[t.pilot] : null;
    if (by && by !== t && by.tal) {
      const bOV = by.ovT > 0 ? S.OVERLOADS[by.pilot] : null;
      if (by.tal.has('a1')) dmg *= 1.06;
      if (by.tal.has('a4') && t.hp < this.maxHpOf(t) * 0.3) dmg *= 1.15;
      if (bOV && bOV.dmg) dmg *= bOV.dmg;
      if (by.rallyT > 0) dmg *= 1.2;
      if (bOV && bOV.kb) kmul = (kmul || 1) * bOV.kb;
      if (bOV && bOV.frostHit) t.slowT = Math.max(t.slowT, 1);
    }
    if (by && by !== t && by.tal) {
      if (by.tal.has('a5') && by.team !== t.team) { by.hitN = (by.hitN || 0) + 1; if (by.hitN % 5 === 0) dmg *= 1.6; }
      if (by.tal.has('a6') && (t.slowT > 0 || t.silenceT > 0 || t.revealT > 0)) dmg *= 1.2;
      if (by.tal.has('p5') && by.z <= this.top(by.x, by.y) + 1 && S.cellAt(this.grid, by.x, by.y) === by.team) dmg *= 1.08;
      if (by.pilot === 'han' && t.hp > this.maxHpOf(t) * 0.9) dmg *= 1.1;   // 韩冰被动：倒戈
    }
    // 防暴盾卫：正面（瞄准方向 ±60°）受到的伤害 -40%
    if (!t.foot && S.WEAPONS[t.weapon].front && (by || kdx != null)) {
      const sx = by && by !== t ? by.x - t.x : -(kdx || 0), sy = by && by !== t ? by.y - t.y : -(kdy || 0);
      let da = Math.atan2(sy, sx) - t.input.a; while (da > Math.PI) da -= Math.PI * 2; while (da < -Math.PI) da += Math.PI * 2;
      if (Math.abs(da) < 1.05) { dmg *= S.WEAPONS[t.weapon].front; this.ev(['blk', t.id]); }
    }
    if (t.tal && t.tal.has('d6') && dmg > 30) dmg *= 0.8;
    if (tOV && tOV.def) dmg *= tOV.def;
    if (tOV && tOV.reflect && by && by !== t && by.team !== t.team && by.alive && !this._reflecting) { this._reflecting = true; this.hurt(by, dmg * tOV.reflect, t); this._reflecting = false; }
    if (!t.foot && S.WEAPONS[t.weapon].armor) dmg *= S.WEAPONS[t.weapon].armor;   // 重装机体减伤
    if (t.tal && t.tal.has('d4') && t.hp < this.maxHpOf(t) * 0.3) dmg *= 0.85;
    if (t.pilot === 'flag') {   // 岚被动：附近每个队友 -5%
      let n = 0;
      for (const a of this.players.values()) if (a !== t && a.alive && a.team === t.team && Math.hypot(a.x - t.x, a.y - t.y) < 200) n++;
      dmg *= 1 - 0.06 * Math.min(3, n);
    }
    if (kdx != null && !(tOV && tOV.noKb)) this.knock(t, kdx, kdy, Math.min(300, dmg * 1.8 * (kmul || 1)) * (t.wheel ? 1.35 : t.foot ? 1.5 : 1), kup || 0);
    if (t.shield > 0) {
      const a = Math.min(t.shield, dmg);
      t.shield -= a; dmg -= a;
      if (t.shield <= 0) t.shieldT = 0;
      if (dmg <= 0) { this.ev(['hit', t.id, by ? by.id : 0, 1, 0]); return; }
    }
    if (this.obj.tr && this.obj.tr.carrier === t.id) dmg *= 0.75;
    if (by && by.pmul && by !== t) dmg *= by.pmul;   // 等级加成
    if (by && by.cubes && by !== t) dmg *= 1 + by.cubes * S.ESCAPE.crateDmg;   // 逃亡圈：空投箱
    if (this.tutorial && !t.bot) dmg = Math.min(dmg, Math.max(0, t.hp - 1));   // 教程里玩家不会倒下
    if (tOV && tOV.undying) dmg = Math.min(dmg, Math.max(0, t.hp - 1));         // 秦岳超载：老兵不死
    if (t.tal && t.tal.has('d5') && !t.foot && !t.d5used && dmg >= t.hp) { dmg = Math.max(0, t.hp - 1); t.d5used = true; t.invulnT = 1.5; this.ev(['blk', t.id]); }   // 天赋：不屈装甲
    t.hp -= dmg; t.lastHurt = this.time;
    // 打中敌人给大招充能
    if (by && by.team !== t.team && this.players.has(by.id) && !by.foot && !(by.spT > 0)) {
      const bo = by.ovT > 0 ? S.OVERLOADS[by.pilot] : null;
      by.sp = Math.min(S.WEAPONS[by.weapon].spNeed, by.sp + dmg * (by.pilot === 'candy' ? 1.3 : 1) * (by.tal.has('a3') ? 1.15 : 1) * (bo && bo.spGain ? bo.spGain : 1));
    }
    // 超载充能：突破 I 以后，每局一次
    if (by && by !== t && by.team !== t.team && by.bt >= 1 && !by.ovUsed && by.ovT <= 0 && this.players.has(by.id)) by.ov = Math.min(S.OV_NEED, by.ov + dmg * (by.tal.has('s3') ? 1.2 : 1));
    this.ev(['hit', t.id, by ? by.id : 0, 0, Math.round(dmg)]);
    if (t.hp <= 0) { if (t.foot) this.kill(t, by); else this.wreck(t, by); }
  }
  onTakedown(by) {
    if (!by || !this.players.has(by.id)) return;
    by.stats.kills++;
    if (by.pilot === 'blaze' && by.alive) by.hp = Math.min(this.maxHpOf(by), by.hp + this.maxHpOf(by) * 0.4);
    if (by.tal && by.tal.has('s4') && by.alive) by.hp = Math.min(this.maxHpOf(by), by.hp + 15);
  }
  // 机体被摧毁：驾驶员弹出，6 秒后在驾驶员所在位置空投新机体
  wreck(t, by) {
    const x = t.x, y = t.y, z = t.z;
    if (by && by !== t) this.onTakedown(by);
    this.paint(x, y, this.top(x, y), 55, by ? by.team : this.teams > 2 ? 0 : 3 - t.team, by && this.players.has(by.id) ? by : null);
    this.dropItems(t);
    t.foot = true; t.hp = S.PILOT_HP; t.rebuildT = this.oneLife ? 1e9 : S.REBUILD - (t.pilot === 'aurora' ? 2 : 0) - (t.tal && t.tal.has('d3') ? 1 : 0);   // 一条命的模式：机体不会重建
    t.charge = 0; t.burst = null; t.rollT = 0; t.spT = 0; t.spKind = null; t.shield = 0; t.shieldT = 0; t.quakeT = 0;
    const sh = (t.pilot === 'hammer' ? 35 : 0) + (t.tal && t.tal.has('d2') ? 25 : 0);   // 石磊被动 / 天赋：弹出护盾
    if (sh) { t.shield = sh; t.shieldT = 6; }
    t.invulnT = 0.7; t.ammo = S.AMMO; t.wheel = false;
    this.ev(['wreck', by ? by.id : 0, t.id, r1(x), r1(y), r1(z)]);
    if (t.pilot === 'vet') { this.explode(x, y, z, 100, 55, 26, t.team, t); this.ev(['bx', r1(x), r1(y), r1(z), t.team, 100, 0]); }
    this.knock(t, Math.random() - 0.5, Math.random() - 0.5, 150, 300);
  }
  redeploy(p) {
    p.foot = false; p.hp = p.maxHp; p.ammo = S.AMMO; p.invulnT = 1.0; p.rebuildT = 0; p.d5used = false;
    this.ev(['mdrop', p.id, r1(p.x), r1(p.y), r1(p.z)]);
    for (const t of this.players.values()) {
      if (!t.alive || t.team === p.team || Math.hypot(t.x - p.x, t.y - p.y) > 75) continue;
      this.hurt(t, 20, p, t.x - p.x, t.y - p.y, 6, 150);
    }
    this.paint(p.x, p.y, p.z, 60, p.team, p);
  }
  // 驾驶员被击倒：回基地复活
  kill(t, by) {
    t.alive = false; t.hp = 0; t.respawnT = this.oneLife ? 1e9 : S.KO_RESPAWN; t.stats.deaths++;
    if (this.oneLife) t.out = true;   // 出局：生死之战等下一局，逃亡圈直接淘汰
    t.charge = 0; t.burst = null; t.rollT = 0; t.spT = 0; t.spKind = null; t.shield = 0; t.shieldT = 0; t.foot = false;
    const team = by ? by.team : this.teams > 2 ? 0 : 3 - t.team;
    this.paint(t.x, t.y, this.top(t.x, t.y), 40, team, by && this.players.has(by.id) ? by : null);
    if (by && by !== t) this.onTakedown(by);
    t.sp = Math.floor(t.sp * 0.5);
    this.dropItems(t);
    this.ev(['kill', by ? by.id : 0, t.id, r1(t.x), r1(t.y), r1(t.z)]);
  }

  respawn(p) {
    const sp = this.spawns ? { x: this.spawns[p.team].x + (p.slot ? 34 : 0), y: this.spawns[p.team].y + (p.slot ? 20 : 0) } : S.spawnPoint(p.team, p.slot);
    p.x = sp.x; p.y = sp.y; p.z = 0; p.vx = p.vy = p.vz = 0; p.kx = p.ky = 0; p.onGround = true;
    p.foot = false; p.hp = p.maxHp; p.ammo = S.AMMO; p.alive = true; p.invulnT = 2.5; p.d5used = false;
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
  explode(x, y, z, r, maxD, minD, team, owner, noLos) {
    this.paint(x, y, z, r, team, owner);
    for (const t of this.players.values()) {
      if (!t.alive || t.team === team) continue;
      const d = Math.hypot(t.x - x, t.y - y, t.z + 18 - z - 10);
      if (d < r + S.R && (noLos || S.los3(this.M, x, y, z + 10, t.x, t.y, t.z + 18))) { const k = Math.max(0, 1 - d / (r + S.R)); this.hurt(t, minD + (maxD - minD) * k, owner, t.x - x, t.y - y, 1.6, 90 + 160 * k); }
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
    if (p.tal.has('s5')) for (const a of this.players.values()) if (a !== p && a.alive && a.team === p.team && dist(a, p) < 200) { a.shield = Math.max(a.shield, 30); a.shieldT = 4; }
    this.ev(['sp', p.id, p.spKind]);
    const a = p.input.a;
    switch (p.spKind) {
      case 'storm': p.spT = 0.8; p.spWave = 0; break;
      case 'bulldoze': {   // 一整排涂料墙
        p.spT = 0.3;
        const px = -Math.sin(a), py = Math.cos(a);
        for (let i = -4; i <= 4; i++) {
          const o = { x: p.x + px * i * 15, y: p.y + py * i * 15, z: p.z + 22, r: 18 };
          this.spawnProj(p, a, -0.02, 520, 430, 40, 30, 26, 12, o, { kb: 3.2 });
        }
        break;
      }
      case 'napalm': {
        p.spT = 0.3;
        const d = clamp(p.input.ad || 260, 80, 430);
        const sh = this.spawnShellRet(p, p.x + Math.cos(a) * d, p.y + Math.sin(a) * d, 30, 70, 0.8);
        sh.fire = true;
        break;
      }
      case 'swarm':
        p.spT = 0.3;
        for (let i = 0; i < 3; i++) this.helpers.push({ id: this.nextId++, kind: 'drone', x: p.x, y: p.y, z: p.z + 40, team: p.team, owner: p.id, t: 8, cd: 0.25 + i * 0.15, ang: (i * Math.PI * 2) / 3 });
        break;
      case 'whirl': p.spT = 2.2; break;
      case 'aegis': {
        p.spT = 0.3;
        const wx = p.x + Math.cos(a) * 46, wy = p.y + Math.sin(a) * 46;
        this.helpers.push({ id: this.nextId++, kind: 'wall', x: wx, y: wy, z: this.top(wx, wy), team: p.team, owner: p.id, t: 6, cd: 99, ang: a + Math.PI / 2, half: 70 });
        break;
      }
      case 'sonic':
        p.spT = 0.3;
        this.explode(p.x, p.y, p.z + 10, 230, 48, 26, p.team, p, true);
        this.ev(['bx', r1(p.x), r1(p.y), r1(p.z + 10), p.team, 230, 2]);
        break;
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
        for (const al of this.players.values()) {
          if (!al.alive || al.team !== p.team || dist(al, p) > 170) continue;
          al.shield = Math.max(al.shield, al === p ? 130 : 80); al.shieldT = 7;
        }
        break;
      }
      case 'barrage': {
        p.spT = 0.6;
        for (let i = 0; i < 6; i++) {
          const d = 110 + i * 62, s = (Math.random() - 0.5) * 30;
          this.spawnShell(p, p.x + Math.cos(a) * d - Math.sin(a) * s, p.y + Math.sin(a) * d + Math.cos(a) * s, 55, 58, 0.55 + i * 0.11);
        }
        break;
      }
      case 'quake': {
        const d = clamp(p.input.ad || 200, 80, 280);
        this.knock(p, Math.cos(a), Math.sin(a), Math.min(520, d * 2.1), 340);
        p.quakeT = 1.4; p.quakeArm = this.time + 0.3; p.invulnT = Math.max(p.invulnT, 0.5); p.spT = 0.3;
        break;
      }
    }
  }
  quakeSlam(p) {
    p.quakeT = 0;
    this.paint(p.x, p.y, p.z, 95, p.team, p);
    for (const t of this.players.values()) {
      if (!t.alive || t.team === p.team) continue;
      const d = Math.hypot(t.x - p.x, t.y - p.y);
      if (d < 95 + S.R && Math.abs(t.z - p.z) < 50) this.hurt(t, 80, p, t.x - p.x, t.y - p.y, 2.2, 220);
    }
    this.pushBall(p, p.x, p.y, 100, 1400);
    this.ev(['qk', r1(p.x), r1(p.y), r1(p.z), p.team]);
  }
  updateSpecial(p, dt) {
    p.spT -= dt;
    switch (p.spKind) {
      case 'storm': {
        const elapsed = 0.8 - p.spT;
        while (p.spWave < 3 && elapsed >= p.spWave * 0.35) {
          for (let i = 0; i < 18; i++) this.spawnProj(p, (i / 18) * Math.PI * 2 + p.spWave * 0.17, 0.12, 500, 280, 34, 24, 12, 8);
          this.paint(p.x, p.y, p.z, 70 + p.spWave * 15, p.team, p);
          p.spWave++;
        }
        break;
      }
      case 'whirl':
        this.paint(p.x, p.y, p.z, 46, p.team, p);
        for (const t of this.players.values()) {
          if (!t.alive || t.team === p.team || Math.hypot(t.x - p.x, t.y - p.y) > 112 || Math.abs(t.z - p.z) > 40) continue;
          if ((p.hitCd[t.id] || 0) > this.time) continue;
          p.hitCd[t.id] = this.time + 0.3;
          this.hurt(t, 17, p, t.x - p.x, t.y - p.y, 2.4, 80);
        }
        break;
      case 'charge':
        this.paint(p.x, p.y, p.z, 42, p.team, p);
        this.contactDamage(p, p.x, p.y, S.R + 30, 90, 0.4);
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
          if (v && !hitOnce.has(v.id)) { hitOnce.add(v.id); this.hurt(v, 150 * dt, p); }
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
        if (pr.ghost) {
          if (pr.t >= pr.ts || np.x < 0 || np.y < 0 || np.x > S.W || np.y > S.H) { const fg = Math.min(gh, 200); this.paint(np.x, np.y, fg, pr.splat, pr.team, owner); pr.x = np.x; pr.y = np.y; pr.z = fg; dead = true; break; }
        } else if (np.z <= gh) {
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
          if (pr.z - gh < 55 && pr.z >= gh) this.paint(pr.x, pr.y, gh, pr.trail, pr.team, owner);
        }
        // 敌方盾墙挡住子弹
        let blocked = false;
        for (const h of this.helpers) {
          if (h.kind !== 'wall' || h.team === pr.team || pr.z > h.z + 80) continue;
          const ux = Math.cos(h.ang), uy = Math.sin(h.ang), dx = pr.x - h.x, dy = pr.y - h.y, along = dx * ux + dy * uy, across = -dx * uy + dy * ux;
          if (Math.abs(along) <= h.half && Math.abs(across) < 9 + pr.size) { blocked = true; break; }
        }
        if (blocked) { dead = true; this.ev(['blk', 0, r1(pr.x), r1(pr.y), r1(pr.z)]); break; }
        const victim = this.hitPlayerAt(pr.team, pr.x, pr.y, pr.z, pr.size);
        if (victim) {
          const far = owner && owner.pilot === 'frost' && pr.t * Math.hypot(pr.vx, pr.vy) > pr.range * 0.6;
          this.hurt(victim, pr.dmg * (far ? 1.18 : 1), owner, pr.vx, pr.vy, pr.kb);
          if (pr.fx) this.sideFx(victim, pr.fx);
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
  // 逃亡圈：各队分散在地图四周的空地上
  escapeSpawns() {
    const out = [null], n = this.teams, cx = S.W / 2, cy = S.H / 2;
    const open = (x, y) => { for (const [dx, dy] of [[0, 0], [34, 20], [-20, 20], [20, -20]]) { const tx = x + dx, ty = y + dy; if (tx < 30 || ty < 30 || tx > S.W - 30 || ty > S.H - 30 || this.top(tx, ty) !== 0) return false; } return true; };
    const a0 = Math.random() * Math.PI * 2;
    for (let t = 1; t <= n; t++) {
      const a = a0 + ((t - 1) / n) * Math.PI * 2;
      let best = null;
      for (let k = 0; k < 400 && !best; k++) {
        const rr = 0.38 + (k % 20) * 0.006, aa = a + (Math.floor(k / 20) % 2 ? 1 : -1) * Math.floor(k / 40) * 0.05;
        const x = cx + Math.cos(aa) * S.W * rr, y = cy + Math.sin(aa) * S.H * rr;
        if (open(x, y)) best = { x, y };
      }
      out.push(best || S.spawnPoint(t % 2 ? 1 : 2, 0));
    }
    return out;
  }
  aliveOf(team) { let n = 0; for (const p of this.players.values()) if (p.team === team && p.alive && !p.out) n++; return n; }
  spawnCrate() {
    const c = this.obj.circle;
    for (let k = 0; k < 60; k++) {
      const a = Math.random() * Math.PI * 2, rr = Math.sqrt(Math.random()) * Math.max(60, c.r * 0.85);
      const x = clamp(c.x + Math.cos(a) * rr, 40, S.W - 40), y = clamp(c.y + Math.sin(a) * rr, 40, S.H - 40);
      const z = this.top(x, y);
      if (z < 200 && !this.M.solid[Math.floor(y / S.CELL) * S.GW + Math.floor(x / S.CELL)]) { this.obj.crates.push({ id: this.nextId++, x, y, z }); return; }
    }
  }
  // 生死之战：新一局（所有人复活、清场，保留大招一半充能）
  resetRound() {
    const o = this.obj;
    o.roundT = S.ELIM.roundTime; o.round++;
    this.projs = []; this.shells = []; this.helpers = []; this.bombs = []; this.missiles = [];
    for (const p of this.players.values()) {
      p.out = false; p.alive = true; p.foot = false; p.spT = 0; p.spKind = null; p.ovT = 0; p.shield = 0; p.shieldT = 0;
      p.sp = Math.floor(p.sp * 0.5); p.skillUses = S.SKILL_USES + (p.tal.has('s2') ? 1 : 0); p.skillCd = 0; p.rebuildT = 0;
      this.respawn(p); p.invulnT = 2;
    }
    this.ev(['rs', o.round]);
  }
  initMode() {
    const o = (this.obj = { score: [0, 0, 0], resetT: 0 });
    switch (this.mode) {
      case 'elim': o.wins = [0, 0, 0]; o.round = 1; o.pause = 0; o.roundT = S.ELIM.roundTime; this.timeLeft = o.roundT; break;
      case 'escape4': case 'escape8': {
        const R0 = Math.hypot(S.W, S.H) / 2 + 40;
        o.circle = { x: S.W / 2, y: S.H / 2, r: R0, R0, from: null, to: { x: S.W / 2, y: S.H / 2, r: R0 }, stage: 0, phase: 0, t: S.ESCAPE.stages[0][0] };
        o.crates = []; o.crateT = 15; o.elim = []; o.dmgT = 0;
        for (let i = 0; i < 10; i++) this.spawnCrate();
        this.timeLeft = 360; break;
      }
      case 'zone': o.owner = 0; o.count = [0, 100, 100]; o.share = [0, 0, 0]; break;
      case 'escort': o.tr = { x: S.W / 2, y: S.H / 2, z: this.top(S.W / 2, S.H / 2), carrier: 0, resetT: 0 }; break;
      case 'soccer': o.ball = { x: S.W / 2, y: S.H / 2, vx: 0, vy: 0, r: 26, last: 0, acc: 0 }; break;
      case 'battery': o.bats = []; o.batT = 2; o.batId = 1; break;
    }
  }

  updateMode(dt) {
    const o = this.obj;
    switch (this.mode) {
      case 'elim': {
        if (o.pause > 0) {
          o.pause -= dt; this.timeLeft = S.ELIM.roundTime;
          if (o.pause <= 0) this.resetRound();
          break;
        }
        o.roundT -= dt; this.timeLeft = Math.max(0.05, o.roundT);
        const a = this.aliveOf(1), b = this.aliveOf(2);
        if (a && b && o.roundT > 0) break;
        // 一局结束：剩下的人多的一方赢；时间到且人数相同，比剩余生命
        let w = a > b ? 1 : b > a ? 2 : 0;
        if (!w) { let ha = 0, hb = 0; for (const p of this.players.values()) if (p.alive && !p.out) { if (p.team === 1) ha += p.hp / this.maxHpOf(p); else hb += p.hp / this.maxHpOf(p); } w = ha >= hb ? 1 : 2; }
        o.wins[w]++;
        this.ev(['rd', w, o.wins[1], o.wins[2], o.round]);
        if (o.wins[w] >= S.ELIM.wins) { this.finish(w); break; }
        o.pause = S.ELIM.pause;
        for (const p of this.players.values()) p.invulnT = S.ELIM.pause + 2;
        break;
      }
      case 'escape4': case 'escape8': {
        const c = o.circle, ST = S.ESCAPE.stages;
        c.t -= dt;
        if (c.phase === 0 && c.t <= 0 && c.stage < ST.length) {
          const [, shrink, ratio] = ST[c.stage], nr = Math.max(50, c.R0 * ratio), room = Math.max(0, c.r - nr) * 0.8, a = Math.random() * Math.PI * 2, d = Math.random() * room;
          c.from = { x: c.x, y: c.y, r: c.r };
          c.to = { x: clamp(c.x + Math.cos(a) * d, nr * 0.5 + 60, S.W - nr * 0.5 - 60), y: clamp(c.y + Math.sin(a) * d, nr * 0.5 + 60, S.H - nr * 0.5 - 60), r: nr };
          c.phase = 1; c.t = shrink; c.T = shrink;
          this.ev(['cz', c.stage]);
        } else if (c.phase === 1) {
          const k = clamp(1 - c.t / c.T, 0, 1);
          c.x = c.from.x + (c.to.x - c.from.x) * k; c.y = c.from.y + (c.to.y - c.from.y) * k; c.r = c.from.r + (c.to.r - c.from.r) * k;
          if (c.t <= 0) { c.stage++; c.phase = c.stage < ST.length ? 0 : 2; c.t = c.stage < ST.length ? ST[c.stage][0] : 0; }
        }
        // 圈外伤害（每 0.5 秒结算一次）
        o.dmgT -= dt;
        if (o.dmgT <= 0) {
          o.dmgT = 0.5;
          const dps = ST[Math.min(ST.length - 1, c.stage)][3];
          for (const p of this.players.values()) if (p.alive && !p.out && Math.hypot(p.x - c.x, p.y - c.y) > c.r) { p.invulnT = 0; this.hurt(p, dps * 0.5, null); }
        }
        // 空投箱
        o.crateT -= dt;
        if (o.crateT <= 0) { o.crateT = 16; this.spawnCrate(); this.spawnCrate(); this.ev(['cr']); }
        o.crates = o.crates.filter((k) => {
          for (const p of this.players.values()) {
            if (!p.alive || p.out || Math.hypot(p.x - k.x, p.y - k.y) > 28 || Math.abs(p.z - k.z) > 40) continue;
            p.cubes = Math.min(S.ESCAPE.maxCubes, (p.cubes || 0) + 1);
            p.stats.cubes = (p.stats.cubes || 0) + 1;
            if (!p.foot) { const add = Math.round(p.maxHp * S.ESCAPE.crateHp); p.maxHp += add; }
            p.hp = Math.min(this.maxHpOf(p), p.hp + S.ESCAPE.crateHeal);
            this.ev(['crt', p.id, r1(k.x), r1(k.y), r1(k.z), p.cubes]);
            return false;
          }
          return true;
        });
        // 淘汰与名次
        let alive = [];
        for (let t = 1; t <= this.teams; t++) {
          const n = this.aliveOf(t);
          if (n) alive.push(t);
          else if (!o.elim.includes(t) && [...this.players.values()].some((p) => p.team === t)) { o.elim.push(t); this.ev(['tout', t, this.teams - o.elim.length + 1]); }
        }
        if (alive.length <= 1) this.finish(alive[0] || o.elim[o.elim.length - 1]);
        break;
      }
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
      case 'elim': return [o.wins[1], o.wins[2], o.round, Math.ceil(o.pause * 10), this.aliveOf(1), this.aliveOf(2)];
      case 'escape4': case 'escape8': {
        const c = o.circle, flat = [];
        for (const k of o.crates) flat.push(k.id, r1(k.x), r1(k.y), r1(k.z));
        let teamsAlive = 0, people = 0;
        for (let t = 1; t <= this.teams; t++) { const n = this.aliveOf(t); if (n) teamsAlive++; people += n; }
        return [r1(c.x), r1(c.y), r1(c.r), r1(c.to.x), r1(c.to.y), r1(c.to.r), c.phase, Math.ceil(c.t), teamsAlive, people, flat];
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
      if (p.rollT > 0 || (p.spT > 0 && p.spKind === 'charge')) flags |= 32;
      if (this.obj.tr && this.obj.tr.carrier === p.id) flags |= 64;
      if (p.spT > 0) flags |= 128;
      if (p.sp >= W.spNeed) flags |= 256;
      if (p.foot) flags |= 512;
      const buffs = (p.rushT > 0 ? 1 : 0) | (p.slowT > 0 ? 2 : 0) | (p.silenceT > 0 ? 4 : 0) | (p.smokeT > 0 ? 8 : 0) | (p.odN > 0 ? 16 : 0) | (p.quakeT > 0 ? 32 : 0)
        | (p.ovT > 0 ? 64 : 0) | (p.rallyT > 0 ? 128 : 0) | (p.revealT > 0 ? 256 : 0);
      pl.push([p.id, r1(p.x), r1(p.y), r2(p.input.a), Math.ceil(p.hp), Math.round(p.ammo * 100), Math.round(p.sp), flags,
        Math.ceil((p.foot ? p.rebuildT : p.respawnT) * 10), p.carry, Math.round(p.sm * 100), Math.round(p.charge * 100), r1(p.shield), p.sync,
        r1(p.vx + (p.kx || 0)), r1(p.vy + (p.ky || 0)), S.SPECIAL_IDS.indexOf(p.spKind), r1(p.z), r2(p.input.pt), Math.round(p.vz || 0),
        this.maxHpOf(p), p.skillUses, Math.ceil(p.skillCd * 10), buffs,
        Math.round((p.ov / S.OV_NEED) * 100), Math.ceil(p.ovT * 10), (p.bt >= 1 ? 1 : 0) | (p.ovUsed ? 2 : 0)]);
    }
    const msg = { t: 's', k: this.tick, tl: Math.max(0, Math.round(this.timeLeft * 10) / 10), cd: Math.max(0, Math.round(this.countdown * 10) / 10), p: pl, d: this.diff, e: this.events, o: this.objState(),
      rv: [0, this.reveal[1] > this.time ? 1 : 0, this.reveal[2] > this.time ? 1 : 0],
      h: this.helpers.map((h) => [h.id, h.kind, r1(h.x), r1(h.y), r1(h.z), h.team, h.ang != null ? r2(h.ang) : 0]).concat(this.obj.crates ? this.obj.crates.map((k) => [k.id, 'crate', r1(k.x), r1(k.y), r1(k.z), 0]) : []) };
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
    if (winner == null && S.isEscape(this.mode)) {   // 逃亡圈超时：活着的人最多的队伍赢
      let best = 0, bn = -1;
      for (let t = 1; t <= this.teams; t++) { const n = this.aliveOf(t); if (n > bn) { bn = n; best = t; } }
      winner = best; reason = 'time';
    }
    if (winner == null) {
      reason = 'time';
      if (this.mode === 'turf') winner = byTurf;
      else if (this.mode === 'zone') winner = o.count[1] < o.count[2] ? 1 : o.count[2] < o.count[1] ? 2 : byTurf;
      else winner = o.score[1] > o.score[2] ? 1 : o.score[2] > o.score[1] ? 2 : byTurf;
      if (this.mode !== 'turf' && ((this.mode === 'zone' && o.count[1] === o.count[2]) || (this.mode !== 'zone' && o.score[1] === o.score[2]))) reason = 'turf';
    }
    const result = {
      mode: this.mode, map: this.mapIdx, winner, reason, turf: [pa, pb], score: o.score.slice(),
      count: o.count ? o.count.map((c) => Math.ceil(c)) : null, colorSet: this.colorSet, teams: this.teams,
      rounds: o.wins ? o.wins.slice() : null,
      place: o.elim ? [winner, ...o.elim.slice().reverse().filter((t) => t !== winner)] : null,
      players: [...this.players.values()].map((p) => ({ id: p.id, name: p.name, team: p.team, weapon: p.weapon, head: p.head, pilot: p.pilot, bot: p.bot, ...p.stats })),
    };
    this.result = result;
    if (this.room.manual) return;
    this.sendSnapshot();
    this.room.broadcast({ t: 'over', winner });
    setTimeout(() => { if (this.room.game === this) this.room.onGameEnd(result); }, 3000);
  }

  stop() { this.over = true; if (this.interval) clearInterval(this.interval); }
  // 比赛还没结束时的临时结算（逃亡圈提前退出用）：还活着的队伍排前面，已淘汰的按淘汰顺序倒排
  partialResult() {
    const o = this.obj, alive = [];
    for (let t = 1; t <= this.teams; t++) if (this.aliveOf(t)) alive.push(t);
    alive.sort((a, b) => this.aliveOf(b) - this.aliveOf(a));
    const place = [...alive, ...o.elim.slice().reverse()];
    const turf = S.countTurf(this.grid, this.M);
    return {
      mode: this.mode, map: this.mapIdx, winner: place[0], reason: 'early', turf: [turf.a / turf.tot, turf.b / turf.tot], score: o.score.slice(), count: null,
      colorSet: this.colorSet, teams: this.teams, rounds: null, place,
      players: [...this.players.values()].map((p) => ({ id: p.id, name: p.name, team: p.team, weapon: p.weapon, head: p.head, pilot: p.pilot, bot: p.bot, ...p.stats })),
    };
  }
}

// =====================================================================
// AI 机器人
// =====================================================================
function aimAt(p, tx, ty, tz) {
  const d = Math.hypot(tx - p.x, ty - p.y);
  return { a: Math.atan2(ty - p.y, tx - p.x), pt: Math.atan2(tz - (p.z + S.MUZZLE), d) + d * 0.00011, d };
}
// AI 能否看见敌人：草丛 / 隐身的敌人只有靠近或全队被扫描时才看得见
function botSees(g, p, e, d) {
  if (!e.hidden || g.reveal[p.team] > g.time) return true;
  return d < (p.pilot === 'hex' ? 170 : S.BUSH_DETECT);
}
function botThink(g, p, dt) {
  const inp = p.input;
  if (!p.alive) { inp.f = false; inp.w = false; p.ai = null; return; }
  if (g.tutorial) { inp.mx = 0; inp.my = 0; inp.f = false; inp.w = false; return; }   // 训练靶：站着不动
  const ai = p.ai || (p.ai = { goal: null, path: [], pi: 0, replan: 0, stuckT: 0, lastX: p.x, lastY: p.y, wob: rand(0, 6), strafe: 1, strafeT: 0, jumpT: rand(1, 4), react: rand(0.15, 0.35), seenT: 0, paintT: rand(0.5, 2) });
  const W = S.WEAPONS[p.weapon];
  const SA = p.foot ? S.sidearm(p.pilot) : null;
  const range = p.foot ? SA.range : S.weaponRange(p.weapon);
  ai.replan -= dt;

  let enemy = null, ed = Infinity;
  for (const e of g.players.values()) {
    if (!e.alive || e.team === p.team) continue;
    const d = Math.hypot(e.x - p.x, e.y - p.y, e.z - p.z);
    if (!botSees(g, p, e, d)) continue;
    const lobber = p.foot ? SA.kind === 'lob' || SA.ghost : p.weapon === 'mortar';
    if (d < range + 160 && d < ed && (lobber || S.los3(g.M, p.x, p.y, p.z + S.MUZZLE, e.x, e.y, e.z + 18))) { enemy = e; ed = d; }
  }
  ai.seenT = enemy ? ai.seenT + dt : 0;

  // 防挂机：1 秒内几乎没挪动（顶着墙原地踏步，或者站在目标点发呆）→ 侧移 + 跳一下，换一个新目标
  ai.stuckT += dt;
  if (ai.stuckT > 1.0) {
    const moved = Math.hypot(p.x - ai.lastX, p.y - ai.lastY);
    if (moved < 18 && !(enemy && ed < range * 1.1)) {
      ai.replan = 0; ai.forceRandom = true;
      ai.unstickT = 0.45; ai.unstickA = Math.random() * Math.PI * 2;
      inp.j = true;
    }
    ai.stuckT = 0; ai.lastX = p.x; ai.lastY = p.y;
  }
  // 来回踱步检测：2.5 秒里走了不少路，位置却几乎没变（在原地走来走去）→ 去远一点的地方，并且锁定这个目标一会儿
  ai.chkT = (ai.chkT || 0) + dt;
  if (ai.chkT > 2.5) {
    if (ai.chkX != null && Math.hypot(p.x - ai.chkX, p.y - ai.chkY) < 70 && !enemy) {
      ai.forceRandom = true; ai.replan = 0; ai.lockT = 2.5;
    }
    ai.chkT = 0; ai.chkX = p.x; ai.chkY = p.y;
  }
  if (ai.lockT > 0) ai.lockT -= dt;
  // 走到目标点、附近又没有敌人：马上去下一个地方，不站着
  if (ai.goal && !enemy && dist(p, ai.goal) < 30 && ai.replan > 0.15) { ai.replan = 0.15; ai.lockT = 0; }

  if ((ai.replan <= 0 && !(ai.lockT > 0 && !enemy)) || !ai.goal) {
    ai.replan = rand(0.5, 0.9);
    // 弹出的驾驶员：没有危险时认准原来的目标，走到为止（不然每次换一个方向，就在原地走来走去）
    const threat = p.foot && [...g.players.values()].some((e) => e.alive && !e.out && e.team !== p.team && dist(e, p) < 450);
    const keep = p.foot && !threat && !ai.forceRandom && ai.goal && ai.goal.calm && !ai.goal.near && dist(p, ai.goal) > 40;
    if (!keep) ai.goal = ai.forceRandom ? randomGoal(g, p) : p.foot ? fleeGoal(g, p) : chooseGoal(g, p);
    ai.forceRandom = false;
    if (ai.goal.calm) ai.replan = ai.goal.near ? 0.4 : 1.6;   // 没有危险时认准一个目标走过去，不来回改主意
    ai.path = findPath(g.nav, p.x, p.y, ai.goal.x, ai.goal.y);
    ai.pi = 0;
    // 目标点走不到（路径在半路就结束了）：把路径终点当成目标，到了就换下一个，不要顶着墙来回走
    const end = ai.path[ai.path.length - 1];
    if (end && Math.hypot(end.x - ai.goal.x, end.y - ai.goal.y) > 60) ai.goal = Object.assign({}, ai.goal, { x: end.x, y: end.y });
  }

  let tx = ai.goal.x, ty = ai.goal.y;
  if (ai.path.length) {
    while (ai.pi < ai.path.length && dist(p, ai.path[ai.pi]) < 20) ai.pi++;
    if (ai.pi + 1 < ai.path.length && floorLos(g.M, p.x, p.y, ai.path[ai.pi + 1].x, ai.path[ai.pi + 1].y, p.z)) ai.pi++;
    if (ai.pi < ai.path.length) { tx = ai.path[ai.pi].x; ty = ai.path[ai.pi].y; }
    else if (dist(p, ai.goal) > 40 && !enemy) ai.replan = 0;   // 路走完了却没到：马上重新规划
  }
  let mx = tx - p.x, my = ty - p.y;
  const dl = Math.hypot(mx, my);
  if (dl > 8) { mx /= dl; my /= dl; } else { mx = 0; my = 0; }
  if (ai.unstickT > 0) { ai.unstickT -= dt; mx = Math.cos(ai.unstickA); my = Math.sin(ai.unstickA); }
  // 跟在队友身边的驾驶员：绕着队友慢慢转，而不是站桩
  if (p.foot && ai.goal && ai.goal.near && dist(p, ai.goal) < 60) {
    ai.orbit = (ai.orbit || (Math.random() < 0.5 ? 1 : -1));
    const a = Math.atan2(p.y - ai.goal.y, p.x - ai.goal.x) + ai.orbit * 0.6;
    const ox = ai.goal.x + Math.cos(a) * 48 - p.x, oy = ai.goal.y + Math.sin(a) * 48 - p.y, ol = Math.hypot(ox, oy) || 1;
    mx = (ox / ol) * 0.75; my = (oy / ol) * 0.75;
  }

  const gh = S.topAt(g.M, p.x, p.y);
  const onOwn = p.z <= gh + 1 && S.cellAt(g.grid, p.x, p.y) === p.team;
  const hpK = p.hp / g.maxHpOf(p);
  let wantAtk = false, hold = false;
  let aim = { a: mx || my ? Math.atan2(my, mx) : inp.a, pt: -0.05 };
  inp.ad = 220;

  // 近战机体从更远处就开始冲上去（不然只会等敌人走到脸上）
  const melee = !p.foot && (W.attack === 'punch' || p.weapon === 'roller' || p.weapon === 'bucket' || p.weapon === 'dozer' || p.weapon === 'flamer');
  const engage = melee ? Math.max(range * 1.05, 300) : range * 1.05;
  if (enemy && ed < engage && ai.seenT > ai.react) {
    const lead = ed / 650;
    aim = aimAt(p, enemy.x + enemy.vx * lead * 0.6, enemy.y + enemy.vy * lead * 0.6, enemy.z + 16);
    aim.a += (Math.random() - 0.5) * 0.18; aim.pt += (Math.random() - 0.5) * 0.06;
    inp.ad = ed;
    wantAtk = ed < range * 1.1;
    ai.strafeT -= dt;
    if (ai.strafeT <= 0) { ai.strafeT = rand(0.4, 1.1); ai.strafe = Math.random() < 0.5 ? -1 : 1; }
    const ea = Math.atan2(enemy.y - p.y, enemy.x - p.x);
    if (p.foot) {
      // 驾驶员：拿近战武器的冲上去，其他的边退边打
      if (SA.kind === 'melee' && (hpK > 0.45 || ed < 90)) { mx = Math.cos(ea) + Math.cos(ea + Math.PI / 2) * ai.strafe * 0.3; my = Math.sin(ea) + Math.sin(ea + Math.PI / 2) * ai.strafe * 0.3; }
      else { mx = -Math.cos(ea) * 0.7 + Math.cos(ea + Math.PI / 2) * ai.strafe * 0.6; my = -Math.sin(ea) * 0.7 + Math.sin(ea + Math.PI / 2) * ai.strafe * 0.6; }
    } else if (melee) { mx = Math.cos(ea) + Math.cos(ea + Math.PI / 2) * ai.strafe * 0.35; my = Math.sin(ea) + Math.sin(ea + Math.PI / 2) * ai.strafe * 0.35; }
    else if (p.weapon === 'charger') { mx = Math.cos(ea + Math.PI / 2) * ai.strafe * 0.5; my = Math.sin(ea + Math.PI / 2) * ai.strafe * 0.5; }
    else {
      const want = p.weapon === 'mortar' ? 0.75 : 0.55;
      const back = ed < range * want ? -0.6 : 0.3;
      mx = Math.cos(ea) * back + Math.cos(ea + Math.PI / 2) * ai.strafe * 0.8;
      my = Math.sin(ea) * back + Math.sin(ea + Math.PI / 2) * ai.strafe * 0.8;
    }
    if (g.mode === 'escort' && g.obj.tr.carrier === p.id) { const a2 = Math.atan2(ty - p.y, tx - p.x); mx = Math.cos(a2); my = Math.sin(a2); }
    if (!p.foot && hpK < 0.3 && enemy.hp > p.hp) { mx = -Math.cos(ea); my = -Math.sin(ea); }   // 残血撤退
    ai.jumpT -= dt;
    if (ai.jumpT <= 0) { ai.jumpT = rand(1.2, 3.5); inp.j = true; }
  } else if (!p.foot) {
    // 没有敌人：边走边涂地
    ai.wob += dt * 2.2;
    aim.a += Math.sin(ai.wob) * 0.6;
    ai.paintT -= dt;
    if (ai.paintT <= 0 && p.ammo > 2.2) { wantAtk = true; ai.paintT = rand(0.6, 1.6); inp.ad = rand(150, 320); }
    if (g.mode === 'soccer' && g.obj.resetT <= 0) {
      const b = g.obj.ball, bd = dist(p, b);
      const gx = p.team === 1 ? S.W : 0;
      const toGoal = Math.atan2(S.H / 2 - b.y, gx - b.x), toBall = Math.atan2(b.y - p.y, b.x - p.x);
      let diff = Math.abs(toGoal - toBall); if (diff > Math.PI) diff = Math.PI * 2 - diff;
      if (bd < Math.min(range, 380) && diff < 0.9 && S.los3(g.M, p.x, p.y, p.z + S.MUZZLE, b.x, b.y, b.r)) { aim = aimAt(p, b.x, b.y, b.r); wantAtk = p.ammo >= 1; inp.ad = bd; }
    }
  }

  let wheel = false;
  if (!p.foot && !enemy && onOwn && (p.ammo < 1.5 || (dl > 260 && p.ammo < 2.8))) { wheel = true; wantAtk = false; }
  if (!p.foot && p.carry >= 3 && onOwn && !enemy) { wheel = true; wantAtk = false; }

  if (W.attack === 'charge' && !p.foot) {
    hold = wantAtk && p.ammo >= 1 && p.charge < (enemy ? 0.92 : 0.4);
    inp.f = hold;
  } else {
    inp.f = false;
    if (wantAtk && p.ammo >= 1 && p.atkCd <= 0 && !p.burst && Math.random() < 0.5) inp.aq++;
  }

  inp.w = wheel;
  inp.mx = mx; inp.my = my; inp.a = aim.a; inp.pt = clamp(aim.pt, -1.2, 1.2);

  // 大招
  if (!p.foot && p.sp >= W.spNeed && p.spT <= 0) {
    const sp = W.special;
    const reach = { beam: 700, missiles: 1e9, storm: 220, bubble: 260, charge: 260, barrage: 420, quake: 260, bulldoze: 380, napalm: 420, swarm: 420, whirl: 200, sonic: 220, aegis: 320 }[sp];
    if ((enemy && ed < reach) || sp === 'missiles' || Math.random() < 0.002) {
      inp.qq++;
      if (enemy) { const a2 = aimAt(p, enemy.x, enemy.y, enemy.z + 16); inp.a = a2.a; inp.pt = a2.pt; inp.ad = ed; }
    }
  }
  // 超载：充满了就在交战时放
  if (p.bt >= 1 && !p.ovUsed && p.ov >= S.OV_NEED && enemy && ed < 320 && Math.random() < 0.1) inp.oq++;
  // 驾驶员技能
  if (p.skillUses > 0 && p.skillCd <= 0 && Math.random() < 0.04) {
    const sk = S.pilot(p.pilot).skill;
    const fight = enemy && ed < 300;
    const use = {
      rush: fight || p.foot, scan: !enemy && Math.random() < 0.05, cheer: hpK < 0.6, guard: fight && hpK < 0.75, smoke: (fight && hpK < 0.5) || p.foot,
      turret: fight, dash: (p.foot && enemy) || (p.weapon === 'fist' && enemy && ed < 260 && ed > 90), emp: enemy && ed < 160, bento: hpK < 0.55, overdrive: fight && p.ammo < 1, drone: fight,
      rally: fight, blast: enemy && ed < 200, jam: enemy && ed < 210, flash: enemy && ed < 220,
    }[sk];
    if (use) {
      if (sk === 'dash' && enemy && !p.foot) { inp.mx = Math.cos(aim.a); inp.my = Math.sin(aim.a); }
      inp.gq++;
    }
  }
}
// 弹出的驾驶员：躲开敌人，等新机体空投
function fleeGoal(g, p) {
  let ex = 0, ey = 0, n = 0;
  for (const e of g.players.values()) if (e.alive && !e.out && e.team !== p.team && dist(e, p) < 450) { ex += e.x; ey += e.y; n++; }
  if (!n) {
    // 附近没有敌人：跑去最近的、还有机体的队友身边（抱团等空投），没有队友就躲进草丛
    let best = null, bd = Infinity;
    for (const a of g.players.values()) if (a !== p && a.alive && !a.out && !a.foot && a.team === p.team) { const d = dist(a, p); if (d < bd) { bd = d; best = a; } }
    if (best && bd > 70) return { x: best.x + rand(-30, 30), y: best.y + rand(-30, 30), calm: true };
    if (best) return { x: best.x, y: best.y, calm: true, near: true };
    const M = g.M;
    for (let k = 0; k < 40; k++) {
      const i = randInt(S.GW * S.GH);
      if (M.bush[i] === 1) { const x = (i % S.GW + 0.5) * S.CELL, y = (Math.floor(i / S.GW) + 0.5) * S.CELL; if (Math.hypot(x - p.x, y - p.y) < 700) return { x, y, calm: true }; }
    }
    return Object.assign(randomGoal(g, p), { calm: true });
  }
  ex /= n; ey /= n;
  const dx = p.x - ex, dy = p.y - ey, l = Math.hypot(dx, dy) || 1;
  for (let k = 0; k < 12; k++) {
    const d = 200 + k * 20, a = Math.atan2(dy, dx) + (Math.random() - 0.5) * 1.2;
    const x = clamp(p.x + Math.cos(a) * d, 40, S.W - 40), y = clamp(p.y + Math.sin(a) * d, 40, S.H - 40);
    if (S.topAt(g.M, x, y) === 0) return { x, y };
  }
  return S.basePos(p.team);
}

function randomGoal(g, p) {
  // 优先选 180–600 远的平地（太近的话等于原地打转）；逃亡圈里只在安全区内选
  const c = g.obj && g.obj.circle, safe = c && (c.to || c);
  for (let k = 0; k < 40; k++) {
    const x = (randInt(S.GW) + 0.5) * S.CELL, y = (randInt(S.GH) + 0.5) * S.CELL, d = Math.hypot(x - p.x, y - p.y);
    if (safe && Math.hypot(x - safe.x, y - safe.y) > safe.r * 0.8) continue;
    if (S.topAt(g.M, x, y) === 0 && d > (k < 30 ? 180 : 60) && d < 600) return { x, y };
  }
  return { x: S.W / 2, y: S.H / 2 };
}

function chooseGoal(g, p) {
  const o = g.obj;
  switch (g.mode) {
    case 'escape4': case 'escape8': {
      const c = o.circle, safe = c.to || c;
      if (Math.hypot(p.x - safe.x, p.y - safe.y) > safe.r * 0.75) return { x: clamp(safe.x + rand(-40, 40), 40, S.W - 40), y: clamp(safe.y + rand(-40, 40), 40, S.H - 40) };
      let best = null, bd = 520;
      for (const k of o.crates) { const d = Math.hypot(k.x - p.x, k.y - p.y); if (d < bd && Math.hypot(k.x - safe.x, k.y - safe.y) < safe.r) { bd = d; best = { x: k.x, y: k.y }; } }
      if (best) return best;
      const a = rand(0, Math.PI * 2), rr = rand(0, safe.r * 0.6);
      return { x: clamp(safe.x + Math.cos(a) * rr, 40, S.W - 40), y: clamp(safe.y + Math.sin(a) * rr, 40, S.H - 40) };
    }
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
    if (g.M.solid[i] || g.M.pad[i]) continue;
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
    this.settings = { mode: 'turf', map: -1, duration: 180, teamSize: 3, bots: true, fair: false };
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
    // 逃亡圈：已淘汰的玩家提前退出 → 按当前名次结算（名次已经确定了）
    const g0 = this.game, p0 = g0 && g0.players.get(c.id);
    if (g0 && S.isEscape(g0.mode) && p0 && p0.out && !g0.over) {
      const result = g0.partialResult();
      c.conn.send({ t: 'end', result, early: true });
      if (this.hub && this.hub.accounts) this.hub.accounts.applyResult(c, result);
    }
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
      players: [...this.members.values()].map((c) => ({ id: c.id, name: c.name, team: c.team, weapon: c.weapon, head: c.head, pilot: c.pilot, level: c.level, lv: c.power ? c.power.lv : 1 })),
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
    if (typeof m.fair === 'boolean') s.fair = m.fair;
    if (typeof m.tutorial === 'boolean' && this.hub && this.hub.local) s.tutorial = m.tutorial;   // 只有浏览器里的本机服务器能开教程
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
    const acc = this.hub && this.hub.accounts;
    if (acc) for (const c of this.members.values()) acc.applyResult(c, result);
    this.colorSet = (this.colorSet + 1 + randInt(S.COLOR_SETS.length - 1)) % S.COLOR_SETS.length;
    this.broadcastLobby();
  }
}

function sanitizeName(n) {
  n = String(n || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 12);
  return n || '机兵' + randInt(1000);
}
function cleanTal(t) { return Array.isArray(t) ? [...new Set(t)].filter((id) => S.talent(id)).slice(0, S.TALENT_SLOTS) : []; }
function setProfile(c, m) {
  if (m.name !== undefined) c.name = sanitizeName(m.name);
  if (m.weapon in S.WEAPONS) c.weapon = m.weapon;
  if (S.HEADS.some((h) => h.id === m.head)) c.head = m.head;
  if (S.PILOTS.some((p) => p.id === m.pilot)) c.pilot = m.pilot;
  if (Number.isInteger(m.level)) c.level = clamp(m.level, 1, 999);
  // 没登录在线账号（本机 / P2P）时相信客户端报的角色等级
  if (m.looks && typeof m.looks === 'object') {   // 皮肤只影响外观；本机 / P2P 时相信客户端
    const L = {};
    for (const k of ['pskin', 'paint', 'fx', 'frame', 'avatar']) { const K = S.skin(m.looks[k]); if (K && (k === 'pskin' ? K.kind === 'pilot' && K.pilot === c.pilot : K.kind === { paint: 'mech', fx: 'fx', frame: 'frame', avatar: 'avatar' }[k])) L[k] = K.id; }
    c.looks = L;
  }
  if (m.power && typeof m.power === 'object') c.power = { lv: clamp(m.power.lv | 0 || 1, 1, E.MAX_LV), bt: clamp(m.power.bt | 0, 0, 2), tal: cleanTal(m.power.tal) };
}

function handle(hub, c, m) {
  if (!m || typeof m.t !== 'string') return;
  const r = c.room;
  switch (m.t) {
    case 'hello': if (!c.acct) setProfile(c, m); c.conn.send({ t: 'caps', accounts: !!hub.accounts }); break;
    case 'auth': if (hub.accounts) hub.accounts.handle(c, m); else c.conn.send({ t: 'auth', ok: false, op: m.op, err: '这里没有账号服务器' }); break;
    case 'saveProfile': if (hub.accounts) hub.accounts.saveProfile(c, m); break;
    case 'eco': if (hub.accounts) hub.accounts.eco(c, m); else c.conn.send({ t: 'eco', op: m.op, req: m.req, ok: false, err: '这里没有账号服务器' }); break;
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
    case 'tut': {   // 教程脚本：充满大招 / 打爆机体（练习弹出驾驶员）
      const g = r && r.game, p = g && g.tutorial && g.players.get(c.id);
      if (!p) break;
      if (m.op === 'sp' && p.alive && !p.foot) p.sp = S.WEAPONS[p.weapon].spNeed;
      if (m.op === 'wreck' && p.alive && !p.foot) g.wreck(p, null);
      break;
    }
    case 'team': {
      if (!r || r.state !== 'lobby') return;
      const t = m.team === 2 ? 2 : 1;
      if (t !== c.team && r.teamCount(t) >= S.MAX_PER_TEAM) return c.conn.send({ t: 'err', msg: '该队伍已满' });
      c.team = t; r.broadcastLobby();
      break;
    }
    case 'loadout': if (!c.acct) setProfile(c, m); if (r) r.broadcastLobby(); break;   // 在线账号的出战配置以服务器资料为准（saveProfile）
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
    const c = { id: this.nextId++, conn, name: '机兵', weapon: 'blaster', head: 'antenna', pilot: 'blaze', level: 1, room: null, team: 1 };
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
