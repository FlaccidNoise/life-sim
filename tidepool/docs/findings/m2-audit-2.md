# M2 audit 2: Bodies, after the part upkeep was deleted

Date: 2026-10-12. The runs went from 23:59 to 01:08 local, so they end on 2026-10-13. Head: `cc0cc9950f4d62867011396a0c6f5489d2e06eb3`. A fresh-context audit. The auditor fixed nothing.

Read, in this order:
- `AGENTS.md`, `docs/roadmap.md`, `docs/design.md`, `docs/architecture.md`, `docs/gates.md`.
- `docs/findings/m2-exit.md` and `docs/findings/m2-senses.md`.
- `crates/sim/src` (all but `abi.rs`, `frame.rs`, `grid.rs`, `rng.rs`, `snapshot.rs`, which were searched and not read whole), `crates/headless/src`, `Makefile`, `scripts/bench-wasm.mjs`.
- The diff `d9c62d2^..9a9a411` of `crates`, `tests`, `Makefile`, `scripts`.
- After the findings were fixed: `docs/decisions/INDEX.md`, `docs/findings/m2-audit.md`, `docs/findings/m2-audit-fixes.md`.

Not read: `HANDOFF.md`, anything in `docs/plans/`, `/src` at the repo root, `m2-tuning.md`, `m2-eyes.md`, `m2-long-run.md`.

Every simulation ran alone. The load average was 3.0 to 6.9 through the audit, from other work. A count does not depend on the load. A ticks-per-second figure does.

## Result

**What a machine can check is met at the head, with the limits below. The exit is not closed: rule 1 of `roadmap.md` needs a person playing the build, and the owner's five checks are open.**

The gates: `make check` exits 0. `make gates` exits 0. `make gates-long` exits 0 (rule 6).

| Clause of the exit sentence | Verdict | Kind of claim, and whether the evidence supports it |
|---|---|---|
| After a long headless run, creatures in one world differ in body plan | Met for a machine. "Visibly" is the owner's | The record names no kind. What is measured is "the mechanism fires": the add, remove, and copy mutations make plans that stay. The record reads tick 36,000 only: 54, 45, 31 plans, the commonest at 35%, 31%, 63%. Same here. New reading at tick 144,000 on seeds 1, 5, 8: 75, 45, 65 plans, the commonest at 22%, 29%, 16%. No band and no control. Nothing shows that evolution uses the variety |
| The difference changes how they move and what they see | Met as "the mechanism fires", as the record says | Top speed, turn rate, and eye angle are worked out from genes by `evolve.rs` and `probes.rs`. They are not measured in the run. No test holds the two motion formulas to the motor (M2). A scratch test here read formula and motor equal on 3 bodies. The tests of `crates/sim` hold each rule |
| Part count does not collapse to the minimum (R1) | Met to tick 144,000 on 10 seeds, one run per seed | A measured count: `parts` 5.5 to 9.6. Same here, 20 census rows identical. "Evolution uses it" is shown for the two senses only: at tick 36,000 on 10 of 10 seeds (scent) and 9 of 10 (eye), and at tick 144,000 on seeds 1, 5, 8 on record and on seeds 4 and 6 here. Seeds 2, 3, 7, 9, 10 have no gap reading at tick 144,000. Limit: M3 |

"It helps" is not claimed for the default world, and the record is right not to claim it. Readings, one run per seed:
- At tick 36,000 a world with no scent holds 1,612, 1,418, 1,374 creatures. The default holds 1,448, 1,429, 1,397.
- At tick 144,000 the seeing world holds 114% to 140% of the world with blind eyes, on seeds 1, 4, 5, 6, 8.
- At tick 144,000 it holds 98% to 114% of the world with no direction of scent.
- The pairs are not even: each arm evolved alone.

The rest:
- **Claims.** Every count of `m2-exit.md` and `m2-senses.md` Part 5 that I ran again is the same digit for digit. One sentence of the record disagrees with its own rows (L4). Two are worded more strongly than their evidence (M3, L6).
- **Proofs.** 28 recorded commands of the throughput, health, and evolution gates ran again. Each gave the recorded exit code and the recorded counts. Every band and both blind-run checks still reject their input.
- **Code.** The diff is right. With every switch at 1 and `part_upkeep` at 0, each deleted term was an exact identity, and the gate rows did not move. No residue of the five names is in `crates`, `src`, `tests`, `scripts`, `README.md`, or the CI file. No state field is missing from `save` and `load`. `crates/sim` has no `HashMap` and no banned float call outside a test module.
- **Tests.** No assertion was weakened to pass. One was lost (M1). Six rules were broken by hand: four breaks failed tests and two did not.

