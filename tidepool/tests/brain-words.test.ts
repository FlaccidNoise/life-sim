import { expect, test } from 'vitest';
import { KIND_EYE, KIND_HIDDEN, type BrainNeuron, type BrainView } from '../src/protocol';
import {
  inputLabel,
  PATH_FLOOR,
  pickPath,
  strongestPath,
  SWITCH_MARGIN,
} from '../src/ui/brain/words';

const neuron = (owner: number, port: number, kind = 0, gene = 0, activation = 0): BrainNeuron => ({
  owner,
  port,
  kind,
  gene,
  activation,
  bias: 0,
  alpha: 1,
});
const body = (...ports: number[]): BrainNeuron[] => ports.map((port) => neuron(0, port));
const eye = (owner: number, ports: number[]): BrainNeuron[] =>
  ports.map((port) => neuron(owner, port, KIND_EYE, 2));

// Input indices of the body below: 0 always on, 1 energy, 2 age, 3 speed, 4 mate size, 5 kin,
// 6 scent strength, 7 scent ahead, 8 scent side, 9 food R, 10 body R, 11 food L, 12 body L.
const INPUTS = [...body(0, 1, 2, 3, 4, 5, 16, 17, 18), ...eye(7, [0, 1, 2, 3])];
const [CONST, STRENGTH, AHEAD, SIDE, FOOD_R, BODY_R, FOOD_L, BODY_L] = [0, 6, 7, 8, 9, 10, 11, 12];
const FIRST_HIDDEN = INPUTS.length;

type Wire = [src: number, dst: number, weight: number];

/**
 * The inputs above, `hidden` hidden neurons (the first is index 13), and the 3 outputs. `active`
 * gives the activation of each input by index. The outputs are at `13 + hidden` (thrust), `+1`
 * (turn) and `+2` (accept).
 */
function brainOf(
  active: Record<number, number>,
  hidden: number,
  wires: Wire[],
  inputs = INPUTS,
): BrainView {
  const hiddens = Array.from({ length: hidden }, (_, i) => neuron(100 + i, 0, KIND_HIDDEN, i));
  return {
    uid: 1,
    inputs: inputs.length,
    hidden,
    outputs: 3,
    manual: false,
    neurons: [
      ...inputs.map((n, i) => ({ ...n, activation: active[i] ?? 0 })),
      ...hiddens,
      ...body(128, 129, 130),
    ],
    connections: wires.map(([src, dst, weight], i) => ({ src, dst, weight, history: 200 + i })),
  };
}
const THRUST = FIRST_HIDDEN; // with no hidden neurons
const TURN = FIRST_HIDDEN + 1;

test('a wire from the right eye to turn names both', () => {
  const path = strongestPath(brainOf({ [FOOD_R]: 0.8 }, 0, [[FOOD_R, TURN, 1]]));
  expect(path).toEqual({
    nodes: [FOOD_R, TURN],
    text: 'Sees a plant on the right. Turns right.',
  });
});

test('a negative weight flips the side of the turn and the sense of the thrust', () => {
  expect(strongestPath(brainOf({ [FOOD_R]: 0.8 }, 0, [[FOOD_R, TURN, -1]]))?.text).toBe(
    'Sees a plant on the right. Turns left.',
  );
  expect(strongestPath(brainOf({ [FOOD_R]: 0.8 }, 0, [[FOOD_R, THRUST, 1]]))?.text).toBe(
    'Sees a plant on the right. Speeds up.',
  );
  expect(strongestPath(brainOf({ [FOOD_R]: 0.8 }, 0, [[FOOD_R, THRUST, -1]]))?.text).toBe(
    'Sees a plant on the right. Slows down.',
  );
});

test('a negative weight on each of two hops makes a positive path', () => {
  const hidden = FIRST_HIDDEN; // one hidden neuron, so the outputs are one further on
  const brain = brainOf({ [FOOD_R]: 1 }, 1, [
    [FOOD_R, hidden, -1],
    [hidden, hidden + 2, -1],
  ]);
  expect(strongestPath(brain)?.text).toBe(
    'Sees a plant on the right. Turns right, through 1 hidden neuron.',
  );
});

test('a stronger path through a hidden neuron wins over a weak direct wire', () => {
  const hidden = FIRST_HIDDEN;
  const brain = brainOf({ [FOOD_R]: 1, [FOOD_L]: 1 }, 1, [
    [FOOD_R, hidden + 2, 0.3], // direct, strength 0.3
    [FOOD_L, hidden, 2], // 2 times 1.5
    [hidden, hidden + 2, -1.5],
  ]);
  const path = strongestPath(brain);
  expect(path?.nodes).toEqual([FOOD_L, hidden, hidden + 2]);
  expect(path?.text).toBe('Sees a plant on the left. Turns left, through 1 hidden neuron.');
});

