# Draft inventory: what the life-sim draft knows

Port inventory of the existing `life-sim` codebase, written to feed the Tidepool rebuild.

- Source tree: `main` at `a23afc9` (2026-09-28). Read-only pass. No simulation was run for this document.
- All `path:line` references are relative to the repo root.
- `lw:N` means `src/app/living-world-config.ts:N` (the demo overrides).
- `memory/<name>.md` means a file in the owner's local agent memory directory for this project, outside the repo. These are dated owner notes. Appendix A lists where they have drifted from the code.
- "Demo" means `defaultConfig({...livingWorldOverrides})`. It is the only configuration with ecological measurements behind it.
- Numbers marked MEASURED come from the notes, plans and config comments. They were not re-run here.

## 0. Read this first

1. **Interaction reach against local spacing decides everything.** At 8192² with creatures spread thin, nearest-neighbour distance was about 75 u against a 16 u bite and a 12 u mate reach. Predation, mating, crowd sensing and vision were all dead until density was concentrated into small deep pockets. See C1 to C4.
2. **One resource gives one species.** A single food field produced a monoculture on every seed. Extra channels gave a split that collapsed by about 8,000 ticks. Only an income penalty on generalists held a split to 20,000 ticks. See C5 to C7.
3. **Every income channel needs a satiation stop, and energy gain above 1 is an energy printer.** The uncapped channels each produced a runaway. See C12, C13.
4. **Predators are founding-limited and cannot be obligate.** They need a plant fallback, a size advantage at seeding and clustered seeding. Throttles that look correct on paper (handling time, tighter caps) drive them extinct. See C8 to C11.
5. **Wired is not recruited.** Most brain inputs, all three brain-gated action outputs, the mate-choice genes and within-life learning are correct code that evolution does not use at demo scale. See C20 to C24 and section 6.
6. **Turn rate was independent of speed.** That is the root cause of the spinning creatures. The kinematic fix works on spin and kills the ecology, because prey can no longer evade. Tidepool must design steering and escape together. See C17.
7. **Short horizons lie in both directions.** 6,000-tick readings were wrong both ways. The gate is 12,000 ticks, at least 3 seeds, paired with a same-protocol baseline. Tidepool's time-skip makes long-horizon stability a product feature. See C33, C34.
8. **The draft has no save or load, no ancestry in core, no touch input, no god tools and no worker.** All five are Tidepool requirements. See section 7.
9. **Draft lives last 300 to 500 ticks and a tick costs about 8 µs per creature.** A 3 to 6 minute life and a multi-generation time-skip need new arithmetic and a much cheaper tick. See C28.

## 1. Tick pipeline

`World.step()` is `src/core/world.ts:372-508`. Order is exact.

Cost classes: **L** = live creatures. **C** = pool capacity. **G** = grid cells. **P** = live plants. **k** = neighbour buckets scanned.

| # | Step | Call site → kernel | Cost | Notes |
|---|---|---|---|---|
| 1 | Rebuild ascending creature live list | `world.ts:375` → `store.ts:274-285` | C (32,768) | Scans every slot |
| 2 | Build creature spatial hash (start-of-tick positions) | `world.ts:376` → `spatial-hash.ts:57-82` | G_hash + L | Clears and prefix-sums every bucket. 682² = 465,124 buckets in the demo (`spatial-hash.ts:36`, cell = 2·cellRadius `world.ts:130`) |
| 3 | Drift pocket centres, recarve fertility | `world.ts:381` → `food-field.ts:459-495` | pockets × G every `fertilityDriftInterval` ticks | Off in the demo (`lw:82`) |
| 4 | Parcels: spawn, advect, decay | `world.ts:386-389` → `parcels.ts:128-166` | C_parcel (120) | Own RNG stream |
| 5 | Sense food gradient | `world.ts:390` → `sense.ts:37-114` | L × 4 samples × channels | Reads the field as the previous tick left it (`sense.ts:5-6`) |
| 6 | Sense fertility under body | `world.ts:391` → `sense.ts:394-407` | L | No-op when `bodySense` is false (`sense.ts:396`). False in the demo (`lw:118`) |
| 7 | Sense walls, flow, 4 scent channels, glow | `world.ts:392-399` → `sense.ts:119-174` | L × ~26 grid reads | Allocates result objects per creature (`walls.ts:205`, `phero-field.ts:78` via `sense.ts:137,166`) |
| 8 | Sight: cone scan of creatures, then parcels | `world.ts:400` → `sense.ts:192-349` | L × (2·cr+1)² buckets + L × C_parcel | cr = ceil(range/cell) capped at 96 (`sense.ts:190,244`). Founder vision 140 u gives 625 buckets per creature. The dominant per-creature cost |
| 9 | Sense crowding | `world.ts:401` → `sense.ts:355-388` | L × k | No-op when `bodySense` is false |
| 10 | Brain forward pass, set heading and thrust force, lay eligibility traces | `world.ts:402` → `brain.ts:55-546` | L × 185 weights | SETS `forceX/Y` (`brain.ts:419-420`) |
| 11 | Deposit glow | `world.ts:406-413` | L | |
| 12 | Add flow push force | `world.ts:415` → `physics.ts:77-89` | L | ADDS to force |
| 13 | Add soft repulsion force | `world.ts:416` → `physics.ts:25-69` | L × 9 buckets | ADDS to force |
| 14 | Integrate, speed clamp, swept wall collision, wrap | `world.ts:417-428` → `physics.ts:97-155` | L | Allocates a collision result per creature (`walls.ts:183`) |
| 15 | Rebuild creature hash at post-move positions | `world.ts:431` | G_hash + L | Second full clear per tick |
| 16 | Rebuild plant hash | `world.ts:435` → `plants.ts:173-175` | 65,536 buckets + P | Plants never move. A dirty flag was deferred (`world.ts:432-434`) |
| 17 | Hunt | `world.ts:436` → `economy.ts:64-157` | predators × 25 buckets | |
| 18 | Parasite attach or drain | `world.ts:439` → `economy.ts:176-247` | parasites × 81 buckets | |
| 19 | Sync riders to host position | `world.ts:440` → `world.ts:39-65` | L | |
| 20 | Eat parcels | `world.ts:443` → `economy.ts:522-536` | L × C_parcel | Linear scan per creature (`parcels.ts:182-205`) |
| 21 | Metabolize: graze, upkeep, move cost, taxes, age | `world.ts:446` → `economy.ts:271-512` | L | |
| 22 | Cull dead, record death positions | `world.ts:447` → `economy.ts:542-563` | L | Frees slots. Does not rebuild the live list |
| 23 | Scavenge | `world.ts:450` → `economy.ts:575-645` | deaths × 25 buckets | |
| 24 | Learn | `world.ts:455-456` → `brain.ts:579-621` | L × 84 weights walked | 6 of the 84 are biases and are skipped (`brain.ts:604-612`). Runs after every energy-moving pass (`world.ts:451-454`) |
| 25 | Reproduce | `world.ts:457-465` → `economy.ts:766-890` | L + seekers × 49 buckets | The only draw on `world.rng` inside a tick |
| 26 | Rebuild creature live list | `world.ts:468` | C | Newborns become visible to the next tick |
| 27 | Food field: regrow, diffuse, advect | `world.ts:470-475` → `food-field.ts:676-690` | G × 3 channels | G = 128² = 16,384 (`config.ts:934-935`) |
| 28 | Scent deposit, then diffuse and decay 4 channels | `world.ts:478-485` | L + G × 4 | |
| 29 | Plants: grow, upkeep, age, seed, cull | `world.ts:491` → `plants.ts:319-371` | P × 9 buckets + C_plant | |
| 30 | Plant scent deposit, diffuse, decay | `world.ts:492-497` | P + G × 2 | |
| 31 | Glow field diffuse and decay | `world.ts:501-506` | G | |
| 32 | `tick++` | `world.ts:507` | | |

```mermaid
flowchart LR
  A[live list + hash] --> B[sense: fields, sight]
  B --> C[brain: steer]
  C --> D[forces + integrate]
  D --> E[hash again]
  E --> F[hunt, parasite, parcels]
  F --> G[metabolize]
  G --> H[cull + scavenge]
  H --> I[learn]
  I --> J[reproduce]
  J --> K[fields + plants]
  K --> A
```

### Fixed cost per tick, independent of population

- Two creature-hash clears of 465,124 buckets (`spatial-hash.ts:60,69-73`).
- Two live-list scans of 32,768 slots (`store.ts:277`) and one of the plant pool (`plants.ts:163-168`).
- Ten full diffusion passes over 16,384 cells: 3 food, 4 scent, 2 plant scent, 1 glow.

### Measured cost

| Config | Population | ms/tick | Source |
|---|---|---|---|
| Demo, plants off, headless, loaded machine | 5,367 / 70 / 10,292 (seeds 1/2/3) | 66.56 / 16.57 / 86.85 | `plans/2026-09-plants-as-entities.md:576-587` |
| Same, plants on | same | 1.09× | `plans/2026-09-plants-as-entities.md:604` |
| Earlier lighter config | ~1,600 | ~4.8 | `memory/rebuild-predation-dead.md` |

The plan states the cost as "roughly 8 µs per creature per tick" (`plans/2026-09-plants-as-entities.md:586`). Step 8 scales with vision range squared.

### Ordering rules that later code depends on

- Senses read fields with a one-tick lag (`sense.ts:5-6`).
- Sight uses the start-of-tick hash. Hunt, parasites, scavenging and mate search use the post-move hash (`world.ts:429-431`).
- Steer sets the force buffer. Flow and repulsion add to it. Steer must run first (`physics.ts:22-23,73-74`).
- `cullDead` frees slots and leaves the live list stale. Every later pass in the tick must check liveness itself: learn (`brain.ts:592`), scavenge (`economy.ts:615`), mate search (`economy.ts:677`), reproduce (`economy.ts:786`).
- Reproduce runs after cull, so a newborn can take a slot freed in the same tick. Reproduce guards on the generation id captured at the last live-list rebuild (`economy.ts:775-786`, `store.ts:145-148`).
- RNG-free skips in reproduce (maturity, cooldown, viability, breed gate) all sit before any allocation or draw (`economy.ts:787-817`).
- Plant step order is grow → upkeep → age → seed → cull. Upkeep is outside the growth clamp and can make energy negative, so the cull must follow it before anything reads energy (`plants.ts:12-16`).

### RNG streams

| Stream | Seed | Draws | Where |
|---|---|---|---|
| World | `cfg.seed` | Pocket centres and peaks, founder placement and genomes, births | `world.ts:124,197,277-339`. `economy.ts:707`. `genome.ts:379-382,810-812` |
| Pocket K scale | `rng.fork(0xc)` | One per pocket | `world.ts:205` |
| Pocket drift | `rng.fork(0x5eed)` | Drift directions | `world.ts:218` |
| Walls | `seed ^ 0x9e3779b9` | Region seeds, three generators | `walls.ts:22,242` |
| Walls pocket reconstruction | `seed ^ (0x9e3779b9 · 3)` | A second, different set of pocket centres | `walls.ts:345,361` |
| Flow | `seed ^ 0x85ebca6b` | Noise lattice | `flow-field.ts:4,69` |
| Parcels | `seed ^ 0x27d4eb2f` | Hotspots, spawns | `parcels.ts:21,55` |
| Plants | `seed ^ 0x6a09e667` | Founders, dispersal, mutation | `plants.ts:32,134` |
| Temperature, light | Integer hash of `seed ^ salt`, no stream | Gradient axis and phase | `abiotic.ts:19-25,35-36,63-64` |

