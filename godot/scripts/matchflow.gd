# 涂鸦机兵 Godot 电脑版 —— 开局流程：匹配对手 → 准备确认 → （排位）禁用 / 选人 → 载入 → 对局开始前的观察阶段
# 匹配 5~35 秒；准备阶段偶尔有人不点准备（挂机的 AI 更容易），这时重新匹配
# 排位赛照网页版 1.9 的 MLBB 式选人：钻石起先禁用（双方各 2 个），再按 1-2-2-2-1 轮流选；选的时候中间放 3D 模型
class_name MatchFlow
extends Control

const READY_TIME := 15.0
const DRT := {"ban": 12.0, "pick": 15.0, "me": 20.0}

var game
var D: Dictionary
var P: Profile
var phase := ""            # search / ready / draft / load / observe
var kind := ""             # normal / ranked / loot
var mode := ""
var map_idx := -1
var t := 0.0
var wait := 0.0
var requeue := 0
var players: Array = []    # {name, team, me, persona, pilot, mech, looks, lv, plv, bt, tier, ready, ready_at, never}
var lay: Array = []
var ui: Control
var dyn := {}
var bans := {"pilots": [], "mechs": []}
var dr := {}               # 选人状态
var stage_vp: SubViewport
var stage_turn: Node3D
var stage_key := ""

func _init(g) -> void:
	game = g; D = g.data
	set_anchors_preset(Control.PRESET_FULL_RECT)
	theme = g.theme_ui
	visible = false
	mouse_filter = Control.MOUSE_FILTER_STOP

# ---------------- 小工具 ----------------
func L(s: String, size := 16, c := Color("#f2eefc"), outline := 0) -> Label: return UIKit.label(s, size, c, outline)
func box(v: bool, sep := 8) -> BoxContainer:
	var b: BoxContainer = VBoxContainer.new() if v else HBoxContainer.new()
	b.add_theme_constant_override("separation", sep); b.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return b
func at(c: Control, pos: Vector2, sz := Vector2.ZERO) -> Control:
	ui.add_child(c); c.position = pos
	if sz != Vector2.ZERO: c.size = sz; c.custom_minimum_size = sz
	return c
func vs() -> Vector2: return get_viewport_rect().size
func click(c: GCard, f: Callable) -> GCard:
	c.pressed.connect(func(): game.sfx.play("click"); f.call()); return c
func pilot_name(id: String) -> String: return str(D.pilots[id].name) if D.pilots.has(id) else "?"
func mech_name(id: String) -> String: return str(D.mechs[id].short if D.mechs[id].has("short") else D.mechs[id].name) if D.mechs.has(id) else "?"
func face_path(pilot: String, looks: Dictionary, is_me: bool) -> String:
	if is_me: return "res://art/faces/%s.png" % P.art_id(pilot)
	var K = P.skin(str(looks.get("pskin", "")))
	if K != null and str(K.get("pilot", "")) == pilot and ResourceLoader.exists("res://art/faces/%s.png" % K.id): return "res://art/faces/%s.png" % K.id
	return "res://art/faces/%s.png" % pilot
func team_color(team: int) -> Color: return game.team_col[team] if team < game.team_col.size() else Color.WHITE
func fresh_ui() -> void:
	if ui != null: ui.queue_free()
	ui = Control.new(); ui.set_anchors_preset(Control.PRESET_FULL_RECT); ui.mouse_filter = Control.MOUSE_FILTER_IGNORE; add_child(ui)
	dyn = {}

func background(alpha := 1.0) -> void:
	var bg := ColorRect.new(); bg.set_anchors_preset(Control.PRESET_FULL_RECT); bg.color = Color(0.05, 0.03, 0.12, alpha); bg.mouse_filter = Control.MOUSE_FILTER_IGNORE; ui.add_child(bg)
	var st := Stripes.new(); st.set_anchors_preset(Control.PRESET_FULL_RECT); st.modulate.a = alpha; ui.add_child(st)

func avatar_of(p: Dictionary, size: float) -> UIKit.Avatar:
	if p.get("me", false): return UIKit.avatar(P.avatar_path(), P.frame_key(), size, team_color(int(p.team)))
	return UIKit.avatar(P.looks_avatar(p.looks, str(p.pilot) if str(p.pilot) != "" else str(p.get("face", "blaze"))), P.looks_frame(p.looks), size, team_color(int(p.team)))

# ================= 1. 匹配 =================
func begin(k: String) -> void:
	P = game.profile
	kind = k; requeue = 0
	mode = P.ranked_mode() if k == "ranked" else ("loot" if k == "loot" else str(P.o.mode))
	map_idx = -1 if k != "normal" else int(P.o.map)
	visible = true
	game.lobby.close_popup()
	enter_search()

func enter_search() -> void:
	phase = "search"; t = 0.0
	var tier := P.rank_tier(int(P.o.rank.rp)) if kind == "ranked" else 0
	wait = randf_range(3.0, 12.0) if requeue > 0 else randf_range(5.0, 35.0) * (1.0 + tier * 0.03 if kind == "ranked" else 1.0)
	wait = clampf(wait, 3.0, 35.0)
	if OS.get_environment("GB_WAIT") != "": wait = float(OS.get_environment("GB_WAIT"))   # 测试用
	lay = Sim.layout_for(mode, int(D.modes[mode].get("teams", 2)))
	fresh_ui(); background()
	var s := vs()
	var rr := minf(340.0, s.y * 0.46)
	var rd := Radar.new(); rd.size = Vector2(rr, rr); rd.position = Vector2(s.x / 2 - rr / 2, s.y * 0.06); ui.add_child(rd); dyn.radar = rd
	var av := UIKit.avatar(P.avatar_path(), P.frame_key(), 110); at(av, Vector2(s.x / 2 - 55, s.y * 0.06 + rr / 2 - 55))
	var y0 := s.y * 0.06 + rr + 14
	var tl := L("重新匹配中（优先队列）" if requeue > 0 else "正在匹配对手", 34, Color("#ffe14d"), 8); tl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	at(tl, Vector2(0, y0), Vector2(s.x, 44))
	var tm := L("00:00", 30, Color.WHITE, 6); tm.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER; at(tm, Vector2(0, y0 + 46), Vector2(s.x, 38)); dyn.timer = tm
	var est := int(ceil((wait + randf_range(-4, 6)) / 5.0) * 5)
	var info := L("%s  •  %s  •  预计等待 %d 秒" % ["排位赛" if kind == "ranked" else ("搜刮撤离" if kind == "loot" else "匹配赛"), D.modes[mode].name, max(5, est)], 17, Color("#c8c4e8"))
	info.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER; at(info, Vector2(0, y0 + 88), Vector2(s.x, 26))
	var fl := L("", 15, Color("#7af0ff")); fl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER; at(fl, Vector2(0, y0 + 116), Vector2(s.x, 24)); dyn.found = fl
	var cb := UIKit.flat_button("取消匹配", 18); cb.size = Vector2(200, 50); cb.custom_minimum_size = cb.size; at(cb, Vector2(s.x / 2 - 100, s.y - 100)); click(cb, func(): cancel("已取消匹配"))
	var tips := ["小提示：在己方涂料上切换滚轮形态（Shift）会跑得更快", "小提示：超载（R）打出伤害就会充能，可以多次使用", "小提示：草丛里的敌人只有走近才看得见", "小提示：机体被打爆后驾驶员会弹出来，用随身武器还能继续打",
		"小提示：主定位克制对方时伤害 +6%，选人时留意克制关系", "小提示：大招按 E 或鼠标右键"]
	var tp := L(tips.pick_random(), 15, Color("#8f8ab8")); tp.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER; at(tp, Vector2(0, s.y - 38), Vector2(s.x, 24))
	game.sfx.play("go")

