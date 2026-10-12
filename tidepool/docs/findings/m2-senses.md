# M2 senses: what removes them by tick 144,000, and what keeps them

Date: 2026-10-12. Baseline: `m2-long-run.md` (commit e268576, the accepted set at tick 144,000 on 10
seeds). Every run here is `probe-census` or `gate-evolve` to tick 144,000, one run at a time.

The file began as the record of a turnover rule (food that comes and goes). The cost controls of
Part 1 came first, as design risk R1 asks, and they changed the question. No turnover rule was built.
The answer is in "Result" at the end.

The question comes from the audit (`m2-audit.md`, findings H1, H2, M3) and from `m2-long-run.md`: in
the world that the grazing rule makes, no plant dies, and evolution removes the chemoreceptor on 6 of
10 seeds and the tail on 10 of 10.

## What "holds" means here

Read at tick 144,000, per seed, against the baseline at tick 36,000:

| Reading | Holds when |
|---|---|
| `chemo` | at least 0.12 |
| `flagellum` | at least 0.39 |
| `speed` | at least 0.84 |
| `eye` | at least 0.15 |
| `senseless` | at most 0.16 |
| `plants` | not lower at tick 144,000 than at tick 72,000 by more than 5% |
| `creatures` | at least 600 |

The screen seeds are 1, 5, and 8. In the baseline at tick 144,000 seed 1 keeps `chemo` 0.13, seed 5
has lost it, and seed 8 has lost both senses.

## Part 1: two controls with no new rule

Design risk R1 says "If the gate fails, lower the cost before adding mechanisms". So the cost goes
first.

**Control 1: `part_upkeep=0`.** Hypothesis, written before the run: if the upkeep of a part is what
removes the chemoreceptor and the tail, then `chemo` and `flagellum` hold on seeds 5 and 8. If they do
not hold, the upkeep of a part is not the cause.

**Control 2: `part_upkeep=0` and `part_mass=0`.** A part then costs nothing at all: no upkeep and no
mass. Hypothesis, written before the run: if any cost of a part is the cause, `chemo` and `flagellum`
hold on seeds 5 and 8. If they do not hold with a part that is free, the loss is not a cost. It is
mutation with no selection to keep the part, and only a world that pays for the part can keep it.
Body length is expected to fall, as in trial 5 of `m2-tuning.md` read backwards. That is not the
question of this control.

### Rows

The baseline, from `m2-long-run.md`:

```
seed=1 tick=36000 creatures=1470 plants=2229 juv=0.38 len=11.8 wid=0.52 egg=0.66 old=3650 area=72.4 flagellum=0.46 cilia=0.36 filter=0.74 chemo=0.14 fin=0.00 eye=0.22 parts=5.2 senseless=0.01 speed=1.11 turn=0.104 eaten=189.82 reserve01=0.36
seed=1 tick=144000 creatures=1691 plants=2229 juv=0.39 len=10.4 wid=0.43 egg=0.67 old=3179 area=46.7 flagellum=0.21 cilia=0.49 filter=0.81 chemo=0.13 fin=0.01 eye=0.24 parts=5.7 senseless=0.01 speed=0.64 turn=0.117 eaten=174.43 reserve01=0.29
seed=5 tick=36000 creatures=1451 plants=2178 juv=0.36 len=12.7 wid=0.51 egg=0.67 old=4150 area=84.3 flagellum=0.44 cilia=0.26 filter=0.70 chemo=0.08 fin=0.00 eye=0.15 parts=4.5 senseless=0.14 speed=1.11 turn=0.089 eaten=195.06 reserve01=0.35
seed=5 tick=144000 creatures=1774 plants=2178 juv=0.38 len=11.6 wid=0.37 egg=0.67 old=3191 area=49.4 flagellum=0.20 cilia=0.48 filter=0.86 chemo=0.04 fin=0.01 eye=0.22 parts=6.1 senseless=0.00 speed=0.63 turn=0.105 eaten=176.64 reserve01=0.24
seed=8 tick=36000 creatures=1370 plants=1731 juv=0.37 len=12.9 wid=0.51 egg=0.68 old=3916 area=85.5 flagellum=0.39 cilia=0.21 filter=0.74 chemo=0.03 fin=0.00 eye=0.15 parts=4.0 senseless=0.10 speed=1.01 turn=0.075 eaten=173.43 reserve01=0.29
seed=8 tick=144000 creatures=1104 plants=1731 juv=0.35 len=19.2 wid=0.35 egg=0.68 old=4166 area=129.6 flagellum=0.34 cilia=0.09 filter=0.65 chemo=0.02 fin=0.01 eye=0.03 parts=3.3 senseless=0.83 speed=0.92 turn=0.042 eaten=159.35 reserve01=0.24
```

Control 1:

```
$ target/release/tidepool-headless probe-census --seeds 1,5,8 --ticks 144000 --every 36000 --param part_upkeep=0
seed=1 tick=36000 creatures=1734 plants=2229 juv=0.38 len=11.3 wid=0.48 egg=0.67 old=3954 area=61.6 flagellum=0.53 cilia=0.40 filter=0.81 chemo=0.31 fin=0.00 eye=0.22 parts=5.2 senseless=0.02 speed=1.09 turn=0.110 eaten=174.46 reserve01=0.31
seed=1 tick=144000 creatures=2093 plants=2229 juv=0.39 len=8.9 wid=0.40 egg=0.66 old=3082 area=31.8 flagellum=0.34 cilia=0.59 filter=1.23 chemo=0.20 fin=0.00 eye=0.29 parts=7.4 senseless=0.00 speed=0.81 turn=0.139 eaten=162.32 reserve01=0.23
seed=5 tick=36000 creatures=1660 plants=2178 juv=0.38 len=11.7 wid=0.46 egg=0.66 old=4144 area=62.0 flagellum=0.60 cilia=0.43 filter=0.92 chemo=0.35 fin=0.01 eye=0.23 parts=5.9 senseless=0.00 speed=1.18 turn=0.109 eaten=178.70 reserve01=0.30
seed=5 tick=144000 creatures=1866 plants=2178 juv=0.37 len=10.0 wid=0.39 egg=0.66 old=3357 area=38.3 flagellum=0.40 cilia=0.54 filter=1.09 chemo=0.17 fin=0.02 eye=0.29 parts=7.7 senseless=0.00 speed=0.77 turn=0.127 eaten=163.28 reserve01=0.20
seed=8 tick=36000 creatures=1399 plants=1731 juv=0.38 len=13.0 wid=0.48 egg=0.67 old=4159 area=81.8 flagellum=0.58 cilia=0.33 filter=0.75 chemo=0.22 fin=0.00 eye=0.19 parts=5.0 senseless=0.02 speed=1.29 turn=0.095 eaten=160.09 reserve01=0.26
seed=8 tick=144000 creatures=1541 plants=1731 juv=0.36 len=10.2 wid=0.44 egg=0.65 old=3602 area=45.4 flagellum=0.41 cilia=0.48 filter=0.93 chemo=0.18 fin=0.00 eye=0.27 parts=6.0 senseless=0.00 speed=0.94 turn=0.122 eaten=139.54 reserve01=0.17
```

