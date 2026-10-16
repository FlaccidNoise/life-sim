# M4 batch B — the rules at Off: bite, debris, abilities

**Date:** 2026-10-15. Tasks 3, 4, and 5 of `../plans/2026-10-14-m4-teeth.md`, built by three agents in
their own worktrees, merged one at a time, and checked by the orchestrator. Every reading here is at
the Off defaults unless a `--param` flag says otherwise. Nothing is tuned: tuning is Task 12.

## The switch-on rule holds through every merge

`gate-health` and `gate-evolve` (36,000 ticks, seeds 1, 2, 3) after each merge, compared by `diff`
against the Task 2 block of the plan (the M3 exit rows plus `variety_wired`):

| Merge | Head | Rows | `make check` |
|---|---|---|---|
| Task 2, skeleton | `949860c` | identical | 0 |
| Task 4, debris | `8ef278c` | identical | 0 |
| Task 3, bite and shell drag | `c11edc0` | identical | 0 |
| Task 5, dash, lunge, toxin | `f4cb651` | identical | 0 |
| Task 6, the page draws teeth (draw only) | `ae5f9ef` | not a sim change | 0 |

The state hash changed once, at Task 2 (format 9). No later merge changed the rows.

## Throughput at Off, and the first readings with a rule on

`node scripts/bench-wasm.mjs`, seed 1, 12,000 ticks of settling, 1,394 creatures. One reading each;
the M3 close read 2,646 to 2,801 over nine readings at the same code, so a single pair tells little
under about 5%.

| Head | Flags | Creatures | Median ticks/s | ns per creature-tick | Load |
|---|---|---|---|---|---|
| `216714e` (before Task 2) | | 1,394 | 2,845 | 252 | 3.6 to 3.9 |
| `949860c` (Task 2) | | 1,394 | 2,735 | 262 | 4.6 to 5.0 |
| `8ef278c` (Task 4) | | 1,394 | 2,875 | 250 | 2.9 |
| `8ef278c` | `corpse_share=0.5` | 1,490 | 2,539 | 264 | 2.9 |
| `c11edc0` (Task 3) | | 1,394 | 2,710 | 265 | 12.9 |
| `c11edc0` | `bite_rate=0.5` | 1,394 | 2,630 | 273 | 12.9 |

What the rows say:

- At Off the skeleton and the three rules together sit inside the noise of the M3 close
  (2,710 to 2,875 against 2,646 to 2,801). No task crossed the 5% line of the budget on its own
  reading, so no task stopped.
- `corpse_share=0.5` is the first flag that moves the world: 7% more bodies (debris is food) and
  about 5% more work per creature-tick (the debris grid query in `energy::contact`). The bench then
  reads 2,539, under M3's target of 2,600 and over the floor of 2,400. This is the reading the
  throughput budget expected ("a Filter scans the debris grid ... likely the largest"). The levers
  stand as the plan lists them, for Task 12.
- `bite_rate=0.5` with no jaw on any body reads the cost of the non-empty `bite::step` loop:
  about 3% per creature-tick at a load of 13, one reading. The loop does nothing per body here but
  the `bite_target` test.

## Task 8: the cost of Task 5 at Off, found and fixed

`make gates` at `7c3588d` read native 2,707 and WASM 2,515, under the skeleton's 3,057 and 2,735.
The native binary at each merge commit, twice each, in one sitting (the table is in the plan under
Task 8), put the cost at Task 5: 2,970 before, 2,737 after, about 8%. `ability::step` wrote four
`saturating_sub` counts per body per tick, each already 0 for every body at Off. The fix at
`7b8c74f` reads a count at 0 without writing it, and a body with no command above 0 skips the fire
checks. Interleaved A/B against the pre-Task-5 binary, three rounds each, load 5 to 10:

| | Pre-Task-5 (`c11edc0`) | Head with the fix (`7b8c74f`) |
|---|---|---|
| Native ticks/s | 2,974, 2,981, 2,982 | 2,899, 2,951, 2,935 |
| WASM ticks/s | 2,847, 2,847, 2,866 | 2,820, 2,827, 2,835 |

