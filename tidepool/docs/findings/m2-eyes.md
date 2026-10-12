# M2 eyes: the baseline rows, what sight does to the world, and what the scan costs

Date: 2026-10-11. Task 10 of `docs/plans/2026-10-11-m2-bodies.md`.

**The mechanism fires. Nothing here shows that evolution uses eyes or that eyes help.** A founder with
the eye of the plan swims to a plant it sees. A default world of such founders holds a quarter to a
third of the creatures of a world with no eyes. The scan meets the throughput target only in a probe
world and only with `see_every` at 2, which is now the default.

## What kind of claim each line is

`AGENTS.md` names three kinds of claim. This task can show only the first.

| Claim | Kind | Shown by |
|---|---|---|
| A thing in a cone lights the input of that side, by its nearness | The mechanism fires | The tests of `crates/sim/tests/eye.rs` |
| The scan finds the same things as a search of every plant and body | The mechanism fires | `the_search_box_holds_every_thing_that_a_cone_holds`. It failed when the box was made too small on purpose |
| A founder with eyes swims to a plant it sees | The mechanism fires | 5 of 5 seeds, thinking on one tick in 2 and scanning on one think in 2: it came within 1.5 units of a plant 30 units away. With no eye it came no closer than 23 units |
| Eyes are at work in a default world | The mechanism fires | The reload test counts bodies with a lit eye input at tick 300 |
| A world of eyed founders holds fewer creatures | The mechanism fires, and it thins the world | "Sight thins the world" below |
| Evolution keeps, grows, or loses eyes | Evolution uses it | **Not measured.** No run here reads the eye genes after a long run |
| A body with eyes does better than one without | It helps | **Not measured.** The population count is not this measure, and it went down |

## The switch-on rule ends here

Four input neurons more raise brain upkeep for every creature, so the default rows change.

The rows before this task. They are the M1 rows of the plan:

```
$ target/release/tidepool-headless gate-health
seed=1 creatures=1477 min_late=778 plants=1682 births_late=1544 max_gen=11 mean_chemo=0.57 parked=0.00 first_bud=1527 PASS
seed=2 creatures=1373 min_late=958 plants=1471 births_late=1470 max_gen=12 mean_chemo=0.50 parked=0.00 first_bud=1483 PASS
seed=3 creatures=1148 min_late=669 plants=1504 births_late=1165 max_gen=11 mean_chemo=0.53 parked=0.00 first_bud=1638 PASS
gate-health 3/3 PASS
```

**M2 baseline, eyes off.** The rows after this task. From here on a task compares with these:

```
$ target/release/tidepool-headless gate-health
seed=1 creatures=1479 min_late=914 plants=1684 births_late=1468 max_gen=13 mean_chemo=0.47 parked=0.00 first_bud=1590 PASS
seed=2 creatures=1286 min_late=792 plants=1689 births_late=1250 max_gen=12 mean_chemo=0.50 parked=0.00 first_bud=1528 PASS
seed=3 creatures=1223 min_late=712 plants=1544 births_late=1295 max_gen=11 mean_chemo=0.56 parked=0.00 first_bud=1498 PASS
gate-health 3/3 PASS
```

**The four neurons are the only thing that moved.** With `neuron_upkeep` at 0 the rows before and
after this task are equal digit for digit.

Before:

```
$ target/release/tidepool-headless gate-health --param neuron_upkeep=0
seed=1 creatures=1638 min_late=889 plants=1372 births_late=1561 max_gen=12 mean_chemo=0.43 parked=0.00 first_bud=1429 PASS
seed=2 creatures=1296 min_late=709 plants=1374 births_late=1178 max_gen=11 mean_chemo=0.50 parked=0.00 first_bud=1494 PASS
seed=3 creatures=1136 min_late=701 plants=1459 births_late=1121 max_gen=11 mean_chemo=0.61 parked=0.00 first_bud=1606 PASS
gate-health 3/3 PASS
```

After:

```
$ target/release/tidepool-headless gate-health --param neuron_upkeep=0
seed=1 creatures=1638 min_late=889 plants=1372 births_late=1561 max_gen=12 mean_chemo=0.43 parked=0.00 first_bud=1429 PASS
seed=2 creatures=1296 min_late=709 plants=1374 births_late=1178 max_gen=11 mean_chemo=0.50 parked=0.00 first_bud=1494 PASS
seed=3 creatures=1136 min_late=701 plants=1459 births_late=1121 max_gen=11 mean_chemo=0.61 parked=0.00 first_bud=1606 PASS
gate-health 3/3 PASS
```

The state hash changes in every case: a brain holds four neurons more, and the snapshot holds their
values.

## Eyes on

A reading, not a trial. One run per seed. No hypothesis was written before it and nothing was tuned.

```
$ target/release/tidepool-headless gate-health --param founder_eye=0.2
seed=1 creatures=380 min_late=380 plants=503 births_late=588 max_gen=10 mean_chemo=0.47 parked=0.00 first_bud=1368 PASS
seed=2 creatures=333 min_late=333 plants=525 births_late=581 max_gen=10 mean_chemo=0.46 parked=0.00 first_bud=1396 PASS
seed=3 creatures=175 min_late=170 plants=389 births_late=310 max_gen=9 mean_chemo=0.46 parked=0.00 first_bud=1413 PASS
gate-health 3/3 PASS
```

These rows are at the new default, `see_every` 2. The same reading with the eyes scanning on every
think:

```
$ target/release/tidepool-headless gate-health --param founder_eye=0.2 --param see_every=1
seed=1 creatures=458 min_late=452 plants=767 births_late=582 max_gen=10 mean_chemo=0.44 parked=0.00 first_bud=1410 PASS
seed=2 creatures=382 min_late=381 plants=707 births_late=524 max_gen=11 mean_chemo=0.59 parked=0.00 first_bud=1376 PASS
seed=3 creatures=239 min_late=236 plants=506 births_late=348 max_gen=10 mean_chemo=0.52 parked=0.00 first_bud=1470 PASS
gate-health 3/3 PASS
```

The gate passes on 3 of 3 seeds. Seed 3 at `see_every` 2 is near two bands: 175 creatures against a
band of 150, and `max_gen` 9 against a band of 8.

## Sight thins the world

**What this is:** one run per arm, on one seed (9), read at tick 1,500. Then the 3-seed gate rows
above. It shows that the mechanism fires and that it thins the world. It does not show what evolution
does with eyes. Nothing was tuned: Task 13 owns that, and the owner has decided how to handle grazing
that thins the world (`docs/decisions/INDEX.md`).

`tidepool-headless run --seed 9 --ticks 1500 --creatures 400 --plants 1200`, with the parameters of
each arm:

| Arm | Parameters | Creatures | Plants |
|---|---|---|---|
| No eye | none | 474 | 1,563 |
| Eye, blind | `founder_eye=0.2 eye_gain=0` | 408 | 1,624 |
| Eye, sight, no look wire | `founder_eye=0.2 starter_look=0` | 436 | 1,606 |
| Eye, sight, and the look wire | `founder_eye=0.2` | 166 | 1,012 |

The table is at `see_every` 2. At `see_every` 1 the third arm gives 421 creatures and 1,608 plants,
and the fourth gives 163 and 977.

The look wire is the cause. The cost of the eye is not: the blind arm and the arm with no look wire
hold about the creatures of the world with no eye. With the wire, the world of the fourth arm at
`see_every` 1 went like this:

| Tick | Alive | Births so far | Deaths so far | Plants |
|---|---|---|---|---|
| 300 | 556 | 156 | 0 | 1,173 |
| 600 | 510 | 205 | 95 | 934 |
| 900 | 320 | 215 | 295 | 814 |
| 1,200 | 184 | 220 | 436 | 856 |
| 1,500 | 163 | 235 | 472 | 977 |

Measured: the eyed founders bud early, the plants fall by a third, and then the creatures fall.
Guessed, not measured: this is the grazing effect of the M1 audit (finding F2), stronger, because a
body that sees a plant goes to it and stays on it.

One arm is not a fair pair of another. A founder with an eye draws 16 more numbers for its brain, so
from the second founder on, the founders of an eyed world stand in other places than those of the
world with no eye. The blind arm (`eye_gain=0`) is the fair pair of the fourth arm.

