# 涂鸦机兵 Godot 版 —— 对战模拟（纯逻辑，没有画面）
# 移植自 public/shared.js（移动物理、涂地）和 public/core.js（武器、伤害、技能、大招、驾驶员弹出、AI）
# 坐标沿用原版：x 向右、y 向下（地图平面），z 向上；单位是像素（1 格 = 16）
class_name Sim
extends RefCounted

const CELL := 16.0

class Mech:
	var id := 0
	var name := ""
	var team := 1
	var slot := 0
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
	var land_v := 0.0
	var hp := 100.0
	var max_hp := 100.0
	var ammo := 3.0
	var sp := 0.0
	var alive := true
	var foot := false
	var rebuild_t := 0.0
	var respawn_t := 0.0
	var inv_t := 0.0
	var last_hurt := -10.0
	var last_atk := -10.0
	var atk_cd := 0.0
	var burst_n := 0
	var burst_t := 0.0
	var burst_w: Dictionary = {}
	var burst_fx = null
	var burst_aim = null
	var charge := 0.0
	var firing := false
	var wheel := false
	var hidden := false
	var sm := 1.0
	var dmg_mul := 1.0
	var od_n := 0
	var shield := 0.0
	var shield_t := 0.0
	var skill_uses := 2
	var skill_max := 2
	var skill_regen := 0.0
	var skill_cd := 0.0
	# 状态
	var rush_t := 0.0
	var slow_t := 0.0
	var silence_t := 0.0
	var smoke_t := 0.0
	var cloak_t := 0.0
	var cloak_fast := false
	var reveal_t := 0.0
	var rally_t := 0.0
	var bind_t := 0.0
	var seal_t := 0.0
	var dslow_t := 0.0
	var poss_t := 0.0
	var blind_t := 0.0
	var mark_t := 0.0
	var mark_team := 0
	var lock_t := 0.0
	var jam_t := 0.0
	var sup_t := 0.0
	var nano_t := 0.0
	var aura_t := 0.0
	var blink_t := 0.0
	var rep_t := 0.0
	var burn_t := 0.0
	var burn_acc := 0.0
	var burn_by: Mech = null
	var poison_t := 0.0
	var poison_acc := 0.0
	var poison_by: Mech = null
	var ward_n := 0
	var ward_t := 0.0
	var ward_by: Mech = null
	var combo := 0
	var combo_t := 0.0
	var opener_on := false
	var roll_t := 0.0
	var roll_a := 0.0
	var hit_cd := {}
	var sp_t := 0.0
	var sp_kind := ""
	var sp_wave := 0
	var no_sp_until := 0.0
	var quake_t := 0.0
	var quake_arm := 0.0
	var rend_arm := false
	var rend_a := 0.0
	var ls_n := 0
	var ls_t := 0.0
	var flash := 0.0          # 受击闪白（给画面）
	var kills := 0
	var deaths := 0
	var painted := 0
	# 输入：mx/my 移动方向，a 瞄准角，pt 俯仰角，ad 瞄准距离，f 按住开火，w 滚轮，j 跳，gq/qq 技能 / 大招按下计数
	var inp := {"mx": 0.0, "my": 0.0, "a": 0.0, "pt": 0.0, "ad": 300.0, "f": false, "w": false, "j": false, "gq": 0, "qq": 0}
	var last_gq := 0
	var last_qq := 0
	var prev_f := false
	# AI
	var ai_t := 0.0
	var ai_goal := Vector2.ZERO
	var ai_field := PackedInt32Array()
	var ai_goal_cell := -1
	var ai_stuck := 0
	var ai_last := Vector2.ZERO
	var ai_strafe := 1.0
	var ai_skill := 0.0

var D: Dictionary
var C: Dictionary
var M: Dictionary
var GW := 120
var GH := 80
var W := 1920.0
var H := 1280.0
var top := PackedInt32Array()
var solid := PackedByteArray()
var bush := PackedByteArray()
var pad := PackedInt32Array()
var grid := PackedByteArray()        # 每格涂料：0 没涂，1 / 2 两队
var dirty := PackedInt32Array()      # 这一帧涂过的格子（给画面更新贴图）
var players: Array = []
var projs: Array = []
var shells: Array = []
var missiles: Array = []
var helpers: Array = []
var events: Array = []               # 给画面 / 音效的事件
var time := 0.0
var time_left := 180.0
var countdown := 3.0
var over := false
var winner := 0
var result := {}
var reveal := [0.0, 0.0, 0.0]
var rng := RandomNumberGenerator.new()
var next_id := 1

func _init(data: Dictionary, map_idx: int = 0, seed_v: int = 0, duration: float = 180.0) -> void:
	D = data
	C = D.consts
	M = D.maps[clampi(map_idx, 0, D.maps.size() - 1)]
	GW = int(M.gw); GH = int(M.gh); W = GW * CELL; H = GH * CELL
	top = PackedInt32Array(M.top)
	solid.resize(GW * GH); bush.resize(GW * GH); pad.resize(GW * GH); grid.resize(GW * GH)
	var sb: String = M.solid; var bb: String = M.bush
	for i in GW * GH:
		solid[i] = 1 if sb.unicode_at(i) == 49 else 0
		bush[i] = 1 if bb.unicode_at(i) == 49 else 0
	for k in M.pads: pad[int(k)] = int(M.pads[k])
	time_left = duration
	if seed_v != 0: rng.seed = seed_v
	else: rng.randomize()

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

func solid_at(x: float, y: float) -> bool:
	var cx := int(floor(x / CELL)); var cy := int(floor(y / CELL))
	return not in_bounds(cx, cy) or solid[cy * GW + cx] == 1

func in_bush(x: float, y: float, z: float) -> bool:
	var cx := int(floor(x / CELL)); var cy := int(floor(y / CELL))
	return in_bounds(cx, cy) and bush[cy * GW + cx] == 1 and z < 6.0

func dist2d(a, b) -> float:
	return Vector2(a.x - b.x, a.y - b.y).length()

func ev(e: Array) -> void:
	events.append(e)

func add_helper(h: Dictionary) -> void:
	h.id = next_id; next_id += 1
	helpers.append(h)

# ---------------- 玩家 ----------------
func wdata(p: Mech) -> Dictionary:
	return D.mechs[p.weapon]

func pdata(p: Mech) -> Dictionary:
	return D.pilots[p.pilot]

func side(p: Mech) -> Dictionary:
	return D.pilots[p.pilot].sidearm

func add_player(id: int, name: String, team: int, pilot: String, weapon: String, bot: bool) -> Mech:
	var p := Mech.new()
	p.id = id; p.name = name; p.team = team; p.pilot = pilot; p.weapon = weapon; p.bot = bot
	var n := 0
	for q in players:
		if q.team == team:
			n += 1
	p.slot = n
	p.max_hp = float(D.mechs[weapon].hp) * (1.18 if pilot == "titan" else 1.0)
	p.skill_max = int(C.SKILL_CHARGES); p.skill_uses = p.skill_max
	p.ai_strafe = 1.0 if rng.randf() < 0.5 else -1.0
	players.append(p)
	respawn(p)
	return p

func respawn(p: Mech) -> void:
	var s: Dictionary = M.spawns[p.team - 1][p.slot % 4]
	p.x = float(s.x); p.y = float(s.y); p.z = top_at(p.x, p.y)
	p.vx = 0; p.vy = 0; p.vz = 0; p.kx = 0; p.ky = 0; p.on_ground = true
	p.foot = false; p.hp = p.max_hp; p.ammo = float(C.AMMO); p.alive = true; p.inv_t = 2.5; p.charge = 0; p.burst_n = 0
	p.inp.a = 0.0 if p.team == 1 else PI
	ev(["spawn", p.id])

func max_hp_of(p: Mech) -> float:
	return float(C.PILOT_HP) if p.foot else p.max_hp

func near_pilot(p: Mech, pid: String, r: float) -> bool:
	for a in players:
		if a != p and a.alive and a.team == p.team and a.pilot == pid and dist2d(a, p) < r: return true
	return false

# ---------------- 主循环 ----------------
func step(dt: float) -> void:
	dirty.clear()
	events.clear()
	if over: return
	if countdown > 0:
		countdown -= dt
		return
	time += dt
	time_left -= dt
	for p in players:
		if p.bot: ai_think(p, dt)
		update_player(p, dt)
	update_helpers(dt)
	update_projs(dt)
	update_shells(dt)
	update_missiles(dt)
	if time_left <= 0: finish()

func finish() -> void:
	over = true
	var a := 0; var b := 0; var tot := 0
	for i in grid.size():
		if solid[i]: continue
		tot += 1
		if grid[i] == 1: a += 1
		elif grid[i] == 2: b += 1
	winner = 1 if a > b else (2 if b > a else 0)
	result = {"a": a, "b": b, "tot": tot, "winner": winner}
	ev(["end", winner])

