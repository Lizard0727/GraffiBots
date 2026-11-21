# 涂鸦机兵 Godot 样品版 —— 对战模拟（纯逻辑，没有画面）
# 移植自 public/shared.js（移动物理、涂地）和 public/core.js（武器、伤害、技能、大招、AI）
# 坐标沿用原版：x 向右、y 向下（地图平面），z 向上；单位是像素（1 格 = 16）
class_name Sim
extends RefCounted

const CELL := 16.0

class Mech:
	var id := 0
	var name := ""
	var team := 1
	var pilot := "blaze"
	var weapon := "blaster"
	var bot := false
	var x := 0.0
	var y := 0.0
	var z := 0.0
	var vx := 0.0
	var vy := 0.0
	var vz := 0.0
	var kx := 0.0
	var ky := 0.0
	var on_ground := true
	var coy := 0.0
	var jb := 0.0
	var j_held := false
	var jumped := false
	var pad_t := 0.0
	var hp := 100.0
	var max_hp := 100.0
	var ammo := 3.0
	var sp := 0.0
	var alive := true
	var respawn_t := 0.0
	var inv_t := 0.0
	var last_hurt := -10.0
	var last_atk := -10.0
	var atk_cd := 0.0
	var burst_n := 0
	var burst_t := 0.0
	var burst_a := 0.0
	var charge := 0.0
	var firing := false
	var wheel := false
	var hidden := false
	var sm := 1.0
	var skill_uses := 2
	var skill_max := 2
	var skill_regen := 0.0
	var skill_cd := 0.0
	var rush_t := 0.0
	var sp_t := 0.0
	var sp_wave := 0
	var kills := 0
	var deaths := 0
	var painted := 0
	# 输入：mx/my 移动方向，a 瞄准角（弧度），f 按住开火，w 滚轮形态，j 跳跃，gq/qq 技能 / 大招按下计数
	var inp := {"mx": 0.0, "my": 0.0, "a": 0.0, "f": false, "w": false, "j": false, "gq": 0, "qq": 0, "ad": 300.0}
	var last_gq := 0
	var last_qq := 0
	# AI
	var ai_t := 0.0
	var ai_goal := Vector2.ZERO
	var ai_field := PackedInt32Array()
	var ai_goal_cell := -1
	var ai_stuck := 0.0
	var ai_last := Vector2.ZERO
	var ai_strafe := 1.0

var D: Dictionary
var GW := 120
var GH := 80
var W := 1920.0
var H := 1280.0
var top := PackedInt32Array()
var solid := PackedByteArray()
var bush := PackedByteArray()
var pad := PackedByteArray()
var grid := PackedByteArray()        # 每格涂料：0 没涂，1 / 2 两队
var dirty := PackedInt32Array()      # 这一帧涂过的格子（给画面更新贴图）
var players: Array = []
var projs: Array = []
var missiles: Array = []
var events: Array = []               # 给画面 / 音效的事件
var time := 0.0
var time_left := 180.0
var countdown := 3.0
var over := false
var winner := 0
var result := {}
var reveal := [0.0, 0.0, 0.0]
var rng := RandomNumberGenerator.new()
var C: Dictionary

func _init(data: Dictionary, seed_v: int = 0, duration: float = 180.0) -> void:
	D = data
	C = D.consts
	var m: Dictionary = D.map
	GW = int(m.gw); GH = int(m.gh); W = GW * CELL; H = GH * CELL
	top = PackedInt32Array(m.top); solid = PackedByteArray(m.solid); bush = PackedByteArray(m.bush); pad = PackedByteArray(m.pad)
	grid.resize(GW * GH)
	time_left = duration
	if seed_v != 0:
		rng.seed = seed_v
	else:
		rng.randomize()

# ---------------- 网格工具 ----------------
func in_bounds(cx: int, cy: int) -> bool:
	return cx >= 0 and cy >= 0 and cx < GW and cy < GH

func top_cell(cx: int, cy: int) -> float:
	return float(top[cy * GW + cx]) if in_bounds(cx, cy) else 10000.0

func top_at(x: float, y: float) -> float:
	return top_cell(int(floor(x / CELL)), int(floor(y / CELL)))

func cell_at(x: float, y: float) -> int:
	var cx := int(floor(x / CELL)); var cy := int(floor(y / CELL))
	return grid[cy * GW + cx] if in_bounds(cx, cy) else 0

