# Handoff — Tidepool: the M2 plan waits for the owner's approval

**Date:** 2026-10-11
**Project:** life-sim, subproject `tidepool/`

The previous handoff (M0 and M1 built, owner checks due) is at `git show 8b90680:HANDOFF.md`. The draft
in `src/` is frozen.

## Current Task

The plan for M2 (Bodies) is written: `tidepool/docs/plans/2026-10-11-m2-bodies.md`, 14 tasks in 6
batches. **Nothing is built from it. It needs the owner's approval first.**

## Completed

- The owner played M1. Swimming felt good. No bud was seen and no heir was offered, so the "continue as
  a descendant" half of the M1 exit is not met (`tidepool/docs/findings/m1-exit.md`).
- The owner decided the five rule questions. All five are in `tidepool/docs/decisions/INDEX.md`.
- `main` is pushed. CI passed on a side branch first, then on `main`. The native build on x86-64 gives
  the hashes of the `.wasm`.
- One `?bench` reading from the owner: 4,157 ticks per second at 1,537 creatures. It is from the
  reference machine.

## Pending

1. **The owner approves or changes the M2 plan.** It asks for a yes on seven differences from the
   roadmap and the design. They are listed near its top.
2. Build M2 from the plan: an orchestrator dispatches one task per agent. Task 1 pushes a side branch
   to prove that CI can fail.
3. Owner checks that are still open: `?bench` on a phone and on a slower laptop, and the four felt
   judgments of `tidepool/docs/findings/m1-feel.md` one by one.

## Open Questions

- **Push rule conflict, still open.** The root `AGENTS.md` says push at session end. The owner's global
  rules say push only when asked. The plan commit of this session is not pushed.
- **Will eyes pay with no predator in the world?** The plan gates it and names what happens if they do
  not (soft spot 3).
- **Does the size rule hold?** Rule S2 of the plan is arithmetic, not a measurement (soft spot 2).

## Key Decisions

All in `tidepool/docs/decisions/INDEX.md`, dated 2026-10-11:

- Scent grazing is tuned with numbers inside the M2 retune, after a probe. A rule is the fallback.
- Possessing a creature also marks its living descendants.
- Body size gets a real tradeoff.
- The push between two bodies is split by mass.
- Brain upkeep stays a fixed cost per neuron in M2. M3 decides the rule.

## Relevant Files

| File | Notes |
|------|-------|
| `tidepool/docs/plans/2026-10-11-m2-bodies.md` | **Start here.** The rules, the switch-on rule, 14 tasks, soft spots |
| `tidepool/docs/decisions/INDEX.md` | The five decisions |
| `tidepool/docs/findings/m1-exit.md` | The owner play check and the first CI run are at the end |
| `tidepool/docs/gates.md` | The CI note and the owner's bench row |
| `tidepool/AGENTS.md` | Commands and gotchas |

## Context & Warnings

- Run `make` and `pnpm` from `tidepool/`. If `cargo` is not found: `. "$HOME/.cargo/env"`.
- `bd` (beads) does not start in this repo. Open problems live in the findings files.
- The plan's "switch-on rule": until its Task 10, `gate-health` must print the M1 rows digit for digit
  after every merge. A changed digit means a task changed a rule it was not asked to change.
- Parallel tasks run in separate git worktrees, not in one shared tree.
- A dev server may still run on port 5199 from this session.

## Suggested Next Steps

1. Read the top of the plan to "The switch-on rule", then "Known soft spots" at the end.
2. Approve it or change it.
3. Start a build session as the orchestrator, with Tasks 1 and 2.
