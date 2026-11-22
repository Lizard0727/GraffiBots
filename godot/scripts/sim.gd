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
	var lift = null           # 坐电梯中
	var inv := {"w": 5, "h": 3, "items": []}    # 搜刮撤离：网格背包
	var safe := {"w": 2, "h": 2, "items": []}   # 安全箱（阵亡也保留）
	var open_c := 0
	var srch := 0.0
	var ex_t := 0.0
	var extracted := false
	var loot_boss := false
	var pick_t := 0.0
	var ai_cont := 0
	var ai_local := PackedInt32Array()   # 目标很近时的局部细导航场（64×64 小格窗口）
	var ai_local_org := Vector2i.ZERO
	var ai_skip := {}                    # 走不到 / 卡住的目标：一段时间内不再选
	var ai_done := {}
	var kit := 0
	var lv := 1               # 驾驶员等级（每级生命和伤害 +4%）
	var bt := 0               # 突破：I 解锁超载，II 超载更强
	var pmul := 1.0
	var tal := {}             # 带进这局的天赋（最多 3 个）
	var obj := 0              # 抢目标的次数（得分 / 送电池……）
	var balloons := 0
	var float_t := 0.0
	var seals := 0
	var spirits := 0
	var hit_n := 0
	var d5_used := false
	var ov := 0.0             # 超载充能（打出的伤害）
	var ov_t := 0.0           # 超载剩余时间
	var ov_pulse := 0.0
	var aura_def := 0.85
	var carry := 0            # 电池 / 封印石
	var out := false          # 一条命的模式里出局
	var cubes := 0            # 逃亡圈空投箱
	var npc := false
	var spirit := false
	var boss := false
	var rad := 0.0            # 体型半径（Boss）
	var boss_ai := {}
	var guard = null
	var ai_urgent := false
	var ai_seen := 0.0        # 盯住当前目标多久了（反应时间）
	var ai_tgt := 0
	var persona := ""        # AI 性格（bots.gd）：影响反应、瞄准、开火、挂机
	var pz := {}
	var afk_t := 0.0
	var typing_t := 0.0      # AI 在打字：站着不动
	var use_t := 0.0         # 搜刮撤离：消耗品冷却
	var late := false        # 中途加入的增援
	var flee_t := 0.0
	var flee_threat := false
	var afk_next := 20.0
	var looks := {}
	var ai_mode_t := 0.0
	var kills := 0
	var deaths := 0
	var painted := 0
	# 输入：mx/my 移动方向，a 瞄准角，pt 俯仰角，ad 瞄准距离，f 按住开火，w 滚轮，j 跳，gq/qq 技能 / 大招按下计数
	var inp := {"mx": 0.0, "my": 0.0, "a": 0.0, "pt": 0.0, "ad": 300.0, "f": false, "w": false, "j": false, "gq": 0, "qq": 0, "oq": 0}
	var last_gq := 0
	var last_qq := 0
	var last_oq := 0
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
var tutorial := false      # 新手教程：时间不走、敌人是不动的训练靶、玩家不会倒下
var tut_hits := 0
var over := false
var winner := 0
var result := {}
var reveal := [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0]
var mode := "turf"
var teams := 2
var one_life := false
var obj := {}
var MC: Dictionary
var zone_cells := PackedInt32Array()
var spawns: Array = []
var boss: Mech = null
var minions: Array = []
var spirits: Array = []
var ranked := false
var lift := PackedInt32Array()
var loot := false
var risk := "normal"
var tick_n := 0
var rng := RandomNumberGenerator.new()
var next_id := 1

func _init(data: Dictionary, map_idx: int = 0, seed_v: int = 0, duration: float = 180.0, mode_v: String = "turf", opts: Dictionary = {}) -> void:
	risk = str(opts.get("risk", "normal"))
	D = data
	C = D.consts
	M = D.lootMap if mode_v == "loot" else D.maps[clampi(map_idx, 0, D.maps.size() - 1)]
	GW = int(M.gw); GH = int(M.gh); W = GW * CELL; H = GH * CELL
	solid.resize(GW * GH); bush.resize(GW * GH); pad.resize(GW * GH); grid.resize(GW * GH); lift.resize(GW * GH)
	if M.has("topB64"):   # 超大地图：高度 / 墙 / 草丛都压缩过
		top = PackedInt32Array(Array(Marshalls.base64_to_raw(M.topB64)))
		var sbits := Marshalls.base64_to_raw(M.solidBits); var bbits := Marshalls.base64_to_raw(M.bushBits)
		for i in GW * GH:
			solid[i] = (sbits[i >> 3] >> (i & 7)) & 1
			bush[i] = (bbits[i >> 3] >> (i & 7)) & 1
	else:
		top = PackedInt32Array(M.top)
		var sb: String = M.solid; var bb: String = M.bush
		for i in GW * GH:
			solid[i] = 1 if sb.unicode_at(i) == 49 else 0
			bush[i] = 1 if bb.unicode_at(i) == 49 else 0
	for k in M.pads: pad[int(k)] = int(M.pads[k])
	for k in M.get("lifts", {}): lift[int(k)] = int(M.lifts[k])
	if GW * GH > 50000: build_nav()
	time_left = duration
	if seed_v != 0: rng.seed = seed_v
	else: rng.randomize()
	mode = mode_v
	MC = D.modeCfg
	var md: Dictionary = D.modes.get(mode, {})
	teams = int(md.get("teams", 2)); one_life = bool(md.get("oneLife", false))
	init_mode()

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

func add_player(id: int, name: String, team: int, pilot: String, weapon: String, bot: bool, power: Dictionary = {}) -> Mech:
	var p := Mech.new()
	p.id = id; p.name = name; p.team = team; p.pilot = pilot; p.weapon = weapon; p.bot = bot
	p.lv = clampi(int(power.get("lv", 1)), 1, 11); p.bt = clampi(int(power.get("bt", 0)), 0, 2)
	p.pmul = 1.0 + (p.lv - 1) * 0.04
	for t in power.get("tal", []).slice(0, 3): p.tal[t] = true
	var n := 0
	for q in players:
		if q.team == team:
			n += 1
	p.slot = n
	p.max_hp = round(float(D.mechs[weapon].hp) * (1.18 if pilot == "titan" else 1.0) * p.pmul * (1.08 if p.tal.has("d1") else 1.0))
	p.skill_max = int(C.SKILL_CHARGES) + (1 if p.tal.has("s2") else 0); p.skill_uses = p.skill_max
	p.ai_strafe = 1.0 if rng.randf() < 0.5 else -1.0
	players.append(p)
	respawn(p)
	return p

func respawn(p: Mech) -> void:
	if p.guard is Dictionary:
		p.x = float(p.guard.x); p.y = float(p.guard.y)
	elif spawns.size() > p.team and spawns[p.team] != null:
		var sv: Vector2 = spawns[p.team]
		p.x = sv.x + [0.0, 34.0, -30.0][p.slot % 3]; p.y = sv.y + [0.0, 20.0, 26.0][p.slot % 3]
	else:
		var s: Dictionary = M.spawns[(p.team - 1) % 2][p.slot % 4]
		p.x = float(s.x); p.y = float(s.y)
	p.z = top_at(p.x, p.y)
	p.vx = 0; p.vy = 0; p.vz = 0; p.kx = 0; p.ky = 0; p.on_ground = true
	p.foot = false; p.hp = p.max_hp; p.ammo = float(C.AMMO); p.alive = true; p.inv_t = 2.5; p.charge = 0; p.burst_n = 0
	p.inp.a = 0.0 if p.team == 1 else PI
	p.carry = 0; p.d5_used = false
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
	if not tutorial: time_left -= dt
	field_budget = 1   # 超大地图每帧最多新算 1 个导航场
	tick_n += 1
	for p in players:
		if p.boss: boss_think(p, dt)
		elif p.bot:
			# 超大地图人多：AI 隔帧思考（守卫更少），输入会保持到下次思考
			var every := 1
			if loot: every = 4 if p.guard != null else 2
			if (tick_n + p.slot) % every == 0: ai_think(p, dt * every)
		update_player(p, dt)
	update_helpers(dt)
	update_projs(dt)
	update_shells(dt)
	update_missiles(dt)
	if not over: update_mode(dt)
	if time_left <= 0 and not over: finish()

func finish(win: int = -1) -> void:
	if over: return
	over = true
	var a := 0; var b := 0; var tot := 0
	for i in grid.size():
		if solid[i]: continue
		tot += 1
		if grid[i] == 1: a += 1
		elif grid[i] == 2: b += 1
	var by_turf := 1 if a > b else (2 if b > a else 0)
	var reason := "ko"
	if win < 0:
		reason = "time"
		if mode in ["escape4", "escape8"]:
			var bn := -1
			for t in range(1, teams + 1):
				if alive_of(t) > bn: bn = alive_of(t); win = t
		elif mode == "raid": win = 2
		elif loot:
			var bv := 0; win = 0
			for t in range(1, teams + 1):
				if int(obj.score[t]) > bv: bv = int(obj.score[t]); win = t
		elif mode == "turf": win = by_turf
		elif mode == "zone": win = 1 if obj.count[1] < obj.count[2] else (2 if obj.count[2] < obj.count[1] else by_turf)
		else: win = 1 if obj.score[1] > obj.score[2] else (2 if obj.score[2] > obj.score[1] else by_turf)
	winner = win
	result = {"a": a, "b": b, "tot": tot, "winner": winner, "reason": reason, "mode": mode}
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
		var rk := (1.25 if p.pilot == "doc" else (1.1 if near_pilot(p, "doc", 220) else 1.0)) * (1.2 if p.tal.has("s1") else 1.0)
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
	var OV = ov_of(p)
	if p.ov_t > 0: p.ov_t = max(0.0, p.ov_t - dt)
	if OV != null: overload_tick(p, OV, dt)
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
	if OV != null and OV.has("spd"): sm *= float(OV.spd)
	if obj.has("tr") and obj.tr.carrier == p: sm *= 0.72
	if p.carry > 0: sm *= 1.0 - 0.04 * p.carry
	if p.boss: sm *= 0.8
	if own and p.tal.has("p2"): sm *= 1.06
	if own and bool(p.inp.w) and not p.foot and p.tal.has("p6"): sm *= 1.1
	p.sm = sm
	p.wheel = bool(p.inp.w) and not p.foot and not (p.sp_t > 0 and p.sp_kind == "beam")
	var mul := 1.0
	if p.sp_t > 0 and p.sp_kind == "beam": mul = 0.4
	elif p.firing and not p.wheel:
		mul = {"blaster": 0.9, "charger": 0.5, "bucket": 0.85, "gatling": 0.6, "mortar": 0.9, "prism": 0.55}.get(p.weapon, 1.0)
	step_move(p, dt, mul)
	# 敌方涂料掉血；脱战回血（大厨更快）
	var mh := max_hp_of(p)
	if enemy_paint and not p.npc and p.inv_t <= 0 and not (p.sp_t > 0 and p.sp_kind == "charge") and p.hp > mh * 0.3:
		p.hp = max(mh * 0.3, p.hp - mh * 0.1 * dt)
	if own and p.tal.has("p4"): p.hp = min(mh, p.hp + 3 * dt)
	if not enemy_paint and not p.boss and time - p.last_hurt > 3.0 and time - p.last_atk > 2.0:
		var k := (0.32 if (p.wheel and own) else 0.16) * (2.0 if p.pilot == "chef" else 1.0)
		p.hp = min(mh, p.hp + mh * k * dt)
	# 装填
	if p.burst_n <= 0 and p.roll_t <= 0 and p.charge <= 0:
		var rt := float(side(p).reload) if p.foot else float(w.reload)
		var rk := (2.0 if p.rush_t > 0 else 1.0) * (1.6 if (p.wheel and own) else 1.0) * (1.12 if p.tal.has("a2") else 1.0)
		if near_pilot(p, "echo", 200): rk *= 1.2
		elif p.pilot == "echo": rk *= 1.1
		if p.jam_t > 0: rk *= 0.7
		if p.nano_t > 0: rk *= 0.75
		if p.sup_t > 0: rk *= 1.3
		p.ammo = min(float(C.AMMO), p.ammo + dt / rt * rk)
	if OV != null and OV.has("infAmmo") and not p.foot: p.ammo = float(C.AMMO)
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
	if p.inp.oq != p.last_oq:
		p.last_oq = p.inp.oq
		if p.bt >= 1 and p.ov_t <= 0 and p.ov >= float(C.OV_NEED) and p.silence_t <= 0 and not p.npc: activate_overload(p)
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
	if p.lift != null:   # 电梯：先沿电梯井升到楼顶高度，再平移到楼顶上
		var Lf: Dictionary = p.lift; var LS: Dictionary = D.loot.lift
		p.vx = 0; p.vy = 0; p.kx = 0; p.ky = 0; p.vz = 0; p.on_ground = false; p.coy = 0; p.pad_t = 0.6
		if Lf.ph == 0:
			p.z = min(float(Lf.top), p.z + float(LS.up) * dt)
			if p.z >= float(Lf.top): Lf.ph = 1
		else:
			var dx: float = Lf.tx - p.x; var dy: float = Lf.ty - p.y; var dl := sqrt(dx * dx + dy * dy); var st := float(LS.across) * dt
			if dl <= st: p.x = Lf.tx; p.y = Lf.ty; p.lift = null; p.z = max(p.z, top_at(p.x, p.y)); p.on_ground = true
			else: p.x += dx / dl * st; p.y += dy / dl * st
		return
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
		var lc := lift[cy * GW + cx] if in_bounds(cx, cy) else 0
		if lc > 0 and p.on_ground:
			var la := (lc - 1) / 250.0 * TAU; var roof := float(D.loot.levelH[5])
			var ux := cos(la); var uy := sin(la)
			var ccx := (cx + 0.5) * CELL; var ccy := (cy + 0.5) * CELL
			var d := float(CELL)
			while d < CELL * 12 and top_at(ccx + ux * d, ccy + uy * d) < roof - 1: d += CELL / 2.0
			if d < CELL * 12:
				p.lift = {"tx": ccx + ux * (d + CELL * 1.4), "ty": ccy + uy * (d + CELL * 1.4), "top": roof + 8, "ph": 0}
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
	if team > 2 and mode == "seal": return 0
	if owner != null and owner.tal.has("p1"): r *= 1.12
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
			owner.sp = min(float(wdata(owner).spNeed), owner.sp + n * 0.6 * (1.6 if owner.pilot == "yuzu" else 1.0) * (1.25 if owner.tal.has("p3") else 1.0))
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
			p.ammo -= 1; p.atk_cd = float(w.atkCd) / rof_of(p); p.last_atk = time; take_overdrive(p)
			fire_charger(p, p.charge, w)
		p.charge = 0
		return false
	if p.inp.f and p.atk_cd <= 0 and p.ammo >= 1:
		p.opener_on = w.has("opener") and time - p.last_atk > 2.0
		p.ammo -= 1; p.atk_cd = float(w.atkCd) / rof_of(p); p.last_atk = time; take_overdrive(p)
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

