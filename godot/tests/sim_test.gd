# 无画面测试：全部 25 台机体、24 位驾驶员轮流上场；涂地打 4 局 + 其他 10 种模式各打 1 局
# 检查涂地、击倒、驾驶员弹出、所有技能 / 大招 / 超载都会被用到，每种模式的目标都有人在抢
# 运行：godot --headless --path godot --script res://tests/sim_test.gd
extends SceneTree

var fails := 0
func ok(c: bool, msg: String) -> void:
	print(("✓ " if c else "✗ ") + msg)
	if not c: fails += 1

# 每种模式：看哪个事件能证明目标在运转
const MODE_EVENT := {"zone": "zn", "escort": "grab", "soccer": "goal", "battery": "dep", "elim": "rd", "escape4": "tout", "escape8": "tout", "park": "balloon", "raid": "summon", "seal": "dep"}

func _init() -> void:
	var f := FileAccess.open("res://data/game.json", FileAccess.READ)
	var data: Dictionary = JSON.parse_string(f.get_as_text())
	var mechs: Array = data.order; var pilots: Array = data.pilotOrder
	ok(mechs.size() == 25 and pilots.size() == 24 and data.maps.size() >= 11 and data.modeOrder.size() == 9, "数据：%d 台机体、%d 位驾驶员、%d 张地图、%d 种模式" % [mechs.size(), pilots.size(), data.maps.size(), data.modeOrder.size()])
	var counts := {}
	var total_ms := 0; var total_ticks := 0
	var runs: Array = []
	for r in 4: runs.append(["turf", r * 3 % data.maps.size()])
	for m in data.modeOrder:
		if m != "turf": runs.append([m, 8 if m.begins_with("escape") else (12 if m == "park" else 0)])
	var k0 := 0
	for run in runs:
		var mode: String = run[0]
		var sim := Sim.new(data, run[1], 1000 + k0, 150.0, mode)
		var lay := sim.team_layout()
		for i in lay.size():
			var k := k0 + i
			sim.add_player(i + 1, "AI%d" % (i + 1), lay[i], pilots[k % pilots.size()], mechs[k % mechs.size()], true, {"lv": 7, "bt": 1, "tal": [["a1", "d1", "p1"], ["a5", "d5", "s5"], ["p4", "s4", "a6"], ["s2", "d2", "p3"]][k % 4]})
		k0 += lay.size()
		var t0 := Time.get_ticks_msec()
		var ticks := 0
		var mc := {}
		while not sim.over and ticks < 400 * 30:
			sim.step(1.0 / 30.0)
			ticks += 1
			for e in sim.events:
				counts[e[0]] = counts.get(e[0], 0) + 1
				mc[e[0]] = mc.get(e[0], 0) + 1
				if e[0] == "skill" or e[0] == "super": counts[e[0] + ":" + str(e[2])] = counts.get(e[0] + ":" + str(e[2]), 0) + 1
				if e[0] == "ov": counts["ov:" + sim.players.filter(func(q): return q.id == e[1])[0].pilot] = 1
		total_ms += Time.get_ticks_msec() - t0; total_ticks += ticks
		var name: String = data.modes[mode].name
		if mode == "turf":
			ok(sim.over and sim.result.a + sim.result.b > sim.result.tot * 0.2, "%s（%s）：涂了 %d / %d 格" % [name, sim.M.name, sim.result.a + sim.result.b, sim.result.tot])
		else:
			var key: String = MODE_EVENT[mode]
			var sc: Array = sim.obj.score
			ok(sim.over and mc.get(key, 0) > 0, "%s（%s）：%.0f 秒结束，胜方 %d，「%s」事件 %d 次，比分 %s" % [name, sim.M.name, sim.time, sim.winner, key, mc.get(key, 0), str(sc.slice(1, 3))])
	print("平均每 tick %.2f ms" % (float(total_ms) / total_ticks))
	ok(counts.get("wreck", 0) > 20, "机体被打爆、驾驶员弹出：%d 次" % counts.get("wreck", 0))
	ok(counts.get("mdrop", 0) > 3, "驾驶员活下来，新机体空投：%d 次" % counts.get("mdrop", 0))
	ok(counts.get("ko", 0) > 10, "驾驶员被击倒：%d 次" % counts.get("ko", 0))
	ok(counts.get("punch", 0) > 20, "近战挥击：%d 次" % counts.get("punch", 0))
	var miss_sk: Array = []; var miss_sp: Array = []; var miss_ov: Array = []
	for pid in pilots:
		var sk: String = data.pilots[pid].skill
		if counts.get("skill:" + sk, 0) == 0: miss_sk.append(sk)
		if counts.get("ov:" + pid, 0) == 0: miss_ov.append(pid)
	for mid in mechs:
		var sp: String = data.mechs[mid].special
		if counts.get("super:" + sp, 0) == 0: miss_sp.append(sp)
	ok(miss_sk.is_empty(), "全部 21 个技能都用到了 %s" % str(miss_sk))
	ok(miss_sp.is_empty(), "全部 22 个大招都用到了 %s" % str(miss_sp))
	ok(miss_ov.size() <= 2, "超载：%d / 21 位驾驶员放过 %s" % [21 - miss_ov.size(), str(miss_ov)])
	ok(float(total_ms) / total_ticks < 8.0, "性能：每 tick 少于 8 ms")
	print("\n" + ("全部通过" if fails == 0 else "%d 项失败" % fails))
	quit(1 if fails else 0)
