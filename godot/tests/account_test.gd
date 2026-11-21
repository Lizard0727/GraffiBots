# 账号测试：和网页版的哈希一致、网页版转移码导入、电脑版导出（再由 node 验证能导回网页版）
# godot --headless --path godot --script res://tests/account_test.gd
extends SceneTree

var fails := 0
func check(ok: bool, msg: String) -> void:
	print(("✓ " if ok else "✗ ") + msg)
	if not ok: fails += 1

func _init() -> void:
	var data = JSON.parse_string(FileAccess.get_file_as_string("res://data/game.json"))
	var fx = JSON.parse_string(FileAccess.get_file_as_string("res://tests/account_fixture.json"))
	DirAccess.remove_absolute(ProjectSettings.globalize_path("user://test_accounts.json"))
	var A := Accounts.new("user://test_accounts.json", "user://test_acc_")
	check(Accounts.hash_pass("密码pass", "0123456789abcdef0123456789abcdef") == str(fx.hash), "密码哈希和网页版一样")
	check(Accounts.name_ok("网页玩家1") and not Accounts.name_ok("a") and not Accounts.name_ok("有 空格"), "账号名规则")
	var r := A.import_code(str(fx.code), false, data)
	check(r.ok, "导入网页版转移码 " + str(r.get("err", "")))
	check(not A.login("网页玩家1", "wrong123").ok, "错误密码登录不了")
	var lg := A.login("网页玩家1", "abc12345")
	check(lg.ok and A.current() == "网页玩家1", "用网页版的密码登录")
	var P := Profile.new(data, A.profile_path(A.current()))
	check(P.o.coins == 12345 and P.o.gems == 678 and P.o.trophies == 420, "货币和奖杯带过来了")
	check(P.has_pilot("blaze") and int(P.o.pilots.blaze.lv) == 4 and P.has_mech("gatling"), "驾驶员等级和机体带过来了")
	check(int(P.o.pass.xp) == 1800 and P.o.pass.cf.has(2) and int(P.o.rank.rp) == 260 and int(P.o.stash.get("can", 0)) == 2, "通行证、排位、仓库带过来了")
	check(not A.import_code(str(fx.code), false, data).ok, "同名账号不覆盖")
	# 电脑版继续玩，再导出
	P.o.coins += 1000; P.o.gems = 5; P.save()
	var code := A.export_code(A.current(), P.o, data)
	check(code.begins_with("GBACC1."), "导出转移码")
	# 注册：带上游客进度
	var guest := Profile.new(data, "user://guest_test.json"); guest.o.coins = 999
	var rg := A.register("电脑玩家", "pw123456", guest.o)
	check(rg.ok and Profile.new(data, A.profile_path("电脑玩家")).o.coins == 999, "注册新账号带上现在的进度")
	check(not A.register("电脑玩家", "pw123456", guest.o).ok, "重名不能注册")
	A.logout(); check(A.current() == "" and A.profile_path("") == Accounts.GUEST_PATH, "退出后回到游客存档")
	# 在线账号（需要 GB_SERVER 指向开着的 node server.js）
	var srv := OS.get_environment("GB_SERVER")
	if srv != "":
		var on: Dictionary = await A.online_pull(self, srv, "在线玩家", "pw123456", true, data)
		check(on.ok, "在线账号注册并下载进度 " + str(on.get("err", "")))
		if on.ok:
			var OP := Profile.new(data, A.profile_path("在线玩家"))
			check(A.is_online("在线玩家") and OP.o.name == "在线玩家" and int(OP.o.coins) > 0, "服务器上的进度存到了电脑上")
		var on2: Dictionary = await A.online_pull(self, srv, "在线玩家", "wrongpass", false, data)
		check(not on2.ok, "在线账号密码错误被拒绝：" + str(on2.get("err", "")))
	# 清理测试文件
	for k in A.data.list.keys(): DirAccess.remove_absolute(ProjectSettings.globalize_path(A.profile_path(k)))
	for f in ["user://test_accounts.json", "user://guest_test.json"]: DirAccess.remove_absolute(ProjectSettings.globalize_path(f))
	print("全部通过" if fails == 0 else "有 %d 项失败" % fails)
	quit(1 if fails else 0)
