# M1 exit audit

Date: 2026-10-10. Head: 4e5cb37. Auditor: a fresh-context agent. It was given the roadmap, the design,
the architecture, `gates.md`, and the four M1 findings files. It was not given the build plan or any
build report.

All paths are relative to `tidepool/`. Every command ran from `tidepool/`, one heavy command at a time.
The load average was 2.4 to 2.9 during the runs, because a browser session used the machine. Each
ticks-per-second figure here is a lower bound.

Scratch code lives outside the repo and is not committed: a Rust probe that links `crates/sim`, a Node
script that reads the state hash of the `.wasm`, and one Vitest file that drives `src/worker/host.ts`.
Where a number comes from scratch code, the row says so.

## Verdict

**What a machine can check is met.** `make check` exits 0. `make gates` exits 0. The three health rows
reproduce to the digit. The world also passes the health gate on seeds 4 to 10, and at 36,000, 72,000,
and 200,000 ticks on seeds 1 to 3. Every gate in `gates.md` rejected its bad input when I staged it.
Native and WASM give the same state hash at 12,000 and 36,000 ticks with a possessed, hand-steered
creature in the run. A load fuzz of 43,000 changed snapshots found no panic.

**What is left for a person.** The first half of the exit line is "a stranger can swim, eat, bud, die,
and continue as a descendant with no instructions". No test or probe can show it. A person must play the
build. Four things from this audit bear on that session:

1. The heir preview on the death overlay probably shows empty water (finding F1). Check it in a browser.
2. A creature that its own brain drives from the moment of the pick has an heir at its death in 26% to
   36% of cases (finding F5). The stranger must do better than the brain to "continue as a descendant".
3. A touch player has no way to leave a body, and no hint names the Escape key (finding F8).
4. All four felt judgments in `m1-feel.md` are still "not judged".

**No finding blocks the exit.** There are 0 critical, 0 high, 5 medium, and 8 low findings. Two medium
findings are about what the gates and tests can see, not about the game: the health gate passes with
the scent sense switched off, and no test checks the movement cost or that mutation changes a gene.

## Gate runs

### `make check`, exit 0

Run twice: at the start, and at the end after the last proof restored the tree. Both runs gave the same
counts.

| Binary | Passed | Failed |
|---|---|---|
| `tidepool-headless` unit tests | 0 | 0 |
| `tidepool-sim` unit tests | 26 | 0 |
| `tests/brain.rs` | 7 | 0 |
| `tests/control.rs` | 11 | 0 |
| `tests/determinism.rs` | 5 | 0 |
| `tests/energy.rs` | 10 | 0 |
| `tests/motor.rs` | 9 | 0 |
| `tests/params.rs` | 4 | 0 |
| `tests/plants.rs` | 9 | 0 |
| `tests/repro.rs` | 8 | 0 |
| `tests/snapshot.rs` | 31 | 0 |
| `tests/world.rs` | 13 | 0 |
| Doc tests | 0 | 0 |
| Vitest, 5 files | 63 | 0 |

The crate count, `cargo fmt`, Clippy, `tsc`, Prettier, and ESLint steps printed no error.

### `make gates`, exit 0

```
bench creatures=1539 median_tps=4507 floor=2400 PASS
bench-wasm creatures=1539 median_tps=3862 floor=2400 PASS
seed=1 creatures=1477 min_late=778 plants=1682 births_late=1544 max_gen=11 mean_chemo=0.57 parked=0.00 first_bud=1527 PASS
seed=2 creatures=1373 min_late=958 plants=1471 births_late=1470 max_gen=12 mean_chemo=0.50 parked=0.00 first_bud=1483 PASS
seed=3 creatures=1148 min_late=669 plants=1504 births_late=1165 max_gen=11 mean_chemo=0.53 parked=0.00 first_bud=1638 PASS
gate-health 3/3 PASS
```

Both benches printed `settled tick=12000 creatures=1477 plants=1682`. The WASM reading is 1.61 times the
floor.

## Proof by proof

"Reproduced" means that I staged the bad input, ran the command, saw the gate reject it, and restored
the file at once. `git status --short` was empty after every proof.

| Gate | Result | What I saw |
|---|---|---|
| Clippy banned methods | Reproduced | ``error: use of a disallowed method `f32::sin` ``, exit 101. The two cases in the notes also reproduce: `f64::sin` and `f32::ln` |
| Import layers | Reproduced | `'../app/main' import is restricted from being used by a pattern`, exit 1 |
| Import layers, `src/` root | Reproduced | Both lines, for `'./app/main'` and `'./worker/host'`, exit 1 |
| No dynamic import | Reproduced | `No dynamic import() in src`, exit 1 |
| Crate count | Reproduced | The error text, the 3 names with `name = "x"` last, `make: *** [check] Error 1` |
| Rust format | Reproduced | `Diff in` the path of `lib.rs`, exit 1 |
| TypeScript format | Reproduced | `[warn] src/z.ts`, exit 1 |
| Type check | Reproduced | `src/x.ts(1,14): error TS2322`, exit 2 |
| Snapshot round trip | Gate reproduced. Recorded output not reproduced | `load_then_run_equals_unbroken_run ... FAILED`, exit 101. But 19 tests fail, not 5, and the values are `left: 734987217`, `right: 3259364194`. See finding F6 |
| Native equals WASM | Gate reproduced. Recorded values not reproduced | All 3 seeds fail. Seed 1: `expected 1261540159 to be 3031850156`. The row in `gates.md` holds the hashes of an earlier build. See finding F6 |
| Throughput, native | Reproduced | `bench creatures=1539 median_tps=4431 floor=1000000000 FAIL`, exit 1. `VOID: population fell`, exit 1, with `--reference 5000`. With `--settle 200`: 485 creatures, 13,488 ticks per second, void |
| Throughput, WASM | Reproduced | `bench-wasm creatures=1539 median_tps=3771 floor=1000000000 FAIL`, exit 1. Void with `--reference 5000`. With `--settle 200`: 485 creatures, 11,156 ticks per second, void |
| Health | Reproduced | All 6 bad worlds in `gates.md` gave the same row, digit for digit, and exit 1. The 3 usage errors exit 2 |
| CI | Not run, as instructed | Read only. See below |

