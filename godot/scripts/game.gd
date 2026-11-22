# 涂鸦机兵 Godot 版 —— 主场景：菜单、3D 画面、动画、特效、镜头、输入
# 模拟在 sim.gd（每秒 30 次），画面每帧插值显示
extends Node3D

const K := 1.0 / 16.0          # 原版 1 格 = 16 像素 → Godot 1 个单位
const TICK := 1.0 / 30.0
const LOOT_MAP := 99         # 搜刮撤离的超大地图（不在普通地图列表里）
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
var fill_light: DirectionalLight3D
var weather: Node3D       # 3.1：天气粒子（跟着镜头走）
var paint_img: Image
var paint_tex: ImageTexture
var base_tex: ImageTexture
var mini_img: Image
var mini_tex: ImageTexture
var base_cols := PackedColorArray()
var turf_mat: ShaderMaterial
var mech_nodes := {}
var helper_nodes := {}
var dawn_nodes := {}      # 3.1「黎明之后」联动的画面节点（dawn_fx.gd）
var night_rect: ColorRect
var cine: Control
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
var accounts: Accounts
var settings: Settings
var music: Music
var lobby: Lobby
var showroom: Node3D
var showroom_key := ""
var showroom_cam := 0.0
var autoplay := false
var ranked_on := false
var net: Net
var peer_ids := {}
var match_seed := 0
var net_snap = null
var net_snap_t := 0.0
var net_send_t := 0.0
var base_img_saved: Image
var net_client_match := false
var loot_risk := "normal"
var bag_open := false
var loot_ui: Control
var loot_ui_t := 0.0
var ranked_bans := {}
var prep := {}            # 匹配阶段定好的阵容（matchflow.gd）：players[i] 对应 team_layout 的第 i 个位置
var matchflow: MatchFlow
var thumbs: Thumbs
var botchat: BotChat
var social: Social
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
	net = Net.new(); net.name = "Net"; add_child(net)
	net.match_started.connect(_on_net_start)
	net.snapshot.connect(func(sn): net_snap = sn)
	net.match_ended.connect(_on_net_end)
	net.status.connect(func(t): if lobby != null: lobby.toast(t))
	net.loot_cmd_in.connect(func(peer, op, args): host_loot(player_by_id(int(peer_ids.get(peer, -1))), op, args))
	net.chat.connect(func(pid, text, ch): if sim != null and state == "play": var q := player_by_id(pid); chat_add(q, text, ch, true); if q != null and botchat != null: botchat.react(q, text, ch, 0))
	net.room_changed.connect(func(): if lobby != null and lobby.sub == "lan" and state == "menu": lobby.refresh())
	settings = Settings.new()
	music = Music.new(); add_child(music)
	setup_world()
	settings.apply(self)
	music.play("menu")
	hud = preload("res://scripts/hud.gd").new()
	hud.game = self
	hud.set_anchors_preset(Control.PRESET_FULL_RECT)
	hud.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var layer := CanvasLayer.new(); add_child(layer); layer.add_child(hud)
	accounts = Accounts.new()
	Bots.init(data)
	I18n.lang = settings.lang if OS.get_environment("GB_LANG") == "" else OS.get_environment("GB_LANG")
	I18n.load_all()
	profile = load_profile()
	lobby = Lobby.new(self); menu = lobby; layer.add_child(menu)
	matchflow = MatchFlow.new(self); layer.add_child(matchflow)
	thumbs = Thumbs.new(self); add_child(thumbs)
	social = Social.new(self); add_child(social)
	social.invited.connect(func(n, ips, code): lobby.invite_popup(n, ips, code))
	social.changed.connect(func(): if lobby != null and state == "menu" and lobby.sub == "friends": lobby.refresh())
	result_ui = Control.new(); result_ui.set_anchors_preset(Control.PRESET_FULL_RECT); result_ui.theme = theme_ui; result_ui.visible = false; layer.add_child(result_ui)
	build_map(0)
	mode_view = ModeView.new(); add_child(mode_view)
	showroom = Node3D.new(); add_child(showroom)
	if OS.get_environment("GB_MODE") != "": sel_mode = OS.get_environment("GB_MODE")
	autoplay = OS.get_environment("GB_AUTOPLAY") != ""
	if not autoplay:
		if OS.get_environment("GB_TAB") != "" and int(profile.o.tut) == 0:   # 截图用：直接给个开好宝箱的账号
			profile.tutorial(); profile.open_chest("starter"); profile.o.gems = 600
		if OS.get_environment("GB_RICH") != "":   # 截图用：全部驾驶员和机体
			for id in data.pilotOrder: profile.o.pilots[id] = {"lv": 7, "bt": 1}
			for id in data.order:
				if not profile.o.mechs.has(id): profile.o.mechs.append(id)
			profile.o.rank.rp = 700
			for K in data.econ.skins: if not profile.o.skins.has(K.id) and randf() < 0.6: profile.o.skins.append(K.id)
			profile.o.wear.frame = "fr_flame"; profile.o.matches = 137; profile.o.wins = 80; profile.o.kills = 512; profile.o.mvps = 23; profile.o.badges = [12, 30, 41, 25, 23]
			profile.o.show = [{"k": "pilot", "id": "blaze"}, {"k": "mech", "id": "roller"}, {}]; profile.o.sign = "涂满整座城市！"; profile.o.showBg = "flame"
			profile.o.stash = {"can": 3, "battery": 2, "scrap": 9}
			if OS.get_environment("GB_LOOTTAB") != "": lobby.loot_tab = OS.get_environment("GB_LOOTTAB")
			if OS.get_environment("GB_SKIN") != "":
				var SK2 = profile.skin(OS.get_environment("GB_SKIN")); profile.o.pilot = str(SK2.pilot); profile.o.wear.pilot[str(SK2.pilot)] = SK2.id
				if not profile.o.skins.has(SK2.id): profile.o.skins.append(SK2.id)
		lobby.refresh()
		if OS.get_environment("GB_DAWNTAB") != "": lobby.dawn_tab = OS.get_environment("GB_DAWNTAB")
		if OS.get_environment("GB_TAB") != "" and OS.get_environment("GB_TAB") != "home": lobby.open_sub(OS.get_environment("GB_TAB"))
		if OS.get_environment("GB_TEGAKI") != "": lobby.play_tegaki(data.dawn.story[int(OS.get_environment("GB_TEGAKI"))])
		if OS.get_environment("GB_SHOT_OPEN") != "": profile.o.gems += 260; lobby.open_anim("airdrop", profile.buy_chest("airdrop"))
		if int(profile.o.tut) == 0: lobby.welcome()
		elif OS.get_environment("GB_SHOT") == "" or OS.get_environment("GB_NEWS") != "":   # 新版本第一次进大厅：更新公告；新赛季：开场动画（盖在公告上面）
			if str(profile.o.get("newsSeen", "")) != str(lobby.news_latest().get("ver", "")) or OS.get_environment("GB_NEWS") != "": lobby.news_popup()
			if int(profile.o.get("seenSeason", 0)) != int(data.econ.pass.get("sid", 2)) and OS.get_environment("GB_SHOT") == "": lobby.season_intro()
		if OS.get_environment("GB_INTRO") != "": lobby.season_intro()
		var pop := OS.get_environment("GB_POPUP")   # 截图用
		if OS.get_environment("GB_FLOW") != "": queue_match(OS.get_environment("GB_FLOW"))
		if OS.get_environment("GB_TUT") != "": start_tutorial()
		if OS.get_environment("GB_BIGMAP") != "": hud.big_map = true
		if OS.get_environment("GB_PAUSE") != "": get_tree().create_timer(float(OS.get_environment("GB_PAUSE"))).timeout.connect(func(): toggle_pause())
		if pop == "account": lobby.account_popup()
		elif pop in ["avatar", "frame", "title", "show_style"]: lobby.call(pop + "_popup")
		elif pop != "": lobby.account_form(pop)
		if OS.get_environment("GB_PV_RENDER") != "" or OS.get_environment("GB_PV") != "": play_dawn_pv()
		elif OS.get_environment("GB_SHOT") == "": splash(layer)
		if OS.get_environment("GB_SHOT") == "": check_update()
	if OS.get_environment("GB_LAN") != "": lan_test_setup(); return
	if autoplay:
		var gm := OS.get_environment("GB_MAP")
		sel_map = int(gm) if gm != "" else (-1 if sel_mode != "turf" else 0)
		start_match(OS.get_environment("GB_PILOT") if OS.get_environment("GB_PILOT") != "" else "blaze", OS.get_environment("GB_MECH") if OS.get_environment("GB_MECH") != "" else "blaster")


# 账号：游客用 user://profile.json；登录 / 导入的账号各有自己的存档（见 account.gd）
func load_profile() -> Profile:
	var p := Profile.new(data, accounts.profile_path(accounts.current()))
	if accounts.current() != "" and str(p.o.name) != accounts.current_name(): p.o.name = accounts.current_name(); p.save()
	return p

func switch_account() -> void:
	profile = load_profile()
	lobby.P = profile; lobby.sub = ""; lobby.view_mech = profile.o.weapon; lobby.view_pilot = ""
	lobby.close_popup(); lobby.refresh()
	if int(profile.o.tut) == 0: lobby.welcome()

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
	env.tonemap_mode = Environment.TONE_MAPPER_FILMIC; env.tonemap_exposure = 0.92; env.tonemap_white = 3.2
	env.glow_enabled = true; env.glow_intensity = 0.32; env.glow_bloom = 0.0; env.glow_hdr_threshold = 1.35; env.glow_strength = 0.8
	env.glow_blend_mode = Environment.GLOW_BLEND_MODE_SCREEN
	if RenderingServer.get_rendering_device() != null:   # Forward+ / Mobile 才有 SSAO
		env.ssao_enabled = true; env.ssao_radius = 1.6; env.ssao_intensity = 1.6
		env.ssil_enabled = false
	env.fog_enabled = true; env.fog_density = 0.0035; env.fog_light_energy = 0.8
	env.adjustment_enabled = true; env.adjustment_saturation = 1.02; env.adjustment_contrast = 1.04
	var we := WorldEnvironment.new(); we.environment = env; add_child(we)
	sun = DirectionalLight3D.new()
	sun.rotation_degrees = Vector3(-55, 32, 0)
	sun.light_energy = 1.1; sun.light_color = Color("#fff3e6")
	sun.shadow_enabled = true; sun.shadow_blur = 1.5
	sun.directional_shadow_mode = DirectionalLight3D.SHADOW_ORTHOGONAL
	sun.directional_shadow_max_distance = 70
	add_child(sun)
	fill_light = DirectionalLight3D.new(); fill_light.rotation_degrees = Vector3(-35, 210, 0); fill_light.light_energy = 0.35; fill_light.light_color = Color("#8fb4ff"); add_child(fill_light)
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
# 地图数据统一解成数组（普通地图是字符串，超大地图是压缩过的 base64）
var map_top := PackedInt32Array()
var map_solid := PackedByteArray()
var map_bush := PackedByteArray()

func map_def(idx: int) -> Dictionary:
	return data.lootMap if idx == LOOT_MAP else data.maps[idx]

func decode_map(m: Dictionary) -> void:
	var n := int(m.gw) * int(m.gh)
	map_solid.resize(n); map_bush.resize(n)
	if m.has("topB64"):
		map_top = PackedInt32Array(Array(Marshalls.base64_to_raw(m.topB64)))
		var sb := Marshalls.base64_to_raw(m.solidBits); var bb := Marshalls.base64_to_raw(m.bushBits)
		for i in n:
			map_solid[i] = (sb[i >> 3] >> (i & 7)) & 1; map_bush[i] = (bb[i >> 3] >> (i & 7)) & 1
	else:
		map_top = PackedInt32Array(m.top)
		var ss: String = m.solid; var bs: String = m.bush
		for i in n:
			map_solid[i] = 1 if ss.unicode_at(i) == 49 else 0; map_bush[i] = 1 if bs.unicode_at(i) == 49 else 0

func base_color(gw: int, i: int, pal: Array) -> Color:
	var cx := i % gw; var cy := i / gw
	var t := float(map_top[i])
	if map_solid[i] == 1: return Color(pal[4]).lightened(0.22)
	if map_bush[i] == 1: return Color("#1f4a32")
	var c: Color = pal[4]
	if t >= 1: c = c.lightened(0.1 if t < 60 else (0.2 if t < 160 else 0.28))
	if (cx / 4 + cy / 4) % 2 == 0: c = c.lightened(0.03)
	return c

func biome_id(idx: int) -> String:
	return str(map_def(idx).get("biome", "city" if idx == LOOT_MAP else "plaza"))

