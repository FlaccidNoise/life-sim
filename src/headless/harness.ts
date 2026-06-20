/**
 * Headless harness — runs the SAME sim core as the browser, with no rendering. Two standing jobs
 * (per the rebuild spec, safeguard #3): the determinism check (same seed → identical hash) and the
 * ablation engine (ON vs OFF comparison). It emits the SAME metrics the live time-series graph shows
 * plus the golden state-hash, so "what we measure" and "what we watch" can never diverge.
 */
import { World } from '../core/world';
import { type Config } from '../core/config';

export interface SamplePoint {
  tick: number;
  population: number;
  births: number; // cumulative
  deaths: number; // cumulative
  food: number; // total standing biomass
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
