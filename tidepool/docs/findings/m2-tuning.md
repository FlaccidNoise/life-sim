# M2 tuning: the switch-on and the grazing trials

Date: 2026-10-11. Base commit: c5d732c. Task 13 of `docs/plans/2026-10-11-m2-bodies.md`, first stage:
Part 1, Part 2, and trials 1 and 2 of Part 3.

## Result

**The M2 rules are on at their Start values, and the two grazing trials did not meet target 5.**

- The switched-on world passes `gate-health` on 2 of 3 seeds and `gate-evolve` on 1 of 3, and the
  bench is void: 476 creatures on seed 1 at tick 12,000. `make check` exits 0. `make gates` does not.
- Sight kills plants 5 to 7 times as fast as they die with blind eyes, and it empties the rich
  ground first. The seeing world holds 31% to 51% of the creatures of the world with blind eyes.
- Trial 1, `bite_fraction=0.02`: 68% to 88% of the blind world, and body length on its floor (6.1
  to 6.5). Trial 2, `plant_seed_range=96`: 48% to 53%, and no move in length.
- No default changed after Part 1. The fallback of the grazing decision is a rule and is the
  owner's.

## Protocol

- A **reading** is one run of a command on the defaults. It has no hypothesis and it decides nothing.
- A **trial** is `gate-health` on seeds 1, 2, 3 at 12,000 ticks and then `gate-evolve` on the same seeds
  at 36,000 ticks, with one parameter changed by `--param`. The hypothesis is written before the run.
  `params.rs` holds the switched-on defaults for every trial, so each trial runs on the binary of the
  baseline.
- A **look** is one seed at 3,000 ticks or fewer. A look decides nothing. Each one is recorded.
- One simulation ran at a time. Other projects loaded the machine: the load average was 5 to 9 through
  this stage. A count of creatures does not depend on the load. A ticks-per-second figure does, so
  only runs that alternate are compared.

## Part 1: switch on, one group at a time

Each step writes the Start values of one group into `params.rs` and runs `gate-health`. These are
readings. Step 0 is the world before this task: the M2 baseline of `m2-eyes.md`, eyes off.

| Step | Group | Seed 1 | Seed 2 | Seed 3 | Gate |
|---|---|---|---|---|---|
| 0 | none | 1,479 creatures, `max_gen` 13 | 1,286, 12 | 1,223, 11 | 3 of 3 |
| 1 | `push_mass` 1 | 1,349, 10 | 1,413, 13 | 1,163, 12 | 3 of 3 |
| 2 | `motor_curve` 1, `part_mass` 0.1 | 1,213, 10 | 1,228, 11 | 1,206, 14 | 3 of 3 |
| 3 | `upkeep_curve` 1, `intake_curve` 1 | 618, 6 | 526, 7 | 543, 7 | 0 of 3 |
| 4 | `old_cost` 0.2, `brood_max` 4, `mut_life_rate` 0.15 | 720, 7 | 602, 7 | 537, 6 | 0 of 3 |
| 5 | `mut_shape_rate` 0.15, `mut_part_add`, `mut_part_remove`, `mut_part_dup` 0.02 | 726, 11 | 658, 8 | 558, 7 | 2 of 3 |
| 6 | `founder_eye` 0.2 | 476, 7 | 419, 10 | 397, 9 | 2 of 3 |

No seed held fewer than 150 creatures at any step. Every failure is `max_gen` under 8.

The rows:

```
$ target/release/tidepool-headless gate-health        (step 0)
seed=1 creatures=1479 min_late=914 plants=1684 births_late=1468 max_gen=13 mean_chemo=0.47 parked=0.00 first_bud=1590 juv_starved=0.50 to_bud=0.21 PASS
seed=2 creatures=1286 min_late=792 plants=1689 births_late=1250 max_gen=12 mean_chemo=0.50 parked=0.00 first_bud=1528 juv_starved=0.46 to_bud=0.22 PASS
seed=3 creatures=1223 min_late=712 plants=1544 births_late=1295 max_gen=11 mean_chemo=0.56 parked=0.00 first_bud=1498 juv_starved=0.47 to_bud=0.20 PASS
gate-health 3/3 PASS
$ target/release/tidepool-headless gate-health        (step 1)
seed=1 creatures=1349 min_late=838 plants=1722 births_late=1366 max_gen=10 mean_chemo=0.59 parked=0.00 first_bud=1543 juv_starved=0.50 to_bud=0.21 PASS
seed=2 creatures=1413 min_late=738 plants=1567 births_late=1560 max_gen=13 mean_chemo=0.47 parked=0.00 first_bud=1420 juv_starved=0.48 to_bud=0.21 PASS
seed=3 creatures=1163 min_late=673 plants=1550 births_late=1253 max_gen=12 mean_chemo=0.56 parked=0.00 first_bud=1572 juv_starved=0.47 to_bud=0.21 PASS
gate-health 3/3 PASS
$ target/release/tidepool-headless gate-health        (step 2)
seed=1 creatures=1213 min_late=756 plants=1721 births_late=1338 max_gen=10 mean_chemo=0.53 parked=0.00 first_bud=1533 juv_starved=0.48 to_bud=0.22 PASS
seed=2 creatures=1228 min_late=648 plants=1725 births_late=1369 max_gen=11 mean_chemo=0.50 parked=0.00 first_bud=1492 juv_starved=0.45 to_bud=0.22 PASS
seed=3 creatures=1206 min_late=791 plants=1455 births_late=1564 max_gen=14 mean_chemo=0.61 parked=0.00 first_bud=1349 juv_starved=0.53 to_bud=0.21 PASS
gate-health 3/3 PASS
$ target/release/tidepool-headless gate-health        (step 3)
seed=1 creatures=618 min_late=546 plants=2081 births_late=620 max_gen=6 mean_chemo=0.52 parked=0.00 first_bud=2491 juv_starved=0.64 to_bud=0.16 FAIL(max_gen=6 < 8)
seed=2 creatures=526 min_late=525 plants=1904 births_late=569 max_gen=7 mean_chemo=0.52 parked=0.00 first_bud=2510 juv_starved=0.66 to_bud=0.15 FAIL(max_gen=7 < 8)
seed=3 creatures=543 min_late=485 plants=1800 births_late=567 max_gen=7 mean_chemo=0.52 parked=0.00 first_bud=2434 juv_starved=0.66 to_bud=0.16 FAIL(max_gen=7 < 8)
gate-health 0/3 FAIL
$ target/release/tidepool-headless gate-health        (step 4)
seed=1 creatures=720 min_late=628 plants=2019 births_late=867 max_gen=7 mean_chemo=0.53 parked=0.00 first_bud=2488 juv_starved=0.69 to_bud=0.13 FAIL(max_gen=7 < 8)
seed=2 creatures=602 min_late=551 plants=1913 births_late=748 max_gen=7 mean_chemo=0.48 parked=0.00 first_bud=2509 juv_starved=0.69 to_bud=0.13 FAIL(max_gen=7 < 8)
seed=3 creatures=537 min_late=513 plants=1751 births_late=633 max_gen=6 mean_chemo=0.51 parked=0.00 first_bud=2402 juv_starved=0.69 to_bud=0.13 FAIL(max_gen=6 < 8)
gate-health 0/3 FAIL
$ target/release/tidepool-headless gate-health        (step 5)
seed=1 creatures=726 min_late=585 plants=2017 births_late=980 max_gen=11 mean_chemo=0.48 parked=0.00 first_bud=2411 juv_starved=0.69 to_bud=0.13 PASS
seed=2 creatures=658 min_late=530 plants=1907 births_late=917 max_gen=8 mean_chemo=0.49 parked=0.00 first_bud=2371 juv_starved=0.70 to_bud=0.12 PASS
seed=3 creatures=558 min_late=515 plants=1759 births_late=801 max_gen=7 mean_chemo=0.53 parked=0.00 first_bud=2439 juv_starved=0.71 to_bud=0.12 FAIL(max_gen=7 < 8)
gate-health 2/3 FAIL
$ target/release/tidepool-headless gate-health        (step 6)
seed=1 creatures=476 min_late=377 plants=1420 births_late=593 max_gen=7 mean_chemo=0.54 parked=0.00 first_bud=2259 juv_starved=0.66 to_bud=0.15 FAIL(max_gen=7 < 8)
seed=2 creatures=419 min_late=375 plants=1360 births_late=661 max_gen=10 mean_chemo=0.50 parked=0.00 first_bud=2168 juv_starved=0.67 to_bud=0.14 PASS
seed=3 creatures=397 min_late=350 plants=1285 births_late=520 max_gen=9 mean_chemo=0.55 parked=0.00 first_bud=2244 juv_starved=0.67 to_bud=0.14 PASS
gate-health 2/3 FAIL
```

