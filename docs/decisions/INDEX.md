# Decision Log

Significant, hard-to-reverse decisions. Detail lives in the linked topic files;
full design rationale lives in `docs/superpowers/specs/`.

## Architecture
- 2026-06-15: Data-oriented SoA ("ECS-lite") over OOP/ECS-library → [architecture.md](architecture.md)
- 2026-06-15: Custom particle physics over rigid-body engines → [architecture.md](architecture.md)
- 2026-06-15: Pure headless `core/`; Workers + SharedArrayBuffer deferred to M8 → [architecture.md](architecture.md)

## Tech Choices
- 2026-06-15: TypeScript (strict) over Rust → [tech-choices.md](tech-choices.md)
- 2026-06-15: WebGL2 instanced rendering over Canvas2D/WebGPU → [tech-choices.md](tech-choices.md)
- 2026-06-15: Vite + Vitest + ESLint + pnpm + beads + Makefile → [tech-choices.md](tech-choices.md)

## Simulation Design
- 2026-06-15: Curated cell palette → emergent bodies → [simulation-design.md](simulation-design.md)
- 2026-06-15: Neuron-cells wire into an evolvable recurrent network → [simulation-design.md](simulation-design.md)
- 2026-06-15: Developmental (seed cell + division program) genome → [simulation-design.md](simulation-design.md)
- 2026-06-15: No live-run determinism; RNG seedable for tests → [simulation-design.md](simulation-design.md)
