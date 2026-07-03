/**
 * World stats block — a compact key/value readout of the whole population the per-frame graph can't
 * show as numbers: head-count, vital rates, trophic split, turnover, and energy/age. `summarizePopulation`
 * is the single read-only pass over the live set; the graph and this block share it, so the trophic
 * counts, diet-σ, median age, founder count, and satiated count are computed once per frame.
 *
 * The turnover + hoarding rows make the demo's two pathologies LOUD instead of hiding them in a rising
 * mean: MEDIAN age + %-founders expose a founder-heavy stall (the bootstrap valley) that a rising mean
 * age masks; "% satiated" + the turnover-stalled flag read a right-shifted energy distribution as a
 * mate-starved stall (creatures full but not breeding), not health.
 */
import { type OrganismStore } from '../../core/store';
import { type Config } from '../../core/config';
import { ScalarGene, SCALAR_GENE_COUNT } from '../../core/genome';
import { satiatedBar } from '../../core/economy';
import { dietShape } from '../../render/palette';

// Turnover-stall flag: after this many ticks of warmup, near-zero births means the pool has stopped
// turning over (mate-starved bootstrap valley or a settled monoculture) — surfaced as a loud badge.
const STALL_WARMUP_TICKS = 2000;
const STALL_BIRTHS_PER_TICK = 0.2;

export interface PopSummary {
  n: number;
  herb: number;
  omni: number;
  pred: number;
  dietSigma: number; // population σ of the DIET gene — the diversity / bimodality signal for the graph
  meanAge: number;
  medianAge: number; // median exposes a founder-heavy stall that a rising mean age masks
  founders: number; // alive since tick 0 (age >= tick); a high fraction late = no turnover
  satiated: number; // energy >= satiatedBar: full but (if births≈0) not breeding = mate-starved hoard
  meanEnergy: number;
}

/** One read-only pass over the live set → the whole-population summary the graph + stats block share. */
export function summarizePopulation(store: OrganismStore, tick: number, cfg: Config): PopSummary {
  const n = store.liveCount;
  if (n === 0) {
    return {
      n: 0,
      herb: 0,
      omni: 0,
      pred: 0,
      dietSigma: 0,
      meanAge: 0,
      medianAge: 0,
      founders: 0,
      satiated: 0,
      meanEnergy: 0,
    };
  }
  let eSum = 0;
  let dSum = 0;
  let dSqSum = 0;
  let herb = 0;
  let omni = 0;
  let pred = 0;
  let founders = 0;
  let satiated = 0;
  const ages = new Uint32Array(n); // sorted below for the median (cheaper + steadier than a mean)
  for (let k = 0; k < n; k++) {
    const i = store.liveIndices[k]!;
    const age = store.age[i]!;
    ages[k] = age;
    if (age >= tick) founders++; // born at tick 0 → age tracks tick
    eSum += store.energy[i]!;
    if (store.energy[i]! >= satiatedBar(store.scalarGenes, i, cfg)) satiated++;
    const diet = store.scalarGenes[i * SCALAR_GENE_COUNT + ScalarGene.DIET]!;
    dSum += diet;
    dSqSum += diet * diet;
    const shape = dietShape(diet);
    if (shape === 2) pred++;
    else if (shape === 1) omni++;
    else herb++;
  }
  ages.sort();
  const mean = dSum / n;
  const variance = Math.max(0, dSqSum / n - mean * mean); // clamp float noise so σ can't go NaN
  let ageSum = 0;
  for (let k = 0; k < n; k++) ageSum += ages[k]!;
  return {
    n,
    herb,
    omni,
    pred,
    dietSigma: Math.sqrt(variance),
    meanAge: ageSum / n,
    medianAge: ages[n >> 1]!,
    founders,
    satiated,
    meanEnergy: eSum / n,
  };
}

export class WorldStats {
  constructor(private readonly root: HTMLElement) {
    this.render(null, 0, 0, 0, 0);
  }

  /** `avgBirths`/`avgDeaths` are trailing per-tick vital rates over the last 100 ticks. `tick` drives the
   *  founder-fraction + stall flag; `meanGen` is the lineage-depth turnover readout (computed on the
   *  status cadence). `summary` is null before the first frame (→ "—"), or n===0 for a live-but-empty
   *  world (→ "extinct"). */
  render(
    summary: PopSummary | null,
    avgBirths: number,
    avgDeaths: number,
    tick: number,
    meanGen: number,
  ): void {
    if (!summary || summary.n === 0) {
      this.root.innerHTML = `<div class="ws" style="grid-column:1/-1">
        <span class="ws-k">population</span><span class="ws-v">${summary ? 'extinct' : '—'}</span></div>`;
      return;
    }
    const pct = (x: number): string => `${Math.round((100 * x) / summary.n)}%`;
    const stalled = tick > STALL_WARMUP_TICKS && avgBirths < STALL_BIRTHS_PER_TICK;
    const rows: [string, string][] = [
      ['pop', `${summary.n}`],
      ['diet ○◇△', `${summary.herb}/${summary.omni}/${summary.pred}`],
      ['births/t', avgBirths.toFixed(1)],
      ['deaths/t', avgDeaths.toFixed(1)],
      ['median age', `${summary.medianAge}`],
      ['mean age', `${Math.round(summary.meanAge)}`],
      ['% founders', pct(summary.founders)],
      ['generations', meanGen.toFixed(1)],
      ['% satiated', pct(summary.satiated)],
      ['mean energy', summary.meanEnergy.toFixed(1)],
    ];
    let html = rows
      .map(
        ([k, v]) =>
          `<div class="ws"><span class="ws-k">${k}</span><span class="ws-v">${v}</span></div>`,
      )
      .join('');
    // Loud, full-width turnover badge — a stall (births≈0 past warmup) must not hide behind a rising mean.
    if (stalled) {
      html += `<div class="ws" style="grid-column:1/-1">
        <span class="ws-k" style="color:#e0a06b">⚠ turnover</span><span class="ws-v" style="color:#e0a06b">stalled · births≈0</span></div>`;
    }
    this.root.innerHTML = html;
  }
}
