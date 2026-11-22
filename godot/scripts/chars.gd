# 涂鸦机兵 电脑版 3.2 —— 驾驶员 3D 模型（重做）
# Q 版比例的完整人物：分层的眼睛（眼白 / 虹膜 / 瞳孔 / 两个高光 / 眼线）、眉毛、鼻子、腮红、多种嘴型；
# 11 种发型（每种都有刘海 + 后发 + 专属部件）；每套服装有上衣 / 内衬 / 裤子 / 鞋子和专属细节（外套下摆、兜帽、披风、围巾、护甲、背包……）
# 朝向：+X 是正面（和机兵一样）。返回 {root, hips, torso, head, arms: [左, 右], legs: [左, 右], hand_r}
class_name Chars
extends RefCounted

static var _rb := {}

# 圆角盒子：细分的盒子网格，每个顶点先夹到内盒里再沿方向推出 r（真正的圆角，不是拼出来的）
static func rbox(size: Vector3, r: float) -> ArrayMesh:
	var key := "%.3f|%.3f|%.3f|%.3f" % [size.x, size.y, size.z, r]
	if _rb.has(key): return _rb[key]
	var bm := BoxMesh.new(); bm.size = size; bm.subdivide_width = 4; bm.subdivide_height = 4; bm.subdivide_depth = 4
	var arr := bm.get_mesh_arrays()
	var v: PackedVector3Array = arr[Mesh.ARRAY_VERTEX]; var n: PackedVector3Array = arr[Mesh.ARRAY_NORMAL]
	var h := size / 2.0 - Vector3.ONE * r
	h = Vector3(maxf(h.x, 0.0), maxf(h.y, 0.0), maxf(h.z, 0.0))
	for i in v.size():
		var c := Vector3(clampf(v[i].x, -h.x, h.x), clampf(v[i].y, -h.y, h.y), clampf(v[i].z, -h.z, h.z))
		var d := v[i] - c
		if d.length() < 0.0001: d = n[i]
		d = d.normalized()
		v[i] = c + d * r; n[i] = d
	arr[Mesh.ARRAY_VERTEX] = v; arr[Mesh.ARRAY_NORMAL] = n
	arr[Mesh.ARRAY_TANGENT] = null
	var m := ArrayMesh.new(); m.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arr)
	_rb[key] = m
	return m

static func T(c, emit := 0.0, gloss := 0.35, outline := true) -> ShaderMaterial:
	return Models.toon(Color(str(c)) if typeof(c) == TYPE_STRING else c, emit, gloss, outline)

static func P_(parent: Node3D, mesh: Mesh, mat: Material, pos: Vector3, rot := Vector3.ZERO, scl := Vector3.ONE) -> MeshInstance3D:
	var mi := MeshInstance3D.new(); mi.mesh = mesh; mi.material_override = mat; mi.position = pos; mi.rotation_degrees = rot; mi.scale = scl
	parent.add_child(mi); return mi

static func M(kind: String, a := 1.0, b := 1.0, c := 1.0) -> Mesh: return Models.mesh(kind, a, b, c)

