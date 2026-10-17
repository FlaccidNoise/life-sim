# The audit of parts (Task 1 of the parts plan, 2026-10-16)

The owner's principle: every part has a benefit and a cost, does one job, and works with others
(`../decisions/INDEX.md`, 2026-10-16). Read from the code at `633f3cd` by a fresh-context
`auditor` (read-only); the orchestrator checked findings 1 (`creature.rs` `directions`, `motor.rs`
jaw cones add the full size per cone), 5 (corrected: over 0.75, not at it), and 7 (`genome.rs`
`SIZE_RANGE` index 3 is (0.2, 1.0)). Every
claim cites the code. Each fix below is a rule change: the owner's.

**No part is free as a whole.** Every part's size adds to the body's mass (`creature.rs` `plain_sum`
and `eye_sum`), and mass sets basal upkeep (`energy.rs` `life`), build cost (`repro.rs`), and the
heft that slows thrust and dash (`motor.rs`, `ability.rs`). The findings are about one feature of a
part.

| Part | Benefit | Cost | Works with | Finding |
|---|---|---|---|---|
| Flagellum | Thrust, turning with thrust, turning at rest from a side flagellum; declares the dash | Mass; `move_cost` on thrust; dash cost | Heft; the founders' hurt-to-dash wire | Turning is free (2). A side flagellum with no push declares a dash that never fires (8) |
| Cilia | Thrust, turning at rest | Mass; `move_cost` on thrust | Heft | Turning is free (2) |
| Filter | Eats plants and debris by contact, `(1 − diet)^k` | Mass | Diet, area | A carnivore cannot shed it: its size gene stops at 0.2 (7). A carnivore cannot eat debris either: debris shares the Filter's budget |
| Chemo | Three scent inputs; size scales the gain | Mass | The scent field | Any size above 0 gives the inputs, and a brain weight can make up for a small one (9) |
| Fin | Turning at speed, less slip | Mass | Forward speed | Turning is free (2). Measured as a dead part at 144,000 (M4) |
| Eye | Three inputs per cone; range from size and length | Mass × `eye_cost` | Body length; sees other bodies' jaws | A pair is two full cones for one size (1). Cone width is free (10) |
| Jaw | The bite, `diet^k`, down the food chain; declares the lunge (until Task 2) | Mass; lunge cost | Diet, the gap, the mass ratio, the prey's guards | Bite and push, two jobs (Task 2 removes the push). A pair puts two cones on one prey (1) |
| Spike | Hurts a biter | Mass | The biter's jaw | A pair counts twice (1). It hurts by the bite even when a shell blocked it (6) |
| Shell | Blocks a share of a bite | Mass; forward drag | The biter's jaw | A pair blocks twice and drags once (1). Drag keeps rising after the block stops at 1 (6) |
| Toxin | A cloud that drains others; kills credited | Mass; cost; cooldown | The maker's length sets the radius | Cost does not grow with the gland's size (3) |
| len, wid | Area: mouth, bite, store, mass ratio, eye range | Upkeep through mass; turning inertia (length only) | Every part | Width adds area with no turning cost (low) |
| egg | Cheaper children | A longer, costly youth | — | Its range tops out at the founder value, so it can only shrink (a note) |
| old | A longer life | Upkeep rises with it | The age input | None |
| hue | Mate kin input, lineage colour | None | Mixing | A neutral marker, by design |
| diet | Bite factor and rank on the food chain | Filter factor; gut upkeep (rule G1, after Task 3) | Jaw, Filter | Rank makes `diet` over 0.75 immune to every bite (5) |

**Free systems of the body:** the hurt sense and its side, speed, energy, age, the mate senses, and
the outputs thrust, turn, and accept are free; only the wires that use them cost (`conn_upkeep`).

## Findings for the owner, most important first

1. **A mirrored pair gives a double benefit for one cost.** Jaws, eyes, spikes, and shells: a gene
   off the midline makes two cones or guards, each with the full size, while the mass counts it once
   (`creature.rs` the expression of pairs; `motor.rs` the jaw cones). A jaw that mutates off the nose
   can double its bite. Fix: half the size per cone of a pair.
2. **Turning costs no energy.** Upkeep reads thrust only (`energy.rs` `life`), so side flagella,
   cilia, and fins turn for their mass alone. Fix: a `turn_cost` on the turn command.
3. **Ability costs grow with the body's area, their effect with the part's size** (`ability.rs`). A
   larger flagellum, jaw, or gland gets more per use at the same price. Fix: cost by part size.
4. **Mass is armour.** Every part's mass counts toward the bite's mass ratio, so dead mass protects a
   body and helps a jaw pass the ratio. A note, not a fix: it may be the right trade.
5. **The food chain makes meat eaters over `diet` 0.75 immune to every bite** (rule D2, the gap 0.25:
   a biter needs a diet 0.25 higher, and none is over 1). Apex predators with no predator but toxin. It bears on the shape: carnivores can only be
   thinned by hunger. Fix, if wanted: let the mass ratio alone guard the top of the chain.
6. **Spike and shell are not even.** A spike hurts by the bite even when a shell blocked all of it
   (`bite.rs`), and a shell's drag keeps rising after its block stops at 1 (`motor.rs`). Fix: hurt by
   what was taken; clamp the shell's size.
7. **A carnivore cannot shed its Filter.** The Filter's size gene stops at 0.2 (`genome.rs`
   `SIZE_RANGE`), so a body at `diet` 1 carries a mouth that takes nothing; only the rare remove
   mutation (0.02) drops it. Fix: let the Filter's size reach 0.
8. **A side flagellum declares a dash that never fires**: the trigger is declared on any flagellum,
   but the dash pushes only along the heading. Fix: declare the dash on forward push only.
9. **Chemo's inputs are full at any size.** Fix: noise or a floor by size.
10. **An eye's cone width is free.** Fix: range falls as width grows.

Not confirmed from the code: the fin as a dead part (a measurement of M4), and herbivores keeping
jaws for the lunge (the plan's guess; Task 2 removes the lunge from the jaw).
