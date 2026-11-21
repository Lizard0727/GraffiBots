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
	click(pc, func(): open_sub("quests"))
	var h := hbox(10); pc.add_child(h)
	var pid: String = P.o.pilot
	var fr := UIKit.card(Color(str(D.pilots[pid].accent)) if pid != "" else Color.GRAY, Color("#1a1430"), Color.WHITE, 12); fr.pad = Vector4(2, 2, 2, 2); fr.shadow = 0
	fr.add_child(face(pid, 46) if pid != "" else UIKit.icon("pilot", 46)); h.add_child(fr)
	var v := vbox(3); h.add_child(v)
	var nh := hbox(6); v.add_child(nh)
	nh.add_child(L(str(P.o.name) if str(P.o.name) != "" else "涂鸦驾驶员", 17, Color.WHITE)); nh.add_child(UIKit.chip("Lv.%d" % lv, Color("#7af0ff"), 13))
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
	var pcv := vbox(1); pch.add_child(pcv); pcv.add_child(L("通行证 Lv.%d" % P.pass_level(), 16, Color.WHITE, 4))
	pcv.add_child(UIKit.bar(float(int(P.o.pass.xp) % int(D.econ.pass.xpPer)) / float(D.econ.pass.xpPer), 110, 8, Color("#fff3a8")))
	at(psc, Vector2(cc.position.x + 342, 14)); click(psc, func(): open_sub("pass"))
	badge(psc, cl.pass, Vector2(150, -8))
	var bx := vs.x - 16
	for b in [["gear", func(): settings_popup(), 0], ["help", func(): help_popup(), 0], ["mail", func(): open_sub("mail"), cl.mail], ["event", func(): open_sub("events"), cl.events], ["book", func(): open_sub("quests"), cl.tasks]]:
		bx -= 58
		var rb := UIKit.card(Color("#3a3370"), Color("#1d1838"), Color("#6a60c0"), 26, true); rb.pad = Vector4(5, 5, 5, 5)
		rb.add_child(UIKit.icon(b[0], 38)); at(rb, Vector2(bx, 18), Vector2(52, 52)); click(rb, b[1])
		badge(rb, int(b[2]), Vector2(34, -6))

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
	click(fb, func(): game.sfx.play("go"); game.start_from_lobby())
	var pulse := fb.create_tween().set_loops()   # 绑在按钮上：按钮被换掉时动画跟着停
	pulse.tween_method(func(a): fb.glow.a = a; fb.queue_redraw(), 0.35, 1.0, 0.8)
	pulse.tween_method(func(a): fb.glow.a = a; fb.queue_redraw(), 1.0, 0.35, 0.8)
	at(L("WASD 移动 • 鼠标瞄准 • 左键攻击 • Q 技能 • E 大招 • R 超载", 12, Color("#9a96b8")), Vector2(rx, 534))
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
		"mail": "邮件", "events": "限时活动", "shop": "皮肤商店", "ranked": "排位赛 • " + str(D.econ.rank.season.name), "loot": "搜刮撤离"}
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
	for t in [["display", "画面"], ["audio", "声音"], ["keys", "按键"], ["save", "存档"]]:
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
			body.add_child(UIKit.wrap(L("存档保存在本机（user://profile.json）。重置会清空所有进度，重新开新手宝箱。", 15, Color("#e6e2fa")), 640))
			var rs2 := UIKit.pink_button("重置存档", 18); rs2.custom_minimum_size = Vector2(180, 50); body.add_child(rs2); click(rs2, func(): confirm_reset())
	var ok := UIKit.gold_button("好的", 22); ok.custom_minimum_size = Vector2(180, 54); ok.size_flags_horizontal = Control.SIZE_SHRINK_CENTER; v.add_child(ok); click(ok, func(): rebinding = ""; close_popup())

func help_popup() -> void:
	var v := make_popup(Vector2(640, 380))
	v.add_child(centered(L("操作说明", 30, Color("#ffe14d"), 8)))
	var K: Dictionary = game.settings.keys
	var kn := func(a): return Settings.key_name(K[a])
	for line in ["%s%s%s%s 移动 • 鼠标瞄准 • 左键攻击" % [kn.call("up"), kn.call("left"), kn.call("down"), kn.call("right")], "%s 技能 • %s / 右键 大招 • %s 超载" % [kn.call("skill"), kn.call("super"), kn.call("overload")],
			"%s 滚轮形态（在己方涂料上更快） • %s 跳 • Esc 回大厅 • F11 全屏" % [kn.call("wheel"), kn.call("jump")], "按键可以在「设置 → 按键」里改"]:
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
	var b := UIKit.gold_button("领取新手宝箱", 24); b.custom_minimum_size = Vector2(280, 62); b.size_flags_horizontal = Control.SIZE_SHRINK_CENTER; v.add_child(b)
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
	var bv := vbox(6); hh.add_child(bv)
	if not P.o.pass.prem:
		var b1 := UIKit.gold_button("", 10); clear(b1); b1.custom_minimum_size = Vector2(230, 38); bv.add_child(b1)
		var b1h := hbox(6); b1h.alignment = BoxContainer.ALIGNMENT_CENTER; b1.add_child(b1h); b1h.add_child(L("高级通行证", 16, Color("#3a1f05"))); b1h.add_child(UIKit.icon("gems", 22)); b1h.add_child(L(str(int(PS.price)), 16, Color("#3a1f05")))
		click(b1, func(): act(P.buy_pass(false), "解锁了高级通行证！"))
	if not P.o.pass.dlx:
		var cost := int(PS.deluxe) - (int(PS.price) if P.o.pass.prem else 0)
		var b2 := UIKit.pink_button("", 10); clear(b2); b2.custom_minimum_size = Vector2(230, 38); bv.add_child(b2)
		var b2h := hbox(6); b2h.alignment = BoxContainer.ALIGNMENT_CENTER; b2.add_child(b2h); b2h.add_child(L("豪华版（+%d 级）" % int(PS.boost), 15, Color.WHITE, 3)); b2h.add_child(UIKit.icon("gems", 22)); b2h.add_child(L(str(cost), 15, Color.WHITE, 3))
		click(b2, func(): act(P.buy_pass(true), "豪华版通行证！直接升 %d 级" % int(PS.boost)))
	var ca := UIKit.gold_button("全部领取", 18); ca.custom_minimum_size = Vector2(230, 38); bv.add_child(ca); click(ca, func(): show_items(P.claim_pass_all(), "通行证奖励"))
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
		var go := UIKit.gold_button("开始排位", 30); go.custom_minimum_size = Vector2(0, 74); v.add_child(go); click(go, func(): ranked_start())
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

func stash_value() -> int:
	var v := 0
	for k in P.o.stash:
		if D.has("loot") and D.loot.items.has(k): v += int(D.loot.items[k].v) * int(P.o.stash[k])
	return v

func page_loot() -> void:
	at(L("搜刮撤离正在移植中……", 20, Color("#a8a4c8")), Vector2(24, 160))
