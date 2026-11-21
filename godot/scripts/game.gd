# 涂鸦机兵 Godot 版 —— 主场景：菜单、3D 画面、动画、特效、镜头、输入
# 模拟在 sim.gd（每秒 30 次），画面每帧插值显示
extends Node3D

const K := 1.0 / 16.0          # 原版 1 格 = 16 像素 → Godot 1 个单位
const TICK := 1.0 / 30.0
const BOT_NAMES := ["Pixel", "Juno", "Tofu", "Ash", "Mochi", "Rex", "Kiwi", "Nova", "Bolt", "Yuki"]
# 每张地图的氛围：天空顶 / 地平线 / 霓虹 A / 霓虹 B / 地面
const PALETTES := [
	["#120c2c", "#ff3ea5", "#ff3ea5", "#1fd6ee", "#2c2846"], ["#0b1a33", "#ff8a1f", "#ffb000", "#4fb8ff", "#283244"],
	["#1a0f24", "#9cff2e", "#9cff2e", "#ff3b52", "#2a2a3a"], ["#2a1030", "#ff9ad6", "#ff6ec4", "#ffe14d", "#3a2a40"],
	["#0c1c2a", "#1fd6ee", "#1fd6ee", "#ff8a1f", "#24303c"], ["#0e1830", "#bff3ff", "#7af0ff", "#b06bff", "#2a3448"],
	["#200c0c", "#ff5a1f", "#ff6a1f", "#ffd23f", "#33242a"], ["#14141c", "#c9c5e6", "#ff5a36", "#5fa8ff", "#2e2e38"],
]

var data: Dictionary
var sim: Sim
var me: Sim.Mech
var state := "menu"
var acc := 0.0
var sel_pilot := "blaze"
var sel_mech := "blaster"
var sel_map := -1
var sel_mode := "turf"
var mode_view: ModeView
var mode_lbl: Label
var spectate_id := 0
var cur_map := -1
# 队伍颜色：1 / 2 来自原版配色，3~8 给逃亡圈的其他小队（封印争夺里 3 是中立咒灵）
var team_col := [Color.WHITE, Color.WHITE, Color.WHITE, Color("#ff8a1f"), Color("#6dff8a"), Color("#b48cff"), Color("#ffe14d"), Color("#ff3b52"), Color("#4f7bff")]
var font: FontFile
var theme_ui: Theme
var desktop := true

var cam: Camera3D
var env: Environment
var sun: DirectionalLight3D
var map_root: Node3D
var paint_img: Image
var paint_tex: ImageTexture
var base_tex: ImageTexture
var mini_img: Image
var mini_tex: ImageTexture
var base_cols := PackedColorArray()
var turf_mat: ShaderMaterial
var mech_nodes := {}
var helper_nodes := {}
var proj_mm := [null, null, null]
var shell_mm := [null, null, null]
var missile_mm: MultiMesh
var beams := {}
var fx_list: Array = []
var turf := [0, 0, 1]
var turf_t := 0.0
var hud: Control
var menu: Control
var result_ui: Control
var sfx: Sfx
var shake := 0.0
var hitstop_until := 0
var fov_punch := 0.0
var aim_line: MeshInstance3D
var aim_ring: MeshInstance3D
var profile: Profile
var lobby: Lobby
var showroom: Node3D
var showroom_key := ""
var showroom_cam := 0.0
var autoplay := false
var shot_t := 0.0

# 触屏
var touch_mode := false
var t_move := {"id": -1, "o": Vector2.ZERO, "v": Vector2.ZERO}
var t_aim := {"id": -1, "o": Vector2.ZERO, "v": Vector2.ZERO}
var t_btn := {}
var wheel_hold := false

func _ready() -> void:
	var f := FileAccess.open("res://data/game.json", FileAccess.READ)
	data = JSON.parse_string(f.get_as_text())
	for i in [1, 2]: team_col[i] = Color(str(data.colors[0][i]))
	desktop = not (OS.has_feature("mobile") or OS.has_feature("web"))
	Models.outlines = true
	touch_mode = OS.has_feature("mobile")
	font = load("res://fonts/huangyou.ttf")
	theme_ui = make_theme()
	sfx = Sfx.new(); add_child(sfx)
	setup_world()
	hud = preload("res://scripts/hud.gd").new()
	hud.game = self
	hud.set_anchors_preset(Control.PRESET_FULL_RECT)
	hud.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var layer := CanvasLayer.new(); add_child(layer); layer.add_child(hud)
	profile = Profile.new(data)
	lobby = Lobby.new(self); menu = lobby; layer.add_child(menu)
	result_ui = Control.new(); result_ui.set_anchors_preset(Control.PRESET_FULL_RECT); result_ui.theme = theme_ui; result_ui.visible = false; layer.add_child(result_ui)
	build_map(0)
	mode_view = ModeView.new(); add_child(mode_view)
	showroom = Node3D.new(); add_child(showroom)
	if OS.get_environment("GB_MODE") != "": sel_mode = OS.get_environment("GB_MODE")
	autoplay = OS.get_environment("GB_AUTOPLAY") != ""
	if not autoplay:
		if OS.get_environment("GB_TAB") != "" and int(profile.o.tut) == 0:   # 截图用：直接给个开好宝箱的账号
			profile.tutorial(); profile.open_chest("starter"); profile.o.gems = 600
		lobby.refresh()
		if OS.get_environment("GB_TAB") != "" and OS.get_environment("GB_TAB") != "home": lobby.open_sub(OS.get_environment("GB_TAB"))
		if OS.get_environment("GB_SHOT_OPEN") != "": profile.o.gems += 260; lobby.open_anim("airdrop", profile.buy_chest("airdrop"))
		if int(profile.o.tut) == 0: lobby.welcome()
	if autoplay:
		var gm := OS.get_environment("GB_MAP")
		sel_map = int(gm) if gm != "" else (-1 if sel_mode != "turf" else 0)
		start_match(OS.get_environment("GB_PILOT") if OS.get_environment("GB_PILOT") != "" else "blaze", OS.get_environment("GB_MECH") if OS.get_environment("GB_MECH") != "" else "blaster")

func make_theme() -> Theme:
	var t := Theme.new()
	t.default_font = font; t.default_font_size = 20
	var sb := func(bg: Color, border: Color) -> StyleBoxFlat:
		var s := StyleBoxFlat.new(); s.bg_color = bg; s.border_color = border; s.set_border_width_all(3); s.set_corner_radius_all(12)
		s.content_margin_left = 10; s.content_margin_right = 10; s.content_margin_top = 6; s.content_margin_bottom = 6
		s.shadow_color = Color(0, 0, 0, 0.35); s.shadow_size = 4
		return s
	t.set_stylebox("normal", "Button", sb.call(Color("#221d40"), Color("#463e7c")))
	t.set_stylebox("hover", "Button", sb.call(Color("#302a5e"), Color("#7a70c8")))
	t.set_stylebox("pressed", "Button", sb.call(Color("#ffe14d"), Color("#fff3a8")))
	t.set_stylebox("hover_pressed", "Button", sb.call(Color("#ffe97a"), Color("#fff3a8")))
	t.set_stylebox("focus", "Button", StyleBoxEmpty.new())
	t.set_color("font_pressed_color", "Button", Color("#1a1530"))
	t.set_color("font_hover_pressed_color", "Button", Color("#1a1530"))
	t.set_color("font_color", "Button", Color("#f2eefc"))
	var panel := StyleBoxFlat.new(); panel.bg_color = Color(0.07, 0.06, 0.14, 0.86); panel.set_corner_radius_all(16); panel.border_color = Color("#3a3370"); panel.set_border_width_all(2)
	panel.content_margin_left = 14; panel.content_margin_right = 14; panel.content_margin_top = 12; panel.content_margin_bottom = 12
	t.set_stylebox("panel", "PanelContainer", panel)
	t.set_stylebox("normal", "OptionButton", sb.call(Color("#221d40"), Color("#463e7c")))
	t.set_stylebox("hover", "OptionButton", sb.call(Color("#302a5e"), Color("#7a70c8")))
	return t

