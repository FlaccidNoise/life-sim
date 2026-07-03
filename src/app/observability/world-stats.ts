/**
 * World stats block — a compact key/value readout of the whole population the per-frame graph can't
 * show as numbers: head-count, vital rates, trophic split, and energy/age means. `summarizePopulation`
 * is the single read-only pass over the live set (one loop, no allocation beyond the summary object);
 * the graph and this block share it, so the trophic counts and diet-σ are computed once per frame.
 */
import { type OrganismStore } from '../../core/store';
import { ScalarGene, SCALAR_GENE_COUNT } from '../../core/genome';
import { dietShape } from '../../render/palette';

export interface PopSummary {
  n: number;
  herb: number;
  omni: number;
  pred: number;
  dietSigma: number; // population σ of the DIET gene — the diversity / bimodality signal for the graph
  meanAge: number;
  meanEnergy: number;
}

/** One read-only pass over the live set → the whole-population summary the graph + stats block share. */
export function summarizePopulation(store: OrganismStore): PopSummary {
  const n = store.liveCount;
  if (n === 0) return { n: 0, herb: 0, omni: 0, pred: 0, dietSigma: 0, meanAge: 0, meanEnergy: 0 };
  let ageSum = 0;
  let eSum = 0;
  let dSum = 0;
  let dSqSum = 0;
  let herb = 0;
  let omni = 0;
  let pred = 0;
  for (let k = 0; k < n; k++) {
    const i = store.liveIndices[k]!;
    ageSum += store.age[i]!;
    eSum += store.energy[i]!;
    const diet = store.scalarGenes[i * SCALAR_GENE_COUNT + ScalarGene.DIET]!;
    dSum += diet;
    dSqSum += diet * diet;
    const shape = dietShape(diet);
    if (shape === 2) pred++;
    else if (shape === 1) omni++;
    else herb++;
  }
  const mean = dSum / n;
  const variance = Math.max(0, dSqSum / n - mean * mean); // clamp float noise so σ can't go NaN
  return {
    n,
    herb,
    omni,
    pred,
    dietSigma: Math.sqrt(variance),
    meanAge: ageSum / n,
    meanEnergy: eSum / n,
  };
}

export class WorldStats {
  constructor(private readonly root: HTMLElement) {
    this.render(null, 0, 0);
  }

  /** `avgBirths`/`avgDeaths` are trailing per-tick vital rates averaged over the last 100 ticks.
   *  `summary` is null before the first frame (→ "—"), or n===0 for a live-but-empty world (→ "extinct"). */
  render(summary: PopSummary | null, avgBirths: number, avgDeaths: number): void {
    if (!summary || summary.n === 0) {
      this.root.innerHTML = `<div class="ws" style="grid-column:1/-1">
        <span class="ws-k">population</span><span class="ws-v">${summary ? 'extinct' : '—'}</span></div>`;
      return;
    }
    const rows: [string, string][] = [
      ['pop', `${summary.n}`],
      ['diet ○◇△', `${summary.herb}/${summary.omni}/${summary.pred}`],
      ['births/t', avgBirths.toFixed(1)],
      ['deaths/t', avgDeaths.toFixed(1)],
      ['mean age', `${Math.round(summary.meanAge)}`],
      ['mean energy', summary.meanEnergy.toFixed(1)],
    ];
    this.root.innerHTML = rows
      .map(
        ([k, v]) =>
          `<div class="ws"><span class="ws-k">${k}</span><span class="ws-v">${v}</span></div>`,
      )
      .join('');
  }
}
