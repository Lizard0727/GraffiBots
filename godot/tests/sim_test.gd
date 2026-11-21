# 无画面测试：8 个 AI 打一整局，检查涂地、击倒、技能、大招都正常
# 运行：godot --headless --path godot --script res://tests/sim_test.gd
extends SceneTree

var fails := 0
func ok(c: bool, msg: String) -> void:
	print(("✓ " if c else "✗ ") + msg)
	if not c: fails += 1

func _init() -> void:
	var f := FileAccess.open("res://data/game.json", FileAccess.READ)
	var data: Dictionary = JSON.parse_string(f.get_as_text())
	ok(data.mechs.size() == 2 and data.pilots.size() == 2, "数据：2 台机体、2 位驾驶员")
	var sim := Sim.new(data, 12345, 180.0)
	var pilots := ["blaze", "frost"]; var mechs := ["blaster", "charger"]
	for i in 8:
		sim.add_player(i + 1, "AI%d" % (i + 1), 1 + i % 2, pilots[(i / 2) % 2], mechs[i % 4 / 2], true)
	var counts := {}
	var t0 := Time.get_ticks_msec()
	var ticks := 0
	while not sim.over and ticks < 200 * 30:
		sim.step(1.0 / 30.0)
		ticks += 1
		for e in sim.events:
			counts[e[0]] = counts.get(e[0], 0) + 1
			if e[0] == "skill" or e[0] == "super": counts[e[0] + ":" + str(e[2])] = counts.get(e[0] + ":" + str(e[2]), 0) + 1
	var ms := Time.get_ticks_msec() - t0
	print("用时 %d ms（%d tick，平均每 tick %.2f ms）" % [ms, ticks, float(ms) / ticks])
	print("结果：", sim.result, " 事件：", counts)
	ok(sim.over, "比赛结束")
	ok(sim.result.a + sim.result.b > sim.result.tot * 0.25, "两队一共涂了 %d / %d 格" % [sim.result.a + sim.result.b, sim.result.tot])
	ok(counts.get("ko", 0) >= 4, "有击倒：%d 次" % counts.get("ko", 0))
	ok(counts.get("skill:rush", 0) > 0, "凌焰用了「肾上腺素」：%d 次" % counts.get("skill:rush", 0))
	ok(counts.get("skill:scan", 0) > 0, "白夜用了「义眼扫描」：%d 次" % counts.get("skill:scan", 0))
	ok(counts.get("super:storm", 0) > 0, "喷罐放了大招：%d 次" % counts.get("super:storm", 0))
	ok(counts.get("super:missiles", 0) > 0, "狙击放了大招：%d 次" % counts.get("super:missiles", 0))
	ok(float(ms) / ticks < 8.0, "性能：每 tick 少于 8 ms")
	print("\n" + ("全部通过" if fails == 0 else "%d 项失败" % fails))
	quit(1 if fails else 0)