Both forks at `world.ts:205,218` are taken before `seedPatches` draws, so they derive from the raw seed. `fork` does not advance the parent (`rng.ts:65-69`).

## 2. Module table

Verdicts are judged against the locked Tidepool decisions: one creature steered by the player, part-based bodies, NEAT-style recurrent brains, a tall non-wrapping map with depth zones, sexual reproduction, evolution only in v1, stack undecided.

### `src/core`

| Module | Purpose | Verdict | Why |
|---|---|---|---|
| `rng.ts` | Seeded mulberry32 with pure sub-stream forks | PORT ALGORITHM | 70 lines, integer-only core, trivial to port to Rust. See 3.1 |
| `hash.ts` | FNV-1a state fingerprint | PORT ALGORITHM | The determinism test is the one invariant that held all project. See 3.2 |
| `store.ts` | Creature SoA pool with free stack and generation ids | PORT ALGORITHM | The pool discipline carries. The 40-array field list does not. See 3.3 |
| `spatial-hash.ts` | Counting-sort uniform grid | PORT ALGORITHM | Used by every interaction. Needs touched-bucket clearing and a non-wrapping variant. See 3.4 |
| `phero-field.ts` | Deposit, diffuse, decay scalar grid with wall no-flux | PORT ALGORITHM | Generic. Reused three times in the draft. See 3.5 |
| `plants.ts` | Rooted evolving producer pool | PORT ALGORITHM | Newest and best-derived module. Owner decision that plants are entities. See 3.7 |
| `walls.ts` | Fine occupancy grid: collision, line of sight, distance field, connectivity | PORT ALGORITHM | Rock shelves need exactly these queries. Drop the Voronoi biome compositing and the toroidal wrap. See 3.9 |
| `wall-gen/noise.ts`, `wall-gen/ca.ts` | Quantile-thresholded value noise. 4-5 cave automaton | PORT ALGORITHM | Small, deterministic terrain primitives. See 3.10 |
| `wall-gen/rooms.ts` | Random rectangles joined by L corridors | DROP | Rectilinear rooms do not fit a tidepool |
| `flow-field.ts` | Divergence-free current from the curl of a noise streamfunction | PORT ALGORITHM | Currents fit the setting. See 3.11 |
| `health.ts` | Read-only invariant scan (NaN, bounds, energy, gene range) | PORT ALGORITHM | Cheap and it surfaced real bugs in the browser. See 3.15 |
| `economy.ts` | Hunt, graze, upkeep, death, mate search, birth, parasites, scavenging | PORT ALGORITHM for `satiatedBar`, `hunt`, `cullDead`, the reproduce state machine and provisioning. PORT IDEA ONLY for parasites and scavenging. DROP the three-way channel graze | The kernels encode most measured fixes. See 3.13, 3.14 |
| `physics.ts` | Soft repulsion, flow push, symplectic Euler, per-creature speed cap | PORT IDEA ONLY | Collision radius is one global constant and heading is not a physical variable (`physics.ts:35`, `brain.ts:363-364`). Tidepool needs per-body size and turning tied to motion |
| `sense.ts` | Field gradients, sight cone, crowd count | PORT ALGORITHM for the cone scan with line of sight. PORT IDEA ONLY for the rest | The sight vector is pre-digested into "toward prey, away from threat" inside the sensor (`sense.ts:268`). An evolved brain must receive raw observations. See 3.12 |
| `food-field.ts` | Logistic biomass grid, three channels, Gaussian fertility pockets, pocket drift, advection | PORT IDEA ONLY | The owner already demoted it to soil fertility. Keep the fertility-map idea (3.8) and the conservative advection (3.6). 895 lines, most of it channel triplication |
| `scent-field.ts` | Four fixed identity channels built from diet and hue | PORT IDEA ONLY | In Tidepool glands emit and sense parts read. Channel layout must come from parts |
| `plant-scent.ts` | Plant smell as two channels split by a continuous species axis | PORT IDEA ONLY | Two channels encode a continuous axis by their blend (`plant-scent.ts:11-14`) |
| `abiotic.ts` | Seeded temperature and light fields with no RNG | PORT IDEA ONLY | Tidepool's fields are functions of depth. Keep the "pure function of position and seed" rule and the single `lightAt(x, y, tick)` seam (`plants.ts:177-183`) |
| `genome.ts` | 31 scalar genes with spec table, 185 fixed brain weights, mutation, crossover, genetic distance | PORT IDEA ONLY | Fixed layout cannot hold variable parts or NEAT genes. Keep the data-driven gene spec (centre, cost, min, max) and per-gene uniform-pick crossover |
| `brain.ts` | Linear map plus 4-unit tanh layer, reward-modulated Hebbian learning | DROP | Fixed topology, no recurrence, learning reaches 34% of weights and measured near-inert. Ideas worth keeping are in 3.16 |
| `world.ts` | Construction, seeding, tick order, state hash | PORT IDEA ONLY | Rewrite. Section 1 is the content to keep |
| `config.ts` | 232-field config interface and defaults | DROP | See section 6. Carry the constants in section 5 |
| `parcels.ts` | Sight-only drifting food motes | DROP | O(capacity) scans. Built to revive vision and measured null (C22) |
| `biomes.ts` | Hand-written gene and brain presets per wall region | DROP | Overwrites genes at seeding. No measurement shows a benefit. The bisect recorded a grazer monoculture at the biome commit on seed 1 at 6,000 ticks, and the cause is still open (C35) |

### `src/render`

| Module | Purpose | Verdict | Why |
|---|---|---|---|
| `renderer.ts` | WebGL2 point sprites, field heatmap quads, tick interpolation | PORT IDEA ONLY | 13 per-creature attribute buffers uploaded every frame (`renderer.ts:386-398`). Bodies with parts need instanced geometry. Keep wrap-aware interpolation between ticks (`renderer.ts:350-357,719-737`) |
| `palette.ts` | One source for colour ramps, interpolated into GLSL | PORT IDEA ONLY | Stops shader and UI ramps drifting apart (`renderer.ts:97-98`) |
| `overlay.ts` | Debug line geometry for one selected creature | PORT IDEA ONLY | Pure function over state. Already drifted from `hunt` (section 6) |
| `detail-overlay.ts`, `detail/*` | Canvas2D close-up bodies drawn by a registry of trait modules | PORT IDEA ONLY | The registry (one module per visible feature, z-ordered, LOD-tiered, `detail/registry.ts:11-23`) is the right shape for parts. The Canvas2D pass is too slow in dense areas (C36) |

### `src/app`

| Module | Purpose | Verdict | Why |
|---|---|---|---|
| `main.ts` | 986-line module-level script: loop, input, panels | DROP | Keep the loop rules in 3.17 |
| `living-world-config.ts` | The demo overrides, with the measurement behind each | DROP the file, carry the values | Its comments are the best-maintained record of why each value exists |
| `observability/lineage.ts` | Family forest fed by the birth hook | PORT ALGORITHM | Tidepool needs ancestry in core for "continue as a descendant". See 3.16 |
| `observability/history.ts` | Time-series snapshot every 200 ticks, CSV export | PORT ALGORITHM | See 3.16 |
| `observability/brain-view.ts` | Recomputes the brain for display | PORT IDEA ONLY | A mirror of `steer` that needs a parity test. Record activations in the sim instead |
| `observability/knobs.ts`, `settings-modal.ts` | Live and seed-time knobs | PORT IDEA ONLY | Keep the live versus rebuild split (`knobs.ts:4-5`) |
| `observability/world-stats.ts`, `graph.ts`, `distributions.ts`, `radar-view.ts` | Population summary, stacked trophic band, histograms, trait radar | PORT IDEA ONLY | Keep the metric definitions (C37) |
| `observability/follow-recorder.ts`, `inspector.ts`, `lineage-modal.ts`, `legend.ts`, `controls.ts`, `view-chips.ts`, `guide-modal.ts` | Follow camera log and DOM panels | DROP | DOM-specific |

### `src/headless`

| Module | Purpose | Verdict | Why |
|---|---|---|---|
| `demo-health-gate.ts` | Asserts the shipped config is alive, bimodal and turning over | PORT ALGORITHM | The only gate that certifies "healthy" and not just "not dead". See 3.18 |
| `harness.ts`, `run.ts` | Run the same core with no renderer | PORT IDEA ONLY | Tidepool's time-skip is this |
| `evolve-probe.ts`, `region-probe.ts`, `plant-probe.ts`, `spin-probe.ts`, `life-history.ts`, `predator-damping.ts`, `predator-damping-sweep.ts`, `mate-encounter-probe.ts` | Turnover, regional differentiation, plant sizing, spin, per-life observer, boom-bust A/B, mate feasibility | PORT IDEA ONLY | Keep the metric definitions. Each is tied to the old gene layout |
| About 30 other probes | One-off experiments | DROP | Several drifted from the demo config (`memory/codebase-review-2026-06-27.md`) |

## 3. Algorithms worth carrying over

### 3.1 Seeded RNG with pure forks

- **Layout:** one unsigned 32-bit state (`rng.ts:12`).
- **Next u32** (`rng.ts:27-32`): `s = (s + 0x6D2B79F5) mod 2³²`. `a = s`. `a = imul(a xor (a >>> 15), a or 1)`. `a = (a + imul(a xor (a >>> 7), a or 61)) xor a`. Return `(a xor (a >>> 14))` as unsigned.
- **Float:** `u32 / 2³²` (`rng.ts:35-37`). **Range:** `lo + float·(hi−lo)`. **Int:** `floor(float·n)`.
- **Gaussian:** Box-Muller with no cached spare, so the state stays one number. Reject `u = 0` (`rng.ts:53-58`).
- **Fork(id):** `h = s xor imul(id + 1, 0x9E3779B1)`. `h = imul(h xor (h >>> 16), 0x85EBCA6B)`. New generator seeded with `h`. Does not advance the parent (`rng.ts:65-69`).
- **Invariants:** drawn only at seeding and at births, never in per-tick kernels (`rng.ts:4-5`, `world.ts:371`). The state is part of the hash (`world.ts:567`).
- **Gotchas:**
  - The gaussian uses `log`, `sqrt`, `cos`. Those are not bit-identical across engines or languages. The draft only promised same-machine reproducibility.
  - Any rejection loop with an early exit makes the draw count depend on state. Founder placement breaks out on the first fertile hit (`world.ts:289-302`), so a change to its score function shifts every later draw (`plans/2026-09-plants-as-entities.md:675-678`).
  - All births share one stream. Adding a gene shifts every later draw, which forced the "tail-gating" machinery (`genome.ts:264-284`). Give each concern its own stream from the start, as plants and parcels did.
  - A full pool must draw nothing, so pool saturation cannot shift the stream (`parcels.ts:92-95`, `plants.ts:374-380`).

### 3.2 State fingerprint

