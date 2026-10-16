import { afterEach, expect, test, vi } from 'vitest';
import {
  BEATS,
  begin,
  firstBite,
  huntFacts,
  leadsDeath,
  split,
  step,
  wiringChanges,
  type BeatId,
  type Facts,
  type Walk,
} from '../src/app/walkthrough';
import { loadWalk, note, saveWalk } from '../src/app/walkstore';
import {
  C_DIET,
  C_FLAGS,
  C_PARTS,
  C_SLOT,
  CREATURE_STRIDE,
  FLAG_DASH,
  FLAG_HURT,
  FLAG_POSSESSED,
  FRAME_HEADER_WORDS,
  KIND_FILTER,
  KIND_JAW,
  NO_SLOT,
  viewFrame,
  type BrainConn,
  type BrainNeuron,
  type BrainView,
  type FrameView,
  type Kill,
} from '../src/protocol';
import { LINE } from '../src/ui/words/lines';

const DT = 0.05;
const WATCH: Facts = {
  mode: 'watch',
  manual: false,
  panelOpen: false,
  dead: false,
  first: false,
  uid: 0,
  energy01: 0.3,
  lengthsMoved: 0,
  lengthsAlone: 0,
  buds: 0,
  lineageAlive: 1,
  split: 0,
  busy: false,
  card: false,
  courted: false,
  huntersInView: 0,
  killInView: 0,
  bitten: false,
};
// In a body, hands off. `STEER` is the same body under the player's hands.
const PLAY: Facts = { ...WATCH, mode: 'play', uid: 7 };
const STEER: Facts = { ...PLAY, manual: true };

interface Seen {
  t: number;
  line: string | null;
  pulse: 'brain' | 'score' | null;
  mark: boolean;
}

/** Steps `walk` for `seconds` with the facts that `at` gives for each time. */
function run(
  walk: Walk,
  at: Facts | ((t: number) => Facts),
  seconds: number,
): { walk: Walk; seen: Seen[] } {
  const seen: Seen[] = [];
  for (let i = 0; i < Math.round(seconds / DT); i++) {
    const t = i * DT;
    const out = step(walk, typeof at === 'function' ? at(t) : at, DT);
    walk = out.walk;
    seen.push({ t, line: out.line, pulse: out.pulse, mark: out.mark });
  }
  return { walk, seen };
}

const lines = (seen: Seen[]): (string | null)[] => seen.map((s) => s.line);
/** The seconds for which `line` was on the screen. */
const secondsOf = (seen: Seen[], line: string): number =>
  seen.filter((s) => s.line === line).length * DT;
/** How many separate times `line` came onto the screen. */
const showings = (seen: Seen[], line: string): number =>
  seen.filter((s, i) => s.line === line && seen[i - 1]?.line !== line).length;
const past = (...done: BeatId[]): Walk => begin(done);
// One meal: the energy is higher on one frame.
const meal =
  (facts: Facts, at: number) =>
  (t: number): Facts => ({ ...facts, energy01: t >= at ? 0.35 : 0.3 });

test('beat 1: the line stands in Watch until a body is possessed', () => {
  const watched = run(begin(), WATCH, 30);
  expect(new Set(lines(watched.seen))).toEqual(new Set([LINE.possess]));
  expect(watched.walk.done).toEqual([]);
  const played = run(watched.walk, PLAY, 1);
  expect(played.walk.done).toContain('possess');
  expect(lines(played.seen)).not.toContain(LINE.possess);
  // Back in Watch, it shows again: it is the way in.
  expect(new Set(lines(run(played.walk, WATCH, 30).seen))).toEqual(new Set([LINE.possess]));
  expect(run(played.walk, WATCH, 30).walk.done).toContain('possess');
});

test('beat 1: the line is not under the death overlay', () => {
  expect(step(begin(), { ...WATCH, dead: true }, DT).line).toBeNull();
});

test('beat 2: how to move shows after 4 seconds with no input, and leaves on input', () => {
  const idle = run(past('possess'), PLAY, 5);
  expect(idle.seen.find((s) => s.line !== null)?.t).toBeCloseTo(4, 0);
  expect(idle.seen.at(-1)?.line).toBe(LINE.move);
  const moved = run(idle.walk, STEER, 1);
  expect(lines(moved.seen)).toEqual(lines(moved.seen).map(() => null));
  expect(moved.walk.done).not.toContain('move');
  expect(step(moved.walk, { ...STEER, lengthsMoved: 3 }, DT).walk.done).toContain('move');
});

test('beat 2: a player who moves at once never sees how to move', () => {
  const { walk, seen } = run(
    past('possess'),
    (t) => ({ ...STEER, lengthsMoved: t, manual: t < 4 }),
    30,
  );
  expect(walk.done).toContain('move');
  expect(lines(seen)).not.toContain(LINE.move);
});

test('beat 3: a meal under the hands of the player shows "Green is food." once, for 6 seconds', () => {
  const { walk, seen } = run(past('possess', 'move'), meal(STEER, 2), 12);
  expect(seen.find((s) => s.line !== null)?.t).toBeCloseTo(2, 0);
  expect(secondsOf(seen, LINE.eat)).toBeCloseTo(6, 0);
  expect(walk.done).toContain('eat');
  // The next meal shows nothing.
  expect(lines(run(walk, meal(STEER, 2), 12).seen)).not.toContain(LINE.eat);
});

