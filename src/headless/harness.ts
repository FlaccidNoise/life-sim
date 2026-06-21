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
      series.push({
        tick: world.tick,
        population: world.population,
        births: world.totalBirths,
        deaths: world.totalDeaths,
        food: Math.round(world.food.total()),
        geneMeans: geneMeans(world),
        predators: predatorCount(world),
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
