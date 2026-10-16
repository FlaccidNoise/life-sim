# M4 Task 1 — How often bodies meet, at the M3 head

**Date:** 2026-10-15. **Head:** `30fe272` (the M3 exit rules, unchanged since `cac3ded`).
**Command:** `target/release/tidepool-headless probe-encounter --seeds 1,2,3 --ticks 36000 --every 4000 --arc 0.6`.
Load 4.9 at the start, 3.6 at the end, 43 seconds. Exit 0. No rule was changed and nothing was tuned.

The probe is `probes.rs` `encounter_probe`. It reads the world before each tick with the motor's own
overlap test and radii, checks that reading against `motor.touch` on every tick, and panics if they
disagree. The state hash after a run equals a plain run (test
`the_probe_draws_nothing_and_leaves_the_rows_of_the_gates`). A cone has half angle 0.6 radians,
the Start value of `jaw_arc`.

## Rows at tick 12,000 and tick 36,000

| Seed | Tick | Bodies | `nearest` | `reach` | `touching` | `facing` | `facing_adult` | `contact_ticks` | `kin_share` |
|---|---|---|---|---|---|---|---|---|---|
| 1 | 12,000 | 1,457 | 8.6 | 7.7 | 0.387 | 0.225 | 0.157 | 6 | 0.08 |
| 2 | 12,000 | 1,306 | 8.8 | 7.6 | 0.363 | 0.178 | 0.117 | 6 | 0.06 |
| 3 | 12,000 | 1,213 | 9.1 | 8.0 | 0.359 | 0.182 | 0.121 | 6 | 0.08 |
| 1 | 36,000 | 1,634 | 8.0 | 6.2 | 0.277 | 0.128 | 0.086 | 6 | 0.08 |
| 2 | 36,000 | 1,518 | 8.6 | 5.9 | 0.242 | 0.111 | 0.078 | 6 | 0.06 |
| 3 | 36,000 | 1,342 | 8.7 | 6.6 | 0.258 | 0.118 | 0.077 | 6 | 0.07 |

Every row from tick 4,000 to 36,000:

```
seed=1 tick=4000 creatures=1296 nearest=9.1 reach=8.1 touching=0.406 facing=0.233 facing_adult=0.177 contact_ticks=7 kin_share=0.04
seed=1 tick=8000 creatures=1371 nearest=8.9 reach=7.9 touching=0.396 facing=0.219 facing_adult=0.145 contact_ticks=6 kin_share=0.04
seed=1 tick=12000 creatures=1457 nearest=8.6 reach=7.7 touching=0.387 facing=0.225 facing_adult=0.157 contact_ticks=6 kin_share=0.08
seed=1 tick=16000 creatures=1421 nearest=9.1 reach=7.5 touching=0.299 facing=0.151 facing_adult=0.108 contact_ticks=6 kin_share=0.07
seed=1 tick=20000 creatures=1471 nearest=8.7 reach=7.0 touching=0.318 facing=0.139 facing_adult=0.098 contact_ticks=6 kin_share=0.11
seed=1 tick=24000 creatures=1511 nearest=8.6 reach=6.8 touching=0.300 facing=0.149 facing_adult=0.101 contact_ticks=6 kin_share=0.08
seed=1 tick=28000 creatures=1519 nearest=8.4 reach=6.6 touching=0.284 facing=0.136 facing_adult=0.095 contact_ticks=6 kin_share=0.04
seed=1 tick=32000 creatures=1603 nearest=8.4 reach=6.4 touching=0.276 facing=0.127 facing_adult=0.089 contact_ticks=6 kin_share=0.09
seed=1 tick=36000 creatures=1634 nearest=8.0 reach=6.2 touching=0.277 facing=0.128 facing_adult=0.086 contact_ticks=6 kin_share=0.08
seed=2 tick=4000 creatures=1233 nearest=8.9 reach=8.2 touching=0.448 facing=0.273 facing_adult=0.198 contact_ticks=7 kin_share=0.04
seed=2 tick=8000 creatures=1244 nearest=9.2 reach=7.9 touching=0.350 facing=0.190 facing_adult=0.140 contact_ticks=6 kin_share=0.06
seed=2 tick=12000 creatures=1306 nearest=8.8 reach=7.6 touching=0.363 facing=0.178 facing_adult=0.117 contact_ticks=6 kin_share=0.06
seed=2 tick=16000 creatures=1318 nearest=8.7 reach=7.2 touching=0.334 facing=0.182 facing_adult=0.139 contact_ticks=6 kin_share=0.10
seed=2 tick=20000 creatures=1393 nearest=8.5 reach=6.8 touching=0.317 facing=0.155 facing_adult=0.107 contact_ticks=6 kin_share=0.05
seed=2 tick=24000 creatures=1445 nearest=8.2 reach=6.4 touching=0.256 facing=0.136 facing_adult=0.102 contact_ticks=6 kin_share=0.07
seed=2 tick=28000 creatures=1619 nearest=7.9 reach=5.9 touching=0.261 facing=0.130 facing_adult=0.083 contact_ticks=6 kin_share=0.06
seed=2 tick=32000 creatures=1468 nearest=8.1 reach=5.8 touching=0.247 facing=0.114 facing_adult=0.076 contact_ticks=6 kin_share=0.08
seed=2 tick=36000 creatures=1518 nearest=8.6 reach=5.9 touching=0.242 facing=0.111 facing_adult=0.078 contact_ticks=6 kin_share=0.06
seed=3 tick=4000 creatures=1150 nearest=9.1 reach=8.2 touching=0.424 facing=0.241 facing_adult=0.174 contact_ticks=7 kin_share=0.04
seed=3 tick=8000 creatures=1166 nearest=9.2 reach=8.1 touching=0.380 facing=0.202 facing_adult=0.142 contact_ticks=7 kin_share=0.02
seed=3 tick=12000 creatures=1213 nearest=9.1 reach=8.0 touching=0.359 facing=0.182 facing_adult=0.121 contact_ticks=6 kin_share=0.08
seed=3 tick=16000 creatures=1284 nearest=8.9 reach=7.8 touching=0.362 facing=0.183 facing_adult=0.137 contact_ticks=6 kin_share=0.08
seed=3 tick=20000 creatures=1278 nearest=9.0 reach=7.6 touching=0.340 facing=0.170 facing_adult=0.117 contact_ticks=6 kin_share=0.06
seed=3 tick=24000 creatures=1344 nearest=8.5 reach=7.3 touching=0.360 facing=0.185 facing_adult=0.126 contact_ticks=6 kin_share=0.07
seed=3 tick=28000 creatures=1329 nearest=8.6 reach=6.9 touching=0.305 facing=0.154 facing_adult=0.103 contact_ticks=6 kin_share=0.09
seed=3 tick=32000 creatures=1381 nearest=8.5 reach=6.6 touching=0.290 facing=0.141 facing_adult=0.098 contact_ticks=6 kin_share=0.06
seed=3 tick=36000 creatures=1342 nearest=8.7 reach=6.6 touching=0.258 facing=0.118 facing_adult=0.077 contact_ticks=6 kin_share=0.07
```

