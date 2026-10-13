# M3: inputs from parts, and the rule of brain upkeep

The readings of Tasks 5, 6, and 7 of `../plans/2026-10-13-m3-minds.md`. Each is a reading, not a
trial: no default was tuned here. One run per seed, one simulation at a time.

## Before the rules change (Task 5)

Date: 2026-10-13. Head: `19a2c19`, with Tasks 1, 2, 3, and 4 merged. Every M3 rule is off.

- `make check`: exit 0. 92 Vitest tests.
- `make gates`: exit 0. The six rows of `gate-health` and `gate-evolve` are the M2 rows of the plan's
  "The switch-on rule", digit for digit. They were also read after each merge: the same.
- Throughput, at 1,320 creatures, load average 7.4 to 8.0 (other agents were building):

| Reading | Native | WASM |
|---|---|---|
| The head of M2 (`7895cd5`), load 3.8 to 8.0 | 3,123 | 2,997 |
| After Task 1 (`c3ab801`), load 5.9 to 6.1 | 3,355 | 3,111 |
| After Tasks 1 to 4 (`19a2c19`), load 7.4 to 8.0 | 3,132 | 3,081 |

So the skeleton costs no throughput that these readings can see. They move by 7% between two runs
of the same code on this machine. The last row is the "before" of the throughput readings below.

What each merge was held to, beyond the rows: one rule broken by the orchestrator, to see a test
fail.

| Task | Break | Result |
|---|---|---|
| 1 | `cmd_accept` not saved | `a_world_with_a_donor_is_the_same_in_a_reload` fails |
| 2 | A split puts the old weight on the way in | Two split tests fail |
| 3 | `mix_swap` and `mix_foreign` change places | Two tests fail |
| 4 | `readBrain` reads the target of a connection from the wrong bits | **No test failed.** Fixed in `16e5d49`: the round-trip test names the founder's first wired connection |

## Inputs from parts (Task 6)

Date: 2026-10-13. Commit `454e236`. The switch-on rule ends here on purpose: an Eye
declares two inputs per cone per gene, a body with no chemoreceptor has no scent input, the body
declares two mate inputs that read 0, and the brain has a third output, `accept`. The founder brain
is 13 inputs, 4 hidden neurons, 3 outputs, and 60 connections. No default changed. The upkeep rule is
still the M2 rule: every neuron and every connection costs.

`make check` exits 0. The orchestrator ran `gate-health` and `gate-evolve` again on `main`: the
six rows are the build agent's, digit for digit.

