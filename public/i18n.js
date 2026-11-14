// 涂鸦机兵 — 多语言（中文 / English）
// 游戏代码里的文字都写中文；切到英文时，在「显示」这一步替换成英文：
//   1. 整句完全匹配词典（i18n-en.js）
//   2. 带数字的句式用正则规则（PATTERNS）
//   3. 剩下的按片段替换（长的先换），再把中文标点换成英文标点
// 页面上的文字由 MutationObserver 自动翻译（包括之后动态插入的），画布上的 HUD 文字由 client.js 的 txt() 调用 tr()。
// 服务器发来的提示也是中文，到客户端显示时同样会被翻译，所以服务器不用改。
(function () {
  'use strict';
  const KEY = 'gb_lang';
  const detect = () => (/^zh/i.test((navigator.languages && navigator.languages[0]) || navigator.language || '') ? 'zh' : 'en');
  let lang = detect();
  try { const v = JSON.parse(localStorage.getItem(KEY)); if (v === 'zh' || v === 'en') lang = v; } catch (e) { /* 没存过就按系统语言 */ }
  const D = window.GB_EN || {};
  const CJK = /[一-鿿]/;
  const TIER = { 高级: 'Premium', 免费: 'Free' };
  // 带数字 / 名字的句式（先于片段替换）
  const PATTERNS = [
    [/(我方|对方)拿下第 (\d+) 局！（(\d+) : (\d+)）/g, (m, w, r, a, b) => `${w === '我方' ? 'We' : 'They'} took round ${r}! (${a} : ${b})`],
    [/第 (\d+) 局 · 开始！/g, 'Round $1 · FIGHT!'],
    [/每局 (\d+) 次。/g, '$1 uses per match.'],
    [/发现新版本 ([\d.]+)（你正在玩的是 ([\d.]+)）/g, 'New version $1 is out (you have $2)'],
    [/^新版本 ([\d.]+)$/g, 'New: v$1'],
    [/涂鸦机兵 ([\d.]+) 已经发布。你现在的版本 ([\d.]+) 需要更新到最新版本才能继续游玩。/g, 'GraffiBots $1 is out. Your version $2 must be updated before you can keep playing.'],
    [/^([\d.]+) 新版本已发布$/g, 'Version $1 is out'],
    [/机兵(\d+)/g, 'Pilot$1'],
    [/被淘汰（第 (\d+) 名）/g, 'eliminated (#$1)'],
    [/第 (\d+) 局/g, 'Round $1'],
    [/第 (\d+) 名/g, '#$1'],
    [/赢 (\d+) 局/g, 'Win $1 matches'],
    [/完成 (\d+) 局对战/g, 'Play $1 matches'],
    [/击毁 \/ 击倒 (\d+) 次/g, 'Get $1 takedowns'],
    [/涂地 (\d+) 格/g, 'Paint $1 tiles'],
    [/拿到 (\d+) 次 MVP/g, 'Earn MVP $1 times'],
    [/玩 (\d+) 局生死之战/g, 'Play $1 Last Stand matches'],
    [/玩 (\d+) 局逃亡圈/g, 'Play $1 Escape Circle matches'],
    [/逃亡圈进入前三名 (\d+) 次/g, 'Finish top 3 in Escape Circle $1 times'],
    [/逃亡圈捡 (\d+) 个空投箱/g, 'Grab $1 airdrops in Escape Circle'],
    [/存活 (\d+) 队 · (\d+) 人/g, '$1 teams · $2 alive'],
    [/(\d+) 秒后缩圈/g, 'Circle shrinks in $1s'],
    [/安全区（(\d+) 秒后收缩）/g, 'Safe zone (shrinks in $1s)'],
    [/驾驶员弹出！活下去 —— 新机体 ([\d.]+) 秒后就地空投/g, 'Pilot ejected! Survive — new mech in $1s'],
    [/重新部署 ([\d.]+)s/g, 'Redeploying in $1s'],
    [/升到了 (\d+) 级！/g, 'reached Lv.$1!'],
    [/升到 (\d+) 级：/g, 'Upgrade to Lv.$1: '],
    [/需要先升到 (\d+) 级/g, 'Reach level $1 first'],
    [/通行证升到 (\d+) 级才能领/g, 'Reach pass level $1 to claim'],
    [/通行证 (高级|免费)线 (\d+) 级/g, (m, t, n) => `Pass ${TIER[t]} track, tier ${n}`],
    [/要先完成 (\d+) 个任务/g, 'Complete $1 tasks first'],
    [/完成 (\d+) 个：/g, '$1 tasks: '],
    [/最多带 (\d+) 个天赋，先卸下一个/g, 'You can equip up to $1 talents — unequip one first'],
    [/再开一个（还剩 (\d+)）/g, 'Open another ($1 left)'],
    [/有 (\d+) 个宝箱没开/g, '$1 unopened chests'],
    [/有 (\d+) 个奖励可领/g, '$1 rewards to claim'],
    [/赛季剩余 (\d+) 天/g, 'Season ends in $1 days'],
    [/能量 \+1（共 (\d+) 层）/g, 'Power +1 ($1 stacks)'],
    [/(\d+) 天 (\d+) 小时/g, '$1d $2h'], [/(\d+) 小时 (\d+) 分/g, '$1h $2m'], [/(\d+) 分 (\d+) 秒/g, '$1m $2s'],
    [/(\d+) 解锁「/g, '$1 unlocks “'],
    [/对战 (\d+)/g, 'Matches $1'], [/胜利 (\d+)/g, 'Wins $1'], [/击毁 (\d+)/g, 'Takedowns $1'], [/涂地 (\d+)/g, 'Paint $1'],
    [/×(\d+)（共 (\d+)）/g, '×$1 (total $2)'],
  ];
  const PUNCT = [[/，/g, ', '], [/。/g, '. '], [/：/g, ': '], [/；/g, '; '], [/！/g, '! '], [/？/g, '? '], [/、/g, ', '], [/（/g, ' ('], [/）/g, ') '],
    [/「|『/g, '“'], [/」|』/g, '”'], [/…/g, '…'], [/～/g, '~'], [/　/g, ' '], [/——/g, ' — ']];
  let FRAG = null;
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  function fragRe() {
    if (!FRAG) FRAG = new RegExp(Object.keys(D).filter((k) => CJK.test(k)).sort((a, b) => b.length - a.length).map(esc).join('|'), 'g');
    return FRAG;
  }
  const cache = new Map();
  function tr(s) {
    if (lang !== 'en' || typeof s !== 'string' || !CJK.test(s)) return s;
    const hit = cache.get(s);
    if (hit !== undefined) return hit;
    let out;
    const t = s.trim();
    if (D[t] !== undefined) out = s.replace(t, D[t]);
    else {
      out = s;
      for (const [re, rep] of PATTERNS) out = out.replace(re, rep);
      out = out.replace(fragRe(), (m) => { const e = D[m]; return /^\w/.test(e) || /\w$/.test(e) ? ` ${e} ` : e; });
      for (const [re, rep] of PUNCT) out = out.replace(re, rep);
      out = out.replace(/ {2,}/g, ' ').replace(/ ([,.!?:;)”])/g, '$1').replace(/([(“]) /g, '$1').replace(/^ +| +$/g, (m) => (s.startsWith(' ') || s.endsWith(' ') ? ' ' : ''));
    }
    if (cache.size > 4000) cache.clear();
    cache.set(s, out);
    return out;
  }
  // ---------------- 页面自动翻译 ----------------
  const ATTRS = ['placeholder', 'title', 'aria-label'];
  const done = new WeakMap();   // 文本节点 → 我们写进去的英文（避免重复翻译自己）
  function trText(n) {
    const v = n.nodeValue;
    if (!v || done.get(n) === v || !CJK.test(v)) return;
    const p = n.parentNode;
    if (p && (p.nodeName === 'SCRIPT' || p.nodeName === 'STYLE' || (p.closest && p.closest('[data-noi18n]')))) return;
    const out = tr(v);
    done.set(n, out);
    if (out !== v) n.nodeValue = out;
  }
  function trEl(el) {
    for (const a of ATTRS) { const v = el.getAttribute && el.getAttribute(a); if (v && CJK.test(v)) el.setAttribute(a, tr(v)); }
  }
  function walk(root) {
    if (root.nodeType === 3) return trText(root);
    if (root.nodeType !== 1) return;
    trEl(root);
    const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    let n;
    while ((n = tw.nextNode())) { if (n.nodeType === 3) trText(n); else trEl(n); }
  }
  function start() {
    document.documentElement.lang = lang === 'en' ? 'en' : 'zh-CN';
    if (lang !== 'en') return;
    document.title = tr(document.title);
    walk(document.body);
    new MutationObserver((list) => {
      for (const m of list) {
        if (m.type === 'characterData') trText(m.target);
        else if (m.type === 'attributes') trEl(m.target);
        else for (const n of m.addedNodes) walk(n);
      }
    }).observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  }
  window.GBI18N = {
    get lang() { return lang; },
    tr,
    set(l) { if (l !== 'zh' && l !== 'en') return; try { localStorage.setItem(KEY, JSON.stringify(l)); } catch (e) { /* ignore */ } location.reload(); },
    start,
  };
  if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);
})();
