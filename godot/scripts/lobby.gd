# 涂鸦机兵 Godot 版 —— 大厅：顶栏（等级 / 奖杯 / 货币）、左侧导航、对战 / 驾驶员 / 机体 / 宝箱 / 天赋 / 任务六个页面
# 中间留给 3D 展台（game.gd 里的 showroom），选中的驾驶员和机体站在上面
class_name Lobby
extends Control

const TABS := [["play", "对战"], ["pilots", "驾驶员"], ["mechs", "机体"], ["chests", "宝箱"], ["talents", "天赋"], ["quests", "任务"]]
const BR_COL := {"atk": "#ff4d3d", "def": "#4fb8ff", "paint": "#ffc531", "sup": "#9cff2e"}

var game
var P: Profile
var D: Dictionary
var tab := "play"
var view_pilot := ""
var view_mech := ""
var top_bar: HBoxContainer
var nav: VBoxContainer
var page: PanelContainer
var popup: Control
var toast_lbl: Label
var toast_t := 0.0
var page_w := 500.0

func _init(g) -> void:
	game = g; P = g.profile; D = g.data
	set_anchors_preset(Control.PRESET_FULL_RECT)
	theme = g.theme_ui
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	top_bar = HBoxContainer.new(); top_bar.position = Vector2(16, 10); top_bar.add_theme_constant_override("separation", 10); add_child(top_bar)
	nav = VBoxContainer.new(); nav.position = Vector2(16, 76); nav.add_theme_constant_override("separation", 8); add_child(nav)
	for t in TABS:
		var b := Button.new(); b.text = t[1]; b.custom_minimum_size = Vector2(112, 52); b.toggle_mode = true; b.add_theme_font_size_override("font_size", 20)
		b.pressed.connect(func(): show_tab(t[0]); game.sfx.play("click"))
		b.set_meta("tab", t[0]); nav.add_child(b)
	page = PanelContainer.new(); add_child(page)
	toast_lbl = Label.new(); toast_lbl.add_theme_font_size_override("font_size", 20); toast_lbl.add_theme_color_override("font_color", Color("#ffe14d"))
	toast_lbl.add_theme_color_override("font_outline_color", Color.BLACK); toast_lbl.add_theme_constant_override("outline_size", 6)
	toast_lbl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER; toast_lbl.set_anchors_preset(Control.PRESET_CENTER_BOTTOM); toast_lbl.position = Vector2(-300, -90); toast_lbl.size = Vector2(600, 40)
	add_child(toast_lbl)
	view_pilot = P.o.pilot; view_mech = P.o.weapon

func _process(delta: float) -> void:
	toast_t -= delta
	toast_lbl.modulate.a = clampf(toast_t, 0, 1)

func toast(s: String) -> void:
	toast_lbl.text = s; toast_t = 2.2

# ---------------- 小工具 ----------------
func lbl(s: String, size := 16, c := Color("#e6e2fa"), wrap := false) -> Label:
	var l := Label.new(); l.text = s; l.add_theme_font_size_override("font_size", size); l.add_theme_color_override("font_color", c)
	if wrap: l.autowrap_mode = TextServer.AUTOWRAP_ARBITRARY; l.custom_minimum_size = Vector2(page_w - 40, 0)
	return l

func btn(s: String, f: Callable, size := 18, min_w := 0.0) -> Button:
	var b := Button.new(); b.text = s; b.add_theme_font_size_override("font_size", size); b.custom_minimum_size = Vector2(min_w, 44)
	b.pressed.connect(func(): game.sfx.play("click"); f.call())
	return b

func pill(text: String, c: Color) -> PanelContainer:
	var pc := PanelContainer.new()
	var sb := StyleBoxFlat.new(); sb.bg_color = Color(0.05, 0.04, 0.1, 0.85); sb.border_color = c; sb.set_border_width_all(2); sb.set_corner_radius_all(18)
	sb.content_margin_left = 12; sb.content_margin_right = 12; sb.content_margin_top = 4; sb.content_margin_bottom = 4
	pc.add_theme_stylebox_override("panel", sb)
	pc.add_child(lbl(text, 17, c))
	return pc