func cancel(msg: String) -> void:
	phase = ""; visible = false
	if ui != null: ui.queue_free(); ui = null
	game.lobby.toast(msg); game.lobby.refresh()

func _process(delta: float) -> void:
	if not visible or phase == "": return
	t += delta
	match phase:
		"search": tick_search()
		"ready": tick_ready()
		"draft": tick_draft()
		"load": tick_load()
		"observe": tick_observe()
	if stage_turn != null and is_instance_valid(stage_turn): stage_turn.rotation.y += delta * 0.6

func _input(ev: InputEvent) -> void:   # 手柄 A：准备 / 锁定；B：取消匹配
	if not visible or not (ev is InputEventJoypadButton) or not ev.pressed: return
	if ev.button_index == JOY_BUTTON_A:
		if phase == "ready" and not players[0].ready: players[0].ready = true; game.sfx.play("lock"); dyn.btn.get_child(0).text = I18n.t("已准备"); dyn.btn.dim = true
		elif phase == "draft" and not dr.done and dr.turns[dr.cur].who.me and dr.turns[dr.cur].t == "pick":
			var a2 := dr_avail(true)
			if dr.sel.pilot in a2.ps and dr.sel.mech in a2.ms: dr_commit(dr.turns[dr.cur], {"pilot": dr.sel.pilot, "mech": dr.sel.mech})
	elif ev.button_index == JOY_BUTTON_B and phase == "search": cancel("已取消匹配")

func tick_search() -> void:
	dyn.timer.text = "%02d:%02d" % [int(t) / 60, int(t) % 60]
	var n := lay.size()
	var found := clampi(int(floor(t / wait * n)), 1, n)
	dyn.found.text = I18n.t("已找到 %d / %d 名玩家" % [found, n])
	dyn.radar.blips = found
	if t >= wait:
		build_roster()
		enter_ready()

func build_roster() -> void:
	var tier := P.rank_tier(int(P.o.rank.rp)) if kind == "ranked" else -1
	var plv := int(P.power(str(P.o.pilot)).lv)
	var pers := Bots.assign(lay.slice(1), tier, {1: 1}, plv)
	var nicks := Bots.nicks(lay.size() - 1)
	var pool_p: Array = D.pilotOrder.duplicate(); pool_p.erase(str(P.o.pilot)); pool_p.shuffle()
	var pool_m: Array = D.order.duplicate(); pool_m.shuffle()
	var acc_lv := P.level()
	players = [{"name": P.display_name(), "team": int(lay[0]), "me": true, "persona": "", "pilot": str(P.o.pilot), "mech": str(P.o.weapon),
		"looks": P.my_looks(), "lv": acc_lv, "plv": plv, "bt": int(P.power(str(P.o.pilot)).bt), "tier": max(0, tier), "ready": false, "ready_at": 0.0, "never": false}]
	var bot_lv: int = int(P.rank_bot_power().lv) if kind == "ranked" else plv
	var friends: Array = game.net.room.players.filter(func(q): return int(q.peer) != 1) if game.net.role == "host" else []
	for i in range(1, lay.size()):
		if i - 1 < friends.size() and int(lay[i]) == int(lay[0]):   # 房间里的好友：当我的队友（组队）
			var fq: Dictionary = friends[i - 1]
			players.append({"name": I18n.keep(str(fq.name)), "team": int(lay[i]), "me": false, "friend": true, "persona": "", "pilot": str(fq.pilot) if kind != "ranked" else "", "face": str(fq.pilot), "mech": str(fq.weapon) if kind != "ranked" else "",
				"want": {"pilot": str(fq.pilot), "mech": str(fq.weapon)}, "looks": {}, "lv": acc_lv, "plv": int(fq.get("power", {}).get("lv", 1)), "bt": int(fq.get("power", {}).get("bt", 0)),
				"tier": max(0, tier), "ready": false, "ready_at": randf_range(0.4, 1.2), "never": false})
			continue
		var pid: String = pers[i - 1]
		var Pz := Bots.persona(pid)
		var lv: int = clampi(bot_lv + int(Pz.lv), 1, 11)
		var pilot: String = pool_p[(i - 1) % pool_p.size()]
		var quick: bool = pid in ["skilled", "god", "expert"]
		players.append({"name": nicks[i - 1], "team": int(lay[i]), "me": false, "persona": pid, "pilot": pilot if kind != "ranked" else "", "face": pilot, "mech": pool_m[(i - 1) % pool_m.size()] if kind != "ranked" else "",
			"looks": Bots.looks(pilot, pid, tier if tier >= 0 else 2), "lv": clampi(acc_lv + randi_range(-6, 8) + int(Pz.lv) * 3, 1, 60), "plv": lv, "bt": 2 if lv >= 9 else (1 if lv >= 5 else 0),
			"tier": clampi(tier + randi_range(-1, 1), 0, D.econ.rank.tiers.size() - 1) if tier >= 0 else 0,
			"ready": false, "ready_at": randf_range(0.5, 3.0) if quick else randf_range(0.8, 9.0), "never": pid == "noob" and randf() < 0.12})
	for i in players.size(): players[i].idx = i
	# 小概率有人一直不点准备（多半是对手）
	for i in players.size(): players[i].idx = i
	if OS.get_environment("GB_NOSHOW") != "":   # 测试用：我准备了，但有一个对手一直不点
		players[0].ready = true
		for p in players: p.never = false; p.ready_at = minf(float(p.ready_at), 1.5)
		players[players.size() - 1].never = true
		return
	if OS.get_environment("GB_AUTOREADY") != "":   # 测试用：我自动准备、所有人都会准备
		players[0].ready = true
		for p in players: p.never = false; p.ready_at = minf(float(p.ready_at), 1.5)
		return
	if randf() < 0.16 and players.size() > 1:
		var foes: Array = range(1, players.size()).filter(func(i): return int(players[i].team) != int(players[0].team))
		var pick_i: int = foes.pick_random() if not foes.is_empty() and randf() < 0.7 else randi_range(1, players.size() - 1)
		if not players[pick_i].get("friend", false): players[pick_i].never = true

