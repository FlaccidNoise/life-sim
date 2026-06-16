import { type CellArrays } from '../memory/cell-store';
import { CellType } from '../cells/types';

/**
 * Per-tick health metrics (§4.5, §11). Phenotypic diversity = Simpson index over
 * LIVING cell types. Genotypic diversity is omitted until genomes exist (M6) —
 * not faked. Allocation-free: callers reuse one Metrics object via makeMetrics().
 * Call this over the CURRENT live set (after the tick's second rebuildLive) so
 * freed corpses are excluded and newborns included.
 */
export interface Metrics {
  tick: number;
  population: number;
  photo: number;
  digestive: number;
  meat: number;
  meanEnergy: number;
  diversity: number;
  births: number;
  deaths: number;
}

export function makeMetrics(): Metrics {
  return {
    tick: 0,
    population: 0,
    photo: 0,
    digestive: 0,
    meat: 0,
    meanEnergy: 0,
    diversity: 0,
    births: 0,
    deaths: 0,
  };
}

export function sampleMetrics(
  out: Metrics,
  live: Uint32Array,
  n: number,
  f: CellArrays,
  tick: number,
  births: number,
  deaths: number,
): void {
  let photo = 0;
  let digestive = 0;
  let meat = 0;
  let energySum = 0;
  for (let k = 0; k < n; k++) {
    const i = live[k]!;
    const t = f.cellType[i]!;
    if (t === CellType.PHOTO) {
      photo++;
      energySum += f.energy[i]!;
    } else if (t === CellType.DIGESTIVE) {
      digestive++;
      energySum += f.energy[i]!;
    } else if (t === CellType.MEAT) {
      meat++;
    }
  }
  const living = photo + digestive;
  let diversity = 0;
  if (living > 0) {
    const pp = photo / living;
    const pd = digestive / living;
    diversity = 1 - (pp * pp + pd * pd);
  }
  out.tick = tick;
  out.population = n;
  out.photo = photo;
  out.digestive = digestive;
  out.meat = meat;
  out.meanEnergy = living > 0 ? energySum / living : 0;
  out.diversity = diversity;
  out.births = births;
  out.deaths = deaths;
}
