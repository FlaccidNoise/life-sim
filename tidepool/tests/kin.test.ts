import { expect, test } from 'vitest';
import { bodyIn, childOf, differences, showsCard } from '../src/app/kin';
import * as P from '../src/protocol';

type Kin = P.Kin;

// A part word, as `write` of crates/sim/src/frame.rs packs it.
const word = (kind: number, anchor: number, size: number, extra = 0): number =>
  (kind |
    (Math.round(anchor * 255) << 8) |
    (Math.round(size * 255) << 16) |
    (Math.round(extra * 255) << 24)) >>>
  0;

interface Rec {
  uid: number;
  x: number;
  y: number;
  flags?: number;
  parts?: number[];
}

/** A frame of these bodies. The slot of a body is its place in the list. */
function frameOf(recs: Rec[], possessedSlot = 0): P.FrameView {
  const buffer = new ArrayBuffer(4 * (P.FRAME_HEADER_WORDS + recs.length * P.CREATURE_STRIDE));
  const u32 = new Uint32Array(buffer);
  const f32 = new Float32Array(buffer);
  u32[1] = recs.length;
  u32[5] = possessedSlot;
  recs.forEach((rec, slot) => {
    const r = P.FRAME_HEADER_WORDS + slot * P.CREATURE_STRIDE;
    f32[r + P.C_X] = rec.x;
    f32[r + P.C_Y] = rec.y;
    f32[r + P.C_LENGTH] = 12;
    f32[r + P.C_WIDTH] = 6;
    f32[r + P.C_HUE] = 0.25;
    f32[r + P.C_GROWTH] = 0.5;
    u32[r + P.C_UID] = rec.uid;
    u32[r + P.C_SLOT] = slot;
    u32[r + P.C_FLAGS] = rec.flags ?? 0;
    u32[r + P.C_BRAIN] = 4 | (60 << 16);
    u32.set(rec.parts ?? [], r + P.C_PARTS);
  });
  return P.viewFrame(buffer);
}

const MARKED = P.FLAG_LINEAGE | P.FLAG_JUVENILE;
const PARENT = { uid: 7, x: 100, y: 100, flags: P.FLAG_LINEAGE | P.FLAG_POSSESSED };

test('bodyIn copies a record out of the frame, and gives null for a slot that it does not hold', () => {
  const frame = frameOf([{ ...PARENT, parts: [word(P.KIND_EYE, 0.2, 0.4, 0.6)] }]);
  expect(bodyIn(frame, 0)).toMatchObject({
    uid: 7,
    x: 100,
    length: 12,
    width: 6,
    hue: 0.25,
    growth: 0.5,
    hidden: 4,
    conns: 60,
  });
  const eye = bodyIn(frame, 0)?.parts[0];
  expect(eye?.kind).toBe(P.KIND_EYE);
  expect(eye?.anchor).toBeCloseTo(0.2, 2);
  expect(eye?.extra).toBeCloseTo(0.6, 2);
  expect(bodyIn(frame, 3)).toBeNull();
  expect(bodyIn(frame, P.NO_SLOT)).toBeNull();
});

test('childOf finds the new body with the lineage mark that is nearest to the parent', () => {
  const old = { uid: 8, x: 101, y: 100, flags: P.FLAG_LINEAGE }; // nearer, and not new
  const prev = frameOf([PARENT, old]);
  const next = frameOf([
    PARENT,
    old,
    { uid: 20, x: 102, y: 100, flags: P.FLAG_JUVENILE }, // nearer and new, with no mark
    { uid: 21, x: 130, y: 100, flags: MARKED }, // a sibling, farther
    { uid: 22, x: 110, y: 100, flags: MARKED },
  ]);
  expect(childOf(prev, next, 0)?.uid).toBe(22);
});

test('childOf gives null with no new marked body, and with no parent in the frame', () => {
  const prev = frameOf([PARENT, { uid: 8, x: 110, y: 100, flags: P.FLAG_LINEAGE }]);
  const same = frameOf([PARENT, { uid: 8, x: 111, y: 100, flags: P.FLAG_LINEAGE }]);
  expect(childOf(prev, same, 0)).toBeNull();
  const born = frameOf([PARENT, { uid: 22, x: 110, y: 100, flags: MARKED }]);
  expect(childOf(prev, born, 0)?.uid).toBe(22);
  expect(childOf(prev, born, 5)).toBeNull();
  expect(childOf(prev, born, P.NO_SLOT)).toBeNull();
});

