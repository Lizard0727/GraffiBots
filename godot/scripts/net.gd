# 涂鸦机兵 Godot 电脑版 —— 局域网联机（ENet）
# 房主跑完整的对战模拟（权威），其他人只把操作发给房主；房主每 2 帧广播一次状态快照（位置、子弹、特效事件、涂料变化、模式状态）
# 全部模式都能联机；搜刮撤离的容器只同步有变化的那些
class_name Net
extends Node

const PORT := 24680
const MAX_PEERS := 7
const PLAYER_FIELDS := ["x", "y", "z", "vx", "vy", "vz", "hp", "max_hp", "alive", "foot", "wheel", "hidden", "firing", "charge", "ammo", "sp", "ov", "ov_t",
	"skill_uses", "skill_max", "skill_regen", "rebuild_t", "respawn_t", "shield", "flash", "carry", "cubes", "out", "kills", "deaths", "painted", "obj",
	"balloons", "float_t", "seals", "spirits", "sp_t", "sp_kind", "on_ground", "lv", "bt", "ex_t", "extracted",
	"rush_t", "slow_t", "dslow_t", "silence_t", "seal_t", "bind_t", "blind_t", "mark_t", "lock_t", "jam_t", "burn_t", "poison_t", "cloak_t", "rally_t", "nano_t", "sup_t", "smoke_t", "reveal_t"]

signal room_changed
signal match_started(info: Dictionary)
signal snapshot(s: Dictionary)
signal match_ended(result: Dictionary)
signal status(text: String)

var role := ""            # "" / "host" / "client"
var room := {"players": [], "mode": "turf", "map": -1}   # players: [{peer, name, pilot, weapon, power}]
var my_info := {}
var inputs := {}          # 房主：peer → 最新的操作
var ev_buf: Array = []    # 房主：两次快照之间累计的事件
var dirty_buf := PackedInt32Array()
var tick := 0

func _ready() -> void:
	multiplayer.peer_connected.connect(_on_peer_connected)
	multiplayer.peer_disconnected.connect(_on_peer_disconnected)
	multiplayer.connected_to_server.connect(func(): status.emit("已连接，等待房主开始"); rpc_id(1, "hello", my_info))
	multiplayer.connection_failed.connect(func(): status.emit("连接失败：检查 IP 和防火墙"); leave())
	multiplayer.server_disconnected.connect(func(): status.emit("房主断开了"); leave())

static func lan_ips() -> Array:
	var out: Array = []
	for ip in IP.get_local_addresses():
		if ip.begins_with("192.168.") or ip.begins_with("10.") or (ip.begins_with("172.") and int(ip.split(".")[1]) >= 16 and int(ip.split(".")[1]) <= 31): out.append(ip)
	if out.is_empty():   # 没有常见的局域网地址：列出所有非本机的 IPv4
		for ip in IP.get_local_addresses():
			if ip.count(".") == 3 and not ip.begins_with("127.") and not ip.begins_with("169.254."): out.append(ip)
	return out

func host(info: Dictionary) -> String:
	var peer := ENetMultiplayerPeer.new()
	var err := peer.create_server(PORT, MAX_PEERS)
	if err != OK: return "开房失败（端口 %d 被占用？）" % PORT
	multiplayer.multiplayer_peer = peer
	role = "host"; my_info = info
	room.players = [info.merged({"peer": 1})]
	room_changed.emit()
	return ""

func join(ip: String, info: Dictionary) -> String:
	var peer := ENetMultiplayerPeer.new()
	var err := peer.create_client(ip.strip_edges(), PORT)
	if err != OK: return "连接失败"
	multiplayer.multiplayer_peer = peer
	role = "client"; my_info = info
	status.emit("正在连接 %s……" % ip)
	return ""

# ---------------- 线上联机（通过 node server.js 转发，见 relay_peer.gd）----------------
var online := false
func host_online(info: Dictionary, addr: String) -> String:
	var url := Accounts.server_url(addr)
	if url == "": return "先在「好友」或「账号」里填游戏服务器地址"
	var rp := RelayPeer.new()
	if rp.start(url, true) != OK: return "连不上服务器"
	_wire_relay(rp)
	multiplayer.multiplayer_peer = rp
	role = "host"; my_info = info; online = true
	room.players = [info.merged({"peer": 1})]; room.code = ""
	status.emit("正在向服务器申请房间……")
	room_changed.emit()
	return ""

func join_online(code: String, info: Dictionary, addr: String) -> String:
	var url := Accounts.server_url(addr)
	if url == "": return "先在「好友」或「账号」里填游戏服务器地址"
	if code.strip_edges().length() < 4: return "房间号是 5 位字母和数字"
	var rp := RelayPeer.new()
	if rp.start(url, false, code) != OK: return "连不上服务器"
	_wire_relay(rp)
	multiplayer.multiplayer_peer = rp
	role = "client"; my_info = info; online = true
	status.emit("正在加入房间 %s……" % code.to_upper())
	return ""

