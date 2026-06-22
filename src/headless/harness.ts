/**
 * Headless harness — runs the SAME sim core as the browser, with no rendering. Two standing jobs
 * (per the rebuild spec, safeguard #3): the determinism check (same seed → identical hash) and the
 * ablation engine (ON vs OFF comparison). It emits the SAME metrics the live time-series graph shows
 * plus the golden state-hash, so "what we measure" and "what we watch" can never diverge.
 */
import { World } from '../core/world';
import { type Config } from '../core/config';
import { SCALAR_GENE_COUNT, ScalarGene } from '../core/genome';

export interface SamplePoint {
  tick: number;
  population: number;
  births: number; // cumulative
  deaths: number; // cumulative
  food: number; // total standing biomass
  geneMeans: number[]; // population-mean of each scalar gene (watch selection move them)
  predators: number; // count of creatures with diet ≥ 0.5 (the hunter side of the trophic split)
  // Lever B niche-split evidence. The FORAGE_PREF MEAN (in geneMeans) can't tell "all generalists at
  // 0.5" from "two specialist peaks at 0 and 1" — both average 0.5 — so we also track its dispersion:
  foragePrefVar: number; // population variance of FORAGE_PREF (≈0 ⇒ no spread; single-channel pins it)
  foragePrefBimodality: number; // Sarle's bimodality coefficient BC; >5/9≈0.555 ⇒ two-niche split. 0 if no spread.
}

/**
 * Dispersion of a sample: population variance + Sarle's bimodality coefficient BC = (skew²+1)/kurtosis
 * (kurtosis non-excess, normal=3). BC ∈ (0,1]; BC > 5/9 ≈ 0.555 indicates a bimodal distribution — for
 * FORAGE_PREF that's the direct fingerprint of disruptive selection splitting the population into
 * channel-A and channel-B specialists (lever B's win condition). Returns {variance:0, bimodality:0}
 * when there's no spread (e.g. single-channel pins FORAGE_PREF at its center → BC undefined → 0). Pure
 * (operates on a value array) so the BC math is unit-testable independent of a full sim run.
 */
export function dispersionStats(values: number[]): { variance: number; bimodality: number } {
  const n = values.length;
  if (n < 2) return { variance: 0, bimodality: 0 };
  let mean = 0;
  for (let k = 0; k < n; k++) mean += values[k]!;
  mean /= n;
  let m2 = 0;
  let m3 = 0;
  let m4 = 0;
  for (let k = 0; k < n; k++) {
    const d = values[k]! - mean;
    const d2 = d * d;
    m2 += d2;
    m3 += d2 * d;
    m4 += d2 * d2;
  }
  m2 /= n;
  m3 /= n;
  m4 /= n;
  if (m2 === 0) return { variance: 0, bimodality: 0 }; // degenerate (all identical) — BC undefined
  const skew = m3 / Math.pow(m2, 1.5);
  const kurt = m4 / (m2 * m2); // Pearson (non-excess): normal → 3
  return { variance: m2, bimodality: (skew * skew + 1) / kurt };
}

/** FORAGE_PREF dispersion over the live population (lever B niche-split evidence; see dispersionStats). */
function foragePrefStats(world: World): { variance: number; bimodality: number } {
  const { liveIndices, liveCount, scalarGenes } = world.store;
  const values = new Array<number>(liveCount);
  for (let k = 0; k < liveCount; k++)
    values[k] = scalarGenes[liveIndices[k]! * SCALAR_GENE_COUNT + ScalarGene.FORAGE_PREF]!;
  return dispersionStats(values);
}

/** Population means of every scalar gene (all 0 when extinct). */
function geneMeans(world: World): number[] {
  const { liveIndices, liveCount, scalarGenes } = world.store;
  const means = new Array<number>(SCALAR_GENE_COUNT).fill(0);
  if (liveCount === 0) return means;
  for (let k = 0; k < liveCount; k++) {
    const base = liveIndices[k]! * SCALAR_GENE_COUNT;
    for (let g = 0; g < SCALAR_GENE_COUNT; g++) means[g]! += scalarGenes[base + g]!;
  }
  for (let g = 0; g < SCALAR_GENE_COUNT; g++) means[g]! /= liveCount;
  return means;
}

/** Count creatures on the hunter side of the trophic split (diet ≥ 0.5). */
function predatorCount(world: World): number {
  const { liveIndices, liveCount, scalarGenes } = world.store;
  let n = 0;
  for (let k = 0; k < liveCount; k++) {
    if (scalarGenes[liveIndices[k]! * SCALAR_GENE_COUNT + ScalarGene.DIET]! >= 0.5) n++;
  }
  return n;
}

export interface RunResult {
  finalHash: string;
  finalPopulation: number;
  totalBirths: number;
  totalDeaths: number;
  extinctAtTick: number; // -1 if never extinct
  series: SamplePoint[];
}

/** Run `ticks` steps, sampling metrics every `sampleEvery` ticks. */
export function runHeadless(config: Config, ticks: number, sampleEvery = 500): RunResult {
  const world = new World(config);
  const series: SamplePoint[] = [];
  let extinctAtTick = -1;
  for (let t = 1; t <= ticks; t++) {
    world.step();
    if (extinctAtTick < 0 && world.population === 0) extinctAtTick = t;
    if (t % sampleEvery === 0) {
      const fp = foragePrefStats(world);
      series.push({
        tick: world.tick,
        population: world.population,
        births: world.totalBirths,
        deaths: world.totalDeaths,
        food: Math.round(world.food.total()),
        geneMeans: geneMeans(world),
        predators: predatorCount(world),
        foragePrefVar: fp.variance,
        foragePrefBimodality: fp.bimodality,
      });
    }
  }
  return {
    finalHash: world.stateHash(),
    finalPopulation: world.population,
    totalBirths: world.totalBirths,
    totalDeaths: world.totalDeaths,
    extinctAtTick,
    series,
  };
}
