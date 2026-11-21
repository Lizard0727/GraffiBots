# 涂鸦机兵 Godot 版 —— 机兵 / 驾驶员 / 召唤物模型（程序生成，卡通着色 + 描边）
# 坐标：1 个单位 = 原版 16 像素；机兵朝 +X，Y 向上
class_name Models
extends RefCounted

static var _mats := {}
static var _meshes := {}
static var _outline: ShaderMaterial
static var _toon: Shader
static var outlines := true    # 手机 / 网页可以关掉描边省性能

static func toon(c: Color, emit := 0.0, gloss := 0.4, outline := true) -> ShaderMaterial:
	var key := "%s|%.2f|%.2f|%s" % [c.to_html(), emit, gloss, outline and outlines]
	if _mats.has(key): return _mats[key]
	if _toon == null:
		_toon = load("res://shaders/toon.gdshader")
		_outline = ShaderMaterial.new(); _outline.shader = load("res://shaders/outline.gdshader")
	var m := ShaderMaterial.new(); m.shader = _toon
	m.set_shader_parameter("albedo", c); m.set_shader_parameter("emission_k", emit); m.set_shader_parameter("gloss", gloss)
	if outline and outlines: m.next_pass = _outline
	_mats[key] = m
	return m

static func glow(c: Color, k := 2.0, alpha := 1.0) -> StandardMaterial3D:
	var key := "g|%s|%.2f|%.2f" % [c.to_html(), k, alpha]
	if _mats.has(key): return _mats[key]
	var m := StandardMaterial3D.new()
	m.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	m.albedo_color = Color(c.r * k, c.g * k, c.b * k, alpha) if k > 1.0 else Color(c, alpha)
	if alpha < 1.0: m.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA; m.cull_mode = BaseMaterial3D.CULL_DISABLED
	_mats[key] = m
	return m

static func glass(c: Color, a := 0.35) -> StandardMaterial3D:
	var key := "glass|%s|%.2f" % [c.to_html(), a]
	if _mats.has(key): return _mats[key]
	var m := StandardMaterial3D.new()
	m.albedo_color = Color(c, a); m.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA; m.roughness = 0.05; m.metallic_specular = 1.0
	m.rim_enabled = true; m.rim = 0.6
	_mats[key] = m
	return m

static func mesh(kind: String, a := 1.0, b := 1.0, c := 1.0) -> Mesh:
	var key := "%s|%.3f|%.3f|%.3f" % [kind, a, b, c]
	if _meshes.has(key): return _meshes[key]
	var m: Mesh
	match kind:
		"box": var bm := BoxMesh.new(); bm.size = Vector3(a, b, c); m = bm
		"sph": var sm := SphereMesh.new(); sm.radius = a; sm.height = a * 2; sm.radial_segments = 16; sm.rings = 8; m = sm
		"cyl": var cm := CylinderMesh.new(); cm.top_radius = a; cm.bottom_radius = c if c != 1.0 else a; cm.height = b; cm.radial_segments = 14; m = cm
		"cap": var ca := CapsuleMesh.new(); ca.radius = a; ca.height = b; ca.radial_segments = 12; ca.rings = 4; m = ca
		"cone": var co := CylinderMesh.new(); co.top_radius = 0.001; co.bottom_radius = a; co.height = b; co.radial_segments = 12; m = co
		"torus": var to := TorusMesh.new(); to.inner_radius = a; to.outer_radius = b; to.rings = 24; to.ring_segments = 8; m = to
		"prism": var pm := PrismMesh.new(); pm.size = Vector3(a, b, c); m = pm
	_meshes[key] = m
	return m

static func part(parent: Node3D, m: Mesh, mat: Material, pos: Vector3, rot := Vector3.ZERO, scl := Vector3.ONE) -> MeshInstance3D:
	var mi := MeshInstance3D.new(); mi.mesh = m; mi.material_override = mat
	mi.position = pos; mi.rotation_degrees = rot; mi.scale = scl
	parent.add_child(mi)
	return mi

