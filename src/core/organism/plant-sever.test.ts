import { describe, it, expect } from 'vitest';
import { World } from '../sim/world';
import { defaultConfig, type Config } from '../sim/config';
import { CellType } from '../cells/types';

/**
 * Sever-on-graze, mid-chain. Eating (draining to 0) a cell partway up the chain must free EVERY cell
 * above it (they become MEAT, organismId 0) while the base + the lower stub survive as the plant, and
 * the plant then regrows from its new most-distal cell. This is the strong version of the spec's
 * "grazing severs the chain; the base regrows" — it asserts the exact partition (above→MEAT,
 * base+stub→survive) and the regrowth, not just "lost a cell / made some MEAT".
 *
 * Economy is frozen (basalCost/move/neural off, spores off via a huge threshold) so the only dynamics
 * are growth + the sever we trigger, mirroring golden-bond.test.ts.
 */
function plantWorld(overrides: Partial<Config> = {}): World {
  const w = new World(
    defaultConfig({
      seed: 7,
      maxCells: 500,
      sessilePlants: true,
      basalCost: 0,
      moveCost: 0,
      neuralCost: 0,
      // fast, small growth economy so the founder reaches plantMaxChain within a short run
      plantGrowthThreshold: 5,
      plantGrowthCost: 2,
      plantBondLen: 15,
      // spores OFF (very high threshold) so the only plant in the world is the single founder
      plantSporeThreshold: 1e9,
      ...overrides,
    }),
    false,
  );
  // Flood the light field to its max everywhere so growth banks energy quickly and never browns out.
  w.light.light.fill(w.config.lightMax);
  w.light.cap.fill(w.config.lightMax);
  return w;
}

/** Walk the linear plant chain from `base` over the live bond graph, returns slots ordered base→tip. */
function chainFromBase(w: World, base: number): number[] {
  const bonds = w.bonds;
  const cap = bonds.degreeCap;
  const order: number[] = [];
  const seen = new Set<number>();
  const queue = [base];
  seen.add(base);
  while (queue.length > 0) {
    const c = queue.shift()!;
    order.push(c);
    const d = bonds.degree[c]!;
    for (let k = 0; k < d; k++) {
      const s = bonds.adj[c * cap + k]!;
      const nb = bonds.cellA[s]! === c ? bonds.cellB[s]! : bonds.cellA[s]!;
      if (seen.has(nb)) continue;
      seen.add(nb);
      queue.push(nb);
    }
  }
  return order; // a plant is a path graph (growth always extends the most-distal cell) → BFS order = base→tip
}

function plantCellCount(w: World, org: number): number {
  const f = w.cells.fields;
  let c = 0;
  for (let i = 0; i < w.cells.highWaterMark; i++) {
    if (w.cells.isAlive(i) && f.organismId[i] === org && f.cellType[i] === CellType.PHOTO) c++;
  }
  return c;
}

function growToMax(w: World): void {
  for (let t = 0; t < 60; t++) {
    w.light.light.fill(w.config.lightMax);
    w.tick();
  }
}

describe('plant sever-on-graze (mid-chain)', () => {
  it('draining a mid-chain cell frees the cells above it to MEAT; base + lower stub survive', () => {
    const w = plantWorld();
    const base = w.seedPlantBase(1000, 1000, 50);
    const org = w.cells.fields.organismId[base]!;
    growToMax(w);
    const f = w.cells.fields;
    expect(plantCellCount(w, org)).toBe(w.config.plantMaxChain);

    // Order the chain base→tip and pick a MID-chain victim (not the base, not the tip).
    const chain = chainFromBase(w, base);
    expect(chain.length).toBe(w.config.plantMaxChain);
    expect(chain[0]).toBe(base);
    const mid = Math.floor(chain.length / 2);
    const victim = chain[mid]!;
    const stub = chain.slice(0, mid); // base + cells below the victim — must survive
    const above = chain.slice(mid); // victim + everything above it — must become MEAT
    expect(stub.length).toBeGreaterThanOrEqual(2); // a real stub, not just the base
    expect(above.length).toBeGreaterThanOrEqual(2); // a real freed segment, not just the tip

    const meatBefore = (() => {
      let c = 0;
      for (let i = 0; i < w.cells.highWaterMark; i++) {
        if (w.cells.isAlive(i) && f.cellType[i] === CellType.MEAT) c++;
      }
      return c;
    })();

    // Simulate a forager out-draining photosynthesis on the mid cell, then run the sever step
    // directly (isolates the unit from the same-tick photosynthesis/transfer refill).
    f.energy[victim] = 0;
    w.plants.severEatenChainCells(
      w.cells,
      w.bonds,
      w.liveIndices,
      w.liveCount,
      w.config.meatEnergyOnDeath,
      false,
    );

    // The stub (base + lower cells) survives as the plant: still PHOTO, still this org.
    for (const c of stub) {
      expect(w.cells.isAlive(c)).toBe(true);
      expect(f.cellType[c]).toBe(CellType.PHOTO);
      expect(f.organismId[c]).toBe(org);
    }
    // The base is still anchored and unmoved.
    expect(f.anchored[base]).toBe(1);
    expect(f.posX[base]).toBe(1000);
    expect(f.posY[base]).toBe(1000);

    // The victim and every cell above it became free MEAT (organismId 0).
    for (const c of above) {
      expect(f.cellType[c]).toBe(CellType.MEAT);
      expect(f.organismId[c]).toBe(0);
      expect(f.anchored[c]).toBe(0); // freed debris can't re-root
    }

    // Plant cell count dropped by exactly the freed segment; MEAT grew by the same amount.
    expect(plantCellCount(w, org)).toBe(stub.length);
    const meatAfter = (() => {
      let c = 0;
      for (let i = 0; i < w.cells.highWaterMark; i++) {
        if (w.cells.isAlive(i) && f.cellType[i] === CellType.MEAT) c++;
      }
      return c;
    })();
    expect(meatAfter - meatBefore).toBe(above.length);

    // Regrowth: with light still flooded the stub regrows from its new most-distal cell back toward
    // the cap. Give the base energy to grow and run more ticks.
    f.energy[base] = 50;
    const afterSever = plantCellCount(w, org);
    growToMax(w);
    expect(plantCellCount(w, org)).toBeGreaterThan(afterSever);
    expect(plantCellCount(w, org)).toBe(w.config.plantMaxChain);
  });
});