The fix leaves about 1% to 1.5% for the remaining loads of the loop. The gate rows at the fix are
identical to the baseline. **The "before" of every throughput reading from Task 9 on is the fixed
head: WASM about 2,830 at 1,394 bodies, 253 ns per creature-tick.** A single bench reading on this
machine swings by 10% with load: an A/B in one sitting is the way to read a task's cost.

## Task 3: rule J1, the bite, and rule D1, shell drag (`c11edc0`)

Twelve tests in `crates/sim/tests/bite.rs`, the names of the plan. The deliberate break (the cone
test accepts a body behind) fails `a_jaw_bites_a_body_it_faces_and_not_one_behind_it` and no other.

Where J1 is not explicit, the build chose, and none of these departs from the rule:

1. Step 5 reads places and headings after the motor, since `bite::step` runs after `motor::step`.
   The masses are the motor's of this tick, as the rule says.
2. `hurt_side` is a sign: 1, −1, or 0 on the line of the heading. It cannot be NaN when two centres
   meet.
3. The bitten body records the hit (`hurt`, `hurt_side`) even when a shell blocks all of it. The
   biter records a hit only when a spike hurts it.
4. The frame's flash stamps (`bit_tick`, `hurt_tick`) are set only when energy moved.
5. The motor's target is the nearest overlapping body in any jaw cone, the lower slot on a tie, and
   `bite_jaws` sums every cone that holds it. A jaw of size 0 can hold a target and bites for 0.
6. `bite::step` returns at once at `bite_rate` 0, as `mate::step` does at `mix_rate` 0.

D1: the forward drag is `1 - min(drag_fwd + shell_drag * shell_sum, SIDE_DRAG_MAX)` per body. At
`shell_drag` 0 the sum is `drag_fwd` to the bit, with no branch, and a test holds that a shelled body
and a bare one move bit for bit alike there.

**Edge case, open:** a biter and its prey can kill each other in one bite (eaten and spiked). The
lower slot dies first, so the higher slot dies with no killer named: the death card would read no
killer. Fixing it means `kill` must read the killer before the other body is freed, in `world.rs`.
Carried to Task 7 or Task 15.

**Test note:** `math::sin_cos(0)` returns a cosine of 1.0000036, so the drag test compares a shelled
body to a bare one rather than to a number. The conservation test uses a bite of 3/32 and dyadic
energies so that the bookkeeping is exact to 1e-6.

## Task 4: rule F1, debris (`8ef278c`)

Seven tests in `crates/sim/tests/debris.rs`. The deliberate break (decay keeps `debris_decay`
instead of `1 - debris_decay`) fails three: `a_piece_decays_and_is_freed_under_debris_min`,
`a_full_body_takes_no_debris`, `energy_in_equals_energy_out_over_a_closed_run`.

**The conservation test.** A closed world of 4,000 ticks: plants do not grow, no upkeep, bodies
still. Twelve bodies with no filter die of old age at known ticks with a known store over four
eaters with a filter. The decay of each tick is predicted outside the simulation as
`debris_decay * (pool before − eaten this tick + made this tick)`, so the identity is not circular.

| Debris | Energy |
|---|---|
| Made | 404.13 |
| Eaten | 235.20 |
| Decayed | 164.81 |
| Left | 4.13 |
| Residual | −0.0020 |
| Tolerance | 0.0098 |

The tolerance is the pool's energy summed over every tick, times `f32::EPSILON`, plus 1e-6: each
piece is rounded about twice a tick. The residual is five times under it. The creatures' side: energy
gained equals plants eaten plus debris eaten, to 1e-3.

**Departure from the plan's comment:** "plants eaten + debris made = debris eaten + debris decayed +
debris left" does not balance as written. The test holds two ledgers instead: for debris, made =
eaten + decayed + left; for the eaters, gain = plants eaten + debris eaten. `stats.rs` gained no
"made" or "decayed" counter; both are measured from outside.

