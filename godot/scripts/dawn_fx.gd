# 涂鸦机兵 电脑版 3.1 ——「黎明之后」联动的画面：光轮、共鸣索、谐振网、夜幕盾、日晷圈、回响环、灼光、夜债、长夜黑幕
# game.gd 每帧调用 DawnFx.update(game, delta)，事件调用 DawnFx.event(game, e)
class_name DawnFx
extends RefCounted

const K := 1.0 / 16.0
const PH_COLS := [Color("#ffd27a"), Color("#fff4c8"), Color("#ff8a3a"), Color("#7a6aff")]   # 破晓 / 正午 / 黄昏 / 夜
const CYAN := Color("#7ad8ff")
const VIOLET := Color("#9a7aff")

static func wpos(p, dy := 0.0) -> Vector3: return Vector3(p.x * K, p.z * K + dy, p.y * K)

static func line_mesh(c: Color, alpha := 0.9, r := 0.06) -> MeshInstance3D:
	var mi := MeshInstance3D.new(); mi.mesh = Models.mesh("cyl", r, 1.0); mi.material_override = Models.glow(c, 1.5, alpha)
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	return mi

static func put_line(mi: MeshInstance3D, a: Vector3, b: Vector3, wobble := 0.0) -> void:
	var d := b - a; var L := d.length()
	if L < 0.01: mi.visible = false; return
	mi.visible = true
	var up := d / L
	var x := up.cross(Vector3.FORWARD if absf(up.dot(Vector3.FORWARD)) < 0.95 else Vector3.RIGHT).normalized()
	var z := x.cross(up)
	mi.basis = Basis(x, up * L, z) * Basis.from_scale(Vector3(1.0 + wobble, 1.0, 1.0 + wobble))
	mi.position = (a + b) * 0.5

static func nodes_of(g, p) -> Dictionary:
	if g.dawn_nodes.has(p.id): return g.dawn_nodes[p.id]
	var n := {}
	var root := Node3D.new(); g.add_child(root); n.root = root
	# 光轮
	var disc := Node3D.new(); root.add_child(disc); disc.visible = false
	Models.part(disc, Models.mesh("torus", 0.45, 0.66), Models.toon(Color("#ffd27a"), 0.5, 0.8, false), Vector3.ZERO)
	Models.part(disc, Models.mesh("cyl", 0.42, 0.06), Models.glow(Color("#fff0c0"), 1.2, 0.75), Vector3.ZERO)
	n.disc = disc
	# 共鸣索 + 分叉
	n.teth = line_mesh(CYAN, 0.9, 0.07); root.add_child(n.teth); n.teth.visible = false
	n.fork = line_mesh(CYAN, 0.6, 0.045); root.add_child(n.fork); n.fork.visible = false
	n.links = []
	for k in 3:
		var l := line_mesh(VIOLET.lerp(CYAN, 0.5), 0.75, 0.05); root.add_child(l); l.visible = false; n.links.append(l)
	# 夜幕盾
	var gd := MeshInstance3D.new(); gd.mesh = Models.mesh("cyl", 1.45, 1.6, 1.45); gd.material_override = Models.glow(VIOLET, 1.25, 0.28)
	gd.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF; root.add_child(gd); gd.visible = false; n.guard = gd
	# 日晷圈
	var dial := Node3D.new(); root.add_child(dial); dial.visible = false
	var ringm := MeshInstance3D.new(); ringm.mesh = Models.mesh("torus", 1.55, 1.7); dial.add_child(ringm); n.dial_ring = ringm
	for k in 4:
		var a := k * TAU / 4.0 - PI / 2
		Models.part(dial, Models.mesh("box", 0.32, 0.06, 0.32), Models.glow(PH_COLS[k], 1.3), Vector3(cos(a) * 1.62, 0, sin(a) * 1.62), Vector3(0, -a, 0))
	var hand := Node3D.new(); dial.add_child(hand); n.hand = hand
	Models.part(hand, Models.mesh("box", 1.25, 0.05, 0.08), Models.glow(Color.WHITE, 1.2), Vector3(0.62, 0.02, 0))
	n.dial = dial
	n.suns = []
	for k in 4:
		var sm := MeshInstance3D.new(); sm.mesh = Models.mesh("sph", 0.13); sm.material_override = Models.glow(Color("#ffc24a"), 1.4)
		root.add_child(sm); sm.visible = false; n.suns.append(sm)
	# 回响环（攒在身上的回响）
	var echo := MeshInstance3D.new(); echo.mesh = Models.mesh("torus", 0.95, 1.05); echo.material_override = Models.glow(CYAN, 1.4, 0.7)
	echo.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF; root.add_child(echo); echo.visible = false; n.echo = echo
	# 灼光
	n.glare = []
	for k in 5:
		var gm := MeshInstance3D.new(); gm.mesh = Models.mesh("sph", 0.1); gm.material_override = Models.glow(Color("#ff9a3a"), 1.5)
		root.add_child(gm); gm.visible = false; n.glare.append(gm)
	# 夜债（宵）：脚下的紫色月蚀圈
	var debt := MeshInstance3D.new(); debt.mesh = Models.mesh("torus", 1.1, 1.3); root.add_child(debt); debt.visible = false; n.debt = debt
	# 日冕环
	n.corona = []
	for k in 3:
		var cm := Node3D.new(); root.add_child(cm); cm.visible = false
		Models.part(cm, Models.mesh("torus", 0.35, 0.52), Models.toon(Color("#ffd27a"), 0.6, 0.8, false), Vector3.ZERO)
		n.corona.append(cm)
	# 绝响：外人只看到一团黑色的共鸣球
	var veil := MeshInstance3D.new(); veil.mesh = Models.mesh("sph", 2.2)
	var vm := StandardMaterial3D.new(); vm.albedo_color = Color(0.02, 0.03, 0.06, 0.88); vm.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	vm.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED; vm.cull_mode = BaseMaterial3D.CULL_DISABLED
	veil.material_override = vm; root.add_child(veil); veil.visible = false; n.veil = veil
	var vr := MeshInstance3D.new(); vr.mesh = Models.mesh("torus", 2.3, 2.45); vr.material_override = Models.glow(CYAN, 1.6, 0.85)
	veil.add_child(vr); n.veil_ring = vr
	g.dawn_nodes[p.id] = n
	return n