func in_bush(x: float, y: float, z: float) -> bool:
	var cx := int(floor(x / CELL)); var cy := int(floor(y / CELL))
	return in_bounds(cx, cy) and bush[cy * GW + cx] == 1 and z < 6.0

# ---------------- 玩家 ----------------
func add_player(id: int, name: String, team: int, pilot: String, weapon: String, bot: bool) -> Mech:
	var p := Mech.new()
	p.id = id; p.name = name; p.team = team; p.pilot = pilot; p.weapon = weapon; p.bot = bot
	var w: Dictionary = D.mechs[weapon]
	p.max_hp = float(w.hp); p.hp = p.max_hp
	p.skill_max = int(C.SKILL_CHARGES); p.skill_uses = p.skill_max
	p.ai_strafe = 1.0 if rng.randf() < 0.5 else -1.0
	players.append(p)
	respawn(p, players.size() - 1)
	return p

func respawn(p: Mech, slot: int = -1) -> void:
	var team_slot := slot if slot >= 0 else rng.randi_range(0, 3)
	var sps: Array = D.spawns[p.team - 1]
	var s: Dictionary = sps[team_slot % 4]
	p.x = float(s.x); p.y = float(s.y); p.z = top_at(p.x, p.y)
	p.vx = 0; p.vy = 0; p.vz = 0; p.kx = 0; p.ky = 0; p.on_ground = true
	p.hp = p.max_hp; p.ammo = float(C.AMMO); p.alive = true; p.inv_t = 1.5; p.charge = 0; p.burst_n = 0
	p.inp.a = 0.0 if p.team == 1 else PI

func weapon_of(p: Mech) -> Dictionary:
	return D.mechs[p.weapon]

# ---------------- 主循环 ----------------
func step(dt: float) -> void:
	dirty.clear()
	events.clear()
	if over:
		return
	if countdown > 0:
		countdown -= dt
		return
	time += dt
	time_left -= dt
	for p in players:
		if p.bot:
			ai_think(p, dt)
		update_player(p, dt)
	update_projs(dt)
	update_missiles(dt)
	if time_left <= 0:
		finish()

func finish() -> void:
	over = true
	var a := 0; var b := 0; var tot := 0
	for i in grid.size():
		if solid[i]:
			continue
		tot += 1
		if grid[i] == 1: a += 1
		elif grid[i] == 2: b += 1
	winner = 1 if a > b else (2 if b > a else 0)
	result = {"a": a, "b": b, "tot": tot, "winner": winner}
	events.append(["end", winner])

func update_player(p: Mech, dt: float) -> void:
	if not p.alive:
		p.respawn_t -= dt
		if p.respawn_t <= 0:
			respawn(p)
		return
	var w := weapon_of(p)
	p.inv_t = max(0.0, p.inv_t - dt)
	p.skill_cd = max(0.0, p.skill_cd - dt)
	p.rush_t = max(0.0, p.rush_t - dt)
	if p.skill_uses < p.skill_max:   # 2.2 技能充能制：每 15 秒回复 1 次
		p.skill_regen += dt
		if p.skill_regen >= float(C.SKILL_REGEN):
			p.skill_regen -= float(C.SKILL_REGEN); p.skill_uses += 1
			if p.skill_uses >= p.skill_max: p.skill_regen = 0
	var ground := cell_at(p.x, p.y) if p.on_ground else -1
	var own := ground == p.team
	var enemy_paint := ground > 0 and not own
	var sm := float(w.spd)
	if p.rush_t > 0: sm *= 1.35
	if p.sp_t > 0 and p.weapon == "charger": sm *= 1.0
	p.sm = sm
	p.wheel = bool(p.inp.w) and p.sp_t <= 0
	var mul := 1.0
	if p.firing and not p.wheel:
		mul = 0.5 if p.weapon == "charger" else 0.9
	step_move(p, dt, mul)
	# 敌方涂料掉血；脱战回血
	if enemy_paint and p.inv_t <= 0 and p.hp > p.max_hp * 0.3:
		p.hp = max(p.max_hp * 0.3, p.hp - p.max_hp * 0.1 * dt)
	if not enemy_paint and time - p.last_hurt > 3.0 and time - p.last_atk > 2.0:
		var k := 0.32 if (p.wheel and own) else 0.16
		p.hp = min(p.max_hp, p.hp + p.max_hp * k * dt)
	# 装填：攻击中不装填；己方涂料上的滚轮形态装填更快
	if p.burst_n <= 0 and p.charge <= 0:
		var rk := (2.0 if p.rush_t > 0 else 1.0) * (1.6 if (p.wheel and own) else 1.0)
		p.ammo = min(float(C.AMMO), p.ammo + dt / float(w.reload) * rk)
	p.firing = false
	if p.wheel:
		p.charge = 0
	else:
		p.firing = weapon_logic(p, dt, w)
	# 隐身：草丛 / 己方涂料里的滚轮；攻击后 0.9 秒内会暴露
	var recent := time - p.last_atk < 0.9
	p.hidden = (in_bush(p.x, p.y, p.z) or (p.wheel and own)) and not recent
	if p.inp.qq != p.last_qq:
		p.last_qq = p.inp.qq
		if p.sp >= float(w.spNeed) and p.sp_t <= 0:
			activate_special(p)
	if p.inp.gq != p.last_gq:
		p.last_gq = p.inp.gq
		if p.skill_uses > 0 and p.skill_cd <= 0:
			use_skill(p)
	if p.sp_t > 0:
		update_special(p, dt)

