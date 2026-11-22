# 涂鸦机兵 Godot 电脑版 —— 中文 / English（照网页版 i18n.js：代码里都写中文，显示时再换成英文）
#   1. 整句完全匹配词典（网页版 i18n-en.js + 电脑版自己的 i18n_pc.json）
#   2. 带数字的句式：网页版的 PATTERNS + 电脑版词典里带 %d / %s 的格式串（自动转成正则）
#   3. 剩下的按片段替换（长的先换），再把中文标点换成英文标点
class_name I18n
extends RefCounted

static var lang := "zh"
static var D := {}
static var patterns: Array = []    # [RegEx, 替换串]
static var frag: RegEx
static var cache := {}
static var cjk: RegEx
static var loaded := false
static var raw := {}       # 不翻译的字（玩家 / AI 的昵称）

static func keep(s: String) -> String:
	raw[s] = true; return s
const PUNCT := [["，", ", "], ["。", ". "], ["：", ": "], ["；", "; "], ["！", "! "], ["？", "? "], ["、", ", "], ["（", " ("], ["）", ") "],
	["「", "“"], ["」", "”"], ["『", "“"], ["』", "”"], ["～", "~"], ["　", " "], ["——", " — "]]

static func load_all() -> void:
	if loaded: return
	loaded = true
	cjk = RegEx.create_from_string("[\\x{4e00}-\\x{9fff}]")
	var en = JSON.parse_string(FileAccess.get_file_as_string("res://data/i18n_en.json")) if FileAccess.file_exists("res://data/i18n_en.json") else null
	var pc = JSON.parse_string(FileAccess.get_file_as_string("res://data/i18n_pc.json")) if FileAccess.file_exists("res://data/i18n_pc.json") else null
	var fmt: Array = []
	if typeof(pc) == TYPE_DICTIONARY:
		for k in pc:
			if str(k).contains("%"): fmt.append([str(k), str(pc[k])])
			else: D[str(k).strip_edges()] = str(pc[k])
	fmt.sort_custom(func(a, b): return a[0].length() > b[0].length())
	for f in fmt:
		var p := fmt_pattern(f[0], f[1])
		if not p.is_empty(): patterns.append(p)
		else: D[f[0].strip_edges()] = f[1]   # 「+6%」这种不是占位符的 %
	if typeof(en) == TYPE_DICTIONARY:
		for k in en.dict:
			if not D.has(str(k)): D[str(k)] = str(en.dict[k])
		for pr in en.patterns:
			var re := RegEx.create_from_string(str(pr[0]))
			if re.is_valid(): patterns.append([re, str(pr[1])])
	var keys: Array = D.keys().filter(func(k): return cjk.search(k) != null)
	keys.sort_custom(func(a, b): return a.length() > b.length())
	frag = RegEx.create_from_string("|".join(keys.map(func(k): return esc(k))))

static func esc(s: String) -> String:
	var out := ""
	for ch in s:
		if ch in ["\\", "^", "$", ".", "|", "?", "*", "+", "(", ")", "[", "]", "{", "}"]: out += "\\" + ch
		else: out += ch
	return out

# 「第 %d 局：%s」→ 正则「第 (-?\d+) 局：(.+)」，英文「Round %d: %s」→「Round $1: $2」
static func fmt_pattern(zh: String, en: String) -> Array:
	var rx := RegEx.create_from_string("%(%|[+]?[0-9]*(?:\\.[0-9]+)?[dfs])")
	var src := ""; var last := 0; var n := 0
	var ms := rx.search_all(zh)
	if ms.is_empty(): return []
	for i in ms.size():
		var m: RegExMatch = ms[i]
		src += esc(zh.substr(last, m.get_start() - last))
		var t := m.get_string(1)
		if t == "%": src += "%"
		else:
			n += 1
			if t.ends_with("s"): src += "(.+)" if i == ms.size() - 1 and m.get_end() == zh.length() else "(.+?)"
			elif t.ends_with("f"): src += "(-?[0-9.]+)"
			else: src += "([+-]?[0-9]+)"
		last = m.get_end()
	src += esc(zh.substr(last))
	var rep := ""; last = 0; var k := 0
	for m in rx.search_all(en):
		rep += en.substr(last, m.get_start() - last).replace("$", "$$")
		var t := m.get_string(1)
		if t == "%": rep += "%"
		else: k += 1; rep += "$%d" % k
		last = m.get_end()
	rep += en.substr(last).replace("$", "$$")
	if n == 0: return []
	var re := RegEx.create_from_string(src)
	return [re, rep] if re.is_valid() else []

static func t(s: String) -> String:
	if lang != "en" or s == "": return s
	if not loaded: load_all()
	if cjk.search(s) == null or raw.has(s): return s
	if cache.has(s): return cache[s]
	var out := s
	var t := s.strip_edges()
	if D.has(t): out = s.replace(t, D[t])
	else:
		for p in patterns: out = p[0].sub(out, p[1], true)
		if frag != null and frag.is_valid() and cjk.search(out) != null:
			var res := ""; var last := 0
			for m in frag.search_all(out):
				var e: String = D.get(m.get_string(), m.get_string())
				res += out.substr(last, m.get_start() - last)
				var word := RegEx.create_from_string("^\\w|\\w$").search(e) != null
				res += (" " + e + " ") if word else e
				last = m.get_end()
			out = res + out.substr(last)
		for pp in PUNCT: out = out.replace(pp[0], pp[1])
		while out.contains("  "): out = out.replace("  ", " ")
		for c in [",", ".", "!", "?", ":", ";", ")", "”"]: out = out.replace(" " + c, c)
		for c in ["(", "“"]: out = out.replace(c + " ", c)
		out = out.strip_edges() if not (s.begins_with(" ") or s.ends_with(" ")) else out
	if cache.size() > 6000: cache.clear()
	cache[s] = out
	return out
