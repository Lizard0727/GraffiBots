# 涂鸦机兵 Godot 版 —— 大厅（照原版布局重做）：
# 左上个人卡 / 奖杯 / 货币，左边菜单卡片，中间驾驶员立绘 + 3D 机体展台，下面名字横幅和技能标签，
# 右边每日任务、模式卡、金色「对战！」按钮；驾驶员 / 机体 / 宝箱 / 天赋 / 任务是盖在上面的子页面
class_name Lobby
extends Control

const BR_COL := {"atk": "#ff4d3d", "def": "#4fb8ff", "paint": "#ffc531", "sup": "#9cff2e"}
const TIER_COL := ["#ffe14d", "#c9ccd4", "#4fb8ff", "#ffc531"]
const MODE_ICON := {"escape4": "escape", "escape8": "escape"}

var game
var P: Profile
var D: Dictionary
var sub := ""            # 当前子页面（"" = 大厅主页）
var view_pilot := ""
var view_mech := ""
var root: Control
var popup: Control
var toast_box: GCard
var toast_lbl: Label
var toast_t := 0.0
var vs := Vector2(1280, 720)

func _init(g) -> void:
	game = g; P = g.profile; D = g.data
	set_anchors_preset(Control.PRESET_FULL_RECT)
	theme = g.theme_ui
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	view_pilot = P.o.pilot; view_mech = P.o.weapon

func _process(delta: float) -> void:
	toast_t -= delta
	if toast_box != null: toast_box.modulate.a = clampf(toast_t * 2, 0, 1)

func toast(s: String) -> void:
	if toast_box == null:
		toast_box = UIKit.card(Color("#3a2a70"), Color("#221a48"), Color("#ffe14d"), 18); toast_box.shadow = 4
		toast_lbl = UIKit.label("", 19, Color("#ffe14d")); toast_box.add_child(toast_lbl)
		add_child(toast_box)
	toast_lbl.text = s
	toast_box.reset_size()
	toast_box.position = Vector2((vs.x - toast_box.size.x) / 2, vs.y - 150)
	move_child(toast_box, get_child_count() - 1)
	toast_t = 2.4

# ---------------- 小工具 ----------------
func clear(n: Node) -> void:
	for c in n.get_children(): n.remove_child(c); c.queue_free()

func at(c: Control, pos: Vector2, size := Vector2.ZERO, parent: Control = null) -> Control:
	(parent if parent != null else root).add_child(c)
	c.position = pos
	if size != Vector2.ZERO: c.custom_minimum_size = size; c.size = size
	return c

func vbox(sep := 6) -> VBoxContainer:
	var v := VBoxContainer.new(); v.add_theme_constant_override("separation", sep); v.mouse_filter = Control.MOUSE_FILTER_IGNORE; return v

func hbox(sep := 8) -> HBoxContainer:
	var h := HBoxContainer.new(); h.add_theme_constant_override("separation", sep); h.mouse_filter = Control.MOUSE_FILTER_IGNORE; return h

func L(s: String, size := 16, c := Color("#f2eefc"), outline := 0) -> Label:
	return UIKit.label(s, size, c, outline)

func role_name(id: String) -> String: return game.role_name(id)

func face(pid: String, size: float, skinned := true) -> TextureRect:
	return UIKit.image("res://art/faces/%s.png" % (P.art_id(pid) if skinned and D.pilots.has(pid) else pid), Vector2(size, size), true)

func portrait_path(pid: String) -> String:
	return "res://art/portraits/%s.png" % (P.art_id(pid) if D.pilots.has(pid) else pid)

func click(c: GCard, f: Callable) -> GCard:
	c.pressed.connect(func(): game.sfx.play("click"); f.call())
	return c

func mode_icon(m: String) -> String: return MODE_ICON.get(m, m)

func badge(parent: Control, n: int, pos: Vector2) -> void:
	if n <= 0: return
	var b := UIKit.card(Color("#ff5aa8"), Color("#e0207a"), Color.WHITE, 12); b.pad = Vector4(7, 0, 7, 0); b.shadow = 2; b.gloss = false
	b.add_child(L(str(n), 14, Color.WHITE)); at(b, parent.position + pos)   # 放在 root 上（放进卡片里会被撑满）

func centered(l: Label) -> Label:
	l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER; return l

# ---------------- 整体刷新 ----------------
func refresh() -> void:
	vs = get_viewport_rect().size
	if root != null: remove_child(root); root.queue_free()
	root = Control.new(); root.set_anchors_preset(Control.PRESET_FULL_RECT); root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(root); move_child(root, 0)
	if sub == "": build_home()
	else: build_sub()
	build_top()
	if toast_box != null: move_child(toast_box, get_child_count() - 1)

func open_sub(s: String) -> void:
	sub = s
	if s == "pilots": view_pilot = P.o.pilot
	if s == "mechs": view_mech = P.o.weapon
	refresh()

# 两侧压暗的渐变：面板在 3D 场景上也清楚
func side_shade(alpha_l: float, alpha_r: float) -> void:
	var g := Gradient.new()
	g.set_color(0, Color(0.04, 0.03, 0.1, alpha_l)); g.set_color(1, Color(0.04, 0.03, 0.1, alpha_r))
	g.add_point(0.3, Color(0.04, 0.03, 0.1, alpha_l * 0.25)); g.add_point(0.62, Color(0.04, 0.03, 0.1, alpha_r * 0.15))
	var gt := GradientTexture2D.new(); gt.gradient = g; gt.width = 256; gt.height = 4
	var tr := TextureRect.new(); tr.texture = gt; tr.expand_mode = TextureRect.EXPAND_IGNORE_SIZE; tr.stretch_mode = TextureRect.STRETCH_SCALE
	tr.mouse_filter = Control.MOUSE_FILTER_IGNORE; at(tr, Vector2.ZERO, vs)

# ---------------- 顶栏 ----------------
func build_top() -> void:
	var lv := P.level()
	var xp0 := Profile.xp_for_level(lv); var xp1 := Profile.xp_for_level(lv + 1)
	var pc := UIKit.dark_card(true); at(pc, Vector2(16, 12), Vector2(236, 72))
	click(pc, func(): open_sub("profile"))
	var h := hbox(10); pc.add_child(h)
	h.add_child(UIKit.avatar(P.avatar_path(), P.frame_key(), 54, Color(str(D.pilots[P.o.pilot].accent)) if str(P.o.pilot) != "" else Color.WHITE))
	var v := vbox(3); h.add_child(v)
	var nh := hbox(6); v.add_child(nh)
	nh.add_child(L(P.display_name(), 17, Color.WHITE)); nh.add_child(UIKit.chip("Lv.%d" % lv, Color("#7af0ff"), 13))
	v.add_child(UIKit.bar(float(P.o.xp - xp0) / max(1, xp1 - xp0), 150, 9, Color("#7af0ff")))
	v.add_child(L("%d / %d XP" % [P.o.xp - xp0, xp1 - xp0], 12, Color("#9a96b8")))
	var tc := UIKit.dark_card(); at(tc, Vector2(262, 12), Vector2(176, 72))
	var th := hbox(8); tc.add_child(th); th.add_child(UIKit.icon("trophy", 42))
	var tv := vbox(2); th.add_child(tv)
	var tr: int = P.o.trophies
	tv.add_child(L(str(tr), 26, Color("#ffd23f"), 4))
	tv.add_child(UIKit.bar(float(tr % 50) / 50.0, 100, 8, Color("#ffb43d"))); tv.add_child(L("下一档 %d" % ((tr / 50 + 1) * 50), 11, Color("#9a96b8")))
	var cc := UIKit.dark_card(); cc.pad = Vector4(10, 8, 10, 8); at(cc, Vector2(448, 12))
	var ch := hbox(6); cc.add_child(ch)
	for k in ["coins", "gems", "parts", "crystals"]:
		ch.add_child(UIKit.pill(k, str(int(P.o[k])), Color(str(D.econ.cur[k].color))))
	var cl := P.claimables()
	var psc := UIKit.card(Color("#ff8a3d"), Color("#c0392b"), Color("#ffd0a0"), 16, true); psc.pad = Vector4(8, 6, 12, 6)
	var pch := hbox(8); psc.add_child(pch); pch.add_child(UIKit.icon("star", 36))
	var pcv := vbox(1); pch.add_child(pcv); pcv.add_child(L("通行证 Lv.%d" % P.pass_level(), 14, Color.WHITE, 4))
	pcv.add_child(UIKit.bar(float(int(P.o.pass.xp) % int(D.econ.pass.xpPer)) / float(D.econ.pass.xpPer), 84, 8, Color("#fff3a8")))
	at(psc, Vector2(cc.position.x + 342, 14)); click(psc, func(): open_sub("pass"))
	badge(psc, cl.pass, Vector2(124, -8))
	var bx := vs.x - 16
	for b in [["gear", func(): settings_popup(), 0], ["help", func(): help_popup(), 0], ["team", func(): open_sub("friends"), game.social.S().reqIn.size()], ["mail", func(): open_sub("mail"), cl.mail], ["event", func(): open_sub("events"), cl.events], ["book", func(): open_sub("quests"), cl.tasks]]:
		bx -= 53
		var rb := UIKit.card(Color("#3a3370"), Color("#1d1838"), Color("#6a60c0"), 24, true); rb.pad = Vector4(5, 5, 5, 5)
		rb.add_child(UIKit.icon(b[0], 34)); at(rb, Vector2(bx, 20), Vector2(48, 48)); click(rb, b[1])
		badge(rb, int(b[2]), Vector2(31, -6))

# ---------------- 大厅主页 ----------------
func build_home() -> void:
	side_shade(0.82, 0.78)
	var pid: String = P.o.pilot
	var Pd: Dictionary = D.pilots[pid] if pid != "" else D.pilots[D.pilotOrder[0]]
	var acc := Color(str(Pd.accent))
	var sp := UIKit.Splash.new(); sp.cols = [acc, Color("#ff3ea5"), Color("#1fd6ee"), Color("#ffe14d")]; sp.seed_v = pid.hash()
	at(sp, Vector2(240, 150), Vector2(400, vs.y - 200))
	if pid != "":
		var por := UIKit.image(portrait_path(pid), Vector2(440, 572))
		at(por, Vector2(220, vs.y - 600))
		por.modulate.a = 0.0
		var tw := create_tween(); tw.set_parallel(); tw.tween_property(por, "modulate:a", 1.0, 0.35); tw.tween_property(por, "position:x", 250.0, 0.35).set_ease(Tween.EASE_OUT)
	var logo := vbox(0); at(logo, Vector2(24, 92))
	var lt := L("涂鸦机兵", 46, Color("#ffe14d"), 12); lt.add_theme_color_override("font_outline_color", Color("#ff3ea5")); logo.add_child(lt)
	var lh := hbox(8); logo.add_child(lh)
	lh.add_child(L("GRAFFI•BOTS", 18, Color("#5ff0ff"), 5)); lh.add_child(UIKit.chip("Godot 版", Color("#ffd23f"), 12))
	var nchest := 0
	for k in P.o.chests: nchest += int(P.o.chests[k])
	var menu := [
		["pilots", "驾驶员", ("%s • Lv.%d" % [Pd.name, P.power(pid).lv]) if pid != "" else "还没有驾驶员", "face", 0],
		["mechs", "机体", str(D.mechs[P.o.weapon].name), "mech", 0],
		["shop", "皮肤商店", "今日特惠 • 限时角色", "gems", 0],
		["chests", "宝箱", "商店 • 兑换", "chest", nchest],
		["talents", "天赋", "已装上 %d / %d" % [P.o.tal.size(), int(D.econ.talentSlots)], "star", P.tp_free()]]
	for i in menu.size():
		var m: Array = menu[i]
		var c := UIKit.dark_card(true); at(c, Vector2(16, 190 + i * 68), Vector2(230, 60)); click(c, func(): open_sub(m[0]))
		var h := hbox(10); c.add_child(h)
		if m[3] == "face" and pid != "": h.add_child(face(pid, 42))
		elif m[3] == "chest": h.add_child(UIKit.image("res://art/chests/supply.png", Vector2(42, 42)))
		else: h.add_child(UIKit.icon(m[3], 42))
		var v := vbox(0); h.add_child(v)
		v.add_child(L(m[1], 21, Color.WHITE)); v.add_child(L(m[2], 13, Color("#a8a4c8")))
		badge(c, int(m[4]), Vector2(206, -8))
	if pid != "":
		var ban := UIKit.card(acc.lerp(Color("#ff3ea5"), 0.3), acc.darkened(0.5), Color.WHITE, 10); ban.skew = 0.18; ban.pad = Vector4(26, 4, 26, 6)
		var bh := hbox(12); ban.add_child(bh)
		bh.add_child(L(str(Pd.name), 34, Color.WHITE, 8))
		var bv := vbox(0); bh.add_child(bv)
		bv.add_child(L("「%s」%s" % [Pd.code, Pd.title], 15, Color.WHITE, 4)); bv.add_child(L("Lv.%d • %s" % [P.power(pid).lv, role_name(pid)], 13, Color("#fff3a8"), 4))
		at(ban, Vector2(360, vs.y - 124))
		var w: Dictionary = D.mechs[P.o.weapon]
		var chips := hbox(8); at(chips, Vector2(262, vs.y - 52))
		for kc in [["mech", str(w.name), str(w.desc)], ["super", "大招 • " + str(w.specialInfo.name), str(w.specialInfo.desc)], ["skill", "技能 • " + str(Pd.skillInfo.name), str(Pd.skillInfo.desc)],
				["passive", "被动 • " + str(Pd.passive.name), str(Pd.passive.desc)], ["star", "超载 • " + str(Pd.overload.name), str(Pd.overload.desc) + ("" if P.power(pid).bt >= 1 else "（突破 I 后解锁）")]]:
			var kcard := UIKit.card(Color("#251f48"), Color("#151129"), Color("#4b4396"), 14, true); kcard.pad = Vector4(6, 3, 12, 3); kcard.shadow = 3
			var kh := hbox(4); kcard.add_child(kh); kh.add_child(UIKit.icon(kc[0], 24)); kh.add_child(L(kc[1], 14, Color("#e6e2fa")))
			kcard.tooltip_text = kc[2]
			click(kcard, func(): toast(kc[1] + "：" + kc[2]))
			chips.add_child(kcard)
	var rx := vs.x - 316
	var lc := UIKit.card(Color("#ffcf4d"), Color("#c87a10"), Color("#fff0b0"), 16, true); at(lc, Vector2(rx, 100), Vector2(300, 66)); click(lc, func(): open_sub("loot"))
	var lh2 := hbox(10); lc.add_child(lh2); lh2.add_child(UIKit.icon("chest", 40))
	var lv2 := vbox(0); lh2.add_child(lv2); lv2.add_child(L("搜刮撤离 • 超大地图", 12, Color("#5a3a08"))); lv2.add_child(L("仓库价值 %d" % stash_value(), 19, Color("#3a1f05")))
	var tier := P.rank_tier(int(P.o.rank.rp)); var T: Dictionary = D.econ.rank.tiers[tier]
	var qc := UIKit.dark_card(true); at(qc, Vector2(rx, 176), Vector2(300, 76)); click(qc, func(): open_sub("ranked"))
	var qh := hbox(10); qc.add_child(qh); qh.add_child(UIKit.icon("trophy", 44))
	var qv := vbox(2); qh.add_child(qv)
	qv.add_child(L("排位赛 • %s" % D.econ.rank.season.name, 13, Color("#a8a4c8")))
	var trh := hbox(8); qv.add_child(trh); trh.add_child(L(str(T.name), 22, Color(str(T.color)), 4)); trh.add_child(L("%d 分" % int(P.o.rank.rp), 15, Color("#e6e2fa")))
	qv.add_child(L("当前模式：%s" % D.modes[P.ranked_mode()].name, 12, Color("#c9c5e6")))
	var mc := UIKit.card(Color("#ff6ad5"), Color("#a63cff"), Color("#ffc4ef"), 18, true); at(mc, Vector2(rx, 270), Vector2(300, 112)); click(mc, func(): mode_popup())
	var mh := hbox(10); mc.add_child(mh)
	var ic := UIKit.card(Color(1, 1, 1, 0.25), Color(1, 1, 1, 0.1), Color(1, 1, 1, 0.6), 30); ic.pad = Vector4(8, 8, 8, 8); ic.shadow = 0
	ic.add_child(UIKit.icon(mode_icon(P.o.mode), 52)); mh.add_child(ic)
	var mv := vbox(0); mh.add_child(mv)
	mv.add_child(L("对战模式 • 点击切换", 13, Color("#ffe6f6"), 3)); mv.add_child(L(str(D.modes[P.o.mode].name), 30, Color.WHITE, 6))
	mv.add_child(L(("随机地图" if int(P.o.map) < 0 else str(D.maps[int(P.o.map)].name)), 14, Color("#ffe6f6"), 3))
	var fb := UIKit.gold_button("", 10); at(fb, Vector2(rx, 400), Vector2(300, 124))
	clear(fb)
	var fv := vbox(0); fv.alignment = BoxContainer.ALIGNMENT_CENTER; fb.add_child(fv)
	fv.add_child(centered(L("对 战 !", 52, Color("#3a1f05"))))
	fv.add_child(centered(L("和 AI 驾驶员立即开打", 15, Color("#6a4510"))))
	click(fb, func(): game.sfx.play("go"); game.queue_match("normal"))
	var pulse := fb.create_tween().set_loops()   # 绑在按钮上：按钮被换掉时动画跟着停
	pulse.tween_method(func(a): fb.glow.a = a; fb.queue_redraw(), 0.35, 1.0, 0.8)
	pulse.tween_method(func(a): fb.glow.a = a; fb.queue_redraw(), 1.0, 0.35, 0.8)
	var lanb := UIKit.flat_button("局域网联机" + ("（%d 人）" % game.net.room.players.size() if game.net.role != "" else ""), 17); at(lanb, Vector2(rx, 534), Vector2(300, 44)); click(lanb, func(): open_sub("lan"))
	game.show_showroom(pid, P.o.weapon, true, -2.2)

func quests_done() -> int:
	P.refresh_quests()
	var n := 0; var dq := P.daily_quests(Profile.day_index())
	for i in dq.size():
		if int(P.o.q.dp[i]) >= int(dq[i][1]): n += 1
	return n

# ---------------- 子页面 ----------------
func build_sub() -> void:
	var see_3d := sub == "mechs"
	if see_3d: side_shade(0.94, 0.55)
	else:
		var bg := ColorRect.new(); bg.color = Color(0.05, 0.04, 0.11, 0.93); bg.mouse_filter = Control.MOUSE_FILTER_STOP; at(bg, Vector2.ZERO, vs)
		var sp := UIKit.Splash.new(); sp.cols = [Color("#ff3ea5"), Color("#1fd6ee"), Color("#ffe14d"), Color("#9cff2e")]; sp.seed_v = sub.hash(); sp.modulate.a = 0.6; at(sp, Vector2.ZERO, vs)
	var back := UIKit.flat_button("< 返回大厅", 17); at(back, Vector2(16, 96), Vector2(150, 44)); click(back, func(): sub = ""; refresh())
	var titles := {"pilots": "驾驶员", "mechs": "机体", "chests": "宝箱商店", "talents": "天赋树", "quests": "任务", "pass": "通行证 • " + str(D.econ.pass.season),
		"mail": "邮件", "events": "限时活动", "shop": "皮肤商店", "ranked": "排位赛 • " + str(D.econ.rank.season.name), "loot": "搜刮撤离", "lan": "局域网联机", "profile": "个人资料", "friends": "好友"}
	at(L(str(titles[sub]), 34, Color("#ffe14d"), 8), Vector2(182, 94))
	match sub:
		"pilots": page_pilots()
		"mechs": page_mechs()
		"chests": page_chests()
		"talents": page_talents()
		"quests": page_quests()
		"pass": page_pass()
		"mail": page_mail()
		"events": page_events()
		"shop": page_shop()
		"ranked": page_ranked()
		"loot": page_loot()
		"lan": page_lan()
		"profile": page_profile()
		"friends": page_friends()
	game.show_showroom(P.o.pilot, view_mech if see_3d else P.o.weapon, see_3d, -3.6)

