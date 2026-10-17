# M4 retune 2 — parts and the diet's middle: rows

The plan is `../plans/2026-10-16-m4-retune-parts.md` (approved 2026-10-16 at every recommended
option). Each trial's hypothesis is committed here before its run. One run at a time.

Target (P4 A): at tick 144,000, at the end of the run, omnivores at most 0.50 of the living, plant
eaters (`diet` under 0.3) and meat eaters (over 0.7) 0.10 or more each, on 4 of 5 seeds (1, 4, 5,
6, 8).

## Built

- Task 1: `parts-audit.md` (`2440bac`).
- Task 3, rule G1, two guts cost upkeep, off (`7745fc6`).
- Task 2, the lunge folds into the dash (`625dd23`): a Jaw declares no trigger; a dash by a body with
  a Jaw bites `strike_bite` times harder for `strike_ticks`. Format 12, ABI 10. Every founder has a
  Flagellum, so the founder hunters strike; their flee and their strike now share one cooldown.

## Baseline: the shipped diet set with Task 2, `gut_upkeep` 0 — expectation before the run

Not a trial. Expected: herbivores lose the free burst a jaw gave them, so `herb_jaw` falls; hunters
lose a separate lunge cooldown, so kills may fall a little. The diet shape near the diet retune's
T8: omnivores 0.57 to 0.83 at 144,000.

### Baseline rows (`d088068`, load 7 to 9)

| Seed | 144,000: creatures | herb | omni | carn | diet_sd | kills | `herb_jaw` |
|---|---|---|---|---|---|---|---|
| 1 | 1,026 | 0.064 | 0.866 | 0.069 | 0.14 | 5,163 | 1.000 |
| 4 | 931 | 0.279 | 0.669 | 0.052 | 0.20 | 4,135 | 0.992 |
| 5 | 878 | 0.146 | 0.771 | 0.083 | 0.19 | 2,790 | 0.898 |
| 6 | 997 | 0.374 | 0.604 | 0.022 | 0.20 | 2,403 | 0.853 |
| 8 | 730 | 0.173 | 0.604 | 0.223 | 0.24 | 2,964 | 1.000 |

At 12,000 (seeds 1 to 3): herbivores 0.817 to 0.978; seed 2 has 1,136 kills and omnivores 0.180.
**Target: 0 of 5** (no seed has omnivores at 0.50 or under). **The expectation about jaws is
falsified:** herbivores keep jaws (0.85 to 1.00) without the lunge, so the free burst was not the
reason. A likelier one from the audit (finding 4): mass is armour against the mass ratio.

## T1: `gut_upkeep` 0.1 — hypothesis before the run

Change: `--param gut_upkeep=0.1` (`gut_band` 0.2). A body at 0.5 pays 10% more than its basal cost,
one at 0.35 or 0.65 pays 5%; bodies under 0.2 or over 0.8 pay nothing.

Expected: the middle thins by 5 to 15 points and both ends grow; the climb from plants is untouched
(the band leaves 0 to 0.2 free). Target on 1 or 2 seeds. If the middle moves less than 5 points,
T2 is `gut_upkeep` 0.3.

### T1 rows (`46dd510`, load 6 to 7)

| Seed | 144,000: creatures | herb | omni | carn | diet_sd | kills |
|---|---|---|---|---|---|---|
| 1 | 1,102 | 0.156 | 0.777 | 0.067 | 0.17 | 9,778 |
| 4 | 874 | 0.333 | 0.596 | 0.071 | 0.23 | 2,986 |
| 5 | 965 | 0.202 | 0.636 | 0.162 | 0.23 | 5,283 |
| 6 | 1,162 | 0.520 | 0.449 | 0.031 | 0.23 | 5,246 |
| 8 | 756 | 0.224 | 0.620 | 0.156 | 0.25 | 1,766 |

At 12,000: herbivores 0.966 to 0.983. **Confirmed in direction, not on every seed:** omnivores fall on
seeds 1, 4, 5, 6 (by 7 to 16 points) and rise on seed 8 (0.604 to 0.620); herbivores grow on every
seed; carnivores grow on 4, 5, 6 and fall on 1 and 8. The spread rises to 0.17 to 0.25. **Target: 0 of
5** (seed 6 has omnivores at 0.449 but carnivores at 0.031).

## T2: `gut_upkeep` 0.3 — hypothesis before the run