# 服装表：上衣 / 内衬 / 裤子 / 鞋 / 袖长 + 细节开关
const OUTFITS := {
	"jacket":   {"top": "#e8382f", "inner": "#f4efe6", "pants": "#2a2d3a", "shoes": "#e8382f", "sleeve": "long", "open": true},
	"coat":     {"top": "#e6eef8", "inner": "#3a4a66", "pants": "#2c3448", "shoes": "#3a4a66", "sleeve": "long", "tails": "#e6eef8"},
	"idol":     {"top": "#ff6ec4", "inner": "#ffffff", "pants": "#ffe1f2", "shoes": "#ffffff", "sleeve": "short", "skirt": "#ff9ad6", "bow": "#ffe14d"},
	"tank":     {"top": "#3a3d48", "inner": "#3a3d48", "pants": "#5a6a3a", "shoes": "#2a221c", "sleeve": "none", "buff": true, "belt": "#2a221c"},
	"hoodie":   {"top": "#3a2c55", "inner": "#2a2040", "pants": "#1f1b2a", "shoes": "#8a6cff", "sleeve": "long", "hood": "#3a2c55", "pocket": true},
	"engineer": {"top": "#f4efe6", "inner": "#2bb8a8", "pants": "#2bb8a8", "shoes": "#ffb21f", "sleeve": "short", "overall": "#2bb8a8", "tool": true},
	"aviator":  {"top": "#8a5a34", "inner": "#f4e6c8", "pants": "#3a3226", "shoes": "#4a3020", "sleeve": "long", "fur": "#f4e6c8", "scarf": "#e8d8b0"},
	"hacker":   {"top": "#1d1f2c", "inner": "#7af0ff", "pants": "#2a2d3a", "shoes": "#7af0ff", "sleeve": "long", "neon": "#7af0ff", "hood": "#1d1f2c"},
	"chefcoat": {"top": "#ffffff", "inner": "#ffffff", "pants": "#3a3d48", "shoes": "#2a2d3a", "sleeve": "long", "apron": "#f4efe6", "buttons": "#2a2d3a", "wide": true},
	"military": {"top": "#5a6a3a", "inner": "#7a8a52", "pants": "#4a5530", "shoes": "#2a221c", "sleeve": "long", "medals": true, "belt": "#3a2a1c", "pads": "#4a5530"},
	"kid":      {"top": "#ffd23f", "inner": "#ff7ab8", "pants": "#5a8cff", "shoes": "#ff7ab8", "sleeve": "short", "backpack": "#ff7ab8", "shorts": true},
	"rebel":    {"top": "#5b5e68", "inner": "#2a2d36", "pants": "#2a2d36", "shoes": "#ff5a36", "sleeve": "long", "scarf": "#ff5a36", "open": true},
	"worker":   {"top": "#ff8a1f", "inner": "#3a4a66", "pants": "#3a4a66", "shoes": "#4a3020", "sleeve": "long", "vest": "#ffd23f", "belt": "#4a3020"},
	"dj":       {"top": "#1fd6ee", "inner": "#1d1f2c", "pants": "#1d1f2c", "shoes": "#ff3ea5", "sleeve": "long", "chain": "#ffd23f", "open": true},
	"security": {"top": "#23252f", "inner": "#3a3d48", "pants": "#23252f", "shoes": "#14151d", "sleeve": "long", "pads": "#3a3d48", "vestA": "#3a3d48"},
	"magician": {"top": "#2a1f3a", "inner": "#ffffff", "pants": "#1d1a26", "shoes": "#141018", "sleeve": "long", "tails": "#2a1f3a", "bowtie": "#ff3b52", "cape": "#8f1a3a"},
	"academy":  {"top": "#1d2140", "inner": "#8a6bff", "pants": "#1d2140", "shoes": "#14151d", "sleeve": "long", "tails": "#1d2140", "buttons": "#d8b25a", "collar": "#1d2140"},
	"academyH": {"top": "#16141c", "inner": "#ff2d4b", "pants": "#16141c", "shoes": "#2a2430", "sleeve": "long", "hood": "#16141c", "buttons": "#c8c8d0", "collar": "#16141c"},
	"merc":     {"top": "#8a7a52", "inner": "#3a3d48", "pants": "#5a5240", "shoes": "#2a221c", "sleeve": "long", "vestA": "#6a5e40", "scarf": "#c89a3a", "pads": "#6a5e40", "belt": "#3a2a1c"},
	"labcoat":  {"top": "#f2f5f7", "inner": "#2b3a4a", "pants": "#2b3a4a", "shoes": "#5ff0d0", "sleeve": "long", "tails": "#f2f5f7", "badge": "#5ff0d0", "open": true},
	"testsuit": {"top": "#16161e", "inner": "#ff4f7a", "pants": "#16161e", "shoes": "#ff4f7a", "sleeve": "long", "neon": "#ff4f7a", "pads": "#2a2a36"},
	"dawnGlimmer": {"top": "#c9822e", "inner": "#2e2a36", "pants": "#3a3226", "shoes": "#c9822e", "sleeve": "long", "cape": "#f6eedc", "collar": "#f6eedc", "strap": "#5a3a1e", "emblem": "#ffe7a8"},
	"dawnCoda": {"top": "#1e2640", "inner": "#e9eef4", "pants": "#1e2640", "shoes": "#2a3456", "sleeve": "long", "tails": "#2a3456", "neon": "#7ad8ff", "open": true, "strap": "#141a2c"},
	"dawnXiao": {"top": "#14121a", "inner": "#3a2e58", "pants": "#14121a", "shoes": "#221e2c", "sleeve": "long", "hood": "#221e2c", "cloak": "#14121a", "emblem": "#9a7aff", "collar": "#14121a"},
}

