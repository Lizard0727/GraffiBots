# 涂鸦机兵 电脑版 3.1 —— 地图画面主题
# 每张地图一个主题：地面花纹、墙 / 高台侧面材质、草丛样子、场外远景、灯光、天气和小摆设
# 地图布局（碰撞）还是 game.json 里的数据，这里只管「长什么样」，不会改变对战
class_name Biomes
extends RefCounted

const K := 1.0 / 16.0

# pat：地面 / 高台 / 楼梯 / 墙顶 用哪种花纹（见 shaders/turf.gdshader 的 pattern()）
# wall / thin / side：大墙、细长的墙（篱笆 / 隔板）、高台侧面 —— [花纹, 主色, 副色, 压顶色]（见 shaders/wall.gdshader）
const B := {
	"rail": {
		"wall_h": 104, "sky": ["#6f9fd6", "#ffd3a3"], "sun": ["#ffe2bd", 1.25, -38, 28], "fill": ["#9db8ff", 0.25], "amb": 0.5, "fog": ["#e9c9a8", 0.003],
		"ground": ["#7a7065", "#6c635a"], "plat": "#bdb5a8", "stair": "#a9a196", "top": "#5e6e7c", "pat": [10, 9, 9, 8], "detail": ["#3a332e", 0.8],
		"wall": [8, "#3d6f8f", "#d9cdb6", "#56636e"], "thin": [8, "#9a4a32", "#e3d6bd", "#56636e"], "side": [0, "#b3ab9e", "#8f877c", "#e8c84a"],
		"bush": "grass", "bushc": "#8a9a4a", "back": "yard", "fx": "dust", "fxc": "#ffe9c8", "mini": "#6f675e",
	},
	"rooftop": {
		"wall_h": 130, "sky": ["#3e3d7a", "#ff9c5e"], "sun": ["#ffb478", 1.15, -26, 210], "fill": ["#7f8cff", 0.3], "amb": 0.45, "fog": ["#b0708a", 0.004],
		"ground": ["#4c4a55", "#45434d"], "plat": "#a1958b", "stair": "#8c8279", "top": "#6d635c", "pat": [7, 10, 9, 10], "detail": ["#2a2830", 0.35],
		"wall": [1, "#a65a40", "#d8c8b8", "#e6dbd0"], "thin": [0, "#c4b8ac", "#a0958a", "#e6dbd0"], "side": [1, "#b8674a", "#e0d0c0", "#efe6dc"],
		"bush": "pot", "bushc": "#4f9a52", "back": "city", "fx": "", "mini": "#4a4853", "props": "rooftop",
	},
	"plaza": {
		"wall_h": 120, "sky": ["#5aa6ea", "#d6ecff"], "sun": ["#fff6e8", 1.35, -60, 35], "fill": ["#a8c8ff", 0.3], "amb": 0.55, "fog": ["#d6e6f2", 0.0025],
		"ground": ["#a68e72", "#9a8468"], "plat": "#d6c8ae", "stair": "#c9b99e", "top": "#8a6b55", "pat": [3, 1, 1, 9], "detail": ["#5a4a3a", 0.45],
		"wall": [9, "#cbb99b", "#8f7e66", "#e9dcc4"], "thin": [9, "#cbb99b", "#8f7e66", "#e9dcc4"], "side": [9, "#d8c9ac", "#a29076", "#f2e8d4"],
		"bush": "shrub", "bushc": "#4f9a48", "back": "oldtown", "fx": "", "mini": "#b0977a", "props": "plaza",
	},
	"garden": {
		"wall_h": 92, "sky": ["#7fb8ec", "#ffe2ee"], "sun": ["#fff0e6", 1.25, -50, 140], "fill": ["#ffb8d8", 0.25], "amb": 0.55, "fog": ["#f6dbe6", 0.003],
		"ground": ["#6f9a4e", "#64904a"], "plat": "#a87448", "stair": "#9a6a42", "top": "#7d7a72", "pat": [4, 2, 2, 3], "detail": ["#3a2a1a", 0.8],
		"wall": [3, "#8d8a80", "#5f5d56", "#9fa38a"], "thin": [5, "#cdb56c", "#7f6a35", "#a88f4a"], "side": [5, "#9c6a42", "#6a4528", "#b88660"],
		"bush": "sakura", "bushc": "#ff9ccf", "back": "forest_pink", "fx": "petals", "fxc": "#ffc2df", "mini": "#68934b", "props": "garden",
	},
	"docks": {
		"wall_h": 112, "sky": ["#7aa3bd", "#dbe7ee"], "sun": ["#f2f6ff", 1.1, -48, 300], "fill": ["#bcd8ff", 0.3], "amb": 0.55, "fog": ["#c8d8e0", 0.004],
		"ground": ["#7c7e79", "#747671"], "plat": "#7c7e79", "stair": "#7a7c76", "top": "#7d7f7a", "pat": [9, 8, 8, 8], "detail": ["#4a4c48", 0.6],
		"wall": [2, "#c04030", "#203040", "#c8c8c8"], "thin": [2, "#c04030", "#203040", "#c8c8c8"], "side": [2, "#2a6a9a", "#203040", "#d8d8d8"],
		"bush": "tarp", "bushc": "#4a6a3a", "back": "sea", "fx": "", "mini": "#8a8c87",
	},
	"snow": {
		"wall_h": 100, "sky": ["#3c5888", "#b8cfee"], "sun": ["#e6efff", 0.95, -30, 60], "fill": ["#8fb0ff", 0.35], "amb": 0.7, "fog": ["#c8d8ee", 0.006],
		"ground": ["#e9eff6", "#dfe7f1"], "plat": "#f4f8fc", "stair": "#dfe8f2", "top": "#f6faff", "pat": [6, 6, 6, 6], "detail": ["#9aa8c0", 0.3],
		"wall": [7, "#a6c8e6", "#5f82a6", "#f6faff"], "thin": [3, "#7f8a96", "#566270", "#f6faff"], "side": [3, "#8d98a6", "#5f6a78", "#f6faff"],
		"bush": "pine", "bushc": "#2f5a44", "back": "mountain", "fx": "snow", "fxc": "#ffffff", "mini": "#dce5ef", "cap_w": 0.18,
	},
	"lava": {
		"wall_h": 110, "sky": ["#1e1616", "#6a3424"], "sun": ["#ffc090", 0.95, -40, 200], "fill": ["#ff8050", 0.18], "amb": 0.45, "fog": ["#3a2018", 0.004],
		"ground": ["#4a403a", "#443a34"], "plat": "#6a5a50", "stair": "#544538", "top": "#4a3b33", "pat": [11, 11, 9, 11], "detail": ["#1a1210", 0.9], "glow": 0.45,
		"wall": [3, "#5a463c", "#2e221d", "#6e584a"], "thin": [3, "#5a463c", "#2e221d", "#6e584a"], "side": [3, "#665046", "#3a2c25", "#7a6252"],
		"bush": "deadbush", "bushc": "#5a4a3a", "back": "volcano", "fx": "embers", "fxc": "#ff9a40", "mini": "#3e332e",
	},
	"civic": {
		"wall_h": 112, "sky": ["#8ea6c2", "#e4e8ee"], "sun": ["#f4f6fa", 1.1, -55, 320], "fill": ["#c8d4ff", 0.35], "amb": 0.6, "fog": ["#d8dee6", 0.003],
		"ground": ["#bfbab0", "#b5b0a6"], "plat": "#8e949c", "stair": "#80868e", "top": "#c8c4bc", "pat": [12, 9, 9, 9], "detail": ["#8a8680", 0.5], "gloss": 0.35,
		"wall": [0, "#d4d0c8", "#a4a29c", "#4a90d0"], "thin": [0, "#d4d0c8", "#b4b2ac", "#4a90d0"], "side": [0, "#a8aeb6", "#80868e", "#d8dce2"],
		"bush": "hedge", "bushc": "#3f8a46", "back": "towers_gray", "fx": "", "mini": "#d0cdc6", "props": "civic",
	},
	"ruins": {
		"wall_h": 108, "sky": ["#6f8a7c", "#d8dfcc"], "sun": ["#fff0d0", 1.0, -45, 120], "fill": ["#b8d0a0", 0.3], "amb": 0.55, "fog": ["#a8b498", 0.004],
		"ground": ["#8a8a80", "#7e7f74"], "plat": "#9c9a8e", "stair": "#8a887c", "top": "#76786c", "pat": [13, 13, 9, 13], "detail": ["#4a4a40", 0.7],
		"wall": [0, "#9a978a", "#6a675c", "#7a8a5a"], "thin": [1, "#8a6a58", "#5a4a40", "#7a8a5a"], "side": [0, "#8f8c80", "#666358", "#7a8a5a"],
		"bush": "tallgrass", "bushc": "#9aa84a", "back": "ruins", "fx": "dust", "fxc": "#f0f0c0", "mini": "#84857a",
	},
	"metro": {
		"wall_h": 130, "sky": ["#101418", "#1a2026"], "dark": true, "sun": ["#e8f0ff", 0.55, -70, 10], "fill": ["#a0c0ff", 0.25], "amb": 0.85, "fog": ["#0a0c10", 0.008],
		"ground": ["#5a5e66", "#53575f"], "plat": "#c9c6bc", "stair": "#b6b3aa", "top": "#3a3e46", "pat": [7, 15, 15, 9], "detail": ["#2a2c30", 0.6],
		"wall": [11, "#e8ecef", "#2f7ad0", "#3a3e46"], "thin": [11, "#e8ecef", "#2f7ad0", "#3a3e46"], "side": [11, "#d8dcdf", "#2f7ad0", "#f0c800"],
		"bush": "pot", "bushc": "#3f8a50", "back": "tunnel", "fx": "", "mini": "#585c64", "lamps": ["#e8f4ff", 1.1], "cap_w": 0.14,
	},
	"corporate": {
		"wall_h": 140, "sky": ["#2c3650", "#94a4c4"], "sun": ["#dfe8ff", 1.0, -42, 240], "fill": ["#8090ff", 0.35], "amb": 0.5, "fog": ["#3a4a70", 0.004],
		"ground": ["#555a66", "#4f5460"], "plat": "#8e98a6", "stair": "#7e8896", "top": "#2a3040", "pat": [12, 8, 8, 8], "detail": ["#20242c", 0.5], "gloss": 0.6,
		"wall": [6, "#4a6a90", "#1a2230", "#c0c8d4"], "thin": [6, "#5a80a8", "#1a2230", "#c0c8d4"], "side": [0, "#9aa4b2", "#6a7482", "#d0d8e2"],
		"bush": "hedge", "bushc": "#3a7a48", "back": "towers_glass", "fx": "", "mini": "#3c4250",
	},
	"market": {
		"wall_h": 100, "sky": ["#0e0c22", "#4a2a5a"], "sun": ["#c0c8ff", 0.55, -55, 80], "fill": ["#ff9a5a", 0.35], "amb": 0.95, "fog": ["#2a1830", 0.006],
		"ground": ["#4a4550", "#45404b"], "plat": "#9a6a42", "stair": "#8a5e3a", "top": "#5a3a2a", "pat": [7, 2, 2, 2], "detail": ["#18161c", 0.6], "gloss": 0.5,
		"wall": [10, "#c8302a", "#efe6d6", "#7a4a2a"], "thin": [10, "#2a6ab0", "#efe6d6", "#7a4a2a"], "side": [5, "#8a5a38", "#5a3a22", "#c89060"],
		"bush": "pot", "bushc": "#4a8a4a", "back": "city_night", "fx": "", "mini": "#34303a", "lamps": ["#ffb060", 1.0], "props": "market",
	},
	"park": {
		"wall_h": 104, "sky": ["#5ab2f2", "#e2f4ff"], "sun": ["#fff4dc", 1.35, -55, 30], "fill": ["#ffd0f0", 0.3], "amb": 0.6, "fog": ["#e0f0ff", 0.0025],
		"ground": ["#e6caa2", "#ddc098"], "plat": "#c08a5a", "stair": "#b07e52", "top": "#f4f0e8", "pat": [14, 2, 2, 9], "detail": ["#a07a5a", 0.6],
		"wall": [10, "#ff6a8a", "#fff4e8", "#ffd23f"], "thin": [10, "#4ab0ff", "#fff4e8", "#ffd23f"], "side": [5, "#c89060", "#9a6a40", "#ffd23f"],
		"bush": "shrub", "bushc": "#56b64a", "back": "park", "fx": "", "mini": "#dcc29c", "props": "park",
	},
	"dawn": {
		"wall_h": 100, "sky": ["#3e3c7e", "#ffb47c"], "sun": ["#ffcf8a", 1.3, -16, 250], "fill": ["#8a7aff", 0.35], "amb": 0.5, "fog": ["#e8a888", 0.005],
		"ground": ["#d6b088", "#ccA67e"], "plat": "#c49a72", "stair": "#b68e68", "top": "#7a4a30", "pat": [5, 5, 9, 12], "detail": ["#8a6a4a", 0.4],
		"wall": [12, "#8a5a3a", "#4a2a1a", "#a06a44"], "thin": [12, "#8a5a3a", "#4a2a1a", "#a06a44"], "side": [3, "#c49a72", "#9a7250", "#e0c098"],
		"bush": "drygrass", "bushc": "#c8a860", "back": "dunes", "fx": "dust", "fxc": "#ffd8a0", "mini": "#cfa982", "props": "dawn",
	},
	"city": {
		"wall_h": 140, "sky": ["#7a8ea6", "#d6dce4"], "sun": ["#f2f4f8", 1.1, -50, 30], "fill": ["#b8c8ff", 0.3], "amb": 0.55, "fog": ["#c0c8d2", 0.003],
		"ground": ["#56585e", "#4e5056"], "plat": "#8a8c90", "stair": "#7a7c80", "top": "#6a6c70", "pat": [7, 9, 9, 10], "detail": ["#2a2c30", 0.6],
		"wall": [0, "#a8a49a", "#7a766c", "#c8c4ba"], "thin": [1, "#9a5a44", "#d0c4b4", "#c8c4ba"], "side": [0, "#9a9c9e", "#727476", "#d8d8d8"],
		"bush": "shrub", "bushc": "#4a8a4a", "back": "city", "fx": "", "mini": "#54565c",
	},
}