test('beat 3: a meal while the brain drives is not the meal of the player', () => {
  const { walk, seen } = run(past('possess', 'move'), meal(PLAY, 2), 3);
  expect(lines(seen)).not.toContain(LINE.eat);
  expect(walk.done).not.toContain('eat');
});

test('beat 3: the higher energy of another body is not a meal', () => {
  const at = (t: number): Facts => (t < 1 ? STEER : { ...STEER, uid: 8, energy01: 0.9 });
  expect(run(past('possess', 'move', 'halfRing'), at, 3).walk.done).not.toContain('eat');
  // Nor is the energy of a frame that does not hold the body.
  const away = (t: number): Facts =>
    t < 1 ? STEER : t < 2 ? { ...STEER, uid: 0, energy01: 0 } : STEER;
  expect(run(past('possess', 'move'), away, 3).walk.done).not.toContain('eat');
});

// Hands off: the brain swims the body, a length in 2 seconds.
const swims = (t: number): Facts => ({ ...PLAY, lengthsAlone: t / 2 });

test('beat 4: after the first meal, the body swims a length with no input and the line names it', () => {
  const start = past('possess', 'move', 'eat', 'halfRing');
  const { walk, seen } = run(start, swims, 12);
  expect(seen.find((s) => s.line !== null)?.t).toBeCloseTo(2, 0);
  expect(secondsOf(seen, LINE.letGo)).toBeCloseTo(6, 0);
  expect(walk.done).toContain('letGo');
  // Not before the first meal of the player, and not while the body has not swum a length.
  expect(lines(run(past('possess', 'move'), swims, 12).seen)).not.toContain(LINE.letGo);
  const still: Facts = { ...PLAY, lengthsAlone: 0.9, energy01: 0.45 };
  expect(lines(run(start, still, 12).seen)).not.toContain(LINE.letGo);
});

test('beat 4: it is done by 3 seconds with no input, and input before that leaves it open', () => {
  const start = past('possess', 'move', 'eat', 'halfRing');
  const grabbed = run(start, (t) => (t < 4 ? swims(t) : STEER), 6);
  expect(secondsOf(grabbed.seen, LINE.letGo)).toBeCloseTo(2, 0);
  expect(grabbed.walk.done).not.toContain('letGo');
  expect(grabbed.walk.shown.letGo).toBe(1);
  const held = run(start, (t) => (t < 5.2 ? swims(t) : STEER), 6);
  expect(held.walk.done).toContain('letGo');
});

test('beat 5: the Brain button pulses when beat 4 is done and its line has left', () => {
  const { walk, seen } = run(past('possess', 'move', 'eat', 'halfRing'), swims, 16);
  const first = seen.findIndex((s) => s.pulse === 'brain');
  expect(seen[first]?.t).toBeCloseTo(8, 0);
  expect(seen[first - 1]?.line).toBe(LINE.letGo);
  expect(seen.filter((s) => s.pulse === 'brain' && s.line !== null)).toEqual([]);
  expect(walk.done).not.toContain('openBrain');
});

test('beat 5: the pulse stops when the panel opens, and 5 seconds of the panel are the beat', () => {
  const start = past('possess', 'move', 'eat', 'halfRing', 'letGo');
  const { walk, seen } = run(start, (t) => ({ ...PLAY, panelOpen: t >= 2 }), 8);
  expect(seen.filter((s) => s.pulse === 'brain').at(-1)?.t).toBeLessThan(2);
  expect(walk.done).toContain('openBrain');
  expect(run(start, (t) => ({ ...PLAY, panelOpen: t >= 2 }), 6).walk.done).not.toContain(
    'openBrain',
  );
  // A player who opened the panel before the pulse has done the beat too.
  const early = run(past('possess'), { ...STEER, panelOpen: true }, 6);
  expect(early.walk.done).toContain('openBrain');
  expect(early.seen.every((s) => s.pulse === null)).toBe(true);
});

const AGAINST: Facts = { ...STEER, panelOpen: true, split: 0.8 };

test('beat 6: steering against the brain with the panel open is named, and 1 second is the beat', () => {
  const start = past('possess', 'move', 'openBrain');
  const { walk, seen } = run(start, (t) => (t < 2 ? { ...AGAINST, split: 0.2 } : AGAINST), 4);
  expect(seen.find((s) => s.line !== null)?.t).toBeCloseTo(2, 0);
  expect(seen.at(-1)?.line).toBe(LINE.disagree);
  expect(walk.done).toContain('disagree');
  // Half a second apart is a showing, and the beat is still open.
  const brief = run(start, (t) => (t < 0.5 ? AGAINST : { ...AGAINST, split: 0 }), 4);
  expect(brief.walk.shown.disagree).toBe(1);
  expect(brief.walk.done).not.toContain('disagree');
  // With the panel closed, or with the hands off, there are no two marks.
  for (const facts of [
    { ...AGAINST, panelOpen: false },
    { ...AGAINST, manual: false },
  ]) {
    expect(lines(run(start, facts, 4).seen)).not.toContain(LINE.disagree);
  }
});

