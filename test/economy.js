// 养成与经济测试：新手号 / 新手宝箱 / 宝箱概率 / 升级突破 / 兑换 / 结算 / 等级加成 / 公平模式 / 服务器防作弊
// 运行：node test/economy.js
'use strict';
const fs = require('fs'), os = require('os'), path = require('path');
const S = require('../public/shared.js');
const GB = require('../public/bots.js');
const E = require('../public/economy.js');
const { Hub, Room, Game, AccountStore } = require('../server.js');

let failed = 0;
const ok = (c, msg) => { console.log((c ? '✓ ' : '✗ ') + msg); if (!c) failed++; };
let seed = 12345;
const rnd = () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };   // mulberry32

// ---- 新手号 ----
const p = E.newProfile('新人');
ok(Object.keys(p.pilots).length === 0 && p.mechs.join() === 'blaster,roller,charger', '新手号：没有驾驶员，送 3 台机体（喷罐 / 滚刷 / 狙击）');
ok(E.normalize({ name: '老玩家', trophies: 500, weapon: 'fist', pilot: 'vet' }).trophies === 0, '老版本资料会重置成新手号（保留名字）');
ok(E.normalize({ name: '老玩家', trophies: 500 }).name === '老玩家', '重置后名字还在');
ok(E.apply(p, 'open', { chest: 'starter' }).ok === false, '没完成教程前没有新手宝箱');
ok(E.apply(p, 'tutorial').ok && p.chests.starter === 1, '完成教程得到新手宝箱');
ok(E.apply(p, 'tutorial').ok === false, '教程奖励只能领一次');
const st = E.apply(p, 'open', { chest: 'starter' }, rnd);
const got = st.items.find((i) => i.k === 'pilot');
ok(got && E.STARTER_PILOTS.includes(got.id) && p.pilot === got.id, `新手宝箱开出常驻驾驶员「${S.pilot(got.id).name}」并自动选上`);
ok(!p.chests.starter, '宝箱开完就没了');

// ---- 出战配置只能选拥有的 ----
E.setLoadout(p, { pilot: 'yuzu', weapon: 'fist' });
ok(p.pilot === got.id && p.weapon !== 'fist', '不能选没有的驾驶员和机体');
E.setLoadout(p, { weapon: 'charger' });
ok(p.weapon === 'charger', '可以换成已有的机体');

// ---- 宝箱概率（大量模拟，和公布的概率一致）----
{
  const N = 20000, cnt = { pilot: 0, mech: 0, crystals: 0, gems: 0 };
  for (let i = 0; i < N; i++) {
    const q = E.newProfile('x'); q.gems = 1e6;
    const r = E.apply(q, 'buy', { chest: 'military' }, rnd);
    for (const it of r.items) if (cnt[it.k] !== undefined) cnt[it.k]++;
  }
  const C = E.CHESTS.military.drops, want = (k) => C.find((d) => d.k === k).p;
  const near = (k) => Math.abs(cnt[k] / N - want(k)) < 0.012;
  ok(near('pilot') && near('mech') && near('crystals') && near('gems'),
    `军用箱 ${N} 次：驾驶员 ${(cnt.pilot / N * 100).toFixed(1)}%（公布 ${want('pilot') * 100}%）、机体 ${(cnt.mech / N * 100).toFixed(1)}%（${want('mech') * 100}%）、结晶 ${(cnt.crystals / N * 100).toFixed(1)}%（${want('crystals') * 100}%）`);
}
{
  // 抽到的一定是还没拥有的；全拥有后换成金币
  const q = E.newProfile('收藏家'); q.gems = 1e7;
  let dupBad = false;
  for (let i = 0; i < 3000; i++) {
    const before = new Set(Object.keys(q.pilots));
    const r = E.apply(q, 'buy', { chest: 'airdrop' }, rnd);
    for (const it of r.items) if (it.k === 'pilot' && before.has(it.id)) dupBad = true;
  }
  ok(!dupBad && Object.keys(q.pilots).length === S.PILOTS.length - E.QUEST_ONLY.filter((x) => !S.WEAPONS[x]).length - E.COLLAB.pilots.length - E.PASS_ONLY.pilots.length && q.mechs.length === S.WEAPON_ORDER.length - E.QUEST_ONLY.filter((x) => S.WEAPONS[x]).length - E.STRIKE_MECHS.length - E.COLLAB.mechs.length - E.PASS_ONLY.mechs.length && !E.COLLAB.pilots.some((x) => q.pilots[x]) && !E.COLLAB.mechs.some((x) => q.mechs.includes(x)) && !q.pilots.han && !q.mechs.includes('riot') && !E.STRIKE_MECHS.some((m) => q.mechs.includes(m)), '不会抽到重复角色，开够了能集齐宝箱里的全部驾驶员和机体（任务角色、特攻队机体、联动角色不在普通宝箱里）');
  const r = E.apply(q, 'buy', { chest: 'airdrop' }, () => 0);
  ok(r.items.some((i) => i.dup) && !r.items.some((i) => i.k === 'pilot'), '全部拥有后，角色 / 机体奖励换成金币');
}
ok(E.apply(E.newProfile('穷'), 'buy', { chest: 'airdrop' }).ok === false, '宝石不够不能买');
ok(E.apply(Object.assign(E.newProfile('x'), { gems: 999 }), 'buy', { chest: 'starter' }).ok === false, '新手宝箱不能买');