static func of(id: String) -> Dictionary:
	return B.get(id, B.city)

static func col(v) -> Color: return Color(str(v))

# 一格的底色（地面加一点大块的深浅变化）
static func cell_color(b: Dictionary, mat: int, cx: int, cy: int, bush: bool, lvl: float) -> Color:
	var c: Color
	match mat:
		0:
			var n := (sin(cx * 0.13 + cy * 0.07) + sin(cx * 0.05 - cy * 0.11)) * 0.25 + 0.5
			c = col(b.ground[0]).lerp(col(b.ground[1]), n)
			if bush: c = c.darkened(0.12)
		1: c = col(b.plat).lightened(0.06 if lvl > 60 else 0.0)
		2: c = col(b.stair)
		_: c = col(b.top)
	return c

static func wall_mat(spec: Array, cap_w := 0.08) -> ShaderMaterial:
	var m := ShaderMaterial.new(); m.shader = load("res://shaders/wall.gdshader")
	m.set_shader_parameter("style", int(spec[0])); m.set_shader_parameter("col_a", col(spec[1])); m.set_shader_parameter("col_b", col(spec[2])); m.set_shader_parameter("cap", col(spec[3]))
	m.set_shader_parameter("cap_w", cap_w)
	return m

static func toon(c, gloss := 0.3) -> ShaderMaterial: return Models.toon(col(c) if typeof(c) == TYPE_STRING else c, 0.0, gloss, false)
static func lamp(c, k := 1.25) -> StandardMaterial3D: return Models.glow(col(c) if typeof(c) == TYPE_STRING else c, k)