static func build_char(P: Dictionary, tc: Color, bust := false) -> Dictionary:
	var O: Dictionary = OUTFITS.get(str(P.get("outfit", "")), OUTFITS.jacket)
	var skin := Color(str(P.get("skin", "#f6d6c2")))
	var acc := Color(str(P.get("accent", "#ffd23f")))
	var root := Node3D.new()
	var top := T(O.top); var inner := T(O.inner); var pants := T(O.pants); var shoes := T(O.shoes); var sk := T(skin, 0.0, 0.2)
	var dk := T("#22202c")
	# ---------- 腿 ----------
	var hips := Node3D.new(); hips.position = Vector3(0, 0.56, 0); root.add_child(hips)
	P_(hips, rbox(Vector3(0.26, 0.16, 0.3), 0.06), pants, Vector3(0, 0.0, 0))
	var legs: Array = []
	for zz in [-0.08, 0.08]:
		var lg := Node3D.new(); lg.position = Vector3(0, -0.04, zz); hips.add_child(lg)
		var short_leg: bool = O.get("shorts", false) or O.has("skirt")
		P_(lg, M("cap", 0.07, 0.3), sk if short_leg else pants, Vector3(0, -0.15, 0))
		P_(lg, M("cap", 0.062, 0.28), sk if O.get("shorts", false) or O.has("skirt") else pants, Vector3(0.0, -0.36, 0))
		if short_leg: P_(lg, M("cyl", 0.066, 0.08), T("#ffffff"), Vector3(0, -0.42, 0))   # 袜口
		P_(lg, rbox(Vector3(0.2, 0.09, 0.11), 0.035), shoes, Vector3(0.04, -0.5, 0))
		P_(lg, rbox(Vector3(0.21, 0.03, 0.115), 0.012), T("#f4f0ea"), Vector3(0.04, -0.545, 0))   # 鞋底
		legs.append(lg)
	if O.has("skirt"):
		P_(hips, M("cyl", 0.13, 0.17, 0.24), T(O.skirt), Vector3(0, -0.06, 0))
	# ---------- 躯干 ----------
	var torso := Node3D.new(); torso.position = Vector3(0, 0.64, 0); root.add_child(torso)
	var wide: float = 1.18 if O.get("wide", false) or O.get("buff", false) else 1.0
	P_(torso, rbox(Vector3(0.24 * wide, 0.34, 0.32 * wide), 0.09), top, Vector3(0, 0.16, 0))
	# 前襟：内衬露出来的 V 形 / 敞开的外套
	if O.get("open", false):
		P_(torso, rbox(Vector3(0.04, 0.3, 0.14), 0.02), inner, Vector3(0.115 * wide, 0.16, 0))
		for zs in [-1.0, 1.0]: P_(torso, rbox(Vector3(0.03, 0.26, 0.05), 0.012), T(Color(str(O.top)).darkened(0.25)), Vector3(0.122 * wide, 0.18, zs * 0.085), Vector3(zs * 8, 0, 0))
	else:
		P_(torso, M("prism", 0.12, 0.12, 0.02), inner, Vector3(0.121 * wide, 0.27, 0), Vector3(0, 90, 180))
	if O.has("collar"): P_(torso, M("cyl", 0.1, 0.06, 0.12), T(O.collar), Vector3(0, 0.34, 0))
	if O.has("buttons"):
		for k in 3: P_(torso, M("sph", 0.016), T(O.buttons, 0.1, 0.8, false), Vector3(0.124 * wide, 0.22 - k * 0.07, 0.03))
	if O.has("belt"): P_(torso, rbox(Vector3(0.26 * wide, 0.04, 0.34 * wide), 0.015), T(O.belt), Vector3(0, 0.0, 0))
	if O.has("overall"):
		P_(torso, rbox(Vector3(0.05, 0.2, 0.2), 0.02), T(O.overall), Vector3(0.115, 0.08, 0))
		for zs in [-1.0, 1.0]: P_(torso, rbox(Vector3(0.25, 0.03, 0.03), 0.01), T(O.overall), Vector3(0, 0.24, zs * 0.08), Vector3(0, 0, 0))
	if O.has("vest"): P_(torso, rbox(Vector3(0.26, 0.26, 0.33), 0.07), T(O.vest), Vector3(0, 0.15, 0)); P_(torso, rbox(Vector3(0.265, 0.025, 0.335), 0.01), T("#d8d8d8", 0.3), Vector3(0, 0.1, 0))
	if O.has("vestA"):   # 战术背心
		P_(torso, rbox(Vector3(0.27 * wide, 0.24, 0.34 * wide), 0.06), T(O.vestA), Vector3(0, 0.15, 0))
		for k in 3: P_(torso, rbox(Vector3(0.04, 0.06, 0.06), 0.01), T(Color(str(O.vestA)).darkened(0.2)), Vector3(0.14, 0.08, -0.09 + k * 0.09))
	if O.has("apron"): P_(torso, rbox(Vector3(0.03, 0.4, 0.22), 0.01), T(O.apron), Vector3(0.125 * wide, 0.06, 0))
	if O.get("medals", false):
		for k in 3: P_(torso, M("cyl", 0.018, 0.01), T(["#ffd23f", "#c8c8d0", "#ff5a36"][k], 0.2, 0.8, false), Vector3(0.125, 0.22, 0.04 + k * 0.035), Vector3(0, 0, 90))
	if O.has("bowtie"):
		for zs in [-1.0, 1.0]: P_(torso, M("prism", 0.06, 0.05, 0.02), T(O.bowtie), Vector3(0.128, 0.31, zs * 0.03), Vector3(0, 90, 90 * zs))
	if O.has("bow"): P_(torso, M("sph", 0.04), T(O.bow), Vector3(0.128, 0.3, 0), Vector3.ZERO, Vector3(0.6, 1, 1.6))
	if O.has("chain"): P_(torso, M("torus", 0.08, 0.095), T(O.chain, 0.2, 0.9, false), Vector3(0.06, 0.24, 0), Vector3(0, 0, 70))
	if O.has("badge"): P_(torso, rbox(Vector3(0.01, 0.06, 0.045), 0.005), T(O.badge, 0.3), Vector3(0.127, 0.2, -0.08))
	if O.has("emblem"): P_(torso, M("cyl", 0.04, 0.012), T(O.emblem, 0.4, 0.8, false), Vector3(0.128, 0.2, 0), Vector3(0, 0, 90))
	if O.has("strap"): P_(torso, rbox(Vector3(0.02, 0.44, 0.04), 0.008), T(O.strap), Vector3(0.124 * wide, 0.16, 0), Vector3(40, 0, 0))
	if O.has("neon"):
		for zs in [-1.0, 1.0]: P_(torso, rbox(Vector3(0.012, 0.3, 0.012), 0.005), Models.glow(Color(str(O.neon)), 1.3), Vector3(0.125 * wide, 0.15, zs * 0.11))
	if O.get("pocket", false): P_(torso, rbox(Vector3(0.02, 0.07, 0.18), 0.015), T(Color(str(O.top)).darkened(0.2)), Vector3(0.122, 0.04, 0))
	if O.has("tails"):   # 外套下摆
		var tl := T(O.tails)
		P_(torso, rbox(Vector3(0.05, 0.3, 0.3 * wide), 0.02), tl, Vector3(-0.1, -0.12, 0), Vector3(0, 0, -8))
		for zs in [-1.0, 1.0]: P_(torso, rbox(Vector3(0.22, 0.28, 0.04), 0.02), tl, Vector3(0, -0.12, zs * 0.155 * wide))
	if O.has("cloak"): P_(torso, M("cyl", 0.17, 0.62, 0.26), T(O.cloak), Vector3(-0.02, 0.0, 0))
	if O.has("cape"):
		var cp := P_(torso, rbox(Vector3(0.03, 0.5, 0.36), 0.02), T(O.cape), Vector3(-0.15, 0.02, 0), Vector3(0, 0, -10)); cp.name = "cape"
	if O.has("scarf"):
		P_(torso, M("torus", 0.08, 0.13), T(O.scarf), Vector3(0, 0.33, 0), Vector3.ZERO, Vector3(1, 1.6, 1))
		P_(torso, rbox(Vector3(0.05, 0.22, 0.07), 0.02), T(O.scarf), Vector3(-0.14, 0.2, 0.06), Vector3(0, 0, -18))
	if O.has("fur"): P_(torso, M("torus", 0.1, 0.15), T(O.fur), Vector3(0, 0.32, 0), Vector3.ZERO, Vector3(1, 1.4, 1))
	if O.has("backpack"):
		P_(torso, rbox(Vector3(0.12, 0.22, 0.24), 0.05), T(O.backpack), Vector3(-0.17, 0.16, 0))
		P_(torso, rbox(Vector3(0.02, 0.1, 0.16), 0.01), T(Color(str(O.backpack)).darkened(0.25)), Vector3(-0.235, 0.12, 0))
	if O.get("tool", false): P_(torso, rbox(Vector3(0.08, 0.08, 0.12), 0.02), T("#ffb21f"), Vector3(0.0, -0.02, 0.17))
	# 队伍色臂章
	# ---------- 手臂 ----------
	var arms: Array = []
	var hand_r: Node3D = null
	var sleeve: String = str(O.sleeve)
	for zs in [-1.0, 1.0]:
		var sh := Node3D.new(); sh.position = Vector3(0, 0.3, zs * (0.19 * wide)); torso.add_child(sh)
		if O.has("pads"): P_(sh, rbox(Vector3(0.14, 0.07, 0.13), 0.03), T(O.pads), Vector3(0, 0.04, zs * 0.02))
		else: P_(sh, M("sph", 0.075), top if sleeve != "none" else sk, Vector3.ZERO)
		var upper_m: Material = top if sleeve in ["long", "short"] else sk
		P_(sh, M("cap", 0.058, 0.22), upper_m, Vector3(0, -0.1, zs * 0.01))
		var fore := Node3D.new(); fore.position = Vector3(0, -0.21, zs * 0.01); sh.add_child(fore)
		P_(fore, M("cap", 0.052, 0.2), top if sleeve == "long" else sk, Vector3(0, -0.08, 0))
		if sleeve == "long": P_(fore, M("cyl", 0.056, 0.03), T(Color(str(O.top)).darkened(0.2)), Vector3(0, -0.17, 0))
		var hd := Node3D.new(); hd.position = Vector3(0, -0.22, 0); fore.add_child(hd)
		P_(hd, M("sph", 0.055), sk, Vector3.ZERO, Vector3.ZERO, Vector3(1, 1.1, 0.9))
		if zs < 0: P_(sh, M("cyl", 0.062, 0.035), T(tc, 0.2, 0.4, false), Vector3(0, -0.12, zs * 0.01))   # 队伍色臂章
		if O.get("buff", false): sh.scale = Vector3(1.2, 1.1, 1.2)
		arms.append(sh)
		if zs > 0: hand_r = hd
	# ---------- 头 ----------
	var head := build_head(P, 0.27)
	head.position = Vector3(0, 0.66, 0); torso.add_child(head)
	if O.has("hood") and str(P.get("style", "")) != "hood":   # 衣服的兜帽挂在背后
		P_(torso, M("sph", 0.16), T(O.hood), Vector3(-0.16, 0.33, 0), Vector3.ZERO, Vector3(0.7, 0.6, 1.1))
	if bust:
		hips.visible = false
		for l in legs: l.visible = false
	return {"root": root, "hips": hips, "torso": torso, "head": head, "arms": arms, "legs": legs, "hand_r": hand_r}

