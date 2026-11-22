# 涂鸦机兵 Godot 电脑版 —— 好友（和网页版 1.7 同一套协议：好友码 + 申请 / 通过 / 在线状态 / 组队邀请）
# 通过 node server.js 开的游戏服务器转发（和在线账号用同一个服务器地址）；网页版玩家连同一台服务器也能互加好友
# 组队：邀请好友加入你的局域网房间（对方收到房主的局域网 IP，一键加入）
class_name Social
extends Node

const ALPHA := "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
signal changed
signal invited(from_name: String, ips: Array)

var game
var ws: WebSocketPeer
var url := ""
var state := "off"        # off / connecting / on / fail
var on := {}              # 在线的好友：fid → card
var ping_t := 0.0
var retry_t := 0.0

func _init(g) -> void: game = g

func S() -> Dictionary:   # 存在存档里：好友码、好友、收到 / 发出的申请
	var o: Dictionary = game.profile.o
	if typeof(o.get("soc")) != TYPE_DICTIONARY: o.soc = {}
	var s: Dictionary = o.soc
	if not RegEx.create_from_string("^[A-Z0-9]{6}$").search(str(s.get("fid", ""))):
		var f := ""
		for i in 6: f += ALPHA[randi() % ALPHA.length()]
		s.fid = f
	for k in ["friends", "reqIn", "reqOut"]:
		if typeof(s.get(k)) != TYPE_ARRAY: s[k] = []
	return s

func fid() -> String: return str(S().fid)
func is_friend(f: String) -> bool: return S().friends.any(func(x): return x.fid == f)
func card() -> Dictionary:
	var P: Profile = game.profile
	return {"name": P.display_name(), "pilot": str(P.o.pilot), "tr": int(P.o.trophies), "rank": P.rank_tier(int(P.o.rank.rp)), "st": "game" if game.state == "play" else "menu", "code": fid(), "pc": true}

func server_addr() -> String: return str(game.accounts.data.get("server", ""))

func connect_server(addr := "") -> void:
	if addr != "": game.accounts.data.server = addr; game.accounts.save()
	url = Accounts.server_url(server_addr())
	if url == "": state = "off"; changed.emit(); return
	ws = WebSocketPeer.new()
	if ws.connect_to_url(url) != OK: state = "fail"; changed.emit(); return
	state = "connecting"; changed.emit()

func send(m: Dictionary) -> void:
	if ws != null and ws.get_ready_state() == WebSocketPeer.STATE_OPEN: ws.send_text(JSON.stringify(m))

func soc_send(to: String, m: Dictionary) -> void: send({"t": "soc", "to": to, "m": m})

func _process(delta: float) -> void:
	if ws == null:
		if server_addr() != "" and state != "fail":
			retry_t -= delta
			if retry_t <= 0: retry_t = 20.0; connect_server()
		return
	ws.poll()
	var st := ws.get_ready_state()
	if st == WebSocketPeer.STATE_CLOSED:
		ws = null; state = "fail"; on.clear(); changed.emit(); retry_t = 20.0; state = "off"
		return
	if st != WebSocketPeer.STATE_OPEN: return
	if state != "on":
		state = "on"; send({"t": "hello", "name": game.profile.display_name()}); hello(); changed.emit()
	while ws.get_available_packet_count() > 0:
		var m = JSON.parse_string(ws.get_packet().get_string_from_utf8())
		if typeof(m) == TYPE_DICTIONARY: handle(m)
	ping_t -= delta
	if ping_t <= 0:
		ping_t = 15.0; hello()
		send({"t": "ping"})

func hello() -> void:
	send({"t": "socHello", "fid": fid(), "card": card()})
	var fids: Array = S().friends.map(func(x): return x.fid)
	for r in S().reqOut: fids.append(r.fid)
	if not fids.is_empty(): send({"t": "socWho", "fids": fids})
	for f in S().friends: soc_send(f.fid, {"t": "hi", "card": card()})

func handle(m: Dictionary) -> void:
	match str(m.get("t", "")):
		"socWho":
			on.clear()
			for f in m.get("on", {}): on[f] = m.on[f]
			for r in S().reqOut:   # 对方上线了：重发申请
				if on.has(r.fid): soc_send(r.fid, {"t": "req", "card": card()})
			changed.emit()
		"soc": on_soc(str(m.get("from", "")), m.get("m", {}))
		"socFail":
			if m.get("kind", "") == "inv": game.lobby.toast("好友不在线")

func save() -> void: game.profile.save(); changed.emit()

