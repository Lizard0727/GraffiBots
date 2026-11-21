# 涂鸦机兵 Godot 电脑版 —— 设置：显示（全屏 / 垂直同步 / 帧率上限 / 渲染分辨率）、画质档位、音量、按键
# 存在 user://settings.cfg
class_name Settings
extends RefCounted

const PATH := "user://settings.cfg"
const QUALITY := {   # 画质档位：阴影、环境光遮蔽、辉光、抗锯齿、阴影贴图大小
	"low": {"name": "流畅", "shadow": false, "ssao": false, "glow": false, "msaa": 0, "atlas": 1024},
	"mid": {"name": "均衡", "shadow": true, "ssao": false, "glow": true, "msaa": 0, "atlas": 2048},
	"high": {"name": "高", "shadow": true, "ssao": true, "glow": true, "msaa": 2, "atlas": 4096},
	"ultra": {"name": "极致", "shadow": true, "ssao": true, "glow": true, "msaa": 4, "atlas": 8192},
}
const QUALITY_ORDER := ["low", "mid", "high", "ultra"]
const FPS_OPTIONS := [0, 60, 120, 144, 240]
const ACTIONS := [["up", "前进"], ["down", "后退"], ["left", "向左"], ["right", "向右"], ["jump", "跳跃"], ["wheel", "滚轮形态"], ["skill", "技能"], ["super", "大招"], ["overload", "超载"], ["interact", "搜索 / 互动"], ["bag", "背包"]]
const DEFAULT_KEYS := {"up": KEY_W, "down": KEY_S, "left": KEY_A, "right": KEY_D, "jump": KEY_SPACE, "wheel": KEY_SHIFT, "skill": KEY_Q, "super": KEY_E, "overload": KEY_R, "interact": KEY_F, "bag": KEY_TAB}

var fullscreen := false
var vsync := true
var max_fps := 0
var render_scale := 1.0
var quality := "high"
var sfx_db := -6.0
var music_db := -12.0
var keys := DEFAULT_KEYS.duplicate()

func _init() -> void:
	var c := ConfigFile.new()
	if c.load(PATH) != OK: return
	fullscreen = c.get_value("display", "fullscreen", fullscreen)
	vsync = c.get_value("display", "vsync", vsync)
	max_fps = c.get_value("display", "max_fps", max_fps)
	render_scale = c.get_value("display", "render_scale", render_scale)
	quality = c.get_value("display", "quality", quality)
	if not QUALITY.has(quality): quality = "high"
	sfx_db = c.get_value("audio", "sfx", sfx_db)
	music_db = c.get_value("audio", "music", music_db)
	for a in DEFAULT_KEYS: keys[a] = int(c.get_value("keys", a, DEFAULT_KEYS[a]))

func save() -> void:
	var c := ConfigFile.new()
	c.set_value("display", "fullscreen", fullscreen); c.set_value("display", "vsync", vsync); c.set_value("display", "max_fps", max_fps)
	c.set_value("display", "render_scale", render_scale); c.set_value("display", "quality", quality)
	c.set_value("audio", "sfx", sfx_db); c.set_value("audio", "music", music_db)
	for a in keys: c.set_value("keys", a, keys[a])
	c.save(PATH)

static func key_name(k: int) -> String:
	var s := OS.get_keycode_string(k)
	return {"Space": "空格", "Shift": "Shift", "Ctrl": "Ctrl", "Alt": "Alt", "Tab": "Tab"}.get(s, s)

func pressed(action: String) -> bool:
	return Input.is_physical_key_pressed(keys[action])

func is_key(ev: InputEventKey, action: String) -> bool:
	return ev.physical_keycode == keys[action]

# 应用到游戏：窗口、渲染、灯光、后期、音量
func apply(game) -> void:
	if not OS.has_feature("headless") and DisplayServer.get_name() != "headless":
		DisplayServer.window_set_mode(DisplayServer.WINDOW_MODE_FULLSCREEN if fullscreen else DisplayServer.WINDOW_MODE_WINDOWED)
		DisplayServer.window_set_vsync_mode(DisplayServer.VSYNC_ENABLED if vsync else DisplayServer.VSYNC_DISABLED)
	Engine.max_fps = max_fps
	var vp: Viewport = game.get_viewport()
	vp.scaling_3d_scale = clampf(render_scale, 0.5, 1.0)
	var Q: Dictionary = QUALITY[quality]
	vp.msaa_3d = [Viewport.MSAA_DISABLED, Viewport.MSAA_2X, Viewport.MSAA_4X][[0, 2, 4].find(int(Q.msaa))]
	if game.sun != null: game.sun.shadow_enabled = Q.shadow
	RenderingServer.directional_shadow_atlas_set_size(int(Q.atlas), true)
	if game.env != null:
		game.env.ssao_enabled = Q.ssao and RenderingServer.get_rendering_device() != null
		game.env.glow_enabled = Q.glow
	game.sfx.volume_db = sfx_db
	if game.music != null: game.music.volume_db = music_db