- **Layout:** 32-bit FNV-1a. Offset basis `0x811C9DC5`, prime `0x01000193` (`hash.ts:11,18`).
- **Algorithm:** mix u32 values as 4 little-endian bytes and floats as their 8 raw IEEE-754 bytes (`hash.ts:22-34`).
- **What is hashed:** tick, RNG state, live count, then per live creature in ascending slot order: position, velocity, heading, energy, age, generation id, counters, every scalar gene, hue (`world.ts:564-613`). Then each active field and pool (`world.ts:537-548`).
- **Invariants:**
  - Hash in logical live order, never raw slot layout (`hash.ts:7-8`).
  - Hash every heritable value that does not move the body. Motor-inert genes were an invisible divergence until this was fixed (`world.ts:607-611`, `plants.ts:412-418`).
  - Hash forked RNG states too (`plants.ts:422`).
- **Gotchas:** brain weights are excluded for cost (`world.ts:532-533`). Provide an organism-only digest so "feature X does not perturb the animals" is testable (`world.ts:552-562`).

### 3.3 Entity pool with generation ids

- **Layout:** parallel typed arrays indexed by slot. `alive` (u8), `genId` (u32), a LIFO free stack, `liveIndices` (u32, ascending), `liveGen` (u32, generation of each live slot captured at rebuild) (`store.ts:14-149`).
- **Clear:** push slots in descending order so the first allocations come out 0, 1, 2 (`store.ts:207-221`).
- **Alloc:** pop a slot, set alive, increment `genId`, reset every per-life counter and set default actuator values (`store.ts:224-242`).
- **Free:** clear alive, push the slot. Does not change `genId` (`store.ts:258-265`).
- **Rebuild live:** one ascending scan of capacity writes `liveIndices` and `liveGen` (`store.ts:274-285`).
- **Invariants:**
  - All kernels iterate `liveIndices` ascending. Results never depend on allocation history (`store.ts:10-12`).
  - A cross-tick reference is a `(slot, genId)` pair. A bare slot is an ABA hazard, because a slot freed by cull can be reallocated by reproduce in the same tick (`store.ts:129-133`, `economy.ts:192-199`, `world.ts:53-59`).
  - A newborn does not act until the next rebuild.
- **Gotchas:**
  - Float64 for all dynamic state, with no Float32 mixing (`store.ts:17`). Genes are Float32, so a clamped gene can sit a hair past its bound (`health.ts:76-78`).
  - A swap-remove live set would be O(live) but breaks ascending order. The owner's note recommends a high-water-mark bounded scan instead (`memory/scaling-foundation.md`).
  - Size per creature slot was 2,659 bytes, 83.5% of it the three brain arrays (`plans/2026-09-plants-as-entities.md:31-42`). Variable-size brains need a separate arena.

### 3.4 Uniform spatial hash by counting sort

- **Layout:** `bucketStart` (u32, buckets + 1), `sorted` (u32, capacity), `counts` (u32, buckets) (`spatial-hash.ts:24-28`).
- **Build** (`spatial-hash.ts:57-82`): count per bucket. Prefix-sum into `bucketStart`. Scatter live slots in ascending order. Each bucket's contents come out in ascending slot order with no extra sort.
- **Query:** for a reach `r`, scan `ceil(r / cellSize)` cells each side, capped at `floor((min(cols, rows) − 1) / 2)` so a wrapped scan never visits a cell twice (`economy.ts:73-75`). Test true distance inside.
- **Invariants:**
  - Cell size ≥ the interaction cutoff if a 3×3 scan is assumed (`spatial-hash.ts:7-8`).
  - Any pool that exposes `{liveIndices, liveCount, x, y}` can use the same hash (`spatial-hash.ts:10-17`).
- **Gotchas:**
  - Every scan must derive its radius from its range. Two kernels were hard-wired to 3×3 and silently ignored their range knob: `hunt` (`economy.ts:71-72`) and `findMate` (`economy.ts:648-651`). The second went unnoticed until 2026-07-02 (`memory/grading-and-legibility-2026-07-02.md`).
  - Inline the scan in hot kernels. The callback form allocates a closure per call (`plants.ts:286-288`).
  - Build cost is O(buckets) per call. Clear only touched buckets, or stamp buckets with a generation counter, before making the world taller.
  - Positions exactly equal are skipped by repulsion (`physics.ts:57`).

### 3.5 Diffusing scalar field

- **Layout:** two Float64 grids (current and scratch) of `cols × rows`, swapped by reference (`phero-field.ts:28-29,130-131`).
- **Deposit:** add into the cell under a world position (`phero-field.ts:54-56`).
- **Step** (`phero-field.ts:103-138`): `out = self + d·(mean of 4 neighbours − self)`. Then multiply every cell by `(1 − decay)`.
- **Walls:** a blocked cell is forced to 0. A blocked neighbour contributes the cell's own value, which is a no-flux boundary (`phero-field.ts:114-125`).
- **Gradient:** central difference with a caller-supplied half-step in world units: `(P(x+step) − P(x−step)) / (2·step)` (`phero-field.ts:86-96`).
- **Invariants:** no RNG. Hashed only when allocated. `d ≤ 0.25` keeps the stencil stable (`config.ts:48`).
- **Gotchas:**
  - Provide an allocation-free gradient read from the start (`phero-field.ts:82-85`).
  - Never deposit a negative amount. The field has no floor (`plants.ts:14-16`).
  - Deposit and decay settle at `P* ≈ deposit rate / decay`. Matching the level of an older field does not match its gradient (`plans/2026-09-plants-as-entities.md:831`).
  - Demo values: diffuse 0.2, decay 0.02, which carries a signal 64 to 91 u in 10 to 20 ticks (`config.ts:1071-1072`).
  - The grid is 64 u per cell. A creature smells a patch, not an individual (`plans/2026-09-plants-as-entities.md:829`).

### 3.6 Conservative upwind advection

- **Algorithm** (`food-field.ts:838-886`): copy the field to scratch. For each cell and its right and lower neighbour: face velocity = mean of the two cell velocities. Flux = face velocity × the upstream cell's value ÷ cell size. Subtract from the donor, add to the receiver. Skip faces that touch a blocked cell.
- **Invariants:** every flux subtracted is added elsewhere, so mass is conserved. Positivity needs the moved fraction ≤ 0.25 per face (`flow-field.ts:5,54-62`).
- **Gotchas:** the flux omits `dt`, so it assumes `dt = 1` (`food-field.ts:865-866`). A per-channel speed multiplier above about 3 can drive a donor negative (`food-field.ts:853-854`).

### 3.7 Rooted producer pool

- **Layout** (`plants.ts:77-110`): `x`, `y`, `energy` (f64). `age`, `seedCooldownLeft` (u16). `genes` (f32 × 6). `alive` (u8). LIFO free stack. Own spatial hash with cell = max(shade range, graze range) = 32 u. `cellCount` (u16 per hash bucket, maintained on alloc and free). 57 bytes per plant (`plans/2026-09-plants-as-entities.md:44`).
- **Genes** (`plants.ts:39-70`): growth rate 0.01 to 0.30. Max size 5 to 120. Seed range 20 to 900 u. Defence 0 to 1. Light need 0 to 1. Species 0 to 1.
- **Founders:** up to 16 random tries each for a legal site (`plants.ts:244-268`). The three sized genes seed gaussian about a centre. Defence, light need and species seed uniform over their range (`plants.ts:224-230`).
- **Legal site:** not rock, fertility ≥ germination threshold, bucket count below the cell cap (`plants.ts:214-218`).
- **Per tick** (`plants.ts:319-371`):
  1. Count neighbours within the shade range for every plant first, as its own pass (`plants.ts:276-312`).
  2. `crowdK = 1 / (1 + cK·n)`. `shadeL = 1 / (1 + sK·n)`.
  3. `lightT = low + (light·shadeL − low)·LIGHT_NEED`.
  4. `K = MAX_SIZE · fertility · lightT · crowdK`. `Kc = max(K, minK)`.
  5. `growth = r · (E + E0) · (1 − E / Kc)`. `E += max(growth, −starve·E)`.
  6. `E −= upkeep · (1 + defUpkeep·DEFENCE)`.
  7. Age. Tick the seed cooldown.
  8. Seed if the cooldown is 0, `E − seedCost > deathE`, `E ≥ threshold·K` and `K > minK`.
  9. Die if `E ≤ deathE` or `age ≥ maxAge`.
- **Seeding** (`plants.ts:379-402`): if the pool is full, draw nothing. Otherwise draw an angle and a radius `SEED_RANGE·sqrt(u)`. If the site is legal, allocate a child with every gene mutated by a gaussian step of `mutationSigma × centre`, clamped. Charge the parent the seed cost and start its cooldown whether or not the site was legal.
- **Invariants and the reason for each:**
  - `+E0` in the growth term makes zero energy non-absorbing. Plain logistic growth cannot recover from zero (`config.ts:827-829`).
  - `K` reaches exactly 0 by two routes (fertility 0, or a full sun-demander in the dark). The two clamps prevent a division by zero that would put NaN in the hash (`plants.ts:345-355`).
  - Two crowd terms from one scan. The universal term gives every strategy density feedback. With a light-only term a shade-tolerant plant had no ceiling (`plants.ts:337-339`).
  - Neighbour counts are taken before any growth or cull, so every plant sees start-of-tick state (`plants.ts:270-275`).
  - The death threshold is a small positive number, because bounded decay never reaches zero (`config.ts:863-866`).
- **Gotchas found by building it:**
  - **Crowding does not bound plant count.** The seed bar is proportional to `K`, so a crowded plant sits near its own reduced ceiling and stays fertile. With cell cap 6 the pool hit 32,768 by tick 400. Cell cap 2 is the working limit and it makes the crowd terms nearly inert. An absolute seed bar is the proper fix and is not built (`config.ts:839-849`).
  - Pockets whose peak fertility is below the germination threshold stay plant-free (`HANDOFF.md:38`).
  - Demo constants are at `config.ts:1221-1247`. MEASURED at 8,000 ticks, seeds 1 to 3: about 17,000 plants, about 800,000 total energy, nearest-neighbour 13.8 u, 4.5 plants inside a grazer's reach (`lw:98-100`).
- **Not built:** nothing eats plants (`lw:95`). The grazing design is in C30.

### 3.8 Fertility map as the habitat template

- **Layout:** `fertility` (f32 per cell) and `Kcell` (f64 per cell) on a coarse grid (`food-field.ts:39-44`).
- **Algorithm** (`food-field.ts:364-401`): fill with a base value. For each pocket add `peak · exp(−d² / (2·radius²))`. Clamp at a maximum. Per-pocket peak = `richness · (1 + var·(2u − 1))` (`food-field.ts:273`).
- **Demo values:** 20 pockets, radius 7 cells (448 u), richness 3, variance 0.8, clamp 5, base 0 (`lw:47-53`, `config.ts:947`).
- **Gotchas:** a clamp below the peak range flattens every pocket to the same depth (`lw:50-52`). `pocketCapVariance` replaces the deep clamp with a shallow one and kills predators (`lw:60-61`).
- **For Tidepool:** this is the "where can producers live, and how richly" layer. Depth, light and rock replace the Gaussian pockets.

### 3.9 Terrain grid queries

