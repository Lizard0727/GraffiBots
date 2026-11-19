// 涂鸦机兵 GraffiBots — 对局核心（Node 服务器与浏览器内置服务器共用）
// 包含：对局模拟 Game、AI 机兵、房间 Room、消息处理 Hub
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./shared.js'), require('./economy.js'), require('./bots.js'));
  else root.GBCore = factory(root.GS, root.GE, root.GBBots);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (S, E, BOTS) {
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
const NAV = 2;
let NW = S.GW / NAV, NH = S.GH / NAV;
S.onDims(() => { NW = S.GW / NAV; NH = S.GH / NAV; });   // 1.6：超大地图的导航网格跟着变
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
// 1.4.1：聊天。AI 按性格打字（骂对手、甩锅、夸人、闲聊、回真人的话），有打字时间、会打错字
// =====================================================================
function usePersonaChat(g, st) { return !!st.bots && st.chat !== false && st.personas !== false && !g.tutorial; }
// 每种风格更常用哪个频道（1 = 队伍，0 = 全部）
const STYLE_TEAM = { toxic: 0.3, show: 0.4, lead: 0.9, noob: 0.6, nice: 0.5, chill: 0.5, afk: 0.2 };
const FORCE_CH = { allyDied: 1, praise: 1, winning: 1, losing: 1, streakDeath: 1, endWin: 0, endLose: 0 };
class BotChat {
  constructor(g) {
    this.g = g; this.t = 0; this.q = []; this.used = new Set(); this.gapUntil = 0; this.idleT = rand(30, 55); this.midDone = false;
    for (const p of g.players.values())
      if (p.bot && p.chatty && Math.random() < 0.3 + p.chatty * 0.3) this.say(p, 'start', { delay: rand(0.5, (g.countdown || 3) + 7) });
  }
  bots(filter) { return [...this.g.players.values()].filter((p) => p.bot && p.persona && (!filter || filter(p))); }
  // 让 p 说一句：trigger 是场景，table 是台词表（B.LINES 或 B.REPLY）
  say(p, trigger, o = {}) {
    if (!p || !p.bot || !p.persona) return false;
    const ps = p.pst || (p.pst = { streak: 0, deaths: 0 });
    const chatty = p.chatty || (o.reply && Math.random() < 0.15 ? 0.2 : 0);
    if (!chatty) return false;
    ps.said = ps.said || 0;
    if (!o.reply && !o.end) {
      if (ps.said >= 2 + Math.round(chatty * 8)) return false;           // 一局说的话有上限
      if (this.t < (ps.chatAt || -99) + 7 || this.t < this.gapUntil) return false;   // 别刷屏
    }
    if (ps.afkOn && !o.end && trigger !== 'afkBack') return false;       // 挂机的人不说话
    const table = o.reply ? BOTS.REPLY : BOTS.LINES, T = table[trigger];
    if (!T) return false;
    let st = BOTS.style(p.persona), arr = T[st];
    if (!arr || !arr.length) { if (st === 'afk' && trigger !== 'afkBack' && !o.end) return false; st = T.nice ? 'nice' : Object.keys(T)[0]; arr = T[st]; }
    if (!arr || !arr.length) return false;
    const fresh = arr.filter((l) => !this.used.has(l[0]) || l[0].length <= 3);   // 同一局不重复说一样的话（gg 之类的短句除外）
    if (!fresh.length) return false;
    const line = fresh[randInt(fresh.length)], h = BOTS.humanize(line[0], line[1]);
    this.used.add(line[0]);
    const ch = o.ch != null ? o.ch : FORCE_CH[trigger] != null ? FORCE_CH[trigger] : Math.random() < (STYLE_TEAM[st] || 0.5) ? 1 : 0;
    const at = this.t + (o.delay || 0) + BOTS.typeTime(h.zh) * (o.end ? 0.5 : 1);
    this.q.push({ at, p, zh: h.zh, en: h.en, ch, depth: o.depth || 0, style: st });
    if (h.fix) this.q.push({ at: at + rand(0.8, 2), p, zh: h.zh, en: h.fix[1], ch, depth: 9, fix: true });
    ps.said++; ps.chatAt = this.t; this.gapUntil = this.t + rand(1.2, 3);
    // 活着打长句的菜鸟 / 普通玩家会停下来打字
    if (p.alive && h.zh.length >= 6 && !['top', 'god', 'expert'].includes(p.persona) && Math.random() < 0.4) ps.typingUntil = at;
    return true;
  }
  tick(dt) {
    this.t += dt;
    const g = this.g;
    for (let i = 0; i < this.q.length; i++) {
      const m = this.q[i];
      if (m.at > this.t) continue;
      this.q.splice(i--, 1);
      this.deliver(m);
    }
    if (g.countdown > 0 || g.over) return;
    // 闲聊
    if ((this.idleT -= dt) <= 0) {
      this.idleT = rand(25, 55);
      const c = this.bots((p) => p.chatty > 0);
      if (c.length) this.say(c[randInt(c.length)], 'idle');
    }
    // 打到一半：领先的一方提醒别浪，落后的一方着急
    if (!this.midDone && g.time > g.duration * 0.5 && g.teams === 2) {
      this.midDone = true;
      const lead = g.leadTeam();
      if (lead) for (const t of [1, 2]) { const c = this.bots((p) => p.team === t && p.chatty > 0); if (c.length && Math.random() < 0.6) this.say(c[randInt(c.length)], t === lead ? 'winning' : 'losing', { delay: rand(0, 6) }); }
    }
  }
  deliver(m) {
    const g = this.g;
    if (!g.players.has(m.p.id)) return;
    if (m.fix) g.sendChat(m.p, '', m.en, m.ch);   // 英文打错字后补一句「*正确的词」（中文玩家看不到这句）
    else g.sendChat(m.p, m.zh, m.en, m.ch);
    // 有时候别的 AI 会接话（只接一层）
    if (!m.depth && !m.fix && (m.style === 'toxic' || m.style === 'show' || Math.random() < 0.25) && Math.random() < 0.3) this.react(m.p, m.zh, m.ch, 1);
  }
  // 有人说话（真人或 AI）：看得到这句话的 AI 可能回一句
  react(from, text, ch, depth) {
    const cls = BOTS.classify(text);
    const cand = this.bots((p) => p !== from && (ch !== 1 || p.team === from.team) && !(p.pst && p.pst.afkOn));
    if (!cand.length) return;
    const chance = { bot: 0.85, insult: 0.6, hi: 0.55, gg: 0.6, praise: 0.5, help: 0.6, laugh: 0.3, ask: 0.5, other: 0.25 }[cls] * (depth ? 0.6 : 1);
    if (Math.random() > chance) return;
    const n = cls === 'bot' && Math.random() < 0.35 ? 2 : 1;
    cand.sort((a, b) => (b.chatty || 0) * Math.random() - (a.chatty || 0) * Math.random());
    // 回骂的时候对面的人更可能回嘴；夸奖 / 求助是队友回
    for (const p of cand.slice(0, n)) this.say(p, cls, { reply: true, ch, depth, delay: rand(0.3, 1.4) });
  }
  onKill(by, t) {
    const g = this.g;
    if (by && by.bot && by.team !== t.team) {
      const ps = by.pst || (by.pst = { streak: 0, deaths: 0 });
      ps.streak = (ps.streak || 0) + 1;
      if (ps.streak === 3 && Math.random() < 0.5) this.say(by, 'multi');
      else if (Math.random() < 0.16) this.say(by, 'kill');
    }
    if (t.bot) {
      const ps = t.pst || (t.pst = { streak: 0, deaths: 0 });
      ps.streak = 0; ps.deaths = (ps.deaths || 0) + 1;
      if (ps.deaths >= 3 && Math.random() < 0.4) { ps.deaths = 0; this.say(t, 'streakDeath', { delay: rand(0.5, 2) }); }
      else if (Math.random() < 0.14) this.say(t, 'killed', { delay: rand(0.3, 1.5) });
    }
    if (by && by.team !== t.team) {
      if (by.bot) by.pst.deaths = 0;
      // 队友倒了：有人安慰、有人甩锅（真人倒下更容易被说）
      const mates = this.bots((p) => p.team === t.team && p !== t);
      if (mates.length && Math.random() < (t.bot ? 0.06 : 0.12)) this.say(mates[randInt(mates.length)], 'allyDied', { delay: rand(0.5, 2) });
      // 队友（尤其是真人）打出好表现：夸一句
      const streak = by.bot ? by.pst.streak : (by.hstreak = (by.hstreak || 0) + 1);
      const fans = this.bots((p) => p.team === by.team && p !== by);
      if (fans.length && Math.random() < (streak >= 3 ? 0.4 : by.bot ? 0.03 : 0.08)) this.say(fans[randInt(fans.length)], 'praise', { delay: rand(0.5, 2) });
    }
    if (!t.bot) t.hstreak = 0;
  }
  onEnd(winner) {
    const g = this.g;
    for (const p of this.bots()) {
      if (Math.random() > (p.chatty ? 0.35 + p.chatty * 0.4 : 0.06)) continue;
      const win = g.teams > 2 ? p.team === winner : p.team === winner;
      if (!p.chatty) p.chatty = 0.1;
      this.say(p, win ? 'endWin' : 'endLose', { end: true, delay: rand(0.1, 1.5) });
    }
    const due = this.q.slice(); this.q = [];
    for (const m of due) {
      const ms = Math.max(0, (m.at - this.t) * 1000);
      if (g.room.manual) this.deliver(Object.assign(m, { depth: 9 }));
      else setTimeout(() => this.deliver(Object.assign(m, { depth: 9 })), Math.min(ms, 2800));
    }
  }
}

// =====================================================================
// 对局
// =====================================================================
class Game {
  constructor(room, opts = {}) {
    this.room = room;
    let st = room.settings;
    this.mode = st.mode;
    // 逃亡圈默认用「废墟逃亡区」
    const ruins = S.MAPS.findIndex((m) => m.name === '废墟逃亡区');
    const parkMap = S.MAPS.findIndex((m) => m.park);   // 乐园模式默认用「欢乐乐园」
    this.mapIdx = this.mode === 'loot' ? S.GIANT_MAP() : st.map < 0 ? (S.isEscape(this.mode) && ruins >= 0 ? ruins : this.mode === 'park' && parkMap >= 0 ? parkMap : this.mode === 'loot' ? S.GIANT_MAP() : randInt(S.MAP_N)) : st.map;
    this.ranked = !!st.ranked; this.bans = st.bans || { pilots: [], mechs: [] };
    this.teams = S.teamsOf(this.mode);
    this.oneLife = !!(S.MODES[this.mode] && S.MODES[this.mode].oneLife);
    this.M = S.buildMap(this.mapIdx);
    this.nav = buildNav(this.M);
    this.grid = new Uint8Array(S.GW * S.GH);
    this.loot = this.mode === 'loot';
    this.risk = this.loot && st.risk === 'high' ? 'high' : 'normal';
    if (this.loot) st = Object.assign({}, st, { duration: S.LOOT.duration });
    this.duration = st.duration; this.timeLeft = st.duration;
    this.countdown = st.tutorial ? 3.5 : 6; this.time = 0; this.tick = 0; this.over = false;   // 1.9：开局多给 2.5 秒看观察界面（2.0 修复：注释曾把 tick / over 的初始化吞掉）
    this.players = new Map(); this.projs = []; this.bombs = []; this.missiles = []; this.shells = []; this.helpers = [];
    this.reveal = new Array(this.teams + 1).fill(0);   // 全队扫描（义眼扫描）结束时间
    this.nextId = 1; this.diff = []; this.events = [];
    this.colorSet = room.colorSet;
    const slots = {};
    for (let t = 1; t <= this.teams; t++) slots[t] = 0;
    // 1.6：搜刮撤离的小队人数跟着组队人数（1–4 人）
    const teamCap = this.loot ? clamp(st.squad | 0 || 3, 1, 4) : this.teams > 2 ? S.MODES[this.mode].size : S.MAX_PER_TEAM;
    this.squad = teamCap;
    // 多队模式：真人按加入顺序分队（四队：每 2 人一队；单人：每人一队）
    if (this.teams > 2) { let i = 0; for (const c of room.members.values()) c.gTeam = 1 + (Math.floor(i++ / teamCap) % this.teams); }
    if (S.isEscape(this.mode)) this.spawns = this.escapeSpawns();
    if (this.loot) {   // 四支小队从地图四个角出发
      const sp = this.M.loot.spawns.slice(0, this.teams).map(([x, y]) => ({ x: x * S.CELL, y: y * S.CELL })).sort(() => Math.random() - 0.5);
      this.spawns = [null, ...sp];
    }
    // 角色等级：公平模式下所有人按同一等级；AI 的等级跟着真人玩家的平均等级
    this.fair = !!st.fair;
    this.tutorial = !!st.tutorial;   // 新手教程：敌人是不动的训练靶，时间不走，玩家不会倒下
    const FAIR = { lv: E.FAIR_LV, bt: E.FAIR_BT };
    const humans = [];
    for (const c of room.members.values()) {
      const team = this.teams > 2 ? c.gTeam : st.party || this.mode === 'raid' ? 1 : c.team;   // 1.7：组队（好友开黑）时队友都在同一边；1.8：讨伐全员在一边
      if (slots[team] >= teamCap) continue;
      const pw = this.fair ? FAIR : c.power || { lv: 1, bt: 0 };
      humans.push(pw);
      const pl = this.addPlayer(c.id, c.name, team, c.weapon, c.head, false, slots[team]++, c.pilot, pw);
      pl.looks = c.looks || null;
      if (c.conn && c.conn.held) pl.away = true;   // 1.7.1：断线中的队员开局就由 AI 接管
      if (this.loot && this.risk === 'high' && c.power && Array.isArray(c.power.gear)) this.applyGear(pl, c.power.gear);
      if (this.loot) { const sd = S.LOOT.safe[clamp((c.power && c.power.safe) | 0 || 1, 1, 3)]; pl.safe = { w: sd[0], h: sd[1], items: [] }; }   // 2.1 安全箱
    }
    const avgLv = humans.length ? Math.round(humans.reduce((a, b) => a + b.lv, 0) / humans.length) : 1;
    const botPw = this.fair ? FAIR : st.botPower || { lv: avgLv, bt: avgLv >= 9 ? 2 : avgLv >= 5 ? 1 : 0 };   // 排位赛：AI 强度跟着段位
    if (st.bots) {
      let bi = 0;
      // AI 机兵由驾驶员们驾驶：优先使用还没人选的驾驶员
      const taken = new Set([...this.players.values()].map((p) => p.pilot));
      const bannedP = new Set(this.bans.pilots || []), bannedM = new Set(this.bans.mechs || []);   // 排位赛被禁用的驾驶员 / 机体 AI 也不能选
      const mechPool = S.WEAPON_ORDER.filter((w) => !bannedM.has(w));
      const free = S.PILOTS.filter((pp) => !taken.has(pp.id) && !bannedP.has(pp.id)).sort(() => Math.random() - 0.5);
      const perTeam = this.teams > 2 ? teamCap : this.mode === 'raid' ? 4 : Math.max(st.teamSize, st.party ? slots[1] : 0);
      const slotList = [];
      for (let team = 1; team <= this.teams; team++)
        for (let s = slots[team]; s < perTeam && !(this.tutorial && team === 1) && !(this.loot && team === 1 && st.fill === false) && !(this.mode === 'raid' && team === 2); s++) slotList.push({ team });   // 搜刮撤离：可以关掉 AI 队友
      // 1.4.1：AI 性格（菜鸟 / 猪队友 / 挂机 / 不错 / 高手 / 顶尖 / 大神），排位赛按段位混合；名字像真人玩家
      const usePersona = st.personas !== false && !this.tutorial;
      const hTeams = {};
      for (const p of this.players.values()) hTeams[p.team] = (hTeams[p.team] || 0) + 1;
      const tier = this.ranked && Number.isInteger(st.rankTier) ? st.rankTier : null;
      const personas = usePersona ? BOTS.assign(slotList, tier, hTeams, avgLv) : slotList.map(() => 'decent');
      const names = usePersona ? BOTS.nicks(slotList.length, st.lang) : BOT_NAMES.slice().sort(() => Math.random() - 0.5);
      const dIdx = { 1: 0, 2: 0 };
      slotList.forEach(({ team }, i) => {
        bi++;
        const dr = st.draft && st.draft[team] && st.draft[team][dIdx[team]++];   // 1.9：排位赛选人阶段选好的组合
        const pp = dr ? null : free.shift();
        const okP = S.PILOTS.filter((x) => !bannedP.has(x.id)), pil = dr ? S.pilot(dr.pilot) : pp || okP[randInt(okP.length)] || S.PILOTS[0];
        const P = BOTS.persona(personas[i]);
        const pw = usePersona && !this.fair ? Object.assign({}, botPw, { lv: clamp(botPw.lv + P.lv, 1, E.MAX_LV) }) : botPw;
        // 驾驶员和机体分开选：一半用擅长机体，一半随机
        const wpn = dr ? dr.mech : Math.random() < 0.5 && !bannedM.has(pil.weapon) ? pil.weapon : mechPool[randInt(mechPool.length)];
        const pl = this.addPlayer(-bi, dr && dr.name ? dr.name : usePersona ? names[i] : pp ? pp.name : names[bi % names.length], team, wpn,
          S.HEADS[randInt(S.HEADS.length)].id, true, slots[team]++, pil.id, pw);
        pl.persona = usePersona ? personas[i] : null;
        if (usePersona) { pl.looks = BOTS.looks(S, pl.pilot, pl.persona, tier == null ? 2 : tier); pl.chatty = Math.random() < 0.7 ? P.chat * rand(0.4, 1.6) : 0; }
      });
    }
    // 1.8：咒灵讨伐的百目 + 小咒灵；封印争夺的游荡咒灵（都提前建好，需要时再「出场」）
    if (this.mode === 'raid') this.setupRaid(humans.length, botPw);
    if (this.mode === 'seal') this.setupSeal(botPw);
    // 1.6：搜刮撤离的中立守卫（守着中间的高级物资，谁靠近打谁）
    if (this.loot && st.bots !== false) {
      const GW_ = ['bucket', 'riot', 'blaster', 'fist', 'roller', 'flamer'];   // 守卫用短中程武器，不在远处狙人
      this.M.loot.guards.forEach(([gx, gy, grp], k) => {
        const hv = grp === 'hv';
        const g = this.addPlayer(-500 - k, hv ? '灰石重装卫兵' : '守卫机兵', S.LOOT.guardTeam, GW_[k % GW_.length], 'antenna', true, k, S.PILOTS[randInt(S.PILOTS.length)].id,
          { lv: clamp((botPw.lv | 0) + (hv ? 2 : 1), 1, E.MAX_LV), bt: Math.min(2, (botPw.bt | 0) + 1) });
        g.guard = { x: gx * S.CELL, y: gy * S.CELL, hv }; g.npc = true; g.persona = 'expert';
        if (hv) { g.maxHp = Math.round(g.maxHp * 1.4); g.hp = g.maxHp; }
        this.respawn(g);
      });
      // 2.1：Boss 小队——灰石指挥官带 3 个护卫，在各城区之间巡逻
      const route = (this.M.loot.bossRoute || []).map(([x, y]) => ({ x: x * S.CELL, y: y * S.CELL }));
      if (route.length) {
        const bp = { lv: clamp((botPw.lv | 0) + 3, 1, E.MAX_LV), bt: 2 };
        const boss = this.addPlayer(-900, '灰石指挥官 · 铁卫', S.LOOT.guardTeam, 'wrecker', 'antenna', true, 90, 'han', bp);
        boss.guard = { x: route[0].x, y: route[0].y, route, ri: 0 }; boss.npc = true; boss.persona = 'expert'; boss.lootBoss = true;
        boss.maxHp = Math.round(boss.maxHp * 3.2); boss.hp = boss.maxHp;
        this.respawn(boss); boss.x = route[0].x; boss.y = route[0].y;
        ['riot', 'charger', 'gatling'].forEach((w, k) => {
          const e = this.addPlayer(-901 - k, '铁卫护卫', S.LOOT.guardTeam, w, 'antenna', true, 91 + k, S.PILOTS[randInt(S.PILOTS.length)].id, { lv: bp.lv - 1, bt: 2 });
          e.guard = { x: route[0].x, y: route[0].y, follow: boss.id }; e.npc = true; e.persona = 'expert';
          e.maxHp = Math.round(e.maxHp * 1.5); e.hp = e.maxHp;
          this.respawn(e); e.x = route[0].x + (k - 1) * 40; e.y = route[0].y + 40;
        });
      }
    }
    if (this.loot) for (const p of this.players.values()) if (p.bot && !p.guard && !p.gear) { const bd = S.bagDims(this.risk === 'high' && Math.random() < 0.6 ? ['pack'] : []); p.inv = { w: bd[0], h: bd[1], items: [] }; }
    // 2.1.2：每支纯 AI 小队一种打法（早撤 / 阴人 / 均衡 / 贪心）；有真人的小队里 AI 队友按均衡打
    if (this.loot) { this.lootStyle = {}; for (let t = 1; t <= this.teams; t++) { const hum = [...this.players.values()].some((p) => p.team === t && !p.bot); this.lootStyle[t] = hum ? 'balanced' : pickStyle(); } }
    this.chat = usePersonaChat(this, st) ? new BotChat(this) : null;
    this.initMode();
    if (this.mode === 'zone') {
      this.zoneCells = [];
      for (let y = S.ZONE.y0; y < S.ZONE.y1; y++)
        for (let x = S.ZONE.x0; x < S.ZONE.x1; x++) if (!this.M.solid[y * S.GW + x]) this.zoneCells.push(y * S.GW + x);
    }
    this.started = true;
    room.broadcast(this.startMsg());
    // 1.6：按真实时间补帧——浏览器里画面卡的时候模拟也不会变慢（最多一次补 4 帧）
    if (!opts.manual) {
      const ms = 1000 / S.TICK;
      this.clock = Date.now();
      this.interval = setInterval(() => {
        const now = Date.now();
        let n = Math.floor((now - this.clock) / ms);
        if (n > 4) { this.clock = now - ms * 4; n = 4; }
        for (let i = 0; i < n && !this.over; i++) { this.clock += ms; this.step(); }
      }, ms);
    }
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
      maxHp: Math.round(W.hp * (pid === 'titan' ? 1.18 : 1) * pmul * (tal.has('d1') ? 1.08 : 1)),
      x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, onGround: true,
      hp: 100, ammo: S.AMMO, sp: 0, alive: true, respawnT: 0, invulnT: 0,
      lastHurt: -10, lastAtk: -10, atkCd: 0, burst: null, rollT: 0, charge: 0, prevFire: false,
      spT: 0, spKind: null, spWave: 0, shield: 0, shieldT: 0, sm: 1, carry: 0, hidden: false, wheel: false, firing: false,
      foot: false, rebuildT: 0, skillUses: S.SKILL_CHARGES + (tal.has('s2') ? 1 : 0), skillMax: S.SKILL_CHARGES + (tal.has('s2') ? 1 : 0), skillRegen: 0, skillCd: 0, rushT: 0, slowT: 0, silenceT: 0, smokeT: 0, odN: 0, dmgMul: 1,
      quakeT: 0, quakeArm: 0,
      input: { mx: 0, my: 0, a: team === 1 ? 0 : Math.PI, pt: 0, f: false, w: false, j: false, qq: 0, gq: 0, aq: 0, oq: 0, ad: 200 },
      lastQq: 0, lastGq: 0, lastAq: 0, sync: 0, lastPosT: 0, hitCd: {},
      stats: { kills: 0, deaths: 0, paint: 0, obj: 0, assists: 0, balloons: 0, float: 0, seals: 0, spirits: 0 },
      bag: [], bagCap: S.LOOT.bag, inv: { w: 5, h: 3, items: [] }, safe: { w: 2, h: 2, items: [] }, openC: 0, srch: 0, exT: 0, extracted: false, pickT: 0,
    };
    this.players.set(id, p);
    this.respawn(p);
    p.invulnT = 0;
    return p;
  }

  // 发一条聊天：ch 1 = 只发给同队的人
  sendChat(p, text, en, ch) {
    const m = { t: 'chat', id: p.id, name: p.name, team: p.team, text, ch: ch ? 1 : 0 };
    if (en != null && en !== text) m.en = en;
    (this.chatLog || (this.chatLog = [])).push(m);
    if (this.chatLog.length > 80) this.chatLog.shift();
    if (this.room.manual) return;
    const str = JSON.stringify(m);
    for (const c of this.room.members.values()) {
      if (m.ch) { const q = this.players.get(c.id); if (!q || q.team !== p.team) continue; }
      c.conn.sendRaw(str);
    }
  }
  humanChat(id, text, ch) {
    const p = this.players.get(id);
    if (!p) return false;
    this.sendChat(p, text, null, ch);
    if (this.chat) this.chat.react(p, text, ch, 0);
    return true;
  }
  // 现在哪一队领先（给 AI 聊天用）
  leadTeam() {
    const o = this.obj;
    if (this.mode === 'turf' || !o.score) { const t = S.countTurf(this.grid, this.M); return t.a > t.b * 1.1 ? 1 : t.b > t.a * 1.1 ? 2 : 0; }
    if (this.mode === 'zone' && o.count) return o.count[1] < o.count[2] ? 1 : o.count[2] < o.count[1] ? 2 : 0;
    return o.score[1] > o.score[2] ? 1 : o.score[2] > o.score[1] ? 2 : 0;
  }
  removePlayer(id) {
    const p = this.players.get(id);
    if (!p) return;
    this.dropItems(p);
    this.players.delete(id);
  }
  humanCount() { let n = 0; for (const p of this.players.values()) if (!p.bot) n++; return n; }
  startMsg() {
    return {
      t: 'start', map: this.mapIdx, mode: this.mode, colorSet: this.colorSet, duration: this.duration,
      players: [...this.players.values()].map((p) => ({ id: p.id, name: p.name, team: p.team, weapon: p.weapon, head: p.head, pilot: p.pilot, bot: p.bot, lv: p.lv, bt: p.bt, looks: p.looks || null, npc: p.npc ? 1 : 0, boss: p.boss ? 1 : 0, spirit: p.spirit ? 1 : 0 })),
      fair: this.fair, teams: this.teams, cd: Math.round(this.countdown * 10) / 10, ranked: this.ranked ? 1 : 0, bans: this.ranked ? this.bans : undefined, tutorial: this.tutorial ? 1 : 0, risk: this.loot ? this.risk : undefined, squad: this.squad,
      loot: this.loot ? this.lootList() : undefined, conts: this.loot ? this.contList() : undefined,
      lever: this.loot && this.obj.lever ? [r1(this.obj.lever.x), r1(this.obj.lever.y)] : undefined,
    };
  }
  // 1.7.1：断线重连——把整张涂料图（游程编码）发给重新连上的玩家
  gridMsg() {
    const g = this.grid, rle = [];
    for (let i = 0; i < g.length;) { const v = g[i]; let n = 1; while (i + n < g.length && g[i + n] === v) n++; rle.push(v, n); i += n; }
    return { t: 'grid', g: rle };
  }
  // 断线期间由 AI 暂时接管（不会站着挨打），重连后交还
  setAway(id, on) {
    const p = this.players.get(id);
    if (!p || p.bot) return;
    p.away = !!on; p.ai = null;
    const inp = p.input; inp.mx = 0; inp.my = 0; inp.f = false; inp.w = false;
    if (!on) { p.sync++; this.sendBag(p); }
  }
  ev(e) { this.events.push(e); }
  top(x, y) { return S.topAt(this.M, x, y); }

  // ------------------------------------------------------------------
  step() {
    S.useMap(this.M);   // 1.6：服务器上同时跑多张不同尺寸的地图，每局模拟前切到自己的尺寸
    const dt = 1 / S.TICK;
    this.tick++;
    if (this.countdown > 0) {
      this.countdown -= dt;
    } else if (!this.over) {
      this.time += dt; if (!this.tutorial) this.timeLeft -= dt;
      for (const p of this.players.values()) if (p.boss) bossThink(this, p, dt); else if (p.bot || p.away) botThink(this, p, dt);
      for (const p of this.players.values()) this.updatePlayer(p, dt);
      this.updateProjs(dt);
      this.updateBombs(dt);
      this.updateShells(dt);
      this.updateHelpers(dt);
      this.updateMissiles(dt);
      this.updateMode(dt);
      if (this.timeLeft <= 0) this.finish(null);
    }
    if (this.chat) this.chat.tick(dt);
    if (!this.room.manual) this.sendSnapshot();
    else { this.diff = []; this.events = []; }
  }

  input(id, m) {
    const p = this.players.get(id);
    if (!p || p.bot || p.away) return;
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
      if (this.M.lift && (S.liftAt(this.M, p.x, p.y) || S.liftAt(this.M, m.x, m.y))) p.liftT = this.time;   // 2.1.2：坐电梯（3 秒内允许升到楼顶高度）
      const riding = this.time - (p.liftT || -9) < 3;
      const kb = this.time - (p.kbT || -9) < 1.2 ? 540 : 0;     // 刚被击退：放宽速度上限
      const maxStep = (380 * p.sm + 40 + kb) * dtAllow + 12;
      const d = Math.hypot(m.x - p.x, m.y - p.y);
      const gh = this.top(m.x, m.y);
      const test = { x: m.x, y: m.y, z: m.z };
      S.collide(test, (p.foot ? S.PILOT_R : S.R) - 2, this.M);
      const bad = riding ? (m.z < gh - 2 || m.z > S.LEVEL_H[5] + 30) : (Math.hypot(test.x - m.x, test.y - m.y) > 3 || m.z < gh - 2 || m.z > gh + 130 || m.z > p.z + (S.JUMP_W * S.JUMP_W) / (2 * S.GRAV) + 30 + (kb ? (S.PAD.v * S.PAD.v) / (2 * S.GRAV) : 0));
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
    if (p.skillUses < p.skillMax && !(p.lockT > 0)) {   // 2.2：技能充能制（2.2.1：被洛奇的脉冲命中后暂停回复）——每 15 秒回复 1 次（天赋「技能专精」+20%，姜黎 +25%，姜黎身边的队友 +10%）
      let rk = (p.tal.has('s1') ? 1.2 : 1) * (p.pilot === 'doc' ? 1.25 : this.nearPilot(p, 'doc', 220) ? 1.1 : 1);
      p.skillRegen += dt * rk;
      if (p.skillRegen >= S.SKILL_REGEN) { p.skillRegen -= S.SKILL_REGEN; p.skillUses++; if (p.skillUses >= p.skillMax) p.skillRegen = 0; }
    } else if (p.skillUses >= p.skillMax) p.skillRegen = 0;
    if (p.blinkT > 0) p.blinkT -= dt;
    if (p.nanoT > 0) p.nanoT -= dt;
    if (p.auraT > 0) p.auraT -= dt;
    if (p.pilot === 'zero' && (this.tick % 6) === 0) {   // 2.2 沈零被动：战场感知——附近 220 的敌人自动暴露
      for (const e of this.players.values()) if (e.alive && e.team !== p.team && !e.npc && Math.hypot(e.x - p.x, e.y - p.y) < 260 && Math.abs(e.z - p.z) < 120) e.revealT = Math.max(e.revealT, 0.4);
    }
    p.rushT = Math.max(0, p.rushT - dt); p.slowT = Math.max(0, p.slowT - dt);
    p.silenceT = Math.max(0, p.silenceT - dt); p.smokeT = Math.max(0, p.smokeT - dt);
    p.rallyT = Math.max(0, p.rallyT - dt); p.revealT = Math.max(0, p.revealT - dt);
    p.cloakT = Math.max(0, (p.cloakT || 0) - dt);
    if (p.jamT > 0) p.jamT -= dt;
    if (p.supT > 0) p.supT -= dt;
    if (p.blindT > 0) p.blindT -= dt;
    if (p.markT > 0) p.markT -= dt;
    if (p.lockT > 0) p.lockT -= dt;
    if (p.repT > 0) { p.repT -= dt; if (!p.foot) p.hp = Math.min(this.maxHpOf(p), p.hp + this.maxHpOf(p) * 0.03 * dt); }   // 2.1 母舰：维修无人机
    p.sealT = Math.max(0, (p.sealT || 0) - dt); p.possT = Math.max(0, (p.possT || 0) - dt); p.dslowT = Math.max(0, (p.dslowT || 0) - dt);   // 1.8
    p.bindT = Math.max(0, (p.bindT || 0) - dt); p.comboT = Math.max(0, (p.comboT || 0) - dt);   // 1.9.1：符印束缚 / 灵刃连斩
    if (p.wardN && (p.wardT = (p.wardT || 0) - dt) <= 0) p.wardN = 0;
    if (p.burnT > 0) {   // 2.0 着火：每 0.5 秒掉 3 点生命（不减速）
      p.burnT -= dt; p.burnAcc = (p.burnAcc || 0) + dt;
      if (p.burnAcc >= 0.5) { p.burnAcc -= 0.5; this.hurt(p, 3, this.players.get(p.burnBy) || null, 0, 0); if (!p.alive) return; }
    }
    if (p.poisonT > 0) {   // 中毒：每 0.5 秒掉 3 点生命并减速
      p.poisonT -= dt; p.poisonAcc = (p.poisonAcc || 0) + dt; p.slowT = Math.max(p.slowT, 0.15);
      if (p.poisonAcc >= 0.5) { p.poisonAcc -= 0.5; this.hurt(p, 3, this.players.get(p.poisonBy) || null, 0, 0); if (!p.alive) return; }
    }
    const OV = p.ovT > 0 ? S.OVERLOADS[p.pilot] : null;
    if (p.ovT > 0) { p.ovT -= dt; if (p.ovT <= 0) p.ovT = 0; }
    const spAct = p.spT > 0;
    const gh = this.top(p.x, p.y);
    const grounded = p.z <= gh + 1;
    const ground = grounded ? S.cellAt(this.grid, p.x, p.y) : -1;
    const own = ground === p.team, enemy = ground > 0 && !own;
    const inBush = S.inBush(this.M, p.x, p.y, p.z);
    let sm = p.foot ? (p.pilot === 'gale' ? 1.45 : 1) : W.spd * (p.pilot === 'gale' ? 1.08 : 1);
    if (this.obj.tr && this.obj.tr.carrier === p.id) sm *= 0.72;
    if (p.carry) sm *= 1 - 0.04 * p.carry;
    if (spAct && p.spKind === 'charge') sm *= 1.45;
    if (p.rushT > 0) sm *= 1.35;
    if (p.slowT > 0) sm *= 0.55;
    if (p.pilot === 'raven' && (inBush || own)) sm *= 1.12;
    if (OV && OV.spd) sm *= OV.spd;
    if (p.rallyT > 0) sm *= 1.15;
    if (p.cloakT > 0 && p.cloakFast) sm *= 1.25;
    if (p.possT > 0) sm *= 1.2;          // 赤镰：恶灵附身
    if (p.dslowT > 0) sm *= 0.75;        // 敌方结界里
    if (p.bindT > 0) sm *= 0.12;         // 1.9.1：被结界机兵的符印束缚
    if (own && p.tal.has('p2')) sm *= 1.06;
    if (own && wheel0(p) && p.tal.has('p6')) sm *= 1.1;
    p.sm = sm;
    const wheel = !!inp.w && !p.foot && !(spAct && p.spKind === 'beam');
    p.wheel = wheel;
    if (p.bot || p.away) { S.stepMove(p, inp, dt, this.grid, this.M, S.moveMul(p.weapon, p.firing && !wheel, spAct ? p.spKind : null)); inp.j = false; }

    // 敌方涂料持续掉血；脱战 3 秒后快速回血（大厨更快）
    const maxHp = this.maxHpOf(p);
    if (enemy && !p.npc && p.invulnT <= 0 && !(spAct && p.spKind === 'charge') && p.hp > maxHp * 0.3) p.hp = Math.max(maxHp * 0.3, p.hp - maxHp * 0.1 * dt);
    if (!enemy && !p.boss && this.time - p.lastHurt > 3 && this.time - p.lastAtk > 2) {   // 1.8：百目不会脱战回血
      const k = (wheel && own ? 0.32 : 0.16) * (p.pilot === 'chef' ? 2 : 1);
      p.hp = Math.min(maxHp, p.hp + maxHp * k * dt);
    }
    if (own && p.tal.has('p4')) p.hp = Math.min(maxHp, p.hp + 3 * dt);   // 天赋：墨水回复
    if (OV) this.overloadTick(p, OV, dt);

    // 装填：攻击过程中不装填；己方涂料上的滚轮形态装填更快
    if (!p.burst && p.rollT <= 0 && !(p.charge > 0)) {
      const rt = p.foot ? S.sidearm(p.pilot).reload : W.reload;
      let rk = (p.rushT > 0 ? 2 : 1) * (wheel && own ? 1.6 : 1) * (p.tal.has('a2') ? 1.12 : 1);
      if (this.nearPilot(p, 'echo', 200)) rk *= 1.2; else if (p.pilot === 'echo') rk *= 1.1;   // 叶声被动：节拍同步（2.1：队友 +20%，范围 200；自己 +10%）
      if (p.jamT > 0) rk *= 0.7;
      if (p.nanoT > 0) rk *= 0.75;                        // 2.2 纳米雾场：装填 -25%
      if (p.supT > 0) rk *= 1.3;                          // 2.1 霍克的补给箱                          // 2.1 叶声的声波干扰：装填 -30%
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
    p.hidden = (p.smokeT > 0 || p.cloakT > 0 || ((inBush || (wheel && own)) && !recentAtk)) && !(p.revealT > 0);

    if (inp.qq !== p.lastQq) {
      p.lastQq = inp.qq;
      if (!p.foot && p.sp >= W.spNeed && !spAct && p.silenceT <= 0 && !(p.sealT > 0)) this.activateSpecial(p);
    }
    if (inp.gq !== p.lastGq) {
      p.lastGq = inp.gq;
      if (p.skillUses > 0 && p.skillCd <= 0 && p.silenceT <= 0 && !(p.sealT > 0)) this.useSkill(p);
    }
    if (inp.oq !== p.lastOq) {
      p.lastOq = inp.oq;
      if (p.bt >= 1 && !(p.ovT > 0) && p.ov >= S.OV_NEED && p.silenceT <= 0) this.activateOverload(p);
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
      p.openerOn = !!W.opener && this.time - p.lastAtk > 2;   // 2.2 枪骑：先手突刺
      p.ammo -= 1; p.atkCd = W.atkCd / (OVr || 1); p.lastAtk = this.time; this.takeOverdrive(p);
      if (p.cloakT > 0) { if (W.special === 'cloak') p.dmgMul *= 1.5; p.cloakT = 0; p.cloakFast = false; }   // 攻击会现形；幻影隐身第一击 +50%
      switch (W.attack) {
        case 'burst': p.burst = { n: W.shots, t: 0, aim: W.homing ? this.autoAim(p, W) : null, fl: W.poison ? { fx: { poison: W.poison } } : W.slowHit ? { fx: { slow: W.slowHit, ward: W.ward || 0 } } : W.burn ? { fx: { burn: W.burn } } : null }; this.stepBurst(p, W, 0); break;
        case 'fan': this.fireSpread(p, W); break;
        case 'flick':
          this.fireSpread(p, W);
          if (grounded) { this.knock(p, Math.cos(inp.a), Math.sin(inp.a), W.lunge, 0); p.rollT = 0.45; p.rollA = inp.a; }
          break;
        case 'lob': {
          const d = clamp(inp.ad || 200, W.minRange, W.range);
          const sh = this.spawnShellRet(p, p.x + Math.cos(inp.a) * d, p.y + Math.sin(inp.a) * d, W.dmg * p.dmgMul, W.blast, W.flight);
          if (W.bounce && sh) sh.bounce = 1;
          if (W.sticky && sh) sh.sticky = W.sticky;   // 2.0 迫击：黏稠墨水
          break;
        }
        case 'punch': this.punch(p, W); break;
      }
      return true;
    }
    return p.rollT > 0;
  }
  takeOverdrive(p) {
    p.dmgMul = p.odN > 0 ? 1.4 : 1; if (p.odN > 0) p.odN--;
    if (p.pilot === 'hawk' && p.ammo >= S.AMMO - 1.001) p.dmgMul *= 1.15;   // 2.2.1 霍克被动：火力纪律（满弹药时的第一次攻击 +15%）
    if (p.blinkT > 0) { p.dmgMul *= 1.35; p.blinkT = 0; }   // 2.2 沈零：相位突进后的下一次攻击 +35%
  }
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
      if (d > A.range + (t.rad || (t.foot ? S.PILOT_R : S.R)) + 6 || Math.abs(t.z - p.z) > (t.boss ? 120 : 34)) continue;
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
    if (fx.poison) { t.poisonT = Math.max(t.poisonT || 0, fx.poison); t.poisonBy = fx.by || t.poisonBy; }
    if (fx.burn) { t.burnT = Math.max(t.burnT || 0, fx.burn); t.burnBy = fx.by || t.burnBy; }   // 2.0 喷火罐车：点燃
    if (fx.ward && fx.by) {   // 1.9.1 结界机兵：同一个人连中 4 发符印 → 束缚 0.7 秒 + 额外伤害
      if (t.wardBy !== fx.by) { t.wardBy = fx.by; t.wardN = 0; }
      t.wardN = (t.wardN || 0) + 1; t.wardT = 2.5;
      this.ev(['wd', t.id, t.wardN]);
      if (t.wardN >= fx.ward) { t.wardN = 0; t.bindT = 0.7; t.slowT = Math.max(t.slowT, 1); const o = this.players.get(fx.by); this.hurt(t, 16, o || null, 0, 0); this.ev(['bind', t.id]); }
    }
  }
  stepBurst(p, W, dt) {
    const b = p.burst;
    b.t -= dt;
    while (b.t <= 0 && b.n > 0) {
      const ya = b.aim ? b.aim.a : p.input.a, pa = b.aim ? b.aim.pt : p.input.pt;
      // 2.0 攻击特性：喷罐最后一发是爆裂弹，旋转机兵越打越狠
      const i = W.shots - b.n, fin = W.finale && b.n === 1 && !p.foot;
      const mul = (fin ? W.finale : 1) * (W.lead && i === 0 && !p.foot ? W.lead : 1) * (W.spinup ? W.spinup[0] + (W.spinup[1] - W.spinup[0]) * i / Math.max(1, W.shots - 1) : 1);
      const pr = this.spawnProj(p, ya + (Math.random() - 0.5) * W.spread, pa + (Math.random() - 0.5) * W.spread * 0.4, W.speed, W.range, W.dmg * mul, W.splat * (fin ? 1.5 : 1), W.trail, W.size + (fin ? 3 : 0), null, b.fl);
      if (fin && pr) this.ev(['fin', p.id, pr.id]);
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
    const fin = !!W.combo && !p.foot && (p.combo = p.comboT > 0 ? (p.combo || 0) + 1 : 1) >= W.combo;   // 连击第 3 下：灵刃回旋斩 / 重拳上勾拳
    p.comboT = 1.3; if (fin) p.combo = 0;
    const spin = fin && W.comboKind !== 'upper', upper = fin && W.comboKind === 'upper';
    if (spin) W = Object.assign({}, W, { arc: Math.PI * 2, dmg: W.dmg * 1.3, range: W.range + 14, lunge: W.lunge * 0.5 });
    if (upper) W = Object.assign({}, W, { dmg: W.dmg * 1.3, range: W.range + 8 });
    this.knock(p, Math.cos(a), Math.sin(a), W.lunge, 0);
    const fx = p.x + Math.cos(a) * 30, fy = p.y + Math.sin(a) * 30;
    this.paint(fx, fy, p.z, W.paintR || 30, p.team, p);
    for (const t of this.players.values()) {
      if (!t.alive || t.team === p.team) continue;
      const dx = t.x - p.x, dy = t.y - p.y, d = Math.hypot(dx, dy);
      if (d > W.range + (t.rad || S.R) + 10 + (W.lunge || 0) * 0.1 || Math.abs(t.z - p.z) > (t.boss ? 120 : 40)) continue;   // 1.5：冲拳的前冲也算进攻击距离
      let da = Math.atan2(dy, dx) - a; while (da > Math.PI) da -= Math.PI * 2; while (da < -Math.PI) da += Math.PI * 2;
      if (Math.abs(da) > W.arc / 2) continue;
      const dmg = W.dmg * p.dmgMul * (p.openerOn ? W.opener : 1);
      if (p.openerOn) this.ev(['opn', t.id]);
      this.hurt(t, dmg, p, dx, dy, W.kb / (dmg * 1.8), upper ? 420 : 120);
      if (W.stagger) t.slowT = Math.max(t.slowT, W.stagger);   // 2.0 拆楼锤：震荡
    }
    p.openerOn = false;
    this.pushBall(p, fx, fy, W.range, 1100);
    if (this.mode === 'park') for (const b of this.obj.balloons.slice()) if (Math.hypot(b.x - fx, b.y - fy) < W.range + 20) this.popBalloon(b, p.team, p);
    if (W.wave) { const V = W.wave; for (const da of spin ? [-0.45, 0, 0.45] : [0]) this.spawnProj(p, a + da, -0.03, V.speed, V.range, V.dmg, V.splat, 14, V.size, null, { kb: 1.4 }); }   // 1.8：灵刃的刀气（1.9.1 回旋斩三道）
    this.ev(['pu', p.id, r2(a)]);
    if (spin) this.ev(['spin', p.id, r1(p.x), r1(p.y), r1(p.z), p.team]);
    if (upper) this.ev(['upper', p.id, r1(p.x + Math.cos(a) * 40), r1(p.y + Math.sin(a) * 40), r1(p.z), p.team]);
  }

  fireSpread(p, W) {
    const n = W.pellets || 1, a = p.input.a, pt = p.input.pt;
    if (W.attack === 'fan' && !W.ghost) this.knock(p, -Math.cos(a), -Math.sin(a), W.kb ? 40 : 100, 0);   // 泼桶的后坐力
    for (let i = 0; i < n; i++) {
      const off = n > 1 ? (i / (n - 1) - 0.5) * W.arc : 0;
      const k = n > 1 ? rand(0.85, 1.12) : 1;
      this.spawnProj(p, a + off + (Math.random() - 0.5) * W.spread, pt + (Math.random() - 0.5) * W.spread * 0.6 + (n > 1 ? rand(-0.02, 0.04) : 0),
        W.speed * k, W.range * k, W.dmg, W.splat, W.trail, W.size, null, { ghost: W.ghost, kb: W.kb, fx: W.reveal ? { reveal: W.reveal } : null });
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
      dmg: dmg * (origin ? 1 : p.dmgMul || 1), splat, trail, size, acc: 0, range, w: origin || p.foot ? null : p.weapon, ghost: !!(fl && fl.ghost), kb: (fl && fl.kb) || 1, fx: (fl && fl.fx) || null };
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
  domainBlocks(team, x, y, z) {   // 1.9.1：落在敌方简易领域里的炮弹 / 导弹被中和
    for (const h of this.helpers) if (h.kind === 'domain' && h.team !== team && Math.hypot(x - h.x, y - h.y) < h.r && Math.abs(z - h.z) < 130) return true;
    return false;
  }
  updateShells(dt) {
    this.shells = this.shells.filter((s) => {
      s.t += dt;
      if (s.t < s.T) return true;
      if (this.domainBlocks(s.team, s.x1, s.y1, s.z1)) { this.ev(['blk', 0, r1(s.x1), r1(s.y1), r1(s.z1 + 10)]); return false; }
      this.explode(s.x1, s.y1, s.z1, s.r, s.dmg, s.dmg * 0.45, s.team, this.players.get(s.owner));
      this.ev(['bx', r1(s.x1), r1(s.y1), r1(s.z1), s.team, s.r, s.sticky ? 4 : 0]);
      if (s.sticky) for (const t of this.players.values()) if (t.alive && t.team !== s.team && Math.hypot(t.x - s.x1, t.y - s.y1) < s.r + 10 && Math.abs(t.z - s.z1) < 60) t.slowT = Math.max(t.slowT, s.sticky);
      if (s.bounce) {   // 弹弓：落地后沿原方向再弹一次
        const dx = s.x1 - s.x0, dy = s.y1 - s.y0, l = Math.hypot(dx, dy) || 1, d2 = 95;
        const x2 = clamp(s.x1 + (dx / l) * d2, 10, S.W - 10), y2 = clamp(s.y1 + (dy / l) * d2, 10, S.H - 10);
        let z2 = this.top(x2, y2); if (this.M.solid[Math.floor(y2 / S.CELL) * S.GW + Math.floor(x2 / S.CELL)]) z2 = S.LEVEL_H[3];
        const b2 = { id: this.nextId++, x0: s.x1, y0: s.y1, z0: s.z1 + 4, x1: x2, y1: y2, z1: z2, T: 0.36, t: 0, team: s.team, owner: s.owner, dmg: s.dmg * 0.6, r: s.r * 0.8 };
        this.shells.push(b2);
        this.ev(['lb', b2.id, r1(b2.x0), r1(b2.y0), r1(b2.z0), r1(x2), r1(y2), r1(z2), r2(b2.T), s.team]);
      }
      if (s.fog) { this.helpers.push({ id: this.nextId++, kind: 'fog', x: s.x1, y: s.y1, z: s.z1, r: 105, team: s.team, owner: s.owner, t: 5, cd: 0 }); this.ev(['fg', r1(s.x1), r1(s.y1), r1(s.z1), 105, 5, s.team]); }
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
      case 'turret': this.helpers.push({ id: this.nextId++, kind: 'turret', x: p.x, y: p.y, z: p.z, team: p.team, owner: p.id, t: 6, cd: 0.3 }); break;
      case 'dash': {
        let dx = p.input.mx, dy = p.input.my;
        if (Math.hypot(dx, dy) < 0.2) { dx = Math.cos(p.input.a); dy = Math.sin(p.input.a); }
        this.knock(p, dx, dy, 520, 0); p.invulnT = Math.max(p.invulnT, p.pilot === 'gale' ? 0.5 : 0.35);
        break;
      }
      case 'emp':
        for (const e of this.players.values()) if (e.alive && e.team !== p.team && dist(e, p) < 200) { e.slowT = 3; e.silenceT = 1.1; e.charge = 0; e.burst = null; if (p.pilot === 'hex') e.lockT = 3; }   // 2.2.1 洛奇被动：后门程序
        break;
      case 'bento': this.helpers.push({ id: this.nextId++, kind: 'bento', x: p.x, y: p.y, z: p.z, team: p.team, owner: p.id, t: 15, armed: 0.6 }); break;
      case 'overdrive': p.ammo = S.AMMO; p.odN = 3; break;
      case 'drone': this.helpers.push({ id: this.nextId++, kind: 'drone', x: p.x, y: p.y, z: p.z + 40, team: p.team, owner: p.id, t: 6, cd: 0.3, ang: 0 }); break;
      case 'rally':
        for (const a of this.players.values()) if (a.alive && a.team === p.team && dist(a, p) < 180) a.rallyT = Math.max(a.rallyT, 6);
        break;
      case 'blast': {   // 2.1 石磊：炸药包扔到瞄准的位置（最远 220），0.9 秒后爆炸，伤害 80 + 击飞
        const d = clamp(p.input.ad || 140, 0, 220), bx = clamp(p.x + Math.cos(p.input.a) * d, 20, S.W - 20), by2 = clamp(p.y + Math.sin(p.input.a) * d, 20, S.H - 20);
        this.helpers.push({ id: this.nextId++, kind: 'charge', x: bx, y: by2, z: this.top(bx, by2), team: p.team, owner: p.id, t: 0.9, cd: 99 });
        break;
      }
      case 'flash':   // 韩冰：闪光弹——被闪到的敌人减速并「致盲」2.5 秒（2.2.1：只缩小视野，不再沉默 / 暴露 / 增伤）
        for (const e of this.players.values()) {
          if (!e.alive || e.team === p.team || dist(e, p) > 260) continue;
          let da = Math.atan2(e.y - p.y, e.x - p.x) - p.input.a; while (da > Math.PI) da -= Math.PI * 2; while (da < -Math.PI) da += Math.PI * 2;
          if (Math.abs(da) > 1.3) continue;
          e.slowT = Math.max(e.slowT, 1.2); e.charge = 0; e.burst = null;
          e.blindT = 2.5;   // 2.2.1：致盲 = 视野缩小到身边一圈（真人屏幕变暗，AI 看不到 180 以外的敌人）
          this.hurt(e, 12, p);
        }
        break;
      case 'decoy':   // 2.1 卡卡：替身会吸引 AI 的火力，2.5 秒后炸开（50 伤害 + 减速）；卡卡隐身加速 2.5 秒
        this.helpers.push({ id: this.nextId++, kind: 'decoy', x: p.x, y: p.y, z: p.z, team: p.team, owner: p.id, t: 2.5, cd: 99 });
        p.cloakT = Math.max(p.cloakT || 0, 2.5); p.cloakFast = true;
        break;
      case 'airdrop': {   // 2.1 霍克：战术空投——1 秒后补给箱落地
        const d = clamp(p.input.ad || 160, 40, 260), ax = clamp(p.x + Math.cos(p.input.a) * d, 24, S.W - 24), ay = clamp(p.y + Math.sin(p.input.a) * d, 24, S.H - 24);
        this.helpers.push({ id: this.nextId++, kind: 'supply', x: ax, y: ay, z: this.top(ax, ay), team: p.team, owner: p.id, t: 7, fall: 1, r: 100, cd: 99 });
        this.ev(['adp', r1(ax), r1(ay), r1(this.top(ax, ay)), p.team]);
        break;
      }
      case 'jam':   // 叶声：声波干扰——吸走 30% 大招充能、装填 -30%（3 秒）、打断技能 0.6 秒
        for (const e of this.players.values()) {
          if (!e.alive || e.team === p.team || dist(e, p) > 230) continue;
          e.sp = Math.max(0, e.sp - S.WEAPONS[e.weapon].spNeed * 0.25); e.jamT = 3; e.silenceT = Math.max(e.silenceT, 0.6);   // 2.2.1：不再暴露（暴露交给侦察型）
        }
        break;
      case 'seal': {   // 1.8 符零：封印符阵
        const d = clamp(p.input.ad || 200, 60, 240), sx = clamp(p.x + Math.cos(p.input.a) * d, 20, S.W - 20), sy = clamp(p.y + Math.sin(p.input.a) * d, 20, S.H - 20);
        this.helpers.push({ id: this.nextId++, kind: 'sealz', x: sx, y: sy, z: this.top(sx, sy), r: 105, team: p.team, owner: p.id, t: 2.5, cd: 0 });
        this.paint(sx, sy, this.top(sx, sy), 50, p.team, p);
        break;
      }
      case 'possess': p.possT = 4; break;   // 1.8 赤镰：恶灵附身
      case 'nano': {   // 2.2 姜黎：纳米雾场——队友回血，敌人减速 + 装填变慢
        const d = clamp(p.input.ad || 180, 40, 240), nx = clamp(p.x + Math.cos(p.input.a) * d, 20, S.W - 20), ny = clamp(p.y + Math.sin(p.input.a) * d, 20, S.H - 20), nz = this.top(nx, ny);
        this.helpers.push({ id: this.nextId++, kind: 'nano', x: nx, y: ny, z: nz, r: 130, team: p.team, owner: p.id, t: 4, cd: 99 });
        this.ev(['fg', r1(nx), r1(ny), r1(nz), 130, 4, p.team]);
        break;
      }
      case 'blink': {   // 2.2.1 沈零：相位闪移——瞬间闪到瞄准方向（最远 220），可以穿过墙壁；下一击 +35%
        const a = p.input.a, ux = Math.cos(a), uy = Math.sin(a), maxD = clamp(p.input.ad || 220, 60, 220);
        const ok = (x, y) => x > 20 && y > 20 && x < S.W - 20 && y < S.H - 20 && !this.M.solid[Math.floor(y / S.CELL) * S.GW + Math.floor(x / S.CELL)] && this.top(x, y) <= p.z + 45 && !S.insideAt(this.M, x, y, this.top(x, y) + 10);
        let tx = null, ty = null;
        for (let d = maxD; d >= 30; d -= 10) { const x = p.x + ux * d, y = p.y + uy * d; if (ok(x, y)) { tx = x; ty = y; break; } }
        if (tx != null) {
          this.ev(['blk2', p.id, r1(p.x), r1(p.y), r1(p.z), r1(tx), r1(ty), r1(this.top(tx, ty))]);
          this.paint(p.x, p.y, p.z, 30, p.team, p);
          p.x = tx; p.y = ty; p.z = this.top(tx, ty); p.vx = p.vy = p.vz = 0; p.sync++; p.lastPosT = this.time;
          this.paint(tx, ty, p.z, 36, p.team, p);
        }
        p.invulnT = Math.max(p.invulnT, 0.25); p.blinkT = 2;
        break;
      }
    }
  }
  // ---------------- 超载技能 ----------------
  activateOverload(p) {
    const O = S.OVERLOADS[p.pilot];
    p.ov = 0; p.ovT = S.OV_TIME + (p.bt >= 2 ? 2 : 0) + (p.tal.has('s6') ? 2 : 0); p.ovPulse = 0;
    this.ev(['ov', p.id, p.pilot, r1(p.x), r1(p.y), r1(p.z)]);
    const near = (r) => [...this.players.values()].filter((a) => a.alive && a.team === p.team && dist(a, p) < r);
    if (O.skillReset) { p.skillCd = 0; p.skillUses = Math.min(p.skillMax, p.skillUses + 1); }
    if (O.stealth) p.smokeT = Math.max(p.smokeT, p.ovT);
    if (O.hack) {   // 2.2.1 洛奇超载：全部敌人沉默 3 秒，并且每人失去 1 次技能充能（不再全图暴露——全图视野交给白夜）
      for (const e of this.players.values()) if (e.alive && e.team !== p.team) { e.silenceT = Math.max(e.silenceT, 3); e.charge = 0; e.burst = null; if (e.skillUses > 0) e.skillUses--; e.lockT = Math.max(e.lockT || 0, 3); }
    }
    if (O.burstHeal) for (const a of near(220)) { a.hp = Math.min(this.maxHpOf(a), a.hp + O.burstHeal); this.ev(['heal', a.id, O.burstHeal]); }
    if (O.drones) for (let i = 0; i < O.drones; i++) this.helpers.push({ id: this.nextId++, kind: 'drone', x: p.x, y: p.y, z: p.z + 40, team: p.team, owner: p.id, t: p.ovT, cd: 0.3 + i * 0.2, ang: i * Math.PI });
    if (O.rally) for (const a of near(300)) a.rallyT = Math.max(a.rallyT, p.ovT);
    if (O.domain) {   // 1.9.1 符零超载：简易领域——跟着自己走的领域，中和子弹、自动反击闯入者
      this.helpers = this.helpers.filter((h) => !(h.kind === 'domain' && h.owner === p.id));
      this.helpers.push({ id: this.nextId++, kind: 'domain', x: p.x, y: p.y, z: p.z, r: O.domain.r, team: p.team, owner: p.id, t: p.ovT + 0.2, cd: 99, hits: {}, k: p.bt >= 2 ? 1.25 : 1 });
    }
  }
  overloadTick(p, O, dt) {
    const k = p.bt >= 2 ? 1.25 : 1;
    if (O.aura) {   // 2.2 姜黎超载：协议覆写——队友回血减伤，敌人减速
      for (const a of this.players.values()) {
        if (!a.alive || Math.hypot(a.x - p.x, a.y - p.y) > O.aura.r || Math.abs(a.z - p.z) > 120) continue;
        if (a.team === p.team) { a.hp = Math.min(this.maxHpOf(a), a.hp + O.aura.heal * k * dt); a.auraT = 0.3; a.auraDef = O.aura.def; }
        else if (!a.boss) a.dslowT = Math.max(a.dslowT || 0, 0.3);
      }
    }
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
            const hv = h.heal != null ? h.heal : 110; if (hv) { a.hp = Math.min(this.maxHpOf(a), a.hp + hv); this.ev(['heal', a.id, hv]); }
            if (h.gift && !a.foot) a.sp = Math.min(S.WEAPONS[a.weapon].spNeed, a.sp + S.WEAPONS[a.weapon].spNeed * 0.4);   // 卡卡的惊喜礼盒：40% 大招充能（2.2.1：不再回血）
            return false;
          }
        }
        return true;
      }
      if (h.kind === 'charge') {   // 石磊的炸药：时间到就爆
        if (h.t <= 0.04) { this.explode(h.x, h.y, h.z + 8, 115, 86, 32, h.team, o); this.ev(['bx', r1(h.x), r1(h.y), r1(h.z + 8), h.team, 115, 0]); return false; }
        return true;
      }
      if (h.kind === 'wall') return true;
      if (h.kind === 'supply') {   // 霍克的补给箱：先砸下来；靠近的队友装满弹药、得到护盾、装填加快（2.2.1：不再回血）
        if (h.fall > 0) { h.fall -= dt; if (h.fall <= 0) { this.explode(h.x, h.y, h.z + 8, 70, 40, 24, h.team, o); this.ev(['bx', r1(h.x), r1(h.y), r1(h.z + 8), h.team, 70, 0]); this.paint(h.x, h.y, h.z, 50, h.team, o); } return true; }
        h.got = h.got || {};
        for (const a of this.players.values()) if (a.alive && a.team === h.team && Math.hypot(a.x - h.x, a.y - h.y) < h.r && Math.abs(a.z - h.z) < 60) {
          a.supT = 0.3;
          if (!h.got[a.id]) { h.got[a.id] = 1; a.ammo = S.AMMO; a.shield = Math.max(a.shield, 30); a.shieldT = Math.max(a.shieldT, 5); }   // 2.2.1：每人一次：装满弹药 + 30 护盾
        }
        return true;
      }
      if (h.kind === 'nano') {     // 2.2 姜黎的纳米雾场
        for (const a of this.players.values()) {
          if (!a.alive || Math.hypot(a.x - h.x, a.y - h.y) > h.r || Math.abs(a.z - h.z) > 70) continue;
          if (a.team === h.team) a.hp = Math.min(this.maxHpOf(a), a.hp + 15 * dt);
          else if (!a.boss) { a.dslowT = Math.max(a.dslowT || 0, 0.25); a.nanoT = 0.25; }
        }
        return true;
      }
      if (h.kind === 'phase') {    // 2.2 棱镜原型机：相位冻结（0.6 秒后展开）
        if (h.t <= 0.05) {
          for (const e of this.players.values()) {
            if (!e.alive || e.team === h.team || Math.hypot(e.x - h.x, e.y - h.y) > h.r || Math.abs(e.z - h.z) > 90) continue;
            this.hurt(e, 45, o, e.x - h.x, e.y - h.y, 0.3, 0);
            if (!e.boss) { e.bindT = Math.max(e.bindT || 0, 1.2); e.silenceT = Math.max(e.silenceT, 1.2); e.charge = 0; e.burst = null; this.ev(['bind', e.id]); }
          }
          this.paint(h.x, h.y, h.z, 70, h.team, o);
          this.ev(['bx', r1(h.x), r1(h.y), r1(h.z + 8), h.team, h.r, 2]);
          return false;
        }
        return true;
      }
      if (h.kind === 'recon') {    // 2.1 战术机兵的侦察无人机：暴露 + 标记
        for (const e of this.players.values()) if (e.alive && e.team !== h.team && Math.hypot(e.x - h.x, e.y - h.y) < 320) { e.revealT = Math.max(e.revealT || 0, 0.4); e.markT = Math.max(e.markT || 0, 0.4); e.markTeam = h.team; }
        return true;
      }   // 盾墙：挡子弹的判定在 updateProjs
      if (h.kind === 'sealz') {    // 1.8 符零的封印符阵：减速 + 封印技能 / 大招 + 暴露
        for (const e of this.players.values()) {
          if (!e.alive || e.team === h.team || Math.hypot(e.x - h.x, e.y - h.y) > h.r || Math.abs(e.z - h.z) > 60) continue;
          e.slowT = Math.max(e.slowT, 0.25); e.sealT = Math.max(e.sealT || 0, 0.25);
        }
        return true;
      }
      if (h.kind === 'domain') {   // 1.9.1 简易领域：跟着符零移动；闯进来的敌人被自动反击（每人 0.7 秒一次）
        const ow = this.players.get(h.owner);
        if (!ow || !ow.alive || ow.foot || !(ow.ovT > 0)) return false;
        h.x = ow.x; h.y = ow.y; h.z = ow.z;
        const D = S.OVERLOADS.fu.domain;
        for (const e of this.players.values()) {
          if (!e.alive || e.team === h.team) continue;
          const dx = e.x - h.x, dy = e.y - h.y, d = Math.hypot(dx, dy);
          if (d > h.r + 8 || Math.abs(e.z - h.z) > 90) continue;
          if ((h.hits[e.id] || 0) > this.time) continue;
          h.hits[e.id] = this.time + D.cd;
          e.slowT = Math.max(e.slowT, 0.8); e.sealT = Math.max(e.sealT || 0, 0.8);
          this.hurt(e, D.counter * h.k, ow, dx || 1, dy, 1.6);
          this.ev(['dmn', h.id, e.id, r1(h.x), r1(h.y), r1(h.z)]);
        }
        return true;
      }
      if (h.kind === 'dome') {     // 1.8 结界机兵的结界：队友减伤 + 回血，敌人减速（减伤在 hurt 里）
        for (const a of this.players.values()) {
          if (!a.alive || Math.hypot(a.x - h.x, a.y - h.y) > h.r || Math.abs(a.z - h.z) > 90) continue;
          if (a.team === h.team) a.hp = Math.min(this.maxHpOf(a), a.hp + 10 * dt); else a.dslowT = Math.max(a.dslowT || 0, 0.25);
        }
        return true;
      }
      if (h.kind === 'decoy') {    // 卡卡的替身：时间到就炸开
        if (h.t <= 0.04) {
          const dd = h.dmg || 55; this.explode(h.x, h.y, h.z + 10, 95, dd, 20, h.team, o); this.ev(['bx', r1(h.x), r1(h.y), r1(h.z + 10), h.team, 95, 0]);
          for (const e of this.players.values()) if (e.alive && e.team !== h.team && Math.hypot(e.x - h.x, e.y - h.y) < 95) e.slowT = Math.max(e.slowT, 1);
          return false;
        }
        return true;
      }
      if (h.kind === 'fog') {      // 毒雾：雾里的敌人中毒、减速、暴露
        h.cd -= dt;
        if (h.cd <= 0) {
          h.cd = 0.5;
          for (const e of this.players.values()) if (e.alive && e.team !== h.team && Math.hypot(e.x - h.x, e.y - h.y) < h.r && Math.abs(e.z - h.z) < 50) { this.sideFx(e, { poison: 1.2, slow: 0.6, by: h.owner }); }
        }
        return true;
      }
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
      const R = t.rad || (t.foot ? S.PILOT_R : S.R), H = t.boss ? 120 : t.foot ? 22 : S.PH;
      if (Math.hypot(t.x - x, t.y - y) < R + pad && z > t.z - pad && z < t.z + H + pad) return t;
    }
    return null;
  }

  fireCharger(p, ch, W) {
    const range = W.range * (0.35 + 0.65 * ch);
    const mz = this.muzzle(p);
    let dmg = (W.minDmg + (W.dmg - W.minDmg) * ch) * p.dmgMul;
    const pr = 13 + 8 * ch;   // 2.2：狙击 / 棱镜的光束涂得更宽
    let victim = null, lastPaint = -99, hitT = 0;
    const pierce = W.pierce && ch >= 0.9 && !p.foot, hits = [];   // 2.0 狙击：蓄满的一枪贯穿第一个敌人
    const b = this.obj.ball && this.obj.resetT <= 0 ? this.obj.ball : null;
    const end = this.trace(mz.x, mz.y, mz.z, mz.d, range, (x, y, z, t) => {
      const gh = this.top(x, y);
      if (z - gh < 45 && t - lastPaint > 12) { lastPaint = t; this.paint(x, y, gh, pr, p.team, p); }
      const v = this.hitPlayerAt(p.team, x, y, z, 5);
      if (v && !hits.includes(v)) { hits.push(v); victim = hits[0]; hitT = hitT || t; if (!pierce || hits.length >= 2) return true; }
      if (b && Math.hypot(b.x - x, b.y - y, b.r - z) < b.r + 4) { b.vx += mz.d.x * (250 + 450 * ch); b.vy += mz.d.y * (250 + 450 * ch); b.last = p.team; return true; }
      return false;
    });
    if (victim) {
      if (p.pilot === 'frost' && hitT > W.range * 0.6) dmg *= 1.08;
      this.hurt(victim, dmg, p, mz.d.x, mz.d.y);
      if (hits[1]) { this.hurt(hits[1], dmg * W.pierce, p, mz.d.x, mz.d.y); this.ev(['prc', hits[1].id]); }
      if (W.slowHit && !p.foot) victim.slowT = Math.max(victim.slowT, W.slowHit);   // 2.2 棱镜：光束减速
      if (W.refract && ch >= 0.9 && !p.foot && victim.alive !== undefined) {         // 2.2 棱镜折射：跳到附近另一个敌人
        let best = null, bd = W.refract.r;
        for (const t of this.players.values()) { if (!t.alive || t === victim || t.team === p.team) continue; const d = Math.hypot(t.x - victim.x, t.y - victim.y); if (d < bd && Math.abs(t.z - victim.z) < 80) { bd = d; best = t; } }
        if (best) {
          this.hurt(best, dmg * W.refract.k, p, best.x - victim.x, best.y - victim.y); best.slowT = Math.max(best.slowT, W.slowHit || 0);
          this.ev(['ln', r1(victim.x), r1(victim.y), r1(victim.z + 18), r1(best.x), r1(best.y), r1(best.z + 18), p.team, 0.6, p.id]);
        }
      }
    }
    this.paint(end.x, end.y, this.top(end.x, end.y), 18 + 12 * ch, p.team, p);
    this.ev(['ln', r1(mz.x), r1(mz.y), r1(mz.z), r1(end.x), r1(end.y), r1(end.z), p.team, r2(ch), p.id]);
    if (ch > 0.5) this.knock(p, -mz.d.x, -mz.d.y, 170 * ch, 0);   // 狙击后坐力
  }

  paint(x, y, z, r, team, owner) {
    if (this.mode === 'seal' && team > 2) return 0;   // 1.8：中立咒灵不涂地
    if (owner && owner.tal && owner.tal.has('p1')) r *= 1.12;   // 天赋：大号喷嘴
    const n = S.paintCircle(this.grid, this.M, x, y, z, r, team, (i) => this.diff.push(i * 16 + team));
    if (owner && n) this.credit(owner, n);
    return n;
  }
  credit(owner, n) {
    if (!this.players.has(owner.id)) return;
    owner.stats.paint += n;
    if (!(owner.spT > 0) && !(owner.noSpUntil > this.time)) owner.sp = Math.min(S.WEAPONS[owner.weapon].spNeed, owner.sp + n * 0.6 * (owner.pilot === 'yuzu' ? 1.6 : 1) * (owner.tal.has('p3') ? 1.25 : 1));
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
      if (by.pilot === 'han' && t.hp > this.maxHpOf(t) * 0.7) dmg *= 1.1;    // 韩冰被动：倒戈（2.1：生命高于 70% 的敌人 +10%）
      if (t.markT > 0 && t.markTeam === by.team) dmg *= 1.12;   // 2.2.1：侦察无人机的「标记」

      if (by.pilot === 'fu' && t.slowT > 0) dmg *= 1.1;                        // 符零被动：符咒共鸣
      if (by.pilot === 'aka' && by.hp < this.maxHpOf(by) * 0.5) dmg *= 1.22;   // 赤镰被动：恶灵低语
      if (by.team !== t.team && !by.foot && !t.foot && !t.npc && !t.boss) dmg *= S.mechEdge(by.weapon, t.weapon);   // 2.2：机体定位克制 +6%
      const BW = !by.foot && S.WEAPONS[by.weapon];
      if (BW && BW.backstab && by.team !== t.team) {   // 刺客机体：从背后命中（在目标朝向 ±110° 以外）伤害提高
        let da = Math.atan2(by.y - t.y, by.x - t.x) - t.input.a; while (da > Math.PI) da -= Math.PI * 2; while (da < -Math.PI) da += Math.PI * 2;
        if (Math.abs(da) > 1.92) { dmg *= BW.backstab; this.ev(['bs', t.id]); }
      }
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
    if (t.possT > 0) dmg *= 0.85;   // 恶灵附身
    if (t.auraT > 0) dmg *= t.auraDef || 0.85;   // 2.2 姜黎的协议覆写
    for (const h of this.helpers) if (h.kind === 'dome' && h.team === t.team && Math.hypot(t.x - h.x, t.y - h.y) < h.r && Math.abs(t.z - h.z) < 90) { dmg *= 0.7; break; }   // 己方结界
    if (t.pilot === 'flag') {   // 岚被动：附近每个队友 -10%（1.9.1：-8% → -10%，范围 200 → 260）
      let n = 0;
      for (const a of this.players.values()) if (a !== t && a.alive && a.team === t.team && Math.hypot(a.x - t.x, a.y - t.y) < 260) n++;
      dmg *= 1 - 0.12 * Math.min(3, n);   // 2.1：每个队友 -12%（最多 -36%）
    }
    if (kdx != null && !(tOV && tOV.noKb) && !t.boss) this.knock(t, kdx, kdy, Math.min(300, dmg * 1.8 * (kmul || 1)) * (t.wheel ? 1.35 : t.foot ? 1.5 : 1), kup || 0);
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
    if (by && by !== t && by.team !== t.team) (t.hitBy || (t.hitBy = {}))[by.id] = this.time;   // 1.9：助攻——8 秒内打过它的人
    if (by && by !== t && by.team !== t.team && by.alive && this.players.has(by.id)) {   // 1.8：赤镰吸血（恶灵附身 / 灵化爆发）
      const bo2 = by.ovT > 0 ? S.OVERLOADS[by.pilot] : null;
      const heal = (by.possT > 0 ? dmg * 0.35 : 0) + (bo2 && bo2.hitHeal ? bo2.hitHeal : 0);
      if (heal > 0) by.hp = Math.min(this.maxHpOf(by), by.hp + heal);
    }
    // 打中敌人给大招充能
    if (by && by.team !== t.team && this.players.has(by.id) && !by.foot && !(by.spT > 0) && !(by.noSpUntil > this.time)) {
      const bo = by.ovT > 0 ? S.OVERLOADS[by.pilot] : null;
      by.sp = Math.min(S.WEAPONS[by.weapon].spNeed, by.sp + dmg * (by.pilot === 'candy' ? 1.3 : 1) * (by.tal.has('a3') ? 1.15 : 1) * (bo && bo.spGain ? bo.spGain : 1));
    }
    // 超载充能：突破 I 以后（2.2：可以多次使用，放完重新充）
    if (by && by !== t && by.team !== t.team && by.bt >= 1 && by.ovT <= 0 && this.players.has(by.id)) by.ov = Math.min(S.OV_NEED, by.ov + dmg * (by.tal.has('s3') ? 1.2 : 1));
    this.ev(['hit', t.id, by ? by.id : 0, 0, Math.round(dmg)]);
    if (t.hp <= 0) { if (t.boss) this.bossDown(t, by); else if (t.foot || t.spirit) this.kill(t, by); else this.wreck(t, by); }
  }
  onTakedown(by, t) {
    if (!by || !this.players.has(by.id)) return;
    by.stats.kills++;
    if (by.ovT > 0 && S.OVERLOADS[by.pilot] && S.OVERLOADS[by.pilot].killCharge) by.skillUses = Math.min(by.skillMax, by.skillUses + 1);   // 2.2 沈零：零式解放
    if (t && t.hitBy) { for (const id in t.hitBy) { const q = this.players.get(+id); if (q && q !== by && q.team !== t.team && this.time - t.hitBy[id] < 8) q.stats.assists++; } t.hitBy = null; }
    if (this.chat && t) this.chat.onKill(by, t);
    if (by.pilot === 'kaka' && t) this.helpers.push({ id: this.nextId++, kind: 'bento', gift: 1, heal: 0, ang: 7, x: t.x, y: t.y, z: this.top(t.x, t.y), team: by.team, owner: by.id, t: 12, armed: 0.4 });   // 卡卡被动：惊喜礼盒
    if (by.pilot === 'blaze' && by.alive) by.hp = Math.min(this.maxHpOf(by), by.hp + this.maxHpOf(by) * 0.4);
    if (by.tal && by.tal.has('s4') && by.alive) by.hp = Math.min(this.maxHpOf(by), by.hp + 15);
  }
  // 机体被摧毁：驾驶员弹出，6 秒后在驾驶员所在位置空投新机体
  wreck(t, by) {
    const x = t.x, y = t.y, z = t.z;
    if (by && by !== t) this.onTakedown(by, t);
    this.paint(x, y, this.top(x, y), 55, by ? by.team : this.teams > 2 ? 0 : 3 - t.team, by && this.players.has(by.id) ? by : null);
    this.dropItems(t);
    t.foot = true; t.hp = S.PILOT_HP; t.rebuildT = this.oneLife && !this.loot ? 1e9 : S.REBUILD - (t.pilot === 'aurora' ? 2 : 0) - (t.tal && t.tal.has('d3') ? 1 : 0);   // 一条命的模式：机体不会重建
    t.charge = 0; t.burst = null; t.rollT = 0; t.spT = 0; t.spKind = null; t.shield = 0; t.shieldT = 0; t.quakeT = 0;
    const sh = (t.pilot === 'hammer' ? 60 : 0) + (t.tal && t.tal.has('d2') ? 25 : 0);   // 石磊被动 / 天赋：弹出护盾
    if (sh) { t.shield = sh; t.shieldT = 6; }
    t.invulnT = 0.7; t.ammo = S.AMMO; t.wheel = false;
    this.ev(['wreck', by ? by.id : 0, t.id, r1(x), r1(y), r1(z)]);
    if (t.pilot === 'vet') { this.explode(x, y, z, 100, 58, 24, t.team, t); this.ev(['bx', r1(x), r1(y), r1(z), t.team, 100, 0]); }
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
    if (this.loot) {   // 2.1 搜刮撤离：阵亡留下一具遗骸（背包里的东西都在里面，要搜）；安全箱里的东西不掉
      const drop = t.inv.items.map((it) => it.k); t.inv.items = []; this.syncBag(t);
      if (t.guard) {
        const hi = this.risk === 'high';
        drop.push(S.rollLoot(t.guard.hv ? 5 : 4, hi), S.rollLoot(3, hi));
        if (Math.random() < (t.guard.hv ? 0.5 : 0.25)) drop.push(S.rollLoot(5, hi));
        if (t.lootBoss) drop.push(S.rollLoot(6, true), S.rollLoot(6, true), S.rollLoot(5, true));
      }
      if (drop.length) this.makeCont('body', t.x, t.y, 0, false, false, drop);
      if (t.openC) t.openC = 0;
      this.sendBag(t);
    }
    t.charge = 0; t.burst = null; t.rollT = 0; t.spT = 0; t.spKind = null; t.shield = 0; t.shieldT = 0; t.foot = false;
    if (t.spirit) {   // 1.8：咒灵不复活；封印争夺里掉落封印石
      t.respawnT = 1e9;
      if (by && by !== t && !by.npc && this.players.has(by.id)) by.stats.spirits++;
      if (this.mode === 'seal') for (let i = 0; i < S.SEAL.drop; i++) this.dropStone(t.x, t.y, t.z);
      this.ev(['kill', by ? by.id : 0, t.id, r1(t.x), r1(t.y), r1(t.z)]);
      return;
    }
    const team = by ? by.team : this.teams > 2 ? 0 : 3 - t.team;
    this.paint(t.x, t.y, this.top(t.x, t.y), 40, team, by && this.players.has(by.id) ? by : null);
    if (by && by !== t) this.onTakedown(by, t);
    t.sp = Math.floor(t.sp * 0.5);
    this.dropItems(t);
    this.ev(['kill', by ? by.id : 0, t.id, r1(t.x), r1(t.y), r1(t.z)]);
  }

  respawn(p) {
    const sp = p.guard ? { x: p.guard.x, y: p.guard.y }
      : this.loot && this.spawns && this.spawns[p.team] ? { x: this.spawns[p.team].x + ((p.slot % 2) - 0.5) * 40, y: this.spawns[p.team].y + (Math.floor(p.slot / 2) - 0.5) * 40 }
      : this.spawns && this.spawns[p.team] ? { x: this.spawns[p.team].x + (p.slot ? 34 : 0), y: this.spawns[p.team].y + (p.slot ? 20 : 0) } : S.spawnPoint(p.team, p.slot);
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
      if (this.domainBlocks(m.team, m.x, m.y, m.z)) { this.ev(['blk', 0, r1(m.x), r1(m.y), r1(m.z + 10)]); return false; }
      this.explode(m.x, m.y, m.z, 80, S.MISSILE.dmg, S.MISSILE.min, m.team, this.players.get(m.owner));
      this.ev(['bx', r1(m.x), r1(m.y), r1(m.z), m.team, 80, 0]);
      return false;
    });
  }
  explode(x, y, z, r, maxD, minD, team, owner, noLos) {
    this.paint(x, y, z, r, team, owner);
    if (this.mode === 'park' && this.obj.balloons) for (const b of this.obj.balloons.slice()) if (Math.hypot(b.x - x, b.y - y) < r + 16 && Math.abs(b.z - z) < r + 70) this.popBalloon(b, team, owner);
    for (const t of this.players.values()) {
      if (!t.alive || t.team === team) continue;
      const d = Math.hypot(t.x - x, t.y - y, t.z + 18 - z - 10);
      const tr = t.rad || S.R;
      if (d < r + tr && (noLos || S.los3(this.M, x, y, z + 10, t.x, t.y, t.z + 18))) { const k = Math.max(0, 1 - d / (r + tr)); this.hurt(t, minD + (maxD - minD) * k, owner, t.x - x, t.y - y, 1.6, 90 + 160 * k); }
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
    p.noSpUntil = this.time + 3;   // 2.1.2：放大招后 3 秒内造成的伤害不再给大招充能（延迟落下的导弹 / 炮弹也算），防止「大招刷新大招」
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
        for (let i = 0; i < 4; i++) this.helpers.push({ id: this.nextId++, kind: 'drone', x: p.x, y: p.y, z: p.z + 40, team: p.team, owner: p.id, t: 8, cd: 0.25 + i * 0.12, ang: (i * Math.PI * 2) / 4 });
        p.repT = 8;   // 2.1：蜂群里有一架维修无人机，8 秒内每秒回复 3% 生命
        break;
      case 'whirl': p.spT = 2.2; break;
      case 'aegis': {
        p.spT = 0.3;
        const wx = p.x + Math.cos(a) * 46, wy = p.y + Math.sin(a) * 46;
        this.helpers.push({ id: this.nextId++, kind: 'wall', x: wx, y: wy, z: this.top(wx, wy), team: p.team, owner: p.id, t: 7, cd: 99, ang: a + Math.PI / 2, half: 80 });
        p.shield = Math.max(p.shield || 0, 40); p.shieldT = Math.max(p.shieldT || 0, 7);   // 2.1：立盾墙时自己获得 40 点护盾
        break;
      }
      case 'sonic':
        p.spT = 0.3;
        this.explode(p.x, p.y, p.z + 10, 230, 48, 26, p.team, p, true);
        this.ev(['bx', r1(p.x), r1(p.y), r1(p.z + 10), p.team, 230, 2]);
        break;
      case 'charge': p.spT = 4; break;
      case 'beam': p.spT = 2.6; break;
      case 'cluster': {   // 弹弓：扇形 5 颗弹跳球
        p.spT = 0.4;
        const d = clamp(p.input.ad || 240, 120, 360);
        for (let i = -2; i <= 2; i++) { const aa = a + i * 0.2, sh = this.spawnShellRet(p, p.x + Math.cos(aa) * d, p.y + Math.sin(aa) * d, 34, 48, 0.5 + Math.abs(i) * 0.06); if (sh) sh.bounce = 1; }
        break;
      }
      case 'shadowstep': {   // 影刃：冲过去，路上的敌人受伤，随后隐身
        p.spT = 0.3;
        const d = clamp(p.input.ad || 220, 100, 260), ux = Math.cos(a), uy = Math.sin(a);
        for (const t of this.players.values()) {
          if (!t.alive || t.team === p.team) continue;
          const dx = t.x - p.x, dy = t.y - p.y, along = dx * ux + dy * uy, across = Math.abs(-dx * uy + dy * ux);
          if (along > -10 && along < d + 20 && across < 34 + (t.rad || 0) && Math.abs(t.z - p.z) < (t.boss ? 120 : 40)) this.hurt(t, 60, p, ux, uy, 1.2, 60);
        }
        this.paint(p.x + ux * d * 0.5, p.y + uy * d * 0.5, p.z, 40, p.team, p);
        this.knock(p, ux, uy, Math.min(1000, d * 3.6), 0);
        p.invulnT = Math.max(p.invulnT, 0.4); p.cloakT = 1.5; p.cloakFast = true;
        break;
      }
      case 'prism': {   // 2.2 棱镜原型机：相位冻结
        p.spT = 0.3;
        const d = clamp(p.input.ad || 300, 80, 460), px = clamp(p.x + Math.cos(a) * d, 20, S.W - 20), py = clamp(p.y + Math.sin(a) * d, 20, S.H - 20);
        this.helpers.push({ id: this.nextId++, kind: 'phase', x: px, y: py, z: this.top(px, py), r: 140, team: p.team, owner: p.id, t: 0.65, cd: 99 });
        this.ev(['ln', r1(p.x), r1(p.y), r1(p.z + S.MUZZLE), r1(px), r1(py), r1(this.top(px, py) + 4), p.team, 0.5, p.id]);
        break;
      }
      case 'lancestorm':   // 2.2 枪骑原型机：三段突袭（每 0.26 秒一段，可以重新瞄准）
        p.spT = 0.85; p.lsN = 3; p.lsT = 0; p.lsHit = {};
        break;
      case 'venom': {   // 毒针：毒雾罐
        p.spT = 0.3;
        const d = clamp(p.input.ad || 260, 80, 420);
        const sh = this.spawnShellRet(p, p.x + Math.cos(a) * d, p.y + Math.sin(a) * d, 20, 60, 0.7);
        if (sh) sh.fog = 1;
        break;
      }
      case 'recon': {   // 2.1 战术机兵：侦察无人机
        p.spT = 0.3;
        const d = clamp(p.input.ad || 260, 60, 420), rx = clamp(p.x + Math.cos(a) * d, 20, S.W - 20), ry = clamp(p.y + Math.sin(a) * d, 20, S.H - 20);
        this.helpers.push({ id: this.nextId++, kind: 'recon', x: rx, y: ry, z: this.top(rx, ry) + 80, team: p.team, owner: p.id, t: 8, cd: 99 });
        break;
      }
      case 'cloak':   // 2.1 幻影：隐身 4.5 秒，原地留下一个会炸开的残影（吸引 AI 火力）
        p.spT = 0.3; p.cloakT = 5; p.cloakFast = true;   // 2.2.1：不再留残影（替身是卡卡的招牌）
        break;
      case 'barrier':   // 1.8 结界展开
        p.spT = 0.4;
        this.helpers.push({ id: this.nextId++, kind: 'dome', x: p.x, y: p.y, z: this.top(p.x, p.y), r: 150, team: p.team, owner: p.id, t: 6, cd: 0 });
        this.paint(p.x, p.y, p.z, 80, p.team, p);
        for (const a of this.players.values()) {   // 1.9.1：展开瞬间把里面的敌人弹出去，队友得到 40 点护盾
          if (!a.alive || Math.hypot(a.x - p.x, a.y - p.y) > 150 || Math.abs(a.z - p.z) > 90) continue;
          if (a.team === p.team) { a.shield = Math.max(a.shield, 40); a.shieldT = Math.max(a.shieldT, 4); }
          else if (!a.boss) { const dx = a.x - p.x, dy = a.y - p.y, l = Math.hypot(dx, dy) || 1; this.knock(a, dx / l, dy / l, 300, 60); a.slowT = Math.max(a.slowT, 1); }
        }
        break;
      case 'rend': p.spT = 0.5; p.rendArm = true; p.rendA = a; break;   // 1.8 裂空斩：蓄力 0.35 秒后出刀
      case 'missiles': {
        p.spT = 0.3;
        // 2.1.2：只锁定 1100 范围内、看得见的敌人（草丛 / 隐身里的不算），最多 4 个，由近到远
        const vis = (e) => !e.hidden || this.reveal[p.team] > this.time || e.revealT > 0;
        const targets = [...this.players.values()].filter((e) => e.alive && e.team !== p.team && !e.guard && vis(e) && Math.hypot(e.x - p.x, e.y - p.y) < S.MISSILE.range)
          .sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y)).slice(0, S.MISSILE.max).map((e) => ({ x: e.x, y: e.y }));
        let guard = 0;
        while (targets.length < 4 && guard++ < 50) {
          const a0 = Math.random() * Math.PI * 2, d0 = rand(200, S.MISSILE.range * 0.8), x = clamp(p.x + Math.cos(a0) * d0, 120, S.W - 120), y = clamp(p.y + Math.sin(a0) * d0, 80, S.H - 80);
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
      case 'lancestorm':
        p.lsT -= dt;
        if (p.lsN > 0 && p.lsT <= 0) {
          p.lsN--; p.lsT = 0.26;
          const a = p.input.a, ux = Math.cos(a), uy = Math.sin(a), d = 170;
          for (const t of this.players.values()) {
            if (!t.alive || t.team === p.team) continue;
            const dx = t.x - p.x, dy = t.y - p.y, along = dx * ux + dy * uy, across = Math.abs(-dx * uy + dy * ux);
            if (along > -10 && along < d + 30 && across < 34 + (t.rad || 0) && Math.abs(t.z - p.z) < (t.boss ? 120 : 40)) this.hurt(t, 40, p, ux, uy, 1.1, 40);
          }
          this.paint(p.x + ux * d * 0.5, p.y + uy * d * 0.5, p.z, 36, p.team, p);
          this.knock(p, ux, uy, d * 3.4, 0);
          p.invulnT = Math.max(p.invulnT, 0.22);
          this.ev(['pu', p.id, r2(a)]);
          if (p.lsN === 0) { p.shield = Math.max(p.shield, 30); p.shieldT = Math.max(p.shieldT, 4); }
        }
        break;
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
      case 'rend':
        if (p.rendArm && p.spT <= 0.15) {
          p.rendArm = false;
          const a = p.rendA, ux = Math.cos(a), uy = Math.sin(a), L = 520;
          for (const t of this.players.values()) {
            if (!t.alive || t.team === p.team) continue;
            const dx = t.x - p.x, dy = t.y - p.y, along = dx * ux + dy * uy, across = Math.abs(-dx * uy + dy * ux);
            if (along > -10 && along < L && across < 40 + (t.boss ? t.rad || 0 : 0) && Math.abs(t.z - p.z) < 70) this.hurt(t, 85, p, ux, uy, 1.6, 120);
          }
          for (let d = 24; d < L; d += 26) { const x = p.x + ux * d, y = p.y + uy * d; if (x < 0 || y < 0 || x > S.W || y > S.H) break; this.paint(x, y, this.top(x, y), 26, p.team, p); }
          this.ev(['rend', p.id, r1(p.x), r1(p.y), r1(p.z), r2(a), L, p.team]);
          this.knock(p, ux, uy, 420, 0); p.invulnT = Math.max(p.invulnT, 0.35);   // 1.9.1：裂空斩出刀时人跟着刀光冲过去
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
          if (h.kind === 'domain') { if (h.team !== pr.team && pr.z < h.z + 130 && Math.hypot(pr.x - h.x, pr.y - h.y) < h.r) { blocked = true; break; } continue; }   // 1.9.1 简易领域：中和子弹
          if (h.kind !== 'wall' || h.team === pr.team || pr.z > h.z + 80) continue;
          const ux = Math.cos(h.ang), uy = Math.sin(h.ang), dx = pr.x - h.x, dy = pr.y - h.y, along = dx * ux + dy * uy, across = -dx * uy + dy * ux;
          if (Math.abs(along) <= h.half && Math.abs(across) < 9 + pr.size) { blocked = true; break; }
        }
        if (blocked) { dead = true; this.ev(['blk', 0, r1(pr.x), r1(pr.y), r1(pr.z)]); break; }
        const victim = this.hitPlayerAt(pr.team, pr.x, pr.y, pr.z, pr.size);
        if (victim) {
          const far = owner && owner.pilot === 'frost' && pr.t * Math.hypot(pr.vx, pr.vy) > pr.range * 0.6;
          const close = pr.w && S.WEAPONS[pr.w].close && Math.hypot(pr.x - pr.x0, pr.y - pr.y0) < 110 ? S.WEAPONS[pr.w].close : 1;   // 2.0 泼桶：近身爆发
          this.hurt(victim, pr.dmg * close * (far ? 1.15 : 1), owner, pr.vx, pr.vy, pr.kb);
          if (pr.fx) this.sideFx(victim, pr.fx.poison || pr.fx.ward || pr.fx.burn ? Object.assign({ by: pr.owner }, pr.fx) : pr.fx);
          this.paint(pr.x, pr.y, victim.z, pr.splat * 0.6, pr.team, owner);
          dead = true; break;
        }
        if (this.mode === 'park' && this.obj.balloons.length) {
          const bl = this.obj.balloons.find((b) => Math.hypot(b.x - pr.x, b.y - pr.y, b.z + 10 - pr.z) < 20 + pr.size);
          if (bl) { this.popBalloon(bl, pr.team, owner); dead = true; break; }
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

  // ================= 1.6：搜刮撤离 =================
  applyGear(p, gear) {
    const G = new Set(gear.filter((g) => S.LOOT.gear[g]));
    if (G.has('armor')) { p.maxHp = Math.round(p.maxHp * 1.25); p.hp = p.maxHp; }
    if (G.has('pack')) p.bagCap += 6;
    const bd = S.bagDims([...G]); p.inv = { w: bd[0], h: bd[1], items: [] };   // 2.1 网格背包
    if (G.has('kit')) p.kit = 1;
    p.gear = [...G];
  }
  dropLoot(k, x, y, quiet) {
    if (!S.LOOT.items[k]) return null;
    x = clamp(x, 24, S.W - 24); y = clamp(y, 24, S.H - 24);
    if (this.M.solid[Math.floor(y / S.CELL) * S.GW + Math.floor(x / S.CELL)]) return null;
    const it = { id: this.nextId++, k, x, y, z: this.top(x, y) };
    this.obj.items.push(it);
    if (!quiet) this.ev(['lt+', it.id, k, r1(x), r1(y), r1(it.z)]);
    return it;
  }
  lootList() { return this.obj.items.map((it) => [it.id, it.k, r1(it.x), r1(it.y), r1(it.z)]); }
  scatter(items, x, y) {
    items.forEach((k, i) => { const a = (i / Math.max(1, items.length)) * Math.PI * 2 + Math.random(), d = 16 + Math.random() * 26; this.dropLoot(k, x + Math.cos(a) * d, y + Math.sin(a) * d) || this.dropLoot(k, x, y); });
  }
  // ================= 2.1 撤离：容器 / 网格背包 / 撤离点 =================
  makeCont(type, x, y, tier, hi, roof, keys) {
    const T = S.LOOT.conts[type] || S.LOOT.conts.duffel;
    let items = keys;
    if (!items) {
      const [a, b] = T.n || [1, 2], n = randInt(b - a + 1) + a + (hi ? (Math.random() < 0.5 ? 1 : 0) : 0);
      items = []; for (let k = 0; k < n; k++) items.push(S.rollLoot(Math.min(6, tier + (T.bump || 0)), hi, null, T.kinds));
    }
    const z = roof ? S.LEVEL_H[5] : this.top(x, y);
    const c = { id: this.nextId++, type, x, y, z, items: items.filter((k) => S.LOOT.items[k]), rev: 0, state: 0 };
    if (type === 'pile') c.rev = c.items.length;
    this.obj.conts.push(c); this.obj.contMap.set(c.id, c);
    if (this.started) this.ev(['ct+', c.id, S.CONT_IDS.indexOf(type), r1(x), r1(y), r1(z), this.contState(c)]);
    return c;
  }
  contState(c) { return !c.items.length ? 2 : c.state ? 1 : 0; }
  setContState(c, st) { const before = this.contState(c); c.state = st; if (this.contState(c) !== before) this.ev(['ct', c.id, this.contState(c)]); }
  syncBag(p) { p.bag = p.inv.items.map((it) => it.k); }
  sendBag(p) {
    this.syncBag(p);
    if (p.bot || this.room.manual) return;
    const c = this.room.members.get(p.id);
    if (c) c.conn.send({ t: 'bag', inv: p.inv, safe: p.safe, gear: p.gear || [], items: p.bag, cap: p.inv.w * p.inv.h });
  }
  sendCont(p) {   // 正在看的容器：已经搜出来的物资 + 还没搜的数量 + 当前这件的进度
    if (p.bot || this.room.manual) return;
    const m = this.room.members.get(p.id); if (!m) return;
    const c = p.openC && this.obj.contMap.get(p.openC);
    if (!c) { m.conn.send({ t: 'cv', id: 0 }); return; }
    const shown = Math.min(c.rev, c.items.length);
    m.conn.send({ t: 'cv', id: c.id, type: c.type, items: c.items.slice(0, shown), hidden: c.items.length - shown, need: shown < c.items.length ? this.searchNeed(c, p) : 0, prog: p.srch });
  }
  searchNeed(c, p) { const k = c.items[Math.min(c.rev, c.items.length - 1)]; return S.LOOT.search((S.LOOT.items[k] || {}).r) * (c.type === 'body' ? 0.7 : 1) * (p.pilot === 'raven' ? 0.85 : p.pilot === 'hawk' ? 0.8 : 1); }
  viewers(c) { const out = []; for (const q of this.players.values()) if (q.openC === c.id) out.push(q); return out; }
  canReach(p, c) { return Math.hypot(p.x - c.x, p.y - c.y) < S.LOOT.openR && Math.abs(p.z - c.z) < 60; }
  // 玩家的背包操作（客户端发 {t:'lo', a: ...}）
  lootOp(p, m) {
    if (!p || !this.loot || !p.alive || p.out || p.guard) return;
    const o = this.obj, invOf = (w) => (w === 'safe' ? p.safe : p.inv);
    switch (m.a) {
      case 'open': {
        const c = o.contMap.get(m.c | 0);
        if (!c || !this.canReach(p, c)) return;
        p.openC = c.id; p.srch = 0;
        if (!c.state) this.setContState(c, 1);
        this.sendCont(p); return;
      }
      case 'close': p.openC = 0; this.sendCont(p); return;
      case 'take': {   // 从容器拿一件：x/y/r 指定位置，不指定就自动找空位；to = 'safe' 放进安全箱
        const c = o.contMap.get(m.c | 0), i = m.i | 0;
        if (!c || p.openC !== c.id || !this.canReach(p, c) || i < 0 || i >= Math.min(c.rev, c.items.length)) return;
        const k = c.items[i], inv = invOf(m.to);
        const pos = Number.isInteger(m.x) && Number.isInteger(m.y) && S.invFits(inv, k, m.x, m.y, m.r ? 1 : 0) ? { x: m.x, y: m.y, rot: m.r ? 1 : 0 } : S.invPlace(inv, k);
        if (!pos) { this.toast(p, inv === p.safe ? '安全箱放不下了' : '背包放不下了'); return; }
        c.items.splice(i, 1); c.rev = Math.max(0, c.rev - 1);
        inv.items.push({ id: this.nextId++, k, x: pos.x, y: pos.y, rot: pos.rot });
        if (!c.items.length) this.setContState(c, 2);
        this.ev(['lt-', c.id, p.id, k]);
        this.sendBag(p); for (const q of this.viewers(c)) this.sendCont(q);
        return;
      }
      case 'move': {   // 背包 / 安全箱之间挪动、旋转
        const from = invOf(m.from), to = invOf(m.to), it = from.items.find((x) => x.id === (m.id | 0));
        if (!it) return;
        const rot = m.r ? 1 : 0;
        if (!Number.isInteger(m.x) || !Number.isInteger(m.y) || !S.invFits(to, it.k, m.x, m.y, rot, from === to ? it.id : -1)) { this.sendBag(p); return; }
        if (from !== to) { from.items.splice(from.items.indexOf(it), 1); to.items.push(it); }
        it.x = m.x; it.y = m.y; it.rot = rot;
        this.sendBag(p); return;
      }
      case 'drop': {   // 扔掉：扔进正在看的容器，或者在脚下堆一堆
        const from = invOf(m.from), it = from.items.find((x) => x.id === (m.id | 0));
        if (!it) return;
        from.items.splice(from.items.indexOf(it), 1);
        let c = p.openC && o.contMap.get(p.openC);
        if (c && this.canReach(p, c)) { const all = c.rev >= c.items.length; c.items.push(it.k); if (all) c.rev = c.items.length; else { c.items.splice(c.items.length - 1, 1); c.items.splice(c.rev, 0, it.k); c.rev++; } this.setContState(c, 1); }
        else {
          c = o.conts.find((q) => q.type === 'pile' && Math.hypot(q.x - p.x, q.y - p.y) < 36 && Math.abs(q.z - p.z) < 30);
          if (c) { c.items.push(it.k); c.rev = c.items.length; this.setContState(c, 1); } else c = this.makeCont('pile', p.x + rand(-10, 10), p.y + rand(-10, 10), 0, false, false, [it.k]);
        }
        this.sendBag(p); for (const q of this.viewers(c)) this.sendCont(q);
        return;
      }
      case 'use': {   // 2.1.1：使用消耗品（急救针 / 护盾电池 / 肾上腺素 / 维修包）
        const from = invOf(m.from), it = from.items.find((x) => x.id === (m.id | 0)), U = it && S.LOOT.items[it.k].use;
        if (!U || (p.useT || 0) > this.time) return;
        from.items.splice(from.items.indexOf(it), 1);
        p.useT = this.time + 1;
        if (U.heal) p.hp = Math.min(this.maxHpOf(p), p.hp + U.heal);
        if (U.shield) { p.shield = Math.max(p.shield || 0, U.shield); p.shieldT = Math.max(p.shieldT || 0, 10); }
        if (U.rush) p.rushT = Math.max(p.rushT || 0, U.rush);
        this.ev(['use', p.id, it.k]);
        this.sendBag(p); return;
      }
      case 'lever': {
        const L = o.lever;
        if (!L || Math.hypot(p.x - L.x, p.y - L.y) > 70 || L.until > this.time) return;
        L.until = this.time + S.LOOT.ext.lever.open;
        for (const e of o.ex) if (e.type === 'lever') { e.open = this.time; e.close = L.until; e.told = 0; }
        this.ev(['lev', p.id, Math.round(S.LOOT.ext.lever.open)]);
        return;
      }
    }
  }
  toast(p, text) { if (p.bot || this.room.manual) return; const m = this.room.members.get(p.id); if (m) m.conn.send({ t: 'toast', text }); }
  exOpen(e) { return this.time >= e.open && this.time < e.close; }
  // AI 拿东西：从容器里挑最值钱、放得下的
  botTake(p, c) {
    const shown = Math.min(c.rev, c.items.length);
    let best = -1, bv = 0;
    for (let i = 0; i < shown; i++) { const I = S.LOOT.items[c.items[i]]; if (I.v / I.size > bv && S.invPlace(p.inv, c.items[i])) { bv = I.v / I.size; best = i; } }
    if (best < 0) {   // 背包满了：扔掉最不值钱的，换更值钱的
      let cand = -1, cv = 0;
      for (let i = 0; i < shown; i++) { const I = S.LOOT.items[c.items[i]]; if (I.v / I.size > cv) { cv = I.v / I.size; cand = i; } }
      if (cand < 0) return false;
      const junk = p.inv.items.slice().sort((a, b) => S.LOOT.items[a.k].v / S.LOOT.items[a.k].size - S.LOOT.items[b.k].v / S.LOOT.items[b.k].size);
      const removed = [];
      for (const it of junk) {
        const J = S.LOOT.items[it.k];
        if (J.v / J.size * 1.5 >= cv) break;
        p.inv.items.splice(p.inv.items.indexOf(it), 1); removed.push(it.k);
        if (S.invPlace(p.inv, c.items[cand])) break;
      }
      if (!S.invPlace(p.inv, c.items[cand])) { for (const k of removed) { const pos = S.invPlace(p.inv, k); if (pos) p.inv.items.push({ id: this.nextId++, k, x: pos.x, y: pos.y, rot: pos.rot }); } return false; }
      for (const k of removed) c.items.push(k);   // 扔掉的东西留在这个容器里
      c.rev = Math.min(c.rev + removed.length, c.items.length);
      best = cand;
    }
    const k = c.items[best], pos = S.invPlace(p.inv, k);
    c.items.splice(best, 1); c.rev = Math.max(0, c.rev - 1);
    p.inv.items.push({ id: this.nextId++, k, x: pos.x, y: pos.y, rot: pos.rot });
    if (!c.items.length) this.setContState(c, 2);
    this.ev(['lt-', c.id, p.id, k]); this.syncBag(p);
    for (const q of this.viewers(c)) this.sendCont(q);
    return true;
  }
  updateLoot(dt) {
    const o = this.obj, LT = S.LOOT;
    for (const p of this.players.values()) {
      if (!p.alive || p.out || p.guard) continue;
      // 急救包
      if (p.kit && p.hp < this.maxHpOf(p) * 0.3 && !p.foot) { p.kit = 0; p.hp = Math.min(this.maxHpOf(p), p.hp + 60); this.ev(['kit', p.id]); this.sendBag(p); }
      // AI：走到目标容器旁边就打开
      if (p.bot && !p.openC && p.ai && p.ai.goal && p.ai.goal.cont) { const c = o.contMap.get(p.ai.goal.cont); if (c && this.canReach(p, c)) { if (c.items.length) { p.openC = c.id; p.srch = 0; if (!c.state) this.setContState(c, 1); } else { (p.ai.done || (p.ai.done = new Set())).add(c.id); p.ai.goal = null; p.ai.replan = 0; } } }
      // 搜索：站在容器旁边，一件一件搜出来
      if (p.openC) {
        const c = o.contMap.get(p.openC);
        if (!c || !this.canReach(p, c)) { p.openC = 0; this.sendCont(p); }
        else if (c.rev < c.items.length) {
          p.srch += dt;
          if (p.srch >= this.searchNeed(c, p)) { c.rev++; p.srch = 0; for (const q of this.viewers(c)) this.sendCont(q); }
          else if (!p.bot && (this.tick % 6) === 0) this.sendCont(p);
        } else if (p.bot) {
          if ((p.pickT -= dt) <= 0) { p.pickT = 0.35; if (!this.botTake(p, c)) { p.openC = 0; if (p.ai) { (p.ai.done || (p.ai.done = new Set())).add(c.id); p.ai.goal = null; p.ai.replan = 0; } } }
        }
      }
      // 撤离：站在开放的撤离点里读条，挨打会倒退
      let inEx = null, why = '';
      for (const e of o.ex) {
        if (!this.exOpen(e) || Math.hypot(p.x - e.x, p.y - e.y) >= LT.extR) continue;
        if (e.type === 'weight' && S.invCells(p.inv) > LT.ext.weight.max) { why = '背包里的东西太多了（轻装撤离不能超过 12 格）'; continue; }
        inEx = e; break;
      }
      if (inEx) {
        const hurt = this.time - p.lastHurt < 1;
        p.exT = hurt ? Math.max(0, p.exT - dt * 1.5) : p.exT + dt;
        if (p.exT >= LT.extTime) this.extract(p, inEx);
      } else { p.exT = Math.max(0, p.exT - dt * 2); if (why && (p.whyT = (p.whyT || 0) - dt) <= 0) { p.whyT = 3; this.toast(p, why); } }
    }
    // 2.1.1：中途加入（有小队全灭后，排队的真人优先、否则 AI 增援小队从空出来的出生点杀进来）
    if (this.tick % S.TICK === 0) this.lootReinforce();
    // 撤离点开放提示
    for (const e of o.ex) if (!e.told && this.exOpen(e)) { e.told = 1; this.ev(['exo', r1(e.x), r1(e.y)]); }
    // 所有真人都撤离或阵亡（或者场上只剩守卫）→ 结束
    let humansLeft = 0, anyHuman = false, squadsLeft = 0;
    for (const p of this.players.values()) {
      if (p.guard) continue;
      if (!p.bot) { anyHuman = true; if (!p.out) humansLeft++; }
      if (!p.out) squadsLeft++;
    }
    if ((anyHuman && humansLeft === 0) || squadsLeft === 0) this.finish(null);
  }
  extract(p, e) {
    p.extracted = true; p.out = true; p.alive = false; p.exT = 0; p.respawnT = 1e9; p.openC = 0;
    const keys = p.inv.items.map((it) => it.k).concat(p.safe.items.map((it) => it.k));
    const v = S.lootValue(keys);
    this.obj.banked[p.id] = keys;
    if (e && e.type === 'paid') this.obj.paid[p.id] = S.LOOT.ext.paid.cost;
    this.obj.score[p.team] = (this.obj.score[p.team] || 0) + v;
    this.ev(['exd', p.id, v]);
    p.stats.obj += 1;
    if (this.chat && p.bot && Math.random() < 0.4) this.chat.say(p, 'endWin', { end: true, delay: 0.5 });
  }
  // ---- 2.1.1 中途加入 ----
  lootSlots() {   // 全灭（全员出局）的小队编号 → 全灭的时间
    const o = this.obj; o.wiped = o.wiped || {};
    for (let t = 1; t <= this.teams; t++) {
      if (o.wiped[t] != null) continue;
      let n = 0, out = 0;
      for (const p of this.players.values()) if (p.team === t && !p.guard) { n++; if (p.out) out++; }
      if (n && out === n) o.wiped[t] = this.time;
    }
    return o.wiped;
  }
  lootJoinable() {   // 真人中途加入：还剩 5 分钟以上、有空出来的小队位置没被别人排上
    if (!this.loot || this.over || this.timeLeft < S.LOOT.joinMin || (this.obj.joins || 0) >= S.LOOT.maxJoins) return false;
    const free = Object.keys(this.lootSlots()).length;
    return free > (this.obj.joinQ || []).length;
  }
  queueJoin(conns) { (this.obj.joinQ || (this.obj.joinQ = [])).push(conns); }
  lootReinforce() {
    const o = this.obj, LT = S.LOOT, w = this.lootSlots();
    o.joinQ = o.joinQ || [];
    for (const t of Object.keys(w).map(Number)) {
      if ((o.joins || 0) >= LT.maxJoins || this.timeLeft < LT.joinMin * 0.8) { if (o.joinQ.length) this.joinFail(o.joinQ.splice(0)); break; }
      const wait = this.time - w[t];
      if (o.joinQ.length && wait >= 3) { this.addLateSquad(t, o.joinQ.shift()); continue; }
      if (!o.joinQ.length && wait >= LT.botJoinWait && this.room.settings.bots !== false) this.addLateSquad(t, []);
    }
  }
  joinFail(list) { for (const conns of list) for (const c of conns) { if (c.conn) c.conn.send({ t: 'err', msg: '这局已经不能中途加入了' }); if (this.room.members.has(c.id)) this.room.remove(c); } }
  addLateSquad(t, conns) {
    const o = this.obj;
    o.joins = (o.joins || 0) + 1; delete o.wiped[t];
    // 出生点：离场上活着的人最远的那个
    const alive = [...this.players.values()].filter((p) => p.alive && !p.out && !p.guard);
    let best = null, bd = -1;
    for (const [x, y] of this.M.loot.spawns) {
      const sx = x * S.CELL, sy = y * S.CELL;
      const d = alive.reduce((m, p) => Math.min(m, Math.hypot(p.x - sx, p.y - sy)), 1e9);
      if (d > bd) { bd = d; best = { x: sx, y: sy }; }
    }
    this.spawns[t] = best;
    const n = Math.max(this.squad, conns.length), names = BOTS.nicks(n, this.room.settings.lang);
    const botPw = this.room.settings.botPower || { lv: 5, bt: 1 }, added = [];
    for (let i = 0; i < n; i++) {
      const c = conns[i];
      let p;
      if (c) {
        p = this.addPlayer(c.id, c.name, t, c.weapon, c.head, false, i, c.pilot, c.power || { lv: 1, bt: 0 });
        p.looks = c.looks || null;
        if (this.risk === 'high' && c.power && Array.isArray(c.power.gear)) this.applyGear(p, c.power.gear);
        const sd = S.LOOT.safe[clamp((c.power && c.power.safe) | 0 || 1, 1, 3)]; p.safe = { w: sd[0], h: sd[1], items: [] };
      } else {
        const pil = S.PILOTS[randInt(S.PILOTS.length)];
        o.botSeq = (o.botSeq || 0) + 1;
        p = this.addPlayer(-800 - o.botSeq, names[i], t, Math.random() < 0.5 ? pil.weapon : S.WEAPON_ORDER[randInt(S.WEAPON_ORDER.length)], S.HEADS[randInt(S.HEADS.length)].id, true, i, pil.id, botPw);
        p.persona = 'decent';
        if (this.risk === 'high' && Math.random() < 0.6) { const bd2 = S.bagDims(['pack']); p.inv = { w: bd2[0], h: bd2[1], items: [] }; }
      }
      p.late = true;
      added.push(p);
    }
    if (this.lootStyle) this.lootStyle[t] = added.some((p) => !p.bot) ? 'balanced' : pickStyle();
    let squads = 0; const seen = new Set();
    for (const p of this.players.values()) if (!p.guard && !p.out && !seen.has(p.team)) { seen.add(p.team); squads++; }
    this.ev(['pjn', added.map((p) => [p.id, p.name, p.team, p.weapon, p.head, p.pilot, p.bot ? 1 : 0, p.lv, p.bt, p.looks || null])]);
    const human = added.some((p) => !p.bot);
    this.ev(['sqj', t, added[0].name, squads, human ? 1 : 0]);
    for (const c of conns) {   // 真人：发开局信息 + 整张涂料图（和断线重连一样），直接进场
      if (!c.conn || this.room.manual) continue;
      c.conn.send(Object.assign(this.startMsg(), { resume: true, late: true }));
      c.conn.send(this.gridMsg());
      this.sendBag(this.players.get(c.id));
    }
    if (this.chat) for (const p of added) if (p.bot && Math.random() < 0.5) { this.chat.say(p, 'start', { delay: 1 + Math.random() * 2 }); break; }
    return added;
  }
  contList() { return this.obj.conts.map((c) => [c.id, S.CONT_IDS.indexOf(c.type), r1(c.x), r1(c.y), r1(c.z), this.contState(c)]); }
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
      p.sp = Math.floor(p.sp * 0.5); p.rebuildT = 0;   // 2.2：重建不再刷新技能充能
      this.respawn(p); p.invulnT = 2;
    }
    this.ev(['rs', o.round]);
  }
  // ---------------- 1.8：咒灵讨伐 / 封印争夺 ----------------
  setupRaid(nh, pw) {
    const R = S.RAID;
    const b = this.addPlayer(-900, '百目', 2, 'fist', 'antenna', true, 0, 'aka', { lv: pw.lv, bt: pw.bt });
    b.boss = true; b.npc = true; b.rad = R.r; b.maxHp = R.hp; b.hp = b.maxHp; void nh;
    b.x = S.W / 2 + 160; b.y = S.H / 2; b.z = this.top(b.x, b.y); b.sync++;
    b.bossAI = { t: 3, i: 0, tele: [], rage: false, dash: 0, dx: 0, dy: 0, ring: null };
    this.boss = b;
    this.minions = [];
    const MW = ['fist', 'bucket', 'blaster', 'fist'];
    for (let k = 0; k < 4; k++) {
      const m = this.addPlayer(-910 - k, '小咒灵', 2, MW[k], 'antenna', true, 1 + k, 'raven', { lv: Math.max(1, pw.lv - 2), bt: 0 });
      m.npc = true; m.spirit = true; m.persona = 'decent'; m.maxHp = 80; m.alive = false; m.respawnT = 1e9;
      this.minions.push(m);
    }
  }
  setupSeal(pw) {
    this.spirits = [];
    const SW = ['fist', 'bucket', 'blaster', 'flamer', 'fist', 'gatling'];
    for (let k = 0; k < 6; k++) {
      const m = this.addPlayer(-920 - k, '游荡咒灵', S.SEAL.team, SW[k], 'antenna', true, k, 'raven', { lv: Math.max(1, pw.lv - 1), bt: 0 });
      m.npc = true; m.spirit = true; m.persona = 'decent'; m.maxHp = 110; m.alive = false; m.respawnT = 1e9;
      this.spirits.push(m);
    }
  }
  spawnSpirit(m, pt) {
    if (!pt) return;
    m.x = pt.x; m.y = pt.y; m.z = pt.z; m.vx = m.vy = m.vz = 0; m.kx = m.ky = 0; m.hp = m.maxHp; m.alive = true; m.foot = false; m.invulnT = 0.6; m.ammo = S.AMMO;
    m.guard = { x: pt.x, y: pt.y }; m.ai = null; m.sync++;
    this.ev(['summon', m.id, r1(pt.x), r1(pt.y), r1(pt.z)]);
  }
  // 随机找一块空地（k = 离中心的最大比例）
  randomOpen(k) {
    for (let n = 0; n < 40; n++) {
      const x = S.W / 2 + (Math.random() - 0.5) * S.W * k, y = (randInt(S.GH) + 0.5) * S.CELL, z = this.top(x, y);
      if (z > 80 || S.collideTest(this.M, x, y, z)) continue;
      if (dist({ x, y }, S.basePos(1)) < 260 || dist({ x, y }, S.basePos(2)) < 260) continue;
      return { x, y, z };
    }
    return null;
  }
  dropStone(x0, y0, z0) {
    const o = this.obj, a = rand(0, Math.PI * 2), r = rand(10, 40);
    let x = clamp(x0 + Math.cos(a) * r, 20, S.W - 20), y = clamp(y0 + Math.sin(a) * r, 20, S.H - 20);
    if (S.collideTest(this.M, x, y, z0) || this.top(x, y) > z0 + 5) { x = x0; y = y0; }
    o.bats.push({ id: o.batId++, x, y, z: this.top(x, y) });
  }
  bossDown(b, by) {
    b.alive = false; b.hp = 0; b.respawnT = 1e9;
    if (by && !by.npc && this.players.has(by.id)) { by.stats.kills++; by.stats.spirits++; by.stats.obj += 5; }
    this.paint(b.x, b.y, this.top(b.x, b.y), 140, 1, null);
    this.ev(['kill', by ? by.id : 0, b.id, r1(b.x), r1(b.y), r1(b.z)]);
    this.ev(['boss', b.id, 'down', r1(b.x), r1(b.y), r1(b.z)]);
    for (const m of this.minions) if (m.alive) { m.alive = false; m.hp = 0; m.respawnT = 1e9; this.ev(['kill', 0, m.id, r1(m.x), r1(m.y), r1(m.z)]); }
    this.finish(1);
  }

  initMode() {
    const o = (this.obj = { score: [0, 0, 0], resetT: 0 });
    if (this.loot) {
      // 1.6：搜刮撤离——物资点按品质刷物资（高危：更多更好），撤离点按时间陆续开放
      const L = this.M.loot, hi = this.risk === 'high', C = S.CELL;
      o.items = []; o.score = new Array(this.teams + 6).fill(0); o.conts = []; o.contMap = new Map();
      // 2.1：容器（军需箱 / 储物柜 / 保险柜 / 电脑 / 医疗箱 / 武器箱 / 行李包 / 金库）
      for (const [x, y, type, tier, roof] of L.conts || []) this.makeCont(type, (x + 0.5) * C, (y + 0.5) * C, tier, hi, !!roof);
      // 旧地图（没有容器）：照旧在物资点刷物资，装进行李包
      for (const [x, y, tier, n0] of L.spots || []) { const n = hi ? Math.round(n0 * 1.6) : n0; const ks = []; for (let i = 0; i < n; i++) ks.push(S.rollLoot(tier, hi)); this.makeCont('duffel', (x + 0.5) * C, (y + 0.5) * C, tier, hi, false, ks); }
      const opens = S.LOOT.opens.slice().sort(() => Math.random() - 0.5); let ni = 0;
      const E2 = S.LOOT.ext;
      o.ex = L.extract.map(([x, y, type]) => {
        type = E2[type] ? type : 'normal';
        const e = { x: x * C, y: y * C, type, open: 0, close: 1e9 };
        if (type === 'normal') e.open = opens[ni++ % opens.length];
        if (type === 'timed') { e.open = E2.timed.from; e.close = E2.timed.to; }
        if (type === 'lever') { e.open = 1e9; e.close = 0; }
        return e;
      });
      o.lever = L.lever ? { x: (L.lever[0] + 0.5) * C, y: (L.lever[1] + 0.5) * C, until: 0 } : null;
      o.banked = {}; o.paid = {};
      return;
    }
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
      case 'seal': o.bats = []; o.batT = 2; o.batId = 1; o.spT = 1.5; break;
      case 'raid': this.timeLeft = S.RAID.time; break;
      case 'park': o.fl = Object.assign({ k: 0, own: 0 }, this.parkPos(0)); o.balloons = []; o.balT = 1.5; o.balId = 1; o.acc = 0; break;
    }
  }
  // 乐园模式：花车在路线上的位置（k = 0..1 沿闭合路线）
  parkPos(k) {
    const P = S.PARK.path.map(([x, y]) => [x * S.CELL, y * S.CELL]);
    const seg = P.map((a, i) => { const b = P[(i + 1) % P.length]; return Math.hypot(b[0] - a[0], b[1] - a[1]); });
    let d = (((k % 1) + 1) % 1) * seg.reduce((x, y) => x + y, 0);
    for (let i = 0; i < P.length; i++) {
      if (d <= seg[i]) { const a = P[i], b = P[(i + 1) % P.length], t = d / seg[i]; return { x: a[0] + (b[0] - a[0]) * t, y: a[1] + (b[1] - a[1]) * t }; }
      d -= seg[i];
    }
    return { x: P[0][0], y: P[0][1] };
  }
  popBalloon(b, team, owner) {
    const o = this.obj;
    o.balloons = o.balloons.filter((x) => x !== b);
    o.score[team] = (o.score[team] || 0) + S.PARK.balloon;
    if (owner && this.players.has(owner.id)) { owner.stats.balloons++; owner.stats.obj += 1; }
    this.paint(b.x, b.y, this.top(b.x, b.y), 34, team, owner);
    this.ev(['bp', b.id, team, r1(b.x), r1(b.y), r1(b.z)]);
    if (o.score[team] >= S.PARK.target) this.finish(team);
  }

  updateMode(dt) {
    const o = this.obj;
    if (this.loot) { this.updateLoot(dt); return; }
    switch (this.mode) {
      case 'park': {
        // 花车巡游：光圈里人多的队伍每秒得分
        o.fl.k = (this.time / S.PARK.loop) % 1;
        Object.assign(o.fl, this.parkPos(o.fl.k));
        const n = [0, 0, 0];
        for (const p of this.players.values()) if (p.alive && Math.hypot(p.x - o.fl.x, p.y - o.fl.y) < S.PARK.r && p.z < this.top(p.x, p.y) + 60) n[p.team]++;
        o.fl.own = n[1] > n[2] ? 1 : n[2] > n[1] ? 2 : 0;
        o.acc += dt;
        if (o.acc >= S.PARK.tick) {
          o.acc -= S.PARK.tick;
          if (o.fl.own) {
            o.score[o.fl.own] += 1;
            for (const p of this.players.values()) if (p.alive && p.team === o.fl.own && Math.hypot(p.x - o.fl.x, p.y - o.fl.y) < S.PARK.r) p.stats.float = (p.stats.float || 0) + 1;
            this.paint(o.fl.x, o.fl.y, this.top(o.fl.x, o.fl.y), 40, o.fl.own, null);
            if (o.score[o.fl.own] >= S.PARK.target) { this.finish(o.fl.own); return; }
          }
        }
        // 气球：随机飘在空地上空
        o.balT -= dt;
        if (o.balT <= 0 && o.balloons.length < S.PARK.maxBalloons) {
          o.balT = S.PARK.balloonT;
          for (let tries = 0; tries < 20; tries++) {
            const x = rand(120, S.W - 120), y = rand(100, S.H - 100);
            if (this.M.solid[Math.floor(y / S.CELL) * S.GW + Math.floor(x / S.CELL)]) continue;
            o.balloons.push({ id: o.balId++, x, y, z: this.top(x, y) + 62, ph: rand(0, 6) });
            break;
          }
        }
        break;
      }
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
      case 'seal': {   // 1.8：封印争夺
        const SE = S.SEAL;
        o.batT -= dt;
        if (o.batT <= 0 && o.bats.length < SE.stoneMax) { o.batT = SE.stoneT; const pt = this.randomOpen(0.55); if (pt) o.bats.push({ id: o.batId++, x: pt.x, y: pt.y, z: pt.z }); }
        o.spT -= dt;
        if (o.spT <= 0) {
          o.spT = SE.spiritT;
          const free = this.spirits.find((q) => !q.alive);
          if (free && this.spirits.filter((q) => q.alive).length < SE.spiritMax) this.spawnSpirit(free, this.randomOpen(0.6));
        }
        for (const p of this.players.values()) {
          if (!p.alive || p.npc) continue;
          if (p.carry < SE.carry) {
            for (let i = o.bats.length - 1; i >= 0; i--) {
              const bt = o.bats[i];
              if (Math.hypot(bt.x - p.x, bt.y - p.y) < 28 && Math.abs(bt.z - p.z) < 30) { p.carry++; o.bats.splice(i, 1); this.ev(['bp', p.id]); if (p.carry >= SE.carry) break; }
            }
          }
          if (p.carry > 0 && dist(p, S.basePos(p.team)) < 120) {
            o.score[p.team] += p.carry; p.stats.obj += p.carry; p.stats.seals += p.carry;
            this.ev(['dep', p.id, p.carry]);
            p.carry = 0;
            if (o.score[p.team] >= SE.target) { this.finish(p.team); return; }
          }
        }
        break;
      }
      case 'raid': break;   // 1.8：百目的招式在 bossThink 里
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
    if (this.loot) {
      // 2.1：撤离点 [x, y, 类型, 开放中?, 距离开放 / 关闭的秒数]；背包 [id, 已用格, 总格数, 价值, 读条, 已撤离]；电闸剩余秒数
      const ex = [], bags = [];
      for (const e of o.ex) { const op = this.exOpen(e); ex.push(r1(e.x), r1(e.y), S.EXT_IDS.indexOf(e.type), op ? 1 : 0, Math.max(0, Math.ceil(op ? Math.min(9999, e.close - this.time) : Math.min(9999, e.open - this.time)))); }
      for (const p of this.players.values()) if (!p.guard) bags.push(p.id, S.invCells(p.inv), p.inv.w * p.inv.h, S.invValue(p.inv), Math.round(p.exT * 10), p.extracted ? 1 : 0);
      return [ex, bags, o.lever ? Math.max(0, Math.ceil(o.lever.until - this.time)) : -1];
    }
    switch (this.mode) {
      case 'zone': return [o.owner, Math.ceil(o.count[1]), Math.ceil(o.count[2]), Math.round(o.share[1] * 100), Math.round(o.share[2] * 100)];
      case 'escort': return [r1(o.tr.x), r1(o.tr.y), o.tr.carrier, o.score[1], o.score[2], o.tr.resetT > 0 ? 1 : 0, r1(o.tr.z)];
      case 'soccer': return [r1(o.ball.x), r1(o.ball.y), o.score[1], o.score[2], o.ball.last, o.resetT > 0 ? 1 : 0];
      case 'park': {
        const flat = [];
        for (const b of o.balloons) flat.push(b.id, r1(b.x), r1(b.y), r1(b.z));
        return [o.score[1], o.score[2], r1(o.fl.x), r1(o.fl.y), o.fl.own, flat];
      }
      case 'battery': case 'seal': {
        const flat = [];
        for (const b of o.bats) flat.push(b.id, r1(b.x), r1(b.y), r1(b.z));
        return [o.score[1], o.score[2], flat];
      }
      case 'raid': {
        const b = this.boss;
        return [b ? b.id : 0, b && b.bossAI.rage ? 1 : 0, this.minions ? this.minions.filter((m) => m.alive).length : 0, b ? Math.max(0, Math.ceil(b.hp)) : 0, b ? b.maxHp : 1];
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
        | (p.ovT > 0 ? 64 : 0) | (p.rallyT > 0 ? 128 : 0) | (p.revealT > 0 ? 256 : 0) | (p.burnT > 0 ? 512 : 0) | (p.bindT > 0 ? 1024 : 0)
        | (p.markT > 0 ? 2048 : 0) | (p.blindT > 0 ? 4096 : 0) | (p.lockT > 0 ? 8192 : 0) | (p.poisonT > 0 ? 16384 : 0) | (p.sealT > 0 ? 32768 : 0);
      pl.push([p.id, r1(p.x), r1(p.y), r2(p.input.a), Math.ceil(p.hp), Math.round(p.ammo * 100), Math.round(p.sp), flags,
        Math.ceil((p.foot ? p.rebuildT : p.respawnT) * 10), p.carry, Math.round(p.sm * 100), Math.round(p.charge * 100), r1(p.shield), p.sync,
        r1(p.vx + (p.kx || 0)), r1(p.vy + (p.ky || 0)), S.SPECIAL_IDS.indexOf(p.spKind), r1(p.z), r2(p.input.pt), Math.round(p.vz || 0),
        this.maxHpOf(p), p.skillUses, Math.ceil(p.skillCd * 10), buffs,
        Math.round((p.ov / S.OV_NEED) * 100), Math.ceil(p.ovT * 10), (p.bt >= 1 ? 1 : 0) | (p.skillMax << 2), Math.round((p.skillRegen / S.SKILL_REGEN) * 100)]);
    }
    const msg = { t: 's', k: this.tick, tl: Math.max(0, Math.round(this.timeLeft * 10) / 10), cd: Math.max(0, Math.round(this.countdown * 10) / 10), p: pl, d: this.diff, e: this.events, o: this.objState(),
      rv: [0, this.reveal[1] > this.time ? 1 : 0, this.reveal[2] > this.time ? 1 : 0],
      h: this.helpers.map((h) => [h.id, h.kind, r1(h.x), r1(h.y), r1(h.z), h.team, h.ang != null ? r2(h.ang) : 0]).concat(this.obj.crates ? this.obj.crates.map((k) => [k.id, 'crate', r1(k.x), r1(k.y), r1(k.z), 0]) : []) };
    if (this.tick % 15 === 0) msg.sb = [...this.players.values()].map((p) => [p.id, p.stats.kills, p.stats.deaths, p.stats.paint, p.stats.obj, p.stats.assists || 0]);
    if (this.loot && this.tick % 60 === 0) msg.cs = this.obj.conts.map((c) => this.contState(c)).join('');   // 2.1：容器状态全量（每 2 秒一次，防止丢包后对不上）
    this.room.broadcast(msg, true);
    this.diff = []; this.events = [];
  }

  finish(winner) {
    if (this.loot && this.obj.joinQ && this.obj.joinQ.length) this.joinFail(this.obj.joinQ.splice(0));
    if (this.over) return;
    S.useMap(this.M);
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
    if (winner == null && this.mode === 'raid') { winner = 2; reason = 'time'; }   // 1.8：讨伐超时——百目获胜
    if (winner == null && this.loot) {
      // 撤离价值最高的小队算「赢」（用来显示 MVP 和标题）
      let best = 0, bv = 0;
      for (let t = 1; t <= this.teams; t++) if ((o.score[t] || 0) > bv) { bv = o.score[t]; best = t; }
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
      mode: this.mode, map: this.mapIdx, winner, reason, ranked: this.ranked, turf: [pa, pb], score: o.score.slice(),
      count: o.count ? o.count.map((c) => Math.ceil(c)) : null, colorSet: this.colorSet, teams: this.teams,
      rounds: o.wins ? o.wins.slice() : null,
      place: o.elim ? [winner, ...o.elim.slice().reverse().filter((t) => t !== winner)] : null,
      players: [...this.players.values()].map((p) => ({ id: p.id, name: p.name, team: p.team, weapon: p.weapon, head: p.head, pilot: p.pilot, bot: p.bot, ...p.stats })),
    };
    if (this.loot) {
      const lp = {};
      for (const p of this.players.values()) if (!p.guard) lp[p.id] = { ex: !!p.extracted, items: p.extracted ? (o.banked[p.id] || []) : [], safe: p.safe.items.map((it) => it.k), gear: p.gear || [], paid: o.paid[p.id] || 0 };
      result.loot = { risk: this.risk, players: lp };
      result.players = result.players.filter((q) => !this.players.get(q.id) || !this.players.get(q.id).guard);
    }
    if (this.mode === 'raid' || this.mode === 'seal') {   // 1.8：百目、小咒灵、游荡咒灵不进结算
      const boss = [...this.players.values()].find((p) => p.boss);
      if (boss) result.boss = { hp: Math.max(0, Math.round(boss.hp)), max: boss.maxHp, down: !boss.alive };
      result.players = result.players.filter((q) => !this.players.get(q.id) || !this.players.get(q.id).npc);
    }
    this.result = result;
    if (this.chat) this.chat.onEnd(winner);
    if (this.room.manual) return;
    this.sendSnapshot();
    this.room.broadcast({ t: 'over', winner });
    setTimeout(() => { if (this.room.game === this) this.room.onGameEnd(result); }, 3000);
  }

  stop() { this.over = true; if (this.interval) clearInterval(this.interval); }
  // 比赛还没结束时的临时结算（逃亡圈提前退出用）：还活着的队伍排前面，已淘汰的按淘汰顺序倒排
  partialResult() {
    S.useMap(this.M);
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
  if (p.blindT > 0 && d > 180) return false;   // 2.2.1：被韩冰致盲
  if (!e.hidden || g.reveal[p.team] > g.time || e.revealT > 0) return true;
  return d < S.BUSH_DETECT;
}
function botThink(g, p, dt) {
  const inp = p.input;
  if (!p.alive) { inp.f = false; inp.w = false; p.ai = null; return; }
  if (g.tutorial) { inp.mx = 0; inp.my = 0; inp.f = false; inp.w = false; return; }   // 训练靶：站着不动
  // 1.4.1：性格。挂机的站着不动；打字的停下来；菜鸟偶尔发呆
  const P = BOTS.persona(p.persona);
  const ps = p.pst || (p.pst = { streak: 0, deaths: 0 });
  const idle = () => { inp.mx = 0; inp.my = 0; inp.f = false; inp.w = false; };
  if (P.afk && afkIdle(g, p, ps)) { idle(); inp.a += dt * ps.afk.spin; return; }
  if (g.chat && ps.typingUntil > g.chat.t) { idle(); return; }
  if (ps.freezeT > 0) { ps.freezeT -= dt; idle(); return; }
  if (P.freeze && Math.random() < P.freeze) ps.freezeT = rand(0.5, 1.5);
  if (ps.noWheel == null) ps.noWheel = Math.random() < (P.noWheel || 0);
  const ai = p.ai || (p.ai = { goal: null, path: [], pi: 0, replan: 0, stuckT: 0, lastX: p.x, lastY: p.y, wob: rand(0, 6), strafe: 1, strafeT: 0, jumpT: rand(1, 4), react: rand(P.react[0], P.react[1]), seenT: 0, paintT: rand(0.5, 2) });
  const W = S.WEAPONS[p.weapon];
  const SA = p.foot ? S.sidearm(p.pilot) : null;
  const range = p.foot ? SA.range : S.weaponRange(p.weapon);
  ai.replan -= dt;

  let enemy = null, ed = Infinity, best = Infinity;
  for (const e of g.players.values()) {
    if (!e.alive || e.team === p.team) continue;
    if (p.guard && (Math.hypot(e.x - p.guard.x, e.y - p.guard.y) > 320 || Math.hypot(p.x - p.guard.x, p.y - p.guard.y) > 450)) continue;   // 守卫只管自己岗位附近，追远了就回去
    const d = Math.hypot(e.x - p.x, e.y - p.y, e.z - p.z);
    if (g.loot && !p.guard && !e.guard && d > styleOf(g, p).engage && !(p.hitBy && p.hitBy[e.id] > g.time - 6)) continue;   // 2.1 撤离：AI 以搜物资为主；2.1.2：主动交战距离按打法（早撤型不主动打，阴人型 520 内都打）
    if (!botSees(g, p, e, d)) continue;
    const lobber = p.foot ? SA.kind === 'lob' || SA.ghost : p.weapon === 'mortar' || p.weapon === 'slinger';
    let sc = P.focus ? d * (0.55 + 0.45 * e.hp / g.maxHpOf(e)) : d;   // 高手 / 大神优先打残血
    if (g.loot && !p.guard && styleOf(g, p).ambush && !e.guard) sc /= 1 + S.invValue(e.inv) / 5000;   // 2.1.2 阴人型：专挑身上值钱的
    if (d < range + 160 && sc < best && (lobber || S.los3(g.M, p.x, p.y, p.z + S.MUZZLE, e.x, e.y, e.z + 18))) { enemy = e; ed = d; best = sc; }
  }
  ai.seenT = enemy ? ai.seenT + dt : 0;

  // 防挂机：1 秒内几乎没挪动（顶着墙原地踏步，或者站在目标点发呆）→ 侧移 + 跳一下，换一个新目标
  // 1.6：站在开放的撤离点里读条时别乱动（防挂机逻辑也不要把它挪走）
  ai.holdEx = g.loot && !p.guard && g.obj.ex.some((e) => g.exOpen(e) && Math.hypot(p.x - e.x, p.y - e.y) < S.LOOT.extR * 0.75);
  ai.stuckT += dt;
  if (ai.holdEx) { ai.stuckT = 0; ai.lastX = p.x; ai.lastY = p.y; }
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
    if (!keep) ai.goal = ai.forceRandom || (!p.foot && P.wander && Math.random() < P.wander) ? randomGoal(g, p) : p.foot ? fleeGoal(g, p) : chooseGoal(g, p);
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
  if (ai.holdEx && !enemy) { mx *= 0.15; my *= 0.15; }
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
  let engage = melee || P.chase ? Math.max(range * 1.05, 300) : range * 1.05;
  if (g.loot && !p.guard && !P.chase && enemy && !(ai.goal && ai.goal.ex) && enemy.lastAtk < g.time - 2 && dist(enemy, p) > range * 0.75) engage = range * 0.75;   // 搜刮时不主动追远处的人
  if (enemy && ed < engage && ai.seenT > ai.react) {
    const lobT = !p.foot && W.attack === 'lob' ? (W.flight || 0.6) : 0;   // 1.5：抛射武器按落地时间算提前量
    const lead = lobT ? lobT / Math.max(0.35, P.lead) : ed / (P.trueLead ? (p.foot ? SA.speed : W.speed) || 650 : 650);   // 高手按真实弹速算提前量
    aim = aimAt(p, enemy.x + enemy.vx * lead * P.lead, enemy.y + enemy.vy * lead * P.lead, enemy.z + 16);
    aim.a += (Math.random() - 0.5) * P.aim; aim.pt += (Math.random() - 0.5) * P.aim / 3;
    inp.ad = ed;
    wantAtk = ed < (W.attack === 'punch' && !p.foot ? range + S.R + (W.lunge || 0) * 0.1 : range * 1.1);
    if (wantAtk && W.attack === 'punch' && !p.foot) aim = aimAt(p, enemy.x + enemy.vx * 0.08, enemy.y + enemy.vy * 0.08, enemy.z + 16);   // 出拳时对准，不抖
    ai.strafeT -= dt;
    if (ai.strafeT <= 0) { ai.strafeT = rand(P.strafe[0], P.strafe[1]); ai.strafe = (Math.random() < 0.5 ? -1 : 1) * P.strafeK / 0.8; }
    const ea = Math.atan2(enemy.y - p.y, enemy.x - p.x);
    if (p.foot) {
      // 驾驶员：拿近战武器的冲上去，其他的边退边打
      if (SA.kind === 'melee' && (hpK > 0.45 || ed < 90)) { mx = Math.cos(ea) + Math.cos(ea + Math.PI / 2) * ai.strafe * 0.3; my = Math.sin(ea) + Math.sin(ea + Math.PI / 2) * ai.strafe * 0.3; }
      else { mx = -Math.cos(ea) * 0.7 + Math.cos(ea + Math.PI / 2) * ai.strafe * 0.6; my = -Math.sin(ea) * 0.7 + Math.sin(ea + Math.PI / 2) * ai.strafe * 0.6; }
    } else if (melee) {
      // 1.5：近战绕到侧后方再出拳（刺客机体从背后打伤害更高）；离得远时走之字形躲子弹
      let ta = ea;
      if (W.attack === 'punch' && ed > 70) {
        const fa = enemy.input.a, bx = enemy.x - Math.cos(fa) * 46, by = enemy.y - Math.sin(fa) * 46;
        const k = W.backstab ? 0.75 : 0.4;
        ta = Math.atan2((by - p.y) * k + (enemy.y - p.y) * (1 - k), (bx - p.x) * k + (enemy.x - p.x) * (1 - k));
      }
      const zig = ed > 150 ? 0.55 : 0.3;
      mx = Math.cos(ta) + Math.cos(ta + Math.PI / 2) * ai.strafe * zig; my = Math.sin(ta) + Math.sin(ta + Math.PI / 2) * ai.strafe * zig;
    }
    else if (p.weapon === 'charger') { mx = Math.cos(ea + Math.PI / 2) * ai.strafe * 0.5; my = Math.sin(ea + Math.PI / 2) * ai.strafe * 0.5; }
    else {
      const want = p.weapon === 'mortar' ? 0.75 : 0.55;
      const back = ed < range * want ? -0.6 : 0.3;
      mx = Math.cos(ea) * back + Math.cos(ea + Math.PI / 2) * ai.strafe * 0.8;
      my = Math.sin(ea) * back + Math.sin(ea + Math.PI / 2) * ai.strafe * 0.8;
    }
    if (g.mode === 'escort' && g.obj.tr.carrier === p.id) { const a2 = Math.atan2(ty - p.y, tx - p.x); mx = Math.cos(a2); my = Math.sin(a2); }
    if (!p.foot && P.retreat && hpK < P.retreat && (P.smart || enemy.hp > p.hp)) { mx = -Math.cos(ea); my = -Math.sin(ea); }   // 残血撤退（猪队友和菜鸟不会撤）
    if (ai.holdEx) {   // 撤离读条中：边打边留在圈里
      const e = g.obj.ex.find((x) => Math.hypot(p.x - x.x, p.y - x.y) < S.LOOT.extR);
      if (e) { mx = mx * 0.35 + (e.x - p.x) / S.LOOT.extR * 0.6; my = my * 0.35 + (e.y - p.y) / S.LOOT.extR * 0.6; }
    }
    ai.jumpT -= dt;
    if (ai.jumpT <= 0) { ai.jumpT = rand(P.jump[0], P.jump[1]); inp.j = true; }
  } else if (!p.foot) {
    // 没有敌人：边走边涂地
    ai.wob += dt * 2.2;
    aim.a += Math.sin(ai.wob) * 0.6;
    ai.paintT -= dt;
    if (ai.paintT <= 0 && p.ammo > 2.2) { wantAtk = true; ai.paintT = rand(0.6, 1.6) * P.paint; inp.ad = rand(150, 320); }
    if (g.mode === 'park' && p.ammo >= 1) {   // 乐园模式：射程内有气球就打
      for (const b of g.obj.balloons) {
        const d = Math.hypot(b.x - p.x, b.y - p.y);
        if (d < range * 0.95 && d > 20) { aim = aimAt(p, b.x, b.y, b.z + 10); inp.ad = d; wantAtk = true; break; }
      }
    }
    if (g.mode === 'soccer' && g.obj.resetT <= 0) {
      const b = g.obj.ball, bd = dist(p, b);
      const gx = p.team === 1 ? S.W : 0;
      const toGoal = Math.atan2(S.H / 2 - b.y, gx - b.x), toBall = Math.atan2(b.y - p.y, b.x - p.x);
      let diff = Math.abs(toGoal - toBall); if (diff > Math.PI) diff = Math.PI * 2 - diff;
      if (bd < Math.min(range, 380) && diff < 0.9 && S.los3(g.M, p.x, p.y, p.z + S.MUZZLE, b.x, b.y, b.r)) { aim = aimAt(p, b.x, b.y, b.r); wantAtk = p.ammo >= 1; inp.ad = bd; }
    }
  }

  let wheel = false;
  if (!p.foot && !enemy && onOwn && (ps.noWheel ? p.ammo < 0.3 : p.ammo < 1.5 || (dl > 260 && p.ammo < 2.8))) { wheel = true; wantAtk = false; }   // 猪队友常常忘了补弹
  if (!p.foot && p.carry >= 3 && onOwn && !enemy) { wheel = true; wantAtk = false; }
  if (P.smart && !p.foot && enemy && onOwn && hpK < 0.25 && enemy.hp > p.hp && !p.carry) { wheel = true; wantAtk = false; }   // 大神残血：变滚轮隐身溜走回血

  if (W.attack === 'charge' && !p.foot) {
    hold = wantAtk && p.ammo >= 1 && p.charge < (enemy ? 0.92 : 0.4);
    inp.f = hold;
  } else {
    inp.f = false;
    if (wantAtk && p.ammo >= 1 && p.atkCd <= 0 && !p.burst && Math.random() < P.fire) inp.aq++;
  }

  inp.w = wheel;
  // 2.1.2 撤离 AI：残血就撤（边退边打）、吃药回血；阴人型到了蹲点就不动
  if (g.loot && !p.guard && p.alive) {
    const ST = styleOf(g, p);
    if (enemy && hpK < ST.retreat) {
      const ea = Math.atan2(enemy.y - p.y, enemy.x - p.x);
      let rx = -Math.cos(ea), ry = -Math.sin(ea);
      if (ai.goal && (ai.goal.ex || ai.goal.near)) { const ga = Math.atan2(ai.goal.y - p.y, ai.goal.x - p.x); rx = rx * 0.5 + Math.cos(ga) * 0.5; ry = ry * 0.5 + Math.sin(ga) * 0.5; }
      mx = rx; my = ry; ai.retreatT = g.time;
      if (ed > range * 0.9) wantAtk = false;
    }
    if ((ai.useT || 0) < g.time && p.inv && p.inv.items.length) {
      const pick = (k) => p.inv.items.find((x) => x.k === k);
      const it = hpK < 0.5 ? pick('repair') || pick('stim') : enemy && !p.shield && hpK < 0.85 ? pick('shieldc') : enemy && ed < range && hpK > 0.6 ? pick('adren') : null;
      if (it) { g.lootOp(p, { a: 'use', from: 'inv', id: it.id }); ai.useT = g.time + 1.5; }
    }
    if (ai.goal && ai.goal.camp && !enemy && dist(p, ai.goal) < 60) { mx *= 0.08; my *= 0.08; }
  }
  inp.mx = mx; inp.my = my; inp.a = aim.a; inp.pt = clamp(aim.pt, -1.2, 1.2);

  // 大招
  if (!p.foot && p.sp >= W.spNeed && p.spT <= 0) {
    const sp = W.special;
    const reach = { beam: 700, missiles: 1000, storm: 220, bubble: 260, charge: 260, barrage: 420, quake: 260, bulldoze: 380, napalm: 420, swarm: 420, whirl: 200, sonic: 220, aegis: 320, cluster: 360, shadowstep: 250, venom: 400, cloak: 450, barrier: 220, rend: 480, recon: 420, prism: 460, lancestorm: 320 }[sp];
    if ((enemy && ed < reach) || Math.random() < (P.waste ? 0.015 : P.smart ? 0 : 0.002)) {   // 猪队友乱放大招
      inp.qq++;
      if (enemy) { const a2 = aimAt(p, enemy.x, enemy.y, enemy.z + 16); inp.a = a2.a; inp.pt = a2.pt; inp.ad = ed; }
    }
  }
  // 超载：充满了就在交战时放
  if (p.bt >= 1 && !(p.ovT > 0) && p.ov >= S.OV_NEED && enemy && ed < 320 && Math.random() < P.ov) inp.oq++;
  // 驾驶员技能
  if (p.skillUses > 0 && p.skillCd <= 0 && Math.random() < P.skill) {
    const sk = S.pilot(p.pilot).skill;
    const fight = enemy && ed < 300;
    const use = {
      rush: fight || p.foot, scan: !enemy && Math.random() < 0.05, cheer: hpK < 0.6, guard: fight && hpK < 0.75, smoke: (fight && hpK < 0.5) || p.foot,
      turret: fight, dash: (p.foot && enemy) || (p.weapon === 'fist' && enemy && ed < 260 && ed > 90), emp: enemy && (ed < 200 || (ed < 260 && hpK < 0.6)), bento: hpK < 0.55, decoy: fight && (hpK < 0.6 || ed < 120), overdrive: fight && p.ammo < 1, drone: fight,
      rally: fight, blast: enemy && ed < 200, jam: enemy && ed < 210, flash: enemy && ed < 220,
      seal: enemy && ed < 240, possess: fight && (hpK < 0.7 || ed < 120), airdrop: fight || hpK < 0.6,
      nano: (enemy && ed < 240) || hpK < 0.5, blink: (enemy && ed < 240 && ed > 90) || (p.foot && enemy && hpK < 0.4),
    }[sk] || (P.waste && Math.random() < 0.3);
    if (use) {
      if (sk === 'dash' && enemy && !p.foot) { inp.mx = Math.cos(aim.a); inp.my = Math.sin(aim.a); }
      if ((sk === 'blast' || sk === 'airdrop') && enemy) { const a2 = aimAt(p, enemy.x, enemy.y, enemy.z); inp.a = a2.a; inp.ad = sk === 'airdrop' && hpK < 0.6 ? 0 : ed; }
      if (sk === 'nano' && enemy) { const a2 = aimAt(p, (enemy.x + p.x) / 2, (enemy.y + p.y) / 2, enemy.z); inp.a = a2.a; inp.ad = Math.min(240, ed / 2 + 40); }
      if (sk === 'blink' && enemy) { const a2 = aimAt(p, enemy.x, enemy.y, enemy.z); inp.a = a2.a; inp.ad = Math.max(60, ed - 40); if (p.foot && hpK < 0.4) { inp.a += Math.PI; inp.ad = 220; } }
      if (sk === 'seal' && enemy) { const a2 = aimAt(p, enemy.x + enemy.vx * 0.3, enemy.y + enemy.vy * 0.3, enemy.z); inp.a = a2.a; inp.ad = ed; }
      inp.gq++;
    }
  }
}
// 1.8：百目（咒灵讨伐的 Boss）：慢慢逼近最近的玩家，轮流使用 砸地 / 弹幕环 / 召唤小咒灵 / 冲撞；血量过半狂暴
function bossThink(g, b, dt) {
  const A = b.bossAI, inp = b.input, R = S.RAID;
  if (!b.alive) return;
  const rage = b.hp < b.maxHp * R.rage;
  if (rage && !A.rage) { A.rage = true; A.t = Math.min(A.t, 0.8); g.ev(['boss', b.id, 'rage', r1(b.x), r1(b.y), r1(b.z)]); }
  const foes = [...g.players.values()].filter((q) => q.alive && q.team !== b.team && !q.npc);
  let tgt = null, td = Infinity;
  for (const q of foes) { const d = dist(q, b); if (d < td) { td = d; tgt = q; } }
  let mx = 0, my = 0;
  if (A.dash > 0) {
    A.dash -= dt; mx = A.dx; my = A.dy;
    g.contactDamage(b, b.x, b.y, b.rad + 16, rage ? 45 : 35, 0.6);
    g.paint(b.x, b.y, b.z, 46, b.team, null);
  } else if (tgt && td > 110) { mx = ((tgt.x - b.x) / td) * 0.5; my = ((tgt.y - b.y) / td) * 0.5; }
  const hd = Math.hypot(b.x - S.W / 2, b.y - S.H / 2);
  if (hd > 460 && A.dash <= 0) { mx = ((S.W / 2 - b.x) / hd) * 0.6; my = ((S.H / 2 - b.y) / hd) * 0.6; }
  inp.mx = mx; inp.my = my; inp.f = false; inp.w = A.dash > 0; inp.j = false;
  if (tgt) inp.a = Math.atan2(tgt.y - b.y, tgt.x - b.x);
  // 砸地：预警圈到时间就炸
  A.tele = A.tele.filter((T) => {
    T.t -= dt;
    if (T.t > 0) return true;
    g.explode(T.x, T.y, T.z + 6, T.r, rage ? 72 : 58, 24, b.team, b, true);
    g.ev(['bx', r1(T.x), r1(T.y), r1(T.z + 6), b.team, T.r, 0]);
    return false;
  });
  // 弹幕环：每 0.35 秒一圈
  if (A.ring) {
    A.ring.t -= dt;
    if (A.ring.t <= 0) {
      A.ring.t = 0.35; A.ring.n--;
      const N = rage ? 22 : 18, off = Math.random() * 0.3;
      for (let i = 0; i < N; i++) g.spawnProj(b, (i / N) * Math.PI * 2 + off, 0.02, 360, 560, rage ? 15 : 12, 22, 0, 9, { x: b.x, y: b.y, z: b.z + 40, r: b.rad + 4 });
      if (A.ring.n <= 0) A.ring = null;
    }
  }
  A.t -= dt * (rage ? 1.45 : 1);
  if (A.t > 0 || !foes.length) return;
  const seq = ['slam', 'ring', 'summon', 'slam', 'dash', 'ring'];
  let mv = seq[A.i++ % seq.length];
  if (mv === 'summon' && g.minions.filter((m) => m.alive).length >= 3) mv = 'slam';
  switch (mv) {
    case 'slam': {
      const n = rage ? Math.min(3, foes.length) : Math.min(2, foes.length), pick = foes.slice().sort(() => Math.random() - 0.5).slice(0, n);
      for (const q of pick) { const T = { x: q.x + q.vx * 0.4, y: q.y + q.vy * 0.4, z: g.top(q.x, q.y), r: 115, t: 1.15 }; T.x = clamp(T.x, 20, S.W - 20); T.y = clamp(T.y, 20, S.H - 20); A.tele.push(T); g.ev(['tg', r1(T.x), r1(T.y), r1(T.z), T.r, T.t]); }
      A.t = 2.6; break;
    }
    case 'ring': A.ring = { n: rage ? 3 : 2, t: 0.5 }; g.ev(['boss', b.id, 'ring', r1(b.x), r1(b.y), r1(b.z)]); A.t = 3.2; break;
    case 'summon': {
      let n = rage ? 3 : 2;
      for (const m of g.minions) {
        if (m.alive || n <= 0) continue;
        const a = Math.random() * Math.PI * 2, x = clamp(b.x + Math.cos(a) * 90, 30, S.W - 30), y = clamp(b.y + Math.sin(a) * 90, 30, S.H - 30);
        if (S.collideTest(g.M, x, y, g.top(x, y))) continue;
        g.spawnSpirit(m, { x, y, z: g.top(x, y) }); m.guard = null; n--;
      }
      g.ev(['boss', b.id, 'summon', r1(b.x), r1(b.y), r1(b.z)]); A.t = 3; break;
    }
    case 'dash': {
      let far = null, fd = -1;
      for (const q of foes) { const d = dist(q, b); if (d > fd) { fd = d; far = q; } }
      if (far) { const l = Math.max(1, fd); A.dx = (far.x - b.x) / l; A.dy = (far.y - b.y) / l; A.dash = 1.0; g.knock(b, A.dx, A.dy, 640, 0); g.ev(['boss', b.id, 'dash', r1(b.x), r1(b.y), r1(b.z)]); }
      A.t = 2.8; break;
    }
  }
}
// 挂机：开局在「加载」/ 隔一阵发呆一会儿 / 整局挂机；被打的时候有时会回过神
function afkIdle(g, p, ps) {
  if (!ps.afk) {
    const r = Math.random();
    ps.afk = r < 0.35 ? { mode: 'load', until: rand(8, 25) } : r < 0.8 ? { mode: 'cycle', until: rand(3, 12) } : { mode: 'full', until: 1e9 };
    ps.afk.spin = Math.random() < 0.5 ? 0 : rand(-0.6, 0.6); ps.afkOn = true;
  }
  const A = ps.afk;
  if (ps.afkOn) {
    if (g.time - p.lastHurt < 0.05 && Math.random() < 0.3) A.until = g.time;
    if (g.time < A.until) return true;
    ps.afkOn = false;
    A.next = A.mode === 'cycle' ? g.time + rand(25, 60) : 1e9;
    if (g.chat && Math.random() < 0.55) g.chat.say(p, 'afkBack', { delay: rand(0.5, 2) });
    return false;
  }
  if (A.next && g.time >= A.next) { ps.afkOn = true; A.until = g.time + rand(6, 18); return true; }
  return false;
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
  if (p.guard) { const a = Math.random() * Math.PI * 2, r = rand(30, 140); return { x: p.guard.x + Math.cos(a) * r, y: p.guard.y + Math.sin(a) * r, calm: true }; }   // 守卫：防卡住时也只在岗位附近挪
  // 优先选 180–600 远的平地（太近的话等于原地打转）；逃亡圈里只在安全区内选
  const c = g.obj && g.obj.circle, safe = c && (c.to || c);
  for (let k = 0; k < 40; k++) {
    const x = (randInt(S.GW) + 0.5) * S.CELL, y = (randInt(S.GH) + 0.5) * S.CELL, d = Math.hypot(x - p.x, y - p.y);
    if (safe && Math.hypot(x - safe.x, y - safe.y) > safe.r * 0.8) continue;
    if (S.topAt(g.M, x, y) === 0 && d > (k < 30 ? 180 : 60) && d < 600) return { x, y };
  }
  return { x: S.W / 2, y: S.H / 2 };
}

// ---- 2.1.2：撤离 AI 的打法 ----
//   rat 早撤：拿一点就走、能不打就不打；hunter 阴人：拿够本钱后蹲撤离点、专挑身上值钱的人；
//   balanced 均衡：能多拿就多拿，残血就撤；greedy 贪心：拿到最后一刻，残血也不太跑
const LOOT_STYLE = {
  rat: { want: 2200, late: 1.6, retreat: 0.6, engage: 0, ambush: false, w: 25, name: '早撤型' },
  hunter: { want: 3000, late: 0.6, retreat: 0.35, engage: 520, ambush: true, w: 25, name: '阴人型' },
  balanced: { want: 6000, late: 1, retreat: 0.42, engage: 200, ambush: false, w: 38, name: '均衡型' },
  greedy: { want: 11000, late: 0.55, retreat: 0.16, engage: 260, ambush: false, w: 12, name: '贪心型' },
};
function pickStyle() { let r = Math.random() * 100; for (const [k, s] of Object.entries(LOOT_STYLE)) { if ((r -= s.w) < 0) return k; } return 'balanced'; }
const styleOf = (g, p) => LOOT_STYLE[(g.lootStyle && g.lootStyle[p.team]) || 'balanced'];
// 容器值不值得开：按类型 / 品质估算价值（遗骸就是看得到的真实价值）
const CONT_EV = { vault: 6000, safe: 2400, weapon: 1800, server: 2200, pc: 1200, crate: 900, tools: 800, med: 650, locker: 500, duffel: 420, fridge: 320, pile: 600 };
function contEV(c) {
  if (c.type === 'body' || c.type === 'pile') return S.lootValue(c.items);
  const T = S.LOOT.conts[c.type] || {}, n = c.items.length;
  return (CONT_EV[c.type] || 500) * Math.min(1.6, n / Math.max(1, ((T.n || [1, 2])[0] + (T.n || [1, 2])[1]) / 2)) * (c.state ? 0.75 : 1);
}
function chooseGoal(g, p) {
  const o = g.obj;
  switch (g.mode) {
    case 'loot': {
      // 2.1：守卫守岗位；Boss 沿城区巡逻，护卫跟着 Boss；其他 AI：搜最近的容器，背包够值钱或时间不多了就去能用的撤离点
      if (p.guard) {
        const G = p.guard;
        if (G.route) { const tgt = G.route[G.ri % G.route.length]; if (dist(p, tgt) < 120) G.ri++; const t2 = G.route[G.ri % G.route.length]; return { x: t2.x + rand(-40, 40), y: t2.y + rand(-40, 40), calm: true }; }
        if (G.follow) { const b = g.players.get(G.follow); if (b && b.alive) return { x: b.x + rand(-70, 70), y: b.y + rand(-70, 70), calm: true }; }
        const a = Math.random() * Math.PI * 2, r = rand(0, 120); return { x: G.x + Math.cos(a) * r, y: G.y + Math.sin(a) * r, calm: true };
      }
      const P = BOTS.persona(p.persona), v = S.invValue(p.inv), used = S.invCells(p.inv), cap = p.inv.w * p.inv.h, ST = styleOf(g, p);
      const left = Math.max(0, g.timeLeft) / Math.max(1, g.duration);   // 开局很贪，越到后面越容易满足
      const want = ST.want * (P.pow >= 1.6 ? 1.4 : P.pow >= 1 ? 1 : 0.65) * (1 + 2.5 * left * (ST === LOOT_STYLE.rat ? 0.2 : 1));
      const hurtBad = p.hp < g.maxHpOf(p) * ST.retreat && v > 1500;   // 残血又带着值钱东西：先保命去撤离
      // 阴人型：本钱够了就去撤离点附近蹲人，快结束了（或者已经抢得很肥）再自己撤
      if (ST.ambush && v >= want && g.timeLeft > 130 && v < 16000 && !hurtBad) {
        const open = o.ex.filter((e) => g.exOpen(e) && e.type !== 'lever');
        const tgt = open.length ? open : o.ex.filter((e) => e.type === 'normal');
        if (tgt.length) {
          let e = p.ai && p.ai.campEx && o.ex[p.ai.campEx - 1];
          if (!e || !tgt.includes(e)) { e = tgt[(p.team * 3 + p.slot) % tgt.length]; if (p.ai) p.ai.campEx = o.ex.indexOf(e) + 1; }
          const a = (p.team * 1.7 + p.slot * 1.1) % (Math.PI * 2), r = 170 + (p.slot % 3) * 40;
          return { x: e.x + Math.cos(a) * r, y: e.y + Math.sin(a) * r, calm: true, camp: true };
        }
      }
      if (v >= want || hurtBad || (used >= cap - 1 && v >= want * 0.6) || g.timeLeft < (150 + (p.slot % 3) * 30) * ST.late) {
        const late = g.timeLeft < 220;
        const usable = o.ex.filter((e) => e.type !== 'lever' && !(e.type === 'weight' && used > S.LOOT.ext.weight.max) && (late || e.type !== 'paid'));
        const openEx = usable.filter((e) => g.exOpen(e));
        const list = openEx.length ? openEx : usable.filter((e) => e.type === 'normal' || e.type === 'timed');
        // 分散撤离：别的小队已经在往那边走的撤离点要加很多「距离」
        const heading = (x) => { let n = 0; for (const q of g.players.values()) if (q.bot && q.team !== p.team && !q.guard && q.alive && !q.out && q.ai && q.ai.goal && (q.ai.goal.ex || q.ai.goal.near) && Math.hypot(q.ai.goal.x - x.x, q.ai.goal.y - x.y) < 300) n++; return n; };
        const cost = (x) => dist(p, x) + heading(x) * 3000;
        let e = list[0];
        for (const x of list) if (cost(x) < cost(e)) e = x;
        if (e && !g.exOpen(e)) {   // 还没开：在旁边找个地方躲着等
          const d = Math.max(1, dist(p, e)), k = Math.min(1, 190 / d);
          return { x: e.x + (p.x - e.x) * k + rand(-40, 40), y: e.y + (p.y - e.y) * k + rand(-40, 40), calm: true, near: true };
        }
        if (e) return { x: e.x + rand(-30, 30), y: e.y + rand(-30, 30), calm: true, ex: true };
      }
      const mates = [...g.players.values()].filter((q) => q.team === p.team && q.alive && !q.out);
      const leader = mates.sort((a, b) => a.slot - b.slot)[0] || p;
      if (leader !== p && dist(p, leader) > 340) return { x: leader.x + rand(-60, 60), y: leader.y + rand(-60, 60) };
      const done = (p.ai && p.ai.done) || new Set();
      const hv = g.M.loot && g.M.loot.hv, C2 = S.CELL;
      // 2.1.2：挑「值得开」的容器——估算价值 ÷（距离 + 危险）；背包快满时只看值钱的；早撤型只开顺路的
      const free = cap - used, foes = [...g.players.values()].filter((q) => q.alive && !q.out && q.team !== p.team && !q.guard);
      const reach = ST === LOOT_STYLE.rat ? 700 : ST === LOOT_STYLE.greedy ? 2200 : 1600;
      let best = null, bs = 0;
      for (const c of o.conts) {
        if (!c.items.length || done.has(c.id) || c.z > 120) continue;   // AI 不坐电梯上楼顶
        const d = Math.hypot(c.x - p.x, c.y - p.y);
        if (d > reach) continue;
        const inHv = hv && c.x > hv[0] * C2 && c.x < (hv[0] + hv[2]) * C2 && c.y > hv[1] * C2 && c.y < (hv[1] + hv[3]) * C2;
        if (inHv && !P.chase && P.pow < 1.6 && ST !== LOOT_STYLE.greedy) continue;   // 弱的 AI 不去灰石大厦（贪心型除外）
        const ev = contEV(c);
        if (free <= 2 && ev < 1500) continue;   // 背包快满：小东西不值得开
        let danger = 0;
        for (const q of foes) { const dq = Math.hypot(q.x - c.x, q.y - c.y); if (dq < 520) danger += (520 - dq) * (ST === LOOT_STYLE.rat ? 6 : ST === LOOT_STYLE.greedy ? 1 : 3); }
        if (inHv) danger += ST === LOOT_STYLE.greedy ? 200 : 900;
        const sc = (ev * (c.type === 'body' && ST !== LOOT_STYLE.rat ? 1.5 : 1)) / (d + 300 + danger);   // 别人留下的遗骸很香（早撤型不碰）
        if (sc > bs) { bs = sc; best = c; }
      }
      if (best) return { x: best.x, y: best.y, cont: best.id };
      return randomGoal(g, p);
    }
    case 'park': {
      // 大部分时间守在花车前面一点的位置；偶尔去追近处的气球
      let best = null, bd = 420;
      for (const b of o.balloons) { const d = Math.hypot(b.x - p.x, b.y - p.y); if (d < bd) { bd = d; best = b; } }
      if (best && (p.slot % 2 === 1 || Math.random() < 0.3)) return { x: best.x + rand(-60, 60), y: best.y + rand(-60, 60) };
      const ahead = g.parkPos(o.fl.k + 0.03);
      return { x: clamp(ahead.x + rand(-50, 50), 40, S.W - 40), y: clamp(ahead.y + rand(-50, 50), 40, S.H - 40) };
    }
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
    case 'seal': {   // 1.8：捡封印石 → 回祭坛；没有封印石就去打咒灵
      if (p.carry >= 3 || (p.carry > 0 && o.bats.length === 0)) return S.basePos(p.team);
      let best = null, bd = Infinity;
      for (const b of o.bats) { const d = dist(b, p) + rand(0, 120); if (d < bd) { bd = d; best = b; } }
      for (const s of g.spirits || []) { if (!s.alive) continue; const d = dist(s, p) + 160; if (d < bd) { bd = d; best = s; } }
      if (best) return { x: best.x, y: best.y };
      break;
    }
    case 'raid': {   // 1.8：围着百目打；小咒灵冲最近的人
      if (p.team === 1 && g.boss && g.boss.alive) {
        const a = (p.slot / 4) * Math.PI * 2 + g.time * 0.15, rr = p.weapon === 'charger' || p.weapon === 'mortar' ? 330 : S.WEAPONS[p.weapon].attack === 'punch' ? 70 : 210;
        return { x: clamp(g.boss.x + Math.cos(a) * rr, 40, S.W - 40), y: clamp(g.boss.y + Math.sin(a) * rr, 40, S.H - 40) };
      }
      if (p.team === 2) { let best = null, bd = Infinity; for (const q of g.players.values()) { if (!q.alive || q.team === 2) continue; const d = dist(q, p); if (d < bd) { bd = d; best = q; } } if (best) return { x: best.x, y: best.y }; }
      break;
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
      players: [...this.members.values()].map((c) => ({ id: c.id, name: c.name, team: c.team, weapon: c.weapon, head: c.head, pilot: c.pilot, level: c.level, lv: c.power ? c.power.lv : 1, fid: c.fid || null, rk: c.rk || null, looks: c.looks || null })),
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
    if (typeof m.party === 'boolean') s.party = m.party;   // 1.7：好友组队（队友同一边，剩下的位置 AI 补）
    // 排位赛：禁用名单 + AI 强度（单排房间，由客户端在禁用阶段决定）
    if (typeof m.ranked === 'boolean') s.ranked = m.ranked;
    if (m.bans && typeof m.bans === 'object') {
      const pick = (arr, ok) => (Array.isArray(arr) ? [...new Set(arr.filter(ok))].slice(0, 4) : []);
      s.bans = { pilots: pick(m.bans.pilots, (id) => S.PILOTS.some((P) => P.id === id)), mechs: pick(m.bans.mechs, (id) => !!S.WEAPONS[id]) };
    }
    if (m.botPower === null) delete s.botPower;
    if (m.draft === null) delete s.draft;
    if (m.draft && typeof m.draft === 'object') {   // 1.9：排位赛选人结果（AI 的驾驶员 / 机体 / 名字，按选人顺序）
      const one = (x) => x && typeof x === 'object' && S.PILOTS.some((P) => P.id === x.pilot) && S.WEAPONS[x.mech] ? { pilot: x.pilot, mech: x.mech, name: sanitizeName(x.name) } : null;
      s.draft = {};
      for (const t of [1, 2]) s.draft[t] = (Array.isArray(m.draft[t]) ? m.draft[t] : []).slice(0, 4).map(one).filter(Boolean);
    }
    if (m.rankTier === null) delete s.rankTier;
    if (m.botPower && typeof m.botPower === 'object') s.botPower = { lv: Math.max(1, Math.min(11, m.botPower.lv | 0)), bt: Math.max(0, Math.min(2, m.botPower.bt | 0)) };
    if (Number.isInteger(m.rankTier) && m.rankTier >= 0 && m.rankTier < E.RANK.tiers.length) s.rankTier = m.rankTier;   // AI 性格按段位混合
    if (m.lang === 'zh' || m.lang === 'en') s.lang = m.lang;
    if (Number.isInteger(m.squad) && m.squad >= 1 && m.squad <= 4) s.squad = m.squad;   // 1.6：搜刮撤离小队人数 / 难度 / AI 队友
    if (m.risk === 'normal' || m.risk === 'high') s.risk = m.risk;
    if (typeof m.fill === 'boolean') s.fill = m.fill;
    const host = this.members.get(this.hostId);
    if (s.ranked && host && host.rankTier != null) {   // 在线账号：按服务器记录的段位，客户端改不了
      if (host.canRanked === false) s.ranked = false;
      else { s.botPower = E.rankBotPower(host.rankTier); s.rankTier = host.rankTier; }
    }
    if (s.ranked) { s.bots = true; s.teamSize = 4; s.fair = false; }
    if (typeof m.tutorial === 'boolean' && this.hub && this.hub.local) s.tutorial = m.tutorial;   // 只有浏览器里的本机服务器能开教程
    this.broadcastLobby();
  }
  start() {
    // 2.1.1：联机服务器上开撤离行动——先找同难度、正在进行、有小队全灭空出位置的公开对局，直接中途加入
    if (this.settings.mode === 'loot' && this.hub && !this.hub.local && !this.settings.party && this.members.size <= 4) {
      for (const room of this.hub.rooms.values()) {
        const g = room.game;
        if (room === this || !g || !g.loot || g.risk !== (this.settings.risk || 'normal') || !g.lootJoinable()) continue;
        const conns = [...this.members.values()];
        for (const c of conns) { this.members.delete(c.id); room.members.set(c.id, c); c.room = room; c.team = 1; }
        this.hub.rooms.delete(this.code);
        g.queueJoin(conns);
        for (const c of conns) c.conn.send({ t: 'joining', code: room.code, left: Math.round(g.timeLeft) });
        return;
      }
    }
    if (this.settings.mode === 'loot') this.settings.squad = clamp(Math.max(this.members.size, this.settings.squad || this.members.size), 1, 4);   // 搜刮撤离：小队人数至少是房间人数
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
  if (m.rk && typeof m.rk === 'object') c.rk = { tier: clamp(m.rk.tier | 0, 0, 6), ok: !!m.rk.ok };   // 1.7：组队排位要知道每个人的段位
  if (m.power && typeof m.power === 'object') c.power = { lv: clamp(m.power.lv | 0 || 1, 1, E.MAX_LV), bt: clamp(m.power.bt | 0, 0, 2), tal: cleanTal(m.power.tal), gear: Array.isArray(m.power.gear) ? [...new Set(m.power.gear.filter((g) => S.LOOT.gear[g]))] : [], safe: clamp(m.power.safe | 0 || 1, 1, 3) };
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
    case 'loadout': if (!c.acct) setProfile(c, m); else if (m.rk && typeof m.rk === 'object') c.rk = { tier: c.rankTier != null ? c.rankTier : clamp(m.rk.tier | 0, 0, 6), ok: c.canRanked != null ? c.canRanked : !!m.rk.ok }; if (r) r.broadcastLobby(); break;   // 在线账号的出战配置以服务器资料为准（saveProfile）
    case 'settings': if (r && r.hostId === c.id && r.state === 'lobby') r.applySettings(m); break;
    case 'start': if (r && r.hostId === c.id && r.state === 'lobby') r.start(); break;
    case 'in': if (r && r.game) r.game.input(c.id, m); break;
    case 'chat': {
      if (!r) return;
      const now = Date.now();
      if (typeof m.text === 'string') {   // 1.4.1：打字聊天（全部 / 队伍），每 10 秒最多 5 句
        const text = m.text.replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, S.CHAT_MAX);
        if (!text) return;
        c.chatTimes = (c.chatTimes || []).filter((t) => now - t < 10000);
        if (c.chatTimes.length >= 5 || now - (c.lastText || 0) < 600) return c.conn.send({ t: 'chatSlow' });
        c.chatTimes.push(now); c.lastText = now;
        const ch = m.ch === 1 ? 1 : 0;
        if (r.game && r.game.humanChat(c.id, text, ch)) return;
        const msg = { t: 'chat', id: c.id, name: c.name, team: c.team, text, ch };   // 房间里（还没开局）
        for (const o of r.members.values()) if (!ch || o.team === c.team) o.conn.send(msg);
        return;
      }
      if (now - (c.lastChat || 0) < 800) return;
      c.lastChat = now;
      const k = m.k | 0;
      if (k >= 0 && k < S.QUICK_CHAT.length) r.broadcast({ t: 'qc', id: c.id, k });
      break;
    }
    case 'ping': c.conn.send({ t: 'pong', ts: m.ts }); break;
    case 'lo': if (r && r.game && r.game.loot) r.game.lootOp(r.game.players.get(c.id), m); break;   // 2.1：背包 / 容器操作
    case 'dbgSp': if (hub.debug && r && r.game) { const me = r.game.players.get(c.id); if (me && me.alive) me.sp = S.WEAPONS[me.weapon].spNeed; } break;   // 调试：大招充满
    case 'dbgOv': if (hub.debug && r && r.game) { const me = r.game.players.get(c.id); if (me && me.alive) { me.bt = Math.max(me.bt, 1); me.ov = S.OV_NEED; r.game.activateOverload(me); } } break;   // 调试：立刻放超载
    case 'dbgFinish': if (hub.debug && r && r.game && r.hostId === c.id) { const g = r.game, me = g.players.get(c.id); if (g.loot) { me.extracted = true; me.out = true; me.alive = false; g.obj.banked[c.id] = ['scrap']; } g.finish(me ? me.team : 1); } break;   // 只在测试服务器（GB_DEBUG=1）里可用
    // ---------------- 1.7：好友（服务器转发：好友码 → 连接）----------------
    case 'socHello': {   // 上线 / 更新状态：{ fid, card: { name, pilot, tr, rank, st, code, n } }
      const fid = String(m.fid || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
      if (!fid) return;
      if (c.fid && c.fid !== fid && hub.fids.get(c.fid)) hub.fids.get(c.fid).delete(c);
      c.fid = fid; c.socCard = m.card && typeof m.card === 'object' ? m.card : null;
      if (!hub.fids.has(fid)) hub.fids.set(fid, new Set());
      hub.fids.get(fid).add(c);
      break;
    }
    case 'soc': {   // 发给某个好友码：{ to, m }
      if (!c.fid) return;
      const to = String(m.to || '').toUpperCase(), set = hub.fids.get(to);
      if (!set || !set.size) return c.conn.send({ t: 'socFail', to, kind: m.m && m.m.t });
      const now = Date.now();
      c.socTimes = (c.socTimes || []).filter((t) => now - t < 10000);
      if (c.socTimes.length > 40) return;
      c.socTimes.push(now);
      for (const o of set) o.conn.send({ t: 'soc', from: c.fid, m: m.m });
      break;
    }
    case 'socWho': {   // 查询好友在不在线
      const on = {};
      for (const f of (Array.isArray(m.fids) ? m.fids : []).slice(0, 100)) { const set = hub.fids.get(String(f)); const o = set && [...set][0]; if (o) on[f] = o.socCard || { st: 'menu' }; }
      c.conn.send({ t: 'socWho', on });
      break;
    }
    case 'kick': {   // 队长把人请出队伍
      if (!r || r.hostId !== c.id || r.state !== 'lobby') return;
      const o = r.members.get(m.id | 0);
      if (o && o !== c) { r.remove(o); o.conn.send({ t: 'left', kicked: true }); }
      break;
    }
  }
}


// =====================================================================
// Hub：一个"服务器"（Node 服务器、或房主浏览器里的内置服务器）
// conn 需要实现 send(obj) / sendRaw(str) / congested
// =====================================================================
// 1.7.1 断线重连：连接断开时先不移出房间——对局中保留 60 秒（AI 暂时接管），大厅 / 组队保留 20 秒；
//   客户端用 welcome 里的 token 发 resume，就接回原来的身份、房间和对局（重发开局信息 + 整张涂料图 + 断线期间错过的结算）
const KEEP_WHILE_AWAY = ['end', 'over', 'profile', 'soc', 'left'];
function holdConn() {
  const buf = [];
  const keep = (t) => KEEP_WHILE_AWAY.includes(t) && buf.length < 40;
  return {
    open: false, congested: true, held: true, buf,
    send(o) { if (o && keep(o.t)) buf.push(JSON.stringify(o)); },
    sendRaw(s) { const t = /^\{"t":"(\w+)"/.exec(s); if (t && keep(t[1])) buf.push(s); },
  };
}
function newToken() {
  const A = 'abcdefghijkmnpqrstuvwxyz23456789';
  let s = '';
  for (let i = 0; i < 20; i++) s += A[randInt(A.length)];
  return s;
}
class Hub {
  constructor() { this.clients = new Map(); this.rooms = new Map(); this.fids = new Map(); this.nextId = 1; this.grace = { game: 60000, lobby: 20000 }; }
  connect(conn) {
    const c = { id: this.nextId++, conn, token: newToken(), name: '机兵', weapon: 'blaster', head: 'antenna', pilot: 'blaze', level: 1, room: null, team: 1 };
    this.clients.set(c.id, c);
    conn.send({ t: 'welcome', id: c.id, token: c.token });
    return c;
  }
  message(c, m) {
    if (c.alias) c = c.alias;   // 这条连接已经接回了旧身份
    if (!this.clients.has(c.id) || c.conn.held) return;
    if (m && m.t === 'resume') return this.resume(c, m);
    handle(this, c, m);
  }
  // conn：是哪条连接断开了（旧连接晚到的断开事件直接忽略）
  disconnect(c, conn) {
    if (c.alias) { const o = c.alias; if (!conn || o.conn === conn) this.disconnect(o, conn || o.conn); return; }
    if (conn && c.conn !== conn) return;
    if (!this.clients.has(c.id) || c.conn.held) return;
    const r = c.room, inGame = !!(r && r.game && r.game.players.has(c.id) && !r.game.over);
    const ms = r && !r.manual && this.grace ? (inGame ? this.grace.game : this.grace.lobby) : 0;
    if (ms > 0) {
      c.conn = holdConn();
      if (inGame) r.game.setAway(c.id, true);
      clearTimeout(c.graceT);
      c.graceT = setTimeout(() => this.drop(c), ms);
      if (c.graceT && c.graceT.unref) c.graceT.unref();
      return;
    }
    this.drop(c);
  }
  drop(c) {
    clearTimeout(c.graceT);
    if (!this.clients.delete(c.id)) return;
    if (c.fid && this.fids.get(c.fid)) { this.fids.get(c.fid).delete(c); if (!this.fids.get(c.fid).size) this.fids.delete(c.fid); }
    if (c.room) c.room.remove(c);
  }
  // nc：新连接上的临时身份；m：{ id, token }
  resume(nc, m) {
    const c = this.clients.get(m.id | 0);
    if (!c || c === nc || typeof m.token !== 'string' || c.token !== m.token || c.alias) { nc.conn.send({ t: 'resumeFail' }); return; }
    const old = c.conn, missed = old.held ? old.buf : [];
    if (!old.held) { old.open = false; try { if (old.close) old.close(); } catch (e) { /* ignore */ } }   // 旧连接其实还挂着（半开连接）
    clearTimeout(c.graceT);
    c.conn = nc.conn;
    this.clients.delete(nc.id);
    nc.alias = c;
    const r = c.room, g = r && r.game;
    c.conn.send({ t: 'welcome', id: c.id, token: c.token });
    c.conn.send({ t: 'resumed', room: r ? r.code : null, game: !!(g && g.players.has(c.id)) });
    if (g && g.players.has(c.id) && !g.over) {
      c.conn.send(Object.assign(g.startMsg(), { resume: true }));
      c.conn.send(g.gridMsg());
      g.setAway(c.id, false);
    }
    for (const s of missed) c.conn.sendRaw(s);
    if (r) c.conn.send({ t: 'lobby', room: r.lobbyInfo() });
  }
}

return { Game, Room, Hub, findPath, buildNav };
});