# ---------------- 机兵 ----------------
# 返回 {root, body, legs: [l, r], gun, ball, foot, parts: [...可以闪白的网格]}
static func build_mech(weapon: String, w: Dictionary, tc: Color, P: Dictionary) -> Dictionary:
	var root := Node3D.new()
	var rig := Node3D.new(); root.add_child(rig)
	var hp := float(w.hp)
	var s := 1.12 if hp >= 160 else (0.92 if hp <= 95 else 1.0)
	rig.scale = Vector3.ONE * s
	var dk := Color("#262838"); var mt := Color("#9aa3bd"); var wh := Color("#f4f0ea")
	var acc := Color(str(P.accent))
	var td := tc.darkened(0.35)
	# 腿（髋关节在 y = 0.95，可以摆动）
	var legs: Array = []
	for zz in [-0.36, 0.36]:
		var hip := Node3D.new(); hip.position = Vector3(0, 0.95, zz); rig.add_child(hip)
		part(hip, mesh("box", 0.34, 0.5, 0.36), toon(dk), Vector3(0, -0.22, 0))
		part(hip, mesh("sph", 0.17), toon(mt, 0.0, 0.7), Vector3(0, -0.5, 0))
		part(hip, mesh("box", 0.3, 0.42, 0.32), toon(td), Vector3(0.02, -0.7, 0))
		part(hip, mesh("box", 0.6, 0.16, 0.42), toon(tc), Vector3(0.1, -0.88, 0))
		part(hip, mesh("box", 0.2, 0.08, 0.44), toon(wh), Vector3(0.36, -0.86, 0))
		legs.append(hip)
	var body := Node3D.new(); body.position = Vector3(0, 0.95, 0); rig.add_child(body)
	part(body, mesh("box", 0.72, 0.28, 1.0), toon(dk), Vector3(0, 0.12, 0))
	# 躯干
	part(body, mesh("box", 1.22, 0.92, 1.36), toon(tc, 0.0, 0.5), Vector3(0, 0.56, 0))
	part(body, mesh("box", 0.08, 0.6, 1.0), toon(wh), Vector3(0.62, 0.48, 0))
	part(body, mesh("box", 0.1, 0.16, 1.02), toon(Color("#7af0ff"), 1.6), Vector3(0.64, 0.72, 0))
	part(body, mesh("box", 1.24, 0.12, 1.38), toon(acc), Vector3(0, 0.2, 0))
	part(body, mesh("box", 0.5, 0.7, 0.9), toon(dk), Vector3(-0.78, 0.58, 0))
	for zz in [-0.28, 0.28]: part(body, mesh("cyl", 0.12, 0.3), toon(mt, 0.0, 0.7), Vector3(-1.05, 0.62, zz), Vector3(0, 0, 90))
	for zz in [-0.78, 0.78]: part(body, mesh("sph", 0.36), toon(td), Vector3(0, 0.9, zz), Vector3.ZERO, Vector3(1.1, 0.75, 0.9))
	# 驾驶舱（玻璃罩 + 驾驶员的头）
	var head := build_head(P, 0.3)
	head.position = Vector3(0.05, 1.18, 0); body.add_child(head)
	part(body, mesh("sph", 0.6), glass(Color("#cfeaff"), 0.28), Vector3(0, 1.2, 0))
	part(body, mesh("torus", 0.55, 0.64), toon(dk), Vector3(0, 0.98, 0))
	part(body, mesh("cyl", 0.03, 0.55), toon(dk, 0.0, 0.4, false), Vector3(-0.3, 1.75, 0.25))
	part(body, mesh("sph", 0.08), glow(tc, 2.5), Vector3(-0.3, 2.04, 0.25))
	# 武器（挂在右侧，跟着瞄准转）
	var gun := Node3D.new(); gun.position = Vector3(0.35, 0.5, 0.88); body.add_child(gun)
	build_weapon(weapon, gun, tc, body)
	# 滚轮形态
	var ball := Node3D.new(); root.add_child(ball); ball.visible = false
	part(ball, mesh("sph", 0.82), toon(tc, 0.15, 0.6), Vector3(0, 0.82, 0))
	part(ball, mesh("torus", 0.78, 0.9), toon(wh), Vector3(0, 0.82, 0), Vector3(90, 0, 0))
	# 弹出的驾驶员
	var foot := build_pilot(P, tc); root.add_child(foot); foot.visible = false
	var parts: Array = []
	_collect(root, parts)
	return {"root": root, "rig": rig, "body": body, "legs": legs, "gun": gun, "ball": ball, "foot": foot, "parts": parts, "scale": s}