## Checks

Counts must match digit for digit. "Same" means they do.

| # | Command | On record | Read here | Verdict |
|---|---|---|---|---|
| 1 | `make check` | `m2-exit.md:29`: exit 0 | Exit 0. 221 Rust tests, 88 Vitest tests. Load 3.3 to 4.2 | Same |
| 2 | `make gates` | `m2-exit.md:32-41`, `gates.md:281-285`, `417-420` | Exit 0. The 6 rows are the same. Native 3,091, WASM 2,992 at 1,320 creatures. 125 s, load 3.6 to 4.9 | Same. The record reads 3,411 and 3,127 |
| 3 | `make gates-long` | `gates.md:778-781`, `m2-exit.md:52` | Exit 0. The 3 rows are the same. 429 s, load 4.9 to 5.1 | Same |
| 4 | `gate-evolve --seeds 4,6 --ticks 144000` | None at the head. In the old world both failed (`m2-audit.md:346-347`) | `2/2 PASS`. Scent gaps 0.19, 0.25. Eye gaps 0.23, 0.23. `chemo` 0.20, 0.26. 232 s | New reading |
| 5 | `probe-plans --seed 1`, `2`, `3` | `m2-exit.md:73-90` | The 18 lines are the same | Same |
| 6 | `probe-heirs --seed 1`, `2`, `3` with `--pick 3000` | `m2-exit.md:114-116`, `gates.md:834-836` | Adults 0.67 of 801, 0.66 of 759, 0.66 of 725. All 9 rows | Same |
| 7 | `gate-health --seeds 1,2,3,4,5,6,7,8,9,10` | `m2-exit.md:48`, `m2-senses.md:525` | `10/10 PASS`. 1,105 to 1,408 creatures | Same |
| 8 | `gate-evolve --seeds 4,5,6,7,8,9,10` | `m2-senses.md:452-458` | The 7 rows are the same. `6/7 FAIL`, seed 7 `eye_gap=0.097`, exit 1 | Same |
| 9 | `probe-census --seeds 1,2,3,4,5,6,7,8,9,10 --ticks 144000 --every 36000` | `m2-senses.md:462-481` | `diff` of the 20 rows prints nothing. 484 s | Same |
| 10 | `run --seed 1 --ticks 36000 --creatures 400 --plants 1200 --out <scratch>` | `m2-exit.md:94-95` | `tick=36000 creatures=1448 plants=2229 hash=0087c54d` | Same |
| 11 | `node scripts/bench-wasm.mjs --settle 108000 --runs 3` | `m2-senses.md:530-532`: 2,357 `FAIL` at load 4.3 | `settled tick=108000 creatures=1648`, mean 1,665: same. 2,426 `PASS` at load 6.9, then 2,442 `PASS` at load 4.6 | Counts same. The verdict differs (L7) |
| 12 | `probe-crowd --seed 1`, `probe-plants --seed 1` | `gates.md:852-853`, `815-817` | Same line, and the same first and last row | Same |
| 13 | `cargo test --test snapshot`, with `vy` out of `save` and `load` | `gates.md:18` | 19 of 32 fail, exit 101. `45388520` and `2115269488`. `974657296` and `2377157895`. `vy is not in the hash` | Same |
| 14 | Six throughput proofs | `gates.md:104-148` | Section "Proofs" | Same counts |
| 15 | Twelve health commands | `gates.md:294-397` | Section "Proofs" | Same |
| 16 | Eleven `gate-evolve` commands | `gates.md:515-679` | Section "Proofs" | Same |
| 17 | `probe-plans --seed 1`, `5`, `8` with `--ticks 144000` | None | 75, 45, 65 plans. Commonest 22%, 29%, 16% | New reading |
| 18 | `bench --seed <n> --runs 1`, seeds 2 to 10 | `architecture.md:35`: "seeds 3 and 4 would be void" | Mean alive 1,264, 1,212, 1,124, 1,390, 1,121, 1,292, 1,204, 1,226, 1,223. Seeds 4 and 6 print `VOID`. Seed 8 is 4 over the line | Differs (L2) |
| 19 | `bench --settle 108000 --runs 3` | None | Native 2,511 at a mean of 1,664, load 4.2 | New reading |

Arithmetic on rows that cannot be typed at the head (every row with `part_upkeep`): the ranges in the tables of `m2-senses.md` Parts 2, 4, and 5 and of `m2-exit.md` match their rows, but for L4.

## Findings

No High finding.

### Medium