# ---------------- 场景：灯光 / 天空 / 后期 ----------------
func setup_world() -> void:
	env = Environment.new()
	var sky := Sky.new(); var sm := ProceduralSkyMaterial.new(); sky.sky_material = sm
	env.background_mode = Environment.BG_SKY; env.sky = sky
	env.ambient_light_source = Environment.AMBIENT_SOURCE_SKY; env.ambient_light_energy = 0.55
	env.tonemap_mode = Environment.TONE_MAPPER_ACES; env.tonemap_exposure = 1.0; env.tonemap_white = 2.2
	env.glow_enabled = true; env.glow_intensity = 0.7; env.glow_bloom = 0.08; env.glow_hdr_threshold = 1.1
	env.glow_blend_mode = Environment.GLOW_BLEND_MODE_SCREEN
	if RenderingServer.get_rendering_device() != null:   # Forward+ / Mobile 才有 SSAO
		env.ssao_enabled = true; env.ssao_radius = 1.6; env.ssao_intensity = 1.6
		env.ssil_enabled = false
	env.fog_enabled = true; env.fog_density = 0.0035; env.fog_light_energy = 0.8
	env.adjustment_enabled = true; env.adjustment_saturation = 1.15; env.adjustment_contrast = 1.06
	var we := WorldEnvironment.new(); we.environment = env; add_child(we)
	sun = DirectionalLight3D.new()
	sun.rotation_degrees = Vector3(-55, 32, 0)
	sun.light_energy = 1.1; sun.light_color = Color("#fff3e6")
	sun.shadow_enabled = true; sun.shadow_blur = 1.5
	sun.directional_shadow_mode = DirectionalLight3D.SHADOW_ORTHOGONAL
	sun.directional_shadow_max_distance = 70
	add_child(sun)
	var fill := DirectionalLight3D.new(); fill.rotation_degrees = Vector3(-35, 210, 0); fill.light_energy = 0.35; fill.light_color = Color("#8fb4ff"); add_child(fill)
	cam = Camera3D.new(); cam.fov = 40; add_child(cam)
	cam.position = Vector3(60, 60, 75); cam.look_at(Vector3(60, 0, 40))
	# 子弹 / 炮弹 / 导弹（MultiMesh，一次画完）
	for t in [1, 2]:
		var pm := MultiMesh.new(); pm.transform_format = MultiMesh.TRANSFORM_3D
		var cap := CapsuleMesh.new(); cap.radius = 0.2; cap.height = 0.9; cap.radial_segments = 8; cap.rings = 2
		cap.material = Models.glow(team_col[t], 2.4); pm.mesh = cap; pm.instance_count = 600; pm.visible_instance_count = 0
		var pmi := MultiMeshInstance3D.new(); pmi.multimesh = pm; pmi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF; add_child(pmi); proj_mm[t] = pm
		var sm2 := MultiMesh.new(); sm2.transform_format = MultiMesh.TRANSFORM_3D
		var sph := SphereMesh.new(); sph.radius = 0.36; sph.height = 0.72; sph.radial_segments = 10; sph.rings = 5
		sph.material = Models.toon(team_col[t], 0.8); sm2.mesh = sph; sm2.instance_count = 80; sm2.visible_instance_count = 0
		var smi := MultiMeshInstance3D.new(); smi.multimesh = sm2; add_child(smi); shell_mm[t] = sm2
	missile_mm = MultiMesh.new(); missile_mm.transform_format = MultiMesh.TRANSFORM_3D
	var cone := CylinderMesh.new(); cone.top_radius = 0.0; cone.bottom_radius = 0.35; cone.height = 1.6; cone.material = Models.glow(Color("#ff3b52"), 2.5)
	missile_mm.mesh = cone; missile_mm.instance_count = 16; missile_mm.visible_instance_count = 0
	var mmi := MultiMeshInstance3D.new(); mmi.multimesh = missile_mm; add_child(mmi)
	# 瞄准指示
	aim_line = MeshInstance3D.new(); var pl := PlaneMesh.new(); pl.size = Vector2(1, 1); aim_line.mesh = pl
	aim_line.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF; add_child(aim_line)
	aim_ring = MeshInstance3D.new(); var tr := TorusMesh.new(); tr.inner_radius = 0.9; tr.outer_radius = 1.0; tr.rings = 32; tr.ring_segments = 4; aim_ring.mesh = tr
	aim_ring.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF; add_child(aim_ring)
	aim_line.visible = false; aim_ring.visible = false

func palette(i: int) -> Array:
	var p: Array = PALETTES[i % PALETTES.size()]
	return p.map(func(c): return Color(c))

# ---------------- 地图 ----------------
func base_color(m: Dictionary, i: int, pal: Array) -> Color:
	var gw := int(m.gw)
	var cx := i % gw; var cy := i / gw
	var t := float(m.top[i])
	if m.solid.unicode_at(i) == 49: return Color(pal[4]).lightened(0.22)
	if m.bush.unicode_at(i) == 49: return Color("#1f4a32")
	var c: Color = pal[4]
	if t >= 1: c = c.lightened(0.1 if t < 60 else 0.2)
	if (cx / 4 + cy / 4) % 2 == 0: c = c.lightened(0.03)
	return c

