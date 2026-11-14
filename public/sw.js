// 涂鸦机兵：离线缓存（网页通过 http/https 打开时生效，可「添加到主屏幕」当 App 用）
const CACHE = 'graffibots-v15';
const FILES = ['./', 'index.html', 'style.css', 'shared.js', 'portraits.js', 'audio.js', 'core.js', 'render3d.js', 'client.js',
  'icons.js', 'wall.js', 'account.js', 'economy.js', 'i18n.js', 'i18n-en.js', 'config.js', 'fonts/huangyou.woff2', 'fonts/bangers.woff2', 'fonts/marker.woff2', 'vendor/three.min.js', 'vendor/peerjs.min.js', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  // 先用网络（拿到最新版本），断网时用缓存
  e.respondWith(fetch(e.request).then((r) => { const cp = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, cp)); return r; }).catch(() => caches.match(e.request)));
});
