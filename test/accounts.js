// 账号测试：注册 / 重名 / 登录 / 错误密码锁定 / 令牌自动登录 / 只能改出战配置 / 比赛结束由服务器发奖励 / 数据落盘
// 运行：node test/accounts.js
'use strict';
const fs = require('fs'), os = require('os'), path = require('path');
const S = require('../public/shared.js');
const { Hub, Room, Game, AccountStore } = require('../server.js');

let failed = 0;
const ok = (c, msg) => { console.log((c ? '✓ ' : '✗ ') + msg); if (!c) failed++; };
const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'gbacc-')), 'accounts.json');
const hub = new Hub();
hub.accounts = new AccountStore(file);
function client() {
  const box = [];
  const conn = { send: (m) => box.push(typeof m === 'string' ? JSON.parse(m) : m) };
  const c = hub.connect(conn);
  c.lastAuth = 0;
  return { c, box, last: (t) => [...box].reverse().find((m) => m.t === t), say: (m) => { c.lastAuth = 0; hub.message(c, m); } };
}

const A = client();
A.say({ t: 'hello', name: '游客', weapon: 'fist', head: 'antenna', pilot: 'gale', level: 1 });
ok(A.last('caps') && A.last('caps').accounts === true, '服务器告诉客户端：这里有账号系统');
A.say({ t: 'auth', op: 'register', name: 'a', pass: '123456' });
ok(A.last('auth').ok === false, `账号名太短被拒绝：「${A.last('auth').err}」`);
A.say({ t: 'auth', op: 'register', name: '凌焰粉丝', pass: '123' });
ok(A.last('auth').ok === false, `密码太短被拒绝：「${A.last('auth').err}」`);
A.say({ t: 'auth', op: 'register', name: '凌焰粉丝', pass: 'paint123', profile: { weapon: 'fist', pilot: 'gale', trophies: 9999, xp: 99999 } });
const reg = A.last('auth');
ok(reg.ok && reg.token && reg.profile.weapon === 'fist' && reg.profile.pilot === 'gale', '注册成功，游客的出战配置带进了新账号');
ok(reg.profile.trophies === 0 && reg.profile.xp === 0, '伪造的奖杯 / 经验不会被带进来（从 0 开始）');
ok(A.c.name === '凌焰粉丝' && A.c.acct, '登录后名字就是账号名');
const raw = fs.readFileSync(file, 'utf8');
ok(!raw.includes('paint123') && !raw.includes(reg.token), '账号文件里没有明文密码，也没有明文令牌');

const B = client();
B.say({ t: 'auth', op: 'register', name: '凌焰粉丝', pass: 'another1' });
ok(B.last('auth').ok === false, `重名被拒绝：「${B.last('auth').err}」`);
B.say({ t: 'auth', op: 'register', name: 'LINGYAN_fan', pass: 'abcdef' });
B.say({ t: 'auth', op: 'register', name: 'lingyan_FAN', pass: 'abcdef' });
ok(B.last('auth').ok === false, '账号名不分大小写，不能重复');

const C = client();
C.say({ t: 'auth', op: 'login', name: '凌焰粉丝', pass: 'wrong' });
ok(C.last('auth').ok === false, `错误密码：「${C.last('auth').err}」`);
for (let i = 0; i < 6; i++) C.say({ t: 'auth', op: 'login', name: '凌焰粉丝', pass: 'wrong' + i });
C.say({ t: 'auth', op: 'login', name: '凌焰粉丝', pass: 'paint123' });
ok(C.last('auth').ok === false && /30/.test(C.last('auth').err), `连续输错会被锁 30 秒：「${C.last('auth').err}」`);
hub.accounts.fails.clear();
C.say({ t: 'auth', op: 'login', name: '凌焰粉丝', pass: 'paint123' });
ok(C.last('auth').ok && C.last('auth').profile.pilot === 'gale', '正确密码登录成功，读到保存的资料');

const D = client();
D.say({ t: 'auth', op: 'token', token: reg.token });
ok(D.last('auth').ok && D.last('auth').account.name === '凌焰粉丝', '用保存的令牌自动登录');
D.say({ t: 'auth', op: 'token', token: 'f'.repeat(64) });
ok(D.last('auth').ok === false, '伪造的令牌无效');

// 只能改出战配置
D.say({ t: 'auth', op: 'token', token: reg.token });
D.say({ t: 'saveProfile', profile: { weapon: 'mortar', pilot: 'vet', trophies: 5000, xp: 1e6, head: 'horns' } });
const acc = hub.accounts.find('凌焰粉丝');
ok(acc.profile.weapon === 'mortar' && acc.profile.pilot === 'vet', '可以保存出战配置');
ok(acc.profile.trophies === 0 && acc.profile.xp === 0 && acc.profile.head === 'antenna', '不能自己改奖杯 / 经验，也不能戴没解锁的头部涂装');

// 比赛结束：服务器发奖励
const room = new Room('ACCT', D.c, { manual: true, hub });
room.add(D.c);
room.settings = { mode: 'turf', map: 0, duration: 60, teamSize: 2, bots: true };
const g = new Game(room, { manual: true });
g.countdown = 0;
for (let i = 0; i < 70 * S.TICK && !g.over; i++) g.step();
if (!g.over) g.finish(null);
const result = g.result;
const expect = S.matchReward(result, D.c.id);
room.onGameEnd(result);
const pm = D.last('profile');
ok(pm && pm.reward.xp === expect.xp && pm.profile.xp === expect.xp, `比赛结束服务器结算经验 +${expect.xp}`);
ok(pm && pm.profile.trophies === Math.max(0, expect.trophies) && pm.profile.matches === 1, `奖杯 ${expect.trophies >= 0 ? '+' : ''}${expect.trophies}，场次 +1`);

// 重启服务器后数据还在
hub.accounts.save(true);
const again = new AccountStore(file);
ok(again.find('凌焰粉丝') && again.find('凌焰粉丝').profile.matches === 1, '重启后账号和战绩都还在');
D.say({ t: 'auth', op: 'logout', token: reg.token });
const E = client();
E.say({ t: 'auth', op: 'token', token: reg.token });
ok(E.last('auth').ok === false, '退出登录后，这个令牌就不能再用了');

// ---- 本机账号（没有服务器时）----
const GAcc = require('../public/account.js');
const mem = {}; const store = { get: (k, d) => (k in mem ? JSON.parse(mem[k]) : d), set: (k, v) => { mem[k] = JSON.stringify(v); } };
const L = GAcc.LocalAccounts(store, S);
ok(L.register('喷漆王', 'abc123', { trophies: 30, weapon: 'roller' }).ok, '本机账号：注册（带上游客进度）');
ok(L.register('喷漆王', 'zzzzzz').ok === false, '本机账号：同一台设备不能重名');
ok(!mem.accounts.includes('abc123'), '本机账号：存储里没有明文密码');
ok(L.login('喷漆王', 'nope12').ok === false, '本机账号：错误密码登录失败');
const li = L.login('喷漆王', 'abc123');
ok(li.ok && li.profile.trophies === 30 && li.profile.weapon === 'roller', '本机账号：登录读到自己的进度');
L.save('喷漆王', Object.assign(li.profile, { trophies: 38 }));
ok(L.profile('喷漆王').trophies === 38 && L.list().length === 1, '本机账号：保存进度');

console.log(failed ? `\n${failed} 项失败` : '\n账号测试全部通过');
process.exit(failed ? 1 : 0);
