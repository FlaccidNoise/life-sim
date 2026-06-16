# Life-Sim — Design Specification

**Date:** 2026-06-15
**Status:** Approved (design); implementation not started
**Author:** Josh Taylor + Claude

---

## 1. Vision

An emergent artificial-life simulator built from first principles. Free-floating
cells live on a 2D plane and interact through physics-based forces. Cells bind
into multicellular organisms. **All complex behaviour — sensing, locomotion,
feeding, predation, cooperation, and evolution — emerges from simple per-cell
rules and an energy economy, not from scripted behaviour.** Neuron-type cells
wire into neural networks that drive decision-making. Organisms evolve and adapt
to a changing environment (food, predators, conditions) via natural selection
acting on developmental genomes.

This is a **long-form project**. The defining constraint is not any single
feature but sustainability: a well-organised, strongly-typed, test-covered,
incrementally-built codebase that one developer can follow, debug, and extend
over a very long horizon.

### Guiding principles
- **Emergence over scripting.** We define low-level rules and an energy economy;
  behaviour and morphology emerge. We never hard-code "this organism hunts."
- **Small, reviewable increments.** Every change is sliced until it lands with a
  clear *what changed / test that proves it / what you should see*. Nothing big
  and opaque ever lands.
- **Correctness and visibility first, performance last.** Build a clean,
  debuggable, single-threaded engine; parallelise proven kernels at the end.
- **Test-driven.** Pure functions are unit-tested; the stochastic whole is
  tested by statistical invariants. RNG is always seedable.

## 2. Non-goals (YAGNI)
- Not 3D. Strictly 2D.
- Not grid/cellular-automaton based (this is off-grid, continuous-space, force-based).
- No scripted species, no global objective function, no hand-authored fitness.
- No networking/multiplayer, no persistence beyond save/load worlds (a late milestone).
- No GPU *compute* initially (GPU is used only for *rendering*). WebGPU compute is a possible far-future path, explicitly deferred.
- No sexual reproduction initially (asexual clone+mutate first; sexual is M9+).

## 3. Core design decisions

Each decision below was made interactively with the user. Alternatives and
rationale are recorded; see also `docs/decisions/`.

| # | Decision | Choice | Why (short) |
|---|---|---|---|
| D1 | Language | **TypeScript**, strict | User maintains/debugs it long-term; vast ecosystem; chosen over Rust despite Rust's perf/safety edge, because debuggability + the user's own fluency dominate for a long-form personal project. |
| D2 | Scale target | **100k–1M cells** | Rich multicellular emergence needs large populations + dense food. |
| D3 | Perf strategy | **Web Workers + SharedArrayBuffer** | Honours "massive scale" while staying 100% TS. Interactive ~100–300k; 1M in headless fast-forward. Deferred to M8. |
| D4 | Code architecture | **Data-oriented SoA ("ECS-lite")** | 1M objects would die to GC and can't live in SharedArrayBuffer. Cells are array indices; properties are parallel typed arrays. Chosen over OOP (dead at scale) and full ECS libraries (needless dependency/churn). |
| D5 | Physics | **Custom particle solver** | Needs are simple+specific (soft repulsion, springs, drag, thrust). Rigid-body engines (matter.js/Box2D/rapier) model the wrong thing and choke at 100k+. |
| D6 | Rendering | **WebGL2 instanced** | One instanced draw renders 1M points trivially. Canvas2D caps ~10k; WebGPU unneeded for drawing (reserved as a far-future option). |
| D7 | Determinism | **Not required for live runs; RNG seedable** | User prefers emergent randomness. TDD survives: pure functions tested deterministically with fixed seeds; whole-sim tested via statistical invariants. |
| D8 | Emergence level | **Curated cell palette → emergent bodies & behaviour** | We define cell *capabilities*; evolution + neural nets compose them. Morphology, strategy, specialisation-usage emerge. Lower-level (gene-regulatory) emergence is a "deepen later" target. |
| D9 | Brain model | **Neuron-cells wire into an evolvable recurrent network** | Most aligned with the cellular-emergence vision: the nervous system is literally part of the visible, evolving morphology. |
| D10 | Genome model | **Developmental (seed cell + division program)** | Organisms grow from one cell via a generative recipe → genuinely emergent, open-endedly evolvable morphology. Chosen over direct encoding (limited) and full GRN (deferred). |
| D11 | Runtime | **Browser interactive viewer + headless-capable core** | Seeing emergence is motivating and aids debugging; core stays runnable headless (Node) for tests and batch evolution. |

