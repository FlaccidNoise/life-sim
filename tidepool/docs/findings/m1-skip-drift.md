# M1 skip drift: does one time-skip change anything?

**Yes. After one skip, 2 of the 7 measures moved their mean by more than 1 standard deviation on 3 of
3 seeds: body width fell and the size of brain weights grew.** Two more moved that far on 1 seed each
(`cilia` and `chemo`).

Date: 2026-10-10. Task 16 of `docs/plans/2026-10-10-m0-m1-first-swim.md`. Tuned defaults
(`plant_growth` 0.02, `intake_rate` 0.08).

## What this probe shows and does not show

It measures drift and selection together, with no player in the world. It does not show that the world
adapts to a player. It shows that one skip is long enough for a population mean to move. It cannot tell
drift from selection by itself. Read the two measures that moved with that in mind:

- **Body width** went to the floor of its gene range (0.3) on all 3 seeds, and its spread collapsed
  (standard deviation 0.05 to 0.08 at the start, 0.016 to 0.019 at the end). A mean that runs to a
  wall on every seed while the spread collapses is what selection looks like. Body length did the
  same thing earlier: it is already at 6.4 to 7.2 at the start of the skip, against a floor of 6 and a
  founder mean of 12, so it had little room left to move.
- **Brain weight size** is the mean absolute weight of a creature's connections. A weight that takes
  random steps grows in size with no selection at all. Arithmetic for pure drift (36 weights that
  start near 0.08, a step of 0.25 with chance 0.1 per birth, and the measured mean generation of 7.1
  to 8.1 at tick 12,000 and 17.8 to 19.0 at tick 36,000) gives about 0.26 at the start of the skip
  and 0.35 at the end. The probe reads 0.24 and 0.31 to 0.33. So this measure moved a little less far
  than drift alone would move it. It is not evidence that brains adapt.

## Method

`tidepool-headless probe-skip [--seed n] [--ticks <settle ticks>]` runs the default world for 12,000
ticks to settle, then 24,000 more, which is one time-skip. It prints the mean and the standard
deviation over the living at both points, and the shift of the mean in units of the starting standard
deviation. Run on seeds 1, 2, 3, one at a time.

## Counts

| Seed | Creatures, tick 12,000 | Creatures, tick 36,000 | Plants, tick 12,000 | Plants, tick 36,000 | `max_gen`, tick 12,000 | `max_gen`, tick 36,000 |
|---|---|---|---|---|---|---|
| 1 | 1,477 | 1,013 | 1,682 | 914 | 11 | 23 |
| 2 | 1,373 | 874 | 1,471 | 844 | 12 | 22 |
| 3 | 1,148 | 780 | 1,504 | 776 | 11 | 24 |

The deepest line gains 10 to 13 generations in one skip. The mean generation of the living goes from
7.1, 8.1, and 7.2 to 17.8, 18.3, and 19.0 (scratch census), which is about 11 generations, or about
2,200 ticks each. The budget in `architecture.md` §2 assumes about 30 generations of 800 ticks.

## Shift of the mean, in starting standard deviations

| Measure | Seed 1 | Seed 2 | Seed 3 | Seeds past 1 |
|---|---|---|---|---|
| `len` | -0.56 | -0.42 | -0.97 | 0 of 3 |
| `wid` | -1.61 | -2.69 | -1.43 | 3 of 3 |
| `flagellum` | +0.03 | -0.21 | +0.30 | 0 of 3 |
| `cilia` | +0.41 | +1.40 | +0.35 | 1 of 3 |
| `filter` | +0.96 | +0.99 | -0.23 | 0 of 3 |
| `chemo` | -0.19 | +0.61 | +1.18 | 1 of 3 |
| `brain_weight` | +3.39 | +2.28 | +2.99 | 3 of 3 |

## Means and standard deviations

| Seed | Measure | Start mean | Start SD | End mean | End SD |
|---|---|---|---|---|---|
| 1 | `len` | 6.603 | 0.807 | 6.152 | 0.419 |
| 1 | `wid` | 0.414 | 0.064 | 0.310 | 0.019 |
| 1 | `flagellum` | 0.548 | 0.087 | 0.550 | 0.109 |
| 1 | `cilia` | 0.388 | 0.106 | 0.432 | 0.122 |
| 1 | `filter` | 0.567 | 0.076 | 0.641 | 0.088 |
| 1 | `chemo` | 0.571 | 0.094 | 0.553 | 0.124 |
| 1 | `brain_weight` | 0.237 | 0.023 | 0.314 | 0.028 |
| 2 | `len` | 6.378 | 0.671 | 6.093 | 0.357 |
| 2 | `wid` | 0.430 | 0.046 | 0.307 | 0.016 |
| 2 | `flagellum` | 0.529 | 0.072 | 0.514 | 0.105 |
| 2 | `cilia` | 0.441 | 0.070 | 0.540 | 0.080 |
| 2 | `filter` | 0.625 | 0.048 | 0.672 | 0.084 |
| 2 | `chemo` | 0.502 | 0.058 | 0.538 | 0.097 |
| 2 | `brain_weight` | 0.245 | 0.028 | 0.309 | 0.032 |
| 3 | `len` | 7.176 | 1.111 | 6.098 | 0.334 |
| 3 | `wid` | 0.418 | 0.078 | 0.307 | 0.016 |
| 3 | `flagellum` | 0.605 | 0.107 | 0.637 | 0.117 |
| 3 | `cilia` | 0.426 | 0.066 | 0.448 | 0.103 |
| 3 | `filter` | 0.574 | 0.055 | 0.562 | 0.067 |
| 3 | `chemo` | 0.527 | 0.061 | 0.599 | 0.110 |
| 3 | `brain_weight` | 0.239 | 0.029 | 0.327 | 0.042 |

## What it means for M2 and M5

- One skip is long enough for a body gene to cross its whole range. The settle run alone took `len`
  from 12 to about 6.6. Mutation rates and the skip length are not the first question.
- **The change a player would see is that every body ends at the smallest size the genes allow.** The
  M1 rules give a small body every advantage: a mouth takes in proportion to length, upkeep is paid
  in proportion to length times width, and nothing eats a small body. That is arithmetic from
  `energy.rs`, not a measurement, but the genes agree with it on 3 of 3 seeds. A change to those rules
  is out of scope for Task 16. It is the first question for M2.
- `chemo` did not fall on any seed in 36,000 ticks (0.55, 0.54, 0.60 at the end, from founders at
  0.50). The warning for risk R1 does not fire in this world on these seeds. That does not show that
  the sense pays: the probe has no world without it to compare.
- The world thins over the skip: creatures fall by about a third and plants by about half. At 72,000
  ticks on the same seeds the gate still passes (683 to 817 creatures, 701 to 833 plants). The cause
  of the thinning was not measured.