# ================= 2. 准备确认 =================
func enter_ready() -> void:
	phase = "ready"; t = 0.0
	fresh_ui(); background()
	game.sfx.play("win")
	var s := vs()
	var title := L("对局已找到！", 40, Color("#ffe14d"), 10); title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER; at(title, Vector2(0, 26), Vector2(s.x, 52))
	var sub := L("%s  •  %s  •  %s" % ["排位赛" if kind == "ranked" else ("搜刮撤离" if kind == "loot" else "匹配赛"), D.modes[mode].name, "随机地图" if map_idx < 0 else str(D.maps[map_idx].name)], 18, Color("#c8c4e8"))
	sub.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER; at(sub, Vector2(0, 80), Vector2(s.x, 26))
	dyn.cards = {}
	var my_team := int(players[0].team)
	var mine: Array = players.filter(func(p): return int(p.team) == my_team)
	var others: Array = players.filter(func(p): return int(p.team) != my_team)
	var big := others.size() <= 4
	var colw := s.x * 0.36
	_ready_col(mine, Vector2(s.x * 0.06, 130), colw, "我方" if D.modes[mode].get("teams", 2) <= 2 or mode == "loot" else "我的队伍", true)
	if not others.is_empty(): _ready_col(others, Vector2(s.x * 0.58, 130), colw, "对手" if int(D.modes[mode].get("teams", 2)) == 2 else "其他玩家", big)
	var ring := CountRing.new(); ring.size = Vector2(110, 110); ring.position = Vector2(s.x / 2 - 55, s.y / 2 - 90); ring.total = READY_TIME; ui.add_child(ring); dyn.ring = ring
	var cnt := L("", 16, Color("#c8c4e8")); cnt.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER; at(cnt, Vector2(s.x / 2 - 120, s.y / 2 + 30), Vector2(240, 24)); dyn.cnt = cnt
	var msg := L("", 18, Color("#ff9a8a"), 4); msg.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER; at(msg, Vector2(0, s.y - 150), Vector2(s.x, 28)); dyn.msg = msg
	var b := UIKit.gold_button("准备", 30); b.size = Vector2(260, 70); b.custom_minimum_size = b.size; at(b, Vector2(s.x / 2 - 130, s.y - 110)); dyn.btn = b
	click(b, func():
		if players[0].ready or phase != "ready": return
		players[0].ready = true; game.sfx.play("lock")
		b.get_child(0).text = I18n.t("已准备"); b.dim = true; b.queue_redraw())

func _ready_col(list: Array, pos: Vector2, w: float, head: String, big: bool) -> void:
	var v := box(true, 6 if big else 4); at(v, pos, Vector2(w, 0))
	v.add_child(L(head, 20, Color("#7af0ff"), 4))
	if big:
		for p in list: v.add_child(_pcard(p, w, 64))
	else:
		var g := GridContainer.new(); g.columns = 2; g.add_theme_constant_override("h_separation", 6); g.add_theme_constant_override("v_separation", 4); v.add_child(g)
		for p in list: g.add_child(_pcard(p, w / 2 - 4, 40))

func _pcard(p: Dictionary, w: float, h: float) -> GCard:
	var c := UIKit.card(Color("#2e2760") if not p.me else Color("#5a2a8a"), Color("#16122e"), Color("#4b4396") if not p.me else Color("#ff9ad6"), 12)
	c.custom_minimum_size = Vector2(w, h); c.pad = Vector4(8, 4, 10, 4)
	var hb := box(false, 10); c.add_child(hb)
	hb.add_child(avatar_of(p, h - 8))
	var v := box(true, 1); v.size_flags_horizontal = Control.SIZE_EXPAND_FILL; hb.add_child(v)
	var nh := box(false, 6); v.add_child(nh)
	nh.add_child(L(str(p.name), 17 if h > 50 else 14, Color.WHITE if not p.me else Color("#ffe14d")))
	if h > 50:
		nh.add_child(UIKit.chip("Lv.%d" % int(p.lv), Color("#7af0ff"), 12))
		if kind == "ranked": nh.add_child(UIKit.chip(str(D.econ.rank.tiers[int(p.tier)].name), Color("#ffcf4d"), 12))
	var st := L("等待中…", 13 if h > 50 else 11, Color("#8f8ab8")); v.add_child(st)
	dyn.cards[int(p.idx)] = {"card": c, "st": st}
	return c

func tick_ready() -> void:
	var left := READY_TIME - t
	dyn.ring.left = left
	var n_ready := 0
	for p in players:
		if not p.me and not p.ready and not p.never and t >= float(p.ready_at): p.ready = true; game.sfx.play("pickup", -10)
		if p.ready: n_ready += 1
		var cd: Dictionary = dyn.cards.get(int(p.get("idx", -1)), {})
		if cd.is_empty(): continue
		if p.ready and not cd.get("done", false):
			cd.done = true; cd.st.text = I18n.t("已准备"); cd.st.add_theme_color_override("font_color", Color("#6dff8a"))
			cd.card.border = Color("#6dff8a"); cd.card.queue_redraw()
	dyn.cnt.text = I18n.t("已准备 %d / %d" % [n_ready, players.size()])
	if dyn.has("fail_t"):
		if t >= float(dyn.fail_t):
			if not players[0].ready: cancel("你没有点准备，已退出匹配")
			else: requeue += 1; enter_search()
		return
	if n_ready == players.size():
		dyn.fail_t = t + 0.9
		dyn.msg.add_theme_color_override("font_color", Color("#6dff8a")); dyn.msg.text = I18n.t("所有人都准备好了！")
		dyn.fail_t = t + 0.9
		_after_ready.call_deferred()
		return
	if left <= 0:
		var miss := players.filter(func(p): return not p.ready).size()
		dyn.msg.text = I18n.t("你没有点准备" if not players[0].ready else "有 %d 名玩家没有准备，正在为你重新匹配…" % miss)
		dyn.fail_t = t + 2.2

func _after_ready() -> void:
	await get_tree().create_timer(0.9).timeout
	if phase != "ready": return
	if kind == "ranked": enter_draft()
	else: enter_load()

# ================= 3. 排位选人 =================
func enter_draft() -> void:
	phase = "draft"; t = 0.0
	var ti := P.rank_tier(int(P.o.rank.rp))
	var my_team := int(players[0].team)
	var A: Array = players.filter(func(p): return int(p.team) == my_team)
	var B: Array = players.filter(func(p): return int(p.team) != my_team)
	A.shuffle()   # 我第几个选是随机的
	for p in A + B:
		var r := randf(); var afk := 0.05 if ti >= 5 else 0.1
		p.beh = "afk" if r < afk and not p.me else ("hesitate" if r < afk + 0.2 else ("normal" if r < afk + 0.5 else "quick"))
		if not p.me: p.pilot = ""; p.mech = ""
		p.pick = null; p.hover = null; p.sys = false
	players[0].pilot = ""; players[0].mech = ""
	var turns: Array = []
	if ti >= int(D.econ.rank.banFrom):
		var me_i := A.find(players[0]); var ally_i := 0 if me_i != 0 else 1
		turns.append_array([{"t": "ban", "side": "A", "slot": me_i}, {"t": "ban", "side": "B", "slot": 0}, {"t": "ban", "side": "A", "slot": ally_i}, {"t": "ban", "side": "B", "slot": 1}])
	var ci := {"A": 0, "B": 0}
	for sd in ["A", "B", "B", "A", "A", "B", "B", "A"]:
		turns.append({"t": "pick", "side": sd, "slot": ci[sd]}); ci[sd] += 1
	bans = {"pilots": [], "mechs": []}
	dr = {"ti": ti, "A": A, "B": B, "turns": turns, "cur": -1, "ban_list": [], "sel": {"pilot": "", "mech": "", "ban_k": "", "ban_id": ""}, "done": false, "tab": "pilot", "t0": 0.0}
	build_draft_ui()
	dr_next()

func dr_team(side: String) -> Array: return dr.A if side == "A" else dr.B
func dr_taken() -> Dictionary:
	var tk := {"p": {}, "m": {}}
	for x in dr.A + dr.B:
		if x.pick != null: tk.p[x.pick.pilot] = true; tk.m[x.pick.mech] = true
	return tk
func dr_banned(k: String, id: String) -> bool: return id in (bans.pilots if k == "pilot" else bans.mechs)
func dr_avail(owned: bool) -> Dictionary:
	var tk := dr_taken()
	var ps: Array = D.pilotOrder.filter(func(id): return not tk.p.has(id) and not dr_banned("pilot", id) and (not owned or P.has_pilot(id)))
	var ms: Array = D.order.filter(func(id): return not tk.m.has(id) and not dr_banned("mech", id) and (not owned or P.has_mech(id)))
	return {"ps": ps, "ms": ms}