Control 2:

```
$ target/release/tidepool-headless probe-census --seeds 1,5,8 --ticks 144000 --every 36000 --param part_upkeep=0 --param part_mass=0
seed=1 tick=36000 creatures=1749 plants=2229 juv=0.36 len=10.6 wid=0.50 egg=0.67 old=3937 area=55.9 flagellum=0.77 cilia=0.66 filter=1.22 chemo=0.55 fin=0.00 eye=0.30 parts=6.1 senseless=0.00 speed=1.65 turn=0.196 eaten=167.84 reserve01=0.28
seed=1 tick=144000 creatures=2135 plants=2229 juv=0.36 len=8.3 wid=0.32 egg=0.67 old=2721 area=22.6 flagellum=1.19 cilia=0.86 filter=3.24 chemo=0.50 fin=0.06 eye=0.43 parts=10.9 senseless=0.00 speed=2.52 turn=0.360 eaten=141.08 reserve01=0.19
seed=5 tick=36000 creatures=1933 plants=2178 juv=0.37 len=9.2 wid=0.49 egg=0.67 old=3682 area=41.9 flagellum=1.07 cilia=0.50 filter=1.61 chemo=0.68 fin=0.00 eye=0.32 parts=7.6 senseless=0.00 speed=2.08 turn=0.227 eaten=168.78 reserve01=0.23
seed=5 tick=144000 creatures=2058 plants=2178 juv=0.36 len=8.2 wid=0.33 egg=0.67 old=2796 area=22.7 flagellum=1.02 cilia=0.80 filter=3.20 chemo=0.71 fin=0.02 eye=0.35 parts=10.9 senseless=0.00 speed=2.35 turn=0.315 eaten=139.92 reserve01=0.17
seed=8 tick=36000 creatures=1581 plants=1731 juv=0.35 len=9.8 wid=0.43 egg=0.67 old=3756 area=41.7 flagellum=1.20 cilia=0.48 filter=1.84 chemo=0.48 fin=0.01 eye=0.30 parts=8.0 senseless=0.00 speed=2.14 turn=0.226 eaten=147.91 reserve01=0.17
seed=8 tick=144000 creatures=1772 plants=1731 juv=0.37 len=9.2 wid=0.32 egg=0.67 old=3138 area=27.1 flagellum=1.94 cilia=0.85 filter=3.41 chemo=0.51 fin=0.10 eye=0.37 parts=11.2 senseless=0.00 speed=3.36 turn=0.430 eaten=121.07 reserve01=0.15
```

### What the controls show

| Reading at tick 144,000, seeds 1, 5, 8 | Baseline | Control 1 | Control 2 |
|---|---|---|---|
| `chemo` | 0.13, 0.04, 0.02 | 0.20, 0.17, 0.18 | 0.50, 0.71, 0.51 |
| `flagellum` | 0.21, 0.20, 0.34 | 0.34, 0.40, 0.41 | 1.19, 1.02, 1.94 |
| `speed` | 0.64, 0.63, 0.92 | 0.81, 0.77, 0.94 | 2.52, 2.35, 3.36 |
| `eye` | 0.24, 0.22, 0.03 | 0.29, 0.29, 0.27 | 0.43, 0.35, 0.37 |
| `senseless` | 0.01, 0.00, 0.83 | 0.00, 0.00, 0.00 | 0.00, 0.00, 0.00 |
| `len` | 10.4, 11.6, 19.2 | 8.9, 10.0, 10.2 | 8.3, 8.2, 9.2 |
| `area` | 46.7, 49.4, 129.6 | 31.8, 38.3, 45.4 | 22.6, 22.7, 27.1 |
| `creatures` | 1,691, 1,774, 1,104 | 2,093, 1,866, 1,541 | 2,135, 2,058, 1,772 |

- **Control 1: the hypothesis holds for the chemoreceptor.** With no part upkeep `chemo` holds on 3
  of 3 seeds, and seed 8 keeps its eyes. `flagellum` holds on 2 of 3 (0.34 on seed 1). `speed` is
  still lower at tick 144,000 than at tick 36,000 on 3 of 3, and holds on 1 of 3.
- **The price is a smaller body and a fuller world.** `area` is 31.8 to 45.4. `creatures` on seed 1 is
  2,093, and a world of 1,734 already read under the throughput floor (`m2-audit.md`, finding M8).
- **Control 2 does not answer its question.** Every part grows, to 10.9 to 11.2 parts of the 12
  allowed. A part is added or copied twice as often as it is removed (`mut_part_add` and
  `mut_part_dup` against `mut_part_remove`), so a part that costs nothing piles up with no selection.
  The control cannot tell "the sense pays" from that. Only the gaps of `gate-evolve` can.
- **So the first lever is the cost, as R1 says, and not a new rule.** What I told the owner, that the
  senses go because "the food never moves", is not shown. What is measured: with the upkeep of a part
  taken away, `chemo` is not lost on 3 of 3 screen seeds.
- **Not measured yet:** whether evolution uses the sense in control 1 (the gaps), the health gate, and
  the throughput.

## Part 2: trial 11, `part_upkeep` 0.0002 to 0

Trials 1 to 10 are in `m2-tuning.md`, which stopped at 10 of the 12 allowed.

Hypothesis, written before the runs:

1. `gate-health` passes 3 of 3. More creatures, because every body pays less.
2. `gate-evolve` at tick 36,000 on seeds 1, 2, 3 passes the scent gap on 3 of 3. At the default it
   passes 2 of 3 (seed 1 reads 0.079). The risk: with no upkeep the blind world keeps more of the part
   too, and the gap does not grow.
3. `gate-evolve` at tick 144,000 on seeds 1, 5, 8 passes both gaps on 3 of 3. At the default seed 8
   fails both.
4. The benches at tick 12,000 pass the floor of 2,400, with less room than now (3,172 native and
   3,006 WASM at 1,327 creatures).

### Rows

