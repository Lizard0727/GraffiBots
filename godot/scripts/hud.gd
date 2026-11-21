# 涂鸦机兵 Godot 版 —— HUD（计时、涂地比例、血条、状态、技能圈、小地图、击毁消息、准星、触屏摇杆）
extends Control

var game
var feeds: Array = []     # [text, color, time]
var banners: Array = []   # [text, color, time, pilot]
var dmgs: Array = []      # [world pos, text, time, color, size]

# 状态图标：字段名 → [文字, 颜色]
const STATUS := [
	["rush_t", "冲刺", "#ffd23f"], ["slow_t", "减速", "#7ad0ff"], ["dslow_t", "减速", "#7ad0ff"], ["silence_t", "沉默", "#b48cff"],
	["seal_t", "封印", "#b48cff"], ["bind_t", "束缚", "#b48cff"], ["blind_t", "致盲", "#ffffff"], ["mark_t", "被标记", "#ff3b52"],
	["lock_t", "被锁定", "#ff3b52"], ["jam_t", "干扰", "#9cff2e"], ["burn_t", "燃烧", "#ff6a1f"], ["poison_t", "中毒", "#9cff2e"],
	["cloak_t", "隐身", "#c9c5e6"], ["rally_t", "鼓舞", "#ffd23f"], ["nano_t", "修复", "#5ff0d0"], ["sup_t", "补给", "#6dff8a"],
]

func now() -> float:
	return Time.get_ticks_msec() / 1000.0

func feed(e: Array, verb: String) -> void:
	var t: Sim.Mech = game.player_by_id(e[1]); var k: Sim.Mech = game.player_by_id(e[2])
	if t == null: return
	var s := ("%s %s了 %s" % [k.name, verb, t.name]) if k != null and k != t else ("%s 倒下了" % t.name)
	feeds.push_front([s, game.team_col[k.team] if k != null else Color.WHITE, now()])
	if feeds.size() > 5: feeds.pop_back()

func banner(text: String, c: Color, P = null) -> void:
	banners = [[text, c, now(), P]]

func dmg_text(p: Sim.Mech, n: int, mine: bool) -> void:
	if p == null or n <= 0: return
	var c := Color("#ffe14d") if mine else (Color("#ff6b5a") if p == game.me else Color(1, 1, 1, 0.8))
	if not mine and p != game.me: return
	var jitter := Vector3(randf_range(-0.6, 0.6), 0, randf_range(-0.3, 0.3))
	dmgs.append([Vector3(p.x * game.K, (p.z + 56) * game.K, p.y * game.K) + jitter, str(n), now(), c, 20 + mini(14, n / 6)])

func float_text(p: Sim.Mech, s: String, c: Color) -> void:
	if p == null: return
	dmgs.append([Vector3(p.x * game.K, (p.z + 70) * game.K, p.y * game.K), s, now(), c, 22])

func txt(s: String, pos: Vector2, size: int, c: Color, align := HORIZONTAL_ALIGNMENT_CENTER, outline := 4) -> void:
	var f: Font = game.font
	var w := 1000.0
	var p := pos - Vector2(w / 2 if align == HORIZONTAL_ALIGNMENT_CENTER else (w if align == HORIZONTAL_ALIGNMENT_RIGHT else 0.0), -size * 0.35)
	if outline > 0: draw_string_outline(f, p, s, align, w, size, outline, Color(0, 0, 0, 0.85 * c.a))
	draw_string(f, p, s, align, w, size, c)

