# 平衡参考（不进 CI）：联动干员 / 机甲和普通角色混在一起打 AI 对局，统计每个联动角色所在队伍的胜率和人均击倒
# 运行：godot --headless --path godot --script res://tests/dawn_balance.gd
extends SceneTree

func _init() -> void:
	var data: Dictionary = JSON.parse_string(FileAccess.get_file_as_string("res://data/game.json"))
	var base_p: Array = data.pilotOrder.filter(func(x): return not x in data.dawn.pilots)
	var base_m: Array = data.order.filter(func(x): return not x in data.dawn.mechs)
	var rn := RandomNumberGenerator.new(); rn.seed = 99
	var stat := {}   # id → [局数, 赢, 击倒, 倒下, 伤害事件]
	var subjects: Array = []
	for pid in data.dawn.pilots: subjects.append(["p", pid])
	for mid in data.dawn.mechs: subjects.append(["m", mid])
	subjects.append(["pm", "coda"])   # 尾声 + 共鸣（能放绝响）
	var N := int(OS.get_environment("N")) if OS.get_environment("N") != "" else 24
	for sj in subjects:
		var key: String = sj[0] + ":" + sj[1]
		stat[key] = [0, 0, 0, 0, 0]
		for g in N:
			var sim := Sim.new(data, g % data.maps.size(), 5000 + g, 120.0, "turf")
			var lay := sim.team_layout()
			for i in lay.size():
				var pid: String = base_p[rn.randi() % base_p.size()]; var mid: String = base_m[rn.randi() % base_m.size()]
				if i == 0:
					if sj[0] == "p": pid = sj[1]
					elif sj[0] == "m": mid = sj[1]
					else: pid = "coda"; mid = "chord"
				sim.add_player(i + 1, "AI%d" % i, lay[i], pid, mid, true, {"lv": 7, "bt": 1})
			var fins := 0
			while not sim.over:
				sim.step(1.0 / 30.0)
				for e in sim.events:
					if e[0] == "finale": fins += 1
			var me: Sim.Mech = sim.players[0]
			var st: Array = stat[key]
			st[0] += 1; st[1] += 1 if sim.winner == me.team else 0; st[2] += me.kills; st[3] += me.deaths; st[4] += fins
	print("角色 | 局数 | 胜率 | 人均击倒 | 人均倒下 | 绝响次数")
	for k in stat:
		var s: Array = stat[k]
		print("%s | %d | %.0f%% | %.1f | %.1f | %d" % [k, s[0], 100.0 * s[1] / maxi(1, s[0]), float(s[2]) / maxi(1, s[0]), float(s[3]) / maxi(1, s[0]), s[4]])
	quit()
