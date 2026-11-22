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
const NEW_MAPS = 2;   // 本次更新新增的地图数（排在 S.MAPS 最后）
const seasonP = new Set(E.SEASON_PILOTS || []), questP = new Set(E.QUEST_ONLY || []);
// 驾驶员：有 3D 渲染图（site/img/pilots/<id>.png，由 tools/render-pilots.js 生成）就用 3D 图，否则用立绘 SVG
const pilots = Object.values(S.PILOTS).map((p) => {
  const img = `img/pilots/${p.id}.png`, has3d = fs.existsSync(path.join(SITE, img));
  const A = S.sidearm(p.id);
  return {
    id: p.id, name: p.name, en: tr(p.name), title: p.title, en_title: tr(p.title), accent: p.accent,
    side: A.name, en_side: tr(A.name), side_desc: A.desc, en_side_desc: tr(A.desc), side_kind: A.kind,
    code: p.code, en_code: tr(p.code), line: p.line, en_line: tr(p.line),
    skill: S.SKILLS[p.skill].name, en_skill: tr(S.SKILLS[p.skill].name), skill_desc: S.SKILLS[p.skill].desc, en_skill_desc: tr(S.SKILLS[p.skill].desc),
    passive: p.passive.name, en_passive: tr(p.passive.name), passive_desc: p.passive.desc, en_passive_desc: tr(p.passive.desc),
    ov: S.OVERLOADS[p.id].name, en_ov: tr(S.OVERLOADS[p.id].name), ov_desc: S.OVERLOADS[p.id].desc, en_ov_desc: tr(S.OVERLOADS[p.id].desc),
    mech: S.WEAPONS[p.weapon].name, en_mech: tr(S.WEAPONS[p.weapon].name),
    tag: seasonP.has(p.id) ? 'season' : questP.has(p.id) ? 'quest' : '',
    img: has3d ? img : null,
    svg: has3d ? null : pctx.window.GP.portrait(p, { bust: true, cls: 'pt' }).replace(/\s*\n\s*/g, ''),
  };
});
const mechs = Object.entries(S.WEAPONS).map(([id, w]) => ({ id, name: w.name, en: tr(w.name), role: w.role, en_role: tr(w.role), hp: w.hp, range: w.range || 0,
  tag: (E.SEASON_MECHS || []).includes(id) ? 'season' : questP.has(id) ? 'quest' : (E.STRIKE_MECHS || []).includes(id) ? 'strike' : '' }));
// 2.2：战斗定位 / 六边形 / 克制关系
const roleData = (kind, id) => {
  const r = S.roleOf(id), R = S.ROLES[r.role], C = S.countersOf(id), F = S.fitOf(id), col = R.color;
  const enAxes = S.HEX_AXES[kind].map((a) => ({ 破坏力: 'Power', 耐久: 'Durability', 速度: 'Speed', 射程: 'Range', 涂地: 'Painting', 操作难度: 'Difficulty', 战斗: 'Combat', 辅助: 'Support', 控制: 'Control', 机动: 'Mobility', 生存: 'Survival' })[a] || tr(a));
  const one = (m) => ({ id: m.id, why: m.why, en_why: tr(m.why) });
  return { role: r.role, tag: S.TAGS[r.tag], en_tag: tr(S.TAGS[r.tag]), color: col, hex: S.hexSvg(kind, id, { color: col, size: 200 }), en_hex: S.hexSvg(kind, id, { color: col, size: 200, labels: enAxes }),
    beats: C.beats.map(one), weak: C.weak.map(one), modes: (F ? F.modes : []).map((m) => S.MODES[m].name), en_modes: (F ? F.modes : []).map((m) => tr(S.MODES[m].name)) };
};
for (const p of pilots) Object.assign(p, { r: roleData('pilot', p.id) });
for (const m of mechs) Object.assign(m, { r: roleData('mech', m.id) });
const roles = Object.fromEntries(Object.entries(S.ROLES).map(([k, R]) => [k, { kind: R.kind, name: R.name, en: { assault: R.kind === 'mech' ? 'Brawler' : 'Striker', suppress: 'Suppressor', sniper: 'Sniper', artillery: 'Artillery', tank: 'Tank', assassin: 'Assassin', support: 'Support', control: 'Controller', striker: 'Striker', scout: 'Scout' }[k], color: R.color, desc: R.desc, en_desc: tr(R.desc) }]));
const ring = { mech: S.ROLE_RING.mech, pilot: S.ROLE_RING.pilot, why: Object.fromEntries(Object.entries(S.RING_WHY).map(([k, v]) => [k, { zh: v, en: tr(v) }])), edge: S.ROLE_EDGE };
const modes = Object.entries(S.MODES).map(([id, m]) => ({ id, name: m.name, en: tr(m.name), desc: m.desc, en_desc: tr(m.desc), isNew: !!m.isNew }));
const maps = S.MAPS.map((m, i) => ({ name: m.name, en: tr(m.name), isNew: i >= S.MAPS.length - NEW_MAPS }));