**M1. `eye_cost` in the mass of a body has no test.** New.
- Where: `crates/sim/src/creature.rs:245`, `crates/sim/tests/energy.rs:319`.
- Evidence: with `part_sum` changed to `self.plain_sum[s] + self.eye_sum[s]`, `cargo test --workspace` exits 0, and all 15 groups pass.
- Cause: the old test held `eye_cost` through the part upkeep. The new one compares `loss(0.0, 0.0)` with `loss(1.0, 0.0)`. At `part_mass` 0 the two are equal whatever `eye_cost` does.
- `Genome::part_sum` still has a test at `eye_cost` 2 (`tests/genome.rs:107`). That is the price of a child, not the mass of a body.
- Why it matters: `eye_cost` is a live parameter from 0 to 10. A part now costs through mass alone, so this is the whole cost of an eye.

**M2. `evolve::top_speed` and `evolve::turn_rate` have no test.** New as a finding. The first audit held the formula to the motor with a scratch test and filed nothing.
- Where: `crates/headless/src/evolve.rs:41`, `:52`, `:104`.
- Evidence: with the heft squared in `top_speed`, `cargo test --workspace` exits 0.
- The diff rewrote both formulas. They make `speed` and `speed_cv` of the gate row, `speed` and `turn` of the census, every plan row, and the ratio of `probe-crowd`. Clause 2 of the exit quotes them.
- The formulas are right at the head. A scratch test, not committed, drove 3 lone bodies for 150 ticks. Speed, formula against motor: 1.3631 and 1.3632, 0.7427 and 0.7428, 2.1966 and 2.1968. Turn: 0.1035, 0.1123, 0.0840 on both sides. No body had a fin.

**M3. On seed 1 at tick 144,000 about a third of the bodies have no chemoreceptor, and the record does not show it.** New.
- Where: `docs/findings/m2-exit.md:19`.
- Evidence, `probe-plans --seed 1 --ticks 144000`:
```
seed=1 tick=144000 creatures=1770 plans=75
seed=1 plan=flagellum+cilia+2filter+fin+eye share=0.22 len=8.5 top_speed=0.74 turn_rate=0.136 eye_angle=2.12
seed=1 plan=flagellum+cilia+2filter+eye share=0.06 len=8.9 top_speed=0.83 turn_rate=0.129 eye_angle=2.40
seed=1 plan=flagellum+2cilia+2filter+fin+eye share=0.04 len=8.8 top_speed=0.93 turn_rate=0.170 eye_angle=2.32
```
- Three of the eight commonest plans have no chemoreceptor. They hold 32% of the world. The eight plans hold 73%, so the share is at least 32%.
- At tick 36,000 on the same seed it is 11% (two plans, 6% and 5%). On seeds 5 and 8 at tick 144,000 it is at least 6% and 5%.
- The census reads `chemo=0.16 senseless=0.00` for that world, and the gate reads `chemo=0.16 chemo_blind=0.00 ... PASS`.
- `senseless` counts a body with no chemoreceptor and no eye. It prints to 2 places, and a part of size 0 counts as a part. So "No body is without a sense" says more than the probe reads.
- `chemo` on seed 1 reads 0.36, 0.25, 0.16, 0.16 at the four ticks. Nothing says where the share goes after tick 144,000.

**M4. `make gates-long` has rejected no world of the head.** Known and open: `gates.md:800` says "Not proven". The reading below is new.
- Where: `docs/gates.md:785-801`, `Makefile:40`.
- Why `chemo_gain=1` is a bad input: the direction of the scent has a quarter of its gain, so the sense pays less for the same mass. The reason was written before the runs.
```
$ target/release/tidepool-headless gate-health --param chemo_gain=1
gate-health 3/3 PASS                (mean_chemo 0.44, 0.47, 0.48)
$ target/release/tidepool-headless gate-evolve --param chemo_gain=1
gate-evolve 3/3 PASS                (scent gaps 0.22, 0.16, 0.20. Eye gaps 0.13, 0.10, 0.15)
$ target/release/tidepool-headless gate-evolve --seeds 1,5,8 --ticks 144000 --param chemo_gain=1
seed=1 creatures=1739 creatures_noscent=1717 creatures_noeye=1235 len=9.8 len_sd=1.09 parts=7.2 chemo=0.17 chemo_blind=0.00 eye=0.27 eye_blind=0.01 plans=7 speed_cv=0.24 speed=0.82 area=31.5 PASS
seed=5 creatures=1748 creatures_noscent=1595 creatures_noeye=1215 len=10.3 len_sd=1.56 parts=7.7 chemo=0.18 chemo_blind=0.01 eye=0.28 eye_blind=0.03 plans=5 speed_cv=0.31 speed=0.76 area=37.6 PASS
seed=8 creatures=1289 creatures_noscent=1285 creatures_noeye=933 len=11.5 len_sd=2.34 parts=5.4 chemo=0.05 chemo_blind=0.01 eye=0.26 eye_blind=0.03 plans=5 speed_cv=0.23 speed=0.76 area=50.7 FAIL(chemo_gap=0.045 < 0.1)
gate-evolve 2/3 FAIL                (exit 1, 404 s)
```
- So one world of the head passes everything in `make gates` and fails the long reading, on 1 of 3 seeds. Seeds 1 and 5 hold the sense as the default world does.
- One input did not work: `eye_cost=3` fails at tick 36,000 already (`eye_gap=0.053` on seed 8).
- Two inputs tried, one seed screened first. This is a reading, not a search.

