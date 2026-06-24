# Vision Revival via Clustered Sight-Only Parcels

**Date:** 2026-06-23
**Branch:** feat/vision-revival (isolated worktree off feat/living-world @ 53fa3cd)
**Beads:** life-sim-d1kf
**Status:** Approved — implementing

## Goal

Make at least one of the three functionally-dead vision genes evolve **measurably above
its center / above a feature-OFF baseline** at the 8192² world scale, proven by a gene
census (never asserted). Target gene: **VISION_RANGE** (ScalarGene idx 12, range [0,256],
center 140, cost `visionRangeCost` 0.002/unit above center).

## Why the genes are dead (grounded in code)

Six-reader mechanics map (file:line cited) established three facts that reshape the plan:

1. **The sight brain-weights are NON-zero at birth.** `FOUNDER_BRAIN` seeds
   `SIGHT_LAT_TURN=1.0`, `SIGHT_FWD_THRUST=1.2` (`genome.ts:320-322`). The doc comment
   claiming "seed at 0" is drift. So the machinery to *act* on sight exists from birth —
   the bottleneck is purely **encounter rate / payoff**, not brain co-evolution.

2. **VISION_ACUITY is degenerate with a free gene.** Acuity is a linear multiplier on the
   sight vector (`w = pull*(1-d/range)*acuity`, `sense.ts:266`); the brain's `SIGHT_*`
   weights *also* scale it and are **not costed**. Selection always takes gain from the
   free weight, so acuity sits at/below center. Acuity is unrevivable by economic tuning —
   excluded from this increment.

3. **RANGE and FOV are non-degenerate.** No brain weight can let you see outside your scan
   radius (range) or cone (FOV). RANGE is the cleanest target: nearly free (0.002), and its
   benefit is gated only by whether seeing far ever pays.

