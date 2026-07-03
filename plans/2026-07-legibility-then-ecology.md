# Plan: Make evolution legible, then robustify the ecology

Two-arc plan from the 2026-07-02 grading pass (Simulation **C+**, Methodology **B−**). Arc A first
(make the feel-first playground actually *show* evolution), then Arc B (make the diversity it shows
emerge *reliably*, not by seed-luck). Grounded in first-hand runtime measurement, not just code reading.

## Context a fresh session needs
- Demo config = `defaultConfig({...livingWorldOverrides})` — `src/app/living-world-config.ts` is the single
  source; the browser (`src/app/main.ts`), headless probes, and any demo test all read it.
- The engine is **good and correct** (deterministic SoA, energy-conserving repro, 116 economy+world tests
  green). The gap is dynamics + legibility, not craft.
- Drive the sim without the UI: in-browser `window.sim.world.step()` / `window.sim.health()` (main.ts exposes
  it); headless `npx tsx src/headless/<probe>.ts`. **Gotcha:** editing any `src/` file triggers Vite HMR and
  RESETS the running browser sim to tick 0.
- Turnover/diversity probe (built this session): `src/headless/evolve-probe.ts [ticks] [seeds] [stride]
  --mate=N --initPop=N --compat=N`. Reports founder%, mean lineage generation, diet histogram + bimodal flag,
  trait σ. This is the acceptance-measurement tool for both arcs.
- Determinism is the ONLY invariant: same `(config, seed)` → byte-identical (`world.stateHash()`). Every
  change must preserve it. Features ship ON by default now (golden-hash ablation gate retired).

### Baseline pathologies (measured, seed 1 demo)
- Bootstrap valley: pop 1000→~450 through ~t2000 with births ≈ 0 (mate-encounter starved) — a dead-looking
  opening on a feel-first demo.
- Diversity is a seed coin-flip: grazer monoculture (seed 1), bimodal-then-collapse (seed 2), bimodal (seed 3).
- Trophic story is invisible: default LINEAGE dot color, no diversity/predation trend line, mean (not median)
  age hides the founder-heavy valley.
- Vision genes evolve DOWN to uselessness every seed (μ ~165→135).

---

## Arc A — Make evolution legible (UX)  [do first]

**Goal:** a first-time viewer, without touching a knob, can point at the screen and say "those are predators,
that line is them crashing, the pool is turning over." Every task is verifiable with a Claude-in-Chrome
before/after screenshot.

### A1 — Trophic-first default view  [S]
- `main.ts:117` `colorMode` LINEAGE → `ColorMode.DIET`. Keep LINEAGE one `c`-press away.
- Verify the DIET ramp (`renderer.ts` dot-color path + `palette.ts`) reads green(grazer)→red(hunter) legibly at
  world zoom; widen the ramp if grazers/predators aren't obviously distinct as pale dots today.
- **Accept:** on load, predators are visibly a different color mass; toggling seeds shows the split.

### A2 — Population-level trend lines  [S→M]
- `main.ts:79` graph feeds `[pop, food, births, deaths]`. Add a stacked grazer/omnivore/predator band and a
  diet-σ (diversity) line. `world-stats.ts:40` already computes the trophic counts each frame — push them into
  `graph.push`. Extend `graph.ts` (`TimeSeriesGraph`) to render a stacked band or 3 stacked series.
- **Accept:** the predator crash/recovery and monoculture drift are watchable as curves, not just current-frame
  numbers.

### A3 — Turnover + hoarding readouts (make the pathologies loud)  [S]
- `world-stats.ts:43`: add MEDIAN age (keep mean), % founders (`age==tick`), generations-elapsed, and a
  "turnover stalled" flag when births/t ≈ 0 after a warmup. (Reuse the onBirth-fed lineage generation like
  evolve-probe does, or approximate via founder-fraction.)
- Annotate the energy distribution with the expected band (birthEnergy / reproThreshold reference marker) and a
  "% satiated & not breeding" stat, so a right-shifted energy histogram reads as a *stall*, not health.
- **Accept:** the bootstrap valley and any stall are visibly flagged, not buried in a rising mean.

### A4 — Bodies on zoom + swarm legibility  [M]
- `main.ts:76` `detailOn=false` (perf). Auto-enable the detail overlay when zoomed past a threshold, bounded by
  visible-creature count for perf; or a one-time "press d for bodies" hint. Confirm perf on a dense pocket.
- **Accept:** zooming in reveals animals (eyes/maw/fins/vision cones), not dots; frame rate stays smooth.

### A5 — Runtime health surfacing (no silent failures)  [S]
- `scanHealth`/`sim.health()` violations during a run are console-only (`main.ts:775`); only boot-time renderer
  failure has a banner (`main.ts:64`). Surface a non-fatal indicator/banner when a NaN/oob/energy/gene violation
  occurs mid-run.
