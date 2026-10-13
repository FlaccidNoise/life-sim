// The instances of the part program: one for each drawn part of each body of a frame. Cilia are not
// here. The creature shader draws them round the membrane. Also the outline of a body in the looks
// of `?look`: its taper and its swells, from the parts it carries.

import {
  C_ENERGY,
  C_HEADING,
  C_HUE,
  C_LENGTH,
  C_PARTS,
  C_SLOT,
  C_WIDTH,
  C_X,
  C_Y,
  CREATURE_STRIDE,
  KIND_CHEMO,
  KIND_EYE,
  KIND_FILTER,
  KIND_FIN,
  KIND_FLAGELLUM,
  PART_WORDS,
  unpackPart,
  type FrameView,
  type Part,
} from '../protocol';

/**
 * How the page draws a body. 0 is the draw of M2. The owner picks from the others
 * (docs/findings/m3-shapes.md): 1 tapers the outline, 2 also draws each part kind as its own
 * silhouette at twice the size, and 3 also swells the outline at each mouth. 4 is look 3 with each
 * part at the size of today, and with each part that is inside a swell on its edge.
 */
export type Look = 0 | 1 | 2 | 3 | 4;

/** The look that `?look=` names. Anything but 1, 2, 3, or 4 is the draw of M2. */
export const lookOf = (text: string | null): Look =>
  text === '1' ? 1 : text === '2' ? 2 : text === '3' ? 3 : text === '4' ? 4 : 0;

// x, y, angle, size, kind, hue, energy01, phase, and the x and y of the centre of the body
export const PART_INSTANCE_FLOATS = 10;
export const PART_LOD_PX = 14; // a body shorter than this on screen draws only its flagella

const TAU = 2 * Math.PI;
const MAX_CREATURES = 4096; // the creature pool of the core
const WAVE_PER_LENGTH = 4; // a flagellum's wave moves this many radians for each body length swum
const RIPPLE = 5; // radians per second of the parts that move while the body is still

// How far each drawn kind reaches from its anchor, in body scales: at size 0, and the gain for each
// unit of size. A body scale is the square root of the body's area.
const REACH: Partial<Record<number, readonly [number, number]>> = {
  [KIND_FLAGELLUM]: [0, 1.9],
  [KIND_FILTER]: [0.08, 0.2],
  [KIND_CHEMO]: [0.1, 0.3],
  [KIND_FIN]: [0.1, 0.4],
  [KIND_EYE]: [0.05, 0.12],
};
const MIDLINE = [1] as const;
const PAIR = [1, -1] as const;

// The numbers of the looks.
const TAPER_FULL = 1 / 4; // one end this share ahead of the other narrows the other all the way
const NARROWEST = 0.35; // the width of the narrow end of a full taper, as a share of the width
const LOOK_2_SIZE = 2; // in looks 2 and 3, a part is this many times its size of today
const MOUTH_SWELL = 0.5; // the outline is wider at a mouth by this share for each unit of its size
// The creature shader takes this many swells. A body with more mouths swells at its first ones.
export const MAX_SWELLS = 4;
// In look 4 it takes this many, as one vector. A body with mouths at more places swells at its
// first ones.
const LOOK_4_SWELLS = 2;
// The outline of a body of look 4: the uid, the length, and the width that it was made for, its
// taper, then the x and the radius of each swell. A radius of 0 is no swell.
export const OUTLINE_TAPER = 3;
export const OUTLINE_SWELLS = 4;
export const OUTLINE_FLOATS = OUTLINE_SWELLS + 2 * LOOK_4_SWELLS;

// The founder of crates/sim/src/genome.rs: FOUNDER_PARTS, then its eye at the default `founder_eye`.
const FOUNDER = [
  { anchor: 1, size: 0.6 },
  { anchor: 0.5, size: 0.4 },
  { anchor: 0, size: 0.6 },
  { anchor: 0.15, size: 0.5 },
  { anchor: 0.2, size: 0.2 },
] as const;

// The part size ahead of the middle of a body and behind it. A part counts for more the nearer it
// is to an end.
function carried(parts: readonly Pick<Part, 'anchor' | 'size'>[]): { nose: number; tail: number } {
  let nose = 0;
  let tail = 0;
  for (const { anchor, size } of parts) {
    const lever = size * Math.cos(anchor * Math.PI);
    if (lever > 0) nose += lever;
    else tail -= lever;
  }
  return { nose, tail };
}
const FOUNDER_CARRIES = carried(FOUNDER);
const NO_OUTLINES = new Float64Array(0);

// Each slot's swim: where `buildParts` last placed it, and the phase of its flagella. The phase
// moves with the distance swum, so a flagellum waves faster as its body moves faster.
const seenX = new Float32Array(MAX_CREATURES);
const seenY = new Float32Array(MAX_CREATURES);
const swum = new Float32Array(MAX_CREATURES);

