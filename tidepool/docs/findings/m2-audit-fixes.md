# M2 audit fixes: the code-level findings

Date: 2026-10-12. Base: `4b46cf7`, the commit of `docs/findings/m2-audit.md`.

Scope: findings M2 (tests), M3 and M4 (a probe), L3, one line of L6, L8, and the radius rule that
section 6 found written twice. No rule, default, band, floor, or gene range changed. The findings that
need the owner (H1, H2, H3, M5, M7, M8, M9) are not touched.

## Result

- **Part 1.** 10 new tests, one for each of the 10 rules that the audit could break. Each failed on
  its break and passes on the rule. 4 new edits in `every_saved_field_is_in_the_hash_and_survives_a_load`:
  `w`, `h`, `uid`, and the count of hidden neurons. Each failed on a break of its own.
- **Part 2.** `probe-census` is in `crates/headless`, with 3 tests and a section in `docs/gates.md`.
  Its row for seed 8 at tick 144,000 equals the row that the audit read with `gate-evolve`.
- **Part 3.** `birth_growth` stops at 0.7 and `lifespan` starts at 1200. The comment of `intake_rate`
  is right. `creature::radius` is the one place for `(length + width) / 4`.
- **`gate-health` prints the three baseline rows digit for digit.** The state hashes of seeds 1, 2, 3
  at tick 9,000 are those that the audit recorded.
- **`make check` exits 0.** 222 Rust tests (209 before) and 88 Vitest tests (87 before).

Commits, oldest first: `fix(tidepool): parameter ranges match their genes`, `feat(tidepool):
probe-census`, `test(tidepool): tests for the M2 rules that the audit could break`. This file is in
the last one.

## Part 1: the proofs

Each row: the rule was broken as the audit broke it, the test ran and failed, the rule was restored,
and the test passed. The line numbers are those of the head. After the last proof `diff -r` of
`crates/sim/src` against the copy taken before the first one printed nothing.

| # | Rule | Test | Break | Failing assertion |
|---|---|---|---|---|
| 1 | Turning feels the weight of the parts | `a_heavier_load_of_parts_turns_slower`, `tests/motor.rs` | `motor.rs:133`: `* heft[s]` removed from the turn | `got 1 want 1.3482946` (`tests/motor.rs:306`): the ratio of the two turn rates against the ratio of the two hefts |
| 2 | The push is split by mass, and mass counts the parts | `the_push_counts_the_mass_of_the_parts`, `tests/motor.rs` | `motor.rs:69`: `mass[s]` is `c.area(s)` | `got 1 want 1.3482946` (`tests/motor.rs:222`): the ratio of the two pushes against the ratio of the two masses |
| 3 | `side_of(a)` is `4a(1 - a)` | `a_part_between_the_middle_and_an_end_works_across_the_body_by_the_curve`, `tests/genome.rs` | `creature.rs:129`: `1.0 - (2.0 * anchor - 1.0).abs()` | `at 0.25` (`tests/genome.rs:123`). The test reads 0.25, 0.75, 0.1, and 0.9 |
| 5 | Side drag stops at `SIDE_DRAG_MAX` | `side_drag_stops_at_its_limit`, `tests/motor.rs` | `motor.rs:139`: `.min(SIDE_DRAG_MAX)` removed | `vx 0 vy -1.0000072` (`tests/motor.rs:320`). The rule gives `vy` 0.1 |
| 6 | A step of growth leaves `grow_floor` of the reserve | `a_step_of_growth_leaves_grow_floor_of_the_reserve`, `tests/energy.rs` | `energy.rs:116`: `if true {` | `left: (0.5, 2.006)`, `right: (0.4, 5.4550323)` (`tests/energy.rs:425`): the body grew and paid |
| 7 | A brain costs upkeep per neuron and per connection | `a_brain_costs_upkeep_for_each_neuron_and_each_connection`, `tests/energy.rs` | `energy.rs:105`: both brain terms times 0 | `lost 0 for 17 neurons` (`tests/energy.rs:456`) |
| 8 | The age input is `age / old` | `the_age_input_is_the_age_over_the_old_gene_of_the_body`, `tests/brain.rs` | `sense.rs:50`: `/ 4800.0` | `left: (0.25, 0.25)`, `right: (0.5, 0.125)` (`tests/brain.rs:277`) |
| 15 | An eye sees `eye_range * size * length` of the body as grown | `a_juvenile_sees_as_far_as_its_body_has_grown`, `tests/eye.rs` | `eye.rs:54`: the call replaced by the formula with `c.len[slot]` | `at 9.6: 0.7500006` (`tests/eye.rs:194`). The rule gives 0.5 |
| 16 | The cone that the frame carries is the cone that the eye scans | `the_cones_of_a_juvenile_are_as_long_as_its_eyes_see`, the test module of `frame.rs` | `frame.rs:103`: the call replaced by the formula with `c.len[s]` | `left: 1109664002`, `right: 1101275394` (`frame.rs:354`): the range word of the frame against `cone_range` |
| 15 and 16 | The one function | Both tests above | `creature.rs:239`: `self.len[s]` for `self.length(s)` | `range 38.4` (`tests/eye.rs:190`) and `41.032234` (`frame.rs:351`): both tests fail |
| 10 | Possess marks every living descendant | `a body that already has a grandchild leaves that grandchild among its heirs`, `tests/host.test.ts` | `control.rs:77`: `if c.parent[s] == uid {`, then `make wasm` | `AssertionError: no founder has a grandchild among its heirs: expected undefined to be defined` |

