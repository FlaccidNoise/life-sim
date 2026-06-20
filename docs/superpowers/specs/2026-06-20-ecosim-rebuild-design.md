# Design Spec — Evolving-Ecosystem Sim (ground-up rebuild)

**Date:** 2026-06-20
**Status:** approved plan (`~/.claude/plans/recursive-whistling-snowglobe.md`), spec pending owner review
**Supersedes:** the M1–M7.5 engine (archived). Rationale in `SIMPLIFICATION-AUDIT.md`.

This spec is the design of record — the *how it works*. The companion plan file holds the *sequence* (the phased walking-skeleton roadmap). Read the plan for "what we build when"; read this for "what each piece is and why."

---

## 1. Purpose & vision

A 2D world of swimming organisms whose neural-net brains make decisions, whose genes mutate and evolve across generations **and** whose brains learn within a single lifetime, embedded in a pure-economic ecosystem whose selection pressure rewards survival — so genuinely adaptive creatures **emerge, and you can watch it happen** in real time.

## 2. Goals / non-goals

**Goals.** Emergent natural selection (no fitness function). Within-lifetime learning + cross-generation evolution (Baldwin). Three genuinely complementary senses. A food web that *breathes* (sustained boom-bust). Deterministic + testable. Watchable + tunable at every step.

**Non-goals (v1).** Multicellular bodies (optional Phase 9). 3D. GPU compute. Multiplayer. Realistic biochemistry. Anything that isn't on the path to the four goals above.

## 3. What we are designing against (and the safeguards)

The previous engine died three ways (all verified by ablation, `SIMPLIFICATION-AUDIT.md`). Each has a structural safeguard baked into this design — these are load-bearing, not nice-to-haves:

| Old death | Safeguard |
|---|---|
| Accreted 75 systems, ~40% inert | **Ablation gate**: no system merges until ON-vs-OFF proves it changes dynamics; byte-identical ⇒ deleted. All prior gates re-run each phase. |
| Validated @2048², shipped @8192² → collapse | **One config, one scale**: `DEMO_CONFIG` is the single source; demo = validated = tested. |
| 0 births → evolution apparatus was dead instrumentation | **Observability + headless harness from Phase 0**: you must demonstrate the new system changing the *watched* world; the population graph makes collapse loud. |

## 4. Architecture

### 4.1 Substrate

**Data layout — SoA (structure-of-arrays).** No per-entity objects. Parallel typed arrays indexed by slot. Two store families:

- **Organism store** (fixed capacity `N`, free-list recycled): `genId:Uint32`, `alive:Uint8`, `x,y:Float32`, `vx,vy:Float32`, `heading:Float32` (decoupled from velocity so the sight cone is meaningful while drifting), `energy:Float32`, `age:Uint32`, `species:Uint8` (trophic-role tag, *not* a behavior switch), `genomeRef:Uint32`, sense-investment gains ×3 (`Float32`, cached at birth), `lineageId/founderId:Uint32` (telemetry only). Recurrent brain state lives here (a slice of a shared `Float64` pool) so identical genomes can diverge behaviorally.
- **Genome pool** (SoA): see §4.3.
- **Producer biomass** is a scalar field, **not** entities (§4.4) — this is what makes logistic regrowth O(grid) instead of O(N) bookkeeping.

**Slot recycling.** A `Uint32` free-list stack. Birth pops a slot and bumps its `genId`; death pushes it back. External references are `(slot, genId)`; staleness is a genId mismatch.

**RNG.** One seeded PRNG (PCG32 or SplitMix64; *not* `Math.random`). Its state is part of saved sim state. **Drawn only at birth/mutation/founder-seeding — never in the per-tick simulation loop.** The tick is a pure function of (state, params).

**Tick order (fixed timestep `dt`):**
```
1 SENSE      read previous-tick snapshot → fill each organism's sense inputs (read-only)
2 THINK      run each brain: inputs + recurrent state → outputs (turn, thrust)
3 ACT        apply non-movement intents: eat (field cell or prey), deposit scent
4 MOVE       symplectic-Euler integrate from thrust/turn; wrap; deposit MOTION ∝ speed
5 METABOLIZE basal + movement cost; add eat income; clamp
6 REPRO/DIE  energy≤0 → die (free slot); energy≥bar → spawn child (mutate, split energy)
7 FIELDS     diffuse+decay SCENT & MOTION; logistic-regrow PRODUCER; rebuild spatial hash
```
**Two invariants.** (a) SENSE/THINK read the *previous* tick's frozen fields + hash, so every organism senses the same snapshot — no within-phase order dependence. (b) A child born in step 6 is `alive` but doesn't act until next tick (no same-tick birth cascades).

