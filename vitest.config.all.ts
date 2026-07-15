import { defineConfig } from 'vitest/config';

// Runs EVERY test file including the slow integration suites (world.test.ts,
// world.phero.test.ts, harness.test.ts) that the default vitest.config.ts excludes.
// Use via `pnpm test:all` (or `make test:all`). Slow (>120s); run before push, not on every change.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    pool: 'forks',
    testTimeout: 120000,
  },
});
