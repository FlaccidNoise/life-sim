# Life-Sim — Design Specification

**Date:** 2026-06-15
**Status:** Approved (design), hardened by adversarial review (see §13 changelog); implementation not started
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
- **Test-driven.** Pure functions are unit-tested; integration is golden-tick
  tested; the stochastic whole is tested by statistical invariants. RNG is always
  seedable and reproducibility is an *engineered invariant*, not an assumption.
- **Selection needs a gradient.** The environment and economy must continuously
  reward complexity, or the system collapses to a trivial monoculture. This is a
  first-class design obligation, not an afterthought (§4.1, §4.5, §10).

## 2. Non-goals (YAGNI)
- Not 3D. Strictly 2D.
- Not grid/cellular-automaton based (off-grid, continuous-space, force-based).
- No scripted species, no global objective function, no hand-authored fitness.
- No networking/multiplayer; no persistence beyond save/load worlds (late).
- No GPU *compute* initially (GPU is used only for *rendering*). WebGPU compute is
  an explicitly deferred far-future path.
- No sexual reproduction initially (asexual clone+mutate first; sexual is M9+).

## 3. Core design decisions

| # | Decision | Choice | Why (short) |
|---|---|---|---|
| D1 | Language | **TypeScript**, strict | User maintains/debugs long-term; vast ecosystem; chosen over Rust despite Rust's perf/safety edge, because debuggability + the user's fluency dominate for a long-form personal project. |
| D2 | Scale target | **100k–1M cells** | Rich multicellular emergence needs large populations + dense food. See the regime table in §8 for what's achievable when. |
| D3 | Perf strategy | **Web Workers + SharedArrayBuffer** | Honours "massive scale" while staying 100% TS. Deferred to M8. Concrete throughput expectations live in the §8 regime table (not a single headline number). |
| D4 | Code architecture | **Data-oriented SoA ("ECS-lite")** | 1M objects would die to GC and can't live in SharedArrayBuffer. Cells are array indices; properties are parallel typed arrays. Chosen over OOP (dead at scale) and ECS libraries (needless churn). |
| D5 | Physics | **Custom particle solver** | Needs are simple+specific (soft repulsion, springs, drag, thrust). Rigid-body engines (matter.js/Box2D/rapier) model the wrong thing and choke at 100k+. |
| D6 | Rendering | **WebGL2 instanced** | One instanced draw renders 1M points trivially. Canvas2D caps ~10k; WebGPU unneeded for drawing (reserved). |
| D7 | Determinism | **Single-thread runs reproducible (engineered); Worker path may diverge** | RNG seedable; live runs may use random seeds for emergent variety, but the same (Config, seed) reproduces byte-identically single-threaded (§6). Worker mode (M8) is allowed to diverge in float order. |
| D8 | Emergence level | **Curated cell palette → emergent bodies & behaviour** | We define cell *capabilities*; evolution + neural nets compose them. Gene-regulatory emergence is a "deepen later" target. |
| D9 | Brain model | **Neuron-cells wire into an evolvable recurrent network** | The nervous system is part of the visible, evolving morphology. Topology is snapshotted at development, not recomputed per tick (§4.6). |
| D10 | Genome model | **Developmental (seed cell + division program + connection-rule table)** | Organisms grow from one cell via a generative recipe → emergent, evolvable morphology *and* wiring. |
| D11 | Runtime | **Browser interactive viewer + headless-capable core** | Seeing emergence is motivating and aids debugging; core runs headless (Node) for tests + batch evolution. |

## 4. Simulation model

### 4.1 World & environment
- **Toroidal 2D plane** (edges wrap) — no walls, no boundary artifacts. World span
  is a bounded, configured budget (§5.4) — not unbounded — for precision reasons
  (§4.2).
- **Resource fields** on a coarse grid overlaid on the world:
  - **Light field** — powers photosynthesis. **Patchy and depleting, not uniform:**
    local photosynthesis consumes/shades a patch so a stationary photo-cell
    exhausts its spot and must spread or move. (A uniform static field is
    disqualified: it makes immobility optimal and removes the gradient that
    rewards motility/sensing — see §10 R1.) Patches regenerate over time.
  - Later: temperature, toxins, currents, day/night, seasons.
  - Fields evolve by cheap diffusion/regeneration stencils each tick.
