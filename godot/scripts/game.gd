# 涂鸦机兵 Godot 样品版 —— 主场景：菜单、3D 画面、输入、特效
# 模拟在 sim.gd（每秒 30 次），画面每帧插值显示
extends Node3D

const K := 1.0 / 16.0          # 原版 1 格 = 16 像素 → Godot 1 个单位
const TICK := 1.0 / 30.0
const PILOTS := ["blaze", "frost"]
const MECHS := ["blaster", "charger"]
const BOT_NAMES := ["Pixel", "Juno", "Tofu", "Ash", "Mochi", "Rex", "Kiwi", "Nova"]

var data: Dictionary
var sim: Sim
var me: Sim.Mech
var state := "menu"
var acc := 0.0
var sel_pilot := "blaze"
var sel_mech := "blaster"
var team_col := [Color.WHITE, Color.WHITE, Color.WHITE]
var font: FontFile
var theme_ui: Theme

var cam: Camera3D
var paint_img: Image
var paint_tex: ImageTexture
var base_tex: ImageTexture
var mini_img: Image
var mini_tex: ImageTexture
var base_cols := PackedColorArray()
var mech_nodes := {}            # id -> {root, body, ball, prev: Vector3, cur: Vector3, a_prev, a_cur}
var proj_mm := [null, null, null]
var fx_list: Array = []          # 短暂的特效节点 [node, life, kind]
var turf := [0, 0, 1]
var turf_t := 0.0
var hud: Control
var menu: Control
var result_ui: Control
var mats := {}

# 触屏
var touch_mode := false
var t_move := {"id": -1, "o": Vector2.ZERO, "v": Vector2.ZERO}
var t_aim := {"id": -1, "o": Vector2.ZERO, "v": Vector2.ZERO}
var t_btn := {}                  # 按钮名 -> 触点 id
var wheel_hold := false
var shot_t := 0.0

func _ready() -> void:
	var f := FileAccess.open("res://data/game.json", FileAccess.READ)
	data = JSON.parse_string(f.get_as_text())
	for i in [1, 2]: team_col[i] = Color(str(data.colors.c[i]))
	font = load("res://fonts/huangyou.ttf")
	theme_ui = Theme.new()
	theme_ui.default_font = font
	theme_ui.default_font_size = 22
	var sb := func(bg: Color, border: Color) -> StyleBoxFlat:
		var s := StyleBoxFlat.new(); s.bg_color = bg; s.border_color = border; s.set_border_width_all(3); s.set_corner_radius_all(12)
		s.content_margin_left = 14; s.content_margin_right = 14; s.content_margin_top = 8; s.content_margin_bottom = 8
		return s
	theme_ui.set_stylebox("normal", "Button", sb.call(Color("#262147"), Color("#4a4380")))
	theme_ui.set_stylebox("hover", "Button", sb.call(Color("#342d63"), Color("#7a70c8")))
	theme_ui.set_stylebox("pressed", "Button", sb.call(Color("#ffe14d"), Color("#fff3a8")))
	theme_ui.set_stylebox("hover_pressed", "Button", sb.call(Color("#ffe97a"), Color("#fff3a8")))
	theme_ui.set_stylebox("focus", "Button", StyleBoxEmpty.new())
	theme_ui.set_color("font_pressed_color", "Button", Color("#1a1530"))
	theme_ui.set_color("font_hover_pressed_color", "Button", Color("#1a1530"))
	theme_ui.set_color("font_color", "Button", Color("#f2eefc"))
	touch_mode = DisplayServer.is_touchscreen_available() and OS.has_feature("mobile")
	setup_world()
	build_terrain()
	hud = preload("res://scripts/hud.gd").new()
	hud.game = self
	hud.set_anchors_preset(Control.PRESET_FULL_RECT)
	hud.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var layer := CanvasLayer.new(); add_child(layer); layer.add_child(hud)
	menu = build_menu(); layer.add_child(menu)
	result_ui = Control.new(); result_ui.set_anchors_preset(Control.PRESET_FULL_RECT); result_ui.theme = theme_ui; result_ui.visible = false; layer.add_child(result_ui)
	# 自动测试：GB_AUTOPLAY=1 时直接开局（截图用）
	if OS.get_environment("GB_AUTOPLAY") != "":
		start_match(OS.get_environment("GB_PILOT") if OS.get_environment("GB_PILOT") != "" else "blaze", OS.get_environment("GB_MECH") if OS.get_environment("GB_MECH") != "" else "blaster")

# ---------------- 场景 ----------------
func mat(c: Color, emit := 0.0, alpha := 1.0) -> StandardMaterial3D:
	var key := "%s|%s|%s" % [c.to_html(), emit, alpha]
	if mats.has(key): return mats[key]
	var m := StandardMaterial3D.new()
	m.albedo_color = Color(c, alpha)
	m.roughness = 0.6
	if emit > 0: m.emission_enabled = true; m.emission = c; m.emission_energy_multiplier = emit
	if alpha < 1.0: m.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	mats[key] = m
	return m