func grid(ids: Array, w: float, cols: int, make: Callable) -> void:
	var sc := ScrollContainer.new(); sc.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	at(sc, Vector2(16, 152), Vector2(w, vs.y - 168))
	var g := GridContainer.new(); g.columns = cols; g.add_theme_constant_override("h_separation", 10); g.add_theme_constant_override("v_separation", 10)
	var m := MarginContainer.new()
	for side in ["top", "left", "right", "bottom"]: m.add_theme_constant_override("margin_" + side, 8)
	m.add_child(g); sc.add_child(m)
	for id in ids: g.add_child(make.call(id))

func page_pilots() -> void:
	var n := 0
	for id in D.pilotOrder:
		if P.has_pilot(id): n += 1
	at(L("已拥有 %d / %d" % [n, D.pilotOrder.size()], 16, Color("#a8a4c8")), Vector2(330, 108))
	grid(D.pilotOrder, 576, 4, func(id):
		var own := P.has_pilot(id)
		var Pd: Dictionary = D.pilots[id]
		var c := UIKit.card(Color(str(Pd.accent)).darkened(0.25), Color("#16122e"), Color(str(Pd.accent)).lightened(0.2), 14, true)
		c.selected = id == view_pilot; c.dim = not own; c.pad = Vector4(6, 6, 6, 6); c.custom_minimum_size = Vector2(128, 158)
		var v := vbox(2); c.add_child(v)
		v.add_child(face(id, 114))
		v.add_child(centered(L(str(Pd.name), 17, Color.WHITE, 4)))
		var st := "未拥有"
		if own: st = ("使用中 • " if id == P.o.pilot else "") + "Lv.%d" % P.o.pilots[id].lv
		v.add_child(centered(L(st, 13, Color("#fff3a8") if own else Color("#9a96b8"))))
		return click(c, func(): view_pilot = id; refresh()))
	pilot_detail(view_pilot if view_pilot != "" else str(D.pilotOrder[0]))

func pilot_detail(id: String) -> void:
	var Pd: Dictionary = D.pilots[id]; var own := P.has_pilot(id); var acc := Color(str(Pd.accent))
	var x0 := 608.0; var w := vs.x - x0 - 16
	var panel := UIKit.card(acc.darkened(0.55), Color("#120f26"), acc.darkened(0.1), 22); at(panel, Vector2(x0, 152), Vector2(w, vs.y - 168))
	var sp := UIKit.Splash.new(); sp.cols = [acc, acc.lightened(0.3)]; sp.seed_v = id.hash(); at(sp, Vector2(x0 + 4, 160), Vector2(300, vs.y - 190))
	var por := UIKit.image(portrait_path(id), Vector2(300, 390)); at(por, Vector2(x0 - 6, vs.y - 406))
	if not own: por.modulate = Color(0.4, 0.4, 0.5)
	var ix := x0 + 300; var iw := w - 310
	var info := vbox(6); at(info, Vector2(ix, 166))
	info.add_child(L("%s「%s」" % [Pd.name, Pd.code], 30, acc.lightened(0.3), 6))
	var rh := hbox(6); info.add_child(rh)
	rh.add_child(UIKit.chip(str(Pd.title), Color("#ffd23f"))); rh.add_child(UIKit.chip(role_name(id), acc.lightened(0.2)))
	info.add_child(counter_row(id, true, iw))
	var hx := UIKit.HexChart.new(); hx.vals = D.hex.pilot[id]; hx.axes = D.hex.axes.pilot; hx.grades = D.hex.grades; hx.col = acc.lightened(0.2); hx.font = game.font
	hx.custom_minimum_size = Vector2(iw, 190); info.add_child(hx)
	var sc := ScrollContainer.new(); sc.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED; sc.custom_minimum_size = Vector2(iw, vs.y - 610); info.add_child(sc)
	var kits := vbox(8); sc.add_child(kits)
	for k in [["skill", "技能 • " + str(Pd.skillInfo.name), str(Pd.skillInfo.desc)], ["passive", "被动 • " + str(Pd.passive.name), str(Pd.passive.desc)],
			["star", "超载 • " + str(Pd.overload.name), str(Pd.overload.desc)], ["pilot", "弹出武器 • " + str(Pd.sidearm.name), "机体被打爆后，驾驶员用它继续战斗"]]:
		var kh := hbox(8); kits.add_child(kh); kh.add_child(UIKit.icon(k[0], 34))
		var kv := vbox(0); kh.add_child(kv); kv.add_child(L(k[1], 16, Color.WHITE)); kv.add_child(UIKit.wrap(L(k[2], 13, Color("#c9c5e6")), iw - 50))
	var act_y := vs.y - 84
	if not own:
		var src: String = D.econ.locked.get(id, "")
		at(UIKit.wrap(L("未拥有 • " + ("通过%s获得（Godot 版还没移植）" % src if src != "" else "可以从宝箱里开出来"), 16, Color("#ff9a6b")), iw), Vector2(ix, act_y + 10))
		return
	var q: Dictionary = P.o.pilots[id]; var cap := P.lv_cap(q.bt)
	var lvh := hbox(8); at(lvh, Vector2(ix, act_y - 34))
	lvh.add_child(L("Lv.%d / %d" % [q.lv, cap], 18, Color("#7af0ff"))); lvh.add_child(UIKit.bar(float(q.lv) / int(D.econ.maxLv), 120, 10, Color("#7af0ff")))
	lvh.add_child(L("生命和伤害 +%d%%" % int(round((P.stat_mul(q.lv) - 1) * 100)), 14, Color("#a8a4c8")))
	if q.bt > 0: lvh.add_child(UIKit.chip(str(D.econ.breaks[q.bt].name), Color("#b78cff")))
	var bh := hbox(10); at(bh, Vector2(ix, act_y))
	if id != P.o.pilot:
		var sb := UIKit.pink_button("选用", 20); sb.custom_minimum_size = Vector2(110, 56); bh.add_child(sb)
		click(sb, func(): P.o.pilot = id; P.save(); toast("已选用 " + str(Pd.name)); refresh())
	else: bh.add_child(UIKit.chip("使用中", Color("#6dff8a"), 16))
	if q.lv < int(D.econ.maxLv) and q.lv < cap:
		var ub := UIKit.gold_button("", 10); ub.custom_minimum_size = Vector2(230, 56); clear(ub); bh.add_child(ub)
		var uh := hbox(6); uh.alignment = BoxContainer.ALIGNMENT_CENTER; ub.add_child(uh)
		uh.add_child(L("升级", 20, Color("#3a1f05"))); uh.add_child(UIKit.icon("coins", 24)); uh.add_child(L(str(int(D.econ.upCoins[q.lv])), 17, Color("#3a1f05")))
		uh.add_child(UIKit.icon("parts", 24)); uh.add_child(L(str(int(D.econ.upParts[q.lv])), 17, Color("#3a1f05")))
		click(ub, func(): act(P.upgrade(id), "升到 %d 级！" % (q.lv + 1)))
	elif q.bt + 1 < D.econ.breaks.size():
		var B: Dictionary = D.econ.breaks[q.bt + 1]
		var kb := UIKit.card(Color("#c69cff"), Color("#6a3cd6"), Color("#ecdcff"), 18, true); kb.custom_minimum_size = Vector2(250, 56); bh.add_child(kb)
		var kh2 := hbox(6); kh2.alignment = BoxContainer.ALIGNMENT_CENTER; kb.add_child(kh2)
		kh2.add_child(L(str(B.name), 19, Color.WHITE, 4)); kh2.add_child(UIKit.icon("crystals", 24)); kh2.add_child(L(str(int(B.crystals)), 16, Color.WHITE))
		kh2.add_child(UIKit.icon("coins", 24)); kh2.add_child(L(str(int(B.coins)), 16, Color.WHITE))
		kb.tooltip_text = str(B.desc)
		click(kb, func(): act(P.breakthrough(id), str(B.name) + " 完成：" + str(B.desc)))
	else: bh.add_child(UIKit.chip("已满级", Color("#ffd23f"), 16))

func page_mechs() -> void:
	at(L("已拥有 %d / %d" % [P.o.mechs.size(), D.order.size()], 16, Color("#a8a4c8")), Vector2(300, 108))
	grid(D.order, 520, 3, func(id):
		var own := P.has_mech(id); var w: Dictionary = D.mechs[id]
		var cls = D.classes.get(id)
		var rc := Color(str(D.roles[cls[0]].color)) if cls != null else Color("#7a70c8")
		var c := UIKit.card(rc.darkened(0.35), Color("#16122e"), rc, 14, true)
		c.selected = id == view_mech; c.dim = not own; c.custom_minimum_size = Vector2(156, 96); c.pad = Vector4(10, 8, 10, 8)
		var v := vbox(2); c.add_child(v)
		var th := hbox(6); v.add_child(th); th.add_child(UIKit.icon("mech", 30)); th.add_child(L(str(w.name), 16, Color.WHITE, 4))
		v.add_child(L(role_name(id), 12, rc.lightened(0.4)))
		v.add_child(L(("使用中" if id == P.o.weapon else "已拥有") if own else "未拥有", 12, Color("#6dff8a") if id == P.o.weapon else (Color("#c9c5e6") if own else Color("#9a96b8"))))
		return click(c, func(): view_mech = id; refresh()))
	var id: String = view_mech if view_mech != "" else str(D.order[0])
	var w: Dictionary = D.mechs[id]; var own := P.has_mech(id)
	var x0 := vs.x - 520.0
	var panel := UIKit.dark_card(); at(panel, Vector2(x0, vs.y - 300), Vector2(504, 284))
	var h := hbox(8); panel.add_child(h)
	var v := vbox(5); v.custom_minimum_size = Vector2(300, 0); h.add_child(v)
	v.add_child(L(str(w.name), 28, Color("#ffe14d"), 6)); v.add_child(UIKit.chip(role_name(id), Color("#7af0ff")))
	v.add_child(counter_row(id, false, 290))
	v.add_child(UIKit.wrap(L(str(w.desc), 13, Color("#e6e2fa")), 290))
	var sh := hbox(6); v.add_child(sh); sh.add_child(UIKit.icon("super", 26)); sh.add_child(UIKit.wrap(L("大招 • %s：%s" % [w.specialInfo.name, w.specialInfo.desc], 13, Color("#fff3a8")), 260))
	if w.trait != null:
		var trh := hbox(6); v.add_child(trh); trh.add_child(UIKit.icon("passive", 26)); trh.add_child(UIKit.wrap(L("特性 • %s：%s" % [w.trait.name, w.trait.desc], 13, Color("#c9c5e6")), 260))
	var rv := vbox(6); h.add_child(rv)
	var hx := UIKit.HexChart.new(); hx.vals = D.hex.mech[id]; hx.axes = D.hex.axes.mech; hx.grades = D.hex.grades; hx.font = game.font; hx.custom_minimum_size = Vector2(186, 176); rv.add_child(hx)
	if not own:
		var src: String = D.econ.locked.get(id, "")
		rv.add_child(UIKit.wrap(L("未拥有 • " + ("通过%s获得" % src if src != "" else "从宝箱开出"), 13, Color("#ff9a6b")), 180))
	elif id != P.o.weapon:
		var sb := UIKit.pink_button("选用", 20); sb.custom_minimum_size = Vector2(150, 50); rv.add_child(sb)
		click(sb, func(): P.o.weapon = id; P.save(); toast("已选用 " + str(w.name)); refresh())
	else: rv.add_child(UIKit.chip("使用中", Color("#6dff8a"), 16))

func page_chests() -> void:
	var y := 156.0
	if not P.o.chests.is_empty():
		var oh := hbox(12); at(oh, Vector2(24, y))
		oh.add_child(L("我的宝箱", 20, Color.WHITE))
		for cid in P.o.chests:
			var tcol := Color(TIER_COL[int(D.econ.chests[cid].tier)])
			var c := UIKit.card(tcol.darkened(0.3), Color("#16122e"), tcol, 16, true)
			var ch := hbox(6); c.add_child(ch); ch.add_child(UIKit.image("res://art/chests/%s.png" % cid, Vector2(44, 46)))
			ch.add_child(L("%s x%d  打开" % [D.econ.chests[cid].name, int(P.o.chests[cid])], 16, Color.WHITE, 4))
			click(c, func(): open_anim(cid, P.open_chest(cid))); oh.add_child(c)
		y += 72
	var cw := (vs.x - 48 - 3 * 14) / 4.0
	var ch_h := vs.y - y - 110
	for i in D.econ.chestOrder.size():
		var cid: String = D.econ.chestOrder[i]; var C: Dictionary = D.econ.chests[cid]
		var tc := Color(TIER_COL[int(C.tier)])
		var c := UIKit.card(tc.darkened(0.45), Color("#120f26"), tc.darkened(0.1), 20); at(c, Vector2(24 + i * (cw + 14), y), Vector2(cw, ch_h))
		var v := vbox(4); c.add_child(v)
		v.add_child(UIKit.image("res://art/chests/%s.png" % cid, Vector2(cw - 40, 140)))
		v.add_child(centered(L(str(C.name), 24, tc.lightened(0.2), 6)))
		v.add_child(centered(UIKit.wrap(L(str(C.desc), 13, Color("#a8a4c8")), cw - 30)))
		var odds := vbox(1); odds.size_flags_vertical = Control.SIZE_EXPAND_FILL; v.add_child(odds)
		for d in C.drops:
			var row := hbox(4); odds.add_child(row)
			var nm: String
			if d.k == "pilot": nm = "未拥有的驾驶员"; row.add_child(UIKit.icon("pilot", 18))
			elif d.k == "mech": nm = "未拥有的机体"; row.add_child(UIKit.icon("mech", 18))
			else: nm = "%d~%d" % [int(d.min), int(d.max)]; row.add_child(UIKit.icon(str(d.k), 18))
			row.add_child(L(nm, 13, Color("#e6e2fa")))
			var pl := L("%s%%" % str(snappedf(float(d.p) * 100, 0.1)), 13, tc); pl.size_flags_horizontal = Control.SIZE_EXPAND_FILL; pl.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT; row.add_child(pl)
		var buy := UIKit.gold_button("", 10); buy.custom_minimum_size = Vector2(0, 50); clear(buy); v.add_child(buy)
		var bh := hbox(6); bh.alignment = BoxContainer.ALIGNMENT_CENTER; buy.add_child(bh); bh.add_child(UIKit.icon("gems", 26)); bh.add_child(L(str(int(C.price)), 22, Color("#3a1f05")))
		click(buy, func(): open_anim(cid, P.buy_chest(cid)))
	var ex := hbox(12); at(ex, Vector2(24, vs.y - 84))
	ex.add_child(L("宝石兑换", 20, Color.WHITE))
	for k in D.econ.exchange:
		var X: Dictionary = D.econ.exchange[k]
		var give_k: String = X.give.keys()[0]
		var c2 := UIKit.dark_card(true); var h2 := hbox(6); c2.add_child(h2)
		h2.add_child(UIKit.icon(give_k, 28)); h2.add_child(L("%s +%d" % [P.cur_name(give_k), int(X.give[give_k])], 15, Color.WHITE)); h2.add_child(UIKit.icon("gems", 22)); h2.add_child(L(str(int(X.gems)), 15, Color("#ff7ad0")))
		click(c2, func(): act(P.exchange(k), "兑换成功")); ex.add_child(c2)

func page_talents() -> void:
	at(L("天赋点 %d / %d（账号每升 1 级 +1） • 已装上 %d / %d • 点亮的天赋再点一下可以装上 / 卸下" % [P.tp_free(), P.tp_total(), P.o.tal.size(), int(D.econ.talentSlots)], 15, Color("#c9c5e6")), Vector2(330, 110))
	var cw := (vs.x - 48 - 3 * 12) / 4.0
	var row_h := (vs.y - 226) / 6.0
	var bi := 0
	for B in D.econ.branches:
		var bc := Color(str(BR_COL.get(B.id, "#ffffff")))
		var x := 24 + bi * (cw + 12)
		var hd := UIKit.card(bc, bc.darkened(0.45), bc.lightened(0.4), 14); hd.skew = 0.12
		hd.add_child(centered(L(str(B.name), 22, Color.WHITE, 6)))
		at(hd, Vector2(x, 152), Vector2(cw, 46))
		var line := ColorRect.new(); line.color = Color(bc, 0.35); line.mouse_filter = Control.MOUSE_FILTER_IGNORE; at(line, Vector2(x + 26, 200), Vector2(4, vs.y - 230))
		var ti := 0
		for T in D.econ.talents:
			if T.br != B.id: continue
			var learned: bool = P.o.talents.has(T.id); var on: bool = P.o.tal.has(T.id)
			var can := false
			if not learned:
				can = int(T.tier) == 1
				for t2 in P.o.talents:
					var u = P.talent(t2)
					if u.br == T.br and int(u.tier) == int(T.tier) - 1: can = true
			var c: GCard
			if learned: c = UIKit.card(bc.darkened(0.15), bc.darkened(0.6), bc.lightened(0.3), 14, true)
			else: c = UIKit.card(Color("#272150"), Color("#15112c"), Color("#4b4396") if can else Color("#2e2858"), 14, true)
			c.selected = on; c.dim = not learned and not can; c.pad = Vector4(8, 5, 8, 5)
			var h := hbox(8); c.add_child(h)
			var tier := UIKit.card(Color.WHITE if learned else bc.darkened(0.3), Color("#d8d4f0") if learned else bc.darkened(0.6), bc, 14); tier.pad = Vector4(7, 0, 7, 0); tier.shadow = 0; tier.gloss = false
			tier.add_child(L(str(int(T.tier)), 15, bc.darkened(0.5) if learned else Color.WHITE)); h.add_child(tier)
			var v := vbox(0); h.add_child(v)
			var th := hbox(6); v.add_child(th); th.add_child(L(str(T.name), 16, Color.WHITE, 3)); th.add_child(L("%d 点" % int(T.cost), 12, Color("#fff3a8")))
			if on: th.add_child(UIKit.chip("已装上", Color("#ffe14d"), 11))
			v.add_child(UIKit.wrap(L(str(T.desc), 12, Color("#e6e2fa") if learned else Color("#a8a4c8")), cw - 70))
			at(c, Vector2(x, 210 + ti * row_h), Vector2(cw, row_h - 8))
			click(c, func(): act(P.toggle_talent(T.id) if learned else P.learn_talent(T.id), ("装上 / 卸下了 " if learned else "点亮了 ") + str(T.name)))
			ti += 1
		bi += 1

func page_quests() -> void:
	tabs(Vector2(330, 100), [["daily", "每日 / 每周"], ["lines", "任务线 / 叛将档案"]], quest_tab, func(k): quest_tab = k)
	if quest_tab == "lines": page_tasklines(); return
	P.refresh_quests()
	var w := (vs.x - 60) / 2.0
	var lv := vbox(10); at(lv, Vector2(24, 156 + 44))
	lv.add_child(L("每日任务 • 北京时间 0 点刷新", 20, Color("#ffe14d"), 4))
	var dq := P.daily_quests(Profile.day_index())
	for i in dq.size(): lv.add_child(quest_card(dq[i], int(P.o.q.dp[i]), w))
	lv.add_child(L("每周任务", 20, Color("#ffe14d"), 4))
	for i in D.econ.weekly.size(): lv.add_child(quest_card(D.econ.weekly[i], int(P.o.q.wp[i]), w))
	var rc := UIKit.dark_card(); at(rc, Vector2(36 + w, 200)); rc.custom_minimum_size.x = w
	var rv := vbox(8); rc.add_child(rv)
	rv.add_child(L("生涯数据", 22, Color.WHITE, 4))
	var o: Dictionary = P.o
	for row in [["play", "对战", o.matches], ["trophy", "胜场", o.wins], ["super", "击毁 / 击倒", o.kills], ["turf", "涂地格数", o.paint], ["star", "最高连胜", o.bestStreak], ["trophy", "奖杯", o.trophies]]:
		var h := hbox(10); rv.add_child(h); h.add_child(UIKit.icon(row[0], 30))
		var nl := L(row[1], 17, Color("#c9c5e6")); nl.custom_minimum_size.x = 160; h.add_child(nl); h.add_child(L(str(row[2]), 20, Color("#ffe14d")))


