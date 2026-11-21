# 渐变圆角卡片：大厅里所有面板、按钮的底子
class_name GCard
extends PanelContainer

signal pressed

var top := Color("#2a2452")
var bottom := Color("#16122e")
var border := Color("#4b4396")
var border_w := 2.0
var radius := 14.0
var gloss := true
var shadow := 6.0
var glow := Color(0, 0, 0, 0)     # 外发光（金色按钮）
var skew := 0.0                    # 倾斜（涂鸦风横幅）
var clickable := false
var selected := false
var dim := false
var pad := Vector4(14, 10, 14, 10) # 左 上 右 下
var _hover := false
var _down := false

func _ready() -> void:
	var sb := StyleBoxEmpty.new()
	sb.content_margin_left = pad.x; sb.content_margin_top = pad.y; sb.content_margin_right = pad.z; sb.content_margin_bottom = pad.w
	add_theme_stylebox_override("panel", sb)
	mouse_filter = Control.MOUSE_FILTER_STOP if clickable else Control.MOUSE_FILTER_IGNORE
	if clickable:
		mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
		mouse_entered.connect(func(): _hover = true; _anim(1.04); queue_redraw())
		mouse_exited.connect(func(): _hover = false; _down = false; _anim(1.0); queue_redraw())
	resized.connect(func(): pivot_offset = size / 2)

func _anim(s: float) -> void:
	var tw := create_tween(); tw.tween_property(self, "scale", Vector2(s, s), 0.09)

func _gui_input(ev: InputEvent) -> void:
	if not clickable: return
	if (ev is InputEventMouseButton and ev.button_index == MOUSE_BUTTON_LEFT) or ev is InputEventScreenTouch:
		if ev.pressed: _down = true; _anim(0.96)
		elif _down:
			_down = false; _anim(1.04 if _hover else 1.0)
			pressed.emit()
		accept_event()

func rr(rect: Rect2, rad: float) -> PackedVector2Array:
	var pts := PackedVector2Array()
	rad = min(rad, min(rect.size.x, rect.size.y) / 2)
	var cs := [rect.position + Vector2(rect.size.x - rad, rad), rect.position + Vector2(rect.size.x - rad, rect.size.y - rad), rect.position + Vector2(rad, rect.size.y - rad), rect.position + Vector2(rad, rad)]
	for k in 4:
		for i in 7:
			var a := -PI / 2 + (k + i / 6.0) * PI / 2
			pts.append(cs[k] + Vector2(cos(a), sin(a)) * rad)
	if skew != 0.0:
		var h := rect.size.y
		for i in pts.size(): pts[i].x -= (pts[i].y - rect.position.y - h / 2) * skew
	return pts

func grad(pts: PackedVector2Array, a: Color, b: Color, y0: float, y1: float) -> PackedColorArray:
	var cs := PackedColorArray()
	for p in pts: cs.append(a.lerp(b, clampf((p.y - y0) / max(1.0, y1 - y0), 0, 1)))
	return cs

func _draw() -> void:
	if size.x < 6 or size.y < 6: return
	var r := Rect2(Vector2.ZERO, size)
	var t := top; var b := bottom; var bo := border
	if dim: t = t.darkened(0.45); b = b.darkened(0.45); bo = bo.darkened(0.45)
	if _hover: t = t.lightened(0.08); b = b.lightened(0.06); bo = bo.lightened(0.2)
	if selected: bo = Color("#ffe14d")
	if glow.a > 0:
		for k in 3:
			var g := rr(r.grow(4 + k * 4), radius + 4 + k * 4); draw_colored_polygon(g, Color(glow, 0.12 - k * 0.035))
	if shadow > 0: draw_colored_polygon(rr(Rect2(r.position + Vector2(0, shadow), r.size), radius), Color(0, 0, 0, 0.35))
	var bw := border_w + (1.5 if selected else 0.0)
	draw_colored_polygon(rr(r, radius), bo)
	var inner := r.grow(-bw)
	var ip := rr(inner, max(2.0, radius - bw))
	draw_polygon(ip, grad(ip, t, b, inner.position.y, inner.end.y))
	if gloss:
		var gr := Rect2(inner.position + Vector2(3, 2), Vector2(inner.size.x - 6, inner.size.y * 0.42))
		var gp := rr(gr, max(2.0, radius - bw - 2))
		draw_polygon(gp, grad(gp, Color(1, 1, 1, 0.13), Color(1, 1, 1, 0.0), gr.position.y, gr.end.y))