## 4. Simulation model

### 4.1 World & environment
- **Toroidal 2D plane** (edges wrap) — no walls, no boundary artifacts.
- **Resource fields** on a coarse grid overlaid on the world:
  - **Light field** — powers photosynthesis. Initially uniform/static; later
    gradients, day/night, seasons.
  - Later: temperature, toxins, currents.
  - Fields evolve by cheap diffusion stencils each tick.
- **Food is cells, not a separate concept:**
  - **Plant cells** — autotrophs that convert local light into energy and can
    slowly grow/divide (baseline producers).
  - **Meat cells** — remains left when any cell dies, holding residual energy,
    decaying over time.
  - A food web (herbivore/carnivore/omnivore niches) emerges from who can
    digest what; we do not script trophic levels.

### 4.2 The cell (the only entity; it is an array index)
A cell is an index `i` into parallel typed arrays. Core fields (illustrative,
finalised per-milestone):

```
posX, posY            Float32Array   position
velX, velY            Float32Array   velocity
forceX, forceY        Float32Array   per-tick force accumulator
radius, mass          Float32Array   size / inertia
energy                Float32Array   life currency
cellType              Uint8Array     palette index
organismId            Uint32Array    0 = free/food; else owning organism
genomeRef, brainRef   Uint32Array    indices into pools
age, flags            Uint32/Uint8   lifecycle / bitflags (alive, bonded, …)
```
Type-specific state (neuron activation, sensor channels, mover orientation)
lives in additional arrays addressed by `i`.

**Cell palette (capabilities):**
`structural` · `photosynthetic` · `digestive` · `sensor` · `neuron` · `mover` · `reproductive`.
A cell has exactly one primary type; evolution chooses which types an organism
expresses and how they connect.

### 4.3 The tick (fixed timestep; sim rate decoupled from render rate)
```
1. SPATIAL HASH    bin cells into a uniform grid → O(n) neighbour queries
2. SENSE           sensor cells sample fields + nearby cells → sensor channels
3. THINK           neuron-cell network propagates ONE recurrent step
4. ACT             mover cells convert brain outputs → thrust/orientation
5. FORCES          repulsion + bond springs + thrust + drag (accumulate)
6. INTEGRATE       semi-implicit Euler (near-overdamped) → new positions
7. METABOLIZE      photosynthesis / digestion gains; basal+move+neural+bond costs
8. LIVE/DIE/BREED  energy≤0 → die→meat; organism energy≥threshold → reproduce;
                   bond formation (adhesion) / breakage (strain)
9. ENVIRONMENT     diffuse fields, spawn/grow plants, decay meat
```
Steps 1, 5, 6 are the heavy, embarrassingly-parallel numeric kernels (→ Workers,
M8). Step 8 is irregular structural mutation (allocation, topology) and stays
single-threaded; births/deaths/bond-changes are a small fraction of cells/tick.

### 4.4 Physics
- **Medium:** viscous, low Reynolds number → **near-overdamped** dynamics
  (inertia small; a high drag term dominates). Semi-implicit Euler with
  configurable damping; a small mass term retained for numerical stability.
- **Repulsion:** soft contact when `dist < r_i + r_j`; Hookean in the overlap,
  `F = k_rep · overlap` along the separation axis.
- **Bond springs:** `F = -k_bond · (dist − restLen)` along the bond; bond breaks
  if strain exceeds `maxStrain`.
- **Adhesion (optional short-range attraction):** type-compatible cells within a
  small band may attract, enabling bonds to form on contact (genome-gated).
- **Drag:** `F_drag = -c · v`.
- **Thrust:** mover cells apply force along their orientation, magnitude from a
  brain output; energy cost ∝ thrust².
