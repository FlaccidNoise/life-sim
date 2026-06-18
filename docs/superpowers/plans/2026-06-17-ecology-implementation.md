# Ecology Milestone (M7.5) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`)
> syntax for tracking.

**Goal:** A self-sustaining plants → foragers → predators ecosystem of smaller, lighter, more mobile,
more individual creatures in a bigger, more open world — balanced across multiple seeds with no top-ups.

**Architecture:** Holistic rescale (smaller cells/bonds/mass, bigger world) + headless-driven economy
re-derivation, then 3-trophic balancing, with a reserved predation-mechanism lever (strike-reach →
per-diet speed → sharper sensing) added only if the probe proves tuning insufficient. The predation
mechanism itself already exists on this branch (OFF by default).

**Tech Stack:** TypeScript (strict), Vitest, Vite, pnpm, Node 22. Struct-of-arrays sim.

## Global Constraints

- **CARDINAL RULE:** no fitness function / score / ranking in `src/core/**` or `src/core/organism/**`;
  selection is purely economic (energy thresholds); predators target by cellType + structural
  organism-identity (`organismId`), never founderId/lineage/species/board.
- **DETERMINISM:** same `(Config, seed)` → byte-identical SoA single-threaded; no new RNG on the hot
  path; canonical ascending iteration order; new derived fields are NOT on the hashed contract.
- **NO per-cell-death-within-an-organism** (deferred to M8); predation drains organism aggregate energy
  → atomic death only.
- `git commit --no-verify` (beads hook); NEVER add a `Co-Authored-By` trailer; no git remote.
- `make check` (typecheck + lint + test) green at every task. Branch: `ecology-predation`.
- **Headless-first:** the ecology probe is the oracle; nothing reaches `src/app/main.ts` until the
  probe passes the phase gate.

## Empirical-task convention

Tuning tasks cannot pre-specify exact config values (they are *discovered*). Such a task's deliverable
is **"config values found via the probe that meet GATE"**, recorded in the probe's committed comment +
the decision log. The task lists the search space, the metric, and the gate — not fictional code.

## File map

- `src/headless/feel-probe.ts` — the ecology probe/harness (exists; hardened in Phase 0). NOT shipped.
- `src/core/sim/config.ts` — knobs (add bond/scale knobs as needed; existing predation knobs).
- `src/core/genome/critter-genome.ts` — forager/predator body plans (compacting in Phase 1).
- `src/core/cells/metabolism.ts` — economy + predation kernel (strike-reach lever lives here if needed).
- `src/core/cells/sense.ts` — diet-routed sensing (predator-scent fleeing in Phase 4).
- `src/core/sim/world.ts` — tick wiring, fields.
- `src/app/main.ts` — the live demo (wired only in Phase 5).
- `docs/decisions/INDEX.md` — record each phase's locked config + rationale.

---

## Phase 0 — Probe & baseline

### Task 0.1: Ecology probe reports all metrics, multi-seed

**Files:** Modify `src/headless/feel-probe.ts`.

**Produces:** a `run(trial)` that prints, per trial, over a configurable horizon and seed list:
plants/foragers/predators counts (min/max/extinction-tick per level), packing %, genotypic diversity,
predator births + kills (instrument via energy gained / organism births where carnivore), oscillation
ratio (back-half max/min per level). One line per (trial × seed).

- [ ] **Step 1:** Extend the probe's per-tick accounting to track, separately, forager vs predator
  organism counts (via `organisms.carnivore`), each level's back-half min/max and first-extinction
  tick, and `lastOrganismBirths` split is not available — instead track predator-count rising above
  seed as the "predators reproduced" signal. Add a `seeds: number[]` loop.
- [ ] **Step 2:** Run `pnpm exec tsx src/headless/feel-probe.ts` on the current (pre-rescale) config
  with predation OFF; confirm it reproduces the known de-jam baseline (foragers self-sustain, ~60-74%
  packing, div climbs) across seeds 3/7/42.