**Root cause:** `geneUpkeep` charges `max(0, gene−center)·cost` (`genome.ts:255`) — so the
center is the free baseline and below-center is free. At NND≈60u with sight-only parcels
spawning **uniformly** (~67 alive over 67M sq-units ⇒ ~1000u spacing), the marginal
"see-farther" annulus (140→256u) contains the same vanishing parcel density as everywhere,
so extra range never pays back even 0.002/tick against the random-walk-down. Uniform spawn =
**zero local-density variance** = no reason to see far. (Prior attempt #1.) Leaning
smell-food (#2) impoverished the world and is off the table.

## Approach

### Core change — clustered parcel spawn (`parcels.ts`)

Concentrate the same parcel budget into a few hotspots so a creature's see-farther annulus
*sometimes overlaps a jackpot* a short-range creature misses. A cluster of N parcels is a
strong far-beacon (summed weak-pulls) that defeats the `(1-d/range)` falloff, and also lifts
the parcel signal above the creature-pull noise (chase/flee/cohesion) that otherwise burns
move-energy and pushes range down.

- New `Config` fields, all OFF/no-op by default (byte-identical to golden):
  - `parcelClustering: boolean = false`
  - `parcelClusterCount: number = 8`
  - `parcelClusterRadius: number = 120` (disk radius of parcels about a cluster center)
- Add `clusterX[]/clusterY[]` to the Parcels pool, generated once from the existing
  **`parcelRng` fork** (never `world.rng`) at construction/reset — **only when clustering on**.
- `spawn()`: when clustering on, draw cluster index + uniform-in-disk offset (3 `parcelRng`
  draws), toroidal-wrap. When off, the spawn path is byte-for-byte the current uniform 2-draw
  path — so clustering-OFF reproduces today's demo exactly (clean ablation).
- Parcels still drift/decay unchanged; a static cluster becomes a "spring" of parcels
  drifting downstream. Cluster *drift* deferred to v2.

### Co-knobs (demo layer only — no golden impact)

Swept in the census, winners shipped in `living-world-config.ts`:
- **A — lower the demo `visionRange` center.** Center 140 gifts every creature far sight for
  free; the gene has nowhere rewarding to climb and drifts down to ~95. A lower center
  (sweep 40–100) creates a climbable gradient. Demo-only ⇒ golden byte-identical.
- **B — raise `parcelAppeal`** (default 1; sweep 2–4) so the parcel beacon outshouts the
  creature-pull noise.

### Shared demo config

`main.ts`'s inline `defaultConfig({...})` overrides are extracted into an exported
`livingWorldOverrides: Partial<Config>` (`src/app/living-world-config.ts`); `main.ts` and the
census probe both import it. Prevents demo/probe drift.

### Measurement — `src/headless/vision-census.ts`

The existing `gene-variance.ts` reports IQR/spread, not mean, and has no ON/OFF hook. New
probe: takes a `Partial<Config>`, builds `World(defaultConfig({...livingWorldOverrides,
...overrides, seed}))`, runs 2 seeds × ~8k ticks, prints **mean** of genes 12–15 + live
population. Run paired clustering ON vs OFF, plus the A/B sweep.

## Determinism contract

Built in an isolated worktree (`feat/vision-revival` off `53fa3cd`) so it is NOT entangled
with the concurrent "smarter-brains" work in the main checkout. In this clean tree the legacy
golden is intact and MUST stay so at the OFF default:
- `gate-check.ts`: ch1 @200=`b2620ed6` @400=`a1e4388b`; ch2 @200=`c7700033` @400=`e69daa13`
- `world.test.ts` frozen golden = `a32e9375`; full vitest suite green.

All new randomness is `parcelRng`-forked and gated behind `parcelClustering`. Golden runs
parcels-off ⇒ the Parcels pool is never allocated ⇒ none of this executes ⇒ byte-identical
(verified: with my fields present, the golden hashes reproduce exactly). Per the new relative
pattern, a `world.test.ts` case asserts `parcelClustering` OFF (with parcels on) == the
parcels-on baseline and ON != baseline, proving the feature is wired + ablatable.

## Success criterion (fixed up front)

VISION_RANGE mean with clustering **ON** is consistently above the clustering-**OFF** baseline
at the *same* center across both seeds by a margin clearly beyond run-to-run noise — and, in
the lowered-center config, above its own center (selection actively building eyes from a
near-blind baseline). Report population alongside (must not collapse).

If, after sweeping count/radius/center/appeal, nothing clears: report the encounter wall
honestly and tee up the fallback. **No dressing up a null result.**

## Result (2026-06-23): CONFIRMED NULL — clustering does not revive range

Ran an 8-config sweep (center × appeal × clusterCount × radius), 8000 ticks, then an
8-seed confirmation on the best config (center 60, appeal 3, 16 clusters, radius 120).
Per-seed paired range Δ (clustering ON − OFF), seeds 1–8:

```
+14.1  +17.2  −5.0  −1.2  −8.6  −6.2  −3.9  +0.6
mean = +0.87   SD = 8.96   3/8 positive, 5/8 negative   mean/SE ≈ 0.28
```

Statistically indistinguishable from zero. The +15.6 that looked like a win was the two
lucky seeds (1,2); it collapses with more seeds. The sign flips with both the seed *and*
small parameter changes (appeal 3→5 flipped it on the same seeds 1,2), i.e. it's noise.
Range **never** evolved above its center in any config (best ON ≈ 54.6 < center 60).

**Why:** below-center range is free (`max(0,gene−center)·cost`) and smell-food sustains
the population, so there's no survival pressure keeping eyes large. At 8192² even clustered
sight-only parcels are encountered too rarely, and the per-seed variance in where range
settles — driven by where the random cluster centers land relative to pockets/walls/flow —
swamps any clustering signal. This confirms the encounter wall: at this scale density is
the lever, not range (`perception-scale-mismatch`, `predation-engine-ceiling`). A
sight-acquisition payoff (clustered or not) cannot overcome it.

**Disposition:** the clustering lever is built, OFF-by-default, byte-clean, and committed
(`684608d`) — kept as a tool, NOT shipped ON in the demo (it buys nothing). Vision-revival
via parcels is abandoned. Pursue behavioral/evolutionary enhancement through other methods.

## Fallback (not pursued — recorded for completeness)

**D — sight-only lethal hazards.** Avoidance is a sharper selector than a food bonus. A
drifting, smell-less, lethal-on-contact mote (same SoA + forked-RNG pattern, opposite appeal
sign in `sense.ts`) makes seeing-far life-or-death and revives RANGE *and* FOV. Bigger build;
pursue only if the carrot approach underperforms.
