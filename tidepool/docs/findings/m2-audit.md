# M2 audit: Bodies

Date: 2026-10-12. Head: `f5b7381`. A fresh-context audit. The auditor fixed nothing.

Read: `AGENTS.md`, `docs/roadmap.md`, `docs/design.md`, `docs/architecture.md`, `docs/gates.md`,
`docs/findings/m2-eyes.md`, `docs/findings/m2-tuning.md`, and the code and tests under `tidepool/`.
Not read: anything in `docs/plans/`, and `HANDOFF.md`. `docs/decisions/INDEX.md` was read only after
sections 3 to 6 were written, to mark which findings are already a logged decision.

Every simulation ran alone. Other projects loaded the machine: the load average was 2.6 to 8 through
the audit, and each timing below names its own. A count of creatures does not depend on the load. A ticks-per-second figure does.

## Result

**M2 does not meet its roadmap exit at `f5b7381`.** Two things stand against it.

1. **The gates.** Rule 1 of `roadmap.md` makes the exit "a person playing the build, plus the gates".
   `make check` exits 0. `make gates` exits 2: `gate-evolve` reads 2 of 3, on the scent gap of seed 1
   (0.079 against 0.10). `AGENTS.md` and `m2-tuning.md` say so, and the audit read the same rows digit
   for digit. The play check is not the auditor's and was not done.
2. **Risk R1, which the exit sentence names, shows in a longer run.** The gate reads tick 36,000. The
   audit read tick 144,000 on seeds 1 to 10, one run each. Evolution lost the chemoreceptor on 6 of 10
   seeds. On seed 8 it lost the eyes too: at least 76% of that world has no sense part, and 24% of it
   is the two-part body. The `parts` band reads 3.3 there and passes (section 4, check 14).

The three clauses of the exit sentence, taken alone:

- **Bodies differ in plan. Shown, with no band.** `probe-plans --seed 1` reads 48 plans among 1,470
  creatures at tick 36,000, and the commonest holds 40%. `gate-evolve` reads 4, 3, and 4 plans that 5%
  of the living hold.
- **The difference changes how they move and what they see. Shown for motion on one seed, with no
  band.** The audit drove 61 adults of that world alone at full thrust. Top speed ran from 0.41 to
  1.50 units per tick and turn rate from 0.046 to 0.175 radians per tick. The formula of `probe-plans`
  matched the motor to 0.01% in speed. What a body sees was read from the eye genes only.
- **Part count does not collapse to the minimum. Shown at tick 36,000 on 10 of 10 seeds, and at tick
  144,000 on 9 of 10.** `parts` reads 4.0 to 5.4 at tick 36,000 against a band of 3.0. A founder has
  5. At tick 144,000 it reads 4.8 to 6.3 on nine seeds and 3.3 on seed 8.

The rest of the audit:

- **Proofs.** 31 failure proofs of `gates.md` repeated. 27 held and 4 did not: the tuned defaults
  moved the worlds that they were recorded on.
- **Claims.** Every number of `m2-tuning.md` that the audit ran again matched digit for digit: 12
  checks. Seven claims are worded more strongly than their evidence.
- **Tests.** 9 of 22 deliberate breaks of an M2 rule left every test green. One of them removes the
  brain upkeep, which now holds the size of the body.
- **Save and load.** No field is missing.

## 1. `make check` and `make gates`

`make check` exits **0**. Load average 5.5 at the start and 6.6 at the end. 14 Rust test groups pass
with 209 tests and no failure. Vitest: 7 files and 87 tests pass. The last lines:

```
cargo fmt --all -- --check
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace
test result: ok. 1 passed; 0 failed ...     (headless)
test result: ok. 30 passed; 0 failed ...    (sim, unit tests)
test result: ok. 8 passed; 0 failed ...     (brain)
test result: ok. 15 passed; 0 failed ...    (control)
test result: ok. 5 passed; 0 failed ...     (determinism)
test result: ok. 25 passed; 0 failed ...    (energy)
test result: ok. 12 passed; 0 failed ...    (eye)
test result: ok. 20 passed; 0 failed ...    (genome)
test result: ok. 16 passed; 0 failed ...    (motor)
test result: ok. 4 passed; 0 failed ...     (params)
test result: ok. 10 passed; 0 failed ...    (plants)
test result: ok. 18 passed; 0 failed ...    (repro)
test result: ok. 32 passed; 0 failed ...    (snapshot)
test result: ok. 13 passed; 0 failed ...    (world)
pnpm exec tsc --noEmit
pnpm exec prettier --check src tests scripts
All matched files use Prettier code style!
pnpm exec eslint .
pnpm exec vitest run
 Test Files  7 passed (7)
      Tests  87 passed (87)
exit=0
```

`make gates` exits **2**. Load average 6.3 at the start and 6.0 at the end, so the two throughput
figures are lower bounds.

```
target/release/tidepool-headless bench
settled tick=12000 creatures=1321 plants=2229
bench creatures=1327 median_tps=3328 floor=2400 PASS
node scripts/bench-wasm.mjs
settled tick=12000 creatures=1321 plants=2229
bench-wasm creatures=1327 median_tps=3070 floor=2400 PASS
target/release/tidepool-headless gate-health
seed=1 creatures=1321 min_late=1170 plants=2229 births_late=2187 max_gen=14 mean_chemo=0.38 parked=0.00 first_bud=747 juv_starved=0.53 to_bud=0.33 PASS
seed=2 creatures=1274 min_late=1110 plants=2076 births_late=2223 max_gen=16 mean_chemo=0.31 parked=0.00 first_bud=745 juv_starved=0.52 to_bud=0.32 PASS
seed=3 creatures=1166 min_late=1066 plants=1965 births_late=1996 max_gen=16 mean_chemo=0.43 parked=0.00 first_bud=712 juv_starved=0.52 to_bud=0.33 PASS
gate-health 3/3 PASS
target/release/tidepool-headless gate-evolve
seed=1 creatures=1470 creatures_noscent=1511 creatures_noeye=1412 len=11.8 len_sd=1.47 parts=5.2 chemo=0.14 chemo_blind=0.06 eye=0.22 eye_blind=0.04 plans=4 speed_cv=0.23 FAIL(chemo_gap=0.079 < 0.1)
seed=2 creatures=1361 creatures_noscent=1409 creatures_noeye=1294 len=12.8 len_sd=1.62 parts=4.4 chemo=0.15 chemo_blind=0.01 eye=0.18 eye_blind=0.05 plans=3 speed_cv=0.27 PASS
seed=3 creatures=1390 creatures_noscent=1324 creatures_noeye=1308 len=11.9 len_sd=1.75 parts=5.1 chemo=0.28 chemo_blind=0.01 eye=0.21 eye_blind=0.05 plans=4 speed_cv=0.38 PASS
gate-evolve 2/3 FAIL
make: *** [gates] Error 1
exit=2
```

Every row of `gate-health` and `gate-evolve` equals the row in "The gates at the close" of
`m2-tuning.md`.

## 2. The failure proofs of `gates.md`

**31 proofs repeated. 27 held. 4 did not. 1 was not run (CI).** A proof holds when the gate rejects
the bad input on the gate or the band that the proof names.

`gates.md` says that a command recorded with `--m2` "now runs the same world". That was true when
Task 13 wrote the Start values. It is not true at the head: six defaults changed after that and the
grazing rule came in. `--m2` itself is a usage error, exit 2. So every `gate-health` and `gate-evolve`
proof below ran at the tuned defaults, and the numbers differ from the recorded ones.

### The fast gates: 10 of 10 held

