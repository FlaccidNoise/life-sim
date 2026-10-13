# Handoff — Tidepool: the M3 plan is written and waits for the owner

**Date:** 2026-10-13
**Project:** life-sim, subproject `tidepool/`

The previous handoff (M2 is built, next is the audit and the M3 plan) is at
`git show cc0cc99:HANDOFF.md`. The draft in `src/` is frozen.

## Current Task

M2 (Bodies) is built and pushed. Its second audit is done and its findings are fixed or with the
owner. The plan for M3 (Minds) is written: `tidepool/docs/plans/2026-10-13-m3-minds.md`. **It is a
draft. Build nothing for M3 until the owner approves it.**

## Completed

- The owner answered the five checks of the M2 exit (`tidepool/docs/findings/m2-exit.md`, "The owner's
  answers"). Check 2 is done and closes the open half of the M1 exit. Check 3 is half done. Checks 1,
  4, and 5 are open.
- `make gates-long` reads seeds 1, 4, 5, 6, 8 (owner, 2026-10-12). 5 of 5 pass, in 10 minutes.
- A fresh-context audit of M2 at `cc0cc99`: `tidepool/docs/findings/m2-audit-2.md`. 0 High, 5 Medium,
  7 Low. The orchestrator ran its new readings again. The end of that file says what was checked and
  what was fixed.
- From the audit: two tests that were missing (`eye_cost` in the mass, and the two motion formulas
  against the motor), two columns in `probe-census` (`no_chemo`, `no_eye`), two health proofs on a
  living world, and seven doc lines.
- The long reading has a proof at the head: the chance input fails on 5 of 5 seeds (`gates.md`, "The
  long reading").
- The M3 plan, with six open choices and eleven soft spots.
- `make check` and `make gates` exit 0 at the head. No rule, band, floor, or default changed.

## Pending

In this order. Steps 1 to 3 need the owner.

1. **The owner approves or changes the M3 plan.** Six choices, each with options and a
   recommendation: C1 the rule of brain upkeep, C2 what "inputs come from parts" means, C3 where
   mixing goes, C4 what the gate reads, C5 shapes beyond ovals, C6 the three items carried from M2.
   The plan also lists eight differences from the roadmap and the design to approve.
2. **Three questions from the audit** (`m2-audit-2.md`, "Questions for the owner"). (1) Does R1 read
   the mean of a sense or the share of bodies that hold it? On seeds 1 and 3, 38% of bodies hold no
   chemoreceptor at tick 144,000. Read on to tick 288,000, seed 1 holds at a third to a half and
   seed 3 falls back to 8%. (2) Is a search worth it for a world that passes the short gate and
   fails the long one? The one candidate fails on 1 of 5 seeds. (3) The fin is in 26% to 36% of bodies
   at tick 144,000 on two seeds, which the decision to leave its strength to M4 did not know.
3. **The owner's checks that are open:** bodies visibly differ (check 1, the plan's choice C5), the
   dimmed view of a body with no eye (the other half of check 3), `/?bench` on a phone and a slower
   laptop (check 4), and the four felt judgments of `m1-feel.md` (check 5).
4. **Build M3 from the plan, after approval.** Batch A first. The method is in the plan and in
   "Context & Warnings" below.

## Open Questions

- Brains may stay small until M4: the M3 world has plants that never die and no hunter (soft spot 1 of
  the plan). The brain bands can then fail with the brain cost at 0, and the plan stops and goes to
  the owner.
- The default world passed the scent gap on seed 8 at tick 72,000 by 0.02 (0.12 against 0.10). The
  long gate reads tick 144,000, where it reads 0.16. The mean of one seed moves by 0.1 between two
  readings. The band is the owner's.
- `min_late` and `plants` low have rejected only worlds that `creatures` also rejects (`gates.md`).
- The old world sits at the throughput floor: 2,357 to 2,471 against 2,400 on four readings. Carried
  to M5. A larger brain costs throughput, and the plan budgets for it.
- `motor.rs:90` still holds the arithmetic of a deleted switch (audit finding L1). Fix it with the
  next change to the motor, and pin the gate rows again.
- Push rule conflict, still open. The root `AGENTS.md` says push at session end. The owner's global
  rules say push only when asked. Follow the owner's rules. Nine commits are local at this handoff, from `cc0cc99`. The remote is at `9a9a411`.

## Key Decisions

All in `tidepool/docs/decisions/INDEX.md`. Do not reopen one without new evidence.

- 2026-10-12: a part has no upkeep of its own. `plant_growth` is 0.03.
- 2026-10-12: the nine questions of the first M2 audit. No band, rule, or default changed.
- 2026-10-12: the owner's answers to the five checks of the M2 exit.
- 2026-10-12: `make gates-long` reads seeds 1, 4, 5, 6, 8.

## Relevant Files

| File | Notes |
|------|-------|
| `tidepool/AGENTS.md` | **Start here.** Commands, gotchas, status |
| `tidepool/docs/plans/2026-10-13-m3-minds.md` | The M3 plan. A draft until the owner approves it |
| `tidepool/docs/findings/m2-audit-2.md` | The second audit, the orchestrator's check, and what was fixed |
| `tidepool/docs/findings/m2-exit.md` | The M2 verdict, the rows, and the owner's answers |
| `tidepool/docs/roadmap.md` | The milestones, their exits, and what each carries from M2 |
| `tidepool/docs/design.md` | What the game is. §6 is brains, §5.6 is mixing |
| `tidepool/docs/gates.md` | Every gate, its bands, and the bad input that each band rejected |
| `tidepool/docs/decisions/INDEX.md` | Decisions |

## Context & Warnings

- Run `make` and `pnpm` from `tidepool/`. If `cargo` is not found: `. "$HOME/.cargo/env"`.
- `bd` (beads) does not start in this repo. Open problems live in the findings files.
- To see the game: `make dev` in `tidepool/`. The two evolved worlds are baked files that are not in
  git. Bake them in `tidepool/` with
  `target/release/tidepool-headless run --seed 1 --ticks 36000 --creatures 400 --plants 1200 --out public/m2-world.tdpl`
  and the same command with `--ticks 144000 --out public/m2-world-long.tdpl`. Then open
  `/?world=/m2-world.tdpl` or `/?world=/m2-world-long.tdpl`. The scroll wheel zooms.
- The snapshot `FORMAT_VERSION` is 7. Task 1 of the M3 plan makes it 8.
- One simulation run at a time. In zsh a variable that holds `--param a=b` is passed as one word and
  the command fails with "unknown flag". Write the flags out.
- A chain of commands ends with the exit code of its last command. Echo the exit code of each step.
- A script that edits a doc must check that its anchor matches exactly once, and the staged diff must
  be read before the commit.
- Build agents run one per task, each in its own worktree. Each brief starts with
  `git merge --ff-only main` and a check of the head hash, and bans `cargo fmt --all` and `make fmt`.
  The orchestrator checks each claim before it takes a commit: `make check`, the gate rows digit for
  digit, and one broken rule to see a test fail.
- **A subagent cannot write a findings `.md` file in this harness.** The auditor's write was blocked.
  Ask an auditor to return its report as text, and save it from the reply.
- The auditor's worktree is still on disk: `.claude/worktrees/agent-a46573dd7990c0b98`, clean, at
  `cc0cc99`. Remove it with `git worktree remove` when the owner agrees.
- Timings on this machine are noisy. Record the load average next to each one.

## Suggested Next Steps

1. Read `tidepool/AGENTS.md`, then the plan, then `m2-audit-2.md` from "The orchestrator's check".
2. Get the owner's answers to the six choices and the three questions.
3. Change the plan to match, log each choice in `decisions/INDEX.md`, and start batch A.