func setup_world() -> void:
	var env := Environment.new()
	env.background_mode = Environment.BG_COLOR
	env.background_color = Color("#0d0b18")
	env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	env.ambient_light_color = Color("#b8b4ff")
	env.ambient_light_energy = 0.55
	env.tonemap_mode = Environment.TONE_MAPPER_FILMIC
	env.glow_enabled = true
	env.glow_intensity = 0.6
	var we := WorldEnvironment.new(); we.environment = env; add_child(we)
	var sun := DirectionalLight3D.new()
	sun.rotation_degrees = Vector3(-58, 38, 0)
	sun.light_energy = 1.15
	sun.shadow_enabled = true
	sun.directional_shadow_max_distance = 60
	add_child(sun)
	cam = Camera3D.new(); cam.fov = 42; add_child(cam)
	cam.position = Vector3(60, 60, 75); cam.look_at(Vector3(60, 0, 40))

func base_color(i: int) -> Color:
	var m: Dictionary = data.map
	var gw := int(m.gw)
	var cx := i % gw; var cy := i / gw
	var t := float(m.top[i])
	if m.solid[i]: return Color("#5b5675")
	if m.bush[i]: return Color("#2c5a3c")
	if m.pad[i]: return Color("#ffd23f")
	var c := Color("#3a3650") if t < 1 else (Color("#4a4566") if t < 60 else Color("#56507a"))
	if (cx + cy) % 2 == 0: c = c.lightened(0.04)
	return c

