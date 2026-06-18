import { describe, it, expect } from 'vitest';
import { World } from './core/sim/world';
import { defaultConfig } from './core/sim/config';

// Tier-7 visual smoke (spec §6): a gross-regression guard on the COMMITTED default
// economy. M2 is the first milestone where the population can collapse to zero,
// pin at the quota, or lose a trophic level (the §10 R1 monoculture failure mode).
// This codifies the manual "does it breathe" eyeball as an automated assertion.
describe('tier-7 visual smoke — the default economy breathes', () => {
  it('keeps a living, diverse population after 300 ticks on the committed defaults', () => {
    const cfg = defaultConfig({ seed: 1, maxCells: 60_000 });
    const w = new World(cfg, false);
    w.seedLife(20_000);
    for (let i = 0; i < 300; i++) w.tick();

    expect(w.cells.aliveCount).toBeGreaterThan(0); // not extinct
    expect(w.cells.aliveCount).toBeLessThan(cfg.maxCells); // not pinned at the quota
    expect(w.metrics.diversity).toBeGreaterThan(0); // both trophic levels survive (anti-monoculture)
  }, 30000); // heavy: 300 ticks @ 60k cells. Generous timeout for parallel-suite CPU contention
  // (the reproducibility forager runs use the same 30s allowance). Assertions unchanged.
});