What the steps show. Each is one run per seed, so each is "measured on 3 seeds, once".

- **Step 3 halves the world and slows the generation.** With the two size curves on, the world holds
  526 to 618 creatures against 1,206 to 1,228, `first_bud` rises from 1,349 to 1,533 up to 2,434 to
  2,510, and `max_gen` falls from 10 to 14 down to 6 to 7. `m1-tuning.md` point 2 said this would
  happen when bodies stop shrinking: a body of founder size reaches its first bud at about 2,150
  ticks. The plants rise (1,800 to 2,081 against 1,455 to 1,725): fewer mouths.
- **Step 3 also raises the share of newborns that starve as juveniles**, from 0.45 to 0.53 up to 0.64
  to 0.66. Steps 4 and 5 raise it to 0.69 to 0.71.
- **Step 6 thins the world by a quarter to a third**: 397 to 476 creatures against 558 to 726, and the
  plants fall from 1,759 to 2,017 down to 1,285 to 1,420. `m2-eyes.md` read the same effect on the M1
  rules.
- `max_gen` passes or fails by one generation on most seeds from step 3 on. It is the weak measure of
  the health gate in this world, as it was in M1.

### The three numbers of decision 4 (step 1)

Decision 4 asks for three measures before and after the push is split by mass.

**Throughput.** `node scripts/bench-wasm.mjs` on one `.wasm`, with and without `--param push_mass=1`,
in turn, 3 rounds. Load average 5.5 to 6.0.

| Arm | Settled world, seed 1 | Mean alive | Median ticks per second, by round |
|---|---|---|---|
| Before (`push_mass` 0) | 1,479 creatures, 1,684 plants | 1,483 | 4,036, 3,993, 3,997 |
| After (`push_mass` 1) | 1,349 creatures, 1,722 plants | 1,343 | 4,228, 4,216, 4,208 |

The two arms do not time the same world: the split push changes the world, and the world after holds
9% fewer creatures. Ticks per second times mean alive is 5.95 million before and 5.67 million after.
So the reading is 5% higher per tick and 5% lower per creature. The second figure is the fairer one,
and it is inside what a different world can do. Both arms are 1.7 times the floor.

**The share of newborns that starve as juveniles** (`juv_starved`, seeds 1, 2, 3): 0.50, 0.46, 0.47
before. 0.50, 0.48, 0.47 after. No change.

**The speed that a possessed adult keeps in a crowd** (`probe-crowd`, ratio of mean speed to top
speed):

```
$ target/release/tidepool-headless probe-crowd --seeds 1,2,3                        (before)
seed=1 tick=3000 uid=686 neighbours=11 held=200 mean_speed=1.35 top_speed=1.95 ratio=0.69
seed=2 tick=3000 uid=226 neighbours=18 held=200 mean_speed=1.39 top_speed=1.79 ratio=0.78
seed=3 tick=3000 uid=495 neighbours=10 held=200 mean_speed=1.26 top_speed=1.32 ratio=0.95
$ target/release/tidepool-headless probe-crowd --seeds 1,2,3 --param push_mass=1    (after)
seed=1 tick=3000 uid=627 neighbours=9 held=200 mean_speed=1.25 top_speed=1.38 ratio=0.90
seed=2 tick=3000 uid=554 neighbours=13 held=200 mean_speed=1.09 top_speed=1.55 ratio=0.70
seed=3 tick=3000 uid=286 neighbours=9 held=200 mean_speed=1.27 top_speed=1.61 ratio=0.79
```

0.69, 0.78, 0.95 before and 0.90, 0.70, 0.79 after. The mean is 0.81 and 0.80. This is not a paired
reading: the two worlds differ by tick 3,000, so the probe holds another body in another crowd on
every seed. It shows no loss of speed in a crowd that is larger than the spread between seeds. It
cannot show a small one.

**Kind of claim:** the mechanism fires (the rows of step 1 differ from step 0). Nothing here shows
that the split push helps or that evolution uses it.

### Step 6: the bench is void

```
$ node scripts/bench-wasm.mjs
settled tick=12000 creatures=476 plants=1420
run 1 creatures=452 tps=10289
VOID: population fell
```

As expected. The switched-on world of seed 1 holds 476 creatures and the bench needs a mean of 1,200.
`make gates` stops at its first step with the same line from the native bench.

### The defaults are the Start values and nothing else moved

Before any default changed, with the flag `--m2` of Task 12:

