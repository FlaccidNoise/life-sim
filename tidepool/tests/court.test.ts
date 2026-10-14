import type { ComponentChild, VNode } from 'preact';
import { beforeEach, expect, test } from 'vitest';
import { REACH, REFUSAL_MS, courtship, lingering, nearestOther } from '../src/app/court';
import * as P from '../src/protocol';
import { MateCard } from '../src/ui/MateCard';
import { budOpen, courtHeld, courtable, mate, mateShown, mode, noteOpen } from '../src/ui/state';
import { MATE } from '../src/ui/words/lines';

interface Rec {
  x: number;
  y?: number;
  flags?: number;
}

const YOUNG = P.FLAG_JUVENILE;
const WILLING = P.FLAG_WILLING;
const DONOR = P.FLAG_DONOR;

/**
 * A frame of these bodies, each 12 long and 4 wide: a radius of 4, as `creature::radius` of the core
 * gives it. The slot of a body is its place in the list, and its uid is its slot plus 100.
 */
function frameOf(recs: Rec[]): P.FrameView {
  const buffer = new ArrayBuffer(4 * (P.FRAME_HEADER_WORDS + recs.length * P.CREATURE_STRIDE));
  const u32 = new Uint32Array(buffer);
  const f32 = new Float32Array(buffer);
  u32[1] = recs.length;
  recs.forEach((rec, slot) => {
    const r = P.FRAME_HEADER_WORDS + slot * P.CREATURE_STRIDE;
    f32[r + P.C_X] = rec.x;
    f32[r + P.C_Y] = rec.y ?? 0;
    f32[r + P.C_LENGTH] = 12;
    f32[r + P.C_WIDTH] = 4;
    u32[r + P.C_UID] = slot + 100;
    u32[r + P.C_SLOT] = slot;
    u32[r + P.C_FLAGS] = rec.flags ?? 0;
  });
  return P.viewFrame(buffer);
}

test('nearestOther picks the nearest full-grown body inside the range', () => {
  // The player is in slot 1. 2.5 lengths of 12 are 30.
  const frame = frameOf([{ x: 25 }, { x: 0 }, { x: -20 }, { x: 5, flags: YOUNG }, { x: 31 }]);
  expect(nearestOther(frame, 1, REACH)?.uid).toBe(102);
  // The body at 25 is the only one inside 30 of the body at 31, which is outside 30 of the player.
  expect(nearestOther(frame, 4, REACH)?.uid).toBe(100);
  // The edge of the range is inside it.
  expect(nearestOther(frameOf([{ x: 0 }, { x: 30 }]), 0, REACH)?.uid).toBe(101);
  // A shorter range holds less.
  expect(nearestOther(frame, 1, 1)).toBeNull();
});

test('nearestOther gives null with no body in range, with only juveniles, and with no player', () => {
  expect(nearestOther(frameOf([{ x: 0 }]), 0, REACH)).toBeNull();
  expect(nearestOther(frameOf([{ x: 0 }, { x: 30.5 }]), 0, REACH)).toBeNull();
  expect(nearestOther(frameOf([{ x: 0 }, { x: 5, flags: YOUNG }]), 0, REACH)).toBeNull();
  // The frame does not hold the slot.
  expect(nearestOther(frameOf([{ x: 0 }, { x: 5 }]), 9, REACH)).toBeNull();
});

test('of two bodies at one distance, the lower slot is the other, as the core breaks a tie', () => {
  expect(nearestOther(frameOf([{ x: 0 }, { x: 9 }, { x: -9 }]), 0, REACH)?.uid).toBe(101);
});

const stateOf = (recs: Rec[], slot = 0): string | undefined =>
  courtship(frameOf(recs), slot)?.state;

test('no body near is no courtship', () => {
  expect(courtship(frameOf([{ x: 0 }]), 0)).toBeNull();
  expect(courtship(frameOf([{ x: 0 }, { x: 40 }]), 0)).toBeNull();
  expect(courtship(frameOf([{ x: 0 }, { x: 5 }]), 9)).toBeNull();
});

test('the courtship holds the two bodies: the player and the nearest full-grown body', () => {
  const found = courtship(frameOf([{ x: 0 }, { x: 5, flags: YOUNG }, { x: 20 }]), 0);
  expect([found?.you.uid, found?.other.uid]).toEqual([100, 102]);
});

test('with only a juvenile near, the other is too young', () => {
  const found = courtship(frameOf([{ x: 0 }, { x: 5, flags: YOUNG | WILLING }]), 0);
  expect([found?.other.uid, found?.state]).toEqual([101, 'young']);
});