test('a path through 2 hidden neurons says so, and 3 hidden neurons are too many', () => {
  const [a, b, c] = [FIRST_HIDDEN, FIRST_HIDDEN + 1, FIRST_HIDDEN + 2];
  const turn = FIRST_HIDDEN + 4;
  const two = brainOf({ [FOOD_R]: 1 }, 3, [
    [FOOD_R, a, 1],
    [a, b, 1],
    [b, turn, 1],
  ]);
  expect(strongestPath(two)).toEqual({
    nodes: [FOOD_R, a, b, turn],
    text: 'Sees a plant on the right. Turns right, through 2 hidden neurons.',
  });
  const three = brainOf({ [FOOD_R]: 1 }, 3, [
    [FOOD_R, a, 1],
    [a, b, 1],
    [b, c, 1],
    [c, turn, 1],
  ]);
  expect(strongestPath(three)).toBeNull();
});

test('a silent brain, a faint signal, and an accept wire give null', () => {
  expect(strongestPath(brainOf({}, 0, [[FOOD_R, TURN, 1]]))).toBeNull();
  expect(
    strongestPath(brainOf({ [FOOD_R]: PATH_FLOOR - 0.01 }, 0, [[FOOD_R, TURN, 1]])),
  ).toBeNull();
  expect(strongestPath(brainOf({ [FOOD_R]: 1 }, 0, [[FOOD_R, TURN + 1, 5]]))).toBeNull();
  expect(strongestPath(brainOf({ [FOOD_R]: 1 }, 0, []))).toBeNull();
});

test('a brain with loops and self-loops ends and counts no neuron twice', () => {
  const [a, b] = [FIRST_HIDDEN, FIRST_HIDDEN + 1];
  const turn = FIRST_HIDDEN + 3;
  const loops = brainOf({ [FOOD_R]: 1 }, 2, [
    [FOOD_R, a, 1],
    [a, a, 5], // a loop on itself
    [a, b, 1],
    [b, a, 5], // back
    [b, b, 5],
    [b, turn, 1],
    [turn, a, 5], // from an output
    [a, FOOD_R, 5], // into an input
  ]);
  const path = strongestPath(loops);
  expect(path?.nodes).toEqual([FOOD_R, a, b, turn]);
  expect(new Set(path?.nodes).size).toBe(path?.nodes.length);
  // Nothing leaves the loop for an output.
  const closed = brainOf({ [FOOD_R]: 1 }, 2, [
    [FOOD_R, a, 1],
    [a, b, 1],
    [b, a, 1],
    [b, b, 1],
  ]);
  expect(strongestPath(closed)).toBeNull();
});

test.each([
  [CONST, 1, 'Always swims forward.'],
  [1, 1, 'Has plenty of energy. Speeds up.'],
  [2, 1, 'Is getting old. Speeds up.'],
  [3, 1, 'Is moving fast. Speeds up.'],
  [4, 1, 'Meets a large mate. Speeds up.'],
  [5, 1, 'Meets a relative. Speeds up.'],
  [STRENGTH, 1, 'Smells food. Speeds up.'],
  [AHEAD, 1, 'Smells food getting stronger ahead. Speeds up.'],
  [AHEAD, -1, 'Smells food getting weaker ahead. Speeds up.'],
  [SIDE, 0.5, 'Smells food stronger on the right. Speeds up.'],
  [SIDE, -0.5, 'Smells food stronger on the left. Speeds up.'],
  [FOOD_R, 1, 'Sees a plant on the right. Speeds up.'],
  [FOOD_L, 1, 'Sees a plant on the left. Speeds up.'],
  [BODY_R, 1, 'Sees another body on the right. Speeds up.'],
  [BODY_L, 1, 'Sees another body on the left. Speeds up.'],
])('the phrase of input %i at %f', (input, activation, text) => {
  // A negative activation and a positive weight make a negative effect: the weight is flipped
  // so that the thrust is still positive, and the phrase of the input is what is under test.
  const weight = activation < 0 ? -1 : 1;
  const brain = brainOf({ [input]: activation }, 0, [[input, THRUST, weight]]);
  expect(strongestPath(brain)?.text).toBe(text);
});