# 3.1：每张地图自己的灯光（太阳角度 / 颜色、天空、雾），泛光压低
func apply_light(B: Dictionary) -> void:
	var sm: ProceduralSkyMaterial = env.sky.sky_material
	var top := Biomes.col(B.sky[0]); var hor := Biomes.col(B.sky[1])
	sm.sky_top_color = top; sm.sky_horizon_color = hor; sm.ground_horizon_color = hor.darkened(0.1); sm.ground_bottom_color = top.darkened(0.5)
	sm.sky_curve = 0.18; sm.sun_angle_max = 4; sm.sun_curve = 0.3
	if B.get("dark", false):
		env.background_mode = Environment.BG_COLOR; env.background_color = top
		env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR; env.ambient_light_color = Color("#b8c4d8")
	else:
		env.background_mode = Environment.BG_SKY; env.ambient_light_source = Environment.AMBIENT_SOURCE_SKY
	env.ambient_light_energy = float(B.amb) * 0.62
	env.fog_light_color = Biomes.col(B.fog[0]); env.fog_density = float(B.fog[1])
	sun.light_color = Biomes.col(B.sun[0]); sun.light_energy = float(B.sun[1]) * 0.9
	sun.rotation_degrees = Vector3(float(B.sun[2]), float(B.sun[3]), 0)
	if fill_light != null: fill_light.light_color = Biomes.col(B.fill[0]); fill_light.light_energy = float(B.fill[1])

func build_map(idx: int) -> void:
	var t_build := Time.get_ticks_msec()
	cur_map = idx
	if map_root != null: map_root.queue_free()
	map_root = Node3D.new(); add_child(map_root)
	weather = null
	var m: Dictionary = map_def(idx)
	decode_map(m)
	var bid := biome_id(idx); var B := Biomes.of(bid)
	apply_light(B)
	var gw := int(m.gw); var gh := int(m.gh)
	var T := map_top
	# 墙的连通块：细长的墙（篱笆 / 隔板）用另一种材质；墙顶的摆设也按块放（超大地图跳过）
	var comp := PackedInt32Array(); comp.resize(gw * gh); comp.fill(-1)
	var comps: Array = []
	var thin := PackedByteArray(); thin.resize(gw * gh)
	if gw * gh < 50000:
		for i in gw * gh:
			if map_solid[i] != 1 or comp[i] >= 0: continue
			var id := comps.size(); var st: Array = [i]; comp[i] = id
			var x0 := gw; var y0 := gh; var x1 := 0; var y1 := 0; var cells: Array = []
			while not st.is_empty():
				var j: int = st.pop_back(); cells.append(j)
				var jx := j % gw; var jy := j / gw
				x0 = mini(x0, jx); x1 = maxi(x1, jx); y0 = mini(y0, jy); y1 = maxi(y1, jy)
				for d in [1, -1, gw, -gw]:
					var k: int = j + d
					if k < 0 or k >= gw * gh or (d == 1 and k % gw == 0) or (d == -1 and j % gw == 0): continue
					if map_solid[k] == 1 and comp[k] < 0: comp[k] = id; st.append(k)
			var ww := x1 - x0 + 1; var hh := y1 - y0 + 1
			var is_thin := mini(ww, hh) <= 2 and maxi(ww, hh) >= 5
			if is_thin:
				for j in cells: thin[j] = 1
			comps.append({"x0": x0, "y0": y0, "x1": x1, "y1": y1, "n": cells.size(), "thin": is_thin})
	# 底色（alpha 是材质编号）+ 小地图
	base_cols.resize(gw * gh)
	var bytes := PackedByteArray(); bytes.resize(gw * gh * 4)
	var mbytes := PackedByteArray(); mbytes.resize(gw * gh * 4)
	var mg := Biomes.col(B.mini)
	var mats := [0, 85, 170, 255]
	for i in gw * gh:
		var t := T[i]
		var mt := 3 if map_solid[i] == 1 else (0 if t == 0 else (1 if t % 40 == 0 or t == 210 else 2))
		var c := Biomes.cell_color(B, mt, i % gw, i / gw, map_bush[i] == 1, float(t))
		bytes[i * 4] = c.r8; bytes[i * 4 + 1] = c.g8; bytes[i * 4 + 2] = c.b8; bytes[i * 4 + 3] = mats[mt]
		var mc := mg
		if mt == 3: mc = mg.lerp(Color(0.92, 0.92, 0.96), 0.55)
		elif map_bush[i] == 1: mc = Color("#2f6a40")
		elif mt > 0: mc = mg.lightened(0.12 if t < 60 else 0.22)
		base_cols[i] = mc
		mbytes[i * 4] = mc.r8; mbytes[i * 4 + 1] = mc.g8; mbytes[i * 4 + 2] = mc.b8; mbytes[i * 4 + 3] = 255
	var base_img := Image.create_from_data(gw, gh, false, Image.FORMAT_RGBA8, bytes)
	mini_img = Image.create_from_data(gw, gh, false, Image.FORMAT_RGBA8, mbytes)
	base_img_saved = Image.create_from_data(gw, gh, false, Image.FORMAT_RGBA8, mbytes)
	var zero := PackedByteArray(); zero.resize(gw * gh * 4)
	paint_img = Image.create_from_data(gw, gh, false, Image.FORMAT_RGBA8, zero)
	paint_tex = ImageTexture.create_from_image(paint_img); base_tex = ImageTexture.create_from_image(base_img); mini_tex = ImageTexture.create_from_image(mini_img)
	# 地形网格：同一行连续同高的格子合成一块（顶面）；侧面也按行 / 列合并，分成「高台侧面 / 大墙 / 细墙」三种材质
	var st_top := SurfaceTool.new(); st_top.begin(Mesh.PRIMITIVE_TRIANGLES)
	var sts := [SurfaceTool.new(), SurfaceTool.new(), SurfaceTool.new()]
	for s2 in sts: s2.begin(Mesh.PRIMITIVE_TRIANGLES)
	# 3.1：墙在画面上矮一点（碰撞不变），不会像一块块石碑挡住后面的人
	var wall_h := float(B.get("wall_h", 120))
	var TV := PackedInt32Array(T)
	for i in gw * gh:
		if map_solid[i] == 1: TV[i] = int(wall_h)
	var hgt := func(cx: int, cy: int) -> float:
		if cx < 0 or cy < 0 or cx >= gw or cy >= gh: return -0.5
		return float(TV[cy * gw + cx]) * K
	var kind := func(cx: int, cy: int) -> int:
		var i := cy * gw + cx
		if map_solid[i] != 1: return 0
		return 2 if thin[i] == 1 else 1
	var quad := func(st: SurfaceTool, v: Array, n: Vector3, cols: Array) -> void:
		for k in [0, 1, 2, 0, 2, 3]:
			st.set_normal(n)
			if cols.size() > 0: st.set_color(cols[k])
			st.set_uv(Vector2(v[k].x / gw, v[k].z / gh)); st.add_vertex(v[k])
	var lo := Color(0.62, 0.62, 0.66, 0.0); var hi := Color(1, 1, 1, 1)
	for cy in gh:
		var x0 := 0
		while x0 < gw:
			var h0: float = TV[cy * gw + x0]
			var x1 := x0 + 1
			while x1 < gw and TV[cy * gw + x1] == h0: x1 += 1
			var hh: float = h0 * K
			quad.call(st_top, [Vector3(x0, hh, cy), Vector3(x1, hh, cy), Vector3(x1, hh, cy + 1), Vector3(x0, hh, cy + 1)], Vector3.UP, [])
			x0 = x1
	for dir in [Vector2i(0, 1), Vector2i(0, -1)]:
		for cy in gh:
			var cx := 0
			while cx < gw:
				var h: float = hgt.call(cx, cy); var nh: float = hgt.call(cx, cy + dir.y)
				if nh >= h - 0.01: cx += 1; continue
				var kd: int = kind.call(cx, cy)
				var e := cx + 1
				while e < gw and is_equal_approx(hgt.call(e, cy), h) and is_equal_approx(hgt.call(e, cy + dir.y), nh) and kind.call(e, cy) == kd: e += 1
				var zz: float = cy + (1 if dir.y == 1 else 0)
				var v := [Vector3(cx, nh, zz), Vector3(e, nh, zz), Vector3(e, h, zz), Vector3(cx, h, zz)] if dir.y == -1 else [Vector3(e, nh, zz), Vector3(cx, nh, zz), Vector3(cx, h, zz), Vector3(e, h, zz)]
				quad.call(sts[kd], v, Vector3(0, 0, dir.y), [lo, lo, hi, hi])
				cx = e
	for dir in [Vector2i(1, 0), Vector2i(-1, 0)]:
		for cx in gw:
			var cy := 0
			while cy < gh:
				var h: float = hgt.call(cx, cy); var nh: float = hgt.call(cx + dir.x, cy)
				if nh >= h - 0.01: cy += 1; continue
				var kd: int = kind.call(cx, cy)
				var e := cy + 1
				while e < gh and is_equal_approx(hgt.call(cx, e), h) and is_equal_approx(hgt.call(cx + dir.x, e), nh) and kind.call(cx, e) == kd: e += 1
				var xx: float = cx + (1 if dir.x == 1 else 0)
				var v := [Vector3(xx, nh, e), Vector3(xx, nh, cy), Vector3(xx, h, cy), Vector3(xx, h, e)] if dir.x == -1 else [Vector3(xx, nh, cy), Vector3(xx, nh, e), Vector3(xx, h, e), Vector3(xx, h, cy)]
				quad.call(sts[kd], v, Vector3(dir.x, 0, 0), [lo, lo, hi, hi])
				cy = e
	var mesh := ArrayMesh.new()
	st_top.commit(mesh)
	turf_mat = ShaderMaterial.new(); turf_mat.shader = load("res://shaders/turf.gdshader")
	turf_mat.set_shader_parameter("paint_tex", paint_tex); turf_mat.set_shader_parameter("base_tex", base_tex); turf_mat.set_shader_parameter("grid_size", Vector2(gw, gh))
	turf_mat.set_shader_parameter("team_a", team_col[1]); turf_mat.set_shader_parameter("team_b", team_col[2])
	var pt: Array = B.pat
	turf_mat.set_shader_parameter("pat", Vector4i(int(pt[0]), int(pt[1]), int(pt[2]), int(pt[3])))
	turf_mat.set_shader_parameter("detail", Color(Biomes.col(B.detail[0]), float(B.detail[1])))
	turf_mat.set_shader_parameter("glow_k", float(B.get("glow", 0.0))); turf_mat.set_shader_parameter("gloss", float(B.get("gloss", 0.0)))
	mesh.surface_set_material(0, turf_mat)
	var side_mats := [Biomes.wall_mat(B.side, 0.12), Biomes.wall_mat(B.wall, float(B.get("cap_w", 0.06))), Biomes.wall_mat(B.thin, float(B.get("cap_w", 0.06)))]
	var mi := MeshInstance3D.new(); mi.mesh = mesh; map_root.add_child(mi)
	for k in 3:
		var sm2 := ArrayMesh.new(); sts[k].commit(sm2)
		if sm2.get_surface_count() == 0: continue
		sm2.surface_set_material(0, side_mats[k])
		var smi := MeshInstance3D.new(); smi.mesh = sm2; map_root.add_child(smi)
	if OS.get_environment("GB_SHOT") != "": print("地图 %s 建好了：%d ms" % [m.name, Time.get_ticks_msec() - t_build])
	# 电梯（超大地图）
	for k in m.get("lifts", {}):
		var i := int(k)
		var lm := MeshInstance3D.new(); var lb := BoxMesh.new(); lb.size = Vector3(0.95, 0.15, 0.95); lb.material = Models.glow(Color("#7af0ff"), 1.3); lm.mesh = lb
		lm.position = Vector3(i % gw + 0.5, float(T[i]) * K + 0.08, i / gw + 0.5); map_root.add_child(lm)
	# 弹跳板：黄色圆盘 + 一圈深色底座
	for k in m.pads:
		var i := int(k)
		var p0 := Vector3(i % gw + 0.5, float(map_top[i]) * K, i / gw + 0.5)
		Biomes.part(map_root, Models.mesh("cyl", 0.56, 0.1), p0 + Vector3(0, 0.05, 0), Models.toon(Color("#2a2a32"), 0.0, 0.3, false))
		Biomes.part(map_root, Models.mesh("cyl", 0.44, 0.12), p0 + Vector3(0, 0.1, 0), Models.glow(Color("#ffd23f"), 1.15))
	var wx: Node3D = Biomes.decorate(self, map_root, bid, m, TV, map_solid, map_bush, comps, idx)
	if wx != null: weather = wx; map_root.add_child(wx)

# ---------------- 菜单 ----------------
func role_name(id: String) -> String:
	var c = data.classes.get(id)
	if c == null: return ""
	return "%s • %s" % [data.roles[c[0]].name, data.tags.get(c[1], "")]

# 结算评级（网页版 1.9）：表现分 = 击毁 ×100 + 涂地 ×0.2 + 目标 ×150 − 倒下 ×40；每队 MVP，其余按占最高分的比例给钻石 / 黄金 / 白银 / 青铜标
func badges_of() -> Dictionary:
	var ps: Array = sim.players.filter(func(q): return not q.npc and not q.spirit)
	var top := 1.0
	for q in ps: top = maxf(top, Profile.perf(q))
	var mv := {}
	var teams: Array = []
	if sim.winner > 0 and sim.teams == 2:
		for q in ps: if not teams.has(q.team): teams.append(q.team)
	elif sim.winner > 0: teams = [sim.winner]
	for t in teams:
		var m = Profile.mvp_of(sim, t)
		if m != null: mv[m.id] = true
	var out := {}
	for q in ps:
		var f := Profile.perf(q) / top
		out[q.id] = 4 if mv.has(q.id) else (3 if f >= 0.75 else (2 if f >= 0.5 else (1 if f >= 0.25 else 0)))
	return out

