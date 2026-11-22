# 涂鸦机兵 电脑版 3.2 —— 机兵 3D 模型（重做）
# 每台机体按定位分底盘：轻型侦察 / 重装格斗 / 炮台 / 刺客 / 支援，另外坦克履带和悬浮推进两种特殊下盘
# 圆角装甲（Chars.rbox）、分色面板、装甲缝、散热格栅、指示灯、背包 / 天线 / 尾鳍等专属部件；武器还是 Models.build_weapon
# 接口和以前一样：返回 {root, rig, body, legs, gun, ball, foot, parts, scale}；body 的原点在髋部（y = 0.95）
class_name Mech3D
extends RefCounted

# weapon → [底盘, 下盘]
const DESIGN := {
	"blaster": ["scout", "biped"], "slinger": ["scout", "biped"], "stinger": ["scout", "digi"], "tactic": ["scout", "biped"], "halo": ["scout", "digi"],
	"fist": ["brawler", "biped"], "wrecker": ["brawler", "biped"], "riot": ["brawler", "biped"], "vigil": ["brawler", "biped"], "roller": ["brawler", "biped"],
	"dozer": ["brawler", "tread"], "gatling": ["artillery", "tread"],
	"mortar": ["artillery", "digi"], "charger": ["artillery", "digi"], "prism": ["artillery", "digi"], "megaphone": ["artillery", "biped"],
	"blade": ["striker", "digi"], "phantom": ["striker", "digi"], "lancer": ["striker", "digi"], "reaper": ["striker", "digi"], "chord": ["striker", "biped"],
	"bucket": ["support", "biped"], "flamer": ["support", "biped"], "warden": ["support", "biped"], "carrier": ["support", "hover"],
}

static func T(c: Color, emit := 0.0, gloss := 0.45, outline := true) -> ShaderMaterial: return Models.toon(c, emit, gloss, outline)
static func RB(size: Vector3, r: float) -> ArrayMesh: return Chars.rbox(size, r)
static func add(parent: Node3D, mesh: Mesh, mat: Material, pos: Vector3, rot := Vector3.ZERO, scl := Vector3.ONE) -> MeshInstance3D:
	return Chars.P_(parent, mesh, mat, pos, rot, scl)
static func M(kind: String, a := 1.0, b := 1.0, c := 1.0) -> Mesh: return Models.mesh(kind, a, b, c)

