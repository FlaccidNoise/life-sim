import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    pool: 'forks',
    // Some sanity tests run the full 8192² demo world for thousands of ticks (multi-second). These are
    // legit integration checks at demo scale, so allow more than the 5s default.
    testTimeout: 20000,
    // The zero-allocation test needs global.gc; we pass --expose-gc via the
    // NODE_OPTIONS env in the package.json "test" script (Vitest 4 removed poolOptions,
    // and forked workers inherit NODE_OPTIONS).
  },
});
