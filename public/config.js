// 涂鸦机兵 — 发布配置
// 官网地址（末尾带 /）。离线版、单文件版和安卓版会读取「官网地址 + version.json」，
// 发现比自己新的版本时在大厅顶部提示玩家去官网下载。
// 用 node server.js 开服时不看这里：官网就在同一台服务器的 /site/ 下。
// 官网用 GitHub Pages 发布（.github/workflows/site.yml）；换了地址就改这里再重新打包。
window.GB_SITE_URL = window.GB_SITE_URL || 'https://lizard0727.github.io/GraffiBots/';
// 2.1.1：统一的游戏服务器（在线账号）。填上运行 node server.js 的地址（例如 'wss://game.example.com/ws'）后，
// 网页版、HTML 文件版、Windows 版、安卓版都会连这台服务器，用同一套在线账号；留空 = 没有服务器时使用本机账号。
// 玩家也可以在登录页「连接游戏服务器」里自己填地址（保存在这台设备上）。
window.GB_SERVER_URL = window.GB_SERVER_URL || '';
