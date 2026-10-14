import { expect, test } from 'vitest';
import {
  GRACE_MS,
  OLD_FROM,
  STARVING_BELOW,
  clickOn,
  emptyAnswer,
  inputToSend,
  keyOf,
  manualNow,
  possessedBody,
  steerFromKeys,
  steerToward,
} from '../src/app/input';
import * as P from '../src/protocol';
import { REFUSE } from '../src/ui/words/lines';

const NO_KEYS = { up: false, left: false, right: false, court: false };

test('keys map to thrust and turn', () => {
  const moving = { accept: false, steers: true, active: true };
  expect(steerFromKeys({ ...NO_KEYS, up: true })).toEqual({ thrust: 1, turn: 0, ...moving });
  expect(steerFromKeys({ ...NO_KEYS, left: true })).toEqual({ thrust: 0, turn: -1, ...moving });
  expect(steerFromKeys({ ...NO_KEYS, up: true, right: true })).toEqual({
    thrust: 1,
    turn: 1,
    ...moving,
  });
  expect(steerFromKeys({ ...NO_KEYS, left: true, right: true })).toEqual({
    thrust: 0,
    turn: 0,
    ...moving,
  });
  expect(steerFromKeys(NO_KEYS).active).toBe(false);
});

test('holding C sets accept and counts as manual input, and releasing clears it', () => {
  expect(keyOf('KeyC')).toBe('court');
  // The key alone moves nothing, and leaves a held pointer to steer.
  expect(steerFromKeys({ ...NO_KEYS, court: true })).toEqual({
    thrust: 0,
    turn: 0,
    accept: true,
    steers: false,
    active: true,
  });
  expect(steerFromKeys({ ...NO_KEYS, up: true, court: true })).toMatchObject({
    thrust: 1,
    accept: true,
    steers: true,
    active: true,
  });
  expect(steerFromKeys(NO_KEYS)).toMatchObject({ accept: false, active: false });

  // The court goes to the worker when it starts and when it ends, with the steer as it is.
  const swim = { manual: true, thrust: 1, turn: 0, accept: false };
  const court = { ...swim, accept: true };
  expect(inputToSend(swim, court)).toEqual(court);
  expect(inputToSend(court, court)).toBeNull();
  expect(inputToSend(court, swim)).toEqual(swim);
  // The hand-back to the brain carries no court: the brain decides.
  expect(inputToSend(court, { manual: false, thrust: 0, turn: 0, accept: true })).toEqual({
    manual: false,
    thrust: 0,
    turn: 0,
    accept: false,
  });
});

test('a point dead ahead means full thrust and no turn', () => {
  const s = steerToward(100, 100, 0, 12, 200, 100);
  expect(s.turn).toBeCloseTo(0, 5);
  expect(s.thrust).toBeCloseTo(1, 5);
});

test('a point on the +θ side turns positive, and y grows downward', () => {
  // heading 0 faces +x. A point below on screen (larger y) is at a positive angle.
  expect(steerToward(100, 100, 0, 12, 200, 200).turn).toBeGreaterThan(0);
  expect(steerToward(100, 100, 0, 12, 200, 0).turn).toBeLessThan(0);
});

test('turn saturates and wraps the short way round', () => {
  expect(steerToward(100, 100, 0, 12, 100, 300).turn).toBe(1);
  // heading just under PI, target just past -PI: a small positive turn, not a full spin back
  const s = steerToward(100, 100, 3.1, 12, 0, 95);
  expect(s.turn).toBeGreaterThan(0);
  expect(s.turn).toBeLessThan(0.5);
});

test('a near point means gentle thrust, and a point behind means less', () => {
  expect(steerToward(100, 100, 0, 12, 106, 100).thrust).toBeLessThan(0.3);
  const ahead = steerToward(100, 100, 0, 12, 200, 100).thrust;
  const behind = steerToward(100, 100, 0, 12, 0, 100).thrust;
  expect(behind).toBeCloseTo(ahead * 0.3, 5);
});

