// GLSL sources. One instanced quad per creature. The fragment shader draws the shape.

export const VERT = `#version 300 es
layout(location = 0) in vec2 a_corner; // the unit quad, -1 to 1
layout(location = 1) in vec4 a_pose; // x, y, heading, hue
layout(location = 2) in vec4 a_body; // length, width, energy01, flags
uniform vec4 u_view; // camera x, camera y, clip units per world unit on x and on y
uniform float u_px; // world units per device pixel
out vec2 v_uv;
out vec3 v_rgb;

vec3 hsv(float h, float s, float v) {
  vec3 k = clamp(abs(fract(h + vec3(0.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0) - 1.0, 0.0, 1.0);
  return v * mix(vec3(1.0), k, s);
}

void main() {
  vec2 radii = 0.5 * a_body.xy;
  // The quad is one pixel larger than the shape, so the quad does not cut the soft edge.
  vec2 local = a_corner * (radii + u_px);
  v_uv = local / radii;
  vec2 axis = vec2(cos(a_pose.z), sin(a_pose.z));
  vec2 world = a_pose.xy + local.x * axis + local.y * vec2(-axis.y, axis.x);
  gl_Position = vec4((world - u_view.xy) * u_view.zw, 0.0, 1.0);
  v_rgb = hsv(a_pose.w, 0.6, 0.95);
}
`;

export const FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;
in vec3 v_rgb;
out vec4 o_color;

void main() {
  float d = length(v_uv) - 1.0;
  float a = 1.0 - smoothstep(-fwidth(d), fwidth(d), d);
  o_color = vec4(v_rgb * a, a); // premultiplied
}
`;
