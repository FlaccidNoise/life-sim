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

### [APPROVED] New features ship ON by default; determinism is the only invariant (off-by-default ablation gate retired)
**Date:** 2026-06-23
**Context:** Features had been shipping OFF-by-default behind a byte-identical-when-off "ablation gate" (a frozen golden hash asserting the default world matched the pre-feature engine — `world.test.ts:17`, `a32e9375`). This directly fights the evolution-playground direction (feel-first: watch the latest behaviour live) and made new work invisible until manually toggled — senses shipped OFF and were never used (census 0). Owner directive (2026-06-23): visibility-by-default, with determinism kept.
**Decision:**
- **The only invariant is determinism:** for any given `(config, seed)` the sim is byte-identical reproducible run-to-run (`world.test.ts:7`). This stays sacred — it is independent of what the defaults are.
- **New features ship ON by default** (flag defaults to `true` in `defaultConfig`) so the live demo always shows the latest behaviour.
- **Feature flags are KEPT** — every feature stays individually toggleable so it can be ablated/bisected when debugging; only the *default* flips.
- **RETIRED:** the frozen "default config matches the pre-feature engine" golden hash (`world.test.ts:17`) and the obligation to keep a new feature byte-identical-when-off (the tail-gated RNG draw-skip gymnastics in `genome.ts`). A new feature need only be deterministic given `(config, seed)` — no draw-skip, no golden-hash dance. This is a real simplification of new-feature work.
- **Replacement guardrail:** a headless liveness check (the world stays alive / non-degenerate at N ticks, per the playground pivot) so on-by-default cannot silently ship a dead world — this covers the safety role the ablation gate used to play.
- **Scope:** this is the rule for NEW features going forward. Existing OFF features are NOT blanket-flipped — several are mutually exclusive (`foodChannels` 1/2/3; sessile vs drifting plants) or known-destabilizing (the 8192² collapse). Turning any existing feature on is a deliberate, per-feature step that verifies the world survives.
**Supersedes:** the OFF-by-default "ablation gate" convention (the env-features entry in `architecture.md`; the OFF-by-default framing of the 2026-06-22 diversity/predation decisions — those remain accurate *records* of current code state, but are no longer the go-forward rule). Aligns with the 2026-06-20 evolution-playground pivot.
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

### [APPROVED] Diversity-tuning pass — 3rd food channel + wider gene ranges/mutation + food-density spread
**Date:** 2026-06-29
**Context:** Owner asked what could be tuned (no new features) to add more variability. Distinguished genotype-space width (gene ranges/mutation) from realized diversity (ecology must support coexistence or selection re-collapses to monoculture).
**Decision:** Demo batch (all live-tunable in Knobs panel): `foodChannels` 2→3 for a third diet niche (required dropping `foodChannelAWallTied`→false — the wall-tie split is binary near-wall/open-water and would starve channel C of pockets); raise railed caps `METAB_EFF` 2.0→2.5 and `VISION_RANGE` 384→1152; make the tripled vision REAL by raising the scan cap `MAX_VISION_CELLS` 24→96 (else 1152 is shadowed) + lowering demo `visionRangeCost` 0.002→0.0006 so the range gets used; widen standing variation via `mutationSigma` 0.05→0.08 and `hueMutationSigma` 0.02→0.04; sharpen specialists with `forageGeneralistFloor` 0.85→0.7; fix "all patches maxed out" food density via `foodMaxFertility` 3→5 + `foodPatchRichnessVar` 0.5→0.8 (uncaps the clip so per-pocket depth varies). NOT touched: `founderSigma` (floods founding pool with unfit extremes past ~0.3 → births crash). 456 tests pass. UNVALIDATED at the 20k-tick / multi-seed scale — a live experiment, not a swept result.
**Alternatives considered:** `founderSigma` (rejected — births collapse); vision gene range alone (rejected — no-op, `MAX_VISION_CELLS` shadows it); middle-ground vision (cap 48 / ~2× reach) deferred in favor of owner's full-3× request (accept ~15× per-creature scan cost, gated by `visionRangeCost`).
---