| Gate | Bad input | Output seen | Held |
|---|---|---|---|
| Clippy banned methods | `x.sin()`, `(x as f64).sin()`, `x.ln()` added to `crates/sim/src/lib.rs` | ``error: use of a disallowed method `f32::sin` ``, `` `f64::sin` ``, `` `f32::ln` ``, exit 101 | Yes |
| Import layers | `src/render/x.ts` with `import '../app/main';` | `'../app/main' import is restricted from being used by a pattern`, exit 1 | Yes |
| Import layers, `src/` root | `src/x.ts` with the two imports | The same line for `'./app/main'` and `'./worker/host'`, exit 1 | Yes |
| No dynamic import | `src/render/y.ts` with `import('../protocol')` | `No dynamic import() in src`, exit 1 | Yes |
| Crate count | Scratch crate `crates/x`, added to `crates/sim/Cargo.toml` | `error: the cargo workspace must hold only tidepool-sim and tidepool-headless`, the 3 names, `make: *** [check] Error 1`, exit 2 | Yes |
| Rust format | `pub fn  ugly( )->u32{1}` in `lib.rs` | `Diff in` the path, exit 1 | Yes |
| TypeScript format | `src/z.ts`, two ugly lines | `[warn] src/z.ts`, exit 1 | Yes |
| Type check | `src/x.ts` with `export const n: number = 'a';` | `error TS2322`, exit 2 | Yes |
| Snapshot round trip | The `vy` line removed from `Creatures::save` and `Creatures::load` | 19 of 32 tests fail, exit 101. `vy is not in the hash`. `load_then_run_equals_unbroken_run`: `left: 3894520213`, `right: 487669474` | Yes |
| Native equals WASM | The `wasm32` change to `vx[0]` in `World::tick`, then `make wasm` | All 3 seeds fail. Seed 1: `expected 1821161952 to be 244553807` | Yes |

The snapshot row of `gates.md` says 19 of 31 and gives older hashes. The count is now 32 tests. After
each proof the file was restored and `git status --short` was empty. After the WASM proof the clean
`.wasm` was built again and `tests/determinism.test.ts` passed.

### Throughput: 4 of 4 held

| Command | Output seen | Held |
|---|---|---|
| `bench --floor 1000000000` | `bench creatures=1327 median_tps=3329 floor=1000000000 FAIL`, exit 1 | Yes |
| `node scripts/bench-wasm.mjs --floor 1000000000` | `bench-wasm creatures=1327 median_tps=3104 floor=1000000000 FAIL`, exit 1 | Yes |
| `bench --reference 5000` | `VOID: population fell`, exit 1 | Yes |
| `node scripts/bench-wasm.mjs --reference 5000` | `VOID: population fell`, exit 1 | Yes |

`--settle 200` is void on both benches too: `settled tick=200 creatures=688 plants=1394`. Load average
5.6 to 6.1.

### Health gate: 6 of 7 held

| Bad input | Row at the head | Held |
|---|---|---|
| `--param plant_growth=0` | Every seed: `creatures=0`, `plants` 1,278, 1,288, 1,262. `gate-health 0/3 FAIL`, exit 1 | Yes |
| `--param basal=0.01` | Every seed: `creatures=0`. `0/3 FAIL`, exit 1 | Yes |
| `--seeds 1 --ticks 12000 --param mut_rate=0 --param mut_weight_rate=0` | `creatures=1144 ... max_gen=21 ... PASS`, exit 0 | **No.** Recorded: `FAIL(max_gen=7 < 8)` |
| `--seeds 1 --param fert_blobs=1 --param fert_radius=20` | `creatures=2 min_late=1 plants=6 births_late=5 max_gen=6`, 5 bands fail, exit 1 | Yes |
| The world of 8,192 plants | `plants=8192 > 7000`, exit 1 | Yes |
| The world with no upkeep | `creatures=4096 > 3000, max_gen=3 < 8, parked=0.96 > 0.25`, exit 1. `births_late` reads 429 and no longer fails here | Yes |
| `--seeds 1 --ticks 36000 --param chemo_gain=0 --param part_upkeep=0.001 --param mut_rate=0.5 --param mut_sigma=0.2` | `creatures=877 ... FAIL(mean_chemo=0.03 < 0.15)`, exit 1 | Yes |

- **The third proof of the plan passes now.** With no mutation the tuned world reaches generation 21
  in 12,000 ticks. `max_gen` still rejects two other worlds above, one of them with 4,096 creatures.
- Every band has still rejected something at the head, on each side that it has.
- `gate-health --param chemo_gain=0` passes 3 of 3, as recorded, with `mean_chemo` 0.28, 0.24, 0.28.
  The record reads 0.47, 0.48, 0.49. In the tuned world the gene falls faster with the direction
  blind. The seeing world reads 0.38, 0.31, 0.43.
- Usage errors exit 2: an unknown parameter, a value outside its range, and a seed that is not a
  number.

### `gate-evolve`: 7 of 10 held

Each run is 9 runs of 36,000 ticks and took 75 to 161 seconds.

| Band | Bad input | Reading on seeds 1, 2, 3 at the head | Recorded | Held |
|---|---|---|---|---|
| `creatures` | `fert_radius=40` | 175, 159, 176 | 0, 12, 2 | **No.** No seed is under 150 |
| `len` | `upkeep_curve=0 intake_curve=0 motor_curve=0 push_mass=0` | 7.14, 7.64, 7.06 | 6.44, 6.03, 6.11 | Yes, 3 of 3 |
| `len_sd` | The same run | 0.91, 1.05, 0.90 | 0.78, 0.17, 0.46 | **No.** 0 of 3 |
| `len_sd` | The same and `mut_rate=0` | 0.31, 0.32, 0.35 | 0.55, 0.43, 0.27 | Yes, 3 of 3 |
| `parts` | `mut_part_add=0 mut_part_dup=0 mut_part_remove=0.3 scent_deposit=0 eye_range=0` | 2.09, 1.90, 1.94 | 2.15, 2.03, 2.06 | Yes, 3 of 3 |
| Scent gap | `scent_deposit=0` | 0.000, 0.000, 0.000 | The same | Yes, 3 of 3 |
| Eye gap | `eye_range=0` | 0.000, 0.000, 0.000 | The same | Yes, 3 of 3 |
| Both gaps | `chemo_gain=0.0001 eye_gain=0.0001` | Scent: 0.031, 0.019, -0.016. Eye: -0.052, 0.000, 0.003 | Scent: 0.008, 0.073, -0.069. Eye: -0.046, -0.041, -0.095 | Yes, 3 of 3 for each |
| `chemo_blind run died` | `--ticks 12000 --param fert_blobs=3` | `creatures_noscent` 261, 231, 223 | 128, 150, 164 | **No.** No blind run is under 150 |
| `eye_blind run died` | `fert_radius=40` | `creatures_noeye` 185, 141, 170 | 22, 41, 24 | Yes, 1 of 3 |

The rows of the first proof:

```
$ target/release/tidepool-headless gate-evolve --param fert_radius=40
seed=1 creatures=175 creatures_noscent=102 creatures_noeye=185 len=12.1 len_sd=1.16 parts=5.5 chemo=0.46 chemo_blind=0.29 eye=0.22 eye_blind=0.12 plans=6 speed_cv=0.30 FAIL(chemo_blind run died, eye_gap=0.096 < 0.1)
seed=2 creatures=159 creatures_noscent=75 creatures_noeye=141 len=11.7 len_sd=1.85 parts=5.4 chemo=0.49 chemo_blind=0.25 eye=0.21 eye_blind=0.12 plans=4 speed_cv=0.24 FAIL(chemo_blind run died, eye_gap=0.088 < 0.1, eye_blind run died)
seed=3 creatures=176 creatures_noscent=143 creatures_noeye=170 len=12.0 len_sd=1.63 parts=5.3 chemo=0.50 chemo_blind=0.21 eye=0.23 eye_blind=0.12 plans=4 speed_cv=0.22 FAIL(chemo_blind run died)
gate-evolve 0/3 FAIL
exit=1
```

What the proofs show at the head:

- **The `creatures` band of `gate-evolve` has rejected nothing at the tuned defaults.** Its bad world
  now holds 159 to 176 creatures. The gate still exits 1 on that input, on other bands.
- **`chemo_blind run died` did not fire on its own input and fired on another.** In the
  `fert_radius=40` world it fired on 3 of 3 seeds, each with a living seeing run. That is a better
  proof than the recorded one. `eye_blind run died` fired on seed 2 of that world, where the seeing
  run lives (159) and the run with blind eyes does not (141). `gates.md` says no such input was found.
- **`len_sd` needs the `mut_rate=0` input now.** The M1 size rules alone leave a spread of 0.90 to
  1.05.
- **A sense that reads nothing now keeps a part sum of 0.00 to 0.11**: 0.00 to 0.05 for the
  chemoreceptor and 0.03 to 0.11 for the eye, over the six runs. The six chance gaps are 0.031,
  0.019, -0.016, -0.052, 0.000, and 0.003. The largest is 0.031. At the Start values it was 0.073, and
  the band of 0.10 is "the next 0.05 above it". The same arithmetic on the chance input of the tuned
  world gives 0.05. See finding H3.
