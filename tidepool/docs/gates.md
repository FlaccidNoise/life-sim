# Gates

A gate counts only after it has rejected a known-bad input. Each row records the bad input and the
output seen. All proofs ran on 2026-10-10, except the CI row, which has no proof yet.

| Gate | Command | Bad input used to prove it | Output seen | Date |
|---|---|---|---|---|
| Clippy banned methods | `cargo clippy --workspace --all-targets -- -D warnings` | `pub fn bad(x: f32) -> f32 { x.sin() }` added to `crates/sim/src/lib.rs` | ``error: use of a disallowed method `f32::sin` ``, exit 101 | 2026-10-10 |
| Import layers (ESLint) | `pnpm exec eslint .` | A file `src/render/x.ts` that contains `import '../app/main';` | `'../app/main' import is restricted from being used by a pattern. Dependency rule: see docs/architecture.md section 4`, exit 1 | 2026-10-10 |
| Import layers, `src/` root (ESLint) | `pnpm exec eslint .` | A file `src/x.ts` that contains `import './app/main';` and `import './worker/host';` | `'./app/main' import is restricted from being used by a pattern. Dependency rule: see docs/architecture.md section 4`, the same line for `'./worker/host'`, exit 1 | 2026-10-10 |
| No dynamic import (ESLint) | `pnpm exec eslint .` | A file `src/render/y.ts` that contains `export const later = () => import('../protocol');` | `No dynamic import() in src: the dependency rule cannot check it. See docs/architecture.md section 4`, exit 1 | 2026-10-10 |
| Crate count | `make check` (first step) | A scratch crate `crates/x` with an empty `src/lib.rs`, added to `crates/sim/Cargo.toml` as `x = { path = "../x" }` | `error: the cargo workspace must hold only tidepool-sim and tidepool-headless, and crates/sim must have zero dependencies. Cargo.lock lists:`, then the 3 names with `name = "x"` last, then `make: *** [check] Error 1` | 2026-10-10 |
| Rust format | `cargo fmt --all -- --check` | `pub fn  ugly( )->u32{1}` added to `crates/sim/src/lib.rs` | `Diff in` the path of `lib.rs`, then the bad line and the formatted lines, exit 1 | 2026-10-10 |
| TypeScript format | `pnpm exec prettier --check src tests scripts` | A file `src/z.ts` that contains `export const  ugly = {a:1,` and ` b:2}` on two lines | `[warn] src/z.ts`, `[warn] Code style issues found in the above file. Run Prettier with --write to fix.`, exit 1 | 2026-10-10 |
| Type check | `pnpm exec tsc --noEmit` | A file `src/x.ts` that contains `export const n: number = 'a';` | `src/x.ts(1,14): error TS2322: Type 'string' is not assignable to type 'number'.`, exit 2 | 2026-10-10 |
| Snapshot round trip | `cargo test --test snapshot` | The `vy` line removed from both `Creatures::save` and `Creatures::load` in `crates/sim/src/creature.rs` | 5 tests fail. The round-trip test is `load_then_run_equals_unbroken_run ... FAILED`, with ``assertion `left == right` failed``, `left: 865352771`, `right: 4132115202`. The other 4 are in the notes. | 2026-10-10 |
| Native equals WASM | `pnpm exec vitest run tests/determinism.test.ts` | `#[cfg(target_arch = "wasm32")] { self.creatures.vx[0] += 1.0e-6; }` added to `World::tick`, just before `self.tick` is incremented at the end, then `make wasm` | All 3 seeds fail. Seed 1: `AssertionError: expected 3869756312 to be 1603536447 // Object.is equality` | 2026-10-10 |
| Throughput, native | `make gates` (runs `target/release/tidepool-headless bench`) | `bench --floor 1000000000` | `bench creatures=1500 median_tps=37372 floor=1000000000 FAIL`, exit 1 | 2026-10-10 |
| Throughput, WASM in Node | `make gates` (runs `node scripts/bench-wasm.mjs`) | `node scripts/bench-wasm.mjs --floor 1000000000` | `bench-wasm creatures=1500 median_tps=24027 floor=1000000000 FAIL`, exit 1 | 2026-10-10 |
| CI | `.github/workflows/tidepool.yml` runs `make check`, `bench --floor 800`, and `scripts/bench-wasm.mjs --floor 800` | Not proven yet: the workflow has not run. First push runs it. | Not proven yet: the workflow has not run. First push runs it. | Not run |