func build_map(idx: int) -> void:
	cur_map = idx
	if map_root != null: map_root.queue_free()
	map_root = Node3D.new(); add_child(map_root)
	var m: Dictionary = data.maps[idx]
	var pal := palette(idx)
	var sm: ProceduralSkyMaterial = env.sky.sky_material
	sm.sky_top_color = pal[0]; sm.sky_horizon_color = Color(pal[1]).darkened(0.35); sm.ground_horizon_color = Color(pal[0]).lightened(0.05); sm.ground_bottom_color = Color(pal[0]).darkened(0.5)
	sm.sky_curve = 0.25
	env.fog_light_color = Color(pal[1]).darkened(0.55)
	var gw := int(m.gw); var gh := int(m.gh)
	paint_img = Image.create(gw, gh, false, Image.FORMAT_RGBA8)
	mini_img = Image.create(gw, gh, false, Image.FORMAT_RGBA8)
	var base_img := Image.create(gw, gh, false, Image.FORMAT_RGBA8)
	base_cols.resize(gw * gh)
	for i in gw * gh:
		base_cols[i] = base_color(m, i, pal)
		base_img.set_pixel(i % gw, i / gw, base_cols[i]); mini_img.set_pixel(i % gw, i / gw, base_cols[i]); paint_img.set_pixel(i % gw, i / gw, Color(0, 0, 0, 0))
	paint_tex = ImageTexture.create_from_image(paint_img); base_tex = ImageTexture.create_from_image(base_img); mini_tex = ImageTexture.create_from_image(mini_img)
	# 地形网格：顶面用涂料着色器，侧面按高度上色
	var st_top := SurfaceTool.new(); st_top.begin(Mesh.PRIMITIVE_TRIANGLES)
	var st_side := SurfaceTool.new(); st_side.begin(Mesh.PRIMITIVE_TRIANGLES)
	var topf := func(cx: int, cy: int) -> float:
		if cx < 0 or cy < 0 or cx >= gw or cy >= gh: return -0.5
		return float(m.top[cy * gw + cx]) * K
	var neon: Array = []   # 高台边缘的霓虹灯条：[位置, 朝向, 颜色]
	for cy in gh:
		for cx in gw:
			var h: float = topf.call(cx, cy)
			var u0 := float(cx) / gw; var u1 := float(cx + 1) / gw; var v0 := float(cy) / gh; var v1 := float(cy + 1) / gh
			st_top.set_normal(Vector3.UP)
			for q in [[cx, cy, u0, v0], [cx + 1, cy, u1, v0], [cx + 1, cy + 1, u1, v1], [cx, cy, u0, v0], [cx + 1, cy + 1, u1, v1], [cx, cy + 1, u0, v1]]:
				st_top.set_uv(Vector2(q[2], q[3])); st_top.add_vertex(Vector3(q[0], h, q[1]))
			var side_c: Color = Color(pal[4]).darkened(0.35) if h < 2 else (Color(pal[4]).lightened(0.05) if h < 6 else Color(pal[4]).lightened(0.12))
			for nb in [Vector2i(1, 0), Vector2i(-1, 0), Vector2i(0, 1), Vector2i(0, -1)]:
				var nh: float = topf.call(cx + nb.x, cy + nb.y)
				if nh >= h - 0.01: continue
				var a: Vector3; var b: Vector3
				if nb.x == 1: a = Vector3(cx + 1, 0, cy); b = Vector3(cx + 1, 0, cy + 1)
				elif nb.x == -1: a = Vector3(cx, 0, cy + 1); b = Vector3(cx, 0, cy)
				elif nb.y == 1: a = Vector3(cx + 1, 0, cy + 1); b = Vector3(cx, 0, cy + 1)
				else: a = Vector3(cx, 0, cy); b = Vector3(cx + 1, 0, cy)
				var n := Vector3(nb.x, 0, nb.y)
				var lo := side_c.darkened(0.45)
				for vv in [[a, nh, lo], [b, nh, lo], [b, h, side_c], [a, nh, lo], [b, h, side_c], [a, h, side_c]]:
					st_side.set_normal(n); st_side.set_color(vv[2]); st_side.add_vertex(Vector3(vv[0].x, vv[1], vv[0].z))
				if h - nh >= 1.8 and nh > -0.4:
					neon.append([(a + b) * 0.5 + Vector3(0, h, 0) + n * 0.02, nb, pal[2] if (cx / 6 + cy / 6) % 2 == 0 else pal[3]])
	var mesh := ArrayMesh.new()
	st_top.commit(mesh); st_side.commit(mesh)
	turf_mat = ShaderMaterial.new(); turf_mat.shader = load("res://shaders/turf.gdshader")
	turf_mat.set_shader_parameter("paint_tex", paint_tex); turf_mat.set_shader_parameter("base_tex", base_tex); turf_mat.set_shader_parameter("grid_size", Vector2(gw, gh))
	turf_mat.set_shader_parameter("team_a", team_col[1]); turf_mat.set_shader_parameter("team_b", team_col[2])
	var side_mat := StandardMaterial3D.new(); side_mat.vertex_color_use_as_albedo = true; side_mat.cull_mode = BaseMaterial3D.CULL_DISABLED; side_mat.roughness = 0.9
	mesh.surface_set_material(0, turf_mat); mesh.surface_set_material(1, side_mat)
	var mi := MeshInstance3D.new(); mi.mesh = mesh; map_root.add_child(mi)
	# 霓虹灯条
	if neon.size() > 0:
		var nm := MultiMesh.new(); nm.transform_format = MultiMesh.TRANSFORM_3D; nm.use_colors = true
		var bx := BoxMesh.new(); bx.size = Vector3(1.0, 0.1, 0.1)
		var nmat := StandardMaterial3D.new(); nmat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED; nmat.vertex_color_use_as_albedo = true; nmat.albedo_color = Color(2.2, 2.2, 2.2)
		bx.material = nmat; nm.mesh = bx; nm.instance_count = neon.size()
		for k in neon.size():
			var e: Array = neon[k]
			var rot := Basis(Vector3.UP, PI / 2) if e[1].x != 0 else Basis()
			nm.set_instance_transform(k, Transform3D(rot, e[0])); nm.set_instance_color(k, e[2])
		var nmi := MultiMeshInstance3D.new(); nmi.multimesh = nm; nmi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF; map_root.add_child(nmi)
	# 草丛（卡通着色的圆球）
	var bush_cells: Array = []
	for i in gw * gh:
		if m.bush.unicode_at(i) == 49 and (i % gw + i / gw) % 2 == 0: bush_cells.append(i)
	if bush_cells.size() > 0:
		var mm := MultiMesh.new(); mm.transform_format = MultiMesh.TRANSFORM_3D
		var sph := SphereMesh.new(); sph.radius = 0.8; sph.height = 1.3; sph.radial_segments = 10; sph.rings = 6; sph.material = Models.toon(Color("#3fbf5f"), 0.05, 0.3)
		mm.mesh = sph; mm.instance_count = bush_cells.size()
		var rn := RandomNumberGenerator.new(); rn.seed = 7 + idx
		for k in bush_cells.size():
			var i: int = bush_cells[k]; var s := rn.randf_range(0.9, 1.35)
			mm.set_instance_transform(k, Transform3D(Basis(Vector3.UP, rn.randf() * TAU).scaled(Vector3(s, s * 0.85, s)), Vector3(i % gw + 0.5, 0.5, i / gw + 0.5)))
		var mmi := MultiMeshInstance3D.new(); mmi.multimesh = mm; map_root.add_child(mmi)
	# 弹跳板
	for k in m.pads:
		var i := int(k)
		var pmi := MeshInstance3D.new(); var cyl := CylinderMesh.new(); cyl.top_radius = 0.48; cyl.bottom_radius = 0.5; cyl.height = 0.12; cyl.material = Models.glow(Color("#ffd23f"), 1.8); pmi.mesh = cyl
		pmi.position = Vector3(i % gw + 0.5, float(m.top[i]) * K + 0.06, i / gw + 0.5); map_root.add_child(pmi)
	# 场地外：围栏 + 远处的城市剪影
	var fence_mat := Models.glow(pal[2], 2.0)
	for e in [[Vector3(gw / 2.0, 0.6, -0.4), Vector3(gw + 1, 0.15, 0.15)], [Vector3(gw / 2.0, 0.6, gh + 0.4), Vector3(gw + 1, 0.15, 0.15)], [Vector3(-0.4, 0.6, gh / 2.0), Vector3(0.15, 0.15, gh + 1)], [Vector3(gw + 0.4, 0.6, gh / 2.0), Vector3(0.15, 0.15, gh + 1)]]:
		var b := MeshInstance3D.new(); var bm := BoxMesh.new(); bm.size = e[1]; bm.material = fence_mat; b.mesh = bm; b.position = e[0]; map_root.add_child(b)
	var floor_mi := MeshInstance3D.new(); var pm2 := PlaneMesh.new(); pm2.size = Vector2(600, 600)
	var fm := StandardMaterial3D.new(); fm.albedo_color = Color(pal[0]).darkened(0.3); fm.roughness = 0.6; fm.metallic_specular = 0.6; pm2.material = fm
	floor_mi.mesh = pm2; floor_mi.position = Vector3(gw / 2.0, -0.6, gh / 2.0); map_root.add_child(floor_mi)
	var win_img := Image.create(8, 16, false, Image.FORMAT_RGBA8)
	var rn2 := RandomNumberGenerator.new(); rn2.seed = idx
	for yy in 16:
		for xx in 8: win_img.set_pixel(xx, yy, Color(pal[2 + (xx + yy) % 2]) * (1.6 if rn2.randf() < 0.35 else 0.0) if (xx % 2 == 0 and yy % 2 == 0) else Color(0, 0, 0))
	var win_tex := ImageTexture.create_from_image(win_img)
	var bmat := StandardMaterial3D.new(); bmat.albedo_color = Color(pal[0]).lightened(0.05); bmat.emission_enabled = true; bmat.emission_texture = win_tex; bmat.emission_energy_multiplier = 1.4
	bmat.texture_filter = BaseMaterial3D.TEXTURE_FILTER_NEAREST; bmat.uv1_scale = Vector3(3, 2, 1)
	for k in 46:
		var a := k / 46.0 * TAU + rn2.randf() * 0.1; var rr := rn2.randf_range(95, 140)
		var bh := rn2.randf_range(14, 48); var bw := rn2.randf_range(8, 18)
		var b := MeshInstance3D.new(); var bm2 := BoxMesh.new(); bm2.size = Vector3(bw, bh, bw); bm2.material = bmat; b.mesh = bm2
		b.position = Vector3(gw / 2.0 + cos(a) * rr, bh / 2.0 - 1, gh / 2.0 + sin(a) * rr * 0.8); b.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		map_root.add_child(b)
	# 四盏彩灯（电脑版）
	if desktop:
		for e in [[Vector3(gw * 0.25, 8, gh * 0.3), pal[2]], [Vector3(gw * 0.75, 8, gh * 0.7), pal[3]], [Vector3(gw * 0.5, 9, gh * 0.5), Color("#ffffff")]]:
			var ol := OmniLight3D.new(); ol.position = e[0]; ol.light_color = e[1]; ol.light_energy = 1.6; ol.omni_range = 40; ol.omni_attenuation = 1.2
			map_root.add_child(ol)

# ---------------- 菜单 ----------------
func role_name(id: String) -> String:
	var c = data.classes.get(id)
	if c == null: return ""
	return "%s • %s" % [data.roles[c[0]].name, data.tags.get(c[1], "")]

func show_result() -> void:
	for c in result_ui.get_children(): c.queue_free()
	var bg := ColorRect.new(); bg.color = Color(0.03, 0.02, 0.08, 0.7); bg.set_anchors_preset(Control.PRESET_FULL_RECT); result_ui.add_child(bg)
	var pc := PanelContainer.new(); pc.set_anchors_preset(Control.PRESET_CENTER); pc.position = Vector2(-330, -280); pc.custom_minimum_size = Vector2(660, 560); result_ui.add_child(pc)
	var box := VBoxContainer.new(); box.add_theme_constant_override("separation", 10); pc.add_child(box)
	var r: Dictionary = sim.result
	var win := int(r.winner)
	var t := Label.new(); t.text = "胜利！" if win == me.team else ("平局" if win == 0 else "失败"); t.add_theme_font_size_override("font_size", 64)
	t.add_theme_color_override("font_color", Color("#ffe14d") if win == me.team else Color("#c9c5e6")); t.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER; box.add_child(t)
	var pa: float = 100.0 * float(r.a) / max(1.0, float(r.tot)); var pb: float = 100.0 * float(r.b) / max(1.0, float(r.tot))
	var s := Label.new(); s.text = "我方 %.1f%%   对方 %.1f%%" % [pa, pb]
	var md := sim.mode
	if md in ["escape4", "escape8"]: s.text = "第 1 名！" if win == me.team else "我方出局了"
	elif md == "raid": s.text = "讨伐成功！百目被打倒了" if win == 1 else "时间到了，百目还活着"
	elif md == "elim": s.text = "局数  %d : %d" % [sim.obj.wins[1], sim.obj.wins[2]]
	elif md == "zone": s.text = "剩余倒计时  我方 %d   对方 %d" % [int(sim.obj.count[1]), int(sim.obj.count[2])]
	elif md != "turf": s.text = "比分  %d : %d" % [sim.obj.score[1], sim.obj.score[2]]
	s.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER; s.add_theme_font_size_override("font_size", 26); box.add_child(s)
	if not autoplay:   # 对战奖励：经验、奖杯、金币、首胜宝石、任务
		var rw := profile.match_reward(sim, me)
		var res := profile.apply_match(rw)
		var parts: Array = ["经验 +%d" % rw.xp, "奖杯 %+d" % rw.trophies]
		for it in res.items: parts.append(lobby.item_text(it)[0])
		if res.lv_ups > 0: parts.append("账号升到 %d 级！天赋点 +%d" % [profile.level(), res.lv_ups])
		if rw.mvp: parts.append("MVP")
		var rl := Label.new(); rl.text = "   ".join(parts); rl.autowrap_mode = TextServer.AUTOWRAP_ARBITRARY; rl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		rl.add_theme_font_size_override("font_size", 17); rl.add_theme_color_override("font_color", Color("#ffe14d")); box.add_child(rl)
		if not res.quests.is_empty():
			var ql := Label.new(); ql.text = "完成任务：" + "、".join(res.quests); ql.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
			ql.add_theme_font_size_override("font_size", 15); ql.add_theme_color_override("font_color", Color("#6dff8a")); box.add_child(ql)
	var grid := GridContainer.new(); grid.columns = 5; grid.add_theme_constant_override("h_separation", 22); box.add_child(grid)
	for h in ["", "驾驶员 / 机体", "击毁", "倒下", "涂地"]:
		var l := Label.new(); l.text = h; l.add_theme_color_override("font_color", Color("#9a96b8")); l.add_theme_font_size_override("font_size", 15); grid.add_child(l)
	var ps := sim.players.filter(func(q): return not q.npc); ps.sort_custom(func(a, b): return a.team < b.team or (a.team == b.team and a.painted > b.painted))
	for p in ps:
		var c: Color = team_col[p.team]
		for v in [p.name, "%s / %s" % [data.pilots[p.pilot].name, data.mechs[p.weapon].short], str(p.kills), str(p.deaths), str(p.painted)]:
			var l := Label.new(); l.text = v; l.add_theme_font_size_override("font_size", 15); l.add_theme_color_override("font_color", Color.WHITE if p == me else c); grid.add_child(l)
	var hb := HBoxContainer.new(); hb.alignment = BoxContainer.ALIGNMENT_CENTER; hb.add_theme_constant_override("separation", 16); box.add_child(hb)
	var again := Button.new(); again.text = "再来一局"; again.custom_minimum_size = Vector2(220, 60)
	again.pressed.connect(func(): result_ui.visible = false; start_match(sel_pilot, sel_mech) if autoplay else start_from_lobby()); hb.add_child(again)
	var back := Button.new(); back.text = "返回菜单"; back.custom_minimum_size = Vector2(220, 60)
	back.pressed.connect(func(): result_ui.visible = false; back_to_lobby()); hb.add_child(back)
	result_ui.visible = true
	sfx.play("win" if win == me.team else "lose")

