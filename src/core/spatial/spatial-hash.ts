/**
 * Uniform spatial hash over a toroidal plane. Rebuilt each tick by counting sort.
 *
 * To stay allocation-free in the hot loop, the bucket data (`cols`, `rows`,
 * `invCellW/H`, `bucketStart`, `sorted`) is exposed directly so callers iterate
 * the toroidal 3×3 neighbourhood inline (no per-cell closures). Columns/rows are
 * chosen so each cell is at least `cellSize` wide, guaranteeing the 3×3 block
 * covers the interaction cutoff.
 */
export class SpatialHash {
  readonly cols: number;
  readonly rows: number;
  readonly width: number;
  readonly height: number;
  /** Multiply a coordinate by this to get its (fractional) column/row. */
  readonly invCellW: number;
  readonly invCellH: number;

  /** Prefix offsets into `sorted`, length cols*rows + 1. */
  readonly bucketStart: Uint32Array;
  /** Live cell indices grouped by bucket, length = capacity. Valid for [0, liveCount). */
  readonly sorted: Uint32Array;
  liveCount: number;

  private readonly counts: Uint32Array;
  private readonly cursor: Uint32Array;

  constructor(width: number, height: number, cellSize: number, capacity: number) {
    this.width = width;
    this.height = height;
    this.cols = Math.max(1, Math.floor(width / cellSize));
    this.rows = Math.max(1, Math.floor(height / cellSize));
    // The toroidal 3×3 neighbour iteration aliases a bucket onto itself (double-
    // counting forces) if there are fewer than 3 columns/rows. Refuse such grids.
    if (this.cols < 3 || this.rows < 3) {
      throw new Error(
        `SpatialHash needs >=3 columns and rows, got ${this.cols}x${this.rows} ` +
          `(world ${width}x${height}, cellSize ${cellSize}). Use a larger world or smaller cellSize.`,
      );
    }
    this.invCellW = this.cols / width;
    this.invCellH = this.rows / height;

    const n = this.cols * this.rows;
    this.bucketStart = new Uint32Array(n + 1);
    this.counts = new Uint32Array(n);
    this.cursor = new Uint32Array(n);
    this.sorted = new Uint32Array(capacity);
    this.liveCount = 0;
  }

  colOf(x: number): number {
    let c = (x * this.invCellW) | 0;
    if (c >= this.cols) c = this.cols - 1;
    else if (c < 0) c = 0;
    return c;
  }

  rowOf(y: number): number {
    let r = (y * this.invCellH) | 0;
    if (r >= this.rows) r = this.rows - 1;
    else if (r < 0) r = 0;
    return r;
  }

  /** Rebuild the buckets from the current live set. Allocation-free after construction. */
  build(liveIndices: Uint32Array, liveCount: number, posX: Float64Array, posY: Float64Array): void {
    const n = this.counts.length;
    this.counts.fill(0);

    for (let k = 0; k < liveCount; k++) {
      const i = liveIndices[k]!;
      const b = this.rowOf(posY[i]!) * this.cols + this.colOf(posX[i]!);
      this.counts[b]!++;
    }

    let acc = 0;
    for (let b = 0; b < n; b++) {
      this.bucketStart[b] = acc;
      this.cursor[b] = acc;
      acc += this.counts[b]!;
    }
    this.bucketStart[n] = acc;

    for (let k = 0; k < liveCount; k++) {
      const i = liveIndices[k]!;
      const b = this.rowOf(posY[i]!) * this.cols + this.colOf(posX[i]!);
      this.sorted[this.cursor[b]!++] = i;
    }

    this.liveCount = liveCount;
  }
}