test('beat 7: 20 seconds of the panel show the changes line, with no line at the foot', () => {
  const start = past('possess', 'move', 'openBrain', 'disagree');
  const open: Facts = { ...PLAY, panelOpen: true };
  const before = run(start, open, 19);
  expect(before.walk.done).not.toContain('noChange');
  const after = run(before.walk, open, 2);
  expect(after.walk.done).toContain('noChange');
  expect([...before.seen, ...after.seen].every((s) => s.line === null && s.pulse === null)).toBe(
    true,
  );
  // The seconds are of the panel, open or shut between.
  const shut = run(before.walk, PLAY, 30);
  expect(shut.walk.done).not.toContain('noChange');
  expect(run(shut.walk, open, 2).walk.done).toContain('noChange');
});

test('beat 8a: half a ring is named after the first meal, once', () => {
  const half: Facts = { ...STEER, energy01: 0.5 };
  expect(lines(run(past('possess', 'move'), half, 8).seen)).not.toContain(LINE.halfRing);
  const { walk, seen } = run(past('possess', 'move', 'eat'), half, 8);
  expect(seen[0]?.line).toBe(LINE.halfRing);
  expect(walk.done).toContain('halfRing');
  expect(lines(run(walk, half, 30).seen)).not.toContain(LINE.halfRing);
  const low = run(past('possess', 'move', 'eat'), { ...STEER, energy01: 0.49 }, 8);
  expect(lines(low.seen)).not.toContain(LINE.halfRing);
});

test('beat 8b: the first bud is recorded', () => {
  expect(step(past('possess'), PLAY, DT).walk.done).not.toContain('bud');
  expect(step(past('possess'), { ...PLAY, buds: 1 }, DT).walk.done).toContain('bud');
});

test('beat 9: the second bud shows the score line and pulses the counter, once', () => {
  // `lineageAlive` counts the body of the player: the counter shows one less.
  const one = run(past('possess', 'move'), { ...PLAY, buds: 1, lineageAlive: 2 }, 8);
  expect(one.seen.every((s) => s.line === null && s.pulse === null)).toBe(true);
  const two = run(one.walk, { ...PLAY, buds: 2, lineageAlive: 3 }, 8);
  expect(two.seen[0]).toMatchObject({ line: LINE.score, pulse: 'score' });
  expect(two.seen.filter((s) => (s.line === LINE.score) !== (s.pulse === 'score'))).toEqual([]);
  expect(two.walk.done).toContain('score');
  const three = { ...PLAY, buds: 3, lineageAlive: 4 };
  expect(lines(run(two.walk, three, 30).seen)).not.toContain(LINE.score);
});

test('beat 9: the line waits for a counter that shows 2 or more', () => {
  // The second bud, and the first child has died: the counter shows 1.
  const thin = run(past('possess', 'move'), { ...PLAY, buds: 2, lineageAlive: 2 }, 8);
  expect(thin.seen.every((s) => s.line === null && s.pulse === null)).toBe(true);
  expect(thin.walk.done).not.toContain('score');
  // A full line that the body came with is not a second bud of the player.
  const came = run(past('possess', 'move'), { ...PLAY, buds: 1, lineageAlive: 9 }, 8);
  expect(lines(came.seen)).not.toContain(LINE.score);
});

test('beat 9: the death of a descendant shows no line: its cause is off the screen', () => {
  const at = (t: number): Facts => ({ ...PLAY, buds: 1, lineageAlive: t < 2 ? 2 : 1 });
  const { walk, seen } = run(past('possess', 'move'), at, 30);
  expect(seen.every((s) => s.line === null && s.pulse === null)).toBe(true);
  expect(walk.done).not.toContain('score');
});

test('beat 10: with no mate card it does not arm', () => {
  const busyLife = (t: number): Facts => ({
    ...PLAY,
    manual: t % 10 < 5,
    panelOpen: t % 20 < 10,
    energy01: (t % 7) / 7,
    lengthsMoved: t,
    lengthsAlone: t % 5,
    buds: Math.floor(t / 30),
    split: (t % 3) / 1.5,
  });
  const { walk } = run(begin(), busyLife, 200);
  expect(walk.done).not.toContain('court');
  expect(walk.shown.court).toBeUndefined();
  // The card is of a body that the player is in.
  expect(run(begin(), { ...WATCH, card: true }, 5).walk.shown.court).toBeUndefined();
});

test('beat 10: it arms when the mate card first shows, with no line, and the card does not use it up', () => {
  const near = run(past('possess', 'move'), { ...PLAY, card: true }, 30);
  expect(near.walk.shown.court).toBe(1);
  expect(near.walk.done).not.toContain('court');
  expect(near.seen.every((s) => s.line === null && s.pulse === null)).toBe(true);
  // The card comes and goes with the bodies near: it is one showing.
  const gone = run(near.walk, PLAY, 5);
  expect(run(gone.walk, { ...PLAY, card: true }, 30).walk.shown.court).toBe(1);
});

