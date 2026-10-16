// GLSL sources. Six programs: the depth gradient, the plants, the debris, the creatures, their parts,
// and the toxin clouds. Each entity is one instanced quad, and its fragment shader draws the shape.
// Colours are premultiplied.

import {
  KIND_CHEMO,
  KIND_EYE,
  KIND_FILTER,
  KIND_FIN,
  KIND_FLAGELLUM,
  KIND_JAW,
  KIND_SHELL,
  KIND_SPIKE,
  KIND_TOXIN,
  MAX_EYES,
} from '../protocol';

/** The radius of a piece of debris: `DEBRIS_RADIUS` in crates/sim/src/debris.rs. */
export const DEBRIS_RADIUS = 2;

// What the possessed body sees. The same test as `seen` in sight.ts: 1 in sight, 0.25 out of it.
const SIGHT = `
uniform vec4 u_sight; // the possessed body: x, y, the radius of its near circle, its cones. -1 cones: Watch
uniform vec4 u_cones[${MAX_EYES}]; // the direction as a unit vector, the cosine of the half angle, the range

float seen(vec2 at) {
  if (u_sight.w < 0.0) return 1.0;
  vec2 p = at - u_sight.xy;
  float r = length(p);
  // The distance out of what is seen. It is 0 or less in sight.
  float d = r - u_sight.z;
  for (int k = 0; k < int(u_sight.w); k++) {
    vec4 cone = u_cones[k];
    float sin_half = sqrt(1.0 - cone.z * cone.z);
    float along = dot(p, cone.xy);
    float across = abs(p.x * cone.y - p.y * cone.x);
    // The distance out of the side of the cone.
    float edge = across * cone.z - along * sin_half;
    // Behind the eye, the nearest point of the cone is its tip.
    if (edge > 0.0 && along * cone.z + across * sin_half < 0.0) edge = r;
    d = min(d, max(edge, r - cone.w));
  }
  return 1.0 - 0.75 * smoothstep(0.0, 2.0, d);
}
`;

// For the fragment shader of an entity. Out of sight it is a dim grey shape.
const DIM = `
flat in float v_seen; // \`seen\` of the centre of the entity

vec4 dim(vec4 c) {
  vec3 grey = vec3(dot(c.rgb, vec3(0.3, 0.6, 0.1)));
  return vec4(mix(grey, c.rgb, (v_seen - 0.25) / 0.75), c.a) * v_seen;
}
`;

export const BACKGROUND_VERT = `#version 300 es
layout(location = 0) in vec2 a_corner; // the unit quad, -1 to 1
uniform vec4 u_view; // camera x, camera y, clip units per world unit on x and on y
out vec2 v_world;

void main() {
  gl_Position = vec4(a_corner, 0.0, 1.0);
  v_world = u_view.xy + a_corner / u_view.zw;
}
`;

export const BACKGROUND_FRAG = `#version 300 es
precision highp float;
in vec2 v_world;
uniform float u_height; // of the world
out vec4 o_color;
${SIGHT}
void main() {
  // 0 at the top of the world, 1 at the bottom.
  float depth = clamp(v_world.y / u_height, 0.0, 1.0);
  vec3 rgb = mix(vec3(10.0, 42.0, 58.0), vec3(4.0, 18.0, 28.0), depth) / 255.0;
  // In Play the water in sight is a little lighter, so the cones show.
  float lit = u_sight.w < 0.0 ? 0.0 : (seen(v_world) - 0.25) / 0.75;
  o_color = vec4(rgb * (1.0 + 0.4 * lit), 1.0);
}
`;