static func build(weapon: String, w: Dictionary, tc: Color, P: Dictionary, paint = null) -> Dictionary:
	var D: Array = DESIGN.get(weapon, ["scout", "biped"])
	var chassis: String = D[0]; var legs_kind: String = D[1]
	var root := Node3D.new()
	var rig := Node3D.new(); root.add_child(rig)
	var hp := float(w.hp)
	var s := 1.12 if hp >= 160 else (0.92 if hp <= 95 else 1.0)
	rig.scale = Vector3.ONE * s
	var dk := Color("#262838"); var mt := Color("#9aa3bd"); var wh := Color("#f4f0ea")
	if paint != null: dk = Color(str(paint.frame)); wh = Color(str(paint.light)); mt = Color(str(paint.joint))
	var acc := Color(str(P.get("accent", "#ffd23f")))
	var C := {"tc": tc, "td": tc.darkened(0.35), "tl": tc.lightened(0.25), "dk": dk, "mt": mt, "wh": wh, "acc": acc}
	# ---------- 下盘 ----------
	var legs: Array = []
	match legs_kind:
		"biped": legs = legs_biped(rig, C, chassis)
		"digi": legs = legs_digi(rig, C)
		"tread": legs = legs_tread(rig, C)
		"hover": legs = legs_hover(rig, C)
	# ---------- 躯干 ----------
	var body := Node3D.new(); body.position = Vector3(0, 0.95, 0); rig.add_child(body)
	var gun_z := 0.88
	match chassis:
		"scout": gun_z = torso_scout(body, C)
		"brawler": gun_z = torso_brawler(body, C)
		"artillery": gun_z = torso_artillery(body, C, weapon)
		"striker": gun_z = torso_striker(body, C)
		"support": gun_z = torso_support(body, C)
	# 驾驶舱：玻璃罩里是驾驶员的上半身
	var cock_y: float = {"scout": 1.18, "brawler": 1.3, "artillery": 1.22, "striker": 1.12, "support": 1.2}[chassis]
	var pil: Dictionary = Chars.build_char(P, tc, true)
	pil.root.scale = Vector3.ONE * 0.6; pil.root.position = Vector3(0.06, cock_y - 0.95, 0)
	pil.arms[0].rotation_degrees = Vector3(-20, 0, 40); pil.arms[1].rotation_degrees = Vector3(20, 0, 40)
	body.add_child(pil.root)
	add(body, M("sph", 0.46), Models.glass(Color("#e6f8ff"), 0.13), Vector3(0.02, cock_y + 0.02, 0), Vector3.ZERO, Vector3(1.0, 0.95, 1.0))
	add(body, M("torus", 0.46, 0.56), T(C.dk), Vector3(0.02, cock_y - 0.24, 0))
	add(body, M("torus", 0.44, 0.5), T(C.acc, 0.15), Vector3(0.02, cock_y - 0.2, 0))
	arm_left(body, C, -gun_z, chassis)
	# 武器（右手）
	var gun := Node3D.new(); gun.position = Vector3(0.35, 0.5, gun_z); body.add_child(gun)
	Models.build_weapon(weapon, gun, tc, body)
	# 滚轮形态
	var ball := Node3D.new(); root.add_child(ball); ball.visible = false
	add(ball, M("sph", 0.82), T(tc, 0.15, 0.6), Vector3(0, 0.82, 0))
	add(ball, M("torus", 0.78, 0.9), T(C.wh), Vector3(0, 0.82, 0), Vector3(90, 0, 0))
	for k in 4: add(ball, RB(Vector3(0.16, 0.1, 0.3), 0.04), T(C.dk), Vector3(cos(k * TAU / 4) * 0.82, 0.82 + sin(k * TAU / 4) * 0.82, 0), Vector3(0, 0, rad_to_deg(k * TAU / 4)))
	# 弹出的驾驶员（全身）
	var foot := Models.build_pilot(P, tc); root.add_child(foot); foot.visible = false
	var parts: Array = []
	Models._collect(root, parts)
	return {"root": root, "rig": rig, "body": body, "legs": legs, "gun": gun, "ball": ball, "foot": foot, "parts": parts, "scale": s}

# 胸甲：两片斜着的装甲板 + 中间的发光徽记 + 装甲缝
static func chest(b: Node3D, C: Dictionary, x: float, y: float, w: float) -> void:
	for zs in [-1.0, 1.0]:
		add(b, RB(Vector3(0.1, 0.36, w * 0.36), 0.04), T(C.wh), Vector3(x, y, zs * w * 0.27), Vector3(zs * -10, 0, 0))
		add(b, RB(Vector3(0.105, 0.05, w * 0.3), 0.015), T(C.acc, 0.1), Vector3(x + 0.005, y + 0.12, zs * w * 0.27), Vector3(zs * -10, 0, 0))
	add(b, M("cyl", 0.1, 0.06), T(C.dk), Vector3(x + 0.02, y, 0), Vector3(0, 0, 90))
	add(b, M("cyl", 0.065, 0.07), Models.glow(C.tl, 1.25), Vector3(x + 0.03, y, 0), Vector3(0, 0, 90))
	add(b, RB(Vector3(0.09, 0.03, w * 0.9), 0.01), T(C.dk, 0.0, 0.2, false), Vector3(x - 0.01, y - 0.24, 0))

