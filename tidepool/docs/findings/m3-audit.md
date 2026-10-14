# M3 audit

Date: 2026-10-14. A fresh-context `auditor` at commit `77a096e`, in its own worktree. It read the
roadmap, design, architecture, `gates.md`, and `docs/findings/`, and not the plan. It fixed nothing. Its
report is below as it wrote it. What the orchestrator fixed is at the end.

I found nothing in the core rules that blocks the M3 exit. The gaps are in the written record, not in the code.

1. `make check`, `make gates` and `make gates-long` all exit 0 at `77a096e`. Every long-gate cell in `m3-tuning.md` "At the final defaults" matches my run digit for digit.
2. All four provisional bands (`hidden`, `conns`, `variety`, `speed_cv`) still reject their recorded bad input at today's defaults, 0/3 each time. The `speed_cv` proof matches `gates.md` digit for digit. The two brain-band proofs give different numbers from the record, because they were recorded before the defaults changed.
3. The short-gate rows (36,000 ticks) at the final defaults are written nowhere in the repo. The "Close" says they match "digit for digit", but nobody can check that.
4. Removing the connection-upkeep term from the core fails 3 tests. I put it back and the tree is clean.
5. About a dozen finding lines claim more than their evidence shows. There are 8 contradictions between `architecture.md` and the code, and 14 groups of tunable constants sit outside `params.rs`.

## Findings

**H1. The short-gate rows at the final defaults are not on record.**
- `docs/findings/m3-tuning.md:368-369` says: "`make gates` exits 0 with every gate row equal digit for digit to the agent's close". No such rows appear in any findings file.
- `docs/gates.md:451` ("The rows at the defaults of 2026-10-12") and the gate-health block (around line 287) still hold M2 rows.
- Evidence: searching `docs/` and `HANDOFF.md` for my rows (`creatures=1458`, `births_late=2498`, `1,458`) finds nothing.
- My rows are in Table 1. `gate-evolve` seed 1 reads `creatures=1633 … hidden=4.29 conns=60.0 variety=30.6`.
- Why High: comparing rows digit for digit is the project's only regression check for the short gate. At the M3 defaults there is nothing to compare against.
- Fix: paste the three `gate-health` rows and three `gate-evolve` rows into `m3-tuning.md` "Close". Replace the two default-row blocks in `gates.md` with them, labelled with the date and commit.

**M1. The brain-band proofs on record ran at the Start values, not today's defaults.**
- Files: `docs/gates.md:884-907`, `docs/findings/m3-brains.md:11-25`.
- Those proofs used `mut_conn_remove` 0.05, `fixed_upkeep` 0.0337 and mixing off. All three have changed since.
- My reruns at the defaults, seeds 1, 4, 5, tick 144,000, `--brain`:
  - Costly world (`--param neuron_upkeep=0.01 --param conn_upkeep=0.003`): `hidden` 0.02/0.04/0.04 and `conns` 8.1/8.7/7.9. Result 0/3, exit 1. The record says `conns` 1.4 to 2.7.
  - Frozen world (the four structural rates at 0): `variety=1.0` on all three seeds, and it is the only band that fails. Result 0/3, exit 1.
- In the new costly world, seeds 1 and 5 strip the brain and pass both sense gaps. So the limit at `m3-brains.md:68-69` ("No world is known that strips the brain and keeps both senses") is out of date. On those two seeds the brain bands are now the only thing that rejects.
- Fix: replace the proof rows in `gates.md` and the brain-band decision entry with these rows, and dated and commit-labelled.

**M2. `variety` counts hidden genes that no wire uses, so mixing can inflate it.**
- Code: `crates/headless/src/evolve.rs:178-179` defines a shape as `(m.hidden, m.core)`. `m.hidden` is every expressed hidden neuron, wired or not (`evolve.rs:158`).
- The findings say crossover leaves unwired donor genes behind: `m3-tuning.md:340-341`, "4.2 to 6.6 hidden genes against 3.3 to 3.9 wired".
- `variety` rose from 8.2–16.5 (stage 1, no mixing) to 15.7–39.1 (final).
- So the exit claim "brains differ in shape" is partly a measure of junk genes.
- Fix: print `variety` on `(wired, core)` beside today's value, and decide which one the band reads.

