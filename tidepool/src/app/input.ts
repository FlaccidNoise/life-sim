// What the player's hands ask of the possessed creature. Pure functions: `main.ts` feeds them the
// held keys, the pointer, and the frames, and posts what they return.

import {
  C_HEADING,
  C_LENGTH,
  C_SLOT,
  C_UID,
  C_X,
  C_Y,
  CREATURE_STRIDE,
  NO_SLOT,
  type FrameView,
} from '../protocol';

export interface Steer {
  manual: boolean;
  thrust: number;
  turn: number;
}
export interface Keys {
  up: boolean;
  left: boolean;
  right: boolean;
}
export const GRACE_MS = 500;

const TAU = 2 * Math.PI;
const TURN_FULL = 0.5; // radians off the heading at which the turn is full
const THRUST_FULL = 4; // body lengths to the point at which the thrust is full
const THRUST_BEHIND = 0.3; // the share of the thrust left when the point is behind
const TURN_REACH = 0.5; // body lengths to the point below which the turn fades to nothing

const KEY_OF: Record<string, keyof Keys> = {
  KeyW: 'up',
  ArrowUp: 'up',
  KeyA: 'left',
  ArrowLeft: 'left',
  KeyD: 'right',
  ArrowRight: 'right',
};

/** The steering key of a `KeyboardEvent.code`: the place of the key, not its letter. */
export function keyOf(code: string): keyof Keys | undefined {
  return KEY_OF[code];
}

/** W or ArrowUp thrusts. A or ArrowLeft turns -1. D or ArrowRight turns +1. Both turn keys cancel. */
export function steerFromKeys(k: Keys): { thrust: number; turn: number; active: boolean } {
  return {
    thrust: k.up ? 1 : 0,
    turn: (k.right ? 1 : 0) - (k.left ? 1 : 0),
    active: k.up || k.left || k.right,
  };
}

/**
 * Steer toward a world point. `heading` in radians. Turn is proportional to the angle between the
 * heading and the direction to the point, saturating at 0.5 radians. Thrust rises with distance up to
 * 4 body lengths, and drops to 0.3 of that when the point is behind the creature. A point on the
 * body gives less turn, down to none at the centre: without that the body spins on the point.
 */
export function steerToward(
  cx: number,
  cy: number,
  heading: number,
  length: number,
  px: number,
  py: number,
): { thrust: number; turn: number } {
  const off = Math.atan2(py - cy, px - cx) - heading;
  const angle = off - TAU * Math.round(off / TAU); // the short way round
  const lengths = Math.hypot(px - cx, py - cy) / length;
  // The thrust falls with the cosine from dead ahead to abeam, so it has no step at any angle.
  const facing = THRUST_BEHIND + (1 - THRUST_BEHIND) * Math.max(Math.cos(angle), 0);
  return {
    thrust: Math.min(lengths / THRUST_FULL, 1) * facing,
    turn: Math.min(Math.max(angle / TURN_FULL, -1), 1) * Math.min(lengths / TURN_REACH, 1),
  };
}

/** Manual stays true for GRACE_MS after the last active input, then hands over to the brain. */
export function manualNow(lastActiveMs: number, nowMs: number): boolean {
  return nowMs - lastActiveMs < GRACE_MS;
}

/**
 * The `input` message that `next` needs, or null for none. `sent` is the last one posted in this
 * possession, or null for none yet: the worker drops its held input on every possess, release, and
 * death, so the caller forgets `sent` there. A manual steer goes out when it differs from `sent`.
 * A steer that is not manual goes out once, after a manual one.
 */
export function inputToSend(sent: Steer | null, next: Steer): Steer | null {
  if (!next.manual) return sent?.manual ? { manual: false, thrust: 0, turn: 0 } : null;
  const same = sent?.manual && sent.thrust === next.thrust && sent.turn === next.turn;
  return same ? null : next;
}

/** The possessed creature as the renderer draws it. */
export interface Body {
  uid: number;
  x: number;
  y: number;
  heading: number;
  length: number;
}

// The word index of the record of `slot`, or -1 when the frame does not hold it.
function recordOf(frame: FrameView, slot: number): number {
  for (let i = 0; i < frame.creatureCount; i++) {
    const r = frame.creatureBase + i * CREATURE_STRIDE;
    if (frame.u32[r + C_SLOT] === slot) return r;
  }
  return -1;
}

/**
 * The possessed creature of `cur`, moved back toward its place in `prev` by (1 - alpha): the same
 * rule as `draw` in src/render/renderer.ts. Null when nothing is possessed, or when the creature is
 * outside the view of the frame.
 */
export function possessedBody(prev: FrameView | null, cur: FrameView, alpha: number): Body | null {
  if (cur.possessedSlot === NO_SLOT) return null;
  const r = recordOf(cur, cur.possessedSlot);
  if (r < 0) return null;
  const uid = cur.u32[r + C_UID] ?? 0;
  let x = cur.f32[r + C_X] ?? 0;
  let y = cur.f32[r + C_Y] ?? 0;
  let heading = cur.f32[r + C_HEADING] ?? 0;
  const q = prev ? recordOf(prev, cur.possessedSlot) : -1;
  // A slot with another uid holds another creature: it is not interpolated.
  if (prev && q >= 0 && prev.u32[q + C_UID] === uid) {
    const px = prev.f32[q + C_X] ?? x;
    const py = prev.f32[q + C_Y] ?? y;
    const pHeading = prev.f32[q + C_HEADING] ?? heading;
    x = px + (x - px) * alpha;
    y = py + (y - py) * alpha;
    const turn = heading - pHeading;
    heading = pHeading + (turn - TAU * Math.round(turn / TAU)) * alpha;
  }
  return { uid, x, y, heading, length: cur.f32[r + C_LENGTH] ?? 0 };
}
