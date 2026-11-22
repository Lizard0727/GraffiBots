# 涂鸦机兵 Godot 版 —— 本地存档 + 养成（移植 economy.js 的核心：货币、宝箱、升级、突破、天赋、每日 / 每周任务、对战奖励）
# 存档放在 user://profile.json（Windows：%APPDATA%/Godot/app_userdata/GraffiBots；安卓：应用私有目录）
class_name Profile
extends RefCounted

const PATH := "user://profile.json"
const VERSION := 1
const CUR_KEYS := ["coins", "gems", "parts", "crystals", "tickets", "shards", "talismans"]

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
		"talents": [], "tal": [], "tpBonus": 0,
		"q": {"d": 0, "dp": [0, 0, 0], "w": 0, "wp": [0, 0, 0, 0]}, "streak": 0, "bestStreak": 0,
		"pass": {"xp": 0, "prem": false, "dlx": false, "cf": [], "cp": [], "bc": 0}, "mailGot": [], "mailDel": [],
		"story": {"p": [0, 0, 0, 0, 0], "c": []}, "tl": {}, "ev": {}, "evLogin": {}, "rank": {"rp": 0, "best": 0, "road": [], "n": 0, "s": int(E.rank.season.id)},
		"skins": [], "wear": {"pilot": {}, "mech": "", "fx": "", "frame": "", "avatar": ""}, "ranked": false,
		"stash": {}, "lootRec": {"runs": 0, "ex": 0, "best": 0, "total": 0, "gold": 0, "wk": 0, "wbest": 0}, "gear": {}, "gearOn": [], "safeLv": 1, "risk": "normal",
		"face": "", "nick": "", "show": [], "showBg": "", "title": "", "sign": "", "mvps": 0, "deaths": 0, "badges": [0, 0, 0, 0, 0], "seenSeason": 0, "tutDone": false}
	for k in E.start: p[k] = int(E.start[k])
	for k in E.startExtra: p[k] = int(E.startExtra[k])
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
	for k in CUR_KEYS + ["trophies", "xp", "matches", "wins", "kills", "paint", "day", "dayWin", "tpBonus", "tut", "streak", "bestStreak", "map", "mvps", "deaths", "seenSeason"]:
		o[k] = int(o.get(k, 0))
	for id in o.pilots: o.pilots[id] = {"lv": int(o.pilots[id].lv), "bt": int(o.pilots[id].bt)}
	for id in o.chests: o.chests[id] = int(o.chests[id])
	o.pass.xp = int(o.pass.xp); o.pass.bc = int(o.pass.bc)
	o.rank.rp = int(o.rank.rp); o.rank.best = int(o.rank.best); o.rank.n = int(o.rank.n)
	for k in o.stash: o.stash[k] = int(o.stash[k])
	for k in o.gear: o.gear[k] = int(o.gear[k])
	o.safeLv = int(o.safeLv)
	for k in o.lootRec: o.lootRec[k] = int(o.lootRec[k])
	o.pass.cf = o.pass.cf.map(func(x): return int(x)); o.pass.cp = o.pass.cp.map(func(x): return int(x)); o.rank.road = o.rank.road.map(func(x): return int(x))
	o.story.c = o.story.c.map(func(x): return int(x))
	o.badges = o.badges.map(func(x): return int(x))
	while o.badges.size() < 5: o.badges.append(0)

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
			"passxp": o.pass.xp = mini(pass_xp_max(), int(o.pass.xp) + int(it.n))
			"skin":
				if not o.skins.has(it.id): o.skins.append(it.id)
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
	if sim.loot:   # 搜刮撤离：撤离成功才把背包 + 安全箱带出来；阵亡只保住安全箱
		var ex: bool = me.extracted
		var kept: Array = sim.obj.banked.get(me.id, []) if ex else sim.inv_keys(me.safe)
		var v := sim.loot_value(kept)
		var gold := kept.filter(func(k): return int(D.loot.items[k].r) >= 5).size()
		return {"xp": 60 + me.kills * 12 + ((80 + mini(120, v / 100)) if ex else 0), "trophies": 6 if ex else -2, "won": ex, "draw": false, "mvp": false, "kills": me.kills, "paint": me.painted, "mode": "loot",
			"lootex": ex, "lootv": v if ex else 0, "lootgold": gold if ex else 0, "kept": kept, "paid": int(sim.obj.paid.get(me.id, 0)), "risk": sim.risk}
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
		return {"xp": xp1, "trophies": table[mini(rank, table.size()) - 1], "won": rank == 1, "draw": false, "mvp": is_mvp, "kills": me.kills, "paint": me.painted, "rank": rank, "of": n, "mode": sim.mode, "cubes": me.cubes}
	var xp: int = 60 + (60 if won else (30 if draw else 0)) + me.kills * 10 + me.painted / 25 + me.obj * 12 + (40 if is_mvp else 0)
	var T: Dictionary = E.trophy
	var tr: int = int(T.win) if won else (int(T.draw) if draw else -int(T.loss))
	if sim.mode == "raid": tr = 5 if won else 0
	return {"xp": xp, "trophies": tr, "won": won, "draw": draw, "mvp": is_mvp, "kills": me.kills, "paint": me.painted, "mode": sim.mode,
		"balloons": me.balloons, "float": int(me.float_t), "seals": me.seals, "spirits": me.spirits, "ranked": sim.ranked}

