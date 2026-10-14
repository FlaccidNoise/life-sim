# M3: the rules switched on, and the retune (Task 10)

Date: 2026-10-13. One run per seed, one simulation at a time. The build agent ran every row. The
orchestrator ran `make check` and `make gates` again on `main` at `4f68451`: both exit 0, and the
six gate rows are the agent's, digit for digit. The long rows of seeds 1, 4, 5 are the rows of the
good world of Task 9, which the orchestrator also ran. Seeds 6 and 8 of the long reading are the
agent's alone until the close.

## Part 1: switched on, one group at a time

Each step wrote the Start values of one group as defaults, then read both gates. Readings, not
trials. Every step ends `gate-health 3/3 PASS` and `gate-evolve 3/3 PASS`.

| Step | Group | Commit |
|---|---|---|
| 1 | `fixed_upkeep` 0.0337, `neuron_upkeep` 0.0002, `conn_upkeep` 0.00005 | `9bb7350` |
| 2 | `mut_conn_add` 0.05, `mut_conn_remove` 0.05, `part_wires` 2 | `5e702c3` |
| 3 | `mut_neuron_add` 0.02, `mut_neuron_remove` 0.02 | `37d0e2d` |

After step 1 the rows of seeds 1 to 3 are the rows of Task 7 "At the Start values" in
`m3-inputs.md`, digit for digit in every column that both have.

```
$ target/release/tidepool-headless gate-evolve        (step 1)
seed=1 creatures=1456 creatures_noscent=1479 creatures_noeye=1465 len=12.2 len_sd=1.66 parts=5.2 chemo=0.34 chemo_blind=0.06 eye=0.26 eye_blind=0.06 plans=4 speed_cv=0.21 speed=1.19 area=67.9 hidden=4.00 conns=56.6 shapes=1 shapes_raw=2 variety=1.0 PASS
seed=2 creatures=1389 creatures_noscent=1318 creatures_noeye=1359 len=10.9 len_sd=1.56 parts=5.7 chemo=0.39 chemo_blind=0.14 eye=0.24 eye_blind=0.07 plans=3 speed_cv=0.27 speed=1.02 area=58.5 hidden=4.00 conns=59.2 shapes=1 shapes_raw=2 variety=1.0 PASS
seed=3 creatures=1373 creatures_noscent=1296 creatures_noeye=1295 len=10.6 len_sd=1.19 parts=7.0 chemo=0.31 chemo_blind=0.15 eye=0.28 eye_blind=0.07 plans=3 speed_cv=0.29 speed=1.02 area=46.0 hidden=4.00 conns=59.6 shapes=1 shapes_raw=1 variety=1.0 PASS
gate-evolve 3/3 PASS
$ target/release/tidepool-headless gate-evolve        (step 2)
seed=1 creatures=1459 creatures_noscent=1475 creatures_noeye=1438 len=11.8 len_sd=1.82 parts=5.4 chemo=0.35 chemo_blind=0.16 eye=0.23 eye_blind=0.05 plans=5 speed_cv=0.22 speed=1.13 area=64.8 hidden=4.00 conns=57.3 shapes=4 shapes_raw=5 variety=2.7 PASS
seed=2 creatures=1353 creatures_noscent=1480 creatures_noeye=1303 len=11.2 len_sd=1.19 parts=5.4 chemo=0.38 chemo_blind=0.03 eye=0.24 eye_blind=0.09 plans=3 speed_cv=0.20 speed=1.21 area=58.3 hidden=4.00 conns=58.5 shapes=3 shapes_raw=4 variety=2.0 PASS
seed=3 creatures=1258 creatures_noscent=1335 creatures_noeye=1297 len=12.1 len_sd=1.44 parts=5.2 chemo=0.37 chemo_blind=0.10 eye=0.22 eye_blind=0.10 plans=5 speed_cv=0.28 speed=1.14 area=67.7 hidden=4.00 conns=57.1 shapes=3 shapes_raw=5 variety=2.9 PASS
gate-evolve 3/3 PASS
$ target/release/tidepool-headless gate-health        (step 3: the default world from here)
seed=1 creatures=1322 min_late=1263 plants=2229 births_late=1800 max_gen=13 mean_chemo=0.48 parked=0.00 first_bud=872 juv_starved=0.52 to_bud=0.32 PASS
seed=2 creatures=1270 min_late=1182 plants=2076 births_late=1791 max_gen=16 mean_chemo=0.45 parked=0.00 first_bud=884 juv_starved=0.51 to_bud=0.33 PASS
seed=3 creatures=1259 min_late=1154 plants=1965 births_late=1737 max_gen=16 mean_chemo=0.48 parked=0.00 first_bud=871 juv_starved=0.52 to_bud=0.33 PASS
gate-health 3/3 PASS
$ target/release/tidepool-headless gate-evolve        (step 3)
seed=1 creatures=1551 creatures_noscent=1459 creatures_noeye=1452 len=10.7 len_sd=1.65 parts=5.8 chemo=0.40 chemo_blind=0.06 eye=0.22 eye_blind=0.07 plans=2 speed_cv=0.30 speed=1.08 area=57.0 hidden=3.87 conns=54.9 shapes=5 shapes_raw=5 variety=7.2 PASS
seed=2 creatures=1365 creatures_noscent=1376 creatures_noeye=1376 len=11.8 len_sd=1.56 parts=5.2 chemo=0.27 chemo_blind=0.15 eye=0.26 eye_blind=0.11 plans=4 speed_cv=0.26 speed=1.11 area=60.4 hidden=4.10 conns=55.6 shapes=6 shapes_raw=5 variety=5.8 PASS
seed=3 creatures=1333 creatures_noscent=1354 creatures_noeye=1257 len=11.2 len_sd=1.84 parts=5.2 chemo=0.41 chemo_blind=0.06 eye=0.22 eye_blind=0.12 plans=3 speed_cv=0.29 speed=1.05 area=58.2 hidden=3.83 conns=53.1 shapes=6 shapes_raw=6 variety=9.7 PASS
gate-evolve 3/3 PASS
```

