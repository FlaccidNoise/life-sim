/**
 * Time-series graph — a scrolling line chart on a 2D canvas. Phase 0 plots one series (population);
 * each later phase adds series (food, births/deaths, mean energy, generation, …). This is where
 * collapse/extinction must read LOUD (the old engine's silent collapse should have been obvious on a
 * graph like this). Generic over N named series; auto-scales Y to the observed max.
 */
export interface Series {
  label: string;
  color: string;
}

export class TimeSeriesGraph {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly history: number[][] = []; // history[seriesIdx] = ring of values
  private readonly maxPoints = 600;
  private ticks: number[] = [];

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly series: Series[],
  ) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas context unavailable for the graph');
    this.ctx = ctx;
    for (let i = 0; i < series.length; i++) this.history.push([]);
  }

  push(tick: number, values: number[]): void {
    this.ticks.push(tick);
    if (this.ticks.length > this.maxPoints) this.ticks.shift();
    for (let i = 0; i < this.series.length; i++) {
      const h = this.history[i]!;
      h.push(values[i] ?? 0);
      if (h.length > this.maxPoints) h.shift();
    }
  }

  render(): void {
    const dpr = globalThis.devicePixelRatio || 1;
    const w = Math.max(1, Math.floor(this.canvas.clientWidth * dpr));
    const h = Math.max(1, Math.floor(this.canvas.clientHeight * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    const ctx = this.ctx;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(120,170,210,0.06)';
    ctx.fillRect(0, 0, w, h);

    const n = this.ticks.length;
    if (n >= 2) {
      for (let si = 0; si < this.series.length; si++) {
        const hser = this.history[si]!;
        // Per-series normalization — each line uses the full height scaled to its OWN running max, so
        // a huge series (food) doesn't flatten a small one (population). Shapes/phase stay readable.
        let smax = 1;
        for (const v of hser) if (v > smax) smax = v;
        ctx.beginPath();
        ctx.strokeStyle = this.series[si]!.color;
        ctx.lineWidth = Math.max(1, dpr);
        for (let i = 0; i < hser.length; i++) {
          const px = (i / (this.maxPoints - 1)) * w;
          const py = h - (hser[i]! / smax) * (h - 4) - 2;
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.stroke();
      }
    }

    // Labels: "label current (max seen)".
    ctx.font = `${Math.round(11 * dpr)}px ui-monospace, monospace`;
    ctx.textBaseline = 'top';
    let ly = 4 * dpr;
    for (let si = 0; si < this.series.length; si++) {
      const hser = this.history[si]!;
      let smax = 0;
      for (const v of hser) if (v > smax) smax = v;
      const cur = hser.length ? hser[hser.length - 1]! : 0;
      ctx.fillStyle = this.series[si]!.color;
      ctx.fillText(
        `${this.series[si]!.label} ${Math.round(cur)} (max ${Math.round(smax)})`,
        6 * dpr,
        ly,
      );
      ly += 14 * dpr;
    }
  }
}