### The CI workflow

`.github/workflows/tidepool.yml` at the repo root would run what its row claims. It starts on a push or
a pull request that touches `tidepool/**` or the workflow file. It runs `make check`, then
`bench --floor 800`, then `scripts/bench-wasm.mjs --floor 800`, then `gate-health`, all from `tidepool/`.
`make check` builds the `.wasm` and the headless binary first, so the three later steps find them. The
root workflows do not touch `tidepool/`: the root ESLint config ignores it and the root Vitest and
TypeScript configs include only `/src`.

I could not confirm four things without a run: that `pnpm/action-setup@v4` installs pnpm 11.7.0, that
pnpm 11 runs on Node 22, that a shared runner clears 800 ticks per second, and that the native build on
x86-64 gives the hashes that the `.wasm` gives. The last one decides `tests/determinism.test.ts` on CI.

### Health gate bands that `gates.md` calls not proven

`gates.md` says that `mean_chemo` has only rejected an empty world. **I found a living world that trips
it, but not inside the gate's own protocol.**

```
$ gate-health --seeds 1 --ticks 36000 --param chemo_gain=0 --param part_upkeep=0.001 --param mut_rate=0.5 --param mut_sigma=0.2
seed=1 creatures=1637 min_late=1486 plants=1812 births_late=3386 max_gen=29 mean_chemo=0.09 parked=0.00 first_bud=957 FAIL(mean_chemo=0.09 < 0.15)
```

That world has the sense switched off, part upkeep at 5 times the default, and body mutation at 3.3
times the rate and 2.5 times the step. It needs 36,000 ticks. At 12,000 ticks the same world reads 0.29
and passes. With the sense switched off and nothing else changed, the world reads 0.47 to 0.49 at
12,000 ticks and 0.39 to 0.48 at 36,000 ticks, and passes. So the band can fire, but it does not fire on
a useless sense at the default costs. See finding F3.

Three more bands had only rejected a world with no creatures. Two of them now have a living world:

- `creatures` below 150 and `min_late` below 100: `gate-health --param chemo_gain=0 --param
  plant_growth=0.005 --param intake_rate=0.04` gives 137, 119, and 137 creatures and fails both bands on
  3 of 3 seeds.
- `plants` above 7,000: the search for the `mean_chemo` world gave `creatures=4096 plants=8190`.
- `plants` below 300 with living creatures: I did not find one and did not search for one.

## M1 bullets against code and tests

| Bullet | Code | Test or probe | Gap between the words and the code |
|---|---|---|---|
| Rigid body with thrust and torque | `crates/sim/src/motor.rs:77-117` | `crates/sim/tests/motor.rs`, 9 tests | None |
| Cilia and one rear Flagellum | `motor.rs:89-92`, genes at `genome.rs:39-47` | `motor.rs` tests `a_body_with_cilia_turns_at_rest`, `a_body_without_cilia_cannot_turn_at_rest` | Each is one number per body, not a part with a place. "Rear" holds only in that thrust acts along the heading |
| A Filter mouth | `crates/sim/src/energy.rs:22-57` | `tests/energy.rs`, 4 eating tests | The mouth has no place. The whole body radius eats |
| Plants: rooted, a reserve, a per-bite fraction | `crates/sim/src/plant.rs`, `energy.rs:47` | `tests/plants.rs`, 9 tests. `tests/energy.rs` `one_tick_takes_at_most_the_bite_fraction` | I found no test that asserts a grazed-out plant is removed (`plant.rs:223`). Every test that names `plant_death_reserve` sets it to 0 |
| Intake with a satiation stop | `energy.rs:34-51` | `a_full_creature_eats_nothing`, `eating_moves_energy_from_plant_to_creature_and_loses_none` | None |
| Upkeep | `energy.rs:84-87` | `an_unfed_creature_starves_and_the_cause_is_recorded`, `parts_cost_upkeep` | None |
| Movement cost | `energy.rs:88` | **None.** See finding F4 | The rule exists and nothing checks it |
| Growth from juvenile to adult | `energy.rs:91-102` | `a_fed_juvenile_grows_to_adult_and_growth_costs_energy`, `a_starving_juvenile_does_not_grow` | None |
| Budding | `crates/sim/src/repro.rs:21-80` | `tests/repro.rs`, 8 tests | None |
| Mutation of body numbers | `genome.rs:174-203` | `mutation_stays_in_range_and_rate_zero_copies` checks the range and the zero rate. **No test checks that a gene changes.** See finding F4. The probe `probe-skip` shows that gene means move | The test cannot tell mutation from a copy |
| Old age | `energy.rs:107-108` | `old_age_kills_at_lifespan` | None |
| A small fixed-shape starter brain so NPCs forage | `crates/sim/src/brain.rs:157-193` | `tests/brain.rs`, 7 tests. `probe-density` at tick 500: 0.90 of creatures near a plant, against 0.55 with `chemo_gain=0` | "Forage" holds for scattered founders. From tick 3,000 the share is the same with the sense off. See finding F2 |
| A Chemoreceptor reading plant scent | `crates/sim/src/sense.rs:18-50`, `field.rs` | `a_founder_follows_scent_to_food_and_a_noseless_one_does_not`, 4 scent tests in `tests/plants.rs` | None |
| Click a creature to possess it | `control.rs:38-70`, `src/worker/host.ts:151-161`, `src/app/main.ts:319-325` | `tests/control.rs`, `tests/host.test.ts` (3 possess tests), `tests/abi.test.ts` | The click handler in `main.ts` has no test |
| Keyboard, mouse, and touch steering | `src/app/input.ts`, `main.ts:91-152` and `main.ts:331-348` | `tests/input.test.ts`, 11 tests on the pure functions | No automated test covers the event wiring in `main.ts`. Touch was read by emulation only (`m1-feel.md`) |
| Camera follow | `src/app/camera.ts:60-73`, `main.ts:455-466` | `tests/camera.test.ts` `follow converges and does not depend on frame rate` | The Play-mode use in `main.ts` has no test |
| Release the controls and the brain drives | `control.rs:115-121`, `input.ts:83-97`, `host.ts:75` | `manual_input_replaces_the_commands_and_releasing_hands_back`, host test `manual input turns the brain-driving flag off`, input test for the 500 ms grace | None |
| On death, choose a living descendant | `world.rs:148-158`, `control.rs:88-110`, `host.ts:80-94`, `src/ui/DeathOverlay.tsx`, `main.ts:169-181` | `heirs_are_marked_living_creatures_by_energy`, `a_death_and_its_heirs_read_through_the_abi`, 5 death tests in `tests/host.test.ts` | An heir is any living creature with the lineage mark. That is not the same set as "a living descendant". See finding F5 |
| No time-skip yet | No skip code exists | Not needed | None |
| Exit: a stranger can swim, eat, bud, die, and continue | The whole page | **None is possible.** A person must play it | See the verdict |
| Exit: alive at 12,000 ticks on 3 seeds | `crates/headless/src/health.rs` | `gate-health`, 3 of 3. Also 7 of 7 on seeds 4 to 10 | None |