```
$ target/release/tidepool-headless gate-health
seed=1 creatures=1325 min_late=1239 plants=2229 births_late=1820 max_gen=14 mean_chemo=0.47 parked=0.00 first_bud=888 juv_starved=0.52 to_bud=0.33 PASS
seed=2 creatures=1270 min_late=1162 plants=2076 births_late=1814 max_gen=15 mean_chemo=0.36 parked=0.00 first_bud=848 juv_starved=0.51 to_bud=0.33 PASS
seed=3 creatures=1234 min_late=1097 plants=1965 births_late=1696 max_gen=14 mean_chemo=0.36 parked=0.00 first_bud=842 juv_starved=0.52 to_bud=0.32 PASS
gate-health 3/3 PASS
$ target/release/tidepool-headless gate-evolve --seeds 1,2,3,4,5,6,7,8,9,10
seed=1 creatures=1515 creatures_noscent=1670 creatures_noeye=1767 len=11.7 len_sd=1.36 parts=4.8 chemo=0.23 chemo_blind=0.01 eye=0.16 eye_blind=0.00 plans=7 speed_cv=0.29 speed=1.28 area=67.6 PASS
seed=2 creatures=1443 creatures_noscent=1485 creatures_noeye=1636 len=12.1 len_sd=1.50 parts=4.4 chemo=0.12 chemo_blind=0.00 eye=0.16 eye_blind=0.01 plans=4 speed_cv=0.24 speed=1.20 area=70.1 PASS
seed=3 creatures=1469 creatures_noscent=1568 creatures_noeye=1547 len=11.2 len_sd=1.99 parts=4.6 chemo=0.15 chemo_blind=0.03 eye=0.18 eye_blind=0.02 plans=4 speed_cv=0.26 speed=1.25 area=58.5 PASS
seed=4 creatures=1236 creatures_noscent=1407 creatures_noeye=1403 len=12.0 len_sd=1.92 parts=4.7 chemo=0.24 chemo_blind=0.01 eye=0.15 eye_blind=0.02 plans=7 speed_cv=0.26 speed=1.29 area=68.7 PASS
seed=5 creatures=1647 creatures_noscent=1567 creatures_noeye=1637 len=10.7 len_sd=2.20 parts=4.9 chemo=0.19 chemo_blind=0.04 eye=0.15 eye_blind=0.00 plans=4 speed_cv=0.24 speed=1.24 area=58.4 PASS
seed=6 creatures=1243 creatures_noscent=1324 creatures_noeye=1370 len=12.0 len_sd=1.40 parts=4.9 chemo=0.31 chemo_blind=0.03 eye=0.15 eye_blind=0.02 plans=5 speed_cv=0.26 speed=1.17 area=74.7 PASS
seed=7 creatures=1461 creatures_noscent=1606 creatures_noeye=1747 len=12.2 len_sd=1.63 parts=4.6 chemo=0.24 chemo_blind=0.01 eye=0.10 eye_blind=0.00 plans=6 speed_cv=0.26 speed=1.26 area=72.9 PASS
seed=8 creatures=1333 creatures_noscent=1526 creatures_noeye=1505 len=11.6 len_sd=1.20 parts=4.6 chemo=0.20 chemo_blind=0.01 eye=0.16 eye_blind=0.00 plans=3 speed_cv=0.26 speed=1.14 area=59.1 PASS
seed=9 creatures=1455 creatures_noscent=1461 creatures_noeye=1430 len=12.0 len_sd=1.83 parts=4.4 chemo=0.18 chemo_blind=0.01 eye=0.12 eye_blind=0.02 plans=5 speed_cv=0.27 speed=1.16 area=67.4 PASS
seed=10 creatures=1363 creatures_noscent=1499 creatures_noeye=1562 len=12.3 len_sd=1.86 parts=3.9 chemo=0.13 chemo_blind=0.02 eye=0.13 eye_blind=0.01 plans=5 speed_cv=0.36 speed=1.11 area=79.2 PASS
gate-evolve 10/10 PASS
```

**The stop rule of the plan is not triggered: 10 of 10 seeds pass at tick 36,000.** M2 read 9 of 10.

| Seed | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
|---|---|---|---|---|---|---|---|---|---|---|
| Scent gap | 0.22 | 0.12 | 0.12 | 0.23 | 0.15 | 0.28 | 0.23 | 0.19 | 0.17 | 0.11 |
| Eye gap | 0.16 | 0.15 | 0.16 | 0.13 | 0.15 | 0.13 | 0.10 | 0.16 | 0.10 | 0.12 |

The gaps are worked out from the printed values, to 2 places. Scent 0.11 to 0.28, against 0.17 to
0.37 in M2. Eye 0.10 to 0.16, against 0.097 to 0.19. Seeds 7 and 9 sit on the eye band of 0.10, and
seeds 2, 3, and 10 are within 0.02 of the scent band.

### What moved, and what is not shown

- **The senses are smaller.** `chemo` reads 0.12 to 0.31, against 0.33 to 0.39 in the M2 rows of seeds
  1 to 3. `parts` reads 3.9 to 4.9, against 5.2 to 6.1.
- **A blind world sheds its sense almost whole.** `chemo_blind` and `eye_blind` read 0.00 to 0.04. In
  M2 they read 0.05 to 0.16. That is why the gaps hold while the senses shrink.
- **A blind world holds more creatures than the seeing one:** the world with no scent on 9 of 10
  seeds, the world with blind eyes on 8 of 10. In M2 it was 1 of 3 and 0 of 3 on seeds 1 to 3. So "it
  helps" is not shown for either sense in this world, and the counts point the other way.
