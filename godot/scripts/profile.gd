# 涂鸦机兵 Godot 版 —— 本地存档 + 养成（移植 economy.js 的核心：货币、宝箱、升级、突破、天赋、每日 / 每周任务、对战奖励）
# 存档放在 user://profile.json（Windows：%APPDATA%/Godot/app_userdata/GraffiBots；安卓：应用私有目录）
class_name Profile
extends RefCounted

const PATH := "user://profile.json"
const VERSION := 1
const CUR_KEYS := ["coins", "gems", "parts", "crystals"]

var D: Dictionary
var E: Dictionary
var o: Dictionary
var rng := RandomNumberGenerator.new()
var path := PATH

func _init(data: Dictionary, save_path: String = PATH) -> void:
	D = data; E = data.econ; path = save_path
	rng.randomize()
	load_or_new()

# ---------------- 存档 ----------------
func new_profile() -> Dictionary:
	var p := {"v": VERSION, "name": "", "tut": 0, "pilots": {}, "mechs": E.starterMechs.duplicate(), "chests": {},
		"pilot": "", "weapon": E.starterMechs[0], "mode": "turf", "map": -1,
		"trophies": 0, "xp": 0, "matches": 0, "wins": 0, "kills": 0, "paint": 0, "day": 0, "dayWin": 0,
		"talents": [], "tal": [], "tpBonus": 0, "passXp": 0,
		"q": {"d": 0, "dp": [0, 0, 0], "w": 0, "wp": [0, 0, 0, 0]}, "streak": 0, "bestStreak": 0}
	for k in E.start: p[k] = int(E.start[k])
	return p

func load_or_new() -> void:
	o = new_profile()
	if not FileAccess.file_exists(path): return
	var f := FileAccess.open(path, FileAccess.READ)
	if f == null: return
	var v = JSON.parse_string(f.get_as_text())
	if typeof(v) != TYPE_DICTIONARY or int(v.get("v", 0)) != VERSION: return
	for k in v: o[k] = v[k]
	# JSON 读回来的数字都是 float：整数字段转回 int
	for k in CUR_KEYS + ["trophies", "xp", "matches", "wins", "kills", "paint", "day", "dayWin", "tpBonus", "passXp", "tut", "streak", "bestStreak", "map"]:
		o[k] = int(o.get(k, 0))
	for id in o.pilots: o.pilots[id] = {"lv": int(o.pilots[id].lv), "bt": int(o.pilots[id].bt)}
	for id in o.chests: o.chests[id] = int(o.chests[id])

func save() -> void:
	var f := FileAccess.open(path, FileAccess.WRITE)
	if f != null: f.store_string(JSON.stringify(o))

func reset() -> void:
	o = new_profile(); save()

# ---------------- 查询 ----------------
static func level_from_xp(xp: int) -> int:
	return int(floor(sqrt(max(0, xp) / 120.0))) + 1

static func xp_for_level(lv: int) -> int:
	return (lv - 1) * (lv - 1) * 120

func level() -> int: return level_from_xp(o.xp)
func has_pilot(id: String) -> bool: return o.pilots.has(id)
func has_mech(id: String) -> bool: return o.mechs.has(id)
func lv_cap(bt: int) -> int: return 11 if bt >= 2 else (9 if bt >= 1 else 5)
func stat_mul(lv: int) -> float: return 1.0 + (clampi(lv, 1, int(E.maxLv)) - 1) * float(E.lvBonus)
func power(id: String) -> Dictionary:
	var q: Dictionary = o.pilots.get(id, {"lv": 1, "bt": 0})
	return {"lv": int(q.lv), "bt": int(q.bt), "tal": o.tal.duplicate()}
func talent(id: String):
	for T in E.talents:
		if T.id == id: return T
	return null
func tp_total() -> int: return 2 + level() - 1 + int(o.tpBonus)
func tp_spent() -> int:
	var n := 0
	for id in o.talents: n += int(talent(id).cost)
	return n
func tp_free() -> int: return tp_total() - tp_spent()
func cur_name(k: String) -> String: return str(E.cur[k].name) if E.cur.has(k) else k

static func day_index() -> int:
	return int(floor((Time.get_unix_time_from_system() + 8 * 3600) / 86400.0))   # 按北京时间换天

static func week_index() -> int:
	return int(floor((day_index() + 3) / 7.0))

