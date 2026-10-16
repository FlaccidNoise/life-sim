# M4 retune — Diet: rows

The plan is `../plans/2026-10-16-m4-retune-diet.md`. Every trial's hypothesis is committed here
before its run. One run at a time. Each run's script, with every `--param` written out, is quoted
with its rows.

## Built

- Task 1, rule E1 (`e20fa9f`): the eye's jaw input is times `eye_gain`.
- Task 5 (`c83a428`): the benches gate on nanoseconds per creature-tick, at most 278.
- Task 2, rule D1 (`fcb7b4d`, `5e3db1a`): the `diet` gene, `diet_k` 0 by default until `cc2738d`
  shipped 1.5. Format 11, ABI 9.
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

### T4 rows (`152f34f`)

| Seed | tick | creatures | herb | omni | carn | diet_mean | hunt | kills since last row |
|---|---|---|---|---|---|---|---|---|
| 1, 2, 3 | 3,000 | 1,174 to 1,309 | 0.96 to 0.98 | 0.02 to 0.04 | 0.000 to 0.001 | 0.04 to 0.06 | 0.06 to 0.07 | 822, 997, 896 |
| 1, 2, 3 | 12,000 | 1,285 to 1,493 | 0.998 to 1.000 | 0.000 to 0.002 | 0.000 | 0.05 | 0.15 to 0.19 | 40 to 70 |
| 1 | 144,000 | 192 | 0.214 | 0.786 | 0.000 | 0.38 | 1.000 | 6,167 |
| 4 | 144,000 | 211 | 0.384 | 0.616 | 0.000 | 0.33 | 1.000 | 6,300 |
| 5 | 144,000 | 248 | 0.383 | 0.613 | 0.004 | 0.35 | 1.000 | 7,873 |
| 6 | 144,000 | 299 | 0.562 | 0.438 | 0.000 | 0.26 | 0.953 | 5,810 |
| 8 | 144,000 | 318 | 0.465 | 0.528 | 0.006 | 0.28 | 0.673 | 5,934 |

**Falsified, the other way.** The hunters eat now (800 to 1,000 kills by tick 3,000), but every body
can bite every body of about its own size: by 48,000 every lineage has a jaw at a middling diet and
the world falls to 190 to 320 bodies by 144,000, a cannibal cloud. No carnivore holds. Size alone
gives no food that only hunters need. This led to rule D2 (`d7d63de`), an amendment logged in
`../decisions/INDEX.md`.

## T5: rule D2 at `bite_diet_gap` 0.25 — hypothesis before the run

Change from T4: `--param bite_diet_gap=0.25`. With `diet_k` 1.5, `founder_hunter_diet` 0.6,
`bite_mass_ratio` 1.15, mixing on. A founder hunter at 0.6 bites bodies at 0.35 or under: the
herbivores. A herbivore's jaw now has nothing to bite, and two hunters of close diets cannot eat
each other.

Expected: the founders hold through ticks 250 to 1,000 (they eat, as in T4), and the cloud does
not form: `herb_jaw` falls, the population stays over 1,200, herbivores stay the base and hunters
are bounded by them. Expect cycles. At 144,000: herbivores 0.10 or more, carnivores 0.10 or more,
`diet_sd` 0.20 or more on 3 of 5 seeds. If the guild holds as omnivores (0.3 to 0.7) and not as
carnivores, the next lever is the gap, then the ratio, in that order.

### T5 rows (`0a0c2d8`)

The saved worlds were rebaked at the defaults first (the parameter table grew by one):
`m2-world.tdpl` hash `881cbf22`, `m2-world-long.tdpl` hash `c13a40e5`, the same bodies as before.

| Seed | tick | creatures | herb | omni | carn | diet_sd | hunt | kills since last row |
|---|---|---|---|---|---|---|---|---|
| 1, 2, 3 | 1,000 | 862 to 925 | 0.91 to 0.93 | 0.07 to 0.09 | 0.000 to 0.002 | 0.15 to 0.17 | 0.10 to 0.13 | 237 to 338 |
| 1, 2, 3 | 12,000 | 1,257 to 1,415 | 0.95 to 0.99 | 0.006 to 0.050 | 0.000 to 0.001 | 0.07 to 0.10 | 0.12 to 0.47 | 58 to 91 |
| 1 | 144,000 | 1,244 | 0.043 | 0.868 | 0.088 | 0.13 | 0.995 | 8,760 |
| 4 | 144,000 | 1,331 | 0.996 | 0.004 | 0.000 | 0.07 | 0.340 | 5 |
| 5 | 144,000 | 1,231 | 0.196 | 0.729 | 0.075 | 0.19 | 0.957 | 6,616 |
| 6 | 144,000 | 930 | 0.210 | 0.697 | 0.094 | 0.21 | 0.970 | 3,401 |
| 8 | 144,000 | 1,004 | 0.107 | 0.770 | 0.124 | 0.19 | 0.874 | 5,752 |

