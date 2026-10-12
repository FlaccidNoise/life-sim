# Gates

A gate counts only after it has rejected a known-bad input. Each row records the bad input and the
output seen. All proofs ran on 2026-10-10, except the CI row and the evolution row, which were proven
on 2026-10-11.

| Gate | Command | Bad input used to prove it | Output seen | Date |
|---|---|---|---|---|
| Clippy banned methods | `cargo clippy --workspace --all-targets -- -D warnings` | `pub fn bad(x: f32) -> f32 { x.sin() }` added to `crates/sim/src/lib.rs` | ``error: use of a disallowed method `f32::sin` ``, exit 101 | 2026-10-10 |
| Import layers (ESLint) | `pnpm exec eslint .` | A file `src/render/x.ts` that contains `import '../app/main';` | `'../app/main' import is restricted from being used by a pattern. Dependency rule: see docs/architecture.md section 4`, exit 1 | 2026-10-10 |
| Import layers, `src/` root (ESLint) | `pnpm exec eslint .` | A file `src/x.ts` that contains `import './app/main';` and `import './worker/host';` | `'./app/main' import is restricted from being used by a pattern. Dependency rule: see docs/architecture.md section 4`, the same line for `'./worker/host'`, exit 1 | 2026-10-10 |
| No dynamic import (ESLint) | `pnpm exec eslint .` | A file `src/render/y.ts` that contains `export const later = () => import('../protocol');` | `No dynamic import() in src: the dependency rule cannot check it. See docs/architecture.md section 4`, exit 1 | 2026-10-10 |
| Crate count | `make check` (first step) | A scratch crate `crates/x` with an empty `src/lib.rs`, added to `crates/sim/Cargo.toml` as `x = { path = "../x" }` | `error: the cargo workspace must hold only tidepool-sim and tidepool-headless, and crates/sim must have zero dependencies. Cargo.lock lists:`, then the 3 names with `name = "x"` last, then `make: *** [check] Error 1` | 2026-10-10 |
| Rust format | `cargo fmt --all -- --check` | `pub fn  ugly( )->u32{1}` added to `crates/sim/src/lib.rs` | `Diff in` the path of `lib.rs`, then the bad line and the formatted lines, exit 1 | 2026-10-10 |
| TypeScript format | `pnpm exec prettier --check src tests scripts` | A file `src/z.ts` that contains `export const  ugly = {a:1,` and ` b:2}` on two lines | `[warn] src/z.ts`, `[warn] Code style issues found in the above file. Run Prettier with --write to fix.`, exit 1 | 2026-10-10 |
| Type check | `pnpm exec tsc --noEmit` | A file `src/x.ts` that contains `export const n: number = 'a';` | `src/x.ts(1,14): error TS2322: Type 'string' is not assignable to type 'number'.`, exit 2 | 2026-10-10 |
| Snapshot round trip | `cargo test --test snapshot` | The `vy` line removed from both `Creatures::save` and `Creatures::load` in `crates/sim/src/creature.rs` | 19 of 31 tests fail, exit 101. The round-trip test is `load_then_run_equals_unbroken_run ... FAILED`, with ``assertion `left == right` failed``, `left: 734987217`, `right: 3259364194`. The other 18 are in the notes. | 2026-10-10 |
| Native equals WASM | `pnpm exec vitest run tests/determinism.test.ts` | `#[cfg(target_arch = "wasm32")] { self.creatures.vx[0] += 1.0e-6; }` added to `World::tick`, just before `self.tick` is incremented at the end, then `make wasm` | All 3 seeds fail. Seed 1: `AssertionError: expected 1261540159 to be 3031850156 // Object.is equality` | 2026-10-10 |
| Throughput, native | `make gates` (runs `target/release/tidepool-headless bench`) | `bench --floor 1000000000`, and `bench --reference 5000` | `bench creatures=1539 median_tps=4430 floor=1000000000 FAIL`, exit 1. `VOID: population fell`, exit 1. The full output is in "Throughput bench" below. | 2026-10-10 |
| Throughput, WASM in Node | `make gates` (runs `node scripts/bench-wasm.mjs`) | `node scripts/bench-wasm.mjs --floor 1000000000`, and `--reference 5000` | `bench-wasm creatures=1539 median_tps=3761 floor=1000000000 FAIL`, exit 1. `VOID: population fell`, exit 1. The full output is in "Throughput bench" below. | 2026-10-10 |
| Health | `make gates` (runs `target/release/tidepool-headless gate-health`) | `gate-health --param plant_growth=0`, and `gate-health --param basal=0.01` | Both: every seed `FAIL`, `gate-health 0/3 FAIL`, exit 1. The full output is in "Health gate" below. | 2026-10-10 |
| CI | `.github/workflows/tidepool.yml` runs `make check`, `bench --floor 800`, `scripts/bench-wasm.mjs --floor 800`, `gate-health`, and `gate-evolve` | Two commits on a throwaway branch `ci-proof`: `pub fn bad(x: f32) -> f32 { x.sin() }` added to `crates/sim/src/lib.rs`, and then, with that reverted, `--floor 1000000000` on the `bench-wasm.mjs` step of the workflow | Run 38179267371 failed at `make check`: ``error: use of a disallowed method `f32::sin` ``. Run 38179352131 failed at the WASM bench step: `bench-wasm creatures=1539 median_tps=1801 floor=1000000000 FAIL`, and the health gate step was skipped | 2026-10-11 |
| Evolution | `target/release/tidepool-headless gate-evolve`. In `make gates` and in CI since Task 13 of the M2 plan | One world for each band, each with `--m2`: the M1 size rules (`len`, `len_sd`), parts that can only be lost in a world where no sense works (`parts`), `scent_deposit=0` (scent gap), `eye_range=0` (eye gap), senses that read almost nothing (both gaps, against chance), and `fert_radius=40` (`creatures`) | Each run: `gate-evolve 0/3 FAIL`, exit 1, with the named band among the failures of every seed, or of 2 seeds of 3 for `len_sd`. Two changes to the plan: the `parts` proof needed a harder input, and the gap bands went from 0.02 to 0.10. The full output and the limits are in "Gate-evolve" below | 2026-10-11 |

## Notes

- **Clippy banned methods.** The list covers `f32` and `f64`. `(x as f64).sin() as f32` and `x.ln()` on an `f32`, added to `crates/sim/src/lib.rs`, give
  ``error: use of a disallowed method `f64::sin` `` and ``error: use of a disallowed method `f32::ln` ``,
  exit 101. A test file under `crates/sim/tests/` runs native only and can allow the lint.
- **Snapshot round trip.** Run again at the M1 head, after the audit found the old output of an
  earlier build in this row. Three tests catch a forgotten field by themselves:
  `load_then_run_equals_unbroken_run`, `load_then_run_equals_unbroken_run_across_births` (`left:
  1380643796`, `right: 2738402061`), and `every_saved_field_is_in_the_hash_and_survives_a_load` (`vy is
  not in the hash`). The other two round-trip tests (`load_gives_the_same_hash_immediately` and
  `spawning_after_load_matches_spawning_without_it`) still pass with that field missing. The other 16
  tests that fail build a payload by hand in the test file, and that payload now has one creature
  field too many. Removing the line from `save` alone fails 10 of 31 tests. The 3 tests above and both
  of the other round-trip tests are among them. 9 of the 10 stop at the load with `Invalid("creature
  field length")`, and 1 stops with `Invalid("death cause")`.
- **Native equals WASM.** Run again at the M1 head for the same reason. 3031850156 is `b4b65cac`, the
  native hash of seed 1.
- **Throughput.** The floor is 2,400 ticks per second at the reference world, for WASM in Node
  (`architecture.md` section 2). `scripts/bench-wasm.mjs` enforces it. The native bench is for probes
  and a quick reading. "Throughput bench" below says what both benches time.
- **Throughput, void run.** A run is void when its mean alive count over the timed ticks is below 80%
  of `--reference` (1,500, so 1,200). The bench prints `VOID: population fell` and exits 1. The rule
  reads `--reference`, not `--creatures`: the founders are 400 and the settled world holds more.
