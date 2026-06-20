# Design Spec — Evolution Playground

**Date:** 2026-06-20
**Status:** approved design, pending owner review of this written spec
**Audience:** a fresh build session in a brand-new project. This document is **self-contained** — it assumes no access to any prior codebase. Build from this alone, piece by piece.

---

## 0. What this is

An **interactive 2D playground** where little neural-net critters swim, eat, breed, mutate, learn within their own lifetimes, and evolve new behaviors across generations — and you can reach in and mess with the world live (drop food, spawn/cull creatures, tune any parameter, follow one creature and watch its brain fire).

The goal is **emergent, watchable life**, not research rigor. Success is *felt*: you watch a creature get visibly better at finding food, you watch a new lineage's color sweep the population, you watch the ecosystem boom and bust. If it doesn't feel alive to watch, it has failed — no matter how correct the simulation is.

### The two hard rules (everything else is tuned by feel)

1. **The world must stay alive.** A headless check runs the demo config for 100k ticks across a few seeds and fails loudly on extinction *or* flatline (population coefficient-of-variation ≈ 0, or zero births). This is the single automated guardrail.
2. **Feel ships in the first slice.** The very first playable build must already let you follow one creature from birth to death, see it react to food, and — over a few generations — see behavior visibly improve. Feel is the acceptance test of Slice 1, not a polish pass at the end.

### Why these rules exist (the failure this design is reacting to)

Two prior versions of this project were built as research-grade deterministic engines — byte-identical reproducibility, golden-hash CI, ablation gates on every system, lineage/species telemetry. **Both shipped dead worlds.** One literally simulated a corpse: plants went extinct by tick ~400, animals never reproduced (zero births across 12k ticks), and the entire evolution apparatus was dead instrumentation on a non-breeding population. The rigor passed every test and never noticed, because byte-identity measures "did the bits change," not "is this world alive and worth watching."

Lesson baked into this spec: **optimize for aliveness and feel, automate only the one check that catches the failure that actually happened, and tune everything else by eye using the in-app knobs.**

---

## 1. Design pillars (in priority order)

These are requirements, not aspirations. They constrain the simulation; they are not a rendering afterthought.

1. **Legible behavior (the soul).** You must be able to *read a creature's intent from its motion*: it senses food and accelerates toward it; it senses a predator and bolts away. And you must be able to see it **get better** at this — within a single life and across generations. Everything else serves this.
2. **Watchable life arcs.** An individual lives long enough (tens of seconds at normal speed) to be born, wander, eat several times, maybe reproduce, age, and die — so following one *feels like witnessing a life*. Generations watchable at a few per minute. This is an explicit constraint on the economy/longevity numbers.
3. **Visible breathing world.** Food is glowing patches you watch get grazed bare and regrow; swarms boom on a bloom and thin out as it's stripped. You feel the ecosystem's rhythm without reading a number.
4. **Visible heredity.** Genes drive **appearance** (color, size, shape), not only hidden brain weights — so a mutation literally *looks* different and you watch a lineage spread with your eyes.

---

## 2. Decisions already made (do not relitigate)

| Decision | Choice | Rationale |
|---|---|---|
| Reproducibility | **Seeded-reproducible on one machine; no byte-identical cross-platform contract, no golden-hash CI.** Same seed → same run locally (for replay/debug). RNG may be used freely, including in the tick. | Replay/debug value without the research-grade constraints (custom tanh, fixed reduction order, RNG-only-at-birth) that cost a lot and serve provability we don't need. |
| Within-life learning | **Yes, core, from Slice 1.** Toggleable. No "prove no Lamarckian leak" verification. | It is the *only* feature that delivers "watch a creature get better within its life." That is the soul pillar. |
| Playground interactions | **God tools, live knob tuning, inspect & follow — all v1.** No save/load worlds, no hall-of-fame, no hand-breeding, no A/B world-branching in v1. | These three are what "playing with creatures" means to the owner. Curation machinery is deferred. |
| First sense | **Smell only in Slice 1.** Sight + hearing added later. | Keep Slice 1 small enough to actually reach "feels alive" fast. |
| Aesthetic | **Bioluminescent deep-sea:** near-black background, glowing creatures and food. Parts colored by function. | Maximally legible (light + motion pop against black) and pleasant to leave running. |
| Build order | **Playable-slice-first**, each slice tuned by feel, each must keep passing the alive-guardrail. | The prior builds deferred "is it alive to watch" until the end and found out too late it wasn't. |

