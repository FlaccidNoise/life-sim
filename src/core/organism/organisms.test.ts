import { describe, it, expect } from 'vitest';
import { OrganismTable, aggregateOrganisms } from './organisms';

describe('OrganismTable', () => {
  it('allocates ascending ids from 1 (0 reserved), recycles on free', () => {
    const t = new OrganismTable(8);
    expect(t.alloc()).toBe(1);
    expect(t.alloc()).toBe(2);
    const c = t.alloc();
    expect(c).toBe(3);
    t.free(c);
    expect(t.alloc()).toBe(3); // recycled
    expect(t.mover[1]).toBe(-1); // mover defaults to -1
  });

  it('returns -1 when the id pool is exhausted (refuse-new)', () => {
    const t = new OrganismTable(3); // ids 1, 2 only
    expect(t.alloc()).toBe(1);
    expect(t.alloc()).toBe(2);
    expect(t.alloc()).toBe(-1);
  });
});

describe('aggregateOrganisms — per-tick recompute', () => {
  it('sums energy/count and means the centroid per organism, skipping free cells (org 0)', () => {
    const t = new OrganismTable(8);
    const o1 = t.alloc(); // 1
    const o2 = t.alloc(); // 2
    // 5 cells: three in o1, one in o2, one free (org 0 — must be ignored).
    const organismId = Uint32Array.from([o1, o1, o1, o2, 0]);
    const energy = Float32Array.from([10, 20, 30, 100, 999]);
    const posX = Float64Array.from([0, 10, 20, 500, 0]);
    const posY = Float64Array.from([0, 0, 0, 500, 0]);
    const live = Uint32Array.from([0, 1, 2, 3, 4]);
    aggregateOrganisms(live, 5, organismId, energy, posX, posY, t);
    expect(t.energy[o1]).toBeCloseTo(60, 4);
    expect(t.cellCount[o1]).toBe(3);
    expect(t.centroidX[o1]).toBeCloseTo(10, 4); // mean of 0,10,20
    expect(t.energy[o2]).toBeCloseTo(100, 4);
    expect(t.cellCount[o2]).toBe(1);
    expect(t.centroidX[o2]).toBeCloseTo(500, 4);
  });

  it('zeroes organisms with no live cells (recompute, not accumulate)', () => {
    const t = new OrganismTable(8);
    const o1 = t.alloc();
    aggregateOrganisms(
      Uint32Array.from([0]),
      1,
      Uint32Array.from([o1]),
      Float32Array.from([42]),
      Float64Array.from([0]),
      Float64Array.from([0]),
      t,
    );
    expect(t.energy[o1]).toBeCloseTo(42, 4);
    // next tick: that cell is gone (no live cells in o1) → aggregate must reset to 0.
    aggregateOrganisms(
      new Uint32Array(0),
      0,
      new Uint32Array(0),
      new Float32Array(0),
      new Float64Array(0),
      new Float64Array(0),
      t,
    );
    expect(t.energy[o1]).toBe(0);
    expect(t.cellCount[o1]).toBe(0);
  });
});

describe('OrganismTable — highWaterMark', () => {
  // Mirrors cell-store.test.ts highWaterMark test structure.
  // highWaterMark is (highest live organism id + 1), or 0 when empty.
  it('is 0 for an empty table', () => {
    const t = new OrganismTable(8);
    expect(t.highWaterMark).toBe(0);
  });

  it('equals the count after a run of ascending allocations (plus 1 for id=0 sentinel)', () => {
    const t = new OrganismTable(8);
    t.alloc(); // 1
    t.alloc(); // 2
    t.alloc(); // 3
    expect(t.highWaterMark).toBe(4); // max id + 1
  });

  it('is unchanged when a non-top slot is freed', () => {
    const t = new OrganismTable(8);
    t.alloc(); // 1
    t.alloc(); // 2
    t.alloc(); // 3
    t.free(2); // not the top slot (3 is still live)
    expect(t.highWaterMark).toBe(4);
  });

  it('shrinks past trailing dead slots when the top slot is freed', () => {
    const t = new OrganismTable(8);
    t.alloc(); // 1
    t.alloc(); // 2
    t.alloc(); // 3
    t.free(2); // dead, but interior
    t.free(3); // top → hwm must walk down past slot 2 (dead) to slot 1 (alive)
    expect(t.highWaterMark).toBe(2); // id 1 is alive, so hwm = 1 + 1 = 2
  });

  it('returns to 0 when every organism is freed', () => {
    const t = new OrganismTable(8);
    t.alloc();
    t.alloc();
    t.free(2);
    t.free(1);
    expect(t.highWaterMark).toBe(0);
  });

  it('always bounds the live set: every alive organism is below highWaterMark', () => {
    const t = new OrganismTable(16);
    t.alloc(); // 1
    t.alloc(); // 2
    t.alloc(); // 3
    t.alloc(); // 4
    t.alloc(); // 5
    t.free(2);
    t.free(4);
    t.alloc(); // reuses id 4 (LIFO free-list)
    for (let id = 1; id < 16; id++) {
      if (t.isAlive(id)) expect(id).toBeLessThan(t.highWaterMark);
    }
    expect(t.isAlive(t.highWaterMark - 1)).toBe(true);
  });
});

describe('OrganismTable — lineage fields', () => {
  it('alloc resets genomeRef/birthTick to -1 and reachedAdulthood to 0', () => {
    const t = new OrganismTable(8);
    const o = t.alloc();
    expect(t.genomeRef[o]).toBe(-1);
    expect(t.birthTick[o]).toBe(-1);
    expect(t.reachedAdulthood[o]).toBe(0);
    t.genomeRef[o] = 5;
    t.reachedAdulthood[o] = 1;
    t.free(o);
    const o2 = t.alloc(); // recycles the id
    expect(o2).toBe(o);
    expect(t.genomeRef[o2]).toBe(-1); // reset on alloc
    expect(t.reachedAdulthood[o2]).toBe(0);
  });
});