- **The plan's `parts` input now fails the band too.** `mut_part_add=0 mut_part_dup=0
  mut_part_remove=0.3` reads `parts` 2.54, 2.24, 2.01, with `chemo` 0.00 to 0.01 and `eye` 0.01 to
  0.06 in the seeing runs. `gates.md` records 4.6 to 4.8 for it, and concludes "selection holds the
  parts that pay against removal". At the tuned defaults selection does not hold them against that
  rate of loss. See finding H3.

Not run: the CI proof. It needs a push.

## 3. The M2 bullets of the roadmap, and the exit sentence

| Bullet | What shows it | What does not |
|---|---|---|
| The variable-length part list | `genome.rs:27` and `:48`. `tests/genome.rs:37` (a founder as parts), `:269` (a full list of 12 loads as saved), `:234` (13 parts do not load) | |
| History ids | `tests/genome.rs:69` (a founder holds 1 to 62 and the world starts at 63), `:390` and `:467` (a new part takes the next id) | |
| The add, remove, and duplicate mutations | `tests/genome.rs:390`, `:416`, `:434`, `:467`. `probe-plans --seed 1` reads 48 plans at tick 36,000, so all three fire in a world | |
| Life-history genes: maturity age | **None. The genome has no maturity gene.** `genome.rs:39` holds `len`, `wid`, `egg`, `old`, `hue`. A body is an adult when `growth` reaches 1, at the rate of the parameter `grow_rate` | Finding L1: it is a logged decision |
| Life-history genes: old age | `tests/energy.rs:160` (each body dies at its own `old`), `:513` (a long life costs more), `tests/genome.rs:501` (the gene mutates in its range) | No probe prints the mean of `old`. Whether evolution moves it was not measured in the repo |
| Life-history genes: brood size against egg size | `tests/repro.rs:184` (a small egg gives a larger brood), `:251`, `:226`, `:200` | No probe prints the mean of `egg`. The `egg` readings of `m2-tuning.md` come from a census that is not in the repo |
| Part costs: build energy | `tests/energy.rs:364` (growth pays for the mass of the parts), `tests/repro.rs:200` (a brood conserves energy with heavy parts) | |
| Part costs: upkeep | `tests/energy.rs:220`, `:338` | |
| Part costs: mass | `tests/genome.rs:128`, `tests/motor.rs:256` (a heavier load is slower), `:190` (the push by mass) | Turning and the push do not feel the mass of parts in any test: section 5 |
| Eye | `tests/eye.rs:109` to `:354`, 12 tests. `gate-evolve` eye gap 0.18, 0.13, 0.16 | |
| Fin | `tests/motor.rs:290`. The test sets `fin_grip` to 0.6. At the default of 0.3 its own comment says a fin raises the slip, from 0.176 to 0.215 | Evolution: `probe-plans --seed 1` shows a fin in 2% of bodies. No band or probe reads the fin sum |
| The view cone: the player sees what the eyes see | `frame.rs:300` (the header holds the cones), `tests/abi.test.ts:62`, `tests/sight.test.ts:35` to `:59` | No test holds the cone of the frame to the cone of `eye.rs`: section 5, breaks 15 and 16. The page was not opened |
| The genome-driven renderer | `tests/parts.test.ts:54` to `:108`, 6 tests of where the part instances go | The page was not opened. Membrane and motion were not checked |

The exit sentence:

| Clause | What shows it | Limit |
|---|---|---|
| After a long headless run, creatures in one world differ in body plan | `gate-evolve` prints `plans` 4, 3, 4. `probe-plans --seed 1`: 48 plans, the commonest at 40% | `plans` has no band. A world of one plan passes the gate: trial 6 of `m2-tuning.md` has the row `seed=3 ... plans=1 ... PASS` |
| The difference changes how they move | `probe-plans` prints top speed and turn rate for each plan: 1.11, 1.24, 0.65 and 0.118, 0.092, 0.047 on seed 1. The audit held the formula to the motor: 61 adults of the seed 1 world at tick 36,000, each alone, 300 ticks at full thrust. Speed 0.41 to 1.50. The formula is right to 0.01%. The turn rate is right to 0.01% with no fin and reads 4% high with a fin | `speed_cv` has no band. One seed |
| And what they see | `probe-plans` prints `eye_angle` 2.05 to 3.23 radians across the 8 commonest plans | Read from genes, not from a scan. One seed |
| Part count does not collapse to the minimum | The `parts` band: 5.2, 4.4, 5.1, and 4.0 to 5.4 on seeds 1 to 10, against 3.0 | The band reads tick 36,000. Section 4, check 14, reads tick 144,000 |

## 4. The claims of `m2-eyes.md` and `m2-tuning.md`

### `m2-eyes.md`

The file has its own table of kinds, and it is careful. Two rows say "Not measured" where that is
true.

| Claim | Kind | Verdict |
|---|---|---|
| A thing in a cone lights the input of that side | The mechanism fires | Shown by tests. A swap of the two sides fails 10 tests |
| The scan finds what a search of everything finds | The mechanism fires | Shown. A scan that skips bodies fails `the_search_box_holds_every_thing_that_a_cone_holds` |
| A founder with eyes swims to a plant it sees, 5 of 5 seeds | The mechanism fires | Shown: the test asserts closer than 4.0 units. The "1.5 units" and "23 units" of the file are not asserted. Not measured again: they were taken at `FOUNDER_EYE_EXTRA` 0.4 |
| A world of eyed founders holds fewer creatures | The mechanism fires, and it thins the world | Shown at that commit on 3 seeds, one run each. Not true at the head: the grazing rule changed it |
| **"The look wire is the cause. The cost of the eye is not."** | It helps, with the sign turned | **Stronger than its evidence.** One seed (9), one run per arm, read at tick 1,500. The file says the arms are not fair pairs. The protocol of the project is 12,000 ticks on 3 seeds |
| The four neurons are the only thing that moved | The mechanism fires | Shown by rows that are equal digit for digit. Not run again: it needs the build before Task 10 |
| The scan costs 111 microseconds per tick at `see_every` 1 | The mechanism fires (a cost) | Measured at a load average of 7 to 11, in runs that alternate. The file says so |
| Evolution keeps eyes. A body with eyes does better | Evolution uses it. It helps | The file says neither was measured. Correct |

### `m2-tuning.md`

| Claim | Kind | Verdict |
|---|---|---|
| Step 3 halves the world. Step 6 thins it by a quarter to a third | The mechanism fires | Shown on 3 seeds, one run each. Cannot be run again at the head |
| The split push: "the mechanism fires", and nothing shows that it helps | The mechanism fires | Worded as measured |
| Where sight works, a plant dies 5 to 7 times as often | The mechanism fires | The three ratios are 4.6, 6.9, and 6.1. "5 to 7" rounds the first up |
| Evolution keeps the eyes where they see | Evolution uses it | Shown by the eye gap, one run per seed |
| Trial 1: a smaller bite fills the world and shrinks the body. "This is the arithmetic of rule S2 holding" | Evolution uses it | The measurement stands. **The reason is withdrawn later in the same file** ("Rule S2 is not what the plan says it is"), and the text of trial 1 still gives it |
| The grazing rule ends the kill | The mechanism fires | Shown. At the head `plant_deaths` is 0 over 9,000 ticks on seeds 1, 2, 3 |
| The rule "helps the world", and the seeing world "holds as many as either blind world or more" | It helps | 118%, 153%, and 97% of the run with blind eyes. Seed 3 holds fewer. At the close it is 104% to 106% and 97% to 105%, and 89% to 112% on 10 seeds. So at tick 36,000 sight no longer thins the world, and nothing there shows that it helps. The file does not claim that it does. At tick 144,000 it does help: check 14 |
| The plants no longer turn over | The mechanism fires | Shown. Every run at the head ends with 2,229, 2,076, and 1,965 plants |
| The census: the world is at the limit of its food, "the count rises because the bodies shrink", and the mouth moves to the filter | Evolution uses it | **Cannot be checked.** The census is "a scratch census outside the repo". "Because" is read from two numbers that move together |
| Trial 5: "evolution shrinks the mouth to about 19 and stops" | Evolution uses it | **Stronger than its evidence.** One tick (36,000) in three worlds. The same file then shows the product still falling |
| **Trial 6: "What evolution holds fixed is the mouth of a newborn. Evolution uses it, on 3 of 3 seeds."** Repeated in the Result and as "Measured" in "What is still wrong", point 4 | Evolution uses it | **Stronger than its evidence, and against the file's own later rows.** The product is level in trial 6 (5.4 to 6.1). It falls from 17.4 to 12.6 in trial 7 and from 15.0 to 9.3 in trial 9. In trial 8 it reads 18 to 19 where trial 7 read 12 to 14 at the same brain cost. One trial of four holds it fixed. All four readings are from the census |
| Trial 8: "the body holds its size", to tick 72,000 | Evolution uses it | **True of the length, not of the size.** `len` loses 0.4 to 0.8 from tick 12,000. The area loses 8% to 26% in 60,000 ticks, and 31% to 36% by tick 144,000 (73 to 47, 71 to 49, 76 to 50). The band reads `len` alone |
| Trial 9: "the hold of trial 8 needs the brain cost. Evolution uses it, on 3 of 3 seeds" | Evolution uses it | **Not a clean test.** The trial changed two things: the brain upkeep and `plant_growth` (0.035 to 0.028). Its world held 18% to 32% more creatures at tick 12,000. The audit ran the brain upkeep alone, and the claim holds there: check 13 below |
| The long reading: "The body levels off. Evolution uses it, on 3 of 3 seeds" | Evolution uses it | **Stronger than its evidence.** Only seed 1 was read past tick 144,000. Seed 3 falls from 11.4 to 10.7 in the last 36,000 ticks, and the area of seeds 2 and 3 still falls (52 to 49, 54 to 50). From tick 120,000 to tick 144,000 `len` moves by -0.03, +0.25, and -0.48 (check 12). On 10 seeds at tick 144,000 it reads 10.3 to 13.5, and 19.2 on seed 8 (check 14) |
| "The world grows by 26% to 44% and then holds" | The mechanism fires | Seed 3 gains 10% in the last 36,000 ticks (1,526 to 1,682). "Holds" is shown for seed 1 |
| A time-skip in the old world misses its budget by a little | The mechanism fires | Shown again: check 11 below |
| "Evolution does not keep the chemoreceptor in this world" | Evolution uses it, denied | **Too flat at tick 36,000, and right on 6 of 10 seeds at tick 144,000.** At tick 36,000 the seeing runs hold 0.03 to 0.28 and the blind runs 0.01 to 0.06. A chemoreceptor that reads nothing holds 0.00 to 0.05 (section 2). Seven of 10 seeds hold 0.14 to 0.28 there, and seeds 5, 7, and 8 hold 0.03 to 0.08. At tick 144,000 4 seeds hold 0.12 to 0.15 over a blind run at 0.00, and 6 hold 0.02 to 0.07 (check 14) |
| "One skip is 19 to 20 generations" | The mechanism fires | It is the gain in `max_gen`: the longest line, not the mean one |
| Half of the newborns starve as juveniles | The mechanism fires | Shown: `juv_starved` 0.52 to 0.54 at the head |
| `make check` exits 0 and `make gates` exits 2 | | Shown, digit for digit |

### Spot checks

Each row is one command at the head, against the number in `m2-tuning.md`. The runs are deterministic,
so a row must match digit for digit.

| # | Claim, and the decision that rests on it | Command | Seen | Match |
|---|---|---|---|---|
| 1 | The scent gap passes on 5 of seeds 1 to 10. Trials stop | `gate-evolve --seeds 4,5,6,7,8,9,10` | The 7 rows, with gaps 0.13, 0.041, 0.17, 0.052, 0.016, 0.092, 0.15. `3/7 FAIL` | Yes |
| 2 | `gate-health` passes on seeds 4 to 10 | `gate-health --seeds 4,5,6,7,8,9,10` | The 7 rows. `creatures` 1,079 to 1,381. `7/7 PASS` | Yes |
| 3 | Trial 7 is the first set that passes `gate-evolve` 3 of 3, and its bench is void | `gate-evolve --param plant_cap=20`, and `gate-health` the same | `841/846/771 len=9.5`, `712/728/675 len=9.7`, `722/785/725 len=10.7`, `3/3 PASS`. Health: 637, 522, 578 | Yes |
| 4 | Trial 9: with a cheap brain `len` reads 8.5, 7.3, 8.5. The brain upkeep stays at 6 times | `gate-evolve --param neuron_upkeep=0.0002 --param conn_upkeep=0.00005 --param plant_growth=0.028` | The 3 rows. `1/3 FAIL` | Yes |
| 5 | Trial 10: `eye_range=8` breaks the eye gap. `eye_range` stays at 16 | `gate-evolve --param eye_range=8` | Eye gaps 0.089, 0.099, 0.062. `0/3 FAIL` | Yes |
| 6 | Trial 3: with more food `len` is at the floor, 6.2, 6.3, 6.3 | `gate-evolve --param part_mass=0.1 --param neuron_upkeep=0.0002 --param conn_upkeep=0.00005 --param birth_growth=0.4 --param plant_cap=20` | The 3 rows. `0/3 FAIL` | Yes |
| 7 | Target 6: an adult has an heir in 67%, 70%, 68% of picks | `probe-heirs --seeds 1,2,3 --pick 3000` | Adults: 0.67, 0.70, 0.68 | Yes |
| 8 | One skip moves the chemoreceptor by -1.52, -0.76, -1.07 standard deviations | `probe-skip --seeds 1,2,3` | The same, and every other number of the two tables | Yes |
| 9 | 48 plans, the founder's plan at 40%, every one of the 8 with an eye | `probe-plans --seed 1` | The same 9 lines | Yes |
| 10 | The looks behind "no lever is left": 1,179 creatures at the default, 1,096, 1,003, 984 at `chemo_gain` 8, 16, 32, 1,200 at 0, 1,230 with `eye_gain=0`, 1,432 with both at 0 | `gate-health --seeds 1 --ticks 3000`, with each `--param` | 1,179, 1,096, 1,003, 984, 1,200, 1,230, 1,432 | Yes |
| 11 | An old world is under the floor: 2,304 ticks per second at a mean of 1,734 alive | `node scripts/bench-wasm.mjs --settle 108000 --runs 3` | `settled tick=108000 creatures=1766`. Mean 1,734. 2,296 at a load average of 2.7, and 2,384 at 7.1. `FAIL` both times | Yes for the counts. The speed is within 4% |
| 12 | The long reading: `len` 10.5, 11.5, 10.7 and 1,691, 1,601, 1,682 creatures at tick 144,000 | `probe-skip --seeds 1,2,3 --ticks 120000` | `len` 10.45, 11.51, 10.70. Creatures 1,691, 1,601, 1,682 | Yes |

So every number that the audit ran again is right. The same binary at a load average of 2.6 read
`bench-wasm creatures=1327 median_tps=3019 floor=2400 PASS` on the default world.

Runs that the tuning did not make:

**13. The brain upkeep alone.** Trial 9 changed `plant_growth` with it. With the brain upkeep at its
Start value and nothing else changed:

```
$ target/release/tidepool-headless gate-evolve --param neuron_upkeep=0.0002 --param conn_upkeep=0.00005
seed=1 creatures=2903 creatures_noscent=2679 creatures_noeye=2781 len=8.2 len_sd=2.23 parts=4.3 chemo=0.06 chemo_blind=0.02 eye=0.22 eye_blind=0.05 plans=4 speed_cv=0.30 FAIL(chemo_gap=0.041 < 0.1)
seed=2 creatures=2980 creatures_noscent=2779 creatures_noeye=2377 len=7.6 len_sd=2.12 parts=4.7 chemo=0.08 chemo_blind=0.01 eye=0.24 eye_blind=0.06 plans=6 speed_cv=0.43 FAIL(len=7.60 < 7.8, chemo_gap=0.075 < 0.1)
seed=3 creatures=2450 creatures_noscent=2602 creatures_noeye=2382 len=8.1 len_sd=2.13 parts=4.5 chemo=0.17 chemo_blind=0.00 eye=0.23 eye_blind=0.06 plans=4 speed_cv=0.38 PASS
gate-evolve 1/3 FAIL
```

`len` reads 8.2, 7.6, 8.1, against 11.8, 12.8, 11.9 at the defaults. **So the claim of trial 9 holds in
a clean test: the length needs the brain cost.** Evolution uses it, on 3 of 3 seeds, one run each.

**14. `gate-evolve` at tick 144,000.** One run per seed. Seeds 1, 2, 3 first, then the three seeds with
the smallest scent gap at tick 36,000, then the other four.

```
$ target/release/tidepool-headless gate-evolve --ticks 144000
seed=1 creatures=1691 creatures_noscent=1818 creatures_noeye=1218 len=10.4 len_sd=1.91 parts=5.7 chemo=0.13 chemo_blind=0.00 eye=0.24 eye_blind=0.00 plans=3 speed_cv=0.26 PASS
seed=2 creatures=1601 creatures_noscent=1584 creatures_noeye=1102 len=11.5 len_sd=2.88 parts=5.9 chemo=0.13 chemo_blind=0.00 eye=0.22 eye_blind=0.02 plans=5 speed_cv=0.32 PASS
seed=3 creatures=1682 creatures_noscent=1202 creatures_noeye=1230 len=10.7 len_sd=2.52 parts=6.3 chemo=0.15 chemo_blind=0.00 eye=0.22 eye_blind=0.02 plans=5 speed_cv=0.35 PASS
gate-evolve 3/3 PASS
$ target/release/tidepool-headless gate-evolve --seeds 5,7,8 --ticks 144000
seed=5 creatures=1774 creatures_noscent=1625 creatures_noeye=1386 len=11.6 len_sd=1.95 parts=6.1 chemo=0.04 chemo_blind=0.00 eye=0.22 eye_blind=0.01 plans=5 speed_cv=0.28 FAIL(chemo_gap=0.037 < 0.1)
seed=7 creatures=1562 creatures_noscent=1577 creatures_noeye=1213 len=12.8 len_sd=2.95 parts=4.9 chemo=0.02 chemo_blind=0.00 eye=0.17 eye_blind=0.01 plans=4 speed_cv=0.33 FAIL(chemo_gap=0.018 < 0.1)
seed=8 creatures=1104 creatures_noscent=1524 creatures_noeye=1021 len=19.2 len_sd=3.70 parts=3.3 chemo=0.02 chemo_blind=0.00 eye=0.03 eye_blind=0.02 plans=4 speed_cv=0.33 FAIL(chemo_gap=0.014 < 0.1, eye_gap=0.009 < 0.1)
gate-evolve 0/3 FAIL
$ target/release/tidepool-headless gate-evolve --seeds 4,6,9,10 --ticks 144000
seed=4 creatures=1303 creatures_noscent=1022 creatures_noeye=1115 len=12.2 len_sd=3.83 parts=5.8 chemo=0.03 chemo_blind=0.01 eye=0.20 eye_blind=0.02 plans=4 speed_cv=0.41 FAIL(chemo_gap=0.016 < 0.1)
seed=6 creatures=1678 creatures_noscent=1402 creatures_noeye=1092 len=10.3 len_sd=2.85 parts=5.1 chemo=0.07 chemo_blind=0.00 eye=0.21 eye_blind=0.01 plans=4 speed_cv=0.34 FAIL(chemo_gap=0.067 < 0.1)
seed=9 creatures=1545 creatures_noscent=1026 creatures_noeye=1126 len=13.5 len_sd=2.94 parts=4.8 chemo=0.02 chemo_blind=0.00 eye=0.19 eye_blind=0.01 plans=4 speed_cv=0.32 FAIL(chemo_gap=0.020 < 0.1)
seed=10 creatures=1507 creatures_noscent=1597 creatures_noeye=1112 len=11.1 len_sd=1.88 parts=6.1 chemo=0.12 chemo_blind=0.00 eye=0.22 eye_blind=0.01 plans=5 speed_cv=0.26 PASS
gate-evolve 1/4 FAIL
$ target/release/tidepool-headless probe-plans --seed 8 --ticks 144000
seed=8 tick=144000 creatures=1104 plans=36
seed=8 plan=flagellum+cilia+filter share=0.32 len=20.6 top_speed=0.96 turn_rate=0.038 eye_angle=0.00
seed=8 plan=flagellum+filter share=0.24 len=20.0 top_speed=1.02 turn_rate=0.032 eye_angle=0.00
seed=8 plan=flagellum+cilia+2filter+chemo+eye share=0.07 len=10.6 top_speed=0.51 turn_rate=0.087 eye_angle=1.30
seed=8 plan=2flagellum+cilia+filter share=0.06 len=18.4 top_speed=1.21 turn_rate=0.050 eye_angle=0.00
seed=8 plan=flagellum+filter+fin share=0.05 len=22.3 top_speed=0.90 turn_rate=0.036 eye_angle=0.00
seed=8 plan=flagellum+2cilia+filter share=0.05 len=21.5 top_speed=0.88 turn_rate=0.040 eye_angle=0.00
seed=8 plan=2flagellum+filter share=0.04 len=18.9 top_speed=0.92 turn_rate=0.033 eye_angle=0.00
seed=8 plan=flagellum+filter+eye share=0.03 len=20.1 top_speed=0.69 turn_rate=0.025 eye_angle=3.58
```

**At tick 144,000 `gate-evolve` passes on 4 of 10 seeds: 1, 2, 3, and 10.** At tick 36,000 it passes
on 5: 2, 3, 4, 6, and 10. What the rows show, by kind of claim. Each is one run per seed.

- **Evolution keeps the chemoreceptor on 4 of 10 seeds and loses it on 6.** On seeds 1, 2, 3, and 10
  the seeing run holds 0.12 to 0.15 and the blind run falls to 0.00. On seeds 4, 5, 6, 7, 8, and 9 the
  seeing run holds 0.02 to 0.07. Seeds 4, 6, and 9 passed or nearly passed the band at tick 36,000 and
  lost the part after it. Seed 1 failed at tick 36,000 and passes here: its blind run still held 0.06
  then.
- **Evolution keeps the eyes on 9 of 10 seeds.** The eye sum is 0.17 to 0.24 against 0.00 to 0.02 in
  the blind run.
- **On seed 8 both senses are gone. This is risk R1, and the `parts` band does not see it.** The eye
  sum is 0.03. `parts` reads 3.3 and passes its band of 3.0. A quarter of that world (24%) is the
  two-part body that the band calls the minimum, `flagellum+filter`. At least 76% of it has no sense
  part at all: six of the eight commonest plans. `len` reads 19.2 and the band ends at 22.2. The
  seeing world holds 1,104 creatures and the world with no direction of scent holds 1,524.
- **Part count does not fall on the other nine seeds.** It reads 4.8 to 6.3, against 4.4 to 5.4 at
  tick 36,000.
- **Sight helps the world at tick 144,000 where evolution keeps the eyes.** The seeing run holds 117%
  to 154% of the run with blind eyes on the 9 seeds that keep eyes. At tick 36,000 it was 89% to
  112%. It helps: 9 of 9 seeds, one run each. The pair is not even: each arm evolved for 144,000 ticks
  on its own.
- **The direction of the scent: no clear reading for the world.** The seeing run holds 72% to 151% of
  the run with no direction, on 10 seeds.
- **`gate-health` fails at tick 144,000 on 2 of 3 seeds, on `mean_chemo`.** `gate-health --ticks
  144000` reads 0.13, 0.13, 0.15 against 0.15. So at the same tick, on the same worlds, the scent gap
  of `gate-evolve` passes (0.13 over a blind run at 0.00) and the `mean_chemo` band of `gate-health`
  fails. The health gate is not run at that tick by any command of the project.

**15. Bodies slow down over a long run.** No gate or finding reads this.

| Reading on seed 1 | Tick 12,000 | Tick 36,000 | Tick 144,000 |
|---|---|---|---|
| Mean flagellum sum (`probe-skip`) | 0.55 | 0.46 | 0.21 |
| Mean cilia sum | 0.40 | 0.36 | 0.49 |
| Top speed of the commonest plan (`probe-plans`) | | 1.11 | 0.58 |
| Top speeds of the 8 commonest plans | | 0.65 to 1.24 | 0.58 to 0.87 |
| Eye angle of the commonest plan, radians | | 2.47 | 1.90 |
| Plans (`probe-plans`) | | 48 | 62 |

The flagellum sum at tick 144,000 is 0.21, 0.26, 0.31 on seeds 1, 2, 3, against a founder's 0.6.
Evolution uses it: on seed 1 the commonest plans give up about half of their top speed, in a world
where every rootable cell holds 3 plants for good. Top speed was read on seed 1 only, and on seed 8,
where the large blind bodies read 0.88 to 1.21. `parked` reads 0.00 at tick 144,000 on seeds 1, 2, 3.
Whether a slow world still reads as alive is a question for the page (pillar 1 of `design.md`).

The census of `m2-tuning.md` gives an adult area of 47, 49, 50 at tick 144,000. `probe-skip` gives
`wid` 0.43, 0.36, 0.42 there, and `len * len * wid` of the means is 47, 47, 48. The two agree as far as
a mean of products agrees with a product of means.

## 5. Rules that no test checks

22 rules were broken in the code, one at a time. After each break: `cargo test -p tidepool-sim`, and
`make wasm headless` with `pnpm exec vitest run` for the two that the page reads. Then the file was
restored. **9 breaks left every test green.**

| # | Rule broken | Break | Tests that failed |
|---|---|---|---|
| 1 | Turning feels the weight of the parts | `motor.rs:133`: `* heft[s]` removed from the turn | **None** |
| 2 | The push is split by mass | `motor.rs:69`: the mass of the push is the area, with no heft | **None** |
| 3 | The anchor rule for side | `creature.rs:129`: `side_of` is `1 - abs(2a - 1)` | **None** |
| 4 | A fin turns by `fin_torque / v_max` | `motor.rs:104`: no division by `v_max` | 1: `a_fin_turns_only_at_speed_and_cuts_the_slip` |
| 5 | Side drag stops at `SIDE_DRAG_MAX` | `motor.rs:139`: the `min` removed | **None** |
| 6 | A step of growth leaves `grow_floor` of the reserve | `energy.rs:116`: the test always passes | **None** |
| 7 | **A brain costs upkeep** | `energy.rs:105`: both brain terms times 0 | **None** |
| 8 | The age input is `age / old` | `sense.rs:50`: `age / 4800` | **None** |
| 9 | No bite takes a plant under its death reserve | `energy.rs:55`: no `min(spare)` | 2 |
| 10 | Possess marks every living descendant | `control.rs:78`: children only | 1 in Rust. **Vitest: none** |
| 11 | A cone at a positive angle is on the right | `eye.rs:104`: sides swapped | 10 |
| 12 | A copied part takes a new history id | `genome.rs:345`: it keeps the old id | 2 |
| 13 | A body dies at its own `old` gene | `energy.rs:131`: at `lifespan` | 1 |
| 14 | A child is born at its parent's `egg` | `repro.rs:95`: at its own `egg` | 3 |
| 15 | An eye sees `eye_range * size * length` of the body as grown | `eye.rs:39`: the adult length | **None** |
| 16 | The cone that the page draws is the cone that the eye scans | `frame.rs:104`: the adult length | **None, in Rust or in Vitest** |
| 17 | Growth pays for the mass of the parts | `energy.rs:115`: for the area | 1 |
| 18 | An eye costs upkeep | `energy.rs:95`: eyes left out of the part sum | 1 |
| 19 | A brood stops at `brood_max` | `repro.rs:56`: at 8 | 3 |
| 20 | Remove takes a part chosen evenly | `genome.rs:339`: the last part | 1 |
| 21 | A long life costs more | `energy.rs:109`: `old_cost` times 0 | 1 |
| 22 | An eye sees bodies | `eye.rs:92`: no scan of bodies | 4 |

What the nine show:

- **Break 7 matters most.** `m2-tuning.md` says the brain upkeep "now carries the size of the body".
  Every test that names `neuron_upkeep` or `conn_upkeep` sets it to 0. A build with no brain upkeep
  passes `cargo test -p tidepool-sim`. Vitest and the headless test were not run on it. `gate-evolve`
  would likely catch it through `len` (check 13), 2 minutes later.
- **Breaks 1 and 2: the mass of parts is tested for top speed and for upkeep only.** The bodies of
  `bump` in `tests/motor.rs:58` carry the same parts, so mass and area have one ratio. Every turning
  test uses a body with a heft near 1.
- **Break 3:** `tests/genome.rs:112` reads `side_of` at 0.5 and 1.0 only.
- **Breaks 15 and 16: every test body with an eye is full-grown.** A juvenile's eye and a juvenile's
  drawn cone are untested, and no test compares the two. The range is worked out twice, in `eye.rs:55`
  and in `frame.rs:104`.
- **Break 10:** the page test `a body that already has a child leaves that child among its heirs`
  (`tests/host.test.ts:569`) has no grandchild.

## 6. Numbers in rule code that are not in the parameter table

`AGENTS.md`: "A number that needs tuning goes in `params.rs`. Rule code has no magic numbers."

**Named constants with no comment that says why the value is fixed:**

| Constant | Where | Note |
|---|---|---|
| `LEN_RANGE` (6, 24), `WID_RANGE` (0.3, 0.9) | `genome.rs:62` | The `len` band of `gate-evolve` is "a tenth of the range in from each wall" |
| `EGG_RANGE` (0.2, 0.7) | `genome.rs:64` | **Tuning leaned on it.** The accepted set starts the egg at 0.7 "so the egg cannot stand in for the body". `m2-tuning.md` lists the range under "What needs a rule or a decision" |
| `OLD_RANGE` (1200, 9600) | `genome.rs:65` | |
| `SIZE_RANGE` | `genome.rs:67` | A filter cannot go under 0.2. The comment says the M1 kinds keep their M1 ranges |
| `FOUNDER_PARTS` | `genome.rs:84` | Four anchors and four sizes |
| `FOUNDER_EYE_ANCHOR` 0.2, `FOUNDER_EYE_EXTRA` 0.5 | `genome.rs:90` | **`FOUNDER_EYE_EXTRA` was tuned once**, from 0.4 to 0.5, after the page showed a blind strip (`m2-eyes.md`). Every eyed reading of `m2-eyes.md` is at 0.4 |
| `FIN_ANCHOR` 0.6 | `genome.rs:93` | |
| `MAX_PART_GENES` 12, `MAX_EYES` 8, `MAX_CREATURES` 4096, `MAX_PLANTS` 8192, `MAX_NEURONS` 96, `MAX_CONNS` 384 | `genome.rs:52`, `creature.rs:18` and `:12`, `plant.rs:15`, `brain.rs:13` | Budgets of `architecture.md` section 2. The code does not say so. `MAX_EYES` is not in that table |
| `EYE_HALF_MIN` 0.2, `EYE_HALF_SPAN` 1.0 | `eye.rs:15` | The half angle of a cone |
| `STARTER_HIDDEN` 4 | `brain.rs:34` | |
| `RADIUS_MIN` 2, `RADIUS_SPAN` 6 | `plant.rs:17` | The reach of a plant. A body eats a plant that it touches |
| `STAGGER` 8, `FOUNDER_RESERVE_MIN` 0.3, `FOUNDER_DRAWS` 50 | `plant.rs:22` | |
| `SCENT_CELL` 8, `STEP_EVERY` 2, `CELL` 32 | `field.rs:7`, `grid.rs:5` | |
| `FOUNDER_GROWTH` 1, `FOUNDER_ENERGY01` 0.5, `FOUNDER_TRIES` 8 | `world.rs:24` | |
| `SIDE_DRAG_MAX` 0.95 | `motor.rs:15` | The comment says what it is |
| `BUD_FLASH` 40, `MAX_HEIRS` 5 | `frame.rs:27`, `control.rs:13` | |

**Numbers with no name:**

| Number | Where | What it is |
|---|---|---|
| The square, and the start at the middle | `creature.rs:123`: `(2a - 1).max(0)` squared | The anchor rule for push |
| 4 | `creature.rs:129`: `4a(1 - a)` | The anchor rule for side |
| 4 | `creature.rs:227` and again in `repro.rs:83` | The radius of a body, `(length + width) / 4`. The rule is written twice |
| The power 3/4 | `energy.rs:98`, `math.rs:43` | The upkeep curve. The name `pow075` holds the number |
| The power 2 | `energy.rs:107`: `thrust * thrust` | The cost of thrust |
| 2 | `motor.rs:103` and `:133` | The moment of inertia, `2 * inertia_k * width * length` |
| 2 | `world.rs:176`: `lifespan / 2` | A founder's age is under half a lifespan |
| `PI` | `creature.rs:190`: `anchor * PI` | An eye at anchor `a` looks `a` half turns from the heading |
| The two powers of 2 | `plant.rs:116` | The shape of a fertile patch |

**Named constants whose comment does say why:** `REF_PARTS`, `LEN_DEFAULT`, `WID_DEFAULT`,
`WEIGHT_LIMIT`, `ALPHA_SIGMA`, `ALPHA_RANGE`, `EYE_REACH`, `BOX_MARGIN`, `SCENT_FLOOR`,
`HEADING_JITTER`, `BROOD_FAN`, `STARTER_WEIGHT_SIGMA`, `STARTER_BIAS_SIGMA`, `MAX_WORLD_SIZE`,
`MARGIN`, `MAX_RADIUS`.

**Two parameter ranges are wider than the gene they start.** `birth_growth` goes to 1.0 and `EGG_RANGE`
stops at 0.7. `lifespan` goes down to 600 and `OLD_RANGE` starts at 1,200. A founder made at such a
value holds a gene that its first mutation moves into the range in one step. The test of `probes.rs`
runs at `lifespan=600`.

**Banned math and `HashMap`.** `crates/sim` has no `HashMap`. It has two calls of a banned float
method, both inside `#[cfg(test)]` and both under an `allow`: `math.rs:62` (`f64::sin`, `f64::cos`) and
`frame.rs:317` (`f32::cos`). Neither is in rule code and neither reaches the `.wasm`. `AGENTS.md` gives
leave for this to test files under `crates/sim/tests/` only. `crates/headless` uses `HashMap` in
`evolve.rs:68` and `probes.rs:94`. Each result is sorted or counted before it is printed.

