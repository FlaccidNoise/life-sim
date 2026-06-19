import { type Metrics } from '../core/sim/metrics';
import { PALETTE } from '../render/palette';
import { syncCanvasDpr } from './canvas-dpr';

const CAP = 600;

/** Ring-buffer Canvas2D dashboard of run-health metrics (§11). */
export class TelemetryDashboard {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly cssW: number;
  private readonly cssH: number;
  private dpr: number;
  private readonly pop = new Float32Array(CAP);
  private readonly photo = new Float32Array(CAP);
  private readonly dig = new Float32Array(CAP);
  private readonly meat = new Float32Array(CAP);
  private readonly energy = new Float32Array(CAP);
  private readonly diversity = new Float32Array(CAP);
  private readonly genoDiv = new Float32Array(CAP);
  private lastGenoDiv = 0;
  private lastMaxGen = 0;
  private head = 0;
  private count = 0;

  constructor(private readonly canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas2D unavailable for telemetry');
    this.ctx = ctx;
    // CSS pixel size comes from the canvas width/height attributes; the backing
    // store is scaled by devicePixelRatio (capped at 2) so lines stay crisp on
    // Retina without changing layout. Drawing then happens in CSS pixels via
    // setTransform (guarded for test stubs that don't implement it).
    this.cssW = canvas.width;
    this.cssH = canvas.height;
    const dpr = Math.min(typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1, 2);
    this.dpr = dpr;
    canvas.width = Math.round(this.cssW * dpr);
    canvas.height = Math.round(this.cssH * dpr);
    if (canvas.style) {
      canvas.style.width = `${this.cssW}px`;
      canvas.style.height = `${this.cssH}px`;
    }
  }

  push(m: Metrics): void {
    const h = this.head;
    this.pop[h] = m.population;
    this.photo[h] = m.photo;
    this.dig[h] = m.digestive;
    this.meat[h] = m.meat;
    this.energy[h] = m.meanEnergy;
    this.diversity[h] = m.diversity;
    this.genoDiv[h] = m.genotypicDiversity;
    this.lastGenoDiv = m.genotypicDiversity;
    this.lastMaxGen = m.maxGeneration;
    this.head = (h + 1) % CAP;
    if (this.count < CAP) this.count++;
  }

  latestGenotypicDiversity(): number {
    return this.lastGenoDiv;
  }

  latestMaxGeneration(): number {
    return this.lastMaxGen;
  }

  /** Max value of a series over the live window (>= floor so an all-zero band still scales). */
  private seriesMax(s: Float32Array, floor: number): number {
    let max = floor;
    for (let k = 0; k < this.count; k++) {
      const v = s[(this.head + CAP - this.count + k) % CAP]!;
      if (v > max) max = v;
    }
    return max;
  }

