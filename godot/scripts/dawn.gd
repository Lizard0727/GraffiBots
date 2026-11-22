# 涂鸦机兵 电脑版 3.1 ——「黎明之后」联动的战斗机制
# 三台机甲：晨轮（回旋光轮）、共鸣（拴索吸取）、守夜（格挡反击）
# 三位干员：熹微（日晷循环 / 灼光 / 日轮）、尾声（回响延迟伤害 / 余韵 / 回溯 / 绝响）、宵（夜债）
# sim.gd 在几个地方调用这里：每帧更新、开火、受伤前后、技能、大招、超载、击倒
class_name Dawn
extends RefCounted

const LOOP := 16.0        # 日晷一圈（4 段各 4 秒）
const PH_NAMES := ["破晓", "正午", "黄昏", "夜"]
const CINE_T := 2.8       # 绝响终章的时长

static func is_dawn_pilot(p) -> bool: return p.pilot in ["xiwei", "coda", "xiao"]
static func phase(p) -> int: return int(fposmod(p.dial, LOOP) / 4.0)
static func frz_k(p) -> float: return 1.5 if p.dial_frz > 0 else 1.0
static func eternal(S, p) -> bool:
	var O = S.ov_of(p)
	return O != null and O.has("eternal")
static func theater(S, p) -> bool:
	var O = S.ov_of(p)
	return O != null and O.has("theater")
static func moonless(S, p) -> bool:
	var O = S.ov_of(p)
	return O != null and O.has("moonless")

# ---------------- 每帧 ----------------
static func tick(S, p, dt: float) -> void:
	# 熹微：日晷
	if p.pilot == "xiwei":
		var ph0 := phase(p)
		if p.dial_frz > 0: p.dial_frz = maxf(0.0, p.dial_frz - dt)
		else: advance_dial(S, p, dt)
		if eternal(S, p):
			p.eter_on = true
			p.hp = minf(S.max_hp_of(p), p.hp + S.max_hp_of(p) * 0.03 * dt)
		elif p.eter_on:
			p.eter_on = false; p.suns = mini(4, p.suns + 1); S.ev(["sun", p.id, p.suns])
		if phase(p) != ph0: S.ev(["phase", p.id, phase(p)])
	# 尾声：回溯用的位置记录；回声剧场结束时所有回响一起重演
	if p.pilot == "coda":
		p.hist_t -= dt
		if p.hist_t <= 0:
			p.hist_t = 0.1; p.hist.append([S.time, p.x, p.y, p.z, p.hp])
			while p.hist.size() > 30: p.hist.pop_front()
		if theater(S, p): p.thea_on = true
		elif p.thea_on:
			p.thea_on = false; replay_all(S, p, 1.0)
	# 宵：夜债偿还
	if p.pilot == "xiao":
		if moonless(S, p): p.moon_on = true
		elif p.moon_on:
			p.moon_on = false; p.debt_fast = 6.0
		p.debt_fast = maxf(0.0, p.debt_fast - dt)
		if p.debt > 0.01 and not p.moon_on:
			var pay := minf(p.debt, maxf(4.0, p.debt * 0.12) * dt * (2.0 if p.debt_fast > 0 else 1.0))
			p.debt -= pay
			if not S.tutorial or p.bot: p.hp -= pay
			if p.hp <= 0:
				p.hp = 0.0
				var by = S.player_by(p.debt_by)
				if p.foot: S.kill(p, by)
				else: S.wreck(p, by)
				return
	if p.glare_n > 0:
		p.glare_t -= dt
		if p.glare_t <= 0: p.glare_n = 0
	# 回响：别人攒在我身上的回响，2.5 秒没再挨打就重演
	var es := 0.0
	for k in p.echo: es += float(p.echo[k].amt)
	p.echo_sum = es
	if not p.echo.is_empty():
		for k in p.echo.keys():
			var e: Dictionary = p.echo[k]
			if S.time - float(e.t) >= 2.5:
				p.echo.erase(k)
				var by = S.player_by(int(k))
				echo_burst(S, p, float(e.amt), by)
				if not p.alive: return
	# 守夜：盾的耐久回复
	if p.weapon == "vigil" and not p.foot and not p.guarding:
		if S.time - p.guard_down > 0.8: p.guard_e = minf(float(S.D.mechs.vigil.guardMax), p.guard_e + dt)
	if p.night_t > 0: p.night_t = maxf(0.0, p.night_t - dt)
	# 光轮 / 共鸣索
	if p.disc_on: update_disc(S, p, dt)
	if p.teth_id != 0: update_tether(S, p, dt)
	if not p.links.is_empty():
		p.links_t -= dt
		if p.links_t <= 0: end_links(S, p)

