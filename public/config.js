// 涂鸦机兵 — 发布配置
// 官网地址（末尾带 /）。离线版、单文件版和安卓版会读取「官网地址 + version.json」，
// 发现比自己新的版本时在大厅顶部提示玩家去官网下载。
// 用 node server.js 开服时不看这里：官网就在同一台服务器的 /site/ 下。
// 官网用 GitHub Pages 发布（.github/workflows/site.yml）；换了地址就改这里再重新打包。
window.GB_SITE_URL = window.GB_SITE_URL || 'https://lizard0727.github.io/GraffiBots/';
