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
