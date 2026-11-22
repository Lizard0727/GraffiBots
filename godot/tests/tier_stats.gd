# 「从夯到拉」排行用的数据（不进 CI）：全角色、全机体随机组队，AI 同一档（有点实力）互打，统计胜率 / 击倒 / 倒下 / 伤害 / 涂地
# 运行：godot --headless --path godot --script res://tests/tier_stats.gd     （N=局数，SEED=种子，OUT=输出 json）
extends SceneTree

func _init() -> void:
	var data: Dictionary = JSON.parse_string(FileAccess.get_file_as_string("res://data/game.json"))
	var N := int(OS.get_environment("N")) if OS.get_environment("N") != "" else 20
	var seed0 := int(OS.get_environment("SEED")) if OS.get_environment("SEED") != "" else 1
	var rn := RandomNumberGenerator.new(); rn.seed = seed0
	var modes := ["turf", "zone", "elim", "battery"]
	var st := {}   # "p:id" / "m:id" → [局, 赢, 击倒, 倒下, 伤害, 涂地]
	for g in N:
		var mode: String = modes[g % modes.size()]
		var sim := Sim.new(data, rn.randi() % 12, seed0 * 1000 + g, 120.0, mode)
		var lay := sim.team_layout()
		for i in lay.size():
			var p := sim.add_player(i + 1, "AI%d" % i, lay[i], data.pilotOrder[rn.randi() % data.pilotOrder.size()], data.order[rn.randi() % data.order.size()], true, {"lv": 7, "bt": 1})
			p.persona = "skilled"; p.pz = data.bots.personas["skilled"]
		var dmg := {}
		var ticks := 0
		while not sim.over and ticks < 30 * 260:
			sim.step(1.0 / 30.0); ticks += 1
			for e in sim.events:
				if e[0] == "dmg" and int(e[3]) != 0: dmg[int(e[3])] = dmg.get(int(e[3]), 0) + int(e[2])
		for p in sim.players:
			if p.npc: continue
			var won := 1 if sim.winner == p.team else 0
			for k in ["p:" + p.pilot, "m:" + p.weapon]:
				if not st.has(k): st[k] = [0, 0, 0, 0, 0, 0]
				var s: Array = st[k]
				s[0] += 1; s[1] += won; s[2] += p.kills; s[3] += p.deaths; s[4] += dmg.get(p.id, 0); s[5] += p.painted
	var out := OS.get_environment("OUT") if OS.get_environment("OUT") != "" else "user://tier_stats.json"
	var f := FileAccess.open(out, FileAccess.WRITE); f.store_string(JSON.stringify(st)); f.close()
	print("完成 %d 局 → %s" % [N, out])
	quit()
