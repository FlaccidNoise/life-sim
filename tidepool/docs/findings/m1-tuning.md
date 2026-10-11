# M1 tuning: the defaults against the health gate

Date: 2026-10-10. Base commit: 5b67415. Task 16 of `docs/plans/2026-10-10-m0-m1-first-swim.md`.

## Result

**The health gate passes 3 of 3 with two changed defaults. 5 of the 12 trials were used.**

| Parameter | Old | New | Trial | Reason |
|---|---|---|---|---|
| `plant_growth` | 0.005 | 0.02 | 1, 2, 4 | A plant must recover faster than a creature starves. At 0.005 the founders crash to a handful |
| `intake_rate` | 0.04 | 0.08 | 3 | A creature touches a plant about a third of the time, so the old mouth only paid the upkeep |

```
$ target/release/tidepool-headless gate-health
seed=1 creatures=1477 min_late=778 plants=1682 births_late=1544 max_gen=11 mean_chemo=0.57 parked=0.00 first_bud=1527 PASS
seed=2 creatures=1373 min_late=958 plants=1471 births_late=1470 max_gen=12 mean_chemo=0.50 parked=0.00 first_bud=1483 PASS
seed=3 creatures=1148 min_late=669 plants=1504 births_late=1165 max_gen=11 mean_chemo=0.53 parked=0.00 first_bud=1638 PASS
gate-health 3/3 PASS
```

**A generation is about twice as long as the time-skip budget assumes.** Mean `first_bud` is 1,549
ticks (1,527, 1,483, 1,638), which is 1.9 times the 800 that the 24,000-tick skip assumes
(`architecture.md` §2). Seed 3 alone is 2.05 times. The whole generation is longer than the first bud:
over one skip the mean generation of the living rises by about 11 (`m1-skip-drift.md`), which is about
2,200 ticks per generation and 2.7 times the assumption. One skip holds about 11 generations, not 30.
The skip length is decided in M5.

**The throughput gate is still void.** The bench world holds a mean of 425 creatures and the gate
needs 1,200. Trial 5 shows that no food supply passes both gates. See "The bench" below.

**Resolved after this task.** The benches now time the default world after 12,000 ticks of settling, and
`make gates` exits 0 (`gates.md`, "Throughput bench"). The paragraph above and "The bench" below record
what the seeded bench world did. They are kept as the evidence for that decision.

## Protocol

- A **trial** is `tidepool-headless gate-health` on seeds 1, 2, 3 at 12,000 ticks, one seed after
  another, with `--param` for the change. `params.rs` holds the old defaults for every trial, so each
  trial runs on the same binary as the baseline.
- Each trial changes one parameter, or one group that only makes sense together. The hypothesis is
  written before the run.
- The budget is 12 trials. The baseline is not a trial.
- A **look** is a shorter run that helps form a hypothesis. A look decides nothing. Every look here is
  on seed 1 only, at 3,000 ticks or fewer.
- The **bench column** is the reference world of the throughput gate (3072 by 1536, 1,500 founder
  creatures, 3,000 founder plants asked, seed 1, 200 warm-up ticks, 2,000 timed ticks). For a trial it
  comes from a scratch copy of `scripts/bench-wasm.mjs` that sets parameters on the same `.wasm`. It
  prints the mean alive count over the timed ticks and the ticks per second. The gate needs a mean of
  1,200 alive and 2,400 ticks per second. Another agent ran tests on the machine during these readings,
  so each ticks-per-second figure is a lower bound.

## Baseline (the arithmetic defaults)

```
$ target/release/tidepool-headless gate-health
seed=1 creatures=177 min_late=30 plants=2179 births_late=129 max_gen=5 mean_chemo=0.49 parked=0.00 first_bud=1858 FAIL(min_late=30 < 100, max_gen=5 < 8)
seed=2 creatures=234 min_late=103 plants=2006 births_late=168 max_gen=7 mean_chemo=0.50 parked=0.00 first_bud=1972 FAIL(max_gen=7 < 8)
seed=3 creatures=156 min_late=110 plants=1872 births_late=134 max_gen=6 mean_chemo=0.58 parked=0.00 first_bud=1992 FAIL(max_gen=6 < 8)
gate-health 0/3 FAIL
```