```
$ target/release/tidepool-headless gate-health --param part_upkeep=0
seed=1 creatures=1613 min_late=1460 plants=2229 births_late=2171 max_gen=18 mean_chemo=0.40 parked=0.00 first_bud=862 juv_starved=0.51 to_bud=0.33 PASS
seed=2 creatures=1407 min_late=1382 plants=2076 births_late=2111 max_gen=15 mean_chemo=0.47 parked=0.00 first_bud=859 juv_starved=0.51 to_bud=0.33 PASS
seed=3 creatures=1362 min_late=1304 plants=1965 births_late=1898 max_gen=16 mean_chemo=0.47 parked=0.00 first_bud=843 juv_starved=0.51 to_bud=0.33 PASS
gate-health 3/3 PASS

$ target/release/tidepool-headless gate-evolve --param part_upkeep=0
seed=1 creatures=1734 creatures_noscent=1589 creatures_noeye=1638 len=11.3 len_sd=1.62 parts=5.2 chemo=0.31 chemo_blind=0.04 eye=0.22 eye_blind=0.11 plans=3 speed_cv=0.27 PASS
seed=2 creatures=1549 creatures_noscent=1599 creatures_noeye=1547 len=11.6 len_sd=1.97 parts=5.0 chemo=0.23 chemo_blind=0.04 eye=0.22 eye_blind=0.10 plans=2 speed_cv=0.27 PASS
seed=3 creatures=1540 creatures_noscent=1547 creatures_noeye=1479 len=12.1 len_sd=1.48 parts=5.7 chemo=0.37 chemo_blind=0.08 eye=0.24 eye_blind=0.09 plans=3 speed_cv=0.25 PASS
gate-evolve 3/3 PASS

$ target/release/tidepool-headless bench --param part_upkeep=0
$ node scripts/bench-wasm.mjs --param part_upkeep=0
bench creatures=1587 median_tps=2567 floor=2400 PASS
bench-wasm creatures=1587 median_tps=2385 floor=2400 FAIL

$ target/release/tidepool-headless gate-evolve --seeds 1,5,8 --ticks 144000 --param part_upkeep=0
seed=1 creatures=2093 creatures_noscent=2052 creatures_noeye=1376 len=8.9 len_sd=1.28 parts=7.4 chemo=0.20 chemo_blind=0.00 eye=0.29 eye_blind=0.02 plans=3 speed_cv=0.25 PASS
seed=5 creatures=1866 creatures_noscent=2050 creatures_noeye=1430 len=10.0 len_sd=1.51 parts=7.7 chemo=0.17 chemo_blind=0.00 eye=0.29 eye_blind=0.02 plans=4 speed_cv=0.26 PASS
seed=8 creatures=1541 creatures_noscent=1627 creatures_noeye=1074 len=10.2 len_sd=1.12 parts=6.0 chemo=0.18 chemo_blind=0.00 eye=0.27 eye_blind=0.03 plans=5 speed_cv=0.26 PASS
gate-evolve 3/3 PASS
```

The first attempt at these commands ran nothing: the shell passed `--param part_upkeep=0` as one
word and every step exited 2. The rows above are the second attempt.

### Verdict: rejected as it stands. The senses pass and the WASM floor fails

| Hypothesis | Result |
|---|---|
| 1. `gate-health` 3 of 3 | Held. `creatures` 1,613, 1,407, 1,362 against 1,321, 1,274, 1,166 |
| 2. Scent gap at tick 36,000, 3 of 3 | Held. 0.27, 0.19, 0.29. At the default: 0.079, 0.14, 0.27 |
| 3. Both gaps at tick 144,000 on seeds 1, 5, 8 | Held. Scent 0.20, 0.17, 0.18. Eye 0.27, 0.27, 0.24 |
| 4. Both benches over 2,400 | **Failed.** Native 2,567. WASM 2,385 at 1,587 creatures |

- **Evolution uses both senses here, at both ticks, on every seed read.** That is the claim the gaps
  support. Seeds 2, 3, 4, 6, 7, 9, 10 were not read at tick 144,000.
- **The eye gap at tick 36,000 is thin on seed 1:** 0.11 against 0.10. The blind world keeps more of
  the eye than before (`eye_blind` 0.09 to 0.11, against 0.04 to 0.05), as the risk of hypothesis 2
  said it could.
- **The world is too full for the floor.** 260 more creatures at tick 12,000 cost 620 ticks per
  second in WASM.
- **A default of 0 is also a dead switch.** It would mean the rule "a part has upkeep" is gone, and
  that is the owner's to decide.

## Part 3: trial 12, `part_upkeep` 0.0002 to 0.0001

The last trial of the 12 allowed. One change, and the parameter stays live.

Hypothesis, written before the runs. The numbers are straight lines between the default and trial 11.

1. `gate-health` passes 3 of 3, with `creatures` near 1,470 on seed 1.
2. The WASM bench reads 2,600 to 2,750 and passes.
3. `gate-evolve` at tick 36,000 passes 3 of 3, with the scent gap of seed 1 near 0.17.
4. `gate-evolve` at tick 144,000 on seeds 1, 5, 8: this is the open one. The default reads `chemo`
   0.13, 0.04, 0.02 and trial 11 reads 0.20, 0.17, 0.18. Half-way is 0.17, 0.11, 0.10. I expect
   seed 1 to pass and do not know for seeds 5 and 8. If either fails, half the upkeep is not enough.

### Rows

```
$ target/release/tidepool-headless gate-health --param part_upkeep=0.0001
seed=1 creatures=1459 min_late=1316 plants=2229 births_late=2219 max_gen=16 mean_chemo=0.43 parked=0.00 first_bud=774 juv_starved=0.52 to_bud=0.33 PASS
seed=2 creatures=1312 min_late=1244 plants=2076 births_late=1989 max_gen=16 mean_chemo=0.38 parked=0.00 first_bud=805 juv_starved=0.51 to_bud=0.33 PASS
seed=3 creatures=1281 min_late=1226 plants=1965 births_late=2078 max_gen=15 mean_chemo=0.42 parked=0.00 first_bud=783 juv_starved=0.52 to_bud=0.32 PASS
gate-health 3/3 PASS

$ target/release/tidepool-headless bench --param part_upkeep=0.0001
$ node scripts/bench-wasm.mjs --param part_upkeep=0.0001
bench creatures=1416 median_tps=2918 floor=2400 PASS
bench-wasm creatures=1417 median_tps=2730 floor=2400 PASS

$ target/release/tidepool-headless gate-evolve --param part_upkeep=0.0001
seed=1 creatures=1577 creatures_noscent=1745 creatures_noeye=1588 len=11.1 len_sd=2.23 parts=5.1 chemo=0.30 chemo_blind=0.01 eye=0.22 eye_blind=0.07 plans=4 speed_cv=0.27 PASS
seed=2 creatures=1487 creatures_noscent=1441 creatures_noeye=1421 len=11.6 len_sd=1.86 parts=4.7 chemo=0.16 chemo_blind=0.03 eye=0.19 eye_blind=0.08 plans=3 speed_cv=0.31 PASS
seed=3 creatures=1502 creatures_noscent=1338 creatures_noeye=1434 len=11.4 len_sd=1.33 parts=4.9 chemo=0.26 chemo_blind=0.04 eye=0.24 eye_blind=0.07 plans=2 speed_cv=0.28 PASS
gate-evolve 3/3 PASS

$ target/release/tidepool-headless gate-evolve --seeds 1,5,8 --ticks 144000 --param part_upkeep=0.0001
seed=1 creatures=1839 creatures_noscent=1972 creatures_noeye=1361 len=9.6 len_sd=1.79 parts=6.4 chemo=0.14 chemo_blind=0.03 eye=0.28 eye_blind=0.02 plans=4 speed_cv=0.32 PASS
seed=5 creatures=1768 creatures_noscent=1830 creatures_noeye=1291 len=9.7 len_sd=1.72 parts=6.0 chemo=0.09 chemo_blind=0.00 eye=0.27 eye_blind=0.02 plans=6 speed_cv=0.25 FAIL(chemo_gap=0.085 < 0.1)
seed=8 creatures=1330 creatures_noscent=1654 creatures_noeye=1250 len=14.5 len_sd=4.55 parts=4.8 chemo=0.12 chemo_blind=0.01 eye=0.18 eye_blind=0.02 plans=5 speed_cv=0.37 PASS
gate-evolve 2/3 FAIL
```