# ---------------- 开局 ----------------
func start_match(pilot: String, mech: String) -> void:
	sel_pilot = pilot; sel_mech = mech
	var midx: int = sel_map
	if midx < 0:   # 随机地图：逃亡圈默认「废墟逃亡区」，乐园模式默认「欢乐乐园」
		midx = randi() % data.maps.size()
		for i in data.maps.size():
			if (sel_mode.begins_with("escape") and data.maps[i].name == "废墟逃亡区") or (sel_mode == "park" and data.maps[i].park): midx = i
	if midx != cur_map: build_map(midx)
	var dur := float(OS.get_environment("GB_DURATION")) if OS.get_environment("GB_DURATION") != "" else 180.0
	sim = Sim.new(data, midx, 0, dur, sel_mode)
	var lay := sim.team_layout()
	var pw: Dictionary = {"lv": 7, "bt": 1} if autoplay else profile.power(pilot)
	me = sim.add_player(1, "你", lay[0], pilot, mech, false, pw)
	var blv: int = int(pw.lv)   # AI 强度跟着玩家等级（原版：人类玩家的平均等级）
	var bot_pw := {"lv": blv, "bt": 2 if blv >= 9 else (1 if blv >= 5 else 0)}
	var pool_p: Array = data.pilotOrder.duplicate(); pool_p.erase(pilot); pool_p.shuffle()
	var pool_m: Array = data.order.duplicate(); pool_m.shuffle()
	var names := BOT_NAMES.duplicate(); names.shuffle()
	for i in range(1, lay.size()):
		sim.add_player(i + 1, names[i - 1], lay[i], pool_p[(i - 1) % pool_p.size()], pool_m[(i - 1) % pool_m.size()], true, bot_pw)
	spectate_id = 0
	for id in mech_nodes: mech_nodes[id].root.queue_free()
	mech_nodes.clear()
	for id in helper_nodes: helper_nodes[id].queue_free()
	helper_nodes.clear()
	for p in sim.players: mech_nodes[p.id] = make_mech_node(p)
	for i in base_cols.size():
		paint_img.set_pixel(i % sim.GW, i / sim.GW, Color(0, 0, 0, 0)); mini_img.set_pixel(i % sim.GW, i / sim.GW, base_cols[i])
	paint_tex.update(paint_img); mini_tex.update(mini_img)
	for f in fx_list: f.node.queue_free()
	fx_list.clear()
	mode_view.setup(sim, team_col)
	showroom.visible = false
	menu.visible = false
	state = "play"
	acc = 0.0

func make_mech_node(p: Sim.Mech) -> Dictionary:
	var col: Color = team_col[p.team]
	if p.boss: col = Color("#5a2a7a")
	elif p.spirit: col = Color("#9a7cff")
	var n := Models.build_mech(p.weapon, data.mechs[p.weapon], col, data.pilots[p.pilot])
	if p.boss: n.scale = 2.6
	elif p.spirit: n.scale = 0.85
	add_child(n.root)
	var ov := StandardMaterial3D.new(); ov.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED; ov.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	ov.albedo_color = Color(1, 1, 1, 0); ov.grow = true; ov.grow_amount = 0.01
	var pos := Vector3(p.x * K, p.z * K, p.y * K)
	n.root.position = pos
	n.merge({"prev": pos, "cur": pos, "a_prev": float(p.inp.a), "a_cur": float(p.inp.a), "phase": 0.0, "recoil": 0.0, "squash": 0.0, "overlay": ov, "ov_mode": 0, "trail_t": 0.0, "vel": Vector3.ZERO})
	return n

# ---------------- 主循环 ----------------
func _process(delta: float) -> void:
	var real_dt := delta
	if hitstop_until > 0 and Time.get_ticks_msec() >= hitstop_until: Engine.time_scale = 1.0; hitstop_until = 0
	if state == "play" and sim != null:
		read_input()
		acc += min(delta, 0.1)
		while acc >= TICK:
			acc -= TICK
			for p in sim.players:
				var n: Dictionary = mech_nodes[p.id]
				n.prev = n.cur; n.a_prev = n.a_cur
			var cd0 := int(ceil(sim.countdown))
			sim.step(TICK)
			if sim.countdown > 0 and int(ceil(sim.countdown)) != cd0: sfx.play("count")
			elif sim.countdown <= 0 and cd0 == 1: sfx.play("go")
			for p in sim.players:
				var n: Dictionary = mech_nodes[p.id]
				n.cur = Vector3(p.x * K, p.z * K, p.y * K); n.a_cur = float(p.inp.a)
				if not p.alive: n.prev = n.cur
			apply_events()
			if sim.dirty.size() > 0:
				for i in sim.dirty:
					var t := sim.grid[i]
					paint_img.set_pixel(i % sim.GW, i / sim.GW, Color(1 if t == me.team else 0, 1 if t > 0 and t != me.team else 0, 0, 1 if t > 0 else 0))
					mini_img.set_pixel(i % sim.GW, i / sim.GW, team_col[t] if t > 0 else base_cols[i])
				paint_tex.update(paint_img); mini_tex.update(mini_img)
			if sim.over and state == "play":
				state = "result"
				show_result()
		update_visuals(acc / TICK, real_dt)
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
	else:
		var t := Time.get_ticks_msec() / 1000.0
		var c := Vector3(float(data.maps[cur_map].gw) / 2.0, 0, float(data.maps[cur_map].gh) / 2.0)
		if showroom.visible:
			var turn := showroom.get_node_or_null("turn")
			if turn != null: turn.rotation.y = t * 0.35
			var sp: Vector3 = showroom.position
			cam.fov = 40
			cam.position = sp + Vector3(showroom_cam, 4.6, 14.0)
			cam.look_at(sp + Vector3(showroom_cam, 2.0, 0))
		else:
			cam.position = c + Vector3(sin(t * 0.12) * 55, 48, cos(t * 0.12) * 55)
			cam.look_at(c)
		if sim != null: update_visuals(1.0, real_dt)
	update_fx(real_dt)
	hud.queue_redraw()
	if OS.get_environment("GB_SHOT") != "" and (OS.get_environment("GB_SHOT_MENU") != "" or (sim != null and state != "menu")):
		shot_t += real_dt
		if shot_t >= float(OS.get_environment("GB_SHOT_AT") if OS.get_environment("GB_SHOT_AT") != "" else "8"):
			get_viewport().get_texture().get_image().save_png(OS.get_environment("GB_SHOT"))
			print("截图：", OS.get_environment("GB_SHOT"), " FPS ", Engine.get_frames_per_second())
			get_tree().quit()

# 受击闪白 / 隐身半透明：给机兵所有零件挂一层叠加材质（每台机兵一份）
func set_overlay(n: Dictionary, flash: float, ghost: bool) -> void:
	var mode := 2 if ghost else (1 if flash > 0.02 else 0)
	var mat: StandardMaterial3D = n.overlay
	if mode == 1: mat.albedo_color = Color(1, 1, 1, clampf(flash, 0, 1) * 0.85)
	if mode == int(n.ov_mode): return
	n.ov_mode = mode
	if mode == 2: mat.albedo_color = Color(0.75, 0.8, 1.0, 0.45)
	for mi in n.parts: mi.material_overlay = mat if mode > 0 else null

