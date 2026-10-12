import { expect, test } from 'vitest';
import {
  C_HEADING,
  C_LENGTH,
  C_PARTS,
  C_WIDTH,
  C_X,
  C_Y,
  CREATURE_STRIDE,
  FRAME_HEADER_WORDS,
  KIND_EYE,
  KIND_FLAGELLUM,
  viewFrame,
  type FrameView,
} from '../src/protocol';
import { PART_INSTANCE_FLOATS, PART_LOD_PX, anchorPoint, buildParts } from '../src/render/parts';

const BODY = { x: 100, y: 50, length: 12, width: 6 };

// A part word, as `write_frame` packs it. The extra is 0.
const word = (kind: number, anchor: number, size: number): number =>
  kind | (Math.round(anchor * 255) << 8) | (Math.round(size * 255) << 16);

/** A frame that holds one body, with the given part words. */
function frameOf(heading: number, words: number[]): FrameView {
  const buffer = new ArrayBuffer(4 * (FRAME_HEADER_WORDS + CREATURE_STRIDE));
  const u32 = new Uint32Array(buffer);
  const f32 = new Float32Array(buffer);
  u32[1] = 1; // the creature count
  f32[FRAME_HEADER_WORDS + C_X] = BODY.x;
  f32[FRAME_HEADER_WORDS + C_Y] = BODY.y;
  f32[FRAME_HEADER_WORDS + C_HEADING] = heading;
  f32[FRAME_HEADER_WORDS + C_LENGTH] = BODY.length;
  f32[FRAME_HEADER_WORDS + C_WIDTH] = BODY.width;
  u32.set(words, FRAME_HEADER_WORDS + C_PARTS);
  return viewFrame(buffer);
}

/** The instances of a frame at 10 pixels per world unit, as rows of PART_INSTANCE_FLOATS. */
function instancesOf(frame: FrameView, pxPerUnit = 10): number[][] {
  const out = new Float32Array(64 * PART_INSTANCE_FLOATS);
  const count = buildParts(frame, pxPerUnit, 0, out);
  return Array.from({ length: count }, (_, i) =>
    Array.from(out.subarray(i * PART_INSTANCE_FLOATS, (i + 1) * PART_INSTANCE_FLOATS)),
  );
}

// The place of an instance from the body centre.
const offset = (instance: number[]): { dx: number; dy: number } => ({
  dx: (instance[0] ?? NaN) - BODY.x,
  dy: (instance[1] ?? NaN) - BODY.y,
});

test('a midline part makes one instance and any other part makes two', () => {
  const rows = instancesOf(frameOf(0, [word(KIND_FLAGELLUM, 1, 0.6), word(KIND_EYE, 0.2, 0.2)]));
  expect(rows.length).toBe(3);
  expect(rows.map((row) => Math.abs(row[4] ?? 0))).toEqual([KIND_FLAGELLUM, KIND_EYE, KIND_EYE]);
  // The flagellum leaves the tail and points back.
  expect(offset(rows[0] ?? []).dx).toBeCloseTo(-6, 4);
  expect(offset(rows[0] ?? []).dy).toBeCloseTo(0, 4);
  expect(Math.cos(rows[0]?.[2] ?? 0)).toBeCloseTo(-1, 4);
});

test('a pair sits mirrored across the heading', () => {
  const [a, b] = instancesOf(frameOf(0, [word(KIND_EYE, 0.2, 0.2)])).map(offset);
  if (!a || !b) throw new Error('an eye off the midline made no pair');
  expect(a.dx).toBeGreaterThan(0);
  expect(a.dy).not.toBeCloseTo(0, 2);
  expect(b.dx).toBeCloseTo(a.dx, 4);
  expect(b.dy).toBeCloseTo(-a.dy, 4);

  // A quarter turn of the body turns both offsets a quarter turn.
  const [c, d] = instancesOf(frameOf(Math.PI / 2, [word(KIND_EYE, 0.2, 0.2)])).map(offset);
  if (!c || !d) throw new Error('an eye off the midline made no pair');
  expect(c.dx).toBeCloseTo(-a.dy, 4);
  expect(c.dy).toBeCloseTo(a.dx, 4);
  expect(d.dx).toBeCloseTo(-b.dy, 4);
  expect(d.dy).toBeCloseTo(b.dx, 4);
});

test('a small body on screen draws only its flagella', () => {
  const small = (PART_LOD_PX - 1) / BODY.length;
  const frame = frameOf(0, [word(KIND_FLAGELLUM, 1, 0.6), word(KIND_EYE, 0.2, 0.2)]);
  const rows = instancesOf(frame, small);
  expect(rows.length).toBe(1);
  expect(rows[0]?.[4]).toBe(KIND_FLAGELLUM);
  expect(instancesOf(frame, PART_LOD_PX / BODY.length).length).toBe(3);
  // A flagellum off the midline is still a pair.
  expect(instancesOf(frameOf(0, [word(KIND_FLAGELLUM, 0.8, 0.6)]), small).length).toBe(2);
});

test('an empty part word draws nothing', () => {
  expect(instancesOf(frameOf(0, [])).length).toBe(0);
  // A place with no part between two parts is passed over.
  expect(instancesOf(frameOf(0, [word(KIND_FLAGELLUM, 1, 0.6), 0, 0])).length).toBe(1);
});

test('anchor 0 is the nose and anchor 1 is the tail', () => {
  expect(anchorPoint(0, 12, 6, 1).x).toBeCloseTo(6, 5);
  expect(anchorPoint(1, 12, 6, 1).x).toBeCloseTo(-6, 5);
  expect(anchorPoint(0.5, 12, 6, -1).y).toBeCloseTo(-3, 5);
});