func build_terrain() -> void:
	var m: Dictionary = data.map
	var gw := int(m.gw); var gh := int(m.gh)
	paint_img = Image.create(gw, gh, false, Image.FORMAT_RGBA8)   # 涂料：颜色 × 覆盖度（预乘 alpha），没涂 = 透明
	mini_img = Image.create(gw, gh, false, Image.FORMAT_RGBA8)    # 小地图：底色 + 涂料
	var base_img := Image.create(gw, gh, false, Image.FORMAT_RGBA8)
	base_cols.resize(gw * gh)
	for i in gw * gh:
		base_cols[i] = base_color(i)
		base_img.set_pixel(i % gw, i / gw, base_cols[i])
		mini_img.set_pixel(i % gw, i / gw, base_cols[i])
		paint_img.set_pixel(i % gw, i / gw, Color(0, 0, 0, 0))
	paint_tex = ImageTexture.create_from_image(paint_img)
	base_tex = ImageTexture.create_from_image(base_img)
	mini_tex = ImageTexture.create_from_image(mini_img)
	var st_top := SurfaceTool.new(); st_top.begin(Mesh.PRIMITIVE_TRIANGLES)
	var st_side := SurfaceTool.new(); st_side.begin(Mesh.PRIMITIVE_TRIANGLES)
	var topf := func(cx: int, cy: int) -> float:
		if cx < 0 or cy < 0 or cx >= gw or cy >= gh: return -0.5
		return float(m.top[cy * gw + cx]) * K
	for cy in gh:
		for cx in gw:
			var h: float = topf.call(cx, cy)
			var u0 := float(cx) / gw; var u1 := float(cx + 1) / gw; var v0 := float(cy) / gh; var v1 := float(cy + 1) / gh
			st_top.set_normal(Vector3.UP)
			for q in [[cx, cy, u0, v0], [cx + 1, cy, u1, v0], [cx + 1, cy + 1, u1, v1], [cx, cy, u0, v0], [cx + 1, cy + 1, u1, v1], [cx, cy + 1, u0, v1]]:
				st_top.set_uv(Vector2(q[2], q[3])); st_top.add_vertex(Vector3(q[0], h, q[1]))
			# 侧面：比邻居高的边画一面墙
			var side_c := Color("#2a2740") if h < 2 else (Color("#3b3658") if h < 6 else Color("#47406b"))
			for nb in [[1, 0], [-1, 0], [0, 1], [0, -1]]:
				var nh: float = topf.call(cx + nb[0], cy + nb[1])
				if nh >= h - 0.01: continue
				var a: Vector3; var b: Vector3
				if nb[0] == 1: a = Vector3(cx + 1, 0, cy); b = Vector3(cx + 1, 0, cy + 1)
				elif nb[0] == -1: a = Vector3(cx, 0, cy + 1); b = Vector3(cx, 0, cy)
				elif nb[1] == 1: a = Vector3(cx + 1, 0, cy + 1); b = Vector3(cx, 0, cy + 1)
				else: a = Vector3(cx, 0, cy); b = Vector3(cx + 1, 0, cy)
				var n := Vector3(nb[0], 0, nb[1])
				var lo := Color(side_c.darkened(0.25))
				for vv in [[a, nh, lo], [b, nh, lo], [b, h, side_c], [a, nh, lo], [b, h, side_c], [a, h, side_c]]:
					st_side.set_normal(n); st_side.set_color(vv[2]); st_side.add_vertex(Vector3(vv[0].x, vv[1], vv[0].z))
	var mesh := ArrayMesh.new()
	st_top.commit(mesh)
	st_side.commit(mesh)
	var top_mat := ShaderMaterial.new()
	top_mat.shader = load("res://shaders/turf.gdshader")
	top_mat.set_shader_parameter("paint_tex", paint_tex)
	top_mat.set_shader_parameter("base_tex", base_tex)
	top_mat.set_shader_parameter("grid_size", Vector2(gw, gh))
	# 地图外面的深色地板
	var floor_mi := MeshInstance3D.new(); var pm2 := PlaneMesh.new(); pm2.size = Vector2(400, 400); pm2.material = mat(Color("#0d0b18")); floor_mi.mesh = pm2
	floor_mi.position = Vector3(gw / 2.0, -0.6, gh / 2.0); add_child(floor_mi)
	var side_mat := StandardMaterial3D.new()
	side_mat.vertex_color_use_as_albedo = true
	side_mat.cull_mode = BaseMaterial3D.CULL_DISABLED
	side_mat.roughness = 0.9
	mesh.surface_set_material(0, top_mat)
	mesh.surface_set_material(1, side_mat)
	var mi := MeshInstance3D.new(); mi.mesh = mesh; add_child(mi)
	# 草丛
	var bush_cells: Array = []
	for i in gw * gh:
		if m.bush[i] and i % 2 == (i / gw) % 2: bush_cells.append(i)
	var mm := MultiMesh.new(); mm.transform_format = MultiMesh.TRANSFORM_3D
	var sph := SphereMesh.new(); sph.radius = 0.75; sph.height = 1.2; sph.radial_segments = 10; sph.rings = 5
	sph.material = mat(Color("#3fbf5f"))
	mm.mesh = sph; mm.instance_count = bush_cells.size()
	var rn := RandomNumberGenerator.new(); rn.seed = 7
	for k in bush_cells.size():
		var i: int = bush_cells[k]
		var s := rn.randf_range(0.9, 1.3)
		mm.set_instance_transform(k, Transform3D(Basis().scaled(Vector3(s, s * 0.9, s)), Vector3(i % gw + 0.5 + rn.randf_range(-0.2, 0.2), 0.45, i / gw + 0.5 + rn.randf_range(-0.2, 0.2))))
	var mmi := MultiMeshInstance3D.new(); mmi.multimesh = mm; add_child(mmi)
	# 子弹（每队一个 MultiMesh）
	for t in [1, 2]:
		var pm := MultiMesh.new(); pm.transform_format = MultiMesh.TRANSFORM_3D
		var bs := SphereMesh.new(); bs.radius = 0.28; bs.height = 0.56; bs.radial_segments = 8; bs.rings = 4
		bs.material = mat(team_col[t], 1.6)
		pm.mesh = bs; pm.instance_count = 400; pm.visible_instance_count = 0
		var pmi := MultiMeshInstance3D.new(); pmi.multimesh = pm; add_child(pmi)
		proj_mm[t] = pm