# ---------------- 头：脸 + 发型 + 配饰 ----------------
static func build_head(P: Dictionary, R: float) -> Node3D:
	var h := Node3D.new()
	var skin := Color(str(P.get("skin", "#f6d6c2")))
	var hair := Color(str(P.get("hair", "#2a2430"))); var hair2 := Color(str(P.get("hair2", P.get("hair", "#2a2430"))))
	var eye := Color(str(P.get("eye", "#4a90d0")))
	var sk := T(skin, 0.0, 0.2); var hm := T(hair, 0.0, 0.55); var hm2 := T(hair2, 0.0, 0.55)
	var ink := T("#1b1622", 0.0, 0.2, false)
	P_(h, M("sph", R), sk, Vector3.ZERO, Vector3.ZERO, Vector3(0.98, 0.94, 1.0))
	for zs in [-1.0, 1.0]: P_(h, M("sph", R * 0.18), sk, Vector3(-R * 0.05, -R * 0.08, zs * R * 0.97), Vector3.ZERO, Vector3(0.6, 1, 0.5))   # 耳朵
	# 眼睛
	var es := str(P.get("eyeShape", "round"))
	var eh := R * (0.38 if es == "round" else (0.26 if es in ["cool", "sleepy"] else (0.3 if es == "sharp" else 0.34)))
	var ew := R * (0.27 if es == "round" else 0.24)
	var ez := R * 0.38; var ex := R * 0.86
	for zs in [-1.0, 1.0]:
		if es == "happy":
			P_(h, M("torus", ew * 0.55, ew * 0.75), ink, Vector3(ex + R * 0.06, R * 0.02, zs * ez), Vector3(0, 90, 0), Vector3(1, 0.6, 1))
			continue
		P_(h, M("sph", 1.0), T("#ffffff", 0.0, 0.3, false), Vector3(ex, R * 0.03, zs * ez), Vector3.ZERO, Vector3(R * 0.12, eh * 0.5, ew * 0.5))
		P_(h, M("sph", 1.0), T(eye, 0.15, 0.6, false), Vector3(ex + R * 0.055, R * 0.0, zs * (ez - R * 0.02)), Vector3.ZERO, Vector3(R * 0.1, eh * 0.4, ew * 0.37))
		P_(h, M("sph", 1.0), T(eye.darkened(0.6), 0.0, 0.6, false), Vector3(ex + R * 0.1, -R * 0.01, zs * (ez - R * 0.02)), Vector3.ZERO, Vector3(R * 0.08, eh * 0.22, ew * 0.2))
		P_(h, M("sph", 1.0), Models.glow(Color.WHITE, 1.1), Vector3(ex + R * 0.13, eh * 0.22, zs * (ez - R * 0.02) - R * 0.05), Vector3.ZERO, Vector3(R * 0.04, R * 0.07, R * 0.06))
		P_(h, M("sph", 1.0), Models.glow(Color.WHITE, 1.05), Vector3(ex + R * 0.13, -eh * 0.2, zs * (ez - R * 0.02) + R * 0.05), Vector3.ZERO, Vector3(R * 0.03, R * 0.035, R * 0.035))
		# 眼线（上挑 / 平 / 半闭）
		var lid_y := eh * (0.15 if es == "sleepy" else (0.3 if es == "cool" else 0.46))
		var ln := P_(h, rbox(Vector3(R * 0.06, R * 0.05, ew * 1.15), R * 0.02), ink, Vector3(ex + R * 0.08, lid_y, zs * ez), Vector3(zs * (18.0 if es == "sharp" else (6.0 if es == "cool" else -3.0)), 0, 0))
		if es in ["cool", "sleepy"]: P_(h, M("sph", 1.0), sk, Vector3(ex - R * 0.01, lid_y + eh * 0.2, zs * ez), Vector3.ZERO, Vector3(R * 0.13, eh * 0.32, ew * 0.56))
	# 眉毛
	var bt: float = {"sharp": 20.0, "bold": 14.0, "cool": 6.0, "sleepy": -6.0, "round": -10.0, "happy": -10.0}.get(es, 0.0)
	for zs in [-1.0, 1.0]:
		P_(h, rbox(Vector3(R * 0.06, R * (0.09 if es == "bold" else 0.055), R * 0.3), R * 0.02), T(hair2.darkened(0.3), 0.0, 0.3, false), Vector3(R * 0.84, eh * 0.5 + R * 0.24, zs * R * 0.38), Vector3(zs * bt, 0, 0))
	P_(h, M("sph", R * 0.06), T(skin.darkened(0.12), 0.0, 0.2, false), Vector3(R * 0.98, -R * 0.16, 0))   # 鼻子
	for zs in [-1.0, 1.0]: P_(h, M("sph", 1.0), T("#ff8aa8", 0.05, 0.1, false), Vector3(R * 0.82, -R * 0.22, zs * R * 0.58), Vector3.ZERO, Vector3(R * 0.04, R * 0.08, R * 0.14))   # 腮红
	# 嘴
	var my := -R * 0.4; var mx := R * 0.9
	match str(P.get("mouth", "smile")):
		"grin":
			P_(h, M("sph", 1.0), T("#5a1a2a", 0.0, 0.2, false), Vector3(mx, my, 0), Vector3.ZERO, Vector3(R * 0.08, R * 0.16, R * 0.24))
			P_(h, rbox(Vector3(R * 0.06, R * 0.06, R * 0.32), R * 0.02), T("#ffffff", 0.0, 0.3, false), Vector3(mx + R * 0.04, my + R * 0.07, 0))
		"open":
			P_(h, M("sph", 1.0), T("#5a1a2a", 0.0, 0.2, false), Vector3(mx, my, 0), Vector3.ZERO, Vector3(R * 0.08, R * 0.15, R * 0.17))
			P_(h, M("sph", 1.0), T("#ff6a7a", 0.0, 0.2, false), Vector3(mx + R * 0.03, my - R * 0.06, 0), Vector3.ZERO, Vector3(R * 0.05, R * 0.06, R * 0.11))
		"smirk": P_(h, M("torus", R * 0.1, R * 0.13), ink, Vector3(mx + R * 0.04, my + R * 0.04, R * 0.06), Vector3(0, 90, 160), Vector3(1, 0.7, 1))
		"smile": P_(h, M("torus", R * 0.11, R * 0.14), ink, Vector3(mx + R * 0.03, my + R * 0.06, 0), Vector3(0, 90, 180), Vector3(1, 0.6, 1))
		_: P_(h, rbox(Vector3(R * 0.04, R * 0.035, R * 0.2), R * 0.012), ink, Vector3(mx + R * 0.05, my, 0))
	build_hair(h, P, R, hm, hm2)
	# 配饰（P.extra）
	for x in P.get("extra", []):
		match str(x):
			"sunpin":
				var sp := P_(h, M("cyl", R * 0.12, R * 0.03), Models.glow(Color("#ffd27a"), 1.2), Vector3(R * 0.2, R * 0.75, R * 0.62), Vector3(70, 0, 0))
				for k in 8: P_(sp, M("box", R * 0.04, R * 0.03, R * 0.12), Models.glow(Color("#ffb030"), 1.2), Vector3(cos(k * TAU / 8) * R * 0.18, 0, sin(k * TAU / 8) * R * 0.18), Vector3(0, -rad_to_deg(k * TAU / 8), 0))
			"phones":
				P_(h, M("torus", R * 1.0, R * 1.1), T("#1a2034", 0.0, 0.6), Vector3(-R * 0.05, R * 0.15, 0), Vector3(90, 0, 0), Vector3(1, 1, 1.05))
				for zs in [-1.0, 1.0]:
					P_(h, M("cyl", R * 0.26, R * 0.16), T("#2a3048", 0.0, 0.6), Vector3(-R * 0.05, -R * 0.02, zs * R * 1.02), Vector3(90, 0, 0))
					P_(h, M("cyl", R * 0.16, R * 0.02), Models.glow(Color("#7ad8ff"), 1.3), Vector3(-R * 0.05, -R * 0.02, zs * R * 1.11), Vector3(90, 0, 0))
			"moonmark": P_(h, M("torus", R * 0.06, R * 0.09), Models.glow(Color("#9a7aff"), 1.3), Vector3(R * 0.92, -R * 0.08, -R * 0.5), Vector3(0, 90, 30), Vector3(1, 1, 0.6))
			"halfmask": P_(h, M("sph", R * 1.01), T("#ece6da", 0.0, 0.5), Vector3(R * 0.06, -R * 0.12, -R * 0.02), Vector3.ZERO, Vector3(0.95, 0.65, 0.52))
			"sunglasses":
				for zs in [-1.0, 1.0]: P_(h, rbox(Vector3(R * 0.06, R * 0.22, R * 0.34), R * 0.06), T("#1b1530", 0.0, 0.9), Vector3(R * 0.98, R * 0.02, zs * ez))
	return h