func quest_card(q: Array, n: int, w: float) -> GCard:
	var done := n >= int(q[1])
	var c := UIKit.card(Color("#1f5a3a") if done else Color("#272150"), Color("#123022") if done else Color("#15112c"), Color("#6dff8a") if done else Color("#4b4396"), 14)
	c.custom_minimum_size = Vector2(w, 0)
	var ik: String = {"win": "trophy", "play": "play", "kills": "super", "paint": "turf", "mvp": "star"}.get(str(q[0]), "book")
	var h := hbox(10); c.add_child(h); h.add_child(UIKit.icon(ik, 34))
	var v := vbox(3); v.size_flags_horizontal = Control.SIZE_EXPAND_FILL; h.add_child(v)
	v.add_child(L(("[完成] " if done else "") + P.quest_name(q), 17, Color("#6dff8a") if done else Color.WHITE))
	var bh := hbox(8); v.add_child(bh); bh.add_child(UIKit.bar(float(n) / float(q[1]), w - 250, 10, Color("#6dff8a"))); bh.add_child(L("%d / %d" % [n, int(q[1])], 13, Color("#a8a4c8")))
	h.add_child(UIKit.icon("star", 26)); h.add_child(L("通行证经验 %d" % int(q[2]), 15, Color("#ff8a3d")))
	return c

# ---------------- 操作结果 / 弹窗 ----------------
func act(r: Dictionary, ok_msg: String) -> void:
	if r.ok: toast(ok_msg); game.sfx.play("pickup")
	else: toast(str(r.err)); game.sfx.play("lose", -10.0)
	refresh()

func close_popup() -> void:
	if popup != null: popup.queue_free(); popup = null

func make_popup(size := Vector2(640, 440), card := true) -> VBoxContainer:
	close_popup()
	popup = Control.new(); popup.set_anchors_preset(Control.PRESET_FULL_RECT); add_child(popup)
	var bg := ColorRect.new(); bg.color = Color(0.02, 0.01, 0.06, 0.84); bg.set_anchors_preset(Control.PRESET_FULL_RECT); popup.add_child(bg)
	var v := vbox(12); v.alignment = BoxContainer.ALIGNMENT_CENTER
	if card:
		var pc := UIKit.dark_card(); pc.custom_minimum_size = size; pc.position = (vs - size) / 2; popup.add_child(pc); pc.add_child(v)
		pc.scale = Vector2(0.9, 0.9); pc.pivot_offset = size / 2; create_tween().tween_property(pc, "scale", Vector2.ONE, 0.15).set_trans(Tween.TRANS_BACK)
	else:
		v.position = (vs - size) / 2; v.custom_minimum_size = size; popup.add_child(v)
	if toast_box != null: move_child(toast_box, get_child_count() - 1)
	return v

func reward_card(it: Dictionary) -> GCard:
	var c: GCard
	match it.k:
		"pilot":
			var Pd: Dictionary = D.pilots[it.id]
			c = UIKit.card(Color(str(Pd.accent)), Color(str(Pd.accent)).darkened(0.6), Color.WHITE, 16); c.glow = Color(str(Pd.accent))
			var v := vbox(2); c.add_child(v); v.add_child(face(it.id, 100)); v.add_child(centered(L("新驾驶员！", 14, Color("#fff3a8"), 4))); v.add_child(centered(L(str(Pd.name), 20, Color.WHITE, 5)))
		"mech":
			c = UIKit.card(Color("#ffd23f"), Color("#a86a10"), Color.WHITE, 16); c.glow = Color("#ffd23f")
			var v2 := vbox(2); c.add_child(v2); v2.add_child(UIKit.icon("mech", 90)); v2.add_child(centered(L("新机体！", 14, Color("#3a1f05")))); v2.add_child(centered(L(str(D.mechs[it.id].name), 18, Color.WHITE, 5)))
		"chest":
			c = UIKit.dark_card()
			var v3 := vbox(2); c.add_child(v3); v3.add_child(UIKit.image("res://art/chests/%s.png" % it.id, Vector2(90, 90))); v3.add_child(centered(L("%s x%d" % [D.econ.chests[it.id].name, int(it.n)], 15, Color.WHITE)))
		"skin", "tp", "passxp":
			var tt: Array = item_text(it)
			c = UIKit.card(Color(tt[1]).darkened(0.35), Color(tt[1]).darkened(0.75), tt[1], 16)
			var v5 := vbox(2); c.add_child(v5)
			var K = P.skin(it.id) if it.k == "skin" else null
			if K != null and K.kind == "pilot": v5.add_child(UIKit.image("res://art/faces/%s.png" % it.id, Vector2(90, 90), true))
			else: v5.add_child(UIKit.icon("star" if it.k != "skin" else "gems", 72))
			v5.add_child(centered(UIKit.wrap(L(tt[0], 14, Color.WHITE, 4), 116)))
		_:
			var col := Color(str(D.econ.cur[it.k].color)) if D.econ.cur.has(it.k) else Color.WHITE
			c = UIKit.card(col.darkened(0.45), col.darkened(0.75), col, 16)
			var v4 := vbox(2); c.add_child(v4); v4.add_child(UIKit.icon(str(it.k), 72)); v4.add_child(centered(L("+%d" % int(it.n), 22, col.lightened(0.3), 5)))
			v4.add_child(centered(L(P.cur_name(it.k) + ("（重复转换）" if it.has("dup") else ""), 12, Color("#c9c5e6"))))
	c.custom_minimum_size = Vector2(130, 150)
	return c

func item_text(it: Dictionary) -> Array:
	match it.k:
		"pilot": return ["新驾驶员 %s" % D.pilots[it.id].name, Color(str(D.pilots[it.id].accent))]
		"mech": return ["新机体 %s" % D.mechs[it.id].name, Color("#ffe14d")]
		"chest": return ["%s x%d" % [D.econ.chests[it.id].name, int(it.n)], Color("#ffb000")]
		"skin": return ["皮肤「%s」" % (P.skin(it.id).name if P.skin(it.id) != null else it.id), Color("#ff7ad0")]
		"tp": return ["天赋点 +%d" % int(it.n), Color("#9cff2e")]
		"passxp": return ["通行证经验 +%d" % int(it.n), Color("#ff8a3d")]
	var s := "%s +%d" % [P.cur_name(it.k), int(it.n)]
	if it.has("why"): s += "（%s）" % it.why
	return [s, Color(str(D.econ.cur[it.k].color)) if D.econ.cur.has(it.k) else Color.WHITE]

# 开宝箱：点一下 → 箱子晃三下 → 光芒四射弹开 → 奖励卡片一张张翻出来
func open_anim(cid: String, r: Dictionary) -> void:
	if not r.ok: act(r, ""); return
	refresh()
	var v := make_popup(Vector2(900, 580), false)
	var C: Dictionary = D.econ.chests[cid]; var tc := Color(TIER_COL[int(C.tier)])
	v.add_child(centered(L(str(C.name), 40, tc.lightened(0.2), 10)))
	var stage := Control.new(); stage.custom_minimum_size = Vector2(900, 260); v.add_child(stage)
	var rays := Rays.new(); rays.col = tc; rays.size = Vector2(900, 260); rays.modulate.a = 0; stage.add_child(rays)
	var art := UIKit.image("res://art/chests/%s.png" % cid, Vector2(220, 238)); art.size = Vector2(220, 238); art.position = Vector2(340, 10); art.pivot_offset = Vector2(110, 200); stage.add_child(art)
	var tap := centered(L("点一下打开", 18, Color.WHITE, 4)); v.add_child(tap)
	var row := hbox(14); row.alignment = BoxContainer.ALIGNMENT_CENTER; row.custom_minimum_size = Vector2(900, 150); v.add_child(row)
	var okb := UIKit.gold_button("收下", 24); okb.custom_minimum_size = Vector2(220, 60); okb.size_flags_horizontal = Control.SIZE_SHRINK_CENTER; okb.modulate.a = 0; v.add_child(okb)
	var opened := [false]
	var do_open := func():
		if opened[0]: return
		opened[0] = true; tap.text = ""
		var tw := create_tween()
		for i in 6: tw.tween_property(art, "rotation", 0.14 * (1 if i % 2 == 0 else -1), 0.06)
		tw.tween_property(art, "rotation", 0.0, 0.05)
		tw.tween_callback(func():
			game.sfx.play("super"); art.texture = UIKit.tex("res://art/chests/%s_open.png" % cid)
			rays.modulate.a = 1.0)
		tw.tween_property(art, "scale", Vector2(1.15, 1.15), 0.12); tw.tween_property(art, "scale", Vector2.ONE, 0.12)
		for it in r.items:
			var rc := reward_card(it); rc.modulate.a = 0; row.add_child(rc)
			var big: bool = it.k in ["pilot", "mech"]
			tw.tween_callback(func(): game.sfx.play("win" if big else "pickup"); rc.pivot_offset = rc.size / 2; rc.scale = Vector2(0.4, 0.4))
			tw.tween_property(rc, "modulate:a", 1.0, 0.1)
			tw.parallel().tween_property(rc, "scale", Vector2.ONE, 0.25).set_trans(Tween.TRANS_BACK)
			tw.tween_interval(0.5 if big else 0.18)
		tw.tween_property(okb, "modulate:a", 1.0, 0.2)
	var hit := Button.new(); hit.flat = true; hit.position = Vector2(340, 10); hit.size = Vector2(220, 238); stage.add_child(hit)
	hit.pressed.connect(func(): do_open.call())
	click(okb, func(): if opened[0]: close_popup(); refresh())
	if OS.get_environment("GB_SHOT_OPEN") != "": do_open.call()

class Rays extends Control:
	var col := Color.WHITE
	func _ready() -> void: mouse_filter = Control.MOUSE_FILTER_IGNORE
	func _process(_d: float) -> void: queue_redraw()
	func _draw() -> void:
		var c := size / 2 + Vector2(0, 10); var t := Time.get_ticks_msec() / 1000.0
		for i in 14:
			var a := t * 0.4 + i * TAU / 14
			draw_colored_polygon(PackedVector2Array([c, c + Vector2(cos(a - 0.09), sin(a - 0.09)) * 420, c + Vector2(cos(a + 0.09), sin(a + 0.09)) * 420]), Color(col, 0.18))
		draw_circle(c, 90, Color(col, 0.25)); draw_circle(c, 55, Color(1, 1, 1, 0.25))

# 模式选择：11 种模式的卡片 + 地图
func mode_popup() -> void:
	var v := make_popup(Vector2(1010, 600))
	v.add_child(centered(L("选择模式", 30, Color("#ffe14d"), 8)))
	var g := GridContainer.new(); g.columns = 4; g.add_theme_constant_override("h_separation", 10); g.add_theme_constant_override("v_separation", 10); v.add_child(g)
	for m in D.modeOrder:
		var Md: Dictionary = D.modes[m]
		var sel: bool = m == P.o.mode
		var c := UIKit.card(Color("#ff6ad5") if sel else Color("#2e2760"), Color("#a63cff") if sel else Color("#17132f"), Color("#ffc4ef") if sel else Color("#4b4396"), 16, true)
		c.custom_minimum_size = Vector2(234, 86); c.pad = Vector4(10, 6, 10, 6)
		var h := hbox(8); c.add_child(h); h.add_child(UIKit.icon(mode_icon(m), 44))
		var mv := vbox(0); h.add_child(mv); mv.add_child(L(str(Md.name), 18, Color.WHITE, 4))
		var ds := str(Md.desc)
		mv.add_child(UIKit.wrap(L(ds.substr(0, 28) + ("…" if ds.length() > 28 else ""), 11, Color("#d8d0f0")), 160))
		c.tooltip_text = ds
		click(c, func(): P.o.mode = m; P.save(); mode_popup()); g.add_child(c)
	v.add_child(centered(UIKit.wrap(L(str(D.modes[P.o.mode].desc), 14, Color("#ffe14d")), 900)))
	var mh := hbox(10); mh.alignment = BoxContainer.ALIGNMENT_CENTER; v.add_child(mh)
	mh.add_child(L("地图", 18, Color("#c9c5e6")))
	var ob := OptionButton.new(); ob.add_item("随机地图", 0)
	for i in D.maps.size(): ob.add_item(str(D.maps[i].name), i + 1)
	ob.select(int(P.o.map) + 1); ob.custom_minimum_size = Vector2(260, 44)
	ob.item_selected.connect(func(k): P.o.map = k - 1; P.save(); game.sfx.play("click"))
	mh.add_child(ob)
	var ok := UIKit.gold_button("确定", 22); ok.custom_minimum_size = Vector2(180, 54); mh.add_child(ok); click(ok, func(): close_popup(); refresh())

var set_tab := "display"
var rebinding := ""

func _input(ev: InputEvent) -> void:   # 改键：等玩家按下新键
	if rebinding == "" or not (ev is InputEventKey) or not ev.pressed: return
	if ev.physical_keycode != KEY_ESCAPE:
		game.settings.keys[rebinding] = int(ev.physical_keycode); game.settings.save()
	rebinding = ""; get_viewport().set_input_as_handled(); settings_popup()

func settings_popup() -> void:
	var S2: Settings = game.settings
	var v := make_popup(Vector2(720, 560))
	v.alignment = BoxContainer.ALIGNMENT_BEGIN
	v.add_child(centered(L("设置", 30, Color("#ffe14d"), 8)))
	var th := hbox(8); th.alignment = BoxContainer.ALIGNMENT_CENTER; v.add_child(th)
	for t in [["display", "画面"], ["audio", "声音"], ["keys", "按键"], ["save", "账号 / 存档"]]:
		var on: bool = t[0] == set_tab
		var c := UIKit.card(Color("#ff6ad5") if on else Color("#2e2760"), Color("#a63cff") if on else Color("#17132f"), Color("#ffc4ef") if on else Color("#4b4396"), 14, true)
		c.pad = Vector4(18, 6, 18, 6); c.add_child(L(t[1], 17, Color.WHITE, 3)); th.add_child(c)
		click(c, func(): set_tab = t[0]; settings_popup())
	var body := vbox(12); body.custom_minimum_size = Vector2(660, 360); v.add_child(body)
	var row := func(label: String, ctl: Control) -> void:
		var h := hbox(14); body.add_child(h); var l := L(label, 18, Color.WHITE); l.custom_minimum_size.x = 180; h.add_child(l); h.add_child(ctl)
	var applyf := func(): S2.save(); S2.apply(game)
	match set_tab:
		"display":
			var fs := CheckButton.new(); fs.button_pressed = S2.fullscreen; fs.toggled.connect(func(x): S2.fullscreen = x; applyf.call()); row.call("全屏（F11）", fs)
			var vsy := CheckButton.new(); vsy.button_pressed = S2.vsync; vsy.toggled.connect(func(x): S2.vsync = x; applyf.call()); row.call("垂直同步", vsy)
			var fp := OptionButton.new()
			for f in Settings.FPS_OPTIONS: fp.add_item("不限" if f == 0 else "%d 帧" % f)
			fp.select(max(0, Settings.FPS_OPTIONS.find(S2.max_fps))); fp.item_selected.connect(func(k): S2.max_fps = Settings.FPS_OPTIONS[k]; applyf.call()); row.call("帧率上限", fp)
			var q := OptionButton.new()
			for k in Settings.QUALITY_ORDER: q.add_item(str(Settings.QUALITY[k].name))
			q.select(Settings.QUALITY_ORDER.find(S2.quality)); q.item_selected.connect(func(k): S2.quality = Settings.QUALITY_ORDER[k]; applyf.call()); row.call("画质", q)
			var rs := HSlider.new(); rs.min_value = 0.5; rs.max_value = 1.0; rs.step = 0.05; rs.value = S2.render_scale; rs.custom_minimum_size = Vector2(260, 30)
			var rl := L("%d%%" % int(S2.render_scale * 100), 16, Color("#ffe14d"))
			rs.value_changed.connect(func(x): S2.render_scale = x; rl.text = "%d%%" % int(x * 100); applyf.call())
			var rh := hbox(8); rh.add_child(rs); rh.add_child(rl); row.call("3D 渲染分辨率", rh)
			body.add_child(UIKit.wrap(L("画质：流畅（不开阴影和后期）/ 均衡 / 高（环境光遮蔽 + 2 倍抗锯齿）/ 极致（4 倍抗锯齿 + 超清阴影）。电脑配置低就选流畅并把渲染分辨率调低。", 13, Color("#a8a4c8")), 640))
		"audio":
			var sv := HSlider.new(); sv.min_value = -40; sv.max_value = 6; sv.value = S2.sfx_db; sv.custom_minimum_size = Vector2(300, 30)
			sv.value_changed.connect(func(x): S2.sfx_db = x; applyf.call(); game.sfx.play("click")); row.call("音效音量", sv)
			var mv := HSlider.new(); mv.min_value = -40; mv.max_value = 0; mv.value = S2.music_db; mv.custom_minimum_size = Vector2(300, 30)
			mv.value_changed.connect(func(x): S2.music_db = x; applyf.call()); row.call("音乐音量", mv)
			body.add_child(UIKit.wrap(L("背景音乐是原版的原创曲目：大厅「霓虹喷漆街」、对战「涂装突击」、最后 30 秒「倒数冲刺」。", 13, Color("#a8a4c8")), 640))
		"keys":
			var g := GridContainer.new(); g.columns = 4; g.add_theme_constant_override("h_separation", 14); g.add_theme_constant_override("v_separation", 8); body.add_child(g)
			for a in Settings.ACTIONS:
				g.add_child(L(a[1], 17, Color.WHITE))
				var waiting: bool = rebinding == a[0]
				var b := UIKit.flat_button("按任意键…" if waiting else Settings.key_name(S2.keys[a[0]]), 16); b.custom_minimum_size = Vector2(150, 40); b.selected = waiting
				click(b, func(): rebinding = a[0]; settings_popup()); g.add_child(b)
			body.add_child(UIKit.wrap(L("点按钮后按下新的键（Esc 取消）。鼠标：左键攻击、右键大招；Esc 回大厅；F11 全屏。方向键也能移动。", 13, Color("#a8a4c8")), 640))
			var rk := UIKit.flat_button("恢复默认按键", 15); rk.custom_minimum_size = Vector2(160, 40); body.add_child(rk)
			click(rk, func(): S2.keys = Settings.DEFAULT_KEYS.duplicate(); S2.save(); settings_popup())
		"save":
			var A: Accounts = game.accounts
			body.add_child(L("当前：" + ("账号「%s」" % A.current_name() if A.current() != "" else "游客"), 20, Color("#ffe14d"), 4))
			body.add_child(UIKit.wrap(L("账号和网页版、安卓版通用：在网页版「账号 → 导出转移码」，复制到这里导入，就能用原来的密码登录、接着玩；在这里导出的转移码也能导回网页版。有游戏服务器的话也可以直接登录在线账号。", 15, Color("#e6e2fa")), 640))
			var ab := UIKit.gold_button("账号管理", 18); ab.custom_minimum_size = Vector2(180, 50); body.add_child(ab); click(ab, func(): account_popup())
			body.add_child(UIKit.wrap(L("重置会清空当前账号（或游客）的所有进度，重新开新手宝箱。", 14, Color("#a8a4c8")), 640))
			var rs2 := UIKit.pink_button("重置存档", 18); rs2.custom_minimum_size = Vector2(180, 50); body.add_child(rs2); click(rs2, func(): confirm_reset())
	var ok := UIKit.gold_button("好的", 22); ok.custom_minimum_size = Vector2(180, 54); ok.size_flags_horizontal = Control.SIZE_SHRINK_CENTER; v.add_child(ok); click(ok, func(): rebinding = ""; close_popup())

