# M4 Task 9 — Ports, starter wiring, hunter founders: the new baseline

**Date:** 2026-10-16. Task 9 (`9c6aece`, rules P1 to P4) ends the switch-on rule on purpose: every
body declares two hurt inputs and the triggers its parts give, each eye cone reads the jaw of the
nearest body it sees, founders carry trigger wires at weight 0, and the add-part mutation draws from
all ten kinds. The default world's rows change from here. The readings below are at `58805cb`
(Task 9, Task 14, and the fix that makes a toxin drain count as a hit), by the orchestrator, load 35
to 40 for the rows (an LLM server and an emulator ran beside them; the rows are deterministic) and
5 to 9 for the bench.

## What changed in a founder

| | Before (M3) | After (Task 9) |
|---|---|---|
| Inputs, founder with an eye | 13 | 17 (two hurt, one jaw per cone) |
| Outputs | 3 | 4 (`dash`); a hunter founder 5 (`lunge`) |
| Connections | 60 | 65 (the trigger wires at weight 0); a hunter 69 |
| Neurons | 20 | 25 |
| Founder without an eye: inputs, connections | 9, 42 | 11, 43 |

History ids: the trigger wires take 71 to 79, `FOUNDER_JAW_HISTORY` is 70, `FOUNDER_HISTORIES` goes
from 69 to 79, and `next_history` starts at 80. Every founder pays `conn_upkeep` for 5 more
connections per tick.

## The baseline rows, `gate-health` and `gate-evolve` at 36,000 ticks

```
seed=1 creatures=1386 min_late=1294 plants=2229 births_late=2471 max_gen=15 mean_chemo=0.47 parked=0.00 first_bud=789 juv_starved=0.54 to_bud=0.31 PASS
seed=2 creatures=1272 min_late=1190 plants=2076 births_late=2159 max_gen=14 mean_chemo=0.50 parked=0.00 first_bud=810 juv_starved=0.55 to_bud=0.31 PASS
seed=3 creatures=1323 min_late=1215 plants=1965 births_late=2538 max_gen=20 mean_chemo=0.46 parked=0.00 first_bud=732 juv_starved=0.56 to_bud=0.31 PASS
gate-health 3/3 PASS
seed=1 creatures=1652 creatures_noscent=1763 creatures_noeye=1647 len=9.8 len_sd=1.59 parts=7.5 chemo=0.37 chemo_blind=0.15 eye=0.25 eye_blind=0.07 plans=2 speed_cv=0.24 speed=0.97 area=37.1 hidden=3.75 conns=60.3 shapes=0 shapes_raw=0 variety=48.2 variety_wired=19.9 PASS
seed=2 creatures=1517 creatures_noscent=1436 creatures_noeye=1510 len=9.3 len_sd=1.85 parts=7.2 chemo=0.44 chemo_blind=0.19 eye=0.27 eye_blind=0.08 plans=4 speed_cv=0.24 speed=0.99 area=36.9 hidden=4.23 conns=67.3 shapes=3 shapes_raw=0 variety=37.6 variety_wired=17.5 PASS
seed=3 creatures=1516 creatures_noscent=1451 creatures_noeye=1523 len=9.5 len_sd=1.67 parts=8.1 chemo=0.34 chemo_blind=0.14 eye=0.28 eye_blind=0.13 plans=2 speed_cv=0.25 speed=0.96 area=36.4 hidden=4.42 conns=65.3 shapes=2 shapes_raw=1 variety=41.8 variety_wired=20.4 PASS
gate-evolve 3/3 PASS
```

Against the M3 exit rows (`m3-exit.md`): `gate-health` holds 1,272 to 1,386 bodies against 1,213 to
1,458, `first_bud` 732 to 810 against 763 to 793, `mean_chemo` 0.46 to 0.50 against 0.46 to 0.48.
`gate-evolve` holds 1,516 to 1,652 against 1,341 to 1,633, `len` 9.3 to 9.8 against 9.4 to 10.3,
`conns` 60 to 67 against 58 to 62 (the five founder wires), `hidden` 3.8 to 4.4 against 4.1 to 4.4.
Every band passes. `shapes` reads 0 on seed 1: no shape is held by 5% of the living, which is why
`shapes` was replaced by `variety` (`variety_wired` 17.5 to 20.4).