Bench: `VOID: population fell` on both benches (mean 144 alive). The bench world holds 1,501 creatures
at tick 200, 128 at tick 600, and 2 at tick 2,200.

What the baseline shows:

- Every seed fails `max_gen`. Seed 1 also fails `min_late`.
- `first_bud` is 1,858 to 1,992 ticks. The time-skip budget assumes about 800. That is off by more
  than a factor of 2.
- The default world falls to 3, 8, and 9 creatures at tick 2,000 (Task 15) and then climbs back. The
  run spends its first third in that bottleneck, so few generations fit in 12,000 ticks.

## Two readings that are not trials

While trying bad worlds to prove the bands of the gate (`docs/gates.md`), one of them ran 12,000 ticks
on seed 1 and passed. It was meant as a world with too many plants. It is recorded here because it is a
12,000-tick reading with changed food parameters. It is one seed, and it decided nothing.

```
$ gate-health --seeds 1 --param plant_cell_cap=16 --param fert_radius=600
seed=1 creatures=948 min_late=190 plants=3118 births_late=2323 max_gen=12 mean_chemo=0.57 parked=0.00 first_bud=804 PASS
```

It removes the patches (fertility is 1 everywhere), which the design does not want. It does say that
food is the limit: with more of it the same creatures reach generation 12.

## Looks before trial 1

Seed 1. "Default" is the default world: alive at ticks 500, 1,000, 2,000, 3,000. "Bench" is the bench
world: alive at ticks 600, 1,000, 2,200, and the mean over the timed ticks.

| Change | Default | Bench | Bench mean | Bench ticks per second |
|---|---|---|---|---|
| none | 315, 20, 3, 11 | 128, 3, 2 | 144 | 17,412 |
| `plant_growth=0.01` | 369, 162, 117, 277 | 277, 37, 65 | 198 | 15,122 |
| `plant_growth=0.02` | 474, 433, 463, 589 | 560, 227, 286 | 371 | 11,160 |
| `plant_growth=0.04` | 666, 866, 993, 930 | 947, 579, 709 | 722 | 6,462 |
| `plant_growth=0.08` | 785, 1313, 1608, 1534 | 1491, 1316, 1295 | 1,333 | 3,621 |
| `plant_cap=40` | 486, 222, 48, 99 | 558, 72, 14 | 244 | 13,094 |
| `plant_cap=80` | 723, 787, 279, 202 | 1210, 493, 43 | 508 | 7,888 |
| `bite_fraction=0.01` | 270, 27, 13, 30 | 77, 1, 3 | 136 | 18,345 |
| `plant_cell_cap=6` | 322, 34, 7, 28 | 436, 24, 10 | 207 | 12,968 |
| `fert_radius=150` | 362, 57, 19, 62 | 439, 24, 16 | 218 | 12,804 |
| `plant_growth=0.04 bite_fraction=0.1` | 624, 713, 638, 660 | 804, 342, 255 | 451 | 9,038 |
| `plant_growth=0.04 bite_fraction=0.02` | 597, 859, 1052, 1044 | 1036, 794, 897 | 911 | 5,121 |
| `plant_growth=0.04 bite_fraction=0.01` | 477, 562, 701, 690 | 925, 591, 483 | 663 | 6,675 |
| `plant_growth=0.04 bite_fraction=0.005` | 386, 231, 112, 72 | 656, 226, 33 | 321 | 11,033 |
| `plant_growth=0.04 plant_cap=40` | 879, 1472, 1604, 1549 | 1703, 1340, 1117 | 1,294 | 3,632 |
| `plant_growth=0.02 plant_cap=80` | 928, 1599, 1586, 1319 | 2131, 1762, 775 | 1,388 | 3,172 |
| `plant_growth=0.04`, with `basal`, `part_upkeep`, and `move_cost` halved | 900, 1491, 1729, 1368 | 1977, 1666, 660 | 1,348 | 3,491 |
| `plant_growth=0.04 intake_rate=0.08` | 795, 920, 944, 1038 | 1055, 633, 848 | 803 | 5,861 |
| `plant_growth=0.04 fert_blobs=28` | 690, 1229, 2137, 2290 | 1694, 1574, 1780 | 1,637 | 3,098 |
| `plant_growth=0.06 bite_fraction=0.02` | 688, 1101, 1492, 1459 | 1312, 1239, 1350 | 1,294 | 3,586 |
| `plant_growth=0.04 bite_fraction=0.02 plant_cap=30` | 787, 1285, 1678, 1624 | 1438, 1394, 1445 | 1,406 | 3,297 |
| `plant_growth=0.03 bite_fraction=0.015 plant_cap=40` | 765, 1309, 1737, 1755 | 1532, 1533, 1546 | 1,516 | 3,036 |

