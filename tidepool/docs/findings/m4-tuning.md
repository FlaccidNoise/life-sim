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

### T1 to T4 rows (`f9c67ef`, load 1 to 2)

| Trial | `gate-health --predation` | `gate-evolve` 36k | Bodies 12k | `hunt_lo` to `hunt_hi` 12k | `prey_lo` | `kills_late` | `flesh_late` | Hunters : prey at 36k (`probe-hunt`) |
|---|---|---|---|---|---|---|---|---|
| T1 ratio 2.0 | **3/3** | 0/3 (`eye_gap` 0.05 to 0.08) | 1,243 to 1,287 | 0.11 to 0.66 | 437 to 801 | 490 to 911 | 0.02 to 0.03 | 840 to 1,035 : 6 to 22 |
| T2 ratio 3.0 | 0/3 (`flesh_late` 0.001 to 0.002 < 0.01) | **3/3** | 1,337 to 1,516 | 0.09 to 0.29 | 925 to 1,224 | 43 to 83 | 0.001 to 0.002 | 893 to 1,065 : 490 to 648 |
| T3 guards ×2 | 0/3 (`hunt_hi` 1.0, `prey_lo` 0) | 0/3 | 551 to 637 | 0.99 to 1.00 | 0 | 2,030 to 2,590 | 0.16 to 0.20 | 200 to 307 : 0 |
| T4 `bite_rate` 0.2 | 0/3 (the same) | 0/3 | 554 to 769 | 0.94 to 1.00 | 0 | 1,959 to 2,339 | 0.16 to 0.21 | 203 to 332 : 0 |

- **The mass ratio is the one lever that moves the world, and it moves the speed of the takeover,
  not its end.** At 2.0 prey survives the first 12,000 ticks (every predation band passes) and is
  gone by 24,000 (`prey` 5 to 56). At 3.0 hunters rise from 17% to 60% of the living over 36,000
  ticks with 490 to 648 prey left and a healthy world (1,383 to 1,713 bodies, `len` 9.5 to 10.7,
  both senses held, `gate-evolve` 3 of 3). The trend is the same.
- T2 fails only my provisional `flesh_late` band of 0.01: it reads 0.001 to 0.002 with 43 to 83
  kills per 2,000 ticks. The bad world reads 0.000 exactly, so the band's value is a choice between
  0.000 and this world's rows, as the plan's method says. It is not changed on one trial.
- **Stronger guards (T3) and a weaker bite (T4) change nothing at 12,000 or 36,000.** No founder
  has a guard; by 36,000 the mean spike and shell sizes are 0.00 to 0.07. A bite of 1.2 per tick
  still kills a newborn in two contacts.
- The starter wires work: `lunge_fire_ctx` 0.98 to 0.99 at 12,000 (a lunge fires with a body in the
  cone) and `dash_fire_ctx` 0.99 to 1.00 (a dash fires with a hit or teeth in view) on every seed.

**Four trials at the boom.** Rule 5 says stop and report when four trials at a boom move nothing.
T1 and T2 moved the speed, not the end, and T3 and T4 moved nothing. Before the report, one reading
the trials cannot give: whether a guard that arrives by mutation gives prey a foothold over
144,000 ticks. A shell or a spike pays only when hunters are common, and costs mass always: that is
the frequency dependence the draft named, if evolution finds it in time. The ratio-3 world is the
one where prey is still there to find it.

**Hypothesis for the long read, before the run:** `gate-evolve --brain` at 144,000 on seeds 1, 4, 5,
6, 8 with the T2 set (ratio 3.0). Hunters pass 0.8 of the living on at least 3 of 5 seeds by the
second half (`hunt_hi` fails), prey holds over 150 on at most 2 of 5, the mean shell or spike size
in `probe-hunt` at 144,000 stays under 0.1 on 3 of 3 seeds, and the M2 and brain bands pass on 4 of
5 (the scent on seed 8 is the known fragile one).

### The long read of the ratio-3 world (`35a0872`, load 1 to 2, 17 minutes)

`gate-evolve --brain --seeds 1,4,5,6,8 --ticks 144000` with the T2 set: **5 of 5 on every M2 and
brain band**, seed 8's scent included (`chemo` 0.92 against 0.04). The predation measures, no band
judged:

