import { expect, test } from 'vitest';
import {
  GRACE_MS,
  inputToSend,
  manualNow,
  possessedBody,
  steerFromKeys,
  steerToward,
} from '../src/app/input';
import * as P from '../src/protocol';

test('keys map to thrust and turn', () => {
  expect(steerFromKeys({ up: true, left: false, right: false })).toEqual({
    thrust: 1,
    turn: 0,
    active: true,
  });
  expect(steerFromKeys({ up: false, left: true, right: false })).toEqual({
    thrust: 0,
    turn: -1,
    active: true,
  });
  expect(steerFromKeys({ up: true, left: false, right: true })).toEqual({
    thrust: 1,
    turn: 1,
    active: true,
  });
  expect(steerFromKeys({ up: false, left: true, right: true })).toEqual({
    thrust: 0,
    turn: 0,
    active: true,
  });
  expect(steerFromKeys({ up: false, left: false, right: false }).active).toBe(false);
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
  const held = { manual: true, thrust: 1, turn: 0 };
  const idle = { manual: false, thrust: 0, turn: 0 };
  expect(inputToSend(null, idle)).toBeNull();
  expect(inputToSend(null, held)).toEqual(held);
  expect(inputToSend(held, held)).toBeNull();
  expect(inputToSend(held, { manual: true, thrust: 1, turn: 1 })).toEqual({
    manual: true,
    thrust: 1,
    turn: 1,
  });
  expect(inputToSend(held, idle)).toEqual(idle);
  expect(inputToSend(idle, idle)).toBeNull();
});

test('a key held across a possess is posted again, because the worker dropped it', () => {
  const held = { manual: true, thrust: 1, turn: 0 };
  expect(inputToSend(held, held)).toBeNull();
  // The page forgets what it sent on `possessed` and on `died`.
  expect(inputToSend(null, held)).toEqual(held);
});

// A frame with one creature record per entry. `possessed` is a slot.
function frame(
  possessed: number,
  creatures: { slot: number; uid: number; x: number; y: number; heading: number }[],
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
