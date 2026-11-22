# 涂鸦机兵 电脑版 3.1 —— 尾声的终结技「绝响」终章动画（约 2.8 秒）
# 只有放招的人和被锁定的人看得到（别的玩家只看到一团黑色的共鸣球，见 dawn_fx.gd）
#   0.00 黑幕 + 宽银幕黑边切进来，一条示波器波形横穿屏幕
#   0.20 尾声从左边滑入，身后一圈圈声波往外扩
#   0.85 右边是被锁定的人：画面褪色，五根共鸣弦从尾声射出去缠住他
#   1.55 「绝响」两个大字砸下来（青 / 红错位残影 + 震屏），波形炸出尖峰
#   2.05 白闪 + 一道横斩，对面的立绘碎成三角碎片飞散
#   2.55 淡出回到战场
class_name FinaleCine
extends Control

const T_END := 2.8
const CYAN := Color("#7ad8ff")
var g
var t := 0.0
var caster_id := 0
var target_id := 0
var me_cast := true
var tex_a: Texture2D
var tex_b: Texture2D
var name_a := ""
var name_b := ""
var shards: Array = []
var played := {}
var font: Font

func setup(game, caster, target, i_cast: bool) -> void:
	g = game; me_cast = i_cast
	caster_id = caster.id if caster != null else 0; target_id = target.id if target != null else 0
	tex_a = _tex(caster.pilot if caster != null else "coda")
	tex_b = _tex(target.pilot if target != null else "blaze")
	name_a = I18n.keep(str(caster.name)) if caster != null else "尾声"
	name_b = I18n.keep(str(target.name)) if target != null else ""
	font = g.font
	set_anchors_preset(Control.PRESET_FULL_RECT); mouse_filter = Control.MOUSE_FILTER_IGNORE
	z_index = 50

func _tex(pid: String) -> Texture2D:
	var p := "res://art/portraits/%s.png" % pid
	return load(p) if ResourceLoader.exists(p) else null

func once(k: String, f: Callable) -> void:
	if played.has(k): return
	played[k] = true; f.call()

func _process(delta: float) -> void:
	t += delta
	# 和对局里的终章计时对齐（机器卡的时候不会跑在前面）
	var q = g.sim.player_by(caster_id) if g.sim != null else null
	if q != null and q.cine_t > 0: t = minf(t, T_END - 0.0 - q.cine_t + 0.05)
	if t >= T_END:
		queue_free(); return
	once("a", func(): g.sfx.play("super", 0.0, 0.0))
	if t > 0.85: once("b", func(): g.sfx.play("beam", -2.0, 0.0))
	if t > 1.55: once("c", func(): g.sfx.play("boom", 0.0, 0.0); g.shake = maxf(g.shake, 0.6))
	if t > 2.05: once("d", func(): g.sfx.play("wreck", 2.0, 0.0); make_shards())
	queue_redraw()

func ease_out(x: float) -> float: return 1.0 - pow(1.0 - clampf(x, 0.0, 1.0), 3.0)
func k(a: float, b: float) -> float: return clampf((t - a) / (b - a), 0.0, 1.0)

func portrait_rect(left: bool, S: Vector2) -> Rect2:
	var h := S.y * 0.86; var w := h * 600.0 / 780.0
	var slide := ease_out(k(0.15, 0.55) if left else k(0.7, 1.05))
	var x := (S.x * 0.04 - w * (1.0 - slide)) if left else (S.x - w - S.x * 0.04 + w * (1.0 - slide))
	return Rect2(Vector2(x, S.y - h), Vector2(w, h))

func make_shards() -> void:
	var S := get_viewport_rect().size
	var r := portrait_rect(false, S)
	var rn := RandomNumberGenerator.new(); rn.seed = 7
	var cols := 6; var rows := 8
	for yy in rows:
		for xx in cols:
			var p0 := Vector2(xx / float(cols), yy / float(rows)); var p1 := Vector2((xx + 1) / float(cols), (yy + 1) / float(rows))
			var mid := Vector2(lerpf(p0.x, p1.x, rn.randf_range(0.3, 0.7)), lerpf(p0.y, p1.y, rn.randf_range(0.3, 0.7)))
			for tri in [[p0, Vector2(p1.x, p0.y), mid], [Vector2(p1.x, p0.y), p1, mid], [p1, Vector2(p0.x, p1.y), mid], [Vector2(p0.x, p1.y), p0, mid]]:
				var c: Vector2 = (tri[0] + tri[1] + tri[2]) / 3.0
				var dir := (c - Vector2(0.35, 0.45)).normalized()
				shards.append({"uv": tri, "c": c, "v": dir * rn.randf_range(500, 1300) + Vector2(rn.randf_range(-200, 200), rn.randf_range(-500, 100)), "rot": rn.randf_range(-6, 6), "rect": r})