- **Layout:** `solid` (u8, fine grid, 16 u cells in the demo). `prox` (f32, hop distance to nearest solid, clamped). `foodBlocked` (u8, coarse grid) (`walls.ts:42-45`, `config.ts:1136-1137`).
- **Swept slide** (`walls.ts:143-184`): split the displacement into hops no longer than one cell. For each hop, if the target is open, take it. Otherwise try the x move alone, then the y move alone, and mark the other axis blocked. If both are blocked, stop. The integrator zeroes velocity on blocked axes (`physics.ts:139-147`).
- **Line of sight** (`walls.ts:122-134`): sample the segment every half cell. Return blocked if any sample is solid.
- **Distance field** (`walls.ts:420-457`): multi-source breadth-first search from every solid cell over 4-neighbours, stopped at a cap. The wall sense is its central-difference gradient, which points away from rock (`walls.ts:196-209`).
- **Coarse mask** (`walls.ts:402-417`): a coarse cell is blocked when more than half its fine cells are solid. Fields use it for no-flux.
- **Connectivity** (`walls.ts:351-394`): carve a straight corridor of fixed half-width between consecutive habitat centres. A flood fill verifies one component (`walls.ts:481-507`).
- **Invariants:** terrain is static, built from its own stream, and not hashed (`walls.ts:14-17`).
- **Gotchas:**
  - Reject spawns inside rock, with a fallback when every candidate is solid (`world.ts:282-303`, `economy.ts:714-717`).
  - Realised solid fraction is about 12 points below the density knob, because habitat opening and corridors remove rock after generation (`memory/env-features.md`).
  - **Do not rebuild habitat positions from a second stream.** `walls.ts:345,361` uses a different seed and draw count from the real food field (`world.ts:197`), so walls open and connect positions that are not the real pockets. Known, unfixed (`memory/codebase-review-2026-06-27.md`). Build terrain and habitat from one source.

### 3.10 Terrain generators

- **Value noise with exact density** (`wall-gen/noise.ts:11-46`): random lattice at about 12-cell wavelength, bilinear interpolation, then threshold at the density-th quantile of the sorted field so the solid fraction is exact.
- **Cave automaton** (`wall-gen/ca.ts:13-48`): random fill at the density, then 4 passes: a cell becomes solid with ≥ 5 solid neighbours of 8, open with ≤ 3, unchanged at 4. The result is well below the input density.
- All generators share one signature and consume the stream in a fixed order (`walls.ts:247-251`).

### 3.11 Divergence-free flow

- **Algorithm** (`flow-field.ts:31-63`): build a smooth periodic noise ψ. Velocity = curl: `vx = ∂ψ/∂y`, `vy = −∂ψ/∂x` by central differences. Scale to the strength knob. Then scale the whole field down so the maximum speed ≤ `0.25 · cell / dt`.
- **Invariants:** divergence-free, so advection conserves mass. Baked once at construction. Strength is a rebuild-time knob. Push on bodies is a live knob (`memory/flow-current-tuning.md`).
- **Body push:** `force += k · (refSize / size)^exp · v` (`physics.ts:83-87`).

### 3.12 Sight cone scan

- **Per viewer** (`sense.ts:207-264`): skip if range or acuity ≤ 0. Scan buckets out to `ceil(range / cell)`. For each other creature: reject if beyond range, if `unit(self→other) · heading < cos(fov)`, or if terrain blocks the line.
- **Weight:** `(1 − d / range) · acuity` (`sense.ts:312`).
- **Port this part only.** The draft then multiplies by a hand-written "pull" (diet difference, shelter, cohesion, mate attraction) and sums everything into one 2-vector (`sense.ts:268-314`). Chase and flee are thus not evolved. They are `myDiet − itsDiet` plus two positive founder weights (`genome.ts:635-640,660-663`).
- **Gotchas:** cost grows with range squared. A max-range creature scans about 15 times more cells than the old cap allowed (`sense.ts:185-189`). Give each eye part a fixed, small set of outputs so the brain input count stays bounded.

### 3.13 Hunt kernel

- **Per predator, ascending** (`economy.ts:76-156`):
  1. Skip if `DIET ≤ 0`.
  2. Skip if `energy ≥ satiatedBar` (`economy.ts:88`).
  3. Skip if still in the handling refractory (off in the demo).
  4. Find the nearest creature within `biteRange` whose `SIZE ≤ mySize / huntSizeRatio` and whose `DIET < myDiet − huntDietGap`.
  5. `drain = min(DAMAGE · DIET · biteGate, prey energy)`.
  6. Prey loses `drain`. Predator gains `drain · predationGain · dietSpec`.
- **Invariants:** one target per tick. Ascending order means the lowest slot wins a contested prey. Prey at ≤ 0 die in the cull later the same tick.
- **Gotchas:** every clause in step 4 and the cap in step 2 exists because its absence produced a measured failure. See C8 to C13.

### 3.14 Reproduction state machine

- **Bars:** `satiatedBar = max(SATIATED · (SIZE / refSize)^sizeStoreExp, REPRO + 5)` (`economy.ts:37-47`). Shared by eat-stop, hunt-stop and breed trigger so they cannot diverge.
- **Per parent, ascending, in this order** (`economy.ts:784-888`):
  1. Skip if the slot's generation changed since the live list was built.
  2. Skip if `age < MATURITY_AGE`.
  3. If cooling down, decrement and skip.
  4. Skip if `energy ≤ reproOverhead + REPRO_THRESHOLD`.
  5. Skip if the brain's breed gate is below threshold.
  6. Not seeking and at the bar: become a seeker with a window of `mateSeekWindow` ticks.
  7. Seeking and below the bar: stop seeking.
  8. Seeking: search for a mate. None found: decrement the window. On expiry stop seeking and start the cooldown.
  9. Mate found: allocate the child, inherit, provision, clear both parents' seeking state.
- **Mate search** (`economy.ts:654-692`): candidates are alive, mature, within `mateContactRange`, and within `mateCompatThreshold` genetic distance. The partner does not need to be seeking or fed. Choose the minimum `|DISPLAY − my PREFERENCE|`, ties to the lowest slot.
- **Genetic distance** (`genome.ts:440-456`): square root of the weighted sum of squared range-normalised gene differences. DIET weighted 5. Mate-signal genes excluded.
- **Child placement** (`economy.ts:697-724`): one angle draw, fixed offset from the mother, fall back to the mother's position if in rock. The child copies the mother's velocity and heading.
- **Inheritance:** each scalar gene picked from mother or father with probability one half, then mutated and clamped (`genome.ts:362-387`). The pick, not a blend, keeps allele clusters.
- **Provisioning** (`economy.ts:730-755`): `child energy = min(child's BIRTH_ENERGY, mother energy − reproOverhead − mother's REPRO_THRESHOLD)`. Mother pays child energy plus `reproOverhead`. Only the overhead leaves the world. The father pays nothing.
- **Invariants:** a mother never breeds below her own floor. Every skip that consumes no RNG sits before allocation. Fire the birth hook with mother, child and father identities (`economy.ts:754`).
- **Gotchas:**
  - The brain is not recombined. The child takes the mother's brain plus mutation and the father is ignored (`genome.ts:389-419`).
  - Mutation step is `sigma × gene centre`, so a gene with centre 0 can never mutate (`genome.ts:217-218`).
  - A newborn can exceed its own speed cap for one tick because velocity is copied unclamped (`economy.ts:720-721`, `memory/env-features.md`).

### 3.15 Invariant scan

One read-only pass over live creatures (`health.ts:84-184`): all kinematics, genes and brain weights finite. Position inside the world. Energy not negative (exactly 0 is a legal transient after birth, `health.ts:10-12`). Every gene inside its clamp range with a `1e-4` tolerance. The list of violations is capped and the total is still counted. The app runs it every 500 ms and shows a banner (`memory/grading-and-legibility-2026-07-02.md`).

### 3.16 Ancestry and history recording

- **Birth hook:** fired inside reproduce with integers only. The handler may not touch state (`config.ts:892-904`).
- **Lineage forest** (`src/app/observability/lineage.ts:75-160`): identity is `slot:genId`. The hook buffers. A commit after each step drains the buffer and snapshots birth-time traits, because a dead ancestor's slot will later hold someone else's genes. A node cap prunes the oldest dead and childless leaves. Child and descendant counters are incremented at birth and never decremented, so totals stay exact after pruning. Orphan births are counted, not hidden.
- **Rule learned:** every code path that advances the world must also run the commit. A hidden-tab pump that skipped it logged generation 0 (`memory/browser-run-history.md`).
- **History** (`src/app/observability/history.ts:127-151`): one row every 200 sim ticks, bounded by sim time and not frame rate. Population, trophic counts, ages, births and deaths, mean and σ of nine genes.
- **For Tidepool:** the draft keeps ancestry in the UI layer because core "stores no ancestry" (`lineage.ts:3-4`). Descendant selection after a time-skip needs parent links as sim state.

### 3.17 Frame loop rules

- Speed is ticks per frame. The sim never reads the wall clock (`src/app/observability/controls.ts:4-5`).
- Below 1×: add `speed` to an accumulator each frame, step when it reaches 1, and draw interpolated between a pre-step snapshot and the current state (`main.ts:720-729,699-708`). Interpolate only creatures whose generation id matches in both snapshots (`renderer.ts:719-723`).
- At or above 1×: run `min(256, round(speed))` steps (`main.ts:697,731`).
- Hidden tab: browsers suspend animation frames. A timer steps a fixed batch of 400 ticks. Do not use a time budget there, because hidden tabs coarsen the clock and the loop overruns (`main.ts:947-967`).

### 3.18 Health gate

`src/headless/demo-health-gate.ts:24-31,94-95`: load the shipped config verbatim. Run 12,000 ticks on seeds 1 to 3. Fail if the population is extinct, the predator share is below 10%, the standard deviation of DIET is below 0.20, or births after the 6,000-tick warm-up are below 1,000. Print each seed's row as it finishes, so a killed run still leaves evidence (`HANDOFF.md:22`). Run nightly (`.github/workflows/nightly.yml:22`).

### Ideas from dropped modules

| Idea | Where | Note |
|---|---|---|
| Project every directional sense into the body frame (forward, lateral) | `brain.ts:126-131` | The sign convention is load-bearing |
| Squash motor outputs with `max · tanh(raw / (max · gain))`, gain separate from the ceiling | `brain.ts:324-332`, `config.ts:456-462` | With gain tied to the ceiling the motor stayed bang-bang |
| Action outputs as sigmoid gates seeded open | `genome.ts:714-719` | Founding behaviour is unchanged when the output is added |
| A constant input is absorbed by the bias | `memory/brain-completeness-vision.md` | Feed brains time-varying state only |
| A display that recomputes the brain needs a parity test with unsaturated weights | `memory/brain-consolidation.md` | A saturated test hid 16 missing terms |
| Seed niche-axis genes uniform over their range | `genome.ts:305-322` | See C7 |
| Costed longevity gene | `economy.ts:433-437`, `genome.ts:238` | See C27 |

## 4. Design constraints learned by measurement

Status key: **MEASURED** = probe result recorded in the cited note. **MEASURED (old engine)** = recorded on the archived pre-June engine with bonded multicellular bodies. **DERIVED** = arithmetic from measured inputs, mechanism not built or not tested. **HYPOTHESIS** = stated in notes with no supporting run.

### A. Density and encounter geometry