static func _collect(n: Node, out: Array) -> void:
	for c in n.get_children():
		if c is MeshInstance3D and c.material_override is ShaderMaterial: out.append(c)
		_collect(c, out)

static func build_head(P: Dictionary, r: float) -> Node3D:
	var h := Node3D.new()
	var skin := Color(str(P.skin)); var hair := Color(str(P.hair)); var hair2 := Color(str(P.get("hair2", P.hair))); var eye := Color(str(P.eye))
	part(h, mesh("sph", r), toon(skin, 0.0, 0.2), Vector3.ZERO)
	part(h, mesh("sph", r * 1.08), toon(hair, 0.0, 0.5), Vector3(-r * 0.15, r * 0.25, 0), Vector3.ZERO, Vector3(1, 0.72, 1))
	for zz in [-0.36, 0.36]: part(h, mesh("box", r * 0.12, r * 0.3, r * 0.2), glow(eye, 1.6), Vector3(r * 0.95, -r * 0.05, r * zz))
	match str(P.get("style", "")):
		"twintail", "buns":
			for zz in [-1.0, 1.0]: part(h, mesh("sph", r * 0.45), toon(hair2), Vector3(-r * 0.3, r * 0.2, zz * r * 1.05))
		"ponytail", "braid":
			part(h, mesh("cap", r * 0.28, r * 1.6), toon(hair2), Vector3(-r * 1.15, -r * 0.3, 0), Vector3(0, 0, 25))
		"spiky":
			for i in 4: part(h, mesh("cone", r * 0.28, r * 0.7), toon(hair), Vector3(-r * 0.3 + i * r * 0.15, r * 0.9, (i - 1.5) * r * 0.35), Vector3(0, 0, -25 + i * 8))
		"hood":
			part(h, mesh("sph", r * 1.25), toon(hair2), Vector3(-r * 0.2, r * 0.1, 0), Vector3.ZERO, Vector3(1, 0.9, 1.05))
		"chef":
			part(h, mesh("cyl", r * 0.7, r * 1.1), toon(Color.WHITE), Vector3(-r * 0.1, r * 1.2, 0))
		"undercut", "swept":
			part(h, mesh("box", r * 1.3, r * 0.4, r * 1.5), toon(hair), Vector3(0, r * 0.75, 0), Vector3(0, 0, -12))
	return h

static func build_pilot(P: Dictionary, tc: Color) -> Node3D:
	var g := Node3D.new()
	var acc := Color(str(P.accent)); var dk := Color("#262838")
	for zz in [-0.13, 0.13]: part(g, mesh("box", 0.16, 0.45, 0.16), toon(dk), Vector3(0, 0.23, zz))
	part(g, mesh("cap", 0.24, 0.62), toon(acc), Vector3(0, 0.72, 0))
	part(g, mesh("box", 0.06, 0.08, 0.5), toon(tc, 1.2), Vector3(0.22, 0.8, 0))
	var head := build_head(P, 0.24); head.position = Vector3(0, 1.22, 0); g.add_child(head)
	part(g, mesh("box", 0.36, 0.12, 0.12), toon(dk), Vector3(0.25, 0.75, 0.24))
	return g

