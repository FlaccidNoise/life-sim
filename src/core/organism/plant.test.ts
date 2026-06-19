import { describe, it, expect } from 'vitest';
import { World } from '../sim/world';
import { defaultConfig, type Config } from '../sim/config';
import { CellType } from '../cells/types';

/** A sessile-plants world with light forced high everywhere so growth banks quickly. */
function plantWorld(overrides: Partial<Config> = {}): World {
  const w = new World(
    defaultConfig({
      seed: 7,
      maxCells: 500,
      sessilePlants: true,
      // small, fast economy so plants grow within a short test run
      plantGrowthThreshold: 5,
      plantGrowthCost: 2,
      plantBondLen: 15,
      // spores OFF by default (very high threshold) so the growth/sever tests keep a single founder
      // plant; the spore + determinism tests lower this to exercise emission/settling.
      plantSporeThreshold: 1e9,
      ...overrides,
    }),
    false,
  );
  // Flood the light field to its max everywhere (both the live buffer and the regen cap).
  w.light.light.fill(w.config.lightMax);
  w.light.cap.fill(w.config.lightMax);
  return w;
}

/** Count live cells of a plant organism (anchored or chain) by organismId. */
function plantCellCount(w: World, org: number): number {
  const f = w.cells.fields;
  let c = 0;
  for (let i = 0; i < w.cells.highWaterMark; i++) {
    if (w.cells.isAlive(i) && f.organismId[i] === org && f.cellType[i] === CellType.PHOTO) c++;
  }
  return c;
}

function countType(w: World, type: number): number {
  const f = w.cells.fields;
  let c = 0;
  for (let i = 0; i < w.cells.highWaterMark; i++) {
    if (w.cells.isAlive(i) && f.cellType[i] === type) c++;
  }
  return c;
}

describe('plant growth', () => {
  it('a seeded base grows to exactly plantMaxChain cells and stops', () => {
    const w = plantWorld();
    const base = w.seedPlantBase(1000, 1000, 50);
    const org = w.cells.fields.organismId[base]!;
    // refill the light cap so depletion never browns out the pocket during the run
    for (let t = 0; t < 60; t++) {
      w.light.light.fill(w.config.lightMax);
      w.tick();
    }
    expect(plantCellCount(w, org)).toBe(w.config.plantMaxChain);
    // the base never moved (anchored)
    expect(w.cells.fields.posX[base]).toBe(1000);
    expect(w.cells.fields.posY[base]).toBe(1000);
    expect(w.cells.fields.anchored[base]).toBe(1);
  });
});

describe('plant grazing (sever + regrow)', () => {
  it('draining a chain cell frees the cells above it to MEAT; base + stub survive', () => {
    const w = plantWorld();
    const base = w.seedPlantBase(1000, 1000, 50);
    const org = w.cells.fields.organismId[base]!;
    for (let t = 0; t < 60; t++) {
      w.light.light.fill(w.config.lightMax);
      w.tick();
    }
    expect(plantCellCount(w, org)).toBe(w.config.plantMaxChain);
    const f = w.cells.fields;

    // Find the chain cell most distal-ish: pick a non-base plant cell, drain it to 0 so sever fires.
    let victim = -1;
    for (let i = 0; i < w.cells.highWaterMark; i++) {
      if (
        w.cells.isAlive(i) &&
        f.organismId[i] === org &&
        f.cellType[i] === CellType.PHOTO &&
        f.anchored[i] === 0
      ) {
        victim = i; // first chain cell found
      }
    }
    expect(victim).toBeGreaterThanOrEqual(0);
    const meatBefore = countType(w, CellType.MEAT);
    // Simulate a forager out-draining photosynthesis: zero the cell and run the sever step directly
    // (a live forager would drive energy<=0 inside metabolize each tick; this isolates the sever unit
    // from the photosynthesis/transfer refill that would otherwise top the cell back up the same tick).
    f.energy[victim] = 0;
    w.plants.severEatenChainCells(
      w.cells,
      w.bonds,
      w.liveIndices,
      w.liveCount,
      w.config.meatEnergyOnDeath,
      false,
    );

    // base survives (still anchored PHOTO of this org)
    expect(f.cellType[base]).toBe(CellType.PHOTO);
    expect(f.anchored[base]).toBe(1);
    expect(f.organismId[base]).toBe(org);
    // some MEAT was produced (the severed cell, and the cells it was holding up)
    expect(countType(w, CellType.MEAT)).toBeGreaterThan(meatBefore);
    // the plant lost at least one cell
    expect(plantCellCount(w, org)).toBeLessThan(w.config.plantMaxChain);
  });

  it('draining the base frees the whole remaining chain to MEAT (plant dies)', () => {
    const w = plantWorld();
    const base = w.seedPlantBase(1000, 1000, 50);
    const org = w.cells.fields.organismId[base]!;
    for (let t = 0; t < 60; t++) {
      w.light.light.fill(w.config.lightMax);
      w.tick();
    }
    const before = plantCellCount(w, org);
    expect(before).toBe(w.config.plantMaxChain);

    const f = w.cells.fields;
    f.energy[base] = 0;
    // drain the base and run sever directly: the base is no longer a reachability seed, so the whole
    // remaining chain is unreachable → the entire plant becomes MEAT (plant death).
    w.plants.severEatenChainCells(
      w.cells,
      w.bonds,
      w.liveIndices,
      w.liveCount,
      w.config.meatEnergyOnDeath,
      false,
    );

    // the whole plant is gone — no PHOTO cells of this org remain
    expect(plantCellCount(w, org)).toBe(0);
    // and the biomass became MEAT
    expect(countType(w, CellType.MEAT)).toBeGreaterThanOrEqual(before);
  });
});