| Seed | Bodies | `len` | `hunt_lo` to `hunt_hi` | `prey_lo` | `kills_late` | `flesh_late` |
|---|---|---|---|---|---|---|
| 1 | 904 | 16.0 | 0.85 to 1.00 | 0 | 599 | 0.029 |
| 4 | 774 | 15.6 | 0.88 to 1.00 | 0 | 383 | 0.022 |
| 5 | 862 | 16.7 | 0.86 to 0.92 | 90 | 687 | 0.037 |
| 6 | 824 | 14.4 | 0.83 to 1.00 | 0 | 320 | 0.022 |
| 8 | 486 | 20.8 | 0.78 to 1.00 | 0 | 240 | 0.024 |

`probe-hunt` on seeds 1, 2, 3 every 36,000 ticks (hunters : prey, kills in the window, mean jaw):

| Seed | 36,000 | 72,000 | 108,000 | 144,000 |
|---|---|---|---|---|
| 1 | 1,065 : 648, 3,436, 0.24 | 1,239 : 209, 11,366, 0.42 | 894 : 5, 15,717, 0.80 | 903 : 1, 12,675, 1.00 |
| 2 | 893 : 490, 5,236, 0.26 | 814 : 7, 19,320, 0.54 | 478 : 5, 7,560, 0.30 | 501 : 118, 2,065, 0.17 |
| 3 | 902 : 571, 3,808, 0.23 | 995 : 271, 10,680, 0.41 | 685 : 238, 13,464, 0.54 | 607 : 183, 11,121, 0.48 |

Against the hypothesis: hunters pass 0.8 on 5 of 5 (said 3 of 5); prey over 150 through the second
half on 0 of 5 (said at most 2); shell and spike stay under 0.02 on 3 of 3 (said under 0.1); the M2
and brain bands pass 5 of 5 (said 4). What the rows add:

- **The world is healthy and lively.** 486 to 904 bodies, bigger (`len` 14 to 21, inside the band),
  with 240 to 690 kills per 2,000 ticks and flesh at 2% to 4% of all energy eaten. Both senses hold
  on every seed, better than at the M3 exit. It is not the collapse of step 2.
- **Hunters take over, but not for good everywhere.** Seed 2 booms and busts: hunters 1,239 to 478
  as prey falls to 5, then prey comes back to 118 while the mean jaw shrinks from 0.54 to 0.17.
  Seed 3 never loses its prey (183 to 571 through 144,000 ticks). Seed 1 goes to one prey with a
  jaw of 1.0. That is the frequency dependence the draft named, weak and slow: it shows on 2 of 3
  seeds in `probe-hunt` and on none of the five in `hunt_hi`.
- No guard evolved to matter (shell and spike under 0.02). The cost of a jaw at low prey is the
  only brake, through the mass it adds and the lunges it fires at nothing.

### T5: a dearer lunge, hypothesis before the run

The one lever that charges a hunter more when prey is scarce: `lunge_cost`. A hunter lunges at any
body in its cone (`lunge_fire_ctx` 0.98), and a miss or a bite on a body over the ratio returns
nothing. At 0.5 a lunge costs 6 on the reference body; **T5 sets `lunge_cost` 2.0 (24 per lunge,
two thirds of a half store) on the T2 set.** Hypothesis: at 12,000 the hunter share and the kills
fall (hunters cannot afford to lunge at everything), prey holds over 150 on 3 of 3, `kills_late`
stays over 20; at 36,000 hunters are under 50% of the living on at least 2 of 3 against T2's 60%.
If it reads so, the long run follows.

### T5 rows (`c35bf57`)

| | `gate-health --predation` | `gate-evolve` 36k | `hunt_lo` to `hunt_hi` 12k | `prey_lo` | `kills_late` | Hunters : prey at 36k |
|---|---|---|---|---|---|---|
| T5 `lunge_cost` 2.0 | 0/3 (`flesh_late` 0.000 to 0.001; seed 2 `kills_late` 2) | 3/3 | 0.01 to 0.19 | 1,087 to 1,293 | 2, 43, 48 | 460 : 1,138; 910 : 564; 923 : 620 |