## 7. Save and load

**No field is missing.** Every field of the world, of a creature, of a plant, and of a genome is in the
snapshot or is worked out again on load.

| State | Saved | Worked out again on load, or scratch |
|---|---|---|
| `World` | `tick`, `w`, `h`, `next_uid`, `next_history`, the three generators, `params`, `stats` (5 counters) | `grid`, `motor`, `frame`, `save_buf` |
| `Creatures` | The live slot list, `uid`, `x`, `y`, `vx`, `vy`, `heading`, `omega`, `cmd_thrust`, `cmd_turn`, `growth`, `energy`, `age`, `generation`, `parent`, `mark`, `bud_cooldown` | `hc`, `hs` from `heading`. The 19 arrays of `express` from the genome. `high_water` from the slot list |
| `Genome` | `len`, `wid`, `egg`, `old`, `hue`. Each part: `kind`, `anchor`, `size`, `extra`, `history`. The brain: `n_hidden`, `bias`, `alpha`, and each connection | |
| `Brains` | `cur` for the neurons of each live slot. The eye inputs are there, so an eye that holds its input between scans keeps it | `nxt`. `bias`, `alpha`, `src`, `dst`, `w` from the genome |
| `Plants` | The live slot list, `x`, `y`, `reserve`, `cap` | `grid`, `dirty` |
| `Fertility`, `Field` | `v`, `a` | `b` |
| `Control` | `possessed`, `manual`, `thrust`, `turn`, `death_cause`, `buds` | `possessed_slot` from the uid. `heirs` |

