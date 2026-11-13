// 涂鸦机兵 GraffiBots — 联机服务器（零依赖：只需 Node.js）
// 启动：node server.js   然后浏览器打开 http://localhost:3000
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { Game, Room, Hub, findPath, buildNav } = require('./public/core.js');
const hub = new Hub();
hub.accounts = null;   // 启动服务器时挂上账号系统（见文件末尾）

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC = path.join(__dirname, 'public');
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8',
};


// =====================================================================
// 账号：保存在 data/accounts.json（密码用 scrypt 加盐哈希，登录令牌只存哈希）
// 奖杯 / 经验 / 战绩由服务器在比赛结束时结算，客户端只能改出战配置
// =====================================================================
const S = require('./public/shared.js');
const E = require('./public/economy.js');
// 服务器开箱用的随机数（加密随机，客户端无法预测）
const cryptoRand = () => crypto.randomBytes(4).readUInt32BE(0) / 4294967296;
class AccountStore {
  constructor(file) {
    this.file = file;
    this.data = { accounts: {}, tokens: {} };
    try { this.data = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { /* 第一次运行：还没有账号文件 */ }
    this.data.accounts = this.data.accounts || {}; this.data.tokens = this.data.tokens || {};
    // 老版本的账号统一重置成新手号（保留账号名和密码）
    for (const acc of Object.values(this.data.accounts)) acc.profile = E.normalize(acc.profile, acc.name);
    this.fails = new Map();
    this.saveT = null;
  }
  save(now) {
    clearTimeout(this.saveT);
    const write = () => {
      try {
        fs.mkdirSync(path.dirname(this.file), { recursive: true });
        const tmp = this.file + '.tmp';
        fs.writeFileSync(tmp, JSON.stringify(this.data));
        fs.renameSync(tmp, this.file);   // 先写临时文件再改名，写到一半断电也不会损坏
      } catch (e) { console.error('保存账号失败:', e.message); }
    };
    if (now) write(); else this.saveT = setTimeout(write, 500);
  }
  static hashPass(pass, salt) { return crypto.scryptSync(pass, salt, 32).toString('hex'); }
  static sha(t) { return crypto.createHash('sha256').update(t).digest('hex'); }
  find(name) { return this.data.accounts[String(name).toLowerCase()] || null; }
  issueToken(acc) {
    const token = crypto.randomBytes(32).toString('hex');
    this.data.tokens[AccountStore.sha(token)] = { a: acc.key, exp: Date.now() + 30 * 86400000 };
    // 每个账号最多保留 5 个登录设备
    const mine = Object.entries(this.data.tokens).filter(([, v]) => v.a === acc.key).sort((x, y) => x[1].exp - y[1].exp);
    while (mine.length > 5) delete this.data.tokens[mine.shift()[0]];
    return token;
  }
  publicProfile(acc) { return Object.assign({}, acc.profile, { name: acc.name }); }
  // 登录失败太多次：这个账号名锁 30 秒
  locked(name) { const f = this.fails.get(String(name).toLowerCase()); return f && f.n >= 5 && Date.now() - f.t < 30000; }
  fail(name) { const k = String(name).toLowerCase(), f = this.fails.get(k) || { n: 0, t: 0 }; f.n = Date.now() - f.t > 30000 ? 1 : f.n + 1; f.t = Date.now(); this.fails.set(k, f); }
  bind(c, acc, token) {
    c.acct = acc.key;
    c.name = acc.name;
    const p = acc.profile;
    this.syncConn(c, acc);
    c.conn.send({ t: 'auth', ok: true, token, account: { name: acc.name, created: acc.created }, profile: this.publicProfile(acc) });
    if (c.room) c.room.broadcastLobby();
  }
  // 对战用的配置和等级只认服务器上的资料（客户端改不了）
  syncConn(c, acc) {
    const p = acc.profile;
    c.weapon = p.weapon; c.head = p.head; c.pilot = p.pilot || 'blaze'; c.level = S.levelFromXp(p.xp);
    c.power = E.power(p, p.pilot);
    c.owned = { pilots: Object.keys(p.pilots), mechs: p.mechs.slice() };
  }
  handle(c, m) {
    const err = (msg) => c.conn.send({ t: 'auth', ok: false, op: m.op, err: msg });
    const now = Date.now();
    if (now - (c.lastAuth || 0) < 400) return err('操作太快了，请稍等');
    c.lastAuth = now;
    switch (m.op) {
      case 'register': {
        const name = String(m.name || '').trim(), pass = String(m.pass || '');
        if (!S.ACCOUNT.nameOk(name)) return err(S.ACCOUNT.nameHint);
        if (!S.ACCOUNT.passOk(pass)) return err(S.ACCOUNT.passHint);
        if (this.find(name)) return err('这个账号名已经被注册了');
        const salt = crypto.randomBytes(16).toString('hex');
        // 在线账号一律从新手开始（游客在本机的进度不能带上服务器，避免伪造）
        const acc = { key: name.toLowerCase(), name, salt, hash: AccountStore.hashPass(pass, salt), created: now, profile: E.newProfile(name) };
        this.data.accounts[acc.key] = acc;
        const token = this.issueToken(acc);
        this.save(true);
        return this.bind(c, acc, token);
      }
      case 'login': {
        const name = String(m.name || '').trim(), pass = String(m.pass || '');
        if (this.locked(name)) return err('密码错误次数太多，请 30 秒后再试');
        const acc = this.find(name);
        const ok = acc && crypto.timingSafeEqual(Buffer.from(acc.hash, 'hex'), Buffer.from(AccountStore.hashPass(pass, acc.salt), 'hex'));
        if (!ok) { this.fail(name); return err('账号或密码不对'); }
        this.fails.delete(name.toLowerCase());
        const token = this.issueToken(acc);
        this.save();
        return this.bind(c, acc, token);
      }
      case 'token': {
        const t = this.data.tokens[AccountStore.sha(String(m.token || ''))];
        const acc = t && t.exp > now && this.data.accounts[t.a];
        if (!acc) return err('登录已过期，请重新登录');
        return this.bind(c, acc, null);
      }
      case 'logout': {
        if (m.token) delete this.data.tokens[AccountStore.sha(String(m.token))];
        c.acct = null;
        this.save();
        return c.conn.send({ t: 'auth', ok: true, op: 'logout' });
      }
    }
  }
  // 客户端只能保存出战配置（而且只能选已拥有的驾驶员 / 机体）
  saveProfile(c, m) {
    const acc = c.acct && this.data.accounts[c.acct];
    if (!acc || !m.profile) return;
    E.setLoadout(acc.profile, m.profile);
    this.syncConn(c, acc);
    if (c.room) c.room.broadcastLobby();
    this.save();
  }
  // 开箱 / 购买 / 兑换 / 升级 / 突破 / 完成教程：全部在服务器上执行
  eco(c, m) {
    const acc = c.acct && this.data.accounts[c.acct];
    const reply = (o) => c.conn.send(Object.assign({ t: 'eco', op: m.op, req: m.req }, o));
    if (!acc) return reply({ ok: false, err: '请先登录在线账号' });
    const now = Date.now();
    if (now - (c.lastEco || 0) < 150) return reply({ ok: false, err: '操作太快了' });
    c.lastEco = now;
    const r = E.apply(acc.profile, String(m.op || ''), { chest: m.chest, what: m.what, n: m.n, pilot: m.pilot, id: m.id }, cryptoRand);
    if (r.ok) { this.syncConn(c, acc); this.save(); }
    reply(Object.assign({}, r, { profile: this.publicProfile(acc) }));
  }
  // 比赛结束：服务器按同一套规则发奖励
  applyResult(c, result) {
    const acc = c.acct && this.data.accounts[c.acct];
    if (!acc) return;
    const r = S.matchReward(result, c.id);
    if (!r) return;
    const res = E.applyMatch(acc.profile, r);
    this.syncConn(c, acc);
    this.save();
    c.conn.send({ t: 'profile', profile: this.publicProfile(acc), reward: r, items: res.items });
  }
}

function lanAddresses() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces()))
    for (const a of list || []) if (a.family === 'IPv4' && !a.internal) out.push(a.address);
  return out;
}