func update_visuals(alpha: float, delta: float) -> void:
	for p in sim.players:
		var n: Dictionary = mech_nodes[p.id]
		var root: Node3D = n.root
		var vis: bool = p.alive and (me == null or p.team == me.team or sim.visible_to(me.team, p))
		root.visible = vis
		if not vis: continue
		var pos: Vector3 = n.prev.lerp(n.cur, alpha)
		var vel: Vector3 = (pos - root.position) / max(delta, 0.001)
		n.vel = n.vel.lerp(vel, min(1.0, delta * 10.0))
		root.position = pos
		var a := lerp_angle(float(n.a_prev), float(n.a_cur), alpha)
		var foot: bool = p.foot
		n.rig.visible = not foot and not p.wheel
		n.ball.visible = not foot and p.wheel
		n.foot.visible = foot
		var hv := Vector2(n.vel.x, n.vel.z)
		var spd := hv.length()
		n.phase += delta * spd * 1.9
		n.recoil = max(0.0, n.recoil - delta * 6.0)
		n.squash = max(0.0, n.squash - delta * 5.0)
		if foot:
			n.foot.rotation.y = -a
			n.foot.position.y = absf(sin(n.phase * 1.3)) * 0.12
		elif p.wheel:
			n.ball.rotation.y = -atan2(hv.y, hv.x) if spd > 0.5 else n.ball.rotation.y
			n.ball.get_child(0).rotation.z -= delta * spd * 1.2
			n.trail_t -= delta
			if n.trail_t <= 0 and spd > 4 and p.on_ground:
				n.trail_t = 0.08
				burst(pos + Vector3(0, 0.2, 0), team_col[p.team], 3, 2.5, 0.12, 0.35)
		else:
			n.body.rotation.y = -a
			var k: float = min(1.0, spd / 10.0)
			for i in 2: n.legs[i].rotation.z = sin(n.phase + i * PI) * 0.7 * k
			n.body.position = Vector3(-n.recoil * 0.18 * cos(a), 0.95 + absf(sin(n.phase)) * 0.09 * k, -n.recoil * 0.18 * sin(a)) if false else Vector3(0, 0.95 + absf(sin(n.phase)) * 0.09 * k, 0)
			n.gun.position.x = 0.35 - n.recoil * 0.3
			var tilt := Vector3(hv.y, 0, -hv.x).normalized() if spd > 0.3 else Vector3.RIGHT
			var sq: float = n.squash
			var s: float = n.scale
			n.rig.basis = Basis(tilt, min(0.14, spd * 0.012)) * Basis.from_scale(Vector3(s * (1 + sq * 0.12), s * (1 - sq * 0.2), s * (1 + sq * 0.12)))
		set_overlay(n, p.flash, p.hidden and p.team == me.team)
	# 子弹
	var counts := [0, 0, 0]
	for pr in sim.projs:
		var t: int = pr.team
		var mm: MultiMesh = proj_mm[t]
		if counts[t] >= mm.instance_count: continue
		var v := Vector3(pr.vx, pr.vz, pr.vy).normalized()
		var bs := Basis(Quaternion(Vector3.UP, v)) if absf(v.dot(Vector3.UP)) < 0.999 else Basis()
		var sz: float = float(pr.size) / 6.0
		mm.set_instance_transform(counts[t], Transform3D(bs.scaled(Vector3(sz, sz * 1.6, sz)), Vector3(pr.x * K, pr.z * K, pr.y * K)))
		counts[t] += 1
	for t in [1, 2]: proj_mm[t].visible_instance_count = counts[t]
	var sc := [0, 0, 0]
	for s in sim.shells:
		var t2: int = s.team
		var mm2: MultiMesh = shell_mm[t2]
		if sc[t2] >= mm2.instance_count: continue
		var sp := sim.shell_pos(s)
		mm2.set_instance_transform(sc[t2], Transform3D(Basis(), Vector3(sp.x * K, sp.z * K, sp.y * K)))
		sc[t2] += 1
	for t in [1, 2]: shell_mm[t].visible_instance_count = sc[t]
	var mc := 0
	for m in sim.missiles:
		if m.t > 0.5 or mc >= 16: continue
		var h: float = m.t / 0.5 * 30.0
		missile_mm.set_instance_transform(mc, Transform3D(Basis(Vector3.RIGHT, PI), Vector3(m.x * K, m.z * K + h, m.y * K))); mc += 1
	missile_mm.visible_instance_count = mc
	sync_helpers(delta)
	mode_view.sync(delta, me.team)
	update_camera(delta)
	update_aim()

func sync_helpers(delta: float) -> void:
	var seen := {}
	for h in sim.helpers:
		var id: int = h.id
		seen[id] = true
		if not helper_nodes.has(id):
			var g := Models.build_helper(h, team_col[h.team]); add_child(g); helper_nodes[id] = g
		var node: Node3D = helper_nodes[id]
		node.position = Vector3(h.x * K, h.z * K, h.y * K)
		if h.kind == "drone" or h.kind == "recon":
			node.position.y += sin(Time.get_ticks_msec() / 300.0 + id) * 0.15
			var rot := node.get_node_or_null("rotor"); if rot: rot.rotation.y += delta * 30.0
		elif h.kind == "turret":
			var hd := node.get_node_or_null("head"); if hd: hd.rotation.y = lerp_angle(hd.rotation.y, -float(h.ang), min(1.0, delta * 12.0))
		elif h.kind == "wall":
			node.rotation.y = -float(h.ang) + PI / 2
		elif h.kind == "supply" and h.fall > 0:
			node.position.y += float(h.fall) * 25.0
		elif h.kind in ["fire", "fog", "nano"] and randf() < delta * 8.0:
			var r: float = float(h.r) * K * randf(); var aa := randf() * TAU
			var col: Color = {"fire": Color("#ff6a1f"), "fog": Color("#9cff2e"), "nano": Color("#5ff0d0")}[h.kind]
			burst(node.position + Vector3(cos(aa) * r, 0.2, sin(aa) * r), col, 3, 2.0, 0.22, 0.8, -2.0)
		elif h.kind == "decoy" or h.kind == "charge":
			node.scale = Vector3.ONE * (1.0 + 0.08 * sin(Time.get_ticks_msec() / 60.0))
	for id in helper_nodes.keys():
		if not seen.has(id):
			helper_nodes[id].queue_free(); helper_nodes.erase(id)

func update_camera(delta: float) -> void:
	shake = max(0.0, shake - delta * 2.2)
	fov_punch = max(0.0, fov_punch - delta * 2.5)
	if me != null and state == "play":
		var follow: Sim.Mech = me
		if not me.alive and (me.out or me.respawn_t > 100):   # 一条命的模式里出局：看还活着的队友（或者任何人）
			var cur := player_by_id(spectate_id)
			if cur == null or not cur.alive:
				cur = null
				for q in sim.players:
					if q.alive and not q.npc and (cur == null or (q.team == me.team and cur.team != me.team)): cur = q
			if cur != null: follow = cur; spectate_id = cur.id
		var n: Dictionary = mech_nodes[follow.id]
		var mp: Vector3 = n.root.position
		var look := Vector3(cos(follow.inp.a), 0, sin(follow.inp.a)) * (2.5 if not touch_mode else 1.5)
		var off := Vector3(0, 23, 17.5)
		var target := mp + look + off
		cam.position = cam.position.lerp(target, min(1.0, delta * 6.0))
		cam.look_at(cam.position - off + Vector3(0, 1.0, 0))
		cam.fov = 42 + fov_punch * 6
		if shake > 0:
			var s := shake * shake * 0.8
			cam.position += Vector3(randf_range(-s, s), randf_range(-s, s) * 0.5, randf_range(-s, s))

func update_aim() -> void:
	var show := me != null and state == "play" and me.alive and not touch_mode and sim.countdown <= 0
	aim_line.visible = false; aim_ring.visible = false
	if not show or me.wheel: return
	var w: Dictionary = data.mechs[me.weapon]
	var A: Dictionary = data.pilots[me.pilot].sidearm
	var col: Color = team_col[me.team]
	var mp: Vector3 = mech_nodes[me.id].root.position + Vector3(0, 0.12, 0)
	var a := float(me.inp.a)
	var lob: bool = (str(w.attack) == "lob" and not me.foot) or (me.foot and str(A.kind) == "lob")
	if lob:
		var d: float = clampf(float(me.inp.ad), float(w.get("minRange", 60)) if not me.foot else 60.0, float(w.range) if not me.foot else float(A.range)) * K
		var tx := me.x * K + cos(a) * d; var ty := me.y * K + sin(a) * d
		aim_ring.visible = true
		aim_ring.position = Vector3(tx, sim.top_at(tx / K, ty / K) * K + 0.15, ty)
		var r: float = float(w.get("blast", 50)) * K
		aim_ring.scale = Vector3(r, 1, r)
		aim_ring.material_override = Models.glow(col, 2.0, 0.7)
	else:
		var L: float = (float(A.range) if me.foot else float(w.range2)) * K
		if str(w.attack) == "charge" and not me.foot: L *= 0.35 + 0.65 * me.charge
		aim_line.visible = true
		aim_line.material_override = Models.glow(col, 1.6, 0.18 + (0.25 if me.firing else 0.0))
		aim_line.basis = Basis(Vector3.UP, -a) * Basis.from_scale(Vector3(L, 1, 0.22 if str(w.attack) != "punch" or me.foot else 1.0))
		aim_line.position = mp + Vector3(cos(a), 0, sin(a)) * L * 0.5