What the looks suggest. None of this is decided by them.

- `plant_growth` is the lever on the early crash. No other single food parameter removes it.
- A larger `plant_cap` alone, or lower upkeep, gives a boom and then a fall: the creatures eat the
  standing reserve and the plants cannot refill it.
- `bite_fraction` has a best value near half of `plant_growth`. Arithmetic agrees: one grazer that takes
  `bite_fraction` of the reserve each tick holds a plant at `1 - bite_fraction / plant_growth` of its
  limit, and a plant grows fastest at half of its limit. At 0.05 against 0.005 a grazer drains the plant.
- **The bench world has the same 14 fertile patches as the default world in 3 times the area.**
  `fert_blobs` is a count, not a density. So the bench world carries about as many creatures as the
  default world, not 3 times as many. A food supply that holds 1,200 in the bench world holds about
  1,500 in the default world.

## Trials

### Trial 1: `plant_growth` 0.005 to 0.04

Hypothesis, written before the run. A plant at 0.005 needs about 440 ticks to grow from a seedling to
half of its limit. A creature starves in about 360 ticks. The food recovers slower than the eaters die,
so the founders crash to a handful. At 0.04 a plant recovers in about 55 ticks, and the most that a
plant can grow per tick rises 8 times. Expected: no bottleneck, `creatures` near 900 on every seed,
`min_late` above 500, `max_gen` at 8 or more, `first_bud` near 1,000 or below, `plants` near 2,000,
`mean_chemo` and `parked` unchanged. Expected bench: void, with a mean near 720.

Result:

```
$ gate-health --param plant_growth=0.04
seed=1 creatures=1938 min_late=1208 plants=1789 births_late=1654 max_gen=9 mean_chemo=0.55 parked=0.00 first_bud=2123 PASS
seed=2 creatures=2131 min_late=1063 plants=1602 births_late=2208 max_gen=9 mean_chemo=0.52 parked=0.00 first_bud=1910 PASS
seed=3 creatures=1860 min_late=981 plants=1484 births_late=1814 max_gen=9 mean_chemo=0.56 parked=0.00 first_bud=1895 PASS
gate-health 3/3 PASS
```

Bench: void. Mean 722 alive, 6,300 ticks per second. Alive every 200 ticks from tick 200: 1541, 1213,
947, 701, 579, 530, 511, 534, 580, 644, 709.

Verdict: **the gate passes.** The hypothesis was right about the bottleneck and wrong about two numbers.

- `creatures` is near 2,000, not 900. The look at tick 3,000 read 930. The count doubles between tick
  3,000 and tick 12,000 because bodies shrink (see "What evolves" below). A short look was wrong again.
- `first_bud` did not fall. It is 1,895 to 2,123.
- `max_gen` is 9 on all 3 seeds, one above the band.

More readings of this set. None is a trial: the parameters did not change.

- Seeds 4 to 10 at 12,000 ticks: 7 of 7 pass. `creatures` 1,466 to 2,291, `min_late` 947 to 1,224,
  `plants` 926 to 1,593, `max_gen` 9 to 11, `mean_chemo` 0.39 to 0.57, `first_bud` 1,845 to 2,176.
- Seeds 1, 2, 3 at 36,000 ticks (`--ticks 36000`): 3 of 3 pass. `creatures` 1,119, 952, 1,054.
  `plants` 666, 580, 600. `max_gen` 26, 24, 25. `mean_chemo` 0.59, 0.59, 0.66. `first_bud` 1,632,
  1,585, 1,618.