func daily_quests(day: int) -> Array:
	var out: Array = []; var used := {}
	var pool: Array = E.dailyPool
	var h: int = (day * 2654435761) & 0xFFFFFFFF
	while out.size() < 3:
		h = (h * 1103515245 + 12345) & 0xFFFFFFFF
		var i: int = h % pool.size()
		if not used.has(i): used[i] = true; out.append(pool[i])
	return out

func quest_name(q: Array) -> String:
	return str(E.quests[q[0]].name).replace("{n}", str(int(q[1])))

func refresh_quests() -> void:
	var d := day_index(); var wk := week_index()
	if int(o.q.d) != d: o.q.d = d; o.q.dp = [0, 0, 0]
	if int(o.q.w) != wk: o.q.w = wk; o.q.wp = [0, 0, 0, 0]

# ---------------- 宝箱 ----------------
func roll(cid: String) -> Array:
	var C: Dictionary = E.chests[cid]
	var items: Array = []
	for d in C.drops:
		if rng.randf() >= float(d.p): continue
		if d.k == "pilot" or d.k == "mech":
			var pool: Array = []
			if d.k == "pilot":
				for id in E.pools[d.get("pool", "all")]:
					if not o.pilots.has(id): pool.append(id)
			else:
				for id in E.pools["strike" if d.get("pool", "") == "strike" else "mech"]:
					if not o.mechs.has(id): pool.append(id)
			if pool.is_empty(): items.append({"k": "coins", "n": int(C.dup), "dup": d.k}); continue
			items.append({"k": d.k, "id": pool[rng.randi() % pool.size()]})
		else:
			items.append({"k": d.k, "n": int(d.min) + rng.randi_range(0, int(d.max) - int(d.min))})
	return items

func grant(items: Array) -> void:
	for it in items:
		match it.k:
			"pilot":
				if not o.pilots.has(it.id): o.pilots[it.id] = {"lv": 1, "bt": 0}
				if not o.pilots.has(o.pilot): o.pilot = it.id
			"mech":
				if not o.mechs.has(it.id): o.mechs.append(it.id)
			"chest": o.chests[it.id] = int(o.chests.get(it.id, 0)) + int(it.n)
			"tp": o.tpBonus = int(o.tpBonus) + int(it.n)
			"passxp": o.passXp = int(o.passXp) + int(it.n)
			_:
				if E.cur.has(it.k): o[it.k] = int(o.get(it.k, 0)) + int(it.n)

func merge(items: Array) -> Array:
	var out: Array = []; var by := {}
	for it in items:
		if E.cur.has(it.k) and not it.has("dup") and not it.has("why"):
			if by.has(it.k): by[it.k].n += int(it.n)
			else: by[it.k] = {"k": it.k, "n": int(it.n)}; out.append(by[it.k])
		else: out.append(it)
	return out

func ok(items: Array = [], extra := {}) -> Dictionary:
	var r := {"ok": true, "items": items}; r.merge(extra); save(); return r

func no(err: String) -> Dictionary:
	return {"ok": false, "err": err}

func tutorial() -> Dictionary:
	if int(o.tut) != 0: return no("已经完成过新手教程")
	o.tut = 1
	var items := [{"k": "chest", "id": "starter", "n": 1}]
	grant(items)
	return ok(items)

func open_chest(cid: String) -> Dictionary:
	if not E.chests.has(cid) or int(o.chests.get(cid, 0)) <= 0: return no("没有这个宝箱")
	o.chests[cid] = int(o.chests[cid]) - 1
	if o.chests[cid] <= 0: o.chests.erase(cid)
	var items := roll(cid)
	grant(items)
	return ok(merge(items), {"chest": cid})

func buy_chest(cid: String) -> Dictionary:
	var C: Dictionary = E.chests.get(cid, {})
	if C.is_empty() or not C.buy: return no("这个宝箱不能购买")
	if int(o.gems) < int(C.price): return no("宝石不够（需要 %d）" % int(C.price))
	o.gems -= int(C.price)
	var items := roll(cid)
	grant(items)
	return ok(merge(items), {"chest": cid})