- **CI.** Proven on 2026-10-11 (M2 Task 1). The workflow passed on a side branch and then on `main`,
  and it failed on both bad commits of the row above. The branch `ci-proof` was deleted after the
  second run. The first passing run (38177642801) answered the four open points of the M1 audit:
  `pnpm/action-setup@v4` installs the pinned pnpm, pnpm 11 runs on Node 22, the runner clears the floor
  of 800 (WASM 1,882, native 2,360, about half of the reference machine), and the native build on
  x86-64 gives the hashes of the `.wasm` (`tests/determinism.test.ts` passed, and the health rows match
  the aarch64 rows to the digit). Not proven on CI: the health gate step, which no bad commit has
  reached. It is the same binary and command that `make gates` proves locally. `make gates` enforces
  the real floor of 2,400 on the reference machine.
- **Known, not a gate.** M0 drifters gain energy on a long run: the audit measured a mean speed of 0.76
  units per tick at tick 0 and 48 at tick 72,000. Task 10 and Task 11 replace the M0 motion.

## Throughput bench

`target/release/tidepool-headless bench` and `node scripts/bench-wasm.mjs` take the same flags and
print the same lines. The summary line starts `bench` or `bench-wasm`.

`[--seed 1] [--world 1536x1024] [--creatures 400] [--plants 1200] [--settle 12000] [--ticks 2000]
[--runs 5] [--reference 1500] [--floor 2400]`

1. Make the default world on `--seed` and run `--settle` ticks. These ticks are not timed.
2. Print `settled tick=<n> creatures=<n> plants=<n>` and save a snapshot.
3. For each run, load the snapshot and time `--ticks` ticks. Every run does the same work. The alive
   count is sampled every 100 ticks, outside the timed section.
4. Exit 0 on `PASS`, 1 on `FAIL` or a void run, 2 on a usage error.

The `settled` line at the defaults matches the seed 1 row of the health gate: 1,477 creatures and
1,682 plants at tick 12,000.

*Since M2 Task 13 (2026-10-11):* the `settled` line reads 1,321 creatures and 2,229 plants, and the
mean over the timed ticks is 1,327. The table of seeds below is the M1 world. At the tuned defaults
`gate-health` reads 1,079 to 1,381 creatures at tick 12,000 on seeds 1 to 10, and seeds 3, 4, 6, and 9
are under 1,200 there. The gate is still a seed 1 reading.

**The throughput gate is a seed 1 reading.** `make gates` and the CI workflow time the default world
on seed 1 and on no other seed. The mean alive count over the timed ticks, from `bench --seed <n>
--runs 1`:

| Seed | Alive at tick 12,000 | Mean alive over ticks 12,000 to 14,000 | Against the void line of 1,200 |
|---|---|---|---|
| 1 | 1,477 | 1,539 | Above |
| 2 | 1,373 | 1,265 | Above |
| 3 | 1,148 | 1,197 | Below: void |
| 4 | 1,058 | 1,071 | Below: void |
| 5 | 1,550 | 1,535 | Above |
| 6 | 1,180 | 1,243 | Above |

Seeds 3 and 4 would be void at the 1,200 line. A thinner world reads faster (native, one run each:
4,479 on seed 1 and 6,524 on seed 4), so seed 1 is on the slow side of these 6. The margin over the
floor belongs to seed 1. The audit found this (`findings/m1-audit.md`, finding F7).

The proofs. Other work ran on the machine, so the `tps` figures here are not gate readings.

```
$ target/release/tidepool-headless bench --floor 1000000000
settled tick=12000 creatures=1477 plants=1682
run 1 creatures=1539 tps=4371
run 2 creatures=1539 tps=4430
run 3 creatures=1539 tps=4467
run 4 creatures=1539 tps=4352
run 5 creatures=1539 tps=4443
bench creatures=1539 median_tps=4430 floor=1000000000 FAIL
exit=1
$ node scripts/bench-wasm.mjs --floor 1000000000
settled tick=12000 creatures=1477 plants=1682
run 1 creatures=1539 tps=3714
run 2 creatures=1539 tps=3739
run 3 creatures=1539 tps=3793
run 4 creatures=1539 tps=3770
run 5 creatures=1539 tps=3761
bench-wasm creatures=1539 median_tps=3761 floor=1000000000 FAIL
exit=1
$ target/release/tidepool-headless bench --reference 5000
settled tick=12000 creatures=1477 plants=1682
run 1 creatures=1539 tps=4454
VOID: population fell
exit=1
$ node scripts/bench-wasm.mjs --reference 5000
settled tick=12000 creatures=1477 plants=1682
run 1 creatures=1539 tps=3789
VOID: population fell
exit=1
```

The reading responds to work. A world that settles for 200 ticks is young and sparse. It reads about
3 times as fast as the default, and it is void.

```
$ target/release/tidepool-headless bench --settle 200
settled tick=200 creatures=493 plants=1295
run 1 creatures=485 tps=13420
VOID: population fell
exit=1
$ node scripts/bench-wasm.mjs --settle 200
settled tick=200 creatures=493 plants=1295
run 1 creatures=485 tps=11174
VOID: population fell
exit=1
```

## Throughput readings

`make gates` on the reference machine, run by the orchestrator with no other Tidepool work running. Add
a row when a task changes the cost of a tick. The floor applies to the WASM column. On 2026-10-10 another
project kept the machine at a load average near 5, so these readings are lower bounds.

| Date | After task | World | Mean creatures | Native `median_tps` | WASM `median_tps` | Floor |
|---|---|---|---|---|---|---|
| 2026-10-10 | 9 (M0 exit) | 1,500 drifters, no plants, no brains | 1,500 | 34,264 | 23,250 | 2,400 |
| 2026-10-10 | 10 (M1 skeleton, stub rules) | 3072 by 1536, 1,500 founders that wander, no plants yet | 1,500 | 12,627 | 10,633 | 2,400 |
| 2026-10-10 | 11 and 12 (motor, plants, scent) | 3072 by 1536, 1,500 founders that wander, 3,000 founder plants | 1,500 | 9,396 | 8,366 | 2,400 |
| 2026-10-10 | 13 (energy) | The same world. Creatures now starve | 228 | VOID | VOID | 2,400 |
| 2026-10-10 | 14 (budding) | The same world | 234 | VOID | VOID | 2,400 |
| 2026-10-10 | 15 (brains) | The same world. Creatures now follow scent | 144 | VOID | VOID | 2,400 |
| 2026-10-10 | 16 (tuned defaults) | The same world | 425 | VOID | VOID | 2,400 |
| 2026-10-10 | 16, bench on the settled world | The default world after 12,000 ticks, seed 1 | 1,539 | 4,381 | 3,757 | 2,400 |
| 2026-10-11 | After M2 task 2 (the genome is a part list, every M2 rule is off) | The same world. The `settled` line and the mean are the M1 ones | 1,539 | 3,993 | 3,594 | 2,400 |
| 2026-10-11 | M2 task 4 (motor), rules off | The default world after 12,000 ticks, seed 1 | 1,539 | 4,096 | 3,594 to 3,640 | 2,400 |
| 2026-10-11 | M2 task 10 (eyes), no founder has an eye | The default world after 12,000 ticks, seed 1. Four more input neurons per brain | 1,483 | not read | 4,041 to 4,105 | 2,400 |
| 2026-10-11 | M2 task 10, every body scans | A probe world, not the default: `founder_eye=0.2 starter_look=0 eye_gain=0`, so every body has eyes and none steers by sight | 1,592 | not read | 2,967 to 2,981 at `see_every` 2. 2,543 to 2,557 at 1 | 2,400 |
| 2026-10-11 | M2 task 13 (the M2 rules on, the grazing rule, tuned defaults) | The default world after 12,000 ticks, seed 1: 1,321 creatures and 2,229 plants. Every body has eyes and steers by them | 1,327 | 2,993 to 3,298 | 3,002 to 3,067 | 2,400 |

The Task 13 row: native and WASM in turn, 3 rounds, at a load average of 3.7 from other projects.
Native 3,298, 2,993, 3,284. WASM 3,002, 3,043, 3,067. The world of this row is not the world of
the rows above it: bodies are larger, a third of them are juveniles where two thirds were, and the
plants hold 2.75 times the reserve. The same world is fuller when it is old: `node
scripts/bench-wasm.mjs --settle 108000 --runs 3` reads 2,304 ticks per second at a mean of 1,734
alive, under the floor. No gate times that world (`findings/m2-tuning.md`).