- Seed 1 to 60,000 ticks (scratch census): plants level off between 520 and 720 from tick 44,000.
- Throughput of this default world, seed 1, WASM in Node: 2,928 ticks per second over ticks 10,000 to
  12,000 (1,771 to 1,938 alive), and 3,226 over ticks 12,000 to 36,000. The budget for a time-skip is
  2,400. The default world is already near it.

### Trial 2: `plant_growth` 0.04 to 0.02

Hypothesis, written before the run. Trial 1 passes, but its default world holds about 2,000 creatures at
tick 12,000, runs at 2,928 ticks per second there, and sits in the top third of the `creatures` band
(2,291 on seed 5). The count follows the food. At half the growth rate, a plant still recovers in about
110 ticks, which is faster than a creature starves (360 ticks), so the bottleneck should stay away.
Expected: `creatures` near 1,000, `min_late` above 300, `plants` near 2,000, `max_gen` 8 or 9 (the risk:
it may fall below 8), `first_bud` near 2,000, `mean_chemo` near 0.5, `parked` 0. Expected bench: void,
with a mean near 370. If this passes with `max_gen` no worse than trial 1, it is the better default: a
lighter world with more room under the throughput floor.

Result:

```
$ gate-health --param plant_growth=0.02
seed=1 creatures=1075 min_late=649 plants=1851 births_late=908 max_gen=8 mean_chemo=0.51 parked=0.00 first_bud=2172 PASS
seed=2 creatures=944 min_late=661 plants=1647 births_late=897 max_gen=11 mean_chemo=0.52 parked=0.00 first_bud=1950 PASS
seed=3 creatures=717 min_late=532 plants=1779 births_late=548 max_gen=7 mean_chemo=0.55 parked=0.00 first_bud=2509 FAIL(max_gen=7 < 8)
gate-health 2/3 FAIL
```

Bench: void. Mean 371 alive, 10,500 ticks per second.

Verdict: **fails on `max_gen`, seed 3.** The count is where the hypothesis put it (717 to 1,075) and
there is no bottleneck. The stated risk came true: generations are too slow. `first_bud` is 1,950 to
2,509. The set of trial 1 stays the best set. The lesson from trials 1 and 2 together: the weak measure
is the length of a generation, not the number of creatures.

### Why a generation takes 2,000 ticks (arithmetic and looks, not a trial)

- A default adult pays about 0.10 energy per tick. Its mouth takes at most 0.288 per tick
  (`intake_rate` 0.04, filter 0.6, length 12) while it touches a plant.
- The starter brain keeps a creature on a plant 27% to 41% of the time (scratch census of the bench
  world at `plant_growth=0.04`). It never slows on food.
- So a default adult takes at most `0.288 * 0.35`, which is 0.10 per tick, with unlimited food. That
  equals its upkeep. The plan's arithmetic assumed a creature that eats on every tick.
- From birth to a first bud a creature must bank about 1.1 times its adult capacity (0.42 for the
  body, 0.8 for the bud threshold, less the 0.08 it is born with). With a net intake near 0 that takes
  thousands of ticks.

Looks at 4,000 ticks on seed 1, each on top of `plant_growth=0.04`. `first_bud` and `max_gen` at tick
4,000:

| Change | `first_bud` | `max_gen` | `creatures` |
|---|---|---|---|
| none | 2,080 | 3 | 962 |
| `bud_at=0.6` | 1,987 | 4 | 1,046 |
| `bud_at=0.5` | 1,806 | 4 | 1,136 |
| `build_cost=0.25` | 1,774 | 4 | 948 |
| `grow_reserve=0.2` | 1,763 | 4 | 902 |
| `grow_rate=0.003` | 2,045 | 4 | 991 |
| `child_energy=0.8` | 1,995 | 3 | 923 |
| `bud_cooldown=100` | 1,952 | 4 | 1,041 |
| `lifespan=2400` | 1,620 | 4 | 837 |
| `birth_growth=0.6` | 1,431 | 6 | 901 |
| `intake_rate=0.08` | 1,488 | 6 | 1,181 |

### Trial 3: `intake_rate` 0.04 to 0.08 (on top of `plant_growth=0.04`)