# ---------------- 特效 ----------------
func add_fx(node: Node3D, life: float, kind: String, extra := {}) -> void:
	add_child(node)
	var f := {"node": node, "life": life, "max": life, "kind": kind}
	f.merge(extra)
	fx_list.append(f)

func burst(pos: Vector3, c: Color, amount := 10, speed := 4.0, size := 0.18, life := 0.45, grav := -14.0) -> void:
	var ps := CPUParticles3D.new()
	ps.one_shot = true; ps.emitting = true; ps.amount = amount; ps.lifetime = life; ps.explosiveness = 0.95
	ps.direction = Vector3.UP; ps.spread = 75; ps.initial_velocity_min = speed * 0.4; ps.initial_velocity_max = speed
	ps.gravity = Vector3(0, grav, 0); ps.scale_amount_min = 0.5; ps.scale_amount_max = 1.2
	var crv := Curve.new(); crv.add_point(Vector2(0, 1)); crv.add_point(Vector2(1, 0)); ps.scale_amount_curve = crv
	ps.mesh = Models.mesh("sph", size); ps.material_override = Models.glow(c, 1.6)
	ps.position = pos
	add_fx(ps, life + 0.4, "ps")

func ring(pos: Vector3, r: float, c: Color, life := 0.45, h := 0.15) -> void:
	var mi := MeshInstance3D.new(); mi.mesh = Models.mesh("torus", 0.85, 1.0); mi.material_override = Models.glow(c, 2.2, 0.85)
	mi.position = pos + Vector3(0, h, 0); mi.scale = Vector3.ONE * 0.1; mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_fx(mi, life, "ring", {"r": r})

func flash_light(pos: Vector3, c: Color, energy := 3.0, rng := 8.0, life := 0.12) -> void:
	if not desktop: return
	var l := OmniLight3D.new(); l.light_color = c; l.light_energy = energy; l.omni_range = rng; l.position = pos
	add_fx(l, life, "light", {"e": energy})

func beam(a: Vector3, b: Vector3, c: Color, w: float, life := 0.22) -> void:
	var mi := MeshInstance3D.new(); var L := a.distance_to(b)
	if L < 0.05: return
	mi.mesh = Models.mesh("box", 1.0, 1.0, 1.0); mi.material_override = Models.glow(c, 3.0)
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(mi)
	mi.look_at_from_position((a + b) * 0.5, b, Vector3.UP if absf((b - a).normalized().y) < 0.99 else Vector3.RIGHT)
	mi.scale = Vector3(w, w, L)
	remove_child(mi)
	add_fx(mi, life, "beam", {"w": w})

func fireball(pos: Vector3, r: float, c: Color) -> void:
	var mi := MeshInstance3D.new(); mi.mesh = Models.mesh("sph", 1.0); mi.material_override = Models.glow(c.lightened(0.3), 2.2, 0.75)
	mi.position = pos; mi.scale = Vector3.ONE * 0.1; mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_fx(mi, 0.35, "ball", {"r": r})

func update_fx(delta: float) -> void:
	var keep: Array = []
	for f in fx_list:
		f.life -= delta
		var node: Node3D = f.node
		var k: float = 1.0 - f.life / f.max
		match f.kind:
			"ring": node.scale = Vector3.ONE * (0.1 + ease(k, 0.4) * float(f.r))
			"ball": node.scale = Vector3.ONE * (0.1 + ease(k, 0.3) * float(f.r)); node.transparency = k
			"beam": node.scale = Vector3(float(f.w) * (1.0 - k * 0.85), float(f.w) * (1.0 - k * 0.85), node.scale.z)
			"lock": node.rotation.y += delta * 3.0; node.scale = Vector3.ONE * (1.0 + 0.15 * sin(k * 30.0))
			"light": (node as OmniLight3D).light_energy = float(f.e) * (1.0 - k)
			"debris": node.position += f.v * delta; f.v.y -= 22.0 * delta; node.rotation += Vector3(4, 3, 5) * delta
			"text": pass
			"tele": node.scale = Vector3(float(f.r) * (0.6 + 0.4 * k), 6, float(f.r) * (0.6 + 0.4 * k))
		if f.life <= 0: node.queue_free()
		else: keep.append(f)
	fx_list = keep
	# 持续光束（极光喷射）：没有新事件就隐藏
	for id in beams.keys():
		var b: Dictionary = beams[id]
		b.t -= delta
		if b.t <= 0: b.node.queue_free(); beams.erase(id)

func near_me(x: float, y: float, r := 900.0) -> float:
	if me == null: return 1.0
	var d := Vector2(x - me.x, y - me.y).length()
	return clampf(1.0 - d / r, 0.0, 1.0)

func vol_at(x: float, y: float) -> float:
	var k := near_me(x, y, 1100.0)
	return -40.0 if k <= 0 else linear_to_db(0.15 + k * 0.85)