- The body is larger and faster: `len` 10.7 to 12.3, `area` 58 to 79, `speed` 1.11 to 1.29.
- **A likely cause, not measured:** the upkeep rule still charges every neuron and connection, and
  a body that drops a sense now drops its input neurons and their wires with it. Choice C1 named this:
  the M2 rule on a brain that follows its parts is the part upkeep again. Task 7 makes an input free.
  The reading that tests this is the Task 7 row at its Start values, below.

### Throughput

The first WASM reading was 2,166, under the floor, at a load average of 8.1 to 9.4 with runs from
1,934 to 2,778. The build agent then read the tree of `39f091b` and this commit in turn at a load of
7.2 to 7.6: 2,669 and 2,634 before, 2,759 and 2,830 after. So this commit is not slower than the one
before it at equal load, and the first reading is the machine. No reading here is from a quiet
machine.

### Choices of the build that the plan left open

- The 16 eye-to-hidden wires of a founder keep their M2 ids, 40 to 55, with the new names.
- The two mate weights are drawn after the biases and before the eye weights. Their ids are 59, 60.
- The `accept` output has a random bias, as thrust and turn have.
- A founder with no eye declares 9 inputs and holds 42 connections.
- A pair of cones whose second cone is past `MAX_EYES` keeps its A ports only.
- `sense::step` reads the scent only for a body that has scent inputs.
- The test `a_midline_eye_feeds_both_sides` became `a_midline_eye_declares_two_inputs`: a midline
  eye has no B input under rule B4, so its "left equals right" assertion has nothing to read.

### Still open from this task

- `control::apply` does not set `cmd_accept`, so the brain of a possessed body decides `accept`
  until Task 8 builds rule X3. A founder accepts, so every founder carries `FLAG_WILLING`. No page
  code reads that bit yet.
- An eye gene with history 0, or two eye genes with one history, repeat a name in `brain::ports`.
  Only `set_size` and a hand-made snapshot can make one. It does not panic.
- The orchestrator's break (`cmd_accept` read from the turn output) fails one test, in `frame.rs`.
  No test in `tests/brain.rs` holds the third output to its port. Task 8 tests it through mating.

## The rule of brain upkeep (Task 7)

Date: 2026-10-13. Commit `5fea147`. Rule U1:
`upkeep = basal * m + fixed_upkeep + neuron_upkeep * hidden + conn_upkeep * conns + move`, times the
old-age factor. An input neuron and an output neuron cost nothing. No default changed: `fixed_upkeep`
is still 0, so the default world has a brain that is too cheap until the retune of Task 10.

`make check` exits 0. The orchestrator ran the four readings again on `main`: every row is the build
agent's, digit for digit. The load average was 12 to 20, which moves no count.

### At the Start values

`fixed_upkeep=0.0337 neuron_upkeep=0.0002 conn_upkeep=0.00005`: a founder pays what it paid in M2.