func help_popup() -> void:
	var v := make_popup(Vector2(640, 380))
	v.add_child(centered(L("操作说明", 30, Color("#ffe14d"), 8)))
	var K: Dictionary = game.settings.keys
	var kn := func(a): return Settings.key_name(K[a])
	for line in ["%s%s%s%s 移动 • 鼠标瞄准 • 左键攻击" % [kn.call("up"), kn.call("left"), kn.call("down"), kn.call("right")], "%s 技能 • %s / 右键 大招 • %s 超载" % [kn.call("skill"), kn.call("super"), kn.call("overload")],
			"%s 滚轮形态（在己方涂料上更快） • %s 跳 • Esc 暂停 • F11 全屏" % [kn.call("wheel"), kn.call("jump")], "手柄：左摇杆移动 • 右摇杆瞄准 • RT 开火 • A 跳 • B 滚轮 • X 技能 • Y 大招 • LB 超载 • Start 暂停", "按键可以在「设置 → 按键」里改"]:
		v.add_child(centered(UIKit.wrap(L(line, 16, Color("#e6e2fa")), 580)))
	var ok := UIKit.gold_button("知道了", 22); ok.custom_minimum_size = Vector2(180, 54); ok.size_flags_horizontal = Control.SIZE_SHRINK_CENTER; v.add_child(ok); click(ok, func(): close_popup())

# 第一次打开：新手宝箱
func welcome() -> void:
	var v := make_popup(Vector2(720, 540), false)
	v.add_child(centered(L("欢迎来到涂鸦机兵！", 40, Color("#ffe14d"), 10)))
	v.add_child(centered(UIKit.wrap(L("你是一名街头涂鸦机兵驾驶员。先从新手宝箱里领一位驾驶员，再带上 3 台常驻机体，去把整座城市涂成你的颜色吧！", 17, Color("#e6e2fa")), 640)))
	var art := UIKit.image("res://art/chests/starter.png", Vector2(220, 238)); art.size_flags_horizontal = Control.SIZE_SHRINK_CENTER; v.add_child(art)
	art.pivot_offset = Vector2(110, 200)
	var bob := art.create_tween().set_loops(); bob.tween_property(art, "rotation", 0.05, 0.5); bob.tween_property(art, "rotation", -0.05, 0.5)
	var hb := hbox(16); hb.alignment = BoxContainer.ALIGNMENT_CENTER; v.add_child(hb)
	if not P.o.get("tutDone", false):   # 第一次：先玩 1 分钟的新手教程，学完再开宝箱
		var tb := UIKit.gold_button("开始新手教程", 24); tb.custom_minimum_size = Vector2(280, 62); hb.add_child(tb)
		click(tb, func(): bob.kill(); close_popup(); game.start_tutorial())
		var sb := UIKit.flat_button("跳过，直接领宝箱", 17); sb.custom_minimum_size = Vector2(200, 62); hb.add_child(sb)
		click(sb, func(): bob.kill(); P.o.tutDone = true; P.save(); welcome())
		return
	var b := UIKit.gold_button("领取新手宝箱", 24); b.custom_minimum_size = Vector2(280, 62); hb.add_child(b)
	click(b, func():
		bob.kill()
		P.tutorial()
		view_pilot = ""
		open_anim("starter", P.open_chest("starter")))

func confirm_reset() -> void:
	var v := make_popup(Vector2(520, 240))
	v.add_child(centered(UIKit.wrap(L("确定要重置存档吗？所有进度都会清空。", 22, Color("#ff6b5a")), 460)))
	var hb := hbox(16); hb.alignment = BoxContainer.ALIGNMENT_CENTER; v.add_child(hb)
	var c1 := UIKit.flat_button("取消", 20); c1.custom_minimum_size = Vector2(150, 50); hb.add_child(c1); click(c1, func(): close_popup())
	var c2 := UIKit.pink_button("重置", 20); c2.custom_minimum_size = Vector2(150, 50); hb.add_child(c2)
	click(c2, func(): P.reset(); close_popup(); sub = ""; view_mech = P.o.weapon; refresh(); welcome())

# ================= 阶段 5 页面：通行证 / 邮件 / 活动 / 皮肤商店 / 排位 / 任务线 =================
var quest_tab := "daily"
var loot_tab := "stash"
var ev_tab := ""
var shop_kind := "pilot"
var mail_sel := ""

func tabs(pos: Vector2, items: Array, cur: String, pick: Callable) -> void:
	var h := hbox(8); at(h, pos)
	for it in items:
		var on: bool = it[0] == cur
		var c := UIKit.card(Color("#ff6ad5") if on else Color("#2e2760"), Color("#a63cff") if on else Color("#17132f"), Color("#ffc4ef") if on else Color("#4b4396"), 14, true)
		c.pad = Vector4(14, 6, 14, 6); c.add_child(L(it[1], 16, Color.WHITE, 3)); h.add_child(c)
		click(c, func(): pick.call(it[0]); refresh())

func mini_reward(it: Dictionary, size := 30.0) -> HBoxContainer:
	var h := hbox(4)
	match it.k:
		"pilot": h.add_child(face(it.id, size, false))
		"mech": h.add_child(UIKit.icon("mech", size))
		"chest": h.add_child(UIKit.image("res://art/chests/%s.png" % it.id, Vector2(size, size)))
		"skin":
			var K = P.skin(it.id)
			if K != null and K.kind == "pilot": h.add_child(UIKit.image("res://art/faces/%s.png" % it.id, Vector2(size, size), true))
			else: h.add_child(UIKit.icon("gems", size))
		"tp", "passxp": h.add_child(UIKit.icon("star", size))
		_: h.add_child(UIKit.icon(str(it.k), size))
	var tt: Array = item_text(it)
	var txt: String = tt[0]
	if D.econ.cur.has(it.k): txt = "x%d" % int(it.n)
	h.add_child(L(txt, 14, tt[1]))
	return h

func claim_btn(text: String, f: Callable, enabled := true) -> GCard:
	var b := UIKit.gold_button(text, 16) if enabled else UIKit.flat_button(text, 15)
	b.custom_minimum_size = Vector2(96, 40); b.dim = not enabled
	if enabled: click(b, f)
	return b

func show_items(r: Dictionary, title: String) -> void:
	if not r.ok: act(r, ""); return
	game.sfx.play("win")
	var v := make_popup(Vector2(860, 420))
	v.add_child(centered(L(title, 30, Color("#ffe14d"), 8)))
	var row := hbox(12); row.alignment = BoxContainer.ALIGNMENT_CENTER; v.add_child(row)
	for it in r.items.slice(0, 6): row.add_child(reward_card(it))
	if r.items.size() > 6: v.add_child(centered(L("……还有 %d 项" % (r.items.size() - 6), 15, Color("#c9c5e6"))))
	var ok := UIKit.gold_button("收下", 22); ok.custom_minimum_size = Vector2(200, 56); ok.size_flags_horizontal = Control.SIZE_SHRINK_CENTER; v.add_child(ok)
	click(ok, func(): close_popup(); refresh())

# ---------------- 通行证 ----------------
func page_pass() -> void:
	var PS: Dictionary = D.econ.pass
	var lv := P.pass_level(); var xp := int(P.o.pass.xp); var per := int(PS.xpPer)
	var head := UIKit.card(Color("#ff8a3d"), Color("#7a1f3a"), Color("#ffd0a0"), 18); at(head, Vector2(24, 152), Vector2(vs.x - 48, 96))
	var hh := hbox(16); head.add_child(hh)
	hh.add_child(UIKit.icon("star", 64))
	var hv := vbox(4); hh.add_child(hv)
	hv.add_child(L("赛季「%s」 • 通行证 Lv.%d / %d" % [PS.season, lv, int(PS.tiers)], 24, Color.WHITE, 6))
	hv.add_child(UIKit.bar(float(xp % per) / per if lv < int(PS.tiers) else 1.0, 360, 12, Color("#fff3a8")))
	var days: int = max(0, (int(PS.ends) - Profile.now_s()) / 86400)
	hv.add_child(L("下一级还要 %d 经验 • 赛季还剩 %d 天 • 对战、每日 / 每周任务都给通行证经验" % [per - xp % per, days], 13, Color("#ffe6d0")))
	var sp := Control.new(); sp.size_flags_horizontal = Control.SIZE_EXPAND_FILL; sp.mouse_filter = Control.MOUSE_FILTER_IGNORE; hh.add_child(sp)
	var bv := hbox(8); bv.alignment = BoxContainer.ALIGNMENT_CENTER; hh.add_child(bv)
	if not P.o.pass.prem:
		var b1 := UIKit.gold_button("", 10); clear(b1); b1.custom_minimum_size = Vector2(196, 46); bv.add_child(b1)
		var b1h := hbox(6); b1h.alignment = BoxContainer.ALIGNMENT_CENTER; b1.add_child(b1h); b1h.add_child(L("高级通行证", 16, Color("#3a1f05"))); b1h.add_child(UIKit.icon("gems", 22)); b1h.add_child(L(str(int(PS.price)), 16, Color("#3a1f05")))
		click(b1, func(): act(P.buy_pass(false), "解锁了高级通行证！"))
	if not P.o.pass.dlx:
		var cost := int(PS.deluxe) - (int(PS.price) if P.o.pass.prem else 0)
		var b2 := UIKit.pink_button("", 10); clear(b2); b2.custom_minimum_size = Vector2(196, 46); bv.add_child(b2)
		var b2h := hbox(6); b2h.alignment = BoxContainer.ALIGNMENT_CENTER; b2.add_child(b2h); b2h.add_child(L("豪华版 +%d级" % int(PS.boost), 15, Color.WHITE, 3)); b2h.add_child(UIKit.icon("gems", 22)); b2h.add_child(L(str(cost), 15, Color.WHITE, 3))
		click(b2, func(): act(P.buy_pass(true), "豪华版通行证！直接升 %d 级" % int(PS.boost)))
	var ca := UIKit.gold_button("全部领取", 18); ca.custom_minimum_size = Vector2(196, 46); bv.add_child(ca); click(ca, func(): show_items(P.claim_pass_all(), "通行证奖励"))
	var rp := UIKit.flat_button("赛季动画", 15); rp.custom_minimum_size = Vector2(120, 46); bv.add_child(rp); click(rp, func(): season_intro())
	# 横向滚动的 50 级奖励
	var sc := ScrollContainer.new(); sc.vertical_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED; at(sc, Vector2(24, 262), Vector2(vs.x - 48, vs.y - 280))
	var row := hbox(8); sc.add_child(row)
	var lab := vbox(8); row.add_child(lab)
	lab.add_child(L(" ", 18)); lab.add_child(_pass_side("免费", Color("#7af0ff"))); lab.add_child(_pass_side("高级", Color("#ffcf4d")))
	for t in range(1, int(PS.tiers) + 1):
		var col := vbox(8); row.add_child(col)
		col.add_child(centered(L(str(t), 18, Color("#ffe14d") if t <= lv else Color("#7a76a0"), 3)))
		for prem in [false, true]:
			var it: Dictionary = (PS.prem if prem else PS.free)[t - 1]
			var got: bool = (P.o.pass.cp if prem else P.o.pass.cf).has(t)
			var can: bool = t <= lv and not got and (not prem or P.o.pass.prem)
			var c := UIKit.card(Color("#ffcf4d").darkened(0.5) if prem else Color("#2e2760"), Color("#2a1a08") if prem else Color("#16122e"), Color("#ffe14d") if can else (Color("#6dff8a") if got else Color("#4b4396")), 14, can)
			c.custom_minimum_size = Vector2(112, (vs.y - 340) / 2.0); c.dim = t > lv or (prem and not P.o.pass.prem); c.selected = can
			var cv := vbox(4); cv.alignment = BoxContainer.ALIGNMENT_CENTER; c.add_child(cv)
			var r := mini_reward(it, 52); r.alignment = BoxContainer.ALIGNMENT_CENTER
			var rv := vbox(2); rv.alignment = BoxContainer.ALIGNMENT_CENTER; cv.add_child(rv)
			rv.add_child(r.get_child(0).duplicate()); rv.get_child(0).custom_minimum_size = Vector2(52, 52)
			rv.add_child(centered(UIKit.wrap(L(item_text(it)[0], 12, Color.WHITE, 3), 100)))
			r.queue_free()
			if got: cv.add_child(centered(L("已领取", 12, Color("#6dff8a"))))
			elif can: cv.add_child(centered(L("点击领取", 12, Color("#ffe14d")))); click(c, func(): show_items(P.claim_pass(t, prem), "通行证 %d 级奖励" % t))
			col.add_child(c)

func _pass_side(t: String, c: Color) -> GCard:
	var g := UIKit.card(c.darkened(0.3), c.darkened(0.7), c, 14); g.custom_minimum_size = Vector2(60, (vs.y - 340) / 2.0)
	var l := centered(L(t, 18, Color.WHITE, 4)); l.vertical_alignment = VERTICAL_ALIGNMENT_CENTER; g.add_child(l)
	return g

# ---------------- 邮件 ----------------
func page_mail() -> void:
	var box := P.mailbox()
	var w := 420.0
	var sc := ScrollContainer.new(); sc.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED; at(sc, Vector2(24, 152), Vector2(w, vs.y - 236))
	var lst := vbox(8); sc.add_child(lst)
	if box.is_empty(): lst.add_child(L("没有邮件。更新礼包和活动奖励会寄到这里（没领取的奖励 3 天后过期）", 15, Color("#a8a4c8")))
	if mail_sel == "" and not box.is_empty(): mail_sel = box[0].id
	var sel = null
	for m in box:
		if m.id == mail_sel: sel = m
		var c := UIKit.card(Color("#2e2760") if not m.got else Color("#1d1838"), Color("#17132f"), Color("#ffe14d") if m.id == mail_sel else Color("#4b4396"), 14, true)
		c.custom_minimum_size = Vector2(w - 20, 0)
		var h := hbox(10); c.add_child(h); h.add_child(UIKit.icon("mail", 36))
		var v := vbox(0); h.add_child(v)
		v.add_child(L(str(m.title), 16, Color.WHITE if not m.got else Color("#a8a4c8"))); v.add_child(L(str(m.from) + ("  • 已领取" if m.got else "  • 未领取"), 12, Color("#ff9ad6") if not m.got else Color("#7a76a0")))
		click(c, func(): mail_sel = m.id; refresh()); lst.add_child(c)
	var bh := hbox(10); at(bh, Vector2(24, vs.y - 74))
	bh.add_child(claim_btn("全部领取", func(): show_items(P.claim_mail("*"), "邮件奖励"), P.unread_mail() > 0))
	var dl := UIKit.flat_button("删除已读", 15); dl.custom_minimum_size = Vector2(120, 40); bh.add_child(dl); click(dl, func(): P.del_mail("*"); mail_sel = ""; P.save(); refresh())
	if sel == null: return
	var dc := UIKit.dark_card(); at(dc, Vector2(w + 40, 152), Vector2(vs.x - w - 64, vs.y - 168))
	var dv := vbox(10); dc.add_child(dv)
	dv.add_child(L(str(sel.title), 26, Color("#ffe14d"), 6)); dv.add_child(L("来自：" + str(sel.from), 14, Color("#c9c5e6")))
	dv.add_child(UIKit.wrap(L(str(sel.body), 16, Color("#e6e2fa")), vs.x - w - 110))
	var ir := hbox(12); dv.add_child(ir)
	for it in sel.items: ir.add_child(reward_card(it))
	if not sel.got: dv.add_child(claim_btn("领取", func(): show_items(P.claim_mail(sel.id), "邮件奖励")))
	else: dv.add_child(L("已领取", 16, Color("#6dff8a")))

# ---------------- 活动 ----------------
func page_events() -> void:
	var evs := P.active_events()
	if evs.is_empty(): at(L("现在没有进行中的活动", 18, Color("#a8a4c8")), Vector2(24, 160)); return
	if ev_tab == "" or not evs.any(func(e): return e.id == ev_tab): ev_tab = evs[0].id
	tabs(Vector2(330, 100), evs.map(func(e): return [e.id, e.name]), ev_tab, func(id): ev_tab = id)
	var ev: Dictionary = evs.filter(func(e): return e.id == ev_tab)[0]
	var col := Color(str(ev.color))
	var st := P.event_state(ev)
	var head := UIKit.card(col, col.darkened(0.6), col.lightened(0.3), 18); at(head, Vector2(24, 152), Vector2(vs.x - 48, 84))
	var hv := vbox(2); head.add_child(hv)
	var days: int = max(0, (int(ev.end) - Profile.now_s()) / 3600)
	hv.add_child(L("%s • 还剩 %d 天 %d 小时" % [ev.name, days / 24, days % 24], 22, Color.WHITE, 6))
	hv.add_child(UIKit.wrap(L(str(ev.desc), 13, Color.WHITE, 3), vs.x - 90))
	var lw := (vs.x - 60) * 0.48
	var sc := ScrollContainer.new(); sc.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED; at(sc, Vector2(24, 248), Vector2(lw, vs.y - 264))
	var qv := vbox(8); sc.add_child(qv)
	qv.add_child(L("活动任务", 20, Color("#ffe14d"), 4))
	for i in ev.quests.size():
		var q: Array = ev.quests[i]; var n := int(st.p[i]); var done := n >= int(q[1])
		var c := UIKit.dark_card(); c.custom_minimum_size = Vector2(lw - 16, 0)
		var h := hbox(10); c.add_child(h)
		var v := vbox(3); v.size_flags_horizontal = Control.SIZE_EXPAND_FILL; h.add_child(v)
		v.add_child(L(P.stat_name(q[0], q[1]), 15, Color.WHITE)); v.add_child(UIKit.bar(float(n) / float(q[1]), lw - 300, 9, col)); v.add_child(mini_reward(q[2], 24))
		if st.c[i]: h.add_child(L("已领取", 14, Color("#6dff8a")))
		else: h.add_child(claim_btn("领取" if done else "%d/%d" % [n, int(q[1])], func(): show_items(P.claim_event(ev.id, i), ev.name), done))
		qv.add_child(c)
	var rx := 36 + lw; var rw := vs.x - rx - 24
	var sc2 := ScrollContainer.new(); sc2.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED; at(sc2, Vector2(rx, 248), Vector2(rw, vs.y - 264))
	var rv := vbox(10); sc2.add_child(rv)
	if ev.has("login"):
		var L2: Dictionary = P.o.evLogin.get(ev.id, {"n": 0, "d": -1})
		rv.add_child(L("登录奖励（每天领一次）", 20, Color("#ffe14d"), 4))
		var lh := hbox(6); rv.add_child(lh)
		for i in ev.login.size():
			var got: bool = i < int(L2.n); var today: bool = i == int(L2.n) and int(L2.d) != Profile.day_index()
			var c2 := UIKit.card(col.darkened(0.3) if today else Color("#1d1838"), Color("#120f26"), Color("#ffe14d") if today else (Color("#6dff8a") if got else Color("#4b4396")), 12, today)
			c2.pad = Vector4(6, 4, 6, 4)
			var v2 := vbox(2); c2.add_child(v2); v2.add_child(centered(L("第 %d 天" % (i + 1), 12, Color.WHITE)))
			var mr := mini_reward(ev.login[i], 26); v2.add_child(mr)
			if got: v2.add_child(centered(L("已领", 11, Color("#6dff8a"))))
			if today: click(c2, func(): show_items(P.event_login(ev.id), "登录奖励"))
			lh.add_child(c2)
	if ev.has("shop"):
		var cur: String = ev.get("cur", "tickets")
		var sh := hbox(8); rv.add_child(sh); sh.add_child(L("活动商店", 20, Color("#ffe14d"), 4)); sh.add_child(UIKit.pill(cur, str(int(P.o.get(cur, 0))), Color(str(D.econ.cur[cur].color))))
		var g := GridContainer.new(); g.columns = 2; g.add_theme_constant_override("h_separation", 8); g.add_theme_constant_override("v_separation", 8); rv.add_child(g)
		for i in ev.shop.size():
			var item: Dictionary = ev.shop[i]; var left := int(item.limit) - int(st.s[i])
			var c3 := UIKit.dark_card(left > 0); c3.custom_minimum_size = Vector2(rw / 2 - 16, 0); c3.dim = left <= 0
			var h3 := hbox(8); c3.add_child(h3); h3.add_child(mini_reward(item.it, 30))
			var sp := Control.new(); sp.size_flags_horizontal = Control.SIZE_EXPAND_FILL; sp.mouse_filter = Control.MOUSE_FILTER_IGNORE; h3.add_child(sp)
			var v3 := vbox(0); h3.add_child(v3); var ph := hbox(3); v3.add_child(ph); ph.add_child(UIKit.icon(cur, 20)); ph.add_child(L(str(int(item.cost)), 15, Color(str(D.econ.cur[cur].color))))
			v3.add_child(L("剩 %d" % left, 11, Color("#a8a4c8")))
			if left > 0: click(c3, func(): show_items(P.event_shop(ev.id, i), "兑换成功"))
			g.add_child(c3)
	if ev.get("collab", false):
		rv.add_child(L("联动角色（宝石购买，也可以做任务免费拿）", 18, Color("#ffe14d"), 4))
		var ch := hbox(8); rv.add_child(ch)
		for x in D.econ.collab.shop:
			var own: bool = P.has_pilot(x.id) if x.k == "pilot" else P.has_mech(x.id)
			var c4 := UIKit.dark_card(not own); c4.dim = own
			var v4 := vbox(2); c4.add_child(v4); v4.add_child(mini_reward({"k": x.k, "id": x.id}, 40))
			v4.add_child(L("已拥有" if own else "%d 宝石" % int(x.gems), 13, Color("#6dff8a") if own else Color("#ff7ad0")))
			if not own: click(c4, func(): show_items(P.collab_buy(x.id), "联动角色"))
			ch.add_child(c4)