test('manual holds for the grace period, then the brain takes over', () => {
  expect(manualNow(1000, 1000 + GRACE_MS - 1)).toBe(true);
  expect(manualNow(1000, 1000 + GRACE_MS + 1)).toBe(false);
});

// Added to the six tests of the plan: the rule for what the page posts, and the possessed creature's
// place in a frame.

test('a point on the body turns less, and a point at the centre does not turn', () => {
  // Abeam, where the turn is full from half a body length out.
  expect(steerToward(100, 100, 0, 12, 100, 106).turn).toBe(1);
  expect(steerToward(100, 100, 0, 12, 100, 103).turn).toBeCloseTo(0.5, 5);
  expect(steerToward(100, 100, 0, 12, 100, 100)).toEqual({ thrust: 0, turn: 0 });
});

test('a manual steer is posted when it changes, and the hand-back is posted once', () => {
  const held = { manual: true, thrust: 1, turn: 0, accept: false };
  const idle = { manual: false, thrust: 0, turn: 0, accept: false };
  expect(inputToSend(null, idle)).toBeNull();
  expect(inputToSend(null, held)).toEqual(held);
  expect(inputToSend(held, held)).toBeNull();
  expect(inputToSend(held, { ...held, turn: 1 })).toEqual({ ...held, turn: 1 });
  expect(inputToSend(held, idle)).toEqual(idle);
  expect(inputToSend(idle, idle)).toBeNull();
});

test('a key held across a possess is posted again, because the worker dropped it', () => {
  const held = { manual: true, thrust: 1, turn: 0, accept: false };
  expect(inputToSend(held, held)).toBeNull();
  // The page forgets what it sent on `possessed` and on `died`.
  expect(inputToSend(null, held)).toEqual(held);
});

// A frame with one creature record per entry. `possessed` is a slot.
function frame(
  possessed: number,
  creatures: {
    slot: number;
    uid: number;
    x: number;
    y: number;
    heading: number;
    e?: number;
    age?: number;
  }[],
) {
  const buffer = new ArrayBuffer(4 * (P.FRAME_HEADER_WORDS + creatures.length * P.CREATURE_STRIDE));
  const u32 = new Uint32Array(buffer);
  const f32 = new Float32Array(buffer);
  u32[1] = creatures.length;
  u32[5] = possessed;
  creatures.forEach((c, i) => {
    const r = P.FRAME_HEADER_WORDS + i * P.CREATURE_STRIDE;
    f32[r + P.C_X] = c.x;
    f32[r + P.C_Y] = c.y;
    f32[r + P.C_HEADING] = c.heading;
    f32[r + P.C_LENGTH] = 12;
    f32[r + P.C_ENERGY] = c.e ?? 0.6;
    f32[r + P.C_AGE] = c.age ?? 0.3;
    u32[r + P.C_UID] = c.uid;
    u32[r + P.C_SLOT] = c.slot;
  });
  return P.viewFrame(buffer);
}

test('the possessed creature is found by slot and placed between two frames', () => {
  const other = { slot: 3, uid: 9, x: 0, y: 0, heading: 0 };
  const prev = frame(7, [other, { slot: 7, uid: 40, x: 100, y: 200, heading: 3 }]);
  const cur = frame(7, [other, { slot: 7, uid: 40, x: 104, y: 202, heading: -3 }]);
  const b = possessedBody(prev, cur, 0.5);
  expect(b).toMatchObject({ uid: 40, x: 102, y: 201, length: 12 });
  // From 3 to -3 radians the short way is through PI.
  expect(Math.abs(b?.heading ?? 0)).toBeCloseTo(Math.PI, 1);
});