// ---- 升级与突破 ----
{
  const q = E.newProfile('练级'); q.pilots.blaze = { lv: 1, bt: 0 }; q.coins = 1e6; q.parts = 1e6; q.crystals = 10;
  let n = 0;
  while (E.apply(q, 'upgrade', { pilot: 'blaze' }).ok) n++;
  ok(q.pilots.blaze.lv === 5 && n === 4, '没突破时最高 5 级');
  const r0 = E.apply(q, 'upgrade', { pilot: 'blaze' });
  ok(!r0.ok && r0.err.includes('突破'), `提示需要突破：「${r0.err}」`);
  ok(E.apply(q, 'break', { pilot: 'blaze' }).ok && q.pilots.blaze.bt === 1 && q.crystals === 9, '突破 I 消耗 1 个能量结晶');
  while (E.apply(q, 'upgrade', { pilot: 'blaze' }).ok);
  ok(q.pilots.blaze.lv === 9, '突破 I 后最高 9 级');
  ok(E.apply(q, 'break', { pilot: 'blaze' }).ok && q.crystals === 6, '突破 II 消耗 3 个能量结晶');
  while (E.apply(q, 'upgrade', { pilot: 'blaze' }).ok);
  ok(q.pilots.blaze.lv === 11 && E.apply(q, 'break', { pilot: 'blaze' }).ok === false, '满级 11 级，不能再突破');
  const spent = E.UP_COINS.reduce((a, b) => a + b, 0) + 500 + 1500;
  ok(q.coins === 1e6 - spent, `从 1 级练到满级共花 ${spent} 金币`);
  const q2 = E.newProfile('缺钱'); q2.pilots.blaze = { lv: 1, bt: 0 };
  q2.coins = 0;
  ok(E.apply(q2, 'upgrade', { pilot: 'blaze' }).err.includes('金币'), '金币不够不能升级');
  ok(E.apply(q2, 'upgrade', { pilot: 'frost' }).ok === false, '不能升级没有的驾驶员');
}
// ---- 兑换 ----
{
  const q = E.newProfile('换'); q.gems = 200;
  ok(E.apply(q, 'exchange', { what: 'parts', n: 5 }).ok && q.gems === 150 && q.parts === E.START.parts + 300, '宝石换零件（50 宝石 → 300 零件）');
  ok(E.apply(q, 'exchange', { what: 'crystal' }).ok && q.crystals === 1 && q.gems === 0, '宝石换能量结晶');
  ok(E.apply(q, 'exchange', { what: 'coins' }).ok === false, '宝石不够不能换');
}
// ---- 比赛结算 ----
{
  const q = E.newProfile('打'); const d0 = q.gems, c0 = q.coins;
  const rw = { xp: 200, trophies: 8, won: true, draw: false, mvp: true, kills: 4, paint: 300 };
  const r = E.applyMatch(q, rw, Date.UTC(2026, 11, 13, 4));
  ok(q.coins - c0 === E.matchCoins(rw) + E.LEVELUP.coins * r.lvUps, `赢一局得金币 +${E.matchCoins(rw)}`);
  ok(q.gems - d0 === E.FIRST_WIN_GEMS + E.LEVELUP.gems * r.lvUps, '每日首胜 +20 宝石');
  const g1 = q.gems;
  E.applyMatch(q, Object.assign({}, rw, { xp: 0 }), Date.UTC(2026, 11, 13, 9));
  ok(q.gems === g1, '同一天第二次赢不再给首胜宝石');
  E.applyMatch(q, Object.assign({}, rw, { xp: 0 }), Date.UTC(2026, 11, 14, 9));
  ok(q.gems === g1 + E.FIRST_WIN_GEMS, '第二天又有首胜宝石');
}