func update_player(p: Mech, dt: float) -> void:
	if not p.alive:
		p.respawn_t -= dt
		if p.respawn_t <= 0: respawn(p)
		return
	var w := wdata(p)
	p.flash = max(0.0, p.flash - dt * 5.0)
	p.inv_t = max(0.0, p.inv_t - dt)
	if p.shield_t > 0:
		p.shield_t -= dt
		if p.shield_t <= 0: p.shield = 0
	p.skill_cd = max(0.0, p.skill_cd - dt)
	if p.skill_uses < p.skill_max and p.lock_t <= 0:   # 技能充能：每 15 秒回复 1 次
		var rk := 1.25 if p.pilot == "doc" else (1.1 if near_pilot(p, "doc", 220) else 1.0)
		p.skill_regen += dt * rk
		if p.skill_regen >= float(C.SKILL_REGEN):
			p.skill_regen -= float(C.SKILL_REGEN); p.skill_uses += 1
			if p.skill_uses >= p.skill_max: p.skill_regen = 0
	elif p.skill_uses >= p.skill_max: p.skill_regen = 0
	for k in ["rush_t", "slow_t", "silence_t", "smoke_t", "cloak_t", "reveal_t", "rally_t", "bind_t", "seal_t", "dslow_t", "poss_t", "blind_t", "mark_t", "lock_t", "jam_t", "sup_t", "nano_t", "aura_t", "blink_t", "combo_t"]:
		var v: float = p.get(k)
		if v > 0: p.set(k, max(0.0, v - dt))
	if p.rep_t > 0:
		p.rep_t -= dt
		if not p.foot: p.hp = min(max_hp_of(p), p.hp + max_hp_of(p) * 0.03 * dt)
	if p.ward_n > 0:
		p.ward_t -= dt
		if p.ward_t <= 0: p.ward_n = 0
	if p.burn_t > 0:
		p.burn_t -= dt; p.burn_acc += dt
		if p.burn_acc >= 0.5:
			p.burn_acc -= 0.5; hurt(p, 3, p.burn_by)
			if not p.alive: return
	if p.poison_t > 0:
		p.poison_t -= dt; p.poison_acc += dt; p.slow_t = max(p.slow_t, 0.15)
		if p.poison_acc >= 0.5:
			p.poison_acc -= 0.5; hurt(p, 3, p.poison_by)
			if not p.alive: return
	if p.pilot == "zero" and int(time * 30) % 6 == 0:   # 沈零被动：战场感知
		for e in players:
			if e.alive and e.team != p.team and dist2d(e, p) < 260: e.reveal_t = max(e.reveal_t, 0.4)
	var ground := cell_at(p.x, p.y) if p.on_ground else -1
	var own := ground == p.team
	var enemy_paint := ground > 0 and not own
	var inb := in_bush(p.x, p.y, p.z)
	var sm := (1.45 if p.pilot == "gale" else 1.0) if p.foot else float(w.spd) * (1.08 if p.pilot == "gale" else 1.0)
	if p.sp_t > 0 and p.sp_kind == "charge": sm *= 1.45
	if p.rush_t > 0: sm *= 1.35
	if p.slow_t > 0: sm *= 0.55
	if p.pilot == "raven" and (inb or own): sm *= 1.12
	if p.rally_t > 0: sm *= 1.15
	if p.cloak_t > 0 and p.cloak_fast: sm *= 1.25
	if p.poss_t > 0: sm *= 1.2
	if p.dslow_t > 0: sm *= 0.75
	if p.bind_t > 0: sm *= 0.12
	p.sm = sm
	p.wheel = bool(p.inp.w) and not p.foot and not (p.sp_t > 0 and p.sp_kind == "beam")
	var mul := 1.0
	if p.sp_t > 0 and p.sp_kind == "beam": mul = 0.4
	elif p.firing and not p.wheel:
		mul = {"blaster": 0.9, "charger": 0.5, "bucket": 0.85, "gatling": 0.6, "mortar": 0.9, "prism": 0.55}.get(p.weapon, 1.0)
	step_move(p, dt, mul)
	# 敌方涂料掉血；脱战回血（大厨更快）
	var mh := max_hp_of(p)
	if enemy_paint and p.inv_t <= 0 and not (p.sp_t > 0 and p.sp_kind == "charge") and p.hp > mh * 0.3:
		p.hp = max(mh * 0.3, p.hp - mh * 0.1 * dt)
	if not enemy_paint and time - p.last_hurt > 3.0 and time - p.last_atk > 2.0:
		var k := (0.32 if (p.wheel and own) else 0.16) * (2.0 if p.pilot == "chef" else 1.0)
		p.hp = min(mh, p.hp + mh * k * dt)
	# 装填
	if p.burst_n <= 0 and p.roll_t <= 0 and p.charge <= 0:
		var rt := float(side(p).reload) if p.foot else float(w.reload)
		var rk := (2.0 if p.rush_t > 0 else 1.0) * (1.6 if (p.wheel and own) else 1.0)
		if near_pilot(p, "echo", 200): rk *= 1.2
		elif p.pilot == "echo": rk *= 1.1
		if p.jam_t > 0: rk *= 0.7
		if p.nano_t > 0: rk *= 0.75
		if p.sup_t > 0: rk *= 1.3
		p.ammo = min(float(C.AMMO), p.ammo + dt / rt * rk)
	p.firing = false
	if p.wheel:
		p.charge = 0; p.burst_n = 0
	else:
		p.firing = weapon_logic(p, dt, w)
	var recent := time - p.last_atk < 0.9
	p.hidden = (p.smoke_t > 0 or p.cloak_t > 0 or ((inb or (p.wheel and own)) and not recent)) and p.reveal_t <= 0
	if p.inp.qq != p.last_qq:
		p.last_qq = p.inp.qq
		if not p.foot and p.sp >= float(w.spNeed) and p.sp_t <= 0 and p.silence_t <= 0 and p.seal_t <= 0: activate_special(p)
	if p.inp.gq != p.last_gq:
		p.last_gq = p.inp.gq
		if p.skill_uses > 0 and p.skill_cd <= 0 and p.silence_t <= 0 and p.seal_t <= 0: use_skill(p)
	if p.sp_t > 0: update_special(p, dt)
	if p.quake_t > 0:
		p.quake_t -= dt
		if (time > p.quake_arm and p.on_ground) or p.quake_t <= 0: quake_slam(p)
	if p.foot:
		p.rebuild_t -= dt
		if p.rebuild_t <= 0: redeploy(p)

# ---------------- 移动物理（移植 S.stepMove / S.collide） ----------------
func speed_for(p: Mech, ground: int, wheel: bool, mul: float) -> float:
	var V: Dictionary = D.speed
	if p.foot:
		var en := ground > 0 and ground != p.team
		return (125.0 if en else float(C.PILOT_SPEED)) * p.sm
	var s := 0.0
	if ground < 0:
		s = float(V.airWheel) if wheel else float(V.airWalk) * mul
	else:
		var own := ground == p.team
		var en2 := ground != 0 and ground != p.team
		if wheel: s = float(V.wheelOwn) if own else (float(V.wheelEnemy) if en2 else float(V.wheelDry))
		else: s = (float(V.enemy) if en2 else float(V.walk)) * mul
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
	p.land_v = 0
	var mx := float(p.inp.mx); var my := float(p.inp.my)
	var l := sqrt(mx * mx + my * my)
	if l > 1: mx /= l; my /= l
	var wheel := p.wheel
	var ground := cell_at(p.x, p.y) if p.on_ground else -1
	var spd := speed_for(p, ground, wheel, mul)
	approach(p, mx * spd, my * spd, surface_for(p, ground, wheel), dt)
	var kd := exp(-dt * (float(P.kbGround) if p.on_ground else float(P.kbAir)))
	p.kx *= kd; p.ky *= kd
	if absf(p.kx) < 1: p.kx = 0
	if absf(p.ky) < 1: p.ky = 0
	p.coy = float(P.coyote) if p.on_ground else max(0.0, p.coy - dt)
	if p.inp.j and not p.j_held: p.jb = float(P.jumpBuffer)
	else: p.jb = max(0.0, p.jb - dt)
	p.j_held = bool(p.inp.j)
	if p.jb > 0 and p.coy > 0:
		p.vz = float(C.JUMP_W) if wheel else float(C.JUMP_V)
		p.on_ground = false; p.coy = 0; p.jb = 0; p.jumped = true
		ev(["jump", p.id])
	var ox := p.x; var oy := p.y
	var ex := (p.vx + p.kx) * dt; var ey := (p.vy + p.ky) * dt
	p.x += ex; p.y += ey
	collide(p, float(C.PILOT_R) if p.foot else float(C.R))
	var nx := p.x - (ox + ex); var ny := p.y - (oy + ey)
	var nl := sqrt(nx * nx + ny * ny)
	if nl > 0.01:
		var ux := nx / nl; var uy := ny / nl
		var dv := p.vx * ux + p.vy * uy
		if dv < 0: p.vx -= ux * dv; p.vy -= uy * dv
		var dk := p.kx * ux + p.ky * uy
		if dk < 0: p.kx -= ux * dk * 1.4; p.ky -= uy * dk * 1.4
	p.pad_t = max(0.0, p.pad_t - dt)
	if p.on_ground and p.pad_t <= 0:
		var cx := int(floor(p.x / CELL)); var cy := int(floor(p.y / CELL))
		var pc := pad[cy * GW + cx] if in_bounds(cx, cy) else 0
		if pc > 0:
			var a := (pc - 1) / 250.0 * TAU
			p.vz = float(D.pad.v); p.on_ground = false; p.coy = 0; p.jumped = false; p.pad_t = 0.6
			p.kx += cos(a) * float(D.pad.push); p.ky += sin(a) * float(D.pad.push)
			ev(["pad", p.id])
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
			p.land_v = p.vz
			p.z = gh; p.vz = 0; p.on_ground = true; p.jumped = false
			if p.land_v < -520: ev(["land", p.id, p.land_v])

func knock(p: Mech, dx: float, dy: float, power: float, up: float = 0.0) -> void:
	var l := sqrt(dx * dx + dy * dy)
	if l < 0.000001 or not p.alive: return
	p.kx += dx / l * power; p.ky += dy / l * power
	var kl := sqrt(p.kx * p.kx + p.ky * p.ky)
	if kl > 520: p.kx *= 520 / kl; p.ky *= 520 / kl
	if up > 0: p.vz = max(p.vz, 0.0) + up; p.on_ground = false; p.coy = 0

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
		if owner.sp_t <= 0 and owner.no_sp_until <= time and not owner.foot:
			owner.sp = min(float(wdata(owner).spNeed), owner.sp + n * 0.6 * (1.6 if owner.pilot == "yuzu" else 1.0))
	return n

# ---------------- 武器 ----------------
func take_overdrive(p: Mech) -> void:
	p.dmg_mul = 1.4 if p.od_n > 0 else 1.0
	if p.od_n > 0: p.od_n -= 1
	if p.pilot == "hawk" and p.ammo >= float(C.AMMO) - 1.001: p.dmg_mul *= 1.15   # 霍克：火力纪律
	if p.blink_t > 0: p.dmg_mul *= 1.35; p.blink_t = 0                           # 沈零：闪移后的一击