# ---------------- 移动物理（移植 S.stepMove / S.collide） ----------------
func speed_for(p: Mech, ground: int, wheel: bool, mul: float) -> float:
	var V: Dictionary = D.speed
	var s := 0.0
	if ground < 0:
		s = float(V.airWheel) if wheel else float(V.airWalk) * mul
	else:
		var own := ground == p.team
		var en := ground != 0 and ground != p.team
		if wheel:
			s = float(V.wheelOwn) if own else (float(V.wheelEnemy) if en else float(V.wheelDry))
		else:
			s = (float(V.enemy) if en else float(V.walk)) * mul
	return s * p.sm

func surface_for(p: Mech, ground: int, wheel: bool) -> Dictionary:
	var P: Dictionary = D.phys
	if ground < 0: return P.air
	if ground != 0 and ground != p.team: return P.sticky
	if wheel: return P.wheelOwn if ground == p.team else P.wheelDry
	return P.walk

func approach(p: Mech, tx: float, ty: float, surf: Dictionary, dt: float) -> void:
	var dvx := tx - p.vx; var dvy := ty - p.vy
	var dl := sqrt(dvx * dvx + dvy * dvy)
	if dl < 0.0001: return
	var tl := sqrt(tx * tx + ty * ty); var vl := sqrt(p.vx * p.vx + p.vy * p.vy)
	var a := 0.0
	if tl < 1: a = float(surf.coast)
	elif p.vx * tx + p.vy * ty < 0 or vl > tl + 5: a = float(surf.brake)
	else: a = float(surf.acc)
	var m: float = min(dl, a * dt)
	p.vx += dvx / dl * m; p.vy += dvy / dl * m

func collide(p: Mech, r: float) -> void:
	var step_h := float(C.STEP)
	for _it in 3:
		var moved := false
		var x0 := int(floor((p.x - r) / CELL)); var x1 := int(floor((p.x + r) / CELL))
		var y0 := int(floor((p.y - r) / CELL)); var y1 := int(floor((p.y + r) / CELL))
		for cy in range(y0, y1 + 1):
			for cx in range(x0, x1 + 1):
				if top_cell(cx, cy) <= p.z + step_h: continue
				var rx := cx * CELL; var ry := cy * CELL
				var qx := clampf(p.x, rx, rx + CELL); var qy := clampf(p.y, ry, ry + CELL)
				var dx := p.x - qx; var dy := p.y - qy
				var d2 := dx * dx + dy * dy
				if d2 >= r * r: continue
				if d2 > 0.000001:
					var d := sqrt(d2); var push := r - d
					p.x += dx / d * push; p.y += dy / d * push
				else:
					var l := p.x - rx; var rr := rx + CELL - p.x; var t := p.y - ry; var b := ry + CELL - p.y
					var mn: float = min(min(l, rr), min(t, b))
					if mn == l: p.x = rx - r
					elif mn == rr: p.x = rx + CELL + r
					elif mn == t: p.y = ry - r
					else: p.y = ry + CELL + r
				moved = true
		if not moved: break
	p.x = clampf(p.x, r, W - r); p.y = clampf(p.y, r, H - r)