func badge_chip(n: int, lose := false, size := 14) -> GCard:
	var B: Dictionary = data.badges[n]
	return UIKit.chip("败方MVP" if n == 4 and lose else str(B.name), Color(str(B.c)), size)

# 3.1 维护：对局结束先跳「你胜利了 / 你失败了」大字（约 2.4 秒），再进结算
func end_splash() -> void:
	close_pause()
	if cine != null and is_instance_valid(cine): cine.queue_free()
	for c in result_ui.get_children(): c.queue_free()
	var win := int(sim.result.get("winner", sim.winner))
	var won: bool = win == me.team
	var head := "你胜利了！" if won else ("平局" if win == 0 else "你失败了")
	var en := "VICTORY" if won else ("DRAW" if win == 0 else "DEFEAT")
	if sim.mode == "loot": won = me.extracted; head = "撤离成功！" if won else "撤离失败"; en = "EXTRACTED" if won else "FAILED"
	var col := Color("#ffd23f") if won else (Color("#c9c5e6") if win == 0 and sim.mode != "loot" else Color("#ff4a5a"))
	var sp := EndSplash.new(); sp.setup(head, en, col, won, font)
	result_ui.add_child(sp)
	result_ui.visible = true
	sfx.play("win" if won else "lose")
	if won: music.play("lobby")
	get_tree().create_timer(2.4).timeout.connect(func():
		if is_instance_valid(sp): sp.queue_free()
		if state == "result": show_result())

func show_result() -> void:
	close_pause()
	for c in result_ui.get_children(): c.queue_free()
	var s := get_viewport().get_visible_rect().size
	var bg := ColorRect.new(); bg.color = Color(0.03, 0.02, 0.08, 0.78); bg.set_anchors_preset(Control.PRESET_FULL_RECT); result_ui.add_child(bg)
	var r: Dictionary = sim.result
	var win := int(r.winner)
	var md := sim.mode
	var won: bool = win == me.team
	var head := "你胜利了！" if won else ("平局" if win == 0 else "你失败了")
	var sub := ""
	var pa: float = 100.0 * float(r.get("a", 0)) / max(1.0, float(r.get("tot", 1))); var pb: float = 100.0 * float(r.get("b", 0)) / max(1.0, float(r.get("tot", 1)))
	sub = "我方 %.1f%%   对方 %.1f%%" % [pa, pb]
	if md in ["escape4", "escape8"]: sub = "第 1 名！" if won else "我方出局了"
	elif md == "raid": sub = "讨伐成功！百目被打倒了" if win == 1 else "时间到了，百目还活着"
	elif md == "loot":
		head = "撤离成功！" if me.extracted else "撤离失败"; won = me.extracted
		var kv := sim.loot_value(sim.obj.banked.get(me.id, []) if me.extracted else sim.inv_keys(me.safe))
		sub = ("带出物资价值 %d" % kv) if me.extracted else ("只保住了安全箱里的物资（价值 %d）" % kv)
	elif md == "elim": sub = "局数  %d : %d" % [sim.obj.wins[1], sim.obj.wins[2]]
	elif md == "zone": sub = "剩余倒计时  我方 %d   对方 %d" % [int(sim.obj.count[1]), int(sim.obj.count[2])]
	elif md != "turf": sub = "比分  %d : %d" % [sim.obj.score[1], sim.obj.score[2]]
	var bdg := badges_of()
	# 顶部横幅
	var ban := UIKit.card(Color("#ffcf4d") if won else (Color("#6a6a8a") if win == 0 else Color("#5a3a8a")), Color("#c56a10") if won else Color("#1e1a3a"), Color.WHITE, 18)
	ban.skew = -0.12; ban.position = Vector2(s.x / 2 - 300, 24); ban.size = Vector2(600, 96); ban.custom_minimum_size = ban.size; result_ui.add_child(ban)
	var bv := VBoxContainer.new(); bv.add_theme_constant_override("separation", 0); ban.add_child(bv)
	var hl := UIKit.label(head, 52, Color("#2a1a08") if won else Color.WHITE, 0 if won else 6); hl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER; bv.add_child(hl)
	var sl := UIKit.label(sub, 18, Color("#3a2408") if won else Color("#e6e2fa")); sl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER; bv.add_child(sl)
	ban.scale = Vector2(0.6, 0.6); ban.pivot_offset = ban.size / 2
	var tw := ban.create_tween(); tw.tween_property(ban, "scale", Vector2.ONE, 0.35).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	# 左边：我的卡片 + 奖励
	var lc := UIKit.dark_card(); lc.position = Vector2(24, 140); lc.size = Vector2(360, s.y - 230); lc.custom_minimum_size = lc.size; result_ui.add_child(lc)
	var lv := VBoxContainer.new(); lv.add_theme_constant_override("separation", 8); lc.add_child(lv)
	var av := UIKit.avatar(profile.avatar_path(), profile.frame_key(), 110, team_col[me.team]); av.size_flags_horizontal = Control.SIZE_SHRINK_CENTER; lv.add_child(av)
	var nl := UIKit.label(me.name, 22, Color.WHITE, 4); nl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER; lv.add_child(nl)
	var my_b: int = int(bdg.get(me.id, 0))
	var bc := badge_chip(my_b, not won and win != 0, 20); bc.size_flags_horizontal = Control.SIZE_SHRINK_CENTER; lv.add_child(bc)
	var stl := UIKit.label("击毁 %d   倒下 %d   涂地 %d" % [me.kills, me.deaths, me.painted], 15, Color("#c8c4e8")); stl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER; lv.add_child(stl)
	if not autoplay:   # 对战奖励：经验、奖杯、金币、首胜宝石、任务
		var rw := profile.match_reward(sim, me)
		rw.deaths = me.deaths; rw.badge = my_b
		rw.dawn = me.pilot in data.dawn.pilots or me.weapon in data.dawn.mechs
		rw.dawnmap = cur_map >= 0 and cur_map < data.maps.size() and str(data.maps[cur_map].get("biome", "")) == "dawn"
		var res := profile.apply_match(rw)
		var g := GridContainer.new(); g.columns = 2; g.add_theme_constant_override("h_separation", 8); g.add_theme_constant_override("v_separation", 6); g.size_flags_horizontal = Control.SIZE_SHRINK_CENTER; lv.add_child(g)
		g.add_child(UIKit.pill("star", "经验 +%d" % rw.xp, Color("#7af0ff"))); g.add_child(UIKit.pill("trophy", "奖杯 %+d" % rw.trophies, Color("#ffcf4d")))
		for it in res.items:
			if data.econ.cur.has(it.k): g.add_child(UIKit.pill(str(it.k), "+%d" % int(it.n), Color("#ffe14d")))
			else: g.add_child(UIKit.pill("gift", lobby.item_text(it)[0], Color("#ff9ad6")))
		var extra: Array = []
		if res.lv_ups > 0: extra.append("账号升到 %d 级！天赋点 +%d" % [profile.level(), res.lv_ups])
		extra.append("通行证经验 +%d" % res.pass_xp + ("（升到 %d 级）" % res.pass_after if res.pass_after > res.pass_before else ""))
		if not res.rank.is_empty():
			var T: Dictionary = data.econ.rank.tiers[res.rank.t1]
			extra.append("排位 %+d 分 → %s %d 分" % [res.rank.d, T.name, res.rank.rp1])
		if not res.quests.is_empty(): extra.append("完成任务：" + "、".join(res.quests))
		for e in extra:
			var el := UIKit.label(e, 14, Color("#6dff8a") if e.begins_with("完成") else Color("#ffe14d")); el.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART; el.custom_minimum_size.x = 330; el.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER; lv.add_child(el)
	# 右边：全员表现
	var rc := UIKit.dark_card(); rc.position = Vector2(400, 140); rc.size = Vector2(s.x - 424, s.y - 230); rc.custom_minimum_size = rc.size; result_ui.add_child(rc)
	var sc := ScrollContainer.new(); sc.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED; rc.add_child(sc)
	var rv := VBoxContainer.new(); rv.add_theme_constant_override("separation", 4); rv.size_flags_horizontal = Control.SIZE_EXPAND_FILL; sc.add_child(rv)
	var hdr := HBoxContainer.new(); rv.add_child(hdr)
	for h in [["", 44], ["玩家", 190], ["驾驶员 / 机体", 190], ["击毁", 60], ["倒下", 60], ["涂地", 70], ["评级", 100]]:
		var l := UIKit.label(h[0], 14, Color("#9a96b8")); l.custom_minimum_size.x = h[1]; hdr.add_child(l)
	var ps: Array = sim.players.filter(func(q): return not q.npc and not q.spirit)
	ps.sort_custom(func(a, b): return (a.team == me.team and b.team != me.team) or (a.team == b.team and Profile.perf(a) > Profile.perf(b)) or (a.team != me.team and b.team != me.team and a.team < b.team))
	for q in ps:
		var row := UIKit.card(team_col[q.team].darkened(0.6) if q != me else Color("#5a2a8a"), Color("#120e26"), team_col[q.team] if q != me else Color("#ff9ad6"), 10)
		row.pad = Vector4(6, 2, 6, 2); row.shadow = 2; rv.add_child(row)
		var h := HBoxContainer.new(); h.add_theme_constant_override("separation", 0); row.add_child(h)
		var a: UIKit.Avatar = UIKit.avatar(profile.avatar_path(), profile.frame_key(), 38, team_col[q.team]) if q == me else UIKit.avatar(profile.looks_avatar(q.looks, q.pilot), profile.looks_frame(q.looks), 38, team_col[q.team])
		var aw := Control.new(); aw.custom_minimum_size = Vector2(44, 40); aw.add_child(a); h.add_child(aw)
		for cell in [[q.name, 190, Color("#ffe14d") if q == me else Color.WHITE], ["%s / %s" % [data.pilots[q.pilot].name, data.mechs[q.weapon].short if data.mechs[q.weapon].has("short") else data.mechs[q.weapon].name], 190, Color("#c8c4e8")],
				[str(q.kills), 60, Color.WHITE], [str(q.deaths), 60, Color.WHITE], [str(q.painted), 70, Color.WHITE]]:
			var l := UIKit.label(cell[0], 15, cell[2]); l.custom_minimum_size.x = cell[1]; l.clip_text = true; h.add_child(l)
		h.add_child(badge_chip(int(bdg.get(q.id, 0)), q.team != win and win != 0 and sim.teams == 2, 12))
	# 按钮
	var hb := HBoxContainer.new(); hb.alignment = BoxContainer.ALIGNMENT_CENTER; hb.add_theme_constant_override("separation", 20); hb.position = Vector2(0, s.y - 76); hb.size = Vector2(s.x, 60); result_ui.add_child(hb)
	var again := UIKit.gold_button("再来一局", 24); again.custom_minimum_size = Vector2(240, 60); hb.add_child(again)
	again.pressed.connect(func():
		sfx.play("click"); result_ui.visible = false
		if autoplay: start_match(sel_pilot, sel_mech)
		else: back_to_lobby(); queue_match("ranked" if sim.ranked else ("loot" if sim.loot else "normal")))
	var back := UIKit.flat_button("返回大厅", 20); back.custom_minimum_size = Vector2(220, 60); hb.add_child(back)
	back.pressed.connect(func(): sfx.play("click"); result_ui.visible = false; back_to_lobby())
	result_ui.visible = true
	sfx.play("win" if won else "lose")