## The senses hold: ten seeds

`gate-evolve --seeds 1,2,3,4,5,6,7,8,9,10`, 36,000 ticks. The plan stops the build under 9 of 10.

```
seed=1 creatures=1652 creatures_noscent=1763 creatures_noeye=1647 len=9.8 len_sd=1.59 parts=7.5 chemo=0.37 chemo_blind=0.15 eye=0.25 eye_blind=0.07 plans=2 speed_cv=0.24 speed=0.97 area=37.1 hidden=3.75 conns=60.3 shapes=0 shapes_raw=0 variety=48.2 variety_wired=19.9 PASS
seed=2 creatures=1517 creatures_noscent=1436 creatures_noeye=1510 len=9.3 len_sd=1.85 parts=7.2 chemo=0.44 chemo_blind=0.19 eye=0.27 eye_blind=0.08 plans=4 speed_cv=0.24 speed=0.99 area=36.9 hidden=4.23 conns=67.3 shapes=3 shapes_raw=0 variety=37.6 variety_wired=17.5 PASS
seed=3 creatures=1516 creatures_noscent=1451 creatures_noeye=1523 len=9.5 len_sd=1.67 parts=8.1 chemo=0.34 chemo_blind=0.14 eye=0.28 eye_blind=0.13 plans=2 speed_cv=0.25 speed=0.96 area=36.4 hidden=4.42 conns=65.3 shapes=2 shapes_raw=1 variety=41.8 variety_wired=20.4 PASS
seed=4 creatures=1293 creatures_noscent=1275 creatures_noeye=1387 len=10.5 len_sd=1.55 parts=7.3 chemo=0.38 chemo_blind=0.13 eye=0.23 eye_blind=0.11 plans=4 speed_cv=0.25 speed=1.02 area=48.0 hidden=4.12 conns=63.1 shapes=3 shapes_raw=2 variety=31.3 variety_wired=16.2 PASS
seed=5 creatures=1638 creatures_noscent=1655 creatures_noeye=1699 len=9.9 len_sd=1.58 parts=8.2 chemo=0.37 chemo_blind=0.15 eye=0.24 eye_blind=0.10 plans=4 speed_cv=0.25 speed=0.98 area=40.9 hidden=4.23 conns=65.2 shapes=3 shapes_raw=0 variety=37.0 variety_wired=16.7 PASS
seed=6 creatures=1432 creatures_noscent=1392 creatures_noeye=1392 len=10.1 len_sd=1.44 parts=7.3 chemo=0.36 chemo_blind=0.16 eye=0.25 eye_blind=0.11 plans=3 speed_cv=0.26 speed=0.93 area=38.6 hidden=4.06 conns=64.6 shapes=2 shapes_raw=0 variety=37.5 variety_wired=17.4 PASS
seed=7 creatures=1556 creatures_noscent=1581 creatures_noeye=1569 len=9.9 len_sd=1.45 parts=7.5 chemo=0.37 chemo_blind=0.15 eye=0.24 eye_blind=0.08 plans=3 speed_cv=0.24 speed=0.98 area=39.1 hidden=4.23 conns=65.9 shapes=3 shapes_raw=1 variety=38.0 variety_wired=22.9 PASS
seed=8 creatures=1534 creatures_noscent=1515 creatures_noeye=1521 len=9.9 len_sd=1.61 parts=7.7 chemo=0.34 chemo_blind=0.16 eye=0.24 eye_blind=0.07 plans=5 speed_cv=0.23 speed=0.96 area=34.9 hidden=4.09 conns=64.5 shapes=1 shapes_raw=1 variety=47.7 variety_wired=25.1 PASS
seed=9 creatures=1526 creatures_noscent=1405 creatures_noeye=1582 len=10.1 len_sd=1.41 parts=8.1 chemo=0.37 chemo_blind=0.12 eye=0.23 eye_blind=0.08 plans=2 speed_cv=0.25 speed=0.98 area=42.3 hidden=4.26 conns=66.2 shapes=1 shapes_raw=1 variety=37.1 variety_wired=20.0 PASS
seed=10 creatures=1453 creatures_noscent=1387 creatures_noeye=1477 len=10.1 len_sd=1.59 parts=7.2 chemo=0.34 chemo_blind=0.21 eye=0.22 eye_blind=0.05 plans=4 speed_cv=0.24 speed=0.99 area=43.2 hidden=4.51 conns=66.7 shapes=5 shapes_raw=2 variety=32.3 variety_wired=18.3 PASS
gate-evolve 10/10 PASS
gate-evolve 10 exit 0
```

