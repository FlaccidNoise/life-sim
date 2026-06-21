import { describe, it, expect } from 'vitest';
import { Rng } from './rng';
import { defaultConfig } from './config';
import {
  BRAIN_GENES,
  seedGenome,
  mutateGenome,
  ScalarGene,
  SCALAR_GENE_COUNT,
  SCALAR_GENE_SPECS,
  seedScalarGenes,
  mutateScalarGenes,
  geneUpkeep,
} from './genome';

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

describe('scalar genes (evolvable per-creature traits)', () => {
  const cfg = defaultConfig();

  it('seeds founders around each config center with spread', () => {
    const g = new Float32Array(40 * SCALAR_GENE_COUNT);
    const rng = new Rng(1);
    for (let s = 0; s < 40; s++) seedScalarGenes(g, s, rng, cfg);
    const speedOf = (s: number): number => g[s * SCALAR_GENE_COUNT + ScalarGene.MAX_SPEED]!;
    expect(Array.from({ length: 40 }, (_, s) => speedOf(s)).every((v) => v === speedOf(0))).toBe(
      false,
    ); // there is spread
    const mean = Array.from({ length: 40 }, (_, s) => speedOf(s)).reduce((a, b) => a + b, 0) / 40;
    expect(mean).toBeGreaterThan(cfg.maxSpeed - 2);
    expect(mean).toBeLessThan(cfg.maxSpeed + 2); // mean sits near the center
  });

  it('seed + mutation keep every gene within its clamp range', () => {
    const g = new Float32Array(4 * SCALAR_GENE_COUNT);
    const wild = defaultConfig({ founderSigma: 50, mutationSigma: 50 }); // huge → would blow past range
    const rng = new Rng(3);
    for (let t = 0; t < 200; t++) {
      seedScalarGenes(g, 0, rng, wild);
      mutateScalarGenes(g, 1, 0, rng, wild);
      for (let gi = 0; gi < SCALAR_GENE_COUNT; gi++) {
        const spec = SCALAR_GENE_SPECS[gi]!;
        const seeded = g[gi]!;
        const mutated = g[SCALAR_GENE_COUNT + gi]!;
        const eps = 1e-4; // genes are stored Float32 → a clamped bound can round a hair past it
        expect(seeded).toBeGreaterThanOrEqual(spec.min - eps);
        expect(seeded).toBeLessThanOrEqual(spec.max + eps);
        expect(mutated).toBeGreaterThanOrEqual(spec.min - eps);
        expect(mutated).toBeLessThanOrEqual(spec.max + eps);
      }
    }
  });

  it('mutation inherits the parent with small drift', () => {
    const g = new Float32Array(4 * SCALAR_GENE_COUNT);
    g[ScalarGene.MAX_SPEED] = 6;
    g[ScalarGene.EAT_RATE] = 2;
    mutateScalarGenes(g, 1, 0, new Rng(2), cfg);
    const childSpeed = g[SCALAR_GENE_COUNT + ScalarGene.MAX_SPEED]!;
    expect(Math.abs(childSpeed - 6)).toBeLessThan(3); // near the parent
    expect(Math.abs(childSpeed - 6)).toBeGreaterThan(0); // but mutated
  });

  it('geneUpkeep charges only for costed genes ABOVE their center; metab-eff is exempt', () => {
    const g = new Float32Array(4 * SCALAR_GENE_COUNT);
    for (let gi = 0; gi < SCALAR_GENE_COUNT; gi++) g[gi] = cfg[SCALAR_GENE_SPECS[gi]!.centerKey];
    expect(geneUpkeep(g, 0, cfg)).toBeCloseTo(0); // all at center → no cost
    g[ScalarGene.MAX_SPEED] = cfg.maxSpeed - 2; // below center → still free
    expect(geneUpkeep(g, 0, cfg)).toBeCloseTo(0);
    g[ScalarGene.MAX_SPEED] = cfg.maxSpeed + 3;
    g[ScalarGene.EAT_RATE] = cfg.eatRate + 2;
    g[ScalarGene.METAB_EFF] = cfg.metabolicEfficiency + 0.4; // exempt — must NOT add upkeep
    expect(geneUpkeep(g, 0, cfg)).toBeCloseTo(3 * cfg.maxSpeedCost + 2 * cfg.eatRateCost);
  });
});