static func build_weapon(id: String, g: Node3D, tc: Color, body: Node3D) -> void:
	var dk := Color("#262838"); var mt := Color("#9aa3bd"); var wh := Color("#f4f0ea"); var lt := tc.lightened(0.45)
	match id:
		"blaster":
			part(g, mesh("box", 0.5, 0.36, 0.34), toon(dk), Vector3(0.1, 0, 0))
			part(g, mesh("cyl", 0.2, 0.8), toon(lt, 0.0, 0.6), Vector3(0.6, 0.05, 0), Vector3(0, 0, -90))
			part(g, mesh("cyl", 0.1, 0.22), toon(dk), Vector3(1.1, 0.05, 0), Vector3(0, 0, -90))
			part(g, mesh("sph", 0.08), glow(tc, 2.0), Vector3(1.22, 0.05, 0))
		"roller":
			part(g, mesh("cyl", 0.06, 1.1), toon(dk), Vector3(0.55, -0.25, 0), Vector3(0, 0, -60))
			part(g, mesh("cyl", 0.36, 1.7), toon(tc, 0.15, 0.6), Vector3(1.15, -0.62, -0.85), Vector3(90, 0, 0))
			part(g, mesh("cyl", 0.38, 0.1), toon(wh), Vector3(1.15, -0.62, -0.05), Vector3(90, 0, 0))
		"charger":
			part(g, mesh("box", 0.7, 0.3, 0.3), toon(dk), Vector3(0.15, 0, 0))
			part(g, mesh("cyl", 0.09, 2.3), toon(mt, 0.0, 0.8), Vector3(1.4, 0.04, 0), Vector3(0, 0, -90))
			for x in [0.9, 1.3, 1.7]: part(g, mesh("torus", 0.1, 0.17), glow(tc, 2.0), Vector3(x, 0.04, 0), Vector3(0, 0, 90))
			part(g, mesh("box", 0.5, 0.16, 0.16), toon(dk), Vector3(0.3, 0.26, 0))
			part(g, mesh("sph", 0.07), glow(Color("#7af0ff"), 2.5), Vector3(0.56, 0.26, 0))
		"bucket":
			part(g, mesh("cyl", 0.45, 0.6, 0.3), toon(mt, 0.0, 0.6), Vector3(0.75, 0.1, 0), Vector3(0, 0, -100))
			part(g, mesh("cyl", 0.4, 0.05), glow(tc, 1.4), Vector3(1.03, 0.12, 0), Vector3(0, 0, -100))
			part(g, mesh("box", 0.5, 0.12, 0.12), toon(dk), Vector3(0.25, 0, 0))
		"gatling":
			part(g, mesh("cyl", 0.3, 0.5), toon(dk), Vector3(0.25, 0, 0), Vector3(0, 0, -90))
			for i in 6:
				var a := i * TAU / 6
				part(g, mesh("cyl", 0.07, 1.2), toon(mt, 0.0, 0.8), Vector3(0.95, cos(a) * 0.17, sin(a) * 0.17), Vector3(0, 0, -90))
			part(g, mesh("torus", 0.2, 0.28), toon(tc), Vector3(1.3, 0, 0), Vector3(0, 0, 90))
		"mortar":
			part(g, mesh("cyl", 0.3, 1.1), toon(tc, 0.0, 0.5), Vector3(-0.3, 0.75, -0.6), Vector3(0, 0, -35))
			part(g, mesh("torus", 0.28, 0.36), toon(dk), Vector3(-0.0, 1.15, -0.6), Vector3(0, 0, 55))
			part(g, mesh("box", 0.5, 0.3, 0.4), toon(dk), Vector3(-0.5, 0.35, -0.6))
		"fist", "wrecker":
			if id == "fist":
				for zz in [0.0, -1.76]:
					part(g, mesh("box", 0.62, 0.62, 0.62), toon(tc, 0.0, 0.5), Vector3(0.6, -0.1, zz))
					part(g, mesh("box", 0.2, 0.5, 0.64), toon(dk), Vector3(0.95, -0.1, zz))
			else:
				part(g, mesh("cyl", 0.07, 1.6), toon(Color("#8a5a34")), Vector3(0.6, 0.1, 0), Vector3(0, 0, -60))
				part(g, mesh("box", 0.6, 0.65, 0.95), toon(mt, 0.0, 0.8), Vector3(1.25, 0.5, 0))
				part(g, mesh("box", 0.62, 0.2, 0.97), toon(tc), Vector3(1.25, 0.5, 0))
		"slinger":
			part(g, mesh("cyl", 0.06, 0.6), toon(Color("#8a5a34")), Vector3(0.4, 0, 0), Vector3(0, 0, -90))
			for zz in [-0.22, 0.22]: part(g, mesh("cyl", 0.05, 0.5), toon(Color("#8a5a34")), Vector3(0.8, 0.2, zz), Vector3(zz * 80, 0, -50))
			part(g, mesh("sph", 0.17), toon(tc, 0.4), Vector3(0.95, 0.3, 0))
		"dozer":
			part(g, mesh("box", 0.18, 0.75, 2.2), toon(Color("#ffb000"), 0.0, 0.5), Vector3(1.0, -0.35, -0.85))
			part(g, mesh("box", 0.2, 0.1, 2.22), toon(dk), Vector3(1.05, -0.7, -0.85))
			for zz in [-0.2, -1.5]: part(g, mesh("box", 0.8, 0.12, 0.12), toon(dk), Vector3(0.5, -0.3, zz))
		"flamer":
			for zz in [-0.6, -1.0]: part(g, mesh("cyl", 0.22, 0.9), toon(Color("#ff7a2e"), 0.0, 0.5), Vector3(-1.0, 0.3, zz + 0.2))
			part(g, mesh("cyl", 0.1, 0.9), toon(dk), Vector3(0.55, 0, 0), Vector3(0, 0, -90))
			part(g, mesh("cyl", 0.17, 0.2, 0.1), toon(mt), Vector3(1.05, 0, 0), Vector3(0, 0, -90))
			part(g, mesh("sph", 0.07), glow(Color("#ffb000"), 3.0), Vector3(1.18, -0.1, 0))
		"carrier":
			part(g, mesh("box", 0.9, 0.3, 0.6), toon(dk), Vector3(-0.2, 0.75, -0.6))
			for i in 3:
				part(g, mesh("sph", 0.14), toon(tc, 0.3), Vector3(-0.5 + i * 0.3, 1.0, -0.6))
				part(g, mesh("cyl", 0.16, 0.03), toon(mt, 0.0, 0.4, false), Vector3(-0.5 + i * 0.3, 1.13, -0.6))
			part(g, mesh("box", 0.5, 0.25, 0.25), toon(dk), Vector3(0.35, 0, 0))
		"megaphone":
			part(g, mesh("cyl", 0.55, 0.9, 0.16), toon(tc, 0.1, 0.5), Vector3(0.95, 0.1, 0), Vector3(0, 0, -90))
			part(g, mesh("cyl", 0.5, 0.04), glow(Color("#7af0ff"), 1.4), Vector3(1.4, 0.1, 0), Vector3(0, 0, -90))
			part(g, mesh("box", 0.4, 0.3, 0.3), toon(dk), Vector3(0.3, 0, 0))
		"riot":
			part(g, mesh("box", 0.14, 1.3, 1.1), toon(Color("#3a4a66"), 0.0, 0.6), Vector3(0.95, 0.0, -1.78))
			part(g, mesh("box", 0.16, 0.14, 1.12), toon(Color("#7af0ff"), 1.5), Vector3(0.96, 0.3, -1.78))
			part(g, mesh("cyl", 0.06, 0.9), toon(dk), Vector3(0.6, 0, 0), Vector3(0, 0, -90))
			part(g, mesh("sph", 0.09), glow(Color("#7af0ff"), 2.5), Vector3(1.06, 0, 0))
		"blade":
			part(g, mesh("box", 0.3, 0.12, 0.12), toon(dk), Vector3(0.2, 0, 0))
			part(g, mesh("box", 1.6, 0.06, 0.22), toon(Color("#dfe6ee"), 0.0, 0.9), Vector3(1.15, 0.05, 0))
			part(g, mesh("box", 1.55, 0.03, 0.06), glow(tc, 2.5), Vector3(1.15, 0.05, 0.12))
		"stinger":
			part(g, mesh("box", 0.8, 0.22, 0.24), toon(dk), Vector3(0.35, 0, 0))
			for i in 3: part(g, mesh("cone", 0.04, 0.4), glow(Color("#9cff2e"), 2.0), Vector3(0.95, -0.06 + i * 0.06, 0), Vector3(0, 0, -90))
		"phantom":
			part(g, mesh("box", 0.7, 0.26, 0.3), toon(Color("#2a1f3a")), Vector3(0.4, 0, 0))
			part(g, mesh("cyl", 0.11, 0.5), toon(dk), Vector3(0.95, 0, 0), Vector3(0, 0, -90))
			part(g, mesh("box", 0.6, 0.04, 0.32), glow(Color("#b06bff"), 1.8), Vector3(0.4, 0.14, 0))
		"warden":
			part(g, mesh("cyl", 0.05, 1.7), toon(Color("#3a2a1c")), Vector3(0.6, 0.25, 0), Vector3(0, 0, -70))
			part(g, mesh("sph", 0.2), glow(tc, 2.0), Vector3(1.4, 0.55, 0))
			part(g, mesh("torus", 0.26, 0.31), glow(Color("#d8b25a"), 1.6), Vector3(1.4, 0.55, 0), Vector3(0, 0, 90))
		"reaper":
			part(g, mesh("cyl", 0.05, 1.5), toon(Color("#1d1a26")), Vector3(0.55, 0.2, 0), Vector3(0, 0, -70))
			part(g, mesh("box", 1.0, 0.06, 0.3), toon(Color("#dfe6ee"), 0.0, 0.9), Vector3(1.45, 0.65, 0), Vector3(0, 0, 25))
			part(g, mesh("box", 0.95, 0.03, 0.06), glow(tc, 2.5), Vector3(1.47, 0.7, 0.16), Vector3(0, 0, 25))
		"tactic":
			part(g, mesh("box", 1.0, 0.28, 0.26), toon(Color("#5a5240")), Vector3(0.45, 0, 0))
			part(g, mesh("cyl", 0.06, 0.9), toon(dk), Vector3(1.3, 0.03, 0), Vector3(0, 0, -90))
			part(g, mesh("box", 0.4, 0.14, 0.14), toon(dk), Vector3(0.5, 0.24, 0))
			part(g, mesh("box", 0.16, 0.36, 0.14), toon(tc), Vector3(0.45, -0.28, 0))
		"prism":
			part(g, mesh("box", 0.8, 0.32, 0.32), toon(wh, 0.0, 0.7), Vector3(0.3, 0, 0))
			part(g, mesh("cyl", 0.1, 1.4), toon(dk), Vector3(1.2, 0.03, 0), Vector3(0, 0, -90))
			for x in [0.9, 1.25, 1.6]: part(g, mesh("torus", 0.12, 0.18), glow(tc, 2.0), Vector3(x, 0.03, 0), Vector3(0, 0, 90))
			part(g, mesh("prism", 0.35, 0.4, 0.35), glow(Color("#9ffcff"), 1.8), Vector3(2.0, 0.03, 0), Vector3(0, 0, -90))
		"lancer":
			part(g, mesh("cyl", 0.06, 2.3), toon(dk), Vector3(1.1, 0, 0), Vector3(0, 0, -90))
			part(g, mesh("cyl", 0.4, 0.15, 0.25), toon(wh), Vector3(0.25, 0, 0), Vector3(0, 0, -90))
			part(g, mesh("cone", 0.14, 0.7), glow(tc, 2.2), Vector3(2.55, 0, 0), Vector3(0, 0, -90))
		_:
			part(g, mesh("box", 0.6, 0.35, 0.35), toon(dk), Vector3(0.3, 0, 0))
			part(g, mesh("cyl", 0.12, 0.6), toon(mt), Vector3(0.8, 0, 0), Vector3(0, 0, -90))