**10 of 10.** The scent gap reads 0.13 to 0.25 (M3's long gate read 0.14 to 0.26 at 144,000) and the
eye gap 0.11 to 0.18 (M3: 0.19 to 0.31 at 144,000, 0.14 to 0.18 at 36,000). No seed is near a band.
A hidden neuron count of 3.8 to 4.5 and 60 to 67 connections on every seed.

## Throughput, an A/B against the fixed pre-Task-9 head

Interleaved, three rounds, A = `7b8c74f`, B = `58805cb`, load 5 to 9. B settles to 1,428 bodies
against A's 1,394: the world itself changed, so the per-creature-tick column is the one to read.

| Round | A native | B native | A WASM | B WASM |
|---|---|---|---|---|
| 1 | 2,847 | 2,639 | 2,638 | 2,591 |
| 2 | 2,812 | 2,405 | 2,500 | 2,542 |
| 3 | 2,704 | 2,496 | 2,729 | 2,591 |
| Median | 2,812 | 2,496 | 2,638 | 2,591 |
| ns per creature-tick | 255 | 281 | 272 | 270 |

- **WASM, the gate's measure:** −1.8% in ticks per second with 2.4% more bodies, equal per
  creature-tick. Under the 5% line.
- **Native:** −11% in ticks per second, +10% per creature-tick. Native and WASM disagree by more
  than the noise of three rounds. Each founder thinks with 17 inputs and 65 connections against 13
  and 60, the eye scan keeps the nearest body of each cone, and `sense::step` writes two more
  inputs. Which of these the native build pays for and the WASM build does not is not known. The
  bench the plan judges is WASM; the native reading is a flag for the retune (Task 12 part 2 reads
  `make gates` again).
- WASM at B, 2,591 at 1,428 bodies, sits under M3's target of 2,600 and over the floor of 2,400,
  on a loaded machine. The retune's target 2 reads it again on a quiet one.

## Departures from P1 to P4, as built, accepted

1. `IN_HURT` is `hurt / capacity * hurt_gain`, held in 0 to 1, not `hurt * hurt_gain`: the
   parameter's row says "a loss of a tenth of capacity reads 1", and only this form matches it. The
   literal form saturates at 0.1 energy, and one bite takes 3.
2. `IN_HURT_SIDE` reads 0 when no energy was lost, so a bite a shell fully blocks shows no side.
   The stored `hurt_side` stays, for the frame's flash.
3. P4's output wires make two draws each (a source, a weight) and no target draw. S2's input wires
   make three.
4. The hunter's chase wires and every founder's flee wires exist only with `founder_eye` above 0,
   as M3's eye wires do.
5. A toxin drain did not count as a hit (the clouds are Task 5 code): fixed at `58805cb`, with the
   side of the cloud's centre in the body's frame and a test.

## Open, for the owner or the retune

- **Neuron budget gap.** 35 inputs + 6 outputs + `MAX_HIDDEN` 64 = 105, over `MAX_NEURONS` 96 (M3's
  worst case was 92). `Block::of` drops the hidden genes past the room, and they cost no upkeep. A
  body with two eyes, a chemoreceptor, and three triggers can hold 55 hidden neurons, not 64. The
  budgets are unchanged; raising one is the owner's.
- `shapes` reads 0 on a passing seed. It has no band and is printed for the record.
