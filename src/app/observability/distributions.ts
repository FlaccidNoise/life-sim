/**
 * Population distributions — the histograms the headless gene-MEANS hide. A mean is a lie about a
 * bimodal population: diet is split into grazers (~0) and hunters (~0.9), so its mean (~0.18) describes
 * nobody. This panel draws the actual SHAPE — diet (colored green→red like the dots), energy, age,
 * vision range, max speed — plus the herbivore/predator headcount, updating every frame.
 *
 * histogram() is a pure bucketing pass over the live set; the Distributions class is a dumb 2D-canvas
 * drawer over it. Read-only — never touches the sim.
 */
import { type OrganismStore } from '../../core/store';
import { ScalarGene, SCALAR_GENE_COUNT } from '../../core/genome';

/** Bucket the live population by `accessor` into `bins` equal bins over [min,max] (clamped). */
export function histogram(
  store: OrganismStore,
  accessor: (slot: number) => number,
  min: number,
  max: number,
  bins: number,
): number[] {
  const counts = new Array<number>(bins).fill(0);
  const span = max - min || 1;
  const { liveIndices, liveCount } = store;
  for (let k = 0; k < liveCount; k++) {
    const v = accessor(liveIndices[k]!);
    let idx = Math.floor(((v - min) / span) * bins);
    if (idx < 0) idx = 0;
    else if (idx >= bins) idx = bins - 1;
    counts[idx]!++;
  }
  return counts;
}

interface FieldSpec {
  label: string;
  bins: number;
  accessor: (store: OrganismStore, slot: number) => number;
  min: number;
  max: number; // if NaN, computed per-frame from the live max (auto-scale)
  dietColored?: boolean; // color bins green→red (for the diet histogram)
}

const gene =
  (g: number) =>
  (s: OrganismStore, i: number): number =>
    s.scalarGenes[i * SCALAR_GENE_COUNT + g]!;

const FIELDS: readonly FieldSpec[] = [
  { label: 'diet', bins: 14, accessor: gene(ScalarGene.DIET), min: 0, max: 1, dietColored: true },
  { label: 'energy', bins: 16, accessor: (s, i) => s.energy[i]!, min: 0, max: NaN },
  { label: 'age', bins: 16, accessor: (s, i) => s.age[i]!, min: 0, max: NaN },
  { label: 'visionRange', bins: 12, accessor: gene(ScalarGene.VISION_RANGE), min: 0, max: 256 },
  { label: 'maxSpeed', bins: 12, accessor: gene(ScalarGene.MAX_SPEED), min: 1, max: 20 },
];

export class Distributions {
  private readonly ctx: CanvasRenderingContext2D;

  constructor(private readonly canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas context unavailable for distributions');
    this.ctx = ctx;
  }

  render(store: OrganismStore | null): void {
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
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';

    if (!store || store.liveCount === 0) {
      ctx.fillStyle = 'rgba(140,160,180,0.6)';
      ctx.font = `${Math.round(11 * dpr)}px ui-monospace, monospace`;
      ctx.fillText('no live population', 6 * dpr, 8 * dpr);
      return;
    }

    // Header: the trophic headcount the diet-mean hides.
    let herb = 0;
    let pred = 0;
    for (let k = 0; k < store.liveCount; k++) {
      if (store.scalarGenes[store.liveIndices[k]! * SCALAR_GENE_COUNT + ScalarGene.DIET]! >= 0.5)
        pred++;
      else herb++;
    }
    ctx.font = `${Math.round(10 * dpr)}px ui-monospace, monospace`;
    ctx.fillStyle = 'rgba(150,170,190,0.85)';
    ctx.fillText(`pop ${store.liveCount}   herb ${herb}   pred ${pred}`, 6 * dpr, 4 * dpr);

    const headerH = 18 * dpr;
    const rowH = (h - headerH) / FIELDS.length;
    const padL = 6 * dpr;
    const padR = 6 * dpr;
    const barTop = 12 * dpr; // room for the label inside each row

    for (let f = 0; f < FIELDS.length; f++) {
      const spec = FIELDS[f]!;
      let max = spec.max;
      if (Number.isNaN(max)) {
        max = 1;
        for (let k = 0; k < store.liveCount; k++) {
          const v = spec.accessor(store, store.liveIndices[k]!);
          if (v > max) max = v;
        }
      }
      const counts = histogram(store, (i) => spec.accessor(store, i), spec.min, max, spec.bins);
      let peak = 1;
      for (const c of counts) if (c > peak) peak = c;

      const y0 = headerH + f * rowH;
      // Label + range.
      ctx.font = `${Math.round(10 * dpr)}px ui-monospace, monospace`;
      ctx.fillStyle = 'rgba(140,160,180,0.8)';
      ctx.fillText(`${spec.label} [${spec.min}–${Math.round(max)}]`, padL, y0);

      const bx0 = padL;
      const bw = (w - padL - padR) / spec.bins;
      const barAreaTop = y0 + barTop;
      const barAreaH = rowH - barTop - 3 * dpr;
      for (let b = 0; b < spec.bins; b++) {
        const bh = (counts[b]! / peak) * barAreaH;
        if (spec.dietColored) {
          const t = b / (spec.bins - 1); // green (herbivore) → red (predator)
          ctx.fillStyle = `rgb(${Math.round(60 + 180 * t)},${Math.round(200 - 140 * t)},90)`;
        } else {
          ctx.fillStyle = 'rgba(120,200,240,0.8)';
        }
        ctx.fillRect(bx0 + b * bw, barAreaTop + (barAreaH - bh), Math.max(1, bw - dpr), bh);
      }
    }
  }
}