func rof_of(p: Mech) -> float:
	var O = ov_of(p)
	return float(O.rof) if O != null and O.has("rof") else 1.0

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
	push_ball(p, fx, fy, float(w.rollWidth), 320)
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
	push_ball(p, fx, fy, float(w.range), 1100)
	if mode == "park":
		for b in obj.balloons.duplicate():
			if Vector2(b.x - fx, b.y - fy).length() < float(w.range) + 20: pop_balloon(b, p.team, p)
	for t in players:
		if not t.alive or t.team == p.team: continue
		var dx: float = t.x - p.x; var dy: float = t.y - p.y; var d := sqrt(dx * dx + dy * dy)
		if d > float(w.range) + (t.rad if t.rad > 0 else float(C.R)) + 10 + float(w.lunge) * 0.1 or absf(t.z - p.z) > (120.0 if t.boss else 40.0): continue
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
				if h.kind == "domain":
					if h.team != pr.team and pr.z < h.z + 130 and Vector2(pr.x - h.x, pr.y - h.y).length() < h.r: blocked = true; break
					continue
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
			if mode == "park":
				var bl = balloon_at(pr.x, pr.y, pr.z, 20 + pr.size)
				if bl != null: pop_balloon(bl, pr.team, owner); dead = true; break
			if obj.has("ball") and obj.reset_t <= 0:
				var ball: Dictionary = obj.ball
				if Vector3(ball.x - pr.x, ball.y - pr.y, ball.r - pr.z).length() < ball.r + pr.size:
					var hs: float = max(1.0, Vector2(pr.vx, pr.vy).length())
					ball.vx += pr.vx / hs * pr.dmg * 7; ball.vy += pr.vy / hs * pr.dmg * 7; ball.last = pr.team
					paint(pr.x, pr.y, 0, pr.splat * 0.5, pr.team, owner)
					dead = true; break
		if not dead and pr.t > 3: dead = true
		if dead: ev(["pdie", pr.x, pr.y, pr.z, pr.team, pr.size])
		else: out.append(pr)
	projs = out

func hit_player(team: int, x: float, y: float, z: float, pad_r: float) -> Mech:
	for t in players:
		if not t.alive or t.team == team: continue
		var R: float = t.rad if t.rad > 0 else (float(C.PILOT_R) if t.foot else float(C.R))
		var hh := 120.0 if t.boss else (22.0 if t.foot else float(C.PH))
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
		if domain_blocks(s.team, s.x1, s.y1, s.z1): ev(["block", s.x1, s.y1, s.z1 + 10]); continue
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
	var tOV = ov_of(t)
	if by != null and by != t:
		var bOV = ov_of(by)
		if bOV != null:
			if bOV.has("dmg"): dmg *= float(bOV.dmg)
			if bOV.has("kb"): kmul *= float(bOV.kb)
			if bOV.has("frostHit") and by.team != t.team: t.slow_t = max(t.slow_t, 1.0)
	if by != null and by != t and by.team != t.team:
		if by.tal.has("a1"): dmg *= 1.06
		if by.tal.has("a4") and t.hp < max_hp_of(t) * 0.3: dmg *= 1.15
		if by.tal.has("a5"):
			by.hit_n += 1
			if by.hit_n % 5 == 0: dmg *= 1.6
		if by.tal.has("a6") and (t.slow_t > 0 or t.silence_t > 0 or t.reveal_t > 0): dmg *= 1.2
		if by.tal.has("p5") and by.on_ground and cell_at(by.x, by.y) == by.team: dmg *= 1.08
		if by.rally_t > 0: dmg *= 1.2
		if by.pilot == "han" and t.hp > max_hp_of(t) * 0.7: dmg *= 1.1
		if t.mark_t > 0 and t.mark_team == by.team: dmg *= 1.12
		if by.pilot == "fu" and t.slow_t > 0: dmg *= 1.1
		if by.pilot == "aka" and by.hp < max_hp_of(by) * 0.5: dmg *= 1.22
		if not by.foot and not t.foot and not t.npc: dmg *= mech_edge(by.weapon, t.weapon)
		if not by.foot and D.mechs[by.weapon].has("backstab"):
			var da := wrapf(atan2(by.y - t.y, by.x - t.x) - float(t.inp.a), -PI, PI)
			if absf(da) > 1.92: dmg *= float(D.mechs[by.weapon].backstab); ev(["backstab", t.id])
	if not t.foot and D.mechs[t.weapon].has("front") and by != null and by != t:
		var da2 := wrapf(atan2(by.y - t.y, by.x - t.x) - float(t.inp.a), -PI, PI)
		if absf(da2) < 1.05: dmg *= float(D.mechs[t.weapon].front); ev(["guard", t.id])
	if t.tal.has("d6") and dmg > 30: dmg *= 0.8
	if tOV != null and tOV.has("def"): dmg *= float(tOV.def)
	if tOV != null and tOV.has("reflect") and by != null and by != t and by.team != t.team and by.alive and not _reflecting:
		_reflecting = true; hurt(by, dmg * float(tOV.reflect), t); _reflecting = false
	if not t.foot and D.mechs[t.weapon].has("armor"): dmg *= float(D.mechs[t.weapon].armor)
	if t.tal.has("d4") and t.hp < max_hp_of(t) * 0.3: dmg *= 0.85
	if t.poss_t > 0: dmg *= 0.85
	if t.aura_t > 0: dmg *= t.aura_def
	for h in helpers:
		if h.kind == "dome" and h.team == t.team and Vector2(t.x - h.x, t.y - h.y).length() < h.r: dmg *= 0.7; break
	if t.pilot == "flag":
		var n := 0
		for a in players:
			if a != t and a.alive and a.team == t.team and dist2d(a, t) < 260:
				n += 1
		dmg *= 1.0 - 0.12 * min(3, n)
	if by != null and by != t and not t.boss and not (tOV != null and tOV.has("noKb")):
		var kd := Vector2(kdx, kdy)
		if kd.length() < 0.001: kd = Vector2(t.x - by.x, t.y - by.y)
		knock(t, kd.x, kd.y, min(300.0, dmg * 1.8 * kmul) * (1.35 if t.wheel else (1.5 if t.foot else 1.0)), kup)
	if t.shield > 0:
		var ab: float = min(t.shield, dmg)
		t.shield -= ab; dmg -= ab
		if t.shield <= 0: t.shield_t = 0
		if dmg <= 0:
			ev(["shield", t.id]); return
	if obj.has("tr") and obj.tr.carrier == t: dmg *= 0.75
	if by != null and by != t: dmg *= by.pmul
	if by != null and by != t and by.cubes > 0: dmg *= 1.0 + by.cubes * float(MC.ESCAPE.crateDmg)
	if tOV != null and tOV.has("undying"): dmg = min(dmg, max(0.0, t.hp - 1))
	if t.tal.has("d5") and not t.foot and not t.d5_used and dmg >= t.hp:   # 不屈装甲
		dmg = max(0.0, t.hp - 1); t.d5_used = true; t.inv_t = 1.5; ev(["guard", t.id])
	if tutorial and by != null and by.team != t.team:
		if not t.bot: dmg = minf(dmg, maxf(0.0, t.hp - 1.0))
		elif not by.bot: tut_hits += 1
	t.hp -= dmg; t.last_hurt = time; t.flash = 1.0
	if by != null and by != t and by.team != t.team:
		var bo = ov_of(by)
		var heal := (dmg * 0.35 if by.poss_t > 0 else 0.0) + (float(bo.hitHeal) if bo != null and bo.has("hitHeal") else 0.0)
		if heal > 0: by.hp = min(max_hp_of(by), by.hp + heal)
		if not by.foot and by.sp_t <= 0 and by.no_sp_until <= time:
			by.sp = min(float(wdata(by).spNeed), by.sp + dmg * (1.3 if by.pilot == "candy" else 1.0) * (float(bo.spGain) if bo != null and bo.has("spGain") else 1.0) * (1.15 if by.tal.has("a3") else 1.0))
		if by.ov_t <= 0 and not by.npc and by.bt >= 1: by.ov = min(float(C.OV_NEED), by.ov + dmg * (1.2 if by.tal.has("s3") else 1.0))
	ev(["dmg", t.id, int(round(dmg)), by.id if by != null else 0])
	if t.hp <= 0:
		if t.boss: boss_down(t, by)
		elif t.foot or t.spirit: kill(t, by)
		else: wreck(t, by)

var _reflecting := false

func on_takedown(by: Mech, t: Mech) -> void:
	if by == null: return
	by.kills += 1
	var bo = ov_of(by)
	if bo != null and bo.has("killCharge"): by.skill_uses = mini(by.skill_max, by.skill_uses + 1)
	if by.tal.has("s4") and by.alive: by.hp = min(max_hp_of(by), by.hp + 15)
	if by.pilot == "blaze": by.hp = min(max_hp_of(by), by.hp + max_hp_of(by) * 0.4)   # 凌焰：越战越勇
	if by.pilot == "kaka" and t != null:   # 卡卡：惊喜礼盒
		add_helper({"kind": "bento", "gift": true, "heal": 0.0, "x": t.x, "y": t.y, "z": top_at(t.x, t.y), "team": by.team, "owner": by, "t": 12.0, "armed": 0.4})

# 机体被打爆：驾驶员弹出，用随身武器继续打；活过 6 秒原地空投新机体
func wreck(t: Mech, by: Mech) -> void:
	if by != null and by != t: on_takedown(by, t)
	paint(t.x, t.y, top_at(t.x, t.y), 55, by.team if by != null else (0 if teams > 2 else 3 - t.team), by)
	t.foot = true; t.hp = float(C.PILOT_HP); t.rebuild_t = 1e9 if one_life else float(C.REBUILD) - (2.0 if t.pilot == "aurora" else 0.0) - (1.0 if t.tal.has("d3") else 0.0)
	t.charge = 0; t.burst_n = 0; t.roll_t = 0; t.sp_t = 0; t.sp_kind = ""; t.shield = 0; t.shield_t = 0; t.quake_t = 0
	var sh := (60.0 if t.pilot == "hammer" else 0.0) + (25.0 if t.tal.has("d2") else 0.0)
	if sh > 0: t.shield = sh; t.shield_t = 6
	t.inv_t = 0.7; t.ammo = float(C.AMMO); t.wheel = false
	ev(["wreck", t.id, by.id if by != null else 0, t.x, t.y, t.z, t.team])
	if t.pilot == "vet": explode(t.x, t.y, t.z, 100, 58, 24, t.team, t)
	knock(t, rng.randf() - 0.5, rng.randf() - 0.5, 150, 300)

func redeploy(p: Mech) -> void:
	p.foot = false; p.hp = p.max_hp; p.ammo = float(C.AMMO); p.inv_t = 1.0; p.rebuild_t = 0; p.d5_used = false
	ev(["mdrop", p.id, p.x, p.y, p.z])
	for t in players:
		if not t.alive or t.team == p.team or dist2d(t, p) > 75: continue
		hurt(t, 20, p, t.x - p.x, t.y - p.y, 6, 150)
	paint(p.x, p.y, p.z, 60, p.team, p)