// =====================================================================
// 极简 WebSocket 实现（RFC 6455，文本帧）
// =====================================================================
class WSConn {
  constructor(socket) {
    this.socket = socket; this.buf = Buffer.alloc(0); this.open = true; this.frag = null;
    this.onmessage = null; this.onclose = null;
    socket.on('data', (d) => this.onData(d));
    socket.on('close', () => this.close());
    socket.on('error', () => this.close());
  }
  onData(d) {
    this.buf = this.buf.length ? Buffer.concat([this.buf, d]) : d;
    while (this.open) {
      if (this.buf.length < 2) return;
      const b0 = this.buf[0], b1 = this.buf[1];
      const fin = b0 & 0x80, op = b0 & 0x0f, masked = b1 & 0x80;
      let len = b1 & 0x7f, off = 2;
      if (len === 126) { if (this.buf.length < 4) return; len = this.buf.readUInt16BE(2); off = 4; }
      else if (len === 127) { if (this.buf.length < 10) return; len = Number(this.buf.readBigUInt64BE(2)); off = 10; }
      if (len > (1 << 20)) { this.close(); return; }
      const mlen = masked ? 4 : 0;
      if (this.buf.length < off + mlen + len) return;
      const payload = Buffer.from(this.buf.subarray(off + mlen, off + mlen + len));
      if (masked) {
        const m = this.buf.subarray(off, off + 4);
        for (let i = 0; i < payload.length; i++) payload[i] ^= m[i & 3];
      }
      this.buf = this.buf.subarray(off + mlen + len);
      if (op === 8) { this.close(); return; }
      if (op === 9) { this.sendFrame(10, payload); continue; }
      if (op === 10) continue;
      if (op === 1 || op === 2) {
        if (fin) this.deliver(payload); else this.frag = [payload];
      } else if (op === 0 && this.frag) {
        this.frag.push(payload);
        if (fin) { const all = Buffer.concat(this.frag); this.frag = null; this.deliver(all); }
      }
    }
  }
  deliver(p) {
    if (!this.onmessage) return;
    try { this.onmessage(p.toString('utf8')); } catch (e) { console.error('消息处理出错:', e); }
  }
  sendFrame(op, payload) {
    if (!this.open) return;
    const len = payload.length;
    let h;
    if (len < 126) { h = Buffer.alloc(2); h[1] = len; }
    else if (len < 65536) { h = Buffer.alloc(4); h[1] = 126; h.writeUInt16BE(len, 2); }
    else { h = Buffer.alloc(10); h[1] = 127; h.writeBigUInt64BE(BigInt(len), 2); }
    h[0] = 0x80 | op;
    this.socket.write(Buffer.concat([h, payload]));
  }
  sendRaw(str) { this.sendFrame(1, Buffer.from(str, 'utf8')); }
  send(obj) { this.sendRaw(JSON.stringify(obj)); }
  get congested() { return this.socket.writableLength > 512 * 1024; }
  close() {
    if (!this.open) return;
    this.open = false;
    try { this.socket.destroy(); } catch (e) { /* ignore */ }
    if (this.onclose) this.onclose();
  }
}