- [ ] **Step 3:** Record the baseline numbers as a comment block at the top of the probe.
- [ ] **Step 4:** `git add src/headless/feel-probe.ts && git commit --no-verify -m "test(ecology):
  probe reports 3-trophic metrics multi-seed + baseline"`.

**GATE:** probe runs clean, prints all metrics for all three levels across ≥3 seeds.

---

## Phase 1 — Rescale + re-derive economy

The economy terms scale with `area = cellRadius²`. Halving radius (6→3) cuts per-cell photo/digest/
basal income+cost by 4×. The goal: the existing **plants + foragers** ecosystem still de-jams,
self-sustains, and evolves at the smaller scale, in a bigger world.

### Task 1.1: Make body scale tunable (bond/offset compaction)

**Files:** Modify `src/core/genome/critter-genome.ts`; test `…/critter-genome.test.ts`.

**Interfaces:** `buildForagerGenome(cellRadius, initialEnergy)` already derives offsets from `cellRadius`
(`off = 4*r`). Confirm offsets/rest-lengths scale with `cellRadius` so shrinking the radius compacts
the body automatically; if any offset is hard-coded, make it `r`-relative.

- [ ] **Step 1:** Read `buildForagerGenome`/`buildPredatorGenome`; verify every division offset, bond
  rest-length, and mouth lead are expressed in units of `r` (so a smaller `cellRadius` compacts the
  whole organism). Note any absolute constant.
- [ ] **Step 2:** If a hard-coded distance exists, write a failing test asserting that
  `develop(buildForagerGenome(3))` produces an organism whose bounding box scales ~½ vs `…(6)`.
- [ ] **Step 3:** Make offsets `r`-relative to pass; run `pnpm exec vitest run
  src/core/genome/critter-genome.test.ts`.
- [ ] **Step 4:** Commit.

**GATE:** forager/predator bodies scale geometrically with `cellRadius` (verified by test).

### Task 1.2: Re-derive the economy at cellRadius ~3-4 (EMPIRICAL)

**Files:** probe trials; final values → `docs/decisions/INDEX.md`. (Config defaults stay; the DEMO
config in the probe holds the new scale until Phase 5.)

**Search space:** `cellRadius ∈ {3,4}`; `worldWidth/Height ∈ {2048, 2560}`; seed plant count scaled to
~40-60% packing; `photoGain`, `basalCost`, `digestRate`, `crowdDivideCap`, `crowdGridSize`,
`reproThreshold`, `mass ∈ {1,1.5,2}`, `maxThrust`. Change ONE axis at a time; re-baseline.

- [ ] **Step 1:** In the probe, set a `SCALE` config (cellRadius 4, world 2048², counts scaled) with
  predation OFF; run multi-seed; observe whether foragers self-sustain + de-jam + diversity climbs.
- [ ] **Step 2:** Iterate knob-by-knob (economy first, then mass for cohesion, then movement) until
  GATE holds. After each change, watch for body fragmentation (cohesion gotcha) — if cells scatter,
  raise `mass` or shorten bonds.
- [ ] **Step 3:** Confirm determinism unaffected (the rescale only changes config; run
  `pnpm exec vitest run src/core/sim/reproducibility.test.ts`).
- [ ] **Step 4:** Record the locked rescale config in the probe comment + a decision-log entry.
- [ ] **Step 5:** Commit the probe + decision log.

**GATE:** at cellRadius ≤4, world ≥2048², foragers + plants self-sustain across ≥3 seeds for 12k ticks,
de-jammed (40-60% packing), diversity climbs, no fragmentation, determinism intact, `make check` green.

---

## Phase 2 — Predator viability at the new scale

### Task 2.1: Turn predation on at the new scale and measure (EMPIRICAL)

**Files:** probe trials.

**Search space:** predator seed count, `preyDeposit`, `predDigestRate`, predator `mass`, predator
initial energy. (All already exist.)

- [ ] **Step 1:** Add predators to the probe's rescaled config; sweep the search space; measure whether
  predators reproduce (count rises above seed) and the population persists 12k ticks multi-seed.
