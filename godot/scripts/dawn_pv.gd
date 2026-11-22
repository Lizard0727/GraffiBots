# 涂鸦机兵 电脑版 3.1 ——「黎明之后」联动战斗影片（60 秒，实机 3D）
# 三位干员（熹微 / 尾声 / 宵）对战 Boss「黑日残影」：开场 → Boss 破土 → 干员登场 → 三段拉扯 → 绝响 → 日出
# 全部按时间轴算（同一时刻永远是同一个画面），所以既能在游戏里实时播，也能用 Godot 的录制模式导出成视频：
#   GB_PV_RENDER=1 godot --path godot --write-movie out.avi --fixed-fps 30 --resolution 1280x720
class_name DawnPV
extends Control

const LEN := 60.0
const SUN := Color("#ffcf8a")
const CYAN := Color("#7ad8ff")
const VIOLET := Color("#9a7aff")
const GOLD := Color("#ffc24a")
var g
var t := 0.0
var vp: SubViewport
var world: Node3D
var cam: Camera3D
var sun: DirectionalLight3D
var env: Environment
var A := {}             # 角色：xiwei / coda / xiao / boss → build_mech 返回的节点表
var last_pos := {}
var fx: Array = []      # [节点, 剩余, 总时长, 类型]
var done := {}
var disc: Node3D
var corona: Array = []
var tether: MeshInstance3D
var beam: MeshInstance3D
var shield: MeshInstance3D
var dome: MeshInstance3D
var debt_ring: MeshInstance3D
var blacksun: Node3D
var sun_disk: MeshInstance3D
var ov: Control
var font: Font
var en := false
var render := false
var shake := 0.0
var flash := 0.0
var spikes: Array = []
var start_t := 0.0

class Overlay extends Control:
	var pv
	func _draw() -> void: pv.draw_overlay(self)

func setup(game) -> void:
	g = game; font = g.font; en = I18n.lang == "en"
	render = OS.get_environment("GB_PV_RENDER") != ""
	if OS.get_environment("GB_PV_START") != "": t = float(OS.get_environment("GB_PV_START")); start_t = t
	set_anchors_preset(Control.PRESET_FULL_RECT); mouse_filter = Control.MOUSE_FILTER_STOP
	var bg := ColorRect.new(); bg.color = Color.BLACK; bg.set_anchors_preset(Control.PRESET_FULL_RECT); add_child(bg)
	var vc := SubViewportContainer.new(); vc.stretch = true; vc.set_anchors_preset(Control.PRESET_FULL_RECT); vc.mouse_filter = Control.MOUSE_FILTER_IGNORE; add_child(vc)
	vp = SubViewport.new(); vp.own_world_3d = true; vp.msaa_3d = Viewport.MSAA_2X if g.desktop else Viewport.MSAA_DISABLED; vc.add_child(vp)
	world = Node3D.new(); vp.add_child(world)
	ov = Overlay.new(); ov.pv = self; ov.set_anchors_preset(Control.PRESET_FULL_RECT); ov.mouse_filter = Control.MOUSE_FILTER_IGNORE; add_child(ov)
	build_world()
	g.music.play("final")