---

## 3. Tech stack & repo

- **Language/tooling:** TypeScript (strict) + Vite + Vitest + pnpm + a Makefile (`make help`). Prettier + ESLint.
- **Rendering:** Canvas2D for the first slices (simple, debuggable, fine for low-thousands of glowing sprites with additive blending). Upgrade to WebGL2 only if/when creature counts demand it — not before.
- **Threading:** none in the sim core. Rendering may be off-thread later, but the sim is a plain synchronous tick. (No premature workers.)
- **Layout:** a fresh `src/` tree. The browser app is a thin renderer + control surface bolted onto a headless simulation core — **one code path**, never two. The headless harness imports the *same* core and the *same* `DEMO_CONFIG` the app uses.

```
src/
  core/        # the simulation (no DOM, no rendering) — store, tick, fields, brain, genome, economy, rng, config
  render/      # Canvas2D renderer (reads core state, draws; never mutates sim)
  app/         # browser glue: main loop, camera, god tools, knob panel, inspector, graph
  headless/    # harness + the alive-guardrail check (imports core + DEMO_CONFIG)
```

---

## 4. Simulation core

### 4.1 Substrate (structure-of-arrays)

No per-creature objects. Parallel typed arrays indexed by integer slot, fixed capacity `N`, free-list recycled.

**Organism store** (one entry per slot):
- `genId: Uint32` — bumped on each reuse of the slot (staleness detection)
- `alive: Uint8`
- `x, y: Float32`, `vx, vy: Float32`
- `heading: Float32` — **decoupled from velocity** so a creature can face one way while drifting (makes the sight cone meaningful later, and lets turning read as intent)
- `energy: Float32`
- `age: Uint32`
- `species: Uint8` — trophic-role tag (e.g. consumer / predator). A *tag*, not a behavior switch; behavior comes from the brain.
- `genomeRef: Uint32` — index into the genome pool
- `senseGain[…]: Float32` — sense sensitivity multipliers, cached at birth from genome
- `lineageId, founderId: Uint32` — for color/telemetry
- recurrent brain hidden-state — a slice of a shared `Float64` pool (so two creatures with identical genomes still diverge as their memories differ)

**External references are `(slot, genId)` pairs.** A reference is stale iff `store.genId[slot] !== genId`.

**Slot recycling:** a `Uint32` stack free-list. Birth pops a slot and increments its `genId`; death pushes the slot back.

**Producer biomass is a scalar field, not entities** (§4.4). This is what keeps food O(grid) instead of O(N) bookkeeping.

### 4.2 Tick (fixed timestep `dt`)

```
1 SENSE       read previous tick's frozen fields + spatial hash → fill each creature's sense inputs (read-only)
2 THINK       run each brain: sense inputs + recurrent hidden state → motor outputs (turn, thrust)
3 ACT         apply non-movement intents: eat (food-field cell or prey), emit scent
4 MOVE        symplectic-Euler integrate from thrust/turn; wrap toroidally; deposit MOTION ∝ speed
5 METABOLIZE  subtract basal + movement cost; add eat income; clamp energy
6 REPRO/DIE   energy ≤ 0 → die (free slot); energy ≥ repro bar → spawn child (mutate genome, split energy)
7 FIELDS      diffuse + decay SCENT & MOTION; logistic-regrow PRODUCER; rebuild spatial hash
```

