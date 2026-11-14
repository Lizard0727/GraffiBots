// 把每位驾驶员的 3D 模型渲染成 PNG，给官网的角色介绍用：site/img/pilots/<id>.png
// 需要 Playwright（npm i -D playwright 后 npx playwright install chromium）：node tools/render-pilots.js
// 新增驾驶员或改了模型后重新运行，再运行 node tools/build-site.js
'use strict';
const path = require('path'), fs = require('fs');
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { console.error('需要先安装 Playwright：npm i -D playwright && npx playwright install chromium'); process.exit(1); }
const ROOT = path.join(__dirname, '..'), OUT = path.join(ROOT, 'site', 'img', 'pilots');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--ignore-gpu-blocklist'] });
  const p = await (await b.newContext({ viewport: { width: 800, height: 600 } })).newPage();
  await p.goto('file://' + path.join(ROOT, 'public', 'index.html'));
  await p.waitForFunction(() => window.GB3D && window.GB3D.charShot && window.GS, null, { timeout: 30000 });
  const ids = await p.evaluate(() => window.GS.PILOTS.map((P) => P.id));
  const shots = await p.evaluate((ids) => ids.map((id) => window.GB3D.charShot(id, null, 360, 440)), ids);
  fs.mkdirSync(OUT, { recursive: true });
  shots.forEach((u, i) => { if (u) fs.writeFileSync(path.join(OUT, ids[i] + '.png'), Buffer.from(u.split(',')[1], 'base64')); });
  console.log(`已渲染 ${shots.filter(Boolean).length} 位驾驶员 → site/img/pilots/`);
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