**M3. Overclaim in `docs/findings/m3-inputs.md:170-172`.**
- It says: "the senses and the part count come back to the M2 values on 10 seeds, and a blind world no longer gains by shedding its sense. This is 'the mechanism fires' and 'evolution keeps it'."
- The same file's table (`:161`, `:167-168`) shows:
  - M2 values exist for seeds 1 to 3 only.
  - `chemo` reads 0.21 to 0.45 against M2's 0.33 to 0.39, so seed 8 at 0.21 is below that range.
  - The blind world still holds more creatures on 3 and 4 of 10 seeds.
- Fix: "the senses return to about the M2 range on most seeds, and the blind world holds more creatures on 3/10 and 4/10 seeds, down from 9/10 and 8/10".

**M4. Unclear numbers and an untested cause in `docs/findings/m3-tuning.md:340-341`.**
- The line says "3.3 to 3.9 wired at tick 144,000". The table directly above (`:331-335`, seeds 1, 4, 5, 6, 8) has a `hidden` (wired) column reading 3.27 to 7.13.
- The line does not say which seeds or which probe it used.
- "A cross brings donor hidden genes" is not isolated from connection loss: on seed 1 only 0.1% of births are crosses by tick 144,000 (`:338-339`).
- Fix: name the seeds and the probe. Word it as "consistent with" until a run with mixing off compares hidden genes against wired ones.

**Low**
- **L1.** `m3-tuning.md:140`: "structural mutation of the brain is what lets the scent sense go, on 2 of 3 seeds". It is a causal claim from one paired run per seed. Write "goes with".
- **L2.** `m3-tuning.md:264`: "It helps, for eyes: the world with blind eyes holds fewer creatures on 5 of 5 seeds". `:342-345` words the same fact correctly as "consistent with". Use that wording here.
- **L3.** `m3-tuning.md:304`: "A cost on wires lets the scent sense go". That rests on one seed at 0.088 in one run.
- **L4.** `m3-tuning.md:306`: "the lever is spent" rests on one trial with two bench readings.
- **L5.** `m3-tuning.md:339`: "Mating is a feature of a young world" generalises from one run each on 3 seeds.
- **L6.** `m3-tuning.md:354`: "no bad input exists that an area band rejects and the `len` band passes" is reasoning; no input was searched for. Write "none is known".
- **L7.** `m3-tuning.md:358`: "the hypothesis that the top held it is refuted", while `:358-359` names a confound (a 40% larger mutation step). Write "not supported".
- **L8.** `m3-tuning.md:163-164`: "It cannot fall when brains come to differ more". This is false as worded. Shares [20,20] give 2.0; [30,9,1] has more shapes and gives 1.63. The test (`evolve.rs:395-414`) proves only that splitting a shape never lowers it. Say that instead.
- **L9.** `m3-brains.md:13,21`: still presents `shapes` as a live band. It was replaced at `919492a`. Also `:134`: "no selection to hold it" is wrong, because silent hidden neurons still pay upkeep, which is selection against them.
- **L10.** `m3-walkthrough.md` is out of date in three places:
  - `:38` "Beat 10 … waits for Task 13": `court` is in `BEATS` (`src/app/walkthrough.ts:19`) and tested (`tests/walkthrough.test.ts:276-284`).
  - `:49-50` "fail on purpose when mating is built": that pin was replaced by `tests/guide.test.ts:393`.
  - `:79` "The frame does not carry age": `45eeae5` added age to the frame.
