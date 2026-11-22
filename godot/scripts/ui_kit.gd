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

# ---------------- 头像 + 头像框（和网页版 style.css 的 frame-* 一样的配色和动画）----------------
const FRAMES := {
	"tape": {"cols": ["#f4e7a8", "#e6d28a"], "stripe": true, "spin": 0.0},
	"neon": {"cols": ["#141018"], "glow": "#2ef0c8", "pulse": true, "spin": 0.0},
	"rebel": {"cols": ["#ff5a36", "#141018"], "stripe": true, "spin": 0.6},
	"gold": {"cols": ["#b88a1a", "#fff3c4", "#ffc531", "#b88a1a"], "spin": 0.5},
	"master": {"cols": ["#b06bff", "#ff6ec4", "#7ab8ff"], "glow": "#b06bff", "spin": 2.1},
	"flame": {"cols": ["#ff3b52", "#ff8a1f", "#ffe600", "#ff8a1f"], "glow": "#ff8a1f", "spin": 2.6},
	"yato": {"cols": ["#8a6bff", "#d8b25a", "#ff2d4b"], "glow": "#8a6bff", "spin": 1.8},
	"final": {"cols": ["#ffe14d", "#ff3b52", "#b06bff", "#7ab8ff"], "glow": "#ffe14d", "spin": 2.9},
	"merc": {"cols": ["#e0a030", "#3a3d48", "#ff4d3d", "#e8d8a8"], "glow": "#e0a030", "spin": 2.1},
}

static var _circle_mat: ShaderMaterial
static func circle_mat() -> ShaderMaterial:
	if _circle_mat == null:
		var sh := Shader.new()
		sh.code = "shader_type canvas_item;\nuniform vec4 bg : source_color = vec4(0.1,0.08,0.2,1.0);\nvoid fragment(){ float d = distance(UV, vec2(0.5)); vec4 t = texture(TEXTURE, UV); vec4 c = mix(bg, vec4(t.rgb, 1.0), t.a); c.a = 1.0 - smoothstep(0.48, 0.5, d); COLOR = c; }"
		_circle_mat = ShaderMaterial.new(); _circle_mat.shader = sh
	return _circle_mat

# tex_path：头像图片（驾驶员头像或头像皮肤）；frame：头像框（"" = 普通白边，或 FRAMES 的名字）；ring：没有头像框时的描边颜色
static func avatar(tex_path: String, frame := "", size := 64.0, ring := Color("#f2eefc")) -> Avatar:
	var a := Avatar.new(); a.frame = frame; a.ring = ring; a.custom_minimum_size = Vector2(size, size); a.size = Vector2(size, size)
	var t := TextureRect.new(); t.texture = tex(tex_path); t.expand_mode = TextureRect.EXPAND_IGNORE_SIZE; t.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_COVERED
	t.material = circle_mat(); t.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var pad := size * (0.12 if frame != "" else 0.06)
	t.position = Vector2(pad, pad); t.size = Vector2(size - pad * 2, size - pad * 2); t.custom_minimum_size = t.size
	a.add_child(t); a.inner = t
	return a

class Avatar extends Control:
	var frame := ""
	var ring := Color.WHITE
	var inner: TextureRect
	var t := 0.0
	func _ready() -> void: mouse_filter = Control.MOUSE_FILTER_IGNORE
	func _process(delta: float) -> void:
		if frame != "" and is_visible_in_tree(): t += delta; queue_redraw()
	func _draw() -> void:
		var c := size / 2; var r := minf(size.x, size.y) / 2
		draw_circle(c + Vector2(0, r * 0.06), r, Color(0, 0, 0, 0.35))
		if frame == "" or not UIKit.FRAMES.has(frame):
			draw_circle(c, r, Color("#141018")); draw_circle(c, r * 0.95, ring)
			return
		var F: Dictionary = UIKit.FRAMES[frame]
		if F.has("glow"):
			var g := Color(str(F.glow)); var k := 0.5 + 0.5 * sin(t * 4.0) if F.get("pulse", false) else 1.0
			for i in 4: draw_circle(c, r * (1.0 + 0.04 * (4 - i)), Color(g.r, g.g, g.b, 0.12 * k))
		draw_circle(c, r, Color("#141018"))
		var cols: Array = F.cols; var n := 48
		var rot := t * float(F.spin)
		for i in n:
			var a0 := TAU * i / n + rot; var a1 := TAU * (i + 1) / n + rot
			var col: Color
			if F.get("stripe", false): col = Color(str(cols[(i / 3) % cols.size()]))
			else:
				var f := float(i) / n * cols.size(); var j := int(f) % cols.size()
				col = Color(str(cols[j])).lerp(Color(str(cols[(j + 1) % cols.size()])), f - floor(f))
			var pts := PackedVector2Array([c + Vector2(cos(a0), sin(a0)) * r * 0.97, c + Vector2(cos(a1), sin(a1)) * r * 0.97, c + Vector2(cos(a1), sin(a1)) * r * 0.8, c + Vector2(cos(a0), sin(a0)) * r * 0.8])
			draw_colored_polygon(pts, col)
		if F.has("glow") and F.get("pulse", false): draw_arc(c, r * 0.88, 0, TAU, 48, Color(str(F.glow)), r * 0.1)
		draw_arc(c, r * 0.97, 0, TAU, 48, Color("#141018"), 2.0)
		draw_arc(c, r * 0.8, 0, TAU, 48, Color("#141018"), 2.0)
