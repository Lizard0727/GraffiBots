# 涂鸦机兵 Godot 电脑版 —— 对局聊天里的 AI（移植网页版 core.js 的 BotChat）
# AI 按性格打字：开局打招呼、击毁时嘚瑟、被打倒时甩锅、队友倒下安慰、半场领先 / 落后、闲聊、回真人的话；有打字时间、会打错字
class_name BotChat
extends RefCounted

const STYLE_TEAM := {"toxic": 0.3, "show": 0.4, "lead": 0.9, "noob": 0.6, "nice": 0.5, "chill": 0.5, "afk": 0.2}
const FORCE_CH := {"allyDied": 1, "praise": 1, "winning": 1, "losing": 1, "streakDeath": 1, "endWin": 0, "endLose": 0}
const REACT := {"bot": 0.85, "insult": 0.6, "hi": 0.55, "gg": 0.6, "praise": 0.5, "help": 0.6, "laugh": 0.3, "ask": 0.5, "other": 0.25}

var game
var sim: Sim
var t := 0.0
var q: Array = []          # [{at, p, text, ch, depth, style}]
var used := {}
var gap_until := 0.0
var idle_t := 40.0
var mid_done := false
var st := {}               # id → {chatty, said, chat_at, streak, deaths}

func _init(g, s: Sim) -> void:
	game = g; sim = s
	idle_t = randf_range(30, 55)
	for p in sim.players:
		if not p.bot or p.persona == "": continue
		var Pz := Bots.persona(p.persona)
		st[p.id] = {"chatty": float(Pz.get("chat", 0.3)) * randf_range(0.4, 1.6) if randf() < 0.7 else 0.0, "said": 0, "chat_at": -99.0, "streak": 0, "deaths": 0}
	for p in sim.players:
		if st.has(p.id) and float(st[p.id].chatty) > 0 and randf() < 0.3 + float(st[p.id].chatty) * 0.3:
			say(p, "start", {"delay": randf_range(0.5, sim.countdown + 7.0)})

func bots(filter: Callable) -> Array:
	return sim.players.filter(func(p): return st.has(p.id) and filter.call(p))

func say(p, trigger: String, o := {}) -> bool:
	if p == null or not st.has(p.id): return false
	var ps: Dictionary = st[p.id]
	var reply: bool = o.get("reply", false); var is_end: bool = o.get("end", false)
	var chatty: float = float(ps.chatty) if float(ps.chatty) > 0 else (0.2 if reply and randf() < 0.15 else 0.0)
	if chatty <= 0: return false
	if not reply and not is_end:
		if int(ps.said) >= 2 + int(round(chatty * 8)): return false
		if t < float(ps.chat_at) + 7.0 or t < gap_until: return false
	if p.afk_t > 0 and not is_end: return false
	var table: Dictionary = Bots.B.reply if reply else Bots.B.lines
	var T = table.get(trigger)
	if T == null: return false
	var style := Bots.style(p.persona)
	var arr: Array = T.get(style, [])
	if arr.is_empty():
		if style == "afk" and not is_end: return false
		style = "nice" if T.has("nice") else T.keys()[0]; arr = T.get(style, [])
	var fresh: Array = arr.filter(func(l): return str(l[0]).strip_edges() != "" and (not used.has(l[0]) or str(l[0]).length() <= 3))
	if fresh.is_empty(): return false
	var line: Array = fresh.pick_random()
	var text := Bots.humanize(str(line[0])) if I18n.lang != "en" or line.size() < 2 else str(line[1])
	used[line[0]] = true
	var ch: int = int(o.ch) if o.has("ch") else (int(FORCE_CH[trigger]) if FORCE_CH.has(trigger) else (1 if randf() < float(STYLE_TEAM.get(style, 0.5)) else 0))
	var at := t + float(o.get("delay", 0.0)) + Bots.type_time(text) * (0.5 if is_end else 1.0)
	q.append({"at": at, "p": p, "text": text, "ch": ch, "depth": int(o.get("depth", 0)), "style": style})
	ps.said = int(ps.said) + 1; ps.chat_at = t; gap_until = t + randf_range(1.2, 3.0)
	# 活着打长句的普通玩家会停下来打字
	if p.alive and text.length() >= 6 and not p.persona in ["top", "god", "expert"] and randf() < 0.4: p.typing_t = at - t
	return true

