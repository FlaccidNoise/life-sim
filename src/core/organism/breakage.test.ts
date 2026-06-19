import { describe, it, expect } from 'vitest';
import { BondNetwork } from './bonds';
import { OrganismTable } from './organisms';
import { SplitChecker } from './split';
import { breakStrainedBonds } from './breakage';
import { CellStore } from '../memory/cell-store';
import { CellType } from '../cells/types';

function setup(): {
  store: CellStore;
  bonds: BondNetwork;
  organisms: OrganismTable;
  splitter: SplitChecker;
} {
  return {
    store: new CellStore(16, false),
    bonds: new BondNetwork(16, 32, 4),
    organisms: new OrganismTable(16),
    splitter: new SplitChecker(16),
  };
}

describe('breakStrainedBonds', () => {
  it('breaks an over-stretched bond and splits the organism', () => {
    const { store, bonds, organisms, splitter } = setup();
    const f = store.fields;
    const org = organisms.alloc();
    const a = store.alloc();
    const b = store.alloc();
    f.cellType[a] = CellType.PHOTO;
    f.cellType[b] = CellType.PHOTO;
    f.organismId[a] = org;
    f.organismId[b] = org;
    f.posX[a] = 100;
    f.posY[a] = 100;
    f.posX[b] = 120; // dist 20, restLen 10 → strain 1.0 > 0.6
    f.posY[b] = 100;
    bonds.addBond(a, f.generation[a]!, b, f.generation[b]!, 10, 1);
    bonds.rebuildLive(store);

    const broke = breakStrainedBonds(
      bonds,
      f.organismId,
      organisms,
      splitter,
      f.posX,
      f.posY,
      f.cellType,
      0.6,
      64,
      1024,
      1024,
      false,
    );
    expect(broke).toBe(1);
    expect(bonds.isAlive(0)).toBe(false);
    expect(f.organismId[a]).not.toBe(f.organismId[b]); // split into two organisms
  });

  it('does NOT break a bond within strain tolerance', () => {
    const { store, bonds, organisms, splitter } = setup();
    const f = store.fields;
    const org = organisms.alloc();
    const a = store.alloc();
    const b = store.alloc();
    f.organismId[a] = org;
    f.organismId[b] = org;
    f.posX[a] = 100;
    f.posX[b] = 114; // dist 14, restLen 10 → strain 0.4 < 0.6
    f.posY[a] = 100;
    f.posY[b] = 100;
    bonds.addBond(a, f.generation[a]!, b, f.generation[b]!, 10, 1);
    bonds.rebuildLive(store);
    const broke = breakStrainedBonds(
      bonds,
      f.organismId,
      organisms,
      splitter,
      f.posX,
      f.posY,
      f.cellType,
      0.6,
      64,
      1024,
      1024,
      false,
    );
    expect(broke).toBe(0);
    expect(bonds.isAlive(0)).toBe(true);
  });

  it('honours the per-tick split-check cap', () => {
    const { store, bonds, organisms, splitter } = setup();
    const f = store.fields;
    // Three independent over-stretched 2-cell organisms.
    for (let p = 0; p < 3; p++) {
      const org = organisms.alloc();
      const a = store.alloc();
      const b = store.alloc();
      f.organismId[a] = org;
      f.organismId[b] = org;
      f.posX[a] = 100 + p * 200;
      f.posX[b] = 130 + p * 200; // dist 30, restLen 10 → strain 2.0
      f.posY[a] = 100;
      f.posY[b] = 100;
      bonds.addBond(a, f.generation[a]!, b, f.generation[b]!, 10, 1);
    }
    bonds.rebuildLive(store);
    const broke = breakStrainedBonds(
      bonds,
      f.organismId,
      organisms,
      splitter,
      f.posX,
      f.posY,
      f.cellType,
      0.6,
      2,
      1024,
      1024,
      false,
    );
    expect(broke).toBe(2); // capped at 2 this tick; the third persists for next tick
  });
});