**Switch-on:** the Filter skips the debris pass when the pool is empty, the plant pass is unchanged,
no piece is made at `corpse_share` 0, no draw is added, and the pool has no new field.

**Reading with `corpse_share=0.5`**, `gate-health` at `8ef278c`, seeds 1, 2, 3, load 3.1:

```
seed=1 creatures=1517 min_late=1389 plants=2229 births_late=2525 max_gen=15 mean_chemo=0.44 parked=0.00 first_bud=832 juv_starved=0.55 to_bud=0.30 PASS
seed=2 creatures=1396 min_late=1282 plants=2076 births_late=2182 max_gen=13 mean_chemo=0.48 parked=0.00 first_bud=850 juv_starved=0.55 to_bud=0.31 PASS
seed=3 creatures=1351 min_late=1265 plants=1965 births_late=2256 max_gen=15 mean_chemo=0.48 parked=0.00 first_bud=850 juv_starved=0.56 to_bud=0.31 PASS
gate-health 3/3 PASS
```

Against the Off rows: 59 to 138 more bodies (+4% to +11%), `min_late` up 86 to 113, `first_bud`
later by 49 to 87 ticks, `mean_chemo` down on seed 1 (0.48 → 0.44) and up on 2 and 3. Debris is
food for a Filter, and more food held more bodies, as the draft measured (C8). A reading, not a
tuning. The size of the pool is below.

## Task 5: rules A1 to A3, dash, lunge, toxin, and X2, the player's mask

Ten tests in `crates/sim/tests/ability.rs`. The deliberate break (a cloud drains its maker) fails
`a_cloud_drains_others_but_not_its_maker_and_the_energy_is_gone`.

Readings the plan left open, as built:

- **Countdown.** Cooldowns and `lunge_left` fall by 1 at the start of each tick's ability step,
  before the fire check. Two uses are exactly `ability_cooldown` ticks apart, and the bite step sees
  a raised bite for `lunge_ticks` ticks.
- **Cloud reach.** A body is inside a cloud when its centre, after this tick's move, is within the
  radius. Bodies come from the grid of the start of the tick, searched `v_max` past the radius: the
  motor holds a move to `v_max`, so none is missed.
- **Deaths.** Bodies poisoned to 0 die after every cloud has drained, in slot order, as the bite step
  kills. The maker's slot comes from `World::slot_of` once per death. That scan's doc says "never
  per tick": a world of many poisonings per tick would show it in ns per creature-tick.
- **No change to `motor.rs`.** The motor caps speed after the dash impulse, so the limit holds.
- **The guide test** quotes one line of `control.rs` word for word, so that line did not change.
- **One test fixture changed outside the task's files**, with the orchestrator's approval: the
  snapshot world's hand-made cloud now lives 2,000 ticks, since rule A3 counts every cloud down and
  freed the old one at tick 30, under a test that then freed a dead slot.

**Switch-on:** a default world of 400 founders gives one hash after 2,000 ticks with and without
the Task 5 code (the agent's check), and the gate rows at the merge (`f4cb651`) are identical to
the baseline, by `diff`.

## The size of the debris pool with `corpse_share=0.5`

`run --seed 1 --creatures 400 --plants 1200`, at `f4cb651`, load 4.5. A point reading at the end of
the run, not a mean: `run` prints the pool once.

| Ticks | `corpse_share` | Creatures | Debris pieces |
|---|---|---|---|
| 12,000 | 0 | 1,458 | 0 |
| 12,000 | 0.5 | 1,517 | 278 |
| 36,000 | 0.5 | 1,687 | 545 |

545 pieces at tick 36,000 is 13% of the pool of 4,096. With `debris_decay` 0.0005 a piece loses
half its energy in about 1,400 ticks, so the pool holds roughly the deaths of the last 2,000 to
3,000 ticks that no Filter reached. The pool did not fill. The 36,000 world holds 1,687 bodies
against 1,633 at Off: debris is food.
