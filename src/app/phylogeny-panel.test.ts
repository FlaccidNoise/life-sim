import { describe, it, expect } from 'vitest';
import { formatPhylogeny } from './phylogeny-panel';
import { type LineageNode } from '../core/genome/lineage-log';

function node(over: Partial<LineageNode>): LineageNode {
  return {
    ref: 0,
    parentRef: -1,
    generation: 0,
    founderId: 0,
    birthTick: 0,
    deathTick: -1,
    signature: '1p',
    ...over,
  };
}

describe('formatPhylogeny', () => {
  it('shows an empty state when there are no nodes', () => {
    expect(formatPhylogeny([]).join('\n')).toMatch(/no lineages/i);
  });

  it('renders roots first, children indented under their parent, with alive/dead markers', () => {
    const nodes: LineageNode[] = [
      node({ ref: 0, parentRef: -1, generation: 0 }),
      node({ ref: 1, parentRef: 0, generation: 1 }),
      node({ ref: 2, parentRef: 1, generation: 2, deathTick: 99 }),
    ];
    const lines = formatPhylogeny(nodes);
    const text = lines.join('\n');
    expect(text).toMatch(/PHYLOGENY/i);
    // child rows are more indented than their parents
    const l0 = lines.find((l) => l.includes('#0'))!;
    const l1 = lines.find((l) => l.includes('#1'))!;
    const l2 = lines.find((l) => l.includes('#2'))!;
    const indent = (s: string) => s.length - s.trimStart().length;
    expect(indent(l1)).toBeGreaterThan(indent(l0));
    expect(indent(l2)).toBeGreaterThan(indent(l1));
    expect(l2).toMatch(/dead|✝|†/i); // dead marker on ref 2
  });

  it('caps the number of printed rows', () => {
    const nodes: LineageNode[] = [];
    for (let i = 0; i < 50; i++)
      nodes.push(node({ ref: i, parentRef: i === 0 ? -1 : 0, generation: i === 0 ? 0 : 1 }));
    const lines = formatPhylogeny(nodes, 10);
    expect(lines.length).toBeLessThanOrEqual(12); // header + cap + possible truncation note
  });
});
