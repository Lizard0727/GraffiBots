// 涂鸦机兵官网（启动站 + 更新日志）生成器
// 游戏数据（版本号、更新公告、角色、玩法、地图）都从 public/ 里读，官网永远和游戏同步：
//   node tools/build-site.js                    → 更新 site/data.js、site/version.json、site/fonts/
//   node tools/build-site.js --downloads        → 另外把 dist/ 里打好的包复制到 site/downloads/
//   node tools/build-site.js --out _site --downloads   → 把整个官网连同下载包输出到 _site/（GitHub Pages 用）
//   node tools/build-site.js --artifact         → dist/site-artifact.html（全部内联的单页，发布到 claude.ai）
// 发新版本的流程：改 public/shared.js 里的 S.VERSION 和 S.PATCH_NOTES → 打包 → 运行本脚本 → 上传。
// 玩家的游戏会读取「官网/version.json」，发现版本比自己新就在大厅顶部提示去官网下载。
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..'), PUB = path.join(ROOT, 'public'), SITE = path.join(ROOT, 'site'), DIST = path.join(ROOT, 'dist');
const argv = process.argv.slice(2);
const opt = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : null; };
const S = require(path.join(PUB, 'shared.js'));
const E = require(path.join(PUB, 'economy.js'));

// ---- 用游戏自己的英文词典翻译（i18n.js 是浏览器脚本，这里给它一个假的 window）----
const ctx = { window: {}, navigator: { language: 'en' }, localStorage: { getItem: () => '"en"', setItem() {} }, document: { addEventListener() {}, documentElement: {} }, console };
vm.createContext(ctx);
for (const f of ['i18n-en.js', 'i18n.js']) vm.runInContext(fs.readFileSync(path.join(PUB, f), 'utf8'), ctx);
const tr = (s) => ctx.window.GBI18N.tr(s);
// 驾驶员立绘（portraits.js 生成 SVG 字符串）
const pctx = { window: { GS: S }, console };
vm.createContext(pctx);
vm.runInContext(fs.readFileSync(path.join(PUB, 'portraits.js'), 'utf8'), pctx);

const trSecs = (secs) => secs.map(([h, items]) => [tr(h), items.map(tr)]);
const notes = S.PATCH_NOTES.map((n) => ({ v: n.v, date: n.date, title: n.title, en_title: n.en_title || tr(n.title), sections: n.sections, en: n.en || trSecs(n.sections) }));
const latest = notes[0];
const NEW_MAPS = 3;   // 本次更新新增的地图数（排在 S.MAPS 最后）
const seasonP = new Set(E.SEASON_PILOTS || []), questP = new Set(E.QUEST_ONLY || []);
const pilots = Object.values(S.PILOTS).map((p) => ({
  id: p.id, name: p.name, en: tr(p.name), title: p.title, en_title: tr(p.title), accent: p.accent,
  tag: seasonP.has(p.id) ? 'season' : questP.has(p.id) ? 'quest' : '',
  svg: pctx.window.GP.portrait(p, { bust: true, cls: 'pt' }).replace(/\s*\n\s*/g, ''),
}));
const mechs = Object.entries(S.WEAPONS).map(([id, w]) => ({ id, name: w.name, en: tr(w.name), role: w.role, en_role: tr(w.role), hp: w.hp, range: w.range || 0,
  tag: (E.SEASON_MECHS || []).includes(id) ? 'season' : questP.has(id) ? 'quest' : '' }));
const modes = Object.entries(S.MODES).map(([id, m]) => ({ id, name: m.name, en: tr(m.name), desc: m.desc, en_desc: tr(m.desc), isNew: !!m.isNew }));
const maps = S.MAPS.map((m, i) => ({ name: m.name, en: tr(m.name), isNew: i >= S.MAPS.length - NEW_MAPS }));

// ---- 下载包 ----
const apk = opt('--apk') || ['涂鸦机兵-GraffiBots.apk', 'GraffiBots.apk'].map((f) => path.join(DIST, f)).find((f) => fs.existsSync(f));
const DL = [
  { id: 'offline', src: path.join(DIST, '涂鸦机兵-单文件版.html'), file: `graffibots-${S.VERSION}-offline.html` },
  { id: 'full', src: path.join(DIST, 'GraffiBots.zip'), file: `graffibots-${S.VERSION}-full.zip` },
  { id: 'apk', src: apk, file: `graffibots-${S.VERSION}.apk` },
];
const downloads = DL.map((d) => {
  const have = !!(d.src && fs.existsSync(d.src));
  return { id: d.id, file: 'downloads/' + d.file, size: have ? fs.statSync(d.src).size : 0, have: have && argv.includes('--downloads') };
});