- **Spatial hash:** uniform grid, cell size = interaction cutoff (≈ 2·maxRadius).
  Counting-sort cells into buckets each tick (typed arrays:
  `bucketStart/bucketCount/sortedIndices`); neighbour iteration over 3×3 buckets.

### 4.5 Energy economy (the invisible hand of selection)
No explicit fitness function — survival and reproduction under the energy budget
*is* selection. Every term is a **tunable parameter** (balancing is a first-class,
ongoing design task):
- **Gains:** `photosynthesisGain ∝ localLight · area` (photo cells);
  `digestionGain` = rate × efficiency(<1) when a digestive cell is adjacent to
  edible food/meat/cell.
- **Costs (per tick):** `basalCost` (∝ size), `moveCost ∝ thrust²`,
  `neuralCost` (per active neuron/synapse), `bondCost` (per bond).
- **Death:** `energy ≤ 0` → cell dies and becomes a meat cell holding a fraction
  of its mass as energy.
- **Reproduction:** organism energy ≥ `reproThreshold` → spend energy to produce
  an offspring (asexual: copy genome + mutate; grow from a seed cell placed/ejected
  near the parent).

Failure modes to guard against in balancing: **extinction** (costs too harsh) and
**grey goo** (costs too generous / unbounded growth). Mitigations: tunable costs,
food spawn caps, soft population ceiling tied to `maxCells`.

### 4.6 Neural networks (made of neuron cells)
- **Topology = morphology.** Neuron cells form a directed, weighted network via
  synapses to bonded/nearby neuron cells, plus `sensor → neuron` and
  `neuron → mover` links. Synapse existence/weight/sign is set by the genome and
  evolves with the body.
- **Recurrent, one step per tick:** `a_j(t) = φ(bias_j + Σ_i w_ij · a_i(t−1))`,
  φ = tanh (genome-selectable later). Persistent activations give the network
  memory → natural oscillators for locomotion gaits.
- **Sensor input vocabulary (extensible):** local food/chemical gradient, contact
  & pressure, own/organism energy, ambient light, local cell density, an internal
  clock/oscillator. Evolution chooses which a sensor cell exposes.
- **Effector outputs:** mover thrust magnitude (and turn); later bond-release,
  reproduction-trigger, etc.

### 4.7 Genome & development (generative encoding)
- **Genome = a growth recipe**, not a blueprint. Two parts:
  1. **Cell genes** — parameter sets defining a cell-type's expression (base
     palette type, size, sensor channels, neuron params, mover params, adhesion
     affinities, colour).
  2. **Development program** — a graph of **division rules**:
     `(parentGene, condition[stage/energy]) → produce childGene at angle θ,
     bond stiffness k, [recursion/repeat count]`.
- **Development:** start from a seed cell (root gene); fire rules to divide and
  differentiate until an energy/size budget is exhausted. Recursive rules produce
  repetition/symmetry → segments, limbs, radial bodies emerge.
- **Mutation operators:** Gaussian perturbation of numeric params; add/delete/
  duplicate a gene or rule; rewire a rule target; change cell type; change a
  synapse weight; **duplicate a subgraph** (the key driver of complexity growth).
  Rates are tunable.
- **Reproduction:** asexual first — copy + mutate genome, grow offspring; parent
  pays the energy. Sexual reproduction (crossover of gene graphs) is M9+.

### 4.8 Organisms, bonds, lifecycle
- An **organism** is a connected component of bonded cells sharing a genome.
  Membership tracked on `organismId`, maintained incrementally as bonds form/break
  (split a component → two organisms; this is how injury/reproduction-by-fission
  could emerge).
- Organism-level bookkeeping: total energy, cell count, centroid, age, brain
  network reference.

## 5. Software architecture

