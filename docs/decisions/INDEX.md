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
- 2026-06-16: M5 bonds = flat SoA bond pool + per-cell fixed-degree adjacency + explicit degree cap (§5.2); gen-validated endpoints in SEPARATE arrays (not bit-packed, §4.2). `core/organism/` module; bond-spring forces use SCATTER (explicit edge list, Newton's 3rd) → [../superpowers/plans/2026-06-16-m5-multicellularity.md](../superpowers/plans/2026-06-16-m5-multicellularity.md)
- 2026-06-16: M5 split-on-break = dual-frontier BFS bounded by the smaller component, relabel smaller side with a fresh organismId (§4.8); organism aggregates (energy/count/centroid) RECOMPUTED each tick (O(live), exact) — incremental O(smaller-side) partition deferred to M7/M8 → [../superpowers/plans/2026-06-16-m5-multicellularity.md](../superpowers/plans/2026-06-16-m5-multicellularity.md)
- 2026-06-16: M5 energy transfer = gradient diffusion along bonds toward the needier endpoint (rate × efficiency<1), load-bearing per §4.5 → [../superpowers/plans/2026-06-16-m5-multicellularity.md](../superpowers/plans/2026-06-16-m5-multicellularity.md)
- 2026-06-16: M5 multicellular payoff (§4.5/§10 R1) = DIGESTION CLUSTERING — digestionGain ×= 1 + digestClusterBonus·(bonded DIGESTIVE neighbours); bonded clusters out-harvest lone cells (2.13× in the isolated test). Predation-refuge / faster-locomotion payoffs deferred → [../superpowers/plans/2026-06-16-m5-multicellularity.md](../superpowers/plans/2026-06-16-m5-multicellularity.md)
- 2026-06-16: M5 critter FOLDED into bonds (kinematic rigid grouping `repositionPassengers`/rigid table DELETED); brain still drives the MOVER; organism orientation = MOVER heading propagated to SENSORs. Bond formation = hand-built; genome-gated adhesion-on-contact deferred to M6 (adhesion force present, default off) → [../superpowers/plans/2026-06-16-m5-multicellularity.md](../superpowers/plans/2026-06-16-m5-multicellularity.md)
- 2026-06-16: M5 organism cells (organismId != 0) exempt from lifecycle death + division (generalises the M4 neural exemption); M6 owns organism-level reproduction + death cascade + death-driven bond reaping → [../superpowers/plans/2026-06-16-m5-multicellularity.md](../superpowers/plans/2026-06-16-m5-multicellularity.md)
- 2026-06-16: M5 bondStiffness default 1.5 — the bond spring's k_eff = bondStiffness·perBondStiffness; symplectic-Euler two-free-mass stability ceiling ≈3 (config.test gates ≤2.5). k=8 diverges to ~1e162 (audit blocker). Rigidity comes from bracing + low strain, NOT large k → [../superpowers/plans/2026-06-16-m5-multicellularity.md](../superpowers/plans/2026-06-16-m5-multicellularity.md)
- 2026-06-16: M5 critter cohesion (post-merge hardening) = HEAVIER cells (mass 2 vs ecosystem mass 1) + front↔back cross-body bonds. The soft body fragmented in the dense ecosystem (repulsion fling spiked strain to the break threshold); mass 2 halves the fling (peak strain 0.42<1.0). Found empirically via `headless/cohesion-probe.ts` (config tuning capped at ~3/6 and hurt locomotion) → [../superpowers/plans/2026-06-16-m5-multicellularity.md](../superpowers/plans/2026-06-16-m5-multicellularity.md)
