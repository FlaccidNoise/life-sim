import { expect, test } from 'vitest';
import {
  KIND_CHEMO,
  KIND_EYE,
  KIND_HIDDEN,
  type BrainNeuron,
  type BrainView,
} from '../src/protocol';
import { KIND_MATE, layout } from '../src/ui/brain/layout';

const neuron = (owner: number, port: number, kind = 0, gene = 0): BrainNeuron => ({
  owner,
  port,
  kind,
  gene,
  activation: 0,
  bias: 0,
  alpha: 1,
});
const body = (...ports: number[]): BrainNeuron[] => ports.map((port) => neuron(0, port));
const eye = (owner: number, gene: number, ports: number[]): BrainNeuron[] =>
  ports.map((port) => neuron(owner, port, KIND_EYE, gene));

/** A brain of these inputs, `hidden` hidden neurons, the 3 outputs, and one connection per pair. */
function brainOf(inputs: BrainNeuron[], hidden: number, wires: [number, number][]): BrainView {
  const hiddens = Array.from({ length: hidden }, (_, i) => neuron(100 + i, 0, KIND_HIDDEN, i));
  return {
    uid: 1,
    inputs: inputs.length,
    hidden,
    outputs: 3,
    manual: false,
    neurons: [...inputs, ...hiddens, ...body(128, 129, 130)],
    connections: wires.map(([src, dst], i) => ({ src, dst, weight: 1, history: 200 + i })),
  };
}

// The inputs of a founder: the body, the mate inputs, the scent inputs, and one paired eye.
const FOUNDER_INPUTS = [...body(0, 1, 2, 3, 4, 5, 16, 17, 18), ...eye(7, 2, [0, 1, 2, 3])];

function founder(): BrainView {
  const wires: [number, number][] = [];
  for (let h = 13; h < 17; h++) {
    for (let i = 0; i < 13; i++) wires.push([i, h]);
    wires.push([h, 17], [h, 18]);
  }
  return brainOf(FOUNDER_INPUTS, 4, wires);
}

const xs = (brain: BrainView, from: number, count: number): number[] =>
  layout(brain)
    .nodes.slice(from, from + count)
    .map((n) => n.x);

test('a founder gives one group per part and 4 hidden neurons in one column', () => {
  const { nodes, groups } = layout(founder());
  expect(groups).toEqual([
    { kind: 0, gene: 0, first: 0, count: 4 },
    { kind: KIND_MATE, gene: 0, first: 4, count: 2 },
    { kind: KIND_CHEMO, gene: 0, first: 6, count: 3 },
    { kind: KIND_EYE, gene: 2, first: 9, count: 4 },
  ]);
  expect(nodes.length).toBe(20);
  expect(nodes.map((n) => n.group)).toEqual([
    ...[0, 0, 0, 0, 1, 1, 2, 2, 2, 3, 3, 3, 3],
    ...[-1, -1, -1, -1, -1, -1, -1],
  ]);
  expect(nodes.slice(0, 13).every((n) => n.x === 0)).toBe(true);
  expect(nodes.slice(17).every((n) => n.x === 1)).toBe(true);
  expect(new Set(nodes.slice(13, 17).map((n) => n.x))).toEqual(new Set([0.5]));
  // No two neurons of a column share a place, and the inputs run down the column in block order.
  for (const column of [nodes.slice(0, 13), nodes.slice(13, 17), nodes.slice(17)]) {
    const ys = column.map((n) => n.y);
    expect(ys).toEqual([...ys].sort((a, b) => a - b));
    expect(new Set(ys).size).toBe(ys.length);
    expect(Math.min(...ys)).toBeGreaterThan(0);
    expect(Math.max(...ys)).toBeLessThan(1);
  }
  // A gap parts two groups: the step across a group edge is larger than the step inside a group.
  const step = (i: number): number => (nodes[i + 1]?.y ?? 0) - (nodes[i]?.y ?? 0);
  expect(step(3)).toBeGreaterThan(step(2) * 1.5);
});

test('each eye gene is a group, and a midline eye has 2 inputs', () => {
  const inputs = [...body(0, 1, 2, 3, 4, 5), ...eye(7, 0, [0, 1, 2, 3]), ...eye(9, 3, [0, 1])];
  expect(layout(brainOf(inputs, 0, [])).groups).toEqual([
    { kind: 0, gene: 0, first: 0, count: 4 },
    { kind: KIND_MATE, gene: 0, first: 4, count: 2 },
    { kind: KIND_EYE, gene: 0, first: 6, count: 4 },
    { kind: KIND_EYE, gene: 3, first: 10, count: 2 },
  ]);
});

test('a chain of 3 hidden neurons takes 3 columns', () => {
  // Input 0 feeds hidden 4, which feeds 5, which feeds 6. Input 1 also feeds 6: the longest path
  // decides.
  const chain = brainOf(body(0, 1, 2, 3), 3, [
    [0, 4],
    [4, 5],
    [5, 6],
    [1, 6],
    [6, 8],
  ]);
  expect(xs(chain, 4, 3)).toEqual([0.25, 0.5, 0.75]);
});

test('a chain of 6 hidden neurons takes 4 columns, and a neuron with no input takes the first', () => {
  const wires: [number, number][] = [[0, 4]];
  for (let h = 4; h < 9; h++) wires.push([h, h + 1]);
  // Hidden 10 has no connection.
  expect(xs(brainOf(body(0, 1, 2, 3), 7, wires), 4, 7)).toEqual([
    0.2, 0.4, 0.6, 0.8, 0.8, 0.8, 0.2,
  ]);
});

test('a loop does not hang, and a neuron in it keeps the column of its first visit', () => {
  const loop = brainOf(body(0, 1, 2, 3), 3, [
    [0, 4],
    [4, 5],
    [5, 4], // back to the first
    [5, 5], // a loop on itself
    [5, 6],
    [6, 4], // a longer way back
    [7, 6], // from an output
  ]);
  const third = 1 / 4;
  expect(xs(loop, 4, 3)).toEqual([third, 2 * third, 3 * third]);
});

test('two calls give equal output', () => {
  expect(layout(founder())).toEqual(layout(founder()));
  const brain = founder();
  const first = JSON.stringify(layout(brain));
  expect(JSON.stringify(layout(brain))).toBe(first);
});