## Claims in the findings files

The three kinds of claim: the mechanism fires, evolution uses it, it helps.

### `m1-tuning.md`

| Claim | What the evidence shows | Verdict |
|---|---|---|
| The gate passes 3 of 3 with `plant_growth` 0.02 and `intake_rate` 0.08 | It helps the gate. Paired with a baseline on the same binary | **Reproduced**, every number |
| Baseline rows on the old defaults | A measurement | **Reproduced**, every number |
| The default world falls to 3, 8, and 9 creatures at tick 2,000 on the old defaults | A measurement | **Reproduced** with `probe-density --ticks 8000` and the old defaults: 3, 8, 9 |
| Trials 1, 2, 3, and 5, the health rows | Measurements | **Reproduced**, all 12 rows, every number |
| The bench column of the trials | A scratch copy of the bench script, not in the repo | Not reproduced, but the old bench world on the tuned defaults does give `settled creatures=1552` and a mean of 425 with `bench --world 3072x1536 --creatures 1500 --plants 3000 --settle 200` |
| Seeds 4 to 10 pass, `creatures` 1,058 to 1,550 | A measurement | **Reproduced** |
| 36,000 and 72,000 ticks on the tuned set | A measurement | **Reproduced**: 1,013, 874, 780 and 747, 817, 683 creatures |
| 36,000 and 72,000 ticks on the sets of trials 1 and 3 | A measurement | Not run |
| The reading that is not a trial, `plant_cell_cap=16 fert_radius=600` | A measurement on the old defaults | **Reproduced** when the two old defaults are passed: 948 creatures, `first_bud` 804 |
| A generation is about twice the 800 ticks that the budget assumes | A measurement of `first_bud` | **Reproduced**: 1,527, 1,483, 1,638. `max_gen` rises by 12, 10, and 13 over one skip, which agrees with "about 11". `architecture.md:33` still says "about 30 generations" |
| The scratch census: 22% touch a plant, mean mass 14.0, mean thrust 0.45, 50% juveniles | A measurement outside the repo | **Reproduced** with my own scratch census on seed 1: 0.22, 14.0, 0.45, 0.50 |
| 1. Bodies shrink to the smallest size. "Evolution uses it" | The mean moves to the floor of its range on 3 of 3 seeds while the spread collapses. That supports "evolution uses it" | **Holds.** Seed 1 reproduced: `len` 6.60 to 6.15, `wid` 0.414 to 0.310 |
| 2. The gate passes because bodies shrink. "It helps the gate" | A paired run with `mut_rate=0` | **Reproduced**: `max_gen` 8, 7, 8. The wording is a little strong: `mut_rate=0` freezes all 6 body genes, not only the two size genes |
| 3. More than half of the newborns starve as juveniles. "The mechanism fires" | A scratch census | **Reproduced** by my census over ticks 11,000 to 12,000: 803, 735, 595 births and 484, 455, 343 juvenile starvations. That is 58% to 62%. The doc says 772 and 454 for seed 1. I do not know its window |
| 4. A creature touches a plant 22% to 44% of the time | A scratch census | 22% at tick 12,000 reproduced. The other ticks not run |
| 5. `mean_chemo` did not fall. "Evolution keeps it" | Only that the mean stayed near its founder value while its spread doubled. Drift gives the same picture. The doc had no control | **Worded more strongly than its evidence.** A control now supports it: with `chemo_gain=0` the mean at 36,000 ticks is 0.44, 0.48, 0.39, against 0.55, 0.54, 0.60 with the sense on. At 200,000 ticks with the sense on it is 0.63, 0.65, 0.71 |
| 6. The world thins. "Measured, cause unknown" | A measurement | **Reproduced.** The cause is no longer unknown: see finding F2 |
| 7. A richer world is slower and less steady | Readings on the set of trial 3 | Not run |
| 8. The bands allow 3,000 creatures and the floor does not | Logic from two readings | Holds as logic. See finding F7 |
| Throughput of the tuned default world in WASM: 3,992, 4,108, 5,308 | A scratch reading | Seed 1 agrees with the bench (3,771 to 3,862 over the next 2,000 ticks). Seeds 2 and 3 not run |

### `m1-density.md`

| Claim | What the evidence shows | Verdict |
|---|---|---|
| "The rule holds": the median distance to the nearest plant is 1.0 to 1.8 body lengths | A measurement on one seed | **Reproduced**, both tables, every number |
| The limit is "about 3 (`design.md` §7.3)" | Nothing. `design.md` §7.3 names no number, and it is about the gap between creatures against bite range, not about plants | **The cited source does not hold the number.** I searched `design.md`, `architecture.md`, and `roadmap.md` for it |
| The probe shows that creatures sit on food | Where creatures are, not why | **It is not evidence that the brain forages.** With `chemo_gain=0` the `near_plant` share is 0.82, 0.82, 0.66 at ticks 3,000, 6,000, 12,000, against 0.87, 0.83, 0.57 with the sense on. Children are born on the patch of their parent |
| Contact between creatures will be common when predation arrives | The median neighbour is 9.7 units away | A forecast. It is stated in founder lengths (12 units), and the bodies at tick 12,000 are 6.6 long |
| Density 730 to 939 creatures per million square units | Arithmetic from the gate rows | Holds |

