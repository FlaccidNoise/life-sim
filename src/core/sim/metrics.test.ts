import { describe, it, expect } from 'vitest';
import { makeMetrics, sampleMetrics } from './metrics';
import { CellType } from '../cells/types';
import { CellStore } from '../memory/cell-store';

function seed(types: number[], energies: number[]): { store: CellStore; live: Uint32Array } {
  const store = new CellStore(types.length + 4, false);
  const f = store.fields;
  const live = new Uint32Array(types.length);
  for (let k = 0; k < types.length; k++) {
    const i = store.alloc();
    f.cellType[i] = types[k]!;
    f.energy[i] = energies[k]!;
    live[k] = i;
  }
  return { store, live };
}

describe('telemetry metrics', () => {
  it('counts population per type and mean energy over LIVING cells', () => {
    const { store, live } = seed(
      [CellType.PHOTO, CellType.PHOTO, CellType.DIGESTIVE, CellType.MEAT],
      [100, 200, 60, 999],
    );
    const m = makeMetrics();
    sampleMetrics(m, live, 4, store.fields, 7, 3, 1);
    expect(m.tick).toBe(7);
    expect(m.population).toBe(4);
    expect(m.photo).toBe(2);
    expect(m.digestive).toBe(1);
    expect(m.meat).toBe(1);
    expect(m.meanEnergy).toBeCloseTo((100 + 200 + 60) / 3, 4); // meat excluded
    expect(m.births).toBe(3);
    expect(m.deaths).toBe(1);
  });

  it('phenotypic diversity is Simpson 1-Σpᵢ² over living types', () => {
    const m = makeMetrics();
    {
      const { store, live } = seed([CellType.PHOTO, CellType.PHOTO], [10, 10]);
      sampleMetrics(m, live, 2, store.fields, 0, 0, 0);
      expect(m.diversity).toBeCloseTo(0, 5); // all one living type → 0
    }
    {
      const { store, live } = seed([CellType.PHOTO, CellType.DIGESTIVE], [10, 10]);
      sampleMetrics(m, live, 2, store.fields, 0, 0, 0);
      expect(m.diversity).toBeCloseTo(0.5, 5); // even split → 1-(0.25+0.25)
    }
  });
});
