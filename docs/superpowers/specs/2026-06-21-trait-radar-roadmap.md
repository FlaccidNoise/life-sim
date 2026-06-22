# Trait Radar — feature roadmap (genes → simulation → radar)

**Date:** 2026-06-21 · **Branch:** `feat/diversity-levers` · **Status:** Phase 0 shipped, Phase 1+ planned

Goal: grow the inspector's trait radar from the shipped 7-axis "Capability" view into a
full morphotype instrument, by adding the missing traits **end-to-end** — each one a real
heritable gene, a real selection pressure in the sim, and a spoke on the radar. Built as small
vertical slices so every step is independently reviewable and shippable.

## Locked decisions (owner, 2026-06-21)
1. **Sexual reproduction is deferred** to a final, separately-greenlit epic (Phase 6). The sim
   stays asexual (clone + mutate one parent) until then. Pheromone *trails* (foraging/kin) do
   **not** need sex and are in scope (Phase 5).
2. **Display = swappable lenses.** One clean ≤8-spoke radar with a selector that switches the
   axis-set: **Capability** (shipped) · **Senses & Social** · **Life-history**. Same widget,
   different spokes. `computeRadar()` already takes the axis list; lenses are just named lists.
3. **Normalization = absolute** (spoke length = the gene's magnitude over its clamp bounds).
   Best for comparing guilds. A centered/deviation mode can be added as a toggle later.

## Phase 0 — Capability radar ✅ (`life-sim-d176`)
Shipped: `src/app/observability/radar-view.ts` (pure `computeRadar()` + `RadarView` canvas,
mirroring `BrainView`), `radar-view.test.ts` (5 tests), wired in `index.html` + `main.ts`.
Axes: diet · bite · spd · size · smell · r/K-repro · provisioning. `make check` green.

---

## The reusable per-gene RECIPE
Every new trait below is "fully built into each creature + the simulation + the radar" by the
same steps. The genome is designed for this — `genome.ts:34`: *"Adding a new scalar gene = an
enum slot + a spec entry."* The seed/mutate/upkeep loops iterate `SCALAR_GENE_COUNT`, so a new
slot is **automatically** seeded, mutated, clamped, and (if costed) charged upkeep.

1. **Genome** (`genome.ts`): add `ScalarGene.X` enum slot, bump `SCALAR_GENE_COUNT`, append a
   `SCALAR_GENE_SPECS` entry `{ centerKey, costKey|null, min, max }`.
2. **Config** (`config.ts`): add the founder-center key `x` and, if costed, the cost coeff `xCost`
   to `Config` + `defaultConfig()`.
3. **Mechanic**: the consuming system reads `scalarGenes[i*COUNT + ScalarGene.X]` and makes it
   *matter* — a real tradeoff, so selection has something to act on. **This is the hard part**;
   a gene with no mechanic just evolves to its cheapest value and the spoke goes flat.
4. **Determinism**: `stateHash` (`world.ts:198`) hashes position/energy/age/genId + food — genes
   act through those, so the contract (same seed reproduces) holds; the trajectory just changes.
   New **spatial** state (Phase 5 scent field) needs its own `hashInto`. Keep all per-creature
   loops in ascending `liveIndices` order (the determinism constraint).
5. **Radar**: add `{ gene, label, color }` to the relevant lens's axis list. Norm auto-derives
   from the spec's `min/max`.
6. **Inspector** (optional): add a `gene·x` row in `inspector.ts`.
7. **Tests**: genome seed/mutate/clamp, the mechanic's effect, radar normalization, a determinism
   replay test.
8. **Variance gate** (below): run the census; only promote the spoke if the gene actually varies.

## Guardrails
- **Flat-spoke gate (Phase 1.2).** A spoke that never varies reads as a broken chart. Before
  promoting any axis, the census probe must show its population IQR ≥ ~10% of its clamp range.
  Known suspects flagged by prior research: vision genes (evolve toward 0 at the shipped scale —
  `perception-scale-mismatch` memory), cohesion/shelter, metabEff. Ship the gene; gate the spoke.
- **Collinearity.** Don't put speed + turn + thrust on one lens as three "go fast" spokes without
  a reason; they move together. Spread them across lenses or pick representatives.
- **No silent flatness.** If the census drops a spoke, the lens shows the remaining spokes and the
  drop is logged — never a hidden empty axis.

## Lens taxonomy (each ≤8 spokes)
- **Capability** (shipped): diet · bite · spd · size · smell · r/K-repro · prov
- **Senses & Social**: visionRange · visionFOV · visionAcuity · sensory-investment · cohesion ·
  shelter · **boldness**(new) · (later **trail-follow**)
- **Life-history**: r/K-repro · prov · **longevity**(new) · metabEff · agility(maxTurn) ·
  burst(maxThrust) · **dispersal**(new) · **defense**(new)
- Live overlay (not a lens spoke): **Learned Drift** — changes within a life, so it gets its own
  animated treatment, not a static guild-comparison spoke.

---

## Roadmap (vertical slices = beads issues)

### Phase 1 — Display foundation (no new biology)
- **1.1 Lens infrastructure.** Generalize `computeRadar(store,cfg,slot,axisSet)`; add a lens
  registry + a `<select>` in the inspector that switches the active lens. Capability becomes the
  default lens. *Unlocks every spoke below.*
- **1.2 Variance-census probe.** `src/headless/gene-variance.ts`: run a seeded population N ticks,
  print each gene's IQR / clamp-range ratio + a promote/flat verdict. The flat-spoke gate.

### Phase 2 — Free axes (existing genes already have mechanics; census + add spokes)
- **2.1 Vision spokes** (visionRange/FOV/acuity) → Senses lens. Census first — likely flat at the
  live scale; if so, show but flag, or keep gated until density work.
- **2.2 Sensory-investment** derived spoke (summed sense upkeep, `geneUpkeep` slice).
- **2.3 Social spokes** (cohesion = schooling, shelter) → Senses & Social lens.
- **2.4 Life-history spokes** (metabEff economy, maxTurn agility, maxThrust burst) → Life-history.
- **2.5 Learned-Drift live overlay** — animate Σ|learned−instinct| on the followed creature
  (already computed in `inspector.ts:53`); its own widget, not a static spoke.

### Phase 3 — New Tier-A genes (each a full RECIPE slice)
- **3.1 Longevity** — `MAX_AGE` gene → age-driven mortality in `health.ts` (currently death is
  energy-only) → Longevity spoke. Concept: evolution of senescence (Williams 1957 antagonistic
  pleiotropy; Medawar 1952). Tradeoff: long life vs. an upkeep or reproductive cost.
- **3.2 Defense** — `ARMOR` gene → reduces hunt drain taken in `economy.hunt` → Defense spoke.
  Concept: growth–defense tradeoff (Herms & Mattson 1992). Costed, so prey "pay" for armor.
- **3.3 Boldness** — `AGGRESSION` gene → scales the chase/flee threshold on the sight vector in
  `brain.steer` / `sense.senseCreatures` → Boldness spoke. Concept: boldness–aggression syndrome
  (Sih 2004). Bold = chases/holds ground, shy = flees early.
- **3.4 Warning color** — `CONSPICUOUSNESS` gene → raises predator detectability **and** couples
  to defense (honest signal) + render tint → Warning spoke. Concept: aposematism vs crypsis
  (Ruxton 2004). The richest new selection loop (defended+conspicuous vs cryptic).

### Phase 4 — New per-creature state
- **4.1 Dispersal** — add `birthX/birthY` SoA fields (set at birth, cleared on `alloc`) → compute
  displacement → Dispersal spoke (Life-history). Concept: competition–colonization tradeoff
  (Tilman 1994). Note: new state, not a gene; touches `store.ts` alloc/clear. No `stateHash`
  change needed (position already hashed).

### Phase 5 — Pheromone trails (new mechanic, Tier B)
- **5.1 ScentField** — a new diffusing grid like `FoodField` (emit/decay/diffuse) inserted into
  the deterministic tick order with its own `hashInto`.
- **5.2 Trail genes** — `TRAIL_EMIT` (lay scent) + `TRAIL_FOLLOW` (sense scent gradient into
  steering) → two spokes (Senses & Social). Concepts: stigmergy (Deneubourg 1990) +
  producer–scrounger free-riding (Barnard & Sibly 1981). Build only if Phase 2.3 shows the social
  story is thin.

### Phase 6 — Sexual reproduction (deferred, gated epic)
Greenlit separately. Reproduction-model rewrite (mate search + genome crossover) + `CHOOSINESS`
+ `DISPLAY` (ornament) genes + a fourth "Reproduction & Signaling" lens. Concepts: Bateman 1948 /
Trivers 1972 parental investment; runaway/honest-signalling. The existing `hue` gene is a free
ornament to hang assortative mating on.

## Sequencing rationale
Phase 1 first (display foundation unlocks everything cheaply). Phase 2 next (free value — genes
that already exist, just census + render). Phase 3 adds genuinely new biology one tradeoff at a
time, ordered by value-for-effort: longevity (cleanest) → defense → boldness → warning (most
coupled). Phase 4 (dispersal) needs new state so it follows. Phase 5 (pheromones) is real engine
work, justified only if Phase 2 reveals a social gap. Phase 6 is the architectural finale.
