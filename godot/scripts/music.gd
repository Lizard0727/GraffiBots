# 涂鸦机兵 Godot 版 —— 背景音乐：把原版 audio.js 的原创曲目（同样的和弦、鼓谱、贝斯、旋律）离线合成成循环的 WAV
# 启动时在后台线程里合成，合成好了再淡入；切歌时交叉淡化
class_name Music
extends Node

const RATE := 22050
const TRACKS := {
	# 主界面：「霓虹喷漆街」A 小调 96 BPM
	"menu": {"bpm": 96, "swing": 0.12,
		"chords": [[45, [57, 60, 64]], [41, [57, 60, 65]], [48, [55, 60, 64]], [43, [55, 59, 62]], [45, [57, 60, 64]], [41, [57, 60, 65]], [48, [55, 60, 64]], [43, [55, 59, 62]]],
		"kick": "x.....x...x.....", "snare": "....x.......x...", "hat": "..x...x...x...xo",
		"bass": "0 . . 0 . . 7 . 0 . . . 12 . 7 .", "bass_wave": "tri", "bass_vol": 0.32,
		"lead": ["E5 . . . D5 . C5 . D5 . . . A4 . . .", "C5 . . . D5 . E5 . . . G5 . E5 . . .", "D5 . . . C5 . D5 . E5 . . . C5 . . .", "B4 . . . . . G4 . A4 . B4 . D5 . . .",
			"A5 . . . G5 . E5 . G5 . . . E5 . D5 .", "C5 . D5 . E5 . . . F5 . E5 . D5 . . .", "E5 . . . G5 . . . D5 . C5 . D5 . E5 .", "B4 . . . D5 . . . A4 . . . . . . ."],
		"lead_wave": "sq", "lead_vol": 0.07, "pad_vol": 0.035, "arp": 0.0, "drum": [0.55, 0.18, 0.06]},
	# 对战：「涂装突击」E 小调 128 BPM
	"battle": {"bpm": 128, "swing": 0.0,
		"chords": [[40, [64, 67, 71]], [48, [64, 67, 72]], [50, [62, 66, 69]], [47, [62, 66, 71]], [40, [64, 67, 71]], [48, [64, 67, 72]], [50, [62, 66, 69]], [47, [62, 66, 71]]],
		"kick": "x...x...x...x...", "snare": "....x.......x..x", "hat": "x.x.x.xox.x.x.xo",
		"bass": "0 . 0 12 . 0 . 12 0 . 0 12 . 7 . 10", "bass_wave": "saw", "bass_vol": 0.26,
		"lead": ["E5 . G5 . A5 . G5 E5 . . D5 . E5 . . .", "G5 . A5 . B5 . A5 G5 . . E5 . G5 . . .", "A5 . B5 . D6 . B5 A5 . . G5 . A5 . F#5 .", "B5 . . . A5 . F#5 . D5 . . . F#5 . . .",
			"E6 . D6 . B5 . D6 . E6 . . . B5 . A5 .", "G5 . B5 . E6 . . . D6 . B5 . G5 . . .", "A5 . D6 . F#6 . E6 D6 . . B5 . A5 . D6 .", "B5 . . . F#5 . . . B5 . D6 . F#6 . . ."],
		"lead_wave": "sq", "lead_vol": 0.06, "pad_vol": 0.025, "arp": 0.03, "drum": [0.7, 0.28, 0.07]},
	# 最后 30 秒：「倒数冲刺」E 小调 150 BPM
	"final": {"bpm": 150, "swing": 0.0,
		"chords": [[40, [64, 67, 71]], [48, [64, 67, 72]], [50, [62, 66, 69]], [47, [62, 66, 71]]],
		"kick": "x...x...x...x.x.", "snare": "....X.......X...", "hat": "xxxxxxxxxxxxxxxo",
		"bass": "0 12 0 12 0 12 0 12 0 12 0 12 7 12 10 12", "bass_wave": "saw", "bass_vol": 0.24,
		"lead": ["E6 . . E6 . . D6 . . B5 . . D6 . E6 .", "G6 . . G6 . . E6 . . D6 . . E6 . G6 .", "F#6 . . F#6 . . E6 . . D6 . . E6 . F#6 .", "B6 . . . A6 . . . F#6 . . . D6 . B5 ."],
		"lead_wave": "saw", "lead_vol": 0.055, "pad_vol": 0.02, "arp": 0.035, "drum": [0.75, 0.3, 0.06]},
}