// ---- 对战中的等级加成 / 公平模式 ----
function mkRoom(members, settings) {
  const hub = new Hub();
  const conns = members.map((m) => { const c = hub.connect({ send() {} }); Object.assign(c, m); return c; });
  const room = new Room('T' + Math.random().toString(36).slice(2, 5), conns[0], { manual: true, hub });
  for (const c of conns) room.add(c);
  conns.forEach((c, i) => { c.team = 1 + (i % 2); });
  room.settings = Object.assign({ mode: 'turf', map: 0, duration: 120, teamSize: 1, bots: false }, settings);
  return { g: new Game(room, { manual: true }), conns };
}
{
  const { g, conns } = mkRoom([{ name: 'A', weapon: 'blaster', pilot: 'frost', power: { lv: 11, bt: 2 } }, { name: 'B', weapon: 'blaster', pilot: 'frost', power: { lv: 1, bt: 0 } }]);
  const a = g.players.get(conns[0].id), b = g.players.get(conns[1].id);
  ok(a.maxHp === Math.round(100 * 1.4) && b.maxHp === 100, `11 级生命 ${a.maxHp}，1 级生命 ${b.maxHp}（+40%）`);
  b.hp = 100; g.hurt(b, 10, a); const d1 = 100 - b.hp;
  a.hp = a.maxHp; const h0 = a.hp; g.hurt(a, 10, b); const d2 = h0 - a.hp;
  ok(Math.abs(d1 - 14) < 0.01 && Math.abs(d2 - 10) < 0.01, `11 级打出 ${d1.toFixed(1)} 伤害，1 级打出 ${d2.toFixed(1)}`);
}
{
  const { g, conns } = mkRoom([{ name: 'A', weapon: 'blaster', pilot: 'frost', power: { lv: 11, bt: 2 } }, { name: 'B', weapon: 'blaster', pilot: 'frost', power: { lv: 1, bt: 0 } }], { fair: true });
  const a = g.players.get(conns[0].id), b = g.players.get(conns[1].id);
  ok(a.lv === E.FAIR_LV && b.lv === E.FAIR_LV && a.maxHp === b.maxHp, `公平模式：所有人按 ${E.FAIR_LV} 级计算`);
}
{
  const { g } = mkRoom([{ name: 'A', weapon: 'blaster', pilot: 'frost', power: { lv: 9, bt: 2 } }], { bots: true, teamSize: 2 });
  const bots = [...g.players.values()].filter((p) => p.bot);
  ok(bots.length === 3 && bots.every((b) => Math.abs(b.lv - 9) <= 2 && b.lv - 9 === GB.persona(b.persona).lv), 'AI 的等级跟着真人玩家的等级（按性格 ±2）');
}

// ---- 在线账号：开箱和升级都在服务器上，客户端改不了 ----
{
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'gbeco-')), 'accounts.json');
  fs.writeFileSync(file, JSON.stringify({ accounts: { old: { key: 'old', name: 'Old', salt: 'x', hash: 'y', created: 1, profile: { trophies: 900, weapon: 'fist', pilot: 'vet', xp: 5000 } } }, tokens: {} }));
  const hub = new Hub(); hub.accounts = new AccountStore(file);
  ok(hub.accounts.find('old').profile.trophies === 0 && hub.accounts.find('old').profile.v === E.VERSION, '服务器启动时老账号重置成新手号');
  const box = []; const c = hub.connect({ send: (m) => box.push(m) });
  const last = (t) => [...box].reverse().find((m) => m.t === t);
  const say = (m) => { c.lastAuth = 0; c.lastEco = 0; hub.message(c, m); };
  say({ t: 'auth', op: 'register', name: '在线新人', pass: 'abcdef', profile: { trophies: 999, pilots: { vet: { lv: 11, bt: 2 } }, gems: 99999 } });
  const pr = last('auth').profile;
  ok(pr.gems === E.START.gems && !Object.keys(pr.pilots).length, '注册时伪造的宝石和角色都不会被接受');
  say({ t: 'eco', op: 'open', chest: 'starter' });
  ok(last('eco').ok === false, '没完成教程不能开新手宝箱');
  say({ t: 'eco', op: 'tutorial' }); say({ t: 'eco', op: 'open', chest: 'starter' });
  const e = last('eco'); const pid = e.items.find((i) => i.k === 'pilot').id;
  ok(e.ok && e.profile.pilots[pid] && c.pilot === pid, `服务器开新手宝箱：得到「${S.pilot(pid).name}」，对战配置同步`);
  say({ t: 'saveProfile', profile: { pilot: 'yuzu', weapon: 'fist', pilots: { yuzu: { lv: 11 } }, gems: 1e6 } });
  const acc = hub.accounts.find('在线新人');
  ok(acc.profile.pilot === pid && acc.profile.weapon !== 'fist' && !acc.profile.pilots.yuzu && acc.profile.gems < 1000, '保存配置时伪造的角色 / 宝石无效');
  say({ t: 'hello', name: 'x', pilot: 'yuzu', weapon: 'fist', power: { lv: 11, bt: 2 } });
  say({ t: 'loadout', pilot: 'yuzu', weapon: 'fist', power: { lv: 11, bt: 2 } });
  ok(c.pilot === pid && c.power.lv === 1, '对战时的角色和等级只认服务器资料');
  acc.profile.coins = 1e5; acc.profile.parts = 1e5;
  say({ t: 'eco', op: 'upgrade', pilot: pid });
  ok(last('eco').ok && c.power.lv === 2, '服务器升级后，对战等级马上变成 2 级');
  say({ t: 'eco', op: 'buy', chest: 'airdrop' });
  ok(last('eco').ok === false && /宝石/.test(last('eco').err), `宝石不够买不了：「${last('eco').err}」`);
}

console.log(failed ? `\n${failed} 项失败` : '\n养成与经济测试全部通过');
process.exit(failed ? 1 : 0);