**Two invariants that keep behavior order-independent within a tick:**
- (a) SENSE/THINK read the **previous** tick's frozen fields and hash, so every creature senses the same snapshot — no within-phase ordering effects.
- (b) A child born in step 6 is `alive` but does **not** act until the next tick (no same-tick birth cascades).

### 4.3 Physics

Toroidal (wrapping) world. Symplectic-Euler integration. Velocity and force **clamps** for stability (cap max speed and max per-tick acceleration). Movement cost is **∝ speed²** (§4.4) — this is load-bearing: it makes blind fast searching expensive, so sensing has real economic value.

### 4.4 Economy (engineered to breathe AND to give watchable life arcs)

This is the part that killed both prior builds, so the numbers below are the *design*, not decoration. They are all live knobs; the **relationships** matter more than the exact values.

**Producers — logistic field with anti-extinction diffusion.** Per grid cell, biomass `B ∈ [0, K]`:
```
B' = B + r·B·(1 − B/K)            // logistic regrowth
B' = B' + d·(diffuse5(B) − B)     // slow inter-cell spread ("spores from survivors")
```
The diffusion term is critical: it removes the `B = 0` absorbing state. Global food extinction now requires *every* cell at zero simultaneously, which grazing-then-regrowth makes statistically near-impossible. Local grazing + spatial spread creates **refugia** that desynchronize local cycles — so the system runs a sustained limit cycle instead of one synchronized crash. Target half-recovery in ~30–60 ticks: fast enough to rebound, slow enough to allow a visible bust.

**Consumer energy budget (starting ratios):**

| Flow | Start value | Sign |
|---|---|---|
| basal upkeep / tick | 0.5 | − |
| movement cost / tick (∝ speed²) | ≤ 1.0 | − |
| eat income / tick (capped by local `B` and a max-ingest rate) | ≤ 3.0 | + |
| reproduction threshold `E_repro` | 20 | gate |
| reproduction cost `c_repro` (energy to child + overhead) | 12 | − |
| birth energy `E_birth` | 10 | — |
| death threshold | 0 | — |

**The arithmetic is the design:**
- **Fed:** net ≈ `3 − 0.5 − 0.5 = +2/tick` → climbs from `E_birth=10` to `E_repro=20` in ~5 feeding ticks → reproduces (drops to ~8, survives) → climbs again. **Reproduction is reliably reachable while fed.** (The prior builds set the bar so high relative to income that *zero* births ever fired — the entire evolution apparatus was dead.)
- **Unfed:** net ≈ `−1/tick` → starves from 8 in ~8 ticks, from 20 in ~20. **Starvation is a real, frequent clock.** (The prior builds set upkeep so low nothing ever starved → frozen, lifeless populations.)

**Watchable life arcs are a tuning target here.** Pick `dt` and these rates so a typical fed creature lives on the order of tens of seconds of wall-clock at normal speed and generations tick by at a few per minute. If lives are too short to follow, the economy is mis-tuned even if it "breathes."

**Why it oscillates (endogenous boom-bust):** spatial consumer-producer loop (Lotka-Volterra-like) + regrowth lag + a mandatory overshoot (the income-to-`E_repro` gap is a flywheel: consumer momentum carries past sustainable density) + spatial refugia. If it damps to a flat equilibrium: lower `r` / raise `K`, widen the repro gap, or lower producer diffusion. **Do not add noise to fake breathing** — that's not the same thing and you'll know.

**Predators (later slice):** a second `species` tag whose ACT eat-target is nearby creatures instead of the food field. Drops in with zero structural change because "eat" is a generic *consume energy from a target* (field cell or organism). Diet can later become an evolvable gene so the trophic role *emerges* rather than being assigned.

### 4.5 Scalar-field engine

