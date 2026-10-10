# M1 density: spacing against interaction range

Date: 2026-10-10. Task 16 of `docs/plans/2026-10-10-m0-m1-first-swim.md`.

**The rule holds.** The median distance from a creature to its nearest plant is 1.0 to 1.8 of its own
body lengths, under the limit of about 3 (`design.md` §7.3). It held before the tuning as well, so the
fertility parameters did not need to change for spacing.

## Method

`tidepool-headless probe-density [--seed 1] [--ticks 12000] [--param name=value]...` runs the default
world (1536 by 1024, 400 founder creatures, 1,200 founder plants) and prints one row at a quarter, a
half, and the end of the run.

| Column | Meaning |
|---|---|
| `nearest_creature` | Median distance from a creature to its nearest creature, centre to centre, in world units |
| `nearest_plant` | Median distance from a creature to its nearest plant, in world units |
| `nearest_plant_lengths` | The same distance divided by the length of the creature that looks, then the median |
| `near_plant` | Share of creatures within 2 of their own body lengths of a plant |
| `per_cell` | Creatures divided by the number of 32-unit cells that hold at least one |

## Seed 1, the arithmetic defaults (before the tuning)

| Tick | Creatures | Plants | `nearest_creature` | `nearest_plant` | `nearest_plant_lengths` | `near_plant` | `per_cell` |
|---|---|---|---|---|---|---|---|
| 3,000 | 11 | 2,181 | 29.4 | 11.8 | 1.27 | 0.91 | 1.38 |
| 6,000 | 30 | 2,221 | 16.2 | 7.5 | 0.77 | 0.83 | 1.43 |
| 12,000 | 177 | 2,179 | 26.7 | 9.2 | 0.98 | 0.84 | 1.16 |

## Seed 1, the tuned defaults (`plant_growth` 0.02, `intake_rate` 0.08)

| Tick | Creatures | Plants | `nearest_creature` | `nearest_plant` | `nearest_plant_lengths` | `near_plant` | `per_cell` |
|---|---|---|---|---|---|---|---|
| 3,000 | 608 | 2,027 | 15.1 | 9.9 | 1.04 | 0.87 | 1.57 |
| 6,000 | 780 | 1,984 | 13.2 | 9.3 | 1.11 | 0.83 | 1.67 |
| 12,000 | 1,477 | 1,682 | 9.7 | 10.0 | 1.79 | 0.57 | 2.36 |

## What the tables show

- The distance to the nearest plant stays near 10 world units from tick 3,000 to tick 12,000.
- In body lengths it grows from 1.04 to 1.79, and the share near a plant falls from 0.87 to 0.57. The
  plants did not move away. The bodies got shorter: the mean `len` gene on seed 1 falls from 11.6 at
  tick 2,000 to 6.6 at tick 12,000 (`m1-tuning.md`). The limit of 3 body lengths is 18 units for a
  body at the floor of the `len` range, and 10 is still under it.
- Creatures are closer to each other than to food at tick 12,000 (9.7 against 10.0). A default founder
  is 12 long, so the median creature has a neighbour within one founder length. Contact between
  creatures will be common when predation arrives.
- The settled density of the default world is 730 to 939 creatures per million square units at tick
  12,000 (1,148 to 1,477 creatures on seeds 1, 2, 3 in 1.573 million square units). At tick 36,000 it
  is 496 to 644. The founders are 254 per million.

## Limits

- One seed. The plan asks for seed 1 only.
- The probe measures centre to centre. A creature touches a plant from farther than that: its own
  radius plus the radius of the plant.
- The probe says where creatures are, not what they eat. The share that touches a plant on a given
  tick was 22% to 44% in a scratch census of this world. That census is not part of the repo.