test('the constant input reads as a habit, for each of the outputs and signs', () => {
  const habit = (dst: number, weight: number): string | undefined =>
    strongestPath(brainOf({ [CONST]: 1 }, 0, [[CONST, dst, weight]]))?.text;
  expect(habit(THRUST, 1)).toBe('Always swims forward.');
  expect(habit(THRUST, -1)).toBe('Always holds back.');
  expect(habit(TURN, 1)).toBe('Always turns right.');
  expect(habit(TURN, -1)).toBe('Always turns left.');
  const hidden = brainOf({ [CONST]: 1 }, 1, [
    [CONST, FIRST_HIDDEN, 1],
    [FIRST_HIDDEN, FIRST_HIDDEN + 1, 1],
  ]);
  expect(strongestPath(hidden)?.text).toBe('Always swims forward, through 1 hidden neuron.');
});

test('a negative side gradient and a negative weight turn the same way as a positive pair', () => {
  const brain = brainOf({ [SIDE]: -0.5 }, 0, [[SIDE, TURN, 1]]);
  expect(strongestPath(brain)?.text).toBe('Smells food stronger on the left. Turns left.');
  const same = brainOf({ [SIDE]: 0.5 }, 0, [[SIDE, TURN, 1]]);
  expect(strongestPath(same)?.text).toBe('Smells food stronger on the right. Turns right.');
});

test('a midline eye has one cone, and it looks ahead', () => {
  const inputs = [...body(0, 1, 2, 3, 4, 5), ...eye(7, [0, 1])];
  // The inputs are 8 long, so the outputs are at 8 (thrust), 9 (turn) and 10 (accept).
  const brain = brainOf({ 6: 1 }, 0, [[6, 9, 1]], inputs);
  expect(strongestPath(brain)?.text).toBe('Sees a plant ahead. Turns right.');
  expect(inputLabel(brain, 6)).toBe('food');
  expect(inputLabel(brain, 7)).toBe('body');
  const body7 = brainOf({ 7: 1 }, 0, [[7, 8, 1]], inputs);
  expect(strongestPath(body7)?.text).toBe('Sees another body ahead. Speeds up.');
});

test('the short labels of the graph', () => {
  const brain = brainOf({}, 0, []);
  expect(INPUTS.map((_, i) => inputLabel(brain, i))).toEqual([
    'always on',
    'energy',
    'age',
    'speed',
    'size',
    'kin',
    'strength',
    'ahead',
    'side',
    'food R',
    'body R',
    'food L',
    'body L',
  ]);
});

test('the path on show holds until another is clearly stronger', () => {
  const wires: Wire[] = [
    [FOOD_R, TURN, 1],
    [FOOD_L, THRUST, 1],
  ];
  const first = pickPath(brainOf({ [FOOD_R]: 1, [FOOD_L]: 0.5 }, 0, wires), null);
  expect(first?.nodes).toEqual([FOOD_R, TURN]);
  // The other grows to just under the margin: the first stays.
  const near = brainOf({ [FOOD_R]: 1, [FOOD_L]: SWITCH_MARGIN - 0.05 }, 0, wires);
  expect(strongestPath(near)?.nodes).toEqual([FOOD_L, THRUST]);
  expect(pickPath(near, first?.nodes ?? null)?.nodes).toEqual([FOOD_R, TURN]);
  // Past the margin: it switches.
  const past = brainOf({ [FOOD_R]: 1, [FOOD_L]: SWITCH_MARGIN + 0.05 }, 0, wires);
  expect(pickPath(past, first?.nodes ?? null)?.nodes).toEqual([FOOD_L, THRUST]);
  // The text of the path on show follows the brain: the weight of its wire turned.
  const turned = brainOf({ [FOOD_R]: 1 }, 0, [[FOOD_R, TURN, -1]]);
  expect(pickPath(turned, first?.nodes ?? null)?.text).toBe(
    'Sees a plant on the right. Turns left.',
  );
});

test('the path on show falls away under the floor, and a stale path is dropped', () => {
  const wires: Wire[] = [
    [FOOD_R, TURN, 1],
    [FOOD_L, THRUST, 1],
  ];
  const shown = [FOOD_R, TURN];
  // The shown path is under the floor and another is above it: the other shows.
  const brain = brainOf({ [FOOD_R]: PATH_FLOOR / 2, [FOOD_L]: 0.2 }, 0, wires);
  expect(pickPath(brain, shown)?.nodes).toEqual([FOOD_L, THRUST]);
  // Nothing is above the floor: null.
  expect(pickPath(brainOf({ [FOOD_R]: PATH_FLOOR / 2 }, 0, wires), shown)).toBeNull();
  // A path that this brain does not have is not kept.
  expect(pickPath(brainOf({ [FOOD_L]: 1 }, 0, wires), [BODY_R, TURN])?.nodes).toEqual([
    FOOD_L,
    THRUST,
  ]);
});
