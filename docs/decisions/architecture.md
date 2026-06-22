# Architecture Decisions

Full rationale: `docs/superpowers/specs/2026-06-15-life-sim-design.md` (§3, §5).

### [APPROVED] Data-oriented SoA ("ECS-lite") for the cell store
**Date:** 2026-06-15
**Context:** Need to hold 100k–1M cells with per-tick physics + neural updates, shareable across Web Workers.
**Decision:** Cells are array indices; each property is a parallel typed array backed by SharedArrayBuffer. Free-list + generational ids for recycling. No per-cell objects, no ECS framework.
**Alternatives considered:** OOP (one object per cell) — dead at scale (GC, cache misses, objects can't live in SharedArrayBuffer). Full ECS library (bitecs etc.) — needless dependency/paradigm churn for a long-form project; gives little beyond hand-rolled SoA.
---

### [APPROVED] Custom particle physics solver
**Date:** 2026-06-15
**Context:** Cells interact via soft repulsion, spring bonds, drag, and thrust at 100k+ scale.
**Decision:** Write a small custom solver (gather-formulation forces over a uniform spatial hash, semi-implicit near-overdamped Euler).
**Alternatives considered:** matter.js / planck.js (Box2D) / rapier — rigid-body engines built for hundreds of bodies; model the wrong abstraction (rigid polygons, not force-field cells) and choke at scale.
---

### [APPROVED] Pure headless `core/`; parallelism deferred to M8
**Date:** 2026-06-15
**Context:** Long-form maintainability + testability vs. the need for eventual massive scale.
**Decision:** `core/` is pure (no DOM/Worker deps), single-threaded by default, and is the test oracle. SoA arrays are SharedArrayBuffer-backed from day one so the M8 Worker port (gather formulation, no cross-thread writes on the hot path) is mechanical, not a rewrite. Boundary enforced via architecture.json.
**Alternatives considered:** Parallelising early — kills debuggability/TDD velocity for premature performance.
---

### [APPROVED] Environmental features pass 1 — walls + flow field + environment sensing
**Date:** 2026-06-22
**Context:** Add spatial structure to the featureless toroidal plane so emergent niches (hiding, ambush, flow-riding) can arise. Full design: `docs/superpowers/specs/2026-06-22-environmental-features-design.md`.
**Decision:** Ship indestructible walls + a vector flow field + neural environment sensing this pass. Walls: Voronoi biome regions each carved by a different generator (noise caves / cellular automata / rooms+corridors) composited toroidally, ~35% default density, region-dependent pocket erosion, with a flood-fill connectivity guarantee so the world can't seal into a corpse. Walls dam food (no-flux diffuse + advect), occlude vision (LOS raycast), block movement (slide-collision in `integrate`). Flow = divergence-free streamfunction current → conservative donor-cell advection of biomass + an off-by-default size-scaled creature push. KEY CHOICES: (D9) the wall grid is DECOUPLED from the food grid and high-resolution (≈512²/16u) for fine nooks, with a derived coarse `foodBlocked` mask for damming and a derived `prox` distance field for sensing; (D10) every brain gains evolvable + learnable wall-sense (prox gradient) and flow-sense (local flow vector) inputs so predators/prey discover terrain/current strategies. Determinism: wall+flow generation use a standalone `config.seed`-derived hash (zero organism-RNG-stream impact); new brain-gene draws are gated on seed-time feature flags so the all-off state stays byte-identical (the ablation gate); static walls/flow are not hashed.
**Alternatives considered:** Destructible/passable (toll/HP) walls — DEFERRED to a later phase (owner). One shared food-resolution lattice for walls (rev-1 default) — REJECTED in favour of a decoupled high-res wall grid for finer nooks. Physics-only niches with no neural wall/flow inputs (rev-1 default) — REJECTED; sensing is in scope so the behaviors are evolved strategies, not passive drift. Particle-based food (would move entities) — N/A, food is a scalar field so the current advects the biomass scalar.
---
