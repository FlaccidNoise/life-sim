import { describe, it, expect } from 'vitest';
import { Walls } from './walls';
import { defaultConfig } from './config';

const cfg = (o = {}) =>
  defaultConfig({
    wallCols: 64,
    wallRows: 64,
    foodCols: 16,
    foodRows: 16,
    foodPatchCount: 0,
    ...o,
  });

describe('Walls', () => {
  it('is all-open and inactive when wallRegionCount=0', () => {
    const w = new Walls(1024, 1024, 64, 64, cfg({ wallRegionCount: 0 }));
    expect(w.active).toBe(false);
    let solid = 0;
    for (let y = 0; y < 1024; y += 16)
      for (let x = 0; x < 1024; x += 16) if (w.isSolidAt(x, y)) solid++;
    expect(solid).toBe(0);
  });

  it('carves roughly the target density when active', () => {
    const w = new Walls(1024, 1024, 64, 64, cfg({ wallRegionCount: 1, wallDensity: 0.35 }));
    expect(w.active).toBe(true);
    let solid = 0;
    const total = 64 * 64;
    for (let r = 0; r < 64; r++)
      for (let c = 0; c < 64; c++) if (w.isSolidAt(c * 16 + 8, r * 16 + 8)) solid++;
    expect(solid / total).toBeGreaterThan(0.2);
    expect(solid / total).toBeLessThan(0.5);
  });

  it('is deterministic from config.seed', () => {
    const a = new Walls(1024, 1024, 64, 64, cfg({ seed: 9, wallRegionCount: 1 }));
    const b = new Walls(1024, 1024, 64, 64, cfg({ seed: 9, wallRegionCount: 1 }));
    for (let r = 0; r < 64; r++)
      for (let c = 0; c < 64; c++)
        expect(a.isSolidAt(c * 16 + 8, r * 16 + 8)).toBe(b.isSolidAt(c * 16 + 8, r * 16 + 8));
  });

  it('keeps food pockets reachable from each other (connectivity guarantee)', () => {
    // Two pockets in dead water; after generation a flood-fill of open cells must put both centroids
    // in the SAME connected component.
    const c = defaultConfig({
      wallCols: 64,
      wallRows: 64,
      foodCols: 16,
      foodRows: 16,
      foodPatchCount: 2,
      foodPatchRadius: 2,
      foodBaseFertility: 0,
      wallRegionCount: 1,
      wallDensity: 0.45,
      seed: 4,
    });
    const w = new Walls(1024, 1024, 64, 64, c);
    expect(w.allPocketsConnected()).toBe(true);
  });
});