func kill(t: Mech, by: Mech) -> void:
	t.alive = false; t.hp = 0; t.respawn_t = 1e9 if one_life else float(C.KO_RESPAWN); t.deaths += 1; t.foot = false
	if one_life: t.out = true
	t.charge = 0; t.burst_n = 0; t.roll_t = 0; t.sp_t = 0; t.sp_kind = ""; t.shield = 0
	if t.spirit:
		t.respawn_t = 1e9
		if by != null and by != t and not by.npc: by.spirits += 1
		if mode == "seal":
			for i in int(MC.SEAL.drop): drop_near(t.x, t.y, t.z)
		ev(["ko", t.id, by.id if by != null else 0, t.x, t.y, t.z, t.team])
		return
	drop_items(t)
	if loot: loot_drop_body(t)
	paint(t.x, t.y, top_at(t.x, t.y), 40, by.team if by != null else (0 if teams > 2 else 3 - t.team), by)
	if by != null and by != t: on_takedown(by, t)
	t.sp = floor(t.sp * 0.5)
	ev(["ko", t.id, by.id if by != null else 0, t.x, t.y, t.z, t.team])

func explode(x: float, y: float, z: float, r: float, max_d: float, min_d: float, team: int, owner: Mech, no_los := false) -> void:
	paint(x, y, z, r, team, owner)
	if mode == "park":
		for b in obj.balloons.duplicate():
			if Vector2(b.x - x, b.y - y).length() < r + 16 and absf(b.z - z) < r + 70: pop_balloon(b, team, owner)
	if obj.has("ball") and obj.reset_t <= 0:
		var bl: Dictionary = obj.ball
		var bd := Vector2(bl.x - x, bl.y - y).length()
		if bd < r + bl.r and bd > 0.1 and absf(z) < 60:
			var bk: float = 1.0 - bd / (r + bl.r)
			bl.vx += (bl.x - x) / bd * 700 * bk; bl.vy += (bl.y - y) / bd * 700 * bk; bl.last = team
	for t in players:
		if not t.alive or t.team == team: continue
		var d := Vector3(t.x - x, t.y - y, t.z + 18 - z - 10).length()
		var tr: float = t.rad if t.rad > 0 else float(C.R)
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
	if p.tal.has("s5"):   # 战术掩护
		for a2 in players:
			if a2 != p and a2.alive and a2.team == p.team and dist2d(a2, p) < 200: a2.shield = max(a2.shield, 30.0); a2.shield_t = 4
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
		if domain_blocks(m.team, m.x, m.y, m.z): ev(["block", m.x, m.y, m.z + 10]); continue
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
			"domain": alive_h = update_domain(h)
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
	if nav_w > 0:
		if p.ai_local.size() > 0:
			var d := local_dir(p)
			if d != Vector2.INF: return d
		return coarse_dir(p)
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
	if tutorial: p.inp.mx = 0; p.inp.my = 0; p.inp.f = false; p.inp.w = false; return
	if p.typing_t > 0: p.typing_t -= dt; p.inp.mx = 0; p.inp.my = 0; p.inp.f = false; return
	p.ai_t -= dt
	# 挂机性格：隔一阵子就站着不动几秒
	if p.pz.get("afk", false) and countdown <= 0:
		if p.afk_t > 0:
			p.afk_t -= dt; p.inp.mx = 0; p.inp.my = 0; p.inp.f = false; p.inp.w = false
			return
		p.afk_next -= dt
		if p.afk_next <= 0: p.afk_t = rng.randf_range(4.0, 10.0); p.afk_next = rng.randf_range(15.0, 30.0)
	var w := wdata(p)
	var melee: bool = str(w.attack) == "punch" and not p.foot
	var rng_w := float(side(p).range) if p.foot else float(w.range2)
	var tgt: Mech = null; var td := 1e9
	var blind_r := 180.0 if p.blind_t > 0 else 1e9
	# 交战距离：射程 + 200；逃亡圈里大家更在意捡箱子、躲毒圈，被打了才还手
	var engage: float = minf(760.0, rng_w + 160.0)   # 和网页版一样：射程 + 160 内才会盯上
	if mode in ["escape4", "escape8"] and time - p.last_hurt > 4.0: engage = minf(engage, rng_w * 0.75 + 40.0)
	for e in players:
		if not e.alive or e.team == p.team: continue
		var d := dist2d(e, p)
		if d > engage or d > td or not visible_to(p.team, e): continue
		if p.guard is Dictionary and guard_anchor(p).distance_to(Vector2(e.x, e.y)) > 460 and time - p.last_hurt > 3: continue
		if d < td and d < engage and d < blind_r: td = d; tgt = e
	var inp := p.inp
	inp.j = false
	var hp_k := p.hp / max_hp_of(p)
	if tgt != null and tgt.id == p.ai_tgt: p.ai_seen += dt
	else: p.ai_seen = 0.0; p.ai_tgt = tgt.id if tgt != null else 0
	# 反应时间：刚看到敌人要愣一下才开火（逃亡圈里更谨慎，被打了马上还手）
	if p.pz.is_empty() and D.has("bots"): p.pz = D.bots.personas.decent   # 没指定性格的 AI 按网页版默认的「不错」
	var react := 0.3
	if not p.pz.is_empty(): react = (float(p.pz.react[0]) + float(p.pz.react[1])) * 0.5 + 0.05
	if mode in ["escape4", "escape8"]: react = 0.15 if time - p.last_hurt < 2.0 else 1.1
	var aim_j := 0.06 * (float(p.pz.get("aim", 0.18)) / 0.18)
	# 模式目标：每隔一会儿重新算一次（护送、送电池、躲毒圈、追球……）
	p.ai_mode_t -= dt
	# 弹出的驾驶员（网页版 fleeGoal）：附近有敌人就往反方向跑；没有就去找还有机体的队友抱团，没队友就躲草丛
	if p.foot and not p.npc and not loot and not (p.guard is Dictionary):
		p.flee_t -= dt
		var threat := players.any(func(e): return e.alive and not e.out and e.team != p.team and dist2d(e, p) < 450)
		if p.flee_t <= 0 or (threat and not p.flee_threat) or (p.ai_goal_cell >= 0 and Vector2(p.ai_goal.x - p.x, p.ai_goal.y - p.y).length() < 40):
			p.flee_t = 0.6 if threat else 2.5; p.flee_threat = threat
			set_goal(p, flee_goal(p))
		p.ai_mode_t = 0.5
	elif mode != "turf" and p.ai_mode_t <= 0:
		p.ai_mode_t = rng.randf_range(0.25, 0.4) if mode == "soccer" else rng.randf_range(0.7, 1.1)
		var g = null if keep_goal(p) else mode_goal(p)
		if g != null: set_goal(p, g)
		elif p.ai_urgent: p.ai_urgent = false
	var has_goal: bool = mode != "turf" and (p.ai_goal_cell >= 0 or nav_w > 0)
	# 交战距离（网页版 botThink）：远程 = 射程 ×1.05，近战 / 爱追人的性格至少 300；超出就先按目标走，不硬追
	var fight_r: float = maxf(rng_w * 1.05, 300.0) if (melee or p.pz.get("chase", false)) else rng_w * 1.05
	if tgt != null and td < fight_r and (melee or los(p.x, p.y, p.z + float(C.MUZZLE), tgt.x, tgt.y)):
		var to := Vector2(tgt.x - p.x, tgt.y - p.y)
		var lead := to.length() / 650.0
		var lk := 0.6 * float(p.pz.get("lead", 0.6)) / 0.6
		inp.a = atan2(tgt.y + tgt.vy * lead * lk - p.y, tgt.x + tgt.vx * lead * lk - p.x) + rng.randf_range(-aim_j, aim_j)
		inp.pt = atan2(tgt.z + 16 - (p.z + float(C.MUZZLE)), max(1.0, td))
		inp.ad = td
		var want := rng_w * (0.85 if str(w.attack) == "charge" else (0.35 if melee else 0.7))
		if p.foot: want = rng_w * 0.8
		var dir := to.normalized()
		var mv := Vector2(-dir.y, dir.x) * p.ai_strafe * (0.3 if melee else 0.8)
		if td > want: mv += dir
		elif td < want * 0.6 and not melee: mv -= dir
		if p.foot:   # 驾驶员（网页版）：拿近战武器的冲上去，其他的边退边打
			var perp := Vector2(-dir.y, dir.x) * p.ai_strafe
			if str(side(p).kind) == "melee" and (hp_k > 0.45 or td < 90): mv = dir + perp * 0.3
			else: mv = -dir * 0.7 + perp * 0.6
		if p.ai_urgent and has_goal: mv = field_dir(p) + mv * 0.25   # 目标要紧：边打边走
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
		if p.ai_seen < react: inp.f = false
		if inp.f and not p.pz.is_empty() and rng.randf() > clampf(float(p.pz.fire) / 0.5, 0.35, 1.0): inp.f = false
		var rt := float(p.pz.get("retreat", 0.0))
		if rt > 0 and hp_k < rt and not melee and not p.ai_urgent: inp.mx = -dir.x + mv.x * 0.4; inp.my = -dir.y + mv.y * 0.4
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
		if not p.npc and p.bt >= 1 and p.ov >= float(C.OV_NEED) and p.ov_t <= 0 and td < 320 and rng.randf() < 0.05:
			inp.oq += 1
		return
	# 没有敌人：去涂地
	if has_goal:
		if Vector2(p.ai_goal.x - p.x, p.ai_goal.y - p.y).length() < 30: p.ai_mode_t = min(p.ai_mode_t, 0.1)
	elif p.ai_goal_cell < 0 or Vector2(p.ai_goal.x - p.x, p.ai_goal.y - p.y).length() < 40 or p.ai_t <= -3.0:
		if nav_w == 0: pick_roam(p)
		p.ai_t = 0
	var d := field_dir(p)
	if p.ai_t <= 0:
		p.ai_t = 0.5
		if Vector2(p.x, p.y).distance_to(p.ai_last) < 12: p.ai_stuck += 1
		else: p.ai_stuck = 0
		p.ai_last = Vector2(p.x, p.y)
		if p.ai_stuck >= 3:
			p.ai_stuck = 0; inp.j = true
			if loot: skip_goal(p)
			if has_goal: p.ai_mode_t = 0
			elif nav_w == 0: pick_roam(p)
	inp.mx = d.x; inp.my = d.y
	if mode == "soccer" and not melee:   # 足球：球在自己和对方球门之间就朝球开火
		var b: Dictionary = obj.ball
		var to_ball := Vector2(b.x - p.x, b.y - p.y)
		var to_goal := Vector2((W if p.team == 1 else 0.0) - b.x, H / 2 - b.y).normalized()
		if to_ball.length() < rng_w and to_ball.normalized().dot(to_goal) > 0.55 and p.ammo >= 1:
			inp.a = to_ball.angle(); inp.ad = to_ball.length(); inp.pt = -0.02; inp.f = true; inp.w = false
			return
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

# ================================================================
# 阶段 3：超载技能 + 各种模式（移植 core.js 的 activateOverload / initMode / updateMode / bossThink）
# ================================================================
func base_pos(team: int) -> Vector2:
	return Vector2(6 * CELL if team == 1 else W - 6 * CELL, H / 2)

func goal_for(team: int) -> Vector2:
	var gx := float(M.get("goalX", 24))
	return Vector2((GW - gx) * CELL, H / 2) if team == 1 else Vector2(gx * CELL, H / 2)

func alive_of(team: int) -> int:
	var n := 0
	for p in players:
		if p.team == team and p.alive and not p.out and not p.npc: n += 1
	return n

func open_spot(x: float, y: float, zmax: float = 80.0) -> bool:
	return x > 20 and y > 20 and x < W - 20 and y < H - 20 and not solid_at(x, y) and top_at(x, y) <= zmax

# ---------------- 超载 ----------------
func ov_of(p: Mech):
	return pdata(p).overload if p.ov_t > 0 else null

func activate_overload(p: Mech) -> void:
	var O: Dictionary = pdata(p).overload
	p.ov = 0; p.ov_t = float(C.OV_TIME) + (2.0 if p.bt >= 2 else 0.0) + (2.0 if p.tal.has("s6") else 0.0); p.ov_pulse = 0
	ev(["ov", p.id, p.x, p.y, p.z])
	if O.has("skillReset"): p.skill_cd = 0; p.skill_uses = mini(p.skill_max, p.skill_uses + 1)
	if O.has("stealth"): p.smoke_t = max(p.smoke_t, p.ov_t)
	if O.has("hack"):
		for e in players:
			if e.alive and e.team != p.team and not e.boss:
				e.silence_t = max(e.silence_t, 3.0); e.charge = 0; e.burst_n = 0; e.lock_t = max(e.lock_t, 3.0)
				if e.skill_uses > 0: e.skill_uses -= 1
	for a in players:
		if not a.alive or a.team != p.team: continue
		var d := dist2d(a, p)
		if O.has("burstHeal") and d < 220: a.hp = min(max_hp_of(a), a.hp + float(O.burstHeal)); ev(["heal", a.id, int(O.burstHeal)])
		if O.has("rally") and d < 300: a.rally_t = max(a.rally_t, p.ov_t)
	if O.has("drones"):
		for i in int(O.drones):
			add_helper({"kind": "drone", "x": p.x, "y": p.y, "z": p.z + 40, "team": p.team, "owner": p, "t": p.ov_t, "cd": 0.3 + i * 0.2, "ang": i * PI})
	if O.has("domain"):
		helpers = helpers.filter(func(h): return not (h.kind == "domain" and h.owner == p))
		add_helper({"kind": "domain", "x": p.x, "y": p.y, "z": p.z, "r": float(O.domain.r), "team": p.team, "owner": p, "t": p.ov_t + 0.2, "cd": 99.0, "hits": {}})