func exchange(what: String, n: int = 1) -> Dictionary:
	var X: Dictionary = E.exchange.get(what, {})
	if X.is_empty(): return no("不能兑换")
	var cost := int(X.gems) * n
	if int(o.gems) < cost: return no("宝石不够（需要 %d）" % cost)
	o.gems -= cost
	var items: Array = []
	for k in X.give: items.append({"k": k, "n": int(X.give[k]) * n})
	grant(items)
	return ok(items)

# ---------------- 升级 / 突破 / 天赋 ----------------
func upgrade(pid: String) -> Dictionary:
	if not o.pilots.has(pid): return no("还没有这位驾驶员")
	var q: Dictionary = o.pilots[pid]
	if q.lv >= int(E.maxLv): return no("已经满级了")
	if q.lv >= lv_cap(q.bt): return no("需要先" + str(E.breaks[q.bt + 1].name))
	var c := int(E.upCoins[q.lv]); var pt := int(E.upParts[q.lv])
	if int(o.coins) < c: return no("金币不够（需要 %d）" % c)
	if int(o.parts) < pt: return no("零件不够（需要 %d）" % pt)
	o.coins -= c; o.parts -= pt; q.lv += 1
	return ok([], {"lv": q.lv})

func breakthrough(pid: String) -> Dictionary:
	if not o.pilots.has(pid): return no("还没有这位驾驶员")
	var q: Dictionary = o.pilots[pid]
	if q.bt + 1 >= E.breaks.size(): return no("已经完成全部突破")
	var B: Dictionary = E.breaks[q.bt + 1]
	if q.lv < int(B.at): return no("需要先升到 %d 级" % int(B.at))
	if int(o.crystals) < int(B.crystals): return no("能量结晶不够（需要 %d）" % int(B.crystals))
	if int(o.coins) < int(B.coins): return no("金币不够（需要 %d）" % int(B.coins))
	o.crystals -= int(B.crystals); o.coins -= int(B.coins); q.bt += 1
	return ok([], {"bt": q.bt})

func learn_talent(id: String) -> Dictionary:
	var T = talent(id)
	if T == null: return no("没有这个天赋")
	if o.talents.has(id): return no("已经点亮了")
	if int(T.tier) > 1:
		var has_prev := false
		for t2 in o.talents:
			var u = talent(t2)
			if u.br == T.br and int(u.tier) == int(T.tier) - 1: has_prev = true
		if not has_prev: return no("要先点亮这一支的上一级天赋")
	if tp_free() < int(T.cost): return no("天赋点不够（需要 %d）" % int(T.cost))
	o.talents.append(id)
	if o.tal.size() < int(E.talentSlots): o.tal.append(id)
	return ok()

func toggle_talent(id: String) -> Dictionary:   # 装上 / 卸下（每局最多带 3 个）
	if not o.talents.has(id): return no("还没点亮这个天赋")
	if o.tal.has(id): o.tal.erase(id); return ok()
	if o.tal.size() >= int(E.talentSlots): return no("最多同时装 %d 个天赋" % int(E.talentSlots))
	o.tal.append(id)
	return ok()

func select(pilot: String, mech: String, mode: String, map_i: int) -> void:
	if o.pilots.has(pilot): o.pilot = pilot
	if o.mechs.has(mech): o.weapon = mech
	o.mode = mode; o.map = map_i
	save()

# ---------------- 对战奖励（移植 S.matchReward + E.applyMatch，去掉通行证 / 排位 / 活动部分） ----------------
static func perf(p) -> float:
	return max(0.0, p.kills * 100 + p.painted * 0.2 + p.obj * 150 - p.deaths * 40)

static func mvp_of(sim: Sim, team: int):
	var best = null; var bv := -1.0
	for p in sim.players:
		if p.npc or p.team != team: continue
		var v: float = perf(p) + 0.001 * (p.kills * 100 + p.painted * 0.2 + p.obj * 150)
		if v > bv: bv = v; best = p
	return best