### 5.1 Module structure & boundaries
```
src/
  core/            # PURE, headless, no DOM/Worker deps — the engine
    math/          #   vec2, seedable RNG, constants
    memory/        #   SoA typed-array pools, SharedArrayBuffer, free-list, gen-ids
    spatial/       #   uniform spatial hash
    physics/       #   forces, integrator
    cells/         #   palette, per-type behaviour, metabolism
    environment/   #   resource fields, diffusion, food spawning
    neural/        #   neuron-cell network construction + forward pass
    genome/        #   encoding, development, mutation
    organism/      #   connected components, bonds, lifecycle
    sim/           #   World, tick orchestration, Config/parameters
  render/          # WebGL2 instanced renderer (reads core, never mutates)
  app/             # Vite browser app: viewer, controls, inspector
  headless/        # Node CLI: batch runs, evolution experiments
  workers/         # Worker entry + spatial partitioning (M8)
```
**Enforced boundary (architecture.json):** `core/` must not import from
`render/`, `app/`, `workers/`, or any DOM/Worker API. `render/` may read `core/`
but never mutate it. This keeps the engine pure and fully testable in Node.

### 5.2 Memory layout
- SoA typed arrays backed by **SharedArrayBuffer from day one** (even in
  single-thread mode) so the M8 Worker port is mechanical, not a rewrite.
- Capacity pre-allocated to a configurable `maxCells` (e.g., up to 1M slots).
- **Free-list** of dead slots for O(1) recycle; **generational ids**
  (`id = index | generation<<k`) to detect stale references safely.
- Bonds and synapses stored as their own SoA edge pools with free-lists.

### 5.3 Single-thread reference vs Worker mode
- The engine runs single-threaded by default (the **reference/oracle**): clean,
  debuggable, the basis for tests.
- Worker mode (M8) partitions cells by spatial tiles/index ranges and runs the
  *same* kernels. Force computation uses a **gather formulation** (each cell sums
  forces from its neighbours; no cross-thread writes), so no locking is needed on
  the hot path. Exact float-order determinism is *not* preserved across threads —
  acceptable per D7; tests run single-threaded.

### 5.4 Configuration & parameters
All economy/physics/mutation constants live in a single typed `Config` object,
fully serialisable. Worlds are reproducible from `(Config, seed)`. This is the
surface for balancing and experiments.

## 6. Testing strategy (TDD)
- **Unit (deterministic):** vec math; seedable RNG; spatial hash (returns exactly
  the true neighbours); force calc (direction/magnitude/symmetry); integrator
  (stability, no NaN); metabolism (energy bookkeeping); NN forward pass (known
  weights → known activations); genome development (seed → identical body given a
  seed); each mutation operator.
- **Property / invariant:** energy never negative; conservation where expected;
  population stays within `[0, maxCells]`; no NaN/Inf anywhere; cells never
  escape the toroidal bounds.
- **Statistical (whole sim):** seeded full runs reproducible; for stochastic
  behaviours, assert distributions/trends (e.g., a selectable trait's frequency
  rises under pressure) rather than exact states.
- **Visual smoke:** a headless run asserts "after N ticks, M cells alive within
  range" to catch gross regressions.
- **Discipline:** red → green → refactor per the test-driven-development skill.

## 7. Tooling & conventions
- **TypeScript** strict: `strict`, `noUncheckedIndexedAccess`,
  `exactOptionalPropertyTypes`, `noImplicitOverride`.
- **Vite** (dev server + build; handles Workers natively).
- **Vitest** (unit/integration; watch mode; coverage).
- **ESLint** (`typescript-eslint` type-checked) + **Prettier**.
- **pnpm** via corepack.
- **beads (`bd`)** for issue tracking (git-native; already installed).
- **GitHub Actions** CI: typecheck + lint + test (workflow committed in M0 even
  before a remote exists).
- **Makefile** is the canonical interface: `make help / dev / test / check /
  lint / typecheck / build`.
- **architecture-guard** (`architecture.json`) enforces §5.1 boundaries.
- **ADR log** at `docs/decisions/INDEX.md`; specs at `docs/superpowers/specs/`.

## 8. Milestone roadmap
Each milestone is runnable + tested before the next begins.