# 左臂：肩关节 + 上臂 + 前臂护甲 + 拳头（右手拿着武器）
static func arm_left(b: Node3D, C: Dictionary, z: float, chassis: String) -> void:
	var k := 1.25 if chassis == "brawler" else (0.85 if chassis == "striker" else 1.0)
	var sh := Node3D.new(); sh.position = Vector3(0.05, 0.62, z); b.add_child(sh)
	add(sh, M("sph", 0.15 * k), T(C.mt, 0.0, 0.7), Vector3.ZERO)
	add(sh, RB(Vector3(0.2, 0.32, 0.2) * k, 0.06 * k), T(C.dk), Vector3(0.06, -0.2 * k, 0), Vector3(0, 0, -20))
	add(sh, RB(Vector3(0.26, 0.3, 0.26) * k, 0.08 * k), T(C.tc), Vector3(0.2, -0.42 * k, 0), Vector3(0, 0, -50))
	add(sh, RB(Vector3(0.06, 0.24, 0.2) * k, 0.02), T(C.wh), Vector3(0.3, -0.38 * k, 0), Vector3(0, 0, -50))
	add(sh, RB(Vector3(0.2, 0.2, 0.22) * k, 0.07 * k), T(C.dk), Vector3(0.38, -0.58 * k, 0))

# ---------------- 下盘 ----------------
static func legs_biped(rig: Node3D, C: Dictionary, chassis: String) -> Array:
	var out: Array = []
	var heavy := chassis == "brawler"
	var wz := 0.42 if heavy else 0.34
	for zz in [-wz, wz]:
		var hip := Node3D.new(); hip.position = Vector3(0, 0.95, zz); rig.add_child(hip)
		add(hip, M("sph", 0.16 if heavy else 0.13), T(C.mt, 0.0, 0.7), Vector3.ZERO)
		add(hip, RB(Vector3(0.34 if heavy else 0.26, 0.42, 0.34 if heavy else 0.26), 0.08), T(C.dk), Vector3(0, -0.2, 0))
		add(hip, RB(Vector3(0.06, 0.3, 0.2), 0.02), T(C.tc), Vector3(0.15 if heavy else 0.12, -0.2, 0))
		add(hip, M("sph", 0.13 if heavy else 0.11), T(C.mt, 0.0, 0.7), Vector3(0.02, -0.46, 0))
		add(hip, RB(Vector3(0.3 if heavy else 0.24, 0.36, 0.3 if heavy else 0.24), 0.08), T(C.td), Vector3(0.03, -0.66, 0))
		add(hip, RB(Vector3(0.16, 0.16, 0.24), 0.05), T(C.wh), Vector3(0.16 if heavy else 0.13, -0.52, 0), Vector3(0, 0, 12))   # 护膝
		add(hip, RB(Vector3(0.62 if heavy else 0.5, 0.16, 0.42 if heavy else 0.34), 0.06), T(C.tc), Vector3(0.1, -0.87, 0))
		add(hip, RB(Vector3(0.2, 0.06, 0.4 if heavy else 0.32), 0.02), T(C.wh), Vector3(0.34 if heavy else 0.28, -0.86, 0))
		add(hip, RB(Vector3(0.62 if heavy else 0.5, 0.04, 0.43 if heavy else 0.35), 0.015), T(C.dk), Vector3(0.1, -0.945, 0))
		out.append(hip)
	return out

static func legs_digi(rig: Node3D, C: Dictionary) -> Array:   # 反关节腿：大腿往前、小腿往后，脚是两趾爪
	var out: Array = []
	for zz in [-0.33, 0.33]:
		var hip := Node3D.new(); hip.position = Vector3(0, 0.95, zz); rig.add_child(hip)
		add(hip, M("sph", 0.12), T(C.mt, 0.0, 0.7), Vector3.ZERO)
		add(hip, RB(Vector3(0.18, 0.4, 0.2), 0.06), T(C.dk), Vector3(0.1, -0.16, 0), Vector3(0, 0, -30))
		add(hip, M("sph", 0.1), T(C.mt, 0.0, 0.7), Vector3(0.2, -0.36, 0))
		add(hip, RB(Vector3(0.14, 0.42, 0.16), 0.05), T(C.td), Vector3(0.08, -0.6, 0), Vector3(0, 0, 28))
		add(hip, RB(Vector3(0.05, 0.3, 0.12), 0.02), T(C.tc), Vector3(0.12, -0.58, 0), Vector3(0, 0, 28))
		add(hip, M("sph", 0.08), T(C.mt, 0.0, 0.7), Vector3(-0.02, -0.82, 0))
		for zs in [-1.0, 1.0]: add(hip, RB(Vector3(0.38, 0.08, 0.1), 0.03), T(C.tc), Vector3(0.12, -0.9, zs * 0.08), Vector3(0, zs * -12, 0))
		add(hip, RB(Vector3(0.16, 0.07, 0.1), 0.03), T(C.dk), Vector3(-0.14, -0.9, 0))
		out.append(hip)
	return out

