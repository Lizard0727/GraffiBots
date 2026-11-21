# 涂鸦机兵 Godot 版 —— 各模式场上的东西：据点、宝物核心和终点台、足球和球门、电池 / 封印石和基地、
# 逃亡圈毒圈和空投箱、乐园花车和气球、百目的砸地预警圈
class_name ModeView
extends Node3D

const K := 1.0 / 16.0
var sim: Sim
var cols: Array
var nodes := {}          # 名字 → Node3D
var pools := {}          # 名字 → [Node3D...]（电池、气球、空投箱这种数量会变的东西）
var t := 0.0

func setup(s: Sim, team_cols: Array) -> void:
	sim = s; cols = team_cols
	for c in get_children(): c.queue_free()
	nodes.clear(); pools.clear()
	var MC: Dictionary = sim.MC
	match sim.mode:
		"loot":
			var exs: Array = []
			for e in sim.obj.ex:
				var n := Node3D.new(); add_child(n); n.position = Vector3(e.x * K, sim.top_at(e.x, e.y) * K + 0.05, e.y * K)
				var r := float(sim.D.loot.extR) * K
				var ring := MeshInstance3D.new(); ring.mesh = Models.mesh("torus", 0.94, 1.0); ring.scale = Vector3(r, 10, r); n.add_child(ring)
				var pil := MeshInstance3D.new(); var cm := CylinderMesh.new(); cm.top_radius = 1.0; cm.bottom_radius = 1.0; cm.height = 1.0; cm.cap_top = false; cm.cap_bottom = false; pil.mesh = cm
				pil.scale = Vector3(r, 16, r); pil.position.y = 8; pil.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF; n.add_child(pil)
				exs.append([n, ring, pil, e])
			nodes.ex = exs
			if sim.obj.lever != null:
				var lv := Node3D.new(); add_child(lv); lv.position = Vector3(sim.obj.lever.x * K, sim.top_at(sim.obj.lever.x, sim.obj.lever.y) * K, sim.obj.lever.y * K)
				Models.part(lv, Models.mesh("box", 0.8, 1.6, 0.5), Models.toon(Color("#ffb000"), 0.4), Vector3(0, 0.8, 0))
				Models.part(lv, Models.mesh("cyl", 0.08, 1.0), Models.glow(Color("#ff3b52"), 2.0), Vector3(0.3, 1.9, 0), Vector3(0, 0, 30))
				nodes.lever = lv
			var mm := MultiMesh.new(); mm.transform_format = MultiMesh.TRANSFORM_3D; mm.use_colors = true
			var bx := BoxMesh.new(); bx.size = Vector3(1.3, 1.0, 1.3)
			var bm := StandardMaterial3D.new(); bm.vertex_color_use_as_albedo = true; bm.roughness = 0.7; bx.material = bm
			mm.mesh = bx; mm.instance_count = 2000; mm.visible_instance_count = 0
			var mmi := MultiMeshInstance3D.new(); mmi.multimesh = mm; add_child(mmi); nodes.conts = mm
			nodes.cont_t = 0.0
		"zone":
			var Z: Dictionary = MC.ZONE
			var w := float(Z.x1 - Z.x0); var h := float(Z.y1 - Z.y0)
			var fill := MeshInstance3D.new(); var pm := PlaneMesh.new(); pm.size = Vector2(w, h); fill.mesh = pm
			fill.position = Vector3(Z.x0 + w / 2, 0.05, Z.y0 + h / 2); fill.material_override = Models.glow(Color.WHITE, 0.6, 0.18)
			fill.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF; add_child(fill); nodes.fill = fill
			for e in [[Vector3(Z.x0 + w / 2, 0.15, Z.y0), Vector3(w, 0.2, 0.25)], [Vector3(Z.x0 + w / 2, 0.15, Z.y1), Vector3(w, 0.2, 0.25)], [Vector3(Z.x0, 0.15, Z.y0 + h / 2), Vector3(0.25, 0.2, h)], [Vector3(Z.x1, 0.15, Z.y0 + h / 2), Vector3(0.25, 0.2, h)]]:
				var b := MeshInstance3D.new(); var bm := BoxMesh.new(); bm.size = e[1]; b.mesh = bm; b.position = e[0]; b.material_override = Models.glow(Color.WHITE, 2.0)
				add_child(b); (nodes.get_or_add("edges", []) as Array).append(b)
			var pole := Models.part(self, Models.mesh("cyl", 0.12, 5.0), Models.toon(Color("#c9c5e6")), Vector3(Z.x0 + w / 2, 2.5, Z.y0 + h / 2))
			var flag := Models.part(self, Models.mesh("box", 1.6, 1.0, 0.08), Models.toon(Color.WHITE, 0.6), Vector3(Z.x0 + w / 2 + 0.8, 4.4, Z.y0 + h / 2))
			nodes.flag = flag; nodes.pole = pole
		"escort":
			var core := Node3D.new(); add_child(core); nodes.core = core
			Models.part(core, Models.mesh("sph", 0.7), Models.glow(Color("#ffe14d"), 2.6), Vector3(0, 1.4, 0), Vector3.ZERO, Vector3(1, 1.3, 1))
			Models.part(core, Models.mesh("torus", 0.9, 1.05), Models.glow(Color("#fff3a8"), 2.0), Vector3(0, 1.4, 0), Vector3(70, 0, 0))
			var l := OmniLight3D.new(); l.light_color = Color("#ffe14d"); l.light_energy = 2.0; l.omni_range = 6; l.position.y = 1.4; core.add_child(l)
			for team in [1, 2]:
				var g := sim.goal_for(team)
				var pad := Node3D.new(); add_child(pad); pad.position = Vector3(g.x * K, 0.05, g.y * K)
				Models.part(pad, Models.mesh("cyl", 3.2, 0.15), Models.glow(cols[team], 1.4, 0.5), Vector3.ZERO)
				Models.part(pad, Models.mesh("torus", 3.0, 3.3), Models.glow(cols[team], 2.4), Vector3(0, 0.12, 0))
				nodes["goal%d" % team] = pad
		"soccer":
			var ball := Node3D.new(); add_child(ball); nodes.ball = ball
			var spin := Node3D.new(); ball.add_child(spin); spin.position.y = 1.62; nodes.spin = spin
			Models.part(spin, Models.mesh("sph", 1.62), Models.toon(Color("#f4f0ea"), 0.1, 0.6), Vector3.ZERO)
			Models.part(spin, Models.mesh("torus", 1.58, 1.7), Models.toon(Color("#262838")), Vector3.ZERO, Vector3(90, 0, 0))
			Models.part(spin, Models.mesh("torus", 1.58, 1.7), Models.toon(Color("#262838")), Vector3.ZERO)
			var G: Dictionary = MC.SOCCER_GOAL
			for team in [1, 2]:   # 队伍 1 要把球打进右边（x 大）的球门
				var gx: float = (sim.W - float(G.depth) / 2) if team == 1 else float(G.depth) / 2
				var goal := Node3D.new(); add_child(goal); goal.position = Vector3(gx * K, 0, sim.H / 2 * K)
				var c: Color = cols[3 - team]
				var half := float(G.half) * K
				for zz in [-half, half]: Models.part(goal, Models.mesh("box", 0.4, 3.4, 0.4), Models.toon(c, 0.6), Vector3(0, 1.7, zz))
				Models.part(goal, Models.mesh("box", 0.4, 0.4, half * 2), Models.toon(c, 0.6), Vector3(0, 3.4, 0))
				var net := MeshInstance3D.new(); var pm2 := PlaneMesh.new(); pm2.size = Vector2(float(G.depth) * K, half * 2); net.mesh = pm2
				net.material_override = Models.glow(c, 0.8, 0.25); net.position.y = 0.06; goal.add_child(net)
		"battery", "seal":
			var seal: bool = sim.mode == "seal"
			for team in [1, 2]:
				var b := sim.base_pos(team)
				var base := Node3D.new(); add_child(base); base.position = Vector3(b.x * K, sim.top_at(b.x, b.y) * K + 0.05, b.y * K)
				Models.part(base, Models.mesh("torus", 7.0, 7.5), Models.glow(cols[team], 2.0, 0.8), Vector3.ZERO)
				Models.part(base, Models.mesh("cyl", 1.0, 2.4) if not seal else Models.mesh("cone", 1.2, 3.0), Models.toon(cols[team], 0.5), Vector3(0, 1.2, 0))
				Models.part(base, Models.mesh("sph", 0.5), Models.glow(Color("#ffe14d") if not seal else Color("#b48cff"), 2.6), Vector3(0, 2.9, 0))
		"escape4", "escape8":
			var wall := MeshInstance3D.new(); var cm := CylinderMesh.new(); cm.top_radius = 1; cm.bottom_radius = 1; cm.height = 1; cm.cap_top = false; cm.cap_bottom = false; cm.radial_segments = 96; cm.rings = 1
			wall.mesh = cm
			var wm := StandardMaterial3D.new(); wm.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED; wm.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA; wm.cull_mode = BaseMaterial3D.CULL_DISABLED
			wm.albedo_color = Color(0.85, 0.25, 0.4, 0.28); wall.material_override = wm; wall.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
			add_child(wall); nodes.wall = wall
			var nxt := MeshInstance3D.new(); nxt.mesh = Models.mesh("torus", 0.985, 1.0); nxt.material_override = Models.glow(Color.WHITE, 1.6, 0.6); add_child(nxt); nodes.next = nxt
		"park":
			var fl := Node3D.new(); add_child(fl); nodes.float = fl
			Models.part(fl, Models.mesh("box", 3.4, 0.6, 2.2), Models.toon(Color("#ff6ec4"), 0.2), Vector3(0, 0.6, 0))
			for xx in [-1.2, 1.2]:
				for zz in [-0.9, 0.9]: Models.part(fl, Models.mesh("cyl", 0.08, 2.2), Models.toon(Color("#ffe14d")), Vector3(xx, 1.9, zz))
			Models.part(fl, Models.mesh("cone", 2.2, 1.2), Models.toon(Color("#5fd8ff"), 0.2), Vector3(0, 3.5, 0))
			Models.part(fl, Models.mesh("sph", 0.35), Models.glow(Color("#ffe14d"), 3.0), Vector3(0, 4.3, 0))
			var ring := MeshInstance3D.new(); ring.mesh = Models.mesh("torus", 0.96, 1.0); add_child(ring); nodes.fring = ring
			var r := float(MC.PARK.r) * K; ring.scale = Vector3(r, 8, r)
			var path := MeshInstance3D.new(); add_child(path)
			var im := ImmediateMesh.new(); path.mesh = im
			im.surface_begin(Mesh.PRIMITIVE_LINE_STRIP, Models.glow(Color("#ffe14d"), 1.4, 0.6))
			for q in MC.PARK.path + [MC.PARK.path[0]]: im.surface_add_vertex(Vector3(q[0] + 0.0, 0.08, q[1] + 0.0))
			im.surface_end()

