# A2 — Brain-gated OUTPUTS (reflex → decision)

**Bucket A2 of the living-ecosystem roadmap** (`docs/superpowers/specs/2026-06-24-living-ecosystem-roadmap.md`).
Verified against `main` @ `fadc7cb` (post-A1, `BRAIN_GENES=170`, `HIDDEN_OUTPUTS=3`). Source of truth for the
gaps: `docs/neural-network-interconnection-map.md` §D ("BITE, BREED, SCENT-DEPOSIT are pure reflexes — the
hidden layer emits only {turn, thrust, eatGate}").

## Goal

Three consequential actions are pure reflexes today: predators **auto-bite** the nearest edible target every
tick (`hunt()`), creatures **passively deposit scent** every tick (`depositScent`), and they **breed** on a
pure energy threshold (`reproduce()`). A2 promotes each to a **hidden-layer OUTPUT** — a `sigmoid` decision
read from the integrated "mood" layer (the glow-head pattern) — so the brain *decides* whether to bite, signal,
and breed. This is the lever Bucket B needs (bite-as-decision + concentrated prey → predators that choose AND
contact), and it closes mandate-1's action-decision gaps.

Each new output is **seeded gate-OPEN** (high bias → sigmoid ≈ 1) so founding behavior ≈ today's reflex and
evolution can only *subtract* the action where withholding pays. Each is behind its own `cfg` flag (on-by-
default policy); the OFF path multiplies by ×1 / skips the gate → byte-identical to the pre-A2 reflex.

## The three outputs

| Output | Hook (economy.ts) | Mechanic | Plasticity | Stakes |
|---|---|---|---|---|
| **BITE_GATE** (A2a) | the drain at `hunt()` ~:112-118 | `drain *= biteGate[i]` (gate 0 = hold, 1 = full bite) | **LEARNS** (clean energy reward) | HIGH |
| **SCENT_GATE** (A2b) | `depositScent` :151 | `amount *= scentGate[i]` (broadcast vs silent) | evolve-only | LOW |
| **BREED_GATE** (A2c) | `reproduce()` — after viability/satiated, before rng/spawn | skip breeding when `breedGate[i] < breedGateThreshold` | evolve-only | MED |

### Why bite LEARNS but scent/breed are evolve-only (owner-decided)

- **BITE_GATE learns** (its hidden→output W2 column gets eligibility, like the eat-gate): biting has a clean
  energy reward (a kill nets `drain·predationGain`), so reward-modulated Hebbian correctly reinforces biting
  when it pays and weakens it when it doesn't — genuine within-life refinement.
- **BREED_GATE is evolve-only** (no eligibility): breeding *costs* energy, so reward-Hebbian on energy-Δ would
  push the gate DOWN (unlearn-to-breed pathology) — exactly wrong. The gate must evolve, not learn.
- **SCENT_GATE is evolve-only** (no eligibility): scent deposit has no direct energy consequence, so the
  reward signal is noise. Mirrors the glow head (an evolve-only hidden-layer output).

## Output mechanics (steer(), brain.ts)

Each gate mirrors the existing eat-gate/glow heads, computed in the hidden-layer block:

```
biteGateRaw = BITE_GATE_BIAS + Σ_j hAct[j]·W2[j][biteCol]      // (when hiddenLayer; bias-only when off)
biteGate[i] = sigmoid(biteGateRaw)                              // 0..1, stored for hunt() to read
```

- Each gate reads the hidden layer's `hAct` via a **new W2 output column** (`HIDDEN_OUTPUTS` grows by 1 per
  slice) + a **named bias gene** (seeded gate-open). The bias is excluded from learning (like `EAT_GATE_BIAS`/
  `GLOW_BIAS`/`TURN_BIAS` in `learn()`). When `hiddenLayer` is off, the gate is `sigmoid(bias)` (≈ open).
- The gate output is stored in a new transient store buffer (`store.biteGate/scentGate/breedGate`, Float64,
  NOT hashed — like `eatGate`/`glow`), defaulting to 1 (gate-open) on alloc so a pre-steer read is safe.
- **BITE eligibility (A2a only):** add the bite W2 column to the existing hidden→output eligibility loop
  (`elig[w2 + j*HIDDEN_OUTPUTS + biteCol] += hAct[j]·biteGateRaw`), so it learns. SCENT/BREED add NO eligibility.
- All gates computed only when their `cfg` flag is on (else the gate stays at its default 1 / the actuator skips
  it) — mirrors the `brainGatedEating`/`moodGlow` gating.

## Per-slice layout math (the always-drawn template; `HIDDEN_UNITS=4`)

Each slice appends ONE named bias gene (shifting `HIDDEN_W1`) and grows `HIDDEN_OUTPUTS` by 1 (growing the W2
block by `HIDDEN_UNITS`). All offsets after `HIDDEN_W1` are derived. **NB the W2 STRIDE changes** when
`HIDDEN_OUTPUTS` grows (`W2[j*HIDDEN_OUTPUTS + o]`) — the founder seeds the whole W2 block 0 + noise, and the
indexing is derived, so the existing turn/thrust/eatGate columns relocate correctly. This is the one new
wrinkle vs A1 (which grew W1 inputs, not W2 outputs).

