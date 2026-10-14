// The beats of the walkthrough: docs/plans/2026-10-13-walkthrough.md. A beat names what the player
// just did, in one line, and never blocks play. Pure: no DOM, no storage, no clock of its own.

import type { BrainConn, BrainView } from '../protocol';
import { LINE } from '../ui/words/lines';

/** In the order of the plan's table. Of two beats armed on one frame, the first shows. */
export const BEATS = [
  'possess',
  'move',
  'eat',
  'letGo',
  'openBrain',
  'disagree',
  'noChange',
  'halfRing',
  'bud',
  'score',
  'court',
  'firstDeath',
] as const;
export type BeatId = (typeof BEATS)[number];

/** One per frame, from what the page already knows. */
export interface Facts {
  mode: 'watch' | 'play';
  manual: boolean; // the player steers
  panelOpen: boolean;
  dead: boolean; // the death overlay is up
  first: boolean; // and it leads with the line of beat 12: `leadsDeath`
  /** The possessed body, when the frame holds it. 0: no body, or the frame does not hold it. */
  uid: number;
  energy01: number; // of the body `uid`
  lengthsMoved: number; // body lengths moved under the player's input in this possession
  lengthsAlone: number; // body lengths moved since the brain last took over. 0 while the player steers
  buds: number; // of the body `uid` in this possession
  lineageAlive: number; // living bodies with the lineage mark, the player's own among them
  split: number; // how far the player's mark is from the brain's, 0 to 2
  busy: boolean; // a passing line of the page is up: a toast, or "Nothing there."
  card: boolean; // the mate card is up
  courted: boolean; // a body that the player courted accepted or refused a moment ago
}

export interface Walk {
  done: BeatId[]; // kept in storage
  shown: Partial<Record<BeatId, number>>; // showings of each beat. Kept in storage
  now: { beat: BeatId; t: number } | null; // the beat on show, and for how many seconds
  rest: number; // seconds until the next line may show
  clock: number; // seconds of the walk in this visit
  until: Partial<Record<BeatId, number>>; // the `clock` before which a beat does not show again
  uid: number; // the body that `energy` is of
  energy: number;
  idle: number; // seconds in a body with no input
  panel: number; // seconds of the open panel, in a body
  apart: number; // seconds for which the two marks have been `APART` apart
  wasFirst: boolean; // the death overlay was up on the last frame, and led with the line of beat 12
}

export const begin = (done: BeatId[] = [], shown: Walk['shown'] = {}): Walk => ({
  done,
  shown,
  now: null,
  rest: 0,
  clock: 0,
  until: {},
  uid: 0,
  energy: 0,
  idle: 0,
  panel: 0,
  apart: 0,
  wasFirst: false,
});

const LINE_S = 6; // a line leaves after this
const GAP_S = 4; // with no line, between two lines
const AGAIN_S = 20; // before the same beat shows a second time
const RETIRE = 2; // showings after which an ignored beat is not shown
const IDLE_S = 4; // beat 2: with no input
const MOVE_LENGTHS = 3; // beat 2: under the player's input
const ALONE_LENGTHS = 1; // beat 4: what the body swims with no input before its line
const LET_GO_S = 3; // beat 4: with no input, under its line
const PANEL_S = 5; // beat 5
const APART = 0.5; // beat 6: between the two marks
const APART_S = 1;
const NO_CHANGE_S = 20; // beat 7: of the open panel
const HALF_RING = 0.5; // beat 8a: of a full store
const SCORE_BUDS = 2; // beat 9: buds of the body, and the least that the counter shows
const FIRST_DEATH_S = 20; // beat 12: a shorter life is not one that the player has lived

/**
 * Beat 12: whether the death overlay leads with "You are gone. Your line is not." It does at the
 * first death of a life of `FIRST_DEATH_S` seconds or more that leaves an heir to go on as. A
 * shorter life, and one with no heir, gets the plain layout and leaves the beat for a later death.
 */
export const leadsDeath = (walk: Walk, lifeSeconds: number, heirs: number): boolean =>
  !walk.done.includes('firstDeath') && lifeSeconds >= FIRST_DEATH_S && heirs > 0;

// The lines at the foot of the screen. A beat that is not here shows a pulse, or a line in the panel.
const FOOT: Partial<Record<BeatId, string>> = LINE;

/**
 * One frame of the walkthrough. `walk.done` and `walk.shown` keep their identity while they do not
 * change, so the caller can tell when to store them.
 */
