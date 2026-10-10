// GLSL sources. Three programs: the depth gradient, the plants, and the creatures. Each entity is one
// instanced quad, and its fragment shader draws the shape. Colours are premultiplied.

export const BACKGROUND_VERT = `#version 300 es
layout(location = 0) in vec2 a_corner; // the unit quad, -1 to 1
uniform vec3 u_depth; // camera y, half the view height in world units, world height
out float v_depth; // 0 at the top of the world, 1 at the bottom

void main() {
  gl_Position = vec4(a_corner, 0.0, 1.0);
  // Clip y grows upward and world y grows downward.
  v_depth = (u_depth.x - a_corner.y * u_depth.y) / u_depth.z;
}
`;

export const BACKGROUND_FRAG = `#version 300 es
precision highp float;
in float v_depth;
out vec4 o_color;

void main() {
  vec3 rgb = mix(vec3(10.0, 42.0, 58.0), vec3(4.0, 18.0, 28.0), clamp(v_depth, 0.0, 1.0)) / 255.0;
  o_color = vec4(rgb, 1.0);
}
`;

export const PLANT_VERT = `#version 300 es
layout(location = 0) in vec2 a_corner;
layout(location = 1) in vec4 a_plant; // x, y, radius, reserve01
uniform vec4 u_view; // camera x, camera y, clip units per world unit on x and on y
uniform float u_px; // world units per device pixel
out vec2 v_uv;
out float v_reserve;

void main() {
  v_uv = a_corner;
  v_reserve = a_plant.w;
  // A far plant stays a visible dot.
  vec2 world = a_plant.xy + a_corner * max(a_plant.z, 1.5 * u_px);
  gl_Position = vec4((world - u_view.xy) * u_view.zw, 0.0, 1.0);
}
`;

export const PLANT_FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;
in float v_reserve;
out vec4 o_color;

void main() {
  // A full plant is a bright blob. A grazed plant is thin and pale.
  float a = (1.0 - smoothstep(0.3, 1.0, length(v_uv))) * mix(0.2, 0.85, v_reserve);
  vec3 rgb = mix(vec3(0.5, 0.62, 0.5), vec3(0.3, 0.85, 0.35), v_reserve);
  o_color = vec4(rgb * a, a);
}
`;

// The tail length over the body length. The vertex shader sizes the quad with it.
const TAIL = `const float TAIL = 0.8;`;

export const CREATURE_VERT = `#version 300 es
layout(location = 0) in vec2 a_corner;
layout(location = 1) in vec4 a_pose; // x, y, heading, hue
layout(location = 2) in vec4 a_body; // length, width, energy01, flags
layout(location = 3) in float a_phase; // the phase of the tail wave, radians
uniform vec4 u_view;
out vec2 v_p; // the body frame in world units: +x is forward
flat out vec3 v_rgb;
flat out vec4 v_body; // half length, half width, energy01, tail phase
flat out vec2 v_marks; // 1 for the player's lineage, 1 for the possessed creature
${TAIL}

vec3 hsv(float h, float s, float v) {
  vec3 k = clamp(abs(fract(h + vec3(0.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0) - 1.0, 0.0, 1.0);
  return v * mix(vec3(1.0), k, s);
}

void main() {
  float len = a_body.x;
  float wid = a_body.y;
  float energy = a_body.z;
  // The quad is 2.5 widths wide. The same margin is in front, for the outline and the ring.
  float front = 0.5 * len + 0.75 * wid;
  float back = 0.5 * len + TAIL * len;
  v_p = vec2(a_corner.x > 0.0 ? front : -back, a_corner.y * 1.25 * wid);
  vec2 axis = vec2(cos(a_pose.z), sin(a_pose.z));
  vec2 world = a_pose.xy + v_p.x * axis + v_p.y * vec2(-axis.y, axis.x);
  gl_Position = vec4((world - u_view.xy) * u_view.zw, 0.0, 1.0);
  // A starving creature looks faded.
  v_rgb = hsv(a_pose.w, mix(0.2, 0.7, energy), mix(0.5, 1.0, energy));
  v_body = vec4(0.5 * len, 0.5 * wid, energy, a_phase);
  int flags = int(a_body.w);
  v_marks = vec2(flags & 1, (flags >> 1) & 1);
}
`;

export const CREATURE_FRAG = `#version 300 es
precision highp float;
in vec2 v_p;
flat in vec3 v_rgb;
flat in vec4 v_body;
flat in vec2 v_marks;
uniform float u_px;
out vec4 o_color;
${TAIL}

// 1 inside distance 0, with an edge one pixel soft.
float fill(float d) {
  return 1.0 - smoothstep(-0.5 * u_px, 0.5 * u_px, d);
}

// A line along distance 0 of the given half thickness, and never thinner than a pixel.
float line(float d, float half_thickness) {
  return fill(abs(d) - max(half_thickness, 0.6 * u_px));
}

vec4 over(vec4 under, vec3 rgb, float a) {
  return vec4(rgb * a, a) + under * (1.0 - a);
}

void main() {
  float hl = v_body.x;
  float hw = v_body.y;
  // The capsule: every point within hw of a segment on the x axis.
  float d = length(vec2(max(abs(v_p.x) - max(hl - hw, 0.0), 0.0), v_p.y)) - hw;

  // The tail: a wave that grows from the rear tip, 0 there and 1 at the tail's end.
  float tail_len = TAIL * 2.0 * hl;
  float along = (-hl - v_p.x) / tail_len;
  float wave = along * 9.0 - v_body.w;
  float amplitude = 0.6 * hw * along;
  float slope = (9.0 * cos(wave) * amplitude + 0.6 * hw * sin(wave)) / tail_len;
  float tail_d = abs(v_p.y - sin(wave) * amplitude) / sqrt(1.0 + slope * slope);
  float tail = line(tail_d, mix(0.2, 0.04, along) * hw) * step(0.0, along) * fill(along - 0.97);
  vec4 c = vec4(v_rgb, 1.0) * tail * 0.75;

  c = over(c, v_rgb, 0.35 * fill(d));
  // The nucleus, toward the front.
  c = over(c, v_rgb * 0.3, 0.65 * fill(length(v_p - vec2(0.3 * hl, 0.0)) - 0.45 * hw));
  // The membrane, just inside the edge.
  float membrane = 0.12 * hw;
  c = over(c, mix(v_rgb, vec3(1.0), 0.4), 0.9 * line(d + membrane, membrane));
  // The player's lineage: a pale outline.
  c = over(c, vec3(0.92, 0.97, 1.0), 0.85 * v_marks.x * line(d - 0.3 * hw, 0.05 * hw));
  // The possessed creature: the energy ring. The arc starts at the nose and sweeps clockwise.
  float turn = fract(atan(v_p.y, v_p.x) / 6.2831853);
  float lit = mix(0.15, 0.95, step(turn, v_body.z));
  c = over(c, vec3(1.0, 0.95, 0.7), lit * v_marks.y * line(d - 0.7 * hw, 0.1 * hw));
  o_color = c;
}
`;
