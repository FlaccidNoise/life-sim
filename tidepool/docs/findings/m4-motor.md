# M4 Task 10 — The motor before predators: the fin and the dash

**Date:** 2026-10-16. The motor stop of `../plans/2026-10-14-m4-teeth.md` (choices C7 and C8, option A
of each). Rule R4 of `design.md`: the motor is final before predators are tuned. The probe is
`probe-turn` (`f220458`); the arms of the long gate are run by the orchestrator below. No rule and no
default changed in this task.

## probe-turn: one body alone, at full thrust and a turn command of 1

One adult alone in a 1,024 by 1,024 world with no plants, every upkeep and the move cost at 0,
`founder_sigma` 0, thrust 1 and turn 1 for 300 ticks from rest. Then the dash bit is held for one
tick with `dash_impulse` 2.0 and `dash_spin` 0.3 (the Start values), and the `dash=1` row is read on
the tick the dash lands. The founder is the reference body; the fin body is the founder with a fin of
0.3; the hunter is the founder armed by `Genome::arm` (rule P3). Each measure is read at the end of a
tick: `top` the velocity along the heading, `speed` the size of the velocity, `turn` omega in radians
per tick, `slip` the velocity across the heading over the speed (a ratio, not the angle that
`tests/motor.rs` reads), `radius` the speed over the turn.

```
body=founder fin_grip=0.300 dash=0 top=0.996 speed=1.059 turn=0.107 slip=0.340 radius=9.928
body=founder fin_grip=0.300 dash=1 top=1.951 speed=2.081 turn=0.233 slip=0.348 radius=8.913
body=founder fin_grip=0.600 dash=0 top=0.996 speed=1.059 turn=0.107 slip=0.340 radius=9.928
body=founder fin_grip=0.600 dash=1 top=1.951 speed=2.081 turn=0.233 slip=0.348 radius=8.913
body=fin fin_grip=0.300 dash=0 top=0.941 speed=0.985 turn=0.118 slip=0.295 radius=8.323
body=fin fin_grip=0.300 dash=1 top=1.822 speed=1.928 turn=0.240 slip=0.326 radius=8.024
body=fin fin_grip=0.600 dash=0 top=1.000 speed=1.031 turn=0.120 slip=0.245 radius=8.622
body=fin fin_grip=0.600 dash=1 top=1.885 speed=1.978 turn=0.242 slip=0.303 radius=8.190
body=hunter fin_grip=0.300 dash=0 top=0.932 speed=0.977 turn=0.093 slip=0.299 radius=10.547
body=hunter fin_grip=0.300 dash=1 top=1.777 speed=1.867 turn=0.203 slip=0.307 radius=9.209
body=hunter fin_grip=0.600 dash=0 top=0.932 speed=0.977 turn=0.093 slip=0.299 radius=10.547
body=hunter fin_grip=0.600 dash=1 top=1.777 speed=1.867 turn=0.203 slip=0.307 radius=9.209
```

What the rows say:

- **The dash about doubles speed for a moment** (1.06 to 2.08 for the founder, +96%) and about
  doubles the turn rate (0.107 to 0.233), as the plan's arithmetic said ("a dash about doubles it").
  The radius of the turn tightens by a tenth. The speed limit holds: `top` 1.95 is under `v_max`.
- **A fin of 0.3 at the default grip already cuts the slip** of this body: 0.295 against the
  founder's 0.340, with a tighter turn (radius 8.3 against 9.9) at the cost of 6% of top speed.
  At a grip of 0.6 the slip falls further (0.245), the top speed comes back (1.000), and the turn
  rate is the same (0.120). M2 audit L5 read the opposite at 0.3 on the motor test's body, which has
  no cilia and a fin of 0.5: the sign of a fin at 0.3 depends on the body.