var streams := {}
var players: Array = []
var cur := 0
var want := ""
var playing := ""
var volume_db := -10.0
var thread: Thread
var mutex := Mutex.new()

func _ready() -> void:
	for i in 2:
		var p := AudioStreamPlayer.new(); p.volume_db = -60; add_child(p); players.append(p)
	if OS.get_environment("GB_NO_MUSIC") != "": return
	thread = Thread.new()
	thread.start(_render_all)

func _exit_tree() -> void:
	if thread != null and thread.is_started(): thread.wait_to_finish()

func _render_all() -> void:
	for k in ["menu", "battle", "final"]:
		var s := render(TRACKS[k])
		mutex.lock(); streams[k] = s; mutex.unlock()

func play(name: String) -> void:
	want = name

func _process(delta: float) -> void:
	if want != playing:
		mutex.lock(); var s = streams.get(want); mutex.unlock()
		if s != null:
			cur = 1 - cur
			var p: AudioStreamPlayer = players[cur]; p.stream = s; p.volume_db = -40; p.play()
			playing = want
	for i in 2:
		var p: AudioStreamPlayer = players[i]
		if not p.playing: continue
		var target := volume_db if i == cur else -60.0
		p.volume_db = move_toward(p.volume_db, target, delta * 30.0)
		if i != cur and p.volume_db <= -59: p.stop()

# ---------------- 合成 ----------------
static func mtof(m: float) -> float: return 440.0 * pow(2.0, (m - 69.0) / 12.0)

static func note_midi(t: String) -> int:
	var names := {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}
	var n: int = names[t[0]]; var i := 1
	if t[1] == "#": n += 1; i = 2
	return n + (int(t.substr(i)) + 1) * 12

func render(T: Dictionary) -> AudioStreamWAV:
	var step := 60.0 / float(T.bpm) / 4.0
	var bars: int = T.chords.size()
	var n := int(bars * 16 * step * RATE)
	var buf := PackedFloat32Array(); buf.resize(n)
	var dv: Array = T.drum
	var bass_steps: PackedStringArray = str(T.bass).split(" ")
	for b in bars:
		var root: int = T.chords[b][0]; var pad: Array = T.chords[b][1]
		var t_bar := b * 16 * step
		# 和声铺底：整小节的柔和锯齿和弦
		for m in pad: _saw_pad(buf, t_bar, 16 * step, mtof(m), float(T.pad_vol))
		var lead: PackedStringArray = str(T.lead[b % T.lead.size()]).split(" ")
		for s in 16:
			var t := t_bar + s * step + (step * float(T.swing) if s % 2 == 1 else 0.0)
			var kc: String = T.kick[s]; var sc: String = T.snare[s]; var hc: String = T.hat[s]
			if kc != ".": _kick(buf, t, float(dv[0]) * (1.2 if kc == "X" else 1.0))
			if sc != ".": _noise(buf, t, 0.14, float(dv[1]) * (1.3 if sc == "X" else 1.0), 0.45, true)
			if hc != ".": _noise(buf, t, 0.12 if hc == "o" else 0.035, float(dv[2]), 0.9, false)
			if s < bass_steps.size() and bass_steps[s] != ".":
				_tone(buf, t, step * 1.6, mtof(root + int(bass_steps[s])), float(T.bass_vol), str(T.bass_wave), 0.5)
			if s < lead.size() and lead[s] != ".":
				var ln := 1
				while s + ln < lead.size() and lead[s + ln] == "." and ln < 4: ln += 1
				_tone(buf, t, step * ln * 0.95, mtof(note_midi(lead[s])), float(T.lead_vol), str(T.lead_wave), 0.25)
			if float(T.arp) > 0 and s % 2 == 0:
				_tone(buf, t, step * 0.9, mtof(int(pad[(s / 2) % pad.size()]) + 12), float(T.arp), "tri", 0.6)
	var bytes := PackedByteArray(); bytes.resize(n * 2)
	for i in n: bytes.encode_s16(i * 2, int(clampf(buf[i] * 0.9, -1.0, 1.0) * 32000.0))
	var w := AudioStreamWAV.new()
	w.format = AudioStreamWAV.FORMAT_16_BITS; w.mix_rate = RATE; w.data = bytes
	w.loop_mode = AudioStreamWAV.LOOP_FORWARD; w.loop_begin = 0; w.loop_end = n
	return w

