# A1 — Interoceptive brain inputs (the creature perceives its own body)

**Bucket A1 of the living-ecosystem roadmap** (`docs/superpowers/specs/2026-06-24-living-ecosystem-roadmap.md`).
Verified against `main` @ `6f27fca` (`BRAIN_GENES=146`). Source of truth for the gaps:
`docs/neural-network-interconnection-map.md` §E.1 (own-SIZE / own-DIET / local-CROWDING / fertility-under-foot —
"the brain is blind to its own body and density; none exist today").

## Goal

Today the brain's inputs are all *derived environmental gradients* (food/sight/wall/flow/scent/glow) plus three
interoceptive scalars computed from energy/age state (hunger/age/readiness). **No creature can perceive its own
body** — a small prey and a large predator with identical genomes-minus-SIZE steer identically. A1 adds four
interoceptive inputs so behavior can become *conditional on the body*: "flee harder because I'm small", "chase
because I'm a hunter", "settle because I'm sitting on plenty". This is pure SENSING — it adds **no new economy
term and no new selection pressure**; the genes it reads (SIZE, DIET) already exist, are already costed, and are
already under selection. It only gives evolution a new substrate (body-aware behavior).

## The four inputs

| Input | Source (file:line) | Normalization | Within-life plasticity |
|---|---|---|---|
| **own-SIZE** | `genes[sg+ScalarGene.SIZE]` — already in `steer()` scope (brain.ts:77,94) | `size / (2·cfg.cellRadius)` | **evolve-only (no eligibility)** |
| **own-DIET** | `genes[sg+ScalarGene.DIET]` — already in scope | already 0..1 | **evolve-only (no eligibility)** |
| **local-CROWDING** | NEW sense-time neighbor count, start-of-tick hash (world.ts:280) → `store.crowding[]` | `min(count / cfg.crowdSenseNorm, 1)` | learns (eligibility) |
| **fertility-under-foot** | `food.sampleAt(x,y)` (+sampleAt2/3 summed for multi-channel) in `senseFood` → `store.fertHere[]` | `min(value / cfg.foodMaxFertility, 1)` | learns (eligibility) |

Each feeds **both** the linear map and the hidden layer (roadmap-literal, uniform with every other sense). All
seed **0** in `FOUNDER_BRAIN` → additive / liveness-safe → the response evolves in from neutral.

### Why own-SIZE / own-DIET are evolve-only (load-bearing)

