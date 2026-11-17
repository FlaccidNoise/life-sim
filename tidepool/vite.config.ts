import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

export default defineConfig({
  // Relative asset addresses: the build runs from any sub-path.
  base: './',
  plugins: [preact()],
  worker: { format: 'es' },
});
