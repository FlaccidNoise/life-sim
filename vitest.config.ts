import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    // SLOW INTEGRATION TESTS live in three files that each run the full 8192² demo world for thousands of
    // ticks (world.test.ts determinism contract, world.phero.test.ts scent, harness.test.ts headless runs).
    // They account for ~96% of suite runtime (>120s combined; everything else is ≤13s). Excluded from the
    // DEFAULT `pnpm test` so everyday iteration is fast; run them explicitly via `pnpm test:slow` or
    // `pnpm test:all`. Passing a file path on the CLI bypasses this exclude, so the slow scripts still work.
    exclude: [
      'src/core/world.test.ts',
      'src/core/world.phero.test.ts',
      'src/headless/harness.test.ts',
    ],
    pool: 'forks',
    // Some sanity tests run the full 8192² demo world for thousands of ticks (multi-second). These are
    // legit integration checks at demo scale, so allow well over the 5s default — and generously, since the
    // hidden-layer brain (slice E) adds ~31% per-tick compute and CI runs files in parallel (CPU contention).
    testTimeout: 120000,
    // The zero-allocation test needs global.gc; we pass --expose-gc via the
    // NODE_OPTIONS env in the package.json "test" script (Vitest 4 removed poolOptions,
    // and forked workers inherit NODE_OPTIONS).
  },
});