# ---------------- 通行证 ----------------
func pass_xp_max() -> int: return int(E.pass.tiers) * int(E.pass.xpPer) + int(E.pass.bonusMax) * int(E.pass.bonusXp)
func pass_level() -> int: return mini(int(E.pass.tiers), int(o.pass.xp) / int(E.pass.xpPer))
func pass_bonus() -> Dictionary:
	var over: int = max(0, int(o.pass.xp) - int(E.pass.tiers) * int(E.pass.xpPer))
	return {"got": int(o.pass.bc), "can": max(0, mini(int(E.pass.bonusMax), over / int(E.pass.bonusXp)) - int(o.pass.bc)), "into": over % int(E.pass.bonusXp)}

func buy_pass(deluxe: bool) -> Dictionary:
	if (o.pass.dlx if deluxe else o.pass.prem): return no("已经是豪华版通行证了" if deluxe else "已经解锁高级通行证了")
	var cost: int = (int(E.pass.deluxe) - int(E.pass.price) if o.pass.prem else int(E.pass.deluxe)) if deluxe else int(E.pass.price)
	if int(o.gems) < cost: return no("宝石不够（需要 %d）" % cost)
	o.gems -= cost; o.pass.prem = true
	var items: Array = []
	if deluxe:
		o.pass.dlx = true; o.pass.xp = mini(pass_xp_max(), int(o.pass.xp) + int(E.pass.boost) * int(E.pass.xpPer))
		items.append({"k": "skin", "id": "fr_merc"}); grant(items)
	return ok(items)

func claim_pass(tier: int, prem: bool) -> Dictionary:
	if tier < 1 or tier > int(E.pass.tiers): return no("没有这一级")
	if pass_level() < tier: return no("通行证升到 %d 级才能领" % tier)
	if prem and not o.pass.prem: return no("需要先解锁高级通行证")
	var lst: Array = o.pass.cp if prem else o.pass.cf
	if lst.has(tier): return no("已经领过了")
	lst.append(tier)
	var it: Dictionary = (E.pass.prem if prem else E.pass.free)[tier - 1].duplicate()
	grant([it])
	return ok([it])

func claim_pass_all() -> Dictionary:
	var items: Array = []
	for t in range(1, pass_level() + 1):
		if not o.pass.cf.has(t): o.pass.cf.append(t); items.append(E.pass.free[t - 1].duplicate())
		if o.pass.prem and not o.pass.cp.has(t): o.pass.cp.append(t); items.append(E.pass.prem[t - 1].duplicate())
	var b := pass_bonus()
	if b.can > 0: o.pass.bc = int(o.pass.bc) + b.can; items.append({"k": "coins", "n": int(E.pass.bonusCoins) * b.can})
	if items.is_empty(): return no("没有可以领的奖励")
	grant(items)
	return ok(merge(items))

# ---------------- 邮件 ----------------
static func now_s() -> int: return int(Time.get_unix_time_from_system())
func mailbox() -> Array:
	var now := now_s(); var out: Array = []
	for m in E.mails:
		if o.mailDel.has(m.id) or now < int(m.t): continue
		var got: bool = o.mailGot.has(m.id)
		if not (m.get("keep", false) and not got) and now >= int(m.t) + (int(E.mailDays) if got else int(E.mailUnclaimed)) * 86400: continue   # keep：上线礼包不会过期
		var mm: Dictionary = m.duplicate(); mm.got = got; mm.expires = int(m.t) + int(E.mailUnclaimed) * 86400
		out.append(mm)
	return out
func unread_mail() -> int:
	return mailbox().filter(func(m): return not m.got).size()
func claim_mail(id: String) -> Dictionary:
	var items: Array = []
	for m in mailbox():
		if m.got or (id != "*" and m.id != id): continue
		o.mailGot.append(m.id)
		for it in m.items: items.append(it.duplicate())
	if items.is_empty(): return no("没有可以领取的邮件")
	grant(items)
	return ok(merge(items))
func del_mail(id: String) -> Dictionary:
	for m in mailbox():
		if m.got and (id == "*" or m.id == id): o.mailDel.append(m.id)
	return ok()

# ---------------- 任务线 / 叛将档案 ----------------
func task_state(id: String) -> Dictionary:
	var L: Dictionary = E.tasklines[id]
	if not o.tl.has(id): o.tl[id] = {"p": L.steps.map(func(_q): return 0), "c": L.steps.map(func(_q): return false)}
	return o.tl[id]
func chapter_open(id: String) -> bool:
	var L: Dictionary = E.tasklines[id]
	if not L.has("need"): return true
	return task_state(L.need).c.all(func(x): return x)
func claim_task(id: String, i: int) -> Dictionary:
	var L: Dictionary = E.tasklines.get(id, {})
	if L.is_empty() or i < 0 or i >= L.steps.size(): return no("没有这个任务")
	var st := task_state(id)
	if L.has("chapter") and not chapter_open(id): return no("要先完成「%s」" % E.tasklines[L.need].name)
	if L.has("chapter") and i > 0 and not st.c[i - 1]: return no("章节任务要按顺序领取")
	if int(st.p[i]) < int(L.steps[i][1]): return no("任务还没完成")
	if st.c[i]: return no("已经领过了")
	st.c[i] = true
	var it: Dictionary = L.steps[i][2].duplicate()
	grant([it])
	return ok([it])
func story_done() -> int:
	var n := 0
	for i in E.story.steps.size():
		if int(o.story.p[i]) >= int(E.story.steps[i][1]): n += 1
	return n
