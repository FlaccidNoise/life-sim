import { defineConfig } from 'vite';

// COOP/COEP make the page cross-origin isolated so SharedArrayBuffer is enabled.
const coiHeaders = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
};

// Nested git worktrees (.worktrees/*, .claude/worktrees/*) are full copies of the project. Vite's
// file watcher would otherwise watch them and crash in a tsconfig/index.html reload loop, so exclude
// them from the dev watcher.
const watchIgnored = ['**/.worktrees/**', '**/.claude/worktrees/**'];

export default defineConfig({
  server: { headers: coiHeaders, watch: { ignored: watchIgnored } },
  preview: { headers: coiHeaders },
});