func ring(c: Vector2, r: float, k: float, col: Color, label: String, key: String, lit: bool, dim: bool) -> void:
	draw_circle(c, r + 6, Color(0, 0, 0, 0.55 if dim else 0.7))
	draw_arc(c, r, 0, TAU, 40, Color(1, 1, 1, 0.15), 6)
	if k > 0: draw_arc(c, r, -PI / 2, -PI / 2 + clampf(k, 0, 1) * TAU, 40, col, 6)
	if lit:
		draw_arc(c, r + 8 + sin(now() * 6) * 1.5, 0, TAU, 40, Color("#fff36b"), 3)
		draw_circle(c, r - 4, Color(1, 0.9, 0.3, 0.12 + 0.08 * sin(now() * 6)))
	txt(label, c, 17 if r > 34 else 14, Color(0.5, 0.5, 0.5) if dim else Color.WHITE)
	if key != "": txt(key, c + Vector2(0, r + 18), 12, Color("#a8a4c8"), HORIZONTAL_ALIGNMENT_CENTER, 3)

func _draw() -> void:
	if game.sim == null or game.state != "play": return
	var sim: Sim = game.sim
	var me: Sim.Mech = game.me
	var vs := get_viewport_rect().size
	var cam: Camera3D = game.cam
	# ---- 屏幕效果：低血量红边 / 致盲 ----
	if me.alive:
		var hk := clampf(me.hp / me.max_hp, 0, 1)
		if hk < 0.4:
			var a := (0.4 - hk) / 0.4 * (0.45 + 0.15 * sin(now() * 7))
			for i in 6:
				var t := 26.0 + i * 16.0
				var c := Color(1, 0.1, 0.15, a * (1.0 - i / 6.0) * 0.35)
				draw_rect(Rect2(0, 0, vs.x, t), c); draw_rect(Rect2(0, vs.y - t, vs.x, t), c)
				draw_rect(Rect2(0, 0, t, vs.y), c); draw_rect(Rect2(vs.x - t, 0, t, vs.y), c)
		if me.blind_t > 0:
			draw_rect(Rect2(Vector2.ZERO, vs), Color(1, 1, 1, clampf(me.blind_t, 0, 1) * 0.7))
	# ---- 头顶：名字 + 血条 ----
	for p in sim.players:
		if not p.alive: continue
		if p.team != me.team and not sim.visible_to(me.team, p): continue
		var n: Dictionary = game.mech_nodes[p.id]
		var wp: Vector3 = n.root.position + Vector3(0, 2.2 if p.foot else (3.4 * float(n.scale)), 0)
		if cam.is_position_behind(wp): continue
		var s := cam.unproject_position(wp)
		var self_p: bool = p == me
		var w := 60.0 if self_p else 48.0
		var col: Color = game.team_col[p.team]
		txt("你" if self_p else p.name, s + Vector2(0, -14), 14, Color.WHITE if self_p else col)
		draw_rect(Rect2(s.x - w / 2 - 2, s.y - 2, w + 4, 10), Color(0, 0, 0, 0.8))
		var k := clampf(p.hp / p.max_hp, 0, 1)
		var hc := Color("#6dff8a") if self_p else (Color("#ff5a6a") if p.team != me.team else Color("#4fc3ff"))
		draw_rect(Rect2(s.x - w / 2, s.y, w * k, 6), hc)
		if p.shield > 0: draw_rect(Rect2(s.x - w / 2, s.y - 4, w * clampf(p.shield / p.max_hp, 0, 1), 3), Color("#7af0ff"))
		if self_p:
			var sw := (w - 4) / 3.0
			for i in 3:
				var f := clampf(p.ammo - i, 0, 1)
				draw_rect(Rect2(s.x - w / 2 + i * (sw + 2), s.y + 10, sw, 5), Color(0, 0, 0, 0.8))
				draw_rect(Rect2(s.x - w / 2 + i * (sw + 2), s.y + 10, sw * f, 5), Color("#ffae2e"))
		# 状态
		var tags: Array = []
		for st in STATUS:
			if float(p.get(st[0])) > 0 and tags.size() < 3: tags.append(st)
		if p.foot: tags.push_front(["", "弹出", "#ffae2e"])
		if p.ov_t > 0: tags.push_front(["", "超载", "#ff4fd8"])
		if p.carry > 0: tags.push_front(["", ("封印石 %d" if sim.mode == "seal" else "电池 %d") % p.carry, "#ffe14d"])
		if sim.obj.has("tr") and sim.obj.tr.carrier == p: tags.push_front(["", "宝物", "#ffe14d"])
		if p.cubes > 0: tags.append(["", "箱 %d" % p.cubes, "#ffb000"])
		var tx := s.x - (tags.size() - 1) * 26.0
		for st in tags:
			txt(st[1], Vector2(tx, s.y + (24 if self_p else 18)), 11, Color(st[2]), HORIZONTAL_ALIGNMENT_CENTER, 3); tx += 52
	# ---- 伤害数字 ----
	var keep: Array = []
	for d in dmgs:
		var age: float = now() - d[2]
		if age > 0.9: continue
		keep.append(d)
		var wp2: Vector3 = d[0] + Vector3(0, age * 1.8, 0)
		if cam.is_position_behind(wp2): continue
		var c: Color = d[3]; c.a = 1.0 - max(0.0, age - 0.5) / 0.4
		var pop: float = 1.0 + maxf(0.0, 0.12 - age) * 4.0
		txt(d[1], cam.unproject_position(wp2), int(d[4] * pop), c)
	dmgs = keep
	# ---- 准星（电脑） ----
	if not game.touch_mode and me.alive:
		var mp := get_viewport().get_mouse_position()
		var cc: Color = game.team_col[me.team].lightened(0.3)
		var spread := 8.0 + (6.0 if me.firing else 0.0)
		for a in 4:
			var dv := Vector2.RIGHT.rotated(a * PI / 2)
			draw_line(mp + dv * spread, mp + dv * (spread + 9), Color(0, 0, 0, 0.7), 5)
			draw_line(mp + dv * spread, mp + dv * (spread + 9), cc, 2.5)
		draw_circle(mp, 2.5, cc)
	# ---- 顶部：计时 + 涂地比例 ----
	var t: int = int(ceil(max(0.0, sim.time_left)))
	draw_rect(Rect2(vs.x / 2 - 70, 10, 140, 50), Color(0, 0, 0, 0.75))
	txt("%d:%02d" % [t / 60, t % 60], Vector2(vs.x / 2, 34), 32, Color("#ff6b5a") if t <= 30 else Color.WHITE)
	if sim.mode == "turf":
		var tu: Array = game.turf
		var tot := float(max(1, tu[2]))
		var bw := 360.0; var bx := vs.x / 2 - bw / 2; var by := 68.0
		draw_rect(Rect2(bx - 2, by - 2, bw + 4, 18), Color(0, 0, 0, 0.75))
		draw_rect(Rect2(bx, by, bw * tu[0] / tot, 14), game.team_col[1])
		draw_rect(Rect2(bx + bw - bw * tu[1] / tot, by, bw * tu[1] / tot, 14), game.team_col[2])
		txt("%d%%" % int(100.0 * tu[0] / tot), Vector2(bx - 30, by + 7), 15, game.team_col[1])
		txt("%d%%" % int(100.0 * tu[1] / tot), Vector2(bx + bw + 30, by + 7), 15, game.team_col[2])
	else:
		draw_mode_panel(sim, me, vs)
	# ---- 小地图 ----
	var mw := 190.0; var mh := mw * sim.GH / sim.GW; var mx := vs.x - mw - 14; var my := 14.0
	draw_rect(Rect2(mx - 5, my - 5, mw + 10, mh + 10), Color(0, 0, 0, 0.75))
	draw_texture_rect(game.mini_tex, Rect2(mx, my, mw, mh), false)
	var ms := mw / sim.W
	var o: Dictionary = sim.obj
	if o.has("circle"):
		var c0: Dictionary = o.circle
		draw_arc(Vector2(mx + c0.x * ms, my + c0.y * ms), c0.r * ms, 0, TAU, 48, Color("#ff6b8a"), 2)
		for k in o.crates: draw_rect(Rect2(mx + k.x * ms - 2, my + k.y * ms - 2, 4, 4), Color("#ffb000"))
	if sim.mode == "zone":
		var Z: Dictionary = sim.MC.ZONE; var zc: Color = game.team_col[o.owner] if o.owner > 0 else Color.WHITE
		draw_rect(Rect2(mx + Z.x0 * 16 * ms, my + Z.y0 * 16 * ms, (Z.x1 - Z.x0) * 16 * ms, (Z.y1 - Z.y0) * 16 * ms), zc, false, 2)
	if o.has("tr"): draw_circle(Vector2(mx + o.tr.x * ms, my + o.tr.y * ms), 4, Color("#ffe14d"))
	if o.has("ball"): draw_circle(Vector2(mx + o.ball.x * ms, my + o.ball.y * ms), 4, Color.WHITE)
	if o.has("bats"):
		for bt in o.bats: draw_circle(Vector2(mx + bt.x * ms, my + bt.y * ms), 2, Color("#ffe14d") if sim.mode == "battery" else Color("#b48cff"))
	if o.has("fl"): draw_circle(Vector2(mx + o.fl.x * ms, my + o.fl.y * ms), 5, Color("#ff6ec4"))
	for p in sim.players:
		if not p.alive: continue
		var pos := Vector2(mx + p.x * ms, my + p.y * ms)
		if p.team == me.team:
			draw_circle(pos, 5 if p == me else 4, Color.WHITE if p == me else game.team_col[p.team])
			if p == me: draw_line(pos, pos + Vector2(cos(me.inp.a), sin(me.inp.a)) * 10, Color.WHITE, 2)
		elif sim.visible_to(me.team, p):
			draw_circle(pos, 5, Color("#ff3b52"))
	# ---- 击毁消息 ----
	var fy := 110.0 + mh
	for f in feeds:
		if now() - f[2] > 5: continue
		txt(f[0], Vector2(vs.x - 20, fy), 15, f[1], HORIZONTAL_ALIGNMENT_RIGHT, 3); fy += 22
	# ---- 技能 / 大招横幅（大招带驾驶员头像条） ----
	for b in banners:
		var age2: float = now() - b[2]
		if age2 < 1.6:
			var c2: Color = b[1]; c2.a = 1.0 - max(0.0, age2 - 1.0) / 0.6
			var slide := ease(clampf(age2 / 0.18, 0, 1), 0.3)
			if b[3] != null:
				var y0 := vs.y * 0.25
				var bc := Color(str(b[3].accent)); bc.a = 0.75 * c2.a
				draw_colored_polygon(PackedVector2Array([Vector2(-40 + slide * 40, y0 - 34), Vector2(vs.x * slide, y0 - 34), Vector2(vs.x * slide - 30, y0 + 34), Vector2(-40 + slide * 40, y0 + 34)]), bc)
				txt(str(b[3].name), Vector2(vs.x * 0.5, y0 - 52), 18, Color(1, 1, 1, c2.a))
			txt(b[0], Vector2(vs.x / 2, vs.y * 0.25), 32, c2, HORIZONTAL_ALIGNMENT_CENTER, 6)
	# ---- 倒计时 / 弹出 / 复活 ----
	if sim.countdown > 0:
		var cd: float = sim.countdown - floorf(sim.countdown)
		txt(str(int(ceil(sim.countdown))), vs / 2, int(96 + cd * 40), Color("#ffe14d"), HORIZONTAL_ALIGNMENT_CENTER, 8)
	elif sim.time < 0.8:
		txt("开打！", vs / 2, 84, Color("#ffe14d"), HORIZONTAL_ALIGNMENT_CENTER, 8)
	if not me.alive:
		if me.respawn_t > 100: txt("你出局了 • 正在观战" + ("，等下一局" if sim.mode == "elim" else ""), Vector2(vs.x / 2, vs.y * 0.6), 26, Color.WHITE)
		else: txt("%.1f 秒后复活" % max(0.0, me.respawn_t), Vector2(vs.x / 2, vs.y * 0.6), 30, Color.WHITE)
	elif me.foot:
		if me.rebuild_t > 100: txt("机体被打爆！这个模式只有一条命，驾驶员要活下去", Vector2(vs.x / 2, vs.y * 0.68), 20, Color("#ffae2e"))
		else: txt("机体被打爆！撑住 %.1f 秒，新机体就会空投下来" % max(0.0, me.rebuild_t), Vector2(vs.x / 2, vs.y * 0.68), 20, Color("#ffae2e"))
	if sim.time_left <= 10 and sim.time_left > 0:
		txt("最后 %d 秒！" % int(ceil(sim.time_left)), Vector2(vs.x / 2, 120), 22, Color("#ff6b5a"))
	# ---- 右下：攻击 / 大招 / 技能 ----
	var w: Dictionary = game.data.mechs[me.weapon]
	var P: Dictionary = game.data.pilots[me.pilot]
	var spk := clampf(me.sp / float(w.spNeed), 0, 1)
	var regen := me.skill_regen / float(sim.C.SKILL_REGEN)
	var atk_name: String = str(P.sidearm.name) if me.foot else str(w.short)
	var ovk: float = me.ov_t / float(sim.C.OV_TIME) if me.ov_t > 0 else me.ov / float(sim.C.OV_NEED)
	var ov_ready: bool = me.ov_t <= 0 and me.ov >= float(sim.C.OV_NEED)
	if game.touch_mode:
		var B: Dictionary = game.touch_buttons()
		ring(B.super[0], B.super[1], spk, Color("#ffdf2e"), "大招", "", spk >= 1 and not me.foot, me.foot)
		ring(B.skill[0], B.skill[1], regen if me.skill_uses <= 0 else 1.0, Color(str(P.accent)), str(P.skillInfo.short), "%d/%d" % [me.skill_uses, me.skill_max], false, me.skill_uses <= 0)
		ring(B.wheel[0], B.wheel[1], 1.0, Color("#7af0ff"), "滚轮", "", game.wheel_hold, me.foot)
		ring(B.jump[0], B.jump[1], 1.0, Color("#c9c5e6"), "跳", "", false, false)
		ring(B.ov[0], B.ov[1], ovk, Color("#ff4fd8"), "超载", "", ov_ready, me.ov_t <= 0 and not ov_ready)
		for st in [game.t_move, game.t_aim]:
			if st.id >= 0:
				draw_circle(st.o, 70, Color(1, 1, 1, 0.12)); draw_arc(st.o, 70, 0, TAU, 40, Color(1, 1, 1, 0.35), 3)
				draw_circle(st.o + st.v * 70, 30, Color(1, 1, 1, 0.45))
		if game.t_move.id < 0: txt("左边拖动：移动", Vector2(160, vs.y - 60), 15, Color(1, 1, 1, 0.5))
	else:
		var bx2 := vs.x - 70; var by2 := vs.y - 70
		var ak: float = me.ammo / 3.0 if str(w.attack) != "charge" or me.charge <= 0 or me.foot else me.charge
		ring(Vector2(bx2, by2), 40, ak, Color("#ffae2e"), atk_name, "左键 • %d/3" % int(me.ammo), false, false)
		ring(Vector2(bx2 - 104, by2 + 6), 32, spk, Color("#ffdf2e"), "大招", "E / 右键", spk >= 1 and not me.foot, me.foot)
		ring(Vector2(bx2 - 186, by2 + 12), 26, regen if me.skill_uses <= 0 else 1.0, Color(str(P.accent)), str(P.skillInfo.short), "Q • %d/%d" % [me.skill_uses, me.skill_max], false, me.skill_uses <= 0)
		if me.skill_uses < me.skill_max:
			draw_arc(Vector2(bx2 - 186, by2 + 12), 33, -PI / 2, -PI / 2 + regen * TAU, 32, Color(1, 1, 1, 0.4), 3)
		ring(Vector2(bx2 - 256, by2 + 16), 22, ovk, Color("#ff4fd8"), "超载", "R", ov_ready, me.ov_t <= 0 and not ov_ready)
		txt("空格 跳跃 • Shift 滚轮 • R 超载 • Esc 菜单", Vector2(bx2 - 90, by2 - 62), 12, Color("#a8a4c8"), HORIZONTAL_ALIGNMENT_CENTER, 3)
	if sim.reveal[me.team] > sim.time:
		txt("全队视野：所有敌人都暴露了", Vector2(vs.x / 2, 100), 15, Color("#7ad0ff"))

