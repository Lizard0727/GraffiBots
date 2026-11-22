// 地面：每张地图的地面花纹（地砖 / 木板 / 鹅卵石 / 草地 / 沙地 / 雪地 / 沥青 / 钢板 / 水泥 / 碎石 / 岩石 / 大理石 / 荒草水泥）+ 涂料
// base_tex：rgb 是这一格的底色，alpha 是材质编号（0 地面 / 1 高台 / 2 楼梯 / 3 墙顶）
// 涂料：线性过滤 + 阈值让格子边缘变成圆滑的涂料团；用覆盖度的梯度做出「厚涂料」的凸起和湿润高光
shader_type spatial;
render_mode cull_disabled;
uniform sampler2D paint_tex : filter_linear, repeat_disable;
uniform sampler2D base_tex : filter_nearest, repeat_disable;
uniform vec2 grid_size = vec2(120.0, 80.0);
uniform float time_k = 0.0;
uniform vec4 team_a : source_color = vec4(1.0, 0.24, 0.65, 1.0);
uniform vec4 team_b : source_color = vec4(0.12, 0.84, 0.93, 1.0);
uniform ivec4 pat = ivec4(9, 9, 9, 10);          // 四种材质各用哪种花纹
uniform vec4 detail : source_color = vec4(0.0, 0.0, 0.0, 1.0);   // 花纹的缝 / 线颜色
uniform vec4 glow_col : source_color = vec4(1.0, 0.45, 0.1, 1.0); // 岩石裂缝的岩浆光（只有熔岩矿坑用）
uniform float glow_k = 0.0;
uniform float gloss = 0.0;                        // 地面整体光泽（大理石 / 湿沥青）
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
vec2 hash2(vec2 p) { return fract(sin(vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)))) * 43758.5453); }
float vnoise(vec2 p) {
	vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
	return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0)), f.x), f.y);
}
float fbm(vec2 p) { return vnoise(p) * 0.5 + vnoise(p * 2.1) * 0.3 + vnoise(p * 4.3) * 0.2; }
// 沃罗诺伊：返回 (到最近点的距离, 到边界的距离, 这块石头的随机数)
vec3 voro(vec2 p) {
	vec2 i = floor(p); vec2 f = fract(p);
	float d1 = 8.0, d2 = 8.0; float id = 0.0;
	for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
		vec2 g = vec2(float(x), float(y)); vec2 o = hash2(i + g) * 0.8 + 0.1;
		float d = length(g + o - f);
		if (d < d1) { d2 = d1; d1 = d; id = hash(i + g); } else if (d < d2) { d2 = d; }
	}
	return vec3(d1, d2 - d1, id);
}
float seam(float v, float w) { float f = fract(v); return 1.0 - smoothstep(0.0, w, min(f, 1.0 - f)); }
// 返回 vec4：rgb = 乘到底色上的明暗 / 颜色，a = 缝的深度（0~1，越大越接近 detail 颜色）
vec4 pattern(int id, vec2 p, out float rough, out float glow) {
	rough = 0.85; glow = 0.0;
	float n = fbm(p * 0.6);
	if (id == 1) {        // 地砖：2×2 格一块，砖缝
		vec2 q = p / 2.0; float s = max(seam(q.x, 0.035), seam(q.y, 0.035));
		float t = hash(floor(q)); return vec4(vec3(0.94 + t * 0.1 + n * 0.04), s * 0.8);
	} else if (id == 2) { // 木板：沿 x 方向的长条，错缝
		float row = floor(p.y / 0.75); float off = hash(vec2(row, 3.0)) * 4.0;
		float s = max(seam(p.y / 0.75, 0.06), seam((p.x + off) / 4.0, 0.012));
		float grain = vnoise(vec2(p.x * 0.8, p.y * 9.0)) * 0.12;
		rough = 0.7; return vec4(vec3(0.88 + hash(vec2(row, floor((p.x + off) / 4.0))) * 0.16 + grain), s * 0.9);
	} else if (id == 3) { // 鹅卵石
		vec3 v = voro(p * 0.8); float s = 1.0 - smoothstep(0.02, 0.08, v.y);
		return vec4(vec3(0.9 + v.z * 0.14 - v.x * 0.08), s * 0.7);
	} else if (id == 4) { // 草地：大块深浅 + 细草纹
		float g = fbm(p * 0.35); float blade = vnoise(p * vec2(9.0, 3.0)) * 0.12;
		return vec4(vec3(0.82 + g * 0.3 + blade) * vec3(1.0, 1.04, 0.95), 0.0);
	} else if (id == 5) { // 沙地：风吹出来的波纹
		float r = sin((p.x * 0.9 + p.y * 0.35 + fbm(p * 0.25) * 6.0) * 2.4) * 0.5 + 0.5;
		return vec4(vec3(0.9 + r * 0.08 + n * 0.1), 0.0);
	} else if (id == 6) { // 雪地：柔和起伏 + 一点点闪光
		float sp = step(0.985, hash(floor(p * 6.0))) * 0.35;
		rough = 0.6; return vec4(vec3(0.94 + fbm(p * 0.3) * 0.1 + sp), 0.0);
	} else if (id == 7) { // 沥青：细噪点 + 偶尔的裂缝
		float crack = 1.0 - smoothstep(0.0, 0.05, abs(fbm(p * 0.4) - 0.5));
		return vec4(vec3(0.92 + hash(floor(p * 5.0)) * 0.08 + n * 0.08), crack * 0.25);
	} else if (id == 8) { // 钢板：4×4 格一块，接缝 + 铆钉
		vec2 q = p / 4.0; float s = max(seam(q.x, 0.012), seam(q.y, 0.012));
		vec2 f = fract(q) * 4.0; float rv = 1.0 - smoothstep(0.08, 0.12, length(fract(f) - 0.5)) ;
		rv *= step(fract(q.x) * 4.0, 0.6) + step(3.4, fract(q.x) * 4.0);
		rough = 0.45; return vec4(vec3(0.9 + hash(floor(q)) * 0.1 + n * 0.05 + rv * 0.08), s * 0.9);
	} else if (id == 9) { // 水泥：大块板 + 污渍
		vec2 q = p / 5.0; float s = max(seam(q.x, 0.006), seam(q.y, 0.006));
		float stain = smoothstep(0.55, 0.8, fbm(p * 0.18)) * 0.12;
		return vec4(vec3(0.95 + hash(floor(q)) * 0.06 + n * 0.06 - stain), s * 0.55);
	} else if (id == 10) { // 碎石
		float g = vnoise(p * 3.0); float g2 = vnoise(p * 7.0 + 3.0);
		float pebble = smoothstep(0.7, 0.78, vnoise(p * 2.2 + 9.0)) * 0.12;
		return vec4(vec3(0.84 + g * 0.12 + g2 * 0.08 + pebble), 0.0);
	} else if (id == 11) { // 岩石（裂缝里可以有岩浆光）
		vec3 v = voro(p * 0.45); float c = 1.0 - smoothstep(0.0, 0.06, v.y);
		glow = c * (0.6 + 0.4 * sin(time_k * 2.0 + v.z * 20.0));
		return vec4(vec3(0.82 + v.z * 0.22 + n * 0.12), c * 0.9);
	} else if (id == 12) { // 大理石：大块 + 纹理
		vec2 q = p / 3.0; float s = max(seam(q.x, 0.008), seam(q.y, 0.008));
		float vein = 1.0 - smoothstep(0.0, 0.035, abs(sin((p.x + p.y * 0.6 + fbm(p * 0.5) * 5.0) * 1.3)));
		rough = 0.25; return vec4(vec3(0.97 - vein * 0.12 + hash(floor(q)) * 0.04), s * 0.6);
	} else if (id == 13) { // 荒废水泥：裂开的水泥板，缝里长出青苔
		vec2 q = p / 4.0; float s = max(seam(q.x, 0.01), seam(q.y, 0.01));
		float moss = smoothstep(0.5, 0.75, fbm(p * 0.22 + 7.0));
		vec3 c = mix(vec3(0.95 + n * 0.08), vec3(0.62, 0.8, 0.45), moss * 0.7);
		return vec4(c, s * 0.6 * (1.0 - moss));
	} else if (id == 14) { // 彩色地砖（乐园）：每块随机换颜色
		vec2 q = p / 2.0; float s = max(seam(q.x, 0.04), seam(q.y, 0.04));
		float t = hash(floor(q)); vec3 c = t < 0.33 ? vec3(1.06, 0.95, 0.92) : (t < 0.66 ? vec3(0.95, 1.02, 1.06) : vec3(1.0));
		return vec4(c, s * 0.7);
	} else if (id == 15) { // 月台地砖：小方砖 + 防滑点
		vec2 q = p; float s = max(seam(q.x, 0.04), seam(q.y, 0.04));
		return vec4(vec3(0.95 + hash(floor(q)) * 0.06), s * 0.6);
	}
	return vec4(vec3(0.95 + n * 0.08), 0.0);
}
vec2 paint_bicubic(vec2 uv) {
	vec2 st = uv * grid_size - 0.5;
	vec2 i = floor(st); vec2 f = st - i;
	vec2 f2 = f * f; vec2 f3 = f2 * f;
	vec2 w0 = (-f3 + 3.0 * f2 - 3.0 * f + 1.0) / 6.0;
	vec2 w1 = (3.0 * f3 - 6.0 * f2 + 4.0) / 6.0;
	vec2 w2 = (-3.0 * f3 + 3.0 * f2 + 3.0 * f + 1.0) / 6.0;
	vec2 w3 = f3 / 6.0;
	vec2 s0 = w0 + w1; vec2 s1 = w2 + w3;
	vec2 o0 = (i - 0.5 + w1 / s0) / grid_size;
	vec2 o1 = (i + 1.5 + w3 / s1) / grid_size;
	vec2 a = mix(texture(paint_tex, vec2(o0.x, o0.y)).rg, texture(paint_tex, vec2(o1.x, o0.y)).rg, s1.x);
	vec2 b = mix(texture(paint_tex, vec2(o0.x, o1.y)).rg, texture(paint_tex, vec2(o1.x, o1.y)).rg, s1.x);
	return mix(a, b, s1.y);
}
float edge_noise(vec2 cell) { return vnoise(cell * 1.7) * 0.6 + vnoise(cell * 4.3) * 0.4 - 0.5; }
float cover_of(vec2 pr, vec2 cell) { return smoothstep(0.36, 0.42, pr.x + pr.y + edge_noise(cell) * 0.3); }
float cover_at(vec2 uv) { return cover_of(paint_bicubic(uv), uv * grid_size); }
void fragment() {
	vec2 cell = UV * grid_size;
	vec4 bt = texture(base_tex, UV);
	int mat = int(bt.a * 3.0 + 0.5);
	int pid = mat == 0 ? pat.x : (mat == 1 ? pat.y : (mat == 2 ? pat.z : pat.w));
	float rough; float gl;
	vec4 pt = pattern(pid, cell, rough, gl);
	vec3 base = bt.rgb * pt.rgb;
	base = mix(base, detail.rgb * bt.rgb * 1.4, pt.a * detail.a);
	if (mat == 2) base *= 0.9 + 0.1 * step(0.5, fract(cell.x + cell.y));   // 楼梯：一级一级的明暗
	vec2 pr = paint_bicubic(UV);
	float c = cover_of(pr, cell);
	vec2 e = vec2(0.35 / grid_size.x, 0.0), e2 = vec2(0.0, 0.35 / grid_size.y);
	float gx = (cover_at(UV + e) - c) * 2.0;
	float gy = (cover_at(UV + e2) - c) * 2.0;
	float side = smoothstep(-0.03, 0.03, pr.y - pr.x + edge_noise(cell * 1.3) * 0.08);
	vec3 col = mix(team_a.rgb, team_b.rgb, side) * 0.8;
	col *= 1.0 - 0.25 * (1.0 - abs(side * 2.0 - 1.0)) * step(0.05, min(pr.x, pr.y));
	float shade = 0.92 + 0.08 * hash(floor(cell * 0.5));
	ALBEDO = mix(base, col * shade, c);
	vec3 wn = normalize(vec3(-gx * 0.9, 1.0, -gy * 0.9));
	NORMAL = normalize((VIEW_MATRIX * vec4(wn, 0.0)).xyz);
	ROUGHNESS = mix(mix(rough, 0.2, gloss), 0.2, c);
	SPECULAR = mix(mix(0.3, 0.6, gloss), 0.55, c);
	EMISSION = col * c * 0.02 + glow_col.rgb * gl * glow_k * (1.0 - c);
}