**M5. Four sides of the health bands have rejected only worlds that another band also rejects for being empty.** Partly known: `gates.md:356` says it for `births_late`.
- Where: `docs/gates.md:355-358`.
- Evidence, the recorded rows run again:
  - `min_late` failed at 0, 0, 3, 0, each time with `creatures` under 150.
  - `plants` low failed at 6, with `creatures=4`.
  - `plants` high failed at 8,192, with `creatures=0`.
  - `births_late` failed at 0, 0, 4, 0, each with `creatures` under 150.
- New readings, seed 1, 12,000 ticks:
```
$ gate-health --seeds 1 --param plant_cell_cap=16 --param fert_radius=600 --param plant_seed_chance=1 --param plant_growth=0.005
seed=1 creatures=1085 min_late=718 plants=8192 births_late=1707 max_gen=14 mean_chemo=0.42 parked=0.00 ... FAIL(plants=8192 > 7000)
$ gate-health --seeds 1 --param bud_at=1 --param lifespan=24000 --param plant_growth=0.1
seed=1 creatures=303 min_late=303 plants=2229 births_late=0 max_gen=0 mean_chemo=0.50 parked=0.92 ... FAIL(births_late=0 < 20, max_gen=0 < 8, parked=0.92 > 0.25)
```
- `plants` high can reject a living world by itself. `births_late` can reject a world of 303 bodies.
- No input was found for `min_late` or `plants` low without `creatures`. Two tries at `births_late` ended under 150 creatures (116 and 141).

### Low

**L1. The `push_mass` switch is still in the arithmetic.** New. `crates/sim/src/motor.rs:90`: `1.0 + (2.0 * mass[j] / (mi + mass[j]) - 1.0)`. The comment says it is written so that the pinned rows round as before. The rule is right, and a share of 1 fails two tests.

**L2. Two doc lines are older than the head.** New. `m2-exit.md:144` says the docs match the head.
- `design.md:92`: "Every part costs energy to build, energy to keep, and mass to carry." A part has no upkeep of its own now.
- `architecture.md:35`: "It holds 1,148 to 1,477 creatures on seeds 1 to 3 ... seeds 3 and 4 would be void". At the head it holds 1,243 to 1,319, and the void seeds of 1 to 10 are 4 and 6 (check 18).

**L3. A comment gives the old size of a chance gap.** New. `crates/headless/src/evolve.rs:22`: "gaps of up to 0.07 by chance". `gates.md:704-707` reads -0.116 at the head.

**L4. One sentence disagrees with its rows.** New. `m2-senses.md:511-512`: speed "still falls from tick 36,000 on 9 of 10 seeds". The rows at lines 462-481 read lower at tick 144,000 on 10 of 10. Seed 2 goes from 0.85 to 0.81.

**L5. The exit record's gate rows are not the rows of the head.** New. `m2-exit.md:4` says every row was run at the head. Lines 38-40 end at `speed_cv=... PASS`. At the head each ends `speed=1.07 area=64.5 PASS`, and so on. The other columns are the same.

**L6. One claim of "it helps" is worded past its evidence.** New. `m2-exit.md:149-151`: scent is "the difference between a world that lives and one that dies". The seeing runs hold 80, 60, 69 creatures and the runs with no direction hold 13, 4, 0. All six are under the 150 that the gate calls died out. It is one run per seed, at tick 36,000, in a world that is not the default.

**L7. The old world reads over the floor here.** Known and decided (M8, carried to M5). The reading is new. `m2-exit.md:63`, `roadmap.md:118`, `architecture.md:35` say 2,357, under 2,400. Here the same world (1,648 settled, mean 1,665) read 2,426 at load 6.9 and 2,442 at load 4.6. One run of six was under: 2,373. Native read 2,511. So "under the floor" is not a stable reading: the world sits within 2% of the floor.

### Known and decided, read again and the same