### `m1-skip-drift.md`

| Claim | What the evidence shows | Verdict |
|---|---|---|
| The whole table of shifts | A measurement | **Reproduced** on seeds 1, 2, and 3, every number |
| One skip changes something: `wid` and `brain_weight` move more than 1 standard deviation on 3 of 3 seeds | That two means moved | **Holds as worded.** The doc says itself that it cannot tell drift from selection |
| Body width: "what selection looks like" | The mean runs to the floor on 3 seeds and the spread collapses | Holds. It supports "evolution uses it" |
| Brain weight moved less than drift alone would move it | The probe reading against arithmetic | I did not check the drift arithmetic. The doc does not claim that brains adapt, which is right: with `mut_weight_rate=0` the world is as healthy (1,471, 1,417, 1,143 creatures, 3 of 3) |
| "The change a player would see is that every body ends at the smallest size" | The genes, plus arithmetic from `energy.rs` | Holds. One thing follows that the doc does not say: `len` and `wid` are at their floors by tick 36,000 (6.09 to 6.15 and 0.307 to 0.310). A second skip has nothing left to move in the two measures that a player can see. "One skip changes something visible" is shown for the first skip only |
| `chemo` did not fall, and that does not show that the sense pays | A measurement, with the limit stated | Holds |

### `m1-feel.md`

Every number in this file came from a browser. I was told not to use one, so **none of it is
reproduced**. The file makes "the mechanism fires" claims only, and it marks each felt judgment as "not
judged: needs a person". That labelling is right.

One cross-check by arithmetic from `motor.rs` for a default body (length 12, width 6, flagellum 0.6,
cilia 0.4): top speed 1.495 units per tick, turn in place 0.060 radians per tick, turn at full thrust
0.114 radians per tick, coast loss 8% per tick. The file reads 1.49, 0.067, 0.12, and 8% on a founder
of length 11.8 with other genes. The two agree within 10%.

### `gates.md`, the claims outside the proof table

| Claim | Verdict |
|---|---|
| The `settled` line matches the seed 1 row of the health gate | **Reproduced**: 1,477 and 1,682 |
| A world that settles for 200 ticks reads about 3 times as fast and is void | **Reproduced**: 13,488 against 4,431 native |
| "Brains work": 83% to 89% near a plant at tick 500, against 34% to 51% with the turn output forced to 0 | No committed tool forces the turn output. The nearest committed check agrees: `probe-density --ticks 2000` reads 0.90 at tick 500, against 0.55 with `chemo_gain=0`. On the old defaults it reads 0.89 against 0.49 |
| The default world "holds 1,148 to 1,477 creatures at tick 12,000 on seeds 1 to 3. That is the reference population of 1,500" | **Worded more strongly than the numbers.** See finding F7 |
| The readings table, last row: 4,381 native and 3,757 WASM | Mine: 4,431 to 4,507 and 3,771 to 3,862 |
| The in-page bench rows | Not checked: no browser |
| The motor phase was 58% of the tick | Not checked |

## Numbers in rule code outside the parameter table

"Structural" means a layout size, a format constant, or a mathematical identity. "Tunable" means that
tuning could want to move it.

