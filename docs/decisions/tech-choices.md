# Tech Choices

Full rationale: `docs/superpowers/specs/2026-06-15-life-sim-design.md` (§3, §7).

### [APPROVED] TypeScript (strict) as the implementation language
**Date:** 2026-06-15
**Context:** User wants type-strict, self-safety-enforcing, AND as-performant-as-possible AND easiest-for-them — partially conflicting constraints.
**Decision:** TypeScript with strict settings. The user maintains/debugs the project long-term and is fluent in TS; debuggability + maintainability dominate for a long-form personal project. Massive-scale perf is recovered via Workers + SharedArrayBuffer (D3), not a native language.
**Alternatives considered:** Rust — better raw perf + memory safety ("self-safety enforcing") and arguably the better technical fit for the stated perf/safety goals, but slower iteration for both parties and harder for the user to debug/maintain solo. Explicitly chosen against, eyes open.
---

### [APPROVED] WebGL2 instanced rendering
**Date:** 2026-06-15
**Context:** Must draw up to ~1M cells.
**Decision:** WebGL2 instanced points/quads — one draw call renders 1M points; GPU does the work; mature and universal.
**Alternatives considered:** Canvas2D — caps ~5–10k sprites. WebGPU — unneeded for *drawing*; reserved as a far-future option if compute ever moves to GPU.
---

### [APPROVED] Vite + Vitest + ESLint + Prettier + pnpm + beads + Makefile
**Date:** 2026-06-15
**Context:** Long-form project needs strong, low-friction tooling and issue tracking.
**Decision:** Vite (dev/build, native Worker support), Vitest (tests), typescript-eslint type-checked + Prettier, pnpm via corepack, beads for git-native issues, GitHub Actions CI, Makefile as the canonical command interface, architecture-guard for module boundaries.
---