# 模式比分（顶部，代替涂地比例条）
func draw_mode_panel(sim: Sim, me: Sim.Mech, vs: Vector2) -> void:
	var o: Dictionary = sim.obj; var MC: Dictionary = sim.MC
	var c1: Color = game.team_col[me.team]; var c2: Color = game.team_col[3 - me.team] if me.team <= 2 else Color.WHITE
	var y := 76.0
	var two := func(a: String, b: String, label: String) -> void:
		draw_rect(Rect2(vs.x / 2 - 200, y - 14, 400, 28), Color(0, 0, 0, 0.7))
		txt(a, Vector2(vs.x / 2 - 120, y), 22, c1); txt(b, Vector2(vs.x / 2 + 120, y), 22, c2); txt(label, Vector2(vs.x / 2, y), 14, Color("#c9c5e6"))
	var s1: int = o.score[me.team] if me.team <= 2 else 0
	var s2: int = o.score[3 - me.team] if me.team <= 2 else 0
	match sim.mode:
		"zone": two.call("%d" % int(ceil(o.count[me.team])), "%d" % int(ceil(o.count[3 - me.team])), "据点 %d%% / %d%%" % [int(o.share[me.team] * 100), int(o.share[3 - me.team] * 100)])
		"escort": two.call(str(s1), str(s2), "宝物 先得 %d 分" % int(MC.ESCORT_TARGET))
		"soccer": two.call(str(s1), str(s2), "足球 先进 %d 球" % int(MC.SOCCER_TARGET))
		"battery": two.call(str(s1), str(s2), "电池 先存 %d 个" % int(MC.BATTERY_TARGET))
		"seal": two.call(str(s1), str(s2), "封印石 先存 %d 个" % int(MC.SEAL.target))
		"park": two.call(str(s1), str(s2), "花车 先到 %d 分" % int(MC.PARK.target))
		"elim": two.call(str(o.wins[me.team]), str(o.wins[3 - me.team]), "第 %d 局 • 存活 %d / %d" % [int(o.round), sim.alive_of(me.team), sim.alive_of(3 - me.team)])
		"escape4", "escape8":
			var left := 0
			for t in range(1, sim.teams + 1):
				if sim.alive_of(t) > 0: left += 1
			var c: Dictionary = o.circle
			var st := "毒圈第 %d 阶段" % (int(c.stage) + 1) if c.phase != 2 else "毒圈已缩到最小"
			draw_rect(Rect2(vs.x / 2 - 200, y - 14, 400, 28), Color(0, 0, 0, 0.7))
			txt("剩余 %d 队 • %s • 箱子 %d" % [left, st, me.cubes], Vector2(vs.x / 2, y), 16, Color.WHITE)
		"raid":
			var b: Sim.Mech = sim.boss
			if b == null: return
			var k := clampf(b.hp / b.max_hp, 0, 1)
			draw_rect(Rect2(vs.x / 2 - 252, y - 12, 504, 26), Color(0, 0, 0, 0.8))
			draw_rect(Rect2(vs.x / 2 - 248, y - 8, 496 * k, 18), Color("#ff3b52") if k < float(MC.RAID.rage) else Color("#b48cff"))
			txt("百目  %d / %d" % [int(b.hp), int(b.max_hp)], Vector2(vs.x / 2, y), 15, Color.WHITE)