func weapon_logic(p: Mech, dt: float, w: Dictionary) -> bool:
	p.atk_cd -= dt
	var pulse: bool = not p.inp.f and p.prev_f   # 松开（用于蓄力）
	p.prev_f = bool(p.inp.f)
	if p.sp_t > 0 and p.sp_kind == "beam": return true
	if p.silence_t > 0:
		p.charge = 0
		return false
	if p.burst_n > 0:
		step_burst(p, dt)
		return true
	if p.roll_t > 0: step_roll(p, w, dt)
	if p.foot:
		var A := side(p)
		if p.inp.f and p.atk_cd <= 0 and p.ammo >= float(A.cost):
			p.ammo -= float(A.cost); p.atk_cd = float(A.atkCd); p.last_atk = time; p.dmg_mul = 1
			fire_sidearm(p, A)
			return true
		return false
	if str(w.attack) == "charge":
		if p.inp.f and p.ammo >= 1:
			p.charge = min(1.0, p.charge + dt / float(w.chargeTime))
			return true
		if p.charge > 0.08 and p.ammo >= 1 and p.atk_cd <= 0:
			p.ammo -= 1; p.atk_cd = float(w.atkCd); p.last_atk = time; take_overdrive(p)
			fire_charger(p, p.charge, w)
		p.charge = 0
		return false
	if p.inp.f and p.atk_cd <= 0 and p.ammo >= 1:
		p.opener_on = w.has("opener") and time - p.last_atk > 2.0
		p.ammo -= 1; p.atk_cd = float(w.atkCd); p.last_atk = time; take_overdrive(p)
		if p.cloak_t > 0:
			if str(w.special) == "cloak": p.dmg_mul *= 1.5
			p.cloak_t = 0; p.cloak_fast = false
		match str(w.attack):
			"burst":
				var fx = null
				if w.has("poison"): fx = {"poison": float(w.poison)}
				elif w.has("slowHit"): fx = {"slow": float(w.slowHit), "ward": int(w.get("ward", 0))}
				elif w.has("burn"): fx = {"burn": float(w.burn)}
				start_burst(p, w, fx, auto_aim(p, w) if w.has("homing") else null)
			"fan": fire_spread(p, w)
			"flick":
				fire_spread(p, w)
				if p.on_ground: knock(p, cos(p.inp.a), sin(p.inp.a), float(w.lunge)); p.roll_t = 0.45; p.roll_a = float(p.inp.a)
			"lob":
				var d := clampf(float(p.inp.ad), float(w.minRange), float(w.range))
				var sh := spawn_shell(p, p.x + cos(p.inp.a) * d, p.y + sin(p.inp.a) * d, float(w.dmg) * p.dmg_mul, float(w.blast), float(w.flight))
				if w.has("bounce"): sh.bounce = 1
				if w.has("sticky"): sh.sticky = float(w.sticky)
			"punch": punch(p, w)
		ev(["fire", p.id, p.weapon])
		return true
	return p.roll_t > 0

func start_burst(p: Mech, w: Dictionary, fx, aim) -> void:
	p.burst_n = int(w.get("shots", 1)); p.burst_t = 0; p.burst_w = w; p.burst_fx = fx; p.burst_aim = aim
	step_burst(p, 0.0)

func step_burst(p: Mech, dt: float) -> void:
	var w := p.burst_w
	p.burst_t -= dt
	while p.burst_n > 0 and p.burst_t <= 0:
		var shots := int(w.get("shots", 1))
		var i := shots - p.burst_n
		var fin: bool = w.has("finale") and p.burst_n == 1 and not p.foot
		var mul := (float(w.finale) if fin else 1.0) * (float(w.lead) if (w.has("lead") and i == 0 and not p.foot) else 1.0)
		if w.has("spinup"): mul *= lerp(float(w.spinup[0]), float(w.spinup[1]), float(i) / max(1, shots - 1))
		var a: float = (p.burst_aim.x if p.burst_aim != null else float(p.inp.a)) + rng.randf_range(-0.5, 0.5) * float(w.get("spread", 0.04))
		var pt: float = p.burst_aim.y if p.burst_aim != null else float(p.inp.pt)
		spawn_proj(p, a, pt, float(w.speed), float(w.range), float(w.dmg) * mul, float(w.get("splat", 12)) * (1.5 if fin else 1.0), float(w.get("trail", 0)), float(w.get("size", 5)) + (3.0 if fin else 0.0), null, {"fx": p.burst_fx, "ghost": w.get("ghost", false), "w": "" if p.foot else p.weapon})
		p.burst_n -= 1
		p.burst_t += float(w.get("interval", 0.08))

func step_roll(p: Mech, w: Dictionary, dt: float) -> void:
	p.roll_t -= dt
	var fx := p.x + cos(p.roll_a) * 14; var fy := p.y + sin(p.roll_a) * 14
	paint(fx, fy, p.z, float(w.rollWidth), p.team, p)
	contact_damage(p, fx, fy, float(w.rollWidth) + float(C.R) - 4, float(w.rollDmg) * p.dmg_mul, 0.45)

func contact_damage(p: Mech, x: float, y: float, r: float, dmg: float, cd: float) -> void:
	for t in players:
		if not t.alive or t.team == p.team: continue
		if Vector2(t.x - x, t.y - y).length() > r or absf(t.z - p.z) > 40: continue
		if p.hit_cd.get(t.id, 0.0) > time: continue
		p.hit_cd[t.id] = time + cd
		hurt(t, dmg, p)

func fire_spread(p: Mech, w: Dictionary) -> void:
	var n := int(w.get("pellets", 1)); var a := float(p.inp.a)
	if str(w.attack) == "fan" and not w.get("ghost", false): knock(p, -cos(a), -sin(a), 40.0 if w.has("kb") else 100.0)
	var fx = {"reveal": float(w.reveal)} if w.has("reveal") else null
	for i in n:
		var off := (float(i) / (n - 1) - 0.5) * float(w.arc) if n > 1 else 0.0
		var k := rng.randf_range(0.85, 1.12) if n > 1 else 1.0
		spawn_proj(p, a + off + rng.randf_range(-0.5, 0.5) * float(w.get("spread", 0.04)), float(p.inp.pt), float(w.speed) * k, float(w.range) * k, float(w.dmg), float(w.get("splat", 14)), float(w.get("trail", 0)), float(w.get("size", 6)), null,
			{"ghost": w.get("ghost", false), "kb": float(w.get("kb", 1.0)), "fx": fx, "w": p.weapon})

func auto_aim(p: Mech, w: Dictionary):
	var best = null; var bs := 0.5
	for e in players:
		if not e.alive or e.team == p.team or not visible_to(p.team, e): continue
		var d := dist2d(e, p)
		if d > float(w.range) + 30: continue
		var da: float = wrapf(atan2(e.y - p.y, e.x - p.x) - float(p.inp.a), -PI, PI)
		if absf(da) < bs and los(p.x, p.y, p.z + float(C.MUZZLE), e.x, e.y):
			bs = absf(da); best = Vector2(atan2(e.y - p.y, e.x - p.x), atan2(e.z + 16 - (p.z + float(C.MUZZLE)), d))
	return best

func punch(p: Mech, w0: Dictionary) -> void:
	var w := w0.duplicate()
	var a := float(p.inp.a)
	var fin := false
	if w.has("combo") and not p.foot:
		p.combo = p.combo + 1 if p.combo_t > 0 else 1
		fin = p.combo >= int(w.combo)
	p.combo_t = 1.3
	if fin: p.combo = 0
	var spin: bool = fin and str(w.get("comboKind", "")) != "upper"
	var upper: bool = fin and str(w.get("comboKind", "")) == "upper"
	if spin: w.arc = TAU; w.dmg = float(w.dmg) * 1.3; w.range = float(w.range) + 14; w.lunge = float(w.lunge) * 0.5
	if upper: w.dmg = float(w.dmg) * 1.3; w.range = float(w.range) + 8
	knock(p, cos(a), sin(a), float(w.lunge))
	var fx := p.x + cos(a) * 30; var fy := p.y + sin(a) * 30
	paint(fx, fy, p.z, float(w.get("paintR", 30)), p.team, p)
	for t in players:
		if not t.alive or t.team == p.team: continue
		var dx: float = t.x - p.x; var dy: float = t.y - p.y; var d := sqrt(dx * dx + dy * dy)
		if d > float(w.range) + float(C.R) + 10 + float(w.lunge) * 0.1 or absf(t.z - p.z) > 40: continue
		if absf(wrapf(atan2(dy, dx) - a, -PI, PI)) > float(w.arc) / 2: continue
		var dmg := float(w.dmg) * p.dmg_mul * (float(w.opener) if p.opener_on else 1.0)
		if p.opener_on: ev(["opener", t.id])
		hurt(t, dmg, p, dx, dy, float(w.kb) / (dmg * 1.8), 420.0 if upper else 120.0)
		if w.has("stagger"): t.slow_t = max(t.slow_t, float(w.stagger))
	p.opener_on = false
	if w.has("wave"):
		var V: Dictionary = w.wave
		for da in ([-0.45, 0.0, 0.45] if spin else [0.0]):
			spawn_proj(p, a + da, -0.03, float(V.speed), float(V.range), float(V.dmg), float(V.splat), 14, float(V.size), null, {"kb": 1.4, "wave": true})
	ev(["punch", p.id, a, spin, upper])

func fire_sidearm(p: Mech, A: Dictionary) -> void:
	var kind := str(A.kind)
	if kind == "melee":
		var a := float(p.inp.a)
		knock(p, cos(a), sin(a), float(A.get("lunge", 120)))
		paint(p.x + cos(a) * 22, p.y + sin(a) * 22, p.z, 18, p.team, p)
		var hit := 0
		for t in players:
			if not t.alive or t.team == p.team: continue
			var dx: float = t.x - p.x; var dy: float = t.y - p.y
			if sqrt(dx * dx + dy * dy) > float(A.range) + float(C.R) + 6 or absf(t.z - p.z) > 34: continue
			if absf(wrapf(atan2(dy, dx) - a, -PI, PI)) > float(A.arc) / 2: continue
			hurt(t, float(A.dmg), p, dx, dy, float(A.kb) / (float(A.dmg) * 1.8), 80)
			side_fx(t, A.get("fx", null), p); hit += 1
		if hit > 0 and A.has("heal"): p.hp = min(max_hp_of(p), p.hp + float(A.heal) * hit)
		ev(["punch", p.id, a, false, false])
		return
	if kind == "lob":
		var d := clampf(float(p.inp.ad), 60, float(A.range))
		spawn_shell(p, p.x + cos(p.inp.a) * d, p.y + sin(p.inp.a) * d, float(A.dmg), float(A.r), float(A.T))
		return
	if int(A.get("shots", 1)) > 1:
		start_burst(p, A, A.get("fx", null), null)
		return
	var aim = auto_aim(p, A) if A.get("homing", false) else null
	var n := int(A.get("pellets", 1))
	for i in n:
		var off := (float(i) / (n - 1) - 0.5) * float(A.arc) if n > 1 else 0.0
		var ya: float = (aim.x if aim != null else float(p.inp.a)) + off + rng.randf_range(-0.5, 0.5) * float(A.spread)
		spawn_proj(p, ya, aim.y if aim != null else float(p.inp.pt), float(A.speed), float(A.range), float(A.dmg), float(A.splat), float(A.trail), float(A.size), null, {"ghost": A.get("ghost", false), "fx": A.get("fx", null)})
	ev(["fire", p.id, "sidearm"])