test('no body when nothing is possessed or the creature is outside the frame', () => {
  const cur = frame(7, [{ slot: 7, uid: 40, x: 104, y: 202, heading: 1 }]);
  expect(possessedBody(null, frame(P.NO_SLOT, []), 1)).toBeNull();
  expect(possessedBody(null, frame(7, []), 1)).toBeNull();
  // Without a previous record, or with another creature in the slot, the body is where `cur` has it.
  expect(possessedBody(null, cur, 0.5)).toMatchObject({ x: 104, y: 202, heading: 1 });
  const reused = frame(7, [{ slot: 7, uid: 39, x: 0, y: 0, heading: 0 }]);
  expect(possessedBody(reused, cur, 0.5)).toMatchObject({ x: 104, y: 202, heading: 1 });
});

test('an empty answer is a lost heir only when the overlay sent a pick', () => {
  expect(emptyAnswer(true, false)).toBe('heir gone');
  expect(emptyAnswer(false, true)).toBe('nothing there');
  // The answer to a `release`, which can arrive while the death overlay is open.
  expect(emptyAnswer(false, false)).toBe(null);
});

test('a click in Watch takes the nearest body within the radius, as the core picks', () => {
  const at = (slot: number, uid: number, x: number, y: number) => ({ slot, uid, x, y, heading: 0 });
  const cur = frame(P.NO_SLOT, [at(5, 50, 100, 100), at(2, 20, 110, 100), at(9, 90, 300, 300)]);
  expect(clickOn(cur, 103, 100, 10)).toEqual({ take: 50 });
  expect(clickOn(cur, 108, 100, 10)).toEqual({ take: 20 });
  // Of two at one distance, the lower slot. A body at the radius is within it.
  expect(clickOn(cur, 105, 100, 10)).toEqual({ take: 20 });
  expect(clickOn(cur, 310, 300, 10)).toEqual({ take: 90 });
  expect(clickOn(cur, 311, 300, 10)).toBeNull();
  expect(clickOn(cur, 200, 200, 10)).toBeNull();
  expect(clickOn(frame(P.NO_SLOT, []), 0, 0, 10)).toBeNull();
});

test('a click on a body with under a quarter of a full store does not take it', () => {
  expect(STARVING_BELOW).toBe(0.25);
  const body = (e: number) => frame(P.NO_SLOT, [{ slot: 1, uid: 7, x: 0, y: 0, heading: 0, e }]);
  expect(clickOn(body(0.24), 1, 1, 10)).toEqual({ refuse: 'starving' });
  expect(clickOn(body(0), 1, 1, 10)).toEqual({ refuse: 'starving' });
  // A body in between is taken as before.
  expect(clickOn(body(0.25), 1, 1, 10)).toEqual({ take: 7 });
  expect(clickOn(body(0.9), 1, 1, 10)).toEqual({ take: 7 });
  // The body under the click is the one that is judged: no fed body behind it is taken for it.
  const two = frame(P.NO_SLOT, [
    { slot: 1, uid: 7, x: 0, y: 0, heading: 0, e: 0.1 },
    { slot: 2, uid: 8, x: 6, y: 0, heading: 0, e: 0.9 },
  ]);
  expect(clickOn(two, 1, 0, 10)).toEqual({ refuse: 'starving' });
});

test('a click on a body that has lived nine tenths of its life does not take it', () => {
  expect(OLD_FROM).toBe(0.9);
  const body = (age: number, e = 0.6) =>
    frame(P.NO_SLOT, [{ slot: 1, uid: 7, x: 0, y: 0, heading: 0, e, age }]);
  expect(clickOn(body(0.95), 1, 1, 10)).toEqual({ refuse: 'old' });
  expect(clickOn(body(1.2), 1, 1, 10)).toEqual({ refuse: 'old' });
  expect(clickOn(body(0.5), 1, 1, 10)).toEqual({ take: 7 });
  expect(clickOn(body(0.89), 1, 1, 10)).toEqual({ take: 7 });
  // A body that is starving and old gets the starving line.
  expect(clickOn(body(0.95, 0.1), 1, 1, 10)).toEqual({ refuse: 'starving' });
  // Every refusal has its line.
  expect(REFUSE.old).toBe('That one is very old. Pick another.');
  expect(REFUSE.starving).toBe('That one is starving. Pick another.');
});
