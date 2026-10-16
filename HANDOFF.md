# Handoff — Tidepool: M4 (Teeth) is being built

**Date:** 2026-10-15, late. **Project:** life-sim, subproject `tidepool/`. The draft in `src/` at the
repo root is frozen.

The previous handoff (M3 closed, waiting for the owner) is at `git show cac3ded:HANDOFF.md`.

## State

- Branch `main`. Pushed to `020f351` on 2026-10-15 after the M3 close, with the owner's yes. Every
  later commit is local. **No push until the M4 exit or the owner asks.**
- The owner answered the M3 close on 2026-10-15 with "yes to all" (six provisional entries
  confirmed, `variety_wired`, look 4, the M4 plan at its recommended options with C9 at B). On
  2026-10-16 the owner added: **every M4 rule ships on in the default world**, and the build runs
  on through the night; a feature that fails its measurement stays on and goes to the owner.
- M4 Tasks 1 to 11, 13 and 14 are built, merged one at a time, and verified (`docs/plans/...m4-teeth.md`
  checkboxes; findings `m4-encounter`, `m4-rules`, `m4-ports`, `m4-motor`, `m4-gates`, `m4-audit-1`,
  `m4-tuning`). The gate rows stayed identical to M3 through Task 8; Task 9 set the new baseline
  (senses 10/10 at 36k). A mid-build audit found nothing blocking; its fixes are on main.
- **Task 12 (switch on and retune) is in progress, run by the orchestrator.** Part 1 read: the moment
  the bite is on, every lineage is a hunter by 12k and prey is gone (`m4-tuning.md`). Part 3 trials
  T1 to T4: only `bite_mass_ratio` moves the world, and it moves the speed of the takeover, not its
  end (2.0: prey gone by 24k; 3.0: hunters 17% to 60% over 36k with prey left and a healthy world).
  The long read of the ratio-3 world at 144k is the decisive reading in flight when this was
  written: whether guards that arrive by mutation give prey a foothold in time.
- The defaults in `params.rs` are still Off. The Start set plus `fin_grip` 0.6 is passed as flags in
  the readings. **Before the exit: write the chosen set as defaults, rebake both saved worlds, add
  `--predation` to the Makefile's gates lines only once a band is `Some`.**
- Provisional, owner to confirm (all in `docs/decisions/INDEX.md`): `fin_grip` 0.6, the 12k
  predation bands, a mutant trigger resting at `starter_trigger_bias`.
- The saved worlds (gitignored) are at format 9 but baked with every rule Off (seed 1, 36k and 144k).

## What comes next

1. Read the long run. If hunters take over by 144k on most seeds whatever the ratio, that is the
   plan's rule-5 stop (frequency dependence is a rule, the owner's). Ship the best set on anyway,
   per the owner, with the finding.
2. Remaining trial budget: 8 of 12 for predation, 3 for the toxin gland (part 4).
3. Part 2 readings at the chosen set (`make gates`, `gates-long`, `probe-hunt`, the jaw gap), the
   144k proofs of B1 to B3 for the long predation bands.
4. Write the defaults, `make check && make gates`, rebake, the deferred browser checks (Task 6
   screenshots and draw timing, Task 7 a real death by a bite, Task 14 the first-death beat).
5. Task 15: the exit record, a fresh-context audit, `make gates-long`, the play route for the owner,
   then push.

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
