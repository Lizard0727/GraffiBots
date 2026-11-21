# 涂鸦机兵 Godot 电脑版 —— 账号：和网页版 / 安卓版共用同一套账号
# 1) 本机账号：格式和网页版 account.js 完全一样（密码加盐后 4000 轮 SHA-256），
#    所以网页版「导出转移码」得到的 GBACC1 码可以直接导进电脑版，用原来的密码登录；电脑版导出的码也能导回网页版
# 2) 在线账号：连接 node server.js 开的游戏服务器（ws://地址:3000/ws），用账号密码登录后把服务器上的进度下载到这台电脑
# 没登录时用「游客」存档（user://profile.json，就是以前的存档）
class_name Accounts
extends RefCounted

const PATH := "user://accounts.json"
const GUEST_PATH := "user://profile.json"
const ROUNDS := 4000
const JS_VERSION := 2     # 网页版 economy.js 的存档版本

var data := {"last": "", "list": {}, "server": ""}   # list: { 小写名: {name, salt, hash, created, online} }
var path := PATH
var prefix := "user://acc_"

func _init(file := PATH, profile_prefix := "user://acc_") -> void:
	path = file; prefix = profile_prefix
	if not FileAccess.file_exists(path): return
	var f := FileAccess.open(path, FileAccess.READ)
	if f == null: return
	var v = JSON.parse_string(f.get_as_text())
	if typeof(v) != TYPE_DICTIONARY: return
	for k in v: data[k] = v[k]
	if not data.list.has(str(data.last)): data.last = ""

func save() -> void:
	var f := FileAccess.open(path, FileAccess.WRITE)
	if f != null: f.store_string(JSON.stringify(data))

# ---------------- 和网页版一样的哈希 ----------------
static func sha256(b: PackedByteArray) -> PackedByteArray:
	var h := HashingContext.new(); h.start(HashingContext.HASH_SHA256); h.update(b); return h.finish()

static func hash_pass(pw: String, salt: String) -> String:
	var first := salt.to_utf8_buffer(); first.append(0); first.append_array(pw.to_utf8_buffer())
	var h := sha256(first)
	var sb := salt.to_utf8_buffer()
	for i in ROUNDS - 1: h = sha256(h + sb)
	return h.hex_encode()

static func rand_hex(n: int) -> String:
	return Crypto.new().generate_random_bytes(n).hex_encode()

static func name_ok(n: String) -> bool:
	var re := RegEx.create_from_string("^[\\x{4e00}-\\x{9fa5}A-Za-z0-9_]{2,12}$")
	return re.search(n) != null

static func pass_ok(p: String) -> bool: return p.length() >= 6 and p.length() <= 64

const NAME_HINT := "账号名 2 到 12 个字：中文、字母、数字或下划线"
const PASS_HINT := "密码至少 6 位"

# ---------------- 账号库 ----------------
func current() -> String: return str(data.last)
func current_name() -> String: return str(data.list[data.last].name) if data.last != "" else ""
func is_online(key: String) -> bool: return key != "" and data.list.has(key) and bool(data.list[key].get("online", false))

func profile_path(key: String) -> String:
	if key == "" or not data.list.has(key): return GUEST_PATH
	return prefix + "%s.json" % key.sha256_text().substr(0, 16)

func list() -> Array:
	var out: Array = []
	for k in data.list:
		var a: Dictionary = data.list[k]
		out.append({"key": k, "name": a.name, "created": a.created, "online": a.get("online", false)})
	return out

# 注册：把现在的进度（通常是游客进度）带进新账号
func register(name: String, pw: String, profile: Dictionary) -> Dictionary:
	name = name.strip_edges()
	if not name_ok(name): return {"ok": false, "err": NAME_HINT}
	if not pass_ok(pw): return {"ok": false, "err": PASS_HINT}
	var k := name.to_lower()
	if data.list.has(k): return {"ok": false, "err": "这个账号名在这台电脑上已经有了"}
	var salt := rand_hex(16)
	data.list[k] = {"name": name, "salt": salt, "hash": hash_pass(pw, salt), "created": int(Time.get_unix_time_from_system() * 1000)}
	var p := profile.duplicate(true); p.name = name
	write_profile(k, p)
	data.last = k; save()
	return {"ok": true, "key": k}

