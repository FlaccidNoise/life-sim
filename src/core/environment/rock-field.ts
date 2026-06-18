import { type Rng } from '../math/rng';
import { wrapDelta } from '../math/vec2';

/**
 * Static terrain: immovable circular obstacles scattered across the toroidal
 * world. Rocks are NOT cells — they live outside the cell SoA, have no
 * metabolism, and never die. They create spatial heterogeneity (shelter,
 * chokepoints, territory) that fuels ecological speciation (spec §4.5 refuge
 * payoff, §10 R1).
 *
 * A uniform grid over rocks enables O(1) neighbour queries in the collision
 * hot path. Allocation-free after construction.
 */
export class RockField {
  /** Rock positions and radii (SoA, length = capacity). Valid indices [0, rockCount). */
  readonly cx: Float32Array;
  readonly cy: Float32Array;
  readonly radius: Float32Array;

  /** Number of placed rocks (≤ capacity). */
  rockCount: number;

  // --- Uniform grid for O(1) neighbour queries ---
  readonly gridCols: number;
  readonly gridRows: number;
  readonly width: number;
  readonly height: number;
  readonly invCellW: number;
  readonly invCellH: number;

  /** Prefix offsets into `sorted`, length gridCols * gridRows + 1. */
  readonly bucketStart: Uint32Array;
  /** Rock indices grouped by grid bucket, length = capacity. Valid [0, rockCount). */
  readonly sorted: Uint32Array;

  private readonly counts: Uint32Array;
  private readonly cursor: Uint32Array;

  constructor(
    maxRocks: number,
    gridCols: number,
    gridRows: number,
    worldWidth: number,
    worldHeight: number,
  ) {
    this.cx = new Float32Array(maxRocks);
    this.cy = new Float32Array(maxRocks);
    this.radius = new Float32Array(maxRocks);
    this.rockCount = 0;

    this.gridCols = gridCols;
    this.gridRows = gridRows;
    this.width = worldWidth;
    this.height = worldHeight;
    this.invCellW = gridCols / worldWidth;
    this.invCellH = gridRows / worldHeight;

    // The toroidal 3×3 neighbour iteration aliases a bucket onto itself if there
    // are fewer than 3 columns or rows. Refuse such grids.
    if (gridCols < 3 || gridRows < 3) {
      throw new Error(
        `RockField grid needs >=3 columns and rows, got ${gridCols}x${gridRows}. ` +
          `Use a larger world or smaller rockGridSize.`,
      );
    }

    const n = gridCols * gridRows;
    this.bucketStart = new Uint32Array(n + 1);
    this.counts = new Uint32Array(n);
    this.cursor = new Uint32Array(n);
    this.sorted = new Uint32Array(maxRocks);
  }

  /**
   * Seeded placement of `count` rocks via rejection sampling, toroidal-safe.
   * Rocks are non-overlapping (center distance ≥ rA + rB). Each rock gets up to
   * 50 placement attempts; if an attempt fails the rock is skipped, so rockCount
   * may be less than count in extremely dense configurations.
   * Reproducible from the seed.
   */
  init(
    rng: Rng,
    count: number,
    worldWidth: number,
    worldHeight: number,
    radiusMin: number,
    radiusMax: number,
  ): void {
    const maxAttempts = 50;
    let placed = 0;

    for (let i = 0; i < count && i < this.cx.length; i++) {
      const r = rng.range(radiusMin, radiusMax);
      let ok = false;

      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const x = rng.range(0, worldWidth);
        const y = rng.range(0, worldHeight);

        let overlap = false;
        for (let j = 0; j < placed; j++) {
          const dx = wrapDelta(x - this.cx[j]!, worldWidth);
          const dy = wrapDelta(y - this.cy[j]!, worldHeight);
          const minDist = r + this.radius[j]!;
          if (dx * dx + dy * dy < minDist * minDist) {
            overlap = true;
            break;
          }
        }

        if (!overlap) {
          this.cx[placed] = x;
          this.cy[placed] = y;
          this.radius[placed] = r;
          placed++;
          ok = true;
          break;
        }
      }

      if (!ok) continue; // skip rock — too dense
    }

    this.rockCount = placed;
    this.buildGrid();
  }

  /**
   * Rebuild the uniform grid from current rock positions. Called by init();
   * also useful for tests that manually place rocks.
   * Allocation-free after construction.
   */
  buildGrid(): void {
    const n = this.counts.length;
    this.counts.fill(0);

    for (let i = 0; i < this.rockCount; i++) {
      const b = this.rowOf(this.cy[i]!) * this.gridCols + this.colOf(this.cx[i]!);
      this.counts[b]!++;
    }

    let acc = 0;
    for (let b = 0; b < n; b++) {
      this.bucketStart[b] = acc;
      this.cursor[b] = acc;
      acc += this.counts[b]!;
    }
    this.bucketStart[n] = acc;

    for (let i = 0; i < this.rockCount; i++) {
      const b = this.rowOf(this.cy[i]!) * this.gridCols + this.colOf(this.cx[i]!);
      this.sorted[this.cursor[b]!++] = i;
    }
  }

  /** Grid column for a world x-coordinate (clamped). */
  colOf(x: number): number {
    let c = (x * this.invCellW) | 0;
    if (c >= this.gridCols) c = this.gridCols - 1;
    else if (c < 0) c = 0;
    return c;
  }

  /** Grid row for a world y-coordinate (clamped). */
  rowOf(y: number): number {
    let r = (y * this.invCellH) | 0;
    if (r >= this.gridRows) r = this.gridRows - 1;
    else if (r < 0) r = 0;
    return r;
  }
}