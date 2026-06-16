import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    pool: 'forks',
    // The zero-allocation test needs global.gc; we pass --expose-gc via the
    // NODE_OPTIONS env in the package.json "test" script (Vitest 4 removed poolOptions,
    // and forked workers inherit NODE_OPTIONS).
  },
});
