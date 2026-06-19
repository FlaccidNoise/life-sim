import { describe, it, expect } from 'vitest';
import { World } from '../sim/world';
import { defaultConfig, type Config } from '../sim/config';
import { CellType } from '../cells/types';

/**
 * Spore lifecycle + determinism for the sessilePlants model. Complements plant.test.ts (growth,
 * sever, base-death, single-spore anchor) with the two cases that gate "pockets self-select":
 *   - a settled spore in LIGHT matures into a viable new base (fresh organism id, anchored, grows);
 *   - a settled spore in DARKNESS starves before maturing (no chain, converts to MEAT);
 * plus a byte-identical two-run determinism check (incl. the on-contract `anchored` field).
 *
 * Mirrors golden-bond.test.ts by freezing the unrelated economy (no current/food/predation) and
 * driving light directly, so only the plant mechanics move.
 */

/** A sessile-plants world; light is driven per-tick by the caller (flooded or zeroed). */
function plantWorld(overrides: Partial<Config> = {}): World {
  return new World(
    defaultConfig({
      seed: 7,
      maxCells: 1000,
      sessilePlants: true,
      // small, fast economy so growth/spores resolve in a short run
      plantGrowthThreshold: 5,
      plantGrowthCost: 2,
      plantBondLen: 15,
      plantSporeThreshold: 20,
      plantSporeCost: 5,
      plantSporeImpulse: 25,
      plantSettleSpeed: 0.5,
      ...overrides,
    }),
    false,
  );
}

/** Live PHOTO cells belonging to plant organism `org` (base + chain). */
function plantCellCount(w: World, org: number): number {
  const f = w.cells.fields;
  let c = 0;
  for (let i = 0; i < w.cells.highWaterMark; i++) {
    if (w.cells.isAlive(i) && f.organismId[i] === org && f.cellType[i] === CellType.PHOTO) c++;
  }
  return c;
}

describe('plant spore lifecycle — settle in light', () => {
  it('a mature plant emits a spore that drifts and anchors into a NEW base (fresh org id, grows)', () => {
    const w = plantWorld();
    const base = w.seedPlantBase(1000, 1000, 50);
    const founderOrg = w.cells.fields.organismId[base]!;
    const f = w.cells.fields;

    // Identify the settled spore: an anchored PHOTO cell that is neither the founder base nor free.
    function findSettledSpore(): number {
      for (let i = 0; i < w.cells.highWaterMark; i++) {
        if (
          w.cells.isAlive(i) &&
          i !== base &&
          f.cellType[i] === CellType.PHOTO &&
          f.anchored[i] === 1 &&
          f.organismId[i] !== founderOrg &&
          f.organismId[i] !== 0
        ) {
          return i;
        }
      }
      return -1;
    }

    let spore = -1;
    for (let t = 0; t < 600 && spore < 0; t++) {
      w.light.light.fill(w.config.lightMax); // founder stays in full light → spores repeatedly
      w.tick();
      spore = findSettledSpore();
    }
    expect(spore).toBeGreaterThanOrEqual(0); // a spore actually anchored

    const sporeOrg = f.organismId[spore]!;
    expect(sporeOrg).not.toBe(founderOrg); // a FRESH organism id (organisms.alloc), not the parent
    expect(sporeOrg).not.toBe(0);
    expect(f.anchored[spore]).toBe(1); // pinned as a new base
    // A fresh base is immovable: its velocity was zeroed on settle.
    expect(f.velX[spore]).toBe(0);
    expect(f.velY[spore]).toBe(0);

    // It is a viable founder: kept in light, it grows a chain past 1 cell.
    const px = f.posX[spore];
    const py = f.posY[spore];
    for (let t = 0; t < 120; t++) {
      w.light.light.fill(w.config.lightMax);
      w.tick();
    }
    expect(plantCellCount(w, sporeOrg)).toBeGreaterThan(1); // matured into a real plant
    expect(f.posX[spore]).toBe(px); // and never moved (anchored base)
    expect(f.posY[spore]).toBe(py);
  });
});