static func advance_dial(S, p, dt: float) -> void:
	var before := floorf(p.dial / LOOP)
	p.dial += dt
	if floorf(p.dial / LOOP) > before:
		p.suns = mini(4, p.suns + 1); S.ev(["sun", p.id, p.suns])
	# 进入破晓：回血 8%
	if int(fposmod(p.dial, LOOP) / 4.0) == 0 and int(fposmod(p.dial - dt, LOOP) / 4.0) != 0:
		var heal: float = S.max_hp_of(p) * 0.08
		p.hp = minf(S.max_hp_of(p), p.hp + heal); S.ev(["heal", p.id, int(heal)])

static func speed_mul(S, p) -> float:
	var k := 1.0
	if p.pilot == "xiwei" and (phase(p) == 3 or eternal(S, p)): k *= 1.15 * (1.1 if p.dial_frz > 0 and phase(p) == 3 else 1.0)
	if p.night_t > 0: k *= 1.2
	if p.guarding: k *= 0.5
	return k

static func max_hp_k(p) -> float:
	return 1.0 + 0.03 * p.suns if p.pilot == "xiwei" else 1.0

# ---------------- 伤害 ----------------
# 攻击方的加成（hurt() 前段调用）
static func atk_mul(S, by, t) -> float:
	var k := 1.0
	if by.pilot == "xiwei":
		var ph := phase(by)
		if ph == 1 or eternal(S, by): k *= 1.0 + 0.18 * frz_k(by)
		elif ph == 3: k *= 0.85
		k *= 1.0 + 0.05 * by.suns
	if by.pilot == "coda": k *= 0.9
	if by.pilot == "xiao":
		var cap := 0.5 if moonless(S, by) else 0.3
		k *= 1.0 + minf(cap, by.debt / 3.0 * 0.01)
	if by.night_t > 0 and S.time - float(by.hurt_by.get(t.id, -10.0)) > 2.0: k *= 1.3
	return k

# 守夜机兵举盾：正面的伤害挡下 70%；举盾 0.2 秒内挨的那一下完全挡下（完美格挡），攻击者眩晕
static func guard_block(S, t, by, dmg: float) -> float:
	if not t.guarding or by == null or by == t: return dmg
	var da := wrapf(atan2(by.y - t.y, by.x - t.x) - float(t.inp.a), -PI, PI)
	if absf(da) > 1.05: return dmg
	var W: Dictionary = S.D.mechs.vigil
	if S.time <= t.parry_until:
		t.blocked += dmg; t.parried = true
		by.bind_t = maxf(by.bind_t, float(W.stun)); by.silence_t = maxf(by.silence_t, float(W.stun)); by.burst_n = 0; by.charge = 0
		S.ev(["parry", t.id, by.id])
		return 0.0
	t.blocked += dmg * float(W.block)
	S.ev(["guard", t.id])
	return dmg * (1.0 - float(W.block))

# 宵：受到的伤害先记成夜债（hurt() 扣血之前调用，返回真正扣的血）
static func to_debt(S, t, by, dmg: float) -> float:
	if t.pilot != "xiao" or dmg <= 0: return dmg
	var k := 1.0 if moonless(S, t) else 0.4
	t.debt += dmg * k
	if by != null and by != t: t.debt_by = by.id
	return dmg * (1.0 - k)