describe('plant spores', () => {
  it('a mature plant emits a free PHOTO spore that drifts and anchors into a new base', () => {
    const w = plantWorld({
      plantSporeThreshold: 20,
      plantSporeCost: 5,
      plantSporeImpulse: 25,
      plantSettleSpeed: 0.5,
    });
    const base = w.seedPlantBase(1000, 1000, 50);
    const org = w.cells.fields.organismId[base]!;
    const f = w.cells.fields;

    let anchoredSpores = 0;
    for (let t = 0; t < 600; t++) {
      w.light.light.fill(w.config.lightMax);
      w.tick();
      // count anchored PHOTO cells that are NOT the founder base (i.e. settled spores)
      let a = 0;
      for (let i = 0; i < w.cells.highWaterMark; i++) {
        if (
          w.cells.isAlive(i) &&
          i !== base &&
          f.cellType[i] === CellType.PHOTO &&
          f.anchored[i] === 1 &&
          f.organismId[i] !== org &&
          f.organismId[i] !== 0
        ) {
          a++;
        }
      }
      anchoredSpores = Math.max(anchoredSpores, a);
      if (anchoredSpores > 0) break;
    }
    expect(anchoredSpores).toBeGreaterThan(0);
  });
});

describe('plant determinism', () => {
  it('two same-seed sessile-plant runs are byte-identical (incl. anchored)', () => {
    function run(): World {
      const w = plantWorld({
        maxCells: 2000, // headroom so alloc-refusal never masks a divergence
        plantSporeThreshold: 20,
        plantSporeCost: 5,
        plantSporeImpulse: 25,
        plantSettleSpeed: 0.5,
      });
      // a handful of founders so growth, spores, settles, and (random) severs all exercise
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
    expect(Array.from(fa.anchored.slice(0, cap))).toEqual(Array.from(fb.anchored.slice(0, cap)));
    expect(Array.from(fa.posX.slice(0, cap))).toEqual(Array.from(fb.posX.slice(0, cap)));
    expect(Array.from(fa.posY.slice(0, cap))).toEqual(Array.from(fb.posY.slice(0, cap)));
    expect(Array.from(fa.energy.slice(0, cap))).toEqual(Array.from(fb.energy.slice(0, cap)));
    expect(Array.from(fa.organismId.slice(0, cap))).toEqual(
      Array.from(fb.organismId.slice(0, cap)),
    );
    expect(Array.from(fa.cellType.slice(0, cap))).toEqual(Array.from(fb.cellType.slice(0, cap)));

    // non-vacuity: at least one spore actually anchored (an anchored cell beyond the 3 founders)
    let anchoredCount = 0;
    for (let i = 0; i < a.cells.highWaterMark; i++) {
      if (a.cells.isAlive(i) && fa.anchored[i] === 1) anchoredCount++;
    }
    expect(anchoredCount).toBeGreaterThan(3);
  });
});