func clear(n: Node) -> void:
	for c in n.get_children(): n.remove_child(c); c.queue_free()

func role_name(id: String) -> String:
	return game.role_name(id)

func refresh() -> void:
	refresh_top(); show_tab(tab)

func refresh_top() -> void:
	clear(top_bar)
	var lv := P.level()
	var xp0 := Profile.xp_for_level(lv); var xp1 := Profile.xp_for_level(lv + 1)
	top_bar.add_child(pill("Lv.%d  %d / %d" % [lv, P.o.xp - xp0, xp1 - xp0], Color("#7af0ff")))
	top_bar.add_child(pill("奖杯 %d" % P.o.trophies, Color("#ffb43d")))
	for k in ["coins", "gems", "parts", "crystals"]:
		top_bar.add_child(pill("%s %d" % [P.cur_name(k), int(P.o[k])], Color(str(D.econ.cur[k].color))))

# ---------------- 页面 ----------------
func show_tab(t: String) -> void:
	tab = t
	for b in nav.get_children(): b.button_pressed = b.get_meta("tab") == t
	clear(page)
	var vs := get_viewport_rect().size
	var wide := t in ["chests", "talents", "quests"]
	page.position = Vector2(vs.x * (0.18 if wide else 0.52), 70); page.size = Vector2(vs.x * (0.8 if wide else 0.46), vs.y - 86)
	page.custom_minimum_size = page.size
	page_w = page.size.x
	match t:
		"play": page_play()
		"pilots": page_pilots()
		"mechs": page_mechs()
		"chests": page_chests()
		"talents": page_talents()
		"quests": page_quests()
	game.show_showroom(view_pilot if t == "pilots" else P.o.pilot, view_mech if t == "mechs" else P.o.weapon, not wide)

func page_play() -> void:
	var v := VBoxContainer.new(); v.add_theme_constant_override("separation", 10); page.add_child(v)
	var Pd: Dictionary = D.pilots[P.o.pilot]; var w: Dictionary = D.mechs[P.o.weapon]
	var q := P.power(P.o.pilot)
	v.add_child(lbl("%s「%s」 Lv.%d%s" % [Pd.name, Pd.code, q.lv, ("  " + str(D.econ.breaks[q.bt].name)) if q.bt > 0 else ""], 26, Color(str(Pd.accent))))
	v.add_child(lbl("%s（%s）" % [w.name, role_name(P.o.weapon)], 20, Color("#e6e2fa")))
	var tl := ""
	for id in P.o.tal: tl += str(P.talent(id).name) + "  "
	v.add_child(lbl("天赋：" + (tl if tl != "" else "还没有装天赋"), 15, Color("#c9c5e6")))
	var hb := HBoxContainer.new(); hb.add_theme_constant_override("separation", 10); v.add_child(hb)
	hb.add_child(btn("换驾驶员", func(): show_tab("pilots"), 17, 140)); hb.add_child(btn("换机体", func(): show_tab("mechs"), 17, 140))
	v.add_child(lbl("模式", 15, Color("#9a96b8")))
	var mo := OptionButton.new()
	for i in D.modeOrder.size():
		mo.add_item(str(D.modes[D.modeOrder[i]].name), i)
		if D.modeOrder[i] == P.o.mode: mo.select(i)
	var desc := lbl(str(D.modes[P.o.mode].desc), 14, Color("#ffe14d"), true)
	mo.item_selected.connect(func(k): P.o.mode = D.modeOrder[k]; desc.text = str(D.modes[P.o.mode].desc); P.save(); game.sfx.play("click"))
	v.add_child(mo); v.add_child(desc)
	v.add_child(lbl("地图", 15, Color("#9a96b8")))
	var ob := OptionButton.new(); ob.add_item("随机地图", 0)
	for i in D.maps.size(): ob.add_item(str(D.maps[i].name), i + 1)
	ob.select(int(P.o.map) + 1)
	ob.item_selected.connect(func(k): P.o.map = k - 1; P.save(); game.sfx.play("click"))
	v.add_child(ob)
	var sp := Control.new(); sp.size_flags_vertical = Control.SIZE_EXPAND_FILL; v.add_child(sp)
	var go := btn("开始对战", func(): game.sfx.play("go"); game.start_from_lobby(), 32)
	go.custom_minimum_size = Vector2(0, 76); v.add_child(go)
	v.add_child(lbl("电脑：WASD 移动 • 鼠标瞄准 • 左键攻击 • Q 技能 • E / 右键 大招 • R 超载 • Shift 滚轮 • 空格 跳", 12, Color("#9a96b8"), true))