static func update(g, delta: float) -> void:
	var sim = g.sim
	var me = g.me
	var t := Time.get_ticks_msec() / 1000.0
	var in_cine: bool = me != null and me.cine_t > 0
	for p in sim.players:
		var interesting: bool = p.pilot in ["xiwei", "coda", "xiao"] or p.weapon in ["halo", "chord", "vigil"] or p.echo_sum > 0 or p.glare_n > 0 or p.cine_t > 0
		if not interesting and not g.dawn_nodes.has(p.id): continue
		var n := nodes_of(g, p)
		var mn: Dictionary = g.mech_nodes[p.id]
		var vis: bool = mn.root.visible and p.alive
		var base: Vector3 = mn.root.position
		# 光轮
		n.disc.visible = p.disc_on and p.alive
		if p.disc_on:
			n.disc.position = Vector3(p.disc_x * K, p.disc_z * K, p.disc_y * K)
			n.disc.rotation.y += delta * 22.0
			n.disc.scale = Vector3.ONE * (1.5 if p.sp_t > 0 and p.sp_kind == "corona" else 1.0)
		var gun_disc = mn.gun.get_node_or_null("disc") if mn.has("gun") else null
		if gun_disc != null: gun_disc.visible = not p.disc_on
		# 共鸣索
		var e = sim.player_by(p.teth_id) if p.teth_id != 0 else null
		if e != null and vis and e.alive:
			var a: Vector3 = base + Vector3(0, 1.4, 0); var b: Vector3 = g.mech_nodes[e.id].root.position + Vector3(0, 1.1, 0)
			put_line(n.teth, a, b, 0.4 * sin(t * 40.0))
			var f = sim.player_by(p.fork_id) if p.fork_id != 0 else null
			if f != null and f.alive: put_line(n.fork, b, g.mech_nodes[f.id].root.position + Vector3(0, 1.1, 0), 0.3 * sin(t * 33.0))
			else: n.fork.visible = false
		else: n.teth.visible = false; n.fork.visible = false
		# 谐振网
		for k in 3:
			var l: MeshInstance3D = n.links[k]
			if k < p.links.size() and p.links.size() >= 2:
				var q1 = sim.player_by(int(p.links[k])); var q2 = sim.player_by(int(p.links[(k + 1) % p.links.size()]))
				if q1 != null and q2 != null and q1.alive and q2.alive and (k < p.links.size() - 1 or p.links.size() > 2):
					put_line(l, g.mech_nodes[q1.id].root.position + Vector3(0, 1.2, 0), g.mech_nodes[q2.id].root.position + Vector3(0, 1.2, 0), 0.3 * sin(t * 25.0 + k))
					continue
			l.visible = false
		# 夜幕盾
		n.guard.visible = p.guarding and vis
		if p.guarding:
			var a2 := float(p.inp.a)
			n.guard.position = base + Vector3(cos(a2) * 1.3, 1.1, sin(a2) * 1.3)
			n.guard.basis = Basis(Vector3.UP, -a2) * Basis.from_scale(Vector3(0.12, 1.0, 1.0))
			n.guard.material_override = Models.glow(Color.WHITE if sim.time <= p.parry_until else VIOLET, 1.3, 0.35)
		# 日晷圈（熹微）
		var is_x: bool = p.pilot == "xiwei" and vis
		n.dial.visible = is_x
		if is_x:
			n.dial.position = base + Vector3(0, 0.08, 0)
			var ph := int(fposmod(p.dial, 16.0) / 4.0)
			n.dial_ring.material_override = Models.glow(PH_COLS[ph], 1.15 if p.dial_frz <= 0 else 1.45, 0.55)
			n.hand.rotation.y = -(fposmod(p.dial, 16.0) / 16.0 * TAU - PI / 2)
			for k in 4:
				var sm: MeshInstance3D = n.suns[k]
				sm.visible = k < p.suns
				var aa := t * 1.5 + k * TAU / 4.0
				sm.position = base + Vector3(cos(aa) * 0.9, 2.9 + sin(t * 3.0 + k) * 0.08, sin(aa) * 0.9)
		else:
			for sm in n.suns: sm.visible = false
		# 回响环
		n.echo.visible = p.echo_sum > 0.5 and vis
		if n.echo.visible:
			var s := 0.9 + clampf(p.echo_sum / 120.0, 0.0, 2.0) * 0.8 + 0.06 * sin(t * 9.0)
			n.echo.position = base + Vector3(0, 1.0 + 0.2 * sin(t * 4.0), 0); n.echo.scale = Vector3(s, 1, s)
		for k in 5:
			var gm: MeshInstance3D = n.glare[k]
			gm.visible = vis and k < p.glare_n
			gm.position = base + Vector3(-0.5 + k * 0.25, 3.2, 0)
		# 夜债
		n.debt.visible = p.pilot == "xiao" and vis and p.debt > 1
		if n.debt.visible:
			var over: bool = p.debt >= p.hp
			n.debt.position = base + Vector3(0, 0.1, 0)
			n.debt.material_override = Models.glow(Color("#ff3b52") if over else VIOLET, 1.3, clampf(0.25 + p.debt / 120.0, 0.25, 0.85))
			n.debt.rotation.y += delta * (6.0 if over else 1.5)
		# 日冕环
		var cor: bool = p.sp_t > 0 and p.sp_kind == "corona" and vis
		for k in 3:
			var cm: Node3D = n.corona[k]
			cm.visible = cor
			if cor:
				var t0: float = 5.0 - p.sp_t
				var ang := t0 * 4.2 + k * TAU / 3.0
				cm.position = base + Vector3(cos(ang) * 110 * K, 1.2, sin(ang) * 110 * K); cm.rotation.y += delta * 18.0
		# 绝响：外人看到黑球
		var outsider: bool = me == null or (me.id != p.id and me.id != p.cine_with)
		n.veil.visible = p.cine_t > 0 and outsider and p.cine_lead
		if n.veil.visible:
			var q = sim.player_by(p.cine_with)
			var mid: Vector3 = base
			if q != null: mid = (base + g.mech_nodes[q.id].root.position) * 0.5
			n.veil.position = mid + Vector3(0, 1.2, 0)
			var sc := 1.4 + Vector2(p.x - (q.x if q != null else p.x), p.y - (q.y if q != null else p.y)).length() * K * 0.5
			n.veil.scale = Vector3.ONE * sc
			n.veil_ring.rotation = Vector3(t * 2.0, t * 3.0, 0)
	# 在敌人的「长夜」里：画面四周压暗
	var dark := 0.0
	if me != null and me.alive and not in_cine:
		for h in sim.helpers:
			if h.kind == "night" and h.team != me.team and Vector2(me.x - h.x, me.y - h.y).length() < float(h.r): dark = 1.0
	if g.night_rect == null:
		var cr := ColorRect.new(); cr.set_anchors_preset(Control.PRESET_FULL_RECT); cr.mouse_filter = Control.MOUSE_FILTER_IGNORE
		var sh := Shader.new()
		sh.code = "shader_type canvas_item; uniform float k = 0.0; void fragment(){ vec2 d = (UV - vec2(0.5, 0.52)) * vec2(1.78, 1.0); float r = length(d); COLOR = vec4(0.01, 0.0, 0.04, k * smoothstep(0.12, 0.34, r) * 0.96); }"
		var mat := ShaderMaterial.new(); mat.shader = sh; cr.material = mat
		g.chat_layer().add_child(cr); cr.get_parent().move_child(cr, 0); g.night_rect = cr
	var m2: ShaderMaterial = g.night_rect.material
	var cur = m2.get_shader_parameter("k")
	m2.set_shader_parameter("k", lerpf(0.0 if cur == null else float(cur), dark, minf(1.0, delta * 5.0)))