# ---------------- 场景布置 ----------------
# comps：墙的连通块 [{x0, y0, x1, y1, n}]（用来在墙顶放摆设）
static func decorate(g, root: Node3D, bid: String, m: Dictionary, T: PackedInt32Array, solid: PackedByteArray, bushm: PackedByteArray, comps: Array, seed: int) -> Node3D:
	var b := of(bid)
	var gw := int(m.gw); var gh := int(m.gh)
	var rn := RandomNumberGenerator.new(); rn.seed = seed * 7919 + 13
	var giant := gw * gh > 50000
	bushes(root, b, gw, gh, T, bushm, rn, giant)
	border(root, b, gw, gh)
	backdrop(root, b, gw, gh, rn)
	if not giant: props(root, b, comps, T, gw, rn)
	if g.desktop and b.has("lamps"): lamps(root, b, comps, gw, gh, T, rn)
	return weather(b)

static func bushes(root: Node3D, b: Dictionary, gw: int, gh: int, T: PackedInt32Array, bushm: PackedByteArray, rn: RandomNumberGenerator, giant: bool) -> void:
	var cells: Array = []
	var step := 3 if giant else 2
	for i in gw * gh:
		if bushm[i] == 1 and (i % gw + i / gw) % step == 0: cells.append(i)
	if cells.is_empty(): return
	var kind: String = b.bush; var bc := col(b.bushc)
	var parts: Array = []   # [mesh, color, 高度偏移, 缩放]
	match kind:
		"pine": parts = [[Models.mesh("cone", 0.75, 1.6), bc, 1.0, 1.0], [Models.mesh("cyl", 0.12, 0.5), col("#5a3e2a"), 0.2, 1.0]]
		"sakura": parts = [[Models.mesh("sph", 0.75), bc, 0.9, 1.0], [Models.mesh("cyl", 0.1, 0.8), col("#5a3a2a"), 0.35, 1.0]]
		"grass", "tallgrass", "drygrass":
			var gm := Models.mesh("cone", 0.22, 1.1 if kind == "tallgrass" else 0.8)
			parts = [[gm, bc, 0.4, 1.0], [gm, bc.darkened(0.15), 0.4, 1.0], [gm, bc.lightened(0.1), 0.4, 1.0]]
		"pot": parts = [[Models.mesh("cyl", 0.38, 0.5, 0.3), col("#b06a44"), 0.25, 1.0], [Models.mesh("sph", 0.55), bc, 0.85, 1.0]]
		"hedge": parts = [[Models.mesh("box", 0.95, 0.9, 0.95), bc, 0.45, 1.0]]
		"tarp": parts = [[Models.mesh("box", 0.9, 0.7, 0.9), col("#6a5a3a"), 0.35, 1.0], [Models.mesh("box", 1.0, 0.12, 1.0), bc, 0.74, 1.0]]
		"deadbush": parts = [[Models.mesh("cone", 0.5, 0.9), bc, 0.4, 1.0]]
		_: parts = [[Models.mesh("sph", 0.75), bc, 0.5, 1.0]]
	# 3.2.2：超大地图的草丛按 32×32 格分块（每块一个 MultiMesh，画面外的块会被剔除）、用低面数的球、不投影
	# （以前整张撤离地图 2000 多个球是一个 MultiMesh，永远画全部，加上阴影每帧 130 万个三角形）
	if giant:
		for pi in parts.size():
			if parts[pi][0] is SphereMesh:
				var lo := SphereMesh.new(); lo.radius = (parts[pi][0] as SphereMesh).radius; lo.height = lo.radius * 2; lo.radial_segments = 9; lo.rings = 5
				parts[pi][0] = lo
	var BS := 32 if giant else 1 << 20
	var groups := {}
	for i in cells:
		var key := Vector2i((i % gw) / BS, (i / gw) / BS)
		if not groups.has(key): groups[key] = []
		groups[key].append(i)
	for key in groups:
		var gcells: Array = groups[key]
		for pi in parts.size():
			var p: Array = parts[pi]
			var mm := MultiMesh.new(); mm.transform_format = MultiMesh.TRANSFORM_3D
			mm.mesh = p[0]; mm.instance_count = gcells.size()
			var off := Vector3.ZERO
			for k in gcells.size():
				var i: int = gcells[k]; var s := rn.randf_range(0.85, 1.3)
				if kind in ["grass", "tallgrass", "drygrass"]: off = Vector3(rn.randf_range(-0.4, 0.4), 0, rn.randf_range(-0.4, 0.4))
				var bas := Basis(Vector3.UP, rn.randf() * TAU).scaled(Vector3(s, s * (1.2 if kind == "pine" else 0.9), s))
				if kind in ["grass", "tallgrass", "drygrass"]: bas = bas.rotated(Vector3(1, 0, 0), rn.randf_range(-0.25, 0.25))
				mm.set_instance_transform(k, Transform3D(bas, Vector3(i % gw + 0.5, float(T[i]) * K + float(p[2]) * s, i / gw + 0.5) + off))
			var mmi := MultiMeshInstance3D.new(); mmi.multimesh = mm; mmi.material_override = toon(p[1], 0.15)
			if giant: mmi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
			root.add_child(mmi)

