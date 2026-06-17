import { describe, it, expect } from 'vitest';
import { BondNetwork } from './bonds';
import { OrganismTable, aggregateOrganisms } from './organisms';
import { SplitChecker } from './split';
import { CellStore } from '../memory/cell-store';
import { CellType } from '../cells/types';

/** Build a bonded chain c0-c1-…-c(k-1) in one organism with the given energies. */
function chain(
  store: CellStore,
  bonds: BondNetwork,
  organisms: OrganismTable,
  energies: number[],
): { org: number; cells: number[] } {
  const f = store.fields;
  const org = organisms.alloc();
  const cells: number[] = [];
  for (let i = 0; i < energies.length; i++) {
    const c = store.alloc();
    f.cellType[c] = CellType.PHOTO; // non-neural — splits don't touch the global net
    f.organismId[c] = org;
    f.energy[c] = energies[i]!;
    f.posX[c] = 100 + i * 10;
    f.posY[c] = 100;
    cells.push(c);
  }
  for (let i = 0; i + 1 < cells.length; i++) {
    bonds.addBond(
      cells[i]!,
      f.generation[cells[i]!]!,
      cells[i + 1]!,
      f.generation[cells[i + 1]!]!,
      10,
      1,
    );
  }
  bonds.rebuildLive(store);
  return { org, cells };
}

