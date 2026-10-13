# Handoff — Tidepool: M2 is built and pushed. Next: close the M2 exit, audit it, and plan M3

**Date:** 2026-10-12
**Project:** life-sim, subproject `tidepool/`

The previous handoff (the M2 plan waits for approval) is at `git show 67f476f:HANDOFF.md`. The draft in
`src/` is frozen.

## Current Task

M2 (Bodies) is built from `tidepool/docs/plans/2026-10-11-m2-bodies.md` and pushed. `make check`,
`make gates`, and `make gates-long` all exit 0 at commit `9a9a411`. Milestones M3 to M8 of
`tidepool/docs/roadmap.md` are not started. The next milestone is M3 (Minds), and it has no plan yet.

## Completed

- The M2 rules, the grazing rule, and the tuned defaults (`tidepool/docs/findings/m2-tuning.md`).
- A fresh-context audit (`m2-audit.md`, at commit f5b7381). It found that evolution removed the senses
  by tick 144,000.
- The cause, measured: the upkeep of a part (`m2-senses.md`). The owner chose to delete that rule.
  `part_upkeep` and four switches left at 1 are deleted. `plant_growth` is 0.03.
- On 10 seeds at tick 144,000 every world keeps both senses, and no body is without one.
- The failure proofs of `gates.md` ran again at the new defaults. Every band has rejected a bad input.
- The owner decided the nine questions of the audit. Built from them: `make gates-long` (the evolution
  gate at tick 144,000 on seeds 1, 5, 8, for each milestone exit, 7 minutes), and `speed` and `area` in
  the row of `gate-evolve`. The rest is carried to M3, M4, and M5 in `roadmap.md`.
- `architecture.md`, `roadmap.md`, `design.md` §6, and `tidepool/AGENTS.md` match the head.
- The exit record: `tidepool/docs/findings/m2-exit.md`.

## Pending

In this order. Steps 1 and 2 need the owner. Step 3 can run while the owner answers.

1. **Close the M2 exit with the owner.** The five owner checks are at the end of `m2-exit.md`. On
   2026-10-12 the owner looked at the fresh game and at two evolved worlds and said "everything
   honestly looks really good". The owner did not answer the checks one by one. Ask once which of the
   five are done: (1) bodies visibly differ, (2) play from a fresh page, see a bud, die, and continue
   as a descendant, (3) the dimmed view with and without eyes, (4) `/?bench` on a phone and a slower
   laptop, (5) the four felt judgments of `m1-feel.md`. Check 2 also closes the open half of the M1
   exit. Record the answers in `m2-exit.md` and in `roadmap.md`.
2. **One open question for the owner: the seeds of `make gates-long`.** They are 1, 5, 8. In the old
   bad world seeds 5 and 8 failed at tick 36,000 too. Seeds 4 and 6 passed at tick 36,000 and failed
   only at tick 144,000, so they test what the long gate is for. Recommendation: add 4 and 6. Run the
   new seed list once before it becomes the target (`gates.md`, "The long reading").
3. **A fresh-context audit of M2 at the head.** Rule 5 of the roadmap asks for one at each milestone.
   None has run since the part upkeep was deleted. Scope: the claims of `m2-exit.md` and `m2-senses.md`
   against their probes, the proofs of `gates.md`, and the code of commits `d9c62d2` to `9a9a411`. The
   report goes to `tidepool/docs/findings/m2-audit-2.md`. The auditor fixes nothing.
4. **The M3 plan (Minds).** Write `tidepool/docs/plans/<date>-m3-minds.md` in the form of the M2 plan.
   Build nothing until the owner approves it. Inputs are listed under "What M3 starts from" below.
5. Then build M3 through its exit, by the same method as M2.

## What M3 starts from

- The scope: `roadmap.md` M3, and `design.md` §6 (brains) and §5.6 (mixing).
- Brain upkeep is a fixed cost per neuron and per connection in M2, and M3 decides the rule (decision
  of 2026-10-11). `neuron_upkeep` 0.0012 and `conn_upkeep` 0.0003 are 6 times their first values, and
  body length holds on them. A new rule of brain upkeep will move the body, so M3 retunes.
