# M2 tuning: the switch-on and the grazing trials

Date: 2026-10-11. Base commit: c5d732c. Task 13 of `docs/plans/2026-10-11-m2-bodies.md`, first stage:
Part 1, Part 2, and trials 1 and 2 of Part 3.

## Protocol

- A **reading** is one run of a command on the defaults. It has no hypothesis and it decides nothing.
- A **trial** is `gate-health` on seeds 1, 2, 3 at 12,000 ticks and then `gate-evolve` on the same seeds
  at 36,000 ticks, with one parameter changed by `--param`. The hypothesis is written before the run.
  `params.rs` holds the switched-on defaults for every trial, so each trial runs on the binary of the
  baseline.
- A **look** is one seed at 3,000 ticks or fewer. A look decides nothing. Each one is recorded.
- One simulation ran at a time. Other projects loaded the machine: the load average was 5 to 7 through
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