```
$ target/release/tidepool-headless gate-health --m2
seed=1 creatures=476 min_late=377 plants=1420 births_late=593 max_gen=7 mean_chemo=0.54 parked=0.00 first_bud=2259 juv_starved=0.66 to_bud=0.15 FAIL(max_gen=7 < 8)
seed=2 creatures=419 min_late=375 plants=1360 births_late=661 max_gen=10 mean_chemo=0.50 parked=0.00 first_bud=2168 juv_starved=0.67 to_bud=0.14 PASS
seed=3 creatures=397 min_late=350 plants=1285 births_late=520 max_gen=9 mean_chemo=0.55 parked=0.00 first_bud=2244 juv_starved=0.67 to_bud=0.14 PASS
gate-health 2/3 FAIL
$ target/release/tidepool-headless gate-evolve --m2
seed=1 creatures=475 creatures_noscent=340 creatures_noeye=927 len=7.9 len_sd=1.57 parts=5.2 chemo=0.50 chemo_blind=0.13 eye=0.34 eye_blind=0.16 plans=2 speed_cv=0.20 PASS
seed=2 creatures=299 creatures_noscent=417 creatures_noeye=800 len=6.3 len_sd=0.66 parts=6.0 chemo=0.53 chemo_blind=0.36 eye=0.38 eye_blind=0.10 plans=2 speed_cv=0.20 FAIL(len=6.28 < 7.8)
seed=3 creatures=296 creatures_noscent=322 creatures_noeye=958 len=6.8 len_sd=0.89 parts=6.1 chemo=0.55 chemo_blind=0.29 eye=0.40 eye_blind=0.12 plans=4 speed_cv=0.14 FAIL(len=6.81 < 7.8)
gate-evolve 1/3 FAIL
```

After step 6, `gate-health` and `gate-evolve` with no flag print the same rows, digit for digit
(`diff` of the two outputs is empty for each gate). 13 defaults changed. The other 14 rows of the
`--m2` list already held their Start value. Then `--m2` and its list were deleted from `main.rs`, and
`gate-health` printed the same rows again. The `gate-evolve` rows above are also the first reading of
`gates.md`: the world has not moved since Task 12.

`gate-evolve` took 30 and 32 seconds at a load average of 6 to 7.

### Tests that pinned an old default

23 tests failed at the new defaults. Each now sets the old value of the default that it relied on.
No test was deleted and no assertion was changed.

| Test | Sets | Why |
|---|---|---|
| `frame.rs` `a_record_holds_one_word_for_each_part_and_zeros_after_them` | `founder_eye` 0 | It asserts the four parts of a founder with no eye |
| `tests/abi.test.ts` `a founder record unpacks to its four parts, and to an eye with founder_eye` | `founder_eye` 0 for the first half | The same |
| `brain.rs` `the_starter_brain_has_the_documented_shape` | `founder_eye` 0 | It asserts the 39 connections of the brain with no eye |
| `brain.rs` `the_starter_brain_of_a_founder_with_an_eye_adds_the_eye_wires` | `founder_eye` 0 for the plain brain | It compares a brain with an eye against one with none |
| `energy.rs` `the_founder_pays_the_same_upkeep_on_both_curves` | `founder_eye` 0 | The two curves meet at the reference body, which has no eye |
| `energy.rs` `an_eye_and_the_mass_of_parts_cost_upkeep` | `upkeep_curve` 0 | Its arithmetic is for upkeep that follows mass |
| `motor.rs` `a_slender_body_is_faster` | `motor_curve` 0 | Wrong by design at `motor_curve` 1, as the plan says |
| `genome.rs` `a_founder_is_the_m1_body_as_parts` | `founder_eye` 0 | It asserts the four M1 parts |
| `genome.rs` `founder_eye_adds_a_fifth_part_and_moves_no_other_draw` | `founder_eye` 0 for the plain founder | It compares an eyed founder against a plain one |
| `genome.rs` `with_every_m2_rate_at_0_a_mutation_makes_the_m1_draws_and_no_more` | The five M2 mutation rates at 0 for `by_default` | See the note below |
| `genome.rs` `add_puts_a_small_new_part_on_the_end_with_a_new_id` | `founder_eye` 0, the other M2 rates 0 | It counts on four founder parts and on no other change to the list |
| `genome.rs` `a_full_genome_takes_no_more_parts` | The same | The same, and it counts history ids |
| `genome.rs` `remove_takes_one_part_and_an_empty_list_stays_empty` | The same | The same, and a part that stays must equal the parent's |
| `genome.rs` `duplicate_copies_kind_size_and_extra_under_a_new_id` | The other M2 rates 0 | It counts on one new part per birth |
| `genome.rs` `shape_and_life_genes_move_and_stay_in_range` | The part mutations at 0 | It compares the parts of two genomes slot by slot |
| `repro.rs` `a_fed_adult_buds_a_child_that_carries_its_line` | `brood_max` 1 | It asserts one child |
| `repro.rs` `budding_conserves_energy` | `brood_max` 1, `part_mass` 0 | One child, and its arithmetic takes the mass as the area |
| `repro.rs` `cooldown_spaces_out_buds` | `brood_max` 1 | It counts one birth per bud |
| `repro.rs` `brood_max_1_is_the_m1_bud` | `part_mass` 0 | Its arithmetic takes the mass as the area. It already set `brood_max` |
| `repro.rs` `a_body_that_just_budded_carries_the_flag` | `brood_max` 1 | It asserts one child |
| `repro.rs` `mutation_stays_in_range_and_rate_zero_copies` | The five M2 mutation rates at 0 | It reads the four founder parts by kind and asserts an equal part list |
| `snapshot.rs` `a_load_expresses_every_body_again` | `mut_shape_rate` and the three part mutations at 0 | It asserts two eye cones on every body after 1,500 ticks |
| `probes.rs` `follow_agrees_with_possess_and_write_heirs` | `brood_max` 1 | See the note below |

Two of these need a note.

- **`with_every_m2_rate_at_0_...` now compares two equal tables in its first two assertions.** It
  asked that a mutation at the defaults equals a mutation with every M2 rate at 0. That was the
  switch-on rule, and Task 13 ends it on purpose. With the old values set, both sides use the same
  table, so those two assertions can no longer fail. The rest of the test still tests: the count of
  draws with every rate at 0, and that the M1 genes are the same with the M2 groups on.
- **`follow_agrees_with_possess_and_write_heirs` depends on which picks it checks.** It checks 11 picks
  of about 600 and needs at least one with an heir and one without. At the new defaults 14% of the
  picks have an heir (`probe-heirs --pick 150 --param lifespan=600`) and none of the 11 does. With
  `brood_max` 1 the share is 20% and the 11 hold both kinds. The test is a check of the probe
  against `World::possess`, and it still makes that check.

Three edits are outside the files that the task named: the test module of `crates/sim/src/frame.rs`,
the test module of `crates/headless/src/probes.rs`, and the comment above the table of `params.rs`,
which said that the M2 defaults leave the M1 world as it was.

`make check` exits 0.

## Part 2: measured before tuning

### The baseline of every trial

The switched-on defaults. These are the step 6 rows of Part 1.