## Throughput

All readings: `node scripts/bench-wasm.mjs`, WASM in Node, seed 1, the median of 5 runs of 2,000
ticks. Other work ran on the machine. The load average was 7 to 11 through the session, so only runs
that alternate are compared, and no figure here is a gate reading.

### (a) Eyes off, against the build before this task

At the defaults, 4 rounds, load average 8.1 to 8.7:

| Build | Mean alive | Ticks per second, by round |
|---|---|---|
| Before | 1,539 | 3,753, 3,717, 3,750, 3,695 |
| This task | 1,483 | 4,105, 4,079, 4,041, 4,054 |

The two builds do not time the same world here: the rows above show that the default world changed.

On one identical world (`--param neuron_upkeep=0`, mean 1,508 alive in every run), 4 rounds, load
average 8.7 to 10.6:

| Build | Ticks per second, by round | Mean | Against before |
|---|---|---|---|
| Before | 3,934, 3,980, 3,949, 3,987 | 3,963 | |
| This task, first build | 3,761, 3,765, 3,825, 3,805 | 3,789 | 4.4% slower |
| This task, final build | 3,856, 3,882, 3,933, 3,984 | 3,914 | 1.2% slower |

The first build is the scan as first written. The final build has the faster scan of the next
section. In this world no body has an eye, so the code that differs between the two never runs.

### (b) Eyes on

**The reading that the plan asks for is void.** The bench needs a mean of 1,200 creatures, and an
eyed world does not hold them, with or without the plant growth of the plan's probe:

```
$ node scripts/bench-wasm.mjs --param founder_eye=0.2
settled tick=12000 creatures=380 plants=503
run 1 creatures=270 tps=17315
VOID: population fell
$ node scripts/bench-wasm.mjs --param founder_eye=0.2 --param plant_growth=0.03
settled tick=12000 creatures=463 plants=562
run 1 creatures=394 tps=12115
VOID: population fell
```

At `see_every` 1 the eyed world settled at 430 creatures with `plant_growth` 0.03, at 547 with 0.06,
and at 483 with 0.1. More plant growth does not fill it. With no eyes, `plant_growth` 0.03 gives
1,802 creatures and 3,273 ticks per second.

**The timing world is a probe world.** `--param founder_eye=0.2 --param starter_look=0 --param
eye_gain=0`. Every body has the founder eye and scans. No body steers by sight, so the world stays
full: 1,452 creatures and 1,768 plants at tick 12,000, and a mean of 1,592 alive over the timed
ticks. With `eye_gain` at 0 the eye inputs are always 0, so the world is the same at every value of
`see_every`, and two values of it time the same world.

The final build, 3 rounds, load average 9.8 falling to 7.7:

| `see_every` | Ticks per second, by round | Mean | Microseconds per tick |
|---|---|---|---|
| 1 | 2,555, 2,543, 2,557 | 2,552 | 391.9 |
| 2 (the default) | 2,974, 2,967, 2,981 | 2,974 | 336.2 |
| 4 | 3,230, 3,235, 3,266 | 3,244 | 308.3 |

**Against the target of 2,800 at 1,200 creatures or more: 2,974 at 1,592, with `see_every` 2.** At
`see_every` 1 the reading is 2,552: over the floor of 2,400 and under the target.

The margin is thin, and a loaded machine eats it. The committed build differs from the build of
the table only in comments. A second set on it, 3 rounds, with the load average at 12.8 and falling
to 9.7: 2,540, 2,523, and 2,526 at `see_every` 1. 2,770, 2,986, and 2,957 at `see_every` 2. 3,253,
3,254, and 3,271 at `see_every` 4. One round of three at `see_every` 2 is under the target.

What this reading does not cover: a world where bodies steer by sight. There the bodies crowd on
plants and a scan finds more things. That world could not be timed, because it holds under 500
creatures.

### What `see` costs

From the table above. Going from `see_every` 1 to 4 removes three quarters of the scans, and going
from 1 to 2 removes half:

- `4/3 * (391.9 - 308.3)` = **111 microseconds per tick** at `see_every` 1.
- `2 * (391.9 - 336.2)` = 111 as well. The two agree.
- **56 microseconds per tick at the default, `see_every` 2.**
- About 140 nanoseconds per scan: 796 bodies scan per tick at `see_every` 1.
- The tick with no scan is about 280 microseconds in this world.

A native probe counted the work of a scan in this world: 17.8 plants and bodies visited per scan,
5.4 of them inside the box of the cones. The rest are in the same 32-unit cells as the box.

### How the cost came down, and which levers were used

The same probe world, each step against the step before, in runs that alternate:

| Step | Ticks per second at `see_every` 1 and 4 | `see` at `see_every` 1 |
|---|---|---|
| First build | 1,922 and 2,909 | 235 microseconds per tick |
| The cone test with no branch | 2,330 and 3,130 | 146 to 150 |
| The axis of each cone kept by `express` (`eye_ax`, `eye_ay`) | 2,535 and 3,247 | 115 |
| Final build | 2,552 and 3,244 | 111 |

With parts of the branch-free scan switched off in turn, the 150 was: about 37 for `math::sin_cos`
on each cone, about 23 for the rest of the setup, and about 90 for the two grid queries.

The plan's levers, in order:

1. **The query is the box of the cones.** In from the first build, so it was not a step. A test
   proves the box against a search of everything.
2. **`see_every` 2. Used.** The default in `params.rs` is now 2. At `see_every` 1 the best build
   reads 2,552, and the target is 2,800.
3. **`EYE_REACH` 48. Not used.** The target is met. It would not move this reading: the range of the
   founder eye is 38.4.

Tried and dropped, each with no gain outside the noise: the scan in a loop of its own in
`sense::step`, the scan kept out of line with `#[inline(never)]`, and a path in `math::wrap_angle`
that skips the `%` for an angle already in range.

## Two side findings

**1. Eyes off, the new build is slower on an identical world.**

Measured: on the `neuron_upkeep=0` world the first build is 4.4% slower than the build before this
task and the final build is 1.2% slower (table (a) above). A third build, with 11 inputs and no scan
code at all, was 4.2% slower in 4 rounds with a load average of 10 (3,640 against 3,800). An earlier
3 rounds of the first build gave 4.7% (3,768 against 3,952).

Guessed, not tested: 17 neurons take 68 bytes, so a brain block now crosses a cache line in each of
the four brain arrays. The readings do not support this guess well. The first build and the final
build have the same brain, differ only in code that this world never runs, and read 3 points apart.
So the layout of the build moves the reading by about as much as the loss, and the cost of the four
neurons alone is not known closer than "between 1% and 4%". Nothing was changed for it.

**2. At the defaults the new build reads faster than the old one.**

Measured: 4,070 against 3,729 ticks per second (the means of table (a)), with a mean of 1,483 alive
against 1,539.

Guessed, not tested: the gain comes from the world, not from the code. The default world of this
build holds fewer creatures, and on an identical world the same build is 1.2% slower.

## What a later task will trip on

- **A snapshot from before this task does not load.** Every hidden and output neuron moved up by 4.
  An old snapshot fails with `Invalid("brain genome connection out of range")`. `FORMAT_VERSION` is
  still 5: `snapshot.rs` was not in this task.
- **`see_every` is 2 by default.** The parameter table of the plan says 1.
- **An eyed default world is void for the bench.** A task that times eyes needs the probe world
  above, or a world that Task 13 has tuned.
- **`eye_gain` 0 still scans.** The blind arm pays the time of the scan and sees nothing.
- **`founder_eye` moves the founders.** See the last paragraph of "Sight thins the world".
- **Rules that the plan left open, as built.** The eye is at the centre of the body. A thing at that
  exact point is in no cone, which is also how a body does not see itself. A side with two cones
  takes the larger nearness of the two. A cone is on the right when the sine of its angle from the
  heading is above 0, and on both sides when it is exactly 0, which holds for anchors 0 and 1.
- **`math::sin_cos` is slow in WASM.** Measured: about 23 nanoseconds per call inside the scan.
  Guessed: the motor, which calls it once per body per tick, pays about as much.