# 场地边缘：一圈矮墙（不发光）
static func border(root: Node3D, b: Dictionary, gw: int, gh: int) -> void:
	var mat := wall_mat(b.side, 0.25)
	var h := 0.9
	for e in [[Vector3(gw / 2.0, h / 2 - 0.3, -0.35), Vector3(gw + 1.4, h, 0.7)], [Vector3(gw / 2.0, h / 2 - 0.3, gh + 0.35), Vector3(gw + 1.4, h, 0.7)],
			[Vector3(-0.35, h / 2 - 0.3, gh / 2.0), Vector3(0.7, h, gh)], [Vector3(gw + 0.35, h / 2 - 0.3, gh / 2.0), Vector3(0.7, h, gh)]]:
		var mi := MeshInstance3D.new(); var bm := BoxMesh.new(); bm.size = e[1]; mi.mesh = bm; mi.material_override = mat; mi.position = e[0]
		root.add_child(mi)

static func floor_plane(root: Node3D, c: Color, gw: int, gh: int, rough := 0.9, y := -0.6) -> MeshInstance3D:
	var fl := MeshInstance3D.new(); var pm := PlaneMesh.new(); pm.size = Vector2(max(700, gw * 3), max(700, gh * 3))
	var fm := StandardMaterial3D.new(); fm.albedo_color = c; fm.roughness = rough; pm.material = fm
	fl.mesh = pm; fl.position = Vector3(gw / 2.0, y, gh / 2.0); root.add_child(fl)
	return fl

static func ring_pos(gw: int, gh: int, rn: RandomNumberGenerator, near: float, far: float) -> Vector3:
	var a := rn.randf() * TAU
	var rx := gw / 2.0 + rn.randf_range(near, far); var rz := gh / 2.0 + rn.randf_range(near, far)
	return Vector3(gw / 2.0 + cos(a) * rx, 0, gh / 2.0 + sin(a) * rz)