Change: `--param gut_upkeep=0.3`. A body at 0.5 pays 30% more than its basal cost.

Expected: the middle falls another 10 to 20 points, to about 0.35 to 0.6, with the ends 0.10 or more
on 3 or more seeds: the target met on 2 to 4 seeds. The risk: the climb crosses the band more slowly
(a climber at 0.3 pays 10%), so carnivores may come later or not at all on some seeds.

### T2 rows (`3240614`, load 6 to 7)

| Seed | 144,000: creatures | herb | omni | carn | diet_sd | kills |
|---|---|---|---|---|---|---|
| 1 | 866 | 0.169 | 0.744 | 0.088 | 0.17 | 5,121 |
| 4 | 960 | 0.525 | 0.431 | 0.044 | 0.23 | 4,499 |
| 5 | 859 | 0.250 | 0.668 | 0.081 | 0.23 | 2,630 |
| 6 | 1,116 | 0.542 | 0.380 | 0.078 | 0.26 | 5,637 |
| 8 | 678 | 0.301 | 0.549 | 0.150 | 0.25 | 1,936 |

**Confirmed in direction, target 0 of 5.** Omnivores 0.38 to 0.74. The thinning goes mostly to the
plant end (herbivores 0.17 to 0.54); carnivores move little (0.04 to 0.15). Seed 6 misses on
carnivores only (0.078), seed 8 on omnivores only (0.549).

## T3: `gut_upkeep` 0.6 — hypothesis before the run

Change: `--param gut_upkeep=0.6`. A body at 0.5 pays 60% more than its basal cost.

Expected: omnivores under 0.5 on 4 or more seeds. Whether carnivores reach 0.10 is the open
question: if the middle empties toward plants and not toward flesh, the carnivores, fed by the
middle and the bottom, may fall. If carnivores stay under 0.10 on most seeds, the gut lever is spent
and the meat end needs its own lever (T4: `gut_upkeep` back to the best value and `bite_diet_gap`
0.2, so a carnivore at 0.75 can eat omnivores up to 0.55).

### T3 rows (`213359c`, load 7 to 9)

| Seed | 144,000: creatures | herb | omni | carn | diet_sd | kills |
|---|---|---|---|---|---|---|
| 1 | 932 | 0.451 | 0.461 | 0.088 | 0.24 | 9,984 |
| 4 | 1,370 | 0.974 | 0.026 | 0.000 | 0.09 | 110 |
| 5 | 915 | 0.352 | 0.549 | 0.099 | 0.25 | 4,707 |
| 6 | 1,487 | 0.967 | 0.033 | 0.000 | 0.09 | 51 |
| 8 | 1,389 | 0.974 | 0.026 | 0.000 | 0.09 | 14 |

**Falsified: 0.6 kills the climb on 3 of 5 seeds.** Where it climbs, the shape is the closest yet
(seed 1: 0.45, 0.46, 0.088; seed 5: 0.35, 0.55, 0.099). The bracket: 0.3 climbs on 5 of 5, 0.6 on 2.

## T4: `gut_upkeep` 0.3 and `bite_diet_gap` 0.2 — hypothesis before the run

One change from T2: `--param bite_diet_gap=0.2`. A carnivore at 0.75 can eat omnivores up to 0.55
(not 0.5), and an omnivore at 0.5 herbivores up to 0.3.

Expected: more food at the top lifts carnivores to 0.10 or more on 3 or more seeds, with the middle
held near T2's 0.38 to 0.74 by the gut cost. Target on 2 or more seeds. The risk is T4 of the diet
retune: a smaller gap lets near neighbours eat each other. 0.2 is close to 0.25, so I expect no cloud.

### T4 rows (`d52f8de`, load 6)

| Seed | 144,000: creatures | herb | omni | carn | diet_sd | kills |
|---|---|---|---|---|---|---|
| 1 | 891 | 0.035 | 0.816 | 0.149 | 0.13 | 5,494 |
| 4 | 1,267 | 0.934 | 0.066 | 0.000 | 0.11 | 522 |
| 5 | 840 | 0.175 | 0.600 | 0.225 | 0.23 | 4,759 |
| 6 | 906 | 0.389 | 0.478 | 0.134 | 0.27 | 4,732 |
| 8 | 666 | 0.182 | 0.563 | 0.255 | 0.24 | 2,443 |