func _draw() -> void:
	var S := get_viewport_rect().size
	var fade_in := k(0.0, 0.18); var fade_out := 1.0 - k(2.55, 2.8)
	var A := fade_in * fade_out
	# 黑幕 + 深蓝渐变
	draw_rect(Rect2(Vector2.ZERO, S), Color(0.01, 0.015, 0.04, 0.96 * A))
	for i in 12:
		var yy := S.y * (0.3 + i * 0.04)
		draw_rect(Rect2(0, yy, S.x, S.y * 0.04), Color(0.05, 0.12, 0.22, 0.05 * A * (1.0 - absf(i - 6) / 6.0)))
	# 声波圈（从尾声身上往外扩）
	var ra := portrait_rect(true, S)
	var src := ra.position + Vector2(ra.size.x * 0.5, ra.size.y * 0.32)
	for i in 7:
		var ph := fmod(t * 1.3 + i / 7.0, 1.0)
		var rr := ph * S.x * 0.75
		draw_arc(src, rr, 0, TAU, 96, Color(CYAN, (1.0 - ph) * 0.35 * A * k(0.2, 0.5)), 3.0 + (1.0 - ph) * 5.0, true)
	# 示波器波形
	var amp := 18.0 + 220.0 * k(1.55, 1.7) * (1.0 - k(1.7, 2.3)) + 30.0 * k(0.85, 1.4)
	var pts := PackedVector2Array()
	var yc := S.y * 0.5
	for i in 161:
		var x := S.x * i / 160.0
		var u := float(i) / 160.0
		var env := sin(u * PI)
		var y := yc + sin(u * 38.0 + t * 30.0) * amp * env * (0.6 + 0.4 * sin(u * 7.0 - t * 9.0))
		if absf(u - 0.5) < 0.04 and t > 1.55: y += (randf() - 0.5) * amp * 1.4
		pts.append(Vector2(x, y))
	var wave_a := A * k(0.0, 0.25)
	draw_polyline(pts, Color(CYAN, 0.18 * wave_a), 14.0, true)
	draw_polyline(pts, Color(CYAN, 0.5 * wave_a), 5.0, true)
	draw_polyline(pts, Color(1, 1, 1, 0.9 * wave_a), 1.6, true)
	# 被锁定的人（褪色）
	var rb := portrait_rect(false, S)
	if tex_b != null and t < 2.05 and t > 0.7:
		var tint := Color(0.55, 0.62, 0.72, A * k(0.7, 0.9))
		draw_texture_rect(tex_b, rb, false, tint)
		draw_rect(rb, Color(0.02, 0.04, 0.1, 0.35 * A), true)
	# 尾声
	if tex_a != null:
		draw_texture_rect(tex_a, Rect2(ra.position + Vector2(-8, 0), ra.size), false, Color(CYAN, 0.35 * A))
		draw_texture_rect(tex_a, ra, false, Color(1, 1, 1, A))
	# 共鸣弦：五根贝塞尔曲线射过去缠住对方，上面有跑动的光点
	var sk := k(0.85, 1.3)
	if sk > 0 and t < 2.1:
		var dst := rb.position + Vector2(rb.size.x * 0.5, rb.size.y * 0.35)
		for s in 5:
			var off := (s - 2) * 46.0
			var c1 := src + Vector2(S.x * 0.18, -160 + off * 2.0); var c2 := dst + Vector2(-S.x * 0.22, 160 - off * 1.6)
			var line := PackedVector2Array()
			var n := int(48 * sk)
			for i in n + 1:
				var u := float(i) / 48.0
				var q := src.lerp(c1, u).lerp(c1.lerp(c2, u), u).lerp(c1.lerp(c2, u).lerp(c2.lerp(dst + Vector2(0, off), u), u), u)
				q += Vector2(0, sin(u * 20.0 + t * 25.0 + s) * 6.0 * (1.0 - u))
				line.append(q)
			if line.size() >= 2:
				draw_polyline(line, Color(CYAN, 0.25 * A), 8.0, true)
				draw_polyline(line, Color(0.85, 0.97, 1.0, 0.9 * A), 2.0, true)
				var pu := fmod(t * 2.2 + s * 0.2, 1.0)
				if pu * 48 < line.size(): draw_circle(line[int(pu * (line.size() - 1))], 6.0, Color(1, 1, 1, A))
	# 碎片
	if not shards.is_empty() and tex_b != null:
		var el := t - 2.05
		for sh in shards:
			var r: Rect2 = sh.rect
			var c: Vector2 = r.position + sh.c * r.size + sh.v * el + Vector2(0, 900) * el * el
			var rot: float = sh.rot * el
			var polys := PackedVector2Array(); var uvs := PackedVector2Array()
			for uvp in sh.uv:
				var lp: Vector2 = r.position + uvp * r.size - (r.position + sh.c * r.size)
				polys.append(c + lp.rotated(rot) * (1.0 - el * 0.3)); uvs.append(uvp)
			draw_colored_polygon(polys, Color(0.7, 0.85, 1.0, A * (1.0 - el / 0.7)), uvs, tex_b)
	# 「绝响」
	if t > 1.55:
		var tk := ease_out(k(1.55, 1.68))
		var sz := int(lerpf(380.0, 190.0, tk))
		var txt := I18n.t("绝响")
		var tw := font.get_string_size(txt, HORIZONTAL_ALIGNMENT_LEFT, -1, sz).x
		var pos := Vector2(S.x * 0.5 - tw * 0.5, S.y * 0.5 + sz * 0.35)
		var shake := Vector2(randf() - 0.5, randf() - 0.5) * 14.0 * (1.0 - k(1.55, 1.9))
		var ta := A * tk
		draw_string(font, pos + shake + Vector2(-9, 3), txt, HORIZONTAL_ALIGNMENT_LEFT, -1, sz, Color(0.2, 0.9, 1.0, 0.55 * ta))
		draw_string(font, pos + shake + Vector2(9, -3), txt, HORIZONTAL_ALIGNMENT_LEFT, -1, sz, Color(1.0, 0.25, 0.4, 0.45 * ta))
		draw_string(font, pos + shake, txt, HORIZONTAL_ALIGNMENT_LEFT, -1, sz, Color(1, 1, 1, ta))
		var sub := "FINAL  NOTE"
		var sw := font.get_string_size(sub, HORIZONTAL_ALIGNMENT_LEFT, -1, 34).x
		draw_string(font, Vector2(S.x * 0.5 - sw * 0.5, pos.y + 64), sub, HORIZONTAL_ALIGNMENT_LEFT, -1, 34, Color(CYAN, 0.85 * ta))
	# 顶部小字：谁锁定了谁
	if t > 0.3:
		var cap := I18n.t("余韵 · 五重") + "   " + name_a + "  ▶  " + name_b
		draw_string(font, Vector2(S.x * 0.06, S.y * 0.1 + 26), cap, HORIZONTAL_ALIGNMENT_LEFT, -1, 26, Color(CYAN, 0.9 * A * k(0.3, 0.5)))
		if not me_cast:
			var warn := I18n.t("你被「绝响」锁定了")
			var ww := font.get_string_size(warn, HORIZONTAL_ALIGNMENT_LEFT, -1, 30).x
			draw_string(font, Vector2(S.x - ww - S.x * 0.06, S.y * 0.1 + 26), warn, HORIZONTAL_ALIGNMENT_LEFT, -1, 30, Color(1, 0.4, 0.5, A * k(0.8, 1.0)))
	# 横斩 + 白闪
	if t > 2.0 and t < 2.35:
		var sl := k(2.0, 2.12)
		var y0 := S.y * 0.46
		draw_line(Vector2(S.x * (1.0 - sl * 1.2), y0 + 40), Vector2(S.x * (1.2 - sl * 1.2) + S.x * 0.6, y0 - 40), Color(1, 1, 1, 1.0 - k(2.12, 2.35)), 10.0 * (1.0 - k(2.12, 2.35)) + 2.0)
	var fl := k(2.03, 2.07) * (1.0 - k(2.07, 2.3))
	if fl > 0: draw_rect(Rect2(Vector2.ZERO, S), Color(1, 1, 1, fl * 0.9))
	# 宽银幕黑边
	var bar := S.y * 0.11 * ease_out(k(0.0, 0.2)) * fade_out
	draw_rect(Rect2(0, 0, S.x, bar), Color.BLACK); draw_rect(Rect2(0, S.y - bar, S.x, bar), Color.BLACK)