func pool_get(name: String, i: int, make: Callable) -> Node3D:
	var arr: Array = pools.get_or_add(name, [])
	while arr.size() <= i:
		var n: Node3D = make.call(); add_child(n); arr.append(n)
	arr[i].visible = true
	return arr[i]

func pool_hide(name: String, from: int) -> void:
	var arr: Array = pools.get(name, [])
	for i in range(from, arr.size()): arr[i].visible = false

func mk_bat() -> Node3D:
	var n := Node3D.new()
	Models.part(n, Models.mesh("cyl", 0.32, 0.8), Models.toon(Color("#ffe14d"), 0.9), Vector3(0, 0.6, 0))
	Models.part(n, Models.mesh("cyl", 0.16, 0.16), Models.toon(Color("#262838")), Vector3(0, 1.08, 0))
	return n

func mk_stone() -> Node3D:
	var n := Node3D.new()
	Models.part(n, Models.mesh("prism", 0.5, 0.9, 0.5), Models.toon(Color("#b48cff"), 1.2), Vector3(0, 0.7, 0))
	return n

func mk_crate() -> Node3D:
	var n := Node3D.new()
	Models.part(n, Models.mesh("box", 1.2, 1.0, 1.2), Models.toon(Color("#ffb000"), 0.3), Vector3(0, 0.5, 0))
	Models.part(n, Models.mesh("box", 1.25, 0.2, 0.3), Models.toon(Color("#262838")), Vector3(0, 1.0, 0))
	Models.part(n, Models.mesh("sph", 0.2), Models.glow(Color("#6dff8a"), 3.0), Vector3(0, 1.3, 0))
	return n