func grid_page(ids: Array, owned: Callable, label: Callable, sel: String, pick: Callable) -> GridContainer:
	var sc := ScrollContainer.new(); sc.custom_minimum_size = Vector2(0, 250); sc.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	var g := GridContainer.new(); g.columns = 4; g.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	g.add_theme_constant_override("h_separation", 6); g.add_theme_constant_override("v_separation", 6); sc.add_child(g)
	var grp := ButtonGroup.new()
	for id in ids:
		var b := Button.new(); b.toggle_mode = true; b.button_group = grp; b.text = label.call(id); b.custom_minimum_size = Vector2(96, 54)
		b.size_flags_horizontal = Control.SIZE_EXPAND_FILL; b.add_theme_font_size_override("font_size", 14); b.clip_text = true
		b.button_pressed = id == sel
		if not owned.call(id): b.modulate = Color(0.55, 0.55, 0.65)
		b.pressed.connect(func(): game.sfx.play("click"); pick.call(id))
		g.add_child(b)
	page.get_child(0).add_child(sc)
	return g

func page_pilots() -> void:
	var v := VBoxContainer.new(); v.add_theme_constant_override("separation", 8); page.add_child(v)
	var n := 0
	for id in D.pilotOrder:
		if P.has_pilot(id): n += 1
	v.add_child(lbl("驾驶员  %d / %d" % [n, D.pilotOrder.size()], 18, Color("#c9c5e6")))
	grid_page(D.pilotOrder, P.has_pilot, func(id): return "%s%s" % [D.pilots[id].name, ("  Lv.%d" % P.o.pilots[id].lv) if P.has_pilot(id) else ""], view_pilot,
		func(id): view_pilot = id; show_tab("pilots"))
	var id: String = view_pilot if view_pilot != "" else str(D.pilotOrder[0])
	var Pd: Dictionary = D.pilots[id]
	var info := VBoxContainer.new(); info.size_flags_vertical = Control.SIZE_EXPAND_FILL; v.add_child(info)
	info.add_child(lbl("%s「%s」— %s  （%s）" % [Pd.name, Pd.code, Pd.title, role_name(id)], 20, Color(str(Pd.accent))))
	var sc := ScrollContainer.new(); sc.size_flags_vertical = Control.SIZE_EXPAND_FILL; sc.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED; info.add_child(sc)
	var tx := lbl("技能 • %s：%s\n被动 • %s：%s\n超载 • %s：%s\n弹出武器 • %s" % [Pd.skillInfo.name, Pd.skillInfo.desc, Pd.passive.name, Pd.passive.desc, Pd.overload.name, Pd.overload.desc, Pd.sidearm.name], 14, Color("#e6e2fa"), true)
	tx.size_flags_horizontal = Control.SIZE_EXPAND_FILL; sc.add_child(tx)
	var hb := HBoxContainer.new(); hb.add_theme_constant_override("separation", 8); v.add_child(hb)
	if not P.has_pilot(id):
		var src: String = D.econ.locked.get(id, "")
		v.add_child(lbl("还没拥有 • " + ("通过%s获得（Godot 版还没移植）" % src if src != "" else "可以从宝箱开出"), 15, Color("#ff9a6b"), true))
		return
	var q: Dictionary = P.o.pilots[id]
	var cap := P.lv_cap(q.bt)
	v.add_child(lbl("等级 %d / %d（上限 %d） • 生命和伤害 +%d%% • %s" % [q.lv, int(D.econ.maxLv), cap, int(round((P.stat_mul(q.lv) - 1) * 100)), "超载已解锁" if q.bt >= 1 else "突破 I 后解锁超载"], 14, Color("#7af0ff"), true))
	if id != P.o.pilot: hb.add_child(btn("选用", func(): P.o.pilot = id; P.save(); toast("已选用 " + str(Pd.name)); refresh(), 18, 100))
	else: hb.add_child(lbl("使用中", 16, Color("#6dff8a")))
	if q.lv < int(D.econ.maxLv) and q.lv < cap:
		hb.add_child(btn("升级  %d 金币 %d 零件" % [int(D.econ.upCoins[q.lv]), int(D.econ.upParts[q.lv])], func(): act(P.upgrade(id), "升到 %d 级！" % (q.lv + 1)), 16))
	elif q.bt + 1 < D.econ.breaks.size():
		var B: Dictionary = D.econ.breaks[q.bt + 1]
		hb.add_child(btn("%s  %d 结晶 %d 金币" % [B.name, int(B.crystals), int(B.coins)], func(): act(P.breakthrough(id), str(B.name) + " 完成：" + str(B.desc)), 16))