- **L11.** `m3-tuning-hypotheses.txt:57` cites `8b2752d`, which is not on `main` (`merge-base --is-ancestor` exits 1). The commit on `main` is `f4d2ef3`.
- **L12.** `gates.md:767` still says "`plans` and `speed_cv` have no band", which `:909` contradicts. The summary row at `gates.md:24` lists no M3 band.
- **L13.** Five test setups zero the old upkeep terms but not `fixed_upkeep`, so their "no upkeep" setup is not true. `m3-tuning.md` Part 1 noted this and it is still open: `crates/sim/tests/motor.rs:14`, `world.rs:268`, `eye.rs:34-37`, `brain.rs:340`, `tests/host.test.ts:572`.
- **L14.** The `speed_cv` constant (`evolve.rs:32`) has no unit test. Also, `m3-tuning.md:362` says the bad input "fails 0/5", but the only printed proof (`gates.md:916-925`) covers 3 seeds.
- **L15.** `no_chemo` counts bodies with no chemoreceptor part. But a size-0 chemoreceptor declares no scent inputs (`brain.rs:104`), and the census counts it as a part (`gates.md` census, "A part of size 0 is still a part"). So `no_chemo` undercounts bodies without scent.
- **L16.** Known before the build, still true: `repro.rs:70-79` draws the child's genome, its history ids and now its `rng_mate` crossover draws before the parent is known to pay.
- **L17.** `AGENTS.md` says `make gates-long` takes "About 10 minutes". With `--brain` (4 runs per seed) it took 16 min 35 s (12:03:50 to 12:20:25, load 3.7 to 7.2).

## Step 1: gates (Table 1)

| Command | Exit | Load (1-minute) / time | Against the record |
|---|---|---|---|
| `make check` | 0 | 4.8 to 8.9 | 285 Rust tests and 263 Vitest tests. "Close" says 263 Vitest: matches |
| `make gates` | 0 | 7.6 to 7.4, 11:58 to 12:00 | Bench: native 2,887 and WASM 2,730 at 1,394 creatures. Record: 2,829 and 2,697 at load 8. Both clear the target of 2,600 and the floor of 2,400. Bench creature count 1,394 matches trial 2. Health and evolve rows cannot be compared (H1) |
| `make gates-long` | 0 | 6.2 to 3.7, 16 min 35 s | Matches digit for digit, below |

My `gate-health` rows: seed 1 `1458/1294/2229/2498/14/0.48`, seed 2 `1305/1196/2076/2340/17/0.46`, seed 3 `1213/1152/1964/2034/14/0.46`. All PASS.

My `gate-evolve` rows at 36,000 ticks, all PASS:

| Seed | creatures | len | parts | chemo / blind | eye / blind | speed_cv | hidden | conns | variety |
|---|---|---|---|---|---|---|---|---|---|
| 1 | 1633 | 10.0 | 7.5 | .35 / .16 | .25 / .07 | .25 | 4.29 | 60.0 | 30.6 |
| 2 | 1521 | 9.4 | 8.3 | .41 / .18 | .26 / .09 | .25 | 4.40 | 61.8 | 42.1 |
| 3 | 1341 | 10.3 | 7.2 | .38 / .15 | .25 / .11 | .24 | 4.13 | 58.1 | 41.1 |

The long gate against `m3-tuning.md:331-335`:
- Matching cells: `creatures`, `len`, `parts`, `chemo/blind`, scent gap, eye gap, `hidden`, `conns`, `variety`.
- Seeds and values: 1 (1689, 3.27, 46.7, 24.9), 4 (1338, 4.45, 62.4, 29.9), 5 (1618, 7.13, 72.6, 23.1), 6 (1437, 4.11, 45.6, 39.1), 8 (1246, 4.92, 61.6, 15.7). Result 5/5.
- Other claims that also match: the hidden gap −1.65 to +5.46, area 34.3 to 39.7, `speed_cv` 0.23 to 0.28.
- The table on record is partial. It leaves out `speed_cv`, `hidden_null`, `conns_null`, `shapes` and `speed`.

## Step 2: band proofs at the current defaults

| Band | Bad input | Read now | Rejects? |
|---|---|---|---|
| `speed_cv` | `mut_rate`, `mut_shape_rate`, `mut_part_add`, `mut_part_remove`, `mut_part_dup` all 0. Seeds 1–3, 36,000 ticks | 0.049, 0.058, 0.061. Digit for digit with `gates.md` | Yes, 0/3. Both sense gaps fail too |
| `hidden`, `conns` | `neuron_upkeep=0.01 conn_upkeep=0.003`. Seeds 1, 4, 5, 144,000 ticks | `hidden` .02/.04/.04, `conns` 8.1/8.7/7.9 | Yes, 0/3. Only seed 4 also fails a sense gap |
| `variety` | The four structural rates at 0. Seeds 1, 4, 5, 144,000 ticks | 1.0 on all three | Yes, 0/3. It is the only band that fails |