**C1. Local spacing must be below interaction reach.** MEASURED.
- Finding: at 8192² with 600 to 850 creatures in 14 pockets, prey nearest-neighbour distance was 73 to 86 u against `biteRange` 16. No bite landed on any seed. Reward per bite cannot rescue a kill probability of zero.
- Evidence: `memory/rebuild-predation-dead.md`. `memory/biogeographic-demes-redesign.md`.
- Fix that worked: many small deep pockets (radius 7 cells, richness 3). Local spacing fell to about 12 u and predators persisted on all 4 seeds. Small radius also bounded total population to 3,000 to 5,000 (`lw:36-49`).
- Tidepool: size each depth zone from the reach of mouths and mates. For each zone compute expected neighbour distance at carrying capacity and require it below the shortest mouth reach. Narrow zones between shelves are an asset.

**C2. World area is cosmetic. Carrying capacity is the sum of habitat.** MEASURED.
- Evidence: `memory/rebuild-predation-dead.md`. A bigger world with the same pockets gave the same dynamics.
- Tidepool: make the map taller only by adding populated zones.

**C3. Mate encounter was the first reproduction bottleneck.** MEASURED.
- Finding: only about 1.5 of 5,400 creatures were breeding-ready per tick. Readiness anti-correlates with crowding: a creature fills up when it is alone on food. Instant local mating cut births about 25 times. A ready creature had any neighbour within 16 u 4% of the time and within 32 u 32% of the time.
- Evidence: `memory/sexual-reproduction-speciation.md`.
- Fixes that worked: seeking state over a window (`config.ts:973`). Partner needs only to be mature and compatible. Mate reach 12 → 36 made all of seeds 1 to 3 hold a two-guild split to 20,000 ticks (`lw:123-128`). Patience alone (longer window) was weak (`memory/survival-repro-predator-fix.md`).
- Tidepool: a player has one life of 3 to 6 minutes to find a mate. Mate finding needs a long-range signal (glow, scent) and a partner pool wider than "also ready right now". Measure encounter probability per life before building courtship.

**C4. Raising reach to force encounters overshoots.** MEASURED.
- `biteRange` 12 gave predator extinction, 30 pegged the population cap, 50 gave an all-predator world (`memory/sim-tuning-findings.md`). `biteRange` 32 crashed the predator guild from 1,315 to 173 (`lw:157-158`).
- Tidepool: fix reach from body and part geometry and tune density, not the reverse.

### B. Resources and coexistence

**C5. One resource gives competitive exclusion.** MEASURED.
- Finding: one food field gave a grazer monoculture and a "race to minimalism" in which every costed gene drifted down.
- Evidence: `memory/diversity-levers.md`. `docs/decisions/INDEX.md:50`.
- Tidepool: light-fed plants alone will give one grazer. Plan at least two producer or detritus resources that differ by depth, and make mouths differ in what they can eat.

**C6. Spatial separation of resources gives a transient split, not a stable one.** MEASURED.
- Finding: two and three place-coupled channels gave about 45/45 specialists at 3,000 to 4,000 ticks and one channel by about 8,000. A 5,000-tick sweep misread the transient as stable.
- Evidence: `memory/food-specialization.md`. `memory/diversity-levers.md` (2026-06-24 update).
- Stated fix, not built: negative frequency dependence (income on a resource falls as more individuals specialise on it). HYPOTHESIS.
- Tidepool: depth zones will not hold distinct species without a mechanism that favours the rare type.

**C7. A generalist penalty holds a split, if the founding pool already contains specialists.** MEASURED.
- Finding: forage income multiplied by a ramp from a floor (generalist) to 1 + bonus (specialist) pulled the preference gene off centre. With founders clustered at the centre the penalty starved 2 of 3 seeds. Seeding the gene uniform fixed it. The same ramp on the diet axis (`dietGeneralistFloor`) held the grazer and hunter split to 20,000 ticks on 8 of 8 seeds at 0.7. At 0.8 it passed at 12,000 and decayed by 20,000.
- Evidence: `memory/food-specialization.md`. `lw:147-158`. `economy.ts:343-349,415-417`.
- Tidepool: with parts, the penalty is physical: a body cannot carry every mouth type for free. Price parts so a jack-of-all-trades body earns less per part than a committed one, and seed founders across the range of body plans.

**C8. More food kills predators.** MEASURED.
- Abundant food gave a population of about 3,000 with predators extinct. Slower regrowth with a richer cap gave more size variety. Cutting abundance gave extinction (`memory/sim-tuning-findings.md` items 3 and round 3. `memory/lifespan-satiation-behavior.md`).
- Tidepool: tune producers for slow refill of deep stores, not high flux.

### C. Predation

**C9. Obligate carnivores are not viable at low encounter rates.** MEASURED.
- `herbivoryExp ≥ 1.6` gave predator extinction on every seed, even with gain 2. Predators need a plant fallback between kills (`memory/sim-tuning-findings.md` round 2). Demo: `herbivoryExp 0.7` (`lw:144`).
- Tidepool: a body with a predatory mouth must still be able to feed on something else, or early predators die before prey density builds.

**C10. Predators are founding-limited.** MEASURED.
- Scattered predator founders died in the sparse opening. What carried a guild through: 30% of founders as predators, seeded as omnivores at diet 0.7, clustered into the 8 deepest pockets, seeded in the upper size band (`lw:138-146`, `world.ts:251-278,325,335-339`). No economy setting created predators on a seed where the founding draw had none (`memory/predation-engine-ceiling.md`).
- Caveat: the clustered seeding rescued dead seeds and collapsed two seeds that had predators without it (n = 5, 3,000 ticks). The cause is a HYPOTHESIS (`memory/diversity-levers.md`).
- Tidepool: the persistent world is seeded once. Seed predators in groups, large, omnivorous, on dense prey. Check predator persistence at the end of every time-skip.

**C11. Size must be physical.** MEASURED.
- With size a free gene the world converged to all predators by about 5 million ticks. Requiring prey to be smaller by a ratio of 1.15 brought herbivores back on all 3 tested seeds at 14,000 ticks (`memory/sim-tuning-findings.md`, `economy.ts:93,112`).
- A deeper energy store for bigger bodies doubled surviving predators. A higher move cost for bigger bodies drove hunters extinct at any positive value (`config.ts:996-1001`).
- In the draft, size does not change collision radius or bite strength (`physics.ts:35`, `economy.ts:128`).
- Tidepool: body size should set collision radius, storage, speed and who can eat whom. Do not tax the movement of large hunters.

**C12. Cap every income channel at satiation.** MEASURED.
- Hunting without a cap let predators hoard energy far above the breed bar that never became offspring, and let hunting dominate grazing. Adding `if energy ≥ satiatedBar: skip` to hunt was the root-cause fix of that arc (`economy.ts:81-88`, `memory/arc-b-ecology-outcomes-2026-07-03.md`).
- The same omission in photosynthesis, parasite drain and scavenging produced the 2026-07-15 regression. The cap on all three was the only arm that passed the gate on 3 of 3 seeds at 12,000 ticks (`lw:222-238`).
- Tidepool: one shared "full" test in front of every part that earns energy.

**C13. Gain above 1 prints energy.** MEASURED.
- `predationGain > 1` ran the population to the 32,768 cap under denser seeds (`memory/sim-tuning-findings.md`). Gain 5 with reach 32 gave an 86 to 91% predator takeover at the cap (`memory/predation-engine-ceiling.md`). The demo still runs gain 3 and parasite gain 1.5 (`lw:145,200`) and relies on C12 as the restoring force.
- Tidepool: conserve energy in transfers. If meat must pay more, raise what a bite removes, not the conversion.

**C14. Throttles on predators backfire.** MEASURED.
- Handling time of 5, 15 or 50 ticks gave predator extinction on seed 1, and 15 gave it on both seeds of a later test. A tighter satiation threshold gave extinction on one of two seeds (`memory/predator-boom-bust-experiment.md`, `memory/biogeographic-demes-redesign.md`).
- Tidepool: predators sit on a thin margin. Do not add cooldowns to feeding without a paired 3-seed long run.

**C15. Predator overshoot is structural.** MEASURED.
- 5 variants × 5 seeds × 50,000 ticks: mean predator peak 48 to 57% in every variant. Changing gain between 2.0 and 2.5 moved the peak less than seed noise. Baseline settled to a 19 to 36% predator minority on all 5 seeds on the July tree (`memory/predator-boom-bust-experiment.md`).
- Stated need: payoff that falls as predators become common. HYPOTHESIS.
- Diversity tracked predator persistence: every state without predators had diet σ near 0.07.

**C16. Cannibalism on gives a predator monoculture.** MEASURED.
- With it on, predators ate each other when prey crashed and reached 85% of the population. Off: 41% and prey 413 → 2,592 (`lw:164-168`). A diet gap of 0.1 stops near-peer kills. 0.25 starved predators (`lw:159-163`).

### D. Movement and behaviour

**C17. Turn rate independent of speed causes spinning, and the direct fix removes prey evasion.** MEASURED.
- Cause: heading changes by up to `MAX_TURN` 0.35 rad per tick at any speed. At speed about 1.1 the turning radius is 3.2 u inside a 6 u body. The summed turn signal ran 2 to 3 times past the ceiling, so 31 to 47% of creature-ticks were at ≥ 90% of maximum turn. Spinners were fed adults on food. Learning was not the cause.
- Fix tried: `|dθ| ≤ max(floor, speed / radius)` with a wider squash gain. Spinners 19.9% → 6.4%.
- Result at 12,000 ticks: population 40 against 1,877 on the paired baseline. The same setting passed at 6,000. Threat and hunger exemptions failed 3 of 3 seeds.
- Evidence: `memory/plants-as-entities-2026-09.md`. `lw:19-29`. `brain.ts:347-362`.
- Tidepool: a rigid body with fins gets speed-coupled turning from physics. The draft shows that prey then need an explicit escape (dash, burst turn) and that the predator and prey balance must be tuned after the motor model is final, not before.

**C18. A hunger gate on food seeking parks fed creatures.** MEASURED.
- Scaling the food gradient to zero when full made creatures stall and births fall 6 times. A floor of 0.7 on the drive restored movement and gave 4.2 times the end population (`memory/resilience-satiation-gate.md`, `brain.ts:148-157`).
- The gate did nothing until a breed cooldown existed, because the eat-stop bar and breed bar are the same number and surplus was bred away at once (`memory/lifespan-satiation-behavior.md`).
- Tidepool: "full" must lead to another activity (seek a mate, explore), not to stillness.

**C19. Smaller behavioural findings.** MEASURED.
- Eating that slows the body cut population 3 to 6 times at penalty 0.4. Eased to 0.25 (`memory/brain-consolidation.md`, `config.ts:1122`).
- Strong currents push bodies off food. Births fell monotonically past flow strength 1. Strength 1 was the only setting with no extinction across 8 seeds (`lw:14-16`, `memory/flow-current-tuning.md`).
- Stronger schooling never closed prey spacing and killed predators on 1 of 3 seeds. Dropping the same-lineage restriction tripled sustained predators (`config.ts:316-320`, `memory/diversity-levers.md`).
- Extra pull toward hosts cut the parasite niche about 29 times. Pull toward predators as hosts gave a 37 times crash (`lw:208-213`, `sense.ts:282-284`).
- Seeding predators with large eyes killed them faster, because they chased more than the catch repaid (`memory/resilience-satiation-gate.md`).

### E. Brain and senses