func login(name: String, pw: String) -> Dictionary:
	var k := name.strip_edges().to_lower()
	var a = data.list.get(k)
	if a == null or hash_pass(pw, str(a.salt)) != str(a.hash): return {"ok": false, "err": "账号或密码不对"}
	data.last = k; save()
	return {"ok": true, "key": k}

func logout() -> void:
	data.last = ""; save()

func remove(key: String, pw: String) -> Dictionary:
	var a = data.list.get(key)
	if a == null or hash_pass(pw, str(a.salt)) != str(a.hash): return {"ok": false, "err": "密码不对"}
	DirAccess.remove_absolute(ProjectSettings.globalize_path(profile_path(key)))
	data.list.erase(key)
	if data.last == key: data.last = ""
	save()
	return {"ok": true}

func write_profile(key: String, p: Dictionary) -> void:
	var f := FileAccess.open(profile_path(key), FileAccess.WRITE)
	if f != null: f.store_string(JSON.stringify(p))

func read_profile(key: String) -> Dictionary:
	var path := profile_path(key)
	if not FileAccess.file_exists(path): return {}
	var v = JSON.parse_string(FileAccess.get_file_as_string(path))
	return v if typeof(v) == TYPE_DICTIONARY else {}

# ---------------- 存档格式转换（电脑版 v1 ↔ 网页版 v2，字段基本一样）----------------
static func to_js(o: Dictionary, D: Dictionary) -> Dictionary:
	var p := o.duplicate(true)
	p.v = JS_VERSION
	p.pass.s = int(D.econ.pass.get("sid", 2))
	if not p.rank.has("got"): p.rank.got = []
	var w: Dictionary = p.get("wear", {})
	for k in w.keys():
		if typeof(w[k]) == TYPE_STRING and w[k] == "": w.erase(k)
	for k in ["ranked", "risk"]: p.erase(k)   # 只有电脑版用的界面状态
	return p

static func from_js(p: Dictionary, D: Dictionary) -> Dictionary:
	var o := p.duplicate(true)
	if int(p.get("v", 0)) != JS_VERSION: return {}
	o.v = Profile.VERSION
	var w: Dictionary = o.get("wear", {})
	if typeof(w) != TYPE_DICTIONARY: w = {}
	if not w.has("pilot"): w.pilot = {}
	for k in ["mech", "fx", "frame", "avatar"]:
		if not w.has(k): w[k] = ""
	o.wear = w
	if typeof(o.get("pass")) != TYPE_DICTIONARY or int(o.pass.get("s", 0)) != int(D.econ.pass.get("sid", 2)):
		o.pass = {"xp": 0, "prem": false, "dlx": false, "cf": [], "cp": [], "bc": 0}   # 不是这个赛季的通行证：和网页版一样清零
	for k in ["evLogin", "ev", "tl", "stash", "gear", "chests", "pilots"]:
		if typeof(o.get(k)) != TYPE_DICTIONARY: o[k] = {}
	return o

# ---------------- 转移码：GBACC1.<base64(JSON)>.<sha256 前 10 位> ----------------
func export_code(key: String, o: Dictionary, D: Dictionary) -> String:
	var a = data.list.get(key)
	if a == null: return ""
	var body := Marshalls.utf8_to_base64(JSON.stringify({"v": 1, "n": a.name, "s": a.salt, "h": a.hash, "c": a.created, "t": int(Time.get_unix_time_from_system() * 1000), "p": to_js(o, D)}))
	return "GBACC1." + body + "." + sha256(body.to_utf8_buffer()).hex_encode().substr(0, 10)

