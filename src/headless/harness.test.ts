import { describe, it, expect } from 'vitest';
import { dispersionStats, runHeadless } from './harness';
import { defaultConfig } from '../core/config';
import { ScalarGene } from '../core/genome';

describe('dispersionStats (lever B niche-split metric)', () => {
  it('reports zero variance and zero bimodality for an identical (degenerate) sample', () => {
    const r = dispersionStats(new Array<number>(50).fill(0.5));
    expect(r.variance).toBe(0);
    expect(r.bimodality).toBe(0); // BC is undefined with no spread → reported 0, not NaN
  });

  it('reports zero for samples too small to have a distribution', () => {
    expect(dispersionStats([]).bimodality).toBe(0);
    expect(dispersionStats([0.7]).bimodality).toBe(0);
  });

  it('flags a two-peak (specialist) distribution as bimodal (BC > 5/9)', () => {
    // Half the population pinned at channel-A (0), half at channel-B (1): the niche-split shape.
    const split = [...new Array<number>(40).fill(0), ...new Array<number>(40).fill(1)];
    const r = dispersionStats(split);
    expect(r.variance).toBeCloseTo(0.25, 6); // var of a balanced {0,1} Bernoulli
    expect(r.bimodality).toBeGreaterThan(5 / 9); // ≈0.555 threshold — clearly bimodal
  });

  it('does NOT flag a unimodal (generalist) cluster as bimodal', () => {
    // A PEAKED single mode at the 0.5 generalist center: frequency falls off with distance (triangular),
    // giving high kurtosis → BC well below the 0.555 threshold. (A flat/uniform spread would sit right AT
    // the threshold — bimodality specifically needs the central DIP that two specialist peaks create.)
    const cluster: number[] = [];
    const bins: [number, number][] = [
      [0.5, 30],
      [0.45, 18],
      [0.55, 18],
      [0.4, 8],
      [0.6, 8],
      [0.35, 2],
      [0.65, 2],
    ];
    for (const [v, n] of bins) for (let i = 0; i < n; i++) cluster.push(v);
    const r = dispersionStats(cluster);
    expect(r.variance).toBeGreaterThan(0);
    expect(r.bimodality).toBeLessThan(5 / 9);
  });
});

describe('runHeadless FORAGE_PREF telemetry', () => {
  it('single-channel run pins FORAGE_PREF → zero variance / zero bimodality in the series', () => {
    const r = runHeadless(defaultConfig({ seed: 1, foodChannels: 1 }), 1000, 500);
    expect(r.series.length).toBeGreaterThan(0);
    for (const s of r.series) {
      // FORAGE_PREF is RNG-gated off in single-channel: every creature carries the center → no spread.
      expect(s.foragePrefVar).toBe(0);
      expect(s.foragePrefBimodality).toBe(0);
      if (s.population > 0) expect(s.geneMeans[ScalarGene.FORAGE_PREF]).toBeCloseTo(0.5, 6);
    }
  });

  it('two-channel run lets FORAGE_PREF vary (non-zero variance once selection acts)', () => {
    const r = runHeadless(defaultConfig({ seed: 1, foodChannels: 2 }), 2000, 500);
    const live = r.series.filter((s) => s.population > 1);
    expect(live.length).toBeGreaterThan(0);
    // With the gene un-pinned and seeded with gaussian spread, the population variance is strictly > 0.
    expect(live.some((s) => s.foragePrefVar > 0)).toBe(true);
  });
});
