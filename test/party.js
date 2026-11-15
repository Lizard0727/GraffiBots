// 1.7 好友 + 组队：服务器转发好友消息、在线状态、组队开黑（所有模式队友同一边，AI 补位）、请出队伍
// 运行：node test/party.js
'use strict';
const S = require('../public/shared.js');
const { Hub } = require('../server.js');

let failed = 0;
const ok = (c, msg) => { console.log((c ? '✓ ' : '✗ ') + msg); if (!c) failed++; };
function client(hub, name, fid) {
  const box = [];
  const c = hub.connect({ send: (m) => box.push(m), sendRaw: (str) => box.push(JSON.parse(str)) });
  hub.message(c, { t: 'hello', name, pilot: 'blaze', weapon: 'blaster', rk: { tier: 2, ok: true } });
  if (fid) hub.message(c, { t: 'socHello', fid, card: { name, st: 'menu' } });
  return { c, box, last: (t) => box.filter((m) => m.t === t).pop(), all: (t) => box.filter((m) => m.t === t) };
}
// ---- 好友消息转发 + 在线状态 ----
{
  const hub = new Hub();
  const A = client(hub, 'Alice', 'AAAAAA'), B = client(hub, 'Bob', 'BBBBBB');
  hub.message(A.c, { t: 'soc', to: 'BBBBBB', m: { t: 'req', card: { name: 'Alice' } } });
  const got = B.last('soc');
  ok(got && got.from === 'AAAAAA' && got.m.t === 'req', '好友申请：服务器按好友码转发给对方');
  hub.message(A.c, { t: 'soc', to: 'ZZZZZZ', m: { t: 'inv' } });
  ok(A.last('socFail') && A.last('socFail').to === 'ZZZZZZ', '对方不在线：告诉发送方');
  hub.message(A.c, { t: 'socWho', fids: ['BBBBBB', 'ZZZZZZ'] });
  const who = A.last('socWho');
  ok(who && who.on.BBBBBB && who.on.BBBBBB.name === 'Bob' && !who.on.ZZZZZZ, '查询在线状态：在线的好友带上名片');
  hub.disconnect(B.c);
  hub.message(A.c, { t: 'socWho', fids: ['BBBBBB'] });
  ok(!A.last('socWho').on.BBBBBB, '下线后显示离线');
  for (let i = 0; i < 60; i++) hub.message(A.c, { t: 'soc', to: 'AAAAAA', m: { t: 'hi' } });
  ok(A.all('soc').length <= 41, '刷消息限速（10 秒最多 40 条）');
}
// ---- 组队开黑：各种模式队友同一边 ----
{
  for (const [mode, extra] of [['turf', {}], ['zone', { ranked: true, teamSize: 4 }], ['escape4', {}], ['loot', { squad: 3 }], ['park', {}]]) {
    const hub = new Hub();
    const A = client(hub, 'Alice', 'AAAAAA'), B = client(hub, 'Bob', 'BBBBBB'), C = client(hub, 'Cat', 'CCCCCC');
    hub.message(A.c, { t: 'create' });
    const code = A.c.room.code;
    hub.message(B.c, { t: 'join', code }); hub.message(C.c, { t: 'join', code });
    hub.message(A.c, Object.assign({ t: 'settings', mode, party: true, bots: true, teamSize: 3 }, extra));
    hub.message(A.c, { t: 'start' });
    const g = A.c.room.game; g.stop();
    const teams = [A, B, C].map((x) => g.players.get(x.c.id).team);
    const mates = [...g.players.values()].filter((p) => p.team === teams[0] && !p.guard);
    const expect = mode === 'escape4' ? 2 : mode === 'loot' ? 3 : extra.teamSize || 3;
    const same = mode === 'escape4' ? teams[0] === teams[1] : teams.every((t) => t === teams[0]);
    ok(same && mates.length === expect, `${S.MODES[mode].name}${extra.ranked ? '（排位）' : ''}：3 人组队${mode === 'escape4' ? '（两人一队，前两人同队）' : '在同一边'}，我方 ${mates.length} 人（AI 补位）`);
  }
  // 4 人组队 + 小队人数只设 2：自动扩到 4
  const hub = new Hub();
  const cs = ['A', 'B', 'C', 'D'].map((n, i) => client(hub, n, n.repeat(6)));
  hub.message(cs[0].c, { t: 'create' });
  for (const x of cs.slice(1)) hub.message(x.c, { t: 'join', code: cs[0].c.room.code });
  hub.message(cs[0].c, { t: 'settings', mode: 'turf', party: true, bots: true, teamSize: 2 });
  hub.message(cs[0].c, { t: 'start' });
  const g = cs[0].c.room.game; g.stop();
  ok(cs.every((x) => g.players.get(x.c.id).team === 1) && [...g.players.values()].filter((p) => p.team === 2).length === 4, '4 人组队但人数设 2v2：自动变成 4v4，对面 4 个 AI');
}
// ---- 单排：自己 + AI 队友 ----
{
  const hub = new Hub();
  const A = client(hub, 'Solo', 'SSSSSS');
  hub.message(A.c, { t: 'create' });
  hub.message(A.c, { t: 'settings', mode: 'turf', bots: true, teamSize: 3 });
  hub.message(A.c, { t: 'start' });
  const g = A.c.room.game; g.stop();
  const me = g.players.get(A.c.id);
  ok([...g.players.values()].filter((p) => p.team === me.team).length === 3, '单排：自己 + 2 个 AI 队友');
}
// ---- 请出队伍 ----
{
  const hub = new Hub();
  const A = client(hub, 'Alice', 'AAAAAA'), B = client(hub, 'Bob', 'BBBBBB');
  hub.message(A.c, { t: 'create' }); hub.message(B.c, { t: 'join', code: A.c.room.code });
  hub.message(B.c, { t: 'kick', id: A.c.id });
  ok(A.c.room && A.c.room.members.size === 2, '队员不能踢人');
  hub.message(A.c, { t: 'kick', id: B.c.id });
  ok(!B.c.room && B.last('left') && B.last('left').kicked, '队长把队员请出队伍');
  const lobby = A.last('lobby');
  ok(lobby && lobby.room.players.length === 1 && lobby.room.players[0].fid === 'AAAAAA', '队伍信息里带好友码');
}
// ---- 排位之后再打普通局：排位设置被清掉 ----
{
  const hub = new Hub();
  const A = client(hub, 'Alice', 'AAAAAA');
  hub.message(A.c, { t: 'create' });
  hub.message(A.c, { t: 'settings', mode: 'zone', party: true, ranked: true, botPower: { lv: 9, bt: 2 }, rankTier: 5, bans: { pilots: ['blaze'], mechs: [] } });
  hub.message(A.c, { t: 'settings', mode: 'loot', party: true, ranked: false, botPower: null, rankTier: null, bans: { pilots: [], mechs: [] } });
  const st = A.c.room.settings;
  ok(st.mode === 'loot' && !st.ranked && !st.botPower && st.rankTier == null && st.bans.pilots.length === 0, '排位之后切到别的模式：排位、AI 强度、禁用都清掉');
}
console.log(failed ? `\n${failed} 项失败` : '\n好友 + 组队测试全部通过');
process.exit(failed ? 1 : 0);
