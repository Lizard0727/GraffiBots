# 隐身测试：玩家一直隐身站着，旁边站一个 AI；看各档 AI 朝玩家方向开火的比例（看得见时作对照）
extends SceneTree
func _init() -> void:
	var data: Dictionary = JSON.parse_string(FileAccess.get_file_as_string("res://data/game.json"))
	var fails := 0
	for tier in data.bots.order:
		var res := {}
		for cloak in [false, true]:
			var aimed := 0; var fired := 0; var dmg := 0.0
			for g in 4:
				var sim := Sim.new(data, 5, 300 + g, 60.0, "turf")
				var me := sim.add_player(1, "me", 1, "blaze", "blaster", false, {"lv": 7})
				var ai := sim.add_player(2, "ai", 2, "blaze", "blaster", true, {"lv": 7})
				ai.persona = tier; ai.pz = data.bots.personas[tier]
				sim.countdown = 0
				me.x = 900; me.y = 640; ai.x = 900 + 220 + g * 20; ai.y = 640 + g * 30
				me.inv_t = 0; ai.inv_t = 0
				# 先让 AI 看见玩家 1 秒，再隐身
				for i in 30 * 9:
					if cloak and i >= 30: me.cloak_t = 5.0
					var hp0 := me.hp
					me.inp.mx = 0.0; me.inp.my = 0.0; me.inp.f = false
					if cloak and i >= 30 and i < 50: me.y += 8.0   # 隐身后挪开一段（正常玩家都会这么做）
					if i % 60 == 0 and i > 60: me.x += 30
					sim.step(1.0 / 30.0)
					me.hp = max_f(me.hp, 1.0)
					if i < 30: continue
					for e in sim.events:
						if e[0] == "dmg" and int(e[1]) == me.id and int(e[3]) == ai.id: dmg += float(e[2])
					if ai.firing:
						fired += 1
						var a := atan2(me.y - ai.y, me.x - ai.x)
						if absf(wrapf(float(ai.inp.a) - a, -PI, PI)) < 0.18: aimed += 1
			res[cloak] = [aimed, fired, dmg]
		var v: Array = res[false]; var c: Array = res[true]
		print("%s：看得见时朝玩家开火 %d 帧；隐身时 %d 帧（总开火 %d），隐身时被 AI 打中 %.0f 伤害（看得见时 %.0f）" % [data.bots.personas[tier].name, v[0], c[0], c[1], c[2], v[2]])
		if tier in ["noob", "normal"] and c[2] > v[2] * 0.2: fails += 1; print("  ✗ 不该看得见")
		if c[2] > v[2] * 0.6: fails += 1; print("  ✗ 隐身后还打得太准")
	print("失败 %d 项" % fails)
	quit(1 if fails > 0 else 0)
func max_f(a: float, b: float) -> float: return a if a > b else b