static func window_mat(base: Color, lit: Color, frac: float, seed: int, k := 0.8) -> StandardMaterial3D:
	var img := Image.create(8, 16, false, Image.FORMAT_RGBA8)
	var rn := RandomNumberGenerator.new(); rn.seed = seed
	for yy in 16:
		for xx in 8:
			var on := xx % 2 == 0 and yy % 2 == 0 and rn.randf() < frac
			img.set_pixel(xx, yy, lit if on else Color(0, 0, 0))
	var m := StandardMaterial3D.new(); m.albedo_color = base; m.emission_enabled = true; m.emission_texture = ImageTexture.create_from_image(img)
	m.emission_energy_multiplier = k; m.texture_filter = BaseMaterial3D.TEXTURE_FILTER_NEAREST; m.uv1_scale = Vector3(3, 2, 1); m.roughness = 0.8
	return m

static func box(root: Node3D, size: Vector3, pos: Vector3, mat: Material, rot := 0.0) -> MeshInstance3D:
	var mi := MeshInstance3D.new(); mi.mesh = Models.mesh("box", size.x, size.y, size.z); mi.material_override = mat
	mi.position = pos; mi.rotation.y = rot; mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	root.add_child(mi); return mi

static func part(root: Node3D, mesh: Mesh, pos: Vector3, mat: Material, scl := Vector3.ONE, rot := Vector3.ZERO) -> MeshInstance3D:
	var mi := MeshInstance3D.new(); mi.mesh = mesh; mi.material_override = mat; mi.position = pos; mi.scale = scl; mi.rotation = rot
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF; root.add_child(mi); return mi

static func tree(root: Node3D, pos: Vector3, kind: String, s: float, c: Color) -> void:
	var trunk := toon("#5a3e2a")
	match kind:
		"pine":
			part(root, Models.mesh("cyl", 0.3, 2.0), pos + Vector3(0, 1.0 * s, 0), trunk, Vector3(s, s, s))
			for k in 3: part(root, Models.mesh("cone", 2.2 - k * 0.5, 2.6), pos + Vector3(0, (2.2 + k * 1.3) * s, 0), toon(c.lightened(k * 0.05)), Vector3(s, s, s))
			part(root, Models.mesh("cone", 0.9, 1.2), pos + Vector3(0, 6.0 * s, 0), toon("#f4f8ff"), Vector3(s, s, s))
		_:
			part(root, Models.mesh("cyl", 0.3, 2.4), pos + Vector3(0, 1.2 * s, 0), trunk, Vector3(s, s, s))
			part(root, Models.mesh("sph", 2.0), pos + Vector3(0, 3.6 * s, 0), toon(c), Vector3(s, s * 0.85, s))
			part(root, Models.mesh("sph", 1.3), pos + Vector3(1.0 * s, 3.0 * s, 0.6 * s), toon(c.darkened(0.08)), Vector3(s, s, s))

