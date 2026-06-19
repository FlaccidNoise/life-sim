/**
 * Shared base for the coarse scalar fields over the toroidal world: food smell, toxin,
 * bioluminescent glow (deposit + decay), and light, temperature (relax toward a patchy
 * capacity). Owns the grid geometry, the a/b double buffer, patchIndex/sampleAt/depositAt,
 * and the two 5-point toroidal diffusion stencils. The default `step()` is the deposit/decay
 * stencil (used by FoodField/ToxinField/GlowField); the climate fields (LightField,
 * TemperatureField) override `step()` to relax toward `cap` via the shared `stepRelax` helper.
 * Allocation-free after construction (double-buffered with a pre-allocated scratch).
 *
 * Determinism: the stencils are evaluated in a fixed row-major order with identical float
 * operations across all fields, so behaviour is byte-identical to the original per-field copies.
 */
import { Rng, hashFloat3 } from '../math/rng';

export class ScalarField {
  readonly cols: number;
  readonly rows: number;
  readonly worldWidth: number;
  readonly worldHeight: number;
  readonly invPatchW: number;
  readonly invPatchH: number;
  /** World units per patch column/row (the finite-difference step for gradients). */
  readonly patchW: number;
  readonly patchH: number;

  protected a: Float32Array;
  protected b: Float32Array; // diffusion double-buffer scratch

  constructor(cols: number, rows: number, worldWidth: number, worldHeight: number) {
    this.cols = cols;
    this.rows = rows;
    this.worldWidth = worldWidth;
    this.worldHeight = worldHeight;
    this.invPatchW = cols / worldWidth;
    this.invPatchH = rows / worldHeight;
    this.patchW = worldWidth / cols;
    this.patchH = worldHeight / rows;
    const n = cols * rows;
    this.a = new Float32Array(n);
    this.b = new Float32Array(n);
  }

  /** Current scalar buffer. Do NOT retain across step() — the double buffer swaps. */
  get field(): Float32Array {
    return this.a;
  }

  /** Grid index for a world position (clamped; positions are pre-wrapped). */
  patchIndex(x: number, y: number): number {
    let c = (x * this.invPatchW) | 0;
    if (c >= this.cols) c = this.cols - 1;
    else if (c < 0) c = 0;
    let r = (y * this.invPatchH) | 0;
    if (r >= this.rows) r = this.rows - 1;
    else if (r < 0) r = 0;
    return r * this.cols + c;
  }

  sampleAt(x: number, y: number): number {
    return this.a[this.patchIndex(x, y)]!;
  }

  /** Add `amount` to the patch under (x, y). */
  depositAt(x: number, y: number, amount: number): void {
    const i = this.patchIndex(x, y);
    this.a[i] = this.a[i]! + amount;
  }

  /**
   * One environment tick: toroidal 5-point diffusion (into scratch) then decay.
   * `diffuse` ∈ [0, 0.25] (4·diffuse < 1 for stability), `decay` ∈ [0, 1).
   */
  step(diffuse: number, decay: number): void {
    const { cols, rows } = this;
    const src = this.a;
    const dst = this.b;
    const keep = 1 - decay;
    for (let r = 0; r < rows; r++) {
      const up = ((r - 1 + rows) % rows) * cols;
      const dn = ((r + 1) % rows) * cols;
      const cur = r * cols;
      for (let c = 0; c < cols; c++) {
        const left = (c - 1 + cols) % cols;
        const right = (c + 1) % cols;
        const v = src[cur + c]!;
        const lap = src[cur + left]! + src[cur + right]! + src[up + c]! + src[dn + c]! - 4 * v;
        const nv = (v + diffuse * lap) * keep;
        dst[cur + c] = nv > 0 ? nv : 0;
      }
    }
    this.a = dst;
    this.b = src;
  }