# ---------------- 开局 ----------------
func start_match(pilot: String, mech: String) -> void:
	sel_pilot = pilot; sel_mech = mech
	var is_loot := sel_mode == "loot"
	var midx: int = LOOT_MAP if is_loot else sel_map
	if midx < 0:   # 随机地图：逃亡圈默认「废墟逃亡区」，乐园模式默认「欢乐乐园」
		midx = randi() % data.maps.size()
		for i in data.maps.size():
			if (sel_mode.begins_with("escape") and data.maps[i].name == "废墟逃亡区") or (sel_mode == "park" and data.maps[i].park): midx = i
	if midx != cur_map: build_map(midx)
	var dur := float(OS.get_environment("GB_DURATION")) if OS.get_environment("GB_DURATION") != "" else 180.0
	match_seed = randi() % 1000000 + 1
	sim = Sim.new(data, max(0, midx) if not is_loot else 0, match_seed, dur, sel_mode, {"risk": loot_risk})
	sim.ranked = ranked_on
	var lay := sim.team_layout()
	var pw: Dictionary = {"lv": 7, "bt": 1} if autoplay else profile.power(pilot)
	me = sim.add_player(1, "你" if autoplay else profile.display_name(), lay[0], pilot, mech, false, pw)
	if not autoplay: me.looks = profile.my_looks()
	var blv: int = int(pw.lv)   # AI 强度跟着玩家等级（原版：人类玩家的平均等级）
	var bot_pw := {"lv": blv, "bt": 2 if blv >= 9 else (1 if blv >= 5 else 0)}
	if ranked_on: bot_pw = profile.rank_bot_power()
	var pool_p: Array = data.pilotOrder.duplicate(); pool_p.erase(pilot); pool_p.shuffle()
	var pool_m: Array = data.order.duplicate(); pool_m.shuffle()
	if ranked_on:   # 被禁用的驾驶员 / 机体 AI 也不能用
		for b in ranked_bans.get("pilots", []): pool_p.erase(b)
		for b in ranked_bans.get("mechs", []): pool_m.erase(b)
	var pers: Array = Bots.assign(lay.slice(1), profile.rank_tier(int(profile.o.rank.rp)) if ranked_on else -1, {1: 1}, blv) if not autoplay else []
	var names := BOT_NAMES.duplicate(); names.shuffle()
	var remote: Array = net.room.players.filter(func(q): return int(q.peer) != 1) if net.role == "host" else []
	peer_ids = {}
	for i in range(1, lay.size()):
		if i - 1 < remote.size():   # 局域网的真人玩家
			var rp: Dictionary = remote[i - 1]
			var q := sim.add_player(i + 1, str(rp.name), lay[i], str(rp.pilot), str(rp.weapon), false, rp.get("power", {}))
			peer_ids[int(rp.peer)] = q.id
			if is_loot: q.safe = {"w": 2, "h": 2, "items": []}
			continue
		var pp: Array = prep.get("players", [])
		if i < pp.size():   # 匹配 / 选人阶段已经定好的对手和队友
			var e: Dictionary = pp[i]
			var bp := {"lv": clampi(int(e.lv), 1, 11), "bt": clampi(int(e.bt), 0, 2)}
			var q2 := sim.add_player(i + 1, str(e.name), lay[i], str(e.pilot), str(e.mech), true, bp)
			q2.persona = str(e.persona); q2.pz = Bots.persona(q2.persona); q2.looks = e.get("looks", {})
			continue
		var qb := sim.add_player(i + 1, names[(i - 1) % names.size()] + ("" if i <= names.size() else str(i)), lay[i], pool_p[(i - 1) % pool_p.size()], pool_m[(i - 1) % pool_m.size()], true, bot_pw)
		if i - 1 < pers.size(): qb.persona = str(pers[i - 1]); qb.pz = Bots.persona(qb.persona)
	spectate_id = 0
	if is_loot:   # 带进场的装备、安全箱大小；守卫和 Boss 小队
		var sd: Array = data.loot.safe[clampi(int(profile.o.safeLv), 1, 3)] if not autoplay else [2, 2]
		me.safe = {"w": int(sd[0]), "h": int(sd[1]), "items": []}
		if loot_risk == "high" and not autoplay:
			for gk in profile.o.gearOn:
				if gk == "armor": me.max_hp = round(me.max_hp * 1.25); me.hp = me.max_hp
				elif gk in ["pack", "bigpack"]: var bd: Array = data.loot.bags[gk]; me.inv = {"w": int(bd[0]), "h": int(bd[1]), "items": []}
				elif gk == "kit": me.kit = 1
		for q in sim.players:
			if q.bot and loot_risk == "high" and randf() < 0.6: var bd2: Array = data.loot.bags.pack; q.inv = {"w": int(bd2[0]), "h": int(bd2[1]), "items": []}
		sim.setup_loot_guards(blv)
		for q in sim.players:
			if not mech_nodes.has(q.id): pass
		bag_open = false
	botchat = BotChat.new(self, sim) if net.role != "client" else null
	chat_clear()
	begin_view()
	if net.role == "host":
		var roster: Array = []
		net.cont_sig.clear()
		for q in sim.players:
			if not q.npc or sim.loot: roster.append([q.id, q.name, q.team, q.pilot, q.weapon, {"lv": q.lv, "bt": q.bt, "tal": q.tal.keys()}, q.bot, q.npc, q.loot_boss, q.max_hp])
		net.broadcast_start({"mode": sel_mode, "map": midx, "seed": match_seed, "dur": dur, "roster": roster, "peers": peer_ids, "ranked": ranked_on, "bans": ranked_bans})
		if net.room.get("queue", false): net.room.queue = false; net.sync_room()

# 对局画面初始化（单机 / 房主 / 客户端共用）
func begin_view() -> void:
	for id in mech_nodes: mech_nodes[id].root.queue_free()
	mech_nodes.clear()
	DawnFx.clear(self)
	for id in helper_nodes: helper_nodes[id].queue_free()
	helper_nodes.clear()
	hud.reset_kills()
	for p in sim.players: mech_nodes[p.id] = make_mech_node(p)
	paint_img.fill(Color(0, 0, 0, 0))
	mini_img.copy_from(base_img_saved)
	paint_tex.update(paint_img); mini_tex.update(mini_img)
	for f in fx_list: f.node.queue_free()
	fx_list.clear()
	mode_view.setup(sim, team_col)
	music.play("battle")
	showroom.visible = false
	menu.visible = false
	state = "play"
	acc = 0.0

# 测试用（GB_DAWN=finale / guard / disc / tether）：把一个敌人拉到面前，触发联动机制，方便截图
var _dawn_done := false
var _kt := false
func dawn_test_tick() -> void:
	var kind := OS.get_environment("GB_DAWN")
	if sim.time < 3.0: return
	var foe: Sim.Mech = null
	for q in sim.players:
		if q.team != me.team and q.alive and not q.npc: foe = q; break
	if foe == null: return
	if not _dawn_done:
		_dawn_done = true
		foe.x = me.x + 200; foe.y = me.y; foe.z = me.z; foe.inv_t = 0
		me.inp.a = 0.0; me.inp.ad = 200.0
		if kind == "finale": me.linger = 5; me.sp = float(data.mechs[me.weapon].spNeed); me.inp.qq = int(me.inp.qq) + 1
		if kind == "night": me.sp = float(data.mechs[me.weapon].spNeed); me.inp.qq = int(me.inp.qq) + 1
	if kind in ["disc", "tether"]: me.inp.f = int(sim.time * 10) % 12 == 0
	if kind == "guard": me.inp.f = true

# 3.1：联动战斗影片（pv/dawn_pv.ogv 存在就直接播视频，否则实时播 3D 版）
func play_dawn_pv() -> void:
	var pv := DawnPV.new(); pv.setup(self)
	lobby.add_child(pv)

func make_mech_node(p: Sim.Mech) -> Dictionary:
	var col: Color = team_col[p.team]
	if p.boss: col = Color("#5a2a7a")
	elif p.spirit: col = Color("#9a7cff")
	var mine: bool = p.id == 1 and not autoplay and not p.npc
	var look: Dictionary = profile.pilot_look(p.pilot) if mine else profile.look_with(p.pilot, str(p.looks.get("pskin", "")))
	var n := Models.build_mech(p.weapon, data.mechs[p.weapon], col, look, profile.mech_paint() if mine else profile.paint_of(str(p.looks.get("paint", ""))))
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
	if OS.get_environment("GB_DAWN") != "" and sim != null and state == "play" and me != null: dawn_test_tick()
	if OS.get_environment("GB_KILLTEST") != "" and sim != null and state == "play" and sim.time > 2.0 and not _kt:   # 截图用：假装连杀两个
		_kt = true
		var foes: Array = sim.players.filter(func(q): return q.team != me.team)
		hud.kill_notice(["ko", foes[0].id, me.id], "ko"); hud.kill_notice(["wreck", foes[1].id, me.id], "wreck")
	if OS.get_environment("GB_ENDTEST") != "" and sim != null and state == "play" and sim.time > 0.3: sim.time_left = 0.0
	if OS.get_environment("GB_SHOT") != "" and (OS.get_environment("GB_SHOT_MENU") != "" or (sim != null and state != "menu")):   # 截图用
		shot_t += delta
		var sim_at := OS.get_environment("GB_SHOT_SIM")   # 按对局时间截图（机器慢的时候也准）
		if (sim_at == "" and shot_t >= float(OS.get_environment("GB_SHOT_AT") if OS.get_environment("GB_SHOT_AT") != "" else "8")) or (sim_at != "" and sim != null and sim.countdown <= 0 and sim.time >= float(sim_at)):
			get_viewport().get_texture().get_image().save_png(OS.get_environment("GB_SHOT"))
			print("截图：", OS.get_environment("GB_SHOT"), " FPS ", Engine.get_frames_per_second())
			get_tree().quit()
	if OS.get_environment("GB_LAN") != "": lan_test_tick(delta)
	var real_dt := delta
	if hitstop_until > 0 and Time.get_ticks_msec() >= hitstop_until: Engine.time_scale = 1.0; hitstop_until = 0
	if net_client_match and net.role != "client":   # 房主断开 / 自己退出
		net_client_match = false
		if state != "menu": back_to_lobby(); lobby.toast("联机已断开")
	if state == "play" and sim != null and net.role == "client":
		read_input()
		net_send_t -= delta
		if net_send_t <= 0: net_send_t = 1.0 / 30.0; net.send_input(me.inp.duplicate())
		if net_snap != null:
			for p in sim.players:
				var n: Dictionary = mech_nodes[p.id]
				n.prev = n.root.position; n.a_prev = n.a_cur
			Net.apply_snapshot(sim, net_snap); net_snap = null; net_snap_t = 0.0
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
		net_snap_t += delta
		update_visuals(clampf(net_snap_t / (2.0 / 30.0), 0, 1), real_dt)
		update_fx(real_dt); update_loot_ui(real_dt); hud.queue_redraw()
		return
	if state == "play" and sim != null and not tut.is_empty(): tut_tick()
	if state == "play" and sim != null: entrance_tick()
	if chat_ui != null: chat_tick()
	if OS.get_environment("GB_CHATTEST") != "" and state == "play" and sim != null and sim.time > 1.0 and not sim.has_meta("ct"):   # 测试用
		sim.set_meta("ct", true); chat_add(me, "你们是人机吗？", 0); botchat.react(me, "你们是人机吗？", 0, 0); botchat.react(me, "hi", 0, 0)
	if state == "play" and sim != null and paused and net.role == "":   # 单机暂停：模拟不走
		update_visuals(1.0, 0.0); hud.queue_redraw()
		return
	if state == "play" and sim != null:
		read_input()
		if net.role == "host":   # 其他真人的操作
			for peer in net.inputs:
				var q := player_by_id(int(peer_ids.get(peer, -1)))
				if q != null:
					for k in net.inputs[peer]: q.inp[k] = net.inputs[peer][k]
		acc += min(delta, 0.1)
		while acc >= TICK:
			acc -= TICK
			for p in sim.players:
				var n: Dictionary = mech_nodes[p.id]
				n.prev = n.cur; n.a_prev = n.a_cur
			var cd0 := int(ceil(sim.countdown))
			sim.step(TICK)
			if botchat != null and botchat.sim == sim: botchat.tick(TICK)
			if sim.countdown > 0 and int(ceil(sim.countdown)) != cd0: sfx.play("count")
			elif sim.countdown <= 0 and cd0 == 1: sfx.play("go")
			for p in sim.players:
				var n: Dictionary = mech_nodes[p.id]
				n.cur = Vector3(p.x * K, p.z * K, p.y * K); n.a_cur = float(p.inp.a)
				if not p.alive: n.prev = n.cur
			if net.role == "host": net.host_collect(sim); net.host_broadcast(sim)
			apply_events()
			if sim.dirty.size() > 0:
				for i in sim.dirty:
					var t := sim.grid[i]
					paint_img.set_pixel(i % sim.GW, i / sim.GW, Color(1 if t == me.team else 0, 1 if t > 0 and t != me.team else 0, 0, 1 if t > 0 else 0))
					mini_img.set_pixel(i % sim.GW, i / sim.GW, team_col[t] if t > 0 else base_cols[i])
				paint_tex.update(paint_img); mini_tex.update(mini_img)
			if sim.over and state == "play":
				state = "result"
				if net.role == "host":
					var fin: Array = []
					for q in sim.players: fin.append([q.id, q.kills, q.deaths, q.painted, q.obj, q.balloons, q.float_t, q.seals, q.spirits, q.cubes, q.extracted])
					net.broadcast_end(sim.result, fin)
				end_splash()
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
		var c := Vector3(float(map_def(cur_map).gw) / 2.0, 0, float(map_def(cur_map).gh) / 2.0)
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
	update_loot_ui(real_dt)
	hud.queue_redraw()

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
		var t: int = 1 if pr.team == me.team else 2
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
		var t2: int = 1 if s.team == me.team else 2
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
	DawnFx.update(self, delta)
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
	if state == "play" and sim != null and sim.countdown <= 0 and sim.time_left <= 30 and sim.mode != "elim": music.play("final")
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
		if weather != null and is_instance_valid(weather): weather.global_position = Vector3(mp.x, 0, mp.z)
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
				var fxs = profile.skin(str(profile.o.wear.get("fx", ""))) if p == me and not autoplay else null
				if fxs != null:
					for fc in fxs.fx.cols: burst(tip, Color(str(fc)), 3, 4.0, 0.12, 0.25, 0.0)
				else: burst(tip, c.lightened(0.4), 4, 3.0, 0.14, 0.15, 0.0)
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
				hud.feed(e, "击毁"); hud.kill_notice(e, "wreck")
				if botchat != null: botchat.on_kill(player_by_id(e[2]), player_by_id(e[1]))
				if e[1] == me.id or e[2] == me.id: hitstop(70)
			"ko":
				var pos5 := Vector3(e[3] * K, e[5] * K + 0.8, e[4] * K)
				burst(pos5, team_col[e[6]], 30, 8.0, 0.22, 0.6); ring(pos5, 4.0, Color.WHITE, 0.5)
				sfx.play("ko", vol_at(e[3], e[4]))
				hud.feed(e, "击倒"); hud.kill_notice(e, "ko")
				if botchat != null: botchat.on_kill(player_by_id(e[2]), player_by_id(e[1]))
				if e[1] == me.id or e[2] == me.id: hitstop(90)
			"use":
				var uq := player_by_id(e[1])
				if uq != null:
					var U: Dictionary = data.loot.items[e[2]].get("use", {})
					var uc := Color("#4fd8ff") if U.has("shield") else (Color("#ffe14d") if U.has("rush") else Color("#6dff8a"))
					var up := Vector3(uq.x * K, uq.z * K + 1.2, uq.y * K)
					burst(up, uc, 18, 3.5, 0.18, 0.6, 4.0); ring(up - Vector3(0, 1.1, 0), 1.6, uc, 0.45)
					if uq == me: sfx.play("pickup"); hud.banner("使用了 %s" % data.loot.items[e[2]].name, uc)
			"pjn":   # 搜刮撤离：中途加入的增援小队（客户端的镜像也要把人加上）
				for r in e[1]:
					var nq := player_by_id(int(r[0]))
					if nq == null: nq = sim.add_player(int(r[0]), str(r[1]), int(r[2]), str(r[3]), str(r[4]), true, {"lv": int(r[5]), "bt": int(r[6])})
					if not mech_nodes.has(nq.id): mech_nodes[nq.id] = make_mech_node(nq)
			"sqj":
				hud.banner("增援小队「%s」空降进场！当前 %d 支小队" % [e[2], int(e[3])], Color("#ffb43d"))
				sfx.play("boom", -8)
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
					var spn := str(data.mechs[me.weapon].specialInfo.name)
					if str(e[2]) == "finale": spn = "绝响"
					hud.banner("大招 • " + spn, Color("#7ad8ff") if str(e[2]) == "finale" else Color("#ffe14d"), data.pilots[me.pilot])
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
			_:
				if not DawnFx.event(self, e): mode_event(e)

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
	if pad_tick(inp): return
	if chat_open: inp.mx = 0; inp.my = 0; inp.f = false; inp.w = false; inp.j = false; return
	var mx := 0.0; var my := 0.0
	if settings.pressed("left") or Input.is_physical_key_pressed(KEY_LEFT): mx -= 1
	if settings.pressed("right") or Input.is_physical_key_pressed(KEY_RIGHT): mx += 1
	if settings.pressed("up") or Input.is_physical_key_pressed(KEY_UP): my -= 1
	if settings.pressed("down") or Input.is_physical_key_pressed(KEY_DOWN): my += 1
	inp.mx = mx; inp.my = my
	var gp := ground_point(get_viewport().get_mouse_position(), (me.z + 24.0) * K)
	var dx := gp.x / K - me.x; var dy := gp.z / K - me.y
	inp.a = atan2(dy, dx)
	var d := Vector2(dx, dy).length()
	inp.ad = d
	var th := sim.top_at(gp.x / K, gp.z / K)
	inp.pt = atan2(th + 16.0 - (me.z + 24.0), max(40.0, d)) if th > me.z + 20 else 0.0
	inp.f = Input.is_mouse_button_pressed(MOUSE_BUTTON_LEFT) and not menu.visible
	inp.w = settings.pressed("wheel")
	inp.j = settings.pressed("jump")