test('beat 10: one courtship, accepted or refused, shows its line once and is the beat', () => {
  const near = run(past('possess', 'move'), { ...PLAY, card: true }, 5);
  const courted = run(near.walk, { ...PLAY, card: true, courted: true }, 30);
  expect(courted.walk.done).toContain('court');
  expect(showings(courted.seen, LINE.court)).toBe(1);
  expect(courted.seen[0]?.line).toBe(LINE.court);
  expect(secondsOf(courted.seen, LINE.court)).toBeCloseTo(6, 0);
  // A second courtship, in this body or the next, shows nothing.
  const again = run(begin(courted.walk.done, courted.walk.shown), { ...PLAY, courted: true }, 30);
  expect(again.seen.every((s) => s.line === null)).toBe(true);
});

test('beat 10: its line waits for the line of the exchange to leave, and the beat with it', () => {
  const near = run(past('possess', 'move'), { ...PLAY, card: true }, 1);
  const toast = run(near.walk, { ...PLAY, card: true, courted: true, busy: true }, 3);
  expect(toast.seen.every((s) => s.line === null)).toBe(true);
  expect(toast.walk.done).not.toContain('court');
  const after = run(toast.walk, { ...PLAY, card: true, courted: true }, 1);
  expect(after.seen[0]?.line).toBe(LINE.court);
  expect(after.walk.done).toContain('court');
});

test('beat 12: the first death is recorded, and the pick of an heir is the beat', () => {
  const died = run(past('possess'), { ...WATCH, dead: true, first: true }, 2);
  expect(died.walk.shown.firstDeath).toBe(1);
  expect(died.walk.done).not.toContain('firstDeath');
  expect(died.seen.every((s) => s.line === null && s.pulse === null)).toBe(true);
  expect(run(died.walk, WATCH, 1).walk.done).not.toContain('firstDeath');
  expect(run(died.walk, { ...PLAY, uid: 8 }, 1).walk.done).toContain('firstDeath');
});

test('beat 12: the overlay leads with the line after a life of 20 seconds that leaves an heir', () => {
  const walk = past('possess');
  expect(leadsDeath(walk, 20, 1)).toBe(true);
  expect(leadsDeath(walk, 300, 5)).toBe(true);
  // A life that the player has not lived, and a line that has ended, get the plain layout.
  expect(leadsDeath(walk, 19.9, 1)).toBe(false);
  expect(leadsDeath(walk, 0.1, 3)).toBe(false);
  expect(leadsDeath(walk, 300, 0)).toBe(false);
  // Once: the player has gone on as an heir of a death that led with the line.
  expect(leadsDeath(past('possess', 'firstDeath'), 300, 5)).toBe(false);
});

test('beat 12: a death with the plain layout does not use up the beat', () => {
  // A life of a second: the overlay is plain, and the player goes on as an heir.
  const short = run(past('possess'), { ...WATCH, dead: true }, 2);
  expect(short.walk.shown.firstDeath).toBeUndefined();
  const heir = run(short.walk, { ...PLAY, uid: 8 }, 1);
  expect(heir.walk.done).not.toContain('firstDeath');
  // The next death, of a life that was lived, is the first death.
  expect(leadsDeath(heir.walk, 60, 2)).toBe(true);
  const died = run(heir.walk, { ...WATCH, dead: true, first: true }, 2);
  expect(died.walk.shown.firstDeath).toBe(1);
  expect(run(died.walk, { ...PLAY, uid: 9 }, 1).walk.done).toContain('firstDeath');
});

// Beat 11: docs/plans/2026-10-14-m4-teeth.md, Task 14 and choice C10 option A. Draw only: the first
// kill in view in a life marks the killer and the place, and the log keeps what came first.
const JAW = KIND_JAW | (128 << 16);
const MOUTH = KIND_FILTER | (128 << 16);

/** A frame of `bodies`, with the body in slot `possessed` the player's, and `kills` in view. */
function frameOf(
  bodies: { slot: number; flags?: number; parts?: number[]; diet?: number }[],
  possessed: number,
  kills: Kill[] = [],
): FrameView {
  const u32 = new Uint32Array(FRAME_HEADER_WORDS + bodies.length * CREATURE_STRIDE);
  const f32 = new Float32Array(u32.buffer);
  [u32[1], u32[5]] = [bodies.length, possessed];
  bodies.forEach((body, i) => {
    const r = FRAME_HEADER_WORDS + i * CREATURE_STRIDE;
    [u32[r + C_SLOT], u32[r + C_FLAGS]] = [body.slot, body.flags ?? 0];
    f32[r + C_DIET] = body.diet ?? 0;
    (body.parts ?? []).forEach((word, k) => (u32[r + C_PARTS + k] = word));
  });
  return { ...viewFrame(u32.buffer), kills };
}