func tick(dt: float) -> void:
	t += dt
	var i := 0
	while i < q.size():
		var m: Dictionary = q[i]
		if float(m.at) <= t: q.remove_at(i); deliver(m)
		else: i += 1
	if sim.countdown > 0 or sim.over: return
	idle_t -= dt
	if idle_t <= 0:
		idle_t = randf_range(25, 55)
		var c := bots(func(p): return float(st[p.id].chatty) > 0)
		if not c.is_empty(): say(c.pick_random(), "idle")
	if not mid_done and sim.time > sim.time_left and sim.teams == 2:   # 过了半场
		mid_done = true
		var lead := lead_team()
		if lead > 0:
			for tm in [1, 2]:
				var c2 := bots(func(p): return p.team == tm and float(st[p.id].chatty) > 0)
				if not c2.is_empty() and randf() < 0.6: say(c2.pick_random(), "winning" if tm == lead else "losing", {"delay": randf_range(0, 6)})

func lead_team() -> int:
	if sim.mode == "turf" or not sim.obj.has("score"):
		var a := 0; var b := 0
		for p in sim.players: if p.team == 1: a += p.painted
		for p in sim.players: if p.team == 2: b += p.painted
		return 0 if a == b else (1 if a > b else 2)
	var s: Dictionary = sim.obj.score
	return 0 if int(s.get(1, 0)) == int(s.get(2, 0)) else (1 if int(s.get(1, 0)) > int(s.get(2, 0)) else 2)

func deliver(m: Dictionary) -> void:
	var p = m.p
	if not is_instance_valid(game) or game.sim != sim: return
	game.chat_add(p, str(m.text), int(m.ch))
	if int(m.depth) == 0 and (m.style == "toxic" or m.style == "show" or randf() < 0.25) and randf() < 0.3: react(p, str(m.text), int(m.ch), 1)

# 有人说话（真人或 AI）：看得到这句话的 AI 可能回一句
func react(from, text: String, ch: int, depth: int) -> void:
	var cls := Bots.classify(text)
	var cand := bots(func(p): return p != from and (ch != 1 or p.team == from.team) and p.afk_t <= 0)
	if cand.is_empty(): return
	if randf() > float(REACT.get(cls, 0.25)) * (0.6 if depth > 0 else 1.0): return
	var n := 2 if cls == "bot" and randf() < 0.35 else 1
	cand.sort_custom(func(a, b): return float(st[a.id].chatty) * randf() > float(st[b.id].chatty) * randf())
	for p in cand.slice(0, n): say(p, cls, {"reply": true, "ch": ch, "depth": depth, "delay": randf_range(0.3, 1.4)})

func on_kill(by, tg) -> void:
	if tg == null: return
	if by != null and st.has(by.id) and by.team != tg.team:
		var ps: Dictionary = st[by.id]; ps.streak = int(ps.streak) + 1
		if int(ps.streak) == 3 and randf() < 0.5: say(by, "multi")
		elif randf() < 0.16: say(by, "kill")
	if st.has(tg.id):
		var pt: Dictionary = st[tg.id]; pt.streak = 0; pt.deaths = int(pt.deaths) + 1
		if int(pt.deaths) >= 3 and randf() < 0.4: pt.deaths = 0; say(tg, "streakDeath", {"delay": randf_range(0.5, 2)})
		elif randf() < 0.14: say(tg, "killed", {"delay": randf_range(0.3, 1.5)})
	if by != null and by.team != tg.team:
		var mates := bots(func(p): return p.team == tg.team and p != tg)
		if not mates.is_empty() and randf() < (0.06 if tg.bot else 0.12): say(mates.pick_random(), "allyDied", {"delay": randf_range(0.5, 2)})
		var streak: int = int(st[by.id].streak) if st.has(by.id) else 1
		var fans := bots(func(p): return p.team == by.team and p != by)
		if not fans.is_empty() and randf() < (0.4 if streak >= 3 else (0.03 if by.bot else 0.08)): say(fans.pick_random(), "praise", {"delay": randf_range(0.5, 2)})

func on_end(winner: int) -> void:
	for p in sim.players:
		if not st.has(p.id): continue
		var c: float = float(st[p.id].chatty)
		if randf() > (0.35 + c * 0.4 if c > 0 else 0.06): continue
		if c <= 0: st[p.id].chatty = 0.1
		say(p, "endWin" if p.team == winner else "endLose", {"end": true, "delay": randf_range(0.1, 1.5)})
