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
  private readonly pocketChannelMode: number; // F1 (channels===3 only): 0 = all pockets channel A, 1 = p%3
  // Lever C bookkeeping (set by seedPatches): pocket centres in WORLD coords (so a probe can assign each
  // creature to its island) + the variance actually applied (so maxCapacity reports the true render ceiling).
  private patchCentres: { x: number; y: number }[] = [];
  private varianceUsed = 0;
  private B: Float64Array;
  private scratch: Float64Array;
  private B2: Float64Array | null = null; // second channel; allocated only when channels===2
  private scratch2: Float64Array | null = null;
  // F1 third channel (place-coupled): B3/scratch3 are allocated ONLY when channels===3, mirroring the B2
  // path exactly. `channelMask` (allocated only when channels===3) assigns each cell to exactly one channel
  // (0=A, 1=B, 2=C) so a pocket grows only its own resource — allopatric partitioning. Mode 0 leaves the
  // mask all-zero (every cell channel A → B3/B2 inert, the ablation). The N<=2 paths never touch any of this.
  private B3: Float64Array | null = null;
  private scratch3: Float64Array | null = null;
  private channelMask: Uint8Array | null = null;
  private advectScratch: Float64Array | null = null; // reused flux-accumulation buffer (lazy)
  // ch2-diff levers. wallTied: when true (and a mask is active), bias channel-A pockets toward near-wall
  // cells and channel-B pockets toward open water (deterministic, RNG-free). driftMult: per-channel-B
  // advection multiplier (channel B is advected at driftMult× the others → a mobile downstream plume).
  // Both default to the byte-identical OFF state (false / 1).
  private readonly wallTied: boolean;
  private readonly driftMult: number;
  // ── Migrating pockets (the centres themselves move over time). All OFF-state defaults below leave the
  // field byte-identical to a static archipelago: with driftRate===0, seedPatches draws NO forked velocity
  // RNG and driftPockets is a no-op. When ON, each channel's pockets sweep along a GLOBAL direction (dirA /
  // dirB) drawn from a FORKED rng (the main organism stream is never touched), and the fertility/Kcell/
  // channelMask are periodically RE-CARVED (RNG-free) from the moved centres while biomass stays in place.
  private driftRate = 0;
  private driftInterval = 20;
  private driftRateA = 0.2;
  private driftRateB = 1;
  private driftBaseSpeed = 0.6;
  // Per-pocket persistent state captured at seedPatches so a recarve can rebuild the maps from the MOVED
  // centres without redrawing anything: live centre (col,row in grid cells), peak amplitude, lever-C scale,
  // and assigned channel (0=A,1=B,2=C). pc/pr are MUTATED by driftPockets; the rest are preserved as it moves.
  private pocketPc: Float64Array = new Float64Array(0);
  private pocketPr: Float64Array = new Float64Array(0);
  private pocketPeak: Float64Array = new Float64Array(0);
  private pocketScale: Float64Array = new Float64Array(0);
  private pocketChan: Int32Array = new Int32Array(0);
  private pocketCount = 0;
  private radiusCells = 0;
  private baseFert = 0;
  private maxFert = 1;
  private useVar = false;
  private variance = 0;
  // Per-channel global drift unit vectors (world units/displacement direction). Drawn from the forked
  // velocity rng at seedPatches when drift is ON; A and B are guaranteed to point measurably different ways.
  private dirAx = 0;
  private dirAy = 0;
  private dirBx = 0;
  private dirBy = 0;
  // Saved start-of-run pocket centres (grid cells) so reset() restores the archipelago to its seeded t0.
  private seedPc: Float64Array = new Float64Array(0);
  private seedPr: Float64Array = new Float64Array(0);

  constructor(
    private readonly worldWidth: number,
    private readonly worldHeight: number,
    cols: number,
    rows: number,
    private readonly cap: number,
    initFraction: number,
    channels = 1,
    channelRatio = 0.5,
    pocketChannelMode = 0,
    wallTied = false,
    driftMult = 1,
  ) {
    this.cols = cols;
    this.rows = rows;
    this.cellW = worldWidth / cols;
    this.cellH = worldHeight / rows;
    this.initFraction = initFraction;
    this.channels = channels;
    this.ratio = channelRatio;
    this.pocketChannelMode = pocketChannelMode;
    this.wallTied = wallTied;
    this.driftMult = driftMult;
    this.fertility = new Float32Array(cols * rows).fill(1); // uniform full world by default
    this.Kcell = new Float64Array(cols * rows);
    this.B = new Float64Array(cols * rows);
    this.scratch = new Float64Array(cols * rows);
    if (channels === 2) {
      this.B2 = new Float64Array(cols * rows);
      this.scratch2 = new Float64Array(cols * rows);
      // ch2-diff: with pocketChannelMode===1 the two channels become PLACE-COUPLED (each pocket grows only
      // its assigned channel, like the channels===3 path), so allocate the per-cell channel mask. Mode 0
      // (the default) leaves the mask null → the legacy SHARED-fertility two-channel path is byte-identical.
      if (pocketChannelMode === 1) this.channelMask = new Uint8Array(cols * rows);
    }
    if (channels === 3) {
      // Three place-coupled channels: all three biomass buffers + the per-cell channel-assignment mask.
      // Mask defaults to 0 (all channel A) so a freshly-constructed N=3 field is single-resource until
      // seedPatches assigns pockets (mode 1) — keeps construction deterministic and RNG-free.
      this.B2 = new Float64Array(cols * rows);
      this.scratch2 = new Float64Array(cols * rows);
      this.B3 = new Float64Array(cols * rows);
      this.scratch3 = new Float64Array(cols * rows);
      this.channelMask = new Uint8Array(cols * rows);
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
    if (this.channelMask) {
      // Place-coupled (channels===3, OR channels===2 with pocketChannelMode===1): each cell's full Kcell is
      // seeded into ONLY its assigned channel (mask), the others start empty there. So an A-pocket holds
      // biomass only in channel A. The mask gates this entirely. B3 is absent at channels===2 (mask ∈ {0,1}).
      const mask = this.channelMask;
      const init = this.initFraction;
      for (let i = 0; i < this.B.length; i++) {
        const k = this.Kcell[i]! * init;
        const m = mask[i]!;
        this.B[i] = m === 0 ? k : 0;
        this.B2![i] = m === 1 ? k : 0;
        if (this.B3) this.B3[i] = m === 2 ? k : 0;
      }
      return;
    }
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
    // ch2-diff: when wall-tied placement is active, this returns the hop-distance from a world (x,y) to the
    // nearest wall (smaller = nearer a wall). Only read when this.wallTied && a mask is active; the draw
    // order is unaffected (pure read after the centre is drawn). undefined → legacy index-based assignment.
    proximityFn?: (x: number, y: number) => number,
    // Migrating pockets: drift parameters + a FORKED velocity rng (for the per-channel directions). When
    // driftRate===0 (or velocityRng is undefined) NO draw happens and the field is byte-identical to a
    // static archipelago. velocityRng is forked off the MAIN rng so the organism stream is never touched.
    driftRate = 0,
    driftInterval = 20,
    driftRateA = 0.2,
    driftRateB = 1,
    driftBaseSpeed = 0.6,
    velocityRng?: { float(): number },
  ): void {
    const { cols, rows } = this;
    this.patchCenters.length = 0;
    this.patchCentres = [];
    // variance is active only when a forked rng is supplied; otherwise the v=0 path stays the legacy
    // fertility-only build (recarve → recomputeK → byte-identical).
    const useVar = variance > 0 && !!forkedRng;
    // mask presence gates the wall-tied channel split below (the carve itself lives in recarve()).
    const mask = this.channelMask;
    // PRE-PASS: draw all pocket centres (+ optional peak) up front, in the SAME main-rng order as the legacy
    // single loop (pc, pr, then peak per pocket), recording each. This lets the wall-tied split decide a
    // pocket's channel from GLOBAL info (its wall-proximity rank) without changing the RNG draw sequence.
    const pcs = new Float64Array(count);
    const prs = new Float64Array(count);
    const peaks = new Float64Array(count);
    const prox = new Float64Array(count);
    const useWallTie = !!mask && this.wallTied && this.pocketChannelMode === 1 && !!proximityFn;
    for (let p = 0; p < count; p++) {
      const pc = rng.float() * cols;
      const pr = rng.float() * rows;
      pcs[p] = pc;
      prs[p] = pr;
      const wx = pc * this.cellW;
      const wy = pr * this.cellH;
      this.patchCenters.push({ x: wx, y: wy });
      this.patchCentres.push({ x: wx, y: wy });
      // SP1 per-pocket peak amplitude. With richnessVar===0 we draw NOTHING extra (peak = richness), so when
      // richness===1 + maxFertility===1 the loop is byte-identical to legacy (+g, clamp 1). Only when
      // variation is on do we consume one MAIN-rng draw per pocket — kept here, before creatures are seeded.
      peaks[p] = richnessVar > 0 ? richness * (1 + richnessVar * (2 * rng.float() - 1)) : richness;
      if (useWallTie) prox[p] = proximityFn!(wx, wy);
    }
    // Per-pocket channel assignment. Wall-tied: split pockets at the MEDIAN wall-proximity — the near-wall
    // half → channel A (wall-tied structural resource), the open-water half → channel B (the drifter). Pure
    // read of prox[], deterministic, RNG-free. Legacy: round-robin p%channels (mode 1) / all-A (mode 0).
    const pocketChannels = new Int32Array(count);
    if (mask) {
      if (useWallTie) {
        const sortedProx = Array.from(prox.subarray(0, count)).sort((a, b) => a - b);
        const median = count > 0 ? sortedProx[Math.floor(count / 2)]! : 0;
        for (let p = 0; p < count; p++) pocketChannels[p] = prox[p]! < median ? 0 : 1;
      } else if (this.pocketChannelMode === 1) {
        for (let p = 0; p < count; p++) pocketChannels[p] = p % this.channels;
      }
      // else mode 0: all-A (Int32Array already zero-initialised)
    }
    // Lever C per-pocket carrying-capacity scale s_p ∈ [1−variance, 1+variance], from the FORKED stream so
    // the MAIN rng (placement + peak) is identical to the v=0 run. Drawn here in the SAME per-pocket order as
    // the legacy carve loop (p=0..count), so moving the draw out of the carve loop is byte-identical. s_p ≡ 1
    // when variance is off (no draw). Captured per pocket so a recarve reuses the SAME scale as it moves.
    const scales = new Float64Array(count);
    for (let p = 0; p < count; p++)
      scales[p] = useVar ? 1 - variance + forkedRng!.float() * (2 * variance) : 1;
    // Capture the per-pocket persistent state (centre in grid cells, peak, lever-C scale, channel) so the
    // periodic recarve can rebuild the maps from the MOVED centres without redrawing. Also save the seeded
    // start centres so reset() restores the archipelago to t0.
    this.pocketCount = count;
    this.radiusCells = radiusCells;
    this.baseFert = baseFertility;
    this.maxFert = maxFertility;
    this.useVar = useVar;
    this.variance = variance;
    this.pocketPc = pcs;
    this.pocketPr = prs;
    this.pocketPeak = peaks;
    this.pocketScale = scales;
    this.pocketChan = pocketChannels;
    this.seedPc = pcs.slice();
    this.seedPr = prs.slice();
    // Migrating pockets: stash the drift params + draw the two per-channel GLOBAL directions from the FORKED
    // velocity rng. driftRate===0 (or no velocity rng) → NO draw, dir vectors stay zero, byte-identical OFF.
    this.driftRate = driftRate;
    this.driftInterval = driftInterval;
    this.driftRateA = driftRateA;
    this.driftRateB = driftRateB;
    this.driftBaseSpeed = driftBaseSpeed;
    if (driftRate > 0 && velocityRng) this.drawDriftDirections(velocityRng);
    else {
      this.dirAx = this.dirAy = this.dirBx = this.dirBy = 0;
    }
    // Carve the maps from the (start) centres. RNG-free — the actual Gaussian build is shared with the recarve.
    this.recarve();
  }

  /**
   * Rebuild fertility + channelMask + Kcell from the CURRENT per-pocket centres (pocketPc/pocketPr), then
   * refill biomass to the new map. RNG-FREE and deterministic — it reuses the exact carve math from the
   * legacy seedPatches body but reads the (possibly moved) centres. Called once at the end of seedPatches
   * (centres at t0) and again by driftPockets after the centres advance, so the pocket visibly migrates.
   * With useVar===false this reduces to the legacy fertility-only build → byte-identical to a static field.
   */
  private recarve(refillBiomass = true): void {
    const { cols, rows, fertility } = this;
    const count = this.pocketCount;
    fertility.fill(this.baseFert);
    this.varianceUsed = this.useVar ? this.variance : 0;
    const twoSigma2 = 2 * this.radiusCells * this.radiusCells;
    const kAccum = this.useVar ? new Float64Array(cols * rows) : null;
    // Each cell is tagged with the channel of its DOMINANT (largest-g) pocket. bestG tracks the dominance.
    // Reset to all-A first so dead water (no pocket) defaults to channel A. Only when a mask is active.
    const mask = this.channelMask;
    const bestG = mask ? new Float32Array(cols * rows) : null;
    if (mask) mask.fill(0);
    const maxFertility = this.maxFert;
    for (let p = 0; p < count; p++) {
      const pocketChannel = mask ? this.pocketChan[p]! : 0;
      const pc = this.pocketPc[p]!;
      const pr = this.pocketPr[p]!;
      const peak = this.pocketPeak[p]!;
      const sp = this.pocketScale[p]!;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          // toroidal cell distance to the patch centre
          let dc = Math.abs(c - pc);
          if (dc > cols / 2) dc = cols - dc;
          let dr = Math.abs(r - pr);
          if (dr > rows / 2) dr = rows - dr;
          const g = Math.exp(-(dc * dc + dr * dr) / twoSigma2);
          const i = r * cols + c;
          if (mask && g > bestG![i]!) {
            bestG![i] = g;
            mask[i] = pocketChannel;
          }
          const v = fertility[i]! + peak * g;
          fertility[i] = v > maxFertility ? maxFertility : v;
          if (kAccum) kAccum[i] = kAccum[i]! + peak * g * sp;
        }
      }
    }
    if (kAccum) {
      // Build Kcell from the scaled Gaussian sum, clamped to [0, cap·(1+variance)]: dead water stays at
      // cap·baseFertility and a pocket peak reaches up to cap·(1+variance).
      const upper = 1 + this.variance;
      for (let i = 0; i < kAccum.length; i++) {
        let f = this.baseFert + kAccum[i]!;
        if (f < 0) f = 0;
        else if (f > upper) f = upper;
        this.Kcell[i] = this.cap * f;
      }
    } else {
      this.recomputeK(); // v=0: byte-identical cap·fertility (reads the float32 fertility map)
    }
    if (refillBiomass) this.refill();
  }

  /**
   * Draw the two per-channel GLOBAL drift directions from the FORKED velocity rng (never the main organism
   * stream). dirA and dirB are unit vectors; B is guaranteed to point MEASURABLY differently from A (if the
   * random pair lands within ~0.6 rad we rotate B by a fixed offset), so the two channels' pockets sweep
   * along genuinely crossing currents rather than near-parallel. RNG-free callers (recarve/driftPockets)
   * never reach this — only seedPatches, once, when drift is ON.
   */
  private drawDriftDirections(velocityRng: { float(): number }): void {
    const aAng = velocityRng.float() * 2 * Math.PI;
    let bAng = velocityRng.float() * 2 * Math.PI;
    // Force a clear angular separation: if A and B are closer than ~0.6 rad (either direction), offset B by
    // a fixed ~2.1 rad so the two currents visibly cross. Deterministic (reads the already-drawn angles).
    let d = Math.abs(bAng - aAng) % (2 * Math.PI);
    if (d > Math.PI) d = 2 * Math.PI - d;
    if (d < 0.6) bAng = aAng + 2.1;
    this.dirAx = Math.cos(aAng);
    this.dirAy = Math.sin(aAng);
    this.dirBx = Math.cos(bAng);
    this.dirBy = Math.sin(bAng);
  }

  /**
   * Advance the pocket CENTRES (so food migrates) and periodically re-carve the maps from the moved centres.
   * Every driftInterval ticks: each pocket's grid-cell centre steps by its CHANNEL direction (dirA for
   * channel A, dirB for channel B/C) × driftBaseSpeed × driftRate × the per-channel rate × interval,
   * toroidally wrapped, then recarve() rebuilds fertility/channelMask/Kcell RNG-FREE. Biomass B stays in
   * place (it regrows toward the new pockets and decays where they left), so the pocket visibly migrates.
   * No-op when driftRate===0 (the byte-identical OFF state) — World gates the call on the same condition.
   */
  driftPockets(tick: number): void {
    if (this.driftRate <= 0 || this.pocketCount === 0) return;
    if (tick === 0 || tick % this.driftInterval !== 0) return;
    const { cols, rows } = this;
    // World-units → grid cells per axis (the centres live in grid coords). Displacement this recarve =
    // base · rate · per-channel-rate · interval, in world units, converted to cells.
    const baseStep = this.driftBaseSpeed * this.driftRate * this.driftInterval;
    for (let p = 0; p < this.pocketCount; p++) {
      const ch = this.pocketChan[p]!;
      // Channel A (0) creeps at rateA; channels B/C (1/2) sweep at rateB along dirB. A small per-pocket
      // angular jitter is intentionally omitted: the per-channel direction must DOMINATE (the brief), and a
      // forked draw here would re-touch the velocity rng during a recarve (which must stay RNG-free).
      const rate = ch === 0 ? this.driftRateA : this.driftRateB;
      const dx = ch === 0 ? this.dirAx : this.dirBx;
      const dy = ch === 0 ? this.dirAy : this.dirBy;
      const stepWorld = baseStep * rate;
      // Convert the world-unit step to grid cells (cellW/cellH may differ on a non-square food grid).
      let pc = this.pocketPc[p]! + (stepWorld * dx) / this.cellW;
      let pr = this.pocketPr[p]! + (stepWorld * dy) / this.cellH;
      pc = ((pc % cols) + cols) % cols; // toroidal wrap in grid cells
      pr = ((pr % rows) + rows) % rows;
      this.pocketPc[p] = pc;
      this.pocketPr[p] = pr;
      // Keep the diagnostic world-space centres in sync with the moved grid centres.
      const wx = pc * this.cellW;
      const wy = pr * this.cellH;
      this.patchCenters[p] = { x: wx, y: wy };
      this.patchCentres[p] = { x: wx, y: wy };
    }
    // Recarve fertility/Kcell/mask from the MOVED centres but DO NOT refill biomass — the existing biomass
    // persists and the logistic step grows it toward the new pockets (where K rose) + decays it where the
    // pocket left (K dropped). Refilling here would teleport the field back to full every recarve (a free-
    // energy injection: population scales with recarve frequency). Biomass-follow is organic, not a reset.
    this.recarve(false);
  }

  /** Read-only view of the fertility map (for the wall generator's pocket awareness). */
  fertilityMap(): Float32Array {
    return this.fertility;
  }

  /** Refill to the initial biomass (so World.reset reproduces a fresh construction's state). When pockets
   *  have migrated (drift ON), first restore the centres to their seeded t0 and recarve, so reset() rewinds
   *  the archipelago to construction. With no pockets / drift OFF this is just the legacy biomass refill
   *  (pocketCount 0 → restore loop no-ops, recarve rebuilds the same static map → byte-identical). */
  reset(): void {
    if (this.pocketCount > 0) {
      for (let p = 0; p < this.pocketCount; p++) {
        this.pocketPc[p] = this.seedPc[p]!;
        this.pocketPr[p] = this.seedPr[p]!;
        const wx = this.seedPc[p]! * this.cellW;
        const wy = this.seedPr[p]! * this.cellH;
        this.patchCenters[p] = { x: wx, y: wy };
        this.patchCentres[p] = { x: wx, y: wy };
      }
      this.recarve(); // rebuild fertility/Kcell/mask at t0 + refill biomass to it
    } else {
      this.refill();
    }
    this.scratch.fill(0);
    if (this.scratch2) this.scratch2.fill(0);
    if (this.scratch3) this.scratch3.fill(0);
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

  /** Biomass at a world position (channel C). 0 when the third channel is not active (channels<3). */
  sampleAt3(x: number, y: number): number {
    return this.B3 ? this.B3[this.idx(x, y)]! : 0;
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

  /** Remove up to `amount` biomass at a position (channel C); returns what was taken. 0 if B3 inactive. */
  grazeAt3(x: number, y: number, amount: number): number {
    if (!this.B3) return 0;
    const i = this.idx(x, y);
    const avail = this.B3[i]!;
    const taken = avail < amount ? avail : amount;
    this.B3[i] = avail - taken;
    return taken;
  }

  /** Whether channel `ch` (0=A, 1=B, 2=C) is allocated/active. Channel A always is; B needs channels≥2,
   *  C needs channels===3. Read-only — lets the renderer skip a food-layer that has no data. */
  hasChannel(ch: number): boolean {
    return ch === 0 ? true : ch === 1 ? this.B2 !== null : ch === 2 ? this.B3 !== null : false;
  }

  /** Total standing biomass across all active channels (for telemetry / the population graph). */
  total(): number {
    let s = 0;
    for (let i = 0; i < this.B.length; i++) s += this.B[i]!;
    if (this.B2) for (let i = 0; i < this.B2.length; i++) s += this.B2[i]!;
    if (this.B3) for (let i = 0; i < this.B3.length; i++) s += this.B3[i]!;
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
    this.fillTextureChannel(out, 0);
  }

  /**
   * PURE-READ render helper (no sim state touched): write one channel's biomass into `out` as
   * biomass/maxCapacity scaled to 0..255, row-major. `ch` selects 0=A (B), 1=B (B2), 2=C (B3). An
   * absent channel (e.g. ch 2 when channels<3) fills all zeros. Normalized against maxCapacity exactly
   * like the legacy fillTexture so lever-C rich pockets don't clip and the per-channel scale is shared.
   */
  fillTextureChannel(out: Uint8Array, ch: number): void {
    const field = ch === 0 ? this.B : ch === 1 ? this.B2 : ch === 2 ? this.B3 : null;
    if (!field) {
      out.fill(0);
      return;
    }
    const max = this.maxCapacity;
    const inv = max > 0 ? 255 / max : 0;
    for (let i = 0; i < field.length; i++) {
      const v = field[i]! * inv;
      out[i] = v < 0 ? 0 : v > 255 ? 255 : v;
    }
  }

  /**
   * PURE-READ render helper: write the SUM of all present channels' biomass into `out`, scaled to
   * 0..255 against maxCapacity (the per-cell ceiling). With one channel this equals fillTexture; with
   * 2/3 channels a full cell sums to ~maxCapacity, so a rich pocket reads bright regardless of split.
   */
  fillTextureTotal(out: Uint8Array): void {
    const max = this.maxCapacity;
    const inv = max > 0 ? 255 / max : 0;
    const b2 = this.B2;
    const b3 = this.B3;
    for (let i = 0; i < this.B.length; i++) {
      let s = this.B[i]!;
      if (b2) s += b2[i]!;
      if (b3) s += b3[i]!;
      const v = s * inv;
      out[i] = v < 0 ? 0 : v > 255 ? 255 : v;
    }
  }

  /** Logistic regrowth (toward each cell's K = capShare·fertility) + toroidal diffusion, per channel.
   *  regen=0 = inert. Channel A uses the fracA share (=1 when single-channel → byte-identical).
   *  `blocked` (food-resolution, 1=rock) dams the field; null = walls-OFF (byte-identical legacy path).
   *  `flow` advects biomass along the current; null = no advection (body lands in a later task). */
  step(regen: number, diffuse: number, flow: FlowField | null, blocked: Uint8Array | null): void {
    if (this.channelMask) {
      // Place-coupled (channels===3, OR channels===2 mode 1): each channel's per-cell K is the full Kcell
      // where the mask selects it, else 0. The buffers regrow/diffuse independently over the SAME fertility
      // map but in disjoint cells. channels===2 has no B3 (mask ∈ {0,1}); skip the third step there.
      this.stepChannel3(this.B, 0, regen, diffuse, 0, blocked);
      this.stepChannel3(this.B2!, 1, regen, diffuse, 1, blocked);
      if (this.B3) this.stepChannel3(this.B3, 2, regen, diffuse, 2, blocked);
      if (flow !== null) this.advect(flow, blocked);
      return;
    }
    this.stepChannel(this.B, this.fracA, regen, diffuse, false, blocked);
    if (this.B2) this.stepChannel(this.B2, this.ratio, regen, diffuse, true, blocked);
    if (flow !== null) this.advect(flow, blocked);
  }

  /** One place-coupled channel (channels===3): like stepChannel, but the per-cell carrying capacity is the
   *  FULL Kcell where channelMask[i]===channelIndex and 0 elsewhere (so a pocket grows only its own resource).
   *  `which` selects the scratch buffer for the double-buffered diffusion swap (0→B/scratch, 1→B2/scratch2,
   *  2→B3/scratch3). RNG-free; wall no-flux identical to stepChannel. */
  private stepChannel3(
    field: Float64Array,
    channelIndex: number,
    regen: number,
    diffuse: number,
    which: number,
    blocked: Uint8Array | null,
  ): void {
    const { cols, rows, Kcell } = this;
    const mask = this.channelMask!;
    if (regen > 0) {
      for (let i = 0; i < field.length; i++) {
        if (blocked !== null && blocked[i] === 1) {
          field[i] = 0;
          continue;
        }
        const k = mask[i] === channelIndex ? Kcell[i]! : 0;
        const b = field[i]!;
        let nb: number;
        if (k <= 1e-6) {
          nb = b * (1 - regen); // not this channel's cell (or dead water): decay toward 0
        } else {
          nb = b + regen * b * (1 - b / k);
          if (nb > k) nb = k;
        }
        field[i] = nb < 0 ? 0 : nb;
      }
    }
    if (diffuse > 0) {
      const out = which === 0 ? this.scratch : which === 1 ? this.scratch2! : this.scratch3!;
      for (let r = 0; r < rows; r++) {
        const up = ((r - 1 + rows) % rows) * cols;
        const dn = ((r + 1) % rows) * cols;
        const cur = r * cols;
        for (let c = 0; c < cols; c++) {
          const self = field[cur + c]!;
          if (blocked !== null && blocked[cur + c] === 1) {
            out[cur + c] = 0;
            continue;
          }
          const l = (c - 1 + cols) % cols;
          const rt = (c + 1) % cols;
          const vU = blocked !== null && blocked[up + c] === 1 ? self : field[up + c]!;
          const vD = blocked !== null && blocked[dn + c] === 1 ? self : field[dn + c]!;
          const vL = blocked !== null && blocked[cur + l] === 1 ? self : field[cur + l]!;
          const vR = blocked !== null && blocked[cur + rt] === 1 ? self : field[cur + rt]!;
          const avg4 = (vU + vD + vL + vR) * 0.25;
          out[cur + c] = self + diffuse * (avg4 - self);
        }
      }
      if (which === 0) {
        this.B = out;
        this.scratch = field;
      } else if (which === 1) {
        this.B2 = out;
        this.scratch2 = field;
      } else {
        this.B3 = out;
        this.scratch3 = field;
      }
    }
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
    // Channels A/C advect at 1× (unchanged). Channel B advects at driftMult× — multiplying its flux velocity
    // smears its biomass downstream into a mobile plume while A stays put (the niche-partition lever). With
    // driftMult===1 (the OFF default) every channel uses 1× → byte-identical.
    this.advectChannel(this.B, flow, blocked, cols, rows, cellW, cellH, 1);
    if (this.B2)
      this.advectChannel(this.B2, flow, blocked, cols, rows, cellW, cellH, this.driftMult);
    if (this.B3) this.advectChannel(this.B3, flow, blocked, cols, rows, cellW, cellH, 1);
  }

  private advectChannel(
    B: Float64Array,
    flow: FlowField,
    blocked: Uint8Array | null,
    cols: number,
    rows: number,
    cellW: number,
    cellH: number,
    driftMult: number,
  ): void {
    const out = this.advectScratch ?? (this.advectScratch = new Float64Array(B.length));
    out.set(B);
    const { flowX, flowY } = flow;
    // Per-axis 1/cell: +x divides by cellW, +y by cellH (they differ on a non-square food grid). The drift
    // multiplier folds into the per-axis inverse so it scales the moved fraction (flux velocity) directly.
    // NB driftMult>1 raises the moved fraction above the CFL=0.25 ceiling the flow field enforces at 1×; the
    // upwind donor cell can still go negative if driftMult·|v|/cell > 1, so keep driftMult modest (≲3).
    const invX = driftMult / cellW;
    const invY = driftMult / cellH;
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
    if (this.B3) for (let i = 0; i < this.B3.length; i++) h.f(this.B3[i]!);
  }
}
