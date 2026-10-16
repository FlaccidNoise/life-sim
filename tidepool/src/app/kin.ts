// A parent and its child at a bud: which body of a frame the child is, and what differs between the
// two. Pure functions. All of a difference is from the frame records and the brain readouts.

import {
  C_BRAIN,
  C_DIET,
  C_FLAGS,
  C_GROWTH,
  C_HUE,
  C_LENGTH,
  C_PARTS,
  C_SLOT,
  C_UID,
  C_WIDTH,
  C_X,
  C_Y,
  CREATURE_STRIDE,
  FLAG_LINEAGE,
  KIND_EYE,
  PART_WORDS,
  unpackPart,
  type BrainView,
  type FrameView,
  type Kin,
  type Part,
} from '../protocol';
import type { Difference } from '../ui/state';
import { BUD, dietWord, KIND, ORDINAL } from '../ui/words/lines';

// The body of the creature record at word `r`.
function kinAt(frame: FrameView, r: number): Kin {
  const { f32, u32 } = frame;
  const brain = u32[r + C_BRAIN] ?? 0;
  const parts: Part[] = [];
  for (let k = 0; k < PART_WORDS; k++) {
    const part = unpackPart(u32[r + C_PARTS + k] ?? 0);
    if (part) parts.push(part);
  }
  return {
    uid: u32[r + C_UID] ?? 0,
    x: f32[r + C_X] ?? 0,
    y: f32[r + C_Y] ?? 0,
    length: f32[r + C_LENGTH] ?? 0,
    width: f32[r + C_WIDTH] ?? 0,
    hue: f32[r + C_HUE] ?? 0,
    diet: f32[r + C_DIET] ?? 0,
    growth: f32[r + C_GROWTH] ?? 0,
    flags: u32[r + C_FLAGS] ?? 0,
    hidden: brain & 0xffff,
    conns: brain >>> 16,
    parts,
  };
}

const records = (frame: FrameView): number[] =>
  Array.from({ length: frame.creatureCount }, (_, i) => frame.creatureBase + i * CREATURE_STRIDE);

/** The body in `slot`, or null when the frame does not hold it. */
export function bodyIn(frame: FrameView, slot: number): Kin | null {
  const r = records(frame).find((r) => frame.u32[r + C_SLOT] === slot);
  return r === undefined ? null : kinAt(frame, r);
}

/**
 * The child of a bud: the body of `next` that `prev` does not hold, that carries the lineage mark,
 * and that is nearest to the body in `parentSlot`. `next` is the frame in which the bud count of the
 * header rose. Null when there is no such body, or when `next` does not hold the parent.
 */
export function childOf(prev: FrameView, next: FrameView, parentSlot: number): Kin | null {
  const parent = bodyIn(next, parentSlot);
  if (!parent) return null;
  const before = new Set(records(prev).map((r) => prev.u32[r + C_UID]));
  let child: Kin | null = null;
  let nearest = Infinity;
  for (const r of records(next)) {
    const uid = next.u32[r + C_UID];
    const marked = ((next.u32[r + C_FLAGS] ?? 0) & FLAG_LINEAGE) !== 0;
    if (!marked || uid === parent.uid || before.has(uid)) continue;
    const far = Math.hypot(
      (next.f32[r + C_X] ?? 0) - parent.x,
      (next.f32[r + C_Y] ?? 0) - parent.y,
    );
    if (far < nearest) [child, nearest] = [kinAt(next, r), far];
  }
  return child;
}

const FULL_CARDS = 2; // buds of a player that show the card

/**
 * Whether a bud shows the bud card. The first buds of a player do, by `earlier`, the count of the
 * buds before this one. A later bud shows one line at the foot, so the card does not cover a fed
 * life. The guide holds the card of every bud.
 */
export const showsCard = (earlier: number): boolean => earlier < FULL_CARDS;