func overload_tick(p: Mech, O: Dictionary, dt: float) -> void:
	var k := 1.25 if p.bt >= 2 else 1.0
	if O.has("aura"):
		for a in players:
			if not a.alive or dist2d(a, p) > float(O.aura.r) or absf(a.z - p.z) > 120: continue
			if a.team == p.team: a.hp = min(max_hp_of(a), a.hp + float(O.aura.heal) * k * dt); a.aura_t = 0.3; a.aura_def = float(O.aura.def)
			elif not a.boss: a.dslow_t = max(a.dslow_t, 0.3)
	if O.has("regen"):
		for a in players:
			if a.alive and a.team == p.team and (a == p or (not O.has("burstHeal") and dist2d(a, p) < 200)):
				a.hp = min(max_hp_of(a), a.hp + float(O.regen) * k * dt)
	if O.has("pulse"):
		p.ov_pulse -= dt
		if p.ov_pulse <= 0:
			p.ov_pulse = 1.0
			explode(p.x, p.y, p.z + 10, 180, float(O.pulse) * k, float(O.pulse) * 0.7 * k, p.team, p, true)

func domain_blocks(team: int, x: float, y: float, z: float) -> bool:
	for h in helpers:
		if h.kind == "domain" and h.team != team and Vector2(x - h.x, y - h.y).length() < h.r and absf(z - h.z) < 130: return true
	return false

func update_domain(h: Dictionary) -> bool:
	var ow: Mech = h.owner
	if not ow.alive or ow.foot or ow.ov_t <= 0: return false
	h.x = ow.x; h.y = ow.y; h.z = ow.z
	var Dm: Dictionary = pdata(ow).overload.domain
	for e in players:
		if not e.alive or e.team == h.team: continue
		var dx: float = e.x - h.x; var dy: float = e.y - h.y
		if Vector2(dx, dy).length() > h.r + 8 or absf(e.z - h.z) > 90: continue
		if h.hits.get(e.id, 0.0) > time: continue
		h.hits[e.id] = time + float(Dm.cd)
		e.slow_t = max(e.slow_t, 0.8); e.seal_t = max(e.seal_t, 0.8)
		hurt(e, float(Dm.counter) * (1.25 if ow.bt >= 2 else 1.0), ow, dx if absf(dx) > 0.01 else 1.0, dy, 1.6)
		ev(["dmn", h.id, e.id, h.x, h.y, h.z])
	return true

# ---------------- 模式初始化 ----------------
func init_mode() -> void:
	obj = {"score": [0, 0, 0, 0, 0, 0, 0, 0, 0], "reset_t": 0.0}
	match mode:
		"elim":
			obj.wins = [0, 0, 0]; obj.round = 1; obj.pause = 0.0; obj.round_t = float(MC.ELIM.roundTime); time_left = obj.round_t
		"escape4", "escape8":
			var r0 := Vector2(W, H).length() / 2 + 40
			obj.circle = {"x": W / 2, "y": H / 2, "r": r0, "R0": r0, "from": null, "to": {"x": W / 2, "y": H / 2, "r": r0}, "stage": 0, "phase": 0, "t": float(MC.ESCAPE.stages[0][0]), "T": 1.0}
			obj.crates = []; obj.crate_t = 15.0; obj.elim = []; obj.dmg_t = 0.0
			for i in 10: spawn_crate()
			time_left = 360.0
			spawns = escape_spawns()
		"zone":
			obj.owner = 0; obj.count = [0.0, 100.0, 100.0]; obj.share = [0.0, 0.0, 0.0]
			var Z: Dictionary = MC.ZONE
			for y in range(int(Z.y0), int(Z.y1)):
				for x in range(int(Z.x0), int(Z.x1)):
					if in_bounds(x, y) and solid[y * GW + x] == 0: zone_cells.append(y * GW + x)
		"escort": obj.tr = {"x": W / 2, "y": H / 2, "z": top_at(W / 2, H / 2), "carrier": null, "reset_t": 0.0}
		"soccer": obj.ball = {"x": W / 2, "y": H / 2, "vx": 0.0, "vy": 0.0, "r": 26.0, "last": 0, "acc": 0.0}
		"battery": obj.bats = []; obj.bat_t = 2.0
		"seal": obj.bats = []; obj.bat_t = 2.0; obj.sp_t = 1.5; setup_seal()
		"raid": time_left = float(MC.RAID.time); setup_raid()
		"loot": init_loot()
		"park":
			obj.fl = park_pos(0.0); obj.fl.k = 0.0; obj.fl.own = 0
			obj.balloons = []; obj.bal_t = 1.5; obj.acc = 0.0

func escape_spawns() -> Array:
	var out: Array = [null]
	var cx := W / 2; var cy := H / 2
	var a0 := rng.randf() * TAU
	for t in range(1, teams + 1):
		var a := a0 + float(t - 1) / teams * TAU
		var best = null
		for k in 400:
			var rr := 0.38 + (k % 20) * 0.006
			var aa := a + (1.0 if (k / 20) % 2 == 1 else -1.0) * (k / 40) * 0.05
			var x := cx + cos(aa) * W * rr; var y := cy + sin(aa) * H * rr
			var ok := true
			for o in [Vector2(0, 0), Vector2(34, 20), Vector2(-20, 20), Vector2(20, -20)]:
				if not open_spot(x + o.x, y + o.y, 0.0): ok = false; break
			if ok: best = Vector2(x, y); break
		out.append(best if best != null else base_pos(1 if t % 2 == 1 else 2))
	return out

func spawn_crate() -> void:
	var c: Dictionary = obj.circle
	for k in 60:
		var a := rng.randf() * TAU; var rr: float = sqrt(rng.randf()) * max(60.0, c.r * 0.85)
		var x := clampf(c.x + cos(a) * rr, 40, W - 40); var y := clampf(c.y + sin(a) * rr, 40, H - 40)
		if top_at(x, y) < 200 and not solid_at(x, y):
			obj.crates.append({"id": next_id, "x": x, "y": y, "z": top_at(x, y)}); next_id += 1
			return

func reset_round() -> void:
	obj.round_t = float(MC.ELIM.roundTime); obj.round += 1
	projs = []; shells = []; helpers = []; missiles = []
	for p in players:
		p.out = false; p.sp_t = 0; p.sp_kind = ""; p.ov_t = 0; p.shield = 0; p.shield_t = 0
		p.sp = floor(p.sp * 0.5); p.rebuild_t = 0
		respawn(p); p.inv_t = 2.0
	ev(["rs", obj.round])

func setup_raid() -> void:
	var R: Dictionary = MC.RAID
	var b := add_player(-900, "百目", 2, "aka", "fist", true)
	b.boss = true; b.npc = true; b.rad = float(R.r); b.max_hp = float(R.hp); b.hp = b.max_hp
	b.x = W / 2 + 160; b.y = H / 2; b.z = top_at(b.x, b.y)
	b.boss_ai = {"t": 3.0, "i": 0, "tele": [], "rage": false, "dash": 0.0, "dx": 0.0, "dy": 0.0, "ring": null}
	boss = b
	var mw := ["fist", "bucket", "blaster", "fist"]
	for k in 4:
		var m := add_player(-910 - k, "小咒灵", 2, "raven", mw[k], true)
		m.npc = true; m.spirit = true; m.max_hp = 80; m.alive = false; m.respawn_t = 1e9
		minions.append(m)

func setup_seal() -> void:
	var sw := ["fist", "bucket", "blaster", "flamer", "fist", "gatling"]
	for k in 6:
		var m := add_player(-920 - k, "游荡咒灵", int(MC.SEAL.team), "raven", sw[k], true)
		m.npc = true; m.spirit = true; m.max_hp = 110; m.alive = false; m.respawn_t = 1e9
		spirits.append(m)

func spawn_spirit(m: Mech, pt) -> void:
	if pt == null: return
	m.x = pt.x; m.y = pt.y; m.z = top_at(pt.x, pt.y); m.vx = 0; m.vy = 0; m.vz = 0; m.kx = 0; m.ky = 0
	m.hp = m.max_hp; m.alive = true; m.foot = false; m.inv_t = 0.6; m.ammo = float(C.AMMO); m.respawn_t = 0
	m.guard = Vector2(pt.x, pt.y); m.ai_goal_cell = -1
	ev(["summon", m.id, m.x, m.y, m.z])

func random_open(k: float):
	for n in 40:
		var x := W / 2 + (rng.randf() - 0.5) * W * k; var y := (rng.randi_range(0, GH - 1) + 0.5) * CELL
		if not open_spot(x, y): continue
		if Vector2(x, y).distance_to(base_pos(1)) < 260 or Vector2(x, y).distance_to(base_pos(2)) < 260: continue
		return Vector2(x, y)
	return null

func add_bat(x: float, y: float) -> void:
	obj.bats.append({"id": next_id, "x": x, "y": y, "z": top_at(x, y)}); next_id += 1

func drop_near(x0: float, y0: float, z0: float) -> void:
	var a := rng.randf() * TAU; var r := rng.randf_range(14, 50)
	var x := clampf(x0 + cos(a) * r, 20, W - 20); var y := clampf(y0 + sin(a) * r, 20, H - 20)
	if solid_at(x, y) or top_at(x, y) > z0 + 5: x = x0; y = y0
	add_bat(x, y)

func drop_items(p: Mech) -> void:
	if obj.has("tr") and obj.tr.carrier == p:
		obj.tr.carrier = null; obj.tr.x = p.x; obj.tr.y = p.y; obj.tr.z = top_at(p.x, p.y); ev(["drop", p.id])
	if obj.has("bats") and p.carry > 0:
		for i in p.carry: drop_near(p.x, p.y, p.z)
		p.carry = 0

func boss_down(b: Mech, by: Mech) -> void:
	b.alive = false; b.hp = 0; b.respawn_t = 1e9
	if by != null: by.kills += 1
	paint(b.x, b.y, top_at(b.x, b.y), 140, 1, null)
	ev(["ko", b.id, by.id if by != null else 0, b.x, b.y, b.z, b.team])
	ev(["boss", b.id, "down", b.x, b.y, b.z])
	for m in minions:
		if m.alive: m.alive = false; m.hp = 0; m.respawn_t = 1e9
	finish(1)

func park_pos(k: float) -> Dictionary:
	var P: Array = []
	for q in MC.PARK.path: P.append(Vector2(q[0] * CELL, q[1] * CELL))
	var seg: Array = []; var tot := 0.0
	for i in P.size():
		var l: float = P[i].distance_to(P[(i + 1) % P.size()]); seg.append(l); tot += l
	var d := fposmod(k, 1.0) * tot
	for i in P.size():
		if d <= seg[i]:
			var v: Vector2 = P[i].lerp(P[(i + 1) % P.size()], d / seg[i])
			return {"x": v.x, "y": v.y}
		d -= seg[i]
	return {"x": P[0].x, "y": P[0].y}

func pop_balloon(b: Dictionary, team: int, owner: Mech) -> void:
	if not obj.balloons.has(b): return
	obj.balloons.erase(b)
	if team < 1 or team > 2: return
	if owner != null: owner.obj += 1; owner.balloons += 1
	obj.score[team] += int(MC.PARK.balloon)
	paint(b.x, b.y, top_at(b.x, b.y), 34, team, owner)
	ev(["balloon", b.id, team, b.x, b.y, b.z])
	if obj.score[team] >= int(MC.PARK.target): finish(team)

func balloon_at(x: float, y: float, z: float, r: float):
	if mode != "park": return null
	for b in obj.balloons:
		if Vector3(b.x - x, b.y - y, b.z + 10 - z).length() < r: return b
	return null

func push_ball(p: Mech, x: float, y: float, r: float, power: float) -> void:
	if not obj.has("ball") or obj.reset_t > 0 or p.z > 30: return
	var b: Dictionary = obj.ball
	var d := Vector2(b.x - x, b.y - y).length()
	if d < r + b.r and d > 0.1:
		b.vx += (b.x - x) / d * power * 0.25; b.vy += (b.y - y) / d * power * 0.25; b.last = p.team

func ball_hits_wall(x: float, y: float, r: float) -> bool:
	if top_at(x, y) > 0: return true
	for i in 8:
		var a := i / 8.0 * TAU
		if top_at(x + cos(a) * r, y + sin(a) * r) > 0: return true
	return false

func soccer_goal(team: int) -> void:
	var b: Dictionary = obj.ball
	obj.score[team] += 1
	ev(["goal", team, 0])
	paint(b.x, b.y, 0, 110, team, null)
	b.x = W / 2; b.y = H / 2; b.vx = 0.0; b.vy = 0.0; b.last = 0
	obj.reset_t = 2.0
	if obj.score[team] >= int(MC.SOCCER_TARGET): finish(team)

# ---------------- 模式每帧 ----------------
func update_mode(dt: float) -> void:
	match mode:
		"park": mode_park(dt)
		"elim": mode_elim(dt)
		"escape4", "escape8": mode_escape(dt)
		"zone": mode_zone(dt)
		"escort": mode_escort(dt)
		"soccer": mode_soccer(dt)
		"battery", "seal": mode_stones(dt)
		"loot": update_loot(dt)

