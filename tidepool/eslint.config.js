import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

const layer = (files, forbidden) => ({
  files: [files],
  rules: {
    'no-restricted-imports': [
      'error',
      {
        patterns: [
          { group: forbidden, message: 'Dependency rule: see docs/architecture.md section 4' },
        ],
      },
    ],
  },
});

export default tseslint.config(
  {
    ignores: [
      'dist',
      'target',
      'node_modules',
      'spikes',
      'src/wasm',
      '*.config.ts',
      'eslint.config.js',
    ],
  },
  {
    files: ['src/**/*.{ts,tsx}', 'tests/**/*.ts'],
    extends: [...tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      '@typescript-eslint/restrict-template-expressions': [
        'error',
        { allowNumber: true, allowBoolean: true },
      ],
      'no-console': 'error',
    },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'ImportExpression',
          message:
            'No dynamic import() in src: the dependency rule cannot check it. See docs/architecture.md section 4',
        },
      ],
    },
  },
  layer('src/*.ts', ['**/worker/**', '**/render/**', '**/ui/**', '**/app/**']),
  layer('src/render/**/*.{ts,tsx}', ['**/worker/**', '**/ui/**', '**/app/**']),
  layer('src/ui/**/*.{ts,tsx}', ['**/worker/**', '**/render/**', '**/app/**']),
  layer('src/worker/**/*.{ts,tsx}', ['**/render/**', '**/ui/**', '**/app/**']),
  prettier,
);