Minimums over the second half (target 1 reads these): herb 0.021, 0.981, 0.099, 0.210, 0.097; carn
0.088, 0.000, 0.059, 0.007, 0.117; `diet_sd` 0.13, 0.07, 0.18, 0.20, 0.18. **Target 1: 0 of 5.**

**Half confirmed.** No cloud: the world holds 930 to 1,331 bodies at 144,000. A diet ladder evolves
on 4 of 5 seeds, from below: the founder hunters fade by 12,000, then omnivores climb out of the
herbivores by 48,000 and carnivores out of the omnivores, with kills of 3,400 to 8,800 per 24,000
ticks. On seed 8 carnivores without a Filter's use hold 0.11 to 0.13 from 72,000 on, and herbivores
lose their jaws (`herb_jaw` 0.009 at 120,000). Seed 4 never climbs. The middle is too large:
omnivores 0.70 to 0.87 squeeze both ends.

## T6: `diet_k` 2.0 — hypothesis before the run

Rule 4: for omnivores taking over, `diet_k` up. Change from T5: `--param diet_k=2.0`. A body at 0.5
takes 25% of each food, not 35%.

Expected: on the seeds that climb, the middle thins and both ends grow: omnivores under 0.6,
herbivores and carnivores 0.10 or more on at least 3 of 5 seeds, `diet_sd` over 0.20. The risk: a
weaker gradient near 0 (a step to 0.1 gains 1% of a bite, not 3%) slows the climb, so seeds like 4
may become two or three. If the climb fails on most seeds, `diet_k` goes back to 1.5 and the next
lever is the gap (0.35).

### T6 rows (`2034f38`)

| Seed | 144,000: creatures | herb | omni | carn | diet_sd | hunt | kills | second half: herb_min, carn_min, sd_min |
|---|---|---|---|---|---|---|---|---|
| 1 | 1,633 | 0.999 | 0.001 | 0.000 | 0.06 | 0.021 | 0 | 0.999, 0.000, 0.06 |
| 4 | 1,236 | 0.769 | 0.224 | 0.006 | 0.17 | 0.695 | 3,476 | 0.769, 0.000, 0.14 |
| 5 | 1,606 | 0.999 | 0.001 | 0.000 | 0.06 | 0.352 | 37 | 0.998, 0.000, 0.06 |
| 6 | 1,403 | 0.994 | 0.006 | 0.000 | 0.06 | 0.185 | 1 | 0.994, 0.000, 0.05 |
| 8 | 1,391 | 0.997 | 0.003 | 0.000 | 0.06 | 0.630 | 2 | 0.997, 0.000, 0.06 |

At 12,000 on seeds 1 to 3: herbivores 0.999 to 1.000. **Falsified, by the risk named before the
run:** at `diet_k` 2.0 the climb fails on 4 of 5 seeds. The bracket: 1.5 climbs and lets the middle
take most bodies, 2.0 does not climb.

**A deviation from rule 6, with its reason.** Six trials have not met target 1, and rule 6 says to
build I1 now. Rule 6 was written when D1 stood alone and I1 was the stabiliser in reserve. D2 has
since given the stability (no cloud, no crash, 930 to 1,331 bodies in T5). What fails is the shape
(the middle too large) and the founding (seed 4 never climbs, nothing at 12,000), and predator
interference acts on neither. The remaining four trials go to the founding and the shape. I1 stays
in reserve for the owner.

## T7: `founder_hunter_diet` 0.4 — hypothesis before the run

Rule 2, the founding. Change from T5: `--param founder_hunter_diet=0.4` (T5's `diet_k` 1.5, ratio
1.15, gap 0.25). A founder hunter filters 46% and bites 25%, and bites only bodies at 0.15 or under.
T5 showed the ladder climbs out of omnivores, so the founders start as omnivores.

Expected: the founder guild holds through 12,000 on seeds 1 to 3 (omnivores 0.05 or more) and the
ladder forms on 5 of 5 seeds, seed 4 included. The shape stays T5's (the middle large), so target 1
may still miss on the ends. If the founders still fade, the founding is not the gate and the
remaining trials go to the shape (`diet_k` 1.75, then the gap).

