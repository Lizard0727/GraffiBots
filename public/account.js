// 涂鸦机兵 — 本机账号（双击 HTML / 网页版 / 安卓 App 没有服务器时使用）
// 账号存在这台设备的浏览器存储里：一台设备可以有多个账号，每个账号有自己的进度。
// 密码加盐后做 4000 轮 SHA-256 才保存（不存明文）。注意：本机账号只是把同一台设备上的进度分开，
// 拿到这台设备的人仍然可以改浏览器存储；需要真正安全的账号请用 Node 服务器的「在线账号」。
(function (root) {
  'use strict';
  // ---- 纯 JS SHA-256（不依赖 crypto.subtle，file:// 和旧 WebView 也能用）----
  const K = new Uint32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
    0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
    0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
    0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2]);
  function utf8(s) { return typeof TextEncoder !== 'undefined' ? new TextEncoder().encode(s) : Uint8Array.from(unescape(encodeURIComponent(s)), (c) => c.charCodeAt(0)); }
  function sha256(bytes) {
    const n = bytes.length, len = ((n + 9 + 63) >> 6) << 6, m = new Uint8Array(len);
    m.set(bytes); m[n] = 0x80;
    const bits = n * 8; m[len - 4] = bits >>> 24; m[len - 3] = bits >>> 16; m[len - 2] = bits >>> 8; m[len - 1] = bits; m[len - 5] = Math.floor(n / 0x20000000);
    const H = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]), W = new Uint32Array(64);
    const rr = (x, k) => (x >>> k) | (x << (32 - k));
    for (let o = 0; o < len; o += 64) {
      for (let i = 0; i < 16; i++) W[i] = (m[o + i * 4] << 24) | (m[o + i * 4 + 1] << 16) | (m[o + i * 4 + 2] << 8) | m[o + i * 4 + 3];
      for (let i = 16; i < 64; i++) {
        const a = W[i - 15], b = W[i - 2];
        W[i] = (W[i - 16] + (rr(a, 7) ^ rr(a, 18) ^ (a >>> 3)) + W[i - 7] + (rr(b, 17) ^ rr(b, 19) ^ (b >>> 10))) | 0;
      }
      let a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
      for (let i = 0; i < 64; i++) {
        const t1 = (h + (rr(e, 6) ^ rr(e, 11) ^ rr(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + W[i]) | 0;
        const t2 = ((rr(a, 2) ^ rr(a, 13) ^ rr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
        h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
      }
      H[0] += a; H[1] += b; H[2] += c; H[3] += d; H[4] += e; H[5] += f; H[6] += g; H[7] += h;
    }
    const out = new Uint8Array(32);
    for (let i = 0; i < 8; i++) { out[i * 4] = H[i] >>> 24; out[i * 4 + 1] = H[i] >>> 16; out[i * 4 + 2] = H[i] >>> 8; out[i * 4 + 3] = H[i]; }
    return out;
  }
  const hex = (b) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  function randHex(n) {
    const b = new Uint8Array(n);
    const c = root.crypto || (typeof require === 'function' ? require('crypto').webcrypto : null);
    if (c && c.getRandomValues) c.getRandomValues(b); else for (let i = 0; i < n; i++) b[i] = Math.floor(Math.random() * 256);
    return hex(b);
  }
  // base64（UTF-8 安全；不依赖 Buffer，浏览器和 node 都能用）
  const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  function b64(bytes) { let s = ''; for (let i = 0; i < bytes.length; i += 3) { const n = (bytes[i] << 16) | ((bytes[i + 1] || 0) << 8) | (bytes[i + 2] || 0); s += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + (i + 1 < bytes.length ? B64[(n >> 6) & 63] : '=') + (i + 2 < bytes.length ? B64[n & 63] : '='); } return s; }
  function unb64(s) {
    const out = []; s = s.replace(/=+$/, '');
    for (let i = 0; i < s.length; i += 4) { const n = (B64.indexOf(s[i]) << 18) | (B64.indexOf(s[i + 1]) << 12) | ((B64.indexOf(s[i + 2]) & 63) << 6) | (B64.indexOf(s[i + 3]) & 63); out.push((n >> 16) & 255); if (i + 2 < s.length) out.push((n >> 8) & 255); if (i + 3 < s.length) out.push(n & 255); }
    return typeof TextDecoder !== 'undefined' ? new TextDecoder().decode(new Uint8Array(out)) : decodeURIComponent(escape(String.fromCharCode.apply(null, out)));
  }
  const ROUNDS = 4000;
  function hashPass(pass, salt) {
    let h = sha256(utf8(salt + '\u0000' + pass));
    const sb = utf8(salt), buf = new Uint8Array(32 + sb.length);
    for (let i = 1; i < ROUNDS; i++) { buf.set(h); buf.set(sb, 32); h = sha256(buf); }
    return hex(h);
  }
  function same(a, b) { if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; }

  // ---- 本机账号库 ----
  // store: { get(k, d), set(k, v) }；数据结构 accounts = { 小写名: { name, salt, hash, created, profile } }
  function LocalAccounts(store, S) {
    const all = () => store.get('accounts', {}) || {};
    const put = (a) => store.set('accounts', a);
    const key = (n) => String(n).toLowerCase();
    return {
      list() { return Object.values(all()).map((a) => ({ name: a.name, created: a.created, trophies: (a.profile && a.profile.trophies) || 0 })); },
      register(name, pass, profile) {
        name = String(name || '').trim();
        if (!S.ACCOUNT.nameOk(name)) return { ok: false, err: S.ACCOUNT.nameHint };
        if (!S.ACCOUNT.passOk(pass)) return { ok: false, err: S.ACCOUNT.passHint };
        const a = all();
        if (a[key(name)]) return { ok: false, err: '这个账号名在这台设备上已经有了' };
        const salt = randHex(16);
        a[key(name)] = { name, salt, hash: hashPass(pass, salt), created: Date.now(), profile: Object.assign({}, profile || {}, { name }) };
        put(a);
        return { ok: true, name, profile: a[key(name)].profile };
      },
      login(name, pass) {
        const a = all(), acc = a[key(String(name || '').trim())];
        if (!acc || !same(hashPass(String(pass || ''), acc.salt), acc.hash)) return { ok: false, err: '账号或密码不对' };
        return { ok: true, name: acc.name, profile: Object.assign({}, acc.profile, { name: acc.name }) };
      },
      profile(name) { const acc = all()[key(name)]; return acc ? Object.assign({}, acc.profile, { name: acc.name }) : null; },
      save(name, profile) { const a = all(), acc = a[key(name)]; if (!acc) return false; acc.profile = Object.assign({}, profile, { name: acc.name }); put(a); return true; },
      // 2.1.1：账号转移码——把账号（加盐哈希 + 进度）搬到别的浏览器 / 设备，导入后用原来的密码登录
      exportCode(name) {
        const acc = all()[key(name)]; if (!acc) return null;
        const body = b64(utf8(JSON.stringify({ v: 1, n: acc.name, s: acc.salt, h: acc.hash, c: acc.created, t: Date.now(), p: acc.profile })));
        return 'GBACC1.' + body + '.' + hex(sha256(utf8(body))).slice(0, 10);
      },
      importCode(code, overwrite) {
        const m = String(code || '').replace(/\s+/g, '').match(/^GBACC1\.([A-Za-z0-9+/=]+)\.([0-9a-f]{10})$/);
        if (!m || hex(sha256(utf8(m[1]))).slice(0, 10) !== m[2]) return { ok: false, err: '转移码不完整或者复制错了' };
        let d; try { d = JSON.parse(unb64(m[1])); } catch (e) { return { ok: false, err: '转移码不完整或者复制错了' }; }
        if (!d || d.v !== 1 || !S.ACCOUNT.nameOk(d.n) || !/^[0-9a-f]{32}$/.test(d.s) || !/^[0-9a-f]{64}$/.test(d.h)) return { ok: false, err: '转移码格式不对' };
        const a = all(), k = key(d.n), had = a[k];
        if (had && !overwrite) return { ok: false, exists: true, name: d.n, err: '这台设备上已经有同名账号了' };
        a[k] = { name: d.n, salt: d.s, hash: d.h, created: d.c || Date.now(), profile: Object.assign({}, d.p || {}, { name: d.n }) };
        put(a);
        return { ok: true, name: d.n, replaced: !!had };
      },
      remove(name, pass) {
        const a = all(), acc = a[key(name)];
        if (!acc || !same(hashPass(String(pass || ''), acc.salt), acc.hash)) return { ok: false, err: '密码不对' };
        delete a[key(name)]; put(a); return { ok: true };
      },
    };
  }

  const api = { sha256: (s) => hex(sha256(typeof s === 'string' ? utf8(s) : s)), hashPass, LocalAccounts };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.GAcc = api;
})(typeof window !== 'undefined' ? window : globalThis);