const part = (kind: number, anchor: number, size: number, extra = 0): P.Part => ({
  kind,
  anchor,
  size,
  extra,
});
const FOUNDER = [
  part(P.KIND_FLAGELLUM, 1, 0.6),
  part(P.KIND_CILIA, 0.5, 0.4),
  part(P.KIND_FILTER, 0, 0.6),
  part(P.KIND_CHEMO, 0.15, 0.5),
  part(P.KIND_EYE, 0.2, 0.2, 0.5),
];
const kin = (over: Partial<Kin> = {}): Kin => ({
  uid: 1,
  x: 0,
  y: 0,
  length: 12,
  width: 6,
  hue: 0.25,
  growth: 1,
  flags: P.FLAG_LINEAGE,
  hidden: 4,
  conns: 60,
  parts: FOUNDER,
  ...over,
});
// A newborn has grown a share of its full length: here 0.7, the egg of a founder.
const newborn = (over: Partial<Kin> = {}): Kin =>
  kin({ uid: 2, length: 8.4, width: 4.2, growth: 0.7, flags: MARKED, ...over });
const texts = (...args: Parameters<typeof differences>): string[] =>
  differences(...args).map((d) => d.text);

test('two equal bodies have no difference', () => {
  expect(differences(kin(), kin({ uid: 2 }))).toEqual([]);
  expect(differences(kin(), newborn())).toEqual([]);
});

test('a longer body and a wider one are listed in percent, on the side of the child', () => {
  expect(differences(kin(), kin({ length: 13.2, width: 6.6 }))).toEqual([
    { text: 'Body 10% longer', side: 'child' },
  ]);
  expect(texts(kin(), kin({ length: 10.8, width: 5.4 }))).toEqual(['Body 10% shorter']);
  expect(texts(kin(), kin({ width: 7.2 }))).toEqual(['Body 20% wider for its length']);
  expect(texts(kin(), kin({ width: 5.4 }))).toEqual(['Body 10% narrower for its length']);
});

// The frame gives the length of a body as it is now, and its growth. The length over the growth is
// the length gene, which is what a parent and its child are compared by.
test('the length gene of a newborn is compared, and its shape is', () => {
  // A length gene of 12.72: 6% over the 12 of the parent.
  expect(differences(kin(), newborn({ length: 8.904, width: 4.452 }))).toEqual([
    { text: 'Body 6% longer', side: 'child' },
  ]);
  expect(texts(kin(), newborn({ length: 7.56, width: 3.78 }))).toEqual(['Body 10% shorter']);
  expect(texts(kin(), newborn({ length: 8.4, width: 5.04 }))).toEqual([
    'Body 20% wider for its length',
  ]);
});

test('a child with the length gene of its parent has no length line, whatever its growth', () => {
  for (const growth of [0.05, 0.4, 0.7, 0.999, 1]) {
    // The lengths as the core gives them: 32-bit floats.
    const child = { length: Math.fround(12 * growth), width: Math.fround(6 * growth), growth };
    expect(texts(kin(), newborn(child))).toEqual([]);
    expect(texts(newborn(child), kin())).toEqual([]);
  }
});

test('a body with no growth has no length line', () => {
  for (const growth of [0, NaN]) {
    expect(texts(kin(), newborn({ length: 6, width: 3, growth }))).toEqual([]);
    expect(texts(kin({ growth }), newborn({ length: 6, width: 3 }))).toEqual([]);
  }
});

test('a gained part is on the side of the child and a lost part on the side of the parent', () => {
  const fin = part(P.KIND_FIN, 0.6, 0.1);
  expect(differences(kin(), newborn({ parts: [...FOUNDER, fin] }))).toEqual([
    { text: 'Gained: fin', side: 'child', part: 5 },
  ]);
  expect(differences(kin(), newborn({ parts: FOUNDER.filter((_, i) => i !== 2) }))).toEqual([
    { text: 'Lost: mouth', side: 'parent', part: 2 },
  ]);
});

test('a part is named by which one of its kind it is', () => {
  const two = [...FOUNDER, part(P.KIND_FLAGELLUM, 0.8, 0.3)];
  // The copy of a part goes on the end of the list.
  expect(differences(kin(), newborn({ parts: two }))).toEqual([
    { text: 'Gained: second flagellum', side: 'child', part: 5 },
  ]);
  expect(differences(kin({ parts: two }), newborn())).toEqual([
    { text: 'Lost: second flagellum', side: 'parent', part: 5 },
  ]);
  // The first of the two is lost: the one that stays is the one that is like it.
  expect(differences(kin({ parts: two }), newborn({ parts: two.slice(1) }))).toEqual([
    { text: 'Lost: first flagellum', side: 'parent', part: 0 },
  ]);
});