func meta(k: String, id: String) -> float: return float(D.meta.get("pilots" if k == "pilot" else "mechs", {}).get(id, 0.5))

func dr_ai_pick(x: Dictionary) -> Dictionary:
	var me: Dictionary = players[0]
	var av := dr_avail(false)
	if x.get("friend", false) and x.want.pilot in av.ps and x.want.mech in av.ms: return x.want   # 好友：选自己出战的驾驶员和机体
	var ps: Array = av.ps; var ms: Array = av.ms
	if me.pick == null:   # 给玩家至少留一个能用的
		var mine := dr_avail(true)
		if mine.ps.size() <= 1 and ps.size() > mine.ps.size(): ps = ps.filter(func(id): return not id in mine.ps)
		if mine.ms.size() <= 1 and ms.size() > mine.ms.size(): ms = ms.filter(func(id): return not id in mine.ms)
	var tot := 0.0
	for id in ps: tot += 0.5 + meta("pilot", id) * (int(dr.ti) / 9.0)
	var r := randf() * tot; var pilot: String = ps[0]
	for id in ps:
		r -= 0.5 + meta("pilot", id) * (int(dr.ti) / 9.0)
		if r <= 0: pilot = id; break
	var fav := str(D.pilots[pilot].weapon)
	var mech: String = fav if fav in ms and randf() < 0.6 else ms.pick_random()
	return {"pilot": pilot, "mech": mech}

# AI 禁用（照 economy.js 的 draftBans）：对手禁你的王牌驾驶员和你拥有的强势机体；队友替你禁克制你机体的
func dr_ai_ban(side: String) -> Dictionary:
	var safe := func(k: String, id: String) -> bool:
		if dr_banned(k, id): return false
		var own: Array = P.o.pilots.keys() if k == "pilot" else P.o.mechs
		return not (id in own and own.filter(func(x): return not dr_banned(k, x) and x != id).size() < 1)
	if side == "B":
		var n_enemy := (dr.ban_list as Array).filter(func(b): return b.side == "enemy").size()
		if n_enemy == 0:
			var ace: Array = P.o.pilots.keys().filter(func(id): return safe.call("pilot", id))
			ace.sort_custom(func(a, b): return int(P.o.pilots[a].lv) + int(P.o.pilots[a].bt) * 2 + meta("pilot", a) * 4 > int(P.o.pilots[b].lv) + int(P.o.pilots[b].bt) * 2 + meta("pilot", b) * 4)
			if not ace.is_empty(): return {"k": "pilot", "id": ace[0], "why": "ace"}
		var mine: Array = P.o.mechs.filter(func(id): return safe.call("mech", id))
		mine.sort_custom(func(a, b): return meta("mech", a) > meta("mech", b))
		if not mine.is_empty() and meta("mech", mine[0]) >= 0.5: return {"k": "mech", "id": mine[0], "why": "yours"}
	else:
		var my_mech: String = str(P.o.weapon)
		for id in D.get("banCounters", {}).get(my_mech, []):
			if safe.call("mech", id): return {"k": "mech", "id": id, "why": "counter", "vs": my_mech}
	var pool: Array = D.pilotOrder.filter(func(id): return safe.call("pilot", id))
	pool.sort_custom(func(a, b): return meta("pilot", a) > meta("pilot", b))
	return {"k": "pilot", "id": pool[0] if not pool.is_empty() else D.pilotOrder[0], "why": "meta"}

func dr_next() -> void:
	dr.cur += 1
	if dr.cur >= dr.turns.size():
		dr.done = true; dr.done_t = t; game.sfx.play("super"); refresh_draft(); return
	var T: Dictionary = dr.turns[dr.cur]
	var who: Dictionary = dr_team(T.side)[T.slot]
	T.who = who; dr.t0 = t
	T.dur = DRT.me if who.me else (DRT.ban if T.t == "ban" else DRT.pick)
	var act := INF
	if not who.me:
		match str(who.beh):
			"afk": act = INF
			"quick": act = randf_range(0.7, 2.3)
			"normal": act = randf_range(2.5, 6.0)
			_: act = randf_range(6.5, 11.0)
		if who.get("friend", false): act = 0.8
		if T.t == "ban": act = minf(act, randf_range(2.5, 5.5))
		if OS.get_environment("GB_FASTAI") != "": act = 0.4   # 测试用
	T.act = act
	T.hovers = []
	if not who.me and who.beh == "hesitate" and T.t == "pick":
		for s in [1.5, 3.2, 5.0]: T.hovers.append({"at": s, "p": dr_ai_pick(who), "shown": false})
	dr.sel = {"pilot": "", "mech": "", "ban_k": "", "ban_id": ""}
	if who.me and T.t == "pick":
		var av := dr_avail(true)
		dr.sel.pilot = str(P.o.pilot) if str(P.o.pilot) in av.ps else (av.ps[0] if not av.ps.is_empty() else "")
		dr.sel.mech = str(P.o.weapon) if str(P.o.weapon) in av.ms else (av.ms[0] if not av.ms.is_empty() else "")
		dr.tab = "pilot"; game.sfx.play("go")
	if who.me and T.t == "ban": dr.tab = "pilot"; game.sfx.play("go")
	refresh_draft()

func dr_commit(T: Dictionary, val, sys := false) -> void:
	var who: Dictionary = T.who
	if T.t == "ban":
		if val != null and str(val.get("id", "")) != "":
			(bans.pilots if val.k == "pilot" else bans.mechs).append(val.id)
			dr.ban_list.append({"side": ("me" if who.me else "ally") if T.side == "A" else "enemy", "k": val.k, "id": val.id, "why": val.get("why", "mine" if who.me else "meta"), "sys": sys})
		game.sfx.play("click")
	else:
		who.pick = val; who.sys = sys; who.hover = null; who.pilot = val.pilot; who.mech = val.mech
		game.sfx.play("lock")
	dr_next()

func tick_draft() -> void:
	if dr.done:
		if t - float(dr.done_t) > 2.0: enter_load()
		return
	var T: Dictionary = dr.turns[dr.cur]; var who: Dictionary = T.who
	var el := t - float(dr.t0)
	for h in T.hovers:
		if not h.shown and el >= float(h.at): h.shown = true; who.hover = h.p; refresh_draft(false)
	if who.me and OS.get_environment("GB_AUTODRAFT") != "" and el >= float(OS.get_environment("GB_AUTODRAFT")):   # 测试用
		if T.t == "ban": dr_commit(T, dr_ai_ban("B"))
		else: dr_commit(T, {"pilot": dr.sel.pilot, "mech": dr.sel.mech})
		return
	if not who.me and el >= float(T.act):
		var v
		if T.t == "ban": v = dr_ai_ban(T.side)
		else:
			var av := dr_avail(false)
			v = who.hover if who.hover != null and randf() < 0.5 and who.hover.pilot in av.ps and who.hover.mech in av.ms else dr_ai_pick(who)
		dr_commit(T, v); return
	if el >= float(T.dur):   # 时间到：系统帮选
		if T.t == "ban":
			if who.me: dr_commit(T, {"k": dr.sel.ban_k, "id": dr.sel.ban_id} if str(dr.sel.ban_id) != "" else null, true)
			else: dr_commit(T, dr_ai_ban(T.side), true)
		elif who.me:
			var av := dr_avail(true); var all := dr_avail(false)
			var pilot: String = dr.sel.pilot if dr.sel.pilot in av.ps else (av.ps[0] if not av.ps.is_empty() else all.ps[0])
			var mech: String = dr.sel.mech if dr.sel.mech in av.ms else (av.ms[0] if not av.ms.is_empty() else all.ms[0])
			dr_commit(T, {"pilot": pilot, "mech": mech}, true)
		else: dr_commit(T, dr_ai_pick(who), true)
		return
	var left := int(ceil(T.dur - el))
	dyn.clock.text = str(left)
	dyn.clock.add_theme_color_override("font_color", Color("#ff6b5a") if left <= 5 else Color("#ffe14d"))

