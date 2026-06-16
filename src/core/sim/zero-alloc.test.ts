import { describe, it, expect } from 'vitest';
import { World } from './world';
import { defaultConfig } from './config';
import { CellType } from '../cells/types';
import { spawnSwimmer } from './critter';

// Requires --expose-gc (passed via NODE_OPTIONS in the package.json "test" script).
const gc = (globalThis as { gc?: () => void }).gc;

describe('zero-allocation hot loop', () => {
  it('does not grow the heap while ticking in steady state', () => {
    if (!gc) throw new Error('run vitest with --expose-gc (set NODE_OPTIONS in the test script)');

    // Explicit large world: 50k cells would over-pack the default 2048² M2 world;
    // a 4096² world keeps them at ~M1 density while still exercising the full M2
    // tick path (metabolize + lifecycle + division/recycle + light) at scale.
    // Headroom for all populations: 48_000 PHOTO + 2_000 MOTILE + 20×7 critter cells
    // + 200×4 bonded digestive cluster cells = 50_940 < 52_500 cap.
    const w = new World(
      defaultConfig({ seed: 7, maxCells: 52_500, worldWidth: 4096, worldHeight: 4096 }),
      false,
    );
    // Spawn the swimmers FIRST so ordering can't starve them; assert every spawn succeeds.
    for (let k = 0; k < 20; k++) spawnSwimmer(w, 100 + k * 50, 100, 0); // 140 neural cells
    // M5: many small bonded clusters → exercise bond forces / transfer / digest-bonus / aggregate.
    const f = w.cells.fields;
    for (let cl = 0; cl < 200; cl++) {
      const org = w.organisms.alloc();
      const prev = { i: -1, gen: 0 };
      for (let kk = 0; kk < 4; kk++) {
        const i = w.cells.alloc();
        expect(i).toBeGreaterThanOrEqual(0);
        f.posX[i] = 50 + cl * 9 + kk * 3;
        f.posY[i] = 1500;
        f.radius[i] = w.config.cellRadius;
        f.mass[i] = 1;
        f.energy[i] = 150;
        f.cellType[i] = CellType.DIGESTIVE;
        f.organismId[i] = org;
        if (prev.i >= 0) w.bonds.addBond(prev.i, prev.gen, i, f.generation[i]!, 3, 1);
        prev.i = i;
        prev.gen = f.generation[i]!;
      }
    }
    w.bonds.rebuildLive(w.cells);
    expect(w.spawn(48_000)).toBe(48_000);
    expect(w.spawn(2_000, CellType.MOTILE)).toBe(2_000); // exercise SENSE/ACT/thrust/food deposit

    for (let i = 0; i < 50; i++) w.tick(); // warm up JIT
    gc();
    const before = process.memoryUsage().heapUsed;

    for (let i = 0; i < 500; i++) w.tick();
    gc();
    const after = process.memoryUsage().heapUsed;

    const growthKb = (after - before) / 1024;
    expect(growthKb).toBeLessThan(512); // generous margin; tick() allocates nothing

    // The bond/organism paths must actually run in the measured window.
    expect(w.bonds.liveBondCount).toBeGreaterThan(0);
    let anyOrg = false;
    for (let org = 1; org < w.organisms.maxOrganisms && !anyOrg; org++) {
      if (w.organisms.cellCount[org]! > 0) anyOrg = true;
    }
    expect(anyOrg).toBe(true);

    // The food path must actually run: with edible cells seeded, the smell field is
    // non-zero somewhere. Guards against a regression that no-ops the deposit.
    expect(w.food.field.some((v) => v > 0)).toBe(true);

    // The neural path must actually run: live synapses present + non-zero activations.
    expect(w.net.liveSynapseCount).toBeGreaterThan(0);
    expect(w.net.actCur.some((v) => v !== 0)).toBe(true);
  }, 30_000); // 50k cells × 550 ticks through the full M3 path exceeds vitest's 5s default
});
