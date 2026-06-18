# Ecology Milestone (M7.5) — A Balanced 3-Trophic Ecosystem

**Status:** design approved (2026-06-17). Branch `ecology-predation` (= `main` + the predation
mechanism, OFF by default). Builds toward a self-sustaining plants → foragers → predators ecosystem.

## Goal

Turn the current single-herbivore demo into a **living three-trophic ecosystem** — plants → foragers
→ predators — made of **smaller, lighter, more mobile, more *individual*** creatures in a **bigger,
more open** world. The point is the feel the owner is missing: fewer, longer-lived, genuinely active
organisms you can follow and care about, under a real predator-prey arms race — not a jiggling swarm.

## Success bar (definition of done)

1. **All three trophic levels self-sustain** — plants, foragers, AND predators coexist with **no
   top-ups**, breathing (boom-bust limit cycle), across **multiple seeds**, over **long runs
   (12k+ ticks)**.
2. **The feel goal** — noticeably fewer, longer-lived, more-active individual organisms; a viewer
   can follow one creature living a non-trivial life (hunt / flee / eat / reproduce).
3. **Invariants preserved** — the CARDINAL RULE (no fitness function / score / ranking in
   `src/core/**`; selection is purely economic; predators target by cellType + structural
   organism-identity, never lineage) and **single-thread byte-identical determinism** hold
   throughout. `make check` green at every increment.

This is accepted as **multi-phase** work.

## Strategy (owner-chosen)

**Holistic rescale + headless-driven re-tune, with a sim-model lever held in reserve.** Apply the
rescale (smaller cells, shorter bonds, lighter, bigger world) and re-derive the economy, then balance
the 3-level system. A core-model change to predation (strike-reach, per-diet speed, or sharper
prey-sensing) is added **only if the headless experiments prove tuning is insufficient** — and even
then in that order of preference (cheapest/least-invasive first).

## What already exists (this branch, OFF by default)

The predation **mechanism** is built, unit-tested, and committed (predation is dormant at the default
config; the M2-M7 economy is byte-identical until turned on):
- `PREDATOR` cell type (=7) + `isFlesh` helper; menacing-red render.
- Prey-scent field (2nd `FoodField`) + per-organism `carnivore` flag + diet-routed `sense()`.
- Predation kernel in `metabolize` (a PREDATOR drains other-organism flesh; prey dies atomically via
  the existing organism-death path — NO per-cell death, which stays deferred).
- `buildPredatorGenome` (forager body/brain, carnivore mouth).
- Knobs: `preyDeposit` (0=OFF), `predDigestRate`, `predDigestEfficiency`.

**Known blocker (the reason for this milestone):** at the *current* scale, predators can't sustain a
population — a single mouth cell rarely contacts a sparse, mobile, multi-cell forager at equal speed,
so predators decay from their seed reserve (~t500) without reproducing. Five parameter sweeps (bite,
scent, count, mass, mouth size) failed. The rescale is the hypothesis for fixing this structurally
(smaller cells → denser prey + more contact; compact bodies → mouth lands more reliably; lighter →
more mobility), with mechanism levers in reserve.

## The rescale (concrete targets; final values set by the probe)

| Lever | From | Toward | Why / caveat |
|---|---|---|---|
| `cellRadius` | 6 | ~3-4 | More cells per area, cheaper cells, finer hash. **Economy re-derivation:** photo/digest/basal all scale with area = radius² — this is the main risk, done knob-by-knob headless. |
| organism bonds | forager offsets ~4r | shorter / more compact | Smaller organisms → denser populations, smaller-but-closer-packed targets, more wiggle; predator mouth lands more reliably. |
| `mass` | 2 | lighter (→1?) | Friskier movement (terminal v ∝ 1/mass). **Cohesion gotcha:** mass-2 prevented fragmentation under repulsion (M5); re-verify at the new scale, fall back to heavier if it fragments. |
| world | 1536² | 2048²+ | More open space; cell counts scaled to keep a de-jammed (~40-60%) density. |
| movers | maxThrust 8 | tune up | More active / mobile. |

## Methodology (non-negotiable)

**Headless-first, probe-driven.** The ecology probe (`src/headless/feel-probe.ts`, evolving into the
ecology harness) is the oracle: it reports per-trophic-level counts, packing, diversity, predator
kills/reproductions, extinction times, oscillation amplitude, across multiple seeds over 12k+ ticks.
**Nothing reaches `main.ts` until the probe passes the bar.** Every increment: `make check` green +
determinism byte-identical + cardinal rule intact.

## The path (phases — each a beads epic of tiny, headless-gated increments)

0. **Probe & baseline.** Harden the ecology probe (multi-seed, all metrics above). Record the current
   baseline numbers so every later change is measured against it.
1. **Rescale + re-derive economy.** Smaller cells, shorter bonds, lighter mass, bigger world, scaled
   counts. Re-derive photo/digest/basal so the existing plants+foragers ecosystem still de-jams,
   self-sustains, and *evolves* at the new scale. Gate: foragers breathe + diversity climbs +
   determinism + cardinal rule intact + `make check` green.
2. **Predator viability at the new scale.** Turn predation on; sweep predator economy. If predators
   self-sustain → done. If not → add the minimal reserved lever (strike-reach → per-diet speed →
   sharper sensing, in that order), each headless-justified and re-verified against the invariants.
3. **Three-trophic balance.** Sweep to a stable plants↔foragers↔predators limit cycle: all three
   coexist, multi-seed, 12k+ ticks, no top-ups, breathing. The hard core of the milestone.
4. **Prey fleeing (two-way arms race).** Add a predator-scent field + prey evasion so prey actively
   flee → genuine arms race (pursuit AND evasion under selection). Validate it deepens dynamics
   without destabilizing the balance.
5. **Demo + render + polish.** Wire the balanced config into `main.ts`; predator render/follow-cam;
   final feel tuning (fewer/longer-lived/active individuals you can follow).
6. **Verification & merge.** Adversarial-verify workflow (cardinal rule, determinism, balance
   robustness across seeds), determinism tests for any new fields, full `make check`, merge.

## Risks & mitigations

- **Economy re-derivation is fiddly** (radius² coupling). → Headless per-knob; change one thing at a
  time, re-baseline.
- **Predator balance may resist tuning even after rescale.** → The reserved mechanism levers
  (strike-reach first), each gated on probe evidence, each re-verified against determinism + cardinal.
- **Lighter cells vs cohesion fragmentation.** → Re-verify cohesion at the new scale; fall back to
  heavier mass if bodies fragment.
- **3-trophic systems are intrinsically prone to one level going extinct.** → Multi-seed long-run
  probe as the gate; treat single-seed success as necessary-not-sufficient.

## Out of scope (later)

M8 parallelism (Workers + SAB) — explicitly deferred until the ecosystem is worth scaling. Sexual
reproduction / crossover (M9). These do not block this milestone.
