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
