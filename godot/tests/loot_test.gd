# 无画面测试：搜刮撤离（超大地图 + 18 个 AI + 守卫 / Boss 小队），检查搜索、撤离、战斗和性能
# 运行：godot --headless --path godot --script res://tests/loot_test.gd
extends SceneTree

func _init() -> void:
	var data: Dictionary = JSON.parse_string(FileAccess.open("res://data/game.json", FileAccess.READ).get_as_text())
	var sim := Sim.new(data, 0, 42, 720.0, "loot")
	var lay := sim.team_layout()
	for i in lay.size(): sim.add_player(i + 1, "AI", lay[i], data.pilotOrder[i % 21], data.order[i % 22], true, {"lv": 5, "bt": 1})
	sim.setup_loot_guards(5)
	var c := {}; var ticks := 0; var t0 := Time.get_ticks_msec()
	while not sim.over and ticks < 30 * 730:
		sim.step(1.0 / 30); ticks += 1
		for e in sim.events: c[e[0]] = c.get(e[0], 0) + 1
	var ms := float(Time.get_ticks_msec() - t0) / ticks
	var fails := 0
	var chk := func(ok: bool, msg: String):
		print(("✓ " if ok else "✗ ") + msg)
		if not ok: fails += 1
	chk.call(sim.obj.conts.size() >= 800 and sim.players.size() >= 50, "灰城禁区：%d 个容器、%d 个单位（玩家 + 守卫 + Boss 小队）" % [sim.obj.conts.size(), sim.players.size()])
	chk.call(c.get("srch", 0) > 150, "搜出物资 %d 件" % c.get("srch", 0))
	chk.call(c.get("exd", 0) >= 1, "成功撤离 %d 人" % c.get("exd", 0))
	chk.call(c.get("ko", 0) + c.get("wreck", 0) > 5, "交火：击毁 %d、击倒 %d" % [c.get("wreck", 0), c.get("ko", 0)])
	chk.call(sim.over, "对局结束（%d 秒）" % int(sim.time))
	chk.call(ms < 12.0, "性能：每 tick %.2f ms" % ms)
	print("\n" + ("全部通过" if fails == 0 else "%d 项失败" % fails))
	quit(1 if fails else 0)