# ---------------- 场景 ----------------
func build_world() -> void:
	env = Environment.new()
	var sky := Sky.new(); var sm := ProceduralSkyMaterial.new(); sky.sky_material = sm
	sm.sky_top_color = Color("#2e2c66"); sm.sky_horizon_color = Color("#ffae78"); sm.ground_horizon_color = Color("#d49a70"); sm.ground_bottom_color = Color("#5a3a3a"); sm.sun_angle_max = 6
	env.background_mode = Environment.BG_SKY; env.sky = sky
	env.ambient_light_source = Environment.AMBIENT_SOURCE_SKY; env.ambient_light_energy = 0.4
	env.tonemap_mode = Environment.TONE_MAPPER_FILMIC; env.tonemap_exposure = 0.95; env.tonemap_white = 3.0
	env.glow_enabled = true; env.glow_intensity = 0.45; env.glow_hdr_threshold = 1.2; env.glow_bloom = 0.02
	env.fog_enabled = true; env.fog_density = 0.0035; env.fog_light_color = Color("#c88a78")
	env.adjustment_enabled = true; env.adjustment_saturation = 1.05; env.adjustment_contrast = 1.08
	var we := WorldEnvironment.new(); we.environment = env; world.add_child(we)
	sun = DirectionalLight3D.new(); sun.rotation_degrees = Vector3(-14, 180, 0); sun.light_color = SUN; sun.light_energy = 1.0; sun.shadow_enabled = true
	sun.directional_shadow_max_distance = 60; world.add_child(sun)
	var fill := DirectionalLight3D.new(); fill.rotation_degrees = Vector3(-40, 20, 0); fill.light_color = Color("#8a7aff"); fill.light_energy = 0.35; world.add_child(fill)
	cam = Camera3D.new(); cam.fov = 45; cam.far = 600; world.add_child(cam); cam.current = true
	# 沙地 + 沙丘 + 远处倒下的大楼 + 夜蚀结晶
	var fl := MeshInstance3D.new(); var pm := PlaneMesh.new(); pm.size = Vector2(800, 800); fl.mesh = pm
	var fm := ShaderMaterial.new(); fm.shader = load("res://shaders/turf.gdshader")
	var bt := Image.create(4, 4, false, Image.FORMAT_RGBA8); bt.fill(Color("#d6b088", 0.0))
	fm.set_shader_parameter("base_tex", ImageTexture.create_from_image(bt)); fm.set_shader_parameter("paint_tex", ImageTexture.create_from_image(Image.create(4, 4, false, Image.FORMAT_RGBA8)))
	fm.set_shader_parameter("grid_size", Vector2(800, 800)); fm.set_shader_parameter("pat", Vector4i(5, 5, 5, 5)); fm.set_shader_parameter("detail", Color(0, 0, 0, 0))
	fl.material_override = fm; world.add_child(fl)
	var rn := RandomNumberGenerator.new(); rn.seed = 2026
	var dune := Models.toon(Color("#d4aa80"), 0.0, 0.1, false)
	for k in 30:   # 沙丘只放在远处（镜头大多在南边，别挡住）
		var a := rn.randf_range(PI * 1.05, PI * 1.95) if k < 22 else rn.randf_range(-0.4, 0.4) + (0.0 if k % 2 == 0 else PI)
		var r := rn.randf_range(40, 110); var s := rn.randf_range(6, 18)
		Biomes.part(world, Models.mesh("sph", 1.0), Vector3(cos(a) * r, -s * 0.6, sin(a) * r - 10), dune, Vector3(s * 1.8, s, s * 1.2))
	for k in 8:
		var a := rn.randf_range(PI * 1.1, PI * 1.9); var r := rn.randf_range(70, 120); var bh := rn.randf_range(18, 34)
		var b := Biomes.box(world, Vector3(9, bh, 9), Vector3(cos(a) * r, bh / 2 - 4, sin(a) * r), Models.toon(Color("#6a4a5a"), 0.0, 0.1, false), rn.randf())
		b.rotation.z = rn.randf_range(-0.35, 0.35)
	# 横在沙里的锈蚀列车
	var rust := Biomes.wall_mat([12, "#8a5a3a", "#4a2a1a", "#a06a44"], 0.04)
	for k in 4:
		var c := Biomes.box(world, Vector3(7, 3, 3), Vector3(-16 + k * 7.6, 1.2 - k * 0.3, -18 - k * 2.6), rust, -0.35)
		c.rotation.z = (k - 1.5) * 0.06
	for k in 22:
		var a := rn.randf() * TAU; var r := rn.randf_range(9, 40)
		Biomes.crystal(world, Vector3(cos(a) * r, 0, sin(a) * r - 6), rn.randf_range(1.0, 2.8), rn)
	# 太阳（结尾升起来）
	sun_disk = MeshInstance3D.new(); sun_disk.mesh = Models.mesh("sph", 9.0); sun_disk.material_override = Models.glow(Color("#ffd8a0"), 2.2)
	sun_disk.position = Vector3(0, -12, -170); world.add_child(sun_disk)
	# 角色
	for k in [["xiwei", "halo"], ["coda", "chord"], ["xiao", "vigil"]]:
		var P: Dictionary = g.data.pilots[k[0]]
		var n := Models.build_mech(k[1], g.data.mechs[k[1]], Color(str(P.accent)), P)
		world.add_child(n.root); A[k[0]] = n
	var boss_p: Dictionary = g.data.pilots.xiao.duplicate(); boss_p.accent = "#3a2050"; boss_p.skin = "#1a1424"; boss_p.hair = "#0a0810"; boss_p.eye = "#ff3b52"
	var bn := Models.build_mech("reaper", g.data.mechs.reaper, Color("#2a1a3a"), boss_p)
	bn.root.scale = Vector3.ONE * 3.4; world.add_child(bn.root); A.boss = bn
	for k in 7:   # Boss 背上的结晶刺
		var a := -PI * 0.5 + (k - 3) * 0.32
		var sp := MeshInstance3D.new(); sp.mesh = Models.mesh("cone", 0.22, 1.6); sp.material_override = Models.glow(VIOLET, 1.4)
		sp.position = Vector3(-0.7, 1.9 + absf(k - 3) * -0.12, (k - 3) * 0.28); sp.rotation = Vector3((k - 3) * 0.25, 0, 0.5)
		bn.body.add_child(sp)
	# 黑日
	blacksun = Node3D.new(); world.add_child(blacksun); blacksun.position = Vector3(0, 15, -14); blacksun.scale = Vector3.ZERO
	Biomes.part(blacksun, Models.mesh("sph", 2.4), Vector3.ZERO, Models.toon(Color("#06040a"), 0.0, 0.9, false))
	var cor := MeshInstance3D.new(); cor.mesh = Models.mesh("torus", 2.5, 3.0); cor.material_override = Models.glow(VIOLET, 1.8, 0.9); cor.name = "cor"; blacksun.add_child(cor)
	for k in 12:
		var a := k * TAU / 12.0
		var s := MeshInstance3D.new(); s.mesh = Models.mesh("cone", 0.25, 1.8); s.material_override = Models.glow(Color("#5a3aaa"), 1.5)
		s.position = Vector3(cos(a) * 3.4, sin(a) * 3.4, 0); s.rotation = Vector3(0, 0, a - PI / 2); blacksun.add_child(s)
	# 道具
	disc = Node3D.new(); world.add_child(disc); disc.visible = false
	Models.part(disc, Models.mesh("torus", 0.45, 0.68), Models.toon(GOLD, 0.6, 0.8, false), Vector3.ZERO)
	for k in 3:
		var c := Node3D.new(); world.add_child(c); c.visible = false
		Models.part(c, Models.mesh("torus", 0.35, 0.52), Models.toon(GOLD, 0.6, 0.8, false), Vector3.ZERO); corona.append(c)
	tether = DawnFx.line_mesh(CYAN, 0.9, 0.09); world.add_child(tether); tether.visible = false
	beam = DawnFx.line_mesh(Color("#b04aff"), 0.85, 0.35); world.add_child(beam); beam.visible = false
	shield = MeshInstance3D.new(); shield.mesh = Models.mesh("cyl", 1.5, 1.8, 1.5); shield.material_override = Models.glow(VIOLET, 1.3, 0.35); world.add_child(shield); shield.visible = false
	var dm := StandardMaterial3D.new(); dm.albedo_color = Color(0.02, 0.0, 0.06, 0.6); dm.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA; dm.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED; dm.cull_mode = BaseMaterial3D.CULL_DISABLED
	dome = MeshInstance3D.new(); dome.mesh = Models.mesh("sph", 1.0); dome.material_override = dm; world.add_child(dome); dome.visible = false
	debt_ring = MeshInstance3D.new(); debt_ring.mesh = Models.mesh("torus", 1.2, 1.45); world.add_child(debt_ring); debt_ring.visible = false

