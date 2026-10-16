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