One reusable, double-buffered grid type (coarse, e.g. 128² or 256²). Single update primitive:
```
field' = decay · diffuse5(field) + deposits     // 5-point toroidal stencil
```
Bilinear sampling + central-difference gradients for reading. Instantiated as:
- **PRODUCER** — food biomass (logistic regrowth per §4.4; feeds the SCENT deposit term)
- **SCENT** — smell. High diffusion, slow decay → long-range gradient pointing toward standing biomass.
- **MOTION** — sound (used once hearing exists). Low diffusion, fast decay → recent fast-movement detection. Deposited in MOVE ∝ speed.

### 4.6 Spatial hash

Uniform grid, cell size = the largest neighbor-query radius. Rebuilt every tick by **counting sort** → O(N). Iterating in ascending slot order within buckets keeps neighbor scans reproducible. Toroidal 3×3 (or 5×5) neighborhood scans. No quadtree.

---

## 5. Brain (genetic evolution + within-life learning)

### 5.1 Topology

Fixed-topology **recurrent** net, flat `Float64` arrays:
```
sensors[S≈8–10] → recurrent tanh hidden[H≈12] → motors[M=3: turn (signed tanh), thrust [0,1], (burst, optional)]
```
Forward pass (ascending index order):
```
h_raw[j] = bias_h[j] + Σ_i W_ih[i][j]·sensor[i] + Σ_k W_hh[k][j]·h_prev[k]
h_new[j] = tanh(h_raw[j])
motor[m] = act_m( bias_o[m] + Σ_j W_ho[j][m]·h_new[j] )
h_prev   = h_new                                   // recurrent carry = working memory
```
`tanh` everywhere bounds activations (required for learning stability). ~300 multiply-accumulates per creature per tick. **No NEAT** — topology growth is an opt-in mutation, not a framework. Recurrence is the cheapest route to temporal behavior ("energy has been rising while heading this way → keep going").

### 5.2 Within-life learning (Baldwin) — reward-modulated Hebbian with eligibility traces

Per plastic synapse, per tick:
```
elig_ij = (1 − λ)·elig_ij + λ·(pre_i · post_j)             // eligibility trace bridges decision→reward delay
Δw_ij   = lr_ij · elig_ij · reward
w_ij    = clamp( w_ij·(1 − decay) + Δw_ij, −W_MAX, +W_MAX ) // stability triad: clamp + decay + bounded reward
```
`reward = clamp(rewardEMA / rewardScale, −1, 1)`, where `rewardEMA` is an exponential moving average of net energy intake (`energyGained − baselineCost`). **Reward is also fed back as a sensor input**, so the net can condition on its own reward state. Cost is ~2–3× the forward pass if every synapse is plastic; a heritable **plastic-mask** can freeze subsets to cap cost.

### 5.3 Heritability (the Baldwin rule — this is the whole point)

- **Inherited** (copied from the parent's *genome*, then mutated at birth): initial weights (the *instinct*), plasticity params (`lr`, `λ`, `decay`, plastic-mask), reward wiring (`rewardScale`, EMA α).
- **NOT inherited:** the *learned* weight values. A child's starting weights come from the parent's **genome**, never the parent's current learned weights. Learning dies with the individual.
- **Why this matters:** because selection can't copy learned weights, it instead selects for genomes that *start closer to* and *learn faster toward* whatever learning keeps discovering. Over generations the instinct catches up to the learned behavior (genetic assimilation). We **watch** this via the inspector (a creature's path tightening as it learns; later generations bumbling less as newborns). We do **not** write a formal no-leak test — the rule is enforced in code (children read genome weights), and that's enough.

---

## 6. Genome & mutation

**Encoding: a flat, serializable record** (typed arrays + scalars), not an object graph:
```
{
  version,
  topology { S, H, M },
  initialWeights: Float64[],     // the instinct
  plasticMask:   Uint8[],        // which synapses learn
  learningRate:  Float64[],      // per-synapse (or per-layer) lr
  elig_lambda, weightDecay, rewardScale, rewardAlpha,
  senseInvest { smell /* sight, hearing later */ },   // costed sensitivity genes
  appearance { hueGene, sizeGene, shapeGene },         // VISIBLE heredity (pillar 4)
  founderId, parentId, lineageId, birthTick
}
```
**Sensors and motors are referenced by stable semantic keys** ("nearest_food_smell_x", "thrust", …). Adding a sense later inserts a new column initialized small — *without scrambling existing learned/instinct structure*.

