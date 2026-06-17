import { describe, it, expect } from 'vitest';
import { BondNetwork } from './bonds';
import { CellStore } from '../memory/cell-store';
import { CellType } from '../cells/types';

describe('BondNetwork', () => {
  it('pre-allocates the pool + adjacency, zero-init', () => {
    const b = new BondNetwork(8, 16, 4);
    expect(b.cellA.length).toBe(16);
    expect(b.stiffness.length).toBe(16);
    expect(b.adj.length).toBe(8 * 4);
    expect(b.degree.length).toBe(8);
    expect(b.degree[0]).toBe(0);
    expect(b.liveBondCount).toBe(0);
  });

  it('addBond stores endpoints + generation in separate arrays (not bit-packed) and links adjacency', () => {
    const b = new BondNetwork(8, 16, 4);
    const s = b.addBond(2, 5, 3, 9, 12, 1);
    expect(s).toBe(0);
    expect(b.cellA[s]).toBe(2);
    expect(b.genA[s]).toBe(5);
    expect(b.cellB[s]).toBe(3);
    expect(b.genB[s]).toBe(9);
    expect(b.restLen[s]).toBeCloseTo(12, 5);
    expect(b.stiffness[s]).toBeCloseTo(1, 6);
    expect(b.degree[2]).toBe(1);
    expect(b.degree[3]).toBe(1);
    expect(b.adj[2 * 4 + 0]).toBe(s);
    expect(b.adj[3 * 4 + 0]).toBe(s);
    expect(b.isAlive(s)).toBe(true);
  });

  it('refuses (returns -1) at the degree cap and at pool capacity', () => {
    const b = new BondNetwork(8, 16, 2); // degree cap 2
    expect(b.addBond(0, 0, 1, 0, 1, 1)).toBe(0);
    expect(b.addBond(0, 0, 2, 0, 1, 1)).toBe(1); // cell 0 now at degree 2
    expect(b.addBond(0, 0, 3, 0, 1, 1)).toBe(-1); // cell 0 over the degree cap → refuse
    const small = new BondNetwork(8, 2, 8); // pool cap 2
    expect(small.addBond(0, 0, 1, 0, 1, 1)).toBe(0);
    expect(small.addBond(2, 0, 3, 0, 1, 1)).toBe(1);
    expect(small.addBond(4, 0, 5, 0, 1, 1)).toBe(-1); // pool full → refuse
  });

  it('removeBond swap-removes from both endpoints (O(degree)) and frees the slot', () => {
    const b = new BondNetwork(8, 16, 4);
    const s0 = b.addBond(1, 0, 2, 0, 1, 1);
    const s1 = b.addBond(1, 0, 3, 0, 1, 1);
    const s2 = b.addBond(1, 0, 4, 0, 1, 1);
    expect(b.degree[1]).toBe(3);
    b.removeBond(s1); // remove the middle bond of cell 1
    expect(b.isAlive(s1)).toBe(false);
    expect(b.degree[1]).toBe(2); // 1's adjacency shrank
    expect(b.degree[3]).toBe(0); // 3's only bond gone
    // s1's slot is recycled by the next addBond (free-list).
    const s3 = b.addBond(5, 0, 6, 0, 1, 1);
    expect(s3).toBe(s1);
    // cell 1 still bonds 2 and 4 (order may swap — assert as a set).
    const off = 1 * 4;
    const neighbours = [b.adj[off]!, b.adj[off + 1]!].map((bs) =>
      b.cellA[bs] === 1 ? b.cellB[bs] : b.cellA[bs],
    );
    expect(new Set(neighbours)).toEqual(new Set([2, 4]));
    expect(s0).toBe(0);
    expect(s2).toBe(2);
  });

  it('rebuildLive collects alive + gen-valid bonds (ascending) and prunes dangling endpoints', () => {
    const store = new CellStore(8, false);
    const f = store.fields;
    const a = store.alloc();
    const c = store.alloc();
    const d = store.alloc();
    f.cellType[a] = CellType.PHOTO;
    f.cellType[c] = CellType.PHOTO;
    f.cellType[d] = CellType.PHOTO;

    const b = new BondNetwork(8, 16, 4);
    const sGood = b.addBond(a, f.generation[a]!, c, f.generation[c]!, 1, 1);
    const sBad = b.addBond(c, f.generation[c]!, d, f.generation[d]!, 1, 1);
    store.free(d); // bumps generation[d] → sBad now dangles

    b.rebuildLive(store);
    expect(b.liveBondCount).toBe(1);
    expect(b.liveBonds[0]).toBe(sGood);
    expect(sBad).toBe(1);
  });
});

describe('BondNetwork — freeCount', () => {
  it('reports remaining pool slots (decrements on add, restores on remove)', () => {
    const b = new BondNetwork(8, 4, 4);
    expect(b.freeCount).toBe(4);
    const s = b.addBond(0, 0, 1, 0, 1, 1);
    expect(b.freeCount).toBe(3);
    b.removeBond(s);
    expect(b.freeCount).toBe(4);
  });
});
