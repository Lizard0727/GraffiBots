// 墙面 / 高台侧面：按世界坐标画花纹，不用贴图
// 顶点色：rgb 是底色深浅（底部压暗），alpha 是这一面从下到上的位置（0 底 → 1 顶），用来画顶上的压顶 / 路沿
// style：0 水泥板 / 1 红砖 / 2 集装箱瓦楞 / 3 岩石 / 4 树篱 / 5 竹篱笆 / 6 玻璃幕墙 / 7 冰 / 8 列车车厢 / 9 石块 / 10 条纹篷布 / 11 白瓷砖 / 12 锈铁
shader_type spatial;
render_mode cull_disabled;
uniform int style = 0;
uniform vec4 col_a : source_color = vec4(0.7, 0.7, 0.7, 1.0);
uniform vec4 col_b : source_color = vec4(0.5, 0.5, 0.5, 1.0);
uniform vec4 cap : source_color = vec4(0.85, 0.85, 0.85, 1.0);   // 顶上一圈压顶 / 路沿的颜色
uniform float cap_w = 0.08;
uniform float scale_k = 1.0;
varying vec3 wp;
varying vec3 wn;
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
float vnoise(vec2 p) {
	vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
	return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0)), f.x), f.y);
}
float fbm(vec2 p) { return vnoise(p) * 0.5 + vnoise(p * 2.1) * 0.3 + vnoise(p * 4.3) * 0.2; }
float seam(float v, float w) { float f = fract(v); return 1.0 - smoothstep(0.0, w, min(f, 1.0 - f)); }
void vertex() {
	wp = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
	wn = normalize((MODEL_MATRIX * vec4(NORMAL, 0.0)).xyz);
}
void fragment() {
	// 沿墙面的横向坐标：法线朝 x 用 z，朝 z 用 x
	float u = abs(wn.x) > 0.5 ? wp.z : wp.x;
	float v = wp.y;
	vec2 p = vec2(u, v) * scale_k;
	vec3 c = col_a.rgb; float rough = 0.85; float metal = 0.0; float spec = 0.4;
	float n = fbm(p * 0.8);
	if (style == 0) {
		float s = max(seam(p.y / 1.2, 0.03), seam(p.x / 3.0, 0.012));
		c = mix(col_a.rgb * (0.94 + n * 0.1), col_b.rgb, s * 0.7);
	} else if (style == 1) {
		float row = floor(p.y / 0.32); float off = mod(row, 2.0) * 0.4;
		float s = max(seam(p.y / 0.32, 0.08), seam((p.x + off) / 0.8, 0.04));
		c = mix(col_a.rgb * (0.85 + hash(vec2(floor((p.x + off) / 0.8), row)) * 0.25), col_b.rgb, s);
	} else if (style == 2) {
		// 每 3 格换一个箱子颜色
		float box = floor(u / 3.0) + floor(v / 2.4) * 7.0 + floor((abs(wn.x) > 0.5 ? wp.x : wp.z) / 3.0) * 13.0;
		float t = hash(vec2(box, 1.7));
		vec3 bc = t < 0.25 ? vec3(0.72, 0.2, 0.16) : (t < 0.5 ? vec3(0.16, 0.38, 0.62) : (t < 0.75 ? vec3(0.85, 0.55, 0.14) : vec3(0.2, 0.5, 0.32)));
		float rid = sin(p.x * 18.0) * 0.5 + 0.5;
		float edge = max(seam(u / 3.0, 0.02), seam(v / 2.4, 0.02));
		c = bc * (0.8 + rid * 0.2) * (1.0 - edge * 0.5);
		rough = 0.55; metal = 0.3;
	} else if (style == 3) {
		float strata = sin(p.y * 2.3 + fbm(p * 0.6) * 5.0) * 0.5 + 0.5;
		c = mix(col_b.rgb, col_a.rgb, strata * 0.6 + n * 0.5);
	} else if (style == 4) {
		float leaf = fbm(p * 3.5); float hole = smoothstep(0.62, 0.7, leaf);
		c = mix(col_a.rgb * (0.8 + leaf * 0.4), col_b.rgb, hole); rough = 0.95;
	} else if (style == 5) {
		float slat = seam(p.x / 0.35, 0.12); float knot = seam(p.y / 1.4, 0.04);
		c = mix(col_a.rgb * (0.85 + hash(vec2(floor(p.x / 0.35), 2.0)) * 0.2), col_b.rgb, max(slat, knot) * 0.8); rough = 0.7;
	} else if (style == 6) {
		float s = max(seam(p.y / 1.6, 0.03), seam(p.x / 1.6, 0.03));
		float fres = pow(1.0 - clamp(dot(NORMAL, VIEW), 0.0, 1.0), 2.0);
		c = mix(col_a.rgb * (0.7 + p.y * 0.04 + fres * 0.5), col_b.rgb, s); rough = 0.08; metal = 0.6; spec = 0.9;
	} else if (style == 7) {
		float crack = 1.0 - smoothstep(0.0, 0.03, abs(fbm(p * 0.7) - 0.5));
		float fres = pow(1.0 - clamp(dot(NORMAL, VIEW), 0.0, 1.0), 2.0);
		c = mix(col_a.rgb * (0.85 + n * 0.2) + fres * 0.2, col_b.rgb, crack * 0.7); rough = 0.15; spec = 0.8;
	} else if (style == 8) {
		// 车厢：腰线 + 一排小窗 + 竖向接缝
		float band = step(0.38, fract(v / 2.4)) * step(fract(v / 2.4), 0.48);
		float win = step(0.6, fract(v / 2.4)) * step(fract(v / 2.4), 0.82) * step(0.25, fract(u / 1.6)) * step(fract(u / 1.6), 0.75);
		float s = seam(u / 4.0, 0.01);
		c = col_a.rgb * (0.9 + n * 0.1);
		c = mix(c, col_b.rgb, band);
		c = mix(c, vec3(0.12, 0.16, 0.2), win * 0.85);
		c *= 1.0 - s * 0.5; rough = 0.5; metal = 0.35;
	} else if (style == 9) {
		float row = floor(p.y / 0.7); float off = mod(row, 2.0) * 0.8;
		float s = max(seam(p.y / 0.7, 0.05), seam((p.x + off) / 1.6, 0.025));
		c = mix(col_a.rgb * (0.86 + hash(vec2(floor((p.x + off) / 1.6), row)) * 0.2 + n * 0.06), col_b.rgb, s * 0.85);
	} else if (style == 10) {
		float st = step(0.5, fract(p.x / 0.9));
		c = mix(col_a.rgb, col_b.rgb, st) * (0.9 + n * 0.1); rough = 0.9;
	} else if (style == 11) {
		float s = max(seam(p.y / 0.5, 0.05), seam(p.x / 0.5, 0.05));
		float stripe = step(0.3, fract(v / 9.0)) * step(fract(v / 9.0), 0.42);
		c = mix(mix(col_a.rgb, col_b.rgb, stripe), vec3(0.55), s * 0.4); rough = 0.3; spec = 0.6;
	} else if (style == 12) {
		float rust = smoothstep(0.35, 0.75, fbm(p * 0.9 + 3.0));
		float s = seam(u / 2.5, 0.015);
		c = mix(col_a.rgb, col_b.rgb, rust) * (1.0 - s * 0.4); rough = 0.75; metal = 0.25;
	}
	// 顶上的压顶 / 路沿
	float h = COLOR.a;
	float capm = smoothstep(1.0 - cap_w - 0.01, 1.0 - cap_w, h);
	c = mix(c, cap.rgb, capm);
	ALBEDO = c * COLOR.rgb;
	ROUGHNESS = rough; METALLIC = metal; SPECULAR = spec;
}
