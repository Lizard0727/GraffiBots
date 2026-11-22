# 撤离模式性能分析（不进 CI）：超大地图 + 满员 AI，按段统计 sim 每 tick 的耗时
# 运行：godot --headless --path godot --script res://tests/loot_prof.gd    （SECS=模拟秒数）
extends SceneTree

func _init() -> void:
	var data: Dictionary = JSON.parse_string(FileAccess.open("res://data/game.json", FileAccess.READ).get_as_text())
	var sim := Sim.new(data, 0, 42, 720.0, "loot")
	var lay := sim.team_layout()
	for i in lay.size(): sim.add_player(i + 1, "AI", lay[i], data.pilotOrder[i % data.pilotOrder.size()], data.order[i % data.order.size()], i > 0 or OS.get_environment("HUMAN") == "", {"lv": 5, "bt": 1})
	sim.setup_loot_guards(5)
	sim.prof_on = true
	var secs := float(OS.get_environment("SECS")) if OS.get_environment("SECS") != "" else 30.0
	var n := 0; var worst := 0.0; var wsec := {}; var wt := 0.0; var t0 := Time.get_ticks_usec()
	while not sim.over and sim.time < secs:
		var before := sim.prof.duplicate()
		var a := Time.get_ticks_usec(); sim.step(1.0 / 30); n += 1
		var dms := (Time.get_ticks_usec() - a) / 1000.0
		if dms > worst and sim.time > 2.0:
			worst = dms; wsec = {}
			for k in sim.prof: wsec[k] = float(sim.prof[k]) - float(before.get(k, 0.0))
			wt = sim.time
	var tot := (Time.get_ticks_usec() - t0) / 1000.0
	print("单位 %d，tick %d，平均 %.2f ms，最慢 %.1f ms" % [sim.players.size(), n, tot / n, worst])
	for k in sim.prof: print("  %s %.2f ms/tick" % [k, sim.prof[k] / n])
	print("最慢那一 tick（%.1f 秒）：" % wt, wsec)
	quit()
