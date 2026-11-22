# 对局结束的大字：「你胜利了！」/「你失败了」（金色 / 红色横条从中间展开，大字从放大缩回去，一道光扫过）
class_name EndSplash
extends Control

var head := ""
var en := ""
var col := Color.WHITE
var won := false
var font: Font
var t := 0.0

func setup(h: String, e: String, c: Color, w: bool, f: Font) -> void:
	head = h; en = e; col = c; won = w; font = f
	set_anchors_preset(Control.PRESET_FULL_RECT); mouse_filter = Control.MOUSE_FILTER_STOP

func _process(delta: float) -> void:
	t += delta; queue_redraw()
	if OS.get_environment("GB_SHOT_SPLASH") != "" and t > 0.7:   # 截图用
		get_viewport().get_texture().get_image().save_png(OS.get_environment("GB_SHOT_SPLASH")); get_tree().quit()

func _draw() -> void:
	var S := get_viewport_rect().size
	var a := clampf(t / 0.2, 0, 1) * clampf((2.4 - t) / 0.3, 0, 1)
	draw_rect(Rect2(Vector2.ZERO, S), Color(0, 0, 0, 0.55 * a))
	var open := 1.0 - pow(1.0 - clampf(t / 0.28, 0, 1), 3)
	var bh := 190.0 * open
	var cy := S.y * 0.45
	var dark := col.darkened(0.75)
	draw_rect(Rect2(0, cy - bh / 2, S.x, bh), Color(dark, 0.92 * a))
	draw_rect(Rect2(0, cy - bh / 2, S.x, 4), Color(col, a)); draw_rect(Rect2(0, cy + bh / 2 - 4, S.x, 4), Color(col, a))
	# 光芒（胜利）/ 裂纹（失败）
	if won:
		for i in 14:
			var ang := i * TAU / 14.0 + t * 0.4
			var p1 := Vector2(S.x / 2, cy) + Vector2(cos(ang), sin(ang)) * 120.0
			var p2 := Vector2(S.x / 2, cy) + Vector2(cos(ang), sin(ang)) * (520.0 + 60.0 * sin(t * 3 + i))
			draw_line(p1, p2, Color(col, 0.12 * a), 18.0)
	else:
		for i in 6:
			var x := S.x * (0.15 + i * 0.14)
			draw_line(Vector2(x, cy - bh / 2), Vector2(x + 30 * sin(i * 2.1), cy + bh / 2), Color(col, 0.18 * a), 2.0)
	var sc := 1.0 + 0.8 * maxf(0.0, 1.0 - t / 0.3)
	var sz := int(96 * sc)
	var tw := font.get_string_size(I18n.t(head), HORIZONTAL_ALIGNMENT_LEFT, -1, sz).x
	var pos := Vector2(S.x / 2 - tw / 2, cy + sz * 0.32)
	draw_string_outline(font, pos, I18n.t(head), HORIZONTAL_ALIGNMENT_LEFT, -1, sz, 14, Color(0, 0, 0, a))
	draw_string(font, pos + Vector2(0, 4), I18n.t(head), HORIZONTAL_ALIGNMENT_LEFT, -1, sz, Color(col.darkened(0.4), a))
	draw_string(font, pos, I18n.t(head), HORIZONTAL_ALIGNMENT_LEFT, -1, sz, Color(col.lightened(0.25), a))
	var ew := font.get_string_size(en, HORIZONTAL_ALIGNMENT_LEFT, -1, 30).x
	draw_string(font, Vector2(S.x / 2 - ew / 2, cy + bh / 2 - 22), en, HORIZONTAL_ALIGNMENT_LEFT, -1, 30, Color(col, 0.85 * a))
	var sw := fmod(t * 0.9, 1.4) - 0.2
	draw_rect(Rect2(S.x * sw, cy - bh / 2, 60, bh), Color(1, 1, 1, 0.08 * a))
