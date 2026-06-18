import { type Rng } from '../math/rng';

/**
 * Vector field on a coarse toroidal grid representing water currents. Currents push
 * cells in a direction, making down-current locomotion cheaper and up-current harder.
 * Rewards sensing current direction and adapting movement strategy.
 *
 * SoA layout: vx and vy are per-patch Float32Arrays. Allocation-free after construction.
 *
 * Sample API: call `sample(x, y)` to compute toroidal patch index and write into internal
 * scratch; then read `currentVx` and `currentVy` immediately (they alias internal scratch
 * — do NOT retain across another `sample()` call).
 */
export class CurrentField {
  readonly cols: number;
  readonly rows: number;
  readonly worldWidth: number;
  readonly worldHeight: number;
  readonly invPatchW: number;
  readonly invPatchH: number;

  private _vx: Float32Array;
  private _vy: Float32Array;
  private _scratchVx: Float32Array;
  private _scratchVy: Float32Array; // double-buffer for evolution step

  /** Internal scratch — aliased by `currentVx`/`currentVy`. Invalidate on next `sample()`. */
  private _sx = 0;
  /** @see _sx */
  private _sy = 0;

  constructor(cols: number, rows: number, worldWidth: number, worldHeight: number) {
    this.cols = cols;
    this.rows = rows;
    this.worldWidth = worldWidth;
    this.worldHeight = worldHeight;
    this.invPatchW = cols / worldWidth;
    this.invPatchH = rows / worldHeight;
    const n = cols * rows;
    this._vx = new Float32Array(n);
    this._vy = new Float32Array(n);
    this._scratchVx = new Float32Array(n);
    this._scratchVy = new Float32Array(n);
  }

  /** Current vx component at the last `sample()` call. Internal scratch — read immediately. */
  get currentVx(): number {
    return this._sx;
  }

  /** Current vy component at the last `sample()` call. Internal scratch — read immediately. */
  get currentVy(): number {
    return this._sy;
  }

  /**
   * Seeded smooth vector noise: `patchCount` Gaussian bumps with independent random
   * direction and magnitude per bump (toroidal). Each component is clamped to
   * [-strength, strength].
   */
  init(rng: Rng, patchCount: number, patchRadius: number, strength: number): void {
    const { cols, rows } = this;
    const vx = this._vx;
    const vy = this._vy;
    vx.fill(0);
    vy.fill(0);
    const sigma2 = 2 * patchRadius * patchRadius;
    for (let p = 0; p < patchCount; p++) {
      const pcx = rng.range(0, cols);
      const pcy = rng.range(0, rows);
      const amp = rng.range(0.3, 1);
      const angle = rng.range(0, 2 * Math.PI);
      const bx = Math.cos(angle) * amp;
      const by = Math.sin(angle) * amp;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          let dx = Math.abs(c - pcx);
          if (dx > cols / 2) dx = cols - dx;
          let dy = Math.abs(r - pcy);
          if (dy > rows / 2) dy = rows - dy;
          const w = Math.exp(-(dx * dx + dy * dy) / sigma2);
          vx[r * cols + c]! += bx * w;
          vy[r * cols + c]! += by * w;
        }
      }
    }
    // Clamp components to [-strength, strength]; no global normalization needed.
    for (let i = 0; i < vx.length; i++) {
      vx[i] = clamp(vx[i]!, -strength, strength);
      vy[i] = clamp(vy[i]!, -strength, strength);
    }
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

  /**
   * Sample the vector field at (x, y) into internal scratch.
   * Read results immediately from `currentVx` / `currentVy` — they alias the scratch
   * and will be invalidated by the next `sample()` call.
   */
  sample(x: number, y: number): void {
    const i = this.patchIndex(x, y);
    this._sx = this._vx[i]!;
    this._sy = this._vy[i]!;
  }

  /**
   * Write the vector sample at (x, y) into caller-owned output arrays.
   * Allocation-free; caller provides the out buffers.
   */
  sampleInto(x: number, y: number, outVx: Float32Array, outVy: Float32Array, outIdx: number): void {
    const i = this.patchIndex(x, y);
    outVx[outIdx] = this._vx[i]!;
    outVy[outIdx] = this._vy[i]!;
  }

  /**
   * One environment tick: toroidal 5-point diffusion of each vector component
   * (into scratch), so currents shift slowly over time. `evolveRate` ∈ [0, 0.25]
   * controls how fast the field perturbs (4·rate < 1 for stability).
   */
  step(evolveRate: number): void {
    const { cols, rows } = this;
    for (let r = 0; r < rows; r++) {
      const up = ((r - 1 + rows) % rows) * cols;
      const dn = ((r + 1) % rows) * cols;
      const cur = r * cols;
      for (let c = 0; c < cols; c++) {
        const left = (c - 1 + cols) % cols;
        const right = (c + 1) % cols;
        // vx
        const vx = this._vx[cur + c]!;
        const lapX =
          this._vx[cur + left]! +
          this._vx[cur + right]! +
          this._vx[up + c]! +
          this._vx[dn + c]! -
          4 * vx;
        this._scratchVx[cur + c] = vx + evolveRate * lapX;
        // vy
        const vy = this._vy[cur + c]!;
        const lapY =
          this._vy[cur + left]! +
          this._vy[cur + right]! +
          this._vy[up + c]! +
          this._vy[dn + c]! -
          4 * vy;
        this._scratchVy[cur + c] = vy + evolveRate * lapY;
      }
    }
    // Swap buffers
    const tvx = this._vx;
    const tvy = this._vy;
    this._vx = this._scratchVx;
    this._vy = this._scratchVy;
    this._scratchVx = tvx;
    this._scratchVy = tvy;
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}