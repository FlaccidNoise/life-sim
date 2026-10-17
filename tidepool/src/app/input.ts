// What the player's hands ask of the possessed creature. Pure functions: `main.ts` feeds them the
// held keys, the pointer, and the frames, and posts what they return.

import {
  ABILITY_DASH,
  ABILITY_TOXIN,
  C_AGE,
  C_ENERGY,
  C_HEADING,
  C_LENGTH,
  C_SLOT,
  C_UID,
  C_X,
  C_Y,
  CREATURE_STRIDE,
  KIND_FLAGELLUM,
  KIND_TOXIN,
  NO_SLOT,
  type FrameView,
  type Part,
} from '../protocol';

export interface Steer {
  manual: boolean;
  thrust: number;
  turn: number;
  accept: boolean; // the player courts
  abilities: number; // the `ABILITY_` bits held
}
export interface Keys {
  up: boolean;
  left: boolean;
  right: boolean;
  court: boolean;
  dash: boolean;
  toxin: boolean;
}
export const GRACE_MS = 500;
export const STARVING_BELOW = 0.25; // of a full energy store
export const OLD_FROM = 0.9; // of a life

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
  KeyC: 'court',
  Space: 'dash',
  KeyQ: 'toxin',
};

/** The key of a `KeyboardEvent.code` that the body takes: the place of the key, not its letter. */
export function keyOf(code: string): keyof Keys | undefined {
  return KEY_OF[code];
}

/**
 * W or ArrowUp thrusts. A or ArrowLeft turns -1. D or ArrowRight turns +1. Both turn keys cancel. C
 * courts: the body accepts a mate. Space and Q hold the dash and toxin bits, but only
 * those in `has`, the abilities that the body carries (the default is none). `steers`: a key that
 * moves the body is down, and it wins over a held pointer. `active`: any key that the body takes is
 * down, and the input is manual.
 */
export function steerFromKeys(
  k: Keys,
  has = 0,
): {
  thrust: number;
  turn: number;
  accept: boolean;
  abilities: number;
  steers: boolean;
  active: boolean;
} {
  const steers = k.up || k.left || k.right;
  const abilities = ((k.dash ? ABILITY_DASH : 0) | (k.toxin ? ABILITY_TOXIN : 0)) & has;
  return {
    thrust: k.up ? 1 : 0,
    turn: (k.right ? 1 : 0) - (k.left ? 1 : 0),
    accept: k.court,
    abilities,
    steers,
    active: steers || k.court || abilities !== 0,
  };
}

/**
 * The abilities that parts give: a Flagellum a dash, a Toxin gland a cloud. A Jaw gives none: it
 * makes the body's dash a strike.
 */
export function abilitiesOf(parts: Part[]): number {
  let mask = 0;
  for (const { kind } of parts) {
    if (kind === KIND_FLAGELLUM) mask |= ABILITY_DASH;
    else if (kind === KIND_TOXIN) mask |= ABILITY_TOXIN;
  }
  return mask;
}

/** The tick at which each ability is ready again, by the count of the page. */
export interface ReadyAt {
  dash: number;
  toxin: number;
}

/**
 * The counts after a frame at `tick`. The frame does not carry the cooldowns, so the page counts
 * `cooldown` ticks from its own press: each ability in `held`, the mask that the page posts, whose
 * count has ended starts a new one. A hold that outlasts a count fires again in the core. A press by
 * the brain is never in `held`: the page posts no mask while the brain drives.
 */
export function pressCooldowns(
  ready: ReadyAt,
  held: number,
  tick: number,
  cooldown: number,
): ReadyAt {
  const next = (bit: number, at: number): number =>
    held & bit && tick >= at ? tick + cooldown : at;
  return {
    dash: next(ABILITY_DASH, ready.dash),
    toxin: next(ABILITY_TOXIN, ready.toxin),
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
  if (!next.manual) {
    return sent?.manual ? { manual: false, thrust: 0, turn: 0, accept: false, abilities: 0 } : null;
  }
  const same =
    sent?.manual &&
    sent.thrust === next.thrust &&
    sent.turn === next.turn &&
    sent.accept === next.accept &&
    sent.abilities === next.abilities;
  return same ? null : next;
}

/**
 * What a click in Watch at a world point does. It finds the body as `World::pick` of
 * crates/sim/src/control.rs does: the nearest whose centre is within `radius`, and of two at one
 * distance the lower slot. `take` is the uid to possess. A body with under `STARVING_BELOW` of a
 * full store is not handed to the player: it has seconds left. Nor is one that has lived `OLD_FROM`
 * of its life or more, and a body that is both is starving. Null: no body is there.
 */
export function clickOn(
  frame: FrameView,
  x: number,
  y: number,
  radius: number,
): { take: number } | { refuse: 'starving' | 'old' } | null {
  let [best, far, slot] = [-1, radius * radius, Infinity];
  for (let i = 0; i < frame.creatureCount; i++) {
    const r = frame.creatureBase + i * CREATURE_STRIDE;
    const d2 = ((frame.f32[r + C_X] ?? 0) - x) ** 2 + ((frame.f32[r + C_Y] ?? 0) - y) ** 2;
    const s = frame.u32[r + C_SLOT] ?? 0;
    if (d2 < far || (d2 === far && s < slot)) [best, far, slot] = [r, d2, s];
  }
  if (best < 0) return null;
  if ((frame.f32[best + C_ENERGY] ?? 0) < STARVING_BELOW) return { refuse: 'starving' };
  if ((frame.f32[best + C_AGE] ?? 0) >= OLD_FROM) return { refuse: 'old' };
  return { take: frame.u32[best + C_UID] ?? 0 };
}

/**
 * What a `possessed` message with uid 0 tells the player. The worker posts one when a pick finds
 * nothing, when an heir is dead before the pick reaches it, and as the answer to every `release`. A
 * `release` can cross a death and arrive while the death overlay is open: it is not a failed pick.
 */
export function emptyAnswer(
  heirPickWaiting: boolean,
  clickWaiting: boolean,
): 'heir gone' | 'nothing there' | null {
  return heirPickWaiting ? 'heir gone' : clickWaiting ? 'nothing there' : null;
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