A dearer lunge delays the hunters on seed 2 (55 hunters and 20 kills at 12,000, then 910 by
36,000), halves them on seed 1 at 36,000 (460 against T2's 1,065) and leaves seed 3 as T2 (923
against 902). It was not run to 144,000. The
reason is in rule J1: a jaw bites on contact with no lunge; the lunge only raises the bite. The cost
of hunting at low prey is not reached by any lunge parameter.

### The stop of rule 5, and what ships

Five trials on three levers: the mass ratio moves the pace of the takeover and ran out of its range
at 3.0 (the top of `bite_mass_ratio`); the guards doubled and a weaker bite were read at ratio 1.15,
where prey is gone by 12,000 and a guard has no prey to spread in; a dearer lunge halved the hunters
of one seed at 36,000 (1,065 to 460) and not the others. At ratio 3 a founder hunter cannot bite a
founder's newborn (88 against 3 times 38, the plan's reference numbers), so the takeover there runs
through size: the mean body grows to `len` 14 to 21, and a bigger body bites more and is bitten by
fewer. Untried within the rules: the guards at ratio 3 or at their top of 4.0, `founder_jaw`,
`corpse_share`, and a wider range for the ratio. The draft measured the same shape (C11, C15, C16)
and named negative frequency dependence as the need, which is a rule. **The trials for the takeover
stop here under rule 5, with 7 of 12 unspent, and the finding goes to the owner with the levers
above.**

What ships, on the owner's instruction that every rule is on: **the ratio-3 set.** It is the world
the rows like best: 1,340 to 1,520 bodies at 12,000 with hunters at a fifth and prey everywhere,
486 to 904 bodies at 144,000 with every M2 and brain band held on 5 of 5 seeds, 240 to 690 kills per
2,000 ticks, a boom and bust on one seed in three and persistent prey on another. Its defaults are
written below. The predation bands stay in the code as provisional and are not judged by `make
gates`: this world fails `flesh_late` at 12,000 (0.001 to 0.002 against 0.01) and `hunt_hi` and
`prey_lo` at 144,000 (every seed), so target 1 and target 4 are not met, and they go to the owner
with these rows. Targets 2, 3, and 5 are read in part 2 below.

## Part 2: measure before tuning, at the defaults (`8435888`)

Rows follow the run: `make gates` (the bench with everything on), `probe-hunt` at 36,000, the jaw
gap (`gate-evolve --brain` at 144,000 on seeds 1, 4, 5, 6, 8 with `bite_rate=0`, which is also the
long proof of bad world B1, and the chance arm `bite_rate=0.0001`). The good world's long row is the
long read above (5 of 5). Hypotheses: the bench is not void (1,340 to 1,520 bodies at 12,000 in the
T2 rows) and reads under the ratio-off world by the per-creature cost of the bite and the debris
pass; with `bite_rate=0` the jaw is dead weight and its share at 144,000 falls under the chance
arm's on at least 4 of 5 seeds, and `hunt_lo` reads under 0.05 there (the long `hunt_lo` band's
proof); the chance arm reads as the dead arm within noise.

## Part 4: the toxin gland, stage 2

Hypotheses before the run. The Start values `toxin_drain` 0.3 and `toxin_cost` 2.0 go on as flags on
the defaults, then as defaults if the readings hold. A gland arrives only by mutation (no founder
has one), so at 12,000 and 36,000 the mechanism's claim is "clouds are made and drain": `poisoned`
above 0 on at least 1 of 3 seeds by 36,000, `gland` mean under 0.05, and `toxin_fire_ctx` above
`toxin_think_ctx` where any cloud fires (a cloud fires with a hit in the last 10 ticks). Targets 1
to 5 read as at stage 1: no seed under 150 bodies, the M2 and brain bands held. "Evolution keeps it":
the gland share at 144,000 against `toxin_drain=0`, no band, read in the long run below. At most 3
trials, for the targets only.

### Part 2 rows (`8435888`, load 1 to 3)

