import { describe, it, expect } from 'vitest';
import { Rng } from './rng';
import { BRAIN_GENES, seedGenome, mutateGenome } from './genome';

describe('genome', () => {
  it('seedGenome spreads founder brains around the seed (initial variation)', () => {
    const brain = new Float32Array(10 * BRAIN_GENES);
    const hue = new Float32Array(10);
    const rng = new Rng(1);
    for (let s = 0; s < 10; s++) seedGenome(brain, hue, s, rng, 0.3);
    // founders differ from one another (not all identical)
    const firstGene = (s: number): number => brain[s * BRAIN_GENES]!;
    const allSame = Array.from({ length: 10 }, (_, s) => firstGene(s)).every(
      (v) => v === firstGene(0),
    );
    expect(allSame).toBe(false);
    // hues populated in [0,1)
    for (let s = 0; s < 10; s++) {
      expect(hue[s]!).toBeGreaterThanOrEqual(0);
      expect(hue[s]!).toBeLessThan(1);
    }
  });

  it('mutateGenome copies the parent with small drift (heredity + variation)', () => {
    const brain = new Float32Array(4 * BRAIN_GENES);
    const hue = new Float32Array(4);
    const rng = new Rng(2);
    // parent (slot 0) with known weights
    for (let g = 0; g < BRAIN_GENES; g++) brain[g] = g + 1;
    hue[0] = 0.5;
    mutateGenome(brain, hue, 1, 0, rng, 0.05, 0.02); // child = slot 1
    for (let g = 0; g < BRAIN_GENES; g++) {
      const diff = Math.abs(brain[BRAIN_GENES + g]! - brain[g]!);
      expect(diff).toBeLessThan(0.5); // close to parent (small σ)
      expect(diff).toBeGreaterThan(0); // but mutated (not identical)
    }
    expect(hue[1]!).toBeGreaterThanOrEqual(0);
    expect(hue[1]!).toBeLessThan(1);
    expect(Math.abs(hue[1]! - 0.5)).toBeLessThan(0.2); // inherited near the parent's hue
  });

  it('hue mutation wraps into [0,1)', () => {
    const brain = new Float32Array(4 * BRAIN_GENES);
    const hue = new Float32Array(4);
    hue[0] = 0.99;
    // large hue σ so it likely crosses the 1.0 boundary; result must still be in range
    for (let t = 0; t < 50; t++) {
      mutateGenome(brain, hue, 1, 0, new Rng(t), 0.05, 0.5);
      expect(hue[1]!).toBeGreaterThanOrEqual(0);
      expect(hue[1]!).toBeLessThan(1);
    }
  });
});
