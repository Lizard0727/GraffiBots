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
  const chests = await p.evaluate(() => Object.keys(GE ? GE.CHESTS : {}));
  for (const c of chests) {
    save(`chests/${c}.png`, await render(await p.evaluate((c) => GI.chestArt(c), c), 240, 260));
    save(`chests/${c}_open.png`, await render(await p.evaluate((c) => GI.chestArt(c, true), c), 240, 260));
  }
  await b.close();
  console.log('godot/art：', pilots.length, '张立绘 +', skins.length, '套皮肤 +', icons.length, '个图标 +', chests.length, '种宝箱');
})();
