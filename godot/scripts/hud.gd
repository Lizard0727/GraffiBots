# 涂鸦机兵 Godot 样品版 —— HUD（计时、涂地比例、血条、技能圈、小地图、击倒消息、触屏摇杆）
extends Control

var game
var feeds: Array = []     # [text, color, time]
var banners: Array = []   # [text, color, time]
var dmgs: Array = []      # [world pos, text, time]

func now() -> float:
	return Time.get_ticks_msec() / 1000.0

func feed(e: Array) -> void:
	var t: Sim.Mech = game.player_by_id(e[1]); var k: Sim.Mech = game.player_by_id(e[2])
	if t == null: return
	var txt := ("%s 击倒了 %s" % [k.name, t.name]) if k != null else ("%s 倒下了" % t.name)
	feeds.push_front([txt, game.team_col[k.team] if k != null else Color.WHITE, now()])
	if feeds.size() > 5: feeds.pop_back()

func banner(text: String, c: Color) -> void:
	banners = [[text, c, now()]]

func dmg_text(p: Sim.Mech, n: int) -> void:
	if p == null: return
	dmgs.append([Vector3(p.x * game.K, (p.z + 50) * game.K, p.y * game.K), str(n), now(), p.team])

func txt(s: String, pos: Vector2, size: int, c: Color, align := HORIZONTAL_ALIGNMENT_CENTER, outline := 4) -> void:
	var f: Font = game.font
	var w := 1000.0
	var p := pos - Vector2(w / 2 if align == HORIZONTAL_ALIGNMENT_CENTER else (w if align == HORIZONTAL_ALIGNMENT_RIGHT else 0.0), -size * 0.35)
	if outline > 0: draw_string_outline(f, p, s, align, w, size, outline, Color(0, 0, 0, 0.85))
	draw_string(f, p, s, align, w, size, c)

func ring(c: Vector2, r: float, k: float, col: Color, label: String, key: String, lit: bool, dim: bool) -> void:
	draw_circle(c, r + 6, Color(0, 0, 0, 0.55 if dim else 0.7))
	draw_arc(c, r, 0, TAU, 40, Color(1, 1, 1, 0.15), 6)
	if k > 0: draw_arc(c, r, -PI / 2, -PI / 2 + clampf(k, 0, 1) * TAU, 40, col, 6)
	if lit: draw_arc(c, r + 8 + sin(now() * 6) * 1.5, 0, TAU, 40, Color("#fff36b"), 3)
	txt(label, c, 17 if r > 34 else 14, Color(0.5, 0.5, 0.5) if dim else Color.WHITE)
	txt(key, c + Vector2(0, r + 18), 12, Color("#a8a4c8"), HORIZONTAL_ALIGNMENT_CENTER, 3)