### T7 rows (`cb97df3`)

| Seed | 144,000: creatures | herb | omni | carn | diet_sd | kills | second half: herb_min, carn_min, sd_min |
|---|---|---|---|---|---|---|---|
| 1 | 1,338 | 0.121 | 0.854 | 0.025 | 0.13 | 9,732 | 0.121, 0.000, 0.13 |
| 4 | 1,325 | 0.992 | 0.008 | 0.000 | 0.07 | 22 | 0.983, 0.000, 0.07 |
| 5 | 1,126 | 0.147 | 0.739 | 0.115 | 0.20 | 7,418 | **0.132, 0.100, 0.20: pass** |
| 6 | 1,298 | 0.584 | 0.411 | 0.005 | 0.19 | 3,789 | 0.584, 0.000, 0.12 |
| 8 | 728 | 0.161 | 0.720 | 0.120 | 0.22 | 1,489 | 0.021, 0.040, 0.11 |

At 12,000 on seeds 1 to 3: herbivores 0.994 to 0.999, the founders gone as in T5 (601 to 654
kills by 3,000). **Falsified: the founding is not the gate.** Seed 4 never climbs. Target 1: 1 of 5
(seed 5, the first seed to pass).

## T8: `diet_sigma` 0.1 — hypothesis before the run

The research (`../research/diet-coexistence.md` (b)): gradual evolution rarely reaches a mixed
community without mutations of large effect (Egas et al. 2004). Change from T5: `--param
diet_sigma=0.1` (`diet_k` 1.5, `founder_hunter_diet` 0.6, ratio 1.15, gap 0.25).

Expected: a larger step lets a herbivore lineage jump the valley near 0, so the ladder forms on 5
of 5 seeds and earlier, and the spread rises (more bodies at the ends). Target 1 on 2 or more
seeds. The middle may stay large: if so, T9 is `diet_k` 1.75 on this base.

### T8 rows (`b59b7fb`)

| Seed | 144,000: creatures | herb | omni | carn | diet_sd | kills | second half: herb_min, carn_min, sd_min |
|---|---|---|---|---|---|---|---|
| 1 | 934 | 0.099 | 0.830 | 0.072 | 0.16 | 5,026 | 0.023, 0.072, 0.13 |
| 4 | 963 | 0.377 | 0.574 | 0.049 | 0.22 | 3,953 | 0.269, 0.035, 0.18 |
| 5 | 1,045 | 0.195 | 0.656 | 0.149 | 0.22 | 4,464 | 0.195, 0.075, 0.22 |
| 6 | 890 | 0.260 | 0.701 | 0.039 | 0.18 | 3,235 | 0.224, 0.020, 0.17 |
| 8 | 933 | 0.088 | 0.742 | 0.170 | 0.17 | 6,616 | 0.088, 0.073, 0.17 |

At 12,000 on seeds 1 to 3: omnivores 0.025 to 0.041 and carnivores 0.000 to 0.008, with 188 and
306 kills on seeds 1 and 2. **Confirmed in part:** the ladder forms on 5 of 5 seeds, seed 4
included, and starts before 12,000. Target 1: 0 of 5; the middle is still 0.57 to 0.83 and the
carnivores dip under 0.10 in the second half on every seed.

## T9: `diet_k` 1.75 — hypothesis before the run

Rule 4, the shape. Change from T8: `--param diet_k=1.75` (`diet_sigma` 0.1, `founder_hunter_diet`
0.6, ratio 1.15, gap 0.25). A body at 0.5 takes 30% of each food, not 35%.

Expected: the larger step keeps the climb that `diet_k` 2.0 lost with the smaller one, and the
middle thins: omnivores under 0.6 and the ends 0.10 or more on 2 or more seeds. If the climb fails
again on most seeds, 1.5 stays and T10 is the gap (0.35) on the T8 base.

### T9 rows (`f3d55fe`, load 9 to 125)

| Seed | 144,000: creatures | herb | omni | carn | diet_sd | kills | second half: herb_min, carn_min, sd_min |
|---|---|---|---|---|---|---|---|
| 1 | 1,008 | 0.170 | 0.819 | 0.011 | 0.13 | 6,724 | 0.170, 0.007, 0.13 |
| 4 | 1,115 | 0.608 | 0.385 | 0.007 | 0.19 | 3,697 | 0.608, 0.003, 0.18 |
| 5 | 1,585 | 0.955 | 0.045 | 0.000 | 0.10 | 251 | 0.955, 0.000, 0.09 |
| 6 | 1,455 | 0.973 | 0.027 | 0.000 | 0.09 | 28 | 0.973, 0.000, 0.09 |
| 8 | 1,245 | 0.980 | 0.020 | 0.000 | 0.09 | 0 | 0.966, 0.000, 0.09 |