# ---------------- 召唤物 / 区域 ----------------
static func build_helper(h: Dictionary, tc: Color) -> Node3D:
	var g := Node3D.new()
	var dk := Color("#262838")
	match str(h.kind):
		"turret":
			part(g, mesh("cyl", 0.5, 0.4, 0.6), toon(dk), Vector3(0, 0.2, 0))
			var head := Node3D.new(); head.name = "head"; head.position = Vector3(0, 0.75, 0); g.add_child(head)
			part(head, mesh("box", 0.6, 0.45, 0.55), toon(tc, 0.2), Vector3.ZERO)
			part(head, mesh("cyl", 0.08, 0.7), toon(dk), Vector3(0.55, 0, 0), Vector3(0, 0, -90))
			part(head, mesh("sph", 0.07), glow(Color("#ff3b52"), 3.0), Vector3(0.31, 0.12, 0))
		"drone", "recon":
			part(g, mesh("sph", 0.32), toon(tc, 0.3), Vector3.ZERO, Vector3.ZERO, Vector3(1, 0.6, 1))
			var rot := Node3D.new(); rot.name = "rotor"; g.add_child(rot)
			for a in [0, 90]: part(rot, mesh("box", 1.0, 0.03, 0.1), toon(dk, 0.0, 0.4, false), Vector3(0, 0.22, 0), Vector3(0, a, 0))
			part(g, mesh("sph", 0.08), glow(Color("#ff3b52") if h.kind == "drone" else Color("#7ad0ff"), 3.0), Vector3(0.28, -0.05, 0))
		"bento":
			if h.gift:
				part(g, mesh("box", 0.6, 0.5, 0.6), toon(tc, 0.3), Vector3(0, 0.3, 0))
				part(g, mesh("box", 0.64, 0.12, 0.64), toon(Color("#ffe14d")), Vector3(0, 0.45, 0))
			else:
				part(g, mesh("box", 0.7, 0.3, 0.5), toon(Color("#ff9f2e")), Vector3(0, 0.15, 0))
				part(g, mesh("box", 0.72, 0.08, 0.52), toon(Color.WHITE), Vector3(0, 0.32, 0))
		"supply":
			part(g, mesh("box", 1.2, 0.9, 1.2), toon(Color("#5a5240")), Vector3(0, 0.45, 0))
			part(g, mesh("box", 1.22, 0.16, 1.22), toon(Color("#e0a030"), 0.4), Vector3(0, 0.7, 0))
		"charge":
			part(g, mesh("box", 0.5, 0.35, 0.4), toon(Color("#c8102e")), Vector3(0, 0.2, 0))
			part(g, mesh("sph", 0.08), glow(Color("#ffe14d"), 3.0), Vector3(0, 0.45, 0))
		"wall":
			part(g, mesh("box", 0.25, 4.6, 10.0), glow(tc, 1.2, 0.35), Vector3(0, 2.3, 0))
			part(g, mesh("box", 0.3, 0.12, 10.1), glow(tc, 2.5), Vector3(0, 4.6, 0))
		"decoy":
			part(g, mesh("box", 1.2, 0.9, 1.3), glass(tc, 0.45), Vector3(0, 1.4, 0))
			part(g, mesh("sph", 0.5), glass(tc, 0.3), Vector3(0, 2.1, 0))
		"dome", "nano", "fog", "fire", "sealz", "phase":
			var r := float(h.r) / 16.0
			var col: Color = {"dome": tc, "nano": Color("#5ff0d0"), "fog": Color("#9cff2e"), "fire": Color("#ff6a1f"), "sealz": Color("#d8b25a"), "phase": Color("#9ffcff")}[h.kind]
			part(g, mesh("cyl", 1.0, 0.06), glow(col, 1.0, 0.22), Vector3(0, 0.08, 0), Vector3.ZERO, Vector3(r, 1, r))
			part(g, mesh("torus", 0.95, 1.0), glow(col, 2.2, 0.85), Vector3(0, 0.12, 0), Vector3.ZERO, Vector3(r, 1, r))
			if h.kind == "dome":
				part(g, mesh("sph", 1.0), glow(col, 1.0, 0.12), Vector3.ZERO, Vector3.ZERO, Vector3(r, r * 0.6, r))
	return g