func step_move(p: Mech, dt: float, mul: float) -> void:
	var P: Dictionary = D.phys
	var mx := float(p.inp.mx); var my := float(p.inp.my)
	var l := sqrt(mx * mx + my * my)
	if l > 1: mx /= l; my /= l
	var wheel := p.wheel
	var ground := cell_at(p.x, p.y) if p.on_ground else -1
	var spd := speed_for(p, ground, wheel, mul)
	approach(p, mx * spd, my * spd, surface_for(p, ground, wheel), dt)
	var kd := exp(-dt * (float(P.kbGround) if p.on_ground else float(P.kbAir)))
	p.kx *= kd; p.ky *= kd
	if abs(p.kx) < 1: p.kx = 0
	if abs(p.ky) < 1: p.ky = 0
	p.coy = float(P.coyote) if p.on_ground else max(0.0, p.coy - dt)
	if p.inp.j and not p.j_held: p.jb = float(P.jumpBuffer)
	else: p.jb = max(0.0, p.jb - dt)
	p.j_held = bool(p.inp.j)
	if p.jb > 0 and p.coy > 0:
		p.vz = 410.0 if wheel else float(C.JUMP_V)
		p.on_ground = false; p.coy = 0; p.jb = 0; p.jumped = true
	var ox := p.x; var oy := p.y
	var ex := (p.vx + p.kx) * dt; var ey := (p.vy + p.ky) * dt
	p.x += ex; p.y += ey
	collide(p, float(C.R))
	var nx := p.x - (ox + ex); var ny := p.y - (oy + ey)
	var nl := sqrt(nx * nx + ny * ny)
	if nl > 0.01:
		var ux := nx / nl; var uy := ny / nl
		var dv := p.vx * ux + p.vy * uy
		if dv < 0: p.vx -= ux * dv; p.vy -= uy * dv
		var dk := p.kx * ux + p.ky * uy
		if dk < 0: p.kx -= ux * dk * 1.4; p.ky -= uy * dk * 1.4
	# 弹跳板
	p.pad_t = max(0.0, p.pad_t - dt)
	if p.on_ground and p.pad_t <= 0:
		var cx := int(floor(p.x / CELL)); var cy := int(floor(p.y / CELL))
		var pc := pad[cy * GW + cx] if in_bounds(cx, cy) else 0
		if pc > 0:
			var a := (pc - 1) / 250.0 * TAU
			p.vz = float(D.pad.v); p.on_ground = false; p.coy = 0; p.jumped = false; p.pad_t = 0.6
			p.kx += cos(a) * float(D.pad.push); p.ky += sin(a) * float(D.pad.push)
			events.append(["pad", p.id])
	# 垂直
	var gh := top_at(p.x, p.y)
	if p.on_ground:
		if gh < p.z - 0.5: p.on_ground = false; p.vz = 0
		else: p.z = gh
	if not p.on_ground:
		var g := float(C.GRAV)
		if p.vz > 0 and not p.inp.j and p.jumped: g *= float(P.jumpCut)
		elif p.vz < 0: g *= float(P.fallMul)
		p.vz = max(-float(P.maxFall), p.vz - g * dt)
		p.z += p.vz * dt
		if p.z <= gh:
			p.z = gh; p.vz = 0; p.on_ground = true; p.jumped = false

func knock(p: Mech, dx: float, dy: float, power: float) -> void:
	var l := sqrt(dx * dx + dy * dy)
	if l < 0.000001: return
	p.kx += dx / l * power; p.ky += dy / l * power
	var kl := sqrt(p.kx * p.kx + p.ky * p.ky)
	if kl > 520: p.kx *= 520 / kl; p.ky *= 520 / kl

# ---------------- 涂地 ----------------
func paint(x: float, y: float, z: float, r: float, team: int, owner: Mech) -> int:
	r = max(12.0, r)
	var n := 0
	var r2 := r * r
	var x0 := maxi(0, int(floor((x - r) / CELL))); var x1 := mini(GW - 1, int(floor((x + r) / CELL)))
	var y0 := maxi(0, int(floor((y - r) / CELL))); var y1 := mini(GH - 1, int(floor((y + r) / CELL)))
	for cy in range(y0, y1 + 1):
		for cx in range(x0, x1 + 1):
			var dx := cx * CELL + CELL / 2 - x; var dy := cy * CELL + CELL / 2 - y
			if dx * dx + dy * dy > r2: continue
			var i := cy * GW + cx
			if solid[i]: continue
			var t := float(top[i])
			if t > z + 12 or t < z - 35: continue
			if grid[i] != team:
				grid[i] = team; n += 1; dirty.append(i)
	if owner != null and n > 0:
		owner.painted += n
		if owner.sp_t <= 0:
			owner.sp = min(float(weapon_of(owner).spNeed), owner.sp + n * 0.6)
	return n

