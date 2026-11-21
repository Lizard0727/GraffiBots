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

func face(pid: String, size: float) -> TextureRect:
	return UIKit.image("res://art/faces/%s.png" % pid, Vector2(size, size), true)

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
	var bx := vs.x - 16
	for b in [["gear", func(): settings_popup()], ["help", func(): help_popup()], ["book", func(): open_sub("quests")]]:
		bx -= 58
		var rb := UIKit.card(Color("#3a3370"), Color("#1d1838"), Color("#6a60c0"), 26, true); rb.pad = Vector4(5, 5, 5, 5)
		rb.add_child(UIKit.icon(b[0], 38)); at(rb, Vector2(bx, 18), Vector2(52, 52)); click(rb, b[1])

# ---------------- 大厅主页 ----------------
func build_home() -> void:
	side_shade(0.82, 0.78)
	var pid: String = P.o.pilot
	var Pd: Dictionary = D.pilots[pid] if pid != "" else D.pilots[D.pilotOrder[0]]
	var acc := Color(str(Pd.accent))
	var sp := UIKit.Splash.new(); sp.cols = [acc, Color("#ff3ea5"), Color("#1fd6ee"), Color("#ffe14d")]; sp.seed_v = pid.hash()
	at(sp, Vector2(240, 150), Vector2(400, vs.y - 200))
	if pid != "":
		var por := UIKit.image("res://art/portraits/%s.png" % pid, Vector2(440, 572))
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
		["chests", "宝箱", "商店 • 兑换", "chest", nchest],
		["talents", "天赋", "已装上 %d / %d" % [P.o.tal.size(), int(D.econ.talentSlots)], "star", P.tp_free()],
		["quests", "任务", "每日 %d / 3" % quests_done(), "book", 0]]
	for i in menu.size():
		var m: Array = menu[i]
		var c := UIKit.dark_card(true); at(c, Vector2(16, 196 + i * 72), Vector2(230, 62)); click(c, func(): open_sub(m[0]))
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
	var qc := UIKit.dark_card(true); at(qc, Vector2(rx, 176), Vector2(300, 76)); click(qc, func(): open_sub("quests"))
	var qh := hbox(10); qc.add_child(qh); qh.add_child(UIKit.icon("book", 44))
	var qv := vbox(3); qh.add_child(qv)
	qv.add_child(L("每日任务  %d / 3" % quests_done(), 18, Color.WHITE)); qv.add_child(UIKit.bar(quests_done() / 3.0, 200, 9, Color("#6dff8a")))
	var won_today: bool = int(P.o.dayWin) == 1 and int(P.o.day) == Profile.day_index()
	qv.add_child(L("连胜 %d • 今日首胜 %s" % [P.o.streak, "已领" if won_today else "+20 宝石"], 12, Color("#a8a4c8")))
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
	var titles := {"pilots": "驾驶员", "mechs": "机体", "chests": "宝箱商店", "talents": "天赋树", "quests": "任务"}
	at(L(str(titles[sub]), 34, Color("#ffe14d"), 8), Vector2(182, 94))
	match sub:
		"pilots": page_pilots()
		"mechs": page_mechs()
		"chests": page_chests()
		"talents": page_talents()
		"quests": page_quests()
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
	var por := UIKit.image("res://art/portraits/%s.png" % id, Vector2(300, 390)); at(por, Vector2(x0 - 6, vs.y - 406))
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
	P.refresh_quests()
	var w := (vs.x - 60) / 2.0
	var lv := vbox(10); at(lv, Vector2(24, 156))
	lv.add_child(L("每日任务 • 北京时间 0 点刷新", 20, Color("#ffe14d"), 4))
	var dq := P.daily_quests(Profile.day_index())
	for i in dq.size(): lv.add_child(quest_card(dq[i], int(P.o.q.dp[i]), w))
	lv.add_child(L("每周任务", 20, Color("#ffe14d"), 4))
	for i in D.econ.weekly.size(): lv.add_child(quest_card(D.econ.weekly[i], int(P.o.q.wp[i]), w))
	var rc := UIKit.dark_card(); at(rc, Vector2(36 + w, 156)); rc.custom_minimum_size.x = w
	var rv := vbox(8); rc.add_child(rv)
	rv.add_child(L("生涯数据", 22, Color.WHITE, 4))
	var o: Dictionary = P.o
	for row in [["play", "对战", o.matches], ["trophy", "胜场", o.wins], ["super", "击毁 / 击倒", o.kills], ["turf", "涂地格数", o.paint], ["star", "最高连胜", o.bestStreak], ["trophy", "奖杯", o.trophies]]:
		var h := hbox(10); rv.add_child(h); h.add_child(UIKit.icon(row[0], 30))
		var nl := L(row[1], 17, Color("#c9c5e6")); nl.custom_minimum_size.x = 160; h.add_child(nl); h.add_child(L(str(row[2]), 20, Color("#ffe14d")))
	rv.add_child(UIKit.wrap(L("原版的任务奖励是通行证经验；通行证还没移植，先折成一半数量的金币。", 13, Color("#9a96b8")), w - 40))