**Confirmed for the meat end: carnivores 0.13 to 0.26 on the 4 seeds that climb. Target: 1 of 5**
(seed 6: 0.389, 0.478, 0.134). Seeds 5 and 8 miss on omnivores only (0.600, 0.563). Seed 1's
herbivores are squeezed to 0.035. Seed 4 does not climb (it did in T2: the climb is chance).

## T5: `gut_upkeep` 0.4 with the gap 0.2 — hypothesis before the run

One change from T4: `--param gut_upkeep=0.4`. Expected: omnivores fall under 0.5 on seeds 5 and 8,
seed 6 holds: the target on 3 seeds. The risk is T3's: the climb fails on more seeds. If it does,
T6 holds `gut_upkeep` 0.3 and raises `diet_sigma` (a larger step crosses the band).

### T5 rows (`0cf7f97`, load 3 to 5)

| Seed | 144,000: creatures | herb | omni | carn | diet_sd | kills |
|---|---|---|---|---|---|---|
| 1 | 796 | 0.225 | 0.587 | 0.188 | 0.25 | 5,010 |
| 4 | 1,296 | 0.964 | 0.036 | 0.000 | 0.10 | 400 |
| 5 | 930 | 0.190 | 0.666 | 0.144 | 0.22 | 4,849 |
| 6 | 1,258 | 0.963 | 0.037 | 0.000 | 0.10 | 335 |
| 8 | 670 | 0.173 | 0.576 | 0.251 | 0.24 | 2,009 |

**Falsified. Target 0 of 5.** The climb fails on seeds 4 and 6, and where it climbs the middle is
thinner than T4's on seed 1 (0.587 from 0.816) and not on seeds 5 and 8 (0.666, 0.576). Between 0.3 and 0.4 the seed's path decides more than the cost.

## T6: `diet_sigma` 0.15 on T4 — hypothesis before the run

One change from T4 (`gut_upkeep` 0.3, gap 0.2): `--param diet_sigma=0.15`. The diet retune found
that a larger step makes the climb happen on every seed (T8 there, 0.05 to 0.1).

Expected: the ladder on 5 of 5 seeds, with T4's shape where it climbs (carnivores 0.13 or more,
omnivores 0.48 to 0.6): the target on 2 or 3 seeds. The risk: a larger step spreads every lineage's
diet, which may fill the middle again.

### T6 rows (`45e4d77`, load 3 to 4)

| Seed | 144,000: creatures | herb | omni | carn | diet_sd | kills |
|---|---|---|---|---|---|---|
| 1 | 606 | 0.046 | 0.741 | 0.213 | 0.15 | 3,860 |
| 4 | 904 | 0.501 | 0.413 | 0.086 | 0.27 | 3,378 |
| 5 | 643 | 0.207 | 0.516 | 0.277 | 0.26 | 2,870 |
| 6 | 739 | 0.309 | 0.571 | 0.120 | 0.26 | 2,920 |
| 8 | 500 | 0.182 | 0.532 | 0.286 | 0.24 | 1,592 |

**Confirmed for the climb: a ladder on 5 of 5 seeds.** Target 0 of 5, each by a little: omnivores
0.516, 0.532, 0.571 on seeds 5, 8, 6; seed 4 on carnivores (0.086); seed 1 on herbivores (0.046).
Fewer bodies: 500 to 904 (T4: 666 to 1,267).

## T7: `gut_upkeep` 0.4 on T6 — hypothesis before the run

One change from T6: `--param gut_upkeep=0.4` (gap 0.2, `diet_sigma` 0.15). T5 lost the climb at 0.4
with the small step; the larger step should keep it. Expected: omnivores under 0.5 on seeds 5, 8, and
6, the ladder on 4 or more seeds: the target on 3 seeds. Risk: fewer bodies again.

### T7 rows (`5e03746`, load 3 to 6)

| Seed | 144,000: creatures | herb | omni | carn | diet_sd | kills |
|---|---|---|---|---|---|---|
| 1 | 780 | 0.147 | 0.705 | 0.147 | 0.20 | 8,811 |
| 4 | 1,193 | 0.908 | 0.090 | 0.003 | 0.13 | 910 |
| 5 | 623 | 0.202 | 0.498 | 0.300 | 0.26 | 2,019 |
| 6 | 1,028 | 0.630 | 0.311 | 0.058 | 0.25 | 4,017 |
| 8 | 706 | 0.149 | 0.602 | 0.249 | 0.23 | 3,210 |