# 造成伤害之后（hurt() 末尾调用）
static func after_hit(S, t, by, dmg: float, true_dmg: bool) -> void:
	if by == null or by == t or by.team == t.team or dmg <= 0: return
	t.hurt_by[by.id] = S.time
	if true_dmg: return
	# 尾声：攒回响
	if by.pilot == "coda":
		var th := theater(S, by)
		var cap := 240.0 if th else 120.0
		var e: Dictionary = t.echo.get(by.id, {"amt": 0.0, "t": 0.0})
		e.amt = minf(cap, float(e.amt) + dmg * (0.8 if th else 0.35)); e.t = S.time
		t.echo[by.id] = e
	# 宵：打出的伤害抵消夜债
	if by.pilot == "xiao" and by.debt > 0: by.debt = maxf(0.0, by.debt - dmg * 0.2)
	# 熹微：日晷快进、正午叠灼光、黄昏引爆
	if by.pilot == "xiwei":
		if by.dial_frz <= 0: advance_dial(S, by, 0.15)
		var ph := phase(by); var et := eternal(S, by)
		if ph == 1 or et: t.glare_n = mini(5, t.glare_n + 1); t.glare_t = 6.0
		if (ph == 2 or et) and t.glare_n > 0 and t.alive:
			var n: int = t.glare_n + (1 if et else 0)
			t.glare_n = 0
			var boom: float = 9.0 * n * (frz_k(by) if ph == 2 else 1.0)
			S.ev(["glare", t.id, n])
			S.hurt_true(t, boom, by)
			by.hp = minf(S.max_hp_of(by), by.hp + boom * 0.5)
		if ph == 0 and t.alive: S.paint(t.x, t.y, t.z, 26.0 * frz_k(by), by.team, by)
	# 谐振网：打在一个被拴住的人身上，40% 传给其他几个
	if not S._sharing:
		for q in S.players:
			if q.links.is_empty() or q.team != by.team or not q.links.has(t.id): continue
			S._sharing = true
			for oid in q.links:
				if oid == t.id: continue
				var o = S.player_by(oid)
				if o != null and o.alive: S.hurt(o, dmg * 0.4, by, 0, 0, 0.0)
			S._sharing = false
			break

# 回响重演：真实伤害；打死人传一半给附近的人；尾声叠余韵；回声剧场里留下残影
static func echo_burst(S, t, amt: float, by) -> void:
	if amt < 1 or not t.alive: return
	S.ev(["echo", t.id, int(amt), by.id if by != null else 0, t.x, t.y, t.z])
	S.hurt_true(t, amt, by)
	if by == null: return
	if by.pilot == "coda" and by.alive: by.linger = mini(5, by.linger + 1)
	if theater(S, by) and t.alive:
		var w: Dictionary = S.D.mechs[by.weapon] if not by.foot else S.side(by)
		var ghost := float(w.get("dmg", 20)) * (3.0 if str(w.get("attack", "")) == "tether" else 1.0) * 0.55
		S.ev(["ghost", t.id, by.id, t.x, t.y, t.z])
		S.hurt_true(t, ghost, by)
	if not t.alive:
		var best = null; var bd := 220.0
		for q in S.players:
			if q == t or not q.alive or q.team == by.team or q.npc and not q.spirit: continue
			var d: float = S.dist2d(q, t)
			if d < bd: bd = d; best = q
		if best != null:
			S.ev(["echojump", t.id, best.id])
			echo_burst(S, best, amt * 0.5, by)

static func replay_all(S, p, k: float) -> void:
	for t in S.players:
		if t.echo.has(p.id):
			var e: Dictionary = t.echo[p.id]
			t.echo.erase(p.id)
			echo_burst(S, t, float(e.amt) * k, p)

# 击倒敌人
static func on_takedown(S, by, _t) -> void:
	if by.pilot == "xiao" and by.debt > 0:
		var sh: float = by.debt * 0.5
		by.debt = 0.0
		by.shield = maxf(by.shield, sh); by.shield_t = maxf(by.shield_t, 4.0)
		S.ev(["debtclear", by.id, int(sh)])

# 机体被打爆 / 驾驶员倒下
static func on_down(S, t, dead: bool) -> void:
	t.disc_on = false; t.teth_id = 0; t.fork_id = 0; t.guarding = false; t.blocked = 0.0
	if not t.links.is_empty(): end_links(S, t)
	if t.pilot == "xiwei": t.suns = t.suns / 2
	if t.pilot == "xiao": t.debt = 0.0
	if dead:
		if t.pilot == "coda": t.linger = 0
		t.echo.clear(); t.glare_n = 0