test('a resized part is listed in percent of the size it had', () => {
  const sized = (size: number): P.Part[] =>
    FOUNDER.map((p) => (p.kind === P.KIND_CILIA ? { ...p, size } : p));
  expect(differences(kin(), newborn({ parts: sized(0.5) }))).toEqual([
    { text: 'Cilia 25% larger', side: 'child', part: 1 },
  ]);
  expect(texts(kin(), newborn({ parts: sized(0.3) }))).toEqual(['Cilia 25% smaller']);
  expect(texts(kin({ parts: sized(0) }), newborn())).toEqual(['Cilia larger, from nothing']);
});

test('a part that moved and an eye with another cone are listed', () => {
  const eye = (anchor: number, extra: number): P.Part[] =>
    FOUNDER.map((p) => (p.kind === P.KIND_EYE ? { ...p, anchor, extra } : p));
  expect(differences(kin(), newborn({ parts: eye(0.3, 0.5) }))).toEqual([
    { text: 'Eye moved toward the tail', side: 'child', part: 4 },
  ]);
  expect(texts(kin(), newborn({ parts: eye(0.1, 0.5) }))).toEqual(['Eye moved toward the nose']);
  expect(texts(kin(), newborn({ parts: eye(0.2, 0.7) }))).toEqual(['Eye cone wider']);
  expect(texts(kin(), newborn({ parts: eye(0.2, 0.4) }))).toEqual(['Eye cone narrower']);
});

test('the counts of hidden neurons and of connections come from the two frame records', () => {
  expect(texts(kin(), newborn({ hidden: 5 }))).toEqual(['1 more hidden neuron']);
  expect(texts(kin(), newborn({ hidden: 2 }))).toEqual(['2 fewer hidden neurons']);
  expect(texts(kin(), newborn({ conns: 62 }))).toEqual(['2 more connections']);
  expect(texts(kin(), newborn({ conns: 59 }))).toEqual(['1 fewer connection']);
});

const brainOf = (conns: [history: number, weight: number][]): P.BrainView => ({
  uid: 1,
  inputs: 0,
  hidden: 0,
  outputs: 0,
  manual: false,
  neurons: [],
  connections: conns.map(([history, weight]) => ({ src: 0, dst: 0, weight, history })),
});

test('two brain readouts give the weights that differ and the connections gained or lost', () => {
  const was = brainOf([
    [1, 0.5],
    [2, -1],
    [3, 2],
  ]);
  expect(texts(kin(), newborn(), [was, was])).toEqual([]);
  // One weight has another value. The count is of the connections that both hold.
  const nudged = brainOf([
    [1, 0.5],
    [2, -1.01],
    [3, 2],
  ]);
  expect(texts(kin(), newborn(), [was, nudged])).toEqual(['1 of 3 connection weights nudged']);
  // History 3 is gone and 9 is new. The frame counts 3 and 3, and the readouts tell the two apart.
  const rewired = brainOf([
    [1, 0.5],
    [9, 0.1],
    [2, -1],
  ]);
  expect(differences(kin({ conns: 3 }), newborn({ conns: 3 }), [was, rewired])).toEqual([
    { text: '1 connection gained', side: 'child' },
    { text: '1 connection lost', side: 'parent' },
  ]);
  const every = brainOf([
    [1, 0.6],
    [2, -1.1],
    [3, 2.2],
  ]);
  expect(texts(kin(), newborn(), [was, every])).toEqual(['3 of 3 connection weights nudged']);
});

test('a difference under 1% is left out', () => {
  expect(texts(kin(), kin({ length: 12.1, width: 6.05 }))).toEqual([]);
  expect(texts(kin(), kin({ width: 6.05 }))).toEqual([]);
  const near = FOUNDER.map((p) => ({ ...p, size: p.size * 1.009, anchor: p.anchor * 0.995 }));
  expect(texts(kin(), newborn({ parts: near }))).toEqual([]);
  expect(texts(kin(), kin({ length: 12.13, width: 6.065 }))).toEqual(['Body 1% longer']);
});

test('the larger changes come first, and the count of weights comes last', () => {
  const parts = [
    ...FOUNDER.slice(1).map((p) => (p.kind === P.KIND_CILIA ? { ...p, size: 0.42 } : p)),
    part(P.KIND_FIN, 0.6, 0.1),
  ];
  const brains: [P.BrainView, P.BrainView] = [brainOf([[1, 0.5]]), brainOf([[1, 0.7]])];
  expect(texts(kin(), newborn({ width: 5.04, hidden: 5, parts }), brains)).toEqual([
    'Lost: flagellum',
    'Gained: fin',
    '1 more hidden neuron',
    'Body 20% wider for its length',
    'Cilia 5% larger',
    '1 of 1 connection weights nudged',
  ]);
});

test('the bud card shows for the first two buds of a player, and then steps back', () => {
  expect([0, 1, 2, 3, 40].map(showsCard)).toEqual([true, true, false, false, false]);
});
