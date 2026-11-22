# 涂鸦机兵 电脑版 3.1 ——「黎明之后」专属手书剧情播放器
# 手书风格：米色纸面 + 铅笔线稿；线条每 1/8 秒重新抖一次（手绘动画特有的「线条呼吸」）；
# 角色立绘转成线稿（边缘检测 + 少量淡彩），背景是程序画的铅笔草图；台词打字机效果，点击 / 空格翻页
class_name Tegaki
extends Control

signal finished(chapter_id: int)

const PAPER := Color("#f3ead8")
const INK := Color("#2a2420")
var g
var ch: Dictionary
var en := false
var idx := -1          # -1 是章节标题卡
var t := 0.0
var boil := 0          # 线条抖动的帧号（每 0.125 秒 +1）
var boil_t := 0.0
var typed := 0.0
var por: TextureRect
var por_mat: ShaderMaterial
var font: Font
var done_emitted := false

const SKETCH := """
shader_type canvas_item;
uniform float boil = 0.0;
uniform vec4 ink : source_color = vec4(0.16, 0.14, 0.12, 1.0);
uniform vec4 tint : source_color = vec4(1.0, 0.8, 0.5, 1.0);
uniform float wash = 0.22;
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void fragment() {
	vec2 px = TEXTURE_PIXEL_SIZE * 1.6;
	vec2 j = (vec2(hash(vec2(boil, 1.3)), hash(vec2(boil, 7.1))) - 0.5) * TEXTURE_PIXEL_SIZE * 3.0;
	vec2 uv = UV + j;
	vec4 c = texture(TEXTURE, uv);
	float l = dot(c.rgb, vec3(0.3, 0.59, 0.11));
	float lx = dot(texture(TEXTURE, uv + vec2(px.x, 0.0)).rgb, vec3(0.33)) - dot(texture(TEXTURE, uv - vec2(px.x, 0.0)).rgb, vec3(0.33));
	float ly = dot(texture(TEXTURE, uv + vec2(0.0, px.y)).rgb, vec3(0.33)) - dot(texture(TEXTURE, uv - vec2(0.0, px.y)).rgb, vec3(0.33));
	float ax = texture(TEXTURE, uv + vec2(px.x, 0.0)).a - texture(TEXTURE, uv - vec2(px.x, 0.0)).a;
	float ay = texture(TEXTURE, uv + vec2(0.0, px.y)).a - texture(TEXTURE, uv - vec2(0.0, px.y)).a;
	float e = clamp(length(vec2(lx, ly)) * 3.2 + length(vec2(ax, ay)) * 2.0, 0.0, 1.0);
	float grain = hash(floor(UV * 420.0) + boil);
	e *= 0.75 + grain * 0.4;
	float hatch = step(0.5, fract((UV.x + UV.y) * 140.0)) * smoothstep(0.55, 0.2, l) * 0.35;
	vec3 col = mix(vec3(1.0), c.rgb * 0.5 + tint.rgb * 0.5, wash);
	float a = c.a;
	vec3 outc = mix(col, ink.rgb, clamp(e + hatch, 0.0, 1.0));
	COLOR = vec4(outc, a * clamp(e * 1.6 + wash + hatch, 0.0, 1.0));
}
"""

func setup(game, chapter: Dictionary) -> void:
	g = game; ch = chapter; en = I18n.lang == "en"; font = g.font
	set_anchors_preset(Control.PRESET_FULL_RECT); mouse_filter = Control.MOUSE_FILTER_STOP
	por = TextureRect.new(); por.expand_mode = TextureRect.EXPAND_IGNORE_SIZE; por.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	por.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var sh := Shader.new(); sh.code = SKETCH
	por_mat = ShaderMaterial.new(); por_mat.shader = sh; por.material = por_mat
	add_child(por)
	g.sfx.play("skill", -6.0, 0.0)

func panel():
	return ch.panels[idx] if idx >= 0 and idx < ch.panels.size() else null

func text_of(p) -> String: return str(p.get("en", p.text)) if en else str(p.text)

func _gui_input(ev: InputEvent) -> void:
	if (ev is InputEventMouseButton and ev.pressed and ev.button_index == MOUSE_BUTTON_LEFT) or (ev is InputEventKey and ev.pressed and ev.keycode in [KEY_SPACE, KEY_ENTER]):
		advance(); accept_event()
	elif ev is InputEventKey and ev.pressed and ev.keycode == KEY_ESCAPE:
		close(); accept_event()

func _unhandled_input(ev: InputEvent) -> void:
	if ev is InputEventKey and ev.pressed:
		if ev.keycode in [KEY_SPACE, KEY_ENTER]: advance(); get_viewport().set_input_as_handled()
		elif ev.keycode == KEY_ESCAPE: close(); get_viewport().set_input_as_handled()