**C20. Costed traits that rarely pay are stripped.** MEASURED.
- Vision range evolved down on every seed when encounters were rare (`memory/perception-scale-mismatch.md`). Cost applies only above the founder centre, so any value below centre is free and there is no force holding it up (`genome.ts:421-432`, `memory/vision-revival-null.md`).
- Tidepool: brain size and sense parts carry a cost by decision. Expect minimal brains and blind bodies unless the benefit is frequent. Use absolute part costs. Watch part counts across a time-skip.

**C21. Wired inputs and outputs were not recruited.** MEASURED.
- Own size, own diet and local crowding inputs: live in the forward pass, no consistent use. Fertility under the body was the only engaged one (`memory/a1-interoceptive-inputs.md`).
- Bite, scent and breed gates: all stayed at about 0.98 open (`memory/a2-brain-gated-outputs.md`).
- Scent channels: weights moved off zero, but every diet class descended the prey channel. The behaviour was crowd avoidance. Follow-prey did not emerge, because the prey channel encodes crowd density (`memory/identity-bearing-scent.md`).
- Turning the body-sense inputs on crashed the demo seed from 931 to 8 (`lw:118-120`). The mechanism is a HYPOTHESIS.
- Tidepool: NEAT's minimal start fits this evidence. Add inputs only with the part that produces them.

**C22. A food reward did not revive vision. A threat might.** MEASURED null.
- Sight-only food, clustered or not: mean change in vision range +0.87 with SD 8.96 over 8 seeds (`memory/vision-revival-null.md`).
- Suggested alternative: hazards that only sight detects. HYPOTHESIS.

**C23. Within-life learning was near-inert and can harm.** MEASURED.
- 62 of 185 weights can change in life. The input-to-hidden layer cannot (`brain.ts:562-577`, `memory/learning-plasticity-ceiling.md`).
- Plastic bias synapses caused a runaway that pinned motors. Fixed by excluding biases and bounding deviation (`brain.ts:601-617`).
- A birth debited the mother after the reward baseline was taken, so every birth punished the foraging that earned it. Fixed (`economy.ts:748-752`).
- Supports the Tidepool decision to ship evolution only.

**C24. Mate-choice genes did nothing.** MEASURED.
- Preference showed no correlation with display. Display has no visible cue and preference is not a brain input (`genome.ts:83-87`, `memory/sexual-reproduction-speciation.md`).
- The compatibility gate did isolate guilds: 0 cross-diet parent pairs. Sexual reproduction maintained boundaries and did not create diversity.
- Tidepool: mate choice needs a signal the chooser can perceive and that the player can see.

### F. Life history

**C25. The breeding bar and offspring cost dominate population dynamics.** MEASURED (old engine).
- Foragers that plateaued just under the real breeding cost never bred in 12,000 ticks (`memory/live-demo-ecology-broken.md`). Food abundance was not the lever (`memory/sessile-chain-plants.md`).

**C26. Founder spread kills. Hardier founders kill later.** MEASURED.
- Founder σ above 0.3 collapsed births to about 0, because it also perturbs brain weights and costed genes (`config.ts:409-412`).
- A founder energy bonus gave a bigger early boom and a worse late crash at 8 seeds × 6,000 ticks, after looking good at 6 × 5,000 (`memory/resilience-satiation-gate.md`).
- A softer starvation clock was the largest single lever on the population floor (`lw:113-114`).

**C27. A costed longevity gene gives a balanced lifespan.** MEASURED.
- Senescence age with upkeep per unit above centre settled near 370 to 480 ticks and did not run to its 4,000 maximum (`memory/age-stages.md`). Death is still starvation: past the gene age, basal cost climbs until the creature cannot break even (`economy.ts:433-437`).

**C28. Draft time scales.**
- Median lifespan 289 to 481 ticks on the default config (`memory/age-stages.md`). About 33 lineage generations in 20,000 ticks, so about 600 ticks per generation (`memory/grading-and-legibility-2026-07-02.md`).
- The frame loop runs one tick per frame at 1× (`main.ts:731`).
- DERIVED: a 3 to 6 minute life at 60 ticks per second is 10,800 to 21,600 ticks, 20 to 70 times the draft lifespan. Every rate in section 5 must be re-derived, or the tick rate lowered.
- DERIVED: at the draft's 8 µs per creature-tick, skipping 5 generations of 10,800 ticks at 3,000 creatures is about 1,300 seconds. The time-skip needs a much cheaper tick, a lower tick rate, or a smaller world. Make time-skip throughput a criterion in the stack benchmark.

### G. Plants and grazing

**C29. Producers need a non-absorbing zero and local recolonisation.** MEASURED.
- Plain logistic growth has an absorbing state at zero. The field used diffusion (`food-field.ts:14-16`). The plant pool uses the seedling term (3.7).
- Seed range (max 900 u) is below pocket spacing (about 1,800 u), so a cleared pocket cannot be recolonised (`config.ts:801-803`). A spontaneous germination rate was planned as the backstop. Not built.

**C30. A grazer out-eats a single plant.** DERIVED from measured inputs. Not built.
- Measured mean grazer eat budget: 2.05 per tick, p90 2.78. Peak production of one plant at the derived constants: 0.978 per tick. An unthrottled bite strips any plant in about a dozen ticks (`plans/2026-09-plants-as-entities.md:392-396`).
- Designed bite: `bite = min(budget, f · (E − R)) · (1 − armour)` with `f = 0.25` and a root reserve `R = 0.15 · MAX_SIZE`. The bite goes to zero at the reserve while growth there is positive, so grazing cannot kill a plant (`plans/2026-09-plants-as-entities.md:380-400`).
- Sizing rule: production inside one grazer's reach must exceed its budget. 5.1 plants in reach × 0.978 = 4.99 against 2.05 (`plans/2026-09-plants-as-entities.md:238-257`).
- Consequence: hard diet partition between plant species is not affordable at 5 plants per reach. Diet breadth can only grade a preference (`plans/2026-09-plants-as-entities.md:433-443`).
- Tidepool: a mouth part needs a per-bite fraction and plants need a reserve. Size plant growth from the reach of one mouth.

### H. Space and regions

**C31. Regional differences in means appear. Regional monomorphism does not.** MEASURED.
- Between-pocket standard deviation of mean diet was 8 to 10 times baseline with varied pocket depth (`memory/pocket-richness-diversity.md`).
- The target "between-region spread ≥ 2 × within-region" was not reachable for any trait that has a within-region trade-off. A gene with no other role (thermal preference) reached a ratio of 0.5 to 1.0 at 12,000 ticks (`memory/arc-c-regional-diversity-2026-07-04.md`).
- Differentiation eroded toward the global mean by 20,000 ticks (same note).
- A dead-water energy tax of 0.05 was the one safe isolation lever. 0.08 crashed seeds (`lw:55-58`).
- Tidepool: depth zones will shift trait means. Distinct zone species need barriers stronger than distance. Narrow gaps in rock shelves are that barrier. Seal chance per gap is a design knob.

**C32. Density-dependent mortality does not produce cycles.** MEASURED.
- An instant crowding cost is a brake. Population variance stayed flat. With the count radius equal to the repulsion cutoff it counted nobody (`docs/decisions/INDEX.md:50`).

### I. Method

**C33. Gate at a long horizon, several seeds, one run at a time, with a paired baseline.** MEASURED.
- 6,000-tick readings were wrong in both directions. A single-seed "stable" claim hid a two-month regression. Two concurrent 12,000-tick runs died silently under memory pressure (`memory/sim-tuning-process-rules.md`, `docs/decisions/INDEX.md:62`).

**C34. Mechanism fires ≠ evolution uses it ≠ it helps.** MEASURED as a recurring review finding.
- A fresh-context reviewer caught a distinct overclaim on four consecutive features (`docs/decisions/INDEX.md:50`).
- Two "golden" tests passed for the wrong reason because they varied more than one thing (`docs/decisions/INDEX.md:51`).
- Aggregate ecology metrics could not isolate a social gene, because the gene changed population composition (`memory/sim-tuning-findings.md` round 3).
- A generation-depth plot was misread as a population collapse (`memory/lifespan-satiation-behavior.md`).

**C35. Open regression.** MEASURED, cause unknown.
- The demo regressed at commit `de39c09` (2026-07-15). Turning the three morphs off at HEAD does not restore the July baseline on seeds 2 and 3 (`HANDOFF.md:30-33`). No note records which other commit moved the ecology.

**C36. Rendering cost.** MEASURED.
- The Canvas2D body pass is O(visible creatures) per frame and dropped the frame rate in a dense pocket. It now enables only past zoom 6 with fewer than 1,200 estimated visible (`main.ts:112`, `memory/biogeographic-demes-redesign.md`).
- 64× speed at high population gave about 1 frame per second (same note).

**C37. Legibility findings.** MEASURED by owner review.
- A colour channel tied to a gene that evolves toward zero washed out the trophic colours. Fixed floors solved it (`renderer.ts:118-125`).
- A mean hides a bimodal population. Show histograms and median age (`src/app/observability/distributions.ts:2-4`, `src/app/observability/world-stats.ts:7-10`).
- Mean age rising looked healthy during a stall with near-zero births. Percent founders and a "turnover stalled" flag made it visible (`world-stats.ts:18-21`).

## 5. Economy arithmetic

All quantities per creature per tick. `E` = energy. Gene names in capitals. Demo constant in brackets with its source.

### Bars

```
satiatedBar = max( SATIATED_THRESHOLD · (SIZE / cellRadius)^sizeStoreExp ,  REPRO_THRESHOLD + 5 )
```
`economy.ts:37-47`, `genome.ts:119`. Centres: SATIATED 100, REPRO 60 (`config.ts:965,967`). `sizeStoreExp` 1 (`config.ts:999`). `cellRadius` 6 (`config.ts:923`).

### Intake

| Channel | Formula | Stop | Where |
|---|---|---|---|
| Graze | `budget = EAT_RATE · eatGate · (1 − DIET)^herbivoryExp`. Split across channels by `preference_weight · local biomass`, renormalised. `gained = taken · spec · dietSpec` | `E ≥ satiatedBar` | `economy.ts:322-417` |
| Forage specialisation | `spec = floor_f + (1 + bonus − floor_f) · s`, `s` = 0 generalist to 1 specialist | | `economy.ts:386-389` |
| Diet specialisation | `dietSpec = floor_d + (1 − floor_d) · 2·|DIET − 0.5|` | | `economy.ts:415-416` |
| Hunt | `drain = min(DAMAGE · DIET · biteGate, E_prey)`. `gained = drain · predationGain · dietSpec` | `E ≥ satiatedBar` | `economy.ts:128-140` |
| Photosynthesis | `PHOTOSYNTH · light · photosynthGain / (1 + k · speed²)` | satiated | `economy.ts:470-477` |
| Parasite | `drain = min(parasiteDrain · PARASITISM, E_host)`. `gained = drain · parasiteGain` | satiated | `economy.ts:203-207` |
| Scavenge | Per death in range: `(S_i / ΣS) · corpseEnergy · S_i` | satiated | `economy.ts:637-643` |
| Parcel | The parcel's remaining energy | none | `economy.ts:533` |

