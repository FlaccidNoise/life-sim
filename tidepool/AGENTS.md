# Tidepool — Agent Instructions

Tidepool is a ground-up rebuild of the life simulation in the repo root, as a game. You play one
creature among creatures that each run an evolved neural network. It shares no code with the draft in
`/src`. Do not import from the draft and do not edit it from here.

## Read first

1. `docs/design.md`: what the game is. Locked with the owner.
2. `docs/architecture.md`: stack, budgets, layout, rules.
3. `docs/roadmap.md`: milestones and their exit checks.
4. `docs/plans/`: the task-level plan for the current milestone.
5. `docs/decisions/INDEX.md`: decisions already made. Do not reopen one without new evidence.

## Status

M0 (foundation) and M1 (first swim) are built, audited, and pushed. M2 (Bodies) is built from
`docs/plans/2026-10-11-m2-bodies.md` and pushed. **`make check`, `make gates`, and `make gates-long`
all exit 0.** The first audit (`docs/findings/m2-audit.md`) found that evolution removed the senses by
tick 144,000. The cause was the upkeep of a part, and the owner deleted that rule on 2026-10-12
(`docs/findings/m2-senses.md`). The second audit, at the head, is `docs/findings/m2-audit-2.md`: no
High finding, and what it found and what was fixed is at the end of that file. The exit record is
`docs/findings/m2-exit.md`. Of the owner's five checks, one is done, one is half done, and three are
open.

M3 (Minds) has a plan, `docs/plans/2026-10-13-m3-minds.md`. **The owner approved it on 2026-10-13. It is
built, audited (`docs/findings/m3-audit.md`), and its exit record is `docs/findings/m3-exit.md`.**
The owner's checks are open. The walkthrough
(`docs/plans/2026-10-13-walkthrough.md`) is built. **The owner approved the M4 plan on 2026-10-15
(`docs/plans/2026-10-14-m4-teeth.md`), at the recommended option of every choice and C9 at B. It is
being built.** The plan says which owner stops the build runs through and which stops are hard
("How the build runs without the owner"). A choice logged as "provisional, owner to confirm" in
`docs/decisions/INDEX.md` is not final.

## Commands

Run from `tidepool/`. If `cargo` is not found, run `. "$HOME/.cargo/env"`.

| Command | Does |
|---|---|
| `make check` | Crate count, format (Rust and TypeScript), Clippy, Rust tests, WASM build, type check, ESLint, Vitest |
| `make gates` | Native bench, the throughput gate (`scripts/bench-wasm.mjs`), the health gate (`gate-health`), then the evolution gate (`gate-evolve`) |
| `make gates-long` | The evolution gate at tick 144,000 on seeds 1, 4, 5, 6, 8, with the brain bands. About 17 minutes on the reference machine at a load of 4 to 7. Run it at each milestone exit. It is not in CI |
| `make dev` | Build the WASM and start the dev server |

## Gotchas

- **`tidepool/` is its own pnpm root.** `pnpm-workspace.yaml` here gives it a separate lockfile and
  `node_modules`. Run `pnpm` from `tidepool/`, never from the repo root, for Tidepool work.
- **TypeScript stays on 6.** `typescript-eslint` 8 requires `<6.1.0`.
- **No standard-library transcendental math in `crates/sim`.** Banned on `f32` and `f64`: trigonometric
  and hyperbolic functions and their inverses, exponentials, logarithms, powers (`powf`, `powi`),
  `hypot`, `cbrt`, and `mul_add`. They differ between native and WASM and break the determinism test.
  Use `sim::math`. `sqrt`, `abs`, and rounding are allowed. Clippy rejects the banned calls
  (`clippy.toml`). A test file under `crates/sim/tests/` runs native only and can start with
  `#![allow(clippy::disallowed_methods)]`. A `#[cfg(test)]` module in `crates/sim/src` can carry the
  same `allow` on the one function that needs it.
- **A field that is not in `save` and `load` is a bug.** The state hash is the CRC of the saved bytes.
- **A number that needs tuning goes in `params.rs`.** Rule code has no magic numbers.
- **Tune at 12,000 ticks on 3 seeds, one run at a time, against a baseline.** Shorter runs were wrong in
  both directions on the draft. Two long runs at once die silently.
- **A gate counts only after it has rejected a known-bad input.** Record the proof in `docs/gates.md`.
- **Claim only what was measured.** "The mechanism fires", "evolution uses it", and "it helps" are three
  different claims.
- **A feature that fails its measurement is deleted.** Keep the note in `docs/findings/`. No dead flags.
- **Browser checks:** use a port that is not already in use, since a reused port can serve a stale
  module. Keep the tab in the foreground, since a hidden tab stops `requestAnimationFrame`.
- **`spikes/` is throwaway.** Never import from it. Port code out of it by copying.
- **Commit at each task. Do not push in the middle of a plan.** Pushing at session end follows the root
  `AGENTS.md`. The GitHub repo is public.

## Building with agents

The session that builds is an orchestrator. It dispatches one task per agent and checks each claim
before the commit. The agent for each task is in the plan. Tiers: `docs/architecture.md` §12.
