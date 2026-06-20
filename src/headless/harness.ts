/**
 * Headless harness — runs the SAME sim core as the browser, with no rendering. Two standing jobs
 * (per the rebuild spec, safeguard #3): the determinism check (same seed → identical hash) and, in
 * later phases, the ablation engine (ON vs OFF comparison). It emits the SAME metrics the live
 * time-series graph shows plus the golden state-hash, so "what we measure" and "what we watch" can
 * never diverge.
 */
import { World } from '../core/world';
import { type Config } from '../core/config';

export interface SamplePoint {
  tick: number;
  population: number;
}

export interface RunResult {
  finalHash: string;
  series: SamplePoint[];
}

/** Run `ticks` steps, sampling metrics every `sampleEvery` ticks. */
export function runHeadless(config: Config, ticks: number, sampleEvery = 100): RunResult {
  const world = new World(config);
  const series: SamplePoint[] = [];
  for (let t = 1; t <= ticks; t++) {
    world.step();
    if (t % sampleEvery === 0) series.push({ tick: world.tick, population: world.population });
  }
  return { finalHash: world.stateHash(), series };
}