static func backdrop(root: Node3D, b: Dictionary, gw: int, gh: int, rn: RandomNumberGenerator) -> void:
	var big := maxf(1.0, gw / 120.0)
	match str(b.back):
		"city", "city_night", "towers_gray", "towers_glass", "oldtown", "ruins", "yard":
			var night: bool = b.back == "city_night"
			var base := col(b.sky[0]).darkened(0.35).lerp(Color(0.35, 0.36, 0.4), 0.4)
			var wm := window_mat(base, Color("#ffd9a0") if not b.back in ["towers_glass"] else Color("#bfe0ff"), 0.4 if night else 0.18, rn.randi(), 0.9 if night else 0.35)
			if b.back == "towers_glass":
				wm = StandardMaterial3D.new(); wm.albedo_color = Color("#34507a"); wm.metallic = 0.7; wm.roughness = 0.12
			var roofm := toon(base.darkened(0.2))
			floor_plane(root, col(b.ground[1]).darkened(0.25), gw, gh)
			for k in 60:
				var p := ring_pos(gw, gh, rn, 18 * big, 70 * big)
				var bh := rn.randf_range(8, 30) * (1.5 if b.back in ["towers_glass", "towers_gray"] else 1.0)
				if b.back == "oldtown": bh = rn.randf_range(6, 12)
				if b.back == "ruins": bh = rn.randf_range(5, 18)
				if b.back == "yard": bh = rn.randf_range(4, 14)
				var bw := rn.randf_range(6, 14)
				var mi := box(root, Vector3(bw, bh, bw * rn.randf_range(0.7, 1.3)), p + Vector3(0, bh / 2 - 0.6, 0), wm, rn.randf() * 0.4)
				if b.back == "oldtown":   # 坡屋顶
					part(root, Models.mesh("prism", bw * 1.05, 3.5, bw * 1.0), p + Vector3(0, bh + 1.1, 0), toon("#a0503a"), Vector3.ONE, Vector3(0, mi.rotation.y, 0))
				elif b.back == "ruins" and rn.randf() < 0.5:
					box(root, Vector3(bw * 0.5, 3, bw * 0.4), p + Vector3(bw * 0.2, bh + 0.6, 0), roofm)
			if b.back in ["oldtown", "ruins", "yard"]:
				for k in 30: tree(root, ring_pos(gw, gh, rn, 6 * big, 16 * big), "round", rn.randf_range(0.9, 1.4), Color("#4f8a44") if b.back != "ruins" else Color("#6a8a3a"))
		"forest_pink":
			floor_plane(root, Color("#5a7a40"), gw, gh)
			for k in 70:
				var p := ring_pos(gw, gh, rn, 4, 40)
				tree(root, p, "round", rn.randf_range(0.9, 1.5), Color("#ffa6d2") if rn.randf() < 0.65 else Color("#5f9a4a"))
			# 远处的山
			for k in 10:
				var p := ring_pos(gw, gh, rn, 60, 90)
				part(root, Models.mesh("cone", 28, 26), p + Vector3(0, 12, 0), toon("#8aa0b8"))
		"mountain":
			floor_plane(root, Color("#e6edf6"), gw, gh)
			for k in 50: tree(root, ring_pos(gw, gh, rn, 3, 30), "pine", rn.randf_range(0.9, 1.5), Color("#2f5a44"))
			for k in 14:
				var p := ring_pos(gw, gh, rn, 50, 90); var hh := rn.randf_range(26, 46)
				part(root, Models.mesh("cone", hh * 0.9, hh), p + Vector3(0, hh / 2 - 1, 0), toon("#6a7c96"))
				part(root, Models.mesh("cone", hh * 0.33, hh * 0.37), p + Vector3(0, hh * 0.82 - 1, 0), toon("#f4f8ff"))
		"volcano":
			floor_plane(root, Color("#2a201c"), gw, gh)
			for k in 12:
				var p := ring_pos(gw, gh, rn, 30, 80); var hh := rn.randf_range(18, 40)
				part(root, Models.mesh("cyl", hh * 0.18, hh, hh * 0.85), p + Vector3(0, hh / 2 - 1, 0), toon("#3a2c26"))
				part(root, Models.mesh("cyl", hh * 0.17, 0.4), p + Vector3(0, hh - 0.8, 0), lamp("#ff6a20", 1.3))
			var lv := floor_plane(root, Color("#ff5a1a"), gw, gh, 0.9, -1.6)
			var lm := StandardMaterial3D.new(); lm.albedo_color = Color("#3a1a10"); lm.emission_enabled = true; lm.emission = Color("#ff4a10"); lm.emission_energy_multiplier = 0.35
			lv.mesh.surface_set_material(0, lm)
		"sea":
			var sea := floor_plane(root, Color("#2a5a7a"), gw, gh, 0.1, -1.2)
			var sm := StandardMaterial3D.new(); sm.albedo_color = Color("#2d6688"); sm.roughness = 0.08; sm.metallic = 0.3
			sea.mesh.surface_set_material(0, sm)
			# 码头地面延伸 + 吊车
			box(root, Vector3(gw + 24, 1.2, 10), Vector3(gw / 2.0, -0.6, -5), toon("#7e807a"))
			box(root, Vector3(gw + 24, 1.2, 10), Vector3(gw / 2.0, -0.6, gh + 5), toon("#7e807a"))
			for k in 6:
				var x := gw * (k + 0.5) / 6.0; var z := -12.0 if k % 2 == 0 else gh + 12.0
				var cm := toon("#e0a020" if k % 2 == 0 else "#c84030")
				box(root, Vector3(1, 22, 1), Vector3(x - 3, 11, z), cm); box(root, Vector3(1, 22, 1), Vector3(x + 3, 11, z), cm)
				box(root, Vector3(1.2, 1.2, 26), Vector3(x, 22, z + (8 if k % 2 == 0 else -8)), cm)
			for k in 8:   # 远处的船
				var p := ring_pos(gw, gh, rn, 60, 110)
				box(root, Vector3(18, 3, 5), p + Vector3(0, 0, 0), toon("#3a4a5a")); box(root, Vector3(5, 4, 4), p + Vector3(5, 3, 0), toon("#e8e8e8"))
		"tunnel":
			floor_plane(root, Color("#1a1c20"), gw, gh)
			var wm := wall_mat([11, "#c8ccd0", "#2f7ad0", "#3a3e46"], 0.05)
			for e in [[Vector3(gw / 2.0, 6, -6), Vector3(gw + 30, 14, 2)], [Vector3(gw / 2.0, 6, gh + 6), Vector3(gw + 30, 14, 2)], [Vector3(-6, 6, gh / 2.0), Vector3(2, 14, gh + 14)], [Vector3(gw + 6, 6, gh / 2.0), Vector3(2, 14, gh + 14)]]:
				var mi := MeshInstance3D.new(); var bm := BoxMesh.new(); bm.size = e[1]; mi.mesh = bm; mi.material_override = wm; mi.position = e[0]; root.add_child(mi)
			# 场外的轨道
			for z in [-3.0, gh + 3.0]:
				for dx in [-0.8, 0.8]: box(root, Vector3(gw + 20, 0.15, 0.18), Vector3(gw / 2.0, -0.45, z + dx), toon("#8a8e94", 0.7))
				for x in range(-8, gw + 8, 2): box(root, Vector3(0.4, 0.12, 2.4), Vector3(x, -0.55, z), toon("#4a3a2c"))
		"park":
			floor_plane(root, Color("#6ab04a"), gw, gh)
			for k in 50: tree(root, ring_pos(gw, gh, rn, 4, 30), "round", rn.randf_range(0.9, 1.4), Color("#56b64a"))
			# 摩天轮
			var fw := Node3D.new(); fw.position = Vector3(gw + 26, 22, gh / 2.0); fw.rotation.y = PI / 2; root.add_child(fw)
			part(fw, Models.mesh("torus", 15, 16), Vector3.ZERO, toon("#ffffff"), Vector3.ONE, Vector3(PI / 2, 0, 0))
			for k in 12:
				var a := k / 12.0 * TAU
				part(fw, Models.mesh("box", 0.4, 15, 0.4), Vector3(cos(a) * 7.5, sin(a) * 7.5, 0), toon("#ffffff"), Vector3.ONE, Vector3(0, 0, a + PI / 2))
				part(fw, Models.mesh("box", 2, 2, 2), Vector3(cos(a) * 15.5, sin(a) * 15.5 - 1.5, 0), toon(Color.from_hsv(k / 12.0, 0.6, 1.0)))
			box(root, Vector3(2, 22, 2), Vector3(gw + 26, 10, gh / 2.0 - 4), toon("#d8d8e0")); box(root, Vector3(2, 22, 2), Vector3(gw + 26, 10, gh / 2.0 + 4), toon("#d8d8e0"))
			for k in 16:   # 气球
				var p := ring_pos(gw, gh, rn, 2, 14)
				part(root, Models.mesh("sph", 0.7), p + Vector3(0, rn.randf_range(6, 12), 0), toon(Color.from_hsv(rn.randf(), 0.65, 1.0), 0.6))
		"dunes":
			floor_plane(root, Color("#c89e74"), gw, gh)
			for k in 26:
				var p := ring_pos(gw, gh, rn, 6, 70); var s := rn.randf_range(8, 22)
				part(root, Models.mesh("sph", 1.0), p + Vector3(0, -s * 0.55, 0), toon("#d4aa80"), Vector3(s * 1.8, s, s * 1.2))
			# 远处倒在沙里的大楼剪影 + 夜蚀结晶
			for k in 10:
				var p := ring_pos(gw, gh, rn, 50, 90); var bh := rn.randf_range(14, 30)
				box(root, Vector3(8, bh, 8), p + Vector3(0, bh / 2 - 3, 0), toon("#6a4a5a"), rn.randf()).rotation.z = rn.randf_range(-0.3, 0.3)
			for k in 18:
				var p := ring_pos(gw, gh, rn, 4, 40)
				crystal(root, p, rn.randf_range(1.2, 2.6), rn)