**The row after M2 task 2 is a lower bound.** Other projects held the machine at a load average near 7
during that run of `make gates`. Run back to back at that load, 3 runs each and twice over, the native
bench of the commit before the task read 4,290 and 4,435, and the bench of the task read 4,269 and
4,339. So the task costs 2% of a tick at most. An earlier run of `make gates`, at a load average above
20, failed the native floor at 1,531. The bench of the commit before the task read 2,071 and 2,309
then, so that failure was the machine and not the task.

**The row after M2 task 4 is an alternating reading.** The machine held a load average of 6 to 8 from
other projects, so the orchestrator timed the build before the task (`a069d59`) and the build after it
three times each, in turn. WASM before: 3,434, 3,440, 3,483. WASM after: 3,594, 3,632, 3,640. That is
4.9% faster. The first version of the task was 7.4% slower in WASM (3,306, 3,300, 3,306 against 3,568,
3,568, 3,549) and no slower native. The agent found the cost by building one variant at a time: the
fin term read the velocity of this tick and so waited for the velocity update (about 5%), a call to
`Creatures::mass` per body in the scratch fill (about 2%), a division by `v_max` per body, and the heft
worked out twice. The neighbour box is now the body's own radius plus `MAX_RADIUS`, not twice
`MAX_RADIUS`. With the M2 motor rules switched on (`--param push_mass=1 --param motor_curve=1 --param
part_mass=0.1`) the same bench reads 4,432 at a mean of 1,321 creatures: a different world, so not a
pair with the rows above.

**The two rows after M2 task 10.** `findings/m2-eyes.md` has every reading. The first row reads
faster than the row before it only because its world holds fewer creatures: on one identical world
(`neuron_upkeep=0`) the build with eyes is 1.2% slower. The second row is not the default world. An
eyed world whose founders steer by sight holds 270 to 460 creatures at every `plant_growth` tried, so
the bench is void there. The probe world makes every body scan and lets none steer by sight, and holds
1,592. The scan costs 111 microseconds per tick at `see_every` 1 and 56 at the default of 2. One later
set at a load average of 12.8 read 2,770, 2,986, and 2,957 at `see_every` 2. **With eyes the margin
over the floor is about 1.2 times, down from 1.6 at the M1 exit.**

**The void row after Task 13.** Both benches print `VOID: population fell` and `make gates` exits 2. The
gate works as built: it refuses to time a world that has emptied. The bench world falls from 1,500
creatures to 573 at tick 500 and 51 at tick 1,000, and nearly every death is starvation. Creatures still
steer by noise, and a wandering body pays 0.086 energy per tick against 0.288 per tick on a plant, so it
must touch a plant 30% of the time. The brain that follows scent is Task 15. No parameter, rule, or
bench was changed to hide this. The gate must pass again at Task 15.

**Still void after Task 15.** Brains work: at tick 500 on the default world, 83% to 89% of creatures are
within 2 body lengths of a plant, against 34% to 51% with the turn output forced to 0. The bench world
still empties, from 1,500 to 381 at tick 500 and 3 at tick 1,000, and every death is starvation. The
cause is the food supply at the default parameters, which are arithmetic and not yet tuned. A plant
grows at most 0.025 energy per tick and a default creature burns about 0.10. The 2,023 plants that fit
in the bench world can feed about 500 creatures, and the gate needs a mean of 1,200 alive. No brain can
pass it at these defaults. Task 16 tunes the defaults, and its final proof includes this gate.

**Still void after Task 16.** Task 16 tuned `plant_growth` (0.005 to 0.02) and `intake_rate` (0.04 to
0.08). The health gate passes. The bench world still empties below the void line: 1,500 founders, then
1,552, 1,064, 525, 292, 215, 196, 212, 245, 306, 374, and 461 alive at ticks 200 to 2,200. The mean is
425 and the gate needs 1,200. This is not a tuning miss. The bench world has the same 14 fertile
patches as the default world (`fert_blobs` is a count, not a density) and 1,500 founders against 400.
A trial with enough food for the bench (`plant_growth=0.07`, bench mean 1,418) put 3,152 to 3,731
creatures in the default world at tick 12,000, which fails the health gate, and that default world ran
at 1,381 ticks per second. No bench, floor, or void rule was changed. `docs/findings/m1-tuning.md` has
the trials. What the bench should time is an open question for the orchestrator.

**Decided after Task 16: the benches time the default world after it has settled.** The seeded bench
world was an estimate from before the ecology existed: 3072 by 1536, 1,500 adult founders, 3,000
plants asked, timed from tick 200 to tick 2,200. In the tuned ecology that world is not a steady
state. It has 3 times the area of the default world and the same 14 fertile patches, so it falls to
about 200 creatures by tick 1,000. The default world (1536 by 1024, 400 founders, 1,200 plants) is the
world the game ships and the world `gate-health` judges. It holds 1,148 to 1,477 creatures at tick
12,000 on seeds 1 to 3. On seed 1 that is near the reference population of 1,500, reached by living
instead of by seeding. It is not so on every seed: see "The throughput gate is a seed 1 reading"
above. So both benches now run the default world for 12,000 ticks on seed 1 and time the next 2,000.
The floor (2,400), the reference population (1,500), and the 80% void rule did not change. No
simulation rule or parameter changed. "Throughput bench" above has the protocol and the proofs.

**A reading that is not a gate reading.** To see the cost of a full world before it can exist, Task 15
timed a probe world with all upkeep set to 0 (probe only, mean 1,678 alive, plants eaten down to
almost none). Native 4,274 and WASM 3,708 ticks per second, with other work running. The motor phase
was 58% of the tick: the push between bodies scans every neighbour, and creatures pile onto scent
peaks. Treat this as the shape of the cost. The margin over the 2,400 floor is thin, and M2 adds eyes.

## Health gate

`target/release/tidepool-headless gate-health [--seeds 1,2,3] [--ticks 12000] [--param name=value]...`
runs the default world (1536 by 1024, 400 founder creatures, 1,200 founder plants), one seed after
another. It prints one row per seed and exits 0 only when every seed is inside every band.

| Measure | Meaning | Band |
|---|---|---|
| `creatures` | Alive at the end | 150 to 3,000 |
| `min_late` | Fewest alive at any tick in the second half | 100 or more |
| `plants` | Alive at the end | 300 to 7,000 |
| `births_late` | Births in the last 2,000 ticks | 20 or more |
| `max_gen` | Highest generation alive at the end | 8 or more |
| `mean_chemo` | Mean `chemo` gene of the living | 0.15 or more |
| `parked` | Share of adults with `energy01` above 0.9 and speed below 0.05 | 0.25 or less |
| `first_bud` | Mean age at first bud, over the run, of creatures born in the run | Reported, no band |
| `juv_starved` | Creatures that starved before they were full-grown, over the births of the run | Reported, no band |
| `to_bud` | Creatures born in the run that budded at least once, over the births of the run | Reported, no band |

`first_bud` leaves founders out. A founder starts as an adult at a random age, so its age at its first
bud is not the length of a generation.

`juv_starved` and `to_bud` came with M2 Task 12 (decision 5 of the M2 plan). Both divide by every birth
of the run. A creature born near the end has had no time to starve or to bud, so both read low. The
rows at the defaults, where no founder has an eye:

```
$ target/release/tidepool-headless gate-health
seed=1 creatures=1479 min_late=914 plants=1684 births_late=1468 max_gen=13 mean_chemo=0.47 parked=0.00 first_bud=1590 juv_starved=0.50 to_bud=0.21 PASS
seed=2 creatures=1286 min_late=792 plants=1689 births_late=1250 max_gen=12 mean_chemo=0.50 parked=0.00 first_bud=1528 juv_starved=0.46 to_bud=0.22 PASS
seed=3 creatures=1223 min_late=712 plants=1544 births_late=1295 max_gen=11 mean_chemo=0.56 parked=0.00 first_bud=1498 juv_starved=0.47 to_bud=0.20 PASS
gate-health 3/3 PASS
exit=0
```

The other nine measures are the M2 baseline of `findings/m2-eyes.md`, digit for digit. Every other
output in this section is older than the two measures and does not show them.

The three proofs of the plan, on the tuned defaults. The same three ran before the tuning, on the old
defaults, with the same verdicts.

