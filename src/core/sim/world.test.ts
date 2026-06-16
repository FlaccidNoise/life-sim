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
});