# ---------------- 菜单 ----------------
func build_menu() -> Control:
	var root := Control.new(); root.set_anchors_preset(Control.PRESET_FULL_RECT); root.theme = theme_ui
	var bg := ColorRect.new(); bg.color = Color(0.05, 0.04, 0.1, 0.78); bg.set_anchors_preset(Control.PRESET_FULL_RECT); root.add_child(bg)
	var box := VBoxContainer.new(); box.set_anchors_preset(Control.PRESET_CENTER); box.alignment = BoxContainer.ALIGNMENT_CENTER
	box.add_theme_constant_override("separation", 14)
	box.position = Vector2(-330, -300); box.custom_minimum_size = Vector2(660, 600)
	root.add_child(box)
	var title := Label.new(); title.text = "涂鸦机兵 GRAFFIBOTS"; title.add_theme_font_size_override("font_size", 56); title.add_theme_color_override("font_color", Color("#ffe14d")); title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER; box.add_child(title)
	var sub := Label.new(); sub.text = "Godot 样品版 · 4 对 4 涂地大战 · %s" % data.map.name; sub.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER; sub.add_theme_color_override("font_color", Color("#c9c5e6")); box.add_child(sub)
	var mk_row := func(label: String, ids: Array, names: Callable, cur: String, on_pick: Callable) -> HBoxContainer:
		var row := HBoxContainer.new(); row.alignment = BoxContainer.ALIGNMENT_CENTER; row.add_theme_constant_override("separation", 12)
		var l := Label.new(); l.text = label; l.custom_minimum_size = Vector2(110, 0); row.add_child(l)
		var group := ButtonGroup.new()
		for id in ids:
			var b := Button.new(); b.toggle_mode = true; b.button_group = group; b.text = names.call(id); b.custom_minimum_size = Vector2(250, 76)
			b.button_pressed = id == cur
			b.pressed.connect(func(): on_pick.call(id))
			row.add_child(b)
		return row
	box.add_child(mk_row.call("驾驶员", PILOTS, func(id): var P = data.pilots[id]; return "%s「%s」\n技能：%s" % [P.name, P.code, P.skillInfo.name], sel_pilot, func(id): sel_pilot = id))
	box.add_child(mk_row.call("机体", MECHS, func(id): var w = data.mechs[id]; return "%s\n大招：%s" % [w.name, w.specialInfo.name], sel_mech, func(id): sel_mech = id))
	var go := Button.new(); go.text = "开始对战"; go.custom_minimum_size = Vector2(320, 84); go.add_theme_font_size_override("font_size", 34)
	go.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	go.pressed.connect(func(): start_match(sel_pilot, sel_mech))
	box.add_child(go)
	var help := Label.new(); help.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER; help.add_theme_color_override("font_color", Color("#9a96b8")); help.add_theme_font_size_override("font_size", 18)
	help.text = "电脑：WASD 移动 · 鼠标瞄准 · 左键攻击 · Q 技能 · E / 右键 大招 · Shift 滚轮 · 空格 跳\n手机：左摇杆移动 · 右摇杆瞄准并攻击 · 右下角按钮放技能 / 大招"
	box.add_child(help)
	return root

func show_result() -> void:
	for c in result_ui.get_children(): c.queue_free()
	var bg := ColorRect.new(); bg.color = Color(0.03, 0.02, 0.08, 0.72); bg.set_anchors_preset(Control.PRESET_FULL_RECT); result_ui.add_child(bg)
	var box := VBoxContainer.new(); box.set_anchors_preset(Control.PRESET_CENTER); box.position = Vector2(-260, -200); box.custom_minimum_size = Vector2(520, 400)
	box.alignment = BoxContainer.ALIGNMENT_CENTER; box.add_theme_constant_override("separation", 16); result_ui.add_child(box)
	var r: Dictionary = sim.result
	var win := int(r.winner)
	var t := Label.new(); t.text = "胜利！" if win == me.team else ("平局" if win == 0 else "失败"); t.add_theme_font_size_override("font_size", 72)
	t.add_theme_color_override("font_color", Color("#ffe14d") if win == me.team else Color("#c9c5e6")); t.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER; box.add_child(t)
	var pa: float = 100.0 * float(r.a) / max(1.0, float(r.tot)); var pb: float = 100.0 * float(r.b) / max(1.0, float(r.tot))
	var s := Label.new(); s.text = "我方 %.1f%%   对方 %.1f%%\n击倒 %d · 倒下 %d · 涂地 %d 格" % [pa, pb, me.kills, me.deaths, me.painted]; s.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER; box.add_child(s)
	var again := Button.new(); again.text = "再来一局"; again.custom_minimum_size = Vector2(260, 70); again.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	again.pressed.connect(func(): result_ui.visible = false; start_match(sel_pilot, sel_mech)); box.add_child(again)
	var back := Button.new(); back.text = "返回菜单"; back.custom_minimum_size = Vector2(260, 60); back.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	back.pressed.connect(func(): result_ui.visible = false; menu.visible = true; state = "menu"); box.add_child(back)
	result_ui.visible = true

# ---------------- 开局 ----------------
func start_match(pilot: String, mech: String) -> void:
	sel_pilot = pilot; sel_mech = mech
	var dur := float(OS.get_environment("GB_DURATION")) if OS.get_environment("GB_DURATION") != "" else 180.0
	sim = Sim.new(data, 0, dur)
	me = sim.add_player(1, "你", 1, pilot, mech, false)
	var k := 0
	for i in 7:
		var team := 1 if i < 3 else 2
		sim.add_player(i + 2, BOT_NAMES[i], team, PILOTS[(i + 1) % 2], MECHS[(i / 2) % 2], true)
		k += 1
	for id in mech_nodes: mech_nodes[id].root.queue_free()
	mech_nodes.clear()
	for p in sim.players: mech_nodes[p.id] = build_mech(p)
	for i in base_cols.size():
		paint_img.set_pixel(i % sim.GW, i / sim.GW, Color(0, 0, 0, 0)); mini_img.set_pixel(i % sim.GW, i / sim.GW, base_cols[i])
	paint_tex.update(paint_img); mini_tex.update(mini_img)
	for f in fx_list: f[0].queue_free()
	fx_list.clear()
	menu.visible = false
	state = "play"
	acc = 0.0

