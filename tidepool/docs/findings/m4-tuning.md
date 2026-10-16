# M4 Task 12 — Switch on and retune

**Date:** 2026-10-16. Run by the orchestrator, one simulation at a time, from
`../plans/2026-10-14-m4-teeth.md` Task 12. The owner's instruction of 2026-10-16: every M4 rule ships
on in the default world. Each hypothesis is written and committed before its run. The "before" of
every throughput reading is `7b8c74f` (WASM about 2,830 at 1,394 bodies) and the new baseline after
Task 9 is in `m4-ports.md`.

## Part 1: switch on, one group at a time

For each group the Start values become defaults in `params.rs`, then `gate-health`, `gate-evolve`,
`probe-hunt` on seeds 1, 2, 3, and the bench. Readings, not trials. The build stops only if a seed
holds fewer than 150 creatures, or `kills_late` reads 0 on a seed after group 2 (a hard stop).

| Step | Group | Hypothesis, before the run |
|---|---|---|
| 1 | `corpse_share` 0.5 | As the Task 4 reading: 4% to 11% more bodies, `first_bud` later, the bench 5% to 10% under the baseline. No kill. |
| 2 | `bite_rate` 0.5, `bite_mass_ratio` 1.15, `founder_jaw` 0.2, `starter_chase` 1.5, `starter_lunge` 2.0 | Kills begin at founding: `kills_late` above 0 on 3 of 3. The hunter share drifts from 0.2; which way is the reading. With no guard and no flee, prey loses: `creatures` down, `prey_lo` the measure to watch. |
| 3 | `spike_hurt` 1.0, `shell_block` 1.0, `shell_drag` 0.05 | Nothing changes at founding: no founder has a spike or a shell. By 36,000 the add-part mutation may have placed some; `probe-hunt`'s `spike` and `shell` read whether they stay. |
| 4 | `dash_impulse` 2.0, `dash_spin` 0.3, `dash_cost` 0.5, `lunge_impulse` 2.0, `lunge_bite` 2.0, `lunge_cost` 0.5, `starter_flee` 2.0 | Every founder can dash when hit and flee teeth, a hunter can lunge: `kills_late` moves (lunge up, flee down; the sign is the reading), `dash_fire_ctx` reads above `dash_think_ctx` if the starter wires fire in context. |

Rows follow each step below.

### Part 1 rows (`9e71d09`, flags written out; the defaults are written after part 3)

Step 0 adds `fin_grip` 0.6 (the motor stop's proposal). Each step keeps the flags of the one before.

| Step | `gate-health` | `gate-evolve` 36k | Bodies at 12k | `hunt_lo` to `hunt_hi` | `prey_lo` | `kills_late` | WASM bench |
|---|---|---|---|---|---|---|---|
| 0 `fin_grip` 0.6 | 3/3 | 3/3 | 1,270 to 1,346 | 0.00 to 0.02 | 1,175 to 1,332 | 0 | 2,690 at 1,402 (265 ns) |
| 1 + `corpse_share` | 3/3 | 3/3 | 1,315 to 1,453 | 0.00 to 0.03 | 1,244 to 1,394 | 0 | 2,477 at 1,482 (272 ns) |
| 2 + the bite group | 3/3 | **0/3** | 456 to 561 | 0.98 to 1.00 | 0 to 1 | 1,979 to 2,633 | **void**, the world fell |
| 3 + the guards | 3/3 | **0/3** | 400 to 606 | 0.98 to 1.00 | 0 to 1 | 1,859 to 2,738 | void |
| 4 + dash, lunge, flee | 3/3 | **0/3** | 562 to 635 | 0.99 to 1.00 | 0 | 2,148 to 2,372 | void |

`gate-health` passes at every step because its predation bands are judged only under `--predation`;
under it, steps 2 to 4 fail `hunt_hi` and `prey_lo` on 3 of 3. The `gate-evolve` failures at 36,000:
`len` 20.5 to 23.2 against the band's 22.2 (giants), both sense gaps at or under 0, 178 to 249
bodies. `probe-hunt` at step 4, tick 36,000: 178 to 249 hunters, 0 prey, a mean jaw of 1.2 to 1.7
(more than one jaw per body), 5,300 to 6,700 kills per 12,000 ticks, `lunge_fire_ctx` 0.82 to 0.99
(a lunge fires almost only with a body in the cone: the starter wires work), `dash_fire_ctx` 0.87
to 0.93 (a dash fires with a hit or teeth seen).

**The reading.** The moment the bite is on (step 2), every lineage becomes a hunter by tick 12,000
and prey is gone. The mechanism is in the rows: a hunter keeps its Filter, a juvenile at `egg` 0.7
is lighter than any adult over the ratio of 1.15, and a bite of 3 per tick empties a juvenile in
one contact. A jaw costs mass and nothing else, and pays from the first contact with anyone's
young, so a jawless lineage is strictly worse. The world settles as about 200 cannibal giants
(`len` 23, up from 10: a larger body is bitten by fewer and bites more). The guards (step 3) and the
dash and flee (step 4) change nothing at 12,000: no founder carries a spike or a shell, and a
juvenile cannot outrun an adult. This is rule 5 of part 3, "hunters taking over", and the draft's
C11 and C16 in one.

## Part 3: trials for predation

Rule 5 of the plan for a takeover: `bite_mass_ratio` first (C11), then the guards (`shell_block`,
`spike_hurt`), then `bite_rate`. Four trials at a boom that move nothing: stop and report. Each
trial is one change on top of step 4, read at 12,000 (`gate-health --predation`), 36,000
(`gate-evolve`, `probe-hunt`). A trial that passes the 12,000 and 36,000 reads goes to 144,000.

| Trial | Change | Hypothesis, written before the run |
|---|---|---|
| T1 | `bite_mass_ratio` 2.0 | A body bites only one under half its mass: a newborn for its first few hundred ticks, not a half-grown juvenile. Kills fall by more than half; prey survives on 3 of 3 (`prey_lo` over 150); the hunter share still rises, since a jaw still pays and costs little, but slower: `hunt_hi` under 0.8 at 12,000 on at least 2 of 3. The giants shrink (`len` under 22.2). |
| T2 | `bite_mass_ratio` 3.0 (the top of its range) | Almost nothing is bitable but a newborn by a giant: `kills_late` falls under 200, prey holds, and the jaw stops paying: `hunt_hi` stays near the founders' 0.2 and may fall. The risk is the other failure, hunters dying out (`kills_late` under 20 by 36,000). |
| T3 | `shell_block` 2.0 and `spike_hurt` 2.0 (the guards, one group) | A shell of 0.5 blocks a whole bite and a spike of 0.5 costs a biter its bite in energy. At 12,000 no founder has either, so nothing changes; by 36,000 a guard that arrives by mutation pays at once, and `shell` or `spike` in `probe-hunt` rises above 0.1 on at least one seed. Not expected to break the takeover alone. |
| T4 | `bite_rate` 0.2 | A bite of 1.2 per tick: a median contact of 6 ticks moves 7, under a newborn's store, so most contacts wound and do not kill. Kills fall by two thirds, the takeover slows, but a jaw still pays over a life: `hunt_hi` still near 1.0 by 12,000 on 3 of 3. |

