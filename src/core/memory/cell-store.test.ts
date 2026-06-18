import { describe, it, expect } from 'vitest';
import { CellStore } from './cell-store';

describe('CellStore', () => {
  it('allocates ascending slots and tracks aliveCount', () => {
    const s = new CellStore(4, false);
    expect(s.alloc()).toBe(0);
    expect(s.alloc()).toBe(1);
    expect(s.aliveCount).toBe(2);
    expect(s.isAlive(0)).toBe(true);
    expect(s.isAlive(2)).toBe(false);
  });

  it('returns -1 when at capacity', () => {
    const s = new CellStore(2, false);
    s.alloc();
    s.alloc();
    expect(s.alloc()).toBe(-1);
  });

  it('recycles freed slots and bumps the generation', () => {
    const s = new CellStore(4, false);
    const a = s.alloc(); // 0
    const genBefore = s.fields.generation[a]!;
    s.free(a);
    expect(s.isAlive(a)).toBe(false);
    expect(s.fields.generation[a]).toBe((genBefore + 1) >>> 0);
    expect(s.aliveCount).toBe(0);
    expect(s.alloc()).toBe(0); // slot reused
  });

  it('validates a handle against the current generation', () => {
    const s = new CellStore(4, false);
    const i = s.alloc();
    const gen = s.fields.generation[i]!;
    expect(s.validate(i, gen)).toBe(true);
    s.free(i);
    expect(s.validate(i, gen)).toBe(false); // stale: freed (and gen bumped)
  });

  it('exposes fields with their declared element types (Float64 positions)', () => {
    const s = new CellStore(4, false);
    // Guards the `as unknown as CellArrays` cast: positions must stay Float64
    // (precision invariant), and the typed view must match the SoA layout.
    expect(s.fields.posX).toBeInstanceOf(Float64Array);
    expect(s.fields.posY).toBeInstanceOf(Float64Array);
    expect(s.fields.velX).toBeInstanceOf(Float32Array);
    expect(s.fields.cellType).toBeInstanceOf(Uint8Array);
    expect(s.fields.organismId).toBeInstanceOf(Uint32Array);
  });

  it('stores per-slot field values independently', () => {
    const s = new CellStore(4, false);
    const i = s.alloc();
    s.fields.posX[i] = 12.5;
    s.fields.energy[i] = 80;
    s.fields.cellType[i] = 3;
    expect(s.fields.posX[i]).toBe(12.5);
    expect(s.fields.energy[i]).toBe(80);
    expect(s.fields.cellType[i]).toBe(3);
  });
});

describe('CellStore highWaterMark', () => {
  // highWaterMark bounds the live-set scan: it is (highest live slot index + 1), or 0 when empty.
  // All live slots are in [0, highWaterMark), and slot highWaterMark-1 is alive (unless hwm === 0).
  it('is 0 for an empty store', () => {
    const s = new CellStore(8, false);
    expect(s.highWaterMark).toBe(0);
  });

  it('equals the count after a run of ascending allocations', () => {
    const s = new CellStore(8, false);
    s.alloc(); // 0
    s.alloc(); // 1
    s.alloc(); // 2
    expect(s.highWaterMark).toBe(3);
  });

  it('is unchanged when a non-top slot is freed', () => {
    const s = new CellStore(8, false);
    s.alloc(); // 0
    s.alloc(); // 1
    s.alloc(); // 2
    s.free(1); // not the top slot (2 is still live)
    expect(s.highWaterMark).toBe(3);
  });

  it('shrinks past trailing dead slots when the top slot is freed', () => {
    const s = new CellStore(8, false);
    s.alloc(); // 0
    s.alloc(); // 1
    s.alloc(); // 2
    s.free(1); // dead, but interior
    s.free(2); // top → hwm must walk down past slot 1 (dead) to slot 0 (alive)
    expect(s.highWaterMark).toBe(1);
  });

  it('returns to 0 when every slot is freed', () => {
    const s = new CellStore(8, false);
    s.alloc();
    s.alloc();
    s.free(0);
    s.free(1);
    expect(s.highWaterMark).toBe(0);
  });

  it('always bounds the live set: every alive slot is below highWaterMark', () => {
    const s = new CellStore(16, false);
    const live = [s.alloc(), s.alloc(), s.alloc(), s.alloc(), s.alloc()];
    s.free(live[1]!);
    s.free(live[3]!);
    s.alloc(); // reuse a low slot (LIFO free-list)
    for (let i = 0; i < s.capacity; i++) {
      if (s.isAlive(i)) expect(i).toBeLessThan(s.highWaterMark);
    }
    // and the slot just below the mark is alive (the mark is tight)
    expect(s.isAlive(s.highWaterMark - 1)).toBe(true);
  });
});

describe('M3 SoA fields', () => {
  it('exposes heading/senseX/senseY/thrust as Float32 arrays of capacity length, zero-init', () => {
    const store = new CellStore(4, false);
    const f = store.fields;
    for (const arr of [f.heading, f.senseX, f.senseY, f.thrust]) {
      expect(arr).toBeInstanceOf(Float32Array);
      expect(arr.length).toBe(4);
      expect(arr[0]).toBe(0);
    }
  });
});