func page_mechs() -> void:
	var v := VBoxContainer.new(); v.add_theme_constant_override("separation", 8); page.add_child(v)
	v.add_child(lbl("机体  %d / %d" % [P.o.mechs.size(), D.order.size()], 18, Color("#c9c5e6")))
	grid_page(D.order, P.has_mech, func(id): return str(D.mechs[id].name), view_mech, func(id): view_mech = id; show_tab("mechs"))
	var id: String = view_mech if view_mech != "" else str(D.order[0])
	var w: Dictionary = D.mechs[id]
	v.add_child(lbl("%s（%s）" % [w.name, role_name(id)], 20, Color("#ffe14d")))
	var sc := ScrollContainer.new(); sc.size_flags_vertical = Control.SIZE_EXPAND_FILL; sc.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED; v.add_child(sc)
	var t := "%s\n大招 • %s：%s" % [w.desc, w.specialInfo.name, w.specialInfo.desc]
	if w.trait != null: t += "\n特性 • %s：%s" % [w.trait.name, w.trait.desc]
	var tx := lbl(t, 14, Color("#e6e2fa"), true); tx.size_flags_horizontal = Control.SIZE_EXPAND_FILL; sc.add_child(tx)
	var bars := GridContainer.new(); bars.columns = 2; v.add_child(bars)
	for st in [["生命", float(w.hp) / 220.0], ["射程", float(w.range2) / 800.0], ["速度", float(w.spd) / 1.2]]:
		bars.add_child(lbl(st[0], 14, Color("#9a96b8")))
		var pb := ProgressBar.new(); pb.max_value = 1.0; pb.value = clampf(st[1], 0.05, 1.0); pb.show_percentage = false; pb.custom_minimum_size = Vector2(260, 14); bars.add_child(pb)
	if not P.has_mech(id):
		var src: String = D.econ.locked.get(id, "")
		v.add_child(lbl("还没拥有 • " + ("通过%s获得（Godot 版还没移植）" % src if src != "" else "可以从宝箱开出"), 15, Color("#ff9a6b"), true))
	elif id != P.o.weapon: v.add_child(btn("选用", func(): P.o.weapon = id; P.save(); toast("已选用 " + str(w.name)); refresh(), 18, 120))
	else: v.add_child(lbl("使用中", 16, Color("#6dff8a")))

