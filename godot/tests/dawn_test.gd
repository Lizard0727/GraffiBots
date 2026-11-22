# 「黎明之后」联动机制测试：光轮往返、共鸣索、格挡反击、日晷 / 日轮、回响、夜债、绝响
# 运行：godot --headless --path godot --script res://tests/dawn_test.gd
extends SceneTree

var fails := 0
func ok(c: bool, msg: String) -> void:
	print(("✓ " if c else "✗ ") + msg)
	if not c: fails += 1

var data: Dictionary
func mk(p1: String, m1: String, p2: String, m2: String, gap := 160.0) -> Sim:
	var sim := Sim.new(data, 5, 77, 120.0, "turf")   # 雪原哨站：很空旷
	sim.add_player(1, "A", 1, p1, m1, true, {"lv": 7, "bt": 2})
	sim.add_player(2, "B", 2, p2, m2, true, {"lv": 7, "bt": 2})
	sim.countdown = 0
	var a: Sim.Mech = sim.players[0]; var b: Sim.Mech = sim.players[1]
	a.x = 900; a.y = 640; b.x = 900 + gap; b.y = 640; a.z = 0; b.z = 0
	a.inp.a = 0.0; b.inp.a = PI
	a.inv_t = 0; b.inv_t = 0
	return sim

func run(sim: Sim, sec: float, each := Callable()) -> Dictionary:
	var c := {}
	for i in int(sec * 30):
		if each.is_valid(): each.call(i)
		for q in sim.players: q.bot = false; q.inp.mx = 0; q.inp.my = 0
		sim.step(1.0 / 30.0)
		for e in sim.events: c[e[0]] = c.get(e[0], 0) + 1
	return c

func _init() -> void:
	data = JSON.parse_string(FileAccess.get_file_as_string("res://data/game.json"))
	# 晨轮：扔出去、回来、来回都打中 → 致盲
	var s := mk("blaze", "halo", "titan", "blaster", 200)
	var A: Sim.Mech = s.players[0]; var B: Sim.Mech = s.players[1]
	var hp0 := B.hp
	var c := run(s, 1.2, func(i): A.inp.f = i < 2)
	ok(c.get("catch", 0) == 1 and B.hp < hp0 - 50 and B.blind_t > 0, "晨轮：光轮来回各打一次（%.0f 伤害），接住 %d 次，目标致盲" % [hp0 - B.hp, c.get("catch", 0)])
	# 共鸣：拴住持续吸血
	s = mk("blaze", "chord", "titan", "blaster", 220); A = s.players[0]; B = s.players[1]
	A.hp = 60.0; hp0 = B.hp
	c = run(s, 2.0, func(i): A.inp.f = i < 2)
	ok(A.teth_id == B.id or c.get("untether", 0) > 0, "共鸣：拴住了目标")
	ok(B.hp < hp0 - 50 and A.hp > 60.0, "共鸣：2 秒吸取 %.0f，自己回到 %.0f" % [hp0 - B.hp, A.hp])
	# 守夜：举盾挡正面 → 完美格挡眩晕 → 松开反斩
	s = mk("blaze", "vigil", "titan", "blaster", 120); A = s.players[0]; B = s.players[1]
	hp0 = B.hp
	c = run(s, 1.4, func(i):
		A.inp.f = i < 30
		B.inp.f = i >= 8 and i < 14
		B.inp.a = PI)
	ok(c.get("parry", 0) + c.get("guard", 0) > 0 and c.get("counter", 0) == 1, "守夜：格挡 %d / 完美格挡 %d，反斩 %d 次" % [c.get("guard", 0), c.get("parry", 0), c.get("counter", 0)])
	ok(B.hp < hp0, "守夜：反斩打出 %.0f 伤害" % (hp0 - B.hp))
	# 熹微：日晷转一圈得日轮，破晓回血
	s = mk("xiwei", "blaster", "titan", "blaster", 900); A = s.players[0]
	c = run(s, 17.0)
	ok(A.suns >= 1 and c.get("phase", 0) >= 4, "熹微：日晷转了 %d 段，日轮 %d 层" % [c.get("phase", 0), A.suns])
	A.dial = 4.5   # 正午打人叠灼光
	B = s.players[1]; B.x = A.x + 150; B.y = A.y
	c = run(s, 1.0, func(i): A.inp.f = true)
	ok(B.glare_n > 0 or c.get("glare", 0) > 0, "熹微：正午命中叠灼光 %d 层" % B.glare_n)
	# 尾声：回响 2.5 秒后重演，叠余韵
	s = mk("coda", "blaster", "titan", "blaster", 150); A = s.players[0]; B = s.players[1]
	c = run(s, 4.0, func(i): A.inp.f = i < 20)
	ok(c.get("echo", 0) >= 1 and A.linger >= 1, "尾声：回响重演 %d 次，余韵 %d 层" % [c.get("echo", 0), A.linger])
	# 回溯
	A.hist.clear(); A.x = 700
	c = run(s, 1.0, func(i):
		if i == 5: A.x = 1100
		if i == 25: A.inp.gq = int(A.inp.gq) + 1)
	ok(c.get("rewind", 0) == 1 and A.x < 900, "尾声：回溯回到 %.0f" % A.x)
	# 宵：夜债
	s = mk("xiao", "fist", "blaze", "blaster", 140); A = s.players[0]; B = s.players[1]
	c = run(s, 1.0, func(i): B.inp.f = true; B.inp.a = PI)
	ok(A.debt > 5, "宵：挨打记下夜债 %.1f" % A.debt)
	B.inp.f = false
	run(s, 0.8)
	var d0 := A.debt
	c = run(s, 1.0)
	ok(A.debt < d0, "宵：夜债在偿还（%.1f → %.1f）" % [d0, A.debt])
	A.debt = 60.0; B.x = A.x + 80
	A.skill_uses = 2; A.skill_cd = 0
	c = run(s, 0.2, func(i): if i == 0: A.inp.gq = int(A.inp.gq) + 1)
	ok(c.get("settle", 0) == 1 and A.debt == 0, "宵：清偿引爆夜债")
	# 绝响：尾声 + 共鸣 + 余韵 5 层 → 直接击倒驾驶员
	s = mk("coda", "chord", "titan", "fist", 260); A = s.players[0]; B = s.players[1]
	A.linger = 5; A.sp = float(data.mechs.chord.spNeed)
	c = run(s, 3.5, func(i):
		if i == 0: A.inp.qq = int(A.inp.qq) + 1; A.inp.ad = 260.0)
	ok(c.get("finale", 0) == 1 and c.get("finale_end", 0) == 1 and not B.alive, "绝响：终章 %d，结束 %d，目标%s" % [c.get("finale", 0), c.get("finale_end", 0), "倒下" if not B.alive else "还活着"])
	# 没有余韵时是普通的谐振网
	s = mk("coda", "chord", "titan", "fist", 260); A = s.players[0]
	A.linger = 2; A.sp = float(data.mechs.chord.spNeed)
	c = run(s, 0.5, func(i): if i == 0: A.inp.qq = int(A.inp.qq) + 1)
	ok(c.get("resnet", 0) == 1 and c.get("finale", 0) == 0, "余韵不够：放出普通谐振网")
	print("失败 %d 项" % fails)
	quit(1 if fails > 0 else 0)
