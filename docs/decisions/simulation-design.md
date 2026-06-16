# Simulation Design Decisions

Full rationale: `docs/superpowers/specs/2026-06-15-life-sim-design.md` (§4).

### [APPROVED] Curated cell palette → emergent bodies & behaviour
**Date:** 2026-06-15
**Context:** "All emergent from per-cell rules" spans a spectrum from curated capabilities to fully emergent low-level chemistry.
**Decision:** Define a fixed palette of cell capabilities (structural, photosynthetic, digestive, sensor, neuron, mover, reproductive). Evolution + neural nets compose them; morphology, strategy, and specialisation-usage emerge.
**Alternatives considered:** Fully emergent gene-regulatory/chemistry model — research-grade, high risk of long dead periods; deferred to M9+ ("deepen later").
---

### [APPROVED] Neuron-cells wire into an evolvable recurrent network
**Date:** 2026-06-15
**Context:** Where the "brain" lives.
**Decision:** Neuron-type cells form a directed weighted recurrent network via synapses (sensor→neuron→mover). The nervous system is part of the visible, evolving morphology; one propagation step per tick (memory/oscillators).
**Alternatives considered:** Per-organism centralized net (proven but less on-theme); per-cell tiny NNs with no central brain (maximally emergent but hard to evolve coherently).
---

### [APPROVED] Developmental genome (seed cell + division program)
**Date:** 2026-06-15
**Context:** How body plans are encoded so morphology can genuinely evolve.
**Decision:** Genome = a generative recipe (cell genes + division rules). Organisms grow from one seed cell; recursive rules yield repetition/symmetry. Asexual reproduction first.
**Alternatives considered:** Direct encoding (lists cells/bonds) — simple but limited evolvability. Gene-regulatory network — deepest realism, highest risk; deferred to M9+.
---

### [APPROVED] No live-run determinism; RNG seedable for tests
**Date:** 2026-06-15
**Context:** Reproducibility vs. embracing emergent randomness; impact on testability and parallelism.
**Decision:** Live runs are non-deterministic (free to parallelize without preserving float-order). RNG is seedable everywhere, so pure functions are unit-tested deterministically and whole-sim behaviour is tested via statistical invariants.
---
