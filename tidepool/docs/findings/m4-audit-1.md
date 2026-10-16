# M4 mid-build audit — the rules as built, before the switch-on

**Date:** 2026-10-16, at `c034cf3`, by a fresh-context auditor that read the plan's rules and the code
and nothing of the builders' findings first. Read-only: no build, no test, no simulation. Saved by
the orchestrator from the reply; the fixes made from it are listed at the end.

## Verdict

The switch-on can proceed. The rules match the plan apart from recorded or cosmetic departures.
Save and load is complete. Off draws nothing and changes no float on an old path. Every new pass is
ordered. Item 1 needed a decision before the trials.

## Findings, most severe first

1. **MEDIUM, path confirmed, effect plausible.** `prune` gave every declared output that had no gene a
   bias of 0. Rule P2 makes a founder's trigger rest closed at `starter_trigger_bias`, but a trigger
   that arrives by the add-part mutation (P4) or by a cross got bias 0, so it fired whenever its
   wires summed above 0: one P4 wire from `IN_CONST` at +0.1 fires it on every cooldown. At Off it
   did nothing (the costs are 0). At Start a new Jaw would pay 6 per 100 ticks (about a tenth of a
   reference Filter's best intake) and a new gland 24 (about 41%): a selection against mutant
   hunters that would confound the `hunt_lo` proof (`founder_jaw=0`). **Fixed, see below.**
2. **LOW, confirmed.** `kill` drops a killer that is no longer alive, and kills run in slot order, so
   any victim whose killer died at a lower slot earlier in the same list loses its killer: mutual
   kills, a chain (C eats A while A eats B), a cloud whose maker died lower in the list. No change
   to the sim at Off or Start. The frame's kill log loses the entry; the death card reads "Eaten."
   with no killer. Fix: read each killer's uid before the first `kill` and pass the uid. **Open,
   for Task 15.**
3. **LOW, confirmed.** `Block::of` drops hidden genes past the 96-neuron room silently. The most
   inputs are 8 + 3 + 8 cones × 3 = 35; with 6 outputs that leaves 55 of `MAX_HIDDEN` 64 (eight
   cones is four paired eye genes). The dropped genes still mutate and are inherited and cost no
   upkeep. Deterministic. Impossible in M3 (worst case 92). **Comment fixed; the budget is the
   owner's.**
4. **LOW, confirmed.** `tp_set_part` expressed the body again but not the brain, so a test world
   given a port-declaring part did not reload (the activation count did not fit the block).
   **Fixed: the brain is expressed too.**
5. **LOW, confirmed.** At Off a body whose evolved trigger is above 0 "fires" at cost 0 and impulse
   0: the cooldown is set, `FLAG_DASH` flashes, a gland makes a cloud of drain 0 that is drawn and
   takes a pool place. No energy, velocity, or draw changes. Moot once the rules are on.
6. **LOW, confirmed, as the plan says.** `OUT_DASH` is declared by the flagellum size sum (P1), but
   A1 fires on `flag_push`, which is 0 for a flagellum at anchor 0.5 or less. Such a body carries a
   dead output and P4 spends its `part_wires` on it. A rule nuance for the owner: declare dash on
   `flag_push > 0`, or accept it. **Open.**
7. **LOW, confirmed.** With `debris_decay` 0 and `debris_min` 0, both in range, a piece eaten to 0 is
   never freed and the pool can fill. Off and Start are unaffected. Tried `<=`: it breaks the
   conservation test's accounting for no gain at the defaults, so it stays `<`. **Open, cosmetic.**
8. **Note.** The eye's jaw input is the raw `jaw_sum`, which can exceed 1; it is not scaled by
   `eye_gain` or held in 0 to 1 as the other two eye inputs are. This matches P1's words.

## Confirmed as written

K1 and J1 (steps 1 to 9, kills in slot order after the loop); D1 bit-identical at `shell_drag` 0; A1
to A3 (a full pool charges nothing, two uses exactly `ability_cooldown` apart, a lunge raises the
bite for 10 ticks); F1; P1's orders; P2's ids; P3's one draw only when `founder_jaw > 0`; P4's draw
order (kind, anchor, extra, input wires, output wires); X1, X2, T1. Every field under "State, all
saved" is in save, load, and the hash, in order; the scratch fields are true scratch. No new path
calls `rng`; the old motor arithmetic is unchanged; the debris pass is skipped on an empty pool. No
`HashMap` in `crates/sim`; every new pass runs in ascending slot, pool, or grid order. Energy is
created only by the corpse's `build_cost * mass` share (F1) and destroyed only where the plan allows
(spike hurt, toxin drain, ability costs, the lost corpse share, decay, the floor, a full pool). The
30 parameter rows match the plan.

## What was fixed from this audit (`main`, 2026-10-16)

- Item 1: `prune` gives a trigger output's resting gene the bias `starter_trigger_bias`, so a Jaw or
  gland that arrives by mutation or a cross rests closed as a founder's does. The three body
  outputs rest at 0 as in M3. Logged in `../decisions/INDEX.md` as provisional.
- Item 3: the comment at `Block::of` says what is dropped; `m4-ports.md` says four paired eye genes.
- Item 4: `tp_set_part` expresses the brain too.