I wrote the expected readings before the runs, in `scratchpad/audit/expectations.txt`.

## Step 3: roadmap M3 bullets

| Bullet | Shown by |
|---|---|
| Variable-topology recurrent brains | `crates/sim/tests/brain.rs` `a_slow_neuron_remembers`, `a_neuron_reads_last_steps_values`; `tests/names.rs` `a_founder_expresses_the_m3_block` |
| Inputs come from parts | `brain.rs` `a_body_with_no_chemoreceptor_has_no_scent_input`; `eye.rs` `a_body_with_two_eye_genes_has_eight_eye_inputs_and_each_cone_feeds_its_own`; `names.rs` `a_child_that_loses_its_eye_gene_loses_those_connections` |
| Outputs come from parts | **None.** "No part declares an output" (`src/brain.rs:96`). No M3 part kind has an ability, so `design.md:139` expects part outputs from M4 |
| Brain upkeep | `energy.rs` `a_brain_costs_upkeep`, `a_hidden_neuron_costs_neuron_upkeep_and_an_input_costs_nothing`, `fixed_upkeep_is_paid_by_a_newborn_in_full` |
| Add and remove neurons and connections | `genome.rs` `a_removed_connection_is_gone_and_the_others_keep_their_history`, `a_removed_hidden_neuron_takes_its_connections`, `an_added_connection_has_a_new_history_and_joins_two_declared_neurons`, `a_split_keeps_the_old_weight_on_the_way_out_and_1_on_the_way_in` |
| Carried: area, egg, `plans`, `speed_cv` | Area, egg, `plans`: probe and trial readings only, no test (`m3-tuning.md` Part 5). `speed_cv`: the gate band (`evolve.rs:32`) and its proof run. No unit test |
| Mate contact and `accept` | `mate.rs` `two_adults_in_touch_that_both_accept_take_each_other_as_donor`, `one_refusal_stops_the_pair`; `brain.rs` `the_accept_output_becomes_the_accept_command`; `control.rs` `a_manual_player_accepts_only_while_courting` |
| Crossover by history id | `mix.rs` `genes_line_up_by_history_and_not_by_position`; `repro.rs` `the_brood_of_a_donor_holder_is_crossed_marked_and_clears_the_donor` |
| Mate-choice overlay | `tests/court.test.ts` "the card shows the two bodies, whether each is willing, and what the pair lacks" |
| Known: the child is drawn before the price | Still true (L16). No test |
| Brain viewer | `tests/host.test.ts:680` (live), `tests/brain-layout.test.ts:55` (part-grouped), `tests/brain-words.test.ts:92` (strongest path in words) |
| Walkthrough | `tests/walkthrough.test.ts`, `words.test.ts`, `guide.test.ts`. "Measured by beats a new player completes": **none**. The owner's playtest has not run |
| Exit: brains differ and are not minimal | `make gates-long` bands (`evolve.rs:42-51`), with the M2 caveat. The owner part ("watch, let go, see it take over"): `control.rs` `a_new_body_starts_with_its_brain_driving`, `tests/input.test.ts:97`. The owner's check is open |

## Step 4: claim kinds by file

- **`m3-inputs.md`:** "mechanism fires" and "evolution keeps it", plus "it helps, not shown". Overclaim at lines 170-172 (M3).
- **`m3-brains.md`:** "evolution keeps it", in the weak sense of "not stripped". "Uses" and "helps" are correctly marked as not shown. Out-of-date lines at 13, 21 and 134 (L9).
- **`m3-tuning.md`:** all three kinds. Overclaims at 140, 163, 264, 304, 306, 339, 340-341, 354, 358 (L1–L8, M4). The record gap at 368 (H1).
- **`m3-shapes.md`:** draw only; claims about drawing cost and appearance. No overclaim found.
- **`m3-walkthrough.md`:** "mechanism fires" only, and it says so at lines 7-10. Out-of-date lines 38, 49-50, 79 (L10).

