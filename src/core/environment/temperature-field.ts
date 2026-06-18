import { type Rng } from '../math/rng';

/**
 * Spatial temperature gradient over the toroidal world (§4.1, §10 R1).
 * PATCHY, not uniform: Gauss-bump seeding creates warm/cool patches that force
 * local adaptation — cells in cold patches face higher basal costs, hot patches
 * induce stress. This spatial heterogeneity drives divergence and eventually
 * speciation. Allocation-free after construction (double-buffered with a
 * pre-allocated scratch). Seasonal modulation is applied externally by the
 * cycle module multiplying `cap`; this field owns only the spatial pattern
 * and relaxation dynamics.
 */
export class TemperatureField {
  readonly cols: number;
  readonly rows: number;
  readonly worldWidth: number;
  readonly worldHeight: number;
  readonly invPatchW: number;
  readonly invPatchH: number;
  /** Per-patch climate target (the patchy value the field relaxes toward). */
  readonly cap: Float32Array;

  private a: Float32Array;
  private b: Float32Array; // scratch for diffusion double-buffer

  constructor(cols: number, rows: number, worldWidth: number, worldHeight: number) {
    this.cols = cols;
    this.rows = rows;
    this.worldWidth = worldWidth;
    this.worldHeight = worldHeight;
    this.invPatchW = cols / worldWidth;
    this.invPatchH = rows / worldHeight;
    const n = cols * rows;
    this.cap = new Float32Array(n);
    this.a = new Float32Array(n);
    this.b = new Float32Array(n);
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
    const { cols, rows } = this;
    const temp = this.a;
    temp.fill(0);
    const sigma2 = 2 * patchRadius * patchRadius;
    for (let p = 0; p < patchCount; p++) {
      const pcx = rng.range(0, cols);
      const pcy = rng.range(0, rows);
      const amp = rng.range(0.5, 1);
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          // shortest toroidal distance on the grid
          let dx = Math.abs(c - pcx);
          if (dx > cols / 2) dx = cols - dx;
          let dy = Math.abs(r - pcy);
          if (dy > rows / 2) dy = rows - dy;
          temp[r * cols + c]! += amp * Math.exp(-(dx * dx + dy * dy) / sigma2);
        }
      }
    }
    // normalize to [tempMin, tempMax]
    let max = 0;
    for (const v of temp) if (v > max) max = v;
    const range = tempMax - tempMin;
    const scale = max > 0 ? range / max : 0;
    for (let i = 0; i < temp.length; i++) {
      const v = temp[i]! * scale + tempMin;
      temp[i] = v;
      this.cap[i] = v;
    }
  }

  /** Grid index for a world position (toroidal-safe via clamp; positions are pre-wrapped). */
  patchIndex(x: number, y: number): number {
    let c = (x * this.invPatchW) | 0;
    if (c >= this.cols) c = this.cols - 1;
    else if (c < 0) c = 0;
    let r = (y * this.invPatchH) | 0;
    if (r >= this.rows) r = this.rows - 1;
    else if (r < 0) r = 0;
    return r * this.cols + c;
  }

  /** Sample temperature at a world position (no interpolation). */
  sampleAt(x: number, y: number): number {
    return this.a[this.patchIndex(x, y)]!;
  }

  /**
   * One environment tick: toroidal 5-point diffusion (into scratch) then relax
   * toward climate capacity. `diffuse` ∈ [0, 0.25] (4·diffuse < 1 for
   * stability), `regen` ∈ (0, 1] (relaxation rate per tick toward capacity).
   * Identical stencil to LightField.step — both fields obey the same
   * reaction-diffusion equation on the torus, differing only in boundary
   * conditions (temperature lacks a deplete sink).
   */
  step(diffuse: number, regen: number): void {
    const { cols, rows, cap } = this;
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
        dst[cur + c] = nv;
      }
    }
    this.a = dst;
    this.b = src;
  }
}