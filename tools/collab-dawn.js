// 涂鸦机兵 电脑版 3.1 ——「黎明之后」系列联动（原创世界观）
// 只给电脑版用：tools/export-godot-data.js 和 tools/export-godot-art.js 在导出前把这里的数据合并进 shared.js / economy.js 的表里
// 网页里（立绘渲染）用 window.GBDawn，node 里 require 返回同一个对象
//
// 世界观：持续七年的「长夜」在一个清晨结束了。长夜留下的「夜蚀」还在大地上结晶，被夜蚀感染的人身上会长出「蚀痕」，
// 获得奇怪的能力，也会被它一点点吃掉。移动救援组织「拂晓站」开着陆行列车「启明号」穿过荒原，收容结晶、救回幸存者。
// 这一次，启明号停在了灰城外面。
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.GBDawn = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const D = { id: 'dawn', name: '黎明之后', nameEn: 'After Dawn' };
  const T0 = Date.UTC(2026, 10, 22, 4), T1 = Date.UTC(2026, 11, 13, 16);   // 活动时间：3 周

  // ---------------- 机甲 ----------------
  D.WEAPONS = {
    halo: {
      name: '晨轮机兵', short: '晨轮', role: '回旋光轮',
      desc: '扔出一枚光轮：飞到尽头停一下再飞回来，来回都穿透敌人、都涂地。接住光轮下一发更快；回程命中伤害 ×1.4。',
      hp: 120, spd: 1.05, reload: 0.9, atkCd: 0.4, attack: 'disc', range: 330, dmg: 30, back: 1.4, speed: 900, backSpeed: 1050, hover: 0.15,
      catchCut: 0.4, autoBack: 1.6, size: 12, splat: 16, trail: 12, blind: 1.2, special: 'corona', spNeed: 230, collab: 'dawn', isNew: true,
    },
    chord: {
      name: '共鸣机兵', short: '共鸣', role: '共鸣拴索',
      desc: '射出一根共鸣索拴住敌人，持续吸取生命（每秒 30 起，每秒 +25%，最多 3 秒），吸到的伤害 30% 回给自己。离太远或被墙挡住索会断。',
      hp: 125, spd: 1.0, reload: 1.0, atkCd: 0.35, attack: 'tether', range: 330, leash: 380, dmg: 30, ramp: 0.25, tetherT: 3, drain: 0.3, speed: 900, size: 7,
      splat: 10, trail: 6, fork: 140, special: 'resnet', spNeed: 240, collab: 'dawn', isNew: true,
    },
    vigil: {
      name: '守夜机兵', short: '守夜', role: '格挡反击',
      desc: '点按是灯刃两连斩；按住举起夜幕盾（正面减伤 70%），松开打出反斩：伤害 = 40 + 挡下的伤害。举盾瞬间挨打是完美格挡。',
      hp: 190, spd: 0.96, reload: 0.85, atkCd: 0.42, attack: 'guard', range: 74, arc: 1.7, dmg: 40, dmg2: 46, kb: 90, lunge: 100, paintR: 44,
      block: 0.7, guardMax: 2.5, counter: 40, counterCap: 120, parry: 0.2, parryMul: 1.5, stun: 0.4, special: 'longnight', spNeed: 220, collab: 'dawn', isNew: true,
    },
  };
  D.TRAITS = {
    halo: { name: '回旋光轮', desc: '光轮飞回来时伤害 ×1.4；一次投掷里来回都被打中的敌人会被「致盲」1.2 秒（攻击散布变大）。' },
    chord: { name: '共振', desc: '被拴住的敌人身边 140 范围内还有敌人时，共鸣索会分叉连上其中一个（伤害减半）。' },
    vigil: { name: '完美格挡', desc: '举盾 0.2 秒内挨的那一下完全挡下，反斩伤害 ×1.5，并让对手眩晕 0.4 秒。' },
  };
  D.SPECIALS = {
    corona: { name: '日冕环', desc: '5 秒内三枚光轮绕着自己旋转（半径 110），每枚对同一个敌人每 0.25 秒造成 18 伤害；期间扔出去的光轮体积 +50%。' },
    resnet: { name: '谐振网', desc: '同时拴住前方扇形里最多 3 个敌人，持续 4 秒：打在其中一人身上的伤害有 40% 同时打到另外几人身上（全队的伤害都算），结束时把他们拉到一起。' },
    longnight: { name: '长夜', desc: '展开半径 260 的黑暗 6 秒：里面的敌人只能看见 150 以内的东西；自己移动速度 +20%，打「2 秒内没打过你」的敌人伤害 +30%。' },
    finale: { name: '绝响', desc: '尾声驾驶共鸣机兵、余韵叠满 5 层时，谐振网变成终结技「绝响」：锁定准星附近的一个敌人，两人进入只有彼此能看见的终章（期间无敌），结束时无视机甲直接击倒驾驶员。' },
  };

  // ---------------- 驾驶员（干员） ----------------
  D.SKILLS = {
    dial: { short: '定晷', name: '定晷', desc: '把日晷冻结在当前阶段 3 秒，期间这一阶段的效果 ×1.5。' },
    rewind: { short: '回溯', name: '回溯', desc: '回到 2.5 秒前的位置，生命也回到那时（最多回 35%）；身上的回响立刻以 70% 伤害全部重演。' },
    settle: { short: '清偿', name: '清偿', desc: '引爆身上的全部夜债，对周围 160 范围造成「夜债 × 70%」的伤害，然后夜债清零。' },
  };
  D.PILOTS = [
    {
      id: 'xiwei', name: '熹微', code: '拾光', title: '拂晓站 · 拾光者', weapon: 'halo', accent: '#ffc24a', isNew: true, collab: 'dawn',
      hair: '#f6ead2', hair2: '#ffb648', skin: '#fde6d4', eye: '#ffae2a', style: 'braid', eyeShape: 'round', mouth: 'smile', outfit: 'dawnGlimmer', extra: ['sunpin'],
      skill: 'dial',
      passive: { name: '晨昏刻度', desc: '脚下的日晷按 破晓→正午→黄昏→夜 循环（每段 4 秒，命中让日晷快进）。破晓回血、涂地变大；正午伤害 +18% 并给敌人叠「灼光」；黄昏命中引爆灼光（每层 9 伤害，回一半血）；夜伤害 -15%、移速 +15%。每转满一圈得 1 层「日轮」（最多 4 层，每层伤害 +4%、生命上限 +3%）。' },
      line: '光会回来的——我亲眼见过一次。',
      bio: '拂晓站的拾光者，长夜结束那天站在启明号车顶，接住了第一缕阳光。从那以后，她身边的光会跟着一个看不见的日晷流转。总是笑着说「天会亮的」，却从来不提自己在长夜里丢了什么。',
      faction: '拂晓站', archive: ['身高 158cm', '蚀痕：左手腕的日晷纹', '喜欢：清晨的车顶、热牛奶', '讨厌：熄灯以后的车厢'],
    },
    {
      id: 'coda', name: '尾声', code: '残响', title: '拂晓站 · 残响者', weapon: 'chord', accent: '#7ad8ff', isNew: true, collab: 'dawn',
      hair: '#2a3048', hair2: '#7ad8ff', skin: '#f4e0d4', eye: '#7ad8ff', style: 'swept', eyeShape: 'cool', mouth: 'calm', outfit: 'dawnCoda', extra: ['phones'],
      skill: 'rewind',
      passive: { name: '残响', desc: '造成的伤害另外有 35% 记成目标身上的「回响」（每人最多 120）。2.5 秒内没再打它，回响就一次性重演成真实伤害（无视护盾和减伤）；一直打着它，回响就一直攒。回响打死人会把一半传给 220 内最近的敌人。每次回响重演叠 1 层「余韵」（最多 5 层，倒下清空）。直接伤害 -10%。' },
      line: '这一段，我替你记住了。',
      bio: '长夜里唯一还在广播的电台主持人。她的蚀痕让她能「录下」声音和伤痛，再原样放出来——代价是自己的记忆一段段变成杂音。她随身带着一盘写着「不要洗掉」的旧磁带，却已经想不起里面录的是谁。',
      faction: '拂晓站', archive: ['身高 165cm', '蚀痕：耳后的波形纹', '喜欢：旧磁带、雨声', '讨厌：完全的安静'],
    },
    {
      id: 'xiao', name: '宵', code: '守夜', title: '拂晓站 · 守夜人', weapon: 'vigil', accent: '#9a7aff', isNew: true, collab: 'dawn',
      hair: '#16141e', hair2: '#9a7aff', skin: '#efd8c8', eye: '#b49cff', style: 'hood', eyeShape: 'sharp', mouth: 'calm', outfit: 'dawnXiao', extra: ['moonmark'],
      skill: 'settle',
      passive: { name: '夜债', desc: '受到的伤害 40% 先记成「夜债」，之后每秒偿还剩余的 12%（至少 4 点）。背着夜债时伤害提高（每 3 点 +1%，最多 +30%）。造成伤害的 20% 用来抵消夜债；击毁 / 击倒敌人清空夜债，并获得「清掉的夜债 × 50%」的护盾。夜债超过当前生命时会「资不抵债」。' },
      line: '这一夜，算在我账上。',
      bio: '启明号的守夜人，从不在白天出现。长夜里他替整节车厢的人「背」下了黑暗，蚀痕就是那笔还不清的债。他说等最后一笔夜债还完就去看一次日出——没人知道那笔债还剩多少。',
      faction: '拂晓站', archive: ['身高 178cm', '蚀痕：胸口的月蚀纹', '喜欢：守夜的提灯、黑咖啡', '讨厌：欠别人人情'],
    },
  ];
  D.OVERLOADS = {
    xiwei: { name: '永昼', desc: '6 秒内四个阶段的好处同时生效：正午的伤害、黄昏的引爆（每次命中按 2 层算）、破晓的回血（每秒 3%）、夜的移速。结束时得 1 层日轮。', eternal: 1 },
    coda: { name: '回声剧场', desc: '5 秒内回响比例 35% → 80%、上限翻倍；每次回响重演都在目标身边留下一个残影，把你上一次的攻击再打一遍（55% 伤害）。结束时所有回响一起重演。', theater: 1 },
    xiao: { name: '无月之夜', desc: '6 秒内受到的伤害全部记成夜债、期间不偿还，伤害加成上限提高到 +50%；期间每击倒一个敌人免除全部夜债。结束后夜债以 2 倍速度偿还。', moonless: 1 },
  };
  D.SIDEARMS = {
    xiwei: { name: '晨光提灯', desc: '射出一道暖光，命中也会叠灼光。', kind: 'gun', dmg: 9, range: 260, speed: 760, reload: 0.85, atkCd: 0.34, size: 5, splat: 12 },
    coda: { name: '音叉', desc: '两连发的低频音弹，伤害不高，但同样会攒回响。', kind: 'gun', shots: 2, interval: 0.08, dmg: 5.6, range: 240, speed: 700, reload: 0.8, atkCd: 0.36, size: 4 },
    xiao: { name: '夜刃', desc: '近身横斩，命中会抵消夜债。', kind: 'melee', dmg: 15, range: 50, arc: 1.6, kb: 120, lunge: 160, reload: 0.78, atkCd: 0.38 },
  };
  D.CLASS = {
    halo: ['assault', 'poke', 4], chord: ['suppress', 'sustain', 5], vigil: ['tank', 'shield', 5],
    xiwei: ['striker', 'dps', 5], coda: ['control', 'burst', 5], xiao: ['striker', 'dive', 5],
  };
  D.HEX = {
    mech: { halo: [3, 1, 3, 3, 3], chord: [2, 1, 2, 2, 1], vigil: [2, 4, 1, 0, 2] },
    pilot: { xiwei: [3, 1, 0, 2, 2], coda: [4, 0, 2, 1, 1], xiao: [4, 0, 0, 1, 3] },
  };
  D.MATCHUPS = [
    ['halo', 'charger', '光轮来回两次判定，狙击手躲开去程也躲不开回程。'],
    ['halo', 'stinger', '光轮穿透一条线，毒针血量低吃不住两次。'],
    ['chord', 'blade', '共鸣索拴住就不放，影刃切进来跑不掉。'],
    ['chord', 'phantom', '拴住的目标隐身也没用，索一直连着。'],
    ['vigil', 'blaster', '喷罐的连射正好被夜幕盾吃下，反斩一刀打回去。'],
    ['vigil', 'lancer', '枪骑的突刺撞上完美格挡，反被眩晕。'],
    ['gatling', 'vigil', '盾挡正面，但加特林可以绕到侧面一直打。'],
    ['mortar', 'vigil', '炮弹从头顶落下，夜幕盾挡不住。'],
    ['blade', 'halo', '光轮在外面的时候晨轮机兵很脆，影刃趁机贴脸。'],
    ['charger', 'chord', '共鸣索射程不够，远处的狙击拴不到。'],
    ['xiwei', 'titan', '正午 + 日轮叠满，雷豹的护盾撑不了多久。'],
    ['coda', 'chef', '回响是真实伤害，大福的回血只能补上一半。'],
    ['coda', 'titan', '回响无视护盾，雷豹的钢铁护盾白开。'],
    ['xiao', 'blaze', '凌焰打得越凶，宵背的夜债越多，伤害反而更高。'],
    ['hex', 'xiwei', '脉冲打断定晷，熹微的节奏全乱了。'],
    ['frost', 'coda', '远距精准一枪一枪点，尾声的回响攒不起来。'],
    ['vet', 'xiao', '手雷 + 自爆一口气打出大量伤害，夜债瞬间超过生命。'],
    ['han', 'xiao', '闪光弹打断清偿，夜债炸不出来。'],
  ];

  // ---------------- 活动 ----------------
  // 活动货币：晨光碎片（dawnshards）。剧情章节靠任务解锁；熹微 + 晨轮任务送，尾声 + 共鸣碎片兑换，宵 + 守夜宝石购买或打通终章
  D.EVENT = {
    id: 'dawn', name: '黎明之后', start: T0, end: T1, color: '#ffb648', cur: 'dawnshards', collab: true, dawn: true,
    desc: '长夜结束后的第一个清晨，拂晓站的陆行列车「启明号」停在了灰城外。和三位干员一起收容夜蚀结晶：做任务解锁专属手书剧情、赚晨光碎片，免费拿到熹微和晨轮机兵。',
    curPer: { _all: 8 }, curWin: 6, curDawn: 6,
    quests: [
      ['play', 3, { k: 'dawnshards', n: 80 }],
      ['dawnplay', 2, { k: 'pilot', id: 'xiwei' }],
      ['win', 5, { k: 'dawnshards', n: 120 }],
      ['dawnmap', 3, { k: 'mech', id: 'halo' }],
      ['kills', 40, { k: 'dawnshards', n: 150 }],
      ['dawnwin', 5, { k: 'dawnshards', n: 200 }],
      ['paint', 6000, { k: 'skin', id: 'av_dawn' }],
      ['dawnplay', 15, { k: 'dawnshards', n: 300 }],
      ['dawnwin', 12, { k: 'pilot', id: 'xiao' }],
    ],
    shop: [
      { it: { k: 'pilot', id: 'coda' }, cost: 1200, limit: 1 },
      { it: { k: 'mech', id: 'chord' }, cost: 900, limit: 1 },
      { it: { k: 'mech', id: 'vigil' }, cost: 1000, limit: 1 },
      { it: { k: 'skin', id: 'fr_dawn' }, cost: 220, limit: 1 },
      { it: { k: 'chest', id: 'airdrop', n: 1 }, cost: 200, limit: 2 },
      { it: { k: 'gems', n: 50 }, cost: 90, limit: 5 },
      { it: { k: 'crystals', n: 1 }, cost: 150, limit: 2 },
      { it: { k: 'coins', n: 800 }, cost: 60, limit: 5 },
    ],
    login: [{ k: 'dawnshards', n: 60 }, { k: 'coins', n: 800 }, { k: 'dawnshards', n: 100 }, { k: 'chest', id: 'military', n: 1 }, { k: 'dawnshards', n: 120 }, { k: 'gems', n: 80 }, { k: 'chest', id: 'airdrop', n: 1 }],
  };
  // 宝石直购：宵 + 守夜机兵（也可以打通终章任务 / 碎片兑换拿到）
  D.SHOP = [{ k: 'pilot', id: 'xiao', gems: 520 }, { k: 'mech', id: 'vigil', gems: 380 }];
  D.BUNDLE = 800;
  D.STATS = { dawnplay: '用联动干员或联动机甲完成 {n} 局', dawnwin: '用联动干员或联动机甲赢 {n} 局', dawnmap: '在「拂晓荒原」完成 {n} 局' };
  D.SKINS = [
    { id: 'av_dawn', kind: 'avatar', name: '启明号车徽', rare: 2, price: 0, event: 'dawn', avatar: 'dawn' },
    { id: 'fr_dawn', kind: 'frame', name: '拂晓头像框', rare: 3, price: 0, event: 'dawn', frame: 'dawn' },
  ];

  // ---------------- 专属手书剧情 ----------------
  // 每话几格分镜：bg 场景、who 出场的人（立绘）、text 台词；need 是解锁需要完成的活动任务数
  D.STORY = [
    { id: 1, title: '第一缕光', en: 'First Light', need: 0, panels: [
      { bg: 'dunes', who: '', text: '长夜持续了七年。没有人记得太阳是什么温度。', en: 'The Long Night lasted seven years. No one remembered how warm the sun was.' },
      { bg: 'train', who: '', text: '直到那天清晨——地平线裂开一道金色的缝。', en: 'Until that morning — the horizon split with a seam of gold.' },
      { bg: 'train', who: 'xiwei', text: '……光。是真的光。', en: '...Light. Real light.' },
      { bg: 'city', who: 'xiwei', text: '前面那座城，墙上全是颜色。原来长夜里还有人在画画。', en: 'That city ahead — its walls are covered in color. Someone kept painting through the night.' },
      { bg: 'city', who: 'blaze', text: '喂，那列火车！你们是从荒原那边过来的？', en: 'Hey, that train! You came across the wasteland?' },
      { bg: 'train', who: 'xiwei', text: '拂晓站，启明号。我们来收容夜蚀结晶——它们在往你们的城里长。', en: 'Daybreak Station, train Morningstar. We\'re here for the nightrot crystals — they\'re growing toward your city.' },
    ] },
    { id: 2, title: '失真的回声', en: 'Distorted Echo', need: 2, panels: [
      { bg: 'metro', who: '', text: '灰城的地铁站里，一直有人听见长夜里的广播。', en: 'In Gray City\'s subway, people kept hearing a broadcast from the Long Night.' },
      { bg: 'metro', who: 'coda', text: '「这里是长夜电台，现在是第两千五百五十天……」', en: '"This is Night Radio, day two thousand five hundred and fifty..."' },
      { bg: 'metro', who: 'coda', text: '那是我的声音。可我不记得自己说过这些。', en: 'That\'s my voice. But I don\'t remember saying any of it.' },
      { bg: 'crystal', who: '', text: '结晶在墙缝里发着紫光，把声音一遍遍放回来。', en: 'Crystals glowed purple in the cracks, replaying the voice again and again.' },
      { bg: 'metro', who: 'coda', text: '每用一次残响，我就忘掉一段。……没关系，我会记在磁带上。', en: 'Every echo costs me a memory. ...It\'s fine. I\'ll keep it on tape.' },
      { bg: 'metro', who: 'xiwei', text: '那我来帮你记。今天的、明天的，都记下来。', en: 'Then I\'ll remember for you. Today, tomorrow — all of it.' },
    ] },
    { id: 3, title: '欠下的夜', en: 'The Night Owed', need: 4, panels: [
      { bg: 'night', who: '', text: '启明号的最后一节车厢，从来不开灯。', en: 'The last car of the Morningstar never turns its lights on.' },
      { bg: 'night', who: 'xiao', text: '别靠近。我身上的夜还没还完。', en: 'Stay back. The night on me isn\'t paid off yet.' },
      { bg: 'night', who: 'xiao', text: '长夜里，整节车厢的人都在发疯。我把他们的黑暗都背下来了。', en: 'In the Long Night, everyone in this car was losing their minds. I took their darkness onto myself.' },
      { bg: 'crystal', who: '', text: '他每受一次伤，胸口的月蚀纹就深一分。', en: 'Every wound deepens the eclipse mark on his chest.' },
      { bg: 'night', who: 'xiwei', text: '你打算一个人还到什么时候？', en: 'How long are you going to pay it alone?' },
      { bg: 'night', who: 'xiao', text: '还到能去看一次日出为止。', en: 'Until I can watch one sunrise.' },
    ] },
    { id: 4, title: '黑日残影', en: 'Shadow of the Black Sun', need: 6, panels: [
      { bg: 'city', who: '', text: '灰城中央，结晶长成了一座塔。塔顶挂着一轮黑色的太阳。', en: 'In Gray City\'s center, the crystals grew into a tower. A black sun hung at its top.' },
      { bg: 'crystal', who: '', text: '「余烬会」的人站在塔下：「长夜才是真正的安宁。」', en: 'The Ember Choir stood beneath it: "Only the Long Night is true peace."' },
      { bg: 'city', who: 'xiao', text: '安宁？你们没在那节车厢里待过。', en: 'Peace? You were never in that car.' },
      { bg: 'city', who: 'coda', text: '它在录我们的声音……想把长夜整个放回来。', en: 'It\'s recording our voices... it wants to play the whole night back.' },
      { bg: 'city', who: 'xiwei', text: '那就让它听听今天早上的声音。', en: 'Then let it hear what this morning sounds like.' },
      { bg: 'city', who: 'blaze', text: '涂鸦队，全员出动！把那座塔涂成白天的颜色！', en: 'Graffiti squad, move out! Paint that tower in daylight colors!' },
    ] },
    { id: 5, title: '绝响', en: 'Final Note', need: 8, panels: [
      { bg: 'crystal', who: 'coda', text: '我把长夜里所有的声音都录下来了。哭声、广播、还有……一首没唱完的歌。', en: 'I recorded every sound of the night. Crying, the broadcast, and... a song that never ended.' },
      { bg: 'crystal', who: 'coda', text: '现在，我把它们一次放完。', en: 'Now I\'ll play them all at once.' },
      { bg: 'blacksun', who: '', text: '——绝响。', en: '— Final Note.' },
      { bg: 'blacksun', who: 'xiao', text: '最后一笔，算我的。', en: 'The last payment is mine.' },
      { bg: 'sunrise', who: 'xiwei', text: '黑色的太阳碎了。碎片落下来的时候，是金色的。', en: 'The black sun shattered. When the pieces fell, they were gold.' },
      { bg: 'sunrise', who: 'coda', text: '……我好像想起来了。磁带里的人，是我自己。', en: '...I think I remember now. The voice on the tape was mine.' },
    ] },
    { id: 6, title: '黎明之后', en: 'After Dawn', need: 9, panels: [
      { bg: 'train', who: '', text: '启明号要出发了。车厢外面多了一大片涂鸦。', en: 'The Morningstar is leaving. Its cars now carry a sea of graffiti.' },
      { bg: 'train', who: 'xiao', text: '……原来日出是这个温度。', en: '...So this is how warm a sunrise is.' },
      { bg: 'train', who: 'coda', text: '这一段，我会记很久很久。', en: 'This part, I\'ll remember for a very long time.' },
      { bg: 'sunrise', who: 'xiwei', text: '下一站还有很多夜蚀。但天已经亮了。', en: 'There\'s more nightrot at the next stop. But the sky is already bright.' },
      { bg: 'sunrise', who: '', text: '车尾的涂鸦写着：「黎明之后，我们还在。」', en: 'The graffiti on the last car reads: "After dawn, we\'re still here."' },
    ] },
  ];

  // ---------------- 合并进 shared.js / economy.js ----------------
  D.apply = function (S, E) {
    Object.assign(S.WEAPONS, D.WEAPONS); Object.assign(S.TRAITS, D.TRAITS); Object.assign(S.SPECIALS, D.SPECIALS);
    Object.assign(S.SKILLS, D.SKILLS); Object.assign(S.OVERLOADS, D.OVERLOADS); Object.assign(S.SIDEARMS, D.SIDEARMS); Object.assign(S.CLASS, D.CLASS);
    for (const id of Object.keys(D.WEAPONS)) if (!S.WEAPON_ORDER.includes(id)) S.WEAPON_ORDER.push(id);
    for (const P of D.PILOTS) if (!S.PILOTS.some((x) => x.id === P.id)) S.PILOTS.push(P);
    if (S.MATCHUPS) S.MATCHUPS.push(...D.MATCHUPS);
    if (S.SKINS) for (const k of D.SKINS) if (!S.SKINS.some((x) => x.id === k.id)) S.SKINS.push(k);
    if (S.hexReset) S.hexReset();
    if (!E) return;
    // 「夜都决战」下架：活动结束，符零 / 赤镰 / 结界机兵 / 灵刃机兵暂时绝版（已经拥有的照常能用）
    E.RETIRED = (E.COLLAB.pilots || []).concat(E.COLLAB.mechs || []);
    E.EVENTS = E.EVENTS.filter((ev) => ev.id !== 'yato');
    E.EVENTS.push(D.EVENT);
    E.COLLAB = { pilots: E.COLLAB.pilots.concat(D.PILOTS.map((P) => P.id)), mechs: E.COLLAB.mechs.concat(Object.keys(D.WEAPONS)), quest: ['xiwei', 'halo'],
      shop: D.SHOP, bundle: D.BUNDLE, current: 'dawn' };
    Object.assign(E.EVENT_STAT, D.STATS);
    if (E.CUR && !E.CUR.dawnshards) E.CUR.dawnshards = { name: '晨光碎片', short: '碎片', color: '#ffb648' };
  };
  return D;
});