# ---------------- 时间轴工具 ----------------
func sm(x: float) -> float: x = clampf(x, 0.0, 1.0); return x * x * (3.0 - 2.0 * x)
func k(a: float, b: float) -> float: return clampf((t - a) / (b - a), 0.0, 1.0)
func track(keys: Array) -> Vector3:   # [[时间, Vector3], ...]
	if t <= keys[0][0]: return keys[0][1]
	for i in keys.size() - 1:
		if t < keys[i + 1][0]:
			var u := sm((t - keys[i][0]) / (keys[i + 1][0] - keys[i][0]))
			return (keys[i][1] as Vector3).lerp(keys[i + 1][1], u)
	return keys[-1][1]
func once(key: String, at: float) -> bool:
	if at < start_t - 0.05: done[key] = true; return false   # 从中间开始播：之前的一次性特效跳过
	if t >= at and not done.has(key): done[key] = true; return true
	return false

const KX := [[0.0, Vector3(-4, 14, 4)], [10.2, Vector3(-4, 14, 4)], [10.6, Vector3(-4, 0, 4)], [18, Vector3(-6, 0, 2)], [24, Vector3(-3, 0, 1)], [31, Vector3(-7, 0, -1)],
	[33.2, Vector3(-7, 0, -1)], [34.4, Vector3(-10, 0, 3)], [39, Vector3(-6, 0, 2)], [44, Vector3(-3, 0, 0)], [52, Vector3(-2.5, 0, 4)], [57, Vector3(-2.2, 0, 6.5)]]
const KC := [[0.0, Vector3(4, 14, 5)], [12.2, Vector3(4, 14, 5)], [12.6, Vector3(4, 0, 5)], [20, Vector3(6, 0, 3)], [28, Vector3(5, 0, 0.5)], [33.2, Vector3(5, 0, 0.5)],
	[34.4, Vector3(8.5, 0, 4)], [40, Vector3(6, 0, 3)], [45, Vector3(3.5, 0, 2.5)], [52, Vector3(3, 0, 3)], [57, Vector3(0.2, 0, 7)]]
const KY := [[0.0, Vector3(0, 14, 3)], [14.2, Vector3(0, 14, 3)], [14.6, Vector3(0, 0, 3)], [18, Vector3(0, 0, 0)], [22, Vector3(1, 0, -2)], [33.2, Vector3(0, 0, -2.4)],
	[34.4, Vector3(0, 0, 2.5)], [37, Vector3(0.5, 0, -0.5)], [44, Vector3(1, 0, -2)], [52, Vector3(1.5, 0, 3)], [57, Vector3(2.4, 0, 6.6)]]