test('a player who is not full-grown is told so first', () => {
  expect(stateOf([{ x: 0, flags: YOUNG }, { x: 5 }])).toBe('ownYoung');
  expect(
    stateOf([
      { x: 0, flags: YOUNG },
      { x: 5, flags: YOUNG },
    ]),
  ).toBe('ownYoung');
});

test('a donor held by either body is named before the distance', () => {
  expect(
    stateOf([
      { x: 0, flags: DONOR },
      { x: 20, flags: DONOR },
    ]),
  ).toBe('carry');
  expect(stateOf([{ x: 0 }, { x: 20, flags: DONOR }])).toBe('otherCarries');
});

test('two bodies touch when their centres are closer than the sum of their radii', () => {
  // Two radii of 4.
  expect(stateOf([{ x: 0 }, { x: 8 }])).toBe('apart');
  expect(stateOf([{ x: 0 }, { x: 7.9 }])).toBe('hold');
  // The motor does not push two bodies on one point, so they do not touch.
  expect(stateOf([{ x: 0 }, { x: 0 }])).toBe('apart');
});

test('in touch, the state follows the accept of the player and then that of the other', () => {
  expect(stateOf([{ x: 0 }, { x: 6, flags: WILLING }])).toBe('hold');
  expect(stateOf([{ x: 0, flags: WILLING }, { x: 6 }])).toBe('refused');
  expect(
    stateOf([
      { x: 0, flags: WILLING },
      { x: 6, flags: WILLING },
    ]),
  ).toBe('chance');
});

test('a third body that is nearer to the lower slot of the two stops the pair', () => {
  const both = { flags: WILLING };
  // The core pairs the lower slot of the two with the nearest body that it touches.
  const juvenile = { x: -3, flags: YOUNG };
  expect(stateOf([{ x: 0, ...both }, { x: 6, ...both }, juvenile])).toBe('third');
  // The player is the higher slot: the third body is near the player and not near the other.
  expect(stateOf([{ x: 6, ...both }, { x: 0, ...both }, juvenile], 1)).toBe('chance');
  expect(
    stateOf(
      [
        { x: 6, ...both },
        { x: 0, ...both },
        { x: 9, flags: YOUNG },
      ],
      1,
    ),
  ).toBe('third');
  // A third body that is farther than the other changes nothing.
  expect(stateOf([{ x: 0, ...both }, { x: 6, ...both }, { x: -7 }])).toBe('chance');
});

test('a refusal stays on the card for a while after the two come apart', () => {
  const none = { uid: 0, at: -Infinity };
  const refused = courtship(frameOf([{ x: 0, flags: WILLING }, { x: 6 }]), 0);
  const first = lingering(refused, none, 1000);
  expect(first).toEqual({ shown: refused, last: { uid: 101, at: 1000 } });
  // Pushed apart, with a third body nearer, and with the court let go in touch: the card still
  // holds the answer.
  const apart = courtship(frameOf([{ x: 0, flags: WILLING }, { x: 9 }]), 0);
  const third = courtship(
    frameOf([{ x: 0, flags: WILLING }, { x: 6 }, { x: -3, flags: YOUNG }]),
    0,
  );
  const hold = courtship(frameOf([{ x: 0 }, { x: 6 }]), 0);
  expect([apart?.state, third?.state, hold?.state]).toEqual(['apart', 'third', 'hold']);
  for (const found of [apart, third, hold]) {
    const kept = lingering(found, first.last, 1000 + REFUSAL_MS - 1);
    expect(kept.shown).toEqual({ ...found, state: 'refused' });
    expect(kept.last).toBe(first.last);
    expect(lingering(found, first.last, 1000 + REFUSAL_MS).shown).toBe(found);
  }
  // Another body is the other now, or the pair lacks something that a court does not mend.
  const next = courtship(frameOf([{ x: 0 }, { x: 40 }, { x: 9 }]), 0);
  expect(lingering(next, first.last, 1001).shown).toBe(next);
  const carries = courtship(frameOf([{ x: 0 }, { x: 9, flags: DONOR }]), 0);
  expect(lingering(carries, first.last, 1001).shown).toBe(carries);
  expect(lingering(null, first.last, 1001).shown).toBeNull();
  // With no refusal there is nothing to keep.
  expect(lingering(apart, none, 0)).toEqual({ shown: apart, last: none });
});

