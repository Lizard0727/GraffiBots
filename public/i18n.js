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
    [/^组队中 (\d+)\/(\d+)$/g, 'In party $1/$2'],
    [/^(\d+) 人 · 在线 (\d+) 人$/g, '$1 friends · $2 online'],
    [/^邀请你一起玩「(.+)」$/g, (m, t) => `invites you to play ${tr(t)}`],
    [/^「(.+)」$/g, (m, t) => tr(t)],
    [/^队长选择模式后开始 · 当前「(.*)」$/g, (m, t) => `The leader picks the mode · now ${tr(t)}`],
    [/^和好友组队 · (\d+) 人，其余 AI 补位$/g, 'Party of $1 · AI fills the rest'],
    [/^队长选择 · (.+)$/g, (m, t) => `Leader's pick · ${tr(t)}`],
    [/^(.+) 想加你为好友$/g, '$1 wants to be your friend'], [/^(.+) 通过了你的好友申请$/g, '$1 accepted your friend request'],
    [/^已邀请 (.+)$/g, 'Invited $1'], [/^正在加入 (.+) 的队伍…$/g, "Joining $1's party…"],
    [/^「(.+)」每队 (\d+) 人：队伍里多出来的人会分到别的队$/g, (m, t, n) => `${tr(t)} has ${n} per team: extra party members go to other teams`],
    [/^(.+) 还没凑齐 3 位驾驶员和 3 台机体，不能组队排位$/g, "$1 doesn't have 3 pilots and 3 mechs yet, so the party can't play Ranked"],
    [/^(.+) 正在对局中$/g, '$1 is in a match'], [/^(.+) 的队伍已满$/g, "$1's party is full"], [/^(.+) 拒绝了邀请$/g, '$1 declined the invite'],
    [/^好友码：(.+)$/g, 'Friend code: $1'], [/^删除好友「(.+)」？$/g, 'Remove friend $1?'], [/^队伍最多 (\d+) 人$/g, 'Parties can have up to $1 players'],
    [/^(\d+) 件物资 · 点击进入$/g, '$1 items · tap to open'],
    [/^你排第 (\d+) 名$/g, "You're #$1"],
    [/^仓库价值 ([\d,]+)$/g, 'Warehouse $1'],
    [/^(.+) ×(\d+)$/g, (m, t, n) => `${tr(t)} ×${n}`],
    [/^还剩 (.+)$/g, (m, t) => `Ends in ${tr(t)}`],
    [/^(.+) 后开始$/g, (m, t) => `Starts in ${tr(t)}`],
    [/^(.+) 后过期，过期会自动删除$/g, (m, t) => `Expires in ${tr(t)}, then it's deleted`],
    [/^(.+) 后过期$/g, (m, t) => `Expires in ${tr(t)}`],
    [/^(\d+) \/ (\d+) 完成$/g, '$1 / $2 done'], [/^(\d+) \/ (\d+) 已领$/g, '$1 / $2 claimed'],
    [/^背包 (\d+)\/(\d+)$/g, 'Bag $1/$2'], [/^价值 ([\d,]+)$/g, 'Value $1'],
    [/^剩余小队 (\d+) · (高危|普通)$/g, (m, n, r) => `Squads left ${n} · ${r === '高危' ? 'High-Risk' : 'Normal'}`],
    [/^撤离点开放 (\d+) 个 · 下一个 (\d+) 秒$/g, '$1 extraction open · next in $2s'], [/^撤离点开放 (\d+) 个$/g, '$1 extraction open'],
    [/^撤离点 (\d+) 秒后开放$/g, 'Extraction opens in $1s'], [/^(\d+) 秒后开放$/g, 'Opens in $1s'],
    [/^\+ (.+)（(.+) · ([\d,]+)）$/g, (m, a, b, c) => `+ ${tr(a)} (${tr(b)} · ${c})`],
    [/^带出物资价值 ([\d,]+)(.*)$/g, (m, v, rest) => `Loot value ${v}${rest ? tr(rest) : ''}`],
    [/^带出 ([\d,]+)$/g, 'Extracted $1'],
    [/^带出的物资 · (\d+) 件（已存入仓库）$/g, 'Extracted loot · $1 items (sent to warehouse)'],
    [/^(.+) 成功撤离（([\d,]+)）$/g, '$1 extracted ($2)'],
    [/^高危行动阵亡，丢失装备：(.+)$/g, (m, t) => `Died in a High-Risk Run, lost gear: ${tr(t)}`],
    [/^卖出获得 (\d+) 金币$/g, 'Sold for $1 coins'], [/^全部卖出（([\d,]+) 金币）$/g, 'Sell all ($1 coins)'],
    [/^买到「(.+)」$/g, (m, t) => `Bought ${tr(t)}`], [/^兑换：(.+)$/g, (m, t) => `Trade: ${tr(t)}`],
    [/^(.+) · 占 (\d+) 格$/g, (m, r, n) => `${tr(r)} · ${n} slot${n > 1 ? 's' : ''}`],
    [/^(\d+) 金币$/g, '$1 coins'], [/^(\d+) 人$/g, '$1'],
    [/搜刮撤离成功撤离 (\d+) 次/g, 'Extract successfully $1 times'], [/累计撤离价值 (\d+) 的物资/g, 'Extract $1 total loot value'],
    [/带出 (\d+) 件传说物资/g, 'Extract $1 legendary items'], [/高危行动成功撤离 (\d+) 次/g, 'Extract from a High-Risk Run $1 times'], [/玩 (\d+) 局搜刮撤离/g, 'Play $1 Extraction runs'],
    [/^金币不够（需要 (\d+)）$/g, 'Not enough coins (need $1)'],
    [/(\d+) \/ (\d+)（突破后上限更高）/g, '$1 / $2 (breakthrough raises the cap)'],
    [/([QR]) 键 · 每局 (\d+) 次/g, (m, k, n) => `${k} key · ${n} per match`],
    [/E 键 \/ 右键 · 充能 (\d+)/g, 'E / right-click · charge $1'],
    [/换上擅长机体「([^」]+)」/g, (m, t) => `Use signature mech ${tr(t)}`],
    [/^换上「([^」]+)」$/g, (m, t) => `Now using ${tr(t)}`],
    [/^(.+) 出战！$/g, (m, t) => `${tr(t)} is ready!`],
    [/^完成「活动 → ([^」]+)」全部任务免费获得$/g, (m, t) => `Free for finishing every quest in Events → ${tr(t)}`],
    [/^任务机体：完成「活动 → ([^」]+)」(\d+) 个任务免费获得$/g, (m, t, n) => `Quest mech: free for finishing ${n} quests in Events → ${tr(t)}`],
    [/(我方|对方)拿下第 (\d+) 局！（(\d+) : (\d+)）/g, (m, w, r, a, b) => `${w === '我方' ? 'We' : 'They'} took round ${r}! (${a} : ${b})`],
    [/第 (\d+) 局 · 开始！/g, 'Round $1 · FIGHT!'],
    [/每局 (\d+) 次。/g, '$1 uses per match.'],
    [/发现新版本 ([\d.]+)（你正在玩的是 ([\d.]+)）/g, 'New version $1 is out (you have $2)'],
    [/^新版本 ([\d.]+)$/g, 'New: v$1'],
    [/再拿 (\d+) 分升到「([^」]+)」/g, (m, n, t) => `${n} more points to reach ${tr(t)}`],
    [/共打了 (\d+) 局/g, '$1 matches played'],
    [/本时段玩法（每 (\d+) 小时轮换）/g, 'Current mode (rotates every $1h)'],
    [/后换成「([^」]+)」/g, (m, t) => ` until it switches to ${tr(t)}`],
    [/赢 \+(\d+) · 输 (-\d+) · MVP \+(\d+)/g, 'Win +$1 · Loss $2 · MVP +$3'],
    [/金币和通行证经验 ×([\d.]+) · ([^起]+)起有禁用阶段/g, (m, k, t) => `Coins and pass XP ×${k} · bans from ${tr(t)}`],
    [/还需要 (.+?)才能参加排位赛（至少 (\d+) 位驾驶员和 (\d+) 台机体）。去「活动 → 新兵之路」领新手宝箱吧！/g, (m, w, a, b) => `You still need ${w.replace(/(\d+) 位驾驶员/, '$1 pilots').replace(/(\d+) 台机体/, '$1 mechs').replace('、', ' and ')} to play Ranked (at least ${a} pilots and ${b} mechs). Get starter chests from Events → Rookie Path!`],
    [/开始比赛 · (.+)/g, (m, t) => `Start match · ${tr(t)}`],
    [/^([\d.]+) 分$/g, '$1 pts'],
    [/排位分 ([+-]?\d+)（(\S+) (\d+)）/g, (m, d, t, rp) => `Rank points ${d} (${tr(t)} ${rp})`],
    [/⬆ 晋级「([^」]+)」！/g, (m, t) => `⬆ Promoted to ${tr(t)}!`],
    [/⬇ 降到「([^」]+)」/g, (m, t) => `⬇ Dropped to ${tr(t)}`],
    [/首次到达(\S+)/g, (m, t) => `first time reaching ${tr(t)}`],
    [/(\d+) 连胜/g, '$1-win streak'],
    [/剩 (\d+) \/ (\d+)/g, '$1 / $2 left'],
    [/(\d+) 乐园票/g, '$1 Park Tickets'],
    [/乐园票不够（需要 (\d+)）/g, 'Not enough Park Tickets (need $1)'],
    [/删除了 (\d+) 封邮件/g, 'Deleted $1 mails'],
    [/后过期$/g, ' left'],
    [/克制你的(\S+)/g, (m, t) => `Counters your ${tr(t)}`],
    [/^(\S+?)段位还没有禁用阶段，直接选择出战组合$/g, (m, t) => `No ban phase at ${tr(t)} yet — just choose your loadout`],
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
