# 抽卡登场画面：点一下跳到结尾、再点一下必须能关掉（3.2.1 修：子节点吃掉鼠标导致点不掉）
# 需要显示器（--headless 下不派发鼠标事件），本地用 xvfb-run 跑：xvfb-run -a godot --path godot --script res://tests/reveal_click.gd
extends SceneTree

var f := 0
var game: Node
var lobby: Node
var ov: Node
func _init() -> void:
	game = load("res://scenes/main.tscn").instantiate(); root.add_child(game)

func click() -> void:
	for down in [true, false]:
		var e := InputEventMouseButton.new(); e.button_index = MOUSE_BUTTON_LEFT; e.pressed = down
		e.position = Vector2(640, 360); e.global_position = e.position
		root.push_input(e)

func _process(_d: float) -> bool:
	f += 1
	if f == 30:
		lobby = game.get("lobby")
		if lobby == null: print("✗ 没有大厅"); quit(1); return true
		lobby.pilot_reveal("yuzu"); ov = lobby.get_child(lobby.get_child_count() - 1)
	if f == 40: click()
	if f == 45: click()
	if f == 55:
		var gone := not is_instance_valid(ov) or ov.is_queued_for_deletion()
		print("✓ 登场画面点两下就关掉了" if gone else "✗ 登场画面关不掉")
		quit(0 if gone else 1)
	return false
