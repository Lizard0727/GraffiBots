// 把现在游戏的数据（public/shared.js）导出成 Godot 样品版用的 JSON：godot/data/game.json
// 运行：node tools/export-godot-data.js
// 样品版只用 1 张地图、2 台机体（喷罐 / 狙击）、2 位驾驶员（凌焰 / 白夜）；以后全面移植时把列表放开即可
'use strict';
const fs = require('fs'), path = require('path');
const S = require('../public/shared.js');
const MECHS = ['blaster', 'charger'], PILOTS = ['blaze', 'frost'], MAP = 0;
const M = S.buildMap(MAP);
const pick = (o, keys) => Object.fromEntries(keys.filter((k) => o[k] !== undefined).map((k) => [k, o[k]]));
const out = {
  version: 'proto-0.1', from: S.VERSION,
  consts: pick(S, ['TICK', 'R', 'CELL', 'AMMO', 'GRAV', 'JUMP_V', 'STEP', 'PH', 'MUZZLE', 'RESPAWN', 'PILOT_HP', 'BUSH_DETECT', 'SKILL_CHARGES', 'SKILL_REGEN', 'SKILL_CD', 'PROJ_G']),
  speed: S.SPEED, phys: S.PHYS, pad: S.PAD,
  map: { name: S.MAPS[MAP].name, gw: M.gw, gh: M.gh, w: M.gw * 16, h: M.gh * 16,
    top: Array.from(M.top, (v) => Math.round(v)), solid: Array.from(M.solid), lv: Array.from(M.lv), bush: Array.from(M.bush), pad: Array.from(M.pad) },
  mechs: Object.fromEntries(MECHS.map((id) => [id, Object.assign({}, S.WEAPONS[id], { trait: S.TRAITS[id], special: S.WEAPONS[id].special, specialInfo: S.SPECIALS[S.WEAPONS[id].special], range2: S.weaponRange(id) })])),
  pilots: Object.fromEntries(PILOTS.map((id) => { const P = S.pilot(id); return [id, { id, name: P.name, code: P.code, title: P.title, accent: P.accent, hair: P.hair, skin: P.skin, eye: P.eye, weapon: P.weapon, skill: P.skill, skillInfo: S.SKILLS[P.skill], passive: P.passive, line: P.line }]; })),
  spawns: [1, 2].map((t) => [0, 1, 2, 3].map((s) => S.spawnPoint(t, s))),
  colors: S.COLOR_SETS[0],
};
fs.writeFileSync(path.join(__dirname, '..', 'godot', 'data', 'game.json'), JSON.stringify(out));
console.log('godot/data/game.json', (JSON.stringify(out).length / 1024).toFixed(0) + ' KB', MECHS.join('/'), PILOTS.join('/'), out.map.name);