# ---------------- 皮肤商店（含限时角色） ----------------
func page_shop() -> void:
	var of := P.offers()
	var oh := hbox(10); at(oh, Vector2(24, 152))
	var left: int = max(0, int(of.ends) - Profile.now_s())
	oh.add_child(L("限时角色 • %d:%02d 后刷新" % [left / 3600, (left / 60) % 60], 18, Color("#ffe14d"), 4))
	for id in of.pilots + [of.mech]:
		var isp: bool = D.pilots.has(id)
		var own: bool = P.has_pilot(id) if isp else P.has_mech(id)
		var c := UIKit.dark_card(not own); c.dim = own
		var h := hbox(8); c.add_child(h); h.add_child(face(id, 44, false) if isp else UIKit.icon("mech", 44))
		var v := vbox(0); h.add_child(v); v.add_child(L(str(D.pilots[id].name if isp else D.mechs[id].name), 16, Color.WHITE))
		var ph := hbox(3); v.add_child(ph)
		if own: ph.add_child(L("已拥有", 13, Color("#6dff8a")))
		else: ph.add_child(UIKit.icon("gems", 18)); ph.add_child(L(str(int(D.econ.offer.pilotPrice if isp else D.econ.offer.mechPrice)), 14, Color("#ff7ad0")))
		if not own: click(c, func(): show_items(P.buy_offer(id), "限时角色"))
		oh.add_child(c)
	var kinds := [["pilot", "驾驶员服装"], ["mech", "机甲涂装"], ["fx", "涂料特效"], ["frame", "名片框"], ["avatar", "头像"]]
	tabs(Vector2(24, 226), kinds, shop_kind, func(k): shop_kind = k)
	var deal := P.daily_deal()
	var sc := ScrollContainer.new(); sc.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED; at(sc, Vector2(24, 276), Vector2(vs.x - 48, vs.y - 292))
	var g := GridContainer.new(); g.columns = 5; g.add_theme_constant_override("h_separation", 10); g.add_theme_constant_override("v_separation", 10); sc.add_child(g)
	var rare_col := ["#c9ccd4", "#c9ccd4", "#4fb8ff", "#b78cff", "#ffc531", "#ff3b52"]
	for K in D.econ.skins:
		if K.kind != shop_kind: continue
		var own: bool = P.o.skins.has(K.id)
		var on := false
		if own: on = (P.pilot_skin(K.pilot) == K.id) if K.kind == "pilot" else (str(P.o.wear.get(K.kind, "")) == K.id)
		var rc := Color(rare_col[clampi(int(K.rare), 0, 5)])
		var c := UIKit.card(rc.darkened(0.45), Color("#120f26"), rc, 16, true); c.selected = on
		c.custom_minimum_size = Vector2((vs.x - 48 - 40) / 5.0 - 2, 214)
		var v := vbox(4); c.add_child(v)
		match K.kind:
			"pilot": v.add_child(UIKit.image("res://art/faces/%s.png" % K.id, Vector2(110, 110), true))
			"mech":
				var sw := hbox(4); sw.alignment = BoxContainer.ALIGNMENT_CENTER; sw.custom_minimum_size = Vector2(0, 110); v.add_child(sw)
				for k2 in ["frame", "light", "joint"]:
					var cr := ColorRect.new(); cr.color = Color(str(K.paint[k2])); cr.custom_minimum_size = Vector2(36, 80); cr.mouse_filter = Control.MOUSE_FILTER_IGNORE; sw.add_child(cr)
			"fx":
				var sw2 := hbox(4); sw2.alignment = BoxContainer.ALIGNMENT_CENTER; sw2.custom_minimum_size = Vector2(0, 110); v.add_child(sw2)
				for fc in K.fx.cols:
					var cr2 := UIKit.card(Color(str(fc)), Color(str(fc)).darkened(0.3), Color.WHITE, 20); cr2.custom_minimum_size = Vector2(34, 34); cr2.shadow = 0; sw2.add_child(cr2)
			_: v.add_child(UIKit.icon("star" if K.kind == "frame" else "pilot", 100))
		var who := (str(D.pilots[K.pilot].name) + " • ") if K.kind == "pilot" else ""
		v.add_child(centered(L(who + str(K.name), 15, Color.WHITE, 4)))
		if own:
			v.add_child(centered(L("使用中（点击脱下）" if on else "已拥有（点击穿上）", 12, Color("#6dff8a") if on else Color("#c9c5e6"))))
			click(c, func(): act(P.wear(K.id), "换装完成"))
		elif int(K.price) > 0:
			var pr := P.skin_price(K)
			var ph2 := hbox(4); ph2.alignment = BoxContainer.ALIGNMENT_CENTER; v.add_child(ph2); ph2.add_child(UIKit.icon("gems", 20)); ph2.add_child(L(str(pr), 15, Color("#ff7ad0")))
			if deal.id == K.id: ph2.add_child(UIKit.chip("今日 7 折", Color("#ffe14d"), 11))
			click(c, func(): act(P.buy_skin(K.id), "买到了「%s」！" % K.name))
		else:
			v.add_child(centered(L("通行证 / 活动 / 排位获得", 12, Color("#a8a4c8"))))

# ---------------- 排位赛 ----------------
func page_ranked() -> void:
	P.rank_season()
	var R: Dictionary = D.econ.rank
	var rp := int(P.o.rank.rp); var t := P.rank_tier(rp); var T: Dictionary = R.tiers[t]; var tc := Color(str(T.color))
	var card := UIKit.card(tc.darkened(0.3), tc.darkened(0.75), tc, 22); at(card, Vector2(24, 152), Vector2(480, vs.y - 168))
	var v := vbox(10); card.add_child(v)
	v.add_child(L("赛季「%s」" % R.season.name, 16, Color("#e6e2fa")))
	var th := hbox(12); v.add_child(th); th.add_child(UIKit.icon("trophy", 72))
	var tv := vbox(2); th.add_child(tv); tv.add_child(L(str(T.name), 40, Color.WHITE, 8)); tv.add_child(L("%d 分 • 最高段位 %s" % [rp, R.tiers[int(P.o.rank.best)].name], 15, Color("#fff3a8")))
	if t + 1 < R.tiers.size():
		var nx := int(R.tiers[t + 1].rp)
		v.add_child(UIKit.bar(float(rp - int(T.rp)) / float(nx - int(T.rp)), 420, 12, tc.lightened(0.3)))
		v.add_child(L("距离「%s」还差 %d 分" % [R.tiers[t + 1].name, nx - rp], 14, Color("#e6e2fa")))
	v.add_child(UIKit.wrap(L("赢 +%d（MVP +%d） • 输 %d（钻石起 %d，拿到 MVP 只扣一半） • 铁段输了不掉段 • 金币和通行证经验 ×1.5 • 钻石起开局前有禁用阶段" % [int(R.win), int(R.mvpWin), int(R.loss), int(R.lossHi)], 13, Color("#c9c5e6")), 440))
	var md: String = P.ranked_mode(); var left: int = max(0, P.ranked_ends() - Profile.now_s())
	var mh := hbox(10); v.add_child(mh); mh.add_child(UIKit.icon(mode_icon(md), 44))
	var mv := vbox(0); mh.add_child(mv); mv.add_child(L("当前排位模式：" + str(D.modes[md].name), 18, Color.WHITE)); mv.add_child(L("%d 分钟后换模式（每 %d 小时轮换）" % [left / 60, int(D.econ.rankHours)], 13, Color("#a8a4c8")))
	var sp := Control.new(); sp.size_flags_vertical = Control.SIZE_EXPAND_FILL; sp.mouse_filter = Control.MOUSE_FILTER_IGNORE; v.add_child(sp)
	if P.can_ranked():
		var go := UIKit.gold_button("开始排位", 30); go.custom_minimum_size = Vector2(0, 74); v.add_child(go); click(go, func(): game.queue_match("ranked"))
	else:
		v.add_child(UIKit.wrap(L("需要至少 %d 位驾驶员和 %d 台机体才能参加排位赛（现在 %d / %d）" % [int(R.need.pilots), int(R.need.mechs), P.o.pilots.size(), P.o.mechs.size()], 16, Color("#ff9a6b")), 440))
	# 夺冠之路
	var rx := 520.0
	at(L("夺冠之路（打到分数自动领奖）", 20, Color("#ffe14d"), 4), Vector2(rx, 152))
	var sc := ScrollContainer.new(); sc.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED; at(sc, Vector2(rx, 186), Vector2(vs.x - rx - 24, vs.y - 290))
	var rl := vbox(6); sc.add_child(rl)
	for i in R.road.size():
		var need := int(R.road[i][0]); var got: bool = P.o.rank.road.has(i)
		var c := UIKit.card(Color("#1f5a3a") if got else Color("#272150"), Color("#123022") if got else Color("#15112c"), Color("#6dff8a") if got else Color("#4b4396"), 12)
		c.custom_minimum_size = Vector2(vs.x - rx - 44, 0)
		var h := hbox(12); c.add_child(h); h.add_child(L("%d 分" % need, 18, Color(str(R.tiers[P.rank_tier(need)].color)), 3)); h.add_child(mini_reward(R.road[i][1], 28))
		if got: h.add_child(L("已领取", 13, Color("#6dff8a")))
		rl.add_child(c)
	var lk = P.skin(R.legendSkin)
	var sh := hbox(10); at(sh, Vector2(rx, vs.y - 92))
	sh.add_child(UIKit.pill("shards", "%d / %d" % [int(P.o.shards), int(R.shardsNeed)], Color("#ffb43d")))
	if lk != null:
		sh.add_child(claim_btn("兑换「%s」" % lk.name, func(): show_items(P.road_skin(), "赛季传说皮肤"), int(P.o.shards) >= int(R.shardsNeed) and not P.o.skins.has(lk.id)))

# 排位开局：钻石起有禁用阶段（对面 AI 禁 1 位驾驶员 + 1 台机体）
func ranked_start() -> void:
	var R: Dictionary = D.econ.rank
	var t := P.rank_tier(int(P.o.rank.rp))
	var bans := {"pilot": "", "mech": ""}
	if t >= int(R.banFrom):
		var ps: Array = P.o.pilots.keys(); ps.sort_custom(func(a, b): return int(P.o.pilots[a].lv) > int(P.o.pilots[b].lv))
		bans.pilot = ps[0] if randf() < 0.5 else ps[randi() % ps.size()]
		bans.mech = P.o.mechs[randi() % P.o.mechs.size()]
		if bans.pilot == P.o.pilot or bans.mech == P.o.weapon or true:
			ban_popup(bans); return
	game.start_ranked(bans)

func ban_popup(bans: Dictionary) -> void:
	var v := make_popup(Vector2(900, 560))
	v.add_child(centered(L("禁用阶段", 32, Color("#ff6b5a"), 8)))
	var bh := hbox(20); bh.alignment = BoxContainer.ALIGNMENT_CENTER; v.add_child(bh)
	bh.add_child(L("对面禁用了：", 18, Color("#c9c5e6")))
	bh.add_child(mini_reward({"k": "pilot", "id": bans.pilot}, 48)); bh.add_child(mini_reward({"k": "mech", "id": bans.mech}, 48))
	var need_p: bool = P.o.pilot == bans.pilot; var need_m: bool = P.o.weapon == bans.mech
	v.add_child(centered(L("你的驾驶员 / 机体被禁了，换一个再开打" if need_p or need_m else "你的选择没有被禁用，可以直接开打", 16, Color("#ffe14d"))))
	var sel := {"pilot": P.o.pilot if not need_p else "", "mech": P.o.weapon if not need_m else ""}
	var g := GridContainer.new(); g.columns = 10; g.add_theme_constant_override("h_separation", 6); g.add_theme_constant_override("v_separation", 6); v.add_child(g)
	if need_p:
		for id in P.o.pilots:
			if id == bans.pilot: continue
			var c := UIKit.dark_card(true); c.pad = Vector4(3, 3, 3, 3); c.add_child(face(id, 60)); g.add_child(c)
			click(c, func(): sel.pilot = id; for x in g.get_children(): x.selected = x == c; x.queue_redraw())
	var g2 := GridContainer.new(); g2.columns = 6; g2.add_theme_constant_override("h_separation", 6); v.add_child(g2)
	if need_m:
		for id in P.o.mechs:
			if id == bans.mech: continue
			var c2 := UIKit.dark_card(true); c2.add_child(L(str(D.mechs[id].name), 14, Color.WHITE)); g2.add_child(c2)
			click(c2, func(): sel.mech = id; for x in g2.get_children(): x.selected = x == c2; x.queue_redraw())
	var go := UIKit.gold_button("开打！", 24); go.custom_minimum_size = Vector2(220, 60); go.size_flags_horizontal = Control.SIZE_SHRINK_CENTER; v.add_child(go)
	click(go, func():
		if sel.pilot == "" or sel.mech == "": toast("先选好驾驶员和机体"); return
		P.o.pilot = sel.pilot; P.o.weapon = sel.mech; P.save()
		close_popup(); game.start_ranked(bans))

# ---------------- 任务（每日 / 每周 + 任务线 + 叛将档案） ----------------
func page_tasklines() -> void:
	var order: Array = D.econ.tasklineOrder
	var sc := ScrollContainer.new(); sc.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED; at(sc, Vector2(24, 200), Vector2(vs.x - 48, vs.y - 216))
	var v := vbox(10); sc.add_child(v)
	# 叛将档案
	var S2: Dictionary = D.econ.story
	var sc0 := UIKit.card(Color("#3a5a8a"), Color("#16122e"), Color("#7ab8ff"), 16); sc0.custom_minimum_size = Vector2(vs.x - 70, 0); v.add_child(sc0)
	var sv := vbox(4); sc0.add_child(sv)
	sv.add_child(L("%s（%d / %d）" % [S2.name, P.story_done(), S2.steps.size()], 20, Color.WHITE, 4)); sv.add_child(UIKit.wrap(L(str(S2.desc), 13, Color("#c9c5e6")), vs.x - 120))
	var sh := hbox(10); sv.add_child(sh)
	for i in S2.steps.size():
		var q: Array = S2.steps[i]; var n := int(P.o.story.p[i])
		sh.add_child(L(("[完成] " if n >= int(q[1]) else "") + P.stat_name(q[0], q[1]) + " %d/%d" % [n, int(q[1])], 12, Color("#6dff8a") if n >= int(q[1]) else Color("#e6e2fa")))
	var rh := hbox(10); sv.add_child(rh)
	for R in S2.rewards:
		var got: bool = P.o.story.c.has(int(R[0]))
		rh.add_child(L("完成 %d 个：" % int(R[0]), 14, Color("#c9c5e6"))); rh.add_child(mini_reward(R[1], 30))
		if got: rh.add_child(L("已领取", 13, Color("#6dff8a")))
		else: rh.add_child(claim_btn("领取", func(): show_items(P.claim_story(int(R[0])), str(S2.name)), P.story_done() >= int(R[0])))
	for id in order:
		var Ld: Dictionary = D.econ.tasklines[id]; var st := P.task_state(id); var col := Color(str(Ld.color))
		var open := P.chapter_open(id)
		var c := UIKit.card(col.darkened(0.45), Color("#120f26"), col, 16); c.custom_minimum_size = Vector2(vs.x - 70, 0); c.dim = not open; v.add_child(c)
		var cv := vbox(5); c.add_child(cv)
		var hd := hbox(10); cv.add_child(hd)
		if Ld.has("pilot"): hd.add_child(face(Ld.pilot, 44, false))
		var hv := vbox(0); hd.add_child(hv)
		hv.add_child(L(str(Ld.name) + ("（第 %d 章）" % int(Ld.chapter) if Ld.has("chapter") else ""), 20, Color.WHITE, 4))
		hv.add_child(UIKit.wrap(L(str(Ld.desc) if open else "要先完成「%s」" % D.econ.tasklines[Ld.need].name, 13, Color("#c9c5e6")), vs.x - 170))
		if not open: continue
		for i in Ld.steps.size():
			var q: Array = Ld.steps[i]; var n := int(st.p[i]); var done := n >= int(q[1])
			var row := hbox(10); cv.add_child(row)
			var nl := L(("[完成] " if done else "") + P.stat_name(q[0], q[1]), 14, Color("#6dff8a") if done else Color.WHITE); nl.custom_minimum_size.x = 260; row.add_child(nl)
			row.add_child(UIKit.bar(float(n) / float(q[1]), 160, 8, col)); row.add_child(L("%d/%d" % [n, int(q[1])], 12, Color("#a8a4c8")))
			row.add_child(mini_reward(q[2], 26))
			if q.size() > 4:   # 章节台词
				var who: String = str(D.pilots[q[3]].name) if D.pilots.has(q[3]) else str(q[3])
				row.add_child(UIKit.wrap(L("%s：「%s」" % [who, q[4]], 12, Color("#ffe6f6")), vs.x - 820))
			if st.c[i]: row.add_child(L("已领取", 12, Color("#6dff8a")))
			else:
				var can: bool = done and (not Ld.has("chapter") or i == 0 or st.c[i - 1])
				row.add_child(claim_btn("领取", func(): show_items(P.claim_task(id, i), str(Ld.name)), can))

func stash_value() -> int: return P.stash_value()