Checks:

- `high_water` is not saved, and a loaded pool can have a lower one than the pool it came from. Every
  loop that reads it skips dead slots, and `alloc` takes the lowest free slot, so it changes nothing.
- A scratch test, not committed: the default world on seeds 1, 2, 3, saved and loaded at ticks 1, 2, 7,
  500, 3,001, 6,000, and 8,999, against the same world left alone for 9,000 ticks. The hashes are
  equal: `cf476f0e`, `2d7d5223`, `dc74e78f`. Each world had about 10,000 births and 9,000 deaths.
- The same with a born adult possessed at tick 4,000 and steered, loaded every 500 ticks for 3,000
  ticks. Equal: `a10a8b74`. The body budded twice and starved inside the run.
- `FORMAT_VERSION` is 6 since `15f0211`. No layout change came after it: the diff of `crates/sim/src`
  since then is 6 defaults, the grazing rule, and comments.
- `every_saved_field_is_in_the_hash_and_survives_a_load` (`tests/snapshot.rs:135`) edits 53 fields. It
  has no edit of `w`, `h`, `uid`, `n_hidden`, or of the `src`, `dst`, `weight`, or `history` of a
  connection that is already there. The round-trip tests cover these. This is a gap in one test, not a
  missing field.

## Findings

Sorted by severity. "Logged" means `docs/decisions/INDEX.md` already holds an owner decision on the
point. The log was read after sections 3 to 6 were written.