```
$ target/release/tidepool-headless gate-health
seed=1 creatures=476 min_late=377 plants=1420 births_late=593 max_gen=7 mean_chemo=0.54 parked=0.00 first_bud=2259 juv_starved=0.66 to_bud=0.15 FAIL(max_gen=7 < 8)
seed=2 creatures=419 min_late=375 plants=1360 births_late=661 max_gen=10 mean_chemo=0.50 parked=0.00 first_bud=2168 juv_starved=0.67 to_bud=0.14 PASS
seed=3 creatures=397 min_late=350 plants=1285 births_late=520 max_gen=9 mean_chemo=0.55 parked=0.00 first_bud=2244 juv_starved=0.67 to_bud=0.14 PASS
gate-health 2/3 FAIL
$ target/release/tidepool-headless gate-evolve
seed=1 creatures=475 creatures_noscent=340 creatures_noeye=927 len=7.9 len_sd=1.57 parts=5.2 chemo=0.50 chemo_blind=0.13 eye=0.34 eye_blind=0.16 plans=2 speed_cv=0.20 PASS
seed=2 creatures=299 creatures_noscent=417 creatures_noeye=800 len=6.3 len_sd=0.66 parts=6.0 chemo=0.53 chemo_blind=0.36 eye=0.38 eye_blind=0.10 plans=2 speed_cv=0.20 FAIL(len=6.28 < 7.8)
seed=3 creatures=296 creatures_noscent=322 creatures_noeye=958 len=6.8 len_sd=0.89 parts=6.1 chemo=0.55 chemo_blind=0.29 eye=0.40 eye_blind=0.12 plans=4 speed_cv=0.14 FAIL(len=6.81 < 7.8)
gate-evolve 1/3 FAIL
```

The baseline against the six targets of the plan:

| Target | Baseline |
|---|---|
| 1. `gate-health` 3 of 3 | 2 of 3. `max_gen` 7 on seed 1 |
| 2. The bench: 1,200 creatures on seed 1 at tick 12,000 | 476. Void |
| 3. `len` and `len_sd` 3 of 3 | 1 of 3. `len` 7.9, 6.3, 6.8 against 7.8 |
| 4. `parts` and the two gaps 3 of 3 | 3 of 3. `parts` 5.2 to 6.1. Scent gap 0.37, 0.17, 0.26. Eye gap 0.18, 0.28, 0.28 |
| 5. `creatures` at 80% of each blind run | Against `creatures_noeye`: 51%, 37%, 31%. Against `creatures_noscent`: 140%, 72%, 92% |
| 6. An adult picked at tick 3,000 has an heir in 60% of picks | 69%, 60%, 74%. Met, with seed 2 on the line |

### `probe-plants`: where the plants go

`probe-plants --seeds 1,2,3` with the senses on, with `--param chemo_gain=0`, and with
`--param eye_gain=0`. One run each. The first and the last row of 9 for each seed:

| Arm | Seed | Plants, tick 4,000 and 36,000 | Cells that hold a plant | Plant deaths, ticks 32,000 to 36,000 | `reserve01` at 36,000 | Creatures at 36,000 |
|---|---|---|---|---|---|---|
| Senses on | 1 | 1,665 and 1,030 | 666 and 504 | 2,100 | 0.62 | 475 |
| Senses on | 2 | 1,630 and 655 | 639 and 359 | 1,790 | 0.63 | 299 |
| Senses on | 3 | 1,491 and 719 | 582 and 372 | 1,778 | 0.64 | 296 |
| `chemo_gain=0` | 1 | 1,819 and 755 | 697 and 370 | 1,770 | 0.66 | 340 |
| `chemo_gain=0` | 2 | 1,641 and 951 | 645 and 466 | 2,284 | 0.62 | 417 |
| `chemo_gain=0` | 3 | 1,524 and 844 | 600 and 406 | 1,810 | 0.65 | 322 |
| `eye_gain=0` | 1 | 2,105 and 1,924 | 738 and 718 | 829 | 0.65 | 927 |
| `eye_gain=0` | 2 | 1,979 and 1,860 | 687 and 677 | 680 | 0.65 | 800 |
| `eye_gain=0` | 3 | 1,834 and 1,705 | 647 and 636 | 639 | 0.62 | 958 |

What it shows, in numbers:

- **Where sight works, a plant dies 5 to 7 times as often.** Over ticks 32,000 to 36,000 the seeing
  world loses 0.51, 0.62, and 0.55 plants per living plant per 1,000 ticks. The world with blind eyes
  loses 0.11, 0.09, and 0.09. Over ticks 4,000 to 8,000 on seed 1 it is 0.26 against 0.07. Fewer
  creatures kill more plants: on seed 1, 475 kill 2,100 where 927 kill 829.
- **New seedlings replace 94% to 96% of the dead, and the rest adds up.** Over ticks 4,000 to 36,000
  the seeing world of seed 1 has 16,844 plant deaths and 16,209 seedlings. Seed 2: 15,094 and
  14,119. Seed 3: 14,049 and 13,277. The plants fall by 38%, 60%, and 52%.
- **The cells empty with the plants.** Cells that hold a plant fall by 24%, 44%, and 36% from tick
  4,000 to tick 36,000. With blind eyes they fall by 3%, 1%, and 2%.
- **The plants that live are as full as in the blind world.** Mean `reserve01` is 0.62 to 0.64 with
  sight and 0.62 to 0.65 without. So the grazers do not hold the plants cropped. A plant that is
  found is eaten to death, and the others stand full.
- **The direction of the scent is not the cause.** With `chemo_gain=0` and eyes that see, the world
  thins the same: cells fall by 47%, 28%, and 32%, and plants die at 1,770 to 2,284 per 4,000 ticks.
  So the thinning of M1, which went with scent following, is not what thins the M2 world. In M2 it
  is sight.

A scratch census outside the repo read the same runs by cell. Its rows give the plants, the cells,
the creatures, and the plant deaths of `probe-plants`, digit for digit. It splits the cells where a
seed can root (fertility 0.15 or more) into poor (under 0.3), middle, and rich (0.6 or more).

| Reading at tick 36,000 | Seed 1 | Seed 2 | Seed 3 |
|---|---|---|---|
| Cells where a seed can root, and the patches they form | 743 in 2 | 692 in 3 | 655 in 6 |
| Patches with no plant, senses on | 0 | 0 | 0 |
| Rich cells that hold a plant, senses on | 57 of 178 | 21 of 140 | 37 of 171 |
| Rich cells that hold a plant, `eye_gain=0` | 155 of 178 | 128 of 140 | 154 of 171 |
| Middle cells that hold a plant, senses on | 147 of 220 | 108 of 235 | 99 of 194 |
| Poor cells that hold a plant, senses on | 300 of 345 | 230 of 317 | 236 of 290 |
| Mean fertility of an empty cell, and of a cell with a plant, senses on | 0.59 and 0.34 | 0.51 and 0.30 | 0.61 and 0.32 |
| Empty cells with no seeding plant within 48 units of the centre, senses on | 65 of 239 | 141 of 333 | 114 of 283 |
| The same within 96 units | 1 of 239 | 28 of 333 | 3 of 283 |
| The same within 48 units at tick 4,000 | 9 of 77 | 6 of 53 | 18 of 73 |
| Creatures on barren, poor, middle, and rich cells, senses on | 14, 214, 163, 84 | 9, 171, 85, 34 | 10, 157, 91, 38 |
| The same, `eye_gain=0` | 6, 226, 364, 331 | 11, 174, 385, 230 | 18, 209, 315, 416 |

