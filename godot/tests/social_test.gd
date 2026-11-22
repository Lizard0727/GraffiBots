# 好友测试：两个客户端连同一台 node server.js，互加好友、看在线、发组队邀请
# GB_SERVER=127.0.0.1:3917 godot --headless --path godot --script res://tests/social_test.gd
extends SceneTree

class Stub extends Node:
	var profile: Profile
	var accounts: Accounts
	var state := "menu"
	var lobby = self
	var sfx = self
	var net: Net
	var toasts: Array = []
	func toast(s: String) -> void: toasts.append(s)
	func play(_n: String, _v := 0.0) -> void: pass

var fails := 0
func check(ok: bool, msg: String) -> void:
	print(("✓ " if ok else "✗ ") + msg)
	if not ok: fails += 1

func make(data: Dictionary, tag: String, srv: String) -> Array:
	var g := Stub.new(); root.add_child(g)
	g.profile = Profile.new(data, "user://soc_%s.json" % tag); g.profile.o.nick = "玩家" + tag
	g.accounts = Accounts.new("user://soc_acc_%s.json" % tag); g.accounts.data.server = srv
	g.net = Net.new(); g.add_child(g.net)
	var s := Social.new(g); g.add_child(s)
	s.connect_server()
	return [g, s]

func wait(sec: float) -> void:
	var t0 := Time.get_ticks_msec()
	while Time.get_ticks_msec() - t0 < sec * 1000: await process_frame

func _init() -> void:
	var srv := OS.get_environment("GB_SERVER")
	if srv == "": print("没有 GB_SERVER，跳过"); quit(); return
	var data = JSON.parse_string(FileAccess.get_file_as_string("res://data/game.json"))
	for t in ["A", "B"]:
		for f in ["user://soc_%s.json" % t, "user://soc_acc_%s.json" % t]: DirAccess.remove_absolute(ProjectSettings.globalize_path(f))
	var a := make(data, "A", srv); var b := make(data, "B", srv)
	var SA: Social = a[1]; var SB: Social = b[1]
	await wait(1.5)
	check(SA.state == "on" and SB.state == "on", "两个客户端都连上了服务器")
	check(SA.fid().length() == 6 and SA.fid() != SB.fid(), "各自有 6 位好友码")
	check(SA.request(SB.fid()) == "", "A 向 B 发好友申请")
	await wait(1.0)
	check(SB.S().reqIn.size() == 1 and SB.S().reqIn[0].name == "玩家A", "B 收到了申请")
	SB.accept(SA.fid())
	await wait(1.0)
	check(SA.is_friend(SB.fid()) and SB.is_friend(SA.fid()), "B 通过后双方都是好友")
	SA.hello()
	await wait(1.0)
	check(SA.on.has(SB.fid()), "A 看到 B 在线")
	var got := []
	SB.invited.connect(func(n, ips): got.append([n, ips]))
	SA.invite(SB.fid())
	await wait(1.0)
	check(got.size() == 1 and got[0][0] == "玩家A", "B 收到了 A 的组队邀请")
	check(a[0].net.role == "host", "邀请时 A 自动开了局域网房间")
	a[0].net.leave()
	print("全部通过" if fails == 0 else "有 %d 项失败" % fails)
	for t in ["A", "B"]:
		for f in ["user://soc_%s.json" % t, "user://soc_acc_%s.json" % t]: DirAccess.remove_absolute(ProjectSettings.globalize_path(f))
	quit(1 if fails else 0)