const LEAST = 1; // percent. A smaller difference is not listed.
const LEAST_MOVE = LEAST / 100; // of the way from the nose to the tail, and of the range of a cone
const GAP = 1.5; // the cost of a part with no partner. A pair of one kind costs 3 at most.
// The ranks of the lines that are no percent. A percent is between them.
const FIRST = 1e9;
const LAST = -1;
const round = (percent: number): number => Math.round(Math.abs(percent));

/**
 * Lines up two part lists: each pair is a place in `a` and a place in `b`, and one of the two is
 * null for a part with no partner. A frame has no id of a part, so this is the pairing that keeps
 * the order of both lists, pairs only parts of one kind, and leaves the parts most alike. A bud
 * keeps the order: it removes a part from any place and puts a new one on the end.
 */
function lineUp(a: Part[], b: Part[]): [number | null, number | null][] {
  const apart = (p: Part, q: Part): number =>
    p.kind === q.kind
      ? Math.abs(p.anchor - q.anchor) + Math.abs(p.size - q.size) + Math.abs(p.extra - q.extra)
      : Infinity;
  // cost[i][j]: the least cost of the parts of `a` from `i` on and of `b` from `j` on.
  const cost = a.map(() => b.map(() => 0));
  const at = (i: number, j: number): number =>
    cost[i]?.[j] ?? (a.length - i + (b.length - j)) * GAP; // past the end of a list, only gaps
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      const [p, q, row] = [a[i], b[j], cost[i]];
      if (!p || !q || !row) continue;
      row[j] = Math.min(apart(p, q) + at(i + 1, j + 1), GAP + at(i + 1, j), GAP + at(i, j + 1));
    }
  }
  const pairs: [number | null, number | null][] = [];
  let [i, j] = [0, 0];
  while (i < a.length || j < b.length) {
    const [p, q] = [a[i], b[j]];
    if (p && q && at(i, j) === apart(p, q) + at(i + 1, j + 1)) pairs.push([i++, j++]);
    else if (p && (!q || at(i, j) === GAP + at(i + 1, j))) pairs.push([i++, null]);
    else pairs.push([null, j++]);
  }
  return pairs;
}

// A line of `BUD` with its places filled, and with a capital first.
function fill(line: string, values: Record<string, string | number>): string {
  const text = line.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? ''));
  return text.charAt(0).toUpperCase() + text.slice(1);
}

// The name of the part at `i`: its kind, and which one of that kind when the body has more.
function nameOf(parts: Part[], i: number): string {
  const kind = parts[i]?.kind ?? 0;
  const name = KIND[kind] ?? BUD.part;
  const ofKind = parts.filter((p) => p.kind === kind).length;
  const nth = parts.slice(0, i).filter((p) => p.kind === kind).length;
  return ofKind > 1 ? `${ORDINAL[nth] ?? ''} ${name}`.trim() : name;
}

/**
 * What differs between a parent and its child, as the lines of the bud card: the parts lost and
 * gained and the counts of the brain first, then each change of a size with the largest first, then
 * the parts that moved, then the count of the connection weights that differ.
 *
 * From the two records: the length gene in percent, the width as a share of the length, each part
 * lost, gained, resized, or moved, an eye with another cone, and the count of hidden neurons. From
 * the two readouts: the connections gained and lost, lined up by history id, and of the connections
 * that both hold, how many have another weight. With no readouts, the count of connections is from
 * the records. A difference under `LEAST` percent is not listed.
 */