func apply_events() -> void:
	for e in sim.events:
		match e[0]:
			"fire":
				var p := player_by_id(e[1])
				if p == null: continue
				var n: Dictionary = mech_nodes[p.id]
				n.recoil = 1.0
				var a := float(p.inp.a)
				var tip: Vector3 = n.root.position + Vector3(cos(a) * 1.9, 1.5, sin(a) * 1.9) + Vector3(-sin(a), 0, cos(a)) * 0.85
				var c: Color = team_col[p.team]
				burst(tip, c.lightened(0.4), 4, 3.0, 0.14, 0.15, 0.0)
				flash_light(tip, c, 2.0, 6.0, 0.08)
				var atk := "sidearm" if p.foot else str(data.mechs[p.weapon].attack)
				sfx.play({"burst": "shoot_burst", "fan": "shoot_fan", "flick": "shoot_fan", "lob": "shoot_lob", "punch": "punch"}.get(atk, "shoot_burst"), vol_at(p.x, p.y) - (4.0 if p != me else 0.0))
			"punch":
				var p := player_by_id(e[1])
				if p == null: continue
				var a := float(e[2])
				var pos: Vector3 = mech_nodes[p.id].root.position + Vector3(cos(a) * 1.6, 1.2, sin(a) * 1.6)
				var arc := MeshInstance3D.new(); arc.mesh = Models.mesh("torus", 1.2, 1.45); arc.material_override = Models.glow(team_col[p.team], 2.5, 0.8)
				arc.position = mech_nodes[p.id].root.position + Vector3(0, 1.2, 0); arc.scale = Vector3(1.4, 0.4, 1.4) if not e[3] else Vector3(2.2, 0.4, 2.2)
				arc.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
				add_fx(arc, 0.18, "ring", {"r": 1.6 if not e[3] else 2.6})
				burst(pos, team_col[p.team], 6, 4.0, 0.15, 0.25)
				sfx.play("slash" if p.weapon in ["blade", "reaper", "lancer"] else "punch", vol_at(p.x, p.y))
			"hit":
				var pos2 := Vector3(e[2] * K, e[4] * K, e[3] * K)
				burst(pos2, team_col[e[5]], 9, 5.0, 0.15, 0.35)
				if e[1] == me.id or near_me(e[2], e[3], 500) > 0.3: sfx.play("hit", vol_at(e[2], e[3]) - 3.0)
			"pdie":
				if randf() < 0.4: burst(Vector3(e[1] * K, e[3] * K + 0.1, e[2] * K), team_col[e[4]], 4, 2.5, 0.12, 0.3)
				if randf() < 0.15: sfx.play("splat", vol_at(e[1], e[2]) - 8.0)
			"line":
				var a1 := Vector3(e[1] * K, e[3] * K, e[2] * K); var b1 := Vector3(e[4] * K, e[6] * K, e[5] * K)
				beam(a1, b1, team_col[e[7]], 0.12 + 0.28 * float(e[8]), 0.28)
				burst(b1, team_col[e[7]], 12, 5.0, 0.15, 0.3)
				flash_light(a1, team_col[e[7]], 3.0, 8.0, 0.1)
				sfx.play("shoot_charge", vol_at(e[1], e[2]))
			"beam":
				var id: int = e[1]
				var a2 := Vector3(e[2] * K, e[4] * K, e[3] * K); var b2 := Vector3(e[5] * K, e[7] * K, e[6] * K)
				if not beams.has(id):
					var mi := MeshInstance3D.new(); mi.mesh = Models.mesh("cyl", 0.5, 1.0); mi.material_override = Models.glow(team_col[e[8]], 3.0, 0.9)
					mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF; add_child(mi)
					beams[id] = {"node": mi, "t": 0.0}
					sfx.play("beam", vol_at(e[2], e[3]))
				var bn: MeshInstance3D = beams[id].node
				var L := a2.distance_to(b2)
				bn.look_at_from_position((a2 + b2) * 0.5, b2, Vector3.UP)
				bn.rotate_object_local(Vector3.RIGHT, PI / 2)
				bn.scale = Vector3(0.9 + randf() * 0.2, L, 0.9 + randf() * 0.2)
				beams[id].t = 0.12
				if randf() < 0.3: burst(b2, team_col[e[8]], 4, 4.0, 0.18, 0.25)
			"boom":
				var pos3 := Vector3(e[1] * K, e[3] * K, e[2] * K)
				var r: float = float(e[5]) * K
				fireball(pos3, r * 0.8, team_col[e[4]]); ring(pos3, r * 1.15, team_col[e[4]], 0.4); burst(pos3, team_col[e[4]], 22, 7.0, 0.22, 0.6)
				flash_light(pos3 + Vector3(0, 1, 0), team_col[e[4]], 5.0, r * 3.0, 0.25)
				shake = max(shake, 0.6 * near_me(e[1], e[2], 700.0))
				sfx.play("boom", vol_at(e[1], e[2]))
			"lock":
				var mi2 := MeshInstance3D.new(); mi2.mesh = Models.mesh("torus", 4.2, 4.8); mi2.material_override = Models.glow(Color("#ff3b52"), 2.5, 0.8)
				mi2.position = Vector3(e[1] * K, e[3] * K + 0.2, e[2] * K); mi2.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
				add_fx(mi2, 1.5, "lock")
				sfx.play("lock", vol_at(e[1], e[2]) - 4.0)
			"wreck":
				var pos4 := Vector3(e[3] * K, e[5] * K + 1.2, e[4] * K)
				var c4: Color = team_col[e[6]]
				for i in 9:
					var mi3 := MeshInstance3D.new(); mi3.mesh = Models.mesh("box", 0.35, 0.3, 0.3); mi3.material_override = Models.toon(c4 if i % 2 == 0 else Color("#262838"))
					mi3.position = pos4
					add_fx(mi3, 1.0, "debris", {"v": Vector3(randf_range(-6, 6), randf_range(6, 12), randf_range(-6, 6))})
				fireball(pos4, 2.2, Color("#ff8a1f")); burst(pos4, c4, 26, 8.0, 0.25, 0.6); burst(pos4, Color("#555566"), 10, 3.0, 0.45, 1.0, 2.0)
				flash_light(pos4, Color("#ff8a1f"), 6.0, 12.0, 0.3)
				shake = max(shake, 0.8 * near_me(e[3], e[4], 700.0))
				sfx.play("wreck", vol_at(e[3], e[4]))
				hud.feed(e, "击毁")
				if e[1] == me.id or e[2] == me.id: hitstop(70)
			"ko":
				var pos5 := Vector3(e[3] * K, e[5] * K + 0.8, e[4] * K)
				burst(pos5, team_col[e[6]], 30, 8.0, 0.22, 0.6); ring(pos5, 4.0, Color.WHITE, 0.5)
				sfx.play("ko", vol_at(e[3], e[4]))
				hud.feed(e, "击倒")
				if e[1] == me.id or e[2] == me.id: hitstop(90)
			"mdrop":
				var pos6 := Vector3(e[2] * K, e[4] * K, e[3] * K)
				beam(pos6 + Vector3(0, 30, 0), pos6, team_col[player_by_id(e[1]).team], 1.4, 0.35); ring(pos6, 5.0, Color.WHITE, 0.5)
				shake = max(shake, 0.4 * near_me(e[2], e[3], 600.0))
				sfx.play("boom", vol_at(e[2], e[3]) - 4.0)
			"skill":
				var p2 := player_by_id(e[1])
				if p2 == null: continue
				var acc_c := Color(str(data.pilots[p2.pilot].accent))
				ring(Vector3(e[3] * K, e[5] * K, e[4] * K), 3.0, acc_c, 0.6)
				burst(Vector3(e[3] * K, e[5] * K + 1.5, e[4] * K), acc_c, 14, 4.0, 0.16, 0.5, -2.0)
				sfx.play("skill", vol_at(e[3], e[4]))
				if e[1] == me.id: hud.banner("技能 • " + str(data.pilots[me.pilot].skillInfo.name), acc_c)
			"super":
				var p3 := player_by_id(e[1])
				if p3 == null: continue
				ring(Vector3(e[3] * K, e[5] * K, e[4] * K), 5.5, Color("#ffe14d"), 0.7)
				burst(Vector3(e[3] * K, e[5] * K + 1.5, e[4] * K), Color("#ffe14d"), 24, 6.0, 0.2, 0.6, -4.0)
				sfx.play("super", vol_at(e[3], e[4]))
				if e[1] == me.id:
					hud.banner("大招 • " + str(data.mechs[me.weapon].specialInfo.name), Color("#ffe14d"), data.pilots[me.pilot])
					fov_punch = 1.0; shake = max(shake, 0.4)
			"heal":
				var p4 := player_by_id(e[1])
				if p4 != null: burst(Vector3(p4.x * K, p4.z * K + 1.5, p4.y * K), Color("#6dff8a"), 10, 2.0, 0.16, 0.8, -3.0); hud.float_text(p4, "+%d" % int(e[2]), Color("#6dff8a"))
			"blink":
				var pa := Vector3(e[2] * K, e[4] * K + 1.2, e[3] * K); var pb := Vector3(e[5] * K, e[7] * K + 1.2, e[6] * K)
				beam(pa, pb, Color("#ff4f7a"), 0.5, 0.3); ring(pa, 2.0, Color("#ff4f7a")); ring(pb, 2.5, Color("#ff4f7a"))
			"rend":
				var p5 := player_by_id(e[1])
				var a5 := float(e[5])
				var s5 := Vector3(e[2] * K, e[4] * K + 1.2, e[3] * K)
				beam(s5, s5 + Vector3(cos(a5), 0, sin(a5)) * 32.0, team_col[e[6]], 1.2, 0.4)
				shake = max(shake, 0.5)
				sfx.play("slash", vol_at(e[2], e[3]) + 2.0)
			"quake":
				var pq := Vector3(e[1] * K, e[3] * K, e[2] * K)
				ring(pq, 7.0, team_col[e[4]], 0.5); burst(pq, Color("#8a7a6a"), 26, 7.0, 0.3, 0.7)
				shake = max(shake, 0.9 * near_me(e[1], e[2], 700.0))
				sfx.play("boom", vol_at(e[1], e[2]))
			"bind": var pb2 := player_by_id(e[1]); if pb2 != null: ring(Vector3(pb2.x * K, pb2.z * K, pb2.y * K), 1.8, Color("#b48cff"), 0.6, 1.0)
			"block", "guard", "shield": sfx.play("shield", -10.0)
			"backstab": hud.float_text(player_by_id(e[1]), "背刺！", Color("#ff3b52"))
			"opener": hud.float_text(player_by_id(e[1]), "先手！", Color("#ff4f7a"))
			"jump": if e[1] == me.id: sfx.play("jump", -8.0)
			"land":
				var pl := player_by_id(e[1])
				if pl != null:
					mech_nodes[pl.id].squash = 1.0
					burst(Vector3(pl.x * K, pl.z * K + 0.1, pl.y * K), Color("#a8a4c8"), 8, 3.0, 0.2, 0.4, -4.0)
					if pl == me: sfx.play("land", -6.0); shake = max(shake, 0.25)
			"pad": var pp := player_by_id(e[1]); if pp != null: sfx.play("pad", vol_at(pp.x, pp.y)); mech_nodes[pp.id].squash = 1.0
			"pickup": if e[1] == me.id: sfx.play("pickup")
			"lob": var pl2 := player_by_id(e[1]); if pl2 != null and randf() < 0.5: sfx.play("shoot_lob", vol_at(pl2.x, pl2.y) - 6.0)
			"spawn": var ps2 := player_by_id(e[1]); if ps2 != null and mech_nodes.has(ps2.id): ring(Vector3(ps2.x * K, ps2.z * K, ps2.y * K), 3.0, team_col[ps2.team], 0.6)
			"dmg":
				hud.dmg_text(player_by_id(e[1]), int(e[2]), e[3] == me.id)
				if e[1] == me.id: shake = max(shake, 0.18)
			_: mode_event(e)

