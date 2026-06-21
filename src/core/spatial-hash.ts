/**
 * Uniform spatial hash for neighbor queries — the substrate every later interaction kernel (repulsion
 * now; sensing, eating, predation later) builds on. Rebuilt each tick by COUNTING SORT: O(N), and the
 * per-bucket contents come out in ascending slot order, which gives deterministic neighbor iteration
 * for free (a determinism rule). Toroidal: the 3×3 cell neighborhood wraps at the world edges.
 *
 * Cell size ≥ the interaction cutoff (2·cellRadius), so a 3×3 neighborhood is guaranteed to contain
 * every potential interactor.
 */
import { type OrganismStore } from './store';

export class SpatialHash {
  readonly cols: number;
  readonly rows: number;
  private readonly cellW: number;
  private readonly cellH: number;
  /** Prefix sums (length cols*rows + 1): bucket b spans sorted[bucketStart[b] .. bucketStart[b+1]). */
  readonly bucketStart: Uint32Array;
  /** Slot ids grouped by bucket, ascending within each bucket. Public so kernels inline the scan. */
  readonly sorted: Uint32Array;
  private readonly counts: Uint32Array;

  constructor(
    private readonly worldWidth: number,
    private readonly worldHeight: number,
    cellSize: number,
    capacity: number,
  ) {
    this.cols = Math.max(1, Math.floor(worldWidth / cellSize));
    this.rows = Math.max(1, Math.floor(worldHeight / cellSize));
    this.cellW = worldWidth / this.cols;
    this.cellH = worldHeight / this.rows;
    this.bucketStart = new Uint32Array(this.cols * this.rows + 1);
    this.sorted = new Uint32Array(capacity);
    this.counts = new Uint32Array(this.cols * this.rows);
  }

  colOf(x: number): number {
    const c = Math.floor(x / this.cellW);
    return c < 0 ? 0 : c >= this.cols ? this.cols - 1 : c;
  }
  rowOf(y: number): number {
    const r = Math.floor(y / this.cellH);
    return r < 0 ? 0 : r >= this.rows ? this.rows - 1 : r;
  }

  /** Rebuild from the store's current live set (call after rebuildLive, before any query). */
  build(store: OrganismStore): void {
    const { cols, rows, counts, bucketStart, sorted } = this;
    const nb = cols * rows;
    counts.fill(0);
    const { liveIndices, liveCount, x, y } = store;
    // 1. count per bucket
    for (let k = 0; k < liveCount; k++) {
      const i = liveIndices[k]!;
      counts[this.rowOf(y[i]!) * cols + this.colOf(x[i]!)]!++;
    }
    // 2. prefix sums → bucketStart
    let acc = 0;
    for (let b = 0; b < nb; b++) {
      bucketStart[b] = acc;
      acc += counts[b]!;
    }
    bucketStart[nb] = acc;
    // 3. scatter live slots in ASCENDING order → sorted[] ascending within each bucket
    const cursor = counts; // reuse as write cursors
    for (let b = 0; b < nb; b++) cursor[b] = bucketStart[b]!;
    for (let k = 0; k < liveCount; k++) {
      const i = liveIndices[k]!;
      const b = this.rowOf(y[i]!) * cols + this.colOf(x[i]!);
      sorted[cursor[b]!++] = i;
    }
  }

  /**
   * Occupancy stats for the perf readout (read-only over the current build). `occupied`/`buckets` is
   * how sparse the grid is; `maxBucket` is the worst-case neighbor-scan clump (the cost driver — a fat
   * bucket means an expensive 3×3 scan), and `meanOccupied` the typical occupied-cell load.
   */
  stats(): { buckets: number; occupied: number; maxBucket: number; meanOccupied: number } {
    const { bucketStart } = this;
    const nb = this.cols * this.rows;
    let occupied = 0;
    let maxBucket = 0;
    let total = 0;
    for (let b = 0; b < nb; b++) {
      const n = bucketStart[b + 1]! - bucketStart[b]!;
      if (n > 0) {
        occupied++;
        total += n;
        if (n > maxBucket) maxBucket = n;
      }
    }
    return { buckets: nb, occupied, maxBucket, meanOccupied: occupied ? total / occupied : 0 };
  }

  /**
   * Invoke `fn(j)` for every slot in the 3×3 toroidal neighborhood of world point (x, y), in
   * deterministic (ascending bucket, ascending slot) order. The caller filters self / distance.
   */
  forEachNeighbor(x: number, y: number, fn: (j: number) => void): void {
    const { cols, rows, bucketStart, sorted } = this;
    const cx = this.colOf(x);
    const cy = this.rowOf(y);
    for (let dy = -1; dy <= 1; dy++) {
      const by = (cy + dy + rows) % rows;
      for (let dx = -1; dx <= 1; dx++) {
        const bx = (cx + dx + cols) % cols;
        const b = by * cols + bx;
        const end = bucketStart[b + 1]!;
        for (let idx = bucketStart[b]!; idx < end; idx++) fn(sorted[idx]!);
      }
    }
  }
}