Hypothesis, written before the run. Intake is the second group in the order of suspicion, and the
arithmetic above says that a mouth at the measured contact share only pays the upkeep. At 0.08 an adult
that touches a plant 35% of the time takes up to 0.20 per tick against 0.10 of upkeep. Expected:
`first_bud` near 1,400, `max_gen` 12 or more on every seed, `creatures` between 1,500 and 2,800 (the
food supply is the same, so the count should not move far, but bodies may shrink faster), `plants` lower
than trial 1 because each mouth drains a plant twice as fast, `mean_chemo` near 0.5, `parked` 0. The
risks: `creatures` above 3,000, or plants eaten down. Expected bench: void, with a mean near 800.

Result:

```
$ gate-health --param plant_growth=0.04 --param intake_rate=0.08
seed=1 creatures=2201 min_late=1721 plants=1400 births_late=2300 max_gen=13 mean_chemo=0.60 parked=0.00 first_bud=1511 PASS
seed=2 creatures=2251 min_late=1682 plants=1186 births_late=2798 max_gen=14 mean_chemo=0.51 parked=0.00 first_bud=1341 PASS
seed=3 creatures=2114 min_late=1517 plants=1235 births_late=2288 max_gen=14 mean_chemo=0.50 parked=0.00 first_bud=1454 PASS
gate-health 3/3 PASS
```

Bench: void. Mean 803 alive, 5,900 ticks per second. Alive every 200 ticks from tick 200: 1621, 1302,
1055, 795, 633, 569, 558, 581, 654, 751, 848.

Verdict: **passes, with margin on `max_gen`** (13 to 14 against 8). Every expected number held:
`first_bud` 1,341 to 1,511, `creatures` 2,114 to 2,251, fewer plants than trial 1.

More readings of this set. None is a trial.

- Seeds 1, 2, 3 at 36,000 ticks: 3 of 3 pass. `creatures` 1,031, 759, 953. `plants` 606, 458, 573.
  `max_gen` 31, 31, 27. `mean_chemo` 0.68, 0.61, 0.66.
- Seeds 1, 2, 3 at 72,000 ticks: 3 of 3 pass, but the world is thinning. `creatures` 763, 466, 543.
  `plants` 492, 301, 371. The `plants` band starts at 300.
- Throughput of this default world, seed 1, WASM in Node: 2,478 ticks per second over ticks 10,000 to
  12,000 (2,273 to 2,201 alive), and 3,357 over ticks 12,000 to 36,000. That is at the floor of 2,400.

### Trial 4: `plant_growth` 0.04 to 0.02 (on top of `intake_rate=0.08`)

Hypothesis, written before the run. Trial 2 showed that half the plant growth gives half the creatures
and failed only on the length of a generation. Trial 3 fixed the length of a generation. Together they
should give a default world of about 1,100 creatures that runs about twice as fast as the world of
trial 3, which sits at the throughput floor. Expected: `creatures` 900 to 1,300, `min_late` above 400,
`max_gen` 10 or more on every seed, `first_bud` near 1,500, `plants` 1,200 to 1,800. The risk: slower
plants are easier to kill, so `plants` may fall further than in trial 3. Expected bench: void, with a
mean near 400.

Result:

```
$ gate-health --param plant_growth=0.02 --param intake_rate=0.08
seed=1 creatures=1477 min_late=778 plants=1682 births_late=1544 max_gen=11 mean_chemo=0.57 parked=0.00 first_bud=1527 PASS
seed=2 creatures=1373 min_late=958 plants=1471 births_late=1470 max_gen=12 mean_chemo=0.50 parked=0.00 first_bud=1483 PASS
seed=3 creatures=1148 min_late=669 plants=1504 births_late=1165 max_gen=11 mean_chemo=0.53 parked=0.00 first_bud=1638 PASS
gate-health 3/3 PASS
```

Bench: void. Mean 425 alive, 9,500 ticks per second. Alive every 200 ticks from tick 200: 1552, 1064,
525, 292, 215, 196, 212, 245, 306, 374, 461.

Verdict: **passes. This is the best set.** `creatures` is 1,148 to 1,477, a little above the expected
range. `max_gen` is 11 to 12. The stated risk did not come true at 12,000 ticks (`plants` 1,471 to
1,682), and over a longer run it went the other way: this world keeps more plants than the world of
trial 3.

More readings of this set. None is a trial.