func _unhandled_input(ev: InputEvent) -> void:
	if ev is InputEventJoypadButton and ev.pressed: pad_button(ev)
	if state != "play" or me == null: return
	if ev is InputEventKey and ev.pressed and not ev.echo:
		if sim.loot and settings.is_key(ev, "interact"): loot_interact()
		elif sim.loot and settings.is_key(ev, "bag"): bag_open = not bag_open; loot_ui_t = 0
		elif settings.is_key(ev, "skill"): me.inp.gq += 1
		elif settings.is_key(ev, "super"): me.inp.qq += 1
		elif settings.is_key(ev, "overload"): me.inp.oq += 1
		elif ev.physical_keycode == KEY_ESCAPE: toggle_pause()
		elif (ev.physical_keycode == KEY_ENTER or ev.physical_keycode == KEY_KP_ENTER) and tut.is_empty(): open_chat()
		elif ev.physical_keycode == KEY_N: hud.big_map = not hud.big_map
		elif sim.loot and ev.physical_keycode >= KEY_1 and ev.physical_keycode <= KEY_4: use_quick(USE_KEYS[ev.physical_keycode - KEY_1])
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
func start_loot(risk: String) -> void:
	loot_risk = risk; sel_mode = "loot"
	start_match(profile.o.pilot, profile.o.weapon)

func start_ranked(bans: Dictionary) -> void:
	ranked_on = true; ranked_bans = bans
	sel_mode = profile.ranked_mode(); sel_map = -1
	start_match(profile.o.pilot, profile.o.weapon)
	ranked_on = false

func _input(ev: InputEvent) -> void:   # F11：全屏切换（任何时候都能用）
	if ev is InputEventKey and ev.pressed and not ev.echo and ev.physical_keycode == KEY_F11:
		settings.fullscreen = not settings.fullscreen; settings.apply(self); settings.save()

# 大厅的「对战 / 排位 / 进入禁区」：先走匹配流程（matchflow.gd），定好阵容再开局
func queue_match(kind: String) -> void:
	var o: Dictionary = profile.o
	if not profile.has_pilot(str(o.pilot)): lobby.toast("先在「驾驶员」里选一位驾驶员"); return
	if kind == "ranked" and not profile.can_ranked(): lobby.toast("至少需要 3 位驾驶员和 3 台机体才能打排位"); return
	if kind == "loot": loot_risk = str(o.risk)
	matchflow.begin(kind)

func launch_prepared(kind: String, mode: String, map_idx: int, pilot: String, mech: String, roster: Dictionary, bans: Dictionary) -> void:
	sel_mode = mode; sel_map = map_idx
	ranked_on = kind == "ranked"; ranked_bans = bans if ranked_on else {}
	prep = roster
	start_match(pilot, mech)
	prep = {}
	ranked_on = false
	if sim != null: sim.countdown = 5.0   # 多留两秒给观察阶段

func start_from_lobby() -> void:
	var o: Dictionary = profile.o
	if not profile.has_pilot(o.pilot): lobby.toast("先在「驾驶员」里选一位驾驶员"); return
	sel_mode = o.mode; sel_map = int(o.map)
	start_match(o.pilot, o.weapon)

func back_to_lobby() -> void:
	close_pause()
	chat_clear()
	if not tut.is_empty(): tut_close()
	if net.role == "client" and state == "play": net.leave()
	state = "menu"; menu.visible = true; result_ui.visible = false
	music.play("menu")
	if hitstop_until > 0: Engine.time_scale = 1.0; hitstop_until = 0
	lobby.refresh()

# 大厅的 3D 展台：机体 + 站在旁边的驾驶员，放在场地外面的地上，背后是城市夜景
func show_showroom(pid: String, mech: String, vis: bool, cam_x := 0.0) -> void:
	showroom_cam = cam_x
	showroom.visible = vis and pid != ""
	if pid == "" or not data.pilots.has(pid): return
	var key := pid + "|" + mech + "|" + profile.pilot_skin(pid) + "|" + str(profile.o.wear.get("mech", ""))
	if key != showroom_key:
		showroom_key = key
		for c in showroom.get_children(): c.queue_free()
		var tc: Color = team_col[1]
		var turn := Node3D.new(); turn.name = "turn"; showroom.add_child(turn)
		var n := Models.build_mech(mech, data.mechs[mech], tc, profile.pilot_look(pid), profile.mech_paint())
		n.root.scale = Vector3.ONE * 1.6; turn.add_child(n.root)
		var disc := MeshInstance3D.new(); disc.mesh = Models.mesh("cyl", 3.6, 0.3); disc.material_override = Models.toon(Color("#2a2550"), 0.1, 0.6); disc.position.y = -0.15; showroom.add_child(disc)
		var rim := MeshInstance3D.new(); rim.mesh = Models.mesh("torus", 3.5, 3.75); rim.material_override = Models.glow(Color(str(data.pilots[pid].accent)), 2.4); showroom.add_child(rim)
		var l := OmniLight3D.new(); l.position = Vector3(2, 5, 4); l.light_energy = 2.2; l.omni_range = 14; showroom.add_child(l)
		var SK = profile.skin(profile.pilot_skin(pid))
		if SK != null and SK.has("entrance") and state == "menu": play_entrance.call_deferred(turn, str(SK.entrance))
	var m: Dictionary = map_def(cur_map)
	showroom.position = Vector3(float(m.gw) / 2.0, -0.45, float(m.gh) + 14.0)


# ---------------- 开场：XA 游戏工作室 → 加载画面（等背景音乐合成好） ----------------
func splash(layer: CanvasLayer) -> void:
	var sp := Control.new(); sp.set_anchors_preset(Control.PRESET_FULL_RECT); sp.mouse_filter = Control.MOUSE_FILTER_STOP; layer.add_child(sp)
	var bg := ColorRect.new(); bg.color = Color("#0b0816"); bg.set_anchors_preset(Control.PRESET_FULL_RECT); sp.add_child(bg)
	var vs := get_viewport().get_visible_rect().size
	var dots := UIKit.Splash.new(); dots.cols = [Color("#ff3ea5"), Color("#1fd6ee"), Color("#ffe14d")]; dots.seed_v = 7; dots.size = vs; dots.modulate.a = 0; sp.add_child(dots)
	var studio := VBoxContainer.new(); studio.alignment = BoxContainer.ALIGNMENT_CENTER; studio.size = vs; studio.modulate.a = 0; sp.add_child(studio)
	var xa := UIKit.label("XA", 120, Color("#ffe14d"), 14, Color("#ff3ea5")); xa.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER; studio.add_child(xa)
	var n1 := UIKit.label("XA 游戏工作室", 34, Color.WHITE, 6); n1.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER; studio.add_child(n1)
	var n2 := UIKit.label("XA GAME STUDIO", 18, Color("#9a96b8")); n2.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER; studio.add_child(n2)
	var load := VBoxContainer.new(); load.alignment = BoxContainer.ALIGNMENT_CENTER; load.size = vs; load.modulate.a = 0; sp.add_child(load)
	var t1 := UIKit.label("涂鸦机兵", 84, Color("#ffe14d"), 16, Color("#ff3ea5")); t1.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER; load.add_child(t1)
	var t2 := UIKit.label("GRAFFI•BOTS  •  电脑版", 22, Color("#5ff0ff"), 6); t2.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER; load.add_child(t2)
	var barc := CenterContainer.new(); load.add_child(barc)
	var bar := UIKit.bar(0.0, 420, 14, Color("#ffe14d")); barc.add_child(bar)
	var tip := UIKit.label("正在调颜料……", 16, Color("#a8a4c8")); tip.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER; load.add_child(tip)
	var tw := create_tween()
	tw.tween_property(studio, "modulate:a", 1.0, 0.5); tw.parallel().tween_property(dots, "modulate:a", 0.5, 0.8)
	tw.tween_interval(0.9)
	tw.tween_property(studio, "modulate:a", 0.0, 0.35)
	tw.tween_property(load, "modulate:a", 1.0, 0.3)
	var tips := ["正在调颜料……", "正在给机兵上油……", "正在合成背景音乐……", "灰城的墙已经刷好了，等你去涂"]
	tw.tween_method(func(k):
		bar.k = k; bar.queue_redraw()
		tip.text = tips[mini(3, int(k * 4))], 0.0, 0.85, 1.2)
	tw.tween_callback(func():
		var wait := create_tween()
		wait.tween_method(func(k): bar.k = 0.85 + 0.15 * k; bar.queue_redraw(), 0.0, 1.0, 0.4)
		wait.tween_property(sp, "modulate:a", 0.0, 0.4)
		wait.tween_callback(sp.queue_free))


# ---------------- 搜刮撤离：互动、容器面板、背包 ----------------
func near_cont():
	if sim == null or not sim.loot or not me.alive: return null
	var best = null; var bd := float(data.loot.openR)
	for c in sim.obj.conts:
		if c.items.is_empty() or absf(me.z - c.z) > 60: continue
		var d := Vector2(c.x - me.x, c.y - me.y).length()
		if d < bd: bd = d; best = c
	return best

func loot_interact() -> void:
	if me.open_c != 0: me.open_c = 0; loot_ui_t = 0; net.send_loot("open", [0]); return
	var c = near_cont()
	if c != null: me.open_c = c.id; me.srch = 0; sfx.play("click"); loot_ui_t = 0; net.send_loot("open", [c.id])