const KB := [[0.0, Vector3(0, -14, -10)], [5.0, Vector3(0, -14, -10)], [8.0, Vector3(0, 0, -10)], [16, Vector3(0, 0, -10)], [26, Vector3(-3, 0, -8.5)], [32, Vector3(1, 0, -8)],
	[33.2, Vector3(0, 0, -7)], [40, Vector3(0, 0, -9)], [46, Vector3(0, 0, -8.5)]]

# 镜头：[开始, 结束, 机位起, 机位止, 看向起, 看向止, fov]
const SHOTS := [
	[0.0, 5.0, Vector3(30, 22, 30), Vector3(14, 11, 20), Vector3(-6, 0, -30), Vector3(0, 2, -12), 50.0],
	[5.0, 10.0, Vector3(3, 1.4, 9), Vector3(5, 2.6, 11), Vector3(0, 4, -10), Vector3(0, 8, -11), 50.0],
	[10.0, 12.5, Vector3(-1.5, 2.6, 10), Vector3(-2, 2.2, 8.5), Vector3(-4, 1.6, 4), Vector3(-4, 1.6, 4), 38.0],
	[12.5, 14.5, Vector3(7.5, 2.6, 10.5), Vector3(7, 2.2, 9), Vector3(4, 1.6, 5), Vector3(4, 1.6, 5), 38.0],
	[14.5, 16.0, Vector3(1.6, 2.2, 7.6), Vector3(1.2, 2.0, 6.8), Vector3(0, 1.6, 3), Vector3(0, 1.6, 3), 38.0],
	[16.0, 24.0, Vector3(-13, 7, 8), Vector3(-6, 6, 13), Vector3(-1, 2, -3), Vector3(-1, 2, -3), 46.0],
	[24.0, 32.0, Vector3(14, 6, 6), Vector3(11, 8, -3), Vector3(1, 2, -3), Vector3(-1, 3, -5), 44.0],
	[32.0, 38.0, Vector3(0, 17, 13), Vector3(5, 12, 10), Vector3(0, 0, -3), Vector3(0, 1, -2), 48.0],
	[38.0, 45.0, Vector3(-10, 1.8, 7), Vector3(-7, 2.6, 9), Vector3(-3, 2.5, -3), Vector3(-2, 3, -5), 44.0],
	[45.0, 50.0, Vector3(6.5, 2.4, 6.5), Vector3(4.6, 2.2, 4.0), Vector3(1, 3, -8), Vector3(0, 4, -8.5), 40.0],
	[50.0, 53.0, Vector3(0, 6, 15), Vector3(0, 7, 17), Vector3(0, 7, -10), Vector3(0, 8, -10), 50.0],
	[53.0, 60.0, Vector3(0, 2.2, 12), Vector3(0, 5, 18), Vector3(0, 3, -30), Vector3(0, 6, -60), 46.0],
]

# ---------------- 每帧 ----------------
func _process(delta: float) -> void:
	t += delta
	if t >= LEN:
		finish(); return
	shake = maxf(0.0, shake - delta * 2.5); flash = maxf(0.0, flash - delta * 3.0)
	animate(delta)
	ov.queue_redraw()

func finish() -> void:
	g.music.play("lobby")
	if render: get_tree().quit(); return
	queue_free()

func _gui_input(ev: InputEvent) -> void:
	if (ev is InputEventMouseButton and ev.pressed and t > 1.0) or (ev is InputEventKey and ev.pressed and ev.keycode == KEY_ESCAPE): accept_event(); finish()

func place(id: String, p: Vector3, face_to: Vector3, delta: float) -> void:
	var n: Dictionary = A[id]
	n.root.position = p
	var d := face_to - p
	if Vector2(d.x, d.z).length() > 0.1: n.body.rotation.y = -atan2(d.z, d.x)
	var lp: Vector3 = last_pos.get(id, p)
	var spd := Vector2(p.x - lp.x, p.z - lp.z).length() / maxf(delta, 0.001)
	last_pos[id] = p
	var ph: float = n.get("ph", 0.0) + delta * spd * 3.0; n.ph = ph
	var kk := minf(1.0, spd / 4.0)
	for i in 2: n.legs[i].rotation.z = sin(ph + i * PI) * 0.7 * kk

func pos_of(id: String) -> Vector3: return A[id].root.position

