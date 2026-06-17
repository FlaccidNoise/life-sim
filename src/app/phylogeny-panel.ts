import { type World } from '../core/sim/world';
import { type LineageNode } from '../core/genome/lineage-log';

/** Pure: render the lineage nodes as an indented text tree (roots first, children under parents). */
export function formatPhylogeny(nodes: LineageNode[], maxRows = 40): string[] {
  const lines: string[] = ['PHYLOGENY — live lineage tree (Y)'];
  if (nodes.length === 0) {
    lines.push('  no lineages yet');
    return lines;
  }
  // Build child adjacency (nodes already arrive ref-sorted from log.list()).
  const children = new Map<number, LineageNode[]>();
  const roots: LineageNode[] = [];
  for (const n of nodes) {
    if (n.parentRef < 0) roots.push(n);
    else {
      const arr = children.get(n.parentRef);
      if (arr !== undefined) arr.push(n);
      else children.set(n.parentRef, [n]);
    }
  }
  let printed = 0;
  let truncated = false;
  const walk = (n: LineageNode, depth: number): void => {
    if (printed >= maxRows) {
      truncated = true;
      return;
    }
    const pad = '  '.repeat(depth + 1);
    const status = n.deathTick >= 0 ? '†' : '·';
    lines.push(`${pad}${status} #${n.ref} g${n.generation} [${n.signature}]`);
    printed++;
    for (const c of children.get(n.ref) ?? []) {
      if (printed >= maxRows) {
        truncated = true;
        break;
      }
      walk(c, depth + 1);
    }
  };
  for (const r of roots) {
    if (printed >= maxRows) {
      truncated = true;
      break;
    }
    walk(r, 0);
  }
  if (truncated) lines.push(`  … (${nodes.length} nodes total)`);
  return lines;
}

/** Render the live phylogeny tree into the panel element (read-only). */
export function renderPhylogeny(world: World, panel: HTMLElement): void {
  panel.textContent = formatPhylogeny(world.lineage.list()).join('\n');
}