Exit codes: 0, 0, 0, 0, and 1 for the last command.

### Verdict: every step of `make gates` passes. The long reading is 2 of 3, and thin

| Hypothesis | Result |
|---|---|
| 1. `gate-health` 3 of 3, seed 1 near 1,470 | Held. 1,459, 1,312, 1,281 |
| 2. WASM bench 2,600 to 2,750 | Held. 2,730 at 1,417 creatures. Native 2,918 |
| 3. Scent gap at tick 36,000, 3 of 3, seed 1 near 0.17 | Held, and larger. 0.29, 0.13, 0.22. Eye gaps 0.15, 0.11, 0.17 |
| 4. Both gaps at tick 144,000 on seeds 1, 5, 8 | **2 of 3.** Scent gaps 0.11, 0.085, 0.11. Eye gaps 0.26, 0.25, 0.16 |

- **At half the upkeep no screen seed loses a sense, and the scent gap sits on the band.** Seed 8 keeps
  `eye` 0.18 and `chemo` 0.12, against 0.03 and 0.02 at the default.
- **The scent sense still shrinks with time.** Seed 1 reads `chemo` 0.30 at tick 36,000 and 0.14 at
  tick 144,000. Nothing here says where it stops.
- **Seed 8 at tick 144,000 has `len_sd` 4.55** and `len` 14.5. That spread is 2 to 4 times the other
  rows. Not looked into.
- **The 12 trials of the plan are used.** What comes next is the owner's choice.

### Trial 12 on all 10 seeds. A reading, not a trial

```
$ target/release/tidepool-headless probe-census --seeds 1,2,3,4,5,6,7,8,9,10 --ticks 144000 --every 36000 --param part_upkeep=0.0001
seed=1 tick=36000 creatures=1577 plants=2229 juv=0.36 len=11.1 wid=0.50 egg=0.67 old=4061 area=62.0 flagellum=0.54 cilia=0.35 filter=0.81 chemo=0.30 fin=0.00 eye=0.22 parts=5.1 senseless=0.00 speed=1.14 turn=0.108 eaten=180.57 reserve01=0.36
seed=1 tick=144000 creatures=1839 plants=2229 juv=0.37 len=9.6 wid=0.49 egg=0.67 old=3080 area=42.0 flagellum=0.37 cilia=0.43 filter=0.95 chemo=0.14 fin=0.00 eye=0.28 parts=6.4 senseless=0.00 speed=0.81 turn=0.124 eaten=172.59 reserve01=0.24
seed=2 tick=36000 creatures=1487 plants=2076 juv=0.38 len=11.6 wid=0.50 egg=0.67 old=3668 area=70.0 flagellum=0.47 cilia=0.43 filter=0.70 chemo=0.16 fin=0.00 eye=0.19 parts=4.7 senseless=0.03 speed=1.14 turn=0.118 eaten=165.77 reserve01=0.33
seed=2 tick=144000 creatures=1736 plants=2076 juv=0.37 len=10.4 wid=0.42 egg=0.67 old=3547 area=47.6 flagellum=0.32 cilia=0.39 filter=0.87 chemo=0.05 fin=0.01 eye=0.24 parts=4.8 senseless=0.00 speed=0.86 turn=0.112 eaten=158.54 reserve01=0.26
seed=3 tick=36000 creatures=1502 plants=1965 juv=0.37 len=11.4 wid=0.46 egg=0.68 old=3630 area=61.1 flagellum=0.47 cilia=0.31 filter=0.75 chemo=0.26 fin=0.00 eye=0.24 parts=4.9 senseless=0.00 speed=1.03 turn=0.096 eaten=164.73 reserve01=0.33
seed=3 tick=144000 creatures=1747 plants=1965 juv=0.39 len=10.4 wid=0.39 egg=0.66 old=3138 area=41.5 flagellum=0.25 cilia=0.50 filter=0.87 chemo=0.17 fin=0.02 eye=0.24 parts=7.4 senseless=0.00 speed=0.73 turn=0.120 eaten=151.73 reserve01=0.23
seed=4 tick=36000 creatures=1206 plants=1764 juv=0.38 len=12.8 wid=0.51 egg=0.66 old=4118 area=83.1 flagellum=0.50 cilia=0.32 filter=0.73 chemo=0.16 fin=0.00 eye=0.20 parts=4.8 senseless=0.01 speed=1.12 turn=0.095 eaten=153.33 reserve01=0.34
seed=4 tick=144000 creatures=1478 plants=1764 juv=0.37 len=11.7 wid=0.42 egg=0.66 old=3639 area=54.7 flagellum=0.26 cilia=0.42 filter=0.78 chemo=0.13 fin=0.02 eye=0.23 parts=5.4 senseless=0.03 speed=0.71 turn=0.104 eaten=142.77 reserve01=0.24
seed=5 tick=36000 creatures=1563 plants=2178 juv=0.37 len=12.3 wid=0.46 egg=0.68 old=4095 area=71.4 flagellum=0.45 cilia=0.36 filter=0.74 chemo=0.19 fin=0.00 eye=0.18 parts=4.7 senseless=0.03 speed=1.10 turn=0.098 eaten=188.99 reserve01=0.34
seed=5 tick=144000 creatures=1768 plants=2178 juv=0.36 len=9.7 wid=0.48 egg=0.67 old=3260 area=42.9 flagellum=0.30 cilia=0.40 filter=0.92 chemo=0.09 fin=0.01 eye=0.27 parts=6.0 senseless=0.00 speed=0.73 turn=0.115 eaten=171.16 reserve01=0.25
seed=6 tick=36000 creatures=1324 plants=1851 juv=0.39 len=12.3 wid=0.47 egg=0.66 old=4050 area=72.0 flagellum=0.47 cilia=0.31 filter=0.78 chemo=0.28 fin=0.00 eye=0.20 parts=5.5 senseless=0.00 speed=0.98 turn=0.089 eaten=156.85 reserve01=0.35
seed=6 tick=144000 creatures=1484 plants=1851 juv=0.37 len=9.9 wid=0.53 egg=0.65 old=3525 area=49.2 flagellum=0.33 cilia=0.36 filter=0.88 chemo=0.14 fin=0.00 eye=0.28 parts=6.2 senseless=0.00 speed=0.81 turn=0.110 eaten=148.54 reserve01=0.26
seed=7 tick=36000 creatures=1515 plants=2058 juv=0.37 len=11.5 wid=0.48 egg=0.67 old=3839 area=65.9 flagellum=0.47 cilia=0.39 filter=0.90 chemo=0.17 fin=0.01 eye=0.22 parts=5.1 senseless=0.00 speed=1.06 turn=0.109 eaten=180.13 reserve01=0.33
seed=7 tick=144000 creatures=1851 plants=2058 juv=0.38 len=10.1 wid=0.39 egg=0.67 old=3067 area=40.3 flagellum=0.21 cilia=0.45 filter=0.91 chemo=0.08 fin=0.01 eye=0.25 parts=6.1 senseless=0.00 speed=0.67 turn=0.111 eaten=162.76 reserve01=0.24
seed=8 tick=36000 creatures=1286 plants=1731 juv=0.38 len=13.9 wid=0.49 egg=0.67 old=4500 area=95.6 flagellum=0.54 cilia=0.29 filter=0.67 chemo=0.16 fin=0.00 eye=0.10 parts=4.6 senseless=0.24 speed=1.34 turn=0.091 eaten=170.06 reserve01=0.29
seed=8 tick=144000 creatures=1330 plants=1731 juv=0.35 len=14.5 wid=0.35 egg=0.66 old=3689 area=77.7 flagellum=0.25 cilia=0.40 filter=0.72 chemo=0.12 fin=0.00 eye=0.18 parts=4.8 senseless=0.20 speed=0.79 turn=0.086 eaten=151.72 reserve01=0.22
seed=9 tick=36000 creatures=1722 plants=1917 juv=0.40 len=9.6 wid=0.49 egg=0.66 old=3234 area=46.5 flagellum=0.56 cilia=0.39 filter=0.96 chemo=0.15 fin=0.01 eye=0.25 parts=6.4 senseless=0.00 speed=1.17 turn=0.132 eaten=173.58 reserve01=0.27
seed=9 tick=144000 creatures=1796 plants=1917 juv=0.40 len=10.8 wid=0.35 egg=0.67 old=3226 area=41.9 flagellum=0.25 cilia=0.44 filter=0.95 chemo=0.08 fin=0.00 eye=0.23 parts=5.3 senseless=0.01 speed=0.72 turn=0.104 eaten=156.20 reserve01=0.24
seed=10 tick=36000 creatures=1405 plants=1884 juv=0.38 len=13.3 wid=0.42 egg=0.67 old=3910 area=74.7 flagellum=0.52 cilia=0.30 filter=0.75 chemo=0.12 fin=0.00 eye=0.21 parts=4.6 senseless=0.01 speed=1.17 turn=0.090 eaten=167.98 reserve01=0.32
seed=10 tick=144000 creatures=1583 plants=1884 juv=0.38 len=9.8 wid=0.49 egg=0.67 old=3460 area=47.4 flagellum=0.23 cilia=0.42 filter=0.87 chemo=0.19 fin=0.00 eye=0.29 parts=7.0 senseless=0.00 speed=0.67 turn=0.108 eaten=154.13 reserve01=0.23

$ target/release/tidepool-headless gate-evolve --seeds 4,5,6,7,8,9,10 --param part_upkeep=0.0001
seed=4 creatures=1206 creatures_noscent=1283 creatures_noeye=1398 len=12.8 len_sd=1.83 parts=4.8 chemo=0.16 chemo_blind=0.04 eye=0.20 eye_blind=0.05 plans=3 speed_cv=0.28 PASS
seed=5 creatures=1563 creatures_noscent=1524 creatures_noeye=1569 len=12.3 len_sd=1.52 parts=4.7 chemo=0.19 chemo_blind=0.02 eye=0.18 eye_blind=0.10 plans=3 speed_cv=0.24 FAIL(eye_gap=0.085 < 0.1)
seed=6 creatures=1324 creatures_noscent=1300 creatures_noeye=1316 len=12.3 len_sd=1.74 parts=5.5 chemo=0.28 chemo_blind=0.03 eye=0.20 eye_blind=0.06 plans=4 speed_cv=0.29 PASS
seed=7 creatures=1515 creatures_noscent=1568 creatures_noeye=1473 len=11.5 len_sd=2.28 parts=5.1 chemo=0.17 chemo_blind=0.07 eye=0.22 eye_blind=0.08 plans=4 speed_cv=0.27 FAIL(chemo_gap=0.099 < 0.1)
seed=8 creatures=1286 creatures_noscent=1437 creatures_noeye=1220 len=13.9 len_sd=2.26 parts=4.6 chemo=0.16 chemo_blind=0.01 eye=0.10 eye_blind=0.04 plans=7 speed_cv=0.27 FAIL(eye_gap=0.055 < 0.1)
seed=9 creatures=1722 creatures_noscent=1466 creatures_noeye=1525 len=9.6 len_sd=1.91 parts=6.4 chemo=0.15 chemo_blind=0.01 eye=0.25 eye_blind=0.07 plans=4 speed_cv=0.25 PASS
seed=10 creatures=1405 creatures_noscent=1421 creatures_noeye=1553 len=13.3 len_sd=2.19 parts=4.6 chemo=0.12 chemo_blind=0.05 eye=0.21 eye_blind=0.05 plans=3 speed_cv=0.26 FAIL(chemo_gap=0.076 < 0.1)
gate-evolve 3/7 FAIL
```