# ---------------- 武器 ----------------
func weapon_logic(p: Mech, dt: float, w: Dictionary) -> bool:
	p.atk_cd -= dt
	if p.burst_n > 0:
		step_burst(p, w, dt)
		return true
	if str(w.attack) == "charge":
		if p.inp.f and p.ammo >= 1:
			p.charge = min(1.0, p.charge + dt / float(w.chargeTime))
			return true
		if p.charge > 0.08 and p.ammo >= 1 and p.atk_cd <= 0:
			p.ammo -= 1; p.atk_cd = float(w.atkCd); p.last_atk = time
			fire_charger(p, p.charge, w)
		p.charge = 0
		return false
	if p.inp.f and p.atk_cd <= 0 and p.ammo >= 1:
		p.ammo -= 1; p.atk_cd = float(w.atkCd); p.last_atk = time
		p.burst_n = int(w.shots); p.burst_t = 0; p.burst_a = float(p.inp.a)
		step_burst(p, w, 0.0)
		return true
	return false

func step_burst(p: Mech, w: Dictionary, dt: float) -> void:
	p.burst_t -= dt
	while p.burst_n > 0 and p.burst_t <= 0:
		var i := int(w.shots) - p.burst_n
		var fin := p.burst_n == 1 and w.has("finale")
		var a := float(p.inp.a) + rng.randf_range(-1.0, 1.0) * float(w.spread)
		var dmg := float(w.dmg) * (float(w.finale) if fin else 1.0)
		spawn_proj(p, a, float(w.speed), float(w.range), dmg, float(w.splat) * (1.4 if fin else 1.0), float(w.trail), float(w.size))
		p.burst_n -= 1
		p.burst_t += float(w.interval)
		if i == 0: events.append(["fire", p.id, p.weapon])

func spawn_proj(p: Mech, a: float, speed: float, rng_len: float, dmg: float, splat: float, trail: float, size: float) -> void:
	var dx := cos(a); var dy := sin(a)
	projs.append({"x": p.x + dx * 16, "y": p.y + dy * 16, "z": p.z + float(C.MUZZLE), "dx": dx, "dy": dy, "speed": speed, "range": rng_len,
		"dist": 0.0, "dmg": dmg, "splat": splat, "trail": trail, "size": size, "team": p.team, "owner": p, "lp": 0.0})

func update_projs(dt: float) -> void:
	var keep: Array = []
	for pr in projs:
		var alive := true
		var travel: float = pr.speed * dt
		var steps := int(ceil(travel / 8.0))
		var st := travel / steps
		for _s in steps:
			pr.x += pr.dx * st; pr.y += pr.dy * st; pr.dist += st
			var gh := top_at(pr.x, pr.y)
			if gh > pr.z or pr.x < 0 or pr.y < 0 or pr.x > W or pr.y > H:   # 撞墙
				paint(pr.x - pr.dx * 10, pr.y - pr.dy * 10, top_at(pr.x - pr.dx * 10, pr.y - pr.dy * 10), pr.splat * 0.6, pr.team, pr.owner)
				events.append(["splat", pr.x, pr.y, pr.z, pr.team])
				alive = false; break
			var hit := hit_player(pr.team, pr.x, pr.y, pr.z, pr.size)
			if hit != null:
				hurt(hit, pr.dmg, pr.owner, pr.dx, pr.dy)
				paint(pr.x, pr.y, hit.z, pr.splat * 0.5, pr.team, pr.owner)
				events.append(["hit", hit.id, pr.x, pr.y, pr.z, pr.team])
				alive = false; break
			if pr.trail > 0 and pr.dist - pr.lp > 34:
				pr.lp = pr.dist
				paint(pr.x, pr.y, top_at(pr.x, pr.y), pr.trail, pr.team, pr.owner)
			if pr.dist >= pr.range:   # 飞完：落地溅开
				var z := top_at(pr.x, pr.y)
				paint(pr.x, pr.y, z, pr.splat, pr.team, pr.owner)
				events.append(["splat", pr.x, pr.y, z, pr.team])
				alive = false; break
		if alive: keep.append(pr)
	projs = keep

func hit_player(team: int, x: float, y: float, z: float, pad_r: float) -> Mech:
	var R := float(C.R)
	for t in players:
		if not t.alive or t.team == team: continue
		if Vector2(t.x - x, t.y - y).length() < R + pad_r and z > t.z - pad_r and z < t.z + float(C.PH) + pad_r:
			return t
	return null

