import { expect, test } from 'vitest';
import {
  C_LENGTH,
  C_SLOT,
  C_X,
  C_Y,
  CREATURE_STRIDE,
  FRAME_HEADER_WORDS,
  NO_SLOT,
  viewFrame,
  type FrameView,
} from '../src/protocol';
import { NEAR_LENGTHS, seen, sightOf } from '../src/render/sight';

/** A frame that holds one body in slot 7, with the given possessed slot and header cones. */
function frameOf(possessedSlot: number, cones: number[][]): FrameView {
  const buffer = new ArrayBuffer(4 * (FRAME_HEADER_WORDS + CREATURE_STRIDE));
  const u32 = new Uint32Array(buffer);
  const f32 = new Float32Array(buffer);
  u32[1] = 1; // the creature count
  u32[5] = possessedSlot;
  u32[9] = cones.length;
  f32.set(cones.flat(), 10);
  f32[FRAME_HEADER_WORDS + C_X] = 100;
  f32[FRAME_HEADER_WORDS + C_Y] = 50;
  f32[FRAME_HEADER_WORDS + C_LENGTH] = 12;
  u32[FRAME_HEADER_WORDS + C_SLOT] = 7;
  return viewFrame(buffer);
}

test('watch mode sees everything', () => {
  expect(seen(null, 5, 5)).toBe(1);
});

test('a point in a cone is seen and a point behind is dim', () => {
  const s = { x: 0, y: 0, near: 6, cones: [{ dir: 0, cosHalf: Math.cos(0.6), range: 40 }] };
  expect(seen(s, 30, 0)).toBe(1);
  expect(seen(s, -30, 0)).toBe(0.25);
  expect(seen(s, 50, 0)).toBe(0.25);
  expect(seen(s, 3, 3)).toBe(1); // the near circle
});

test('the edge of a cone is soft', () => {
  const s = { x: 0, y: 0, near: 6, cones: [{ dir: 0, cosHalf: Math.cos(0.6), range: 40 }] };
  // A point 1 unit past the range.
  expect(seen(s, 41, 0)).toBeGreaterThan(0.25);
  expect(seen(s, 41, 0)).toBeLessThan(1);
  // A point 1 unit off the side of the cone, and a point 1 unit past the near circle.
  const side = { x: 20 * Math.cos(0.6) - Math.sin(0.6), y: 20 * Math.sin(0.6) + Math.cos(0.6) };
  expect(seen(s, side.x, -side.y)).toBeGreaterThan(0.25);
  expect(seen(s, side.x, -side.y)).toBeLessThan(1);
  expect(seen(s, -7, 0)).toBeGreaterThan(0.25);
  expect(seen(s, -7, 0)).toBeLessThan(1);
  // The edge is 2 units wide, and it is outside the cone.
  expect(seen(s, 40, 0)).toBe(1);
  expect(seen(s, 42, 0)).toBe(0.25);
});

test('sightOf reads the cones of the header and is null with nothing possessed', () => {
  expect(sightOf(frameOf(NO_SLOT, []))).toBeNull();
  const sight = sightOf(
    frameOf(7, [
      [1.5, 0.75, 40],
      [0.5, 0.75, 40],
    ]),
  );
  expect(sight).toEqual({
    x: 100,
    y: 50,
    near: NEAR_LENGTHS * 12,
    cones: [
      { dir: 1.5, cosHalf: 0.75, range: 40 },
      { dir: 0.5, cosHalf: 0.75, range: 40 },
    ],
  });
  // A body with no eye sees its near circle.
  expect(sightOf(frameOf(7, []))?.cones).toEqual([]);
  // The frame does not hold the possessed body: it is outside the view.
  expect(sightOf(frameOf(3, []))).toBeNull();
});