Test 7 sets `neuron_upkeep` and `conn_upkeep` one at a time and then both at their defaults. The
build of break 7, where a brain is free, no longer passes `cargo test -p tidepool-sim`. A break of
one of the two terms alone was not run.

### The range of a cone is one function

`Creatures::cone_range(s, k, eye_range)` in `creature.rs` is
`(eye_range * eye_size * length(s)).min(EYE_REACH)`. `eye::see` and `frame::write` both call it. The
arithmetic and its order are the ones that both had, so no hash moved.

The cost was read, because `motor.rs` records a call that WASM did not inline. `node
scripts/bench-wasm.mjs`, median ticks per second, at a load average of 2.7 to 3.1:

| Source of `eye.rs`, `frame.rs`, `creature.rs`, `repro.rs` | Runs |
|---|---|
| `4b46cf7` | 2,982, 2,983 |
| This work | 2,972, 2,980, 2,959, 2,989 |

The means differ by 0.3%, which is less than the spread of the four runs of this work. No cost is
shown. Two runs against four is a reading, not a trial.

### What the page test for rule 10 does and does not do

The page has no way to read who the parent of a body is. So the test finds its founder with the
core: in a copy of the world of seed 1 at tick 1,500 it possesses each founder and reads the heirs.
It takes the first founder whose whole line is under 5 bodies and holds a body of generation 2 or
more. Then the page possesses that founder in the same world, the body dies, and the `died` message
must hold an heir of generation 1 and an heir of generation 2 or more.

- With the rule broken the test fails at the search, not at the page's own assertion. The search
  and the page call the same `possess`, so no build can break one and not the other.
- It is the path of one seed. At tick 1,500, 102 founders are alive, 58 have a grandchild among
  their five heirs, and 13 of those have a whole line under 5. A tuning change that leaves none of
  the 13 fails the test at the search, with the message of the table above.

### The snapshot test (audit section 7, last bullet)

All four edits fit `every_saved_field_is_in_the_hash_and_survives_a_load`.

| Edit | How | Break | Failing assertion |
|---|---|---|---|
| `w` | `w.w -= 0.5`: every grid keeps its count of cells, so the saved maps still fit | `world.rs`: `save_payload` writes `1536.0` | `w is not in the hash` |
| `h` | `w.h -= 0.5` | `world.rs`: `save_payload` writes `1024.0` | `h is not in the hash` |
| `uid` | Two founders trade uids: each uid is still alive once and above its parent | `creature.rs`: `save` writes the uids sorted | `uid is not in the hash` |
| `n_hidden` | One more hidden neuron, with its bias and its alpha, and the brain expressed again | `genome.rs`: `save` writes `n_hidden.min(4)` | `hidden neuron count: Invalid("brain genome bias or alpha count")` |

**`n_hidden` cannot change alone.** `BrainGenome::load` rejects a genome whose count of biases is not
`n_hidden + N_OUT`. So the edit changes three fields together, and the bias count would move the
hash even with `n_hidden` out of the snapshot. What the edit adds: a brain with a count of hidden
neurons that no founder has survives a load. The break above is the one that it catches: a save
that cannot hold more than the founder's 4.

Not added: the `src`, `dst`, `weight`, and `history` of a connection that is already there. The
task did not name them. The round-trip tests cover them, as the audit says.

## Part 2: `probe-census`

`tidepool-headless probe-census [--seeds <u32>,...] [--ticks <u32>] [--every <u32>] [--param <name>=<value>]...`