describe('SplitChecker — split-on-break (§4.8)', () => {
  it('chain → break the middle → two organisms with correctly partitioned energy/count', () => {
    const store = new CellStore(16, false);
    const bonds = new BondNetwork(16, 32, 4);
    const organisms = new OrganismTable(16);
    const splitter = new SplitChecker(16);
    const { org, cells } = chain(store, bonds, organisms, [10, 20, 30, 40]); // c0-c1-c2-c3
    const f = store.fields;

    // The middle bond is c1-c2 (bond slot 1). Remove it, then check connectivity from its endpoints.
    bonds.removeBond(1);
    const newOrg = splitter.check(bonds, f.organismId, organisms, cells[1]!, cells[2]!);
    expect(newOrg).toBeGreaterThan(0);
    expect(newOrg).not.toBe(org);

    // Two organisms: {c0,c1} on one id, {c2,c3} on the other (which id is which is deterministic
    // but assert by membership, not a fixed id).
    expect(f.organismId[cells[0]!]).toBe(f.organismId[cells[1]!]);
    expect(f.organismId[cells[2]!]).toBe(f.organismId[cells[3]!]);
    expect(f.organismId[cells[0]!]).not.toBe(f.organismId[cells[2]!]);

    // Aggregates partition exactly.
    aggregateOrganisms(
      Uint32Array.from(cells),
      cells.length,
      f.organismId,
      f.energy,
      f.posX,
      f.posY,
      organisms,
    );
    const left = f.organismId[cells[0]!]!;
    const right = f.organismId[cells[2]!]!;
    expect(organisms.cellCount[left]).toBe(2);
    expect(organisms.cellCount[right]).toBe(2);
    expect(organisms.energy[left]).toBeCloseTo(30, 4); // 10 + 20
    expect(organisms.energy[right]).toBeCloseTo(70, 4); // 30 + 40
  });

  it('returns -1 (no split) when a cycle keeps the organism connected', () => {
    const store = new CellStore(16, false);
    const bonds = new BondNetwork(16, 32, 4);
    const organisms = new OrganismTable(16);
    const splitter = new SplitChecker(16);
    const { cells } = chain(store, bonds, organisms, [10, 20, 30]); // c0-c1-c2 (bonds 0,1)
    const f = store.fields;
    // Add a closing bond c0-c2 → triangle.
    bonds.addBond(cells[0]!, f.generation[cells[0]!]!, cells[2]!, f.generation[cells[2]!]!, 10, 1);
    bonds.rebuildLive(store);

    bonds.removeBond(1); // break c1-c2; c2 still reaches c1 via c0.
    const newOrg = splitter.check(bonds, f.organismId, organisms, cells[1]!, cells[2]!);
    expect(newOrg).toBe(-1);
    expect(f.organismId[cells[0]!]).toBe(f.organismId[cells[2]!]); // unchanged
  });

  it('relabels a lone severed cell as its own organism', () => {
    const store = new CellStore(16, false);
    const bonds = new BondNetwork(16, 32, 4);
    const organisms = new OrganismTable(16);
    const splitter = new SplitChecker(16);
    const { cells } = chain(store, bonds, organisms, [10, 20]); // c0-c1 (one bond)
    const f = store.fields;
    bonds.removeBond(0);
    const newOrg = splitter.check(bonds, f.organismId, organisms, cells[0]!, cells[1]!);
    expect(newOrg).toBeGreaterThan(0);
    expect(f.organismId[cells[0]!]).not.toBe(f.organismId[cells[1]!]);
  });

  it('count≥2 BFS relabel + mover migration is byte-identical across two independent runs', () => {
    // The reproducibility harness only ever peels count=1 components, so the count≥2
    // smaller-side/tiebreak relabel + mover-migration path is not otherwise determinism-
    // locked. Build the SAME chain twice and assert byte-identical results.
    function run() {
      const store = new CellStore(16, false);
      const bonds = new BondNetwork(16, 32, 4);
      const organisms = new OrganismTable(16);
      const splitter = new SplitChecker(16);
      // 5-cell chain c0-c1-c2-c3-c4 (bonds 0..3). Break bond 1 (c1-c2) → the {c0,c1}
      // component (2 cells, ≥2) severs and is the smaller/first-closed side → relabelled.
      const { org, cells } = chain(store, bonds, organisms, [10, 20, 30, 40, 50]);
      const f = store.fields;
      organisms.mover[org] = cells[0]!; // mover on the severed (relabelled) side
      bonds.removeBond(1);
      const newOrg = splitter.check(bonds, f.organismId, organisms, cells[1]!, cells[2]!);
      return {
        newOrg,
        ids: Uint32Array.from(cells.map((c) => f.organismId[c]!)),
        mover: Int32Array.from(organisms.mover.subarray(0, 4)),
      };
    }

    const r1 = run();
    const r2 = run();

    // The relabel actually happened and severed a ≥2-cell component.
    expect(r1.newOrg).toBeGreaterThan(0);
    expect(r1.ids[0]).toBe(r1.ids[1]); // {c0,c1} share the fresh id
    expect(r1.ids[2]).toBe(r1.ids[3]);
    expect(r1.ids[3]).toBe(r1.ids[4]); // {c2,c3,c4} share the other id
    expect(r1.ids[0]).not.toBe(r1.ids[2]); // the two components differ

    // Byte-identical relabel + mover migration across the two independent runs.
    expect(r2.newOrg).toBe(r1.newOrg);
    expect(Array.from(r2.ids)).toEqual(Array.from(r1.ids));
    expect(Array.from(r2.mover)).toEqual(Array.from(r1.mover));
  });

  it('migrates organisms.mover to the new id when the mover lands on the severed side', () => {
    const store = new CellStore(16, false);
    const bonds = new BondNetwork(16, 32, 4);
    const organisms = new OrganismTable(16);
    const splitter = new SplitChecker(16);
    const { org, cells } = chain(store, bonds, organisms, [10, 20, 30, 40]);
    const f = store.fields;
    organisms.mover[org] = cells[0]!; // the MOVER is on the c0 end

    bonds.removeBond(1);
    const newOrg = splitter.check(bonds, f.organismId, organisms, cells[1]!, cells[2]!);
    const moverOrg = f.organismId[cells[0]!]!;
    // mover must belong to whichever org now owns c0.
    expect(organisms.mover[moverOrg]).toBe(cells[0]!);
    const otherOrg = moverOrg === org ? newOrg : org;
    expect(organisms.mover[otherOrg]).toBe(-1);
  });
});
