// 描边（反面外扩）：卡通风格的黑色轮廓线
shader_type spatial;
render_mode unshaded, cull_front, depth_draw_opaque;
uniform vec4 color : source_color = vec4(0.06, 0.05, 0.1, 1.0);
uniform float width = 0.045;
void vertex() {
	VERTEX += normalize(VERTEX) * width;
}
void fragment() {
	ALBEDO = color.rgb;
}