// ---- 下载包 ----
const apk = opt('--apk') || ['涂鸦机兵-GraffiBots.apk', 'GraffiBots.apk'].map((f) => path.join(DIST, f)).find((f) => fs.existsSync(f));
// 2.1.2：每个包同时发布「带版本号」和「固定名字（latest）」两份；官网按钮用固定名字 + ?v=版本号，
// 这样官网更新的那一刻，还开着旧页面的人点下载也不会 404（以前旧页面指向的旧版本文件已经被删掉了）
// 3.0：电脑版（Godot）——公告来自 godot/data/news.json，安装包由官网工作流从 GitHub Releases 的 godot-proto 下载到 dist/
const PC = JSON.parse(fs.readFileSync(path.join(ROOT, 'godot', 'data', 'news.json'), 'utf8'))[0];
const DL = [
  { id: 'pc', src: path.join(DIST, 'GraffiBots-Godot-Windows.zip'), file: `graffibots-pc-${PC.ver}-windows.zip`, latest: 'graffibots-pc-latest-windows.zip', ver: PC.ver },
  { id: 'offline', src: path.join(DIST, '涂鸦机兵-单文件版.html'), file: `graffibots-${S.VERSION}-offline.html`, latest: 'graffibots-latest-offline.html' },
  { id: 'win', src: path.join(DIST, 'GraffiBots-Windows.zip'), file: `graffibots-${S.VERSION}-windows.zip`, latest: 'graffibots-latest-windows.zip' },
  { id: 'full', src: path.join(DIST, 'GraffiBots.zip'), file: `graffibots-${S.VERSION}-full.zip`, latest: 'graffibots-latest-full.zip' },
  { id: 'apk', src: apk, file: `graffibots-${S.VERSION}.apk`, latest: 'graffibots-latest.apk' },
];
const downloads = DL.map((d) => {
  const have = !!(d.src && fs.existsSync(d.src));
  return { id: d.id, file: `downloads/${d.latest}?v=${d.ver || S.VERSION}`, name: d.file, size: have ? fs.statSync(d.src).size : 0, have: have && argv.includes('--downloads'), ver: d.ver || S.VERSION };
});

const data = {
  version: S.VERSION, date: latest.date, title: latest.title, en_title: latest.en_title,
  season: { name: E.SEASON && E.SEASON.name, ends: E.SEASON && E.SEASON.end },
  counts: { pilots: pilots.length, mechs: mechs.length, maps: maps.length, modes: modes.length, skins: (S.SKINS || []).length, talents: (S.TALENTS || []).length },
  notes, pilots, mechs, modes, maps, downloads, roles, ring,
  // 3.0：电脑版正式版公告（首页置顶 + 更新日志第一条）
  pc: Object.assign({}, PC, { release: 'https://github.com/Lizard0727/GraffiBots/releases/tag/godot-proto',
    shots: [
      { img: 'img/pc30-draft.jpg', cap: '排位选人 + 3D 模型', en_cap: 'Ranked draft with 3D models' },
      { img: 'img/pc30-profile.jpg', cap: '个人资料与展示框', en_cap: 'Profile & showcase' },
      { img: 'img/pc30-bigmap.jpg', cap: '搜刮撤离大地图', en_cap: 'Loot & Extract big map' },
      { img: 'img/pc30-results.jpg', cap: '结算评级', en_cap: 'Match ratings' },
    ] }),
  // 最新版本的截图（换版本时改这里）
  shots: [
    { img: 'img/v14-park.jpg', cap: '乐园模式', en_cap: 'Park Mode', sub: '花车巡游 + 打气球', en_sub: 'Parade float + balloons' },
    { img: 'img/v14-summer.jpg', cap: '夏日系列 + 新角色卡卡', en_cap: 'Summer skins + new pilot Kaka', sub: '1.4 新内容', en_sub: 'New in 1.4' },
    { img: 'img/v14-ranked.jpg', cap: '排位赛禁用阶段', en_cap: 'Ranked ban phase', sub: '黄金段位起', en_sub: 'From Gold tier' },
  ],
  og: 'img/pc30-draft.jpg',
};