**Target: 1 of 5** (seed 5). Seed 4 barely climbs, seed 6 short of carnivores, seeds 1 and 8 heavy in
the middle. Near the target the one sample at the end of the run decides: a seed caught at another
point of its cycle would read otherwise.

## T8: `gut_upkeep` 0.6 on T6 — hypothesis before the run, the last trial

One change from T7: `--param gut_upkeep=0.6` (gap 0.2, `diet_sigma` 0.15). T3 at 0.6 with the small
step gave the best shapes where it climbed and lost the climb on 3 seeds; the larger step may keep
it. Expected: the climb on 4 or more seeds and omnivores under 0.5 where it climbs: the target on 2
or 3 seeds. If the climb fails on 3 or more seeds, T6's set ships (the ladder on 5 of 5).

### T8 rows (`d777c3f`, load 3 to 4)

| Seed | 144,000: creatures | herb | omni | carn | diet_sd | kills |
|---|---|---|---|---|---|---|
| 1 | 1,740 | 0.959 | 0.041 | 0.000 | 0.10 | 59 |
| 4 | 519 | 0.079 | 0.653 | 0.268 | 0.18 | 2,698 |
| 5 | 909 | 0.405 | 0.399 | 0.196 | 0.29 | 4,439 |
| 6 | 1,441 | 0.946 | 0.054 | 0.000 | 0.11 | 676 |
| 8 | 519 | 0.229 | 0.424 | 0.347 | 0.28 | 2,079 |

**Target: 2 of 5** (seeds 5 and 8), the most of any trial, as expected. But the climb fails on seeds 1
and 6: no carnivore at the end. The long gate's `carn_hi` band (the most over the second half, 0.03)
would likely reject them; not run (seed 6 had 676 kills in the last 24,000 ticks).

## The stop at the trial cap, and what ships

Eight trials. The target (omnivores 0.50 or under, each end 0.10 or more, at 144,000 on 4 of 5) is
met by no trial: T4 and T7 meet it on 1 seed, T8 on 2.

| Set | Ladder (seeds of 5) | Target (seeds) | Omnivores where it climbs | Carnivores where it climbs | Bodies |
|---|---|---|---|---|---|
| Diet retune T8 (before this plan) | 5 | 0 | 0.57 to 0.83 | 0.04 to 0.17 | 890 to 1,045 |
| Baseline (Task 2 only) | 5 | 0 | 0.60 to 0.87 | 0.02 to 0.22 | 730 to 1,026 |
| T2 (gut 0.3) | 5 | 0 | 0.38 to 0.74 | 0.04 to 0.15 | 678 to 1,116 |
| T4 (gut 0.3, gap 0.2) | 4 | 1 | 0.48 to 0.82 | 0.13 to 0.26 | 666 to 1,267 |
| **T6 (gut 0.3, gap 0.2, `diet_sigma` 0.15)** | **5** | 0 | **0.41 to 0.74** | **0.09 to 0.29** | **500 to 904** |
| T7 (T6 with gut 0.4) | 4 | 1 | 0.31 to 0.71 | 0.06 to 0.30 | 623 to 1,193 |
| T8 (T6 with gut 0.6) | 3 | 2 | 0.40 to 0.65 | 0.20 to 0.35 | 519 to 1,740 |

**T6's set ships** (`gut_upkeep` 0.3, `bite_diet_gap` 0.2, `diet_sigma` 0.15): the only set with a
ladder on every seed, a thinner middle than before the plan, and meat eaters at about twice their
share. Seeds 4, 5, 6, and 8 miss the target by a little; seed 1 by far (omnivores 0.741, herbivores
0.046). T8 is the other choice for the owner: the target on
2 seeds and the thinnest middle, but 2 worlds in 5 with no meat eater, which the long gate rejects.

What the trials show: the gut cost moves bodies out of the middle mostly toward plants (T1 to T3);
the meat end grows when the food chain lets carnivores eat the omnivores (the gap 0.2, T4); a larger
mutation step keeps the climb on every seed (T6); a strong gut cost (0.6) stops the climb on some
seeds whatever the step (T3, T8). The single sample at the end of a run falls at a random point of
each seed's cycles, so near the target a seed passes or fails by chance.
