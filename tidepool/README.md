# Tidepool

A free browser game. You are one small organism in a tall column of water. Every other organism is
driven by its own evolved neural network. You steer, eat, flee, and choose mates. When you die, the
world runs forward many generations, and you continue as a descendant in a world that evolved without
you. You can leave your body at any time and watch or change the whole simulation.

It is a ground-up rebuild of the simulation in the repo root.

**Status:** planned, not built. Start at `docs/plans/2026-10-10-m0-m1-first-swim.md`.

| Document | What it holds |
|---|---|
| `docs/design.md` | The game: pillars, loop, creature, brain, world, risks |
| `docs/architecture.md` | Stack, budgets, layout, rules, who builds what |
| `docs/roadmap.md` | Milestones M0 to M8, each ending in something playable |
| `docs/plans/` | The task-level plan for the current milestone |
| `docs/decisions/INDEX.md` | Decisions and their reasons |
| `docs/research/` | Draft inventory, technical feasibility, prior art, kernel benchmark |
| `spikes/kernel-bench/` | The benchmark that chose Rust and WebAssembly for the core |

Stack: a Rust simulation core compiled to WebAssembly in a worker, a TypeScript page with WebGL2 and
Preact, and a native headless runner for gates and probes.
