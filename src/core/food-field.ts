/**
 * Food as a coarse logistic biomass FIELD (not individual entities — so carrying-capacity regrowth is
 * O(grid), not O(N) bookkeeping). Each cell holds biomass B ∈ [0, K]:
 *
 *   regrow:  B += r·B·(1 − B/K)            (logistic — recovers after grazing)
 *   diffuse: B ← B + d·(avg4 − B)          (slow inter-cell spread)
 *
 * The diffusion is the producer-extinction fix: pure logistic has an absorbing state at B=0 (0→0
 * forever), which is exactly how the old engine's producers went permanently extinct. Diffusion
 * reseeds grazed-empty cells from surviving neighbors, so global extinction would require EVERY cell
 * at zero simultaneously. Toroidal, double-buffered (order-independent), deterministic.
 */
export class FoodField {
  readonly cols: number;
  readonly rows: number;
  private readonly cellW: number;
  private readonly cellH: number;
  private B: Float64Array;
  private scratch: Float64Array;

  constructor(
    private readonly worldWidth: number,
    private readonly worldHeight: number,
    cols: number,
    rows: number,
    private readonly cap: number,
    initFraction: number,
  ) {
    this.cols = cols;
    this.rows = rows;
    this.cellW = worldWidth / cols;
    this.cellH = worldHeight / rows;
    this.B = new Float64Array(cols * rows);
    this.scratch = new Float64Array(cols * rows);
    this.B.fill(cap * initFraction);
  }

  /** Refill to the initial state (so World.reset stays byte-identical to a fresh construction). */
  reset(initFraction: number): void {
    this.B.fill(this.cap * initFraction);
    this.scratch.fill(0);
  }

  private idx(x: number, y: number): number {
    let c = Math.floor(x / this.cellW);
    let r = Math.floor(y / this.cellH);
    if (c < 0) c = 0;
    else if (c >= this.cols) c = this.cols - 1;
    if (r < 0) r = 0;
    else if (r >= this.rows) r = this.rows - 1;
    return r * this.cols + c;
  }

  /** Biomass at a world position. */
  sampleAt(x: number, y: number): number {
    return this.B[this.idx(x, y)]!;
  }

  /** Remove up to `amount` biomass at a position; returns the amount actually taken (≤ available). */
  grazeAt(x: number, y: number, amount: number): number {
    const i = this.idx(x, y);
    const avail = this.B[i]!;
    const taken = avail < amount ? avail : amount;
    this.B[i] = avail - taken;
    return taken;
  }

  /** Total standing biomass (for telemetry / the population graph). */
  total(): number {
    let s = 0;
    for (let i = 0; i < this.B.length; i++) s += this.B[i]!;
    return s;
  }

  /** Per-cell carrying capacity K (for normalizing the render overlay). */
  get capacity(): number {
    return this.cap;
  }

  /**
   * Write the grid into `out` (length cols·rows) as biomass/capacity scaled to 0..255, row-major
   * (row 0 = world top). For the render heatmap — keeps the field's buffer private + core DOM-free.
   */
  fillTexture(out: Uint8Array): void {
    const inv = this.cap > 0 ? 255 / this.cap : 0;
    for (let i = 0; i < this.B.length; i++) {
      const v = this.B[i]! * inv;
      out[i] = v < 0 ? 0 : v > 255 ? 255 : v;
    }
  }

  /** Logistic regrowth + toroidal diffusion. `regen`=0 makes food inert (the ablation → extinction). */
  step(regen: number, diffuse: number): void {
    const { cols, rows, cap, B } = this;
    if (regen > 0) {
      for (let i = 0; i < B.length; i++) {
        const b = B[i]!;
        let nb = b + regen * b * (1 - b / cap);
        if (nb < 0) nb = 0;
        else if (nb > cap) nb = cap;
        B[i] = nb;
      }
    }
    if (diffuse > 0) {
      const out = this.scratch;
      for (let r = 0; r < rows; r++) {
        const up = ((r - 1 + rows) % rows) * cols;
        const dn = ((r + 1) % rows) * cols;
        const cur = r * cols;
        for (let c = 0; c < cols; c++) {
          const l = (c - 1 + cols) % cols;
          const rt = (c + 1) % cols;
          const avg4 = (B[up + c]! + B[dn + c]! + B[cur + l]! + B[cur + rt]!) * 0.25;
          out[cur + c] = B[cur + c]! + diffuse * (avg4 - B[cur + c]!);
        }
      }
      this.B = out;
      this.scratch = B;
    }
  }

  /** Mix the field into a deterministic state hash (food is part of sim state). */
  hashInto(h: { f: (v: number) => void }): void {
    for (let i = 0; i < this.B.length; i++) h.f(this.B[i]!);
  }
}