Defaults: seeds 1, 2, 3, 36,000 ticks, a row every 12,000. `docs/gates.md`, section "Probes", has the
columns and one run. What the task left open, and what was chosen:

- `eaten` is the energy that all creatures ate per tick, as a mean since the row before. It is not
  per creature.
- `senseless` counts part genes: a chemoreceptor of size 0 is still a part.
- `speed` and `turn` are means over every living creature, a juvenile with its adult body.
  `evolve::top_speed` and `evolve::turn_rate` are called. No formula is written again.
- The six part sums come from `Genome::size_of`, as in `probe-skip`.
- `--every` must be from 1 to `--ticks`. A run stops at the last multiple of `--every`.
- No `HashMap`. A mean over nobody prints `NaN`.

Usage errors, each with exit 2: `--every 0` and `--every 50000` (`--every needs a value from 1 to
--ticks, which is 36000`), `--every x`, `--bogus 1` (`unknown flag --bogus`), `--param nope=1`,
`--param lifespan=600` (`is outside the range 1200 to 24000`), `--seeds a`, `--ticks 0`.

Tests, in `crates/headless/src/probes.rs`:

| Test | What it holds | Break that failed it |
|---|---|---|
| `a_census_row_reads_each_column_from_its_own_field` | A world of two bodies that differ in every gene and every kind of part, and two plants. All 22 columns | Each part column made to read the next kind: `flagellum ... left: "0.20"`, `right: "0.40"` |
| `a_census_row_reads_the_senses_of_a_world` | The default world with `founder_eye=0` after 400 ticks: `eye=0.00`, `senseless=0.00`. The same with the chemoreceptor taken from every founder: `senseless=1.00`, `chemo=0.00` | `senseless` made to read the eye alone: `left: "1.00"`, `right: "0.00"` |
| `a_census_row_of_an_empty_world_holds_no_zero_for_a_mean` | With nobody alive each mean prints `NaN` | Not broken |

### The long run

```
$ target/release/tidepool-headless probe-census --seeds 1,8 --ticks 144000 --every 36000
seed=1 tick=36000 creatures=1470 plants=2229 juv=0.38 len=11.8 wid=0.52 egg=0.66 old=3650 area=72.4 flagellum=0.46 cilia=0.36 filter=0.74 chemo=0.14 fin=0.00 eye=0.22 parts=5.2 senseless=0.01 speed=1.11 turn=0.104 eaten=189.82 reserve01=0.36
seed=1 tick=72000 creatures=1564 plants=2229 juv=0.36 len=11.3 wid=0.46 egg=0.67 old=3337 area=59.3 flagellum=0.20 cilia=0.54 filter=0.72 chemo=0.14 fin=0.00 eye=0.24 parts=4.9 senseless=0.08 speed=0.68 turn=0.117 eaten=186.36 reserve01=0.28
seed=1 tick=108000 creatures=1766 plants=2229 juv=0.39 len=10.6 wid=0.43 egg=0.66 old=3209 area=47.9 flagellum=0.19 cilia=0.53 filter=0.79 chemo=0.12 fin=0.00 eye=0.24 parts=5.0 senseless=0.02 speed=0.67 turn=0.122 eaten=177.13 reserve01=0.26
seed=1 tick=144000 creatures=1691 plants=2229 juv=0.39 len=10.4 wid=0.43 egg=0.67 old=3179 area=46.7 flagellum=0.21 cilia=0.49 filter=0.81 chemo=0.13 fin=0.01 eye=0.24 parts=5.7 senseless=0.01 speed=0.64 turn=0.117 eaten=174.43 reserve01=0.29
seed=8 tick=36000 creatures=1370 plants=1731 juv=0.37 len=12.9 wid=0.51 egg=0.68 old=3916 area=85.5 flagellum=0.39 cilia=0.21 filter=0.74 chemo=0.03 fin=0.00 eye=0.15 parts=4.0 senseless=0.10 speed=1.01 turn=0.075 eaten=173.43 reserve01=0.29
seed=8 tick=72000 creatures=1240 plants=1731 juv=0.34 len=15.9 wid=0.43 egg=0.67 old=3888 area=109.0 flagellum=0.39 cilia=0.03 filter=0.70 chemo=0.03 fin=0.00 eye=0.03 parts=3.0 senseless=0.53 speed=1.03 turn=0.043 eaten=169.88 reserve01=0.29
seed=8 tick=108000 creatures=1179 plants=1731 juv=0.34 len=17.0 wid=0.41 egg=0.68 old=4079 area=121.3 flagellum=0.35 cilia=0.05 filter=0.66 chemo=0.02 fin=0.00 eye=0.03 parts=3.0 senseless=0.71 speed=0.96 turn=0.041 eaten=163.16 reserve01=0.27
seed=8 tick=144000 creatures=1104 plants=1731 juv=0.35 len=19.2 wid=0.35 egg=0.68 old=4166 area=129.6 flagellum=0.34 cilia=0.09 filter=0.65 chemo=0.02 fin=0.01 eye=0.03 parts=3.3 senseless=0.83 speed=0.92 turn=0.042 eaten=159.35 reserve01=0.24
```