- `gate-evolve` at tick 36,000 reads 9 of 10. Seed 7 fails the eye gap at 0.097 (H3, keep 0.10).
- Speed falls on every seed: 0.85 to 1.15 at tick 36,000, 0.73 to 0.99 at tick 144,000 (M3).
- The body shrinks: `area` 50 to 76, then 33 to 45. `len` 9.2 to 11.3 at tick 144,000, against a band floor of 7.8 (M7).
- `egg` reads 0.64 to 0.68 in every row (M9). `plans` and `speed_cv` have no band (M5).
- The fin test holds only at `fin_grip` 0.6 (L5, carried to M4).
- No plant dies after tick 4,000: `plant_deaths=0` on all 9 rows of `probe-plants`.

### The tests of the diff

14 test changes. Each still tests a rule.
- `a_slender_body_is_faster` is deleted with the M1 motor that it tested.
- `the_reference_body_pays_basal_for_each_unit_of_its_mass` is stronger: it holds an absolute loss.
- `top_speed_is_free_of_size_and_turning_is_not` is stronger: it moves the width too.
- One assertion was lost: M1.

Rules broken by hand, one at a time, each restored with `git checkout`:

| # | Break | Tests that failed |
|---|---|---|
| 1 | `energy.rs:95`: upkeep for the mass, not for the mass to the power 3/4 | 2: `a_small_body_pays_more_per_unit_of_mass` (`ratio 1`), `a_part_costs_upkeep_through_its_mass_alone` |
| 2 | `energy.rs:95`: the part upkeep put back at 0.0002 | 10 in `tests/energy.rs` |
| 3 | `creature.rs:246`: `eye_cost` ignored | **None** |
| 4 | `motor.rs:90`: a share of 1 | 2: `the_push_is_split_by_mass` (`got 1 want 9`), `the_push_counts_the_mass_of_the_parts` |
| 5 | `evolve.rs:46`: the heft squared in `top_speed` | **None** |
| 6 | `creature.rs`: `vy` out of `save` and `load` | 19 of 32 in `tests/snapshot.rs` |

## Proofs of the gates

Every command below ran at the head. Each gave the recorded exit code and counts. A `gate-evolve` row on record ends at `speed_cv`, and the row here has `speed` and `area` after it.

| Gate, band | Bad input on record | Run again | Result |
|---|---|---|---|
| Throughput, floor | `bench --floor 1000000000`, and the same for `bench-wasm.mjs` | Yes | `FAIL`, exit 1, both. 1,320 creatures. 3,334 and 3,089 |
| Throughput, void run | `--reference 5000`, both benches | Yes | `VOID: population fell`, exit 1, both |
| Throughput, young world | `--settle 200`, both benches | Yes | `settled tick=200 creatures=703 plants=1386`, mean 1,041, `VOID`, exit 1, both |
| Health, `creatures` low, `min_late`, `births_late`, `max_gen`, `mean_chemo` on an empty world | `plant_growth=0`, and `basal=0.01` | Yes | Both `0/3 FAIL`, exit 1. Same rows |
| Health, `plants` low | `--seeds 1 --param fert_blobs=1 --param fert_radius=20` | Yes | `creatures=4 min_late=3 plants=6 births_late=4 max_gen=6`, 5 bands, exit 1 |
| Health, `plants` high | The world of 8,192 plants with `basal=0.01` | Yes | `plants=8192 > 7000`, with `creatures=0`. Exit 1 |
| Health, `creatures` high, `parked` | The world with no upkeep | Yes | `creatures=4096 > 3000, max_gen=3 < 8, parked=0.96 > 0.25`. Exit 1 |
| Health, `max_gen` alone | `--seeds 1 --param grow_rate=0.0001` | Yes | `FAIL(max_gen=4 < 8)` in a world of 1,484. Exit 1 |
| Health, `mean_chemo` on a living world | `--ticks 36000 --param chemo_gain=0` | Yes | 0.05, 0.07, 0.16. `1/3 FAIL`, exit 1. Outside the protocol of the gate, as recorded |
| Health, recorded as passing | No mutation. `bud_cooldown=5000`. `chemo_gain=0` at 12,000 ticks | Yes | `PASS` with `max_gen=17`. `PASS` with `max_gen=37`. `3/3 PASS` with 0.38, 0.41, 0.45 |
| Health, usage | `--param part_upkeep=0`, `--m2` | Yes | Exit 2, both |
| Evolve, `creatures` | `fert_radius=25` | Yes | 80, 60, 69. 3 of 3. Exit 1 |
| Evolve, `chemo_blind run died` | `fert_radius=40` | Yes | `creatures_noscent` 156, 100, 161. Seed 2 alone. Exit 1 |
| Evolve, `eye_blind run died` | `fert_radius=50 scent_deposit=0` | Yes | `creatures_noeye` 229, 121, 234. Seed 2 alone. Exit 1 |
| Evolve, `len` | The five Start values | Yes | 6.35, 6.48, 6.72. 3 of 3. Exit 1 |
| Evolve, `len_sd` | The same and `mut_rate=0` | Yes | 0.56, 0.32, 0.55. Seed 2 alone. Exit 1 |
| Evolve, `len_sd` | `mut_rate=0 founder_sigma=0` | Yes | 0.00 on 3 of 3. Exit 1 |
| Evolve, `parts` | Parts only lost, no scent, no eye range | Yes | 2.11, 2.06, 2.16. 3 of 3. Exit 1 |
| Evolve, scent gap | `scent_deposit=0` | Yes | 0.000 on 3 of 3. Exit 1 |
| Evolve, eye gap | `eye_range=0` | Yes | 0.000 on 3 of 3. Exit 1 |
| Evolve, both gaps by chance | `chemo_gain=0.0001 eye_gain=0.0001` | Yes | Scent 0.008, 0.022, -0.116. Eye -0.003, -0.015, 0.008. Exit 1 |
| Evolve, the plan's `parts` input | Parts only lost, senses on | Yes | `3/3 PASS` with 3.8, 4.0, 3.7, as recorded |
| Evolve, the long reading | The old world with part upkeep. It cannot be typed at the head | No | No proof at the head on record. M4 has a new reading |
| Snapshot round trip | `vy` out of `save` and `load` | Yes | Check 13 |

