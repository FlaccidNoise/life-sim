// Courting: which body the mate card is about, and what the two still lack for an exchange of
// genes. Pure functions of one frame. The rule is `mate::step` of crates/sim/src/mate.rs: two
// bodies pair when the lower slot of the two has the other as the nearest body that it touches,
// both are full-grown, neither holds a donor, and both accept.

import {
  C_FLAGS,
  C_LENGTH,
  C_SLOT,
  C_WIDTH,
  C_X,
  C_Y,
  CREATURE_STRIDE,
  FLAG_DONOR,
  FLAG_JUVENILE,
  FLAG_WILLING,
  type FrameView,
  type Kin,
} from '../protocol';
import type { Courtship } from '../ui/state';
import { bodyIn } from './kin';

/** The card is about a body within this many of the player's lengths, centre to centre. */
export const REACH = 2.5;

// One body of a frame, as the mate rule reads it.
interface Body {
  slot: number;
  x: number;
  y: number;
  length: number;
  radius: number;
  young: boolean;
}

const bodies = (frame: FrameView): Body[] =>
  Array.from({ length: frame.creatureCount }, (_, i) => {
    const r = frame.creatureBase + i * CREATURE_STRIDE;
    const at = (word: number): number => frame.f32[r + word] ?? 0;
    return {
      slot: frame.u32[r + C_SLOT] ?? 0,
      x: at(C_X),
      y: at(C_Y),
      length: at(C_LENGTH),
      radius: (at(C_LENGTH) + at(C_WIDTH)) / 4, // `creature::radius` of the core
      young: ((frame.u32[r + C_FLAGS] ?? 0) & FLAG_JUVENILE) !== 0,
    };
  });

const apart = (a: Body, b: Body): number => Math.hypot(a.x - b.x, a.y - b.y);
// As the motor of the core: two bodies on one point do not touch.
const touches = (a: Body, b: Body): boolean => apart(a, b) > 0 && apart(a, b) < a.radius + b.radius;

// The nearest body to `me` that `fits`. Of two at one distance, the lower slot.
function nearest(all: Body[], me: Body, fits: (b: Body) => boolean): Body | null {
  let best: Body | null = null;
  for (const b of all) {
    if (b.slot === me.slot || !fits(b)) continue;
    const [far, least] = [apart(me, b), best ? apart(me, best) : Infinity];
    if (far < least || (far === least && best && b.slot < best.slot)) best = b;
  }
  return best;
}

const near = (all: Body[], me: Body, lengths: number, young: boolean): Body | null =>
  nearest(all, me, (b) => b.young === young && apart(me, b) <= lengths * me.length);

/**
 * The nearest full-grown body within `lengths` of the lengths of the body in `slot`, or null: no
 * such body, or the frame does not hold the slot.
 */
export function nearestOther(frame: FrameView, slot: number, lengths: number): Kin | null {
  const all = bodies(frame);
  const me = all.find((b) => b.slot === slot);
  const found = me && near(all, me, lengths, false);
  return found ? bodyIn(frame, found.slot) : null;
}

/**
 * The mate card of the body in `slot`: the nearest full-grown body in reach, or with none the
 * nearest juvenile, and the first thing that the pair still lacks. Null with no body in reach.
 *
 * The accept of each body is its `FLAG_WILLING`. That of the player is the court input while the
 * player's hands hold the body, and the output of its brain while they do not.
 */
export function courtship(frame: FrameView, slot: number, lengths = REACH): Courtship | null {
  const all = bodies(frame);
  const me = all.find((b) => b.slot === slot);
  const it = me && (near(all, me, lengths, false) ?? near(all, me, lengths, true));
  const [you, other] = [bodyIn(frame, slot), it ? bodyIn(frame, it.slot) : null];
  if (!me || !it || !you || !other) return null;
  const has = (kin: Kin, flag: number): boolean => (kin.flags & flag) !== 0;
  const [low, high] = me.slot < it.slot ? [me, it] : [it, me];
  const state = (): Courtship['state'] => {
    if (me.young) return 'ownYoung';
    if (it.young) return 'young';
    if (has(you, FLAG_DONOR)) return 'carry';
    if (has(other, FLAG_DONOR)) return 'otherCarries';
    if (!touches(me, it)) return 'apart';
    if (nearest(all, low, (b) => touches(low, b)) !== high) return 'third';
    if (!has(you, FLAG_WILLING)) return 'hold';
    return has(other, FLAG_WILLING) ? 'chance' : 'refused';
  };
  return { you, other, state: state() };
}

/** The card keeps the answer of a body that refused for this long, in milliseconds. */
export const REFUSAL_MS = 4000;
/** The last refusal: the uid of the body that refused, and when. */
export interface Refusal {
  uid: number;
  at: number;
}

/**
 * The courtship that the card shows at `now`, and the last refusal as it is after this frame. Two
 * bodies that touch push each other apart, so a refusal lasts a moment: it stays on the card for
 * `REFUSAL_MS`, while the body that refused is still the other and the pair lacks only what the
 * player can mend: the two have come apart, a third body is nearer, or the court was let go.
 */
export function lingering(
  found: Courtship | null,
  last: Refusal,
  now: number,
): { shown: Courtship | null; last: Refusal } {
  if (found?.state === 'refused') return { shown: found, last: { uid: found.other.uid, at: now } };
  const kept =
    found !== null &&
    (found.state === 'apart' || found.state === 'third' || found.state === 'hold') &&
    found.other.uid === last.uid &&
    now - last.at < REFUSAL_MS;
  return { shown: kept ? { ...found, state: 'refused' } : found, last };
}