- **The hunter** (a jaw of 0.5 at the nose, 1.15 times the founder's heft) is 8% slower, turns 13%
  slower, and its radius is 6% wider. A jaw costs motion through mass, as rule K1 says it should.
- Nothing here reads whether evolution keeps a fin. That is the arm below.

## The arms: does evolution keep the fin?

`gate-evolve --seeds 1,4,5,6,8 --ticks 144000` at `f39f38f` (after Task 9), with the fin working
(arm A) and with `--param fin_torque=0 --param fin_grip=0` (arm B, a fin that does nothing), then
`probe-census` on the same seeds at tick 144,000 for the mean fin size over the living. One run per
seed, one at a time, load 3 to 13.

| Seed | A: `fin` mean size | B: `fin` mean size | A creatures | B creatures | A speed | B speed |
|---|---|---|---|---|---|---|
| 1 | 0.01 | 0.02 | 1,647 | 1,687 | 0.82 | 0.76 |
| 4 | 0.02 | 0.00 | 1,355 | 1,344 | 0.93 | 0.89 |
| 5 | 0.00 | 0.03 | 1,714 | 1,595 | 0.79 | 0.83 |
| 6 | 0.00 | 0.02 | 1,339 | 1,532 | 0.80 | 0.87 |
| 8 | 0.02 | 0.00 | 1,375 | 1,421 | 0.75 | 0.76 |

The rows of arm A and arm B:

```
seed=1 creatures=1647 creatures_noscent=1701 creatures_noeye=1412 len=10.3 len_sd=1.59 parts=7.9 chemo=0.23 chemo_blind=0.05 eye=0.28 eye_blind=0.04 plans=4 speed_cv=0.22 speed=0.82 area=35.5 hidden=3.43 conns=51.4 shapes=3 shapes_raw=3 variety=21.5 variety_wired=18.3 PASS
seed=4 creatures=1355 creatures_noscent=1311 creatures_noeye=1251 len=8.9 len_sd=1.31 parts=10.1 chemo=0.24 chemo_blind=0.00 eye=0.43 eye_blind=0.03 plans=5 speed_cv=0.32 speed=0.93 area=35.2 hidden=4.53 conns=64.8 shapes=6 shapes_raw=4 variety=23.8 variety_wired=23.5 PASS
seed=5 creatures=1714 creatures_noscent=1696 creatures_noeye=1318 len=7.8 len_sd=1.13 parts=11.1 chemo=0.16 chemo_blind=0.00 eye=0.33 eye_blind=0.03 plans=3 speed_cv=0.25 speed=0.79 area=30.0 hidden=4.19 conns=58.7 shapes=4 shapes_raw=0 variety=29.9 variety_wired=28.4 PASS
seed=6 creatures=1339 creatures_noscent=1375 creatures_noeye=1109 len=9.8 len_sd=1.39 parts=9.6 chemo=0.21 chemo_blind=0.03 eye=0.30 eye_blind=0.06 plans=5 speed_cv=0.23 speed=0.80 area=33.2 hidden=4.58 conns=51.7 shapes=3 shapes_raw=4 variety=29.5 variety_wired=29.7 PASS
seed=8 creatures=1375 creatures_noscent=1468 creatures_noeye=1049 len=9.8 len_sd=1.26 parts=7.1 chemo=0.09 chemo_blind=0.09 eye=0.30 eye_blind=0.01 plans=3 speed_cv=0.25 speed=0.75 area=38.2 hidden=4.74 conns=54.3 shapes=5 shapes_raw=4 variety=13.8 variety_wired=13.6 FAIL(chemo_gap=-0.006 < 0.1)
gate-evolve 4/5 FAIL

seed=1 creatures=1687 creatures_noscent=1802 creatures_noeye=1284 len=10.1 len_sd=1.33 parts=9.4 chemo=0.25 chemo_blind=0.05 eye=0.43 eye_blind=0.02 plans=5 speed_cv=0.21 speed=0.76 area=32.8 hidden=1.86 conns=47.6 shapes=6 shapes_raw=6 variety=11.2 variety_wired=8.2 PASS
seed=4 creatures=1344 creatures_noscent=1245 creatures_noeye=1154 len=9.7 len_sd=1.43 parts=9.3 chemo=0.20 chemo_blind=0.03 eye=0.32 eye_blind=0.04 plans=4 speed_cv=0.27 speed=0.89 area=34.2 hidden=4.93 conns=54.2 shapes=3 shapes_raw=1 variety=26.5 variety_wired=25.9 PASS
seed=5 creatures=1595 creatures_noscent=1789 creatures_noeye=1393 len=10.9 len_sd=1.35 parts=11.2 chemo=0.20 chemo_blind=0.01 eye=0.24 eye_blind=0.04 plans=6 speed_cv=0.23 speed=0.83 area=38.5 hidden=4.25 conns=72.2 shapes=4 shapes_raw=4 variety=27.4 variety_wired=20.4 PASS
seed=6 creatures=1532 creatures_noscent=1400 creatures_noeye=1130 len=8.7 len_sd=1.59 parts=10.1 chemo=0.19 chemo_blind=0.03 eye=0.35 eye_blind=0.04 plans=4 speed_cv=0.25 speed=0.87 area=28.6 hidden=6.12 conns=71.9 shapes=4 shapes_raw=3 variety=32.2 variety_wired=33.6 PASS
seed=8 creatures=1421 creatures_noscent=1352 creatures_noeye=1193 len=9.2 len_sd=1.58 parts=8.6 chemo=0.18 chemo_blind=0.00 eye=0.38 eye_blind=0.02 plans=5 speed_cv=0.23 speed=0.76 area=38.4 hidden=3.30 conns=54.1 shapes=6 shapes_raw=3 variety=17.0 variety_wired=10.4 PASS
gate-evolve 5/5 PASS
```

- **"Evolution keeps the fin" is not shown.** The fin is near absent at tick 144,000 in both arms:
  a mean size of 0.00 to 0.02 with the fin working and 0.00 to 0.03 with it dead. The gap is 0 within
  noise on every seed. A fin arrives by the add-part mutation at 0.1 and is not kept, whether or not
  it does anything. Nothing chases yet: the fin's payoff, if it has one, comes with predation.
- **Arm A fails the long gate on seed 8** (`chemo_gap=0.00`: `chemo` 0.09 against `chemo_blind`
  0.09). This is the first long reading after Task 9, with no M4 rule on, and it is a baseline fact
  for the retune, not a fin finding: arm B passes 5 of 5 on the same seeds. Seed 8 was the fragile
  seed of M3 too (`m2-audit-2.md`, `m3-tuning.md`). Task 12 part 2 reads the long gate again with
  every rule on, and target 5 of the retune is 5 of 5.

## Proposal for `fin_grip`, provisional (choice C8)

**Set `fin_grip` to 0.6.** Reasons, from the rows and nothing else:

1. At 0.3 a fin of 0.3 on the founder body cuts the slip by 13% and costs 6% of top speed. At 0.6
   it cuts the slip by 28% and costs nothing in top speed (1.000 against 0.996 bare). A fin at 0.6
   is a trade a body can win; at 0.3 it is a tax with a small return.
2. Evolution does not keep the fin at 0.3 today (0.00 to 0.02). A value at which the fin at least
   does not slow its carrier gives the retune's hunters and prey a fin that can pay once something
   chases. That is the reading the plan asked for before predators are tuned (design rule R4).
3. The M2 test is already named for 0.6: `a_fin_turns_only_at_speed_and_a_grip_of_0_6_cuts_the_slip`.
   The default becomes what the test holds.

Rejected: leaving 0.3 (the fin stays a tax, and the carry stays open into the milestone where turning
decides who lives); a value above 0.6 (no row reads it). The owner picks. The build takes 0.6 as
provisional and reads it as step 0 of the switch-on (`m4-tuning.md`), with its own gate rows.
