# M7 — Evolution Design Spec

**Status:** approved (brainstorming, 2026-06-17) — Section 1 architecture/phasing signed off; build authorized autonomously per recommended design.

**Goal:** Turn on heritable mutation so the forager population *adapts* under pure economic selection, and build the instrumentation to **prove** adaptation happens and **watch** open-ended emergence.

**Built on:** M6 developmental-genome substrate (`core/genome/*`, `core/organism/*`). Seeded from `buildForagerGenome`.

---

## 0. The core insight

The evolution **mechanism already exists** (shipped in M6): all ten mutation operators in `mutate.ts`, every rate as a live `Config` knob + slider, the full plumbing (config → `reproduceOrganisms` → `mutateGenome` via `rng.split(2)`), lineage fields (`parentRef`/`generation`) on every genome, and a genome/lineage inspector. **Nothing evolves only because the rates default to `0`.**

So M7 is **not** "build evolution." It is three things the substrate cannot deliver by flipping a knob:

1. **Proof it adapts** — a falsifiable, headless experiment showing a population *measurably improves* under selection (a named trait shifts toward fit values) vs a mutation-off control.
2. **Observability** — current metrics are phenotype-only and instantaneous; you cannot watch selection happen. Add genotypic diversity, trait-over-time, phylogeny, fitness ranking, speciation.
3. **Tuning against the knife-edge** — find mutation rates that *explore* without collapsing the predator-prey limit cycle into extinction.

## 1. Principles (non-negotiable)

- **Pure economic selection.** Selection is a *consequence* of the economy: a better forager finds more food → crosses `reproThreshold` sooner → more offspring carry its genes. **No fitness function anywhere.** If pure selection is too weak, we tune economy/mutation knobs — we never add a designer-imposed fitness.
- **Determinism preserved.** M6's invariant — byte-identical SoA for a given `(Config, seed)` — must hold with mutation on. Mutation is already deterministic (`rng.split(2)`). *Every* new piece of M7 is **read-only derived state** computed from the deterministic SoA + live genome store, updated only at deterministic points (births, deaths, sample cadence). New stateful structures (lineage log, founder ids, species assignments) are updated in deterministic order and are part of the determinism contract.
- **Zero-alloc hot loop preserved.** All new work runs at **sample cadence** (like `sampleMetrics`), never in the per-tick allocation-free hot loop. Sample-time allocation is fine; structural-event allocation (births/deaths) is fine.
- **YAGNI / tiny increments.** Each task ends with an independently testable deliverable. Phase 0–2 ship first as a complete, *proven* evolving sim before the heavy explorer UI.

## 2. Architecture & phasing

One spec (this doc), **two implementation plans**:

- **Plan A — phases 0–2** (evolution + proof + the core "watch it" telemetry). A complete, demoable, falsifiable milestone.
- **Plan B — phases 3–5** (the rich explorer: champion, phylogeny, menagerie).

| Phase | Deliverable |
|-------|-------------|
| 0 — Foundation | `core/genome/traits.ts`: pure `genomeTraits(g)` + `genomeSignature(g)`; mutation>0 determinism test |
| 1 — Adaptation proof | `headless/evolution-probe.ts` + a fast committed selection test; the falsifiable win |
| 2 — Trait-over-time + genotypic diversity | extend `Metrics` + `TelemetryDashboard` with evolution series |
| 3 — Champion / hall-of-fame | lineage-founder tracking → top-K lineages → inspect/spawn panel |
| 4 — Phylogeny tree | bounded `LineageLog` (survives ancestor death) → tree render panel |
| 5 — Species / menagerie | NEAT-style genome distance → greedy speciation → species panel |

## 3. Phase 0 — Foundation (`core/genome/traits.ts`)

A **pure, RNG-free, sim-state-free** module. Sits beside `develop.ts` in the `core/genome` layer; imports only `genome.ts` + `cells/types` + `neural/network` (SensorChannel). Never organism/sim/render.

