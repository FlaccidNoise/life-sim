/**
 * Lineage recorder — UI-only family-tree bookkeeping fed by the read-only config.onBirth hook. The
 * sim core stores no ancestry, so the demo records it: founders snapshotted at seed/reset, every
 * birth attributed child→parent. Pure observation — never feeds the sim, so determinism (same
 * config+seed → same hash) is untouched.
 *
 * Identity = `${slot}:${genId}` (a recycled slot is a different individual). onBirth fires INSIDE
 * reproduce() and must not touch the store, so it only buffers ints; commit(store,tick) — called
 * right after each world.step() — drains the buffer and snapshots birth-time hue/diet (a dead
 * ancestor's recycled slot would read the wrong genes if read live).
 */
import { ScalarGene, SCALAR_GENE_COUNT } from '../../core/genome';

/** The narrow store surface the recorder reads. OrganismStore satisfies it structurally; tests pass
 *  a plain object. */
export interface LineageStore {
  readonly hue: ArrayLike<number>;
  readonly scalarGenes: ArrayLike<number>;
  readonly genId: ArrayLike<number>;
  readonly liveIndices: ArrayLike<number>;
  readonly liveCount: number;
  isAlive(slot: number, gen?: number): boolean;
}

interface LineageNode {
  key: string;
  slot: number;
  genId: number;
  generation: number;
  parentKey: string | null;
  birthTick: number;
  hue: number;
  diet: number;
  childKeys: string[];
  directChildren: number; // authoritative; never decremented (survives pruning)
  descendants: number; // transitive; incremented up the chain at birth (survives pruning)
}

export interface LineageRow {
  key: string;
  slot: number;
  genId: number;
  generation: number;
  birthTick: number;
  hue: number;
  diet: number;
  alive: boolean;
}

export interface LineageView {
  ancestors: LineageRow[]; // founder → … → selected (selected last)
  children: LineageRow[]; // direct children of the selected node
  selectedKey: string;
  dynasty: number; // transitive descendants ever born to the selected node
  directChildren: number; // authoritative (≥ children.length if some were pruned)
  founderKey: string;
  prunedLeaves: number; // total dead leaves pruned this run (cap visibility)
  orphanBirths: number; // births whose parent wasn't in the forest (should be 0; surfaced if not)
}

const DEFAULT_MAX_NODES = 50_000;

function keyOf(slot: number, gen: number): string {
  return `${slot}:${gen}`;
}

export class Lineage {
  private nodes = new Map<string, LineageNode>();
  private pending: Array<{ pKey: string; cSlot: number; cGen: number }> = [];
  private prunedLeaves = 0;
  private orphanBirths = 0;

  constructor(private readonly maxNodes: number = DEFAULT_MAX_NODES) {}

  /** config.onBirth handler — pre-bound so it can be assigned directly. Buffers ints ONLY (contract:
   *  no store/RNG/iteration access inside reproduce()). */
  readonly onBirth = (pSlot: number, pGen: number, cSlot: number, cGen: number): void => {
    this.pending.push({ pKey: keyOf(pSlot, pGen), cSlot, cGen });
  };

  /** Clear the forest, then snapshot the current live population as gen-0 founders. Call at startup
   *  (after new World) and on every rebuild()/reset(). */
  reset(store: LineageStore): void {
    this.nodes.clear();
    this.pending.length = 0;
    this.prunedLeaves = 0;
    this.orphanBirths = 0;
    for (let k = 0; k < store.liveCount; k++) {
      const slot = store.liveIndices[k]!;
      const gen = store.genId[slot]!;
      const key = keyOf(slot, gen);
      this.nodes.set(key, {
        key,
        slot,
        genId: gen,
        generation: 0,
        parentKey: null,
        birthTick: 0,
        hue: store.hue[slot]!,
        diet: store.scalarGenes[slot * SCALAR_GENE_COUNT + ScalarGene.DIET]!,
        childKeys: [],
        directChildren: 0,
        descendants: 0,
      });
    }
  }

