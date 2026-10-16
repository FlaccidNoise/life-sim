# M4 retune — Diet: rows

The plan is `../plans/2026-10-16-m4-retune-diet.md`. Every trial's hypothesis is committed here
before its run. One run at a time. Each run's script, with every `--param` written out, is quoted
with its rows.

## Built

- Task 1, rule E1 (`e20fa9f`): the eye's jaw input is times `eye_gain`.
- Task 5 (`c83a428`): the benches gate on nanoseconds per creature-tick, at most 278.
- Task 2, rule D1 (`fcb7b4d`, `5e3db1a`): the `diet` gene, `diet_k` 0 by default. Format 11, ABI 9.
- Task 3 (`b4ffc91`): `probe-diet`. Task 4 (`f6987c8`, `c5a3c67`): the page names the diet.

## Baseline: the head with every task built, `diet_k` 0 (`c5a3c67`, load 8 to 86)

The saved worlds rebaked at format 11: `m2-world.tdpl` tick 36,000, 1,429 bodies, hash `c9b38237`;
`m2-world-long.tdpl` tick 144,000, 711 bodies, hash `8fb60205`.

| Gate | Result |
|---|---|
| `gate-health` (12,000, seeds 1 to 3) | 3 of 3 |
| `gate-evolve` (36,000, seeds 1 to 3) | 0 of 3: the eye gap 0.025, −0.038, 0.086 |
| long gate (144,000, seeds 1, 4, 5, 6, 8, `--brain --predation`) | 1 of 5: the eye gap 0.070, 0.057, 0.098, pass, −0.014 |

`probe-diet` at 144,000 (`--every 24000`): the jaw share `hunt` is 0.989, 0.939, 0.999, 0.553, 1.000.
The takeover stands. At `diet_k` 0 the gene is neutral, so its shares are drift.

### What moved the eye gap: E1 and the gene's draw, separated

`gate-evolve` at 36,000 on the same head with E1 reverted (a temporary worktree):

| Seeds 1, 2, 3 | eye | eye_blind | gap |
|---|---|---|---|
| M4 exit (`5344ada`) | 0.17, 0.18, 0.14 | about 0.03 | 3 of 3 pass |
| Head, E1 reverted | 0.13, 0.09, 0.18 | 0.04, 0.04, 0.03 | 0.094, 0.047, 0.15: 1 of 3 |
| Head with E1 | 0.13, 0.09, 0.18 | 0.11, 0.12, 0.10 | 0.025, −0.038, 0.086: 0 of 3 |

- The gene's draw changed the path of every world: the sighted arm of seed 2 fell from 0.18 to
  0.09. That is the path, as the M4 notes say of this gap.
- E1 raised the blind arm from about 0.04 to 0.11. With the teeth input, evolution removed blind
  eyes below the level they drift to when they carry nothing. So the old gap measured in part
  selection against a blind eye that saw teeth, not selection for sight. With E1 the blind arm is
  the neutral level of an eye, and the sighted arm is at most 0.08 over it at 36,000.
- The band (0.1) is the owner's. This is a finding for the exit, not a trial: target 3 yields to
  target 1 by the plan's order.

## T1: `diet_k` 1.5, the start founders — hypothesis before the run

Change: `--param diet_k=1.5`. Founders: no jaw at `diet` 0, the `founder_jaw` share at 0.8 (bite
72%, Filter 9%).

Expected: a jaw on a body near `diet` 0 takes nothing, so it is mass for nothing and the jaw share
falls toward the carnivore share. The founder hunters either hold a guild or die in the founding
valley the draft knew. I expect them to hold: at 12,000 herbivores 0.6 or more and carnivores 0.05
to 0.2; at 144,000 carnivores 0.10 or more on at least 3 of 5 seeds, `diet_sd` 0.20 or more. If
carnivores fall under 0.02 on most seeds, the next trial is rule 2 (`founder_hunter_diet` 0.6). If
they take over (herbivores under 0.10), rule 3.

Read: `probe-diet` 12,000 on seeds 1 to 3, then 144,000 on seeds 1, 4, 5, 6, 8. The gates follow
only if target 1 is met.

### T1 rows (`c4ed5f5`, load 18 to 89)

| Seed | tick | herb | omni | carn | diet_sd | hunt | kills since last row |
|---|---|---|---|---|---|---|---|
| 1, 2, 3 | 3,000 | 1.000 | 0.000 | 0.000 | 0.04 | 0.053, 0.020, 0.004 | 4, 21, 7 |
| 1, 2, 3 | 12,000 | 0.999 | 0.001 | 0.000 | 0.05 to 0.06 | 0.211, 0.141, 0.034 | 6, 1, 0 |
| 1 | 144,000 | 0.996 | 0.004 | 0.000 | 0.07 | 0.746 | 67 |
| 4 | 144,000 | 0.999 | 0.001 | 0.000 | 0.06 | 0.782 | 92 |
| 5 | 144,000 | 0.997 | 0.003 | 0.000 | 0.07 | 0.684 | 89 |
| 6 | 144,000 | 0.997 | 0.003 | 0.000 | 0.07 | 0.956 | 117 |
| 8 | 144,000 | 0.992 | 0.008 | 0.000 | 0.07 | 0.084 | 2 |

**Falsified, in the other direction.** The founder hunters are gone before tick 3,000 on every
seed and no carnivore comes back: herbivores are 0.99 or more at every sample to 144,000, mean
`diet` 0.05 to 0.08. What T1 shows:

- The jaw takeover is over: kills fall from 2,026 to 8,144 per 24,000 ticks at baseline to 0 to
  200. But jaws still spread on herbivores (`herb_jaw` up to 0.956 on seed 6), where a bite takes
  `0.06^1.5`, about 1.5% of a full bite. Not explained yet: the lunge the jaw gives, or drift.
- Near `diet` 0 a step toward flesh costs plant intake at once (about `1.5·d`) and gains almost no
  meat (`d^1.5`), so no herbivore lineage climbs. Carnivory has to come from the founders.
- A crossover passes `diet` and the jaw separately, so a hunter's mate can bud a high-diet body
  with no jaw, which starves at 9% filter.

## T2: `founder_hunter_diet` 0.6 — hypothesis before the run

Rule 2: for carnivores dying out, the founding first. Change: `--param diet_k=1.5 --param
founder_hunter_diet=0.6`. A founder hunter filters 25% and bites 46%: an omnivore that does not
starve while it learns to hunt.

Expected: the founder hunters survive the founding on most seeds, as an omnivore guild of 0.05 to
0.15 at 12,000. By 144,000 one of two things: the guild is pulled to flesh (carn 0.10 or more on 3
of 5 seeds) or back to plants (carn under 0.02). I expect the second on most seeds, by the same
missing gradient as T1, but slower. If so, T3 is `founder_jaw` up (rule 2's next lever).
