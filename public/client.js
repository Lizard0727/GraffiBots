// 涂鸦机兵 GraffiBots — 客户端
(() => {
  'use strict';
  const S = window.GS;
  const $ = (id) => document.getElementById(id);
  const cv = $('game'), ctx = cv.getContext('2d');
  let DPR = 1, VW = 0, VH = 0;
  function resize() {
    DPR = Math.min(2, window.devicePixelRatio || 1);
    VW = innerWidth; VH = innerHeight;
    cv.width = Math.round(VW * DPR); cv.height = Math.round(VH * DPR);
    cv.style.width = VW + 'px'; cv.style.height = VH + 'px';
  }
  addEventListener('resize', resize); resize();

  // ================= 工具 =================
  const store = {
    get(k, d) { try { const v = localStorage.getItem('gb_' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('gb_' + k, JSON.stringify(v)); } catch (e) { /* ignore */ } },
  };
  const profile = Object.assign({ name: '', weapon: 'blaster', head: 'antenna', pilot: 'blaze', xp: 0, matches: 0, wins: 0, kills: 0, paint: 0 }, store.get('profile', {}));
  if (!S.WEAPONS[profile.weapon]) profile.weapon = 'blaster';
  if (!S.HEADS.some((h) => h.id === profile.head)) profile.head = 'antenna';
  if (!S.PILOTS.some((p) => p.id === profile.pilot)) profile.pilot = 'blaze';
  const level = () => S.levelFromXp(profile.xp);
  const saveProfile = () => store.set('profile', profile);

  function toast(msg, ms = 2400) {
    const t = $('toast');
    t.textContent = msg; t.classList.add('show');
    clearTimeout(toast.h); toast.h = setTimeout(() => t.classList.remove('show'), ms);
  }
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function hexRgb(hex) { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function rgba(hex, a) { const [r, g, b] = hexRgb(hex); return `rgba(${r},${g},${b},${a})`; }
  function shade(hex, amt) {
    const f = (v) => Math.max(0, Math.min(255, Math.round(amt > 0 ? v + (255 - v) * amt : v * (1 + amt))));
    const [r, g, b] = hexRgb(hex);
    return `rgb(${f(r)},${f(g)},${f(b)})`;
  }
  const lerp = (a, b, k) => a + (b - a) * k;
  function lerpAngle(a, b, k) { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return a + d * k; }
  function rng(seed) { let s = (seed >>> 0) || 1; return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 100000) / 100000; }; }
  const fmtTime = (t) => { t = Math.max(0, Math.ceil(t)); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; };

  // ================= 音频（见 audio.js） =================
  const AU = window.GBAudio, sfx = AU.sfx;
  let shakeOn = store.get('shake', true);
  // 触屏设备（手机 / 平板）：虚拟摇杆 + 按钮，默认低画质
  const TOUCH = (window.matchMedia && matchMedia('(pointer: coarse)').matches) || ('ontouchstart' in window && navigator.maxTouchPoints > 0);
  if (TOUCH) document.body.classList.add('touch');
  let hqOn = store.get('hq', !TOUCH);
  let sens = store.get('sens', 1);
  function toggleMute() { const m = AU.toggleMute(); toast(m ? '已静音' : '已开启声音', 1000); renderSettings(); }

  // ================= 绘制机兵 =================
  function rr(c, x, y, w, h, r) {
    c.beginPath(); c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
  }
  function drawWeapon(c, w, color, o) {
    c.lineWidth = 2; c.strokeStyle = '#101118';
    switch (w) {
      case 'blaster':
        c.fillStyle = '#2d3042'; rr(c, 6, 3, 18, 8, 3); c.fill(); c.stroke();
        c.fillStyle = color; rr(c, 20, 4, 7, 6, 2); c.fill(); c.stroke();
        break;
      case 'roller':
        c.strokeStyle = '#2d3042'; c.lineWidth = 4; c.beginPath(); c.moveTo(8, 0); c.lineTo(22, 0); c.stroke();
        c.lineWidth = 2; c.strokeStyle = '#101118'; c.fillStyle = color; rr(c, 20, -19, 10, 38, 4); c.fill(); c.stroke();
        c.fillStyle = 'rgba(255,255,255,.28)'; rr(c, 22, -17, 3, 34, 1.5); c.fill();
        break;
      case 'charger':
        c.fillStyle = '#2d3042'; rr(c, 4, 3, 36, 6, 3); c.fill(); c.stroke();
        c.fillStyle = color; rr(c, 10, -2, 11, 5, 2); c.fill(); c.stroke();
        if (o.charge > 0) { c.fillStyle = `rgba(255,255,255,${0.3 + 0.7 * o.charge})`; c.beginPath(); c.arc(41, 6, 2 + 4 * o.charge, 0, 7); c.fill(); }
        break;
      case 'bucket':
        c.fillStyle = color; c.beginPath(); c.moveTo(8, -6); c.lineTo(27, -12); c.lineTo(27, 12); c.lineTo(8, 6); c.closePath(); c.fill(); c.stroke();
        c.fillStyle = '#2d3042'; rr(c, 25, -12, 4, 24, 2); c.fill();
        break;
      case 'gatling': {
        c.fillStyle = '#2d3042'; rr(c, 4, -2, 11, 16, 4); c.fill(); c.stroke();
        const sp = o.gspin || 0;
        for (let i = 0; i < 3; i++) { rr(c, 13, Math.sin(sp + i * 2.1) * 4 + 4.5, 19, 3.2, 1.5); c.fill(); c.stroke(); }
        c.fillStyle = color; c.beginPath(); c.arc(9.5, 6, 3, 0, 7); c.fill();
        break;
      }
    }
  }
  function drawHead(c, h, color) {
    c.lineWidth = 2; c.strokeStyle = '#101118';
    switch (h) {
      case 'antenna':
        c.beginPath(); c.moveTo(-3, -2); c.lineTo(-12, -12); c.stroke();
        c.fillStyle = '#fff36b'; c.beginPath(); c.arc(-12, -12, 3.6, 0, 7); c.fill(); c.stroke();
        break;
      case 'mohawk':
        c.fillStyle = shade(color, 0.5);
        for (let i = 0; i < 4; i++) { const x = -4 + i * 4.5; c.beginPath(); c.moveTo(x, -3.5); c.lineTo(x, 3.5); c.lineTo(x - 8, 0); c.closePath(); c.fill(); c.stroke(); }
        break;
      case 'phones':
        c.lineWidth = 3; c.beginPath(); c.arc(0, 0, 13, -Math.PI * 0.5, Math.PI * 0.5, true); c.stroke();
        c.lineWidth = 2; c.fillStyle = '#23252f';
        for (const s of [-1, 1]) { c.beginPath(); c.arc(-1, s * 13, 5, 0, 7); c.fill(); c.stroke(); c.fillStyle = color; c.beginPath(); c.arc(-1, s * 13, 2.2, 0, 7); c.fill(); c.fillStyle = '#23252f'; }
        break;
      case 'cone':
        c.fillStyle = '#ff7a1a'; c.beginPath(); c.arc(-2, 0, 8, 0, 7); c.fill(); c.stroke();
        c.strokeStyle = '#fff'; c.lineWidth = 2.5; c.beginPath(); c.arc(-2, 0, 5, 0, 7); c.stroke();
        c.fillStyle = '#ff7a1a'; c.beginPath(); c.arc(-2, 0, 2.2, 0, 7); c.fill();
        break;
      case 'crown': {
        c.fillStyle = '#ffd23f'; c.beginPath();
        for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2, r = i % 2 ? 4.5 : 9.5; c.lineTo(-2 + Math.cos(a) * r, Math.sin(a) * r); }
        c.closePath(); c.fill(); c.stroke();
        c.fillStyle = '#ff3e6c'; c.beginPath(); c.arc(-2, 0, 2.4, 0, 7); c.fill();
        break;
      }
      case 'horns':
        c.fillStyle = '#f4efe6';
        for (const s of [-1, 1]) {
          c.beginPath(); c.moveTo(-4, s * 6); c.quadraticCurveTo(4, s * 18, 12, s * 15); c.quadraticCurveTo(4, s * 12, 2, s * 4); c.closePath(); c.fill(); c.stroke();
        }
        break;
    }
  }
  // 朝向 +x 的机兵；o: {wheel, spin, tank, charge, gspin, rolling, moveA, alpha, flash, scale}
  function drawBot(c, x, y, a, color, head, weapon, o = {}) {
    c.save();
    c.translate(x, y);
    if (o.scale) c.scale(o.scale, o.scale);
    c.globalAlpha = o.alpha == null ? 1 : o.alpha;
    if (o.wheel) {
      c.fillStyle = 'rgba(0,0,0,.3)'; c.beginPath(); c.ellipse(2, 4, 14, 12, 0, 0, 7); c.fill();
      c.rotate(o.moveA || 0);
      c.fillStyle = '#1b1c26'; c.beginPath(); c.arc(0, 0, 13, 0, 7); c.fill();
      c.strokeStyle = color; c.lineWidth = 4; c.beginPath(); c.arc(0, 0, 10.5, 0, 7); c.stroke();
      c.strokeStyle = shade(color, 0.4); c.lineWidth = 2;
      for (let i = 0; i < 4; i++) { const sa = (o.spin || 0) + (i * Math.PI) / 2; c.beginPath(); c.moveTo(Math.cos(sa) * 3, Math.sin(sa) * 3); c.lineTo(Math.cos(sa) * 9, Math.sin(sa) * 9); c.stroke(); }
      c.fillStyle = '#fff'; c.beginPath(); c.arc(0, 0, 2.5, 0, 7); c.fill();
      c.restore();
      return;
    }
    c.fillStyle = 'rgba(0,0,0,.28)'; c.beginPath(); c.ellipse(2, 5, 18, 16, 0, 0, 7); c.fill();
    c.rotate(o.rolling ? o.moveA || a : a);
    // 履带
    c.fillStyle = '#15161e'; rr(c, -14, -18, 27, 7, 3); c.fill(); rr(c, -14, 11, 27, 7, 3); c.fill();
    c.strokeStyle = '#2e3040'; c.lineWidth = 1.5;
    const tp = ((o.spin || 0) * 3) % 5;
    for (let i = -13 + tp; i < 12; i += 5) { c.beginPath(); c.moveTo(i, -17); c.lineTo(i, -12); c.moveTo(i, 12); c.lineTo(i, 17); c.stroke(); }
    // 背后涂料罐
    c.fillStyle = '#20222c'; c.strokeStyle = '#101118'; c.lineWidth = 2; rr(c, -21, -8, 9, 16, 3); c.fill(); c.stroke();
    const tk = Math.max(0, Math.min(1, o.tank == null ? 1 : o.tank));
    c.fillStyle = color; if (tk > 0.02) { rr(c, -20, -7 + 14 * (1 - tk), 7, 14 * tk, 2); c.fill(); }
    drawWeapon(c, weapon, color, o);
    // 机身
    c.fillStyle = color; c.strokeStyle = '#101118'; c.lineWidth = 2.5; rr(c, -13, -12, 25, 24, 7); c.fill(); c.stroke();
    c.fillStyle = 'rgba(255,255,255,.2)'; rr(c, -10, -10, 11, 7, 3.5); c.fill();
    if (o.flash) { c.fillStyle = 'rgba(255,255,255,.65)'; rr(c, -13, -12, 25, 24, 7); c.fill(); }
    // 面罩
    c.fillStyle = '#14151d'; rr(c, 3, -9, 9, 18, 4); c.fill();
    c.fillStyle = '#c4fbff'; rr(c, 7, -6, 3, 12, 1.5); c.fill();
    drawHead(c, head, color);
    c.restore();
  }
  function drawBotIcon(canvas, weapon, head, color = '#ffdf2e') {
    const c = canvas.getContext('2d');
    c.clearRect(0, 0, canvas.width, canvas.height);
    drawBot(c, canvas.width * 0.42, canvas.height * 0.5, -0.45, color, head, weapon, { scale: canvas.width / 52 });
  }

  // ================= 界面 =================
  let ws = null, myId = 0, room = null, ping = 0, lanInfo = null;
  let wantRoom = (new URLSearchParams(location.search).get('room') || '').toUpperCase() || null;

  function showScreen(name) {
    $('title').classList.toggle('hidden', name !== 'title');
    $('room').classList.toggle('hidden', name !== 'room');
  }
  function setConn(text, cls) { const e = $('connStatus'); e.textContent = text; e.className = 'conn ' + (cls || ''); }

  function renderProfile() {
    const lv = level(), cur = S.xpForLevel(lv), next = S.xpForLevel(lv + 1);
    $('lvText').textContent = 'Lv.' + lv;
    $('xpText').textContent = `${profile.xp - cur} / ${next - cur} XP`;
    $('xpBar').style.width = ((profile.xp - cur) / (next - cur)) * 100 + '%';
    $('statsText').innerHTML = `<span>对战 ${profile.matches}</span><span>胜利 ${profile.wins}</span><span>击倒 ${profile.kills}</span><span>涂地 ${profile.paint}</span>`;
    $('chipName').textContent = profile.name || '未命名机兵';
    const P = S.pilot(profile.pilot);
    $('chipBot').innerHTML = GP.portrait(P, { face: true });
    $('chipBot').style.setProperty('--ring', P.accent);
    $('heroPortrait').innerHTML = GP.portrait(P);
    const hp = $('heroPilot');
    hp.style.setProperty('--pc', P.accent);
    hp.innerHTML = `<b>${P.name}<small>「${P.code}」${P.title}</small></b><i>“${P.line}”</i>`;
    $('stagePortrait').innerHTML = GP.portrait(P);
    $('garageStage').style.setProperty('--pc', P.accent);
    $('stageModes').style.setProperty('--pc', P.accent);
    mountPreview();
  }
  // 3D 展示台跟着当前打开的面板走：整备界面是大展示台，主界面是小圆窗
  function mountPreview() {
    const P = S.pilot(profile.pilot);
    const garage = !$('panel-garage').classList.contains('hidden');
    if (R3.preview(garage ? $('garageStage') : $('preview'), { color: P.accent, head: profile.head, weapon: profile.weapon, pilot: P.id }, garage)) PV_OK = true;
  }
  let PV_OK = false;
  // ---------------- 驾驶员选择 ----------------
  function renderPilots() {
    const box = $('pilotList');
    box.innerHTML = '';
    for (const P of S.PILOTS) {
      const el = document.createElement('button');
      el.className = 'pcard' + (profile.pilot === P.id ? ' sel' : '');
      el.style.setProperty('--pc', P.accent);
      el.innerHTML = GP.portrait(P) + `<div class="pname"><small>「${P.code}」</small><b>${P.name}</b></div>`;
      el.onclick = () => { profile.pilot = P.id; saveProfile(); sendLoadout(); renderPilots(); renderProfile(); sfx.click(); };
      box.appendChild(el);
    }
    const P = S.pilot(profile.pilot), d = $('pilotDetail');
    d.style.setProperty('--pc', P.accent);
    const rec = S.WEAPONS[P.weapon];
    d.innerHTML = `<h3>${P.name}<small>「${P.code}」</small></h3><div class="ttl">${P.title}</div>
      <blockquote>“${P.line}”</blockquote><p>${P.bio}</p>
      <p>擅长武器：<b style="color:#fff">${rec.name}</b></p>
      ${profile.weapon === P.weapon ? '<small style="color:#7dff9a">✓ 已装备擅长武器</small>' : `<button class="btn small" id="recWpn">装备「${rec.name}」</button>`}`;
    const b = $('recWpn');
    if (b) b.onclick = () => { profile.weapon = P.weapon; saveProfile(); sendLoadout(); renderWeaponLists(); renderPilots(); renderProfile(); sfx.click(); };
  }

  // ---------------- 设置 ----------------
  function renderSettings() {
    const c = AU.cfg, cur = AU.current();
    const html = `
      <div class="set-row"><span>音乐音量</span><input type="range" min="0" max="100" data-set="music" value="${Math.round(c.music * 100)}"><output>${Math.round(c.music * 100)}</output></div>
      <div class="set-row"><span>音效音量</span><input type="range" min="0" max="100" data-set="sfx" value="${Math.round(c.sfx * 100)}"><output>${Math.round(c.sfx * 100)}</output></div>
      <label class="set-row toggle"><span>全部静音（快捷键 M）</span><input type="checkbox" data-set="muted" ${c.muted ? 'checked' : ''}></label>
      <div class="set-row"><span>鼠标灵敏度</span><input type="range" min="20" max="300" data-set="sens" value="${Math.round(sens * 100)}"><output>${Math.round(sens * 100)}</output></div>
      <label class="set-row toggle"><span>屏幕震动</span><input type="checkbox" data-set="shake" ${shakeOn ? 'checked' : ''}></label>
      <label class="set-row toggle"><span>高画质（阴影 + 卡通描边，卡顿时可关闭）</span><input type="checkbox" data-set="hq" ${hqOn ? 'checked' : ''}></label>
      <div><div class="set-note" style="margin-bottom:6px">原创曲目试听：</div><div class="jukebox">${Object.entries(AU.TRACK_NAMES).map(([k, n]) => `<button data-track="${k}" class="${cur === k ? 'sel' : ''}">♪ ${n}</button>`).join('')}</div></div>
      <div class="set-note">所有音乐和音效都由浏览器实时合成，均为原创。主界面播放「霓虹喷漆街」，对战中播放「涂装突击」，最后 30 秒切换为「倒数冲刺」。</div>`;
    for (const box of document.querySelectorAll('.settings-box')) {
      box.innerHTML = html;
      for (const r of box.querySelectorAll('input[type=range]')) {
        r.oninput = () => {
          const v = r.value / 100;
          r.nextElementSibling.textContent = r.value;
          if (r.dataset.set === 'music') AU.setMusic(v); else if (r.dataset.set === 'sens') { sens = v; store.set('sens', v); } else { AU.setSfx(v); sfx.pick(); }
        };
        r.onchange = () => renderSettings();
      }
      for (const cb of box.querySelectorAll('input[type=checkbox]')) {
        cb.onchange = () => {
          if (cb.dataset.set === 'muted') AU.setMuted(cb.checked);
          else if (cb.dataset.set === 'hq') { hqOn = cb.checked; store.set('hq', hqOn); R3.setQuality(hqOn); }
          else { shakeOn = cb.checked; store.set('shake', shakeOn); }
          renderSettings();
        };
      }
      for (const btn of box.querySelectorAll('[data-track]')) btn.onclick = () => { AU.resume(); AU.music(btn.dataset.track); setTimeout(renderSettings, 50); updateNowPlaying(); };
    }
  }
  function updateNowPlaying() {
    const n = AU.current();
    $('nowPlaying').textContent = AU.ctx && AU.ctx.state === 'running' ? (n ? `♪ 正在播放：${AU.TRACK_NAMES[n]}` : '♪') : '♪ 点击任意位置开启音乐';
  }
  function openSettings() { renderSettings(); $('dlgClose').textContent = G && !G.over ? '继续对战' : '关闭'; $('settingsDlg').classList.remove('hidden'); }
  function closeSettings() { $('settingsDlg').classList.add('hidden'); if (G && !G.over) lockPointer(); }
  function menuMusic() { if (!G) AU.music('menu'); setTimeout(updateNowPlaying, 100); }
  function renderWeaponLists() {
    for (const [id, compact] of [['weaponList', false], ['roomWeaponList', true]]) {
      const box = $(id);
      box.innerHTML = '';
      for (const wid of S.WEAPON_ORDER) {
        const w = S.WEAPONS[wid];
        const el = document.createElement('button');
        el.className = 'wcard' + (profile.weapon === wid ? ' sel' : '');
        el.innerHTML = `<canvas width="112" height="112"></canvas><div><b>${w.name}</b>${compact ? '' : `<p>${w.desc}</p>`}<small>大招：${S.SPECIALS[w.special].name}${compact ? '' : ' — ' + S.SPECIALS[w.special].desc}</small></div>`;
        drawBotIcon(el.querySelector('canvas'), wid, profile.head);
        el.onclick = () => { profile.weapon = wid; saveProfile(); sendLoadout(); renderWeaponLists(); renderPilots(); renderProfile(); sfx.click(); };
        box.appendChild(el);
      }
    }
  }
  function renderHeads() {
    const box = $('headList');
    box.innerHTML = '';
    const lv = level();
    for (const h of S.HEADS) {
      const el = document.createElement('button');
      const locked = lv < h.lv;
      el.className = 'hchip' + (profile.head === h.id ? ' sel' : '') + (locked ? ' locked' : '');
      el.textContent = locked ? `🔒 ${h.name} Lv.${h.lv}` : h.name;
      el.onclick = () => {
        if (locked) return toast(`达到 Lv.${h.lv} 解锁「${h.name}」`);
        profile.head = h.id; saveProfile(); sendLoadout(); renderHeads(); renderWeaponLists(); renderProfile(); sfx.click();
      };
      box.appendChild(el);
    }
  }
  function ensureName() {
    if (!profile.name.trim()) {
      profile.name = '机兵' + Math.floor(100 + Math.random() * 900);
      $('nameInput').value = profile.name; saveProfile(); sendHello();
    }
  }
  function joinByInput() {
    const code = $('codeInput').value.trim().toUpperCase();
    if (code.length !== 4) return toast('请输入 4 位房间码');
    ensureName();
    if (FILE_MODE) joinP2P(code); else send({ t: 'join', code });
  }

  const mapPreviewCache = new Map();
  function drawMapPreview(canvas, idx) {
    const c = canvas.getContext('2d');
    canvas.width = S.GW * 2; canvas.height = S.GH * 2;
    c.fillStyle = '#2a2d3b'; c.fillRect(0, 0, canvas.width, canvas.height);
    if (idx < 0) {
      c.fillStyle = '#ffdf2e'; c.font = 'bold 70px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText('?', canvas.width / 2, canvas.height / 2 + 4);
      return;
    }
    let rects = mapPreviewCache.get(idx);
    if (!rects) { rects = S.buildMap(idx).rects.slice().sort((a, b) => a[4] - b[4]); mapPreviewCache.set(idx, rects); }
    const lvCol = [null, '#4d5578', '#6a74a3', '#9aa0c0'];
    for (const [x, y, w, h, lv] of rects) { c.fillStyle = lvCol[lv]; c.fillRect(x * 2, y * 2, w * 2, h * 2); }
    const cs = room ? S.COLOR_SETS[room.colorSet].c : S.COLOR_SETS[0].c;
    for (const t of [1, 2]) { const b = S.basePos(t); c.fillStyle = cs[t]; c.beginPath(); c.arc((b.x / S.CELL) * 2, (b.y / S.CELL) * 2, 10, 0, 7); c.fill(); }
  }

  function inviteBase() {
    const h = location.hostname;
    if ((h === 'localhost' || h === '127.0.0.1' || h === '[::1]') && lanInfo && lanInfo.lan.length) return `http://${lanInfo.lan[0]}:${location.port || lanInfo.port}`;
    return location.origin;
  }

  function renderRoom() {
    if (!room) return;
    const cs = S.COLOR_SETS[room.colorSet].c;
    const isHost = room.hostId === myId;
    const meP = room.players.find((p) => p.id === myId);
    $('roomCode').textContent = room.code;
    $('inviteLink').value = FILE_MODE ? room.code : `${inviteBase()}/?room=${room.code}`;
    if (FILE_MODE) {
      const host = net && net.kind === 'local';
      $('lanHint').textContent = host ? (p2pStatus.text || '正在开放联机…') : '你已通过 P2P 加入此房间。';
      $('lanHint').style.color = host && p2pStatus.cls === 'bad' ? '#ff7a8a' : host && p2pStatus.cls === 'ok' ? '#7dff9a' : '';
    } else $('lanHint').textContent = lanInfo && lanInfo.lan.length
      ? '同一 WiFi / 局域网的朋友打开此链接即可加入；跨网络联机请看 README 里的说明。'
      : '把链接发给朋友即可加入。';
    for (const t of [1, 2]) {
      const el = $('team' + t);
      el.querySelector('.sw').style.background = cs[t];
      el.querySelector('h3 span').textContent = `${S.TEAM_NAMES[t]}`;
      el.style.borderColor = rgba(cs[t], 0.7);
      const ul = el.querySelector('ul');
      ul.innerHTML = '';
      const ps = room.players.filter((p) => p.team === t);
      for (const p of ps) {
        const li = document.createElement('li');
        li.innerHTML = `<div class="avatar"></div><span class="nm">${esc(p.name)}</span><span class="tag">Lv.${p.level || 1} ${S.WEAPONS[p.weapon].name}</span>${p.id === room.hostId ? '<span class="tag host">房主</span>' : ''}${p.id === myId ? '<span class="tag me">你</span>' : ''}`;
        li.querySelector('.avatar').innerHTML = GP.portrait(S.pilot(p.pilot), { face: true });
        li.querySelector('.avatar').style.setProperty('--ring', cs[t]);
        ul.appendChild(li);
      }
      if (room.settings.bots) {
        for (let i = ps.length; i < room.settings.teamSize; i++) {
          const li = document.createElement('li');
          li.className = 'bot';
          li.innerHTML = `<span class="nm">AI 机兵</span><span class="tag">补位</span>`;
          ul.appendChild(li);
        }
      }
      const btn = el.querySelector('button');
      btn.textContent = `加入 ${S.TEAM_NAMES[t]}`;
      btn.disabled = !meP || meP.team === t || ps.length >= S.MAX_PER_TEAM || room.state !== 'lobby';
    }
    // 模式
    const ml = $('modeList');
    ml.innerHTML = '';
    for (const id of S.MODE_ORDER) {
      const m = S.MODES[id];
      const el = document.createElement('button');
      el.className = 'mcard' + (room.settings.mode === id ? ' sel' : '');
      el.innerHTML = `<b>${m.name}</b>${m.original ? '<span class="orig">原创</span>' : ''}<p>${m.desc}</p>`;
      el.onclick = () => { if (isHost) { send({ t: 'settings', mode: id }); sfx.click(); } };
      ml.appendChild(el);
    }
    const mp = $('mapList');
    mp.innerHTML = '';
    for (let i = -1; i < S.MAPS.length; i++) {
      const el = document.createElement('button');
      el.className = 'mapcard' + (room.settings.map === i ? ' sel' : '');
      el.innerHTML = `<canvas></canvas>${i < 0 ? '随机地图' : S.MAPS[i].name}`;
      el.title = i < 0 ? '每局随机选择' : S.MAPS[i].desc;
      drawMapPreview(el.querySelector('canvas'), i);
      el.onclick = () => { if (isHost) { send({ t: 'settings', map: i }); sfx.click(); } };
      mp.appendChild(el);
    }
    $('durSel').value = String(room.settings.duration);
    $('sizeSel').value = String(room.settings.teamSize);
    $('botChk').checked = room.settings.bots;
    for (const id of ['durSel', 'sizeSel', 'botChk']) $(id).disabled = !isHost;
    document.querySelector('.settings').classList.toggle('readonly', !isHost);
    $('startBtn').classList.toggle('hidden', !isHost);
    $('startBtn').disabled = room.state !== 'lobby';
    $('waitText').textContent = room.state === 'playing' ? '比赛进行中，下一局开始时你就能加入…' : isHost ? '你是房主：选好模式和地图后开始对战' : '等待房主开始对战…';
  }

  function bindUI() {
    $('nameInput').value = profile.name;
    $('nameInput').addEventListener('input', (e) => { profile.name = e.target.value.slice(0, 12); saveProfile(); $('chipName').textContent = profile.name || '未命名机兵'; });
    $('nameInput').addEventListener('change', () => sendLoadout());
    $('createBtn').onclick = () => {
      ensureName();
      if (net && net.kind === 'peer') { backToLocal(); setTimeout(() => send({ t: 'create' }), 50); } else send({ t: 'create' });
    };
    $('joinBtn').onclick = joinByInput;
    $('codeInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') joinByInput(); });
    if (wantRoom) $('codeInput').value = wantRoom;
    $('leaveBtn').onclick = () => send({ t: 'leave' });
    $('copyBtn').onclick = async () => {
      const v = $('inviteLink').value;
      try { await navigator.clipboard.writeText(v); toast(FILE_MODE ? '房间码已复制' : '邀请链接已复制'); }
      catch (e) { $('inviteLink').select(); toast('请手动复制链接'); }
    };
    for (const b of document.querySelectorAll('.team button')) b.onclick = () => send({ t: 'team', team: +b.dataset.team });
    $('durSel').onchange = (e) => send({ t: 'settings', duration: +e.target.value });
    $('sizeSel').onchange = (e) => send({ t: 'settings', teamSize: +e.target.value });
    $('botChk').onchange = (e) => send({ t: 'settings', bots: e.target.checked });
    $('startBtn').onclick = () => send({ t: 'start' });
    $('resBack').onclick = () => { $('results').classList.add('hidden'); R3.clear(); if (room) { showScreen('room'); renderRoom(); } else showScreen('title'); };
    // 主界面导航
    for (const btn of document.querySelectorAll('.mbtn')) {
      btn.onclick = () => {
        for (const x of document.querySelectorAll('.mbtn')) x.classList.toggle('sel', x === btn);
        for (const pnl of document.querySelectorAll('.mpanel')) pnl.classList.toggle('hidden', pnl.id !== 'panel-' + btn.dataset.panel);
        mountPreview();
        if (btn.dataset.panel === 'settings') renderSettings();
        sfx.click();
      };
    }
    $('guideModes').innerHTML = S.MODE_ORDER.map((id) => { const m = S.MODES[id]; return `<div class="mcard"><b>${m.name}</b>${m.original ? '<span class="orig">原创</span>' : ''}<p>${m.desc}</p></div>`; }).join('');
    $('roomSetBtn').onclick = openSettings;
    $('dlgClose').onclick = closeSettings;
    $('settingsDlg').addEventListener('click', (e) => { if (e.target.id === 'settingsDlg') closeSettings(); });
    let lastHover = null;
    document.addEventListener('mouseover', (e) => {
      const t = e.target.closest ? e.target.closest('.btn, .mbtn, .wcard, .mcard, .mapcard, .hchip, .jukebox button') : null;
      if (t && t !== lastHover && !t.disabled) sfx.hover();
      lastHover = t;
    });
    addEventListener('keydown', (e) => {
      if (e.code !== 'Escape' || performance.now() - lastUnlock < 400) return;
      if ($('settingsDlg').classList.contains('hidden')) { if (G || room) openSettings(); } else closeSettings();
    });
    addEventListener('pointerdown', () => setTimeout(updateNowPlaying, 150));
    addEventListener('keydown', () => setTimeout(updateNowPlaying, 150));
    renderProfile(); renderWeaponLists(); renderHeads(); renderPilots(); renderSettings();
    for (const b of document.querySelectorAll('#stageModes button')) b.onclick = () => {
      for (const o of document.querySelectorAll('#stageModes button')) o.classList.toggle('sel', o === b);
      R3.previewMode(b.dataset.mode); sfx.click();
    };
    menuMusic();
    if (!FILE_MODE) fetch('/info').then((r) => r.json()).then((j) => { lanInfo = j; renderRoom(); }).catch(() => {});
    else $('copyBtn').textContent = '复制房间码';
  }

  // ================= 网络 =================
  // 三种传输：
  //   ws    —— 通过 node server.js 打开网页时，连接服务器
  //   local —— 直接双击 HTML 打开时，浏览器里运行内置服务器（单机 + 当 P2P 房主）
  //   peer  —— 输入房间码加入别人的 P2P 房间（WebRTC 直连房主）
  // 本地文件 / 单文件版 / 静态网页托管：用浏览器内置服务器 + P2P；连不上 Node 服务器时也会自动切换到这个模式
  let FILE_MODE = location.protocol === 'file:' || new URLSearchParams(location.search).has('p2p') || !!window.GB_SINGLE;
  let wsEverOpen = false;
  const PEER_PREFIX = 'graffibots-v1-';
  let net = null, localHub = null, peerHost = null, hostCode = null, p2pStatus = { text: '', cls: '' };
  const deliver = (str) => { let m; try { m = JSON.parse(str); } catch (e) { return; } onMsg(m); };
  const send = (o) => { if (net) net.send(o); };
  const sendHello = () => send({ t: 'hello', name: profile.name || '机兵', weapon: profile.weapon, head: profile.head, pilot: profile.pilot, level: level() });
  const sendLoadout = () => send({ t: 'loadout', name: profile.name || '机兵', weapon: profile.weapon, head: profile.head, pilot: profile.pilot, level: level() });
  setInterval(() => send({ t: 'ping', ts: performance.now() }), 2000);
  const NO_P2P = window.GB_ARTIFACT ? '网页版只能和 AI 对战；和朋友联机请用 ZIP 版' : 'P2P 组件未加载，只能和 AI 对战';
  const LOCAL_TEXT = () => (window.Peer ? '单机模式 ✓ 创建房间后，朋友可用房间码联机' : `单机模式 ✓（${NO_P2P}）`);

  function connect() { if (FILE_MODE) startLocal(); else connectWS(); }

  function connectWS() {
    setConn('正在连接服务器…', '');
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    ws = new WebSocket(`${proto}://${location.host}/ws`);
    net = { kind: 'ws', send: (o) => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(o)); } };
    ws.onopen = () => {
      wsEverOpen = true;
      setConn('已连接服务器 ✓', 'ok');
      sendHello();
      if (wantRoom) { send({ t: 'join', code: wantRoom }); wantRoom = null; }
    };
    ws.onmessage = (e) => deliver(e.data);
    ws.onclose = () => {
      if (!wsEverOpen) { FILE_MODE = true; ws = null; startLocal(); return; }   // 没有 Node 服务器（静态网页托管）
      setConn('与服务器断开，正在重连…', 'bad');
      if (room) { toast('与服务器断开连接，正在重连…'); wantRoom = room.code; }
      resetToTitle();
      setTimeout(connectWS, 2000);
    };
  }
  function resetToTitle() {
    room = null; G = null; R3.clear();
    $('results').classList.add('hidden');
    showScreen('title');
    menuMusic();
  }

  // ---------------- 本机内置服务器 ----------------
  function startLocal() {
    if (!localHub) localHub = new window.GBCore.Hub();
    const conn = {
      open: true, congested: false,
      send(o) { this.sendRaw(JSON.stringify(o)); },
      sendRaw(s) { if (this.open) Promise.resolve().then(() => { if (conn.open) deliver(s); }); },
    };
    const c = localHub.connect(conn);
    net = { kind: 'local', send: (o) => localHub.message(c, JSON.parse(JSON.stringify(o))), close: () => { conn.open = false; localHub.disconnect(c); } };
    setConn(LOCAL_TEXT(), 'ok');
    sendHello();
    if (wantRoom) { const code = wantRoom; wantRoom = null; setTimeout(() => joinP2P(code), 300); }
  }
  function setP2P(text, cls) { p2pStatus = { text, cls: cls || '' }; if (room) renderRoom(); }

  // 房主：把内置服务器开放给 P2P 连接
  function stopHost() { if (peerHost) { try { peerHost.destroy(); } catch (e) { /* ignore */ } } peerHost = null; hostCode = null; }
  function hostP2P(code) {
    if (!window.Peer) { setP2P(NO_P2P, 'bad'); return; }
    if (peerHost && hostCode === code) return;
    stopHost();
    hostCode = code;
    setP2P('正在开放联机（需要联网）…');
    const peer = new window.Peer(PEER_PREFIX + code, { debug: 0 });
    peerHost = peer;
    peer.on('open', () => { if (peerHost === peer) setP2P('联机已开放 ✓ 朋友打开游戏，在「加入房间」输入房间码即可', 'ok'); });
    peer.on('connection', (dc) => {
      dc.on('open', () => {
        const conn = {
          open: true,
          send(o) { this.sendRaw(JSON.stringify(o)); },
          sendRaw(s) { if (this.open && dc.open) { try { dc.send(s); } catch (e) { /* ignore */ } } },
          get congested() { return !!(dc.dataChannel && dc.dataChannel.bufferedAmount > 256 * 1024); },
        };
        const c = localHub.connect(conn);
        dc.on('data', (d) => { let m; try { m = typeof d === 'string' ? JSON.parse(d) : d; } catch (e) { return; } localHub.message(c, m); });
        const bye = () => { if (!conn.open) return; conn.open = false; localHub.disconnect(c); };
        dc.on('close', bye); dc.on('error', bye);
      });
    });
    peer.on('error', (err) => {
      if (peerHost !== peer) return;
      if (err.type === 'unavailable-id') setP2P('房间码被占用，请离开后重新创建房间', 'bad');
      else if (['network', 'server-error', 'socket-error', 'socket-closed'].includes(err.type)) setP2P('连不上联机服务（请检查网络），仍可和 AI 对战', 'bad');
    });
    peer.on('disconnected', () => { if (peerHost === peer && !peer.destroyed) { try { peer.reconnect(); } catch (e) { /* ignore */ } } });
  }

  // 加入别人的 P2P 房间
  let joining = false;
  function joinP2P(code) {
    if (localHub && localHub.rooms.has(code) && net && net.kind === 'local') { send({ t: 'join', code }); return; }
    if (!window.Peer) { toast(NO_P2P); return; }
    if (joining) return;
    joining = true;
    setConn(`正在连接房间 ${code}…`, '');
    const peer = new window.Peer(PEER_PREFIX + 'p' + Math.random().toString(36).slice(2, 10), { debug: 0 });
    let done = false, closing = false;
    const fail = (msg) => {
      if (done) return;
      done = true; joining = false;
      try { peer.destroy(); } catch (e) { /* ignore */ }
      toast(msg, 4500);
      setConn(net && net.kind === 'local' ? LOCAL_TEXT() : '', 'ok');
    };
    const timer = setTimeout(() => fail(`连接房间 ${code} 超时（检查房间码和网络，房主需保持游戏页面打开）`), 15000);
    peer.on('open', () => {
      const dc = peer.connect(PEER_PREFIX + code, { serialization: 'raw', reliable: true });
      dc.on('open', () => {
        clearTimeout(timer);
        done = true; joining = false;
        if (net && net.close) net.close();
        stopHost();
        room = null;
        net = { kind: 'peer', send: (o) => { if (dc.open) dc.send(JSON.stringify(o)); }, close: () => { closing = true; try { dc.close(); peer.destroy(); } catch (e) { /* ignore */ } } };
        setConn(`已连接到房间 ${code} ✓（P2P）`, 'ok');
        sendHello();
        send({ t: 'join', code });
      });
      dc.on('data', (d) => deliver(typeof d === 'string' ? d : String(d)));
      dc.on('close', () => { if (!closing && net && net.kind === 'peer') { toast('与房主的连接断开了'); backToLocal(); } });
    });
    peer.on('error', (err) => {
      clearTimeout(timer);
      if (!done) fail(err.type === 'peer-unavailable' ? `找不到房间 ${code}（房主需要先创建房间并保持游戏页面打开）` : '连不上联机服务，请检查网络');
      else if (net && net.kind === 'peer' && !closing) { toast('与房主的连接断开了'); backToLocal(); }
    });
  }
  function backToLocal() {
    if (net && net.close) net.close();
    resetToTitle();
    startLocal();
  }

  function onMsg(m) {
    switch (m.t) {
      case 'welcome': myId = m.id; break;
      case 'joined':
        if (!FILE_MODE) { try { history.replaceState(null, '', '?room=' + m.code); } catch (e) { /* ignore */ } }
        if (net && net.kind === 'local') hostP2P(m.code);
        sfx.click(); break;
      case 'lobby':
        room = m.room;
        if (!G && $('results').classList.contains('hidden')) showScreen('room');
        renderRoom();
        break;
      case 'left':
        room = null;
        if (!FILE_MODE) { try { history.replaceState(null, '', location.pathname); } catch (e) { /* ignore */ } }
        showScreen('title');
        if (net && net.kind === 'peer') backToLocal(); else if (net && net.kind === 'local') stopHost();
        break;
      case 'err': toast(m.msg); break;
      case 'start': startGame(m); break;
      case 's': onSnap(m); break;
      case 'over':
        if (G) {
          G.over = true; G.overT = performance.now();
          AU.stopMusic(0.4);
          const myTeam = G.me ? G.me.team : 0;
          if (myTeam) (m.winner === myTeam ? sfx.win : sfx.lose)();
        }
        break;
      case 'end': showResults(m.result); break;
      case 'qc': if (G) G.chats.set(m.id, { k: m.k, t: performance.now() }); break;
      case 'pong': ping = Math.round(performance.now() - m.ts); break;
    }
  }

  // ================= 对局状态 =================
  const INTERP = 100;
  let G = null;
  const keys = new Set();
  const mouse = { x: innerWidth / 2, y: innerHeight / 2, down: false };
  const view = { yaw: 0, pitch: -0.12 };
  const R3 = window.GB3D;
  const SP_BEAM = S.SPECIAL_IDS.indexOf('beam');
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  let lastUnlock = 0, wasLocked = false;
  const locked = () => document.pointerLockElement === cv;
  function lockPointer() {
    if (TOUCH || !G || locked() || !cv.requestPointerLock) return;
    try { const r = cv.requestPointerLock(); if (r && r.catch) r.catch(() => {}); } catch (e) { /* ignore */ }
  }

  function startGame(m) {
    const M = S.buildMap(m.map);
    const colors = S.COLOR_SETS[m.colorSet].c;
    G = {
      map: m.map, mode: m.mode, colors, M, grid: new Uint8Array(S.GW * S.GH), duration: m.duration,
      players: new Map(), snaps: [], projs: new Map(), fx: [], texts: [], feed: [], bombs: new Map(), missiles: [],
      announce: null, big: null, tl: m.duration, cd: 3.5, over: false, overT: 0, obj: null, objA: null, offset: null,
      sendAcc: 0, sync: -1, sq: 0, qq: 0, edge: false, chats: new Map(), sb: new Map(), shake: 0,
      me: null, lastCount: 99, goT: 0, hitMark: 0, dmgFlash: 0, killer: null,
      cur: new Set(), turf: [0, 0], miniFrame: 0, startedAt: performance.now(), lastFrame: performance.now(), lw: false,
      prevTl: m.duration, wasAlive: null, spReady: null, cam: null, camZ: null, camD: null, camClose: false, aim: null,
    };
    for (const p of m.players) {
      G.players.set(p.id, { ...p, x: 0, y: 0, z: 0, a: 0, pt: 0, hp: 100, tank: 100, sp: 0, flags: 1, carry: 0, charge: 0, shield: 0, spk: -1, vx: 0, vy: 0, flash: 0, resp: 0 });
    }
    G.me = G.players.get(myId) || null;
    if (G.me) Object.assign(G.me, { px: 0, py: 0, pz: 0, pvx: 0, pvy: 0, pvz: 0, onGround: true, sm: 1 });
    G.ps = null; G.camDip = 0; G.camDipV = 0;
    view.yaw = G.me && G.me.team === 2 ? Math.PI : 0; view.pitch = -0.12;
    G.shades = [null, 1, 2].map((t) => (t ? [0, 0.12, -0.12].map((k) => shade(colors[t], k)) : null));
    G.mini = document.createElement('canvas'); G.mini.width = S.GW; G.mini.height = S.GH;
    G.miniCtx = G.mini.getContext('2d'); G.miniImg = G.miniCtx.createImageData(S.GW, S.GH);
    G.paintable = 0; for (let i = 0; i < M.solid.length; i++) if (!M.solid[i]) G.paintable++;
    R3.setQuality(hqOn);
    if (!R3.build(G)) toast('你的浏览器不支持 WebGL，无法显示 3D 画面。请换用新版 Chrome / Edge / Firefox。', 8000);
    keys.clear(); mouse.down = false;
    $('results').classList.add('hidden');
    closeSettings();
    showScreen('game');
    AU.music('battle');
    lockPointer();
    touchShow(true);
    showVs(m.players, colors);
  }
  // 开局对阵画面：两队驾驶员立绘滑入
  function showVs(players, colors) {
    const el = $('vsSplash');
    const myTeam = G.me ? G.me.team : 1;
    let html = '';
    for (const [cls, t] of [['a', myTeam], ['b', 3 - myTeam]]) {
      html += `<div class="side ${cls}" style="--tc:${rgba(colors[t], 0.85)}"><div class="tname" style="color:${colors[t]}">${teamName(t)}</div>`;
      players.filter((p) => p.team === t).forEach((p, i) => {
        html += `<div class="card${p.id === myId ? ' me' : ''}" style="animation-delay:${0.15 + i * 0.08}s">${GP.portrait(S.pilot(p.pilot))}<span>${esc(p.name)}</span></div>`;
      });
      html += `</div>`;
    }
    el.innerHTML = html + '<div class="vs">VS</div>';
    el.classList.remove('hidden');
    clearTimeout(showVs.h);
    showVs.h = setTimeout(() => el.classList.add('hidden'), 2800);
  }

  function paintCell(i, team) { R3.paintCell(i, team); }

  // ---------------- 快照 ----------------
  function onSnap(m) {
    if (!G) return;
    const now = performance.now(), st = (m.k * 1000) / S.TICK, off = now - st;
    if (G.offset === null || off < G.offset) G.offset = off; else G.offset += (off - G.offset) * 0.002;
    G.tl = m.tl; G.cd = m.cd;
    const pm = new Map();
    for (const a of m.p) pm.set(a[0], a);
    const mine = pm.get(myId);
    if (mine && G.me) applyMe(mine);
    for (const e of m.e) {
      if (e[0] === 'pj' && e[11] === myId) { addProj(e, true); sfx.shoot(); }
      else if (e[0] === 'px') { const pr = G.projs.get(e[1]); if (pr && pr.mine) killProj(pr, e[2], e[3], e[4]); }
      else if (e[0] === 'ln' && e[9] === myId) handleEvent(e);
      else if (e[0] === 'hit' && e[1] === myId && !e[3]) { G.dmgFlash = 0.35; sfx.hurt(); }
      else if (e[0] === 'bm' && e[9] === myId) { sfx.throw(); addBomb(e); }
      else if (e[0] === 'kb' && e[1] === myId && G.ps) {
        S.impulse(G.ps, e[2], e[3], e[4]);
        G.shake = Math.max(G.shake, Math.min(10, Math.hypot(e[2], e[3]) / 30));
      }
    }
    if (m.sb) for (const r of m.sb) G.sb.set(r[0], r);
    G.snaps.push({ t: st, pm, o: m.o, d: m.d, e: m.e, done: false });
    while (G.snaps.length > 120) { const s = G.snaps.shift(); if (!s.done) consume(s, true); }
  }
  function applyMe(a) {
    const me = G.me;
    me.hp = a[4]; me.tank = a[5]; me.sp = a[6]; me.flags = a[7]; me.resp = a[8] / 10; me.carry = a[9];
    me.sm = a[10] / 100; me.charge = a[11] / 100; me.shield = a[12]; me.spk = a[16];
    const alive = a[7] & 1;
    if (a[13] !== G.sync || !alive) {
      G.sync = a[13];
      me.px = a[1]; me.py = a[2]; me.pz = a[17] || 0; me.pvx = 0; me.pvy = 0; me.pvz = 0; me.onGround = true;
      G.ps = null;
    }
  }
  const OWNER_IDX = { pj: 11, ln: 9, bm: 9 };
  function consume(s, silent) {
    for (const v of s.d) { const idx = v >> 2, team = v & 3; G.grid[idx] = team; paintCell(idx, team); }
    for (const e of s.e) {
      const oi = OWNER_IDX[e[0]];
      if (oi && e[oi] === myId) continue;
      if (silent && e[0] === 'pj') continue;
      handleEvent(e, silent);
    }
  }
  const teamName = (t) => S.TEAM_NAMES[t];
  function announce(text, color, big) { G.announce = { text, color: color || '#fff', t: performance.now(), big: !!big }; }
  function bigText(text, color) { G.big = { text, color: color || '#ffdf2e', t: performance.now() }; }
  function nearMe(x, y, r) { const me = G.me; return me && Math.hypot(me.px - x, me.py - y) < r; }
  function handleEvent(e, silent) {
    const now = performance.now();
    switch (e[0]) {
      case 'pj': addProj(e, false); break;
      case 'px': { const pr = G.projs.get(e[1]); if (pr) { killProj(pr, e[2], e[3], e[4]); if (!silent && nearMe(e[2], e[3], 320)) sfx.splat(); } break; }
      case 'hit': {
        const t = G.players.get(e[1]);
        if (t) t.flash = 0.1;
        if (e[2] === myId && e[1] !== myId && !silent) { G.hitMark = 0.18; sfx.hit(); }
        break;
      }
      case 'kill': {
        const by = G.players.get(e[1]), v = G.players.get(e[2]);
        if (!v) break;
        R3.burst(e[3], e[4], (e[5] || 0) + 18, G.colors[by ? by.team : 3 - v.team], 45, 320);
        G.fx.push({ k: 'ring', x: e[3], y: e[4], z: e[5] || 0, r: 60, color: G.colors[by ? by.team : 3 - v.team], t0: now, dur: 450 });
        G.feed.unshift({ by, v, t: now }); if (G.feed.length > 5) G.feed.pop();
        if (silent) break;
        if (e[1] === myId && e[2] !== myId) { bigText(`击倒 ${v.name}！`); sfx.kill(); }
        if (e[2] === myId) { G.killer = by && by !== v ? by : null; sfx.die(); }
        if (nearMe(e[3], e[4], 500)) G.shake = Math.max(G.shake, 5);
        break;
      }
      case 'ln': {
        const col = G.colors[e[7]];
        G.fx.push({ k: 'line', x0: e[1], y0: e[2], z0: e[3], x1: e[4], y1: e[5], z1: e[6], color: col, w: 1.5 + 3 * e[8], t0: now, dur: 320 });
        R3.burst(e[4], e[5], e[6], col, 8, 140);
        if (!silent && (e[9] === myId || nearMe(e[1], e[2], 600))) sfx.snipe();
        break;
      }
      case 'bm': addBomb(e); break;
      case 'bx':
        if (e[6]) G.bombs.delete(e[6]);
        R3.burst(e[1], e[2], e[3] + 8, G.colors[e[4]], 50, 360);
        G.fx.push({ k: 'ring', x: e[1], y: e[2], z: e[3], r: e[5], color: G.colors[e[4]], t0: now, dur: 380 });
        if (!silent && nearMe(e[1], e[2], 700)) { sfx.boom(); G.shake = Math.max(G.shake, nearMe(e[1], e[2], 200) ? 9 : 5); }
        break;
      case 'ms': G.missiles.push({ x: e[1], y: e[2], z: e[3], team: e[4], t0: now, dur: 1500 }); break;
      case 'sp': {
        const p = G.players.get(e[1]);
        if (!p || silent) break;
        const sp = S.SPECIALS[e[2]];
        if (e[1] === myId) bigText(sp.name + '！', G.colors[p.team]);
        else if (G.me && p.team !== G.me.team) announce(`敌方 ${p.name} 发动了「${sp.name}」`, G.colors[p.team]);
        sfx.special();
        if (e[2] === 'storm' || e[2] === 'bubble') G.fx.push({ k: 'ring', x: p.x, y: p.y, z: p.z, r: e[2] === 'bubble' ? 170 : 260, color: G.colors[p.team], t0: now, dur: 600 });
        break;
      }
      case 'zn': if (!silent) { announce(e[1] ? `${teamName(e[1])} 占领了据点！` : '据点恢复中立', e[1] ? G.colors[e[1]] : '#fff', true); sfx.capture(); } break;
      case 'grab': { const p = G.players.get(e[1]); if (p && !silent) { announce(`${p.name} 夺得了宝物！`, G.colors[p.team]); sfx.pick(); } break; }
      case 'drop': if (!silent) announce('宝物掉落了！', '#ffd76b'); break;
      case 'trr': if (!silent) announce('宝物重新出现在中央', '#ffd76b'); break;
      case 'goal': if (!silent) { announce(`${teamName(e[1])} 得分！`, G.colors[e[1]], true); sfx.goal(); } break;
      case 'bp': if (e[1] === myId && !silent) sfx.pick(); break;
      case 'dep': {
        const p = G.players.get(e[1]);
        if (p) G.texts.push({ x: p.x, y: p.y, z: (p.z || 0) + 60, text: `+${e[2]} 电池`, color: G.colors[p.team], t: now });
        if (e[1] === myId && !silent) sfx.goal();
        break;
      }
    }
  }
  function addProj(e, mine) {
    G.projs.set(e[1], { id: e[1], x0: e[2], y0: e[3], z0: e[4], vx: e[5], vy: e[6], vz: e[7], ts: e[8], team: e[9], s: e[10], t0: performance.now(), mine, x: e[2], y: e[3], z: e[4] });
  }
  function killProj(pr, x, y, z) {
    G.projs.delete(pr.id);
    R3.burst(x == null ? pr.x : x, y == null ? pr.y : y, z == null ? pr.z : z, G.colors[pr.team], 5, 100);
  }
  function addBomb(e) {
    if (G.bombs.has(e[1])) return;
    G.bombs.set(e[1], { x: e[2], y: e[3], z: e[4], vx: e[5], vy: e[6], vz: e[7], team: e[8], landed: false, life: 0 });
  }

  // ================= 输入 =================
  addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
    if (!G) return;
    const k = e.code;
    if (k === 'Tab' || k === 'Space' || k.startsWith('Arrow')) e.preventDefault();
    if (e.repeat) return;
    keys.add(k);
    if (k === 'KeyE') { G.sq++; G.edge = true; }
    if (k === 'KeyQ') { G.qq++; G.edge = true; }
    if (k >= 'Digit1' && k <= 'Digit4') send({ t: 'chat', k: +k.slice(5) - 1 });
    if (k === 'KeyM') toggleMute();
  });
  addEventListener('keyup', (e) => keys.delete(e.code));
  addEventListener('blur', () => { keys.clear(); mouse.down = false; });
  addEventListener('mousemove', (e) => {
    mouse.x = e.clientX; mouse.y = e.clientY;
    if (G && locked()) {
      view.yaw += e.movementX * 0.0024 * sens;
      view.pitch = clamp(view.pitch - e.movementY * 0.0024 * sens, -1.25, 1.05);
    }
  });
  cv.addEventListener('mousedown', (e) => {
    if (!G) return;
    if (!locked()) { lockPointer(); return; }
    if (e.button === 0) mouse.down = true;
    if (e.button === 2) { G.sq++; G.edge = true; }
  });
  addEventListener('mouseup', (e) => { if (e.button === 0) mouse.down = false; });
  cv.addEventListener('contextmenu', (e) => e.preventDefault());
  document.addEventListener('pointerlockchange', () => {
    if (locked()) { wasLocked = true; return; }
    if (!wasLocked) return;
    wasLocked = false; mouse.down = false; lastUnlock = performance.now();
    if (G && !G.over && $('settingsDlg').classList.contains('hidden') && $('results').classList.contains('hidden')) openSettings();
  });

  // ================= 触屏操作 =================
  const TT = { on: false, sx: 0, sy: 0, fire: false, jump: false, wheel: false, ptr: new Map(), board: false };
  function setupTouch() {
    if (!TOUCH) return;
    const ui = $('touchUI'), stick = $('tStick'), knob = stick.querySelector('i');
    const R = 56;
    const goFull = () => {
      const de = document.documentElement;
      if (!document.fullscreenElement && de.requestFullscreen) {
        de.requestFullscreen({ navigationUI: 'hide' }).then(() => { try { screen.orientation.lock('landscape').catch(() => {}); } catch (e) { /* ignore */ } }).catch(() => {});
      }
    };
    const btnOf = (el) => el && el.closest && el.closest('[data-tb]');
    ui.addEventListener('pointerdown', (e) => {
      if (!G) return;
      e.preventDefault();
      AU.resume();
      if (store.get('fullscreen', true)) goFull();
      const b = btnOf(e.target);
      const rec = { x0: e.clientX, y0: e.clientY, lx: e.clientX, ly: e.clientY, kind: 'look' };
      if (b) {
        const k = b.dataset.tb;
        rec.kind = k; b.classList.add('on');
        rec.el = b;
        if (k === 'fire') TT.fire = true;
        else if (k === 'jump') TT.jump = true;
        else if (k === 'wheel') { TT.wheel = !TT.wheel; b.classList.toggle('lit', TT.wheel); }
        else if (k === 'bomb') { G.sq++; G.edge = true; }
        else if (k === 'sp') { G.qq++; G.edge = true; }
        else if (k === 'menu') openSettings();
        else if (k === 'board') TT.board = !TT.board;
        else if (k === 'chat') send({ t: 'chat', k: (TT.chatK = ((TT.chatK || 0) + 1) % 4) });
      } else if (e.clientX < innerWidth * 0.42) {
        rec.kind = 'stick';
        stick.style.left = e.clientX + 'px'; stick.style.top = e.clientY + 'px';
        stick.classList.add('show'); knob.style.transform = 'translate(-50%,-50%)';
      }
      TT.ptr.set(e.pointerId, rec);
      try { ui.setPointerCapture(e.pointerId); } catch (er) { /* ignore */ }
    }, { passive: false });
    ui.addEventListener('pointermove', (e) => {
      const rec = TT.ptr.get(e.pointerId);
      if (!rec || !G) return;
      e.preventDefault();
      if (rec.kind === 'stick') {
        let dx = e.clientX - rec.x0, dy = e.clientY - rec.y0;
        const l = Math.hypot(dx, dy);
        // 拖太远时摇杆底座跟着手指走
        if (l > R * 1.6) { rec.x0 += (dx / l) * (l - R * 1.6); rec.y0 += (dy / l) * (l - R * 1.6); stick.style.left = rec.x0 + 'px'; stick.style.top = rec.y0 + 'px'; dx = e.clientX - rec.x0; dy = e.clientY - rec.y0; }
        const k = Math.min(1, Math.hypot(dx, dy) / R), a = Math.atan2(dy, dx);
        TT.sx = Math.cos(a) * k; TT.sy = -Math.sin(a) * k;
        if (k < 0.12) { TT.sx = 0; TT.sy = 0; }
        knob.style.transform = `translate(calc(-50% + ${Math.cos(a) * k * R}px), calc(-50% + ${Math.sin(a) * k * R}px))`;
      } else if (rec.kind === 'look' || rec.kind === 'fire') {
        const dx = e.clientX - rec.lx, dy = e.clientY - rec.ly;
        view.yaw += dx * 0.0062 * sens;
        view.pitch = clamp(view.pitch - dy * 0.0052 * sens, -1.25, 1.05);
      }
      rec.lx = e.clientX; rec.ly = e.clientY;
    }, { passive: false });
    const end = (e) => {
      const rec = TT.ptr.get(e.pointerId);
      if (!rec) return;
      TT.ptr.delete(e.pointerId);
      if (rec.el) rec.el.classList.remove('on');
      if (rec.kind === 'stick') { TT.sx = 0; TT.sy = 0; stick.classList.remove('show'); }
      else if (rec.kind === 'fire') TT.fire = false;
      else if (rec.kind === 'jump') TT.jump = false;
    };
    ui.addEventListener('pointerup', end); ui.addEventListener('pointercancel', end);
    ui.addEventListener('contextmenu', (e) => e.preventDefault());
  }
  function touchShow(on) {
    if (!TOUCH) return;
    TT.on = on;
    $('touchUI').classList.toggle('hidden', !on);
    document.body.classList.toggle('ingame', on);
    if (!on) { TT.fire = TT.jump = TT.wheel = false; TT.sx = TT.sy = 0; TT.ptr.clear(); $('tWheel').classList.remove('lit'); }
  }
  // 触屏辅助瞄准：开火时准星会被附近的敌人轻轻吸过去
  function aimAssist(dt) {
    const me = G.me;
    if (!TT.on || !TT.fire || !me || !G.cam) return;
    let best = null, bd = 0.16;
    for (const id of G.cur) {
      const p = G.players.get(id);
      if (!p || !(p.flags & 1) || p.team === me.team || p.flags & 4) continue;
      const dx = p.x - me.px, dy = p.y - me.py, d = Math.hypot(dx, dy);
      if (d > S.weaponRange(me.weapon) * 1.1 || d < 20) continue;
      const da = Math.atan2(Math.sin(Math.atan2(dy, dx) - view.yaw), Math.cos(Math.atan2(dy, dx) - view.yaw));
      if (Math.abs(da) < bd) { bd = Math.abs(da); best = da; }
    }
    if (best != null) view.yaw += best * Math.min(1, dt * 3.2);
  }
  function updateTouchHud() {
    if (!TT.on || !G.me) return;
    const me = G.me, W = S.WEAPONS[me.weapon];
    const spk = Math.min(1, me.sp / W.spNeed);
    const sp = $('tSp');
    sp.style.setProperty('--p', spk);
    sp.classList.toggle('lit', spk >= 1);
    $('tBomb').classList.toggle('dim', me.tank < S.SUB_COST);
    if (TT.wheel && TT.fire) $('tWheel').classList.remove('lit');
    if (TT.fire) TT.wheel = false;
  }

  function readInput() {
    let f = 0, r = 0;
    if (keys.has('KeyW')) f += 1;
    if (keys.has('KeyS')) f -= 1;
    if (keys.has('KeyD')) r += 1;
    if (keys.has('KeyA')) r -= 1;
    const c = Math.cos(view.yaw), s = Math.sin(view.yaw);
    let mx = c * f - s * r, my = s * f + c * r;
    const l = Math.hypot(mx, my);
    if (l > 1) { mx /= l; my /= l; }
    if (TT.on && (TT.sx || TT.sy)) {
      // 摇杆是模拟量：轻推慢走
      mx = c * TT.sy - s * TT.sx; my = s * TT.sy + c * TT.sx;
    }
    const me = G.me;
    let w = keys.has('ShiftLeft') || keys.has('ShiftRight') || (TT.on && TT.wheel && !TT.fire);
    if (me && me.spk === SP_BEAM && me.flags & 128) w = false;
    const aim = G.aim || { a: view.yaw, pt: view.pitch };
    const jump = keys.has('Space') || (TT.on && TT.jump);
    return { mx, my, w, f: (mouse.down || (TT.on && TT.fire)) && !w, j: jump, jh: jump, a: aim.a, pt: aim.pt };
  }

  // ---------------- 第三人称摄像机 + 准星瞄准 ----------------
  // 摄像机碰撞：场地外一圈是 30 高的天台护栏，再往外是空地
  function camTop(x, y) {
    if (x >= 0 && y >= 0 && x < S.W && y < S.H) return S.topAt(G.M, x, y);
    return x > -40 && y > -40 && x < S.W + 40 && y < S.H + 40 ? 54 : -50;
  }
  function camRay(x, y, z, dx, dy, dz, max, step = 4) {
    for (let t = 0; t < max; t += step) if (z + dz * t < camTop(x + dx * t, y + dy * t)) return t;
    return max;
  }
  function updateCamera(dt) {
    const me = G.me;
    let fx, fy, fz;
    if (me) { fx = me.px; fy = me.py; fz = me.pz; }
    else {
      const p = G.players.get([...G.cur][0]);
      if (!p) return;
      fx = p.x; fy = p.y; fz = p.z || 0;
    }
    G.camZ = G.camZ == null || Math.abs(G.camZ - fz) > 120 ? fz : G.camZ + (fz - G.camZ) * Math.min(1, dt * 14);
    // 镜头弹簧（落地下沉）
    G.camDipV += (-180 * G.camDip - 16 * G.camDipV) * Math.min(dt, 0.05);
    G.camDip = Math.max(-18, Math.min(8, G.camDip + G.camDipV * Math.min(dt, 0.05)));
    const d = S.dir3(view.yaw, view.pitch);
    const rx = -Math.sin(view.yaw), ry = Math.cos(view.yaw);
    const wheel = G.inp && G.inp.w && me && me.flags & 1;
    const tx = fx + rx * 24, ty = fy + ry * 24, tz = G.camZ + (wheel ? 38 : 52) + G.camDip;
    const want = 138;
    const hit = camRay(tx, ty, tz, -d.x, -d.y, -d.z, want + 12);
    const dist = Math.max(10, Math.min(want, hit - 12));
    G.camD = G.camD == null || dist < G.camD ? dist : G.camD + (dist - G.camD) * Math.min(1, dt * 5);
    let cx = tx - d.x * G.camD, cy = ty - d.y * G.camD;
    const cz = Math.max(camTop(cx, cy) + 4, tz - d.z * G.camD);
    const sk = shakeOn ? G.shake : 0;
    const spdN = me ? Math.min(1, Math.hypot(me.pvx || 0, me.pvy || 0) / 330) : 0;
    G.fovK = (G.fovK || 0) + (spdN - (G.fovK || 0)) * Math.min(1, dt * 4);
    const zoom = me && me.weapon === 'charger' && me.charge > 0 ? 72 - 20 * me.charge : 72 + 7 * G.fovK;
    G.cam = { x: cx, y: cy, z: cz, d };
    G.camClose = G.camD < 42;
    R3.setCamera(cx + (Math.random() - 0.5) * sk, cy + (Math.random() - 0.5) * sk, cz + (Math.random() - 0.5) * sk,
      cx + d.x * 300, cy + d.y * 300, cz + d.z * 300, zoom);
    // 准星射线：先撞地形，再看是否擦过敌人
    let L = camRay(cx, cy, cz, d.x, d.y, d.z, 1800, 6);
    for (const id of G.cur) {
      const p = G.players.get(id);
      if (!p || !(p.flags & 1) || (me && p.team === me.team)) continue;
      const qx = p.x - cx, qy = p.y - cy, qz = (p.z || 0) + 18 - cz;
      const t = qx * d.x + qy * d.y + qz * d.z;
      if (t <= 0 || t >= L) continue;
      const px = qx - d.x * t, py = qy - d.y * t, pz = qz - d.z * t;
      if (px * px + py * py + pz * pz < 20 * 20) L = t;
    }
    const ax = cx + d.x * L, ay = cy + d.y * L, az = cz + d.z * L;
    if (me) {
      const mx = me.px, my = me.py, mz = me.pz + S.MUZZLE, hd = Math.hypot(ax - mx, ay - my);
      G.aim = hd < 30 ? { a: view.yaw, pt: view.pitch } : { a: Math.atan2(ay - my, ax - mx), pt: clamp(Math.atan2(az - mz, hd), -1.35, 1.35) };
    }
    G.aimPoint = { x: ax, y: ay, z: az, L };
  }

  // ================= 主循环 =================
  function loop(now) {
    requestAnimationFrame(loop);
    if (G) {
      const dt = Math.min(0.05, (now - G.lastFrame) / 1000);
      G.lastFrame = now;
      updateGame(now, dt);
      renderGame(now, dt);
    } else if (!$('title').classList.contains('hidden')) {
      menuBg(now);
      if (PV_OK) R3.previewFrame(now, Math.min(0.05, (now - (loop.last || now)) / 1000));
      loop.last = now;
    }
  }

  // ---------------- 主界面背景：机兵四处涂鸦 ----------------
  const MB = { bots: [], last: 0, paint: null };
  function menuBg(now) {
    const bg = $('menuBg');
    const w = innerWidth, h = innerHeight;
    if (!w || !h) return;
    if (bg.width !== w || bg.height !== h || !MB.paint) {
      bg.width = w; bg.height = h;
      MB.paint = document.createElement('canvas'); MB.paint.width = w; MB.paint.height = h;
      MB.bots = [];
      const cols = S.COLOR_SETS.flatMap((cs) => [cs.c[1], cs.c[2]]);
      for (let i = 0; i < 7; i++) {
        MB.bots.push({ x: Math.random() * w, y: Math.random() * h, a: Math.random() * 6.28, turn: 0, color: cols[i % cols.length],
          weapon: S.WEAPON_ORDER[i % 5], head: S.HEADS[i % S.HEADS.length].id, spin: 0, acc: 0, shot: 0, wheel: false, wt: 0 });
      }
      MB.last = now;
    }
    const dt = Math.min(0.05, (now - MB.last) / 1000); MB.last = now;
    const pc = MB.paint.getContext('2d'), c = bg.getContext('2d');
    pc.globalCompositeOperation = 'destination-out'; pc.fillStyle = 'rgba(0,0,0,0.006)'; pc.fillRect(0, 0, w, h);
    pc.globalCompositeOperation = 'source-over';
    for (const b of MB.bots) {
      b.turn += (Math.random() - 0.5) * dt * 6; b.turn *= 0.97;
      b.a += b.turn * dt * 2;
      b.wt -= dt; if (b.wt <= 0) { b.wheel = !b.wheel && Math.random() < 0.35; b.wt = 1 + Math.random() * 3; }
      const sp = b.wheel ? 230 : 95;
      b.x += Math.cos(b.a) * sp * dt; b.y += Math.sin(b.a) * sp * dt;
      if (b.x < -40) b.x = w + 40; if (b.x > w + 40) b.x = -40; if (b.y < -40) b.y = h + 40; if (b.y > h + 40) b.y = -40;
      b.spin += (sp * dt) / 10;
      b.acc += dt;
      if (b.acc > 0.05) {
        b.acc = 0;
        pc.fillStyle = b.color;
        pc.beginPath(); pc.arc(b.x - Math.cos(b.a) * 14 + (Math.random() - 0.5) * 10, b.y - Math.sin(b.a) * 14 + (Math.random() - 0.5) * 10, b.wheel ? 7 : 12 + Math.random() * 6, 0, 7); pc.fill();
      }
      b.shot -= dt;
      if (!b.wheel && b.shot <= 0) {
        b.shot = 0.4 + Math.random() * 1.2;
        const d = 80 + Math.random() * 160, sx = b.x + Math.cos(b.a) * d, sy = b.y + Math.sin(b.a) * d, r = 18 + Math.random() * 26;
        pc.fillStyle = b.color;
        pc.beginPath(); pc.arc(sx, sy, r, 0, 7); pc.fill();
        for (let k = 0; k < 6; k++) { const aa = Math.random() * 6.28, r2 = r * (0.8 + Math.random() * 0.9); pc.beginPath(); pc.arc(sx + Math.cos(aa) * r2, sy + Math.sin(aa) * r2, 3 + Math.random() * 7, 0, 7); pc.fill(); }
      }
    }
    c.clearRect(0, 0, w, h);
    c.globalAlpha = 0.5; c.drawImage(MB.paint, 0, 0); c.globalAlpha = 1;
    for (const b of MB.bots) drawBot(c, b.x, b.y, b.a, b.color, b.head, b.weapon, { wheel: b.wheel, spin: b.spin, moveA: b.a, scale: 1.4, alpha: 0.85, gspin: now / 50 });
    c.fillStyle = 'rgba(15,16,23,0.35)'; c.fillRect(0, 0, w, h);
  }

  function updateGame(now, dt) {
    const me = G.me;
    const turn = (keys.has('ArrowRight') ? 1 : 0) - (keys.has('ArrowLeft') ? 1 : 0);
    const tilt = (keys.has('ArrowUp') ? 1 : 0) - (keys.has('ArrowDown') ? 1 : 0);
    if (turn || tilt) { view.yaw += turn * 2.4 * dt * sens; view.pitch = clamp(view.pitch + tilt * 1.5 * dt * sens, -1.25, 1.05); }
    const inp = readInput();
    G.inp = inp;
    const alive = me && (me.flags & 1);
    if (me && alive && G.cd <= 0 && !G.over) {
      // 本地预测：完整物理状态（击退、土狼时间、跳跃缓冲）跨帧保留
      if (!G.ps) G.ps = { x: me.px, y: me.py, z: me.pz, vx: 0, vy: 0, vz: 0, onGround: true };
      const st = G.ps;
      st.team = me.team; st.sm = me.sm;
      const spk = me.flags & 128 ? S.SPECIAL_IDS[me.spk] : null;
      const wasGround = st.onGround;
      // 固定子步长，帧率高低手感一致
      let rem = Math.min(dt, 0.1), landV = 0, jumped = false;
      while (rem > 1e-5) {
        const h = Math.min(rem, 1 / 120);
        const g0 = st.onGround;
        S.stepMove(st, inp, h, G.grid, G.M, S.moveMul(me.weapon, inp.f, spk));
        if (g0 && !st.onGround && st.vz > 100) jumped = true;
        if (st.landV < landV) landV = st.landV;
        rem -= h;
      }
      if (jumped) sfx.jump();
      if (landV < -260) {
        sfx.land();
        const g = S.cellAt(G.grid, st.x, st.y);
        R3.burst(st.x, st.y, st.z + 2, g ? G.colors[g] : '#9aa0b8', Math.round(6 + Math.min(18, -landV / 50)), 90 + Math.min(160, -landV / 6), 0.4);
        G.camDipV -= Math.min(260, -landV * 0.35);     // 落地时镜头下沉再回弹
        if (landV < -700) G.shake = Math.max(G.shake, 5);
      }
      me.landT = landV < -200 && !wasGround ? now : me.landT;
      me.px = st.x; me.py = st.y; me.pz = st.z; me.pvx = st.vx + st.kx; me.pvy = st.vy + st.ky; me.pvz = st.vz; me.onGround = st.onGround;
    }
    updateCamera(dt);
    aimAssist(dt);
    updateTouchHud();
    G.inp = readInput();
    if (me && !G.over) {
      G.sendAcc += dt;
      if (G.sendAcc >= 1 / 30 || G.edge) {
        G.sendAcc = 0; G.edge = false;
        const r3 = (v) => Math.round(v * 1000) / 1000, r1 = (v) => Math.round(v * 10) / 10;
        send({ t: 'in', mx: r3(inp.mx), my: r3(inp.my), a: r3(G.inp.a), pt: r3(G.inp.pt), f: inp.f, w: inp.w, sq: G.sq, qq: G.qq,
          x: r1(me.px), y: r1(me.py), z: r1(me.pz), vx: Math.round(me.pvx), vy: Math.round(me.pvy), vz: Math.round(me.pvz), sync: G.sync });
      }
    }
    // 变形 / 复活 / 大招就绪 / 涂料不足
    const wNow = !!(inp.w && alive && G.cd <= 0);
    if (wNow !== G.lw) { (wNow ? sfx.morph : sfx.unmorph)(); G.lw = wNow; }
    if (me) {
      if (alive && G.wasAlive === false) { sfx.respawn(); view.yaw = me.team === 2 ? Math.PI : 0; view.pitch = -0.12; }
      G.wasAlive = !!alive;
      const ready = me.sp >= S.WEAPONS[me.weapon].spNeed;
      if (ready && G.spReady === false && alive) { sfx.ready(); bigText('大招就绪！按 Q 发动', '#fff36b'); }
      G.spReady = ready;
      if (alive && inp.f && me.tank < 8 && G.cd <= 0) sfx.lowInk();
    }
    // 时间提示与音乐
    if (G.cd <= 0 && !G.over) {
      const tl = G.tl;
      if (G.prevTl > 60 && tl <= 60) { announce('剩余 1 分钟！', '#ffdf2e', true); sfx.warn(); }
      if (G.prevTl > 30 && tl <= 30) { announce('最后 30 秒！', '#ff5a6a', true); sfx.warn(); }
      if (tl <= 10 && tl > 0 && Math.ceil(tl) !== Math.ceil(G.prevTl)) sfx.tick();
      if (tl <= 30) AU.music('final');
      G.prevTl = tl;
    }
    // 倒计时音效
    const n = Math.ceil(G.cd - 0.5);
    if (n !== G.lastCount) {
      if (n >= 1 && n <= 3) sfx.count();
      if (n <= 0 && G.lastCount >= 1) { sfx.go(); G.goT = now; }
      G.lastCount = n;
    }
    // 子弹、炸弹（本地按同一套弹道公式推算）
    for (const pr of G.projs.values()) {
      const t = (now - pr.t0) / 1000, q = S.projPos(pr, t);
      const gh = S.topAt(G.M, q.x, q.y);
      if (t > 3.2 || q.z < gh - 1) { killProj(pr, q.x, q.y, gh < 1e3 ? Math.max(gh, q.z) : q.z); continue; }
      pr.x = q.x; pr.y = q.y; pr.z = q.z;
    }
    for (const [id, b] of G.bombs) { S.stepBomb(b, dt, G.M); b.life += dt; if (b.life > 5) G.bombs.delete(id); }
    G.fx = G.fx.filter((f) => now - f.t0 < f.dur);
    G.missiles = G.missiles.filter((m) => now - m.t0 < m.dur);
    G.shake = Math.max(0, G.shake - dt * 30);
    G.hitMark = Math.max(0, G.hitMark - dt);
    G.dmgFlash = Math.max(0, G.dmgFlash - dt);
    for (const p of G.players.values()) p.flash = Math.max(0, p.flash - dt);
  }

  function interpolate(now) {
    const rt = now - (G.offset || 0) - INTERP;
    for (const s of G.snaps) if (!s.done && s.t <= rt) { s.done = true; consume(s, false); }
    while (G.snaps.length > 2 && G.snaps[1].t <= rt && G.snaps[0].done) G.snaps.shift();
    let a = null, b = null;
    for (const s of G.snaps) { if (s.t <= rt) a = s; else { b = s; break; } }
    if (!a) a = b; if (!b) b = a;
    if (!a) return false;
    const k = b.t > a.t ? Math.max(0, Math.min(1, (rt - a.t) / (b.t - a.t))) : 1;
    G.cur.clear();
    for (const [id, pb] of b.pm) {
      const p = G.players.get(id);
      if (!p) continue;
      G.cur.add(id);
      if (id === myId) {
        p.x = p.px; p.y = p.py; p.z = p.pz; p.vx = p.pvx; p.vy = p.pvy; p.vz = p.pvz;
        if (G.aim) { p.a = G.aim.a; p.pt = G.aim.pt; }
        continue;
      }
      let pa = a.pm.get(id) || pb;
      if (Math.hypot(pa[1] - pb[1], pa[2] - pb[2]) > 160 || (pa[7] & 1) !== (pb[7] & 1)) pa = pb;
      p.x = lerp(pa[1], pb[1], k); p.y = lerp(pa[2], pb[2], k); p.z = lerp(pa[17] || 0, pb[17] || 0, k);
      p.a = lerpAngle(pa[3], pb[3], k); p.pt = lerp(pa[18] || 0, pb[18] || 0, k);
      p.hp = pb[4]; p.tank = pb[5]; p.sp = pb[6]; p.flags = pb[7]; p.resp = pb[8] / 10; p.carry = pb[9];
      p.charge = pb[11] / 100; p.shield = pb[12]; p.vx = pb[14]; p.vy = pb[15]; p.spk = pb[16]; p.vz = pb[19] || 0;
    }
    G.obj = b.o; G.objA = a.o; G.objK = k;
    return true;
  }

  // ================= 渲染 =================
  function renderGame(now, dt) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, cv.width, cv.height);
    if (!interpolate(now)) {
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      ctx.fillStyle = '#0f1017'; ctx.fillRect(0, 0, VW, VH);
      ctx.fillStyle = '#fff'; ctx.font = 'bold 24px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('同步对局中…', VW / 2, VH / 2);
      return;
    }
    R3.render(G, now, dt, myId);
    drawHUD(now);
  }

  // 世界坐标 → 屏幕（屏幕外/身后时贴到屏幕边缘）
  function edgePoint(x, y, z, margin) {
    const p = R3.project(x, y, z);
    if (p && p.x > margin && p.x < VW - margin && p.y > margin && p.y < VH - margin) return { x: p.x, y: p.y, on: true };
    const c = G.cam;
    if (!c) return null;
    let ang = Math.atan2(y - c.y, x - c.x) - view.yaw;
    const sx = Math.sin(ang), fy = Math.cos(ang);
    const k = Math.min((VW / 2 - margin) / Math.max(0.001, Math.abs(sx)), (VH / 2 - margin) / Math.max(0.001, Math.abs(fy)));
    return { x: VW / 2 + sx * k, y: VH / 2 - fy * k, on: false };
  }
  function marker(x, y, z, label, color, icon) {
    const p = edgePoint(x, y, z, 46);
    if (!p) return;
    ctx.fillStyle = '#000a'; ctx.beginPath(); ctx.arc(p.x, p.y, 15, 0, 7); ctx.fill();
    ctx.strokeStyle = color; ctx.lineWidth = 3; ctx.stroke();
    txt(icon, p.x, p.y + 1, 15, color, 'center', 0);
    if (label) txt(label, p.x, p.y + 26, 12, color, 'center', 3);
  }
  function drawWorldLabels(now) {
    const me = G.me, c = G.cam;
    for (const id of G.cur) {
      if (id === myId) continue;
      const p = G.players.get(id);
      if (!p || !(p.flags & 1)) continue;
      const enemy = me && p.team !== me.team;
      if (enemy && p.flags & 4) continue;
      const d = c ? Math.hypot(p.x - c.x, p.y - c.y) : 0;
      const seen = c && S.los3(G.M, c.x, c.y, c.z, p.x, p.y, (p.z || 0) + 30);
      if (enemy && (!seen || d > 900)) continue;
      const s = R3.project(p.x, p.y, (p.z || 0) + 54);
      if (!s) continue;
      const col = G.colors[p.team];
      if (!enemy) txt(p.name, s.x, s.y, 12, col, 'center', 3);
      else {
        txt(p.name, s.x, s.y - 8, 12, col, 'center', 3);
        ctx.fillStyle = '#000a'; ctx.fillRect(s.x - 18, s.y + 2, 36, 5);
        ctx.fillStyle = col; ctx.fillRect(s.x - 18, s.y + 2, 36 * Math.max(0, p.hp) / 100, 5);
      }
      if (!enemy && !seen) { ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(s.x, s.y + 14, 4, 0, 7); ctx.stroke(); }
      const ch = G.chats.get(id);
      if (ch) {
        const age = now - ch.t;
        if (age > 2500) G.chats.delete(id);
        else txt(S.QUICK_CHAT[ch.k], s.x, s.y - 26, 15, '#fff', 'center', 4);
      }
    }
    const mc = G.chats.get(myId);
    if (mc) { if (now - mc.t > 2500) G.chats.delete(myId); else txt(`你：${S.QUICK_CHAT[mc.k]}`, VW / 2, VH * 0.62, 16, '#fff', 'center', 4); }
    G.texts = G.texts.filter((t) => now - t.t < 1400);
    for (const t of G.texts) {
      const s = R3.project(t.x, t.y, t.z + (now - t.t) / 25);
      if (s) { ctx.globalAlpha = 1 - (now - t.t) / 1400; txt(t.text, s.x, s.y, 16, t.color, 'center', 4); ctx.globalAlpha = 1; }
    }
    // 目标指示
    const o = G.obj, myTeam = me ? me.team : 1;
    if (!o) return;
    if (G.mode === 'escort' && !o[5]) {
      const carrier = o[2] ? G.players.get(o[2]) : null;
      if (carrier) marker(carrier.x, carrier.y, (carrier.z || 0) + 70, carrier.id === myId ? '' : carrier.team === myTeam ? '护送' : '拦截', G.colors[carrier.team], '◆');
      else marker(o[0], o[1], (o[6] || 0) + 40, '宝物', '#ffd23f', '◆');
      if (carrier && carrier.team === myTeam) { const g = S.goalFor(myTeam, G.map); marker(g.x, g.y, 60, '终点', G.colors[myTeam], '⚑'); }
    } else if (G.mode === 'soccer') marker(o[0], o[1], 70, '', '#fff', '●');
    else if (G.mode === 'zone') { const Z = S.ZONE, C = S.CELL; marker((Z.x0 + Z.x1) * C / 2, (Z.y0 + Z.y1) * C / 2, 40, o[0] ? '' : '据点', o[0] ? G.colors[o[0]] : '#fff', '▣'); }
    else if (G.mode === 'battery' && me && me.carry) { const b = S.basePos(myTeam); marker(b.x, b.y, 50, '充电站', G.colors[myTeam], '⚡'); }
  }
  // ================= HUD =================
  function txt(s, x, y, size, color, align = 'center', stroke = 4) {
    ctx.font = `900 ${size}px "Microsoft YaHei", sans-serif`; ctx.textAlign = align; ctx.textBaseline = 'middle';
    if (stroke) { ctx.lineWidth = stroke; ctx.strokeStyle = '#000'; ctx.lineJoin = 'round'; ctx.strokeText(s, x, y); }
    ctx.fillStyle = color; ctx.fillText(s, x, y);
  }
  function updateMini() {
    const d = G.miniImg.data, grid = G.grid, solid = G.M.solid, top = G.M.top;
    const c1 = hexRgb(G.colors[1]), c2 = hexRgb(G.colors[2]);
    let a = 0, b = 0;
    for (let i = 0; i < grid.length; i++) {
      let r, g, bl;
      if (solid[i]) { r = 90; g = 96; bl = 125; }
      else if (grid[i] === 1) { [r, g, bl] = c1; a++; }
      else if (grid[i] === 2) { [r, g, bl] = c2; b++; }
      else if (top[i] > 0) { r = top[i] > 50 ? 70 : 56; g = top[i] > 50 ? 76 : 61; bl = top[i] > 50 ? 104 : 84; }
      else { r = 36; g = 39; bl = 52; }
      d[i * 4] = r; d[i * 4 + 1] = g; d[i * 4 + 2] = bl; d[i * 4 + 3] = 255;
    }
    G.miniCtx.putImageData(G.miniImg, 0, 0);
    G.turf = [a / G.paintable, b / G.paintable];
  }

  function drawHUD(now) {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.textBaseline = 'middle';
    const me = G.me, alive = me && (me.flags & 1);
    const myTeam = me ? me.team : 1, otherTeam = 3 - myTeam;
    const small = VW < 820;

    // 受伤 / 踩敌方涂料
    if (me && alive) {
      const ground = me.onGround ? S.cellAt(G.grid, me.px, me.py) : 0;
      const onEnemy = ground && ground !== me.team;
      const v = Math.max(G.dmgFlash * 1.6, onEnemy ? 0.25 : 0, me.hp < 40 ? 0.3 : 0);
      if (v > 0) {
        const g = ctx.createRadialGradient(VW / 2, VH / 2, Math.min(VW, VH) * 0.35, VW / 2, VH / 2, Math.max(VW, VH) * 0.7);
        g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, rgba(onEnemy && G.dmgFlash <= 0 ? G.colors[otherTeam] : '#ff2040', Math.min(0.6, v)));
        ctx.fillStyle = g; ctx.fillRect(0, 0, VW, VH);
      }
    }

    drawWorldLabels(now);

    // ---- 顶部：计时与队伍 ----
    const cx = VW / 2;
    ctx.fillStyle = '#000b'; rr(ctx, cx - 62, 10, 124, 46, 14); ctx.fill();
    txt(fmtTime(G.tl), cx, 34, 30, G.tl <= 30 && G.tl > 0 ? (Math.floor(now / 400) % 2 ? '#ff5a6a' : '#fff') : '#fff', 'center', 0);
    const roster = (t) => [...G.players.values()].filter((p) => p.team === t && G.cur.has(p.id));
    const chips = (t, side) => {
      const list = roster(t);
      list.forEach((p, i) => {
        const x = side < 0 ? cx - 92 - i * 40 : cx + 92 + i * 40, y = 33;
        const aliveP = p.flags & 1, col = G.colors[t];
        ctx.fillStyle = aliveP ? col : '#333645';
        ctx.strokeStyle = p.id === myId ? '#fff' : '#000'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(x, y, 16, 0, 7); ctx.fill(); ctx.stroke();
        if (aliveP && p.flags & 256) { ctx.strokeStyle = '#fff36b'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y, 20 + Math.sin(now / 150) * 1.5, 0, 7); ctx.stroke(); }
        if (aliveP) txt(S.WEAPONS[p.weapon].name[0], x, y + 1, 14, '#111', 'center', 0);
        else txt(String(Math.ceil(p.resp)), x, y + 1, 15, '#fff', 'center', 3);
      });
    };
    chips(myTeam, -1); chips(otherTeam, 1);

    // ---- 模式面板 ----
    const o = G.obj;
    const py = 74;
    if (G.mode === 'turf') {
      if (G.miniFrame % 6 === 0) updateMini();
      if (G.tl <= 30 && G.tl > 0 && !G.over) {
        txt('？ 局势已隐藏 ？', cx, py, 16, '#ffdf2e', 'center', 4);
      } else {
        const w = 240, a = G.turf[myTeam - 1], b = G.turf[otherTeam - 1];
        ctx.fillStyle = '#000a'; rr(ctx, cx - w / 2 - 4, py - 10, w + 8, 20, 10); ctx.fill();
        ctx.fillStyle = G.colors[myTeam]; ctx.fillRect(cx - w / 2, py - 6, w * a, 12);
        ctx.fillStyle = G.colors[otherTeam]; ctx.fillRect(cx + w / 2 - w * b, py - 6, w * b, 12);
        txt(`${(a * 100).toFixed(0)}%`, cx - w / 2 - 12, py, 14, G.colors[myTeam], 'right', 3);
        txt(`${(b * 100).toFixed(0)}%`, cx + w / 2 + 12, py, 14, G.colors[otherTeam], 'left', 3);
      }
    } else if (o) {
      if (G.mode === 'zone') {
        const owner = o[0];
        const box = (t, x) => {
          const col = G.colors[t];
          ctx.fillStyle = owner === t ? col : '#000b'; rr(ctx, x - 44, py - 20, 88, 40, 12); ctx.fill();
          ctx.strokeStyle = col; ctx.lineWidth = 3; ctx.stroke();
          txt(String(o[t]), x, py + 1, 26, owner === t ? '#111' : col, 'center', 0);
        };
        box(myTeam, cx - 56); box(otherTeam, cx + 56);
        txt(owner ? '占领中' : '中立', cx, py + 34, 13, owner ? G.colors[owner] : '#bbb', 'center', 3);
      } else if (G.mode === 'escort' || G.mode === 'soccer') {
        const s = G.mode === 'escort' ? [0, o[3], o[4]] : [0, o[2], o[3]];
        const target = G.mode === 'escort' ? S.ESCORT_TARGET : S.SOCCER_TARGET;
        for (const [t, side] of [[myTeam, -1], [otherTeam, 1]]) {
          for (let i = 0; i < target; i++) {
            const x = cx + side * (30 + i * 22);
            ctx.fillStyle = i < s[t] ? G.colors[t] : '#000a'; ctx.strokeStyle = G.colors[t]; ctx.lineWidth = 2.5;
            ctx.beginPath(); ctx.arc(x, py, 8, 0, 7); ctx.fill(); ctx.stroke();
          }
        }
        txt(`${s[myTeam]} : ${s[otherTeam]}`, cx, py, 18, '#fff', 'center', 4);
      } else if (G.mode === 'battery') {
        const w = 150;
        for (const [t, side] of [[myTeam, -1], [otherTeam, 1]]) {
          const v = Math.min(1, o[t - 1] / S.BATTERY_TARGET), x = side < 0 ? cx - 12 - w : cx + 12;
          ctx.fillStyle = '#000a'; rr(ctx, x - 3, py - 11, w + 6, 22, 10); ctx.fill();
          ctx.fillStyle = G.colors[t];
          if (side < 0) ctx.fillRect(x + w * (1 - v), py - 7, w * v, 14); else ctx.fillRect(x, py - 7, w * v, 14);
          txt(`${o[t - 1]}`, side < 0 ? x - 10 : x + w + 10, py, 16, G.colors[t], side < 0 ? 'right' : 'left', 3);
        }
        txt('⚡', cx, py, 16, '#b8ff3a', 'center', 3);
      }
    }
    G.miniFrame++;
    if (G.mode !== 'turf' && G.miniFrame % 6 === 0) updateMini();

    // ---- 击杀信息 ----
    let fy = VW < 1000 ? 112 : 20;
    for (const f of G.feed) {
      const age = now - f.t;
      if (age > 5000) continue;
      ctx.globalAlpha = Math.min(1, (5000 - age) / 600);
      const right = VW - 14;
      ctx.font = '900 14px "Microsoft YaHei", sans-serif';
      const vName = f.v.name, bName = f.by && f.by !== f.v ? f.by.name : '';
      const wv = ctx.measureText(vName).width, wb = ctx.measureText(bName).width;
      const total = wv + wb + (bName ? 40 : 30);
      ctx.fillStyle = '#000a'; rr(ctx, right - total - 8, fy - 12, total + 8, 24, 8); ctx.fill();
      txt(vName, right - 4, fy, 14, G.colors[f.v.team], 'right', 0);
      txt('✖', right - wv - 16, fy, 13, '#fff', 'center', 0);
      if (bName) txt(bName, right - wv - 30, fy, 14, G.colors[f.by.team], 'right', 0);
      ctx.globalAlpha = 1;
      fy += 28;
    }

    // ---- 左上：延迟 / 提示 ----
    txt(`延迟 ${ping}ms`, 12, 16, 12, '#9a9db5', 'left', 0);
    if (now - G.startedAt < 16000 && !G.over) {
      ctx.globalAlpha = Math.min(1, (16000 - (now - G.startedAt)) / 1500);
      const lines = TOUCH
        ? ['左半屏：摇杆移动 · 右半屏：滑动转视角', '按住「开火」射击（按住时也能滑动瞄准）', '「滚轮」切换形态 · 💣 炸弹 · 大招充满后点击']
        : ['WASD 移动 · 鼠标转视角 · 左键开火 · 空格跳跃', 'Shift 变滚轮：己方涂料上加速、隐身、补涂料；滚轮跳得更高', '右键/E 炸弹 · Q 大招 · 1-4 快捷语音 · Tab 记分板 · Esc 暂停'];
      lines.forEach((l, i) => txt(l, 12, (TOUCH ? 190 : 230) + i * 20, 13, '#dfe1ee', 'left', 3));
      ctx.globalAlpha = 1;
    }

    // ---- 左下：状态 ----
    if (me) {
      // 触屏：状态栏放在左上角，给摇杆让出左下
      const bx = 18, by = TOUCH ? 158 : VH - 22;
      const W = S.WEAPONS[me.weapon];
      // 涂料罐
      const th = 110, tw = 30, tx0 = bx, ty0 = by - th;
      ctx.fillStyle = '#000b'; rr(ctx, tx0 - 4, ty0 - 4, tw + 8, th + 8, 12); ctx.fill();
      const tk = me.tank / 100;
      ctx.fillStyle = G.colors[me.team]; rr(ctx, tx0, ty0 + th * (1 - tk), tw, th * tk, 8); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,.5)'; ctx.lineWidth = 2;
      const subY = ty0 + th * (1 - S.SUB_COST / 100);
      ctx.beginPath(); ctx.moveTo(tx0 - 2, subY); ctx.lineTo(tx0 + tw + 2, subY); ctx.stroke();
      txt('涂料', tx0 + tw / 2, ty0 - 14, 12, '#ccc', 'center', 3);
      // 血量
      const hx = bx + tw + 18, hw = small ? 120 : 170;
      ctx.fillStyle = '#000b'; rr(ctx, hx - 4, by - 26, hw + 8, 30, 10); ctx.fill();
      ctx.fillStyle = me.hp > 40 ? '#7dff9a' : '#ff5a6a'; rr(ctx, hx, by - 22, (hw * Math.max(0, me.hp)) / 100, 22, 7); ctx.fill();
      if (me.shield > 0) { ctx.fillStyle = 'rgba(190,246,255,.7)'; rr(ctx, hx, by - 22, Math.min(hw, (hw * me.shield) / 100), 8, 4); ctx.fill(); }
      txt(`${Math.max(0, Math.ceil(me.hp))}`, hx + 8, by - 11, 15, '#111', 'left', 0);
      // 大招（触屏版由按钮显示）
      const spx = hx + 30, spy = by - 66, spr = 26;
      if (!TOUCH) {
      const spk = Math.min(1, me.sp / W.spNeed), ready = spk >= 1;
      ctx.fillStyle = '#000b'; ctx.beginPath(); ctx.arc(spx, spy, spr + 5, 0, 7); ctx.fill();
      ctx.strokeStyle = ready ? '#fff36b' : G.colors[me.team]; ctx.lineWidth = 6;
      ctx.beginPath(); ctx.arc(spx, spy, spr, -Math.PI / 2, -Math.PI / 2 + spk * Math.PI * 2); ctx.stroke();
      txt(ready ? 'Q' : `${Math.floor(spk * 100)}`, spx, spy + 1, ready ? 24 : 15, ready ? '#fff36b' : '#fff', 'center', 3);
      txt(S.SPECIALS[W.special].name, spx + spr + 12, spy - 8, 13, ready ? '#fff36b' : '#ccc', 'left', 3);
      txt(ready ? '大招就绪！' : '涂地充能', spx + spr + 12, spy + 10, 11, '#9a9db5', 'left', 3);
      // 炸弹
      const canBomb = me.tank >= S.SUB_COST;
      txt(`💣 E / 右键${canBomb ? '' : '（涂料不足）'}`, hx, by - 108 + 6, 12, canBomb ? '#fff' : '#777', 'left', 3);
      }
      if (alive && me.tank < 12 && !(G.inp && G.inp.w)) txt(TOUCH ? '涂料不足！切换「滚轮」在己方涂料上补充' : '涂料不足！按住 Shift 在己方涂料上补充', VW / 2, TOUCH ? 110 : VH - 120, 18, '#ffdf2e', 'center', 4);
      if (me.carry) txt(`携带电池 ×${me.carry}（送回充电站）`, hx, by - 128 + 6, 13, '#b8ff3a', 'left', 3);
    }

    // ---- 小地图 ----
    const mw = TOUCH ? 132 : small ? 150 : 228, mh = (mw * S.GH) / S.GW, mx = VW - mw - 14, my = TOUCH ? 14 : VH - mh - 14;
    ctx.fillStyle = '#000c'; rr(ctx, mx - 5, my - 5, mw + 10, mh + 10, 10); ctx.fill();
    ctx.imageSmoothingEnabled = false; ctx.drawImage(G.mini, mx, my, mw, mh); ctx.imageSmoothingEnabled = true;
    const ms = mw / S.W;
    if (o && G.mode === 'escort' && !o[5]) { ctx.fillStyle = '#ffd23f'; ctx.beginPath(); ctx.arc(mx + o[0] * ms, my + o[1] * ms, 5, 0, 7); ctx.fill(); ctx.strokeStyle = '#000'; ctx.lineWidth = 1.5; ctx.stroke(); }
    if (o && G.mode === 'soccer') { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(mx + o[0] * ms, my + o[1] * ms, 5, 0, 7); ctx.fill(); ctx.strokeStyle = '#000'; ctx.lineWidth = 1.5; ctx.stroke(); }
    if (o && G.mode === 'battery') { ctx.fillStyle = '#b8ff3a'; const f = o[2]; for (let i = 0; i < f.length; i += 4) ctx.fillRect(mx + f[i + 1] * ms - 1.5, my + f[i + 2] * ms - 1.5, 3, 3); }
    if (G.mode === 'zone') { const Z = S.ZONE, C = S.CELL; ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.strokeRect(mx + Z.x0 * C * ms, my + Z.y0 * C * ms, (Z.x1 - Z.x0) * C * ms, (Z.y1 - Z.y0) * C * ms); }
    for (const id of G.cur) {
      const p = G.players.get(id);
      if (!p || !(p.flags & 1) || (me && p.team !== me.team)) continue;
      ctx.fillStyle = G.colors[p.team]; ctx.strokeStyle = id === myId ? '#fff' : '#000'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(mx + p.x * ms, my + p.y * ms, id === myId ? 5 : 4, 0, 7); ctx.fill(); ctx.stroke();
    }
    if (me) {
      const px = mx + me.px * ms, py = my + me.py * ms;
      ctx.fillStyle = 'rgba(255,255,255,.22)'; ctx.beginPath(); ctx.moveTo(px, py);
      ctx.arc(px, py, 26, view.yaw - 0.55, view.yaw + 0.55); ctx.closePath(); ctx.fill();
    }

    // ---- 公告 / 大字 ----
    if (G.announce) {
      const age = now - G.announce.t;
      if (age > 2600) G.announce = null;
      else {
        ctx.globalAlpha = Math.min(1, (2600 - age) / 500);
        txt(G.announce.text, cx, G.announce.big ? 150 : 128, G.announce.big ? 32 : 20, G.announce.color, 'center', 5);
        ctx.globalAlpha = 1;
      }
    }
    if (G.big) {
      const age = now - G.big.t;
      if (age > 1300) G.big = null;
      else {
        const s = 1 + Math.max(0, 0.3 - age / 400);
        ctx.globalAlpha = Math.min(1, (1300 - age) / 400);
        txt(G.big.text, cx, VH * 0.3, 34 * s, G.big.color, 'center', 6);
        ctx.globalAlpha = 1;
      }
    }

    // ---- 倒计时 ----
    if (G.cd > 0) {
      const n = Math.ceil(G.cd - 0.5);
      ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(0, 0, VW, VH);
      const M = S.MODES[G.mode];
      txt(M.name, cx, VH * 0.3, 44, '#ffdf2e', 'center', 6);
      txt(M.desc, cx, VH * 0.3 + 46, 16, '#fff', 'center', 4);
      txt(`${S.MAPS[G.map].name} · 你在 ${teamName(myTeam)}`, cx, VH * 0.3 + 76, 15, G.colors[myTeam], 'center', 4);
      if (n >= 1) txt(String(n), cx, VH * 0.55, 110, '#fff', 'center', 8);
    } else if (now - G.goT < 800) {
      txt('开始！', cx, VH * 0.5, 90, '#ffdf2e', 'center', 8);
    }

    // ---- 死亡 ----
    if (me && !alive && G.cd <= 0 && !G.over) {
      ctx.fillStyle = 'rgba(10,10,20,.45)'; ctx.fillRect(0, 0, VW, VH);
      txt(`重新部署 ${Math.max(0, me.resp).toFixed(1)}s`, cx, VH * 0.42, 40, '#fff', 'center', 6);
      if (G.killer) txt(`被 ${G.killer.name}（${S.WEAPONS[G.killer.weapon].name}）击倒`, cx, VH * 0.42 + 48, 18, G.colors[G.killer.team], 'center', 4);
    }

    // ---- 结束 ----
    if (G.over) {
      const age = now - G.overT;
      ctx.fillStyle = `rgba(0,0,0,${Math.min(0.5, age / 1500)})`; ctx.fillRect(0, 0, VW, VH);
      txt('比赛结束！', cx, VH * 0.45, 72 * (1 + Math.max(0, 0.4 - age / 500)), '#ffdf2e', 'center', 8);
    }

    // ---- 记分板 ----
    if (keys.has('Tab') || TT.board) drawScoreboard();

    // ---- 准星（屏幕中心） ----
    const chx = VW / 2, chy = VH / 2;
    if (!TOUCH && !locked() && !G.over && $('settingsDlg').classList.contains('hidden')) {
      ctx.fillStyle = '#000b'; rr(ctx, chx - 150, chy + 120, 300, 40, 12); ctx.fill();
      txt('🖱 点击画面锁定鼠标，开始操控', chx, chy + 140, 16, '#ffdf2e', 'center', 0);
    }
    const r = 13;
    const col = me ? G.colors[me.team] : '#fff';
    ctx.strokeStyle = '#000'; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.arc(chx, chy, r, 0, 7); ctx.stroke();
    ctx.strokeStyle = col; ctx.lineWidth = 2.5; ctx.stroke();
    if (me && me.weapon === 'charger' && me.charge > 0) {
      ctx.strokeStyle = me.charge >= 1 ? '#fff' : '#ffdf2e'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(chx, chy, r + 6, -Math.PI / 2, -Math.PI / 2 + me.charge * Math.PI * 2); ctx.stroke();
    }
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(chx, chy, 2.2, 0, 7); ctx.fill();
    if (G.hitMark > 0) {
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 3;
      const d1 = 7, d2 = 15;
      ctx.beginPath();
      for (const [sx, sy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) { ctx.moveTo(chx + sx * d1, chy + sy * d1); ctx.lineTo(chx + sx * d2, chy + sy * d2); }
      ctx.stroke();
    }
  }

  function drawScoreboard() {
    const rows = [...G.players.values()].filter((p) => G.cur.has(p.id));
    const myTeam = G.me ? G.me.team : 1;
    const w = Math.min(620, VW - 40), h = 70 + rows.length * 30 + 30;
    const x = (VW - w) / 2, y = (VH - h) / 2;
    ctx.fillStyle = 'rgba(12,13,20,.92)'; rr(ctx, x, y, w, h, 16); ctx.fill();
    ctx.strokeStyle = '#34374d'; ctx.lineWidth = 2; ctx.stroke();
    txt('记分板', VW / 2, y + 26, 20, '#ffdf2e', 'center', 0);
    const cols = [x + 20, x + w * 0.42, x + w * 0.6, x + w * 0.72, x + w * 0.85];
    ['机兵', '武器', '击倒', '倒下', '涂地'].forEach((s, i) => txt(s, cols[i], y + 56, 12, '#9a9db5', 'left', 0));
    let ry = y + 84;
    for (const t of [myTeam, 3 - myTeam]) {
      for (const p of rows.filter((q) => q.team === t)) {
        const sb = G.sb.get(p.id) || [0, 0, 0, 0];
        txt((p.bot ? '🤖 ' : '') + p.name + (p.id === myId ? '（你）' : ''), cols[0], ry, 14, G.colors[t], 'left', 0);
        txt(S.WEAPONS[p.weapon].name, cols[1], ry, 13, '#ddd', 'left', 0);
        txt(String(sb[1]), cols[2], ry, 14, '#fff', 'left', 0);
        txt(String(sb[2]), cols[3], ry, 14, '#fff', 'left', 0);
        txt(String(sb[3]), cols[4], ry, 14, '#fff', 'left', 0);
        ry += 30;
      }
      ry += 10;
    }
  }

  // ================= 结算 =================
  function showResults(r) {
    const meRow = r.players.find((p) => p.id === myId);
    const myTeam = meRow ? meRow.team : 1;
    const cs = S.COLOR_SETS[r.colorSet].c;
    G = null;
    touchShow(false);
    if (document.exitPointerLock && locked()) document.exitPointerLock();
    setTimeout(menuMusic, 2500);
    $('results').classList.remove('hidden');
    showScreen('game');
    const won = r.winner === myTeam, draw = !r.winner;
    const title = $('resTitle');
    title.textContent = !meRow ? `${teamName(r.winner) || '平局'} 胜利` : draw ? '平 局' : won ? '胜 利 ！' : '惜 败 …';
    title.style.color = draw ? '#fff' : cs[r.winner];
    const reason = { ko: '提前决胜', time: '时间到', turf: '比分相同，按涂地面积判定' }[r.reason] || '';
    $('resSub').textContent = `${S.MODES[r.mode].name} · ${S.MAPS[r.map].name} · ${reason}`;
    const A = $('resA'), B = $('resB');
    A.style.background = cs[myTeam]; B.style.background = cs[3 - myTeam];
    A.style.width = '0'; B.style.width = '0';
    const pa = r.turf[myTeam - 1], pb = r.turf[3 - myTeam - 1];
    A.textContent = `${(pa * 100).toFixed(1)}%`; B.textContent = `${(pb * 100).toFixed(1)}%`;
    setTimeout(() => { A.style.width = pa * 100 + '%'; B.style.width = pb * 100 + '%'; }, 60);
    let score = '';
    if (r.mode === 'zone') score = `剩余倒计时　${r.count[myTeam]} : ${r.count[3 - myTeam]}`;
    else if (r.mode !== 'turf') score = `比分　${r.score[myTeam]} : ${r.score[3 - myTeam]}`;
    $('resScore').textContent = score;
    // MVP
    const val = (p) => p.kills * 100 + p.paint + p.obj * 150;
    let mvp = null;
    for (const p of r.players) if (p.team === r.winner && (!mvp || val(p) > val(mvp))) mvp = p;
    const objLabel = { escort: '得分', battery: '电池', soccer: '—', zone: '—', turf: '—' }[r.mode];
    let html = `<tr><th style="text-align:left">机兵</th><th>武器</th><th>击倒</th><th>倒下</th><th>涂地</th>${objLabel !== '—' ? `<th>${objLabel}</th>` : ''}</tr>`;
    for (const t of [myTeam, 3 - myTeam]) {
      for (const p of r.players.filter((q) => q.team === t).sort((a, b) => val(b) - val(a))) {
        html += `<tr class="${p.id === myId ? 'me' : ''}"><td style="color:${cs[t]}">${p.bot ? '🤖 ' : ''}${esc(p.name)}${mvp && p.id === mvp.id ? '<span class="mvp">★MVP</span>' : ''}</td><td>${S.WEAPONS[p.weapon].name}</td><td>${p.kills}</td><td>${p.deaths}</td><td>${p.paint}</td>${objLabel !== '—' ? `<td>${p.obj}</td>` : ''}</tr>`;
      }
    }
    $('resTable').innerHTML = html;
    const mv = $('resMvp');
    if (mvp) {
      const P = S.pilot(mvp.pilot);
      mv.style.setProperty('--pc', cs[mvp.team]);
      mv.innerHTML = `<div class="mvp-art">${GP.portrait(P)}</div><div><b>★ MVP</b><h3 style="color:${cs[mvp.team]}">${esc(mvp.name)}</h3><p>“${P.line}”</p><small style="color:var(--muted)">击倒 ${mvp.kills} · 涂地 ${mvp.paint}</small></div>`;
      mv.classList.remove('show'); void mv.offsetWidth; mv.classList.add('show');
    } else mv.classList.remove('show');
    // 经验
    if (meRow) {
      const before = level();
      const gain = 60 + (won ? 60 : draw ? 30 : 0) + meRow.kills * 10 + Math.floor(meRow.paint / 25) + meRow.obj * 12 + (mvp && mvp.id === myId ? 40 : 0);
      profile.xp += gain; profile.matches++; if (won) profile.wins++;
      profile.kills += meRow.kills; profile.paint += meRow.paint;
      saveProfile();
      const after = level();
      let msg = `+${gain} XP`;
      if (after > before) {
        msg += `　🎉 升级到 Lv.${after}！`;
        const un = S.HEADS.filter((h) => h.lv > before && h.lv <= after).map((h) => h.name);
        if (un.length) msg += `　解锁头部涂装：${un.join('、')}`;
      }
      $('resXp').textContent = msg;
      renderProfile(); renderHeads(); sendLoadout();
    } else $('resXp').textContent = '';
  }

  // ================= 启动 =================
  window.__gbDebug = () => ({ G, keys: [...keys], mouse, myId, view, R3, hub: localHub, frame: () => { const n = performance.now(); if (G) { const dt = Math.min(0.05, (n - G.lastFrame) / 1000); G.lastFrame = n; updateGame(n, dt); renderGame(n, dt); } } });
  bindUI();
  setupTouch();
  // 通过网址打开时注册离线缓存（双击本地文件打开时浏览器不支持，自动跳过）
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol) && !window.GB_SINGLE) navigator.serviceWorker.register('sw.js').catch(() => {});
  connect();
  requestAnimationFrame(loop);
})();