export const PLANT_VERT = `#version 300 es
layout(location = 0) in vec2 a_corner;
layout(location = 1) in vec4 a_plant; // x, y, radius, reserve01
uniform vec4 u_view; // camera x, camera y, clip units per world unit on x and on y
uniform float u_px; // world units per device pixel
out vec2 v_uv;
out float v_reserve;
flat out float v_seen;
${SIGHT}
void main() {
  v_uv = a_corner;
  v_reserve = a_plant.w;
  v_seen = seen(a_plant.xy);
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
${DIM}
void main() {
  // A full plant is a bright blob. A grazed plant is thin and pale.
  float a = (1.0 - smoothstep(0.3, 1.0, length(v_uv))) * mix(0.2, 0.85, v_reserve);
  vec3 rgb = mix(vec3(0.5, 0.62, 0.5), vec3(0.3, 0.85, 0.35), v_reserve);
  o_color = dim(vec4(rgb * a, a));
}
`;

export const DEBRIS_VERT = `#version 300 es
layout(location = 0) in vec2 a_corner;
layout(location = 1) in vec3 a_debris; // x, y, energy01
uniform vec4 u_view;
uniform float u_px;
out vec2 v_uv;
flat out float v_energy;
flat out float v_turn; // the fleck of each piece lies at its own angle
flat out float v_seen;
${SIGHT}
void main() {
  v_uv = a_corner;
  v_energy = a_debris.z;
  v_turn = 6.2831853 * fract(dot(a_debris.xy, vec2(0.1031, 0.1173)));
  v_seen = seen(a_debris.xy);
  // A far piece stays a visible speck.
  vec2 world = a_debris.xy + a_corner * max(${DEBRIS_RADIUS}.0, 1.0 * u_px);
  gl_Position = vec4((world - u_view.xy) * u_view.zw, 0.0, 1.0);
}
`;