# 局域网：客户端的搜刮操作发给房主执行（房主的模拟才是准的），本地先不改
func loot_do(op: String, args: Array) -> bool:
	if net.role == "client": net.send_loot(op, args); return true
	return host_loot(me, op, args)

func host_loot(p: Sim.Mech, op: String, args: Array) -> bool:
	if p == null or sim == null or not sim.loot: return false
	match op:
		"open":
			var cid := int(args[0])
			if cid == 0: p.open_c = 0
			elif sim.obj.cont_map.has(cid) and sim.can_reach(p, sim.obj.cont_map[cid]): p.open_c = cid; p.srch = 0
			return true
		"take": return sim.loot_take(p, int(args[0]), int(args[1]), bool(args[2]))
		"drop": sim.loot_drop(p, int(args[0]), bool(args[1])); return true
		"move": return sim.loot_move(p, int(args[0]), bool(args[1]))
		"use": return sim.use_item(p, bool(args[0]), int(args[1]))
	return false

# 1-4 键 / 手柄十字键左：用背包（没有就用安全箱）里的消耗品
const USE_KEYS := ["stim", "repair", "shieldc", "adren"]
func use_quick(k: String) -> void:
	if sim == null or not sim.loot or me == null: return
	for from_safe in [false, true]:
		var inv: Dictionary = me.safe if from_safe else me.inv
		for i in inv.items.size():
			if str(inv.items[i].k) == k: loot_do("use", [from_safe, i]); return
	hud.banner("没有「%s」" % data.loot.items[k].name, Color("#ff8a8a"))

func rare_col(k: String) -> Color:
	var r := int(data.loot.items[k].r)
	return Color(str(data.loot.rare[r].c)) if r < data.loot.rare.size() and data.loot.rare[r] != null else Color.WHITE

func update_loot_ui(delta: float) -> void:
	if loot_ui == null:
		loot_ui = Control.new(); loot_ui.set_anchors_preset(Control.PRESET_FULL_RECT); loot_ui.mouse_filter = Control.MOUSE_FILTER_IGNORE; loot_ui.theme = theme_ui
		hud.get_parent().add_child(loot_ui)
	loot_ui.visible = state == "play" and sim != null and sim.loot
	if not loot_ui.visible: return
	loot_ui_t -= delta
	if loot_ui_t > 0: return
	loot_ui_t = 0.2
	for c in loot_ui.get_children(): c.queue_free()
	var vs := get_viewport().get_visible_rect().size
	if me.open_c != 0 and sim.obj.cont_map.has(me.open_c):
		var c: Dictionary = sim.obj.cont_map[me.open_c]
		var pc := UIKit.dark_card(); pc.position = Vector2(vs.x - 380, 140); pc.custom_minimum_size = Vector2(360, 0); loot_ui.add_child(pc)
		var v := VBoxContainer.new(); v.add_theme_constant_override("separation", 6); pc.add_child(v)
		var CT: Dictionary = data.loot.conts.get(c.type, {"name": c.type})
		v.add_child(UIKit.label("%s（F 关闭）" % CT.get("name", "遗骸" if c.type == "body" else "物资"), 18, Color("#ffe14d"), 4))
		for i in c.items.size():
			var k: String = c.items[i]; var it: Dictionary = data.loot.items[k]
			var row := HBoxContainer.new(); row.add_theme_constant_override("separation", 6); v.add_child(row)
			if i < int(c.rev):
				var nl := UIKit.label("%s  %dx%d  %d" % [it.name, int(it.w), int(it.h), int(it.v)], 15, rare_col(k), 3); nl.custom_minimum_size.x = 210; row.add_child(nl)
				var tb := UIKit.flat_button("拿", 14); tb.custom_minimum_size = Vector2(48, 30); row.add_child(tb)
				tb.pressed.connect(func(): if loot_do("take", [c.id, i, false]): sfx.play("pickup"); loot_ui_t = 0)
				var sb := UIKit.flat_button("安全箱", 13); sb.custom_minimum_size = Vector2(70, 30); row.add_child(sb)
				sb.pressed.connect(func(): if loot_do("take", [c.id, i, true]): sfx.play("pickup"); loot_ui_t = 0)
			elif i == int(c.rev):
				row.add_child(UIKit.label("搜索中……", 15, Color("#c9c5e6"))); row.add_child(UIKit.bar(me.srch / max(0.01, sim.search_need(c, me)), 140, 10, Color("#ffe14d")))
			else: row.add_child(UIKit.label("？？？", 15, Color("#6a668a")))
		if c.items.is_empty(): v.add_child(UIKit.label("空了", 15, Color("#a8a4c8")))
	if bag_open:
		var bp := UIKit.dark_card(); bp.position = Vector2(20, 150); loot_ui.add_child(bp)
		var bv := VBoxContainer.new(); bv.add_theme_constant_override("separation", 8); bp.add_child(bv)
		bv.add_child(UIKit.label("背包  价值 %d（Tab 关闭 • 左键丢掉 • 右键放进 / 拿出安全箱）" % sim.loot_value(sim.inv_keys(me.inv)), 15, Color("#ffe14d"), 3))
		bv.add_child(bag_grid(me.inv, false))
		bv.add_child(UIKit.label("安全箱（阵亡也能带出来）  价值 %d" % sim.loot_value(sim.inv_keys(me.safe)), 15, Color("#7af0ff"), 3))
		bv.add_child(bag_grid(me.safe, true))

func bag_grid(inv: Dictionary, is_safe: bool) -> Control:
	var g := BagGrid.new(); g.inv = inv; g.game = self; g.is_safe = is_safe
	g.custom_minimum_size = Vector2(int(inv.w) * 52 + 2, int(inv.h) * 52 + 2)
	return g

class BagGrid extends Control:
	var inv: Dictionary
	var game
	var is_safe := false
	func _draw() -> void:
		for y in int(inv.h):
			for x in int(inv.w): draw_rect(Rect2(x * 52 + 1, y * 52 + 1, 50, 50), Color(1, 1, 1, 0.06))
		for it in inv.items:
			var r := Rect2(int(it.x) * 52 + 3, int(it.y) * 52 + 3, int(it.w) * 52 - 4, int(it.h) * 52 - 4)
			var c: Color = game.rare_col(it.k)
			draw_rect(r, Color(c, 0.35)); draw_rect(r, c, false, 2.0)
			draw_string(game.font, r.position + Vector2(4, 18), str(game.data.loot.items[it.k].name), HORIZONTAL_ALIGNMENT_LEFT, r.size.x - 6, 13, Color.WHITE)
			draw_string(game.font, r.position + Vector2(4, r.size.y - 6), str(int(game.data.loot.items[it.k].v)), HORIZONTAL_ALIGNMENT_LEFT, r.size.x - 6, 12, c)
	func _gui_input(ev: InputEvent) -> void:
		if not (ev is InputEventMouseButton) or not ev.pressed: return
		var cx := int(ev.position.x / 52); var cy := int(ev.position.y / 52)
		for i in inv.items.size():
			var it: Dictionary = inv.items[i]
			if cx >= int(it.x) and cx < int(it.x) + int(it.w) and cy >= int(it.y) and cy < int(it.y) + int(it.h):
				if ev.button_index == MOUSE_BUTTON_LEFT and ev.double_click and game.data.loot.items[it.k].has("use"): game.loot_do("use", [is_safe, i])
				elif ev.button_index == MOUSE_BUTTON_RIGHT: game.loot_do("move", [i, not is_safe])
				elif game.data.loot.items[it.k].has("use") and not ev.double_click: pass   # 消耗品：单击不丢（双击使用，Shift+单击丢掉）
				else: game.loot_do("drop", [i, is_safe])
				if ev.button_index == MOUSE_BUTTON_LEFT and ev.shift_pressed and game.data.loot.items[it.k].has("use"): game.loot_do("drop", [i, is_safe])
				game.sfx.play("click"); game.loot_ui_t = 0
				accept_event(); return


# ---------------- 局域网：客户端开局 / 结束 ----------------
func _on_net_start(info: Dictionary) -> void:
	if net.role != "client": return
	sel_mode = str(info.mode); loot_risk = "normal"; ranked_on = false
	var midx := int(info.map)
	if midx != cur_map: build_map(midx)
	sim = Sim.new(data, 0 if sel_mode == "loot" else midx, int(info.seed), float(info.dur), sel_mode)
	var my_id := int(info.peers.get(net.my_peer(), info.peers.get(str(net.my_peer()), 1)))
	for r in info.roster:
		var q := sim.add_player(int(r[0]), str(r[1]), int(r[2]), str(r[3]), str(r[4]), bool(r[6]), r[5])
		if r.size() > 7: q.npc = bool(r[7]); q.loot_boss = bool(r[8]); q.max_hp = float(r[9])
	me = player_by_id(my_id)
	if me == null: me = sim.players[0]
	sim.ranked = bool(info.get("ranked", false))   # 组队排位：队友也按排位结算
	spectate_id = 0; net_snap = null
	result_ui.visible = false
	net_client_match = true
	begin_view()

func _on_net_end(d: Dictionary) -> void:
	if net.role != "client" or sim == null: return
	for row in d.players:
		var q := player_by_id(int(row[0]))
		if q == null: continue
		q.kills = row[1]; q.deaths = row[2]; q.painted = row[3]; q.obj = row[4]; q.balloons = row[5]; q.float_t = row[6]; q.seals = row[7]; q.spirits = row[8]; q.cubes = row[9]; q.extracted = row[10]
	sim.result = d.result; sim.winner = int(d.result.winner); sim.over = true
	state = "result"
	end_splash()


# ---------------- 联机自测（两个无画面进程：GB_LAN=host / GB_LAN=127.0.0.1） ----------------
var lan_t := 0.0
var lan_snaps := 0
func lan_test_setup() -> void:
	var who := OS.get_environment("GB_LAN")
	if int(profile.o.tut) == 0: profile.tutorial(); profile.open_chest("starter")
	if OS.get_environment("GB_MODE") == "rank":   # 组队排位测试：房主要能打排位
		for id in data.pilotOrder: profile.o.pilots[id] = {"lv": 7, "bt": 1}
		for id in data.order: if not profile.o.mechs.has(id): profile.o.mechs.append(id)
		profile.o.rank.rp = 700
	var info := {"name": "测试" + who, "pilot": profile.o.pilot, "weapon": profile.o.weapon, "power": profile.power(profile.o.pilot)}
	var srv := OS.get_environment("GB_SERVER"); var cf := OS.get_environment("GB_CODEFILE")
	if srv != "" and who == "host":   # 线上房间测试：房主把房间号写进文件，客人读文件加入
		print("线上测试：房主 ", net.host_online(info, srv))
		net.room_changed.connect(func(): if str(net.room.get("code", "")) != "" and not FileAccess.file_exists(cf): var f := FileAccess.open(cf, FileAccess.WRITE); f.store_string(net.room.code); f.close(); print("房间号 ", net.room.code))
	elif srv != "":
		while not FileAccess.file_exists(cf): await get_tree().create_timer(0.2).timeout
		await get_tree().create_timer(0.3).timeout
		print("线上测试：加入 ", FileAccess.get_file_as_string(cf), " ", net.join_online(FileAccess.get_file_as_string(cf), info, srv))
	else: print("联机测试：", who, " ", net.host(info) if who == "host" else net.join(who, info))
	net.snapshot.connect(func(_s): lan_snaps += 1)
	set_process(true)

func lan_test_tick(delta: float) -> void:
	lan_t += delta
	var who := OS.get_environment("GB_LAN")
	if who == "host" and state == "menu" and net.room.players.size() >= 2 and lan_t > 2.0:
		print("房主：房间里 %d 人，开打" % net.room.players.size())
		if OS.get_environment("GB_MODE") == "rank":
			if not matchflow.visible: net.room.mode = "rank"; net.room.queue = true; net.sync_room(); queue_match("ranked")
		else: sel_mode = OS.get_environment("GB_MODE") if OS.get_environment("GB_MODE") != "" else "turf"; sel_map = 0; start_match(profile.o.pilot, profile.o.weapon)
	if int(lan_t * 2) != int((lan_t - delta) * 2) and int(lan_t) % 3 == 0:
		print("%s t=%.0f state=%s players=%d snaps=%d me=%s time=%.1f" % [who, lan_t, state, sim.players.size() if sim != null else 0, lan_snaps, str(me.id) if me != null else "-", sim.time if sim != null else 0.0])
	if sim != null and sim.loot and state == "play" and sim.countdown <= 0:   # 搜刮撤离联机测试
		if who == "host" and not sim.has_meta("lt"):   # 把客户端的人挪到一个容器旁边，并且搜完
			for peer in peer_ids:
				var q := player_by_id(int(peer_ids[peer]))
				var c: Dictionary = sim.obj.conts.filter(func(k): return k.items.size() > 0)[0]
				q.x = c.x + 10; q.y = c.y; q.z = c.z; c.rev = c.items.size(); sim.set_meta("lt", c.id); print("房主：把 %d 号挪到容器 %d 旁边" % [q.id, c.id])
		if who != "host" and lan_t > 9.0 and not sim.has_meta("lt"):
			var best = null; var bd := 1e9
			for c in sim.obj.conts:
				var d := Vector2(c.x - me.x, c.y - me.y).length()
				if d < bd and c.items.size() > 0: bd = d; best = c
			if best != null and bd < 60: sim.set_meta("lt", best.id); loot_do("take", [best.id, 0, false]); print("客户端：拿容器 %d 的第一件（距离 %.0f，容器里 %d 件）" % [best.id, bd, best.items.size()])
	if lan_t > float(OS.get_environment("GB_QUIT_AT") if OS.get_environment("GB_QUIT_AT") != "" else "20"):
		if me != null and sim != null and sim.loot: print("%s 搜刮：背包 %d 件  容器 %d 个  模式 %s" % [who, me.inv.items.size(), sim.obj.conts.size(), sim.mode])
		if me != null and sim != null: print("%s 结束：me=%d (%d,%d) alive=%s painted=%d" % [who, me.id, me.x, me.y, me.alive, me.painted])
		if me != null and sim != null: print("%s 排位=%s 模式=%s 我的队=%d 队友=%s" % [who, sim.ranked, sim.mode, me.team, ", ".join(sim.players.filter(func(q): return q.team == me.team).map(func(q): return q.name))])
		get_tree().quit()