| Reading | Trial 3 set (`plant_growth=0.04`) | Trial 4 set (`plant_growth=0.02`) |
|---|---|---|
| Seeds 4 to 10 at 12,000 ticks | not run | 7 of 7 pass. `creatures` 1,058 to 1,550, `max_gen` 10 to 12, `min_late` 700 to 1,001 |
| Seeds 1, 2, 3 at 36,000 ticks | pass. `creatures` 1,031, 759, 953. `plants` 606, 458, 573 | pass. `creatures` 1,013, 874, 780. `plants` 914, 844, 776 |
| Seeds 1, 2, 3 at 72,000 ticks | pass. `creatures` 763, 466, 543. `plants` 492, 301, 371 | pass. `creatures` 747, 817, 683. `plants` 750, 833, 701 |
| WASM ticks per second, default world, seed 1, ticks 10,000 to 12,000 | 2,478 | 4,016 |
| WASM ticks per second, default world, seed 1, ticks 12,000 to 36,000 | 3,357 | 5,017 |

### Trial 5: `plant_growth` 0.02 to 0.07 (on top of `intake_rate=0.08`). A test of the bench, not a candidate

Hypothesis, written before the run. The bench world needs a mean of 1,200 alive. It has the same 14
fertile patches as the default world, and 1,500 founders against 400. In trials 1 to 4 the default
world at tick 12,000 holds 2.5 to 3.1 times the bench mean (2,000 against 722, 912 against 371, 2,189
against 803, 1,333 against 425), because the creatures of tick 12,000 are far smaller than founders. A
look says that `plant_growth=0.06` gives a bench mean of 1,194 and `0.08` gives 1,557. So this trial
asks one question: what does the default world look like with enough food for the bench? Expected: the
bench is not void (mean near 1,350). Expected for the gate: `creatures` above 3,000 on at least one
seed, so the gate fails on the `creatures` band, and the default world runs below 2,400 ticks per
second near tick 12,000. If that is what happens, no food supply passes both gates, and the bench is a
question for the orchestrator. This set is not a candidate for the defaults whatever the result: the
set of trial 4 passes the health gate with a world that is lighter and steadier.

Result:

```
$ gate-health --param plant_growth=0.07 --param intake_rate=0.08
seed=1 creatures=3407 min_late=2464 plants=1186 births_late=4175 max_gen=13 mean_chemo=0.49 parked=0.00 first_bud=1355 FAIL(creatures=3407 > 3000)
seed=2 creatures=3731 min_late=2181 plants=1209 births_late=4314 max_gen=15 mean_chemo=0.51 parked=0.00 first_bud=1378 FAIL(creatures=3731 > 3000)
seed=3 creatures=3152 min_late=2264 plants=1056 births_late=3878 max_gen=13 mean_chemo=0.52 parked=0.00 first_bud=1349 FAIL(creatures=3152 > 3000)
gate-health 0/3 FAIL
```

Bench: not void. Mean 1,418 alive, 3,410 ticks per second. Alive every 200 ticks from tick 200: 1780,
1647, 1617, 1535, 1413, 1316, 1251, 1248, 1264, 1310, 1384.

Verdict: **as expected. The bench passes and the health gate fails on all 3 seeds**, on the upper
`creatures` band (3,152 to 3,731). The default world of this set runs at 1,381 ticks per second in WASM
over ticks 10,000 to 12,000 (seed 1, 3,697 to 3,407 alive). That is far below the floor that the bench
protects. The set is rejected.

## The tuned world against the baseline

Same command, same binary, seeds 1, 2, 3 at 12,000 ticks.

| Measure | Baseline | Tuned |
|---|---|---|
| `creatures` | 177, 234, 156 | 1,477, 1,373, 1,148 |
| `min_late` | 30, 103, 110 | 778, 958, 669 |
| `plants` | 2,179, 2,006, 1,872 | 1,682, 1,471, 1,504 |
| `births_late` | 129, 168, 134 | 1,544, 1,470, 1,165 |
| `max_gen` | 5, 7, 6 | 11, 12, 11 |
| `mean_chemo` | 0.49, 0.50, 0.58 | 0.57, 0.50, 0.53 |
| `parked` | 0.00, 0.00, 0.00 | 0.00, 0.00, 0.00 |
| `first_bud` | 1,858, 1,972, 1,992 | 1,527, 1,483, 1,638 |
| Gate | 0 of 3 | 3 of 3 |

