/**
 * Pheromone as a coarse diffusing scalar FIELD — the delayed-feedback "breathing" substrate. Mirrors
 * FoodField's scalar-field mechanics (toroidal double-buffered 4-neighbour diffusion, wall no-flux,
 * deterministic hash), but instead of logistic regrowth toward a carrying capacity it is a pure
 * deposit-diffuse-decay chemical trail:
 *
 *   deposit:  P[cell] += amount           (creatures broadcast where they graze/are bitten)
 *   diffuse:  P ← P + d·(avg4 − P)         (the signal spreads to neighbours)
 *   decay:    P ← P·(1 − decay)            (the field forgets, so the trail is recent activity)
 *
 * The lag between depositing and the gradient building up — and then forgetting — is the delayed
 * feedback the breathing ecology needs: aggregation/avoidance responses act on where the population
 * WAS a few ticks ago, not where it is now.
 *
 * RNG-FREE: deposit reads only a creature's position + its own PHERO_DEPOSIT gene; diffuse/decay are
 * pure field arithmetic. The field is allocated ONLY when cfg.pheromoneEnabled (World passes null
 * otherwise), so the OFF state never touches any of this and stays byte-identical.
 *
 * WALLS DAM THE FIELD identically to FoodField: when a `blocked` mask is passed (food-resolution,
 * 1=rock), blocked cells are forced to 0 and a blocked neighbour is no-flux (it contributes the cell's
 * OWN value), so pheromone can't leak into/through rock. blocked=null is the walls-OFF path.
 */
export class PheroField {
  readonly cols: number;
  readonly rows: number;
  private readonly cellW: number;
  private readonly cellH: number;
  private P: Float64Array;
  private scratch: Float64Array;
  /** RENDER-ONLY running max for fillTexture normalization (ratchets up so a decaying trail stays
   *  visible against its own historical peak). Not sim state — never hashed, reset, or read by core. */
  private texMax = 1e-9;