`make gates` exits 0 at the defaults: native 2,425 and WASM 2,440 at 1,540 bodies, 266 to 268 ns per
creature-tick (the fixed pre-Task-9 head read 253; the full default world holds 1,540 bodies
against 1,394, so the per-creature cost of the bite, the debris pass, and the larger brains is
about 5% and the lower ticks per second are mostly more bodies). **Target 2 is met at the floor and
not at the target:** 2,440 against 2,400 and 2,600. `gate-health` 3 of 3 and `gate-evolve` 3 of 3,
rows identical to T2's. The long row at the defaults is the long read above: 5 of 5 on the M2 and
brain bands (target 5 met), the predation share bands failed on every seed (target 4 not met).

The jaw gap at 144,000, `gate-evolve --brain` on seeds 1, 4, 5, 6, 8 and `probe-hunt` on 1, 2, 3:

| Arm | M2 and brain bands | `hunt_lo` to `hunt_hi` | `prey_lo` | `kills_late` | Hunters : prey at 144,000 (`probe-hunt`) | Mean jaw |
|---|---|---|---|---|---|---|
| Defaults (the long read) | 5/5 | 0.78 to 1.00 | 0 to 90 | 240 to 690 | 903 : 1; 501 : 118; 607 : 183 | 1.00, 0.17, 0.48 |
| `bite_rate=0`, a dead jaw | 4/5 (seed 5's scent, 0.069) | 0.04 to 0.96 | 47 to 950 | 0 | 751 : 1,018; 454 : 1,173; 187 : 1,307 | 0.10, 0.18, 0.08 |
| `bite_rate=0.0001`, chance | 4/5 (seed 1's scent, 0.043) | 0.02 to 0.87 | 225 to 1,015 | 0 to 2 | 902 : 862; 815 : 838; 926 : 656 | 0.04, 0.07, 0.26 |

- **A dead jaw is not selected out in 144,000 ticks.** With `bite_rate` 0 the jaw share drifts between
  4% and 96% of the living across seeds, and the chance arm reads the same. A jaw of 0.1 costs a
  tenth of a part's mass and nothing else. So `hunt_lo` separates nothing at 144,000 either: it is
  not a gate, at either length.
- **The jaw gap is in the size of the jaw, not the share.** With the bite on, the mean jaw over
  the living grows to 1.00 and 0.48 on seeds 1 and 3 at 144,000 against 0.10 and 0.08 dead; on seed
  2 it reads 0.17 against 0.18. Evolution grows a jaw that bites on 2 of 3 seeds. That is "evolution
  uses it", read with no band, on two seeds of three.
- **The long bands that the dead arm proves:** `kills_late` 20 or more and `flesh_late` 0.01 or
  more at 144,000 reject the dead arm on 5 of 5 (0 and 0.000) and pass the defaults on 5 of 5 (240
  to 690, 0.022 to 0.037). Set in `evolve.rs` `PREDATION`, judged under `--brain --predation`.
  `hunt_hi` and `prey_lo` stay unset at 144,000 with the finding above.
- Both arms lose one seed's scent gap at 144,000 by a hair (0.069, 0.043 against 0.10), as the
  Task 10 arm did on seed 8. The default world holds every seed's scent (0.42 to 0.88) on this
  reading; one run per arm says nothing about why.

### Part 4 rows (`38baab1`, flags `toxin_drain=0.3 toxin_cost=2.0` on the defaults)

At 12,000 and 36,000 every row is identical to the defaults without the gland: no body has a gland
yet (`gland` 0.000 to 0.010, `toxin_fires` 0, `poisoned` 0), the bench reads 2,439 at 1,540 bodies
(266 ns, the same). At 144,000 (`gate-evolve --brain --predation`, seeds 1, 4, 5, 6, 8):

| Seed | Bodies | M2 and brain bands | `kills_late` | `flesh_late` |
|---|---|---|---|---|
| 1 | 631 | pass | 380 | 0.026 |
| 4 | 774 | pass | 383 | 0.022 |
| 5 | 925 | pass | 1,040 | 0.041 |
| 6 | 939 | **`eye_gap` 0.080** | 374 | 0.014 |
| 8 | 813 | **`eye_gap` 0.082** | 226 | 0.012 |

`probe-hunt` on seeds 1, 2, 3: glands arrive by mutation on seed 3 from 72,000 (`gland` 0.11 to 0.20,
228 to 1,532 clouds per 36,000 ticks, 1 to 6 bodies poisoned per window) and briefly on seed 1
(650 clouds, nobody poisoned); seed 2 has none. `toxin_fire_ctx` 0.000 to 0.014: a cloud fires at
random, not after a hit.

- **"The mechanism fires": shown.** Clouds are made, drawn, and drain; on seed 3 they kill.
- **"Evolution keeps it": not shown.** The gland share at 144,000 against the run without the gland
  (the long read): 0.000 against 0.000, 0.001 against 0.001, 0.198 against 0.059. One seed in three
  grows glands, and it is the seed where they fire.
- **It feeds the hurt input and nothing else moves, except the long gate's verdict.** The two
  `eye_gap` misses at 0.080 and 0.082 are deterministic: the same seeds read 0.11 to 0.18 without
  the gland, and the gland's clouds set those two worlds on another path. Target 5 (5 of 5 at
  144,000) is met with the gland off and not with it on. The final `make gates-long` reads the same.
- No trial is spent: the targets the gland can reach (3 and 5) hold or sit at the band's noise, and
  the two it cannot (1 and 4) are the takeover's. Its defaults are written: `toxin_drain` 0.3,
  `toxin_cost` 2.0. The owner's instruction is that it ships on.

## Part 5: close

### What is still wrong or fragile

Each line says which of the three claims it makes: the mechanism fires, evolution uses it, it helps.

1. **Hunters take over.** The mechanism fires (bites, kills, flesh on every seed). Evolution uses it:
   the mean jaw grows to 0.2 to 1.0 where a jaw bites and stays at 0.1 to 0.2 where it cannot. It does
   not help the world coexist: with the bite on, hunters pass 80% of the living on every seed by
   144,000, prey holds on 1 seed in 3 and comes back after a bust on another. The cause is a rule
   (J1 pays a jaw from the first contact, K1 charges it mass only, a hunter keeps its Filter), the
   fix is a rule, and the owner has it.
2. **The world is thinner and bigger with the bite on.** 486 to 939 bodies at 144,000 against
   1,246 to 1,689 at the M3 exit; `len` 14 to 21 against 10. Inside every band. The mechanism fires
   (adults eat the young, size is a shield). Whether it helps the game is the owner's playtest.
3. **The bench reads at the floor.** 2,440 against 2,400, under the target of 2,600, with 1,540
   bodies at 266 ns per creature-tick. The per-creature cost is the same as before the switch-on;
   the bodies are more. Choice C9: the reference population and the floor are the owner's.
4. **The guards do nothing yet.** A spike or a shell arrives by mutation and does not spread (mean
   size under 0.02 at 144,000 on 8 of 8 seeds read). The mechanism fires in tests; evolution does not
   use it; it does not help. They stay on at `spike_hurt` 1.0 and `shell_block` 1.0.
5. **The gland fires at random.** Clouds come on 1 seed in 3 and fire out of context
   (`toxin_fire_ctx` 0.01). The mechanism fires; evolution keeps it on one seed; it does not help.
6. **The dash and the lunge fire in context**: at 12,000 `dash_fire_ctx` reads 0.99 to 1.00 against
   `dash_think_ctx` 0.09 to 0.15 (a dash fires with a hit or teeth in view ten times as often as
   those are present), and `lunge_fire_ctx` 0.98 to 0.99 against `lunge_think_ctx` 0.58 to 0.78.
   The starter wires are hand-made, so this is "the mechanism fires", not "evolution uses it".
   Whether a dash saves a body is not measured, and no dash-dead arm was run.
7. **The long gate reads 3 of 5 with the gland on**: the eye gap on seeds 6 and 8 at 0.080 and
   0.082, against 0.11 to 0.18 without the gland. Deterministic. Target 5 is not met with every
   rule on.
8. **Two long bands are unset** (`hunt_hi`, `prey_lo` at 144,000) and `flesh_late` at 12,000 fails the
   shipped world. `--predation` judges the set ones in `make gates-long` only.
9. **A victim whose killer died earlier in the same kill list gets no killer** (audit item 2): the
   death card then reads "Eaten." with no body. Open for Task 15 or M5.

### The final proof

`make check && make gates && make gates-long`, run after the defaults of parts 3 and 4 and the
`--predation` flag on the `gates-long` line. The rows follow the run.
