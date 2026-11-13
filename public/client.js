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
  // ---------------- 资料 + 账号 ----------------
  // 三种身份：guest 游客（进度存在 gb_profile）、local 本机账号（存在这台设备）、online 在线账号（Node 服务器结算，换设备也在）
  const E = window.GE;
  const profile = {};
  // 任何来源的资料都先过一遍 normalize：旧版本自动重置成新手号，字段做范围检查
  function loadProfile(p) {
    const n = E.normalize(p, p && typeof p.name === 'string' ? p.name : '');
    for (const k of Object.keys(profile)) delete profile[k];
    Object.assign(profile, n);
  }
  const LACC = GAcc.LocalAccounts(store, S);
  const onlineKey = (n) => 'online_' + String(n).toLowerCase();
  let session = store.get('session', null);          // { kind: 'guest' | 'local' | 'online', name, token }
  if (session && session.kind === 'local' && !LACC.profile(session.name)) session = null;
  if (session && !['guest', 'local', 'online'].includes(session.kind)) session = null;
  let serverAccounts = null;     // 服务器有没有账号系统（null = 还不知道）
  let onlineReady = false;       // 在线账号：这条连接已经通过服务器验证
  let pendingAuth = null, pendingReward = null, needLogin = !session;
  loadProfile(!session || session.kind === 'guest' ? store.get('profile', {}) : session.kind === 'local' ? LACC.profile(session.name) : store.get(onlineKey(session.name), { name: session.name }));
  const level = () => S.levelFromXp(profile.xp);
  let saveTimer = 0;
  const pickFields = (o, ks) => { const r = {}; for (const k of ks) r[k] = o[k]; return r; };
  function saveProfile() {
    if (!session || session.kind === 'guest') store.set('profile', profile);
    else if (session.kind === 'local') LACC.save(session.name, profile);
    else {
      store.set(onlineKey(session.name), profile);      // 本地缓存一份，离线时也能看到
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => { if (onlineReady) send({ t: 'saveProfile', profile: pickFields(profile, E.LOADOUT_FIELDS) }); }, 400);
    }
  }

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
  // 视角：top = 俯视（默认，双摇杆）；tps = 第三人称（旧版）
  let camMode = store.get('cam', 'top');
  const TOP = () => camMode === 'top';
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
      <label class="set-row toggle"><span>第三人称视角（关闭 = 俯视双摇杆，推荐）</span><input type="checkbox" data-set="tps" ${camMode === 'tps' ? 'checked' : ''}></label>
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
          else if (cb.dataset.set === 'tps') { camMode = cb.checked ? 'tps' : 'top'; store.set('cam', camMode); document.body.classList.toggle('topcam', !!G && TOP()); if (G) { G.camF = null; G.camD = null; } }
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
  // ================= 大厅 =================
  const MODE_ICON = { turf: 'turf', zone: 'zone', escort: 'escort', soccer: 'soccer', battery: 'battery', elim: 'elim', escape4: 'escape', escape8: 'escape' };
  const MODE_COL = { turf: ['#ff3ea5', '#8c5cff'], zone: ['#ff8a1f', '#ff3b52'], escort: ['#b8860b', '#ffb000'], soccer: ['#1fbf6e', '#1f8fd6'], battery: ['#5a9a10', '#9fd42a'],
    elim: ['#2a1a1e', '#ff3b52'], escape4: ['#4a4d56', '#9cff2e'], escape8: ['#3a3d46', '#ff5a36'] };
  const ic = (n, c, size) => GI.svg(n, c, size);
  const mapName = (i) => (i < 0 ? '随机地图' : S.MAPS[i].name);
  function nextHead() { return S.HEADS.find((h) => h.tr > (profile.trophies || 0)); }
  function renderProfile() {
    const lv = level(), cur = S.xpForLevel(lv), next = S.xpForLevel(lv + 1);
    $('lvText').textContent = 'Lv.' + lv;
    $('xpText').textContent = `${profile.xp - cur} / ${next - cur} XP`;
    $('xpBar').style.width = ((profile.xp - cur) / (next - cur)) * 100 + '%';
    $('statsText').innerHTML = `<span>对战 ${profile.matches}</span><span>胜利 ${profile.wins}</span><span>击毁 ${profile.kills}</span><span>涂地 ${profile.paint}</span><span>🏆 ${profile.trophies || 0}</span>`;
    $('chipName').textContent = profile.name || '未命名机兵';
    renderAcct();
    // 奖杯
    const tr = profile.trophies || 0, nh = nextHead();
    const prevTr = [...S.HEADS].reverse().find((h) => h.tr <= tr);
    $('trophyText').textContent = tr;
    $('trophyBar').style.width = nh ? ((tr - prevTr.tr) / (nh.tr - prevTr.tr)) * 100 + '%' : '100%';
    $('trophyNext').textContent = nh ? `${nh.tr} 解锁「${nh.name}」` : '全部解锁！';
    // 驾驶员 + 机体
    const ws = (profile.wear && profile.wear.pilot || {})[profile.pilot];
    const P = S.pilot(ws ? profile.pilot + '@' + ws : profile.pilot), W = S.WEAPONS[profile.weapon];
    const av = profile.wear && profile.wear.avatar && S.skin(profile.wear.avatar), fr = profile.wear && profile.wear.frame && S.skin(profile.wear.frame);
    $('chipBot').innerHTML = av ? avatarSvg(av.avatar) : GP.portrait(P, { face: true });
    document.querySelector('.me-chip').className = 'me-chip' + (fr ? ' frame-' + fr.frame : '');
    $('chipBot').style.setProperty('--ring', P.accent);
    $('sidePilot').innerHTML = GP.portrait(P, { face: true });
    $('sidePilotName').textContent = profile.pilot ? `${P.name} · Lv.${E.power(profile, profile.pilot).lv}` : '还没有驾驶员';
    $('sideMechName').textContent = W.name;
    $('heroPortrait').innerHTML = GP.portrait(P);
    const hp = $('heroPilot');
    hp.style.setProperty('--pc', P.accent);
    hp.innerHTML = profile.pilot ? `<b>${P.name}<small>「${P.code}」${P.title} · Lv.${E.power(profile, profile.pilot).lv}</small></b><i>“${P.line}”</i>`
      : `<b>还没有驾驶员<small>完成新手教程，领取新手宝箱</small></b><i>点「对战」开始教程</i>`;
    $('heroPortrait').classList.toggle('ghost', !profile.pilot);
    const sk = S.SKILLS[P.skill], sp = S.SPECIALS[W.special];
    $('heroLoadout').innerHTML = `<span class="pill mech">${ic('mech')}${W.name}</span><span class="pill">${ic('super')}大招 · ${sp.name}</span><span class="pill">${ic('skill', P.accent)}技能 · ${sk.name}</span><span class="pill">${ic('passive', P.accent)}被动 · ${P.passive.name}</span>${(profile.pilots[P.id] || {}).bt >= 1 ? `<span class="pill ovp">${ic('super', '#b78cff')}超载 · ${S.OVERLOADS[P.id].name}</span>` : ''}${profile.tal.map((id) => `<span class="pill tal">${ic('star')}${S.talent(id).name}</span>`).join('')}`;
    $('title').style.setProperty('--pc', P.accent);
    renderModeCard();
    mountPreview();
  }
  function renderModeCard() {
    const m = S.MODES[profile.mode] || S.MODES.turf;
    $('modeIcon').innerHTML = ic(MODE_ICON[profile.mode] || 'turf');
    const mc = MODE_COL[profile.mode] || MODE_COL.turf;
    $('modeCard').style.setProperty('--mc1', mc[0]); $('modeCard').style.setProperty('--mc2', mc[1]);
    $('modeName').textContent = m.name;
    $('modeMap').textContent = `${mapName(profile.map)} · ${profile.size}v${profile.size}`;
  }
  // 3D 展示台跟着当前打开的界面走：机体面板里是小展示台，大厅里是大展示台
  function mountPreview() {
    const P = S.pilot(profile.pilot);
    const inMech = !$('ov-mechs').classList.contains('hidden');
    const host = inMech ? $('garageStage') : $('preview');
    const ws = (profile.wear && profile.wear.pilot || {})[profile.pilot];
    if (R3.preview(host, { color: P.accent, head: profile.head, weapon: profile.weapon, pilot: ws ? P.id + '@' + ws : P.id, paint: profile.wear && profile.wear.mech }, true)) PV_OK = true;
  }
  let PV_OK = false;
  function openOv(name) {
    for (const o of document.querySelectorAll('.ov')) o.classList.toggle('hidden', o.id !== 'ov-' + name);
    if (name === 'road') renderRoad();
    if (name === 'modes') renderModes();
    if (name === 'mechs') { viewMech = null; renderWeaponLists(); }
    if (name === 'pilots') { viewPilot = null; renderPilots(); }
    if (name === 'chests') renderChests();
    if (name === 'talents') renderTalents();
    if (name === 'pass') { renderPass(); if (!store.get('seenS' + E.SEASON.id, false)) { store.set('seenS' + E.SEASON.id, true); playSeasonIntro(); } }
    if (name === 'shop') renderShop();
    mountPreview();
    sfx.click();
  }
  function closeOv() {
    let any = false;
    for (const o of document.querySelectorAll('.ov')) { if (!o.classList.contains('hidden')) any = true; o.classList.add('hidden'); }
    if (any) { mountPreview(); sfx.click(); }
    return any;
  }
  // ---------------- 驾驶员选择 ----------------
  let viewPilot = null, viewMech = null;   // 详情里正在看的（可以看没拥有的）
  function renderPilots() {
    const box = $('pilotList');
    box.innerHTML = '';
    // 已拥有的排前面
    const list = S.PILOTS.slice().sort((a, b) => E.hasPilot(profile, b.id) - E.hasPilot(profile, a.id));
    for (const P of list) {
      const own = profile.pilots[P.id];
      const el = document.createElement('button');
      el.className = 'pcard' + (profile.pilot === P.id ? ' sel' : '') + (own ? '' : ' locked') + ((viewPilot || profile.pilot) === P.id ? ' viewing' : '');
      el.style.setProperty('--pc', P.accent);
      el.innerHTML = GP.portrait(P) + `${E.SEASON_PILOTS.includes(P.id) ? '<span class="new-badge s1">S1</span>' : ''}${own ? `<span class="lv-badge">Lv.${own.lv}</span>` : `<span class="lock-badge">${ic('lock')}</span>`}<div class="pname"><small>「${P.code}」</small><b>${P.name}</b></div>`;
      el.onclick = () => {
        viewPilot = P.id;
        if (own) { profile.pilot = P.id; saveProfile(); sendLoadout(); renderProfile(); }
        renderPilots(); sfx.click();
      };
      box.appendChild(el);
    }
    const P = S.pilot(viewPilot || profile.pilot), d = $('pilotDetail');
    d.style.setProperty('--pc', P.accent);
    const rec = S.WEAPONS[P.weapon], sk = S.SKILLS[P.skill];
    d.innerHTML = `<div class="det-art">${GP.portrait(P)}</div>
      <h3>${P.name}<small>「${P.code}」</small></h3><div class="ttl">${P.title}</div>
      <blockquote>“${P.line}”</blockquote>
      <div class="abil"><b>${ic('skill', P.accent)}技能 · ${sk.name}</b><p>${sk.desc} 每局 ${S.SKILL_USES} 次。</p></div>
      <div class="abil"><b>${ic('passive', P.accent)}被动 · ${P.passive.name}</b><p>${P.passive.desc}</p></div>
      <div class="abil ovl ${(profile.pilots[P.id] || {}).bt >= 1 ? '' : 'locked'}"><b>${ic('super', '#b78cff')}超载 · ${S.OVERLOADS[P.id].name}<small>${(profile.pilots[P.id] || {}).bt >= 1 ? 'R 键 · 每局 1 次' : '突破 I 解锁'}</small></b><p>${S.OVERLOADS[P.id].desc} 打出 ${S.OV_NEED} 点伤害充满，持续 ${S.OV_TIME} 秒（突破 II 后 ${S.OV_TIME + 2} 秒，效果更强）。</p></div>
      ${upgradeHtml(P)}
      <p class="bio">${P.bio}</p>
      ${!E.hasPilot(profile, P.id) ? '' : profile.weapon === P.weapon ? `<small class="okline">✓ 正在使用擅长机体「${rec.name}」</small>` : E.hasMech(profile, P.weapon) ? `<button class="btn small" id="recWpn">换上擅长机体「${rec.name}」</button>` : `<small class="okline dim">擅长机体「${rec.name}」还没拥有</small>`}`;
    bindUpgrade(P);
    const b = $('recWpn');
    if (b) b.onclick = () => { profile.weapon = P.weapon; saveProfile(); sendLoadout(); renderWeaponLists(); renderPilots(); renderProfile(); sfx.click(); };
  }
  // ---------------- 机体选择 ----------------
  function mechStats(id) {
    const W = S.WEAPONS[id];
    const perAtk = { burst: W.shots * W.dmg, fan: W.pellets * W.dmg, flick: W.pellets * W.dmg + W.rollDmg, charge: W.dmg, lob: W.dmg, punch: W.dmg }[W.attack];
    return [['生命', W.hp, W.hp / 150], ['单发伤害', Math.round(perAtk), Math.min(1, perAtk / 130)], ['射程', S.weaponRange(id), Math.min(1, S.weaponRange(id) / 620)], ['速度', Math.round(W.spd * 100) + '%', W.spd / 1.1], ['装填', W.reload + '秒', Math.min(1, 0.85 / W.reload)]];
  }
  function renderWeaponLists() {
    const P = S.pilot(profile.pilot);
    const box = $('weaponList');
    if (box) {
      box.innerHTML = '';
      const order = S.WEAPON_ORDER.slice().sort((a, b) => E.hasMech(profile, b) - E.hasMech(profile, a));
      for (const wid of order) {
        const W = S.WEAPONS[wid], own = E.hasMech(profile, wid);
        const el = document.createElement('button');
        el.className = 'mcard2' + (profile.weapon === wid ? ' sel' : '') + (own ? '' : ' locked');
        const img = R3.mechThumb ? R3.mechThumb({ color: P.accent, head: profile.head, weapon: wid, pilot: P.id }) : '';
        el.innerHTML = `${E.SEASON_MECHS.includes(wid) ? '<span class="new-badge s1">S1</span>' : ''}${own ? '' : `<span class="lock-badge">${ic('lock')}</span>`}<div class="thumb">${img ? `<img src="${img}" alt="">` : ''}</div><b>${W.name}</b><small>${W.role}</small>`;
        el.onclick = () => {
          viewMech = wid;
          if (own) { profile.weapon = wid; saveProfile(); sendLoadout(); renderPilots(); renderProfile(); }
          renderWeaponLists(); sfx.click();
        };
        box.appendChild(el);
      }
      const vid = viewMech || profile.weapon, W = S.WEAPONS[vid], sp = S.SPECIALS[W.special];
      $('mechDetail').innerHTML = `<h3>${W.name}<small>${W.role}</small></h3><p class="bio">${W.desc}</p>
        ${E.hasMech(profile, vid) ? '' : `<div class="upg locked">${ic('lock')}<div><b>还没有这台机体</b><small>街头宝箱（补给箱 / 军用箱 / 金色空投）可能开出</small></div><button class="btn small" id="goChest2">去宝箱</button></div>`}
        <div class="statbars">${mechStats(vid).map(([k, v, f]) => `<div><span>${k}</span><i><em style="width:${Math.round(f * 100)}%"></em></i><b>${v}</b></div>`).join('')}</div>
        <div class="abil"><b>${ic('super')}大招 · ${sp.name}</b><p>${sp.desc}</p></div>`;
      const g2 = $('goChest2'); if (g2) g2.onclick = () => openOv('chests');
    }
    const rbox = $('roomWeaponList');
    if (rbox) {
      rbox.innerHTML = '';
      for (const wid of S.WEAPON_ORDER.filter((w) => E.hasMech(profile, w))) {
        const W = S.WEAPONS[wid];
        const el = document.createElement('button');
        el.className = 'wcard' + (profile.weapon === wid ? ' sel' : '');
        el.innerHTML = `<div><b>${W.name}</b><small>${W.role} · 大招：${S.SPECIALS[W.special].name}</small></div>`;
        el.onclick = () => { profile.weapon = wid; saveProfile(); sendLoadout(); renderWeaponLists(); renderProfile(); sfx.click(); };
        rbox.appendChild(el);
      }
    }
  }
  function renderHeads() {
    const box = $('headList');
    box.innerHTML = '';
    const tr = profile.trophies || 0;
    for (const h of S.HEADS) {
      const el = document.createElement('button');
      const locked = tr < h.tr;
      el.className = 'hchip' + (profile.head === h.id ? ' sel' : '') + (locked ? ' locked' : '');
      el.textContent = locked ? `🔒 ${h.name} · ${h.tr}🏆` : h.name;
      el.onclick = () => {
        if (locked) return toast(`奖杯达到 ${h.tr} 解锁「${h.name}」`);
        profile.head = h.id; saveProfile(); sendLoadout(); renderHeads(); renderProfile(); sfx.click();
      };
      box.appendChild(el);
    }
  }
  function renderRoad() {
    // 节点等距排开，进度条按奖杯数在相邻节点之间插值
    const tr = profile.trophies || 0, H = S.HEADS, n = H.length;
    const pos = (i) => 4 + (i / (n - 1)) * 92;
    let k = n - 1;
    for (let i = 0; i < n - 1; i++) if (tr < H[i + 1].tr) { k = i + (tr - H[i].tr) / (H[i + 1].tr - H[i].tr); break; }
    const meX = k >= n - 1 ? 96 : 4 + (k / (n - 1)) * 92;
    let html = `<div class="road-line"><i style="width:${meX}%"></i></div>`;
    H.forEach((h, i) => {
      const got = tr >= h.tr;
      html += `<div class="road-node${got ? ' got' : ''}" style="left:${pos(i)}%"><div class="rn-dot">${got ? '✓' : '🔒'}</div><b>${h.tr} 🏆</b><small>头部涂装「${h.name}」</small></div>`;
    });
    html += `<div class="road-me" style="left:${meX}%"><span>你 · ${tr} 🏆</span></div>`;
    $('roadTrack').innerHTML = html;
  }
  function renderModes() {
    const box = $('homeModeList');
    box.innerHTML = '';
    for (const id of S.MODE_ORDER) {
      const m = S.MODES[id];
      const el = document.createElement('button');
      el.className = 'mode-tile m-' + id + (profile.mode === id ? ' sel' : '');
      el.innerHTML = `<span class="mt-ico">${ic(MODE_ICON[id])}</span><b>${m.name}</b>${m.original ? '<span class="orig">原创</span>' : ''}<p>${m.desc}</p>`;
      el.onclick = () => { profile.mode = id; saveProfile(); renderModes(); renderModeCard(); sfx.click(); };
      box.appendChild(el);
    }
    const mb = $('homeMapList');
    mb.innerHTML = '';
    for (let i = -1; i < S.MAPS.length; i++) {
      const el = document.createElement('button');
      el.className = 'mapcard' + (profile.map === i ? ' sel' : '');
      el.innerHTML = i < 0 ? '<div class="rnd">?</div><b>随机地图</b>' : `${S.MAPS[i].isNew ? '<span class="new-badge">NEW</span>' : ''}<canvas width="120" height="80"></canvas><b>${S.MAPS[i].name}</b>`;
      if (i >= 0) el.title = S.MAPS[i].desc;
      if (i >= 0) drawMapPreview(el.querySelector('canvas'), i);
      el.onclick = () => { profile.map = i; saveProfile(); renderModes(); renderModeCard(); sfx.click(); };
      mb.appendChild(el);
    }
    $('homeSize').value = String(profile.size); $('homeDur').value = String(profile.dur);
  }
  // 「对战」：建一个只有自己的房间，AI 补满后立刻开打
  let quick = null, quickRoom = false;
  function quickPlay() {
    if (needPilot()) return;
    ensureName();
    quick = { mode: profile.mode, map: profile.map, teamSize: profile.size, duration: profile.dur, bots: true };
    $('playBtn').classList.add('busy');
    const go = () => send({ t: 'create' });
    if (net && net.kind === 'peer') { backToLocal(); setTimeout(go, 50); } else go();
    setTimeout(() => { $('playBtn').classList.remove('busy'); if (quick) { quick = null; toast('没有连上服务器，请稍后再试'); } }, 4000);
  }
  // ================= 开场：XA 游戏工作室 → 加载画面 → 大厅 =================
  const TIPS = [
    '机体被打爆后驾驶员会<b>弹出</b>，活过 6 秒，新机体就空投在你脚下！',
    '躲进<b>草丛</b>，敌人就看不见你——除非靠得很近，或者你开火。',
    '在己方涂料上变成<b>滚轮</b>：跑得飞快、隐身，还能快速装填弹药。',
    '<b>弹跳板</b>能把你弹过高墙，飞上对面的高台。',
    '打中敌人会给<b>大招</b>充能，涂地也会充一点。',
    '每位驾驶员的<b>技能</b>每局只能用 3 次，留到关键时刻！',
    '踩在敌方涂料上会减速、掉血，先把脚下涂成自己的颜色。',
    '<b>迫击机兵</b>的炮弹能越过墙壁，专打躲在掩体后的人。',
    '脱离战斗 3 秒后会快速回血，打不过就先撤！',
  ];
  const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  async function boot() {
    const el = $('boot');
    if (!el) return;
    let skip = false, phase = 1;
    el.addEventListener('pointerdown', () => { skip = true; AU.resume(); });
    // 第 1 段：工作室标志
    for (let t = 0; t < 2300 && !skip; t += 50) await wait(50);
    $('bootStudio').classList.add('out');
    await wait(skip ? 50 : 350);
    $('bootStudio').classList.add('hidden');
    $('bootLoad').classList.remove('hidden');
    skip = false; phase = 2;
    // 第 2 段：加载画面（真实的预加载：字体、涂鸦墙、驾驶员立绘、机体缩略图、3D 展示台）
    const picks = S.PILOTS.slice().sort(() => Math.random() - 0.5).slice(0, 3);
    $('bootArt').innerHTML = picks.map((P) => `<div class="pol">${GP.portrait(P)}<b>${P.name}</b></div>`).join('');
    let tip = Math.floor(Math.random() * TIPS.length);
    const showTip = () => { $('bootTip').innerHTML = '小技巧：' + TIPS[tip++ % TIPS.length]; };
    showTip();
    const tipTimer = setInterval(showTip, 2600);
    const set = (k, label) => { $('bootBar').style.width = `calc(${Math.round(k * 100)}% - 6px)`; $('bootPct').textContent = Math.round(k * 100) + '%'; if (label) $('bootStep').textContent = label; };
    const steps = [
      ['正在摇匀喷漆罐…', async () => { if (document.fonts && document.fonts.load) await Promise.race([Promise.all(['40px GBHead', '40px GBNum', '40px GBTag'].map((f) => document.fonts.load(f))), wait(1500)]).catch(() => {}); }],
      ['正在给墙面打底…', async () => { GWall.apply(); }],
      ['驾驶员正在换装…', async () => { for (const P of S.PILOTS) { faceImg(P.id); GP.portrait(P); await nextFrame(); } }],
      ['正在组装机兵…', async () => { const P = S.pilot(profile.pilot); for (const w of S.WEAPON_ORDER) { if (R3.mechThumb) R3.mechThumb({ color: P.accent, head: profile.head, weapon: w, pilot: P.id }); await nextFrame(); } }],
      ['点亮霓虹灯…', async () => { renderProfile(); renderPilots(); renderWallet(); renderChests(); renderPass(); await nextFrame(); }],
    ];
    const t0 = performance.now();
    for (let i = 0; i < steps.length; i++) {
      set(i / steps.length, steps[i][0]);
      await steps[i][1]();
      // 每一步至少停一会儿，进度条看起来是在「喷」出来的
      const want = ((i + 1) / steps.length) * (skip ? 0 : 1800);
      while (performance.now() - t0 < want && !skip) await wait(30);
    }
    set(1, '准备开涂！');
    await wait(skip ? 0 : 350);
    clearInterval(tipTimer);
    el.classList.add('done');
    setTimeout(() => el.remove(), 500);
    void phase;
  }

  function ensureName() {
    if (session && session.kind !== 'guest') return;
    if (!profile.name.trim()) {
      profile.name = '机兵' + Math.floor(100 + Math.random() * 900);
      $('nameInput').value = profile.name; saveProfile(); sendHello();
    }
  }
  function joinByInput() {
    const code = $('codeInput').value.trim().toUpperCase();
    if (code.length !== 4) return toast('请输入 4 位房间码');
    if (needPilot()) return;
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
    // 按每格高度上色：墙 / 高台 / 矮台 / 楼梯 / 草丛 / 弹跳板
    let M = mapPreviewCache.get(idx);
    if (!M) { M = S.buildMap(idx); mapPreviewCache.set(idx, M); }
    const lvCol = [null, '#7a6a48', '#5a68a8', '#a0a6c4', '#6a6070'];
    for (let y = 0; y < S.GH; y++)
      for (let x = 0; x < S.GW; x++) {
        const i = y * S.GW + x;
        let col = M.lv[i] ? lvCol[M.lv[i]] : null;
        if (M.lv[i] === 4) { const g = Math.round(70 + M.top[i] * 1.2); col = `rgb(${g},${g - 10},${g + 20})`; }
        if (M.bush[i]) col = '#3d8f45';
        if (M.pad[i]) col = '#ff5fd2';
        if (col) { c.fillStyle = col; c.fillRect(x * 2, y * 2, 2, 2); }
      }
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
    $('fairChk').checked = !!room.settings.fair;
    for (const id of ['durSel', 'sizeSel', 'botChk', 'fairChk']) $(id).disabled = !isHost;
    document.querySelector('.settings').classList.toggle('readonly', !isHost);
    $('startBtn').classList.toggle('hidden', !isHost);
    $('startBtn').disabled = room.state !== 'lobby';
    $('waitText').textContent = room.state === 'playing' ? '比赛进行中，下一局开始时你就能加入…' : isHost ? '你是房主：选好模式和地图后开始对战' : '等待房主开始对战…';
  }

  function bindUI() {
    $('infoOk').onclick = () => { $('infoDlg').classList.add('hidden'); sfx.click(); };
    $('tutReplay').onclick = () => { closeOv(); if (profile.tut) startTutorial(); else showTutorialPrompt(); };
    $('nameInput').value = profile.name;
    $('nameInput').addEventListener('input', (e) => { profile.name = e.target.value.slice(0, 12); saveProfile(); $('chipName').textContent = profile.name || '未命名机兵'; });
    $('nameInput').addEventListener('change', () => sendLoadout());
    $('createBtn').onclick = () => {
      if (needPilot()) return;
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
    $('fairChk').onchange = (e) => send({ t: 'settings', fair: e.target.checked });
    $('startBtn').onclick = () => send({ t: 'start' });
    $('resBack').onclick = () => {
      $('results').classList.add('hidden'); R3.clear();
      if (quickRoom) { quickRoom = false; send({ t: 'leave' }); showScreen('title'); renderProfile(); }
      else if (room) { showScreen('room'); renderRoom(); } else showScreen('title');
    };
    // 大厅导航：侧边按钮打开全屏面板
    for (const btn of document.querySelectorAll('[data-ov]')) btn.onclick = () => openOv(btn.dataset.ov);
    for (const btn of document.querySelectorAll('[data-close]')) btn.onclick = closeOv;
    $('homeSettings').onclick = openSettings;
    $('playBtn').onclick = quickPlay;
    $('homeSize').onchange = (e) => { profile.size = +e.target.value; saveProfile(); renderModeCard(); };
    $('homeDur').onchange = (e) => { profile.dur = +e.target.value; saveProfile(); };
    $('guideModes').innerHTML = S.MODE_ORDER.map((id) => { const m = S.MODES[id]; return `<div class="mcard"><b>${m.name}</b>${m.original ? '<span class="orig">原创</span>' : ''}<p>${m.desc}</p></div>`; }).join('');
    $('roomSetBtn').onclick = openSettings;
    $('dlgClose').onclick = closeSettings;
    $('settingsDlg').addEventListener('click', (e) => { if (e.target.id === 'settingsDlg') closeSettings(); });
    let lastHover = null;
    document.addEventListener('mouseover', (e) => {
      const t = e.target.closest ? e.target.closest('.btn, .side-btn, .pcard, .mcard2, .mode-tile, .wcard, .mcard, .mapcard, .hchip, .play-btn, .mode-card, .jukebox button') : null;
      if (t && t !== lastHover && !t.disabled) sfx.hover();
      lastHover = t;
    });
    addEventListener('keydown', (e) => {
      if (e.code !== 'Escape' || performance.now() - lastUnlock < 400) return;
      if (!G && closeOv()) return;
      if ($('settingsDlg').classList.contains('hidden')) { if (G || room) openSettings(); } else closeSettings();
    });
    addEventListener('pointerdown', () => setTimeout(updateNowPlaying, 150));
    addEventListener('keydown', () => setTimeout(updateNowPlaying, 150));
    GI.fill();
    GWall.apply();
    if (document.fonts && document.fonts.load) Promise.all([document.fonts.load('40px GBTag'), document.fonts.load('40px GBHead'), document.fonts.load('40px GBNum')]).then(() => GWall.apply()).catch(() => {});
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
  const loadoutMsg = (t) => ({ t, name: profile.name || '机兵', weapon: profile.weapon, head: profile.head, pilot: profile.pilot || 'blaze', level: level(), power: E.power(profile, profile.pilot), looks: E.looks(profile) });
  const sendHello = () => send(loadoutMsg('hello'));
  const sendLoadout = () => send(loadoutMsg('loadout'));
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
      onlineReady = false;
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
      case 'caps': onCaps(m); break;
      case 'auth': onAuth(m); break;
      case 'profile': onServerProfile(m); break;
      case 'eco': onEco(m); break;
      case 'joined':
        if (!FILE_MODE && !TUT) { try { history.replaceState(null, '', '?room=' + m.code); } catch (e) { /* ignore */ } }
        if (net && net.kind === 'local') hostP2P(m.code);
        sfx.click(); break;
      case 'lobby':
        room = m.room;
        if (quick && room.hostId === myId && room.state === 'lobby') {
          const q = quick; quick = null; quickRoom = true;
          $('playBtn').classList.remove('busy');
          send(Object.assign({ t: 'settings' }, q));
          send({ t: 'start' });
          break;
        }
        if (quickRoom) break;
        if (!G && $('results').classList.contains('hidden')) showScreen('room');
        renderRoom();
        break;
      case 'left':
        if (TUT) break;
        room = null; quickRoom = false;
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
      case 'end': if (TUT) break; showResults(m.result); break;
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
    if (TOUCH || TOP() || !G || locked() || !cv.requestPointerLock) return;
    try { const r = cv.requestPointerLock(); if (r && r.catch) r.catch(() => {}); } catch (e) { /* ignore */ }
  }

  const FACE_IMG = new Map();
  function faceImg(pid) {
    let im = FACE_IMG.get(pid);
    if (!im) { im = new Image(); im.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(GP.portrait(S.pilot(pid), { face: true })); FACE_IMG.set(pid, im); }
    return im;
  }
  function startGame(m) {
    const M = S.buildMap(m.map);
    const teams = m.teams || 2;
    const colors = teams > 2 ? S.TEAM8.slice() : S.COLOR_SETS[m.colorSet].c;
    G = {
      map: m.map, mode: m.mode, colors, M, teams, grid: new Uint8Array(S.GW * S.GH), duration: m.duration,
      players: new Map(), snaps: [], projs: new Map(), fx: [], texts: [], feed: [], bombs: new Map(), missiles: [],
      announce: null, big: null, tl: m.duration, cd: 3.5, over: false, overT: 0, obj: null, objA: null, offset: null,
      sendAcc: 0, sync: -1, qq: 0, gq: 0, aq: 0, edge: false, rv: [0, 0, 0], helpers: [], shells: new Map(), dmgTexts: [], chats: new Map(), sb: new Map(), shake: 0,
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
    view.yaw = G.me && G.me.team === 2 && teams === 2 ? Math.PI : 0; view.pitch = -0.12;
    G.shades = colors.map((c, t) => (t ? [0, 0.12, -0.12].map((k) => shade(c, k)) : null));
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
    document.body.classList.toggle('topcam', TOP());
    G.camF = null;
    showVs(m.players, colors);
  }
  // 开局对阵画面：两队驾驶员立绘滑入
  function showVs(players, colors) {
    const el = $('vsSplash');
    const myTeam = G.me ? G.me.team : 1;
    let html = '';
    if (G.teams > 2) {   // 逃亡圈：不显示两队对阵，只显示模式标题
      el.innerHTML = `<div class="vs esc">${S.MODES[G.mode].name}</div>`;
      el.classList.remove('hidden'); clearTimeout(showVs.h); showVs.h = setTimeout(() => el.classList.add('hidden'), 1600);
      return;
    }
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
      if (TUT && e[0] === 'hit' && e[2] === myId && e[1] !== myId) TUT.hits++;
      else if (e[0] === 'bm' && e[9] === myId) { sfx.throw(); addBomb(e); }
      else if (e[0] === 'kb' && e[1] === myId && G.ps) {
        S.impulse(G.ps, e[2], e[3], e[4]);
        G.shake = Math.max(G.shake, Math.min(10, Math.hypot(e[2], e[3]) / 30));
      }
    }
    if (m.sb) for (const r of m.sb) G.sb.set(r[0], r);
    if (m.rv) G.rv = m.rv;
    G.snaps.push({ t: st, pm, o: m.o, d: m.d, e: m.e, h: m.h || [], done: false });
    while (G.snaps.length > 120) { const s = G.snaps.shift(); if (!s.done) consume(s, true); }
  }
  function applyMe(a) {
    const me = G.me;
    me.hp = a[4]; me.ammo = a[5] / 100; me.tank = a[5] / 3; me.sp = a[6]; me.flags = a[7]; me.resp = a[8] / 10; me.carry = a[9];
    me.sm = a[10] / 100; me.charge = a[11] / 100; me.shield = a[12]; me.spk = a[16];
    me.maxHp = a[20] || 100; me.skUses = a[21]; me.skCd = (a[22] || 0) / 10; me.buffs = a[23] || 0;
    me.ovk = (a[24] || 0) / 100; me.ovT = (a[25] || 0) / 10; me.ovOn = !!((a[26] || 0) & 1); me.ovUsed = !!((a[26] || 0) & 2);
    const alive = a[7] & 1;
    if (a[13] !== G.sync || !alive) {
      G.sync = a[13];
      me.px = a[1]; me.py = a[2]; me.pz = a[17] || 0; me.pvx = 0; me.pvy = 0; me.pvz = 0; me.onGround = true;
      G.ps = null;
    }
  }
  const OWNER_IDX = { pj: 11, ln: 9, bm: 9 };
  function consume(s, silent) {
    for (const v of s.d) { const idx = v >> 4, team = v & 15; G.grid[idx] = team; paintCell(idx, team); }
    for (const e of s.e) {
      const oi = OWNER_IDX[e[0]];
      if (oi && e[oi] === myId) continue;
      if (silent && e[0] === 'pj') continue;
      handleEvent(e, silent);
    }
  }
  const teamName = (t) => (G && G.teams > 2 ? S.TEAM8_NAMES[t] : S.TEAM_NAMES[t]);
  const teamOrder = (myTeam) => (G && G.teams > 2 ? [myTeam, ...Array.from({ length: G.teams }, (_, i) => i + 1).filter((t) => t !== myTeam)] : [myTeam, 3 - myTeam]);
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
        if (t) {
          t.flash = 0.1;
          const tx = e[1] === myId && G.me ? G.me.px : t.x, ty = e[1] === myId && G.me ? G.me.py : t.y, tz = (e[1] === myId && G.me ? G.me.pz : t.z) || 0;
          R3.emit(tx, ty, tz + 18, e[3] ? '#bef6ff' : '#ffffff', e[4] > 30 ? 8 : 4, 200, 0.8, { sys: 'pg', size: 8, life: 0.2, grav: 0, drag: 5 });
        }
        if (e[2] === myId && e[1] !== myId && !silent) { G.hitMark = 0.18; sfx.hit(); if (e[4] > 40) G.shake = Math.max(G.shake, 3); }
        // 伤害数字：只显示和自己有关的
        if (t && e[4] > 0 && !silent && (e[2] === myId || e[1] === myId)) G.dmgTexts.push({ id: e[1], dx: (Math.random() - 0.5) * 24, text: String(e[4]), color: e[1] === myId ? '#ff5a6a' : '#fff', t: now });
        break;
      }
      case 'wreck': {
        const by = G.players.get(e[1]), v = G.players.get(e[2]);
        if (!v) break;
        legendKill(by, e[3], e[4], e[5]);
        const col = G.colors[by ? by.team : 3 - v.team];
        boomFx(e[3], e[4], e[5] || 0, col, true);
        R3.emit(e[3], e[4], (e[5] || 0) + 18, '#3a3e52', 24, 300, 1.2, { size: 9, life: 1 });
        G.fx.push({ k: 'ring', x: e[3], y: e[4], z: e[5] || 0, r: 70, color: col, t0: now, dur: 500 });
        G.feed.unshift({ by, v, t: now, wreck: true }); if (G.feed.length > 5) G.feed.pop();
        if (silent) break;
        if (e[1] === myId && e[2] !== myId) { bigText(`击毁 ${v.name} 的机体！`); sfx.kill(); }
        if (e[2] === myId) { sfx.die(); bigText('机体被摧毁！驾驶员弹出', '#ff5a6a'); G.shake = Math.max(G.shake, 8); }
        else if (nearMe(e[3], e[4], 500)) { sfx.boom(); G.shake = Math.max(G.shake, 4); }
        break;
      }
      case 'mdrop': {
        const p = G.players.get(e[1]);
        if (!p) break;
        G.fx.push({ k: 'ring', x: e[2], y: e[3], z: e[4] || 0, r: 75, color: G.colors[p.team], t0: now, dur: 500 });
        G.fx.push({ k: 'line', x0: e[2], y0: e[3], z0: 900, x1: e[2], y1: e[3], z1: e[4] || 0, color: G.colors[p.team], w: 16, t0: now, dur: 420 });
        R3.burst(e[2], e[3], (e[4] || 0) + 4, G.colors[p.team], 30, 260, 0.5);
        { const sk = skinInfo(p); if (sk.rare >= 3) { for (let i = 0; i < 3; i++) ringFx(e[2], e[3], e[4] || 0, 60 + i * 45, i === 1 ? '#ffffff' : sk.col, 600, i * 120); R3.emit(e[2], e[3], (e[4] || 0) + 10, sk.col, sk.rare >= 4 ? 60 : 30, 300, 1, { sys: 'pg', size: 12, life: 0.8, grav: -80, drag: 2 }); } }
        if (!silent && e[1] === myId) { sfx.respawn(); bigText('新机体空投完成！', G.colors[p.team]); }
        else if (!silent && nearMe(e[2], e[3], 400)) sfx.boom();
        break;
      }
      case 'sk': {
        const p = G.players.get(e[1]);
        if (!p) break;
        const P = S.pilot(p.pilot), sk = S.SKILLS[e[2]];
        const r = { emp: 170, cheer: 170, smoke: 95, rally: 180, jam: 220 }[e[2]] || 40;
        G.fx.push({ k: 'ring', x: e[3], y: e[4], z: e[5] || 0, r, color: e[2] === 'emp' ? '#7af0ff' : e[2] === 'cheer' ? '#7dff9a' : P.accent, t0: now, dur: 520 });
        if (e[2] === 'smoke') R3.burst(e[3], e[4], (e[5] || 0) + 10, '#2a1f3a', 40, 160);
        skillFx(p, e[2], e[3], e[4], e[5] || 0);
        if (silent) break;
        if (e[1] === myId) { cutinSide(p, sk.name, '技能'); sfx.special(); G.camPunch = Math.max(G.camPunch || 0, 0.4); }
        else if (G.me && p.team === G.me.team && e[2] === 'scan') announce('全队可以看见所有敌人了！', P.accent);
        else if (nearMe(e[3], e[4], 400)) sfx.pick();
        break;
      }
      case 'lb': G.shells.set(e[1], { x0: e[2], y0: e[3], z0: e[4], x1: e[5], y1: e[6], z1: e[7], T: e[8], team: e[9], t0: now, r: 54 }); if (!silent && nearMe(e[2], e[3], 500)) sfx.throw(); break;
      case 'pu': {
        const p = G.players.get(e[1]);
        if (p) { G.fx.push({ k: 'ring', x: p.x + Math.cos(e[2]) * 34, y: p.y + Math.sin(e[2]) * 34, z: (p.z || 0) + 14, r: 34, color: G.colors[p.team], t0: now, dur: 220 }); if (!silent && nearMe(p.x, p.y, 400)) sfx.hit(); }
        break;
      }
      case 'qk':
        G.fx.push({ k: 'ring', x: e[1], y: e[2], z: e[3], r: 110, color: G.colors[e[4]], t0: now, dur: 520 });
        ringFx(e[1], e[2], e[3], 150, '#ffffff', 420, 60);
        R3.burst(e[1], e[2], e[3] + 4, G.colors[e[4]], 45, 320, 0.4);
        R3.emit(e[1], e[2], e[3] + 2, '#cfcbdc', 26, 220, 0.15, { sys: 'pk', size: 30, life: 1, grav: -10, drag: 3, grow: 1.5 });
        R3.emit(e[1], e[2], e[3] + 4, '#5a5266', 20, 320, 1.2, { size: 8, life: 0.9 });
        if (!silent && nearMe(e[1], e[2], 600)) { sfx.boom(); G.shake = Math.max(G.shake, 8); }
        break;
      case 'heal': { const p = G.players.get(e[1]); if (p) G.texts.push({ x: p.x, y: p.y, z: (p.z || 0) + 50, text: `+${e[2]}`, color: '#7dff9a', t: now }); break; }
      case 'kill': {
        const by = G.players.get(e[1]), v = G.players.get(e[2]);
        if (!v) break;
        legendKill(by, e[3], e[4], e[5]);
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
      case 'ov': {
        const p = G.players.get(e[1]);
        if (!p) break;
        const O = S.OVERLOADS[e[2]], P = S.pilot(e[2]);
        for (let i = 0; i < 3; i++) ringFx(e[3], e[4], e[5], 90 + i * 80, i ? P.accent : '#ffffff', 600, i * 120);
        R3.emit(e[3], e[4], (e[5] || 0) + 20, P.accent, 50, 320, 1, { sys: 'pg', size: 14, life: 0.7, grav: -60, drag: 2 });
        if (silent) break;
        if (e[1] === myId) { cutinBig(p, O.name, 'OVERLOAD!', `${P.name} · 超载技能`); G.camPunch = 1; G.flashT = now; G.speedLines = now; G.shake = Math.max(G.shake, 7); sfx.special(); }
        else cutinSide(p, O.name, '超载');
        break;
      }
      case 'rd': if (!silent) { const w = e[1], mine = G.me && G.me.team === w; announce(`${mine ? '我方' : '对方'}拿下第 ${e[4]} 局！（${e[2]} : ${e[3]}）`, G.colors[w], true); (mine ? sfx.win : sfx.lose)(); } break;
      case 'rs': if (!silent) { bigText(`第 ${e[1]} 局 · 开始！`, '#ffdf2e'); sfx.go(); } break;
      case 'tout': if (!silent) announce(`${G.mode === 'escape8' ? (([...G.players.values()].find((q) => q.team === e[1]) || {}).name || '') : S.TEAM8_NAMES[e[1]]} 被淘汰（第 ${e[2]} 名）`, G.colors[e[1]]); break;
      case 'cz': if (!silent) { announce('⚠ 毒圈开始收缩！', '#ff5a36', true); sfx.count(); } break;
      case 'cr': if (!silent) announce('空投箱落地了！', '#ffe600'); break;
      case 'crt': {
        R3.emit(e[2], e[3], (e[4] || 0) + 10, '#ffe600', 24, 220, 1, { sys: 'pg', size: 11, life: 0.6, grav: -100, drag: 2 });
        ringFx(e[2], e[3], e[4] || 0, 50, '#ffe600', 400);
        if (e[1] === myId && !silent) { bigText(`能量 +1（共 ${e[5]} 层）`, '#ffe600'); sfx.pick(); }
        break;
      }
      case 'fz': (G.fires || (G.fires = [])).push({ x: e[1], y: e[2], z: e[3], r: e[4], end: now + e[5] * 1000, team: e[6], acc: 0 }); break;
      case 'bx':
        if (e[6] === 2) {   // 音波：穿墙的大圈
          for (let i = 0; i < 3; i++) ringFx(e[1], e[2], e[3], e[5] * (0.5 + i * 0.25), i === 1 ? '#ffffff' : G.colors[e[4]], 420, i * 90);
          if (!silent && nearMe(e[1], e[2], 600)) { sfx.boom(); G.shake = Math.max(G.shake, 4); }
          break;
        }
        if (e[6]) G.bombs.delete(e[6]);
        boomFx(e[1], e[2], e[3], G.colors[e[4]], e[5] > 70);
        G.fx.push({ k: 'ring', x: e[1], y: e[2], z: e[3], r: e[5], color: G.colors[e[4]], t0: now, dur: 380 });
        if (!silent && nearMe(e[1], e[2], 700)) { sfx.boom(); G.shake = Math.max(G.shake, nearMe(e[1], e[2], 200) ? 9 : 5); }
        break;
      case 'ms': G.missiles.push({ x: e[1], y: e[2], z: e[3], team: e[4], t0: now, dur: 1500 }); break;
      case 'sp': {
        const p = G.players.get(e[1]);
        if (!p || silent) break;
        const sp = S.SPECIALS[e[2]];
        superFx(p, e[2]);
        if (e[1] === myId) {
          // 自己的大招：大横幅 + 镜头冲击 + 白闪 + 速度线
          cutinBig(p, sp.name, 'SUPER!', `${S.pilot(p.pilot).name} · ${S.WEAPONS[p.weapon].name}`);
          G.camPunch = 1; G.flashT = now; G.speedLines = now; G.shake = Math.max(G.shake, 5);
        } else cutinSide(p, sp.name, (G.me && p.team !== G.me.team ? '敌方 ' : '队友 ') + p.name + ' · 大招');
        sfx.special();
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
    G.projs.set(e[1], { id: e[1], x0: e[2], y0: e[3], z0: e[4], vx: e[5], vy: e[6], vz: e[7], ts: e[8], team: e[9], s: e[10], t0: performance.now(), mine, x: e[2], y: e[3], z: e[4], ghost: !!e[12], fx: fxOf(e[11]) });
    if (G.projs.get(e[1]).fx && G.projs.get(e[1]).fx.rare >= 3) { const F = G.projs.get(e[1]).fx; R3.emit(e[2], e[3], e[4], F.fx.cols[0], F.rare >= 4 ? 6 : 3, 140, 0, { sys: 'pg', size: 9, life: 0.25, grav: 0, drag: 5 }); }
    // 枪口火光：白色核心 + 队伍色火花，沿射击方向喷出
    const L = Math.hypot(e[5], e[6], e[7]) || 1, dir = { x: e[5] / L, y: e[6] / L, z: e[7] / L };
    R3.emit(e[2], e[3], e[4], '#ffffff', 1, 0, 0, { sys: 'pg', size: 16, life: 0.07, grav: 0 });
    R3.emit(e[2], e[3], e[4], G.colors[e[9]], 3, 160, 0, { sys: 'pg', size: 7, life: 0.14, grav: 0, drag: 6, dir, spread: 0.7 });
  }
  // 皮肤等级（驾驶员服装 / 机甲涂装里更高的那个）与颜色
  const pk = (p) => (p && p.looks && p.looks.pskin ? p.pilot + '@' + p.looks.pskin : p.pilot);   // 带服装的驾驶员
  function skinInfo(p) {
    const ks = [p && p.looks && p.looks.pskin, p && p.looks && p.looks.paint].map((k) => k && S.skin(k)).filter(Boolean).sort((a, b) => b.rare - a.rare);
    return ks.length ? { rare: ks[0].rare, col: ks[0].over ? ks[0].over.accent : ks[0].paint.light } : { rare: 0, col: '#fff' };
  }
  function fxOf(ownerId) { const o = G && G.players.get(ownerId), K = o && o.looks && o.looks.fx && S.skin(o.looks.fx); return K ? { fx: K.fx, rare: K.rare } : null; }
  // 传说皮肤：击倒时炸出星光
  function legendKill(by, x, y, z) {
    const sk = skinInfo(by);
    if (sk.rare < 4) return;
    for (let i = 0; i < 3; i++) ringFx(x, y, z || 0, 50 + i * 40, i === 1 ? '#ffffff' : sk.col, 700, i * 100);
    for (let i = 0; i < 16; i++) R3.emit(x, y, (z || 0) + 30, i % 2 ? '#ffffff' : sk.col, 1, 420, 0, { sys: 'pg', size: 12, life: 0.7, grav: -60, drag: 2.5, dir: { x: Math.cos(i * 0.39), y: Math.sin(i * 0.39), z: 0.4 }, spread: 0.2 });
  }
  function killProj(pr, x, y, z) {
    G.projs.delete(pr.id);
    const px = x == null ? pr.x : x, py = y == null ? pr.y : y, pz = z == null ? pr.z : z;
    if (pr.fx) { const F = pr.fx.fx, n = F.n + pr.fx.rare * 2; for (let i = 0; i < n; i++) R3.emit(px, py, pz + 4, F.cols[i % F.cols.length], 1, 90 + pr.fx.rare * 30, 1, { sys: pr.fx.rare >= 2 ? 'pg' : 'ps', size: 6 + pr.fx.rare * 1.5, life: 0.5, grav: -200, drag: 2 }); }
    R3.emit(px, py, pz + 2, G.colors[pr.team], 6, 120, 0.8, { size: 6, life: 0.4 });
    R3.emit(px, py, pz + 3, G.colors[pr.team], 1, 0, 0, { sys: 'pg', size: 18, life: 0.12, grav: 0 });
  }
  // ---------------- 演出：大招横幅 / 侧边横幅 ----------------
  function cutinBig(p, title, small, sub) {
    const el = $('cutin');
    const P = S.pilot(pk(p)), sk = skinInfo(p);
    el.style.setProperty('--tc', G.colors[p.team]);
    el.classList.toggle('legend', sk.rare >= 4);   // 传说皮肤：金边横幅
    el.classList.toggle('epic', sk.rare === 3);
    el.innerHTML = `<div class="band"></div><div class="art">${GP.portrait(P, { bust: true })}</div><div class="ttl"><small>${small}</small><b>${title}</b><i>${sub}</i></div>`;
    el.classList.remove('hidden');
    clearTimeout(cutinBig.h);
    cutinBig.h = setTimeout(() => el.classList.add('hidden'), 1050);
  }
  function cutinSide(p, title, small) {
    const box = $('cutinSide');
    const P = S.pilot(pk(p));
    const d = document.createElement('div');
    d.className = 'cs'; d.style.setProperty('--tc', G.colors[p.team]);
    d.innerHTML = `<div class="face">${GP.portrait(P, { face: true })}</div><div><small>${small}</small><b>${title}</b></div>`;
    box.appendChild(d);
    while (box.children.length > 3) box.firstChild.remove();
    setTimeout(() => d.remove(), 2100);
  }
  // 圆环 + 粒子的组合特效
  function ringFx(x, y, z, r, color, dur = 450, delay = 0) { G.fx.push({ k: 'ring', x, y, z, r, color, t0: performance.now() + delay, dur }); }
  function boomFx(x, y, z, color, big) {
    const k = big ? 1.6 : 1;
    R3.emit(x, y, z + 10, '#fff4c8', Math.round(6 * k), 120 * k, 0.8, { sys: 'pg', size: 26 * k, life: 0.25, grav: 0, drag: 5, grow: 0.8 });
    R3.emit(x, y, z + 10, '#ff9a2e', Math.round(14 * k), 260 * k, 0.9, { sys: 'pg', size: 16 * k, life: 0.45, grav: -60, drag: 3, grow: 0.6 });
    R3.emit(x, y, z + 8, color, Math.round(30 * k), 320 * k, 1, { size: 7, life: 0.7 });
    R3.emit(x, y, z + 12, '#3a3448', Math.round(10 * k), 90 * k, 0.6, { sys: 'pk', size: 34 * k, life: 1.4, grav: -40, drag: 2.5, grow: 1.6 });
  }
  function superFx(p, kind) {
    const x = p.id === myId && G.me ? G.me.px : p.x, y = p.id === myId && G.me ? G.me.py : p.y, z = (p.id === myId && G.me ? G.me.pz : p.z) || 0;
    const col = G.colors[p.team];
    ringFx(x, y, z, 90, '#ffffff', 300);
    R3.emit(x, y, z + 20, col, 30, 260, 1, { sys: 'pg', size: 12, life: 0.5, grav: 0, drag: 3 });
    switch (kind) {
      case 'storm': for (let i = 0; i < 3; i++) ringFx(x, y, z, 120 + i * 70, col, 520, i * 330); break;
      case 'charge': ringFx(x, y, z, 120, '#ffb02e', 500); R3.emit(x, y, z + 10, '#ffb02e', 30, 200, 1, { sys: 'pg', size: 16, life: 0.6, grav: -100, drag: 2 }); break;
      case 'missiles': for (let i = 0; i < 12; i++) R3.emit(x, y, z + 30, '#ffffff', 1, 700, 0, { sys: 'pg', size: 10, life: 0.6, grav: 0, dir: { x: 0, y: 0, z: 1 }, spread: 0.3 }); break;
      case 'bubble': ringFx(x, y, z, 170, '#bef6ff', 600); R3.emit(x, y, z + 10, '#bef6ff', 24, 120, 1, { sys: 'pk', size: 18, life: 1.2, grav: -60, drag: 1.5 }); break;
      case 'beam': ringFx(x, y, z, 80, col, 300); G.shake = Math.max(G.shake, p.id === myId ? 6 : 0); break;
      case 'barrage': ringFx(x, y, z, 110, col, 420); break;
      case 'quake': ringFx(x, y, z, 70, col, 300); R3.emit(x, y, z + 2, '#cfcbdc', 16, 140, 0.2, { sys: 'pk', size: 20, life: 0.7, grav: -10, drag: 3, grow: 1.2 }); break;
      case 'bulldoze': ringFx(x, y, z, 110, col, 400); R3.emit(x, y, z + 4, '#cfcbdc', 24, 200, 0.2, { sys: 'pk', size: 24, life: 0.8, grav: -10, drag: 3, grow: 1.2 }); G.shake = Math.max(G.shake, p.id === myId ? 6 : 0); break;
      case 'napalm': ringFx(x, y, z, 70, '#ff7a2e', 300); break;
      case 'swarm': for (let i = 0; i < 3; i++) R3.emit(x, y, z + 40, '#ffc531', 10, 180, 1, { sys: 'pg', size: 9, life: 0.5, grav: 0, drag: 3 }); ringFx(x, y, z, 60, col, 300); break;
      case 'whirl': for (let i = 0; i < 4; i++) ringFx(x, y, z, 112, i % 2 ? '#ffffff' : col, 500, i * 500); break;
      case 'sonic': break;   // 音波大圈由 bx 事件画
    }
  }
  function skillFx(p, kind, x, y, z) {
    const P = S.pilot(p.pilot);
    switch (kind) {
      case 'rally': ringFx(x, y, z, 180, '#ff5a36', 600); R3.emit(x, y, z + 50, '#ff5a36', 26, 160, 1, { sys: 'pg', size: 12, life: 0.7, grav: 60, drag: 2 }); break;
      case 'blast': ringFx(x, y, z, 110, '#ff3b52', 1200); break;
      case 'jam': for (let i = 0; i < 3; i++) ringFx(x, y, z, 220 * (0.4 + i * 0.3), '#2ef0c8', 500, i * 110); break;
      case 'rush': ringFx(x, y, z, 70, '#fff36b', 380); R3.emit(x, y, z + 16, '#fff36b', 20, 220, 0.6, { sys: 'pg', size: 10, life: 0.4, grav: 0, drag: 3 }); break;
      case 'scan': ringFx(x, y, z, 700, '#7af0ff', 1000); ringFx(x, y, z, 360, '#7af0ff', 700, 150); if (G.me && p.team === G.me.team) G.scanUntil = performance.now() + 5000; break;
      case 'cheer':
        ringFx(x, y, z, 170, '#7dff9a', 600); R3.emit(x, y, z + 20, '#7dff9a', 24, 140, 1, { sys: 'pg', size: 10, life: 0.8, grav: -80, drag: 2 });
        for (let i = 0; i < 5; i++) G.texts.push({ x: x + (Math.random() - 0.5) * 80, y: y + (Math.random() - 0.5) * 80, z: z + 30, text: i % 2 ? '♪' : '♫', color: '#7dff9a', t: performance.now() + i * 90 });
        break;
      case 'guard': ringFx(x, y, z, 60, '#bef6ff', 400); R3.emit(x, y, z + 20, '#bef6ff', 18, 120, 1, { sys: 'pg', size: 12, life: 0.5, grav: 0, drag: 3 }); break;
      case 'smoke': for (let i = 0; i < 3; i++) R3.emit(x, y, z + 10, i ? '#2a1f3a' : '#4a3a6a', 22, 160, 0.5, { sys: 'pk', size: 44, life: 2.6, grav: -12, drag: 2.6, grow: 1.6 }); break;
      case 'turret': G.fx.push({ k: 'line', x0: x, y0: y, z0: 700, x1: x, y1: y, z1: z, color: P.accent, w: 10, t0: performance.now(), dur: 300 }); R3.emit(x, y, z + 6, P.accent, 20, 200, 0.6, { sys: 'pg', size: 9, life: 0.4, grav: 0, drag: 3 }); break;
      case 'dash': { ringFx(x, y, z, 50, P.accent, 300); const a = p.a || 0; R3.emit(x, y, z + 16, P.accent, 18, 260, 0, { sys: 'pg', size: 12, life: 0.35, grav: 0, drag: 4, dir: { x: -Math.cos(a), y: -Math.sin(a), z: 0.1 }, spread: 0.6 }); break; }
      case 'emp':
        ringFx(x, y, z, 170, '#7af0ff', 500); ringFx(x, y, z, 120, '#ffffff', 300, 80);
        for (let i = 0; i < 8; i++) { const a = (i / 8) * 6.283 + Math.random() * 0.4, r = 60 + Math.random() * 100; G.fx.push({ k: 'line', x0: x, y0: y, z0: z + 20, x1: x + Math.cos(a) * r, y1: y + Math.sin(a) * r, z1: z + 6, color: '#bff8ff', w: 2.5, t0: performance.now() + i * 25, dur: 220 }); }
        R3.emit(x, y, z + 20, '#bff8ff', 30, 300, 0.6, { sys: 'pg', size: 8, life: 0.4, grav: 0, drag: 3 });
        break;
      case 'bento': R3.emit(x, y, z + 10, '#ffffff', 10, 40, 1, { sys: 'pk', size: 18, life: 1.2, grav: -60, drag: 1.5, grow: 1 }); ringFx(x, y, z, 40, '#ffb43d', 300); break;
      case 'overdrive': ringFx(x, y, z, 80, '#ff7a2e', 400); R3.emit(x, y, z + 20, '#ff7a2e', 30, 200, 1, { sys: 'pg', size: 13, life: 0.5, grav: -100, drag: 2 }); break;
      case 'drone': R3.emit(x, y, z + 40, '#ffc531', 24, 160, 1, { sys: 'pg', size: 9, life: 0.5, grav: 0, drag: 3 }); ringFx(x, y, z, 50, '#ffc531', 300); break;
    }
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
    if (k === 'KeyE') { G.qq++; G.edge = true; }   // 大招
    if (k === 'KeyR') { G.oq = (G.oq || 0) + 1; G.edge = true; }   // 超载技能
    if (k === 'KeyQ') { G.gq++; G.edge = true; }   // 驾驶员技能
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
    if (!TOP() && !locked()) { lockPointer(); return; }
    if (e.button === 0) { mouse.down = true; G.aq++; G.edge = true; }
    if (e.button === 2) { G.qq++; G.edge = true; }
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
  const TT = { on: false, sx: 0, sy: 0, hold: false, aiming: false, ax: 0, ay: -1, ak: 1, superAim: false, keepUntil: 0, jump: false, wheel: false, ptr: new Map(), board: false };
  function setupTouch() {
    if (!TOUCH) return;
    const ui = $('touchUI'), stick = $('tStick'), knob = stick.querySelector('i');
    const R = 56, AR = 64;
    const goFull = () => {
      const de = document.documentElement;
      if (!document.fullscreenElement && de.requestFullscreen) {
        de.requestFullscreen({ navigationUI: 'hide' }).then(() => { try { screen.orientation.lock('landscape').catch(() => {}); } catch (e) { /* ignore */ } }).catch(() => {});
      }
    };
    const btnOf = (el) => el && el.closest && el.closest('[data-tb]');
    const isCharger = () => G && G.me && S.WEAPONS[G.me.weapon].attack === 'charge' && !(G.me.flags & 512);
    // 点一下：自动瞄准最近的敌人
    const autoAim = (superMode) => {
      const me = G.me; if (!me) return;
      const range = superMode ? superRange(me) : (me.flags & 512 ? S.PISTOL.range : S.weaponRange(me.weapon));
      const t = autoTarget(range + 60);
      if (t) { G.aimLock = t.id; G.aimLockUntil = performance.now() + 300; G.aimPt = { x: t.x, y: t.y }; }
      TT.keepUntil = performance.now() + 300;
    };
    ui.addEventListener('pointerdown', (e) => {
      if (!G) return;
      e.preventDefault();
      AU.resume();
      if (store.get('fullscreen', true)) goFull();
      const b = btnOf(e.target);
      const rec = { x0: e.clientX, y0: e.clientY, lx: e.clientX, ly: e.clientY, kind: TOP() ? 'none' : 'look', t0: performance.now() };
      if (b) {
        const k = b.dataset.tb;
        rec.kind = k; b.classList.add('on'); rec.el = b;
        if (k === 'fire' || k === 'sp') {
          const r = b.getBoundingClientRect();
          rec.cx = r.left + r.width / 2; rec.cy = r.top + r.height / 2; rec.dragged = false;
        } else if (k === 'jump') TT.jump = true;
        else if (k === 'wheel') { TT.wheel = !TT.wheel; b.classList.toggle('lit', TT.wheel); }
        else if (k === 'skill') { G.gq++; G.edge = true; }
        else if (k === 'ov') { G.oq = (G.oq || 0) + 1; G.edge = true; }
        else if (k === 'menu') openSettings();
        else if (k === 'board') TT.board = !TT.board;
        else if (k === 'chat') send({ t: 'chat', k: (TT.chatK = ((TT.chatK || 0) + 1) % 4) });
      } else if (e.clientX < innerWidth * 0.45) {
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
        if (l > R * 1.6) { rec.x0 += (dx / l) * (l - R * 1.6); rec.y0 += (dy / l) * (l - R * 1.6); stick.style.left = rec.x0 + 'px'; stick.style.top = rec.y0 + 'px'; dx = e.clientX - rec.x0; dy = e.clientY - rec.y0; }
        const k = Math.min(1, Math.hypot(dx, dy) / R), a = Math.atan2(dy, dx);
        TT.sx = Math.cos(a) * k; TT.sy = -Math.sin(a) * k;
        if (k < 0.12) { TT.sx = 0; TT.sy = 0; }
        knob.style.transform = `translate(calc(-50% + ${Math.cos(a) * k * R}px), calc(-50% + ${Math.sin(a) * k * R}px))`;
      } else if (rec.kind === 'fire' || rec.kind === 'sp') {
        // 攻击 / 大招摇杆：拖动瞄准，松手发射
        const dx = e.clientX - rec.cx, dy = e.clientY - rec.cy, l = Math.hypot(dx, dy);
        if (l > 16 || rec.dragged) {
          rec.dragged = true;
          TT.aiming = true; TT.superAim = rec.kind === 'sp';
          if (l > 1) { TT.ax = dx / l; TT.ay = dy / l; }
          TT.ak = Math.max(0.2, Math.min(1, l / AR));
          if (rec.kind === 'fire' && isCharger()) TT.hold = true;    // 狙击：拖动时蓄力
          rec.el.style.setProperty('--dx', `${Math.min(l, AR) * (dx / (l || 1))}px`); rec.el.style.setProperty('--dy', `${Math.min(l, AR) * (dy / (l || 1))}px`);
        }
      } else if (rec.kind === 'look') {
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
      if (rec.el) { rec.el.classList.remove('on'); rec.el.style.removeProperty('--dx'); rec.el.style.removeProperty('--dy'); }
      if (rec.kind === 'stick') { TT.sx = 0; TT.sy = 0; stick.classList.remove('show'); }
      else if (rec.kind === 'jump') TT.jump = false;
      else if ((rec.kind === 'fire' || rec.kind === 'sp') && G) {
        if (!rec.dragged) autoAim(rec.kind === 'sp');
        else TT.keepUntil = performance.now() + 300;
        if (rec.kind === 'fire') { if (!(isCharger() && rec.dragged)) G.aq++; }
        else G.qq++;
        G.edge = true;
        TT.aiming = false; TT.hold = false; TT.superAim = false;
      }
    };
    ui.addEventListener('pointerup', end); ui.addEventListener('pointercancel', end);
    ui.addEventListener('contextmenu', (e) => e.preventDefault());
  }
  function touchShow(on) {
    if (!TOUCH) return;
    TT.on = on;
    $('touchUI').classList.toggle('hidden', !on);
    document.body.classList.toggle('ingame', on);
    if (!on) { TT.hold = TT.aiming = TT.jump = TT.wheel = false; TT.sx = TT.sy = 0; TT.ptr.clear(); $('tWheel').classList.remove('lit'); }
  }
  // 触屏辅助瞄准：开火时准星会被附近的敌人轻轻吸过去
  function aimAssist(dt) {
    const me = G.me;
    if (TOP() || !TT.on || !TT.hold || !me || !G.cam) return;
    const t = autoTarget(S.weaponRange(me.weapon) * 1.1);
    if (!t) return;
    const da = Math.atan2(Math.sin(Math.atan2(t.y - me.py, t.x - me.px) - view.yaw), Math.cos(Math.atan2(t.y - me.py, t.x - me.px) - view.yaw));
    if (Math.abs(da) < 0.16) view.yaw += da * Math.min(1, dt * 3.2);
  }
  // 地面瞄准指示：攻击射程 / 扇形 / 落点圈，大招有自己的形状
  function computeAimShow() {
    const me = G.me;
    G.aimShow = null;
    if (!TOP() || !me || !(me.flags & 1) || G.cd > 0 || G.over || !G.aim) return;
    const aiming = TT.on ? TT.aiming : true;
    if (!aiming) return;
    const foot = me.flags & 512, W = S.WEAPONS[me.weapon], a = G.aim.a, d = G.aim.d;
    const base = { x: me.px, y: me.py, z: me.pz, a, color: G.colors[me.team], strong: TT.on || mouse.down };
    if (TT.superAim && !foot) {
      const sp = W.special;
      if (sp === 'beam') Object.assign(base, { kind: 'line', len: 900, w: 26 });
      else if (sp === 'barrage') Object.assign(base, { kind: 'line', len: 440, w: 70 });
      else if (sp === 'quake') { const dd = clamp(d, 80, 280); Object.assign(base, { kind: 'line', len: dd, w: 10, tx: me.px + Math.cos(a) * dd, ty: me.py + Math.sin(a) * dd, tz: me.pz, tr: 95 }); }
      else if (sp === 'charge') Object.assign(base, { kind: 'line', len: 300, w: 44 });
      else Object.assign(base, { kind: 'circle', len: sp === 'storm' ? 260 : sp === 'bubble' ? 170 : 60 });
      base.color = '#ffdf2e'; G.aimShow = base; return;
    }
    if (foot) Object.assign(base, { kind: 'line', len: S.PISTOL.range, w: 8 });
    else switch (W.attack) {
      case 'burst': Object.assign(base, { kind: 'line', len: W.range, w: 16 }); break;
      case 'fan': Object.assign(base, { kind: 'fan', len: W.range, arc: W.arc + 0.1 }); break;
      case 'flick': Object.assign(base, { kind: 'fan', len: W.range, arc: W.arc + 0.1 }); break;
      case 'charge': Object.assign(base, { kind: 'line', len: W.range * (0.35 + 0.65 * (me.charge || 0)), w: 8 + 6 * (me.charge || 0) }); break;
      case 'punch': Object.assign(base, { kind: 'fan', len: W.range + 18, arc: W.arc }); break;
      case 'lob': {
        const dd = clamp(d, W.minRange, W.range), tx = me.px + Math.cos(a) * dd, ty = me.py + Math.sin(a) * dd;
        Object.assign(base, { kind: 'line', len: dd, w: 4, tx, ty, tz: Math.min(150, S.topAt(G.M, tx, ty)), tr: W.blast });
        break;
      }
    }
    G.aimShow = base;
  }
  function updateTouchHud() {
    if (!TT.on || !G.me) return;
    const me = G.me, W = S.WEAPONS[me.weapon], foot = me.flags & 512;
    const spk = foot ? 0 : Math.min(1, me.sp / W.spNeed);
    const sp = $('tSp');
    sp.style.setProperty('--p', spk);
    sp.classList.toggle('lit', spk >= 1);
    sp.classList.toggle('dim', !!foot);
    const ov = $('tOv');
    ov.classList.toggle('hidden', !me.ovOn);
    ov.style.setProperty('--p', me.ovUsed ? 0 : me.ovk || 0);
    ov.classList.toggle('lit', !me.ovUsed && me.ovk >= 1);
    ov.classList.toggle('dim', !!me.ovUsed);
    const sk = $('tSkill');
    sk.classList.toggle('dim', !(me.skUses > 0) || me.skCd > 0);
    sk.dataset.n = me.skUses == null ? 3 : me.skUses;
    $('tFire').style.setProperty('--ammo', me.ammo == null ? 3 : me.ammo);
    if (TT.wheel && TT.aiming) $('tWheel').classList.remove('lit');
    if (TT.aiming) TT.wheel = false;
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
    let w = keys.has('ShiftLeft') || keys.has('ShiftRight') || (TT.on && TT.wheel && !TT.aiming);
    if (me && me.spk === SP_BEAM && me.flags & 128) w = false;
    const aim = G.aim || { a: view.yaw, pt: view.pitch };
    const jump = keys.has('Space') || (TT.on && TT.jump);
    return { mx, my, w, f: (mouse.down || (TT.on && TT.hold)) && !w, j: jump, jh: jump, a: aim.a, pt: aim.pt, ad: aim.d || 200 };
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
  // ---------------- 俯视镜头（双摇杆）：镜头固定朝向敌方，自己的基地在屏幕下方 ----------------
  function aimToPoint(ax, ay, az) {
    const me = G.me;
    const d = Math.hypot(ax - me.px, ay - me.py);
    const z = az == null ? Math.max(S.topAt(G.M, ax, ay) < 1e3 ? S.topAt(G.M, ax, ay) : 0, 0) + 16 : az;
    const foot = me.flags & 512;
    return { a: Math.atan2(ay - me.py, ax - me.px), pt: clamp(Math.atan2(z - (me.pz + (foot ? 14 : S.MUZZLE)), Math.max(30, d)), -0.7, 0.9), d };
  }
  // 自动瞄准：最近的看得见的敌人
  function autoTarget(range) {
    const me = G.me;
    let best = null, bd = range;
    for (const id of G.cur) {
      const p = G.players.get(id);
      if (!p || !(p.flags & 1) || p.team === me.team || !visibleEnemy(p)) continue;
      const d = Math.hypot(p.x - me.px, p.y - me.py);
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }
  function visibleEnemy(p) {
    if (!(p.flags & 4)) return true;
    const me = G.me;
    if (!me || G.rv[me.team]) return true;
    return Math.hypot(p.x - me.px, p.y - me.py) < (me.pilot === 'hex' ? 170 : S.BUSH_DETECT);
  }
  function updateCameraTop(dt) {
    const me = G.me;
    let fx, fy, fz;
    if (me) { fx = me.px; fy = me.py; fz = me.pz; }
    else { const p = G.players.get([...G.cur][0]); if (!p) return; fx = p.x; fy = p.y; fz = p.z || 0; }
    const yaw = me && me.team === 2 ? Math.PI : 0;
    view.yaw = yaw; view.pitch = -0.1;
    const fwx = Math.cos(yaw), fwy = Math.sin(yaw);
    // 镜头稍微看向瞄准方向
    let lx = 0, ly = 0;
    if (G.aimPt && me) { lx = clamp((G.aimPt.x - fx) * 0.18, -90, 90); ly = clamp((G.aimPt.y - fy) * 0.18, -70, 70); }
    // 镜头不要拍到场外太多：焦点限制在场地内
    const tx = clamp(fx + lx + fwx * 60, 150, S.W - 150), ty = clamp(fy + ly + fwy * 60, 140, S.H - 140);
    if (!G.camF) G.camF = { x: tx, y: ty, z: fz };
    const k = Math.min(1, dt * 7);
    G.camF.x += (tx - G.camF.x) * k; G.camF.y += (ty - G.camF.y) * k; G.camF.z += (fz - G.camF.z) * Math.min(1, dt * 5);
    G.camDipV += (-180 * G.camDip - 16 * G.camDipV) * Math.min(dt, 0.05);
    G.camDip = Math.max(-18, Math.min(8, G.camDip + G.camDipV * Math.min(dt, 0.05)));
    const aspect = VW / Math.max(1, VH);
    const far = (aspect < 1.4 ? 1.18 : 1) * (TOUCH ? 0.84 : 1);   // 屏幕越窄镜头越高；手机屏幕小，镜头拉近一点
    // 大招 / 技能时镜头往前一冲再弹回去
    G.camPunch = Math.max(0, (G.camPunch || 0) - dt * 2.4);
    const punch = Math.sin(Math.min(1, G.camPunch) * Math.PI * 0.5);
    const back = 250 * far * (1 - 0.22 * punch), height = 450 * far * (1 - 0.22 * punch);
    const cx = G.camF.x - fwx * back, cy = G.camF.y - fwy * back, cz = G.camF.z + height + G.camDip;
    const sk = shakeOn ? G.shake : 0;
    const dx = G.camF.x - cx, dy = G.camF.y - cy, dz = G.camF.z - cz, L = Math.hypot(dx, dy, dz);
    G.cam = { x: cx, y: cy, z: cz, d: { x: dx / L, y: dy / L, z: dz / L } };
    G.camClose = false;
    R3.setCamera(cx + (Math.random() - 0.5) * sk, cy + (Math.random() - 0.5) * sk, cz + (Math.random() - 0.5) * sk, G.camF.x, G.camF.y, G.camF.z, 46 - 6 * punch);
    if (!me) return;
    // 瞄准：电脑用鼠标在地面上的位置；手机用攻击摇杆
    const alive = me.flags & 1;
    const range = me.flags & 512 ? S.PISTOL.range : S.weaponRange(me.weapon);
    if (TT.on) {
      if (TT.aiming) {
        // 屏幕上推 = 朝敌方前进方向，右推 = 屏幕右侧
        const wa = yaw + Math.atan2(TT.ax, -TT.ay);
        const d = Math.max(40, TT.ak * (TT.superAim ? superRange(me) : range));
        G.aimPt = { x: me.px + Math.cos(wa) * d, y: me.py + Math.sin(wa) * d };
      } else if (performance.now() < TT.keepUntil) {
        // 刚松开摇杆：保持这一发的瞄准方向
      } else if (!G.aimPt || Math.hypot(me.pvx, me.pvy) > 30) {
        const ma = Math.hypot(me.pvx, me.pvy) > 30 ? Math.atan2(me.pvy, me.pvx) : yaw;
        G.aimPt = { x: me.px + Math.cos(ma) * 150, y: me.py + Math.sin(ma) * 150 };
      }
    } else {
      const r = R3.screenRay(mouse.x, mouse.y);
      if (r && r.dz < -0.05) {
        const pz = me.pz + 12, t = (pz - r.z) / r.dz;
        G.aimPt = { x: r.x + r.dx * t, y: r.y + r.dy * t };
      }
    }
    if (G.aimPt && alive) {
      if (G.aimLock && performance.now() > G.aimLockUntil) G.aimLock = null;
      const tgt = G.aimLock && G.players.get(G.aimLock);
      G.aim = tgt ? aimToPoint(tgt.x, tgt.y, (tgt.z || 0) + 16) : aimToPoint(G.aimPt.x, G.aimPt.y);
      G.aimPoint = { x: G.aimPt.x, y: G.aimPt.y, z: S.topAt(G.M, G.aimPt.x, G.aimPt.y), L: G.aim.d };
    }
  }
  function superRange(me) {
    const sp = S.WEAPONS[me.weapon].special;
    return { beam: 900, barrage: 440, quake: 280, charge: 300, bulldoze: 430, napalm: 430 }[sp] || 300;
  }
  function updateCamera(dt) {
    if (TOP()) return updateCameraTop(dt);
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
    if (TUT) tutTick();
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
      st.team = me.team; st.sm = me.sm; st.foot = !!(me.flags & 512);
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
    computeAimShow();
    G.inp = readInput();
    if (me && !G.over) {
      G.sendAcc += dt;
      if (G.sendAcc >= 1 / 30 || G.edge) {
        G.sendAcc = 0; G.edge = false;
        const r3 = (v) => Math.round(v * 1000) / 1000, r1 = (v) => Math.round(v * 10) / 10;
        send({ t: 'in', mx: r3(inp.mx), my: r3(inp.my), a: r3(G.inp.a), pt: r3(G.inp.pt), f: inp.f, w: inp.w, qq: G.qq, gq: G.gq, aq: G.aq, oq: G.oq || 0, ad: Math.round(G.inp.ad || 200),
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
      if (ready && G.spReady === false && alive) { sfx.ready(); bigText(TOUCH ? '大招就绪！' : '大招就绪！按 E 发动', '#fff36b'); }
      G.spReady = ready;
      if (alive && inp.f && me.ammo < 0.3 && G.cd <= 0 && !(me.flags & 512)) sfx.lowInk();
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
      if (t > 3.2 || (pr.ghost ? t > pr.ts : q.z < gh - 1)) { killProj(pr, q.x, q.y, gh < 1e3 ? Math.max(gh, q.z) : q.z); continue; }
      pr.x = q.x; pr.y = q.y; pr.z = q.z;
      if (pr.fx && pr.fx.rare >= 4 && Math.random() < 0.6) R3.emit(q.x, q.y, q.z, pr.fx.fx.cols[(Math.random() * pr.fx.fx.cols.length) | 0], 1, 10, 1, { sys: 'pg', size: 7, life: 0.3, grav: 0, drag: 2 });   // 传说：子弹拖尾
    }
    for (const [id, b] of G.bombs) { S.stepBomb(b, dt, G.M); b.life += dt; if (b.life > 5) G.bombs.delete(id); }
    if (G.fires) {
      G.fires = G.fires.filter((f) => now < f.end);
      for (const f of G.fires) {
        f.acc += dt;
        while (f.acc > 0.03) {
          f.acc -= 0.03;
          const a = Math.random() * 6.283, rr2 = Math.sqrt(Math.random()) * f.r;
          R3.emit(f.x + Math.cos(a) * rr2, f.y + Math.sin(a) * rr2, f.z + 4, Math.random() < 0.5 ? '#ff7a2e' : G.colors[f.team], 1, 30, 1, { sys: 'pg', size: 16, life: 0.5, grav: -140, drag: 1.5, grow: -0.5 });
        }
      }
    }
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
      p.hp = pb[4]; p.ammo = pb[5] / 100; p.tank = pb[5] / 3; p.sp = pb[6]; p.flags = pb[7]; p.resp = pb[8] / 10; p.carry = pb[9];
      p.maxHp = pb[20] || 100; p.buffs = pb[23] || 0;
      p.charge = pb[11] / 100; p.shield = pb[12]; p.vx = pb[14]; p.vy = pb[15]; p.spk = pb[16]; p.vz = pb[19] || 0;
    }
    G.obj = b.o; G.objA = a.o; G.objK = k; G.helpers = b.h || [];
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
    // 头顶：名字 + 血条（自己再加弹药格），弹出的驾驶员显示重建倒计时
    for (const id of G.cur) {
      const p = G.players.get(id);
      if (!p || !(p.flags & 1)) continue;
      const self = id === myId;
      const enemy = me && p.team !== me.team;
      if (enemy && !visibleEnemy(p)) continue;
      const px = self ? me.px : p.x, py = self ? me.py : p.y, pz = self ? me.pz : (p.z || 0);
      if (!TOP() && enemy) {
        const seen = c && S.los3(G.M, c.x, c.y, c.z, px, py, pz + 30);
        if (!seen || Math.hypot(px - c.x, py - c.y) > 900) continue;
      }
      if (!TOP() && self) continue;
      const foot = p.flags & 512;
      const s = R3.project(px, py, pz + (foot ? 34 : 52));
      if (!s) continue;
      const col = G.colors[p.team];
      const hpMax = (self ? me.maxHp : p.maxHp) || 100, hp = Math.max(0, self ? me.hp : p.hp);
      const w = self ? 58 : 46, h = self ? 8 : 6, x0 = s.x - w / 2, y0 = s.y;
      txt(self ? (foot ? '驾驶员' : '你') : p.name, s.x, y0 - 10, self ? 13 : 12, self ? '#fff' : col, 'center', 3);
      ctx.fillStyle = '#000c'; rr(ctx, x0 - 2, y0 - 2, w + 4, h + 4, 4); ctx.fill();
      ctx.fillStyle = self ? (hp / hpMax > 0.35 ? '#6dff8a' : '#ff5a6a') : enemy ? (hp / hpMax > 0.35 ? '#ff5a6a' : '#ff9a3a') : '#4fc3ff';
      rr(ctx, x0, y0, w * Math.min(1, hp / hpMax), h, 3); ctx.fill();
      if ((self ? me.shield : p.shield) > 0) { ctx.fillStyle = '#bef6ffcc'; ctx.fillRect(x0, y0, Math.min(w, (w * (self ? me.shield : p.shield)) / hpMax), 3); }
      if (self) {
        txt(String(Math.ceil(hp)), x0 - 6, y0 + h / 2, 11, '#fff', 'right', 3);
        // 弹药格
        const am = me.ammo == null ? 3 : me.ammo, sw = (w - 4) / 3;
        for (let i = 0; i < 3; i++) {
          const f = Math.max(0, Math.min(1, am - i));
          ctx.fillStyle = '#000c'; ctx.fillRect(x0 + i * (sw + 2), y0 + h + 4, sw, 5);
          ctx.fillStyle = f >= 1 ? '#ffae2e' : '#c77a22'; ctx.fillRect(x0 + i * (sw + 2), y0 + h + 4, sw * f, 5);
        }
      }
      if (p.flags & 256 && !foot) { ctx.strokeStyle = '#ffdf2e'; ctx.lineWidth = 2; rr(ctx, x0 - 4, y0 - 4, w + 8, h + 8, 5); ctx.stroke(); }
      if (foot) {
        const t = self ? me.resp : p.resp;
        txt(`🔧 ${Math.max(0, t).toFixed(1)}s`, s.x, y0 + h + (self ? 18 : 10), 11, '#ffdf2e', 'center', 3);
      }
      const bf = self ? me.buffs : p.buffs;
      if (bf) {
        const icons = []; if (bf & 1) icons.push('⚡'); if (bf & 2) icons.push('🐢'); if (bf & 4) icons.push('🚫'); if (bf & 16) icons.push('🔥');
        if (icons.length) txt(icons.join(''), s.x + w / 2 + 12, y0 + 2, 12, '#fff', 'left', 0);
      }
      const ch = G.chats.get(id);
      if (ch && !self) {
        const age = now - ch.t;
        if (age > 2500) G.chats.delete(id);
        else txt(S.QUICK_CHAT[ch.k], s.x, y0 - 28, 15, '#fff', 'center', 4);
      }
    }
    // 伤害数字
    G.dmgTexts = G.dmgTexts.filter((t) => now - t.t < 800);
    for (const t of G.dmgTexts) {
      const p = G.players.get(t.id); if (!p) continue;
      const self = t.id === myId;
      const k = (now - t.t) / 800;
      const sc = R3.project(self ? me.px : p.x, self ? me.py : p.y, (self ? me.pz : p.z || 0) + 60 + k * 30);
      if (!sc) continue;
      ctx.globalAlpha = 1 - k * k;
      txt(t.text, sc.x + t.dx, sc.y, 18 + (1 - k) * 6, t.color, 'center', 4);
      ctx.globalAlpha = 1;
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
  // 喷漆色块（边缘不规则的圆）
  function splat(x, y, rx, ry, color, seed) {
    ctx.save(); ctx.fillStyle = color; ctx.strokeStyle = '#141018'; ctx.lineWidth = 3;
    ctx.beginPath();
    for (let i = 0; i <= 24; i++) {
      const a = (i / 24) * Math.PI * 2, w = 1 + 0.08 * Math.sin(a * 5 + seed) + 0.05 * Math.sin(a * 9 + seed * 2);
      const px = x + Math.cos(a) * rx * w, py = y + Math.sin(a) * ry * w;
      if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
    }
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillRect(x - rx * 0.5, y + ry * 0.7, 4, 10); ctx.fillRect(x + rx * 0.35, y + ry * 0.75, 3, 7);
    ctx.restore();
  }
  function txt(s, x, y, size, color, align = 'center', stroke = 4) {
    ctx.font = `${size}px GBHead, "Microsoft YaHei", sans-serif`; ctx.textAlign = align; ctx.textBaseline = 'middle';
    if (stroke) { ctx.lineWidth = stroke; ctx.strokeStyle = '#000'; ctx.lineJoin = 'round'; ctx.strokeText(s, x, y); }
    ctx.fillStyle = color; ctx.fillText(s, x, y);
  }
  function updateMini() {
    const d = G.miniImg.data, grid = G.grid, solid = G.M.solid, top = G.M.top;
    const c1 = hexRgb(G.colors[1]), c2 = hexRgb(G.colors[2]), cx8 = G.colors.map((c) => (c ? hexRgb(c) : null));
    let a = 0, b = 0;
    for (let i = 0; i < grid.length; i++) {
      let r, g, bl;
      if (solid[i]) { r = 90; g = 96; bl = 125; }
      else if (grid[i] === 1) { [r, g, bl] = c1; a++; }
      else if (grid[i] === 2) { [r, g, bl] = c2; b++; }
      else if (grid[i] > 2 && cx8[grid[i]]) [r, g, bl] = cx8[grid[i]];
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
    // 大招白闪 + 速度线
    if (G.flashT && now - G.flashT < 260) { ctx.fillStyle = `rgba(255,255,255,${0.55 * (1 - (now - G.flashT) / 260)})`; ctx.fillRect(0, 0, VW, VH); }
    const wheelFast = TOP() && me && G.inp && G.inp.w && Math.hypot(me.pvx || 0, me.pvy || 0) > 280;
    if ((G.speedLines && now - G.speedLines < 700) || wheelFast) {
      const k = wheelFast && !(G.speedLines && now - G.speedLines < 700) ? 0.25 : 1 - (now - G.speedLines) / 700;
      ctx.save(); ctx.strokeStyle = `rgba(255,255,255,${0.5 * k})`; ctx.lineCap = 'round';
      const R0 = Math.min(VW, VH) * 0.42, R1 = Math.hypot(VW, VH) * 0.6;
      for (let i = 0; i < 46; i++) {
        const a = (i / 46) * Math.PI * 2 + ((now / 40) | 0) * 0.37, r0 = R0 + ((i * 53) % 90);
        ctx.lineWidth = 2 + (i % 3) * 2;
        ctx.beginPath(); ctx.moveTo(VW / 2 + Math.cos(a) * r0, VH / 2 + Math.sin(a) * r0); ctx.lineTo(VW / 2 + Math.cos(a) * R1, VH / 2 + Math.sin(a) * R1); ctx.stroke();
      }
      ctx.restore();
    }
    // 义眼扫描：敌人头顶显示标记（隔着墙和草丛也能看到）
    if (G.scanUntil && now < G.scanUntil && me) {
      for (const id of G.cur) {
        const p = G.players.get(id);
        if (!p || !(p.flags & 1) || p.team === me.team) continue;
        const sc = R3.project(p.x, p.y, (p.z || 0) + 70);
        if (!sc) continue;
        ctx.strokeStyle = '#7af0ff'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.ellipse(sc.x, sc.y, 13, 8, 0, 0, 7); ctx.stroke();
        ctx.fillStyle = '#7af0ff'; ctx.beginPath(); ctx.arc(sc.x, sc.y, 4, 0, 7); ctx.fill();
      }
    }

    // ---- 顶部：计时与队伍 ----
    const cx = VW / 2;
    // 计时器：一团喷漆色块
    splat(cx, 33, 64, 26, G.tl <= 30 && G.tl > 0 ? '#ff3b52' : '#141018', 7);
    ctx.font = '32px GBNum, GBHead, Impact, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = 5; ctx.strokeStyle = '#141018'; ctx.strokeText(fmtTime(G.tl), cx, 35);
    ctx.fillStyle = G.tl <= 30 && G.tl > 0 && Math.floor(now / 400) % 2 ? '#ffe600' : '#fff'; ctx.fillText(fmtTime(G.tl), cx, 35);
    const roster = (t) => [...G.players.values()].filter((p) => p.team === t && G.cur.has(p.id));
    const chips = (t, side) => {
      const list = roster(t);
      list.forEach((p, i) => {
        const x = side < 0 ? cx - 92 - i * 40 : cx + 92 + i * 40, y = 33;
        const aliveP = p.flags & 1, col = G.colors[t];
        // 驾驶员头像（弹出时变小并显示扳手，倒下时变灰）
        const img = faceImg(p.pilot), foot = p.flags & 512;
        ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y, 17, 0, 7); ctx.fill();
        ctx.save(); ctx.beginPath(); ctx.arc(x, y, 15, 0, 7); ctx.clip();
        if (!aliveP) ctx.filter = 'grayscale(1) brightness(.5)';
        if (img.complete && img.naturalWidth) ctx.drawImage(img, x - 15, y - 15, 30, 30); else { ctx.fillStyle = '#333645'; ctx.fillRect(x - 15, y - 15, 30, 30); }
        ctx.restore(); ctx.filter = 'none';
        ctx.strokeStyle = p.id === myId ? '#fff' : '#000'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(x, y, 17, 0, 7); ctx.stroke();
        if (aliveP && p.flags & 256) { ctx.strokeStyle = '#fff36b'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y, 21 + Math.sin(now / 150) * 1.5, 0, 7); ctx.stroke(); }
        if (!aliveP) txt(p.resp > 500 ? '✖' : String(Math.ceil(p.resp)), x, y + 1, 15, p.resp > 500 ? '#ff3b52' : '#fff', 'center', 3);
        else if (foot) txt('🔧', x + 11, y + 11, 11, '#fff', 'center', 0);
      });
    };
    if (G.teams > 2) {
      const ob = G.obj || [];
      splat(cx - 150, 33, 76, 20, '#141018', 3); splat(cx + 150, 33, 76, 20, '#141018', 5);
      txt(`存活 ${ob[8] || 0} 队 · ${ob[9] || 0} 人`, cx - 150, 34, 16, '#fff', 'center', 3);
      txt(ob[6] === 1 ? '毒圈收缩中！' : ob[6] === 2 ? '最终圈' : `${ob[7] || 0} 秒后缩圈`, cx + 150, 34, 16, ob[6] === 1 ? '#ff5a36' : '#fff', 'center', 3);
      if (me) { ctx.fillStyle = G.colors[me.team]; ctx.beginPath(); ctx.arc(cx - 232, 34, 9, 0, 7); ctx.fill(); txt(G.mode === 'escape8' ? '你' : S.TEAM8_NAMES[me.team], cx - 232, 56, 12, G.colors[me.team], 'center', 3); }
    } else { chips(myTeam, -1); chips(otherTeam, 1); }

    // ---- 模式面板 ----
    const o = G.obj;
    const py = 74;
    if (G.mode === 'elim' && o) {
      const mine = myTeam === 2 ? o[1] : o[0], theirs = myTeam === 2 ? o[0] : o[1];
      for (let i = 0; i < S.ELIM.wins; i++) {
        ctx.fillStyle = i < mine ? G.colors[myTeam] : '#0008'; ctx.beginPath(); ctx.arc(cx - 30 - i * 22, py, 8, 0, 7); ctx.fill(); ctx.strokeStyle = '#000'; ctx.lineWidth = 2; ctx.stroke();
        ctx.fillStyle = i < theirs ? G.colors[otherTeam] : '#0008'; ctx.beginPath(); ctx.arc(cx + 30 + i * 22, py, 8, 0, 7); ctx.fill(); ctx.stroke();
      }
      txt(`第 ${o[2]} 局`, cx, py, 14, '#fff', 'center', 3);
      if (o[3] > 0) txt('下一局马上开始…', cx, VH * 0.3, 26, '#ffdf2e', 'center', 5);
    }
    if (G.teams > 2 && o) {
      const ph = o[6], stg = ph === 2 ? '最终圈' : ph === 1 ? '毒圈正在收缩' : `安全区（${o[7]} 秒后收缩）`;
      txt(stg, cx, py, 14, ph === 1 ? '#ff8a5a' : '#fff', 'center', 3);
      if (me && G.me && Math.hypot(G.me.px - o[0], G.me.py - o[1]) > o[2] && (me.flags & 1)) txt('⚠ 你在毒圈外！快回安全区', cx, VH * 0.26, 24, '#ff5a36', 'center', 5);
    }
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
        ? ['左半屏：摇杆移动 · 「攻击」拖动瞄准、松手发射，点一下自动瞄准', '「大招」充满后同样拖动瞄准 · 「技能」每局 3 次', '机体被摧毁后驾驶员会弹出：活下来就能原地空投新机体']
        : TOP() ? ['WASD 移动 · 鼠标瞄准 · 左键攻击（消耗 1 格弹药）', 'E / 右键 大招（打中敌人充能）· Q 驾驶员技能 · 空格 跳跃', 'Shift 滚轮：己方涂料上加速、隐身、装填更快 · 躲进草丛敌人看不见你']
        : ['WASD 移动 · 鼠标转视角 · 左键攻击 · 空格跳跃', 'Shift 变滚轮：己方涂料上加速、隐身、装填更快', 'E/右键 大招 · Q 驾驶员技能 · R 超载 · 1-4 快捷语音 · Tab 记分板 · Esc 暂停'];
      lines.forEach((l, i) => txt(l, 12, (TOUCH ? 190 : 230) + i * 20, 13, '#dfe1ee', 'left', 3));
      ctx.globalAlpha = 1;
    }

    // ---- 技能面板（电脑：右下；手机由按钮显示）+ 驾驶员弹出提示 ----
    if (me) {
      const W = S.WEAPONS[me.weapon], foot = me.flags & 512;
      const P = S.pilot(me.pilot);
      if (!TOUCH) {
        const bx = VW - 70, by = VH - 70;
        const ring = (x, y, r, k, color, label, key, ready, dim) => {
          ctx.fillStyle = dim ? '#0008' : '#000b'; ctx.beginPath(); ctx.arc(x, y, r + 5, 0, 7); ctx.fill();
          ctx.strokeStyle = '#ffffff22'; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.stroke();
          ctx.strokeStyle = color; ctx.beginPath(); ctx.arc(x, y, r, -Math.PI / 2, -Math.PI / 2 + Math.max(0, Math.min(1, k)) * Math.PI * 2); ctx.stroke();
          if (ready) { ctx.strokeStyle = '#fff36b'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y, r + 7 + Math.sin(now / 150) * 1.5, 0, 7); ctx.stroke(); }
          txt(label, x, y - 2, r > 30 ? 16 : 13, dim ? '#777' : '#fff', 'center', 3);
          txt(key, x, y + r + 16, 11, '#9a9db5', 'center', 3);
        };
        const am = me.ammo == null ? 3 : me.ammo;
        ring(bx, by, 40, am / 3, '#ffae2e', foot ? '手枪' : W.short, '左键 · ' + Math.floor(am) + '/3');
        const spk = foot ? 0 : Math.min(1, me.sp / W.spNeed);
        ring(bx - 104, by + 6, 32, spk, '#ffdf2e', foot ? '—' : '大招', 'E / 右键', spk >= 1 && !foot, !!foot);
        const sk = S.SKILLS[P.skill], uses = me.skUses == null ? 3 : me.skUses;
        ring(bx - 186, by + 12, 26, me.skCd > 0 ? 1 - me.skCd / S.SKILL_CD : 1, P.accent, sk.short, `Q · 剩 ${uses}`, false, uses <= 0);
        if (me.ovOn) {
          const used = me.ovUsed && !(me.ovT > 0);
          ring(bx - 258, by + 16, 24, me.ovT > 0 ? me.ovT / (S.OV_TIME + 2) : used ? 0 : me.ovk, '#b78cff', me.ovT > 0 ? me.ovT.toFixed(0) + '秒' : '超载', used ? 'R · 已用' : 'R', !me.ovUsed && me.ovk >= 1, used);
        }
        txt('空格 跳跃 · Shift 滚轮', bx - 70, by - 64, 11, '#9a9db5', 'center', 3);
      }
      if (foot && alive) {
        const t = Math.max(0, me.resp);
        ctx.fillStyle = '#000b'; rr(ctx, VW / 2 - 170, VH - 96, 340, 44, 12); ctx.fill();
        ctx.fillStyle = '#ffdf2e'; rr(ctx, VW / 2 - 160, VH - 62, 320 * (1 - t / S.REBUILD), 4, 2); ctx.fill();
        txt(`驾驶员弹出！活下去 —— 新机体 ${t.toFixed(1)} 秒后就地空投`, VW / 2, VH - 80, 15, '#fff', 'center', 0);
      }
      if (me.carry) txt(`携带电池 ×${me.carry}（送回充电站）`, VW / 2, VH - 120, 14, '#b8ff3a', 'center', 3);
    }

    // ---- 小地图 ----
    const mw = TOUCH ? 132 : small ? 150 : 190, mh = (mw * S.GH) / S.GW, mx = VW - mw - 14, my = 14;
    ctx.fillStyle = '#000c'; rr(ctx, mx - 5, my - 5, mw + 10, mh + 10, 10); ctx.fill();
    ctx.imageSmoothingEnabled = false; ctx.drawImage(G.mini, mx, my, mw, mh); ctx.imageSmoothingEnabled = true;
    const ms = mw / S.W;
    if (o && G.mode === 'escort' && !o[5]) { ctx.fillStyle = '#ffd23f'; ctx.beginPath(); ctx.arc(mx + o[0] * ms, my + o[1] * ms, 5, 0, 7); ctx.fill(); ctx.strokeStyle = '#000'; ctx.lineWidth = 1.5; ctx.stroke(); }
    if (o && G.mode === 'soccer') { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(mx + o[0] * ms, my + o[1] * ms, 5, 0, 7); ctx.fill(); ctx.strokeStyle = '#000'; ctx.lineWidth = 1.5; ctx.stroke(); }
    if (o && G.mode === 'battery') { ctx.fillStyle = '#b8ff3a'; const f = o[2]; for (let i = 0; i < f.length; i += 4) ctx.fillRect(mx + f[i + 1] * ms - 1.5, my + f[i + 2] * ms - 1.5, 3, 3); }
    if (o && G.teams > 2) {
      ctx.save(); ctx.beginPath(); ctx.rect(mx, my, mw, mh); ctx.clip();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(mx + o[3] * ms, my + o[4] * ms, o[5] * ms, 0, 7); ctx.stroke();
      ctx.strokeStyle = '#ff5a36'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(mx + o[0] * ms, my + o[1] * ms, o[2] * ms, 0, 7); ctx.stroke();
      ctx.fillStyle = '#ffe600'; const f = o[10] || []; for (let i = 0; i < f.length; i += 4) ctx.fillRect(mx + f[i + 1] * ms - 2, my + f[i + 2] * ms - 2, 4, 4);
      ctx.restore();
    }
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
        ctx.save(); ctx.translate(cx, VH * 0.3); ctx.rotate(-0.05);
        txt(G.big.text, 5, 6, 36 * s, '#141018', 'center', 8);
        txt(G.big.text, 0, 0, 36 * s, G.big.color, 'center', 7);
        ctx.restore();
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
      if (me.resp > 500) txt(G.mode === 'elim' ? '出局！等待下一局' : '你被淘汰了 · 观战中', cx, VH * 0.42, 40, '#fff', 'center', 6);
      else txt(`重新部署 ${Math.max(0, me.resp).toFixed(1)}s`, cx, VH * 0.42, 40, '#fff', 'center', 6);
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

    // ---- 准星：俯视模式跟着鼠标，触屏不显示 ----
    if (TOP() && TOUCH) return;
    const chx = TOP() ? mouse.x : VW / 2, chy = TOP() ? mouse.y : VH / 2;
    if (!TOP() && !TOUCH && !locked() && !G.over && $('settingsDlg').classList.contains('hidden')) {
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
    for (const t of teamOrder(myTeam)) {
      for (const p of rows.filter((q) => q.team === t)) {
        const sb = G.sb.get(p.id) || [0, 0, 0, 0];
        txt((p.bot ? 'AI · ' : '') + p.name + (p.id === myId ? '（你）' : ''), cols[0], ry, 14, G.colors[t], 'left', 0);
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
    const multi = (r.teams || 2) > 2;
    const cs = multi ? S.TEAM8 : S.COLOR_SETS[r.colorSet].c;
    const tName = (t) => (multi ? S.TEAM8_NAMES[t] : S.TEAM_NAMES[t]);
    G = null;
    touchShow(false);
    if (document.exitPointerLock && locked()) document.exitPointerLock();
    setTimeout(menuMusic, 2500);
    $('results').classList.remove('hidden');
    showScreen('game');
    const won = r.winner === myTeam, draw = !r.winner;
    const title = $('resTitle');
    const rank = r.place && meRow ? r.place.indexOf(myTeam) + 1 : 0;
    title.textContent = rank ? (rank === 1 ? '大 吉 大 利 ！' : `第 ${rank} 名`) : !meRow ? `${tName(r.winner) || '平局'} 胜利` : draw ? '平 局' : won ? '胜 利 ！' : '惜 败 …';
    title.style.color = draw ? '#fff' : cs[r.winner];
    const reason = { ko: '提前决胜', time: '时间到', turf: '比分相同，按涂地面积判定' }[r.reason] || '';
    $('resSub').textContent = `${S.MODES[r.mode].name} · ${S.MAPS[r.map].name} · ${reason}`;
    const A = $('resA'), B = $('resB');
    A.parentElement.classList.toggle('hidden', multi);
    A.style.background = cs[myTeam]; B.style.background = cs[3 - myTeam];
    A.style.width = '0'; B.style.width = '0';
    const pa = r.turf[myTeam - 1], pb = r.turf[3 - myTeam - 1];
    A.textContent = `${(pa * 100).toFixed(1)}%`; B.textContent = `${(pb * 100).toFixed(1)}%`;
    setTimeout(() => { A.style.width = pa * 100 + '%'; B.style.width = pb * 100 + '%'; }, 60);
    let score = '';
    if (r.place) score = `名次　${r.place.map((t, i) => `${i + 1}. ${multi && r.mode === 'escape8' ? (r.players.find((p) => p.team === t) || {}).name : tName(t)}`).join('　')}`;
    else if (r.rounds) score = `回合　${r.rounds[myTeam]} : ${r.rounds[3 - myTeam]}`;
    else if (r.mode === 'zone') score = `剩余倒计时　${r.count[myTeam]} : ${r.count[3 - myTeam]}`;
    else if (r.mode !== 'turf') score = `比分　${r.score[myTeam]} : ${r.score[3 - myTeam]}`;
    $('resScore').textContent = score;
    // MVP
    const val = (p) => p.kills * 100 + p.paint + p.obj * 150;
    const mvp = S.mvpOf(r);
    const objLabel = { escort: '得分', battery: '电池' }[r.mode] || '—';
    $('resBack').textContent = quickRoom ? '返回大厅' : '返回房间';
    let html = `<tr><th style="text-align:left">驾驶员</th><th>机体</th><th>击毁</th><th>倒下</th><th>涂地</th>${objLabel !== '—' ? `<th>${objLabel}</th>` : ''}</tr>`;
    for (const t of r.place || [myTeam, 3 - myTeam]) {
      for (const p of r.players.filter((q) => q.team === t).sort((a, b) => val(b) - val(a))) {
        html += `<tr class="${p.id === myId ? 'me' : ''}"><td style="color:${cs[t]}">${esc(p.name)}${p.bot ? '<small class="aitag">AI</small>' : ''}${mvp && p.id === mvp.id ? '<span class="mvp">★MVP</span>' : ''}</td><td>${S.WEAPONS[p.weapon].name}</td><td>${p.kills}</td><td>${p.deaths}</td><td>${p.paint}</td>${objLabel !== '—' ? `<td>${p.obj}</td>` : ''}</tr>`;
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
    // 经验 / 奖杯：在线账号由服务器结算（防止改本地数据刷分），其余在本机结算
    pendingReward = null;
    if (meRow) {
      const rw = S.matchReward(r, myId);
      if (session && session.kind === 'online') {
        if (onlineReady) { pendingReward = { trBefore: profile.trophies || 0, lvBefore: level(), t: performance.now() }; $('resXp').textContent = '服务器结算中…'; }
        else $('resXp').textContent = '没有连上账号服务器，这局不计入战绩';
      } else {
        const res = E.applyMatch(profile, rw);
        saveProfile();
        showReward(rw, res.trBefore, res.lvBefore, res.items);
      }
    } else $('resXp').textContent = '';
  }
  function showReward(rw, trBefore, lvBefore, items) {
    const after = level();
    let msg = `${rw.trophies >= 0 ? '+' : ''}${rw.trophies} 🏆（共 ${profile.trophies}）　+${rw.xp} XP`;
    for (const it of items || []) if (E.CUR[it.k]) msg += `　+${it.n} ${E.CUR[it.k].name}${it.why ? `（${it.why}）` : ''}`;
    const px = (items || []).filter((it) => it.k === 'passxp').reduce((a, b) => a + b.n, 0);
    if (px) msg += `　+${px} 通行证经验`;
    const qs = (items || []).filter((it) => it.k === 'passxp' && it.why && it.why.includes('任务'));
    if (qs.length) msg += `　✔ 完成任务：${qs.map((q) => q.why.split('：')[1]).join('、')}`;
    if (after > lvBefore) msg += `　🎉 升级到 Lv.${after}！`;
    const un = S.HEADS.filter((h) => h.tr > trBefore && h.tr <= profile.trophies).map((h) => h.name);
    if (un.length) msg += `　解锁头部涂装：${un.join('、')}`;
    $('resXp').textContent = msg;
    renderProfile(); renderHeads(); sendLoadout();
  }

  // ================= 养成：货币 / 宝箱 / 升级 / 突破 =================
  // 本机账号和游客直接在浏览器里执行规则；在线账号把操作发给服务器，由服务器开箱、扣钱，再把新资料发回来
  let ecoReq = 0;
  const ecoWait = new Map();
  function eco(op, args) {
    args = args || {};
    if (session && session.kind === 'online') {
      if (!onlineReady) return Promise.resolve({ ok: false, err: '没有连上账号服务器，暂时不能操作' });
      const req = ++ecoReq;
      return new Promise((res) => {
        const t = setTimeout(() => { ecoWait.delete(req); res({ ok: false, err: '服务器没有回应，请稍后再试' }); }, 8000);
        ecoWait.set(req, (m) => { clearTimeout(t); res(m); });
        send(Object.assign({ t: 'eco', op, req }, args));
      });
    }
    const r = E.apply(profile, op, args);
    if (r.ok) { saveProfile(); afterEco(); }
    return Promise.resolve(r);
  }
  function onEco(m) {
    if (m.ok && m.profile && session && session.kind === 'online') applyServerProfile(m.profile);
    const cb = ecoWait.get(m.req);
    if (cb) { ecoWait.delete(m.req); cb(m); }
  }
  function afterEco() { renderProfile(); renderPilots(); renderWallet(); renderChests(); renderTalents(); renderPass(); renderShop(); if (!$('ov-mechs').classList.contains('hidden')) renderWeaponLists(); sendLoadout(); }
  const fmtN = (n) => (n >= 100000 ? Math.floor(n / 1000) + 'k' : String(n));
  const cur = (k, n, cls) => `<span class="cur cur-${k} ${cls || ''}">${ic(k)}<b>${fmtN(n)}</b></span>`;
  function renderWallet() {
    const html = ['coins', 'gems', 'parts', 'crystals'].map((k) => cur(k, profile[k] || 0)).join('');
    for (const id of ['wallet', 'wallet2', 'wallet3']) { const el = $(id); if (el) el.innerHTML = html; }
    const n = Object.values(profile.chests || {}).reduce((a, b) => a + b, 0), badge = $('chestBadge');
    if (badge) { badge.textContent = n; badge.classList.toggle('hidden', !n); }
    const t = $('sideChestTxt'); if (t) t.textContent = n ? `有 ${n} 个宝箱没开` : '商店 · 兑换';
  }
  function showInfo(title, html) {
    $('infoTitle').textContent = title; $('infoBody').innerHTML = html;
    $('infoDlg').classList.remove('hidden');
  }
  function oddsHtml(cid) {
    const C = E.CHESTS[cid];
    return `<p class="odds-sub">${C.desc}。每一项单独判定，概率公开，没有保底；角色和机体只会开出你还没有的，全部拥有后换成 ${C.dup} 金币。</p>
      <table class="odds">${E.odds(cid).map((o) => `<tr><td>${ic(o.k === 'pilot' ? 'pilot' : o.k === 'mech' ? 'mech' : o.k)}</td><td>${o.name}</td><td><b>${+(o.p * 100).toFixed(1)}%</b></td></tr>`).join('')}</table>`;
  }
  function renderChests() {
    const my = $('myChests');
    if (!my) return;
    const owned = Object.entries(profile.chests || {}).filter(([, n]) => n > 0);
    my.innerHTML = owned.length ? '' : '<p class="empty-note">还没有宝箱。宝箱来自新手教程、商店，以及第一赛季通行证（即将上线）。</p>';
    for (const [cid, n] of owned) {
      const C = E.CHESTS[cid], el = document.createElement('div');
      el.className = 'chest-card t' + C.tier;
      el.innerHTML = `<div class="cc-art">${GI.chestArt(cid)}</div><b>${C.name}</b><small>×${n}</small><button class="btn small">打开</button>`;
      el.querySelector('button').onclick = () => openChestFlow(cid, 'open');
      my.appendChild(el);
    }
    const shop = $('shopChests');
    shop.innerHTML = '';
    for (const cid of E.CHEST_ORDER) {
      const C = E.CHESTS[cid], el = document.createElement('div');
      el.className = 'chest-card t' + C.tier;
      el.innerHTML = `<div class="cc-art">${GI.chestArt(cid)}</div><b>${C.name}</b><small>${C.desc}</small>
        <button class="btn small buy" ${profile.gems < C.price ? 'disabled' : ''}>${ic('gems')}${C.price}</button><button class="odds-btn">概率</button>`;
      el.querySelector('.buy').onclick = () => openChestFlow(cid, 'buy');
      el.querySelector('.odds-btn').onclick = () => { showInfo(`${C.name} · 开出概率`, oddsHtml(cid)); sfx.click(); };
      shop.appendChild(el);
    }
    const xl = $('exchangeList');
    xl.innerHTML = '';
    for (const [id, X] of Object.entries(E.EXCHANGE)) {
      const [gk, gv] = Object.entries(X.give)[0];
      const el = document.createElement('div');
      el.className = 'xchg';
      el.innerHTML = `<div class="x-ico">${ic(gk)}</div><div><b>${X.name}</b><small>${X.gems} 宝石 → ${gv} ${E.CUR[gk].name}</small></div>
        <button class="btn small" data-n="1" ${profile.gems < X.gems ? 'disabled' : ''}>×1</button><button class="btn small" data-n="5" ${profile.gems < X.gems * 5 ? 'disabled' : ''}>×5</button>`;
      for (const b of el.querySelectorAll('button')) b.onclick = async () => {
        const r = await eco('exchange', { what: id, n: +b.dataset.n });
        if (!r.ok) return toast(r.err);
        sfx.pick(); toast(`兑换成功：+${r.items[0].n} ${E.CUR[r.items[0].k].name}`);
      };
      xl.appendChild(el);
    }
  }
  // ---------------- 赛季通行证 ----------------
  const rewardLabel = (it) => it.k === 'chest' ? E.CHESTS[it.id].name : it.k === 'skin' ? S.skin(it.id).name : it.k === 'tp' ? `天赋点 +${it.n}` : `${E.CUR[it.k].name} ×${it.n}`;
  function rewardArt(it) {
    if (it.k === 'chest') return GI.chestArt(it.id);
    if (it.k === 'tp') return ic('star');
    if (it.k === 'skin') return skinArt(S.skin(it.id), true);
    return ic(it.k);
  }
  function renderPass() {
    const lv = E.passLevel(profile), ps = profile.pass, max = E.PASS.tiers * E.PASS.xpPer;
    const inTier = ps.xp >= max ? E.PASS.xpPer : ps.xp % E.PASS.xpPer;
    const claimable = []; for (let t = 1; t <= lv; t++) { if (!ps.cf.includes(t)) claimable.push(t); if (ps.prem && !ps.cp.includes(t)) claimable.push(t); }
    if ($('passLv')) { $('passLv').textContent = 'Lv.' + lv; $('passBar').style.width = (lv >= E.PASS.tiers ? 100 : (inTier / E.PASS.xpPer) * 100) + '%'; }
    const pb = $('passBadge'); if (pb) pb.classList.toggle('hidden', !claimable.length);
    const sp = $('sidePassTxt'); if (sp) sp.textContent = claimable.length ? `有 ${claimable.length} 个奖励可领` : `Lv.${lv} · ${ps.prem ? '高级' : '免费'}`;
    if (!$('passTrack')) return;
    $('passLv2').textContent = lv;
    $('passXp').textContent = lv >= E.PASS.tiers ? '已满级' : `${inTier} / ${E.PASS.xpPer}`;
    const days = Math.max(0, Math.ceil((E.SEASON.end - Date.now()) / 86400e3));
    $('passEnds').textContent = `赛季剩余 ${days} 天 · 对战和任务都给通行证经验`;
    $('passBuy').textContent = ps.prem ? '✓ 高级通行证已解锁' : `解锁高级通行证 · ${E.PASS.price} 宝石`;
    $('passBuy').disabled = ps.prem;
    $('passBuy').onclick = async () => { const r = await eco('buyPass'); if (!r.ok) return toast(r.err); sfx.win(); toast('高级通行证已解锁！高级线的奖励都可以领了'); };
    $('passAll').disabled = !claimable.length;
    $('passAll').onclick = async () => { const r = await eco('claimAll'); if (!r.ok) return toast(r.err); sfx.win(); showGain(r.items, '通行证奖励'); };
    $('passIntro').onclick = playSeasonIntro;
    const tr = $('passTrack');
    tr.innerHTML = '';
    for (let t = 1; t <= E.PASS.tiers; t++) {
      const col = document.createElement('div');
      col.className = 'pt-col' + (t <= lv ? ' reached' : '') + (t === lv + 1 ? ' next' : '');
      const cell = (it, prem) => {
        const got = (prem ? ps.cp : ps.cf).includes(t), can = t <= lv && !got && (!prem || ps.prem);
        const rare = it.k === 'skin' ? S.skin(it.id).rare : it.k === 'chest' ? E.CHESTS[it.id].tier : 0;
        return `<button class="pt-cell ${prem ? 'prem' : 'free'} ${got ? 'got' : can ? 'can' : ''} ${prem && !ps.prem ? 'lock' : ''} r${rare}" data-t="${t}" data-p="${prem ? 1 : 0}">
          <div class="pt-art">${rewardArt(it)}</div><small>${rewardLabel(it)}</small>${got ? '<em>✓</em>' : can ? '<em class="go">领取</em>' : prem && !ps.prem ? `<em class="lk">${ic('lock')}</em>` : ''}</button>`;
      };
      col.innerHTML = cell(E.PASS.free[t - 1], false) + `<div class="pt-num">${t}</div>` + cell(E.PASS.prem[t - 1], true);
      tr.appendChild(col);
    }
    for (const b of tr.querySelectorAll('.pt-cell.can')) b.onclick = async () => {
      const r = await eco('claimPass', { tier: +b.dataset.t, prem: b.dataset.p === '1' });
      if (!r.ok) return toast(r.err);
      sfx.pick(); showGain(r.items, '通行证奖励');
    };
    const nx = tr.querySelector('.pt-col.next') || tr.lastElementChild;
    if (nx && !tr.dataset.scrolled) { tr.dataset.scrolled = 1; setTimeout(() => { tr.scrollLeft = Math.max(0, nx.offsetLeft - 160); }, 50); }
    // 任务
    const d = E.dayIndex(), wk = E.weekIndex();
    const dp = profile.q.d === d ? profile.q.dp : [0, 0, 0], wp = profile.q.w === wk ? profile.q.wp : [0, 0, 0, 0];
    const qrow = (q, v) => `<div class="qrow ${v >= q[1] ? 'done' : ''}"><div><b>${E.questName(q)}</b><i style="--k:${Math.min(1, v / q[1])}"></i></div><small>${Math.min(v, q[1])} / ${q[1]}</small><em>+${q[2]}</em></div>`;
    $('questBox').innerHTML = `<h4>每日任务 <small>北京时间 0 点刷新</small></h4>${E.dailyQuests(d).map((q, i) => qrow(q, dp[i])).join('')}
      <h4>每周任务</h4>${E.WEEKLY.map((q, i) => qrow(q, wp[i])).join('')}<p class="qnote">完成任务自动获得通行证经验</p>`;
  }
  // 领到奖励（宝箱会进「我的宝箱」）
  function showGain(items, title) {
    const parts = items.map((it) => rewardLabel(it)).join('、');
    toast(`${title}：${parts}`, 3200);
    if (items.some((it) => it.k === 'chest')) setTimeout(() => toast('宝箱已放进「宝箱」页，随时去打开', 2600), 3300);
  }
  // ---------------- 赛季出场动画 ----------------
  let introT = [];
  function playSeasonIntro() {
    const el = $('seasonIntro');
    introT.forEach(clearTimeout); introT = [];
    el.classList.remove('hidden', 'out', 'go');
    const chars = E.SEASON_PILOTS.map((id) => S.pilot(id));
    $('siChars').innerHTML = chars.map((P, i) => `<div class="si-char c${i}" style="--pc:${P.accent}"><div class="si-art">${GP.portrait(P)}</div><div class="si-name"><small>「${P.code}」${P.title}</small><b>${P.name}</b></div></div>`).join('');
    const sp = $('siSplats'); sp.innerHTML = '';
    const cols = ['#ff3ea5', '#ffe600', '#1fd6ee', '#9cff2e', '#ff8a1f', '#ff5a36', '#2ef0c8'];
    for (let i = 0; i < 14; i++) sp.insertAdjacentHTML('beforeend', `<i style="left:${Math.random() * 100}%;top:${Math.random() * 100}%;--c:${cols[i % cols.length]};--d:${(0.15 + i * 0.12).toFixed(2)}s;--s:${(0.6 + Math.random() * 1.2).toFixed(2)}"></i>`);
    void el.offsetWidth; el.classList.add('go');
    sfx.special && sfx.special();
    [700, 1500, 2300].forEach((t, i) => introT.push(setTimeout(() => { sfx.boom && sfx.boom(); if (i === 2) sfx.win(); }, t)));
    const close = () => { introT.forEach(clearTimeout); el.classList.add('out'); setTimeout(() => el.classList.add('hidden'), 400); };
    $('siGo').onclick = (e) => { e.stopPropagation(); close(); };
    el.onclick = () => { if (el.classList.contains('skip')) close(); else { el.classList.add('skip'); } };
  }
  // ---------------- 皮肤商店 ----------------
  let shopTab = 'pilot';
  function skinArt(K, small) {
    if (!K) return '';
    if (K.kind === 'pilot') return GP.portrait(S.pilot(K.pilot + '@' + K.id), small ? { face: true } : {});
    if (K.kind === 'mech') { const img = R3.mechThumb ? R3.mechThumb({ color: '#ff5a36', head: 'antenna', weapon: 'blaster', pilot: 'flag', paint: K.id }) : ''; return img ? `<img src="${img}" alt="">` : ic('mech'); }
    if (K.kind === 'fx') return `<div class="fx-demo">${K.fx.cols.map((c, i) => `<i style="--c:${c};--i:${i}"></i>`).join('')}</div>`;
    if (K.kind === 'frame') return `<div class="frame-demo frame-${K.frame}"><div class="fd-in">${GP.portrait(S.pilot(profile.pilot || 'blaze'), { face: true })}</div></div>`;
    if (K.kind === 'avatar') return avatarSvg(K.avatar);
    return '';
  }
  function avatarSvg(a) {
    const st = 'stroke="#141018" stroke-width="3" stroke-linejoin="round"';
    if (a === 'flag') return `<svg viewBox="0 0 48 48"><circle cx="24" cy="24" r="22" fill="#5b5e68" ${st}/><path d="M15,38 L15,10" ${st} stroke-width="4"/><path d="M15,11 C24,6 28,16 37,11 L37,26 C28,31 24,21 15,26 Z" fill="#ff5a36" ${st}/><path d="M24,16 l2,4 l4,0 l-3,3 l1,4 l-4,-2 l-4,2 l1,-4 l-3,-3 l4,0 Z" fill="#ffe14d"/></svg>`;
    if (a === 'can') return `<svg viewBox="0 0 48 48"><circle cx="24" cy="24" r="22" fill="#ffe600" ${st}/><rect x="17" y="16" width="14" height="24" rx="3" fill="#ff3ea5" ${st}/><rect x="20" y="9" width="8" height="7" fill="#c9d3dc" ${st}/><circle cx="34" cy="10" r="2" fill="#1fd6ee"/><circle cx="38" cy="14" r="1.6" fill="#1fd6ee"/></svg>`;
    return `<svg viewBox="0 0 48 48"><circle cx="24" cy="24" r="22" fill="#9aa0a8" ${st}/><path d="M12,18 L14,8 L20,15 Q24,13 28,15 L34,8 L36,18 Q38,30 24,36 Q10,30 12,18 Z" fill="#5b5e68" ${st}/><circle cx="19" cy="22" r="2.4" fill="#ffe600"/><circle cx="29" cy="22" r="2.4" fill="#ffe600"/><path d="M22,27 l2,2 l2,-2" fill="none" ${st} stroke-width="2"/></svg>`;
  }
  function wearing(K) {
    const w = profile.wear || {};
    return K.kind === 'pilot' ? (w.pilot || {})[K.pilot] === K.id : w[K.kind] === K.id;
  }
  function toggleWear(K) {
    const w = profile.wear = Object.assign({ pilot: {} }, profile.wear || {});
    w.pilot = Object.assign({}, w.pilot || {});
    if (K.kind === 'pilot') { if (w.pilot[K.pilot] === K.id) delete w.pilot[K.pilot]; else w.pilot[K.pilot] = K.id; }
    else if (w[K.kind] === K.id) delete w[K.kind]; else w[K.kind] = K.id;
    saveProfile(); sendLoadout(); renderShop(); renderProfile(); sfx.click();
  }
  function renderShop() {
    const grid = $('skinGrid');
    if (!grid) return;
    const deal = E.dailyDeal(E.dayIndex()), dk = S.skin(deal.id);
    const st = $('sideShopTxt'); if (st) st.textContent = `今日特惠：${dk.name}`;
    $('shopTabs').innerHTML = S.SKIN_KINDS.map(([k, n]) => `<button class="${shopTab === k ? 'sel' : ''}" data-k="${k}">${n}</button>`).join('');
    for (const b of $('shopTabs').children) b.onclick = () => { shopTab = b.dataset.k; renderShop(); sfx.click(); };
    const desc = shopTab === 'fx' ? S.FX_RARE : shopTab === 'frame' ? S.FRAME_RARE : S.RARE.map((r) => r && r.fx);
    $('rareLegend').innerHTML = [1, 2, 3, 4].map((r) => `<span style="--rc:${S.RARE[r].c}"><b>${S.RARE[r].name}</b>${desc[r]}</span>`).join('');
    grid.innerHTML = '';
    for (const K of S.SKINS.filter((k) => k.kind === shopTab).sort((a, b) => b.rare - a.rare)) {
      const own = profile.skins.includes(K.id), price = E.skinPrice(K), on = own && wearing(K);
      const el = document.createElement('div');
      el.className = `skin-card r${K.rare}` + (on ? ' wearing' : '');
      el.style.setProperty('--rc', S.RARE[K.rare].c);
      const who = K.kind === 'pilot' ? `${S.pilot(K.pilot).name}的服装${E.hasPilot(profile, K.pilot) ? '' : '（还没有这位驾驶员）'}` : { mech: '所有机体通用', fx: '子弹和命中特效', frame: '大厅名片边框', avatar: '大厅名片头像' }[K.kind];
      const btn = own ? `<button class="btn small ${on ? 'ghost' : ''}" data-act="wear">${on ? '卸下' : '装上'}</button>`
        : K.price ? `<button class="btn small" data-act="buy" ${profile.gems < price ? 'disabled' : ''}>${ic('gems')}${price}${price < K.price ? `<s>${K.price}</s>` : ''}</button>`
        : `<span class="pass-only">通行证 ${K.pass[0] === 'p' ? '高级' : '免费'}线 ${K.pass.slice(1)} 级</span>`;
      el.innerHTML = `${K.id === deal.id && !own ? '<span class="deal">今日 7 折</span>' : ''}<span class="rare-tag">${S.RARE[K.rare].name}</span>
        <div class="sk-art ${K.kind}">${skinArt(K)}</div><b>${K.name}</b><small>${who}</small>${btn}`;
      const b = el.querySelector('[data-act]');
      if (b) b.onclick = async () => {
        if (b.dataset.act === 'wear') return toggleWear(K);
        const r = await eco('buySkin', { id: K.id });
        if (!r.ok) return toast(r.err);
        sfx.win(); toast(`获得皮肤「${K.name}」！`);
        if (!wearing(K)) toggleWear(K);
      };
      grid.appendChild(el);
    }
  }
  // ---------------- 天赋树 ----------------
  function renderTalents() {
    const tree = $('talTree');
    if (!tree) return;
    const free = E.tpFree(profile), total = E.tpTotal(profile);
    $('talTop').innerHTML = `<span class="tp">${ic('star')}<b>${free}</b><small>/ ${total} 天赋点</small></span><button class="btn small ghost" id="talReset" ${profile.talents.length ? '' : 'disabled'}>重置（30 宝石）</button>`;
    const badge = $('talBadge'); if (badge) { badge.textContent = free; badge.classList.toggle('hidden', !(free > 0 && S.TALENTS.some((t) => canUnlock(t)))); }
    const st = $('sideTalTxt'); if (st) st.textContent = profile.tal.length ? profile.tal.map((id) => S.talent(id).name).join(' · ') : '天赋树';
    $('talEquip').innerHTML = `<b>本局携带</b>` + [0, 1, 2].map((i) => { const T = S.talent(profile.tal[i]); return T ? `<span class="tal-slot on" style="--bc:${S.TALENT_BRANCHES.find((b) => b.id === T.br).color}">${T.name}</span>` : '<span class="tal-slot">空</span>'; }).join('') + '<small>点已点亮的天赋装上 / 卸下</small>';
    tree.innerHTML = '';
    for (const B of S.TALENT_BRANCHES) {
      const col = document.createElement('div');
      col.className = 'tal-col'; col.style.setProperty('--bc', B.color);
      col.innerHTML = `<h4>${B.name}</h4>`;
      for (const T of S.TALENTS.filter((t) => t.br === B.id)) {
        const on = profile.talents.includes(T.id), eq = profile.tal.includes(T.id), can = canUnlock(T);
        const el = document.createElement('button');
        el.className = 'tal-node' + (on ? ' on' : can ? ' can' : ' off') + (eq ? ' eq' : '');
        el.innerHTML = `<i>${T.tier}</i><b>${T.name}</b><small>${T.desc}</small><em>${eq ? '★ 已装上' : on ? '已点亮' : `${T.cost} 点`}</em>`;
        el.onclick = async () => {
          if (on) {
            if (eq) profile.tal = profile.tal.filter((x) => x !== T.id);
            else if (profile.tal.length >= S.TALENT_SLOTS) return toast(`最多带 ${S.TALENT_SLOTS} 个天赋，先卸下一个`);
            else profile.tal = profile.tal.concat(T.id);
            saveProfile(); sendLoadout(); renderTalents(); renderProfile(); sfx.click();
            return;
          }
          const r = await eco('talent', { id: T.id });
          if (!r.ok) return toast(r.err);
          sfx.win(); toast(`点亮天赋「${T.name}」`);
        };
        col.appendChild(el);
      }
      tree.appendChild(col);
    }
    $('talReset').onclick = async () => { const r = await eco('resetTalents'); if (!r.ok) return toast(r.err); toast('天赋已重置，天赋点全部退回'); };
  }
  function canUnlock(T) {
    if (profile.talents.includes(T.id) || E.tpFree(profile) < T.cost) return false;
    return T.tier === 1 || profile.talents.some((id) => { const u = S.talent(id); return u.br === T.br && u.tier === T.tier - 1; });
  }
  // ---------------- 开箱动画 ----------------
  let coBusy = false;
  function itemCard(it) {
    if (it.k === 'pilot') {
      const P = S.pilot(it.id);
      return `<div class="co-card pilot" style="--pc:${P.accent}"><div class="co-new">新驾驶员！</div><div class="co-art">${GP.portrait(P)}</div><b>${P.name}</b><small>「${P.code}」${P.title}</small></div>`;
    }
    if (it.k === 'mech') {
      const W = S.WEAPONS[it.id], P = S.pilot(profile.pilot);
      const img = R3.mechThumb ? R3.mechThumb({ color: P.accent, head: profile.head, weapon: it.id, pilot: P.id }) : '';
      return `<div class="co-card mech"><div class="co-new">新机体！</div><div class="co-art">${img ? `<img src="${img}" alt="">` : ic('mech')}</div><b>${W.name}</b><small>${W.role}</small></div>`;
    }
    if (it.k === 'chest') return `<div class="co-card"><div class="co-art small">${GI.chestArt(it.id)}</div><b>${E.CHESTS[it.id].name}</b><small>×${it.n}</small></div>`;
    return `<div class="co-card cur-card c-${it.k}"><div class="co-art small">${ic(it.k)}</div><b>+${it.n}</b><small>${E.CUR[it.k].name}${it.dup ? '（重复转换）' : ''}</small></div>`;
  }
  function openChestFlow(cid, mode) {
    if (coBusy) return;
    const C = E.CHESTS[cid], el = $('chestOpen');
    coBusy = true;
    el.className = 't' + C.tier;
    $('coTitle').textContent = C.name;
    $('coChest').innerHTML = GI.chestArt(cid);
    $('coItems').innerHTML = '';
    $('coHint').textContent = '点一下打开';
    $('coHint').classList.remove('hidden');
    $('coBtns').classList.add('hidden');
    sfx.click();
    let opened = false;
    el.onclick = async (e) => {
      if (opened || e.target.closest('.co-btns')) return;
      opened = true;
      $('coHint').textContent = '…';
      AU.resume();
      const r = await eco(mode, { chest: cid });
      if (!r.ok) { toast(r.err); closeChest(); return; }
      el.classList.add('shake');
      await wait(520);
      el.classList.remove('shake'); el.classList.add('open');
      $('coChest').innerHTML = GI.chestArt(cid, true);
      sfx.win();
      $('coHint').classList.add('hidden');
      const box = $('coItems');
      const items = r.items.slice().sort((a, b) => (b.k === 'pilot') - (a.k === 'pilot') || (b.k === 'mech') - (a.k === 'mech'));
      for (const it of items) {
        box.insertAdjacentHTML('beforeend', itemCard(it));
        const card = box.lastElementChild;
        void card.offsetWidth; card.classList.add('in');
        if (it.k === 'pilot' || it.k === 'mech') { sfx.capture && sfx.capture(); await wait(900); } else { sfx.pick(); await wait(260); }
      }
      const again = mode === 'buy' ? profile.gems >= C.price : (profile.chests[cid] || 0) > 0;
      $('coAgain').classList.toggle('hidden', !again);
      $('coAgain').textContent = mode === 'buy' ? `再买一个（${C.price} 宝石）` : `再开一个（还剩 ${profile.chests[cid] || 0}）`;
      $('coAgain').onclick = () => { closeChest(); setTimeout(() => openChestFlow(cid, mode), 60); };
      $('coBtns').classList.remove('hidden');
    };
    $('coDone').onclick = closeChest;
    el.classList.remove('hidden');
  }
  function closeChest() {
    const el = $('chestOpen');
    el.classList.add('hidden'); el.classList.remove('open', 'shake'); el.onclick = null;
    coBusy = false;
    renderChests(); renderWallet();
    // 第一次拿到驾驶员：顺手提示去大厅开打
    if (profile.pilot && !store.get('seenFirstPilot', false)) { store.set('seenFirstPilot', true); closeOv(); toast(`${S.pilot(profile.pilot).name} 加入了你的队伍！点「对战」开打吧`, 3600); }
  }
  // ---------------- 新手流程：没有驾驶员时先教程 / 开新手宝箱 ----------------
  function needPilot() {
    if (profile.pilot && E.hasPilot(profile, profile.pilot)) return false;
    if ((profile.chests.starter || 0) > 0) openChestFlow('starter', 'open');
    else if (!profile.tut) showTutorialPrompt();
    else { openOv('chests'); toast('你还没有驾驶员：从宝箱里开一位吧'); }
    return true;
  }
  function showTutorialPrompt() {
    showInfo('欢迎来到涂鸦机兵！', `<p>灰城的墙被刷成了一片灰，是时候把颜色涂回去了。</p>
      <p>先花 2 分钟跟着教官 <b>秦岳</b> 学会移动、开火、技能和大招。完成教程会得到 <b>新手宝箱</b>：必得 1 位常驻驾驶员。你已经有 3 台初始机体：喷罐、滚刷、狙击。</p>
      <div class="info-btns"><button class="btn" id="tutGo">开始教程</button><button class="btn ghost" id="tutSkip">跳过教程</button><button class="link-btn" id="tutLater">先逛逛</button></div>`);
    $('infoOk').classList.add('hidden');
    $('tutLater').onclick = () => { $('infoDlg').classList.add('hidden'); $('infoOk').classList.remove('hidden'); toast('随时点「对战」开始新手教程'); };
    $('tutGo').onclick = () => { $('infoDlg').classList.add('hidden'); $('infoOk').classList.remove('hidden'); startTutorial(); };
    $('tutSkip').onclick = async () => {
      $('infoDlg').classList.add('hidden'); $('infoOk').classList.remove('hidden');
      const r = await eco('tutorial');
      if (!r.ok) return toast(r.err);
      openChestFlow('starter', 'open');
    };
  }
  // ---------------- 新手教程（在浏览器里开一个单独的本机服务器，联网时也一样） ----------------
  let TUT = null;
  const TUT_STEPS = [
    { t: '移动', pc: '用 <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> 移动，往前走一段', mob: '用<b>左半屏摇杆</b>移动，往前走一段' },
    { t: '开火', pc: '<b>鼠标</b>瞄准，按住<b>左键</b>开火，打中对面的训练靶', mob: '拖动<b>右下角开火摇杆</b>瞄准，松手开火，打中对面的训练靶' },
    { t: '涂地', pc: '朝地面开火把地涂满颜色！涂地多的一队获胜，站在己方颜色上跑得更快', mob: '朝地面开火把地涂满颜色！涂地多的一队获胜，站在己方颜色上跑得更快' },
    { t: '跳跃', pc: '按 <kbd>空格</kbd> 跳上旁边的矮台（高台要走楼梯或踩弹跳板）', mob: '按<b>跳跃</b>键跳上旁边的矮台（高台要走楼梯或踩弹跳板）' },
    { t: '技能', pc: '按 <kbd>Q</kbd> 使用驾驶员技能（每局 3 次）', mob: '按<b>技能</b>键使用驾驶员技能（每局 3 次）' },
    { t: '大招', pc: '大招充满了！按 <kbd>E</kbd> 发动（平时靠打中敌人和涂地充能）', mob: '大招充满了！按<b>大招</b>键发动（平时靠打中敌人和涂地充能）' },
    { t: '弹出驾驶员', pc: '糟糕，机体被打爆了！驾驶员会<b>弹出</b>继续战斗，躲好活过 6 秒，新机体就会空投到你脚下', mob: '糟糕，机体被打爆了！驾驶员会<b>弹出</b>继续战斗，躲好活过 6 秒，新机体就会空投到你脚下' },
  ];
  function startTutorial() {
    if (TUT) return;
    const hub = new window.GBCore.Hub();
    hub.local = true;
    const conn = { open: true, congested: false, send(o) { this.sendRaw(JSON.stringify(o)); }, sendRaw(str) { if (this.open) Promise.resolve().then(() => { if (conn.open) deliver(str); }); } };
    TUT = { prevNet: net, prevRoom: room, hub, conn, step: -1, hits: 0, x0: null, y0: null, paint0: 0, sk0: 0, spSent: false, wasFoot: false, doneT: 0 };
    const c = hub.connect(conn);
    net = { kind: 'tut', send: (o) => hub.message(c, JSON.parse(JSON.stringify(o))), close: () => { conn.open = false; hub.disconnect(c); } };
    room = null;
    // 教程用凌焰 + 喷罐机兵
    send({ t: 'hello', name: profile.name || '新兵', weapon: 'blaster', head: 'antenna', pilot: 'blaze', level: 1, power: { lv: 1, bt: 0 } });
    quick = { mode: 'turf', map: 0, teamSize: 2, duration: 300, bots: true, tutorial: true };
    send({ t: 'create' });
    $('tutFace').innerHTML = GP.portrait(S.pilot('vet'), { face: true });
    $('tutBox').classList.remove('hidden');
    $('tutSkipBtn').onclick = () => tutEnd(false);
  }
  function tutSet(i) {
    TUT.step = i;
    const me = G && G.me;
    if (me) {   // 每一步开始时记下基准值
      if (i === 2) TUT.paint0 = countPaint(me.team);
      if (i === 4) TUT.sk0 = me.skUses;
    }
    const box = $('tutBox');
    if (i >= TUT_STEPS.length) {
      $('tutText').innerHTML = '<b>全部学会了！</b>去大厅打开你的新手宝箱吧。';
      $('tutStep').textContent = '完成';
      box.classList.add('done');
      sfx.win();
      TUT.doneT = performance.now();
      return;
    }
    const st = TUT_STEPS[i];
    $('tutStep').textContent = `${i + 1} / ${TUT_STEPS.length} · ${st.t}`;
    $('tutText').innerHTML = TOUCH ? st.mob : st.pc;
    $('tutDots').innerHTML = TUT_STEPS.map((_, k) => `<i class="${k < i ? 'ok' : k === i ? 'cur' : ''}"></i>`).join('');
    box.classList.remove('pop'); void box.offsetWidth; box.classList.add('pop');
    if (i > 0) sfx.pick();
  }
  function tutTick() {
    if (!TUT || !G || !G.me || G.cd > 0) return;
    const me = G.me, foot = !!(me.flags & 512);
    if (TUT.step < 0) { TUT.x0 = me.px; TUT.y0 = me.py; tutSet(0); return; }
    const myTeam = me.team;
    switch (TUT.step) {
      case 0: if (Math.hypot(me.px - TUT.x0, me.py - TUT.y0) > 240) tutSet(1); break;
      case 1: if (TUT.hits >= 2) tutSet(2); break;
      case 2: if (countPaint(myTeam) - TUT.paint0 > 60) tutSet(3); break;
      case 3: if ((me.pz || 0) > 20 && !foot) tutSet(4); break;
      case 4: if (me.skUses < TUT.sk0) tutSet(5); break;
      case 5:
        if (!TUT.spSent) { TUT.spSent = true; send({ t: 'tut', op: 'sp' }); }
        else if (me.spk || (me.sp === 0 && TUT.spFull)) tutSet(6);
        if (me.sp >= S.WEAPONS[me.weapon].spNeed) TUT.spFull = true;
        break;
      case 6:
        if (!TUT.wrSent && !me.spk) { TUT.wrSent = true; setTimeout(() => send({ t: 'tut', op: 'wreck' }), 1200); }
        if (foot) TUT.wasFoot = true;
        else if (TUT.wasFoot) tutSet(7);
        break;
      default: if (performance.now() - TUT.doneT > 2200 && !TUT.ending) { TUT.ending = true; setTimeout(() => tutEnd(true), 0); }   // 等这一帧跑完再收尾
    }
  }
  function countPaint(team) { let n = 0; const g = G.grid; for (let i = 0; i < g.length; i++) if (g[i] === team) n++; return n; }
  async function tutEnd(done) {
    if (!TUT) return;
    const T = TUT;
    send({ t: 'leave' });
    if (net && net.close) net.close();
    net = T.prevNet; room = T.prevRoom; TUT = null;
    quick = null; quickRoom = false;
    $('tutBox').classList.add('hidden'); $('tutBox').classList.remove('done');
    G = null; R3.clear(); touchShow(false);
    if (document.exitPointerLock && locked()) document.exitPointerLock();
    $('results').classList.add('hidden');
    showScreen('title'); menuMusic();
    sendHello();
    if (!profile.tut) {
      const r = await eco('tutorial');
      if (!r.ok) return toast(r.err);
      toast(done ? '教程完成！送你一个新手宝箱' : '已跳过教程，送你一个新手宝箱');
      setTimeout(() => openChestFlow('starter', 'open'), 500);
    } else toast('教程结束');
  }

  function upgradeHtml(P) {
    const q = profile.pilots[P.id];
    if (!q) {
      const inStarter = E.STARTER_PILOTS.includes(P.id);
      return `<div class="upg locked">${ic('lock')}<div><b>还没有这位驾驶员</b><small>${inStarter ? '常驻角色：新手宝箱、角色宝箱、街头宝箱都可能开出' : E.SEASON_PILOTS.includes(P.id) ? '赛季角色：街头宝箱（补给箱 / 军用箱 / 金色空投）可能开出' : '常驻角色：角色宝箱、街头宝箱都可能开出'}</small></div><button class="btn small" id="goChest">去宝箱</button></div>`;
    }
    const cap = E.lvCap(q.bt), bonus = Math.round((E.statMul(q.lv) - 1) * 100);
    const stars = [1, 2].map((i) => `<i class="bt ${q.bt >= i ? 'on' : ''}" title="${E.BREAKS[i].name}">${i === 1 ? 'Ⅰ' : 'Ⅱ'}</i>`).join('');
    let act;
    if (q.lv >= E.MAX_LV) act = '<span class="maxed">已满级</span>';
    else if (q.lv >= cap) {
      const B = E.BREAKS[q.bt + 1], okB = profile.crystals >= B.crystals && profile.coins >= B.coins;
      act = `<button class="btn small brk" id="doBreak" ${okB ? '' : 'disabled'}>${B.name}：${ic('crystals')}${B.crystals} ${ic('coins')}${B.coins}</button><small class="brk-desc">${B.desc}</small>`;
    } else {
      const c = E.UP_COINS[q.lv], pt = E.UP_PARTS[q.lv], okU = profile.coins >= c && profile.parts >= pt;
      act = `<button class="btn small" id="doUp" ${okU ? '' : 'disabled'}>${ic('up')}升到 ${q.lv + 1} 级：${ic('coins')}${c} ${ic('parts')}${pt}</button>`;
    }
    return `<div class="upg"><div class="lvbig"><small>等级</small><b>${q.lv}</b><small>/ ${cap}</small></div>
      <div class="upg-mid"><div class="bts">突破 ${stars}</div><small>生命 / 伤害 +${bonus}%${q.bt >= 1 ? ' · 超载技能已解锁（R 键）' : ''}</small></div>
      <div class="upg-act">${act}</div></div>`;
  }
  function bindUpgrade(P) {
    const g = $('goChest'); if (g) g.onclick = () => { openOv('chests'); };
    const u = $('doUp');
    if (u) u.onclick = async () => { const r = await eco('upgrade', { pilot: P.id }); if (!r.ok) return toast(r.err); sfx.win(); toast(`${P.name} 升到了 ${r.lv} 级！`); };
    const b = $('doBreak');
    if (b) b.onclick = async () => { const r = await eco('break', { pilot: P.id }); if (!r.ok) return toast(r.err); sfx.win(); toast(`${P.name} 完成${E.BREAKS[r.bt].name}！`); };
  }

  // ================= 账号：登录 / 注册 / 退出 =================
  const KIND_TAG = { guest: '游客', local: '本机账号', online: '在线账号' };
  let lgTab = 'login';
  const lgKind = () => (serverAccounts ? 'online' : 'local');
  const isGuest = () => !session || session.kind === 'guest';
  function onCaps(m) {
    serverAccounts = !!m.accounts;
    if (session && session.kind === 'online') {
      if (serverAccounts) send({ t: 'auth', op: 'token', token: session.token });
      else toast('没有连上账号服务器：先用离线缓存的资料，这期间的对战不计入账号', 4200);
    }
    if (!$('login').classList.contains('hidden')) renderLogin();
    renderAcct();
  }
  function onAuth(m) {
    if (m.op === 'logout') return;
    const mine = pendingAuth; pendingAuth = null;
    if (mine) clearTimeout(mine.timer);
    if (m.ok) {
      const first = !session || session.kind !== 'online' || session.name !== m.account.name;
      session = { kind: 'online', name: m.account.name, token: m.token, created: m.account.created };
      store.set('session', session);
      onlineReady = true; needLogin = false;
      applyServerProfile(m.profile);
      if (mine) { hideLogin(); toast(mine.op === 'register' ? `注册成功，欢迎加入，${session.name}！` : `欢迎回来，${session.name}！`); }
      else if (first) toast(`已登录在线账号 ${session.name}`);
      if (mine || first) onboard();
      return;
    }
    if (mine) { lgError(m.err || '登录失败'); return; }
    if (m.op === 'token' && session && session.kind === 'online') {   // 令牌过期 / 被退出
      session = null; store.set('session', null); onlineReady = false;
      loadProfile(store.get('profile', {})); afterAccountChange();
      toast('登录已过期，请重新登录');
      needLogin = true;
      if (!$('boot')) showLogin('login');
    }
  }
  function applyServerProfile(p) {
    loadProfile(Object.assign({}, p, { name: session.name }));
    store.set(onlineKey(session.name), profile);
    afterAccountChange();
  }
  function onServerProfile(m) {
    if (!session || session.kind !== 'online') return;
    applyServerProfile(m.profile);
    if (m.reward && pendingReward) { showReward(m.reward, pendingReward.trBefore, pendingReward.lvBefore, m.items); pendingReward = null; }
  }
  function afterAccountChange() {
    $('nameInput').value = profile.name;
    renderProfile(); renderPilots(); renderHeads(); renderWallet(); renderChests(); renderTalents(); renderPass(); renderShop();
    if (!$('ov-mechs').classList.contains('hidden')) renderWeaponLists();
    sendLoadout();
  }
  // 开场动画结束后：已登录就直接进大厅，否则先登录
  function startAccount() {
    if (needLogin || !session) showLogin(LACC.list().length || (store.get('profile', {}).matches || 0) === 0 ? 'login' : 'register');
    else { if (session.kind === 'guest') ensureName(); onboard(); }
  }
  // 进入大厅后：新手号先走教程 / 开新手宝箱
  function onboard() {
    setTimeout(() => {
      if (!$('login').classList.contains('hidden') || $('boot') || G || room) return;
      if (!profile.pilot) needPilot();
    }, 500);
  }
  function showLogin(tab) {
    lgTab = tab || lgTab;
    const el = $('login');
    el.classList.remove('hidden', 'out');
    $('lgPass').value = ''; $('lgPass2').value = ''; lgError('');
    renderLogin();
    if (!TOUCH) setTimeout(() => ($('lgName').value ? $('lgPass') : $('lgName')).focus(), 60);
  }
  function hideLogin() {
    const el = $('login');
    if (el.classList.contains('hidden')) return;
    el.classList.add('out');
    setTimeout(() => el.classList.add('hidden'), 300);
    $('lgPass').value = ''; $('lgPass2').value = '';
  }
  function lgError(msg) {
    const e = $('lgErr');
    e.textContent = msg;
    e.classList.remove('shake'); if (msg) { void e.offsetWidth; e.classList.add('shake'); }
  }
  function renderLogin() {
    const reg = lgTab === 'register', online = lgKind() === 'online';
    $('loginForm').classList.toggle('reg', reg);
    for (const b of document.querySelectorAll('.lg-tab')) b.classList.toggle('sel', b.dataset.tab === lgTab);
    const mode = $('lgMode');
    mode.textContent = online ? '在线账号 · 存在服务器' : '本机账号 · 存在这台设备';
    mode.classList.toggle('online', online);
    $('lgGo').textContent = reg ? '注 册' : '登 录';
    $('lgGo').disabled = !!pendingAuth;
    $('lgPass').autocomplete = reg ? 'new-password' : 'current-password';
    const g = store.get('profile', {}), hasGuest = (g.matches || 0) > 0;
    let note = online ? '在线账号的奖杯和经验由服务器结算，换手机或电脑登录进度都在。'
      : serverAccounts === null && !FILE_MODE ? '正在连接服务器…' : '现在没有连上游戏服务器，账号保存在这台设备的浏览器里（换设备不会同步）。电脑上运行 node server.js 开服后，就能注册在线账号。';
    if (reg && hasGuest) note += online ? ' 在线账号从新手开始（游客在这台设备上的进度不会上传）。' : ` 游客进度（${g.trophies || 0} 🏆、${g.matches} 场、角色和宝箱）会带进新账号。`;
    $('lgNote').textContent = note;
    const known = $('lgKnown');
    known.innerHTML = '';
    if (!online && !reg) {
      for (const a of LACC.list().slice(0, 6)) {
        const b = document.createElement('button');
        b.type = 'button';
        b.innerHTML = `${esc(a.name)}<small>🏆${a.trophies}</small>`;
        b.onclick = () => { $('lgName').value = a.name; $('lgPass').focus(); sfx.click(); };
        known.appendChild(b);
      }
    }
  }
  function guestProgress() { const g = store.get('profile', {}); return g && typeof g === 'object' ? g : {}; }
  function submitLogin(e) {
    if (e) e.preventDefault();
    if (pendingAuth) return;
    AU.resume();
    const reg = lgTab === 'register', name = $('lgName').value.trim(), pass = $('lgPass').value;
    if (!S.ACCOUNT.nameOk(name)) return lgError(S.ACCOUNT.nameHint);
    if (!S.ACCOUNT.passOk(pass)) return lgError(S.ACCOUNT.passHint);
    if (reg && pass !== $('lgPass2').value) return lgError('两次输入的密码不一样');
    lgError('');
    if (lgKind() === 'online') {
      const op = reg ? 'register' : 'login';
      pendingAuth = { op, timer: setTimeout(() => { pendingAuth = null; renderLogin(); lgError('服务器没有回应，请稍后再试'); }, 8000) };
      $('lgGo').disabled = true;
      send({ t: 'auth', op, name, pass });
      return;
    }
    if (reg) {
      const g = guestProgress();
      const res = LACC.register(name, pass, E.normalize(g, name));
      if (!res.ok) return lgError(res.err);
      if ((g.matches || 0) > 0 || g.tut) store.set('profile', E.newProfile(g.name || ''));   // 进度已搬进账号，游客重新开始
      enterAs({ kind: 'local', name: res.name }, res.profile, `注册成功，欢迎加入，${res.name}！`);
    } else {
      const res = LACC.login(name, pass);
      if (!res.ok) return lgError(res.err);
      enterAs({ kind: 'local', name: res.name }, res.profile, `欢迎回来，${res.name}！`);
    }
  }
  function enterAs(sess, prof, msg) {
    session = sess; store.set('session', sess); needLogin = false; onlineReady = false;
    loadProfile(prof);
    afterAccountChange();
    hideLogin();
    if (sess.kind === 'guest') ensureName();
    sfx.click();
    if (msg) toast(msg);
    onboard();
  }
  function logout() {
    if (session && session.kind === 'online') send({ t: 'auth', op: 'logout', token: session.token });
    if (room) send({ t: 'leave' });
    session = null; store.set('session', null); onlineReady = false;
    loadProfile(store.get('profile', {}));
    afterAccountChange();
    closeOv();
    showLogin('login');
  }
  function renderAcct() {
    const kind = session ? session.kind : 'guest';
    const tag = $('chipAcct');
    if (tag) { tag.textContent = KIND_TAG[kind]; tag.className = 'acct-tag ' + kind; }
    $('nameField').classList.toggle('hidden', !isGuest());
    const box = $('acctBox');
    if (!box) return;
    if (kind === 'guest') {
      box.innerHTML = `<div class="who"><b>游客</b><small>进度只存在这台设备上；注册账号后进度会带进账号</small></div>
        <button class="btn small" id="acReg">注册账号</button><button class="btn small ghost" id="acLogin">登录</button>`;
      $('acReg').onclick = () => { closeOv(); showLogin('register'); };
      $('acLogin').onclick = () => { closeOv(); showLogin('login'); };
    } else {
      const online = kind === 'online';
      const st = online ? (onlineReady ? '已连接服务器 ✓ 进度由服务器保存' : '暂时没连上服务器，用的是离线缓存') : '保存在这台设备上';
      box.innerHTML = `<div class="who">${KIND_TAG[kind]}<br><b>${esc(session.name)}</b><small>${st}</small></div>
        <button class="btn small ghost" id="acOut">${online ? '退出登录' : '切换账号'}</button>`;
      $('acOut').onclick = logout;
    }
  }
  $('loginForm').addEventListener('submit', submitLogin);
  for (const b of document.querySelectorAll('.lg-tab')) b.onclick = () => { lgTab = b.dataset.tab; lgError(''); renderLogin(); sfx.click(); };
  $('lgGuest').onclick = () => { enterAs({ kind: 'guest' }, store.get('profile', {}), '游客模式：进度存在这台设备上，随时可以在名片页注册账号'); };

  // ================= 启动 =================
  window.__gbDebug = () => ({ tut: () => TUT, tutSet: (i) => tutSet(i), G, keys: [...keys], mouse, myId, view, R3, hub: localHub, frame: () => { const n = performance.now(); if (G) { const dt = Math.min(0.05, (n - G.lastFrame) / 1000); G.lastFrame = n; updateGame(n, dt); renderGame(n, dt); } } });
  bindUI();
  setupTouch();
  boot().then(startAccount);
  // 通过网址打开时注册离线缓存（双击本地文件打开时浏览器不支持，自动跳过）
  const IN_APP = new URLSearchParams(location.search).has('app');   // 安卓 App 里运行
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol) && !window.GB_SINGLE && !IN_APP) navigator.serviceWorker.register('sw.js').catch(() => {});
  // 安卓返回键：对战中打开 / 关闭暂停菜单，菜单里关掉弹窗
  window.GB_back = () => {
    if (!$('settingsDlg').classList.contains('hidden')) closeSettings();
    else if (G && !G.over) openSettings();
  };
  connect();
  requestAnimationFrame(loop);
})();