test('beat 11: the frame gives the hunters in view, the kills by others, and a hit on the player', () => {
  const none = frameOf(
    [
      { slot: 1, parts: [MOUTH] },
      { slot: 2, parts: [MOUTH] },
    ],
    1,
  );
  expect(huntFacts(none)).toEqual({ huntersInView: 0, killInView: 0, bitten: false });
  // Slot 5 has a jaw and eats plants: its jaw bites nothing, so it is no hunter (rule D1).
  const bodies = [
    { slot: 1, parts: [MOUTH, JAW], flags: FLAG_POSSESSED, diet: 0.8 },
    { slot: 2, parts: [MOUTH] },
    { slot: 3, parts: [MOUTH, 0, JAW, JAW], diet: 0.5 },
    { slot: 4, parts: [JAW], flags: FLAG_HURT, diet: 0.9 },
    { slot: 5, parts: [MOUTH, JAW], diet: 0.1 },
  ];
  const kills = [
    { x: 1, y: 2, killerSlot: 3 },
    { x: 5, y: 5, killerSlot: 1 },
  ];
  // The jaw and the kill of the player's own body are not a hunter seen, and a hit on another body
  // is not a bite on the player.
  expect(huntFacts(frameOf(bodies, 1, kills))).toEqual({
    huntersInView: 2,
    killInView: 1,
    bitten: false,
  });
  // In Watch every body with a jaw that does not eat plants is a hunter in view, and every kill is
  // by another.
  expect(huntFacts(frameOf(bodies, NO_SLOT, kills))).toEqual({
    huntersInView: 3,
    killInView: 2,
    bitten: false,
  });
});

test('beat 11: a hit on the body of the player is a bite on it, and a dash is not', () => {
  const hit = frameOf([{ slot: 1, flags: FLAG_POSSESSED | FLAG_HURT }], 1);
  expect(huntFacts(hit).bitten).toBe(true);
  const dashed = frameOf([{ slot: 1, flags: FLAG_POSSESSED | FLAG_DASH }], 1);
  expect(huntFacts(dashed).bitten).toBe(false);
});

const HUNTED: Facts = { ...PLAY, huntersInView: 1 };
const KILL: Facts = { ...HUNTED, killInView: 1 };
const marks = (seen: Seen[]): number[] => seen.filter((s) => s.mark).map((s) => s.t);

test('beat 11: a life with no hunter in view has no mark, and the log says no hunter was seen', () => {
  // Nothing to say before a life.
  expect(firstBite(run(begin(), WATCH, 10).walk)).toBeUndefined();
  const { walk, seen } = run(past('possess'), PLAY, 30);
  expect(marks(seen)).toEqual([]);
  expect(firstBite(walk)).toBe('no hunter seen');
  // A hunter in view, and no bite yet: nothing to say.
  expect(firstBite(run(walk, HUNTED, 1).walk)).toBeUndefined();
});

test('beat 11: a bite before any hunter in view is "bitten first", and the first bite holds', () => {
  const { walk, seen } = run(past('possess'), { ...PLAY, bitten: true }, 1);
  expect(marks(seen)).toEqual([]);
  expect(firstBite(walk)).toBe('bitten first');
  // A hunter seen after it, and a kill, change nothing in the log.
  const later = run(walk, { ...KILL, bitten: true }, 5);
  expect(firstBite(later.walk)).toBe('bitten first');
  // A hunter in view and a bite on one frame: the hunter was not seen before the bite.
  expect(firstBite(step(past('possess'), { ...HUNTED, bitten: true }, DT).walk)).toBe(
    'bitten first',
  );
});

test('beat 11: the first kill in view marks once, and the log keeps the seconds of hunters before the bite', () => {
  // Hunters in view for 3.5 seconds, a kill among them at 3, none for 1.5, then 1 more second.
  const hunt = (t: number): Facts =>
    t < 3 ? HUNTED : t < 3.5 ? KILL : t < 5 ? PLAY : { ...HUNTED, bitten: t >= 6 };
  const { walk, seen } = run(past('possess'), hunt, 8);
  expect(marks(seen)).toHaveLength(1);
  expect(marks(seen)[0]).toBeCloseTo(3, 5);
  // No text: the mark is drawn, and no line shows with it.
  expect(seen.find((s) => s.mark)?.line).toBeNull();
  expect(firstBite(walk)).toBe(4.5);
});

test('beat 11: one mark in a life, and the life of an heir marks again', () => {
  const one = run(past('possess'), (t) => (t < 1 || t >= 2 ? KILL : PLAY), 4);
  expect(marks(one.seen)).toHaveLength(1);
  const heir = run(one.walk, { ...KILL, uid: 8 }, 2);
  expect(marks(heir.seen)).toHaveLength(1);
  // No life, no mark: Watch, and under the death overlay.
  expect(marks(run(past('possess'), { ...WATCH, killInView: 2 }, 2).seen)).toEqual([]);
  expect(marks(run(past('possess'), { ...KILL, dead: true }, 2).seen)).toEqual([]);
});

test('beat 11: a hunter in view under the death overlay is not counted', () => {
  // After a death the camera goes to the killer.
  const died = run(past('possess'), { ...WATCH, dead: true, huntersInView: 3 }, 5);
  expect(died.walk.hunted).toBe(0);
  // In Watch a hunter on the screen is seen.
  expect(run(past('possess'), { ...WATCH, huntersInView: 1 }, 2).walk.hunted).toBeCloseTo(2, 5);
});