Exit codes: 0 and 1.

| Reading, seeds 1 to 10 | Default (`m2-long-run.md`, `m2-tuning.md`) | Trial 12 |
|---|---|---|
| `gate-evolve` at tick 36,000 | 5 of 10 | 6 of 10 |
| Scent gap at tick 36,000, at least 0.10 | 5 of 10 | 8 of 10. Seeds 7 and 10 read 0.099 and 0.076 |
| Eye gap at tick 36,000, at least 0.10 | 10 of 10 | 8 of 10. Seeds 5 and 8 read 0.085 and 0.055 |
| `chemo` at tick 144,000, at least 0.12 | 4 of 10. The rest read 0.02 to 0.07 | 6 of 10. The rest read 0.05 to 0.09 |
| `eye` at tick 144,000, at least 0.15 | 9 of 10. Seed 8 reads 0.03 | 10 of 10. 0.18 to 0.29 |
| `senseless` at tick 144,000 | 0.83 on seed 8 | 0.20 on seed 8. At most 0.03 on the rest |
| `flagellum` at tick 144,000 | 0.20 to 0.34 | 0.21 to 0.37 |
| `speed` at tick 144,000 | 0.63 to 0.92 | 0.67 to 0.86 |
| `creatures` at tick 144,000 | 1,104 to 1,774 | 1,330 to 1,851 |

- **Half the upkeep is a small gain and not a fix.** `make gates` would pass, because it reads seeds 1,
  2, 3. On 10 seeds the gate reads 6 of 10 against 5 of 10.
- **The eye gap got worse at tick 36,000 on two seeds.** The blind world keeps more of the eye when
  the eye costs less (`eye_blind` 0.10 on seed 5).
- **One run per seed moves a lot.** Seed 2 reads `chemo` 0.13 at the default and 0.05 here, at tick
  144,000. A count of seeds that changes by 1 or 2 is inside that noise. The mean of `chemo` over the
  10 seeds is about 0.08 at the default and 0.12 here.
- **The tail and the speed do not move.** The upkeep of a part is not why every world gets slower.

## Part 4: trial 11 on all 10 seeds. A reading, not a trial

Seeds 1, 5, 8 of the census are in Part 1 (control 1). These are the other seven, with every row,
because the shape over time matters here.