  constructor(worldWidth: number, worldHeight: number, cols: number, rows: number) {
    this.cols = cols;
    this.rows = rows;
    this.cellW = worldWidth / cols;
    this.cellH = worldHeight / rows;
    this.P = new Float64Array(cols * rows);
    this.scratch = new Float64Array(cols * rows);
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

  /** Add `amount` pheromone into the cell at a world position (a creature's broadcast). RNG-free. */
  deposit(x: number, y: number, amount: number): void {
    this.P[this.idx(x, y)]! += amount;
  }

  /** Pheromone concentration at a world position. */
  sampleAt(x: number, y: number): number {
    return this.P[this.idx(x, y)]!;
  }

  /**
   * Toroidal central-difference gradient of P at a world position, sampling one `step` (world units)
   * either side per axis. Mirrors sense.senseFood's gradient read so the perception matches the food
   * sense exactly. Returns the (gx,gy) world-frame gradient.
   */
  gradientAt(x: number, y: number, step: number): { gx: number; gy: number } {
    const ww = this.cols * this.cellW;
    const wh = this.rows * this.cellH;
    const inv = 1 / (2 * step);
    const xp = wrap(x + step, ww);
    const xm = wrap(x - step, ww);
    const yp = wrap(y + step, wh);
    const ym = wrap(y - step, wh);
    const gx = (this.P[this.idx(xp, y)]! - this.P[this.idx(xm, y)]!) * inv;
    const gy = (this.P[this.idx(x, yp)]! - this.P[this.idx(x, ym)]!) * inv;
    return { gx, gy };
  }

  /**
   * Allocation-free gradientAt: writes gx into out[base] and gy into out[base+1]. Same arithmetic as
   * gradientAt, which returns a fresh {gx,gy} object — two of those per creature per tick at 5,000
   * creatures is 10,000 allocations/tick on a path sense.ts documents as allocation-free.
   */
  gradientInto(x: number, y: number, step: number, out: Float64Array, base: number): void {
    const ww = this.cols * this.cellW;
    const wh = this.rows * this.cellH;
    const inv = 1 / (2 * step);
    const xp = wrap(x + step, ww);
    const xm = wrap(x - step, ww);
    const yp = wrap(y + step, wh);
    const ym = wrap(y - step, wh);
    out[base] = (this.P[this.idx(xp, y)]! - this.P[this.idx(xm, y)]!) * inv;
    out[base + 1] = (this.P[this.idx(x, yp)]! - this.P[this.idx(x, ym)]!) * inv;
  }

  /**
   * One field step: toroidal double-buffered 4-neighbour diffusion (no-flux at blocked wall cells via
   * the foodBlockedMask, like FoodField), then a uniform multiplicative decay. RNG-free, deterministic.
   * `diffuse` 0 skips the diffusion pass (P unchanged by it); `decay` 0 skips the forget.
   */
  step(diffuse: number, decay: number, blocked: Uint8Array | null): void {
    const { cols, rows } = this;
    const P = this.P;
    if (diffuse > 0) {
      const out = this.scratch;
      for (let r = 0; r < rows; r++) {
        const up = ((r - 1 + rows) % rows) * cols;
        const dn = ((r + 1) % rows) * cols;
        const cur = r * cols;
        for (let c = 0; c < cols; c++) {
          const self = P[cur + c]!;
          if (blocked !== null && blocked[cur + c] === 1) {
            out[cur + c] = 0; // rock holds no pheromone
            continue;
          }
          const l = (c - 1 + cols) % cols;
          const rt = (c + 1) % cols;
          // A blocked neighbour is no-flux: it contributes the cell's OWN value, so pheromone can't
          // leak into/through rock and pools against the wall.
          const vU = blocked !== null && blocked[up + c] === 1 ? self : P[up + c]!;
          const vD = blocked !== null && blocked[dn + c] === 1 ? self : P[dn + c]!;
          const vL = blocked !== null && blocked[cur + l] === 1 ? self : P[cur + l]!;
          const vR = blocked !== null && blocked[cur + rt] === 1 ? self : P[cur + rt]!;
          const avg4 = (vU + vD + vL + vR) * 0.25;
          out[cur + c] = self + diffuse * (avg4 - self);
        }
      }
      this.P = out;
      this.scratch = P;
    }
    if (decay > 0) {
      const field = this.P;
      const keep = 1 - decay;
      for (let i = 0; i < field.length; i++) field[i]! *= keep;
    }
  }

  /** Total pheromone over the grid (telemetry / probes). */
  total(): number {
    let s = 0;
    for (let i = 0; i < this.P.length; i++) s += this.P[i]!;
    return s;
  }

  /** Highest single-cell concentration (telemetry / probes). */
  max(): number {
    let m = 0;
    for (let i = 0; i < this.P.length; i++) if (this.P[i]! > m) m = this.P[i]!;
    return m;
  }

  /** Reset to empty (so World.reset reproduces a fresh construction's state). */
  reset(): void {
    this.P.fill(0);
    this.scratch.fill(0);
  }

  /**
   * PURE-READ render helper (no sim state touched): write the concentration into `out` scaled to
   * 0..255 against a ratcheting running max (so a freshly-deposited trail is visible and a decaying
   * one fades against its own historical peak rather than going invisible). Row-major, row 0 = top.
   */
  fillTexture(out: Uint8Array): void {
    let curMax = this.texMax;
    for (let i = 0; i < this.P.length; i++) if (this.P[i]! > curMax) curMax = this.P[i]!;
    this.texMax = curMax;
    const inv = 255 / curMax;
    for (let i = 0; i < this.P.length; i++) {
      const v = this.P[i]! * inv;
      out[i] = v < 0 ? 0 : v > 255 ? 255 : v;
    }
  }

  /** Mix the field into a deterministic state hash (the pheromone is part of sim state when active). */
  hashInto(h: { f: (v: number) => void }): void {
    for (let i = 0; i < this.P.length; i++) h.f(this.P[i]!);
  }
}

function wrap(v: number, size: number): number {
  const m = v % size;
  return m < 0 ? m + size : m;
}