func add_friend_entry(f: String, c: Dictionary) -> void:
	var s := S()
	s.reqIn = s.reqIn.filter(func(x): return x.fid != f); s.reqOut = s.reqOut.filter(func(x): return x.fid != f)
	if not is_friend(f): s.friends.append({"fid": f, "name": I18n.keep(str(c.get("name", f))), "pilot": str(c.get("pilot", "")), "tr": int(c.get("tr", 0))})

func on_soc(from: String, m: Dictionary) -> void:
	var c: Dictionary = m.get("card", {}) if typeof(m.get("card")) == TYPE_DICTIONARY else {}
	match str(m.get("t", "")):
		"hi", "hiR":
			if is_friend(from):
				on[from] = c
				for f in S().friends:
					if f.fid == from and not c.is_empty(): f.name = str(c.get("name", f.name)); f.pilot = str(c.get("pilot", f.pilot)); f.tr = int(c.get("tr", f.tr))
				if m.t == "hi": soc_send(from, {"t": "hiR", "card": card()})
				save()
			elif S().reqOut.any(func(r): return r.fid == from): soc_send(from, {"t": "req", "card": card()})
		"req":
			if c.is_empty(): return
			if is_friend(from): soc_send(from, {"t": "acc", "card": card()}); return
			if S().reqOut.any(func(r): return r.fid == from):   # 互相加：直接成为好友
				add_friend_entry(from, c); soc_send(from, {"t": "acc", "card": card()}); save(); return
			if not S().reqIn.any(func(r): return r.fid == from):
				S().reqIn.append({"fid": from, "name": str(c.get("name", from)), "pilot": str(c.get("pilot", "")), "tr": int(c.get("tr", 0))})
				save(); game.lobby.toast("%s 想加你为好友" % c.get("name", from))
		"acc":
			if not c.is_empty() and (S().reqOut.any(func(r): return r.fid == from) or is_friend(from)):
				var was := is_friend(from)
				add_friend_entry(from, c); on[from] = c; save()
				if not was: game.sfx.play("win"); game.lobby.toast("%s 通过了你的好友申请" % c.get("name", from))
		"rej":
			S().reqOut = S().reqOut.filter(func(r): return r.fid != from); save(); game.lobby.toast("有一个好友申请没有通过")
		"inv":
			if not is_friend(from): return
			if game.state == "play": soc_send(from, {"t": "invR", "ok": false, "why": "game"}); return
			var ips: Array = m.get("ips", [])
			if ips.is_empty(): game.lobby.toast("%s 在网页版邀请你组队（电脑版只能加入电脑版的局域网房间）" % c.get("name", "好友")); return
			invited.emit(str(c.get("name", "好友")), ips)
		"invR":
			if m.get("ok", true) == false: game.lobby.toast("%s %s" % [name_of(from), "正在对局中" if m.get("why", "") == "game" else "拒绝了邀请"])

func name_of(f: String) -> String:
	for x in S().friends: if x.fid == f: return str(x.name)
	return "好友"

func request(code: String) -> String:
	code = code.strip_edges().to_upper()
	if not RegEx.create_from_string("^[A-Z0-9]{6}$").search(code): return "好友码是 6 位字母和数字"
	if code == fid(): return "这是你自己的好友码"
	if is_friend(code): return "你们已经是好友了"
	if not S().reqOut.any(func(r): return r.fid == code): S().reqOut.append({"fid": code, "t": int(Time.get_unix_time_from_system())})
	soc_send(code, {"t": "req", "card": card()}); save()
	return ""

func accept(f: String) -> void:
	var r = null
	for x in S().reqIn: if x.fid == f: r = x
	if r == null: return
	add_friend_entry(f, r); soc_send(f, {"t": "acc", "card": card()}); save()

func reject(f: String) -> void:
	S().reqIn = S().reqIn.filter(func(x): return x.fid != f); soc_send(f, {"t": "rej"}); save()

func remove(f: String) -> void:
	S().friends = S().friends.filter(func(x): return x.fid != f); on.erase(f); save()

# 组队邀请：先开局域网房间（没开的话），再把房主 IP 发给好友
func invite(f: String) -> void:
	var N: Net = game.net
	if N.role == "":
		var err := N.host({"name": game.profile.display_name(), "pilot": game.profile.o.pilot, "weapon": game.profile.o.weapon, "power": game.profile.power(game.profile.o.pilot)})
		if err != "": game.lobby.toast(err); return
	elif N.role != "host": game.lobby.toast("你在别人的房间里，只有房主能邀请"); return
	soc_send(f, {"t": "inv", "card": card(), "ips": Net.lan_ips(), "port": Net.PORT})
	game.lobby.toast("已邀请 %s 加入你的局域网房间" % name_of(f))
