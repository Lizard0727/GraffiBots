// 把整个游戏打包成一个 HTML 文件（手机 / 网盘 / 聊天软件里转发更方便）
// 用法：node tools/build-single.js            → dist/涂鸦机兵-单文件版.html（全部内联，离线可用）
//       node tools/build-single.js --cdn      → dist/涂鸦机兵-网页版.html（three.js / PeerJS 走 CDN，体积更小）
//       node tools/build-single.js --artifact → dist/artifact.html（发布到 claude.ai 网页：无外层 html 标签、不含 P2P）
'use strict';
const fs = require('fs'), path = require('path');
const PUB = path.join(__dirname, '..', 'public'), OUT = path.join(__dirname, '..', 'dist');
const artifact = process.argv.includes('--artifact');
const cdn = artifact || process.argv.includes('--cdn');
const CDN = { 'vendor/three.min.js': 'https://cdn.jsdelivr.net/npm/three@0.149.0/build/three.min.js', 'vendor/peerjs.min.js': 'https://cdn.jsdelivr.net/npm/peerjs@1.5.4/dist/peerjs.min.js' };
let html = fs.readFileSync(path.join(PUB, 'index.html'), 'utf8');
const esc = (js) => js.replace(/<\/script/gi, '<\\/script');
// 样式表内联，字体文件转成 data URI
const css = fs.readFileSync(path.join(PUB, 'style.css'), 'utf8').replace(/url\('fonts\/([^']+)'\)/g, (m, f) => `url('data:font/woff2;base64,${fs.readFileSync(path.join(PUB, 'fonts', f)).toString('base64')}')`);
html = html.replace(/<link rel="stylesheet" href="style.css">/, () => `<style>\n${css}\n</style>`);
// 图标内联成 data URI，去掉 manifest（单文件无法被安装为 PWA）
const icon = 'data:image/png;base64,' + fs.readFileSync(path.join(PUB, 'icon-192.png')).toString('base64');
html = html.replace(/<link rel="manifest"[^>]*>\n?/, '').replace(/href="icon-192.png"/g, () => `href="${icon}"`);
html = html.replace(/<script>window\.THREE \|\|[^\n]*<\/script>\n?/, '');
html = html.replace(/<script src="([^"]+)"><\/script>/g, (m, src) => {
  if (cdn && CDN[src]) return `<script src="${CDN[src]}"></script>`;
  return `<script>\n${esc(fs.readFileSync(path.join(PUB, src), 'utf8'))}\n</script>`;
});
html = html.replace('<head>', `<head>\n  <script>window.GB_SINGLE = true;${artifact ? ' window.GB_ARTIFACT = true;' : ''}</script>`);
if (artifact) {
  // claude.ai 网页的外壳会自己加 doctype/html/head/body；那里不允许 WebRTC，所以不加载 PeerJS
  html = html.replace(/<script src="[^"]*peerjs[^"]*"><\/script>\n?/, '')
    .replace(/<!doctype html>\n?/i, '').replace(/<html[^>]*>\n?/, '').replace(/<\/html>\s*$/, '')
    .replace(/<head>\n?/, '').replace(/<\/head>\n?/, '').replace(/<body>\n?/, '').replace(/<\/body>\n?/, '')
    .replace(/<meta charset="utf-8">\n?/, '').replace(/ *<meta name="viewport"[^>]*>\n?/, '');
  // 标题必须在文件开头 8KB 内
  const t = html.match(/ *<title>[^<]*<\/title>\n?/);
  if (t) html = t[0].trim() + '\n' + html.replace(t[0], '');
}
fs.mkdirSync(OUT, { recursive: true });
const name = artifact ? 'artifact.html' : cdn ? '涂鸦机兵-网页版.html' : '涂鸦机兵-单文件版.html';
fs.writeFileSync(path.join(OUT, name), html);
console.log(`已生成 dist/${name}（${(Buffer.byteLength(html) / 1024).toFixed(0)} KB）`);