What the proofs do not show:
- No band passed a world that its own text says it must fail.
- A band that no world of the head has rejected: the long reading (M4).
- Sides that have rejected only empty or near-empty worlds: M5.
- The two blind-run checks each fire on seed 2 alone. Seeds 1 and 3 of the `fert_radius=40` world hold 156 and 161 against a line of 150.
- The limits that `gates.md` states for itself still hold: `len_sd` on 1 of 3 seeds where the spread drains, a chance gap of -0.116 against a band of 0.10, and `mean_chemo` only outside the protocol.

Not run again: the CI row, and the fast gates but for the snapshot row (Clippy, the three ESLint rows, crate count, both format rows, type check, native equals WASM).

## Questions for the owner

1. **Does R1 read the mean of a sense, or the share of bodies that hold it?** The facts are in M3. No probe prints the share of bodies with no chemoreceptor.
2. **Is a world that fails on 1 of 3 seeds bad enough to be the proof of the long reading?** With `chemo_gain=1`, seed 8 reads `chemo` 0.05 at tick 144,000, and seeds 1 and 5 read 0.17 and 0.18. The same world passes `gate-health` and `gate-evolve` at tick 36,000 on 3 of 3.
3. **The fin is common at tick 144,000.** Decision L5 rests on a fin in 2% of bodies at tick 36,000. At tick 144,000 a fin is in 26% of the bodies of seed 1 (two of its eight commonest plans) and in at least 36% of seed 8 (six of eight). The mean fin sum is 0.03 and 0.05, so a fin there is about the size that a new part gets, 0.1. No reading says whether evolution uses it. At the default `fin_grip` a fin raises the slip.

## Not checked, and why

- **The page and the owner's five checks.** No browser was used. Two of the four pictures of `m2-exit.md` were looked at. They show bodies of different lengths, one or two tails, and white eye dots, as the builder says.
- **The report file.** The harness blocked a findings `.md` from this agent, so the report is in this reply and was not written to either path.
- **Any row that needs `part_upkeep`.** That is the baseline, controls 1 and 2, and trials 11 and 12 of `m2-senses.md`. The parameter is deleted. Only the arithmetic of the recorded rows was checked.
- **The cause claim of `m2-senses.md`, "The upkeep of a part is what removes the senses".** It rests on those rows. At the head the senses hold on 10 of 10 seeds with the rule gone, which agrees with it.
- **A gap reading at tick 144,000 on seeds 2, 3, 7, 9, 10.** About 12 minutes more. Five of ten seeds have one now.
- **Tick 12,000 and tick 24,000 rows of `probe-census --seeds 1 --ticks 36000`** (`gates.md:898-899`). Only the tick 36,000 row was read, in check 9.
- **Throughput on a quiet machine.** The lowest load at a timing was 3.4.
- **Native against WASM past tick 2,000 by hash.** Only counts were compared: 1,319 at tick 12,000 and 1,648 at tick 108,000 on both.
- **The count "Fourteen recorded inputs still reject"** of `m2-exit.md:142`. It reads 13, 14, or 15 by how the two benches are counted. Every one of them rejects.
- **`src/` of the page, and the TypeScript tests** but for the one line of the diff in `tests/host.test.ts`.
- **More breaks.** Six rules were broken. The first audit broke 22.
- **A second run of an arm.** The sim is deterministic, so every reading is one run per seed.