func fire_charger(p: Mech, ch: float, w: Dictionary) -> void:
	var rng_len := float(w.range) * (0.35 + 0.65 * ch)
	var dmg := float(w.minDmg) + (float(w.dmg) - float(w.minDmg)) * ch
	var a := float(p.inp.a)
	var dx := cos(a); var dy := sin(a)
	var x := p.x + dx * 16; var y := p.y + dy * 16; var z := p.z + float(C.MUZZLE)
	var pierce := ch >= 0.9 and w.has("pierce")
	var hits: Array = []
	var d := 0.0; var last_paint := -99.0
	var pr := 13.0 + 8.0 * ch
	while d < rng_len:
		d += 6.0
		var px := x + dx * d; var py := y + dy * d
		if top_at(px, py) > z or px < 0 or py < 0 or px > W or py > H:
			break
		if d - last_paint > 12:
			last_paint = d; paint(px, py, top_at(px, py), pr, p.team, p)
		var v := hit_player(p.team, px, py, z, 5.0)
		if v != null and not hits.has(v):
			hits.append(v)
			if not pierce or hits.size() >= 2: break
	var ex := x + dx * d; var ey := y + dy * d
	paint(ex, ey, top_at(ex, ey), 18 + 12 * ch, p.team, p)
	if hits.size() > 0:
		var dm := dmg
		if p.pilot == "frost" and Vector2(hits[0].x - p.x, hits[0].y - p.y).length() > float(w.range) * 0.6:
			dm *= 1.08   # 白夜被动：远距精准
		hurt(hits[0], dm, p, dx, dy)
		if hits.size() > 1: hurt(hits[1], dm * float(w.pierce), p, dx, dy)
	events.append(["line", x, y, z, ex, ey, z, p.team, ch])
	if ch > 0.5: knock(p, -dx, -dy, 170 * ch)

func hurt(t: Mech, dmg: float, by: Mech, kdx: float = 0.0, kdy: float = 0.0) -> void:
	if not t.alive or t.inv_t > 0: return
	if by != null and by.team != t.team and t.weapon != by.weapon:
		pass
	t.hp -= dmg; t.last_hurt = time
	knock(t, kdx, kdy, min(300.0, dmg * 1.8))
	if by != null and by.team != t.team and by.sp_t <= 0:
		by.sp = min(float(weapon_of(by).spNeed), by.sp + dmg)
	events.append(["dmg", t.id, int(round(dmg))])
	if t.hp <= 0:
		t.alive = false; t.respawn_t = float(C.RESPAWN); t.deaths += 1; t.burst_n = 0; t.charge = 0
		events.append(["ko", t.id, by.id if by != null else 0, t.x, t.y, t.z, t.team])
		paint(t.x, t.y, t.z, 60, 3 - t.team, by)
		if by != null and by.team != t.team:
			by.kills += 1
			if by.pilot == "blaze": by.hp = min(by.max_hp, by.hp + by.max_hp * 0.4)   # 凌焰被动：越战越勇

# ---------------- 技能（2.2 充能制） ----------------
func use_skill(p: Mech) -> void:
	p.skill_uses -= 1; p.skill_cd = float(C.SKILL_CD)
	var sk := str(D.pilots[p.pilot].skill)
	events.append(["skill", p.id, sk])
	match sk:
		"rush": p.rush_t = 3.0
		"scan": reveal[p.team] = time + 5.0

# ---------------- 大招 ----------------
func activate_special(p: Mech) -> void:
	var w := weapon_of(p)
	p.sp = 0
	var spk := str(w.special)
	events.append(["super", p.id, spk])
	if spk == "storm":
		p.sp_t = 0.8; p.sp_wave = 0
	elif spk == "missiles":
		p.sp_t = 0.3
		var targets: Array = []
		var cands: Array = []
		for e in players:
			if e.alive and e.team != p.team and visible_to(p.team, e) and Vector2(e.x - p.x, e.y - p.y).length() < 1100:
				cands.append(e)
		cands.sort_custom(func(a, b): return Vector2(a.x - p.x, a.y - p.y).length() < Vector2(b.x - p.x, b.y - p.y).length())
		for e in cands.slice(0, 4): targets.append(Vector2(e.x, e.y))
		var guard := 0
		while targets.size() < 4 and guard < 50:
			guard += 1
			var a := rng.randf() * TAU; var d := rng.randf_range(200, 880)
			var tx := clampf(p.x + cos(a) * d, 120, W - 120); var ty := clampf(p.y + sin(a) * d, 80, H - 80)
			if not solid[int(ty / CELL) * GW + int(tx / CELL)]: targets.append(Vector2(tx, ty))
		for tg in targets:
			missiles.append({"x": tg.x, "y": tg.y, "z": top_at(tg.x, tg.y), "t": 1.5, "team": p.team, "owner": p})
			events.append(["lock", tg.x, tg.y, top_at(tg.x, tg.y), p.team])