func claim_story(n: int) -> Dictionary:
	for R in E.story.rewards:
		if int(R[0]) != n: continue
		if story_done() < n: return no("要先完成 %d 个任务" % n)
		if o.story.c.has(n): return no("已经领过了")
		o.story.c.append(n)
		var it: Dictionary = R[1].duplicate(); grant([it])
		return ok([it])
	return no("没有这个奖励")
func sync_level_tasks() -> void:
	for id in E.tasklines:
		var L: Dictionary = E.tasklines[id]; var st := task_state(id)
		for i in L.steps.size():
			if L.steps[i][0] == "lvl": st.p[i] = mini(int(L.steps[i][1]), level())

# ---------------- 活动 ----------------
func active_events() -> Array:
	var now := now_s()
	return E.events.filter(func(ev): return now >= int(ev.start) and now < int(ev.end))
func event_state(ev: Dictionary) -> Dictionary:
	if not o.ev.has(ev.id): o.ev[ev.id] = {"p": ev.quests.map(func(_q): return 0), "c": ev.quests.map(func(_q): return false), "s": ev.get("shop", []).map(func(_q): return 0)}
	var st: Dictionary = o.ev[ev.id]
	if not st.has("s"): st.s = ev.get("shop", []).map(func(_q): return 0)
	return st
func stat_name(k: String, n) -> String: return str(E.eventStat.get(k, k)).replace("{n}", str(int(n)))
func claim_event(evid: String, i: int) -> Dictionary:
	for ev in active_events():
		if ev.id != evid: continue
		var st := event_state(ev); var q: Array = ev.quests[i]
		if int(st.p[i]) < int(q[1]): return no("任务还没完成")
		if st.c[i]: return no("已经领过了")
		st.c[i] = true
		var it: Dictionary = q[2].duplicate(); grant([it])
		return ok([it])
	return no("活动已经结束了")
func event_shop(evid: String, i: int) -> Dictionary:
	for ev in active_events():
		if ev.id != evid or not ev.has("shop"): continue
		var item: Dictionary = ev.shop[i]; var st := event_state(ev)
		if int(st.s[i]) >= int(item.limit): return no("已经兑换完了")
		if item.it.k == "skin" and o.skins.has(item.it.id): return no("已经拥有了")
		var cur: String = ev.get("cur", "tickets")
		if int(o.get(cur, 0)) < int(item.cost): return no("%s不够（需要 %d）" % [cur_name(cur), int(item.cost)])
		o[cur] -= int(item.cost); st.s[i] = int(st.s[i]) + 1
		var it: Dictionary = item.it.duplicate(); grant([it])
		return ok([it])
	return no("活动已经结束了")
func event_login(evid: String) -> Dictionary:
	for ev in active_events():
		if ev.id != evid or not ev.has("login"): continue
		if not o.evLogin.has(evid): o.evLogin[evid] = {"n": 0, "d": -1}
		var L: Dictionary = o.evLogin[evid]
		if int(L.n) >= ev.login.size(): return no("登录奖励已经全部领完了")
		if int(L.d) == day_index(): return no("今天已经领过了，明天再来")
		var it: Dictionary = ev.login[int(L.n)].duplicate()
		L.n = int(L.n) + 1; L.d = day_index(); grant([it])
		return ok([it])
	return no("活动已经结束了")
func collab_buy(id: String) -> Dictionary:
	var own := func(x): return o.pilots.has(x.id) if x.k == "pilot" else o.mechs.has(x.id)
	var lst: Array = E.collab.shop.filter(func(x): return not own.call(x)) if id == "bundle" else E.collab.shop.filter(func(x): return x.id == id)
	if lst.is_empty(): return no("已经全部拥有了" if id == "bundle" else "没有这个商品")
	if id != "bundle" and own.call(lst[0]): return no("已经拥有了")
	var price := 0
	if id == "bundle" and lst.size() == E.collab.shop.size(): price = int(E.collab.bundle)
	else:
		for x in lst: price += int(x.gems)
	if int(o.gems) < price: return no("宝石不够（需要 %d）" % price)
	o.gems -= price
	var items: Array = lst.map(func(x): return {"k": x.k, "id": x.id})
	grant(items)
	return ok(items)