func quest_card(q: Array, n: int, w: float) -> GCard:
	var done := n >= int(q[1])
	var c := UIKit.card(Color("#1f5a3a") if done else Color("#272150"), Color("#123022") if done else Color("#15112c"), Color("#6dff8a") if done else Color("#4b4396"), 14)
	c.custom_minimum_size = Vector2(w, 0)
	var ik: String = {"win": "trophy", "play": "play", "kills": "super", "paint": "turf", "mvp": "star"}.get(str(q[0]), "book")
	var h := hbox(10); c.add_child(h); h.add_child(UIKit.icon(ik, 34))
	var v := vbox(3); v.size_flags_horizontal = Control.SIZE_EXPAND_FILL; h.add_child(v)
	v.add_child(L(("[完成] " if done else "") + P.quest_name(q), 17, Color("#6dff8a") if done else Color.WHITE))
	var bh := hbox(8); v.add_child(bh); bh.add_child(UIKit.bar(float(n) / float(q[1]), w - 250, 10, Color("#6dff8a"))); bh.add_child(L("%d / %d" % [n, int(q[1])], 13, Color("#a8a4c8")))
	h.add_child(UIKit.icon("coins", 26)); h.add_child(L(str(int(q[2]) / 2), 17, Color("#ffd23f")))
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

func settings_popup() -> void:
	var v := make_popup(Vector2(520, 330))
	v.add_child(centered(L("设置", 30, Color("#ffe14d"), 8)))
	var h := hbox(10); h.alignment = BoxContainer.ALIGNMENT_CENTER; v.add_child(h)
	h.add_child(L("音效音量", 18, Color.WHITE))
	var sl := HSlider.new(); sl.min_value = -30; sl.max_value = 6; sl.value = game.sfx.volume_db; sl.custom_minimum_size = Vector2(240, 30)
	sl.value_changed.connect(func(x): game.sfx.volume_db = x; game.sfx.play("click")); h.add_child(sl)
	v.add_child(centered(UIKit.wrap(L("存档在本机。重置会清空所有进度，重新开新手宝箱。", 14, Color("#a8a4c8")), 440)))
	var bh := hbox(14); bh.alignment = BoxContainer.ALIGNMENT_CENTER; v.add_child(bh)
	var rs := UIKit.flat_button("重置存档", 17); rs.custom_minimum_size = Vector2(150, 50); bh.add_child(rs); click(rs, func(): confirm_reset())
	var ok := UIKit.gold_button("好的", 22); ok.custom_minimum_size = Vector2(150, 50); bh.add_child(ok); click(ok, func(): close_popup())

func help_popup() -> void:
	var v := make_popup(Vector2(640, 380))
	v.add_child(centered(L("操作说明", 30, Color("#ffe14d"), 8)))
	for line in ["电脑：WASD 移动 • 鼠标瞄准 • 左键攻击", "Q 技能 • E / 右键 大招 • R 超载", "Shift 滚轮形态（在己方涂料上更快） • 空格 跳 • Esc 回大厅", "手机：左边拖动移动 • 右边拖动瞄准并攻击 • 右下角是技能 / 大招 / 超载按钮"]:
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