# ---------------- 机兵模型 ----------------
func box_mesh(size: Vector3, c: Color, pos: Vector3, parent: Node3D, emit := 0.0) -> MeshInstance3D:
	var mi := MeshInstance3D.new(); var b := BoxMesh.new(); b.size = size; b.material = mat(c, emit); mi.mesh = b; mi.position = pos; parent.add_child(mi); return mi

func sphere_mesh(r: float, c: Color, pos: Vector3, parent: Node3D, alpha := 1.0, emit := 0.0) -> MeshInstance3D:
	var mi := MeshInstance3D.new(); var s := SphereMesh.new(); s.radius = r; s.height = r * 2; s.radial_segments = 14; s.rings = 7; s.material = mat(c, emit, alpha); mi.mesh = s; mi.position = pos; parent.add_child(mi); return mi

func cyl_x(r: float, l: float, c: Color, pos: Vector3, parent: Node3D) -> MeshInstance3D:
	var mi := MeshInstance3D.new(); var cm := CylinderMesh.new(); cm.top_radius = r; cm.bottom_radius = r; cm.height = l; cm.radial_segments = 10; cm.material = mat(c); mi.mesh = cm
	mi.rotation_degrees = Vector3(0, 0, 90); mi.position = pos; parent.add_child(mi); return mi

func build_mech(p: Sim.Mech) -> Dictionary:
	var root := Node3D.new(); add_child(root)
	var body := Node3D.new(); root.add_child(body)
	var tc: Color = team_col[p.team]
	var P: Dictionary = data.pilots[p.pilot]
	var dk := Color("#2a2d3a")
	box_mesh(Vector3(0.38, 0.8, 0.42), dk, Vector3(0, 0.4, -0.38), body)
	box_mesh(Vector3(0.38, 0.8, 0.42), dk, Vector3(0, 0.4, 0.38), body)
	box_mesh(Vector3(0.5, 0.18, 0.5), tc, Vector3(0.06, 0.09, -0.38), body)
	box_mesh(Vector3(0.5, 0.18, 0.5), tc, Vector3(0.06, 0.09, 0.38), body)
	box_mesh(Vector3(1.25, 0.95, 1.45), tc, Vector3(0, 1.25, 0), body)
	box_mesh(Vector3(0.9, 0.3, 1.2), Color("#f4f0ea"), Vector3(0.2, 1.05, 0), body)
	box_mesh(Vector3(0.12, 0.42, 0.9), Color("#7af0ff"), Vector3(0.64, 1.35, 0), body, 1.4)
	sphere_mesh(0.62, Color("#cfeaff"), Vector3(0, 2.0, 0), body, 0.35)
	sphere_mesh(0.32, Color(str(P.skin)), Vector3(0.05, 1.95, 0), body)
	var hair := sphere_mesh(0.35, Color(str(P.hair)), Vector3(-0.03, 2.08, 0), body); hair.scale = Vector3(1, 0.7, 1)
	box_mesh(Vector3(0.05, 0.08, 0.08), Color(str(P.eye)), Vector3(0.36, 1.97, -0.1), body, 1.0)
	box_mesh(Vector3(0.05, 0.08, 0.08), Color(str(P.eye)), Vector3(0.36, 1.97, 0.1), body, 1.0)
	box_mesh(Vector3(0.06, 0.6, 0.06), dk, Vector3(-0.2, 2.75, 0), body)
	sphere_mesh(0.1, Color("#ffe14d"), Vector3(-0.2, 3.07, 0), body, 1.0, 1.2)
	# 武器（朝 +X）
	if p.weapon == "charger":
		box_mesh(Vector3(0.7, 0.3, 0.3), dk, Vector3(0.5, 1.25, 0.85), body)
		cyl_x(0.09, 2.2, Color("#8c94ab"), Vector3(1.6, 1.3, 0.85), body)
		box_mesh(Vector3(0.5, 0.16, 0.16), Color("#2a2d3a"), Vector3(0.7, 1.52, 0.85), body)
		sphere_mesh(0.07, Color("#7af0ff"), Vector3(0.98, 1.52, 0.85), body, 1.0, 2.0)
	else:
		box_mesh(Vector3(0.6, 0.4, 0.36), dk, Vector3(0.45, 1.25, 0.86), body)
		cyl_x(0.2, 0.9, tc.lightened(0.4), Vector3(1.0, 1.28, 0.86), body)
		cyl_x(0.12, 0.25, Color("#2a2d3a"), Vector3(1.5, 1.28, 0.86), body)
	var ball := sphere_mesh(0.8, tc, Vector3(0, 0.75, 0), root, 1.0, 0.25)
	ball.visible = false
	var pos := Vector3(p.x * K, p.z * K, p.y * K)
	root.position = pos
	return {"root": root, "body": body, "ball": ball, "prev": pos, "cur": pos, "a_prev": p.inp.a, "a_cur": p.inp.a}