```ts
export interface GenomeTraits {
  geneCount: number;          // genes.length
  photoGenes: number;         // count by palette type over genes[]
  digestiveGenes: number;
  sensorGenes: number;
  neuronGenes: number;
  moverGenes: number;
  meatGenes: number;          // included for completeness (MEAT never authored, but a mutation could)
  divisionRuleCount: number;
  bondRuleCount: number;
  connectionCount: number;    // connectionRules.length
  motorCount: number;
  meanMass: number;           // mean over genes[].mass (0 if no genes)
  meanInitialEnergy: number;  // mean over genes[].initialEnergy
  meanAbsWeight: number;      // mean |connectionRules[].weight| (0 if none)
  generation: number;         // genome.generation
}

/** PURE — counts over the genome's static gene/rule arrays. No develop(), no RNG. */
export function genomeTraits(g: Genome): GenomeTraits;

/**
 * A coarse STRUCTURAL signature for genotypic-diversity bucketing — NOT exact genome
 * equality (continuous params differ on every mutant). Same body PLAN → same signature.
 * Built from the sorted per-type gene counts + (geneCount, connectionCount, motorCount).
 * Returned as a stable string key (cheap Map key for Simpson/entropy).
 */
export function genomeSignature(g: Genome): string;
```

**`genomeSignature` definition (exact):** `${photoGenes}p${digestiveGenes}d${sensorGenes}s${neuronGenes}n${moverGenes}m|${connectionCount}c${motorCount}t`. Captures morphology + wiring topology counts; ignores continuous params and exact rule wiring. (A finer signature is a Phase-5 concern via the distance metric; for diversity, morphology buckets are the right grain.)

**Determinism test (Phase 0):** a vitest test that constructs two `World`s with an identical `Config` carrying **non-zero** mutation rates and the same seed, ticks both N steps through births+deaths, and asserts byte-identical SoA (the existing SoA-hash helper) **and** identical genome-store `list()` serialization. This is the load-bearing proof that turning evolution on doesn't break reproducibility.

## 4. Phase 1 — Adaptation proof

**The handicap (measured trait):** seed the population with a forager whose steering-loop connection weights are knocked **down** from the hand-tuned `1.5` to a sluggish `0.2` (both `sensorLat→turn` and `sensorFwd→thrust`). A sluggish forager steers/advances weakly → reaches less food → reproduces less. Mutants with higher weights forage better → out-reproduce → **population-mean weight climbs**. Add a `buildHandicappedForagerGenome(cellRadius, weight)` builder (DRY over `buildForagerGenome`, just overriding the two connection-rule weights).

