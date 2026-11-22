# 涂鸦机兵 Godot 电脑版 —— 线上联机的传输层：把 Godot 的多人数据包通过 node server.js 的 WebSocket 转发
# 对 Net（RPC）来说它和局域网的 ENet 一模一样：房主 id = 1，其他人 2、3……；数据包 base64 后由服务器转给房间里的人
class_name RelayPeer
extends MultiplayerPeerExtension

signal room_ready(code: String)
signal relay_failed(err: String)

var ws := WebSocketPeer.new()
var url := ""
var join_code := ""
var hosting := false
var code := ""
var my_id := 0
var status := MultiplayerPeer.CONNECTION_DISCONNECTED
var sent := false
var inq: Array = []          # [from, bytes, channel, mode]
var target := 0
var t_mode := MultiplayerPeer.TRANSFER_MODE_RELIABLE
var t_ch := 0
var peers := {}

func start(server_url: String, host: bool, room_code := "") -> Error:
	url = server_url; hosting = host; join_code = room_code.to_upper().strip_edges()
	ws.inbound_buffer_size = 4 << 20; ws.outbound_buffer_size = 4 << 20; ws.max_queued_packets = 4096
	var err := ws.connect_to_url(url)
	if err == OK: status = MultiplayerPeer.CONNECTION_CONNECTING
	return err

func _poll() -> void:
	if status == MultiplayerPeer.CONNECTION_DISCONNECTED: return
	ws.poll()
	var st := ws.get_ready_state()
	if st == WebSocketPeer.STATE_CLOSED:
		_drop_all(); relay_failed.emit("和服务器的连接断开了"); return
	if st != WebSocketPeer.STATE_OPEN: return
	if not sent:
		sent = true
		ws.send_text(JSON.stringify({"t": "rlyHost"} if hosting else {"t": "rlyJoin", "code": join_code}))
	while ws.get_available_packet_count() > 0:
		var m = JSON.parse_string(ws.get_packet().get_string_from_utf8())
		if typeof(m) != TYPE_DICTIONARY: continue
		match str(m.get("t", "")):
			"rlyRoom":
				my_id = int(m.id); code = str(m.code)
				status = MultiplayerPeer.CONNECTION_CONNECTED
				for p in m.get("peers", []): peers[int(p)] = true; peer_connected.emit(int(p))
				room_ready.emit(code)
			"rlyPeer":
				var pid := int(m.id)
				if m.get("on", false): peers[pid] = true; peer_connected.emit(pid)
				elif peers.has(pid): peers.erase(pid); peer_disconnected.emit(pid)
			"rlyPkt": inq.append([int(m.from), Marshalls.base64_to_raw(str(m.d)), int(m.get("ch", 0)), int(m.get("md", 0))])
			"rlyClose": _drop_all(); relay_failed.emit("房主关闭了房间")
			"rlyErr": relay_failed.emit(str(m.get("err", "加入失败"))); _drop_all()

func _drop_all() -> void:
	for p in peers.keys(): peer_disconnected.emit(p)
	peers.clear()
	status = MultiplayerPeer.CONNECTION_DISCONNECTED

func _get_available_packet_count() -> int: return inq.size()
func _get_packet_peer() -> int: return int(inq[0][0]) if not inq.is_empty() else 0
func _get_packet_channel() -> int: return int(inq[0][2]) if not inq.is_empty() else 0
func _get_packet_mode() -> MultiplayerPeer.TransferMode: return int(inq[0][3]) if not inq.is_empty() else MultiplayerPeer.TRANSFER_MODE_RELIABLE
func _get_packet_script() -> PackedByteArray:
	if inq.is_empty(): return PackedByteArray()
	return inq.pop_front()[1]
func _put_packet_script(buf: PackedByteArray) -> Error:
	if ws.get_ready_state() != WebSocketPeer.STATE_OPEN: return ERR_UNAVAILABLE
	return ws.send_text(JSON.stringify({"t": "rlyPkt", "to": target, "d": Marshalls.raw_to_base64(buf), "ch": t_ch, "md": t_mode}))
func _get_max_packet_size() -> int: return 600000
func _set_transfer_channel(ch: int) -> void: t_ch = ch
func _get_transfer_channel() -> int: return t_ch
func _set_transfer_mode(md: MultiplayerPeer.TransferMode) -> void: t_mode = md
func _get_transfer_mode() -> MultiplayerPeer.TransferMode: return t_mode
func _set_target_peer(p: int) -> void: target = p
func _is_server() -> bool: return my_id == 1
func _get_unique_id() -> int: return my_id
func _get_connection_status() -> MultiplayerPeer.ConnectionStatus: return status
func _is_server_relay_supported() -> bool: return false
func _close() -> void:
	if ws.get_ready_state() == WebSocketPeer.STATE_OPEN: ws.send_text(JSON.stringify({"t": "rlyLeave"})); ws.close()
	peers.clear(); status = MultiplayerPeer.CONNECTION_DISCONNECTED
func _disconnect_peer(_p: int, _force: bool) -> void: pass
func _is_refusing_new_connections() -> bool: return false
func _set_refuse_new_connections(_e: bool) -> void: pass