# ---------------- 主循环 ----------------
func _process(delta: float) -> void:
	if state == "play" and sim != null:
		read_input()
		acc += min(delta, 0.1)
		while acc >= TICK:
			acc -= TICK
			for p in sim.players:
				var n: Dictionary = mech_nodes[p.id]
				n.prev = n.cur; n.a_prev = n.a_cur
			sim.step(TICK)
			for p in sim.players:
				var n: Dictionary = mech_nodes[p.id]
				n.cur = Vector3(p.x * K, p.z * K, p.y * K); n.a_cur = p.inp.a
				if not p.alive: n.prev = n.cur
			apply_events()
			if sim.dirty.size() > 0:
				for i in sim.dirty:
					var t := sim.grid[i]
					var c: Color = team_col[t] if t > 0 and t < 3 else Color(0, 0, 0, 0)
					paint_img.set_pixel(i % sim.GW, i / sim.GW, c)
					mini_img.set_pixel(i % sim.GW, i / sim.GW, c if t > 0 else base_cols[i])
				paint_tex.update(paint_img); mini_tex.update(mini_img)
			if sim.over and state == "play":
				state = "result"
				show_result()
		var alpha := acc / TICK
		update_visuals(alpha, delta)
		turf_t -= delta
		if turf_t <= 0:
			turf_t = 0.5
			var a := 0; var b := 0; var tot := 0
			for i in sim.grid.size():
				if sim.solid[i]: continue
				tot += 1
				if sim.grid[i] == 1: a += 1
				elif sim.grid[i] == 2: b += 1
			turf = [a, b, tot]
	elif state != "play":
		# 菜单：镜头慢慢绕着地图转
		var t := Time.get_ticks_msec() / 1000.0
		cam.position = Vector3(60 + sin(t * 0.15) * 40, 55, 40 + cos(t * 0.15) * 50)
		cam.look_at(Vector3(60, 0, 40))
		if sim != null: update_visuals(1.0, delta)
	update_fx(delta)
	hud.queue_redraw()
	# 自动截图（测试用）：GB_SHOT=路径 GB_SHOT_AT=秒
	if OS.get_environment("GB_SHOT") != "" and (OS.get_environment("GB_SHOT_MENU") != "" or (sim != null and state != "menu")):
		shot_t += delta
		if shot_t >= float(OS.get_environment("GB_SHOT_AT") if OS.get_environment("GB_SHOT_AT") != "" else "8"):
			get_viewport().get_texture().get_image().save_png(OS.get_environment("GB_SHOT"))
			print("截图：", OS.get_environment("GB_SHOT"), " FPS ", Engine.get_frames_per_second())
			get_tree().quit()

func update_visuals(alpha: float, delta: float) -> void:
	var counts := [0, 0, 0]
	for p in sim.players:
		var n: Dictionary = mech_nodes[p.id]
		var root: Node3D = n.root
		var vis: bool = p.alive and (me == null or p.team == me.team or sim.visible_to(me.team, p))
		root.visible = vis
		if not vis: continue
		root.position = n.prev.lerp(n.cur, alpha)
		var a := lerp_angle(float(n.a_prev), float(n.a_cur), alpha)
		n.body.rotation.y = -a
		var wheel: bool = p.wheel
		n.body.visible = not wheel
		n.ball.visible = wheel
		if wheel: n.ball.rotation.z -= delta * 8.0
		# 自己躲在己方涂料 / 草丛里：半透明提示
		n.body.scale = Vector3.ONE * (0.92 if p.hidden else 1.0)
	for pr in sim.projs:
		var t: int = pr.team
		var mm: MultiMesh = proj_mm[t]
		if counts[t] >= mm.instance_count: continue
		mm.set_instance_transform(counts[t], Transform3D(Basis(), Vector3(pr.x * K, pr.z * K, pr.y * K)))
		counts[t] += 1
	for t in [1, 2]: proj_mm[t].visible_instance_count = counts[t]
	if me != null and state == "play":
		var mp: Vector3 = mech_nodes[me.id].root.position
		var off := Vector3(0, 17.5, 15.5)   # 斜 45° 左右的俯视，能看到机兵的正面
		var target := mp + off
		cam.position = cam.position.lerp(target, min(1.0, delta * 8.0))
		cam.look_at(cam.position - off + Vector3(0, 1.2, 0))

# ---------------- 特效 ----------------
func add_fx(node: Node3D, life: float, kind: String) -> void:
	add_child(node); fx_list.append([node, life, kind, life])