- **Density-dependent regulation:** local resource depletion plus an optional
  crowding metabolic penalty keep populations bounded *intrinsically*, not merely
  by a hard `maxCells` quota (a quota-capped monoculture is still a failure).
- **Food is cells, not a separate concept:**
  - **Plant cells** — autotrophs that convert local light into energy and can
    slowly grow/divide (baseline producers).
  - **Meat cells** — remains left when any cell dies, holding residual energy,
    decaying over time.
  - A food web emerges from who can digest what; trophic levels are not scripted.

### 4.2 The cell (the only entity; it is an array index)
A cell is an index `i` into parallel typed arrays. Core fields (illustrative;
finalised per-milestone):

```
posX, posY            Float64Array   position (Float64 — see precision note)
velX, velY            Float32Array   velocity
forceX, forceY        Float32Array   per-tick force accumulator
radius, mass          Float32Array   size / inertia
energy                Float32Array   life currency
cellType              Uint8Array     palette index
organismId            Uint32Array    0 = free/food; else owning organism (gen-validated)
genomeRef, brainRef   Uint32Array    indices into pools (gen-validated)
age, flags            Uint32/Uint8   lifecycle / bitflags (alive, bonded, …)
generation            Uint32Array    slot generation, validated on every deref
```
- **Position precision:** positions are **Float64**. At a large world span,
  Float32 ulp would round away a slow overdamped `v·dt` step, freezing distant
  cells and corrupting toroidal wrap arithmetic. Float64 positions cost only
  ~16 MB at 1M cells. Render upload downcasts to Float32 (screen precision is
  fine). A precision invariant test asserts a slow cell at max world coordinate
  still integrates.
- **Safe references:** the slot index is stored plainly; `generation[i]` lives in
  its own parallel array and is checked on every dereference. We do **not** pack
  index+generation into one Uint32 (1M slots needs 20 index bits, leaving only 12
  generation bits → wraps after 4096 recycles, reached in under a minute of
  routine death→meat churn, silently re-enabling stale-reference aliasing). Bond
  and synapse endpoints store gen-validated references, never raw indices.

**Cell palette (capabilities):**
`structural` · `photosynthetic` · `digestive` · `sensor` · `neuron` · `mover` · `reproductive`.

### 4.3 The tick (fixed timestep; sim rate decoupled from render rate)
```
1. SPATIAL HASH    bin cells into a uniform grid → O(n) neighbour queries   [HOT]
2. SENSE           sensor cells sample fields + nearby cells → sensor channels
3. THINK           neuron-cell network: synchronous double-buffered step    [HOT]
4. ACT             mover cells convert brain outputs → thrust/orientation
5. FORCES          repulsion + bond springs + thrust + drag (accumulate)    [HOT]
6. INTEGRATE       semi-implicit Euler (near-overdamped) → new positions    [HOT]
7. METABOLIZE      photosynthesis/digestion gains; basal+move+neural+bond costs;
                   intra-organism energy transfer along bonds (§4.5)
8. LIVE/DIE/BREED  energy≤0 → die→meat (may split organism); organism energy ≥
                   threshold → reproduce; bond formation/breakage (structural)
9. ENVIRONMENT     diffuse/regenerate fields, spawn/grow plants, decay meat
```
- **Heavy kernels are steps 1, 3, 5, 6** (THINK included — it was previously
  omitted). Step 8 is irregular structural mutation (allocation, topology) and
  stays single-threaded; births/deaths/bond-changes are a small fraction of
  cells/tick.