func side_fx(t: Mech, fx, by: Mech) -> void:
	if fx == null or not t.alive: return
	if fx.has("slow"): t.slow_t = max(t.slow_t, float(fx.slow))
	if fx.has("reveal"): t.reveal_t = max(t.reveal_t, float(fx.reveal))
	if fx.has("poison"): t.poison_t = max(t.poison_t, float(fx.poison)); t.poison_by = by
	if fx.has("burn"): t.burn_t = max(t.burn_t, float(fx.burn)); t.burn_by = by
	if int(fx.get("ward", 0)) > 0 and by != null:
		if t.ward_by != by: t.ward_by = by; t.ward_n = 0
		t.ward_n += 1; t.ward_t = 2.5
		if t.ward_n >= int(fx.ward):
			t.ward_n = 0; t.bind_t = 0.7; t.slow_t = max(t.slow_t, 1.0); hurt(t, 16, by)
			ev(["bind", t.id])

# 子弹：直线飞行（带俯仰），飞完射程后开始下坠
func spawn_proj(p: Mech, yaw: float, pitch: float, speed: float, rng_len: float, dmg: float, splat: float, trail: float, size: float, origin, fl: Dictionary) -> void:
	var dir := Vector3(cos(pitch) * cos(yaw), cos(pitch) * sin(yaw), sin(pitch))
	var o: Vector4 = origin if origin != null else Vector4(p.x, p.y, p.z + (14.0 if p.foot else float(C.MUZZLE)), 8.0 if p.foot else 16.0)
	var x := o.x + dir.x * o.w; var y := o.y + dir.y * o.w; var z := o.z + dir.z * o.w
	if z < top_at(x, y):
		paint(o.x, o.y, o.z - 10, splat * 0.7, p.team, p)
		return
	var pr := {"id": next_id, "x0": x, "y0": y, "z0": z, "x": x, "y": y, "z": z, "vx": dir.x * speed, "vy": dir.y * speed, "vz": dir.z * speed, "ts": rng_len / speed, "t": 0.0,
		"team": p.team, "owner": p, "dmg": dmg * (1.0 if origin != null else p.dmg_mul), "splat": splat, "trail": trail, "size": size, "acc": 0.0, "range": rng_len,
		"w": fl.get("w", ""), "ghost": bool(fl.get("ghost", false)), "kb": float(fl.get("kb", 1.0)), "fx": fl.get("fx", null), "wave": fl.get("wave", false)}
	next_id += 1
	projs.append(pr)

func proj_pos(pr: Dictionary, t: float) -> Vector3:
	var z: float = pr.z0 + pr.vz * t
	if t > pr.ts:
		var dt2: float = t - pr.ts
		z -= 0.5 * float(C.PROJ_G) * dt2 * dt2
	return Vector3(pr.x0 + pr.vx * t, pr.y0 + pr.vy * t, z)

func update_projs(dt: float) -> void:
	var out: Array = []
	for pr in projs:
		var owner: Mech = pr.owner
		var dead := false
		var speed: float = Vector3(pr.vx, pr.vy, pr.vz).length() + (float(C.PROJ_G) * (pr.t - pr.ts) if pr.t > pr.ts else 0.0)
		var steps := maxi(1, int(ceil(speed * dt / 8.0)))
		var sdt := dt / steps
		for _s in steps:
			pr.t += sdt
			var np := proj_pos(pr, pr.t)
			var gh := top_at(np.x, np.y)
			if pr.ghost:
				if pr.t >= pr.ts or np.x < 0 or np.y < 0 or np.x > W or np.y > H:
					var fg: float = min(gh, 200.0)
					paint(np.x, np.y, fg, pr.splat, pr.team, owner)
					pr.x = np.x; pr.y = np.y; pr.z = fg; dead = true; break
			elif np.z <= gh:
				if gh > pr.z + 2: paint(pr.x, pr.y, top_at(pr.x, pr.y), pr.splat * 0.8, pr.team, owner)
				else: paint(np.x, np.y, gh, pr.splat, pr.team, owner); pr.x = np.x; pr.y = np.y; pr.z = gh
				dead = true; break
			var seg := Vector2(np.x - pr.x, np.y - pr.y).length()
			pr.x = np.x; pr.y = np.y; pr.z = np.z; pr.acc += seg
			if pr.trail > 0 and pr.acc >= 26:
				pr.acc = 0
				if pr.z - gh < 55 and pr.z >= gh: paint(pr.x, pr.y, gh, pr.trail, pr.team, owner)
			var blocked := false
			for h in helpers:
				if h.kind != "wall" or h.team == pr.team or pr.z > h.z + 80: continue
				var ux := cos(h.ang); var uy := sin(h.ang); var dx: float = pr.x - h.x; var dy: float = pr.y - h.y
				if absf(dx * ux + dy * uy) <= h.half and absf(-dx * uy + dy * ux) < 9 + pr.size: blocked = true; break
			if blocked:
				dead = true; ev(["block", pr.x, pr.y, pr.z]); break
			var v := hit_player(pr.team, pr.x, pr.y, pr.z, pr.size)
			if v != null:
				var far: bool = owner != null and owner.pilot == "frost" and pr.t * Vector2(pr.vx, pr.vy).length() > pr.range * 0.6
				var close := 1.0
				if pr.w != "" and D.mechs[pr.w].has("close") and Vector2(pr.x - pr.x0, pr.y - pr.y0).length() < 110: close = float(D.mechs[pr.w].close)
				hurt(v, pr.dmg * close * (1.15 if far else 1.0), owner, pr.vx, pr.vy, pr.kb)
				if pr.fx != null: side_fx(v, pr.fx, owner)
				paint(pr.x, pr.y, v.z, pr.splat * 0.6, pr.team, owner)
				ev(["hit", v.id, pr.x, pr.y, pr.z, pr.team])
				dead = true; break
		if not dead and pr.t > 3: dead = true
		if dead: ev(["pdie", pr.x, pr.y, pr.z, pr.team, pr.size])
		else: out.append(pr)
	projs = out

func hit_player(team: int, x: float, y: float, z: float, pad_r: float) -> Mech:
	for t in players:
		if not t.alive or t.team == team: continue
		var R := float(C.PILOT_R) if t.foot else float(C.R)
		var hh := 22.0 if t.foot else float(C.PH)
		if Vector2(t.x - x, t.y - y).length() < R + pad_r and z > t.z - pad_r and z < t.z + hh + pad_r:
			return t
	return null

func spawn_shell(p: Mech, x1: float, y1: float, dmg: float, r: float, T: float) -> Dictionary:
	x1 = clampf(x1, 10, W - 10); y1 = clampf(y1, 10, H - 10)
	var z1 := 150.0 if solid_at(x1, y1) else top_at(x1, y1)
	var sh := {"x0": p.x, "y0": p.y, "z0": p.z + (18.0 if p.foot else float(C.MUZZLE) + 6), "x1": x1, "y1": y1, "z1": z1, "T": T, "t": 0.0, "team": p.team, "owner": p, "dmg": dmg, "r": r,
		"bounce": 0, "sticky": 0.0, "fog": false, "fire": false}
	shells.append(sh)
	ev(["lob", p.id])
	return sh

func shell_pos(s: Dictionary) -> Vector3:
	var k: float = clampf(s.t / s.T, 0, 1)
	var h: float = max(80.0, Vector2(s.x1 - s.x0, s.y1 - s.y0).length() * 0.45)
	return Vector3(lerp(float(s.x0), float(s.x1), k), lerp(float(s.y0), float(s.y1), k), lerp(float(s.z0), float(s.z1), k) + 4 * h * k * (1 - k))

func update_shells(dt: float) -> void:
	var keep: Array = []
	for s in shells:
		s.t += dt
		if s.t < s.T:
			keep.append(s); continue
		explode(s.x1, s.y1, s.z1, s.r, s.dmg, s.dmg * 0.45, s.team, s.owner)
		if s.sticky > 0:
			for t in players:
				if t.alive and t.team != s.team and Vector2(t.x - s.x1, t.y - s.y1).length() < s.r + 10: t.slow_t = max(t.slow_t, s.sticky)
		if s.bounce:
			var dx: float = s.x1 - s.x0; var dy: float = s.y1 - s.y0; var l: float = max(1.0, Vector2(dx, dy).length())
			var x2 := clampf(s.x1 + dx / l * 95, 10, W - 10); var y2 := clampf(s.y1 + dy / l * 95, 10, H - 10)
			keep.append({"x0": s.x1, "y0": s.y1, "z0": s.z1 + 4, "x1": x2, "y1": y2, "z1": 150.0 if solid_at(x2, y2) else top_at(x2, y2), "T": 0.36, "t": 0.0, "team": s.team, "owner": s.owner,
				"dmg": s.dmg * 0.6, "r": s.r * 0.8, "bounce": 0, "sticky": 0.0, "fog": false, "fire": false})
		if s.fog: add_helper({"kind": "fog", "x": s.x1, "y": s.y1, "z": s.z1, "r": 105.0, "team": s.team, "owner": s.owner, "t": 5.0, "cd": 0.0})
		if s.fire: add_helper({"kind": "fire", "x": s.x1, "y": s.y1, "z": s.z1, "r": 110.0, "team": s.team, "owner": s.owner, "t": 4.0, "cd": 0.0})
	shells = keep