  /** Drain the births buffered since the last step. Reads the store for birth-time gene snapshots
   *  (the child slot is alive now). Safe outside reproduce() — never touches RNG/iteration. */
  commit(store: LineageStore, tick: number): void {
    if (this.pending.length === 0) return;
    for (const b of this.pending) {
      const cKey = keyOf(b.cSlot, b.cGen);
      // The parent is normally present: founders are snapshotted before any step, and a node is
      // never pruned while it has children, so this fallback should not fire in the default flow.
      // If it ever does, the child is recorded as a gen-1 root and counted in orphanBirths so the
      // anomaly is surfaced (see LineageView/modal) rather than silently corrupting a dynasty.
      const parent = this.nodes.get(b.pKey);
      if (parent === undefined) this.orphanBirths++;
      this.nodes.set(cKey, {
        key: cKey,
        slot: b.cSlot,
        genId: b.cGen,
        generation: parent ? parent.generation + 1 : 1,
        parentKey: parent ? b.pKey : null,
        birthTick: tick,
        hue: store.hue[b.cSlot]!,
        diet: store.scalarGenes[b.cSlot * SCALAR_GENE_COUNT + ScalarGene.DIET]!,
        childKeys: [],
        directChildren: 0,
        descendants: 0,
      });
      if (parent) {
        parent.childKeys.push(cKey);
        parent.directChildren++;
        // Walk up the ancestor chain incrementing transitive descendant counts.
        let a: LineageNode | undefined = parent;
        while (a) {
          a.descendants++;
          a = a.parentKey ? this.nodes.get(a.parentKey) : undefined;
        }
      }
    }
    this.pending.length = 0;
    if (this.nodes.size > this.maxNodes) this.prune(store);
  }

  /** Prune oldest dead-and-childless leaves until back under cap. Counts are baked in at birth, so
   *  dynasty/directChildren totals stay exact — only the pruned row vanishes from listings. */
  private prune(store: LineageStore): void {
    const leaves: LineageNode[] = [];
    for (const n of this.nodes.values()) {
      if (n.childKeys.length === 0 && !store.isAlive(n.slot, n.genId)) leaves.push(n);
    }
    leaves.sort((a, b) => a.birthTick - b.birthTick);
    let i = 0;
    while (this.nodes.size > this.maxNodes && i < leaves.length) {
      const n = leaves[i++]!;
      this.nodes.delete(n.key);
      this.prunedLeaves++;
      if (n.parentKey) {
        const p = this.nodes.get(n.parentKey);
        if (p) {
          const idx = p.childKeys.indexOf(n.key);
          if (idx >= 0) p.childKeys.splice(idx, 1);
        }
      }
    }
  }

  /** Build the ancestor spine + direct children + dynasty stats for a key, or null if it's unknown
   *  (e.g. a stale pre-reset selection). */
  query(key: string, store: LineageStore): LineageView | null {
    const node = this.nodes.get(key);
    if (node === undefined) return null;
    const toRow = (n: LineageNode): LineageRow => ({
      key: n.key,
      slot: n.slot,
      genId: n.genId,
      generation: n.generation,
      birthTick: n.birthTick,
      hue: n.hue,
      diet: n.diet,
      alive: store.isAlive(n.slot, n.genId),
    });
    // Ancestor chain selected → founder, then reversed to founder → selected.
    const chain: LineageNode[] = [];
    const guard = new Set<string>(); // cycle guard (defensive; the forest is acyclic by construction)
    let cur: LineageNode | undefined = node;
    while (cur && !guard.has(cur.key)) {
      guard.add(cur.key);
      chain.push(cur);
      cur = cur.parentKey ? this.nodes.get(cur.parentKey) : undefined;
    }
    chain.reverse();
    const children = node.childKeys
      .map((k) => this.nodes.get(k))
      .filter((n): n is LineageNode => n !== undefined)
      .map(toRow);
    return {
      ancestors: chain.map(toRow),
      children,
      selectedKey: node.key,
      dynasty: node.descendants,
      directChildren: node.directChildren,
      founderKey: chain[0]!.key,
      prunedLeaves: this.prunedLeaves,
      orphanBirths: this.orphanBirths,
    };
  }

  /** Convenience: query by (slot, gen). */
  queryBySlot(slot: number, gen: number, store: LineageStore): LineageView | null {
    return this.query(keyOf(slot, gen), store);
  }

  get size(): number {
    return this.nodes.size;
  }
}
