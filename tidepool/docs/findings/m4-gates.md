# M4 Task 11 — The predation gates: proofs before bands

**Date:** 2026-10-16. The code is `1fca301` (`gate-health` and `gate-evolve --brain` print `hunt_lo`,
`hunt_hi`, `prey_lo`, `kills_late`, `flesh_late`; each band is `None` until its proof sets it, and
`--predation` judges the set ones). This file is written before any proof runs, as the plan asks:
the hypothesis of each run first, then its rows, then the bands set between the bad rows and the
good rows. The orchestrator runs every row, one at a time.

## The Start flags of stage 1

Every default is still Off. The Start values of groups 1 to 4 of Task 12 part 1, written out:

```
--param corpse_share=0.5 --param bite_rate=0.5 --param bite_mass_ratio=1.15 --param founder_jaw=0.2 --param starter_chase=1.5 --param starter_lunge=2.0 --param spike_hurt=1.0 --param shell_block=1.0 --param shell_drag=0.05 --param dash_impulse=2.0 --param dash_spin=0.3 --param dash_cost=0.5 --param lunge_impulse=2.0 --param lunge_bite=2.0 --param lunge_cost=0.5 --param starter_flee=2.0
```

`jaw_arc`, `spike_arc`, `shell_arc`, `debris_decay`, `debris_min`, `ability_cooldown`,
`lunge_ticks`, `hurt_gain`, `founder_jaw_size`, `starter_trigger_bias` are already at their Start
values as Off. The toxin gland stays off: stage 2.

## The three bad worlds, their hypotheses

Each at `gate-health` 12,000 ticks on seeds 1, 2, 3, the Start flags plus the flags of the bad world.