## The bench

`make gates` exits 2 at its first step. The native bench and the WASM bench both print
`VOID: population fell` with a mean of 425 alive. The health gate, run by itself, passes.

- Bench world on the tuned defaults, alive every 200 ticks from tick 0: 1500, 1552, 1064, 525, 292,
  215, 196, 212, 245, 306, 374, 461. It does not empty. It climbs to 701 at tick 6,000 and 1,104 at
  tick 12,000, and holds 859 at tick 36,000.
- The bench world is 3 times the area of the default world with the same 14 fertile patches, because
  `fert_blobs` is a count. So it carries about what the default world carries, and it starts with
  1,500 founders against 400.
- A founder is 12 long. By tick 12,000 the mean `len` gene is near 6.6 and the mean body mass is a
  fifth of a founder's. So the food that holds 1,200 founders in the bench world holds more than 3,000
  small creatures in the default world. Trial 5 measured it: bench mean 1,418, default world 3,152 to
  3,731 creatures, health gate 0 of 3, and 1,381 ticks per second in the default world.
- Across trials 1 to 5 the default world at tick 12,000 holds 2.4 to 3.1 times the bench mean.
- Throughput of the tuned default world, WASM in Node, ticks 10,000 to 12,000: 3,992 on seed 1 (1,357
  to 1,477 alive), 4,108 on seed 2, 5,308 on seed 3. Over the skip from tick 12,000 to 36,000 on seed
  1: 5,002. These are above the floor of 2,400. They are not gate readings: the gate times the bench
  world.

Neither the bench, its void rule, nor the floor was changed. What the bench should time is a question
for the orchestrator.

## What evolves in the tuned world (scratch census, seed 1)

| Tick | Alive | Juveniles | Mean mass | Mean thrust command | `len` | `wid` | `filter` | `chemo` | Touching a plant | Births per 1,000 ticks | Juveniles starved per 1,000 ticks |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 2,000 | 525 | 53% | 50.3 | 0.72 | 11.6 | 0.49 | 0.60 | 0.51 | 44% | 224 | 48 |
| 6,000 | 780 | 52% | 37.5 | 0.64 | 10.0 | 0.47 | 0.59 | 0.54 | 34% | 328 | 126 |
| 10,000 | 1,357 | 50% | 17.9 | 0.51 | 7.2 | 0.44 | 0.56 | 0.57 | 26% | 700 | 394 |
| 12,000 | 1,477 | 50% | 14.0 | 0.45 | 6.6 | 0.41 | 0.57 | 0.57 | 22% | 772 | 454 |

The census is a scratch probe outside the repo. Its state hash equals `tidepool-headless run`.

## What is still wrong or fragile

Each line says which of the three claims it makes: the mechanism fires, evolution uses it, or it helps.

1. **Bodies shrink to the smallest size the genes allow. Evolution uses it, on 3 of 3 seeds.** The
   `len` gene mean falls from 12 to 6.4 to 7.2 by tick 12,000 and to 6.1 by tick 36,000 (floor 6).
   `wid` falls to 0.31 (floor 0.3). The count of creatures rises as the bodies shrink. The reason by
   arithmetic, not measured: a mouth takes in proportion to length, upkeep is paid in proportion to
   length times width, and nothing in M1 eats a small body. No parameter in the table changes that
   proportion. It is a rule question for M2.
2. **The gate passes because bodies shrink. It helps the gate, on these 3 seeds.** With body mutation
   off (`--param mut_rate=0`) the tuned world fails `max_gen` on 1 of 3 seeds (8, 7, 8), holds 622 to
   774 creatures, and `first_bud` is 2,137 to 2,169. With all mutation off it fails on 2 of 3 (7, 8,
   7). With only brain mutation off (`--param mut_weight_rate=0`) it passes 3 of 3 (`max_gen` 11, 11,
   12). A founder-size body reaches its first bud at about 2,150 ticks in this economy. When M2 stops the
   shrinking, expect `max_gen` to fall back to 7 or 8 until the economy is tuned again. Looks say that
   `bud_at=0.5` and `birth_growth=0.6` each shorten `first_bud` by about 15% for a body of fixed size. No
   trial tested them.
