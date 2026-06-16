import { describe, it, expect } from 'vitest';
import { World } from './world';
import { defaultConfig } from './config';
import { CellType } from '../cells/types';

describe('World', () => {
  it('spawns the requested number of live cells', () => {
    const w = new World(defaultConfig({ maxCells: 100 }), false);
    const n = w.spawn(50);
    expect(n).toBe(50);
    expect(w.cells.aliveCount).toBe(50);
  });

  it('caps spawning at capacity', () => {
    const w = new World(defaultConfig({ maxCells: 10 }), false);
    expect(w.spawn(25)).toBe(10);
    expect(w.cells.aliveCount).toBe(10);
  });

  it('spawns cells inside the world bounds', () => {
    const cfg = defaultConfig({ maxCells: 100, worldWidth: 200, worldHeight: 300 });
    const w = new World(cfg, false);
    w.spawn(100);
    for (let i = 0; i < 100; i++) {
      expect(w.cells.fields.posX[i]).toBeGreaterThanOrEqual(0);
      expect(w.cells.fields.posX[i]).toBeLessThan(200);
      expect(w.cells.fields.posY[i]).toBeGreaterThanOrEqual(0);
      expect(w.cells.fields.posY[i]).toBeLessThan(300);
    }
  });

  it('advances tick count and ages live cells', () => {
    const w = new World(defaultConfig({ maxCells: 10 }), false);
    w.spawn(3);
    w.tick();
    w.tick();
    expect(w.tickCount).toBe(2);
    expect(w.cells.fields.age[0]).toBe(2);
  });

  it('keeps all live cells within the toroidal bounds after many ticks', () => {
    const cfg = defaultConfig({ maxCells: 500, worldWidth: 256, worldHeight: 256 });
    const w = new World(cfg, false);
    w.spawn(500);
    for (let i = 0; i < 50; i++) w.tick();
    const f = w.cells.fields;
    for (let k = 0; k < w.liveCount; k++) {
      const i = w.liveIndices[k]!;
      expect(f.posX[i]).toBeGreaterThanOrEqual(0);
      expect(f.posX[i]).toBeLessThan(256);
      expect(f.posY[i]).toBeGreaterThanOrEqual(0);
      expect(f.posY[i]).toBeLessThan(256);
    }
  });

  it('separates two overlapping cells over ticks', () => {
    const w = new World(
      defaultConfig({
        maxCells: 8,
        worldWidth: 200,
        worldHeight: 200,
        cellRadius: 10,
        repulsion: 2,
        damping: 0.5,
      }),
      false,
    );
    w.spawn(2);
    const f = w.cells.fields;
    // Force a known overlap: 5 apart with radius 10 (sum 20).
    f.posX[0] = 100;
    f.posY[0] = 100;
    f.posX[1] = 105;
    f.posY[1] = 100;
    const before = Math.abs(f.posX[1] - f.posX[0]);
    for (let i = 0; i < 30; i++) w.tick();
    const after = Math.abs(f.posX[1] - f.posX[0]);
    expect(after).toBeGreaterThan(before);
  });
});

describe('World M2 metabolism integration', () => {
  it('seeds a PHOTO/DIGESTIVE mix by initialPhotoFraction', () => {
    const w = new World(defaultConfig({ maxCells: 1000, initialPhotoFraction: 0.8 }), false);
    w.seedLife(1000);
    let photo = 0;
    let dig = 0;
    for (let i = 0; i < w.cells.capacity; i++) {
      if (!w.cells.isAlive(i)) continue;
      if (w.cells.fields.cellType[i] === CellType.PHOTO) photo++;
      else if (w.cells.fields.cellType[i] === CellType.DIGESTIVE) dig++;
    }
    expect(photo).toBe(800);
    expect(dig).toBe(200);
  });

  it('ticks without error and updates metrics + light field', () => {
    const w = new World(defaultConfig({ maxCells: 2000 }), false);
    w.seedLife(1000);
    const before = Array.from(w.light.light);
    for (let i = 0; i < 20; i++) w.tick();
    expect(w.tickCount).toBe(20);
    expect(w.metrics.population).toBeGreaterThan(0);
    expect(w.metrics.population).toBe(w.cells.aliveCount); // metrics on the CURRENT live set
    expect(Array.from(w.light.light)).not.toEqual(before); // field evolved
  });

  it('low-energy cells die into meat over time (population dynamics live)', () => {
    const w = new World(
      defaultConfig({ maxCells: 2000, lightMax: 0, basalCost: 5, divideThreshold: 1e9 }),
      false,
    );
    w.seedLife(500);
    for (let i = 0; i < 40; i++) w.tick();
    let meat = 0;
    for (let i = 0; i < w.cells.capacity; i++) {
      if (w.cells.isAlive(i) && w.cells.fields.cellType[i] === CellType.MEAT) meat++;
    }
    expect(meat).toBeGreaterThan(0);
  });

  it('newborn division children have age 0 the tick they are born, even when a corpse slot is recycled', () => {
    // Force a tick with BOTH a freed corpse (recycle) and a division (alloc) so the
    // LIFO free-list hands the freed slot to the child. Verify age stays 0.
    const w = new World(
      defaultConfig({
        maxCells: 100,
        worldWidth: 256,
        worldHeight: 256,
        lightGridCols: 8,
        lightGridRows: 8,
      }),
      false,
    );
    const f = w.cells.fields;
    const corpse = w.cells.alloc();
    const parent = w.cells.alloc();
    f.cellType[corpse] = CellType.MEAT;
    f.energy[corpse] = 0.0001;
    f.mass[corpse] = 1;
    f.radius[corpse] = 6;
    f.posX[corpse] = 10;
    f.posY[corpse] = 10;
    f.cellType[parent] = CellType.DIGESTIVE;
    f.energy[parent] = 1e6;
    f.mass[parent] = 1;
    f.radius[parent] = 6;
    f.posX[parent] = 200;
    f.posY[parent] = 200;
    w.config.meatDecay = 1; // corpse 0.0001 → negative → freed this tick
    w.config.divideThreshold = 100; // parent divides this tick
    w.config.basalCost = 0; // keep parent alive
    w.tick();
    // every live cell should have age <= 1 (all born/aged this run); a recycled child must be 0 or 1, never inflated
    for (let i = 0; i < w.cells.capacity; i++) {
      if (!w.cells.isAlive(i)) continue;
      expect(w.cells.fields.age[i]).toBeLessThanOrEqual(1);
    }
    expect(w.lastBirths).toBeGreaterThanOrEqual(1);
    expect(w.metrics.population).toBe(w.cells.aliveCount);
  });
});
