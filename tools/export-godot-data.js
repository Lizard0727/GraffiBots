// 把现在游戏的数据（public/shared.js）导出成 Godot 版用的 JSON：godot/data/game.json
// 运行：node tools/export-godot-data.js
// 阶段 2：全部 22 台机体、21 位驾驶员、全部技能 / 大招 / 随身武器 / 超载、定位克制表、14 张普通地图
// 阶段 3：模式（除了搜刮撤离）和各模式的参数
// 阶段 5：通行证、邮件、章节任务线、活动、皮肤、排位（电脑版）
// 阶段 4：经济 / 养成（货币、宝箱、升级、突破、天赋、每日任务、对战奖励）
'use strict';
const fs = require('fs'), path = require('path');
const S = require('../public/shared.js');
const E = require('../public/economy.js');
// 3.1：「黎明之后」联动（只给电脑版）：合并进 S / E；「夜都决战」下架
const DAWN = require('./collab-dawn.js');
DAWN.apply(S, E);
const pick = (o, keys) => Object.fromEntries(keys.filter((k) => o[k] !== undefined).map((k) => [k, o[k]]));
const bits = (arr) => Array.from(arr, (v) => (v ? '1' : '0')).join('');
// 3.1：电脑版用重新设计的 14 张地图（tools/godot-maps.js），网页版不变
const PC_MAPS = require('./godot-maps.js');
const maps = [];
for (let i = 0; i < S.MAP_N; i++) {
  const keep = S.MAPS[i];
  if (PC_MAPS[i]) S.MAPS[i] = Object.assign({}, PC_MAPS[i]);
  const M = S.buildMap(i);
  S.useMap(M);
  const pads = {};
  M.pad.forEach((v, k) => { if (v) pads[k] = v; });
  maps.push({ name: S.MAPS[i].name, desc: S.MAPS[i].desc, sky: S.MAPS[i].sky || 0, biome: S.MAPS[i].biome || 'plaza', gw: M.gw, gh: M.gh, goalX: S.MAPS[i].goalX || 24, park: !!S.MAPS[i].park,
    top: Array.from(M.top, (v) => Math.round(v)), solid: bits(M.solid), bush: bits(M.bush), pads,
    spawns: [1, 2].map((t) => [0, 1, 2, 3].map((s) => S.spawnPoint(t, s))) });
  S.MAPS[i] = keep;
}

// 阶段 5：日期转成秒（Godot 用 Time.get_unix_time_from_system() 比较）
const sec = (ms) => Math.floor(ms / 1000);
const GODOT_MAILS = [
  { id: 'godot_v31', t: Date.UTC(2026, 10, 22, 5), from: '拂晓站 · 启明号', title: '3.1「黎明之后」联动礼包', body: '长夜结束后的第一个清晨，启明号停在了灰城外。熹微、尾声和宵向你问好——去大厅左边的「黎明之后」看看专属手书剧情和联动战斗影片吧。这些晨光碎片和宝石请收下！',
    keep: true, items: [{ k: 'dawnshards', n: 300 }, { k: 'gems', n: 300 }, { k: 'chest', id: 'airdrop', n: 1 }, { k: 'coins', n: 2000 }] },
  { id: 'godot_v30', t: Date.UTC(2026, 10, 22, 4), from: '涂鸦机兵开发组', title: '电脑版 3.0 正式版上线礼包', body: '涂鸦机兵电脑版 3.0 正式版上线啦：匹配和排位选人、个人资料、好友和线上房间、对局聊天、搜刮撤离的消耗品 / 大地图 / 增援小队、新手教程、英文界面都来了。感谢一路陪伴，这份礼包请收下！',
    keep: true, items: [{ k: 'gems', n: 500 }, { k: 'chest', id: 'airdrop', n: 2 }, { k: 'coins', n: 3000 }, { k: 'parts', n: 500 }, { k: 'crystals', n: 3 }] },
  { id: 'godot_pc', t: Date.UTC(2026, 10, 21, 4), from: '涂鸦机兵开发组', title: 'Godot 电脑版上线礼包', body: '涂鸦机兵 Godot 电脑版上线啦：全部角色和模式、全新画面和大厅、通行证、排位赛、搜刮撤离和局域网联机都搬过来了。这份上线礼包请收下！',
    keep: true, items: [{ k: 'gems', n: 300 }, { k: 'chest', id: 'airdrop', n: 1 }, { k: 'coins', n: 2000 }, { k: 'parts', n: 300 }] },
];
const econ5 = {
  pass: Object.assign({}, E.PASS, { season: E.SEASON.name, sid: E.SEASON.id, ends: sec(E.SEASON.end) }), passOnly: E.PASS_ONLY,
  mails: [...GODOT_MAILS, ...E.MAILS].map((m) => Object.assign({}, m, { t: sec(m.t) })), mailDays: E.MAIL_DAYS, mailUnclaimed: E.MAIL_UNCLAIMED,
  story: E.STORY, tasklines: E.TASKLINES, tasklineOrder: E.TASKLINE_ORDER,
  events: E.EVENTS.map((ev) => Object.assign({}, ev, { start: sec(ev.start), end: sec(ev.end) })), eventStat: E.EVENT_STAT,
  rank: Object.assign({}, E.RANK, { season: Object.assign({}, E.RANK.season, { start: sec(E.RANK.season.start), end: sec(E.RANK.season.end) }) }), rankModes: E.RANK_MODES, rankHours: E.RANK_HOURS,
  offer: E.OFFER, newOffer: Object.assign({}, E.NEW_OFFER, { until: sec(E.NEW_OFFER.until) }), seasonPilots: E.SEASON_PILOTS, seasonMechs: E.SEASON_MECHS, collab: E.COLLAB,
  skins: S.SKINS, startExtra: { tickets: 0, shards: 0, talismans: 0 },
};