- `conns` holds at 57 to 59 with connection mutations alone, and first falls, to 53 to 56, when
  neuron mutations go on. "The mechanism fires", one run per seed, at tick 36,000.
- `variety`, the effective number of brain shapes, reads 1.0 with no structural mutation, 2.0 to 2.9
  with connection mutations, and 5.8 to 9.7 with neuron mutations as well.

Tests that followed a default: each now sets the parameter it needs, and no assertion or pinned
number changed. One hole: `a_brain_costs_upkeep` sets the two M2 rates itself, so no test now holds
"the default brain is not free". Five tests zero the old upkeep terms but not `fixed_upkeep`
(`motor.rs:14`, `eye.rs:35`, `world.rs:268`, `brain.rs:340`, `tests/host.test.ts:539`). They pass, and
their "no upkeep" setup is no longer true.

## Part 2: where the switched-on world stands

`make gates` exits 0. Throughput at 1,340 creatures: native 2,902 and WASM 2,715 at a load average
of 3.7 to 3.9 (the agent), native 3,216 and WASM 2,878 at a load of 5.3 to 5.9 (the orchestrator).
The old world (`--settle 108000`, 1,737 creatures) reads 2,318 against a floor of 2,400. That
reading has no band and is carried to M5.

### The long reading, with the brain bands

```
$ target/release/tidepool-headless gate-evolve --seeds 1,4,5,6,8 --ticks 144000 --brain
seed=1 creatures=1704 creatures_noscent=1662 creatures_noeye=1261 len=10.2 len_sd=1.50 parts=5.8 chemo=0.14 chemo_blind=0.00 eye=0.29 eye_blind=0.01 plans=3 speed_cv=0.27 speed=0.85 area=34.5 hidden=3.52 conns=36.7 shapes=4 shapes_raw=3 variety=13.1 hidden_null=0.34 conns_null=10.3 PASS
seed=4 creatures=1342 creatures_noscent=1363 creatures_noeye=1096 len=10.5 len_sd=1.58 parts=6.2 chemo=0.12 chemo_blind=0.03 eye=0.28 eye_blind=0.04 plans=5 speed_cv=0.33 speed=0.83 area=42.2 hidden=3.04 conns=34.7 shapes=6 shapes_raw=1 variety=20.8 hidden_null=3.69 conns_null=37.2 FAIL(chemo_gap=0.094 < 0.1)
seed=5 creatures=1682 creatures_noscent=1770 creatures_noeye=1234 len=10.5 len_sd=1.44 parts=6.4 chemo=0.19 chemo_blind=0.02 eye=0.26 eye_blind=0.01 plans=6 speed_cv=0.29 speed=0.92 area=38.4 hidden=3.85 conns=42.6 shapes=4 shapes_raw=3 variety=20.7 hidden_null=2.75 conns_null=26.0 PASS
seed=6 creatures=1503 creatures_noscent=1514 creatures_noeye=1104 len=10.1 len_sd=1.46 parts=6.7 chemo=0.20 chemo_blind=0.01 eye=0.44 eye_blind=0.03 plans=5 speed_cv=0.29 speed=0.81 area=37.5 hidden=3.45 conns=39.7 shapes=3 shapes_raw=4 variety=21.2 hidden_null=3.21 conns_null=35.8 PASS
seed=8 creatures=1321 creatures_noscent=1453 creatures_noeye=1019 len=9.7 len_sd=1.30 parts=6.6 chemo=0.07 chemo_blind=0.00 eye=0.27 eye_blind=0.03 plans=3 speed_cv=0.23 speed=0.89 area=38.0 hidden=2.53 conns=28.6 shapes=4 shapes_raw=5 variety=12.1 hidden_null=2.72 conns_null=30.7 FAIL(chemo_gap=0.068 < 0.1)
gate-evolve 3/5 FAIL
```

**3 of 5. No brain band fails. Seeds 4 and 8 fail the scent gap of M2: 0.094 and 0.068 against
0.10.** In M2 the same five seeds passed.

### Brains, by probe

