import { describe, it, expect } from 'vitest';
import { World } from './world';
import { defaultConfig } from './config';

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
