// 把现在游戏的数据（public/shared.js）导出成 Godot 版用的 JSON：godot/data/game.json
// 运行：node tools/export-godot-data.js
// 阶段 2：全部 22 台机体、21 位驾驶员、全部技能 / 大招 / 随身武器 / 超载、定位克制表、14 张普通地图
// 阶段 3：模式（除了搜刮撤离）和各模式的参数
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
  modeOrder: S.MODE_ORDER.filter((k) => k !== 'loot'),
  modes: Object.fromEntries(S.MODE_ORDER.filter((k) => k !== 'loot').map((k) => [k, pick(S.MODES[k], ['name', 'short', 'desc', 'oneLife', 'teams', 'size', 'coop'])])),
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
  },
  maps, colors: S.COLOR_SETS.map((c) => c.c),
};
const json = JSON.stringify(out).replace(/·/g, '•');   // Godot 版的字体没有「·」
fs.writeFileSync(path.join(__dirname, '..', 'godot', 'data', 'game.json'), json);
console.log('godot/data/game.json', (json.length / 1024).toFixed(0) + ' KB', S.WEAPON_ORDER.length + ' 机体', S.PILOTS.length + ' 驾驶员', maps.length + ' 地图');