func build_draft_ui() -> void:
	fresh_ui(); background()
	var s := vs()
	# 中间的 3D 展台
	var svc := SubViewportContainer.new(); svc.stretch = true; svc.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var sh := s.y * 0.42
	at(svc, Vector2(s.x * 0.27, 150), Vector2(s.x * 0.46, sh))
	stage_vp = SubViewport.new(); stage_vp.own_world_3d = true; stage_vp.transparent_bg = true; stage_vp.msaa_3d = Viewport.MSAA_4X; svc.add_child(stage_vp)
	var cam := Camera3D.new(); cam.position = Vector3(0, 2.6, 9.6); cam.rotation_degrees = Vector3(-12, 0, 0); cam.fov = 36; stage_vp.add_child(cam)
	var sun := DirectionalLight3D.new(); sun.rotation_degrees = Vector3(-40, 30, 0); sun.light_energy = 1.3; stage_vp.add_child(sun)
	var env := WorldEnvironment.new(); env.environment = Environment.new(); env.environment.background_mode = Environment.BG_CLEAR_COLOR
	env.environment.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR; env.environment.ambient_light_color = Color("#8a80c0"); env.environment.ambient_light_energy = 0.8; stage_vp.add_child(env)
	var disc := MeshInstance3D.new(); disc.mesh = Models.mesh("cyl", 2.6, 0.2); disc.material_override = Models.toon(Color("#2a2550"), 0.1, 0.6); disc.position.y = -0.1; stage_vp.add_child(disc)
	stage_turn = Node3D.new(); stage_vp.add_child(stage_turn)
	stage_key = ""
	var sl := L("", 22, Color.WHITE, 6); sl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER; at(sl, Vector2(s.x * 0.27, 150 + sh - 50), Vector2(s.x * 0.46, 30)); dyn.stage_lbl = sl
	var sl2 := L("", 14, Color("#c8c4e8")); sl2.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER; at(sl2, Vector2(s.x * 0.27, 150 + sh - 22), Vector2(s.x * 0.46, 22)); dyn.stage_lbl2 = sl2
	var ph := L("", 26, Color("#ffe14d"), 6); ph.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER; at(ph, Vector2(s.x * 0.3, 10), Vector2(s.x * 0.4, 32)); dyn.phase = ph
	var ck := L("", 40, Color("#ffe14d"), 8); ck.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER; at(ck, Vector2(s.x / 2 - 40, 38), Vector2(80, 44)); dyn.clock = ck
	var tt := L("", 16, Color("#c8c4e8")); tt.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER; at(tt, Vector2(s.x * 0.3, 80), Vector2(s.x * 0.4, 22)); dyn.turn = tt
	var md := L("%s • %s" % [D.modes[mode].name, D.econ.rank.tiers[int(dr.ti)].name], 14, Color("#8f8ab8")); md.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER; at(md, Vector2(s.x * 0.3, 102), Vector2(s.x * 0.4, 20))
	var colA := box(true, 6); at(colA, Vector2(14, 60), Vector2(s.x * 0.24, 0)); dyn.colA = colA
	var colB := box(true, 6); at(colB, Vector2(s.x * 0.76 - 14, 60), Vector2(s.x * 0.24, 0)); dyn.colB = colB
	var bl := box(false, 6); bl.alignment = BoxContainer.ALIGNMENT_CENTER; at(bl, Vector2(s.x * 0.3, 122), Vector2(s.x * 0.4, 30)); dyn.bans = bl
	var low := Control.new(); low.mouse_filter = Control.MOUSE_FILTER_IGNORE; at(low, Vector2(0, 154 + sh), Vector2(s.x, s.y - 154 - sh)); dyn.low = low

func refresh_draft(full := true) -> void:
	var s := vs()
	var T = null if dr.done else dr.turns[dr.cur]
	dyn.phase.text = "准备开战" if dr.done else ("禁用阶段" if T.t == "ban" else "选人阶段")
	if dr.done: dyn.clock.text = "OK"
	var turn_txt := "选人完成，准备开战！"
	if not dr.done:
		if T.who.me: turn_txt = "轮到你禁用" if T.t == "ban" else "轮到你选择"
		else: turn_txt = ("队友" if T.side == "A" else "对手") + ("正在禁用…" if T.t == "ban" else "正在选择…")
	dyn.turn.text = I18n.t(turn_txt)
	for side in ["A", "B"]:
		var col: BoxContainer = dyn.colA if side == "A" else dyn.colB
		for c in col.get_children(): col.remove_child(c); c.queue_free()
		col.add_child(L("我方" if side == "A" else "对方", 18, Color("#7af0ff") if side == "A" else Color("#ff8a8a"), 4))
		var team: Array = dr_team(side)
		for i in team.size(): col.add_child(_draft_card(team[i], side, i, T, s.x * 0.24))
	for c in dyn.bans.get_children(): dyn.bans.remove_child(c); c.queue_free()
	if dr.ban_list.is_empty():
		dyn.bans.add_child(L("还没有禁用" if dr.turns.any(func(x): return x.t == "ban") else "%s还没有禁用阶段" % D.econ.rank.tiers[int(dr.ti)].name, 13, Color("#8f8ab8")))
	else:
		dyn.bans.add_child(L("禁用：", 13, Color("#ff8a8a")))
		for b in dr.ban_list:
			var bc := UIKit.card(Color("#5a1a2a") if b.side == "enemy" else Color("#1a3a5a"), Color("#1a0a12"), Color("#ff6b5a") if b.side == "enemy" else Color("#7af0ff"), 8)
			bc.pad = Vector4(3, 2, 6, 2)
			var bh := box(false, 3); bc.add_child(bh)
			bh.add_child(UIKit.image("res://art/faces/%s.png" % b.id, Vector2(28, 28), true) if b.k == "pilot" else game.thumbs.rect(b.id, 28))
			bh.add_child(L(pilot_name(b.id) if b.k == "pilot" else mech_name(b.id), 12, Color.WHITE))
			dyn.bans.add_child(bc)
	update_stage(T)
	if full: build_picker(T)

