# Handoff — Tidepool: M0 and M1 are built, the owner checks are due

**Date:** 2026-10-10
**Project:** life-sim, subproject `tidepool/`

The previous handoff (planning done, build starts at Task 1) is at `git show 9a40c2a:HANDOFF.md`. The
draft in `src/` is frozen.

## Current Task

M0 (foundation) and M1 (first swim) of Tidepool are built from the 20-task plan, audited, and committed
on `main`. Nothing is pushed. The next work is the owner's: the play check, five rule questions, and
then the plan for M2 (Bodies).

## Completed

- All 20 tasks of `tidepool/docs/plans/2026-10-10-m0-m1-first-swim.md`, one sub-agent per task, each
  checked by the orchestrator before its commit.
- `make check` exits 0: 135 Rust tests, 71 Vitest tests, Clippy, both format checks, the type check,
  ESLint, and the crate-count check.
- `make gates` exits 0. WASM 3,757 and native 4,381 ticks per second at a mean of 1,539 creatures,
  against a floor of 2,400. The health gate passes 3 of 3 seeds at 12,000 ticks.
- Two fresh-context audits (M0 and M1). Every gate rejected a staged bad input in front of the auditor.
- The page: Watch with zoom and pan, click to possess, keys and pointer steering, hand-back to the
  brain, death overlay with heir pick, `?debug`, `?bench`.

## Pending

1. **Owner checks** (`tidepool/docs/findings/m1-exit.md`, "Owner checks"):
   - `/?bench` on a phone and a mid-range laptop. Record both lines in `tidepool/docs/gates.md`.
   - Five minutes of play with no instructions. Answer the four "not judged" questions in
     `tidepool/docs/findings/m1-feel.md`.
   - Say whether you could swim, eat, bud, die, and continue as a descendant. The orchestrator could not
     do the last two steps unassisted.
2. **Five rule questions** (`m1-exit.md`, "Open problems"): grazing that follows scent thins the world,
   who counts as an heir, bodies shrink to the gene floor, the push between bodies ignores mass, and
   brain upkeep is flat.
3. **Push.** See Open Questions.
4. **Plan M2** from what M1 measured.

## Open Questions

- **Push rule conflict, still open.** The root `AGENTS.md` says push at session end. The owner's global
  rules say push only when asked. The build session did not push. The first push runs the Tidepool CI
  workflow for the first time. Not confirmed: that the native build on x86-64 gives the same hashes as
  the `.wasm`, and that a shared runner clears the CI floor of 800 ticks per second.
- **Is a 24,000-tick skip long enough?** M1 measured about 11 generations per skip, not the 30 that the
  design assumed. Body size is at the floor of its range after the first skip, so a second skip has
  nothing visible left to move.
- **Does the scent sense pay?** The world holds more creatures at 36,000 ticks with the sense switched
  off. The health gate passes with it off.

## Key Decisions

All in `tidepool/docs/decisions/INDEX.md`. Made during the build:

- The throughput gate times the `.wasm` in Node, not the native binary. Native read 1.46 times WASM.
- The throughput benches time the default world after 12,000 ticks of settling. The seeded 3072 by 1536
  world of the plan does not hold its population.
- Two tuned defaults: `plant_growth` 0.02 and `intake_rate` 0.08. Every other default is arithmetic.
- No rule was changed for an audit finding. The five rule questions wait for the owner.

## Relevant Files

| File | Notes |
|------|-------|
| `tidepool/docs/findings/m1-exit.md` | **Start here.** Verdict, numbers, what confused a stranger, open problems, owner checks |
| `tidepool/docs/findings/m1-audit.md` | The fresh-context audit: 13 findings, what the gates cannot see |
| `tidepool/docs/findings/m1-tuning.md` | The 5 trials, and what is fragile in the tuned world |
| `tidepool/docs/findings/m1-skip-drift.md` | The first read of the game's premise |
| `tidepool/docs/findings/m1-feel.md` | Steering measurements. Every felt judgment is "not judged" |
| `tidepool/docs/gates.md` | Every gate, its proof, and the throughput readings |
| `tidepool/AGENTS.md` | Commands and gotchas |

## Context & Warnings

- Working tree is clean. Branch `main`. Nothing from this build is pushed.
- Run `make` and `pnpm` from `tidepool/`. If `cargo` is not found: `. "$HOME/.cargo/env"`.
- `make dev` starts the page. Add `?debug` for the readout and the dev handle `window.__tidepool`.
- `bd` (beads) does not start in this repo: it reports a database that belongs to another repository.
  No issues were filed. The open problems are in `m1-exit.md`.
- A second Vitest run that starts while another is loading its config can fail with "failed to load
  config". A rerun passes. Agents that share a tree hit this.
- Sub-agents that share one working tree must be told which files belong to the others, and must not
  run `cargo fmt --all` or `make fmt`.

## Suggested Next Steps

1. Play it: `cd tidepool && make dev`. Then read `tidepool/docs/findings/m1-exit.md`.
2. Decide the five rule questions and the push.
3. Start a planning session for M2 with the findings files as its input.