static func crystal(root: Node3D, p: Vector3, s: float, rn: RandomNumberGenerator) -> void:
	var cm := StandardMaterial3D.new(); cm.albedo_color = Color("#7a5aff"); cm.emission_enabled = true; cm.emission = Color("#9a7aff"); cm.emission_energy_multiplier = 0.45
	cm.roughness = 0.2; cm.metallic = 0.2
	for k in 4:
		var h := s * rn.randf_range(0.8, 1.8)
		part(root, Models.mesh("cone", 0.35 * s, h), p + Vector3(rn.randf_range(-0.4, 0.4) * s, h / 2, rn.randf_range(-0.4, 0.4) * s), cm, Vector3.ONE,
			Vector3(rn.randf_range(-0.4, 0.4), 0, rn.randf_range(-0.4, 0.4)))

# 墙顶的小摆设（不会挡路，只在墙上面）
static func props(root: Node3D, b: Dictionary, comps: Array, T: PackedInt32Array, gw: int, rn: RandomNumberGenerator) -> void:
	var kind := str(b.get("props", ""))
	if kind == "": return
	for c in comps:
		var w: int = c.x1 - c.x0 + 1; var h: int = c.y1 - c.y0 + 1
		var cx: float = (c.x0 + c.x1 + 1) / 2.0; var cz: float = (c.y0 + c.y1 + 1) / 2.0
		var top := float(b.get("wall_h", 120)) * K
		var ctr := Vector3(cx, top, cz)
		match kind:
			"rooftop":
				if w >= 3 and h >= 3:   # 水塔
					var tm := toon("#7a5a44")
					for d in [Vector2(-0.8, -0.8), Vector2(0.8, -0.8), Vector2(-0.8, 0.8), Vector2(0.8, 0.8)]: part(root, Models.mesh("box", 0.2, 1.6, 0.2), ctr + Vector3(d.x, 0.8, d.y), toon("#4a4a50"))
					part(root, Models.mesh("cyl", 1.2, 2.2), ctr + Vector3(0, 2.6, 0), tm)
					part(root, Models.mesh("cone", 1.35, 1.0), ctr + Vector3(0, 4.2, 0), toon("#5a4030"))
				else:   # 空调外机
					var n := maxi(1, int(maxf(w, h) / 4.0))
					for k in n:
						var p := Vector3(c.x0 + 0.5 + (k + 0.5) * w / float(n) - 0.5, top + 0.35, cz) if w >= h else Vector3(cx, top + 0.35, c.y0 + 0.5 + (k + 0.5) * h / float(n) - 0.5)
						part(root, Models.mesh("box", 1.0, 0.7, 0.8), p, toon("#c8ccd0", 0.5))
						part(root, Models.mesh("cyl", 0.28, 0.05), p + Vector3(0, 0.37, 0), toon("#3a3e44"))
			"plaza":
				if w >= 5 and h >= 5:   # 钟楼
					var sm := toon("#d8c8aa")
					part(root, Models.mesh("box", w - 0.6, 6, h - 0.6), ctr + Vector3(0, 3, 0), sm)
					part(root, Models.mesh("prism", w - 0.2, 4, h - 0.2), ctr + Vector3(0, 8, 0), toon("#5a6a8a"))
					for d in [Vector3(0, 0, 1), Vector3(0, 0, -1), Vector3(1, 0, 0), Vector3(-1, 0, 0)]:
						var face := part(root, Models.mesh("cyl", 1.4, 0.15), ctr + Vector3(0, 4.2, 0) + d * (w / 2.0 - 0.25), toon("#fff8e8", 0.6))
						face.rotation = Vector3(PI / 2, 0, 0) if d.z != 0 else Vector3(0, 0, PI / 2)
				elif w <= 2 and h <= 2:   # 柱头
					part(root, Models.mesh("box", w + 0.3, 0.4, h + 0.3), ctr + Vector3(0, 0.2, 0), toon("#e9dcc4"))
			"garden":
				if w <= 4 and h <= 4:   # 石灯笼
					var st := toon("#9a988e")
					part(root, Models.mesh("box", 1.2, 0.3, 1.2), ctr + Vector3(0, 0.15, 0), st)
					part(root, Models.mesh("box", 0.8, 0.8, 0.8), ctr + Vector3(0, 0.7, 0), lamp("#ffe0a0", 1.15))
					part(root, Models.mesh("prism", 1.6, 0.6, 1.6), ctr + Vector3(0, 1.4, 0), st)
				elif w > 4 and h > 4:   # 假山上的小松
					tree(root, ctr, "round", 0.8, Color("#4a7a3a"))
			"civic":
				if w >= 3 or h >= 3:   # 广告牌：墙顶上一块亮面
					var long_x := w >= h
					var bb := part(root, Models.mesh("box", (w - 0.4) if long_x else 0.2, 2.2, 0.2 if long_x else (h - 0.4)), ctr + Vector3(0, 1.3, 0), lamp(Color.from_hsv(rn.randf(), 0.5, 0.95), 1.05))
					bb.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
			"market":   # 摊位顶棚的条纹雨篷
				var aw := part(root, Models.mesh("box", w + 0.6, 0.12, h + 0.8), ctr + Vector3(0, 0.9, 0), toon("#e8463c" if rn.randf() < 0.5 else "#f0b030"))
				aw.rotation.x = 0.12
				for d in [Vector2(-1, -1), Vector2(1, -1), Vector2(-1, 1), Vector2(1, 1)]:
					part(root, Models.mesh("box", 0.12, 0.9, 0.12), ctr + Vector3(d.x * (w / 2.0), 0.45, d.y * (h / 2.0)), toon("#5a3a22"))
			"park":
				if w >= 7 and h >= 7:   # 旋转木马
					part(root, Models.mesh("cyl", w / 2.0, 0.4), ctr + Vector3(0, 0.2, 0), toon("#ffe8c8"))
					part(root, Models.mesh("cone", w / 2.0 + 0.8, 3.5), ctr + Vector3(0, 5.6, 0), toon("#ff6a8a"))
					for k in 10:
						var a := k / 10.0 * TAU; var r := w / 2.0 - 1.0
						part(root, Models.mesh("cyl", 0.08, 4.0), ctr + Vector3(cos(a) * r, 2.2, sin(a) * r), toon("#ffd23f", 0.7))
						part(root, Models.mesh("box", 0.4, 0.6, 1.0), ctr + Vector3(cos(a) * r, 1.4 + (k % 2) * 0.5, sin(a) * r), toon(Color.from_hsv(k / 10.0, 0.4, 1.0)), Vector3.ONE, Vector3(0, -a, 0))
				else:   # 摊位小帐篷
					part(root, Models.mesh("cone", maxf(w, h) / 2.0 + 0.4, 1.6), ctr + Vector3(0, 0.8, 0), toon("#ffffff" if rn.randf() < 0.5 else "#ff8aa8"))
			"dawn":   # 夜蚀结晶从残骸上长出来
				if rn.randf() < 0.7: crystal(root, ctr, 1.0 + rn.randf() * 0.6, rn)

