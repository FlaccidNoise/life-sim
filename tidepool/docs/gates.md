# Gates

A gate counts only after it has rejected a known-bad input. Each row records the bad input and the
output seen. All proofs ran on 2026-10-10, except the CI row, which has passed once and has no failure proof yet.

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
| CI | `.github/workflows/tidepool.yml` runs `make check`, `bench --floor 800`, `scripts/bench-wasm.mjs --floor 800`, and `gate-health` | **Not proven yet.** The workflow passed its first run, on the side branch `tidepool-ci`. No bad commit has been pushed to see it fail. M2 Task 1 does that. | First run, 2026-10-11, x86-64 runner, 1 minute 54 seconds: every step passed. Native 2,360 and WASM 1,882 ticks per second at 1,539 creatures. The three health rows equal the reference machine's rows digit for digit. | 2026-10-11, pass only |

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
- **CI.** The workflow has passed once and has rejected nothing, so it is not a proven gate yet. The
  first run was on 2026-10-11 on the side branch `tidepool-ci` (run 38177642801). It answered the four
  open points of the M1 audit: `pnpm/action-setup@v4` installs the pinned pnpm, pnpm 11 runs on Node 22,
  the runner clears the floor of 800 (WASM 1,882, native 2,360, about half of the reference machine),
  and the native build on x86-64 gives the hashes of the `.wasm` (`tests/determinism.test.ts` passed,
  and the health rows match the aarch64 rows to the digit). Still to do: push a deliberately bad commit
  to a side branch and see the run fail. `make gates` enforces the real floor of 2,400 on the
  reference machine.
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

`first_bud` leaves founders out. A founder starts as an adult at a random age, so its age at its first
bud is not the length of a generation.

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