### High

**H1. `make gates` exits 2, so the gates half of the exit is not met.**

- Evidence: section 1. `gate-evolve 2/3 FAIL`, `seed=1 ... FAIL(chemo_gap=0.079 < 0.1)`. The scent
  gap fails on 5 of seeds 1 to 10 at tick 36,000 (check 1) and on 6 of 10 at tick 144,000 (check 14).
- Known: `AGENTS.md` status, and `m2-tuning.md` "What needs a rule or a decision", point 1. Not logged
  as a decision.
- Who decides: the owner. It needs a rule for the scent sense, or a band.

**H2. Risk R1 shows at tick 144,000, and no gate reads that tick.**

- What is wrong: the exit sentence says "after a long headless run" and names R1. The gate reads tick
  36,000. In 144,000 ticks, which is 6 time-skips, evolution strips the chemoreceptor on 6 of 10 seeds
  and both senses on 1 of 10.
- Evidence: check 14. Seed 8: `len=19.2 ... parts=3.3 chemo=0.02 ... eye=0.03 eye_blind=0.02`, and
  `probe-plans --seed 8 --ticks 144000` shows `flagellum+cilia+filter` at 32% and `flagellum+filter`
  at 24%. `gate-health --ticks 144000` reads `FAIL(mean_chemo=0.13 < 0.15)` on seeds 1 and 2.