**Physics.** Toroidal world; symplectic-Euler with velocity/force stability **clamps** (carry-forward: the old spring ceilings). Movement cost ∝ speed² (see §4.4).

**Spatial hash.** Uniform grid, cell size = the largest neighbor-query radius (sight range). CSR layout (`bucketStart[]`, `entityList[]`) rebuilt each tick by **counting sort** → O(N), deterministic, ascending-slot order within buckets (free determinism for neighbor iteration). Toroidal 3×3 (or 5×5) neighborhood scans. No quadtree.

**Scalar-field engine.** One reusable grid type (coarse, e.g. 128² or 256²), double-buffered, one update primitive `field' = decay · diffuse5(field) + deposits` (5-point toroidal stencil). Bilinear sampling + central-difference gradients. Instantiated three times: **SCENT** (high diffuse/slow decay → smell), **MOTION** (low diffuse/fast decay → hearing), **PRODUCER** (food; logistic, not diffused as food but feeds SCENT's deposit term).

### 4.2 Brain (Baldwin)

**Topology.** Fixed-topology recurrent net: `sensors[S] → recurrent tanh hidden[H] → motors[M]`. Flat `Float64` arrays. Forward pass in ascending index order:
```
h_raw[j] = bias_h[j] + Σ_i W_ih[i][j]·sensor[i] + Σ_k W_hh[k][j]·h_prev[k]
h_new[j] = tanh(h_raw[j])
motor[m] = act_m(bias_o[m] + Σ_j W_ho[j][m]·h_new[j])
h_prev   = h_new        // recurrent carry = memory
```
Starter sizes S≈10, H≈12, M≈3 (turn signed via tanh, thrust [0,1], optional burst) → ~300 MACs/creature/tick. `tanh` everywhere bounds activations (required for plasticity stability). **No NEAT** — topology growth is an opt-in mutation later. Recurrence is the cheapest path to temporal integration ("energy rising while heading this way → keep going").

**Plasticity (within-life learning) = reward-modulated Hebbian with eligibility traces.** Per plastic synapse, per tick:
```
elig_ij = (1−λ)·elig_ij + λ·(pre_i · post_j)             // bridges decision→reward delay
Δw_ij   = lr_ij · elig_ij · reward
w_ij    = clamp(w_ij·(1−decay) + Δw_ij, −W_MAX, +W_MAX)  // stability triad: clamp+decay+bounded reward
```
`reward = clamp(rewardEMA / rewardScale, −1, 1)` where `rewardEMA` is an exponential moving average of net energy intake (`energyGained − baselineCost`). This is the three-factor rule: pre·post·neuromodulator. Reward is also fed back **as a sensor input** so the net can condition on its own reward state. Cost ≈ 2–3× the forward pass if all synapses are plastic; the plastic-mask (heritable) can freeze subsets to cap cost.

**Heritability (the Baldwin firewall — no Lamarck).**
- **Inherited** (copied from parent genome, then mutated at birth): initial weights (the *instinct*), plasticity params (`lr`, `λ`, `decay`, per-synapse plastic-mask), reward wiring (`rewardScale`, EMA α).
- **Not inherited:** the *learned* weight values. A child's initial weights come from the parent's **genome**, never the parent's current learned weights. Learning dies with the individual.
- **Why this is Baldwin:** selection can't transmit learned weights, so it selects for genomes that *start closer to* and *learn faster toward* what learning repeatedly discovers. Over generations the instinct catches up to the learned behavior (genetic assimilation). The shrinking instinct-vs-learned gap is the measurable signature (§6).

### 4.3 Genome & mutation

**Encoding: direct + gene-keyed indirection.** The genome is a flat, serializable record (typed arrays + scalars), not an object graph: `{version, topology{S,H,M}, initialWeights:Float64[], plasticMask:Uint8[], learningRate:Float64[], elig_lambda, weightDecay, rewardScale, rewardAlpha, senseInvest{smell,sight,hearing}, bodyGenes[](reserved), senseGenes[], founderId, parentId, birthTick}`. Sensors/motors are referenced by **stable semantic keys** ("nearest_food_sin", "thrust"), so adding a sense later inserts a column initialized small **without scrambling existing learned/instinct structure**. (Reject HyperNEAT/CPPN for v1 — too much determinism budget.)

**Mutation operators** (applied at birth, fixed field order, each gated by its own config-knob probability, defaults LOW): weight perturb (`w += gaussian(0,σ)`, Box-Muller from the one PRNG), rare weight reset, plasticity-param mutation (this is what evolution tunes for Baldwin), plastic-mask flip, opt-in add/remove neuron (resize → zero-init new row/col so it's behavior-neutral at birth), later sensor/motor rewiring. All draws consume the PRNG identically across same-seed runs.

### 4.4 Economy (engineered to breathe)

**Producers — logistic field with anti-extinction diffusion.** Per cell biomass `B∈[0,K]`: `B' = B + r·B·(1−B/K)`, **plus a slow inter-cell biomass diffusion** (low-rate 5-point pass = "spores/runners spread from survivors"). The diffusion removes the absorbing state at `B=0` that doomed the old producers — global extinction now needs *every* cell simultaneously at zero, which grazing-then-regrowth makes statistically near-impossible. Target half-recovery in ~30–60 ticks (fast enough to rebound, slow enough to allow a bust). Local grazing + spatial structure → **refugia** that desynchronize local cycles (a global synchronized collapse is what a well-mixed pool would risk).

**Consumer energy budget** (starting ratios; all live knobs — the relationships matter, not the numbers):

| Flow | Start | Sign |
|---|---|---|
| basal upkeep / tick | 0.5 | − |
| movement cost / tick (∝ speed²) | ≤1.0 | − |
| eat income / tick (capped by local B & max ingest) | ≤3.0 | + |
| reproduction threshold `E_repro` | 20 | gate |
| reproduction cost `c_repro` (to child + overhead) | 12 | − |
| birth energy `E_birth` | 10 | — |
| death threshold | 0 | — |

The arithmetic is the design (it's what the old sim got wrong): **fed** net ≈ `3 − 0.5 − 0.5 = +2/tick` → reaches `E_repro=20` from `E_birth=10` in ~5 feeding ticks, reproduces (→8, survives), climbs again — **reproduction is reliably reachable while fed**. **Unfed** net ≈ `−1/tick` → starves from 8 in ~8 ticks, from 20 in ~20 — **starvation is a real, frequent clock** (the old near-zero upkeep meant nothing ever starved → frozen populations). Quadratic movement cost makes blind fast search expensive → **sensing has economic value** (the hook that makes senses earn their keep under selection).

**Why it oscillates (endogenous boom-bust, not noise-faked).** It's a spatial consumer-producer loop (intrinsically Lotka-Volterra-like) with both old failure modes removed. Boom (food high → births outpace deaths) → overshoot (the income-to-`E_repro` gap is a flywheel; consumer momentum carries past sustainable density) → bust (food grazed out → starvation spike) → recovery (few grazers → logistic + diffusion restore food). **Lag** (regrowth + maturation) + **mandatory overshoot** (the repro-gap) + **refugia** (spatial desync) make it a *sustained limit cycle*, not the damped fixed point the old sim settled into. Amplitude levers if it damps: lower `r`/raise `K`, widen the repro gap, lower producer diffusion. (Resist adding noise — that's faking breathing.)

**Trophic structure.** Phase 1: producers + one consumer species (must survive+breed+evolve). Phase 2: predators = a second `species` whose ACT eat-target is nearby organisms instead of the food field — drops in with zero structural change (this is why eating is a generic "consume energy from target"). Diet can later be an evolvable gene so the trophic role *emerges*.

### 4.5 Senses (complementary by construction)

Designed for **informational orthogonality** along three axes — *what they track* / *directionality* / *timeliness* — so none is redundant:

| Sense | Mechanism | Unique info | Blind to |
|---|---|---|---|
| Smell | SCENT field gradient (heading-frame) | long-range, lagging direction to **standing biomass** | localizing a discrete entity; anything that just arrived |
| Sight | spatial-hash **cone query** + occlusion; fixed angular bins report nearest-entity distance + species | instantaneous **bearing+distance+identity of a specific creature** | outside the facing cone; range; occluded |
| Hearing | MOTION field (heading-frame) | omnidirectional, recent **fast-movement** detection, through occlusion / behind you | identity; precise bearing; anything not recently moving |

**Costed investment genes** (`g_smell/g_sight/g_hearing`): each maps to a sensitivity/range multiplier **and** a per-tick metabolic upkeep. A sense isn't free → in a niche where it gives no benefit, its upkeep is pure loss → selection removes it; where it helps, benefit > upkeep → selection keeps it. **The cost is the mechanism that makes complementarity show up in evolution, not just hand-tests.** Sensed values feed the NN scaled by the gene; NN input weights (also evolvable) decide how much to trust each.

**Founder simplex seeding.** Partition founders into cohorts across the sense-investment simplex (smell-heavy / sight-heavy / hearing-heavy / balanced / null-control) so every sense is *expressed and used* from tick 0 and selection has variance to amplify. (The old senses stayed silent partly because nothing was ever seeded using them.)

**Complementarity ablations (permanent regression tests).** Each sense has a niche where it is the *only* one that helps, and must show a survival delta *on top of the other two*:
- **Smell:** grazed-out foreground + a large *stationary* biomass patch beyond sight range (silent to hearing, invisible to sight) → only the long-range gradient leads there.
- **Sight:** a single discrete target in empty space requiring precise intercept (scent is a non-localizing blur; hearing is omnidirectional-rough) → only the cone gives exact bearing. (Works in Phase 1 via mate/food-item closing — sight earns its keep before predators exist.)
- **Hearing:** a fast, scentless mover behind/occluded (smell can't — not standing biomass; sight can't — out of cone) → only the motion field reveals it.

### 4.6 Observability & headless harness (Phase 0, grows every phase)

A fixed instrument shell, populated (never rebuilt) each phase: **control bar** (play/pause/step/reset, seed field, speed), **population time-series graph** (one series per quantity; extinction must read *loud*), **per-entity inspector** (id/energy/age, live brain I/O, genome, current sense inputs, lineage, plasticity-delta), **knob panel** (every tunable + **every ablation off-switch as a live toggle**), **field overlay** (heatmaps). The **headless harness** imports the *same sim core* and `DEMO_CONFIG`, emits the *same metrics the graph shows* + a golden state-hash; two standing jobs forever: determinism check + the ablation engine. The browser is a renderer/control surface bolted onto a headless deterministic core — never two code paths.

## 5. Determinism contract

Same seed + same `DEMO_CONFIG` ⇒ byte-identical run (golden state-hash, CI from Phase 0). Rules: one seeded PRNG, drawn only at birth/mutation; ascending-slot iteration everywhere; sorted spatial-hash buckets; fixed reduction order in dot products; two-phase births/deaths (compute on frozen state, then apply); no wall-clock / `Date.now` / `performance.now` in sim logic; `Float64` throughout (no Float32 mixing); ship our own polynomial `tanh` if cross-engine bit-identity is required (engine `Math.tanh` isn't guaranteed identical across platforms). No Web Workers in the sim core (rendering may be off-thread; it never feeds back).

## 6. Verification

- **Determinism:** golden state-hash test, extended each phase.
- **Ablation gates:** per-phase ON/OFF, ≥5 seeds, at ship scale, persisted as `gates/phaseN`, all re-run each phase. Byte-identical ⇒ inert ⇒ deleted.
- **Adaptation proof (Phase 5):** 3-arm — mutation+heredity beats heredity-off and mutation-off.
- **Learning proofs (Phase 6):** (A) intra-individual time-to-food drops with age — measured *within* individuals to dodge survivor-bias; (B) instinct-vs-learned gap closes across generations; (C) plasticity ON/OFF changes survival; plus a no-Lamarck-leak test (inherited = birth weights, not learned).
- **Ecology (Phase 8):** sustained boom-bust, amplitude above seed noise, ≥100k ticks, multi-seed, no extinction / not flat.
- **Stability (brain):** weight-norm telemetry asserts `max|w| < W_MAX` and `mean|w|` not monotonic.

## 7. Phasing

See the plan file for the full table. Order: 0 skeleton → 1 physics → 2 economy core **[STOP]** → 3 brain-drives-motion → 4 smell chemotaxis **[STOP]** → 5 genome+mutation **[STOP]** → 6 Baldwin learning **[STOP]** → 7 sight+hearing **[STOP]** → 8 predators/boom-bust **[STOP, v1]** → 9 optional multicellularity. Every phase: watchable, one new system, ablation-gated, small reviewable tasks, owner sign-off at STOPs.

## 8. Decisions (recommended, pending owner confirmation in review)

- **Repo/toolchain:** keep this repo, TS-strict + WebGL2 + Vite + Vitest + pnpm + Makefile, `docs/`, memory; archive the old engine to a branch/tag; build a fresh `src/` tree. (From-zero = rewrite the *sim*, not throw away working tooling.)
- **Body plan:** single-cell creatures first; multicellularity = optional Phase 9.
- **Scale:** one fixed moderate scale (≈1024², low-thousands pop). Demo = validated = tested.
