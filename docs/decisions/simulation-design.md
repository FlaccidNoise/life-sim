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

### [REJECTED] Pocket geometry / world size as a predation lever
**Date:** 2026-06-22
**Context:** Reviving the dead trophic axis (grazer monoculture; predEncounter≈0). Investigated via 4 multi-seed sweeps (`src/headless/diversity-sweep.ts` + `fixb-stability.ts`).
**Reason:** Predation is an ECONOMIC problem, not a spatial one. Tightening pockets BACKFIRES (less fertile area → pop crashes → survivors spread thinner → prey NND *rises* 60→77u). A bigger world is cosmetic for diversity (more creatures, identical flatness). Even the small-world "fix B" density yields only a thin, seed-fragile predator split (predEncounter <0.09 = graze-fallback omnivores, not hunters; collapses on 1/3 seeds by 10k). A bite barely pays, so no geometry makes carnivory worth it — the lever is the encounter economy (bite range/reward/cost), pursued separately.
---

### [APPROVED] Heterogeneous sticky pockets = the diversity foundation (SP1)
**Date:** 2026-06-22
**Context:** "Living aquarium" brainstorm — make pockets environmentally different (owner chose random per-pocket dials + a resident/wanderer mix) so creatures evolve distinct per-place behaviours.
**Decision:** Build per-pocket scaled richness as the diversity keystone — `foodPatchRichness`/`foodPatchRichnessVar`/`foodMaxFertility` make some pockets deep "predator-haven" reservoirs and others shallow "grazer-refuge" (prototype exists, OFF-by-default, determinism-verified) — plus a `deadWaterCost` isolation knob so local adaptation sticks instead of washing out (the leaky-archipelago hedge). Two OFF-by-default increments; the between-pocket divergence payoff is MEASURED during the build, not assumed.
**Alternatives considered:** Biome archetypes / climate gradient (owner picked random dials); tightening/world-size for density (rejected — see above). Predation split to a separate economic track.
**Spec:** docs/superpowers/specs/2026-06-22-heterogeneous-pockets-design.md
---

### [APPROVED] Ship predation as an OFF-by-default bundle; accept the engine's hollow-hunting ceiling
**Date:** 2026-06-22
**Context:** Exhaustive multi-seed predation investigation (`diversity-sweep.ts` / `fixb-stability.ts`) — density, economy, and founding all characterized.
**Decision:** Ship founding-protection (`predatorSeedClusters`, commit 3cb1ba3) + the combo-mild economy (`herbivoryExp` 1.0 / `predationGain` 3 / `biteRange` 24) as OFF-by-default knobs (now UI sliders). Accept that this engine's predation is intrinsically low-contact (predEnc never >0.06, hollows out): durable predator/prey COEXISTENCE is reachable but vigorous sustained HUNTING is not without a predation-contact/economy rewrite. Stop predation tuning; pivot to making the diversity aquarium visible/tunable. Detail in the `predation-engine-ceiling` memory.
**Alternatives considered:** density/geometry (dead — NND a red herring); economy-alone (amplifies the founding lottery, can't create predators, overtunes to a cap-pegged shark takeover); more founding tuning (diminishing returns — the hollow-out is engine-deep).
---