func fire_charger(p: Mech, ch: float, w: Dictionary) -> void:
	var rng_len := float(w.range) * (0.35 + 0.65 * ch)
	var dmg := (float(w.minDmg) + (float(w.dmg) - float(w.minDmg)) * ch) * p.dmg_mul
	var a := float(p.inp.a)
	var dx := cos(a); var dy := sin(a)
	var x := p.x + dx * 16; var y := p.y + dy * 16; var z := p.z + float(C.MUZZLE)
	var pierce: bool = ch >= 0.9 and w.has("pierce")
	var hits: Array = []
	var d := 0.0; var last_paint := -99.0
	var pr := 13.0 + 8.0 * ch
	while d < rng_len:
		d += 6.0
		var px := x + dx * d; var py := y + dy * d
		if top_at(px, py) > z or px < 0 or py < 0 or px > W or py > H: break
		if d - last_paint > 12:
			last_paint = d; paint(px, py, top_at(px, py), pr, p.team, p)
		var v := hit_player(p.team, px, py, z, 5.0)
		if v != null and not hits.has(v):
			hits.append(v)
			if not pierce or hits.size() >= 2: break
	var ex := x + dx * d; var ey := y + dy * d
	paint(ex, ey, top_at(ex, ey), 18 + 12 * ch, p.team, p)
	if hits.size() > 0:
		var v0: Mech = hits[0]
		var dm := dmg * (1.08 if (p.pilot == "frost" and dist2d(v0, p) > float(w.range) * 0.6) else 1.0)
		hurt(v0, dm, p, dx, dy)
		if hits.size() > 1: hurt(hits[1], dm * float(w.pierce), p, dx, dy)
		if w.has("slowHit"): v0.slow_t = max(v0.slow_t, float(w.slowHit))
		if w.has("refract") and ch >= 0.9:   # 棱镜折射
			var best: Mech = null; var bd := float(w.refract.r)
			for t in players:
				if not t.alive or t == v0 or t.team == p.team: continue
				var dd := dist2d(t, v0)
				if dd < bd: bd = dd; best = t
			if best != null:
				hurt(best, dm * float(w.refract.k), p, best.x - v0.x, best.y - v0.y); best.slow_t = max(best.slow_t, float(w.get("slowHit", 0)))
				ev(["line", v0.x, v0.y, v0.z + 18, best.x, best.y, best.z + 18, p.team, 0.6, p.weapon])
	ev(["line", x, y, z, ex, ey, z, p.team, ch, p.weapon])
	if ch > 0.5: knock(p, -dx, -dy, 170 * ch)

# ---------------- 伤害 ----------------
func mech_edge(wa: String, wb: String) -> float:
	var A = D.classes.get(wa); var B = D.classes.get(wb)
	if A == null or B == null: return 1.0
	var R: Array = D.ring.mech
	var i := R.find(A[0])
	return 1.0 + float(C.ROLE_EDGE) if i >= 0 and R[(i + 1) % R.size()] == B[0] else 1.0

func hurt(t: Mech, dmg: float, by: Mech, kdx: float = 0.0, kdy: float = 0.0, kmul: float = 1.0, kup: float = 0.0) -> void:
	if not t.alive or t.inv_t > 0: return
	if t.sp_t > 0 and t.sp_kind == "charge": return
	if by != null and by != t and by.team != t.team:
		if by.rally_t > 0: dmg *= 1.2
		if by.pilot == "han" and t.hp > max_hp_of(t) * 0.7: dmg *= 1.1
		if t.mark_t > 0 and t.mark_team == by.team: dmg *= 1.12
		if by.pilot == "fu" and t.slow_t > 0: dmg *= 1.1
		if by.pilot == "aka" and by.hp < max_hp_of(by) * 0.5: dmg *= 1.22
		if not by.foot and not t.foot: dmg *= mech_edge(by.weapon, t.weapon)
		if not by.foot and D.mechs[by.weapon].has("backstab"):
			var da := wrapf(atan2(by.y - t.y, by.x - t.x) - float(t.inp.a), -PI, PI)
			if absf(da) > 1.92: dmg *= float(D.mechs[by.weapon].backstab); ev(["backstab", t.id])
	if not t.foot and D.mechs[t.weapon].has("front") and by != null and by != t:
		var da2 := wrapf(atan2(by.y - t.y, by.x - t.x) - float(t.inp.a), -PI, PI)
		if absf(da2) < 1.05: dmg *= float(D.mechs[t.weapon].front); ev(["guard", t.id])
	if not t.foot and D.mechs[t.weapon].has("armor"): dmg *= float(D.mechs[t.weapon].armor)
	if t.poss_t > 0: dmg *= 0.85
	if t.aura_t > 0: dmg *= 0.85
	for h in helpers:
		if h.kind == "dome" and h.team == t.team and Vector2(t.x - h.x, t.y - h.y).length() < h.r: dmg *= 0.7; break
	if t.pilot == "flag":
		var n := 0
		for a in players:
			if a != t and a.alive and a.team == t.team and dist2d(a, t) < 260:
				n += 1
		dmg *= 1.0 - 0.12 * min(3, n)
	if by != null and by != t:
		var kd := Vector2(kdx, kdy)
		if kd.length() < 0.001: kd = Vector2(t.x - by.x, t.y - by.y)
		knock(t, kd.x, kd.y, min(300.0, dmg * 1.8 * kmul) * (1.35 if t.wheel else (1.5 if t.foot else 1.0)), kup)
	if t.shield > 0:
		var ab: float = min(t.shield, dmg)
		t.shield -= ab; dmg -= ab
		if t.shield <= 0: t.shield_t = 0
		if dmg <= 0:
			ev(["shield", t.id]); return
	t.hp -= dmg; t.last_hurt = time; t.flash = 1.0
	if by != null and by != t and by.team != t.team:
		if by.poss_t > 0: by.hp = min(max_hp_of(by), by.hp + dmg * 0.35)
		if not by.foot and by.sp_t <= 0 and by.no_sp_until <= time:
			by.sp = min(float(wdata(by).spNeed), by.sp + dmg * (1.3 if by.pilot == "candy" else 1.0))
	ev(["dmg", t.id, int(round(dmg)), by.id if by != null else 0])
	if t.hp <= 0:
		if t.foot: kill(t, by)
		else: wreck(t, by)

func on_takedown(by: Mech, t: Mech) -> void:
	if by == null: return
	by.kills += 1
	if by.pilot == "blaze": by.hp = min(max_hp_of(by), by.hp + max_hp_of(by) * 0.4)   # 凌焰：越战越勇
	if by.pilot == "kaka" and t != null:   # 卡卡：惊喜礼盒
		add_helper({"kind": "bento", "gift": true, "heal": 0.0, "x": t.x, "y": t.y, "z": top_at(t.x, t.y), "team": by.team, "owner": by, "t": 12.0, "armed": 0.4})

# 机体被打爆：驾驶员弹出，用随身武器继续打；活过 6 秒原地空投新机体
func wreck(t: Mech, by: Mech) -> void:
	if by != null and by != t: on_takedown(by, t)
	paint(t.x, t.y, top_at(t.x, t.y), 55, by.team if by != null else 3 - t.team, by)
	t.foot = true; t.hp = float(C.PILOT_HP); t.rebuild_t = float(C.REBUILD) - (2.0 if t.pilot == "aurora" else 0.0)
	t.charge = 0; t.burst_n = 0; t.roll_t = 0; t.sp_t = 0; t.sp_kind = ""; t.shield = 0; t.shield_t = 0; t.quake_t = 0
	if t.pilot == "hammer": t.shield = 60; t.shield_t = 6
	t.inv_t = 0.7; t.ammo = float(C.AMMO); t.wheel = false
	ev(["wreck", t.id, by.id if by != null else 0, t.x, t.y, t.z, t.team])
	if t.pilot == "vet": explode(t.x, t.y, t.z, 100, 58, 24, t.team, t)
	knock(t, rng.randf() - 0.5, rng.randf() - 0.5, 150, 300)

func redeploy(p: Mech) -> void:
	p.foot = false; p.hp = p.max_hp; p.ammo = float(C.AMMO); p.inv_t = 1.0; p.rebuild_t = 0
	ev(["mdrop", p.id, p.x, p.y, p.z])
	for t in players:
		if not t.alive or t.team == p.team or dist2d(t, p) > 75: continue
		hurt(t, 20, p, t.x - p.x, t.y - p.y, 6, 150)
	paint(p.x, p.y, p.z, 60, p.team, p)

func kill(t: Mech, by: Mech) -> void:
	t.alive = false; t.hp = 0; t.respawn_t = float(C.KO_RESPAWN); t.deaths += 1; t.foot = false
	t.charge = 0; t.burst_n = 0; t.roll_t = 0; t.sp_t = 0; t.sp_kind = ""; t.shield = 0
	paint(t.x, t.y, top_at(t.x, t.y), 40, by.team if by != null else 3 - t.team, by)
	if by != null and by != t: on_takedown(by, t)
	t.sp = floor(t.sp * 0.5)
	ev(["ko", t.id, by.id if by != null else 0, t.x, t.y, t.z, t.team])

func explode(x: float, y: float, z: float, r: float, max_d: float, min_d: float, team: int, owner: Mech, no_los := false) -> void:
	paint(x, y, z, r, team, owner)
	for t in players:
		if not t.alive or t.team == team: continue
		var d := Vector3(t.x - x, t.y - y, t.z + 18 - z - 10).length()
		var tr := float(C.R)
		if d < r + tr and (no_los or los(x, y, z + 10, t.x, t.y)):
			var k: float = max(0.0, 1.0 - d / (r + tr))
			hurt(t, min_d + (max_d - min_d) * k, owner, t.x - x, t.y - y, 1.6, 90 + 160 * k)
	ev(["boom", x, y, z, team, r])