func burst_fx(pos: Vector3, c: Color, amount := 10, speed := 4.0, size := 0.18) -> void:
	var ps := CPUParticles3D.new()
	ps.one_shot = true; ps.emitting = true; ps.amount = amount; ps.lifetime = 0.45; ps.explosiveness = 1.0
	ps.direction = Vector3.UP; ps.spread = 70; ps.initial_velocity_min = speed * 0.5; ps.initial_velocity_max = speed
	ps.gravity = Vector3(0, -14, 0); ps.scale_amount_min = 0.6; ps.scale_amount_max = 1.2
	var m := SphereMesh.new(); m.radius = size; m.height = size * 2; m.radial_segments = 6; m.rings = 3; m.material = mat(c, 1.2)
	ps.mesh = m; ps.position = pos
	add_fx(ps, 0.8, "ps")

func ring_fx(pos: Vector3, r: float, c: Color, life := 0.45) -> void:
	var mi := MeshInstance3D.new(); var tm := TorusMesh.new(); tm.inner_radius = 0.85; tm.outer_radius = 1.0; tm.rings = 24; tm.ring_segments = 6
	tm.material = mat(c, 2.0, 0.85); mi.mesh = tm; mi.position = pos + Vector3(0, 0.15, 0); mi.scale = Vector3(0.2, 0.2, 0.2)
	mi.set_meta("r", r)
	add_fx(mi, life, "ring")

func beam_fx(a: Vector3, b: Vector3, c: Color, w: float) -> void:
	var mi := MeshInstance3D.new(); var bm := BoxMesh.new(); var L := a.distance_to(b)
	bm.size = Vector3(L, w, w); bm.material = mat(c, 3.0); mi.mesh = bm
	mi.position = (a + b) * 0.5
	mi.look_at_from_position((a + b) * 0.5, b, Vector3.UP)
	mi.rotate_object_local(Vector3.UP, PI / 2)
	add_fx(mi, 0.22, "beam")

func update_fx(delta: float) -> void:
	var keep: Array = []
	for f in fx_list:
		f[1] -= delta
		var node: Node3D = f[0]
		var k: float = 1.0 - f[1] / f[3]
		if f[2] == "ring":
			var r: float = node.get_meta("r")
			node.scale = Vector3.ONE * (0.2 + k * r)
		elif f[2] == "beam":
			node.scale = Vector3(1, 1.0 - k * 0.8, 1.0 - k * 0.8)
		elif f[2] == "lock":
			node.rotation.y += delta * 3.0
		if f[1] <= 0:
			node.queue_free()
		else:
			keep.append(f)
	fx_list = keep

func apply_events() -> void:
	for e in sim.events:
		match e[0]:
			"splat": if randf() < 0.5: burst_fx(Vector3(e[1] * K, e[3] * K + 0.1, e[2] * K), team_col[e[4]], 5, 3.0, 0.12)
			"hit": burst_fx(Vector3(e[2] * K, e[4] * K, e[3] * K), team_col[e[5]], 10, 4.5, 0.15)
			"line": beam_fx(Vector3(e[1] * K, e[3] * K, e[2] * K), Vector3(e[4] * K, e[6] * K, e[5] * K), team_col[e[7]], 0.12 + 0.18 * float(e[8]))
			"boom":
				var pos := Vector3(e[1] * K, e[3] * K, e[2] * K)
				ring_fx(pos, float(e[5]) * K * 1.1, team_col[e[4]]); burst_fx(pos, team_col[e[4]], 24, 7.0, 0.22)
			"lock":
				var mi := MeshInstance3D.new(); var tm := TorusMesh.new(); tm.inner_radius = 3.6; tm.outer_radius = 4.3; tm.ring_segments = 4; tm.rings = 20
				tm.material = mat(Color("#ff3b52"), 2.5, 0.8); mi.mesh = tm; mi.position = Vector3(e[1] * K, e[3] * K + 0.2, e[2] * K)
				add_fx(mi, 1.5, "lock")
			"ko":
				var pos2 := Vector3(e[3] * K, e[5] * K + 1.2, e[4] * K)
				burst_fx(pos2, team_col[e[6]], 30, 8.0, 0.25); ring_fx(pos2, 4.0, Color.WHITE, 0.5)
				hud.feed(e)
			"skill":
				var p := player_by_id(e[1])
				if p != null: ring_fx(Vector3(p.x * K, p.z * K, p.y * K), 3.0, Color(str(data.pilots[p.pilot].accent)), 0.6)
				if e[1] == me.id: hud.banner("技能 · " + str(data.pilots[me.pilot].skillInfo.name), Color(str(data.pilots[me.pilot].accent)))
			"super":
				var p2 := player_by_id(e[1])
				if p2 != null: ring_fx(Vector3(p2.x * K, p2.z * K, p2.y * K), 5.0, Color("#ffe14d"), 0.7)
				if e[1] == me.id: hud.banner("大招 · " + str(data.mechs[me.weapon].specialInfo.name), Color("#ffe14d"))
			"dmg": hud.dmg_text(player_by_id(e[1]), int(e[2]))