```
$ target/release/tidepool-headless probe-census --seeds 2,3,4,6,7,9,10 --ticks 144000 --every 36000 --param part_upkeep=0
seed=2 tick=36000 creatures=1549 plants=2076 juv=0.37 len=11.6 wid=0.51 egg=0.66 old=4011 area=69.2 flagellum=0.51 cilia=0.43 filter=0.73 chemo=0.23 fin=0.00 eye=0.22 parts=5.0 senseless=0.00 speed=1.13 turn=0.116 eaten=156.67 reserve01=0.30
seed=2 tick=72000 creatures=1616 plants=2076 juv=0.38 len=10.5 wid=0.44 egg=0.67 old=3842 area=48.4 flagellum=0.40 cilia=0.67 filter=0.79 chemo=0.22 fin=0.01 eye=0.23 parts=5.6 senseless=0.00 speed=0.92 turn=0.147 eaten=152.47 reserve01=0.27
seed=2 tick=108000 creatures=1688 plants=2076 juv=0.37 len=10.9 wid=0.33 egg=0.67 old=3522 area=39.8 flagellum=0.24 cilia=0.74 filter=0.90 chemo=0.23 fin=0.00 eye=0.23 parts=5.9 senseless=0.00 speed=0.77 turn=0.136 eaten=146.50 reserve01=0.24
seed=2 tick=144000 creatures=1654 plants=2076 juv=0.36 len=11.4 wid=0.33 egg=0.66 old=3439 area=43.3 flagellum=0.26 cilia=0.76 filter=0.89 chemo=0.20 fin=0.01 eye=0.23 parts=5.8 senseless=0.00 speed=0.80 turn=0.137 eaten=144.44 reserve01=0.21
seed=3 tick=36000 creatures=1540 plants=1965 juv=0.41 len=12.1 wid=0.44 egg=0.65 old=4401 area=65.2 flagellum=0.51 cilia=0.39 filter=0.84 chemo=0.37 fin=0.01 eye=0.24 parts=5.7 senseless=0.00 speed=1.01 turn=0.097 eaten=155.93 reserve01=0.30
seed=3 tick=72000 creatures=1652 plants=1965 juv=0.40 len=10.4 wid=0.39 egg=0.65 old=3659 area=43.1 flagellum=0.40 cilia=0.62 filter=1.09 chemo=0.22 fin=0.01 eye=0.24 parts=6.8 senseless=0.00 speed=0.87 turn=0.130 eaten=148.48 reserve01=0.25
seed=3 tick=108000 creatures=1789 plants=1965 juv=0.40 len=9.9 wid=0.38 egg=0.66 old=3296 area=36.1 flagellum=0.39 cilia=0.65 filter=1.08 chemo=0.22 fin=0.02 eye=0.27 parts=7.2 senseless=0.00 speed=0.84 turn=0.142 eaten=145.00 reserve01=0.23
seed=3 tick=144000 creatures=1735 plants=1965 juv=0.39 len=9.8 wid=0.38 egg=0.67 old=3131 area=36.5 flagellum=0.41 cilia=0.56 filter=1.09 chemo=0.21 fin=0.02 eye=0.27 parts=7.3 senseless=0.00 speed=0.90 turn=0.133 eaten=144.38 reserve01=0.23
seed=4 tick=36000 creatures=1314 plants=1764 juv=0.37 len=12.0 wid=0.49 egg=0.67 old=4217 area=72.1 flagellum=0.55 cilia=0.39 filter=0.75 chemo=0.35 fin=0.01 eye=0.22 parts=5.4 senseless=0.00 speed=1.11 turn=0.105 eaten=143.43 reserve01=0.32
seed=4 tick=72000 creatures=1480 plants=1764 juv=0.39 len=10.6 wid=0.49 egg=0.66 old=4026 area=56.0 flagellum=0.55 cilia=0.46 filter=0.76 chemo=0.27 fin=0.04 eye=0.25 parts=6.2 senseless=0.00 speed=0.96 turn=0.130 eaten=139.42 reserve01=0.27
seed=4 tick=108000 creatures=1574 plants=1764 juv=0.39 len=10.0 wid=0.45 egg=0.66 old=3737 area=46.0 flagellum=0.55 cilia=0.48 filter=0.83 chemo=0.22 fin=0.06 eye=0.24 parts=6.3 senseless=0.00 speed=0.89 turn=0.141 eaten=135.27 reserve01=0.24
seed=4 tick=144000 creatures=1411 plants=1764 juv=0.36 len=10.1 wid=0.42 egg=0.66 old=3321 area=42.7 flagellum=0.42 cilia=0.52 filter=0.93 chemo=0.21 fin=0.05 eye=0.25 parts=6.4 senseless=0.00 speed=0.86 turn=0.131 eaten=133.93 reserve01=0.24
seed=6 tick=36000 creatures=1376 plants=1851 juv=0.37 len=12.1 wid=0.48 egg=0.67 old=4111 area=70.5 flagellum=0.46 cilia=0.45 filter=0.74 chemo=0.29 fin=0.00 eye=0.20 parts=5.4 senseless=0.02 speed=1.03 turn=0.107 eaten=146.63 reserve01=0.32
seed=6 tick=72000 creatures=1486 plants=1851 juv=0.36 len=11.4 wid=0.42 egg=0.66 old=3610 area=55.2 flagellum=0.45 cilia=0.51 filter=0.88 chemo=0.15 fin=0.00 eye=0.24 parts=5.6 senseless=0.00 speed=0.88 turn=0.122 eaten=142.21 reserve01=0.25
seed=6 tick=108000 creatures=1621 plants=1851 juv=0.40 len=10.0 wid=0.43 egg=0.65 old=3303 area=41.8 flagellum=0.45 cilia=0.50 filter=1.00 chemo=0.20 fin=0.01 eye=0.29 parts=6.2 senseless=0.00 speed=0.85 turn=0.132 eaten=138.67 reserve01=0.23
seed=6 tick=144000 creatures=1512 plants=1851 juv=0.37 len=9.9 wid=0.42 egg=0.66 old=3207 area=40.4 flagellum=0.39 cilia=0.55 filter=0.98 chemo=0.21 fin=0.00 eye=0.30 parts=6.4 senseless=0.00 speed=0.85 turn=0.131 eaten=136.30 reserve01=0.23
seed=7 tick=36000 creatures=1777 plants=2058 juv=0.38 len=10.4 wid=0.41 egg=0.68 old=3203 area=47.0 flagellum=0.47 cilia=0.55 filter=1.09 chemo=0.24 fin=0.00 eye=0.23 parts=5.9 senseless=0.00 speed=1.05 turn=0.130 eaten=166.58 reserve01=0.26
seed=7 tick=72000 creatures=1807 plants=2058 juv=0.38 len=9.8 wid=0.38 egg=0.67 old=3197 area=37.5 flagellum=0.39 cilia=0.63 filter=1.16 chemo=0.22 fin=0.00 eye=0.28 parts=6.4 senseless=0.00 speed=0.83 turn=0.137 eaten=159.40 reserve01=0.24
seed=7 tick=108000 creatures=1825 plants=2058 juv=0.40 len=10.1 wid=0.34 egg=0.67 old=3004 area=34.7 flagellum=0.35 cilia=0.65 filter=1.26 chemo=0.22 fin=0.01 eye=0.25 parts=6.7 senseless=0.00 speed=0.78 turn=0.130 eaten=156.17 reserve01=0.22
seed=7 tick=144000 creatures=1836 plants=2058 juv=0.38 len=10.2 wid=0.34 egg=0.67 old=3232 area=35.6 flagellum=0.38 cilia=0.55 filter=1.13 chemo=0.23 fin=0.01 eye=0.25 parts=6.6 senseless=0.00 speed=0.79 turn=0.123 eaten=155.58 reserve01=0.22
seed=9 tick=36000 creatures=1495 plants=1917 juv=0.36 len=12.1 wid=0.49 egg=0.68 old=4376 area=71.8 flagellum=0.55 cilia=0.44 filter=0.77 chemo=0.34 fin=0.00 eye=0.18 parts=5.2 senseless=0.00 speed=1.20 turn=0.110 eaten=163.23 reserve01=0.28
seed=9 tick=72000 creatures=1700 plants=1917 juv=0.40 len=11.2 wid=0.40 egg=0.66 old=3456 area=50.5 flagellum=0.52 cilia=0.58 filter=0.92 chemo=0.18 fin=0.01 eye=0.24 parts=5.3 senseless=0.00 speed=1.06 turn=0.133 eaten=158.32 reserve01=0.24
seed=9 tick=108000 creatures=1765 plants=1917 juv=0.38 len=10.1 wid=0.40 egg=0.67 old=3236 area=40.8 flagellum=0.43 cilia=0.58 filter=0.98 chemo=0.17 fin=0.02 eye=0.24 parts=6.0 senseless=0.00 speed=0.94 turn=0.138 eaten=152.31 reserve01=0.23
seed=9 tick=144000 creatures=1741 plants=1917 juv=0.40 len=9.7 wid=0.39 egg=0.67 old=3207 area=37.5 flagellum=0.36 cilia=0.59 filter=1.09 chemo=0.23 fin=0.02 eye=0.27 parts=7.0 senseless=0.00 speed=0.83 turn=0.133 eaten=149.37 reserve01=0.22
seed=10 tick=36000 creatures=1516 plants=1884 juv=0.38 len=12.5 wid=0.43 egg=0.68 old=4112 area=67.1 flagellum=0.52 cilia=0.40 filter=0.86 chemo=0.31 fin=0.00 eye=0.18 parts=5.4 senseless=0.00 speed=1.10 turn=0.098 eaten=158.28 reserve01=0.27
seed=10 tick=72000 creatures=1744 plants=1884 juv=0.39 len=11.1 wid=0.36 egg=0.66 old=3967 area=44.3 flagellum=0.50 cilia=0.44 filter=1.09 chemo=0.19 fin=0.01 eye=0.22 parts=6.5 senseless=0.00 speed=0.92 turn=0.110 eaten=150.29 reserve01=0.22
seed=10 tick=108000 creatures=1598 plants=1884 juv=0.38 len=11.0 wid=0.34 egg=0.66 old=3501 area=42.2 flagellum=0.50 cilia=0.44 filter=0.97 chemo=0.23 fin=0.03 eye=0.24 parts=7.0 senseless=0.00 speed=0.92 turn=0.114 eaten=143.72 reserve01=0.21
seed=10 tick=144000 creatures=1641 plants=1884 juv=0.36 len=10.7 wid=0.37 egg=0.67 old=3364 area=42.1 flagellum=0.55 cilia=0.44 filter=1.02 chemo=0.18 fin=0.02 eye=0.26 parts=7.1 senseless=0.00 speed=0.98 turn=0.119 eaten=142.89 reserve01=0.20

$ target/release/tidepool-headless gate-evolve --seeds 4,5,6,7,8,9,10 --param part_upkeep=0
seed=4 creatures=1314 creatures_noscent=1333 creatures_noeye=1435 len=12.0 len_sd=1.72 parts=5.4 chemo=0.35 chemo_blind=0.12 eye=0.22 eye_blind=0.09 plans=5 speed_cv=0.25 PASS
seed=5 creatures=1660 creatures_noscent=1779 creatures_noeye=1715 len=11.7 len_sd=1.58 parts=5.9 chemo=0.35 chemo_blind=0.02 eye=0.23 eye_blind=0.09 plans=6 speed_cv=0.23 PASS
seed=6 creatures=1376 creatures_noscent=1418 creatures_noeye=1406 len=12.1 len_sd=1.52 parts=5.4 chemo=0.29 chemo_blind=0.18 eye=0.20 eye_blind=0.09 plans=5 speed_cv=0.31 PASS
seed=7 creatures=1777 creatures_noscent=1650 creatures_noeye=1540 len=10.4 len_sd=2.01 parts=5.9 chemo=0.24 chemo_blind=0.11 eye=0.23 eye_blind=0.12 plans=2 speed_cv=0.22 PASS
seed=8 creatures=1399 creatures_noscent=1501 creatures_noeye=1434 len=13.0 len_sd=1.38 parts=5.0 chemo=0.22 chemo_blind=0.02 eye=0.19 eye_blind=0.09 plans=3 speed_cv=0.26 PASS
seed=9 creatures=1495 creatures_noscent=1490 creatures_noeye=1441 len=12.1 len_sd=1.57 parts=5.2 chemo=0.34 chemo_blind=0.02 eye=0.18 eye_blind=0.07 plans=4 speed_cv=0.26 PASS
seed=10 creatures=1516 creatures_noscent=1490 creatures_noeye=1386 len=12.5 len_sd=1.34 parts=5.4 chemo=0.31 chemo_blind=0.10 eye=0.18 eye_blind=0.12 plans=5 speed_cv=0.31 FAIL(eye_gap=0.064 < 0.1)
gate-evolve 6/7 FAIL
```

