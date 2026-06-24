# Sexual reproduction — speciation measurement results (2026-06-23)

Companion to `2026-06-23-sexual-reproduction-speciation-design.md`. Task 9: measure whether
compatibility-gated sexual reproduction + display/preference genes produce **emergent speciation**,
and document the density-dependence flagged in Task 8.

Only source change this task: `sexualReproduction: true` added to `DEMO_OVERRIDES` in
`src/headless/life-history.ts:174` (mirrors the live demo). Everything else is measurement.

Runs (all `--demo`, 6000 ticks):
- Workable density: `life-history.ts 6000 1-3 --demo --worldWidth=2048 --worldHeight=2048`
- Default scale: `life-history.ts 6000 1-2 --demo` (8192²)
- Feasibility re-confirm: `mate-encounter-probe.ts 4000 1-2 --demo`

Gene indices used: `DIET=10`, `DISPLAY=24`, `PREFERENCE=25` (`src/core/genome.ts:49,86,87`).
`geneticDistance()` weights DISPLAY/PREFERENCE at 0 (sexual axes ≠ species axes) and DIET at
`mateDietWeight=5` (`src/core/genome.ts:349,353`). Shipped knobs: `mateContactRange=12`,
`mateCompatThreshold=0.6` (`src/core/config.ts:553-554`).

---

## Headline: does speciation emerge? **No.** The machinery works; the ecology funnels to monoculture.

At workable density the population thrives and lineages run deep, but reproductively it collapses to a
**single dominant grazer dynasty** every seed. The sexual machinery is sound (births healthy, diet
isolation perfectly enforced, the ornament drifts coherently), but there is **no lineage split into
multiple coexisting species** — it is competitive exclusion (Gause), the same single-resource
monoculture documented in memory `diversity-levers`.

---

## 1. Workable density (2048²) — population is alive and breeding hard

Cross-seed headline (`life-histories-multiseed.md`, 3 seeds):

```
seed  state    pop   births  maxGen  bred%   topDyn  share%  top1:2
   1  ALIVE    4143    6988      22    46%    5535    79%    3.9
   2  ALIVE    2601    3578      18    43%    3567   100%  509.6
   3  EXTINCT     0       3       1     3%       1    33%    1.0
```

- 2/3 seeds thrive (pop 4143 / 2601), 1 seed (3) stillborn (founders never reached a breeding cluster).
- Births healthy where alive: 6988 / 3578. onBirth validation Δ = 0 (ground-truth lineage is exact).
- Generation depth advances to **gen 22 / gen 18** — deep, sustained lineages, not a flicker.

So the feasibility claim from Task 8 holds at density: the sexual path sustains a breeding population.

## 2. Lineage — NOT a species split; one dynasty owns the world

Seed 1 (`life-histories-seed1.md`): **90 founders seeded, only 3 left descendants.** Dynasty sizes:

```
51:1 (grazer): 5535 descendants  (79% of births)
23:1 (grazer): 1433 descendants  (20%)
39:1 (grazer):   20 descendants
```

Seed 2: **90 founders, 5 left descendants, but one owns 3567/3578 = 100%** (`top1:2 = 509.6`).

Monopoly verdict from the tool: **2/3 seeds had a single dynasty owning ≥50% of births → monopoly is
TYPICAL, not a fluke.** This is the opposite of speciation: instead of multiple reproductively-isolated
clusters persisting, the lineages converge to one (seed 2) or two (seed 1) grazer dynasties. There is no
second species — the runner-up dynasty in seed 1 (20%) is the same diet class, differentiated by drift,
not an isolated species (it shares recent ancestry with the dominant line at the founder layer only).

## 3. Reproductive isolation — enforced, but trivially (predators never bred)

Parent-link diet-class crossing check (CSV, grouping DIET<0.5 = grazer / ≥0.5 = predator):

```
seed 1:  same-class parent links 6988 · CROSS-class (G↔P) 0 · founders 90
seed 2:  same-class parent links 3578 · CROSS-class (G↔P) 0 · founders 90
```

**Zero predator×grazer interbreeding** in 10,566 parent links — the compatibility gate (DIET weighted ×5)
does enforce isolation. But the diet histogram shows why it is trivial: the only diet≥0.5 individuals are
the **14 founder predators** (per seed) who left **no descendants** — the whole bred population is
grazers (diet→0):

```
diet bins 0.0..1.0:  seed1: 6467 585 12 0 0 0 0 14 0 0   (the 14 are unbred founder predators)
```

