import { type Rng } from '../math/rng';
import { ScalarField } from './scalar-field';

/**
 * Coarse resource grid over the toroidal world (§4.1). PATCHY and DEPLETING, not
 * uniform: photosynthesis consumes the local patch so a stationary photo-cell
 * exhausts its spot (the §10 R1 selection gradient). Each tick the field diffuses
 * toroidally and regenerates toward a per-patch capacity. A relax-to-capacity scalar
 * field (clamped non-negative) — geometry/diffusion live in {@link ScalarField}.
 *
 * The per-patch capacity can optionally DRIFT: {@link driftCap} re-evaluates `cap` as a
 * sum-of-Gaussians whose centers slowly orbit their seeded base via a per-patch phase/freq
 * (a pure function of `tick` — NO live RNG). At `driftAmplitude === 0` the recompute is a
 * hard no-op so the field stays byte-identical to the seed (callers skip it entirely).
 */
export class LightField extends ScalarField {
  /** Per-patch capacity (the patchy target the field regenerates toward). */
  readonly cap: Float32Array;

  // Retained per-patch drift records (length = patchCount after init). Centers in GRID coords.
  // NOTE: these are Float64Array (NOT readonly): gaussianSum REQUIRES f64 inputs for the
  // byte-identical seed, and the arrays are (re)allocated to patchCount inside seedDrift (the
  // constructor only knows the grid dims, not patchCount), which a readonly field forbids.
  patchCenterX: Float64Array; // base center, GRID coords
  patchCenterY: Float64Array; // base center, GRID coords
  patchRadius: Float64Array; // grid cells
  patchPeakCap: Float64Array; // per-patch amplitude (pre-normalization peak)
  patchPhase: Float64Array;
  patchFreq: Float64Array;

  // Reused scratch for the drifted centers (alloc-free per-tick recompute).
  private driftX: Float64Array;
  private driftY: Float64Array;
  private patchCount = 0;
  private lightMax = 0;

  constructor(cols: number, rows: number, worldWidth: number, worldHeight: number) {
    super(cols, rows, worldWidth, worldHeight);
    this.cap = new Float32Array(cols * rows);
    this.patchCenterX = new Float64Array(0);
    this.patchCenterY = new Float64Array(0);
    this.patchRadius = new Float64Array(0);
    this.patchPeakCap = new Float64Array(0);
    this.patchPhase = new Float64Array(0);
    this.patchFreq = new Float64Array(0);
    this.driftX = new Float64Array(0);
    this.driftY = new Float64Array(0);
  }

  /** Current light buffer. Do NOT retain across step() — the double buffer swaps. */
  get light(): Float32Array {
    return this.a;
  }

  /**
   * Patchy seeded init: sum of `patchCount` random Gaussian bumps (toroidal), normalized and
   * clamped to [0, lightMax]. Sets both light and capacity. ALSO retains per-patch drift records
   * + seeds drift phase/freq from `driftRng` (a DEDICATED STREAM_DRIFT substream, NOT `rng`) so
   * adding drift cannot perturb the light seed (which still draws on `rng` exactly as before).
   *
   * Seeding cap via gaussianSum at the BASE retained centers is byte-identical to the legacy
   * seedPatches path: seedDrift re-derives the SAME pcx/pcy/amp on the SAME `rng` in the SAME
   * order, and gaussianSum is the one shared accumulation/normalization the seed already used.
   */
  init(rng: Rng, patchCount: number, patchRadius: number, lightMax: number, driftRng: Rng): void {
    this.seedDrift(rng, patchCount, patchRadius, driftRng);
    this.lightMax = lightMax;
    this.gaussianSum(
      this.patchCenterX,
      this.patchCenterY,
      this.patchRadius,
      this.patchPeakCap,
      this.patchCount,
      this.a,
      0,
      lightMax,
    );
    for (let i = 0; i < this.cap.length; i++) this.cap[i] = this.a[i]!;
  }

  /**
   * Draw + retain the per-patch records. The pcx/pcy/amp draws use `rng` in the SAME order/count
   * as the legacy seedPatches (byte-identical light seed). Phase/freq draw on `driftRng`. Record
   * arrays are (re)allocated to patchCount here — init-time only, never on the hot loop.
   */
  private seedDrift(rng: Rng, patchCount: number, patchRadius: number, driftRng: Rng): void {
    this.patchCount = patchCount;
    this.patchCenterX = new Float64Array(patchCount);
    this.patchCenterY = new Float64Array(patchCount);
    this.patchRadius = new Float64Array(patchCount);
    this.patchPeakCap = new Float64Array(patchCount);
    this.patchPhase = new Float64Array(patchCount);
    this.patchFreq = new Float64Array(patchCount);
    this.driftX = new Float64Array(patchCount);
    this.driftY = new Float64Array(patchCount);
    for (let p = 0; p < patchCount; p++) {
      // SAME draws/order as legacy seedPatches (on `rng`):
      this.patchCenterX[p] = rng.range(0, this.cols);
      this.patchCenterY[p] = rng.range(0, this.rows);
      this.patchPeakCap[p] = rng.range(0.5, 1);
      this.patchRadius[p] = patchRadius;
      // Drift phase/freq on the DEDICATED stream (cannot perturb the light seed above):
      this.patchPhase[p] = driftRng.range(0, Math.PI * 2);
      this.patchFreq[p] = driftRng.range(0.0005, 0.002); // slow sway (radians/tick)
    }
  }

  /**
   * Pure per-tick cap recompute. center(t) = base + driftAmplitude·[sin(freq·t+phase),
   * cos(freq·t+phase)], summed-and-normalized via the shared gaussianSum (same order as the seed →
   * amplitude-0 reproduces the seeded cap byte-for-byte). Allocation-free (reused driftX/driftY).
   * Callers MUST skip this entirely when driftAmplitude === 0 (the byte-identical guarantee); the
   * early return here is belt-and-braces so a stray amplitude-0 call cannot perturb `cap`.
   */
  driftCap(tick: number, driftAmplitude: number): void {
    if (driftAmplitude === 0) return; // HARD no-op: cap left exactly as the seed set it.
    const n = this.patchCount;
    for (let p = 0; p < n; p++) {
      const ph = this.patchFreq[p]! * tick + this.patchPhase[p]!;
      this.driftX[p] = this.patchCenterX[p]! + driftAmplitude * Math.sin(ph);
      this.driftY[p] = this.patchCenterY[p]! + driftAmplitude * Math.cos(ph);
    }
    this.gaussianSum(
      this.driftX,
      this.driftY,
      this.patchRadius,
      this.patchPeakCap,
      n,
      this.cap,
      0,
      this.lightMax,
    );
  }

  /** Remove up to `amount` light from the patch under (x, y), clamped at 0. */
  depleteAt(x: number, y: number, amount: number): void {
    const i = this.patchIndex(x, y);
    const v = this.a[i]! - amount;
    this.a[i] = v > 0 ? v : 0;
  }

  /**
   * One environment tick: toroidal 5-point diffusion (into scratch) then regen
   * toward capacity. `diffuse` ∈ [0, 0.25] (4·diffuse < 1 for stability), `regen` ∈ (0, 1].
   */
  override step(diffuse: number, regen: number): void {
    this.stepRelax(diffuse, regen, this.cap, true);
  }
}
