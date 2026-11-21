# 涂鸦机兵 Godot 版 —— 界面组件：渐变圆角卡片（可点、可倾斜）、图标、六边形能力图
# 卡片自己画：投影 → 描边 → 上下渐变 → 顶部高光，鼠标移上去会放大一点
class_name UIKit
extends RefCounted

static var _tex := {}

static func tex(path: String) -> Texture2D:
	if not _tex.has(path):
		_tex[path] = load(path) if ResourceLoader.exists(path) else null
	return _tex[path]

static func icon(name: String, size := 32.0) -> TextureRect:
	var t := TextureRect.new(); t.texture = tex("res://art/icons/%s.png" % name)
	t.expand_mode = TextureRect.EXPAND_IGNORE_SIZE; t.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	t.custom_minimum_size = Vector2(size, size); t.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return t

static func image(path: String, size: Vector2, cover := false) -> TextureRect:
	var t := TextureRect.new(); t.texture = tex(path)
	t.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	t.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_COVERED if cover else TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	t.custom_minimum_size = size; t.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return t

static func label(s: String, size := 16, c := Color("#f2eefc"), outline := 0, oc := Color(0, 0, 0, 0.8)) -> Label:
	var l := Label.new(); l.text = s; l.add_theme_font_size_override("font_size", size); l.add_theme_color_override("font_color", c)
	if outline > 0: l.add_theme_constant_override("outline_size", outline); l.add_theme_color_override("font_outline_color", oc)
	l.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return l

static func wrap(l: Label, w: float) -> Label:
	l.autowrap_mode = TextServer.AUTOWRAP_ARBITRARY; l.custom_minimum_size.x = w
	return l

static func card(top: Color, bottom: Color, border: Color, radius := 14.0, clickable := false) -> GCard:
	var c := GCard.new(); c.top = top; c.bottom = bottom; c.border = border; c.radius = radius; c.clickable = clickable
	return c

# 常用配色
static func dark_card(clickable := false) -> GCard:
	return card(Color("#2a2452"), Color("#16122e"), Color("#4b4396"), 16, clickable)

static func gold_button(text: String, size := 30) -> GCard:
	var c := card(Color("#ffe9a3"), Color("#f3b33d"), Color("#fff4cf"), 22, true)
	c.glow = Color("#ffcf4d"); c.border_w = 3
	var l := label(text, size, Color("#2a1a08")); l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER; c.add_child(l)
	return c

static func pink_button(text: String, size := 20) -> GCard:
	var c := card(Color("#ff7ad0"), Color("#c53cff"), Color("#ffc4ef"), 16, true)
	var l := label(text, size, Color.WHITE, 4, Color("#5a1060")); l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER; c.add_child(l)
	return c

static func flat_button(text: String, size := 17) -> GCard:
	var c := card(Color("#3a3370"), Color("#262052"), Color("#6a60c0"), 14, true)
	var l := label(text, size, Color("#f2eefc")); l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER; c.add_child(l)
	return c

# 货币 / 数值胶囊：图标 + 数字
static func pill(icon_name: String, text: String, c: Color) -> GCard:
	var p := card(Color("#1d1838"), Color("#120f26"), c.darkened(0.25), 20)
	p.pad = Vector4(6, 3, 14, 3); p.shadow = 3
	var h := HBoxContainer.new(); h.add_theme_constant_override("separation", 6); h.mouse_filter = Control.MOUSE_FILTER_IGNORE; p.add_child(h)
	h.add_child(icon(icon_name, 28)); h.add_child(label(text, 19, c))
	return p

static func chip(text: String, c: Color, size := 13) -> GCard:
	var p := card(c.darkened(0.55), c.darkened(0.7), c, 10)
	p.pad = Vector4(8, 1, 8, 1); p.shadow = 0; p.gloss = false
	p.add_child(label(text, size, c.lightened(0.35)))
	return p

static func bar(k: float, w: float, h: float, c: Color) -> Control:
	var b := BarRect.new(); b.k = k; b.col = c; b.custom_minimum_size = Vector2(w, h)
	return b

