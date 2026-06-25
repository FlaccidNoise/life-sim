# Biogeographic Demes — Living-World Redesign

**Date:** 2026-06-25
**Status:** Approved (Approach A; B staged behind a measurement gate)

## Problem

The live demo is boring: over ~73k ticks it settles into a stagnant near-monoculture of
efficient herbivore grazers. Predators never establish, no visible chases, no niches, no
regional divergence. Diet "diversity" (μ~0.25, σ~0.16) is omnivory drift, not a real
grazer/predator split.

## Root cause

Density, not world size. At 8192² with population smeared thin, nearest-neighbor distance
(~75u) ≫ bite range (16u), so predation is **geometrically impossible** regardless of
economy tuning. Every prior predator-revival lever fought that geometry and lost
(high-variance, crashed seeds). One effective food axis → Gause exclusion → race to
grazer minimalism.

## Vision (owner)

Grand scale BETWEEN pockets, intense density WITHIN them. Concentrate population into
deep, near-isolated demes. Inside a dense pocket NND collapses below bite range →
predation/niches become possible. Between pockets, isolation → divergent histories.
Allopatric speciation by biogeography.

**Success (priority order):**
1. Visible predator/prey chases — a real trophic layer that persists across long runs.
2. Distinct species per region — pan the map, region A ≠ region B, each with its own history.
3. Niche variety within a pocket — coexisting strategies that don't collapse to one winner past 20k.

Boom/bust + invasion = bonus, not required. Favor a SUSTAINED interesting world over a
dramatic-but-fragile one → keep variance low.

**Isolation model:** metapopulation with RARE migration (flow current is the dispersal
vector; deadWaterCost makes most crossings fatal, a few succeed → colony/invasion/rescue).

## Unifying insight

A working LOCAL predation layer delivers all three goals at once: it IS the chase (1), it
adds non-competing trophic roles so within-pocket variety needs no anti-Gause trick (3),
and per-region predator/prey balances diverge (2). Predation was blocked ONLY by density,
which concentration now fixes.

## Approach A — structure only (zero new engine code)

All changes are `livingWorldOverrides` knobs in `src/app/living-world-config.ts`. No edits
to economy.ts / world.ts / brain.ts. Determinism invariant unchanged (same config+seed →
same run).

| Lever | From | To (start) | Why |
|---|---|---|---|
| `foodPatchRichness` | 1 | ~3 | deep reservoirs → dense prey cluster per pocket |
| `foodMaxFertility` | 1 | ~3 (match richness) | let pockets exceed K=cap (richness needs the clamp raised) |
| `deadWaterCost` | 0 | >0 | real isolation; crossing open water is risky |
| `fertilityDriftRate` | 0.5 | **0** | fixed demes build regional history (owner-approved) |
| `foodPatchRichnessVar` | 0 | >0 | deep predator-havens vs shallow grazer-refuges |
| `foodPocketChannelMode` | 1 | 1 (keep) | distinct islands grow distinct resources |
| `predatorSeedClusters` | 0 | N | found hunters into the deepest pockets |
| `predatorSizeBoost` | 0 | ~0.85 | seed hunters big enough to catch prey (huntSizeRatio) |
| `herbivoryExp` | 1.3 | ~0.7 | lean predators on hunting (now that density supports it) |
| `predationGain` | 1.8 | ~3 | meat pays through sparse stretches |
| `initialPopulation` / `foodPatchCount` | 1000 / 24 | tune | concentrate, don't smear |

Exact values are tuning outputs, not commitments. The predator bundle that was OFF
(high-variance) is the hypothesis: at high LOCAL density it should be low-variance.

### Resolved tension
Killing pocket drift removes the current "chase the moving food" dynamism. Bet: dense
local predation replaces drift as the source of motion/interest. Fallback: re-add slow
drift only if pockets measurably stagnate without it.

## Measurement gate (before any B work)

Headless, ≥4 seeds, ≥50k ticks each, one >100k confirmation. Reuse existing probes
(`long-run.ts`, `predator-probe.ts`, `gene-census.ts`, `diversity-sweep.ts`); add metrics
only where missing.

1. **Predation revived?** local NND inside a deep pocket vs `biteRange`; sustained
   `predEncounter` > ~0.1 (was ≤0.06).
2. **Regions diverge?** between-pocket diet/size SD (distinct-species signal).
3. **Gause collapse?** within-pocket niche count persisting past 20k. **This is the
   trigger for B.**
4. Liveness across all seeds; no systematic extinction.

Then visual confirmation in the browser, together.

## Approach B — apostatic predation (staged, only if gate #3 fails)

If within-pocket niches still Gause-collapse: predators bias their target toward the
locally-COMMON prey signature via the existing 4-channel scent field (which already
carries prey identity per cell). Frequency-dependent → rare types get an edge → niches
persist. Emergent (reads a physical field, NOT a frequency/fitness census → inside the
cardinal "no fitness/score/lineage read into survival/repro/death/movement" rule). Reuses
existing scent machinery. One mechanism, gated by its own off-switch.

## Non-goals

- No world-size shrink (owner wants it BIGGER if anything).
- No corridor/stepping-stone machinery (Approach C) unless A+B prove insufficient.
- No new economy hacks; density is the lever, not energy printers.

## Invariants

- Determinism: same (config, seed) → same run. Only invariant (golden-hash retired).
- No fitness/score/lineage read into any survival/repro/death/movement decision.
- `bodySense=false` (crashes the demo).
- New B mechanism ships with an off-switch; OFF = byte-identical.
