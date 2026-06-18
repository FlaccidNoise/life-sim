/**
 * Coarse bioluminescent light grid over the toroidal world. NEURON cells bound as
 * GLOW effectors emit light into their patch each tick; the field PERSISTS across
 * ticks (it is NOT cleared per tick — exactly like FoodField), diffusing toroidally
 * and decaying so emission balances decay into an equilibrium proportional to local
 * glow activity. Sensors can sample the field as a scalar (chemotaxis/lure signal).
 * Double-buffered and allocation-free after construction. Mirrors FoodField exactly
 * except it carries emitted light, not food smell.
 */
export class GlowField {
  readonly cols: number;
  readonly rows: number;
  readonly worldWidth: number;
  readonly worldHeight: number;
  readonly invPatchW: number;
  readonly invPatchH: number;
  /** World units per patch column/row. */
  readonly patchW: number;
  readonly patchH: number;

  private a: Float32Array;
  private b: Float32Array; // diffusion double-buffer scratch

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

  /** Current glow buffer. Do NOT retain across step() — the double buffer swaps. */
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

  /** Add `amount` of glow to the patch under (x, y). */
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
}