  /** Plot one series as a polyline within [y0, y0+bandH), autoscaled to `max`. */
  private plot(
    s: Float32Array,
    x0: number,
    y0: number,
    w: number,
    bandH: number,
    max: number,
    colour: string,
  ): void {
    if (this.count < 2) return;
    const ctx = this.ctx;
    ctx.strokeStyle = colour;
    ctx.lineWidth = 1;
    ctx.beginPath();
    const span = this.count - 1;
    for (let k = 0; k < this.count; k++) {
      const v = s[(this.head + CAP - this.count + k) % CAP]!;
      const x = x0 + (k / span) * w;
      const y = y0 + bandH - (v / max) * bandH;
      if (k === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  /** Faint horizontal gridlines across a band + a y-max tag at the top-left. */
  private grid(x0: number, y0: number, w: number, bandH: number, max: number, tag: string): void {
    const ctx = this.ctx;
    ctx.strokeStyle = 'rgba(120,170,210,0.14)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i <= 3; i++) {
      const y = y0 + (bandH * i) / 3;
      ctx.moveTo(x0, y);
      ctx.lineTo(x0 + w, y);
    }
    // Vertical time gridlines at 25/50/75%.
    for (let i = 1; i < 4; i++) {
      const x = x0 + (w * i) / 4;
      ctx.moveTo(x, y0);
      ctx.lineTo(x, y0 + bandH);
    }
    ctx.stroke();
    ctx.fillStyle = 'rgba(127,159,170,0.85)';
    ctx.font = '8px ui-monospace, monospace';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(`${tag} max ${Math.round(max)}`, x0 + 2, y0 + 8);
  }

  /** Draw three stacked mini-charts: populations, mean energy, diversity (0..1). */
  draw(latest: Metrics): void {
    const ctx = this.ctx;
    this.dpr = syncCanvasDpr(this.canvas, ctx, this.cssW, this.cssH, this.dpr);
    const W = this.cssW;
    const H = this.cssH;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 0, W, H);

    const pad = 6;
    const x0 = pad;
    const w = W - pad * 2;
    const bands = 3;
    const bandGap = 8;
    const bandH = (H - pad * 2 - bands * bandGap) / bands;

    // Band 1: populations — total (white) + per type (green/orange/grey), palette-aligned.
    let y = pad;
    const popMax = this.seriesMax(this.pop, 1);
    this.grid(x0, y, w, bandH, popMax, 'pop');
    this.plot(this.photo, x0, y, w, bandH, popMax, PALETTE.photo);
    this.plot(this.dig, x0, y, w, bandH, popMax, PALETTE.digestive);
    this.plot(this.meat, x0, y, w, bandH, popMax, PALETTE.meat);
    this.plot(this.pop, x0, y, w, bandH, popMax, '#ffffff');
    ctx.fillStyle = '#cfe3ee';
    ctx.font = '8px ui-monospace, monospace';
    ctx.fillText(`pop ${latest.population}`, x0 + w - 52, y + 8);

    // Band 2: mean energy.
    y += bandH + bandGap;
    const eMax = this.seriesMax(this.energy, 1);
    this.grid(x0, y, w, bandH, eMax, 'energy');
    this.plot(this.energy, x0, y, w, bandH, eMax, '#5bd1ff');
    ctx.fillStyle = '#cfe3ee';
    ctx.fillText(`E ${latest.meanEnergy.toFixed(1)}`, x0 + w - 52, y + 8);

    // Band 3: diversity, fixed 0..1.
    y += bandH + bandGap;
    this.grid(x0, y, w, bandH, 1, 'div 0..1');
    this.plot(this.diversity, x0, y, w, bandH, 1, '#d98cff');
    this.plot(this.genoDiv, x0, y, w, bandH, 1, '#ffd166'); // genotypic diversity (gold)
    ctx.fillStyle = '#cfe3ee';
    ctx.fillText(
      `pheno ${latest.diversity.toFixed(3)} geno ${latest.genotypicDiversity.toFixed(3)}`,
      x0 + 2,
      y + bandH - 3,
    );

    // X-axis (time) caption: ring buffer, newest at right.
    ctx.fillStyle = 'rgba(127,159,170,0.85)';
    ctx.font = '8px ui-monospace, monospace';
    ctx.textAlign = 'left';
    ctx.fillText('← past', x0, H - 2);
    ctx.textAlign = 'right';
    ctx.fillText(`now · gen ${latest.maxGeneration} · ⌀genome ${latest.meanGenomeSize.toFixed(1)}`, x0 + w, H - 2);
    ctx.textAlign = 'left';

    // Status line: per-type counts + births/deaths.
    ctx.fillStyle = '#9fe';
    ctx.font = '9px ui-monospace, monospace';
    ctx.fillText(
      `p${latest.photo} d${latest.digestive} m${latest.meat} | b${latest.births} d${latest.deaths} · cells/org ${latest.meanCellsPerOrganism.toFixed(1)}`,
      x0,
      H - 12,
    );
  }
}