// The card as a tree of elements, with each function component called: none of them holds a hook.
function flat(node: ComponentChild): VNode<Record<string, unknown>>[] {
  if (Array.isArray(node)) return node.flatMap(flat);
  if (typeof node !== 'object' || node === null || !('props' in node)) return [];
  const vnode = node as VNode<Record<string, unknown>>;
  if (typeof vnode.type === 'function') {
    const component = vnode.type as (props: Record<string, unknown>) => ComponentChild;
    return flat(component(vnode.props));
  }
  return [vnode, ...flat(vnode.props.children as ComponentChild)];
}
const wordsOf = (node: ComponentChild): string =>
  Array.isArray(node)
    ? node.map(wordsOf).join('')
    : typeof node === 'string' || typeof node === 'number'
      ? String(node)
      : typeof node === 'object' && node !== null && 'props' in node
        ? wordsOf((node as VNode<Record<string, unknown>>).props.children as ComponentChild)
        : '';
/** The lines of the card on show, and its Court button when it has one. */
function card() {
  const nodes = flat(MateCard());
  return {
    lines: nodes.filter((v) => v.type === 'p' || v.type === 'figcaption').map(wordsOf),
    button: nodes.find((v) => v.type === 'button' && v.props['aria-keyshortcuts'] === 'C'),
  };
}

beforeEach(() => {
  mode.value = 'play'; // the card is of a body that the player is in
  mate.value = null;
  budOpen.value = false;
  noteOpen.value = null;
  courtHeld.value = false;
});

test('with no body near there is no card', () => {
  expect(flat(MateCard())).toEqual([]);
  expect(mateShown()).toBe(false);
});

test('the card shows the two bodies, whether each is willing, and what the pair lacks', () => {
  const eye = (P.KIND_EYE | (128 << 8) | (128 << 16)) >>> 0;
  const frame = frameOf([{ x: 0 }, { x: 20, flags: WILLING }]);
  const r = frame.creatureBase + P.CREATURE_STRIDE;
  frame.u32[r + P.C_BRAIN] = 3 | (41 << 16);
  frame.u32.set([P.KIND_FILTER, eye, eye], r + P.C_PARTS);
  mate.value = courtship(frame, 0);
  const { lines, button } = card();
  expect(lines).toEqual([
    `${MATE.heading} `,
    MATE.what,
    MATE.you,
    'Length 12.0, width 4.0',
    MATE.noParts,
    'Hidden neurons: 0',
    'Connections: 0',
    MATE.unwilling,
    MATE.other,
    'Length 12.0, width 4.0',
    'mouth, eye',
    'Hidden neurons: 3',
    'Connections: 41',
    MATE.willing,
    MATE.state.apart,
  ]);
  expect(wordsOf(button)).toContain(MATE.court);
});

test('the Court button is held, and it is there only where a court can lead to an exchange', () => {
  const press = (name: string): void => (card().button?.props[name] as () => void)();
  mate.value = courtship(frameOf([{ x: 0 }, { x: 6 }]), 0);
  press('onPointerDown');
  expect(courtHeld.value).toBe(true);
  expect(card().button?.props['aria-pressed']).toBe(true);
  for (const up of ['onPointerUp', 'onPointerCancel', 'onPointerLeave']) {
    press('onPointerDown');
    press(up);
    expect(courtHeld.value, up).toBe(false);
  }
  for (const recs of [
    [{ x: 0, flags: YOUNG }, { x: 6 }],
    [{ x: 0 }, { x: 6, flags: YOUNG }],
    [{ x: 0, flags: DONOR }, { x: 6 }],
    [{ x: 0 }, { x: 6, flags: DONOR }],
  ]) {
    mate.value = courtship(frameOf([{ x: 0 }, { x: 6 }]), 0);
    press('onPointerDown');
    // The button goes while it is down, and it gets no `pointerup`: the court ends with it.
    mate.value = courtship(frameOf(recs), 0);
    expect(courtable()).toBe(false);
    expect(card().button).toBeUndefined();
    expect(card().lines.at(-1)).toBe(MATE.state[mate.value?.state ?? 'apart']);
    expect(courtHeld.value).toBe(false);
  }
});

test('the card steps back for the bud card, and a held court ends with it', () => {
  mate.value = courtship(frameOf([{ x: 0 }, { x: 6 }]), 0);
  courtHeld.value = true;
  budOpen.value = true;
  expect(flat(MateCard())).toEqual([]);
  expect(courtHeld.value).toBe(false);
  budOpen.value = false;
  noteOpen.value = 'bud';
  expect(mateShown()).toBe(false);
  noteOpen.value = null;
  expect(card().lines.at(-1)).toBe(MATE.state.hold);
  // No body near: the card and the court go.
  courtHeld.value = true;
  mate.value = null;
  expect(courtHeld.value).toBe(false);
});
