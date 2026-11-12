// 把整个游戏打包成一个 HTML 文件（手机 / 网盘 / 聊天软件里转发更方便）
// 用法：node tools/build-single.js            → dist/涂鸦机兵-单文件版.html（全部内联，离线可用）
//       node tools/build-single.js --cdn      → dist/涂鸦机兵-网页版.html（three.js / PeerJS 走 CDN，体积更小）
'use strict';
const fs = require('fs'), path = require('path');
const PUB = path.join(__dirname, '..', 'public'), OUT = path.join(__dirname, '..', 'dist');
const cdn = process.argv.includes('--cdn');
const CDN = { 'vendor/three.min.js': 'https://cdn.jsdelivr.net/npm/three@0.149.0/build/three.min.js', 'vendor/peerjs.min.js': 'https://cdn.jsdelivr.net/npm/peerjs@1.5.4/dist/peerjs.min.js' };
let html = fs.readFileSync(path.join(PUB, 'index.html'), 'utf8');
const esc = (js) => js.replace(/<\/script/gi, '<\\/script');
html = html.replace(/<link rel="stylesheet" href="style.css">/, () => `<style>\n${fs.readFileSync(path.join(PUB, 'style.css'), 'utf8')}\n</style>`);
// 图标内联成 data URI，去掉 manifest（单文件无法被安装为 PWA）
const icon = 'data:image/png;base64,' + fs.readFileSync(path.join(PUB, 'icon-192.png')).toString('base64');
html = html.replace(/<link rel="manifest"[^>]*>\n?/, '').replace(/href="icon-192.png"/g, () => `href="${icon}"`);
html = html.replace(/<script>window\.THREE \|\|[^\n]*<\/script>\n?/, '');
html = html.replace(/<script src="([^"]+)"><\/script>/g, (m, src) => {
  if (cdn && CDN[src]) return `<script src="${CDN[src]}"></script>`;
  return `<script>\n${esc(fs.readFileSync(path.join(PUB, src), 'utf8'))}\n</script>`;
});
html = html.replace('<head>', '<head>\n  <script>window.GB_SINGLE = true;</script>');
fs.mkdirSync(OUT, { recursive: true });
const name = cdn ? '涂鸦机兵-网页版.html' : '涂鸦机兵-单文件版.html';
fs.writeFileSync(path.join(OUT, name), html);
console.log(`已生成 dist/${name}（${(Buffer.byteLength(html) / 1024).toFixed(0)} KB）`);
