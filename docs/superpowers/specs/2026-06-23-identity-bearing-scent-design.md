# Identity-Bearing Scent — Design Spec

**Date:** 2026-06-23
**Bead:** life-sim-zaz2
**Status:** approved design, pre-implementation
**Branch:** `feat/scent-signatures` (off `main` @ 48b1f31)

## Problem

The pheromone system is ONE global, identity-less scalar field (`PheroField`): every creature
deposits into the same grid, so the chemical signal carries no role or genetic information. The owner
wants **identity-bearing scent** — "each creature leaves its own trail that indicates its genetic
makeup" — so trophic/genetic info rides the signal and behavior emerges from it: predators evolve to
**follow prey scent**, prey evolve to **flee predator scent**, kin/species scent → **clustering**.

A literal field-per-creature is infeasible (thousands of creatures × a grid-sized float field each).
The resolution: a **low-dimensional scent signature** — a small FIXED number of channels each creature
deposits into, weighted by its genes/role, sensed via evolvable per-channel brain weights. This yields
the same emergent behavior at fixed cost. **Ceiling: N small & fixed, NOT per-creature.**

## Decision: N = 4 channels (hybrid role + signature)

Written N-generic (`SCENT_CHANNELS` constant), defaulting to 4:

| ch | name    | deposit weight            | who deposits loudly | sensed → emergent behavior                          |
|----|---------|---------------------------|---------------------|-----------------------------------------------------|
| 0  | PREY    | `1 − diet`                | grazers (low diet)  | predators evolve +climb → **follow prey**           |
| 1  | PRED    | `diet`                    | hunters (high diet) | prey evolve −descend → **flee predators**           |
| 2  | SIG_COS | `0.5 + 0.5·cos(2π·hue)`   | hue-keyed           | lineage climbs its own hue-mix → **kin clustering** |
| 3  | SIG_SIN | `0.5 + 0.5·sin(2π·hue)`   | hue-keyed           | with ch2, a 2-D hue compass for species recognition |

- Role channels reuse the existing `ScalarGene.DIET` (genome.ts:49, 0=grazer…1=hunter).
- Signature channels reuse the existing per-creature `hue` (Float32Array, [0,1), mutates each birth).
- The `0.5 + 0.5·cos/sin` form keeps signature deposits non-negative (a field is a concentration), so
  two lineages 180° apart in hue still both deposit positively but into opposite channel *mixes* —
  the gradient direction, not the sign, distinguishes them.