class BarRect extends Control:
	var k := 0.5
	var col := Color.WHITE
	func _ready() -> void: mouse_filter = Control.MOUSE_FILTER_IGNORE
	func _draw() -> void:
		var r := size.y / 2
		draw_style_box(_sb(Color(0, 0, 0, 0.55), r), Rect2(Vector2.ZERO, size))
		if k > 0.005: draw_style_box(_sb(col, r), Rect2(Vector2.ZERO, Vector2(max(size.y, size.x * clampf(k, 0, 1)), size.y)))
	func _sb(c: Color, r: float) -> StyleBoxFlat:
		var s := StyleBoxFlat.new(); s.bg_color = c; s.set_corner_radius_all(int(r)); return s

# 六边形能力图（数值 0~4 = E~A）
class HexChart extends Control:
	var vals: Array = [2, 2, 2, 2, 2, 2]
	var axes: Array = ["", "", "", "", "", ""]
	var grades: Array = ["E", "D", "C", "B", "A"]
	var col := Color("#ffd23f")
	var font: Font
	var anim := 0.0
	func _ready() -> void: mouse_filter = Control.MOUSE_FILTER_IGNORE
	func _process(delta: float) -> void:
		if anim < 1.0: anim = min(1.0, anim + delta * 3.0); queue_redraw()
	func pt(i: int, r: float) -> Vector2:
		var a := -PI / 2 + i * PI / 3
		return size / 2 + Vector2(cos(a), sin(a)) * r
	func _draw() -> void:
		var R: float = min(size.x, size.y) * 0.3
		for k in range(5, 0, -1):
			var ring := PackedVector2Array()
			for i in 6: ring.append(pt(i, R * k / 5.0))
			draw_colored_polygon(ring, Color(1, 1, 1, 0.04 if k % 2 == 1 else 0.08))
			ring.append(ring[0]); draw_polyline(ring, Color(1, 1, 1, 0.18), 1.0, true)
		for i in 6: draw_line(size / 2, pt(i, R), Color(1, 1, 1, 0.15), 1.0, true)
		var e := ease(anim, 0.4)
		var poly := PackedVector2Array()
		for i in 6: poly.append(pt(i, R * (float(vals[i]) + 1) / 5.0 * e))
		draw_colored_polygon(poly, Color(col, 0.38))
		var pl := poly.duplicate(); pl.append(poly[0]); draw_polyline(pl, col, 2.5, true)
		for i in 6:
			draw_circle(poly[i], 3.0, Color.WHITE)
			if font == null: continue
			var m: float = min(size.x, size.y)
			var p := pt(i, R + m * 0.17)
			var fs := int(m * 0.075); var gs := int(m * 0.1)
			draw_string(font, p + Vector2(-60, -2), str(axes[i]), HORIZONTAL_ALIGNMENT_CENTER, 120, fs, Color("#c9d3e6"))
			draw_string_outline(font, p + Vector2(-60, gs), str(grades[clampi(int(vals[i]), 0, 4)]), HORIZONTAL_ALIGNMENT_CENTER, 120, gs, 4, Color(0, 0, 0, 0.6))
			draw_string(font, p + Vector2(-60, gs), str(grades[clampi(int(vals[i]), 0, 4)]), HORIZONTAL_ALIGNMENT_CENTER, 120, gs, col)

# 背景上的涂料泼溅（大厅氛围）
class Splash extends Control:
	var cols: Array = []
	var seed_v := 1
	func _ready() -> void: mouse_filter = Control.MOUSE_FILTER_IGNORE
	func _draw() -> void:
		var r := RandomNumberGenerator.new(); r.seed = seed_v
		for i in 26:
			var c: Color = cols[i % cols.size()]
			var p := Vector2(r.randf() * size.x, r.randf() * size.y)
			var rad := r.randf_range(10, 70) if i % 5 != 0 else r.randf_range(80, 150)
			draw_circle(p, rad, Color(c, r.randf_range(0.10, 0.22)))
			for k in r.randi_range(2, 6):   # 溅出的小点
				var a := r.randf() * TAU; var d := rad * r.randf_range(1.1, 1.8)
				draw_circle(p + Vector2(cos(a), sin(a)) * d, r.randf_range(2, 9), Color(c, 0.2))
			if r.randf() < 0.45:   # 往下流的涂料
				var x := p.x + r.randf_range(-rad * 0.5, rad * 0.5)
				draw_line(Vector2(x, p.y), Vector2(x, p.y + rad * r.randf_range(1.2, 3.0)), Color(c, 0.18), r.randf_range(3, 8))