| File:Line | Number | What it is | Named | Reads as |
|---|---|---|---|---|
| `genome.rs:39-46` | `GENE_RANGE`, 12 values | The lowest and highest value of each body gene | Yes | **Tunable.** `len` and `wid` ran to the floors 6 and 0.3 on every seed. `m1-tuning.md` says no parameter changes that |
| `genome.rs:47` | `GENE_DEFAULT`, 6 values | The founder body | Yes | Tunable |
| `genome.rs:49` | `FOUNDER_SIGMA` 0.05 | Spread of founder genes | Yes | Tunable |
| `genome.rs:52` | `WEIGHT_LIMIT` 8.0 | Largest brain weight or bias | Yes | Tunable, low stakes |
| `genome.rs:54,56` | `ALPHA_SIGMA` 0.1, `ALPHA_RANGE` (0.05, 1.0) | Step and range of a neuron's time constant | Yes | Tunable. The comment argues that the step need not be a parameter |
| `brain.rs:13-25` | 96, 384, 7, 2, and the input and output indices | Brain layout | Yes | Structural |
| `brain.rs:28` | `STARTER_HIDDEN` 4 | Hidden neurons of a founder | Yes | Structural for the shape. It also sets the brain upkeep of every creature in M1 |
| `brain.rs:33,35,37` | `STARTER_CRUISE` 0.9, `STARTER_STEER` 2.0, `STARTER_SURGE` 0.5 | The three wired weights of the founder brain | Yes | **Tunable.** `m1-tuning.md` point 4 says the starter brain never slows on food |
| `brain.rs:40,41` | `STARTER_WEIGHT_SIGMA` 0.1, `STARTER_BIAS_SIGMA` 0.05 | Size of the random founder weights | Yes | Tunable |
| `sense.rs:12` | `SCENT_FLOOR` 1e-6 | Guard against a division by zero | Yes | Structural |
| `sense.rs:42,46` | 1.0, and `level / (1.0 + level)` | The constant input, and a squash | No | Structural |
| `motor.rs:14` | `BODY_REACH` 2 times `MAX_RADIUS` | Neighbour search box | Yes | Structural, derived from `GENE_RANGE` |
| `motor.rs:92` | 2.0 | A factor in the moment of inertia | No | Structural. `inertia_k` scales the same term |
| `creature.rs:114` and `creature.rs:10` | 4.0 | Radius is a quarter of length plus width | No | Structural as geometry. It also sets how far a body eats and bumps |
| `energy.rs:15` | `PLANT_REACH` 8.0 | Largest plant radius | Yes | Structural, but it repeats `RADIUS_MIN + RADIUS_SPAN` of `plant.rs` by hand. A change to those two leaves this one stale |
| `energy.rs:18` | `GROW_FLOOR` 0.5 | Reserve that a growth step must leave | Yes | **Tunable.** It is part of the growth economy that the tuning doc lists as not tried |
| `repro.rs:13` | `PARENT_RESERVE` 0.25 | Share of capacity a parent keeps after a bud | Yes | **Tunable.** It works with `bud_at` and `child_energy`, which are in the table |
| `repro.rs:16` | `HEADING_JITTER` 0.5 | Spread of a newborn's heading | Yes | Tunable, low stakes |
| `plant.rs:15` | `MAX_PLANTS` 8192 | Pool size | Yes | Structural |
| `plant.rs:17,18` | `RADIUS_MIN` 2.0, `RADIUS_SPAN` 6.0 | Plant radius from reserve | Yes | Tunable. The radius decides contact, so it is a feeding rule and not only a drawing size |
| `plant.rs:20` | `STAGGER` 8 | A plant updates on 1 tick in 8 | Yes | Structural |
| `plant.rs:22` | `FOUNDER_RESERVE_MIN` 0.3 | Lowest starting reserve | Yes | Tunable, a starting condition |
| `plant.rs:24` | `FOUNDER_DRAWS` 50 | Loop bound | Yes | Structural |
| `plant.rs:114-115` | The fertility kernel `1 / (1 + (d / r)^2)^2` | Shape of a patch | No | Structural as a shape. Its exponent is not a number that the table can move |
| `grid.rs:5` | `CELL` 32 | Spatial hash cell. `plant_cell_cap` counts plants per cell of this size | Yes | Structural, but plant density depends on it |
| `field.rs:7` | `SCENT_CELL` 8.0 | Scent grid cell | Yes | Structural. It also scales the gradient and how fast scent spreads |
| `field.rs:9` | `STEP_EVERY` 2 | The field steps on 1 tick in 2 | Yes | Structural |
| `field.rs:50,84` | 4.0, 0.5 | The 5-point stencil and the central difference | No | Structural, identities |
| `world.rs:22` | `MAX_WORLD_SIZE` 16384 | Bound on a world side | Yes | Structural |
| `world.rs:24,25,27` | `FOUNDER_GROWTH` 1.0, `FOUNDER_ENERGY01` 0.5, `FOUNDER_TRIES` 8 | Starting conditions | Yes | Tunable. The first two shape the early crash that the tuning fought |
| `world.rs:177` | 2.0 | A founder's age is below half a lifespan | No | Tunable, a starting condition |
| `world.rs:104-106` | 1, 2, 3 | Fork tags of the generators | No | Structural |
| `control.rs:8-13` | Cause codes, `HEIR_STRIDE` 7, `MAX_HEIRS` 5 | Format, and the heir limit from the design | Yes | Structural |
| `creature.rs:8,12` | `MAX_CREATURES` 4096, `MARK_LINEAGE` 1 | Pool size, a flag bit | Yes | Structural |
| `frame.rs:10-16` | 8, 10, 4, the flags, `NO_SLOT` | Frame format | Yes | Structural |
| `frame.rs:18` | `MARGIN` 32.0 | View margin of a frame | Yes | Structural, for drawing |

`math.rs` and `rng.rs` hold only identities: the coefficients of the sine, the rational tanh, and the
generator constants.

## Findings, ranked