```
$ target/release/tidepool-headless gate-health --param fixed_upkeep=0.0337 --param neuron_upkeep=0.0002 --param conn_upkeep=0.00005
seed=1 creatures=1309 min_late=1260 plants=2229 births_late=1788 max_gen=16 mean_chemo=0.49 parked=0.00 first_bud=882 juv_starved=0.52 to_bud=0.33 PASS
seed=2 creatures=1198 min_late=1175 plants=2076 births_late=1688 max_gen=14 mean_chemo=0.45 parked=0.00 first_bud=897 juv_starved=0.51 to_bud=0.33 PASS
seed=3 creatures=1290 min_late=1169 plants=1965 births_late=1908 max_gen=19 mean_chemo=0.46 parked=0.00 first_bud=829 juv_starved=0.52 to_bud=0.32 PASS
gate-health 3/3 PASS
$ target/release/tidepool-headless gate-evolve --seeds 1,2,3,4,5,6,7,8,9,10 --param fixed_upkeep=0.0337 --param neuron_upkeep=0.0002 --param conn_upkeep=0.00005
seed=1 creatures=1456 creatures_noscent=1479 creatures_noeye=1465 len=12.2 len_sd=1.66 parts=5.2 chemo=0.34 chemo_blind=0.06 eye=0.26 eye_blind=0.06 plans=4 speed_cv=0.21 speed=1.19 area=67.9 PASS
seed=2 creatures=1389 creatures_noscent=1318 creatures_noeye=1359 len=10.9 len_sd=1.56 parts=5.7 chemo=0.39 chemo_blind=0.14 eye=0.24 eye_blind=0.07 plans=3 speed_cv=0.27 speed=1.02 area=58.5 PASS
seed=3 creatures=1373 creatures_noscent=1296 creatures_noeye=1295 len=10.6 len_sd=1.19 parts=7.0 chemo=0.31 chemo_blind=0.15 eye=0.28 eye_blind=0.07 plans=3 speed_cv=0.29 speed=1.02 area=46.0 PASS
seed=4 creatures=1251 creatures_noscent=1249 creatures_noeye=1210 len=11.7 len_sd=1.20 parts=5.2 chemo=0.32 chemo_blind=0.09 eye=0.28 eye_blind=0.08 plans=6 speed_cv=0.24 speed=1.06 area=60.4 PASS
seed=5 creatures=1424 creatures_noscent=1488 creatures_noeye=1477 len=11.7 len_sd=1.31 parts=5.5 chemo=0.33 chemo_blind=0.08 eye=0.22 eye_blind=0.08 plans=4 speed_cv=0.22 speed=1.27 area=65.3 PASS
seed=6 creatures=1311 creatures_noscent=1177 creatures_noeye=1293 len=10.9 len_sd=1.53 parts=5.2 chemo=0.37 chemo_blind=0.14 eye=0.26 eye_blind=0.12 plans=4 speed_cv=0.26 speed=0.97 area=56.6 PASS
seed=7 creatures=1419 creatures_noscent=1397 creatures_noeye=1488 len=10.6 len_sd=1.58 parts=5.7 chemo=0.45 chemo_blind=0.10 eye=0.28 eye_blind=0.06 plans=5 speed_cv=0.22 speed=1.12 area=59.6 PASS
seed=8 creatures=1317 creatures_noscent=1246 creatures_noeye=1279 len=11.0 len_sd=1.85 parts=5.4 chemo=0.21 chemo_blind=0.00 eye=0.26 eye_blind=0.03 plans=3 speed_cv=0.21 speed=1.20 area=65.9 PASS
seed=9 creatures=1444 creatures_noscent=1295 creatures_noeye=1241 len=10.7 len_sd=1.23 parts=5.3 chemo=0.34 chemo_blind=0.24 eye=0.24 eye_blind=0.08 plans=4 speed_cv=0.34 speed=0.85 area=50.1 FAIL(chemo_gap=0.099 < 0.1)
seed=10 creatures=1187 creatures_noscent=1518 creatures_noeye=1366 len=13.2 len_sd=1.70 parts=5.5 chemo=0.45 chemo_blind=0.01 eye=0.22 eye_blind=0.08 plans=3 speed_cv=0.24 speed=1.09 area=75.1 PASS
gate-evolve 9/10 FAIL
```

**9 of 10 seeds pass. Seed 9 fails the scent gap at 0.099 against 0.10.** Its seeing world holds the
sense well (`chemo` 0.34). Its blind world kept 0.24 of a sense that does nothing there, and that is
what closes the gap. M2 also read 9 of 10, with seed 7 at an eye gap of 0.097. Seeds 1 to 3, which
are the reading that the plan asks for, pass.

| | M2 rows | Task 6: inputs from parts, M2 upkeep | Task 7: rule U1 at Start |
|---|---|---|---|
| `chemo`, seeing world | 0.33 to 0.39 (seeds 1 to 3) | 0.12 to 0.31 | 0.21 to 0.45 |
| `eye`, seeing world | 0.22 to 0.26 (seeds 1 to 3) | 0.10 to 0.18 | 0.22 to 0.28 |
| `parts` | 5.2 to 6.1 (seeds 1 to 3) | 3.9 to 4.9 | 5.2 to 7.0 |
| `chemo_blind` | 0.05 to 0.16 (seeds 1 to 3) | 0.00 to 0.04 | 0.00 to 0.24 |
| Scent gap | 0.17 to 0.37 | 0.11 to 0.28 | 0.099 to 0.44 |
| Eye gap | 0.097 to 0.19 | 0.10 to 0.16 | 0.14 to 0.23 |
| World with no scent holds more creatures | 1 of 3 | 9 of 10 | 3 of 10 |
| World with blind eyes holds more creatures | 0 of 3 | 8 of 10 | 4 of 10 |

