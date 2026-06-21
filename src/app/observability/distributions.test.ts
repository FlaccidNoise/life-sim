import { describe, it, expect } from 'vitest';
import { OrganismStore } from '../../core/store';
import { ScalarGene, SCALAR_GENE_COUNT } from '../../core/genome';
import { histogram } from './distributions';

/** A store with `n` live creatures whose diet gene is set by `diets`. */
function storeWithDiets(diets: number[]): OrganismStore {
  const s = new OrganismStore(Math.max(8, diets.length));
  for (const d of diets) {
    const i = s.alloc();
    s.scalarGenes[i * SCALAR_GENE_COUNT + ScalarGene.DIET] = d;
  }
  s.rebuildLive();
  return s;
}

describe('histogram', () => {
  it('buckets values into equal bins over [min,max]', () => {
    const s = storeWithDiets([0.05, 0.05, 0.95]);
    const h = histogram(
      s,
      (i) => s.scalarGenes[i * SCALAR_GENE_COUNT + ScalarGene.DIET]!,
      0,
      1,
      10,
    );
    expect(h[0]).toBe(2); // two grazers in the first bin
    expect(h[9]).toBe(1); // one hunter in the last bin
    expect(h.reduce((a, b) => a + b, 0)).toBe(3); // all accounted for
  });

  it('reveals a bimodal split a mean would hide', () => {
    const s = storeWithDiets([0, 0, 0, 0.9, 0.9]); // mean 0.36 — describes nobody
    const h = histogram(
      s,
      (i) => s.scalarGenes[i * SCALAR_GENE_COUNT + ScalarGene.DIET]!,
      0,
      1,
      10,
    );
    expect(h[0]).toBe(3); // the three grazers
    expect(h[8]! + h[9]!).toBe(2); // the two hunters land in the top bins (Float32 ≈0.9 → bin 8)
    // The mean bin (≈0.36 → bin 3) is empty: the population is bimodal, not central.
    expect(h[3]).toBe(0);
  });

  it('clamps out-of-range values into the end bins', () => {
    const s = storeWithDiets([-5, 100]);
    const h = histogram(s, (i) => s.scalarGenes[i * SCALAR_GENE_COUNT + ScalarGene.DIET]!, 0, 1, 8);
    expect(h[0]).toBe(1); // −5 clamps into bin 0
    expect(h[7]).toBe(1); // 100 clamps into the last bin
  });

  it('returns all-zero bins for an empty population', () => {
    const s = new OrganismStore(8);
    s.rebuildLive();
    const h = histogram(s, () => 0, 0, 1, 5);
    expect(h).toEqual([0, 0, 0, 0, 0]);
  });
});
