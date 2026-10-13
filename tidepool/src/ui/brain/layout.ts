// Where each neuron of a brain goes in the viewer. It reads only the shape of the brain, so the same
// brain always gives the same picture.

import { KIND_CHEMO, type BrainView } from '../../protocol';

/** The place of a neuron, 0 to 1 in both axes. `group` is -1 for a neuron that is not an input. */
export interface Placed {
  x: number;
  y: number;
  group: number;
}
/**
 * The inputs under one label. `kind` is 0 for the body, `KIND_MATE`, or the kind of the part, and
 * `gene` is the index of the part gene. `first` and `count` are a run of `brain.neurons`.
 */
export interface Group {
  kind: number;
  gene: number;
  first: number;
  count: number;
}

/** The kind of the group of the mate inputs. It is not the kind of a part: the body owns them. */
export const KIND_MATE = 254;

const MAX_COLUMNS = 4; // of hidden neurons
const GROUP_GAP = 0.75; // rows between two groups of inputs
// The ports of the body, as in crates/sim/src/brain.rs: the mate inputs start at `IN_MATE_SIZE`,
// and the scent inputs at `IN_SCENT`.
const FIRST_MATE_PORT = 4;
const FIRST_SCENT_PORT = 16;

export function layout(brain: BrainView): { nodes: Placed[]; groups: Group[] } {
  const { inputs, hidden, outputs, neurons, connections } = brain;
  const firstOut = inputs + hidden;

  const groups: Group[] = [];
  let owner = -1;
  const groupOf = neurons.slice(0, inputs).map((n, i) => {
    const kind =
      n.owner !== 0
        ? n.kind
        : n.port < FIRST_MATE_PORT
          ? 0
          : n.port < FIRST_SCENT_PORT
            ? KIND_MATE
            : KIND_CHEMO;
    const last = groups.at(-1);
    if (last && n.owner === owner && kind === last.kind) last.count++;
    else groups.push({ kind, gene: n.gene, first: i, count: 1 });
    owner = n.owner;
    return groups.length - 1;
  });

  // The column of a hidden neuron is the length of its longest path from an input, through hidden
  // neurons only. A walk that comes back to a neuron of its own path stops there, so a neuron in a
  // loop keeps the column of its first visit. A walk goes on only where it raises a column, and a
  // column is at most MAX_COLUMNS, so the walk ends.
  const next: number[][] = neurons.map(() => []);
  for (const c of connections) {
    if (c.src < firstOut && c.dst >= inputs && c.dst < firstOut) next[c.src]?.push(c.dst);
  }
  const column = neurons.map(() => 0);
  const onPath = neurons.map(() => false);
  const visit = (n: number, col: number): void => {
    if (onPath[n] || col <= (column[n] ?? 0)) return;
    column[n] = col;
    onPath[n] = true;
    for (const m of next[n] ?? []) visit(m, Math.min(col + 1, MAX_COLUMNS));
    onPath[n] = false;
  };
  for (let i = 0; i < inputs; i++) for (const m of next[i] ?? []) visit(m, 1);

  // A hidden neuron that no input reaches goes in the first column.
  const columnOf = (i: number): number => Math.max(column[i] ?? 0, 1);
  const size: number[] = []; // the hidden neurons of each column
  const rank = neurons.map(() => 0); // the place of a hidden neuron in its column, in block order
  for (let i = inputs; i < firstOut; i++) {
    const k = size[columnOf(i)] ?? 0;
    rank[i] = k;
    size[columnOf(i)] = k + 1;
  }
  const rows = inputs + (groups.length - 1) * GROUP_GAP;

  const nodes = neurons.map((_, i): Placed => {
    const group = groupOf[i];
    if (group !== undefined) return { x: 0, y: (i + group * GROUP_GAP + 0.5) / rows, group };
    if (i >= firstOut) return { x: 1, y: (i - firstOut + 0.5) / outputs, group: -1 };
    const col = columnOf(i);
    // `size` has one entry per column and one for column 0, which holds nothing.
    return { x: col / size.length, y: ((rank[i] ?? 0) + 0.5) / (size[col] ?? 1), group: -1 };
  });
  return { nodes, groups };
}
