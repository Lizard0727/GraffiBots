# 无画面测试：全部 22 台机体、21 位驾驶员轮流上场，在多张地图上打完整局
# 检查涂地、击倒、驾驶员弹出、所有技能和大招都会被用到
# 运行：godot --headless --path godot --script res://tests/sim_test.gd
extends SceneTree

var fails := 0
func ok(c: bool, msg: String) -> void:
	print(("✓ " if c else "✗ ") + msg)
	if not c: fails += 1

func _init() -> void:
	var f := FileAccess.open("res://data/game.json", FileAccess.READ)
	var data: Dictionary = JSON.parse_string(f.get_as_text())
	var mechs: Array = data.order; var pilots: Array = data.pilotOrder
	ok(mechs.size() == 22 and pilots.size() == 21 and data.maps.size() >= 11, "数据：%d 台机体、%d 位驾驶员、%d 张地图" % [mechs.size(), pilots.size(), data.maps.size()])
	var counts := {}
	var total_ms := 0; var total_ticks := 0
	var rounds := 6
	for r in rounds:
		var sim := Sim.new(data, r * 2 % data.maps.size(), 1000 + r, 150.0)
		for i in 8:
			var k := r * 8 + i
			sim.add_player(i + 1, "AI%d" % (i + 1), 1 + i % 2, pilots[k % pilots.size()], mechs[k % mechs.size()], true)
		var t0 := Time.get_ticks_msec()
		var ticks := 0
		while not sim.over and ticks < 170 * 30:
			sim.step(1.0 / 30.0)
			ticks += 1
			for e in sim.events:
				counts[e[0]] = counts.get(e[0], 0) + 1
				if e[0] == "skill" or e[0] == "super": counts[e[0] + ":" + str(e[2])] = counts.get(e[0] + ":" + str(e[2]), 0) + 1
		total_ms += Time.get_ticks_msec() - t0; total_ticks += ticks
		ok(sim.over and sim.result.a + sim.result.b > sim.result.tot * 0.2, "第 %d 局（%s）：涂了 %d / %d 格" % [r + 1, sim.M.name, sim.result.a + sim.result.b, sim.result.tot])
	print("平均每 tick %.2f ms" % (float(total_ms) / total_ticks))
	ok(counts.get("wreck", 0) > 20, "机体被打爆、驾驶员弹出：%d 次" % counts.get("wreck", 0))
	ok(counts.get("mdrop", 0) > 3, "驾驶员活下来，新机体空投：%d 次" % counts.get("mdrop", 0))
	ok(counts.get("ko", 0) > 10, "驾驶员被击倒：%d 次" % counts.get("ko", 0))
	ok(counts.get("lob", 0) > 20, "曲射炮弹：%d 发" % counts.get("lob", 0))
	ok(counts.get("punch", 0) > 20, "近战挥击：%d 次" % counts.get("punch", 0))
	var miss_sk: Array = []; var miss_sp: Array = []
	for pid in pilots:
		var sk: String = data.pilots[pid].skill
		if counts.get("skill:" + sk, 0) == 0: miss_sk.append(sk)
	for mid in mechs:
		var sp: String = data.mechs[mid].special
		if counts.get("super:" + sp, 0) == 0: miss_sp.append(sp)
	ok(miss_sk.is_empty(), "全部 21 个技能都用到了 %s" % str(miss_sk))
	ok(miss_sp.is_empty(), "全部 22 个大招都用到了 %s" % str(miss_sp))
	ok(float(total_ms) / total_ticks < 8.0, "性能：每 tick 少于 8 ms")
	print("\n" + ("全部通过" if fails == 0 else "%d 项失败" % fails))
	quit(1 if fails else 0)