- **Accept:** a runtime invariant break is visible in the UI, per the "no silent failures" rule.

**Arc A exit criteria:** record a short Claude-in-Chrome before/after (tick 0 → ~tick 8000) showing the trophic
color split, the predator trend line, and the turnover readout. Diet color is the default; the story is legible
without opening a panel.

---

## Arc B — Robustify the ecology (evolution dynamics)  [after Arc A]

**Goal:** a rich, diverse predator/prey ecosystem emerges *reliably across seeds* from a non-moribund opening,
reducing dependence on the ~150-knob scaffold. Acceptance = `evolve-probe.ts` bimodal + healthy turnover on
seeds 1–3 (later 1–8).

### B0 — findMate radius-scan fix  ✓ LANDED (2026-07-02)
`findMate` was the only neighbor scan still hard-wired to 3×3, silently capping `mateContactRange` at ~12u.
Fixed to the range-derived scan `hunt()` uses; byte-identical at the shipped 12 (116 tests green). The knob is
now real. `src/core/economy.ts findMate`; regression test in `economy.test.ts` ("beyond one hash cell").

### B1 — Raise demo mate reach  [S, multi-seed validated]
- `living-world-config.ts`: set `mateContactRange: 36`. Validated seeds 1–3: all sustain a bimodal
  grazer/hunter split tick 5k→20k (dietσ 0.26–0.38 vs baseline 0.07–0.19), pop settles 3–5k (no cap), turnover
  deepens (mean gen ~33 vs ~27). Shallower bootstrap valley.
- **Accept:** re-run `evolve-probe 20000 1-4 5000`; bimodal + turning over on every seed; add it as a gate (see
  B-gate).

### B2 — Attack the scale / interaction-radius mismatch (root cause)  [M]
- The deep reason behind B1: an 8192² world with ~12–16u interaction radii means natural NND ≫ reach, starving
  the local interactions selection needs. Sweep: raise `initialPopulation` / pocket density, and/or raise
  `biteRange` until `predator-probe.ts` shows `predEncounter` clearing ~0.1–0.2, so predation is
  geometry-driven, not coefficient-propped.
- **Accept:** predEncounter > 0.1 sustained; predator layer persists with `dietGeneralistFloor` *relaxed toward
  1* (prove the ecology, not the coefficient, holds the split).

### B3 — Un-freeze the steady-state landscape  [S]
- `fertilityDriftRate: 0` pins pockets → after demes settle, selection stalls (vision/speed flat, only size
  moves). Re-enable slow pocket drift or periodic disturbance so demes chase a moving resource target.
- **Accept:** vision/speed means show directional movement past t10k instead of going flat.

### B4 — Predator energy → offspring feedback  [M]
- `hunt()` (economy.ts) has no satiation cap, so predators hoard energy into a dead sink (max ≫ satiated bar)
  that never becomes offspring — wasting the fitness signal. Cap absorption at the satiated bar (mirror
  `metabolize` graze-stop) or route surplus into faster/cheaper breeding.
- **Accept:** predator birth rate tracks hunting success; the energy hoard shrinks.

### B5 — Make speciation self-reinforcing  [M, stretch]
- DISPLAY/PREFERENCE are inert (weight 0 in `geneticDistance` genome.ts; PREFERENCE not a brain input), so the
  gate maintains isolation but can't create it. Feed an ecological axis (diet/forage) into the mate-attraction /
  distance so a partial split biases mate choice and amplifies into reproductive isolation.
- **Accept:** assortative mating measurably raises diet-σ / cuts cross-diet crossover; a split, once nucleated,
  sharpens instead of eroding.

### B-gate — methodology crosscut (cheap, protects all of B)  [S]
- Turn `evolve-probe`/`long-run` into a real CI gate that loads `livingWorldOverrides` and asserts the SHIPPED
  demo stays bimodal + turning over (predator floor, births after warmup, diet-σ above a monoculture bound).
  Delete the `nightly.yml` echo-stub or wire a real gate. Closes the "gates certify not-dead, never healthy"
  hole and the known false-greens (`life-sim-zdnv`).

**Arc B exit criteria:** `evolve-probe 20000 1-8 5000` shows bimodal + healthy turnover on ≥6/8 seeds with the
diet coefficient relaxed; predEncEncounter > 0.1; the demo gate is green in CI.

---

## Sequencing & dependencies
- Arc A is independent of Arc B and ships user-visible value immediately; do it first (user's call).
- B0 is done. B1 is a one-line validated change but should land WITH the B-gate so it's protected.
- B2 is the real root-cause work; B1 is the down-payment. B3/B4/B5 are additive depth.
- Each task is one reviewable increment (Josh's preference); commit per task as a rewind point.
