import { readFileSync } from 'node:fs';
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
  KIND_CHEMO,
  KIND_CILIA,
  KIND_EYE,
  KIND_FILTER,
  KIND_FIN,
  KIND_FLAGELLUM,
  viewFrame,
  type FrameView,
  type Part,
} from '../src/protocol';
import {
  OUTLINE_FLOATS,
  OUTLINE_SWELLS,
  OUTLINE_TAPER,
  PART_INSTANCE_FLOATS,
  PART_LOD_PX,
  anchorPoint,
  buildParts,
  endsOf,
  lookOf,
  outlineOf,
  partsOf,
  swellAt,
  taperOf,
  type Look,
} from '../src/render/parts';

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
function instancesOf(frame: FrameView, pxPerUnit = 10, look: Look = 0): number[][] {
  const out = new Float32Array(64 * PART_INSTANCE_FLOATS);
  // Look 4 takes the outline of the body of each slot. The body of `frameOf` is in slot 0.
  const outline = new Float64Array(OUTLINE_FLOATS);
  outlineOf(partsOf(frame.u32, frame.creatureBase), 1, BODY.length, BODY.width, outline, 0);
  const count = buildParts(frame, pxPerUnit, 0, out, look, outline);
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

test('a part carries the centre of its body', () => {
  const rows = instancesOf(frameOf(0.7, [word(KIND_FLAGELLUM, 1, 0.6), word(KIND_EYE, 0.2, 0.2)]));
  expect(rows.length).toBe(3);
  for (const row of rows) {
    expect(row.length).toBe(PART_INSTANCE_FLOATS);
    expect(row[8]).toBe(BODY.x);
    expect(row[9]).toBe(BODY.y);
  }
});

test('anchor 0 is the nose and anchor 1 is the tail', () => {
  expect(anchorPoint(0, 12, 6, 1).x).toBeCloseTo(6, 5);
  expect(anchorPoint(1, 12, 6, 1).x).toBeCloseTo(-6, 5);
  expect(anchorPoint(0.5, 12, 6, -1).y).toBeCloseTo(-3, 5);
});

// The looks of `?look`. Look 1: the outline narrows toward the end that carries less part size.

const part = (kind: number, anchor: number, size: number): Part => ({
  kind,
  anchor,
  size,
  extra: 0,
});

/** The founder of the core, read from its source: FOUNDER_PARTS, and its eye at the default size. */
function founder(): Part[] {
  const source = (file: string): string =>
    readFileSync(new URL(`../crates/sim/src/${file}`, import.meta.url), 'utf8');
  const genome = source('genome.rs');
  const kinds: Record<string, number> = {
    KIND_FLAGELLUM,
    KIND_CILIA,
    KIND_FILTER,
    KIND_CHEMO,
    KIND_FIN,
    KIND_EYE,
  };
  const list = /FOUNDER_PARTS: [^=]*= \[([^;]*)\];/.exec(genome)?.[1] ?? '';
  const parts = [...list.matchAll(/\((KIND_\w+), ([\d.]+), ([\d.]+)\)/g)].map((m) =>
    part(kinds[m[1] ?? ''] ?? 0, Number(m[2]), Number(m[3])),
  );
  const eyeAnchor = /FOUNDER_EYE_ANCHOR: f32 = ([\d.]+);/.exec(genome)?.[1];
  const eyeSize = /FOUNDER_EYE "founder_eye" ([\d.]+) /.exec(source('params.rs'))?.[1];
  return [...parts, part(KIND_EYE, Number(eyeAnchor), Number(eyeSize))];
}

test('the taper of a founder is 0', () => {
  const parts = founder();
  // Fix for a failure here: the founder of crates/sim changed, so copy it to FOUNDER in parts.ts.
  expect(parts.map((p) => p.kind)).toEqual([
    KIND_FLAGELLUM,
    KIND_CILIA,
    KIND_FILTER,
    KIND_CHEMO,
    KIND_EYE,
  ]);
  expect(taperOf(parts)).toBeCloseTo(0, 6);
  expect(endsOf(taperOf(parts))).toEqual([1, 1]);
});

test('part size at the nose tapers one way and at the tail the other', () => {
  const nose = taperOf([part(KIND_FILTER, 0, 0.9), part(KIND_EYE, 0.2, 0.3)]);
  const tail = taperOf([part(KIND_FLAGELLUM, 1, 0.9), part(KIND_FIN, 0.8, 0.3)]);
  expect(nose).toBe(1);
  expect(tail).toBe(-1);
  // A body that carries little tapers the same way, and less.
  const little = taperOf([part(KIND_FILTER, 0, 0.1)]);
  expect(little).toBeGreaterThan(0);
  expect(little).toBeLessThan(1);
  expect(taperOf([part(KIND_FLAGELLUM, 1, 0.1)])).toBeLessThan(0);
  // The end that carries less is the end that narrows. The other end keeps the width of the body.
  expect(endsOf(nose)[0]).toBe(1);
  expect(endsOf(nose)[1]).toBeLessThan(1);
  expect(endsOf(tail)[0]).toBeLessThan(1);
  expect(endsOf(tail)[1]).toBe(1);
  // More size at one end tapers more, and a taper never passes 1.
  const some = taperOf([...founder(), part(KIND_FILTER, 0.1, 0.2)]);
  const more = taperOf([...founder(), part(KIND_FILTER, 0.1, 0.4)]);
  expect(some).toBeGreaterThan(0);
  expect(more).toBeGreaterThan(some);
  expect(more).toBeLessThan(1);
});

test('a body with no part draws as today', () => {
  expect(taperOf([])).toBe(0);
  // A part in the middle of the body is at neither end.
  expect(taperOf([part(KIND_CILIA, 0.5, 0.4)])).toBeCloseTo(0, 6);
  expect(endsOf(0)).toEqual([1, 1]);
  for (const look of [1, 2, 3, 4] as const) {
    expect(instancesOf(frameOf(0, []), 10, look).length).toBe(0);
  }
  for (const anchor of [0, 0.2, 0.5, 0.9, 1]) {
    expect(anchorPoint(anchor, 12, 6, 1, 0)).toEqual(anchorPoint(anchor, 12, 6, 1));
  }
});

test('a part of a tapered body sits on the narrowed outline', () => {
  const [, tailShare] = endsOf(1);
  // Both ends stay on the axis, at the ends of the body.
  expect(anchorPoint(0, 12, 6, 1, 1)).toEqual(anchorPoint(0, 12, 6, 1));
  expect(anchorPoint(1, 12, 6, 1, 1).x).toBeCloseTo(-6, 5);
  expect(anchorPoint(1, 12, 6, 1, 1).y).toBeCloseTo(0, 5);
  // The middle of a side is halfway between the widths of the two ends, and a part there leans
  // toward the narrow end.
  expect(anchorPoint(0.5, 12, 6, 1, 1).y).toBeCloseTo((3 * (1 + tailShare)) / 2, 5);
  expect(anchorPoint(0.5, 12, 6, 1, 1).angle).toBeGreaterThan(anchorPoint(0.5, 12, 6, 1).angle);
  // Near the narrow end a part is nearer the axis than today.
  const today = anchorPoint(0.8, 12, 6, 1);
  const narrowed = anchorPoint(0.8, 12, 6, 1, 1);
  expect(narrowed.x).toBeCloseTo(today.x, 5);
  expect(narrowed.y).toBeLessThan(today.y);
  expect(narrowed.y).toBeGreaterThan(0);
  // The other way round, the nose narrows.
  expect(anchorPoint(0.2, 12, 6, -1, -1).y).toBeGreaterThan(anchorPoint(0.2, 12, 6, -1).y);
});

test('look 0 and look 1 draw each part at the size of today, and look 2 at twice that', () => {
  const frame = frameOf(0.7, [word(KIND_FLAGELLUM, 1, 0.6), word(KIND_EYE, 0.2, 0.2)]);
  const today = instancesOf(frame);
  expect(instancesOf(frame, 10, 0)).toEqual(today);
  const sizes = (look: Look): number[] => instancesOf(frame, 10, look).map((row) => row[3] ?? NaN);
  expect(sizes(1)).toEqual(today.map((row) => row[3]));
  for (const look of [2, 3] as const) {
    sizes(look).forEach((size, i) => expect(size).toBeCloseTo(2 * (today[i]?.[3] ?? NaN), 5));
  }
});

test('in look 1 the parts of a body follow its taper', () => {
  // All the part size is at the nose, so the tail narrows. The eye pair near the tail closes up.
  const words = [word(KIND_FILTER, 0, 1), word(KIND_EYE, 0.8, 0.01)];
  const [, a, b] = instancesOf(frameOf(0, words)).map(offset);
  const [, c, d] = instancesOf(frameOf(0, words), 10, 1).map(offset);
  if (!a || !b || !c || !d) throw new Error('an eye off the midline made no pair');
  expect(c.dx).toBeCloseTo(a.dx, 4);
  expect(Math.abs(c.dy)).toBeLessThan(Math.abs(a.dy));
  expect(d.dy).toBeCloseTo(-c.dy, 4);
});

test('in look 3 the outline swells at a mouth, and the mouth sits on the swell', () => {
  // A mouth at the nose of a body with no taper: the swell is round the centre of the round nose.
  const small = swellAt(part(KIND_FILTER, 0, 0.2), BODY.length, BODY.width, 0);
  const big = swellAt(part(KIND_FILTER, 0, 0.8), BODY.length, BODY.width, 0);
  expect(small.x).toBeCloseTo(BODY.length / 2 - BODY.width / 2, 5);
  expect(small.r).toBeGreaterThan(BODY.width / 2);
  expect(big.r).toBeGreaterThan(small.r);
  // A swell at the narrow end of a tapered body is round that end, and smaller.
  const narrow = swellAt(part(KIND_FILTER, 0, 0.8), BODY.length, BODY.width, -1);
  expect(narrow.r).toBeCloseTo(big.r * endsOf(-1)[0], 5);
  expect(narrow.x).toBeCloseTo(BODY.length / 2 - (endsOf(-1)[0] * BODY.width) / 2, 5);
  // A mouth on a side swells the outline at its own place along the body.
  const side = swellAt(part(KIND_FILTER, 0.5, 0.8), BODY.length, BODY.width, 0);
  expect(side.x).toBeCloseTo(0, 5);
  expect(side.r).toBeCloseTo(big.r, 5);

  // The mouth pair of look 3 is on the circle of the swell. In look 2 it is on the outline.
  const frame = frameOf(0, [word(KIND_FILTER, 0.5, 0.8)]);
  const lone = part(KIND_FILTER, 128 / 255, 204 / 255); // the word, as `unpackPart` reads it
  const mouth = swellAt(lone, BODY.length, BODY.width, taperOf([lone]));
  for (const { dx, dy } of instancesOf(frame, 10, 3).map(offset)) {
    expect(Math.hypot(dx - mouth.x, dy)).toBeCloseTo(mouth.r, 4);
  }
  for (const { dy } of instancesOf(frame, 10, 2).map(offset)) {
    expect(Math.abs(dy)).toBeLessThan(mouth.r);
  }
});

// Look 4: the taper and the swells, with each part at the size of today.

/** The outline of look 4 of a body of the size of BODY that carries `parts`. */
function outlined(parts: readonly Part[]): { taper: number; swells: number[] } {
  const out = new Float64Array(OUTLINE_FLOATS);
  outlineOf(parts, 1, BODY.length, BODY.width, out, 0);
  return { taper: out[OUTLINE_TAPER] ?? NaN, swells: [...out.subarray(OUTLINE_SWELLS)] };
}

test('look 4 draws each part at the size of today', () => {
  const frame = frameOf(0.7, [
    word(KIND_FLAGELLUM, 1, 0.6),
    word(KIND_FILTER, 0, 0.6),
    word(KIND_CHEMO, 0.15, 0.5),
    word(KIND_FIN, 0.7, 0.3),
    word(KIND_EYE, 0.2, 0.2),
  ]);
  const sizes = (look: Look): number[] => instancesOf(frame, 10, look).map((row) => row[3] ?? NaN);
  expect(sizes(4).length).toBe(8);
  expect(sizes(4)).toEqual(sizes(0));
});

test('in look 4 a body with no mouth has no swell', () => {
  const carried = [part(KIND_FLAGELLUM, 1, 0.9), part(KIND_EYE, 0.2, 0.2)];
  const { taper, swells } = outlined(carried);
  expect(taper).toBe(taperOf(carried));
  expect(swells).toEqual([0, 0, 0, 0]);
  // With no swell to sit on, each part is where look 1 draws it.
  const frame = frameOf(0.7, [word(KIND_FLAGELLUM, 1, 0.6), word(KIND_EYE, 0.2, 0.2)]);
  expect(instancesOf(frame, 10, 4)).toEqual(instancesOf(frame, 10, 1));
});

test('in look 4 the outline swells at each place with a mouth, and a larger mouth swells more', () => {
  const nose = part(KIND_FILTER, 0, 0.8);
  const { taper, swells } = outlined([nose, part(KIND_EYE, 0.2, 0.2), part(KIND_FILTER, 0.5, 0.3)]);
  const [noseX = NaN, noseR = NaN, sideX = NaN, sideR = NaN] = swells;
  // Each swell is round the same place as that of look 3, and wider than the outline is there.
  const [, tail] = endsOf(taper);
  const atNose = BODY.width / 2;
  const atSide = ((1 + tail) / 2) * (BODY.width / 2);
  expect(noseX).toBeCloseTo(swellAt(nose, BODY.length, BODY.width, taper).x, 6);
  expect(sideX).toBeCloseTo(0, 6);
  expect(noseR).toBeGreaterThan(atNose);
  expect(sideR).toBeGreaterThan(atSide);
  expect(noseR / atNose).toBeGreaterThan(sideR / atSide);

  // Mouths at one place share a swell, that of the largest. Both of these are at the round nose.
  const small = part(KIND_FILTER, 0.1, 0.3);
  for (const carried of [
    [nose, small],
    [small, nose],
  ]) {
    const shared = outlined(carried).swells;
    expect(shared[0]).toBeCloseTo(noseX, 6);
    expect(shared[1]).toBeCloseTo(noseR, 6);
    expect(shared.slice(2)).toEqual([0, 0]);
  }
  expect(outlined([small]).swells[1]).toBeLessThan(noseR - 0.1);

  // A body with mouths at more places than the shader takes swells at its first ones.
  const many = [0, 0.4, 0.5, 0.6].map((anchor) => part(KIND_FILTER, anchor, 0.5));
  const first = outlined(many).swells;
  expect(first.length).toBe(4);
  expect(first[0]).toBeCloseTo(noseX, 6);
  expect(first[2]).toBeCloseTo((Math.cos(0.4 * Math.PI) * BODY.length) / 2, 6);
  expect(Math.min(first[1] ?? 0, first[3] ?? 0)).toBeGreaterThan(0);
});

test('in look 4 the outline of a body is made again only when the body or its size changes', () => {
  const mouth = [part(KIND_FILTER, 0, 0.8)];
  const out = new Float64Array(3 * OUTLINE_FLOATS).fill(9);
  const slot = (): number[] => [...out.subarray(OUTLINE_FLOATS, 2 * OUTLINE_FLOATS)];
  outlineOf(mouth, 7, 12, 6, out, OUTLINE_FLOATS);
  const made = slot();
  expect(made[OUTLINE_SWELLS + 1]).toBeGreaterThan(3);
  // Only the numbers of this body are written.
  expect([...out.subarray(0, OUTLINE_FLOATS)]).toEqual(Array(OUTLINE_FLOATS).fill(9));
  expect([...out.subarray(2 * OUTLINE_FLOATS)]).toEqual(Array(OUTLINE_FLOATS).fill(9));
  // The parts of a body are those of its genome, so the same body at the same size is not read.
  outlineOf([], 7, 12, 6, out, OUTLINE_FLOATS);
  expect(slot()).toEqual(made);
  // It grew.
  outlineOf(mouth, 7, 12, 8, out, OUTLINE_FLOATS);
  expect(slot()[OUTLINE_SWELLS + 1]).toBeGreaterThan(4);
  outlineOf(mouth, 7, 14, 8, out, OUTLINE_FLOATS);
  expect(slot()[OUTLINE_SWELLS]).toBeCloseTo(3, 6);
  // Another body took the slot, with no mouth.
  outlineOf([], 8, 14, 8, out, OUTLINE_FLOATS);
  expect(slot()).toEqual([8, 14, 8, 0, 0, 0, 0, 0]);
});

test('in look 4 a part inside the swell of a mouth sits on its edge', () => {
  const words = [word(KIND_FILTER, 0, 0.8), word(KIND_EYE, 0.2, 0.2), word(KIND_FIN, 0.9, 0.3)];
  const body = frameOf(0, words);
  const [x = NaN, r = NaN] = outlined(partsOf(body.u32, body.creatureBase)).swells;

  const from = ({ dx, dy }: { dx: number; dy: number }): number => Math.hypot(dx - x, dy);
  const today = instancesOf(body, 10, 1).map(offset);
  const rows = instancesOf(body, 10, 4);
  const [lip, eyeA, eyeB, finA, finB] = rows.map(offset);
  if (!lip || !eyeA || !eyeB || !finA || !finB) throw new Error('the body made no 5 instances');
  // The mouth and the eye pair are on the circle of the swell. Look 1 has the eyes inside it.
  for (const at of [lip, eyeA, eyeB]) expect(from(at)).toBeCloseTo(r, 4);
  expect(from(today[1] ?? eyeA)).toBeLessThan(r - 0.1);
  expect(eyeB.dy).toBeCloseTo(-eyeA.dy, 4);
  // An eye on the swell points out from its centre.
  expect(rows[1]?.[2]).toBeCloseTo(Math.atan2(eyeA.dy, eyeA.dx - x), 4);
  // The fin pair, near the tail, is out of the swell: it stays where look 1 draws it.
  expect([finA, finB]).toEqual(today.slice(3));

  // A body too small on screen for its parts has no swell: its outline is not read.
  const far = (PART_LOD_PX - 1) / BODY.length;
  const lash = frameOf(0, [word(KIND_FLAGELLUM, 0.05, 0.6), ...words]);
  expect(instancesOf(lash, far, 4)).toEqual(instancesOf(lash, far));
});

test('the look of the address is 1, 2, 3, or 4, and anything else is today', () => {
  expect(lookOf('1')).toBe(1);
  expect(lookOf('2')).toBe(2);
  expect(lookOf('3')).toBe(3);
  expect(lookOf('4')).toBe(4);
  for (const text of [null, '', '0', '5', '-1', '1.5', 'x']) expect(lookOf(text)).toBe(0);
});