describe('plant spore lifecycle — settle in darkness', () => {
  it('a spore that settles in darkness starves without maturing (no chain, becomes MEAT)', () => {
    // A founder grows to maturity in LIGHT and emits a spore. The instant that spore anchors we cut
    // the world to total darkness: the new base gets ~0 photosynthesis everywhere, so it can't grow
    // a chain and starves (basalCost drains it ≤ 0 → severEatenChainCells reaps it to MEAT). Pockets
    // self-select: a spore that lands outside the light keeps no lineage.
    const w = plantWorld();
    const base = w.seedPlantBase(1000, 1000, 50);
    const founderOrg = w.cells.fields.organismId[base]!;
    const f = w.cells.fields;

    function findSettledSpore(): number {
      for (let i = 0; i < w.cells.highWaterMark; i++) {
        if (
          w.cells.isAlive(i) &&
          i !== base &&
          f.cellType[i] === CellType.PHOTO &&
          f.anchored[i] === 1 &&
          f.organismId[i] !== founderOrg &&
          f.organismId[i] !== 0
        ) {
          return i;
        }
      }
      return -1;
    }

    // Phase 1: founder in full light → matures → emits a spore that drifts and anchors.
    let spore = -1;
    for (let t = 0; t < 600 && spore < 0; t++) {
      w.light.light.fill(w.config.lightMax);
      w.tick();
      spore = findSettledSpore();
    }
    expect(spore).toBeGreaterThanOrEqual(0); // a spore anchored
    const sporeOrg = f.organismId[spore]!;
    expect(plantCellCount(w, sporeOrg)).toBe(1); // a lone fresh base, no chain yet

    // Phase 2: total darkness everywhere. With no photosynthesis income the new base pays basalCost
    // until energy ≤ 0, then severEatenChainCells reaps it. It NEVER reaches plantMaturityChain.
    let starved = false;
    for (let t = 0; t < 400; t++) {
      w.light.light.fill(0);
      w.light.cap.fill(0);
      w.tick();
      expect(plantCellCount(w, sporeOrg)).toBeLessThan(w.config.plantMaturityChain); // never matures
      if (!w.cells.isAlive(spore) || f.cellType[spore] !== CellType.PHOTO) {
        starved = true; // the base was reaped (freed / turned to MEAT)
        break;
      }
    }
    expect(starved).toBe(true);
    expect(plantCellCount(w, sporeOrg)).toBe(0); // the dark lineage is gone — pockets self-select
  });
});

describe('plant spore lifecycle — determinism', () => {
  it('two same-seed sessile-plant runs are byte-identical (incl. anchored)', () => {
    function run(): World {
      const w = plantWorld({ maxCells: 2000 }); // headroom so alloc-refusal never masks divergence
      // Several founders so growth, spores, settles, and severs all exercise across the run.
      w.seedPlantBase(900, 900, 50);
      w.seedPlantBase(1100, 1000, 50);
      w.seedPlantBase(1000, 1150, 50);
      for (let t = 0; t < 250; t++) {
        w.light.light.fill(w.config.lightMax);
        w.tick();
      }
      return w;
    }
    const a = run();
    const b = run();
    const fa = a.cells.fields;
    const fb = b.cells.fields;
    const cap = a.cells.capacity;
    // anchored is ON the determinism contract (it drives the integrator pin), so it must match too.
    expect(Array.from(fa.anchored.slice(0, cap))).toEqual(Array.from(fb.anchored.slice(0, cap)));
    expect(Array.from(fa.posX.slice(0, cap))).toEqual(Array.from(fb.posX.slice(0, cap)));
    expect(Array.from(fa.posY.slice(0, cap))).toEqual(Array.from(fb.posY.slice(0, cap)));
    expect(Array.from(fa.energy.slice(0, cap))).toEqual(Array.from(fb.energy.slice(0, cap)));
    expect(Array.from(fa.organismId.slice(0, cap))).toEqual(
      Array.from(fb.organismId.slice(0, cap)),
    );
    expect(Array.from(fa.cellType.slice(0, cap))).toEqual(Array.from(fb.cellType.slice(0, cap)));

    // Non-vacuity: at least one spore anchored (an anchored cell beyond the 3 founders).
    let anchoredCount = 0;
    for (let i = 0; i < a.cells.highWaterMark; i++) {
      if (a.cells.isAlive(i) && fa.anchored[i] === 1) anchoredCount++;
    }
    expect(anchoredCount).toBeGreaterThan(3);
  });
});