SIZE and DIET are **constant within a life** (genes don't change post-birth). A reward-modulated Hebbian
synapse on a constant input accumulates `pre·post` with constant `pre` → it behaves exactly like a learnable
bias, which is the positive-feedback motor-saturation runaway that `learn()` *explicitly excludes biases for*
(brain.ts:450, `TURN_BIAS/THRUST_BIAS/EAT_GATE_BIAS` skipped). The fix is simply to **not accumulate their
eligibility traces** in `steer()` — `learn()` then leaves their `learnedBrain` weight pinned at the genome
value (since `elig=0` → `dev = (learned−genome)·keep`, and `learned` starts at `genome`), making them
evolve-only with no special-case in `learn()`. This mirrors how the hidden-layer W1 input→hidden weights are
evolve-only. CROWDING and fertility-under-foot **vary** within a life (they change as the creature moves), so a
linear response is meaningful and they may safely learn — they get eligibility traces like sight/scent/glow.

## Layout (the gated-synapse template, on-by-default variant)

Every other always-on input block (eat-gate / age / readiness / glow) follows the **always-drawn,
forward-pass-gated** convention — NOT the draw-skip-gated convention (wall/flow/hunger/phero draw no RNG when
off). A1 follows the always-drawn convention per the 2026-06-23 feature-default-on policy: **no draw-skip
gymnastics, no golden-hash update** (the frozen golden hash is retired, world.test.ts:23).

- New linear synapses append **after** slot 44 (`READINESS_THRUST`), each input = `{*_TURN, *_THRUST}`. This
  leaves the draw-skip-gated wall/flow/hunger/phero ranges (slots 10–35) and their `seedGenome`/`mutateGenome`
  index checks (genome.ts:573–582, 611–620) **untouched** — they key off the `Brain.*` enum constants.
- New `HiddenInput` rows insert **before `BIAS`** (BIAS stays last). The W1 hidden block is all-zero in
  `FOUNDER_BRAIN` and addressed by name (`hidIn[HiddenInput.X]`), so the BIAS index shift is internal/harmless.
- Hand-edited each slice: the `Brain` enum, `NAMED_BRAIN_GENES`, the `HiddenInput` enum, `HIDDEN_INPUTS`, and the
  `FOUNDER_BRAIN` array (insert N zeros after the age/readiness entries — the hidden block auto-grows via
  `new Array(HIDDEN_INPUTS*HIDDEN_UNITS + …)`). Everything after `HIDDEN_W1` is a **derived constant** and
  recomputes itself.

### Per-slice layout math (`HIDDEN_UNITS=4`, `HIDDEN_OUTPUTS=3`)

| | NAMED_BRAIN_GENES | HIDDEN_INPUTS | HIDDEN_W1 | HIDDEN_W2 | GLOW_BIAS | BRAIN_GENES |
|---|---|---|---|---|---|---|
| baseline | 45 | 20 | 45 | 125 | 137 | 146 |
| **A1a** (+SIZE,DIET) | 49 | 22 | 49 | 137 | 149 | **158** |
| **A1b** (+CROWD) | 51 | 23 | 51 | 143 | 155 | **164** |
| **A1c** (+FERT) | 53 | 24 | 53 | 149 | 161 | **170** |

New `Brain` slots: A1a `SIZE_TURN=45, SIZE_THRUST=46, DIET_TURN=47, DIET_THRUST=48`; A1b `CROWD_TURN=49,
CROWD_THRUST=50`; A1c `FERT_TURN=51, FERT_THRUST=52`.
New `HiddenInput` slots (re-indexed each slice, BIAS pushed last): A1a `SIZE, DIET`; A1b `CROWD`; A1c `FERT`.

## Wiring (`steer()`, brain.ts)

The established hunger/age/readiness pattern, applied to the four inputs:

1. Compute the normalized value, **0 when `!cfg.bodySense`** (mirrors `aged`/`readiness` defaulting to 0).
   - `sizeN = bodySense ? size/(2·cfg.cellRadius) : 0` (clamp not required — bounded by gene clamp).
   - `dietN = bodySense ? diet : 0`.
   - `crowdN = bodySense ? min(store.crowding[i]/cfg.crowdSenseNorm, 1) : 0`.
   - `fertN  = bodySense ? min(store.fertHere[i]/cfg.foodMaxFertility, 1) : 0`.
2. Linear add, gated `if (bodySense)`: `turnRaw += w[SIZE_TURN]·sizeN + …` (4 inputs × turn/thrust).
3. Hidden layer (inside `if (hiddenLayer)`, **unconditional** write so the reused `hidIn[]` never carries a
   stale value across creatures): `hidIn[HiddenInput.SIZE]=sizeN; …; hidIn[HiddenInput.FERT]=fertN;`
   (each already 0 when `!bodySense` → contributes nothing to the hidden units either).
4. Eligibility (learn branch): **CROWD/FERT only**, gated `if (bodySense)`. SIZE/DIET get **no** elig.

When `bodySense` is off, every value is 0 → both the linear (gated) and hidden (×0) contributions vanish → the
world behaves as if the feature is absent (but the genome layout still includes the always-drawn weights).

## Sense-time plumbing (A1b, A1c)

- **`store.crowding: Float64Array`** + **`store.fertHere: Float64Array`** (transient, derived, NOT hashed — like
  `senseX`/`sightX`). Recomputed every tick before `steer()`.
- **CROWDING (A1b):** a new `senseCrowding(store, hash, cfg)` pass (or fold into `senseCreatures`, which already
  holds the start-of-tick hash, lines 189–330) counts live neighbors within `cfg.crowdSenseRange` of each
  creature via a fixed-radius hash scan — **independent of vision** (a blind creature still feels its crowd) and
  **independent of the dead lever-D `crowdingMortality` scan** in metabolize (economy.ts:272, post-MOVE hash,
  gated on a feature that's OFF). Integer count, RNG-free, ascending order → deterministic. Gated on `bodySense`
  (skip the scan when off, leave `crowding[]` 0).
- **fertility-under-foot (A1c):** computed in `senseFood` (it already has the food field + iterates creatures).
  `fertHere[i] = food.sampleAt(x,y)` for 1 channel; `+sampleAt2(+sampleAt3)` summed for 2/3 channels (total
  local biomass). This is distinct from the food *gradient* (`senseX/Y`): the gradient is ~0 at a pocket's peak
  where fertility-under-foot is HIGH — so it tells the creature "I'm sitting on plenty" vs "I'm in a desert".

## Config

One umbrella flag `cfg.bodySense: boolean` (default **true** — on-by-default policy), the A1 ablation toggle.
Per-input isolation is done in the headless probe (correlate one input with behavior), not via four flags —
keeps the config lean and matches "the four are one interoceptive bundle introduced together". New norm knobs:
`crowdSenseRange` (default ~`6·cellRadius` ≈ 36u, a tunable larger-than-repulsion radius), `crowdSenseNorm`
(default ~8, neighbors→1 saturation). `foodMaxFertility` already exists (config.ts:69) — reuse it for fert norm.

## Determinism & tests (per slice)

No golden hash (retired). The determinism invariant is run-twice-same-hash (world.test.ts first test), which
holds automatically. Per slice add:

1. **Ablation (wired, not dead config):** `bodySense:false` vs `bodySense:true` at the same seed → **different**
   hash after N ticks. NB this is the *always-drawn* pattern: the two share an **identical seeded genome** (the
   weights draw regardless of the flag), so the divergence proves the forward pass is live — it is NOT the
   `off===baseline` byte-identity test the draw-skip features use.
2. **Determinism:** the same `bodySense:true` config run twice → identical hash.
3. **Liveness:** `src/headless/liveness-probe.ts` (demo config, 3 seeds, ≥4000 ticks) → no extinction; report
   pop + FORAGE_PREF/DIET mean/std.
4. **Inspector parity:** `computeBrainState` (brain-view.ts:62) extended to (a) push input nodes for the active
   inputs **iff `cfg.bodySense`** (mirroring the hunger/age/readiness nodes, lines 177–201), and (b) include
   `sizeN..fertN` (0 when off) in the `hin[]` array (line 222) in the new `HiddenInput` order. A dedicated
   parity test pins `computeBrainState.turnRaw/thrustRaw/eatGate` to an actual `steer()` run with
   **NON-saturated** weights (the brain-consolidation lesson: saturation clamps both paths to maxTurn and hides
   a missing term).

## Measure honestly (the highest-value output)

After each slice, a multi-seed `--demo` headless probe that **shows the behavior shift or its absence with
numbers** (extend, don't reinvent — likely a new `src/headless/intero-probe.ts`):

- **own-SIZE:** bin live creatures by SIZE; report mean |turn| / forward-thrust per bin. Hypothesis: small
  bodies flee more (higher turn variance / reverse thrust near threats), large bodies hold ground. Report the
  size→motor correlation, or its absence.
- **own-DIET:** does chase-vs-flee become learnable/divergent by diet (predators steer differently toward sight
  than grazers, beyond what the existing appeal-sign already gives)?
- **local-CROWDING:** **the honest-risk input.** Report the mean neighbor count at `crowdSenseRange` across the
  live population at demo scale. If it's ~0 (the density wall — NND ~62–75u ≫ range; the crowding-probe already
  found this for `crowdRadius=12`), **say so plainly** (file:line) — it's correct machinery that's inert at this
  scale, not a win. It activates if Bucket B's food retune concentrates prey, or at a smaller world.
- **fertility-under-foot:** report the spread of `fertHere` across the population (pocket-dwellers high vs
  dead-water crossers low) and whether settle/leave behavior correlates with it.

"Built but inert" is a failure, not a win — report it as such.

## Slicing (owner-approved: 3 sub-slices)

- **A1a — own-SIZE + own-DIET.** Zero new plumbing (read genes already in `steer()` scope). Exercises the full
  layout-growth + steer + inspector-parity + ablation + liveness pattern with the lowest-risk sense source.
  Guaranteed-live (genes are always nonzero). Proves the machinery the next two reuse.
- **A1b — local-CROWDING.** Adds `store.crowding[]` + the `senseCrowding` pass. The at-risk input — measure +
  report honestly whether it registers at 8192².
- **A1c — fertility-under-foot.** Adds `store.fertHere[]` + the `senseFood` write. Guaranteed-live in pockets.

Each is one implement→independent-review→measure→merge-to-main cycle (fresh implementer + independent reviewer
subagents; never self-validate). Update the roadmap checkbox per slice.

## Out of scope

Bite/breed/scent-deposit OUTPUT gates (A2), the food-field retune (Bucket B), `hungerSense` flip (separate
trivial gap), DISPLAY/PREFERENCE visibility (Bucket C). A1 is inputs only.
