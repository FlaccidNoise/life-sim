# Handoff — Tidepool: M4 (Teeth) is being built

**Date:** 2026-10-15, late. **Project:** life-sim, subproject `tidepool/`. The draft in `src/` at the
repo root is frozen.

The previous handoff (M3 closed, waiting for the owner) is at `git show cac3ded:HANDOFF.md`.

## State

- Branch `main`. Pushed to `020f351` on 2026-10-15 after the M3 close, with the owner's yes. Every
  later commit is local. **No push until the M4 exit or the owner asks** (the plan's rule; the one
  mid-plan push at `020f351` was a deviation, noted).
- The owner answered the M3 close on 2026-10-15 with "yes to all": the six provisional entries are
  confirmed, the long gate's `variety` band reads `variety_wired` (proven: frozen world 0/3, long gate
  5/5), look 4 is the only draw, the M4 plan is approved at the recommended option of every choice
  with C9 at B. Owner checks 1 to 9 of `m3-exit.md` stay open: an agent never closes them.
- M4 is built from `tidepool/docs/plans/2026-10-14-m4-teeth.md`, one task per agent in its own
  worktree, the orchestrator merging one at a time and checking each claim. Done and verified on
  main: Tasks 1, 2, 3, 4, 5, 6, 7, 8, 13. The gate rows stayed identical to the M3 exit, digit for
  digit, through every merge (the switch-on rule). The checkboxes in the plan say what was measured
  at each.
- Task 8 found Task 5 cost 8% of a tick at Off (four stores per body per tick); fixed at `7b8c74f`,
  A/B'd to within 1.5%. **The "before" of every throughput reading from Task 9 on is `7b8c74f`:
  WASM about 2,830 at 1,394 bodies.** A single bench reading swings 10% with load on this machine:
  read a task's cost by an interleaved A/B in one sitting.
- In flight when this was written: Task 9 (ports, starter wiring, hunter founders; ends the switch-on
  rule) in `../life-sim-wt-m4-t9`, and Task 14 (walkthrough beat 11, the guide) in
  `../life-sim-wt-m4-t14`. If a worktree is there with an unmerged commit, read its branch before
  redoing anything.
- The saved worlds `tidepool/public/m2-world.tdpl` and `m2-world-long.tdpl` (gitignored) were rebaked
  at snapshot format 9 on 2026-10-15: seed 1, 400 founders, 1,200 plants, 36,000 and 144,000 ticks.

## What comes next, in the plan's order

1. Merge Task 9; run its baseline rows (`gate-health`, `gate-evolve`), the 10-seed sense reading
   (`gate-evolve --seeds 1,2,3,4,5,6,7,8,9,10`; fewer than 9 of 10 stops and reports), and an A/B
   bench against `7b8c74f`. Write `docs/findings/m4-ports.md`.
2. Task 10, the motor stop (fin and dash). Its proposal is provisional, owner to confirm.
3. Task 11 gates and probes, Task 12 switch-on and retune (stage 1, then the toxin stage 2).
4. Redo after Task 9, with a real hunter: Task 6's screenshots and draw timing (`m4-look.md`),
   Task 7's browser check of a real death by a bite, Task 14's first-death check.
5. Task 15, the M4 exit: a fresh-context audit, then the owner.

Hard stops stay the owner's: a change to a band, a rule, the floor, or the reference population;
deleting a feature; a target unmet after its trial cap; `kills_late` 0 on any seed at switch-on; a
void bench; any push.

## Warnings

- One simulation at a time. Agents do not run gates or benches; the orchestrator does, after the
  merge. Write each `--param` out, echo exit codes, record `uptime` beside every timing.
- `run` needs `--creatures 400 --plants 1200` for the default world.
- `/private/tmp` does not survive a restart. Commit each hypothesis before its run.
- Build agents: brief starts with `git merge --ff-only main` and the head hash, bans `cargo fmt --all`
  and `make fmt`, limits the files. A subagent cannot write a findings `.md`. Read the rows, not the
  commit message.
- Leftover agent browser tabs run the sim and load the machine: close them before a bench.
- `bd` does not start in this repo. Open problems live in the findings files.

## Key files

| File | What |
|---|---|
| `tidepool/docs/plans/2026-10-14-m4-teeth.md` | The approved M4 plan; its checkboxes carry what each task measured |
| `tidepool/docs/findings/m4-encounter.md` | Task 1: how often bodies meet at the M3 head |
| `tidepool/docs/findings/m4-rules.md` | Tasks 3 to 5 and 8: the rules at Off, their tests, the throughput readings |
| `tidepool/docs/decisions/INDEX.md` | Decisions; the 2026-10-15 entries are the owner's answers |
| `tidepool/docs/gates.md` | Every gate, its bands, and the bad input each rejected |
| `tidepool/docs/findings/m3-exit.md` | The M3 verdict and the owner's open checks |