func import_code(code: String, overwrite: bool, D: Dictionary) -> Dictionary:
	var re := RegEx.create_from_string("^GBACC1\\.([A-Za-z0-9+/=]+)\\.([0-9a-f]{10})$")
	var m := re.search(RegEx.create_from_string("\\s+").sub(code, "", true))
	if m == null or sha256(m.get_string(1).to_utf8_buffer()).hex_encode().substr(0, 10) != m.get_string(2): return {"ok": false, "err": "转移码不完整或者复制错了"}
	var d = JSON.parse_string(Marshalls.base64_to_utf8(m.get_string(1)))
	if typeof(d) != TYPE_DICTIONARY or int(d.get("v", 0)) != 1 or not name_ok(str(d.get("n", ""))) \
			or not RegEx.create_from_string("^[0-9a-f]{32}$").search(str(d.get("s", ""))) or not RegEx.create_from_string("^[0-9a-f]{64}$").search(str(d.get("h", ""))):
		return {"ok": false, "err": "转移码格式不对"}
	var k := str(d.n).to_lower()
	var had: bool = data.list.has(k)
	if had and not overwrite: return {"ok": false, "exists": true, "name": d.n, "err": "这台电脑上已经有同名账号了"}
	var p := from_js(d.get("p", {}) if typeof(d.get("p")) == TYPE_DICTIONARY else {}, D)
	data.list[k] = {"name": str(d.n), "salt": str(d.s), "hash": str(d.h), "created": int(d.get("c", Time.get_unix_time_from_system() * 1000))}
	if p.is_empty(): DirAccess.remove_absolute(ProjectSettings.globalize_path(profile_path(k)))   # 老版本的进度：和网页版一样从新手开始
	else: p.name = str(d.n); write_profile(k, p)
	save()
	return {"ok": true, "name": str(d.n), "replaced": had, "key": k, "fresh": p.is_empty()}

# ---------------- 在线账号：从游戏服务器下载进度 ----------------
static func server_url(addr: String) -> String:
	var a := addr.strip_edges()
	if a == "": return ""
	if not a.begins_with("ws://") and not a.begins_with("wss://"):
		a = a.replace("http://", "ws://").replace("https://", "wss://")
		if not a.begins_with("ws"): a = "ws://" + a
	if not a.substr(6).contains(":") and not a.begins_with("wss://"): a += ":3000"
	if not a.ends_with("/ws"): a = a.trim_suffix("/") + "/ws"
	return a

# 在 tree 上等待：连接服务器 → 登录（或注册）→ 收到服务器上的进度，转成电脑版存档，建一个同名同密码的本机账号
func online_pull(tree: SceneTree, addr: String, name: String, pw: String, register_new: bool, D: Dictionary) -> Dictionary:
	var url := server_url(addr)
	if url == "": return {"ok": false, "err": "先填服务器地址"}
	name = name.strip_edges()
	if not name_ok(name): return {"ok": false, "err": NAME_HINT}
	if not pass_ok(pw): return {"ok": false, "err": PASS_HINT}
	var ws := WebSocketPeer.new()
	ws.inbound_buffer_size = 4 << 20
	if ws.connect_to_url(url) != OK: return {"ok": false, "err": "地址不对"}
	var t0 := Time.get_ticks_msec()
	var sent := false
	while Time.get_ticks_msec() - t0 < 10000:
		await tree.process_frame
		ws.poll()
		var st := ws.get_ready_state()
		if st == WebSocketPeer.STATE_CLOSED: return {"ok": false, "err": "连不上服务器（检查地址、端口和防火墙）"}
		if st != WebSocketPeer.STATE_OPEN: continue
		if not sent:
			ws.send_text(JSON.stringify({"t": "hello", "name": name}))
			ws.send_text(JSON.stringify({"t": "auth", "op": "register" if register_new else "login", "name": name, "pass": pw}))
			sent = true
		while ws.get_available_packet_count() > 0:
			var m = JSON.parse_string(ws.get_packet().get_string_from_utf8())
			if typeof(m) != TYPE_DICTIONARY: continue
			if m.get("t") == "caps" and not m.get("accounts", false):
				ws.close(); return {"ok": false, "err": "这台服务器没有开账号系统"}
			if m.get("t") != "auth" or m.get("op", "") == "logout": continue
			ws.close()
			if not m.get("ok", false): return {"ok": false, "err": str(m.get("err", "登录失败"))}
			var p := from_js(m.get("profile", {}), D)
			if p.is_empty(): return {"ok": false, "err": "服务器上的进度版本太老"}
			var k := name.to_lower()
			var salt := rand_hex(16)
			data.list[k] = {"name": str(m.account.name) if typeof(m.get("account")) == TYPE_DICTIONARY else name, "salt": salt, "hash": hash_pass(pw, salt),
				"created": int(m.account.get("created", 0)) if typeof(m.get("account")) == TYPE_DICTIONARY else 0, "online": true}
			p.name = data.list[k].name
			write_profile(k, p)
			data.last = k; data.server = addr.strip_edges(); save()
			return {"ok": true, "key": k}
	ws.close()
	return {"ok": false, "err": "服务器没有回应"}