- The `parts` band (3.0) passes seed 8 at 3.3. So the band that stands for R1 does not reject a world
  where three quarters of the bodies have no sense.
- One run per seed. Nothing here is a trial.
- Who decides: the owner. How long "long" is, whether a gate reads it, and the `parts` band are all
  band or rule questions. The baked world of M8 and every skip of M5 will run past tick 36,000.

**H3. The scent gap band and the `parts` proof rest on readings of a world that the tuning replaced.**

- What is wrong: both come from the Start values, where `part_mass` was 0.1. It is 1 now, and every
  sense part is smaller.
- Evidence, section 2. The chance input: the largest of six gaps is 0.031 at the head and was 0.073.
  The band of 0.10 was set as "the next 0.05 above" 0.073. The removal input
  (`mut_part_add=0 mut_part_dup=0 mut_part_remove=0.3`): `parts` 2.54, 2.24, 2.01 at the head, and
  4.6 to 4.8 in the record. `gates.md` still concludes from it that "selection holds the parts that
  pay against removal".
- Logged: 2026-10-11, "The bands of `gate-evolve` follow their proofs", with both old readings as the
  reason.
- The audit does not say that the band is wrong. Six chance gaps are a small sample. At tick 144,000
  the gaps split cleanly: 0.12 to 0.15 on four seeds and 0.01 to 0.07 on six.
- Who decides: the owner, because it is a band.

### Medium

**M1. Four failure proofs do not hold at the tuned defaults, and `gates.md` says the old outputs still
describe the world.**

- Evidence, section 2: the third proof of the health gate passes (`max_gen=21`). The `creatures` band
  of `gate-evolve` rejects nothing (175, 159, 176). The first `len_sd` input rejects nothing (0.91,
  1.05, 0.90). The input for `chemo_blind run died` kills no blind run (261, 231, 223).
- By the rule of `AGENTS.md`, "a gate counts only after it has rejected a known-bad input". The
  `creatures` band of `gate-evolve` has no such input at the head. The other three have a second input
  or a second world that still rejects.
- Also stale in `gates.md`: "The same command without the flag now runs the same world", the snapshot
  row (19 of 31, older hashes), and the Evolution row of the table ("Not in `make gates` or CI yet").
