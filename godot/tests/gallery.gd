# 模型展示：把所有机体 / 驾驶员排成一排排截图（GALLERY=mechs|pilots，OUT=图片路径，BG=背景色，TC=机体队伍色）
extends SceneTree
var frames := 0
func _init() -> void: pass
func setup() -> void:
	var data: Dictionary = JSON.parse_string(FileAccess.get_file_as_string("res://data/game.json"))
	var kind := OS.get_environment("GALLERY")
	var w := Node3D.new(); root.add_child(w)
	var env := Environment.new(); env.background_mode = Environment.BG_COLOR; env.background_color = Color(OS.get_environment("BG")) if OS.get_environment("BG") != "" else Color("#2a2640"); env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR; env.ambient_light_color = Color("#9090b0"); env.ambient_light_energy = 0.6
	env.tonemap_mode = Environment.TONE_MAPPER_FILMIC
	var we := WorldEnvironment.new(); we.environment = env; w.add_child(we)
	var sun := DirectionalLight3D.new(); sun.rotation_degrees = Vector3(-40, 50, 0); sun.light_energy = 1.2; w.add_child(sun)
	var cam := Camera3D.new(); w.add_child(cam)
	var ids: Array = data.order if kind == "mechs" else data.pilotOrder
	var cols := int(OS.get_environment("COLS")) if OS.get_environment("COLS") != "" else (7 if kind == "mechs" else 8)
	var sp := 3.2 if kind == "mechs" else 1.3
	var start := int(OS.get_environment("FROM")) if OS.get_environment("FROM") != "" else 0
	var n := int(OS.get_environment("COUNT")) if OS.get_environment("COUNT") != "" else ids.size()
	ids = ids.slice(start, start + n)
	var rowh := 3.0 if kind == "mechs" else 2.0
	for i in ids.size():
		var id: String = ids[i]
		var node: Node3D
		if kind == "mechs":
			var P: Dictionary = data.pilots[data.pilotOrder[i % data.pilotOrder.size()]]
			node = Models.build_mech(id, data.mechs[id], Color(OS.get_environment("TC")) if OS.get_environment("TC") != "" else Color("#ff4fa8"), P).root
		else:
			node = Chars.build_char(data.pilots[id], Color("#4fc3ff")).root
		node.position = Vector3(0, -(i / cols) * rowh, (i % cols) * sp)
		node.rotation_degrees.y = -30
		w.add_child(node)
	var rows := ceili(ids.size() / float(cols))
	cam.projection = Camera3D.PROJECTION_ORTHOGONAL
	cam.size = maxf(rows * rowh + 0.6, (cols * sp) * 9.0 / 16.0 + 0.4)
	var cz := (cols - 1) * sp / 2.0; var cy := -(rows - 1) * rowh / 2.0 + rowh * 0.42
	cam.position = Vector3(30, cy + 3.0, cz); cam.look_at(Vector3(0, cy, cz))

func _process(_d: float) -> bool:
	frames += 1
	if frames == 2: setup()
	if frames == 10:
		root.get_viewport().get_texture().get_image().save_png(OS.get_environment("OUT"))
		return true
	return false
