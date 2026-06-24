import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
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
