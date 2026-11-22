# AI 行为审计（不进 CI 的长测试 / CI 里跑短版）：每种模式量一下 AI 有没有在做这个模式该做的事
# 运行：godot --headless --path godot --script res://tests/ai_audit.gd    （N=局数，默认 3）
extends SceneTree

var fails := 0
func ok(c: bool, msg: String) -> void:
	print(("✓ " if c else "✗ ") + msg)
	if not c: fails += 1

func _init() -> void:
	var data: Dictionary = JSON.parse_string(FileAccess.get_file_as_string("res://data/game.json"))
	var N := int(OS.get_environment("N")) if OS.get_environment("N") != "" else 3
	var strict := OS.get_environment("STRICT") != ""
	var rn := RandomNumberGenerator.new(); rn.seed = 7
	var modes: Array = data.modeOrder.duplicate()
	if OS.get_environment("MODES") != "": modes = OS.get_environment("MODES").split(",")
	for mode in modes:
		var kp := {}
		for g in N:
			var map_i: int = 12 if mode == "park" else (8 if mode.begins_with("escape") else (g * 3) % data.maps.size())
			var sim := Sim.new(data, map_i, 900 + g * 17, 150.0, mode)
			var lay := sim.team_layout()
			var tiers: Array = data.bots.order
			for i in lay.size():
				var p := sim.add_player(i + 1, "AI%d" % i, lay[i], data.pilotOrder[rn.randi() % data.pilotOrder.size()], data.order[rn.randi() % data.order.size()], true, {"lv": 7, "bt": 1})
				p.persona = tiers[i % tiers.size()]; p.pz = data.bots.personas[p.persona]
			var ticks := 0; var in_zone := 0; var samples := 0; var carry_to := 0; var carry_n := 0; var circle_out := 0; var near_float := 0
			var ev := {}
			while not sim.over and ticks < 30 * 200:
				sim.step(1.0 / 30.0); ticks += 1
				for e in sim.events: ev[e[0]] = ev.get(e[0], 0) + 1
				if ticks % 15 != 0: continue
				for p in sim.players:
					if not p.alive or p.npc: continue
					samples += 1
					match mode:
						"zone":
							var Z: Dictionary = sim.MC.ZONE
							if p.x > float(Z.x0) * 16 and p.x < float(Z.x1) * 16 and p.y > float(Z.y0) * 16 and p.y < float(Z.y1) * 16: in_zone += 1
						"escort":
							if sim.obj.tr.carrier == p:
								carry_n += 1
								var gl: Vector2 = sim.goal_for(p.team)
								if Vector2(p.vx, p.vy).dot(gl - Vector2(p.x, p.y)) > 0: carry_to += 1
						"battery":
							if p.carry >= 3:
								carry_n += 1
								if Vector2(p.vx, p.vy).dot(sim.base_pos(p.team) - Vector2(p.x, p.y)) > 0: carry_to += 1
						"escape4", "escape8":
							var c: Dictionary = sim.obj.circle
							if Vector2(p.x - c.x, p.y - c.y).length() > c.r: circle_out += 1
						"park":
							if Vector2(p.x - sim.obj.fl.x, p.y - sim.obj.fl.y).length() < 160: near_float += 1
			var s: Dictionary = kp
			s.games = int(s.get("games", 0)) + 1
			s.zone = float(s.get("zone", 0.0)) + float(in_zone) / maxf(1, samples)
			s.carry = float(s.get("carry", 0.0)) + (float(carry_to) / carry_n if carry_n > 0 else 1.0)
			s.out = float(s.get("out", 0.0)) + float(circle_out) / maxf(1, samples)
			s.float = float(s.get("float", 0.0)) + float(near_float) / maxf(1, samples)
			for k in ["goal", "touch", "dep", "grab", "zn", "balloon", "wreck", "ko", "tout"]: s[k] = int(s.get(k, 0)) + int(ev.get(k, 0))
			s.time = float(s.get("time", 0.0)) + sim.time
		var G := float(kp.games)
		var line := "%s：平均 %.0f 秒" % [mode, kp.time / G]
		match mode:
			"turf": ok(true, line)
			"zone":
				line += "，AI 在据点里的时间 %.0f%%，占点事件 %.1f/局" % [100.0 * kp.zone / G, kp.zn / G]
				ok(kp.zone / G > (0.3 if strict else 0.15), line)
			"escort":
				line += "，持宝者朝终点走的比例 %.0f%%，抢到宝物 %.1f 次/局" % [100.0 * kp.carry / G, kp.grab / G]
				ok(kp.carry / G > (0.7 if strict else 0.5), line)
			"soccer":
				line += "，进球 %.1f/局" % (kp.goal / G)
				ok(kp.goal / G >= (2.0 if strict else 1.0), line)
			"battery":
				line += "，满载电池往家走的比例 %.0f%%，存入 %.1f 次/局" % [100.0 * kp.carry / G, kp.dep / G]
				ok(kp.carry / G > (0.7 if strict else 0.5) and kp.dep / G > 3, line)
			"park":
				line += "，花车附近的时间 %.0f%%，打爆气球 %.1f/局" % [100.0 * kp.float / G, kp.balloon / G]
				ok(kp.float / G > (0.35 if strict else 0.2), line)
			"elim": ok(true, line + "，击倒 %.1f/局" % (kp.ko / G))
			"escape4", "escape8":
				line += "，在毒圈外的时间 %.1f%%" % (100.0 * kp.out / G)
				ok(kp.out / G < (0.05 if strict else 0.1), line)
	print("失败 %d 项" % fails)
	quit(1 if fails > 0 and strict else 0)
