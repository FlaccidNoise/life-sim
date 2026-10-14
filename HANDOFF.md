# Handoff — Tidepool: M3 is built and closed, waiting for the owner

**Date:** 2026-10-14
**Project:** life-sim, subproject `tidepool/`. The draft in `src/` at the repo root is frozen.

The previous handoff (M3 built but for its exit) is at `git show 5b7f0a4:HANDOFF.md`.

## State

- Branch `main`. Pushed to `5018fbb`. Every later commit is local. Push only when the owner asks.
- M3 (Minds) is built from `tidepool/docs/plans/2026-10-13-m3-minds.md`, retuned, audited by a
  fresh-context auditor (`tidepool/docs/findings/m3-audit.md`), and closed
  (`tidepool/docs/findings/m3-exit.md`). `make check`, `make gates`, and `make gates-long` exit 0.
- The owner chose on 2026-10-14, at a hard stop: mixing on (`mix_rate` 1), `fixed_upkeep` 0.037, and
  M3's WASM target lowered from 2,700 to 2,600. The floor of 2,400 is unchanged.
- The worlds to look at are rebaked at the final defaults: `tidepool/public/m2-world.tdpl` (tick
  36,000) and `m2-world-long.tdpl` (tick 144,000). They keep their M2 names. They are not in git.
- No worktree is open.

## Waiting for the owner, in one message

1. Every choice marked "provisional, owner to confirm" in `tidepool/docs/decisions/INDEX.md`. The
   list is in `m3-exit.md` "Open problems". New: should the `variety` band read `variety_wired`?
2. The look to pick (`m3-shapes.md`, `?look=1` to `?look=4`), or none.
3. The M4 plan's eleven choices (`tidepool/docs/plans/2026-10-14-m4-teeth.md`). Build nothing of M4
   before approval. Its "What M3 measured" table and throughput budget are updated to the M3 close.
4. The owner's checks of `m3-exit.md`, and the walkthrough playtest (`m3-walkthrough.md`). Never
   closed by an agent.

## Warnings

- **`/private/tmp` does not survive a restart.** Each hypothesis is committed before its run.
- One simulation at a time. Write each `--param` flag out in zsh. Echo every exit code. Record
  `uptime` beside every timing: the machine's load runs from 3 to 30.
- `make gates-long` takes about 17 minutes.
- Build agents: one task each, own worktree, the brief starts with `git merge --ff-only main` and a
  head hash, bans `cargo fmt --all` and `make fmt`. A subagent cannot write a findings `.md`.
- A build agent's commit message can claim more than its later readings show (`f4d2ef3`). Read the
  rows, not the message.
- Format only the files you changed: `rustfmt --edition 2021 <file>`.
- `bd` does not start in this repo. Open problems live in the findings files.

## Key files

| File | What |
|---|---|
| `tidepool/AGENTS.md` | Commands, gotchas, status |
| `tidepool/docs/findings/m3-exit.md` | The M3 verdict, rows, brains, open problems, owner checks |
| `tidepool/docs/findings/m3-audit.md` | The audit and what was fixed |
| `tidepool/docs/plans/2026-10-14-m4-teeth.md` | The M4 plan, a draft |
| `tidepool/docs/decisions/INDEX.md` | Decisions. "Provisional" ones wait for the owner |
| `tidepool/docs/gates.md` | Every gate, its bands, and the bad input each rejected |
