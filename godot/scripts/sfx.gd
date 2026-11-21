# 涂鸦机兵 Godot 版 —— 程序合成的音效（启动时生成 WAV，不需要音频文件）
class_name Sfx
extends Node

const RATE := 22050
var bank := {}
var players: Array = []
var next := 0
var volume_db := -6.0

func _ready() -> void:
	for i in 16:
		var p := AudioStreamPlayer.new(); p.bus = "Master"; add_child(p); players.append(p)
	# 各种声音：tone(频率, 时长, 波形, 音量, 滑音倍率, 延迟) / noise(时长, 音量, 亮度, 延迟)
	bank.shoot_burst = _mix([[_tone(900, 0.06, "sq", 0.18, 0.6)], [_noise(0.05, 0.12, 0.7)]])
	bank.shoot_fan = _mix([[_noise(0.14, 0.3, 0.35)], [_tone(220, 0.1, "saw", 0.15, 0.6)]])
	bank.shoot_charge = _mix([[_tone(1900, 0.22, "saw", 0.12, 0.25)], [_noise(0.18, 0.2, 0.5)], [_tone(90, 0.2, "sin", 0.3, 0.5)]])
	bank.shoot_lob = _mix([[_tone(160, 0.18, "sin", 0.35, 2.2)], [_noise(0.1, 0.12, 0.3)]])
	bank.punch = _mix([[_noise(0.12, 0.35, 0.25)], [_tone(110, 0.14, "sin", 0.4, 0.5)]])
	bank.slash = _mix([[_noise(0.08, 0.2, 0.9)], [_tone(2600, 0.06, "sin", 0.08, 0.8)]])
	bank.hit = _mix([[_tone(1500, 0.05, "tri", 0.18, 0.7)], [_noise(0.04, 0.1, 0.6)]])
	bank.splat = _mix([[_noise(0.08, 0.14, 0.2)], [_tone(400, 0.06, "sin", 0.1, 0.6)]])
	bank.boom = _mix([[_noise(0.5, 0.55, 0.15)], [_tone(70, 0.45, "sin", 0.6, 0.45)]])
	bank.ko = _mix([[_tone(660, 0.1, "sq", 0.15, 1.0)], [_tone(990, 0.16, "sq", 0.15, 1.0, 0.08)], [_noise(0.3, 0.25, 0.2)]])
	bank.wreck = _mix([[_noise(0.6, 0.5, 0.12)], [_tone(55, 0.6, "saw", 0.35, 0.5)], [_tone(300, 0.2, "sq", 0.1, 0.4, 0.05)]])
	bank.skill = _mix([[_tone(523, 0.1, "tri", 0.2, 1.0)], [_tone(784, 0.14, "tri", 0.2, 1.0, 0.07)]])
	bank.super = _mix([[_tone(220, 0.5, "saw", 0.22, 3.0)], [_noise(0.5, 0.18, 0.6)], [_tone(880, 0.3, "sq", 0.08, 1.5, 0.15)]])
	bank.jump = _mix([[_tone(300, 0.12, "sin", 0.2, 2.0)]])
	bank.land = _mix([[_noise(0.1, 0.25, 0.15)], [_tone(80, 0.1, "sin", 0.3, 0.6)]])
	bank.pad = _mix([[_tone(400, 0.25, "sin", 0.25, 3.0)], [_noise(0.15, 0.1, 0.5)]])
	bank.pickup = _mix([[_tone(880, 0.08, "sin", 0.25)], [_tone(1175, 0.12, "sin", 0.25, 1.0, 0.08)]])
	bank.click = _mix([[_tone(1200, 0.04, "sq", 0.12)]])
	bank.beam = _mix([[_tone(180, 0.12, "saw", 0.12, 1.1)], [_noise(0.12, 0.08, 0.8)]])
	bank.lock = _mix([[_tone(1800, 0.06, "sq", 0.12)], [_tone(1800, 0.06, "sq", 0.12, 1.0, 0.12)]])
	bank.shield = _mix([[_tone(700, 0.1, "tri", 0.15, 1.4)]])
	bank.win = _mix([[_tone(523, 0.15, "sq", 0.15)], [_tone(659, 0.15, "sq", 0.15, 1.0, 0.15)], [_tone(784, 0.3, "sq", 0.15, 1.0, 0.3)], [_tone(1046, 0.4, "tri", 0.15, 1.0, 0.45)]])
	bank.lose = _mix([[_tone(392, 0.25, "tri", 0.18)], [_tone(330, 0.25, "tri", 0.18, 1.0, 0.25)], [_tone(262, 0.5, "tri", 0.18, 0.9, 0.5)]])
	bank.count = _mix([[_tone(880, 0.12, "sq", 0.15)]])
	bank.go = _mix([[_tone(1320, 0.3, "sq", 0.18, 1.0)], [_noise(0.2, 0.1, 0.6)]])

func play(name: String, vol := 0.0, pitch_rand := 0.08) -> void:
	if not bank.has(name) or vol <= -40: return
	var p: AudioStreamPlayer = players[next]; next = (next + 1) % players.size()
	p.stream = bank[name]; p.volume_db = volume_db + vol; p.pitch_scale = 1.0 + randf_range(-pitch_rand, pitch_rand)
	p.play()

# ---- 合成 ----
func _tone(freq: float, dur: float, wave: String, vol: float, slide := 1.0, delay := 0.0) -> PackedFloat32Array:
	var n := int((dur + delay) * RATE); var d0 := int(delay * RATE)
	var out := PackedFloat32Array(); out.resize(n)
	var ph := 0.0
	for i in range(d0, n):
		var t := float(i - d0) / ((n - d0))
		var f := freq * pow(slide, t)
		ph += f / RATE
		var v := 0.0
		match wave:
			"sin": v = sin(ph * TAU)
			"sq": v = 1.0 if fmod(ph, 1.0) < 0.5 else -1.0
			"saw": v = fmod(ph, 1.0) * 2.0 - 1.0
			"tri": v = absf(fmod(ph, 1.0) * 4.0 - 2.0) - 1.0
		var env := minf(1.0, t * 40.0) * pow(1.0 - t, 2.0)
		out[i] = v * vol * env
	return out

func _noise(dur: float, vol: float, bright: float, delay := 0.0) -> PackedFloat32Array:
	var n := int((dur + delay) * RATE); var d0 := int(delay * RATE)
	var out := PackedFloat32Array(); out.resize(n)
	var lp := 0.0
	for i in range(d0, n):
		var t := float(i - d0) / ((n - d0))
		lp += (randf_range(-1, 1) - lp) * bright
		out[i] = lp * vol * minf(1.0, t * 60.0) * pow(1.0 - t, 1.6)
	return out

func _mix(layers: Array) -> AudioStreamWAV:
	var n := 0
	for l in layers: n = maxi(n, l[0].size())
	var buf := PackedFloat32Array(); buf.resize(n)
	for l in layers:
		var a: PackedFloat32Array = l[0]
		for i in a.size(): buf[i] += a[i]
	var bytes := PackedByteArray(); bytes.resize(n * 2)
	for i in n:
		bytes.encode_s16(i * 2, int(clampf(buf[i], -1.0, 1.0) * 32000.0))
	var w := AudioStreamWAV.new()
	w.format = AudioStreamWAV.FORMAT_16_BITS; w.mix_rate = RATE; w.stereo = false; w.data = bytes
	return w