func animate(delta: float) -> void:
	var bpos := track(KB)
	var shatter := k(49.8, 51.5)
	# Boss
	var bn: Dictionary = A.boss
	place("boss", bpos, (pos_of("xiao") if t > 16 else Vector3(0, 0, 10)), delta)
	if t > 39 and t < 45: bn.body.rotation.z = sin(t * 9.0) * 0.08   # 永昼里踉跄
	bn.root.scale = Vector3.ONE * 3.4 * (1.0 - shatter)
	bn.root.visible = shatter < 0.99
	# 干员
	place("xiwei", track(KX), bpos if t < 52 else Vector3(0, 0, -60), delta)
	place("coda", track(KC), bpos if t < 52 else Vector3(0, 0, -60), delta)
	place("xiao", track(KY), bpos if t < 52 else Vector3(0, 0, -60), delta)
	# 黑日
	blacksun.scale = Vector3.ONE * sm(k(8.0, 9.5)) * (1.0 + 0.12 * sin(t * 4.0) * k(32, 33)) * (1.0 - shatter)
	blacksun.visible = shatter < 0.99
	blacksun.get_node("cor").rotation = Vector3(t * 0.7, t * 1.1, 0)
	blacksun.rotation.z = t * 0.2
	# 灯光：开场暗 → 永昼金光 → 日出
	var day := k(39.0, 40.5) * (1.0 - k(44.5, 46.0)) + k(50.5, 56.0)
	sun.light_energy = 0.9 + 1.2 * day - 0.5 * k(32, 33) * (1.0 - k(38, 39))
	sun.rotation_degrees.x = lerpf(-10.0, -30.0, k(50, 58))
	env.ambient_light_energy = 0.38 + 0.4 * day
	sun_disk.position.y = lerpf(-12.0, 16.0, sm(k(51, 59)))
	# 光轮：熹微来回扔（17~24 秒，每 2 秒一次，飞到 Boss 再飞回来）
	disc.visible = false
	for st in [17.0, 19.0, 21.0, 23.0, 41.0, 42.4, 43.8]:
		if t >= st and t < st + 1.2:
			var u: float = (t - st) / 1.2
			var a: Vector3 = pos_of("xiwei") + Vector3(0, 1.4, 0); var b: Vector3 = bpos + Vector3(0, 2.4, 0)
			var side := Vector3(-(b - a).z, 0, (b - a).x).normalized() * sin(u * PI) * 1.6
			disc.position = a.lerp(b, sin(u * PI)) + side; disc.visible = true; disc.rotation.y += delta * 25.0
			if once("dh%.1f" % st, st + 0.6): burst(b, GOLD, 18, 6.0); g.sfx.play("hit", -4.0)
	# 日冕环（26~31）
	for i in 3:
		var c: Node3D = corona[i]
		c.visible = t > 26 and t < 31.5
		if c.visible:
			var ang := t * 4.0 + i * TAU / 3.0
			c.position = pos_of("xiwei") + Vector3(cos(ang) * 2.0, 1.2, sin(ang) * 2.0); c.rotation.y += delta * 20.0
	# 共鸣索（25~31）
	tether.visible = t > 25 and t < 31
	if tether.visible: DawnFx.put_line(tether, pos_of("coda") + Vector3(0, 1.4, 0), bpos + Vector3(0, 3.0, 0), 0.4 * sin(t * 40.0))
	if t > 25 and t < 31 and int(t * 10) % 3 == 0: burst(bpos + Vector3(0, 3, 0), CYAN, 3, 2.0)
	# Boss 的暗光束打宵（20.4~21.6），宵举盾，完美格挡
	beam.visible = t > 20.4 and t < 21.6
	if beam.visible: DawnFx.put_line(beam, bpos + Vector3(0, 4.2, 0), pos_of("xiao") + Vector3(0, 1.3, 0), 0.2 * sin(t * 50.0))
	shield.visible = (t > 20.2 and t < 22.0) or (t > 33.0 and t < 34.4)
	if shield.visible:
		var xp := pos_of("xiao"); var d := (bpos - xp); var a2 := atan2(d.z, d.x)
		shield.position = xp + Vector3(cos(a2) * 1.4, 1.2, sin(a2) * 1.4); shield.basis = Basis(Vector3.UP, -a2) * Basis.from_scale(Vector3(0.12, 1.0, 1.0))
		shield.material_override = Models.glow(Color.WHITE if t < 20.7 else VIOLET, 1.3, 0.4)
	# 长夜 + 夜债（34~38）
	dome.visible = t > 34.6 and t < 38.0
	if dome.visible:
		var r := 7.0 * sm(k(34.6, 35.2)); dome.position = pos_of("xiao"); dome.scale = Vector3(r, r * 0.45, r)
	debt_ring.visible = t > 33.2 and t < 37.6
	if debt_ring.visible:
		debt_ring.position = pos_of("xiao") + Vector3(0, 0.1, 0); debt_ring.rotation.y += delta * 6.0
		debt_ring.material_override = Models.glow(Color("#ff3b52") if t > 35.5 else VIOLET, 1.4, 0.8)
	# 结晶刺（18.5 / 27 / 36 秒 Boss 扫射）
	for wave in [18.5, 27.0, 35.8]:
		if once("sp%.1f" % wave, wave):
			for tgt in ["xiwei", "coda", "xiao"]:
				var s := MeshInstance3D.new(); s.mesh = Models.mesh("cone", 0.25, 1.4); s.material_override = Models.glow(VIOLET, 1.5); world.add_child(s)
				spikes.append({"n": s, "a": bpos + Vector3(0, 3.5, 0), "b": pos_of(tgt) + Vector3(0, 1.2, 0), "t0": t})
			g.sfx.play("shoot_fan", -2.0)
	for s in spikes.duplicate():
		var u: float = (t - float(s.t0)) / 0.7
		if u >= 1.0:
			burst(s.b, VIOLET, 10, 4.0); s.n.queue_free(); spikes.erase(s); continue
		s.n.position = (s.a as Vector3).lerp(s.b, u) + Vector3(0, sin(u * PI) * 1.5, 0)
		s.n.look_at(s.b, Vector3.UP); s.n.rotate_object_local(Vector3.RIGHT, -PI / 2)
	# 一次性的特效
	if once("rise", 5.0): shake = 0.6; g.sfx.play("boom", 0.0)
	if t > 5 and t < 8 and int(t * 20) % 2 == 0: burst(bpos + Vector3(randf_range(-3, 3), 0.3, randf_range(-3, 3)), Color("#c8a07a"), 4, 4.0, 0.3)
	if once("roar", 8.2): ring(bpos, 14.0, VIOLET, 0.9); shake = 0.8; g.sfx.play("super", 0.0)
	for k2 in [["xiwei", 10.6], ["coda", 12.6], ["xiao", 14.6]]:
		if once("land" + k2[0], k2[1]):
			var c := Color(str(g.data.pilots[k2[0]].accent))
			ring(pos_of(k2[0]), 4.0, c, 0.6); burst(pos_of(k2[0]) + Vector3(0, 0.4, 0), c, 26, 7.0); shake = 0.45; g.sfx.play("land", 0.0)
	if once("parry", 20.6): burst(pos_of("xiao") + Vector3(0, 1.5, 0), Color.WHITE, 30, 8.0); flash = 0.35; g.sfx.play("shield", 2.0); shake = 0.4
	if once("counter", 22.0): ring(bpos + Vector3(0, 1, 0), 6.0, Color.WHITE, 0.4); burst(bpos + Vector3(0, 3, 0), VIOLET.lightened(0.4), 30, 9.0); g.sfx.play("slash", 2.0); shake = 0.5
	if once("echo", 30.6): ring(bpos + Vector3(0, 1, 0), 9.0, CYAN, 0.7); burst(bpos + Vector3(0, 3, 0), CYAN, 40, 10.0); g.sfx.play("hit", 2.0); shake = 0.5
	if once("enrage", 32.0): ring(blacksun.position - Vector3(0, 10, 0), 18.0, VIOLET, 1.0); g.sfx.play("super", 0.0)
	if once("slam", 33.2): ring(bpos, 16.0, Color("#b04aff"), 0.8); burst(bpos + Vector3(0, 0.5, 0), Color("#c8a07a"), 50, 12.0, 0.35); shake = 1.0; g.sfx.play("boom", 3.0)
	if once("settle", 37.5): ring(pos_of("xiao"), 9.0, VIOLET, 0.6); burst(pos_of("xiao") + Vector3(0, 1, 0), VIOLET, 50, 12.0); flash = 0.25; shake = 0.7; g.sfx.play("boom", 2.0)
	if once("eternal", 39.0): ring(pos_of("xiwei"), 12.0, GOLD, 1.0); g.sfx.play("super", 0.0)
	if t > 39 and t < 45 and int(t * 15) % 2 == 0: burst(pos_of("xiwei") + Vector3(randf_range(-2, 2), 3.0, randf_range(-2, 2)), GOLD, 3, 2.0, 0.15)
	if once("fin", 46.4): g.sfx.play("super", 2.0)
	if once("shatter", 49.8):
		flash = 1.0; shake = 1.2; g.sfx.play("wreck", 4.0)
		for i in 6: burst(blacksun.position + Vector3(randf_range(-3, 3), randf_range(-3, 3), 0), GOLD, 40, 14.0, 0.3, 1.6)
		burst(bpos + Vector3(0, 3, 0), VIOLET, 60, 12.0, 0.3, 1.2)
	if once("sunrise", 53.0): g.sfx.play("win", 0.0)
	update_fx(delta)
	# 镜头
	for s in SHOTS:
		if t >= s[0] and t < s[1]:
			var u := sm((t - s[0]) / (s[1] - s[0]))
			cam.position = (s[2] as Vector3).lerp(s[3], u); cam.look_at((s[4] as Vector3).lerp(s[5], u), Vector3.UP); cam.fov = s[6]
			break
	if t > 46 and t < 49.8: cam.fov -= 6.0 * k(46, 49.8)   # 绝响前推近
	if shake > 0:
		var q := shake * shake * 0.5
		cam.position += Vector3(randf_range(-q, q), randf_range(-q, q), randf_range(-q, q))