func page_chests() -> void:
	var v := VBoxContainer.new(); v.add_theme_constant_override("separation", 12); page.add_child(v)
	var own := HBoxContainer.new(); own.add_theme_constant_override("separation", 10); v.add_child(own)
	own.add_child(lbl("我的宝箱：", 18, Color("#c9c5e6")))
	if P.o.chests.is_empty(): own.add_child(lbl("没有（打对战升级、每日任务都能拿金币和宝石）", 15, Color("#9a96b8")))
	for cid in P.o.chests:
		own.add_child(btn("打开 %s ×%d" % [D.econ.chests[cid].name, int(P.o.chests[cid])], func(): open_anim(cid, P.open_chest(cid)), 16))
	var row := HBoxContainer.new(); row.add_theme_constant_override("separation", 10); row.size_flags_vertical = Control.SIZE_EXPAND_FILL; v.add_child(row)
	for cid in D.econ.chestOrder:
		var C: Dictionary = D.econ.chests[cid]
		var pc := PanelContainer.new(); pc.size_flags_horizontal = Control.SIZE_EXPAND_FILL; row.add_child(pc)
		var cv := VBoxContainer.new(); cv.add_theme_constant_override("separation", 6); pc.add_child(cv)
		var col: Color = [Color.WHITE, Color("#c9ccd4"), Color("#4fb8ff"), Color("#ffc531")][int(C.tier)]
		cv.add_child(lbl(str(C.name), 22, col)); cv.add_child(lbl(str(C.desc), 13, Color("#9a96b8"), true))
		var odds := ""
		for d in C.drops:
			var nm: String
			if d.k == "pilot": nm = "未拥有的驾驶员"
			elif d.k == "mech": nm = "未拥有的机体"
			else: nm = "%s ×%d–%d" % [P.cur_name(d.k), int(d.min), int(d.max)]
			odds += "%s  %s%%\n" % [nm, str(snappedf(float(d.p) * 100, 0.1))]
		var ol := lbl(odds, 13, Color("#e6e2fa"), true); ol.size_flags_vertical = Control.SIZE_EXPAND_FILL; cv.add_child(ol)
		cv.add_child(btn("%d 宝石" % int(C.price), func(): open_anim(cid, P.buy_chest(cid)), 18))
	var ex := HBoxContainer.new(); ex.add_theme_constant_override("separation", 10); v.add_child(ex)
	ex.add_child(lbl("宝石兑换：", 16, Color("#c9c5e6")))
	for k in D.econ.exchange:
		var X: Dictionary = D.econ.exchange[k]
		ex.add_child(btn("%s（%d 宝石）" % [X.name, int(X.gems)], func(): act(P.exchange(k), "兑换成功"), 15))

func page_talents() -> void:
	var v := VBoxContainer.new(); v.add_theme_constant_override("separation", 8); page.add_child(v)
	v.add_child(lbl("天赋点：剩余 %d / 共 %d（账号每升 1 级 +1） • 已装上 %d / %d（点已点亮的天赋可以装上 / 卸下）" % [P.tp_free(), P.tp_total(), P.o.tal.size(), int(D.econ.talentSlots)], 15, Color("#c9c5e6"), true))
	var row := HBoxContainer.new(); row.add_theme_constant_override("separation", 10); row.size_flags_vertical = Control.SIZE_EXPAND_FILL; v.add_child(row)
	for B in D.econ.branches:
		var col := VBoxContainer.new(); col.size_flags_horizontal = Control.SIZE_EXPAND_FILL; col.add_theme_constant_override("separation", 6); row.add_child(col)
		var bc := Color(str(BR_COL.get(B.id, "#ffffff")))
		col.add_child(lbl(str(B.name), 20, bc))
		for T in D.econ.talents:
			if T.br != B.id: continue
			var learned: bool = P.o.talents.has(T.id); var on: bool = P.o.tal.has(T.id)
			var b := Button.new(); b.custom_minimum_size = Vector2(0, 62); b.add_theme_font_size_override("font_size", 13)
			b.text = "%s%s  (%d点)\n%s" % ["[装] " if on else "", T.name, int(T.cost), T.desc]
			b.autowrap_mode = TextServer.AUTOWRAP_ARBITRARY
			if on: b.add_theme_color_override("font_color", Color("#ffe14d"))
			elif learned: b.add_theme_color_override("font_color", bc)
			else: b.modulate = Color(0.7, 0.7, 0.8)
			b.pressed.connect(func(): game.sfx.play("click"); act(P.toggle_talent(T.id) if learned else P.learn_talent(T.id), ("已装上 / 卸下 " if learned else "点亮了 ") + str(T.name)))
			col.add_child(b)