3. **More than half of the newborns starve as juveniles. The mechanism fires.** On seed 1 at tick
   12,000: 772 births and 454 juvenile deaths by starvation per 1,000 ticks. The world regulates its
   numbers by starving the young. Nobody has looked at how that feels to a player who continues as a
   descendant.
4. **A creature touches a plant 22% to 44% of the time. The mechanism fires.** The starter brain
   never slows on food. The mean thrust command falls from 0.72 to 0.45 by tick 12,000 on seed 1, so
   brain mutation or the smaller body changes it. Which of the two was not measured.
5. **`mean_chemo` did not fall. Evolution keeps it, on these seeds.** At tick 12,000 it is 0.50 to
   0.57 on seeds 1 to 3 and 0.37 to 0.53 on seeds 4 to 10. At tick 72,000 it is 0.60 to 0.63. That
   does not show that the sense helps: no run without it was made.

   *Added 2026-10-10, after the M1 audit.* The audit made that run (`m1-audit.md`, findings F2 and
   F3). With the sense switched off (`chemo_gain=0`) the mean at tick 36,000 is 0.44, 0.48, 0.39 on
   seeds 1, 2, 3, against 0.55, 0.54, 0.60 with the sense on. So the mean is higher with the sense on,
   on 3 of 3 seeds. At tick 12,000 it reads 0.47, 0.48, 0.49 with the sense off, against 0.57, 0.50,
   0.53 with it on, and the gate passes 3 of 3 both ways.
6. **The world thins over a long run. Measured, cause unknown.** Creatures: 1,148 to 1,477 at tick
   12,000, 780 to 1,013 at tick 36,000, 683 to 817 at tick 72,000. Plants: 1,471 to 1,682, then 776
   to 914, then 701 to 833. The gate still passes at 72,000 ticks. Nothing longer was run on this set.
   One guess, not measured: a patch that loses all of its plants is not seeded again, because
   `plant_seed_range` (48) is shorter than the gap between patches.

   *Added 2026-10-10, after the M1 audit.* The audit ran the same seeds with and without the sense
   (`m1-audit.md`, finding F2). With the sense switched off (`chemo_gain=0`) the creature count climbs
   from tick 12,000 to tick 36,000: 1,251, 1,048, 891, then 1,842, 1,489, 1,448. The plants fall less:
   1,952, 1,818, 1,725, then 1,510, 1,287, 1,254. With the sense on, the same seeds hold 1,013, 874,
   780 creatures and 914, 844, 776 plants at tick 36,000. So the thinning goes with scent following. The path from scent to a dead plant is the likely one and is not measured. With the
   sense on, the world levels off and does not collapse: 610, 729, 670 creatures at tick 200,000. What
   to do about it is a rule question for the owner.
7. **A richer world is a slower and a less steady world.** At `plant_growth=0.04` (trial 3) the default
   world ran at 2,478 ticks per second near tick 12,000 and held 301 to 492 plants at tick 72,000.
8. **The bands of the gate allow 3,000 creatures, and the throughput floor does not.** Trial 3 held
   2,114 to 2,251 creatures and sat at the floor. A default world between 2,300 and 3,000 creatures
   would pass the health gate and miss the time-skip budget.
9. **Short looks were wrong twice.** The look at tick 3,000 read 930 creatures for trial 1 and the
   trial read about 2,000. I expected slower plants to be easier to kill, and over 72,000 ticks the
   slower plants kept more of themselves.

## Not tried

7 trials are left. Nothing in this list was needed for the gate.

- `bite_fraction`. Arithmetic and looks say a bite near half of `plant_growth` crops a plant where a
  larger bite kills it. At 0.05 against 0.02 a grazer still drains its plant.
- The reproduction group (`bud_at`, `child_energy`, `bud_cooldown`) and the growth numbers
  (`birth_growth`, `build_cost`, `grow_reserve`, `grow_rate`).
- The scent numbers and `chemo_gain`. A look in the bench world says that a higher `chemo_gain` loses
  more founders (mean thrust rises), which is against the guess in the Task 15 report.
- `fert_blobs`, `fert_radius`, `plant_cell_cap`, `plant_seed_range`.