func _wire_relay(rp: RelayPeer) -> void:
	rp.room_ready.connect(func(c): room.code = c; room_changed.emit(); if role == "host": status.emit("线上房间已开好：%s" % c))
	rp.relay_failed.connect(func(err): status.emit(err); leave())

func leave() -> void:
	if multiplayer.multiplayer_peer != null: multiplayer.multiplayer_peer.close()
	multiplayer.multiplayer_peer = null
	role = ""; online = false; room = {"players": [], "mode": "turf", "map": -1}; inputs.clear()
	room_changed.emit()

func my_peer() -> int: return multiplayer.get_unique_id() if role != "" else 1

func _on_peer_connected(_id: int) -> void: pass

func _on_peer_disconnected(id: int) -> void:
	if role != "host": return
	room.players = room.players.filter(func(p): return int(p.peer) != id)
	inputs.erase(id)
	sync_room()

func sync_room() -> void:
	room_changed.emit()
	if role == "host": rpc("room_update", room)

@rpc("any_peer", "reliable")
func hello(info: Dictionary) -> void:
	if role != "host": return
	var id := multiplayer.get_remote_sender_id()
	if room.players.size() >= MAX_PEERS + 1: return
	room.players = room.players.filter(func(p): return int(p.peer) != id)
	room.players.append(info.merged({"peer": id}))
	sync_room()

@rpc("authority", "reliable")
func room_update(r: Dictionary) -> void:
	room = r; room_changed.emit()

@rpc("authority", "reliable")
func start_match(info: Dictionary) -> void:
	match_started.emit(info)

func broadcast_start(info: Dictionary) -> void:
	rpc("start_match", info)

# ---------------- 对战中：客户端发操作，房主发快照 ----------------
func send_input(inp: Dictionary) -> void:
	if role == "client": rpc_id(1, "client_input", inp)

@rpc("any_peer", "unreliable_ordered")
func client_input(inp: Dictionary) -> void:
	if role == "host": inputs[multiplayer.get_remote_sender_id()] = inp

func host_collect(sim: Sim) -> void:   # 每个模拟帧调用：把事件和涂料变化攒起来
	ev_buf.append_array(sim.events)
	for i in sim.dirty: dirty_buf.append(i)

func host_broadcast(sim: Sim) -> void:
	tick += 1
	if tick % 2 != 0: return
	var players: Array = []
	for p in sim.players:
		var row: Array = [p.id, float(p.inp.a)]
		for f in PLAYER_FIELDS: row.append(p.get(f))
		players.append(row)
	var grid_ch := PackedInt32Array()
	for i in dirty_buf: grid_ch.append(i); grid_ch.append(sim.grid[i])
	var projs: Array = []
	for pr in sim.projs: projs.append([pr.x, pr.y, pr.z, pr.vx, pr.vy, pr.vz, pr.team, pr.size])
	var shells: Array = []
	for s in sim.shells: shells.append([s.x0, s.y0, s.z0, s.x1, s.y1, s.z1, s.T, s.t, s.team])
	var helpers: Array = []
	for h in sim.helpers: helpers.append([h.id, h.kind, h.x, h.y, h.z, h.team, h.get("r", 0.0), h.get("ang", 0.0), h.get("fall", 0.0), h.t])
	var missiles: Array = []
	for m in sim.missiles: missiles.append([m.x, m.y, m.z, m.t, m.team])
	var snap := {"t": sim.time, "tl": sim.time_left, "cd": sim.countdown, "pl": players, "g": grid_ch, "ev": ev_buf, "pj": projs, "sh": shells, "hp": helpers, "ms": missiles,
		"obj": ser(sim.obj) if not sim.loot else ser(loot_obj(sim)), "rv": sim.reveal}
	if sim.loot: snap.lp = loot_players(sim); snap.cdl = loot_conts(sim)
	rpc("recv_snapshot", snap)
	ev_buf = []; dirty_buf = PackedInt32Array()

# ---------------- 搜刮撤离：容器只发变化的，背包 / 安全箱 / 搜索进度单独发 ----------------
var cont_sig := {}
func loot_obj(sim: Sim) -> Dictionary:
	var o := {}
	for k in sim.obj:
		if k != "conts" and k != "cont_map": o[k] = sim.obj[k]
	return o
func loot_players(sim: Sim) -> Array:
	var out: Array = []
	for p in sim.players: out.append([p.id, p.open_c, p.srch, p.inv, p.safe, p.kit])
	return out