func page_quests() -> void:
	var v := VBoxContainer.new(); v.add_theme_constant_override("separation", 8); page.add_child(v)
	P.refresh_quests()
	v.add_child(lbl("每日任务（每天北京时间 0 点刷新）", 20, Color("#ffe14d")))
	var dq := P.daily_quests(Profile.day_index())
	for i in dq.size(): quest_row(v, dq[i], int(P.o.q.dp[i]))
	v.add_child(lbl("每周任务", 20, Color("#ffe14d")))
	for i in D.econ.weekly.size(): quest_row(v, D.econ.weekly[i], int(P.o.q.wp[i]))
	v.add_child(lbl("（原版的任务奖励是通行证经验；通行证还没移植，先折成一半数量的金币）", 13, Color("#9a96b8"), true))
	var o: Dictionary = P.o
	v.add_child(lbl("生涯：%d 局 • 胜 %d • 击毁 %d • 涂地 %d 格 • 最高 %d 连胜" % [o.matches, o.wins, o.kills, o.paint, o.bestStreak], 16, Color("#c9c5e6"), true))
	var rs := btn("重置存档", func(): confirm_reset(), 14, 120); rs.size_flags_horizontal = Control.SIZE_SHRINK_END; v.add_child(rs)

func quest_row(v: VBoxContainer, q: Array, n: int) -> void:
	var hb := HBoxContainer.new(); hb.add_theme_constant_override("separation", 10); v.add_child(hb)
	var done := n >= int(q[1])
	var l := lbl(("[完成] " if done else "") + P.quest_name(q), 16, Color("#6dff8a") if done else Color("#e6e2fa")); l.custom_minimum_size = Vector2(260, 0); hb.add_child(l)
	var pb := ProgressBar.new(); pb.max_value = float(q[1]); pb.value = n; pb.show_percentage = false; pb.custom_minimum_size = Vector2(300, 16); pb.size_flags_vertical = Control.SIZE_SHRINK_CENTER; hb.add_child(pb)
	hb.add_child(lbl("%d / %d" % [n, int(q[1])], 14, Color("#9a96b8")))
	hb.add_child(lbl("%d 金币" % (int(q[2]) / 2), 14, Color("#ffc531")))

# ---------------- 操作结果 / 弹窗 ----------------
func act(r: Dictionary, ok_msg: String) -> void:
	if r.ok: toast(ok_msg); game.sfx.play("pickup")
	else: toast(str(r.err)); game.sfx.play("lose", -10.0)
	refresh()

func close_popup() -> void:
	if popup != null: popup.queue_free(); popup = null

func make_popup() -> VBoxContainer:
	close_popup()
	popup = Control.new(); popup.set_anchors_preset(Control.PRESET_FULL_RECT); add_child(popup)
	var bg := ColorRect.new(); bg.color = Color(0.02, 0.01, 0.06, 0.82); bg.set_anchors_preset(Control.PRESET_FULL_RECT); popup.add_child(bg)
	var pc := PanelContainer.new(); pc.set_anchors_preset(Control.PRESET_CENTER); pc.custom_minimum_size = Vector2(620, 420); pc.position = Vector2(-310, -210); popup.add_child(pc)
	var v := VBoxContainer.new(); v.alignment = BoxContainer.ALIGNMENT_CENTER; v.add_theme_constant_override("separation", 12); pc.add_child(v)
	return v

func item_text(it: Dictionary) -> Array:
	match it.k:
		"pilot": return ["新驾驶员！ %s「%s」" % [D.pilots[it.id].name, D.pilots[it.id].code], Color(str(D.pilots[it.id].accent))]
		"mech": return ["新机体！ %s" % D.mechs[it.id].name, Color("#ffe14d")]
		"chest": return ["%s ×%d" % [D.econ.chests[it.id].name, int(it.n)], Color("#ffb000")]
	var s := "%s +%d" % [P.cur_name(it.k), int(it.n)]
	if it.has("dup"): s += "（都拥有了，换成金币）"
	if it.has("why"): s += "  " + str(it.why)
	return [s, Color(str(D.econ.cur[it.k].color)) if D.econ.cur.has(it.k) else Color.WHITE]

