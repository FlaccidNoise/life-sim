import { type Rng } from '../math/rng';
import { ScalarField } from './scalar-field';

/**
 * Spatial temperature gradient over the toroidal world (§4.1, §10 R1).
 * PATCHY, not uniform: Gauss-bump seeding creates warm/cool patches that force
 * local adaptation — cells in cold patches face higher basal costs, hot patches
 * induce stress. This spatial heterogeneity drives divergence and eventually
 * speciation. Seasonal modulation is applied externally by the cycle module
 * multiplying `cap`; this field owns only the spatial pattern and relaxation
 * dynamics. A relax-to-capacity scalar field that, unlike light, is NOT clamped at
 * 0 (temperatures may be negative) — geometry/diffusion live in {@link ScalarField}.
 */
export class TemperatureField extends ScalarField {
  /** Per-patch climate target (the patchy value the field relaxes toward). */
  readonly cap: Float32Array;

  constructor(cols: number, rows: number, worldWidth: number, worldHeight: number) {
    super(cols, rows, worldWidth, worldHeight);
    this.cap = new Float32Array(cols * rows);
  }

  /** Current temperature buffer. Do NOT retain across step() — the double buffer swaps. */
  get temp(): Float32Array {
    return this.a;
  }

  /**
   * Patchy seeded init: sum of `patchCount` random Gaussian bumps (toroidal),
   * normalized and clamped to [tempMin, tempMax]. Sets both temperature and
   * climate capacity.
   */
  init(rng: Rng, patchCount: number, patchRadius: number, tempMin: number, tempMax: number): void {
    this.seedPatches(rng, this.cap, patchCount, patchRadius, tempMin, tempMax);
  }

  /**
   * One environment tick: toroidal 5-point diffusion (into scratch) then relax
   * toward climate capacity. `diffuse` ∈ [0, 0.25] (4·diffuse < 1 for stability),
   * `regen` ∈ (0, 1] (relaxation rate per tick toward capacity). Not clamped at 0.
   */
  override step(diffuse: number, regen: number): void {
    this.stepRelax(diffuse, regen, this.cap, false);
  }
}