# ---------------- 驾驶员技能（充能制） ----------------
func use_skill(p: Mech) -> void:
	p.skill_uses -= 1; p.skill_cd = float(C.SKILL_CD)
	var sk := str(pdata(p).skill)
	var a := float(p.inp.a)
	ev(["skill", p.id, sk, p.x, p.y, p.z])
	match sk:
		"rush": p.rush_t = 3.0
		"scan": reveal[p.team] = time + 5.0
		"cheer":
			for q in players:
				if q.alive and q.team == p.team and dist2d(q, p) < 200:
					q.hp = min(max_hp_of(q), q.hp + 50)
					ev(["heal", q.id, 50])
		"guard": p.shield = max(p.shield, 60.0); p.shield_t = 4
		"smoke": paint(p.x, p.y, p.z, 95, p.team, p); p.smoke_t = 3
		"turret": add_helper({"kind": "turret", "x": p.x, "y": p.y, "z": p.z, "team": p.team, "owner": p, "t": 6.0, "cd": 0.3, "ang": 0.0})
		"dash":
			var dx := float(p.inp.mx); var dy := float(p.inp.my)
			if Vector2(dx, dy).length() < 0.2: dx = cos(a); dy = sin(a)
			knock(p, dx, dy, 520); p.inv_t = max(p.inv_t, 0.5 if p.pilot == "gale" else 0.35)
		"emp":
			for e in players:
				if e.alive and e.team != p.team and dist2d(e, p) < 200:
					e.slow_t = 3; e.silence_t = 1.1; e.charge = 0; e.burst_n = 0
					if p.pilot == "hex": e.lock_t = 3
		"bento": add_helper({"kind": "bento", "gift": false, "heal": 110.0, "x": p.x, "y": p.y, "z": p.z, "team": p.team, "owner": p, "t": 15.0, "armed": 0.6})
		"overdrive": p.ammo = float(C.AMMO); p.od_n = 3
		"drone": add_helper({"kind": "drone", "x": p.x, "y": p.y, "z": p.z + 40, "team": p.team, "owner": p, "t": 6.0, "cd": 0.3, "ang": 0.0})
		"rally":
			for q in players:
				if q.alive and q.team == p.team and dist2d(q, p) < 180:
					q.rally_t = max(q.rally_t, 6.0)
		"blast":
			var d := clampf(float(p.inp.ad), 0, 220)
			var bx := clampf(p.x + cos(a) * d, 20, W - 20); var by := clampf(p.y + sin(a) * d, 20, H - 20)
			add_helper({"kind": "charge", "x": bx, "y": by, "z": top_at(bx, by), "team": p.team, "owner": p, "t": 0.9, "cd": 99.0})
		"flash":
			for e in players:
				if not e.alive or e.team == p.team or dist2d(e, p) > 260: continue
				if absf(wrapf(atan2(e.y - p.y, e.x - p.x) - a, -PI, PI)) > 1.3: continue
				e.slow_t = max(e.slow_t, 1.2); e.charge = 0; e.burst_n = 0; e.blind_t = 2.5
				hurt(e, 12, p)
		"decoy":
			add_helper({"kind": "decoy", "x": p.x, "y": p.y, "z": p.z, "team": p.team, "owner": p, "t": 2.5, "cd": 99.0})
			p.cloak_t = max(p.cloak_t, 2.5); p.cloak_fast = true
		"airdrop":
			var d2 := clampf(float(p.inp.ad), 40, 260)
			var ax := clampf(p.x + cos(a) * d2, 24, W - 24); var ay := clampf(p.y + sin(a) * d2, 24, H - 24)
			add_helper({"kind": "supply", "x": ax, "y": ay, "z": top_at(ax, ay), "team": p.team, "owner": p, "t": 7.0, "fall": 1.0, "r": 100.0, "cd": 99.0, "got": {}})
		"jam":
			for e in players:
				if not e.alive or e.team == p.team or dist2d(e, p) > 230: continue
				e.sp = max(0.0, e.sp - float(wdata(e).spNeed) * 0.25); e.jam_t = 3; e.silence_t = max(e.silence_t, 0.6)
		"seal":
			var d3 := clampf(float(p.inp.ad), 60, 240)
			var sx := clampf(p.x + cos(a) * d3, 20, W - 20); var sy := clampf(p.y + sin(a) * d3, 20, H - 20)
			add_helper({"kind": "sealz", "x": sx, "y": sy, "z": top_at(sx, sy), "r": 105.0, "team": p.team, "owner": p, "t": 2.5, "cd": 0.0})
			paint(sx, sy, top_at(sx, sy), 50, p.team, p)
		"possess": p.poss_t = 4
		"nano":
			var d4 := clampf(float(p.inp.ad), 40, 240)
			var nx := clampf(p.x + cos(a) * d4, 20, W - 20); var ny := clampf(p.y + sin(a) * d4, 20, H - 20)
			add_helper({"kind": "nano", "x": nx, "y": ny, "z": top_at(nx, ny), "r": 130.0, "team": p.team, "owner": p, "t": 4.0, "cd": 99.0})
		"blink":
			var maxd := clampf(float(p.inp.ad), 60, 220)
			for dd in range(int(maxd), 29, -10):
				var tx := p.x + cos(a) * dd; var ty := p.y + sin(a) * dd
				if tx > 20 and ty > 20 and tx < W - 20 and ty < H - 20 and not solid_at(tx, ty) and top_at(tx, ty) <= p.z + 45:
					ev(["blink", p.id, p.x, p.y, p.z, tx, ty, top_at(tx, ty)])
					paint(p.x, p.y, p.z, 30, p.team, p)
					p.x = tx; p.y = ty; p.z = top_at(tx, ty); p.vx = 0; p.vy = 0; p.vz = 0
					paint(tx, ty, p.z, 36, p.team, p)
					break
			p.inv_t = max(p.inv_t, 0.25); p.blink_t = 2

# ---------------- 大招 ----------------
func activate_special(p: Mech) -> void:
	var w := wdata(p)
	p.sp = 0; p.sp_kind = str(w.special); p.no_sp_until = time + 3
	var a := float(p.inp.a)
	ev(["super", p.id, p.sp_kind, p.x, p.y, p.z])
	match p.sp_kind:
		"storm": p.sp_t = 0.8; p.sp_wave = 0
		"bulldoze":
			p.sp_t = 0.3
			var px := -sin(a); var py := cos(a)
			for i in range(-4, 5):
				spawn_proj(p, a, -0.02, 520, 430, 40, 30, 26, 12, Vector4(p.x + px * i * 15, p.y + py * i * 15, p.z + 22, 18), {"kb": 3.2})
		"napalm":
			p.sp_t = 0.3
			var d := clampf(float(p.inp.ad), 80, 430)
			spawn_shell(p, p.x + cos(a) * d, p.y + sin(a) * d, 30, 70, 0.8).fire = true
		"swarm":
			p.sp_t = 0.3
			for i in 4: add_helper({"kind": "drone", "x": p.x, "y": p.y, "z": p.z + 40, "team": p.team, "owner": p, "t": 8.0, "cd": 0.25 + i * 0.12, "ang": i * TAU / 4})
			p.rep_t = 8
		"whirl": p.sp_t = 2.2
		"aegis":
			p.sp_t = 0.3
			var wx := p.x + cos(a) * 46; var wy := p.y + sin(a) * 46
			add_helper({"kind": "wall", "x": wx, "y": wy, "z": top_at(wx, wy), "team": p.team, "owner": p, "t": 7.0, "cd": 99.0, "ang": a + PI / 2, "half": 80.0})
			p.shield = max(p.shield, 40.0); p.shield_t = max(p.shield_t, 7.0)
		"sonic":
			p.sp_t = 0.3
			explode(p.x, p.y, p.z + 10, 230, 48, 26, p.team, p, true)
		"charge": p.sp_t = 4
		"beam": p.sp_t = 2.6
		"cluster":
			p.sp_t = 0.4
			var d2 := clampf(float(p.inp.ad), 120, 360)
			for i in range(-2, 3):
				var aa := a + i * 0.2
				spawn_shell(p, p.x + cos(aa) * d2, p.y + sin(aa) * d2, 34, 48, 0.5 + absf(i) * 0.06).bounce = 1
		"shadowstep":
			p.sp_t = 0.3
			var d3 := clampf(float(p.inp.ad), 100, 260)
			line_hit(p, a, d3 + 20, 34, 60, 1.2, 60)
			paint(p.x + cos(a) * d3 * 0.5, p.y + sin(a) * d3 * 0.5, p.z, 40, p.team, p)
			knock(p, cos(a), sin(a), min(1000.0, d3 * 3.6))
			p.inv_t = max(p.inv_t, 0.4); p.cloak_t = 1.5; p.cloak_fast = true
		"prism":
			p.sp_t = 0.3
			var d4 := clampf(float(p.inp.ad), 80, 460)
			var qx := clampf(p.x + cos(a) * d4, 20, W - 20); var qy := clampf(p.y + sin(a) * d4, 20, H - 20)
			add_helper({"kind": "phase", "x": qx, "y": qy, "z": top_at(qx, qy), "r": 140.0, "team": p.team, "owner": p, "t": 0.65, "cd": 99.0})
			ev(["line", p.x, p.y, p.z + float(C.MUZZLE), qx, qy, top_at(qx, qy) + 4, p.team, 0.5, p.weapon])
		"lancestorm": p.sp_t = 0.85; p.ls_n = 3; p.ls_t = 0
		"venom":
			p.sp_t = 0.3
			var d5 := clampf(float(p.inp.ad), 80, 420)
			spawn_shell(p, p.x + cos(a) * d5, p.y + sin(a) * d5, 20, 60, 0.7).fog = true
		"recon":
			p.sp_t = 0.3
			var d6 := clampf(float(p.inp.ad), 60, 420)
			var rx := clampf(p.x + cos(a) * d6, 20, W - 20); var ry := clampf(p.y + sin(a) * d6, 20, H - 20)
			add_helper({"kind": "recon", "x": rx, "y": ry, "z": top_at(rx, ry) + 80, "team": p.team, "owner": p, "t": 8.0, "cd": 99.0})
		"cloak": p.sp_t = 0.3; p.cloak_t = 5; p.cloak_fast = true
		"barrier":
			p.sp_t = 0.4
			add_helper({"kind": "dome", "x": p.x, "y": p.y, "z": top_at(p.x, p.y), "r": 150.0, "team": p.team, "owner": p, "t": 6.0, "cd": 0.0})
			paint(p.x, p.y, p.z, 80, p.team, p)
			for q in players:
				if not q.alive or dist2d(q, p) > 150: continue
				if q.team == p.team: q.shield = max(q.shield, 40.0); q.shield_t = max(q.shield_t, 4.0)
				else: knock(q, q.x - p.x, q.y - p.y, 300, 60); q.slow_t = max(q.slow_t, 1.0)
		"rend": p.sp_t = 0.5; p.rend_arm = true; p.rend_a = a
		"missiles":
			p.sp_t = 0.3
			var cands: Array = []
			for e in players:
				if e.alive and e.team != p.team and visible_to(p.team, e) and dist2d(e, p) < float(D.missile.range): cands.append(e)
			cands.sort_custom(func(m1, m2): return dist2d(m1, p) < dist2d(m2, p))
			var targets: Array = []
			for e in cands.slice(0, int(D.missile.max)): targets.append(Vector2(e.x, e.y))
			var guard := 0
			while targets.size() < 4 and guard < 50:
				guard += 1
				var a0 := rng.randf() * TAU; var d0 := rng.randf_range(200, float(D.missile.range) * 0.8)
				var tx := clampf(p.x + cos(a0) * d0, 120, W - 120); var ty := clampf(p.y + sin(a0) * d0, 80, H - 80)
				if not solid_at(tx, ty): targets.append(Vector2(tx, ty))
			for tg in targets:
				missiles.append({"x": tg.x, "y": tg.y, "z": top_at(tg.x, tg.y), "t": 1.5, "team": p.team, "owner": p})
				ev(["lock", tg.x, tg.y, top_at(tg.x, tg.y), p.team])
		"bubble":
			p.sp_t = 0.3
			for q in players:
				if q.alive and q.team == p.team and dist2d(q, p) <= 170: q.shield = max(q.shield, 130.0 if q == p else 80.0); q.shield_t = 7
		"barrage":
			p.sp_t = 0.6
			for i in 6:
				var d7 := 110.0 + i * 62; var s := rng.randf_range(-15, 15)
				spawn_shell(p, p.x + cos(a) * d7 - sin(a) * s, p.y + sin(a) * d7 + cos(a) * s, 55, 58, 0.55 + i * 0.11)
		"quake":
			var d8 := clampf(float(p.inp.ad), 80, 280)
			knock(p, cos(a), sin(a), min(520.0, d8 * 2.1), 340)
			p.quake_t = 1.4; p.quake_arm = time + 0.3; p.inv_t = max(p.inv_t, 0.5); p.sp_t = 0.3

