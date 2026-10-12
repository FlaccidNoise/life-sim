// The instances of the part program: one for each drawn part of each body of a frame. Cilia are not
// here. The creature shader draws them round the membrane.

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
} from '../protocol';

export const PART_INSTANCE_FLOATS = 8; // x, y, angle, size, kind, hue, energy01, phase
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

// Each slot's swim: where `buildParts` last placed it, and the phase of its flagella. The phase
// moves with the distance swum, so a flagellum waves faster as its body moves faster.
const seenX = new Float32Array(MAX_CREATURES);
const seenY = new Float32Array(MAX_CREATURES);
const swum = new Float32Array(MAX_CREATURES);

/** Where a part sits in the body frame: +x is forward. `side` is 1 or -1. */
export function anchorPoint(
  anchor: number,
  length: number,
  width: number,
  side: 1 | -1,
): { x: number; y: number; angle: number } {
  const t = anchor * Math.PI;
  const cos = Math.cos(t);
  const sin = side * Math.sin(t);
  // The outline is an ellipse. Its outward normal at this point is along (width cos, length sin).
  return {
    x: (cos * length) / 2,
    y: (sin * width) / 2,
    angle: Math.atan2(sin * length, cos * width),
  };
}

/**
 * Writes one instance for each drawn part of each creature of `cur` into `out`. A midline part makes
 * one instance and any other part makes two. Returns the number of instances.
 *
 * The angle of an instance is the way out of the body, in world radians. Its size is in world units.
 * Its kind is negative for the left part of a pair: the shader mirrors that one.
 */
export function buildParts(
  cur: FrameView,
  pxPerUnit: number,
  timeSeconds: number,
  out: Float32Array,
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
    const scale = Math.sqrt(length * width);
    for (let k = 0; k < PART_WORDS; k++) {
      const word = u32[r + C_PARTS + k] ?? 0;
      // The kind is the low byte of a part word. A word that draws nothing is not unpacked.
      const kind = word & 0xff;
      const reach = near || kind === KIND_FLAGELLUM ? REACH[kind] : undefined;
      const part = reach && unpackPart(word);
      if (!part || !reach) continue;
      for (const side of part.anchor > 0 && part.anchor < 1 ? PAIR : MIDLINE) {
        const at = anchorPoint(part.anchor, length, width, side);
        const o = n++ * PART_INSTANCE_FLOATS;
        out[o] = x + at.x * cos - at.y * sin;
        out[o + 1] = y + at.x * sin + at.y * cos;
        out[o + 2] = heading + at.angle;
        out[o + 3] = (reach[0] + reach[1] * part.size) * scale;
        out[o + 4] = side * part.kind;
        out[o + 5] = hue;
        out[o + 6] = energy;
        out[o + 7] = part.kind === KIND_FLAGELLUM ? (swum[slot] ?? 0) : ripple;
      }
    }
  }
  return n;
}
