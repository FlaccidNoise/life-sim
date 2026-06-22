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
 *
 * TWO CHANNELS (niche partitioning, lever B): with channels===2 a SECOND independent biomass array B2
 * regrows/diffuses identically over the SAME fertility map, and each cell's cap is split between the two
 * (A gets 1−ratio, B gets ratio) so total biomass per cell is unchanged. Dietary specialists (FORAGE_PREF
 * gene) can then partition the resource. With channels===1 (default) B2 is never allocated and every code
 * path is byte-identical to the single-resource field (the ablation OFF state).
 */
export class FoodField {
  readonly cols: number;
  readonly rows: number;
  private readonly cellW: number;
  private readonly cellH: number;
  private readonly initFraction: number;
  private readonly fertility: Float32Array; // per-cell K share, [0,1]
  private readonly channels: number; // 1 (default, single field) or 2 (second resource B2)
  private readonly ratio: number; // channel-B share of each cell's cap, [0,1] (A gets 1−ratio)
  private B: Float64Array;
  private scratch: Float64Array;
  private B2: Float64Array | null = null; // second channel; allocated only when channels===2
  private scratch2: Float64Array | null = null;

  constructor(
    private readonly worldWidth: number,
    private readonly worldHeight: number,
    cols: number,
    rows: number,
    private readonly cap: number,
    initFraction: number,
    channels = 1,
    channelRatio = 0.5,
  ) {
    this.cols = cols;
    this.rows = rows;
    this.cellW = worldWidth / cols;
    this.cellH = worldHeight / rows;
    this.initFraction = initFraction;
    this.channels = channels;
    this.ratio = channelRatio;
    this.fertility = new Float32Array(cols * rows).fill(1); // uniform full world by default
    this.B = new Float64Array(cols * rows);
    this.scratch = new Float64Array(cols * rows);
    if (channels === 2) {
      this.B2 = new Float64Array(cols * rows);
      this.scratch2 = new Float64Array(cols * rows);
    }
    this.refill();
  }

  /** Channel-A cap fraction of cap·fertility. Single-channel = 1 (×1 is an IEEE identity, so the field is
   *  byte-identical to the legacy one); two-channel = 1−ratio, so A + B sum back to the full cap. */
  private get fracA(): number {
    return this.channels === 2 ? 1 - this.ratio : 1;
  }

  /** B ← capShare·fertility·initFraction (the seeded starting biomass per cell, per channel). */
  private refill(): void {
    const fracA = this.fracA;
    for (let i = 0; i < this.B.length; i++)
      this.B[i] = this.cap * this.fertility[i]! * fracA * this.initFraction;
    if (this.B2)
      for (let i = 0; i < this.B2.length; i++)
        this.B2[i] = this.cap * this.fertility[i]! * this.ratio * this.initFraction;
  }

  /**
   * Carve `count` Gaussian fertility pockets (radius `radiusCells`, in grid cells) over a near-dead
   * baseline — the archipelago. Deterministic via the provided RNG. Refills biomass to the new map.
   * Both channels share the SAME fertility map (a pocket is rich in both resources).
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
    if (this.scratch2) this.scratch2.fill(0);
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

  /** Biomass at a world position (channel A). */
  sampleAt(x: number, y: number): number {
    return this.B[this.idx(x, y)]!;
  }

  /** Biomass at a world position (channel B). 0 when the second channel is not active. */
  sampleAt2(x: number, y: number): number {
    return this.B2 ? this.B2[this.idx(x, y)]! : 0;
  }

  /** Remove up to `amount` biomass at a position (channel A); returns the amount actually taken. */
  grazeAt(x: number, y: number, amount: number): number {
    const i = this.idx(x, y);
    const avail = this.B[i]!;
    const taken = avail < amount ? avail : amount;
    this.B[i] = avail - taken;
    return taken;
  }