**Falsified.** At 1.75 the climb fails on 3 of 5 seeds even with the larger step, and where it
climbs the middle holds and carnivores stay under 0.02. `diet_k` stays 1.5.

## T10: `bite_diet_gap` 0.35 — hypothesis before the run

The last trial. Change from T8: `--param bite_diet_gap=0.35` (`diet_k` 1.5, `diet_sigma` 0.1,
`founder_hunter_diet` 0.6, ratio 1.15). An omnivore at 0.5 bites only bodies at 0.15 or under; a
carnivore at 0.85 bites the omnivore band up to 0.5.

Expected: carnivores feed on omnivores, which grows the flesh end and thins the middle; herbivores
lose some omnivore predators. Target 1 on 2 or more seeds, the ladder kept on 4 or more. The risk: a
founder hunter at 0.6 bites only bodies at 0.25 or under, the herbivores, so the founding is as in
T8.

### T10 rows (`0c16df4`, load 23 to 124)

| Seed | 144,000: creatures | herb | omni | carn | diet_sd | kills | second half: herb_min, carn_min, sd_min |
|---|---|---|---|---|---|---|---|
| 1 | 1,790 | 0.970 | 0.030 | 0.000 | 0.09 | 0 | 0.968, 0.000, 0.09 |
| 4 | 1,400 | 0.974 | 0.026 | 0.000 | 0.10 | 86 | 0.939, 0.000, 0.10 |
| 5 | 1,778 | 0.952 | 0.048 | 0.000 | 0.10 | 755 | 0.922, 0.000, 0.10 |
| 6 | 1,418 | 0.971 | 0.029 | 0.000 | 0.09 | 45 | 0.962, 0.000, 0.09 |
| 8 | 1,092 | 0.809 | 0.139 | 0.052 | 0.22 | 1,067 | 0.809, 0.000, 0.10 |

**Falsified.** At a gap of 0.35 a climbing omnivore's prey is too narrow: the ladder forms on 1 of
5 seeds.

## The stop of rule 7, and what ships

Ten trials. **Target 1 is not met by any trial**: no set holds herbivores and carnivores at 0.10 or
more through the second half on 5 of 5 seeds. Seed 5 of T7 is the only seed that met it.

| Trial | Ladder at 144,000 (seeds of 5) | Target 1 (seeds) | Bodies at 144,000 |
|---|---|---|---|
| Baseline (`diet_k` 0) | no: the jaw takeover | — | 711 to 886 |
| T1 to T3 | 0 | 0 | 1,268 to 1,845 |
| T4 (ratio 1.15) | 0: a cannibal cloud | 0 | 192 to 318 |
| T5 (D2 gap 0.25) | 4 | 0 | 930 to 1,331 |
| T6 (`diet_k` 2.0) | 1 | 0 | 1,236 to 1,633 |
| T7 (founders 0.4) | 3 | 1 | 728 to 1,338 |
| **T8 (`diet_sigma` 0.1)** | **5** | 0 | **890 to 1,045** |
| T9 (`diet_k` 1.75) | 2 | 0 | 1,008 to 1,585 |
| T10 (gap 0.35) | 1 | 0 | 1,092 to 1,790 |

**T8's set ships on**, by the owner's standing instruction that built features ship on
(2026-10-16): `diet_k` 1.5, `diet_sigma` 0.1, `founder_hunter_diet` 0.6, `bite_mass_ratio` 1.15,
`bite_diet_gap` 0.25. It is the only set with a ladder from plants to flesh on every seed: at
144,000 herbivores 0.09 to 0.38, omnivores 0.57 to 0.83, carnivores 0.04 to 0.17, `diet_sd` 0.16 to
0.22, 3,200 to 6,600 kills per 24,000 ticks, and no jaw takeover of the M4 kind (herbivores keep
their jaws on some seeds, but a diet-0 jaw takes nothing). What fails: the middle is the largest
guild and the carnivores dip under 0.10 in the second half on every seed. The owner decides
whether that is the spectrum they want or a target to keep. The levers measured: `diet_k` 1.5 is
the only value that climbs; the gap 0.25 is better than 0.35; the founders do not hold at 12,000
at any value tried, so target 2 (coexistence at 12,000) is not met either.

