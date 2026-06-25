/**
 * Detail overlay — a transparent Canvas2D layer stacked over the WebGL canvas, sharing the same
 * camera transform. Only creatures whose on-screen radius crosses the Tier-1 threshold are drawn
 * here (a handful at most), so cost scales with VISIBLE detailed creatures, not population. The far
 * swarm stays on the batched WebGL point pass. Read-only over sim state — no determinism impact.
 */
import { type OrganismStore } from '../core/store';
import { SCALAR_GENE_COUNT, ScalarGene } from '../core/genome';
import { GeneView, buildDerived, type VisualOpts } from './detail/gene-view';
import { dispatch } from './detail/registry';

export class DetailOverlay {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private camX: number;
  private camY: number;
  private zoom = 1;
  private opts: VisualOpts = { showCone: false };

  constructor(
    private readonly host: HTMLCanvasElement,
    private readonly worldWidth: number,
    private readonly worldHeight: number,
  ) {
    this.camX = worldWidth / 2;
    this.camY = worldHeight / 2;
    // Build a sibling canvas absolutely positioned over the host (same box), non-interactive so
    // mouse events still reach the WebGL canvas / its listeners. In a DOM-less (test) env there is
    // no document to create one — fall back to the host canvas itself.
    const doc = (globalThis as { document?: Document }).document;
    const c = doc ? doc.createElement('canvas') : host;
    if (c !== host) {
      c.style.position = 'absolute';
      c.style.left = '0';
      c.style.top = '0';
      c.style.width = '100%';
      c.style.height = '100%';
      c.style.pointerEvents = 'none';
      const parent = host.parentElement;
      if (!parent) throw new Error('DetailOverlay: host canvas has no parent to stack onto');
      parent.appendChild(c);
    }
    const ctx = c.getContext('2d');
    if (!ctx) throw new Error('DetailOverlay: 2D context unavailable');
    this.canvas = c;
    this.ctx = ctx;
    this.resize();
  }

  resize(): void {
    const dpr = globalThis.devicePixelRatio || 1;
    const w = Math.max(1, Math.floor(this.host.clientWidth * dpr));
    const h = Math.max(1, Math.floor(this.host.clientHeight * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
  }

  setShowCone(v: boolean): void {
    this.opts.showCone = v;
  }

  setCamera(x: number, y: number, zoom: number): void {
    this.camX = x;
    this.camY = y;
    this.zoom = zoom < 1 ? 1 : zoom > 64 ? 64 : zoom;
  }

  private baseScale(): number {
    return Math.min(this.canvas.width / this.worldWidth, this.canvas.height / this.worldHeight);
  }

  private effScale(): number {
    return this.baseScale() * this.zoom;
  }

  worldToScreen(wx: number, wy: number): { x: number; y: number } {
    const sc = this.effScale();
    return {
      x: (wx - this.camX) * sc + this.canvas.width / 2,
      y: (wy - this.camY) * sc + this.canvas.height / 2,
    };
  }

  onScreenRadius(slot: number, store: OrganismStore): number {
    const size = store.scalarGenes[slot * SCALAR_GENE_COUNT + ScalarGene.SIZE]!;
    return Math.max(1, size * this.effScale());
  }

  tierFor(pxR: number): 0 | 1 | 2 {
    return pxR < 6 ? 0 : pxR < 22 ? 1 : 2;
  }

  draw(store: OrganismStore): void {
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    const { liveIndices, liveCount, x, y } = store;
    const W = this.canvas.width;
    const H = this.canvas.height;
    for (let k = 0; k < liveCount; k++) {
      const i = liveIndices[k]!;
      const R = this.onScreenRadius(i, store);
      const tier = this.tierFor(R);
      if (tier === 0) continue; // far swarm stays on the WebGL pass
      const sp = this.worldToScreen(x[i]!, y[i]!);
      if (sp.x < -R || sp.x > W + R || sp.y < -R || sp.y > H + R) continue; // off-screen cull
      ctx.save();
      ctx.translate(sp.x, sp.y);
      // grounding flat shadow (drawn unrotated, before the body rotates)
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      ctx.beginPath();
      ctx.ellipse(0, R * 0.5, R * 0.92, R * 0.3, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.rotate(store.heading[i]!);
      const genes = new GeneView(store, i);
      dispatch({ ctx, R, tier, genes, derived: buildDerived(genes), opts: this.opts });
      ctx.restore();
    }
  }
}