# 超载 + 各模式的事件：横幅、音效、特效
func mode_event(e: Array) -> void:
	var mine := func(team: int) -> bool: return team == me.team
	match e[0]:
		"ov":
			var p := player_by_id(e[1])
			if p == null: return
			var O: Dictionary = data.pilots[p.pilot].overload
			var c := Color(str(data.pilots[p.pilot].accent))
			var pos := Vector3(e[2] * K, e[4] * K, e[3] * K)
			ring(pos, 5.0, c, 0.6); ring(pos, 3.0, Color.WHITE, 0.4); burst(pos + Vector3(0, 1.5, 0), c, 30, 7.0, 0.22, 0.7, -3.0)
			flash_light(pos + Vector3(0, 2, 0), c, 6.0, 14.0, 0.35)
			sfx.play("super", vol_at(e[2], e[3]))
			if p == me:
				hud.banner("超载 • " + str(O.name), c, data.pilots[p.pilot]); fov_punch = 1.0; shake = max(shake, 0.5)
		"goal":
			var team: int = e[1]
			hud.banner(("我方得分！" if mine.call(team) else "对方得分！"), team_col[team])
			sfx.play("win" if mine.call(team) else "lose", -4.0); shake = max(shake, 0.4)
		"grab": var p2 := player_by_id(e[1]); if p2 != null: hud.banner(("我方" if p2.team == me.team else "对方") + "抢到了宝物核心！", team_col[p2.team]); sfx.play("pickup")
		"drop": hud.banner("宝物核心掉在地上了！", Color("#ffe14d"))
		"trr": hud.banner("宝物核心回到中央", Color("#ffe14d"))
		"dep":
			var p3 := player_by_id(e[1])
			if p3 != null:
				hud.float_text(p3, "+%d" % int(e[2]), Color("#ffe14d")); sfx.play("pickup", 0.0 if p3 == me else -8.0)
				ring(Vector3(p3.x * K, p3.z * K, p3.y * K), 3.0, team_col[p3.team], 0.5)
		"bp": if e[1] == me.id: sfx.play("pickup", -4.0)
		"zn":
			var o: int = e[1]
			hud.banner("据点变为中立" if o == 0 else ("我方占领了据点！" if mine.call(o) else "据点被对方占领！"), Color.WHITE if o == 0 else team_col[o]); sfx.play("lock")
		"rd": hud.banner("第 %d 局：%s" % [int(e[4]), "我方获胜！" if mine.call(e[1]) else "对方获胜"], team_col[e[1]]); sfx.play("win" if mine.call(e[1]) else "lose", -4.0)
		"rs": hud.banner("第 %d 局 开始！" % int(e[1]), Color("#ffe14d")); sfx.play("go")
		"cz": hud.banner("毒圈开始缩小！", Color("#ff6b8a")); sfx.play("lock")
		"cr": hud.banner("新的空投箱降落了", Color("#ffb000"))
		"crt":
			burst(Vector3(e[2] * K, e[4] * K + 1, e[3] * K), Color("#ffb000"), 16, 5.0, 0.2, 0.5)
			if e[1] == me.id: hud.banner("空投箱 × %d：伤害和生命都提高了" % int(e[5]), Color("#ffb000")); sfx.play("pickup")
		"tout":
			var t: int = e[1]
			hud.banner(("我方" if mine.call(t) else "一支小队") + "出局了（第 %d 名）" % int(e[2]), team_col[t]); sfx.play("ko", -4.0)
		"boss":
			var pos2 := Vector3(e[3] * K, e[5] * K, e[4] * K)
			match str(e[2]):
				"rage": hud.banner("百目狂暴了！", Color("#ff3b52")); ring(pos2, 9.0, Color("#ff3b52"), 0.8); shake = max(shake, 0.7); sfx.play("super")
				"summon": hud.banner("百目召唤了小咒灵", Color("#b48cff"))
				"dash": ring(pos2, 4.0, Color("#ff3b52"), 0.4); sfx.play("boom", -6.0)
				"ring": burst(pos2 + Vector3(0, 3, 0), Color("#b48cff"), 20, 6.0, 0.3, 0.5)
				"down":
					hud.banner("百目被打倒了！", Color("#ffe14d")); fireball(pos2 + Vector3(0, 3, 0), 9.0, Color("#b48cff")); ring(pos2, 14.0, Color("#ffe14d"), 0.9)
					shake = 1.0; hitstop(160); sfx.play("wreck")
		"tg":
			var mi := MeshInstance3D.new(); mi.mesh = Models.mesh("torus", 0.92, 1.0); mi.material_override = Models.glow(Color("#ff3b52"), 2.4, 0.85)
			var r: float = float(e[4]) * K
			mi.position = Vector3(e[1] * K, e[3] * K + 0.15, e[2] * K); mi.scale = Vector3(r, 6, r); mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
			add_fx(mi, float(e[5]), "tele", {"r": r})
		"summon": ring(Vector3(e[2] * K, e[4] * K, e[3] * K), 3.0, Color("#b48cff"), 0.6); burst(Vector3(e[2] * K, e[4] * K + 1, e[3] * K), Color("#b48cff"), 16, 4.0, 0.2, 0.6, -2.0)
		"balloon":
			var pb := Vector3(e[3] * K, e[5] * K, e[4] * K)
			burst(pb, team_col[e[2]], 20, 6.0, 0.2, 0.5); ring(pb, 2.0, Color.WHITE, 0.3); sfx.play("pickup", vol_at(e[3], e[4]) - 4.0)
		"dmn": burst(Vector3(e[3] * K, e[5] * K + 1.2, e[4] * K), Color("#b48cff"), 8, 4.0, 0.16, 0.3)

func hitstop(ms: int) -> void:
	Engine.time_scale = 0.12
	hitstop_until = Time.get_ticks_msec() + ms

func player_by_id(id: int) -> Sim.Mech:
	for p in sim.players:
		if p.id == id: return p
	return null

# ---------------- 输入 ----------------
func ground_point(screen: Vector2, h: float) -> Vector3:
	var o := cam.project_ray_origin(screen); var d := cam.project_ray_normal(screen)
	if absf(d.y) < 0.0001: return o
	return o + d * ((h - o.y) / d.y)

func read_input() -> void:
	if me == null: return
	var inp := me.inp
	if touch_mode:
		inp.mx = t_move.v.x; inp.my = t_move.v.y
		if t_aim.v.length() > 0.25:
			inp.a = atan2(t_aim.v.y, t_aim.v.x); inp.f = true
			inp.ad = 120.0 + t_aim.v.length() * 300.0
		else:
			inp.f = false
		inp.pt = 0.0
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
	var dx := gp.x / K - me.x; var dy := gp.z / K - me.y
	inp.a = atan2(dy, dx)
	var d := Vector2(dx, dy).length()
	inp.ad = d
	var th := sim.top_at(gp.x / K, gp.z / K)
	inp.pt = atan2(th + 16.0 - (me.z + 24.0), max(40.0, d)) if th > me.z + 20 else 0.0
	inp.f = Input.is_mouse_button_pressed(MOUSE_BUTTON_LEFT) and not menu.visible
	inp.w = Input.is_physical_key_pressed(KEY_SHIFT)
	inp.j = Input.is_physical_key_pressed(KEY_SPACE)

func _unhandled_input(ev: InputEvent) -> void:
	if state != "play" or me == null: return
	if ev is InputEventKey and ev.pressed and not ev.echo:
		match ev.physical_keycode:
			KEY_Q: me.inp.gq += 1
			KEY_E: me.inp.qq += 1
			KEY_R: me.inp.oq += 1
			KEY_ESCAPE: back_to_lobby()
	if ev is InputEventMouseButton and ev.pressed and ev.button_index == MOUSE_BUTTON_RIGHT:
		me.inp.qq += 1
	if ev is InputEventScreenTouch or ev is InputEventScreenDrag:
		touch_mode = true
		handle_touch(ev)

func touch_buttons() -> Dictionary:
	var s := get_viewport().get_visible_rect().size
	return {"super": [Vector2(s.x - 230, s.y - 230), 52.0], "skill": [Vector2(s.x - 330, s.y - 150), 44.0], "wheel": [Vector2(s.x - 110, s.y - 330), 40.0], "jump": [Vector2(s.x - 210, s.y - 340), 36.0], "ov": [Vector2(s.x - 340, s.y - 280), 36.0]}

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
					elif name == "ov": me.inp.oq += 1
					elif name == "wheel": wheel_hold = true
					return
			if pos.x < s.x * 0.45 and t_move.id < 0: t_move = {"id": idx, "o": pos, "v": Vector2.ZERO}
			elif t_aim.id < 0: t_aim = {"id": idx, "o": pos, "v": Vector2.ZERO}
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


# ---------------- 大厅 ----------------
func start_from_lobby() -> void:
	var o: Dictionary = profile.o
	if not profile.has_pilot(o.pilot): lobby.toast("先在「驾驶员」里选一位驾驶员"); return
	sel_mode = o.mode; sel_map = int(o.map)
	start_match(o.pilot, o.weapon)

func back_to_lobby() -> void:
	state = "menu"; menu.visible = true; result_ui.visible = false
	if hitstop_until > 0: Engine.time_scale = 1.0; hitstop_until = 0
	lobby.refresh()

# 大厅的 3D 展台：机体 + 站在旁边的驾驶员，放在场地外面的地上，背后是城市夜景
func show_showroom(pid: String, mech: String, vis: bool, cam_x := 0.0) -> void:
	showroom_cam = cam_x
	showroom.visible = vis and pid != ""
	if pid == "" or not data.pilots.has(pid): return
	var key := pid + "|" + mech
	if key != showroom_key:
		showroom_key = key
		for c in showroom.get_children(): c.queue_free()
		var tc: Color = team_col[1]
		var turn := Node3D.new(); turn.name = "turn"; showroom.add_child(turn)
		var n := Models.build_mech(mech, data.mechs[mech], tc, data.pilots[pid])
		n.root.scale = Vector3.ONE * 1.6; turn.add_child(n.root)
		var disc := MeshInstance3D.new(); disc.mesh = Models.mesh("cyl", 3.6, 0.3); disc.material_override = Models.toon(Color("#2a2550"), 0.1, 0.6); disc.position.y = -0.15; showroom.add_child(disc)
		var rim := MeshInstance3D.new(); rim.mesh = Models.mesh("torus", 3.5, 3.75); rim.material_override = Models.glow(Color(str(data.pilots[pid].accent)), 2.4); showroom.add_child(rim)
		var l := OmniLight3D.new(); l.position = Vector3(2, 5, 4); l.light_energy = 2.2; l.omni_range = 14; showroom.add_child(l)
	var m: Dictionary = data.maps[cur_map]
	showroom.position = Vector3(float(m.gw) / 2.0, -0.45, float(m.gh) + 14.0)