static func legs_tread(rig: Node3D, C: Dictionary) -> Array:   # 坦克履带
	var out: Array = []
	for zz in [-0.5, 0.5]:
		var tr := Node3D.new(); tr.position = Vector3(0, 0.0, zz); rig.add_child(tr)
		add(tr, RB(Vector3(1.5, 0.5, 0.34), 0.2), T(C.dk), Vector3(0, 0.3, 0))
		for k in 5: add(tr, M("cyl", 0.17, 0.36), T(C.mt, 0.0, 0.6), Vector3(-0.56 + k * 0.28, 0.24, 0), Vector3(90, 0, 0))
		add(tr, RB(Vector3(1.3, 0.12, 0.38), 0.04), T(C.tc), Vector3(0, 0.6, 0))
		for k in 9: add(tr, RB(Vector3(0.06, 0.04, 0.36), 0.01), T(C.dk.lightened(0.15), 0.0, 0.3, false), Vector3(-0.64 + k * 0.16, 0.555, 0))
		var dummy := Node3D.new(); dummy.position = Vector3(0, 0.95, zz); rig.add_child(dummy)
		out.append(dummy)
	add(rig, RB(Vector3(0.9, 0.3, 0.7), 0.1), T(C.dk), Vector3(0, 0.72, 0))
	return out

static func legs_hover(rig: Node3D, C: Dictionary) -> Array:   # 悬浮推进：没有腿，底下两个推进器在发光
	var out: Array = []
	for zz in [-0.36, 0.36]:
		var th := Node3D.new(); th.position = Vector3(0, 0.95, zz); rig.add_child(th)
		add(th, M("cyl", 0.2, 0.36, 0.14), T(C.dk), Vector3(0, -0.4, 0))
		add(th, M("torus", 0.15, 0.22), T(C.tc), Vector3(0, -0.56, 0))
		add(th, M("cone", 0.13, 0.32), Models.glow(Color("#7af0ff"), 1.4, 0.7), Vector3(0, -0.76, 0), Vector3(180, 0, 0))
		out.append(th)
	return out

# ---------------- 躯干（返回武器挂点的 z） ----------------
static func vents(parent: Node3D, C: Dictionary, pos: Vector3, n: int, w: float) -> void:
	for k in n: add(parent, RB(Vector3(0.03, 0.035, w), 0.01), T(C.dk, 0.0, 0.2, false), pos + Vector3(0, -k * 0.06, 0))

static func lights(parent: Node3D, c: Color, pos: Vector3, n: int) -> void:
	for k in n: add(parent, M("sph", 0.035), Models.glow(c, 1.4), pos + Vector3(0, 0, (k - (n - 1) / 2.0) * 0.1))