// ---- 发布到网上：官网地址、搜索引擎（SEO）----
let siteCfg = {};
try { siteCfg = JSON.parse(fs.readFileSync(path.join(SITE, 'site.config.json'), 'utf8')); } catch (e) { /* 没有设置文件 */ }
const cfgJs = fs.readFileSync(path.join(PUB, 'config.js'), 'utf8').match(/GB_SITE_URL\s*\|\|\s*'([^']*)'/);
let BASE = (opt('--base') || siteCfg.url || (cfgJs && cfgJs[1]) || '').trim();
if (BASE && !BASE.endsWith('/')) BASE += '/';
const H = (x) => String(x).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const DESC = '涂鸦机兵 GraffiBots 官方网站：4 对 4 的涂料机甲乱斗，开着机兵把灰色的城市涂回彩色。免费在浏览器里玩，或下载离线版、安卓版，查看每次更新的内容。';
const EN_DESC = 'GraffiBots official site: a 4v4 paint-mech brawler where you spray a gray city back into color. Play free in your browser or download the offline and Android versions.';
function seoBlock() {
  const abs = (u) => (BASE ? BASE + u : u);
  const tags = [];
  if (BASE) tags.push(`<link rel="canonical" href="${H(BASE)}">`);
  tags.push(`<meta property="og:type" content="website">`, `<meta property="og:site_name" content="涂鸦机兵 GraffiBots">`,
    `<meta property="og:title" content="涂鸦机兵 GraffiBots｜4v4 涂料机甲对战游戏">`, `<meta property="og:description" content="${H(DESC)}">`,
    `<meta property="og:image" content="${H(abs(data.og))}">`, `<meta property="og:image:width" content="1280">`, `<meta property="og:image:height" content="720">`,
    `<meta property="og:locale" content="zh_CN">`, `<meta property="og:locale:alternate" content="en_US">`,
    `<meta name="twitter:card" content="summary_large_image">`, `<meta name="twitter:title" content="涂鸦机兵 GraffiBots">`, `<meta name="twitter:description" content="${H(EN_DESC)}">`, `<meta name="twitter:image" content="${H(abs(data.og))}">`);
  if (BASE) tags.push(`<meta property="og:url" content="${H(BASE)}">`);
  if (siteCfg.googleVerification) tags.push(`<meta name="google-site-verification" content="${H(siteCfg.googleVerification)}">`);
  const ld = { '@context': 'https://schema.org', '@type': 'VideoGame', name: '涂鸦机兵 GraffiBots', alternateName: 'GraffiBots', description: DESC, inLanguage: ['zh-CN', 'en'],
    genre: ['Action', 'Shooter', 'Multiplayer'], gamePlatform: ['Web browser', 'Android'], applicationCategory: 'Game', operatingSystem: 'Windows, macOS, Linux, Android',
    playMode: ['MultiPlayer', 'SinglePlayer'], numberOfPlayers: { '@type': 'QuantitativeValue', minValue: 1, maxValue: 8 }, softwareVersion: S.VERSION, datePublished: notes[notes.length - 1].date, dateModified: latest.date,
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' }, image: abs(data.og) };
  if (BASE) ld.url = BASE;
  tags.push(`<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>`);
  return tags.join('\n');
}
function noscriptBlock() {
  const N = latest;
  return `<noscript><div class="wrap" style="padding-block:24px">
<h1>涂鸦机兵 GraffiBots</h1><p>${H(DESC)}</p><p>${H(EN_DESC)}</p>
<p>当前版本 ${H(S.VERSION)}（${H(N.date)}）。驾驶员 ${pilots.length} 位 · 机兵 ${mechs.length} 台 · 地图 ${maps.length} 张 · 玩法 ${modes.length} 种。</p>
<h2>${H(N.title)}</h2>${N.sections.map(([h, items]) => `<h3>${H(h)}</h3><ul>${items.map((x) => `<li>${H(x)}</li>`).join('')}</ul>`).join('')}
<h2>驾驶员</h2><ul>${pilots.map((p) => `<li>${H(p.name)}（${H(p.en)}）：${H(p.title)}，随身武器「${H(p.side)}」</li>`).join('')}</ul>
<h2>玩法</h2><ul>${modes.map((m) => `<li>${H(m.name)}：${H(m.desc)}</li>`).join('')}</ul>
<p><a href="#download">下载 / Download</a> · <a href="#updates">更新日志 / Patch notes</a></p>
</div></noscript>`;
}
{
  let html = fs.readFileSync(path.join(SITE, 'index.html'), 'utf8');
  html = html.replace(/(<!-- seo:start[^>]*-->)[\s\S]*?(<!-- seo:end -->)/, (m, a, b) => `${a}\n${seoBlock()}\n${b}`)
    .replace(/(<!-- noscript:start[^>]*-->)[\s\S]*?(<!-- noscript:end -->)/, (m, a, b) => `${a}\n${noscriptBlock()}\n${b}`);
  fs.writeFileSync(path.join(SITE, 'index.html'), html);
  fs.writeFileSync(path.join(SITE, 'robots.txt'), `User-agent: *\nAllow: /\n${BASE ? `Sitemap: ${BASE}sitemap.xml\n` : ''}`);
  if (BASE) fs.writeFileSync(path.join(SITE, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>${H(BASE)}</loc><lastmod>${latest.date}</lastmod><changefreq>weekly</changefreq><priority>1.0</priority></url>\n</urlset>\n`);
  fs.writeFileSync(path.join(SITE, '404.html'), `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>找不到页面｜涂鸦机兵 GraffiBots</title><meta name="robots" content="noindex">
<link rel="icon" href="${H(BASE || './')}img/icon.png">
<style>:root{color-scheme:dark}body{margin:0;min-height:100vh;display:grid;place-items:center;background:#1c1b21;color:#f2eee6;font:16px/1.6 system-ui,'PingFang SC','Microsoft YaHei',sans-serif;padding:24px}
main{max-width:30em;text-align:center}b{display:block;font-size:72px;line-height:1;color:#ffe600;text-shadow:4px 4px 0 #141018,8px 8px 0 #ff3ea5;transform:rotate(-3deg)}a{color:#ffe600;font-weight:800}</style></head>
<body><main><b>404</b><h1>这面墙上什么都没有</h1><p>你要找的页面不存在。 / This page doesn't exist.</p><p><a href="${H(BASE || './')}">回到涂鸦机兵官网 / Back to GraffiBots</a></p></main></body></html>
`);
  console.log(BASE ? `官网地址：${BASE}（canonical、sitemap.xml、分享图都用这个地址）` : '（没有设置官网地址：不生成 canonical 和 sitemap.xml）');
}

// ---- 写文件 ----
const js = `// 由 tools/build-site.js 生成，不要手改（改 public/shared.js 里的版本号和更新公告）\nwindow.GB_SITE = ${JSON.stringify(data)};\n`;
fs.writeFileSync(path.join(SITE, 'data.js'), js);
// 游戏读取这个文件判断有没有新版本；force: true = 下载版必须更新才能继续玩
fs.writeFileSync(path.join(SITE, 'version.json'), JSON.stringify({
  version: S.VERSION, date: latest.date, title: latest.title, en_title: latest.en_title, page: '#updates', force: true,
  notes: latest.sections.map((x) => x[0]), en_notes: latest.en.map((x) => x[0]),
}, null, 2) + '\n');
fs.mkdirSync(path.join(SITE, 'fonts'), { recursive: true });
for (const f of ['huangyou.woff2', 'bangers.woff2', 'marker.woff2', 'FONTS-LICENSE.txt']) fs.copyFileSync(path.join(PUB, 'fonts', f), path.join(SITE, 'fonts', f));
fs.copyFileSync(path.join(PUB, 'icon-192.png'), path.join(SITE, 'img', 'icon.png'));
console.log(`site/data.js：版本 ${S.VERSION}，${notes.length} 条公告，${pilots.length} 位驾驶员（${(Buffer.byteLength(js) / 1024).toFixed(0)} KB）`);

const out = opt('--out') ? path.resolve(opt('--out')) : SITE;
if (out !== SITE) { fs.rmSync(out, { recursive: true, force: true }); fs.cpSync(SITE, out, { recursive: true, filter: (f) => !f.includes(`${path.sep}downloads`) && !f.endsWith('site.config.json') && !f.includes(`${path.sep}game${path.sep}`) }); }
// 官网的 3D 驾驶员展示台直接用游戏的渲染代码（node server.js 时 /site/game/ 会映射到 public/）
if (out !== SITE) {
  fs.mkdirSync(path.join(out, 'game', 'vendor'), { recursive: true });
  for (const f of ['shared.js', 'render3d.js', 'vendor/three.min.js', 'vendor/THREE-LICENSE.txt']) fs.copyFileSync(path.join(PUB, f), path.join(out, 'game', f));
}
if (argv.includes('--downloads')) {
  fs.mkdirSync(path.join(out, 'downloads'), { recursive: true });
  for (const d of DL) if (d.src && fs.existsSync(d.src)) { fs.copyFileSync(d.src, path.join(out, 'downloads', d.file)); fs.copyFileSync(d.src, path.join(out, 'downloads', d.latest)); console.log('  下载包', d.file, '+', d.latest); }
  else console.log('  （没有找到', d.id, '的安装包，官网上会显示「暂未提供」）');
  if (out !== SITE) fs.copyFileSync(path.join(SITE, 'data.js'), path.join(out, 'data.js'));
}
if (out !== SITE) console.log('官网已输出到', path.relative(ROOT, out) || out);
// --zip 文件名：把输出的官网打成一个压缩包，可以直接上传到 Netlify / Cloudflare Pages 等任何静态网站托管
if (opt('--zip')) {
  const zf = path.resolve(opt('--zip'));
  fs.rmSync(zf, { force: true });
  const r = require('child_process').spawnSync('zip', ['-qr', zf, '.'], { cwd: out, stdio: 'inherit' });
  console.log(r.status === 0 ? `官网压缩包：${path.relative(ROOT, zf)}（${(fs.statSync(zf).size / 1048576).toFixed(1)} MB）` : '（没有 zip 命令，跳过打包）');
}

// ---- 单页版（claude.ai 网页）：样式、脚本、字体、图片全部内联 ----
if (argv.includes('--artifact')) {
  const b64 = (f) => fs.readFileSync(f).toString('base64');
  let html = fs.readFileSync(path.join(SITE, 'index.html'), 'utf8');
  const cfg = { play: opt('--play') || 'https://claude.ai/artifact/FuL4mh2DHsZpsNnfMNP3m7', home: opt('--home') || 'https://lizard0727.github.io/GraffiBots/' };
  data.downloads = data.downloads.map((d) => ({ ...d, have: false }));
  for (const s of data.shots) s.img = 'data:image/jpeg;base64,' + b64(path.join(SITE, s.img));
  for (const p of data.pilots) if (p.img) p.img = 'data:image/png;base64,' + b64(path.join(SITE, p.img));
  html = html.replace(/url\('fonts\/([^']+)'\)/g, (m, f) => `url('data:font/woff2;base64,${b64(path.join(SITE, 'fonts', f))}')`)
    .replace('<script src="data.js"></script>', () => `<script>window.GB_SITE = ${JSON.stringify(data)}; window.GB_SITE_CFG = ${JSON.stringify(cfg)};</script>`
      + `\n<script src="https://cdn.jsdelivr.net/npm/three@0.149.0/build/three.min.js"></script>\n<script>${fs.readFileSync(path.join(PUB, 'shared.js'), 'utf8').replace(/<\/script/gi, '<\\/script')}</script>\n<script>${fs.readFileSync(path.join(PUB, 'render3d.js'), 'utf8').replace(/<\/script/gi, '<\\/script')}</script>`)
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