## Rows behind the claims above

The fresh-context audit (2026-10-16) found claims in this file that the tables did not quote. They
come from the same runs, `--every 24000` unless stated:

- Baseline, 144,000, seeds 1, 4, 5, 6, 8: creatures 711, 768, 780, 886, 758; kills in the last
  24,000 ticks 7,381, 7,601, 8,144, 2,026, 7,206.
- T1, 144,000: creatures 1,664, 1,352, 1,742, 1,403, 1,460. T2: 1,494, 1,295, 1,330, 1,426, 1,268.
  T3: 1,671, 1,314, 1,592, 1,363, 1,496.
- The T2 world read every 250 ticks on seed 1 (`probe-diet --seeds 1 --ticks 3000 --every 250
  --param diet_k=1.5 --param founder_hunter_diet=0.6`, not a trial): `hunt` 0.120 at 250 (683
  bodies), 0.029 at 500, 0.012 at 750 and 1,000, 0.008 from 1,500; omnivores 0.123, 0.029, 0.008,
  0.004; kills 3, 3, 1, 0 per 250 ticks.
- T5's climb, seeds 1, 5, 8 (herb, omni, carn, `herb_jaw`):

| Seed | 24,000 | 48,000 | 72,000 | 120,000 |
|---|---|---|---|---|
| 1 | 0.871, 0.129, 0.000, 0.475 | 0.368, 0.583, 0.050, 0.739 | 0.077, 0.886, 0.037, 0.989 | 0.021, 0.873, 0.106, 1.000 |
| 5 | 0.654, 0.346, 0.001, 0.607 | 0.441, 0.531, 0.029, 0.743 | 0.162, 0.774, 0.064, 0.592 | 0.120, 0.821, 0.059, 0.786 |
| 8 | 0.298, 0.697, 0.005, 0.453 | 0.181, 0.752, 0.067, 0.559 | 0.111, 0.778, 0.112, 0.248 | 0.107, 0.764, 0.130, 0.009 |

  The climb starts before 24,000, not by 48,000 as written above.
- T8 at 144,000, `herb_jaw` on seeds 1, 4, 5, 6, 8: 0.457, 0.854, 0.980, 1.000, 0.988. Herbivores
  keep jaws on most seeds. The jaw also gives the lunge, a second dash, whatever its bite takes
  (`ability.rs`): a likely cause, not measured.
- Not checked: that a founder hunter is about 1.15 times a founder's mass (from the M4 plan's
  arithmetic, not recomputed here).

## The proof at the shipped set (`cc2738d`, load 96 to 138)

The machine carried three `llama-server` processes and another project's tests (about 700% CPU)
through every reading below. The seeded rows are deterministic and stand. The bench readings do not.

- Saved worlds rebaked: `m2-world.tdpl` tick 36,000, 1,443 bodies, 621 pieces of debris, hash
  `656e38a9`; `m2-world-long.tdpl` tick 144,000, 934 bodies, 290 pieces, hash `19f72d0b`.
- `make check` 0.
- `gate-health` (12,000, seeds 1 to 3): **3 of 3**. Hunters 0.069 to 0.165 of the living, kills in
  the last 2,000 ticks 136, 200, 3.
- `gate-evolve` (36,000, seeds 1 to 3): **0 of 3**, every miss on the eye gap (0.063, −0.020, 0.026).
- Long gate (144,000, seeds 1, 4, 5, 6, 8, `--brain --predation`): **0 of 5**, every miss on the eye
  gap (0.015, 0.070, 0.058, 0.058, 0.086). Its predation columns pass: `kills_late` 263 to 716,
  `flesh_late` 0.025 to 0.057.
- `probe-diet` at 144,000: the T8 rows, digit for digit.
- Bench: native 2,037 ticks per second at 1,438 bodies, 341 ns per creature-tick, FAIL against 277.8
  at load 105. The interleaved WASM A/B (A = `cfd5386`, before the diet gene; B = `cc2738d`), load
  124 to 138: A 610, 629, 637 ns; B 638, 648, 659 ns; medians 629 and 648, 3% apart. At this load
  neither the floor nor the 3% can be read. To read again on a quiet machine.

The eye gap: since E1, a blind eye no longer sees teeth, and the blind arm sits at the level an eye
drifts to when it carries nothing (the baseline section). The sighted arm is 0.015 to 0.086 over it.
The band of 0.1 is the owner's; the finding is that sight is weakly selected in this world.