| Bad world | Flags added | Bands it is for | Hypothesis, written before the run |
|---|---|---|---|
| B1, no predation | `--param bite_rate=0` | `kills_late`, `flesh_late` | Jaws are dead weight on an omnivore: `kills_late` 0 and `flesh_late` 0.000 on 3 of 3. `hunt_lo` and `hunt_hi` near 0.2 (the founders' share, drifting). |
| B2, everything is prey | `--param founder_jaw=1 --param bite_mass_ratio=0` | `prey_lo`, `hunt_hi` | Every founder hunts and any body can be bitten: `hunt_hi` above 0.9 on 3 of 3 (prey can come only from a lost jaw), `prey_lo` under 50. Whether the world holds 150 bodies at all is the reading. |
| B3, no founder hunts | `--param founder_jaw=0` | `hunt_lo` | A jaw comes only from the add-part mutation (1 kind in 10, size 0.1): `hunt_lo` under 0.02 on 3 of 3, `kills_late` near 0. |

Then the good world, the Start flags and nothing else, **not looked at before the bad rows are
pasted below.** Each band is set between its bad rows and the good rows. A band that no value
separates is "not a gate".

The same three bad worlds and the good world again at 144,000 ticks on seeds 1, 4, 5 with
`gate-evolve --brain`, for the long bands.

## The rows at 12,000 ticks (`832527f`, load 5 to 6)

```
--- B1 no predation: bite_rate=0 
seed=1 creatures=1473 min_late=1383 plants=2229 births_late=2428 max_gen=15 mean_chemo=0.48 parked=0.00 first_bud=857 juv_starved=0.55 to_bud=0.31 hunt_lo=0.095 hunt_hi=0.180 prey_lo=1201 kills_late=0 flesh_late=0.000 PASS
seed=2 creatures=1382 min_late=1244 plants=2076 births_late=2459 max_gen=17 mean_chemo=0.47 parked=0.00 first_bud=815 juv_starved=0.55 to_bud=0.30 hunt_lo=0.234 hunt_hi=0.480 prey_lo=718 kills_late=0 flesh_late=0.000 PASS
seed=3 creatures=1363 min_late=1213 plants=1965 births_late=2051 max_gen=13 mean_chemo=0.47 parked=0.00 first_bud=904 juv_starved=0.55 to_bud=0.30 hunt_lo=0.084 hunt_hi=0.131 prey_lo=1100 kills_late=0 flesh_late=0.000 PASS
gate-health 3/3 PASS
--- B2 everything is prey: founder_jaw=1 bite_mass_ratio=0 
seed=1 creatures=658 min_late=622 plants=2229 births_late=3597 max_gen=28 mean_chemo=0.49 parked=0.00 first_bud=306 juv_starved=0.04 to_bud=0.36 hunt_lo=0.995 hunt_hi=1.000 prey_lo=0 kills_late=3423 flesh_late=0.594 PASS
seed=2 creatures=649 min_late=594 plants=2076 births_late=3106 max_gen=28 mean_chemo=0.46 parked=0.00 first_bud=328 juv_starved=0.06 to_bud=0.38 hunt_lo=1.000 hunt_hi=1.000 prey_lo=0 kills_late=2708 flesh_late=0.543 PASS
seed=3 creatures=653 min_late=629 plants=1965 births_late=3540 max_gen=28 mean_chemo=0.48 parked=0.00 first_bud=300 juv_starved=0.04 to_bud=0.36 hunt_lo=1.000 hunt_hi=1.000 prey_lo=0 kills_late=3298 flesh_late=0.627 PASS
gate-health 3/3 PASS
--- B3 no founder hunts: founder_jaw=0 
seed=1 creatures=1228 min_late=1225 plants=2229 births_late=2934 max_gen=13 mean_chemo=0.48 parked=0.00 first_bud=847 juv_starved=0.48 to_bud=0.28 hunt_lo=0.026 hunt_hi=0.624 prey_lo=462 kills_late=1403 flesh_late=0.110 PASS
seed=2 creatures=1190 min_late=1167 plants=2076 births_late=2530 max_gen=17 mean_chemo=0.48 parked=0.00 first_bud=852 juv_starved=0.47 to_bud=0.29 hunt_lo=0.055 hunt_hi=0.497 prey_lo=598 kills_late=935 flesh_late=0.073 PASS
seed=3 creatures=992 min_late=989 plants=1965 births_late=2855 max_gen=16 mean_chemo=0.53 parked=0.00 first_bud=734 juv_starved=0.42 to_bud=0.27 hunt_lo=0.159 hunt_hi=0.634 prey_lo=373 kills_late=1675 flesh_late=0.161 PASS
gate-health 3/3 PASS
--- GOOD: Start flags only 
seed=1 creatures=631 min_late=581 plants=2229 births_late=2775 max_gen=19 mean_chemo=0.53 parked=0.00 first_bud=462 juv_starved=0.09 to_bud=0.19 hunt_lo=0.995 hunt_hi=1.000 prey_lo=0 kills_late=2562 flesh_late=0.207 PASS
seed=2 creatures=568 min_late=564 plants=2076 births_late=2380 max_gen=16 mean_chemo=0.64 parked=0.00 first_bud=479 juv_starved=0.10 to_bud=0.20 hunt_lo=0.997 hunt_hi=1.000 prey_lo=0 kills_late=2116 flesh_late=0.173 PASS
seed=3 creatures=557 min_late=553 plants=1965 births_late=2288 max_gen=18 mean_chemo=0.69 parked=0.00 first_bud=468 juv_starved=0.12 to_bud=0.21 hunt_lo=0.995 hunt_hi=1.000 prey_lo=0 kills_late=2005 flesh_late=0.167 PASS
gate-health 3/3 PASS
```

What the rows say, against the hypotheses:

- **B1, no predation:** `kills_late` 0 and `flesh_late` 0.000 on 3 of 3, as hypothesised. The jaw
  share drifts: `hunt_lo` 0.08 to 0.23, `hunt_hi` 0.13 to 0.48. A dead jaw is not selected out in
  12,000 ticks.
- **B2, everything is prey:** `hunt_hi` 1.000 and `prey_lo` 0 on 3 of 3, as hypothesised. The world
  holds 650 bodies, `kills_late` 2,700 to 3,400 per 2,000 ticks, `flesh_late` 0.54 to 0.63: more
  than half of all energy eaten is flesh, and almost no juvenile starves (0.04 to 0.06) because
  it is eaten first.
- **B3, no founder hunts: the hypothesis was wrong.** Hunters arise by the add-part mutation and
  spread: `hunt_hi` 0.50 to 0.63 by 12,000 with `kills_late` 935 to 1,675. `hunt_lo` reads 0.026,
  0.055, 0.159, not under 0.02. The draft's C10 ("a guild absent at founding does not appear") does
  not hold here: a jaw of 0.1 at the nose on an omnivore pays at once.
- **The good world is not good.** At the Start values every body is a hunter by the second half
  (`hunt_lo` 0.995, `hunt_hi` 1.000, `prey_lo` 0 on 3 of 3), the population halves to 557 to 631,
  and `kills_late` reads 2,000 to 2,560: adults eat juveniles (the ratio of 1.15 lets an adult bite
  anything at `egg` 0.7). It looks like B2 with a fifth of the flesh share. This is the takeover
  that the retune's rule 5 is written for, and it is what Task 12 starts from.

## The bands at 12,000 ticks, provisional

A band is set between its bad rows and what "coexist" means, not between the bad rows and this
good world, which fails coexistence itself. Each rejects its bad world on 3 of 3.

| Band | Value | Rejects | Bad rows | This good world |
|---|---|---|---|---|
| `kills_late` | 20 or more | B1 | 0, 0, 0 | 2,562, 2,116, 2,005 |
| `flesh_late` | 0.01 or more | B1 | 0.000 ×3 | 0.17 to 0.21 |
| `hunt_hi` | 0.8 or less | B2 | 1.000 ×3 | 1.000 ×3: **fails** |
| `prey_lo` | 150 or more | B2 | 0 ×3 | 0 ×3: **fails** |
| `hunt_lo` | not a gate at 12,000 | B3 | 0.026, 0.055, 0.159 | 0.995 ×3 |

`hunt_lo` has no 12,000-tick value that separates a world where hunters die out from one where
they live: no bad world of the head has hunters that die out by then (B1's dead jaws are still at
0.08 to 0.23). The long proof at 144,000 reads B1 again for it. `hunt_hi` 0.8: a world where four
bodies in five hunt at any sample in the second half has no prey to speak of; the draft's booms
peaked at 0.48 to 0.57. `prey_lo` 150: the `CREATURES` floor of the gate, applied to the prey.
Set in `crates/headless/src/health.rs` `PREDATION`; judged under `--predation`.