# ================= 暂停菜单（Esc）=================
var paused := false
var pause_ui: Control

func toggle_pause() -> void:
	if pause_ui != null: close_pause(); return
	paused = true
	var layer: Node = hud.get_parent()
	pause_ui = Control.new(); pause_ui.set_anchors_preset(Control.PRESET_FULL_RECT); pause_ui.theme = theme_ui; layer.add_child(pause_ui)
	var bg := ColorRect.new(); bg.color = Color(0.03, 0.02, 0.08, 0.72); bg.set_anchors_preset(Control.PRESET_FULL_RECT); pause_ui.add_child(bg)
	var s := get_viewport().get_visible_rect().size
	var c := UIKit.dark_card(); c.position = Vector2(s.x / 2 - 260, s.y / 2 - 200); c.size = Vector2(520, 400); c.custom_minimum_size = c.size; pause_ui.add_child(c)
	var v := VBoxContainer.new(); v.add_theme_constant_override("separation", 12); c.add_child(v)
	var t := UIKit.label("暂停" if net.role == "" else "菜单（联机中不会暂停）", 34, Color("#ffe14d"), 8); t.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER; v.add_child(t)
	if not tut.is_empty(): var tl := UIKit.label("新手教程进行中", 16, Color("#7af0ff")); tl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER; v.add_child(tl)
	var row := func(label: String, ctl: Control) -> void:
		var h := HBoxContainer.new(); h.add_theme_constant_override("separation", 12); v.add_child(h)
		var l := UIKit.label(label, 17, Color.WHITE); l.custom_minimum_size.x = 120; h.add_child(l); h.add_child(ctl)
	var sv := HSlider.new(); sv.min_value = -40; sv.max_value = 6; sv.value = settings.sfx_db; sv.custom_minimum_size = Vector2(300, 28)
	sv.value_changed.connect(func(x): settings.sfx_db = x; settings.save(); settings.apply(self)); row.call("音效音量", sv)
	var mv := HSlider.new(); mv.min_value = -40; mv.max_value = 0; mv.value = settings.music_db; mv.custom_minimum_size = Vector2(300, 28)
	mv.value_changed.connect(func(x): settings.music_db = x; settings.save(); settings.apply(self)); row.call("音乐音量", mv)
	var q := OptionButton.new()
	for k in Settings.QUALITY_ORDER: q.add_item(I18n.t(str(Settings.QUALITY[k].name)))
	q.select(Settings.QUALITY_ORDER.find(settings.quality)); q.item_selected.connect(func(k): settings.quality = Settings.QUALITY_ORDER[k]; settings.save(); settings.apply(self)); row.call("画质", q)
	var K: Dictionary = settings.keys
	var kn := func(a): return Settings.key_name(K[a])
	var keys := UIKit.label("%s%s%s%s 移动 • 左键攻击 • %s 技能 • %s/右键 大招 • %s 超载 • %s 滚轮 • %s 跳" % [kn.call("up"), kn.call("left"), kn.call("down"), kn.call("right"), kn.call("skill"), kn.call("super"), kn.call("overload"), kn.call("wheel"), kn.call("jump")], 13, Color("#c8c4e8"))
	keys.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART; keys.custom_minimum_size.x = 480; v.add_child(keys)
	var go := UIKit.gold_button("继续（Esc）", 22); go.custom_minimum_size = Vector2(0, 56); v.add_child(go); go.pressed.connect(func(): sfx.play("click"); close_pause())
	var quit_txt := "跳过教程" if not tut.is_empty() else "退出对局"
	var qb := UIKit.pink_button(quit_txt, 20); qb.custom_minimum_size = Vector2(0, 52); v.add_child(qb)
	qb.pressed.connect(func():
		sfx.play("click")
		if not tut.is_empty(): tut_end(false); return
		if autoplay or sim == null: back_to_lobby(); return
		confirm_quit(v))

func confirm_quit(v: VBoxContainer) -> void:
	for ch in v.get_children(): ch.queue_free()
	var t := UIKit.label("确定要退出吗？", 30, Color("#ff6b5a"), 6); t.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER; v.add_child(t)
	var msg := "逃跑按输一局结算：扣奖杯%s，没有其他奖励。" % ("和排位分" if sim.ranked else "")
	if net.role != "": msg = "退出后会离开联机房间。"
	if sim.loot: msg = "撤离失败：只保住安全箱里的东西，背包里的物资和带进来的装备都会丢掉。"
	var l := UIKit.label(msg, 16, Color("#e6e2fa")); l.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART; l.custom_minimum_size.x = 480; l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER; v.add_child(l)
	var a := UIKit.flat_button("再想想", 20); a.custom_minimum_size = Vector2(0, 54); v.add_child(a); a.pressed.connect(func(): sfx.play("click"); close_pause(); toggle_pause())
	var b := UIKit.pink_button("确定退出", 20); b.custom_minimum_size = Vector2(0, 54); v.add_child(b)
	b.pressed.connect(func():
		sfx.play("click")
		if net.role == "" and not sim.over:   # 逃跑：按输一局算
			var rw := profile.match_reward(sim, me)
			rw.won = false; rw.draw = false; rw.mvp = false; rw.xp = 0
			if not sim.loot: rw.trophies = -int(data.econ.trophy.loss)
			rw.deaths = me.deaths
			profile.apply_match(rw)
		back_to_lobby())

func close_pause() -> void:
	paused = false
	if pause_ui != null: pause_ui.queue_free(); pause_ui = null

# ================= 新手教程（照网页版 1.0 的 7 步）=================
var tut := {}
var tut_ui: Control
const TUT_STEPS := [["移动", "用 {up}{left}{down}{right} 移动，往前走一段"], ["开火", "鼠标瞄准，按住左键开火，打中对面的训练靶"],
	["涂地", "朝地面开火把地涂满颜色！涂地多的一队获胜，站在己方颜色上跑得更快"], ["跳跃", "按 {jump} 跳上旁边的矮台（高台要走楼梯或踩弹跳板）"],
	["技能", "按 {skill} 使用驾驶员技能（技能是充能制，用完会慢慢回复）"], ["大招", "大招充满了！按 {super} 或鼠标右键发动（平时靠打中敌人和涂地充能）"],
	["弹出驾驶员", "糟糕，机体被打爆了！驾驶员会弹出继续战斗，躲好活过几秒，新机体就会空投到你脚下"]]

func start_tutorial() -> void:
	sel_mode = "turf"; sel_map = 0
	if cur_map != 0: build_map(0)
	match_seed = randi() % 1000000 + 1
	sim = Sim.new(data, 0, match_seed, 300.0, "turf")
	sim.tutorial = true; sim.countdown = 3.5
	me = sim.add_player(1, profile.display_name(), 1, "blaze", "blaster", false, {"lv": 1, "bt": 0})
	sim.add_player(2, "训练靶 A", 2, "titan", "roller", true, {"lv": 1, "bt": 0})
	sim.add_player(3, "训练靶 B", 2, "doc", "charger", true, {"lv": 1, "bt": 0})
	spectate_id = 0
	begin_view()
	tut = {"step": -1, "x0": 0.0, "y0": 0.0, "paint0": 0, "sk0": 0, "sp_sent": false, "sp_full": false, "wr_t": -1.0, "was_foot": false, "done_t": 0.0, "t": 0.0}
	var layer: Node = hud.get_parent()
	tut_ui = Control.new(); tut_ui.set_anchors_preset(Control.PRESET_FULL_RECT); tut_ui.mouse_filter = Control.MOUSE_FILTER_IGNORE; tut_ui.theme = theme_ui; layer.add_child(tut_ui)
	var s := get_viewport().get_visible_rect().size
	var c := UIKit.card(Color("#2e2760"), Color("#120e26"), Color("#7af0ff"), 16); c.position = Vector2(s.x / 2 - 360, 96); c.size = Vector2(720, 110); c.custom_minimum_size = c.size; tut_ui.add_child(c)
	var h := HBoxContainer.new(); h.add_theme_constant_override("separation", 14); c.add_child(h)
	h.add_child(UIKit.avatar("res://art/faces/vet.png", "", 80, Color("#7af0ff")))
	var v := VBoxContainer.new(); v.size_flags_horizontal = Control.SIZE_EXPAND_FILL; h.add_child(v)
	var st := UIKit.label("新手教程", 15, Color("#7af0ff")); v.add_child(st)
	var tx := UIKit.label("先熟悉一下操作吧！", 19, Color.WHITE, 3); tx.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART; tx.custom_minimum_size.x = 480; v.add_child(tx)
	var dots := HBoxContainer.new(); dots.add_theme_constant_override("separation", 6); v.add_child(dots)
	for i in TUT_STEPS.size(): var d := ColorRect.new(); d.custom_minimum_size = Vector2(26, 6); d.color = Color(1, 1, 1, 0.2); dots.add_child(d)
	var sk := UIKit.flat_button("跳过教程", 14); sk.custom_minimum_size = Vector2(100, 40); h.add_child(sk); sk.pressed.connect(func(): sfx.play("click"); tut_end(false))
	tut.ui = {"st": st, "tx": tx, "dots": dots}

func tut_set(i: int) -> void:
	tut.step = i
	if i == 2: tut.paint0 = me.painted
	if i == 4: tut.sk0 = me.skill_uses
	var U: Dictionary = tut.ui
	for k in U.dots.get_child_count(): U.dots.get_child(k).color = Color("#6dff8a") if k < i else (Color("#ffe14d") if k == i else Color(1, 1, 1, 0.2))
	if i >= TUT_STEPS.size():
		U.st.text = I18n.t("完成"); U.tx.text = I18n.t("全部学会了！回大厅打开你的新手宝箱吧。"); sfx.play("win"); tut.done_t = tut.t
		return
	var K: Dictionary = settings.keys
	var txt: String = I18n.t(TUT_STEPS[i][1])
	for a in ["up", "left", "down", "right", "jump", "skill", "super"]: txt = txt.replace("{%s}" % a, Settings.key_name(K[a]))
	U.st.text = "%d / %d  •  %s" % [i + 1, TUT_STEPS.size(), I18n.t(TUT_STEPS[i][0])]; U.tx.text = txt
	sfx.play("pickup")

func tut_tick() -> void:
	tut.t = float(tut.t) + get_process_delta_time()
	if sim.countdown > 0 or me == null: return
	if int(tut.step) < 0: tut.x0 = me.x; tut.y0 = me.y; tut_set(0); return
	match int(tut.step):
		0: if Vector2(me.x - float(tut.x0), me.y - float(tut.y0)).length() > 240: tut_set(1)
		1: if sim.tut_hits >= 2: tut_set(2)
		2: if me.painted - int(tut.paint0) > 60: tut_set(3)
		3: if me.z > 20 and not me.foot: tut_set(4)
		4: if me.skill_uses < int(tut.sk0): tut_set(5)
		5:
			if not tut.sp_sent: tut.sp_sent = true; me.sp = float(data.mechs[me.weapon].spNeed)
			elif tut.sp_full and me.sp < 1.0: tut_set(6)
			if me.sp >= float(data.mechs[me.weapon].spNeed): tut.sp_full = true
		6:
			if float(tut.wr_t) < 0: tut.wr_t = float(tut.t) + 1.2
			elif float(tut.wr_t) > 0 and float(tut.t) >= float(tut.wr_t) and not me.foot and not tut.was_foot: sim.wreck(me, null); tut.wr_t = 0.0001
			if me.foot: tut.was_foot = true
			elif tut.was_foot: tut_set(7)
		_:
			if float(tut.t) - float(tut.done_t) > 2.4: tut_end(true)

func tut_end(done: bool) -> void:
	profile.o.tutDone = true; profile.save()
	tut_close()
	back_to_lobby()
	if int(profile.o.tut) == 0: lobby.welcome()
	elif done: lobby.toast("教程完成！")

func tut_close() -> void:
	tut = {}
	if tut_ui != null: tut_ui.queue_free(); tut_ui = null

