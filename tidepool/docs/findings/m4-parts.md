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

At 12,000: herbivores 0.966 to 0.983. **Confirmed in direction:** omnivores fall 9 to 16 points
(0.45 to 0.78, from 0.60 to 0.87), both ends grow, the spread rises to 0.17 to 0.25. **Target: 0 of
5** (seed 6 has omnivores at 0.449 but carnivores at 0.031).

## T2: `gut_upkeep` 0.3 — hypothesis before the run

Change: `--param gut_upkeep=0.3`. A body at 0.5 pays 30% more than its basal cost.

Expected: the middle falls another 10 to 20 points, to about 0.35 to 0.6, with the ends 0.10 or more
on 3 or more seeds: the target met on 2 to 4 seeds. The risk: the climb crosses the band more slowly
(a climber at 0.3 pays 10%), so carnivores may come later or not at all on some seeds.