export const DEBRIS_FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;
flat in float v_energy;
flat in float v_turn;
out vec4 o_color;
${DIM}
void main() {
  // A small dull fleck, longer than it is wide. It fades as it decays.
  vec2 axis = vec2(cos(v_turn), sin(v_turn));
  vec2 q = vec2(dot(v_uv, axis), v_uv.x * axis.y - v_uv.y * axis.x) / vec2(0.8, 0.45);
  float a = (1.0 - smoothstep(0.5, 1.0, length(q))) * mix(0.1, 0.6, v_energy);
  o_color = dim(vec4(vec3(0.5, 0.44, 0.34) * a, a));
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
${DIM}
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

// The numbers that only a shader uses. Those that place a part or shape an outline are in parts.ts.
const NUMBERS = `
const float SWELL_JOIN = 0.6; // a swell runs into the outline over this many half widths
const float FAN_HALF = 0.9; // the half angle of the fan of a mouth, radians
const float FAN_FILL = 0.5; // how solid the fan is
const float FAN_LIP = 0.07; // the half thickness of the lip of the fan, in part sizes
const vec2 FORK_AT = vec2(0.45, 0.0); // where the stalk of a feeler forks, in part sizes
const vec2 FORK_TIP = vec2(0.95, 0.45); // the tip of a prong
const float FORK_THICK = 0.07; // the half thickness of the stalk and of a prong, in part sizes
const float FORK_KNOB = 0.17; // the radius of the knob on a tip, in part sizes
// Nothing of a body is drawn farther out of its outline than this many half widths: the glow of a
// bud stops there.
const float OUT_OF_REACH = 1.2;
// The rim of a young body born of a cross: a band inside the membrane, in the hue of the body on
// one side of its axis and in the hue of the other parent on the other side. The frame does not
// give that hue, so the band shows a hue half a turn round the hue wheel from the body's own.
const float MIXED_BAND_AT = 0.42; // the middle of the band, in half widths inside the edge
const float MIXED_BAND_HALF = 0.13; // its half thickness, in half widths
const float MIXED_BAND_ALPHA = 0.75;
const vec3 TOXIN_RGB = vec3(0.7, 0.42, 0.95); // a toxin gland and its cloud
const vec3 HURT_RGB = vec3(1.0, 0.3, 0.22); // the membrane of a hurt body, and the ring on the side hit
const float WAKE_LONG = 1.1; // the wake of a dash runs this many half widths behind the tail
`;

export const CREATURE_VERT = `#version 300 es
layout(location = 0) in vec2 a_corner;
layout(location = 1) in vec4 a_pose; // x, y, heading, hue
layout(location = 2) in vec4 a_body; // length, width, energy01, flags
layout(location = 3) in vec3 a_life; // the cilia size, the bud pulse from 0 to 1, 1 for the mark of a cross
layout(location = 4) in vec2 a_ends; // the widths of the nose and the tail, as shares of the width
flat out vec2 v_ends; // the radius of the round nose and of the round tail
// The two swells of the outline, as one vector: for each, its x on the axis and its radius. A radius
// of 0 is no swell. An array of swells cost a tenth of the draw time.
layout(location = 5) in vec4 a_swells;
flat out vec4 v_swells;
uniform vec4 u_view;
out vec2 v_p; // the body frame in world units: +x is forward
flat out vec3 v_rgb;
flat out vec4 v_body; // half length, half width, energy01, cilia size
flat out vec4 v_marks; // 1 for the player's lineage, 1 for the possessed creature, the bud pulse, 1 for a young cross
flat out vec3 v_rgb2; // the colour of the other side of the rim of a young cross
flat out vec2 v_hits; // 1 for a body hurt a short time ago, 1 for one that dashed or lunged
flat out float v_seen;
${TINT}${SIGHT}
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
  v_marks = vec4(flags & 1, (flags >> 1) & 1, a_life.y, a_life.z);
  v_hits = vec2((flags >> 8) & 1, (flags >> 9) & 1); // FLAG_HURT and FLAG_DASH
  v_rgb2 = a_life.z > 0.0 ? tint(fract(a_pose.w + 0.5), a_body.z) : vec3(0.0);
  v_seen = seen(a_pose.xy);
  v_ends = a_ends * 0.5 * wid;
  v_swells = a_swells;
}
`;

export const CREATURE_FRAG = `#version 300 es
precision highp float;
in vec2 v_p;
flat in vec3 v_rgb;
flat in vec4 v_body;
flat in vec4 v_marks;
flat in vec3 v_rgb2;
flat in vec2 v_ends;
flat in vec4 v_swells;
flat in vec2 v_hits;
uniform float u_beat; // the phase of the cilia beat, radians
uniform float u_bud_at; // the share of a full store at which a body buds
uniform float u_hurt_side; // of the last hit on the possessed body, -1 to 1: the sign is the side of v_p.y
out vec4 o_color;
${SHAPES}${NUMBERS}
// The distance \`d\` to an outline, with a swell joined to it smoothly: a circle on the axis, as its
// x and its radius.
float swollen(float d, vec2 swell, float join) {
  if (swell.y <= 0.0) return d;
  float to = length(v_p - vec2(swell.x, 0.0)) - swell.y;
  float close = max(join - abs(d - to), 0.0);
  return min(d, to) - 0.25 * close * close / join;
}
void main() {
  float hl = v_body.x;
  float hw = v_body.y;
  // The outline: every point within a radius of a segment on the x axis. The radius runs from that
  // of the round tail to that of the round nose.
  float run = 2.0 * hl - v_ends.x - v_ends.y; // between the centres of the two round ends
  float lean = (v_ends.y - v_ends.x) / run; // the sine of the angle of a side to the axis
  float level = sqrt(1.0 - lean * lean);
  float side = level * run; // the length of the straight of a side
  // From the centre of the round tail: across the body, and forward.
  vec2 q = vec2(abs(v_p.y), v_p.x + hl - v_ends.y);
  float along = dot(q, vec2(-lean, level)); // along a side, from where the round tail stops
  float out_of = dot(q, vec2(level, lean)); // out of the body, square to a side
  // The radius of the round end that this point is at, or 0 beside a side.
  float bend = along < 0.0 ? v_ends.y : along > side ? v_ends.x : 0.0;
  // At a round end, from its centre: past the end of the side, and out of the body.
  vec2 cap = along < 0.0 ? vec2(-along, out_of) : vec2(along - side, out_of - lean * run);
  float d = bend > 0.0 ? length(cap) - bend : out_of - v_ends.y;
  // How far this point is round the membrane from the middle of a side.
  float round_membrane = bend > 0.0
    ? 0.5 * side + bend * atan(cap.x, cap.y + 1e-6)
    : abs(along - 0.5 * side);
  d = swollen(swollen(d, v_swells.xy, SWELL_JOIN * hw), v_swells.zw, SWELL_JOIN * hw);
  // A point out of reach of the body draws nothing.
  if (d > OUT_OF_REACH * hw + 2.0 * u_px) discard;
  vec3 pale = mix(v_rgb, vec3(1.0), 0.4);

  // The cilia: hairs that stand on the membrane, longer and thicker with size. The beat runs
  // round the membrane from the middle of each side.
  float cilia = v_body.w;
  float reach = (0.15 + 0.45 * cilia) * hw;
  float gap = 0.45 * hw;
  float sway = 0.3 * gap * sin(u_beat - 1.5 * round_membrane / hw) * clamp(d / reach, 0.0, 1.0);
  float hair = abs(fract((round_membrane + sway) / gap) - 0.5) * gap;
  // Round an end the hairs fan out, and each keeps its thickness.
  hair *= bend > 0.0 ? 1.0 + d / bend : 1.0;
  float fringe = line(hair, (0.03 + 0.07 * cilia) * hw) * fill(-d) * fill(d - reach);
  vec4 c = vec4(pale, 1.0) * 0.7 * fringe * step(0.001, cilia);
  // A body that just dashed or lunged: two lines that open out behind its tail, and fade.
  if (v_hits.y > 0.0) {
    float back = -v_p.x - hl + 0.5 * v_ends.y; // behind a point near the tail
    float wake = line(abs(v_p.y) - 0.4 * v_ends.y - 0.6 * back, 0.05 * hw);
    float fade = 1.0 - smoothstep(0.0, WAKE_LONG * hw, back);
    c = over(c, pale, 0.6 * wake * fade * step(0.0, back) * fill(-d));
  }

  c = over(c, v_rgb, 0.35 * fill(d));
  // The nucleus, toward the front.
  c = over(c, v_rgb * 0.3, 0.65 * fill(length(v_p - vec2(0.3 * hl, 0.0)) - 0.45 * hw));
  // A young body born of a cross: a rim of two hues, one on each side of the axis.
  if (v_marks.w > 0.0) {
    float band = line(d + MIXED_BAND_AT * hw, MIXED_BAND_HALF * hw);
    c = over(c, v_p.y < 0.0 ? v_rgb2 : v_rgb, MIXED_BAND_ALPHA * band);
  }
  // The membrane, just inside the edge.
  float membrane = 0.12 * hw;
  c = over(c, v_hits.x > 0.0 ? HURT_RGB : pale, 0.9 * line(d + membrane, membrane));
  // A body that just budded: one bright pulse, in the body and round it.
  float glow = 0.45 * fill(d) + 0.35 * (1.0 - smoothstep(0.0, 1.2 * hw, max(d, 0.0)));
  c = over(c, vec3(1.0), v_marks.z * glow);
  // The player's lineage: a pale outline.
  c = over(c, vec3(0.92, 0.97, 1.0), 0.85 * v_marks.x * line(d - 0.3 * hw, 0.05 * hw));
  // The possessed creature: the energy ring. The arc starts at the nose and sweeps clockwise.
  float turn = fract(atan(v_p.y, v_p.x) / 6.2831853);
  float lit = mix(0.15, 0.95, step(turn, v_body.z));
  vec3 ring = vec3(1.0, 0.95, 0.7);
  // A hurt possessed body: the ring flashes on the side that was hit. A hit with no side, dead
  // ahead or behind, flashes all of it.
  if (v_hits.x > 0.0 && v_p.y * u_hurt_side >= 0.0) {
    ring = HURT_RGB;
    lit = 0.95;
  }
  c = over(c, ring, lit * v_marks.y * line(d - 0.7 * hw, 0.1 * hw));
  // The notch: a tick across the ring at the place the arc must reach for a bud.
  vec2 at = vec2(cos(6.2831853 * u_bud_at), sin(6.2831853 * u_bud_at));
  float tick = line(at.x * v_p.y - at.y * v_p.x, 0.07 * hw) * step(0.0, dot(at, v_p));
  c = over(c, vec3(1.0), v_marks.y * tick * fill(abs(d - 0.7 * hw) - 0.3 * hw));
  o_color = dim(c);
}
`;

export const PART_VERT = `#version 300 es
layout(location = 0) in vec2 a_corner;
layout(location = 1) in vec4 a_place; // x, y, the way out of the body in radians, size
layout(location = 2) in vec4 a_look; // kind (negative: mirrored), hue, energy01, phase
layout(location = 3) in vec2 a_body; // the centre of the body of the part
uniform vec4 u_view;
uniform float u_px; // world units per device pixel
out vec2 v_p; // the part frame in sizes: the anchor is at 0, +x is out of the body, +y is back
flat out vec3 v_rgb;
flat out vec3 v_part; // kind, size in world units, phase
flat out float v_seen;
${TINT}${SIGHT}
void main() {
  float kind = abs(a_look.x);
  // A flagellum is long and thin. Every other kind fits a square round its anchor.
  bool lash = kind == ${KIND_FLAGELLUM}.0;
  // A far flagellum is still a line one pixel wide, and its quad keeps room for that line.
  float room = 0.3 + 1.5 * u_px / max(a_place.w, u_px);
  vec2 lo = lash ? vec2(-0.05, -room) : vec2(-1.2);
  vec2 hi = lash ? vec2(1.05, room) : vec2(1.2);
  v_p = mix(lo, hi, 0.5 + 0.5 * a_corner);
  vec2 axis = vec2(cos(a_place.z), sin(a_place.z));
  // The left part of a pair is the mirror of the right one.
  vec2 side = sign(a_look.x) * vec2(-axis.y, axis.x);
  vec2 world = a_place.xy + a_place.w * (v_p.x * axis + v_p.y * side);
  gl_Position = vec4((world - u_view.xy) * u_view.zw, 0.0, 1.0);
  v_rgb = tint(a_look.y, a_look.z);
  v_part = vec3(kind, a_place.w, a_look.w);
  // A part is in sight when its body is.
  v_seen = seen(a_body);
}
`;

export const PART_FRAG = `#version 300 es
precision highp float;
in vec2 v_p;
flat in vec3 v_rgb;
flat in vec3 v_part;
out vec4 o_color;
${SHAPES}${NUMBERS}
// The distance to the segment from a to b.
float segment(vec2 p, vec2 a, vec2 b) {
  vec2 ab = b - a;
  return length(p - a - ab * clamp(dot(p - a, ab) / dot(ab, ab), 0.0, 1.0));
}

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
    float turn = atan(p.y, p.x) + 0.1 * sin(phase - 5.0 * r);
    float gap = 0.42;
    float bristle = line(abs(fract(turn / gap) - 0.5) * gap * r * size, 0.04 * size);
    // A mouth: a solid fan that opens out of the body, with bristles in it and a bright lip.
    float flank = r * sin(clamp(abs(turn) - FAN_HALF, -1.5708, 1.5708));
    float fan = fill(max(r - 1.0, flank) * size);
    c = over(c, v_rgb, FAN_FILL * fan);
    c = over(c, pale, 0.8 * bristle * fan);
    c = over(c, pale, 0.9 * line((r - 1.0 + FAN_LIP) * size, FAN_LIP * size) * fill(flank * size));
  } else if (kind == ${KIND_CHEMO}) {
    // A feeler: a stalk that forks, with a knob on each tip.
    vec2 q = vec2(p.x, abs(p.y));
    float d = min(segment(q, vec2(0.0), FORK_AT), segment(q, FORK_AT, FORK_TIP));
    c = over(c, v_rgb, 0.9 * fill((d - FORK_THICK) * size));
    c = over(c, pale, 0.95 * fill((length(q - FORK_TIP) - FORK_KNOB) * size));
  } else if (kind == ${KIND_FIN}) {
    // A blade whose tip trails toward the tail.
    float d = triangle(p, vec2(-0.1, -0.4), vec2(-0.1, 0.5), vec2(1.0, 0.95)) * size;
    c = over(c, v_rgb, 0.45 * fill(d));
    c = over(c, pale, 0.9 * line(d + 0.04 * size, 0.04 * size));
  } else if (kind == ${KIND_EYE}) {
    // A dark disc in a pale ring.
    c = over(c, vec3(0.9, 0.95, 1.0), 0.95 * fill((r - 1.0) * size));
    c = over(c, vec3(0.02, 0.04, 0.07), 0.95 * fill((r - 0.62) * size));
  } else if (kind == ${KIND_JAW}) {
    // Two mandibles that curve in. Closed, their tips meet on the axis.
    vec2 q = vec2(p.x, abs(p.y));
    vec2 mid = mix(vec2(0.5, 0.62), vec2(0.5, 0.42), phase);
    vec2 tip = mix(vec2(1.0, 0.32), vec2(0.88, 0.03), phase);
    float d = min(segment(q, vec2(-0.1, 0.32), mid), segment(q, mid, tip));
    c = over(c, mix(pale, vec3(1.0, 0.97, 0.9), 0.5), 0.95 * fill((d - mix(0.13, 0.05, clamp(q.x, 0.0, 1.0))) * size));
  } else if (kind == ${KIND_SPIKE}) {
    // One thin spine out of the outline.
    float d = triangle(p, vec2(-0.1, -0.09), vec2(-0.1, 0.09), vec2(1.0, 0.0)) * size;
    c = over(c, mix(pale, vec3(1.0), 0.3), 0.95 * fill(d));
  } else if (kind == ${KIND_SHELL}) {
    // A plate over the membrane: a thick bright arc along the outline.
    float bend = 1.6;
    vec2 q = p + vec2(bend + 0.1, 0.0);
    float edge = abs(atan(q.y, q.x)) * bend - 1.0;
    float band = fill((abs(length(q) - bend) - 0.15) * size) * fill(edge * size);
    c = over(c, mix(pale, vec3(1.0), 0.5), 0.95 * band);
  } else if (kind == ${KIND_TOXIN}) {
    // A bulb, with dark dots in it.
    vec2 q = p - vec2(0.15, 0.0);
    c = over(c, TOXIN_RGB, 0.9 * fill((length(q) - 0.85) * size));
    float dots = min(length(q - vec2(0.3, 0.25)), length(q - vec2(-0.15, -0.3)));
    dots = min(dots, length(q - vec2(0.25, -0.3)));
    c = over(c, vec3(0.08, 0.02, 0.12), 0.9 * fill((dots - 0.15) * size));
  }
  o_color = dim(c);
}
`;

export const CLOUD_VERT = `#version 300 es
layout(location = 0) in vec2 a_corner;
layout(location = 1) in vec4 a_cloud; // x, y, radius, left01
uniform vec4 u_view;
out vec2 v_uv;
flat out vec2 v_cloud; // radius, left01
flat out float v_seen;
${SIGHT}
void main() {
  v_uv = a_corner;
  v_cloud = a_cloud.zw;
  v_seen = seen(a_cloud.xy);
  vec2 world = a_cloud.xy + a_corner * a_cloud.z;
  gl_Position = vec4((world - u_view.xy) * u_view.zw, 0.0, 1.0);
}
`;

export const CLOUD_FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;
flat in vec2 v_cloud;
out vec4 o_color;
${SHAPES}${NUMBERS}
void main() {
  // A translucent disc with a soft rim. It fades as its time runs out.
  float d = (length(v_uv) - 1.0) * v_cloud.x;
  float a = v_cloud.y * (0.16 * fill(d) + 0.2 * line(d + 0.6, 0.4));
  o_color = dim(vec4(TOXIN_RGB * a, a));
}
`;
