/**
 * Food as a coarse logistic biomass FIELD (not individual entities — so carrying-capacity regrowth is
 * O(grid), not O(N) bookkeeping). Each cell has a fertility f ∈ [0,1] (its share of the global cap),
 * giving a per-cell carrying capacity K = cap·f, and a biomass B ∈ [0, K]:
 *
 *   regrow:  B += r·B·(1 − B/K)            (logistic — recovers after grazing)
 *   diffuse: B ← B + d·(avg4 − B)          (slow inter-cell spread)
 *
 * Diffusion is the producer-extinction fix: pure logistic has an absorbing state at B=0, exactly how
 * the old engine's producers went permanently extinct. Diffusion reseeds grazed-empty cells from
 * neighbors, so global extinction needs EVERY cell at zero at once. Toroidal, double-buffered.
 *
 * Fertility defaults to uniform 1 (a normal full world). `seedPatches` carves Gaussian fertility
 * POCKETS (rich) with near-dead water between — the archipelago substrate: food only grows in the
 * pockets, so isolated communities form and can diverge.
 */
export class FoodField {
  readonly cols: number;
  readonly rows: number;
  private readonly cellW: number;
  private readonly cellH: number;
  private readonly initFraction: number;
  private readonly fertility: Float32Array; // per-cell K share, [0,1]
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
    this.initFraction = initFraction;
    this.fertility = new Float32Array(cols * rows).fill(1); // uniform full world by default
    this.B = new Float64Array(cols * rows);
    this.scratch = new Float64Array(cols * rows);
    this.refill();
  }

  /** B ← cap·fertility·initFraction (the seeded starting biomass per cell). */
  private refill(): void {
    for (let i = 0; i < this.B.length; i++)
      this.B[i] = this.cap * this.fertility[i]! * this.initFraction;
  }

  /**
   * Carve `count` Gaussian fertility pockets (radius `radiusCells`, in grid cells) over a near-dead
   * baseline — the archipelago. Deterministic via the provided RNG. Refills biomass to the new map.
   */
  seedPatches(
    count: number,
    radiusCells: number,
    baseFertility: number,
    rng: { float(): number },
  ): void {
    const { cols, rows, fertility } = this;
    fertility.fill(baseFertility);
    const twoSigma2 = 2 * radiusCells * radiusCells;
    for (let p = 0; p < count; p++) {
      const pc = rng.float() * cols;
      const pr = rng.float() * rows;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          // toroidal cell distance to the patch centre
          let dc = Math.abs(c - pc);
          if (dc > cols / 2) dc = cols - dc;
          let dr = Math.abs(r - pr);
          if (dr > rows / 2) dr = rows - dr;
          const g = Math.exp(-(dc * dc + dr * dr) / twoSigma2);
          const i = r * cols + c;
          const v = fertility[i]! + g;
          fertility[i] = v > 1 ? 1 : v;
        }
      }
    }
    this.refill();
  }

  /** Refill to the initial biomass (so World.reset reproduces a fresh construction's state). */
  reset(): void {
    this.refill();
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

  /** Global per-cell capacity ceiling (for normalizing the render overlay). */
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

  /** Logistic regrowth (toward each cell's K = cap·fertility) + toroidal diffusion. regen=0 = inert. */
  step(regen: number, diffuse: number): void {
    const { cols, rows, cap, B, fertility } = this;
    if (regen > 0) {
      for (let i = 0; i < B.length; i++) {
        const k = cap * fertility[i]!;
        const b = B[i]!;
        let nb: number;
        if (k <= 1e-6) {
          nb = b * (1 - regen); // dead water: decay toward 0 (no carrying capacity here)
        } else {
          nb = b + regen * b * (1 - b / k);
          if (nb > k) nb = k;
        }
        B[i] = nb < 0 ? 0 : nb;
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
