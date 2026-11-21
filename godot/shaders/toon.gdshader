// 机兵 / 驾驶员的卡通着色：三段明暗 + 边缘光 + 受击闪白（受击闪白用叠加材质，手机 / 网页版也支持）
shader_type spatial;
render_mode diffuse_toon, specular_toon;
uniform vec4 albedo : source_color = vec4(1.0);
uniform float emission_k = 0.0;
uniform vec4 rim_color : source_color = vec4(1.0, 1.0, 1.0, 1.0);
uniform float rim_k = 0.35;
uniform float gloss = 0.4;
void fragment() {
	vec3 base = albedo.rgb;
	ALBEDO = base;
	float fres = pow(1.0 - clamp(dot(NORMAL, VIEW), 0.0, 1.0), 3.0);
	EMISSION = base * emission_k + rim_color.rgb * fres * rim_k;
	ROUGHNESS = 1.0 - gloss;
	SPECULAR = 0.5;
}
void light() {
	float nl = dot(NORMAL, LIGHT);
	float band = smoothstep(-0.05, 0.05, nl) * 0.55 + smoothstep(0.45, 0.55, nl) * 0.45;
	DIFFUSE_LIGHT += ALBEDO * LIGHT_COLOR * ATTENUATION * (0.25 + band * 0.9) / PI;
	vec3 h = normalize(LIGHT + VIEW);
	float sp = smoothstep(0.9, 0.95, pow(max(dot(NORMAL, h), 0.0), 24.0)) * gloss;
	SPECULAR_LIGHT += LIGHT_COLOR * ATTENUATION * sp * 0.6;
}