func _draw() -> void:
	if game.sim == null or game.state != "play": return
	var sim: Sim = game.sim
	var me: Sim.Mech = game.me
	var vs := get_viewport_rect().size
	var cam: Camera3D = game.cam
	# ---- 头顶：名字 + 血条 ----
	for p in sim.players:
		if not p.alive: continue
		if p.team != me.team and not sim.visible_to(me.team, p): continue
		var n: Dictionary = game.mech_nodes[p.id]
		var wp: Vector3 = n.root.position + Vector3(0, 3.4, 0)
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
		if self_p:
			var sw := (w - 4) / 3.0
			for i in 3:
				var f := clampf(p.ammo - i, 0, 1)
				draw_rect(Rect2(s.x - w / 2 + i * (sw + 2), s.y + 10, sw, 5), Color(0, 0, 0, 0.8))
				draw_rect(Rect2(s.x - w / 2 + i * (sw + 2), s.y + 10, sw * f, 5), Color("#ffae2e"))
		if p.hidden and self_p: txt("隐身中", s + Vector2(0, 30), 12, Color("#c9c5e6"))
	# ---- 伤害数字 ----
	var keep: Array = []
	for d in dmgs:
		var age: float = now() - d[2]
		if age > 0.8: continue
		keep.append(d)
		var wp2: Vector3 = d[0] + Vector3(0, age * 1.5, 0)
		if cam.is_position_behind(wp2): continue
		var c := Color("#ffe14d") if d[3] != me.team else Color("#ff6b5a")
		c.a = 1.0 - age / 0.8
		txt(d[1], cam.unproject_position(wp2), 18, c)
	dmgs = keep
	# ---- 顶部：计时 + 涂地比例 ----
	var t: int = int(ceil(max(0.0, sim.time_left)))
	draw_rect(Rect2(vs.x / 2 - 70, 10, 140, 50), Color(0, 0, 0, 0.75))
	txt("%d:%02d" % [t / 60, t % 60], Vector2(vs.x / 2, 34), 32, Color("#ff6b5a") if t <= 30 else Color.WHITE)
	var tu: Array = game.turf
	var tot := float(max(1, tu[2]))
	var bw := 360.0; var bx := vs.x / 2 - bw / 2; var by := 68.0
	draw_rect(Rect2(bx - 2, by - 2, bw + 4, 18), Color(0, 0, 0, 0.75))
	draw_rect(Rect2(bx, by, bw * tu[0] / tot, 14), game.team_col[1])
	draw_rect(Rect2(bx + bw - bw * tu[1] / tot, by, bw * tu[1] / tot, 14), game.team_col[2])
	txt("%d%%" % int(100.0 * tu[0] / tot), Vector2(bx - 30, by + 7), 15, game.team_col[1])
	txt("%d%%" % int(100.0 * tu[1] / tot), Vector2(bx + bw + 30, by + 7), 15, game.team_col[2])
	# ---- 小地图 ----
	var mw := 190.0; var mh := mw * sim.GH / sim.GW; var mx := vs.x - mw - 14; var my := 14.0
	draw_rect(Rect2(mx - 5, my - 5, mw + 10, mh + 10), Color(0, 0, 0, 0.75))
	draw_texture_rect(game.mini_tex, Rect2(mx, my, mw, mh), false)
	var ms := mw / sim.W
	for p in sim.players:
		if not p.alive: continue
		var pos := Vector2(mx + p.x * ms, my + p.y * ms)
		if p.team == me.team:
			draw_circle(pos, 5 if p == me else 4, Color.WHITE if p == me else game.team_col[p.team])
		elif sim.reveal[me.team] > sim.time:
			draw_circle(pos, 5, Color("#ff3b52"))
	# ---- 击倒消息 ----
	var fy := 110.0
	for f in feeds:
		if now() - f[2] > 5: continue
		txt(f[0], Vector2(vs.x - 20, fy), 15, f[1], HORIZONTAL_ALIGNMENT_RIGHT, 3); fy += 22
	# ---- 技能 / 大招横幅 ----
	for b in banners:
		var age2: float = now() - b[2]
		if age2 < 1.6:
			var c2: Color = b[1]; c2.a = 1.0 - max(0.0, age2 - 1.0) / 0.6
			txt(b[0], Vector2(vs.x / 2, vs.y * 0.25), 30, c2)
	# ---- 倒计时 / 复活 ----
	if sim.countdown > 0:
		txt(str(int(ceil(sim.countdown))), vs / 2, 96, Color("#ffe14d"))
	elif sim.time < 0.8:
		txt("开打！", vs / 2, 80, Color("#ffe14d"))
	if not me.alive:
		txt("%.1f 秒后复活" % max(0.0, me.respawn_t), Vector2(vs.x / 2, vs.y * 0.6), 30, Color.WHITE)
	if sim.time_left <= 10 and sim.time_left > 0:
		txt("最后 %d 秒！" % int(ceil(sim.time_left)), Vector2(vs.x / 2, 120), 22, Color("#ff6b5a"))
	# ---- 右下：攻击 / 大招 / 技能 ----
	var w: Dictionary = sim.weapon_of(me)
	var P: Dictionary = game.data.pilots[me.pilot]
	var spk := clampf(me.sp / float(w.spNeed), 0, 1)
	var regen := me.skill_regen / float(sim.C.SKILL_REGEN)
	if game.touch_mode:
		var B: Dictionary = game.touch_buttons()
		ring(B.super[0], B.super[1], spk, Color("#ffdf2e"), "大招", "", spk >= 1, false)
		ring(B.skill[0], B.skill[1], regen if me.skill_uses <= 0 else 1.0, Color(str(P.accent)), str(P.skillInfo.short), "%d/%d" % [me.skill_uses, me.skill_max], false, me.skill_uses <= 0)
		ring(B.wheel[0], B.wheel[1], 1.0, Color("#7af0ff"), "滚轮", "", game.wheel_hold, false)
		ring(B.jump[0], B.jump[1], 1.0, Color("#c9c5e6"), "跳", "", false, false)
		for st in [game.t_move, game.t_aim]:
			if st.id >= 0:
				draw_circle(st.o, 70, Color(1, 1, 1, 0.12)); draw_arc(st.o, 70, 0, TAU, 40, Color(1, 1, 1, 0.35), 3)
				draw_circle(st.o + st.v * 70, 30, Color(1, 1, 1, 0.45))
		if game.t_move.id < 0: txt("左边拖动：移动", Vector2(160, vs.y - 60), 15, Color(1, 1, 1, 0.5))
	else:
		var bx2 := vs.x - 70; var by2 := vs.y - 70
		ring(Vector2(bx2, by2), 40, me.ammo / 3.0 if w.attack != "charge" or me.charge <= 0 else me.charge, Color("#ffae2e"), str(w.short), "左键 • %d/3" % int(me.ammo), false, false)
		ring(Vector2(bx2 - 104, by2 + 6), 32, spk, Color("#ffdf2e"), "大招", "E / 右键", spk >= 1, false)
		ring(Vector2(bx2 - 186, by2 + 12), 26, regen if me.skill_uses <= 0 else 1.0, Color(str(P.accent)), str(P.skillInfo.short), "Q • %d/%d" % [me.skill_uses, me.skill_max], false, me.skill_uses <= 0)
		if me.skill_uses < me.skill_max:
			draw_arc(Vector2(bx2 - 186, by2 + 12), 33, -PI / 2, -PI / 2 + regen * TAU, 32, Color(1, 1, 1, 0.4), 3)
		txt("空格 跳跃 • Shift 滚轮", Vector2(bx2 - 90, by2 - 62), 12, Color("#a8a4c8"), HORIZONTAL_ALIGNMENT_CENTER, 3)
	if sim.reveal[me.team] > sim.time:
		txt("全队视野：所有敌人都暴露了", Vector2(vs.x / 2, 100), 15, Color("#7ad0ff"))
