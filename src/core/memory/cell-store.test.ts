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