| Severity | File:Line | Issue | Fix |
|---|---|---|---|
| MEDIUM | `src/worker/host.ts:65-68`, `src/app/main.ts:454` | **F1. The heir preview shows a stale frame.** While a death pauses the world, the worker posts no frame. The page slides the camera to the heir under the pointer, but the last frame holds only the old view plus 32 units | In `host.ts`, post one frame with no tick when a `view` message arrives while the world is paused |
| MEDIUM | `crates/sim/src/sense.rs:37-48`, `crates/sim/src/plant.rs:223-225` | **F2. Scent following thins the world.** With the sense on, the world holds 41% to 46% fewer creatures and 34% to 40% fewer plants at tick 36,000 than with the sense off, on 3 of 3 seeds | None is small. See "Findings that need a rule change". Update `m1-tuning.md` point 6 with the cause |
| MEDIUM | `crates/headless/src/health.rs:17`, `health.rs:136-137` | **F3. The health gate cannot see the M1 sense.** The world passes 3 of 3 with `chemo_gain=0`, and 1 of 1 with `scent_deposit=0`. A useless `chemo` gene reads 0.47 to 0.49 at the gate, far above the band of 0.15 | Add a paired row to the gate: the same seeds with `chemo_gain=0`, and a band on the gap between the two `mean_chemo` values. Or measure the band at 36,000 ticks |
| MEDIUM | `crates/sim/src/energy.rs:88`, `crates/sim/src/genome.rs:59-65`, `tests/host.test.ts:427-466` | **F4. Two rules of the M1 bullets have no test.** With the movement cost removed, and with mutation changed to a copy, every Rust test passes. One Vitest test fails in both cases, and it fails because the world took another path, not because it checks either rule | Add `thrust_costs_energy` to `tests/energy.rs` and an assertion to `mutation_stays_in_range_and_rate_zero_copies` that a gene differs after 100 mutations at the default rate |
| MEDIUM | `crates/sim/src/control.rs:60-70`, `crates/sim/src/repro.rs:71` | **F5. "A living descendant" is narrower and wider than the words.** Children born before the possession are not heirs. A body that the player left is one. Under its own brain a picked creature has an heir at death in 26% to 36% of cases | A rule question for the owner. See below |
| LOW | `docs/gates.md:16-17`, `docs/gates.md:28-35` | **F6. Two proof rows hold the output of an earlier build.** Snapshot: 19 tests fail now, not 5, with other hashes. The note "fails earlier, with `load: Truncated`" is false: it is `Invalid("creature field length")`. The note "only `load_then_run_equals_unbroken_run` catches a forgotten field" is false: 3 tests do. Native equals WASM: other hashes | Run both proofs again and paste the output |
| LOW | `docs/gates.md:162-164`, `crates/headless/src/bench.rs:37`, `scripts/bench-wasm.mjs:73` | **F7. The reference population holds on seed 1 only.** Over the timed ticks the default world holds 1,539, 1,265, 1,197, 1,071, 1,535, and 1,243 creatures on seeds 1 to 6. Seeds 3 and 4 are under the void line of 1,200 | Say in `gates.md` that the bench is a seed 1 reading. Consider a `--seed` flag so that a second seed can be timed |
| LOW | `src/app/main.ts:336-339`, `src/ui/App.tsx:19-25` | **F8. Only the Escape key leaves a body, and no hint names it.** A touch player cannot leave a body at all. `design.md` §4 says "you can leave your body at any time" | Add a small "Leave" control to the overlay in Play |
| LOW | `src/app/main.ts:386-387` | **F9. A release that crosses a death shows "That one is gone."** The worker posts `died`, then answers the late `release` with `possessed` uid 0. The page reads that as a failed heir pick | Set `heirGone` only when a `possess` that the overlay sent is still waiting for its answer |
| LOW | `tests/host.test.ts:391-420` | **F10. A test is named for a step it does not do.** "death pauses the world, posts the cause and heirs, and possessing an heir resumes" sends `speed` and never possesses an heir. Line 330 has nearly the same name | Rename it to say that `speed` resumes |
| LOW | `README.md:10`, `docs/architecture.md:33`, `docs/architecture.md:183` | **F11. Three doc lines are false.** The README says "M1 starts at Task 10". The architecture says a skip is "about 30 generations": the findings measured about 11. It says the worker "posts one frame per tick": it posts one per step of up to 5 ticks | Edit the three lines |
| LOW | `crates/sim/src/genome.rs:39-46`, `brain.rs:33-37`, `repro.rs:13`, `energy.rs:15,18` | **F12. Numbers that the tuning already wanted are outside the table.** `tidepool/AGENTS.md` says "a number that needs tuning goes in `params.rs`". The gene floors decided the main result of M1, and no `--param` can move them. `PLANT_REACH` repeats two constants of `plant.rs` by hand | Move the gene floors, `PARENT_RESERVE`, and `GROW_FLOOR` into the table. Define `PLANT_REACH` from `RADIUS_MIN + RADIUS_SPAN` |
| LOW | `docs/findings/m1-density.md:5-6` | **F13. The density finding cites a limit that its source does not hold,** and its probe does not separate foraging from being born on food | Cite the real source of "about 3", or drop it. Add the `chemo_gain=0` rows |

### F1. The heir preview shows a stale frame

`host.ts:65-68` returns before the frame is written whenever `ticksPerSecond` is 0. A death sets it to
0 (`host.ts:89`). The `view` handler only stores the rectangle (`host.ts:186-188`). On the page, hover
or keyboard focus on an heir button moves the camera to the heir (`main.ts:454`), and the page sends the
new view. No frame comes back. A frame holds only the entities inside the view it was made for, plus
`MARGIN` (`frame.rs:18`), and the Play view at scale 4 is about 320 by 185 world units on a laptop.

A scratch Vitest file drove the real host and the real `.wasm`: 61 frames before the death, then a
`view` message for the whole world and 2 seconds of pause, then still 61 frames. The existing test
`speed 0 pauses` asserts the same rule.

Why it matters: the death overlay is the M1 exit flow. The player picks an heir blind unless the heir
is within about 190 units to the side of the body that died, or 125 units above or below it. I did not see it in a browser. A person should check
it first.

### F2. Scent following thins the world

Same binary, same seeds, one run at a time, `gate-health` with and without `--param chemo_gain=0`.

| Ticks | Measure | Sense on, seeds 1, 2, 3 | Sense off, seeds 1, 2, 3 |
|---|---|---|---|
| 12,000 | `creatures` | 1,477, 1,373, 1,148 | 1,251, 1,048, 891 |
| 12,000 | `plants` | 1,682, 1,471, 1,504 | 1,952, 1,818, 1,725 |
| 36,000 | `creatures` | 1,013, 874, 780 | 1,842, 1,489, 1,448 |
| 36,000 | `plants` | 914, 844, 776 | 1,510, 1,287, 1,254 |
| 36,000 | `mean_chemo` | 0.55, 0.54, 0.60 | 0.44, 0.48, 0.39 |

A scratch census counted the 32-unit cells that hold at least one plant. From tick 4,000 to tick
36,000 they fall from 727 to 480, 682 to 445, and 640 to 404 with the sense on. With the sense off they
fall from 727 to 656, 690 to 579, and 640 to 559. With the sense on, the creature count peaks near tick
12,000 and falls. With the sense off it climbs to tick 36,000.

What this shows, by kind of claim:

- **The mechanism fires.** At tick 500 the sense puts 0.90 of creatures near a plant, against 0.55
  without it. In the settled world the signal is weak: the median size of the side gradient input is
  0.06 per unit of the `chemo` gene, so about 0.03 for a typical creature (scratch, tick 12,000).
- **Evolution uses it.** The gene mean is higher with the sense on than off on 3 of 3 seeds at 36,000
  ticks, and it rises to 0.63, 0.65, 0.71 by tick 200,000.
- **It helps the creature count for the first 12,000 ticks, and it harms the world after that.** The
  sense is good for the creature that has it and bad for the plants that all of them share.

The thinning levels off. At 200,000 ticks the world with the sense on holds 610, 729, and 670
creatures and 670, 768, and 699 plants, and passes the gate 3 of 3. It does not collapse.

What I did not show: that the lost plant cells are lost because grazers follow scent onto them. The
paired run shows the link. The path from scent to a dead plant is the likely one and is not measured.

### F3. The health gate cannot see the M1 sense