## Step 5: rule removal

- I removed `+ conn_upkeep * brains.n_conn[s] as f32` from `crates/sim/src/energy.rs:104` and ran `cargo test --workspace`: exit 101.
- Three tests failed:
  - `a_brain_costs_upkeep`, `tests/energy.rs:471`: `0.47988892 2.2800002`
  - `a_body_that_drops_its_eye_saves_only_the_upkeep_of_the_wires_it_drops`, `:546`: `saved 0, not 3.6000001`
  - `at_the_start_values_a_founder_pays_what_the_m2_founder_paid`, `:567`
- Cargo stops at the first failing test binary, so other binaries did not run.
- Extra check, beyond the one asked for: I forced the mate inputs on with mixing off (`sense.rs:52`) and ran with `--no-fail-fast`. Only `the_mate_inputs_read_the_touched_body_and_0_alone` (`tests/mate.rs:356`) failed.
- I restored both files with `git checkout`. `git status --short` is empty and the head is `77a096e`.

## Step 6: tunable constants not in `params.rs` (Table 3)

| File:line | Constant | Why it is tunable |
|---|---|---|
| genome.rs:144 | `FOUNDER_EYE_EXTRA` 0.5 | Its own comment says "Set once, from 0.4", so it was tuned. That breaks `architecture.md:210` |
| brain.rs:76 | `STARTER_BIAS_SIGMA` 0.05 | Same role as `new_conn_sigma`, which is in the table |
| genome.rs:113-116 | `LEN_`/`WID_`/`EGG_`/`OLD_RANGE` | Kept as constants by a 2026-10-11 decision, but `EGG_RANGE` was tried at another value in Part 5. The decision and the practice disagree |
| genome.rs:122, 133, 135-141, 146 | Filter floor 0.2, `REF_PARTS` 2.1, founder part sizes and anchors, `FIN_ANCHOR` 0.6 | Founder body |
| genome.rs:154, 156, 158 | `WEIGHT_LIMIT` 8, `ALPHA_SIGMA` 0.1, `ALPHA_RANGE` (0.05, 1) | Mutation numbers. `ALPHA_SIGMA` has a stated reason |
| eye.rs:13, 15, 16 | `EYE_REACH` 64, `EYE_HALF_MIN` 0.2, `EYE_HALF_SPAN` 1.0 | Sight |
| motor.rs:15 | `SIDE_DRAG_MAX` 0.95 | Physics cap |
| plant.rs:18, 19, 23, 25, 27 | `RADIUS_MIN` 2, `RADIUS_SPAN` 6, `STAGGER` 8, `FOUNDER_RESERVE_MIN` 0.3, `FOUNDER_DRAWS` 50 | Plants |
| repro.rs:19, 23 | `HEADING_JITTER` 0.5, `BROOD_FAN` 0.7 | Its value is 0.5, but it is a tunable by role |
| field.rs:7 | `SCENT_CELL` 8 | Scent resolution |
| grid.rs:5 | `CELL` 32 | Coupled to `plant_cell_cap`, whose doc says "32-unit cell" |
| world.rs:26, 28 | `FOUNDER_ENERGY01` 0.5, `FOUNDER_TRIES` 8 | Founders |
| frame.rs:30, 32 | `MARGIN` 32, `BUD_FLASH` 40 | Borderline: page-facing, not rule code |

Excluded, with reason: `BOX_MARGIN` and `SCENT_FLOOR` (numeric guards); the `MAX_*` budgets; kinds, ports, flags and ABI words; inline geometry at `creature.rs:141,153` and `field.rs:50`.

## Step 7: `architecture.md` against the code