func _draft_card(x: Dictionary, side: String, i: int, T, w: float) -> GCard:
	var active: bool = T != null and T.side == side and T.slot == i
	var shown = x.pick
	if shown == null and active and x.me and str(dr.sel.pilot) != "": shown = {"pilot": dr.sel.pilot, "mech": dr.sel.mech}
	if shown == null and x.hover != null and side == "A": shown = x.hover
	var c := UIKit.card(Color("#3a2a80") if active else Color("#241e4a"), Color("#120e26"), Color("#ffe14d") if active else (Color("#ff9ad6") if x.me else Color("#4b4396")), 12)
	c.custom_minimum_size = Vector2(w, 74); c.pad = Vector4(6, 4, 8, 4); c.selected = active
	var hb := box(false, 8); c.add_child(hb)
	if shown != null: hb.add_child(UIKit.avatar(face_path(shown.pilot, x.looks, x.me), P.frame_key() if x.me else P.looks_frame(x.looks), 60, team_color(1 if side == "A" else 2)))
	else: hb.add_child(avatar_of(x, 60))
	var v := box(true, 1); v.size_flags_horizontal = Control.SIZE_EXPAND_FILL; hb.add_child(v)
	v.add_child(L(str(x.name), 15, Color("#ffe14d") if x.me else Color.WHITE))
	v.add_child(L("%s • %s" % [pilot_name(shown.pilot), mech_name(shown.mech)] if shown != null else ("你" if x.me else ""), 13, Color("#c8c4e8")))
	var st := ""
	if x.pick != null: st = "系统选择" if x.sys else "已锁定"
	elif active: st = "轮到你选择" if x.me and T.t == "pick" else ("轮到你禁用" if x.me else ("犹豫中…" if x.hover != null else ("禁用中…" if T.t == "ban" else "选择中…")))
	if st != "": v.add_child(L(st, 12, Color("#6dff8a") if x.pick != null else Color("#ffcf4d")))
	return c

# 中间 3D：轮到我时放我正在看的；别人选的时候放队友的犹豫 / 刚锁定的
func update_stage(T) -> void:
	var pilot := ""; var mech := ""; var who_name := ""; var is_me := false; var looks := {}
	if T != null and T.t == "pick":
		var who: Dictionary = T.who
		if who.me: pilot = dr.sel.pilot; mech = dr.sel.mech; is_me = true
		elif who.hover != null and T.side == "A": pilot = who.hover.pilot; mech = who.hover.mech; looks = who.looks
		who_name = str(who.name)
	if pilot == "":
		for x in (dr.A + dr.B):
			if x.pick != null: pilot = x.pick.pilot; mech = x.pick.mech; who_name = str(x.name); is_me = x.me; looks = x.looks
		if T != null and T.t == "ban" and T.who.me and str(dr.sel.ban_id) != "":
			if dr.sel.ban_k == "pilot": pilot = dr.sel.ban_id; mech = str(D.pilots[pilot].weapon)
			else: mech = dr.sel.ban_id; pilot = pilot if pilot != "" else "blaze"
			who_name = "准备禁用"
	if pilot == "" or mech == "": pilot = str(P.o.pilot) if str(P.o.pilot) != "" else "blaze"; mech = str(P.o.weapon); who_name = ""
	var key := pilot + "|" + mech + "|" + str(is_me)
	dyn.stage_lbl.text = I18n.t("%s  •  %s" % [pilot_name(pilot), str(D.mechs[mech].name)])
	var C: Dictionary = D.counters.get(mech, {"beats": [], "weak": []})
	var role: String = game.role_name(mech)
	dyn.stage_lbl2.text = I18n.t((who_name + "  •  " if who_name != "" else "") + role + ("  •  克制 %s" % "、".join(C.beats.slice(0, 2).map(func(m): return mech_name(m.id))) if not C.beats.is_empty() else ""))
	if key == stage_key: return
	stage_key = key
	for c in stage_turn.get_children(): c.queue_free()
	var tc := team_color(1)
	var look: Dictionary = P.pilot_look(pilot) if is_me and P.has_pilot(pilot) else P.look_with(pilot, str(looks.get("pskin", "")))
	var n := Models.build_mech(mech, D.mechs[mech], tc, look, P.mech_paint() if is_me else P.paint_of(str(looks.get("paint", ""))))
	n.root.scale = Vector3.ONE * 1.45; n.root.position = Vector3(0.7, 0, 0); n.root.rotation_degrees.y = -35; stage_turn.add_child(n.root)
	var pl := Models.build_pilot(look, tc); pl.scale = Vector3.ONE * 1.7; pl.position = Vector3(-2.2, 0, 0.9); pl.rotation_degrees.y = -60; stage_turn.add_child(pl)
	var pop := stage_turn.create_tween(); stage_turn.scale = Vector3.ONE * 0.6
	pop.tween_property(stage_turn, "scale", Vector3.ONE, 0.25).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)

func build_picker(T) -> void:
	var low: Control = dyn.low
	for c in low.get_children(): low.remove_child(c); c.queue_free()
	if T == null or not T.who.me:
		var wt := L("等待其他玩家……" if T != null else "选人完成！马上进入战斗", 20, Color("#c8c4e8")); wt.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		low.add_child(wt); wt.position = Vector2(0, 40); wt.size = Vector2(low.size.x, 30)
		return
	var is_ban: bool = T.t == "ban"
	var w := low.size.x
	var tabs := box(false, 8); low.add_child(tabs); tabs.position = Vector2(w * 0.06, 6)
	for tb in [["pilot", "驾驶员"], ["mech", "机体"]]:
		var on: bool = dr.tab == tb[0]
		var c := UIKit.card(Color("#ff6ad5") if on else Color("#2e2760"), Color("#a63cff") if on else Color("#17132f"), Color("#ffc4ef") if on else Color("#4b4396"), 12, true)
		c.pad = Vector4(16, 4, 16, 4); c.add_child(L(tb[1], 16, Color.WHITE, 3)); tabs.add_child(c)
		click(c, func(): dr.tab = tb[0]; build_picker(dr.turns[dr.cur]))
	var hint := _hint(is_ban)
	if hint != "": var hl := L(hint, 14, Color("#ffcf4d")); tabs.add_child(hl)
	var sc := ScrollContainer.new(); sc.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED; low.add_child(sc); sc.position = Vector2(w * 0.06, 44); sc.size = Vector2(w * 0.7, low.size.y - 54)
	var g := GridContainer.new(); g.columns = 11; g.add_theme_constant_override("h_separation", 6); g.add_theme_constant_override("v_separation", 6); sc.add_child(g)
	var av := dr_avail(not is_ban); var tk := dr_taken()
	var ids: Array = D.pilotOrder if dr.tab == "pilot" else D.order
	for id in ids:
		var is_p: bool = dr.tab == "pilot"
		var ok: bool = (id in av.ps) if is_p else (id in av.ms)
		var cur: bool = (dr.sel.pilot == id if is_p else dr.sel.mech == id) if not is_ban else dr.sel.ban_id == id
		var c := UIKit.card(Color("#3a2a80") if cur else Color("#241e4a"), Color("#120e26"), Color("#ffe14d") if cur else Color("#4b4396"), 10, ok)
		c.pad = Vector4(3, 3, 3, 3); c.dim = not ok; c.selected = cur
		var v := box(true, 0); c.add_child(v)
		v.add_child(UIKit.image("res://art/faces/%s.png" % (P.art_id(id) if is_p and P.has_pilot(id) else id), Vector2(62, 62), true) if is_p else game.thumbs.rect(id, 62))
		var nm := L(pilot_name(id) if is_p else mech_name(id), 11, Color.WHITE); nm.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER; nm.custom_minimum_size.x = 62; v.add_child(nm)
		if not ok:
			var why := "已禁用" if dr_banned(dr.tab, id) else ("已被选" if (tk.p.has(id) if is_p else tk.m.has(id)) else "未拥有")
			var wl := L(why, 10, Color("#ff8a8a")); wl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER; v.add_child(wl)
		if ok:
			click(c, func():
				if is_ban: dr.sel.ban_k = dr.tab; dr.sel.ban_id = id
				elif is_p: dr.sel.pilot = id
				else: dr.sel.mech = id
				refresh_draft())
		g.add_child(c)
	var lock := UIKit.gold_button("禁用" if is_ban else "锁定", 28); low.add_child(lock); lock.position = Vector2(w * 0.8, 50); lock.size = Vector2(w * 0.15, 72); lock.custom_minimum_size = lock.size
	click(lock, func():
		if dr.done or dr.turns[dr.cur] != T: return
		if is_ban:
			if str(dr.sel.ban_id) == "": game.lobby.toast("先选一个要禁用的驾驶员或机体"); return
			dr_commit(T, {"k": dr.sel.ban_k, "id": dr.sel.ban_id, "why": "mine"})
		else:
			var a2 := dr_avail(true)
			if not dr.sel.pilot in a2.ps or not dr.sel.mech in a2.ms: game.lobby.toast("驾驶员和机体都要选"); return
			dr_commit(T, {"pilot": dr.sel.pilot, "mech": dr.sel.mech}))
	if not is_ban:
		var cur_l := L("当前：%s + %s" % [pilot_name(dr.sel.pilot), mech_name(dr.sel.mech)], 15, Color.WHITE); low.add_child(cur_l); cur_l.position = Vector2(w * 0.78, 130)