func match_reward(sim: Sim, me) -> Dictionary:
	var won: bool = sim.winner == me.team; var draw: bool = sim.winner == 0
	var mvp = mvp_of(sim, sim.winner) if sim.winner > 0 else null
	var lm = mvp_of(sim, me.team) if not won and not draw and sim.teams == 2 else null
	var is_mvp: bool = mvp == me or lm == me
	if sim.teams > 2:   # 逃亡圈按名次
		var place: Array = [sim.winner]
		var el: Array = sim.obj.elim.duplicate(); el.reverse()
		for t in el:
			if t != sim.winner: place.append(t)
		var rank: int = place.find(me.team) + 1
		if rank <= 0: rank = place.size()
		var n := place.size()
		var table := [10, 5, 0, -3] if n <= 4 else [10, 7, 4, 2, 0, -2, -3, -4]
		var xp1: int = 60 + max(0, n - rank) * 15 + me.kills * 10 + me.painted / 25 + (40 if is_mvp else 0)
		return {"xp": xp1, "trophies": table[mini(rank, table.size()) - 1], "won": rank == 1, "draw": false, "mvp": is_mvp, "kills": me.kills, "paint": me.painted, "rank": rank, "of": n, "mode": sim.mode}
	var xp: int = 60 + (60 if won else (30 if draw else 0)) + me.kills * 10 + me.painted / 25 + me.obj * 12 + (40 if is_mvp else 0)
	var T: Dictionary = E.trophy
	var tr: int = int(T.win) if won else (int(T.draw) if draw else -int(T.loss))
	if sim.mode == "raid": tr = 5 if won else 0
	return {"xp": xp, "trophies": tr, "won": won, "draw": draw, "mvp": is_mvp, "kills": me.kills, "paint": me.painted, "mode": sim.mode}

func apply_match(rw: Dictionary) -> Dictionary:
	var lv_before := level(); var tr_before := int(o.trophies)
	o.xp += int(rw.xp); o.matches += 1
	if rw.won: o.wins += 1
	o.kills += int(rw.kills); o.paint += int(rw.paint)
	o.trophies = max(0, tr_before + int(rw.trophies))
	var coins: int = 20 + (20 if rw.won else (10 if rw.draw else 0)) + mini(30, int(rw.kills) * 3) + (10 if rw.mvp else 0)
	var items: Array = [{"k": "coins", "n": coins}]
	if rw.won: o.streak += 1; o.bestStreak = max(int(o.bestStreak), int(o.streak))
	elif not rw.draw: o.streak = 0
	if rw.won and o.streak >= 3: items.append({"k": "coins", "n": mini(10, o.streak) * 10, "why": "%d 连胜" % o.streak})
	var d := day_index()
	if int(o.day) != d: o.day = d; o.dayWin = 0
	if rw.won and int(o.dayWin) == 0: o.dayWin = 1; items.append({"k": "gems", "n": int(E.firstWinGems), "why": "每日首胜"})
	# 每日 / 每周任务：原版奖励通行证经验；通行证还没移植，先折成金币（经验也记下来）
	refresh_quests()
	var gain := {"won": 1 if rw.won else 0, "play": 1, "kills": int(rw.kills), "paint": int(rw.paint), "mvp": 1 if rw.mvp else 0}
	var done: Array = []
	var dq := daily_quests(d)
	for i in dq.size():
		var q: Array = dq[i]; var before := int(o.q.dp[i])
		o.q.dp[i] = mini(int(q[1]), before + int(gain[E.quests[q[0]].stat]))
		if before < int(q[1]) and o.q.dp[i] >= int(q[1]):
			items.append({"k": "coins", "n": int(q[2]) / 2, "why": "每日任务：" + quest_name(q)}); items.append({"k": "passxp", "n": int(q[2])}); done.append(quest_name(q))
	for i in E.weekly.size():
		var q2: Array = E.weekly[i]; var b2 := int(o.q.wp[i])
		o.q.wp[i] = mini(int(q2[1]), b2 + int(gain[E.quests[q2[0]].stat]))
		if b2 < int(q2[1]) and o.q.wp[i] >= int(q2[1]):
			items.append({"k": "coins", "n": int(q2[2]) / 2, "why": "每周任务：" + quest_name(q2)}); items.append({"k": "passxp", "n": int(q2[2])}); done.append(quest_name(q2))
	var ups := level() - lv_before
	if ups > 0:
		items.append({"k": "coins", "n": int(E.levelUp.coins) * ups, "why": "账号升级"})
		items.append({"k": "gems", "n": int(E.levelUp.gems) * ups, "why": "账号升级"})
	grant(items)
	save()
	return {"items": merge(items.filter(func(it): return it.k != "passxp")), "lv_before": lv_before, "lv_ups": ups, "tr_before": tr_before, "quests": done, "streak": o.streak}