export function differences(
  parent: Kin,
  child: Kin,
  brains: [parent: BrainView, child: BrainView] | null = null,
): Difference[] {
  // Each line with its rank: a higher rank is nearer the top.
  const found: [rank: number, line: Difference][] = [];
  const say = (rank: number, side: Difference['side'], text: string, part?: number): void =>
    void found.push([rank, part === undefined ? { text, side } : { text, side, part }]);
  // A line about the part of the child at `j`.
  const ofPart = (rank: number, line: string, j: number, n = 0): void =>
    say(rank, 'child', fill(line, { n, part: nameOf(child.parts, j) }), j);
  // The change from `was` to `now` in percent of `was`, or 0 when it is not listed.
  const percent = (was: number, now: number): number => {
    const by = (now / was - 1) * 100;
    return Number.isFinite(by) && Math.abs(by) >= LEAST ? by : 0;
  };
  const body = (by: number, more: string, less: string): void => {
    if (by !== 0) say(Math.abs(by), 'child', fill(by > 0 ? more : less, { n: round(by) }));
  };
  // A count of the brain. One that rose is on the side of the child, and one that fell is on the
  // side of the parent, which holds what the child does not.
  const count = (n: number, side: Difference['side'], line: string): void => {
    if (n > 0) say(FIRST, side, fill(line, { n, s: n === 1 ? '' : 's' }));
  };

  // The frame gives a length as it is now, and the length over the growth is the length gene: the
  // full length of the body, at any age. A body with no growth has no length gene to compare. The
  // width as a share of the length is the same at every age.
  const gene = (kin: Kin): number => kin.length / kin.growth;
  if (parent.growth > 0 && child.growth > 0) {
    body(percent(gene(parent), gene(child)), BUD.longer, BUD.shorter);
  }
  body(percent(parent.width / parent.length, child.width / child.length), BUD.wider, BUD.narrower);

  for (const [i, j] of lineUp(parent.parts, child.parts)) {
    const [was, now] = [parent.parts[i ?? -1], child.parts[j ?? -1]];
    if (j === null) {
      if (i !== null) say(FIRST, 'parent', fill(BUD.lost, { part: nameOf(parent.parts, i) }), i);
    } else if (!was || !now) {
      ofPart(FIRST, BUD.gained, j);
    } else {
      const by = percent(was.size, now.size);
      if (was.size === 0 && now.size > 0) ofPart(FIRST, BUD.fromNone, j);
      else if (by !== 0) ofPart(Math.abs(by), by > 0 ? BUD.larger : BUD.smaller, j, round(by));
      const moved = now.anchor - was.anchor;
      if (Math.abs(moved) >= LEAST_MOVE) ofPart(0, moved > 0 ? BUD.tailward : BUD.noseward, j);
      const cone = now.kind === KIND_EYE ? now.extra - was.extra : 0;
      if (Math.abs(cone) >= LEAST_MOVE) ofPart(0, cone > 0 ? BUD.coneWider : BUD.coneNarrower, j);
    }
  }

  if (dietWord(child.diet) !== dietWord(parent.diet)) {
    say(FIRST, 'child', fill(BUD.diet, { diet: dietWord(child.diet) }));
  }

  count(child.hidden - parent.hidden, 'child', BUD.moreHidden);
  count(parent.hidden - child.hidden, 'parent', BUD.fewerHidden);
  if (!brains) {
    count(child.conns - parent.conns, 'child', BUD.moreConns);
    count(parent.conns - child.conns, 'parent', BUD.fewerConns);
  } else {
    // By history id: the weights of the parent that no connection of the child has claimed yet.
    const left = new Map(brains[0].connections.map((c) => [c.history, c.weight]));
    let [both, nudged, gained] = [0, 0, 0];
    for (const c of brains[1].connections) {
      const weight = left.get(c.history);
      if (weight === undefined) gained++;
      else {
        both++;
        if (weight !== c.weight) nudged++;
        left.delete(c.history);
      }
    }
    count(gained, 'child', BUD.connsGained);
    count(left.size, 'parent', BUD.connsLost);
    if (nudged > 0) say(LAST, 'child', fill(BUD.weights, { n: nudged, m: both }));
  }
  // The sort is stable: lines of one rank keep the order in which they were found.
  return found.sort((a, b) => b[0] - a[0]).map(([, line]) => line);
}
