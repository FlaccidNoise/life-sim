# Gates

A gate counts only after it has rejected a known-bad input. Each row records the bad input and the
output seen. The fast gates were proven on 2026-10-10 and the CI row on 2026-10-11. The snapshot row
and every proof of the throughput, health, and evolution gates ran again on 2026-10-12, at the
defaults of that day: no part upkeep, and `plant_growth` 0.03.

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
| Snapshot round trip | `cargo test --test snapshot` | The `vy` line removed from both `Creatures::save` and `Creatures::load` in `crates/sim/src/creature.rs` | 19 of 32 tests fail, exit 101. The round-trip test is `load_then_run_equals_unbroken_run ... FAILED`, with ``assertion `left == right` failed``, `left: 45388520`, `right: 2115269488`. The other 18 are in the notes. | 2026-10-12 |
| Native equals WASM | `pnpm exec vitest run tests/determinism.test.ts` | `#[cfg(target_arch = "wasm32")] { self.creatures.vx[0] += 1.0e-6; }` added to `World::tick`, just before `self.tick` is incremented at the end, then `make wasm` | All 3 seeds fail. Seed 1: `AssertionError: expected 1261540159 to be 3031850156 // Object.is equality` | 2026-10-10 |
| Throughput, native | `make gates` (runs `target/release/tidepool-headless bench`) | `bench --floor 1000000000`, and `bench --reference 5000` | `bench creatures=1320 median_tps=3309 floor=1000000000 FAIL`, exit 1. `VOID: population fell`, exit 1. The full output is in "Throughput bench" below. | 2026-10-12 |
| Throughput, WASM in Node | `make gates` (runs `node scripts/bench-wasm.mjs`) | `node scripts/bench-wasm.mjs --floor 1000000000`, and `--reference 5000` | `bench-wasm creatures=1320 median_tps=3131 floor=1000000000 FAIL`, exit 1. `VOID: population fell`, exit 1. The full output is in "Throughput bench" below. | 2026-10-12 |
| Health | `make gates` (runs `target/release/tidepool-headless gate-health`) | `gate-health --param plant_growth=0`, and `gate-health --param basal=0.01` | Both: every seed `FAIL`, `gate-health 0/3 FAIL`, exit 1. The full output is in "Health gate" below. | 2026-10-12 |
| CI | `.github/workflows/tidepool.yml` runs `make check`, `bench --floor 800`, `scripts/bench-wasm.mjs --floor 800`, `gate-health`, and `gate-evolve` | Two commits on a throwaway branch `ci-proof`: `pub fn bad(x: f32) -> f32 { x.sin() }` added to `crates/sim/src/lib.rs`, and then, with that reverted, `--floor 1000000000` on the `bench-wasm.mjs` step of the workflow | Run 38179267371 failed at `make check`: ``error: use of a disallowed method `f32::sin` ``. Run 38179352131 failed at the WASM bench step: `bench-wasm creatures=1539 median_tps=1801 floor=1000000000 FAIL`, and the health gate step was skipped | 2026-10-11 |
| Evolution | `target/release/tidepool-headless gate-evolve`. In `make gates` and in CI since Task 13 of the M2 plan | One world for each band: five Start values that let a small body win (`len`), no mutation of a body gene (`len_sd`), parts that can only be lost in a world where no sense works (`parts`), `scent_deposit=0` (scent gap), `eye_range=0` (eye gap), senses that read almost nothing (both gaps, against chance), `fert_radius=25` (`creatures`), `fert_radius=40` (`chemo_blind run died`), and `fert_radius=50 scent_deposit=0` (`eye_blind run died`) | Each run exits 1. The named band is among the failures of every seed, or of 1 seed of 3 for the two blind-run checks and for `len_sd` where the spread drains. Five of these have a new input since 2026-10-11. Two changes to the plan: the `parts` proof needed a harder input, and the gap bands went from 0.02 to 0.10. The full output and the limits are in "Gate-evolve" below | 2026-10-12 |
| Evolution, M3 bands | `make gates-long` (`gate-evolve --brain` at tick 144,000) for `hidden`, `conns`, `variety_wired`. `make gates` for `speed_cv` | A brain that is the largest cost of a body (`hidden`, `conns`), the four structural rates at 0 (`variety_wired`), every body mutation off (`speed_cv`) | Each `0/3`, exit 1 at the M3 defaults. "The brain bands" and "The `speed_cv` band" below. Confirmed by the owner 2026-10-15 | 2026-10-15 |

## Notes

- **Clippy banned methods.** The list covers `f32` and `f64`. `(x as f64).sin() as f32` and `x.ln()` on an `f32`, added to `crates/sim/src/lib.rs`, give
  ``error: use of a disallowed method `f64::sin` `` and ``error: use of a disallowed method `f32::ln` ``,
  exit 101. A test file under `crates/sim/tests/` runs native only and can allow the lint.
- **Snapshot round trip.** Run again on 2026-10-12, after the M2 audit found an old count and old
  hashes in this row. The file holds 32 tests now. Three tests catch a forgotten field by themselves:
  `load_then_run_equals_unbroken_run`, `load_then_run_equals_unbroken_run_across_births` (`left:
  974657296`, `right: 2377157895`), and `every_saved_field_is_in_the_hash_and_survives_a_load` (`vy is
  not in the hash`). The other two round-trip tests (`load_gives_the_same_hash_immediately` and
  `spawning_after_load_matches_spawning_without_it`) still pass with that field missing. The other 16
  tests that fail build a payload by hand in the test file, and that payload now has one creature
  field too many. Removing the line from `save` alone fails 11 of 32 tests. The 3 tests above and both
  of the other round-trip tests are among them. 9 of the 11 stop with `Invalid("creature field
  length")`, 1 stops with `Invalid("plant field length")`, and 1 stops with `Truncated`.
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

The `settled` line at the defaults matches the seed 1 row of the health gate: 1,319 creatures and
2,229 plants at tick 12,000. The mean over the timed ticks is 1,320. These are the defaults of
2026-10-12: no part upkeep, and `plant_growth` 0.03.

The table of seeds below is the M1 world, where the `settled` line read 1,477 creatures and 1,682
plants. At the defaults of 2026-10-12 `gate-health` reads 1,105 to 1,408 creatures at tick 12,000 on
seeds 1 to 10, and seeds 4, 6, and 8 are under 1,200 there. The gate is still a seed 1 reading.

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

The proofs, run again on 2026-10-12 at the defaults of that day. Other work held the machine at a
load average of 2 to 3, so the `tps` figures here are not gate readings.

```
$ target/release/tidepool-headless bench --floor 1000000000
settled tick=12000 creatures=1319 plants=2229
run 1 creatures=1320 tps=3289
run 2 creatures=1320 tps=3346
run 3 creatures=1320 tps=3360
run 4 creatures=1320 tps=3309
run 5 creatures=1320 tps=3233
bench creatures=1320 median_tps=3309 floor=1000000000 FAIL
exit=1
$ node scripts/bench-wasm.mjs --floor 1000000000
settled tick=12000 creatures=1319 plants=2229
run 1 creatures=1320 tps=3173
run 2 creatures=1320 tps=3157
run 3 creatures=1320 tps=3093
run 4 creatures=1320 tps=3131
run 5 creatures=1320 tps=3102
bench-wasm creatures=1320 median_tps=3131 floor=1000000000 FAIL
exit=1
$ target/release/tidepool-headless bench --reference 5000
settled tick=12000 creatures=1319 plants=2229
run 1 creatures=1320 tps=3396
VOID: population fell
exit=1
$ node scripts/bench-wasm.mjs --reference 5000
settled tick=12000 creatures=1319 plants=2229
run 1 creatures=1320 tps=3051
VOID: population fell
exit=1
```

A world that settles for 200 ticks is young, and it is void. It holds 703 creatures at the settle
and a mean of 1,041 over the timed ticks, under the void line of 1,200. One run reads about 1.2 times
as fast as the default. On the M1 world the same input held a mean of 485 and read 3 times as fast.

