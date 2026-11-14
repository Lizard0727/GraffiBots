// 1.4.1：AI 机兵的「玩家性格」+ 打字聊天
//   性格：菜鸟 / 猪队友 / 挂机 / 不错 / 高手 / 操作顶尖 / 大神 —— 反应、瞄准、走位、决策都不一样
//   普通赛混着出；排位赛段位越高，高手、顶尖、大神越多（队友和对手都一样）
//   AI 用玩家风格的名字、会穿皮肤、会打字（骂对手、甩锅、夸人、闲聊、回你的话），中英双语
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.GBBots = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const B = {};
  const rnd = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

  // ---------------- 性格 ----------------
  //   react 看见敌人到开火的反应时间；aim 瞄准抖动；lead 提前量；fire 每帧扣扳机的概率
  //   strafe 换方向的间隔；strafeK 横移幅度；jump 跳跃间隔；retreat 残血撤退线（0 = 从不撤）
  //   skill/ov 技能、超载的使用积极度；lv 等级浮动；wander 不去目标点、到处乱逛的概率
  //   pow 实力（用来平衡两队）；chat 话多不多
  B.PERSONAS = {
    noob:   { name: '菜鸟', en: 'Rookie', react: [0.45, 0.85], aim: 0.42, lead: 0.1, fire: 0.28, paint: 1.5, strafe: [0.9, 2.0], strafeK: 0.35, jump: [2.5, 6], retreat: 0, skill: 0.012, ov: 0.02, lv: -2, wander: 0.25, freeze: 0.004, pow: 0.2, chat: 0.55, skin: 0.1, styles: { noob: 6, nice: 3, chill: 1 } },
    pig:    { name: '猪玩家', en: 'Feeder', react: [0.3, 0.55], aim: 0.34, lead: 0.25, fire: 0.35, paint: 1.3, strafe: [0.6, 1.6], strafeK: 0.5, jump: [0.6, 1.6], retreat: 0, skill: 0.03, ov: 0.15, lv: -1, wander: 0.25, waste: true, noWheel: 0.6, chase: true, pow: 0.35, chat: 0.8, skin: 0.3, styles: { toxic: 5, noob: 2, chill: 2, show: 1 } },
    afk:    { name: '挂机', en: 'AFK', react: [0.25, 0.45], aim: 0.24, lead: 0.4, fire: 0.45, paint: 1.1, strafe: [0.5, 1.3], strafeK: 0.6, jump: [1.5, 4], retreat: 0.25, skill: 0.03, ov: 0.08, lv: 0, wander: 0.05, afk: true, pow: 0.3, chat: 0.15, skin: 0.2, styles: { afk: 6, chill: 3, nice: 1 } },
    decent: { name: '不错', en: 'Decent', react: [0.15, 0.35], aim: 0.18, lead: 0.6, fire: 0.5, paint: 1, strafe: [0.4, 1.1], strafeK: 0.8, jump: [1.2, 3.5], retreat: 0.3, skill: 0.04, ov: 0.1, lv: 0, wander: 0, pow: 1, chat: 0.35, skin: 0.35, styles: { nice: 5, chill: 3, toxic: 1 } },
    expert: { name: '高手', en: 'Expert', react: [0.1, 0.22], aim: 0.11, lead: 0.85, fire: 0.7, paint: 0.8, trueLead: true, strafe: [0.35, 0.9], strafeK: 0.9, jump: [1, 2.6], retreat: 0.35, skill: 0.06, ov: 0.25, lv: 1, wander: 0, focus: true, pow: 1.6, chat: 0.4, skin: 0.5, styles: { lead: 4, nice: 2, toxic: 2, chill: 1 } },
    top:    { name: '操作顶尖', en: 'Mechanical', react: [0.06, 0.14], aim: 0.06, lead: 1, fire: 0.9, paint: 0.9, trueLead: true, strafe: [0.18, 0.5], strafeK: 0.95, jump: [0.5, 1.5], retreat: 0.25, skill: 0.06, ov: 0.3, lv: 1, wander: 0, pow: 2, chat: 0.55, skin: 0.6, styles: { show: 5, toxic: 2, lead: 1 } },
    god:    { name: '大神', en: 'Godlike', react: [0.05, 0.12], aim: 0.05, lead: 1, fire: 0.88, paint: 0.7, trueLead: true, strafe: [0.25, 0.7], strafeK: 1, jump: [0.8, 2.2], retreat: 0.3, skill: 0.08, ov: 0.35, lv: 2, wander: 0, focus: true, smart: true, pow: 2.4, chat: 0.3, skin: 0.7, styles: { chill: 3, lead: 3, show: 1, toxic: 1 } },
  };
  B.ORDER = ['noob', 'pig', 'afk', 'decent', 'expert', 'top', 'god'];
  // 权重：普通赛 + 排位赛 7 个段位（青铜 → 传奇）
  B.MIX = {
    normal: [16, 9, 5, 34, 20, 9, 7],
    rank: [
      [26, 14, 7, 35, 12, 4, 2],    // 青铜
      [18, 12, 6, 38, 17, 6, 3],    // 白银
      [10, 10, 5, 37, 24, 9, 5],    // 黄金
      [5, 7, 4, 32, 31, 13, 8],     // 铂金
      [2, 5, 3, 25, 35, 18, 12],    // 钻石
      [1, 3, 2, 17, 37, 22, 18],    // 大师
      [0, 2, 1, 10, 35, 26, 26],    // 传奇
    ],
  };
  B.mix = (tier) => (tier == null || tier < 0 ? B.MIX.normal : B.MIX.rank[Math.min(B.MIX.rank.length - 1, tier | 0)]);
  B.roll = (tier) => {
    const w = B.mix(tier), tot = w.reduce((a, b) => a + b, 0);
    let r = Math.random() * tot;
    for (let i = 0; i < w.length; i++) { r -= w[i]; if (r < 0) return B.ORDER[i]; }
    return 'decent';
  };
  B.persona = (id) => B.PERSONAS[id] || B.PERSONAS.decent;
  // 给一局里所有 AI 分配性格；两队实力差太多就重新抽（最多 4 次），不会一边全是大神
  //   slots: [{team}]，humans: {team: 人数}
  B.assign = (slots, tier, humans) => {
    let best = null, bestGap = Infinity;
    for (let k = 0; k < 5; k++) {
      const ids = slots.map(() => B.roll(tier));
      const pow = {};
      for (const t in humans) pow[t] = (pow[t] || 0) + humans[t] * 1.2;
      slots.forEach((s, i) => { pow[s.team] = (pow[s.team] || 0) + B.persona(ids[i]).pow; });
      const v = Object.values(pow), gap = v.length > 1 ? Math.max(...v) - Math.min(...v) : 0;
      if (gap < bestGap) { best = ids; bestGap = gap; }
      if (gap <= 2.2) break;
    }
    return best;
  };

  // ---------------- 名字：像真人玩家 ----------------
  B.NICKS_ZH = ['今晚吃涂料', '小明不会玩', '喷漆小王子', '阿杰', '奶茶三分糖', '摸鱼专业户', '一只咸鱼', '涂鸦大王', '快乐小狗', '别打我脸', '月半猫', '路过的程序员',
    '周末打游戏', '橘子汽水', '我是新手', '不要再送了', '冲就完事', '老王', '小雨', '夜猫子', '芒果布丁', '划水的鱼', '泡面加蛋', '下课了吗', '小透明', '可乐不加冰',
    '风一样的男子', '甜甜圈', '躺平青年', '早睡失败', '螺蛳粉', '山东大汉', '阿伟', '柠檬精', '机兵爱好者', '放学别走', '菜但是快乐', '一个路人', '豆浆油条', '清风',
    '喵喵队长', '大白', '秋刀鱼', '小鹿乱撞', '睡不醒', '只会滚刷', '狙神在此', '冰糖雪梨', '小番茄', '饭团', '老六', '社恐', '小刘同学', '熬夜冠军', '稳住别浪'];
  B.NICKS_EN = ['xXSniperXx', 'Kiwi', 'momo233', 'Lucas_07', 'paintgod', 'notabot', 'sleepyfox', 'ZeroLag', 'Tofu', 'SprayKing', 'nugget', 'Rex', 'lilpanda', 'Mia',
    'GGWP', 'potato_aim', 'Neo', 'ghost404', 'Juno', 'kitkat', 'Blitz', 'ezclap', 'Pixel', 'samurai_jack', 'Vex', 'CoolBeans', 'oliver', 'dunk', 'Ash', 'TurboTim',
    'yuki', 'Bean', 'ProGamer2010', 'wasabi', 'Felix', 'chill_guy', 'Nova', 'banana', 'Dex', 'mochi', 'LeoTheLion', 'Rookie_01', 'zzz', 'Hiro', 'xiaoming', 'Ace'];
  B.nicks = (n, lang) => {
    const used = new Set(), out = [];
    const zhShare = lang === 'en' ? 0.3 : 0.7;
    for (let i = 0; i < n; i++) {
      for (let k = 0; k < 20; k++) {
        let s = pick(Math.random() < zhShare ? B.NICKS_ZH : B.NICKS_EN);
        if (Math.random() < 0.3) s += /[一-鿿]$/.test(s) ? pick(['', '丶', '_', '']) + Math.floor(rnd(1, 999)) : Math.floor(rnd(1, 99));
        s = s.slice(0, 12);
        if (!used.has(s)) { used.add(s); out.push(s); break; }
      }
      if (out.length <= i) out.push('玩家' + Math.floor(rnd(1000, 9999)));
    }
    return out;
  };
  // 外观：越强的性格越可能穿稀有皮肤；段位框只在高段位出现
  B.looks = (S, pilot, persona, tier) => {
    const P = B.persona(persona), L = {};
    const own = (k) => k.price > 0 || k.pass || (k.event && Math.random() < 0.5) || (k.rank === 'master' && tier >= 5);
    const choose = (kind, extra) => { const list = S.SKINS.filter((k) => k.kind === kind && (!extra || extra(k)) && own(k)); return list.length ? pick(list).id : ''; };
    if (Math.random() < P.skin) L.pskin = choose('pilot', (k) => k.pilot === pilot);
    if (Math.random() < P.skin * 0.8) L.paint = choose('mech');
    if (Math.random() < P.skin * 0.6) L.fx = choose('fx');
    if (Math.random() < P.skin) L.frame = choose('frame');
    if (Math.random() < 0.5) L.avatar = choose('avatar');
    for (const k in L) if (!L[k]) delete L[k];
    return L;
  };

  // ---------------- 聊天 ----------------
  //   每句 [中文, English]；按「风格」分组：nice 友好 / toxic 嘴臭（温和）/ noob 新手 / chill 佛系 / show 炫技 / lead 指挥 / afk 挂机
  const L = (zh, en) => [zh, en];
  B.LINES = {
    start: {
      nice: [L('大家加油', 'gl hf'), L('glhf', 'glhf'), L('来来来 好好打', "let's go team"), L('冲冲冲', 'lets gooo'), L('稳住 我们能赢', 'we got this')],
      toxic: [L('别送就行', 'just dont feed'), L('这把要是输了别怪我', "if we lose its not on me"), L('队友靠谱点', 'pls dont throw'), L('又是这张图。。', 'this map again...')],
      noob: [L('这个怎么放大招啊', 'how do i use super'), L('第一次玩排位 有点慌', 'first time here lol'), L('带带我', 'carry me pls'), L('我用什么好', 'what should i play'), L('hello', 'hello')],
      chill: [L('随便打打', 'just vibing'), L('hi', 'hi'), L('晚上好', 'evening all'), L('打完这把睡觉', 'last game then bed'), L('🙂', '🙂')],
      show: [L('跟紧我 带你们飞', 'stick with me, ill carry'), L('这把我C', 'ill carry this one'), L('看我表演', 'watch this'), L('对面几个人？', 'how many on their team')],
      lead: [L('先抢中路', 'take mid first'), L('别分散 一起推', 'stay together, push as 4'), L('我守家 你们上', 'i hold back, you push'), L('优先涂地', 'paint first, fight later'), L('注意草丛', 'watch the bushes')],
      afk: [],
    },
    kill: {
      nice: [L('拿下', 'got one'), L('nice', 'nice'), L('一个', 'one down'), L('漂亮', 'clean')],
      toxic: [L('就这？', 'is that it?'), L('ez', 'ez'), L('回去练练吧', 'go practice lol'), L('太菜了', 'too easy'), L('下一个', 'next'), L('坐下', 'sit')],
      noob: [L('我杀了一个！！', 'I GOT ONE!!'), L('哇我打中了', 'omg i hit him'), L('哈哈哈哈', 'hahaha'), L('运气好', 'lucky')],
      chill: [L('嗯', 'k'), L('+1', '+1'), L('hhh', 'lol')],
      show: [L('看到没', 'did you see that'), L('秒了', 'deleted'), L('一换零', 'free'), L('手感来了', 'im warmed up now'), L('谁还来', 'who else')],
      lead: [L('对面少一个 上', 'theyre down one, push'), L('杀了一个 推进', 'one down, go go'), L('开团', 'engage!')],
      afk: [],
    },
    killed: {
      nice: [L('被偷了', 'got picked'), L('我的', 'my bad'), L('对面这人有点强', 'that guy is good'), L('wp', 'wp')],
      toxic: [L('卡了', 'lag'), L('这也能打到？', 'how did that hit'), L('什么鬼', 'wtf'), L('队友呢？？', 'where is my team??'), L('没人帮我', 'no help at all'), L('???', '???')],
      noob: [L('啊我死了', 'oh no i died'), L('怎么死的', 'how did i die'), L('哪里打我的', 'where was he'), L('对不起', 'sorry')],
      chill: [L('哎', 'oof'), L('算了', 'whatever'), L('。。。', '...')],
      show: [L('失误了', 'misplay'), L('手滑', 'slipped'), L('2打1 不算', '2v1 doesnt count')],
      lead: [L('对面在左边', "they're on the left"), L('草里有人', 'someone in the bush'), L('小心狙', 'watch the sniper')],
      afk: [],
    },
    allyDied: {
      nice: [L('没事 稳住', 'its ok, regroup'), L('我来了', 'coming'), L('等我', 'wait for me')],
      toxic: [L('又送？', 'again??'), L('别一个人冲啊', 'stop going in alone'), L('会不会玩啊', 'do you even play'), L('醉了', 'bruh'), L('你在干嘛', 'what are you doing')],
      noob: [L('我去救你', 'ill save you'), L('啊', 'ahh')],
      chill: [L('rip', 'rip'), L('f', 'f')],
      show: [L('我一个人打他们', 'ill 1v3 then'), L('交给我', 'leave it to me')],
      lead: [L('先退 等复活', 'back off, wait for respawn'), L('别硬拼', "don't force it"), L('一起上 别单走', 'group up')],
      afk: [],
    },
    streakDeath: {
      nice: [L('今天手感不行', 'off day for me'), L('对不起大家', 'sorry guys')],
      toxic: [L('这游戏平衡呢', 'this game is so unbalanced'), L('不玩了', 'im done'), L('对面开了吧', 'theyre hacking'), L('这匹配机制。。', 'matchmaking is broken')],
      noob: [L('好难啊', 'this is hard'), L('怎么老是死', 'why do i keep dying')],
      chill: [L('哈哈 被虐', 'getting farmed lol')],
      show: [L('换个打法', 'switching it up'), L('认真了', 'ok now im serious')],
      lead: [L('我们打得太散了', "we're too spread out")],
      afk: [],
    },
    multi: {
      nice: [L('三杀！', 'triple!'), L('哈哈 舒服', 'that felt good')],
      toxic: [L('一个能打的都没有', 'none of you can play'), L('全是送的', 'free kills')],
      noob: [L('我好厉害！', 'im so good!'), L('哇哦', 'woah')],
      chill: [L('还行', 'not bad')],
      show: [L('看我操作', 'look at that'), L('1打3', '1v3 ez'), L('这才叫操作', 'thats how you play')],
      lead: [L('现在推！', 'push now!')],
      afk: [],
    },
    praise: {
      nice: [L('nice', 'nice'), L('666', 'nice one'), L('好强', 'so good'), L('漂亮！', 'beautiful'), L('大佬带我', 'carry me boss')],
      toxic: [L('终于干了点事', 'finally did something')],
      noob: [L('好厉害', 'wow so good'), L('怎么做到的', 'how did you do that')],
      chill: [L('👍', '👍'), L('牛', 'nice')],
      show: [L('还行吧 没我强', 'not bad, not me though')],
      lead: [L('就这样打', 'keep doing that'), L('好 继续', 'good, keep going')],
      afk: [],
    },
    winning: {
      nice: [L('优势 别浪', "we're ahead, dont throw"), L('保持住', 'keep it up')],
      toxic: [L('对面太菜了', 'they are so bad'), L('这把稳了', 'gg already')],
      noob: [L('我们是不是要赢了', 'are we winning?')],
      chill: [L('稳', 'chill')],
      show: [L('没难度', 'too easy')],
      lead: [L('守住就赢', 'just hold and we win'), L('别追太深', "don't chase too far")],
      afk: [],
    },
    losing: {
      nice: [L('还有机会', 'still winnable'), L('别放弃', "don't give up")],
      toxic: [L('这队友。。', 'this team...'), L('投了吧', 'just ff'), L('带不动', 'cant carry this'), L('能不能涂一下地', 'can someone paint pls')],
      noob: [L('我们输了吗', 'are we losing?')],
      chill: [L('输了就输了', 'its just a game')],
      show: [L('看我翻盘', 'watch me turn this')],
      lead: [L('最后一波 一起上', 'last push all together'), L('先涂地 别打架', 'paint, stop fighting')],
      afk: [],
    },
    idle: {
      nice: [L('这图挺好玩的', 'i like this map'), L('有人一起组队吗', 'anyone wanna team up after'), L('新角色好看', 'new skins look good')],
      toxic: [L('对面那个狙好烦', 'that sniper is so annoying'), L('谁在拖后腿', 'who is throwing')],
      noob: [L('R键是什么', 'what does R do'), L('滚轮怎么开', 'how do i use the wheel'), L('这个角色强吗', 'is this pilot good')],
      chill: [L('外卖到了', 'food is here'), L('好困', 'so sleepy'), L('今天第十把了', '10th game today'), L('乐园模式好玩', 'park mode is fun')],
      show: [L('对面一个能打的都没有', 'no one over there can aim')],
      lead: [L('去右边涂', 'paint the right side'), L('守中间', 'hold middle'), L('跟我走', 'follow me')],
      afk: [],
    },
    afkBack: {
      afk: [L('刚去拿外卖了', 'sorry was getting food'), L('回来了', 'back'), L('sorry 刚刚掉线了', 'sorry disconnected'), L('我妈叫我', 'mom called me'), L('brb', 'brb'), L('怎么已经开始了', 'wait it started already?')],
    },
    endWin: {
      nice: [L('gg', 'gg'), L('ggwp', 'ggwp'), L('打得好', 'well played'), L('gg 队友给力', 'gg great team')],
      toxic: [L('gg ez', 'gg ez'), L('太简单了', 'too easy'), L('下次找点对手', 'need better opponents')],
      noob: [L('赢了！！', 'WE WON!!'), L('耶', 'yay')],
      chill: [L('gg', 'gg'), L('gg', 'gg'), L('不错', 'nice')],
      show: [L('躺赢的举手', 'raise your hand if you got carried'), L('MVP是我吧', 'mvp is me right')],
      lead: [L('gg 配合不错', 'gg good teamwork')],
      afk: [L('gg', 'gg')],
    },
    endLose: {
      nice: [L('gg', 'gg'), L('wp', 'wp'), L('对面打得好', 'they played well'), L('下把加油', 'next one')],
      toxic: [L('什么队友', 'what a team'), L('举报了', 'reported'), L('gg 带不动', 'gg cant carry'), L('这匹配', 'matchmaking lol')],
      noob: [L('对不起是我太菜了', 'sorry i was bad'), L('输了。。', 'we lost...')],
      chill: [L('gg', 'gg'), L('gg', 'gg'), L('再来', 'again')],
      show: [L('我尽力了', 'i tried'), L('看我数据', 'check my stats')],
      lead: [L('gg 下把注意配合', 'gg, group up more next time')],
      afk: [L('gg', 'gg'), L('sorry', 'sorry')],
    },
  };
  // 回复真人的话：先分类，再按风格挑
  B.REPLY = {
    bot: {
      nice: [L('我是真人啊', "i'm a real person lol"), L('不是', 'nope'), L('？？我是人', '?? im human')],
      toxic: [L('你才是人机', "you're the bot"), L('人机能打你？', 'a bot is beating you?'), L('打不过就说人机', 'cope'), L('？', '?')],
      noob: [L('什么是人机', "what's a bot"), L('我是新手。。', "i'm just new...")],
      chill: [L('哈哈', 'lol'), L('你猜', 'guess lol'), L('？', '?')],
      show: [L('人机有我这操作？', 'can a bot play like me?'), L('谢谢夸奖', 'thanks for the compliment')],
      lead: [L('别聊了 专心打', 'focus the game'), L('打字慢 别管', 'typing slow, ignore')],
      afk: [L('？', '?'), L('刚刚在吃饭', 'was eating')],
    },
    hi: {
      nice: [L('hi', 'hi'), L('你好呀', 'hey there'), L('嗨', 'yo')], toxic: [L('嗯', 'k')], noob: [L('你好！', 'hello!')], chill: [L('hi', 'hi'), L('👋', '👋')], show: [L('hi', 'sup')], lead: [L('hi 跟我走', 'hi, follow me')], afk: [L('hi', 'hi')],
    },
    gg: {
      nice: [L('gg', 'gg'), L('ggwp', 'ggwp')], toxic: [L('gg ez', 'gg ez'), L('gg', 'gg')], noob: [L('gg！', 'gg!')], chill: [L('gg', 'gg')], show: [L('gg', 'gg')], lead: [L('gg', 'gg')], afk: [L('gg', 'gg')],
    },
    insult: {
      nice: [L('别吵了 好好打', 'chill, just play'), L('冷静', 'calm down')],
      toxic: [L('你行你上', 'you do better then'), L('说的跟你很强一样', 'like you are any better'), L('看看你自己的数据', 'check your own stats'), L('急了', 'mad?')],
      noob: [L('对不起。。', 'sorry...'), L('我在努力了', "i'm trying")],
      chill: [L('哈哈', 'lol'), L('ok', 'ok')],
      show: [L('看比分说话', 'scoreboard says otherwise'), L('？', '?')],
      lead: [L('别骂了 听我指挥', 'stop flaming, follow my calls')],
      afk: [L('？', '?')],
    },
    praise: {
      nice: [L('谢谢', 'thanks'), L('你也不错', 'you too'), L('嘿嘿', 'hehe')], toxic: [L('那当然', 'obviously')], noob: [L('真的吗！', 'really?!'), L('谢谢！', 'thank you!')],
      chill: [L('ty', 'ty'), L('🙏', '🙏')], show: [L('基操', 'basic stuff'), L('常规操作', 'just normal for me')], lead: [L('继续保持', 'keep it up')], afk: [L('ty', 'ty')],
    },
    help: {
      nice: [L('来了', 'coming'), L('马上到', 'on my way')], toxic: [L('自己扛一下', 'deal with it yourself'), L('没空', 'busy')], noob: [L('我在哪', 'where am i'), L('我来了！', 'coming!')],
      chill: [L('ok', 'ok')], show: [L('交给我', 'leave it to me')], lead: [L('收到 往你那边走', 'roger, heading to you')], afk: [],
    },
    laugh: {
      nice: [L('哈哈哈', 'hahaha')], toxic: [L('笑什么', 'whats so funny')], noob: [L('哈哈哈哈哈', 'hahahaha')], chill: [L('hhh', 'lol')], show: [L('哈', 'ha')], lead: [L('哈哈 专心', 'lol focus')], afk: [],
    },
    ask: {
      nice: [L('不知道诶', 'not sure'), L('我也不太清楚', 'idk tbh')], toxic: [L('自己看', 'figure it out'), L('？', '?')], noob: [L('我也想知道', 'i wanna know too')],
      chill: [L('随便吧', 'whatever works')], show: [L('看我怎么打就知道了', 'just watch me')], lead: [L('跟着我就行', 'just follow me')], afk: [],
    },
    other: {
      nice: [L('嗯嗯', 'yeah'), L('好', 'ok'), L('哈哈', 'haha')], toxic: [L('？', '?'), L('别说了', 'stop typing')], noob: [L('啊？', 'huh?')],
      chill: [L('嗯', 'mhm'), L('ok', 'ok')], show: [L('嗯', 'ya')], lead: [L('专心打', 'focus')], afk: [],
    },
  };
  B.classify = (text) => {
    const t = String(text).toLowerCase();
    if (/人机|机器人|\bai\b|\bbots?\b|电脑|脚本|npc|假人/.test(t)) return 'bot';
    if (/^\s*(gg|ggwp|gg ez|good game)/.test(t)) return 'gg';
    if (/菜|垃圾|废物|noob|trash|bad|会不会|送|sb|idiot|stupid|loser|笨/.test(t)) return 'insult';
    if (/nice|666|厉害|强|牛|好样|wp|well played|good job|gj|漂亮|帅/.test(t)) return 'praise';
    if (/help|救|支援|来人|帮/.test(t)) return 'help';
    if (/^(hi|hello|hey|yo|你好|哈喽|嗨|在吗)/.test(t)) return 'hi';
    if (/哈哈|hhh|lol|lmao|xd|😂/.test(t)) return 'laugh';
    if (/[?？]|怎么|什么|为什么|how|what|why/.test(t)) return 'ask';
    return 'other';
  };
  B.style = (persona) => {
    const w = B.persona(persona).styles, tot = Object.values(w).reduce((a, b) => a + b, 0);
    let r = Math.random() * tot;
    for (const k in w) { r -= w[k]; if (r < 0) return k; }
    return 'nice';
  };
  // 从某个场景里挑一句（这个风格没话说就换一个风格，还没有就不说）
  B.line = (table, trigger, persona) => {
    const T = table[trigger];
    if (!T) return null;
    const st = B.style(persona);
    let arr = T[st];
    if (!arr || !arr.length) { if (st === 'afk' || Math.random() < 0.5) return null; arr = T.nice || T.chill; }
    return arr && arr.length ? pick(arr) : null;
  };
  // 真人打字的样子：小写、少标点、偶尔打错字、拖长
  const ZH_TYPO = { 的: '得', 在: '再', 了: '啦', 吗: '嘛', 吧: '把', 好: '号', 我: '窝' };
  B.humanize = (zh, en) => {
    let a = zh, b = en, fix = null;
    if (Math.random() < 0.35) b = b.toLowerCase();
    if (Math.random() < 0.3) { a = a.replace(/[。！!，,]$/, ''); b = b.replace(/[.!,]$/, ''); }
    if (Math.random() < 0.12) {
      const ks = Object.keys(ZH_TYPO).filter((k) => a.includes(k));
      if (ks.length) { const k = pick(ks); a = a.replace(k, ZH_TYPO[k]); }
    }
    if (Math.random() < 0.12 && /[a-z]{4,}/i.test(b)) {
      const words = b.split(' '), wi = words.findIndex((w) => /^[a-z]{4,}$/i.test(w));
      if (wi >= 0) {
        const w = words[wi], i = 1 + Math.floor(Math.random() * (w.length - 2));
        const typo = Math.random() < 0.5 ? w.slice(0, i) + w[i + 1] + w[i] + w.slice(i + 2) : w.slice(0, i) + w[i] + w.slice(i);
        if (Math.random() < 0.4) fix = ['*' + w, '*' + w];
        words[wi] = typo; b = words.join(' ');
      }
    }
    if (Math.random() < 0.08) { if (/哈+$/.test(a)) a += '哈哈'; else if (/[？?]$/.test(a)) { a += '??'; b += '??'; } }
    return { zh: a, en: b, fix };
  };
  // 打字要多久（秒）：中文要拼音输入，慢一点
  B.typeTime = (zh) => rnd(0.6, 1.8) + zh.length * rnd(0.14, 0.3);
  return B;
});
