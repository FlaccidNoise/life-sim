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