// A whole first life, with every beat in it.
const life = (t: number): Facts => {
  if (t < 5) return WATCH;
  const facts: Facts = {
    ...PLAY,
    manual: (t >= 10 && t < 30) || (t >= 70 && t < 80),
    lengthsMoved: Math.max(t - 10, 0),
    lengthsAlone: t >= 30 && t < 70 ? t - 30 : 0,
    energy01: 0.3 + (t >= 20 ? 0.05 : 0) + (t >= 33 ? 0.05 : 0) + (t >= 90 ? 0.2 : 0),
    panelOpen: t >= 50 && t < 100,
    split: t >= 70 && t < 80 ? 1 : 0,
    buds: t >= 120 ? 2 : t >= 110 ? 1 : 0,
    lineageAlive: t >= 120 ? 3 : t >= 110 ? 2 : 1,
    busy: (t >= 110 && t < 113) || (t >= 120 && t < 123), // the toast of a bud
    card: t >= 128 && t < 138,
    courted: t >= 132,
  };
  if (t < 140) return facts;
  return t < 145 ? { ...WATCH, dead: true, first: true } : { ...facts, uid: 8, buds: 0 };
};

test('a first life does every beat', () => {
  const { walk } = run(begin(), life, 150);
  expect([...walk.done].sort()).toEqual([...BEATS].sort());
});

test('a done beat never shows again', () => {
  const first = run(begin(), life, 150);
  const again = run(begin(first.walk.done, first.walk.shown), life, 150);
  // But for the way in, which a player who has been here before still needs in Watch.
  const quiet = (s: Seen): boolean => (s.line === null || s.line === LINE.possess) && !s.pulse;
  expect(again.seen.every(quiet)).toBe(true);
  expect({ ...again.walk.shown, possess: 0 }).toEqual({ ...first.walk.shown, possess: 0 });
});

test('an ignored beat retires after two showings', () => {
  // How to move, and a player who never moves.
  const idle = run(past('possess'), PLAY, 300);
  expect(showings(idle.seen, LINE.move)).toBe(2);
  expect(secondsOf(idle.seen, LINE.move)).toBeCloseTo(12, 0);
  expect(idle.walk.shown.move).toBe(2);
  expect(idle.walk.done).not.toContain('move');
  // It stays retired in the next visit.
  const next = run(begin(idle.walk.done, idle.walk.shown), PLAY, 300);
  expect(lines(next.seen)).not.toContain(LINE.move);

  // The pulse on the Brain button, and a player who never opens the panel.
  const shut = run(past('possess', 'move', 'eat', 'halfRing', 'letGo'), PLAY, 300);
  expect(shut.seen.filter((s, i) => s.pulse === 'brain' && !shut.seen[i - 1]?.pulse)).toHaveLength(
    2,
  );
});

test('the second showing of a beat waits', () => {
  const { seen } = run(past('possess'), PLAY, 300);
  const starts = seen.filter((s, i) => s.line === LINE.move && seen[i - 1]?.line !== LINE.move);
  expect((starts[1]?.t ?? 0) - (starts[0]?.t ?? 0)).toBeGreaterThan(20);
});

test('a beat that shows between the two showings of another does not shorten its wait', () => {
  // The pulse, then half a ring at 7 seconds, then the pulse again: not before 26 seconds.
  const start = past('possess', 'move', 'eat', 'letGo');
  const { seen } = run(start, (t) => ({ ...PLAY, energy01: t < 7 ? 0.3 : 0.6 }), 40);
  const pulses = seen.filter((s, i) => s.pulse === 'brain' && !seen[i - 1]?.pulse);
  expect(lines(seen)).toContain(LINE.halfRing);
  expect(pulses.map((s) => Math.round(s.t))).toEqual([0, 26]);
});

test('a retired beat does not hold back the beats after it', () => {
  // Beat 4 retired with its line unread: the Brain button still pulses.
  const start = begin(['possess', 'move', 'eat', 'halfRing'], { letGo: 2 });
  expect(run(start, PLAY, 8).seen.some((s) => s.pulse === 'brain')).toBe(true);
});

test('no two lines show at once, and a breath lies between two lines', () => {
  const { seen } = run(begin(), life, 150);
  const all = new Set<string | null>([...Object.values(LINE), null]);
  for (const s of seen) {
    expect(all.has(s.line)).toBe(true);
    // A pulse comes alone, but for the pulse of the counter under its own line.
    if (s.pulse === 'brain') expect(s.line).toBeNull();
    if (s.pulse === 'score') expect(s.line).toBe(LINE.score);
  }
  seen.forEach((s, i) => {
    const before = seen[i - 1]?.line ?? null;
    if (s.line !== null && before !== s.line) expect(before).toBeNull();
  });
  // Two beats armed on one frame: the lower one shows, and the other waits 4 seconds after it.
  const both = run(past('possess', 'move', 'eat'), { ...PLAY, energy01: 0.6, lengthsAlone: 5 }, 30);
  expect(both.seen[0]?.line).toBe(LINE.letGo);
  const last = both.seen.filter((s) => s.line === LINE.letGo).at(-1)?.t ?? 0;
  const next = both.seen.find((s) => s.line === LINE.halfRing)?.t ?? 0;
  expect(next - last).toBeGreaterThanOrEqual(4);
});