export function step(
  walk: Walk,
  f: Facts,
  dt: number,
): { walk: Walk; line: string | null; pulse: 'brain' | 'score' | null } {
  const w = { ...walk };
  const play = f.mode === 'play';
  const seen = play && f.uid !== 0; // the frame holds the body
  const same = seen && f.uid === w.uid;
  // Eating is the only rule of the core that adds energy: `eat` in crates/sim/src/energy.rs.
  const ate = same && f.energy01 > w.energy;
  if (seen) [w.uid, w.energy] = [f.uid, f.energy01];
  if (!play) w.uid = 0;
  w.idle = play && !f.manual ? w.idle + dt : 0;
  if (play && f.panelOpen) w.panel += dt;
  w.apart = play && f.panelOpen && f.manual && f.split >= APART ? w.apart + dt : 0;
  w.rest = Math.max(w.rest - dt, 0);
  w.clock += dt;
  w.wasFirst = f.dead && f.first;
  if (w.now) w.now = { beat: w.now.beat, t: w.now.t + dt };
  const on = w.now?.beat;
  const t = w.now?.t ?? 0;

  const isDone = (id: BeatId): boolean => w.done.includes(id);
  const count = (id: BeatId): number => w.shown[id] ?? 0;
  // Done or retired: the beats after it do not wait for it.
  const past = (id: BeatId): boolean => isDone(id) || count(id) >= RETIRE;
  const show = (id: BeatId): void => {
    w.shown = { ...w.shown, [id]: count(id) + 1 };
  };

  // What the player does to finish a beat. A beat that is not here is done when it is shown.
  const acts: Partial<Record<BeatId, boolean>> = {
    possess: play,
    move: f.lengthsMoved >= MOVE_LENGTHS,
    letGo: on === 'letGo' && t >= LET_GO_S, // input takes its line away, so these were hands off
    openBrain: w.panel >= PANEL_S,
    disagree: on === 'disagree' && w.apart >= APART_S,
    bud: seen && f.buds >= 1,
    firstDeath: walk.wasFirst && !f.dead && play, // an heir was picked
  };
  for (const id of BEATS) if (acts[id] && !isDone(id)) w.done = [...w.done, id];
  // A body that has budded needs no line about the notch.
  if (seen && f.buds >= 1 && !isDone('halfRing')) w.done = [...w.done, 'halfRing'];
  // Beat 12 has no line here: the death screen is its showing.
  if (f.dead && f.first && !walk.wasFirst && !isDone('firstDeath')) show('firstDeath');
  // Beat 10 arms when the mate card first shows: the card is its first showing. Its line follows
  // the first courtship that the other accepts or refuses, and the beat is done with it.
  if (play && f.card && count('court') === 0 && !isDone('court')) show('court');

  const armed: Partial<Record<BeatId, boolean>> = {
    possess: f.mode === 'watch' && !f.dead,
    move: play && w.idle >= IDLE_S,
    eat: ate && f.manual,
    letGo: past('eat') && play && !f.manual && f.lengthsAlone >= ALONE_LENGTHS,
    openBrain: past('letGo') && play && !f.panelOpen,
    disagree: w.apart > 0,
    noChange: play && f.panelOpen && w.panel >= NO_CHANGE_S,
    halfRing: past('eat') && seen && f.energy01 >= HALF_RING,
    // The counter leaves out the body of the player. It has just risen, on the screen.
    score: seen && f.buds >= SCORE_BUDS && f.lineageAlive - 1 >= SCORE_BUDS,
    court: play && f.courted,
  };
  // A line leaves when the player acts on it, when it is no longer true, or after `LINE_S`. The
  // line of beat 1 is the way into the game: it stands until a body is possessed.
  const stale: Partial<Record<BeatId, boolean>> = {
    possess: !armed.possess,
    move: !play || f.manual,
    letGo: !play || f.manual,
    openBrain: !play || f.panelOpen,
    disagree: !play || !f.panelOpen,
    noChange: !play || !f.panelOpen,
  };
  if (on && ((stale[on] ?? !play) || (on !== 'possess' && t >= LINE_S))) {
    w.now = null;
    if (FOOT[on]) w.rest = GAP_S;
    w.until = { ...w.until, [on]: w.clock + AGAIN_S };
  }
  if (!w.now && !f.busy) {
    const next = BEATS.find(
      (id) =>
        armed[id] &&
        // The line of beat 1 is the way in. It shows at once in Watch, also to a player who has
        // been here before.
        (id === 'possess' ||
          (!isDone(id) &&
            count(id) < RETIRE &&
            (w.until[id] ?? 0) <= w.clock &&
            !(FOOT[id] && w.rest > 0))),
    );
    if (next) {
      w.now = { beat: next, t: 0 };
      show(next);
      if (!(next in acts)) w.done = [...w.done, next];
    }
  }
  const beat = w.now?.beat;
  return {
    walk: w,
    line: (beat && FOOT[beat]) ?? null,
    pulse: beat === 'openBrain' ? 'brain' : beat === 'score' ? 'score' : null,
  };
}

// The ports of the two outputs that the player's hands hold: crates/sim/src/brain.rs.
const OUT_THRUST = 128;
const OUT_TURN = 129;

/**
 * How far the player's mark is from the brain's in the brain panel, 0 to 2: the larger of the two
 * outputs. The body uses only the part of the thrust above 0, and the gauge starts there.
 */
export function split(brain: BrainView, hands: { thrust: number; turn: number }): number {
  let most = 0;
  for (const n of brain.neurons.slice(brain.inputs + brain.hidden)) {
    if (n.port === OUT_THRUST)
      most = Math.max(most, Math.abs(hands.thrust - Math.max(n.activation, 0)));
    if (n.port === OUT_TURN) most = Math.max(most, Math.abs(hands.turn - n.activation));
  }
  return most;
}

const nameOf = (c: BrainConn): string => `${c.src}>${c.dst}#${c.history}`;

/**
 * The count of the changes line: each connection of `now` whose weight is not what `first` had, each
 * that `first` did not have, and each of `first` that is gone. Nothing in the core changes a brain
 * within a life, so a count above 0 is a bug of the game, and the panel shows it.
 */
export function wiringChanges(first: BrainView, now: BrainView): number {
  const was = new Map<string, number[]>();
  for (const c of first.connections) was.set(nameOf(c), [...(was.get(nameOf(c)) ?? []), c.weight]);
  let changes = 0;
  for (const c of now.connections) if (was.get(nameOf(c))?.shift() !== c.weight) changes++;
  for (const left of was.values()) changes += left.length;
  return changes;
}
