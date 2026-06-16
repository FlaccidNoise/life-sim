import { describe, it, expect } from 'vitest';
import { BondNetwork } from './bonds';
import { computeDigestBonus } from './digest-bonus';
import { CellStore } from '../memory/cell-store';
import { CellType } from '../cells/types';

describe('computeDigestBonus', () => {
  it('counts bonded DIGESTIVE neighbours per cell; ignores non-digestive bonds', () => {
    const store = new CellStore(16, false);
    const f = store.fields;
    const bonds = new BondNetwork(16, 32, 8);
    // Cluster: d0-d1-d2 all DIGESTIVE (chain) + d0-p (a PHOTO) bond.
    const d0 = store.alloc();
    const d1 = store.alloc();
    const d2 = store.alloc();
    const p = store.alloc();
    f.cellType[d0] = CellType.DIGESTIVE;
    f.cellType[d1] = CellType.DIGESTIVE;
    f.cellType[d2] = CellType.DIGESTIVE;
    f.cellType[p] = CellType.PHOTO;
    bonds.addBond(d0, f.generation[d0]!, d1, f.generation[d1]!, 10, 1);
    bonds.addBond(d1, f.generation[d1]!, d2, f.generation[d2]!, 10, 1);
    bonds.addBond(d0, f.generation[d0]!, p, f.generation[p]!, 10, 1);
    bonds.rebuildLive(store);

    const digestBonus = new Uint8Array(16);
    computeDigestBonus(bonds, f.cellType, digestBonus);
    expect(digestBonus[d0]).toBe(1); // bonded to d1 (DIGESTIVE); the p bond doesn't count
    expect(digestBonus[d1]).toBe(2); // bonded to d0 and d2
    expect(digestBonus[d2]).toBe(1);
    expect(digestBonus[p]).toBe(0); // PHOTO endpoint gets no digestive credit
  });

  it('resets to zero each call (recompute, not accumulate)', () => {
    const store = new CellStore(8, false);
    const f = store.fields;
    const bonds = new BondNetwork(8, 16, 8);
    const a = store.alloc();
    const b = store.alloc();
    f.cellType[a] = CellType.DIGESTIVE;
    f.cellType[b] = CellType.DIGESTIVE;
    const s = bonds.addBond(a, f.generation[a]!, b, f.generation[b]!, 10, 1);
    bonds.rebuildLive(store);
    const digestBonus = new Uint8Array(8);
    computeDigestBonus(bonds, f.cellType, digestBonus);
    expect(digestBonus[a]).toBe(1);
    bonds.removeBond(s);
    bonds.rebuildLive(store);
    computeDigestBonus(bonds, f.cellType, digestBonus);
    expect(digestBonus[a]).toBe(0); // bond gone → reset
  });
});
