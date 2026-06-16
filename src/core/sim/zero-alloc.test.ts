import { describe, it, expect } from 'vitest';
import { World } from './world';
import { defaultConfig } from './config';

// Requires --expose-gc (passed via NODE_OPTIONS in the package.json "test" script).
const gc = (globalThis as { gc?: () => void }).gc;

describe('zero-allocation hot loop', () => {
  it('does not grow the heap while ticking in steady state', () => {
    if (!gc) throw new Error('run vitest with --expose-gc (set NODE_OPTIONS in the test script)');

    const w = new World(defaultConfig({ seed: 7, maxCells: 50_000 }), false);
    w.spawn(50_000);

    for (let i = 0; i < 50; i++) w.tick(); // warm up JIT
    gc();
    const before = process.memoryUsage().heapUsed;

    for (let i = 0; i < 500; i++) w.tick();
    gc();
    const after = process.memoryUsage().heapUsed;

    const growthKb = (after - before) / 1024;
    expect(growthKb).toBeLessThan(512); // generous margin; tick() allocates nothing
  });
});
