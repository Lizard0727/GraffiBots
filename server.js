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

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC = path.join(__dirname, 'public');
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8',
};


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
  const server = createServer();
  server.listen(PORT, () => {
    console.log('\n  🎨 涂鸦机兵 GraffiBots 服务器已启动');
    console.log(`  本机访问:   http://localhost:${PORT}`);
    for (const ip of lanAddresses()) console.log(`  局域网访问: http://${ip}:${PORT}`);
    console.log('\n  把局域网地址发给同一网络下的朋友即可一起玩。按 Ctrl+C 关闭。\n');
  });
}

module.exports = { Game, Room, Hub, createServer, findPath, buildNav };