## Notes

- **Clippy banned methods.** The list covers `f32` and `f64`. `(x as f64).sin() as f32` and `x.ln()` on an `f32`, added to `crates/sim/src/lib.rs`, give
  ``error: use of a disallowed method `f64::sin` `` and ``error: use of a disallowed method `f32::ln` ``,
  exit 101. A test file under `crates/sim/tests/` runs native only and can allow the lint.
- **Snapshot round trip.** The other two round-trip tests (`load_gives_the_same_hash_immediately` and
  `spawning_after_load_matches_spawning_without_it`) still pass with that field missing. Only
  `load_then_run_equals_unbroken_run` catches a forgotten field. Removing the line from `save` alone
  fails earlier, with `load: Truncated`. The other 4 tests that fail are
  `a_crafted_payload_loads`, `every_cut_of_a_payload_is_an_error`,
  `wild_creature_values_load_and_run_without_panic`, and
  `counters_at_the_top_of_their_range_do_not_panic_or_wrap_a_uid`. They fail because the test helper
  `raw_payload` writes 5 creature fields.
- **Throughput.** The floor is 2,400 ticks per second at 1,500 creatures, for WASM in Node
  (`architecture.md` section 2). `scripts/bench-wasm.mjs` enforces it. The native bench is for probes
  and a quick reading. On the M0 world, native reads about 1.4 times WASM. In M0 the world has no
  senses, brains, or fields, so both numbers are a ceiling, not the real reading.
- **Throughput, void run.** `bench --creatures 6000 --runs 2` fills the 4,096-slot pool, so the mean
  alive count is 4,096. That is below 80% of 6,000. Each bench prints `VOID: population fell` and exits 1.
- **Throughput, WASM in Node, load.** The timer responds to load: `node scripts/bench-wasm.mjs
  --creatures 4000 --runs 3 --world 1024x512 --floor 30000` prints `median_tps=2574 ... FAIL`, exit 1.
- **CI.** The workflow is not proven. Nobody has pushed it, so it has never run. Treat it as untested until
  the first push passes and a deliberately bad commit makes it fail. CI uses a floor of 800 ticks per second,
  a third of the real floor, because shared runners are slower than the reference machine by an unknown
  factor. `make gates` enforces the real floor on the reference machine.
- **Known, not a gate.** M0 drifters gain energy on a long run: the audit measured a mean speed of 0.76
  units per tick at tick 0 and 48 at tick 72,000. Task 10 and Task 11 replace the M0 motion.

## Throughput readings

`make gates` on the reference machine, run by the orchestrator with no other Tidepool work running. Add
a row when a task changes the cost of a tick. The floor applies to the WASM column. On 2026-10-10 another
project kept the machine at a load average near 5, so these readings are lower bounds.

| Date | After task | World | Mean creatures | Native `median_tps` | WASM `median_tps` | Floor |
|---|---|---|---|---|---|---|
| 2026-10-10 | 9 (M0 exit) | 1,500 drifters, no plants, no brains | 1,500 | 34,264 | 23,250 | 2,400 |
| 2026-10-10 | 10 (M1 skeleton, stub rules) | 3072 by 1536, 1,500 founders that wander, no plants yet | 1,500 | 12,627 | 10,633 | 2,400 |

## In-page bench, reference machine

`http://localhost:<port>/?bench` on the dev server, tab in the foreground. The worker runs 2,000 ticks of
a second world of 1,500 drifters while the page keeps drawing. Add a row when a task changes the cost of
a tick.

| Date | After task | Browser | World | Ticks per second | 24,000-tick skip |
|---|---|---|---|---|---|
| 2026-10-10 | 8 (M0) | Chrome, Apple M4 Pro | 1,500 drifters, no plants, no brains | 17,197 | 1.4 s |

Four more loads on the same day read 16,207 to 17,212. The same module in Node reads about 16,300 for
2,000 ticks, so the browser costs nothing over Node here. The native reading above is about 2 times this.
