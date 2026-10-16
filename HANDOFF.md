# Handoff — Tidepool: M4 (Teeth) is built, on, measured, and waits for the owner

**Date:** 2026-10-16, morning. **Project:** life-sim, subproject `tidepool/`. The draft in `src/` at
the repo root is frozen.

The previous handoff (mid-M4) is at `git show 9a0b25a:HANDOFF.md`.

## State

- Branch `main`, pushed at the M4 exit on the owner's standing yes of 2026-10-15 (see the last line
  of `git log`). Nothing is pushed between milestones.
- **M4 is built with every rule on, by the owner's instruction of 2026-10-16.** The exit record is
  `tidepool/docs/findings/m4-exit.md`: the verdict, the final proof rows, the browser checks with
  pictures (`m4-look.md`, `img/m4-*.jpeg`), the open problems sorted by who decides, and the owner
  checks. Two fresh-context audits (`m4-audit-1.md` at Off, `m4-audit-2.md` at the exit) and what was
  done about each item.
- **The final proof:** `make check` 0, `make gates` 0 (WASM 2,455 at 1,540 bodies, over the floor of
  2,400 and under the target of 2,600), `make gates-long` **exit 2, 3 of 5**: the eye gap on seeds 6
  and 8 at 0.080 and 0.082 with the toxin gland on (5 of 5 with it off). Deterministic. Trial T6
  (`toxin_cost` 4.0) was run for it: see the last section of `m4-tuning.md` for its outcome and
  whether 4.0 shipped.
- **The roadmap's coexistence is not met and is the owner's finding** (`m4-tuning.md`, the rule-5
  stop): with the bite on, hunters take over by 144,000 at every value tried; the mass ratio sets
  the pace and ran out of its range at 3.0, the shipped default. Untried levers and the rule the
  draft named are in `m4-exit.md` "Open problems".
- The saved worlds (gitignored) are rebaked at the final defaults: `m2-world.tdpl` (36,000 ticks,
  1,713 bodies, hunters a fifth to a half, prey everywhere: **the one to play**) and
  `m2-world-long.tdpl` (144,000, 631 large hunters).
- Provisional, owner to confirm (`docs/decisions/INDEX.md`, 2026-10-16): `fin_grip` 0.6, the
  12,000-tick and 144,000-tick predation bands, a mutant trigger resting closed, the shipped set.
- Owner checks: M4's six in `m4-exit.md` and M3's nine in `m3-exit.md`. An agent never closes them.

## What comes next

1. The owner plays (`make dev`, `/?world=/m2-world.tdpl`) and answers the open problems of
   `m4-exit.md`: the takeover rule, the bench's reference population (C9), the bands, the provisional
   entries, the budgets.
2. M5 (Deep time) has no plan yet. It carries from M4: the kill marks lost when the page holds
   every buffer, the eye gap's changed meaning (the jaw input is not scaled by `eye_gain`), and the
   guards and gland that evolution does not use. Fixed after the exit, unpushed: the still brain's
   overlapping output labels (`9258483`) and the killer missing from the card when it died in the
   same kill list (`5c81aea`, `3010972`, snapshot format 10, both saved worlds rebaked).

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