All run logs are in `/private/tmp/claude-501/-Users-joshtaylor-CodingProjects-life-sim/cccfe1e3-4a52-4366-98f7-c0c5f6392f37/scratchpad/a2/`: `A.log` (claims), `B.log` (proofs), `C.log` and `D.log` (new readings), `mut1.log` to `mut6.log` (breaks), `audit-formula.log` (the scratch test), and `make-check.log`.

## The orchestrator's check, 2026-10-13

The text above is the auditor's, word for word. This part is by the orchestrator of the session, who
ran the new readings again on `main` at the same code, one run at a time, at a load average of 5 to 7.
The harness kept the auditor from writing a file, so the orchestrator saved the report from the
auditor's reply.

| Claim of the audit | Checked how | Result |
|---|---|---|
| `make check` and `make gates` exit 0, same rows | Both run again | Exit 0. The 6 gate rows are the same. Native 3,493, WASM 3,200 |
| `make gates-long` passes, and seeds 4 and 6 pass | `gate-evolve --seeds 1,4,5,6,8 --ticks 144000` | `5/5 PASS`, 622 s. Seeds 1, 5, 8 are the recorded rows. Seeds 4 and 6 read the auditor's gaps |
| M1: no test holds `eye_cost` in the mass | Read the test, then broke `part_sum` | True. The break now fails one test, the new case, and nothing else |
| M2: no test holds `top_speed` and `turn_rate` | Broke `top_speed` (the heft squared) | True. The break now fails the new test: `speed 0.810 against 0.761` |
| M3: a third of seed 1 has no chemoreceptor at tick 144,000 | `probe-plans --seed 1 --ticks 144000`, then the census with two new columns | The 8 plan rows are the same. The census reads `no_chemo=0.38` on seed 1, more than the audit's lower bound of 0.32 |
| M4: `chemo_gain=1` passes the short gates and fails the long one on seed 8 | The long command on the five seeds | `4/5 FAIL`, exit 1. Seeds 1, 5, 8 are the auditor's rows. Seeds 4 and 6 pass |
| M5: two new inputs reject a living world | Both commands | The same rows, exit 1 |
| L2: the void seeds are 4 and 6 | `bench --seed 4 --runs 1`, and seed 6 | Both `VOID`. Seeds 2, 3, 5, 7 to 10 were not run again |
| L4: speed falls on 10 of 10 | Read the 20 rows | True |
| L7: the old world reads over the floor | `bench-wasm.mjs --settle 108000 --runs 3` | 2,454, 2,471, 2,493: `PASS` at a load average of 5.1 |
| Question 3: the fin is common at tick 144,000 | `probe-plans` on seeds 1 and 8 | 26% on seed 1 and 36% on seed 8, among the 8 commonest plans |
| The 20 census rows are the record | The census on 10 seeds, the new columns cut off, `diff` | No difference |

