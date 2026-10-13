// The strongest path of a brain, in words. One table below gives each input its short label for the
// graph and its phrase for the sentence, so the two cannot disagree. The ports are those of
// crates/sim/src/brain.rs.

import { KIND_EYE, type BrainConn, type BrainView } from '../../protocol';

/** A path weaker than this is not named. */
export const PATH_FLOOR = 0.05;
/** The path on show stays until another is this many times stronger than it. */
export const SWITCH_MARGIN = 1.5;

const MAX_HIDDEN = 2; // hidden neurons on one path
const OUT_THRUST = 128;
const OUT_TURN = 129;

/**
 * An input: `label` is the short name in the graph. `says` is what it reads when it is above 0, and
 * `saysNegative` what it reads below 0, for the two inputs that go below 0. `habit` is for the input
 * that is always on: the sentence then says what the body always does and not what it senses.
 */
interface Input {
  label: string;
  says: string;
  saysNegative?: string;
  habit?: true;
}

const BODY_INPUT: Record<number, Input> = {
  0: { label: 'always on', says: '', habit: true },
  1: { label: 'energy', says: 'Has plenty of energy' },
  2: { label: 'age', says: 'Is getting old' },
  3: { label: 'speed', says: 'Is moving fast' },
  4: { label: 'size', says: 'Meets a large mate' },
  5: { label: 'kin', says: 'Meets a relative' },
  16: { label: 'strength', says: 'Smells food' },
  17: {
    label: 'ahead',
    says: 'Smells food getting stronger ahead',
    saysNegative: 'Smells food getting weaker ahead',
  },
  18: {
    label: 'side',
    says: 'Smells food stronger on the right',
    saysNegative: 'Smells food stronger on the left',
  },
};
// The ports of an eye: cone A looks to the right of the heading and cone B to the left. A midline eye
// has cone A only, and it looks ahead.
const EYE_PAIRED: Input[] = [
  { label: 'food R', says: 'Sees a plant on the right' },
  { label: 'body R', says: 'Sees another body on the right' },
  { label: 'food L', says: 'Sees a plant on the left' },
  { label: 'body L', says: 'Sees another body on the left' },
];
const EYE_MIDLINE: Input[] = [
  { label: 'food', says: 'Sees a plant ahead' },
  { label: 'body', says: 'Sees another body ahead' },
];
const UNKNOWN_INPUT: Input = { label: '', says: 'Senses something' };

/** An output that a path can end in: what it does when the path adds to it and when it takes away. */
interface Action {
  more: string;
  less: string;
  alwaysMore: string; // after "Always", for the input that is always on
  alwaysLess: string;
}
const OUTPUT: Record<number, Action> = {
  [OUT_THRUST]: {
    more: 'Speeds up',
    less: 'Slows down',
    alwaysMore: 'swims forward',
    alwaysLess: 'holds back',
  },
  [OUT_TURN]: {
    more: 'Turns right',
    less: 'Turns left',
    alwaysMore: 'turns right',
    alwaysLess: 'turns left',
  },
};

const inputOf = (brain: BrainView, i: number): Input => {
  const n = brain.neurons[i];
  if (!n) return UNKNOWN_INPUT;
  if (n.owner === 0) return BODY_INPUT[n.port] ?? UNKNOWN_INPUT;
  if (n.kind !== KIND_EYE) return UNKNOWN_INPUT;
  const cones = brain.neurons.slice(0, brain.inputs).filter((m) => m.owner === n.owner).length;
  return (cones === 2 ? EYE_MIDLINE : EYE_PAIRED)[n.port] ?? UNKNOWN_INPUT;
};

/** The short label of input `i` in the graph. */
export const inputLabel = (brain: BrainView, i: number): string => inputOf(brain, i).label;

interface Found {
  nodes: number[];
  gain: number;
}

/**
 * Each path above `PATH_FLOOR`: `nodes` are indices into `brain.neurons` from an input to thrust or
 * turn, and `gain` is the activation of the input times every weight, with its sign. A neuron is on a
 * path once, so a loop cannot make one longer, and a path has at most `MAX_HIDDEN` hidden neurons, so
 * the search ends.
 */
function* search(brain: BrainView): Generator<Found> {
  const { inputs, neurons } = brain;
  const firstOut = inputs + brain.hidden;
  const from = neurons.map((): BrainConn[] => []);
  for (const c of brain.connections) from[c.src]?.push(c);
  function* walk(nodes: number[], gain: number): Generator<Found> {
    for (const c of from[nodes[nodes.length - 1] ?? 0] ?? []) {
      if (c.dst < inputs || nodes.includes(c.dst)) continue;
      const next = gain * c.weight;
      if (c.dst >= firstOut) {
        if (OUTPUT[neurons[c.dst]?.port ?? 0] && Math.abs(next) > PATH_FLOOR) {
          yield { nodes: [...nodes, c.dst], gain: next };
        }
      } else if (nodes.length <= MAX_HIDDEN) {
        yield* walk([...nodes, c.dst], next);
      }
    }
  }
  for (let i = 0; i < inputs; i++) yield* walk([i], neurons[i]?.activation ?? 0);
}

const sentence = (brain: BrainView, { nodes, gain }: Found): string => {
  const first = nodes[0] ?? 0;
  const input = inputOf(brain, first);
  const action = OUTPUT[brain.neurons[nodes[nodes.length - 1] ?? 0]?.port ?? 0];
  if (!action) return '';
  const hidden = nodes.length - 2;
  const via = hidden === 0 ? '' : `, through ${hidden} hidden neuron${hidden === 1 ? '' : 's'}`;
  if (input.habit) return `Always ${gain > 0 ? action.alwaysMore : action.alwaysLess}${via}.`;
  const falling = (brain.neurons[first]?.activation ?? 0) < 0;
  const says = falling && input.saysNegative ? input.saysNegative : input.says;
  return `${says}. ${gain > 0 ? action.more : action.less}${via}.`;
};

const named = (brain: BrainView, found: Found): { nodes: number[]; text: string } => ({
  nodes: found.nodes,
  text: sentence(brain, found),
});

/** The strongest path from an input to thrust or turn, or null when none is above `PATH_FLOOR`. */
export function strongestPath(brain: BrainView): { nodes: number[]; text: string } | null {
  let best: Found | null = null;
  for (const found of search(brain)) {
    if (!best || Math.abs(found.gain) > Math.abs(best.gain)) best = found;
  }
  return best && named(brain, best);
}

/**
 * The path to show, given the one `shown` now. The shown path stays while it is above the floor and
 * no other is `SWITCH_MARGIN` times stronger, so that two near paths do not trade places each frame.
 * Its sentence is read from the brain as it is now.
 */
export function pickPath(
  brain: BrainView,
  shown: number[] | null,
): { nodes: number[]; text: string } | null {
  let best: Found | null = null;
  let held: Found | null = null;
  for (const found of search(brain)) {
    if (!best || Math.abs(found.gain) > Math.abs(best.gain)) best = found;
    if (shown?.length === found.nodes.length && found.nodes.every((n, i) => n === shown[i])) {
      held = found;
    }
  }
  if (best && held && Math.abs(best.gain) < Math.abs(held.gain) * SWITCH_MARGIN) {
    return named(brain, held);
  }
  return best && named(brain, best);
}