func page_loot() -> void:
	var LT: Dictionary = D.loot
	var lw := 470.0
	var left := UIKit.card(Color("#ffcf4d").darkened(0.45), Color("#16122e"), Color("#ffcf4d"), 20); at(left, Vector2(24, 152), Vector2(lw, vs.y - 168))
	var v := vbox(10); left.add_child(v)
	v.add_child(L("灰城禁区 • 760×500 超大地图", 20, Color("#ffe14d"), 5))
	v.add_child(UIKit.wrap(L("6 支 3 人小队搜刮物资、互相争夺；在开放的撤离点里读条 %d 秒成功撤离，背包和安全箱里的东西进仓库。只有一条命，阵亡只保住安全箱。%s 搜索容器，%s 打开背包。" % [int(LT.extTime), Settings.key_name(game.settings.keys.interact), Settings.key_name(game.settings.keys.bag)], 13, Color("#e6e2fa")), lw - 40))
	var rh := hbox(8); v.add_child(rh)
	for rk in ["normal", "high"]:
		var on: bool = str(P.o.risk) == rk
		var c := UIKit.card(Color("#ff6ad5") if on else Color("#2e2760"), Color("#a63cff") if on else Color("#17132f"), Color("#ffc4ef") if on else Color("#4b4396"), 14, true)
		c.custom_minimum_size = Vector2(205, 70)
		var cv := vbox(0); c.add_child(cv); cv.add_child(L(str(LT.risks[rk].name), 18, Color.WHITE, 3)); cv.add_child(UIKit.wrap(L(str(LT.risks[rk].desc), 11, Color("#e6e2fa")), 185))
		click(c, func(): P.o.risk = rk; P.save(); refresh()); rh.add_child(c)
	if str(P.o.risk) == "high":
		v.add_child(L("带进场的装备（阵亡会丢）", 16, Color("#ffe14d")))
		var gg := GridContainer.new(); gg.columns = 2; gg.add_theme_constant_override("h_separation", 8); gg.add_theme_constant_override("v_separation", 6); v.add_child(gg)
		for gk in LT.gear:
			var G2: Dictionary = LT.gear[gk]; var n := int(P.o.gear.get(gk, 0)); var on2: bool = P.o.gearOn.has(gk)
			var c2 := UIKit.dark_card(true); c2.selected = on2; c2.custom_minimum_size = Vector2(205, 0)
			var cv2 := vbox(0); c2.add_child(cv2); cv2.add_child(L("%s x%d%s" % [G2.name, n, "（带上）" if on2 else ""], 15, Color.WHITE)); cv2.add_child(UIKit.wrap(L(str(G2.desc), 11, Color("#a8a4c8")), 185))
			var bh := hbox(6); cv2.add_child(bh); bh.add_child(UIKit.icon("coins", 18)); bh.add_child(L("%d 买一件 • 右边点卡片带上 / 取下" % int(G2.price), 11, Color("#ffd23f")))
			click(c2, func(): act(P.toggle_gear(gk) if n > 0 else P.buy_gear(gk), ("切换了 " if n > 0 else "买了 ") + str(G2.name)))
			gg.add_child(c2)
	var lvs := int(P.o.safeLv); var sd: Array = LT.safe[lvs]
	var sh := hbox(10); v.add_child(sh)
	sh.add_child(L("安全箱 %dx%d" % [int(sd[0]), int(sd[1])], 16, Color("#7af0ff")))
	if lvs < 3: sh.add_child(claim_btn("升级（%d 金币）" % int(LT.safeCost[lvs + 1]), func(): act(P.safe_up(), "安全箱升级了"), true))
	var R2: Dictionary = P.o.lootRec
	v.add_child(L("战绩：%d 次行动 • 撤离 %d 次 • 最高 %d • 累计 %d" % [int(R2.runs), int(R2.ex), int(R2.best), int(R2.total)], 13, Color("#c9c5e6")))
	var sp := Control.new(); sp.size_flags_vertical = Control.SIZE_EXPAND_FILL; sp.mouse_filter = Control.MOUSE_FILTER_IGNORE; v.add_child(sp)
	var go := UIKit.gold_button("进入禁区", 30); go.custom_minimum_size = Vector2(0, 70); v.add_child(go)
	click(go, func(): game.sfx.play("go"); game.queue_match("loot"))
	# 右边：仓库 / 交易行 / 本周排行
	var rx := 24 + lw + 16; var rw := vs.x - rx - 24
	tabs(Vector2(rx, 152), [["stash", "仓库"], ["market", "交易行"], ["board", "本周排行"]], loot_tab, func(k): loot_tab = k)
	var sc := ScrollContainer.new(); sc.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED; at(sc, Vector2(rx, 248), Vector2(rw, vs.y - 264))
	var lst := vbox(6); sc.add_child(lst)
	var top := hbox(10); at(top, Vector2(rx, 200))
	match loot_tab:
		"stash":
			top.add_child(L("仓库 • 总价值 %d" % P.stash_value(), 20, Color("#ffe14d"), 4))
			top.add_child(claim_btn("一键卖出（稀有及以下）", func(): show_items(P.sell_all(), "卖出物资"), not P.o.stash.is_empty()))
			if P.o.stash.is_empty(): lst.add_child(L("仓库是空的。去禁区里搜点好东西带出来吧！", 15, Color("#a8a4c8")))
			var keys: Array = P.o.stash.keys()
			keys.sort_custom(func(x, y): return int(LT.items[x].v) > int(LT.items[y].v))
			for k in keys:
				var it: Dictionary = LT.items[k]; var rc := Color(str(LT.rare[int(it.r)].c))
				var c3 := UIKit.card(rc.darkened(0.6), Color("#120f26"), rc.darkened(0.2), 12); c3.custom_minimum_size = Vector2(rw - 20, 0)
				var h3 := hbox(10); c3.add_child(h3)
				var nl := L("%s x%d" % [it.name, int(P.o.stash[k])], 16, rc, 3); nl.custom_minimum_size.x = 220; h3.add_child(nl)
				h3.add_child(L("%s • %dx%d • 价值 %d" % [LT.rare[int(it.r)].name, int(it.w), int(it.h), int(it.v)], 13, Color("#c9c5e6")))
				var spc := Control.new(); spc.size_flags_horizontal = Control.SIZE_EXPAND_FILL; spc.mouse_filter = Control.MOUSE_FILTER_IGNORE; h3.add_child(spc)
				if it.has("ex"):
					var exs := ""
					for ck in it.ex: exs += "%s %d " % [P.cur_name(ck), int(it.ex[ck])]
					h3.add_child(claim_btn("兑换 " + exs, func(): show_items(P.ex_loot(k), "兑换"), true))
				h3.add_child(claim_btn("回收 %d" % (int(it.v) / 10), func(): act(P.sell_loot(k), "卖出了"), true))
				lst.add_child(c3)
		"market":
			var q0 := P.market_price(LT.items.keys()[0])
			var left_s: int = max(0, int(q0.next) - int(Time.get_unix_time_from_system()))
			top.add_child(L("交易行 • 价格每小时浮动，所有玩家看到的一样", 18, Color("#ffe14d"), 4))
			top.add_child(L("%d 分钟后换价" % (left_s / 60 + 1), 14, Color("#7af0ff")))
			var keys2: Array = LT.items.keys()
			keys2.sort_custom(func(x, y): return int(LT.items[x].r) > int(LT.items[y].r) or (int(LT.items[x].r) == int(LT.items[y].r) and int(LT.items[x].v) > int(LT.items[y].v)))
			for k in keys2:
				var it: Dictionary = LT.items[k]; var rc := Color(str(LT.rare[int(it.r)].c)); var q := P.market_price(k)
				var c4 := UIKit.card(rc.darkened(0.65), Color("#120f26"), rc.darkened(0.25), 12); c4.custom_minimum_size = Vector2(rw - 20, 0)
				var h4 := hbox(10); c4.add_child(h4)
				var nl2 := L(str(it.name), 16, rc, 3); nl2.custom_minimum_size.x = 170; h4.add_child(nl2)
				var tr: float = float(q.trend)
				var tl := L(("涨 %+d%%" if tr >= 0 else "跌 %d%%") % int(round(tr * 100)), 13, Color("#6dff8a") if tr >= 0 else Color("#ff6b5a")); tl.custom_minimum_size.x = 70; h4.add_child(tl)
				var pl := L("卖 %d" % int(q.sell) + ("   买 %d" % int(q.buy) if int(q.buy) > 0 else "   不出售"), 14, Color("#ffd23f")); pl.custom_minimum_size.x = 150; h4.add_child(pl)
				h4.add_child(L("持有 %d" % int(P.o.stash.get(k, 0)), 13, Color("#c9c5e6")))
				var spc2 := Control.new(); spc2.size_flags_horizontal = Control.SIZE_EXPAND_FILL; spc2.mouse_filter = Control.MOUSE_FILTER_IGNORE; h4.add_child(spc2)
				h4.add_child(claim_btn("卖出", func(): act(P.mkt_sell(k), "卖出了 " + str(it.name)), int(P.o.stash.get(k, 0)) > 0))
				if int(q.buy) > 0: h4.add_child(claim_btn("买入", func(): act(P.mkt_buy(k), "买入了 " + str(it.name)), int(P.o.coins) >= int(q.buy)))
				lst.add_child(c4)
		"board":
			top.add_child(L("本周撤离价值排行（每周一换榜）", 18, Color("#ffe14d"), 4))
			var rows := P.loot_board()
			for i in rows.size():
				var r: Dictionary = rows[i]
				var me: bool = r.get("me", false)
				var cl: Color = [Color("#ffd23f"), Color("#cfd8e2"), Color("#e09a5a")][i] if i < 3 else Color("#7a70d0")
				var c5 := UIKit.card(Color("#5a2a8a") if me else cl.darkened(0.7), Color("#120f26"), Color("#ff9ad6") if me else cl.darkened(0.2), 12); c5.custom_minimum_size = Vector2(rw - 20, 0)
				var h5 := hbox(14); c5.add_child(h5)
				var rk := L("#%d" % (i + 1), 20, cl, 3); rk.custom_minimum_size.x = 60; h5.add_child(rk)
				var nm := L(str(r.name), 17, Color("#ffe14d") if me else Color.WHITE); nm.custom_minimum_size.x = 260; h5.add_child(nm)
				h5.add_child(L("单次撤离 %d" % int(r.v), 16, Color("#ffd23f")))
				lst.add_child(c5)


# ---------------- 局域网联机 ----------------
var lan_ip := "192.168."
var lan_name := ""

func page_lan() -> void:
	var N: Net = game.net
	var w := 520.0
	var card := UIKit.dark_card(); at(card, Vector2(24, 152), Vector2(w, vs.y - 168))
	var v := vbox(10); card.add_child(v)
	v.add_child(UIKit.wrap(L("同一个 Wi-Fi / 局域网里的电脑可以一起玩：一个人开房，其他人输入房主的 IP 加入。不够的位置由 AI 补上。端口 %d（第一次开房时 Windows 防火墙可能会询问，选「允许」）。搜刮撤离暂时只能单机玩。" % Net.PORT, 14, Color("#e6e2fa")), w - 40))
	if lan_name == "": lan_name = str(P.o.name) if str(P.o.name) != "" else "驾驶员%d" % (randi() % 900 + 100)
	var nh := hbox(10); v.add_child(nh); nh.add_child(L("名字", 17, Color.WHITE))
	var ne := LineEdit.new(); ne.text = lan_name; ne.max_length = 12; ne.custom_minimum_size = Vector2(240, 40); ne.text_changed.connect(func(t): lan_name = t); nh.add_child(ne)
	var info := func() -> Dictionary: return {"name": lan_name.strip_edges() if lan_name.strip_edges() != "" else "驾驶员", "pilot": P.o.pilot, "weapon": P.o.weapon, "power": P.power(P.o.pilot)}
	if N.role == "":
		var hb := UIKit.gold_button("开房（我当房主）", 22); hb.custom_minimum_size = Vector2(0, 60); v.add_child(hb)
		click(hb, func():
			var err := N.host(info.call())
			if err != "": toast(err)
			refresh())
		var jh := hbox(10); v.add_child(jh); jh.add_child(L("房主 IP", 17, Color.WHITE))
		var ie := LineEdit.new(); ie.text = lan_ip; ie.custom_minimum_size = Vector2(220, 40); ie.text_changed.connect(func(t): lan_ip = t); jh.add_child(ie)
		var jb := UIKit.pink_button("加入", 20); jb.custom_minimum_size = Vector2(110, 44); jh.add_child(jb)
		click(jb, func():
			var err := N.join(lan_ip, info.call())
			if err != "": toast(err)
			refresh())
		return
	if N.role == "host":
		var ips := Net.lan_ips()
		v.add_child(L("你是房主 • 让朋友输入：" + (", ".join(ips) if not ips.is_empty() else "（没找到局域网 IP）"), 17, Color("#6dff8a")))
		var mh := hbox(10); v.add_child(mh); mh.add_child(L("模式", 16, Color.WHITE))
		var mo := OptionButton.new(); mo.custom_minimum_size = Vector2(200, 40)
		for i in D.modeOrder.size():
			mo.add_item(str(D.modes[D.modeOrder[i]].name), i)
			if D.modeOrder[i] == N.room.mode: mo.select(i)
		mo.item_selected.connect(func(k): N.room.mode = D.modeOrder[k]; N.sync_room()); mh.add_child(mo)
		var ob := OptionButton.new(); ob.custom_minimum_size = Vector2(160, 40); ob.add_item("随机地图", 0)
		for i in D.maps.size(): ob.add_item(str(D.maps[i].name), i + 1)
		ob.select(int(N.room.map) + 1); ob.item_selected.connect(func(k): N.room.map = k - 1; N.sync_room()); mh.add_child(ob)
		var go := UIKit.gold_button("开始对战", 26); go.custom_minimum_size = Vector2(0, 64); v.add_child(go)
		click(go, func():
			game.sel_mode = N.room.mode; game.sel_map = int(N.room.map); game.loot_risk = "normal"
			game.start_match(P.o.pilot, P.o.weapon))
	else:
		v.add_child(L("已加入房间，等房主开始…… 模式：%s" % D.modes.get(N.room.mode, {"name": N.room.mode}).name, 17, Color("#ffe14d")))
	var lb := UIKit.flat_button("离开房间", 16); lb.custom_minimum_size = Vector2(140, 44); v.add_child(lb)
	click(lb, func(): N.leave(); refresh())
	# 房间里的人
	var rx := 24 + w + 16
	at(L("房间里的玩家（%d / %d）" % [N.room.players.size(), Net.MAX_PEERS + 1], 20, Color("#ffe14d"), 4), Vector2(rx, 152))
	var lst := vbox(8); at(lst, Vector2(rx, 190))
	for rp in N.room.players:
		var c := UIKit.dark_card(); c.custom_minimum_size = Vector2(vs.x - rx - 24, 0)
		var h := hbox(10); c.add_child(h)
		if D.pilots.has(str(rp.pilot)): h.add_child(face(str(rp.pilot), 44, false))
		var cv := vbox(0); h.add_child(cv)
		cv.add_child(L(str(rp.name) + ("（房主）" if int(rp.peer) == 1 else ""), 18, Color.WHITE))
		cv.add_child(L("%s • %s • Lv.%d" % [D.pilots.get(str(rp.pilot), {"name": "?"}).name, D.mechs.get(str(rp.weapon), {"name": "?"}).name, int(rp.get("power", {}).get("lv", 1))], 13, Color("#a8a4c8")))
		lst.add_child(c)

# ================= 账号（和网页版通用，见 account.gd）=================
var acc_name := ""
var acc_pass := ""
var acc_code := ""
var acc_server := ""
var acc_busy := false

func _acc_btn(text: String, kind: String, f: Callable, w := 200.0) -> GCard:
	var b: GCard = UIKit.gold_button(text, 17) if kind == "gold" else (UIKit.pink_button(text, 17) if kind == "pink" else UIKit.flat_button(text, 16))
	b.custom_minimum_size = Vector2(w, 46); click(b, f); return b

func _acc_field(parent: Control, label: String, val: String, secret: bool, setter: Callable) -> LineEdit:
	var h := hbox(12); h.alignment = BoxContainer.ALIGNMENT_CENTER; parent.add_child(h)
	var l := L(label, 18, Color.WHITE); l.custom_minimum_size.x = 110; h.add_child(l)
	var e := LineEdit.new(); e.text = val; e.secret = secret; e.custom_minimum_size = Vector2(340, 42); e.text_changed.connect(setter); h.add_child(e)
	return e

func account_popup() -> void:
	var A: Accounts = game.accounts
	var v := make_popup(Vector2(760, 470))
	v.alignment = BoxContainer.ALIGNMENT_BEGIN
	v.add_child(centered(L("账号", 32, Color("#ffe14d"), 8)))
	var cur := A.current()
	var who := "游客（进度只存在这台电脑的游客存档里）"
	if cur != "": who = "账号「%s」" % A.current_name() + ("（在线账号的电脑存档）" if A.is_online(cur) else "（本机账号，和网页版通用）")
	v.add_child(centered(L("当前：" + who, 18, Color("#7af0ff"), 3)))
	v.add_child(centered(UIKit.wrap(L("账号格式和网页版完全一样：网页版导出的转移码可以直接导进来，用原来的密码登录；电脑版导出的转移码也能导回网页版继续玩。", 14, Color("#c8c4e8")), 680)))
	var g := GridContainer.new(); g.columns = 3; g.add_theme_constant_override("h_separation", 14); g.add_theme_constant_override("v_separation", 12); g.size_flags_horizontal = Control.SIZE_SHRINK_CENTER; v.add_child(g)
	g.add_child(_acc_btn("登录", "gold", func(): account_form("login")))
	g.add_child(_acc_btn("注册新账号", "gold", func(): account_form("register")))
	g.add_child(_acc_btn("导入转移码", "pink", func(): account_form("import")))
	g.add_child(_acc_btn("导出转移码", "pink", func(): account_form("export")) if cur != "" else _acc_btn("导出转移码", "flat", func(): toast("先登录或注册账号")))
	g.add_child(_acc_btn("在线账号（服务器）", "flat", func(): account_form("online")))
	g.add_child(_acc_btn("退出登录" if cur != "" else "已经是游客", "flat", func():
		if A.current() == "": return
		A.logout(); game.switch_account(); toast("已退出，现在是游客")))
	var accs := A.list()
	if accs.size() > 0:
		v.add_child(centered(L("这台电脑上的账号（点一下切换，需要密码）", 15, Color("#a8a4c8"))))
		var hl := HFlowContainer.new(); hl.alignment = FlowContainer.ALIGNMENT_CENTER; hl.add_theme_constant_override("h_separation", 8); hl.add_theme_constant_override("v_separation", 8); v.add_child(hl)
		for a in accs:
			var c := UIKit.card(Color("#ff6ad5") if a.key == cur else Color("#2e2760"), Color("#a63cff") if a.key == cur else Color("#17132f"), Color("#ffc4ef") if a.key == cur else Color("#4b4396"), 12, true)
			c.pad = Vector4(14, 6, 14, 6); c.add_child(L(str(a.name) + (" (在线)" if a.online else ""), 15, Color.WHITE, 3)); hl.add_child(c)
			click(c, func(): acc_name = str(a.name); acc_pass = ""; account_form("login"))
	var ok := UIKit.flat_button("关闭", 18); ok.custom_minimum_size = Vector2(160, 46); ok.size_flags_horizontal = Control.SIZE_SHRINK_CENTER; v.add_child(ok); click(ok, func(): close_popup())