`design.md` risk R1 asks for "a health gate on mean brain size and sense-part count". The gate has
`mean_chemo >= 0.15`. Readings of that band on worlds where the sense does nothing:

| World | Ticks | `mean_chemo`, seeds 1, 2, 3 | Gate |
|---|---|---|---|
| `chemo_gain=0` | 12,000 | 0.47, 0.48, 0.49 | 3 of 3 pass |
| `chemo_gain=0` | 36,000 | 0.44, 0.48, 0.39 | 3 of 3 pass |
| `scent_deposit=0`, seed 1 only | 12,000 | 0.53 | passes |

A founder holds 0.5. One generation moves a neutral gene by very little at `mut_rate` 0.15 and
`mut_sigma` 0.08, and the mean creature at the gate is about 8 generations deep (`m1-skip-drift.md`). So the band can only fire long after the
sense is lost. The gate also passes a world with frozen brains (`mut_weight_rate=0`, 3 of 3) and a
world that thinks on 1 tick in 8 (`think_every=8`, seed 1). Those are not broken worlds, but the gate
says nothing about the brain in either direction.

The gate does reject worlds where no creature can turn (`flag_torque=0 cilia_torque=0`, 0 creatures)
or move (`flag_force=0 cilia_force=0`, 0 creatures).

Two more limits of the bands, both already named in `m1-tuning.md`: `max_gen >= 8` fails a stable
world of fixed bodies (622 to 774 creatures, `max_gen` 8, 7, 8), and `creatures <= 3000` passes a world
that misses the skip budget.

### F4. Two rules of the M1 bullets have no test

I changed the rule, ran `cargo test --workspace` and `pnpm exec vitest run` on rebuilt binaries, and
restored the file.

| Bad change | Rust tests | Vitest | Health gate |
|---|---|---|---|
| The movement cost term at `energy.rs:88` removed | All pass | 1 fails: `picking an heir resumes the world in that body` | Passes 3 of 3 with `move_cost=0` (1,709, 1,416, 1,603 creatures) |
| `nudged` at `genome.rs:59-65` returns its input, so no gene and no weight ever changes | All pass | The same 1 test fails | With `mut_rate=0 mut_weight_rate=0`, the nearest setting: fails 2 of 3 on `max_gen` (7, 8, 7), by one generation |
| A child does not inherit the lineage mark (`repro.rs:71`) | `a_fed_adult_buds_a_child_that_carries_its_line` fails | The same 1 test fails | Not run |

The one Vitest failure is a test that is pinned to the path of seed 1 (`host.test.ts:422-426`). Its
comment tells the next person to "pick the founder again" after a change to the rules. So it will go
red on every rule change, and the documented response is to re-pin it. It protects neither rule.

The third row is the control: a rule that has a real test is caught by it.

### F5. "A living descendant" is narrower and wider than the words

`possess` marks one creature (`control.rs:64`). A child copies the mark of its parent at the bud
(`repro.rs:71`). `write_heirs` lists the marked living (`control.rs:88-93`). Three results follow:

1. A child born before the player took the body has no mark. A player who takes an old adult with
   living children, and does not bud again, reads "Your line has ended."
2. A body that the player took and left keeps its mark. It is offered as an heir though it is not a
   descendant. `tests/host.test.ts:334` relies on this.
3. The heirs of a death are every marked creature in the world, not the descendants of the body that
   died.

Results 2 and 3 match `design.md` §5.6 ("everything descended from a creature you possessed"). Result
1 does not.

How often the overlay has an heir to offer. A scratch census took every creature alive at the pick
tick, followed it under its own brain to its death, and counted the heirs as the code does.

| Pick tick | Seed 1 | Seed 2 | Seed 3 | Adults only, seeds 1, 2, 3 | Juveniles only, seeds 1, 2, 3 |
|---|---|---|---|---|---|
| 200 | 0.30 | 0.26 | 0.29 | 0.34, 0.28, 0.31 | 0.16, 0.14, 0.20 |
| 1,200 | 0.36 | 0.34 | 0.36 | 0.44, 0.40, 0.43 | 0.26, 0.26, 0.26 |
| 3,000 | 0.26 | 0.26 | 0.31 | 0.37, 0.38, 0.42 | 0.17, 0.17, 0.21 |
| 12,000 | 0.30 | 0.28 | 0.31 | 0.41, 0.40, 0.44 | 0.20, 0.17, 0.19 |

The median time from the pick to the death is 1,254 to 1,830 ticks, which is 63 to 92 seconds.
`design.md` §4 asks for a life of 3 to 6 minutes "when played well". 59% to 80% of these deaths are
starvation. The page always starts seed 1 at tick 0 (`main.ts:426`), so the row for tick 200 is the
nearest to what a stranger meets.

This is the brain's result, not a player's. A person may do better or worse. It is the only number I
have for "continue as a descendant".

### F6. Two proof rows hold the output of an earlier build

`gates.md` says "all proofs ran on 2026-10-10". The date may be right, but the snapshot row and the
native-equals-WASM row show output that the commands no longer print at head. With the `vy` line
removed from `save` and `load`, 19 of 31 snapshot tests fail. Three of them catch the forgotten field
by itself: `load_then_run_equals_unbroken_run`, `load_then_run_equals_unbroken_run_across_births`, and
`every_saved_field_is_in_the_hash_and_survives_a_load` ("vy is not in the hash"). The other 16 fail
because the hand-written payload of the test file has one field too many. With the line removed from
`save` alone, 10 tests fail with `Invalid("creature field length")`.

The gates work. Only the record is old.

### F7. The reference population holds on seed 1 only

`gates.md` argues that the default world "holds 1,148 to 1,477 creatures" and that this "is the
reference population of 1,500, reached by living". A scratch run of the bench protocol on 6 seeds:

| Seed | Alive at tick 12,000 | Mean alive over ticks 12,000 to 14,000 | Against the void line of 1,200 |
|---|---|---|---|
| 1 | 1,477 | 1,539 | Above |
| 2 | 1,373 | 1,265 | Above |
| 3 | 1,148 | 1,197 | **Below** |
| 4 | 1,058 | 1,071 | **Below** |
| 5 | 1,550 | 1,535 | Above |
| 6 | 1,180 | 1,243 | Above |