- **Zero new scalar genes.** The deposit *is* a deterministic projection of the creature's genetic
  makeup (diet + hue). Kin/species recognition emerges at the **lineage** level: a lineage coevolves
  sense-weights that climb the channels its own hue projects onto (a fixed linear brain can't do
  per-individual self-matching, but it can specialize to its niche's hue — which is what clustering needs).

### Why not the alternatives
- **Role-only (2 ch):** proven M7.5 mechanism, but no kin recognition — the owner explicitly wants
  species clustering, so role-only is incomplete.
- **Signature-only (2–3 ch):** kin clustering but no clean trophic follow/flee (diet not in the signal).
- **Hybrid (4 ch):** both, within the feasibility ceiling. Chosen.

## Deposit rule — passive per-tick (owner-confirmed)

Every live creature deposits its full 4-channel signature **each tick** (not on-graze):

```
amount = scalarGenes[i·SCALAR_GENE_COUNT + PHERO_DEPOSIT] × cfg.pheroDepositStrength
ch0 += amount · (1 − diet)
ch1 += amount · diet
ch2 += amount · (0.5 + 0.5·cos(2π·hue))
ch3 += amount · (0.5 + 0.5·sin(2π·hue))
```

**Why per-tick, not on-graze:** the current deposit fires only in `economy.metabolize` when a creature
grazes. Pure hunters (diet≈1) gain energy via `economy.hunt`, not graze, so they would almost never
deposit PRED-scent — and prey could never learn to flee a signal that isn't there. Per-tick deposit
guarantees both grazers and predators lay continuous trails ("each creature leaves its own trail").

**Tradeoff / emergent tension:** loudness is the costed `PHERO_DEPOSIT` gene (upkeep via existing
`pheroDepositCost`). Louder = more visible to predators (selection ↓ for prey = stealth) BUT louder
also = stronger kin-cluster signal (selection ↑). Competing pressures are intentional and worth watching.

- RNG-free, ascending live-slot order (the existing metabolize/hunt loops are RNG-free; the per-tick
  deposit is a new pass in the same discipline).
- The old on-graze (`pheroDepositOnGraze`) and alarm-on-bite (`pheroAlarmStrength`) deposit paths are
  **removed** — superseded by the passive model. (`pheroGrazeStrength` retired; `pheroDepositStrength`
  added.)

## Field structure — `ScentField` wrapping N × `PheroField`

Compose, don't rewrite. `src/core/scent-field.ts` exports `ScentField` holding `SCENT_CHANNELS`
`PheroField` instances and exposing:

- `deposit(x, y, diet, hue, amount)` — split `amount` across channels per the table (RNG-free).
- `stepAll(diffuse, decay, blocked)` — step each channel (shared diffuse/decay for V1).
- `gradientsInto(x, y, step, outGx, outGy, base)` — write the N per-channel gradients into flat buffers.
- `reset()`, `hashInto(h)` (hash all channels in channel order), `fillTexture(ch, out)`.

This reuses `PheroField`'s proven toroidal double-buffered diffusion, multiplicative decay,
central-difference gradient, wall no-flux damming, and deterministic hash **verbatim** — no
re-derivation of the field math. `SCENT_CHANNELS` lives in `scent-field.ts`.

Per-channel diffuse/decay is deferred (shared knobs for V1); splitting is a later config change.

## Sense + brain

- `OrganismStore` gains `scentSenseX`, `scentSenseY` — `Float32Array(capacity · SCENT_CHANNELS)`
  (replacing the scalar `pheroSenseX/Y`). Index `i·SCENT_CHANNELS + c`.
- `sense.senseEnv` (sense.ts:149) computes all N channel gradients at the creature's `SENSE_RANGE`
  step when the field is allocated; writes 0 across all channels when off.
- `brain.steer` projects each channel's gradient into the heading frame (fwd, lat) and wires **4
  synapses per channel** (lat-turn, fwd-turn, lat-thrust, fwd-thrust) = **16 phero synapses**,
  replacing the current 4. Same eligibility-trace treatment for learning.

### Brain gene layout (genome.ts)
- `Brain.PHERO_*` (indices 20–23, 4 synapses) → a 16-synapse block `PHERO_CH0_LAT_TURN … PHERO_CH3_FWD_THRUST`
  (indices 20–35).
- `BRAIN_GENES` 24 → 36. `FOUNDER_BRAIN` gains 12 more trailing zeros (16 phero zeros total) — seeded
  0 so evolution picks each channel's sign.
- Gating unchanged in spirit: the whole phero block is gated by `pheroSenseGenes` (= `pheromoneEnabled`)
  in `seedGenome`/`mutateGenome` (the `isPhero` range widens to 20–35).

### NN-expansion coordination
The 8 channel gradients (4 ch × fwd/lat) form a clean **appended input block**. The upcoming NN
hidden-layer expansion (separate session) consumes them as inputs; nothing here hard-wires the inputs
to the current 4-synapse linear form in a way the topology change breaks. Both sessions touch
`brain.ts`/`genome.ts` — merge coordination noted; this branch keeps the linear wiring, just wider.

## Toggle + guardrails (on-by-default policy)

Per `feature-default-on-policy.md`: new features ship ON; determinism is the only invariant; keep a
toggle for ablation; add same-`(config,seed)`→same-hash + a liveness guardrail. No
byte-identical-when-off test, no RNG-draw-skip gymnastics.

- **Master** `pheromoneEnabled` (existing, ON in demo) — allocates `ScentField`; null = OFF path.
- **New ablation flag** `scentIdentity` (default `true`): `true` → identity split (table above);
  `false` → each creature deposits `amount` equally into all 4 channels (field alive + diffusing but
  information-free → identical gradients across channels → no follow/flee/cluster can emerge). Same
  cost, gene layout, and determinism machinery — isolates the *information* the feature adds, for
  clean measurement.
- **Config:** add `pheroDepositStrength` (per-tick deposit scale), `scentIdentity`. Remove
  `pheroGrazeStrength`, `pheroDepositOnGraze`, `pheroAlarmStrength`. Keep `pheroDeposit`,
  `pheroDepositCost`, `pheroDiffuse`, `pheroDecay`. Demo (`main.ts`): `pheromoneEnabled: true`,
  `scentIdentity: true`.

## Determinism, cost, newborn signature

- **Determinism:** deposit split (diet, cos/sin hue) is pure arithmetic; diffuse/decay/gradient/hash
  are the existing RNG-free field ops × N. RNG is still drawn ONLY at reproduction. New test:
  same `(config, seed)` → identical hash run-to-run with scent on.
- **Cost (demo scale, 128² grid):** step = 4 × (diffuse+decay) ≈ 4 × 2 × 16 384 ≈ 131 k float ops/tick.
  Deposit = O(live) × 4 writes/tick. Sense = O(live) × 4 gradient reads (4 samples each). All cheap;
  the single-channel version already does this at 1×.
- **Newborn signature:** a pure function of inherited `hue` (set in `mutateGenome`) and `DIET` gene —
  both already deterministic at birth. No extra allocation, no RNG.

## Rendering

`fillTexture(ch, out)` per channel. V1: the existing `FoodLayer.PHEROMONE` overlay ('f' cycle,
main.ts:153) points at channel 0 (PREY) so the field stays visible. Richer multi-channel viz
(role = PREY−PRED, hue = ch2/ch3 → color) is a follow-up, not V1 scope.

## Liveness guardrail

Headless test: run the demo config with scent on for N ticks (e.g. 2000), assert the world stays
alive and non-degenerate (population > floor, births occur, not collapsed to a single creature/extinct).
On-by-default must not silently ship a dead world.

## Measurement (success criteria)

Via `src/headless/life-history.ts --demo` (multi-seed, per-creature + gene drift):

1. **Follow-prey / flee-predator:** the PREY-channel forward-thrust synapse correlates **positive**
   with `diet` (predators climb prey-scent) and the PRED-channel forward-thrust synapse correlates
   **negative** with `diet` for low-diet creatures (prey descend predator-scent). I.e. the relevant
   PHERO synapse signs **diverge by diet**.
2. **Kin/species clustering:** within a lineage, signature-channel sense-weights are more similar than
   between lineages; spatially, same-hue creatures co-locate more than under `scentIdentity:false`.
3. **Liveness:** world alive at N ticks.

Report each with file:line evidence, multi-seed.

## Build increments (tiny, individually reviewable)

1. `scent-field.ts` (`ScentField` + `SCENT_CHANNELS`) + unit tests: deposit split, identity-blind
   fallback, step, gradient, hash determinism. (TDD — failing test first.)
2. Wire into the sim: store buffers, `senseEnv`, `brain.steer` 16 synapses, `genome.ts` layout
   (`BRAIN_GENES` 36, founder), `world.ts` allocation/step/hash, `economy.ts` per-tick deposit pass
   (remove on-graze/alarm). Determinism + liveness tests.
3. Config/demo wiring (`config.ts` knobs, `main.ts`, `life-history` DEMO_OVERRIDES), render overlay
   to channel 0, `scentIdentity` ablation path.
4. Measure (life-history `--demo`) + report with file:line.

## Out of scope (YAGNI)

- Per-channel diffuse/decay knobs (shared for V1).
- Multi-channel render compositing (channel 0 only for V1).
- Genome-projected signature beyond hue (hue is the genetic-makeup scalar for V1).
- Deposit-on-energy-gain model (rejected: leaves predators scent-less).

---

## Findings (measured 2026-06-23, `scent-probe.ts` 6000 ticks × 4 seeds, demo config)

Raw: grazer preyFwd −0.193 / predFwd +0.040; predator preyFwd −0.307 / predFwd −0.135 (n: 25800 grazer, 737 predator). Kin NN hue-dist ON 0.130 vs global 0.212; OFF (identity-blind) NN 0.158. Mean live(ON) 6845.

1. **Liveness — PASS.** World thrives across all 4 seeds. Identity-blind sometimes carries more (the scent/dispersal response costs some local foraging efficiency).
2. **Scent is used + diverges by diet — the mechanism works.** Synapses evolved strongly off the 0 seed (−0.19…−0.31) and differ by diet bin → identity info rides the signal and shapes behavior, deterministically (`brain.ts` channel loop; `genome.ts` Brain.PHERO_C0..C3).
3. **Follow-prey/flee-predator — NOT as framed.** The dominant emergent response is **crowd-aversion** on the majority (grazer) PREY channel — everyone descends it (predators most), i.e. disperse from same-type crowds, not hunt. Root cause: the PREY channel is dominated by grazer self-density (near-uniform for a predator swimming in prey → no useful gradient TOWARD prey), and the PRED channel is faint because predators are only ~2.7% of the population. This is the pre-existing **predation-encounter ceiling** (memory `predation-engine-ceiling`: predEncounter never >0.06, founding-gated), NOT a scent-mechanism fault.
4. **Kin clustering — PRESENT, scent-enhanced.** Identity scent tightens spatial hue co-location ~17% beyond birth-locality (NN 0.130 ON vs 0.158 identity-blind control). The clearest positive result.

**Verdict:** the identity-bearing scent is correctly built, deterministic, ON-by-default, alive, and demonstrably drives diet-divergent behavior + kin clustering. The literal follow/flee headline is gated by the independent predation-encounter ceiling, not by this feature. **Follow-up (separate concern):** to get predator-follows-prey, the predation economy needs more predator contact/founding (see `predation-engine-ceiling`) and/or a prey channel that encodes a *gradient toward sparse prey* rather than grazer crowd-density — a scent-tuning + economy question, not a build defect.
