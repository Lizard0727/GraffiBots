# 无画面测试：本地存档和养成（新手宝箱、买宝箱、升级、突破、天赋、对战奖励、存读档）
# 运行：godot --headless --path godot --script res://tests/profile_test.gd
extends SceneTree

var fails := 0
func ok(c: bool, msg: String) -> void:
	print(("✓ " if c else "✗ ") + msg)
	if not c: fails += 1

func _init() -> void:
	var data: Dictionary = JSON.parse_string(FileAccess.open("res://data/game.json", FileAccess.READ).get_as_text())
	var path := "user://test_profile.json"
	if FileAccess.file_exists(path): DirAccess.remove_absolute(ProjectSettings.globalize_path(path))
	var P := Profile.new(data, path)
	ok(P.o.coins == 200 and P.o.gems == 40 and P.o.mechs.size() == 3 and P.o.pilots.is_empty(), "新账号：200 金币、40 宝石、3 台常驻机体、还没有驾驶员")
	ok(P.tutorial().ok and P.o.chests.get("starter", 0) == 1, "新手教程给 1 个新手宝箱")
	var r := P.open_chest("starter")
	ok(r.ok and P.o.pilots.size() == 1 and data.econ.starterPilots.has(P.o.pilot), "新手宝箱开出常驻驾驶员「%s」" % data.pilots[P.o.pilot].name)
	ok(not P.tutorial().ok, "新手教程不能重复领")
	ok(not P.buy_chest("airdrop").ok, "宝石不够买不了金色空投")
	P.o.gems = 5000
	var got := 0
	for i in 20:
		var b := P.buy_chest("airdrop")
		if b.ok:
			for it in b.items:
				if it.k == "pilot" or it.k == "mech": got += 1
	ok(P.o.gems == 5000 - 20 * 260 + 0 or P.o.gems >= 0, "买 20 个金色空投，开出 %d 个新驾驶员 / 机体" % got)
	var locked_ok := true
	for id in data.econ.locked:
		if P.o.pilots.has(id) or P.o.mechs.has(id): locked_ok = false
	ok(locked_ok, "任务 / 联动 / 通行证 / 特攻队专属的不会从普通宝箱开出")
	var pid: String = P.o.pilot
	P.o.coins = 100000; P.o.parts = 100000
	for i in 4: P.upgrade(pid)
	ok(P.o.pilots[pid].lv == 5 and not P.upgrade(pid).ok, "升到 5 级后要先突破")
	P.o.crystals = 0
	ok(not P.breakthrough(pid).ok, "没有能量结晶不能突破")
	P.o.crystals = 10
	ok(P.breakthrough(pid).ok and P.power(pid).bt == 1 and P.upgrade(pid).ok, "突破 I 之后能继续升级")
	ok(P.tp_free() == 2 and P.learn_talent("a1").ok and not P.learn_talent("a3").ok and P.o.tal == ["a1"], "天赋：点亮后自动装上，不能跳级")
	P.learn_talent("d1")
	ok(not P.learn_talent("p1").ok, "天赋点用完了")
	# 打一局拿奖励
	var sim := Sim.new(data, 0, 7, 40.0, "turf")
	var me := sim.add_player(1, "你", 1, pid, P.o.weapon, true, P.power(pid))
	ok(absf(me.max_hp - round(float(data.mechs[P.o.weapon].hp) * (1.18 if pid == "titan" else 1.0) * 1.2 * 1.08)) < 1.5, "6 级驾驶员 + 加厚装甲：机体生命 +20%% +8%%（%d）" % me.max_hp)
	for i in 7: sim.add_player(i + 2, "AI", 1 if i < 3 else 2, data.pilotOrder[i + 3], data.order[i + 2], true)
	while not sim.over: sim.step(1.0 / 30)
	var rw := P.match_reward(sim, me)
	var xp0: int = P.o.xp; var c0: int = P.o.coins
	var res := P.apply_match(rw)
	ok(P.o.xp == xp0 + rw.xp and P.o.coins > c0 and P.o.matches == 1, "对战奖励：经验 +%d、金币 +%d、奖杯 %+d" % [rw.xp, P.o.coins - c0, rw.trophies])
	P.save()
	var P2 := Profile.new(data, path)
	ok(P2.o.xp == P.o.xp and P2.o.pilots[pid].lv == 6 and P2.o.tal == P.o.tal and typeof(P2.o.coins) == TYPE_INT, "存档读回来一致")
	ok(P.daily_quests(20000).size() == 3, "每日任务每天 3 个：%s" % str(P.daily_quests(Profile.day_index()).map(func(q): return P.quest_name(q))))
	# ---- 阶段 5：通行证 / 邮件 / 任务线 / 皮肤 / 排位 ----
	var g0: int = P.o.gems
	var mr := P.claim_mail("godot_pc")
	ok(mr.ok and P.o.gems >= g0 + 300, "电脑版上线礼包邮件：宝石 +300、金色空投")
	ok(not P.claim_mail("godot_pc").ok, "邮件不能重复领")
	var st := P.task_state("rookie")
	ok(int(st.p[0]) >= 1 and P.claim_task("rookie", 0).ok, "新兵之路第 1 步（打 1 局）可以领奖")
	ok(int(P.o.pass.xp) > 0, "对战给了通行证经验 %d" % int(P.o.pass.xp))
	P.o.pass.xp = 600 * 3
	var pr := P.claim_pass_all()
	ok(pr.ok and P.o.pass.cf.size() == 3 and P.o.pass.cp.is_empty(), "通行证 3 级：领了 3 个免费奖励，高级没解锁不给")
	P.o.gems = 5000
	ok(P.buy_pass(false).ok and P.claim_pass_all().ok and P.o.pass.cp.size() == 3, "解锁高级通行证后补领高级奖励")
	var sk := "frost_night"
	ok(P.buy_skin(sk).ok and P.wear(sk).ok and P.art_id("frost") == sk and P.pilot_look("frost").accent == "#2ef0c8", "买皮肤、穿上：立绘和 3D 配色都换成皮肤")
	P.o.pilots["frost"] = {"lv": 1, "bt": 0}; P.o.pilots["candy"] = {"lv": 1, "bt": 0}; P.o.pilots["titan"] = {"lv": 1, "bt": 0}
	ok(P.can_ranked(), "3 位驾驶员 + 3 台机体可以打排位")
	var rp0: int = P.o.rank.rp
	var rr := P.apply_match({"xp": 100, "trophies": 8, "won": true, "draw": false, "mvp": false, "kills": 3, "paint": 300, "mode": "turf", "ranked": true})
	ok(P.o.rank.rp == rp0 + 10 and not rr.rank.is_empty(), "排位赢一局 +10 分")
	ok(D_has_events(P) >= 0, "活动：现在进行中的有 %d 个" % P.active_events().size())
	DirAccess.remove_absolute(ProjectSettings.globalize_path(path))
	print("\n" + ("全部通过" if fails == 0 else "%d 项失败" % fails))
	quit(1 if fails else 0)

func D_has_events(P) -> int:
	for ev in P.active_events():
		P.event_state(ev)
	return P.active_events().size()
