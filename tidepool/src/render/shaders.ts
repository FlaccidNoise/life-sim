// GLSL sources. Four programs: the depth gradient, the plants, the creatures, and their parts. Each
// entity is one instanced quad, and its fragment shader draws the shape. Colours are premultiplied.

import { KIND_CHEMO, KIND_EYE, KIND_FILTER, KIND_FIN, KIND_FLAGELLUM } from '../protocol';

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

// The colour of a body and of its parts, for the two vertex shaders.
const TINT = `
vec3 tint(float hue, float energy) {
  vec3 k = clamp(abs(fract(hue + vec3(0.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0) - 1.0, 0.0, 1.0);
  // A starving creature looks faded.
  return mix(0.5, 1.0, energy) * mix(vec3(1.0), k, mix(0.2, 0.7, energy));
}
`;

// What the creature and part fragment shaders draw with. Distances are in world units.
const SHAPES = `
uniform float u_px; // world units per device pixel

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
`;

export const CREATURE_VERT = `#version 300 es
layout(location = 0) in vec2 a_corner;
layout(location = 1) in vec4 a_pose; // x, y, heading, hue
layout(location = 2) in vec4 a_body; // length, width, energy01, flags
layout(location = 3) in vec2 a_life; // the cilia size, and the bud pulse from 0 to 1
uniform vec4 u_view;
out vec2 v_p; // the body frame in world units: +x is forward
flat out vec3 v_rgb;
flat out vec4 v_body; // half length, half width, energy01, cilia size
flat out vec3 v_marks; // 1 for the player's lineage, 1 for the possessed creature, the bud pulse
${TINT}
void main() {
  float len = a_body.x;
  float wid = a_body.y;
  // The quad is 2.5 widths wide. The same margin is at each end, for the cilia, the outline, and
  // the ring.
  v_p = a_corner * vec2(0.5 * len + 0.75 * wid, 1.25 * wid);
  vec2 axis = vec2(cos(a_pose.z), sin(a_pose.z));
  vec2 world = a_pose.xy + v_p.x * axis + v_p.y * vec2(-axis.y, axis.x);
  gl_Position = vec4((world - u_view.xy) * u_view.zw, 0.0, 1.0);
  v_rgb = tint(a_pose.w, a_body.z);
  v_body = vec4(0.5 * len, 0.5 * wid, a_body.z, a_life.x);
  int flags = int(a_body.w);
  v_marks = vec3(flags & 1, (flags >> 1) & 1, a_life.y);
}
`;

export const CREATURE_FRAG = `#version 300 es
precision highp float;
in vec2 v_p;
flat in vec3 v_rgb;
flat in vec4 v_body;
flat in vec3 v_marks;
uniform float u_beat; // the phase of the cilia beat, radians
uniform float u_bud_at; // the share of a full store at which a body buds
out vec4 o_color;
${SHAPES}
void main() {
  float hl = v_body.x;
  float hw = v_body.y;
  // The capsule: every point within hw of a segment on the x axis.
  float straight = max(hl - hw, 0.0);
  vec2 cap = vec2(max(abs(v_p.x) - straight, 0.0), v_p.y);
  float d = length(cap) - hw;
  vec3 pale = mix(v_rgb, vec3(1.0), 0.4);

  // The cilia: hairs that stand on the membrane, longer and thicker with size. The beat runs
  // round the membrane from the middle of each side.
  float cilia = v_body.w;
  float round_membrane = min(abs(v_p.x), straight) + hw * atan(cap.x, abs(cap.y) + 1e-6);
  float reach = (0.15 + 0.45 * cilia) * hw;
  float gap = 0.45 * hw;
  float sway = 0.3 * gap * sin(u_beat - 1.5 * round_membrane / hw) * clamp(d / reach, 0.0, 1.0);
  float hair = abs(fract((round_membrane + sway) / gap) - 0.5) * gap;
  // Round an end the hairs fan out, and each keeps its thickness.
  hair *= abs(v_p.x) > straight ? 1.0 + d / hw : 1.0;
  float fringe = line(hair, (0.03 + 0.07 * cilia) * hw) * fill(-d) * fill(d - reach);
  vec4 c = vec4(pale, 1.0) * 0.7 * fringe * step(0.001, cilia);

  c = over(c, v_rgb, 0.35 * fill(d));
  // The nucleus, toward the front.
  c = over(c, v_rgb * 0.3, 0.65 * fill(length(v_p - vec2(0.3 * hl, 0.0)) - 0.45 * hw));
  // The membrane, just inside the edge.
  float membrane = 0.12 * hw;
  c = over(c, pale, 0.9 * line(d + membrane, membrane));
  // A body that just budded: one bright pulse, in the body and round it.
  float glow = 0.45 * fill(d) + 0.35 * (1.0 - smoothstep(0.0, 1.2 * hw, max(d, 0.0)));
  c = over(c, vec3(1.0), v_marks.z * glow);
  // The player's lineage: a pale outline.
  c = over(c, vec3(0.92, 0.97, 1.0), 0.85 * v_marks.x * line(d - 0.3 * hw, 0.05 * hw));
  // The possessed creature: the energy ring. The arc starts at the nose and sweeps clockwise.
  float turn = fract(atan(v_p.y, v_p.x) / 6.2831853);
  float lit = mix(0.15, 0.95, step(turn, v_body.z));
  c = over(c, vec3(1.0, 0.95, 0.7), lit * v_marks.y * line(d - 0.7 * hw, 0.1 * hw));
  // The notch: a tick across the ring at the place the arc must reach for a bud.
  vec2 at = vec2(cos(6.2831853 * u_bud_at), sin(6.2831853 * u_bud_at));
  float tick = line(at.x * v_p.y - at.y * v_p.x, 0.07 * hw) * step(0.0, dot(at, v_p));
  c = over(c, vec3(1.0), v_marks.y * tick * fill(abs(d - 0.7 * hw) - 0.3 * hw));
  o_color = c;
}
`;

