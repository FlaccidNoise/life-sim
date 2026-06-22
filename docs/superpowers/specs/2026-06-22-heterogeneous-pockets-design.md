# Heterogeneous, sticky pockets — the diversity foundation

**Date:** 2026-06-22 · **Branch:** `feat/diversity-levers` · **Status:** design (prototype exists, hardening)

The foundation sub-project (SP1) of the "living aquarium" vision: pockets that differ
environmentally **and** are isolated enough that distinct local communities persist and diverge —
so the world grows many species expressing different behaviours, evolved from place.

## What the evidence established (4 multi-seed sweeps, `src/headless/diversity-sweep.ts`)
- **Predation is an ECONOMIC problem, not a spatial one.** No pocket geometry revives it (tightening
  *raises* prey NND by starving the world; predEncounter = 0.000 on every big-world preset). A bite
  barely pays. → handled on a **separate track** (the economy probe), out of scope here.
- **Per-pocket richness gives population + diversity** (deeper reservoirs → more standing prey, and
  varied depth → distinct pockets). It does NOT close prey NND, so it is a *diversity* lever, not a
  predation lever. This is the keystone of THIS sub-project.
- **A bigger world is cosmetic for diversity** unless each pocket is an independently deep reservoir
  — which per-pocket richness provides. So a big world + deep varied pockets is coherent.

## Mechanic 1 — Per-pocket richness (PROTOTYPE EXISTS, verified OFF-by-default)
Already prototyped in `config.ts` / `food-field.ts` / `world.ts` (uncommitted), determinism-verified
(`world.test.ts` golden hash unchanged at defaults). Three knobs:
- `foodPatchRichness` (default 1) — per-pocket Gaussian peak depth; >1 makes K=cap·peak (deep reservoir).
- `foodPatchRichnessVar` (default 0) — per-pocket variation: peak = richness·(1 + var·(2·rng−1)) → some
  deep "predator-haven" pockets, some shallow "grazer-refuge" pockets. **The diversity-from-place lever.**
- `foodMaxFertility` (default 1) — per-cell fertility clamp; raise with richness>1 so deep pockets exceed K=cap.
- **Ablation:** var=0 ∧ richness=1 ∧ maxFertility=1 → no extra RNG draw → byte-identical to legacy.
- **Determinism:** per-pocket peaks drawn from the world RNG inside `seedPatches`, before creatures.

Hardening work (this is what's left, not the mechanic itself):
- Unit tests (`food-field.test.ts`): richness>1 deepens K; var spreads per-pocket peaks; ablation
  byte-identical; the RNG-draw gate (no draw when var=0).
- Measure the **diversity payoff**: extend `diversity-sweep.ts` with **between-pocket gene variance**
  (assign each creature to its nearest pocket, compute per-pocket mean diet/size, variance across
  pockets). Acceptance = richnessVar>0 measurably raises between-pocket variance vs uniform. This is
  the "distinct species per pocket" signal and is currently UNPROVEN — the build must confirm it.

## Mechanic 2 — Isolation (`deadWaterCost`, NEW)
Per-tick energy drain on a creature proportional to how INFERTILE the cell under it is (max in dead
water, zero in a full pocket) — so wandering the gaps is risky and residents stay home long enough to
diverge. Needs a `fertilityAt(x,y)` accessor on `FoodField` (fertility, not biomass — biomass dips
when grazed; fertility is the stable "is this a pocket" signal). Applied in `economy` basal cost,
ascending order, no RNG → `deadWaterCost=0` is byte-identical. Acceptance: >0 reduces the fraction of
creatures in dead water (the leaky-archipelago metric) without crashing the population.

## Build increments (each its own reviewable commit)
1. **Harden richness** — tests + between-pocket-variance measurement; confirm the diversity payoff; commit.
2. **Isolation** — `fertilityAt` + `deadWaterCost` + tests + stickiness measurement; commit.

## Out of scope (future)
- Predation economy (separate track / probe).
- Other per-pocket dials: size, regrowth, channel-mix (channel-mix pairs with two food channels later).
- Resident↔wanderer disposition gene (SP2); per-pocket map overlay (SP3).

## Risks
- Per-pocket richness may raise pop without producing real between-pocket *divergence* (mixing could
  homogenize genes faster than local selection diverges them) — Mechanic 2 (isolation) is the hedge;
  the build measures divergence explicitly rather than assuming it.
- Deep pockets raise population → higher per-tick cost (O(entities)); watch the live-demo framerate.