/** The parts of the creature record at word `r`. */
export function partsOf(u32: Uint32Array, r: number): Part[] {
  const parts: Part[] = [];
  for (let k = 0; k < PART_WORDS; k++) {
    const part = unpackPart(u32[r + C_PARTS + k] ?? 0);
    if (part) parts.push(part);
  }
  return parts;
}

/**
 * How far the part size of a body leans to one end, from -1 to 1, against a founder at 0. Above 0
 * the nose carries more and the tail narrows. Below 0 the nose narrows. A body that carries less
 * than a founder tapers less.
 */
export function taperOf(parts: readonly Part[]): number {
  const { nose, tail } = carried(parts);
  // Each end counts against the other end of a founder, so the two ends of a founder are level.
  const front = nose * FOUNDER_CARRIES.tail;
  const back = tail * FOUNDER_CARRIES.nose;
  const level = 2 * FOUNDER_CARRIES.nose * FOUNDER_CARRIES.tail;
  const ahead = (front - back) / Math.max(front + back, level);
  return Math.max(-1, Math.min(1, ahead / TAPER_FULL));
}

/** The width of the nose and of the tail of a tapered outline, as shares of the body's width. */
export function endsOf(taper: number): [nose: number, tail: number] {
  const narrowed = (by: number): number => 1 - (1 - NARROWEST) * Math.max(by, 0);
  return [narrowed(-taper), narrowed(taper)];
}

/**
 * The swell of the outline at a mouth of look 3, in the body frame: a circle on the axis, wider
 * than the outline is there. A larger mouth swells more.
 */
export function swellAt(
  mouth: Part,
  length: number,
  width: number,
  taper: number,
): { x: number; r: number } {
  const [nose, tail] = endsOf(taper);
  // The centres of the round ends of the outline. The outline is every circle between them.
  const front = (length - nose * width) / 2;
  const back = (tail * width - length) / 2;
  const x = Math.max(back, Math.min(front, (Math.cos(mouth.anchor * Math.PI) * length) / 2));
  const share = tail + ((nose - tail) * (x - back)) / (front - back);
  return { x, r: ((share * width) / 2) * (1 + MOUTH_SWELL * mouth.size) };
}

/**
 * Writes the outline of look 4 of the body `uid`, which carries `parts`, into `out` at `o`, as
 * OUTLINE_FLOATS numbers. Mouths at one place on the axis share a swell, that of the largest.
 *
 * The parts of a body are those of its genome for all its life. So an outline that was made for
 * this body at this length and width is not made again. Made in each draw, the outlines of 389
 * bodies took 0.05 ms, beside the 0.17 ms of all the page's code in a draw of look 0.
 */
export function outlineOf(
  parts: readonly Part[],
  uid: number,
  length: number,
  width: number,
  out: Float64Array,
  o: number,
): void {
  if (out[o] === uid && out[o + 1] === length && out[o + 2] === width) return;
  const taper = taperOf(parts);
  out[o] = uid;
  out[o + 1] = length;
  out[o + 2] = width;
  out[o + OUTLINE_TAPER] = taper;
  const end = o + OUTLINE_FLOATS;
  out.fill(0, o + OUTLINE_SWELLS, end);
  for (const part of parts) {
    if (part.kind !== KIND_FILTER) continue;
    const { x, r } = swellAt(part, length, width, taper);
    // The swell at this place, or the first that is free.
    let at = o + OUTLINE_SWELLS;
    while (at < end && out[at + 1] !== 0 && out[at] !== x) at += 2;
    if (at === end) continue;
    out[at] = x;
    out[at + 1] = Math.max(out[at + 1] ?? 0, r);
  }
}

/**
 * Where a part sits in the body frame: +x is forward. `side` is 1 or -1. `taper` is that of
 * `taperOf`: 0 is the outline of today.
 */
export function anchorPoint(
  anchor: number,
  length: number,
  width: number,
  side: 1 | -1,
  taper = 0,
): { x: number; y: number; angle: number } {
  const t = anchor * Math.PI;
  const cos = Math.cos(t);
  const sin = side * Math.sin(t);
  // The outline is an ellipse whose width runs from that of the tail to that of the nose.
  const [nose, tail] = endsOf(taper);
  const slope = (nose - tail) / 2;
  const share = (nose + tail) / 2 + slope * cos;
  // Its outward normal at this point. With no taper that is along (width cos, length sin).
  return {
    x: (cos * length) / 2,
    y: (sin * share * width) / 2,
    angle: Math.atan2(sin * length, width * (cos * share - slope * sin * sin)),
  };
}