# ---------------- 技能 ----------------
static func use_skill(S, p, sk: String) -> bool:
	match sk:
		"dial":
			p.dial_frz = 3.0
			S.ev(["dialfrz", p.id, phase(p)])
		"rewind":
			var snap = null
			for h in p.hist:
				if S.time - float(h[0]) <= 2.6: snap = h; break
			if snap != null:
				S.ev(["rewind", p.id, p.x, p.y, p.z, snap[1], snap[2], snap[3]])
				p.x = snap[1]; p.y = snap[2]; p.z = snap[3]; p.vx = 0; p.vy = 0; p.kx = 0; p.ky = 0
				var mh: float = S.max_hp_of(p)
				if float(snap[4]) > p.hp: p.hp = minf(float(snap[4]), p.hp + mh * 0.35)
			p.inv_t = maxf(p.inv_t, 0.2)
			p.hist.clear()
			replay_all(S, p, 0.7)
		"settle":
			var d: float = p.debt
			p.debt = 0.0
			S.ev(["settle", p.id, p.x, p.y, p.z, int(d)])
			if d >= 4:
				for e in S.players:
					if e.alive and e.team != p.team and S.dist2d(e, p) < 160 and absf(e.z - p.z) < 90: S.hurt(e, d * 0.7, p, e.x - p.x, e.y - p.y, 1.2, 80)
				S.paint(p.x, p.y, p.z, 80, p.team, p)
		_: return false
	return true

# ---------------- 开火 ----------------
# 守夜机兵的按键：点按两连斩；按住 0.2 秒举盾；松开反斩
static func guard_input(S, p, w: Dictionary, dt: float) -> bool:
	var held := bool(p.inp.f)
	if held:
		p.g_hold += dt
		if not p.guarding and p.g_hold >= 0.2 and p.guard_e > 0.15 and p.silence_t <= 0:
			p.guarding = true; p.parry_until = S.time + float(w.parry); p.blocked = 0.0; p.parried = false
			S.ev(["guardup", p.id])
		if p.guarding:
			p.guard_e -= dt
			if p.guard_e <= 0: release_guard(S, p, w)
		return p.guarding
	var was: float = p.g_hold
	p.g_hold = 0.0
	if p.guarding:
		release_guard(S, p, w); return true
	if was > 0 and was < 0.2 and p.atk_cd <= 0 and p.ammo >= 1:
		p.ammo -= 1; p.atk_cd = float(w.atkCd) / S.rof_of(p); p.last_atk = S.time; S.take_overdrive(p)
		p.g_combo = (p.g_combo + 1) % 2
		var ww := w.duplicate(); ww.dmg = float(w.dmg) if p.g_combo == 1 else float(w.dmg2)
		S.punch(p, ww)
		S.ev(["fire", p.id, p.weapon])
		return true
	return false

static func release_guard(S, p, w: Dictionary) -> void:
	p.guarding = false; p.guard_down = S.time
	var amt: float = float(w.counter) + minf(float(w.counterCap), p.blocked)
	if p.parried: amt *= float(w.parryMul)
	var cw := {"dmg": amt, "range": 100.0, "arc": 2.0, "kb": 170.0, "lunge": 150.0, "paintR": 52.0}
	p.dmg_mul = 1.0
	S.punch(p, cw)
	S.ev(["counter", p.id, int(amt), p.parried])
	p.blocked = 0.0; p.parried = false; p.last_atk = S.time; p.atk_cd = 0.35