func mk_balloon() -> Node3D:
	var n := Node3D.new()
	var c: Color = [Color("#ff6ec4"), Color("#ffe14d"), Color("#5fd8ff"), Color("#9cff2e")][randi() % 4]
	Models.part(n, Models.mesh("sph", 0.85), Models.toon(c, 0.3, 0.8), Vector3.ZERO, Vector3.ZERO, Vector3(1, 1.2, 1))
	Models.part(n, Models.mesh("cyl", 0.02, 2.4), Models.toon(Color.WHITE, 0.0, 0.4, false), Vector3(0, -2.2, 0))
	return n

func sync(delta: float, me_team: int) -> void:
	if sim == null: return
	t += delta
	var o: Dictionary = sim.obj
	match sim.mode:
		"loot":
			for x in nodes.ex:
				var open: bool = sim.ex_open(x[3])
				var c := Color("#6dff8a") if open else Color("#8a86a8")
				x[1].material_override = Models.glow(c, 2.2 if open else 1.0, 0.9)
				x[2].material_override = Models.glow(c, 1.4, (0.16 + 0.05 * sin(t * 3)) if open else 0.05)
			nodes.cont_t -= delta
			if nodes.cont_t <= 0:
				nodes.cont_t = 0.5
				var mm: MultiMesh = nodes.conts; var i := 0
				var cols := {"crate": Color("#6a8a4a"), "locker": Color("#7a8aa8"), "safe": Color("#3a3d48"), "pc": Color("#4fb8ff"), "med": Color("#f4f0ea"), "fridge": Color("#c9e6f0"),
					"server": Color("#2a3a5a"), "tools": Color("#ff8a1f"), "weapon": Color("#4a4d56"), "duffel": Color("#8a5a3a"), "vault": Color("#ffc531"), "body": Color("#ff3b52"), "pile": Color("#b78cff")}
				for c in o.conts:
					if c.items.is_empty() or i >= mm.instance_count: continue
					var sz := 1.4 if c.type in ["vault", "safe", "server"] else (0.7 if c.type in ["pile", "body"] else 1.0)
					mm.set_instance_transform(i, Transform3D(Basis().scaled(Vector3(sz, sz, sz)), Vector3(c.x * K, c.z * K + 0.5 * sz, c.y * K)))
					var col: Color = cols.get(c.type, Color.GRAY)
					if int(c.rev) >= c.items.size(): col = col.lightened(0.35)   # 搜过了：亮一点
					mm.set_instance_color(i, col); i += 1
				mm.visible_instance_count = i
		"zone":
			var own: int = o.owner
			var c: Color = cols[own] if own > 0 else Color.WHITE
			(nodes.fill as MeshInstance3D).material_override = Models.glow(c, 0.8, 0.14 + 0.06 * sin(t * 3))
			for b in nodes.edges: b.material_override = Models.glow(c, 2.2)
			nodes.flag.material_override = Models.toon(c, 0.6)
			nodes.flag.rotation.y = sin(t * 2) * 0.25
		"escort":
			var tr: Dictionary = o.tr
			var core: Node3D = nodes.core
			core.visible = tr.reset_t <= 0
			var lift := 1.6 if tr.carrier != null else 0.0
			core.position = core.position.lerp(Vector3(tr.x * K, tr.z * K + lift + sin(t * 3) * 0.15, tr.y * K), min(1.0, delta * 14))
			core.rotation.y += delta * 2
		"soccer":
			var b: Dictionary = o.ball
			var ball: Node3D = nodes.ball
			var np := Vector3(b.x * K, 0, b.y * K)
			var mv := np - ball.position
			ball.position = np
			if mv.length() > 0.0001:
				var axis := Vector3(mv.z, 0, -mv.x).normalized()
				nodes.spin.rotate(axis, mv.length() / 1.62)
		"battery", "seal":
			var i := 0
			for bt in o.bats:
				var n := pool_get("bat", i, mk_bat if sim.mode == "battery" else mk_stone)
				n.position = Vector3(bt.x * K, bt.z * K + 0.15 * sin(t * 3 + bt.id), bt.y * K); n.rotation.y = t + bt.id
				i += 1
			pool_hide("bat", i)
		"escape4", "escape8":
			var c2: Dictionary = o.circle
			var wall: MeshInstance3D = nodes.wall
			var r := float(c2.r) * K
			wall.scale = Vector3(r, 30, r); wall.position = Vector3(c2.x * K, 14, c2.y * K)
			var nx: MeshInstance3D = nodes.next
			nx.visible = c2.phase == 1 or (c2.phase == 0 and c2.stage > 0)
			if c2.to != null:
				var r2 := float(c2.to.r) * K
				nx.scale = Vector3(r2, 24, r2); nx.position = Vector3(c2.to.x * K, 0.2, c2.to.y * K)
			var i2 := 0
			for k in o.crates:
				var n2 := pool_get("crate", i2, mk_crate)
				n2.position = Vector3(k.x * K, k.z * K, k.y * K); n2.rotation.y = t * 0.6 + k.id
				i2 += 1
			pool_hide("crate", i2)
		"park":
			var fl: Dictionary = o.fl
			var f: Node3D = nodes.float
			var np2 := Vector3(fl.x * K, sim.top_at(fl.x, fl.y) * K, fl.y * K)
			var dv := np2 - f.position
			if dv.length() > 0.001: f.rotation.y = lerp_angle(f.rotation.y, atan2(-dv.z, dv.x), min(1.0, delta * 4))
			f.position = np2
			var own2: int = fl.own
			nodes.fring.position = np2 + Vector3(0, 0.1, 0)
			nodes.fring.material_override = Models.glow(cols[own2] if own2 > 0 else Color.WHITE, 2.2, 0.8)
			var i3 := 0
			for b2 in o.balloons:
				var n3 := pool_get("balloon", i3, mk_balloon)
				n3.position = Vector3(b2.x * K, b2.z * K + sin(t * 1.5 + b2.ph) * 0.3, b2.y * K)
				i3 += 1
			pool_hide("balloon", i3)
