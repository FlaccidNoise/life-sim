import { type Rng } from '../math/rng';
import { ScalarField } from './scalar-field';

/**
 * Coarse resource grid over the toroidal world (§4.1). PATCHY and DEPLETING, not
 * uniform: photosynthesis consumes the local patch so a stationary photo-cell
 * exhausts its spot (the §10 R1 selection gradient). Each tick the field diffuses
 * toroidally and regenerates toward a per-patch capacity. A relax-to-capacity scalar
 * field (clamped non-negative) — geometry/diffusion live in {@link ScalarField}.
 */
export class LightField extends ScalarField {
  /** Per-patch capacity (the patchy target the field regenerates toward). */
  readonly cap: Float32Array;

  constructor(cols: number, rows: number, worldWidth: number, worldHeight: number) {
    super(cols, rows, worldWidth, worldHeight);
    this.cap = new Float32Array(cols * rows);
  }

  /** Current light buffer. Do NOT retain across step() — the double buffer swaps. */
  get light(): Float32Array {
    return this.a;
  }

  /**
   * Patchy seeded init: sum of `patchCount` random Gaussian bumps (toroidal),
   * normalized and clamped to [0, lightMax]. Sets both light and capacity.
   */
  init(rng: Rng, patchCount: number, patchRadius: number, lightMax: number): void {
    this.seedPatches(rng, this.cap, patchCount, patchRadius, 0, lightMax);
  }

  /**
   * Spread-pocket init: same TOTAL integrated light as {@link init} (seedPatchesJittered rescales
   * itself to the legacy clustered total — food-neutral, verified), but the patch centres are placed
   * on a jittered macro-grid so they spread evenly with dark gaps
   * between them instead of clustering into one merged central blob. Used by the sessile-plant demo
   * so plants form ~`patchCount` DISTINCT pockets. `seed` is the STREAM_LIGHT seed integer (the
   * RNG-free `hashFloat3` jitter keys off it), so the layout stays seed-deterministic.
   */
  initSpread(seed: number, patchCount: number, patchRadius: number, lightMax: number): void {
    this.seedPatchesJittered(seed, this.cap, patchCount, patchRadius, 0, lightMax);
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