Exit codes: 0 and 1.

| Reading, seeds 1 to 10 | Default | Trial 12, half | Trial 11, none |
|---|---|---|---|
| `gate-evolve` at tick 36,000 | 5 of 10 | 6 of 10 | 9 of 10. Seed 10 fails the eye gap at 0.064 |
| Scent gap at tick 36,000, at least 0.10 | 5 of 10 | 8 of 10 | 10 of 10. 0.11 to 0.33 |
| Eye gap at tick 36,000, at least 0.10 | 10 of 10 | 8 of 10 | 9 of 10. Six of the nine read 0.10 to 0.12 |
| `chemo` at tick 144,000 | 0.12 to 0.15 on 4, 0.02 to 0.07 on 6 | 0.12 to 0.19 on 6, 0.05 to 0.09 on 4 | 0.17 to 0.23 on 10 of 10 |
| `eye` at tick 144,000 | 0.17 to 0.24 on 9, 0.03 on seed 8 | 0.18 to 0.29 | 0.23 to 0.30 |
| `senseless` at tick 144,000 | 0.83 on seed 8 | 0.20 on seed 8 | 0.00 on 10 of 10 |
| `flagellum` at tick 144,000 | 0.20 to 0.34 | 0.21 to 0.37 | 0.26 to 0.55 |
| `speed` at tick 144,000 | 0.63 to 0.92 | 0.67 to 0.86 | 0.77 to 0.98 |
| `area` at tick 144,000 | 47 to 77 on 9, 130 on seed 8 | 40 to 55 on 9, 78 on seed 8 | 32 to 45 |
| `creatures` at tick 144,000 | 1,104 to 1,774 | 1,330 to 1,851 | 1,411 to 2,093 |

