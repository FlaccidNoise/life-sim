import { type CellArrays } from '../memory/cell-store';
import { CellType } from '../cells/types';
import { type OrganismTable } from '../organism/organisms';
import { type GenomeStore } from '../genome/genome';
import { genomeTraits, genomeSignature } from '../genome/traits';

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
  motile: number;
  meat: number;
  meanEnergy: number;
  diversity: number;
  births: number;
  deaths: number;
  liveOrganisms: number;
  organismBirths: number;
  organismDeaths: number;
  birthsReachedAdulthood: number;
  /** Simpson index over genomeSignature of live genome organisms (genotypic, M7). */
  genotypicDiversity: number;
  meanCellsPerOrganism: number;
  meanSensorsPerOrganism: number;
  meanGenomeSize: number;
  maxGeneration: number;
}

export function makeMetrics(): Metrics {
  return {
    tick: 0,
    population: 0,
    photo: 0,
    digestive: 0,
    motile: 0,
    meat: 0,
    meanEnergy: 0,
    diversity: 0,
    births: 0,
    deaths: 0,
    liveOrganisms: 0,
    organismBirths: 0,
    organismDeaths: 0,
    birthsReachedAdulthood: 0,
    genotypicDiversity: 0,
    meanCellsPerOrganism: 0,
    meanSensorsPerOrganism: 0,
    meanGenomeSize: 0,
    maxGeneration: 0,
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
  liveOrganisms = 0,
  organismBirths = 0,
  organismDeaths = 0,
  birthsReachedAdulthood = 0,
): void {
  let photo = 0;
  let digestive = 0;
  let motile = 0;
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
    } else if (t === CellType.MOTILE) {
      motile++;
      energySum += f.energy[i]!;
    } else if (t === CellType.MEAT) {
      meat++;
    }
  }
  const living = photo + digestive + motile;
  let diversity = 0;
  if (living > 0) {
    const pp = photo / living;
    const pd = digestive / living;
    const pm = motile / living;
    diversity = 1 - (pp * pp + pd * pd + pm * pm);
  }
  out.tick = tick;
  out.population = n;
  out.photo = photo;
  out.digestive = digestive;
  out.motile = motile;
  out.meat = meat;
  out.meanEnergy = living > 0 ? energySum / living : 0;
  out.diversity = diversity;
  out.births = births;
  out.deaths = deaths;
  out.liveOrganisms = liveOrganisms;
  out.organismBirths = organismBirths;
  out.organismDeaths = organismDeaths;
  out.birthsReachedAdulthood = birthsReachedAdulthood;
}

/**
 * Evolution telemetry (M7 §5): genotypic diversity + trait means over LIVE genome
 * organisms. Read-only — writes only into `out`, draws no RNG, mutates no SoA, so it is
 * not part of the byte-identical determinism contract. Allocates a Map (signature
 * buckets), so callers run it at a reduced cadence (config.metricsEvolutionInterval),
 * NOT in the per-tick hot loop.
 */
export function sampleEvolutionMetrics(
  out: Metrics,
  organisms: OrganismTable,
  genomes: GenomeStore,
): void {
  let count = 0;
  let cellsSum = 0;
  let sensorsSum = 0;
  let genesSum = 0;
  let maxGen = 0;
  const sigCounts = new Map<string, number>();
  for (let org = 1; org < organisms.maxOrganisms; org++) {
    if (!organisms.isAlive(org) || organisms.cellCount[org]! === 0) continue;
    const ref = organisms.genomeRef[org]!;
    if (ref < 0) continue;
    const g = genomes.get(ref);
    if (g === undefined) continue;
    const tr = genomeTraits(g);
    count++;
    cellsSum += organisms.cellCount[org]!;
    sensorsSum += tr.sensorGenes;
    genesSum += tr.geneCount;
    if (tr.generation > maxGen) maxGen = tr.generation;
    const sig = genomeSignature(g);
    sigCounts.set(sig, (sigCounts.get(sig) ?? 0) + 1);
  }
  let diversity = 0;
  if (count > 0) {
    let sumSq = 0;
    for (const c of sigCounts.values()) {
      const p = c / count;
      sumSq += p * p;
    }
    diversity = 1 - sumSq;
  }
  out.genotypicDiversity = diversity;
  out.meanCellsPerOrganism = count > 0 ? cellsSum / count : 0;
  out.meanSensorsPerOrganism = count > 0 ? sensorsSum / count : 0;
  out.meanGenomeSize = count > 0 ? genesSum / count : 0;
  out.maxGeneration = maxGen;
}