/**
 * Writes one instance for each drawn part of each creature of `cur` into `out`. A midline part makes
 * one instance and any other part makes two. Returns the number of instances.
 *
 * The angle of an instance is the way out of the body, in world radians. Its size is in world units.
 * Its kind is negative for the left part of a pair: the shader mirrors that one. It carries the
 * centre of its body: a part is in sight when its body is.
 *
 * From look 1 a part sits on the tapered outline. In looks 2 and 3 it is larger. In look 3 a mouth
 * sits on its swell. Look 4 takes the outline of each body that is not small on screen from
 * `outlines`, as `outlineOf` writes it, at OUTLINE_FLOATS times the slot of the body. Every part
 * inside a swell sits on its edge.
 */
export function buildParts(
  cur: FrameView,
  pxPerUnit: number,
  timeSeconds: number,
  out: Float32Array,
  look: Look = 0,
  outlines: Float64Array = NO_OUTLINES,
): number {
  const { f32, u32 } = cur;
  const ripple = (RIPPLE * timeSeconds) % TAU;
  let n = 0;
  for (let i = 0; i < cur.creatureCount; i++) {
    const r = cur.creatureBase + i * CREATURE_STRIDE;
    const length = f32[r + C_LENGTH] ?? 0;
    // A small body keeps its flagella: they are the cue that it swims.
    const near = length * pxPerUnit >= PART_LOD_PX;
    const x = f32[r + C_X] ?? 0;
    const y = f32[r + C_Y] ?? 0;
    const heading = f32[r + C_HEADING] ?? 0;
    const width = f32[r + C_WIDTH] ?? 0;
    const hue = f32[r + C_HUE] ?? 0;
    const energy = f32[r + C_ENERGY] ?? 0;
    const slot = u32[r + C_SLOT] ?? 0;

    const moved = Math.hypot(x - (seenX[slot] ?? x), y - (seenY[slot] ?? y));
    seenX[slot] = x;
    seenY[slot] = y;
    // A longer step is another creature in the slot, or one that came back into view.
    if (moved < length) {
      swum[slot] = ((swum[slot] ?? 0) + (WAVE_PER_LENGTH * moved) / length) % TAU;
    }

    const cos = Math.cos(heading);
    const sin = Math.sin(heading);
    const scale = Math.sqrt(length * width) * (look === 2 || look === 3 ? LOOK_2_SIZE : 1);
    // A body too small on screen for its parts keeps the outline of today.
    const shaped = look === 4 && near;
    const outline = slot * OUTLINE_FLOATS;
    const taper = shaped
      ? (outlines[outline + OUTLINE_TAPER] ?? 0)
      : look >= 1 && look < 4 && near
        ? taperOf(partsOf(u32, r))
        : 0;
    for (let k = 0; k < PART_WORDS; k++) {
      const word = u32[r + C_PARTS + k] ?? 0;
      // The kind is the low byte of a part word. A word that draws nothing is not unpacked.
      const kind = word & 0xff;
      const reach = near || kind === KIND_FLAGELLUM ? REACH[kind] : undefined;
      const part = reach && unpackPart(word);
      if (!part || !reach) continue;
      for (const side of part.anchor > 0 && part.anchor < 1 ? PAIR : MIDLINE) {
        const at = anchorPoint(part.anchor, length, width, side, taper);
        if (look === 3 && part.kind === KIND_FILTER) {
          const swell = swellAt(part, length, width, taper);
          at.x = swell.x + swell.r * Math.cos(at.angle);
          at.y = swell.r * Math.sin(at.angle);
        }
        for (let swell = OUTLINE_SWELLS; shaped && swell < OUTLINE_FLOATS; swell += 2) {
          // A part inside a swell sits on its edge, and its way out is from the centre of the swell.
          const centre = outlines[outline + swell] ?? 0;
          const radius = outlines[outline + swell + 1] ?? 0;
          if (radius === 0) break;
          const dx = at.x - centre;
          const from = Math.sqrt(dx * dx + at.y * at.y);
          if (from === 0 || from >= radius) continue;
          at.angle = Math.atan2(at.y, dx);
          at.x = centre + (dx * radius) / from;
          at.y *= radius / from;
        }
        const o = n++ * PART_INSTANCE_FLOATS;
        out[o] = x + at.x * cos - at.y * sin;
        out[o + 1] = y + at.x * sin + at.y * cos;
        out[o + 2] = heading + at.angle;
        out[o + 3] = (reach[0] + reach[1] * part.size) * scale;
        out[o + 4] = side * part.kind;
        out[o + 5] = hue;
        out[o + 6] = energy;
        out[o + 7] = part.kind === KIND_FLAGELLUM ? (swum[slot] ?? 0) : ripple;
        out[o + 8] = x;
        out[o + 9] = y;
      }
    }
  }
  return n;
}