# 克制提示（2.2）
func _hint(is_ban: bool) -> String:
	var foes: Array = dr.B.filter(func(x): return x.pick != null).map(func(x): return x.pick)
	if is_ban:
		var th: Array = D.counters.get(str(P.o.weapon), {}).get("weak", []).filter(func(m): return not dr_banned("mech", m.id)).slice(0, 2)
		return ("克制你的「%s」：%s" % [mech_name(str(P.o.weapon)), "、".join(th.map(func(m): return mech_name(m.id)))]) if not th.is_empty() else ""
	var out: Array = []
	for kk in [["mech", dr.sel.mech], ["pilot", dr.sel.pilot]]:
		if str(kk[1]) == "": continue
		var C: Dictionary = D.counters.get(kk[1], {"beats": [], "weak": []})
		var good: Array = C.beats.filter(func(m): return foes.any(func(f): return f[kk[0]] == m.id))
		var bad: Array = C.weak.filter(func(m): return foes.any(func(f): return f[kk[0]] == m.id))
		var nm := func(id): return mech_name(id) if kk[0] == "mech" else pilot_name(id)
		if not good.is_empty(): out.append("克制对手的 " + "、".join(good.map(func(m): return nm.call(m.id))))
		if not bad.is_empty(): out.append("小心：对手的 " + "、".join(bad.map(func(m): return nm.call(m.id))) + " 克制你")
	return "   ".join(out)

# ================= 4. 载入（双方阵容 VS）=================
func enter_load() -> void:
	phase = "load"; t = 0.0
	stage_turn = null
	if map_idx < 0 and mode != "loot":
		map_idx = randi() % D.maps.size()
		for i in D.maps.size():
			if (mode.begins_with("escape") and D.maps[i].name == "废墟逃亡区") or (mode == "park" and D.maps[i].park): map_idx = i
	if kind != "ranked":   # 普通赛：机体 / 驾驶员就是匹配时定好的
		pass
	fresh_ui(); background()
	var s := vs()
	var my_team := int(players[0].team)
	var mine: Array = players.filter(func(p): return int(p.team) == my_team)
	var others: Array = players.filter(func(p): return int(p.team) != my_team)
	var vsl := L("VS", 90, Color("#ffe14d"), 14); vsl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER; at(vsl, Vector2(s.x / 2 - 100, s.y / 2 - 90), Vector2(200, 110))
	var map_name: String = "灰城禁区" if mode == "loot" else str(D.maps[map_idx].name)
	var hd := L("%s  •  %s" % [D.modes[mode].name, map_name], 26, Color.WHITE, 6); hd.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER; at(hd, Vector2(0, 24), Vector2(s.x, 34))
	_vs_side(mine, Vector2(30, 90), s.x / 2 - 130, true)
	_vs_side(others, Vector2(s.x / 2 + 100, 90), s.x / 2 - 130, false)
	var bar := UIKit.bar(0, s.x * 0.5, 14, Color("#7af0ff")); at(bar, Vector2(s.x * 0.25, s.y - 60)); dyn.bar = bar
	var ll := L("正在载入地图……", 15, Color("#c8c4e8")); ll.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER; at(ll, Vector2(0, s.y - 90), Vector2(s.x, 22))
	game.sfx.play("boom", -6)

func _vs_side(list: Array, pos: Vector2, w: float, left: bool) -> void:
	var n := list.size()
	if n == 0: return
	var big := n <= 4
	var g := GridContainer.new(); g.columns = 1 if big else 3; g.add_theme_constant_override("v_separation", 8); g.add_theme_constant_override("h_separation", 6); at(g, pos, Vector2(w, 0))
	for i in n:
		var p: Dictionary = list[i]
		var c := UIKit.card(team_color(int(p.team)).darkened(0.45), Color("#120e26"), team_color(int(p.team)), 14)
		c.custom_minimum_size = Vector2(w if big else w / 3 - 6, 96 if big else 46); c.pad = Vector4(10, 4, 10, 4); c.skew = -0.08 if left else 0.08
		var hb := box(false, 10); c.add_child(hb)
		var pid: String = str(p.pilot) if str(p.pilot) != "" else str(p.get("face", "blaze"))
		if big: hb.add_child(UIKit.image(face_path(pid, p.looks, p.me), Vector2(84, 84), true))
		var v := box(true, 1); hb.add_child(v)
		v.add_child(L(str(p.name), 18 if big else 13, Color("#ffe14d") if p.me else Color.WHITE, 4))
		if big:
			v.add_child(L("%s  •  %s" % [pilot_name(pid), str(D.mechs[str(p.mech)].name) if D.mechs.has(str(p.mech)) else ""], 14, Color("#e6e2fa")))
			var sk = P.skin(str(p.looks.get("pskin", "")))
			if sk != null and D.rare[int(sk.rare)] != null: v.add_child(L("%s • %s" % [sk.name, D.rare[int(sk.rare)].name], 12, Color(str(D.rare[int(sk.rare)].c))))
			var sp := Control.new(); sp.size_flags_horizontal = Control.SIZE_EXPAND_FILL; sp.mouse_filter = Control.MOUSE_FILTER_IGNORE; hb.add_child(sp)
			if D.mechs.has(str(p.mech)): hb.add_child(game.thumbs.rect(str(p.mech), 84))
		g.add_child(c)
		c.modulate.a = 0.0; c.position.x += -40 if left else 40
		var tw := c.create_tween(); tw.tween_interval(0.08 * i); tw.tween_property(c, "modulate:a", 1.0, 0.25)

func tick_load() -> void:
	dyn.bar.k = clampf(t / 2.6, 0, 1); dyn.bar.queue_redraw()
	if t >= 2.8: launch()