- [ ] **Step 2:** If predators self-sustain → record config, skip to Phase 3.
- [ ] **Step 3:** If NOT → proceed to Task 2.2 (mechanism lever), cheapest first.

**GATE (success path):** predators reproduce and persist multi-seed → go to Phase 3.

### Task 2.2: Reserved mechanism lever — strike-reach (ONLY IF 2.1 fails)

**Files:** Modify `src/core/cells/metabolism.ts` (PREDATOR branch), `src/core/sim/config.ts`,
`src/core/sim/world.ts` (pass the knob); test `…/metabolism.test.ts`.

**Rationale:** decouple a predator's *catch radius* from its mouth's physical/cost radius (basal ∝
radius² makes a big mouth starve). Add `predReach` (default 1 = current contact), so a PREDATOR eats
flesh within `predReach·(ri+rj)`, clamped to the hash 3×3 window (`≤ 1.5·cellSize` reliably). This is
the cheapest model lever; it directly raises catch rate without economy cost.

- [ ] **Step 1:** Write a failing test: a PREDATOR with `predReach=2` drains a flesh cell at distance
  `1.5·(ri+rj)` (outside plain contact) of another organism; with `predReach=1` it does not.
- [ ] **Step 2:** Add `predReach: number` to `Config` (default 1) with a comment that values are
  clamped to the 3×3 window; thread it into `metabolize` and the world call.
- [ ] **Step 3:** In the PREDATOR branch, change the contact test from `d2 < rsum*rsum` to
  `d2 < (predReach*rsum)²` with `predReach*rsum` capped at `1.5*cellSize`. Keep canonical order, no RNG.
- [ ] **Step 4:** Run the new test + `pnpm exec vitest run src/core/cells/metabolism.test.ts` +
  `reproducibility.test.ts` (predReach default 1 → byte-identical).
- [ ] **Step 5:** Commit.
- [ ] **Step 6 (EMPIRICAL):** re-run the Task 2.1 sweep with `predReach ∈ {1.5, 2, 2.5}`. If predators
  now self-sustain → record + Phase 3. If still failing → escalate to the next lever (per-diet speed,
  then sharper prey-sensing), each its own task mirroring this structure, each headless-gated and
  re-verified against determinism + cardinal rule. Log which lever was needed and why.

**GATE:** predators self-sustain multi-seed with the minimal lever engaged; determinism + cardinal
rule intact; `make check` green.

---

## Phase 3 — Three-trophic balance (the hard core, EMPIRICAL)

**Files:** probe trials; final config → decision log.

**Goal:** all three levels coexist as a breathing limit cycle, multi-seed, 12k+ ticks, no top-ups.

- [ ] **Step 1:** With Phase 1+2 results, sweep the joint predator-prey-plant economy
  (`reproThreshold` for each diet is shared — note this constraint; `preyDeposit`, `predReach`/lever,
  `crowdDivideCap`, plant `lightRegen`) toward coexistence. Track each level's oscillation + extinction.
- [ ] **Step 2:** Verify robustness across seeds 3/7/42/99 over 12k+ ticks: no level goes extinct, all
  oscillate, genotypic diversity climbs (evolution active in both foragers and predators).
- [ ] **Step 3:** Record the locked balanced config (probe comment + decision log).
- [ ] **Step 4:** Commit.

**GATE:** plants + foragers + predators all self-sustain and breathe across ≥3 seeds, 12k+ ticks, no
top-ups. This is the milestone's primary success criterion.

---

## Phase 4 — Prey fleeing (two-way arms race)

### Task 4.1: Predator-scent field + prey evasion

**Files:** Modify `src/core/sim/world.ts` (3rd `FoodField` `predScent` + deposit by carnivore flesh +
step), `src/core/cells/sense.ts` (a herbivore SENSOR also senses predator-scent → flee component),
`src/core/sim/config.ts` (`predScentDeposit`, default 0 = OFF), tests.

**Design note:** mirror the prey-scent infra exactly (a 3rd field, deposited by carnivore flesh, sensed
by foragers). Fleeing = a NEGATIVE gradient contribution to the forager's steering (away from predator
scent). Keep it OFF by default (byte-identical) and gate-on in the demo. Cardinal-rule safe (scent is
position/type-based).

