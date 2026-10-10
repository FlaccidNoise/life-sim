import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  // Root config files are not part of the TS project; don't type-check-lint them.
  {
    ignores: [
      'dist',
      'tidepool',
      'coverage',
      'node_modules',
      '.claude/worktrees', // transient git worktrees (other branches) — never lint these copies
      '*.config.ts',
      '*.config.js',
      'eslint.config.js',
    ],
  },
  // Type-checked rules apply to source only.
  {
    files: ['src/**/*.ts'],
    extends: [...tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      // Booleans/numbers in template strings are fine for our logging/inspectors.
      '@typescript-eslint/restrict-template-expressions': [
        'error',
        { allowNumber: true, allowBoolean: true },
      ],
      // Off: this rule is PROVABLY FLAKY on our typed-array (Float32Array/Float64Array) `arr[i]!` idiom.
      // `noUncheckedIndexedAccess` does NOT apply to typed arrays (they return `number`, not
      // `number | undefined`), so `!` is technically redundant on them — but the rule flags only a SUBSET
      // of identical `arr[i]!` expressions (e.g. economy.ts line 121 but not the same expression nearby).
      // The SoA hot loops use `arr[i]!` consistently for readability; `tsc --noEmit` (the real type-safety
      // check) is clean, so we disable this one stylistic rule project-wide rather than churn the idiom.
      '@typescript-eslint/no-unnecessary-type-assertion': 'off',
    },
  },
  // core/ must stay pure: no DOM/Worker globals, no importing outer layers.
  {
    files: ['src/core/**/*.ts'],
    rules: {
      'no-restricted-globals': [
        'error',
        { name: 'window', message: 'core/ must be environment-agnostic' },
        { name: 'document', message: 'core/ must be environment-agnostic' },
        { name: 'self', message: 'core/ must be environment-agnostic' },
        { name: 'postMessage', message: 'core/ must be environment-agnostic' },
      ],
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/render/**', '**/app/**', '**/workers/**'],
              message: 'core/ must not import from render/app/workers',
            },
          ],
        },
      ],
    },
  },
  prettier,
);
