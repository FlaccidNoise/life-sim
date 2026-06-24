# Neural-Network Interconnection Map

**Date:** 2026-06-23 · **Branch:** `main` (`1b10478`)
Audit of every sim feature / gene / world-field vs the creature brain — what's already wired, what's
built-but-unmerged, and what exists but the brain can't yet sense or control. Built from a 3-agent
read-only survey (current NN I/O, unwired features in main, features in other branches).

## The brain today (on main)

A **single linear layer**: sensors → 2 motor outputs. `BRAIN_GENES = 36` synapses, all live, none dead
(`genome.ts:332`, `brain.ts steer`). Two weight sets per creature: heritable `brain` (instinct) +
runtime `learnedBrain` (within-life Baldwin plasticity via eligibility trace × Δenergy reward).

**Inputs (all heading-frame fwd/lat unless noted):**

| Input | Source | Synapses | Gate | Seed |
|---|---|---|---|---|
| Food gradient ∇biomass | `senseX/Y` | LAT/FWD_TURN, LAT/FWD_THRUST (0–3) | always | non-zero |
| Sight vector (appeal-signed: prey/threat/shelter/cohesion/parcels) | `sightX/Y` | SIGHT_* (6–9) | vision genes | non-zero |
| Wall proximity | `wallSenseX/Y` | WALL_* (10–13) | `wallRegionCount>0` | 0 |
| Flow / current | `flowSenseX/Y` | FLOW_* (14–17) | `flowStrength>0` | 0 |
| Hunger (1−energy/satiated) scalar | inline | HUNGER_TURN/THRUST (18–19) | `hungerSense` (**off by default**) | 0 |
| **Scent ∇P × 4 channels** (prey/pred/kin-cos/kin-sin) | `scentSenseX/Y` | PHERO_C0..C3_* (20–35) | `pheromoneEnabled` | 0 |
| Bias (constant 1) | — | TURN_BIAS/THRUST_BIAS (4–5) | always | non-zero |

**Outputs:** exactly two — **turn** and **thrust** (`brain.ts`). Everything else a creature does
(eating, biting, breeding, scent deposit) is **involuntary** — fired by rule, not decided by the brain.

---

## 1. Built but UNMERGED — ready to wire in (highest leverage)

### `feat/living-world` — a complete NN expansion sitting on a branch
This is the "upcoming NN change" the scent work was designed to dovetail with. It is **done**, on-by-default,
determinism-clean, just not merged. Commits: `3a27370` (eat-gate), `b5d62c9` (age), `7bbd180` (readiness),
**`8dfe9d2` (hidden layer)**.

- **NEW OUTPUT — `EAT_GATE`** (5 synapses): a learned 0–1 grazing throttle that also penalizes thrust
  (eat-slow vs flee-fast tradeoff). The first non-locomotor motor output. (`brainGatedEating`, `eatMovePenalty`)
- **NEW INPUT — `AGE`** (interoceptive): `min(age/ageNorm,1)` → 2 synapses. The brain senses its own maturity.
- **NEW INPUT — `READINESS`** (interoceptive): clamped breeding-band fill → 2 synapses.
- **NEW TOPOLOGY — hidden layer** (`8dfe9d2`): a nonlinear conditional-logic substrate (sim + inspector parity).
  This converts the brain from linear to a real MLP.

⚠️ **Layout reconciliation needed.** living-world built on the *old* 24-gene base (with single-channel phero);
main replaced that with the 16-synapse scent block (36 total). Merging them means a combined input set of
≈ **45 synapses** (20 base + 16 scent + 5 eat-gate + 2 age + 2 readiness) **feeding the hidden layer**, not the
old 4-phero layout. Recommend: land living-world's NN expansion, re-home the scent block into it, route all
inputs through the hidden layer. This is the single biggest interconnection task.

### `feat/sexual-reproduction` — two brain seams deliberately stubbed
Asexual today; this branch adds two-parent crossover + a `geneticDistance` mate gate. Commits `f8a98e9`…`c3f3291`.
- **NEW GENES** `DISPLAY` / `PREFERENCE` (sexual-selection ornament + mate preference). Currently sight-based.
- **Stubbed seam — `crossoverBrain()`**: clones+mutates the mother's brain only. Should become real per-weight
  brain crossover (mirror `crossoverScalarGenes`), against the **expanded hidden-layer layout** (merge order:
  living-world first).