func _idx(buf: PackedFloat32Array, t: float) -> int: return int(t * RATE) % buf.size()

func _tone(buf: PackedFloat32Array, t: float, dur: float, f: float, vol: float, wave: String, decay: float) -> void:
	var i0 := int(t * RATE); var ln := int(dur * RATE); var ph := 0.0; var lp := 0.0
	var n := buf.size()
	for i in ln:
		ph += f / RATE
		var x := fmod(ph, 1.0); var v := 0.0
		match wave:
			"sq": v = 1.0 if x < 0.5 else -1.0
			"saw": v = x * 2.0 - 1.0
			_: v = absf(x * 4.0 - 2.0) - 1.0
		lp += (v - lp) * 0.35   # 简单低通，去掉刺耳的高频
		var k := float(i) / ln
		var env := minf(1.0, k * 60.0) * pow(1.0 - k, 1.0 + decay * 2.0)
		buf[(i0 + i) % n] += lp * vol * env

func _saw_pad(buf: PackedFloat32Array, t: float, dur: float, f: float, vol: float) -> void:
	var i0 := int(t * RATE); var ln := int(dur * RATE); var n := buf.size()
	var p1 := 0.0; var p2 := 0.3; var lp := 0.0
	for i in ln:
		p1 += f * 0.995 / RATE; p2 += f * 1.005 / RATE
		var v := (fmod(p1, 1.0) + fmod(p2, 1.0)) - 1.0
		lp += (v - lp) * 0.08
		var k := float(i) / ln
		var env := minf(1.0, k * 6.0) * minf(1.0, (1.0 - k) * 8.0)
		buf[(i0 + i) % n] += lp * vol * env

func _kick(buf: PackedFloat32Array, t: float, vol: float) -> void:
	var i0 := int(t * RATE); var ln := int(0.22 * RATE); var ph := 0.0; var n := buf.size()
	for i in ln:
		var k := float(i) / ln
		ph += (150.0 * pow(0.3, k) + 40.0) / RATE
		buf[(i0 + i) % n] += sin(ph * TAU) * vol * pow(1.0 - k, 2.0)

func _noise(buf: PackedFloat32Array, t: float, dur: float, vol: float, bright: float, body: bool) -> void:
	var i0 := int(t * RATE); var ln := int(dur * RATE); var lp := 0.0; var prev := 0.0; var n := buf.size()
	var seed_v := int(t * 1000.0) * 7919 + 1
	for i in ln:
		seed_v = (seed_v * 1103515245 + 12345) & 0x7FFFFFFF
		var r := float(seed_v) / 0x7FFFFFFF * 2.0 - 1.0
		lp += (r - lp) * bright
		var hp := lp - prev if bright > 0.8 else lp
		prev = lp
		var k := float(i) / ln
		var v := hp * pow(1.0 - k, 2.5)
		if body: v += sin(float(i) / RATE * TAU * 190.0) * 0.4 * pow(1.0 - k, 4.0)
		buf[(i0 + i) % n] += v * vol
