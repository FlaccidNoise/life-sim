import { type Metrics } from '../core/sim/metrics';

const CAP = 600;

/** Ring-buffer Canvas2D dashboard of run-health metrics (§11). */
export class TelemetryDashboard {
  private readonly ctx: CanvasRenderingContext2D;
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

  /** Draw three stacked mini-charts: populations, mean energy, diversity (0..1). */
  draw(latest: Metrics): void {
    const ctx = this.ctx;
    const W = this.canvas.width;
    const H = this.canvas.height;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 0, W, H);

    const pad = 6;
    const textH = 16;
    const x0 = pad;
    const w = W - pad * 2;
    const bands = 3;
    const bandGap = 6;
    const bandH = (H - textH - pad - bands * bandGap) / bands;

    const label = (text: string, x: number, y: number): void => {
      ctx.fillStyle = '#7fa';
      ctx.font = '9px monospace';
      ctx.fillText(text, x, y);
    };

    // Band 1: populations — total (white) + per type (green/orange/grey).
    let y = pad;
    const popMax = this.seriesMax(this.pop, 1);
    this.plot(this.photo, x0, y, w, bandH, popMax, '#4ecb59');
    this.plot(this.dig, x0, y, w, bandH, popMax, '#f37333');
    this.plot(this.meat, x0, y, w, bandH, popMax, '#8c8073');
    this.plot(this.pop, x0, y, w, bandH, popMax, '#ffffff');
    label(`pop ${latest.population} (max ${Math.round(popMax)})`, x0, y + 9);

    // Band 2: mean energy.
    y += bandH + bandGap;
    const eMax = this.seriesMax(this.energy, 1);
    this.plot(this.energy, x0, y, w, bandH, eMax, '#5bd1ff');
    label(`energy ${latest.meanEnergy.toFixed(1)} (max ${Math.round(eMax)})`, x0, y + 9);

    // Band 3: diversity, fixed 0..1.
    y += bandH + bandGap;
    this.plot(this.diversity, x0, y, w, bandH, 1, '#d98cff');
    this.plot(this.genoDiv, x0, y, w, bandH, 1, '#ffd166'); // genotypic diversity (gold)
    label(
      `diversity pheno ${latest.diversity.toFixed(3)} geno ${latest.genotypicDiversity.toFixed(3)} · gen ${latest.maxGeneration} · size ${latest.meanGenomeSize.toFixed(1)}`,
      x0,
      y + 9,
    );

    // Status text line.
    ctx.fillStyle = '#9fe';
    ctx.font = '10px monospace';
    ctx.fillText(
      `p${latest.photo} d${latest.digestive} m${latest.meat} | b${latest.births} d${latest.deaths}`,
      x0,
      H - 4,
    );
  }
}