Demo constants: EAT_RATE centre 2 (`config.ts:959`). `herbivoryExp` 0.7 (`lw:144`). `floor_f` 0.7 (`lw:178`). `bonus` 0.5 (`config.ts:955`). `floor_d` 0.7 (`lw:147`). DAMAGE centre 12 (`config.ts:1005`). `predationGain` 3 (`lw:145`). `biteRange` 16 (`config.ts:1010`). `huntSizeRatio` 1.15 (`config.ts:1011`). `huntDietGap` 0.1 (`lw:159`). `photosynthGain` 0.6, `k` 4 (`lw:190-191`). `parasiteDrain` 0.05, `parasiteGain` 1.5 (`lw:199-200`). `corpseEnergy` 20, range 20 (`lw:218-219`). `parcelEnergy` 80 (`lw:105`). Food cap 40 per cell × fertility up to 5, regrowth 0.06, diffusion 0.03 (`config.ts:936-943`, `lw:50`).

### Costs

| Cost | Formula | Where |
|---|---|---|
| Basal | `basalCost · METAB_EFF`, with `basalCost` multiplied by `1 + senescenceRate · max(0, age − SENESCENCE_AGE)` | `economy.ts:433-438` |
| Gene upkeep | `Σ over costed genes of max(0, gene − centre) · cost` | `genome.ts:422-432` |
| Movement | `moveCost · (SIZE / cellRadius)^sizeMoveCostExp · speed²` | `economy.ts:422-439` |
| Dead water | `deadWaterCost · (1 − fertility)` where fertility < 1 | `economy.ts:443-446` |
| Temperature | `basalCost · tmc · (THERMAL_PREF − regionTemp)²` | `economy.ts:452-463` |
| Brain | none | `economy.ts:438-439` |

Demo constants: `basalCost` 0.06 (`lw:113`). `moveCost` 0.01 (`config.ts:962`). `sizeMoveCostExp` 0 (`config.ts:996`). `deadWaterCost` 0.05 (`lw:55`). `tmc` 0.4 (`lw:184`). `senescenceRate` 0.01, SENESCENCE_AGE centre 400, MATURITY_AGE centre 100 (`config.ts:1213-1215`).

Upkeep coefficients per unit above centre (`config.ts:987-992,1006,1034-1036,1041,1048,1070,1216`, demo overrides `lw:108-109,179`): max speed 0.05. Eat rate 0.15. Smell range 0.004. Max turn 0.4. Max thrust 0.2. Size 0.015. Damage 0.05. Vision range 0.0006. Vision angle 0.02. Vision acuity 0.02. Shelter 0.5. Cohesion 0.1. Scent deposit 0.01. Senescence age 0.0005.

`METAB_EFF` multiplies basal cost (`economy.ts:438`) and thrust (`brain.ts:365`). It does not multiply intake, although one comment says it does (`genome.ts:192`).

### Reproduction

| Rule | Formula | Where |
|---|---|---|
| Trigger | `E ≥ satiatedBar`, mature, not cooling down | `economy.ts:791-800,843` |
| Viability | `E > reproOverhead + REPRO_THRESHOLD` | `economy.ts:807-812` |
| Child energy | `min(child BIRTH_ENERGY, E_mother − reproOverhead − REPRO_THRESHOLD)` | `economy.ts:744` |
| Mother pays | child energy + `reproOverhead` | `economy.ts:747` |
| Lost from the world per birth | `reproOverhead` | `economy.ts:742` |
| Founder energy | own BIRTH_ENERGY gene | `world.ts:364` |

Demo constants: `reproOverhead` 15, BIRTH_ENERGY centre 25 (`config.ts:968-969`). `breedCooldown` 100 (`lw:121`). `mateSeekWindow` 120, `mateCompatThreshold` 0.6, `mateDietWeight` 5 (`config.ts:966,973,975`). `mateContactRange` 36 (`lw:123`). Mutation σ 0.12 × gene centre for scalar genes and 0.12 absolute for brain weights (`lw:176`, `genome.ts:351,810`).

### Death

`E ≤ 0` at the cull (`economy.ts:548`). Old age is the basal multiplier above. There is no other death path.

### Worked numbers (arithmetic from the constants above, not measurements)

| Case | Value |
|---|---|
| Founder at gene centres, resting | Burns 0.06 per tick. 25 starting energy lasts about 417 ticks with no food |
| Same, cruising at speed 2 | Burns 0.10 per tick. About 250 ticks |
| At the speed cap of 6 | Movement alone costs 0.36 per tick |
| Grazer on full food | Takes up to 2 per tick. Gains 1.4 (generalist) to 3.0 (specialist) |
| Mother at the bar of 100 | Child gets 25. Mother drops to 60 and needs +40 to breed again. Cooldown 100 ticks is the longer wait |
| Founder predator (DIET 0.7, DAMAGE 12), bite gate fully open | Drains 8.4 per tick. `dietSpec` 0.82. Gains 20.7 per tick. The seeded gate of about 0.98 scales both |
| A 60-energy prey eaten by that predator | Yields 148 energy. 2.46 times what the prey held |
| Same predator grazing | `(0.3)^0.7 · 0.82 = 0.35` of a grazer's intake |
| Cruise speed | Thrust bias 0.3 through the squash gives about 0.29, × 0.755 while eating, × `d/(1−d)` = 9 at damping 0.9. About 2 u per tick. Matches the 1.3 to 2.3 recorded in `memory/lifespan-satiation-behavior.md` |

## 6. Things the draft got wrong structurally

| # | Mistake | Evidence | Do this instead |
|---|---|---|---|
| S1 | One 232-field config. 34 booleans. 1,253 lines | `config.ts:10-905` | Constants live with the system that reads them. Fewer knobs, each with a recorded measurement |
| S2 | Two-layer defaults. The default config is a legacy baseline nothing ships. The demo is 71 overrides in another file | `lw:6-7`, `lw:11-239` | One shipped config |
| S3 | Config comments drifted from the code | `config.ts:214` says predators seed at diet 0.9, code seeds 0.7 (`world.ts:325`). `config.ts:172` says 15 genes, there are 31 (`genome.ts:115`). `config.ts:155` cites a 3×3 mate scan that is gone (`economy.ts:664`). `config.ts:1145` says the demo uses flow strength 4, it uses 1 (`lw:14`). `config.ts:1091-1093` describes energy-gated learning that does not exist (`brain.ts:593`). `config.ts:1-9` says one config serves demo, harness and tests. The exported `DEMO_CONFIG` (`config.ts:1253`) has no importer, and tests run at 512² (`world.test.ts:13`) | Generate parameter docs from the consuming code, or keep the value and its rationale in one place as `living-world-config.ts` does |
| S4 | Off-by-default machinery kept after the policy that required it was retired | Retired 2026-06-23 (`docs/decisions/simulation-design.md`, "New features ship ON"). "Byte-identical" still appears in 16 core files and on 78 lines of `config.ts`. Tail-gated gene draws remain (`genome.ts:264-284`). `gate-check.ts:1-7` still prints golden hashes | Determinism for `(config, seed)` only. Separate RNG streams remove the need for draw-skipping |
| S5 | Features that run every tick and do nothing | 17,000 plants simulated and eaten by nothing (`lw:95`). Brain-gated bite, scent and breed stuck open (C21). Learning (C23). Display and preference genes (C24). `bodySense` weights drawn for every creature and never read in the demo (`lw:118`). Father ignored in brain inheritance (`genome.ts:392-398`). At least 14 knobs sit at their inert value in the demo: `minTurnRadius` and its 4 companions (`lw:29`), 5 pocket-drift knobs (`lw:82-90`), `huntHandlingTime`, `counterBiteFraction`, `crowdingMortality`, `pocketCapVariance`, `parcelClustering`, `parasiteHostSeekGain` (`config.ts:1015,1023,1026,952,1198`, `lw:208`) | Delete a feature that fails its measurement. Keep the note, not the code |
| S6 | Behaviour written into the sensor | Chase and flee are `myDiet − itsDiet` in the sight sum (`sense.ts:268`) with positive founder weights (`genome.ts:660-663`). Shelter, schooling, mate attraction and host seeking are added to the same vector (`sense.ts:272-311`) | Sensors report. Brains decide |
| S7 | One scalar "diet" gene stands in for a body plan | Diet sets graze share, bite strength, who is prey, scent identity, sight appeal and mate compatibility (`economy.ts:79,116,128,333`, `scent-field.ts:48-49`, `sense.ts:268`, `genome.ts:452`) | Parts define what a body can eat and how it is perceived |
| S8 | Body size is not physical | Collision uses one global radius (`physics.ts:35`). Bite strength has no size term (`economy.ts:128`) | Size from the body |
| S9 | Heading is a free variable set by the brain | `brain.ts:363-364`. See C17 | Turning from forces on the body |
| S10 | Duplicated logic that drifted | The debug overlay's prey pick ignores `huntDietGap` (`src/render/overlay.ts:172` against `economy.ts:116`). `brain-view.ts:3` still calls the brain a single linear layer. `palette.ts:143` holds a gene maximum of 1.5 that is now 2.5 (`genome.ts:194`). `sense.ts:182-183` describes a fixed 5×5 scan that is now range-derived (`sense.ts:244`). `world.test.ts:9` says 1024², line 13 uses 512 | Display code reads values the sim recorded |
| S11 | Terrain rebuilt habitat from a different RNG stream | 3.9 gotcha. `walls.ts:345,361` | One source of truth for habitat |
| S12 | Fixed per-tick cost that scales with capacity and area | Section 1 | Touched-bucket clearing, bounded live scans, fewer grids |
| S13 | Brain size carried no energy cost | `economy.ts:438-439`. `memory/survival-repro-predator-fix.md` | Already decided for Tidepool. See C20 for the risk |
| S14 | Per-creature allocations in "allocation-free" kernels | `walls.ts:183,205`. `phero-field.ts:78` called at `sense.ts:137,166`. `sense.ts:5` promises none | Write results into caller buffers |
| S15 | Channel triplication | Three copies of sample, graze, step and scratch buffers (`food-field.ts:52-63,536-589,696-822`). Three graze branches (`economy.ts:337-410`) | An array of channels, or entities with a continuous trait |
| S16 | Gates certified "not dead", never "healthy", and the health gate was not run on the commit that broke the demo | `memory/arc-b-ecology-outcomes-2026-07-03.md`. `HANDOFF.md:30-33` | Run the health gate on every change to sim constants |
| S17 | Probes drifted from the shipped config | `memory/codebase-review-2026-06-27.md`. `memory/resilience-satiation-gate.md` (session 2, mirror drift) | Probes import the shipped config. No hand copies |
| S18 | Concurrent sessions tuned the same demo | `memory/sim-tuning-process-rules.md` rule 3 | One tuning arc at a time |
| S19 | A whole earlier engine with what Tidepool now wants was discarded | Recurrent neuron networks with state between ticks, bonded multi-cell bodies, a developmental genome with add, delete and duplicate mutations existed in the M4 to M7 engine (`docs/decisions/INDEX.md:24-41`). It is archived at tag `archive/m7.5-engine` (`memory/MEMORY.md`) and was not read for this inventory | See open question Q1 |

## 7. Open questions