// =====================================================================
// HTTP + WebSocket 服务器
// =====================================================================
function createServer() {
  const server = http.createServer((req, res) => {
    let url;
    try { url = decodeURIComponent((req.url || '/').split('?')[0]); } catch (e) { res.writeHead(400); return res.end(); }
    if (url === '/info') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ lan: lanAddresses(), port: PORT, rooms: hub.rooms.size }));
    }
    if (url === '/') url = '/index.html';
    const fp = path.normalize(path.join(PUBLIC, url));
    if (!fp.startsWith(PUBLIC)) { res.writeHead(403); return res.end(); }
    fs.readFile(fp, (err, data) => {
      if (err) { res.writeHead(404); return res.end('Not found'); }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(fp)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
      res.end(data);
    });
  });

  server.on('upgrade', (req, socket) => {
    const key = req.headers['sec-websocket-key'];
    if (!key || (req.url || '').split('?')[0] !== '/ws') { socket.destroy(); return; }
    const accept = crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
    socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + accept + '\r\n\r\n');
    socket.setNoDelay(true);
    const conn = new WSConn(socket);
    const c = hub.connect(conn);
    conn.onmessage = (txt) => { let m; try { m = JSON.parse(txt); } catch (e) { return; } hub.message(c, m); };
    conn.onclose = () => hub.disconnect(c);
  });
  return server;
}

if (require.main === module) {
  hub.accounts = new AccountStore(process.env.GB_ACCOUNTS || path.join(__dirname, 'data', 'accounts.json'));
  const server = createServer();
  server.listen(PORT, () => {
    console.log('\n  🎨 涂鸦机兵 GraffiBots 服务器已启动');
    console.log(`  本机访问:   http://localhost:${PORT}`);
    for (const ip of lanAddresses()) console.log(`  局域网访问: http://${ip}:${PORT}`);
    console.log('\n  把局域网地址发给同一网络下的朋友即可一起玩。按 Ctrl+C 关闭。\n');
  });
}

module.exports = { Game, Room, Hub, createServer, findPath, buildNav, AccountStore, hub };