| | new named bias | NAMED_BRAIN_GENES | HIDDEN_OUTPUTS | HIDDEN_W1 | HIDDEN_W2 | GLOW_BIAS | BRAIN_GENES |
|---|---|---|---|---|---|---|---|
| post-A1 (baseline) | — | 53 | 3 | 53 | 149 | 161 | 170 |
| **A2a** +BITE_GATE_BIAS | 53 | 54 | 4 | 54 | 150 | 166 | **175** |
| **A2b** +SCENT_GATE_BIAS | 54 | 55 | 5 | 55 | 151 | 171 | **180** |
| **A2c** +BREED_GATE_BIAS | 55 | 56 | 6 | 56 | 152 | 176 | **185** |

(`HIDDEN_W2 = HIDDEN_W1 + HIDDEN_INPUTS·HIDDEN_UNITS`; the W1 block is constant 96 since `HIDDEN_INPUTS=24`
is unchanged in A2, so W2 shifts only +1/slice from the named bias. The output growth grows the W2 BLOCK
(`HIDDEN_UNITS·HIDDEN_OUTPUTS`), pushing `GLOW_BIAS` onward. `BRAIN_GENES = GLOW_BIAS + 9` [GLOW_BIAS 1 +
GLOW_HID 4 + GLOW_SENSE 4]. These are DERIVED — the genome.test layout-lock pins them; do not hand-compute in
code.)

New W2 output-column indices: A2a `biteGate = 3`; A2b `scentGate = 4`; A2c `breedGate = 5` (turn=0, thrust=1,
eatGate=2 unchanged). The named bias gene seeds gate-open (e.g. `bias = 4` → sigmoid(4) ≈ 0.98, like
`EAT_GATE_BIAS`); FOUNDER_BRAIN inserts it after the prior named tail, before the hidden block.

## Actuator wiring (per slice)

- **A2a BITE:** `hunt()` reads `store.biteGate[i]` (steer ran this tick before hunt). Gate the drain:
  `drain *= biteGate[i]` behind `cfg.brainGatedBiting` (OFF → ×1, byte-identical). Seed bite-open → founding
  predation unchanged. (The drain cap on prey energy + the counterBite still apply on the gated drain.)
- **A2b SCENT:** `depositScent` multiplies `amount *= scentGate[i]` behind `cfg.brainGatedScent` (OFF → ×1).
- **A2c BREED:** in `reproduce()`, AFTER the maturity/cooldown/viability/satiated checks and BEFORE
  `spawnChildSlot`/any rng draw, add `if (cfg.brainGatedBreeding && store.breedGate[p] < cfg.breedGateThreshold)
  continue;` (mirrors the cooldown-skip — consumes no rng → determinism stream preserved). `breedGateThreshold`
  default 0.5. Seed breed-open → breeds by default.

## Determinism & tests (per slice)

NO golden hash (retired). Always-drawn (the bias gene + W2 column draw regardless of the flag → toggling the
flag does not change the RNG stream). Per slice:

1. **Ablation:** `flag:false !== flag:true` at the same seed (forward pass / actuator is live). For BITE/SCENT
   the OFF path is ×1; with the gate seeded open, ON ≈ OFF early but diverges as the gate evolves — so the
   ablation test sets a NON-open gate (or runs long enough) to force divergence, OR asserts the actuator reads
   the gate via a targeted unit test (set biteGate=0 → no drain). Prefer the unit test for a crisp signal.
2. **Determinism:** same `(config, seed)` run twice → identical hash (incl. the flag on).
3. **Liveness:** `liveness-probe.ts` (demo, 3 seeds) → no extinction. **BREED especially** — a breed gate that
   evolves shut could crash the population; the liveness guardrail is the safety net (seed breed-open mitigates).
4. **Inspector parity:** `computeBrainState` (brain-view.ts) must render the new output node AND include its
   W2 column in the parity math — the steer-output + inspector coupling lands in ONE task (the A1 lesson). Use
   NON-saturated weights. The inspector currently draws 4 outputs (turn/thrust/eat/glow); A2 adds bite/scent/
   breed nodes (up to 7) — extend `drawOut`/`outY`.

## Measure honestly (the highest-value output)

- **A2a BITE — the load-bearing measurement:** run the predation probe (find it under `src/headless/`) at the
  current config with `brainGatedBiting` ON vs OFF. Report **predEncounter / predator fraction / kills** — does
  brain-gated bite SUPPRESS the already-fragile predation, leave it ~unchanged, or (with the bite-open seed)
  let predators selectively skip un-killable prey? SAY SO plainly with numbers. Expectation: roughly unchanged
  early (bite-open seed), with the real payoff only once Bucket B concentrates prey — report if so.
- **A2b SCENT:** does the scent gate produce silence-when-fleeing / broadcast-when-? Report the gate's spread
  across the population (is it modulated, or stuck open?).
- **A2c BREED:** does the breed gate shift repro timing (breed-later vs the reflex)? Report breed-gate spread +
  the population effect (the liveness check is the floor).

"Built but inert" is a failure — report it.

## Slicing (3 sub-slices, the A1 cadence)

- **A2a — BITE_GATE.** Highest value (unlocks B) + highest risk. Learns. The predation-suppression measurement
  is the key honest output.
- **A2b — SCENT_GATE.** Lowest stakes. Evolve-only. The simplest of the three (a deposit multiply).
- **A2c — BREED_GATE.** Medium. Evolve-only. The determinism-sensitive one (gate before the rng/spawn draw);
  the liveness guardrail matters most here.

Each is one layout → actuator+steer+inspector(merged) → measure cycle (fresh implementer + independent reviewer;
never self-validate). Update the roadmap per slice.

## Out of scope

Interoceptive INPUTS (A1, done), glow→hidden (A3), sexual-repro seams (A4), Bucket B/C. A2 is the three output
gates only. The eat-gate (already a brain output) is the reference, not changed.