**The rows held.** Each line is the census against a number that another command printed.

| Tick, seed | Census | Other reading | Equal |
|---|---|---|---|
| 144,000, seed 8 | `creatures=1104 len=19.2 parts=3.3 chemo=0.02 eye=0.03` | The audit's `gate-evolve --seeds 5,7,8 --ticks 144000`: the same five | Yes |
| 144,000, seed 1 | `creatures=1691 len=10.4 parts=5.7 chemo=0.13 eye=0.24` | The audit's `gate-evolve --ticks 144000`: the same five | Yes |
| 36,000, seed 1 | `creatures=1470 len=11.8 parts=5.2 chemo=0.14 eye=0.22` | The audit's `make gates`, the `gate-evolve` row of seed 1: the same five | Yes |
| 12,000, seed 1 | `creatures=1321 plants=2229 chemo=0.38` | `gate-health`: `creatures=1321 plants=2229 mean_chemo=0.38` | Yes |
| 144,000, seed 1 | `flagellum=0.21` | The audit's `probe-skip`, check 15: 0.21 | Yes |

The census against the scratch census of `m2-tuning.md`, "A long reading of the accepted set",
seed 1 at ticks 12,000, 36,000, 72,000, 108,000, 144,000. The first tick is from the run in
`gates.md`.

| Reading | Scratch census | `probe-census` | Equal |
|---|---|---|---|
| Area | 73, 72, 59, 48, 47 | 72.8, 72.4, 59.3, 47.9, 46.7 | Yes |
| Filter sum | 0.66, 0.74, 0.72, 0.79, 0.81 | 0.66, 0.74, 0.72, 0.79, 0.81 | Yes |
| `egg` | 0.68, 0.66, 0.67, 0.66, 0.67 | 0.68, 0.66, 0.67, 0.66, 0.67 | Yes |
| `reserve01` | 0.46, 0.36, 0.28, 0.26, 0.29 | 0.46, 0.36, 0.28, 0.26, 0.29 | Yes |
| Creatures | 1,321, 1,470, 1,564, 1,766, 1,691 | The same | Yes |
| `len` | 12.1, 11.8, 11.3, 10.6, 10.5 | 12.0, 11.8, 11.3, 10.6, 10.4 | In the last digit: `probe-skip` reads 10.45 at tick 144,000 |
| Energy eaten per tick | 193, 192, 184, 177, 174 | 185.70 and 191.80 with a row every 12,000. 189.82, 186.36, 177.13, 174.43 with a row every 36,000 | **Not at tick 72,000.** See below |

`eaten` is a mean over an interval, and the record does not say which interval the scratch census
used. With `--every 4000` the census reads 193.00 at tick 12,000, which is the 193 of the record.
At tick 72,000 it reads 186.36 over 36,000 ticks and 179.05 over 4,000 ticks. Neither is 184. The
figure of 184 was not found again.

### What the rows read, and no more

One run per seed. These are readings.

- **The speed of a world (finding M3).** On seed 1 the mean top speed is 1.11, 0.68, 0.67, 0.64 at
  the four ticks. The fall is between tick 36,000 and tick 72,000, where the flagellum sum goes from
  0.46 to 0.20. On seed 8 it is 1.01, 1.03, 0.96, 0.92.
- **Seed 8 loses its senses (finding H2).** `senseless` is 0.10, 0.53, 0.71, 0.83. The audit said "at
  least 76%" at tick 144,000 from the eight commonest plans. The census counts every body: 83%.
- **On seed 8 the body grows.** The area is 85.5, 109.0, 121.3, 129.6, and the turn rate falls from
  0.075 to 0.042. On seed 1 the area falls from 72.4 to 46.7.
- **`old` moves.** The mean is 3,650 at tick 36,000 and 3,179 at tick 144,000 on seed 1, against a
  founder's 4,800. No probe printed this gene before.

## Part 3

