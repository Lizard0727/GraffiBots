// 地面涂料：涂料贴图用线性过滤 + 阈值，格子边缘变成圆滑的涂料团（原来是一格一格的方块）
shader_type spatial;
render_mode cull_disabled;
uniform sampler2D paint_tex : filter_linear, repeat_disable;
uniform sampler2D base_tex : filter_nearest, repeat_disable;
uniform vec2 grid_size = vec2(120.0, 80.0);
void fragment() {
	vec3 base = texture(base_tex, UV).rgb;
	vec4 p = texture(paint_tex, UV);
	// 细小的噪点让涂料边缘不那么规整
	vec2 cell = UV * grid_size;
	float n = fract(sin(dot(floor(cell * 3.0), vec2(12.9898, 78.233))) * 43758.5453) * 0.12;
	float cover = smoothstep(0.38, 0.52, p.a + n - 0.06);
	vec3 col = p.a > 0.001 ? p.rgb / p.a : base;
	float shade = 0.9 + 0.1 * fract(sin(dot(floor(cell), vec2(4.1, 7.3))) * 917.0);
	ALBEDO = mix(base, col * shade, cover);
	ROUGHNESS = mix(0.85, 0.35, cover);
	SPECULAR = mix(0.2, 0.6, cover);
}