static func fire(S, p, w: Dictionary) -> void:
	match str(w.attack):
		"disc":
			p.disc_on = true; p.disc_ph = 0; p.disc_t = 0.0; p.disc_d = 0.0; p.disc_a = float(p.inp.a)
			p.disc_x = p.x + cos(p.disc_a) * 24; p.disc_y = p.y + sin(p.disc_a) * 24; p.disc_z = p.z + 22
			p.disc_hit = {}; p.disc_mul = p.dmg_mul; p.disc_big = p.sp_t > 0 and p.sp_kind == "corona"
		"tether":
			var a := float(p.inp.a); var best = null; var bd := float(w.range) + 1
			for e in S.players:
				if not e.alive or e.team == p.team or e.cine_t > 0 or (e.hidden and S.dist2d(e, p) > 90): continue
				var dx: float = e.x - p.x; var dy: float = e.y - p.y
				var along := dx * cos(a) + dy * sin(a)
				if along < 0 or along > float(w.range) + 10: continue
				var perp := absf(-dx * sin(a) + dy * cos(a))
				if perp > 24 + (e.rad if e.rad > 0 else 0.0) or absf(e.z - p.z) > 70: continue
				if not S.los(p.x, p.y, p.z + 20, e.x, e.y): continue
				if along < bd: bd = along; best = e
			if best != null:
				p.teth_id = best.id; p.teth_t = 0.0; p.teth_acc = 0.0; p.teth_lost = 0.0; p.fork_id = 0
				S.ev(["tether", p.id, best.id])
			else:   # 没拴到人：射出一发普通的音弹
				S.spawn_proj(p, a, -0.02, float(w.speed), float(w.range), 10.0 * p.dmg_mul, float(w.splat), float(w.trail), float(w.size), null, {})

static func update_disc(S, p, dt: float) -> void:
	var w: Dictionary = S.D.mechs.halo
	p.disc_t += dt
	var big: bool = p.disc_big or (p.sp_t > 0 and p.sp_kind == "corona")
	match p.disc_ph:
		0:   # 飞出去
			var step := float(w.speed) * dt
			var nx: float = p.disc_x + cos(p.disc_a) * step; var ny: float = p.disc_y + sin(p.disc_a) * step
			if S.solid_at(nx, ny) or nx < 8 or ny < 8 or nx > S.W - 8 or ny > S.H - 8 or p.disc_d + step >= float(w.range):
				p.disc_ph = 1; p.disc_t = 0.0
			else:
				p.disc_x = nx; p.disc_y = ny; p.disc_d += step
		1:   # 停一下
			if p.disc_t >= float(w.hover): p.disc_ph = 2; p.disc_t = 0.0
		2:   # 飞回来（追着主人，穿墙）
			var to := Vector2(p.x - p.disc_x, p.y - p.disc_y)
			var L := to.length()
			if L < 26:
				p.disc_on = false; p.ammo = minf(float(S.C.AMMO), p.ammo + float(w.catchCut))
				S.ev(["catch", p.id]); return
			var st := minf(L, float(w.backSpeed) * dt)
			p.disc_x += to.x / L * st; p.disc_y += to.y / L * st
			if p.disc_t > float(w.autoBack): p.disc_on = false; return
	p.disc_z = lerpf(p.disc_z, S.top_at(p.disc_x, p.disc_y) + 22.0, minf(1.0, dt * 8.0))
	# 涂地
	p.disc_pt -= dt
	if p.disc_pt <= 0:
		p.disc_pt = 0.04
		S.paint(p.disc_x, p.disc_y, S.top_at(p.disc_x, p.disc_y), float(w.splat) * (0.75 if not big else 1.1), p.team, p)
	# 命中：每段各打一次；去回都中了就致盲
	if p.disc_ph == 1: return
	var back: bool = p.disc_ph == 2
	var r := float(w.size) * (1.5 if big else 1.0) + float(S.C.R)
	for e in S.players:
		if not e.alive or e.team == p.team or e.cine_t > 0: continue
		var er: float = r + (e.rad if e.rad > 0 else 0.0)
		if Vector2(e.x - p.disc_x, e.y - p.disc_y).length() > er or absf(e.z + 18 - p.disc_z) > 60: continue
		var key := "%d_%d" % [e.id, 1 if back else 0]
		if p.disc_hit.has(key): continue
		p.disc_hit[key] = true
		var dmg: float = float(w.dmg) * (float(w.back) if back else 1.0) * p.disc_mul
		S.hurt(e, dmg, p, e.x - p.disc_x, e.y - p.disc_y, 0.6)
		if back and p.disc_hit.has("%d_0" % e.id): e.blind_t = maxf(e.blind_t, float(w.blind)); S.ev(["blind", e.id])
	if S.mode == "park":
		for b in S.obj.balloons.duplicate():
			if Vector2(b.x - p.disc_x, b.y - p.disc_y).length() < r + 10: S.pop_balloon(b, p.team, p)
	if S.obj.has("ball"): S.push_ball(p, p.disc_x, p.disc_y, r, 500)

