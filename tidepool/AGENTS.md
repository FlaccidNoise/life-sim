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

M0 (foundation) is built: the Rust core, the C ABI, the worker host, the WebGL2 page, `make check`,
`make gates`, and a CI workflow. The CI workflow has not run yet, because nothing is pushed. The M1
simulation and page are built. The M1 exit audit is next: Task 20 of
`docs/plans/2026-10-10-m0-m1-first-swim.md`.

## Commands

Run from `tidepool/`. If `cargo` is not found, run `. "$HOME/.cargo/env"`.

| Command | Does |
|---|---|
| `make check` | Crate count, format (Rust and TypeScript), Clippy, Rust tests, WASM build, type check, ESLint, Vitest |
| `make gates` | Native bench, the throughput gate (`scripts/bench-wasm.mjs`), then the health gate (`gate-health`) |
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
  `#![allow(clippy::disallowed_methods)]`.
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