1. `:101` "Each phase is one function in its own module" vs `world.rs:229-231`: contact and life are both in `energy.rs`, and budding is `repro::step`.
2. `:120` "No stream is shared" vs `mate.rs:57` and `repro.rs:73`, which both draw `rng_mate`. `world.rs:71` documents that stream as the pair chance only.
3. `:125` "No float-to-int casts on values that can be NaN" vs `energy.rs:129` (`c.old[s] as u32`, and `Genome::load` does not check floats, `genome.rs:681-682`) and `frame.rs:41` ("NaN packs as 0"). Rust defines these casts, so determinism holds, but the rule as written is broken.
4. `:194` "three scent inputs if it has a chemoreceptor" vs `brain.rs:104`, which requires a size sum above 0.
5. `:203` "Layout reserves a per-connection `trace` array" vs `Brains` (`brain.rs:188-211`), which has no such field.
6. `:208-210` "Every tunable constant is a named f32 in one table … must not need tuning" vs Table 3, and `genome.rs:142-144` in particular.
7. `:35` "holds 1,243 to 1,319 creatures on seeds 1 to 3" vs today's `gate-health` 1,213 to 1,458, and a bench mean of 1,394 against the 1,320 cited.
8. `:314` the `bake` subcommand vs `crates/headless/src/main.rs:12-24`, which has no `bake`. The table at `:308-315` also omits `gate-evolve`.

`:75` lists three files under `app/`, but there are seven. That list is incomplete rather than contradicted.

## What I could not run or check

- Browser checks: the brain viewer and courting are the owner's checks, so I did not play them.
- Seeds 2, 3, 7, 9, 10 at tick 144,000, and the probe needed to confirm M2 and M4 (`probe-brains` on wired against all hidden genes). I traded these for running all three brain-band proofs on 3 seeds.
- The 36,000-tick gate rows have no record to compare against (H1).

Run logs are in `/private/tmp/claude-501/-Users-joshtaylor-CodingProjects-life-sim/761992a2-2cdd-4884-b382-72c0801e81d1/scratchpad/audit/`: `check.log`, `gates.log`, `gates-long.log`, `proof-speedcv.log`, `proof-costly.log`, `proof-frozen.log`, `break1.log`, `break2.log`, `expectations.txt`.

## What the orchestrator fixed

On `main` after `77a096e`, checked with `make check` (exit 0, 263 Vitest tests):

| Finding | What was done |
|---|---|
| H1 | The rows of `make gates` at the final defaults are in `m3-tuning.md` "Close" and in `m3-exit.md` |
| M1 | The proofs at the M3 defaults (the auditor's rows) are in `gates.md` "The brain bands", with the note that on seeds 1 and 5 the brain bands are the only rejector. `m3-brains.md` points to them |
| M2 | `gate-evolve` prints `variety_wired`, the variety of shapes on wired hidden neurons only, with no band. The long gate reads 12.2 to 38.5 against `variety` 15.7 to 39.1. Which one the band reads goes to the owner |
| M3 | `m3-inputs.md` says "about the M2 range on most of 10 seeds" and gives the blind-world counts |
| M4 | `m3-tuning.md` marks the unwired-gene line "not shown". `probe-brains` on seed 1 reads 4.21 hidden genes against 3.27 wired, which agrees for that seed |
| L1 to L8 | Reworded in `m3-tuning.md` as the auditor proposed |
| L9 | `m3-brains.md` says `variety` replaced `shapes`, and that silent neurons pay upkeep |
| L10 | `m3-walkthrough.md`: beat 10 is built, the guide pins name mixing, the frame carries age |
| L11 | A note in `m3-tuning-hypotheses.txt` names the commit on `main` |
| L12 | `gates.md` says `speed_cv` has a band and lists the M3 bands in its summary |
| L13 | The five test setups zero `fixed_upkeep` too. Their tests pass |
| L17 | `AGENTS.md` says the long gate takes about 17 minutes |
| Step 7 | `architecture.md`: the eight contradictions are corrected to what the code does |

Carried, with the reason:

- L14: no unit test for the `speed_cv` constant. The band has its proof run, as every gate band does.
- L15: `no_chemo` counts parts, not inputs. A census change; the M4 plan reads the senses again.
- L16: known since M2 (`roadmap.md`).
- Step 6: 14 groups of constants outside the parameter table. Moving them adds rows to the Lab panel
  and the ABI's parameter list. It is a task of its own, and `architecture.md` §5.6 now says the rule
  is not yet true.