func mode_park(dt: float) -> void:
	var PK: Dictionary = MC.PARK
	var fl: Dictionary = obj.fl
	fl.k = fmod(time / float(PK.loop), 1.0)
	var pp := park_pos(fl.k); fl.x = pp.x; fl.y = pp.y
	var n := [0, 0, 0]
	for p in players:
		if p.alive and p.team <= 2 and Vector2(p.x - fl.x, p.y - fl.y).length() < float(PK.r) and p.z < top_at(p.x, p.y) + 60: n[p.team] += 1
	fl.own = 1 if n[1] > n[2] else (2 if n[2] > n[1] else 0)
	obj.acc += dt
	if obj.acc >= float(PK.tick):
		obj.acc -= float(PK.tick)
		if fl.own:
			obj.score[fl.own] += 1
			for q in players:
				if q.alive and q.team == fl.own and Vector2(q.x - fl.x, q.y - fl.y).length() < float(PK.r): q.float_t += float(PK.tick)
			paint(fl.x, fl.y, top_at(fl.x, fl.y), 40, fl.own, null)
			if obj.score[fl.own] >= int(PK.target): finish(fl.own); return
	obj.bal_t -= dt
	if obj.bal_t <= 0 and obj.balloons.size() < int(PK.maxBalloons):
		obj.bal_t = float(PK.balloonT)
		for tries in 20:
			var x := rng.randf_range(120, W - 120); var y := rng.randf_range(100, H - 100)
			if solid_at(x, y): continue
			obj.balloons.append({"id": next_id, "x": x, "y": y, "z": top_at(x, y) + 62, "ph": rng.randf() * 6}); next_id += 1
			break

func mode_elim(dt: float) -> void:
	var E: Dictionary = MC.ELIM
	if obj.pause > 0:
		obj.pause -= dt; time_left = float(E.roundTime)
		if obj.pause <= 0: reset_round()
		return
	obj.round_t -= dt; time_left = max(0.05, obj.round_t)
	var a := alive_of(1); var b := alive_of(2)
	if a > 0 and b > 0 and obj.round_t > 0: return
	var w := 1 if a > b else (2 if b > a else 0)
	if w == 0:
		var ha := 0.0; var hb := 0.0
		for p in players:
			if p.alive and not p.out:
				if p.team == 1: ha += p.hp / max_hp_of(p)
				else: hb += p.hp / max_hp_of(p)
		w = 1 if ha >= hb else 2
	obj.wins[w] += 1
	ev(["rd", w, obj.wins[1], obj.wins[2], obj.round])
	if obj.wins[w] >= int(E.wins): finish(w); return
	obj.pause = float(E.pause)
	for p in players: p.inv_t = float(E.pause) + 2

func mode_escape(dt: float) -> void:
	var c: Dictionary = obj.circle
	var ST: Array = MC.ESCAPE.stages
	c.t -= dt
	if c.phase == 0 and c.t <= 0 and c.stage < ST.size():
		var st: Array = ST[c.stage]
		var nr: float = max(50.0, c.R0 * float(st[2])); var room: float = max(0.0, c.r - nr) * 0.8
		var a := rng.randf() * TAU; var d := rng.randf() * room
		c.from = {"x": c.x, "y": c.y, "r": c.r}
		c.to = {"x": clampf(c.x + cos(a) * d, nr * 0.5 + 60, W - nr * 0.5 - 60), "y": clampf(c.y + sin(a) * d, nr * 0.5 + 60, H - nr * 0.5 - 60), "r": nr}
		c.phase = 1; c.t = float(st[1]); c.T = float(st[1])
		ev(["cz", c.stage])
	elif c.phase == 1:
		var k := clampf(1.0 - c.t / c.T, 0, 1)
		c.x = lerp(float(c.from.x), float(c.to.x), k); c.y = lerp(float(c.from.y), float(c.to.y), k); c.r = lerp(float(c.from.r), float(c.to.r), k)
		if c.t <= 0:
			c.stage += 1
			c.phase = 0 if c.stage < ST.size() else 2
			c.t = float(ST[c.stage][0]) if c.stage < ST.size() else 0.0
	obj.dmg_t -= dt
	if obj.dmg_t <= 0:
		obj.dmg_t = 0.5
		var dps := float(ST[mini(ST.size() - 1, c.stage)][3])
		for p in players:
			if p.alive and not p.out and Vector2(p.x - c.x, p.y - c.y).length() > c.r: p.inv_t = 0; hurt(p, dps * 0.5, null)
	obj.crate_t -= dt
	if obj.crate_t <= 0: obj.crate_t = 16.0; spawn_crate(); spawn_crate(); ev(["cr"])
	var E: Dictionary = MC.ESCAPE
	var keep: Array = []
	for k2 in obj.crates:
		var taken := false
		for p in players:
			if not p.alive or p.out or Vector2(p.x - k2.x, p.y - k2.y).length() > 28 or absf(p.z - k2.z) > 40: continue
			p.cubes = mini(int(E.maxCubes), p.cubes + 1)
			if not p.foot: p.max_hp += round(p.max_hp * float(E.crateHp))
			p.hp = min(max_hp_of(p), p.hp + float(E.crateHeal))
			ev(["crt", p.id, k2.x, k2.y, k2.z, p.cubes]); taken = true; break
		if not taken: keep.append(k2)
	obj.crates = keep
	var alive: Array = []
	for t in range(1, teams + 1):
		if alive_of(t) > 0: alive.append(t)
		elif not obj.elim.has(t):
			var has := false
			for p in players:
				if p.team == t: has = true; break
			if has: obj.elim.append(t); ev(["tout", t, teams - obj.elim.size() + 1])
	if alive.size() <= 1: finish(alive[0] if alive.size() == 1 else (obj.elim[-1] if obj.elim.size() > 0 else 0))

func mode_zone(dt: float) -> void:
	var a := 0; var b := 0
	for i in zone_cells:
		if grid[i] == 1: a += 1
		elif grid[i] == 2: b += 1
	var n: float = max(1, zone_cells.size())
	obj.share = [0.0, a / n, b / n]
	if obj.owner != 1 and a / n >= 0.7: obj.owner = 1; ev(["zn", 1])
	elif obj.owner != 2 and b / n >= 0.7: obj.owner = 2; ev(["zn", 2])
	elif obj.owner != 0 and obj.share[obj.owner] < 0.4: obj.owner = 0; ev(["zn", 0])
	if obj.owner != 0:
		obj.count[obj.owner] -= dt
		if obj.count[obj.owner] <= 0: obj.count[obj.owner] = 0.0; finish(obj.owner)

func mode_escort(dt: float) -> void:
	var tr: Dictionary = obj.tr
	if tr.reset_t > 0:
		tr.reset_t -= dt
		if tr.reset_t <= 0: tr.x = W / 2; tr.y = H / 2; tr.z = top_at(tr.x, tr.y); ev(["trr"])
		return
	if tr.carrier != null:
		var c: Mech = tr.carrier
		if not c.alive: tr.carrier = null; return
		tr.x = c.x; tr.y = c.y; tr.z = c.z
		var g := goal_for(c.team)
		if Vector2(c.x, c.y).distance_to(g) < 52 and c.z < 20:
			obj.score[c.team] += 1
			ev(["goal", c.team, c.id]); c.obj += 1
			paint(g.x, g.y, 0, 110, c.team, c)
			tr.carrier = null; tr.reset_t = 3.0
			if obj.score[c.team] >= int(MC.ESCORT_TARGET): finish(c.team)
	else:
		for p in players:
			if p.alive and not p.npc and Vector2(p.x - tr.x, p.y - tr.y).length() < 30 and absf(p.z - tr.z) < 30:
				tr.carrier = p; ev(["grab", p.id]); break

func mode_soccer(dt: float) -> void:
	var b: Dictionary = obj.ball
	if obj.reset_t > 0: obj.reset_t -= dt; return
	var R := float(C.R)
	for p in players:
		if not p.alive or p.z > b.r * 2: continue
		var dx: float = b.x - p.x; var dy: float = b.y - p.y; var d := Vector2(dx, dy).length(); var mn: float = b.r + R
		if d < mn and d > 0.01:
			var nx := dx / d; var ny := dy / d
			var tx: float = p.x + nx * mn; var ty: float = p.y + ny * mn
			if not ball_hits_wall(tx, ty, b.r): b.x = tx; b.y = ty
			var rel: float = (p.vx - b.vx) * nx + (p.vy - b.vy) * ny
			if rel > 0: b.vx += nx * rel * 1.2; b.vy += ny * rel * 1.2
			b.last = p.team
	var sp := Vector2(b.vx, b.vy).length()
	if sp > 950: b.vx *= 950 / sp; b.vy *= 950 / sp; sp = 950
	var steps := maxi(1, int(ceil(sp * dt / 8.0))); var sdt := dt / steps
	for i in steps:
		var nx2: float = b.x + b.vx * sdt
		if ball_hits_wall(nx2, b.y, b.r): b.vx *= -0.75
		else: b.x = nx2
		var ny2: float = b.y + b.vy * sdt
		if ball_hits_wall(b.x, ny2, b.r): b.vy *= -0.75
		else: b.y = ny2
	var f := exp(-0.9 * dt)
	b.vx *= f; b.vy *= f
	b.acc += sp * dt
	if b.last and sp > 60 and b.acc > 20: b.acc = 0.0; paint(b.x, b.y, 0, 20, b.last, null)
	var G: Dictionary = MC.SOCCER_GOAL
	if absf(b.y - H / 2) < float(G.half):
		if b.x < float(G.depth): soccer_goal(2)
		elif b.x > W - float(G.depth): soccer_goal(1)

# 电池掠夺 / 封印争夺：捡东西送回基地
func mode_stones(dt: float) -> void:
	var seal := mode == "seal"
	var SE: Dictionary = MC.SEAL
	var cap := int(SE.carry) if seal else 5
	var target := int(SE.target) if seal else int(MC.BATTERY_TARGET)
	obj.bat_t -= dt
	if seal:
		if obj.bat_t <= 0 and obj.bats.size() < int(SE.stoneMax):
			obj.bat_t = float(SE.stoneT)
			var pt = random_open(0.55)
			if pt != null: add_bat(pt.x, pt.y)
		obj.sp_t -= dt
		if obj.sp_t <= 0:
			obj.sp_t = float(SE.spiritT)
			var n_alive := 0; var free: Mech = null
			for q in spirits:
				if q.alive: n_alive += 1
				elif free == null: free = q
			if free != null and n_alive < int(SE.spiritMax): spawn_spirit(free, random_open(0.6))
	elif obj.bat_t <= 0 and obj.bats.size() < 12:
		obj.bat_t = 1.4
		var pt2 = random_open(0.9)
		if pt2 != null: add_bat(pt2.x, pt2.y)
	for p in players:
		if not p.alive or p.npc: continue
		if p.carry < cap:
			for i in range(obj.bats.size() - 1, -1, -1):
				var bt: Dictionary = obj.bats[i]
				if Vector2(bt.x - p.x, bt.y - p.y).length() < 28 and absf(bt.z - p.z) < 30:
					p.carry += 1; obj.bats.remove_at(i); ev(["bp", p.id])
					if p.carry >= cap: break
		if p.carry > 0 and Vector2(p.x, p.y).distance_to(base_pos(p.team)) < 120:
			obj.score[p.team] += p.carry
			ev(["dep", p.id, p.carry]); p.obj += p.carry
			if seal: p.seals += p.carry
			p.carry = 0
			if obj.score[p.team] >= target: finish(p.team); return

