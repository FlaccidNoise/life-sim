import { type Rng } from '../math/rng';

/**
 * Coarse resource grid over the toroidal world (§4.1). PATCHY and DEPLETING, not
 * uniform: photosynthesis consumes the local patch so a stationary photo-cell
 * exhausts its spot (the §10 R1 selection gradient). Each tick the field diffuses
 * toroidally and regenerates toward a per-patch capacity. Allocation-free after
 * construction (double-buffered with a pre-allocated scratch).
 */
export class LightField {
  readonly cols: number;
  readonly rows: number;
  readonly worldWidth: number;
  readonly worldHeight: number;
  readonly invPatchW: number;
  readonly invPatchH: number;
  /** Per-patch capacity (the patchy target the field regenerates toward). */
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

  /** Current light buffer. Do NOT retain across step() — the double buffer swaps. */
  get light(): Float32Array {
    return this.a;
  }

  /**
   * Patchy seeded init: sum of `patchCount` random Gaussian bumps (toroidal),
   * normalized and clamped to [0, lightMax]. Sets both light and capacity.
   */
  init(rng: Rng, patchCount: number, patchRadius: number, lightMax: number): void {
    const { cols, rows } = this;
    const light = this.a;
    light.fill(0);
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
          light[r * cols + c]! += amp * Math.exp(-(dx * dx + dy * dy) / sigma2);
        }
      }
    }
    // normalize to [0, lightMax]
    let max = 0;
    for (const v of light) if (v > max) max = v;
    const scale = max > 0 ? lightMax / max : 0;
    for (let i = 0; i < light.length; i++) {
      const v = light[i]! * scale;
      light[i] = v;
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

  sampleAt(x: number, y: number): number {
    return this.a[this.patchIndex(x, y)]!;
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
        dst[cur + c] = nv > 0 ? nv : 0;
      }
    }
    this.a = dst;
    this.b = src;
  }
}