func loot_conts(sim: Sim) -> Array:
	var out: Array = []
	for c in sim.obj.conts:
		var sig := "%d|%d|%d" % [c.items.size(), int(c.rev), hash(c.items)]
		if cont_sig.get(c.id, "") != sig:
			cont_sig[c.id] = sig
			out.append([c.id, c.type, c.x, c.y, c.z, c.tier, c.items, c.rev])
	return out

signal loot_cmd_in(peer: int, op: String, args: Array)
func send_loot(op: String, args: Array) -> void:
	if role == "client": rpc_id(1, "loot_cmd", op, args)
@rpc("any_peer", "reliable")
func loot_cmd(op: String, args: Array) -> void:
	if role == "host": loot_cmd_in.emit(multiplayer.get_remote_sender_id(), op, args)

@rpc("authority", "unreliable_ordered")
func recv_snapshot(s: Dictionary) -> void:
	snapshot.emit(s)

signal chat(pid: int, text: String, ch: int)
func send_chat(pid: int, text: String, ch: int) -> void:
	if role != "": rpc("chat_msg", pid, text, ch)
@rpc("any_peer", "call_remote", "reliable")
func chat_msg(pid: int, text: String, ch: int) -> void:
	chat.emit(pid, text.substr(0, 60), ch)

func broadcast_end(result: Dictionary, final_players: Array) -> void:
	rpc("end_match", result, final_players)

@rpc("authority", "reliable")
func end_match(result: Dictionary, final_players: Array) -> void:
	match_ended.emit({"result": result, "players": final_players})

# 模式状态里有机兵引用（护送宝物的持有者、Boss 等）：换成 id 发过去
static func ser(v):
	if v is Sim.Mech: return {"__m": v.id}
	if v is Dictionary:
		var d := {}
		for k in v: d[k] = ser(v[k])
		return d
	if v is Array:
		var a: Array = []
		for x in v: a.append(ser(x))
		return a
	return v

static func deser(v, sim: Sim):
	if v is Dictionary:
		if v.has("__m"):
			for p in sim.players:
				if p.id == int(v.__m): return p
			return null
		var d := {}
		for k in v: d[k] = deser(v[k], sim)
		return d
	if v is Array:
		var a: Array = []
		for x in v: a.append(deser(x, sim))
		return a
	return v

# 客户端：把快照写进本地的「镜像」模拟（镜像不自己跑，只用来画）
static func apply_snapshot(sim: Sim, s: Dictionary) -> void:
	sim.time = s.t; sim.time_left = s.tl; sim.countdown = s.cd
	var by_id := {}
	for p in sim.players: by_id[p.id] = p
	for row in s.pl:
		var p = by_id.get(int(row[0]))
		if p == null: continue
		p.inp.a = row[1]
		for i in PLAYER_FIELDS.size(): p.set(PLAYER_FIELDS[i], row[i + 2])
	sim.dirty.clear()
	var g: PackedInt32Array = s.g
	for i in range(0, g.size(), 2): sim.grid[g[i]] = g[i + 1]; sim.dirty.append(g[i])
	sim.events = s.ev
	sim.projs = s.pj.map(func(r): return {"x": r[0], "y": r[1], "z": r[2], "vx": r[3], "vy": r[4], "vz": r[5], "team": r[6], "size": r[7]})
	sim.shells = s.sh.map(func(r): return {"x0": r[0], "y0": r[1], "z0": r[2], "x1": r[3], "y1": r[4], "z1": r[5], "T": r[6], "t": r[7], "team": r[8]})
	sim.helpers = s.hp.map(func(r): return {"id": r[0], "kind": r[1], "x": r[2], "y": r[3], "z": r[4], "team": r[5], "r": r[6], "ang": r[7], "fall": r[8], "t": r[9], "owner": null, "gift": false})
	sim.missiles = s.ms.map(func(r): return {"x": r[0], "y": r[1], "z": r[2], "t": r[3], "team": r[4]})
	if sim.loot:   # 容器列表留在本地，只更新变化的
		var conts: Array = sim.obj.conts; var cmap: Dictionary = sim.obj.cont_map
		sim.obj = deser(s.obj, sim); sim.obj.conts = conts; sim.obj.cont_map = cmap
		for r in s.get("cdl", []):
			var c = cmap.get(int(r[0]))
			if c == null:
				c = {"id": int(r[0])}; conts.append(c); cmap[c.id] = c
			c.type = r[1]; c.x = r[2]; c.y = r[3]; c.z = r[4]; c.tier = r[5]; c.items = r[6]; c.rev = r[7]
		for r in s.get("lp", []):
			var p = by_id.get(int(r[0]))
			if p == null: continue
			p.open_c = int(r[1]); p.srch = float(r[2]); p.inv = r[3]; p.safe = r[4]; p.kit = int(r[5])
	else: sim.obj = deser(s.obj, sim)
	sim.reveal = s.rv