This is the pre-existing predator-extinction trait of this engine (memory `predation-engine-ceiling`):
predators don't reproduce, so the predator/grazer isolation case is **real but untestable as emergent
speciation** — there was never a second breeding species to keep isolated. The emergent "clusters" are
grazer subpopulations differentiated by other genes, and (per §2) their lineages collapse to one dynasty
rather than staying split.

## 4. The ornament (DISPLAY) drifts coherently; PREFERENCE does NOT track it

DISPLAY (the sexual-selection ornament) shifts the same direction in both live seeds and across
generation depth — a genuine, consistent ornament drift, not noise:

```
DISPLAY  founder mean 0.51 → alive-pop mean 0.62 (seed1) / 0.68 (seed2)   [cross-seed agree: ↑↑]
         alive-pop clusters tightly in bins 5–6 (of 10), not spread
```

But **PREFERENCE does not co-evolve with DISPLAY**: within-individual corr(DISPLAY, PREFERENCE) among
born creatures = **−0.05 (seed1) / +0.09 (seed2)** — effectively zero. So there is **no Fisherian runaway
coupling**: the ornament drifts (likely a weak directional/founder-drift effect since DISPLAY carries no
upkeep cost, `genome.ts:194`), but mate preference is not tracking it to drive divergence. The ornament is
present and propagating but is not (yet) an engine of reproductive isolation between subpopulations.

---

## 5. 8192² (default demo scale) — density collapse, but a coin-flip not a guaranteed death

```
seed  state    pop   births  maxGen  bred%
   1  EXTINCT     0       0       0     0%      ← bled out: 0 births, total collapse
   2  ALIVE     867    2041      22    52%      ← a dense founder cluster caught and thrived
```

- Survived: **1/2 seeds.** Mean final pop 434 [0–867], mean births 1021 [0–2041].
- The collapse mechanism from Task 8 is confirmed in seed 1: breeding-ready seekers are spread ~1000u
  apart while the mate-contact scan only reaches `mateContactRange=12u`, so compatible seekers never meet
  → 0 births → extinction.
- But it is **not deterministic death**: seed 2 happened to seed a dense-enough founder cluster that
  reached self-sustaining contact and ran to gen 22 / 2041 births. So at 8192² the sexual demo is a
  **coin-flip on founding density**, not a guaranteed bleed-out — honest correction to the "expect
  near-total collapse" prior. When it survives it is, again, a single 100%-share dynasty (monoculture).

## 6. Feasibility probe re-confirm (mate-encounter-probe, --demo)

The compatible-encounter sweep matches the liveness guardrail: at the shipped `mateContactRange=12`
(between the 8 and 16 columns) and `mateCompatThreshold=0.6` (between the 0.5 and 0.75 rows) the
compatible-encounter rate is in the low single-digit-percent band (≈0–4% at R≤16), rising only at
R=32/64. Encounters are the binding constraint at 8192², exactly as §5 shows — contact range (density),
not the compatibility threshold, gates births.

---

## Conclusion — density-dependence and the planned remedy

1. **Speciation does not emerge.** The sexual machinery is correct and deterministic — births are healthy,
   the compatibility gate enforces zero cross-diet breeding, DISPLAY drifts coherently — but at every
   workable seed the population collapses to a **1–2 dynasty grazer monoculture**. There is no split into
   multiple coexisting reproductively-isolated species. Two reasons: (a) predators never breed in this
   engine, so there is no second species to isolate (`predation-engine-ceiling`); (b) the single food
   regime drives competitive exclusion to one dynasty (`diversity-levers`). Compatibility-gated mating is
   a **gate**, not a **diversifier** — it can keep species apart but cannot create them against a
   monoculture-forcing ecology.

2. **The result is strongly density-dependent.** At 2048² breeding is sustained (births 3578–6988, gen 22);
   at the default 8192² it is a coin-flip (1/2 seeds: 0 births vs 2041) because seeker spacing (~1000u) far
   exceeds `mateContactRange=12u`. Density — not the compatibility threshold — is the gate (probe §6).

3. **The planned 8192² remedy is the kin-scent mate field** (the other session's 4-class scent build,
   `…-speciation-design.md:40,137,203`): the SEEKING state machine steers up the matching scent gradient
   instead of relying on a 12u contact scan, closing the seeker-spacing gap at scale. That is a future
   build behind the existing modular seam; it does not change the compatibility gate or crossover.

**Honest bottom line:** the feature *works* — deterministic, gated, ornamented — but on its own it does
**not** produce emergent speciation at any tested density. To get real species splits you need a
diversifying ecology (multi-resource niches per `diversity-levers`) and a breeding predator line first;
the kin-scent field is needed to make even the single-species sexual path viable at 8192².
