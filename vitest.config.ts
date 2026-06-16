import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    pool: 'forks',
    // --expose-gc is required by the zero-allocation test (src/core/sim/zero-alloc.test.ts).
    // Vitest 4 moved pool options to top-level (was poolOptions.forks).
    forks: { execArgv: ['--expose-gc'] },
  },
});