**The experiment (`headless/evolution-probe.ts`):**
- Plant-only 1024² world (the proven forager regime), seed ~20 handicapped foragers.
- **Experimental run:** `mutationWeightRate` high (~0.5), `mutationWeightSigma` ~0.15, all other rates 0 (isolate the weight locus → clean signal).
- **Control run:** identical seed + config but `mutationWeightRate = 0` (clone-only → weight stays 0.2).
- Both run ~12k ticks. Each 1000 ticks, sample the **population-mean** `sensorFwd→thrust` weight over live genome organisms (+ mean steering weight, population, max generation).
- **PASS:** experimental mean weight rises materially above control (target: `exp − ctrl > 0.4` by end) **and** the population survives in both (no extinction confound). Reports a verdict line.
- **Knife-edge handling:** if the experimental run shows no signal, the probe sweeps two stronger-selection economy settings (higher metabolic cost / lower food density) before declaring "no adaptation under economy-only" — documenting the empirical result either way. (Per principle: tune, don't add fitness.)

**The committed fast test (`core/sim/selection.test.ts`):** a deterministic, *fast* unit-level proof of selection (not the slow population sweep). Instantiate a small controlled population with two genome variants — a **fit** forager (weight 1.5) and an **unfit** forager (weight 0.2) — in a shared food field, mutation off, run a few thousand ticks, assert the **fit variant's live-descendant count exceeds the unfit variant's** (selection favors the fitter genome). This isolates "the economy differentially reproduces the fitter genome" as a fast, reliable invariant; the slow whole-population adaptation story lives in the headless probe.

## 5. Phase 2 — Trait-over-time + genotypic diversity (live telemetry)

**Extend `Metrics`** (in `core/sim/metrics.ts`) with evolution fields, computed at sample cadence over **live organisms** (read genome via `genomeRef`):
- `genotypicDiversity: number` — Simpson index over `genomeSignature` of live genome organisms (mirrors the existing phenotypic `diversity`).
- `meanCellsPerOrganism: number` — over live genome organisms (read `organisms.cellCount`).
- `meanSensorsPerOrganism`, `meanGenomeSize` (mean `geneCount`), `maxGeneration`.

These read live SoA + live genome store only — no `develop()`, no RNG, bounded by live population. A `sampleEvolutionMetrics(world)` helper keeps it out of the hot path (called from the existing sample step).

**Extend `TelemetryDashboard`** with new line series (genotypic diversity alongside phenotypic; mean cells / genome size / max generation). Reuse the existing dashboard's ring-buffer + draw pattern. Add a HUD readout line for genotypic diversity + max generation.

**Demo:** `main.ts` enables a **tuned-safe** mutation rate (so opening the app *shows* evolution) — modest `mutationWeightRate`/`mutationParamRate` found viable by the Phase-1 probe; `Config` library defaults stay `0` (clone-only is the safe default for tests/other callers).

## 6. Phase 3 — Champion / hall-of-fame

**Lineage-founder id.** Add `founderId: number` to `Genome`. A founder (`parentRef < 0`) gets a fresh founder id (monotonic, from the store or a world counter); a child inherits its parent's `founderId` at reproduction. It is a plain integer, so it **survives ancestor death** (unlike `parentRef`, whose target genome is freed). `cloneGenome` copies it; the critter/forager/autotroph builders leave it `-1` (assigned at register/reproduce time, like refs).

**Champion tracking (sample cadence).** `sampleLineages(world)` scans live genome organisms, tallies live count per `founderId`, and maintains a top-K table: `{ founderId, liveCount, peakCount, firstTick, representativeRef }`. Representative = a live genome of that lineage. Bounded (top-K, K~8).

**UI.** A hall-of-fame panel (new toggle key, e.g. `J`) listing the top lineages by live count: founder id, current/peak size, age, representative morph summary (from `genomeTraits`). Console/`sim` handle: `sim.spawnChampion(k)` re-spawns the k-th lineage's representative; `sim.champions()` returns the table.

## 7. Phase 4 — Phylogeny tree

**The constraint:** `GenomeStore.free()` deletes a genome on organism death, so `parentRef` chains cannot reach dead ancestors. Phylogeny needs its **own bounded record**.

**`core/genome/lineage-log.ts` — `LineageLog`:** append-only-with-pruning. Each node: `{ ref, parentRef, generation, founderId, birthTick, deathTick, signature }`. `recordBirth(...)` on every reproduction + the initial founders; `recordDeath(ref, tick)` on organism death. **Pruning:** a configurable cap (`maxLineageNodes`, ~4000). When exceeded, prune **fully-extinct subtrees** (a node that is dead AND has no living descendant), oldest-`deathTick` first — so the living lineage skeleton + recent extinct history is retained, ancient dead branches are forgotten. Deterministic (birth order, death order, deterministic prune key). Part of the determinism contract (the test hashes the log).

**Wiring:** `World` owns the `LineageLog`; `reproduceOrganisms` calls `recordBirth`, `killStarvedOrganisms` calls `recordDeath`. Both are structural events (already off the hot loop).

**UI.** A phylogeny panel (toggle, e.g. `Y`): a compact lineage tree of surviving lines — generation on the vertical axis, branch points where a lineage diversified, dead branches greyed/pruned. Start with a legible **indented/collapsed text tree** (founder → surviving descendants by generation, with branch counts); upgrade to a canvas node-link layout if it stays cheap. The point is *seeing where a successful mutation arose and swept*.

## 8. Phase 5 — Species / menagerie

**NEAT-style genome distance (`core/genome/distance.ts`):**
`δ(a,b) = c1·D/N + c2·W̄`, where genes are matched by **innovation id** (already monotonic, never reused — the homology key the `Gene.innovation` field was built for): `D` = count of disjoint+excess genes (innovation id in exactly one genome); `N = max(geneCountA, geneCountB, 1)`; `W̄` = mean `|weight|` difference over connection rules matched by their `(preGene.innovation, postGene.innovation)` pair (0 if none match). `c1`,`c2` are constants (default `c1=1.0`, `c2=0.4`). Pure function, unit-tested (identical genomes → 0; disjoint genomes → c1; weight-only diff → c2·Δ).

**Greedy speciation (sample cadence).** `sampleSpecies(world)` maintains a species list, each with a frozen representative genome. For each live genome organism: assign to the first species with `δ(genome, rep) < speciesThreshold` (default ~1.0), else open a new species with it as representative. Track per-species live count + birth tick; drop species that go empty (extinction). Bounded by live population. Periodically refresh representatives.

**UI.** A menagerie panel (toggle, e.g. `K`): species list — id, size, representative morph summary, age; speciation/extinction noted. Optional (if cheap): tint each organism by species id in the render. Console: `sim.species()`.

## 9. Determinism, performance, risks

**Determinism.** Every new structure is updated only at deterministic points: mutation (`rng.split(2)`, already deterministic), births/deaths (deterministic order), sample cadence (pure reads). No new RNG. Founder ids/lineage-log/species assignments derive deterministically. The Phase-0 determinism test is extended in Phase 4 to hash the lineage log.

**Performance.** All evolution metrics/observability run at sample cadence over live population (O(live orgs × genome size) per sample) — not the per-tick hot loop, which stays allocation-free. Structural-event hooks (lineage log append on birth/death) are O(1) amortized + bounded by the prune cap.

**Risks & mitigations.**
1. **Knife-edge collapse under mutation** — conservative tuned-safe default in the demo; the Phase-1 probe finds the safe band; the live mutation knobs (already present) let Josh retune. Library `Config` mutation defaults stay 0.
2. **Selection too weak to move a continuous trait in a tractable budget** — THE empirical risk. Mitigations: strong-coupling measured trait (steering weight), generous tick budget, control-subtraction to isolate signal from drift, economy-pressure sweep in the probe. If economy-only genuinely shows no adaptation, that is a documented finding — per the pure-emergence principle we tune harder, not add fitness, and flag it for Josh.
3. **Phylogeny unbounded memory** — bounded `LineageLog` with extinct-subtree pruning + hard cap.
4. **Species count blow-up** — greedy speciation with a tuned threshold + empty-species reaping; bounded by live population.

## 10. Testing strategy

- **Pure unit tests:** `traits.test.ts` (counts, means, signature stability), `distance.test.ts` (identity 0, disjoint, weight-diff), `lineage-log.test.ts` (birth/death/prune invariants, cap respected, extinct-subtree pruning).
- **Determinism:** mutation>0 two-run byte-identical SoA + genome-store + lineage-log hash.
- **Selection (fast, committed):** fit vs unfit variant → fit out-reproduces (`selection.test.ts`).
- **Metrics:** `sampleEvolutionMetrics` over a synthetic live population (known signatures → known diversity).
- **Champion/species:** synthetic populations → expected top-K lineages / species partition.
- **Headless probes (not unit tests):** `evolution-probe.ts` (the full adaptation story + verdict), reusing the `genome-probe.ts`/`forager-probe.ts` pattern.
- Every task gate: `make check` (typecheck + lint + full suite) green.

## 11. Out of scope (deferred)

- **Crossover / sexual reproduction** (M9 — the `Gene.innovation` homology key is already laid for it).
- **Per-organism brain partitioning** (M8 perf).
- **Genome-gated adhesion-on-contact bond formation** (still deferred from M6).
- Canvas-fancy phylogeny/menagerie visuals beyond legible-and-cheap; upgrade only if it stays cheap.