```
$ target/release/tidepool-headless bench --settle 200
settled tick=200 creatures=703 plants=1386
run 1 creatures=1041 tps=3964
VOID: population fell
exit=1
$ node scripts/bench-wasm.mjs --settle 200
settled tick=200 creatures=703 plants=1386
run 1 creatures=1041 tps=3775
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
| 2026-10-12 | No part upkeep, `plant_growth` 0.03 (`findings/m2-senses.md`, trial 13) | The default world after 12,000 ticks, seed 1: 1,319 creatures and 2,229 plants | 1,320 | 3,188 to 3,411 | 2,933 to 3,127 | 2,400 |
| 2026-10-13 | The second audit of M2 (`findings/m2-audit-2.md`). No rule changed | The same world | 1,320 | 3,091 (the auditor) and 3,493 | 2,992 (the auditor) and 3,200 | 2,400 |

**The old world sits at the floor, on both sides of it.** `node scripts/bench-wasm.mjs --settle 108000
--runs 3` settles at 1,648 creatures and times a mean of 1,665. Four readings of the same build:

| Date | Who | Load average | Runs | `median_tps` | Verdict |
|---|---|---|---|---|---|
| 2026-10-12 | The orchestrator of M2 | 4.3 | not kept | 2,357 | `FAIL` |
| 2026-10-13 | The auditor | 6.9 | not kept | 2,426 | `PASS` |
| 2026-10-13 | The auditor | 4.6 | not kept. One run of the six was 2,373 | 2,442 | `PASS` |
| 2026-10-13 | The orchestrator | 5.1 | 2,454, 2,471, 2,493 | 2,471 | `PASS` |

So "under the floor" is not a stable reading of that world: it reads from 2% under to 3% over. The
native bench of the same world read 2,511 at a mean of 1,664 (the auditor, load 4.2). No gate times
that world, and the question stays with M5 (`decisions/INDEX.md`, 2026-10-12).

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
pair with the rows above. `push_mass` and `motor_curve` were deleted on 2026-10-12, so that command
is a record and cannot be typed now.

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
rows at the defaults of 2026-10-12:

```
$ target/release/tidepool-headless gate-health
seed=1 creatures=1319 min_late=1252 plants=2229 births_late=1802 max_gen=14 mean_chemo=0.48 parked=0.00 first_bud=916 juv_starved=0.52 to_bud=0.32 PASS
seed=2 creatures=1253 min_late=1186 plants=2076 births_late=1709 max_gen=16 mean_chemo=0.43 parked=0.00 first_bud=867 juv_starved=0.50 to_bud=0.33 PASS
seed=3 creatures=1243 min_late=1133 plants=1965 births_late=1670 max_gen=14 mean_chemo=0.47 parked=0.00 first_bud=854 juv_starved=0.51 to_bud=0.33 PASS
gate-health 3/3 PASS
exit=0
```

Every output in this section ran on 2026-10-12 at those defaults.

The three inputs of the plan. The first two fail every seed, as they did on the M1 world. The third
no longer fails.

```
$ target/release/tidepool-headless gate-health --param plant_growth=0
seed=1 creatures=0 min_late=0 plants=1261 births_late=0 max_gen=0 mean_chemo=0.00 parked=0.00 first_bud=none juv_starved=0.98 to_bud=0.00 FAIL(creatures=0 < 150, min_late=0 < 100, births_late=0 < 20, max_gen=0 < 8, mean_chemo=0.00 < 0.15)
seed=2 creatures=0 min_late=0 plants=1295 births_late=0 max_gen=0 mean_chemo=0.00 parked=0.00 first_bud=none juv_starved=0.98 to_bud=0.00 FAIL(creatures=0 < 150, min_late=0 < 100, births_late=0 < 20, max_gen=0 < 8, mean_chemo=0.00 < 0.15)
seed=3 creatures=0 min_late=0 plants=1277 births_late=0 max_gen=0 mean_chemo=0.00 parked=0.00 first_bud=none juv_starved=0.98 to_bud=0.00 FAIL(creatures=0 < 150, min_late=0 < 100, births_late=0 < 20, max_gen=0 < 8, mean_chemo=0.00 < 0.15)
gate-health 0/3 FAIL
exit=1
$ target/release/tidepool-headless gate-health --param basal=0.01
seed=1 creatures=0 min_late=0 plants=2229 births_late=0 max_gen=0 mean_chemo=0.00 parked=0.00 first_bud=none juv_starved=0.00 to_bud=0.00 FAIL(creatures=0 < 150, min_late=0 < 100, births_late=0 < 20, max_gen=0 < 8, mean_chemo=0.00 < 0.15)
seed=2 creatures=0 min_late=0 plants=2076 births_late=0 max_gen=0 mean_chemo=0.00 parked=0.00 first_bud=none juv_starved=0.00 to_bud=0.00 FAIL(creatures=0 < 150, min_late=0 < 100, births_late=0 < 20, max_gen=0 < 8, mean_chemo=0.00 < 0.15)
seed=3 creatures=0 min_late=0 plants=1965 births_late=0 max_gen=0 mean_chemo=0.00 parked=0.00 first_bud=none juv_starved=0.00 to_bud=0.00 FAIL(creatures=0 < 150, min_late=0 < 100, births_late=0 < 20, max_gen=0 < 8, mean_chemo=0.00 < 0.15)
gate-health 0/3 FAIL
exit=1
$ target/release/tidepool-headless gate-health --seeds 1 --ticks 12000 --param mut_rate=0 --param mut_weight_rate=0
seed=1 creatures=1238 min_late=1140 plants=2229 births_late=2091 max_gen=17 mean_chemo=0.49 parked=0.00 first_bud=694 juv_starved=0.51 to_bud=0.34 PASS
gate-health 1/1 PASS
exit=0
```

The third input does not crash, and the gene measures print with no mutation. **It is not a failure
proof at these defaults.** On the M1 world it failed on `max_gen` alone, at 7 against 8. With no
mutation the world of 2026-10-12 reaches generation 17 in 12,000 ticks, and the row passes. The
M2 audit found this (`findings/m2-audit.md`, finding M1). `max_gen` has other proofs below.

Three more bad worlds, so that each side of each band has rejected something. Seed 1, 12,000 ticks.

```
$ target/release/tidepool-headless gate-health --seeds 1 --param fert_blobs=1 --param fert_radius=20
seed=1 creatures=4 min_late=3 plants=6 births_late=4 max_gen=6 mean_chemo=0.55 parked=0.00 first_bud=1695 juv_starved=0.38 to_bud=0.46 FAIL(creatures=4 < 150, min_late=3 < 100, plants=6 < 300, births_late=4 < 20, max_gen=6 < 8)
gate-health 0/1 FAIL
exit=1
$ target/release/tidepool-headless gate-health --seeds 1 --param basal=0.01 --param plant_cell_cap=16 --param fert_radius=600 --param plant_seed_chance=1 --param plant_growth=0.1
seed=1 creatures=0 min_late=0 plants=8192 births_late=0 max_gen=0 mean_chemo=0.00 parked=0.00 first_bud=none juv_starved=0.00 to_bud=0.00 FAIL(creatures=0 < 150, min_late=0 < 100, plants=8192 > 7000, births_late=0 < 20, max_gen=0 < 8, mean_chemo=0.00 < 0.15)
gate-health 0/1 FAIL
exit=1
$ target/release/tidepool-headless gate-health --seeds 1 --param basal=0 --param neuron_upkeep=0 --param conn_upkeep=0 --param move_cost=0 --param lifespan=24000 --param plant_growth=0.1 --param bite_fraction=0.01 --param bud_cooldown=0
seed=1 creatures=4096 min_late=4096 plants=2229 births_late=429 max_gen=3 mean_chemo=0.49 parked=0.96 first_bud=223 juv_starved=0.00 to_bud=0.23 FAIL(creatures=4096 > 3000, max_gen=3 < 8, parked=0.96 > 0.25)
gate-health 0/1 FAIL
exit=1
```

The third command is the world with no upkeep. The record of 2026-10-10 also set `part_upkeep=0`.
That parameter is deleted, and a part has no upkeep now, so the command without it asks for the same
thing. `births_late` reads 429 there and no longer fails. It read 0 on the M1 world.

A new input for `max_gen`, in place of the input with no mutation. Why it is bad: at `grow_rate`
0.0001 a newborn needs 3,000 ticks to be full-grown, and only an adult buds. So 12,000 ticks hold
about 4 generations. The reason was written before the run. The world lives with 1,484 creatures and
fails on `max_gen` alone:

```
$ target/release/tidepool-headless gate-health --seeds 1 --param grow_rate=0.0001
seed=1 creatures=1484 min_late=1152 plants=2229 births_late=1223 max_gen=4 mean_chemo=0.49 parked=0.00 first_bud=3221 juv_starved=0.60 to_bud=0.21 FAIL(max_gen=4 < 8)
gate-health 0/1 FAIL
exit=1
```

One input ran before that one and did not fail: `--seeds 1 --param bud_cooldown=5000` passes with
`max_gen=37`. The cooldown does not hold a body's first bud.

What has rejected a world at the defaults of 2026-10-12, and what has not:

- Rejected: `creatures` on both sides, `min_late`, `plants` on both sides, `births_late`, `max_gen`,
  and `parked`. `births_late` rejected only worlds that died out or nearly did: it read 0, 0, 4, and 0.
  `max_gen` rejected two worlds with living creatures: the world with no upkeep, and the world that
  grows slowly.
- On older defaults `max_gen` also rejected the input with no mutation, a baseline, and tuning trial
  2, and `creatures` above 3,000 rejected a tuning trial on all 3 seeds. Those are records.
- **Two sides rejected a living world on 2026-10-13** (`findings/m2-audit-2.md`, finding M5, run by the
  auditor and again by the orchestrator, the same digits). `plants` high, alone, in a world of 1,085:

  ```
  $ target/release/tidepool-headless gate-health --seeds 1 --param plant_cell_cap=16 --param fert_radius=600 --param plant_seed_chance=1 --param plant_growth=0.005
  seed=1 creatures=1085 min_late=718 plants=8192 births_late=1707 max_gen=14 mean_chemo=0.42 parked=0.00 first_bud=698 juv_starved=0.51 to_bud=0.32 FAIL(plants=8192 > 7000)
  gate-health 0/1 FAIL
  exit=1
  ```

  `births_late`, in a world of 303 bodies that never bud, with `max_gen` and `parked`:

  ```
  $ target/release/tidepool-headless gate-health --seeds 1 --param bud_at=1 --param lifespan=24000 --param plant_growth=0.1
  seed=1 creatures=303 min_late=303 plants=2229 births_late=0 max_gen=0 mean_chemo=0.50 parked=0.92 first_bud=none juv_starved=0.00 to_bud=0.00 FAIL(births_late=0 < 20, max_gen=0 < 8, parked=0.92 > 0.25)
  gate-health 0/1 FAIL
  exit=1
  ```

- **Still open: `min_late` and `plants` low have rejected only worlds that `creatures` also rejects.**
  `min_late` failed at 0, 0, 3, 0 and `plants` low at 6, each with `creatures` under 150. No input is
  known that fails one of them in a world of 150 creatures or more. Two tries at `births_late` alone
  ended under 150 (116 and 141).
- **`mean_chemo` has rejected an empty world**, where the mean of no creatures prints as 0, and no
  living world inside the protocol of the gate. "What the `mean_chemo` band can see" below has the
  readings.
- A usage error exits 2: an unknown parameter name, a value outside the range of its parameter, or a
  seed that is not a number. `--param part_upkeep=0` and `--m2` are usage errors now.

### What the `mean_chemo` band can see

The band is the early warning for risk R1 of `design.md`: evolution strips a sense that costs upkeep
and does not pay. The M1 audit measured what the band does (`findings/m1-audit.md`, finding F3). The
readings below ran again on 2026-10-12.

- **It does not show that evolution keeps the sense.** With the direction of the scent switched off
  the gate passes 3 of 3, and `mean_chemo` reads 0.38, 0.41, 0.45 at 12,000 ticks. With the sense on
  it reads 0.48, 0.43, 0.47, and a founder holds 0.5. The gene falls too slowly for 12,000 ticks to
  move its mean under 0.15.
- **It fires on a living world outside the protocol.** The same input at 36,000 ticks reads 0.05 and
  0.07 on seeds 1 and 2, in worlds of 1,456 and 1,380 creatures, and the band rejects both. Seed 3
  reads 0.16 and passes. Why the input is bad: the direction is off, so the chemoreceptor pays
  nothing and still has mass. The proof of 2026-10-10 also needed 5 times the part upkeep and faster
  mutation of the body genes. The part upkeep is deleted, so that command cannot be typed now.
- **So a pass says only that the gene is not gone yet.** The scent gap of `gate-evolve`, below, reads
  whether the sense pays. The gate, its bands, and its protocol did not change here.

```
$ target/release/tidepool-headless gate-health --param chemo_gain=0
seed=1 creatures=1361 min_late=1337 plants=2229 births_late=2090 max_gen=19 mean_chemo=0.38 parked=0.00 first_bud=729 juv_starved=0.51 to_bud=0.33 PASS
seed=2 creatures=1288 min_late=1240 plants=2076 births_late=1949 max_gen=15 mean_chemo=0.41 parked=0.00 first_bud=764 juv_starved=0.51 to_bud=0.33 PASS
seed=3 creatures=1237 min_late=1158 plants=1965 births_late=1783 max_gen=17 mean_chemo=0.45 parked=0.00 first_bud=733 juv_starved=0.50 to_bud=0.34 PASS
gate-health 3/3 PASS
exit=0
$ target/release/tidepool-headless gate-health --ticks 36000 --param chemo_gain=0
seed=1 creatures=1456 min_late=1370 plants=2229 births_late=2234 max_gen=36 mean_chemo=0.05 parked=0.00 first_bud=861 juv_starved=0.55 to_bud=0.33 FAIL(mean_chemo=0.05 < 0.15)
seed=2 creatures=1380 min_late=1276 plants=2076 births_late=1912 max_gen=33 mean_chemo=0.07 parked=0.00 first_bud=908 juv_starved=0.54 to_bud=0.33 FAIL(mean_chemo=0.07 < 0.15)
seed=3 creatures=1312 min_late=1161 plants=1965 births_late=1895 max_gen=39 mean_chemo=0.16 parked=0.00 first_bud=869 juv_starved=0.53 to_bud=0.34 PASS
gate-health 1/3 FAIL
exit=1
```

## Gate-evolve

`target/release/tidepool-headless gate-evolve [--seeds 1,2,3] [--ticks 36000] [--param name=value]...`
runs the default world three times for each seed, one run at a time: as given, with `chemo_gain=0`, and
with `eye_gain=0`. It prints one row per seed and exits 0 only when every seed is inside every band. A
usage error exits 2. Built by M2 Task 12 on 2026-10-11.

**It is in `make gates` and in CI, after `gate-health`, on all three seeds.** M2 Task 13 wired it in on
2026-10-11. The gate took 99 seconds on the reference machine on 2026-10-12, at a load average of 3
from other work. On the Start values of 2026-10-11 it took 30 to 32 seconds: the world holds about 3
times the creatures now. The CI runner read about half the speed of the reference machine in the
benches (the CI note above). The three seeds stay.

The rows at the defaults of 2026-10-12:

```
$ target/release/tidepool-headless gate-evolve
seed=1 creatures=1448 creatures_noscent=1456 creatures_noeye=1404 len=11.5 len_sd=1.48 parts=5.8 chemo=0.36 chemo_blind=0.05 eye=0.24 eye_blind=0.08 plans=6 speed_cv=0.27 speed=1.07 area=64.5 PASS
seed=2 creatures=1429 creatures_noscent=1380 creatures_noeye=1309 len=10.3 len_sd=1.50 parts=6.1 chemo=0.39 chemo_blind=0.07 eye=0.26 eye_blind=0.07 plans=5 speed_cv=0.29 speed=0.85 area=50.2 PASS
seed=3 creatures=1397 creatures_noscent=1312 creatures_noeye=1314 len=11.0 len_sd=1.69 parts=5.2 chemo=0.33 chemo_blind=0.16 eye=0.22 eye_blind=0.09 plans=3 speed_cv=0.29 speed=1.05 area=58.2 PASS
gate-evolve 3/3 PASS
exit=0
```

**The row has printed `speed` and `area` since 2026-10-12** (the owner's decision on audit findings M3
and M7). Neither has a band. A row recorded before that date ends at `speed_cv`, and its other
measures read the same.

**`--m2` is deleted, and so are five parameters.** Task 13 wrote the Start values of the plan's
parameter table into `params.rs` and deleted the flag. The defaults moved twice after that: the
tuned set of Task 13 (`findings/m2-tuning.md`), and then no part upkeep and `plant_growth` 0.03 on
2026-10-12 (`findings/m2-senses.md`). `upkeep_curve`, `intake_curve`, `motor_curve`, `push_mass`, and
`part_upkeep` were deleted on 2026-10-12. So a command recorded with `--m2` or with one of those
names cannot be typed now, and the same command without them runs a different world. This file
keeps such a command only where it says that the output is a record.

**`make gates` exits 0 since 2026-10-12.** Task 13 closed on 2026-10-11 with `gate-evolve` at 2 of 3:
the scent gap of seed 1 read 0.079 against 0.10, and on seeds 1 to 10 it passed on 5. The cause was
the upkeep of a part. The owner deleted that rule, and `plant_growth` went from 0.035 to 0.03 to
hold the count (`findings/m2-senses.md`). Now the scent gap reads 0.17 to 0.37 on seeds 1 to 10. On
those ten seeds the gate reads 9 of 10: seed 7 fails the eye gap at 0.097. No band, floor, or
reference population was changed. **Every failure proof below ran again at these defaults on
2026-10-12, and every band and both blind-run checks rejected a bad input** (`findings/m2-audit.md`,
finding M1). Five proofs have a new input, and "The proofs" says which.

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
| `speed_cv` | Standard deviation over mean of the top speed of adults, by rule S3 of the plan | 0.10 or more, from 2026-10-14. Confirmed by the owner 2026-10-15 ("The `speed_cv` band" below) |
| `speed` | Mean top speed of the living, by the same rule. The `speed` of `probe-census` | Reported, no band |
| `area` | Mean of length squared times the width gene, over the living. The `area` of `probe-census` | Reported, no band |

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
many seeds did. Every run below is of 2026-10-12, at the defaults of that day. A run is 9 runs of
36,000 ticks and took 5 to 122 seconds at a load average of 3 to 5. A world with fewer creatures is
faster.

"Input" says whether the bad input is the one recorded on 2026-10-11. A new input has its reason
with its output below. Each reason was written before the output of its run was read. `fert_radius=40`
has no new reason: it is the recorded input of the `creatures` band.

| Band | Bad input | Reading on seeds 1, 2, 3 | Seeds that failed the band | Input |
|---|---|---|---|---|
| `creatures` | `fert_radius=25`: too little fertile ground | 80, 60, 69 | 3 of 3 | New. The old input `fert_radius=40` reads 209, 176, 198 and no longer fails the band |
| `len` | `part_mass=0.1 neuron_upkeep=0.0002 conn_upkeep=0.00005 birth_growth=0.4 plant_cap=20`: a world where a small body wins | 6.35, 6.48, 6.72 | 3 of 3 | New. The old input names four deleted parameters |
| `len_sd` | The same, and `mut_rate=0`: no body gene can change | 0.56, 0.32, 0.55 | 1 of 3 | New, for the same reason |
| `len_sd` | `mut_rate=0 founder_sigma=0`: no two bodies differ in length | 0.00, 0.00, 0.00 | 3 of 3 | New |
| `parts` | `mut_part_add=0 mut_part_dup=0 mut_part_remove=0.3 scent_deposit=0 eye_range=0`: parts can only be lost and no sense works | 2.11, 2.06, 2.16 | 3 of 3 | Kept |
| Scent gap | `scent_deposit=0`: no scent in either run | 0.000, 0.000, 0.000 | 3 of 3 | Kept |
| Eye gap | `eye_range=0`: no eye sees in either run | 0.000, 0.000, 0.000 | 3 of 3 | Kept |
| Both gaps | `chemo_gain=0.0001 eye_gain=0.0001`: both senses read almost nothing in every run | Scent: 0.008, 0.022, -0.116. Eye: -0.003, -0.015, 0.008 | 3 of 3 for each | Kept |
| `chemo_blind run died` | `fert_radius=40`: a thin world | `creatures_noscent` 156, 100, 161, against 209, 176, 198 in the seeing run | 1 of 3 | New. The old input `--ticks 12000 --param fert_blobs=3` reads 300, 236, 248 and no longer fails the check |
| `eye_blind run died` | `fert_radius=50 scent_deposit=0`: a thin world where sight is the only sense | `creatures_noeye` 229, 121, 234, against 312, 237, 321 in the seeing run | 1 of 3 | New. The old input `fert_radius=40` reads 202, 170, 193 and no longer fails the check |

Every proof of a band on genes is on a world over the `creatures` floor: `len` on 1,953 to 2,218
creatures, `len_sd` on 1,198 to 1,376, and `parts` on 1,282 to 1,446. No mean was taken over no
bodies.

`creatures`, on a world with too little fertile ground. Why it is bad: a patch of radius 25 has a
sixteenth of the area of a default patch. The seeing runs hold 60 to 80 creatures. Every seed passes
`len`, `len_sd`, and `parts`, so only the floor says that this world is nearly empty. Both blind-run
checks fire on every seed here too, but the seeing run is under the floor with them:

```
$ target/release/tidepool-headless gate-evolve --param fert_radius=25
seed=1 creatures=80 creatures_noscent=13 creatures_noeye=91 len=12.0 len_sd=1.26 parts=5.2 chemo=0.56 chemo_blind=0.65 eye=0.23 eye_blind=0.13 plans=4 speed_cv=0.27 FAIL(creatures=80 < 150, chemo_gap=-0.096 < 0.1, chemo_blind run died, eye_gap=0.098 < 0.1, eye_blind run died)
seed=2 creatures=60 creatures_noscent=4 creatures_noeye=66 len=11.2 len_sd=1.50 parts=5.8 chemo=0.67 chemo_blind=0.00 eye=0.27 eye_blind=0.18 plans=6 speed_cv=0.21 FAIL(creatures=60 < 150, chemo_blind run died, eye_gap=0.094 < 0.1, eye_blind run died)
seed=3 creatures=69 creatures_noscent=0 creatures_noeye=71 len=12.1 len_sd=0.79 parts=5.5 chemo=0.58 chemo_blind=0.00 eye=0.14 eye_blind=0.14 plans=6 speed_cv=0.26 FAIL(creatures=69 < 150, chemo_blind run died, eye_gap=0.002 < 0.1, eye_blind run died)
gate-evolve 0/3 FAIL
exit=1
```

`chemo_blind run died`, on the old input of the `creatures` band: less fertile ground than the
default, and more than the world above. On seed 2 the seeing run holds 176 creatures and the run
with no direction holds 100. The `creatures` band passes on every seed, so this input is no longer a
proof of that band:

```
$ target/release/tidepool-headless gate-evolve --param fert_radius=40
seed=1 creatures=209 creatures_noscent=156 creatures_noeye=202 len=11.3 len_sd=2.17 parts=5.7 chemo=0.49 chemo_blind=0.28 eye=0.26 eye_blind=0.13 plans=5 speed_cv=0.28 PASS
seed=2 creatures=176 creatures_noscent=100 creatures_noeye=170 len=11.2 len_sd=1.59 parts=5.4 chemo=0.53 chemo_blind=0.31 eye=0.20 eye_blind=0.09 plans=6 speed_cv=0.19 FAIL(chemo_blind run died)
seed=3 creatures=198 creatures_noscent=161 creatures_noeye=193 len=11.5 len_sd=1.10 parts=5.2 chemo=0.59 chemo_blind=0.43 eye=0.26 eye_blind=0.13 plans=4 speed_cv=0.27 PASS
gate-evolve 2/3 FAIL
exit=1
```

`len`, on a world where a small body wins. Why it is bad: these five values are the Start values that
trials 5 to 8 of `findings/m2-tuning.md` replaced to hold the size of the body up. With them the
filter weighs almost nothing, the brain costs little, and the egg is small. Those are the cheap ways
to a newborn's mouth that trial 7 closed, so a small body wins. Trial 3 read 6.15 to 6.35 with these
five values, at `plant_growth` 0.035 and with the part upkeep. `len_sd` passes on every seed of this
run:

```
$ target/release/tidepool-headless gate-evolve --param part_mass=0.1 --param neuron_upkeep=0.0002 --param conn_upkeep=0.00005 --param birth_growth=0.4 --param plant_cap=20
seed=1 creatures=2218 creatures_noscent=2288 creatures_noeye=2653 len=6.3 len_sd=0.53 parts=6.4 chemo=0.44 chemo_blind=0.42 eye=0.34 eye_blind=0.13 plans=2 speed_cv=0.29 FAIL(len=6.35 < 7.8, chemo_gap=0.024 < 0.1)
seed=2 creatures=2092 creatures_noscent=2133 creatures_noeye=2419 len=6.5 len_sd=1.16 parts=8.0 chemo=0.42 chemo_blind=0.19 eye=0.37 eye_blind=0.20 plans=4 speed_cv=0.21 FAIL(len=6.48 < 7.8)
seed=3 creatures=1953 creatures_noscent=2158 creatures_noeye=2296 len=6.7 len_sd=0.99 parts=6.3 chemo=0.49 chemo_blind=0.05 eye=0.35 eye_blind=0.07 plans=6 speed_cv=0.25 FAIL(len=6.72 < 7.8)
gate-evolve 0/3 FAIL
exit=1
```

`len_sd`, on the same world with no mutation of a body gene. Why it is bad: no spread of length can
be made, so what is left is the founders' spread, drained by selection. Seed 2 fails. Seeds 1 and 3
pass at 0.56 and 0.55:

```
$ target/release/tidepool-headless gate-evolve --param part_mass=0.1 --param neuron_upkeep=0.0002 --param conn_upkeep=0.00005 --param birth_growth=0.4 --param plant_cap=20 --param mut_rate=0
seed=1 creatures=1341 creatures_noscent=1403 creatures_noeye=1498 len=10.3 len_sd=0.56 parts=6.1 chemo=0.55 chemo_blind=0.44 eye=0.21 eye_blind=0.20 plans=5 speed_cv=0.15 FAIL(eye_gap=0.010 < 0.1)
seed=2 creatures=1281 creatures_noscent=1258 creatures_noeye=1410 len=10.6 len_sd=0.32 parts=6.0 chemo=0.51 chemo_blind=0.50 eye=0.21 eye_blind=0.21 plans=4 speed_cv=0.19 FAIL(len_sd=0.32 < 0.5, chemo_gap=0.008 < 0.1, eye_gap=0.005 < 0.1)
seed=3 creatures=1149 creatures_noscent=1258 creatures_noeye=1364 len=10.8 len_sd=0.55 parts=5.4 chemo=0.52 chemo_blind=0.40 eye=0.21 eye_blind=0.18 plans=2 speed_cv=0.31 FAIL(eye_gap=0.022 < 0.1)
gate-evolve 0/3 FAIL
exit=1
```

`len_sd`, on a world where no two bodies differ in length. Why it is bad: every founder holds the
default length and no body gene can change. This input ran to have a proof on every seed:

```
$ target/release/tidepool-headless gate-evolve --param mut_rate=0 --param founder_sigma=0
seed=1 creatures=1376 creatures_noscent=1405 creatures_noeye=1513 len=12.0 len_sd=0.00 parts=5.1 chemo=0.42 chemo_blind=0.08 eye=0.20 eye_blind=0.14 plans=2 speed_cv=0.14 FAIL(len_sd=0.00 < 0.5, eye_gap=0.066 < 0.1)
seed=2 creatures=1269 creatures_noscent=1371 creatures_noeye=1460 len=12.0 len_sd=0.00 parts=5.2 chemo=0.44 chemo_blind=0.15 eye=0.20 eye_blind=0.11 plans=5 speed_cv=0.27 FAIL(len_sd=0.00 < 0.5, eye_gap=0.090 < 0.1)
seed=3 creatures=1198 creatures_noscent=1290 creatures_noeye=1407 len=12.0 len_sd=0.00 parts=5.4 chemo=0.44 chemo_blind=0.08 eye=0.21 eye_blind=0.18 plans=4 speed_cv=0.26 FAIL(len_sd=0.00 < 0.5, eye_gap=0.031 < 0.1)
gate-evolve 0/3 FAIL
exit=1
```

`parts`, on a world where the count does fall to the least that a body can live with:

```
$ target/release/tidepool-headless gate-evolve --param mut_part_add=0 --param mut_part_dup=0 --param mut_part_remove=0.3 --param scent_deposit=0 --param eye_range=0
seed=1 creatures=1446 creatures_noscent=1446 creatures_noeye=1446 len=14.0 len_sd=1.97 parts=2.1 chemo=0.00 chemo_blind=0.00 eye=0.01 eye_blind=0.01 plans=3 speed_cv=0.39 FAIL(parts=2.11 < 3, chemo_gap=0.000 < 0.1, eye_gap=0.000 < 0.1)
seed=2 creatures=1421 creatures_noscent=1421 creatures_noeye=1421 len=13.4 len_sd=1.47 parts=2.1 chemo=0.00 chemo_blind=0.00 eye=0.01 eye_blind=0.01 plans=3 speed_cv=0.38 FAIL(parts=2.06 < 3, chemo_gap=0.000 < 0.1, eye_gap=0.000 < 0.1)
seed=3 creatures=1282 creatures_noscent=1282 creatures_noeye=1282 len=14.2 len_sd=1.74 parts=2.2 chemo=0.00 chemo_blind=0.00 eye=0.00 eye_blind=0.00 plans=3 speed_cv=0.43 FAIL(parts=2.16 < 3, chemo_gap=0.000 < 0.1, eye_gap=0.000 < 0.1)
gate-evolve 0/3 FAIL
exit=1
```

The scent gap:

```
$ target/release/tidepool-headless gate-evolve --param scent_deposit=0
seed=1 creatures=1612 creatures_noscent=1612 creatures_noeye=1514 len=11.3 len_sd=2.10 parts=4.4 chemo=0.03 chemo_blind=0.03 eye=0.23 eye_blind=0.09 plans=3 speed_cv=0.26 FAIL(chemo_gap=0.000 < 0.1)
seed=2 creatures=1418 creatures_noscent=1418 creatures_noeye=1325 len=10.8 len_sd=1.46 parts=5.0 chemo=0.07 chemo_blind=0.07 eye=0.27 eye_blind=0.10 plans=4 speed_cv=0.27 FAIL(chemo_gap=0.000 < 0.1)
seed=3 creatures=1374 creatures_noscent=1374 creatures_noeye=1250 len=12.0 len_sd=1.56 parts=5.1 chemo=0.20 chemo_blind=0.20 eye=0.21 eye_blind=0.09 plans=5 speed_cv=0.22 FAIL(chemo_gap=0.000 < 0.1)
gate-evolve 0/3 FAIL
exit=1
```

The eye gap:

```
$ target/release/tidepool-headless gate-evolve --param eye_range=0
seed=1 creatures=1404 creatures_noscent=1423 creatures_noeye=1404 len=12.9 len_sd=1.40 parts=4.8 chemo=0.39 chemo_blind=0.17 eye=0.08 eye_blind=0.08 plans=3 speed_cv=0.22 FAIL(eye_gap=0.000 < 0.1)
seed=2 creatures=1309 creatures_noscent=1349 creatures_noeye=1309 len=13.1 len_sd=1.55 parts=5.0 chemo=0.46 chemo_blind=0.16 eye=0.07 eye_blind=0.07 plans=4 speed_cv=0.23 FAIL(eye_gap=0.000 < 0.1)
seed=3 creatures=1314 creatures_noscent=1265 creatures_noeye=1314 len=12.6 len_sd=1.25 parts=5.0 chemo=0.40 chemo_blind=0.19 eye=0.09 eye_blind=0.09 plans=5 speed_cv=0.23 FAIL(eye_gap=0.000 < 0.1)
gate-evolve 0/3 FAIL
exit=1
```

Both gaps, on senses that read almost nothing. This input is not in the plan. "The gap bands are 0.10"
below says why it ran:

```
$ target/release/tidepool-headless gate-evolve --param chemo_gain=0.0001 --param eye_gain=0.0001
seed=1 creatures=1515 creatures_noscent=1502 creatures_noeye=1501 len=12.9 len_sd=1.11 parts=4.7 chemo=0.19 chemo_blind=0.18 eye=0.09 eye_blind=0.09 plans=5 speed_cv=0.20 FAIL(chemo_gap=0.008 < 0.1, eye_gap=-0.003 < 0.1)
seed=2 creatures=1361 creatures_noscent=1328 creatures_noeye=1432 len=12.9 len_sd=1.24 parts=4.9 chemo=0.17 chemo_blind=0.15 eye=0.07 eye_blind=0.09 plans=5 speed_cv=0.24 FAIL(chemo_gap=0.022 < 0.1, eye_gap=-0.015 < 0.1)
seed=3 creatures=1303 creatures_noscent=1353 creatures_noeye=1177 len=13.6 len_sd=1.83 parts=4.6 chemo=0.11 chemo_blind=0.22 eye=0.12 eye_blind=0.12 plans=4 speed_cv=0.23 FAIL(chemo_gap=-0.116 < 0.1, eye_gap=0.008 < 0.1)
gate-evolve 0/3 FAIL
exit=1
```

`eye_blind run died`, on a thin world with no scent. Why it is bad: sight is the only sense that can
find a plant here, so with `eye_gain=0` a body has no sense left. On seed 2 the seeing run holds 237
creatures and the run with blind eyes holds 121. The scent gap reads 0.000 on every seed, since
both scent runs are one world:

```
$ target/release/tidepool-headless gate-evolve --param fert_radius=50 --param scent_deposit=0
seed=1 creatures=312 creatures_noscent=312 creatures_noeye=229 len=12.2 len_sd=1.30 parts=5.3 chemo=0.45 chemo_blind=0.45 eye=0.28 eye_blind=0.19 plans=6 speed_cv=0.26 FAIL(chemo_gap=0.000 < 0.1, eye_gap=0.088 < 0.1)
seed=2 creatures=237 creatures_noscent=237 creatures_noeye=121 len=12.1 len_sd=1.84 parts=6.1 chemo=0.30 chemo_blind=0.30 eye=0.31 eye_blind=0.20 plans=6 speed_cv=0.22 FAIL(chemo_gap=0.000 < 0.1, eye_blind run died)
seed=3 creatures=321 creatures_noscent=321 creatures_noeye=234 len=11.8 len_sd=1.20 parts=5.6 chemo=0.39 chemo_blind=0.39 eye=0.26 eye_blind=0.24 plans=5 speed_cv=0.30 FAIL(chemo_gap=0.000 < 0.1, eye_gap=0.023 < 0.1)
gate-evolve 0/3 FAIL
exit=1
```

### What the proofs show, and what they do not

**`creatures` has rejected a world under the floor on 3 of 3 seeds.** Its seeing runs hold 60 to 80
creatures at tick 36,000: bodies, not an empty world. On 2026-10-11 the band rejected
`fert_radius=40`, which read 0, 12, and 2 then. At the defaults of 2026-10-12 that world holds 176 to
209 creatures and passes the band. The band has not rejected a world that passes the health gate at
tick 12,000 and dies after it: no such world was looked for.

**`len` has rejected a world of bodies on 3 of 3 seeds.** With the five Start values the mean length
runs to 6.35 to 6.72. The gene's floor is 6. That world holds 1,953 to 2,218 creatures. The proof of
2026-10-11 was on a world under the `creatures` floor, and this one is not.

**`len_sd` has rejected 1 of 3 seeds of a world whose spread drains, and 3 of 3 seeds of a world with
no spread.**

- With no mutation of a body gene, in the world where a small body wins, the spread reads 0.56, 0.32,
  and 0.55. Seeds 1 and 3 pass. The spread there is what is left of the founders': a founder draws its
  length with a spread of 0.9. So the band cannot tell a spread that evolution holds from a spread
  that has not yet drained. With `--seeds 1` this band would not have rejected that world.
- The same world with mutation on reads 0.53, 1.16, and 0.99 and passes the band on every seed. So a
  length gene at its floor does not fail `len_sd` by itself.
- With no mutation and no spread among the founders, every body holds a length of 12.0 and the band
  rejects 3 of 3 seeds. That proof shows that the band can fail. It does not show where a spread that
  is too thin begins.
- The band did not change.

**`parts` is 3.0, as the plan said, and its proof is not the plan's.** The band is for a fall to the
least that a body needs.

- The proof is the harder input of the table. With no sense that works and parts that can only be
  lost, the count falls to 2.06 to 2.16 in a world of 1,282 to 1,446 creatures. The band rejects it on
  3 of 3 seeds.
- **The plan's input is not bad enough.** It lets a birth lose a part with a chance of 0.3 and never
  gain one, in a world that can still smell and see. It keeps 3.7 to 4.0 parts of the founder's 5 and
  passes every band on 3 of 3 seeds:

```
$ target/release/tidepool-headless gate-evolve --param mut_part_add=0 --param mut_part_dup=0 --param mut_part_remove=0.3
seed=1 creatures=1515 creatures_noscent=1493 creatures_noeye=1535 len=11.9 len_sd=1.91 parts=3.8 chemo=0.19 chemo_blind=0.00 eye=0.15 eye_blind=0.01 plans=6 speed_cv=0.32 PASS
seed=2 creatures=1377 creatures_noscent=1383 creatures_noeye=1477 len=11.6 len_sd=1.73 parts=4.0 chemo=0.24 chemo_blind=0.00 eye=0.18 eye_blind=0.01 plans=4 speed_cv=0.37 PASS
seed=3 creatures=1336 creatures_noscent=1307 creatures_noeye=1396 len=12.9 len_sd=1.52 parts=3.7 chemo=0.18 chemo_blind=0.00 eye=0.14 eye_blind=0.01 plans=5 speed_cv=0.34 PASS
gate-evolve 3/3 PASS
exit=0
```

- **What that run shows: selection holds the parts that pay against removal.** Where a sense reads, its
  parts stay at 0.14 to 0.24. In the blind run of that sense, which lives with 1,307 to 1,535
  creatures, they fall to 0.00 or 0.01. The kind of claim is "evolution uses it", on 3 seeds, one run
  each.
- This did not hold at the tuned defaults of Task 13, which had the part upkeep. The M2 audit read
  `parts` 2.01 to 2.54 for this input there, and the band failed (`findings/m2-audit.md`, finding H3).
- So the band does not reject a world that only loses parts. It rejects a world whose part count fell
  to the minimum.

**The gap bands are 0.10, not the 0.02 of the plan.** This is the one band value that Task 12 changed.

- In both proofs of the plan the two runs are the same world to the bit: `creatures_noscent` equals
  `creatures` in the scent proof, and `creatures_noeye` equals it in the eye proof. With no scent, or
  with eyes of no range, the input of the sense is 0 at every gain. So each gap is exactly 0.000.
  These proofs show that a gap band can fail. They do not show what chance does to a gap.
- The chance input measures that. Each sense reads at most a ten-thousandth of its input, so no brain
  can use it, and its three runs are three different worlds.
- **The band was set on the Start values of 2026-10-11.** There the scent gap read 0.008, 0.073, and
  -0.069, and the eye gap read -0.046, -0.041, and -0.095. At 0.02 that bad input passed the scent
  band on seed 2, with a sense that does nothing. So 0.02 was inside the noise. The largest of those
  6 chance gaps is 0.073, and the band is the next 0.05 above it: 0.10.
- **At the defaults of 2026-10-12 the chance input still fails both gap bands on 3 of 3 seeds.** The
  scent gap reads 0.008, 0.022, and -0.116. The eye gap reads -0.003, -0.015, and 0.008. The largest
  gap above zero is 0.022.
- What 0.10 does not cover: 6 gaps are a small sample, and the largest gap below zero is now -0.116. A
  chance gap of that size above zero would pass the band. What still protects the gate is that all 3
  seeds must pass. With `--seeds 1` it has less protection. The band did not change here. It is the
  owner's (`findings/m2-audit.md`, finding H3).

**`chemo_blind run died` and `eye_blind run died` have each rejected one seed of a living world.**

- In the `fert_radius=40` world, seed 2 holds 176 creatures with the sense and 100 without its
  direction. The check fired on that seed alone. Seeds 1 and 3 hold 156 and 161 without the
  direction, just over the line of 150.
- In the thin world with no scent, seed 2 holds 237 creatures with eyes that see and 121 with
  `eye_gain=0`. `eye_blind run died` fired on that seed alone. On all 3 seeds the run with blind eyes
  holds fewer creatures than the seeing run: 229, 121, and 234 against 312, 237, and 321. One run per
  seed.
- **The record of 2026-10-11 said that no input kills only the run with `eye_gain=0`.** On the Start
  values that run held more creatures than the seeing run in every world tried. That is not so at the
  defaults of 2026-10-12, in this world.
- Both checks also fire on 3 of 3 seeds of the `fert_radius=25` world, where the seeing run is under
  the floor too.
- Seed 3 of the `fert_radius=25` world shows what the check is for. The run with no direction is
  empty, so `chemo_blind` prints 0.00 and the scent gap reads 0.58 and passes its band. The seed fails
  on `chemo_blind run died`.

`plans` has no band and has rejected nothing. `speed_cv` has had a band since 2026-10-14 ("The
`speed_cv` band" below).

### The first reading of the M2 rules, not a trial

**A record of 2026-10-11, not the world of today.** `--m2` is deleted and the defaults have moved, so
the command below cannot be typed now and no command prints these rows at the defaults of
2026-10-12. The rows of today are at the top of "Gate-evolve".

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

### The long reading

`make gates-long` runs `target/release/tidepool-headless gate-evolve --seeds 1,4,5,6,8 --ticks 144000`:
the same gate and the same bands, read at 4 times the tick. The owner added it on 2026-10-12 (audit
finding H2), on seeds 1, 5, 8, and added seeds 4 and 6 the same day. **Run it before a milestone
closes. It is not in `make gates` and not in CI.** It took 10 minutes 22 seconds on the reference
machine, at a load average of 5.4 to 5.9. On seeds 1, 5, 8 it took 7 minutes.

The rows at the defaults of 2026-10-12, run on 2026-10-13 before the seed list became the target. The
rows of seeds 1, 5, 8 are the rows of 2026-10-12 digit for digit:

```
$ target/release/tidepool-headless gate-evolve --seeds 1,4,5,6,8 --ticks 144000
seed=1 creatures=1770 creatures_noscent=1717 creatures_noeye=1267 len=9.4 len_sd=1.30 parts=6.7 chemo=0.16 chemo_blind=0.00 eye=0.28 eye_blind=0.00 plans=5 speed_cv=0.24 speed=0.84 area=34.8 PASS
seed=4 creatures=1373 creatures_noscent=1405 creatures_noeye=1113 len=9.9 len_sd=1.41 parts=6.6 chemo=0.20 chemo_blind=0.01 eye=0.28 eye_blind=0.05 plans=4 speed_cv=0.22 speed=0.83 area=43.0 PASS
seed=5 creatures=1566 creatures_noscent=1595 creatures_noeye=1376 len=10.5 len_sd=1.24 parts=5.7 chemo=0.27 chemo_blind=0.01 eye=0.26 eye_blind=0.02 plans=4 speed_cv=0.29 speed=0.73 area=39.1 PASS
seed=6 creatures=1378 creatures_noscent=1364 creatures_noeye=1102 len=10.7 len_sd=1.76 parts=6.8 chemo=0.26 chemo_blind=0.01 eye=0.26 eye_blind=0.03 plans=8 speed_cv=0.28 speed=0.88 area=38.7 PASS
seed=8 creatures=1461 creatures_noscent=1285 creatures_noeye=1065 len=9.9 len_sd=1.29 parts=9.6 chemo=0.17 chemo_blind=0.01 eye=0.25 eye_blind=0.05 plans=4 speed_cv=0.26 speed=0.91 area=35.0 PASS
gate-evolve 5/5 PASS
exit=0
```

**The reading has rejected a bad world of the head, on 2026-10-13.** The input is the chance input of
the short gate: both senses read almost nothing, so no body gains from one. The reason was written
before the run. It fails both gap bands on 5 of 5 seeds, at a load average of 3.4 to 6.5, in 532 s:

```
$ target/release/tidepool-headless gate-evolve --seeds 1,4,5,6,8 --ticks 144000 --param chemo_gain=0.0001 --param eye_gain=0.0001
seed=1 creatures=1449 creatures_noscent=1243 creatures_noeye=1322 len=16.5 len_sd=1.82 parts=3.0 chemo=0.00 chemo_blind=0.01 eye=0.01 eye_blind=0.04 plans=4 speed_cv=0.29 speed=1.33 area=92.4 FAIL(chemo_gap=-0.011 < 0.1, eye_gap=-0.022 < 0.1)
seed=4 creatures=965 creatures_noscent=1005 creatures_noeye=1059 len=18.1 len_sd=2.71 parts=4.3 chemo=0.02 chemo_blind=0.01 eye=0.04 eye_blind=0.05 plans=3 speed_cv=0.26 speed=1.48 area=129.4 FAIL(chemo_gap=0.010 < 0.1, eye_gap=-0.011 < 0.1)
seed=5 creatures=1267 creatures_noscent=1212 creatures_noeye=1201 len=17.6 len_sd=2.82 parts=4.1 chemo=0.03 chemo_blind=0.01 eye=0.02 eye_blind=0.00 plans=4 speed_cv=0.25 speed=1.55 area=117.8 FAIL(chemo_gap=0.021 < 0.1, eye_gap=0.011 < 0.1)
seed=6 creatures=1137 creatures_noscent=1098 creatures_noeye=1029 len=16.5 len_sd=2.30 parts=4.8 chemo=0.02 chemo_blind=0.02 eye=0.03 eye_blind=0.03 plans=6 speed_cv=0.30 speed=1.36 area=103.4 FAIL(chemo_gap=-0.003 < 0.1, eye_gap=0.005 < 0.1)
seed=8 creatures=997 creatures_noscent=1030 creatures_noeye=1100 len=17.0 len_sd=2.60 parts=3.9 chemo=0.00 chemo_blind=0.00 eye=0.02 eye_blind=0.01 plans=4 speed_cv=0.28 speed=1.63 area=147.5 FAIL(chemo_gap=0.003 < 0.1, eye_gap=0.007 < 0.1)
gate-evolve 0/5 FAIL
exit=1
```

The 10 chance gaps at tick 144,000 read from -0.022 to 0.021, against a band of 0.10. At tick 36,000
the same input read from -0.116 to 0.022 on 3 seeds. In this world the senses are gone (`chemo` 0.00
to 0.03, `eye` 0.01 to 0.04) and the bodies are long: `len` 16.5 to 18.1.

**Still weak: an input that passes at tick 36,000 and fails at tick 144,000.** That is what the long
reading is for. One candidate, from the second audit (`findings/m2-audit-2.md`, finding M4):
`chemo_gain=1`, a quarter of the gain of the scent direction. It passes `gate-health` and `gate-evolve`
at tick 36,000 on seeds 1, 2, 3 (the auditor's runs). At tick 144,000 it fails on seed 8 alone, in 635 s:

```
$ target/release/tidepool-headless gate-evolve --seeds 1,4,5,6,8 --ticks 144000 --param chemo_gain=1
seed=1 creatures=1739 creatures_noscent=1717 creatures_noeye=1235 len=9.8 len_sd=1.09 parts=7.2 chemo=0.17 chemo_blind=0.00 eye=0.27 eye_blind=0.01 plans=7 speed_cv=0.24 speed=0.82 area=31.5 PASS
seed=4 creatures=1509 creatures_noscent=1405 creatures_noeye=977 len=10.3 len_sd=1.85 parts=7.0 chemo=0.22 chemo_blind=0.01 eye=0.28 eye_blind=0.03 plans=5 speed_cv=0.28 speed=0.88 area=41.0 PASS
seed=5 creatures=1748 creatures_noscent=1595 creatures_noeye=1215 len=10.3 len_sd=1.56 parts=7.7 chemo=0.18 chemo_blind=0.01 eye=0.28 eye_blind=0.03 plans=5 speed_cv=0.31 speed=0.76 area=37.6 PASS
seed=6 creatures=1370 creatures_noscent=1364 creatures_noeye=1037 len=9.2 len_sd=1.15 parts=5.8 chemo=0.20 chemo_blind=0.01 eye=0.31 eye_blind=0.02 plans=6 speed_cv=0.28 speed=0.79 area=45.0 PASS
seed=8 creatures=1289 creatures_noscent=1285 creatures_noeye=933 len=11.5 len_sd=2.34 parts=5.4 chemo=0.05 chemo_blind=0.01 eye=0.26 eye_blind=0.03 plans=5 speed_cv=0.23 speed=0.76 area=50.7 FAIL(chemo_gap=0.045 < 0.1)
gate-evolve 4/5 FAIL
exit=1
```

This does not show that `chemo_gain=1` is a bad world. Four seeds hold the sense as the default world
does. On seed 8 the same input passes at tick 72,000 with `chemo=0.21`, and the default world reads
`chemo=0.12` there, a gap of 0.12 against the band of 0.10, and then 0.17 at tick 144,000. So the
mean of one seed moves by 0.1 or more between two readings in both worlds, and the fail of seed 8 is
inside that. One more input was tried by the auditor and fails at tick 36,000 already: `eye_cost=3`.

**The older proof is a record.** The world with the upkeep of a part failed this reading twice, on
seeds 1, 5, 8, and `part_upkeep` is deleted, so the command cannot be typed at the head:

- At the defaults of 2026-10-11 (commit f5b7381, `findings/m2-audit.md` check 14), seeds 5 and 8 fail:
  `FAIL(chemo_gap=0.037 < 0.1)` and `FAIL(chemo_gap=0.014 < 0.1, eye_gap=0.009 < 0.1)`. Seed 1 passes
  at 0.13. On seeds 1 to 10 the reading rejects 6.
- With `--param part_upkeep=0.0001`, half of that upkeep (`findings/m2-senses.md`, trial 12), seed 5
  fails: `FAIL(chemo_gap=0.085 < 0.1)`. Exit 1.

To run that input again, check out commit f5b7381.

**Why seeds 4 and 6 are in the target.** In that old bad world seeds 5 and 8 failed the scent gap at
tick 36,000 too. The seeds that passed at tick 36,000 and failed at tick 144,000 are 4 and 6
(`chemo_gap=0.016` and `0.067`, the same check 14). They show that the long reading sees what the
short one does not.

### The brain bands (M3)

`gate-evolve --brain` reads three more bands at tick 144,000. They are in `make gates-long` only from
the close of the M3 retune, and not in `make gates` or CI. **The owner confirmed them on 2026-10-15,
and from that day the third band reads `variety_wired`** (the proof is below). The rows, the
hypothesis, and the limits are in `findings/m3-brains.md`.

| Band | Fails under | Bad input of the head | It read | The good world read |
|---|---|---|---|---|
| `hidden` | 1.0 | `neuron_upkeep=0.01 conn_upkeep=0.003` with the Start values | 0.03, 0.03, 0.04. `0/3`, exit 1 | 3.52, 3.04, 3.85 |
| `conns` | 15.0 | The same | 2.7, 1.4, 2.2. `0/3`, exit 1 | 36.7, 34.7, 42.6 |
| `variety` | 2.0 | The four structural rates at 0 | 1.0, 1.0, 1.0. `0/3`, exit 1 | 12.1 to 21.2 on seeds 1, 4, 5, 6, 8 |

Seeds 1, 4, 5, one run each. The Start values are written out as `--param` flags in every command,
because the defaults were still at their Off values.

**The proofs again at the M3 defaults** (2026-10-14, by the fresh-context audit at `77a096e`,
`findings/m3-audit.md` finding M1). Seeds 1, 4, 5 at tick 144,000 with `--brain`:

| Band | Bad input | It read | Result |
|---|---|---|---|
| `hidden` | `--param neuron_upkeep=0.01 --param conn_upkeep=0.003` | 0.02, 0.04, 0.04 | `0/3`, exit 1 |
| `conns` | The same | 8.1, 8.7, 7.9 | `0/3`, exit 1. Seeds 1 and 5 pass both sense gaps, so there the brain bands are the only rejector |
| `variety` | The four structural rates at 0 | 1.0, 1.0, 1.0 | `0/3`, exit 1, and no other band fails |

**The band reads `variety_wired` from 2026-10-15** (the owner's decision: a cross can leave a donor's
hidden genes unwired, and `variety` counts them). The band stays at 2.0. `variety` is printed with no
band. The proof again, at `869fc20`, seeds 1, 4, 5 at tick 144,000 with `--brain`, load 19 to 21:

```
$ target/release/tidepool-headless gate-evolve --brain --ticks 144000 --seeds 1,4,5 --param mut_conn_add=0 --param mut_conn_remove=0 --param mut_neuron_add=0 --param mut_neuron_remove=0
seed=1 ... hidden=4.00 conns=57.3 shapes=1 shapes_raw=2 variety=1.0 variety_wired=1.0 FAIL(variety_wired=1.0 < 2)
seed=4 ... hidden=4.00 conns=53.0 shapes=1 shapes_raw=5 variety=1.0 variety_wired=1.0 FAIL(variety_wired=1.0 < 2)
seed=5 ... hidden=4.00 conns=57.2 shapes=1 shapes_raw=2 variety=1.0 variety_wired=1.0 FAIL(variety_wired=1.0 < 2)
gate-evolve 0/3 FAIL
```

Exit 1. `variety_wired` is the only band that fails on each seed. The good world, `make gates-long`
at `91b9619` the same day (load 21 at the start, 5.5 at the end, 17 minutes): 5 of 5, exit 0, every
other column digit for digit as at the M3 exit.

| Seed | `variety` | `variety_wired` |
|---|---|---|
| 1 | 24.9 | 24.9 |
| 4 | 29.9 | 21.8 |
| 5 | 23.1 | 19.1 |
| 6 | 39.1 | 38.5 |
| 8 | 15.7 | 12.2 |

What the bands do not show:
- **Use.** `hidden - hidden_null` reads +3.18, -0.65, +1.10 in the good world and +1.45, -0.87, +0.92
  by chance. It has no band.
- The costly world also fails a sense gap on every seed, so `conns` there partly reads the senses.
- `hidden` and `conns` pass a world where a hidden neuron sends nothing.
- `variety` replaced a band on `shapes` (fails under 2) at the close of stage 1 of the retune.
  `shapes` can fall as variety rises, because a shape that under 5% hold is not counted: it rejected
  seed 3 at `shapes=1`, `variety=27.3` (`findings/m3-tuning.md` Part 3). `shapes` and `shapes_raw`
  are printed and have no band.

### The `speed_cv` band (M3)

From 2026-10-14 `gate-evolve` fails a seed whose `speed_cv` reads under 0.10, in `make gates` and
in the long gate. **The owner confirmed it on 2026-10-15.** The default world read 0.22 to
0.25 at tick 36,000 and 0.23 to 0.28 at tick 144,000 on seeds 1, 4, 5, 6, 8 (`findings/m3-tuning.md`
Part 5). The bad input sets `mut_rate`, `mut_shape_rate`, `mut_part_add`, `mut_part_remove`, and
`mut_part_dup` to 0. That world also fails both sense gaps, so this band is not its only rejector.

The proof on `main` on 2026-10-14, at tick 36,000 (load 5.3):

```
$ target/release/tidepool-headless gate-evolve --param mut_rate=0 --param mut_shape_rate=0 --param mut_part_add=0 --param mut_part_remove=0 --param mut_part_dup=0
seed=1 creatures=1408 creatures_noscent=1459 creatures_noeye=1487 len=11.8 len_sd=0.66 parts=5.0 chemo=0.47 chemo_blind=0.50 eye=0.20 eye_blind=0.20 plans=1 speed_cv=0.05 speed=1.35 area=66.2 hidden=4.57 conns=62.6 shapes=5 shapes_raw=4 variety=28.6 FAIL(speed_cv=0.049 < 0.1, chemo_gap=-0.029 < 0.1, eye_gap=0.000 < 0.1)
seed=2 creatures=1257 creatures_noscent=1368 creatures_noeye=1326 len=11.9 len_sd=0.54 parts=5.0 chemo=0.47 chemo_blind=0.48 eye=0.20 eye_blind=0.20 plans=1 speed_cv=0.06 speed=1.35 area=68.2 hidden=4.09 conns=60.4 shapes=4 shapes_raw=0 variety=32.3 FAIL(speed_cv=0.058 < 0.1, chemo_gap=-0.006 < 0.1, eye_gap=0.000 < 0.1)
seed=3 creatures=1325 creatures_noscent=1246 creatures_noeye=1335 len=11.6 len_sd=0.72 parts=5.0 chemo=0.47 chemo_blind=0.47 eye=0.20 eye_blind=0.20 plans=1 speed_cv=0.06 speed=1.36 area=62.8 hidden=4.25 conns=62.0 shapes=3 shapes_raw=2 variety=28.6 FAIL(speed_cv=0.061 < 0.1, chemo_gap=-0.005 < 0.1, eye_gap=0.000 < 0.1)
gate-evolve 0/3 FAIL
exit=1
```

With the band in, `make gates` exits 0 and its rows equal those before it, and the long gate's
rows read 0.23 to 0.28.

## Probes

Built by M2 Task 12. Each runs the default world and prints what it reads. None has a band, and none
has rejected anything. The rows below are seed 1 at the defaults of 2026-10-12, and they ran on that
day. The rows recorded before them were on the Start values of the M2 plan, with the deleted flag
`--m2`.

**`probe-plants [--seed n] [--ticks 36000] [--param ...]`.** One row every 4,000 ticks: plants alive,
plant deaths and seedlings since the last row, 32-unit cells that hold a plant, the mean of
`reserve / cap`, and creatures alive. The first and the last row of 9:

```
$ target/release/tidepool-headless probe-plants --seed 1
seed=1 tick=4000 plants=2214 plant_deaths=0 seedlings=1014 cells=741 reserve01=0.41 creatures=1265
seed=1 tick=36000 plants=2229 plant_deaths=0 seedlings=0 cells=743 reserve01=0.31 creatures=1448
```

`plant_deaths` reads 0 on all 9 rows. Since the grazing rule of Task 13 a bite cannot take a plant
under its death reserve (`findings/m2-tuning.md`). A record: on the M1 world with four more neurons
per brain the probe read 732 cells at tick 4,000 and 508 at tick 36,000, and the scratch census of
the M1 audit read 727 and 480 (`findings/m1-audit.md`, finding F2).

**`probe-heirs [--seed n] [--pick 3000] [--param ...]`.** It runs to the pick tick, takes every creature
alive then, and follows the world to the death of each. It counts heirs as `write_heirs` would after a
possession at the pick tick with the brain left to drive: the living descendants through living
parents get the mark at the pick, and each later child gets the mark of its parent. A test holds the
count to `World::possess` and `World::write_heirs` on about 10 picks, and it failed when the probe was
made to skip the living descendants.

```
$ target/release/tidepool-headless probe-heirs --seed 1
seed=1 pick=3000 group=all picks=1258 heir=0.52 median_ticks=958
seed=1 pick=3000 group=adults picks=801 heir=0.67 median_ticks=1144
seed=1 pick=3000 group=juveniles picks=457 heir=0.24 median_ticks=553
```

A record of 2026-10-11, on the M1 world with four more neurons per brain: the probe read 0.62 for
adults, 0.37 for all 590 picks, and 0.16 for juveniles. The M1 audit read 0.37 for adults at pick
tick 3,000 on seed 1, 0.26 for all picks, and 0.17 for juveniles (finding F5). The probe counts the
children that were alive at the pick, and the audit did not: possessing a body now marks them
(decision 2). A juvenile has no child at the pick, so the two counts agreed for it. That was the
brain's result, not a player's. The claim is "the mechanism fires": the mark reaches the living
descendants. The rows above are a different world, so they are not a pair with the audit's.

**`probe-crowd [--seed n] [--param ...]`.** At tick 3,000 it possesses the adult with the most bodies
within 30 units, holds full thrust for 200 ticks, and prints its mean speed over the top speed of the
same body alone, by rule S3.

```
$ target/release/tidepool-headless probe-crowd --seed 1
seed=1 tick=3000 uid=876 neighbours=22 held=200 mean_speed=0.66 top_speed=1.11 ratio=0.59
```

**`probe-plans [--seed n] [--ticks 36000] [--param ...]`.** The 8 most common plans with their share,
and the means over the bodies that hold each: the length gene, the top speed, the turn rate in radians
per tick at full thrust and top speed, and the summed angle of the eye cones in radians. The first
line and the first 2 plans of 54:

```
$ target/release/tidepool-headless probe-plans --seed 1
seed=1 tick=36000 creatures=1448 plans=54
seed=1 plan=flagellum+cilia+filter+chemo+eye share=0.35 len=11.3 top_speed=1.14 turn_rate=0.111 eye_angle=2.77
seed=1 plan=flagellum+cilia+2filter+chemo+fin+eye share=0.12 len=11.8 top_speed=0.70 turn_rate=0.092 eye_angle=2.71
```

**`probe-census [--seeds 1,2,3] [--ticks 36000] [--every 12000] [--param ...]`.** Added on 2026-10-12
for findings M3 and M4 of the M2 audit: the tuning record read these numbers from a scratch census
that was not in the repo. It runs the default world of each seed, which is the world that
`gate-evolve` runs as given, and prints one row for each seed at each multiple of `--every`.
`--every` is from 1 to `--ticks`. The run stops at the last multiple. It has no band and it has
rejected nothing.

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
| `no_chemo`, `no_eye` | The share of the creatures with no chemoreceptor part, and the share with no eye part. Added on 2026-10-13 (`findings/m2-audit-2.md`, finding M3): a mean part sum does not show how many bodies hold the part. The rows on record before that date end at `reserve01` |

Every mean but `reserve01` is over the living creatures. A mean over nobody prints as `NaN`, not as 0.
`creatures`, `len`, `parts`, `chemo`, and `eye` are the numbers that `gate-evolve` prints for its
seeing run at the same tick, and `creatures`, `plants`, and `chemo` at tick 12,000 are those of
`gate-health`. Three tests in `crates/headless/src/probes.rs` hold the columns to their fields. Two
failed when the probe was broken: with `senseless` made to read the eye alone, and with each part
column made to read the next kind.

```
$ target/release/tidepool-headless probe-census --seeds 1 --ticks 36000
seed=1 tick=12000 creatures=1319 plants=2229 juv=0.37 len=12.1 wid=0.51 egg=0.68 old=4744 area=74.8 flagellum=0.57 cilia=0.42 filter=0.67 chemo=0.48 fin=0.00 eye=0.21 parts=5.2 senseless=0.00 speed=1.21 turn=0.105 eaten=152.57 reserve01=0.36
seed=1 tick=24000 creatures=1352 plants=2229 juv=0.38 len=11.8 wid=0.51 egg=0.67 old=4522 area=71.6 flagellum=0.57 cilia=0.41 filter=0.73 chemo=0.40 fin=0.00 eye=0.22 parts=5.2 senseless=0.00 speed=1.18 turn=0.108 eaten=149.97 reserve01=0.35
seed=1 tick=36000 creatures=1448 plants=2229 juv=0.38 len=11.5 wid=0.48 egg=0.66 old=4203 area=64.5 flagellum=0.56 cilia=0.41 filter=0.80 chemo=0.36 fin=0.02 eye=0.24 parts=5.8 senseless=0.00 speed=1.07 turn=0.108 eaten=149.77 reserve01=0.31
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

