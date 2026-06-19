import { type World } from '../core/sim/world';
import { type Camera } from './webgl-renderer';
import { wrapDelta } from '../core/math/vec2';

/**
 * §11 M5 — bond-network + energy-flow overlay. Each live bond is a line segment
 * between its two cell endpoints; colour encodes energy flow: brightness ∝ the
 * |energy gap| (transferEnergy moves energy down this gradient), with a small dot
 * at the lower-energy (receiving) endpoint to show flow direction. A 2D-canvas
 * overlay over the WebGL viewport (mirrors the brain inspector's 2D canvas; the
 * food/light overlays are WebGL quads, so per-segment line drawing lives here).
 *
 * Read-only over core. Projection mirrors main.ts's pickNearest inverse:
 *   screen = (world - camera) * scale + viewport/2
 * Endpoint B is positioned relative to A via wrapDelta so a bond that straddles
 * the toroidal seam draws as a short segment, not a full-screen streak.
 */
export class BondOverlay {
  private readonly ctx: CanvasRenderingContext2D;
  private dpr = 1;

  constructor(private readonly canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('bond overlay needs a 2D context');
    this.ctx = ctx;
  }

  /** `width`/`height` are CSS pixels; `dpr` scales the backing store so lines stay
   *  crisp on Retina. Line widths are multiplied by `dpr` to keep visual parity. */
  resize(width: number, height: number, dpr = 1): void {
    this.dpr = dpr;
    this.canvas.width = Math.round(width * dpr);
    this.canvas.height = Math.round(height * dpr);
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
  }

  render(world: World, camera: Camera): void {
    const { ctx } = this;
    const w = this.canvas.width;
    const h = this.canvas.height;
    ctx.clearRect(0, 0, w, h);

    const bonds = world.bonds;
    const f = world.cells.fields;
    const { worldWidth, worldHeight } = world.config;
    const halfW = w / 2;
    const halfH = h / 2;
    const scale = camera.scale;

    ctx.lineWidth = 1.5 * this.dpr;
    for (let k = 0; k < bonds.liveBondCount; k++) {
      const s = bonds.liveBonds[k]!;
      const a = bonds.cellA[s]!;
      const b = bonds.cellB[s]!;

      // Project endpoint A directly; place B relative to A across the toroidal seam.
      const ax = (f.posX[a]! - camera.x) * scale + halfW;
      const ay = (f.posY[a]! - camera.y) * scale + halfH;
      const dx = wrapDelta(f.posX[b]! - f.posX[a]!, worldWidth);
      const dy = wrapDelta(f.posY[b]! - f.posY[a]!, worldHeight);
      const bx = ax + dx * scale;
      const by = ay + dy * scale;

      // Energy flows down the gradient: gap > 0 ⇒ A richer, B receives (and vice versa).
      const gap = f.energy[a]! - f.energy[b]!;
      const mag = Math.min(1, Math.abs(gap) / 100);
      const g = Math.round(120 + 120 * mag);
      ctx.strokeStyle = `rgba(80,${g},140,0.8)`;
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
      ctx.stroke();

      // Dot at the needier (receiving) endpoint shows flow direction.
      if (mag > 0.02) {
        const rx = gap > 0 ? bx : ax;
        const ry = gap > 0 ? by : ay;
        ctx.fillStyle = `rgba(120,${g},200,0.9)`;
        ctx.beginPath();
        ctx.arc(rx, ry, 2.5 * this.dpr, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
}