| # | Milestone | Adds | Acceptance criterion |
|---|---|---|---|
| **M0** | Foundation & tooling | Repo, strict TS, Vite, Vitest, beads, CI, Makefile, math+seedable RNG, SoA memory layer, architecture guard, docs | `make check` green; an empty `World` ticks N times with zero allocations in the hot loop |
| **M1** | Particle core | SoA cell store, spatial hash, repulsion, drag, integrator, fixed-tick loop, **WebGL2 point renderer** | **100k inert cells repel into an even spread, pan/zoom, interactive fps** — the first prototype |
| M2 | Metabolism | Energy, light field, plant/meat food, digestion, death→meat, field diffusion | Cells live/die by food; populations rise and fall over a run |
| M3 | Sense + move | Mover & sensor cells, a hardcoded chemotaxis reflex (pre-neural) | A single cell visibly climbs a food gradient |
| M4 | Neural nets | Neuron-cell recurrent networks; sensor→neuron→mover | A hand-wired multicellular critter swims to food via its neuron-cell brain |
| M5 | Multicellularity | Bond formation/breakage, adhesion, organism = connected component, organism energy | Hand-built organisms hold together and locomote |
| M6 | Developmental genome | Genome encoding, development from seed cell, asexual reproduction | Organisms reproduce; offspring resemble parents (seeded → reproducible body) |
| M7 | Evolution | Mutation operators, natural selection via the energy economy, long headless runs | Over a long run, a measurable trait adapts to pressure (statistical) |
| M8 | Parallelism | Hot kernels → Workers + SharedArrayBuffer; spatial partitioning; barriers | 500k–1M cells headless; 100k+ interactive; Worker path matches reference statistically; throughput scales with cores |
| M9+ | Deepening | Sexual reproduction/crossover, gene-regulatory networks, temperature/toxins/currents/seasons, predator dynamics, speciation & phylogeny viewer, save/load worlds, metrics dashboard | Open-ended |

## 9. Slicing methodology
**Milestone → Epic → small beads issues.** Example M1 →
`{SoA cell store, spatial hash, repulsion force, integrator, tick loop, WebGL2
renderer}` → each epic → 2–5 tiny issues. Every landed issue carries: *what
changed · the test that proves it · what you should see*. beads tracks
dependencies, so the next ready task is always explicit. Subagent-driven
execution is the default, with frequent reviewable checkpoints.

## 10. Key risks & open questions
- **R1 — Energy-economy balancing (highest risk).** Emergence is fragile; most
  parameter sets yield extinction or grey goo. Mitigation: every cost tunable;
  build metrics/telemetry early (M2+); treat balancing as ongoing experiment.
- **R2 — Developmental encoding tractability (M6).** Generative genomes are
  research-grade. Mitigation: start minimal (few rule types), deepen later;
  reproducibility tests guard correctness.
- **R3 — Evolvable neuron-cell networks (M4/M7).** Getting coherent, *evolvable*
  behaviour from body-defined networks is hard. Mitigation: validate with
  hand-wired brains (M4) before trusting evolution (M7).
- **R4 — TS perf ceiling before M8.** Pre-Worker, expect ~10–50k interactive.
  Mitigation: SoA from M1 + headless fast-forward; M8 unlocks scale.
- **R5 — SharedArrayBuffer browser requirements** (cross-origin isolation
  headers). Mitigation: configure Vite COOP/COEP headers in M0/M8.
- **Open:** exact sensor-input and effector-output vocabularies (finalised at
  M3/M4); synapse-formation rule (bond-based vs radius-based) (finalised at M4);
  developmental rule-language details (finalised at M6).

## 11. Glossary
- **Cell** — the atomic entity; an index into SoA arrays.
- **Organism** — a connected component of bonded cells sharing a genome.
- **Palette** — the fixed set of cell capability types.
- **Genome** — a developmental recipe (cell genes + division rules).
- **Development** — growing an organism from a seed cell by firing rules.
- **Energy economy** — the gain/cost system that drives natural selection.
- **SoA** — structure-of-arrays; parallel typed arrays indexed by entity id.
- **Tick** — one fixed-timestep simulation step.
- **Reference/oracle** — the single-threaded engine that tests trust.