func update_special(p: Mech, dt: float) -> void:
	p.sp_t -= dt
	if str(weapon_of(p).special) == "storm":
		var elapsed := 0.8 - p.sp_t
		while p.sp_wave < 3 and elapsed >= p.sp_wave * 0.35:
			for i in 18:
				spawn_proj(p, i / 18.0 * TAU + p.sp_wave * 0.17, 500, 280, 34, 24, 12, 8)
			paint(p.x, p.y, p.z, 70 + p.sp_wave * 15, p.team, p)
			p.sp_wave += 1

func update_missiles(dt: float) -> void:
	var keep: Array = []
	for m in missiles:
		m.t -= dt
		if m.t > 0:
			keep.append(m); continue
		explode(m.x, m.y, m.z + 8, 70, 100, 36, m.team, m.owner)
	missiles = keep

func explode(x: float, y: float, z: float, r: float, dmg: float, min_dmg: float, team: int, owner: Mech) -> void:
	for t in players:
		if not t.alive or t.team == team: continue
		var d := Vector2(t.x - x, t.y - y).length()
		if d < r + float(C.R) and abs(t.z - z) < 90:
			hurt(t, lerp(dmg, min_dmg, clampf(d / (r + float(C.R)), 0, 1)), owner, t.x - x, t.y - y)
	paint(x, y, z, r, team, owner)
	events.append(["boom", x, y, z, team, r])

# ---------------- 视野 ----------------
func visible_to(team: int, e: Mech) -> bool:
	if not e.hidden or reveal[team] > time: return true
	for a in players:
		if a.alive and a.team == team and Vector2(a.x - e.x, a.y - e.y).length() < float(C.BUSH_DETECT):
			return true
	return false

func los(x0: float, y0: float, z0: float, x1: float, y1: float) -> bool:
	var d := Vector2(x1 - x0, y1 - y0).length()
	var n := int(d / 12.0)
	for i in range(1, n):
		var k := float(i) / n
		if top_at(x0 + (x1 - x0) * k, y0 + (y1 - y0) * k) > z0 + 30: return false
	return true

# ---------------- AI ----------------
func walkable(i: int) -> bool:
	return solid[i] == 0 and top[i] <= 10

func build_field(goal_cell: int) -> PackedInt32Array:
	var f := PackedInt32Array(); f.resize(GW * GH); f.fill(-1)
	if goal_cell < 0 or not walkable(goal_cell): return f
	var q := PackedInt32Array([goal_cell]); f[goal_cell] = 0
	var head := 0
	while head < q.size():
		var c := q[head]; head += 1
		var cx := c % GW; var cy := c / GW
		for dd in [[1, 0], [-1, 0], [0, 1], [0, -1]]:
			var nx: int = cx + dd[0]; var ny: int = cy + dd[1]
			if not in_bounds(nx, ny): continue
			var ni := ny * GW + nx
			if f[ni] >= 0 or not walkable(ni): continue
			f[ni] = f[c] + 1; q.append(ni)
	return f

func pick_roam(p: Mech) -> void:
	var best := -1; var bs := -1e9
	for _i in 14:
		var cx := rng.randi_range(4, GW - 5); var cy := rng.randi_range(3, GH - 4)
		var i := cy * GW + cx
		if not walkable(i): continue
		var s := 0.0
		if grid[i] != p.team: s += 3.0
		if grid[i] == 3 - p.team: s += 2.0
		var mid := float(cx) / GW
		s += (mid if p.team == 1 else 1.0 - mid) * 2.0
		s -= Vector2(cx * CELL - p.x, cy * CELL - p.y).length() / 900.0
		s += rng.randf() * 1.5
		if s > bs: bs = s; best = i
	if best >= 0:
		p.ai_goal_cell = best
		p.ai_goal = Vector2((best % GW + 0.5) * CELL, (best / GW + 0.5) * CELL)
		p.ai_field = build_field(best)

