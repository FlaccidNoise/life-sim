/**
 * Time-series graph — a scrolling chart on a 2D canvas. Two series kinds:
 *   - `band: true`  → a STACKED FILLED area. All band series share one normalization (the running max
 *     of their per-sample total), so the stack's envelope reads as the total and each slice's thickness
 *     reads as its share. This is where the trophic story lives: the grazer/omnivore/predator split and
 *     the predator crash/recovery are watchable as the red slice growing and shrinking.
 *   - line (default) → a self-normalized stroke (each scaled to its OWN running max) so a huge series
 *     (food) doesn't flatten a small one (births/deaths, diet-σ). Collapse/extinction must read LOUD.
 * The textual legend (swatch + current value) renders into an optional sibling element so the plot
 * itself stays uncluttered even with many series.
 */
export interface Series {
  label: string;
  color: string;
  band?: boolean; // true = stacked filled area (shared normalization); else a self-normalized line
}

export class TimeSeriesGraph {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly history: number[][] = []; // history[seriesIdx] = ring of values
  private readonly maxPoints = 600;
  private ticks: number[] = [];
  private readonly bandIdx: number[]; // series indices drawn as stacked bands (fixed at construction)

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly series: Series[],
    private readonly legendEl?: HTMLElement,
  ) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas context unavailable for the graph');
    this.ctx = ctx;
    for (let i = 0; i < series.length; i++) this.history.push([]);
    this.bandIdx = series.map((s, i) => (s.band ? i : -1)).filter((i) => i >= 0);
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
    const xOf = (i: number): number => (i / (this.maxPoints - 1)) * w;
    if (n >= 2) {
      this.drawBands(w, h, n, xOf);
      this.drawLines(w, h, n, xOf);
    }
    this.renderLegend();
  }

  /** Stacked filled areas for the `band` series, sharing one normalization (running max stack total). */
  private drawBands(w: number, h: number, n: number, xOf: (i: number) => number): void {
    const bandIdx = this.bandIdx;
    if (bandIdx.length === 0) return;
    let bandMax = 1;
    for (let i = 0; i < n; i++) {
      let tot = 0;
      for (const si of bandIdx) tot += this.history[si]![i] ?? 0;
      if (tot > bandMax) bandMax = tot;
    }
    const yOf = (v: number): number => h - (v / bandMax) * (h - 4) - 2;
    const ctx = this.ctx;
    const lower = new Float64Array(n); // cumulative height below the current slice
    for (const si of bandIdx) {
      const hser = this.history[si]!;
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const px = xOf(i);
        const py = yOf(lower[i]! + (hser[i] ?? 0)); // upper edge (cumulative incl. this slice)
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      for (let i = n - 1; i >= 0; i--) ctx.lineTo(xOf(i), yOf(lower[i]!)); // lower edge, back
      ctx.closePath();
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = this.series[si]!.color;
      ctx.fill();
      ctx.globalAlpha = 1;
      for (let i = 0; i < n; i++) lower[i]! += hser[i] ?? 0;
    }
  }

  /** Self-normalized strokes for the non-band series (each scaled to its own running max). */
  private drawLines(w: number, h: number, n: number, xOf: (i: number) => number): void {
    const ctx = this.ctx;
    const dpr = globalThis.devicePixelRatio || 1;
    for (let si = 0; si < this.series.length; si++) {
      if (this.series[si]!.band) continue;
      const hser = this.history[si]!;
      let smax = 1;
      for (const v of hser) if (v > smax) smax = v;
      ctx.beginPath();
      ctx.strokeStyle = this.series[si]!.color;
      ctx.lineWidth = Math.max(1, dpr);
      for (let i = 0; i < hser.length; i++) {
        const px = xOf(i);
        const py = h - (hser[i]! / smax) * (h - 4) - 2;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
    }
  }

  /** Swatch + current-value legend into the sibling element (keeps the plot itself uncluttered). */
  private renderLegend(): void {
    if (!this.legendEl) return;
    const fmt = (v: number): string => (v < 10 ? v.toFixed(2) : `${Math.round(v)}`);
    this.legendEl.innerHTML = this.series
      .map((s, si) => {
        const hser = this.history[si]!;
        const cur = hser.length ? hser[hser.length - 1]! : 0;
        const sw = `display:inline-block;width:8px;height:8px;border-radius:2px;background:${s.color};margin-right:3px;vertical-align:middle`;
        return `<span><i style="${sw}"></i>${s.label} ${fmt(cur)}</span>`;
      })
      .join('');
  }
}