A seeding plant is one at 0.7 of its limit or more. A patch is a set of rootable cells that touch.

- **The plants go from the rich ground.** With sight, 68% to 85% of the rich cells are empty at tick
  36,000 and 13% to 27% of the poor cells. With blind eyes, 9% to 13% of the rich cells are empty and
  no poor cell is. The grazers strip the best ground and the plants live on at the edges, where a
  plant holds less.
- **No patch is lost.** The guess of `m1-tuning.md` was that a patch that loses every plant is not
  seeded again. No patch lost every plant on any seed. The fertile ground of these worlds is 2 to 6
  patches, not 14: the blobs overlap.
- **Early, the empty cells are in reach of seed and still empty.** At tick 4,000 the rich cells that
  hold a plant are already down to 120, 108, and 115, and 75% to 89% of the empty cells have a
  seeding plant within 48 units. Late, 27% to 42% of the empty cells have none within 48 units and
  0% to 8% have none within 96.
- **About half of the plants are full enough to seed in both worlds**: 45% to 49% with sight and 46%
  to 51% with blind eyes at tick 36,000.

Kind of claim, for each:

| Claim | Kind |
|---|---|
| Sight kills plants faster than they are replaced, and it empties the rich ground first | The mechanism fires. Measured on 3 of 3 seeds, one run each |
| Evolution keeps the eyes where they see | Evolution uses it. The eye gap of the baseline is 0.18, 0.28, 0.28 |
| Sight helps the world | It does not. The seeing world holds 31% to 51% of the creatures of the world with blind eyes |
| The direction of the scent thins the M2 world | Not shown. `creatures` against `creatures_noscent` is 140%, 72%, 92% |
| A seedling that lands on stripped rich ground is eaten before it grows | Guessed, not measured. The census does not follow a seedling |

### `probe-heirs`

```
$ target/release/tidepool-headless probe-heirs --seeds 1,2,3 --pick 3000
seed=1 pick=3000 group=all picks=429 heir=0.41 median_ticks=1536
seed=1 pick=3000 group=adults picks=147 heir=0.69 median_ticks=1165
seed=1 pick=3000 group=juveniles picks=282 heir=0.26 median_ticks=1916
seed=2 pick=3000 group=all picks=426 heir=0.34 median_ticks=1364
seed=2 pick=3000 group=adults picks=128 heir=0.60 median_ticks=1040
seed=2 pick=3000 group=juveniles picks=298 heir=0.23 median_ticks=1639
seed=3 pick=3000 group=all picks=356 heir=0.39 median_ticks=1456
seed=3 pick=3000 group=adults picks=110 heir=0.74 median_ticks=1226
seed=3 pick=3000 group=juveniles picks=246 heir=0.24 median_ticks=1526
$ target/release/tidepool-headless probe-heirs --seeds 1,2,3 --pick 12000
seed=1 pick=12000 group=all picks=476 heir=0.36 median_ticks=1002
seed=1 pick=12000 group=adults picks=172 heir=0.63 median_ticks=1233
seed=1 pick=12000 group=juveniles picks=304 heir=0.21 median_ticks=818
seed=2 pick=12000 group=all picks=419 heir=0.37 median_ticks=1079
seed=2 pick=12000 group=adults picks=155 heir=0.65 median_ticks=1201
seed=2 pick=12000 group=juveniles picks=264 heir=0.20 median_ticks=1049
seed=3 pick=12000 group=all picks=397 heir=0.37 median_ticks=989
seed=3 pick=12000 group=adults picks=154 heir=0.62 median_ticks=942
seed=3 pick=12000 group=juveniles picks=243 heir=0.21 median_ticks=1051
```

An adult has an heir at its death in 69%, 60%, and 74% of picks at tick 3,000 and in 63%, 65%, and
62% at tick 12,000. Target 6 asks for 60% at tick 3,000 on 3 of 3 seeds. It is met, and seed 2 is on
the line: 77 of 128. A juvenile has one in 20% to 26%. Two picks in three are juveniles. This is
the brain's result, not a player's. The kind of claim is "the mechanism fires": the mark reaches the
living descendants.

## Part 3: the two grazing trials

### Looks before the trials

Seed 1 at tick 3,000. A look decides nothing. The first row is the baseline.

| Change | Plants | Plant deaths | Cells | `reserve01` | `creatures` | `creatures_noscent` | `creatures_noeye` | `len` |
|---|---|---|---|---|---|---|---|---|
| none | 1,705 | 1,184 | 662 | 0.65 | 429 | 477 | 572 | 11.6 |
| `bite_fraction=0.03` | 2,000 | 605 | 716 | 0.70 | 547 | 613 | 595 | 11.4 |
| `bite_fraction=0.025` | 2,066 | 446 | 728 | 0.74 | 555 | 602 | 633 | 11.4 |
| `bite_fraction=0.02` | 2,136 | 315 | 742 | 0.77 | 595 | 621 | 599 | 11.2 |
| `bite_fraction=0.015` | 2,184 | 202 | 741 | 0.82 | 549 | 411 | 515 | 11.2 |
| `bite_fraction=0.01` | 2,223 | 41 | 743 | 0.90 | 416 | 185 | 327 | 11.0 |
| `bite_fraction=0.005` | 2,228 | 0 | 743 | 1.00 | 28 | 2 | 13 | 11.6 |
| `plant_seed_range=96` | 1,817 | 1,244 | 700 | 0.62 | 531 | 551 | 551 | 11.6 |

Each row is `probe-plants --seed 1 --ticks 3000` and `gate-evolve --seeds 1 --ticks 3000` with the
change.

### Trial 1: `bite_fraction` 0.05 to 0.02

**Why 0.02.** One grazer that takes `bite_fraction` of the reserve each tick holds a plant at
`1 - bite_fraction / plant_growth` of its limit (`m1-tuning.md`). `plant_growth` is 0.02.

- At 0.05 that number is below 0: one hungry grazer alone eats a plant to death, in about 150
  ticks from a reserve of 13. `probe-plants` shows the result: a plant that is found dies, and the
  rest stand full.
- At 0.02 the number is 0. It is the largest bite at which one grazer alone cannot kill a plant in
  less than thousands of ticks. Two hungry grazers on one plant still kill it, in about 200 ticks.
- At 0.01, half of `plant_growth`, one grazer holds a plant at half of its limit, where a plant
  grows fastest. But a full plant on the best ground then gives 0.2 per tick. A founder pays about
  0.1 per tick and touches a plant about a third of the time (`m1-tuning.md`), so it takes about
  0.07 and starves. The looks agree: 416, 185, and 327 creatures at tick 3,000, against 595, 621,
  and 599 at 0.02.

So 0.02 is the bite that ends the kill by one grazer and still feeds a founder.

**Hypothesis, written before the run.**

- **Plants.** Plant deaths fall by more than half and the rich cells keep their plants. `plants` at
  tick 12,000: 1,900 to 2,200 on every seed, against 1,285 to 1,420. Cells at tick 36,000: 640 to
  740, against 359 to 504.
