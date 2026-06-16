import { describe, it, expect } from 'vitest';
import { World } from './world';
import { defaultConfig } from './config';
import { CellType } from '../cells/types';

describe('golden tick — energy bookkeeping', () => {
  it('reproduces exact post-tick energies and light over one full tick', () => {
    const cfg = defaultConfig({
      maxCells: 8,
      worldWidth: 1024,
      worldHeight: 1024,
      lightGridCols: 16,
      lightGridRows: 16,
      lightDiffuse: 0,
      lightRegen: 0, // freeze the field for closed-form expectation
      photoGain: 0.1,
      photoDepletion: 0.5,
      basalCost: 0.01,
      digestRate: 2,
      digestEfficiency: 0.5,
      meatDecay: 1,
      repulsion: 0,
      divideThreshold: 1e9, // no forces, no division
    });
    const w = new World(cfg, false);
    const f = w.cells.fields;

    // Override the patchy field to a known uniform 1.0 so photosynthesis is exact.
    w.light.cap.fill(1);
    w.light.light.fill(1);

    // Slot 0: PHOTO at a known patch. Slot 1: DIGESTIVE adjacent to slot 2: MEAT.
    const a = w.cells.alloc(); // 0
    const b = w.cells.alloc(); // 1
    const c = w.cells.alloc(); // 2
    expect([a, b, c]).toEqual([0, 1, 2]); // canonical slot order

    f.posX[a] = 500;
    f.posY[a] = 500;
    f.radius[a] = 2;
    f.mass[a] = 1;
    f.energy[a] = 100;
    f.cellType[a] = CellType.PHOTO;
    f.velX[a] = 0;
    f.velY[a] = 0;

    f.posX[b] = 200;
    f.posY[b] = 200;
    f.radius[b] = 2;
    f.mass[b] = 1;
    f.energy[b] = 100;
    f.cellType[b] = CellType.DIGESTIVE;
    f.velX[b] = 0;
    f.velY[b] = 0;

    f.posX[c] = 203;
    f.posY[c] = 200;
    f.radius[c] = 2;
    f.mass[c] = 1;
    f.energy[c] = 10;
    f.cellType[c] = CellType.MEAT;
    f.velX[c] = 0;
    f.velY[c] = 0;

    const patchA = w.light.patchIndex(500, 500);

    w.tick();

    const area = 2 * 2; // 4
    const gain = 0.1 * 1 * area;
    // PHOTO: +gain − basal·area. Float32 energy → digit 4.
    expect(f.energy[a]).toBeCloseTo(100 + gain - 0.01 * area, 4);
    // Light patch (≤1, fine at digit 6): 1 − gain·photoDepletion. step() with
    // diffuse=regen=0 copies the depleted value through the buffer swap.
    expect(w.light.light[patchA]).toBeCloseTo(1 - gain * 0.5, 6);
    // DIGESTIVE eats the adjacent MEAT first: +digestRate·efficiency − basal·area.
    expect(f.energy[b]).toBeCloseTo(100 + 2 * 0.5 - 0.01 * area, 4);
    // MEAT: −eaten(2) − meatDecay(1) = 7 (exact, digit 6).
    expect(f.energy[c]).toBeCloseTo(10 - 2 - 1, 6);
  });
});