func advance() -> void:
	var p = panel()
	if p != null and typed < text_of(p).length(): typed = 9999.0; return   # 先把这句打完
	idx += 1; t = 0.0; typed = 0.0
	g.sfx.play("click", -8.0)
	if idx >= ch.panels.size(): close(); return
	var who := str(ch.panels[idx].who)
	var path := "res://art/portraits/%s.png" % who
	por.texture = load(path) if who != "" and ResourceLoader.exists(path) else null
	var acc := Color(str(g.data.pilots[who].accent)) if g.data.pilots.has(who) else Color("#ffb648")
	por_mat.set_shader_parameter("tint", acc)

func close() -> void:
	if not done_emitted: done_emitted = true; finished.emit(int(ch.id))
	queue_free()

func _process(delta: float) -> void:
	t += delta
	boil_t += delta
	if boil_t >= 0.125: boil_t = 0.0; boil += 1; por_mat.set_shader_parameter("boil", float(boil % 4))
	if idx >= 0: typed += delta * (28.0 if not en else 55.0)
	if idx == -1 and t > 2.2: advance()
	var S := get_viewport_rect().size
	var h := S.y * 0.78; var w := h * 600.0 / 780.0
	var slide := 1.0 - pow(1.0 - clampf(t / 0.35, 0.0, 1.0), 3.0)
	por.position = Vector2(S.x * 0.62 - w * 0.5 + (1.0 - slide) * 60.0, S.y * 0.06); por.size = Vector2(w, h)
	por.modulate.a = slide
	queue_redraw()

# 抖动的铅笔线（同一根线画两遍，每遍有一点偏移）
func sk_line(a: Vector2, b: Vector2, wdt := 2.2, c := INK) -> void:
	var r := RandomNumberGenerator.new(); r.seed = int(a.x * 13 + a.y * 7 + b.x * 3 + b.y) + boil % 4 * 977
	for k in 2:
		var o1 := Vector2(r.randf_range(-1.6, 1.6), r.randf_range(-1.6, 1.6)); var o2 := Vector2(r.randf_range(-1.6, 1.6), r.randf_range(-1.6, 1.6))
		var mid := (a + b) * 0.5 + Vector2(r.randf_range(-2, 2), r.randf_range(-2, 2))
		draw_polyline(PackedVector2Array([a + o1, mid, b + o2]), Color(c, 0.75 - k * 0.3), wdt - k * 0.8, true)

func sk_poly(pts: Array, closed := true, wdt := 2.2, c := INK) -> void:
	for i in pts.size() - (0 if closed else 1): sk_line(pts[i], pts[(i + 1) % pts.size()], wdt, c)

func sk_circle(c: Vector2, r: float, wdt := 2.2, col := INK) -> void:
	var pts: Array = []
	for i in 18: pts.append(c + Vector2(cos(i * TAU / 18.0), sin(i * TAU / 18.0)) * r)
	sk_poly(pts, true, wdt, col)

func hatch(rect: Rect2, c := Color(INK, 0.25), step := 9.0) -> void:
	var x := rect.position.x
	while x < rect.end.x + rect.size.y:
		var a := Vector2(x, rect.position.y); var b := Vector2(x - rect.size.y, rect.end.y)
		if a.x > rect.end.x: a = Vector2(rect.end.x, rect.position.y + (a.x - rect.end.x))
		if b.x < rect.position.x: b = Vector2(rect.position.x, rect.end.y - (rect.position.x - b.x))
		draw_line(a, b, c, 1.2)
		x += step