- **Stubbed seam — `brainDistance()`**: returns 0. Wire to a per-weight L2 so *behavioral* divergence (not just
  diet) feeds the speciation gate → brains, not just bodies, define species.
- **Opportunity:** route mate-pursuit through the NN as a learned output instead of a hardcoded sight pull.

### `worktree-creature-visuals` — no NN wiring (render-only)
Gene-driven eyes/maw/antennae/fins/vision-cone overlays. Reads existing genes for visuals; touches no
`src/core/*`. Listed for completeness — nothing to wire.

---

## 2. Exists in main, NOT wired — opportunities

### Missing INPUTS (the brain is blind to its own state)
| Signal | Exists at | Why wire it | Effort |
|---|---|---|---|
| **Own age / life-stage** | `age` (metabolize), MATURITY/SENESCENCE genes | ontogenetic behavior (juveniles hide, elders gamble) — the payoff for the already-shipped `ageStages`. *(living-world's AGE input already does this — merge it.)* | S |
| **Own size** | `SIZE` gene | one genome → "small fast fleer" vs "big slow tank" behaviorally | S |
| **Own diet** | `DIET` gene | one brain switches graze-seeking vs hunt-seeking by its own role | S |
| **Local crowding / density** | hash scan in `metabolize:261` (only when `crowdingMortality>0`) | flee-the-mob / seek-company; scan already exists | M |
| **Fertility under foot** | `metabolize:255` | sense dead water before paying `deadWaterCost` | S |
| **Hunger** | `HUNGER_*` synapses | already wired but **off by default** — flip `hungerSense` on | trivial |

Pattern for all: copy the `hungerSense` gated-synapse template (gene block + seed/mutate gate + sense write +
2 weights + eligibility). Determinism-clean by construction.

### Missing OUTPUTS (involuntary actions → evolved decisions)
| Action | Today | Wire as | Effort |
|---|---|---|---|
| **Bite/attack** | auto-bites nearest edible in range (`hunt:60`) | brain-gated attack output (uses existing `DAMAGE`) — predation becomes a decision | M |
| **Scent deposit** | constant every tick (`depositScent:148`) | brain-controlled `PHERO_DEPOSIT` strength → a real comms channel (signal when fed/threatened) | M |
| **Breed** | auto-fires when full + cooldown clear (`reproduce:365`) | brain-gated breed decision (defer when threatened) | M–L |
| **Eat** | auto-grazes current cell | the `EAT_GATE` output — *already built on living-world* | (merge) |

---

## 3. Already wired (no action) / not-applicable
- **Wired inputs:** food field + channels, walls, flow, scent (4ch), parcels, sight (folds in shelter +
  cohesion + drift), hunger (when on).
- **Perception-shaping genes (correctly NOT inputs):** SENSE_RANGE(_B/_C), VISION_RANGE/FOV/ACUITY,
  FORAGE_PREF(_C) — they shape inputs, they aren't inputs.
- **Body-limit genes (correctly passive):** MAX_SPEED, MAX_TURN/THRUST, METAB_EFF, BIRTH_ENERGY, repro bars.
- **Render-only, no sim/NN role:** bioluminescence/glow (`renderer.setGlow`, 'g' key), creature-visuals branch.
- **Don't exist in main:** sexual reproduction (branch only), glow as a *field* (it's pure render).

---

## Recommended sequence
1. **Merge `feat/living-world`'s NN expansion** (hidden layer + age/readiness inputs + eat-gate output),
   reconciling the scent 16-synapse block into the hidden-layer input set (≈45 inputs). This is the spine.
2. **Add the cheap interoceptive inputs** that aren't in living-world: own-size, own-diet, fertility,
   crowding (age is covered by living-world). All follow the `hungerSense` template.
3. **Promote involuntary actions to outputs:** brain-gated bite + brain-controlled scent deposit (then breed).
4. **Build the `feat/sexual-reproduction` brain seams** (`crossoverBrain`, `brainDistance`) against the
   expanded layout → behavioral speciation.
5. Flip `hungerSense` on in the demo (free interoception that's already wired but dormant).
