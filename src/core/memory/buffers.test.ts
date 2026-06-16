import { describe, it, expect } from 'vitest';
import { allocateSoa, supportsSharedMemory } from './buffers';

const SPECS = [
  { name: 'posX', ctor: Float64Array },
  { name: 'cellType', ctor: Uint8Array },
  { name: 'organismId', ctor: Uint32Array },
] as const;

describe('allocateSoa', () => {
  it('creates independent views of the requested length', () => {
    const soa = allocateSoa(SPECS, 8, false);
    expect(soa.capacity).toBe(8);
    expect(soa.fields.posX.length).toBe(8);
    expect(soa.fields.cellType.length).toBe(8);
    soa.fields.posX[3] = 1.5;
    soa.fields.cellType[3] = 7;
    expect(soa.fields.posX[3]).toBe(1.5);
    expect(soa.fields.cellType[3]).toBe(7);
  });

  it('places all fields in a single backing buffer', () => {
    const soa = allocateSoa(SPECS, 8, false);
    expect(soa.fields.posX.buffer).toBe(soa.buffer);
    expect(soa.fields.cellType.buffer).toBe(soa.buffer);
    expect(soa.fields.organismId.buffer).toBe(soa.buffer);
  });

  it('aligns each field view to its element size', () => {
    const soa = allocateSoa(SPECS, 8, false);
    expect(soa.fields.posX.byteOffset % 8).toBe(0);
    expect(soa.fields.organismId.byteOffset % 4).toBe(0);
  });

  it('reports non-shared when shared memory is not requested', () => {
    const soa = allocateSoa(SPECS, 8, false);
    expect(soa.shared).toBe(false);
    expect(soa.buffer).toBeInstanceOf(ArrayBuffer);
  });

  it('uses SharedArrayBuffer when requested and supported', () => {
    const soa = allocateSoa(SPECS, 8, true);
    expect(soa.shared).toBe(supportsSharedMemory());
  });
});