### The predation bands (M4, provisional)

`gate-health` and `gate-evolve --brain` print `hunt_lo`, `hunt_hi`, `prey_lo`, `kills_late`,
`flesh_late` on every row ("How the gate reads" in the M4 plan). A band is judged only under
`--predation`, which is a usage error while every band is unset, so the flag can never pass a world
that nothing judged. **Where they are judged:** `make gates-long` passes `--brain --predation`, so the
two long bands (`kills_late` 20, `flesh_late` 0.01 at 144,000) are judged there. `make gates` and CI
pass no `--predation`: the four 12,000-tick bands judge nothing anywhere, because the shipped world
fails `flesh_late` 0.01 and the share bands fail at 144,000 (the owner's finding,
`findings/m4-tuning.md`). Choice C6 put the 12,000-tick reading in CI; it is not there until the
owner sets the bands. The proofs, at `832527f` and `8435888`:

| Band | Where | Fails | Bad input | It read | Good world |
|---|---|---|---|---|---|
| `kills_late` | 12,000 | under 20 | the Start set with `bite_rate=0` | 0, 0, 0 | 43 to 83 (ratio 3), 2,005 to 2,562 (ratio 1.15) |
| `flesh_late` | 12,000 | under 0.01 | the same | 0.000 ×3 | 0.001 to 0.002 (ratio 3): **fails**, 0.17 to 0.21 (ratio 1.15) |
| `hunt_hi` | 12,000 | over 0.8 | `founder_jaw=1 bite_mass_ratio=0` | 1.000 ×3 | 0.19 to 0.29 (ratio 3), 1.000 (ratio 1.15) |
| `prey_lo` | 12,000 | under 150 | the same | 0 ×3 | 925 to 1,224 (ratio 3), 0 (ratio 1.15) |
| `hunt_lo` | 12,000 and 144,000 | not a gate | `founder_jaw=0`; `bite_rate=0` at 144,000 | 0.03 to 0.16; 0.04 to 0.96 | a jaw drifts whether or not it bites |
| `kills_late` | 144,000 | under 20 | `bite_rate=0`, seeds 1, 4, 5, 6, 8 | 0 ×5 | 240 to 690 |
| `flesh_late` | 144,000 | under 0.01 | the same | 0.000 ×5 | 0.022 to 0.037 |
| `hunt_hi`, `prey_lo` | 144,000 | not set | | | the default world reads 0.92 to 1.00 and 0 to 90 |

The commands and every row: `findings/m4-gates.md` (12,000) and `findings/m4-tuning.md` Part 2
(144,000). The `flesh_late` band at 12,000 was set at 0.01 before the good world was read, and the
shipped world reads 0.001 to 0.002 there: it is left as set, with the rows, for the owner.

**The rejection proofs with the bands set** (the rows above printed PASS because their runs had no
`--predation`): see "Rejection with the flag" below, added after the final proof.

**What the eye gap measures since M4.** The eye's third input, the jaw size of the nearest body in
the cone, is not scaled by `eye_gain`, so the blind arm (`eye_gain=0`) still sees teeth and its flee
wires still work. `eye_gap` now reads what the eye's food and body inputs add over an eye that sees
teeth only. Scaling the jaw input by `eye_gain` would restore the M3 meaning and is a rule change,
the owner's (`findings/m4-audit-2.md` item 5).
