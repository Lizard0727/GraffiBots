// 地面涂料：线性过滤 + 阈值让格子边缘变成圆滑的涂料团；用覆盖度的梯度做出「厚涂料」的凸起和湿润高光
shader_type spatial;
render_mode cull_disabled;
uniform sampler2D paint_tex : filter_linear, repeat_disable;
uniform sampler2D base_tex : filter_nearest, repeat_disable;
uniform vec2 grid_size = vec2(120.0, 80.0);
uniform float time_k = 0.0;
uniform vec4 team_a : source_color = vec4(1.0, 0.24, 0.65, 1.0);
uniform vec4 team_b : source_color = vec4(0.12, 0.84, 0.93, 1.0);
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
float vnoise(vec2 p) {
	vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
	return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0)), f.x), f.y);
}
// 涂料覆盖度：双线性采样 + 两层平滑噪声扰动阈值 → 边缘像泼溅出来的不规则涂料团
// 4 次采样的 B 样条（双三次）过滤：比双线性圆滑得多，涂料团不会出现锯齿台阶
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
	vec3 base = texture(base_tex, UV).rgb;
	// 地面细节：格线 + 轻微噪点
	vec2 f = fract(cell);
	float line = 1.0 - smoothstep(0.0, 0.04, min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y)));
	base *= 0.92 + 0.08 * hash(floor(cell)) - line * 0.08;
	vec2 pr = paint_bicubic(UV);
	float c = cover_of(pr, cell);
	vec2 e = vec2(0.35 / grid_size.x, 0.0), e2 = vec2(0.0, 0.35 / grid_size.y);
	float gx = (cover_at(UV + e) - c) * 2.0;
	float gy = (cover_at(UV + e2) - c) * 2.0;
	// 两队交界：谁的涂料多就是谁的颜色，交界线也带一点噪声
	float side = smoothstep(-0.03, 0.03, pr.y - pr.x + edge_noise(cell * 1.3) * 0.08);
	vec3 col = mix(team_a.rgb, team_b.rgb, side) * 0.86;
	// 交界处压暗一条细线，像两层涂料叠在一起
	col *= 1.0 - 0.25 * (1.0 - abs(side * 2.0 - 1.0)) * step(0.05, min(pr.x, pr.y));
	float shade = 0.92 + 0.08 * hash(floor(cell * 0.5));
	ALBEDO = mix(base, col * shade, c);
	// 涂料边缘的凸起（法线贴图）
	// 网格没有切线，直接在世界空间算法线再转到视图空间（UV.x → 世界 x，UV.y → 世界 z）
	vec3 wn = normalize(vec3(-gx * 0.9, 1.0, -gy * 0.9));
	NORMAL = normalize((VIEW_MATRIX * vec4(wn, 0.0)).xyz);
	ROUGHNESS = mix(0.82, 0.18, c);
	SPECULAR = mix(0.25, 0.6, c);
	EMISSION = col * c * 0.03;
}