const data = {
  version: S.VERSION, date: latest.date, title: latest.title, en_title: latest.en_title,
  season: { name: E.SEASON && E.SEASON.name, ends: E.SEASON && E.SEASON.end },
  counts: { pilots: pilots.length, mechs: mechs.length, maps: maps.length, modes: modes.length, skins: (S.SKINS || []).length, talents: (S.TALENTS || []).length },
  notes, pilots, mechs, modes, maps, downloads,
  shots: [
    { img: 'img/metro.jpg', map: '地铁中转站', mode: '涂地大战' },
    { img: 'img/nightmarket.jpg', map: '夜市长街', mode: '抢占据点' },
    { img: 'img/grayhq.jpg', map: '灰石总部', mode: '逃亡圈 · 四队' },
  ].map((s) => ({ ...s, en_map: tr(s.map), en_mode: tr(s.mode) })),
};

// ---- 写文件 ----
const js = `// 由 tools/build-site.js 生成，不要手改（改 public/shared.js 里的版本号和更新公告）\nwindow.GB_SITE = ${JSON.stringify(data)};\n`;
fs.writeFileSync(path.join(SITE, 'data.js'), js);
fs.writeFileSync(path.join(SITE, 'version.json'), JSON.stringify({ version: S.VERSION, date: latest.date, title: latest.title, en_title: latest.en_title, page: '#updates' }, null, 2) + '\n');
fs.mkdirSync(path.join(SITE, 'fonts'), { recursive: true });
for (const f of ['huangyou.woff2', 'bangers.woff2', 'marker.woff2', 'FONTS-LICENSE.txt']) fs.copyFileSync(path.join(PUB, 'fonts', f), path.join(SITE, 'fonts', f));
fs.copyFileSync(path.join(PUB, 'icon-192.png'), path.join(SITE, 'img', 'icon.png'));
console.log(`site/data.js：版本 ${S.VERSION}，${notes.length} 条公告，${pilots.length} 位驾驶员（${(Buffer.byteLength(js) / 1024).toFixed(0)} KB）`);

const out = opt('--out') ? path.resolve(opt('--out')) : SITE;
if (out !== SITE) { fs.rmSync(out, { recursive: true, force: true }); fs.cpSync(SITE, out, { recursive: true, filter: (f) => !f.includes(`${path.sep}downloads`) }); }
if (argv.includes('--downloads')) {
  fs.mkdirSync(path.join(out, 'downloads'), { recursive: true });
  for (const d of DL) if (d.src && fs.existsSync(d.src)) { fs.copyFileSync(d.src, path.join(out, 'downloads', d.file)); console.log('  下载包', d.file); }
  else console.log('  （没有找到', d.id, '的安装包，官网上会显示「暂未提供」）');
  if (out !== SITE) fs.copyFileSync(path.join(SITE, 'data.js'), path.join(out, 'data.js'));
}
if (out !== SITE) console.log('官网已输出到', path.relative(ROOT, out) || out);

// ---- 单页版（claude.ai 网页）：样式、脚本、字体、图片全部内联 ----
if (argv.includes('--artifact')) {
  const b64 = (f) => fs.readFileSync(f).toString('base64');
  let html = fs.readFileSync(path.join(SITE, 'index.html'), 'utf8');
  const cfg = { play: opt('--play') || 'https://claude.ai/artifact/FuL4mh2DHsZpsNnfMNP3m7', home: opt('--home') || 'https://lizard0727.github.io/GraffiBots/' };
  data.downloads = data.downloads.map((d) => ({ ...d, have: false }));
  for (const s of data.shots) s.img = 'data:image/jpeg;base64,' + b64(path.join(SITE, s.img));
  html = html.replace(/url\('fonts\/([^']+)'\)/g, (m, f) => `url('data:font/woff2;base64,${b64(path.join(SITE, 'fonts', f))}')`)
    .replace('<script src="data.js"></script>', () => `<script>window.GB_SITE = ${JSON.stringify(data)}; window.GB_SITE_CFG = ${JSON.stringify(cfg)};</script>`)
    .replace(/<!doctype html>\n?/i, '').replace(/<html[^>]*>\n?/, '').replace(/<\/html>\s*$/, '')
    .replace(/<head>\n?/, '').replace(/<\/head>\n?/, '').replace(/<body>\n?/, '').replace(/<\/body>\n?/, '')
    .replace(/<meta charset="utf-8">\n?/, '').replace(/ *<meta name="viewport"[^>]*>\n?/, '')
    .replace(/ *<link rel="icon"[^>]*>\n?/, '');
  html = html.replace('<title>涂鸦机兵 GraffiBots</title>', '<title>涂鸦机兵官网</title>');
  const t = html.match(/ *<title>[^<]*<\/title>\n?/);
  if (t) html = t[0].trim() + '\n' + html.replace(t[0], '');
  fs.mkdirSync(DIST, { recursive: true });
  fs.writeFileSync(path.join(DIST, 'site-artifact.html'), html);
  console.log(`已生成 dist/site-artifact.html（${(Buffer.byteLength(html) / 1024).toFixed(0)} KB）`);
}
