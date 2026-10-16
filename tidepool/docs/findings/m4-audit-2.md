# M4 exit audit — fresh context, read-only

**Date:** 2026-10-16, at `224e723` to `20f83f1`, by a fresh-context auditor that read the plan, the
roadmap, the decision log, then the findings as claims, then the code. No build, test, or
simulation. Saved by the orchestrator from the reply; what was done about each item is at the end.

## Verdict

M4 can close as "built and measured, with open problems" once the exit record matches its rows.
Before the owner sees it: correct "5 of 5" and "targets 3 and 5 met" to 3 of 5 on the eye gap with
the gland on; rebake both worlds and read `bite_rate` 0.5 back from each; replace "not met at any
value" with the band-level reading; fix the two false `gates.md` sentences; run the three rejection
proofs with the bands set and record their exit codes; restate the rule-5 stop with the levers it
left untried.

## Findings, most severe first

1. **High, confirmed. The shipped world fails the long gate on 2 of 5 seeds.** The exit draft and the
   decision log said every M2 and brain band passes 5 of 5 and targets 3 and 5 are met. That 5 of 5
   is the long read with the gland off. With the gland on, `eye_gap` reads 0.080 on seed 6 and
   0.082 on seed 8, under 0.10. The runs are deterministic, so "noise, read again" does not hold:
   `make gates-long` exits 1 on those seeds. Target 5 is not met with every rule on.
2. **High, confirmed. The baked worlds had every M4 rule off** (dated 2026-10-15 23:10, three hours
   before the defaults commit; `bite_rate` 0, `founder_jaw` 0, `corpse_share` 0, `toxin_drain` 0,
   `fin_grip` 0.3 in both files). `World::load` restores the parameters stored in the snapshot, so
   `/?world=` would play without predation.
3. **High, confirmed. "Not met at any value the rules allow" outruns the rows.** At ratio 3.0 the
   12,000-tick rows pass `hunt_hi`, `prey_lo`, and `kills_late` on 3 of 3 and fail only `flesh_late`
   0.01, a band set before any good world was read; any value down to 0.001 still rejects the bad
   world. Coexistence fails at 144,000, the plan's stricter reading.
4. **Medium, confirmed. The rule-5 stop says more than five trials show.** T1 and T2 moved the
   takeover; T3 and T4 ran at ratio 1.15 where prey is gone by 12,000; T5 halved one seed's hunters
   and was not run to 144,000. Untried: guards at ratio 3 or at 4.0, `founder_jaw`, `corpse_share`,
   a wider range for the ratio (3.0 and `fin_grip` 0.6 both sit at the top of their ranges). At
   ratio 3 a founder hunter cannot bite a founder newborn (88 against 3 × 38), so "a payoff from
   the first contact with anyone's young" describes the ratio-1.15 world.
5. **Medium, confirmed. `eye_gap` changed meaning in M4.** The eye's jaw input is not scaled by
   `eye_gain`, so the blind arm of `gate-evolve` still sees teeth and its flee wires still work.
   `gates.md` still says `eye_gain=0` takes away every eye input. This bears on item 1. Scaling the
   jaw input is a rule change, the owner's; or write what the gap now measures.
6. **Medium, confirmed. No predation gate had rejected a bad input with its bands set:** every
   bad-world row printed PASS, since those runs had no `--predation` and the bands were unset; the
   long dead-jaw arm ran before the long bands were set. Run the proofs with the flag.
7. **Medium, confirmed. `gates.md` said the predation bands are not in `make gates-long`;** the
   Makefile passes `--predation` there. `make gates` and CI judge no predation band, against choice
   C6's 12,000-tick reading in CI.
8. **Medium, confirmed. The jaw-gap claim fails on 1 seed of 3** (seed 2: 0.17 with the bite on,
   0.18 dead): say "2 of 3".
9. **Medium, confirmed. The context claims have no baseline:** `*_fire_ctx` was quoted without
   `*_think_ctx`; with 78% to 100% of bodies carrying a jaw, teeth are almost always in view, and the
   hand wiring makes the result true by construction. "The bite is good for the nose" rested on one
   seed per arm.
10. **Medium, confirmed. Docs a fresh reader would misread:** the plan's header still said "Draft";
    Task 12 parts 2 and 4 and Task 14 were done and unticked; Task 6 has no `m4-look.md` and no
    draw timing; Task 7's real-death browser check has no record; nobody had seen a real `died`
    card, the new kinds, debris, or clouds on a live page; `AGENTS.md` said M4 "is being built".
11. **Low, confirmed.** A killer that died earlier in the same kill list is missing from the card:
    "cause always shown" holds for the cause line only.
12. **Low, confirmed. Small items.** The guide leaves out the mass ratio, which decides most bites at
    3.0; a side flagellum gets a Dash button that never fires; beat 11's `bitten` also fires on a
    toxin drain and on the player's own spike hurt; with 78% to 100% hunters, "hunter in view" is
    nearly always true; the `evolve.rs` comment said dead jaws drift to 0.71 where the log says 0.96;
    the bench pass is one reading 1.7% over the floor on a machine that swings 10%; the narrative
    reads prey from `probe-hunt` seeds 1, 2, 3 while the gate reads 1, 4, 5, 6, 8.
13. **Low, plausible.** Cross-target (native against WASM) equality of bites at ratio 3 and of clouds
    is not shown: the hash test runs 2,000 ticks at the defaults, where debris and dashes occur and
    bites and clouds may not.

Clean, confirmed: the prune bias fix and the corpse guard; J1, D1, A1 to A3, F1, P1 to P4, X1, X2,
T1 at the defaults apart from the recorded departures; every test pin added with the defaults
states an assumption and hides no behaviour change; save, load, and determinism unchanged; the death
card's states; no string in `src` says "learned" or "wants".

## Roadmap check

| M4 item | Status |
|---|---|
| Four kinds, three abilities | Built and firing. Guards and gland are not used by evolution |
| Facing and defended arcs | Met |
| Energy-conserving transfers | Unit tests only; a founder's corpse creates energy (F1, by design) |
| Fin strength | Measured; 0.6 provisional; the fin is kept in neither arm |
| Corpses become debris that Filters eat | Met |
| Death freeze and death card | Built; see the browser check below |
| Exit: coexist at 12,000 on 3 seeds | 3 of 4 set bands pass; `flesh_late` 0.01 fails; not met at 144,000 |
| Exit: "learned to dash" | Not measured: only hand wiring fires, no dash-dead arm was run |
| Exit: cause always shown | The cause line, yes; the killer's body is missing when the killer dies in the same tick |
| Exit: frightening | Owner check |
| The owner's 2026-10-16 instruction | A feature that fails its measurement stays on |

## What was done about it (`main`, 2026-10-16)

- Items 1, 3, 4, 8, 9, 12 (the comment): the exit record, `m4-tuning.md`, and the decision log now say
  what the rows show.
- Item 2: both worlds rebaked at the final defaults in the final proof.
- Items 5 and 7: `gates.md` corrected; the eye gap's new meaning written; scaling the jaw input is
  listed for the owner.
- Item 6: the three rejection proofs run with `--predation`, exit codes in `gates.md`.
- Item 10: the plan's header, the boxes, `AGENTS.md`; the browser checks of Tasks 6, 7, and 14 done
  on the rebaked long world and recorded in `m4-exit.md`.
- Items 11, 12 (the rest), 13: in the open list of `m4-exit.md`.