static func clear(g) -> void:
	for id in g.dawn_nodes: g.dawn_nodes[id].root.queue_free()
	g.dawn_nodes.clear()
	if g.night_rect != null: g.night_rect.queue_free(); g.night_rect = null
	if g.cine != null and is_instance_valid(g.cine): g.cine.queue_free(); g.cine = null

# ---------------- 事件 ----------------
static func event(g, e: Array) -> bool:
	var sim = g.sim
	match e[0]:
		"echo":
			var t = sim.player_by(int(e[1]))
			if t == null: return true
			var pos := Vector3(float(e[4]) * K, float(e[5]) * K + 1.2, float(e[6]) * K)
			g.ring(pos - Vector3(0, 1.1, 0), 2.6, CYAN, 0.5); g.burst(pos, CYAN, 12, 5.0, 0.16, 0.45, 0.0)
			g.hud.float_text(t, "回响 %d" % int(e[2]), CYAN)
			g.sfx.play("hit", g.vol_at(t.x, t.y) - 2.0, 0.2)
		"echojump": pass
		"ghost":
			var t = sim.player_by(int(e[1]))
			if t != null: g.burst(Vector3(float(e[3]) * K, float(e[4]) * K + 1.0, float(e[5]) * K), CYAN.lightened(0.3), 8, 3.0, 0.2, 0.5, 2.0)
		"glare":
			var t = sim.player_by(int(e[1]))
			if t != null:
				g.burst(wpos(t, 1.4), Color("#ff9a3a"), 10 + int(e[2]) * 3, 5.0, 0.16, 0.4, 0.0)
				g.hud.float_text(t, "灼光 ×%d" % int(e[2]), Color("#ffb648"))
		"sun":
			var p = sim.player_by(int(e[1]))
			if p != null: g.ring(wpos(p), 3.0, Color("#ffc24a"), 0.7); g.hud.float_text(p, "日轮 %d" % int(e[2]), Color("#ffc24a"))
		"phase":
			var p = sim.player_by(int(e[1]))
			if p != null and p == g.me: g.hud.float_text(p, Dawn.PH_NAMES[int(e[2])], PH_COLS[int(e[2])])
		"dialfrz":
			var p = sim.player_by(int(e[1]))
			if p != null: g.ring(wpos(p), 2.4, PH_COLS[int(e[2])], 0.6); g.hud.float_text(p, "定晷 · " + Dawn.PH_NAMES[int(e[2])], PH_COLS[int(e[2])])
		"catch":
			var p = sim.player_by(int(e[1]))
			if p != null: g.burst(wpos(p, 1.4), Color("#ffd27a"), 5, 2.0, 0.12, 0.25, 0.0)
		"blind":
			var t = sim.player_by(int(e[1]))
			if t != null: g.hud.float_text(t, "致盲", Color("#ffe7a8"))
		"tether":
			var p = sim.player_by(int(e[1]))
			if p != null: g.sfx.play("lock", g.vol_at(p.x, p.y) - 4.0)
		"resnet", "linkpull":
			var p = sim.player_by(int(e[1]))
			if p != null: g.ring(wpos(p), 4.0, VIOLET.lerp(CYAN, 0.5), 0.6)
		"guardup": pass
		"parry":
			var t = sim.player_by(int(e[1]))
			if t != null:
				g.ring(wpos(t, 1.0), 2.2, Color.WHITE, 0.35); g.burst(wpos(t, 1.4), Color.WHITE, 14, 6.0, 0.14, 0.3, 0.0)
				g.hud.float_text(t, "完美格挡", Color.WHITE); g.sfx.play("shield", g.vol_at(t.x, t.y), 0.05)
				if t == g.me or int(e[2]) == g.me.id: g.shake = maxf(g.shake, 0.35)
		"counter":
			var p = sim.player_by(int(e[1]))
			if p != null:
				g.hud.float_text(p, ("完美反斩 " if e[3] else "反斩 ") + str(e[2]), VIOLET.lightened(0.3))
				g.sfx.play("slash", g.vol_at(p.x, p.y))
		"rewind":
			var p = sim.player_by(int(e[1]))
			if p != null:
				var a := Vector3(float(e[2]) * K, float(e[4]) * K + 1.2, float(e[3]) * K); var b := Vector3(float(e[5]) * K, float(e[7]) * K + 1.2, float(e[6]) * K)
				for k in 6: g.burst(a.lerp(b, k / 5.0), CYAN, 4, 1.5, 0.14, 0.5, 0.0)
				g.sfx.play("skill", g.vol_at(p.x, p.y))
		"settle":
			var pos := Vector3(float(e[2]) * K, float(e[4]) * K, float(e[3]) * K)
			g.ring(pos, 160 * K, VIOLET, 0.5); g.burst(pos + Vector3(0, 1, 0), VIOLET, 18 + mini(30, int(e[5]) / 3), 8.0, 0.2, 0.5, 0.0)
			g.flash_light(pos + Vector3(0, 2, 0), VIOLET, 3.0, 10.0, 0.2); g.sfx.play("boom", g.vol_at(float(e[2]), float(e[3])))
		"debtclear":
			var p = sim.player_by(int(e[1]))
			if p != null: g.hud.float_text(p, "清账 +%d 护盾" % int(e[2]), VIOLET.lightened(0.4))
		"finale":
			var me = g.me
			if me != null and (int(e[1]) == me.id or int(e[2]) == me.id):
				var c := FinaleCine.new(); c.setup(g, sim.player_by(int(e[1])), sim.player_by(int(e[2])), int(e[1]) == me.id)
				g.chat_layer().add_child(c); g.cine = c
			else:
				g.hud.float_text(sim.player_by(int(e[1])), "绝响", CYAN)
		"finale_end":
			var pos := Vector3(float(e[3]) * K, float(e[5]) * K + 1.2, float(e[4]) * K)
			g.burst(pos, CYAN, 30, 9.0, 0.22, 0.6, 0.0); g.burst(pos, Color.WHITE, 16, 12.0, 0.12, 0.4, 0.0)
			g.ring(pos - Vector3(0, 1.1, 0), 6.0, CYAN, 0.7); g.flash_light(pos, CYAN, 4.0, 14.0, 0.25)
			g.sfx.play("wreck", g.vol_at(float(e[3]), float(e[4])))
		_: return false
	return true