func account_form(kind: String) -> void:
	var A: Accounts = game.accounts
	var titles := {"login": "登录本机账号", "register": "注册新账号", "import": "导入转移码", "export": "导出转移码", "online": "在线账号"}
	var v := make_popup(Vector2(760, 520))
	v.alignment = BoxContainer.ALIGNMENT_BEGIN
	v.add_child(centered(L(titles[kind], 30, Color("#ffe14d"), 8)))
	var msg := L("", 16, Color("#ff9a8a")); msg.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	var bh := hbox(14); bh.alignment = BoxContainer.ALIGNMENT_CENTER
	var back := _acc_btn("返回", "flat", func(): account_popup(), 140)
	match kind:
		"login", "register":
			if kind == "register": v.add_child(centered(UIKit.wrap(L("新账号会带上你现在的进度（%s）。" % ("游客进度" if A.current() == "" else "账号「%s」的进度" % A.current_name()), 15, Color("#c8c4e8")), 640)))
			else: v.add_child(centered(UIKit.wrap(L("从网页版导入的账号用网页版的密码登录。", 15, Color("#c8c4e8")), 640)))
			_acc_field(v, "账号名", acc_name, false, func(t): acc_name = t)
			_acc_field(v, "密码", acc_pass, true, func(t): acc_pass = t)
			bh.add_child(back)
			bh.add_child(_acc_btn("登录" if kind == "login" else "注册", "gold", func():
				var r: Dictionary = A.login(acc_name, acc_pass) if kind == "login" else A.register(acc_name, acc_pass, P.o)
				if not r.ok: msg.text = str(r.err); return
				acc_pass = ""; game.switch_account(); toast("欢迎回来，%s！" % A.current_name() if kind == "login" else "注册成功：%s" % A.current_name()), 160))
		"import":
			v.add_child(centered(UIKit.wrap(L("在网页版或安卓版打开「账号 → 导出转移码」，复制整段 GBACC1 开头的码，粘贴到下面。导入后用原来的密码登录。", 15, Color("#c8c4e8")), 680)))
			var te := TextEdit.new(); te.text = acc_code; te.custom_minimum_size = Vector2(680, 160); te.wrap_mode = TextEdit.LINE_WRAPPING_BOUNDARY; te.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
			te.text_changed.connect(func(): acc_code = te.text); v.add_child(te)
			bh.add_child(back)
			bh.add_child(_acc_btn("粘贴", "flat", func(): te.text = DisplayServer.clipboard_get(); acc_code = te.text, 120))
			var do_import := func(overwrite: bool) -> void:
				var r: Dictionary = A.import_code(acc_code, overwrite, D)
				if r.get("exists", false):
					msg.text = "这台电脑上已经有账号「%s」了，再点「覆盖导入」会用转移码里的进度替换它" % r.name; return
				if not r.ok: msg.text = str(r.err); return
				acc_code = ""; acc_name = str(r.name); acc_pass = ""
				toast("导入成功：%s%s，输入密码登录" % [r.name, "（进度版本太老，从新手开始）" if r.get("fresh", false) else ""])
				account_form("login")
			bh.add_child(_acc_btn("导入", "gold", func(): do_import.call(false), 140))
			bh.add_child(_acc_btn("覆盖导入", "pink", func(): do_import.call(true), 140))
		"export":
			P.save()
			var code := A.export_code(A.current(), P.o, D)
			v.add_child(centered(UIKit.wrap(L("把这段码复制到网页版或安卓版的「账号 → 导入转移码」，用这个账号的密码登录就能接着玩。转移码里有你的进度，不要发给别人。", 15, Color("#c8c4e8")), 680)))
			var te := TextEdit.new(); te.text = code; te.editable = false; te.custom_minimum_size = Vector2(680, 180); te.wrap_mode = TextEdit.LINE_WRAPPING_BOUNDARY; te.size_flags_horizontal = Control.SIZE_SHRINK_CENTER; v.add_child(te)
			bh.add_child(back)
			bh.add_child(_acc_btn("复制", "gold", func(): DisplayServer.clipboard_set(code); toast("已复制转移码"), 160))
		"online":
			if acc_server == "": acc_server = str(A.data.get("server", ""))
			v.add_child(centered(UIKit.wrap(L("连接朋友或自己用 node server.js 开的游戏服务器（例如 192.168.1.5:3000），登录在线账号后把服务器上的进度下载到这台电脑。在线账号的奖励由服务器结算，电脑版单机打的局不会传回服务器。", 14, Color("#c8c4e8")), 680)))
			_acc_field(v, "服务器", acc_server, false, func(t): acc_server = t)
			_acc_field(v, "账号名", acc_name, false, func(t): acc_name = t)
			_acc_field(v, "密码", acc_pass, true, func(t): acc_pass = t)
			bh.add_child(back)
			var go := func(reg: bool) -> void:
				if acc_busy: return
				acc_busy = true; msg.add_theme_color_override("font_color", Color("#7af0ff")); msg.text = "正在连接……"
				var r: Dictionary = await A.online_pull(get_tree(), acc_server, acc_name, acc_pass, reg, D)
				acc_busy = false
				if not is_instance_valid(msg): return
				if not r.ok: msg.add_theme_color_override("font_color", Color("#ff9a8a")); msg.text = str(r.err); return
				acc_pass = ""; game.switch_account(); toast("已登录在线账号：%s" % A.current_name())
			bh.add_child(_acc_btn("登录", "gold", func(): go.call(false), 140))
			bh.add_child(_acc_btn("注册", "pink", func(): go.call(true), 140))
	v.add_child(msg)
	v.add_child(bh)

# ================= 个人资料：头像 / 头像框 / 称号 / 签名 / 战绩 / 展示框 =================
const SHOW_STYLES := {"": ["默认", Color("#2e2760"), Color("#120e26"), Color("#7a70d0"), ""], "neon": ["霓虹", Color("#0f3a40"), Color("#071418"), Color("#2ef0c8"), "fr_neon"],
	"gold": ["黄金", Color("#6a4a10"), Color("#1a1206"), Color("#ffc531"), "fr_gold"], "flame": ["烈焰", Color("#6a1a10"), Color("#1a0806"), Color("#ff8a1f"), "fr_flame"],
	"master": ["大师", Color("#3a1a6a"), Color("#100620"), Color("#ff6ec4"), "fr_master"], "merc": ["沙鹰", Color("#4a3a20"), Color("#14100a"), Color("#e0a030"), "fr_merc"]}

func page_profile() -> void:
	var lw := 380.0
	var lc := UIKit.dark_card(); at(lc, Vector2(16, 152), Vector2(lw, vs.y - 168))
	var lv := vbox(10); lv.alignment = BoxContainer.ALIGNMENT_BEGIN; lc.add_child(lv)
	var avb := UIKit.avatar(P.avatar_path(), P.frame_key(), 150, Color(str(D.pilots[P.o.pilot].accent)) if str(P.o.pilot) != "" else Color.WHITE)
	avb.size_flags_horizontal = Control.SIZE_SHRINK_CENTER; lv.add_child(avb)
	var nh := hbox(8); nh.alignment = BoxContainer.ALIGNMENT_CENTER; lv.add_child(nh)
	nh.add_child(L(P.display_name(), 26, Color.WHITE, 5))
	var rn := UIKit.flat_button("改名", 13); rn.custom_minimum_size = Vector2(56, 30); nh.add_child(rn); click(rn, func(): rename_popup())
	var th := hbox(8); th.alignment = BoxContainer.ALIGNMENT_CENTER; lv.add_child(th)
	th.add_child(UIKit.chip(P.title_name(), Color("#ffcf4d"), 14)); th.add_child(UIKit.chip("Lv.%d" % P.level(), Color("#7af0ff"), 14))
	th.add_child(UIKit.chip(str(D.econ.rank.tiers[P.rank_tier(int(P.o.rank.rp))].name), Color("#ff9ad6"), 14))
	var sg := UIKit.wrap(L("「%s」" % P.o.sign if str(P.o.sign) != "" else "还没有个性签名，点下面的按钮写一句吧", 15, Color("#d8d4f0") if str(P.o.sign) != "" else Color("#8f8ab8")), lw - 40)
	sg.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER; lv.add_child(sg)
	var A: Accounts = game.accounts
	var al := L("账号：" + (A.current_name() if A.current() != "" else "游客（没有登录）"), 13, Color("#a8a4c8")); al.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER; lv.add_child(al)
	var bg := GridContainer.new(); bg.columns = 2; bg.add_theme_constant_override("h_separation", 10); bg.add_theme_constant_override("v_separation", 10); bg.size_flags_horizontal = Control.SIZE_SHRINK_CENTER; lv.add_child(bg)
	for b in [["更换头像", func(): avatar_popup()], ["更换头像框", func(): frame_popup()], ["更换称号", func(): title_popup()], ["个性签名", func(): sign_popup()], ["账号管理", func(): account_popup()], ["展示框样式", func(): show_style_popup()]]:
		var c := UIKit.flat_button(b[0], 16); c.custom_minimum_size = Vector2(160, 44); bg.add_child(c); click(c, b[1])
	# 中间：战绩
	var mx := 16 + lw + 16; var mw := (vs.x - mx - 16) * 0.48
	var mc := UIKit.dark_card(); at(mc, Vector2(mx, 152), Vector2(mw, vs.y - 168))
	var mv := vbox(10); mc.add_child(mv)
	mv.add_child(L("生涯战绩", 22, Color("#ffe14d"), 4))
	var sgd := GridContainer.new(); sgd.columns = 3; sgd.add_theme_constant_override("h_separation", 8); sgd.add_theme_constant_override("v_separation", 8); mv.add_child(sgd)
	for st in P.stats():
		var c := UIKit.card(Color("#2e2760"), Color("#16122e"), Color("#4b4396"), 12); c.custom_minimum_size = Vector2((mw - 60) / 3, 62)
		var v := vbox(0); c.add_child(v)
		var a := L(st[1], 22, Color.WHITE, 3); a.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER; v.add_child(a)
		var b2 := L(st[0], 13, Color("#a8a4c8")); b2.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER; v.add_child(b2)
		sgd.add_child(c)
	mv.add_child(L("结算评级", 18, Color("#ffe14d"), 3))
	var bh := hbox(8); mv.add_child(bh)
	for i in range(4, -1, -1):
		var B: Dictionary = D.badges[i]
		var c2 := UIKit.card(Color(str(B.c)).darkened(0.5), Color("#120e26"), Color(str(B.c)), 12); c2.custom_minimum_size = Vector2((mw - 72) / 5, 64)
		var v2 := vbox(0); c2.add_child(v2)
		var n := L(str(P.o.badges[i]), 22, Color(str(B.c)), 3); n.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER; v2.add_child(n)
		var nm := L(str(B.name), 12, Color.WHITE); nm.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER; v2.add_child(nm)
		bh.add_child(c2)
	# 右边：展示框（3 个位置，可以放驾驶员 / 机体 / 皮肤）
	var rx := mx + mw + 16; var rw := vs.x - rx - 16
	var ST: Array = SHOW_STYLES.get(str(P.o.showBg), SHOW_STYLES[""])
	var rc := UIKit.card(ST[1], ST[2], ST[3], 16); at(rc, Vector2(rx, 152), Vector2(rw, vs.y - 168))
	var rv := vbox(10); rc.add_child(rv)
	var rh := hbox(8); rv.add_child(rh); rh.add_child(L("展示框", 22, Color("#ffe14d"), 4)); rh.add_child(L("点一格换展示的内容", 13, Color("#c8c4e8")))
	var sh := hbox(10); rv.add_child(sh)
	var cw := (rw - 48) / 3.0
	for i in 3:
		var it: Dictionary = P.o.show[i] if i < P.o.show.size() and typeof(P.o.show[i]) == TYPE_DICTIONARY else {}
		var c := UIKit.card(ST[3].darkened(0.55), Color(0, 0, 0, 0.5), ST[3], 14, true); c.custom_minimum_size = Vector2(cw, vs.y - 260); c.pad = Vector4(6, 6, 6, 6)
		var v := vbox(4); v.alignment = BoxContainer.ALIGNMENT_CENTER; c.add_child(v)
		var k := str(it.get("k", ""))
		if k == "pilot" and P.has_pilot(str(it.id)):
			var pid := str(it.id)
			v.add_child(UIKit.image(portrait_path(pid), Vector2(cw - 12, vs.y - 360), true))
			v.add_child(centered(L(str(D.pilots[pid].name), 18, Color.WHITE, 4)))
			var q: Dictionary = P.o.pilots[pid]
			v.add_child(centered(L("Lv.%d  突破 %s" % [int(q.lv), ["0", "I", "II"][int(q.bt)]], 13, Color("#ffcf4d"))))
		elif k == "mech" and P.has_mech(str(it.id)):
			v.add_child(cc(game.thumbs.rect(str(it.id), minf(cw - 16, 170))))
			v.add_child(centered(L(str(D.mechs[it.id].name), 18, Color.WHITE, 4)))
			v.add_child(centered(L(game.role_name(str(it.id)), 13, Color("#7af0ff"))))
		elif k == "skin" and P.o.skins.has(str(it.id)):
			var K = P.skin(str(it.id))
			if K.kind == "pilot": v.add_child(UIKit.image("res://art/portraits/%s.png" % K.id, Vector2(cw - 12, vs.y - 360), true))
			elif K.kind == "avatar": v.add_child(cc(UIKit.image("res://art/avatars/%s.png" % K.avatar, Vector2(120, 120))))
			elif K.kind == "frame": v.add_child(cc(UIKit.avatar(P.avatar_path(), str(K.frame), 120)))
			else: v.add_child(cc(UIKit.icon("gems", 80)))
			v.add_child(centered(L(str(K.name), 17, Color.WHITE, 4)))
			var R = D.rare[int(K.rare)]
			if R != null: v.add_child(centered(L(str(R.name), 13, Color(str(R.c)))))
		else:
			v.add_child(centered(L("+", 60, Color(1, 1, 1, 0.4))))
			v.add_child(centered(L("空展示位", 15, Color("#c8c4e8"))))
		click(c, func(): show_pick_popup(i))
		sh.add_child(c)

func _choice_grid(v: VBoxContainer, cols: int) -> GridContainer:
	var sc := ScrollContainer.new(); sc.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED; sc.custom_minimum_size = Vector2(820, 340); sc.size_flags_horizontal = Control.SIZE_SHRINK_CENTER; v.add_child(sc)
	var g := GridContainer.new(); g.columns = cols; g.add_theme_constant_override("h_separation", 10); g.add_theme_constant_override("v_separation", 10); sc.add_child(g)
	return g

func _done_btn(v: VBoxContainer) -> void:
	var ok := UIKit.gold_button("好的", 20); ok.custom_minimum_size = Vector2(160, 50); ok.size_flags_horizontal = Control.SIZE_SHRINK_CENTER; v.add_child(ok); click(ok, func(): close_popup())

func avatar_popup() -> void:
	var v := make_popup(Vector2(880, 520)); v.alignment = BoxContainer.ALIGNMENT_BEGIN
	v.add_child(centered(L("更换头像", 30, Color("#ffe14d"), 8)))
	v.add_child(centered(L("可以用任何已拥有的驾驶员头像（穿了皮肤就显示皮肤），或者头像皮肤", 14, Color("#c8c4e8"))))
	var g := _choice_grid(v, 9)
	var cur_av := str(P.o.wear.get("avatar", ""))
	for K in D.econ.skins.filter(func(k): return k.kind == "avatar" and P.o.skins.has(k.id)):
		var c := UIKit.card(Color("#3a2a80"), Color("#120e26"), Color("#ffe14d") if cur_av == K.id else Color("#4b4396"), 12, true); c.pad = Vector4(4, 4, 4, 4); c.selected = cur_av == K.id
		var cv := vbox(2); c.add_child(cv); cv.add_child(UIKit.avatar("res://art/avatars/%s.png" % K.avatar, "", 72)); cv.add_child(centered(L(str(K.name), 11, Color.WHITE)))
		click(c, func(): P.o.wear.avatar = K.id; P.save(); avatar_popup(); refresh_keep()); g.add_child(c)
	for pid in D.pilotOrder:
		if not P.has_pilot(pid): continue
		var on: bool = cur_av == "" and (str(P.o.face) == pid or (str(P.o.face) == "" and pid == str(P.o.pilot)))
		var c := UIKit.card(Color("#2e2760"), Color("#120e26"), Color("#ffe14d") if on else Color("#4b4396"), 12, true); c.pad = Vector4(4, 4, 4, 4); c.selected = on
		var cv := vbox(2); c.add_child(cv); cv.add_child(UIKit.avatar("res://art/faces/%s.png" % P.art_id(pid), "", 72)); cv.add_child(centered(L(str(D.pilots[pid].name), 11, Color.WHITE)))
		click(c, func(): P.o.wear.avatar = ""; P.o.face = pid; P.save(); avatar_popup(); refresh_keep()); g.add_child(c)
	_done_btn(v)

func frame_popup() -> void:
	var v := make_popup(Vector2(880, 520)); v.alignment = BoxContainer.ALIGNMENT_BEGIN
	v.add_child(centered(L("更换头像框", 30, Color("#ffe14d"), 8)))
	v.add_child(centered(L("头像框来自皮肤商店、通行证、活动和排位奖励", 14, Color("#c8c4e8"))))
	var g := _choice_grid(v, 6)
	var cur := str(P.o.wear.get("frame", ""))
	var opts: Array = [{"id": "", "frame": "", "name": "不戴头像框", "rare": 0}]
	for K in D.econ.skins: if K.kind == "frame": opts.append(K)
	for K in opts:
		var own: bool = K.id == "" or P.o.skins.has(K.id)
		var on: bool = cur == K.id
		var c := UIKit.card(Color("#2e2760"), Color("#120e26"), Color("#ffe14d") if on else Color("#4b4396"), 12, own); c.pad = Vector4(6, 6, 6, 6); c.selected = on; c.dim = not own
		var cv := vbox(2); c.add_child(cv)
		cv.add_child(cc(UIKit.avatar(P.avatar_path(), str(K.frame), 96)))
		cv.add_child(centered(L(str(K.name), 13, Color.WHITE)))
		var R = D.rare[int(K.rare)] if int(K.rare) > 0 else null
		cv.add_child(centered(L(("未拥有" if not own else (str(R.name) if R != null else "")), 11, Color("#ff8a8a") if not own else (Color(str(R.c)) if R != null else Color.WHITE))))
		if own: click(c, func(): P.o.wear.frame = K.id; P.save(); frame_popup(); refresh_keep())
		g.add_child(c)
	_done_btn(v)

func title_popup() -> void:
	var v := make_popup(Vector2(880, 520)); v.alignment = BoxContainer.ALIGNMENT_BEGIN
	v.add_child(centered(L("更换称号", 30, Color("#ffe14d"), 8)))
	var g := _choice_grid(v, 3)
	for T in P.titles():
		var on: bool = str(P.o.title) == T.id or (str(P.o.title) == "" and T.id == "rookie")
		var c := UIKit.card(Color("#3a2a80") if T.ok else Color("#1e1a3a"), Color("#120e26"), Color("#ffe14d") if on else Color("#4b4396"), 12, T.ok); c.custom_minimum_size = Vector2(250, 64); c.selected = on; c.dim = not T.ok
		var cv := vbox(0); c.add_child(cv)
		cv.add_child(L(str(T.name), 18, Color("#ffcf4d") if T.ok else Color("#8f8ab8"), 3)); cv.add_child(L(("已解锁 • " if T.ok else "未解锁 • ") + str(T.how), 11, Color("#c8c4e8")))
		if T.ok: click(c, func(): P.o.title = T.id; P.save(); title_popup(); refresh_keep())
		g.add_child(c)
	_done_btn(v)

