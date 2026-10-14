# Handoff — Tidepool: M3 is built, the retune's stage 2 runs, then the exit

**Date:** 2026-10-14
**Project:** life-sim, subproject `tidepool/`. The draft in `src/` at the repo root is frozen.

The previous handoff (M3 plan written, waiting for the owner) is at `git show 7895cd5:HANDOFF.md`.

## Current task

M3 (Minds) from `tidepool/docs/plans/2026-10-13-m3-minds.md`, approved by the owner on 2026-10-13
with the recommended option of every choice. The owner asked for the build to run through the plan's
soft stops: at each one the orchestrator takes the recommended option and logs it in
`tidepool/docs/decisions/INDEX.md` as **"provisional, owner to confirm"**. Hard stops stay: a change
to an existing band, a rule, the floor, or the reference population, deleting a feature, a target
not met after its trial cap, and any push.

The owner also asked, on 2026-10-13, for a walkthrough that teaches as it plays: built
(`tidepool/docs/plans/2026-10-13-walkthrough.md`, `tidepool/docs/findings/m3-walkthrough.md`).

## State

- Branch `main`. Nothing is pushed since `7895cd5`: about 50 local commits. **The owner has not said
  to push.** Ask.
- Built and merged, each checked by the orchestrator (the gates, the rows digit for digit, one rule
  broken to see a test fail): every task of the M3 plan but Task 10 parts 4 and 5 and Task 15. The
  walkthrough W1 to W4 and an integration pass. Two frame words (growth, age): stride 25, ABI 6.
- At `d372cc5` the orchestrator ran `make check`, `make gates`, and `make gates-long` on `main` with
  every task merged: all exit 0, rows equal to the retune's close.
- Stage 1 of the retune closed with `mut_conn_remove` 0.01 (provisional). The band on `shapes` was
  replaced by a band on `variety` (provisional). Records: `tidepool/docs/findings/m3-tuning.md`,
  `m3-brains.md`, `m3-inputs.md`.
- **Running when this was written:** stage 2 of the retune (Task 10 parts 4 and 5: mixing on, then the
  three items carried from M2), by a build agent in `.claude/worktrees/agent-aa66cd0e1d2fc703e`. If the
  session ended, check that worktree's `git log` against `main` and its hypothesis file
  `tidepool/docs/findings/m3-tuning-hypotheses.txt` before redoing anything.
- The M4 plan is a draft for the owner: `tidepool/docs/plans/2026-10-14-m4-teeth.md`. Eleven choices.
  Its rules were read by the orchestrator, its tasks scanned. Build nothing of it before approval.

## Pending, in order

1. Stage 2 of the retune lands. Check it on `main` (`make check`, `make gates`, `make gates-long`, the
   rows against the agent's, one break), fold `m3-tuning-hypotheses.txt` into `m3-tuning.md`, and log
   its proposals (mixing on or off, the area band, the egg range, `plans` and `speed_cv`) as
   provisional.
2. Task 15, the M3 exit: rebake `public/m2-world.tdpl` and `m2-world-long.tdpl` at the final defaults
   (the old files predate the brain layout and fail to load with "brain activation count"). Then a
   fresh-context `auditor` (its report comes back as reply text: a subagent cannot write a findings
   `.md`), fix what it finds, write `m3-exit.md`, update `architecture.md`, `roadmap.md`, `design.md`
   §6, `tidepool/AGENTS.md`, and this file. Rename "Start" to "Default" in the plan's parameter table.
3. Bring the owner, in one message: every provisional decision of M3 to confirm, the look to pick
   (`m3-shapes.md`: the owner leaned to look 1's scale with look 3's detail, and look 4 was built for
   that), the M4 plan's eleven choices, the walkthrough playtest (`m3-walkthrough.md`), and the push.

## The owner's checks, open, never closed by an agent

From M2: bodies visibly differ (now with four looks), the dimmed view of a body with no eye, `/?bench`
on a phone and a slower laptop, the felt judgments of `m1-feel.md`. From M3 (Task 15): play with the
brain panel, let go and see the brain take over, the strongest-path sentence, courting, and the
walkthrough playtest with a person who has not seen the game.

## Warnings

- **`/private/tmp` does not survive a restart.** A restart on 2026-10-14 lost every run log and
  hypothesis file of Tasks 7 to 10. The rows in `docs/findings/` are the record. From now on each
  hypothesis is committed to the repo before its run.
- One simulation at a time. Write each `--param` flag out in zsh. Echo every exit code. Record
  `uptime` beside every timing: this machine's load ran from 3 to 24, and WASM throughput sits on its
  target of 2,700 with no margin.
- Build agents: one task each, own worktree, the brief starts with `git merge --ff-only main` and a
  head hash, bans `cargo fmt --all` and `make fmt`, and says "run no simulation" when another agent
  runs one. A subagent cannot write a findings `.md`: have it reply with the text, or write a `.txt`.
- The field guide's text is held to the code by `tests/guide.test.ts` (numbers read from the Rust
  source, claims about mixing pinned to `mate.rs` and `repro.rs`) and `tests/words.test.ts` (no
  purpose in a cause, at most eight words for a line). A chapter has a cap of 160 words.
- Format only the files you changed: `rustfmt --edition 2021 <file>`.
- `bd` does not start in this repo. Open problems live in the findings files.

## Key files

| File | What |
|---|---|
| `tidepool/AGENTS.md` | Commands, gotchas, status |
| `tidepool/docs/plans/2026-10-13-m3-minds.md` | The M3 plan, approved |
| `tidepool/docs/plans/2026-10-13-walkthrough.md` | The walkthrough plan |
| `tidepool/docs/plans/2026-10-14-m4-teeth.md` | The M4 plan, a draft |
| `tidepool/docs/decisions/INDEX.md` | Decisions. "Provisional" ones wait for the owner |
| `tidepool/docs/findings/m3-*.md` | What M3 measured and built |
| `tidepool/docs/research/onboarding.md` | The research behind the walkthrough |
| `tidepool/docs/gates.md` | Every gate, its bands, and the bad input each rejected |
