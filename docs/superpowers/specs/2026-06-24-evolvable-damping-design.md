# Evolvable per-creature damping (drift ↔ dart)

**Date:** 2026-06-24
**Status:** Approved — ready for implementation plan
**Scope:** One reviewable slice. Adds kinematic movement-style variance via a single new scalar gene.

## Goal

Give creatures genuinely different *trajectories* — gentle drifters that coast on
momentum versus twitchy darters that stop the instant they stop pushing. This is the
first slice of "movement variance"; the pulsing/tadpole oscillator (#2 in the
brainstorm) is a deliberately separate future slice.

## Background — current movement system

Per-tick flow: `steer()` (brain → turn + thrust) → `applyFlowForce` → `computeRepulsion`
→ `integrate()` (symplectic Euler). In `integrate()` velocity updates as
`v ← (v + force·dt)·damping`, clamped to each creature's `MAX_SPEED` gene. `damping` is a
single **global** constant (`cfg.damping = 0.9`), so every creature loses the same 10% of
velocity per tick. Existing movement genes (`MAX_SPEED`, `MAX_THRUST`, `MAX_TURN`, `SIZE`,
`METAB_EFF`) vary the *magnitude* of motion but not its *rhythm or momentum* — everyone
glides identically.

## Core idea

Make velocity retention a per-creature gene. High retention (→0.98) → coasts far on
momentum, gets carried by flow, gentle drifter. Low retention (→0.6) → velocity dies fast,
must pay thrust every tick to keep moving, twitchy darter. Everything downstream (the
`MAX_SPEED` clamp, `sizeSpeedExp`, walls, flow advection) is unchanged and stacks on top.

## Design

### 1. New scalar gene `DAMPING` (`src/core/genome.ts`)

- Appended at **tail** slot 22; `SCALAR_GENE_COUNT` 22 → 23.
- Spec: `{ centerKey: 'damping', costKey: null, min: 0.6, max: 0.98 }`.
  - `centerKey: 'damping'` reuses the existing `cfg.damping = 0.9`, so founders seed around
    today's value (± `founderSigma`·center, clamped) and the t0 world feels unchanged.
  - `costKey: null` — pure-physics tradeoff (like `METAB_EFF`/`DIET`). No basal upkeep. The
    only tradeoff is emergent: coasting saves thrust-energy but overshoots food/walls (poor
    control). No pre-emptive cost coupling; added later only if the probe shows collapse.
  - Range `[0.6, 0.98]` gives a ~20× coast-distance spread (impulse coast ≈ 1/(1−d): 0.6 →
    ~2.5 ticks, 0.98 → ~50 ticks) — dramatic and clearly visible in trajectory. Upper bound
    < 1 for stability; the `MAX_SPEED` clamp bounds velocity regardless.
- **Always drawn, ungated** — `scalarGeneGatedOff` returns `false` for it. It sits strictly
  *after* the food-channel/pheromone tail genes (17–21), so genes 0–21's RNG draws are
  untouched → the existing food-channel ablation byte-identity is preserved. Only the
  absolute determinism hash shifts, which is acceptable (golden hash retired; the invariant
  is same config+seed → same hash, not backward-compat with old hashes).

### 2. `integrate()` reads the gene (`src/core/physics.ts`)

- New `evolvableDamping: boolean` parameter. When `true`, use
  `scalarGenes[i*SCALAR_GENE_COUNT + ScalarGene.DAMPING]` in place of the global `damping`
  argument. When `false`, use the global `damping` exactly as today.
- The gene is **always drawn even when the flag is off**, so toggling `evolvableDamping` is a
  pure read-path switch — the RNG stream is identical either way. Clean live-ablation for
  interactive tuning with zero determinism cost.
- `world.ts` passes `cfg.evolvableDamping` into the `integrate()` call.

### 3. Config (`src/core/config.ts`)

- Add `evolvableDamping: boolean`, default `true` (ships on, per feature-default-on policy).
- Keep `damping: 0.9` as both the founder center and the off-path fallback.
- No new cost key.

### 4. Inspector parity

If a per-creature scalar-gene readout exists (overlay/app), add `DAMPING` so the inspector
matches the sim. Verify whether one exists during implementation; add iff present.

## Verification

- **Kinematic unit test** (`physics.test.ts`): seed two creatures, one impulse then zero
  thrust → the high-damping creature travels measurably farther than the low-damping one.
  Deterministic.
- **Determinism test** green: same config+seed → same hash.
- **Ablation check**: with `evolvableDamping: false`, a creature whose gene ≠ 0.9 still
  integrates with the global 0.9 (the flag truly bypasses the gene; RNG stream unchanged
  vs flag on).
- **Headless probe across seeds**: evolve, then report the evolved `DAMPING` distribution
  (mean / SD / range / per-seed). Reads whether drift-and-dart *coexist* or collapse to one
  end — tells us if a cost coupling is warranted in a follow-up. Reported, not assumed.

## Scope boundaries (YAGNI)

- No render cue beyond the trajectory itself — the motion *is* the payoff.
- No oscillator/pulse (separate future slice #2).
- No cost coupling unless the probe shows collapse.

## Risk

Mechanism is HIGH confidence (per-creature damping in `integrate()` is trivially
deterministic). Emergent *diversity* is MEDIUM: if precise control doesn't matter much in
the current foraging economy, coasting is strictly cheaper and damping evolves to the max
for everyone → a drifter-monoculture rather than variance. This is why the headless probe is
a first-class deliverable, not an afterthought — it measures coexistence directly.