**What this shows.** The cause named under Task 6 is supported: with an input free, the senses and
the part count come back to the M2 values on 10 seeds, and a blind world no longer gains by shedding
its sense. This is "the mechanism fires" and "evolution keeps it". It is one run per seed.

**What it does not show.** "It helps." A blind world still holds more creatures on 3 and 4 of 10
seeds, and each arm evolved alone. The eye gap has more room than in M2 (0.14 at the least, against
0.097). The scent gap does not: seed 9 is under the band and seeds 3, 4, 6, 8 read 0.16 to 0.23.

### With no parameter: the default world until Task 10

```
$ target/release/tidepool-headless gate-health
seed=1 creatures=1600 min_late=1451 plants=2229 births_late=2004 max_gen=14 mean_chemo=0.42 parked=0.00 first_bud=960 juv_starved=0.49 to_bud=0.34 PASS
seed=2 creatures=1498 min_late=1357 plants=2076 births_late=1843 max_gen=14 mean_chemo=0.43 parked=0.00 first_bud=973 juv_starved=0.48 to_bud=0.34 PASS
seed=3 creatures=1427 min_late=1310 plants=1965 births_late=1840 max_gen=14 mean_chemo=0.47 parked=0.00 first_bud=911 juv_starved=0.49 to_bud=0.34 PASS
gate-health 3/3 PASS
$ target/release/tidepool-headless gate-evolve
seed=1 creatures=1929 creatures_noscent=1974 creatures_noeye=2044 len=10.5 len_sd=1.58 parts=4.7 chemo=0.21 chemo_blind=0.01 eye=0.17 eye_blind=0.01 plans=5 speed_cv=0.29 speed=1.09 area=50.4 PASS
seed=2 creatures=1724 creatures_noscent=1735 creatures_noeye=1931 len=10.5 len_sd=1.43 parts=4.7 chemo=0.21 chemo_blind=0.04 eye=0.18 eye_blind=0.01 plans=5 speed_cv=0.25 speed=1.15 area=55.3 PASS
seed=3 creatures=1701 creatures_noscent=1721 creatures_noeye=1993 len=10.0 len_sd=1.48 parts=5.8 chemo=0.25 chemo_blind=0.01 eye=0.23 eye_blind=0.02 plans=5 speed_cv=0.30 speed=1.05 area=45.3 PASS
gate-evolve 3/3 PASS
```

Both gates pass, and this world is not one to keep: a founder pays 0.0228 for its brain against
0.0375 in M2, so the world is fuller (1,701 to 1,929 creatures at tick 36,000) and both blind worlds
hold more creatures on 3 of 3 seeds. Task 10 part 1 writes the Start values as defaults.

### Breaks

| By | Break | Tests that fail |
|---|---|---|
| Build agent | Both brain terms at 0 | `a_brain_costs_upkeep` (`0 2.2800002`), and three more. This closes break 7 of the first M2 audit |
| Build agent | An input neuron is charged | `a_hidden_neuron_costs_neuron_upkeep_and_an_input_costs_nothing` (`lost 16.999817, not 4`), and three more |
| Build agent | `fixed_upkeep` outside the old-age factor | `a_long_life_costs_more_per_tick` |
| Orchestrator | An output neuron is charged | Three tests, with `at_the_start_values_a_founder_pays_what_the_m2_founder_paid` |

### Still open from this task

- The comment above the parameter table in `params.rs` says that `neuron_upkeep` and `conn_upkeep`
  are tuned against both gates. It is stale until Task 10 sets the defaults.
- `hidden` in `energy.rs` is `n_neur - n_in - n_out` on `u16`. It cannot go under 0 while
  `Block::of` makes the three counts, and nothing in `energy.rs` guards it.