test('a line does not start under a line of the page', () => {
  const start = past('possess', 'move', 'eat');
  const toast = run(start, (t) => ({ ...PLAY, energy01: 0.6, busy: t < 3 }), 5);
  expect(toast.seen.find((s) => s.line !== null)?.t).toBeCloseTo(3, 0);
  expect(toast.walk.shown.halfRing).toBe(1);
});

test('beats 1 to 4 can all be done inside 60 seconds of facts', () => {
  const { walk, seen } = run(begin(), life, 60);
  expect(walk.done).toEqual(expect.arrayContaining(['possess', 'move', 'eat', 'letGo']));
  // In order, and nothing else asked for attention before them.
  const order = seen.map((s) => s.line).filter((line, i, all) => line && line !== all[i - 1]);
  expect(order).toEqual([LINE.possess, LINE.move, LINE.eat, LINE.letGo]);
});

const neuron = (port: number, activation: number): BrainNeuron => ({
  owner: 0,
  port,
  kind: 0,
  gene: 0,
  activation,
  bias: 0,
  alpha: 1,
});
const wire = (src: number, dst: number, weight: number, history: number): BrainConn => ({
  src,
  dst,
  weight,
  history,
});
// One input and the three outputs: thrust (port 128), turn (129), accept (130).
const brainOf = (thrust: number, turn: number, connections: BrainConn[] = []): BrainView => ({
  uid: 7,
  inputs: 1,
  hidden: 0,
  outputs: 3,
  manual: true,
  neurons: [neuron(0, 1), neuron(128, thrust), neuron(129, turn), neuron(130, 1)],
  connections,
});

test('the split is the larger distance of the two marks, as the panel draws them', () => {
  expect(split(brainOf(0.5, 0.25), { thrust: 0.5, turn: 0.25 })).toBe(0);
  expect(split(brainOf(0.2, 0.25), { thrust: 1, turn: 0.25 })).toBeCloseTo(0.8);
  expect(split(brainOf(1, -1), { thrust: 1, turn: 1 })).toBe(2);
  // The gauge of the thrust starts at 0: a brain that asks for less than nothing rests.
  expect(split(brainOf(-0.9, 0), { thrust: 0, turn: 0 })).toBe(0);
  // The third output has no mark of the player.
  expect(split(brainOf(0, 0), { thrust: 0, turn: 0 })).toBe(0);
});

test('the changes line counts each weight that differs and each wire gained or lost', () => {
  const first = brainOf(0, 0, [wire(0, 1, 0.5, 1), wire(0, 2, -1, 2), wire(0, 3, 0.25, 3)]);
  expect(wiringChanges(first, first)).toBe(0);
  // The activations are not wiring.
  expect(wiringChanges(first, { ...brainOf(1, 1), connections: first.connections })).toBe(0);
  const weight = brainOf(0, 0, [wire(0, 1, 0.5, 1), wire(0, 2, -0.9, 2), wire(0, 3, 0.25, 3)]);
  expect(wiringChanges(first, weight)).toBe(1);
  const lost = brainOf(0, 0, [wire(0, 1, 0.5, 1), wire(0, 3, 0.25, 3)]);
  expect(wiringChanges(first, lost)).toBe(1);
  expect(wiringChanges(lost, first)).toBe(1);
  // One wire lost, one gained, and one weight changed.
  const mixed = brainOf(0, 0, [wire(0, 1, 0.75, 1), wire(0, 2, -1, 2), wire(0, 2, 0.1, 9)]);
  expect(wiringChanges(first, mixed)).toBe(3);
  // Two wires with one name are two wires.
  const twin = brainOf(0, 0, [wire(0, 1, 0.5, 1), wire(0, 1, 0.5, 1)]);
  expect(wiringChanges(twin, twin)).toBe(0);
  expect(wiringChanges(twin, brainOf(0, 0, [wire(0, 1, 0.5, 1)]))).toBe(1);
});

// A `localStorage` that holds its items in a map, and one that throws on every call, as a browser
// with storage blocked does.
const memory = (): Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> => {
  const items = new Map<string, string>();
  return {
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => void items.set(key, value),
    removeItem: (key) => void items.delete(key),
  };
};
const blocked = (): Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> => {
  const refuse = (): never => {
    throw new Error('The operation is insecure.');
  };
  return { getItem: refuse, setItem: refuse, removeItem: refuse };
};
afterEach(() => vi.unstubAllGlobals());

const NONE = { done: [], shown: {}, log: {}, buds: 0 };

test('the store keeps what is done, what was shown, the log, and the count of the buds', () => {
  vi.stubGlobal('localStorage', memory());
  expect(loadWalk(false)).toEqual(NONE);
  const stored = {
    done: ['possess', 'eat'] as BeatId[],
    shown: { possess: 1, move: 2 },
    log: { possess: { shown: 0.5, done: 4.2 }, move: { shown: 9 } },
    buds: 3,
  };
  saveWalk(stored);
  expect(loadWalk(false)).toEqual(stored);
  // `?walk=reset` clears it, and the count of the buds with it.
  expect(loadWalk(true)).toEqual(NONE);
  expect(loadWalk(false)).toEqual(NONE);
});

