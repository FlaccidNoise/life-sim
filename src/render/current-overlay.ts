import { type World } from '../core/sim/world';
import { type Camera } from './webgl-renderer';

/**
 * Current-field overlay: a sparse grid of arrows showing the drift vector at sampled
 * patches. A 2D-canvas overlay (mirrors RockOverlay/BondOverlay); read-only over core.
 * Arrows are toroidally projected the same way as the rocks overlay (screen = (world -
 * camera) * scale + viewport/2). Only the viewport-visible grid is drawn.
 */
export class CurrentOverlay {
  private readonly ctx: CanvasRenderingContext2D;
  private dpr = 1;

  constructor(private readonly canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('current overlay needs a 2D context');
    this.ctx = ctx;
  }

  resize(width: number, height: number, dpr = 1): void {
    this.dpr = dpr;
    this.canvas.width = Math.round(width * dpr);
    this.canvas.height = Math.round(height * dpr);
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
  }

  render(world: World, camera: Camera, spacing = 96): void {
    const { ctx } = this;
    const w = this.canvas.width;
    const h = this.canvas.height;
    ctx.clearRect(0, 0, w, h);

    const cur = world.current;
    const { worldWidth, worldHeight } = world.config;
    const halfW = w / 2;
    const halfH = h / 2;
    const scale = camera.scale;

    // World-space step that corresponds to ~`spacing` screen pixels. Scale by dpr so
    // arrow density and stroke width stay visually constant on Retina.
    const sp = spacing * this.dpr;
    const step = sp / scale;
    // Top-left visible world corner.
    const startX = camera.x - halfW / scale;
    const startY = camera.y - halfH / scale;
    const cols = Math.ceil(w / sp) + 2;
    const rows = Math.ceil(h / sp) + 2;

    ctx.lineWidth = 1.5 * this.dpr;
    ctx.strokeStyle = 'rgba(120, 200, 230, 0.55)';
    ctx.fillStyle = 'rgba(120, 200, 230, 0.7)';
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const wx = ((startX + c * step) % worldWidth + worldWidth) % worldWidth;
        const wy = ((startY + r * step) % worldHeight + worldHeight) % worldHeight;
        cur.sample(wx, wy);
        const vx = cur.currentVx;
        const vy = cur.currentVy;
        const mag = Math.hypot(vx, vy);
        if (mag < 1e-4) continue;
        const sx = (wx - camera.x) * scale + halfW;
        const sy = (wy - camera.y) * scale + halfH;
        // Arrow length scales with current magnitude (clamped), in screen px.
        const len = Math.min(sp * 0.45, mag * scale * 4 + 6 * this.dpr);
        const ex = sx + (vx / mag) * len;
        const ey = sy + (vy / mag) * len;
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(ex, ey);
        ctx.stroke();
        // Arrowhead.
        const ang = Math.atan2(vy, vx);
        const ah = 4 * this.dpr;
        ctx.beginPath();
        ctx.moveTo(ex, ey);
        ctx.lineTo(ex - ah * Math.cos(ang - 0.4), ey - ah * Math.sin(ang - 0.4));
        ctx.lineTo(ex - ah * Math.cos(ang + 0.4), ey - ah * Math.sin(ang + 0.4));
        ctx.closePath();
        ctx.fill();
      }
    }
  }
}
