import { describe, it, expect } from 'vitest';
import { genomeDistance, SPECIES_THRESHOLD } from './distance';
import { buildForagerGenome } from './critter-genome';
import { cloneGenome } from './genome';
import { CellType } from '../cells/types';

describe('genomeDistance', () => {
  it('is zero between a genome and its identical clone', () => {
    const a = buildForagerGenome(6);
    expect(genomeDistance(a, cloneGenome(a))).toBe(0);
  });

  it('grows with a connection-weight difference (behavioral drift)', () => {
    const a = buildForagerGenome(6);
    const b = cloneGenome(a);
    b.connectionRules[0]!.weight += 2.0;
    const d = genomeDistance(a, b);
    expect(d).toBeGreaterThan(0);
    // small weight drift alone stays within the same species
    expect(d).toBeLessThan(SPECIES_THRESHOLD);
  });

  it('is sensitive to a changeType morph (per-type composition differs)', () => {
    const a = buildForagerGenome(6);
    const b = cloneGenome(a);
    // flip a DIGESTIVE gene to PHOTO — a structural/morphological change
    const dig = b.genes.findIndex((g) => g.cellType === CellType.DIGESTIVE);
    b.genes[dig]!.cellType = CellType.PHOTO;
    expect(genomeDistance(a, b)).toBeGreaterThan(genomeDistance(a, cloneGenome(a)));
  });

  it('is symmetric', () => {
    const a = buildForagerGenome(6);
    const b = cloneGenome(a);
    b.connectionRules[1]!.weight -= 0.7;
    expect(genomeDistance(a, b)).toBeCloseTo(genomeDistance(b, a), 12);
  });
});
