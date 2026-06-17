import { type GenomeStore } from './genome';
import { genomeSignature } from './traits';

/** One genome's node in the phylogeny tree. parentRef -1 = founder root. deathTick -1 = alive. */
export interface LineageNode {
  ref: number;
  parentRef: number;
  generation: number;
  founderId: number;
  birthTick: number;
  deathTick: number;
  signature: string;
}

/**
 * Append-only-with-pruning phylogeny of genome births/deaths (M7 §5, Plan B Phase 4). Nodes are
 * keyed by genome ref. recordBirth lazily roots a child's founder parent (founders are never
 * recorded directly — they appear the moment they first reproduce). recordDeath stamps deathTick.
 * prune drops fully-extinct subtrees from the leaves up, deterministically. Part of the
 * determinism contract: written in canonical (ascending-org reproduction / ascending free) order,
 * draws no RNG; the reproducibility test hashes serializeLineageLog(...).
 */
export class LineageLog {
  private readonly nodes = new Map<number, LineageNode>();
  constructor(private readonly store: GenomeStore) {}

  recordBirth(ref: number, tick: number): void {
    if (this.nodes.has(ref)) return;
    const g = this.store.get(ref);
    if (g === undefined) return;
    // Lazily root the parent (a founder) so the child has somewhere to attach.
    if (g.parentRef >= 0 && !this.nodes.has(g.parentRef)) {
      const pg = this.store.get(g.parentRef);
      this.nodes.set(g.parentRef, {
        ref: g.parentRef,
        parentRef: -1,
        generation: Math.max(0, g.generation - 1),
        founderId: g.founderId,
        birthTick: tick,
        deathTick: -1,
        signature: pg !== undefined ? genomeSignature(pg) : '?',
      });
    }
    this.nodes.set(ref, {
      ref,
      parentRef: g.parentRef,
      generation: g.generation,
      founderId: g.founderId,
      birthTick: tick,
      deathTick: -1,
      signature: genomeSignature(g),
    });
  }

  recordDeath(ref: number, tick: number): void {
    const n = this.nodes.get(ref);
    if (n !== undefined) n.deathTick = tick;
  }

  /** Drop dead subtrees (leaves up) until size <= maxNodes. Deterministic: dead leaves removed in
   *  (deathTick asc, ref asc) order; a node with any live descendant is never a removable leaf. */
  prune(maxNodes: number): void {
    while (this.nodes.size > maxNodes) {
      const childCount = new Map<number, number>();
      for (const n of this.nodes.values()) {
        if (n.parentRef >= 0) childCount.set(n.parentRef, (childCount.get(n.parentRef) ?? 0) + 1);
      }
      const deadLeaves: LineageNode[] = [];
      for (const n of this.nodes.values()) {
        if (n.deathTick >= 0 && (childCount.get(n.ref) ?? 0) === 0) deadLeaves.push(n);
      }
      if (deadLeaves.length === 0) break; // nothing prunable (rest all alive or have live descendants)
      deadLeaves.sort((a, b) => a.deathTick - b.deathTick || a.ref - b.ref);
      let removed = 0;
      for (const n of deadLeaves) {
        if (this.nodes.size <= maxNodes) break;
        this.nodes.delete(n.ref);
        removed++;
      }
      if (removed === 0) break;
    }
  }

  /** All nodes, ascending by ref (deterministic order for display + serialization). */
  list(): LineageNode[] {
    return [...this.nodes.values()].sort((a, b) => a.ref - b.ref);
  }

  get size(): number {
    return this.nodes.size;
  }
}

export function serializeLineageLog(log: LineageLog): string {
  return JSON.stringify(log.list());
}