# ---------------- 限时购买 / 皮肤 ----------------
func offers() -> Dictionary:
	var slot := now_s() / (int(E.offer.hours) * 3600)
	var h: int = (slot * 2654435761 + 97) & 0xFFFFFFFF
	var rnd := func():
		h = (h * 1103515245 + 12345) & 0xFFFFFFFF
		return h / 4294967296.0
	var shuf := func(arr: Array) -> Array:
		var a := arr.duplicate()
		for i in range(a.size() - 1, 0, -1):
			var j := int(rnd.call() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t
		return a
	var pp: Array = shuf.call(E.pools.standard)
	var mm: Array = shuf.call(E.pools.mech.filter(func(id): return not E.seasonMechs.has(id)))
	var pick := func(lst: Array, has: Callable, n: int) -> Array:
		return (lst.filter(func(id): return not has.call(id)) + lst.filter(func(id): return has.call(id))).slice(0, n)
	return {"ends": (slot + 1) * int(E.offer.hours) * 3600, "pilots": pick.call(pp, has_pilot, 2), "mech": pick.call(mm, has_mech, 1)[0]}
func buy_offer(id: String) -> Dictionary:
	var of := offers(); var is_p: bool = of.pilots.has(id); var is_m: bool = of.mech == id
	if not is_p and not is_m: return no("这个限时商品已经刷新掉了")
	if (has_pilot(id) if is_p else has_mech(id)): return no("已经拥有了")
	var price := int(E.offer.pilotPrice) if is_p else int(E.offer.mechPrice)
	if int(o.gems) < price: return no("宝石不够（需要 %d）" % price)
	o.gems -= price
	var it := {"k": "pilot" if is_p else "mech", "id": id}
	grant([it])
	return ok([it])
func skin(id: String):
	for K in E.skins:
		if K.id == id: return K
	return null
func daily_deal() -> Dictionary:
	var lst: Array = E.skins.filter(func(k): return int(k.price) > 0)
	return {"id": lst[(day_index() * 7) % lst.size()].id, "off": 0.3}
func skin_price(K: Dictionary) -> int:
	var d := daily_deal()
	return int(round(int(K.price) * (1 - d.off))) if d.id == K.id else int(K.price)
func buy_skin(id: String) -> Dictionary:
	var K = skin(id)
	if K == null: return no("没有这个皮肤")
	if o.skins.has(id): return no("已经拥有了")
	if int(K.price) <= 0: return no("这个皮肤只能从通行证 / 活动获得")
	var price := skin_price(K)
	if int(o.gems) < price: return no("宝石不够（需要 %d）" % price)
	o.gems -= price; o.skins.append(id)
	return ok([{"k": "skin", "id": id}])
func wear(id: String) -> Dictionary:   # 穿上 / 脱下
	var K = skin(id)
	if K == null or not o.skins.has(id): return no("还没有这个皮肤")
	var w: Dictionary = o.wear
	match K.kind:
		"pilot":
			if w.pilot.get(K.pilot, "") == id: w.pilot.erase(K.pilot)
			else: w.pilot[K.pilot] = id
		_:
			w[K.kind] = "" if w.get(K.kind, "") == id else id
	return ok()
func pilot_skin(pid: String) -> String: return str(o.wear.pilot.get(pid, ""))
func art_id(pid: String) -> String:   # 立绘 / 头像文件名：穿了皮肤就用皮肤的
	var s := pilot_skin(pid)
	return s if s != "" else pid
func pilot_look(pid: String) -> Dictionary:   # 3D 模型用：把皮肤的配色盖上去
	var P: Dictionary = D.pilots[pid].duplicate()
	var K = skin(pilot_skin(pid))
	if K != null:
		for k in K.get("over", {}): P[k] = K.over[k]
	return P
func mech_paint():
	var K = skin(str(o.wear.get("mech", "")))
	return K.paint if K != null else null
func look_with(pid: String, pskin: String) -> Dictionary:   # 别人的驾驶员皮肤配色
	var P: Dictionary = D.pilots[pid].duplicate()
	var K = skin(pskin)
	if K != null and str(K.get("pilot", "")) == pid:
		for k in K.get("over", {}): P[k] = K.over[k]
	return P
func paint_of(id: String):
	var K = skin(id)
	return K.paint if K != null and K.has("paint") else null
func my_looks() -> Dictionary:
	return {"pskin": pilot_skin(str(o.pilot)), "paint": str(o.wear.get("mech", "")), "fx": str(o.wear.get("fx", "")), "frame": str(o.wear.get("frame", "")), "avatar": str(o.wear.get("avatar", ""))}

# ---------------- 排位赛 ----------------
func rank_tier(rp: int) -> int:
	var i := 0
	for k in E.rank.tiers.size():
		if rp >= int(E.rank.tiers[k].rp): i = k
	return i
func rank_season() -> void:
	var rk: Dictionary = o.rank
	if int(rk.get("s", 0)) == int(E.rank.season.id): return
	rk.rp = int(rk.rp) / 2; rk.road = []; rk.n = 0; rk.best = rank_tier(rk.rp); rk.s = int(E.rank.season.id)
func can_ranked() -> bool: return o.pilots.size() >= int(E.rank.need.pilots) and o.mechs.size() >= int(E.rank.need.mechs)
func ranked_mode() -> String:
	return E.rankModes[(now_s() / (int(E.rankHours) * 3600)) % E.rankModes.size()]
func ranked_ends() -> int: return (now_s() / (int(E.rankHours) * 3600) + 1) * int(E.rankHours) * 3600
func rank_bot_power() -> Dictionary:
	var t := rank_tier(int(o.rank.rp))
	return {"lv": mini(11, 3 + t), "bt": 2 if t >= 6 else (1 if t >= 3 else 0)}
func rank_delta(rw: Dictionary, rp0: int) -> int:
	var R: Dictionary = E.rank
	if rw.won: return int(R.mvpWin) if rw.mvp else int(R.win)
	if rw.draw: return int(R.draw)
	var d := int(R.lossHi) if rank_tier(rp0) >= int(R.hiFrom) else int(R.loss)
	return int(d / 2.0) if rw.mvp else d
func road_skin() -> Dictionary:
	var R: Dictionary = E.rank
	if o.skins.has(R.legendSkin): return no("已经拥有了")
	if int(o.shards) < int(R.shardsNeed): return no("传说碎片不够（需要 %d 个）" % int(R.shardsNeed))
	o.shards -= int(R.shardsNeed); o.skins.append(R.legendSkin)
	return ok([{"k": "skin", "id": R.legendSkin}])

func reset_talents() -> Dictionary:
	if int(o.gems) < 30: return no("重置天赋需要 30 宝石")
	o.gems -= 30; o.talents = []; o.tal = []
	return ok()

# ---------------- 对战结算（移植 E.applyMatch 全部：通行证、排位、活动、任务线、叛将档案） ----------------
func apply_match(rw: Dictionary) -> Dictionary:
	var lv_before := level(); var tr_before := int(o.trophies)
	o.xp += int(rw.xp); o.matches += 1
	if rw.won: o.wins += 1
	o.kills += int(rw.kills); o.paint += int(rw.paint)
	o.deaths += int(rw.get("deaths", 0))
	if rw.mvp: o.mvps += 1
	if rw.has("badge"): o.badges[clampi(int(rw.badge), 0, 4)] += 1
	o.trophies = max(0, tr_before + int(rw.trophies))
	var evs := active_events()
	var mode: String = rw.mode
	var esc: bool = mode.begins_with("escape"); var park: bool = mode == "park"; var ranked: bool = rw.get("ranked", false)
	var R: Dictionary = E.rank
	var coin_mul := float(R.coinMul) if ranked else 1.0
	for ev in evs: coin_mul *= float(ev.get("coinMul", 1.0))
	var coins: int = 20 + (20 if rw.won else (10 if rw.draw else 0)) + mini(30, int(rw.kills) * 3) + (10 if rw.mvp else 0)
	var items: Array = [{"k": "coins", "n": int(round(coins * coin_mul))}]
	if coin_mul > 1.0: items[0].why = "排位赛加成" if ranked else "活动加成"
	if rw.won: o.streak += 1; o.bestStreak = max(int(o.bestStreak), int(o.streak))
	elif not rw.draw: o.streak = 0
	if rw.won and o.streak >= 3: items.append({"k": "coins", "n": mini(10, o.streak) * 10, "why": "%d 连胜" % o.streak})
	var rank_info := {}
	if ranked:
		rank_season()
		var rp0 := int(o.rank.rp); var t0 := rank_tier(rp0)
		var rp1: int = max(0, rp0 + rank_delta(rw, rp0))
		if not rw.won and not rw.draw and t0 <= int(R.protect): rp1 = max(rp1, int(R.tiers[t0].rp))
		o.rank.rp = rp1; o.rank.n = int(o.rank.n) + 1
		for i in R.road.size():
			var need := int(R.road[i][0])
			if rp1 >= need and not o.rank.road.has(i):
				o.rank.road.append(i)
				var it: Dictionary = R.road[i][1].duplicate()
				if not (it.k == "skin" and o.skins.has(it.id)): it.why = "夺冠之路 %d 分" % need; items.append(it)
		o.rank.best = max(int(o.rank.best), rank_tier(rp1))
		rank_info = {"rp0": rp0, "rp1": rp1, "d": rp1 - rp0, "t0": t0, "t1": rank_tier(rp1)}
	for ev in evs:
		if park and ev.has("ticketsPerPark"): items.append({"k": "tickets", "n": int(ev.ticketsPerPark) + (int(ev.get("ticketsWin", 0)) if rw.won else 0), "why": ev.name})
		if ev.has("curPer"):
			var n: int = int(ev.curPer.get(mode, ev.get("curOther", 0))) + (int(ev.get("curWin", 0)) if rw.won and ev.curPer.has(mode) else 0)
			if n > 0: items.append({"k": ev.cur, "n": n, "why": ev.name})
	var g := {"play": 1, "win": 1 if rw.won else 0, "kills": int(rw.kills), "paint": int(rw.paint), "elim": 1 if mode == "elim" else 0, "escape": 1 if esc else 0,
		"top3": 1 if esc and int(rw.get("rank", 9)) <= 3 else 0, "crates": int(rw.get("cubes", 0)), "park": 1 if park else 0, "parkwin": 1 if park and rw.won else 0,
		"balloons": int(rw.get("balloons", 0)), "float": int(rw.get("float", 0)), "ranked": 1 if ranked else 0, "raid": 1 if mode == "raid" else 0,
		"raidwin": 1 if mode == "raid" and rw.won else 0, "seal": 1 if mode == "seal" else 0, "seals": int(rw.get("seals", 0)), "spirits": int(rw.get("spirits", 0)),
		"loot": 1 if mode == "loot" else 0, "lootex": 1 if rw.get("lootex", false) else 0, "lootv": int(rw.get("lootv", 0)), "lootgold": int(rw.get("lootgold", 0)), "loothi": 0}
	for ev in evs:
		var st := event_state(ev)
		for i in ev.quests.size(): st.p[i] = mini(int(ev.quests[i][1]), int(st.p[i]) + int(g.get(ev.quests[i][0], 0)))
	for i in E.story.steps.size(): o.story.p[i] = mini(int(E.story.steps[i][1]), int(o.story.p[i]) + int(g.get(E.story.steps[i][0], 0)))
	for id in E.tasklines:
		var L: Dictionary = E.tasklines[id]; var st2 := task_state(id)
		if L.has("chapter") and not chapter_open(id): continue
		for i in L.steps.size():
			var q: Array = L.steps[i]
			if q[0] != "lvl" and (not L.has("chapter") or i == 0 or int(st2.p[i - 1]) >= int(L.steps[i - 1][1])):
				st2.p[i] = mini(int(q[1]), int(st2.p[i]) + int(g.get(q[0], 0)))
	var loot_info := {}
	if mode == "loot":
		var R2: Dictionary = o.lootRec; R2.runs = int(R2.runs) + 1
		for k in rw.get("kept", []): o.stash[k] = mini(9999, int(o.stash.get(k, 0)) + 1)
		var lost: Array = []
		if rw.lootex:
			R2.ex = int(R2.ex) + 1; R2.total = int(R2.total) + int(rw.lootv); R2.best = max(int(R2.best), int(rw.lootv))
			if int(R2.get("wk", 0)) != week_index(): R2.wk = week_index(); R2.wbest = 0
			R2.wbest = max(int(R2.wbest), int(rw.lootv)); R2.gold = int(R2.get("gold", 0)) + int(rw.get("lootgold", 0))
			if int(rw.get("paid", 0)) > 0: o.coins = max(0, int(o.coins) - int(rw.paid))
		elif rw.get("risk", "normal") == "high":
			for gk in o.gearOn.duplicate():
				if int(o.gear.get(gk, 0)) > 0:
					o.gear[gk] = int(o.gear[gk]) - 1; lost.append(gk)
					if o.gear[gk] <= 0: o.gear.erase(gk); o.gearOn.erase(gk)
		loot_info = {"ex": rw.lootex, "v": int(rw.lootv), "kept": rw.get("kept", []), "lost": lost}
	var d := day_index()
	if int(o.day) != d: o.day = d; o.dayWin = 0
	if rw.won and int(o.dayWin) == 0: o.dayWin = 1; items.append({"k": "gems", "n": int(E.firstWinGems), "why": "每日首胜"})
	var pmul := float(R.passMul) if ranked else 1.0
	if esc:
		for ev in evs: pmul *= float(ev.get("escPassMul", 1.0))
	var pxp := int(round((30 + (30 if rw.won else (15 if rw.draw else 0)) + mini(20, int(rw.kills) * 2) + (10 if rw.mvp else 0)) * pmul))
	items.append({"k": "passxp", "n": pxp, "why": "对战"})
	refresh_quests()
	var gain := {"won": 1 if rw.won else 0, "play": 1, "kills": int(rw.kills), "paint": int(rw.paint), "mvp": 1 if rw.mvp else 0}
	var done: Array = []
	var dq := daily_quests(d)
	for i in dq.size():
		var q: Array = dq[i]; var before := int(o.q.dp[i])
		o.q.dp[i] = mini(int(q[1]), before + int(gain[E.quests[q[0]].stat]))
		if before < int(q[1]) and o.q.dp[i] >= int(q[1]): items.append({"k": "passxp", "n": int(q[2]), "why": "每日任务：" + quest_name(q)}); done.append(quest_name(q))
	for i in E.weekly.size():
		var q2: Array = E.weekly[i]; var b2 := int(o.q.wp[i])
		o.q.wp[i] = mini(int(q2[1]), b2 + int(gain[E.quests[q2[0]].stat]))
		if b2 < int(q2[1]) and o.q.wp[i] >= int(q2[1]): items.append({"k": "passxp", "n": int(q2[2]), "why": "每周任务：" + quest_name(q2)}); done.append(quest_name(q2))
	var pass_before := pass_level()
	var ups := level() - lv_before
	if ups > 0:
		items.append({"k": "coins", "n": int(E.levelUp.coins) * ups, "why": "账号升级"})
		items.append({"k": "gems", "n": int(E.levelUp.gems) * ups, "why": "账号升级"})
	grant(items)
	sync_level_tasks()
	save()
	var pxp_total := 0
	for it in items:
		if it.k == "passxp": pxp_total += int(it.n)
	return {"items": merge(items.filter(func(it): return it.k != "passxp")), "pass_xp": pxp_total, "pass_before": pass_before, "pass_after": pass_level(),
		"lv_before": lv_before, "lv_ups": ups, "tr_before": tr_before, "quests": done, "streak": o.streak, "rank": rank_info, "loot": loot_info}

# 小红点：有没有能领的东西
func claimables() -> Dictionary:
	var n_pass := 0
	for t in range(1, pass_level() + 1):
		if not o.pass.cf.has(t): n_pass += 1
		if o.pass.prem and not o.pass.cp.has(t): n_pass += 1
	var n_task := 0
	for id in E.tasklines:
		var L: Dictionary = E.tasklines[id]; var st := task_state(id)
		if L.has("chapter") and not chapter_open(id): continue
		for i in L.steps.size():
			if not st.c[i] and int(st.p[i]) >= int(L.steps[i][1]) and (not L.has("chapter") or i == 0 or st.c[i - 1]): n_task += 1
	for R in E.story.rewards:
		if story_done() >= int(R[0]) and not o.story.c.has(int(R[0])): n_task += 1
	var n_ev := 0
	for ev in active_events():
		var st2 := event_state(ev)
		for i in ev.quests.size():
			if not st2.c[i] and int(st2.p[i]) >= int(ev.quests[i][1]): n_ev += 1
		if ev.has("login") and int(o.evLogin.get(ev.id, {"n": 0}).n) < ev.login.size() and int(o.evLogin.get(ev.id, {"d": -1}).d) != day_index(): n_ev += 1
	return {"pass": n_pass, "tasks": n_task, "events": n_ev, "mail": unread_mail()}

# ---------------- 仓库 / 军需处 ----------------
func stash_value() -> int:
	var v := 0
	for k in o.stash: v += int(D.loot.items[k].v) * int(o.stash[k]) if D.loot.items.has(k) else 0
	return v
func sell_loot(k: String, n: int = 1) -> Dictionary:
	if int(o.stash.get(k, 0)) < n: return no("仓库里没有这么多")
	var gain: int = int(D.loot.items[k].v) / 10 * n
	o.stash[k] = int(o.stash[k]) - n
	if o.stash[k] <= 0: o.stash.erase(k)
	o.coins += gain
	return ok([{"k": "coins", "n": gain}])
func sell_all() -> Dictionary:   # 一键卖出：只卖普通 / 优良 / 稀有
	var gain := 0
	for k in o.stash.keys():
		if int(D.loot.items[k].r) <= 3: gain += int(D.loot.items[k].v) / 10 * int(o.stash[k]); o.stash.erase(k)
	if gain <= 0: return no("没有可以一键卖出的物资（史诗以上要手动卖）")
	o.coins += gain
	return ok([{"k": "coins", "n": gain}])
func ex_loot(k: String) -> Dictionary:   # 传说 / 至宝物资换宝石 / 能量结晶
	var it: Dictionary = D.loot.items.get(k, {})
	if not it.has("ex"): return no("这件物资不能兑换")
	if int(o.stash.get(k, 0)) < 1: return no("仓库里没有")
	o.stash[k] = int(o.stash[k]) - 1
	if o.stash[k] <= 0: o.stash.erase(k)
	var items: Array = []
	for c in it.ex: items.append({"k": c, "n": int(it.ex[c])})
	grant(items)
	return ok(items)
func buy_gear(id: String) -> Dictionary:
	var G: Dictionary = D.loot.gear.get(id, {})
	if G.is_empty(): return no("没有这件装备")
	if int(o.coins) < int(G.price): return no("金币不够（需要 %d）" % int(G.price))
	o.coins -= int(G.price); o.gear[id] = int(o.gear.get(id, 0)) + 1
	return ok()
func toggle_gear(id: String) -> Dictionary:
	if o.gearOn.has(id): o.gearOn.erase(id); return ok()
	if int(o.gear.get(id, 0)) <= 0: return no("还没有这件装备")
	if id in ["pack", "bigpack"]: o.gearOn = o.gearOn.filter(func(g): return not g in ["pack", "bigpack"])
	o.gearOn.append(id)
	return ok()
func safe_up() -> Dictionary:
	var lv := int(o.safeLv)
	if lv >= 3: return no("安全箱已经是最大的了")
	var cost := int(D.loot.safeCost[lv + 1])
	if int(o.coins) < cost: return no("金币不够（需要 %d）" % cost)
	o.coins -= cost; o.safeLv = lv + 1
	return ok()

# ================= 个人资料：头像 / 头像框 / 展示框 / 称号 / 签名 =================
func avatar_path() -> String:
	var av = skin(str(o.wear.get("avatar", "")))
	if av != null: return "res://art/avatars/%s.png" % av.avatar
	var pid: String = str(o.face) if str(o.face) != "" and has_pilot(str(o.face)) else str(o.pilot)
	if pid == "" or not D.pilots.has(pid): return "res://art/icons/pilot.png"
	return "res://art/faces/%s.png" % art_id(pid)

func frame_key() -> String:
	var fr = skin(str(o.wear.get("frame", "")))
	return str(fr.frame) if fr != null else ""

# 别人（AI）的头像：头像皮肤 > 驾驶员皮肤头像 > 驾驶员头像
func looks_avatar(looks: Dictionary, pilot: String) -> String:
	var av = skin(str(looks.get("avatar", "")))
	if av != null: return "res://art/avatars/%s.png" % av.avatar
	if looks.get("pskin", "") != "" and ResourceLoader.exists("res://art/faces/%s.png" % looks.pskin): return "res://art/faces/%s.png" % looks.pskin
	return "res://art/faces/%s.png" % pilot if D.pilots.has(pilot) else "res://art/icons/pilot.png"

func looks_frame(looks: Dictionary) -> String:
	var fr = skin(str(looks.get("frame", "")))
	return str(fr.frame) if fr != null else ""

# 称号：按战绩解锁
func titles() -> Array:
	var R: Dictionary = E.rank
	var best: int = int(o.rank.best)
	var out: Array = [
		{"id": "rookie", "name": "涂鸦新兵", "ok": true, "how": "默认称号"},
		{"id": "vet", "name": "百战老兵", "ok": int(o.matches) >= 100, "how": "打满 100 场（%d / 100）" % int(o.matches)},
		{"id": "winner", "name": "常胜将军", "ok": int(o.wins) >= 50, "how": "赢 50 场（%d / 50）" % int(o.wins)},
		{"id": "killer", "name": "击毁专家", "ok": int(o.kills) >= 300, "how": "累计击毁 300（%d / 300）" % int(o.kills)},
		{"id": "painter", "name": "城市画师", "ok": int(o.paint) >= 50000, "how": "累计涂地 50000 格（%d / 50000）" % int(o.paint)},
		{"id": "mvp", "name": "MVP 收割机", "ok": int(o.mvps) >= 20, "how": "拿到 20 次 MVP（%d / 20）" % int(o.mvps)},
		{"id": "streak", "name": "连胜狂人", "ok": int(o.bestStreak) >= 8, "how": "最高 8 连胜（%d / 8）" % int(o.bestStreak)},
		{"id": "looter", "name": "撤离专家", "ok": int(o.lootRec.ex) >= 10, "how": "成功撤离 10 次（%d / 10）" % int(o.lootRec.ex)},
		{"id": "rich", "name": "黑市大亨", "ok": int(o.lootRec.total) >= 100000, "how": "累计带出物资价值 100000"},
		{"id": "pass", "name": "通行证满级", "ok": pass_level() >= int(E.pass.tiers), "how": "通行证升到 %d 级" % int(E.pass.tiers)},
		{"id": "collector", "name": "收藏家", "ok": o.pilots.size() >= 15, "how": "拥有 15 位驾驶员（%d / 15）" % o.pilots.size()},
	]
	for t in range(3, R.tiers.size()):
		out.append({"id": "rank%d" % t, "name": str(R.tiers[t].name), "ok": best >= t, "how": "排位最高达到「%s」" % R.tiers[t].name, "rank": t})
	return out

func title_name() -> String:
	for t in titles():
		if t.id == str(o.title) and t.ok: return t.name
	return "涂鸦新兵"

func stats() -> Array:
	var m: int = max(1, int(o.matches))
	return [["场次", str(o.matches)], ["胜场", str(o.wins)], ["胜率", "%d%%" % int(round(100.0 * int(o.wins) / m))], ["MVP", str(o.mvps)],
		["击毁", str(o.kills)], ["倒下", str(o.deaths)], ["K/D", "%.2f" % (float(o.kills) / max(1, int(o.deaths)))], ["涂地", str(o.paint)],
		["最高连胜", str(o.bestStreak)], ["奖杯", str(o.trophies)], ["排位最高", str(E.rank.tiers[int(o.rank.best)].name)], ["撤离成功", "%d / %d" % [int(o.lootRec.ex), int(o.lootRec.runs)]]]

func set_show(i: int, item: Dictionary) -> void:
	while o.show.size() <= i: o.show.append({})
	o.show[i] = item; save()

func display_name() -> String:
	if str(o.get("nick", "")) != "": return I18n.keep(str(o.nick))
	return I18n.keep(str(o.name)) if str(o.name) != "" else "游客"

# ================= 交易行（价格每小时浮动，和网页版 economy.js 同一个公式）+ 本周撤离排行 =================
static func khash(k: String) -> int:
	var h := 7
	for i in k.length(): h = (h * 31 + k.unicode_at(i)) % 100003
	return h
static func market_mult(k: String, hour: int) -> float:
	var h := float(khash(k))
	return clampf(1.0 + 0.28 * sin(hour * 0.37 + h) + 0.1 * sin(hour * 1.73 + h * 0.5) + 0.05 * sin(hour * 4.1 + h * 1.3), 0.6, 1.45)
func market_price(k: String) -> Dictionary:
	var I: Dictionary = D.loot.items.get(k, {})
	if I.is_empty(): return {}
	var hour := int(floor(Time.get_unix_time_from_system() / 3600.0))
	var m := market_mult(k, hour); var m0 := market_mult(k, hour - 1)
	var sell: int = max(1, int(round(float(I.v) / 10.0 * m)))
	return {"sell": sell, "buy": 0 if I.has("ex") else max(2, int(round(sell * 1.2))), "mult": m, "trend": m - m0, "next": (hour + 1) * 3600}
func mkt_sell(k: String, n := 1) -> Dictionary:
	var q := market_price(k)
	if q.is_empty(): return no("没有这种物资")
	if int(o.stash.get(k, 0)) < n: return no("仓库里没有这么多")
	o.stash[k] = int(o.stash[k]) - n
	if o.stash[k] <= 0: o.stash.erase(k)
	var it := {"k": "coins", "n": int(q.sell) * n}
	o.coins += it.n
	return ok([it])
func mkt_buy(k: String, n := 1) -> Dictionary:
	var q := market_price(k)
	if q.is_empty(): return no("没有这种物资")
	if int(q.buy) <= 0: return no("这件物资不在交易行出售")
	if int(o.coins) < int(q.buy) * n: return no("金币不够（需要 %d）" % (int(q.buy) * n))
	o.coins -= int(q.buy) * n; o.stash[k] = int(o.stash.get(k, 0)) + n
	save()
	return {"ok": true, "items": []}
const BOARD_NAMES := ["今晚吃涂料", "xXSniperXx", "摸鱼专业户", "Kiwi", "喷漆小王子", "ZeroLag", "奶茶三分糖", "Tofu", "涂鸦大王", "ghost404", "老六", "paintgod", "夜猫子", "Blitz", "熬夜冠军", "momo233", "稳住别浪", "Nova", "一只咸鱼", "Ace"]
func loot_board() -> Array:
	var wk := week_index()
	var st: int = (wk * 2654435761) & 0xFFFFFFFF
	var rows: Array = []
	for n in BOARD_NAMES:
		I18n.keep(n)
		st = (st * 1664525 + 1013904223) & 0xFFFFFFFF
		var r := float(st) / 4294967296.0
		rows.append({"name": n, "v": int(round((3000 + pow(r, 2.2) * 42000) / 10.0)) * 10})
	var mine: int = int(o.lootRec.get("wbest", 0)) if int(o.lootRec.get("wk", -1)) == wk else 0
	rows.append({"name": display_name(), "v": mine, "me": true})
	rows.sort_custom(func(a, b): return int(a.v) > int(b.v))
	return rows