static func torso_scout(b: Node3D, C: Dictionary) -> float:
	add(b, RB(Vector3(0.7, 0.3, 0.86), 0.1), T(C.dk), Vector3(0, 0.12, 0))
	add(b, RB(Vector3(1.0, 0.72, 1.16), 0.22), T(C.tc, 0.0, 0.55), Vector3(0, 0.52, 0))
	chest(b, C, 0.5, 0.5, 0.8)
	add(b, RB(Vector3(1.02, 0.1, 1.18), 0.04), T(C.acc), Vector3(0, 0.22, 0))
	vents(b, C, Vector3(-0.5, 0.62, 0), 4, 0.5)
	for zs in [-1.0, 1.0]:
		add(b, M("sph", 0.26), T(C.td, 0.0, 0.5), Vector3(0, 0.82, zs * 0.62), Vector3.ZERO, Vector3(1.1, 0.8, 0.9))
		add(b, RB(Vector3(0.3, 0.06, 0.2), 0.02), T(C.wh), Vector3(0.05, 0.98, zs * 0.62))
	add(b, M("cyl", 0.025, 0.5), T(C.dk, 0.0, 0.4, false), Vector3(-0.32, 1.55, 0.3))
	add(b, M("sph", 0.06), Models.glow(C.tc, 1.6), Vector3(-0.32, 1.8, 0.3))
	add(b, RB(Vector3(0.35, 0.45, 0.6), 0.1), T(C.dk), Vector3(-0.62, 0.55, 0))   # 小背包
	lights(b, Color("#ffd23f"), Vector3(-0.8, 0.62, 0), 2)
	return 0.82

static func torso_brawler(b: Node3D, C: Dictionary) -> float:
	add(b, RB(Vector3(0.86, 0.34, 1.0), 0.12), T(C.dk), Vector3(0, 0.14, 0))
	add(b, RB(Vector3(1.24, 0.92, 1.4), 0.24), T(C.tc, 0.0, 0.5), Vector3(0, 0.6, 0))
	chest(b, C, 0.62, 0.56, 1.0)
	add(b, RB(Vector3(1.26, 0.12, 1.42), 0.05), T(C.acc), Vector3(0, 0.22, 0))
	for zs in [-1.0, 1.0]:   # 大肩甲
		add(b, RB(Vector3(0.62, 0.42, 0.42), 0.14), T(C.td, 0.0, 0.5), Vector3(0, 0.96, zs * 0.86))
		add(b, RB(Vector3(0.5, 0.1, 0.44), 0.04), T(C.wh), Vector3(0.04, 1.2, zs * 0.86))
		add(b, RB(Vector3(0.1, 0.24, 0.3), 0.04), T(C.tc), Vector3(0.33, 0.95, zs * 0.86))
	add(b, RB(Vector3(0.5, 0.8, 1.0), 0.14), T(C.dk), Vector3(-0.8, 0.6, 0))
	for zs in [-1.0, 1.0]: add(b, M("cyl", 0.14, 0.4), T(C.mt, 0.0, 0.7), Vector3(-1.1, 0.68, zs * 0.28), Vector3(0, 0, 90))   # 排气管
	vents(b, C, Vector3(-1.06, 0.95, 0), 3, 0.5)
	return 0.98

static func torso_artillery(b: Node3D, C: Dictionary, weapon: String) -> float:
	add(b, RB(Vector3(0.74, 0.3, 0.9), 0.1), T(C.dk), Vector3(0, 0.12, 0))
	add(b, RB(Vector3(1.1, 0.78, 1.2), 0.2), T(C.tc, 0.0, 0.5), Vector3(0, 0.54, 0))
	chest(b, C, 0.55, 0.52, 0.86)
	add(b, RB(Vector3(1.12, 0.1, 1.22), 0.04), T(C.acc), Vector3(0, 0.2, 0))
	# 背后的炮塔 / 弹药舱 / 天线（不同武器不一样）
	add(b, RB(Vector3(0.62, 0.9, 0.9), 0.14), T(C.td), Vector3(-0.78, 0.78, 0))
	match weapon:
		"mortar", "gatling":
			for zs in [-1.0, 1.0]: add(b, RB(Vector3(0.4, 0.5, 0.26), 0.08), T(C.wh), Vector3(-0.78, 1.32, zs * 0.26))
			lights(b, Color("#ff8a1f"), Vector3(-1.1, 1.0, 0), 3)
		"charger", "prism":
			add(b, M("cyl", 0.03, 1.2), T(C.dk, 0.0, 0.4, false), Vector3(-0.8, 1.7, 0.32))
			add(b, M("cyl", 0.03, 0.9), T(C.dk, 0.0, 0.4, false), Vector3(-0.8, 1.55, -0.3))
			add(b, M("torus", 0.12, 0.18), Models.glow(C.tc, 1.4), Vector3(-0.8, 2.3, 0.32), Vector3(0, 0, 90))
			add(b, RB(Vector3(0.3, 0.12, 0.7), 0.04), Models.glow(Color("#7af0ff"), 1.2), Vector3(-0.6, 1.2, 0))
		"megaphone":
			for zs in [-1.0, 1.0]: add(b, M("cyl", 0.24, 0.36, 0.1), T(C.wh), Vector3(-0.78, 1.32, zs * 0.3), Vector3(0, 0, 70))
	for zs in [-1.0, 1.0]: add(b, M("sph", 0.24), T(C.td), Vector3(0, 0.86, zs * 0.64), Vector3.ZERO, Vector3(1.1, 0.8, 0.9))
	vents(b, C, Vector3(-1.1, 0.62, 0), 4, 0.6)
	return 0.86