Does the gate time what `architecture.md` §2 names? Yes. §2 names the default world on seed 1 after
12,000 ticks, and both benches time exactly that. Does the reasoning hold? Mostly:

- The timed window is near the peak of the creature count on seed 1 (1,477 at tick 12,000, 1,374 at
  16,000, 1,013 at 36,000). A 24,000-tick skip from there runs on a thinner world, so the reading is
  on the safe side of a real skip in that world.
- The reading is 1.57 to 1.61 times the floor. That margin belongs to seed 1. The benches fail closed:
  a change that drops seed 1 under 1,200 makes `make gates` exit 1 as void.
- The world can hold more than the bench times. With the sense off it holds 1,842 creatures at tick
  36,000, and trial 3 held 2,201 at the floor. The health gate allows 3,000. The throughput gate
  protects the default world on seed 1 and nothing else.

### F8 to F13

The table above states each one in full. Two notes:

- **F8.** `Hint` in `App.tsx:19-25` shows "Click any creature to become it." and "Your instincts are
  steering. Move to take over." Neither names a key. Whether "with no instructions" holds is the
  person's call.
- **F9.** The window is one tick wide. I read it from the code and did not make it happen.

### Looked for and not found

- **A field that affects the future and is not saved.** I listed every field of `World` against
  `save_payload`. Each one is saved or is rebuilt before its first use. `high_water` of a pool differs
  after a load, and nothing reads it in a way that changes the result.
- **A load that panics, or a loaded world that panics.** A scratch fuzz changed 1 to 3 words of a real
  payload to wild values, resealed it, and loaded it. A world that loaded then ran 28 ticks, wrote a
  frame, wrote heirs, read every stat, possessed a creature, seeded more founders, saved, and loaded
  its own save. The build had overflow checks and debug assertions on. Small world: 40,000 cases,
  21,275 loaded, 0 panics, 0 saves refused. Default world: 3,000 cases, 1,831 loaded, 0 panics, 0
  saves refused.
- **Native against WASM.** Same hash at tick 12,000 on seeds 1 and 2 and at tick 36,000 on seed 3,
  each with 300 ticks of hand steering through `tp_possess` and `tp_input` (`cb941275`, `97f9bb16`,
  `371e5522`). I read the core for calls that the two targets could do differently. `f32::max` on two
  zeros of opposite sign may return either one (`brain.rs:211`). I could not build a normal run that
  reaches it: the output of a neuron cannot be a negative zero while `alpha` is above 0.
- **The seam.** The strides, the header, the heir layout, the two flag bits that the page reads, and
  the ABI version are tested against the module. The founder counts and the stat keys are repeated in
  `src/protocol.ts`, `src/worker/host.ts`, `crates/headless/src/main.rs`, and `scripts/bench-wasm.mjs`
  with no test that ties them. They agree today.
- **A swallowed failure in the worker.** Every path in `host.ts` and `sim.worker.ts` ends in an
  `error` message. On the page, an exception inside the animation frame callback goes to the console
  only (`main.ts:447`). I found no way to cause one.
- **Web security.** The page is static. It has no server, no account, no storage, and no network call
  except the fetch of the `.wasm`. No user text reaches HTML. I found nothing to report.

## Findings that need a rule change

The owner decides these. None is a number in the table.

1. **F2, grazing that follows scent.** A plant under its `plant_death_reserve` is removed
   (`plant.rs:223`), a patch that loses its plants is seeded again only from within `plant_seed_range`,
   and scent leads every grazer to the same plants. A number may be enough: `m1-tuning.md` lists
   `bite_fraction` and `plant_seed_range` as not tried. If it is not, the rule for plant death or for
   seeding has to change.
2. **F5, who is an heir.** To count children born before the possession, `possess` must mark them, and
   the core has no parent-to-child index yet. `roadmap.md` puts the lineage tree in M5.
3. **Bodies run to the smallest size.** This is the builders' own finding (`m1-tuning.md` point 1,
   `m1-skip-drift.md`). I confirm the numbers. Intake grows with length, upkeep grows with length times
   width, and nothing eats a small body. It is listed for M2.
4. **The push between bodies ignores mass** (`motor.rs:63-65`). A newborn of mass 2 shoves an adult of
   mass 72 as hard as the adult shoves it. `m1-feel.md` saw the possessed body lose half of its speed
   in a crowd and did not isolate the cause. This is my reading of the code, not a measurement.
5. **Brain upkeep does not scale with the body.** It is a flat 0.0046 energy per tick for the M1 brain.
   For a newborn of the smallest body (mass 1.7) that is about three quarters of its resting upkeep,
   and its birth energy lasts about 100 ticks without food. This is arithmetic from `energy.rs`, not a
   measurement. It bears on the 58% to 62% of newborns that starve, and on risk R1 when brains can
   shrink in M3. The two rates are in the table. Scaling them by mass would be a rule.

## Not checked

- **Anything in a browser.** The page as a player sees it, every number in `m1-feel.md`, the in-page
  bench rows of `gates.md`, rendering, touch, and F1 and F9 as seen on screen.
- **The CI workflow as a run.** See "The CI workflow" for the four open points.
- **The build plan.** I was not given it. Claims that cite it ("the limit in the plan is 120 ms", "the
  plan asks for seed 1 only") are not checked.
- **Readings I did not run:** the 36,000-tick and 72,000-tick rows for the sets of trials 1 and 3, the
  WASM throughput of the default world on seeds 2 and 3, the look tables of `m1-tuning.md`, the motor
  phase share of 58%, and the drift arithmetic for brain weights in `m1-skip-drift.md`.
- **A plant-poor living world** for the `plants` band below 300.
- **The native build on x86-64** against the `.wasm`.
- **`spikes/`, the draft in `/src`, and the M0 parts** that M1 did not change, beyond what the gates
  cover.