- **THINK is not a dense matmul** — it is a sparse matrix–vector product with
  random `a_i` gathers (cache-miss-dominated). It is double-buffered: read
  activations at `t−1`, write `t` (matches the §4.6 equation and the M4 unit
  test). For M8 it partitions **by organism (graph partition)**, not by spatial
  tile (a spatial partition would scatter an organism's neurons across workers).
- **READS/WRITES discipline:** each tick step documents which arrays it reads vs
  writes (e.g., does METABOLIZE charge this tick's or last tick's thrust; does
  THINK read sensors written this tick or last). This table is the contract the
  golden-tick tests (§6) assert against; it is finalised as steps land
  (M2–M5) and lives alongside the `sim/` tick orchestrator.

### 4.4 Physics
- **Medium:** viscous, low Reynolds number → **near-overdamped** dynamics (high
  drag dominates; small mass retained for numerical stability). Semi-implicit
  Euler with configurable damping.
- **Repulsion:** soft contact when `dist < r_i + r_j`; Hookean in the overlap,
  `F = k_rep · overlap` along the separation axis.
- **Bond springs:** `F = -k_bond · (dist − restLen)` along the bond; breaks if
  strain exceeds `maxStrain`.
- **Adhesion (short-range attraction):** type-compatible cells within a small band
  may attract, enabling bonds to form on contact (genome-gated).
- **Drag:** `F_drag = -c · v`.
- **Thrust:** mover cells apply force along orientation, magnitude from a brain
  output; energy cost ∝ thrust².
- **Spatial hash:** uniform grid, cell size = interaction cutoff (≈ 2·maxRadius).
  Counting-sort cells into buckets each tick (typed arrays:
  `bucketStart/bucketCount/sortedIndices`); neighbour iteration over 3×3 buckets.
- **Force formulation:** the parallel-friendly **gather** form (each cell sums
  forces from neighbours itself; no cross-thread writes). This forfeits Newton's
  third law and so does ~2× the pair work — a known constant factor folded into
  the force budget, the price of lock-free Worker parallelism.

### 4.5 Energy economy (the invisible hand of selection)
No explicit fitness function — survival and reproduction under the energy budget
*is* selection. Energy is held **per cell**; organisms behave as a shared economy
via transfer. Every term is a **tunable parameter** (balancing is a first-class,
ongoing task; §10 R1):

- **Gains:** `photosynthesisGain ∝ localLight · area` (photo cells, depletes the
  local patch); `digestionGain` = rate × efficiency(<1) when a digestive cell is
  adjacent to edible food/meat/cell.
- **Costs (per tick):** `basalCost` (∝ size), `moveCost ∝ thrust²`, `neuralCost`
  (per active neuron/synapse), `bondCost` (per bond).
- **Intra-organism energy transfer (load-bearing):** energy diffuses along bonds
  toward needier cells, so photo-cells can feed structural/neuron/mover siblings.
  *Without this, only autotrophs are viable and the multicellular vision is dead.*
  Transfer rate/efficiency are tunable.
- **A concrete payoff for multicellularity** (so bonding isn't pure cost) — at
  least one of: size-based predation refuge, faster collective locomotion, or
  higher digestion efficiency when digestive cells cluster. Pinned before M5.
- **Death:** a cell with `energy ≤ 0` dies and becomes a meat cell holding a
  fraction of its mass as energy; if it bridged an organism, the organism may
  split (§4.8).
- **Reproduction:** when an organism's aggregate energy ≥ `reproThreshold`, it
  spends energy to produce an offspring. The parent **provisions the seed with an
  energy reserve sufficient to complete development** to a self-sustaining state
  (maternal investment). Interrupted/under-provisioned development aborts cleanly
  to a viable sub-organism, or does not start — never a half-grown corpse.
  *Without provisioning, complex morphologies cross the development valley less
  reliably than simple ones and the system regresses toward unicellularity.*
- **Failure modes (all monitored from M2):** **(primary) stable low-diversity
  monoculture**, extinction, and grey goo. Genotypic + phenotypic **diversity is a
  continuously-tracked health metric**; a diversity collapse is a *failed run*
  even if the population is numerically healthy.

### 4.6 Neural networks (made of neuron cells)
- **Topology is snapshotted, not live.** A neuron-cell network is a directed,
  weighted recurrent graph. It is **instantiated at the end of development** into
  the synapse edge pool (§5.2) and re-derived **only on structural events**
  (cell/bond birth/death, organism split) — **never recomputed per tick from
  positions** (locomotion deliberately moves cells; a position-derived topology
  would flicker and be unevolvable).
- **Wiring comes from the genome's connection-rule table** (§4.7), keyed by
  `(presynaptic cell-type/gene → postsynaptic cell-type/gene)` with weight + sign,
  realised over the developed cell adjacency. The same table also binds
  `sensor → neuron` and `neuron → mover` I/O. Because rules are keyed by gene/type
  (not instance), a single rule consistently wires *all* instances a recursive
  body produces — this is the addressable locus blocker #3 was about.
- **Recurrent, one synchronous step per tick:**
  `a_j(t) = φ(bias_j + Σ_i w_ij · a_i(t−1))`, φ = tanh (genome-selectable later).
  Persistent activations give memory → natural locomotion oscillators.
- **Dangling activations:** when a neuron dies or an organism splits, severed
  synapses are pruned and dangling activations zeroed in the same structural pass.
- **Sensor input vocabulary (extensible, finalised at M3/M4):** local
  food/chemical gradient, contact & pressure, own/organism energy, ambient light,
  local cell density, an internal clock/oscillator.
- **Effector outputs:** mover thrust magnitude (and turn); later bond-release,
  reproduction-trigger, etc.

### 4.7 Genome & development (generative encoding)
- **Genome = a growth recipe**, not a blueprint. Three parts:
  1. **Cell genes** — parameter sets defining a cell-type's expression (base
     palette type, size, sensor channels, neuron params, mover params, adhesion
     affinities, colour). Each gene carries a heritable **innovation/historical
     ID** (added from M6 — cheap early, painful to retrofit at M9 crossover) for
     homology tracking.
  2. **Development program** — a graph of division rules:
     `(parentGene, condition[stage/energy]) → produce childGene at angle θ, bond
     stiffness k, [recursion/repeat count]`.
  3. **Connection-rule table** — `(preGene → postGene) ⇒ weight, sign` defining
     synapses and sensor/effector binding (§4.6).
- **Development is a self-contained deterministic procedure** (decoupled from live
  physics): grow the body in an abstract parametric space (parent-relative
  angles/rest-lengths) with a fixed seeded rule-firing order (BFS over a rule
  queue) → a cell/bond/synapse list; **then** instantiate into world space and let
  physics relax. (If development instead ran amid live collisions, the M6
  "reproducible body" guarantee would have to weaken to statistical — we choose
  the isolated model so it stays exact.) Hard caps on **cells-per-organism** and
  **recursion depth** bound runaway rules.
- **Mutation operators:** Gaussian perturbation of numeric params; add/delete/
  duplicate a gene or rule; rewire a rule target; change cell type; **change a
  connection-rule weight** (now has a real target — the table, not a phantom
  synapse); **duplicate a subgraph** (the key driver of complexity growth). Rates
  tunable.
- **Reproduction:** asexual first — copy + mutate genome, provision + grow
  offspring (§4.5). Sexual reproduction (crossover of gene graphs, using
  innovation IDs for alignment) is M9+.

### 4.8 Organisms, bonds, lifecycle
- An **organism** is a connected component of bonded cells sharing a genome.
  Membership lives on `organismId`, maintained incrementally as bonds form/break.
  Organism bookkeeping: total energy, cell count, centroid, age, brain ref.
- **Bond formation** can use union-find. **Bond breakage (the hard case)** —
  union-find cannot delete — uses: on break, BFS from one endpoint bounded by
  component size; if the other endpoint is unreached, relabel the smaller side
  with a fresh `organismId` and partition organism aggregates (energy/cell-count
  by traversal; recompute centroid). A per-tick guard caps/batches split-checks.
  A deterministic M5 test forms a chain, breaks the middle, and asserts two
  organisms with correctly partitioned energy/count.

## 5. Software architecture

### 5.1 Module structure & boundaries
```
src/
  core/            # PURE, headless, no DOM/Worker deps — the engine
    math/          #   vec2, seedable counter-based RNG, constants
    memory/        #   SoA pools (AB/SAB-agnostic), free-list, generation[], edges
    spatial/       #   uniform spatial hash
    physics/       #   forces, integrator
    cells/         #   palette, per-type behaviour, metabolism
    environment/   #   resource fields, diffusion/regeneration, food spawning
    neural/        #   network construction + synchronous forward pass
    genome/        #   encoding, deterministic development, mutation
    organism/      #   connected components, bonds, lifecycle, splits
    sim/           #   World, tick orchestration, Config, READS/WRITES contract
  render/          # WebGL2 instanced renderer (read-only views over core)
  app/             # Vite browser app: viewer, controls, inspector
  headless/        # Node CLI: batch runs, evolution experiments
  workers/         # Worker entry + spatial/organism partitioning (M8)
```
**Boundary enforcement (layered, because import-direction rules alone are
insufficient):**
- `architecture.json` import rules: `core/` must not import `render/`, `app/`,
  `workers/`; an intra-`core/` layering DAG (e.g., `math` ← `memory` ← `spatial`
  ← `physics` …).
- An **ESLint/AST rule** forbids ambient DOM/Worker globals (`self`, `postMessage`,
  `window`, `document`) in `core/` — import-direction rules can't catch ambient
  globals.
- `render/` receives **read-only views** of core state (a mutating call is not an
  import, so it can't be caught by import rules).

### 5.2 Memory layout
- SoA typed arrays that are **agnostic to `ArrayBuffer` vs `SharedArrayBuffer`**
  (identical typed-array views over either). Default to a **single backing buffer
  with byteOffset views** (one allocation; simple partition arithmetic) over N
  separate buffers.
- **Capability fallback:** if `crossOriginIsolated` is false (no COOP/COEP), fall
  back to plain `ArrayBuffer` + single-thread so dev/demo always runs.
- Capacity pre-allocated to a configurable `maxCells` (up to ~1M slots).
- **Free-list** of dead slots for O(1) recycle; **`generation[]`** parallel array
  for stale-reference detection (§4.2) — not bit-packed.
- **Edge pools:** flat SoA pools for **bonds** and **synapses** (each with a
  free-list) **plus a per-cell adjacency** structure (fixed-max-degree slots, or
  CSR rebuilt per tick) with a stated **degree cap**, so step-5 FORCES and step-8
  split-checks are O(degree), and cell-death edge-reaping touches only that cell's
  adjacency. `maxBonds`/`maxSynapses` are explicit Config with an overflow policy
  (refuse-new vs grow) — not derivable from `maxCells`.

### 5.3 Single-thread reference vs Worker mode
- The engine runs single-threaded by default — the **reference/oracle**: clean,
  debuggable, the basis for all deterministic tests.
- Worker mode (M8) **avoids the data-migration rewrite** (SoA + shared buffer from
  day one), **but is not "just mechanical"**: it still requires a barrier design,
  **toroidal halo exchange** across worker tile boundaries, an allocator/
  structural-phase synchronisation step, and **two partition schemes** — physics
  by **spatial tile**, neural by **organism graph**. Exact float-order determinism
  is not preserved across threads (acceptable per D7; deterministic tests run
  single-threaded). M8's "matches the reference" is defined by a concrete
  statistical metric + tolerance (§8 M8).

### 5.4 Configuration & parameters
All economy/physics/mutation/environment constants live in a single typed,
serialisable `Config`. Worlds are reproducible from `(Config, seed)` (§6). Config
includes the **world-span/precision budget**, `maxCells`, `maxBonds`,
`maxSynapses` + overflow policy, degree cap, cells-per-organism cap, recursion
depth cap, and every economy coefficient. This is the surface for balancing and
experiments.

## 6. Testing strategy (TDD)

Reproducibility is an **engineered invariant**, specified, not assumed:
- **(a) Canonical iteration order** for all phases — dense index order over a
  compacted live-set (or a stable sort), **never** free-list/insertion/death
  order.
- **(b) Per-subsystem seeded RNG substreams** (physics-jitter, mutation, spawn)
  via a splittable/counter-based generator, so adding a draw in one subsystem
  doesn't shift another's stream.
- **(c) A fixed within-tick draw order.**

**Test tiers:**
1. **Unit (deterministic):** vec math; RNG; spatial hash (returns exactly the
   true neighbours); force calc (direction/magnitude); integrator (stability, no
   NaN, far-coordinate precision); metabolism (energy bookkeeping); NN forward
   pass (known weights → known activations); deterministic development (seed →
   identical body); each mutation operator.
2. **Golden-tick integration (deterministic):** hand-built 1–3 cell worlds with
   fixed `(Config, seed)` asserting **exact post-tick state** for each integration
   concern — energy bookkeeping across a full tick, dead-cell force exclusion,
   sensor/THINK temporal coupling, a bond spring relaxing to `restLen`. Asserts
   against the §4.3 READS/WRITES contract. These live in M2–M5 acceptance, not the
   visual-smoke catch-all.
3. **Property / invariant:** energy never negative; conservation where expected;
   population within `[0, maxCells]`; no NaN/Inf; cells never escape toroidal
   bounds.
4. **Whole-run reproducibility:** same `(Config, seed)` run twice → **byte-identical
   SoA arrays after N ticks** (single-thread). Added in M0/M1.
5. **Statistical (whole sim), contract defined before M7:** a fixed seed set
   (e.g., 20), a concrete metric (e.g., mean trait at tick T, or fraction of
   energy from digestion vs photosynthesis), a one-sided test with explicit
   effect-size / p threshold, and an explicit extinction-handling rule. Plus
   genuine **emergence proxies**: late-run phenotype novelty, trophic-level count,
   mean expressed cell-types/organism trending up (not collapsing to 1).
6. **Zero-allocation enforcement:** a Node `--expose-gc` test ticks N times, forces
   GC, and asserts `heapUsed` growth below a measured floor+margin. Wired into CI
   and kept active beyond M0 (with births/deaths live).
7. **Visual smoke:** a headless run asserts "after N ticks, M cells alive within
   range" to catch gross regressions.

Discipline: red → green → refactor per the test-driven-development skill.

## 7. Tooling & conventions
- **TypeScript** strict: `strict`, `noUncheckedIndexedAccess`,
  `exactOptionalPropertyTypes`, `noImplicitOverride`.
- **Vite** (dev/build; native Worker support) — configured to emit **COOP/COEP
  headers from M0** so `SharedArrayBuffer` works in-browser day one; verify the
  deploy target can emit these headers and that `COEP:require-corp` won't break
  CDN/font/analytics loads.
- **Vitest** (unit/golden/integration; watch; coverage).
- **ESLint** (`typescript-eslint` type-checked) + custom AST rule for §5.1 + **Prettier**.
- **pnpm** via corepack.
- **beads (`bd`)** for git-native issue tracking (installed).
- **GitHub Actions CI, tiered:** fast deterministic tiers (1–4, 6) gate **every
  PR**; slow evolutionary/statistical runs (tier 5) run on a **nightly** job (a
  multi-thousand-tick run cannot gate every PR).
- **Makefile** is the canonical interface: `make help / dev / test / test-stat /
  check / lint / typecheck / build`.
- **architecture-guard** (`architecture.json`) + the ESLint AST rule enforce §5.1.
- **ADR log** at `docs/decisions/INDEX.md`; specs at `docs/superpowers/specs/`.

## 8. Milestone roadmap

**Cell-count regime table** (replaces any single headline number; each figure
assumes the stated neuron fraction / fan-in, finalised as we measure):

| Regime | Expectation |
|---|---|
| Inert cells, single-thread (M1) | ~100k+ interactive |
| Fully-living cells, single-thread (≤M7) | ~10–50k interactive; more in headless fast-forward |
| Fully-living cells, multi-worker (M8) | 100k+ interactive; 500k–1M headless |

Each milestone is runnable + tested before the next begins.

| # | Milestone | Adds | Acceptance criterion |
|---|---|---|---|
| **M0** | Foundation & tooling | Repo, strict TS, Vite (**COOP/COEP**), Vitest, beads, tiered CI, Makefile, math + **counter-based seedable RNG**, **AB/SAB-agnostic SoA** with `generation[]` + free-list, architecture guard + ESLint AST rule, docs | `make check` green; empty `World` ticks N times; **zero-alloc heap test passes**; **same-(Config,seed) run twice → identical arrays**; runs with SAB *and* with the ArrayBuffer fallback |
| **M1** | Particle core | SoA cell store, spatial hash, repulsion, drag, **Float64** integrator, fixed-tick loop, **WebGL2 point renderer** | **100k inert cells repel into an even spread, pan/zoom, interactive fps** — the first prototype; far-coordinate precision test passes |
| M2 | Metabolism | Per-cell energy, **patchy/depleting** light field, plant/meat food, digestion, death→meat, field diffusion/regeneration, **diversity + economy telemetry** | Cells live/die by food; populations breathe; telemetry dashboards show diversity/energy flows; golden-tick energy test passes |
| M3 | Sense + move | Mover & sensor cells, a hardcoded chemotaxis reflex (pre-neural) | A single cell visibly climbs a (patchy) food gradient |
| M4 | Neural nets | Neuron-cell recurrent networks from a **snapshotted synapse set** (decoupled from physical bonds, so M4 needs no bond dynamics); sensor→neuron→mover; synchronous double-buffer | A hand-wired multicellular critter swims to food via its neuron-cell brain |
| M5 | Multicellularity | Bond formation/breakage, adhesion, **split-on-break algorithm**, organism aggregates, **intra-organism energy transfer**, a concrete multicellular payoff | Hand-built organisms hold together, share energy, locomote; split-on-break test passes |
| M6 | Developmental genome | Genome (genes + rules + **connection-rule table** + innovation IDs), **deterministic isolated development** with caps, **maternal provisioning**, asexual reproduction | Organisms reproduce; offspring resemble parents (seed → reproducible body); **a hand-authored genome develops into the M4 critter** (proves the encoding can represent that wiring); births-reaching-adulthood tracked |
| M7 | Evolution | Mutation operators, natural selection via the economy, long headless runs, statistical-test contract | **(a)** plumbing gate: a measurable trait shifts under pressure; **(b)** emergence proxies: a stable 2nd trophic level appears and/or late-run phenotype novelty persists and/or mean expressed cell-types/organism trends up. Default starting condition: **seeded from the hand-built M4/M6 critter** (see §10) |
| M8 | Parallelism | Hot kernels (1,3,5,6) → Workers + SAB; spatial-tile physics partition + organism-graph neural partition; barriers; toroidal halo exchange | 500k–1M cells headless; 100k+ interactive; Worker path matches reference within a defined statistical tolerance; throughput scales with cores |
| M9+ | Deepening | Sexual reproduction/crossover (innovation-ID alignment), gene-regulatory networks, temperature/toxins/currents/seasons, predator dynamics, speciation & phylogeny viewer, save/load worlds, metrics dashboard | Open-ended |

## 9. Slicing methodology
**Milestone → Epic → small beads issues.** Example M1 →
`{SoA cell store, spatial hash, repulsion force, Float64 integrator, tick loop,
WebGL2 renderer}` → each epic → 2–5 tiny issues. Every landed issue carries:
*what changed · the test that proves it · what you should see*. beads tracks
dependencies, so the next ready task is always explicit. Subagent-driven
execution is the default, with frequent reviewable checkpoints.

## 10. Key risks & open questions
- **R1 — Selection gradient / monoculture collapse (highest risk).** The *primary*
  failure mode is a stable low-diversity monoculture (not just extinction/grey
  goo). Mitigation: patchy/depleting resources, density-dependent regulation,
  maternal provisioning, intra-organism transfer, diversity-as-health-metric, all
  costs tunable, telemetry from M2.
- **R2 — Developmental encoding tractability (M6).** Generative genomes are
  research-grade. Mitigation: start minimal, deterministic isolated development,
  caps, the "genome represents the M4 critter" acceptance test, deepen later.
- **R3 — Evolvable neuron-cell networks (M4/M7).** Mitigation: validate with
  hand-wired brains (M4) and the connection-rule encoding before trusting
  evolution (M7).
- **R4 — TS perf ceiling before M8.** See the §8 regime table. Mitigation: SoA +
  Float64 positions from M1, headless fast-forward, M8 unlocks scale.
- **R5 — SharedArrayBuffer requirements.** COOP/COEP land in M0; capability-checked
  ArrayBuffer fallback keeps dev/demo working.

**Open questions for the user (recommended defaults chosen; confirm or adjust):**
- **Q-A — Falsification / stopping rule for balancing.** *Recommendation:* commit
  before M7 to a concrete falsification criterion — e.g., "if after N tuned
  configurations no run produces a stable second trophic level or sustained
  late-run phenotype novelty, we reject the developmental-encoding + pure-energy-
  selection approach in favour of a scaffolded alternative." Prevents indefinite
  tuning against an unclimbable search space.
- **Q-B — Seed M7 from the hand-built critter, or from random genomes?**
  *Recommendation:* seed M7 from the hand-built M4/M6 sensorimotor critter (random
  genomes face a deep fitness valley — paying neural+move cost before any
  functional loop exists — that asexual clone+mutate may never cross). Keep
  from-scratch open-endedness as an aspirational M9+ experiment, so the first
  evolution milestone isn't gated on crossing that valley.

## 11. Control surface & observability (interactive tuning & experimentation)

A first-class goal: tuning knobs live and watching what emerges is a primary
source of the project's value. The serializable `Config` (§5.4) is the backbone —
every coefficient is a knob. Interactivity is a **continuous thread alongside the
engine**, not a single milestone. Three layers:

**1. Live parameter tuning (write-side).** A control panel binds `Config` fields
to sliders/inputs, applied to the running sim with no restart for most parameters:
economy (basal/move/neural/bond costs, photosynthesis & digestion gains,
reproduction threshold, maternal-provisioning fraction, intra-organism transfer
rate, meat decay, death-energy fraction); environment (light patch
density/intensity/regen, food spawn rate, crowding penalty; later
temperature/toxins/currents/seasons amplitude & period); physics (drag, repulsion
& bond stiffness, max strain, adhesion, dt, substeps); mutation (per-operator
rates, σ, recursion-depth & cells-per-organism caps). Buffer-resizing knobs
(`maxCells`, world span, `maxBonds`/`maxSynapses`) are **restart-required**; the
rest are **live**. `Config` exports/imports as JSON, so a `(Config, seed)` pair
reproduces a run (single-thread) — shareable "the seed that grew this creature."

**2. Time & world control.** Play/pause, single-step, speed multiplier
(1×–1000×), headless fast-forward then resume render; set/reseed; save/load world
snapshots (serialize SoA + Config); reset; spawn presets. **"Hand of god" tools:**
click/drag to spawn food, paint light/nutrient/toxins, drop a predator, or cull a
region — apply selection pressure by hand and watch the response.

**3. Observation (read-side — equally where the fun is).** Click a cell/organism
to inspect energy/type/age/genome; a **brain inspector** renders the neuron-cell
network with live activations; lineage/ancestry view. Colour by
type/energy/organism/age/lineage/neural-activity; overlays for the light field,
food density, velocity, bond network; follow-cam locks to an organism. **Telemetry
dashboards (from M2):** live time-series of population, mean energy, **genotypic &
phenotypic diversity**, trophic-level counts, mean expressed cell-types/organism,
births/deaths — the same metrics that define run health (§4.5) and the statistical
tests (§6). **Experiment runner (M7+):** headless **parameter sweeps** (vary a knob
× N seeds, plot outcomes to find phase transitions), A/B worlds, a pinned-genome
library, record/replay, GIF/video export.

**Per-milestone control-surface deliverables:** **M1** time controls + camera +
colour-by-type + core physics knobs + HUD; **M2** economy/light knobs + telemetry
charts + light heatmap + basic inspect; **M3** sensor/mover knobs + gradient
overlay + follow-cam; **M4** brain inspector; **M5** bond-network overlay +
organism inspector + energy-flow viz; **M6** genome/lineage inspector + mutation
knobs + save/load; **M7** experiment/sweep runner + phylogeny tree + "hand of god"
tools; **M9+** scenario presets + A/B + record/replay.

## 12. Glossary
- **Cell** — the atomic entity; an index into SoA arrays.
- **Organism** — a connected component of bonded cells sharing a genome.
- **Palette** — the fixed set of cell capability types.
- **Genome** — a developmental recipe (cell genes + division rules + connection-rule table).
- **Development** — deterministically growing an organism from a seed cell in isolated parametric space, then instantiating into the world.
- **Connection-rule table** — `(preGene → postGene) ⇒ weight/sign`; the addressable locus for synapse weights.
- **Energy economy** — the gain/cost/transfer system that drives natural selection.
- **SoA** — structure-of-arrays; parallel typed arrays indexed by entity id.
- **Tick** — one fixed-timestep simulation step.
- **Reference/oracle** — the single-threaded engine that deterministic tests trust.

## 13. Changelog
- **2026-06-15 — Initial design** approved via interactive brainstorming.
- **2026-06-15 — Hardened by adversarial review** (4-lens workflow). Resolved 4
  blockers (monoculture gradient; per-cell-vs-organism energy contradiction +
  intra-organism transfer; synapse-weight encoding locus; engineered
  reproducibility) and ~13 major/minor findings (Float64 positions; separate
  `generation[]`; THINK as a hot organism-partitioned kernel; cell-count regime
  table; snapshotted synapse topology; deterministic isolated development +
  maternal provisioning; split-on-break algorithm; edge-pool/adjacency/degree-cap;
  AB/SAB-agnostic SoA + COOP/COEP + fallback; golden-tick test tier + statistical
  contract + zero-alloc enforcement; tiered CI; ESLint AST boundary rule;
  innovation IDs). Two judgment calls surfaced to the user (§10 Q-A, Q-B).
- **2026-06-15 — Q-A & Q-B resolved** with the recommended defaults (falsification
  criterion before M7; M7 seeded from the hand-built critter).
- **2026-06-15 — Added §11 Control surface & observability** as a first-class
  continuous thread (live Config tuning, time/"hand of god" controls, inspection &
  telemetry, experiment/sweep runner), per user priority on interactive tuning.