- Carried from M2 (`roadmap.md`, decision of 2026-10-12): the size band reads length alone while the
  area falls (72 for a founder, 33 to 45 at tick 144,000), the egg gene sits at the top of its range,
  and `plans` and `speed_cv` have no band.
- Eyes feed four fixed brain inputs in M2. Inputs and outputs declared by parts arrive in M3.
- `repro.rs` draws the genome of a child, and its history ids, before it knows that the parent can pay
  (`m2-audit.md`, finding L9). Ids stay unique, so crossover by history id still works.
- Risk R1 bit M2 once: a costed trait that rarely pays is stripped. The same risk applies to neurons.
  Lower the cost before adding mechanisms.
- Evolution only in v1. Within-life learning is a later Lab toggle (decision of 2026-10-09).

## Open Questions

- An old world is under the throughput floor: 2,357 against 2,400 at tick 108,000, timed on a busy
  machine. Carried to M5. A larger brain in M3 costs throughput, so the M3 plan must budget for it.
- Speed falls from tick 36,000 to tick 144,000 (0.85 to 1.15, then 0.73 to 0.99). The gate prints it
  with no band. The owner judges by eye whether the old world still looks alive.
- At tick 36,000 on seeds 1 to 10 the evolution gate reads 9 of 10: seed 7 fails the eye gap at 0.097
  against 0.10. The gate seeds 1, 2, 3 pass.
- Push rule conflict, still open. The root `AGENTS.md` says push at session end. The owner's global
  rules say push only when asked. Follow the owner's rules.

## Key Decisions

All in `tidepool/docs/decisions/INDEX.md`. Do not reopen one without new evidence.

- 2026-10-11: the fallback rule for grazing is built. A bite cannot take a plant under its death
  reserve.
- 2026-10-12: the M2 retune closed at trial 8 of 12.
- 2026-10-12: a part has no upkeep of its own. It costs through its mass alone.
- 2026-10-12: `plant_growth` is 0.03.
- 2026-10-12: the nine questions of the M2 audit. No band, rule, or default changed.

## Relevant Files

| File | Notes |
|------|-------|
| `tidepool/AGENTS.md` | **Start here.** Commands, gotchas, status |
| `tidepool/docs/findings/m2-exit.md` | The verdict, the rows, the nine decisions, the owner checks |
| `tidepool/docs/roadmap.md` | The milestones, their exits, and what each carries from M2 |
| `tidepool/docs/design.md` | What the game is. §6 is brains |
| `tidepool/docs/architecture.md` | Stack, budgets, layout. §12 is the agent tiers |
| `tidepool/docs/plans/2026-10-11-m2-bodies.md` | The form that the M3 plan follows |
| `tidepool/docs/findings/m2-senses.md` | Why the senses were lost, trials 11 to 13, the rows on 10 seeds |
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
- The snapshot `FORMAT_VERSION` is 7. A world file baked before 2026-10-12 does not load.
- One simulation run at a time. In zsh a variable that holds `--param a=b` is passed as one word and
  the command fails with "unknown flag". Write the flags out.
- A chain of commands ends with the exit code of its last command. Echo the exit code of each step.
- A script that edits a doc must check that its anchor matches exactly once, and the staged diff must
  be read before the commit. The M2 session committed a 39.5 MB `gates.md` by skipping both, and
  amended it before any push.
- Build agents ran one per task, each in its own worktree. Each brief started with
  `git merge --ff-only main` and a check of the head hash, and banned `cargo fmt --all` and `make fmt`.
  The orchestrator checked each claim before it took a commit: `make check`, the gate rows digit for
  digit, and one broken rule to see a test fail.
- Timings on this machine are noisy. Record the load average next to each one.

## Suggested Next Steps

1. Read `tidepool/AGENTS.md`, then `m2-exit.md`, then `roadmap.md` M3 and `design.md` §6.
2. Ask the owner the two questions of Pending 1 and 2 in one message.
3. Start the fresh-context audit of Pending 3.
4. Write the M3 plan and bring it to the owner.
