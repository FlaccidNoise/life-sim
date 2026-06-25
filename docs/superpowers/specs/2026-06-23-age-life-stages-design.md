# Age-dependent metabolism / life stages (life-sim-bd8a)

**Date:** 2026-06-23
**Status:** Approved, implementing
**Branch:** worktree-reactive-dreaming-blum (at 832abe7)
**Bead:** life-sim-bd8a (first of the post-832abe7 sequence: age-stages → wander → sexual repro)

## Problem

`age` is currently **inert**: incremented in `economy.metabolize` (`economy.ts:284`) and included in
`stateHash()` (`world.ts`), but **nothing reads it**. Death is **starvation-only** (`cullDead`: energy ≤ 0).
There is no senescence, no lifespan ceiling, no life stages. Baseline (default config, seed 1, 2500 ticks):
median lifespan ~262 ticks, long tail to ~2381 (effectively-immortal well-fed creatures), ~44% ever bred,
median age at first breed ~120. (Numbers re-measured in the worktree before tuning.)

## Goal

Make `age` meaningful — juvenile / adult / elder life stages whose boundaries are **evolvable genes** —
while honoring the determinism contract: **OFF by default, byte-identical when off** (golden hash
`a32e9375` after 1000 ticks at seed 3, `world.test.ts:24`), RNG consumed only at reproduction, ascending slot order.

## Design

### Master switch
`ageStages: boolean` (default `false`). Gates **both** new gene draws and **all** age effects. Mirrors the
`pheromoneEnabled` master-switch pattern.

### Two new evolvable genes (genome.ts — confirmed identical in worktree vs prior read)
Appended at the **tail** after `PHERO_DEPOSIT` (21) so no existing gene's RNG draw shifts.
`SCALAR_GENE_COUNT` 22 → 24.

| idx | gene | centerKey | costKey | range | meaning |
|-----|------|-----------|---------|-------|---------|
| 22 | `MATURITY_AGE` | `maturityAge` | `null` | `[0, 800]` | juvenile→adult: below this a creature cannot breed |
| 23 | `SENESCENCE_AGE` | `senescenceAge` | `senescenceAgeCost` | `[50, 4000]` | adult→elder: at/above this the metabolic tax begins |

Both **tail-gated** in `scalarGeneGatedOff`: `return !cfg.ageStages`. Off → pinned at center, **no RNG draw**
(the proven `FORAGE_PREF` pattern), keeping seed + mutation streams byte-identical.

`MATURITY_AGE` is `costKey: null` — its cost is the opportunity cost of delayed breeding. `SENESCENCE_AGE`
is costed (`senescenceAgeCost`): a longer-lived body pays basal upkeep for durability above center
(disposable-soma / antagonistic-pleiotropy), so longevity is a real tradeoff → balanced polymorphism, not
unbounded upward drift.

### Effects (all gated on `cfg.ageStages`)

1. **Senescence tax** — `economy.metabolize`, at the upkeep line (`economy.ts:248`,
   `const upkeep = basalCost * efficiency + geneUpkeep(...)`). New:
   ```
   let basal = basalCost;
   if (cfg.ageStages && cfg.senescenceRate > 0) {
     const over = age[i] - scalarGenes[sg + ScalarGene.SENESCENCE_AGE];
     if (over > 0) basal = basalCost * (1 + cfg.senescenceRate * over);
   }
   const upkeep = basal * efficiency + geneUpkeep(scalarGenes, i, cfg);
   ```
   `age` is already destructured (`economy.ts:155`). An elder's basal climbs linearly with
   `age − SENESCENCE_AGE`; energy bleeds; the **existing** `cullDead` reaps it = death of old age. No new
   death path. `senescenceRate` doubles as a senescence-only tuning / ablation knob (0 → no tax even with
   `ageStages` on).