# ================= 手柄（Xbox 布局；PS 手柄同位置）=================
#   左摇杆移动 • 右摇杆瞄准 • RT 开火 • A 跳 • B 滚轮（按住）• X 技能 • Y 大招 • LB 超载 • 十字键下 搜索 • 十字键上 背包 • Start 暂停
var pad_active := false
var pad_aim := Vector2.RIGHT
const PAD_DEAD := 0.22

func pad_vec(ax: JoyAxis, ay: JoyAxis) -> Vector2:
	var v := Vector2(Input.get_joy_axis(0, ax), Input.get_joy_axis(0, ay))
	return Vector2.ZERO if v.length() < PAD_DEAD else v

func pad_tick(inp: Dictionary) -> bool:
	if Input.get_connected_joypads().is_empty(): return false
	var mv := pad_vec(JOY_AXIS_LEFT_X, JOY_AXIS_LEFT_Y)
	var av := pad_vec(JOY_AXIS_RIGHT_X, JOY_AXIS_RIGHT_Y)
	var rt := Input.get_joy_axis(0, JOY_AXIS_TRIGGER_RIGHT)
	var any := mv != Vector2.ZERO or av != Vector2.ZERO or rt > 0.3 or Input.is_joy_button_pressed(0, JOY_BUTTON_A) or Input.is_joy_button_pressed(0, JOY_BUTTON_B)
	if any: pad_active = true
	if not pad_active: return false
	if Input.get_last_mouse_velocity().length() > 200: pad_active = false; return false   # 动了鼠标就切回键鼠
	inp.mx = mv.x; inp.my = mv.y
	if av != Vector2.ZERO: pad_aim = av
	elif mv != Vector2.ZERO: pad_aim = mv
	inp.a = atan2(pad_aim.y, pad_aim.x)
	var rng: float = float(data.mechs[me.weapon].get("range2", 300.0))
	inp.ad = clampf(av.length(), 0.35, 1.0) * rng if av != Vector2.ZERO else rng * 0.7
	inp.pt = 0.0
	inp.f = rt > 0.4
	inp.w = Input.is_joy_button_pressed(0, JOY_BUTTON_B)
	inp.j = Input.is_joy_button_pressed(0, JOY_BUTTON_A)
	return true

func pad_button(ev: InputEventJoypadButton) -> void:
	pad_active = true
	if ev.button_index == JOY_BUTTON_START:
		if state == "play": toggle_pause()
		return
	if state != "play" or me == null or paused: return
	match ev.button_index:
		JOY_BUTTON_X: me.inp.gq += 1
		JOY_BUTTON_Y: me.inp.qq += 1
		JOY_BUTTON_LEFT_SHOULDER: me.inp.oq += 1
		JOY_BUTTON_DPAD_DOWN: if sim.loot: loot_interact()
		JOY_BUTTON_DPAD_UP: if sim.loot: bag_open = not bag_open; loot_ui_t = 0
		JOY_BUTTON_DPAD_LEFT: if sim.loot: use_quick("repair" if me.hp < me.max_hp * 0.4 else "stim")
		JOY_BUTTON_BACK: hud.big_map = not hud.big_map

# ================= 皮肤专属进场（史诗以上的驾驶员皮肤）=================
const ENTRANCE_COL := {"hammer": "#ffd35e", "drop": "#e0a030", "flag": "#ff5a36", "warbanner": "#ffd35e", "dj": "#ff3ea5", "idol": "#ff8ad8", "surf": "#1fd6ee",
	"ice": "#bff6ff", "academy": "#8a6bff", "moon": "#f4e6c8", "sealer": "#8a6bff", "wraith": "#ff2d4b"}

func play_entrance(target: Node3D, type: String) -> void:
	if not is_instance_valid(target): return
	var col := Color(str(ENTRANCE_COL.get(type, "#ffffff")))
	var base := Vector3.ZERO
	var tw := target.create_tween()
	var land := func(big: bool): if is_instance_valid(target): land_fx(target.global_position, col, big)
	match type:
		"hammer":   # 蹲下蓄力 → 跳起 → 砸地出冲击波
			tw.tween_property(target, "scale", Vector3(1.1, 0.8, 1.1), 0.3)
			tw.tween_property(target, "scale", Vector3.ONE, 0.1)
			tw.tween_property(target, "position", base + Vector3(0, 4.5, 0), 0.35).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
			tw.tween_property(target, "position", base, 0.22).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN)
			tw.tween_callback(land.bind(true))
		"drop":   # 高空空降
			target.position = base + Vector3(0, 12, 0)
			tw.tween_property(target, "position", base, 0.7).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN)
			tw.tween_callback(land.bind(true))
			tw.tween_property(target, "scale", Vector3(1.08, 0.88, 1.08), 0.1); tw.tween_property(target, "scale", Vector3.ONE, 0.2)
		"flag", "warbanner":   # 走进来插旗
			target.position = base + Vector3(-7, 0, 0)
			tw.tween_property(target, "position", base, 0.8).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_OUT)
			tw.tween_callback(land.bind(type == "warbanner"))
		"ice", "sealer", "wraith":   # 先爆一团光，再从光里长出来
			target.scale = Vector3.ONE * 0.05
			tw.tween_callback(land.bind(true))
			tw.tween_property(target, "scale", Vector3.ONE, 0.6).set_trans(Tween.TRANS_ELASTIC).set_ease(Tween.EASE_OUT)
		_:   # dj / idol / surf / academy / moon：转着出场
			target.scale = Vector3.ONE * 0.1; target.rotation.y = -TAU
			tw.tween_property(target, "scale", Vector3.ONE, 0.6).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
			tw.parallel().tween_property(target, "rotation:y", 0.0, 0.6)
			tw.tween_callback(land.bind(false))

func land_fx(pos: Vector3, col: Color, big: bool) -> void:
	ring(pos + Vector3(0, 0.1, 0), 3.2 if big else 2.2, col, 0.6)
	ring(pos + Vector3(0, 0.1, 0), 2.0 if big else 1.4, Color.WHITE, 0.45)
	burst(pos + Vector3(0, 0.8, 0), col, 30 if big else 16, 7.0 if big else 4.5, 0.2, 0.7)
	flash_light(pos + Vector3(0, 2, 0), col, 5.0 if big else 3.0, 10.0, 0.3)
	if big: beam(pos, pos + Vector3(0, 9, 0), col, 0.9, 0.5)
	sfx.play("boom", -6 if big else -12)

# 开局倒数时：穿着史诗以上皮肤的玩家脚下爆一下（史诗：爆发特效；传说：再加光柱）
func entrance_tick() -> void:
	if sim == null or sim.countdown <= 0 or sim.countdown > 2.6 or sim.get_meta("ent_done", false): return
	sim.set_meta("ent_done", true)
	for q in sim.players:
		if q.npc: continue
		var SK = profile.skin(str(q.looks.get("pskin", ""))) if q != me else profile.skin(profile.pilot_skin(q.pilot))
		if SK == null or int(SK.rare) < 3: continue
		var col := Color(str(ENTRANCE_COL.get(str(SK.get("entrance", "")), data.rare[int(SK.rare)].c)))
		land_fx(Vector3(q.x * K, q.z * K, q.y * K), col, int(SK.rare) >= 4)

# ================= 对局聊天（Enter 打字，Tab 切换 队伍 / 全部；AI 会按性格接话）=================
var chat_ui: VBoxContainer
var chat_lines: Array = []    # [RichTextLabel, time]
var chat_open := false
var chat_ch := 0
var chat_edit: LineEdit
var chat_chl: Label

func chat_layer() -> Node: return hud.get_parent()

func chat_clear() -> void:
	if chat_ui == null:
		chat_ui = VBoxContainer.new(); chat_ui.add_theme_constant_override("separation", 2); chat_ui.mouse_filter = Control.MOUSE_FILTER_IGNORE; chat_ui.theme = theme_ui
		chat_layer().add_child(chat_ui)
	for c in chat_ui.get_children(): c.queue_free()
	chat_lines.clear()
	close_chat()

func chat_add(p, text: String, ch: int, remote := false) -> void:
	if chat_ui == null or text.strip_edges() == "": return
	if p != null and ch == 1 and me != null and p.team != me.team: return   # 对方的队伍频道看不到
	var s := get_viewport().get_visible_rect().size
	chat_ui.position = Vector2(16, s.y - 360); chat_ui.size = Vector2(460, 0)
	var r := RichTextLabel.new(); r.bbcode_enabled = true; r.fit_content = true; r.scroll_active = false; r.custom_minimum_size = Vector2(460, 0); r.mouse_filter = Control.MOUSE_FILTER_IGNORE
	r.add_theme_font_size_override("normal_font_size", 15); r.add_theme_constant_override("outline_size", 5); r.add_theme_color_override("font_outline_color", Color(0, 0, 0, 0.85))
	var who := I18n.t("系统") if p == null else str(p.name)
	var col: Color = Color("#ffe14d") if p == me else (team_col[p.team] if p != null else Color("#9a96b8"))
	var chn := ("[color=#7af0ff]%s[/color] " % I18n.t("[队伍]")) if ch == 1 else ("[color=#c8c4e8]%s[/color] " % I18n.t("[全部]"))
	r.text = chn + "[color=#%s]%s[/color]：%s" % [col.to_html(false), who.replace("[", "("), text.replace("[", "(")]
	chat_ui.add_child(r)
	chat_lines.append([r, Time.get_ticks_msec()])
	while chat_lines.size() > 7: var old = chat_lines.pop_front(); old[0].queue_free()
	if p == me and not remote: net.send_chat(me.id, text, ch)

func chat_tick() -> void:
	var now := Time.get_ticks_msec()
	for l in chat_lines:
		var age := (now - int(l[1])) / 1000.0
		l[0].modulate.a = 1.0 if chat_open else clampf(1.0 - (age - 8.0) / 1.5, 0.0, 1.0)

func open_chat() -> void:
	if chat_open or state != "play" or me == null: return
	chat_open = true
	var s := get_viewport().get_visible_rect().size
	var box := HBoxContainer.new(); box.name = "chatbox"; box.position = Vector2(16, s.y - 110); box.theme = theme_ui; chat_layer().add_child(box)
	chat_chl = UIKit.label("[全部]" if chat_ch == 0 else "[队伍]", 16, Color("#7af0ff"), 4); box.add_child(chat_chl)
	chat_edit = LineEdit.new(); chat_edit.custom_minimum_size = Vector2(380, 38); chat_edit.max_length = 60; chat_edit.placeholder_text = I18n.t("Enter 发送 • Tab 切换频道 • Esc 取消"); box.add_child(chat_edit)
	chat_edit.text_submitted.connect(func(t):
		var tx: String = str(t).strip_edges()
		if tx != "":
			chat_add(me, tx, chat_ch)
			if botchat != null: botchat.react(me, tx, chat_ch, 0)
		close_chat())
	chat_edit.gui_input.connect(func(ev):
		if ev is InputEventKey and ev.pressed:
			if ev.physical_keycode == KEY_ESCAPE: close_chat(); get_viewport().set_input_as_handled()
			elif ev.physical_keycode == KEY_TAB: chat_ch = 1 - chat_ch; chat_chl.text = I18n.t("[全部]" if chat_ch == 0 else "[队伍]"); get_viewport().set_input_as_handled())
	chat_edit.grab_focus()

func close_chat() -> void:
	chat_open = false
	var b = chat_layer().get_node_or_null("chatbox") if hud != null else null
	if b != null: b.queue_free()

# ================= 检查更新：和 GitHub Releases 上「godot-proto」的发布时间比 =================
const RELEASE_API := "https://api.github.com/repos/Lizard0727/GraffiBots/releases/tags/godot-proto"
var build_info := {}

func load_build_info() -> Dictionary:
	if build_info.is_empty() and FileAccess.file_exists("res://data/build.json"):
		var v = JSON.parse_string(FileAccess.get_file_as_string("res://data/build.json"))
		if typeof(v) == TYPE_DICTIONARY: build_info = v
	return build_info

func check_update() -> void:
	var bi := load_build_info()
	if bi.is_empty(): return   # 开发版（不是 CI 打的包）不检查
	var hr := HTTPRequest.new(); add_child(hr)
	hr.request_completed.connect(func(result, code, _h, body):
		hr.queue_free()
		if result != HTTPRequest.RESULT_SUCCESS or code != 200: return
		var j = JSON.parse_string(body.get_string_from_utf8())
		if typeof(j) != TYPE_DICTIONARY or not j.has("assets") or j.assets.is_empty(): return
		var remote := Time.get_unix_time_from_datetime_string(str(j.assets[0].get("updated_at", "")).trim_suffix("Z"))
		var local := Time.get_unix_time_from_datetime_string(str(bi.get("built", "")).trim_suffix("Z"))
		if remote > local + 600: lobby.update_popup(str(j.get("html_url", "https://github.com/Lizard0727/GraffiBots/releases/tag/godot-proto")), str(j.assets[0].updated_at).substr(0, 10)))
	hr.request(RELEASE_API, ["User-Agent: GraffiBots-Godot", "Accept: application/vnd.github+json"])
