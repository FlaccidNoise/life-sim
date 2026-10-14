# M3: what the long gate reads of brains (Task 9)

Date: 2026-10-13. Commits `f9a8a2d` (the measures and the probes) and `c8b9600` (the bands). One run
per seed, one simulation at a time, at a load average of 7 to 24 from other work. A count does not
depend on the load.

The build agent ran every row below. The orchestrator ran four of them again on `main`: `make check`
(exit 0), the default `gate-evolve`, the frozen world, and the good world. Each row is the same digit
for digit. Not run again by the orchestrator: the costly world and the two chance runs.

## Result

**The three bands each reject a bad world of the head on 3 of 3 seeds, and the good world passes all
three. The gate of the good world still exits 1: seed 4 fails the scent gap of M2 at 0.094 against
0.10.** The bands are provisional until the owner confirms them.

| Measure | Fails under | The bad world reads | The good world reads | Kind of claim |
|---|---|---|---|---|
| `hidden` | 1.0 | 0.03 to 0.04 | 3.04 to 3.85 | Evolution keeps it, in the weak sense: not stripped at this cost by tick 144,000 |
| `conns` | 15.0 | 1.4 to 2.7 | 34.7 to 42.6 | The same |
| `shapes` | 2 | 1, 1, 1 | 4, 6, 4 | The mechanism fires: structural mutation makes brains that 5% of the living hold |

**"Evolution uses a hidden neuron" is not shown, and "it helps" is not shown.** See "The gap".

## The measures

`gate-evolve` prints four more values on every row, after `area`:

- `hidden`: the mean, over the living, of hidden neurons with a way in from an input and a way out
  to an output, along expressed connections.
- `conns`: the mean of expressed connections.
- `shapes`: the count of pairs (hidden genes, connections with no end on an input of a sense) that
  5% or more of the living hold. An input of a sense is a port of an eye gene or one of the three
  scent inputs. So this pair moves only with brain mutations, not with the body plan.
- `shapes_raw`: the same with every expressed connection. Never a band.

With `--brain` each seed runs once more with `hidden_gain=0` and prints `hidden_null` and
`conns_null`, and the three bands apply. Without `--brain` the gate keeps its M2 bands: the default
rows are the same in every old column before and after (seeds 1 to 3 read `hidden=4.00`,
`conns` 48.5, 48.7, 54.2, `shapes=1`, `shapes_raw` 3, 3, 2). This also shows that the growth word
of the frame (`b8765dd`) moved no row.

## The proofs

Every run is this command, plus or minus the flags that a row names. The defaults are still at their
Off values, so the Start values are written out.

```
$ target/release/tidepool-headless gate-evolve --brain --ticks 144000 --seeds 1,4,5 --param fixed_upkeep=0.0337 --param neuron_upkeep=0.0002 --param conn_upkeep=0.00005 --param mut_conn_add=0.05 --param mut_conn_remove=0.05 --param mut_neuron_add=0.02 --param mut_neuron_remove=0.02 --param part_wires=2
```

