import { type CellStore } from '../memory/cell-store';

/**
 * The bond network (§4.4, §4.8, §5.2). A flat SoA pool with a free-list and
 * gen-validated endpoints (slot index + generation in SEPARATE parallel arrays —
 * never bit-packed, §4.2), plus a per-cell fixed-max-degree adjacency so step-5
 * FORCES and step-8 split-checks are O(degree) and cell-local. `liveBonds` is a
 * compact ascending list rebuilt on structural events (`rebuildLive`); the force /
 * transfer / digest kernels iterate it and never mutate the pool.
 *
 * One global pool across all organisms in single-thread (mirrors `NeuralNetwork`);
 * M8 partitions by organism graph.
 */
export class BondNetwork {
  readonly maxCells: number;
  readonly maxBonds: number;
  readonly degreeCap: number;

  // Bond SoA pool.
  readonly cellA: Uint32Array;
  readonly genA: Uint32Array;
  readonly cellB: Uint32Array;
  readonly genB: Uint32Array;
  readonly restLen: Float32Array;
  /** Relative stiffness (1 = nominal); the force kernel scales by cfg.bondStiffness. */
  readonly stiffness: Float32Array;
  private readonly bondAlive: Uint8Array;
  private readonly bondFree: Int32Array;
  private bondFreeTop: number;

  // Per-cell adjacency: adj[i·cap + k] is the k-th bond slot of cell i, k < degree[i].
  readonly adj: Int32Array;
  readonly degree: Uint8Array;

  // Compact live-bond list, rebuilt on structural events (ascending slot order).
  readonly liveBonds: Uint32Array;
  liveBondCount: number;

  constructor(maxCells: number, maxBonds: number, degreeCap: number) {
    this.maxCells = maxCells;
    this.maxBonds = maxBonds;
    this.degreeCap = degreeCap;

    this.cellA = new Uint32Array(maxBonds);
    this.genA = new Uint32Array(maxBonds);
    this.cellB = new Uint32Array(maxBonds);
    this.genB = new Uint32Array(maxBonds);
    this.restLen = new Float32Array(maxBonds);
    this.stiffness = new Float32Array(maxBonds);
    this.bondAlive = new Uint8Array(maxBonds);
    this.bondFree = new Int32Array(maxBonds);
    for (let i = 0; i < maxBonds; i++) this.bondFree[i] = maxBonds - 1 - i;
    this.bondFreeTop = maxBonds;

    this.adj = new Int32Array(maxCells * degreeCap);
    this.degree = new Uint8Array(maxCells);

    this.liveBonds = new Uint32Array(maxBonds);
    this.liveBondCount = 0;
  }

  isAlive(s: number): boolean {
    return this.bondAlive[s] === 1;
  }

  /** Allocate a bond; -1 if the pool is full OR either endpoint is at the degree cap. */
  addBond(
    a: number,
    genA: number,
    b: number,
    genB: number,
    restLen: number,
    stiffness: number,
  ): number {
    const cap = this.degreeCap;
    if (this.degree[a]! >= cap || this.degree[b]! >= cap) return -1; // degree overflow
    if (this.bondFreeTop === 0) return -1; // pool overflow (refuse-new)
    const s = this.bondFree[--this.bondFreeTop]!;
    this.cellA[s] = a;
    this.genA[s] = genA;
    this.cellB[s] = b;
    this.genB[s] = genB;
    this.restLen[s] = restLen;
    this.stiffness[s] = stiffness;
    this.bondAlive[s] = 1;
    this.adj[a * cap + this.degree[a]!] = s;
    this.degree[a] = (this.degree[a]! + 1) & 0xff;
    this.adj[b * cap + this.degree[b]!] = s;
    this.degree[b] = (this.degree[b]! + 1) & 0xff;
    return s;
  }

  /** Remove a bond, detaching it from both endpoints' adjacency (swap-remove). O(degree). */
  removeBond(s: number): void {
    if (this.bondAlive[s] === 0) return;
    this.bondAlive[s] = 0;
    this.detach(this.cellA[s]!, s);
    this.detach(this.cellB[s]!, s);
    this.bondFree[this.bondFreeTop++] = s;
  }

  private detach(c: number, s: number): void {
    const cap = this.degreeCap;
    const off = c * cap;
    const d = this.degree[c]!;
    for (let k = 0; k < d; k++) {
      if (this.adj[off + k]! === s) {
        this.adj[off + k] = this.adj[off + d - 1]!; // swap with the last entry
        this.degree[c] = (d - 1) & 0xff;
        return;
      }
    }
  }

  /**
   * Rebuild the live-bond list (ascending slot order). A bond with a dangling
   * endpoint (dead/recycled cell — generation mismatch) is pruned. Called on
   * structural events (build, after a break) and once per tick, never inside the
   * force loop.
   */
  rebuildLive(store: CellStore): void {
    let nb = 0;
    for (let s = 0; s < this.maxBonds; s++) {
      if (this.bondAlive[s] === 0) continue;
      if (!store.validate(this.cellA[s]!, this.genA[s]!)) continue;
      if (!store.validate(this.cellB[s]!, this.genB[s]!)) continue;
      this.liveBonds[nb++] = s;
    }
    this.liveBondCount = nb;
  }
}
