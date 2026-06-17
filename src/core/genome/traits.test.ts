import { describe, it, expect } from 'vitest';
import { genomeTraits, genomeSignature } from './traits';
import { buildForagerGenome, buildAutotrophGenome } from './critter-genome';
import { mutateGenome } from './mutate';
import { GenomeStore } from './genome';
import { Rng } from '../math/rng';

describe('genomeTraits', () => {
  it('counts genes by type, rules, and means for the forager', () => {
    const t = genomeTraits(buildForagerGenome(6, 100));
    // forager genes: MOVER, SENSOR, SENSOR, NEURON, NEURON, DIGESTIVE
    expect(t.geneCount).toBe(6);
    expect(t.photoGenes).toBe(0);
    expect(t.digestiveGenes).toBe(1);
    expect(t.sensorGenes).toBe(2);
    expect(t.neuronGenes).toBe(2);
    expect(t.moverGenes).toBe(1);
    expect(t.connectionCount).toBe(2);
    expect(t.motorCount).toBe(1);
    expect(t.divisionRuleCount).toBe(5);
    expect(t.meanMass).toBeCloseTo(2, 6); // all genes mass 2
    expect(t.meanInitialEnergy).toBeCloseTo(100, 6);
    expect(t.meanAbsWeight).toBeCloseTo(1.5, 6); // both connection weights 1.5
    expect(t.generation).toBe(0);
  });

  it('reports zero means for an empty-gene edge case without dividing by zero', () => {
    const empty = { ...buildForagerGenome(6, 100), genes: [], connectionRules: [] };
    const t = genomeTraits(empty);
    expect(t.geneCount).toBe(0);
    expect(t.meanMass).toBe(0);
    expect(t.meanInitialEnergy).toBe(0);
    expect(t.meanAbsWeight).toBe(0);
  });
});

describe('genomeSignature', () => {
  it('is stable under a weight-only mutation (continuous params do not change the bucket)', () => {
    const store = new GenomeStore();
    const parent = buildForagerGenome(6, 100);
    const sig = genomeSignature(parent);
    const child = mutateGenome(
      parent,
      new Rng(7),
      {
        paramSigma: 0,
        paramRate: 0,
        weightSigma: 0.3,
        weightRate: 1,
        addGeneRate: 0,
        deleteGeneRate: 0,
        duplicateGeneRate: 0,
        rewireRate: 0,
        changeTypeRate: 0,
        duplicateSubgraphRate: 0,
      },
      store,
    );
    expect(genomeSignature(child)).toBe(sig); // same morphology → same signature
  });

  it('differs between distinct morphologies', () => {
    expect(genomeSignature(buildForagerGenome(6, 100))).not.toBe(
      genomeSignature(buildAutotrophGenome(6)),
    );
  });

  it('matches the documented forager encoding', () => {
    expect(genomeSignature(buildForagerGenome(6, 100))).toBe('0p1d2s2n1m|2c1t');
  });
});
