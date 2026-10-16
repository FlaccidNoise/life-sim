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