| Seed | Tick | Hidden, mean | Connections, mean | `variety` | Commonest shape | Bodies with a scent wire | Bodies that accept a mate |
|---|---|---|---|---|---|---|---|
| 1 | 36,000 | 3.87 | 54.9 | 7.2 | 0.29 | 0.90 | 0.96 |
| 2 | 36,000 | 4.10 | 55.6 | 5.8 | 0.35 | 0.83 | 0.99 |
| 3 | 36,000 | 3.83 | 53.1 | 9.7 | 0.20 | 0.90 | 0.96 |
| 1 | 144,000 | 3.52 | 36.7 | 13.1 | 0.20 | 0.36 | 0.66 |
| 2 | 144,000 | 4.28 | 51.3 | 17.4 | 0.13 | 0.77 | 0.97 |
| 3 | 144,000 | 3.43 | 35.2 | 27.3 | 0.13 | 0.33 | 0.94 |

On seed 1 at tick 144,000 a brain holds 1 to 7 hidden neurons and 14 to 58 connections. So brains
in one world differ in shape. A third of the bodies of seed 1 refuse a mate: the `accept` output is
not stuck open, which the plan feared (soft spot 6). No rule reads it yet.

### The `shapes` band rejected the most varied world

Seed 3 at tick 144,000 reads `shapes=1 variety=27.3 FAIL(shapes=1 < 2)`: only one shape reaches a
share of 5%, because there are so many. Seed 3 is not a seed of the long gate, so the gate did not
fail, and the band is wrong all the same. **The provisional `shapes` band is replaced by a band on
`variety`, proven on the frozen world, in Part 3.** `shapes` prints with no band.

### Who holds a chemoreceptor

The share of bodies with no chemoreceptor, by `probe-census`. The second table is the same world
with the four structural rates at 0: brains cannot change shape, and `prune` and `part_wires` are
as in the first.

```
$ target/release/tidepool-headless probe-census --seeds 1,4,8 --ticks 144000 --every 36000
seed=1 tick=36000 creatures=1551 chemo=0.40 eye=0.22 parts=5.8 no_chemo=0.09 no_eye=0.01
seed=1 tick=72000 creatures=1669 chemo=0.17 eye=0.31 parts=6.0 no_chemo=0.49 no_eye=0.00
seed=1 tick=108000 creatures=1685 chemo=0.15 eye=0.30 parts=6.0 no_chemo=0.50 no_eye=0.00
seed=1 tick=144000 creatures=1704 chemo=0.14 eye=0.29 parts=5.8 no_chemo=0.57 no_eye=0.00
seed=4 tick=36000 creatures=1228 chemo=0.25 eye=0.20 parts=5.1 no_chemo=0.34 no_eye=0.04
seed=4 tick=72000 creatures=1365 chemo=0.27 eye=0.22 parts=6.2 no_chemo=0.16 no_eye=0.04
seed=4 tick=108000 creatures=1429 chemo=0.21 eye=0.29 parts=6.4 no_chemo=0.10 no_eye=0.01
seed=4 tick=144000 creatures=1342 chemo=0.12 eye=0.28 parts=6.2 no_chemo=0.20 no_eye=0.00
seed=8 tick=36000 creatures=1289 chemo=0.25 eye=0.21 parts=5.5 no_chemo=0.18 no_eye=0.02
seed=8 tick=72000 creatures=1391 chemo=0.24 eye=0.27 parts=6.7 no_chemo=0.27 no_eye=0.00
seed=8 tick=108000 creatures=1473 chemo=0.20 eye=0.27 parts=6.9 no_chemo=0.42 no_eye=0.00
seed=8 tick=144000 creatures=1321 chemo=0.07 eye=0.27 parts=6.6 no_chemo=0.77 no_eye=0.00
$ ... --param mut_conn_add=0 --param mut_conn_remove=0 --param mut_neuron_add=0 --param mut_neuron_remove=0
seed=1 tick=36000 creatures=1444 chemo=0.29 eye=0.25 parts=5.4 no_chemo=0.18 no_eye=0.02
seed=1 tick=72000 creatures=1664 chemo=0.21 eye=0.25 parts=5.9 no_chemo=0.02 no_eye=0.00
seed=1 tick=108000 creatures=1554 chemo=0.24 eye=0.26 parts=5.8 no_chemo=0.07 no_eye=0.00
seed=1 tick=144000 creatures=1766 chemo=0.21 eye=0.25 parts=6.0 no_chemo=0.04 no_eye=0.00
seed=4 tick=36000 creatures=1180 chemo=0.32 eye=0.20 parts=5.5 no_chemo=0.16 no_eye=0.02
seed=4 tick=72000 creatures=1251 chemo=0.29 eye=0.25 parts=5.9 no_chemo=0.24 no_eye=0.00
seed=4 tick=108000 creatures=1318 chemo=0.25 eye=0.32 parts=7.4 no_chemo=0.20 no_eye=0.00
seed=4 tick=144000 creatures=1332 chemo=0.20 eye=0.32 parts=7.5 no_chemo=0.22 no_eye=0.00
seed=8 tick=36000 creatures=1331 chemo=0.33 eye=0.23 parts=5.5 no_chemo=0.25 no_eye=0.01
seed=8 tick=72000 creatures=1445 chemo=0.27 eye=0.28 parts=6.4 no_chemo=0.26 no_eye=0.00
seed=8 tick=108000 creatures=1364 chemo=0.13 eye=0.31 parts=7.1 no_chemo=0.17 no_eye=0.00
seed=8 tick=144000 creatures=1512 chemo=0.12 eye=0.31 parts=7.7 no_chemo=0.06 no_eye=0.00
```

