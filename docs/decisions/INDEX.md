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
- 2026-06-16: M2 trophic scope = full food web (PHOTO/DIGESTIVE/MEAT); digestive cells feed passively (no movement pre-M3) → [../superpowers/plans/2026-06-16-m2-metabolism.md](../superpowers/plans/2026-06-16-m2-metabolism.md)
- 2026-06-16: M2 reproduction = per-cell clone division, 50/50 energy split, organismId stays 0 (interim; organism-level maternal provisioning per spec §4.5 deferred to M5/M6) → [../superpowers/plans/2026-06-16-m2-metabolism.md](../superpowers/plans/2026-06-16-m2-metabolism.md)
- 2026-06-16: M4 brain = neuron-cell recurrent network, THINK at tick step 3, double-buffered `a_j(t)=tanh(bias+Σ w·a(t−1))`; snapshotted synapse pool with gen-validated (not bit-packed) endpoints → [../superpowers/plans/2026-06-16-m4-neural.md](../superpowers/plans/2026-06-16-m4-neural.md)
- 2026-06-16: M4 palette extended SENSOR/NEURON/MOVER (no renumber); neural cells exempt from lifecycle death+division so the hand-wired topology is immutable for the run (M5 organism lifecycle supersedes) → [../superpowers/plans/2026-06-16-m4-neural.md](../superpowers/plans/2026-06-16-m4-neural.md)
- 2026-06-16: M4 critter cohesion = INTERIM kinematic rigid grouping (passengers snapped to a body-frame offset each tick, no springs); M5 bonds replace it. M4 needs no bond dynamics (spec §8 M4) → [../superpowers/plans/2026-06-16-m4-neural.md](../superpowers/plans/2026-06-16-m4-neural.md)
