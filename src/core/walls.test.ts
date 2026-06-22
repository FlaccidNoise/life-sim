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

  it('sweptCollide stops a fast move at a 1-cell-thick wall (no tunneling)', () => {
    const w = new Walls(1024, 1024, 64, 64, cfg({ wallRegionCount: 1, wallDensity: 0.5, seed: 1 }));
    const cellW = 1024 / 64;
    // Find an open cell whose right neighbour is solid AND the cell beyond is open (a thin wall to
    // tunnel through); aim a 3-cell displacement straight at it.
    let oc = -1;
    let or = -1;
    for (let r = 0; r < 64 && oc < 0; r++)
      for (let c = 0; c < 62; c++) {
        const here = (c + 0.5) * cellW;
        const wall = (c + 1.5) * cellW;
        const beyond = (c + 2.5) * cellW;
        const yy = (r + 0.5) * cellW;
        if (!w.isSolidAt(here, yy) && w.isSolidAt(wall, yy) && !w.isSolidAt(beyond, yy)) {
          oc = c;
          or = r;
          break;
        }
      }
    expect(oc).toBeGreaterThanOrEqual(0); // density 0.5 guarantees an open|solid|open triple exists

    const ox = (oc + 0.5) * cellW;
    const oy = (or + 0.5) * cellW;
    const res = w.sweptCollide(ox, oy, 3 * cellW, 0); // aim 3 cells right, through the thin wall
    expect(w.isSolidAt(res.x, res.y)).toBe(false); // ended on an open cell (move stayed in-bounds)
    expect(res.blockedX).toBe(true); // the wall stopped the x-move
    expect(res.x).toBeLessThan((oc + 1.5) * cellW); // did not reach (let alone pass) the wall cell
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
