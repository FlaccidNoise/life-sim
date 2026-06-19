import { type World } from '../core/sim/world';
import { type Camera } from './webgl-renderer';

/**
 * §10 rock-overlay — draws every live rock as a filled grey disc with a darker
 * outline. A canvas-2D overlay (mirrors BondOverlay's class shape).
 *
 * Read-only over core. Projection:
 *   screen = (world - camera) * scale + viewport/2
 */
export class RockOverlay {
  private readonly ctx: CanvasRenderingContext2D;
  private dpr = 1;

  constructor(private readonly canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('rock overlay needs a 2D context');
    this.ctx = ctx;
  }

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

    const rocks = world.rocks;
    const halfW = w / 2;
    const halfH = h / 2;
    const scale = camera.scale;

    for (let i = 0; i < rocks.rockCount; i++) {
      const rx = rocks.cx[i]!;
      const ry = rocks.cy[i]!;
      const rr = rocks.radius[i]!;

      const sx = (rx - camera.x) * scale + halfW;
      const sy = (ry - camera.y) * scale + halfH;
      const sr = rr * scale;

      // Off-screen cull (generous margin for toroidal wraps).
      if (sx + sr < -64 || sx - sr > w + 64 || sy + sr < -64 || sy - sr > h + 64) continue;

      ctx.beginPath();
      ctx.arc(sx, sy, sr, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(90,90,100,0.85)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(50,50,60,0.9)';
      ctx.lineWidth = 1.5 * this.dpr;
      ctx.stroke();
    }
  }
}