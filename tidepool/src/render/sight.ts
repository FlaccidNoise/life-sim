// What the possessed body sees: the cones of its eyes, and a circle round it that it feels. In Play
// the renderer dims the world outside them. `SIGHT` in shaders.ts runs the same test as `seen`.

import {
  C_LENGTH,
  C_SLOT,
  C_X,
  C_Y,
  CREATURE_STRIDE,
  NO_SLOT,
  type Cone,
  type FrameView,
} from '../protocol';

export const NEAR_LENGTHS = 1.5; // a body feels this many of its own lengths around it

const DIM = 0.25; // what `seen` gives out of sight
const EDGE = 2; // world units from in sight to out of sight

export interface Sight {
  x: number;
  y: number;
  near: number; // the radius of the near circle
  cones: Cone[];
}

/**
 * The sight of the possessed body of the frame. Null in Watch: everything is seen. Null also while
 * the frame does not hold the body, which is outside the view.
 */
export function sightOf(frame: FrameView): Sight | null {
  if (frame.possessedSlot === NO_SLOT) return null;
  for (let i = 0; i < frame.creatureCount; i++) {
    const r = frame.creatureBase + i * CREATURE_STRIDE;
    if (frame.u32[r + C_SLOT] !== frame.possessedSlot) continue;
    return {
      x: frame.f32[r + C_X] ?? 0,
      y: frame.f32[r + C_Y] ?? 0,
      near: NEAR_LENGTHS * (frame.f32[r + C_LENGTH] ?? 0),
      cones: frame.cones,
    };
  }
  return null;
}

/** 1 inside a cone or the near circle, 0.25 outside, with a soft edge 2 units wide. */
export function seen(sight: Sight | null, x: number, y: number): number {
  if (!sight) return 1;
  const px = x - sight.x;
  const py = y - sight.y;
  const r = Math.hypot(px, py);
  // The distance out of what is seen. It is 0 or less in sight.
  let d = r - sight.near;
  for (const cone of sight.cones) {
    const cos = Math.cos(cone.dir);
    const sin = Math.sin(cone.dir);
    const sinHalf = Math.sqrt(1 - cone.cosHalf * cone.cosHalf);
    const along = px * cos + py * sin;
    const across = Math.abs(px * sin - py * cos);
    // The distance out of the side of the cone.
    let edge = across * cone.cosHalf - along * sinHalf;
    // Behind the eye, the nearest point of the cone is its tip.
    if (edge > 0 && along * cone.cosHalf + across * sinHalf < 0) edge = r;
    d = Math.min(d, Math.max(edge, r - cone.range));
  }
  const t = Math.min(Math.max(d / EDGE, 0), 1);
  return 1 - (1 - DIM) * t * t * (3 - 2 * t);
}