export const PART_VERT = `#version 300 es
layout(location = 0) in vec2 a_corner;
layout(location = 1) in vec4 a_place; // x, y, the way out of the body in radians, size
layout(location = 2) in vec4 a_look; // kind (negative: mirrored), hue, energy01, phase
uniform vec4 u_view;
out vec2 v_p; // the part frame in sizes: the anchor is at 0, +x is out of the body, +y is back
flat out vec3 v_rgb;
flat out vec3 v_part; // kind, size in world units, phase
${TINT}
void main() {
  float kind = abs(a_look.x);
  // A flagellum is long and thin. Every other kind fits a square round its anchor.
  bool lash = kind == ${KIND_FLAGELLUM}.0;
  vec2 lo = lash ? vec2(-0.05, -0.3) : vec2(-1.2);
  vec2 hi = lash ? vec2(1.05, 0.3) : vec2(1.2);
  v_p = mix(lo, hi, 0.5 + 0.5 * a_corner);
  vec2 axis = vec2(cos(a_place.z), sin(a_place.z));
  // The left part of a pair is the mirror of the right one.
  vec2 side = sign(a_look.x) * vec2(-axis.y, axis.x);
  vec2 world = a_place.xy + a_place.w * (v_p.x * axis + v_p.y * side);
  gl_Position = vec4((world - u_view.xy) * u_view.zw, 0.0, 1.0);
  v_rgb = tint(a_look.y, a_look.z);
  v_part = vec3(kind, a_place.w, a_look.w);
}
`;

export const PART_FRAG = `#version 300 es
precision highp float;
in vec2 v_p;
flat in vec3 v_rgb;
flat in vec3 v_part;
out vec4 o_color;
${SHAPES}
// The distance to a triangle, negative inside.
float triangle(vec2 p, vec2 a, vec2 b, vec2 c) {
  vec2 ab = b - a;
  vec2 bc = c - b;
  vec2 ca = a - c;
  vec2 pa = p - a;
  vec2 pb = p - b;
  vec2 pc = p - c;
  vec2 qa = pa - ab * clamp(dot(pa, ab) / dot(ab, ab), 0.0, 1.0);
  vec2 qb = pb - bc * clamp(dot(pb, bc) / dot(bc, bc), 0.0, 1.0);
  vec2 qc = pc - ca * clamp(dot(pc, ca) / dot(ca, ca), 0.0, 1.0);
  float s = sign(ab.x * ca.y - ab.y * ca.x);
  vec2 m = min(vec2(dot(qa, qa), s * (pa.x * ab.y - pa.y * ab.x)),
               vec2(dot(qb, qb), s * (pb.x * bc.y - pb.y * bc.x)));
  m = min(m, vec2(dot(qc, qc), s * (pc.x * ca.y - pc.y * ca.x)));
  return -sqrt(m.x) * sign(m.y);
}

void main() {
  int kind = int(v_part.x);
  float size = v_part.y;
  float phase = v_part.z;
  vec2 p = v_p;
  float r = length(p);
  vec3 pale = mix(v_rgb, vec3(1.0), 0.4);
  vec4 c = vec4(0.0);
  if (kind == ${KIND_FLAGELLUM}) {
    // A wave that runs out from the anchor. It is 0 there and full at the free end.
    float wave = 9.0 * p.x - phase;
    float amplitude = 0.19 * p.x;
    float slope = 9.0 * cos(wave) * amplitude + 0.19 * sin(wave);
    float d = abs(p.y - sin(wave) * amplitude) / sqrt(1.0 + slope * slope);
    float lash = line(d * size, mix(0.06, 0.012, p.x) * size);
    c = vec4(v_rgb, 1.0) * 0.75 * lash * step(0.0, p.x) * fill((p.x - 1.0) * size);
  } else if (kind == ${KIND_FILTER}) {
    // A mouth: a rim, and a fan of bristles that sweep the water in front of it.
    float turn = atan(p.y, p.x) + 0.1 * sin(phase - 5.0 * r);
    float gap = 0.42;
    float bristle = line(abs(fract(turn / gap) - 0.5) * gap * r * size, 0.04 * size);
    float fan = fill((0.35 - r) * size) * fill((r - 1.0) * size) * step(abs(turn), 2.1);
    c = vec4(pale, 1.0) * 0.8 * bristle * fan;
    c = over(c, pale, 0.9 * line((r - 0.35) * size, 0.06 * size));
  } else if (kind == ${KIND_CHEMO}) {
    // A stalk with a knob: it holds a sensor out into the water.
    float stalk = line(p.y * size, 0.05 * size) * step(0.0, p.x) * fill((p.x - 0.8) * size);
    c = vec4(v_rgb, 1.0) * 0.8 * stalk;
    c = over(c, pale, 0.95 * fill((length(p - vec2(0.8, 0.0)) - 0.22) * size));
  } else if (kind == ${KIND_FIN}) {
    // A blade whose tip trails toward the tail.
    float d = triangle(p, vec2(-0.1, -0.4), vec2(-0.1, 0.5), vec2(1.0, 0.95)) * size;
    c = over(c, v_rgb, 0.45 * fill(d));
    c = over(c, pale, 0.9 * line(d + 0.04 * size, 0.04 * size));
  } else if (kind == ${KIND_EYE}) {
    // A dark disc in a pale ring.
    c = over(c, vec3(0.9, 0.95, 1.0), 0.95 * fill((r - 1.0) * size));
    c = over(c, vec3(0.02, 0.04, 0.07), 0.95 * fill((r - 0.62) * size));
  }
  o_color = c;
}
`;