```
$ target/release/tidepool-headless gate-health --param plant_growth=0
seed=1 creatures=0 min_late=0 plants=700 births_late=0 max_gen=0 mean_chemo=0.00 parked=0.00 first_bud=none FAIL(creatures=0 < 150, min_late=0 < 100, births_late=0 < 20, max_gen=0 < 8, mean_chemo=0.00 < 0.15)
seed=2 creatures=0 min_late=0 plants=779 births_late=0 max_gen=0 mean_chemo=0.00 parked=0.00 first_bud=none FAIL(creatures=0 < 150, min_late=0 < 100, births_late=0 < 20, max_gen=0 < 8, mean_chemo=0.00 < 0.15)
seed=3 creatures=0 min_late=0 plants=745 births_late=0 max_gen=0 mean_chemo=0.00 parked=0.00 first_bud=none FAIL(creatures=0 < 150, min_late=0 < 100, births_late=0 < 20, max_gen=0 < 8, mean_chemo=0.00 < 0.15)
gate-health 0/3 FAIL
exit=1
$ target/release/tidepool-headless gate-health --param basal=0.01
seed=1 creatures=0 min_late=0 plants=2229 births_late=0 max_gen=0 mean_chemo=0.00 parked=0.00 first_bud=none FAIL(creatures=0 < 150, min_late=0 < 100, births_late=0 < 20, max_gen=0 < 8, mean_chemo=0.00 < 0.15)
seed=2 creatures=0 min_late=0 plants=2076 births_late=0 max_gen=0 mean_chemo=0.00 parked=0.00 first_bud=none FAIL(creatures=0 < 150, min_late=0 < 100, births_late=0 < 20, max_gen=0 < 8, mean_chemo=0.00 < 0.15)
seed=3 creatures=0 min_late=0 plants=1965 births_late=0 max_gen=0 mean_chemo=0.00 parked=0.00 first_bud=none FAIL(creatures=0 < 150, min_late=0 < 100, births_late=0 < 20, max_gen=0 < 8, mean_chemo=0.00 < 0.15)
gate-health 0/3 FAIL
exit=1
$ target/release/tidepool-headless gate-health --seeds 1 --ticks 12000 --param mut_rate=0 --param mut_weight_rate=0
seed=1 creatures=723 min_late=660 plants=2012 births_late=554 max_gen=7 mean_chemo=0.54 parked=0.00 first_bud=2135 FAIL(max_gen=7 < 8)
gate-health 0/1 FAIL
exit=1
```

The third proof does not crash, and the gene measures print with no mutation. It also fails, on
`max_gen` alone. `docs/findings/m1-tuning.md` says what that means for the tuned world.

Three more bad worlds, so that each side of each band has rejected something. Seed 1, 12,000 ticks.

```
$ target/release/tidepool-headless gate-health --seeds 1 --param fert_blobs=1 --param fert_radius=20
seed=1 creatures=0 min_late=0 plants=0 births_late=0 max_gen=0 mean_chemo=0.00 parked=0.00 first_bud=none FAIL(creatures=0 < 150, min_late=0 < 100, plants=0 < 300, births_late=0 < 20, max_gen=0 < 8, mean_chemo=0.00 < 0.15)
gate-health 0/1 FAIL
exit=1
$ target/release/tidepool-headless gate-health --seeds 1 --param basal=0.01 --param plant_cell_cap=16 --param fert_radius=600 --param plant_seed_chance=1 --param plant_growth=0.1
seed=1 creatures=0 min_late=0 plants=8192 births_late=0 max_gen=0 mean_chemo=0.00 parked=0.00 first_bud=none FAIL(creatures=0 < 150, min_late=0 < 100, plants=8192 > 7000, births_late=0 < 20, max_gen=0 < 8, mean_chemo=0.00 < 0.15)
gate-health 0/1 FAIL
exit=1
$ target/release/tidepool-headless gate-health --seeds 1 --param basal=0 --param part_upkeep=0 --param neuron_upkeep=0 --param conn_upkeep=0 --param move_cost=0 --param lifespan=24000 --param plant_growth=0.1 --param bite_fraction=0.01 --param bud_cooldown=0
seed=1 creatures=4096 min_late=4096 plants=2229 births_late=0 max_gen=2 mean_chemo=0.50 parked=0.52 first_bud=659 FAIL(creatures=4096 > 3000, births_late=0 < 20, max_gen=2 < 8, parked=0.52 > 0.25)
gate-health 0/1 FAIL
exit=1
```

What has rejected a world, and what has not:

- Rejected: `creatures` on both sides, `min_late`, `plants` on both sides, `births_late`, `max_gen`,
  and `parked`. `max_gen` also rejected worlds with living creatures: the third proof, the baseline on
  the old defaults, and tuning trial 2. `creatures` above 3,000 rejected a tuning trial on all 3 seeds.
- **`mean_chemo` has rejected an empty world**, where the mean of no creatures prints as 0, and no
  living world inside the protocol of the gate. "What the `mean_chemo` band can see" below has the
  readings.
- A usage error exits 2: an unknown parameter name, a value outside the range of its parameter, or a
  seed that is not a number.

### What the `mean_chemo` band can see

The band is the early warning for risk R1 of `design.md`: evolution strips a sense that costs upkeep
and does not pay. The M1 audit measured what the band does (`findings/m1-audit.md`, finding F3). The
readings below ran again after the audit and printed the same numbers.

- **It does not show that evolution keeps the sense.** With the sense switched off the gate passes 3
  of 3, and `mean_chemo` reads 0.47, 0.48, 0.49 at 12,000 ticks. A founder holds 0.5. A gene that does
  nothing drifts too slowly for 12,000 ticks to move its mean under 0.15.
- **It fired on a living world once, outside the protocol.** That world needed 36,000 ticks, 5 times
  the part upkeep, and faster mutation of the body genes. At 12,000 ticks the same world reads 0.29 and
  passes.
- **So a pass says only that the gene is not gone yet.** A gate that can see whether a sense pays is a
  question for the M2 plan. The gate, its bands, and its protocol did not change here.

```
$ target/release/tidepool-headless gate-health --param chemo_gain=0
seed=1 creatures=1251 min_late=739 plants=1952 births_late=1477 max_gen=11 mean_chemo=0.47 parked=0.00 first_bud=1581 PASS
seed=2 creatures=1048 min_late=679 plants=1818 births_late=1297 max_gen=12 mean_chemo=0.48 parked=0.00 first_bud=1553 PASS
seed=3 creatures=891 min_late=599 plants=1725 births_late=924 max_gen=10 mean_chemo=0.49 parked=0.00 first_bud=1592 PASS
gate-health 3/3 PASS
exit=0
$ target/release/tidepool-headless gate-health --seeds 1 --ticks 36000 --param chemo_gain=0 --param part_upkeep=0.001 --param mut_rate=0.5 --param mut_sigma=0.2
seed=1 creatures=1637 min_late=1486 plants=1812 births_late=3386 max_gen=29 mean_chemo=0.09 parked=0.00 first_bud=957 FAIL(mean_chemo=0.09 < 0.15)
gate-health 0/1 FAIL
exit=1
```

## Gate-evolve

`target/release/tidepool-headless gate-evolve [--seeds 1,2,3] [--ticks 36000] [--param name=value]...`
runs the default world three times for each seed, one run at a time: as given, with `chemo_gain=0`, and
with `eye_gain=0`. It prints one row per seed and exits 0 only when every seed is inside every band. A
usage error exits 2. Built by M2 Task 12 on 2026-10-11.

**It is in `make gates` and in CI, after `gate-health`, on all three seeds.** M2 Task 13 wired it in on
2026-10-11. One run takes 30 to 32 seconds on the reference machine, and CI runs at about half that
speed, so the three seeds stay.

**`--m2` is deleted.** Task 13 wrote the Start values of the plan's parameter table into `params.rs`.
A command below that reads `--m2` was run before that. The same command without the flag now runs
the same world: `gate-health` and `gate-evolve` print at the new defaults what they printed with
`--m2` at the old ones, digit for digit (`findings/m2-tuning.md`, "Part 1").