- **L3.** `params.rs`: `birth_growth` is `0.7 0.1 0.7` and `lifespan` is `4800.0 1200.0 24000.0`.
  A new test, `birth_growth_stops_at_the_top_of_egg_and_lifespan_starts_at_the_bottom_of_old`
  (`tests/params.rs`), failed on the old table with `left: 1.0`, `right: 0.7`.
- **Five tests ran at `lifespan=600`.** They run at 1200 now: `old_age_kills_at_lifespan`
  (`tests/energy.rs`), `the_lifespan_parameter_sets_the_founder_ages` (`tests/world.rs`),
  `follow_agrees_with_possess_and_write_heirs` (`probes.rs`), and two page tests in
  `tests/host.test.ts`, whose waits are twice as long. Nothing used a `birth_growth` above 0.7.
- **L6.** The comment of `intake_rate` says "per unit of mouth", and that the mouth follows the area
  at `intake_curve` 1.
- **Radius.** `creature::radius(length, width)`. `Creatures::radius` and `repro.rs` call it.

## `gate-health`, before and after

Before any change, at `4b46cf7`:

```
$ target/release/tidepool-headless gate-health
seed=1 creatures=1321 min_late=1170 plants=2229 births_late=2187 max_gen=14 mean_chemo=0.38 parked=0.00 first_bud=747 juv_starved=0.53 to_bud=0.33 PASS
seed=2 creatures=1274 min_late=1110 plants=2076 births_late=2223 max_gen=16 mean_chemo=0.31 parked=0.00 first_bud=745 juv_starved=0.52 to_bud=0.32 PASS
seed=3 creatures=1166 min_late=1066 plants=1965 births_late=1996 max_gen=16 mean_chemo=0.43 parked=0.00 first_bud=712 juv_starved=0.52 to_bud=0.33 PASS
gate-health 3/3 PASS
```

After every change:

```
$ target/release/tidepool-headless gate-health
seed=1 creatures=1321 min_late=1170 plants=2229 births_late=2187 max_gen=14 mean_chemo=0.38 parked=0.00 first_bud=747 juv_starved=0.53 to_bud=0.33 PASS
seed=2 creatures=1274 min_late=1110 plants=2076 births_late=2223 max_gen=16 mean_chemo=0.31 parked=0.00 first_bud=745 juv_starved=0.52 to_bud=0.32 PASS
seed=3 creatures=1166 min_late=1066 plants=1965 births_late=1996 max_gen=16 mean_chemo=0.43 parked=0.00 first_bud=712 juv_starved=0.52 to_bud=0.33 PASS
gate-health 3/3 PASS
```

`diff` of the two outputs printed nothing. A harder check: `run --seed <n> --ticks 9000 --creatures
400 --plants 1200` on seeds 1, 2, 3 prints the hashes `cf476f0e`, `2d7d5223`, `dc74e78f`. Those are
the three hashes of section 7 of the audit.

## `make check`

Exit **0**, read from `$?` with the output sent to a file. Rust: 222 tests in 14 groups, no failure
(headless 4, sim unit tests 31, brain 9, control 15, determinism 5, energy 27, eye 13, genome 21,
motor 19, params 5, plants 10, repro 18, snapshot 32, world 13). Vitest: 7 files, 88 tests.

`make gates` was not run, as the task says. `gate-evolve` was not run either: the census rows above
stand in for its seeing run on seeds 1 and 8.

## Not done, and what looks wrong

- **The other two ends of the same ranges are still wider than their genes.** `birth_growth` goes
  down to 0.1 and `EGG_RANGE` starts at 0.2. `lifespan` goes up to 24,000 and `OLD_RANGE` stops at
  9,600. It is the defect of L3. The task named the other two ends, so these stand. A proof in
  `docs/gates.md` (the world with no upkeep, line 322) runs at `lifespan=24000`, so the top of
  `lifespan` needs that proof run again before it moves.
- **One recorded command is now a usage error.** `m2-tuning.md` line 232:
  `probe-heirs --pick 150 --param lifespan=600`. It exits 2. The record was not edited.
- **The page test for rule 10 fails at its search, not at the page's assertion.** See above. A page
  test that does not lean on the core for the search needs the parent of a body in the frame or in
  the heirs, and neither holds it.
- **`n_hidden` has no edit of its own**, for the reason above.
- **The `eaten` figure of 184 at tick 72,000** in `m2-tuning.md` was not found again.
- **`gates.md` still says** that the probes ran with `--m2`, and its snapshot row still says 19 of 31
  tests. That is finding M1. The new `probe-census` text says that its rows are the tuned defaults.
- **`AGENTS.md`** was not changed. Its status line is still true.
