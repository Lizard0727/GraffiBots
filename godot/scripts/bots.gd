# 涂鸦机兵 Godot 电脑版 —— AI 玩家：性格（菜鸟 / 猪玩家 / 挂机 / 不错 / 高手 / 操作顶尖 / 大神）、像真人的昵称、外观、聊天
# 数据来自网页版 bots.js（tools/export-godot-data.js 导出到 game.json 的 bots）
class_name Bots
extends RefCounted

static var B: Dictionary = {}
static var skins: Array = []
const MAX_LV := 11

static func init(data: Dictionary) -> void:
	B = data.get("bots", {})
	skins = data.econ.get("skins", [])

static func persona(id: String) -> Dictionary:
	return B.personas.get(id, B.personas.decent)

static func persona_name(id: String) -> String: return str(persona(id).name)

# 性格比例：普通赛按玩家等级插值，排位赛按段位
static func mix(tier: int, lv: int) -> Array:
	if tier >= 0:
		var R: Array = B.mix.rank
		return R[mini(R.size() - 1, tier)]
	var k := clampf((lv - 1) / float(MAX_LV - 1), 0.0, 1.0)
	var out: Array = []
	for i in B.mix.low.size(): out.append(lerpf(float(B.mix.low[i]), float(B.mix.high[i]), k))
	return out

static func roll(tier: int, lv: int) -> String:
	var w := mix(tier, lv)
	var tot := 0.0
	for x in w: tot += float(x)
	var r := randf() * tot
	for i in w.size():
		r -= float(w[i])
		if r < 0: return str(B.order[i])
	return "decent"

# 给一局里所有 AI 分配性格；两队实力差太多就重抽（最多 5 次）
static func assign(slot_teams: Array, tier: int, humans: Dictionary, lv: int) -> Array:
	var best: Array = []; var best_gap := INF
	for k in 5:
		var ids: Array = []
		for _s in slot_teams: ids.append(roll(tier, lv))
		var pw := {}
		for t in humans: pw[t] = float(pw.get(t, 0.0)) + float(humans[t]) * 1.2
		for i in slot_teams.size(): pw[slot_teams[i]] = float(pw.get(slot_teams[i], 0.0)) + float(persona(ids[i]).pow)
		var v: Array = pw.values()
		var gap: float = (v.max() - v.min()) if v.size() > 1 else 0.0
		if gap < best_gap: best = ids; best_gap = gap
		if gap <= 2.2: break
	return best

static func nicks(n: int) -> Array:
	var used := {}; var out: Array = []
	var zh_re := RegEx.create_from_string("[\\x{4e00}-\\x{9fff}]$")
	for i in n:
		for k in 20:
			var s: String = (B.nicksZh if randf() < 0.7 else B.nicksEn).pick_random()
			if randf() < 0.3:
				s += (["", "丶", "_", ""].pick_random() + str(randi_range(1, 998))) if zh_re.search(s) else str(randi_range(1, 98))
			s = s.substr(0, 12)
			if not used.has(s): used[s] = true; out.append(s); break
		if out.size() <= i: out.append("玩家%d" % randi_range(1000, 9999))
	return out

# 外观：越强的性格越可能穿稀有皮肤；段位框只在高段位出现
static func looks(pilot: String, pid: String, tier: int) -> Dictionary:
	var Pz := persona(pid); var L := {}
	var own := func(k: Dictionary) -> bool:
		return float(k.get("price", 0)) > 0 or k.get("pass", null) != null or (k.get("event", null) != null and randf() < 0.5) \
			or (str(k.get("rank", "")) == "master" and tier >= 6) or (k.get("road", null) != null and tier >= 4 and randf() < 0.6) or (k.get("shards", null) != null and tier >= 7 and randf() < 0.5)
	var choose := func(kind: String, pil: String) -> String:
		var list: Array = skins.filter(func(k): return str(k.kind) == kind and (pil == "" or str(k.get("pilot", "")) == pil) and own.call(k))
		return str(list.pick_random().id) if not list.is_empty() else ""
	var sk := float(Pz.get("skin", 0.3))
	if randf() < sk: L.pskin = choose.call("pilot", pilot)
	if randf() < sk * 0.8: L.paint = choose.call("mech", "")
	if randf() < sk * 0.6: L.fx = choose.call("fx", "")
	if randf() < sk: L.frame = choose.call("frame", "")
	if randf() < 0.5: L.avatar = choose.call("avatar", "")
	for k in L.keys():
		if L[k] == "": L.erase(k)
	return L

# ---------------- 聊天 ----------------
static func style(pid: String) -> String:
	var w: Dictionary = persona(pid).get("styles", {"nice": 1})
	var tot := 0.0
	for k in w: tot += float(w[k])
	var r := randf() * tot
	for k in w:
		r -= float(w[k])
		if r < 0: return k
	return "nice"

# 挑一句（[中文, English]，只用中文）；这个风格没话说就换友好 / 佛系，再没有就不说
static func line(table: String, trigger: String, pid: String) -> String:
	var T = B.get(table, {}).get(trigger)
	if T == null: return ""
	var st := style(pid)
	var arr: Array = T.get(st, [])
	if arr.is_empty():
		if st == "afk" or randf() < 0.5: return ""
		arr = T.get("nice", T.get("chill", []))
	arr = arr.filter(func(x): return str(x[0]).strip_edges() != "")
	return str(arr.pick_random()[0]) if not arr.is_empty() else ""

const ZH_TYPO := {"的": "得", "在": "再", "了": "啦", "吗": "嘛", "吧": "把", "好": "号", "我": "窝"}
static func humanize(zh: String) -> String:
	var a := zh
	if randf() < 0.3: a = a.trim_suffix("。").trim_suffix("！").trim_suffix("!").trim_suffix("，")
	if randf() < 0.12:
		var ks: Array = ZH_TYPO.keys().filter(func(k): return a.contains(k))
		if not ks.is_empty(): var k: String = ks.pick_random(); a = a.replace(k, ZH_TYPO[k])
	if randf() < 0.08:
		if a.ends_with("哈"): a += "哈哈"
		elif a.ends_with("？") or a.ends_with("?"): a += "??"
	return a

static func type_time(zh: String) -> float: return randf_range(0.6, 1.8) + zh.length() * randf_range(0.14, 0.3)

static func classify(text: String) -> String:
	var t := text.to_lower()
	var test := func(p: String) -> bool: return RegEx.create_from_string(p).search(t) != null
	if test.call("人机|机器人|\\bai\\b|\\bbots?\\b|电脑|脚本|npc|假人"): return "bot"
	if test.call("^\\s*(gg|ggwp|gg ez|good game)"): return "gg"
	if test.call("菜|垃圾|废物|noob|trash|bad|会不会|送|sb|idiot|stupid|loser|笨"): return "insult"
	if test.call("nice|666|厉害|强|牛|好样|wp|well played|good job|gj|漂亮|帅"): return "praise"
	if test.call("help|救|支援|来人|帮"): return "help"
	if test.call("^(hi|hello|hey|yo|你好|哈喽|嗨|在吗)"): return "hi"
	if test.call("哈哈|hhh|lol|lmao|xd"): return "laugh"
	if test.call("[?？]|怎么|什么|为什么|how|what|why"): return "ask"
	return "other"
