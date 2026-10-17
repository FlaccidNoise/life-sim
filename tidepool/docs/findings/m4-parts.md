# M4 retune 2 — parts and the diet's middle: rows

The plan is `../plans/2026-10-16-m4-retune-parts.md` (approved 2026-10-16 at every recommended
option). Each trial's hypothesis is committed here before its run. One run at a time.

Target (P4 A): at tick 144,000, at the end of the run, omnivores at most 0.50 of the living, plant
eaters (`diet` under 0.3) and meat eaters (over 0.7) 0.10 or more each, on 4 of 5 seeds (1, 4, 5,
6, 8).

## Built

- Task 1: `parts-audit.md` (`2440bac`).
- Task 3, rule G1, two guts cost upkeep, off (`7745fc6`).
- Task 2, the lunge folds into the dash (`625dd23`): a Jaw declares no trigger; a dash by a body with
  a Jaw bites `strike_bite` times harder for `strike_ticks`. Format 12, ABI 10. Every founder has a
  Flagellum, so the founder hunters strike; their flee and their strike now share one cooldown.

## Baseline: the shipped diet set with Task 2, `gut_upkeep` 0 — expectation before the run

Not a trial. Expected: herbivores lose the free burst a jaw gave them, so `herb_jaw` falls; hunters
lose a separate lunge cooldown, so kills may fall a little. The diet shape near the diet retune's
T8: omnivores 0.57 to 0.83 at 144,000.