# 开宝箱动画：箱子摇晃 → 弹开 → 奖励一个个跳出来
func open_anim(cid: String, r: Dictionary) -> void:
	if not r.ok: act(r, ""); return
	refresh()
	var v := make_popup()
	var C: Dictionary = D.econ.chests[cid]
	var col: Color = [Color("#ffe14d"), Color("#c9ccd4"), Color("#4fb8ff"), Color("#ffc531")][int(C.tier)]
	var title := lbl(str(C.name), 34, col); title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER; v.add_child(title)
	var box := lbl("箱", 120, col); box.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER; box.pivot_offset = Vector2(310, 70); v.add_child(box)
	var list := VBoxContainer.new(); list.add_theme_constant_override("separation", 6); v.add_child(list)
	var tw := create_tween()
	for i in 6: tw.tween_property(box, "rotation", 0.12 * (1 if i % 2 == 0 else -1), 0.07)
	tw.tween_property(box, "rotation", 0.0, 0.05)
	tw.tween_callback(func(): game.sfx.play("super"); box.text = "开"; box.add_theme_color_override("font_color", Color.WHITE))
	tw.tween_property(box, "scale", Vector2(1.4, 1.4), 0.15)
	tw.tween_property(box, "modulate:a", 0.0, 0.2)
	for it in r.items:
		var tt: Array = item_text(it)
		var l := lbl(tt[0], 24 if it.k in ["pilot", "mech"] else 20, tt[1]); l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER; l.modulate.a = 0; l.scale = Vector2(0.6, 0.6)
		list.add_child(l)
		tw.tween_callback(func(): game.sfx.play("pickup" if not it.k in ["pilot", "mech"] else "win"))
		tw.tween_property(l, "modulate:a", 1.0, 0.12)
		tw.parallel().tween_property(l, "scale", Vector2.ONE, 0.18)
		tw.tween_interval(0.25 if not it.k in ["pilot", "mech"] else 0.6)
	var okb := btn("好的", func(): close_popup(); refresh(), 22, 200); okb.size_flags_horizontal = Control.SIZE_SHRINK_CENTER; okb.modulate.a = 0; v.add_child(okb)
	tw.tween_property(okb, "modulate:a", 1.0, 0.2)

# 第一次打开：欢迎 + 领新手宝箱
func welcome() -> void:
	var v := make_popup()
	var t := lbl("欢迎来到涂鸦机兵！", 34, Color("#ffe14d")); t.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER; v.add_child(t)
	var d := lbl("你是一名街头涂鸦机兵驾驶员。先从新手宝箱里领一位常驻驾驶员，然后带着 3 台常驻机体去涂满整个城市吧！\n\n打对战拿经验和金币，开宝箱收集驾驶员和机体，升级、突破、点天赋变得更强。", 17, Color("#e6e2fa"), true)
	d.custom_minimum_size = Vector2(560, 0); v.add_child(d)
	var b := btn("领取新手宝箱", func():
		P.tutorial()
		open_anim("starter", P.open_chest("starter")), 24, 260)
	b.size_flags_horizontal = Control.SIZE_SHRINK_CENTER; v.add_child(b)

func confirm_reset() -> void:
	var v := make_popup()
	var t := lbl("确定要重置存档吗？所有进度都会清空。", 22, Color("#ff6b5a"), true); t.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER; v.add_child(t)
	var hb := HBoxContainer.new(); hb.alignment = BoxContainer.ALIGNMENT_CENTER; hb.add_theme_constant_override("separation", 16); v.add_child(hb)
	hb.add_child(btn("取消", func(): close_popup(), 20, 160))
	hb.add_child(btn("重置", func(): P.reset(); close_popup(); view_pilot = ""; view_mech = P.o.weapon; refresh(); welcome(), 20, 160))