**`make gates` fails at its last step at the tuned defaults, and so would CI.** Task 13 closed on
2026-10-11 with both benches and `gate-health` passing and `gate-evolve` at 2 of 3: the scent gap of
seed 1 reads 0.079 against 0.10. On seeds 1 to 10 the scent gap passes on 5 and every other band
passes on 10. No number was found that makes the scent sense pay in the world that the grazing rule
makes. No band, floor, or reference population was changed (`findings/m2-tuning.md`, "What needs a
rule or a decision").

| Measure | Meaning | Band |
|---|---|---|
| `creatures` | Alive at the end of the first run | 150 or more: the low end of the same band of the health gate |
| `creatures_noscent` | Alive at the end of the run with `chemo_gain=0` | 150 or more, or the seed fails with `chemo_blind run died` |
| `creatures_noeye` | Alive at the end of the run with `eye_gain=0` | 150 or more, or the seed fails with `eye_blind run died` |
| `len` | Mean length gene of the living | 7.8 to 22.2: a tenth of the range in from each wall |
| `len_sd` | Standard deviation of the length gene | 0.5 or more |
| `parts` | Mean part genes per creature | 3.0 or more. A body needs 2 to live |
| `chemo` less `chemo_blind` | Mean chemoreceptor sum, less the same in the run with `chemo_gain=0` | 0.10 or more. **The plan said 0.02** |
| `eye` less `eye_blind` | Mean eye sum, less the same in the run with `eye_gain=0` | 0.10 or more. **The plan said 0.02** |
| `plans` | Body plans held by 5% or more of the living. A plan is the sorted list of part kinds | Reported, no band |
| `speed_cv` | Standard deviation over mean of the top speed of adults, by rule S3 of the plan | Reported, no band |

**`chemo_gain=0` takes away only the direction of the scent.** It scales the two gradient inputs. The
level input (`IN_SCENT`) still reads through the chemoreceptor. So that run is blind to direction
only, and the scent gap shows what the direction is worth to evolution. `eye_gain=0` takes away all
four eye inputs.

**A gap is void when its blind run died.** The mean of no creatures prints as 0, so a dead blind run
would hand its sense a large gap. A blind run that ends under 150 creatures fails the seed. 150 is the
low end of the `creatures` band of the health gate.

### What kind of claim each band makes

`AGENTS.md` names three kinds: the mechanism fires, evolution uses it, and it helps.

- **Every band of this gate is of the kind "evolution uses it".** `len` and `len_sd`: evolution has not
  run the length gene to a wall, and bodies still differ in length. `parts`: the part count has not
  fallen to the least that a body needs. The two gaps: evolution keeps a sense more where it works
  than where it is blind.
- **No band shows that a rule helps the world.** A sense can pass its gap and thin the world. The first
  reading below is such a case.
- **No band shows that a mechanism fires.** The tests of `crates/sim` do that.

### The proofs

A bad input fails a band when at least one seed prints that band in its `FAIL`. The table says how
many seeds did. Every input but one follows `gate-evolve --m2`. A run is 9 runs of 36,000 ticks and
took 33 to 39 seconds at a load average of 18 to 22.

| Band | Bad input | Reading on seeds 1, 2, 3 | Seeds that failed the band |
|---|---|---|---|
| `creatures` | `fert_radius=40`: too little fertile ground | 0, 12, 2 | 3 of 3 |
| `len` | `upkeep_curve=0 intake_curve=0 motor_curve=0 push_mass=0`: the M1 size rules | 6.44, 6.03, 6.11 | 3 of 3 |
| `len_sd` | The same run | 0.78, 0.17, 0.46 | 2 of 3 |
| `len_sd` | The same, and `mut_rate=0`: no body gene can change | 0.55, 0.43, 0.27 | 2 of 3 |
| `parts` | `mut_part_add=0 mut_part_dup=0 mut_part_remove=0.3 scent_deposit=0 eye_range=0`: parts can only be lost and no sense works | 2.15, 2.03, 2.06 | 3 of 3 |
| Scent gap | `scent_deposit=0`: no scent in either run | 0.000, 0.000, 0.000 | 3 of 3 |
| Eye gap | `eye_range=0`: no eye sees in either run | 0.000, 0.000, 0.000 | 3 of 3 |
| Both gaps | `chemo_gain=0.0001 eye_gain=0.0001`: both senses read almost nothing in every run | Scent: 0.008, 0.073, -0.069. Eye: -0.046, -0.041, -0.095 | 3 of 3 for each. At the plan's 0.02, seed 2 passed the scent band |
| `chemo_blind run died` | `gate-evolve --ticks 12000 --param fert_blobs=3`, with no `--m2` | `creatures_noscent` 128, 150, 164, against 258, 195, 220 in the seeing run | 1 of 3 |
| `eye_blind run died` | `fert_radius=40` | `creatures_noeye` 22, 41, 24 | 3 of 3, but every run of that world died |

No proof of a band on genes failed because a mean was taken over no bodies. The thinnest of those
worlds is the M1 size rules, with 57 to 112 creatures. Its means are means of bodies, but it is under
the `creatures` floor on every seed. `len` and `len_sd` have also rejected worlds over the floor:
`len` in the eye proof (927 and 958 creatures) and in the first reading, and `len_sd` in the run with
`mut_rate=0` (305 and 334 creatures).

`creatures`, and `eye_blind run died`, on a world with too little fertile ground for any run. Seed 2
holds 12 creatures and passes `len`, `len_sd`, and `parts`, so only the floor says that its seeing
run died out. The health gate reads at tick 12,000, and a world that dies after that would pass it:

```
$ target/release/tidepool-headless gate-evolve --m2 --param fert_radius=40
seed=1 creatures=0 creatures_noscent=0 creatures_noeye=22 len=0.0 len_sd=0.00 parts=0.0 chemo=0.00 chemo_blind=0.00 eye=0.00 eye_blind=0.17 plans=0 speed_cv=0.00 FAIL(creatures=0 < 150, len=0.00 < 7.8, len_sd=0.00 < 0.5, parts=0.00 < 3, chemo_gap=0.000 < 0.1, chemo_blind run died, eye_gap=-0.170 < 0.1, eye_blind run died)
seed=2 creatures=12 creatures_noscent=0 creatures_noeye=41 len=9.9 len_sd=1.18 parts=5.0 chemo=0.77 chemo_blind=0.00 eye=0.20 eye_blind=0.11 plans=1 speed_cv=0.01 FAIL(creatures=12 < 150, chemo_blind run died, eye_gap=0.085 < 0.1, eye_blind run died)
seed=3 creatures=2 creatures_noscent=18 creatures_noeye=24 len=11.3 len_sd=0.00 parts=5.0 chemo=0.60 chemo_blind=0.55 eye=0.25 eye_blind=0.19 plans=1 speed_cv=0.00 FAIL(creatures=2 < 150, len_sd=0.00 < 0.5, chemo_gap=0.047 < 0.1, chemo_blind run died, eye_gap=0.058 < 0.1, eye_blind run died)
gate-evolve 0/3 FAIL
exit=1
```

`len`, and `len_sd` in the same run:

```
$ target/release/tidepool-headless gate-evolve --m2 --param upkeep_curve=0 --param intake_curve=0 --param motor_curve=0 --param push_mass=0
seed=1 creatures=57 creatures_noscent=169 creatures_noeye=1113 len=6.4 len_sd=0.78 parts=5.2 chemo=0.28 chemo_blind=0.41 eye=0.36 eye_blind=0.08 plans=2 speed_cv=0.08 FAIL(creatures=57 < 150, len=6.44 < 7.8, chemo_gap=-0.124 < 0.1)
seed=2 creatures=112 creatures_noscent=236 creatures_noeye=673 len=6.0 len_sd=0.17 parts=5.9 chemo=0.59 chemo_blind=0.24 eye=0.35 eye_blind=0.08 plans=4 speed_cv=0.11 FAIL(creatures=112 < 150, len=6.03 < 7.8, len_sd=0.17 < 0.5)
seed=3 creatures=98 creatures_noscent=114 creatures_noeye=864 len=6.1 len_sd=0.46 parts=5.0 chemo=0.45 chemo_blind=0.44 eye=0.30 eye_blind=0.18 plans=1 speed_cv=0.20 FAIL(creatures=98 < 150, len=6.11 < 7.8, len_sd=0.46 < 0.5, chemo_gap=0.013 < 0.1, chemo_blind run died)
gate-evolve 0/3 FAIL
exit=1
```

`len_sd` with no mutation of a body gene. The plan asks for this run only if the first one fails `len`
and not `len_sd`. It ran anyway, because seed 1 passed `len_sd` above:

```
$ target/release/tidepool-headless gate-evolve --m2 --param upkeep_curve=0 --param intake_curve=0 --param motor_curve=0 --param push_mass=0 --param mut_rate=0
seed=1 creatures=325 creatures_noscent=337 creatures_noeye=699 len=10.1 len_sd=0.55 parts=5.7 chemo=0.50 chemo_blind=0.14 eye=0.20 eye_blind=0.07 plans=3 speed_cv=0.22 PASS
seed=2 creatures=305 creatures_noscent=340 creatures_noeye=627 len=10.6 len_sd=0.43 parts=5.3 chemo=0.48 chemo_blind=0.41 eye=0.23 eye_blind=0.14 plans=2 speed_cv=0.16 FAIL(len_sd=0.43 < 0.5, chemo_gap=0.063 < 0.1, eye_gap=0.088 < 0.1)
seed=3 creatures=334 creatures_noscent=307 creatures_noeye=610 len=10.2 len_sd=0.27 parts=5.4 chemo=0.49 chemo_blind=0.41 eye=0.21 eye_blind=0.12 plans=3 speed_cv=0.17 FAIL(len_sd=0.27 < 0.5, chemo_gap=0.084 < 0.1, eye_gap=0.084 < 0.1)
gate-evolve 1/3 FAIL
exit=1
```

`parts`, on a world where the count does fall to the least that a body can live with:

```
$ target/release/tidepool-headless gate-evolve --m2 --param mut_part_add=0 --param mut_part_dup=0 --param mut_part_remove=0.3 --param scent_deposit=0 --param eye_range=0
seed=1 creatures=768 creatures_noscent=768 creatures_noeye=768 len=11.2 len_sd=1.55 parts=2.2 chemo=0.00 chemo_blind=0.00 eye=0.01 eye_blind=0.01 plans=4 speed_cv=0.19 FAIL(parts=2.15 < 3, chemo_gap=0.000 < 0.1, eye_gap=0.000 < 0.1)
seed=2 creatures=719 creatures_noscent=719 creatures_noeye=719 len=10.7 len_sd=1.53 parts=2.0 chemo=0.00 chemo_blind=0.00 eye=0.01 eye_blind=0.01 plans=3 speed_cv=0.24 FAIL(parts=2.03 < 3, chemo_gap=0.000 < 0.1, eye_gap=0.000 < 0.1)
seed=3 creatures=560 creatures_noscent=560 creatures_noeye=560 len=11.5 len_sd=1.62 parts=2.1 chemo=0.00 chemo_blind=0.00 eye=0.00 eye_blind=0.00 plans=3 speed_cv=0.23 FAIL(parts=2.06 < 3, chemo_gap=0.000 < 0.1, eye_gap=0.000 < 0.1)
gate-evolve 0/3 FAIL
exit=1
```

The scent gap:

```
$ target/release/tidepool-headless gate-evolve --m2 --param scent_deposit=0
seed=1 creatures=301 creatures_noscent=301 creatures_noeye=659 len=7.8 len_sd=1.19 parts=6.3 chemo=0.25 chemo_blind=0.25 eye=0.44 eye_blind=0.14 plans=5 speed_cv=0.22 FAIL(chemo_gap=0.000 < 0.1)
seed=2 creatures=447 creatures_noscent=447 creatures_noeye=665 len=7.9 len_sd=1.85 parts=5.5 chemo=0.26 chemo_blind=0.26 eye=0.40 eye_blind=0.09 plans=3 speed_cv=0.23 FAIL(chemo_gap=0.000 < 0.1)
seed=3 creatures=288 creatures_noscent=288 creatures_noeye=590 len=7.9 len_sd=2.40 parts=5.3 chemo=0.20 chemo_blind=0.20 eye=0.47 eye_blind=0.10 plans=5 speed_cv=0.20 FAIL(chemo_gap=0.000 < 0.1)
gate-evolve 0/3 FAIL
exit=1
```

The eye gap:

```
$ target/release/tidepool-headless gate-evolve --m2 --param eye_range=0
seed=1 creatures=927 creatures_noscent=767 creatures_noeye=927 len=7.0 len_sd=1.14 parts=7.4 chemo=0.80 chemo_blind=0.11 eye=0.16 eye_blind=0.16 plans=6 speed_cv=0.20 FAIL(len=7.00 < 7.8, eye_gap=0.000 < 0.1)
seed=2 creatures=800 creatures_noscent=565 creatures_noeye=800 len=8.7 len_sd=1.71 parts=5.6 chemo=0.47 chemo_blind=0.22 eye=0.10 eye_blind=0.10 plans=2 speed_cv=0.15 FAIL(eye_gap=0.000 < 0.1)
seed=3 creatures=958 creatures_noscent=633 creatures_noeye=958 len=7.1 len_sd=1.91 parts=6.6 chemo=0.61 chemo_blind=0.21 eye=0.12 eye_blind=0.12 plans=4 speed_cv=0.19 FAIL(len=7.09 < 7.8, eye_gap=0.000 < 0.1)
gate-evolve 0/3 FAIL
exit=1
```

Both gaps, on senses that read almost nothing. This input is not in the plan. "The gap bands are 0.10"
below says why it ran:

```
$ target/release/tidepool-headless gate-evolve --m2 --param chemo_gain=0.0001 --param eye_gain=0.0001
seed=1 creatures=774 creatures_noscent=810 creatures_noeye=741 len=10.5 len_sd=2.48 parts=5.2 chemo=0.28 chemo_blind=0.27 eye=0.08 eye_blind=0.12 plans=5 speed_cv=0.17 FAIL(chemo_gap=0.008 < 0.1, eye_gap=-0.046 < 0.1)
seed=2 creatures=602 creatures_noscent=722 creatures_noeye=653 len=10.3 len_sd=1.93 parts=5.3 chemo=0.26 chemo_blind=0.19 eye=0.13 eye_blind=0.17 plans=4 speed_cv=0.22 FAIL(chemo_gap=0.073 < 0.1, eye_gap=-0.041 < 0.1)
seed=3 creatures=602 creatures_noscent=648 creatures_noeye=569 len=11.4 len_sd=1.60 parts=4.4 chemo=0.16 chemo_blind=0.23 eye=0.14 eye_blind=0.23 plans=5 speed_cv=0.19 FAIL(chemo_gap=-0.069 < 0.1, eye_gap=-0.095 < 0.1)
gate-evolve 0/3 FAIL
exit=1
```

`chemo_blind run died`, on a poor world at the default rules, read at 12,000 ticks. On seed 1 the
seeing run holds 258 creatures and the run with no direction holds 128. No founder has an eye here, so
the run with `eye_gain=0` is the seeing run:

```
$ target/release/tidepool-headless gate-evolve --ticks 12000 --param fert_blobs=3
seed=1 creatures=258 creatures_noscent=128 creatures_noeye=258 len=7.1 len_sd=1.76 parts=4.0 chemo=0.55 chemo_blind=0.51 eye=0.00 eye_blind=0.00 plans=1 speed_cv=0.19 FAIL(len=7.05 < 7.8, chemo_gap=0.036 < 0.1, chemo_blind run died, eye_gap=0.000 < 0.1)
seed=2 creatures=195 creatures_noscent=150 creatures_noeye=195 len=7.2 len_sd=1.12 parts=4.0 chemo=0.54 chemo_blind=0.48 eye=0.00 eye_blind=0.00 plans=1 speed_cv=0.21 FAIL(len=7.20 < 7.8, chemo_gap=0.058 < 0.1, eye_gap=0.000 < 0.1)
seed=3 creatures=220 creatures_noscent=164 creatures_noeye=220 len=7.2 len_sd=1.13 parts=4.0 chemo=0.53 chemo_blind=0.50 eye=0.00 eye_blind=0.00 plans=1 speed_cv=0.17 FAIL(len=7.23 < 7.8, chemo_gap=0.029 < 0.1, eye_gap=0.000 < 0.1)
gate-evolve 0/3 FAIL
exit=1
```

`eye_blind run died` is in the `creatures` proof above.

### What the proofs show, and what they do not

**`creatures` has rejected a world that died out, on 3 of 3 seeds.** It has not rejected a world that
passes the health gate at tick 12,000 and dies after it: no such world was looked for.

**`len` has rejected a world of bodies on 3 of 3 seeds.** Under the M1 size rules the mean length runs
to 6.0 to 6.4. The gene's floor is 6. That world also fails the `creatures` floor.

**`len_sd` has rejected 2 of 3 seeds of each bad input, and seed 1 passed it both times.** It read 0.78
with the gene at its floor, in a world of 57 creatures. It read 0.55 in a world where no body gene can
change, and that seed passed every band. There the spread is what is left of the founders': a founder
draws its length with a spread of 0.9. So the band cannot tell a spread that evolution holds from a
spread that has not yet drained. With `--seeds 1` this band would have rejected neither world. To
reject seed 1 of both, the band must be above 0.78. The band did not change: each bad input failed it
on 2 seeds.

**`parts` is 3.0, as the plan said, and its proof is not the plan's.** The band is for a fall to the
least that a body needs.

- The proof is the harder input of the table. With no sense that works and parts that can only be
  lost, the count falls to 2.03 to 2.15 in a world of 560 to 768 creatures. The band rejects it on 3
  of 3 seeds.
- **The plan's input was not bad enough.** It lets a birth lose a part with a chance of 0.3 and never
  gain one, in a world that can still smell and see. It kept 4.6 to 4.8 parts of the founder's 5 and
  passed the band on 3 of 3 seeds:

```
$ target/release/tidepool-headless gate-evolve --m2 --param mut_part_add=0 --param mut_part_dup=0 --param mut_part_remove=0.3
seed=1 creatures=433 creatures_noscent=494 creatures_noeye=685 len=7.5 len_sd=1.15 parts=4.6 chemo=0.32 chemo_blind=0.00 eye=0.36 eye_blind=0.00 plans=2 speed_cv=0.25 FAIL(len=7.50 < 7.8)
seed=2 creatures=428 creatures_noscent=380 creatures_noeye=672 len=8.1 len_sd=1.27 parts=4.7 chemo=0.33 chemo_blind=0.00 eye=0.31 eye_blind=0.01 plans=3 speed_cv=0.25 PASS
seed=3 creatures=444 creatures_noscent=377 creatures_noeye=668 len=9.2 len_sd=1.81 parts=4.8 chemo=0.39 chemo_blind=0.00 eye=0.30 eye_blind=0.01 plans=2 speed_cv=0.22 PASS
gate-evolve 2/3 FAIL
exit=1
```

- **What that run shows: selection holds the parts that pay against removal.** Where a sense reads, its
  parts stay at 0.30 to 0.39. In the blind run of that sense, which lives with 377 to 685 creatures,
  they fall to 0.00 or 0.01. The kind of claim is "evolution uses it", on 3 seeds, one run each.
- So the band does not reject a world that only loses parts. It rejects a world whose part count fell
  to the minimum.

**The gap bands are 0.10, not the 0.02 of the plan.** This is the one band value that Task 12 changed.

- In both proofs of the plan the two runs are the same world to the bit: `creatures_noscent` equals
  `creatures` in the scent proof, and `creatures_noeye` equals it in the eye proof. With no scent, or
  with eyes of no range, the input of the sense is 0 at every gain. So each gap is exactly 0.000.
  These proofs show that a gap band can fail. They do not show what chance does to a gap.
- The chance input measures that. Each sense reads at most a ten-thousandth of its input, so no brain
  can use it, and its three runs are three different worlds. The scent gap read 0.008, 0.073, and
  -0.069. The eye gap read -0.046, -0.041, and -0.095.
- **At 0.02 that bad input passed the scent band on seed 2**, with a sense that does nothing. So 0.02
  was inside the noise.
- The largest of the 6 chance gaps is 0.073. The band is the next 0.05 above it: 0.10. The number
  comes from the chance input alone. At 0.10 the input fails both gap bands on 3 of 3 seeds.
- What 0.10 does not cover: 6 gaps are a small sample, and the largest gap below zero is -0.095. A
  chance gap of that size above zero would fail by 0.005. What still protects the gate is that all 3
  seeds must pass. With `--seeds 1` it has less protection.

**`chemo_blind run died` has rejected one seed of a living world. `eye_blind run died` has rejected
only a world where every run died.**

- In the poor world at the default rules, seed 1 holds 258 creatures with the sense and 128 without
  its direction. The check fired on that seed alone. Seed 2 sits on the line at 150.
- No input was found that kills only the run with `eye_gain=0`. Five worlds were tried on seed 1.
  In every world where eyes see, that run holds more creatures than the seeing run. So `eye_blind run
  died` fired only where all three runs died.
- Seed 2 of the `fert_radius=40` world shows what the check is for. The run with no direction is empty, so
  `chemo_blind` prints 0.00 and the scent gap reads 0.77 and passes its band. The seed fails on
  `chemo_blind run died`.

`plans` and `speed_cv` have no band and have rejected nothing.

### The first reading of the M2 rules, not a trial

One run, on the Start values of the plan. No hypothesis was written before it and nothing was tuned.
The gap band of 0.10 comes from the chance input and not from this reading. An earlier build had
already printed this reading when the band changed.

```
$ target/release/tidepool-headless gate-evolve --m2
seed=1 creatures=475 creatures_noscent=340 creatures_noeye=927 len=7.9 len_sd=1.57 parts=5.2 chemo=0.50 chemo_blind=0.13 eye=0.34 eye_blind=0.16 plans=2 speed_cv=0.20 PASS
seed=2 creatures=299 creatures_noscent=417 creatures_noeye=800 len=6.3 len_sd=0.66 parts=6.0 chemo=0.53 chemo_blind=0.36 eye=0.38 eye_blind=0.10 plans=2 speed_cv=0.20 FAIL(len=6.28 < 7.8)
seed=3 creatures=296 creatures_noscent=322 creatures_noeye=958 len=6.8 len_sd=0.89 parts=6.1 chemo=0.55 chemo_blind=0.29 eye=0.40 eye_blind=0.12 plans=4 speed_cv=0.14 FAIL(len=6.81 < 7.8)
gate-evolve 1/3 FAIL
exit=1
```

It took 32 and 36 seconds at a load average of 7 to 8 from other projects, and 38 seconds at 21. A
world that holds more creatures takes longer.

What it says, by kind of claim:

- **Evolution does not yet hold body size off the floor.** `len` fails on seeds 2 and 3 at 6.28 and
  6.81, and seed 1 passes at 7.9 against 7.8. Under the M1 size rules the same seeds read 6.03 to
  6.44. Task 13 owns this.
- **Evolution uses both senses, in this reading.** The scent gap is 0.37, 0.17, and 0.26. The eye gap
  is 0.18, 0.28, and 0.28. All 6 pass the band of 0.10.
- **Sight does not help the world. It thins it.** The seeing world holds 475, 299, and 296 creatures
  at tick 36,000. With `eye_gain=0` the same founders hold 927, 800, and 958. One run per seed.
  `findings/m2-eyes.md` found the same at tick 12,000.
- **The direction of the scent: no clear reading for the world.** With `chemo_gain=0` the same seeds
  hold 340, 417, and 322 creatures, against 475, 299, and 296.
- `parts` reads 5.2, 6.0, and 6.1 against 3.0.

## Probes

Built by M2 Task 12. Each runs the default world and prints what it reads. None has a band, and none
has rejected anything. The rows below are seed 1 with `--m2`: the Start values of the M2 plan, not
tuned. Those values are the defaults since Task 13, and the flag is deleted.

**`probe-plants [--seed n] [--ticks 36000] [--param ...]`.** One row every 4,000 ticks: plants alive,
plant deaths and seedlings since the last row, 32-unit cells that hold a plant, the mean of
`reserve / cap`, and creatures alive. The first and the last row of 9:

```
$ target/release/tidepool-headless probe-plants --m2 --seed 1
seed=1 tick=4000 plants=1665 plant_deaths=1571 seedlings=2036 cells=666 reserve01=0.66 creatures=406
seed=1 tick=36000 plants=1030 plant_deaths=2100 seedlings=2086 cells=504 reserve01=0.62 creatures=475
```

At the defaults the probe reads 732 cells at tick 4,000 and 508 at tick 36,000 on seed 1. The scratch
census of the M1 audit read 727 and 480 on the M1 world (`findings/m1-audit.md`, finding F2). The
default world has changed since then: every brain holds four neurons more.

**`probe-heirs [--seed n] [--pick 3000] [--param ...]`.** It runs to the pick tick, takes every creature
alive then, and follows the world to the death of each. It counts heirs as `write_heirs` would after a
possession at the pick tick with the brain left to drive: the living descendants through living
parents get the mark at the pick, and each later child gets the mark of its parent. A test holds the
count to `World::possess` and `World::write_heirs` on about 10 picks, and it failed when the probe was
made to skip the living descendants.

```
$ target/release/tidepool-headless probe-heirs --m2 --seed 1
seed=1 pick=3000 group=all picks=429 heir=0.41 median_ticks=1536
seed=1 pick=3000 group=adults picks=147 heir=0.69 median_ticks=1165
seed=1 pick=3000 group=juveniles picks=282 heir=0.26 median_ticks=1916
$ target/release/tidepool-headless probe-heirs --pick 3000 --seed 1
seed=1 pick=3000 group=all picks=590 heir=0.37 median_ticks=1474
seed=1 pick=3000 group=adults picks=274 heir=0.62 median_ticks=1395
seed=1 pick=3000 group=juveniles picks=316 heir=0.16 median_ticks=1651
```

The second command is the default world. The M1 audit read 0.37 for adults at pick tick 3,000 on seed
1, 0.26 for all picks, and 0.17 for juveniles (finding F5). **Adults now read 0.62 against 0.37.** The
probe counts the children that were alive at the pick, and the audit did not: possessing a body
now marks them (decision 2). A juvenile has no child at the pick, so the two counts agree for it: 0.16
against 0.17. The world also differs from the audit's by four neurons per brain. This is the brain's
result, not a player's. The claim is "the mechanism fires": the mark now reaches the living
descendants.

**`probe-crowd [--seed n] [--param ...]`.** At tick 3,000 it possesses the adult with the most bodies
within 30 units, holds full thrust for 200 ticks, and prints its mean speed over the top speed of the
same body alone, by rule S3.

```
$ target/release/tidepool-headless probe-crowd --m2 --seed 1
seed=1 tick=3000 uid=256 neighbours=10 held=200 mean_speed=1.35 top_speed=1.40 ratio=0.97
```

**`probe-plans [--seed n] [--ticks 36000] [--param ...]`.** The 8 most common plans with their share,
and the means over the bodies that hold each: the length gene, the top speed, the turn rate in radians
per tick at full thrust and top speed, and the summed angle of the eye cones in radians. The first
line and the first 2 plans of 13:

```
$ target/release/tidepool-headless probe-plans --m2 --seed 1
seed=1 tick=36000 creatures=475 plans=13
seed=1 plan=flagellum+cilia+filter+chemo+eye share=0.72 len=7.9 top_speed=1.21 turn_rate=0.177 eye_angle=2.86
seed=1 plan=flagellum+cilia+2filter+chemo+eye share=0.19 len=7.8 top_speed=1.26 turn_rate=0.172 eye_angle=2.38
```

**`probe-census [--seeds 1,2,3] [--ticks 36000] [--every 12000] [--param ...]`.** Added on 2026-10-12
for findings M3 and M4 of the M2 audit: the tuning record read these numbers from a scratch census
that was not in the repo. It runs the default world of each seed, which is the world that
`gate-evolve` runs as given, and prints one row for each seed at each multiple of `--every`.
`--every` is from 1 to `--ticks`. The run stops at the last multiple. It has no band and it has
rejected nothing. The rows below are the tuned defaults, not the Start values of the other probes
of this section.

| Column | What it is |
|---|---|
| `seed`, `tick` | The seed, and the tick of the row |
| `creatures`, `plants` | Alive at the row |
| `juv` | The share of the creatures that are not full-grown: `growth` under 1 |
| `len`, `wid`, `egg`, `old` | The mean of each gene |
| `area` | The mean adult area, `len * len * wid`. It is a mean of products, not the product of the means |
| `flagellum`, `cilia`, `filter`, `chemo`, `fin`, `eye` | The mean part sum of the kind: the sizes of a body's parts of that kind, added up (`Genome::size_of`) |
| `parts` | The mean count of part genes |
| `senseless` | The share of the creatures with no chemoreceptor part and no eye part. A part of size 0 is still a part |
| `speed`, `turn` | The mean top speed in units per tick and the mean turn rate in radians per tick. Both are the formulas of `probe-plans` (`evolve::top_speed`, `evolve::turn_rate`): the full-grown body, alone, at full thrust. A juvenile counts with its adult body |
| `eaten` | The energy that all creatures ate per tick, as a mean over the ticks since the row before, or since tick 0 for the first row. It depends on `--every` |
| `reserve01` | The mean of `reserve / cap` over the plants, as in `probe-plants` |

Every mean but `reserve01` is over the living creatures. A mean over nobody prints as `NaN`, not as 0.
`creatures`, `len`, `parts`, `chemo`, and `eye` are the numbers that `gate-evolve` prints for its
seeing run at the same tick, and `creatures`, `plants`, and `chemo` at tick 12,000 are those of
`gate-health`. Three tests in `crates/headless/src/probes.rs` hold the columns to their fields. Two
failed when the probe was broken: with `senseless` made to read the eye alone, and with each part
column made to read the next kind.

```
$ target/release/tidepool-headless probe-census --seeds 1 --ticks 36000
seed=1 tick=12000 creatures=1321 plants=2229 juv=0.36 len=12.0 wid=0.50 egg=0.68 old=4545 area=72.8 flagellum=0.55 cilia=0.40 filter=0.66 chemo=0.38 fin=0.00 eye=0.20 parts=5.1 senseless=0.00 speed=1.22 turn=0.106 eaten=185.70 reserve01=0.46
seed=1 tick=24000 creatures=1410 plants=2229 juv=0.36 len=12.0 wid=0.50 egg=0.67 old=4145 area=72.7 flagellum=0.50 cilia=0.34 filter=0.73 chemo=0.26 fin=0.00 eye=0.20 parts=5.1 senseless=0.00 speed=1.16 turn=0.100 eaten=191.95 reserve01=0.41
seed=1 tick=36000 creatures=1470 plants=2229 juv=0.38 len=11.8 wid=0.52 egg=0.66 old=3650 area=72.4 flagellum=0.46 cilia=0.36 filter=0.74 chemo=0.14 fin=0.00 eye=0.22 parts=5.2 senseless=0.01 speed=1.11 turn=0.104 eaten=191.80 reserve01=0.36
```

**`run --out <path>`** writes `World::save()` to the path after the run.

## In-page bench, reference machine

`http://localhost:<port>/?bench` on the dev server, tab in the foreground. The worker makes a second
default world on seed 1, runs 12,000 ticks to settle it, and then times 2,000 ticks. This is the world
that the throughput benches time. The main world waits, and the page shows "Measuring. This can take a
minute on a slow device." The result names the alive count at the end of the timed ticks. Below 1,200
creatures the same line says that the reading is too fast. Add a row when a task changes the cost of a
tick.

| Date | After task | Browser | World | Ticks per second | 24,000-tick skip |
|---|---|---|---|---|---|
| 2026-10-10 | 8 (M0) | Chrome, Apple M4 Pro | 1,500 drifters, no plants, no brains | 17,197 | 1.4 s |
| 2026-10-10 | 16, bench on the settled world | Chrome, Apple M4 Pro | The default world after 12,000 ticks, 1,537 creatures | 3,961 | 6.1 s |
| 2026-10-11 | 20 (M1 exit), owner's reading | The owner's MacBook, dev server. Browser and model not stated | The default world after 12,000 ticks, 1,537 creatures | 4,157 | 5.8 s |

The owner's row reads like the reference machine (3,961 and 4,004 there), so it is not the mid-range
laptop reading that `architecture.md` §13 still lacks. No phone reading exists yet.

The M0 row: four more loads on the same day read 16,207 to 17,212. The same module in Node read about
16,300 for 2,000 ticks, so the browser cost nothing over Node there.

The settled-world row: a second load read 4,004 ticks per second and 6.0 s. The WASM bench in Node read
3,757 on the same world, so the page is not slower than Node. The skip budget is 10 s on this machine.