# ---------------- 百目（咒灵讨伐的 Boss） ----------------
func boss_think(b: Mech, dt: float) -> void:
	if not b.alive: return
	var A: Dictionary = b.boss_ai; var inp: Dictionary = b.inp; var R: Dictionary = MC.RAID
	var rage: bool = b.hp < b.max_hp * float(R.rage)
	if rage and not A.rage: A.rage = true; A.t = min(A.t, 0.8); ev(["boss", b.id, "rage", b.x, b.y, b.z])
	var foes: Array = []
	for q in players:
		if q.alive and q.team != b.team and not q.npc: foes.append(q)
	var tgt: Mech = null; var td := 1e9
	for q in foes:
		var d := dist2d(q, b)
		if d < td: td = d; tgt = q
	var mx := 0.0; var my := 0.0
	if A.dash > 0:
		A.dash -= dt; mx = A.dx; my = A.dy
		contact_damage(b, b.x, b.y, b.rad + 16, 45.0 if rage else 35.0, 0.6)
		paint(b.x, b.y, b.z, 46, b.team, null)
	elif tgt != null and td > 110: mx = (tgt.x - b.x) / td * 0.5; my = (tgt.y - b.y) / td * 0.5
	var hd := Vector2(b.x - W / 2, b.y - H / 2).length()
	if hd > 460 and A.dash <= 0: mx = (W / 2 - b.x) / hd * 0.6; my = (H / 2 - b.y) / hd * 0.6
	inp.mx = mx; inp.my = my; inp.f = false; inp.w = A.dash > 0; inp.j = false
	if tgt != null: inp.a = atan2(tgt.y - b.y, tgt.x - b.x)
	var keep: Array = []
	for T in A.tele:
		T.t -= dt
		if T.t > 0: keep.append(T); continue
		explode(T.x, T.y, T.z + 6, T.r, 72.0 if rage else 58.0, 24, b.team, b, true)
	A.tele = keep
	if A.ring != null:
		A.ring.t -= dt
		if A.ring.t <= 0:
			A.ring.t = 0.35; A.ring.n -= 1
			var N := 22 if rage else 18; var off := rng.randf() * 0.3
			for i in N:
				spawn_proj(b, float(i) / N * TAU + off, 0.02, 360, 560, 15.0 if rage else 12.0, 22, 0, 9, Vector4(b.x, b.y, b.z + 40, b.rad + 4), {})
			if A.ring.n <= 0: A.ring = null
	A.t -= dt * (1.45 if rage else 1.0)
	if A.t > 0 or foes.is_empty(): return
	var seq := ["slam", "ring", "summon", "slam", "dash", "ring"]
	var mv: String = seq[A.i % seq.size()]; A.i += 1
	var alive_m := 0
	for m in minions:
		if m.alive: alive_m += 1
	if mv == "summon" and alive_m >= 3: mv = "slam"
	match mv:
		"slam":
			var pick := foes.duplicate(); pick.shuffle()
			for q in pick.slice(0, mini(3 if rage else 2, pick.size())):
				var T := {"x": clampf(q.x + q.vx * 0.4, 20, W - 20), "y": clampf(q.y + q.vy * 0.4, 20, H - 20), "z": top_at(q.x, q.y), "r": 115.0, "t": 1.15}
				A.tele.append(T); ev(["tg", T.x, T.y, T.z, T.r, T.t])
			A.t = 2.6
		"ring":
			A.ring = {"n": 3 if rage else 2, "t": 0.5}; ev(["boss", b.id, "ring", b.x, b.y, b.z]); A.t = 3.2
		"summon":
			var n := 3 if rage else 2
			for m in minions:
				if m.alive or n <= 0: continue
				var a := rng.randf() * TAU
				var x := clampf(b.x + cos(a) * 90, 30, W - 30); var y := clampf(b.y + sin(a) * 90, 30, H - 30)
				if solid_at(x, y): continue
				spawn_spirit(m, Vector2(x, y)); m.guard = null; n -= 1
			ev(["boss", b.id, "summon", b.x, b.y, b.z]); A.t = 3.0
		"dash":
			var far: Mech = null; var fd := -1.0
			for q in foes:
				var d2 := dist2d(q, b)
				if d2 > fd: fd = d2; far = q
			if far != null:
				var l: float = max(1.0, fd)
				A.dx = (far.x - b.x) / l; A.dy = (far.y - b.y) / l; A.dash = 1.0
				knock(b, A.dx, A.dy, 640, 0); ev(["boss", b.id, "dash", b.x, b.y, b.z])
			A.t = 2.8

# ---------------- AI：各模式的目标点 ----------------
func mode_goal(p: Mech):
	p.ai_urgent = false
	if p.spirit:
		if mode == "raid":
			var best: Mech = null; var bd := 1e9
			for q in players:
				if q.alive and q.team != p.team and not q.npc and dist2d(q, p) < bd: bd = dist2d(q, p); best = q
			return Vector2(best.x, best.y) if best != null else null
		if p.guard != null: return p.guard + Vector2(rng.randf_range(-90, 90), rng.randf_range(-90, 90))
		return null
	if loot: return loot_goal(p)
	match mode:
		"park":
			var best = null; var bd := 420.0
			for b in obj.balloons:
				var d := Vector2(b.x - p.x, b.y - p.y).length()
				if d < bd: bd = d; best = b
			if best != null and (p.slot % 2 == 1 or rng.randf() < 0.3): return Vector2(best.x, best.y)
			var ah := park_pos(obj.fl.k + 0.03)
			return Vector2(clampf(ah.x + rng.randf_range(-50, 50), 40, W - 40), clampf(ah.y + rng.randf_range(-50, 50), 40, H - 40))
		"escape4", "escape8":
			var c: Dictionary = obj.circle; var safe: Dictionary = c.to if c.to != null else c
			if Vector2(p.x - safe.x, p.y - safe.y).length() > safe.r * 0.75:
				p.ai_urgent = Vector2(p.x - c.x, p.y - c.y).length() > c.r * 0.9
				return Vector2(safe.x, safe.y)
			var best2 = null; var bd2 := 520.0
			for k in obj.crates:
				var d := Vector2(k.x - p.x, k.y - p.y).length()
				if d < bd2 and Vector2(k.x - safe.x, k.y - safe.y).length() < safe.r: bd2 = d; best2 = Vector2(k.x, k.y)
			if best2 != null: return best2
			var a := rng.randf() * TAU; var rr: float = rng.randf() * safe.r * 0.6
			return Vector2(clampf(safe.x + cos(a) * rr, 40, W - 40), clampf(safe.y + sin(a) * rr, 40, H - 40))
		"zone":
			if rng.randf() < 0.75:
				var Z: Dictionary = MC.ZONE
				return Vector2(rng.randf_range(float(Z.x0) + 1, float(Z.x1) - 1) * CELL, rng.randf_range(float(Z.y0) + 1, float(Z.y1) - 1) * CELL)
		"escort":
			var tr: Dictionary = obj.tr
			if tr.reset_t > 0: return Vector2(W / 2 + rng.randf_range(-120, 120), H / 2 + rng.randf_range(-120, 120))
			if tr.carrier == p: p.ai_urgent = true; return goal_for(p.team)
			if tr.carrier != null:
				var cm: Mech = tr.carrier
				if cm.team == p.team:
					var gl := goal_for(p.team)
					return Vector2(cm.x + (gl.x - cm.x) * 0.35, cm.y + (gl.y - cm.y) * 0.35)
				p.ai_urgent = true
				return Vector2(cm.x, cm.y)
			p.ai_urgent = dist2d(p, tr) < 300
			return Vector2(tr.x, tr.y)
		"soccer":
			var b: Dictionary = obj.ball
			var gx := W if p.team == 1 else 0.0
			var dv := Vector2(gx - b.x, H / 2 - b.y).normalized()
			var own_gx := 0.0 if p.team == 1 else W
			if p.slot == 3 and absf(b.x - own_gx) < W * 0.45: return Vector2(own_gx + (120 if p.team == 1 else -120), clampf(b.y, H / 2 - 120, H / 2 + 120))
			p.ai_urgent = true
			var to_b := Vector2(b.x - p.x, b.y - p.y)
			if to_b.length() < 120 and to_b.normalized().dot(dv) > 0.5: return Vector2(b.x, b.y) + dv * 90   # 已经在球后面：带球往前冲
			return Vector2(b.x, b.y) - dv * 80
		"seal", "battery":
			if p.carry >= 3 or (p.carry > 0 and obj.bats.is_empty()): p.ai_urgent = p.carry >= 3; return base_pos(p.team)
			var best3 = null; var bd3 := 1e9
			for bt in obj.bats:
				var d := Vector2(bt.x - p.x, bt.y - p.y).length() + rng.randf() * 120
				if d < bd3: bd3 = d; best3 = Vector2(bt.x, bt.y)
			if mode == "seal":
				for s in spirits:
					if s.alive and dist2d(s, p) + 160 < bd3: bd3 = dist2d(s, p) + 160; best3 = Vector2(s.x, s.y)
			return best3
		"raid":
			if boss != null and boss.alive and p.team == 1:
				var a2 := float(p.slot) / 4.0 * TAU + time * 0.15
				var w := wdata(p)
				var rr2 := 330.0 if p.weapon in ["charger", "mortar", "prism"] else (70.0 if str(w.attack) == "punch" else 210.0)
				return Vector2(clampf(boss.x + cos(a2) * rr2, 40, W - 40), clampf(boss.y + sin(a2) * rr2, 40, H - 40))
	return null

func set_goal(p: Mech, g: Vector2) -> void:
	if nav_w > 0:   # 超大地图：粗导航格，同一个目标格的导航场大家共用
		p.ai_goal = g
		if p.guard != null: p.ai_field = PackedInt32Array(); return   # 守卫就在岗位附近：直接走过去
		if Vector2(p.x, p.y).distance_to(g) < 900 and field_budget > -2:
			field_budget -= 1
			local_field(p, g)
			var bx := int(p.x / CELL) - p.ai_local_org.x; var by := int(p.y / CELL) - p.ai_local_org.y
			var reach: bool = p.ai_local.size() > 0 and bx >= 0 and by >= 0 and bx < LW and by < LW and p.ai_local[by * LW + bx] >= 0
			if not reach and loot: skip_goal(p)
			return
		p.ai_local = PackedInt32Array()
		var ci := clampi(int(g.y / CELL) / NC, 0, nav_h - 1) * nav_w + clampi(int(g.x / CELL) / NC, 0, nav_w - 1)
		if ci != p.ai_goal_cell and (field_cache.has(ci) or field_budget > 0):
			if not field_cache.has(ci): field_budget -= 1
			p.ai_goal_cell = ci; p.ai_field = coarse_field(ci)
		return
	var cx := clampi(int(g.x / CELL), 0, GW - 1); var cy := clampi(int(g.y / CELL), 0, GH - 1)
	var i := cy * GW + cx
	if not walkable(i):   # 目标格子走不到：找附近能走的格子
		for r in range(1, 6):
			var found := false
			for dy in range(-r, r + 1):
				for dx in range(-r, r + 1):
					if in_bounds(cx + dx, cy + dy) and walkable((cy + dy) * GW + cx + dx): i = (cy + dy) * GW + cx + dx; found = true; break
				if found: break
			if found: break
	p.ai_goal = g
	if i != p.ai_goal_cell:
		p.ai_goal_cell = i
		p.ai_field = build_field(i)

# 这个模式下 8 个（讨伐是 4 个）玩家位置各属于哪一队；第一个位置是真人玩家
func team_layout() -> Array: return Sim.layout_for(mode, teams)

func flee_goal(p: Mech) -> Vector2:
	var ex := 0.0; var ey := 0.0; var n := 0
	for e in players:
		if e.alive and not e.out and e.team != p.team and dist2d(e, p) < 450: ex += e.x; ey += e.y; n += 1
	if n == 0:
		var best = null; var bd := INF
		for a in players:
			if a != p and a.alive and not a.out and not a.foot and a.team == p.team:
				var d := dist2d(a, p)
				if d < bd: bd = d; best = a
		if best != null: return Vector2(best.x + (rng.randf_range(-30, 30) if bd > 70 else 0.0), best.y + (rng.randf_range(-30, 30) if bd > 70 else 0.0))
		for k in 40:
			var i := rng.randi() % (GW * GH)
			if bush[i] == 1:
				var bx := (i % GW + 0.5) * CELL; var by := (i / GW + 0.5) * CELL
				if Vector2(bx - p.x, by - p.y).length() < 700: return Vector2(bx, by)
		return Vector2(clampf(p.x + rng.randf_range(-300, 300), 40, W - 40), clampf(p.y + rng.randf_range(-300, 300), 40, H - 40))
	ex /= n; ey /= n
	var dx := p.x - ex; var dy := p.y - ey
	for k in 12:
		var d := 200.0 + k * 20; var a := atan2(dy, dx) + rng.randf_range(-0.6, 0.6)
		var x := clampf(p.x + cos(a) * d, 40, W - 40); var y := clampf(p.y + sin(a) * d, 40, H - 40)
		if top_at(x, y) == 0: return Vector2(x, y)
	var l := maxf(1.0, Vector2(dx, dy).length())
	return Vector2(clampf(p.x + dx / l * 200, 40, W - 40), clampf(p.y + dy / l * 200, 40, H - 40))

# 逃亡圈：随机选的目标点还有效（在安全区里、还没走到）就继续走，不要每秒重选（网页版也是走到了才换）
func keep_goal(p: Mech) -> bool:
	if not mode in ["escape4", "escape8"] or p.ai_goal_cell < 0: return false
	var c: Dictionary = obj.circle; var safe: Dictionary = c.to if c.to != null else c
	var me_in: bool = Vector2(p.x - safe.x, p.y - safe.y).length() <= float(safe.r) * 0.75
	var goal_in: bool = Vector2(p.ai_goal.x - safe.x, p.ai_goal.y - safe.y).length() <= float(safe.r) * 0.8
	return me_in and goal_in and Vector2(p.ai_goal.x - p.x, p.ai_goal.y - p.y).length() > 40

static func layout_for(mode: String, teams: int) -> Array:
	if mode == "raid": return [1, 1, 1, 1]
	if mode == "loot": return [1, 1, 1, 2, 2, 2, 3, 3, 3, 4, 4, 4, 5, 5, 5, 6, 6, 6]
	if teams > 2:
		var size := 8 / teams
		var out: Array = []
		for i in 8: out.append(1 + i / size)
		return out
	return [1, 1, 1, 1, 2, 2, 2, 2]

# ================================================================
# 搜刮撤离（移植 core.js 的 makeCont / updateLoot / extract / 守卫 / Boss 小队）
# ================================================================
const NC := 8                       # 超大地图的粗导航格：8×8 小格合成 1 格
var nav_w := 0
var nav_h := 0
var nav_ok := PackedByteArray()
var field_cache := {}
var field_budget := 0