`chemo` at ticks 36,000, 72,000, 108,000, 144,000:

| Seed | Default | Trial 11 |
|---|---|---|
| 1 | 0.14, 0.14, 0.12, 0.13 | 0.31, 0.23, 0.23, 0.20 |
| 2 | 0.15, 0.20, 0.13, 0.13 | 0.23, 0.22, 0.23, 0.20 |
| 3 | 0.28, 0.17, 0.19, 0.15 | 0.37, 0.22, 0.22, 0.21 |
| 4 | 0.17, 0.07, 0.04, 0.03 | 0.35, 0.27, 0.22, 0.21 |
| 5 | 0.08, 0.02, 0.04, 0.04 | 0.35, 0.21, 0.14, 0.17 |
| 6 | 0.20, 0.20, 0.10, 0.07 | 0.29, 0.15, 0.20, 0.21 |
| 7 | 0.07, 0.04, 0.03, 0.02 | 0.24, 0.22, 0.22, 0.23 |
| 8 | 0.03, 0.03, 0.02, 0.02 | 0.22, 0.19, 0.22, 0.18 |
| 9 | 0.15, 0.09, 0.02, 0.02 | 0.34, 0.18, 0.17, 0.23 |
| 10 | 0.18, 0.16, 0.14, 0.12 | 0.31, 0.19, 0.23, 0.18 |

`speed` at the same ticks, trial 11: seed 1 reads 1.09, 0.83, 0.81, 0.81. Seed 2: 1.13, 0.92, 0.77,
0.80. Seed 3: 1.01, 0.87, 0.84, 0.90. Seed 4: 1.11, 0.96, 0.89, 0.86. Seed 5: 1.18, 1.01, 0.89, 0.77.
Seed 6: 1.03, 0.88, 0.85, 0.85. Seed 7: 1.05, 0.83, 0.78, 0.79. Seed 8: 1.29, 0.96, 0.88, 0.94. Seed
9: 1.20, 1.06, 0.94, 0.83. Seed 10: 1.10, 0.92, 0.92, 0.98.

- **With no part upkeep the scent sense settles near 0.2 on 10 of 10 seeds and stays there from tick
  72,000.** A founder has 0.5. At the default it runs down to 0.02 on five seeds. This is not inside
  the noise of one run per seed: ten seeds land in 0.17 to 0.23.
- **"Evolution uses it" is shown at tick 36,000 on 10 of 10 seeds (scent gap) and at tick 144,000 on
  seeds 1, 5, 8.** The other seven seeds have no gap reading at tick 144,000.
- **The speed settles on 8 of 10 seeds, near 0.8 to 1.0.** Seeds 5 and 9 are still falling at tick
  144,000. So the fall of the speed looks like a level that evolution finds, and not a run to zero.
  Whether 0.8 looks alive on the page is not measured.
- **The eye gap is thin at tick 36,000.** A blind world keeps a free eye (`eye_blind` 0.07 to 0.12),
  so the gap measures less when a part is cheap.

## Result

**The upkeep of a part is what removes the senses in this world. Food that never moves is not shown
to be the cause.** Removing the upkeep holds the scent sense and the eyes on 10 of 10 seeds to tick
144,000. Halving it does not.

Trial 11 cannot be the default as it stands:

1. The WASM bench fails: 2,385 against 2,400 at 1,587 creatures. The world needs less food to hold
   fewer bodies, and that is a trial past the 12 that the plan allows.
2. A default of 0 is the rule "a part has upkeep" switched off. By "no dead flags" the parameter
   would go, and a part would cost through its mass alone. Removing a rule is the owner's choice.
3. The body is smaller: `area` 32 to 45, against 47 to 77.

No turnover rule was built.

## Part 5: the owner chose to delete the part upkeep and cut the food

Decision of 2026-10-12, in `docs/decisions/INDEX.md`. At most 3 trials past the 12. Each trial runs
with `part_upkeep=0`, which is the world that the deletion gives. Order of each trial: the health gate
and both benches first. If they pass, `gate-evolve` at tick 36,000 on seeds 1 to 10, the census to
tick 144,000 on seeds 1 to 10, and `gate-evolve` at tick 144,000 on seeds 1, 5, 8.

### Trial 13: `plant_growth` 0.035 to 0.03

Why this lever: trial 3 of `m2-tuning.md` moved `plant_growth` by 1.75 times and the count by 1.64
times, and it is the one food number that trial did not tie to the size of the body.

Hypothesis, written before the runs:

1. `creatures` at tick 12,000 on seed 1 falls from 1,613 to about 1,400 (0.03 / 0.035 of it, a little
   less than in proportion).
2. The WASM bench reads about 2,700 and passes. Trial 12 read 2,730 at 1,417 creatures.
3. `gate-health` passes 3 of 3.
4. The senses hold as in trial 11: `chemo` at least 0.12 on 10 of 10 seeds at tick 144,000, and the
   scent gap at tick 36,000 at least 0.10 on at least 9 of 10. The risk: less food makes every cost
   weigh more, and the sense shrinks again.
5. `len` stays inside 7.8 to 22.2 on every seed at both ticks. The risk: trial 11 reads 8.9 on seed 1
   at tick 144,000, and less food may take the last unit.


### Rows, the fast steps

```
$ target/release/tidepool-headless gate-health --param part_upkeep=0 --param plant_growth=0.03
$ target/release/tidepool-headless bench --param part_upkeep=0 --param plant_growth=0.03
$ node scripts/bench-wasm.mjs --param part_upkeep=0 --param plant_growth=0.03
seed=1 creatures=1319 min_late=1252 plants=2229 births_late=1802 max_gen=14 mean_chemo=0.48 parked=0.00 first_bud=916 juv_starved=0.52 to_bud=0.32 PASS
seed=2 creatures=1253 min_late=1186 plants=2076 births_late=1709 max_gen=16 mean_chemo=0.43 parked=0.00 first_bud=867 juv_starved=0.50 to_bud=0.33 PASS
seed=3 creatures=1243 min_late=1133 plants=1965 births_late=1670 max_gen=14 mean_chemo=0.47 parked=0.00 first_bud=854 juv_starved=0.51 to_bud=0.33 PASS
gate-health 3/3 PASS
bench creatures=1320 median_tps=3188 floor=2400 PASS
bench-wasm creatures=1320 median_tps=2933 floor=2400 PASS
```

Exit codes: 0, 0, 0. Hypotheses 2 and 3 held. Hypothesis 1 held in direction and the fall was larger:
1,319 on seed 1, not 1,400. The WASM bench reads 2,933, with more room than the 2,700 expected.