  /** Remove up to `amount` biomass at a position (channel B); returns what was taken. 0 if B2 inactive. */
  grazeAt2(x: number, y: number, amount: number): number {
    if (!this.B2) return 0;
    const i = this.idx(x, y);
    const avail = this.B2[i]!;
    const taken = avail < amount ? avail : amount;
    this.B2[i] = avail - taken;
    return taken;
  }

  /** Total standing biomass across all active channels (for telemetry / the population graph). */
  total(): number {
    let s = 0;
    for (let i = 0; i < this.B.length; i++) s += this.B[i]!;
    if (this.B2) for (let i = 0; i < this.B2.length; i++) s += this.B2[i]!;
    return s;
  }

  /** Global per-cell capacity ceiling (for normalizing the render overlay). */
  get capacity(): number {
    return this.cap;
  }

  /**
   * Write the grid into `out` (length cols·rows) as biomass/capacity scaled to 0..255, row-major
   * (row 0 = world top). For the render heatmap — keeps the field's buffer private + core DOM-free.
   * Channel A only (render is unchanged by the second channel for now).
   */
  fillTexture(out: Uint8Array): void {
    const inv = this.cap > 0 ? 255 / this.cap : 0;
    for (let i = 0; i < this.B.length; i++) {
      const v = this.B[i]! * inv;
      out[i] = v < 0 ? 0 : v > 255 ? 255 : v;
    }
  }

  /** Logistic regrowth (toward each cell's K = capShare·fertility) + toroidal diffusion, per channel.
   *  regen=0 = inert. Channel A uses the fracA share (=1 when single-channel → byte-identical). */
  step(regen: number, diffuse: number): void {
    this.stepChannel(this.B, this.fracA, regen, diffuse, false);
    if (this.B2) this.stepChannel(this.B2, this.ratio, regen, diffuse, true);
  }

  /** One channel's logistic regrowth + diffusion. `capFrac` is this channel's share of cap·fertility;
   *  `second` selects the B2/scratch2 buffers (vs B/scratch) for the double-buffered diffusion swap. */
  private stepChannel(
    field: Float64Array,
    capFrac: number,
    regen: number,
    diffuse: number,
    second: boolean,
  ): void {
    const { cols, rows, cap, fertility } = this;
    if (regen > 0) {
      for (let i = 0; i < field.length; i++) {
        const k = cap * fertility[i]! * capFrac;
        const b = field[i]!;
        let nb: number;
        if (k <= 1e-6) {
          nb = b * (1 - regen); // dead water: decay toward 0 (no carrying capacity here)
        } else {
          nb = b + regen * b * (1 - b / k);
          if (nb > k) nb = k;
        }
        field[i] = nb < 0 ? 0 : nb;
      }
    }
    if (diffuse > 0) {
      const out = second ? this.scratch2! : this.scratch;
      for (let r = 0; r < rows; r++) {
        const up = ((r - 1 + rows) % rows) * cols;
        const dn = ((r + 1) % rows) * cols;
        const cur = r * cols;
        for (let c = 0; c < cols; c++) {
          const l = (c - 1 + cols) % cols;
          const rt = (c + 1) % cols;
          const avg4 =
            (field[up + c]! + field[dn + c]! + field[cur + l]! + field[cur + rt]!) * 0.25;
          out[cur + c] = field[cur + c]! + diffuse * (avg4 - field[cur + c]!);
        }
      }
      if (second) {
        this.B2 = out;
        this.scratch2 = field;
      } else {
        this.B = out;
        this.scratch = field;
      }
    }
  }

  /** Mix the field into a deterministic state hash (food is part of sim state). Channel B is mixed in
   *  ONLY when active, so the single-channel hash is byte-identical to the legacy field. */
  hashInto(h: { f: (v: number) => void }): void {
    for (let i = 0; i < this.B.length; i++) h.f(this.B[i]!);
    if (this.B2) for (let i = 0; i < this.B2.length; i++) h.f(this.B2[i]!);
  }
}