# ---------------- 特效 ----------------
func burst(pos: Vector3, c: Color, amount := 10, speed := 4.0, size := 0.18, life := 0.6) -> void:
	var ps := CPUParticles3D.new()
	ps.one_shot = true; ps.emitting = true; ps.amount = amount; ps.lifetime = life; ps.explosiveness = 0.95
	ps.direction = Vector3.UP; ps.spread = 80; ps.initial_velocity_min = speed * 0.4; ps.initial_velocity_max = speed
	ps.gravity = Vector3(0, -9, 0); ps.scale_amount_min = 0.5; ps.scale_amount_max = 1.3
	var crv := Curve.new(); crv.add_point(Vector2(0, 1)); crv.add_point(Vector2(1, 0)); ps.scale_amount_curve = crv
	ps.mesh = Models.mesh("sph", size); ps.material_override = Models.glow(c, 1.7)
	ps.position = pos; world.add_child(ps)
	fx.append([ps, life + 0.5, life + 0.5, "ps"])

func ring(pos: Vector3, r: float, c: Color, life := 0.6) -> void:
	var mi := MeshInstance3D.new(); mi.mesh = Models.mesh("torus", 0.96, 1.0); mi.material_override = Models.glow(c, 2.0, 0.85)
	mi.position = pos + Vector3(0, 0.2, 0); mi.scale = Vector3.ONE * 0.1; world.add_child(mi)
	fx.append([mi, life, life, "ring", r])