## Against the arithmetic of the plan

The plan ("How predation gets past the draft's encounter failure") estimated a nearest distance of
9.7 against a reach of about 7, a ratio of 1.4, from one seed of the M1 world. The draft's ratio was
about 5.

| | Plan's estimate | Tick 12,000, 3 seeds | Tick 36,000, 3 seeds |
|---|---|---|---|
| `nearest` | 9.7 | 8.6 to 9.1 | 8.0 to 8.7 |
| `reach` | about 7 | 7.6 to 8.0 | 5.9 to 6.6 |
| ratio | 1.4 | 1.1 to 1.2 | 1.3 to 1.5 |

- The world is as close as the plan said, or closer. The median body is about one reach from its
  nearest neighbour.
- `reach` falls from 8 to 6 between tick 12,000 and 36,000 while `nearest` holds near 8.5: the bodies
  get smaller (`len` 12 at founding to about 10, `m3-exit.md`), not sparser. With it `touching` falls
  from 0.36 to 0.39 down to 0.24 to 0.28 and `facing` from 0.18 to 0.23 down to 0.11 to 0.13. A
  world that is older is a world with fewer contacts, by about 40%. At tick 144,000 `len` and `area`
  read as at 36,000 (`m3-exit.md`), so the 36,000 rows are the ones to plan on.
- A frontal contact is not rare. At tick 36,000, 11% to 13% of the living have another body in their
  nose cone, and 8% to 9% have a full-grown one. 30% to 40% of frontal contacts are with a juvenile.
- `contact_ticks` reads 6 on every row past tick 8,000: half of the contacts that end last 6 ticks or
  fewer.
- `kin_share` reads 0.02 to 0.11: nine frontal contacts in ten are not parent and child.

## What the rows say about rule J1 at its Start values

A reading, not a tuning. Rule J1 at Start: a reference hunter (mouth 12, jaw 0.5, `bite_rate` 0.5)
bites 3 per tick, 6 during a lunge (`lunge_bite` 2 for `lunge_ticks` 10). A full-grown reference body
at half a store holds 36, a juvenile at `egg` 0.7 about 18.

- **Energy a median contact moves.** 6 ticks times 3 is 18: half an adult's half store, or all of a
  juvenile's. With a lunge, 6 ticks times 6 is 36: an adult's half store. So at Start a median contact
  kills a juvenile outright and an adult only with a lunge or a longer hold. The upper half of
  contacts holds longer, and a bitten body that does not dash stays in reach.
- **The ceiling that contacts set on kills.** Take seed 1 at tick 36,000: 1,634 bodies, `facing`
  0.128, so about 209 bodies have another in their cone on any tick. With `founder_jaw` 0.2, about a
  fifth of them are hunters: about 42 hunters in a frontal contact per tick. A contact lasts about 6
  ticks, so about 7 fresh hunter contacts begin per tick, about 7,000 per 1,000 ticks. If each moved
  18 and a kill costs 36, the contacts alone would allow about 3,500 kills per 1,000 ticks, against
  about 1,000 to 1,250 births per 1,000 ticks (`births_late` 2,034 to 2,498 per 2,000 ticks,
  `m3-exit.md`). The same arithmetic on seeds 2 and 3 gives about 2,800 and 2,600.
- **So contacts are not the limit.** The ceiling is above what the population can supply. Rule J1's
  rate will be set by its economy: `bite_mass_ratio` (a founder hunter is 1.15 times a founder, so at
  Start it bites juveniles and small adults only), `room` (a full hunter does not bite), the guards,
  and whether the starter chase wires hold a body in the cone. The draft's encounter failure (C1,
  nearest 73 to 86 against a bite range of 16) does not apply here. Density is not the first suspect
  if kills are few: the bite economy and the brain are.
- **What the rows do not say.** How long a contact lasts when one body pursues: every contact read
  here is between grazers that do not chase. Whether a bitten body dashes out of reach. How often the
  mass ratio permits a bite: the probe reads growth, not mass. Task 11's `probe-hunt` reads those
  with jaws on.
