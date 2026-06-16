import { describe, it, expect } from 'vitest';
import { CellStore } from '../memory/cell-store';
import { CellType } from './types';
import { act } from './act';

describe('act — hardcoded chemotaxis reflex', () => {
  it('turns toward the gradient (capped by turnRate) and sets clamped thrust', () => {
    const store = new CellStore(2, false);
    const f = store.fields;
    const i = store.alloc();
    f.cellType[i] = CellType.MOTILE;
    f.heading[i] = 0; // facing +x
    f.senseX[i] = 0; // gradient points +y (desired heading = +PI/2)
    f.senseY[i] = 3;
    // turnRate 0.1 → heading advances exactly +0.1 toward PI/2; thrust = min(2*3, 5)=5.
    act(Uint32Array.from([i]), 1, f, 0.1, 2, 5, 1e-4, 0);
    expect(f.heading[i]).toBeCloseTo(0.1, 6);
    expect(f.thrust[i]).toBeCloseTo(5, 6);
  });

  it('snaps within turnRate of the target (no overshoot)', () => {
    const store = new CellStore(1, false);
    const f = store.fields;
    const i = store.alloc();
    f.cellType[i] = CellType.MOTILE;
    f.heading[i] = Math.PI / 2 - 0.02; // 0.02 short of the target
    f.senseX[i] = 0;
    f.senseY[i] = 1;
    act(Uint32Array.from([i]), 1, f, 0.1, 1, 10, 1e-4, 0);
    expect(f.heading[i]).toBeCloseTo(Math.PI / 2, 6); // lands exactly, not +0.1 past
    expect(f.thrust[i]).toBeCloseTo(1, 6);
  });

  it('coasts at cruiseThrust with heading held when the gradient is below threshold', () => {
    const store = new CellStore(1, false);
    const f = store.fields;
    const i = store.alloc();
    f.cellType[i] = CellType.MOTILE;
    f.heading[i] = 0.7;
    const headingBefore = f.heading[i]; // capture Float32-rounded value
    f.senseX[i] = 0;
    f.senseY[i] = 0;
    act(Uint32Array.from([i]), 1, f, 0.1, 2, 5, 1e-4, 0.5);
    expect(f.heading[i]).toBe(headingBefore); // unchanged
    expect(f.thrust[i]).toBeCloseTo(0.5, 6);
  });

  it('ignores non-MOTILE cells', () => {
    const store = new CellStore(1, false);
    const f = store.fields;
    const i = store.alloc();
    f.cellType[i] = CellType.DIGESTIVE;
    f.senseX[i] = 5;
    act(Uint32Array.from([i]), 1, f, 0.1, 2, 5, 1e-4, 0.5);
    expect(f.thrust[i]).toBe(0);
  });
});