func update_fx(delta: float) -> void:
	for f in fx.duplicate():
		f[1] -= delta
		if f[1] <= 0: f[0].queue_free(); fx.erase(f); continue
		if f[3] == "ring":
			var u: float = 1.0 - f[1] / f[2]
			var rr := lerpf(0.2, float(f[4]), 1.0 - pow(1.0 - u, 3.0))
			f[0].scale = Vector3(rr, minf(rr, 3.0), rr)
			f[0].material_override = Models.glow(f[0].material_override.albedo_color.lightened(0.0), 1.0, 0.85 * (1.0 - u)) if false else f[0].material_override

# ---------------- 2D：字幕、名牌、标题、绝响、白闪、黑边 ----------------
func T(zh: String, e: String) -> String: return e if en else zh

func draw_overlay(c: Control) -> void:
	var S := c.get_viewport_rect().size
	var bar := S.y * 0.1
	# 绝响：五根共鸣弦 + 大字（46.5~49.8）
	if t > 46.4 and t < 49.9:
		var a := k(46.4, 46.8)
		c.draw_rect(Rect2(Vector2.ZERO, S), Color(0.0, 0.02, 0.06, 0.55 * a))
		var src := Vector2(S.x * 0.78, S.y * 0.62); var dst := Vector2(S.x * 0.42, S.y * 0.36)
		for s in 5:
			var pts := PackedVector2Array()
			var n := int(40 * k(46.6, 47.6))
			for i in n + 1:
				var u := float(i) / 40.0
				var q := src.lerp(dst, u) + Vector2(0, sin(u * PI) * (s - 2) * 60.0 + sin(u * 22.0 + t * 30.0 + s) * 5.0)
				pts.append(q)
			if pts.size() >= 2:
				c.draw_polyline(pts, Color(CYAN, 0.3 * a), 8.0, true); c.draw_polyline(pts, Color(0.9, 0.98, 1.0, 0.9 * a), 2.0, true)
		if t > 48.0:
			var tk := 1.0 - pow(1.0 - k(48.0, 48.15), 3.0)
			var sz := int(lerpf(360.0, 180.0, tk)); var txt := T("绝响", "FINAL NOTE")
			var tw := font.get_string_size(txt, HORIZONTAL_ALIGNMENT_LEFT, -1, sz).x
			var p := Vector2(S.x * 0.5 - tw * 0.5, S.y * 0.55)
			c.draw_string(font, p + Vector2(-8, 3), txt, HORIZONTAL_ALIGNMENT_LEFT, -1, sz, Color(0.2, 0.9, 1.0, 0.5 * tk))
			c.draw_string(font, p + Vector2(8, -3), txt, HORIZONTAL_ALIGNMENT_LEFT, -1, sz, Color(1.0, 0.25, 0.4, 0.45 * tk))
			c.draw_string(font, p, txt, HORIZONTAL_ALIGNMENT_LEFT, -1, sz, Color(1, 1, 1, tk))
	# 名牌（干员登场）
	for nm in [["xiwei", 10.6, 12.5], ["coda", 12.6, 14.5], ["xiao", 14.6, 16.0]]:
		if t > nm[1] and t < nm[2]:
			var P: Dictionary = g.data.pilots[nm[0]]
			var a := k(nm[1], nm[1] + 0.25) * (1.0 - k(nm[2] - 0.25, nm[2]))
			var x := lerpf(-420.0, S.x * 0.06, 1.0 - pow(1.0 - k(nm[1], nm[1] + 0.3), 3.0))
			var acc := Color(str(P.accent))
			c.draw_rect(Rect2(x - 20, S.y * 0.6, 520, 6), Color(acc, a))
			c.draw_string(font, Vector2(x, S.y * 0.6 - 12), I18n.t(str(P.name)), HORIZONTAL_ALIGNMENT_LEFT, -1, 92, Color(1, 1, 1, a))
			c.draw_string(font, Vector2(x, S.y * 0.6 + 42), I18n.t(str(P.title)), HORIZONTAL_ALIGNMENT_LEFT, -1, 26, Color(acc.lightened(0.3), a))
			c.draw_string(font, Vector2(x, S.y * 0.6 + 76), I18n.t(str(P.passive.name)) + "  /  " + I18n.t(str(g.data.mechs[str(P.weapon)].name)), HORIZONTAL_ALIGNMENT_LEFT, -1, 20, Color(1, 1, 1, 0.75 * a))
	# 字幕
	var subs := [[0.6, 4.6, "长夜持续了七年。直到那个清晨——", "The Long Night lasted seven years. Until that morning —"],
		[5.8, 9.8, "黑日残影 · 长夜留下的最后一颗心脏", "Shadow of the Black Sun · the last heart of the Long Night"],
		[16.5, 20.0, "熹微：「光会回来的——我亲眼见过一次。」", "Glimmer: \"The light comes back — I've seen it once.\""],
		[24.5, 28.0, "尾声：「这一段，我替你记住了。」", "Coda: \"This part, I'll remember for you.\""],
		[32.4, 36.0, "宵：「这一夜，算在我账上。」", "Xiao: \"Put this night on my tab.\""],
		[44.6, 46.4, "余韵 · 五重", "Resonance × 5"]]
	for sb in subs:
		if t > sb[0] and t < sb[1]:
			var a := k(sb[0], sb[0] + 0.3) * (1.0 - k(sb[1] - 0.3, sb[1]))
			var s: String = sb[3] if en else sb[2]
			var w := font.get_string_size(s, HORIZONTAL_ALIGNMENT_LEFT, -1, 28).x
			c.draw_string(font, Vector2(S.x * 0.5 - w * 0.5 + 2, S.y - bar - 22 + 2), s, HORIZONTAL_ALIGNMENT_LEFT, -1, 28, Color(0, 0, 0, 0.6 * a))
			c.draw_string(font, Vector2(S.x * 0.5 - w * 0.5, S.y - bar - 22), s, HORIZONTAL_ALIGNMENT_LEFT, -1, 28, Color(1, 1, 1, a))
	# 结尾标题
	if t > 54.0:
		var a := k(54.0, 55.0) * (1.0 - k(59.4, 60.0))
		var t1 := T("黎明之后", "AFTER DAWN")
		var w1 := font.get_string_size(t1, HORIZONTAL_ALIGNMENT_LEFT, -1, 120).x
		c.draw_string(font, Vector2(S.x * 0.5 - w1 * 0.5, S.y * 0.42), t1, HORIZONTAL_ALIGNMENT_LEFT, -1, 120, Color(1, 0.97, 0.9, a))
		var t2 := T("AFTER DAWN", "黎明之后")
		var w2 := font.get_string_size(t2, HORIZONTAL_ALIGNMENT_LEFT, -1, 30).x
		c.draw_string(font, Vector2(S.x * 0.5 - w2 * 0.5, S.y * 0.42 + 48), t2, HORIZONTAL_ALIGNMENT_LEFT, -1, 30, Color(SUN, a))
		var t3 := T("涂鸦机兵 × 黎明之后  联动活动现已开启", "GraffiBots × After Dawn — collab event live now")
		var w3 := font.get_string_size(t3, HORIZONTAL_ALIGNMENT_LEFT, -1, 24).x
		c.draw_string(font, Vector2(S.x * 0.5 - w3 * 0.5, S.y * 0.42 + 96), t3, HORIZONTAL_ALIGNMENT_LEFT, -1, 24, Color(1, 1, 1, 0.85 * a))
	# 开场淡入 / 白闪 / 黑边
	var fade := 1.0 - k(0.0, 1.2) + k(59.2, 60.0)
	if fade > 0: c.draw_rect(Rect2(Vector2.ZERO, S), Color(0, 0, 0, clampf(fade, 0, 1)))
	if flash > 0: c.draw_rect(Rect2(Vector2.ZERO, S), Color(1, 1, 1, clampf(flash, 0, 1) * 0.85))
	c.draw_rect(Rect2(0, 0, S.x, bar), Color.BLACK); c.draw_rect(Rect2(0, S.y - bar, S.x, bar), Color.BLACK)
	if not render:
		var hint := I18n.t("点击 / Esc 跳过")
		c.draw_string(font, Vector2(S.x - 200, bar - 16), hint, HORIZONTAL_ALIGNMENT_LEFT, -1, 16, Color(1, 1, 1, 0.5))
	c.draw_string(font, Vector2(24, bar - 16), "GRAFFI•BOTS × AFTER DAWN", HORIZONTAL_ALIGNMENT_LEFT, -1, 16, Color(1, 1, 1, 0.45))
