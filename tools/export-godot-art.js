// 把网页版的程序化美术（驾驶员立绘、涂鸦图标、宝箱）渲染成 PNG，给 Godot 版用：godot/art/
// 运行：node tools/export-godot-art.js（需要 playwright + Chromium）
'use strict';
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const pub = path.join(__dirname, '..', 'public'), out = path.join(__dirname, '..', 'godot', 'art');
(async () => {
  for (const d of ['portraits', 'faces', 'icons', 'chests']) fs.mkdirSync(path.join(out, d), { recursive: true });
  const b = await chromium.launch();
  const p = await b.newPage();
  await p.setContent('<html><body></body></html>');
  for (const f of ['shared.js', 'economy.js', 'icons.js', 'portraits.js']) await p.addScriptTag({ path: path.join(pub, f) });
  // 3.1：「黎明之后」联动干员（电脑版专用数据）
  await p.addScriptTag({ path: path.join(__dirname, 'collab-dawn.js') });
  await p.evaluate(() => GBDawn.apply(GS, window.GE || null));
  // 在页面里把 SVG 画到 canvas 上，返回 PNG 的 base64
  const render = (svg, w, h) => p.evaluate(async ([svg, w, h]) => {
    const img = new Image();
    let t = svg.replace(/^<svg([^>]*)>/, (m, a) => '<svg' + a.replace(/\s(width|height)="[^"]*"/g, '') + '>');
    if (!/xmlns=/.test(t.slice(0, 200))) t = t.replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ');
    t = t.replace('<svg ', `<svg width="${w}" height="${h}" `);
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(t);
    await img.decode();
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    c.getContext('2d').drawImage(img, 0, 0, w, h);
    return c.toDataURL('image/png').split(',')[1];
  }, [svg, w, h]);
  const save = (rel, b64) => fs.writeFileSync(path.join(out, rel), Buffer.from(b64, 'base64'));
  const pilots = await p.evaluate(() => GS.PILOTS.map((P) => P.id));
  for (const id of pilots) {
    if (['.png', '.jpg'].some((e) => fs.existsSync(path.join(__dirname, 'portraits-raw', id + e)))) continue;   // 3.2：已经用 AI 生成过的立绘不覆盖（tools/gen-portraits.py）
    save(`portraits/${id}.png`, await render(await p.evaluate((id) => GP.portrait(id, { bg: false }), id), 600, 780));
    save(`faces/${id}.png`, await render(await p.evaluate((id) => GP.portrait(id, { face: true }), id), 160, 160));
  }
  // 驾驶员皮肤：换配色的立绘和头像（文件名用皮肤 id）
  const skins = await p.evaluate(() => GS.SKINS.filter((k) => k.kind === 'pilot').map((k) => k.id));
  for (const sid of skins) {
    const P = (face) => p.evaluate(([sid, face]) => { const K = GS.SKINS.find((k) => k.id === sid); const P = Object.assign({}, GS.pilot(K.pilot), K.over || {}); return GP.portrait(P, face ? { face: true } : { bg: false }); }, [sid, face]);
    save(`portraits/${sid}.png`, await render(await P(false), 600, 780));
    save(`faces/${sid}.png`, await render(await P(true), 160, 160));
  }
  const icons = await p.evaluate(() => GI.names);
  for (const n of icons) save(`icons/${n}.png`, await render(await p.evaluate((n) => GI.svg(n), n), 96, 96));
  // 头像（avatarSvg 原样取自 client.js）
  fs.mkdirSync(path.join(out, 'avatars'), { recursive: true });
  const cj = fs.readFileSync(path.join(pub, 'client.js'), 'utf8');
  const avSrc = cj.slice(cj.indexOf('function avatarSvg(a)'), cj.indexOf('function wearing(K)'));
  await p.evaluate((src) => { window.avatarSvg = new Function(src + '; return avatarSvg;')(); }, avSrc);
  const avs = await p.evaluate(() => GS.SKINS.filter((k) => k.kind === 'avatar').map((k) => k.avatar));
  for (const a of avs) save(`avatars/${a}.png`, await render((await p.evaluate((a) => window.avatarSvg(a), a)).replace(/stroke-width="3" stroke-linejoin="round"( fill="none")? stroke-width=/g, 'stroke-linejoin="round"$1 stroke-width=').replace(/stroke-width="3" stroke-linejoin="round" (\w+="[^"]*" )?stroke-width=/g, 'stroke-linejoin="round" $1stroke-width=').replace("<svg ", "<svg xmlns=\"http://www.w3.org/2000/svg\" "), 160, 160));
  // 3.1：联动头像「启明号车徽」
  save('avatars/dawn.png', await render('<svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3e3c7e"/><stop offset="1" stop-color="#ffb47c"/></linearGradient></defs>' +
    '<rect width="120" height="120" rx="24" fill="url(#g)"/><circle cx="60" cy="70" r="26" fill="#ffd27a"/>' + [0, 1, 2, 3, 4, 5, 6].map((k) => { const a = Math.PI + k * Math.PI / 6; return `<path d="M${60 + Math.cos(a) * 32},${70 + Math.sin(a) * 32} L${60 + Math.cos(a) * 44},${70 + Math.sin(a) * 44}" stroke="#ffd27a" stroke-width="5" stroke-linecap="round"/>`; }).join('') +
    '<rect x="0" y="70" width="120" height="50" fill="#2a2440"/><path d="M8,86 H112 M8,100 H112" stroke="#9a7aff" stroke-width="4"/><path d="M24,80 v26 M44,80 v26 M64,80 v26 M84,80 v26 M104,80 v26" stroke="#5a4a7a" stroke-width="3"/></svg>', 96, 96));
  const chests = await p.evaluate(() => Object.keys(GE ? GE.CHESTS : {}));
  for (const c of chests) {
    save(`chests/${c}.png`, await render(await p.evaluate((c) => GI.chestArt(c), c), 240, 260));
    save(`chests/${c}_open.png`, await render(await p.evaluate((c) => GI.chestArt(c, true), c), 240, 260));
  }
  await b.close();
  console.log('godot/art：', pilots.length, '张立绘 +', skins.length, '套皮肤 +', icons.length, '个图标 +', chests.length, '种宝箱');
})();