func build_nav() -> void:
	nav_w = (GW + NC - 1) / NC; nav_h = (GH + NC - 1) / NC
	nav_ok.resize(nav_w * nav_h)
	for ny in nav_h:
		for nx in nav_w:
			var n := 0
			for dy in NC:
				for dx in NC:
					var cx := nx * NC + dx; var cy := ny * NC + dy
					if in_bounds(cx, cy) and solid[cy * GW + cx] == 0 and top[cy * GW + cx] <= 90: n += 1
			nav_ok[ny * nav_w + nx] = 1 if n >= 20 else 0

func coarse_field(goal: int) -> PackedInt32Array:
	if field_cache.has(goal): return field_cache[goal]
	var f := PackedInt32Array(); f.resize(nav_w * nav_h); f.fill(-1)
	if goal < 0 or goal >= f.size(): return f
	var q := PackedInt32Array([goal]); f[goal] = 0
	var head := 0
	while head < q.size():
		var c := q[head]; head += 1
		var cx := c % nav_w; var cy := c / nav_w
		for dd in [Vector2i(1, 0), Vector2i(-1, 0), Vector2i(0, 1), Vector2i(0, -1)]:
			var nx: int = cx + dd.x; var ny: int = cy + dd.y
			if nx < 0 or ny < 0 or nx >= nav_w or ny >= nav_h: continue
			var ni := ny * nav_w + nx
			if f[ni] >= 0 or nav_ok[ni] == 0: continue
			f[ni] = f[c] + 1; q.append(ni)
	if field_cache.size() > 80: field_cache.clear()
	field_cache[goal] = f
	return f

func coarse_dir(p: Mech) -> Vector2:
	var cx := int(p.x / CELL) / NC; var cy := int(p.y / CELL) / NC
	var f := p.ai_field
	if f.size() != nav_w * nav_h or cx < 0 or cy < 0 or cx >= nav_w or cy >= nav_h: return Vector2(p.ai_goal.x - p.x, p.ai_goal.y - p.y).normalized()
	var here := f[cy * nav_w + cx]
	if here <= 0: return Vector2(p.ai_goal.x - p.x, p.ai_goal.y - p.y).normalized()
	var best := Vector2i(-99, -99); var bv := here
	for dd in [Vector2i(1, 0), Vector2i(-1, 0), Vector2i(0, 1), Vector2i(0, -1), Vector2i(1, 1), Vector2i(-1, 1), Vector2i(1, -1), Vector2i(-1, -1)]:
		var nx: int = cx + dd.x; var ny: int = cy + dd.y
		if nx < 0 or ny < 0 or nx >= nav_w or ny >= nav_h: continue
		var v := f[ny * nav_w + nx]
		if v >= 0 and v < bv:
			if dd.x != 0 and dd.y != 0 and (f[cy * nav_w + nx] < 0 or f[ny * nav_w + cx] < 0): continue
			bv = v; best = Vector2i(nx, ny)
	if best.x < -50: return Vector2(p.ai_goal.x - p.x, p.ai_goal.y - p.y).normalized()
	var tgt := Vector2((best.x + 0.5) * NC * CELL, (best.y + 0.5) * NC * CELL)
	return (tgt - Vector2(p.x, p.y)).normalized()

# ---------------- 物资 / 背包 ----------------
func item_def(k: String) -> Dictionary: return D.loot.items[k]
func loot_value(keys: Array) -> int:
	var v := 0
	for k in keys: v += int(D.loot.items[k].v) if D.loot.items.has(k) else 0
	return v
func inv_keys(inv: Dictionary) -> Array: return inv.items.map(func(it): return it.k)
func inv_cells(inv: Dictionary) -> int:
	var n := 0
	for it in inv.items: n += int(it.w) * int(it.h)
	return n

func roll_loot(tier: int, high: bool, kinds = null) -> String:
	var w: Array = D.loot.tiers.get(str(clampi(tier, 1, 6)), D.loot.tiers["1"])
	var tot := 0.0
	for x in w: tot += float(x)
	var x := rng.randf() * tot; var r := 1
	for i in range(1, w.size()):
		x -= float(w[i])
		if x < 0: r = i; break
	if high and r < 6 and rng.randf() < 0.3: r += 1
	var pool: Array = D.loot.keys.filter(func(k): return int(D.loot.items[k].r) == r)
	if kinds != null:
		var near: Array = kinds.filter(func(k): return D.loot.items.has(k) and absi(int(D.loot.items[k].r) - r) <= 1)
		if not near.is_empty(): pool = near
	return pool[rng.randi() % pool.size()]

# 在网格背包里找放得下的位置（可以旋转）
func inv_place(inv: Dictionary, k: String) -> bool:
	var it := item_def(k)
	var occ := {}
	for e in inv.items:
		for yy in int(e.h):
			for xx in int(e.w): occ[Vector2i(int(e.x) + xx, int(e.y) + yy)] = true
	for rot in [false, true]:
		var w: int = int(it.h) if rot else int(it.w); var h: int = int(it.w) if rot else int(it.h)
		for y in range(0, int(inv.h) - h + 1):
			for x in range(0, int(inv.w) - w + 1):
				var free := true
				for yy in h:
					for xx in w:
						if occ.has(Vector2i(x + xx, y + yy)): free = false; break
					if not free: break
				if free:
					inv.items.append({"k": k, "x": x, "y": y, "w": w, "h": h}); return true
	return false

func make_cont(type: String, x: float, y: float, tier: int, hi: bool, keys = null) -> Dictionary:
	var CT: Dictionary = D.loot.conts.get(type, {"n": [1, 2]})
	var items: Array = []
	if keys != null: items = keys
	else:
		var n := rng.randi_range(int(CT.n[0]), int(CT.n[1])) + (1 if hi else 0)
		for i in n: items.append(roll_loot(tier + int(CT.get("bump", 0)), hi, CT.get("kinds")))
	var c := {"id": next_id, "type": type, "x": x, "y": y, "z": top_at(x, y), "tier": tier, "items": items, "rev": 0}
	next_id += 1
	obj.conts.append(c); obj.cont_map[c.id] = c
	return c

func can_reach(p: Mech, c: Dictionary) -> bool:
	return Vector2(p.x - c.x, p.y - c.y).length() < float(D.loot.openR) and absf(p.z - c.z) < 60

func search_need(c: Dictionary, p: Mech) -> float:
	var k: String = c.items[mini(int(c.rev), c.items.size() - 1)]
	var r := int(D.loot.items[k].r) if D.loot.items.has(k) else 1
	return float(D.loot.search[r]) * (0.7 if c.type == "body" else 1.0) * (0.85 if p.pilot == "raven" else (0.8 if p.pilot == "hawk" else 1.0))

func ex_open(e: Dictionary) -> bool: return time >= float(e.open) and time < float(e.close)

func init_loot() -> void:
	loot = true; teams = 6; one_life = true
	var L: Dictionary = M.loot; var hi := risk == "high"
	obj.conts = []; obj.cont_map = {}; obj.banked = {}; obj.paid = {}; obj.score = [0, 0, 0, 0, 0, 0, 0, 0, 0]
	for c in L.get("conts", []): make_cont(str(c[2]), (c[0] + 0.5) * CELL, (c[1] + 0.5) * CELL, int(c[3]), hi)
	for sp in L.get("spots", []):
		var ks: Array = []
		for i in int(sp[3]) * (2 if hi else 1): ks.append(roll_loot(int(sp[2]), hi))
		make_cont("duffel", (sp[0] + 0.5) * CELL, (sp[1] + 0.5) * CELL, int(sp[2]), hi, ks)
	var opens: Array = D.loot.opens.duplicate(); opens.shuffle()
	var ni := 0; var E2: Dictionary = D.loot.ext
	obj.ex = []
	for e in L.extract:
		var type: String = e[2] if E2.has(e[2]) else "normal"
		var ex := {"x": e[0] * CELL, "y": e[1] * CELL, "type": type, "open": 0.0, "close": 1e9, "told": false}
		if type == "normal": ex.open = float(opens[ni % opens.size()]); ni += 1
		if type == "timed": ex.open = float(E2.timed.from); ex.close = float(E2.timed.to)
		if type == "lever": ex.open = 1e9; ex.close = 0.0
		obj.ex.append(ex)
	obj.lever = {"x": (L.lever[0] + 0.5) * CELL, "y": (L.lever[1] + 0.5) * CELL, "on": false} if L.has("lever") and L.lever != null else null
	time_left = float(D.loot.duration)
	spawns = [null]
	for t in range(1, 7): spawns.append(Vector2(L.spawns[(t - 1) % L.spawns.size()][0] * CELL, L.spawns[(t - 1) % L.spawns.size()][1] * CELL))

# 中立守卫（守中间的高级物资）+ 灰石指挥官 Boss 小队（在城区之间巡逻）
func setup_loot_guards(bot_lv: int) -> void:
	obj.bot_lv = bot_lv
	var L: Dictionary = M.loot; var gt := int(D.loot.guardTeam)
	var gw := ["bucket", "riot", "blaster", "fist", "roller", "flamer"]
	var k := 0
	for g in L.get("guards", []):
		var hv: bool = str(g[2]) == "hv"
		var pl: String = D.pilotOrder[rng.randi() % D.pilotOrder.size()]
		var m := add_player(-500 - k, "灰石重装卫兵" if hv else "守卫机兵", gt, pl, gw[k % gw.size()], true, {"lv": clampi(bot_lv + (2 if hv else 1), 1, 11), "bt": 1})
		m.npc = true; m.guard = {"x": g[0] * CELL, "y": g[1] * CELL, "hv": hv}
		if hv: m.max_hp = round(m.max_hp * 1.4)
		respawn(m)
		k += 1
	var route: Array = L.get("bossRoute", []).map(func(q): return Vector2(q[0] * CELL, q[1] * CELL))
	if route.is_empty(): return
	var b := add_player(-990, "灰石指挥官 • 铁卫", gt, "han", "wrecker", true, {"lv": clampi(bot_lv + 3, 1, 11), "bt": 2})
	b.npc = true; b.loot_boss = true; b.guard = {"x": route[0].x, "y": route[0].y, "route": route, "ri": 0}; b.max_hp = round(b.max_hp * 3.2)
	respawn(b)
	var ew := ["riot", "charger", "gatling"]
	for i in 3:
		var e := add_player(-991 - i, "铁卫护卫", gt, D.pilotOrder[rng.randi() % D.pilotOrder.size()], ew[i], true, {"lv": clampi(bot_lv + 2, 1, 11), "bt": 2})
		e.npc = true; e.guard = {"x": route[0].x + (i - 1) * 40, "y": route[0].y + 40, "follow": b}; e.max_hp = round(e.max_hp * 1.5)
		respawn(e)

func guard_anchor(p: Mech) -> Vector2:
	var G: Dictionary = p.guard
	if G.has("follow") and G.follow.alive: return Vector2(G.follow.x, G.follow.y)
	if G.has("route"):
		var tgt: Vector2 = G.route[int(G.ri) % G.route.size()]
		if Vector2(p.x, p.y).distance_to(tgt) < 120: G.ri = int(G.ri) + 1
		return G.route[int(G.ri) % G.route.size()]
	return Vector2(G.x, G.y)

func update_loot(dt: float) -> void:
	var LT: Dictionary = D.loot
	for p in players:
		if not p.alive or p.out or p.guard != null: continue
		if p.kit > 0 and p.hp < max_hp_of(p) * 0.3 and not p.foot: p.kit = 0; p.hp = min(max_hp_of(p), p.hp + 60); ev(["heal", p.id, 60])
		# AI：走到目标容器旁边就打开
		if p.bot and p.open_c == 0 and p.ai_cont != 0 and obj.cont_map.has(p.ai_cont):
			var gc: Dictionary = obj.cont_map[p.ai_cont]
			if can_reach(p, gc):
				if gc.items.is_empty(): p.ai_done[gc.id] = true; p.ai_cont = 0; p.ai_mode_t = 0
				else: p.open_c = gc.id; p.srch = 0
		if p.open_c != 0:
			var c = obj.cont_map.get(p.open_c)
			if c == null or not can_reach(p, c): p.open_c = 0
			elif int(c.rev) < c.items.size():
				p.srch += dt
				if p.srch >= search_need(c, p): c.rev = int(c.rev) + 1; p.srch = 0; ev(["srch", p.id, c.id])
			elif p.bot:
				p.pick_t -= dt
				if p.pick_t <= 0:
					p.pick_t = 0.35
					if not bot_take(p, c): p.open_c = 0; p.ai_done[c.id] = true; p.ai_cont = 0; p.ai_mode_t = 0
		# 撤离：站在开放的撤离点里读条，挨打会倒退
		var in_ex = null
		for e in obj.ex:
			if not ex_open(e) or Vector2(p.x - e.x, p.y - e.y).length() >= float(LT.extR): continue
			if e.type == "weight" and inv_cells(p.inv) > int(LT.ext.weight.max): continue
			in_ex = e; break
		if in_ex != null:
			var hurt_recent: bool = time - p.last_hurt < 1.0
			p.ex_t = max(0.0, p.ex_t - dt * 1.5) if hurt_recent else p.ex_t + dt
			if p.ex_t >= float(LT.extTime): extract(p, in_ex)
		else: p.ex_t = max(0.0, p.ex_t - dt * 2)
		# 拉闸：电闸附近站 3 秒，拉闸撤离点开放 150 秒
		if obj.lever != null and not obj.lever.on and Vector2(p.x - obj.lever.x, p.y - obj.lever.y).length() < 50:
			obj.lever.on = true
			for e in obj.ex:
				if e.type == "lever": e.open = time; e.close = time + float(LT.ext.lever.open)
			ev(["lever", p.id])
	for e in obj.ex:
		if not e.told and ex_open(e): e.told = true; ev(["exo", e.x, e.y])
	if tick_n % 30 == 0: loot_reinforce()   # 2.1.1：全灭的小队位置由 AI 增援小队补上
	var humans_left := 0; var any_human := false; var squads_left := 0
	for p in players:
		if p.guard != null: continue
		if not p.bot: any_human = true; if not p.out: humans_left += 1
		if not p.out: squads_left += 1
	if (any_human and humans_left == 0) or squads_left == 0: finish(-1)

