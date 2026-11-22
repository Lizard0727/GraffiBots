# 涂鸦机兵 Godot 电脑版 —— 机体小图：在一个离屏 SubViewport 里逐个把 3D 机体拍成小图（每台拍一次，缓存起来）
# 用法：Thumbs.rect(game, "blaster", 64) 先返回一个 TextureRect，拍好后自动换成机体小图
class_name Thumbs
extends Node

var game
var vp: SubViewport
var holder: Node3D
var cache := {}        # id → ImageTexture
var waiting := {}      # id → [TextureRect]
var queue: Array = []
var busy := ""
var frames := 0

func _init(g) -> void:
	game = g
	vp = SubViewport.new(); vp.size = Vector2i(160, 160); vp.own_world_3d = true; vp.transparent_bg = true; vp.msaa_3d = Viewport.MSAA_4X
	vp.render_target_update_mode = SubViewport.UPDATE_DISABLED; add_child(vp)
	var cam := Camera3D.new(); cam.position = Vector3(2.6, 2.6, 5.4); cam.fov = 34; vp.add_child(cam)
	cam.look_at_from_position(cam.position, Vector3(0, 1.15, 0))
	var sun := DirectionalLight3D.new(); sun.rotation_degrees = Vector3(-45, 35, 0); sun.light_energy = 1.4; vp.add_child(sun)
	var env := WorldEnvironment.new(); env.environment = Environment.new(); env.environment.background_mode = Environment.BG_CLEAR_COLOR
	env.environment.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR; env.environment.ambient_light_color = Color("#9a90d0"); env.environment.ambient_light_energy = 0.9; vp.add_child(env)
	holder = Node3D.new(); vp.add_child(holder)

func rect(id: String, size := 64.0) -> TextureRect:
	var t := TextureRect.new(); t.expand_mode = TextureRect.EXPAND_IGNORE_SIZE; t.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	t.custom_minimum_size = Vector2(size, size); t.mouse_filter = Control.MOUSE_FILTER_IGNORE
	if cache.has(id): t.texture = cache[id]
	else:
		t.texture = UIKit.tex("res://art/icons/mech.png")
		if not waiting.has(id): waiting[id] = []; queue.append(id)
		waiting[id].append(t)
	return t

func _process(_d: float) -> void:
	if busy != "":
		frames += 1
		if frames >= 3:
			var img := vp.get_texture().get_image()
			var tex := ImageTexture.create_from_image(img)
			cache[busy] = tex
			for t in waiting.get(busy, []):
				if is_instance_valid(t): t.texture = tex
			waiting.erase(busy); busy = ""
			vp.render_target_update_mode = SubViewport.UPDATE_DISABLED
		return
	if queue.is_empty(): return
	busy = queue.pop_front(); frames = 0
	for c in holder.get_children(): c.queue_free()
	var D: Dictionary = game.data
	if not D.mechs.has(busy): busy = ""; return
	var P: Dictionary = D.pilots[D.pilotOrder[0]]
	var n := Models.build_mech(busy, D.mechs[busy], Color("#ff6ad5"), P)
	n.root.rotation_degrees.y = -20; holder.add_child(n.root)
	vp.render_target_update_mode = SubViewport.UPDATE_ALWAYS
