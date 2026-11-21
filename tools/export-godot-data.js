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
const pick = (o, keys) => Object.fromEntries(keys.filter((k) => o[k] !== undefined).map((k) => [k, o[k]]));
const bits = (arr) => Array.from(arr, (v) => (v ? '1' : '0')).join('');
const maps = [];
for (let i = 0; i < S.MAP_N; i++) {
  const M = S.buildMap(i);
  S.useMap(M);
  const pads = {};
  M.pad.forEach((v, k) => { if (v) pads[k] = v; });
  maps.push({ name: S.MAPS[i].name, desc: S.MAPS[i].desc, sky: S.MAPS[i].sky || 0, gw: M.gw, gh: M.gh, goalX: S.MAPS[i].goalX || 24, park: !!S.MAPS[i].park,
    top: Array.from(M.top, (v) => Math.round(v)), solid: bits(M.solid), bush: bits(M.bush), pads,
    spawns: [1, 2].map((t) => [0, 1, 2, 3].map((s) => S.spawnPoint(t, s))) });
}

// 阶段 5：日期转成秒（Godot 用 Time.get_unix_time_from_system() 比较）
const sec = (ms) => Math.floor(ms / 1000);
const GODOT_MAILS = [
  { id: 'godot_pc', t: Date.UTC(2026, 10, 21, 4), from: '涂鸦机兵开发组', title: 'Godot 电脑版上线礼包', body: '涂鸦机兵 Godot 电脑版上线啦：全部角色和模式、全新画面和大厅、通行证、排位赛、搜刮撤离和局域网联机都搬过来了。这份上线礼包请收下！',
    keep: true, items: [{ k: 'gems', n: 300 }, { k: 'chest', id: 'airdrop', n: 1 }, { k: 'coins', n: 2000 }, { k: 'parts', n: 300 }] },
];
const econ5 = {
  pass: Object.assign({}, E.PASS, { season: E.SEASON.name, ends: sec(E.SEASON.end) }), passOnly: E.PASS_ONLY,
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
    style: P.style, outfit: P.outfit, weapon: P.weapon, skill: P.skill, skillInfo: S.SKILLS[P.skill], passive: P.passive, line: P.line, sidearm: S.sidearm(P.id), overload: S.OVERLOADS[P.id] }])),
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
  maps, colors: S.COLOR_SETS.map((c) => c.c),
};
const json = JSON.stringify(out).replace(/·/g, '•').replace(/[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}]\uFE0F?/gu, '');   // Godot 版的字体没有「·」
fs.writeFileSync(path.join(__dirname, '..', 'godot', 'data', 'game.json'), json);
console.log('godot/data/game.json', (json.length / 1024).toFixed(0) + ' KB', S.WEAPON_ORDER.length + ' 机体', S.PILOTS.length + ' 驾驶员', maps.length + ' 地图');
