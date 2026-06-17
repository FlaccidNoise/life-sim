import { describe, it, expect } from 'vitest';
import { gaussian, mutateGenome, type MutationRates } from './mutate';
import { type Genome, GenomeStore } from './genome';
import { Rng } from '../math/rng';
import { CellType } from '../cells/types';

const NO_MUT: MutationRates = {
  paramSigma: 0.1,
  paramRate: 0,
  weightSigma: 0.1,
  weightRate: 0,
  addGeneRate: 0,
  deleteGeneRate: 0,
  duplicateGeneRate: 0,
  rewireRate: 0,
  changeTypeRate: 0,
  duplicateSubgraphRate: 0,
};

function demoGenome(): Genome {
  const g = (cellType: number, over = {}) => ({
    innovation: 0,
    cellType,
    radius: 6,
    mass: 2,
    initialEnergy: 100,
    bias: 0,
    sensorChannel: -1,
    ...over,
  });
  return {
    seedGene: 0,
    genes: [g(CellType.MOVER), g(CellType.NEURON, { bias: 0.5 })],
    divisionRules: [{ parentGene: 0, childGene: 1, angle: 0, dist: 20, stiffness: 1, repeat: 1 }],
    bondRules: [],
    connectionRules: [{ preGene: 1, postGene: 1, weight: 1.0 }],
    motorRules: [],
    parentRef: -1,
    generation: 0,
  };
}

describe('gaussian', () => {
  it('is deterministic from a seeded Rng', () => {
    expect(gaussian(new Rng(7))).toBeCloseTo(gaussian(new Rng(7)), 12);
  });
  it('has ~zero mean over many draws', () => {
    const rng = new Rng(123);
    let s = 0;
    for (let i = 0; i < 5000; i++) s += gaussian(rng);
    expect(Math.abs(s / 5000)).toBeLessThan(0.1);
  });
});

describe('mutateGenome — param + weight perturbation', () => {
  it('with all rates 0 returns an exact clone (M6 clone-only default)', () => {
    const p = demoGenome();
    expect(mutateGenome(p, new Rng(1), NO_MUT, new GenomeStore())).toEqual(p);
  });

  it('perturbs gene params when paramRate fires (and never touches the parent)', () => {
    const p = demoGenome();
    const rates = { ...NO_MUT, paramRate: 1, paramSigma: 2 };
    const c = mutateGenome(p, new Rng(5), rates, new GenomeStore());
    const changed = c.genes.some(
      (g, i) =>
        g.mass !== p.genes[i]!.mass ||
        g.bias !== p.genes[i]!.bias ||
        g.radius !== p.genes[i]!.radius,
    );
    expect(changed).toBe(true);
    expect(p.genes[1]!.bias).toBe(0.5); // parent untouched
    expect(c.genes.every((g) => g.mass >= 0.1 && g.radius >= 0.5 && g.initialEnergy >= 0)).toBe(
      true,
    );
  });

  it('perturbs connection weights when weightRate fires', () => {
    const p = demoGenome();
    const c = mutateGenome(
      p,
      new Rng(9),
      { ...NO_MUT, weightRate: 1, weightSigma: 1 },
      new GenomeStore(),
    );
    expect(c.connectionRules[0]!.weight).not.toBe(1.0);
  });

  it('is deterministic — same (parent, seed, rates) → identical child', () => {
    const p = demoGenome();
    const rates = { ...NO_MUT, paramRate: 1, weightRate: 1 };
    expect(mutateGenome(p, new Rng(42), rates, new GenomeStore())).toEqual(
      mutateGenome(p, new Rng(42), rates, new GenomeStore()),
    );
  });
});

describe('mutateGenome — structural operators (add/duplicate/rewire/changeType)', () => {
  const store = () => new GenomeStore();

  it('addGene appends a gene with a FRESH innovation id and a division rule that expresses it', () => {
    const p = demoGenome();
    const s = store();
    const c = mutateGenome(p, new Rng(3), { ...NO_MUT, addGeneRate: 1 }, s);
    expect(c.genes.length).toBe(p.genes.length + 1);
    const added = c.genes[c.genes.length - 1]!;
    expect(added.innovation).toBeGreaterThanOrEqual(0);
    // The new gene is reachable from a division rule (it actually develops).
    expect(c.divisionRules.some((r) => r.childGene === c.genes.length - 1)).toBe(true);
  });

  it('duplicateGene copies an existing gene with a distinct fresh innovation id', () => {
    const p = demoGenome();
    const s = store();
    s.nextInnovationId(); // burn id 0 so the duplicate's fresh id (≥1) differs from the parent's innovation:0 genes
    const c = mutateGenome(p, new Rng(4), { ...NO_MUT, duplicateGeneRate: 1 }, s);
    expect(c.genes.length).toBe(p.genes.length + 1);
    const dup = c.genes[c.genes.length - 1]!;
    const src = c.genes.find((g) => g.cellType === dup.cellType && g !== dup)!;
    expect(dup.cellType).toBe(src.cellType);
    expect(dup.innovation).not.toBe(src.innovation); // fresh id (homology)
  });

  it('changeType changes a gene cell type to a different palette value', () => {
    const p = demoGenome();
    const c = mutateGenome(p, new Rng(8), { ...NO_MUT, changeTypeRate: 1 }, store());
    const changed = c.genes.some((g, i) => g.cellType !== p.genes[i]!.cellType);
    expect(changed).toBe(true);
  });

  it('rewire retargets a division rule to a different child gene', () => {
    const p = demoGenome();
    // give it 3 genes so a rewire has somewhere to point.
    p.genes.push({
      innovation: 0,
      cellType: CellType.PHOTO,
      radius: 6,
      mass: 2,
      initialEnergy: 100,
      bias: 0,
      sensorChannel: -1,
    });
    const c = mutateGenome(p, new Rng(2), { ...NO_MUT, rewireRate: 1 }, store());
    const rewired = c.divisionRules.some((r, i) => r.childGene !== p.divisionRules[i]!.childGene);
    expect(rewired).toBe(true);
  });

  it('still produces a clone when all rates are 0 (store unused)', () => {
    const p = demoGenome();
    expect(mutateGenome(p, new Rng(1), NO_MUT, store())).toEqual(p);
  });
});
