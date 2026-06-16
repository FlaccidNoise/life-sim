import { defineConfig } from 'vite';

// COOP/COEP make the page cross-origin isolated so SharedArrayBuffer is enabled.
const coiHeaders = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
};

export default defineConfig({
  server: { headers: coiHeaders },
  preview: { headers: coiHeaders },
});