  /**
   * Toroidal 5-point diffusion then relaxation toward a per-patch capacity `cap`
   * (used by the climate fields). `clamp` floors the result at 0 (light cannot go
   * negative; temperature can). Identical float ops to the deposit/decay stencil
   * aside from the relaxation tail.
   */
  protected stepRelax(diffuse: number, regen: number, cap: Float32Array, clamp: boolean): void {
    const { cols, rows } = this;
    const src = this.a;
    const dst = this.b;
    for (let r = 0; r < rows; r++) {
      const up = ((r - 1 + rows) % rows) * cols;
      const dn = ((r + 1) % rows) * cols;
      const cur = r * cols;
      for (let c = 0; c < cols; c++) {
        const left = (c - 1 + cols) % cols;
        const right = (c + 1) % cols;
        const v = src[cur + c]!;
        const lap = src[cur + left]! + src[cur + right]! + src[up + c]! + src[dn + c]! - 4 * v;
        let nv = v + diffuse * lap;
        nv += regen * (cap[cur + c]! - nv);
        dst[cur + c] = clamp ? (nv > 0 ? nv : 0) : nv;
      }
    }
    this.a = dst;
    this.b = src;
  }

  /**
   * One shared sum-of-Gaussians accumulation + global [lo,hi] normalization, in row-major
   * order. Called by BOTH seedPatches (init) and (later) the drift cap recompute, so there is
   * exactly ONE accumulation/normalization order → no float-non-associativity drift between the
   * seed and the amplitude-driven recompute. `centerX/centerY` are grid coords; `radius` is
   * per-patch radius in grid cells (sigma² = 2·radius²); `amp` is per-patch amplitude. Clears
   * `out` first; allocates nothing.
   *
   * Per-patch inputs are Float64Array so the center/amp/radius values keep the full f64
   * precision of the rng draws — byte-identical to the original seedPatches, which held them
   * as f64 `const` locals. (Storing them in Float32Array would round the centers to f32 and
   * shift the resulting field by ~1 ulp across most cells; see scalar-field.test.ts.)
   */
  protected gaussianSum(
    centerX: Float64Array,
    centerY: Float64Array,
    radius: Float64Array,
    amp: Float64Array,
    patchCount: number,
    out: Float32Array,
    lo: number,
    hi: number,
  ): void {
    const { cols, rows } = this;
    out.fill(0);
    for (let p = 0; p < patchCount; p++) {
      const pcx = centerX[p]!;
      const pcy = centerY[p]!;
      const a = amp[p]!;
      const sigma2 = 2 * radius[p]! * radius[p]!;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          let dx = Math.abs(c - pcx);
          if (dx > cols / 2) dx = cols - dx;
          let dy = Math.abs(r - pcy);
          if (dy > rows / 2) dy = rows - dy;
          out[r * cols + c]! += a * Math.exp(-(dx * dx + dy * dy) / sigma2);
        }
      }
    }
    let max = 0;
    for (const v of out) if (v > max) max = v;
    const range = hi - lo;
    const scale = max > 0 ? range / max : 0;
    for (let i = 0; i < out.length; i++) out[i] = out[i]! * scale + lo;
  }

  /**
   * Patchy seeded init shared by the climate fields: sum of `patchCount` random toroidal
   * Gaussian bumps, normalized to [lo, hi]. Writes both the live buffer and `cap`. Draws
   * pcx/pcy/amp per patch (UNCHANGED draw order + count → byte-identical seed), then defers
   * the accumulation/normalization to the shared gaussianSum helper.
   */
  protected seedPatches(
    rng: { range(min: number, max: number): number },
    cap: Float32Array,
    patchCount: number,
    patchRadius: number,
    lo: number,
    hi: number,
  ): void {
    const cx = new Float64Array(patchCount);
    const cy = new Float64Array(patchCount);
    const rad = new Float64Array(patchCount);
    const amp = new Float64Array(patchCount);
    for (let p = 0; p < patchCount; p++) {
      cx[p] = rng.range(0, this.cols);
      cy[p] = rng.range(0, this.rows);
      amp[p] = rng.range(0.5, 1);
      rad[p] = patchRadius;
    }
    const buf = this.a;
    this.gaussianSum(cx, cy, rad, amp, patchCount, buf, lo, hi);
    for (let i = 0; i < buf.length; i++) cap[i] = buf[i]!;
  }

  /**
   * Like {@link seedPatches} but places the `patchCount` centres on a coarse JITTERED MACRO-GRID
   * instead of pure-uniform draws, so the bumps spread evenly with dark gaps between them rather
   * than clustering by chance (the merged-blob failure mode). Gaussian-bump + global-max
   * normalisation like {@link seedPatches}, THEN a food-neutral rescale (below) so the spread layout
   * carries the SAME total integrated light as the legacy clustered init for the same params — only
   * the layout differs. Determinism: the only randomness is RNG-free `hashFloat3(seed, p, ·)` jitter and the
   * loop is fixed-order, so two same-seed runs are byte-identical. Kept SEPARATE from seedPatches
   * so every existing field's byte output stays untouched.
   *
   * The macro-grid is the squarest cols×rows covering `patchCount` cells; the first `patchCount`
   * cells (row-major) get a bump at their cell centre plus ±`jitterFrac` of a macro-cell of jitter.
   */
  protected seedPatchesJittered(
    seed: number,
    cap: Float32Array,
    patchCount: number,
    patchRadius: number,
    lo: number,
    hi: number,
    jitterFrac = 0.25,
  ): void {
    const { cols, rows } = this;
    const buf = this.a;
    buf.fill(0);
    const sigma2 = 2 * patchRadius * patchRadius;
    const macroCols = Math.ceil(Math.sqrt(patchCount));
    const macroRows = Math.ceil(patchCount / macroCols);
    const cellW = cols / macroCols;
    const cellH = rows / macroRows;
    for (let p = 0; p < patchCount; p++) {
      const mc = p % macroCols;
      const mr = (p / macroCols) | 0;
      const jx = (hashFloat3(seed, p, 0) - 0.5) * 2 * jitterFrac;
      const jy = (hashFloat3(seed, p, 1) - 0.5) * 2 * jitterFrac;
      const pcx = (mc + 0.5 + jx) * cellW;
      const pcy = (mr + 0.5 + jy) * cellH;
      const amp = 0.5 + 0.5 * hashFloat3(seed, p, 2);
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          let dx = Math.abs(c - pcx);
          if (dx > cols / 2) dx = cols - dx;
          let dy = Math.abs(r - pcy);
          if (dy > rows / 2) dy = rows - dy;
          buf[r * cols + c]! += amp * Math.exp(-(dx * dx + dy * dy) / sigma2);
        }
      }
    }
    let max = 0;
    for (const v of buf) if (v > max) max = v;
    const range = hi - lo;
    const scale = max > 0 ? range / max : 0;
    // Food-neutrality: global-max normalisation lets each ISOLATED spread pocket keep near-full
    // amplitude, whereas the legacy clustered init divides by a tall overlapping peak — so without a
    // correction the spread layout would carry ~30% MORE total standing light (a food increase, which
    // the sessile-plant demo explicitly forbids). Rescale so total integrated light equals the legacy
    // clustered layout's for the same seed/params (a fresh Rng(seed) reproduces the legacy draws).
    let spreadTotal = 0;
    for (let i = 0; i < buf.length; i++) spreadTotal += buf[i]! * scale + lo;
    const legacyTotal = this.clusteredTotal(seed, patchCount, patchRadius, lo, hi);
    const foodScale = spreadTotal > 0 ? legacyTotal / spreadTotal : 1;
    for (let i = 0; i < buf.length; i++) {
      const v = (buf[i]! * scale + lo) * foodScale;
      buf[i] = v;
      cap[i] = v;
    }
  }

  /**
   * Total integrated light of the LEGACY clustered layout (random patch centres + global-max
   * normalisation) for the given params — used by {@link seedPatchesJittered} to rescale the spread
   * layout to the same food budget. Pure: a fresh Rng(seed) + a local buffer, no field side effects,
   * so it reproduces the legacy init's total deterministically without perturbing any rng stream.
   */
  private clusteredTotal(
    seed: number,
    patchCount: number,
    patchRadius: number,
    lo: number,
    hi: number,
  ): number {
    const { cols, rows } = this;
    const tmp = new Float32Array(cols * rows);
    const rng = new Rng(seed);
    const sigma2 = 2 * patchRadius * patchRadius;
    for (let p = 0; p < patchCount; p++) {
      const pcx = rng.range(0, cols);
      const pcy = rng.range(0, rows);
      const amp = rng.range(0.5, 1);
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          let dx = Math.abs(c - pcx);
          if (dx > cols / 2) dx = cols - dx;
          let dy = Math.abs(r - pcy);
          if (dy > rows / 2) dy = rows - dy;
          tmp[r * cols + c]! += amp * Math.exp(-(dx * dx + dy * dy) / sigma2);
        }
      }
    }
    let max = 0;
    for (const v of tmp) if (v > max) max = v;
    const scale = max > 0 ? (hi - lo) / max : 0;
    let total = 0;
    for (let i = 0; i < tmp.length; i++) total += tmp[i]! * scale + lo;
    return total;
  }
}