- **`creatures` at tick 12,000**: 600 to 800 on every seed, against 397 to 476. The world with blind
  eyes holds 519 to 689 there, and the seeing world should now hold at least that. Seed 1 stays
  under the 1,200 of the bench, so target 2 is not met.
- **`max_gen`**: 7 to 9. The first bud stays near 2,200 ticks, so at least one seed fails the band of
  8 and `gate-health` reads 1 or 2 of 3.
- **`creatures` at tick 36,000**: 650 to 950, against 475, 299, 296.
- **`creatures_noeye`**: 700 to 950, about where it is (927, 800, 958). The world with blind eyes
  kills few plants at any bite, so a smaller bite only feeds it less.
- **Target 5 against `creatures_noeye`**: 80% or more on at least 2 of 3 seeds.
- **`len`: lower, 6.2 to 7.5 on every seed, and the `len` band fails 3 of 3.** Rule S2 says the best
  body is the one whose mouth takes all that the plants under it give. A mouth takes
  `intake_rate * filter * area / 6`, which is `0.008 * area` per tick for a filter of 0.6. A plant
  gives `bite_fraction * reserve`. The two are equal at `area = 125 * bite_fraction * reserve`. At
  0.05 and a reserve of 5 (the mean plant of the baseline: fertility 0.30 to 0.38, `reserve01`
  0.63) that is an area of 31, which is a length of 7.9 at the founder's width. The baseline reads
  7.9, 6.3, 6.8. At 0.02 the same plant feeds an area of 12, and the smallest body at the founder's
  width has 18. A rich plant with a reserve of 13 feeds an area of 32. So a smaller bite makes the
  plants set a smaller body, and this trial should move `len` away from target 3 while it moves
  `creatures` toward target 5.

**Result.**

```
$ target/release/tidepool-headless gate-health --param bite_fraction=0.02
seed=1 creatures=860 min_late=648 plants=1996 births_late=1021 max_gen=7 mean_chemo=0.50 parked=0.00 first_bud=2201 juv_starved=0.55 to_bud=0.16 FAIL(max_gen=7 < 8)
seed=2 creatures=1057 min_late=803 plants=1751 births_late=2209 max_gen=13 mean_chemo=0.49 parked=0.00 first_bud=1475 juv_starved=0.65 to_bud=0.16 PASS
seed=3 creatures=784 min_late=704 plants=1642 births_late=1267 max_gen=11 mean_chemo=0.49 parked=0.00 first_bud=1918 juv_starved=0.63 to_bud=0.15 PASS
gate-health 2/3 FAIL
$ target/release/tidepool-headless gate-evolve --param bite_fraction=0.02
seed=1 creatures=1153 creatures_noscent=1223 creatures_noeye=1316 len=6.3 len_sd=0.59 parts=6.1 chemo=0.53 chemo_blind=0.21 eye=0.38 eye_blind=0.12 plans=5 speed_cv=0.23 FAIL(len=6.33 < 7.8)
seed=2 creatures=1071 creatures_noscent=1210 creatures_noeye=1233 len=6.1 len_sd=0.38 parts=6.4 chemo=0.47 chemo_blind=0.28 eye=0.38 eye_blind=0.08 plans=3 speed_cv=0.22 FAIL(len=6.12 < 7.8, len_sd=0.38 < 0.5)
seed=3 creatures=874 creatures_noscent=942 creatures_noeye=1283 len=6.5 len_sd=0.99 parts=6.2 chemo=0.43 chemo_blind=0.25 eye=0.33 eye_blind=0.14 plans=4 speed_cv=0.21 FAIL(len=6.48 < 7.8)
gate-evolve 0/3 FAIL
```

`gate-evolve` took 59 seconds at a load average of 9: the world holds more than twice the creatures.

More readings of this set. None is a trial.

| Reading | Seed 1 | Seed 2 | Seed 3 |
|---|---|---|---|
| Plants at ticks 4,000, 12,000, 36,000 | 2,126, 1,996, 1,693 | 1,991, 1,751, 1,498 | 1,865, 1,642, 1,320 |
| Cells that hold a plant at the same ticks | 735, 726, 674 | 685, 660, 612 | 648, 620, 548 |
| Plant deaths in the 4,000 ticks before each | 436, 784, 1,353 | 396, 879, 1,105 | 446, 878, 1,236 |
| `reserve01` at the same ticks | 0.76, 0.70, 0.62 | 0.74, 0.63, 0.60 | 0.75, 0.67, 0.62 |
| Rich cells that hold a plant at tick 36,000 (scratch census) | 122 of 178 | 80 of 140 | 90 of 171 |
| With `eye_gain=0`: plants at tick 36,000, and cells | 2,188 and 741 | 2,056 and 691 | 1,934 and 655 |
| With `eye_gain=0`: plant deaths, ticks 32,000 to 36,000 | 125 | 95 | 100 |
| `probe-heirs --pick 3000`, adults | 0.56 | 0.61 | 0.61 |
| `node scripts/bench-wasm.mjs`, seed 1 | Void: a mean of 868 alive | | |

**Verdict: the world fills and the bodies run to the floor. It is not a candidate for the
defaults.**

| Target | Trial 1 | Against the baseline |
|---|---|---|
| 1. `gate-health` 3 of 3 | 2 of 3. `max_gen` 7 on seed 1 | The same |
| 2. 1,200 creatures on seed 1 at tick 12,000 | 860. The bench is void | Was 476 |
| 3. `len` and `len_sd` | 0 of 3. `len` 6.3, 6.1, 6.5. `len_sd` 0.38 on seed 2 | Worse. Was 1 of 3 |
| 4. `parts` and the two gaps | 3 of 3. Scent gap 0.32, 0.19, 0.18. Eye gap 0.26, 0.30, 0.19 | The same |
| 5. Against `creatures_noeye` | 88%, 87%, 68%. 2 of 3 | Was 51%, 37%, 31% |
| 5. Against `creatures_noscent` | 94%, 89%, 93%. 3 of 3 | Was 140%, 72%, 92% |
| 6. Heir for an adult picked at tick 3,000 | 56%, 61%, 61%. 2 of 3 | Was 69%, 60%, 74% |

The hypothesis against the result:

- **Right: `len` falls to the floor.** 6.3, 6.1, 6.5 against a floor of 6, inside or just under the
  expected 6.2 to 7.5. On seed 2 the spread fails its band too. The world with blind eyes was not
  read for `len`. This is the arithmetic of rule S2 holding: a smaller bite makes each plant give
  less per tick, and a body larger than the smallest then pays for a mouth that it cannot fill.
  The kind of claim is "evolution uses it", on 3 of 3 seeds.
- **Right: target 5 is met on 2 of 3 seeds against `creatures_noeye`**, and missed on seed 3 at 68%.
- **Right: `max_gen` fails on one seed.** Wrong on the other two: 13 and 11, where 7 to 9 was
  expected. Their first bud came at 1,475 and 1,918 ticks, not 2,200.
