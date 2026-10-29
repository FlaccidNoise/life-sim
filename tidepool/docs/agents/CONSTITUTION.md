# Tidepool constitution

The non-negotiable rules for `tidepool/`. Every agent that plans, implements, or reviews Tidepool work reads this file in full. A breach is a hard violation, never a judgement call. The reasoning behind each rule is in `docs/architecture.md` and `docs/decisions/INDEX.md`. This file states the rules only.

## Verification

Run from `tidepool/`. If `cargo` is not found, run `. "$HOME/.cargo/env"` first.

```sh
make check
```

- `make check` must exit 0 before any task is done. It runs the crate count, format, Clippy, Rust tests, the WASM build, the type check, ESLint, and Vitest.
- At a milestone exit, `make gates` and `make gates-long` also run. Their result goes in the exit record under `docs/findings/`, red or green. They are not per-task checks.
- A gate counts only after it has rejected a known-bad input. Record the proof in `docs/gates.md`.
- Claim only what was measured. "The mechanism fires", "evolution uses it", and "it helps" are three claims, and each needs its own measurement.
- Tune at 12,000 ticks on 3 seeds against a baseline. Run one long simulation at a time.

## Architectural boundaries

- `crates/sim` has zero dependencies. `crates/headless` imports only `sim`. The workspace holds only these two crates.
- `src/worker` imports `protocol` and the `.wasm`. `src/render` and `src/ui` import `protocol` only and never each other or `worker`. `src/app` imports all of them, and nothing imports `app`.
- `tidepool/` shares no code, config, or dependencies with the draft in the repo root. Never import from `/src` and never edit it from Tidepool work.
- `spikes/` is throwaway. Never import from it. Copy code out of it.
- Same rules for everyone: the player's creature runs on the same data and code as every other creature. No player-only systems.

## Determinism

- The same build, seed, parameters, and inputs give the same state hash in native and in WASM.
- No standard-library transcendental math in `crates/sim`: trigonometric and hyperbolic functions and their inverses, `exp`, logarithms, `powf`, `powi`, `hypot`, `cbrt`, and `mul_add`. Use `sim::math`. `sqrt`, `abs`, and rounding are allowed.
- One seeded generator, forked into one stream per subsystem. Iterate in ascending slot order. No hash-map iteration.
- A field that affects the future is in `World::save` and `World::load`. A field missing from them is a bug. The format version rises on any layout change.
- A load of bad data returns an error, never a half-built world.

## Forbidden

- No magic numbers in rule code. A new tunable constant goes in `params.rs` with a default, a minimum, and a maximum. (The 14 older groups listed in `docs/findings/m3-audit.md` step 6 are known debt, not precedent.)
- No dead flags. A feature that fails its measurement is deleted, and its note stays in `docs/findings/`.
- No reopening a decision in `docs/decisions/INDEX.md` without new evidence. A decision marked "provisional, owner to confirm" is not final.
- TypeScript stays on 6. `typescript-eslint` 8 requires `<6.1.0`.
- No push in the middle of a plan. Commit at each task.
