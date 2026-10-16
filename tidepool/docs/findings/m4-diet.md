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

### T2 rows (`92ad002`)

| Seed | tick | herb | omni | carn | diet_mean | hunt | kills since last row |
|---|---|---|---|---|---|---|---|
| 1, 2, 3 | 3,000 | 1.000 | 0.000 | 0.000 | 0.03 | 0.011, 0.056, 0.092 | 7, 17, 6 |
| 1, 2, 3 | 12,000 | 0.998 to 1.000 | 0.000 to 0.002 | 0.000 | 0.05 | 0.167, 0.277, 0.323 | 1, 7, 2 |
| 1 | 144,000 | 0.929 | 0.071 | 0.000 | 0.10 | 0.841 | 3,838 |
| 4 | 144,000 | 0.997 | 0.003 | 0.000 | 0.07 | 0.199 | 8 |
| 5 | 144,000 | 0.941 | 0.059 | 0.000 | 0.12 | 0.914 | 5,118 |
| 6 | 144,000 | 0.993 | 0.007 | 0.000 | 0.06 | 0.309 | 12 |
| 8 | 144,000 | 0.998 | 0.002 | 0.000 | 0.06 | 0.688 | 122 |

**Falsified.** The founder hunters at 0.6 are gone before tick 3,000 too. New: on seeds 1 and 5 an
omnivore minority climbs out of the herbivores late (0.06 to 0.07, kills 3,838 and 5,118 in the
last 24,000 ticks). A climb exists, slowly, where the founding fails.

**Why the founders vanish, from the code:** `mix::cross` takes the donor's `diet` with chance
`mix_swap` (0.5) and a part only the donor holds with chance `mix_foreign` (0.25). Founder brains
accept every mate. With herbivores four in five, a hunter's brood mostly takes a herbivore's diet
and keeps a useless jaw, or a herbivore's brood takes a hunter's diet without its jaw. Gene flow
from the majority dissolves the hunter type before selection can act on it.

## T3: `mix_rate` 0, a diagnostic — hypothesis before the run

Change from T2: `--param mix_rate=0`. Not a shippable value: mixing is the owner's M3 feature. It
tests the cause above. Expected: the founder hunters hold past 3,000 and at 12,000 (omnivores plus
carnivores 0.05 or more on seeds 1 to 3). If they do, gene flow is the cause, and the fix is a rule:
bodies of far-apart diets do not mix, as species do not. If they still vanish, the cause is the
hunt's economy, and the next lever is the payoff (rule 2: `bite_rate`, then `bite_mass_ratio`).

### T3 rows (`6425c36`)

| Seed | tick | herb | omni | carn | hunt | kills since last row |
|---|---|---|---|---|---|---|
| 1, 2, 3 | 3,000 | 0.999 to 1.000 | 0.000 to 0.001 | 0.000 | 0.003, 0.002, 0.027 | 8, 9, 5 |
| 1, 2, 3 | 12,000 | 0.997 to 1.000 | 0.000 to 0.003 | 0.000 | 0.030, 0.001, 0.010 | 0 |
| 1, 4, 5, 6, 8 | 144,000 | 0.980 to 0.998 | 0.002 to 0.020 | 0.000 | 0.08 to 0.53 | 9 to 896 |

**Falsified: gene flow is not the cause.** With no mixing the founder hunters still vanish before
tick 3,000. A reading of the T2 world every 250 ticks (seed 1, not a trial): hunters are 0.120 of
the living at tick 250, 0.029 at 500, 0.012 at 1,000, with 3 kills in the first 500 ticks. They
starve in a few hundred ticks. At `bite_mass_ratio` 3.0 a founder hunter, about 1.15 times a
founder's mass, can bite juveniles only, and on a Filter of 25% that does not feed it.

The ratio of 3.0 was the M4 retune's brake on a free jaw (`m4-tuning.md` T1 to T4). Rule D1 now
charges a jaw its Filter, so the brake's reason is gone, and it shuts carnivores out of most prey.

## T4: `bite_mass_ratio` 1.15 — hypothesis before the run

Rule 2's payoff, read as access: no payoff matters if a hunter cannot bite. Change from T2:
`--param bite_mass_ratio=1.15` (the M4 plan's Start value, the draft's). With `diet_k` 1.5 and
`founder_hunter_diet` 0.6, mixing on.

Expected: a founder hunter can bite any body up to its own mass over 1.15, so it eats from the
first ticks and the guild holds: omnivores plus carnivores 0.05 to 0.3 at 12,000. The takeover does
not return, because a carnivore gives up its Filter and prey that fall in number starve it. At
144,000 carnivores 0.10 or more and herbivores 0.10 or more on 3 of 5 seeds. If carnivores take over
(herbivores under 0.10), rule 3: `diet_k` 2.0. If they still die out, the payoff (`bite_rate`).