- Who decides: a code and doc fix. Run every proof again at the head, record the new outputs, and find
  a bad world for `creatures`. The owner decides only if a band must move.

**M2. Nine breaks of an M2 rule pass every test.**

- Evidence: section 5, breaks 1, 2, 3, 5, 6, 7, 8, 15, 16.
- The worst is break 7: no test fails when a brain costs no upkeep. `m2-tuning.md` says that cost
  "now carries the size of the body", and check 13 confirms it.
- Breaks 15 and 16 leave "the player sees what the eyes see" with no test for a body that is still
  growing. At the head 38% of the bodies alive at tick 3,000 are juveniles (`probe-heirs`: 452 of
  1,179 on seed 1).
- Who decides: a code fix. Tests only. No rule changes.

**M3. The flagellum shrinks to a third or a half by tick 144,000, and nothing reads the speed of a
world.**

- Evidence: check 15. Flagellum sum 0.21, 0.26, 0.31 at tick 144,000 on seeds 1, 2, 3, against a
  founder's 0.6. Top speed of the commonest plan on seed 1: 1.11 at tick 36,000 and 0.58 at tick
  144,000. Top speed was read on seeds 1 and 8 only.
- `speed_cv` reads the spread of speed, not its level. `parked` reads 0.00.
- Who decides: the owner. Pillar 1 of `design.md` is "alive to watch". A probe for the mean top speed
  is a code fix.

**M4. Readings that decided the tuning come from a census that is not in the repo.**

- Evidence: `m2-tuning.md` says "a scratch census outside the repo" for the adult area, the filter
  sum, the `egg` gene, the energy eaten, the mouth of a newborn, and every reading past tick 36,000.
  No probe of the repo prints `egg`, `old`, the eye sum over time, the fin sum, or the area.
- The audit could check that census only where `probe-skip` prints the same gene (checks 8 and 12).
  Those matched.
- Who decides: a code fix. Move the census into a probe.

**M5. Two clauses of the exit sentence have no band, and the third has a band that seed 8 passes.**

- Evidence: `gates.md` lists `plans` and `speed_cv` as "Reported, no band". A row with `plans=1`
  passes (`m2-tuning.md`, trial 6, seed 3). `parts=3.3` passes on seed 8 at tick 144,000 (H2).
- Who decides: the owner, because each is a band.

**M6. Seven claims are worded more strongly than their evidence.**

- Evidence: section 4. In `m2-eyes.md`: "The look wire is the cause". In `m2-tuning.md`: "evolution
  shrinks the mouth to about 19 and stops", "What evolution holds fixed is the mouth of a newborn"
  (and the same in the Result and in "What is still wrong", point 4), "the body holds its size", "The
  body levels off ... on 3 of 3 seeds", "The world grows by 26% to 44% and then holds", and "Evolution
  does not keep the chemoreceptor in this world".
- Trial 1 still gives rule S2 as its reason, and the file withdraws that reason later.
- Trial 9 was not a clean test. The clean test agrees with it (check 13).
- Who decides: a doc fix.

**M7. The size band reads length alone, and the body shrinks by its width.**

- Evidence: the census of `m2-tuning.md` gives an adult area of 73, 71, 76 at tick 12,000 and 47, 49,
  50 at tick 144,000: a loss of 31% to 36%. `len` loses 4% to 14%. `probe-skip` reads `wid` 0.43, 0.36,
  0.42 at tick 144,000 against a founder's 0.50 and a floor of 0.3.
- Logged: 2026-10-11, "Body size gets a real tradeoff in M2", judged by "mean length away from both
  walls of its range".
- Who decides: the owner, because it is a band.

**M8. A world older than the bench world is under the throughput floor.**

- Evidence: check 11. `bench-wasm creatures=1734 median_tps=2296 floor=2400 FAIL` at tick 108,000,
  at a load average of 2.7. The default bench read 3,019 at the same load. At tick 144,000 the ten
  worlds hold 1,104 to 1,774 creatures.
- Also: the gate is a seed 1 reading, and seeds 3, 4, 6, and 9 are void at the tuned defaults
  (`gates.md`).
- Known: `m2-tuning.md` "What needs a rule or a decision", point 6. Not logged.
- Who decides: the owner. The budget of `architecture.md` section 2 is a decision.

**M9. The `egg` gene starts at the top of its range, so "brood size against egg size" is not a live
choice.**

- Evidence: `birth_growth` is 0.7 and `EGG_RANGE` is (0.2, 0.7) (`genome.rs:64`). `m2-tuning.md` sets
  it there "so the egg cannot stand in for the body", and reads the gene at 0.62 to 0.68 from the
  census. It says "a parent now buds one large child" and that the size of a brood was not measured.
- Logged: 2026-10-11, brain upkeep stays fixed, "which is what makes the M2 egg-size gene a real
  choice". The tuned set closes that choice.
- Known: `m2-tuning.md` "What needs a rule or a decision", point 4.
- Who decides: the owner.

### Low

**L1. The roadmap still lists a maturity-age gene and brood size as a gene.** Neither is built.
Logged: 2026-10-11, "The M2 plan is approved with seven differences from the roadmap and the design:
no maturity-age gene, brood size is not a gene ...". `roadmap.md` was not changed to match. A doc fix.

**L2. Numbers outside the parameter table.** Section 6. Logged for the gene ranges: the same entry says
"gene ranges stay constants". Not logged: `FOUNDER_EYE_EXTRA`, which was changed from 0.4 to 0.5 after
the page showed a blind strip, and is not in the table. `AGENTS.md` says such a number goes in
`params.rs`. A code fix, or a comment on each constant that says why it is fixed.

**L3. Two parameter ranges are wider than the gene that they start.** `birth_growth` to 1.0 against
`EGG_RANGE` to 0.7. `lifespan` from 600 against `OLD_RANGE` from 1,200. `params.rs:39` and `:113`,
`genome.rs:64`. A code fix.

**L4. Two banned float calls in `crates/sim/src`, both in test modules.** `math.rs:62` and
`frame.rs:317`. Neither is rule code. A code fix, or one more line of leave in `AGENTS.md`.

**L5. The fin test passes only at a `fin_grip` that is not the default.** `tests/motor.rs:306`: at the
default of 0.3 a fin raises the slip from 0.176 to 0.215, and the test sets 0.6. The test name says a
fin "cuts the slip". The owner decides whether the default or the claim is wrong.

**L6. Docs that the code has passed.** `architecture.md` section 10 and the CI row of `gates.md` leave
`gate-evolve` out of `make gates` and of CI. Both run it. `README.md` gives the status as M0 and M1.
The comment of `intake_rate` in `params.rs:102` says "per unit length", and the mouth follows the area.
A doc fix.

**L7. The page shows a circle that no sense feeds.** `src/render/sight.ts:15`: `NEAR_LENGTHS = 1.5`, "a
body feels this many of its own lengths around it". The core has no such input. `design.md` section 8
says the player perceives what the creature can. Read from the code only. The page was not opened. The
owner decides.

**L8. Two gaps in tests that another test covers.** The page test for heirs has no grandchild (break
10, caught in Rust). `every_saved_field_is_in_the_hash_and_survives_a_load` edits no `w`, `h`, `uid`,
or `n_hidden` (section 7, caught by the round-trip tests). A code fix.

**L9. A child that is never born can use up a history id.** `repro.rs:61` draws the child's genome,
with `next_history`, before it knows whether the parent can pay. Read from the code, not measured. Ids
stay unique, so nothing breaks. Noted for M3, where crossover lines genes up by id.

## What the audit did not check

- The page. No browser was used. The view cone, the renderer, the HUD, and the play check are open.
- The CI proof, and anything that needs a push.
- Any claim from before the grazing rule (`e872d73`): the baseline, trials 1 and 2, the switch-on
  steps. The rule cannot be switched off by a parameter.
- Any number from the scratch census of `m2-tuning.md`, except where a probe of the repo prints the
  same thing.
- Throughput on a quiet machine. The lowest load average at a timing here was 2.6.
- The scratch reading behind "the direction of the scent is a weak signal": the size of the gradient
  input and the weights of the wires.
- The "1.5 units" and "23 units" of `m2-eyes.md`, and its throughput tables.
- A second run of any arm. Every reading of the audit is one run per seed, as in `m2-tuning.md`.