// 阶段 5：搜刮撤离的超大地图（760×500）和物资配置
const packBits = (arr) => { const b = new Uint8Array(Math.ceil(arr.length / 8)); arr.forEach((v, i) => { if (v) b[i >> 3] |= 1 << (i & 7); }); return Buffer.from(b).toString('base64'); };   // 8 格一个字节
const lootMap = (() => {
  const gi = S.GIANT_MAP(), M = S.buildMap(gi); S.useMap(M);
  const pads = {}, lifts = {};
  M.pad.forEach((v, k) => { if (v) pads[k] = v; });
  if (M.lift) M.lift.forEach((v, k) => { if (v) lifts[k] = v; });
  const r = { name: S.MAPS[gi].name, desc: S.MAPS[gi].desc, sky: S.MAPS[gi].sky || 0, gw: M.gw, gh: M.gh, goalX: 24, park: false, giant: true,
    topB64: Buffer.from(Uint8Array.from(M.top, (v) => Math.max(0, Math.min(255, Math.round(v))))).toString('base64'), solidBits: packBits(M.solid), bushBits: packBits(M.bush), pads, lifts, loot: M.loot,
    spawns: [1, 2].map((t) => [0, 1, 2, 3].map((s) => S.spawnPoint(t, s))) };
  S.useMap(S.buildMap(0));
  return r;
})();
const lootCfg = Object.assign({}, S.LOOT, { search: [0, 1, 2, 3, 4, 5, 6].map((r) => S.LOOT.search(r)), keys: S.LOOT_KEYS, levelH: S.LEVEL_H, lift: S.LIFT });
const out = {
  version: 'proto-0.3', from: S.VERSION,
  consts: pick(S, ['TICK', 'R', 'CELL', 'AMMO', 'GRAV', 'JUMP_V', 'JUMP_W', 'STEP', 'PH', 'MUZZLE', 'RESPAWN', 'PILOT_HP', 'PILOT_R', 'PILOT_SPEED', 'REBUILD', 'KO_RESPAWN',
    'BUSH_DETECT', 'SKILL_CHARGES', 'SKILL_REGEN', 'SKILL_CD', 'PROJ_G', 'OV_NEED', 'OV_TIME', 'ROLE_EDGE']),
  speed: S.SPEED, phys: S.PHYS, pad: S.PAD, missile: S.MISSILE, pistol: S.PISTOL,
  order: S.WEAPON_ORDER, pilotOrder: S.PILOTS.map((P) => P.id),
  mechs: Object.fromEntries(S.WEAPON_ORDER.map((id) => [id, Object.assign({}, S.WEAPONS[id], { trait: S.TRAITS[id] || null, specialInfo: S.SPECIALS[S.WEAPONS[id].special], range2: S.weaponRange(id) })])),
  pilots: Object.fromEntries(S.PILOTS.map((P) => [P.id, { id: P.id, name: P.name, code: P.code, title: P.title, accent: P.accent, hair: P.hair, hair2: P.hair2, skin: P.skin, eye: P.eye,
    style: P.style, outfit: P.outfit, eyeShape: P.eyeShape, mouth: P.mouth, extra: P.extra || [], weapon: P.weapon, skill: P.skill, skillInfo: S.SKILLS[P.skill], passive: P.passive, line: P.line, sidearm: S.sidearm(P.id), overload: S.OVERLOADS[P.id] }])),
  classes: S.CLASS, roles: Object.fromEntries(Object.entries(S.ROLES).map(([k, R]) => [k, pick(R, ['kind', 'name', 'color', 'desc'])])), ring: S.ROLE_RING, tags: S.TAGS,
  modeOrder: S.MODE_ORDER.slice(),
  modes: Object.fromEntries([...S.MODE_ORDER, 'loot'].map((k) => [k, pick(S.MODES[k], ['name', 'short', 'desc', 'oneLife', 'teams', 'size', 'coop'])])),
  modeCfg: { ESCAPE: S.ESCAPE, ELIM: S.ELIM, ZONE: S.ZONE, SOCCER_GOAL: S.SOCCER_GOAL, ESCORT_TARGET: S.ESCORT_TARGET, SOCCER_TARGET: S.SOCCER_TARGET, BATTERY_TARGET: S.BATTERY_TARGET,
    RAID: S.RAID, SEAL: S.SEAL, PARK: S.PARK },
  econ: {
    cur: E.CUR, start: E.START, starterPilots: E.STARTER_PILOTS, starterMechs: E.STARTER_MECHS,
    chests: E.CHESTS, chestOrder: E.CHEST_ORDER, exchange: E.EXCHANGE,
    maxLv: E.MAX_LV, lvBonus: E.LV_BONUS, upCoins: E.UP_COINS, upParts: E.UP_PARTS, breaks: E.BREAKS, levelUp: E.LEVELUP, firstWinGems: E.FIRST_WIN_GEMS,
    pools: { starter: E.STARTER_PILOTS, standard: S.PILOTS.map((p) => p.id).filter((id) => !E.SEASON_PILOTS.includes(id) && !E.noDrop(id)), all: S.PILOTS.map((p) => p.id).filter((id) => !E.noDrop(id)),
      mech: S.WEAPON_ORDER.filter((id) => !E.noDrop(id) && !E.STRIKE_MECHS.includes(id)), strike: E.STRIKE_MECHS },
    locked: Object.fromEntries([...S.PILOTS.map((p) => p.id), ...S.WEAPON_ORDER].filter((id) => E.noDrop(id) || E.STRIKE_MECHS.includes(id)).map((id) => [id,
      E.STRIKE_MECHS.includes(id) ? '特攻队补给箱' : E.PASS_ONLY.pilots.includes(id) || E.PASS_ONLY.mechs.includes(id) ? '赛季通行证' : E.COLLAB.pilots.includes(id) || E.COLLAB.mechs.includes(id) ? '联动活动' : '任务「' + E.questSource(id).name + '」'])),
    talents: S.TALENTS, branches: S.TALENT_BRANCHES, talentSlots: S.TALENT_SLOTS,
    quests: E.QUESTS, dailyPool: E.DAILY_POOL, weekly: E.WEEKLY,
    trophy: { win: S.TROPHY_WIN, draw: S.TROPHY_DRAW, loss: S.TROPHY_LOSS },
    ...econ5,
  },
  hex: { axes: S.HEX_AXES, grades: S.GRADES,
    mech: Object.fromEntries(S.WEAPON_ORDER.map((id) => [id, S.hex('mech', id).vals])), pilot: Object.fromEntries(S.PILOTS.map((P) => [P.id, S.hex('pilot', P.id).vals])) },
  lootMap, loot: lootCfg,
  // 电脑版 3.0：AI 性格 / 昵称 / 聊天、结算评级、强度参考、稀有度、头部装饰、克制表、排位禁用建议
  // 3.2：电脑版 AI 改成 5 档（菜鸟 / 正常玩家 / 有点实力 / 高手 / 大神），每档的反应、准度、提前量、走位、技能、集火、撤退、隐身判断都不同
  bots: ((B) => {
    const P = B.PERSONAS;
    const personas = {
      noob:    Object.assign({}, P.noob, { name: '菜鸟', en: 'Rookie', obj: 0.75, guess: 0, mem: 0, dodge: 0 }),
      normal:  Object.assign({}, P.decent, { name: '正常玩家', en: 'Casual', react: [0.22, 0.42], aim: 0.22, lead: 0.45, fire: 0.45, retreat: 0.25, skill: 0.035, ov: 0.08, strafe: [0.5, 1.3], strafeK: 0.7,
        pow: 0.8, obj: 0.85, guess: 0, mem: 0.6, dodge: 0.1, styles: { nice: 4, chill: 4, noob: 1, toxic: 1 } }),
      skilled: Object.assign({}, P.decent, { name: '有点实力', en: 'Skilled', react: [0.14, 0.28], aim: 0.14, lead: 0.75, fire: 0.6, retreat: 0.32, skill: 0.05, ov: 0.18, strafe: [0.35, 0.9], strafeK: 0.85,
        jump: [1, 2.8], pow: 1.25, obj: 0.92, guess: 0.08, mem: 1.2, dodge: 0.3, styles: { nice: 3, lead: 2, chill: 2, toxic: 1 } }),
      expert:  Object.assign({}, P.expert, { name: '高手', en: 'Expert', react: [0.08, 0.18], aim: 0.09, fire: 0.75, strafe: [0.25, 0.7], strafeK: 0.95, obj: 0.97, guess: 0.22, mem: 2.5, dodge: 0.55, pow: 1.8 }),
      god:     Object.assign({}, P.god, { name: '大神', en: 'Godlike', obj: 1, guess: 0.32, mem: 3.0, dodge: 0.8 }),
    };
    // 权重：菜鸟 正常 有点实力 高手 大神（普通赛按等级插值，排位赛按段位）
    const mix = { low: [34, 42, 16, 6, 2], high: [16, 34, 28, 16, 6],
      rank: [[38, 42, 14, 5, 1], [32, 42, 18, 6, 2], [26, 40, 22, 9, 3], [20, 36, 26, 14, 4], [14, 32, 30, 18, 6], [10, 26, 32, 24, 8], [6, 20, 32, 30, 12], [4, 14, 30, 36, 16], [2, 10, 26, 40, 22], [1, 6, 22, 42, 29]] };
    return { personas, order: ['noob', 'normal', 'skilled', 'expert', 'god'], mix, nicksZh: B.NICKS_ZH, nicksEn: B.NICKS_EN, lines: B.LINES, reply: B.REPLY };
  })(require('../public/bots.js')),
  badges: S.BADGES, meta: S.META, rare: S.RARE, heads: S.HEADS,
  counters: Object.fromEntries([...S.WEAPON_ORDER, ...S.PILOTS.map((P) => P.id)].map((id) => [id, S.countersOf(id)])),
  banCounters: E.COUNTERS, banWhy: E.BAN_WHY,
  maps, colors: S.COLOR_SETS.map((c) => c.c),
};
for (const id of E.RETIRED || []) if (out.econ.locked[id] !== undefined) out.econ.locked[id] = '绝版（夜都决战联动）';
for (const id of [...DAWN.PILOTS.map((P) => P.id), ...Object.keys(DAWN.WEAPONS)]) if (out.econ.locked[id] !== undefined) out.econ.locked[id] = '联动活动「黎明之后」';
out.econ.retired = E.RETIRED || [];
out.modeOrder = out.modeOrder.filter((k) => k !== 'raid' && k !== 'seal');
out.dawn = { id: DAWN.id, name: DAWN.name, nameEn: DAWN.nameEn, story: DAWN.STORY, pilots: DAWN.PILOTS.map((P) => P.id), mechs: Object.keys(DAWN.WEAPONS),
  archive: Object.fromEntries(DAWN.PILOTS.map((P) => [P.id, { bio: P.bio, faction: P.faction, archive: P.archive, extra: P.extra }])) };