**Appearance genes are first-class**, not cosmetic: `hueGene` → glow color, `sizeGene` → render size (and, if you want, a small metabolic/speed tradeoff so size is under selection), `shapeGene` → body silhouette. This is what makes evolution visible to the naked eye.

**Mutation operators** (applied at birth, each gated by its own probability knob, defaults LOW): weight perturb (`w += gaussian(0, σ)`), rare weight reset, plasticity-param mutation, plastic-mask flip, appearance-gene drift, opt-in add/remove hidden neuron (resize with zero-init so it's behavior-neutral at birth). Later: sensor/motor rewiring.

**No fitness function.** Selection is purely emergent: survive long enough and stay fed enough to cross the repro bar → you reproduce. Nothing scores creatures.

---

## 7. Senses

Three evolvable, **metabolically costed** senses (only **smell** in Slice 1; sight + hearing later). Each carries different information so they don't collapse into redundancy:

| Sense | Mechanism | Unique information |
|---|---|---|
| **Smell** | SCENT field gradient in the heading frame | long-range, lagging *direction* to standing biomass |
| **Sight** (later) | spatial-hash **cone** query; angular bins report nearest entity distance + species | instantaneous *bearing + distance + identity* of a specific creature |
| **Hearing** (later) | MOTION field in the heading frame | omnidirectional, recent *fast-movement* detection, through occlusion / behind |

Each sense has a **cost gene** (`senseInvest`): higher sensitivity/range costs more upkeep per tick. Where a sense doesn't pay, its upkeep is pure loss → selection drops it; where it pays, benefit > cost → selection keeps it. **Seed founders across a spread of sense-investments** so the sense is expressed and used from tick 0 and selection has variance to act on. (A prior build's extra senses stayed permanently silent partly because nothing was ever seeded using them.) We do **not** write formal complementarity regression tests — we watch which senses survive in which conditions.

---

## 8. Rendering for legibility (pillar 1, the soul)

The renderer reads sim state and draws; it never mutates the sim. Bioluminescent deep-sea look: near-black background, additive-blended glow.

- **Heading always visible** — each creature points where it's going (nose / eye-spot), so "it turned toward the food" reads instantly.
- **Effort visible** — thrust maps to speed *and* to animation/brightness: fast tail-beat / brighter glow / slight motion-streak under hard thrust; dim drift when coasting. You see exertion and intent.
- **Reaction visible** — a creature accelerating toward food or bolting from a threat is the literal thing on screen. Follow-cam can optionally highlight *what* it's reacting to (the attracting food cell, the fleeing-from threat).
- **Learning visible — motion trails.** A fading trail behind a creature turns its path into a picture: a young creature's trail is a wandering scribble; as it learns, the scribble tightens into a beeline. This is "getting better," shown without a number. Backed by an optional lifetime-efficiency sparkline in the inspector.
- **Heredity visible** — `hueGene`/`sizeGene`/`shapeGene` make lineages look distinct; you watch a successful mutation's color spread across the population.
- **Parts colored by function** — even a single-celled creature renders its functional bits distinctly (sensor spot, mouth, flagellum). Pure legibility, and it lays the visual groundwork for multicellular body-plans later.
- **Food field** — drawn as glowing patches whose brightness tracks biomass, so you literally watch a bloom get grazed bare and regrow.

---

## 9. Playground interaction layer (the UI is the product, not a test harness)