func launch() -> void:
	phase = "observe"; t = 0.0
	var me: Dictionary = players[0]
	var pilot: String = str(me.pilot) if str(me.pilot) != "" else str(P.o.pilot)
	var mech: String = str(me.mech) if str(me.mech) != "" else str(P.o.weapon)
	# team_layout 顺序：players[0] 是我；同一队的人放在一起（和 lay 一致）
	var ordered: Array = [me]
	var rest: Array = players.slice(1)
	if kind == "ranked":
		rest = dr.A.filter(func(x): return not x.me) + dr.B
	rest.sort_custom(func(a, b): return a.get("friend", false) and not b.get("friend", false))   # 房间里的好友排在最前面，和开局时的真人位置对上
	var used := {}
	for i in range(1, lay.size()):
		for p in rest:
			if not used.has(p) and int(p.team) == int(lay[i]): used[p] = true; ordered.append(p); break
	var prep_players: Array = []
	for p in ordered:
		prep_players.append({"name": p.name, "pilot": p.pilot if str(p.pilot) != "" else p.get("face", "blaze"), "mech": p.mech if str(p.mech) != "" else D.order.pick_random(), "persona": p.persona, "looks": p.looks, "lv": p.plv, "bt": p.bt})
	fresh_ui()
	game.launch_prepared(kind, mode, map_idx, pilot, mech, {"players": prep_players}, bans)
	build_observe()

# ================= 5. 观察阶段（对局开始前的倒数）=================
func build_observe() -> void:
	if game.sim == null: phase = ""; visible = false; return
	fresh_ui()
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	var s := vs()
	var sim: Sim = game.sim
	var my_team: int = game.me.team
	var list: Array = sim.players.filter(func(q): return not q.npc and not q.spirit)
	var mine: Array = list.filter(func(q): return q.team == my_team)
	var foes: Array = list.filter(func(q): return q.team != my_team)
	var hd := L(("排位赛" if kind == "ranked" else "观察阶段"), 16, Color("#c8c4e8"), 4); hd.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER; at(hd, Vector2(0, 104), Vector2(s.x, 22))
	var hd2 := L(str(D.modes[sim.mode].name), 30, Color("#ffe14d"), 8); hd2.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER; at(hd2, Vector2(0, 126), Vector2(s.x, 38))
	_obs_side(mine, Vector2(12, 100), true)
	_obs_side(foes, Vector2(s.x - 292, 110), false)
	if not bans.pilots.is_empty() or not bans.mechs.is_empty():
		var bl := box(false, 6); at(bl, Vector2(s.x / 2 - 200, s.y - 70), Vector2(400, 40))
		bl.add_child(L("本局禁用", 14, Color("#ff8a8a")))
		for b in bans.pilots: bl.add_child(UIKit.image("res://art/faces/%s.png" % b, Vector2(34, 34), true))
		for b in bans.mechs: bl.add_child(L(mech_name(b), 13, Color.WHITE))
	ui.modulate.a = 0.0
	var tw := ui.create_tween(); tw.tween_property(ui, "modulate:a", 1.0, 0.3)

func _obs_side(list: Array, pos: Vector2, left: bool) -> void:
	var n := list.size()
	var v := box(true, 4 if n <= 4 else 2); at(v, pos, Vector2(280, 0))
	for q in list:
		var big := n <= 4
		var c := UIKit.card(team_color(q.team).darkened(0.5), Color(0.05, 0.03, 0.12, 0.85), team_color(q.team), 12)
		c.custom_minimum_size = Vector2(280, 64 if big else 30); c.pad = Vector4(6, 3, 8, 3)
		var hb := box(false, 8); c.add_child(hb)
		if big:
			var av: UIKit.Avatar = UIKit.avatar(P.avatar_path(), P.frame_key(), 56, team_color(q.team)) if q == game.me else UIKit.avatar(P.looks_avatar(q.looks, q.pilot), P.looks_frame(q.looks), 56, team_color(q.team))
			hb.add_child(av)
		var tv := box(true, 0); hb.add_child(tv)
		tv.add_child(L(q.name, 15 if big else 12, Color("#ffe14d") if q == game.me else Color.WHITE))
		if big: tv.add_child(L("%s • %s  Lv.%d" % [pilot_name(q.pilot), mech_name(q.weapon), q.lv], 12, Color("#c8c4e8")))
		v.add_child(c)

func tick_observe() -> void:
	if game.sim == null or game.state != "play" or game.sim.countdown <= 0.6:
		phase = ""
		var tw := ui.create_tween(); tw.tween_property(ui, "modulate:a", 0.0, 0.3)
		tw.tween_callback(func(): visible = false; mouse_filter = Control.MOUSE_FILTER_STOP)

# ================= 画面元件 =================
class Stripes extends Control:   # 背景的斜条纹 + 漂浮的涂料点
	var tt := 0.0
	func _ready() -> void: mouse_filter = Control.MOUSE_FILTER_IGNORE
	func _process(d: float) -> void: tt += d; queue_redraw()
	func _draw() -> void:
		var w := size.x; var h := size.y
		for i in range(-6, 30):
			var x := i * 90.0 + fmod(tt * 30.0, 90.0)
			draw_colored_polygon(PackedVector2Array([Vector2(x, 0), Vector2(x + 40, 0), Vector2(x + 40 - h * 0.4, h), Vector2(x - h * 0.4, h)]), Color(1, 1, 1, 0.025))
		var cols := [Color("#ff3ea5"), Color("#1fd6ee"), Color("#ffe600"), Color("#9cff2e"), Color("#ff8a1f")]
		for i in 14:
			var px := fmod(i * 173.0 + tt * (8 + i), w); var py := fmod(i * 97.0 + sin(tt * 0.5 + i) * 30.0 + 60, h)
			draw_circle(Vector2(px, py), 6 + (i % 4) * 5, Color(cols[i % 5], 0.12))

class Radar extends Control:
	var tt := 0.0
	var blips := 1
	var pts: Array = []
	func _ready() -> void:
		mouse_filter = Control.MOUSE_FILTER_IGNORE
		for i in 18: pts.append(Vector2.from_angle(randf() * TAU) * randf_range(0.35, 0.95))
	func _process(d: float) -> void: tt += d; queue_redraw()
	func _draw() -> void:
		var c := size / 2; var r := minf(size.x, size.y) / 2
		draw_circle(c, r, Color(0.1, 0.08, 0.25, 0.6))
		for k in [0.33, 0.66, 1.0]: draw_arc(c, r * k, 0, TAU, 64, Color("#7af0ff", 0.35), 2.0)
		var a := tt * 2.2
		for i in 24:
			var a0 := a - i * 0.03
			draw_line(c, c + Vector2.from_angle(a0) * r, Color("#7af0ff", 0.4 * (1.0 - i / 24.0)), 3.0)
		for i in mini(blips, pts.size()):
			var p: Vector2 = c + pts[i] * r
			var k := 0.6 + 0.4 * sin(tt * 4 + i)
			draw_circle(p, 7, Color("#ff3ea5", k)); draw_arc(p, 11, 0, TAU, 16, Color("#ff9ad6", 0.5 * k), 2.0)

class CountRing extends Control:
	var total := 15.0
	var left := 15.0
	func _ready() -> void: mouse_filter = Control.MOUSE_FILTER_IGNORE
	func _process(_d: float) -> void: queue_redraw()
	func _draw() -> void:
		var c := size / 2; var r := minf(size.x, size.y) / 2 - 6
		draw_circle(c, r + 4, Color(0.05, 0.03, 0.12, 0.9))
		draw_arc(c, r, 0, TAU, 64, Color(1, 1, 1, 0.12), 8.0)
		var k := clampf(left / total, 0, 1)
		draw_arc(c, r, -PI / 2, -PI / 2 + TAU * k, 64, Color("#ffe14d") if left > 5 else Color("#ff6b5a"), 8.0)
		var f := get_theme_default_font()
		var s := str(int(ceil(maxf(0, left))))
		draw_string(f, c + Vector2(-60, 16), s, HORIZONTAL_ALIGNMENT_CENTER, 120, 44, Color.WHITE)