func draw_bg(kind: String, S: Vector2) -> void:
	var hz := S.y * 0.62
	match kind:
		"dunes":
			for k in 4:
				var pts: Array = []
				for i in 13: pts.append(Vector2(S.x * i / 12.0, hz + k * 40 + sin(i * 0.9 + k) * 26))
				sk_poly(pts, false, 2.0)
			sk_line(Vector2(0, hz - 60), Vector2(S.x, hz - 60), 1.4, Color(INK, 0.4))
		"train":
			sk_line(Vector2(0, hz + 60), Vector2(S.x, hz + 60), 2.6); sk_line(Vector2(0, hz + 74), Vector2(S.x, hz + 74), 1.8)
			for k in 3:
				var x0 := 40.0 + k * 300.0
				sk_poly([Vector2(x0, hz - 80), Vector2(x0 + 280, hz - 80), Vector2(x0 + 280, hz + 50), Vector2(x0, hz + 50)])
				for wdw in 4: sk_poly([Vector2(x0 + 20 + wdw * 64, hz - 60), Vector2(x0 + 66 + wdw * 64, hz - 60), Vector2(x0 + 66 + wdw * 64, hz - 20), Vector2(x0 + 20 + wdw * 64, hz - 20)], true, 1.6)
				for wh in 2: sk_circle(Vector2(x0 + 60 + wh * 160, hz + 56), 16, 1.8)
			sk_circle(Vector2(S.x * 0.86, hz - 200), 46, 2.0, Color("#c87a2a"))
		"city":
			var r := RandomNumberGenerator.new(); r.seed = 11
			var x := 0.0
			while x < S.x:
				var bw := r.randf_range(60, 130); var bh := r.randf_range(120, 300)
				sk_poly([Vector2(x, hz + 40), Vector2(x, hz + 40 - bh), Vector2(x + bw, hz + 40 - bh), Vector2(x + bw, hz + 40)], false, 1.8)
				if r.randf() < 0.5: hatch(Rect2(x + 6, hz + 40 - bh + 10, bw * 0.4, bh * 0.5))
				x += bw + r.randf_range(4, 30)
			sk_line(Vector2(0, hz + 40), Vector2(S.x, hz + 40), 2.4)
		"metro":
			var vp := Vector2(S.x * 0.4, hz - 60)
			for k in 7: sk_line(vp, Vector2(S.x * (k / 6.0), S.y), 1.4, Color(INK, 0.55))
			sk_poly([vp + Vector2(-160, -110), vp + Vector2(160, -110), vp + Vector2(160, 60), vp + Vector2(-160, 60)], true, 1.6)
			for k in 4: sk_line(Vector2(0, S.y * 0.18 + k * 26), Vector2(S.x * 0.3, vp.y - 100 + k * 30), 1.2, Color(INK, 0.4))
		"crystal":
			var r := RandomNumberGenerator.new(); r.seed = 5
			for k in 9:
				var bx := r.randf_range(40, S.x * 0.5); var by := hz + r.randf_range(-20, 80); var hh := r.randf_range(80, 220)
				sk_poly([Vector2(bx - 18, by), Vector2(bx, by - hh), Vector2(bx + 18, by)], true, 2.0, Color("#6a4aaa"))
				sk_line(Vector2(bx, by - hh), Vector2(bx + 4, by), 1.2, Color("#6a4aaa"))
		"night":
			draw_rect(Rect2(Vector2.ZERO, S), Color(0.12, 0.1, 0.14, 0.35))
			for k in 30:
				var r := RandomNumberGenerator.new(); r.seed = k * 31
				var p := Vector2(r.randf() * S.x, r.randf() * hz)
				sk_line(p - Vector2(4, 0), p + Vector2(4, 0), 1.2); sk_line(p - Vector2(0, 4), p + Vector2(0, 4), 1.2)
			sk_poly([Vector2(60, hz - 40), Vector2(S.x * 0.45, hz - 40), Vector2(S.x * 0.45, hz + 90), Vector2(60, hz + 90)])
			sk_circle(Vector2(S.x * 0.22, hz - 4), 14, 2.0, Color("#c8a040"))
		"blacksun":
			draw_rect(Rect2(Vector2.ZERO, S), Color(0.1, 0.08, 0.12, 0.4))
			var c := Vector2(S.x * 0.3, S.y * 0.32)
			draw_circle(c, 90, Color(0.08, 0.06, 0.1, 0.9))
			for k in 16:
				var a := k * TAU / 16.0 + boil * 0.02
				sk_line(c + Vector2(cos(a), sin(a)) * 100, c + Vector2(cos(a), sin(a)) * (150 + (k % 3) * 30), 2.0, Color("#6a4aaa"))
			for k in 3: sk_line(Vector2(c.x - 40 + k * 30, c.y - 90), Vector2(c.x - 70 + k * 50, c.y + 90), 2.6, Color("#5ad8ff"))
		"sunrise":
			var c := Vector2(S.x * 0.3, hz)
			draw_circle(c, 80, Color(1.0, 0.75, 0.4, 0.45))
			sk_circle(c, 80, 2.4, Color("#c87a2a"))
			for k in 11:
				var a := PI + k * PI / 10.0
				sk_line(c + Vector2(cos(a), sin(a)) * 100, c + Vector2(cos(a), sin(a)) * 160, 2.0, Color("#c87a2a"))
			sk_line(Vector2(0, hz), Vector2(S.x, hz), 2.6)