# ---- 消耗品（2.1.1）：急救针 / 护盾电池 / 肾上腺素 / 维修包 ----
func use_item(p: Mech, from_safe: bool, idx: int) -> bool:
	var inv: Dictionary = p.safe if from_safe else p.inv
	if not p.alive or idx < 0 or idx >= inv.items.size() or p.use_t > time: return false
	var k: String = inv.items[idx].k
	var U = D.loot.items.get(k, {}).get("use")
	if U == null: return false
	inv.items.remove_at(idx); p.use_t = time + 1.0
	if U.has("heal"): p.hp = min(max_hp_of(p), p.hp + float(U.heal))
	if U.has("shield"): p.shield = max(p.shield, float(U.shield)); p.shield_t = max(p.shield_t, 10.0)
	if U.has("rush"): p.rush_t = max(p.rush_t, float(U.rush))
	ev(["use", p.id, k])
	return true

# ---- 中途增援（2.1.1）：小队全灭 25 秒后，AI 增援小队从离活人最远的出生点空降进场 ----
func loot_slots() -> Dictionary:
	if not obj.has("wiped"): obj.wiped = {}
	for t in range(1, teams + 1):
		if obj.wiped.has(t): continue
		var n := 0; var out_n := 0
		for p in players:
			if p.team == t and p.guard == null: n += 1; out_n += 1 if p.out else 0
		if n > 0 and out_n == n: obj.wiped[t] = time
	return obj.wiped

func loot_reinforce() -> void:
	var LT: Dictionary = D.loot
	var w := loot_slots()
	for t in w.keys():
		if int(obj.get("joins", 0)) >= int(LT.maxJoins) or time_left < float(LT.joinMin) * 0.8: break
		if time - float(w[t]) >= float(LT.botJoinWait): add_late_squad(int(t))

func add_late_squad(t: int) -> Array:
	obj.joins = int(obj.get("joins", 0)) + 1; obj.wiped.erase(t)
	var best := Vector2.ZERO; var bd := -1.0
	for sp in M.loot.spawns:
		var sv := Vector2(sp[0] * CELL, sp[1] * CELL); var d := 1e9
		for p in players:
			if p.alive and not p.out and p.guard == null: d = minf(d, sv.distance_to(Vector2(p.x, p.y)))
		if d > bd: bd = d; best = sv
	spawns[t] = best
	var lv: int = int(obj.get("bot_lv", 5)); var pw := {"lv": lv, "bt": 2 if lv >= 9 else (1 if lv >= 5 else 0)}
	var names := Bots.nicks(3) if not Bots.B.is_empty() else ["增援1", "增援2", "增援3"]
	var next := 0
	for p in players: next = max(next, p.id)
	var rows: Array = []
	for i in 3:
		var pil: String = D.pilotOrder[rng.randi() % D.pilotOrder.size()]
		var wpn: String = str(D.pilots[pil].weapon) if rng.randf() < 0.5 else str(D.order[rng.randi() % D.order.size()])
		var q := add_player(next + 1 + i, names[i], t, pil, wpn, true, pw)
		q.persona = "decent"; q.late = true
		if risk == "high" and rng.randf() < 0.6: var bd2: Array = D.loot.bags.pack; q.inv = {"w": int(bd2[0]), "h": int(bd2[1]), "items": []}
		rows.append([q.id, q.name, q.team, q.pilot, q.weapon, q.lv, q.bt])
	var squads := 0; var seen := {}
	for p in players:
		if p.guard == null and not p.out and not seen.has(p.team): seen[p.team] = true; squads += 1
	ev(["pjn", rows])
	ev(["sqj", t, names[0], squads])
	return rows

func bot_take(p: Mech, c: Dictionary) -> bool:   # AI 拿最值钱的、放得下的
	var best := -1; var bv := -1
	for i in int(c.rev):
		if i >= c.items.size(): break
		var v := int(D.loot.items[c.items[i]].v)
		if v > bv and _fits(p.inv, c.items[i]): bv = v; best = i
	if best < 0: return false
	var k: String = c.items[best]
	if inv_place(p.inv, k): c.items.remove_at(best); c.rev = int(c.rev) - 1; return true
	return false

func _fits(inv: Dictionary, k: String) -> bool:
	var tmp := {"w": inv.w, "h": inv.h, "items": inv.items.duplicate()}
	return inv_place(tmp, k)

# 真人操作：拿 / 放进安全箱 / 丢掉
func loot_take(p: Mech, cid: int, i: int, to_safe := false) -> bool:
	var c = obj.cont_map.get(cid)
	if c == null or not can_reach(p, c) or i >= int(c.rev) or i >= c.items.size(): return false
	if inv_place(p.safe if to_safe else p.inv, c.items[i]):
		c.items.remove_at(i); c.rev = int(c.rev) - 1; return true
	return false

func loot_drop(p: Mech, idx: int, from_safe := false) -> void:
	var inv: Dictionary = p.safe if from_safe else p.inv
	if idx < 0 or idx >= inv.items.size(): return
	var k: String = inv.items[idx].k
	inv.items.remove_at(idx)
	var c := make_cont("pile", p.x + rng.randf_range(-20, 20), p.y + rng.randf_range(-20, 20), 1, false, [k]); c.rev = 1

func loot_move(p: Mech, idx: int, to_safe: bool) -> bool:   # 背包 ↔ 安全箱
	var a: Dictionary = p.inv if to_safe else p.safe; var b: Dictionary = p.safe if to_safe else p.inv
	if idx < 0 or idx >= a.items.size(): return false
	var k: String = a.items[idx].k
	if inv_place(b, k): a.items.remove_at(idx); return true
	return false

func extract(p: Mech, e: Dictionary) -> void:
	p.extracted = true; p.out = true; p.alive = false; p.ex_t = 0; p.respawn_t = 1e9; p.open_c = 0
	var keys: Array = inv_keys(p.inv) + inv_keys(p.safe)
	var v := loot_value(keys)
	obj.banked[p.id] = keys
	if e.type == "paid": obj.paid[p.id] = int(D.loot.ext.paid.cost)
	obj.score[p.team] = int(obj.score[p.team]) + v
	p.obj += 1
	ev(["exd", p.id, v])

func loot_drop_body(t: Mech) -> void:
	var drop: Array = inv_keys(t.inv); t.inv.items = []
	if t.guard != null:
		var hi := risk == "high"
		drop.append(roll_loot(5 if t.guard.get("hv", false) else 4, hi)); drop.append(roll_loot(3, hi))
		if rng.randf() < (0.5 if t.guard.get("hv", false) else 0.25): drop.append(roll_loot(5, hi))
		if t.loot_boss: drop += [roll_loot(6, true), roll_loot(6, true), roll_loot(5, true)]
	if not drop.is_empty(): make_cont("body", t.x, t.y, 0, false, drop)

func skip_goal(p: Mech) -> void:   # 这个目标走不到：换一个
	if p.ai_cont != 0: p.ai_done[p.ai_cont] = true; p.ai_cont = 0
	else: p.ai_skip[Vector2i(int(p.ai_goal.x), int(p.ai_goal.y))] = time + 40.0
	p.ai_mode_t = 0

func loot_goal(p: Mech):
	if p.guard != null: return guard_anchor(p) + Vector2(rng.randf_range(-60, 60), rng.randf_range(-60, 60))
	var v := loot_value(inv_keys(p.inv) + inv_keys(p.safe))
	var want := 3000 + 9000 * (time_left / float(D.loot.duration))
	var low: bool = p.hp < max_hp_of(p) * 0.35 and v > 1500
	if v >= want or time_left < 130 or low or inv_cells(p.inv) >= int(p.inv.w) * int(p.inv.h) - 1:
		var best = null; var bd := 1e9
		for e in obj.ex:
			if not ex_open(e) or e.type == "lever": continue
			if e.type == "weight" and inv_cells(p.inv) > int(D.loot.ext.weight.max): continue
			if p.ai_skip.get(Vector2i(int(e.x), int(e.y)), 0.0) > time: continue
			var d := Vector2(e.x - p.x, e.y - p.y).length()
			if d < bd: bd = d; best = Vector2(e.x, e.y)
		if best != null: p.ai_urgent = bd < 900; p.ai_cont = 0; return best
	# 找最近、没搜过、有东西的容器（AI 不坐电梯上楼顶）
	var bc = null; var bs := -1e9
	for c in obj.conts:
		if c.items.is_empty() or p.ai_done.has(c.id) or c.z > 120: continue
		var d2 := Vector2(c.x - p.x, c.y - p.y).length()
		if d2 > 1400: continue
		var s := float(c.tier) * 220.0 - d2 + rng.randf() * 200.0
		if s > bs: bs = s; bc = c
	if bc != null: p.ai_cont = bc.id; return Vector2(bc.x, bc.y)
	return Vector2(rng.randf_range(200, W - 200), rng.randf_range(200, H - 200))

const LW := 64
func loot_walk(i: int) -> bool: return solid[i] == 0 and top[i] <= 90

func local_field(p: Mech, g: Vector2) -> void:
	var gx := int(g.x / CELL); var gy := int(g.y / CELL)
	var px := int(p.x / CELL); var py := int(p.y / CELL)
	var ox := clampi((gx + px) / 2 - LW / 2, 0, max(0, GW - LW)); var oy := clampi((gy + py) / 2 - LW / 2, 0, max(0, GH - LW))
	var f := PackedInt32Array(); f.resize(LW * LW); f.fill(-1)
	p.ai_local_org = Vector2i(ox, oy)
	var lx := gx - ox; var ly := gy - oy
	if lx < 0 or ly < 0 or lx >= LW or ly >= LW: p.ai_local = PackedInt32Array(); return
	# 目标格本身可能是箱子 / 墙：从旁边能站的格子开始
	var start := -1
	for r in 3:
		for dy in range(-r, r + 1):
			for dx in range(-r, r + 1):
				var x := lx + dx; var y := ly + dy
				if start < 0 and x >= 0 and y >= 0 and x < LW and y < LW and loot_walk((oy + y) * GW + ox + x): start = y * LW + x
	if start < 0: p.ai_local = PackedInt32Array(); return
	var q := PackedInt32Array([start]); f[start] = 0; var head := 0
	while head < q.size():
		var c := q[head]; head += 1
		var cx := c % LW; var cy := c / LW
		var ht: int = top[(oy + cy) * GW + ox + cx]
		for dd in [Vector2i(1, 0), Vector2i(-1, 0), Vector2i(0, 1), Vector2i(0, -1)]:
			var nx: int = cx + dd.x; var ny: int = cy + dd.y
			if nx < 0 or ny < 0 or nx >= LW or ny >= LW: continue
			var ni := ny * LW + nx
			if f[ni] >= 0: continue
			var gi := (oy + ny) * GW + ox + nx
			if not loot_walk(gi) or absi(top[gi] - ht) > 24: continue
			f[ni] = f[c] + 1; q.append(ni)
	p.ai_local = f

func local_dir(p: Mech) -> Vector2:
	var cx := int(p.x / CELL) - p.ai_local_org.x; var cy := int(p.y / CELL) - p.ai_local_org.y
	if cx < 0 or cy < 0 or cx >= LW or cy >= LW: return Vector2.INF
	var f := p.ai_local
	var here := f[cy * LW + cx]
	if here < 0: return Vector2.INF
	if here == 0: return Vector2(p.ai_goal.x - p.x, p.ai_goal.y - p.y).normalized()
	var best := Vector2.ZERO; var bv := here
	for dd in [Vector2i(1, 0), Vector2i(-1, 0), Vector2i(0, 1), Vector2i(0, -1), Vector2i(1, 1), Vector2i(-1, 1), Vector2i(1, -1), Vector2i(-1, -1)]:
		var nx: int = cx + dd.x; var ny: int = cy + dd.y
		if nx < 0 or ny < 0 or nx >= LW or ny >= LW: continue
		var v := f[ny * LW + nx]
		if v >= 0 and v < bv:
			if dd.x != 0 and dd.y != 0 and (f[cy * LW + nx] < 0 or f[ny * LW + cx] < 0): continue
			bv = v; best = Vector2(dd.x, dd.y)
	if best == Vector2.ZERO: return Vector2.INF
	# 朝下一格的中心走（不只是方向），转角不容易卡住
	var tgt := Vector2((p.ai_local_org.x + cx + best.x + 0.5) * CELL, (p.ai_local_org.y + cy + best.y + 0.5) * CELL)
	return (tgt - Vector2(p.x, p.y)).normalized()