func player_by_id(id: int) -> Sim.Mech:
	for p in sim.players:
		if p.id == id: return p
	return null

# ---------------- 输入 ----------------
func ground_point(screen: Vector2, h: float) -> Vector3:
	var o := cam.project_ray_origin(screen); var d := cam.project_ray_normal(screen)
	if abs(d.y) < 0.0001: return o
	var t := (h - o.y) / d.y
	return o + d * t

func read_input() -> void:
	if me == null or not me.alive and not touch_mode:
		pass
	var inp := me.inp
	if touch_mode:
		inp.mx = t_move.v.x; inp.my = t_move.v.y
		if t_aim.v.length() > 0.25:
			inp.a = atan2(t_aim.v.y, t_aim.v.x); inp.f = true
		else:
			inp.f = false
		inp.w = wheel_hold
		inp.j = t_btn.has("jump")
		return
	var mx := 0.0; var my := 0.0
	if Input.is_physical_key_pressed(KEY_A) or Input.is_physical_key_pressed(KEY_LEFT): mx -= 1
	if Input.is_physical_key_pressed(KEY_D) or Input.is_physical_key_pressed(KEY_RIGHT): mx += 1
	if Input.is_physical_key_pressed(KEY_W) or Input.is_physical_key_pressed(KEY_UP): my -= 1
	if Input.is_physical_key_pressed(KEY_S) or Input.is_physical_key_pressed(KEY_DOWN): my += 1
	inp.mx = mx; inp.my = my
	var gp := ground_point(get_viewport().get_mouse_position(), (me.z + 24.0) * K)
	inp.a = atan2(gp.z - me.y * K, gp.x - me.x * K)
	inp.f = Input.is_mouse_button_pressed(MOUSE_BUTTON_LEFT) and not menu.visible
	inp.w = Input.is_physical_key_pressed(KEY_SHIFT)
	inp.j = Input.is_physical_key_pressed(KEY_SPACE)

func _unhandled_input(ev: InputEvent) -> void:
	if state != "play" or me == null: return
	if ev is InputEventKey and ev.pressed and not ev.echo:
		match ev.physical_keycode:
			KEY_Q: me.inp.gq += 1
			KEY_E: me.inp.qq += 1
			KEY_ESCAPE: state = "menu"; menu.visible = true
	if ev is InputEventMouseButton and ev.pressed and ev.button_index == MOUSE_BUTTON_RIGHT:
		me.inp.qq += 1
	if ev is InputEventScreenTouch or ev is InputEventScreenDrag:
		touch_mode = true
		handle_touch(ev)

# 触屏按钮位置（hud.gd 也用同一份来画）
func touch_buttons() -> Dictionary:
	var s := get_viewport().get_visible_rect().size
	return {"super": [Vector2(s.x - 230, s.y - 230), 52.0], "skill": [Vector2(s.x - 330, s.y - 150), 44.0], "wheel": [Vector2(s.x - 110, s.y - 330), 40.0], "jump": [Vector2(s.x - 210, s.y - 340), 36.0]}

func handle_touch(ev: InputEvent) -> void:
	var s := get_viewport().get_visible_rect().size
	var pos: Vector2 = ev.position
	var idx: int = ev.index
	if ev is InputEventScreenTouch:
		if ev.pressed:
			for name in touch_buttons():
				var b: Array = touch_buttons()[name]
				if pos.distance_to(b[0]) < b[1] + 12:
					t_btn[name] = idx
					if name == "skill": me.inp.gq += 1
					elif name == "super": me.inp.qq += 1
					elif name == "wheel": wheel_hold = true
					return
			if pos.x < s.x * 0.45 and t_move.id < 0:
				t_move = {"id": idx, "o": pos, "v": Vector2.ZERO}
			elif t_aim.id < 0:
				t_aim = {"id": idx, "o": pos, "v": Vector2.ZERO}
		else:
			for name in t_btn.keys():
				if t_btn[name] == idx:
					t_btn.erase(name)
					if name == "wheel": wheel_hold = false
			if t_move.id == idx: t_move = {"id": -1, "o": Vector2.ZERO, "v": Vector2.ZERO}
			if t_aim.id == idx: t_aim = {"id": -1, "o": Vector2.ZERO, "v": Vector2.ZERO}
	else:
		if t_move.id == idx: t_move.v = ((pos - t_move.o) / 70.0).limit_length(1.0)
		if t_aim.id == idx: t_aim.v = ((pos - t_aim.o) / 70.0).limit_length(1.0)