- **Time control:** play / pause / single-step, speed slider (including fast-forward to watch evolution accelerate), reset (with seed).
- **God tools:** click-drag to paint / drop food blooms; click to spawn or cull creatures. (Obstacles/walls: later.)
- **Live knobs:** every tunable parameter as a slider that hits the *running* sim instantly — mutation rates, food `r`/`K`/diffusion, basal upkeep, movement cost, eat rate, repro bar, learning rate, sense cost, learning on/off. Live tuning is a first-class source of value, not a debug panel.
- **Inspect & follow:** click a creature → follow-cam + a panel showing its brain firing live (sensor inputs, hidden activations, motor outputs), its genome, current senses, energy, age, lineage, and the learning sparkline. This is where "why is it doing that?" gets answered.
- **Macro view:** a population time-series graph (per species, births/deaths, mean energy) so booms, busts, and extinction read **loud**. It's the macro view of the same breathing you see in the food patches.

The headless harness shares this exact core + `DEMO_CONFIG`. One code path.

---

## 10. The one automated guardrail

A headless job runs `DEMO_CONFIG` for 100k ticks across a few seeds and **fails loudly if**:
- population hits zero (extinction), OR
- population flatlines (coefficient of variation ≈ 0 over a long window) or births stay at zero (frozen, lifeless world).

That's it. This is the exact failure mode that killed both prior builds. Everything else — does it feel good, are the senses earning their keep, is the boom-bust pretty — is judged by eye in the running app. Resist the urge to re-add ablation gates, golden hashes, and per-system regression suites; that rigor is what the owner explicitly chose to drop.

---

## 11. Build sequence (playable-slice-first; feel is the gate)

Each slice is shippable, watchable, tuned by feel, and must keep passing the alive-guardrail.

**Slice 1 — "a life you can watch" (shallow but complete):**
SoA substrate + tick loop + logistic food field + **smell only** + simple evolvable recurrent brain (genetic + Baldwin learning) + repro/death economy tuned for *watchable life arcs* + bioluminescent renderer with heading / effort / trails + follow-cam + a few core knobs + the alive-guardrail.
**Acceptance:** you can follow one creature from birth to death, see it react to food, and over a few generations see behavior visibly improve. **If it doesn't feel alive, Slice 1 is not done.**

**Then, each by feel, each still passing the guardrail:**
2. Full god-tools + full knob panel + macro graph polish.
3. **Sight + hearing** (the other two senses), seeded across investment spreads.
4. **Predators** (second species; eat-target = creatures).
5. **Evolvable diet** → trophic role emerges instead of being assigned.
6. **Bioluminescence / visible-trait experiments** — e.g. a glow gene that costs energy but signals/lures.
7. *(Stretch)* **Multicellular body-plans** — creatures as small clusters of cells with distinct visible functions.

The reordering versus a correctness-first plan is the entire point: **feel ships in Slice 1.** The prior builds deferred "is this alive to watch?" until everything was built and found out too late that it wasn't.

---

## 12. Glossary of load-bearing knobs (for live tuning)

| Knob | Effect | If the world feels wrong |
|---|---|---|
| `r`, `K` (food) | regrowth rate, carrying capacity | flat/damped → lower `r`, raise `K` |
| producer diffusion `d` | anti-extinction spread | extinctions → raise; too-uniform/no busts → lower |
| basal upkeep | starvation clock | nothing dies → raise; everything dies → lower |
| movement cost coeff | cost of speed² | sensing worthless → raise; creatures frozen → lower |
| `E_repro`, `c_repro`, `E_birth` | reproduction gating | no births → lower `E_repro` toward reachable; explosive → raise the gap |
| mutation σ / rates | evolutionary pace | evolution invisible → raise; chaos → lower |
| learning rate / on-off | within-life plasticity | no visible "getting better" → raise lr or confirm learning on |
| sense cost | sense upkeep | senses never drop → raise cost; never kept → lower |

---

*End of spec. A fresh session with only this document should be able to build Slice 1 and grow it slice by slice.*