| # | Question | Where I looked |
|---|---|---|
| Q1 | Does the archived M4 to M7 engine hold reusable NEAT-style code? Its notes record two lessons that apply directly: every founder gene had innovation id 0, which made innovation-based species distance useless (`docs/decisions/INDEX.md:41`), and spring-bonded bodies needed heavier cells and stiffness under about 2.5 to stay stable under explicit integration (`docs/decisions/INDEX.md:33-34`) | Decision log and `memory/m4-neural-nets.md` to `memory/m7-evolution.md` only. The tag was not checked out |
| Q2 | Which commit between `183b20c` and HEAD, other than the morphs commit, removed the predator layer on seeds 2 and 3? | `HANDOFF.md:30-33`. `memory/plants-as-entities-2026-09.md`. No answer recorded |
| Q3 | What does the shipped demo do at 20,000 ticks on 4 seeds today? Every 20,000-tick result in the notes predates the 2026-07-15 regression | `HANDOFF.md:46` lists it as not done |
| Q4 | Is the temperature gene working now that it is on in the demo with per-region step temperature? The last recorded reading was a ratio of 0.5 to 1.0 with the feature off by default, and a later note says readings taken after biomes landed were invalid | `lw:184`. `walls.ts:272-280`. `memory/arc-c-regional-diversity-2026-07-04.md`. `memory/plants-as-entities-2026-09.md` |
| Q5 | Is the glow sense used by evolution? It is on by default with a field and 4 weights. No probe result is recorded | `config.ts:1076`. Searched all memory notes for a glow measurement |
| Q6 | Was the hunger input ever recruited? It is on in the demo | `lw:93`. `memory/diversity-levers.md` says unproven |
| Q7 | Why does `bodySense` crash the demo seed? | `lw:118-120`. `memory/a1-interoceptive-inputs.md`. Effect measured, mechanism not |
| Q8 | What is the per-tick cost in a browser at demo population? The headless baseline was 218 times over the assumed budget and the browser half of that measurement was never taken | `plans/2026-09-plants-as-entities.md:589-594` |
| Q9 | Is the "62 of 185 weights" plasticity figure still exact? The code agrees in structure (84 weights walked, 6 biases skipped), but I did not re-run the probe | `brain.ts:562-612` |
| Q10 | How should a persistent world be saved? Core has no serialisation beyond the RNG state accessor | Searched `src/core` for `serialize`, `toJSON`, `snapshot`. Only `rng.ts:18-24` |
| Q11 | Cross-device determinism. Core uses `sin`, `cos`, `tanh`, `exp`, `log`, `sqrt`, `hypot` in the brain, gradients and gaussian draws. Results can differ between engines and between TypeScript and Rust. The draft only tested same-machine reproducibility | `brain.ts:126-127,304,382`. `rng.ts:57`. `abiotic.ts:43`. `world.test.ts:24-31` |
| Q12 | The README says the user can "drop food". I found no spawn or paint handler | Searched `src/app/main.ts` for `shiftKey`, `altKey`, `spawn`, `paint`. Only the layer key at `main.ts:654` |
| Q13 | Touch input does not exist. The canvas listens for wheel and mouse events only | `main.ts:603-638` |
| Q14 | The plant grazing design (C30) rests on one areal sum whose inputs were measured outside the system it describes. It has never run | `plans/2026-09-plants-as-entities.md:839-843` |
| Q16 | Background simulation. The draft runs the sim on the main thread and uses no worker. A time-skip on a phone will need one, or it will freeze the page | Searched `src` for `Worker` and `SharedArrayBuffer`. No match. Loop at `main.ts:710-737` |
| Q15 | `plants-as-entities` plan line refs to `world.ts` are marked approximate in the plan itself. I did not re-pin them | `plans/2026-09-plants-as-entities.md:6` |

## Appendix A. Drift between the owner notes and the current code

| Note | Claim | Current code |
|---|---|---|
| `MEMORY.md` index, `plants-as-entities-2026-09.md` | Every birth applies a −3 learning reward to the mother | Fixed. The mother's reward baseline is reset at birth (`economy.ts:748-752`) |
| same | Attached parasites pay the host's move cost | Fixed (`economy.ts:423`) |
| same | Abyss biome size override is overwritten | Fixed. Biome overrides are applied last (`world.ts:341-357`) |
| same | Temperature scale is dead when walls are active | Fixed. Region temperature is sampled from the smooth field at the region seed (`walls.ts:272-280`) |
| same | Plant smell deposits into the existing 4-channel scent field | Built as a separate 2-channel field (`plant-scent.ts:6-9`) |
| `arc-c-regional-diversity-2026-07-04.md` | Temperature gene is off and not working. Gene count 28 | On in the demo at 0.4 (`lw:184`). Gene count 31 (`genome.ts:115`). No passing measurement recorded |
| `biogeographic-demes-redesign.md` | Diet gene at offset 10 of stride 27 | Offset 10 (`genome.ts:49`), stride 31 (`genome.ts:115`) |
| same | `foodMaxFertility` 3, richness variance 0.5, `deadWaterCost` 0.02, `dietGeneralistFloor` 0.6 | 5, 0.8, 0.05, 0.7 (`lw:50,53,55,147`) |
| `survival-repro-predator-fix.md` | Demo ships `basalCost` 0.05, eat gate off, `herbivoryExp` 1.0, `biteRange` 24, seek window 300, compat 0.75 | 0.06 (`lw:113`), eat gate on (`config.ts:1117`), 0.7 (`lw:144`), 16 (`config.ts:1010`), 120 and 0.6 (`config.ts:973,975`). Mate reach was fixed by `mateContactRange` 36 (`lw:123`) |
| same | `findMate` uses a fixed 3×3 scan | Fixed (`economy.ts:654-664`) |
| `learning-plasticity-ceiling.md` | Cites `brain.ts:497-499`, `500-509`, `547-555` | Now `brain.ts:531-533`, `534-544`, `604-612`. The skip is now explicit in `PLASTIC_RANGES` (`brain.ts:562-577`) |
| `config-doc-drift.md` | Predator founder diet seeded at `world.ts:228` | Now `world.ts:325`. The wrong comment is still at `config.ts:214` |
| `codebase-review-2026-06-27.md` | Ghost pockets at `walls.ts:296,312` | Now `walls.ts:345,361`. Still unfixed |
| `diversity-tuning-2026-06-29.md` | Mutation σ 0.08, hue σ 0.04 | 0.12 and 0.06 (`lw:176-177`) |
| `flow-current-tuning.md` | Demo flow strength 4 | 1 (`lw:14`) |
| `resilience-satiation-gate.md` | Pocket drift 0.5, 24 pockets | Drift 0 (`lw:82`), 20 pockets (`lw:47`) |
| `predation-engine-ceiling.md` | Predator bundle includes `biteRange` 24 | Not in the demo. 16 (`config.ts:1010`) |
| `sexual-reproduction-speciation.md` | `breedCooldown` 150 | 100 (`lw:121`) |
| `brain-consolidation.md`, `identity-bearing-scent.md` | Brain size 146 or 36. Hidden inputs 20, outputs 3 | 185, 24, 6 (`genome.ts:610-611,633`, `genome.test.ts:52`) |
| `creature-visuals.md` | Far dots rotate to heading and saturation encodes metabolism | The point shader has no heading attribute and saturation comes from vision (`renderer.ts:74-87,116`). `consolidation-and-overnight-run.md` records that only the Canvas2D overlay was merged |
| `env-features.md` | A founder can be seeded inside a wall | Fixed (`world.ts:282-288`) |
| `predator-boom-bust-experiment.md`, `arc-b-ecology-outcomes-2026-07-03.md` | Baseline settles to a 19 to 36% predator minority. Gate numbers 48 to 61% | Describe the tree at or before `183b20c`. Not true of HEAD (`memory/plants-as-entities-2026-09.md`) |
| `arc-b-ecology-outcomes-2026-07-03.md` | Gate floors: predators ≥ 10%, σ ≥ 0.20, births ≥ 1,000 | Matches (`demo-health-gate.ts:29-31`) |
| `grading-and-legibility-2026-07-02.md` | Sexual reproduction does not recombine the brain | Still true (`genome.ts:392-419`) |

## Appendix B. Draft scale sheet

| Quantity | Value | Where |
|---|---|---|
| World | 8192 × 8192 u, toroidal | `config.ts:912-913` |
| Timestep | 1 | `config.ts:914` |
| Creature pool | 32,768 | `config.ts:915` |
| Founders | 1,000 | `config.ts:919` |
| Reference body radius | 6 u | `config.ts:923` |
| SIZE gene range | 2 to 32 | `genome.ts:187` |
| Creature hash cell | 12 u | `world.ts:130` |
| Coarse field cell | 64 u (128²) | `config.ts:934-935` |
| Terrain cell | 16 u (512²) | `config.ts:1136-1137` |
| Plant hash cell | 32 u | `config.ts:1241,1245` |
| Bite reach | 16 u | `config.ts:1010` |
| Mate reach | 36 u | `lw:123` |
| Smell half-step | 64 u centre, 8 to 256 | `config.ts:980`, `genome.ts:186` |
| Vision range | 140 u centre, 0 to 1,152 | `config.ts:1031`, `genome.ts:214` |
| Speed cap | 6 u per tick centre, 1 to 20 | `config.ts:928`, `genome.ts:184` |
| Damping | 0.9 centre, 0.6 to 0.98 | `config.ts:927`, `genome.ts:245` |
| Repulsion stiffness | 2 | `config.ts:924` |
| Max turn | 0.35 rad per tick centre | `config.ts:981` |
| Pockets | 20, σ 448 u, about 1,800 u apart | `lw:47-48`, `config.ts:801-803` |
| Demo population | 1,800 to 11,200 at 12,000 ticks on seeds 1 to 3 | `lw:229` |
| Plants | about 17,000 | `lw:98` |

## Appendix C. Draft genes mapped to Tidepool concepts

| Draft gene or knob | What it did | Tidepool home |
|---|---|---|
| SIZE | Predation gate, storage, speed cap | Body size |
| MAX_SPEED, MAX_THRUST, MAX_TURN, DAMPING | Motor ceilings and glide | Fins, flagella, body drag |
| EAT_RATE, DIET, FORAGE_PREF | Intake rate and what is edible | Mouth parts and their type |
| DAMAGE | Energy removed per bite | Mouth or spike part |
| VISION_RANGE, VISION_FOV, VISION_ACUITY | Cone scan parameters | Eye part parameters |
| SENSE_RANGE | Gradient half-step | Chemosensor part |
| PHERO_DEPOSIT, glow output | Chemical and light emission | Gland and light organ parts |
| PHOTOSYNTH | Light income, higher when still | Photosynthetic tissue part |
| PARASITISM | Attach to a larger host and drain | Sucker or hook part. See C19 before building |
| SCAVENGER | Share of nearby corpses | Corpses as entities, eaten by mouths (`plans/2026-09-plants-as-entities.md:867-887`) |
| METAB_EFF | Basal cost against thrust | Body-wide metabolic rate |
| REPRO_THRESHOLD, SATIATED_THRESHOLD, BIRTH_ENERGY | r/K life history | Keep as life-history genes |
| MATURITY_AGE, SENESCENCE_AGE | Juvenile lock and costed longevity | Keep. Re-scale to the target lifespan |
| DISPLAY, PREFERENCE | Mate signal and taste, inert | A visible ornament part and a brain input for it |
| THERMAL_PREF | Pure regional adaptation | Depth or temperature tolerance |
| SHELTER_DRIVE, COHESION_DRIVE | Hand-written social pulls | Drop. Let brains do this from eye inputs |
| Plant DEFENCE | Armour that cuts the bite both ways | Shell part on plants and animals |
| Hue | Lineage colour with no function | Keep as a visible heritable marker |
