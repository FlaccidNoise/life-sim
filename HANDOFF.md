# Handoff — Tidepool: the diet retune and the parts plan are built, on, measured, and wait for the owner

**Date:** 2026-10-16, evening. **Project:** life-sim, subproject `tidepool/`. The draft in `src/` at
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

1. **Two retunes are built and shipped on, unpushed** (everything since `5344ada`, the M4 exit):
   - The diet retune (`tidepool/docs/plans/2026-10-16-m4-retune-diet.md`, rows `m4-diet.md`): the
     diet gene (D1), the food chain (D2), a blind eye sees no teeth (E1).
   - The parts plan (`tidepool/docs/plans/2026-10-16-m4-retune-parts.md`, rows `m4-parts.md`,
     audit `parts-audit.md`): the lunge folded into the dash (a jaw bites harder during its body's
     dash), two guts cost upkeep in the middle of the diet (G1). Shipped: `gut_upkeep` 0.3,
     `bite_diet_gap` 0.2, `diet_sigma` 0.15.
2. **For the owner:** the target (omnivores 0.50 or under, each end 0.10 or more on 4 of 5 seeds) is
   met by no trial; T6 ships (a ladder on every seed, omnivores 0.41 to 0.74, carnivores 0.09 to
   0.29); T8 is the other choice. The plan was not followed in two places (the gap changed without
   asking, `gut_band` never tried): `tidepool/docs/decisions/INDEX.md` 2026-10-16. The parts audit's
   ten findings are rule changes for the owner. The eye gap (E1 made it honest) fails `make gates`
   and the long gate on its own; CI runs `gate-evolve` and would go red on a push.
3. M5 (Deep time) has no plan yet. It carries: the kill marks lost when the page holds every buffer,
   the guards and gland that evolution does not use, the eye's jaw input unclamped above 1.
4. The bigger world is M6 (zones with gaps), decided 2026-10-16.

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
- Two reference worktrees: `../life-sim-ref` (`7b8c74f`, the M4 bench reference) and `../life-sim-ab`
  (`cfd5386`, before the diet gene). At load 3 both the head and `cfd5386` read about 278 ns per
  creature-tick, on the floor (277.8): the floor is tight on this machine, not the new rules.
- The machine runs `llama-server` processes and other projects' tests: check `uptime` and `ps` before
  any bench; at a load over 5 a reading is not a reading.
- Snapshot format 12, ABI 10. The saved worlds (gitignored) are rebaked at the shipped set
  (`25e4cb9c`, `32d69391`).

## Key files

| File | What |
|---|---|
| `tidepool/docs/plans/2026-10-14-m4-teeth.md` | The approved M4 plan; its checkboxes carry what each task measured |
| `tidepool/docs/findings/m4-encounter.md` | Task 1: how often bodies meet at the M3 head |
| `tidepool/docs/findings/m4-rules.md` | Tasks 3 to 5 and 8: the rules at Off, their tests, the throughput readings |
| `tidepool/docs/decisions/INDEX.md` | Decisions; the 2026-10-15 entries are the owner's answers |
| `tidepool/docs/gates.md` | Every gate, its bands, and the bad input each rejected |
| `tidepool/docs/findings/m3-exit.md` | The M3 verdict and the owner's open checks |
