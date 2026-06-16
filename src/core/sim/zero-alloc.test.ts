import { describe, it, expect } from 'vitest';
import { World } from './world';
import { defaultConfig } from './config';
import { CellType } from '../cells/types';

// Requires --expose-gc (passed via NODE_OPTIONS in the package.json "test" script).
const gc = (globalThis as { gc?: () => void }).gc;

describe('zero-allocation hot loop', () => {
  it('does not grow the heap while ticking in steady state', () => {
    if (!gc) throw new Error('run vitest with --expose-gc (set NODE_OPTIONS in the test script)');

    // Explicit large world: 50k cells would over-pack the default 2048² M2 world;
    // a 4096² world keeps them at ~M1 density while still exercising the full M2
    // tick path (metabolize + lifecycle + division/recycle + light) at scale.
    const w = new World(
      defaultConfig({ seed: 7, maxCells: 50_000, worldWidth: 4096, worldHeight: 4096 }),
      false,
    );
    w.spawn(50_000);
    w.spawn(2_000, CellType.MOTILE); // exercise SENSE/ACT/thrust/food deposit in the hot loop

    for (let i = 0; i < 50; i++) w.tick(); // warm up JIT
    gc();
    const before = process.memoryUsage().heapUsed;

    for (let i = 0; i < 500; i++) w.tick();
    gc();
    const after = process.memoryUsage().heapUsed;

    const growthKb = (after - before) / 1024;
    expect(growthKb).toBeLessThan(512); // generous margin; tick() allocates nothing

    // The food path must actually run: with edible cells seeded, the smell field is
    // non-zero somewhere. Guards against a regression that no-ops the deposit.
    expect(w.food.field.some((v) => v > 0)).toBe(true);
  }, 30_000); // 50k cells × 550 ticks through the full M3 path exceeds vitest's 5s default
});
