import { afterEach, expect, test, vi } from 'vitest';
import {
  BEATS,
  begin,
  split,
  step,
  wiringChanges,
  type BeatId,
  type Facts,
  type Walk,
} from '../src/app/walkthrough';
import { loadWalk, note, saveWalk } from '../src/app/walkstore';
import type { BrainConn, BrainNeuron, BrainView } from '../src/protocol';
import { LINE } from '../src/ui/words/lines';

const DT = 0.05;
const WATCH: Facts = {
  mode: 'watch',
  manual: false,
  panelOpen: false,
  dead: false,
  uid: 0,
  energy01: 0.3,
  lengthsMoved: 0,
  lengthsAlone: 0,
  buds: 0,
  lineageAlive: 1,
  split: 0,
  busy: false,
};
// In a body, hands off. `STEER` is the same body under the player's hands.
const PLAY: Facts = { ...WATCH, mode: 'play', uid: 7 };
const STEER: Facts = { ...PLAY, manual: true };

interface Seen {
  t: number;
  line: string | null;
  pulse: 'brain' | 'score' | null;
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
    seen.push({ t, line: out.line, pulse: out.pulse });
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

test('beat 9: two buds show the score line and pulse the counter, once', () => {
  const one = run(past('possess', 'move'), { ...PLAY, buds: 1 }, 8);
  expect(one.seen.every((s) => s.line === null && s.pulse === null)).toBe(true);
  const two = run(one.walk, { ...PLAY, buds: 2 }, 8);
  expect(two.seen[0]).toMatchObject({ line: LINE.score, pulse: 'score' });
  expect(two.seen.filter((s) => (s.line === LINE.score) !== (s.pulse === 'score'))).toEqual([]);
  expect(two.walk.done).toContain('score');
  expect(lines(run(two.walk, { ...PLAY, buds: 3 }, 30).seen)).not.toContain(LINE.score);
});

test('beat 9: the death of one descendant shows the score line too', () => {
  const at = (t: number): Facts => ({ ...PLAY, buds: 1, lineageAlive: t < 2 ? 2 : 1 });
  const { seen } = run(past('possess', 'move'), at, 4);
  expect(seen.find((s) => s.line !== null)).toMatchObject({ line: LINE.score, pulse: 'score' });
  expect(seen.find((s) => s.line !== null)?.t).toBeCloseTo(2, 0);
  // A smaller line in another body is not a death.
  const other = (t: number): Facts => (t < 2 ? { ...PLAY, lineageAlive: 5 } : { ...PLAY, uid: 9 });
  expect(lines(run(past('possess', 'move'), other, 4).seen)).not.toContain(LINE.score);
});

test('beat 10 never arms yet', () => {
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
});

test('beat 12: the first death is recorded, and the pick of an heir is the beat', () => {
  const died = run(past('possess'), { ...WATCH, dead: true }, 2);
  expect(died.walk.shown.firstDeath).toBe(1);
  expect(died.walk.done).not.toContain('firstDeath');
  expect(died.seen.every((s) => s.line === null && s.pulse === null)).toBe(true);
  expect(run(died.walk, WATCH, 1).walk.done).not.toContain('firstDeath');
  expect(run(died.walk, { ...PLAY, uid: 8 }, 1).walk.done).toContain('firstDeath');
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
  };
  return t < 140 ? facts : t < 145 ? { ...WATCH, dead: true } : { ...facts, uid: 8, buds: 0 };
};

test('a first life does every beat but the mate', () => {
  const { walk } = run(begin(), life, 150);
  expect([...walk.done].sort()).toEqual(BEATS.filter((id) => id !== 'court').sort());
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

test('the store keeps what is done, what was shown, and the log', () => {
  vi.stubGlobal('localStorage', memory());
  expect(loadWalk(false)).toEqual({ done: [], shown: {}, log: {} });
  const stored = {
    done: ['possess', 'eat'] as BeatId[],
    shown: { possess: 1, move: 2 },
    log: { possess: { shown: 0.5, done: 4.2 }, move: { shown: 9 } },
  };
  saveWalk(stored);
  expect(loadWalk(false)).toEqual(stored);
  // `?walk=reset` clears it.
  expect(loadWalk(true)).toEqual({ done: [], shown: {}, log: {} });
  expect(loadWalk(false)).toEqual({ done: [], shown: {}, log: {} });
});

test('with no storage the walk lives in memory', () => {
  vi.stubGlobal('localStorage', blocked());
  expect(loadWalk(false)).toEqual({ done: [], shown: {}, log: {} });
  expect(loadWalk(true)).toEqual({ done: [], shown: {}, log: {} });
  expect(() => saveWalk({ done: ['possess'], shown: {}, log: {} })).not.toThrow();
  vi.stubGlobal('localStorage', undefined);
  expect(loadWalk(false)).toEqual({ done: [], shown: {}, log: {} });
  expect(() => saveWalk({ done: ['possess'], shown: {}, log: {} })).not.toThrow();
});

test('the store reads only what it knows from what it finds', () => {
  const storage = memory();
  vi.stubGlobal('localStorage', storage);
  for (const text of ['not json', 'null', '7', '[]', '{"done":7,"shown":[],"log":"x"}']) {
    storage.setItem('tidepool.walk', text);
    expect(loadWalk(false), text).toEqual({ done: [], shown: {}, log: {} });
  }
  storage.setItem(
    'tidepool.walk',
    '{"done":["eat","fly",3],"shown":{"move":2,"fly":1,"eat":"x"},"log":{"eat":{"shown":"x","done":3},"fly":{"shown":1}}}',
  );
  expect(loadWalk(false)).toEqual({ done: ['eat'], shown: { move: 2 }, log: { eat: { done: 3 } } });
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

test('the way in shows to a player who has been here before', () => {
  const back = run(past('possess', 'move', 'eat', 'letGo'), WATCH, 20);
  expect(secondsOf(back.seen, LINE.possess)).toBeCloseTo(20, 0);
});

test('a body that has budded gets no line about the notch', () => {
  const budded = run(past('possess', 'move', 'eat'), { ...STEER, buds: 1, energy01: 0.7 }, 30);
  expect(lines(budded.seen)).not.toContain(LINE.halfRing);
  expect(budded.walk.done).toContain('halfRing');
});
