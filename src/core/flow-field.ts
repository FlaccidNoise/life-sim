import { type Config } from './config';
import { Rng } from './rng';

const SALT = 0x85ebca6b; // flow's own substream — independent of world.rng and the wall SALT
const CFL = 0.25;

/**
 * Persistent divergence-free current on the food-resolution grid: v = curl(ψ) of a periodic value-noise
 * streamfunction (flowX=∂ψ/∂y, flowY=−∂ψ/∂x). Divergence-free ⇒ donor-cell advection conserves biomass.
 * Magnitude scaled to flowStrength then CFL-clamped so |v|·dt/cellW ≤ 0.25. Static; config-seeded; not
 * hashed. flowStrength=0 ⇒ all-zero (advection becomes a no-op → byte-identical).
 */
export class FlowField {
  readonly cols: number;
  readonly rows: number;
  readonly flowX: Float64Array;
  readonly flowY: Float64Array;
  private readonly cellW: number;
  private readonly cellH: number;

  constructor(worldWidth: number, worldHeight: number, cols: number, rows: number, cfg: Config) {
    this.cols = cols;
    this.rows = rows;
    this.cellW = worldWidth / cols;
    this.cellH = worldHeight / rows;
    this.flowX = new Float64Array(cols * rows);
    this.flowY = new Float64Array(cols * rows);
    if (cfg.flowStrength > 0) this.generate(cfg);
  }

  private generate(cfg: Config): void {
    const { cols, rows } = this;
    const psi = this.noise(cfg, cols, rows);
    // curl of psi (toroidal central differences)
    for (let r = 0; r < rows; r++) {
      const up = ((r - 1 + rows) % rows) * cols;
      const dn = ((r + 1) % rows) * cols;
      const cur = r * cols;
      for (let c = 0; c < cols; c++) {
        const l = (c - 1 + cols) % cols;
        const rt = (c + 1) % cols;
        this.flowX[cur + c] = (psi[dn + c]! - psi[up + c]!) * 0.5; // ∂ψ/∂y
        this.flowY[cur + c] = -(psi[cur + rt]! - psi[cur + l]!) * 0.5; // −∂ψ/∂x
      }
    }
    // scale to flowStrength, then CFL-clamp the global max.
    let maxMag = 0;
    for (let i = 0; i < this.flowX.length; i++) {
      this.flowX[i]! *= cfg.flowStrength;
      this.flowY[i]! *= cfg.flowStrength;
      const m = Math.hypot(this.flowX[i]!, this.flowY[i]!);
      if (m > maxMag) maxMag = m;
    }
    const cellMin = Math.min(this.cellW, this.cellH);
    const ceiling = (CFL * cellMin) / cfg.dt;
    if (maxMag > ceiling && maxMag > 0) {
      const k = ceiling / maxMag;
      for (let i = 0; i < this.flowX.length; i++) {
        this.flowX[i]! *= k;
        this.flowY[i]! *= k;
      }
    }
  }

  /** Periodic value noise → smooth streamfunction. Deliberately NOT shared with wall-gen/carveNoise:
   *  this uses a Float64 lattice (a continuous streamfunction), while carveNoise uses a Float32 lattice
   *  thresholded to a 0/1 mask — unifying them would change both outputs, so they stay separate. */
  private noise(cfg: Config, cols: number, rows: number): Float64Array {
    const rng = new Rng((cfg.seed ^ SALT) >>> 0);
    const wl = cfg.flowScale > 0 ? cfg.flowScale : 12;
    const latW = Math.max(2, Math.round(cols / wl));
    const latH = Math.max(2, Math.round(rows / wl));
    const lat = new Float64Array(latW * latH);
    for (let i = 0; i < lat.length; i++) lat[i] = rng.float();
    const out = new Float64Array(cols * rows);
    for (let r = 0; r < rows; r++) {
      const fy = (r / rows) * latH;
      const r0 = Math.floor(fy) % latH;
      const r1 = (r0 + 1) % latH;
      const ty = fy - Math.floor(fy);
      for (let c = 0; c < cols; c++) {
        const fx = (c / cols) * latW;
        const c0 = Math.floor(fx) % latW;
        const c1 = (c0 + 1) % latW;
        const tx = fx - Math.floor(fx);
        const v00 = lat[r0 * latW + c0]!,
          v10 = lat[r0 * latW + c1]!;
        const v01 = lat[r1 * latW + c0]!,
          v11 = lat[r1 * latW + c1]!;
        const top = v00 + (v10 - v00) * tx,
          bot = v01 + (v11 - v01) * tx;
        out[r * cols + c] = top + (bot - top) * ty;
      }
    }
    return out;
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
  sampleX(x: number, y: number): number {
    return this.flowX[this.idx(x, y)]!;
  }
  sampleY(x: number, y: number): number {
    return this.flowY[this.idx(x, y)]!;
  }
}
