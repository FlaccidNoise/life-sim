import { defineConfig } from 'vitest/config';

// Runs EVERY test file including the slow integration suites (world.test.ts,
// world.phero.test.ts, harness.test.ts) that the default vitest.config.ts excludes.
// Use via `pnpm test:all` (or `make test:all`). Slow (>120s); run before push, not on every change.
export default defineConfig({
  // Slow integration files contend for CPU when Vitest runs them in parallel.
  // Serialise files so loaded CI workers fail on real regressions, not timing.
  fileParallelism: false,
  test: {
    include: ['src/**/*.test.ts'],
    pool: 'forks',
    testTimeout: 300000,
  },
});
