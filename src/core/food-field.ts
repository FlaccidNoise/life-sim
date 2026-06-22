/**
 * Food as a coarse logistic biomass FIELD (not individual entities — so carrying-capacity regrowth is
 * O(grid), not O(N) bookkeeping). Each cell has a fertility f ∈ [0,1] (its share of the global cap),
 * giving a per-cell carrying capacity K = cap·f, and a biomass B ∈ [0, K]:
 *
 *   regrow:  B += r·B·(1 − B/K)            (logistic — recovers after grazing)
 *   diffuse: B ← B + d·(avg4 − B)          (slow inter-cell spread)
 *
 * WALLS DAM THE FIELD: when a `blocked` mask is passed (food-resolution, 1=rock), blocked cells are
 * forced to B=0 each step and the diffusion stencil treats a blocked neighbour as no-flux (it contributes
 * the cell's OWN value), so biomass can't leak into/through rock and pools against it. blocked=null is the
 * walls-OFF path — byte-identical to the legacy field (the ablation contract).
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
import { type FlowField } from './flow-field';

export class FoodField {
  readonly cols: number;
  readonly rows: number;
  /** World-space (x,y) of each pocket centre, set by seedPatches. Diagnostics only (creatures-per-pocket,
   *  between-pocket gene variance) — not part of sim state, not hashed. */
  readonly patchCenters: { x: number; y: number }[] = [];
  private readonly cellW: number;
  private readonly cellH: number;
  private readonly initFraction: number;
  private readonly fertility: Float32Array; // per-cell K share, [0,1]
  // Per-cell TOTAL carrying capacity (summed across channels). Baseline = cap·fertility (so it tracks the
  // [0,1] fertility map); lever C's pocketCapVariance overwrites it per pocket so K can exceed cap. Each
  // channel's K is Kcell·capFrac. Float64 (not Float32) so the v=0 baseline is BYTE-IDENTICAL to the old
  // `cap·fertility` reads — a Float32 store would round the float64 product and break the determinism gate.
  private readonly Kcell: Float64Array;
  private readonly channels: number; // 1 (default, single field) or 2 (second resource B2)
  private readonly ratio: number; // channel-B share of each cell's cap, [0,1] (A gets 1−ratio)
  // Lever C bookkeeping (set by seedPatches): pocket centres in WORLD coords (so a probe can assign each
  // creature to its island) + the variance actually applied (so maxCapacity reports the true render ceiling).
  private patchCentres: { x: number; y: number }[] = [];
  private varianceUsed = 0;
  private B: Float64Array;
  private scratch: Float64Array;
  private B2: Float64Array | null = null; // second channel; allocated only when channels===2
  private scratch2: Float64Array | null = null;
  private advectScratch: Float64Array | null = null; // reused flux-accumulation buffer (lazy)

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
    this.Kcell = new Float64Array(cols * rows);
    this.B = new Float64Array(cols * rows);
    this.scratch = new Float64Array(cols * rows);
    if (channels === 2) {
      this.B2 = new Float64Array(cols * rows);
      this.scratch2 = new Float64Array(cols * rows);
    }
    this.recomputeK();
    this.refill();
  }

  /** Recompute the per-cell carrying capacity from the fertility map: Kcell = cap·fertility (the uniform
   *  baseline). Called whenever fertility changes (construction + seedPatches). Lever C overwrites Kcell
   *  per pocket AFTER this, so this is the v=0 / no-variance state. */
  private recomputeK(): void {
    for (let i = 0; i < this.Kcell.length; i++) this.Kcell[i] = this.cap * this.fertility[i]!;
  }

  /** Channel-A cap fraction of cap·fertility. Single-channel = 1 (×1 is an IEEE identity, so the field is
   *  byte-identical to the legacy one); two-channel = 1−ratio, so A + B sum back to the full cap. */
  private get fracA(): number {
    return this.channels === 2 ? 1 - this.ratio : 1;
  }

  /** B ← Kcell·capShare·initFraction (the seeded starting biomass per cell, per channel). Reads the
   *  per-cell capacity Kcell (= cap·fertility at the v=0 baseline) so it stays byte-identical to the old
   *  `cap·fertility·frac·init` while letting lever C vary K per pocket. */
  private refill(): void {
    const fracA = this.fracA;
    for (let i = 0; i < this.B.length; i++) this.B[i] = this.Kcell[i]! * fracA * this.initFraction;
    if (this.B2)
      for (let i = 0; i < this.B2.length; i++)
        this.B2[i] = this.Kcell[i]! * this.ratio * this.initFraction;
  }

  /**
   * Carve `count` Gaussian fertility pockets (radius `radiusCells`, in grid cells) over a near-dead
   * baseline — the archipelago. Deterministic via the provided RNG. Refills biomass to the new map.
   * Both channels share the SAME fertility map (a pocket is rich in both resources).
   *
   * Lever C (per-pocket K variance): with `variance > 0` (and a `forkedRng`), each pocket draws an
   * independent richness scale s ∈ [1−variance, 1+variance] from the FORKED stream, and the per-cell
   * carrying capacity Kcell is built from the SCALED Gaussian sum (kAccum) rather than the [0,1]-clamped
   * fertility map — so a rich pocket reaches cap·(1+variance) and a lean one cap·(1−variance). The
   * fertility map itself is left UNSCALED (it still feeds the world's "in a pocket" founder test + each
   * channel's biomass share). With `variance === 0` no scale is drawn and Kcell is rebuilt via recomputeK
   * (= cap·fertility, float32 read) so the field is byte-identical to a no-variance world.
   */
  seedPatches(
    count: number,
    radiusCells: number,
    baseFertility: number,
    rng: { float(): number },
    // SP1 sticky-pockets (deepen the fertility map; main-rng draw, gated on richnessVar):
    richness = 1,
    richnessVar = 0,
    maxFertility = 1,
    // Lever C per-pocket K variance (scale Kcell; forked-rng draw, gated on variance):
    variance = 0,
    forkedRng?: { float(): number },
  ): void {
    const { cols, rows, fertility } = this;
    fertility.fill(baseFertility);
    this.patchCenters.length = 0;
    this.patchCentres = [];
    const twoSigma2 = 2 * radiusCells * radiusCells;
    // Only build the scaled-K accumulator when variance is active; otherwise the v=0 path stays exactly
    // the legacy fertility-only accumulation (→ recomputeK → byte-identical).
    const useVar = variance > 0 && !!forkedRng;
    this.varianceUsed = useVar ? variance : 0;
    const kAccum = useVar ? new Float64Array(cols * rows) : null;
    for (let p = 0; p < count; p++) {
      const pc = rng.float() * cols;
      const pr = rng.float() * rows;
      this.patchCenters.push({ x: pc * this.cellW, y: pr * this.cellH });
      this.patchCentres.push({ x: pc * this.cellW, y: pr * this.cellH });
      // SP1 per-pocket peak amplitude. With richnessVar===0 we draw NOTHING extra (peak = richness), so when
      // richness===1 + maxFertility===1 the loop is byte-identical to legacy (+g, clamp 1). Only when
      // variation is on do we consume one MAIN-rng draw per pocket — kept here, before creatures are seeded.
      const peak =
        richnessVar > 0 ? richness * (1 + richnessVar * (2 * rng.float() - 1)) : richness;
      // Lever C per-pocket carrying-capacity scale s_p ∈ [1−variance, 1+variance], from the FORKED stream so
      // the MAIN rng (placement + peak) is identical to the v=0 run. s_p ≡ 1 when variance is off (no draw).
      const sp = useVar ? 1 - variance + forkedRng!.float() * (2 * variance) : 1;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          // toroidal cell distance to the patch centre
          let dc = Math.abs(c - pc);
          if (dc > cols / 2) dc = cols - dc;
          let dr = Math.abs(r - pr);
          if (dr > rows / 2) dr = rows - dr;
          const g = Math.exp(-(dc * dc + dr * dr) / twoSigma2);
          const i = r * cols + c;
          const v = fertility[i]! + peak * g;
          fertility[i] = v > maxFertility ? maxFertility : v;
          // Lever C K accumulation parallels the fertility build; peak===1 when SP1 is off, so this reduces
          // exactly to lever C's `g·sp` in isolation (and to the legacy path when both are off → kAccum null).
          if (kAccum) kAccum[i] = kAccum[i]! + peak * g * sp;
        }
      }
    }
    if (kAccum) {
      // Build Kcell from the scaled Gaussian sum, clamped to [0, cap·(1+variance)]: dead water stays at
      // cap·baseFertility and a pocket peak reaches up to cap·(1+variance).
      const upper = 1 + variance;
      for (let i = 0; i < kAccum.length; i++) {
        let f = baseFertility + kAccum[i]!;
        if (f < 0) f = 0;
        else if (f > upper) f = upper;
        this.Kcell[i] = this.cap * f;
      }
    } else {
      this.recomputeK(); // v=0: byte-identical cap·fertility (reads the float32 fertility map)
    }
    this.refill();
  }

  /** Read-only view of the fertility map (for the wall generator's pocket awareness). */
  fertilityMap(): Float32Array {
    return this.fertility;
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

  /** Per-cell FERTILITY at a world position — the stable "is this a pocket" signal (unlike biomass, which
   *  dips when grazed). Pockets ≥ ~1 (deep ones >1), dead water ≈ baseFertility. For the dead-water tax. */
  fertilityAt(x: number, y: number): number {
    return this.fertility[this.idx(x, y)]!;
  }

  /** Per-cell carrying capacity K at a world position (= cap·fertility at baseline; lever C scales it per
   *  pocket). Read-only — lets a probe read each pocket's richness to test K-vs-trait divergence directly. */
  capacityAt(x: number, y: number): number {
    return this.Kcell[this.idx(x, y)]!;
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

  /** Global per-cell capacity ceiling = foodCap (the base K; the world's "in a pocket" founder test keys
   *  off this, so it stays the GLOBAL cap even under lever C — do not switch it to per-pocket K). */
  get capacity(): number {
    return this.cap;
  }

  /** The highest per-cell K actually reachable = cap·(1+pocketCapVariance) (lever C). Used to normalize
   *  the render overlay so rich pockets don't clip white. Equals `capacity` when variance is off. */
  get maxCapacity(): number {
    return this.cap * (1 + this.varianceUsed);
  }

  /** Pocket centres in WORLD coordinates, recorded during the last seedPatches (empty when none seeded).
   *  Read-only — lets the biome-divergence probe assign each creature to its nearest island. */
  pocketCentres(): readonly { x: number; y: number }[] {
    return this.patchCentres;
  }

  /**
   * Write the grid into `out` (length cols·rows) as biomass/capacity scaled to 0..255, row-major
   * (row 0 = world top). For the render heatmap — keeps the field's buffer private + core DOM-free.
   * Channel A only (render is unchanged by the second channel for now).
   */
  fillTexture(out: Uint8Array): void {
    // Normalize against the MAX reachable K (cap·(1+variance)) so lever-C rich pockets don't clip white.
    // With variance off this equals cap, so the texture is unchanged.
    const max = this.maxCapacity;
    const inv = max > 0 ? 255 / max : 0;
    for (let i = 0; i < this.B.length; i++) {
      const v = this.B[i]! * inv;
      out[i] = v < 0 ? 0 : v > 255 ? 255 : v;
    }
  }

  /** Logistic regrowth (toward each cell's K = capShare·fertility) + toroidal diffusion, per channel.
   *  regen=0 = inert. Channel A uses the fracA share (=1 when single-channel → byte-identical).
   *  `blocked` (food-resolution, 1=rock) dams the field; null = walls-OFF (byte-identical legacy path).
   *  `flow` advects biomass along the current; null = no advection (body lands in a later task). */
  step(regen: number, diffuse: number, flow: FlowField | null, blocked: Uint8Array | null): void {
    this.stepChannel(this.B, this.fracA, regen, diffuse, false, blocked);
    if (this.B2) this.stepChannel(this.B2, this.ratio, regen, diffuse, true, blocked);
    if (flow !== null) this.advect(flow, blocked);
  }

  /** One channel's logistic regrowth + diffusion. `capFrac` is this channel's share of cap·fertility;
   *  `second` selects the B2/scratch2 buffers (vs B/scratch) for the double-buffered diffusion swap.
   *  `blocked` dams the channel: blocked cells are forced to 0 and diffusion is no-flux at walls. */
  private stepChannel(
    field: Float64Array,
    capFrac: number,
    regen: number,
    diffuse: number,
    second: boolean,
    blocked: Uint8Array | null,
  ): void {
    const { cols, rows, Kcell } = this;
    if (regen > 0) {
      for (let i = 0; i < field.length; i++) {
        if (blocked !== null && blocked[i] === 1) {
          field[i] = 0; // rock grows nothing
          continue;
        }
        // Kcell = cap·fertility at baseline (byte-identical to the legacy read), scaled per pocket by lever C.
        const k = Kcell[i]! * capFrac;
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
          const self = field[cur + c]!;
          if (blocked !== null && blocked[cur + c] === 1) {
            out[cur + c] = 0; // rock holds no biomass
            continue;
          }
          const l = (c - 1 + cols) % cols;
          const rt = (c + 1) % cols;
          // A blocked neighbour is no-flux: it contributes the cell's OWN value, so biomass can't leak
          // into/through rock and pools against the wall.
          const vU = blocked !== null && blocked[up + c] === 1 ? self : field[up + c]!;
          const vD = blocked !== null && blocked[dn + c] === 1 ? self : field[dn + c]!;
          const vL = blocked !== null && blocked[cur + l] === 1 ? self : field[cur + l]!;
          const vR = blocked !== null && blocked[cur + rt] === 1 ? self : field[cur + rt]!;
          const avg4 = (vU + vD + vL + vR) * 0.25;
          out[cur + c] = self + diffuse * (avg4 - self);
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

  /** First-order donor-cell (upwind) flux advection of biomass along the flow field. Conservative
   *  (every flux subtracted from a donor is added to a receiver) and no-flux at walls. CFL ≤ 0.25
   *  (enforced by FlowField) keeps it positivity-preserving with 4 outflow faces. */
  private advect(flow: FlowField, blocked: Uint8Array | null): void {
    const { cols, rows, cellW, cellH } = this;
    this.advectChannel(this.B, flow, blocked, cols, rows, cellW, cellH);
    if (this.B2) this.advectChannel(this.B2, flow, blocked, cols, rows, cellW, cellH);
  }

  private advectChannel(
    B: Float64Array,
    flow: FlowField,
    blocked: Uint8Array | null,
    cols: number,
    rows: number,
    cellW: number,
    cellH: number,
  ): void {
    const out = this.advectScratch ?? (this.advectScratch = new Float64Array(B.length));
    out.set(B);
    const { flowX, flowY } = flow;
    // Per-axis 1/cell: +x divides by cellW, +y by cellH (they differ on a non-square food grid).
    const invX = 1 / cellW;
    const invY = 1 / cellH;
    for (let r = 0; r < rows; r++) {
      const cur = r * cols;
      const dn = ((r + 1) % rows) * cols;
      for (let c = 0; c < cols; c++) {
        const i = cur + c;
        const rt = cur + ((c + 1) % cols);
        const di = dn + c;
        if (blocked === null || blocked[i] === 0) {
          // Flux omits a dt factor: this assumes the dt=1 fixed-scale safeguard. At dt<1 the moved
          // fraction (|v|·dt/cell) would exceed the CFL=0.25 ceiling and break positivity.
          // +x face to the right neighbour
          if (blocked === null || blocked[rt] === 0) {
            const uf = 0.5 * (flowX[i]! + flowX[rt]!);
            const flux = uf * (uf > 0 ? B[i]! : B[rt]!) * invX;
            out[i]! -= flux;
            out[rt]! += flux;
          }
          // +y face to the lower neighbour
          if (blocked === null || blocked[di] === 0) {
            const vf = 0.5 * (flowY[i]! + flowY[di]!);
            const flux = vf * (vf > 0 ? B[i]! : B[di]!) * invY;
            out[i]! -= flux;
            out[di]! += flux;
          }
        }
      }
    }
    // copy back (B is the canonical buffer; out is reused scratch)
    B.set(out);
  }

  /** Mix the field into a deterministic state hash (food is part of sim state). Channel B is mixed in
   *  ONLY when active, so the single-channel hash is byte-identical to the legacy field. */
  hashInto(h: { f: (v: number) => void }): void {
    for (let i = 0; i < this.B.length; i++) h.f(this.B[i]!);
    if (this.B2) for (let i = 0; i < this.B2.length; i++) h.f(this.B2[i]!);
  }
}
