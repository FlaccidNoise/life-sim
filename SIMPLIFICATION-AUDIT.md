# Simplification Audit — life-sim

**Date:** 2026-06-19
**Lens:** system coherence & simplification (NOT correctness — see `AUDIT_REPORT.md` for that pass, which found the code LOW-risk/healthy). The question here: *does each system earn its complexity by contributing to emergent ecological/biological dynamics, or is it dead weight / redundant / fighting another system?*
**Method:** (1) a 9-agent coherence workflow that mapped **75 systems** and classified each (1.2M tokens); (2) an **empirical ablation harness** mirroring the exact live demo (`src/app/main.ts`, 8192² archipelago) that toggles each system off and measures population trajectories; (3) an independent headless mirror built by the conflict analyst. Findings below are the ones verified by **direct measurement**, not agent code-reasoning alone.

---

## TL;DR

The owner's instinct is right — but the cause is sharper than "too many systems damping each other."

1. **The live demo doesn't reach a damped equilibrium. It collapses.** On every seed (3/7/42), the autonomous 8192² world dies: **plants extinct by tick ~350-500, foragers crash ~105 → ~8, predators freeze at their seeded 20 and never move again.** (There is no auto-respawn — `main.ts`'s only repopulation is user shift-click. The owner is watching a corpse.)
2. **The "pile of dampers" hypothesis was tested and REFUTED.** Removing the dampers (predation stack, strong graze-tether, satiation/patrol/roam) gives a **byte-identical collapse**. The dampers aren't the binding constraint — *starvation* is.
3. **Root cause = two independent failures that stack:**
   - **(A) The producer layer is killed by `driftAmplitude 48`.** Drifting light strands the *anchored* sessile plants in the dark. This is the dominant plant-killer — verified: drift-off, plants thrive to 5460 *with* the full 5-forager grazing load (so grazing pressure is **not** the primary culprit, contrary to first reads).
   - **(B) The animal layer never reproduces.** Even with plants thriving (drift off), foragers plateau just under the maternal-provisioning breeding bar (~255) and predators sit at their seed — **0 births across 12k ticks, every population flat (cv 0.00)**. No feature toggle unlocks it; it needs economy rework.
   Result: producers collapse (A) → animals were already non-breeding (B) → predators are a frozen, genetically-sealed cohort (PREDATOR isn't even in the mutation palette). The entire evolution/lineage/species apparatus is **dead instrumentation on a non-reproducing population**.
4. **The breathing you want already exists, latently.** With zero grazers, the producer layer **oscillates on its own** (PHOTO 60→291→189→292→235→260 over 3k ticks — real boom-bust). It is being snuffed out instantly by overwhelming grazing + drift before it can propagate up the chain.
5. **~40% of the machinery is inert in the world you watch:** of 75 systems, **29 are inert**, 14 marginal, only 30 load-bearing.

**Highest-leverage move is NOT to add stabilizers — it's to let the food web survive long enough to reproduce, then delete the inert systems.**

---

## The causal chain (measured)

```
(A) PRODUCER COLLAPSE          driftAmplitude 48 drifts the light
                               → anchored sessile plants stranded in dark
                               → PHOTO extinct ~t350-500   (drift-off: plants thrive 5460)

(B) ANIMAL LAYER NEVER BREEDS  forager plateaus just under the ~255 provisioning bar
    (independent of A — holds   (grazeSatiation 50×6≈300, but upkeep + 5%/hop transfer leak
     even when plants thrive)    claw it back) → 0 births, populations flat (cv 0.00)
                               + predators can't catch sparse prey, basal 0.0008 too low to
                                 starve them, PREDATOR absent from mutation palette
                               → predators frozen @ seeded 20 forever

(A)+(B) ⇒ producers die, animals were already sterile
        ⇒ genome / mutation / lineage / species = dead instrumentation (maxGeneration 0)
```

### Evidence table (all from direct ablation runs)

| Experiment | Result | Conclusion |
|---|---|---|
| Baseline live demo, seeds 3/7/42 | PLANT@400-500; foragers 105→8; predators flat 20 (cv 0) | autonomous **collapse**, not equilibrium |
| `driftAmplitude 48 → 0` | plants **0 → 5460** | **drift is a catastrophic plant-killer** (refutes the "drift inert" note in memory + 2 workflow agents) |
| `no-sight` / `no-hearing` / `smell-only` | **byte-identical** to baseline (both collapsed & thriving regimes) | sight & hearing **completely inert** |
| sensor **census**, 6k ticks | `SMELL 306→40, SIGHT 0, HEARING 0` | no creature **ever** uses sight/hearing |
| `predDigestRate 0` (predation fully off) | **byte-identical** to baseline (verified on my own harness) | the entire 6-knob predation stack is dynamically inert |
| `transferRate 0` (bond energy transfer off) | foragers **70 → 97** (+39%) in the living (drift-off) world | transfer is a harmful energy leak — a clean win to remove, but modest (the workflow's "~10×" was a drift-on collapsed-regime artifact; corrected here) |
| `fewer-foragers` (5 → 2 / island) | foragers flat **32** (cv 0), no births | reducing grazing pressure alone does **not** unlock breeding — just fewer foragers |
| dampers off (graze-stiffness 20→2 + satiation/patrol/roam off) | byte-identical collapse | **damper hypothesis refuted** |
| plants alone, **zero grazers** | PHOTO oscillates 60→291→189→292→235→260 | **the producer layer already breathes** |
| **every** drift-off ablation (env, senses, predation, transfer, grazing) | foragers + predators **flat to the integer, cv 0.00, zero births** | **the breeding economy is the binding constraint** — no feature toggle unlocks reproduction |

> Note on the metric: a sessile plant base is also an `organism` (`world.ts:411`), so a naive "non-carnivore organism = forager" count is ~93% plants. The corrected count (creature = has a brain/body cell) is used above.

---

## Prioritized plan

### TIER 1 — Fix the collapse (this is the whole ballgame; everything else is meaningless until the food web survives)

Two independent failures stack here: **(A) the producer layer collapses** (drift) and **(B) the animal layer never reproduces** (breeding economy). A is a near-one-line fix; B needs real economy work. Both must land.

| # | Change | Why | Evidence |
|---|---|---|---|
| **T1.1** | **Fix or remove drift** (`driftAmplitude 48` → 0, or stop drifting the light under `sessilePlants`) | drifting light strands the *anchored* plants in the dark — it directly fights the sessile-plant model. **This is the #1 plant-killer**, not grazing: drift-off, plants thrive to 5460 *with* the full 5-forager grazing load. | drift-off → plants **0 → 5460**; corrects the "grazing kills plants" attribution (that was measured with drift on) |
| **T1.2** | **Rework the forager breeding economy so births actually fire.** The gate (`reproduction.ts`) needs aggregate ≥ `reproThreshold(150)` **and** the parent to provision a full offspring body (`offspringCost ≈ 6·FORAGER_INIT_E = 240`) + keep `reproParentFloor(15)` = a real bar of **~255**. With `grazeSatiation 50` capping each cell at 50 (×6 ≈ 300) and upkeep + transfer bleeding it back down, foragers plateau just under the bar → **0 births**. Investigate the satiation-vs-bar-vs-upkeep interaction (a focused `diagnose`). | **this is THE unlock for the entire evolution/lineage/species apparatus** — it is dead instrumentation until births fire | every drift-off ablation is flat (cv 0.00, F frozen at seed survivors); workflow mirror measured cumBirths=0 / maxGeneration=0 over 12k ticks. **No feature toggle I tested unlocked a single birth.** |
| **T1.3** | **Remove intra-organism energy transfer** (`transferRate 0.1`) | a 5%/hop leak from the eating mouth into siblings that aggregate-death already protects — it suppresses the breeding bar for no benefit (the M5-era rationale predates aggregate economics) | `transferRate 0` → foragers 70 → 97 (+39%); clean win |

**Acceptance test:** organism births > 0 and `maxGeneration` climbs; plants spore; populations **oscillate (cv ≫ 0)** instead of flatlining. Validate at **8192²** (the shipped scale) — not the 2048² the locked values were tuned at. Note: reducing grazing pressure (fewer foragers/island) is **not** needed once drift is fixed — it only changes the headcount, not the dynamics (tested: 2/island → flat F32).

### TIER 2 — Make the trophic levels genetically open (so the evolution apparatus stops being dead instrumentation)
- **Add `PREDATOR` (and reconsider `MOTILE`) to the mutation palette** (`mutate.ts:6-12`). Today no forager can ever evolve into a predator — the carnivore flag requires a *seeded* PREDATOR mouth, so the 3rd trophic level is a sealed, dying cohort. **Safe addition** — `changeType`/`addGene` are gated behind rates that are 0 in `defaultConfig`, so every existing test stays byte-identical; only the demo (rates > 0) sees new behavior.

### TIER 3 — Delete inert systems (pure surface reduction; byte-identical to validated runs)
| System | Action | Note |
|---|---|---|
| **Adhesion** (`adhesion.ts`, `adhesionStrength/Range`, UI slider) | **delete** | strength 0 everywhere; kernel early-returns; never built into a feature. Remove `adhesion.test.ts` + `config.test.ts:118-119` + `controls.ts:77` in tandem. |
| **Water currents** (`current-field.ts`, `current-force.ts`, overlay, Shift+U) | **delete or default-off** | `currentStrength 0` in default & demo. Remove `env-features.test.ts:260-303`, `current-*.test.ts`, Shift+U handler in tandem. |
| **Dead exported type aliases** | **delete** | `PaletteKey`, `*Value` aliases — zero references. |
| **Stale headless probes** (9 of 13, ~3108 LOC) | **delete / archive** | none wired to the test gate; tuned at the unvalidated 2048² scale or completed milestones. Keep one maintained ecology gate (re-pointed at 8192²). |
| **Sight / hearing / occlusion / glow / noise** in the demo | **default-off until reworked** | inert + per-tick cost. See "Sight & hearing" below. |

### TIER 4 — Merge redundant systems (fewer concepts, same behavior)
| Cluster | Members | Merge |
|---|---|---|
| **Latch-feed** | predation-latch + graze-latch + tether + (legacy drain as scavenge) | one parameterized `latchFeed(eaterType, targetPredicate, rate, range)` helper — they share `latchPrey/latchCell`/`applyLatchTether` verbatim (~120 duplicated LOC). Keep legacy overlap **only** as the renamed MEAT-scavenge fallback. |
| **Anti-camping movement** | satiated-roam + patrol + exploreWander + cruiseThrust | one thrust-floor+wander term keyed on `energy ≥ grazeSatiation`. Deletes `act.ts` + `cruiseThrust`. |
| **Light-multiplier env** | day/night + season | one term; season is just a slow envelope on the day/night sinusoid. Drop `seasonLength/seasonDepth`. Fix the false "season modulates temperature" comments in `cycle.ts:9-12`. |
| **Density caps** | `crowdDivideCap` + `plantBaseDensityCap` | one `densityGridEnabled` flag + one cap. ⚠ **Do not just sentinel `crowdDivideCap`** — under `sessilePlants` its only live job is enabling `fillDensity`, which feeds `plantBaseDensityCap`; sentinel-ing it silently packs pockets into a green wall (no test catches this). |
| **Empty ScalarField subclasses** | `FoodField/ToxinField/GlowField/NoiseField` | instantiate `ScalarField` directly — the subclasses add zero behavior. (Keep the field *instances* — food/prey/pred must diffuse independently.) |

---

## On sight & hearing specifically (the owner's direct question)

**They currently have zero effect, proven two ways:** census shows `SIGHT 0 / HEARING 0` across 6k ticks; `no-sight`/`no-hearing` ablations are byte-identical to baseline. **Three reasons:**
1. **Never seeded.** The demo seeds only `buildForagerGenome` / `buildNightForagerGenome` / `buildToxinAvoiderGenome` / `buildPredatorGenome` (`main.ts:279`, `:301`) — all **SMELL-only**. The genomes that wire sight/hearing — `buildSightedForagerGenome` (`:237`), `buildFleeingPreyGenome` (`:306`), `buildHearingPredatorGenome` (`:409`) — are **never imported into `main.ts`**.
2. **Mutation never establishes them** (`mutationSenseSourceRate 0.02` → census stays 0).
3. **Redundant by design even if present** — a SIGHT eye on `sightTarget FOOD` steers the same way as the SMELL gradient → neutral → the decision log's own "net eye-drag" (eyes-open 3.26 vs blind 23.72).

**To make them earn their keep (all three are needed):**
1. **Differentiate the modalities** so each carries unique information: SMELL = food gradient; **SIGHT = ranged, directional detection of PREY/PREDATORS** (something a diffuse scent does badly); **HEARING = motion detection** (the NoiseField is movement-deposited → senses *active* creatures). Otherwise they stay redundant with smell.
2. **Seed creatures that use them** (the builders exist) so they're in the gene pool.
3. **Fix the ecology first (Tier 1)** — senses can't be selected for when nothing reproduces. This is the precondition; senses are downstream of the broken economy.

Until then, keeping sight/hearing/occlusion ON in the demo is paying per-tick cost + code complexity for zero ecological return — **default them off** and treat them as a research feature to revisit after Tier 1.

---

## What's healthy (keep)
Photosynthesis, passive digestion, bond springs, organism aggregates/atomic death, the developmental genome + neural net, the sessile chain-plant lifecycle *mechanism* (it works in isolation — it just gets overgrazed), and the determinism contract. The code is well-built; the problem is **calibration and surface area**, not correctness.

## Reproduction
Ablation harness: `src/headless/ablation-probe.ts` (mirrors `main.ts` 8192² config + 20-community seeding; toggles one system off per run; reports trajectory + a breathing metric (cv/oscillation) + a `census` mode for sensor modalities). Run e.g. `pnpm exec tsx src/headless/ablation-probe.ts all 6000 3 driftoff` or `... census 6000 3 driftoff`.