- [ ] **Step 1:** Failing test: with `predScentDeposit>0`, a forager SENSOR near a predator gets a
  sense vector pointing AWAY from the predator (or a documented evasion signal), and a carnivore
  deposits into `predScent`.
- [ ] **Step 2:** Add the 3rd field + deposit + step in `world.ts` (mirror `preyField`); add the config
  knob (default 0).
- [ ] **Step 3:** Route the flee signal in `sense()` for herbivore SENSORs; keep determinism (no RNG).
- [ ] **Step 4:** Run new test + `reproducibility.test.ts` (default 0 → byte-identical) + `make check`.
- [ ] **Step 5:** Commit.
- [ ] **Step 6 (EMPIRICAL):** sweep `predScentDeposit` + flee weight in the probe; confirm it deepens
  the arms race (predators + prey both under directional selection; chase/evasion behavior) WITHOUT
  destabilizing the Phase 3 balance. Record config.

**GATE:** fleeing improves dynamics, all three levels still self-sustain multi-seed, `make check` green.

---

## Phase 5 — Demo wiring + render + polish

### Task 5.1: Wire the balanced config into the demo

**Files:** Modify `src/app/main.ts`.

- [ ] **Step 1:** Replace the demo config with the Phase 1-4 locked values (rescale + predation on +
  fleeing on); spawn the balanced mix of foragers + predators.
- [ ] **Step 2:** `pnpm dev`; visually confirm: smaller mobile creatures, open world, visible hunts,
  foragers fleeing, all three levels persisting, you can follow one creature's life.
- [ ] **Step 3:** Commit.

### Task 5.2: Predator render + follow legibility

**Files:** Modify `src/app/main.ts` / `src/render/webgl-renderer.ts` as needed.

- [ ] **Step 1:** Predators already render red; confirm distinct. Default follow-cam already locks onto
  a forager — consider a key to cycle predator/forager subjects. Dim plants already done.
- [ ] **Step 2:** Visual check; commit.

**GATE:** the live demo shows the balanced ecosystem with the target feel.

---

## Phase 6 — Verification & merge

### Task 6.1: Determinism tests for new fields/levers

**Files:** Modify `src/core/sim/reproducibility.test.ts`.

- [ ] **Step 1:** Add a cap-ON-style determinism case for predation ON (preyDeposit>0, predReach>1 if
  used) + fleeing ON: two runs byte-identical, non-vacuous (predator births>0, kills>0).
- [ ] **Step 2:** Run it; commit.

### Task 6.2: Adversarial-verify workflow + merge

- [ ] **Step 1:** Run a focused verify workflow over the branch diff: cardinal-rule trace (no
  lineage/fitness in the predation/fleeing/economy paths), determinism, balance robustness across
  seeds, zero-alloc hot loop.
- [ ] **Step 2:** Action any Critical/Important findings; re-run `make check`.
- [ ] **Step 3:** Update `docs/decisions/INDEX.md` + memory; `bd sync --flush-only`.
- [ ] **Step 4:** Merge `ecology-predation` → `main` (ff-only per convention: `git push . ecology-predation:main`).

**GATE:** zero Critical/Important; `make check` green; all phases' gates hold; merged.

---

## Self-review notes

- **Spec coverage:** rescale (P1), predator viability + reserved lever (P2), 3-trophic balance (P3),
  prey fleeing (P4), demo/render (P5), determinism/cardinal verify + merge (P6), probe/baseline (P0) —
  all spec sections mapped.
- **Empirical honesty:** P1.2, P2.1, P3, P4.6 are search tasks — deliverable is probe-found config
  meeting a stated gate, recorded in the decision log; not fictional code. This is intrinsic to a
  balancing milestone, not a placeholder.
- **Type consistency:** new knobs `predReach`, `predScentDeposit` default to no-op values so the
  determinism contract stays byte-identical until the demo opts in (mirrors `crowdDivideCap`/
  `preyDeposit`).