The hypothesis was written before run 1 (`hypothesis.txt` in the session's log folder). The good
world was not run or looked at before the rows of the two bad worlds were in their files.

### Bad world 1: a brain is the largest cost of a body

`neuron_upkeep=0.01 conn_upkeep=0.003`. A founder brain then costs 0.22 per tick against 0.0375.

```
seed=1 creatures=1314 creatures_noscent=1290 creatures_noeye=1357 len=13.3 len_sd=3.01 parts=5.3 chemo=0.08 chemo_blind=0.00 eye=0.13 eye_blind=0.00 plans=5 speed_cv=0.30 speed=1.19 area=85.7 hidden=0.03 conns=2.7 shapes=4 shapes_raw=5 hidden_null=0.02 conns_null=2.2 FAIL(chemo_gap=0.075 < 0.1, hidden=0.03 < 1, conns=2.7 < 15)
seed=4 creatures=979 creatures_noscent=1082 creatures_noeye=849 len=17.9 len_sd=4.08 parts=4.5 chemo=0.01 chemo_blind=0.00 eye=0.03 eye_blind=0.00 plans=6 speed_cv=0.28 speed=1.41 area=123.9 hidden=0.03 conns=1.4 shapes=4 shapes_raw=4 hidden_null=0.01 conns_null=2.7 FAIL(chemo_gap=0.008 < 0.1, eye_gap=0.032 < 0.1, hidden=0.03 < 1, conns=1.4 < 15)
seed=5 creatures=1169 creatures_noscent=1178 creatures_noeye=1376 len=18.4 len_sd=4.65 parts=5.5 chemo=0.04 chemo_blind=0.00 eye=0.04 eye_blind=0.01 plans=8 speed_cv=0.28 speed=1.34 area=121.9 hidden=0.04 conns=2.2 shapes=4 shapes_raw=4 hidden_null=0.01 conns_null=1.7 FAIL(chemo_gap=0.041 < 0.1, eye_gap=0.032 < 0.1, hidden=0.04 < 1, conns=2.2 < 15)
gate-evolve 0/3 FAIL
```

Exit 1. The brain is stripped: 1 to 3 connections are left of 60. Expected: 8 to 20 connections and
300 to 900 creatures. Read: about 2, in a world that stayed full. **Limit: every seed here also
fails a sense gap of M2, so `conns` partly reads the senses a second time.** No world is known that
strips the brain and keeps both senses.

### Bad world 2: no brain can change shape

The four structural rates at 0. `part_wires` stays 2 and the part mutations stay on.

```
seed=1 creatures=1766 creatures_noscent=1735 creatures_noeye=1340 len=11.0 len_sd=1.33 parts=6.0 chemo=0.21 chemo_blind=0.00 eye=0.25 eye_blind=0.03 plans=5 speed_cv=0.32 speed=0.84 area=40.2 hidden=4.00 conns=58.1 shapes=1 shapes_raw=2 hidden_null=4.00 conns_null=56.3 FAIL(shapes=1 < 2)
seed=4 creatures=1332 creatures_noscent=1369 creatures_noeye=965 len=9.8 len_sd=1.26 parts=7.5 chemo=0.20 chemo_blind=0.02 eye=0.32 eye_blind=0.02 plans=6 speed_cv=0.27 speed=0.84 area=42.7 hidden=4.00 conns=57.3 shapes=1 shapes_raw=4 hidden_null=4.00 conns_null=47.0 FAIL(shapes=1 < 2)
seed=5 creatures=1618 creatures_noscent=1598 creatures_noeye=1285 len=10.9 len_sd=1.29 parts=7.4 chemo=0.26 chemo_blind=0.00 eye=0.30 eye_blind=0.02 plans=6 speed_cv=0.26 speed=0.85 area=38.9 hidden=4.00 conns=61.6 shapes=1 shapes_raw=4 hidden_null=4.00 conns_null=46.2 FAIL(shapes=1 < 2)
gate-evolve 0/3 FAIL
```

Exit 1, and `shapes` is the only band that fails. `shapes_raw` reads 2 to 4 in this world: brains
differ by their ports with no brain mutation at all, which is why the band is not on it (soft spot
11 of the plan).

### The good world: the Start values

```
seed=1 creatures=1704 creatures_noscent=1662 creatures_noeye=1261 len=10.2 len_sd=1.50 parts=5.8 chemo=0.14 chemo_blind=0.00 eye=0.29 eye_blind=0.01 plans=3 speed_cv=0.27 speed=0.85 area=34.5 hidden=3.52 conns=36.7 shapes=4 shapes_raw=3 hidden_null=0.34 conns_null=10.3 PASS
seed=4 creatures=1342 creatures_noscent=1363 creatures_noeye=1096 len=10.5 len_sd=1.58 parts=6.2 chemo=0.12 chemo_blind=0.03 eye=0.28 eye_blind=0.04 plans=5 speed_cv=0.33 speed=0.83 area=42.2 hidden=3.04 conns=34.7 shapes=6 shapes_raw=1 hidden_null=3.69 conns_null=37.2 FAIL(chemo_gap=0.094 < 0.1)
seed=5 creatures=1682 creatures_noscent=1770 creatures_noeye=1234 len=10.5 len_sd=1.44 parts=6.4 chemo=0.19 chemo_blind=0.02 eye=0.26 eye_blind=0.01 plans=6 speed_cv=0.29 speed=0.92 area=38.4 hidden=3.85 conns=42.6 shapes=4 shapes_raw=3 hidden_null=2.75 conns_null=26.0 PASS
gate-evolve 2/3 FAIL
```

Exit 1, on seed 4's scent gap. No brain band fails. On seed 4 (`probe-brains`): hidden neurons run
from 0 to 7 with a median of 3, connections from 7 to 68 with a median of 33, the commonest shape is
held by 14% of the living, and 94% of bodies accept a mate.

## The gap, and why it has no band

The gap is `hidden - hidden_null`: hidden neurons kept in the world against a world where a hidden
neuron sends nothing.

| | Seed 1 | Seed 4 | Seed 5 |
|---|---|---|---|
| The good world | +3.18 | -0.65 | +1.10 |
| Chance: `hidden_gain=0.0001` against `hidden_gain=0` | +1.45 | -0.87 | +0.92 |

Two of the three gaps of the good world are inside what chance reads, and the sign is mixed. So the
gap gets no band, and nothing here shows that evolution uses a hidden neuron. The plan said that this
could happen (soft spot 1): the M3 world has plants that never die and no hunter, so a straight wire
from a sense to a motor is most of what pays.

The plan's own chance reading (`hidden_gain=0` on both arms) compares a world with itself: it reads
0.00 on 3 seeds and shows only that the simulation is deterministic. The row above is the reading
that the M2 gaps used.

```
$ ... --param hidden_gain=0.0001
seed=1 creatures=1427 creatures_noscent=1524 creatures_noeye=1322 len=14.8 len_sd=3.22 parts=6.1 chemo=0.21 chemo_blind=0.00 eye=0.15 eye_blind=0.03 plans=6 speed_cv=0.32 speed=1.17 area=77.8 hidden=1.79 conns=19.8 shapes=3 shapes_raw=1 hidden_null=0.34 conns_null=10.3 PASS
seed=4 creatures=1203 creatures_noscent=1179 creatures_noeye=1165 len=11.9 len_sd=2.35 parts=5.9 chemo=0.22 chemo_blind=0.00 eye=0.19 eye_blind=0.03 plans=4 speed_cv=0.35 speed=1.03 area=69.2 hidden=2.82 conns=28.4 shapes=3 shapes_raw=1 hidden_null=3.69 conns_null=37.2 PASS
seed=5 creatures=1677 creatures_noscent=1356 creatures_noeye=1288 len=11.0 len_sd=1.26 parts=5.9 chemo=0.21 chemo_blind=0.00 eye=0.25 eye_blind=0.01 plans=4 speed_cv=0.28 speed=0.83 area=39.5 hidden=3.67 conns=38.8 shapes=2 shapes_raw=1 hidden_null=2.75 conns_null=26.0 PASS
gate-evolve 3/3 PASS
```

## What is wrong or fragile

1. **Structure drains at the Start values.** Against the frozen world, `conns` falls from 57 to 62
   down to 35 to 43, and `hidden` from 4.00 to 3.04 to 3.85, in about 65 generations. A likely
   cause, as arithmetic and not as a measurement: at the Start rates a birth loses a hidden neuron
   with a chance of 0.02, and that takes about 13 connections, while a new hidden neuron nets 1 and a
   new connection finds its pair joined already 4 times in 10. That is a loss of about a quarter of a
   connection per birth, which is 17 in 65 generations. The world with silent hidden neurons shows
   the same drift with no selection to hold it: `hidden_null` reads 0.34, 3.69, 2.75.
2. **The good world fails an M2 band at tick 144,000.** Seed 4 reads a scent gap of 0.094. `chemo`
   reads 0.12 to 0.19 against 0.20 to 0.26 in the frozen world, so the sense is smaller where brains
   can lose wires. Target 4 of the retune (5 of 5 seeds at tick 144,000) is not met at the Start
   values.
3. **`shapes` is not monotone.** A shape that under 5% hold is not counted, so more variety can read
   lower: on seed 4 `shapes_raw` reads 1 while `shapes` reads 6. A band that fails under 2 could one
   day fail a world for too much variety. A measure that rises with variety (the effective number of
   shapes, 1 over the sum of the squared shares) would not. Proposed for the retune: print it with no
   band, and decide at the close.
4. **The `hidden` and `conns` bands pass a world where a hidden neuron does nothing.** Six such rows
   read `hidden` 0.34 to 3.69, and only one would fail. These two bands read "not stripped by cost".
   They do not read use.
5. **A shape counts every hidden gene. `hidden` counts only the wired ones.** `probe-brains` prints
   both: 3.12 and 3.04 on seed 4.
6. **Three seeds, one run each.** The long gate of the exit reads five.

## The probes

- `probe-brains [--seed n] [--ticks 36000] [--param ...]`: the spread of hidden neurons and of
  connections, the 8 commonest shapes with their share, the share of bodies with a connection above
  0.1 in size from each input group, and the share with `cmd_accept` above 0.
- `probe-mix [--seed n] [--ticks 36000] [--param ...]`: every 4,000 ticks, pairs made, births, births
  of a cross, and bodies that hold a donor. A pair is counted once by its two uids when a body holds
  a donor that it did not hold a tick before. A pair where both bodies bud or die in that same tick is
  not seen. It reads 0 today: mixing is not built. A unit test sets donors by hand and reads 1 pair
  and 1 cross.

## Breaks

| By | Break | Result |
|---|---|---|
| Build agent | The backward pass of the reach follows wires forward | The reach test fails (0 against 1) |
| Build agent | A shape counts the wires of a sense | The shapes test fails |
| Orchestrator | The 5% share of a shape is dropped | `a_shape_counts_when_5_percent_of_the_living_hold_it` fails |