static func build_hair(h: Node3D, P: Dictionary, R: float, hm: Material, hm2: Material) -> void:
	var st := str(P.get("style", ""))
	if st == "hood": pass
	# 后发 + 头顶（每种发型都有）
	if st not in ["chef", "hood"]:
		P_(h, M("sph", R * 1.07), hm, Vector3(-R * 0.12, R * 0.12, 0), Vector3.ZERO, Vector3(1.0, 0.86, 1.04))
	# 刘海：一排斜着的发片
	var bangs := 5 if st not in ["undercut", "veteran", "chef", "hood"] else 0
	for i in bangs:   # 刘海：一片片压扁的发束，从头顶盖到眉毛上面，尖端朝下
		var z := (float(i) - (bangs - 1) / 2.0) * R * 0.32
		var lift := absf(z) / R * 0.22
		P_(h, M("sph", 1.0), hm, Vector3(R * 0.66 - lift * R * 0.4, R * (0.5 + lift), z), Vector3(z / R * 25.0, 0, -18), Vector3(R * 0.22, R * 0.38, R * 0.2))
		P_(h, M("cone", R * 0.12, R * 0.36), hm, Vector3(R * 0.82 - lift * R * 0.4, R * (0.3 + lift), z), Vector3(z / R * 25.0, 0, 170), Vector3(1, 1, 0.8))
	match st:
		"spiky":
			for i in 7:
				var a := -60.0 + i * 20.0
				P_(h, M("cone", R * 0.22, R * 0.75), hm, Vector3(-R * 0.25 + cos(deg_to_rad(a)) * R * 0.1, R * 0.82, sin(deg_to_rad(a)) * R * 0.55), Vector3(a * 0.6, 0, -30 + (i % 2) * 14))
			P_(h, M("cone", R * 0.18, R * 0.6), hm2, Vector3(R * 0.1, R * 0.95, 0), Vector3(0, 0, -15))
		"ponytail":
			P_(h, M("sph", R * 0.13), hm2, Vector3(-R * 0.9, R * 0.35, 0))
			var tail := P_(h, M("cap", R * 0.26, R * 1.6), hm, Vector3(-R * 1.2, -R * 0.3, 0), Vector3(0, 0, 28))
			P_(tail, M("cap", R * 0.18, R * 0.6), hm2, Vector3(0, -R * 0.7, 0))
		"twintail":
			for zs in [-1.0, 1.0]:
				P_(h, M("sph", R * 0.12), hm2, Vector3(-R * 0.15, R * 0.55, zs * R * 0.85))
				var tw := P_(h, M("cap", R * 0.24, R * 1.5), hm, Vector3(-R * 0.3, -R * 0.2, zs * R * 1.15), Vector3(zs * -14, 0, 12))
				P_(tw, M("cap", R * 0.17, R * 0.5), hm2, Vector3(0, -R * 0.65, 0))
		"braid":
			for k in 6: P_(h, M("sph", R * (0.2 - k * 0.012)), hm if k % 2 == 0 else hm2, Vector3(-R * 0.55 - k * R * 0.05, -R * 0.15 - k * R * 0.27, R * 0.62))
			P_(h, M("sph", R * 0.1), T("#ff6a7a"), Vector3(-R * 0.82, -R * 1.72, R * 0.62))
		"buns":
			for zs in [-1.0, 1.0]:
				P_(h, M("sph", R * 0.36), hm, Vector3(-R * 0.2, R * 0.82, zs * R * 0.58))
				P_(h, M("torus", R * 0.28, R * 0.36), hm2, Vector3(-R * 0.2, R * 0.66, zs * R * 0.58), Vector3(zs * 30, 0, 0), Vector3(1, 0.5, 1))
		"swept":
			P_(h, M("cap", R * 0.3, R * 1.4), hm, Vector3(R * 0.25, R * 0.72, -R * 0.15), Vector3(70, 0, 15))
			P_(h, M("cone", R * 0.24, R * 0.8), hm2, Vector3(R * 0.55, R * 0.35, R * 0.55), Vector3(-40, 0, 160))
			for zs in [-1.0, 1.0]: P_(h, M("cap", R * 0.16, R * 0.9), hm, Vector3(-R * 0.05, -R * 0.25, zs * R * 0.88), Vector3(0, 0, 8))
		"undercut":
			P_(h, M("sph", R * 1.02), T(Color(str(P.get("hair", "#2a2430"))).lightened(0.15), 0.0, 0.3), Vector3(-R * 0.1, R * 0.05, 0), Vector3.ZERO, Vector3(0.98, 0.8, 1.0))
			P_(h, rbox(Vector3(R * 1.5, R * 0.42, R * 1.2), R * 0.18), hm, Vector3(R * 0.05, R * 0.82, 0), Vector3(0, 0, -10))
			P_(h, M("cone", R * 0.3, R * 0.6), hm2, Vector3(R * 0.72, R * 0.75, 0), Vector3(0, 0, -100))
		"veteran":
			P_(h, M("sph", R * 1.04), hm, Vector3(-R * 0.1, R * 0.15, 0), Vector3.ZERO, Vector3(0.98, 0.75, 1.02))
			P_(h, rbox(Vector3(R * 0.5, R * 0.3, R * 0.9), R * 0.15), hm, Vector3(R * 0.72, -R * 0.55, 0))   # 胡子
			P_(h, rbox(Vector3(R * 1.4, R * 0.22, R * 1.3), R * 0.1), T("#4a5530"), Vector3(0, R * 0.85, 0))   # 贝雷帽
		"dreads":
			for k in 12:
				var a := k * TAU / 12.0
				if cos(a) > 0.55: continue
				P_(h, M("cap", R * 0.11, R * 1.0), hm if k % 3 else hm2, Vector3(cos(a) * R * 0.85 - R * 0.15, -R * 0.15, sin(a) * R * 0.85), Vector3(sin(a) * 15, 0, -cos(a) * 15))
		"chef":
			P_(h, M("sph", R * 1.04), hm, Vector3(-R * 0.15, R * 0.05, 0), Vector3.ZERO, Vector3(0.95, 0.7, 1.02))
			P_(h, M("cyl", R * 0.82, R * 0.5), T("#ffffff"), Vector3(-R * 0.05, R * 0.8, 0))
			P_(h, M("sph", R * 0.95), T("#ffffff"), Vector3(-R * 0.05, R * 1.25, 0), Vector3.ZERO, Vector3(1, 0.6, 1))
		"hood":
			P_(h, M("sph", R * 1.22), hm2, Vector3(-R * 0.48, R * 0.12, 0), Vector3.ZERO, Vector3(1.0, 0.98, 1.06))
			P_(h, M("torus", R * 1.0, R * 1.18), hm2, Vector3(R * 0.42, R * 0.05, 0), Vector3(0, 0, 90), Vector3(1, 0.5, 1))
			for i in 3: P_(h, M("cone", R * 0.2, R * 0.5), hm, Vector3(R * 0.72, R * 0.42, (i - 1) * R * 0.3), Vector3((1 - i) * 16, 0, 150))