func field_dir(p: Mech) -> Vector2:
	if p.ai_field.size() == 0: return Vector2.ZERO
	var cx := int(p.x / CELL); var cy := int(p.y / CELL)
	var here := p.ai_field[cy * GW + cx] if in_bounds(cx, cy) else -1
	if here < 0:
		return Vector2(p.ai_goal.x - p.x, p.ai_goal.y - p.y).normalized()
	var best := Vector2.ZERO; var bv := here
	for dd in [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]]:
		var nx: int = cx + dd[0]; var ny: int = cy + dd[1]
		if not in_bounds(nx, ny): continue
		var v := p.ai_field[ny * GW + nx]
		if v >= 0 and v < bv:
			if dd[0] != 0 and dd[1] != 0:   # 斜着走不能穿墙角
				if p.ai_field[cy * GW + nx] < 0 or p.ai_field[ny * GW + cx] < 0: continue
			bv = v; best = Vector2(dd[0], dd[1])
	return best.normalized()

func ai_think(p: Mech, dt: float) -> void:
	if not p.alive: return
	p.ai_t -= dt
	var w := weapon_of(p)
	var rng_w := float(w.range2) if w.has("range2") else float(w.range)
	# 找最近的看得见的敌人
	var tgt: Mech = null; var td := 1e9
	for e in players:
		if not e.alive or e.team == p.team or not visible_to(p.team, e): continue
		var d := Vector2(e.x - p.x, e.y - p.y).length()
		if d < td and d < 760: td = d; tgt = e
	var inp := p.inp
	inp.j = false
	if tgt != null and los(p.x, p.y, p.z + float(C.MUZZLE), tgt.x, tgt.y):
		var to := Vector2(tgt.x - p.x, tgt.y - p.y)
		var lead := to.length() / 650.0
		inp.a = atan2(tgt.y + tgt.vy * lead * 0.6 - p.y, tgt.x + tgt.vx * lead * 0.6 - p.x) + rng.randf_range(-0.06, 0.06)
		var want := rng_w * (0.85 if p.weapon == "charger" else 0.7)
		var dir := to.normalized()
		var side := Vector2(-dir.y, dir.x) * p.ai_strafe
		var mv := side * 0.8
		if td > want: mv += dir
		elif td < want * 0.6: mv -= dir
		if p.ai_t <= 0:
			p.ai_t = rng.randf_range(0.6, 1.4)
			if rng.randf() < 0.35: p.ai_strafe = -p.ai_strafe
		inp.mx = mv.x; inp.my = mv.y; inp.w = false
		if p.weapon == "charger":
			var need := 0.92 if td > 260 else 0.5
			inp.f = p.charge < need and td < rng_w + 40
			if p.charge >= need: inp.f = false
		else:
			inp.f = td < rng_w + 10
		# 技能 / 大招
		if p.skill_uses > 0 and p.skill_cd <= 0:
			var sk := str(D.pilots[p.pilot].skill)
			if (sk == "rush" and td < 320) or (sk == "scan" and rng.randf() < 0.01):
				inp.gq += 1
		if p.sp >= float(w.spNeed) and ((str(w.special) == "storm" and td < 230) or str(w.special) == "missiles"):
			inp.qq += 1
		return
	# 没有敌人：去涂地
	if p.ai_goal_cell < 0 or Vector2(p.ai_goal.x - p.x, p.ai_goal.y - p.y).length() < 40 or p.ai_t <= -3.0:
		pick_roam(p); p.ai_t = 0
	var d := field_dir(p)
	if p.ai_t <= 0:
		p.ai_t = 0.5
		if Vector2(p.x, p.y).distance_to(p.ai_last) < 12: p.ai_stuck += 1
		else: p.ai_stuck = 0
		p.ai_last = Vector2(p.x, p.y)
		if p.ai_stuck >= 3: p.ai_stuck = 0; pick_roam(p); inp.j = true
	inp.mx = d.x; inp.my = d.y
	var own := cell_at(p.x, p.y) == p.team
	var ahead := cell_at(p.x + d.x * 60, p.y + d.y * 60)
	if ahead != p.team and p.ammo >= 1.5:
		inp.w = false
		inp.a = atan2(d.y, d.x) + rng.randf_range(-0.35, 0.35)
		inp.f = p.weapon != "charger" or rng.randf() < 0.5
		if p.weapon == "charger" and p.charge > 0.4: inp.f = false
	else:
		inp.f = false
		inp.w = own and p.ammo < 2.5
	if p.skill_uses > 0 and p.skill_cd <= 0 and str(D.pilots[p.pilot].skill) == "scan" and rng.randf() < 0.004:
		inp.gq += 1