2. **Maturity gate** — `economy.reproduce`. Add `age` to the store destructure (`economy.ts:345`). Place the
   gate at the **top of the per-parent body** (before the `breedCooldown` decrement at `economy.ts:354` and
   the satiated check at `:359` — all three are `continue`s **before** `alloc`/RNG, so a juvenile skip
   consumes no RNG; a juvenile's `breedCooldownLeft` is 0, so order vs. the cooldown is immaterial):
   ```
   if (cfg.ageStages && age[p] < scalarGenes[p*SCALAR_GENE_COUNT + ScalarGene.MATURITY_AGE]) continue;
   ```

3. **Longevity cost** — `geneUpkeep` (genome.ts). The existing loop already sums
   `max(0, gene − center)·costCoeff` over costed genes. `SENESCENCE_AGE` with `costKey: 'senescenceAgeCost'`
   joins it automatically. When off, gene pinned at center → `over = 0` → contributes nothing → byte-identical.

### New config knobs (defaultConfig — all OFF/inert; added before `...overrides`)
```
ageStages: false,          // master switch
senescenceRate: 0.01,      // elder basal-tax slope per tick past SENESCENCE_AGE (only read when ageStages)
maturityAge: 100,          // MATURITY_AGE gene center (≈ under the first-breed median → it bites)
senescenceAge: 400,        // SENESCENCE_AGE gene center (≈ mean lifespan → only the long tail gets capped)
senescenceAgeCost: 0.0005, // basal upkeep per unit SENESCENCE_AGE above center (longevity tradeoff)
```
Interface fields added after `foodGateThreshold` (`config.ts:442`), in a new "Age / life stages" section.
Rate/cost/centers only matter once `ageStages` is on — tuned via the life-history probe after wiring.

## Determinism

- No new **store** fields (genes live in the existing `scalarGenes` array, which `stateHash()` does **not**
  hash). `SCALAR_GENE_COUNT` bump auto-resizes `store.scalarGenes`. Audited: no code hardcodes the count;
  every consumer (core + observability + headless) uses `SCALAR_GENE_COUNT` / the `ScalarGene` enum, and no
  test asserts a fixed gene count.
- **OFF path:** no extra reads/writes/RNG draws → golden hash `a32e9375` holds.
- **ON path:** 2 tail gene draws per seed + per birth shift the stream → diverges (required & asserted).

## Tests (TDD — failing first)

**Determinism (`world.test.ts`):**
- `ageStages` OFF byte-identical to default; ON perturbs (mirrors counterBite/hungerSense/phero gate tests).
- `ageStages` OFF: `MATURITY_AGE`/`SENESCENCE_AGE` stay exactly at their centers after a long run (no draw).

**Behavior (`economy.test.ts`):**
- Senescence: an elder (`age` past `SENESCENCE_AGE`) pays strictly more basal than an identical young adult;
  `senescenceRate 0` or `ageStages false` → no extra drain.
- Maturity: a juvenile (`age < MATURITY_AGE`) at/above its satiated bar does **not** breed; at/after maturity
  it does. Off → breeds as today (byte-identical).
- Longevity cost: `SENESCENCE_AGE` above center adds exactly `over·senescenceAgeCost` basal upkeep; at/below
  center adds nothing.

## Demo opt-in — DONE (commit 1fe85bb)
`ageStages: true` is live in `src/app/main.ts` + `life-history.ts` `DEMO_OVERRIDES`. Measured under the full
demo config (basalCost 0.08 + walls/flow/pheromones/2-channel/parcels, 4000t seed1): immortal tail capped
(max lifespan 3832→2455), pop thrives (7079, 54% bred), genes bounded (SENESCENCE_AGE evolves up to ~480 under
the longer-lived demo regime — still cost-held, not railed; MATURITY_AGE ~90). senescenceRate left 0.01 — a
live knob to crank for a sharper elder die-off.

## Known non-invariant (acceptable)
Nothing enforces `MATURITY_AGE < SENESCENCE_AGE`. A mutant could in principle have senescence begin before
maturity (a juvenile taxed toward death before it can breed) — but that is a biologically dead-end genotype
selection removes, not a crash or determinism break. Centers (100 vs 400) + the longevity cost keep the
realized population well-ordered (probe: maturity ~90, senescence ~370–480). Left unenforced to avoid coupling
two gene clamps; revisit only if a probe ever shows the pathological overlap actually occurring.

## Out of scope (later increments)
- Juvenile metabolic discount (a real "grow-cheap-then-breed" strategy) — add only if the probe shows
  `MATURITY_AGE` collapsing to 0 and the juvenile stage being invisible.
- Eat-rate-by-age coupling.

## Verification
- Full suite green (`NODE_OPTIONS=--expose-gc npx vitest run`), `tsc --noEmit`, `eslint .`.
- Life-history probe with `--ageStages=true`: lifespan distribution compresses (long tail capped),
  `SENESCENCE_AGE` drift bounded (not railed to max), births don't crash to extinction.
