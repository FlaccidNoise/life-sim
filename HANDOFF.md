# Handoff — Tidepool: M2 is built and pushed, and waits for the owner's five checks

**Date:** 2026-10-12
**Project:** life-sim, subproject `tidepool/`

The previous handoff (the M2 plan waits for approval) is at `git show 67f476f:HANDOFF.md`. The draft in
`src/` is frozen.

## Current Task

M2 (Bodies) is built from `tidepool/docs/plans/2026-10-11-m2-bodies.md`. Tasks 1 to 13 are done. Task
14 (the exit) is done except for the owner's five checks. **`make check`, `make gates`, and
`make gates-long` all exit 0.** `main` is pushed, and CI passed on it.

## Completed

- The M2 rules, the grazing rule, and the tuned defaults (`tidepool/docs/findings/m2-tuning.md`).
- A fresh-context audit (`m2-audit.md`). It found that evolution removed the senses by tick 144,000.
- The cause, measured: the upkeep of a part (`m2-senses.md`). The owner chose to delete that rule.
  `part_upkeep` and four switches left at 1 are deleted. `plant_growth` is 0.03.
- On 10 seeds at tick 144,000 every world keeps both senses, and no body is without one.
- The failure proofs of `gates.md` ran again at the new defaults. Every band has rejected a bad input.
- `architecture.md`, `roadmap.md`, and `design.md` §6 match the head.
- The exit record, with screenshots of an evolved world: `tidepool/docs/findings/m2-exit.md`.
- The owner decided the nine questions of the audit on 2026-10-12. Built from them: `make gates-long`
  (the evolution gate at tick 144,000, for each milestone exit), and `speed` and `area` in the row of
  `gate-evolve`. The rest is carried to M3, M4, and M5 in `roadmap.md`.

## Pending

1. **The owner's five checks**, at the end of `m2-exit.md`. The first two close the M2 exit and the
   open half of the M1 exit. To see the evolved world: in `tidepool/` run
   `target/release/tidepool-headless run --seed 1 --ticks 36000 --creatures 400 --plants 1200 --out public/m2-world.tdpl`,
   then `make dev`, then open `/?world=/m2-world.tdpl`. The baked file is not in git.
2. Then the M3 plan (Minds), written from what M2 measured and from the items that `roadmap.md`
   carries into it.

## Open Questions

- No fresh-context audit has run since the part upkeep was deleted.
- An old world is under the throughput floor: 2,357 against 2,400 at tick 108,000, timed on a busy
  machine.
- Body length holds on three numbers, each at an end of its range: `part_mass`, the founder's egg, and
  the brain upkeep. M3 decides the rule of brain upkeep, and the body will move with it.
- Push rule conflict, still open. The root `AGENTS.md` says push at session end. The owner's global
  rules say push only when asked. This session followed the owner's rules and pushed when asked.

## Key Decisions

All in `tidepool/docs/decisions/INDEX.md`:

- 2026-10-11: the fallback rule for grazing is built. A bite cannot take a plant under its death
  reserve.
- 2026-10-12: the M2 retune closed at trial 8 of 12.
- 2026-10-12: a part has no upkeep of its own. It costs through its mass alone.
- 2026-10-12: `plant_growth` is 0.03.
- 2026-10-12: the nine questions of the M2 audit. No band, rule, or default changed.

## Relevant Files

| File | Notes |
|------|-------|
| `tidepool/docs/findings/m2-exit.md` | **Start here.** The verdict, the rows, the open decisions, the owner checks |
| `tidepool/docs/findings/m2-senses.md` | Why the senses were lost, trials 11 to 13, the rows on 10 seeds |
| `tidepool/docs/findings/m2-audit.md` | The audit at commit f5b7381. Its findings H1 and M1 are closed |
| `tidepool/docs/gates.md` | Every gate, its bands, and the bad input that each band rejected |
| `tidepool/docs/decisions/INDEX.md` | Decisions |
| `tidepool/AGENTS.md` | Commands, gotchas, status |

## Context & Warnings

- Run `make` and `pnpm` from `tidepool/`. If `cargo` is not found: `. "$HOME/.cargo/env"`.
- `bd` (beads) does not start in this repo. Open problems live in the findings files.
- One simulation run at a time. In zsh a variable that holds `--param a=b` is passed as one word and
  the command fails with "unknown flag". Write the flags out.
- A chain of commands ends with the exit code of its last command. Echo the exit code of each step.
- A script that edits a doc must check that its anchor matches exactly once, and the staged diff must
  be read before the commit. This session committed a 39.5 MB `gates.md` by skipping both, and amended
  it before any push.
- The snapshot `FORMAT_VERSION` is 7. A world file baked before 2026-10-12 does not load.
- The agent worktrees of this session and their branches are removed. Their work is on `main`.

## Suggested Next Steps

1. Read `m2-exit.md`.
2. Do the five owner checks.
3. Write the M3 plan.