func show_style_popup() -> void:
	var v := make_popup(Vector2(760, 380)); v.alignment = BoxContainer.ALIGNMENT_BEGIN
	v.add_child(centered(L("展示框样式", 30, Color("#ffe14d"), 8)))
	v.add_child(centered(L("拥有对应的头像框就能解锁同款展示框样式", 14, Color("#c8c4e8"))))
	var g := GridContainer.new(); g.columns = 3; g.add_theme_constant_override("h_separation", 12); g.add_theme_constant_override("v_separation", 12); g.size_flags_horizontal = Control.SIZE_SHRINK_CENTER; v.add_child(g)
	for k in SHOW_STYLES:
		var ST: Array = SHOW_STYLES[k]
		var own: bool = ST[4] == "" or P.o.skins.has(ST[4])
		var c := UIKit.card(ST[1], ST[2], Color("#ffe14d") if str(P.o.showBg) == k else ST[3], 14, own); c.custom_minimum_size = Vector2(200, 70); c.dim = not own; c.selected = str(P.o.showBg) == k
		c.add_child(centered(L(ST[0] + ("" if own else "（未解锁）"), 18, Color.WHITE, 4)))
		if own: click(c, func(): P.o.showBg = k; P.save(); close_popup(); refresh_keep())
		g.add_child(c)
	_done_btn(v)

func show_pick_popup(slot: int) -> void:
	var v := make_popup(Vector2(900, 540)); v.alignment = BoxContainer.ALIGNMENT_BEGIN
	v.add_child(centered(L("展示位 %d" % (slot + 1), 28, Color("#ffe14d"), 8)))
	var th := hbox(8); th.alignment = BoxContainer.ALIGNMENT_CENTER; v.add_child(th)
	for t in [["pilot", "驾驶员"], ["mech", "机体"], ["skin", "皮肤"]]:
		var on: bool = show_tab == t[0]
		var c := UIKit.card(Color("#ff6ad5") if on else Color("#2e2760"), Color("#a63cff") if on else Color("#17132f"), Color("#ffc4ef") if on else Color("#4b4396"), 12, true)
		c.pad = Vector4(16, 4, 16, 4); c.add_child(L(t[1], 16, Color.WHITE, 3)); th.add_child(c); click(c, func(): show_tab = t[0]; show_pick_popup(slot))
	var g := _choice_grid(v, 8)
	var add := func(item: Dictionary, tex_ctl: Control, name: String) -> void:
		var c := UIKit.card(Color("#2e2760"), Color("#120e26"), Color("#4b4396"), 12, true); c.pad = Vector4(4, 4, 4, 4)
		var cv := vbox(2); c.add_child(cv); cv.add_child(tex_ctl); cv.add_child(centered(L(name, 11, Color.WHITE)))
		click(c, func(): P.set_show(slot, item); close_popup(); refresh_keep()); g.add_child(c)
	match show_tab:
		"pilot":
			for pid in D.pilotOrder: if P.has_pilot(pid): add.call({"k": "pilot", "id": pid}, UIKit.image("res://art/faces/%s.png" % P.art_id(pid), Vector2(84, 84), true), str(D.pilots[pid].name))
		"mech":
			for id in D.order: if P.has_mech(id): add.call({"k": "mech", "id": id}, game.thumbs.rect(id, 84), str(D.mechs[id].short if D.mechs[id].has("short") else D.mechs[id].name))
		"skin":
			for K in D.econ.skins:
				if not P.o.skins.has(K.id): continue
				var tc: Control = UIKit.image("res://art/faces/%s.png" % K.id, Vector2(84, 84), true) if K.kind == "pilot" else (UIKit.image("res://art/avatars/%s.png" % K.avatar, Vector2(84, 84)) if K.kind == "avatar" else (UIKit.avatar(P.avatar_path(), str(K.frame), 84) if K.kind == "frame" else UIKit.icon("gems", 84)))
				add.call({"k": "skin", "id": K.id}, tc, str(K.name))
	var clr := UIKit.flat_button("清空这一格", 16); clr.custom_minimum_size = Vector2(160, 44); clr.size_flags_horizontal = Control.SIZE_SHRINK_CENTER; v.add_child(clr)
	click(clr, func(): P.set_show(slot, {}); close_popup(); refresh_keep())

var show_tab := "pilot"
var edit_text := ""

func rename_popup() -> void:
	var v := make_popup(Vector2(600, 300))
	v.add_child(centered(L("修改昵称", 28, Color("#ffe14d"), 8)))
	v.add_child(centered(L("昵称 2 到 12 个字，对局里队友和对手看到的就是它（不会改登录用的账号名）", 13, Color("#c8c4e8"))))
	edit_text = P.display_name()
	var e := LineEdit.new(); e.text = edit_text; e.max_length = 12; e.custom_minimum_size = Vector2(360, 44); e.size_flags_horizontal = Control.SIZE_SHRINK_CENTER; e.text_changed.connect(func(t): edit_text = t); v.add_child(e)
	var ok := UIKit.gold_button("保存", 20); ok.custom_minimum_size = Vector2(160, 50); ok.size_flags_horizontal = Control.SIZE_SHRINK_CENTER; v.add_child(ok)
	click(ok, func():
		var n := edit_text.strip_edges()
		if n.length() < 2 or n.length() > 12: toast("昵称要 2 到 12 个字"); return
		P.o.nick = n; P.save(); close_popup(); refresh_keep(); toast("昵称改好了"))

func sign_popup() -> void:
	var v := make_popup(Vector2(640, 320))
	v.add_child(centered(L("个性签名", 28, Color("#ffe14d"), 8)))
	edit_text = str(P.o.sign)
	var e := LineEdit.new(); e.text = edit_text; e.max_length = 30; e.placeholder_text = "最多 30 个字"; e.custom_minimum_size = Vector2(520, 44); e.size_flags_horizontal = Control.SIZE_SHRINK_CENTER; e.text_changed.connect(func(t): edit_text = t); v.add_child(e)
	var ok := UIKit.gold_button("保存", 20); ok.custom_minimum_size = Vector2(160, 50); ok.size_flags_horizontal = Control.SIZE_SHRINK_CENTER; v.add_child(ok)
	click(ok, func(): P.o.sign = edit_text.strip_edges(); P.save(); close_popup(); refresh_keep())

func refresh_keep() -> void:   # 刷新页面（弹窗不在 root 里，会留着）
	refresh()

func cc(c: Control) -> Control:
	c.size_flags_horizontal = Control.SIZE_SHRINK_CENTER; return c

# 2.2 克制关系：克制谁（绿）/ 被谁克制（红），鼠标停在头像上看原因
func counter_row(id: String, is_pilot: bool, w: float) -> Control:
	var C: Dictionary = D.counters.get(id, {"beats": [], "weak": []})
	var h := hbox(4)
	for part in [["克制", C.beats, Color("#6dff8a")], ["怕", C.weak, Color("#ff6b5a")]]:
		if (part[1] as Array).is_empty(): continue
		h.add_child(L(part[0], 13, part[2]))
		for m in (part[1] as Array).slice(0, 3):
			var c := UIKit.card(part[2].darkened(0.6), Color("#120e26"), part[2], 8); c.pad = Vector4(2, 1, 4, 1); c.shadow = 0; c.tooltip_text = str(m.why); c.mouse_filter = Control.MOUSE_FILTER_STOP
			var ch := hbox(2); c.add_child(ch)
			if is_pilot: ch.add_child(UIKit.image("res://art/faces/%s.png" % m.id, Vector2(22, 22), true)); ch.add_child(L(str(D.pilots[m.id].name), 11, Color.WHITE))
			else: ch.add_child(game.thumbs.rect(str(m.id), 22)); ch.add_child(L(str(D.mechs[m.id].short if D.mechs[m.id].has("short") else D.mechs[m.id].name), 11, Color.WHITE))
			h.add_child(c)
		h.add_child(L(" ", 8))
	if h.get_child_count() == 0: h.add_child(L("没有特别的克制关系", 12, Color("#8f8ab8")))
	return h

# ================= 赛季开场动画（每个赛季第一次进大厅播一次；通行证页可以重播）=================
func season_intro() -> void:
	var PS: Dictionary = D.econ.pass
	var ov := Control.new(); ov.set_anchors_preset(Control.PRESET_FULL_RECT); ov.mouse_filter = Control.MOUSE_FILTER_STOP; add_child(ov)
	var bg := ColorRect.new(); bg.color = Color(0.03, 0.02, 0.07, 0.97); bg.set_anchors_preset(Control.PRESET_FULL_RECT); ov.add_child(bg)
	var st := MatchFlow.Stripes.new(); st.set_anchors_preset(Control.PRESET_FULL_RECT); ov.add_child(st)
	var sp := UIKit.Splash.new(); sp.cols = [Color("#ff3ea5"), Color("#ffe600"), Color("#1fd6ee"), Color("#9cff2e"), Color("#ff8a1f")]; sp.seed_v = int(PS.get("sid", 2)) * 77; sp.position = Vector2.ZERO; sp.size = vs; sp.modulate.a = 0.0; ov.add_child(sp)
	var t0 := L("新 赛 季", 22, Color("#7af0ff"), 5); t0.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER; t0.position = Vector2(0, 30); t0.size = Vector2(vs.x, 30); ov.add_child(t0)
	var title := L("赛季 %d「%s」" % [int(PS.get("sid", 2)), PS.season], 60, Color("#ffe14d"), 14); title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	title.position = Vector2(0, 60); title.size = Vector2(vs.x, 80); title.pivot_offset = Vector2(vs.x / 2, 40); title.scale = Vector2(2.4, 2.4); title.modulate.a = 0.0; ov.add_child(title)
	var tw := ov.create_tween()
	tw.tween_property(title, "modulate:a", 1.0, 0.25); tw.parallel().tween_property(title, "scale", Vector2.ONE, 0.45).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	tw.parallel().tween_property(sp, "modulate:a", 0.55, 0.8)
	var ids: Array = D.econ.get("seasonPilots", [])
	var n := ids.size(); var cw := minf(330.0, (vs.x - 120) / max(1, n))
	for i in n:
		var pid: String = ids[i]; var Pd: Dictionary = D.pilots[pid]; var acc := Color(str(Pd.accent))
		var x := vs.x / 2 - cw * n / 2 + cw * i
		var card := UIKit.card(acc.darkened(0.3), Color(0.05, 0.03, 0.1, 0.9), acc, 20); card.skew = -0.1
		card.position = Vector2(x + 8, vs.y + 40); card.size = Vector2(cw - 16, vs.y - 290); card.custom_minimum_size = card.size; ov.add_child(card)
		var v := vbox(2); card.add_child(v)
		v.add_child(UIKit.image("res://art/portraits/%s.png" % pid, Vector2(cw - 40, vs.y - 380), true))
		var nl := L(str(Pd.name), 30, Color.WHITE, 6); nl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER; v.add_child(nl)
		var cl := L("「%s」%s" % [Pd.code, Pd.title], 14, acc.lightened(0.4)); cl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER; v.add_child(cl)
		var ct := ov.create_tween(); ct.tween_interval(0.5 + i * 0.35)
		ct.tween_property(card, "position:y", 160.0, 0.45).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
		ct.tween_callback(func(): game.sfx.play("boom", -4))
	var sub := L("全新驾驶员、通行证和赛季皮肤已经上线！", 18, Color("#e6e2fa"), 4); sub.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER; sub.position = Vector2(0, vs.y - 116); sub.size = Vector2(vs.x, 26); ov.add_child(sub)
	var go := UIKit.gold_button("进入新赛季", 24); go.position = Vector2(vs.x / 2 - 130, vs.y - 82); go.size = Vector2(260, 62); go.custom_minimum_size = go.size; go.modulate.a = 0.0; ov.add_child(go)
	var gt := ov.create_tween(); gt.tween_interval(0.6 + n * 0.35); gt.tween_property(go, "modulate:a", 1.0, 0.3); gt.tween_callback(func(): game.sfx.play("win"))
	var close := func():
		P.o.seenSeason = int(PS.get("sid", 2)); P.save()
		var ft := ov.create_tween(); ft.tween_property(ov, "modulate:a", 0.0, 0.35); ft.tween_callback(ov.queue_free)
	go.pressed.connect(func(): game.sfx.play("click"); close.call())
	game.sfx.play("super")

# ================= 好友（social.gd）=================
var fr_code := ""
var fr_server := ""

func page_friends() -> void:
	var SO: Social = game.social
	var S: Dictionary = SO.S()
	var lw := 440.0
	var lc := UIKit.dark_card(); at(lc, Vector2(16, 152), Vector2(lw, vs.y - 168))
	var v := vbox(10); lc.add_child(v)
	v.add_child(L("我的好友码", 16, Color("#c8c4e8")))
	var ch := hbox(10); v.add_child(ch)
	ch.add_child(L(SO.fid(), 40, Color("#ffe14d"), 8))
	var cp := UIKit.flat_button("复制", 15); cp.custom_minimum_size = Vector2(80, 40); ch.add_child(cp); click(cp, func(): DisplayServer.clipboard_set(SO.fid()); toast("已复制好友码"))
	var stt: Array = {"on": ["已连接游戏服务器", Color("#6dff8a")], "connecting": ["正在连接……", Color("#ffcf4d")]}.get(SO.state, ["没有连接游戏服务器", Color("#ff8a8a")])
	v.add_child(L(stt[0], 15, stt[1]))
	v.add_child(UIKit.wrap(L("好友通过 node server.js 开的游戏服务器互相找到（和在线账号用同一个地址）。网页版玩家连同一台服务器也能加。", 13, Color("#a8a4c8")), lw - 40))
	if fr_server == "": fr_server = SO.server_addr()
	var sh := hbox(8); v.add_child(sh)
	var se := LineEdit.new(); se.text = fr_server; se.placeholder_text = "服务器地址，例如 192.168.1.5:3000"; se.custom_minimum_size = Vector2(290, 40); se.text_changed.connect(func(t): fr_server = t); sh.add_child(se)
	var sb := UIKit.pink_button("连接", 16); sb.custom_minimum_size = Vector2(90, 42); sh.add_child(sb); click(sb, func(): SO.connect_server(fr_server.strip_edges()); refresh())
	v.add_child(L("添加好友", 18, Color("#ffe14d"), 3))
	var ah := hbox(8); v.add_child(ah)
	var ae := LineEdit.new(); ae.text = fr_code; ae.placeholder_text = "对方的 6 位好友码"; ae.max_length = 6; ae.custom_minimum_size = Vector2(290, 40); ae.text_changed.connect(func(t): fr_code = t); ah.add_child(ae)
	var ab := UIKit.gold_button("申请", 16); ab.custom_minimum_size = Vector2(90, 42); ah.add_child(ab)
	click(ab, func():
		var err := SO.request(fr_code)
		if err != "": toast(err)
		else: toast("已发送好友申请（对方在线时会收到）"); fr_code = ""; refresh())
	if not S.reqIn.is_empty():
		v.add_child(L("收到的申请", 16, Color("#ff9ad6"), 3))
		for r in S.reqIn:
			var rh := hbox(8); v.add_child(rh)
			rh.add_child(UIKit.avatar("res://art/faces/%s.png" % r.pilot if D.pilots.has(str(r.pilot)) else "res://art/icons/pilot.png", "", 36))
			var nl := L("%s（%s）" % [r.name, r.fid], 15, Color.WHITE); nl.custom_minimum_size.x = 200; rh.add_child(nl)
			rh.add_child(claim_btn("通过", func(): SO.accept(r.fid); refresh(), true))
			var rj := UIKit.flat_button("拒绝", 14); rj.custom_minimum_size = Vector2(70, 40); rh.add_child(rj); click(rj, func(): SO.reject(r.fid); refresh())
	if not S.reqOut.is_empty():
		v.add_child(L("等待通过：" + "、".join(S.reqOut.map(func(r): return str(r.fid))), 13, Color("#a8a4c8")))
	# 右边：好友列表
	var rx := 16 + lw + 16; var rw := vs.x - rx - 16
	var rc := UIKit.dark_card(); at(rc, Vector2(rx, 152), Vector2(rw, vs.y - 168))
	var rv := vbox(8); rc.add_child(rv)
	var n_on: int = S.friends.filter(func(f): return SO.on.has(f.fid)).size()
	rv.add_child(L("好友 %d 人 • 在线 %d" % [S.friends.size(), n_on], 20, Color("#ffe14d"), 4))
	rv.add_child(UIKit.wrap(L("组队：点「邀请组队」会开一个局域网房间并把你的 IP 发给好友，好友一键加入后在「局域网联机」里开打（需要在同一个局域网，或者能连到你的电脑）。", 13, Color("#a8a4c8")), rw - 40))
	var sc := ScrollContainer.new(); sc.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED; sc.custom_minimum_size = Vector2(rw - 30, vs.y - 300); rv.add_child(sc)
	var lst := vbox(6); sc.add_child(lst)
	if S.friends.is_empty(): lst.add_child(L("还没有好友。把你的好友码发给朋友，或者输入对方的好友码申请。", 15, Color("#8f8ab8")))
	var fl: Array = S.friends.duplicate()
	fl.sort_custom(func(a, b): return SO.on.has(a.fid) and not SO.on.has(b.fid))
	for f in fl:
		var online: bool = SO.on.has(f.fid)
		var c := UIKit.card(Color("#2e2760") if online else Color("#1e1a3a"), Color("#120e26"), Color("#6dff8a") if online else Color("#4b4396"), 12); c.custom_minimum_size = Vector2(rw - 50, 0)
		var h := hbox(10); c.add_child(h)
		var av := UIKit.avatar("res://art/faces/%s.png" % f.pilot if D.pilots.has(str(f.pilot)) else "res://art/icons/pilot.png", "", 48, Color("#6dff8a") if online else Color("#6a6a8a")); h.add_child(av)
		if not online: av.modulate = Color(0.6, 0.6, 0.7)
		var fv := vbox(0); fv.custom_minimum_size.x = 260; h.add_child(fv)
		fv.add_child(L(str(f.name), 17, Color.WHITE))
		var oc: Dictionary = SO.on.get(f.fid, {})
		fv.add_child(L(("在线 • " + ("对局中" if oc.get("st", "") == "game" else "大厅")) if online else "离线", 13, Color("#6dff8a") if online else Color("#8f8ab8")))
		h.add_child(UIKit.pill("trophy", str(int(f.get("tr", 0))), Color("#ffcf4d")))
		var spc := Control.new(); spc.size_flags_horizontal = Control.SIZE_EXPAND_FILL; spc.mouse_filter = Control.MOUSE_FILTER_IGNORE; h.add_child(spc)
		h.add_child(claim_btn("邀请组队", func(): SO.invite(f.fid), online))
		var dl := UIKit.flat_button("删除", 13); dl.custom_minimum_size = Vector2(60, 40); h.add_child(dl); click(dl, func(): SO.remove(f.fid); refresh())
		lst.add_child(c)

func invite_popup(from_name: String, ips: Array) -> void:
	var v := make_popup(Vector2(560, 300))
	v.add_child(centered(L("组队邀请", 30, Color("#ffe14d"), 8)))
	v.add_child(centered(L("%s 邀请你加入 TA 的局域网房间" % from_name, 18, Color.WHITE)))
	v.add_child(centered(L("房主地址：" + ", ".join(ips), 14, Color("#a8a4c8"))))
	var hb := hbox(16); hb.alignment = BoxContainer.ALIGNMENT_CENTER; v.add_child(hb)
	var no_b := UIKit.flat_button("拒绝", 18); no_b.custom_minimum_size = Vector2(140, 52); hb.add_child(no_b); click(no_b, func(): close_popup())
	var ok_b := UIKit.gold_button("加入", 22); ok_b.custom_minimum_size = Vector2(160, 52); hb.add_child(ok_b)
	click(ok_b, func():
		close_popup()
		var err: String = game.net.join(str(ips[0]), {"name": P.display_name(), "pilot": P.o.pilot, "weapon": P.o.weapon, "power": P.power(P.o.pilot)})
		if err != "": toast(err)
		else: lan_ip = str(ips[0]); open_sub("lan"))