- **Wrong: `creatures` is higher than expected.** 860, 1,057, 784 at tick 12,000 against 600 to 800,
  and 1,153, 1,071, 874 at tick 36,000 against 650 to 950.
- **Wrong: `creatures_noeye` did not stay.** It reads 1,316, 1,233, 1,283, against the expected 700
  to 950 and the baseline's 927, 800, 958. The smaller bite did not feed the blind world less. It
  holds 34% to 54% more creatures. Not measured: whether they are smaller bodies.
- **Half right: the plants.** `plants` at tick 12,000 is 1,996, 1,751, 1,642, against the expected
  1,900 to 2,200. Cells at tick 36,000 are 674, 612, 548, against 640 to 740.

What the trial shows beyond its targets:

- **Sight still kills plants at this bite, more slowly, and the kill grows through the run.** Plant
  deaths per 4,000 ticks rise from 396 to 446 at tick 4,000 to 1,105 to 1,353 at tick 36,000. The
  plants fall by 20%, 25%, and 29% from tick 4,000 to tick 36,000, and 31% to 47% of the rich cells
  are empty at the end. With blind eyes at the same bite the plants do not fall (2,222 to 2,188 on
  seed 1) and 95 to 125 plants die per 4,000 ticks: a tenth. So 0.02 slows the thinning and does
  not end it. Nothing longer than 36,000 ticks was run.
- **The bench is still void.** 860 creatures on seed 1 at tick 12,000.
- **Target 6 slips.** An adult of seed 1 has an heir in 56% of picks, against 69%.

### Trial 2: `plant_seed_range` 48 to 96

On the switched-on defaults: `bite_fraction` is back at 0.05.

**Why 96.** The census of Part 2 gives two facts that pull in opposite ways.

- No patch loses every plant, so the guess that started this trial (a patch that dies is too far
  from the next one to be seeded again) is not what happens. Early in the run, 75% to 89% of the
  empty cells have a seeding plant within 48 units and are still empty.
- Late in the run, 27% to 42% of the empty cells have no seeding plant within 48 units of their
  centre, and 0% to 8% have none within 96. So twice the throw puts almost every empty cell in
  reach of seed. A longer throw than 96 would add reach to almost no cell and would throw more
  seed onto barren ground.

**Hypothesis, written before the run.** The throw does not change how fast a found plant dies. That
is the bite. So the plants still die at 0.5 to 0.6 per plant per 1,000 ticks, and the seedlings on
stripped ground are still eaten. More seed reaches the stripped ground and more seed is lost off
the edge of the patches. Expected: a small gain that does not close the gap.

- **`plants` at tick 12,000**: 1,350 to 1,650, against 1,285 to 1,420.
- **`creatures` at tick 12,000**: 420 to 560, against 397 to 476. `max_gen` 7 to 10, and
  `gate-health` 2 or 3 of 3.
- **`creatures` at tick 36,000**: 320 to 520, against 475, 299, 296. Cells at tick 36,000: 400 to
  560, against 359 to 504.
- **`creatures_noeye`**: 800 to 960, as it is. The world with blind eyes has almost no empty cell to
  seed.
- **Target 5 against `creatures_noeye`**: 35% to 60%. Not met on any seed.
- **`len`**: no move beyond the spread between seeds, 6.2 to 8.0. The plants that live hold what
  they held, so rule S2 sets the same body. The `len` band fails on at least 2 of 3 seeds.

**Result.**

```
$ target/release/tidepool-headless gate-health --param plant_seed_range=96
seed=1 creatures=466 min_late=436 plants=1552 births_late=571 max_gen=7 mean_chemo=0.50 parked=0.00 first_bud=2339 juv_starved=0.66 to_bud=0.14 FAIL(max_gen=7 < 8)
seed=2 creatures=458 min_late=404 plants=1453 births_late=668 max_gen=8 mean_chemo=0.51 parked=0.00 first_bud=2244 juv_starved=0.67 to_bud=0.13 PASS
seed=3 creatures=463 min_late=405 plants=1265 births_late=686 max_gen=9 mean_chemo=0.51 parked=0.00 first_bud=2037 juv_starved=0.67 to_bud=0.14 PASS
gate-health 2/3 FAIL
$ target/release/tidepool-headless gate-evolve --param plant_seed_range=96
seed=1 creatures=486 creatures_noscent=410 creatures_noeye=1020 len=7.1 len_sd=0.82 parts=6.2 chemo=0.45 chemo_blind=0.35 eye=0.38 eye_blind=0.19 plans=4 speed_cv=0.25 FAIL(len=7.15 < 7.8, chemo_gap=0.096 < 0.1)
seed=2 creatures=444 creatures_noscent=463 creatures_noeye=900 len=6.8 len_sd=0.82 parts=6.6 chemo=0.56 chemo_blind=0.11 eye=0.40 eye_blind=0.24 plans=3 speed_cv=0.20 FAIL(len=6.75 < 7.8)
seed=3 creatures=452 creatures_noscent=348 creatures_noeye=859 len=6.6 len_sd=1.17 parts=6.2 chemo=0.50 chemo_blind=0.34 eye=0.39 eye_blind=0.18 plans=5 speed_cv=0.15 FAIL(len=6.57 < 7.8)
gate-evolve 0/3 FAIL
```

More readings of this set. None is a trial.

| Reading | Seed 1 | Seed 2 | Seed 3 |
|---|---|---|---|
| Plants at ticks 4,000, 12,000, 36,000 | 1,776, 1,552, 966 | 1,686, 1,453, 911 | 1,508, 1,265, 856 |
| The baseline at tick 36,000 | 1,030 | 655 | 719 |
| Cells that hold a plant at the same ticks | 691, 653, 514 | 650, 618, 479 | 604, 552, 450 |
| The baseline at tick 36,000 | 504 | 359 | 372 |
| Plant deaths per living plant per 1,000 ticks, ticks 32,000 to 36,000 | 0.60 | 0.56 | 0.49 |
| The baseline | 0.51 | 0.62 | 0.55 |
| Rich cells that hold a plant at tick 36,000 (scratch census) | 72 of 178 | 54 of 140 | 68 of 171 |
| The baseline | 57 | 21 | 37 |
| With `eye_gain=0`: plants at tick 36,000, and cells | 1,998 and 733 | 1,857 and 685 | 1,720 and 639 |
| `probe-heirs --pick 3000`, adults | 0.69 | 0.67 | 0.68 |
| `node scripts/bench-wasm.mjs`, seed 1 | Void: 468 alive | | |

**Verdict: a small gain on 2 of 3 seeds, and the gap stays. It is not a candidate for the
defaults.**