static func torso_striker(b: Node3D, C: Dictionary) -> float:   # 刺客：楔形瘦身躯 + 背鳍 + 刀翼
	add(b, RB(Vector3(0.62, 0.26, 0.76), 0.08), T(C.dk), Vector3(0, 0.1, 0))
	var core := add(b, RB(Vector3(0.96, 0.66, 1.0), 0.18), T(C.tc, 0.0, 0.6), Vector3(0, 0.5, 0))
	core.rotation_degrees.z = -6
	add(b, M("prism", 0.5, 0.36, 0.86), T(C.wh), Vector3(0.42, 0.56, 0), Vector3(0, 0, -90))
	add(b, RB(Vector3(0.98, 0.07, 1.02), 0.025), Models.glow(C.acc, 1.2), Vector3(0, 0.24, 0))
	for zs in [-1.0, 1.0]:
		add(b, RB(Vector3(0.44, 0.22, 0.26), 0.07), T(C.td), Vector3(0.02, 0.82, zs * 0.56), Vector3(zs * 12, 0, 0))
		var fin := add(b, M("prism", 0.7, 0.36, 0.04), T(C.dk), Vector3(-0.55, 1.0, zs * 0.34), Vector3(zs * -20, 0, 60))   # 刀翼
		add(fin, M("box", 0.6, 0.02, 0.05), Models.glow(C.tc, 1.3), Vector3(0, 0.12, 0))
	add(b, RB(Vector3(0.38, 0.5, 0.5), 0.1), T(C.dk), Vector3(-0.56, 0.5, 0))
	lights(b, C.tc, Vector3(-0.76, 0.56, 0), 2)
	return 0.76

static func torso_support(b: Node3D, C: Dictionary) -> float:   # 支援：圆鼓鼓的身体 + 罐子 + 天线盘
	add(b, RB(Vector3(0.78, 0.3, 0.92), 0.12), T(C.dk), Vector3(0, 0.12, 0))
	add(b, M("sph", 0.66), T(C.tc, 0.0, 0.55), Vector3(0, 0.56, 0), Vector3.ZERO, Vector3(1.0, 0.8, 1.06))
	chest(b, C, 0.58, 0.52, 0.8)
	add(b, M("torus", 0.62, 0.7), T(C.acc), Vector3(0, 0.36, 0))
	for zs in [-1.0, 1.0]:   # 两个储罐
		add(b, M("cyl", 0.17, 0.62), T(C.wh), Vector3(-0.6, 0.62, zs * 0.3))
		add(b, M("cyl", 0.18, 0.08), T(C.tc), Vector3(-0.6, 0.62, zs * 0.3))
		add(b, M("sph", 0.17), T(C.wh), Vector3(-0.6, 0.93, zs * 0.3))
	add(b, M("cyl", 0.025, 0.4), T(C.dk, 0.0, 0.4, false), Vector3(-0.3, 1.55, -0.3))
	add(b, M("cyl", 0.22, 0.04, 0.1), T(C.wh), Vector3(-0.3, 1.78, -0.3), Vector3(0, 0, 30))   # 天线盘
	lights(b, Color("#6dff8a"), Vector3(-0.82, 0.62, 0), 2)
	return 0.84