Not checked again: the 28 recorded proofs of `gates.md` (the auditor's log `B.log` holds them), the
six breaks other than the two above, `probe-heirs`, `probe-crowd`, `probe-plants`, and the snapshot
break.

### What the new columns read

`probe-census` now prints `no_chemo` and `no_eye`: the share of bodies with no part of that kind. On
10 seeds, one run per seed:

| Seed | `no_chemo` at tick 36,000 | 72,000 | 108,000 | 144,000 |
|---|---|---|---|---|
| 1 | 0.17 | 0.39 | 0.40 | 0.38 |
| 2 | 0.01 | 0.01 | 0.04 | 0.02 |
| 3 | 0.08 | 0.05 | 0.20 | 0.38 |
| 4 | 0.04 | 0.19 | 0.08 | 0.04 |
| 5 | 0.15 | 0.18 | 0.17 | 0.08 |
| 6 | 0.05 | 0.09 | 0.03 | 0.05 |
| 7 | 0.07 | 0.07 | 0.02 | 0.02 |
| 8 | 0.09 | 0.60 | 0.29 | 0.11 |
| 9 | 0.12 | 0.11 | 0.02 | 0.04 |
| 10 | 0.09 | 0.12 | 0.14 | 0.12 |

- `no_eye` reads 0.00 on every seed from tick 72,000. At tick 36,000 it reads 0.10 on seed 8 and 0.01
  on seeds 1 and 9.
- The share with no chemoreceptor is not a one-way loss. On seeds 4, 5, 8, and 9 it rises and then
  falls. On seed 8 the bodies with no chemoreceptor were 60% of the world at tick 72,000 and 11% at
  tick 144,000. On seed 1 the share holds near 0.39 for 72,000 ticks, and on seed 3 it still rises at
  the last row.
- What this does not show: why the bodies with no chemoreceptor lose ground again. No control ran.

Seeds 1 and 3 read on to tick 288,000, one run each
(`probe-census --seeds 1,3 --ticks 288000 --every 36000`, 220 s at a load average of 3 to 4):

| Tick | Seed 1 `no_chemo` | `chemo` | `area` | `speed` | Seed 3 `no_chemo` | `chemo` | `area` | `speed` |
|---|---|---|---|---|---|---|---|---|
| 144,000 | 0.38 | 0.16 | 34.8 | 0.84 | 0.38 | 0.19 | 43.4 | 0.81 |
| 180,000 | 0.34 | 0.16 | 36.8 | 0.85 | 0.44 | 0.18 | 41.1 | 0.77 |
| 216,000 | 0.48 | 0.12 | 36.7 | 0.87 | 0.18 | 0.20 | 38.7 | 0.79 |
| 252,000 | 0.34 | 0.17 | 35.5 | 0.79 | 0.08 | 0.19 | 37.1 | 0.82 |
| 288,000 | 0.36 | 0.13 | 36.1 | 0.80 | 0.08 | 0.24 | 38.9 | 0.78 |

- On seed 1 a third to a half of the bodies hold no chemoreceptor for 216,000 ticks, and the rest
  keep it: two kinds of body live side by side. On seed 3 the share falls back to 0.08.
- On these two seeds the chemoreceptor is not lost by tick 288,000, the area stops falling near 36
  to 39, and the speed holds near 0.8. No gate reads past tick 144,000, and no blind arm ran here, so
  this is a count and not a gap.

### The long reading and its proof (finding M4)

The target had no bad input of the head on record. Two were run on its five seeds.

1. **The chance input, both senses useless: `0/5 FAIL`.** `--param chemo_gain=0.0001 --param
   eye_gain=0.0001` fails both gap bands on every seed. The 10 gaps read from -0.022 to 0.021 against
   a band of 0.10. This is the proof that the target rejects a bad world of the head.
2. **The auditor's input, `chemo_gain=1`: `4/5 FAIL`, seed 8 alone.** It is weak. Four seeds hold the
   sense as the default world does. On seed 8 the same input passes at tick 72,000 (`chemo=0.21`),
   and the default world reads `chemo=0.12` at tick 72,000 on that seed, 0.02 over the band, and 0.17
   at tick 144,000. The mean of one seed moves by 0.1 or more between two readings in both worlds.

So the reading is proven to reject a world with useless senses. It is not proven to see a slow loss
that the short gate passes, at the head: the only record of that is the old world with part upkeep.
The rows are in `gates.md`, "The long reading".

A new fact for the band: the default world passed the scent gap on seed 8 at tick 72,000 by 0.02. The
gate reads tick 144,000, so nothing fails. The band is the owner's and did not change.

### What was fixed, and what was not

| Finding | State |
|---|---|
| M1 | Fixed. `a_part_costs_upkeep_through_its_mass_alone` has a case at `eye_cost` 2 |
| M2 | Fixed. `evolve::tests::the_formulas_read_what_the_motor_settles_at`: three lone bodies with no fin, 150 ticks, within 1% |
| M3 | The probe prints the share, and `m2-exit.md` says it. What R1 reads is the owner's question 1 |
| M4 | Fixed in part. The long reading has a proof at the head: the chance input, 0 of 5. An input that passes the short gate and fails the long one is still weak: `chemo_gain=1` fails on 1 of 5 seeds |
| M5 | The two new inputs are in `gates.md`. `min_late` and `plants` low are still open, and `gates.md` says so |
| L1 | Not fixed. The share in `motor.rs` is right, and a plain form of it rounds differently, so the change must pin the gate rows again. It goes with the next change to the motor |
| L2 | Fixed: `design.md` §5.2 and the reference world of `architecture.md` |
| L3 | Fixed: the comment in `evolve.rs` |
| L4 | Fixed: 10 of 10 in `m2-senses.md` |
| L5 | Fixed: the gate rows of `m2-exit.md` end with `speed` and `area` |
| L6 | Fixed: reworded in `m2-exit.md` |
| L7 | Fixed: four readings in `gates.md` "Throughput readings". `m2-exit.md`, `roadmap.md`, and `architecture.md` say "at the floor" |

No rule, band, floor, or default changed. `make check` and `make gates` exit 0 after the fixes.
