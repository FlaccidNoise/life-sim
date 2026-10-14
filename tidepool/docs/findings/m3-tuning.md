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

What this shows: structural mutation of the brain is what lets the scent sense go, on 2 of 3 seeds.
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

## Part 3: the trials

In progress. At most 8 trials, each with its hypothesis written before the run.