static func update_tether(S, p, dt: float) -> void:
	var w: Dictionary = S.D.mechs.chord
	var e = S.player_by(p.teth_id)
	if e == null or not e.alive or p.foot or e.cine_t > 0 or e.team == p.team:
		p.teth_id = 0; p.fork_id = 0; return
	p.teth_t += dt
	var d: float = S.dist2d(e, p)
	if d > float(w.leash) or p.teth_t > float(w.tetherT):
		S.ev(["untether", p.id]); p.teth_id = 0; p.fork_id = 0; return
	if not S.los(p.x, p.y, p.z + 20, e.x, e.y):
		p.teth_lost += dt
		if p.teth_lost > 0.5: S.ev(["untether", p.id]); p.teth_id = 0; p.fork_id = 0; return
	else: p.teth_lost = 0.0
	var dps: float = float(w.dmg) * (1.0 + float(w.ramp) * p.teth_t) * p.dmg_mul
	p.teth_acc += dps * dt
	if p.teth_acc >= dps * 0.1:
		var amt: float = p.teth_acc; p.teth_acc = 0.0
		var hp0: float = e.hp + e.shield
		S.hurt(e, amt, p, 0, 0, 0.0)
		var got := maxf(0.0, hp0 - (e.hp + e.shield)) if e.alive else amt
		p.hp = minf(S.max_hp_of(p), p.hp + got * float(w.drain))
		S.paint(e.x, e.y, e.z, float(w.splat), p.team, p)
		# 共振：分叉连到旁边的敌人
		var f = S.player_by(p.fork_id) if p.fork_id != 0 else null
		if f == null or not f.alive or S.dist2d(f, e) > float(w.fork):
			p.fork_id = 0
			for q in S.players:
				if q != e and q.alive and q.team != p.team and q.cine_t <= 0 and S.dist2d(q, e) < float(w.fork): p.fork_id = q.id; break
			f = S.player_by(p.fork_id) if p.fork_id != 0 else null
		if f != null: S.hurt(f, amt * 0.5, p, 0, 0, 0.0)

# ---------------- 大招 ----------------
static func can_finale(p) -> bool: return p.pilot == "coda" and p.weapon == "chord" and p.linger >= 5 and not p.foot

static func special(S, p, kind: String) -> bool:
	var a := float(p.inp.a)
	match kind:
		"corona":
			p.sp_t = 5.0
		"resnet":
			if can_finale(p) and finale(S, p): return true
			var picks: Array = []
			for e in S.players:
				if not e.alive or e.team == p.team or e.cine_t > 0 or (e.npc and not e.spirit and not e.boss): continue
				var dx: float = e.x - p.x; var dy: float = e.y - p.y; var d := sqrt(dx * dx + dy * dy)
				if d > 440 or absf(wrapf(atan2(dy, dx) - a, -PI, PI)) > 0.65: continue
				if not S.los(p.x, p.y, p.z + 20, e.x, e.y): continue
				picks.append([d, e])
			picks.sort_custom(func(x, y): return x[0] < y[0])
			p.links = []
			for k in mini(3, picks.size()): p.links.append(picks[k][1].id)
			p.links_t = 4.0; p.sp_t = 0.3
			S.ev(["resnet", p.id, p.links])
		"longnight":
			p.sp_t = 0.3; p.night_t = 6.0
			S.add_helper({"kind": "night", "x": p.x, "y": p.y, "z": p.z, "r": 260.0, "team": p.team, "owner": p, "t": 6.0})
		_: return false
	return true

static func end_links(S, p) -> void:
	var qs: Array = []
	for oid in p.links:
		var o = S.player_by(oid)
		if o != null and o.alive: qs.append(o)
	p.links = []
	if qs.size() < 2: return
	var c := Vector2.ZERO
	for o in qs: c += Vector2(o.x, o.y)
	c /= qs.size()
	for o in qs: S.knock(o, c.x - o.x, c.y - o.y, minf(320.0, Vector2(c.x - o.x, c.y - o.y).length() * 2.2))
	S.ev(["linkpull", p.id])

