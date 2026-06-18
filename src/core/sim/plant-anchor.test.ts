import { describe, it, expect } from 'vitest';
import { World } from './world';
import { defaultConfig, type Config } from './config';
import { CellType } from '../cells/types';

/**
 * Anchoring physics + base death for the sessile chain-plant model.
 *
 * Mirrors golden-bond.test.ts: freeze the economy (no metabolism / transfer / division / repulsion
 * unless the case wants it) so the ONLY thing each tick exercises is the mechanic under test. Plants
 * are seeded via the real World.seedPlantBase helper and bonds via the real BondNetwork API; nothing
 * is mocked.
 */
function anchorWorld(over: Partial<Config> = {}): World {
  return new World(
    defaultConfig({
      seed: 7,
      maxCells: 64,
      worldWidth: 800,
      worldHeight: 800,
      sessilePlants: true,
      cellRadius: 6,
      dt: 1,
      damping: 0.5,
      // freeze the energy economy so nothing dies/grows/diffuses mid-test
      photoGain: 0,
      basalCost: 0,
      neuralCost: 0,
      moveCost: 0,
      transferRate: 0,
      divideThreshold: 1e9,
      // keep growth + spores off so the plant body is exactly what the test builds
      plantGrowthThreshold: 1e9,
      plantSporeThreshold: 1e9,
      bondStiffness: 1.5, // PINNED (mirrors golden-bond): a mechanics test freezes its spring constant
      ...over,
    }),
    false,
  );
}

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

describe('sessile plant — anchoring physics', () => {
  it('an anchored base stays put under a stretched bond pull while the chain cell swings toward it', () => {
    const w = anchorWorld();
    const f = w.cells.fields;

    const base = w.seedPlantBase(400, 400, 1e6);
    const org = f.organismId[base]!;
    expect(f.anchored[base]).toBe(1);

    // A chain cell bonded to the base but placed far past restLen → the spring strongly pulls it
    // toward the base. organismId = the plant so it stays lifecycle-exempt; anchored=0 so it moves.
    const chain = w.cells.alloc();
    f.posX[chain] = 460; // 60 from the base, restLen 20 → heavily stretched
    f.posY[chain] = 400;
    f.velX[chain] = 0;
    f.velY[chain] = 0;
    f.radius[chain] = w.config.cellRadius;
    f.mass[chain] = 1;
    f.energy[chain] = 1e6;
    f.cellType[chain] = CellType.PHOTO;
    f.organismId[chain] = org;
    f.anchored[chain] = 0;
    w.bonds.addBond(base, f.generation[base]!, chain, f.generation[chain]!, 20, 1);
    w.bonds.rebuildLive(w.cells);

    const baseX0 = f.posX[base]!;
    const baseY0 = f.posY[base]!;
    const d0 = Math.abs(f.posX[chain] - baseX0);

    for (let t = 0; t < 200; t++) w.tick();

    // The base never budged a single ulp despite carrying the full spring load.
    expect(f.posX[base]).toBe(baseX0);
    expect(f.posY[base]).toBe(baseY0);
    expect(f.velX[base]).toBe(0);
    expect(f.velY[base]).toBe(0);
    // The chain cell did move — proving the spring force was real, so the base's stillness is the
    // pin, not an absence of force. It relaxes toward restLen (20) off the fixed base.
    const d1 = Math.abs(f.posX[chain] - f.posX[base]!);
    expect(d1).toBeLessThan(d0);
    expect(d1).toBeCloseTo(20, 0);
  });

  it('an anchored base does not move under repulsion from a cell shoved onto it', () => {
    // repulsion ON this case only; an intruder co-located with the base would, if unpinned, be
    // blasted apart symmetrically. The base must absorb none of that push.
    const w = anchorWorld({ repulsion: 5 });
    const f = w.cells.fields;

    const base = w.seedPlantBase(400, 400, 1e6);
    const baseX0 = f.posX[base]!;
    const baseY0 = f.posY[base]!;

    // A free cell sitting almost exactly on the base → maximal overlap → maximal repulsion force.
    const intruder = w.cells.alloc();
    f.posX[intruder] = 400.01;
    f.posY[intruder] = 400;
    f.velX[intruder] = 0;
    f.velY[intruder] = 0;
    f.radius[intruder] = w.config.cellRadius;
    f.mass[intruder] = 1;
    f.energy[intruder] = 1e6;
    f.cellType[intruder] = CellType.PHOTO;
    f.organismId[intruder] = 0; // free cell; not part of the plant
    f.anchored[intruder] = 0;

    const ix0 = f.posX[intruder];
    for (let t = 0; t < 50; t++) w.tick();

    // Base unmoved; the intruder was pushed off (proving repulsion fired against the base).
    expect(f.posX[base]).toBe(baseX0);
    expect(f.posY[base]).toBe(baseY0);
    expect(f.velX[base]).toBe(0);
    expect(f.velY[base]).toBe(0);
    expect(Math.abs(f.posX[intruder] - ix0)).toBeGreaterThan(0.5);
  });
});

describe('sessile plant — base death', () => {
  it('draining the base to 0 converts the whole remaining chain to MEAT (plant dies)', () => {
    // Build a real multi-cell plant via the growth tick (a richer light economy than anchorCfg),
    // then drain the base and run sever directly: the base is no longer a reachability seed, so the
    // entire remaining chain is unreachable and the whole plant becomes MEAT.
    const w = new World(
      defaultConfig({
        seed: 7,
        maxCells: 500,
        sessilePlants: true,
        plantGrowthThreshold: 5,
        plantGrowthCost: 2,
        plantBondLen: 15,
        plantSporeThreshold: 1e9, // spores off → single founder plant
      }),
      false,
    );
    w.light.light.fill(w.config.lightMax);
    w.light.cap.fill(w.config.lightMax);

    const base = w.seedPlantBase(1000, 1000, 50);
    const org = w.cells.fields.organismId[base]!;
    for (let t = 0; t < 60; t++) {
      w.light.light.fill(w.config.lightMax);
      w.tick();
    }
    const before = plantCellCount(w, org);
    expect(before).toBe(w.config.plantMaxChain); // grew to a full chain

    const f = w.cells.fields;
    const meatBefore = countType(w, CellType.MEAT);
    f.energy[base] = 0;
    w.plants.severEatenChainCells(
      w.cells,
      w.bonds,
      w.liveIndices,
      w.liveCount,
      w.config.meatEnergyOnDeath,
      false,
    );

    // No PHOTO cell of the plant survives — the base and every chain cell are gone.
    expect(plantCellCount(w, org)).toBe(0);
    // The whole body converted to drifting MEAT (one MEAT cell per former plant cell).
    expect(countType(w, CellType.MEAT)).toBe(meatBefore + before);
    // The former base slot is now unanchored, free MEAT (debris can't re-root).
    expect(f.cellType[base]).toBe(CellType.MEAT);
    expect(f.anchored[base]).toBe(0);
    expect(f.organismId[base]).toBe(0);
  });
});
