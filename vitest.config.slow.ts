import { defineConfig } from 'vitest/config';

// Runs ONLY the slow integration files (world.test.ts, world.phero.test.ts, harness.test.ts)
// that the default vitest.config.ts excludes. Use via `pnpm test:slow` (or `make test:slow`).
// The default config's exclude would filter out files passed on the CLI, so this dedicated config
// includes only the three slow files with no exclude.
export default defineConfig({
  // These files run the full demo world and contend heavily when parallelized.
  // Keep the focused slow-suite command deterministic on loaded machines too.
  fileParallelism: false,
  test: {
    include: [
      'src/core/world.test.ts',
      'src/core/world.phero.test.ts',
      'src/headless/harness.test.ts',
    ],
    pool: 'forks',
    testTimeout: 300000,
  },
});
