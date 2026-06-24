# Smarter Brains — richer senses, real decisions, mood-glow

**Date:** 2026-06-23
**Status:** Approved design (owner sign-off in session)
**Supersedes nothing; extends the creature NN** (`brain.ts` + `genome.ts`).

## Goal

Expand the creature neural net from a single-layer linear sensor→motor map (turn + thrust only)
into a richer brain: more interoceptive **inputs**, real per-tick **decision outputs**, and a small
**hidden layer** whose internal "mood" is made visible through **bioluminescence**. Priority is
**watchably richer behaviour** (legibility = the soul), not benchmark performance.

## Baseline policy (recorded 2026-06-23 — see `docs/decisions/INDEX.md` → Conventions)

- Every slice ships **ON by default** (its knob defaults to the active value in `defaultConfig`).
- The **only invariant is determinism**: for any `(config, seed)` the sim is byte-identical
  reproducible run-to-run (`world.test.ts:7`). No off-by-default gating, no draw-skip gymnastics.
- Knobs are **kept toggleable** (a feature can be ablated by setting its knob to its inert value).
- The frozen "default matches the pre-feature engine" golden hash (`world.test.ts:17`, `a32e9375`)
  is **retired** — the default world is now *supposed* to move as features land.
- Liveness guardrail (`src/headless/env-guardrail.ts`) covers the safety role the ablation gate
  used to play: on-by-default must not silently ship a dead/degenerate world.

## Current architecture (verified)

`steer()` (`brain.ts:35-189`) is a single linear layer: each input is projected into the heading
frame as a `(fwd, lat)` pair, dotted with `learnedBrain` weights into `turnRaw`/`thrustRaw`, with a
`tanh`/clamp **only at the motor output** (`brain.ts:116-133`) — no hidden nonlinearity. Outputs:
turn (added to heading) and thrust (force, clamped ≥0 → forward-only). Two weight sets per creature:
`brain` (heritable instinct) and `learnedBrain` (reward-modulated Hebbian plasticity, `brain.ts:204`).
Weight layout = the `Brain` enum (`genome.ts:265-306`, `BRAIN_GENES=24`).

## Slices (each is one individually-reviewable increment, in build order)

### Slice 0 — Adopt the on-by-default policy in tests
- **Retire** the golden-hash test (`world.test.ts:17-25`).
- **Keep** the same-`(config,seed)`→hash test (`world.test.ts:7-15`) and different-seed test.
- Confirm the headless liveness guardrail (`env-guardrail.ts`) runs the default config and asserts the
  world is alive + non-degenerate at N ticks; wire it into `make check` if it isn't already.
- Must land FIRST: the first on-by-default feature (Slice A) changes the default hash and would
  otherwise fail the golden test.

### Slice A — Reverse thrust (capped at half forward)
- One knob `reverseThrustFraction` (default **0.5**; `0` = forward-only legacy behaviour = ablation).
- Reverse floor = `−reverseThrustFraction · maxThrust`. Apply in BOTH motor paths (`brain.ts:118-133`):
  - hard-clamp path: replace `if (thrust < 0) thrust = 0` with a floor at `−frac·maxThrust`.
  - `motorSquash` path: allow the symmetric `tanh` negative, then floor at `−frac·maxThrust`.
- `thrust *= efficiency` then `force = thrust·[cos,sin](heading)` → negative thrust = backward force.
- **Watch:** a creature backs away from a predator while still facing it.
- **Test:** same-seed determinism; a unit test that a negative `thrustRaw` yields a backward force
  bounded by `−frac·maxThrust`; `frac=0` reproduces forward-only.

### Slice B — Brain-gated eating (smooth throttle)
- New motor output `eatGate` (a tail `Brain` enum block + bias, `BRAIN_GENES` bump). Eat rate in
  `metabolize` (`economy.ts:170-232`) ×= `squash(eatGate)` (0..1). Knob `brainGatedEating` (default on).
- Output-layer Hebbian like turn/thrust; add `eatGate` bias to the bias-exclusion in `learn()`
  (`brain.ts:224`).
- **Watch:** a creature lifts its head off the food when a predator is in its sight cone.
- **Test:** determinism; eat throttles down when the gate is driven negative; inert when knob off.

### Slice C — Age input (interoceptive)
- Feed `age/ageNorm` (config `ageNorm` ≈ expected lifespan; `age` is `store.ts:68`, currently unused)
  as a scalar input on its own synapse pair (gated like hunger, `brain.ts:107-114`).
- **Watch:** life-stage behaviour — juveniles disperse, elders take more risk.
- **Test:** determinism; the age term moves turn/thrust as age climbs.

### Slice D — Fullness / repro-readiness input
- Feed `clamp(energy/satiatedBar, 0, 1)` (top-half complement to hunger; `satiatedBar` already
  computed at `brain.ts:108`) on its own synapse pair.
- **Watch:** seek shelter before breeding; forage hard right after.
- **Test:** determinism; the fullness term engages as energy climbs toward the satiated bar.

### Slice E — Hidden layer (the substrate for conditional behaviour)
- `H≈4` `tanh` hidden units between inputs and outputs. New transient `hidden: Float32Array(cap·H)`
  (not hashed, like the sense buffers). Two new weight blocks: input→hidden, hidden→output + H biases.
- **Output-layer-only plasticity:** hidden→output learns via the existing Hebbian rule (pre = hidden
  activation, post = motor — generalizes cleanly). input→hidden weights are **evolved, not learned**
  (the honest fix for the credit-assignment gap — plain Hebbian can't assign motor-reward credit back
  through a hidden unit). Extend the bias-exclusion guard to hidden biases.
- Knob `hiddenLayer` (default on); when off, `steer()` takes the literal current one-pass path.
- **Watch:** conditional behaviour ("flee only if predator close AND cornered").
- **Test:** determinism; with `hiddenLayer` off the output equals the pre-hidden one-pass output.

### Slice F — Biolum mood (dedicated glow output → render)
- New motor output `glow` (tail `Brain` block), reading hidden units + inputs, **seeded with a
  positive threat→glow weight** so creatures glow when fleeing from birth, then evolution/learning
  refine it. Knob `moodGlow` (default on).
- Per-creature `glow` actuator buffer (`store.ts`, like `forceX/Y`); the render glow pass
  (`renderer.ts:172`) reads it (a mood term alongside the existing speed/vitality amp). **Hue stays
  for lineage** — glow is a separate channel.
- **Watch:** scan the population and see who's anxious/fleeing by their glow.
- **Test:** determinism; glow output responds to a threat-sight input; inert when knob off.

## Defaults chosen
- Reverse fraction **0.5**; hidden units **H=4**; eat-gate = smooth throttle; `ageNorm` config
  constant; glow output seeded with a positive threat→glow weight.

## Open follow-ups (deferred)
- `BRAIN_DEPTH` evolvable-depth gene — needs a richer environment to pay; defer + probe first.
- Brain-gated reproduction timing — RNG-ordering hazard (`economy.ts` ascending draws); defer.
- A second pheromone channel for true proactive alarm (vs the reflex-on-bite); defer.

## Process
- TDD per slice (failing test → implement → green). Builder + separate fresh-context validator for
  the non-trivial slices (E, F). One beads issue per slice, sequenced 0 → A → B → C → D → E → F
  (A–D independent; F depends on E).