test('with no storage the walk lives in memory', () => {
  vi.stubGlobal('localStorage', blocked());
  expect(loadWalk(false)).toEqual(NONE);
  expect(loadWalk(true)).toEqual(NONE);
  expect(() => saveWalk({ ...NONE, done: ['possess'] })).not.toThrow();
  vi.stubGlobal('localStorage', undefined);
  expect(loadWalk(false)).toEqual(NONE);
  expect(() => saveWalk({ ...NONE, done: ['possess'] })).not.toThrow();
});

test('the store reads only what it knows from what it finds', () => {
  const storage = memory();
  vi.stubGlobal('localStorage', storage);
  const junk = ['not json', 'null', '7', '[]', '{"done":7,"shown":[],"log":"x","buds":"x"}'];
  for (const text of [...junk, '{"buds":-2}']) {
    storage.setItem('tidepool.walk', text);
    expect(loadWalk(false), text).toEqual(NONE);
  }
  storage.setItem(
    'tidepool.walk',
    '{"done":["eat","fly",3],"shown":{"move":2,"fly":1,"eat":"x"},"log":{"eat":{"shown":"x","done":3},"fly":{"shown":1}}}',
  );
  expect(loadWalk(false)).toEqual({
    ...NONE,
    done: ['eat'],
    shown: { move: 2 },
    log: { eat: { done: 3 } },
  });
  // A whole count of buds is kept. A store of a visit before the count was kept holds none.
  storage.setItem('tidepool.walk', '{"done":["bud"],"buds":2.9}');
  expect(loadWalk(false)).toEqual({ ...NONE, done: ['bud'], buds: 2 });
  storage.setItem('tidepool.walk', '{"done":["bud"]}');
  expect(loadWalk(false)).toEqual({ ...NONE, done: ['bud'] });
});

test('the log keeps the first time that a beat showed and the first time it was done', () => {
  const before = begin(['possess'], { possess: 1 });
  const shown = { ...before, shown: { possess: 1, move: 1 } };
  const log = note({ possess: { shown: 0.5, done: 4 } }, before, shown, 9);
  expect(log).toEqual({ possess: { shown: 0.5, done: 4 }, move: { shown: 9 } });
  const done: Walk = { ...shown, done: ['possess', 'move'], shown: { possess: 2, move: 2 } };
  expect(note(log, shown, done, 12)).toEqual({
    possess: { shown: 0.5, done: 4 },
    move: { shown: 9, done: 12 },
  });
  // Nothing new: the same log.
  expect(note(log, done, done, 20)).toBe(log);
});

test('the log keeps beat 11: seconds of hunters before the first bite, "bitten first", or "no hunter seen"', () => {
  const start = begin(['possess']);
  const lived: Walk = { ...start, lived: true };
  expect(note({}, start, lived, 3)).toEqual({ firstBite: 'no hunter seen' });
  const seenHunter: Walk = { ...lived, hunted: 2 };
  expect(note({ firstBite: 'no hunter seen' }, lived, seenHunter, 4)).toEqual({});
  const bit: Walk = { ...seenHunter, bite: 2.04 };
  expect(note({}, seenHunter, bit, 5)).toEqual({ firstBite: 2 });
  // The first bite stays in the log, also over the bite of a later visit.
  const again: Walk = { ...begin(), lived: true, bite: 0 };
  expect(note({ firstBite: 2 }, begin(), again, 9)).toEqual({ firstBite: 2 });
  expect(note({ firstBite: 'no hunter seen' }, begin(), again, 9)).toEqual({
    firstBite: 'bitten first',
  });
  // Nothing new: the same log.
  const log = { firstBite: 2 };
  expect(note(log, bit, bit, 20)).toBe(log);
  // The store keeps it, and reads only what it knows.
  const storage = memory();
  vi.stubGlobal('localStorage', storage);
  saveWalk({ ...NONE, log: { firstBite: 'bitten first' } });
  expect(loadWalk(false).log).toEqual({ firstBite: 'bitten first' });
  saveWalk({ ...NONE, log: { firstBite: 3.5 } });
  expect(loadWalk(false).log).toEqual({ firstBite: 3.5 });
  storage.setItem('tidepool.walk', '{"log":{"firstBite":"soon"}}');
  expect(loadWalk(false).log).toEqual({});
});

test('the way in shows to a player who has been here before', () => {
  const back = run(past('possess', 'move', 'eat', 'letGo'), WATCH, 20);
  expect(secondsOf(back.seen, LINE.possess)).toBeCloseTo(20, 0);
});

test('a body that has budded gets no line about the notch', () => {
  const budded = run(past('possess', 'move', 'eat'), { ...STEER, buds: 1, energy01: 0.7 }, 30);
  expect(lines(budded.seen)).not.toContain(LINE.halfRing);
  expect(budded.walk.done).toContain('halfRing');
});