func line_hit(p: Mech, a: float, L: float, half_w: float, dmg: float, kmul: float, kup: float) -> void:
	var ux := cos(a); var uy := sin(a)
	for t in players:
		if not t.alive or t.team == p.team: continue
		var dx: float = t.x - p.x; var dy: float = t.y - p.y
		var along := dx * ux + dy * uy; var across := absf(-dx * uy + dy * ux)
		if along > -10 and along < L and across < half_w and absf(t.z - p.z) < 70: hurt(t, dmg, p, ux, uy, kmul, kup)

func quake_slam(p: Mech) -> void:
	p.quake_t = 0
	paint(p.x, p.y, p.z, 95, p.team, p)
	for t in players:
		if t.alive and t.team != p.team and dist2d(t, p) < 95 + float(C.R) and absf(t.z - p.z) < 50: hurt(t, 80, p, t.x - p.x, t.y - p.y, 2.2, 220)
	ev(["quake", p.x, p.y, p.z, p.team])

func update_special(p: Mech, dt: float) -> void:
	p.sp_t -= dt
	match p.sp_kind:
		"lancestorm":
			p.ls_t -= dt
			if p.ls_n > 0 and p.ls_t <= 0:
				p.ls_n -= 1; p.ls_t = 0.26
				var a := float(p.inp.a)
				line_hit(p, a, 200, 34, 40, 1.1, 40)
				paint(p.x + cos(a) * 85, p.y + sin(a) * 85, p.z, 36, p.team, p)
				knock(p, cos(a), sin(a), 170 * 3.4); p.inv_t = max(p.inv_t, 0.22)
				ev(["punch", p.id, a, false, false])
				if p.ls_n == 0: p.shield = max(p.shield, 30.0); p.shield_t = max(p.shield_t, 4.0)
		"storm":
			var el := 0.8 - p.sp_t
			while p.sp_wave < 3 and el >= p.sp_wave * 0.35:
				for i in 18: spawn_proj(p, i / 18.0 * TAU + p.sp_wave * 0.17, 0.12, 500, 280, 34, 24, 12, 8, null, {})
				paint(p.x, p.y, p.z, 70 + p.sp_wave * 15, p.team, p)
				p.sp_wave += 1
		"whirl":
			paint(p.x, p.y, p.z, 46, p.team, p)
			for t in players:
				if not t.alive or t.team == p.team or dist2d(t, p) > 112 or absf(t.z - p.z) > 40: continue
				if p.hit_cd.get(t.id, 0.0) > time: continue
				p.hit_cd[t.id] = time + 0.3
				hurt(t, 17, p, t.x - p.x, t.y - p.y, 2.4, 80)
		"rend":
			if p.rend_arm and p.sp_t <= 0.15:
				p.rend_arm = false
				line_hit(p, p.rend_a, 520, 40, 85, 1.6, 120)
				for d in range(24, 520, 26):
					var x := p.x + cos(p.rend_a) * d; var y := p.y + sin(p.rend_a) * d
					if x < 0 or y < 0 or x > W or y > H: break
					paint(x, y, top_at(x, y), 26, p.team, p)
				ev(["rend", p.id, p.x, p.y, p.z, p.rend_a, p.team])
				knock(p, cos(p.rend_a), sin(p.rend_a), 420); p.inv_t = max(p.inv_t, 0.35)
		"charge":
			paint(p.x, p.y, p.z, 42, p.team, p)
			contact_damage(p, p.x, p.y, float(C.R) + 30, 90, 0.4)
		"beam":
			var a2 := float(p.inp.a); var dx := cos(a2); var dy := sin(a2)
			var x0 := p.x + dx * 16; var y0 := p.y + dy * 16; var z0 := p.z + float(C.MUZZLE)
			var d2 := 0.0; var lp := -99.0; var hit := {}
			while d2 < 950:
				d2 += 8
				var x2 := x0 + dx * d2; var y2 := y0 + dy * d2
				if top_at(x2, y2) > z0 or x2 < 0 or y2 < 0 or x2 > W or y2 > H: break
				if d2 - lp > 14: lp = d2; paint(x2, y2, top_at(x2, y2), 20, p.team, p)
				var v := hit_player(p.team, x2, y2, z0, 16)
				if v != null and not hit.has(v.id): hit[v.id] = true; hurt(v, 150 * dt, p)
			ev(["beam", p.id, x0, y0, z0, x0 + dx * d2, y0 + dy * d2, z0, p.team])
	if p.sp_t <= 0: p.sp_t = 0; p.sp_kind = ""

func update_missiles(dt: float) -> void:
	var keep: Array = []
	for m in missiles:
		m.t -= dt
		if m.t > 0:
			keep.append(m); continue
		explode(m.x, m.y, m.z, 80, float(D.missile.dmg), float(D.missile.min), m.team, m.owner)
	missiles = keep

# ---------------- 召唤物 / 区域 ----------------
func update_helpers(dt: float) -> void:
	var keep: Array = []
	for h in helpers:
		h.t -= dt
		var o: Mech = h.owner
		if h.kind == "charge" and h.t <= 0: h.t = 0.01
		if h.t <= 0: continue
		var alive_h := true
		match h.kind:
			"bento":
				h.armed -= dt
				if h.armed <= 0:
					for q in players:
						if q.alive and q.team == h.team and Vector2(q.x - h.x, q.y - h.y).length() < 26:
							if h.heal > 0: q.hp = min(max_hp_of(q), q.hp + h.heal); ev(["heal", q.id, int(h.heal)])
							if h.gift and not q.foot: q.sp = min(float(wdata(q).spNeed), q.sp + float(wdata(q).spNeed) * 0.4)
							ev(["pickup", q.id]); alive_h = false; break
			"charge":
				if h.t <= 0.04: explode(h.x, h.y, h.z + 8, 115, 86, 32, h.team, o); alive_h = false
			"supply":
				if h.fall > 0:
					h.fall -= dt
					if h.fall <= 0: explode(h.x, h.y, h.z + 8, 70, 40, 24, h.team, o)
				else:
					for q in players:
						if q.alive and q.team == h.team and Vector2(q.x - h.x, q.y - h.y).length() < h.r:
							q.sup_t = 0.3
							if not h.got.has(q.id): h.got[q.id] = 1; q.ammo = float(C.AMMO); q.shield = max(q.shield, 30.0); q.shield_t = max(q.shield_t, 5.0)
			"recon":
				for e in players:
					if e.alive and e.team != h.team and Vector2(e.x - h.x, e.y - h.y).length() < 320: e.reveal_t = max(e.reveal_t, 0.4); e.mark_t = max(e.mark_t, 0.4); e.mark_team = h.team
			"nano":
				for q in players:
					if not q.alive or Vector2(q.x - h.x, q.y - h.y).length() > h.r: continue
					if q.team == h.team: q.hp = min(max_hp_of(q), q.hp + 15 * dt)
					else: q.dslow_t = max(q.dslow_t, 0.25); q.nano_t = 0.25
			"phase":
				if h.t <= 0.05:
					for e in players:
						if not e.alive or e.team == h.team or Vector2(e.x - h.x, e.y - h.y).length() > h.r: continue
						hurt(e, 45, o, e.x - h.x, e.y - h.y, 0.3)
						e.bind_t = max(e.bind_t, 1.2); e.silence_t = max(e.silence_t, 1.2); e.charge = 0; e.burst_n = 0; ev(["bind", e.id])
					paint(h.x, h.y, h.z, 70, h.team, o); ev(["boom", h.x, h.y, h.z + 8, h.team, h.r])
					alive_h = false
			"sealz":
				for e in players:
					if e.alive and e.team != h.team and Vector2(e.x - h.x, e.y - h.y).length() < h.r: e.slow_t = max(e.slow_t, 0.25); e.seal_t = max(e.seal_t, 0.25)
			"dome":
				for q in players:
					if not q.alive or Vector2(q.x - h.x, q.y - h.y).length() > h.r: continue
					if q.team == h.team: q.hp = min(max_hp_of(q), q.hp + 10 * dt)
					else: q.dslow_t = max(q.dslow_t, 0.25)
			"decoy":
				if h.t <= 0.04:
					explode(h.x, h.y, h.z + 10, 95, 55, 20, h.team, o)
					for e in players:
						if e.alive and e.team != h.team and Vector2(e.x - h.x, e.y - h.y).length() < 95:
							e.slow_t = max(e.slow_t, 1.0)
					alive_h = false
			"fog":
				h.cd -= dt
				if h.cd <= 0:
					h.cd = 0.5
					for e in players:
						if e.alive and e.team != h.team and Vector2(e.x - h.x, e.y - h.y).length() < h.r:
							side_fx(e, {"poison": 1.2, "slow": 0.6}, o)
			"fire":
				h.cd -= dt
				if h.cd <= 0:
					h.cd = 0.4
					paint(h.x, h.y, h.z, h.r * 0.8, h.team, o)
					for e in players:
						if e.alive and e.team != h.team and Vector2(e.x - h.x, e.y - h.y).length() < h.r:
							hurt(e, 12, o)
			"turret", "drone":
				if h.kind == "drone":
					if not o.alive:
						alive_h = false
					else:
						h.ang += dt * 2.4
						h.x = o.x + cos(h.ang) * 26; h.y = o.y + sin(h.ang) * 26; h.z = o.z + 44
				if alive_h:
					h.cd -= dt
					if h.cd <= 0:
						var rr := 300.0 if h.kind == "turret" else 260.0
						var best: Mech = null; var bd := rr
						for e in players:
							if not e.alive or e.team == h.team or not visible_to(h.team, e): continue
							var d := Vector2(e.x - h.x, e.y - h.y).length()
							if d < bd and los(h.x, h.y, h.z + 16, e.x, e.y): bd = d; best = e
						if best != null:
							h.cd = 0.45 if h.kind == "turret" else 0.5
							var hz: float = h.z + 18 if h.kind == "turret" else h.z
							h.ang = atan2(best.y - h.y, best.x - h.x) if h.kind == "turret" else h.ang
							spawn_proj(o, atan2(best.y - h.y, best.x - h.x), atan2(best.z + 16 - hz, bd), 620, rr + 20, 12.0 if h.kind == "turret" else 11.0, 12, 0, 5, Vector4(h.x, h.y, hz, 6), {})
						else: h.cd = 0.15
		if alive_h: keep.append(h)
	helpers = keep