static func lamps(root: Node3D, b: Dictionary, comps: Array, gw: int, gh: int, T: PackedInt32Array, rn: RandomNumberGenerator) -> void:
	var lc := col(b.lamps[0]); var e: float = b.lamps[1]
	var pts: Array = []
	if b.back == "tunnel":
		for x in range(12, gw, 24):
			for z in [gh * 0.25, gh * 0.75]: pts.append(Vector3(x, 10, z))
	else:
		for c in comps:
			if pts.size() >= 10: break
			pts.append(Vector3((c.x0 + c.x1 + 1) / 2.0, float(b.get("wall_h", 120)) * K + 2.0, (c.y0 + c.y1 + 1) / 2.0))
	for p in pts:
		var ol := OmniLight3D.new(); ol.position = p; ol.light_color = lc; ol.light_energy = e; ol.omni_range = 14; ol.omni_attenuation = 1.4
		root.add_child(ol)
		if b.back != "tunnel":   # 灯笼
			part(root, Models.mesh("sph", 0.45), p + Vector3(0, -0.8, 0), lamp(lc, 1.2), Vector3(1, 1.25, 1))

# 天气：跟着镜头走的粒子（雪 / 花瓣 / 火星 / 尘埃）
static func weather(b: Dictionary) -> Node3D:
	var fx := str(b.get("fx", ""))
	if fx == "": return null
	var p := CPUParticles3D.new()
	p.amount = {"snow": 500, "petals": 140, "embers": 160, "dust": 110}.get(fx, 100)
	p.lifetime = 6.0; p.preprocess = 6.0; p.local_coords = false
	p.emission_shape = CPUParticles3D.EMISSION_SHAPE_BOX; p.emission_box_extents = Vector3(34, 1, 24)
	var c := col(b.get("fxc", "#ffffff"))
	var q := QuadMesh.new(); q.size = Vector2(0.18, 0.18)
	var m := StandardMaterial3D.new(); m.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED; m.billboard_mode = BaseMaterial3D.BILLBOARD_ENABLED
	m.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA; m.albedo_color = Color(c, 0.85); m.vertex_color_use_as_albedo = true
	q.material = m; p.mesh = q
	p.direction = Vector3(0.3, -1, 0.1); p.spread = 20; p.gravity = Vector3.ZERO
	match fx:
		"snow": p.initial_velocity_min = 2.0; p.initial_velocity_max = 3.5; p.position = Vector3(0, 16, 0)
		"petals": p.initial_velocity_min = 1.2; p.initial_velocity_max = 2.2; q.size = Vector2(0.28, 0.2); p.angular_velocity_min = -90; p.angular_velocity_max = 90; p.position = Vector3(0, 14, 0)
		"embers":
			p.direction = Vector3(0, 1, 0); p.initial_velocity_min = 1.0; p.initial_velocity_max = 2.5; p.position = Vector3(0, -1, 0)
			m.albedo_color = Color(c.r * 1.3, c.g * 1.1, c.b, 0.9); q.size = Vector2(0.12, 0.12)
		"dust": p.direction = Vector3(1, 0.1, 0.3); p.initial_velocity_min = 0.4; p.initial_velocity_max = 1.0; p.position = Vector3(0, 5, 0); p.emission_box_extents = Vector3(34, 5, 24)
	var grad := Gradient.new(); grad.set_color(0, Color(1, 1, 1, 0)); grad.add_point(0.15, Color(1, 1, 1, 1)); grad.add_point(0.85, Color(1, 1, 1, 1)); grad.set_color(grad.get_point_count() - 1, Color(1, 1, 1, 0))
	p.color_ramp = grad
	return p
