# Gates

A gate counts only after it has rejected a known-bad input. Each row records the bad input and the
output seen. All proofs ran on 2026-10-10, except the CI row, which has no proof yet.

| Gate | Command | Bad input used to prove it | Output seen | Date |
|---|---|---|---|---|
| Clippy banned methods | `cargo clippy --workspace --all-targets -- -D warnings` | `pub fn bad(x: f32) -> f32 { x.sin() }` added to `crates/sim/src/lib.rs` | ``error: use of a disallowed method `f32::sin` ``, exit 101 | 2026-10-10 |
| Import layers (ESLint) | `pnpm exec eslint .` | A file `src/render/x.ts` that contains `import '../app/main';` | `'../app/main' import is restricted from being used by a pattern. Dependency rule: see docs/architecture.md section 4`, exit 1 | 2026-10-10 |
| Snapshot round trip | `cargo test --test snapshot` | The `vy` line removed from both `Creatures::save` and `Creatures::load` in `crates/sim/src/creature.rs` | `load_then_run_equals_unbroken_run ... FAILED`, ``assertion `left == right` failed``, `left: 865352771`, `right: 4132115202` | 2026-10-10 |
| Native equals WASM | `pnpm exec vitest run tests/determinism.test.ts` | `#[cfg(target_arch = "wasm32")] { self.creatures.vx[0] += 1.0e-6; }` added to `World::tick`, then `make wasm` | All 3 seeds fail. Seed 1: `AssertionError: expected 3869756312 to be 1603536447 // Object.is equality` | 2026-10-10 |
| Throughput | `make gates` (runs `target/release/tidepool-headless bench`) | `bench --floor 1000000000` | `bench creatures=1500 median_tps=37372 floor=1000000000 FAIL`, exit 1 | 2026-10-10 |
| CI | `.github/workflows/tidepool.yml` runs `make check` and `bench --floor 800` | Not proven yet: the workflow has not run. First push runs it. | Not proven yet: the workflow has not run. First push runs it. | Not run |

## Notes

- **Snapshot round trip.** The other two round-trip tests (`load_gives_the_same_hash_immediately` and
  `spawning_after_load_matches_spawning_without_it`) still pass with that field missing. Only
  `load_then_run_equals_unbroken_run` catches a forgotten field. Removing the line from `save` alone
  fails earlier, with `load: Truncated`.
- **Throughput.** In M0 the world has no senses, brains, or fields. The number is a ceiling, not the
  real reading. The floor is 2,400 ticks per second at 1,500 creatures (`architecture.md` section 2).
- **Throughput, void run.** `bench --creatures 6000 --runs 2` fills the 4,096-slot pool, so the mean
  alive count is 4,096. That is below 80% of 6,000. The gate prints `VOID: population fell` and exits 1.
- **CI.** The workflow is not proven. Nobody has pushed it, so it has never run. Treat it as untested until
  the first push passes and a deliberately bad commit makes it fail. CI uses a floor of 800 ticks per second,
  a third of the real floor, because shared runners are slower than the reference machine by an unknown
  factor. `make gates` enforces the real floor on the reference machine.

## Throughput readings

`make gates` on the reference machine with nothing else running. Add a row when a task changes the
cost of a tick.

| Date | After task | World | Mean creatures | `median_tps` | Floor |
|---|---|---|---|---|---|
| 2026-10-10 | 6 (M0) | 1,500 drifters, no plants, no brains | 1,500 | 34,217 | 2,400 |

## In-page bench, reference machine

`http://localhost:<port>/?bench` on the dev server, tab in the foreground. The worker runs 2,000 ticks of
a second world of 1,500 drifters while the page keeps drawing. Add a row when a task changes the cost of
a tick.

| Date | After task | Browser | World | Ticks per second | 24,000-tick skip |
|---|---|---|---|---|---|
| 2026-10-10 | 8 (M0) | Chrome, Apple M4 Pro | 1,500 drifters, no plants, no brains | 17,197 | 1.4 s |

Four more loads on the same day read 16,207 to 17,212. The same module in Node reads about 16,300 for
2,000 ticks, so the browser costs nothing over Node here. The native reading above is about 2 times this.