for (const P of DAWN.PILOTS) Object.assign(out.pilots[P.id], { bio: P.bio, faction: P.faction, extra: P.extra, collab: 'dawn', eyeShape: P.eyeShape, mouth: P.mouth });
for (const id of Object.keys(DAWN.WEAPONS)) out.hex.mech[id] = DAWN.HEX.mech[id];
for (const P of DAWN.PILOTS) out.hex.pilot[P.id] = DAWN.HEX.pilot[P.id];
const json = JSON.stringify(out).replace(/·/g, '•').replace(/[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}]\uFE0F?/gu, '');   // Godot 版的字体没有「·」
fs.writeFileSync(path.join(__dirname, '..', 'godot', 'data', 'game.json'), json);
// 英文：网页版的词典（i18n-en.js）和带数字的句式（i18n.js 的 PATTERNS）
{
  const win = {}; global.window = win;
  require('../public/i18n-en.js');
  const src = fs.readFileSync(path.join(__dirname, '..', 'public', 'i18n.js'), 'utf8');
  const pat = eval(src.slice(src.indexOf('const PATTERNS = [') + 'const PATTERNS = '.length, src.indexOf('];', src.indexOf('const PATTERNS = [')) + 1));
  const fixDot = (t) => t.replace(/·/g, '•');
  const out = { dict: Object.fromEntries(Object.entries(win.GB_EN).map(([k, v]) => [fixDot(k), v])), patterns: pat.map(([re, rep]) => [fixDot(re.source), rep]) };
  fs.writeFileSync(path.join(__dirname, '..', 'godot', 'data', 'i18n_en.json'), JSON.stringify(out));
  console.log('godot/data/i18n_en.json', Object.keys(out.dict).length, '条词典', out.patterns.length, '条句式');
}
console.log('godot/data/game.json', (json.length / 1024).toFixed(0) + ' KB', S.WEAPON_ORDER.length + ' 机体', S.PILOTS.length + ' 驾驶员', maps.length + ' 地图');