With brain structure frozen, bodies with no chemoreceptor lose ground again, as they did in M2
(seed 8 of M2: 9%, 60%, 29%, 11%). With structural mutation on, they take over on seeds 1 and 8: 57%
and 77% at tick 144,000. `eye` does not fall in either world, and no body is without an eye.

What this shows: losing the scent sense goes with structural mutation of the brain, on 2 of 3 seeds,
one paired run per seed.
"Evolution keeps it" fails for scent there. What it does not show: why. Two readings fit, and no run
tells them apart yet. The wiring of the carriers is worn down by the loss of wires and neurons, or
bodies with no chemoreceptor got better by new wiring. One given wire is lost by mutation alone on
about 6% of lines in 65 generations, and the scent-wire share fell from 0.9 to 0.33, so selection or
hitch-hiking moves it too. And "it helps" was never shown for scent: the world with no scent holds
more creatures on 4 of 5 seeds here.

### Against the five targets, before any trial

| # | Target | State |
|---|---|---|
| 1 | `gate-health` 3 of 3 | Met |
| 2 | `make gates` exits 0, WASM 2,700 or more at 1,200 creatures or more | Met with no margin: 2,715 and 2,878 on two readings |
| 3 | The M2 bands at tick 36,000, 3 of 3 | Met. Thin: seed 3's eye gap prints as 0.10 and seed 2's scent gap as 0.12 |
| 4 | The M2 bands at tick 144,000, 5 of 5 | **Not met: 3 of 5, the scent gap** |
| 5 | The brain bands at tick 144,000, 5 of 5 | Met for `hidden` and `conns`. `shapes` is replaced |

## Part 3: the band of variety, and two trials

### The band of `shapes` is replaced by a band of `variety` (`919492a`)

`variety` is the effective number of brain shapes: 1 over the sum of the squared shares of the pairs
(hidden genes, connections with no end on an input of a sense), every shape counted. Splitting a shape in
two never lowers it (the test `variety_is_the_effective_number_of_shapes`), and `shapes` can fall
that way. It can fall when shares shift: [20, 20] reads 2.0 and [30, 9, 1] reads 1.63. The band fails under 2.0 with `--brain`.
`shapes` prints with no band. Proof, the frozen world of Task 9 (the four structural rates at 0):

```
seed=1 creatures=1766 creatures_noscent=1735 creatures_noeye=1340 len=11.0 len_sd=1.33 parts=6.0 chemo=0.21 chemo_blind=0.00 eye=0.25 eye_blind=0.03 plans=5 speed_cv=0.32 speed=0.84 area=40.2 hidden=4.00 conns=58.1 shapes=1 shapes_raw=2 variety=1.0 hidden_null=4.00 conns_null=56.3 FAIL(variety=1.0 < 2)
seed=4 creatures=1332 creatures_noscent=1369 creatures_noeye=965 len=9.8 len_sd=1.26 parts=7.5 chemo=0.20 chemo_blind=0.02 eye=0.32 eye_blind=0.02 plans=6 speed_cv=0.27 speed=0.84 area=42.7 hidden=4.00 conns=57.3 shapes=1 shapes_raw=4 variety=1.0 hidden_null=4.00 conns_null=47.0 FAIL(variety=1.0 < 2)
seed=5 creatures=1618 creatures_noscent=1598 creatures_noeye=1285 len=10.9 len_sd=1.29 parts=7.4 chemo=0.26 chemo_blind=0.00 eye=0.30 eye_blind=0.02 plans=6 speed_cv=0.26 speed=0.85 area=38.9 hidden=4.00 conns=61.6 shapes=1 shapes_raw=4 variety=1.0 hidden_null=4.00 conns_null=46.2 FAIL(variety=1.0 < 2)
gate-evolve 0/3 FAIL
```

Exit 1 on 3 of 3, and no other band fails. The good rows read 12.1 to 21.2. Provisional.

### The trials

