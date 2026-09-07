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

  it('partitions into biome regions carved by distinct generators (variable solid density)', () => {
    // 3 regions cycle through noise/CA/rooms; the generators carve at measurably different local solid
    // fractions, so the per-region densities are NOT all identical (a single-generator map would be).
    const w = new Walls(
      1024,
      1024,
      64,
      64,
      cfg({ wallRegionCount: 3, wallDensity: 0.35, seed: 11 }),
    );
    const frac = w.regionSolidFractions();
    expect(frac.length).toBe(3);
    const spread = Math.max(...frac) - Math.min(...frac);
    expect(spread).toBeGreaterThan(0.05); // distinct biomes, not one uniform texture
  });

  it('multi-region map keeps food pockets reachable (connectivity survives compositing)', () => {
    const c = defaultConfig({
      wallCols: 64,
      wallRows: 64,
      foodCols: 16,
      foodRows: 16,
      foodPatchCount: 3,
      foodPatchRadius: 2,
      foodBaseFertility: 0,
      wallRegionCount: 3,
      wallDensity: 0.4,
      wallPocketCoreRadius: 2,
      seed: 7,
    });
    const w = new Walls(1024, 1024, 64, 64, c);
    expect(w.allPocketsConnected()).toBe(true);
  });

  it('multi-region composite lands near the target density band', () => {
    const w = new Walls(
      1024,
      1024,
      64,
      64,
      cfg({ wallRegionCount: 3, wallDensity: 0.35, seed: 5 }),
    );
    let solid = 0;
    const total = 64 * 64;
    for (let r = 0; r < 64; r++)
      for (let c = 0; c < 64; c++) if (w.isSolidAt(c * 16 + 8, r * 16 + 8)) solid++;
    expect(solid / total).toBeGreaterThan(0.15);
    expect(solid / total).toBeLessThan(0.55);
  });

  it('proximityAt returns 0 ON a solid cell and grows with distance from walls', () => {
    const w = new Walls(1024, 1024, 64, 64, cfg({ wallRegionCount: 1, wallDensity: 0.5, seed: 1 }));
    const cellW = 1024 / 64;
    // Find a solid cell: prox there must be 0 (it IS a wall).
    let solidX = -1;
    let solidY = -1;
    for (let r = 0; r < 64 && solidX < 0; r++)
      for (let c = 0; c < 64; c++) {
        const x = (c + 0.5) * cellW;
        const y = (r + 0.5) * cellW;
        if (w.isSolidAt(x, y)) {
          solidX = x;
          solidY = y;
          break;
        }
      }
    expect(solidX).toBeGreaterThanOrEqual(0);
    expect(w.proximityAt(solidX, solidY)).toBe(0);
    // The max proximity over the grid must exceed 0 (open cells away from walls read farther).
    let maxProx = 0;
    for (let r = 0; r < 64; r++)
      for (let c = 0; c < 64; c++)
        maxProx = Math.max(maxProx, w.proximityAt((c + 0.5) * cellW, (r + 0.5) * cellW));
    expect(maxProx).toBeGreaterThan(0);
  });

  it('proximityAt is uniformly far (flat) when walls are inactive', () => {
    const w = new Walls(1024, 1024, 64, 64, cfg({ wallRegionCount: 0 }));
    expect(w.active).toBe(false);
    const p0 = w.proximityAt(0, 0);
    expect(p0).toBeGreaterThan(0);
    // No walls → every position reads the same proxCap (flat field).
    for (let r = 0; r < 64; r += 7)
      for (let c = 0; c < 64; c += 7) expect(w.proximityAt(c * 16 + 8, r * 16 + 8)).toBe(p0);
  });

  it('gives every Voronoi region its own temperature optimum, shaped by temperatureScale', () => {
    // regionGen only takes GENERATORS.length (3) values, so keying the thermal optimum off the biome
    // archetype gave 5 regions just 3 optima — two identical pairs contributing zero between-region
    // signal. Sampling the seeded field at each region seed gives n distinct optima and keeps
    // temperatureScale live (it sets how far apart they spread).
    const w = new Walls(1024, 1024, 64, 64, cfg({ wallRegionCount: 5, temperatureScale: 1.5 }));
    expect(w.regionTemp.length).toBe(5);
    expect(new Set(Array.from(w.regionTemp)).size).toBe(5); // all distinct
    for (const t of w.regionTemp) expect(t).toBeGreaterThanOrEqual(0);
    for (const t of w.regionTemp) expect(t).toBeLessThanOrEqual(1);

    // temperatureScale actually moves the field: a different band count gives different optima.
    const dense = new Walls(1024, 1024, 64, 64, cfg({ wallRegionCount: 5, temperatureScale: 6 }));
    expect(Array.from(dense.regionTemp)).not.toEqual(Array.from(w.regionTemp));
  });

  it('regionTempAt returns the containing region’s optimum, and NaN when walls are inactive', () => {
    const w = new Walls(1024, 1024, 64, 64, cfg({ wallRegionCount: 5 }));
    for (let y = 0; y < 1024; y += 128)
      for (let x = 0; x < 1024; x += 128)
        expect(w.regionTempAt(x, y)).toBe(w.regionTemp[w.regionAt(x, y)]);
    const off = new Walls(1024, 1024, 64, 64, cfg({ wallRegionCount: 0 }));
    expect(Number.isNaN(off.regionTempAt(10, 10))).toBe(true);
  });
});