func _draw() -> void:
	var S := get_viewport_rect().size
	# 纸面：米色 + 纸纹 + 四周压暗
	draw_rect(Rect2(Vector2.ZERO, S), PAPER)
	var r := RandomNumberGenerator.new(); r.seed = 3 + boil % 4
	for k in 140:
		var p := Vector2(r.randf() * S.x, r.randf() * S.y)
		draw_line(p, p + Vector2(r.randf_range(-6, 6), r.randf_range(-2, 2)), Color(0.5, 0.42, 0.3, 0.08), 1.0)
	for k in 8:
		draw_rect(Rect2(Vector2(k * 6, k * 6), S - Vector2(k * 12, k * 12)), Color(0.4, 0.3, 0.2, 0.025), false, 6.0)
	if idx == -1:   # 章节标题卡
		var a := clampf(t / 0.5, 0.0, 1.0) * clampf((2.2 - t) / 0.4, 0.0, 1.0)
		var no := ("CHAPTER %d" % int(ch.id)) if en else ("第 %d 话" % int(ch.id))
		var title := str(ch.en) if en else str(ch.title)
		var w1 := font.get_string_size(no, HORIZONTAL_ALIGNMENT_LEFT, -1, 30).x
		draw_string(font, Vector2(S.x * 0.5 - w1 * 0.5, S.y * 0.4), no, HORIZONTAL_ALIGNMENT_LEFT, -1, 30, Color(INK, 0.7 * a))
		var w2 := font.get_string_size(title, HORIZONTAL_ALIGNMENT_LEFT, -1, 84).x
		var jit := Vector2((boil % 2) * 1.5, ((boil + 1) % 2) * 1.2)
		draw_string(font, Vector2(S.x * 0.5 - w2 * 0.5, S.y * 0.56) + jit, title, HORIZONTAL_ALIGNMENT_LEFT, -1, 84, Color(INK, a))
		sk_line(Vector2(S.x * 0.3, S.y * 0.6), Vector2(S.x * 0.3 + S.x * 0.4 * clampf(t / 0.8, 0, 1), S.y * 0.6), 2.6, Color("#c87a2a", a))
		var sub := "AFTER DAWN" if not en else "黎明之后"
		var w3 := font.get_string_size(sub, HORIZONTAL_ALIGNMENT_LEFT, -1, 20).x
		draw_string(font, Vector2(S.x * 0.5 - w3 * 0.5, S.y * 0.68), sub, HORIZONTAL_ALIGNMENT_LEFT, -1, 20, Color("#c87a2a", 0.8 * a))
		return
	var p = panel()
	if p == null: return
	draw_bg(str(p.bg), S)
	# 分镜框
	sk_poly([Vector2(26, 26), Vector2(S.x - 26, 26), Vector2(S.x - 26, S.y - 26), Vector2(26, S.y - 26)], true, 3.0)
	# 台词框
	var bx := Rect2(Vector2(S.x * 0.06, S.y * 0.7), Vector2(S.x * 0.88, S.y * 0.22))
	draw_rect(bx, Color(1, 0.98, 0.94, 0.92))
	sk_poly([bx.position, Vector2(bx.end.x, bx.position.y), bx.end, Vector2(bx.position.x, bx.end.y)], true, 2.6)
	var who := str(p.who)
	var nm := ""
	if who != "" and g.data.pilots.has(who):
		nm = str(g.data.pilots[who].name)
		if en: nm = I18n.t(nm)
	if nm != "":
		var nb := Rect2(bx.position + Vector2(18, -22), Vector2(font.get_string_size(nm, HORIZONTAL_ALIGNMENT_LEFT, -1, 24).x + 30, 40))
		draw_rect(nb, Color("#2a2420"))
		draw_string(font, nb.position + Vector2(15, 29), nm, HORIZONTAL_ALIGNMENT_LEFT, -1, 24, Color("#f3ead8"))
	var full := text_of(p)
	var shown := full.substr(0, int(typed))
	draw_multiline_string(font, bx.position + Vector2(30, 56), shown, HORIZONTAL_ALIGNMENT_LEFT, bx.size.x - 60, 28, -1, INK)
	if int(typed) >= full.length() and int(t * 2) % 2 == 0:
		draw_string(font, bx.end - Vector2(40, 18), "▼", HORIZONTAL_ALIGNMENT_LEFT, -1, 20, Color("#c87a2a"))
	var pg := "%d / %d" % [idx + 1, ch.panels.size()]
	draw_string(font, Vector2(S.x - 120, 62), pg, HORIZONTAL_ALIGNMENT_LEFT, -1, 18, Color(INK, 0.6))
	var hint := I18n.t("点击 / 空格继续 • Esc 跳过")
	draw_string(font, Vector2(46, 62), hint, HORIZONTAL_ALIGNMENT_LEFT, -1, 16, Color(INK, 0.5))