# ---------------- 视野 ----------------
func visible_to(team: int, e: Mech) -> bool:
	if not e.hidden or reveal[team] > time or e.reveal_t > 0: return true
	for a in players:
		if a.alive and a.team == team and dist2d(a, e) < float(C.BUSH_DETECT): return true
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
		for dd in [Vector2i(1, 0), Vector2i(-1, 0), Vector2i(0, 1), Vector2i(0, -1)]:
			var nx: int = cx + dd.x; var ny: int = cy + dd.y
			if not in_bounds(nx, ny): continue
			var ni := ny * GW + nx
			if f[ni] >= 0 or not walkable(ni): continue
			f[ni] = f[c] + 1; q.append(ni)
	return f

func pick_roam(p: Mech, near: Vector2 = Vector2(-1, -1)) -> void:
	var best := -1; var bs := -1e9
	for _i in 16:
		var cx := rng.randi_range(4, GW - 5); var cy := rng.randi_range(3, GH - 4)
		if near.x >= 0:
			cx = clampi(int(near.x / CELL) + rng.randi_range(-6, 6), 1, GW - 2); cy = clampi(int(near.y / CELL) + rng.randi_range(-6, 6), 1, GH - 2)
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
	if here < 0: return Vector2(p.ai_goal.x - p.x, p.ai_goal.y - p.y).normalized()
	var best := Vector2.ZERO; var bv := here
	for dd in [Vector2i(1, 0), Vector2i(-1, 0), Vector2i(0, 1), Vector2i(0, -1), Vector2i(1, 1), Vector2i(-1, 1), Vector2i(1, -1), Vector2i(-1, -1)]:
		var nx: int = cx + dd.x; var ny: int = cy + dd.y
		if not in_bounds(nx, ny): continue
		var v := p.ai_field[ny * GW + nx]
		if v >= 0 and v < bv:
			if dd.x != 0 and dd.y != 0 and (p.ai_field[cy * GW + nx] < 0 or p.ai_field[ny * GW + cx] < 0): continue
			bv = v; best = Vector2(dd.x, dd.y)
	return best.normalized()

const SUPER_REACH := {"beam": 700, "missiles": 1000, "storm": 220, "bubble": 260, "charge": 260, "barrage": 420, "quake": 260, "bulldoze": 380, "napalm": 420, "swarm": 420, "whirl": 200, "sonic": 220,
	"aegis": 320, "cluster": 360, "shadowstep": 250, "venom": 400, "cloak": 450, "barrier": 220, "rend": 480, "recon": 420, "prism": 460, "lancestorm": 320}

func ai_think(p: Mech, dt: float) -> void:
	if not p.alive: return
	p.ai_t -= dt
	var w := wdata(p)
	var melee: bool = str(w.attack) == "punch" and not p.foot
	var rng_w := float(side(p).range) if p.foot else float(w.range2)
	var tgt: Mech = null; var td := 1e9
	var blind_r := 180.0 if p.blind_t > 0 else 1e9
	for e in players:
		if not e.alive or e.team == p.team or not visible_to(p.team, e): continue
		var d := dist2d(e, p)
		if d < td and d < 760 and d < blind_r: td = d; tgt = e
	var inp := p.inp
	inp.j = false
	var hp_k := p.hp / max_hp_of(p)
	if tgt != null and (melee or los(p.x, p.y, p.z + float(C.MUZZLE), tgt.x, tgt.y)):
		var to := Vector2(tgt.x - p.x, tgt.y - p.y)
		var lead := to.length() / 650.0
		inp.a = atan2(tgt.y + tgt.vy * lead * 0.6 - p.y, tgt.x + tgt.vx * lead * 0.6 - p.x) + rng.randf_range(-0.06, 0.06)
		inp.pt = atan2(tgt.z + 16 - (p.z + float(C.MUZZLE)), max(1.0, td))
		inp.ad = td
		var want := rng_w * (0.85 if str(w.attack) == "charge" else (0.35 if melee else 0.7))
		if p.foot: want = rng_w * 0.8
		var dir := to.normalized()
		var mv := Vector2(-dir.y, dir.x) * p.ai_strafe * (0.3 if melee else 0.8)
		if td > want: mv += dir
		elif td < want * 0.6 and not melee: mv -= dir
		if p.foot and hp_k < 0.5: mv = -dir + mv * 0.5   # 驾驶员残血：先跑
		if p.ai_t <= 0:
			p.ai_t = rng.randf_range(0.6, 1.4)
			if rng.randf() < 0.35: p.ai_strafe = -p.ai_strafe
			if melee and td < 260 and rng.randf() < 0.3: inp.j = true
		inp.mx = mv.x; inp.my = mv.y; inp.w = melee and td > 200 and cell_at(p.x, p.y) == p.team
		if str(w.attack) == "charge" and not p.foot:
			var need := 0.92 if td > 260 else 0.5
			inp.f = p.charge < need and td < rng_w + 40
		elif str(w.attack) == "lob" and not p.foot:
			inp.f = td < float(w.range) + 20 and td > float(w.minRange)
		else:
			inp.f = td < rng_w + (30.0 if melee else 10.0)
		# 技能
		p.ai_skill -= dt
		if p.skill_uses > 0 and p.skill_cd <= 0 and p.ai_skill <= 0:
			p.ai_skill = 0.4
			var sk := str(pdata(p).skill)
			var fight := td < 300
			var use := false
			match sk:
				"rush": use = fight or p.foot
				"scan": use = false
				"cheer": use = hp_k < 0.6
				"guard": use = fight and hp_k < 0.75
				"smoke": use = (fight and hp_k < 0.5) or p.foot
				"turret", "drone", "rally", "airdrop": use = fight
				"dash": use = p.foot or (melee and td < 260 and td > 90)
				"emp": use = td < 200 or (td < 260 and hp_k < 0.6)
				"bento": use = hp_k < 0.55
				"overdrive": use = fight and p.ammo < 1
				"blast": use = td < 200
				"jam": use = td < 210
				"flash": use = td < 220
				"seal": use = td < 240
				"possess": use = fight and (hp_k < 0.7 or td < 120)
				"decoy": use = fight and (hp_k < 0.6 or td < 120)
				"nano": use = td < 240 or hp_k < 0.5
				"blink": use = (td < 240 and td > 90) or (p.foot and hp_k < 0.4)
			if use:
				if sk == "dash" or sk == "blink":
					inp.mx = dir.x; inp.my = dir.y
					if p.foot and hp_k < 0.4: inp.a = float(inp.a) + PI; inp.ad = 220
				if sk == "nano": inp.ad = min(240.0, td / 2 + 40)
				if sk == "airdrop" and hp_k < 0.6: inp.ad = 40
				inp.gq += 1
		if not p.foot and p.sp >= float(w.spNeed) and td < float(SUPER_REACH.get(str(w.special), 300)):
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
	inp.pt = -0.05
	if ahead != p.team and p.ammo >= 1.5 and not melee:
		inp.w = false
		inp.a = atan2(d.y, d.x) + rng.randf_range(-0.35, 0.35)
		inp.ad = 160
		inp.f = str(w.attack) != "charge" or rng.randf() < 0.5
		if str(w.attack) == "charge" and p.charge > 0.4: inp.f = false
	else:
		inp.f = melee and ahead != p.team and p.ammo >= 2.5
		inp.a = atan2(d.y, d.x)
		inp.w = own and (p.ammo < 2.5 or melee)
	if p.skill_uses > 0 and p.skill_cd <= 0 and str(pdata(p).skill) == "scan" and rng.randf() < 0.004:
		inp.gq += 1