# 绝响：锁定准星附近的一个敌人，两人进入终章（只有彼此看得见），结束时直接击倒驾驶员
static func finale(S, p) -> bool:
	var a := float(p.inp.a)
	var aim := Vector2(p.x + cos(a) * float(p.inp.ad), p.y + sin(a) * float(p.inp.ad))
	var best = null; var bd := 1e9
	for e in S.players:
		if not e.alive or e.team == p.team or e.cine_t > 0 or e.boss or e.npc: continue
		if S.dist2d(e, p) > 560 or (e.hidden and S.dist2d(e, p) > 120): continue
		if not S.los(p.x, p.y, p.z + 20, e.x, e.y): continue
		var d := Vector2(e.x, e.y).distance_to(aim)
		if d < bd: bd = d; best = e
	if best == null: return false
	p.linger = 0; p.sp_t = 0.0
	p.cine_t = CINE_T; p.cine_with = best.id; p.cine_lead = true
	best.cine_t = CINE_T; best.cine_with = p.id; best.cine_lead = false
	for q in [p, best]:
		q.burst_n = 0; q.charge = 0; q.vx = 0; q.vy = 0; q.kx = 0; q.ky = 0; q.teth_id = 0; q.guarding = false
	S.ev(["finale", p.id, best.id, p.x, p.y, p.z, best.x, best.y, best.z])
	return true

# 每帧：终章里的两个人定在原地、无敌；时间到了执行
static func cine_tick(S, p, dt: float) -> bool:
	if p.cine_t <= 0: return false
	p.cine_t -= dt
	p.vx = 0; p.vy = 0; p.kx = 0; p.ky = 0
	if p.cine_t > 0: return true
	p.cine_t = 0.0
	if p.cine_lead:
		var t = S.player_by(p.cine_with)
		if t != null and t.alive:
			t.cine_t = 0.0
			S.ev(["finale_end", p.id, t.id, t.x, t.y, t.z])
			if not t.foot: S.wreck(t, p)
			if t.alive: t.inv_t = 0.0; S.kill(t, p)
	p.cine_with = 0
	return true

# ---------------- 大招每帧 ----------------
static func update_special(S, p, dt: float) -> bool:
	match p.sp_kind:
		"corona":
			var t0: float = 5.0 - p.sp_t
			for k in 3:
				var ang := t0 * 4.2 + k * TAU / 3.0
				var ox: float = p.x + cos(ang) * 110; var oy: float = p.y + sin(ang) * 110
				for e in S.players:
					if not e.alive or e.team == p.team or e.cine_t > 0: continue
					if Vector2(e.x - ox, e.y - oy).length() > 30 + float(S.C.R) or absf(e.z - p.z) > 60: continue
					var key := "cor%d_%d" % [k, e.id]
					if float(p.hit_cd.get(key, -10.0)) > S.time: continue
					p.hit_cd[key] = S.time + 0.25
					S.hurt(e, 18.0 * p.dmg_mul, p, e.x - p.x, e.y - p.y, 0.4)
				if int(t0 * 30) % 3 == k: S.paint(ox, oy, S.top_at(ox, oy), 20, p.team, p)
			return true
		"resnet", "longnight": return true
	return false

# ---------------- AI ----------------
# 返回 true 表示这一帧由这里接管了开火键
static func ai_fire(S, p, tgt, d: float) -> bool:
	if p.foot: return false
	match p.weapon:
		"halo":
			p.inp.f = tgt != null and d < 340 and not p.disc_on
			return true
		"chord":
			p.inp.f = tgt != null and d < 300 and (p.teth_id == 0 or p.teth_id != tgt.id)
			return true
		"vigil":
			# 正面挨打时举盾，挡够了 / 盾快没了就松开反斩；近身时点按
			var threat := false
			for e in S.players:
				if e.alive and e.team != p.team and S.dist2d(e, p) < 300 and S.time - e.last_atk < 0.3: threat = true; break
			if p.guarding:
				p.inp.f = not (p.blocked > 40 or p.guard_e < 0.4 or (tgt != null and d < 70 and p.blocked > 15) or not threat)
			elif threat and p.guard_e > 1.0 and S.rng.randf() < 0.5:
				p.inp.f = true
			else:
				p.ai_tap = not p.ai_tap
				p.inp.f = tgt != null and d < 95 and p.ai_tap
			return true
	return false