Each at tick 144,000 on the five seeds of the long gate, with the hypothesis written before the run
(`trial-<n>-hypothesis.txt` in the session's log folder). The session's log folder was in `/private/tmp` and was lost in a machine restart on 2026-10-14. The rows pasted in this file are the record. The hypothesis as written before the run cannot be shown. Each cell lists seeds 1, 4, 5, 6, 8.

| | The Start values | Trial 1: `mut_conn_remove=0.01` | Trial 2: `mut_neuron_remove=0.005` |
|---|---|---|---|
| Hypothesis | | The loss of single wires wears down the scent wiring of the carriers | The loss of hidden neurons drains the brain and wears down the scent wiring |
| `chemo` | 0.14, 0.12, 0.19, 0.20, 0.07 | 0.21, 0.18, 0.24, 0.22, 0.15 | 0.18, 0.19, 0.17, 0.24, 0.18 |
| `chemo_blind` | 0.00, 0.03, 0.02, 0.01, 0.00 | 0.03, 0.00, 0.00, 0.01, 0.00 | 0.01, 0.01, 0.01, 0.06, 0.01 |
| Scent gap | 0.14, 0.094, 0.17, 0.19, 0.068 | 0.18, 0.18, 0.24, 0.21, 0.15 | 0.17, 0.18, 0.16, 0.18, 0.17 |
| Eye gap | 0.28, 0.24, 0.25, 0.41, 0.24 | 0.27, 0.26, 0.23, 0.29, 0.29 | 0.28, 0.25, 0.28, 0.27, 0.24 |
| `hidden` | 3.52, 3.04, 3.85, 3.45, 2.53 | 3.32, 3.08, 3.34, 2.50, 1.47 | 3.74, 5.20, 4.00, 4.91, 5.02 |
| `conns` | 36.7, 34.7, 42.6, 39.7, 28.6 | 42.2, 41.9, 48.9, 32.4, 24.1 | 47.3, 54.9, 47.7, 50.2, 52.2 |
| `variety` | 13.1, 20.8, 20.7, 21.2, 12.1 | 14.5, 16.0, 8.2, 16.5, 8.8 | 20.0, 10.6, 21.8, 19.9, 16.5 |
| `len` | 10.2, 10.5, 10.5, 10.1, 9.7 | 11.1, 10.5, 11.4, 9.7, 10.7 | 8.2, 10.2, 9.0, 10.3, 10.2 |
| Pass at tick 144,000 | 3 of 5 | **5 of 5** | 5 of 5 |
| `gate-health`, `gate-evolve` at tick 36,000 | 3 of 3, 3 of 3 | 3 of 3, 3 of 3 | 3 of 3, **2 of 3** (seed 2, eye gap 0.095) |
| `no_chemo`, seed 1, at 36k, 72k, 108k, 144k | 0.09, 0.49, 0.50, 0.57 | 0.17, 0.03, 0.12, 0.29 | 0.09, 0.24, 0.15, 0.06 |
| `no_chemo`, seed 8 | 0.18, 0.27, 0.42, 0.77 | 0.21, 0.13, 0.09, 0.07 | 0.12, 0.10, 0.17, 0.24 |

- **Trial 1 holds its hypothesis on the five seeds of the gate.** The build agent's own forecast, a
  partial change at most, was wrong.
- **Trial 2 holds the sense about as well,** with larger brains, and fails target 3 at tick 36,000.
  `len` falls toward its band (8.2 on seed 1 against 7.8).
- **The two trials do not tell wire loss from neuron loss.** Cutting either rate held the sense.
- **Trial 1 is taken.** It meets targets 3, 4, and 5 and trial 2 does not meet 3.

**What the five seeds do not show.** On the other five seeds (2, 3, 7, 9, 10) at tick 144,000, trial 1
passes 4 of 5: seed 7 fails the scent gap at 0.031, because its blind world kept 0.11 of a useless
sense. The Start values pass 5 of 5 there. Over all ten seeds: 9 of 10 against 8 of 10, which chance
can give. The better evidence is the paired one: mean `chemo` 0.201 against 0.166, higher on 8 of 10
seeds. Modest, and one run per seed. Seed 1's share with no chemoreceptor still climbs to 0.29 by tick
144,000, so the loss may only be slower.

### Throughput

WASM, ticks per second, read in turn. The head at 1,357 creatures. The base is `342263e`, the tree
before the switch-on, at 1,627 creatures (its brain was cheaper, so it held more). Base with U1 is
`342263e` with the Start upkeep as flags, at 1,337 creatures.

| Round | Load (1 minute) | Head | Base | Base with U1 |
|---|---|---|---|---|
| 1 | 9.9 to 11.6 | 1,251 | 1,794 | 2,476 |
| 2 | 9.9 to 11.6 | 2,658 | 2,418 | 2,722 |
| 3 | 4.7 to 7.3 | 2,702 | 2,274 | 2,777 |
| 4 | 4.7 to 7.3 | 2,702 | 2,266 | 2,731 |
| 5 | 4.7 to 7.3 | 2,707 | 2,357 | 2,810 |
| 6 | 4.7 to 7.3 | 2,835 | 2,383 | 2,842 |

Round 1 is a disturbed minute. Against the matched base the head is about 2% slower. `make gates`
read 2,593 at the build agent's close (load 5.4 to 8.3) and 2,791 at the orchestrator's (load 7 to
12). **Target 2 (2,700) is on the line, not shown either way.** The floor of 2,400 holds in every
undisturbed reading. The plan's lever, `conn_upkeep` up, would not move the bench: its world is
12,000 ticks old and its brains are still the size of a founder's.

### The close of stage 1 (`4db32b8`)

`mut_conn_remove` is 0.01. The orchestrator merged every M3 task to `main` (mating with `mix_rate` at
0, the mate card, the age word of the frame, the walkthrough) and ran the three gates there:
`make check` exit 0, `make gates` exit 0, `make gates-long` exit 0. The rows of both gates are the
build agent's, digit for digit. So none of the later merges moved a row.

```
$ make gates-long
seed=1 creatures=1644 creatures_noscent=1702 creatures_noeye=1373 len=11.1 len_sd=1.49 parts=6.8 chemo=0.21 chemo_blind=0.03 eye=0.29 eye_blind=0.02 plans=5 speed_cv=0.26 speed=0.94 area=40.1 hidden=3.32 conns=42.2 shapes=5 shapes_raw=4 variety=14.5 hidden_null=1.46 conns_null=16.4 PASS
seed=4 creatures=1368 creatures_noscent=1401 creatures_noeye=1041 len=10.5 len_sd=2.48 parts=6.8 chemo=0.18 chemo_blind=0.00 eye=0.29 eye_blind=0.03 plans=5 speed_cv=0.25 speed=0.86 area=44.0 hidden=3.08 conns=41.9 shapes=5 shapes_raw=4 variety=16.0 hidden_null=3.20 conns_null=36.2 PASS
seed=5 creatures=1676 creatures_noscent=1700 creatures_noeye=1336 len=11.4 len_sd=1.84 parts=6.4 chemo=0.24 chemo_blind=0.00 eye=0.25 eye_blind=0.02 plans=4 speed_cv=0.21 speed=1.22 area=45.9 hidden=3.34 conns=48.9 shapes=3 shapes_raw=5 variety=8.2 hidden_null=3.61 conns_null=37.9 PASS
seed=6 creatures=1404 creatures_noscent=1388 creatures_noeye=1139 len=9.7 len_sd=1.78 parts=7.0 chemo=0.22 chemo_blind=0.01 eye=0.30 eye_blind=0.01 plans=5 speed_cv=0.25 speed=0.97 area=38.3 hidden=2.50 conns=32.4 shapes=7 shapes_raw=5 variety=16.5 hidden_null=2.75 conns_null=27.7 PASS
seed=8 creatures=1532 creatures_noscent=1726 creatures_noeye=1005 len=10.7 len_sd=1.31 parts=6.5 chemo=0.15 chemo_blind=0.00 eye=0.30 eye_blind=0.01 plans=4 speed_cv=0.25 speed=0.83 area=41.7 hidden=1.47 conns=24.1 shapes=7 shapes_raw=5 variety=8.8 hidden_null=4.83 conns_null=30.4 PASS
gate-evolve 5/5 PASS
```

| # | Target | Verdict |
|---|---|---|
| 1 | `gate-health` 3 of 3 | Met |
| 2 | WASM 2,700 or more at 1,200 creatures or more | On the line: 4 of 7 undisturbed readings are at 2,700 or more |
| 3 | The M2 bands at tick 36,000, 3 of 3 | Met |
| 4 | The M2 bands at tick 144,000, 5 of 5 | Met, least scent gap 0.15. On ten seeds, 9 of 10 |
| 5 | The brain bands at tick 144,000, 5 of 5 | Met: `hidden` 1.47 or more, `conns` 24.1 or more, `variety` 8.2 or more |

### What is still wrong or fragile

- Evolution keeps it: target 4 is shown on the five seeds of the gate. On ten seeds the count does
  not separate from the Start values.
- Evolution keeps it: seed 8 reads `hidden` 1.47 against a band of 1.0.
- It helps, not shown: the gap in hidden neurons reads +1.86, -0.12, -0.27, -0.25, -3.36.
- It helps, not shown for scent: the world with no scent holds more creatures on 4 of 5 seeds.
- Consistent with "it helps" for eyes: the world with blind eyes holds fewer creatures on 5 of 5
  seeds. Each arm evolved alone, one run per seed.
- The mechanism fires: `variety` reads 8.2 to 16.5, lower than at the Start values on seeds 4, 5,
  and 8, and above its band.
- A blind world that keeps a useless sense by chance fails a seed: seed 7 here, and seed 2's eye gap
  in trial 2. The gap bands carry that noise.
- Throughput has no margin over its target.

## Part 4: mixing on

The machine restarted on 2026-10-14 during the first attempt at this part. Nothing of it had been
committed, and its logs were lost with the log folder. It starts again from its first step.

**From here each hypothesis is committed to the repo before its run,** in
`m3-tuning-hypotheses.txt` beside this file (a build agent cannot write a findings `.md` in this
harness). A log folder in `/private/tmp` does not survive a restart, and "the hypothesis was written
first" must be a fact that a reader can check: the order of the commits shows it.

The hypotheses of this part and of Part 5 are in `m3-tuning-hypotheses.txt`, each committed before
its run (`4ba86ab`, `b059d1f`, `93e27ed`, `1831dd7` on `main`). The readings below are the build
agent's, and the orchestrator read the close again on `main`.

### Mixing on, at the stage 1 values

With `--param mix_rate=1` and nothing else changed:

- `gate-health` 3/3. `gate-evolve` 3/3 at tick 36,000, with `len` 9.1 to 9.4 (11.5 to 11.8 with
  mixing off). The long gate 5/5 with every brain band. Least scent gap 0.10, on seed 1.
- Target 2 fails. The WASM bench, in turn, at a load of 2.8 to 3.2: 2,586 and 2,622 at 1,483
  creatures with mixing, 3,023 and 3,017 at 1,357 without.
- 2,604 × 1,483 = 3.86M creature-ticks per second against 3,020 × 1,357 = 4.10M. Mixing costs about
  +9% bodies and +6% work per body.
- The brains of the bench world are alike (seed 1 at tick 13,000: `conns` 57.9 against 56.6). So
  connections are not the cost. More births and the crosses are the likely cost (`births_late`
  2,334 against 1,935).

### Three trials, all with mixing on

| Trial | Change | Bench (trial / baseline in turn) | Long gate | Result |
|---|---|---|---|---|
| 1 | `conn_upkeep` 0.00005 → 0.0001 | 2,839, 2,826 at 1,404 / 2,642, 2,603 | 4/5: seed 5 scent gap 0.088 | The scent gap fell under its band on one seed, one run |
| 2 | `fixed_upkeep` 0.0337 → 0.037 | 2,801, 2,751 at 1,394 / 2,594, 2,569 | 5/5, least scent gap 0.12 | Written as the default (`f4d2ef3`) |
| 3 | `fixed_upkeep` 0.037 → 0.040 | 2,691, 2,762 at 1,365 / 2,676, 2,646 | not run | Gain 1 to 4%, hypothesis of about 7% refuted on two bench readings. Stopped at the bench, as its rule said |

Later readings of the trial 2 default fell under 2,700: 2,681 (`make gates`, load 4.8 to 6.0), then
2,648, 2,665, 2,676, 2,646. In turn with the stage 1 world (2,934 and 2,898) it runs about 9% slower.
The commit message of `f4d2ef3` says the trial brings the bench back over 2,700. The readings after it
do not support that. On `main` at load 8, `make gates` read 2,697.

**Target 2 was not met after the trial cap: a hard stop.** The owner chose on 2026-10-14: mixing on,
`fixed_upkeep` 0.037, and the target lowered to 2,600. The floor of 2,400 holds.

### At the final defaults (`mix_rate` 1, `fixed_upkeep` 0.037)

| Seed | 1 | 2 | 3 |
|---|---|---|---|
| Pairs, tick 36,000 | 4,070 | 3,606 | 2,883 |
| Births of a cross, tick 36,000 | 5,883 of 9,422 (62%) | 5,190 of 9,393 (55%) | 4,079 of 7,030 (58%) |
| Bodies holding a donor, tick 36,000 | 522 | 431 | 467 |
| Accept share, tick 36,000 | 0.89 | 0.85 | 0.85 |
| Accept share, tick 144,000 | 0.01 | 0.13 | 0.24 |

Seed 1 to tick 144,000: 9 births of 7,877 are a cross (0.1%), with 9 pairs and 3 donors at the last
reading.

| Seed | creatures | len | parts | chemo / blind | scent gap | eye gap | hidden | conns | variety | Result |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 1689 | 9.6 | 8.2 | .18 / .01 | .17 | .30 | 3.27 | 46.7 | 24.9 | PASS |
| 4 | 1338 | 10.6 | 9.7 | .29 / .03 | .26 | .24 | 4.45 | 62.4 | 29.9 | PASS |
| 5 | 1618 | 10.6 | 9.8 | .15 / .03 | .12 | .26 | 7.13 | 72.6 | 23.1 | PASS |
| 6 | 1437 | 9.9 | 9.0 | .20 / .04 | .16 | .24 | 4.11 | 45.6 | 39.1 | PASS |
| 8 | 1246 | 10.1 | 10.5 | .14 / .00 | .14 | .31 | 4.92 | 61.6 | 15.7 | PASS |

- **The mechanism fires:** 55 to 62% of births are a cross at tick 36,000.
- **Evolution does not keep it:** the accept share falls to 0.01 to 0.24 by tick 144,000, and on
  seed 1 the share of crosses falls to 0.1%. On these runs, one per seed, mating is a feature of a
  young world.
- **Not shown:** the build agent reported 4.2 to 6.6 hidden genes against 3.3 to 3.9 wired at tick
  144,000, and read it as donor genes that a cross leaves unwired. It did not name the seeds or the
  probe, and the `hidden` (wired) column above reads 3.27 to 7.13. No run with mixing off compares
  them. `variety_wired` (Close) reads the shapes with wired neurons only. On seed 1, `probe-brains`
  reads 4.21 hidden genes against 3.27 wired, which agrees with the agent's numbers for that seed.
- **Evolution keeps it, not on every run:** lines with no chemoreceptor still take over on some
  paths (seed 5 at 0.30). One run per seed.
- **"It helps" is not shown** for hidden neurons (the hidden gap is −1.65 to +5.46) or for scent
  (the world with no scent holds more creatures on 2 of 5 seeds). The world with blind eyes holds
  fewer creatures on 5 of 5 seeds: consistent with "it helps" for eyes, each arm evolved alone.

## Part 5: the three items carried from M2

Five seeds at the final defaults.

- **Area: no band.** It reads 35.5 to 41.7 at tick 36,000 and 34.3 to 39.7 at tick 144,000. Area is
  about `len`² × 0.35 (`wid` reads 0.32 to 0.40 against its floor of 0.3), so the `len` band already
  bounds it from below. No parameter narrows a body alone, so no bad input is known that an area band
  rejects and the `len` band passes.
- **Egg: the range as it is.** With the top of the range at 0.9 (founder 0.7), `egg` at tick 144,000
  reads 0.65 to 0.67, against 0.65 to 0.66 with the top at 0.7. It does not use the room, and the
  hypothesis that the top held it is not supported. `len` stays in its band. Confound: the wider range also
  made the mutation step 40% larger.
- **`speed_cv`: a band at 0.10.** Good worlds read 0.22 to 0.25 at tick 36,000 and 0.23 to 0.28 at
  tick 144,000. The bad input (`mut_rate`, `mut_shape_rate`, and the three part rates at 0) reads 0.05
  to 0.07 and fails 0/5 in the build agent's run (0/3 on seeds 1, 2, 3 on `main`, `gates.md`). That world fails both sense gaps too, so this band is not its only rejector.
- **`plans`: no band.** A passing default world read `plans=0` (seed 8 at tick 36,000). It is a count
  of shares over 5%, as `shapes` was. An effective number of plans would be the form to try.

## Close

On `main` at `1831dd7`: `make check` exits 0 (263 Vitest tests). `make gates` exits 0 with every
gate row equal digit for digit to the agent's close (native 2,829, WASM 2,697 at load 8). Break:
with the full-grown condition taken out of `mate.rs`, `a_juvenile_and_a_body_with_a_donor_do_not_pair`
fails, and passes again with it restored.

The rows of `make gates` at the final defaults, with the `speed_cv` band, at `fa1631a` (load 7.2 to
4.2). The fresh-context audit read the same rows at `77a096e`:

```
bench creatures=1394 median_tps=2968 floor=2400 PASS
bench-wasm creatures=1394 median_tps=2762 floor=2400 PASS
seed=1 creatures=1458 min_late=1294 plants=2229 births_late=2498 max_gen=14 mean_chemo=0.48 parked=0.00 first_bud=783 juv_starved=0.55 to_bud=0.31 PASS
seed=2 creatures=1305 min_late=1196 plants=2076 births_late=2340 max_gen=17 mean_chemo=0.46 parked=0.00 first_bud=763 juv_starved=0.54 to_bud=0.32 PASS
seed=3 creatures=1213 min_late=1152 plants=1964 births_late=2034 max_gen=14 mean_chemo=0.46 parked=0.00 first_bud=793 juv_starved=0.54 to_bud=0.31 PASS
gate-health 3/3 PASS
seed=1 creatures=1633 creatures_noscent=1513 creatures_noeye=1689 len=10.0 len_sd=1.59 parts=7.5 chemo=0.35 chemo_blind=0.16 eye=0.25 eye_blind=0.07 plans=4 speed_cv=0.25 speed=0.94 area=35.5 hidden=4.29 conns=60.0 shapes=4 shapes_raw=1 variety=30.6 PASS
seed=2 creatures=1521 creatures_noscent=1550 creatures_noeye=1540 len=9.4 len_sd=1.68 parts=8.3 chemo=0.41 chemo_blind=0.18 eye=0.26 eye_blind=0.09 plans=3 speed_cv=0.25 speed=0.90 area=33.4 hidden=4.40 conns=61.8 shapes=1 shapes_raw=0 variety=42.1 PASS
seed=3 creatures=1341 creatures_noscent=1398 creatures_noeye=1548 len=10.3 len_sd=1.61 parts=7.2 chemo=0.38 chemo_blind=0.15 eye=0.25 eye_blind=0.11 plans=3 speed_cv=0.24 speed=1.06 area=42.2 hidden=4.13 conns=58.1 shapes=3 shapes_raw=2 variety=41.1 PASS
gate-evolve 3/3 PASS
```

**`variety_wired`, after the audit** (`m3-audit.md` finding M2). The long gate at `1b20e7e` with the
wired reading added, load 6.0 to 4.5, every other cell equal to the rows above:

| Seed | 1 | 4 | 5 | 6 | 8 |
|---|---|---|---|---|---|
| `variety` (every hidden gene) | 24.9 | 29.9 | 23.1 | 39.1 | 15.7 |
| `variety_wired` (wired hidden neurons only) | 24.9 | 21.8 | 19.1 | 38.5 | 12.2 |

Unwired genes raise `variety` by up to 27% (seed 4). With wired neurons only it still reads 12.2 to
38.5, against a band of 2.0 and 1.0 in the frozen world. Which of the two the band reads is the
owner's: it is a change to a band. `variety_wired` is printed with no band.
