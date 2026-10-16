# M4 exit — Teeth

**Date:** 2026-10-16. **Head:** see "The final proof". Built from `../plans/2026-10-14-m4-teeth.md`
(approved 2026-10-15 at the recommended option of every choice, C9 at B), one task per agent in its
own worktree, merged one at a time by the orchestrator and checked against each claim. The owner's
instruction of 2026-10-16: every M4 rule ships on in the default world.

## Verdict

M4 is built and measured. Every rule of the plan is in the core, on by default, saved and loaded,
deterministic, drawn, and playable: jaws, spikes, shell plates, toxin glands; dash, lunge, and toxin
cloud; corpses that become debris that Filter mouths eat; the death freeze with a death card that
shows the killer's body, its generation, and its brain at the kill; ability buttons from the body's
parts; the first hunter marked when it kills in view. The gates read coexistence and the throughput
per creature-tick. The long gate passes every M2 and brain band on 5 of 5 seeds with the rules on.

The roadmap's exit sentence is not met and is the owner's finding: **predators and prey do not
coexist at 12,000 ticks on 3 seeds** at any value the rules allow. With the bite on, every lineage
becomes a hunter, because rule J1 pays a jaw from the first contact with anyone's young, rule K1
charges it mass and nothing else, and a hunter keeps its Filter. The mass ratio sets the pace of
the takeover (at 3.0, the shipped default, hunters are a fifth of the living at 12,000 and most of
it by 144,000, with prey persisting on one seed in three and a boom and bust on another); the guards,
a weaker bite, and a dearer lunge change nothing. The draft measured the same and named negative
frequency dependence as the need. That is a rule, and a rule change is the owner's.

"Being hunted by something that learned to dash is frightening and its cause is always shown": the
cause is shown (the card, the hurt flash on the side of the hit, the kill mark), the dash fires in
context (`dash_fire_ctx` 0.9 to 1.0), and "frightening" is the owner's playtest.

## What was built, by task

| Task | What | Where |
|---|---|---|
| 1 | `probe-encounter`: how often bodies meet and face each other at the M3 head | `m4-encounter.md` |
| 2 | The skeleton: four kinds, two pools, the kill path, format 9, ABI 7, 30 parameters at Off | `m4-rules.md` |
| 3 | Rule J1 the bite, D1 shell drag | `m4-rules.md` |
| 4 | Rule F1 debris | `m4-rules.md` |
| 5 | Rules A1 to A3 dash, lunge, toxin cloud; X2 the player's mask | `m4-rules.md` |
| 6 | The page draws the four kinds, debris, clouds, the three flags | plan Task 6 |
| 7 | The death card with the killer and its brain; `tp_set_part`, `tp_place`, `tp_generation` | plan Task 7 |
| 8 | The bench at each merge; Task 5's 8% found and fixed | `m4-rules.md` |
| 9 | Rules P1 to P4: ports, starter wiring, hunter founders | `m4-ports.md` |
| 10 | The motor stop: `probe-turn`, the fin arms, `fin_grip` 0.6 proposed | `m4-motor.md` |
| 11 | The predation measures, their proofs, `probe-hunt`, ns per creature-tick | `m4-gates.md`, `gates.md` |
| 12 | Switch on and retune: five trials, the rule-5 stop, the defaults | `m4-tuning.md` |
| 13 | Ability buttons and keys | plan Task 13 |
| 14 | Beat 11, the kill mark, the guide's chapters | plan Task 14 |
| audit | Mid-build audit at Off: a mutant trigger rests closed, `tp_set_part` expresses the brain | `m4-audit-1.md` |

## The final proof

Rows follow the run of `make check && make gates && make gates-long` at the final defaults.

ROWS_PLACEHOLDER

## Throughput

The fixed pre-Task-9 head read WASM about 2,830 at 1,394 bodies, 253 ns per creature-tick. The final
default world reads 2,440 at 1,540 bodies, 266 ns: the per-creature cost of the bite, the debris
pass, the triggers and the larger brains is about 5%, and the rest of the lower ticks per second is
a fuller world. Over the floor of 2,400, under the target of 2,600. Choice C9: the floor and the
reference population are the owner's (`m4-tuning.md` Part 2).

## The hunt as measured

See `m4-tuning.md`: part 1 (the switch-on), part 3 (five trials, the stop), the long read, part 2
(the jaw gap: evolution grows a jaw that bites, 0.2 to 1.0, and not one that cannot, 0.1 to 0.2),
part 4 (the gland fires, evolution keeps it on one seed in three). The encounter rows of Task 1 said
density would not be the limit, and it was not: the first contact kills.

## Open problems, sorted by who decides

**The owner:**

1. The takeover: a rule (negative frequency dependence, an obligate hunter, a jaw that costs more
   than its mass, or a Filter that a jaw weakens). Rule 5 of the retune stopped the trials; 7 of 12
   are unspent.
2. The bench at the floor and under the target (C9).
3. The predation bands: `flesh_late` 0.01 at 12,000 fails the shipped world (0.001 to 0.002);
   `hunt_hi` and `prey_lo` at 144,000 are unset; `hunt_lo` is not a gate.
4. The provisional entries of 2026-10-16 in `decisions/INDEX.md`: `fin_grip` 0.6, the 12,000-tick
   bands, the 144,000-tick bands, a mutant trigger resting closed, and the shipped set itself.
5. The budgets the plan named: the debris pool of 4,096 (13% used at 36,000), `MAX_NEURONS` 96
   against 35 inputs + 6 outputs + 64 hidden (a body with eight cones holds 55 hidden, not 64).

**Carried to M5 or later:**

- A victim whose killer died earlier in the same kill list gets no killer on the card.
- A frame written while the page holds every buffer loses that tick's kill marks.
- The guards do not spread; the gland fires out of context; the fin is not kept.
- The eye gap at 144,000 sits at its band on some seeds with every rule on.
- `OUT_DASH` is declared by the flagellum sum but fires on `flag_push`: a side flagellum carries a
  dead output.

## Owner checks

Not done by an agent. `make dev` in `tidepool/`, open the page it prints. The saved worlds are
rebaked with every rule on: `/?world=/m2-world.tdpl` (tick 36,000) and `/?world=/m2-world-long.tdpl`
(tick 144,000).

1. **See a hunt.** Open the long world. Bodies with two mandibles at the nose are hunters. Watch
   one close on a small body: the jaw snaps shut on the bite, the bitten body's membrane flashes
   red, a kill leaves a dull fleck of debris that Filter mouths eat.
2. **Be hunted.** Possess a small body near a hunter (click it). The energy ring flashes on the side
   of each hit. Press Space to dash. Is it frightening? Is the cause always shown?
3. **Die by a bite.** The card says "Eaten.", draws the killer with its jaw, its generation and
   swatch, its brain at the kill, and the strongest path in words. On a first death the heirs come
   first. Does the card make sense with no instructions?
4. **Hunt.** Possess a hunter. Lunge with F. Watch the jaw. Can you catch something?
5. **The first hunter.** `/?walk=reset`. The first kill in view in a life rings the killer for 2 s and
   the place for 1 s. Did you see a hunter before you were bitten? The playtest log records it.
6. **The guide** (G): chapters 1, 2, and 6 say what the four kinds, the hurt inputs, the triggers,
   and the hand-wired founders are. Is every sentence true to what you saw?
7. The M3 checks still open: 1 to 9 of `m3-exit.md`.