| Target | Trial 2 | Against the baseline |
|---|---|---|
| 1. `gate-health` 3 of 3 | 2 of 3. `max_gen` 7 on seed 1 | The same |
| 2. 1,200 creatures on seed 1 at tick 12,000 | 466. The bench is void | Was 476 |
| 3. `len` and `len_sd` | 0 of 3. `len` 7.1, 6.8, 6.6 | Was 1 of 3, with seed 1 at 7.9 against 7.8 |
| 4. `parts` and the two gaps | 2 of 3. Scent gap 0.096, 0.45, 0.16. Eye gap 0.19, 0.16, 0.21 | Was 3 of 3 |
| 5. Against `creatures_noeye` | 48%, 49%, 53%. 0 of 3 | Was 51%, 37%, 31% |
| 5. Against `creatures_noscent` | 119%, 96%, 130%. 3 of 3 | Was 140%, 72%, 92% |
| 6. Heir for an adult picked at tick 3,000 | 69%, 67%, 68%. 3 of 3 | Was 69%, 60%, 74% |

The hypothesis against the result:

- **Right: a small gain that does not close the gap.** `creatures` at tick 36,000 is 486, 444, 452,
  inside the expected 320 to 520. Seed 1 does not move (475 before). Seeds 2 and 3 gain a half
  (299 and 296 before). Against `creatures_noeye` the world holds 48% to 53%.
- **Right: a found plant dies as fast as before.** 0.49 to 0.60 deaths per plant per 1,000 ticks,
  against 0.51 to 0.62. The plants still fall by 43% to 46% from tick 4,000 to tick 36,000.
- **Right: `len` does not move beyond the spread.** 7.1, 6.8, 6.6 against 7.9, 6.3, 6.8.
- **Right: `creatures` at tick 12,000** is 466, 458, 463, inside 420 to 560. `max_gen` is 7, 8, 9.
- **Half right: the plants at tick 12,000.** 1,552, 1,453, 1,265 against the expected 1,350 to
  1,650. Seed 3 is under it and under its baseline of 1,285.
- **Wrong by a little: `creatures_noeye` on seed 1** is 1,020, over the expected 800 to 960.
- **Not expected: seed 1 fails the scent gap**, at 0.096 against 0.10. The band came from chance
  gaps of up to 0.073 (`gates.md`), so one seed in 3 at 0.096 is a weak sign, not a finding.

What the trial shows beyond its targets:

- **The look was wrong again.** At tick 3,000 on seed 1 the longer throw read 531 creatures against
  429. At tick 36,000 the same seed reads 486 against 475.
- **More seed reaches the rich ground and does not hold it.** 39% to 40% of the rich cells hold a
  plant at tick 36,000, against 15% to 32%. With blind eyes 87% to 91% do.

## Where the two trials leave the targets

| Target | Baseline | Trial 1: `bite_fraction=0.02` | Trial 2: `plant_seed_range=96` |
|---|---|---|---|
| 1. `gate-health` | 2 of 3 | 2 of 3 | 2 of 3 |
| 2. `creatures` on seed 1 at tick 12,000, of 1,200 | 476 | 860 | 466 |
| 3. `len` | 7.9, 6.3, 6.8 | 6.3, 6.1, 6.5 | 7.1, 6.8, 6.6 |
| 5. Against `creatures_noeye` | 51%, 37%, 31% | 88%, 87%, 68% | 48%, 49%, 53% |
| 5. Against `creatures_noscent` | 140%, 72%, 92% | 94%, 89%, 93% | 119%, 96%, 130% |
| 6. Heir for an adult | 69%, 60%, 74% | 56%, 61%, 61% | 69%, 67%, 68% |

**Target 5 is not met by either trial.** The plan's rule 3 for the trials says to stop work on
target 5 here and report: the fallback is a rule, and a rule is the owner's. No default changed in
this stage after Part 1.

What the two trials measured, by kind of claim:

1. **A smaller bite fills the world and shrinks the body. Evolution uses it, on 3 of 3 seeds.** At
   0.02 the seeing world holds 874 to 1,153 creatures at tick 36,000 against 296 to 475, and `len`
   reads 6.1 to 6.5 against a floor of 6. Rule S2 ties the two together: the bite that spares the
   plants is the bite that makes each plant feed a smaller mouth. So `bite_fraction` cannot meet
   target 3 and target 5 at once. At 0.05 `len` already fails on 2 of 3 seeds, and at 0.02 it
   fails on 3 of 3.
2. **Sight still kills plants at the smaller bite. The mechanism fires.** At 0.02 the seeing world
   loses 0.18 to 0.23 plants per plant per 1,000 ticks at the end of the run, and the count is
   still rising. The world with blind eyes loses a tenth of that. The plants fall by 20% to 29% in
   32,000 ticks. Nothing here says where they level off.
3. **A longer seed throw does not replace what sight kills. The mechanism fires, and it does not
   help enough.** The death rate of a plant does not move, and the gap stays at 48% to 53%.
4. **No number of this stage raises the world of seed 1 to the 1,200 creatures of the bench.** The
   world with blind eyes holds 689 at tick 12,000 at the default bite and 802 at 0.02. The size
   rules of step 3 halved the world before sight thinned it. Target 2 needs more than a fix for
   grazing.
5. **`max_gen` on seed 1 is 7 in the baseline and in both trials.** Target 1 is not a grazing
   problem. The plan's rule 1 names the reproduction numbers for it.

One more look, after the trials. It decides nothing. `plant_death_reserve=0` on seed 1 at tick
3,000: no plant can die. It is not the fallback rule, which stops a bite at the death reserve: here
a plant can be eaten far below 0.2 and then grows back slowly.

| Change | Plants | Plant deaths | Cells | `reserve01` | `creatures` | `creatures_noscent` | `creatures_noeye` |
|---|---|---|---|---|---|---|---|
| none | 1,705 | 1,184 | 662 | 0.65 | 429 | 477 | 572 |
| `plant_death_reserve=0` | 2,217 | 0 | 742 | 0.57 | 557 | 534 | 594 |

## What is still wrong or fragile, at the end of this stage

Each line says which of the three claims it makes: the mechanism fires, evolution uses it, or it
helps.

1. **`make gates` exits non-zero at the switched-on defaults.** The bench is void, `gate-health`
   reads 2 of 3, and `gate-evolve` reads 1 of 3. CI would fail at the bench step.
2. **Sight thins the world. The mechanism fires, and it does not help.** Measured on 3 of 3 seeds.
3. **Body size runs toward the floor where the senses work. Evolution uses it.** `len` is 6.3 to
   7.9 at the defaults and 6.1 to 6.5 at the smaller bite.
4. **Two thirds of the newborns starve as juveniles. The mechanism fires.** `juv_starved` is 0.66 to
   0.67 at the defaults, against 0.46 to 0.50 before the M2 rules.
5. **Three targets sit on a line.** Target 6 reads 60% on seed 2 at the defaults. `len` reads 7.9
   against 7.8 on seed 1. The scent gap reads 0.096 against 0.10 in trial 2. Each is one run.
6. **Every reading here is one run per seed.** No arm was run twice with other founders, so the
   spread between two runs of one arm is not known. The proofs of `gates.md` put the chance gap of
   a sense at up to 0.07.
