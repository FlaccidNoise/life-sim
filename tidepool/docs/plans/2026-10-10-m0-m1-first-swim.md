# Tidepool M0 + M1 — Foundation and First Swim

**Goal:** A page where a stranger can click a creature, swim, eat, bud, die, and continue as a
descendant, in a world that stays alive for 12,000 ticks on 3 seeds.

**Architecture:** A Rust simulation core with zero dependencies compiles to WebAssembly and runs in one
worker. It also compiles natively into a headless CLI for gates and probes. A TypeScript page draws
frames that the worker transfers, with WebGL2 and a Preact overlay. Full detail: `../architecture.md`.

**Tech stack:** Rust 1.99.0 (edition 2021), TypeScript 6, Vite 8, Vitest 4, ESLint 10, pnpm 11,
Preact 11, `@preact/signals` 2.

**Read first:** `../design.md` (what the game is), `../architecture.md` (budgets, layout, rules),
`../roadmap.md` (M0 and M1 exit checks), `../research/kernel-bench.md` (the numbers).

## Global constraints

- Every path in this plan is relative to `tidepool/` unless it starts with `/`.
- Run every command from `tidepool/`. If `cargo` is not found, run `. "$HOME/.cargo/env"` first.
- `crates/sim` has **no dependencies**. `crates/headless` depends only on `tidepool-sim`. Parse
  arguments by hand.
- No `sin`, `cos`, `exp`, `powf`, `tanh`, or `mul_add` from the standard library in `crates/sim`. Use
  `sim::math`. `sqrt` is allowed.
- Iterate pools in ascending slot order. No `HashMap` in `crates/sim`.
- Every tunable number is a parameter in `params.rs`. No magic numbers in rule code.
- Every field that affects the future is written by `save` and read by `load`. A new field that is not
  in both fails the round-trip test.
- TypeScript: no `any`, no non-null `!` on values that can be absent, no `console.log` left in.
- Package versions: `typescript ^6.0.3`, `vite ^8.0.16`, `vitest ^4.1.8`, `eslint ^10.5.0`,
  `typescript-eslint ^8.61.0`, `eslint-config-prettier ^10.1.8`, `prettier ^3.8.4`,
  `@types/node ^25.9.3`, `preact ^11.0.1`, `@preact/signals ^2.11.3`, `@preact/preset-vite ^2.10.6`,
  `@babel/core ^7.0.0`. Do not move TypeScript to 7: `typescript-eslint` 8 requires `<6.1.0`.
- Commit after each task with the message given. Do not push in the middle of the plan.
- Simulation tuning: measure at 12,000 ticks on seeds 1, 2, 3, one run at a time, against a baseline
  run of the same command on the previous commit.
- A step that fails 3 times: stop and report the output. Do not work around a gate.

**About the code in this plan.** Signatures, layouts, names, commands, and test assertions are binding.
Function bodies are guidance and were not compiled. If a snippet does not compile, fix the snippet and
keep the signature. The toolchain commands were run on 2026-10-10 and work (`../architecture.md` §1).

Starting values for simulation parameters are derived by arithmetic, not measured. Task 16 tunes them
against the health gate.

## File map

| File | Responsibility | Task |
|---|---|---|
| `Makefile` | `wasm`, `headless`, `dev`, `build`, `check`, `gates` | 1 |
| `Cargo.toml`, `rust-toolchain.toml`, `clippy.toml`, `.cargo/config.toml` | Rust workspace, toolchain pin, banned methods, SIMD flag | 1 |
| `package.json`, `pnpm-workspace.yaml`, `tsconfig.json`, `eslint.config.js`, `vite.config.ts`, `vitest.config.ts`, `index.html`, `.gitignore` | JS project | 1 |
| `crates/sim/src/lib.rs` | Module list | 1 |
| `crates/sim/src/abi.rs` | Every `extern "C"` export. No rules. | 1, 5, 10 |
| `crates/sim/src/rng.rs` | Seeded generator with forks | 2 |
| `crates/sim/src/math.rs` | `sin_cos`, `wrap_angle`, `act` | 2 |
| `crates/sim/src/pool.rs` | Slot allocator: lowest free slot first | 2 |
| `crates/sim/src/snapshot.rs` | `Writer`, `Reader`, `LoadError`, CRC32, envelope | 2, 4 |
| `crates/sim/src/creature.rs` | Creature arrays, spawn, kill | 2, 10 |
| `crates/sim/src/world.rs` | `World`, tick order, `save`, `load`, `state_hash` | 2, 10 |
| `crates/sim/src/grid.rs` | Counting-sort spatial hash | 3 |
| `crates/sim/src/frame.rs` | Frame writer with view culling | 5, 10 |
| `crates/sim/src/params.rs` | Parameter table | 10 |
| `crates/sim/src/control.rs` | Possess, release, input, pick, heirs, death cause | 10 |
| `crates/sim/src/stats.rs` | Counters and `stat(k)` | 10 |
| `crates/sim/src/motor.rs` | Rigid body: force, torque, drag, integrate | 11 |
| `crates/sim/src/plant.rs` | Plant pool, fertility map, growth, seeding | 12 |
| `crates/sim/src/field.rs` | Scent grid: deposit, diffuse, sample | 12 |
| `crates/sim/src/energy.rs` | Eating, upkeep, growth, death | 13 |
| `crates/sim/src/genome.rs` | `Genome`, `BrainGenome`, mutation | 14 |
| `crates/sim/src/repro.rs` | Budding, lineage mark, generation | 14 |
| `crates/sim/src/brain.rs` | Arena, evaluator, starter brain | 15 |
| `crates/sim/src/sense.rs` | Brain inputs | 15 |
| `crates/headless/src/main.rs` | CLI dispatch and argument parsing | 2, 6 |
| `crates/headless/src/bench.rs` | Throughput gate | 6 |
| `crates/headless/src/health.rs` | Health gate, density probe, skip-drift probe | 16 |
| `src/protocol.ts` | Message types, frame layout constants, `viewFrame` | 5, 10 |
| `src/worker/wasm.ts` | Typed wrapper over the ABI: `loadSim`, `Sim` | 5, 10 |
| `src/worker/host.ts` | Message handling and tick loop. No globals. | 7, 10 |
| `src/worker/sim.worker.ts` | Worker entry: load, wire, report errors | 7 |
| `src/render/renderer.ts` | WebGL2 setup, instanced draw, interpolation | 8, 17 |
| `src/render/shaders.ts` | GLSL sources | 8, 17 |
| `src/app/main.ts` | Wiring: worker, renderer, camera, UI mount | 8, 17, 18 |
| `src/app/camera.ts` | Camera state, follow, screen-to-world | 8, 17 |
| `src/app/input.ts` | Keyboard, pointer, touch to `input` messages | 18 |
| `src/ui/state.ts` | Signals fed by worker messages | 8, 18 |
| `src/ui/App.tsx` | Overlay root: error, prompt, HUD, death | 8, 18, 19 |
| `src/ui/DeathOverlay.tsx` | Cause and heir cards | 19 |
| `tests/abi.test.ts` | ABI version, layout constants | 1, 5 |
| `tests/determinism.test.ts` | WASM hash equals native hash | 5 |
| `tests/host.test.ts` | Host behavior with a fake clock | 7, 10, 18, 19 |
| `docs/gates.md` | Each gate, its command, and the proof it rejects bad input | 6, 9, 16 |
| `/.github/workflows/tidepool.yml` | CI for `tidepool/**` | 9 |
| `/eslint.config.js` | Add `tidepool` to the root ignores | 1 |

## Seams

Four test seams. Each task names the one it uses.

1. **`cargo test -p tidepool-sim`** on the public `World` API, native. Every simulation rule is tested
   here. This is the default seam.
2. **Vitest in Node against the built `.wasm`** through `src/worker/wasm.ts`, and against
   `src/worker/host.ts` with a fake clock. It tests the ABI, the frame layout, native-equals-WASM, and
   the worker's message handling without a browser. New, and justified: the ABI and the host are the
   two places where the layers meet.
3. **Headless gates** (`tidepool-headless bench`, `gate-health`). Whole-world properties: throughput and
   ecology.
4. **Browser check.** For tasks that draw or take input. Start `pnpm exec vite --port <unused port>`
   (a reused port can serve a stale module). Open it with the chrome-devtools MCP tools. Keep the tab in
   the foreground: a hidden tab stops `requestAnimationFrame`. Pass means: no console errors, the
   screenshot shows what the task says, and `window.__tidepool` reports the numbers the task names.

## Batches

Tasks in one batch touch different files and may run at the same time. Run batches in order.

| Batch | Tasks | Notes |
|---|---|---|
| A | 1 | |
| B | 2 | |
| C | 3 | |
| D | 4 | |
| E | 5 | |
| F | 6, 7 | Rust headless files and TypeScript worker files |
| G | 8 | |
| H | 9 | M0 exit |
| I | 10 | The M1 skeleton. Everything after builds on it. |
| J | 11, 12, 17 | `motor.rs`, `plant.rs` + `field.rs`, render files |
| K | 13, 18 | `energy.rs`, input and possession UI |
| L | 14 | |
| M | 15, 19 | `brain.rs` + `sense.rs`, death overlay |
| N | 16 | Tuning. Nothing else runs while it measures. |
| O | 20 | M1 exit |

Agent for each task is in its heading. Tier definitions: `../architecture.md` §12.

---

# M0 — Foundation

## Task 1: Scaffold and gates, end to end (`coder-std`, Sonnet)

One export travels the whole path: Rust to `.wasm` to a Vitest assertion, and `make check` is green.

**Files:**
- Create: `Makefile`, `Cargo.toml`, `rust-toolchain.toml`, `clippy.toml`, `.cargo/config.toml`,
  `.gitignore`, `package.json`, `pnpm-workspace.yaml`, `tsconfig.json`, `eslint.config.js`,
  `vite.config.ts`, `vitest.config.ts`, `index.html`
- Create: `crates/sim/Cargo.toml`, `crates/sim/src/lib.rs`, `crates/sim/src/abi.rs`,
  `crates/headless/Cargo.toml`, `crates/headless/src/main.rs`
- Create: `src/app/main.ts`, `tests/abi.test.ts`
- Modify: `/eslint.config.js` (add `'tidepool'` to the `ignores` array)

**Blocked by:** None.

**Interfaces produced:** `tp_abi_version() -> u32` returning `1`. `make wasm`, `make headless`,
`make check`.

- [ ] Write the Rust workspace files exactly:

```toml
# Cargo.toml
[workspace]
resolver = "2"
members = ["crates/sim", "crates/headless"]

[profile.release]
opt-level = 3
lto = "fat"
codegen-units = 1
panic = "abort"
```

```toml
# rust-toolchain.toml
[toolchain]
channel = "1.99.0"
components = ["rustfmt", "clippy"]
targets = ["wasm32-unknown-unknown"]
```

```toml
# .cargo/config.toml
[target.wasm32-unknown-unknown]
rustflags = ["-C", "target-feature=+simd128"]
```

```toml
# clippy.toml
disallowed-methods = [
  { path = "f32::sin", reason = "use sim::math: std transcendentals differ between native and wasm" },
  { path = "f32::cos", reason = "use sim::math: std transcendentals differ between native and wasm" },
  { path = "f32::sin_cos", reason = "use sim::math::sin_cos" },
  { path = "f32::tan", reason = "use sim::math" },
  { path = "f32::exp", reason = "use sim::math" },
  { path = "f32::powf", reason = "use sim::math" },
  { path = "f32::tanh", reason = "use sim::math::act" },
  { path = "f32::atan2", reason = "use sim::math" },
  { path = "f32::mul_add", reason = "fused multiply-add differs between targets" },
]
```

```toml
# crates/sim/Cargo.toml
[package]
name = "tidepool-sim"
version = "0.0.0"
edition = "2021"
publish = false

[lib]
crate-type = ["cdylib", "rlib"]
```

```toml
# crates/headless/Cargo.toml
[package]
name = "tidepool-headless"
version = "0.0.0"
edition = "2021"
publish = false

[dependencies]
tidepool-sim = { path = "../sim" }
```

```rust
// crates/sim/src/lib.rs
pub mod abi;
```

```rust
// crates/sim/src/abi.rs
//! Every export of the WebAssembly module. No simulation rules live here.

pub const ABI_VERSION: u32 = 1;

#[no_mangle]
pub extern "C" fn tp_abi_version() -> u32 {
    ABI_VERSION
}
```

```rust
// crates/headless/src/main.rs
fn main() {
    println!("tidepool-headless abi={}", tidepool_sim::abi::ABI_VERSION);
}
```

- [ ] Write the JS project files:

```yaml
# pnpm-workspace.yaml  (makes tidepool/ its own pnpm root with its own lockfile)
allowBuilds:
  esbuild: true
```

```json
{
  "name": "tidepool",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "packageManager": "pnpm@11.7.0",
  "devDependencies": {
    "@babel/core": "^7.0.0",
    "@preact/preset-vite": "^2.10.6",
    "@types/node": "^25.9.3",
    "eslint": "^10.5.0",
    "eslint-config-prettier": "^10.1.8",
    "prettier": "^3.8.4",
    "typescript": "^6.0.3",
    "typescript-eslint": "^8.61.0",
    "vite": "^8.0.16",
    "vitest": "^4.1.8"
  },
  "dependencies": {
    "@preact/signals": "^2.11.3",
    "preact": "^11.0.1"
  }
}
```

```json
// tsconfig.json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable", "WebWorker"],
    "types": ["node", "vite/client"],
    "jsx": "react-jsx",
    "jsxImportSource": "preact",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "verbatimModuleSyntax": true,
    "isolatedModules": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "noEmit": true
  },
  "include": ["src", "tests", "*.config.ts"]
}
```

```ts
// vite.config.ts
import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

export default defineConfig({
  plugins: [preact()],
  worker: { format: 'es' },
});
```

```ts
// vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { include: ['tests/**/*.test.ts'], pool: 'forks', testTimeout: 60000 },
});
```

```
# .gitignore
node_modules/
dist/
target/
src/wasm/
```

- [ ] `eslint.config.js`: copy the structure of `/eslint.config.js`. Type-checked rules on
  `src/**/*.{ts,tsx}` and `tests/**/*.ts`. Ignore `dist`, `target`, `node_modules`, `spikes`,
  `src/wasm`, `*.config.ts`, `eslint.config.js`. Add `no-restricted-imports` blocks for the dependency
  rule in `../architecture.md` §4:
  - `src/render/**`: may not import `**/worker/**`, `**/ui/**`, `**/app/**`.
  - `src/ui/**`: may not import `**/worker/**`, `**/render/**`, `**/app/**`.
  - `src/worker/**`: may not import `**/render/**`, `**/ui/**`, `**/app/**`.
- [ ] `index.html`: a full-window `<canvas id="view">`, a `<div id="ui">`, and
  `<script type="module" src="/src/app/main.ts">`. Dark background `#04121c`. No scrollbars.
  `<meta name="viewport" content="width=device-width, initial-scale=1, user-scalable=no">`.
- [ ] `src/app/main.ts`: one line, `export {};`. Task 8 fills it.
- [ ] Write the `Makefile`:

```make
.PHONY: wasm headless dev build check gates fmt

WASM := target/wasm32-unknown-unknown/release/tidepool_sim.wasm
HEADLESS := target/release/tidepool-headless

wasm: ## Build the core for the browser
	cargo build --release -p tidepool-sim --target wasm32-unknown-unknown
	mkdir -p src/wasm
	cp $(WASM) src/wasm/tidepool_sim.wasm

headless: ## Build the native CLI
	cargo build --release -p tidepool-headless

dev: wasm ## Run the dev server
	pnpm exec vite

build: wasm ## Production bundle
	pnpm exec vite build

fmt: ## Format Rust and TypeScript
	cargo fmt --all
	pnpm exec prettier --write src tests

check: wasm headless ## Every fast gate
	cargo fmt --all -- --check
	cargo clippy --workspace --all-targets -- -D warnings
	cargo test --workspace
	pnpm exec tsc --noEmit
	pnpm exec eslint .
	pnpm exec vitest run

gates: headless ## Throughput and health gates (tasks 6 and 16 add the commands)
	@echo "no gates yet"
```

- [ ] Write the failing test:

```ts
// tests/abi.test.ts
import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';

const bytes = readFileSync(new URL('../src/wasm/tidepool_sim.wasm', import.meta.url));

test('the module loads with no imports and reports ABI 1', async () => {
  const { instance } = await WebAssembly.instantiate(bytes, {});
  const version = instance.exports.tp_abi_version as () => number;
  expect(version()).toBe(1);
});
```

- [ ] Run `pnpm install`. Expect a new `pnpm-lock.yaml` and `node_modules/` inside `tidepool/`, and no
  change to `/pnpm-lock.yaml`.
- [ ] Run `make check`. Expect: every step exits 0, Vitest reports `1 passed`.
- [ ] **Prove the lint gate.** Add `pub fn bad(x: f32) -> f32 { x.sin() }` to `lib.rs`. Run
  `cargo clippy --workspace --all-targets -- -D warnings`. Expect:
  `error: use of a disallowed method \`f32::sin\``. Remove the function.
- [ ] From the repo root run `pnpm lint` and `pnpm typecheck`. Expect both to exit 0 as before.
- [ ] Commit: `feat(tidepool): scaffold with Rust core, WASM build, and gates`.

## Task 2: Core skeleton — drifting circles with a state hash (`coder`, Opus)

**Files:**
- Create: `crates/sim/src/rng.rs`, `math.rs`, `pool.rs`, `snapshot.rs`, `creature.rs`, `world.rs`
- Modify: `crates/sim/src/lib.rs`, `crates/headless/src/main.rs`
- Test: inline `#[cfg(test)]` modules, plus `crates/sim/tests/determinism.rs`

**Blocked by:** Task 1. **Seam:** 1.

**Interfaces produced:**

```rust
// rng.rs — splitmix64
#[derive(Clone)]
pub struct Rng(pub u64);
impl Rng {
    pub fn new(seed: u64) -> Rng;
    pub fn next_u64(&mut self) -> u64;
    pub fn unit(&mut self) -> f32;                 // [0, 1): (next_u64() >> 40) as f32 / 16_777_216.0
    pub fn range(&mut self, lo: f32, hi: f32) -> f32;
    pub fn below(&mut self, n: u32) -> u32;        // [0, n)
    pub fn gauss(&mut self) -> f32;                // (u+u+u+u - 2) * 1.732_050_8, unit variance, no transcendentals
    pub fn fork(&self, tag: u64) -> Rng;           // independent stream. Does not advance self.
}

// math.rs
pub const PI: f32 = 3.141_592_7;
pub const TAU: f32 = 6.283_185_5;
pub fn wrap_angle(a: f32) -> f32;                  // into (-PI, PI]
pub fn sin_cos(a: f32) -> (f32, f32);              // polynomial, max error under 1e-4, any finite input
pub fn act(x: f32) -> f32;                         // clamp to [-3, 3], then x*(27+x*x)/(27+9*x*x)

// pool.rs
pub struct Slots { /* alive bitset, count */ }
impl Slots {
    pub fn new(capacity: u32) -> Slots;
    pub fn alloc(&mut self) -> Option<u32>;        // the LOWEST free slot
    pub fn free(&mut self, slot: u32);
    pub fn is_alive(&self, slot: u32) -> bool;
    pub fn count(&self) -> u32;
    pub fn capacity(&self) -> u32;
    pub fn high_water(&self) -> u32;               // one past the highest slot ever allocated
}

// snapshot.rs
pub struct Writer { pub bytes: Vec<u8> }
impl Writer {
    pub fn new() -> Writer;
    pub fn u32(&mut self, v: u32);
    pub fn f32(&mut self, v: f32);                 // to_bits, little-endian
    pub fn u32s(&mut self, v: &[u32]);             // length prefix, then values
    pub fn f32s(&mut self, v: &[f32]);
    pub fn u16s(&mut self, v: &[u16]);
    pub fn u8s(&mut self, v: &[u8]);
}
pub fn crc32(bytes: &[u8]) -> u32;                 // IEEE polynomial 0xEDB88320, table built at first use or const

// creature.rs
pub const MAX_CREATURES: u32 = 4096;
pub struct Creatures {
    pub slots: Slots,
    pub uid: Vec<u32>, pub x: Vec<f32>, pub y: Vec<f32>, pub vx: Vec<f32>, pub vy: Vec<f32>,
    pub radius: Vec<f32>,
}

// world.rs
pub struct World {
    pub tick: u32, pub w: f32, pub h: f32,
    pub creatures: Creatures,
    pub next_uid: u32,                             // starts at 1. 0 means none.
    pub rng_spawn: Rng,
}
impl World {
    pub fn new(seed: u32, w: f32, h: f32) -> World;
    pub fn spawn_drifters(&mut self, n: u32);      // random position, velocity in [-1, 1], radius in [3, 8]
    pub fn tick(&mut self);
    pub fn run(&mut self, ticks: u32);
    pub fn save_payload(&self) -> Vec<u8>;         // every field that affects the future, live slots only
    pub fn state_hash(&self) -> u32;               // crc32(save_payload())
}
```

`state_hash` is the CRC of the saved bytes. One function decides what the state is, so the hash cannot
miss a field that the snapshot has. The draft's hash missed genes for months.

M0 tick: `x += vx`, `y += vy`, reflect velocity at the world edge, `tick += 1`.

`sin_cos`: reduce to `[-PI, PI]` with `wrap_angle`, fold to `[-PI/2, PI/2]`, then odd polynomial
`x - x³/6 + x⁵/120 - x⁷/5040` for sine, and cosine from `sin_cos(a + PI/2)`'s sine.

- [ ] Write the failing tests:

```rust
// crates/sim/tests/determinism.rs
use tidepool_sim::world::World;

fn hash_after(seed: u32, ticks: u32) -> u32 {
    let mut w = World::new(seed, 1536.0, 1024.0);
    w.spawn_drifters(500);
    w.run(ticks);
    w.state_hash()
}

#[test]
fn same_seed_same_hash() {
    assert_eq!(hash_after(1, 1000), hash_after(1, 1000));
}

#[test]
fn different_seed_different_hash() {
    assert_ne!(hash_after(1, 1000), hash_after(2, 1000));
}

#[test]
fn hash_changes_every_tick() {
    assert_ne!(hash_after(1, 1000), hash_after(1, 1001));
}

#[test]
fn drifters_stay_inside_the_world() {
    let mut w = World::new(3, 1536.0, 1024.0);
    w.spawn_drifters(500);
    w.run(5000);
    for s in 0..w.creatures.slots.high_water() as usize {
        if w.creatures.slots.is_alive(s as u32) {
            assert!(w.creatures.x[s] >= 0.0 && w.creatures.x[s] <= 1536.0);
            assert!(w.creatures.y[s] >= 0.0 && w.creatures.y[s] <= 1024.0);
        }
    }
}
```

```rust
// in pool.rs
#[test]
fn alloc_returns_lowest_free_slot() {
    let mut s = Slots::new(8);
    assert_eq!((s.alloc(), s.alloc(), s.alloc()), (Some(0), Some(1), Some(2)));
    s.free(1);
    assert_eq!(s.alloc(), Some(1));
    assert_eq!(s.count(), 3);
}

#[test]
fn alloc_fails_when_full() {
    let mut s = Slots::new(2);
    s.alloc();
    s.alloc();
    assert_eq!(s.alloc(), None);
}

// in rng.rs
#[test]
fn fork_is_independent_and_does_not_advance_parent() {
    let a = Rng::new(7);
    let mut f1 = a.fork(1);
    let mut f2 = a.fork(2);
    let mut again = a.fork(1);
    assert_ne!(f1.next_u64(), f2.next_u64());
    let mut f1b = a.fork(1);
    assert_eq!(f1b.next_u64(), again.next_u64());
}

#[test]
fn gauss_has_unit_variance() {
    let mut r = Rng::new(1);
    let n = 100_000;
    let (mut sum, mut sq) = (0.0f64, 0.0f64);
    for _ in 0..n {
        let g = r.gauss() as f64;
        sum += g;
        sq += g * g;
    }
    let mean = sum / n as f64;
    assert!(mean.abs() < 0.02);
    assert!((sq / n as f64 - mean * mean - 1.0).abs() < 0.03);
}

// in math.rs
#[test]
fn sin_cos_is_close_to_std() {
    let mut a = -20.0f32;
    while a < 20.0 {
        let (s, c) = sin_cos(a);
        #[allow(clippy::disallowed_methods)]
        let (es, ec) = ((a as f64).sin() as f32, (a as f64).cos() as f32);
        assert!((s - es).abs() < 1e-4 && (c - ec).abs() < 1e-4, "at {a}");
        a += 0.01;
    }
}

#[test]
fn act_is_odd_bounded_and_monotonic() {
    assert_eq!(act(0.0), 0.0);
    assert!((act(3.0) - 1.0).abs() < 1e-6 && (act(100.0) - 1.0).abs() < 1e-6);
    assert_eq!(act(-1.5), -act(1.5));
    assert!(act(0.5) < act(0.6));
}
```

- [ ] Run `cargo test --workspace`. Expect: compile errors (nothing exists yet).
- [ ] Implement the modules. Add them to `lib.rs` as `pub mod`.
- [ ] Headless `run`: `tidepool-headless run --seed <u32> --ticks <u32> --creatures <u32>
  [--world <W>x<H>]`. Default world `1536x1024`. Print exactly one line:
  `tick=<n> creatures=<n> plants=0 hash=<8 hex digits>`. Unknown flag: print usage to stderr, exit 2.
- [ ] Run `cargo test --workspace`. Expect: all pass.
- [ ] Run `make headless && target/release/tidepool-headless run --seed 1 --ticks 1000 --creatures 500`
  twice. Expect: the same line both times, `creatures=500`.
- [ ] Run `make check`. Expect: exit 0.
- [ ] Commit: `feat(tidepool): core skeleton with seeded RNG, slot pool, and state hash`.

## Task 3: Spatial hash and soft repulsion (`coder-std`, Sonnet)

The hash is used the moment it exists: drifters push each other apart.

**Files:**
- Create: `crates/sim/src/grid.rs`
- Modify: `crates/sim/src/world.rs` (tick calls `grid.rebuild`, then repulsion before integrate),
  `crates/sim/src/lib.rs`

**Blocked by:** Task 2. **Seam:** 1.

**Interfaces produced:**

```rust
// grid.rs
pub const CELL: f32 = 32.0;
pub struct Grid {
    pub gw: usize, pub gh: usize,
    pub cell_start: Vec<u32>,                      // gw*gh + 1 entries
    pub sorted: Vec<u32>,                          // slots, grouped by cell, ascending slot within a cell
}
impl Grid {
    pub fn new(w: f32, h: f32) -> Grid;            // w and h must be multiples of CELL
    pub fn rebuild(&mut self, slots: &Slots, x: &[f32], y: &[f32]);
    /// Calls f(slot) for every entry in the cells that the box [x0,x1] x [y0,y1] touches.
    /// Rows are contiguous in `sorted`, so each row is one run. Order is deterministic.
    pub fn for_each_in_box(&self, x0: f32, y0: f32, x1: f32, y1: f32, f: impl FnMut(u32));
}
```

Port the counting sort from `spikes/kernel-bench/rust/src/lib.rs:277-296` (`grid`) and the repulsion
loop from `lib.rs:343-395` (`act`). Repulsion: for each pair closer than the sum of radii, push each
velocity apart by `(overlap / distance) * 0.2` along the line between them. `World` is not saved with
the grid: it is rebuilt each tick.

- [ ] Write the failing tests:

```rust
// in grid.rs
#[test]
fn box_query_matches_brute_force() {
    let mut w = crate::world::World::new(5, 1536.0, 1024.0);
    w.spawn_drifters(800);
    w.grid.rebuild(&w.creatures.slots, &w.creatures.x, &w.creatures.y);
    let (qx, qy, r) = (700.0f32, 500.0f32, 60.0f32);
    let mut got: Vec<u32> = Vec::new();
    w.grid.for_each_in_box(qx - r, qy - r, qx + r, qy + r, |s| {
        let (dx, dy) = (w.creatures.x[s as usize] - qx, w.creatures.y[s as usize] - qy);
        if dx * dx + dy * dy <= r * r {
            got.push(s);
        }
    });
    got.sort_unstable();
    let want: Vec<u32> = (0..800u32)
        .filter(|&s| {
            let (dx, dy) = (w.creatures.x[s as usize] - qx, w.creatures.y[s as usize] - qy);
            dx * dx + dy * dy <= r * r
        })
        .collect();
    assert!(!want.is_empty());
    assert_eq!(got, want);
}

#[test]
fn box_query_clamps_at_world_edges() {
    let mut w = crate::world::World::new(5, 1536.0, 1024.0);
    w.spawn_drifters(200);
    w.grid.rebuild(&w.creatures.slots, &w.creatures.x, &w.creatures.y);
    let mut n = 0;
    w.grid.for_each_in_box(-500.0, -500.0, 5000.0, 5000.0, |_| n += 1);
    assert_eq!(n, 200);
}
```

```rust
// add to crates/sim/tests/determinism.rs
#[test]
fn overlapping_drifters_separate() {
    let mut w = World::new(1, 1536.0, 1024.0);
    w.spawn_drifters(2);
    for s in 0..2 {
        w.creatures.x[s] = 500.0 + s as f32;
        w.creatures.y[s] = 500.0;
        w.creatures.vx[s] = 0.0;
        w.creatures.vy[s] = 0.0;
        w.creatures.radius[s] = 6.0;
    }
    w.run(200);
    let d = (w.creatures.x[0] - w.creatures.x[1]).hypot(w.creatures.y[0] - w.creatures.y[1]);
    assert!(d >= 11.0, "distance {d}");
}
```

(`hypot` is banned in the core. Integration test files run native only and start with
`#![allow(clippy::disallowed_methods)]`.)

- [ ] Run `cargo test --workspace`. Expect: the three new tests fail to compile or fail.
- [ ] Implement. Add `pub grid: Grid` to `World`.
- [ ] Run `cargo test --workspace`. Expect: all pass, including the Task 2 determinism tests.
- [ ] Commit: `feat(tidepool): counting-sort spatial hash and soft repulsion`.

## Task 4: Snapshot load and round trip (`coder`, Opus)

**Files:**
- Modify: `crates/sim/src/snapshot.rs`, `crates/sim/src/world.rs`, `crates/sim/src/creature.rs`,
  `crates/sim/src/rng.rs`
- Test: `crates/sim/tests/snapshot.rs`

**Blocked by:** Task 3. **Seam:** 1.

**Interfaces produced:**

```rust
// snapshot.rs
pub const MAGIC: [u8; 4] = *b"TDPL";
pub const FORMAT_VERSION: u32 = 1;

#[derive(Debug, PartialEq)]
pub enum LoadError { TooShort, BadMagic, BadVersion(u32), BadChecksum, Truncated, Invalid(&'static str) }

pub struct Reader<'a> { /* bytes, position */ }
impl<'a> Reader<'a> {
    pub fn new(bytes: &'a [u8]) -> Reader<'a>;
    pub fn u32(&mut self) -> Result<u32, LoadError>;
    pub fn f32(&mut self) -> Result<f32, LoadError>;
    pub fn u32s(&mut self) -> Result<Vec<u32>, LoadError>;
    pub fn f32s(&mut self) -> Result<Vec<f32>, LoadError>;
    pub fn u16s(&mut self) -> Result<Vec<u16>, LoadError>;
    pub fn u8s(&mut self) -> Result<Vec<u8>, LoadError>;
}

// world.rs
impl World {
    /// MAGIC, FORMAT_VERSION, payload length, payload, crc32(payload). All little-endian.
    pub fn save(&self) -> Vec<u8>;
    pub fn load(bytes: &[u8]) -> Result<World, LoadError>;
}
```

A length prefix larger than the bytes that remain is `Truncated`, checked before any allocation. A slot
index at or past capacity is `Invalid`. `load` never panics on any input.

The save order is fixed and each module owns its part: `world` header (tick, w, h, next_uid, RNG
streams), then `creatures`. Later tasks append their module's `save` and `load` calls in `World::save`
and `World::load` and raise `FORMAT_VERSION`.

- [ ] Write the failing tests:

```rust
// crates/sim/tests/snapshot.rs
use tidepool_sim::snapshot::LoadError;
use tidepool_sim::world::World;

fn world_at(ticks: u32) -> World {
    let mut w = World::new(9, 1536.0, 1024.0);
    w.spawn_drifters(400);
    w.run(ticks);
    w
}

#[test]
fn load_then_run_equals_unbroken_run() {
    let saved = world_at(500).save();
    let mut resumed = World::load(&saved).expect("load");
    resumed.run(500);
    assert_eq!(resumed.state_hash(), world_at(1000).state_hash());
}

#[test]
fn load_gives_the_same_hash_immediately() {
    let w = world_at(300);
    assert_eq!(World::load(&w.save()).expect("load").state_hash(), w.state_hash());
}

#[test]
fn spawning_after_load_matches_spawning_without_it() {
    let mut a = world_at(100);
    let mut b = World::load(&a.save()).expect("load");
    a.spawn_drifters(10);
    b.spawn_drifters(10);
    assert_eq!(a.state_hash(), b.state_hash());
}

#[test]
fn a_flipped_byte_is_rejected() {
    let mut bytes = world_at(100).save();
    let mid = bytes.len() / 2;
    bytes[mid] ^= 0x40;
    assert_eq!(World::load(&bytes).err(), Some(LoadError::BadChecksum));
}

#[test]
fn garbage_is_rejected_without_panic() {
    assert_eq!(World::load(&[]).err(), Some(LoadError::TooShort));
    assert_eq!(World::load(b"NOPE00000000000000000000").err(), Some(LoadError::BadMagic));
    let mut bytes = world_at(10).save();
    bytes.truncate(bytes.len() - 9);
    assert!(World::load(&bytes).is_err());
}
```

`spawning_after_load_matches` fails if an RNG stream or `next_uid` is missing from the snapshot.

- [ ] Run `cargo test --workspace`. Expect: the new tests fail to compile.
- [ ] Implement.
- [ ] Run `cargo test --workspace`. Expect: all pass.
- [ ] **Prove the round-trip test.** In `World::save_payload`, comment out the line that writes `vy`.
  Run `cargo test --test snapshot`. Expect: `load_then_run_equals_unbroken_run` FAILS. Restore the line.
- [ ] Commit: `feat(tidepool): checksummed snapshot with a save-load-continue test`.

## Task 5: ABI, frame writer, WASM wrapper, native-equals-WASM (`coder`, Opus)

**Files:**
- Create: `crates/sim/src/frame.rs`, `src/protocol.ts`, `src/worker/wasm.ts`,
  `tests/determinism.test.ts`
- Modify: `crates/sim/src/abi.rs`, `crates/sim/src/world.rs`, `crates/sim/src/lib.rs`,
  `tests/abi.test.ts`

**Blocked by:** Task 4. **Seam:** 2.

**Interfaces produced — ABI version 1:**

```rust
tp_abi_version() -> u32
tp_new(seed: u32, w: f32, h: f32) -> *mut World
tp_free(world: *mut World)
tp_spawn_drifters(world: *mut World, n: u32)
tp_tick(world: *mut World, n: u32)
tp_tick_count(world: *const World) -> u32
tp_hash(world: *const World) -> u32
tp_stat(world: *const World, k: u32) -> f64          // 0 creatures alive, 1 plants alive (0 in M0)
tp_frame_header_words() -> u32                       // 8
tp_frame_creature_stride() -> u32                    // 10
tp_frame_plant_stride() -> u32                       // 4
tp_frame_write(world: *mut World, x0: f32, y0: f32, x1: f32, y1: f32) -> u32   // u32 words written
tp_frame_ptr(world: *const World) -> *const u32      // valid until the next tp_frame_write or tp_free
tp_alloc(len: u32) -> *mut u8
tp_dealloc(ptr: *mut u8, len: u32)
tp_save(world: *mut World) -> u32                    // bytes. Buffer valid until the next tp_save or tp_free
tp_save_ptr(world: *const World) -> *const u8
tp_load(ptr: *const u8, len: u32) -> *mut World      // null on error
tp_error_ptr() -> *const u8                          // UTF-8 message for the last failed tp_load
tp_error_len() -> u32
```

`World` gains two scratch buffers that are not saved: `frame: Vec<u32>` and `save_buf: Vec<u8>`.

**Frame layout.** One buffer of `u32` words. Floats are stored by bit pattern.

| Words | Content |
|---|---|
| 0 | tick |
| 1 | creature records in this frame |
| 2 | plant records in this frame |
| 3 | creatures alive in the world |
| 4 | plants alive in the world |
| 5 | slot of the possessed creature, or `0xFFFF_FFFF` |
| 6 | 1 when the possessed creature's brain is driving, else 0 |
| 7 | reserved, 0 |
| then | creature records, 10 words each |
| then | plant records, 4 words each |

Creature record: `x`, `y`, `heading`, `length`, `width`, `hue`, `energy01` (7 floats), then `uid`,
`slot`, `flags` (3 integers). Flags: bit 0 player lineage, bit 1 possessed, bit 2 juvenile.
Plant record: `x`, `y`, `radius`, `reserve01`.

In M0 a creature record has `heading` 0, `length` and `width` both `2 * radius`, `hue` from
`(uid * 0.618_034) % 1`, `energy01` 1, `flags` 0. There are no plant records.

`tp_frame_write` includes a creature when its position is inside the rectangle grown by 32 on each
side. Use `Grid::for_each_in_box`. Record order is the grid's order, which is deterministic.

```ts
// src/protocol.ts (M0 part)
export const ABI_VERSION = 1;
export const TICK_HZ = 20;
export const FRAME_HEADER_WORDS = 8;
export const CREATURE_STRIDE = 10;
export const PLANT_STRIDE = 4;
export const NO_SLOT = 0xffffffff;

export const C_X = 0, C_Y = 1, C_HEADING = 2, C_LENGTH = 3, C_WIDTH = 4, C_HUE = 5, C_ENERGY = 6;
export const C_UID = 7, C_SLOT = 8, C_FLAGS = 9;
export const FLAG_LINEAGE = 1, FLAG_POSSESSED = 2, FLAG_JUVENILE = 4;

export interface FrameView {
  readonly buffer: ArrayBuffer;
  readonly f32: Float32Array;
  readonly u32: Uint32Array;
  readonly tick: number;
  readonly creatureCount: number;
  readonly plantCount: number;
  readonly creaturesAlive: number;
  readonly plantsAlive: number;
  readonly possessedSlot: number;
  readonly brainDriving: boolean;
  readonly creatureBase: number; // word index of the first creature record
  readonly plantBase: number;
}
export function viewFrame(buffer: ArrayBuffer): FrameView;
```

```ts
// src/worker/wasm.ts
export interface Sim {
  readonly abi: number;
  readonly worldW: number;
  readonly worldH: number;
  spawnDrifters(n: number): void;
  tick(n: number): void;
  tickCount(): number;
  hash(): number;                                   // unsigned
  stat(k: number): number;
  /** Writes a frame for the rectangle and copies it into `into`. Returns words written, or -1 if `into` is too small. */
  writeFrame(x0: number, y0: number, x1: number, y1: number, into: ArrayBuffer): number;
  save(): Uint8Array;                               // a copy
  free(): void;
}
export class SimError extends Error {}
/** Instantiates the module and makes or loads a world. Throws SimError on a wrong ABI version or a bad snapshot. */
export function createSim(
  module: WebAssembly.Module,
  opts: { seed: number; worldW: number; worldH: number; snapshot?: Uint8Array },
): Sim;
```

`wasm.ts` never keeps a typed-array view across calls. It makes a new view of `exports.memory.buffer`
each time it reads, because memory growth detaches old views.

- [ ] Write the failing tests:

```ts
// tests/abi.test.ts — replace the file
import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import * as P from '../src/protocol';
import { createSim, SimError } from '../src/worker/wasm';

const bytes = readFileSync(new URL('../src/wasm/tidepool_sim.wasm', import.meta.url));
const module = new WebAssembly.Module(bytes);
const fresh = () => createSim(module, { seed: 1, worldW: 1536, worldH: 1024 });

test('ABI version matches protocol.ts', () => {
  expect(fresh().abi).toBe(P.ABI_VERSION);
});

test('frame layout constants match the module', () => {
  const { exports } = new WebAssembly.Instance(module, {});
  const n = (name: string) => (exports[name] as () => number)();
  expect(n('tp_frame_header_words')).toBe(P.FRAME_HEADER_WORDS);
  expect(n('tp_frame_creature_stride')).toBe(P.CREATURE_STRIDE);
  expect(n('tp_frame_plant_stride')).toBe(P.PLANT_STRIDE);
});

test('a frame of the whole world holds every creature', () => {
  const sim = fresh();
  sim.spawnDrifters(300);
  sim.tick(10);
  const buf = new ArrayBuffer(4 * (P.FRAME_HEADER_WORDS + 300 * P.CREATURE_STRIDE));
  const words = sim.writeFrame(0, 0, 1536, 1024, buf);
  const f = P.viewFrame(buf);
  expect(words).toBe(P.FRAME_HEADER_WORDS + 300 * P.CREATURE_STRIDE);
  expect(f.tick).toBe(10);
  expect(f.creatureCount).toBe(300);
  expect(f.creaturesAlive).toBe(300);
  expect(f.possessedSlot).toBe(P.NO_SLOT);
  const uids = new Set<number>();
  for (let i = 0; i < f.creatureCount; i++) {
    const o = f.creatureBase + i * P.CREATURE_STRIDE;
    expect(f.f32[o + P.C_X]).toBeGreaterThanOrEqual(0);
    expect(f.f32[o + P.C_X]).toBeLessThanOrEqual(1536);
    expect(f.f32[o + P.C_LENGTH]).toBeGreaterThan(0);
    uids.add(f.u32[o + P.C_UID] ?? 0);
  }
  expect(uids.size).toBe(300);
  expect(uids.has(0)).toBe(false);
});

test('a small view holds fewer creatures and only ones near it', () => {
  const sim = fresh();
  sim.spawnDrifters(1000);
  sim.tick(1);
  const buf = new ArrayBuffer(4 * (P.FRAME_HEADER_WORDS + 1000 * P.CREATURE_STRIDE));
  sim.writeFrame(400, 300, 600, 500, buf);
  const f = P.viewFrame(buf);
  expect(f.creatureCount).toBeGreaterThan(0);
  expect(f.creatureCount).toBeLessThan(300);
  for (let i = 0; i < f.creatureCount; i++) {
    const o = f.creatureBase + i * P.CREATURE_STRIDE;
    expect(f.f32[o + P.C_X]).toBeGreaterThan(400 - 64);
    expect(f.f32[o + P.C_X]).toBeLessThan(600 + 64);
  }
});

test('writeFrame reports a buffer that is too small', () => {
  const sim = fresh();
  sim.spawnDrifters(300);
  expect(sim.writeFrame(0, 0, 1536, 1024, new ArrayBuffer(64))).toBe(-1);
});

test('save then load gives the same hash and the same future', () => {
  const a = fresh();
  a.spawnDrifters(300);
  a.tick(200);
  const b = createSim(module, { seed: 0, worldW: 1536, worldH: 1024, snapshot: a.save() });
  expect(b.hash()).toBe(a.hash());
  a.tick(200);
  b.tick(200);
  expect(b.hash()).toBe(a.hash());
});

test('a corrupt snapshot throws SimError with the reason', () => {
  const a = fresh();
  a.spawnDrifters(50);
  const snap = a.save();
  snap[snap.length >> 1] = (snap[snap.length >> 1] ?? 0) ^ 0x40;
  expect(() => createSim(module, { seed: 0, worldW: 1536, worldH: 1024, snapshot: snap })).toThrow(
    SimError,
  );
});
```

```ts
// tests/determinism.test.ts
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';
import { createSim } from '../src/worker/wasm';

const module = new WebAssembly.Module(
  readFileSync(new URL('../src/wasm/tidepool_sim.wasm', import.meta.url)),
);
const headless = fileURLToPath(new URL('../target/release/tidepool-headless', import.meta.url));

function nativeHash(seed: number, ticks: number, creatures: number): number {
  const out = execFileSync(headless, [
    'run', '--seed', String(seed), '--ticks', String(ticks), '--creatures', String(creatures),
  ]).toString();
  const m = /hash=([0-9a-f]{8})/.exec(out);
  if (!m?.[1]) throw new Error(`no hash in headless output: ${out}. Fix: run \`make headless\`.`);
  return parseInt(m[1], 16);
}

test.each([1, 2, 3])('WASM and native agree after 2,000 ticks (seed %i)', (seed) => {
  const sim = createSim(module, { seed, worldW: 1536, worldH: 1024 });
  sim.spawnDrifters(500);
  sim.tick(2000);
  expect(sim.hash()).toBe(nativeHash(seed, 2000, 500));
});
```

- [ ] Run `make wasm headless && pnpm exec vitest run`. Expect: failures (exports missing).
- [ ] Implement `frame.rs`, the exports, `protocol.ts`, `wasm.ts`.
- [ ] Run `make check`. Expect: exit 0. Vitest reports 10 passed.
- [ ] If `determinism.test.ts` fails: find the first tick where the hashes differ (run both for 1, 2, 4,
  8... ticks). Look for a banned float call, a `usize` that differs in width, or iteration over a
  non-deterministic order. Do not weaken the test. If native and WASM cannot agree after 3 attempts,
  stop and report: `../architecture.md` §5.3 names the fallback, and the orchestrator decides.
- [ ] Commit: `feat(tidepool): C ABI, culled frame writer, and native-equals-WASM test`.

## Task 6: Throughput gate (`coder-std`, Sonnet)

**Files:**
- Create: `crates/headless/src/bench.rs`, `docs/gates.md`
- Modify: `crates/headless/src/main.rs`, `Makefile`

**Blocked by:** Task 5. Runs alongside Task 7. **Seam:** 3.

**Interfaces produced:**
`tidepool-headless bench [--creatures 1500] [--world 3072x1536] [--ticks 2000] [--warmup 200]
[--runs 5] [--floor 2400]`. Prints one line per run, then
`bench creatures=<mean alive> median_tps=<n> floor=<n> PASS|FAIL`. Exit 0 on PASS, 1 on FAIL. A run
whose mean alive count is below 80% of `--creatures` prints `VOID: population fell` and exits 1.

Each run starts from seed 1 in a new `World`, so each run does the same work. Time only the ticks, with
`std::time::Instant`.

- [ ] Implement `bench.rs` and the subcommand.
- [ ] `Makefile`: replace the `gates` recipe with `$(HEADLESS) bench`.
- [ ] Run `make gates`. Expect: `PASS` and a `median_tps` far above 2,400. M0 has no senses, brains, or
  fields, so this number is a ceiling, not the real reading.
- [ ] **Prove the gate.** Run `target/release/tidepool-headless bench --floor 1000000000; echo $?`.
  Expect: `FAIL` and `1`.
- [ ] Write `docs/gates.md`: a table with one row per gate so far (Clippy banned methods, snapshot
  round trip, native-equals-WASM, throughput). Columns: gate, command, the bad input used to prove it,
  the output seen, date. Fill it from the proofs in tasks 1, 4, and this one.
- [ ] Commit: `feat(tidepool): throughput gate with a recorded failure proof`.

## Task 7: Worker host and protocol (`coder`, Opus)

**Files:**
- Create: `src/worker/host.ts`, `src/worker/sim.worker.ts`, `tests/host.test.ts`
- Modify: `src/protocol.ts`

**Blocked by:** Task 5. Runs alongside Task 6. **Seam:** 2.

**Interfaces produced:**

```ts
// src/protocol.ts (add)
export const WORLD_W = 1536;
export const WORLD_H = 1024;
export const M0_DRIFTERS = 1500;
export const FRAME_POOL = 3;
export const MAX_FRAME_BYTES =
  4 * (FRAME_HEADER_WORDS + 4096 * CREATURE_STRIDE + 8192 * PLANT_STRIDE);

export type ToWorker =
  | { type: 'init'; seed: number; snapshot?: ArrayBuffer }
  | { type: 'view'; x0: number; y0: number; x1: number; y1: number }
  | { type: 'speed'; ticksPerSecond: number } // 0 pauses. TICK_HZ is normal.
  | { type: 'recycle'; buffer: ArrayBuffer }
  | { type: 'bench'; ticks: number };

export type FromWorker =
  | { type: 'ready'; abi: number; worldW: number; worldH: number }
  | { type: 'frame'; buffer: ArrayBuffer }
  | { type: 'stats'; tick: number; creatures: number; plants: number; tickMicros: number }
  | { type: 'benchResult'; ticks: number; millis: number; creatures: number }
  | { type: 'error'; message: string };
```

```ts
// src/worker/host.ts
import type { FromWorker, ToWorker } from '../protocol';
import type { Sim } from './wasm';

export interface HostDeps {
  now(): number;                                          // milliseconds
  post(msg: FromWorker, transfer?: Transferable[]): void;
  every(ms: number, fn: () => void): () => void;          // returns cancel
  makeSim(opts: { seed: number; snapshot?: Uint8Array }): Sim;   // throws SimError
}
export interface Host {
  handle(msg: ToWorker): void;
}
export function createHost(deps: HostDeps): Host;
```

Behavior:

- `init`: make the sim, spawn `M0_DRIFTERS` when there is no snapshot, post `ready`, allocate
  `FRAME_POOL` buffers of `MAX_FRAME_BYTES`, start `every(10, step)`. A second `init` posts `error`.
- `step`: add elapsed time to an accumulator. While it holds one tick period and fewer than 5 ticks ran
  in this step: `sim.tick(1)`. Drop any backlog beyond 5 ticks. If at least one tick ran and the pool
  has a buffer: write a frame for the current view and post it with the buffer in the transfer list. If
  the pool is empty, post nothing and keep ticking.
- `view`: store the rectangle. The default view is the whole world.
- `speed`: set ticks per second. 0 pauses and clears the accumulator.
- `recycle`: return the buffer to the pool if its byte length is `MAX_FRAME_BYTES`.
- `bench`: make a second sim (seed 1, same world size, `M0_DRIFTERS`), run `ticks` ticks, post
  `benchResult`, free it. The main world does not advance during a bench.
- Every 10th tick post `stats`. `tickMicros` is the mean wall time of `sim.tick(1)` over those ticks.
- Any exception in `handle` or `step` posts `error` with the message and stops the loop. A message
  before `init` (other than `init`) posts `error`.

`sim.worker.ts` is glue only: import the module URL with
`import wasmUrl from '../wasm/tidepool_sim.wasm?url'`, compile it with
`WebAssembly.compileStreaming(fetch(wasmUrl))`, build `HostDeps` from `performance.now`,
`self.postMessage`, `setInterval`, and `createSim`, and route `self.onmessage` to `host.handle`. Wrap
the top level in `try`/`catch` that posts `error`.

- [ ] Write the failing tests:

```ts
// tests/host.test.ts
import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import * as P from '../src/protocol';
import { createHost, type HostDeps } from '../src/worker/host';
import { createSim } from '../src/worker/wasm';

const module = new WebAssembly.Module(
  readFileSync(new URL('../src/wasm/tidepool_sim.wasm', import.meta.url)),
);

// The fake clock moves in 10 ms steps. With `recycle`, each posted frame buffer is handed back after
// the step that posted it, as the page does.
function rig(opts: { recycle?: boolean } = {}) {
  let now = 0;
  let timer: (() => void) | undefined;
  let recycled = 0;
  const sent: P.FromWorker[] = [];
  const deps: HostDeps = {
    now: () => now,
    post: (m) => void sent.push(m),
    every: (_ms, fn) => {
      timer = fn;
      return () => void (timer = undefined);
    },
    makeSim: (o) => createSim(module, { worldW: P.WORLD_W, worldH: P.WORLD_H, ...o }),
  };
  const host = createHost(deps);
  const of = <T extends P.FromWorker['type']>(type: T) =>
    sent.filter((m): m is Extract<P.FromWorker, { type: T }> => m.type === type);
  const pump = () => {
    timer?.();
    if (!opts.recycle) return;
    const frames = of('frame');
    for (; recycled < frames.length; recycled++) {
      const f = frames[recycled];
      if (f) host.handle({ type: 'recycle', buffer: f.buffer });
    }
  };
  const advance = (ms: number) => {
    for (let t = 0; t < ms; t += 10) {
      now += 10;
      pump();
    }
  };
  const jump = (ms: number) => void (now += ms);
  const lastTick = () => {
    const f = of('frame').at(-1);
    return f ? P.viewFrame(f.buffer).tick : -1;
  };
  return { host, advance, jump, sent, of, lastTick };
}

test('init posts ready with the ABI version and world size', () => {
  const r = rig();
  r.host.handle({ type: 'init', seed: 1 });
  expect(r.of('ready')).toEqual([
    { type: 'ready', abi: P.ABI_VERSION, worldW: P.WORLD_W, worldH: P.WORLD_H },
  ]);
});

test('one second of wall time is twenty ticks', () => {
  const r = rig({ recycle: true });
  r.host.handle({ type: 'init', seed: 1 });
  r.advance(1000);
  expect(r.lastTick()).toBe(20);
});

test('frames stop when no buffer comes back, and ticking continues', () => {
  const r = rig();
  r.host.handle({ type: 'init', seed: 1 });
  r.advance(2000);
  expect(r.of('frame').length).toBe(P.FRAME_POOL);
  expect(r.of('stats').at(-1)?.tick).toBe(40);
});

test('speed 0 pauses', () => {
  const r = rig({ recycle: true });
  r.host.handle({ type: 'init', seed: 1 });
  r.host.handle({ type: 'speed', ticksPerSecond: 0 });
  r.advance(1000);
  expect(r.of('frame').length).toBe(0);
});

test('a long stall runs at most 5 ticks and drops the rest', () => {
  const r = rig({ recycle: true });
  r.host.handle({ type: 'init', seed: 1 });
  r.advance(100);
  expect(r.lastTick()).toBe(2);
  r.jump(10_000);
  r.advance(10);
  expect(r.lastTick()).toBe(7);
  r.advance(50);
  expect(r.lastTick()).toBe(8);
});

test('a message before init is an error, not a crash', () => {
  const r = rig();
  r.host.handle({ type: 'view', x0: 0, y0: 0, x1: 10, y1: 10 });
  expect(r.of('error').length).toBe(1);
});

test('a corrupt snapshot becomes an error message', () => {
  const r = rig();
  r.host.handle({ type: 'init', seed: 1, snapshot: new ArrayBuffer(40) });
  expect(r.of('error').length).toBe(1);
  expect(r.of('ready').length).toBe(0);
});

test('bench replies and does not advance the main world', () => {
  const r = rig();
  r.host.handle({ type: 'init', seed: 1 });
  r.host.handle({ type: 'bench', ticks: 200 });
  const b = r.of('benchResult')[0];
  expect(b?.ticks).toBe(200);
  expect(b?.creatures).toBe(P.M0_DRIFTERS);
  expect(r.of('frame').length).toBe(0);
});
```

In Node the fake `post` does not transfer, so a posted buffer stays readable. That is what lets the
tests read frames.

- [ ] Run `pnpm exec vitest run tests/host.test.ts`. Expect: failures.
- [ ] Implement `host.ts` and `sim.worker.ts`.
- [ ] Run `make check`. Expect: exit 0.
- [ ] Commit: `feat(tidepool): simulation worker host with pooled frame transfer`.

## Task 8: Renderer and page — moving dots at 60 fps (`coder`, Opus)

**Files:**
- Create: `src/render/renderer.ts`, `src/render/shaders.ts`, `src/app/camera.ts`, `src/ui/state.ts`,
  `src/ui/App.tsx`
- Modify: `src/app/main.ts`, `index.html`

**Blocked by:** Task 7. **Seam:** 4.

**Interfaces produced:**

```ts
// src/app/camera.ts
export interface Camera { x: number; y: number; scale: number } // world point at screen centre, CSS pixels per world unit
export function viewRect(cam: Camera, cssW: number, cssH: number): { x0: number; y0: number; x1: number; y1: number };
export function screenToWorld(cam: Camera, cssW: number, cssH: number, sx: number, sy: number): { x: number; y: number };
export function fitWorld(worldW: number, worldH: number, cssW: number, cssH: number): Camera;

// src/render/renderer.ts
export class RendererError extends Error {}
export interface Renderer {
  resize(cssW: number, cssH: number, dpr: number): void;
  /** Draws `cur`, with each creature moved back toward its place in `prev` by (1 - alpha). */
  draw(prev: FrameView | null, cur: FrameView, alpha: number, cam: Camera): void;
  dispose(): void;
}
/** Throws RendererError when WebGL2 is missing. */
export function createRenderer(canvas: HTMLCanvasElement): Renderer;

// src/ui/state.ts
import { signal } from '@preact/signals';
export const errorText = signal<string | null>(null);
export const ready = signal(false);
export const stats = signal({ tick: 0, creatures: 0, plants: 0, tickMicros: 0, fps: 0 });
export const benchText = signal<string | null>(null);
```

Rendering:

- One instanced draw. A unit quad with per-instance attributes `vec4 (x, y, heading, hue)` and
  `vec4 (length, width, energy01, flags)`.
- The renderer keeps `prevIndexBySlot: Int32Array(4096)`, refilled when a new frame arrives. For a
  creature whose slot is in `prev` with the same `uid`, position is `mix(prev, cur, alpha)`. Otherwise
  it is drawn at `cur`.
- Fragment shader, M0: a disc with a soft edge. `d = length(uv) - 1.0`,
  `alpha = 1.0 - smoothstep(-fwidth(d), fwidth(d), d)`. Colour from hue at fixed saturation and value.
  Premultiplied alpha, `gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)`.
- Clear to `#04121c`. Cap `dpr` at 2.

Page:

- `main.ts`: make the worker with
  `new Worker(new URL('../worker/sim.worker.ts', import.meta.url), { type: 'module' })`, send `init`
  with seed 1, and on `ready` set the camera with `fitWorld` and send `view`.
- On `frame`: recycle the old `prev` buffer to the worker, shift `cur` to `prev`, store the new frame
  and its arrival time.
- `requestAnimationFrame` loop: `alpha = clamp((now - arrival) / 50, 0, 1)`, then `draw`.
- `visibilitychange`: send `speed` 0 when hidden and `TICK_HZ` when visible.
- `error` from the worker, a `worker.onerror`, a `RendererError`, or `webglcontextlost`: set
  `errorText`. `App.tsx` shows it as a centred panel over the canvas with the message and a Reload
  button. Build this state first and check it by throwing in `createRenderer` once.
- Until `ready`: `App.tsx` shows "Waking the tidepool…".
- With `?debug` in the URL: a small readout of `stats` (tick, creatures, tick µs, fps).
- With `?bench` in the URL: after `ready`, send `bench` with 2,000 ticks and show
  "`<n>` ticks per second. A 24,000-tick skip would take `<s>` seconds on this device."
- `window.__tidepool = { stats, errorText }` in dev builds (`import.meta.env.DEV`).

- [ ] Implement.
- [ ] Run `make check`. Expect: exit 0.
- [ ] Browser check. Run `make wasm && pnpm exec vite --port 5311`. Open
  `http://localhost:5311/?debug`. Expect: about 1,500 coloured discs drifting and nudging each other,
  no console errors, `__tidepool.stats.value.fps` at 55 or more, `tick` rising by about 20 per second.
- [ ] Open `http://localhost:5311/?bench`. Expect: the ticks-per-second sentence appears. Record the
  number in `docs/gates.md` under "in-page bench, reference machine".
- [ ] Resize the window. Expect: the canvas fills it and stays sharp.
- [ ] Run `pnpm exec vite build`. Expect: exit 0 and a `.wasm` asset or an inlined module in `dist/`.
- [ ] Commit: `feat(tidepool): WebGL2 renderer and page with interpolated frames`.

## Task 9: CI and M0 exit (`coder-std`, Sonnet, then `auditor`, Opus)

**Files:**
- Create: `/.github/workflows/tidepool.yml`
- Modify: `docs/gates.md`, `AGENTS.md`, `README.md`

**Blocked by:** Tasks 6 and 8.

- [ ] Write the workflow:

```yaml
name: Tidepool
on:
  push:
    paths: ['tidepool/**', '.github/workflows/tidepool.yml']
  pull_request:
    paths: ['tidepool/**', '.github/workflows/tidepool.yml']

jobs:
  check:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: tidepool
    steps:
      - uses: actions/checkout@v4
      - run: rustup toolchain install 1.99.0 --profile minimal --component rustfmt,clippy --target wasm32-unknown-unknown
      - uses: pnpm/action-setup@v4
        with:
          package_json_file: tidepool/package.json
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
          cache-dependency-path: tidepool/pnpm-lock.yaml
      - run: pnpm install --frozen-lockfile
      - run: make check
      - run: target/release/tidepool-headless bench --floor 800
```

The CI floor is 800, a third of the real floor, because shared runners are slower than the reference
machine by an unknown factor. The real floor is enforced by `make gates` on the reference machine.
`package_json_file` and `cache-dependency-path` are inputs of those two actions as of their v4
releases. Confirm both in each action's `action.yml` before the commit.

- [ ] Update `docs/gates.md` with a row for CI and the note about the lower floor.
- [ ] Update `AGENTS.md` and `README.md`: every command they name must exist and run. Remove any line
  that describes something not built yet.
- [ ] Dispatch an `auditor` with fresh context. Give it `../roadmap.md` M0, `../architecture.md`, and
  `docs/gates.md`. Ask it to run `make check` and `make gates`, repeat each failure proof in
  `docs/gates.md`, and report any M0 bullet that the code does not meet. Fix what it finds.
- [ ] M0 exit, checked by the orchestrator: the page shows moving dots at 55 fps or more with the
  simulation in a worker, `make check` and `make gates` exit 0, and `docs/gates.md` has a seen-to-fail
  proof for every gate.
- [ ] Commit: `chore(tidepool): CI workflow and M0 exit record`.

---

# M1 — First swim

Conventions for all of M1:

- World `y` grows downward (depth). Heading `θ` gives the direction `(cos θ, sin θ)`. A positive turn
  raises `θ`, which is clockwise on screen and the creature's own right. The core never says "left".
- A creature's **length** is `len * growth`, **width** is `len * wid * growth`, **mass** is
  `length * width`, **radius** is `(length + width) / 4`. `growth` runs from `birth_growth` to 1.
- Energy capacity is `energy_per_mass * mass`. `energy01` is `energy / capacity`.
- Default world: 1536 by 1024, 400 founder creatures, 1,200 founder plants.

## Task 10: The M1 skeleton — every phase, every export, every message (`senior-coder`, Opus)

This task builds the whole path once with stub rules, so that the tasks after it each fill one file.
After it, a creature wanders by noise, can be possessed and steered, and nothing eats or dies.

**Files:**
- Create: `crates/sim/src/params.rs`, `control.rs`, `stats.rs`, `genome.rs`, and stubs `motor.rs`,
  `plant.rs`, `field.rs`, `energy.rs`, `repro.rs`, `brain.rs`, `sense.rs`
- Modify: `crates/sim/src/creature.rs`, `world.rs`, `frame.rs`, `abi.rs`, `lib.rs`, `snapshot.rs`
  (`FORMAT_VERSION` 2), `crates/headless/src/main.rs`, `crates/headless/src/bench.rs`
- Modify: `src/protocol.ts`, `src/worker/wasm.ts`, `src/worker/host.ts`, `tests/abi.test.ts`,
  `tests/determinism.test.ts`, `tests/host.test.ts`, `crates/sim/tests/*.rs`
- Test: `crates/sim/tests/control.rs`, `crates/sim/tests/params.rs`

**Blocked by:** Task 9. **Seams:** 1 and 2.

### Parameters

One `macro_rules!` list generates both the index constants (`params::id::DRAG_FWD`) and the table, so
they cannot drift.

```rust
// params.rs
pub struct ParamDef { pub name: &'static str, pub default: f32, pub min: f32, pub max: f32 }
pub static DEFS: &[ParamDef];
pub mod id { /* pub const DRAG_FWD: usize = 0; ... in table order */ }
#[derive(Clone)]
pub struct Params { pub v: Vec<f32> }
impl Params {
    pub fn new() -> Params;                        // defaults
    pub fn get(&self, i: usize) -> f32;
    pub fn set(&mut self, i: usize, v: f32);       // clamps to [min, max]. NaN is ignored.
    pub fn index_of(name: &str) -> Option<usize>;
    pub fn save(&self, w: &mut Writer);
    pub fn load(r: &mut Reader) -> Result<Params, LoadError>;   // Invalid if the count differs
}
```

The table. Defaults are starting values derived by arithmetic. Task 16 tunes them.

| Name | Default | Min | Max | Meaning | Used by |
|---|---|---|---|---|---|
| `lifespan` | 4800 | 600 | 24000 | Ticks until death by old age | 13 |
| `think_every` | 2 | 1 | 8 | A creature senses and thinks every Nth tick | 15 |
| `drag_fwd` | 0.08 | 0.01 | 0.5 | Velocity lost per tick along the heading | 11 |
| `drag_side` | 0.30 | 0.01 | 0.9 | Velocity lost per tick across the heading | 11 |
| `drag_ang` | 0.25 | 0.01 | 0.9 | Angular velocity lost per tick | 11 |
| `flag_force` | 1.1 | 0 | 5 | Thrust per unit flagellum | 11 |
| `cilia_force` | 0.3 | 0 | 5 | Thrust per unit cilia | 11 |
| `flag_torque` | 0.34 | 0 | 5 | Turning per unit flagellum, scaled by thrust | 11 |
| `cilia_torque` | 0.58 | 0 | 5 | Turning per unit cilia, works at rest | 11 |
| `inertia_k` | 0.08 | 0.01 | 1 | Moment of inertia factor | 11 |
| `repel` | 0.2 | 0 | 1 | Push between overlapping bodies | 11 |
| `v_max` | 4 | 1 | 8 | Hard speed limit, world units per tick | 11 |
| `plant_cap` | 20 | 1 | 200 | Plant reserve limit at fertility 1 | 12 |
| `plant_growth` | 0.005 | 0 | 0.1 | Logistic growth rate per tick | 12 |
| `plant_seed_at` | 0.7 | 0.1 | 1 | Reserve fraction needed to seed | 12 |
| `plant_seed_chance` | 0.02 | 0 | 1 | Chance to seed per plant update | 12 |
| `plant_seed_range` | 48 | 8 | 256 | Seed throw distance | 12 |
| `plant_seed_energy` | 2 | 0.1 | 20 | Reserve moved to the seedling | 12 |
| `plant_cell_cap` | 3 | 1 | 16 | Plants allowed per 32-unit cell | 12 |
| `plant_germ_min` | 0.15 | 0 | 1 | Lowest fertility a seed can take | 12 |
| `plant_death_reserve` | 0.2 | 0 | 5 | A plant below this is removed | 12 |
| `fert_blobs` | 14 | 1 | 64 | Fertile patches in the world | 12 |
| `fert_radius` | 100 | 20 | 600 | Patch radius | 12 |
| `scent_deposit` | 0.05 | 0 | 1 | Scent per unit `reserve01` per field step | 12 |
| `scent_diffuse` | 0.2 | 0 | 0.24 | Diffusion rate | 12 |
| `scent_decay` | 0.995 | 0.8 | 1 | Scent kept per field step | 12 |
| `energy_per_mass` | 1 | 0.1 | 10 | Energy capacity per unit mass | 13 |
| `basal` | 0.0005 | 0 | 0.01 | Upkeep per unit mass per tick | 13 |
| `part_upkeep` | 0.0002 | 0 | 0.01 | Upkeep per unit mass per unit part size per tick | 13 |
| `neuron_upkeep` | 0.0002 | 0 | 0.01 | Upkeep per neuron per tick | 13 |
| `conn_upkeep` | 0.00005 | 0 | 0.01 | Upkeep per connection per tick | 13 |
| `move_cost` | 0.006 | 0 | 1 | Cost of thrust (see Task 13) | 13 |
| `intake_rate` | 0.04 | 0 | 1 | Energy per tick per unit filter per unit length | 13 |
| `bite_fraction` | 0.05 | 0.001 | 1 | Largest share of a plant's reserve taken per tick | 13 |
| `grow_reserve` | 0.35 | 0 | 1 | `energy01` above which a juvenile grows | 13 |
| `grow_rate` | 0.0015 | 0 | 0.1 | Growth per tick | 13 |
| `build_cost` | 0.5 | 0 | 5 | Energy per unit of mass built | 13, 14 |
| `birth_growth` | 0.4 | 0.1 | 1 | Growth at birth | 14 |
| `bud_at` | 0.8 | 0.2 | 1 | `energy01` needed to bud | 14 |
| `bud_cooldown` | 200 | 0 | 5000 | Ticks between buds | 14 |
| `child_energy` | 0.5 | 0.05 | 1 | Newborn `energy01` | 14 |
| `mut_rate` | 0.15 | 0 | 1 | Chance that a body gene mutates | 14 |
| `mut_sigma` | 0.08 | 0 | 1 | Body gene step, as a fraction of its range | 14 |
| `mut_weight_rate` | 0.1 | 0 | 1 | Chance that a brain number mutates | 14 |
| `mut_weight_sigma` | 0.25 | 0 | 2 | Brain number step | 14 |
| `hue_sigma` | 0.01 | 0 | 0.5 | Hue drift per birth | 14 |
| `chemo_gain` | 4 | 0 | 50 | Scent gradient gain | 15 |

### Creature state

```rust
// creature.rs — replace the M0 struct. `radius` is no longer stored.
pub struct Creatures {
    pub slots: Slots,
    pub uid: Vec<u32>,
    pub x: Vec<f32>, pub y: Vec<f32>, pub vx: Vec<f32>, pub vy: Vec<f32>,
    pub heading: Vec<f32>, pub hc: Vec<f32>, pub hs: Vec<f32>,   // hc, hs = cos, sin of heading. Not saved.
    pub omega: Vec<f32>,
    pub cmd_thrust: Vec<f32>,                      // [0, 1]. Written by brain or control. Read by motor.
    pub cmd_turn: Vec<f32>,                        // [-1, 1]
    pub growth: Vec<f32>, pub energy: Vec<f32>,
    pub age: Vec<u32>, pub generation: Vec<u32>, pub parent: Vec<u32>,
    pub mark: Vec<u8>,                             // bit 0: player lineage
    pub bud_cooldown: Vec<u32>,
    pub len: Vec<f32>, pub wid: Vec<f32>, pub flagellum: Vec<f32>, pub cilia: Vec<f32>,
    pub filter: Vec<f32>, pub chemo: Vec<f32>, pub hue: Vec<f32>,   // set from the genome at birth
}
impl Creatures {
    pub fn length(&self, s: usize) -> f32;
    pub fn width(&self, s: usize) -> f32;
    pub fn mass(&self, s: usize) -> f32;
    pub fn radius(&self, s: usize) -> f32;
}
```

```rust
// genome.rs
#[derive(Clone)]
pub struct ConnGene { pub src: u16, pub dst: u16, pub weight: f32, pub history: u32 }
#[derive(Clone, Default)]
pub struct BrainGenome {
    pub n_hidden: u16,
    pub bias: Vec<f32>,                            // one per non-input neuron: hidden, then outputs
    pub alpha: Vec<f32>,                           // same length. (0, 1]
    pub conns: Vec<ConnGene>,
}
#[derive(Clone)]
pub struct Genome {
    pub len: f32, pub wid: f32, pub flagellum: f32, pub cilia: f32, pub filter: f32, pub chemo: f32,
    pub hue: f32,
    pub brain: BrainGenome,
}
/// len, wid, flagellum, cilia, filter, chemo
pub const GENE_RANGE: [(f32, f32); 6] =
    [(6.0, 24.0), (0.3, 0.9), (0.0, 1.0), (0.0, 1.0), (0.2, 1.0), (0.0, 1.0)];
pub const GENE_DEFAULT: [f32; 6] = [12.0, 0.5, 0.6, 0.4, 0.6, 0.5];
impl Genome {
    /// Defaults, each moved by gauss * 0.05 * range and clamped. Random hue. `brain::starter(rng)`.
    pub fn founder(rng: &mut Rng) -> Genome;
    pub fn save(&self, w: &mut Writer);
    pub fn load(r: &mut Reader) -> Result<Genome, LoadError>;
}
```

```rust
// world.rs — additions
pub struct SpawnAt { pub x: f32, pub y: f32, pub heading: f32, pub growth: f32, pub energy01: f32,
                     pub parent: u32, pub generation: u32, pub mark: u8 }
pub struct World {
    // M0 fields, plus:
    pub params: Params,
    pub genomes: Vec<Genome>,                      // by slot
    pub plants: Plants, pub fertility: Fertility, pub scent: Field, pub brains: Brains,
    pub control: Control, pub stats: Stats,
    pub next_history: u32,
    pub rng_mutate: Rng, pub rng_plants: Rng, pub rng_wander: Rng,
}
impl World {
    /// Allocates a slot, sets every array from the genome and `at`, calls `brains.express`. None if full.
    pub fn spawn(&mut self, genome: Genome, at: SpawnAt) -> Option<u32>;
    pub fn kill(&mut self, slot: u32, cause: u32); // frees the slot. Tells control if it was possessed.
    /// Founders: adults (growth 1), energy01 0.5, age uniform in [0, lifespan/2), placed by fertility.
    pub fn seed_founders(&mut self, creatures: u32, plants: u32);
}
```

`spawn_drifters` and `tp_spawn_drifters` are deleted. Tests that used them use `seed_founders(n, 0)`.

### Tick

`World::tick` calls, in this order, and nothing else:

```rust
self.grid.rebuild(&self.creatures.slots, &self.creatures.x, &self.creatures.y);
sense::step(self);      // stub: nothing
brain::step(self);      // stub: wander (below)
control::apply(self);   // real
motor::step(self);      // stub: the M0 drift, repulsion, and bounce, using vx and vy
energy::contact(self);  // stub: nothing
energy::life(self);     // stub: age += 1 only
repro::step(self);      // stub: nothing
plant::step(self);      // stub: nothing
field::step(self);      // stub: nothing
self.tick += 1;
```

Stub `brain::step`: for each live slot, `cmd_thrust = 0.6` and
`cmd_turn = clamp(cmd_turn + rng_wander.gauss() * 0.2, -1, 1)`. Stub `motor::step` also sets
`heading += cmd_turn * 0.1`, `vx = hc * cmd_thrust * 1.5`, `vy = hs * cmd_thrust * 1.5` so that
steering can be seen before Task 11.

Each stub module also has `pub fn save(world: &World, w: &mut Writer)` and
`pub fn load(world: &mut World, r: &mut Reader) -> Result<(), LoadError>`, called from `World::save`
and `World::load` in tick order. A stub's pair writes and reads nothing. The task that fills the module
fills the pair.

`Plants`, `Fertility`, `Field`, and `Brains` are declared in this task with the fields listed in tasks
12 and 15, created empty or zeroed, so that `frame.rs` and `World` compile against their final shape.

### Control

```rust
// control.rs
pub const CAUSE_NONE: u32 = 0;
pub const CAUSE_STARVED: u32 = 1;
pub const CAUSE_OLD_AGE: u32 = 2;
pub const HEIR_STRIDE: usize = 7;                  // uid, slot, x, y, energy01, generation, hue
pub const MAX_HEIRS: usize = 5;

pub struct Control {
    pub possessed: u32,                            // uid, 0 for none
    pub possessed_slot: u32,                       // valid when possessed != 0
    pub manual: bool, pub thrust: f32, pub turn: f32,
    pub death_cause: u32,
    pub heirs: Vec<u32>,                           // scratch, not saved
}
impl World {
    /// The nearest live creature whose centre is within `r` of the point. 0 if none.
    pub fn pick(&self, x: f32, y: f32, r: f32) -> u32;
    /// Sets the lineage mark on the creature. Clears death_cause. False if the uid is not alive.
    pub fn possess(&mut self, uid: u32) -> bool;
    pub fn release(&mut self);                     // the creature keeps its mark
    pub fn input(&mut self, manual: bool, thrust: f32, turn: f32);   // clamps thrust to [0,1], turn to [-1,1]
    /// Live creatures with the lineage mark, highest energy01 first, ties by lower slot. At most 5.
    pub fn write_heirs(&mut self) -> u32;
}
pub fn apply(world: &mut World);   // if possessed and manual: overwrite that slot's cmd_thrust and cmd_turn
```

A slot lookup by `uid` scans live slots. It runs only on possess and pick, never per tick.
`World::kill` of the possessed creature sets `death_cause`, then clears `possessed` and `manual`.
`Control` is saved except `heirs`: a reload keeps the player in their body.

### Stats

```rust
// stats.rs
pub const STAT_CREATURES: u32 = 0;
pub const STAT_PLANTS: u32 = 1;
pub const STAT_BIRTHS: u32 = 2;                    // total since the world began
pub const STAT_DEATHS: u32 = 3;
pub const STAT_MAX_GENERATION: u32 = 4;            // among the living
pub const STAT_MEAN_ENERGY01: u32 = 5;
pub const STAT_LINEAGE_ALIVE: u32 = 6;             // living creatures with the player lineage mark
pub struct Stats { pub births: u64, pub deaths: u64, pub eaten: f64 }   // saved
impl World { pub fn stat(&self, k: u32) -> f64; }  // unknown k returns -1
```

### ABI version 2

Remove `tp_spawn_drifters`. Add:

```rust
tp_seed_founders(world: *mut World, creatures: u32, plants: u32)
tp_param_count() -> u32
tp_param_name_ptr(i: u32) -> *const u8
tp_param_name_len(i: u32) -> u32
tp_param_default(i: u32) -> f32
tp_param_min(i: u32) -> f32
tp_param_max(i: u32) -> f32
tp_param_get(world: *const World, i: u32) -> f32
tp_param_set(world: *mut World, i: u32, v: f32)
tp_pick(world: *const World, x: f32, y: f32, r: f32) -> u32
tp_possess(world: *mut World, uid: u32) -> u32       // 1 or 0
tp_release(world: *mut World)
tp_possessed(world: *const World) -> u32
tp_input(world: *mut World, manual: u32, thrust: f32, turn: f32)
tp_death_cause(world: *const World) -> u32
tp_heir_stride() -> u32                              // 7
tp_heirs_write(world: *mut World) -> u32             // count
tp_heirs_ptr(world: *const World) -> *const u32
```

An out-of-range parameter index reads as 0 and writes nothing.

The frame writer now fills real values: `heading`, `length`, `width`, `hue`, `energy01`, and the flags.
Header word 5 is the possessed slot. Word 6 is 1 when a creature is possessed and `manual` is false.
Plant records come from `Plants`, culled with the plant grid.

### Protocol and worker

```ts
// src/protocol.ts — changes
export const ABI_VERSION = 2;
export const FOUNDER_CREATURES = 400;              // replaces M0_DRIFTERS
export const FOUNDER_PLANTS = 1200;
export const HEIR_STRIDE = 7;
export type DeathCause = 'starved' | 'old age';
export interface ParamInfo { index: number; name: string; value: number; default: number; min: number; max: number }
export interface Heir { uid: number; slot: number; x: number; y: number; energy01: number; generation: number; hue: number }

// ToWorker gains:
  | { type: 'possessAt'; x: number; y: number; radius: number }
  | { type: 'possess'; uid: number }
  | { type: 'release' }
  | { type: 'input'; manual: boolean; thrust: number; turn: number }
  | { type: 'param'; index: number; value: number }
// FromWorker: 'ready' gains `params: ParamInfo[]`, and these are added:
  | { type: 'possessed'; uid: number }             // 0: nothing there, or released
  | { type: 'died'; cause: DeathCause; heirs: Heir[] }
```

```ts
// src/worker/wasm.ts — Sim changes: remove spawnDrifters, add
seedFounders(creatures: number, plants: number): void;
params(): ParamInfo[];
setParam(index: number, value: number): void;
pick(x: number, y: number, r: number): number;
possess(uid: number): boolean;
release(): void;
possessed(): number;
input(manual: boolean, thrust: number, turn: number): void;
deathCause(): number;
heirs(): Heir[];
```

Host changes:

- `init` without a snapshot calls `seedFounders(FOUNDER_CREATURES, FOUNDER_PLANTS)`.
- `possessAt` picks, then possesses. `possess` possesses by uid. Both post `possessed` with the uid or
  0. A successful possess while paused by a death sets the speed back to `TICK_HZ`.
- `release` releases and posts `possessed` with 0.
- `input` stores the latest values. The host calls `sim.input` once before each tick.
- After each tick: if a creature was possessed before the tick and `sim.possessed()` is now 0 and
  `sim.deathCause()` is not 0, set the speed to 0 and post `died` with the cause and `sim.heirs()`.
- `param` calls `setParam`.
- `bench` uses a world of 3072 by 1536 with 1,500 creatures and 3,000 plants. `HostDeps.makeSim` gains
  optional `worldW` and `worldH`.

Headless: `run` takes `--plants <n>` (default 0) and any number of `--param name=value`. An unknown
parameter name is an error that lists the valid names. The output line gains `plants=<n>`.
`bench` seeds founders.

- [ ] Write the failing Rust tests:

```rust
// crates/sim/tests/params.rs
use tidepool_sim::params::{id, Params, DEFS};

#[test]
fn ids_match_names() {
    assert_eq!(DEFS[id::DRAG_FWD].name, "drag_fwd");
    assert_eq!(DEFS[id::CHEMO_GAIN].name, "chemo_gain");
    assert_eq!(Params::index_of("plant_growth"), Some(id::PLANT_GROWTH));
    assert_eq!(Params::index_of("nope"), None);
}

#[test]
fn defaults_are_inside_their_ranges_and_names_are_unique() {
    let mut names: Vec<&str> = DEFS.iter().map(|d| d.name).collect();
    for d in DEFS {
        assert!(d.min <= d.default && d.default <= d.max, "{}", d.name);
    }
    names.sort_unstable();
    names.dedup();
    assert_eq!(names.len(), DEFS.len());
}

#[test]
fn set_clamps_and_ignores_nan() {
    let mut p = Params::new();
    p.set(id::DRAG_FWD, 99.0);
    assert_eq!(p.get(id::DRAG_FWD), DEFS[id::DRAG_FWD].max);
    p.set(id::DRAG_FWD, f32::NAN);
    assert_eq!(p.get(id::DRAG_FWD), DEFS[id::DRAG_FWD].max);
}
```

```rust
// crates/sim/tests/control.rs
use tidepool_sim::control::{CAUSE_STARVED, HEIR_STRIDE};
use tidepool_sim::world::World;

fn world() -> World {
    let mut w = World::new(4, 1536.0, 1024.0);
    w.seed_founders(50, 0);
    w
}

#[test]
fn pick_returns_the_nearest_creature_within_reach() {
    let w = world();
    let (x, y) = (w.creatures.x[7], w.creatures.y[7]);
    assert_eq!(w.pick(x + 0.5, y, 20.0), w.creatures.uid[7]);
    assert_eq!(w.pick(-9000.0, -9000.0, 20.0), 0);
}

#[test]
fn possess_marks_the_creature_and_release_keeps_the_mark() {
    let mut w = world();
    let uid = w.creatures.uid[3];
    assert!(w.possess(uid));
    assert_eq!(w.control.possessed, uid);
    assert_eq!(w.creatures.mark[3] & 1, 1);
    w.release();
    assert_eq!(w.control.possessed, 0);
    assert_eq!(w.creatures.mark[3] & 1, 1);
    assert!(!w.possess(999_999));
}

#[test]
fn manual_input_replaces_the_commands_and_releasing_hands_back() {
    let mut w = world();
    assert!(w.possess(w.creatures.uid[3]));
    w.input(true, 1.0, -1.0);
    w.tick();
    // control::apply runs after the brain, so motor saw the player's values
    assert_eq!((w.creatures.cmd_thrust[3], w.creatures.cmd_turn[3]), (1.0, -1.0));
    w.input(false, 1.0, -1.0);
    w.run(2); // two ticks: from Task 15 a creature thinks on every second tick
    assert_ne!((w.creatures.cmd_thrust[3], w.creatures.cmd_turn[3]), (1.0, -1.0));
}

#[test]
fn input_is_clamped() {
    let mut w = world();
    w.input(true, 5.0, -7.0);
    assert_eq!((w.control.thrust, w.control.turn), (1.0, -1.0));
    w.input(true, -5.0, 0.0);
    assert_eq!(w.control.thrust, 0.0);
}

#[test]
fn killing_the_possessed_creature_records_the_cause() {
    let mut w = world();
    assert!(w.possess(w.creatures.uid[3]));
    w.kill(3, CAUSE_STARVED);
    assert_eq!(w.control.possessed, 0);
    assert_eq!(w.control.death_cause, CAUSE_STARVED);
}

#[test]
fn heirs_are_marked_living_creatures_by_energy() {
    let mut w = world();
    for s in [2usize, 5, 9] {
        assert!(w.possess(w.creatures.uid[s]));
    }
    w.release();
    w.creatures.energy[5] *= 1.5;
    assert_eq!(w.write_heirs(), 3);
    assert_eq!(w.control.heirs.len(), 3 * HEIR_STRIDE);
    assert_eq!(w.control.heirs[1], 5); // slot of the first heir
    w.kill(5, CAUSE_STARVED);
    assert_eq!(w.write_heirs(), 2);
}
```

Add to `crates/sim/tests/snapshot.rs`: change `world_at` to `seed_founders(400, 0)`, and add a test
that possesses a creature, sets a parameter, saves, loads, and asserts `control.possessed` and the
parameter value survive.

- [ ] Write the failing TypeScript tests. Update `tests/abi.test.ts` and `tests/determinism.test.ts`
  for `seedFounders`, and the headless call for `--plants 0`. In `tests/host.test.ts`, change the M0
  `ready` test to `toMatchObject` (the message now carries `params`), and change the bench test to
  expect 1,500 creatures. Then add:

```ts
function frameOf(r: ReturnType<typeof rig>) {
  const f = r.of('frame').at(-1);
  if (!f) throw new Error('no frame yet');
  return P.viewFrame(f.buffer);
}

test('ready lists every parameter with its range', () => {
  const r = rig();
  r.host.handle({ type: 'init', seed: 1 });
  const params = r.of('ready')[0]?.params ?? [];
  expect(params.length).toBeGreaterThan(40);
  const drag = params.find((p) => p.name === 'drag_fwd');
  expect(drag?.value).toBeCloseTo(0.08, 6); // parameters are 32-bit floats
  expect(drag?.default).toBeCloseTo(0.08, 6);
  expect(drag?.min).toBeCloseTo(0.01, 6);
  expect(drag?.max).toBeCloseTo(0.5, 6);
});

test('possessAt on a creature possesses it and the frame says so', () => {
  const r = rig({ recycle: true });
  r.host.handle({ type: 'init', seed: 1 });
  r.advance(100);
  const f = frameOf(r);
  const o = f.creatureBase;
  const [x, y, uid] = [f.f32[o + P.C_X] ?? 0, f.f32[o + P.C_Y] ?? 0, f.u32[o + P.C_UID] ?? 0];
  r.host.handle({ type: 'possessAt', x, y, radius: 4 });
  expect(r.of('possessed').at(-1)?.uid).toBe(uid);
  r.advance(100);
  const g = frameOf(r);
  expect(g.possessedSlot).not.toBe(P.NO_SLOT);
  expect(g.brainDriving).toBe(true);
});

test('possessAt on empty water answers with uid 0', () => {
  const r = rig({ recycle: true });
  r.host.handle({ type: 'init', seed: 1 });
  r.host.handle({ type: 'possessAt', x: -5000, y: -5000, radius: 4 });
  expect(r.of('possessed').at(-1)?.uid).toBe(0);
});

test('manual input turns the brain-driving flag off', () => {
  const r = rig({ recycle: true });
  r.host.handle({ type: 'init', seed: 1 });
  r.advance(100);
  const f = frameOf(r);
  const o = f.creatureBase;
  r.host.handle({
    type: 'possessAt', x: f.f32[o + P.C_X] ?? 0, y: f.f32[o + P.C_Y] ?? 0, radius: 4,
  });
  r.host.handle({ type: 'input', manual: true, thrust: 1, turn: 0 });
  r.advance(100);
  expect(frameOf(r).brainDriving).toBe(false);
  r.host.handle({ type: 'input', manual: false, thrust: 0, turn: 0 });
  r.advance(100);
  expect(frameOf(r).brainDriving).toBe(true);
});

test('release answers with uid 0 and clears the frame flag', () => {
  const r = rig({ recycle: true });
  r.host.handle({ type: 'init', seed: 1 });
  r.advance(100);
  const f = frameOf(r);
  const o = f.creatureBase;
  r.host.handle({
    type: 'possessAt', x: f.f32[o + P.C_X] ?? 0, y: f.f32[o + P.C_Y] ?? 0, radius: 4,
  });
  r.host.handle({ type: 'release' });
  expect(r.of('possessed').at(-1)?.uid).toBe(0);
  r.advance(100);
  expect(frameOf(r).possessedSlot).toBe(P.NO_SLOT);
});
```

The death path (`died`, pause, resume on possess) is tested in Task 13, when something can die.

- [ ] Run `make check`. Expect: failures.
- [ ] Implement.
- [ ] Run `make check`. Expect: exit 0.
- [ ] Run `make gates`. Expect: `PASS`. Record `median_tps` in `docs/gates.md`.
- [ ] Browser check (`pnpm exec vite --port 5312`, `?debug`): about 400 discs wander. No console errors.
- [ ] Commit: `feat(tidepool): M1 skeleton with parameters, control, and ABI 2`.

## Task 11: Rigid body and motor (`coder`, Opus)

**Files:**
- Modify: `crates/sim/src/motor.rs`
- Test: `crates/sim/tests/motor.rs`

**Blocked by:** Task 10. Runs alongside tasks 12 and 17. **Seam:** 1.

**Rules.** For each live slot, in order. `p` is the parameter table.

```
drive   = p.flag_force * flagellum + p.cilia_force * cilia
accel   = cmd_thrust * drive / width                       // force is drive * length, mass is length * width
steer   = p.cilia_torque * cilia + p.flag_torque * flagellum * cmd_thrust
a_ang   = cmd_turn * steer / (2 * p.inertia_k * width * length)

vx += hc * accel + repulsion_x                             // repulsion as in M0, scaled by p.repel
vy += hs * accel + repulsion_y
fwd  = vx * hc + vy * hs                                   // split velocity along and across the heading
side = -vx * hs + vy * hc
fwd  *= 1 - p.drag_fwd
side *= 1 - p.drag_side
vx = fwd * hc - side * hs
vy = fwd * hs + side * hc
clamp speed to p.v_max

omega   = (omega + a_ang) * (1 - p.drag_ang)
heading = wrap_angle(heading + omega)
(hs, hc) = sin_cos(heading)
x += vx;  y += vy
at a world edge: clamp the position, zero the velocity component that points out
```

Why this shape: thrust and turning both come from the parts a body carries. A flagellum steers only
while it pushes. Cilia turn a body at rest. A slender body is faster. A long body turns slower. Turn
radius grows with speed, which is what stops the draft's spin-in-place (`design.md` §5.1). Predicted
from the defaults for the default body: top speed about 1.5 units per tick, turn rate about 0.06
radians per tick at rest and 0.11 at full thrust, turn radius at full thrust about 13 units against a
body length of 12.

`motor::step` computes repulsion for all slots into scratch arrays first, then integrates, so that the
result does not depend on slot order within a tick.

- [ ] Write the failing tests:

```rust
// crates/sim/tests/motor.rs
use tidepool_sim::genome::Genome;
use tidepool_sim::params::id;
use tidepool_sim::rng::Rng;
use tidepool_sim::world::{SpawnAt, World};

/// One default-bodied adult alone in open water, driven by fixed commands through possession.
fn solo(edit: impl FnOnce(&mut Genome)) -> (World, usize) {
    let mut w = World::new(1, 1536.0, 1024.0);
    let mut g = Genome::founder(&mut Rng::new(1));
    (g.len, g.wid, g.flagellum, g.cilia) = (12.0, 0.5, 0.6, 0.4);
    edit(&mut g);
    let at = SpawnAt { x: 768.0, y: 512.0, heading: 0.0, growth: 1.0, energy01: 1.0,
                       parent: 0, generation: 0, mark: 0 };
    let slot = w.spawn(g, at).expect("slot") as usize;
    // Motion only: nothing starves and nothing buds, so these tests hold after tasks 13 and 14 land.
    for k in [id::BASAL, id::PART_UPKEEP, id::NEURON_UPKEEP, id::CONN_UPKEEP, id::MOVE_COST] {
        w.params.set(k, 0.0);
    }
    w.creatures.bud_cooldown[slot] = 1_000_000;
    let uid = w.creatures.uid[slot];
    assert!(w.possess(uid));
    (w, slot)
}

fn drive(w: &mut World, thrust: f32, turn: f32, ticks: u32) {
    w.input(true, thrust, turn);
    w.run(ticks);
}

fn speed(w: &World, s: usize) -> f32 {
    (w.creatures.vx[s] * w.creatures.vx[s] + w.creatures.vy[s] * w.creatures.vy[s]).sqrt()
}

#[test]
fn top_speed_is_in_band() {
    let (mut w, s) = solo(|_| {});
    drive(&mut w, 1.0, 0.0, 200);
    let v = speed(&w, s);
    assert!((1.1..=2.0).contains(&v), "speed {v}");
}

#[test]
fn a_body_with_cilia_turns_at_rest() {
    let (mut w, s) = solo(|_| {});
    drive(&mut w, 0.0, 1.0, 20);
    assert!(w.creatures.omega[s] > 0.03, "omega {}", w.creatures.omega[s]);
    assert!(speed(&w, s) < 0.05);
}

#[test]
fn a_body_without_cilia_cannot_turn_at_rest() {
    let (mut w, s) = solo(|g| g.cilia = 0.0);
    drive(&mut w, 0.0, 1.0, 20);
    assert!(w.creatures.omega[s].abs() < 1e-6);
}

#[test]
fn turn_radius_grows_with_speed_and_exceeds_half_a_body_length() {
    let radius = |thrust: f32| {
        let (mut w, s) = solo(|_| {});
        drive(&mut w, thrust, 1.0, 300);
        speed(&w, s) / w.creatures.omega[s]
    };
    let (slow, fast) = (radius(0.2), radius(1.0));
    assert!(fast > slow * 1.5, "slow {slow} fast {fast}");
    assert!(fast > 6.0, "full-thrust radius {fast} is inside the body");
}

#[test]
fn a_slender_body_is_faster() {
    let top = |wid: f32| {
        let (mut w, s) = solo(|g| g.wid = wid);
        drive(&mut w, 1.0, 0.0, 200);
        speed(&w, s)
    };
    assert!(top(0.3) > top(0.8) * 1.5);
}

#[test]
fn a_long_body_turns_slower() {
    let rate = |len: f32| {
        let (mut w, s) = solo(|g| g.len = len);
        drive(&mut w, 1.0, 1.0, 200);
        w.creatures.omega[s]
    };
    assert!(rate(8.0) > rate(20.0) * 1.5);
}

#[test]
fn sideways_motion_dies_faster_than_forward_motion() {
    let coast = |vx: f32, vy: f32| {
        let (mut w, s) = solo(|_| {});
        w.creatures.vx[s] = vx;
        w.creatures.vy[s] = vy;
        drive(&mut w, 0.0, 0.0, 5);
        speed(&w, s)
    };
    assert!(coast(0.0, 2.0) < coast(2.0, 0.0) * 0.5);
}

#[test]
fn a_creature_stops_at_the_world_edge() {
    let (mut w, s) = solo(|_| {});
    drive(&mut w, 1.0, 0.0, 2000); // heading 0: swims toward x = 1536
    assert!(w.creatures.x[s] <= 1536.0 && w.creatures.x[s] > 1500.0);
}

#[test]
fn speed_never_passes_v_max() {
    let (mut w, s) = solo(|g| g.wid = 0.3);
    w.params.set(id::FLAG_FORCE, 5.0);
    w.params.set(id::DRAG_FWD, 0.01);
    drive(&mut w, 1.0, 0.0, 400);
    assert!(speed(&w, s) <= w.params.get(id::V_MAX) + 1e-4);
}
```

- [ ] Run `cargo test --test motor`. Expect: failures.
- [ ] Implement `motor::step`. Delete the stub's direct velocity setting.
- [ ] Run `make check`. Expect: exit 0.
- [ ] Run `make gates`. Expect: `PASS`.
- [ ] Commit: `feat(tidepool): rigid-body motor with part-driven thrust and torque`.

## Task 12: Plants and the scent field (`coder`, Opus)

**Files:**
- Modify: `crates/sim/src/plant.rs`, `crates/sim/src/field.rs`
- Test: `crates/sim/tests/plants.rs`

**Blocked by:** Task 10. Runs alongside tasks 11 and 17. **Seam:** 1.

**Interfaces (declared in Task 10, filled here):**

```rust
// plant.rs
pub const MAX_PLANTS: u32 = 8192;
pub struct Plants {
    pub slots: Slots,
    pub x: Vec<f32>, pub y: Vec<f32>, pub reserve: Vec<f32>, pub cap: Vec<f32>,
    pub grid: Grid,                                // not saved. Rebuilt when `dirty`.
    pub dirty: bool,
}
pub struct Fertility { pub gw: usize, pub gh: usize, pub v: Vec<f32> }   // cell 32, values in [0, 1]. Saved.
impl Fertility {
    pub fn generate(rng: &mut Rng, w: f32, h: f32, blobs: u32, radius: f32) -> Fertility;
    pub fn at(&self, x: f32, y: f32) -> f32;
}
pub fn radius(reserve: f32, plant_cap: f32) -> f32;      // 2 + 6 * sqrt(reserve / plant_cap)
pub fn seed(world: &mut World, n: u32);                  // founders, called by seed_founders
pub fn step(world: &mut World);

// field.rs
pub const SCENT_CELL: f32 = 8.0;
pub struct Field { pub gw: usize, pub gh: usize, pub a: Vec<f32>, pub b: Vec<f32> }   // `a` is saved
impl Field {
    pub fn new(w: f32, h: f32) -> Field;
    pub fn deposit(&mut self, x: f32, y: f32, amount: f32);
    pub fn diffuse(&mut self, rate: f32, decay: f32);
    pub fn sample(&self, x: f32, y: f32) -> f32;         // the cell that holds the point
    pub fn gradient(&self, x: f32, y: f32) -> (f32, f32); // central difference, per cell, clamped at edges
}
pub fn step(world: &mut World);                          // on even ticks: plants deposit, then diffuse
```

**Rules.**

- **Fertility:** each blob has a random centre. A cell's value is the sum over blobs of
  `1 / (1 + (d / radius)²)²`, clamped to 1. Far from every blob the sum is below `plant_germ_min`, so
  the world has bare water between patches.
- **Founder plants:** draw a random cell, accept it with probability equal to its fertility and only if
  it is at or above `plant_germ_min` and under `plant_cell_cap`. Place the plant at a random point in
  the cell with `cap = plant_cap * fertility` and a reserve uniform in `[0.3, 1] * cap`. Stop after
  `n` plants or `50 * n` draws.
- **Step:** each tick, process plants whose `slot % 8 == tick % 8`, in slot order.
  - Growth: `reserve += 8 * plant_growth * reserve * (1 - reserve / cap)`, clamped to `cap`.
  - Seeding: if `reserve >= plant_seed_at * cap` and `rng_plants.unit() < plant_seed_chance`: pick a
    point at a uniform random angle and a uniform distance up to `plant_seed_range`. Use
    `sin_cos`. If the point is in the world, its fertility is at or above `plant_germ_min`, its cell
    holds fewer than `plant_cell_cap` plants, and a slot is free: move `plant_seed_energy` from parent
    to a new plant there.
  - Death: a plant with `reserve < plant_death_reserve` is removed.
  - New and dead plants are queued and applied after the loop, in slot order. Set `dirty`.
  - Rebuild the plant grid when `dirty`, before anything reads it.
- **Scent:** `field::step` runs when `tick % 2 == 0`. Each plant deposits
  `scent_deposit * reserve / plant_cap` at its position. Then one diffusion step. Port the stencil from
  `spikes/kernel-bench/rust/src/lib.rs:443-462` (edges mirror the cell itself). Keep the inner loop
  free of bounds checks by slicing rows, as the spike does: that is what lets it vectorize.

The cell cap, not crowding, is what bounds the number of plants. The draft tried crowding and the count
ran away.

- [ ] Write the failing tests:

```rust
// crates/sim/tests/plants.rs
use tidepool_sim::field::{Field, SCENT_CELL};
use tidepool_sim::params::id;
use tidepool_sim::plant;
use tidepool_sim::world::World;

fn garden(seed: u32) -> World {
    let mut w = World::new(seed, 1536.0, 1024.0);
    w.seed_founders(0, 1200);
    w
}

fn live_plants(w: &World) -> Vec<usize> {
    (0..w.plants.slots.high_water() as usize).filter(|&s| w.plants.slots.is_alive(s as u32)).collect()
}

#[test]
fn fertility_is_patchy() {
    let w = garden(1);
    let min = w.params.get(id::PLANT_GERM_MIN);
    let bare = w.fertility.v.iter().filter(|&&f| f < min).count() as f32 / w.fertility.v.len() as f32;
    assert!((0.2..=0.8).contains(&bare), "bare fraction {bare}");
}

#[test]
fn founders_are_placed_on_fertile_ground() {
    let w = garden(1);
    assert!(w.plants.slots.count() >= 1000);
    for s in live_plants(&w) {
        assert!(w.fertility.at(w.plants.x[s], w.plants.y[s]) >= w.params.get(id::PLANT_GERM_MIN));
    }
}

#[test]
fn an_ungrazed_garden_fills_and_stays_bounded_on_three_seeds() {
    for seed in 1..=3 {
        let mut w = garden(seed);
        w.run(6000);
        let n = w.plants.slots.count();
        assert!((1000..8192).contains(&n), "seed {seed}: {n} plants");
        let cap = w.params.get(id::PLANT_CELL_CAP) as u32;
        let mut per_cell = vec![0u32; w.fertility.v.len()];
        for s in live_plants(&w) {
            let c = (w.plants.y[s] / 32.0) as usize * w.fertility.gw + (w.plants.x[s] / 32.0) as usize;
            per_cell[c] += 1;
            assert!(w.plants.reserve[s] > 0.0 && w.plants.reserve[s] <= w.plants.cap[s] + 1e-4);
        }
        assert!(per_cell.iter().all(|&k| k <= cap));
    }
}

#[test]
fn with_no_growth_nothing_spreads() {
    let mut w = garden(1);
    let before = w.plants.slots.count();
    w.params.set(id::PLANT_GROWTH, 0.0);
    w.params.set(id::PLANT_SEED_CHANCE, 0.0);
    w.run(2000);
    assert_eq!(w.plants.slots.count(), before);
}

#[test]
fn diffusion_spreads_decays_and_keeps_mass_when_decay_is_one() {
    let mut f = Field::new(1536.0, 1024.0);
    f.deposit(768.0, 512.0, 100.0);
    for _ in 0..200 {
        f.diffuse(0.2, 1.0);
    }
    let total: f32 = f.a.iter().sum();
    assert!((total - 100.0).abs() < 0.5, "mass {total}");
    assert!(f.sample(768.0, 512.0) > f.sample(768.0 + 10.0 * SCENT_CELL, 512.0));
    assert!(f.sample(768.0 + 10.0 * SCENT_CELL, 512.0) > 0.0);
    f.diffuse(0.2, 0.5);
    assert!((f.a.iter().sum::<f32>() - 50.0).abs() < 0.5);
}

#[test]
fn the_gradient_points_at_the_source() {
    let mut f = Field::new(1536.0, 1024.0);
    for _ in 0..300 {
        f.deposit(768.0, 512.0, 1.0);
        f.diffuse(0.2, 0.995);
    }
    let (gx, gy) = f.gradient(700.0, 512.0); // source is toward +x
    assert!(gx > 0.0 && gx.abs() > gy.abs() * 5.0);
    let (gx, gy) = f.gradient(768.0, 600.0); // source is toward -y
    assert!(gy < 0.0 && gy.abs() > gx.abs() * 5.0);
}

#[test]
fn plants_lay_down_scent_that_is_strongest_in_the_patches() {
    let mut w = garden(2);
    w.run(600);
    let s = live_plants(&w)[0];
    let here = w.scent.sample(w.plants.x[s], w.plants.y[s]);
    assert!(here > 0.0);
    // the least fertile cell in the world smells weaker than a plant's own cell
    let (mut worst, mut at) = (f32::MAX, 0usize);
    for (c, &f) in w.fertility.v.iter().enumerate() {
        if f < worst {
            (worst, at) = (f, c);
        }
    }
    let (bx, by) = ((at % w.fertility.gw) as f32 * 32.0 + 16.0, (at / w.fertility.gw) as f32 * 32.0 + 16.0);
    assert!(w.scent.sample(bx, by) < here);
}

#[test]
fn radius_grows_with_reserve() {
    assert!(plant::radius(20.0, 20.0) > plant::radius(2.0, 20.0));
    assert!((plant::radius(20.0, 20.0) - 8.0).abs() < 1e-5);
}
```

Add to `crates/sim/tests/snapshot.rs`: the round-trip test with `seed_founders(400, 1200)` and 1,000
ticks each side of the save.

- [ ] Run `cargo test --test plants`. Expect: failures.
- [ ] Implement. Raise `FORMAT_VERSION`.
- [ ] Run `make check`. Expect: exit 0, including native-equals-WASM with plants (update
  `tests/determinism.test.ts` to pass `--plants 1200` and `seedFounders(500, 1200)`).
- [ ] Run `make gates`. Expect: `PASS`. Record `median_tps` in `docs/gates.md`. If it fails, profile
  before changing anything: `field::diffuse` must show SIMD in the WASM build
  (`spikes/kernel-bench/README.md` has the check command).
- [ ] Commit: `feat(tidepool): rooted plants on a patchy fertility map, with a scent field`.

## Task 13: Energy — eating, upkeep, growth, death (`coder`, Opus)

**Files:**
- Modify: `crates/sim/src/energy.rs`
- Modify: `tests/host.test.ts` (the death path)
- Test: `crates/sim/tests/energy.rs`

**Blocked by:** Tasks 11 and 12. Runs alongside Task 18. **Seam:** 1, then 2.

**Rules.** `cap = energy_per_mass * mass`.

`energy::contact`, each live creature in slot order:

```
budget = intake_rate * filter * length
room   = cap - energy
for each plant in the plant grid within (radius + 8) of the creature, in grid order:
    if distance > radius + plant::radius(plant): continue
    take = min(budget, room, plant.reserve * bite_fraction)
    plant.reserve -= take;  energy += take;  budget -= take;  room -= take;  stats.eaten += take
    stop when budget or room reaches 0
```

A Filter mouth eats on contact with no brain output. The draft measured brain-gated eating at 2.7
times fewer creatures, and filter feeding is passive. A full creature takes nothing: that is the
satiation stop.

`energy::life`, each live creature in slot order:

```
age += 1
drive  = flag_force * flagellum + cilia_force * cilia
upkeep = basal * mass
       + part_upkeep * mass * (flagellum + cilia + filter + chemo)
       + neuron_upkeep * brains.n_neur[slot] + conn_upkeep * brains.n_conn[slot]
       + move_cost * cmd_thrust² * drive * length
energy -= upkeep
if growth < 1 and energy > grow_reserve * cap:
    g2   = min(1, growth + grow_rate)
    cost = build_cost * (mass at g2 - mass at growth)
    if energy - cost > grow_reserve * cap * 0.5:  growth = g2;  energy -= cost
energy = min(energy, cap)                          // cap is recomputed after growth
if energy <= 0:        queue death, CAUSE_STARVED
else if age >= lifespan: queue death, CAUSE_OLD_AGE
```

Queued deaths are applied after the loop in slot order through `World::kill`, which counts
`stats.deaths`. In M1 a corpse vanishes and its energy leaves the world. M4 turns corpses into debris.

- [ ] Write the failing tests:

```rust
// crates/sim/tests/energy.rs
use tidepool_sim::control::{CAUSE_OLD_AGE, CAUSE_STARVED};
use tidepool_sim::genome::Genome;
use tidepool_sim::params::id;
use tidepool_sim::rng::Rng;
use tidepool_sim::world::{SpawnAt, World};

fn empty() -> World {
    World::new(1, 1536.0, 1024.0)
}

fn add(w: &mut World, x: f32, growth: f32, energy01: f32, edit: impl FnOnce(&mut Genome)) -> usize {
    let mut g = Genome::founder(&mut Rng::new(1));
    (g.len, g.wid, g.flagellum, g.cilia, g.filter, g.chemo) = (12.0, 0.5, 0.6, 0.4, 0.6, 0.5);
    edit(&mut g);
    let at = SpawnAt { x, y: 512.0, heading: 0.0, growth, energy01, parent: 0, generation: 0, mark: 0 };
    let slot = w.spawn(g, at).expect("slot") as usize;
    w.creatures.bud_cooldown[slot] = 1_000_000; // these tests hold after Task 14 adds budding
    slot
}

/// A plant with the given reserve under the point. Returns its slot.
fn plant_at(w: &mut World, x: f32, reserve: f32) -> usize {
    let s = w.plants.slots.alloc().expect("plant slot") as usize;
    (w.plants.x[s], w.plants.y[s], w.plants.reserve[s], w.plants.cap[s]) = (x, 512.0, reserve, 20.0);
    w.plants.dirty = true;
    s
}

fn still(w: &mut World) {
    // hold every creature in place and stop plants changing, so one rule is tested at a time
    for k in [id::PLANT_GROWTH, id::PLANT_SEED_CHANCE, id::PLANT_DEATH_RESERVE] {
        w.params.set(k, 0.0);
    }
    w.params.set(id::FLAG_FORCE, 0.0);
    w.params.set(id::CILIA_FORCE, 0.0);
}

fn no_upkeep(w: &mut World) {
    for k in [id::BASAL, id::PART_UPKEEP, id::NEURON_UPKEEP, id::CONN_UPKEEP, id::MOVE_COST] {
        w.params.set(k, 0.0);
    }
}

#[test]
fn eating_moves_energy_from_plant_to_creature_and_loses_none() {
    let mut w = empty();
    still(&mut w);
    no_upkeep(&mut w);
    let c = add(&mut w, 500.0, 1.0, 0.3, |_| {});
    let p = plant_at(&mut w, 500.0, 20.0);
    let before = w.creatures.energy[c] + w.plants.reserve[p];
    w.run(50);
    assert!(w.creatures.energy[c] > 0.3 * 72.0 + 1.0);
    assert!((w.creatures.energy[c] + w.plants.reserve[p] - before).abs() < 1e-2);
}

#[test]
fn a_full_creature_eats_nothing() {
    let mut w = empty();
    still(&mut w);
    no_upkeep(&mut w);
    add(&mut w, 500.0, 1.0, 1.0, |_| {});
    let p = plant_at(&mut w, 500.0, 20.0);
    w.run(50);
    assert_eq!(w.plants.reserve[p], 20.0);
}

#[test]
fn one_tick_takes_at_most_the_bite_fraction() {
    let mut w = empty();
    still(&mut w);
    no_upkeep(&mut w);
    w.params.set(id::INTAKE_RATE, 1.0);
    add(&mut w, 500.0, 1.0, 0.1, |_| {});
    let p = plant_at(&mut w, 500.0, 20.0);
    w.tick();
    assert!((w.plants.reserve[p] - 19.0).abs() < 1e-4); // 5% of 20
}

#[test]
fn a_creature_out_of_reach_eats_nothing() {
    let mut w = empty();
    still(&mut w);
    no_upkeep(&mut w);
    add(&mut w, 500.0, 1.0, 0.3, |_| {});
    let p = plant_at(&mut w, 540.0, 20.0);
    w.run(50);
    assert_eq!(w.plants.reserve[p], 20.0);
}

#[test]
fn an_unfed_creature_starves_and_the_cause_is_recorded() {
    let mut w = empty();
    still(&mut w);
    let c = add(&mut w, 500.0, 1.0, 0.2, |_| {});
    let uid = w.creatures.uid[c];
    assert!(w.possess(uid));
    w.run(1500);
    assert_eq!(w.creatures.slots.count(), 0);
    assert_eq!(w.control.death_cause, CAUSE_STARVED);
    assert_eq!(w.stat(tidepool_sim::stats::STAT_DEATHS), 1.0);
}

#[test]
fn old_age_kills_at_lifespan() {
    let mut w = empty();
    still(&mut w);
    no_upkeep(&mut w);
    w.params.set(id::LIFESPAN, 600.0);
    let c = add(&mut w, 500.0, 1.0, 1.0, |_| {});
    assert!(w.possess(w.creatures.uid[c]));
    w.run(599);
    assert_eq!(w.creatures.slots.count(), 1);
    w.run(1);
    assert_eq!(w.creatures.slots.count(), 0);
    assert_eq!(w.control.death_cause, CAUSE_OLD_AGE);
}

#[test]
fn a_fed_juvenile_grows_to_adult_and_growth_costs_energy() {
    let mut w = empty();
    still(&mut w);
    let c = add(&mut w, 500.0, 0.4, 0.9, |_| {});
    for dx in [-4.0, 0.0, 4.0] {
        plant_at(&mut w, 500.0 + dx, 20.0);
    }
    w.params.set(id::PLANT_GROWTH, 0.05); // the plants refill
    let eaten_before = w.stats.eaten;
    w.run(1500);
    assert!((w.creatures.growth[c] - 1.0).abs() < 1e-6, "growth {}", w.creatures.growth[c]);
    assert!(w.stats.eaten - eaten_before > 0.5 * (72.0 - 72.0 * 0.16)); // at least the build cost
}

#[test]
fn a_starving_juvenile_does_not_grow() {
    let mut w = empty();
    still(&mut w);
    let c = add(&mut w, 500.0, 0.4, 0.2, |_| {});
    w.run(100);
    assert_eq!(w.creatures.growth[c], 0.4);
}

#[test]
fn parts_cost_upkeep() {
    let ticks_alive = |chemo: f32| {
        let mut w = empty();
        still(&mut w);
        add(&mut w, 500.0, 1.0, 0.5, |g| g.chemo = chemo);
        let mut t = 0;
        while w.creatures.slots.count() == 1 && t < 5000 {
            w.tick();
            t += 1;
        }
        t
    };
    assert!(ticks_alive(0.0) > ticks_alive(1.0) + 20);
}

#[test]
fn energy_never_passes_capacity() {
    let mut w = World::new(2, 1536.0, 1024.0);
    w.seed_founders(400, 1200);
    w.run(1500);
    for s in 0..w.creatures.slots.high_water() as usize {
        if w.creatures.slots.is_alive(s as u32) {
            let cap = w.params.get(id::ENERGY_PER_MASS) * w.creatures.mass(s);
            assert!(w.creatures.energy[s] <= cap + 1e-3 && w.creatures.energy[s] > 0.0);
        }
    }
}
```

```ts
// add to tests/host.test.ts
test('death pauses the world, posts the cause and heirs, and possessing an heir resumes', () => {
  const r = rig({ recycle: true });
  r.host.handle({ type: 'init', seed: 1 });
  const idx = (name: string) => {
    const p = r.of('ready')[0]?.params.find((q) => q.name === name);
    if (!p) throw new Error(`no parameter ${name}`);
    return p.index;
  };
  r.advance(100);
  const f = frameOf(r);
  const pos = (i: number) => {
    const o = f.creatureBase + i * P.CREATURE_STRIDE;
    return { x: f.f32[o + P.C_X] ?? 0, y: f.f32[o + P.C_Y] ?? 0, radius: 4 };
  };
  r.host.handle({ type: 'possessAt', ...pos(0) }); // marked by possession: it may outlive the player
  r.host.handle({ type: 'possessAt', ...pos(1) }); // the body the player dies in
  r.host.handle({ type: 'param', index: idx('lifespan'), value: 600 });
  r.advance(40_000); // 800 ticks: longer than the lifespan
  const died = r.of('died')[0];
  expect(['old age', 'starved']).toContain(died?.cause);
  expect(r.of('died').length).toBe(1);
  const tickAtDeath = r.lastTick();
  r.advance(1000);
  expect(r.lastTick()).toBe(tickAtDeath); // paused
  // The only marked creature besides the player is the first one possessed. Nothing buds yet.
  expect(died?.heirs.length).toBeLessThanOrEqual(1);
  r.host.handle({ type: 'speed', ticksPerSecond: P.TICK_HZ });
  r.advance(100);
  expect(r.lastTick()).toBeGreaterThan(tickAtDeath);
});
```

- [ ] Run `cargo test --test energy`. Expect: failures.
- [ ] Implement.
- [ ] Run `make check`. Expect: exit 0.
- [ ] Run `make gates`. Expect: `PASS`.
- [ ] Commit: `feat(tidepool): energy economy with passive filter feeding, growth, and death`.

## Task 14: Budding, mutation, and lineage (`coder`, Opus)

**Files:**
- Modify: `crates/sim/src/repro.rs`, `crates/sim/src/genome.rs`, `tests/host.test.ts`
- Test: `crates/sim/tests/repro.rs`

**Blocked by:** Task 13. **Seam:** 1.

**Interfaces produced:**

```rust
// genome.rs
impl Genome {
    /// Each of the 6 body genes: with chance mut_rate, add gauss * mut_sigma * (max - min), clamp.
    /// Hue: add gauss * hue_sigma, wrap into [0, 1).
    /// Each brain weight, bias: with chance mut_weight_rate, add gauss * mut_weight_sigma.
    /// Each alpha: with chance mut_weight_rate, add gauss * 0.1, clamp to [0.05, 1].
    /// Weights and biases are clamped to [-8, 8]. Structure and history ids do not change in M1.
    pub fn mutated(&self, rng: &mut Rng, p: &Params) -> Genome;
}
// repro.rs
pub fn step(world: &mut World);
```

**Rules.** Each live creature in slot order:

```
if bud_cooldown > 0: bud_cooldown -= 1; continue
if growth < 1 or energy < bud_at * cap: continue
if no free slot (count queued births too): continue
child      = genomes[slot].mutated(rng_mutate, params)
child_mass = (child.len * birth_growth) * (child.len * child.wid * birth_growth)
cost       = build_cost * child_mass + child_energy * energy_per_mass * child_mass
if energy - cost < 0.25 * cap: continue
energy -= cost;  bud_cooldown = params.bud_cooldown
queue birth: at (x, y) - heading_vector * (radius + child_radius), heading + gauss * 0.5,
             growth = birth_growth, energy01 = child_energy, parent = uid,
             generation = generation + 1, mark = this creature's mark
```

Queued births are applied after the loop in the parent's slot order through `World::spawn`, which
counts `stats.births`. A newborn does not act or bud on the tick it is born. Budding conserves energy:
what the parent loses is the child's starting energy plus the cost of building its body.

The mutation generator is `rng_mutate` for every draw in `mutated` and the heading jitter. No other
phase uses it.

- [ ] Write the failing tests:

```rust
// crates/sim/tests/repro.rs
use tidepool_sim::genome::{Genome, GENE_RANGE};
use tidepool_sim::params::{id, Params};
use tidepool_sim::rng::Rng;
use tidepool_sim::stats::{STAT_BIRTHS, STAT_MAX_GENERATION};
use tidepool_sim::world::{SpawnAt, World};

fn fed_adult(w: &mut World, mark: u8) -> usize {
    let mut g = Genome::founder(&mut Rng::new(1));
    (g.len, g.wid) = (12.0, 0.5);
    let at = SpawnAt { x: 700.0, y: 500.0, heading: 0.0, growth: 1.0, energy01: 0.95,
                       parent: 0, generation: 3, mark };
    w.spawn(g, at).expect("slot") as usize
}

fn quiet(w: &mut World) {
    for k in [id::BASAL, id::PART_UPKEEP, id::NEURON_UPKEEP, id::CONN_UPKEEP, id::MOVE_COST,
              id::FLAG_FORCE, id::CILIA_FORCE] {
        w.params.set(k, 0.0);
    }
}

#[test]
fn a_fed_adult_buds_a_child_that_carries_its_line() {
    let mut w = World::new(1, 1536.0, 1024.0);
    quiet(&mut w);
    let p = fed_adult(&mut w, 1);
    let puid = w.creatures.uid[p];
    w.tick();
    assert_eq!(w.creatures.slots.count(), 2);
    assert_eq!(w.stat(STAT_BIRTHS), 1.0);
    let c = 1usize; // the lowest free slot
    assert_eq!(w.creatures.parent[c], puid);
    assert_eq!(w.creatures.generation[c], 4);
    assert_eq!(w.creatures.mark[c] & 1, 1);
    assert_eq!(w.creatures.age[c], 0);
    assert!((w.creatures.growth[c] - 0.4).abs() < 1e-6);
    assert_eq!(w.stat(STAT_MAX_GENERATION), 4.0);
}

#[test]
fn budding_conserves_energy() {
    let mut w = World::new(1, 1536.0, 1024.0);
    quiet(&mut w);
    let p = fed_adult(&mut w, 0);
    let before = w.creatures.energy[p];
    w.tick();
    let c = 1usize;
    let built = w.params.get(id::BUILD_COST) * w.creatures.mass(c);
    assert!((before - w.creatures.energy[p] - w.creatures.energy[c] - built).abs() < 1e-3);
}

#[test]
fn cooldown_spaces_out_buds() {
    let mut w = World::new(1, 1536.0, 1024.0);
    quiet(&mut w);
    let p = fed_adult(&mut w, 0);
    w.tick();
    w.creatures.energy[p] = 0.95 * 72.0;
    w.run(199);
    assert_eq!(w.stat(STAT_BIRTHS), 1.0);
    w.creatures.energy[p] = 0.95 * 72.0;
    w.run(3);
    assert_eq!(w.stat(STAT_BIRTHS), 2.0);
}

#[test]
fn juveniles_and_the_hungry_do_not_bud() {
    let mut w = World::new(1, 1536.0, 1024.0);
    quiet(&mut w);
    let p = fed_adult(&mut w, 0);
    w.creatures.growth[p] = 0.9;
    w.params.set(id::GROW_RATE, 0.0);
    w.run(50);
    assert_eq!(w.stat(STAT_BIRTHS), 0.0);
    w.creatures.growth[p] = 1.0;
    w.creatures.energy[p] = 0.5 * 72.0;
    w.run(50);
    assert_eq!(w.stat(STAT_BIRTHS), 0.0);
}

#[test]
fn a_full_pool_stops_budding_without_losing_energy() {
    let mut w = World::new(1, 1536.0, 1024.0);
    quiet(&mut w);
    w.params.set(id::REPEL, 0.0);
    for _ in 0..4096 {
        fed_adult(&mut w, 0);
    }
    let before: f32 = w.creatures.energy.iter().sum();
    w.tick();
    assert_eq!(w.creatures.slots.count(), 4096);
    assert_eq!(w.stat(STAT_BIRTHS), 0.0);
    assert!((w.creatures.energy.iter().sum::<f32>() - before).abs() < 1.0);
}

#[test]
fn mutation_stays_in_range_and_rate_zero_copies() {
    let p = Params::new();
    let mut rng = Rng::new(3);
    let mut g = Genome::founder(&mut rng);
    for _ in 0..10_000 {
        g = g.mutated(&mut rng, &p);
        let genes = [g.len, g.wid, g.flagellum, g.cilia, g.filter, g.chemo];
        for (v, (lo, hi)) in genes.iter().zip(GENE_RANGE) {
            assert!(*v >= lo && *v <= hi);
        }
        assert!((0.0..1.0).contains(&g.hue));
        assert!(g.brain.conns.iter().all(|c| c.weight.abs() <= 8.0));
        assert!(g.brain.alpha.iter().all(|a| (0.05..=1.0).contains(a)));
    }
    let mut frozen = Params::new();
    for k in [id::MUT_RATE, id::MUT_WEIGHT_RATE, id::HUE_SIGMA] {
        frozen.set(k, 0.0);
    }
    let child = g.mutated(&mut rng, &frozen);
    assert_eq!((child.len, child.wid, child.hue), (g.len, g.wid, g.hue));
    assert_eq!(child.brain.conns.len(), g.brain.conns.len());
}

#[test]
fn a_seeded_world_turns_over_generations_deterministically() {
    let run = || {
        let mut w = World::new(5, 1536.0, 1024.0);
        w.seed_founders(400, 1200);
        w.run(3000);
        (w.state_hash(), w.stat(STAT_BIRTHS))
    };
    let (a, b) = (run(), run());
    assert_eq!(a, b);
    assert!(a.1 > 0.0, "no births in 3,000 ticks");
}
```

Add to `crates/sim/tests/snapshot.rs`: a round trip at 1,500 + 1,500 ticks with
`seed_founders(400, 1200)`, so that births, genomes, and `rng_mutate` are covered.

Add a second host test, `picking an heir resumes the world in that body`. Possess one creature,
send `release`, and advance 100,000 ms (2,000 ticks) so that its line buds marked children. Possess
a different creature, set `lifespan` to 600, and advance until `died` arrives. Assert that
`died.heirs.length` is between 1 and 5 and that the heirs are sorted by `energy01`, highest first.
Send `{ type: 'possess', uid: heirs[0].uid }`. Assert that `possessed` reports that uid, and that after
`advance(500)` the tick has moved on with no `speed` message sent. If the marked line dies out on seed
1 before the death, use the first seed from 1 to 5 where it survives and name the seed in a comment.

- [ ] Run `cargo test --test repro`. Expect: failures.
- [ ] Implement. Raise `FORMAT_VERSION`.
- [ ] Run `make check`. Expect: exit 0.
- [ ] Run `make gates`. Expect: `PASS`.
- [ ] Commit: `feat(tidepool): budding with mutation, energy-conserving births, and lineage marks`.

## Task 15: Brains and the chemoreceptor (`coder`, Opus)

**Files:**
- Modify: `crates/sim/src/brain.rs`, `crates/sim/src/sense.rs`
- Test: `crates/sim/tests/brain.rs`

**Blocked by:** Task 14. Runs alongside Task 19. **Seam:** 1.

**Interfaces (declared in Task 10, filled here):**

```rust
// brain.rs
pub const MAX_NEURONS: usize = 96;
pub const MAX_CONNS: usize = 384;
pub const N_IN: usize = 7;
pub const N_OUT: usize = 2;
pub const IN_CONST: usize = 0;
pub const IN_ENERGY: usize = 1;
pub const IN_AGE: usize = 2;
pub const IN_SPEED: usize = 3;
pub const IN_SCENT: usize = 4;
pub const IN_GRAD_FWD: usize = 5;
pub const IN_GRAD_SIDE: usize = 6;
pub const OUT_THRUST: usize = 0;
pub const OUT_TURN: usize = 1;

pub struct Brains {
    pub n_neur: Vec<u16>, pub n_conn: Vec<u16>,                // by slot
    pub cur: Vec<f32>, pub nxt: Vec<f32>,                      // capacity * MAX_NEURONS. `cur` is saved for live slots.
    pub bias: Vec<f32>, pub alpha: Vec<f32>,                   // capacity * MAX_NEURONS. Rebuilt from genomes on load.
    pub src: Vec<u16>, pub dst: Vec<u16>, pub w: Vec<f32>,     // capacity * MAX_CONNS, sorted by dst
}
impl Brains {
    pub fn new(capacity: u32) -> Brains;
    /// Copies the genome into the slot's block, sorted by (dst, src, history). Zeroes activations.
    /// Connections past MAX_CONNS or to a neuron past MAX_NEURONS are dropped.
    pub fn express(&mut self, slot: usize, g: &BrainGenome);
    pub fn inputs_mut(&mut self, slot: usize) -> &mut [f32];   // the first N_IN activations
    pub fn output(&self, slot: usize, k: usize) -> f32;        // the last N_OUT activations
    pub fn step_one(&mut self, slot: usize);
}
/// The founder brain. Every founder has the same shape and the same history ids 1..=39.
pub fn starter(rng: &mut Rng) -> BrainGenome;
pub fn step(world: &mut World);
// sense.rs
pub fn step(world: &mut World);
```

**Rules.**

- Neuron order in a block: inputs `0..N_IN`, hidden, then the `N_OUT` outputs last.
- `step_one`: for each non-input neuron `j` in order,
  `sum = bias[j] + Σ w[c] * cur[src[c]]` over the run of connections whose `dst` is `j`, then
  `nxt[j] = cur[j] + alpha[j] * (act(sum) - cur[j])`. Then copy `nxt` over `cur` for the non-input
  neurons. Every neuron reads the previous step's values. Port the loop from
  `spikes/kernel-bench/rust/src/lib.rs:652-665` (`brain_one`) and add `alpha`.
- `brain::step` and `sense::step` act on a slot only when `(tick + slot) % think_every == 0`. On other
  ticks the creature's commands stay as they were.
- After `step_one`: `cmd_thrust = max(0, output(OUT_THRUST))`, `cmd_turn = output(OUT_TURN)`.
- **Sense**, at the creature's centre. `s0 = scent.sample`, `(gx, gy) = scent.gradient`:

```
k            = chemo_gain * chemo / (s0 + 1e-6)             // gradient relative to the local level
IN_CONST     = 1
IN_ENERGY    = energy / cap
IN_AGE       = age / lifespan
IN_SPEED     = speed / v_max
IN_SCENT     = (s0 * chemo) / (1 + s0 * chemo)
IN_GRAD_FWD  = clamp(( gx * hc + gy * hs) * k, -1, 1)
IN_GRAD_SIDE = clamp((-gx * hs + gy * hc) * k, -1, 1)       // positive: scent rises on the +θ side
```

The gradient is divided by the local level so that a creature far from food still gets a direction. The
draft's creatures could not find distant food because absolute gradients vanish with distance.

- **Starter brain.** 4 hidden neurons: inputs 0 to 6, hidden 7 to 10, thrust 11, turn 12.
  History ids are assigned in this order, starting at 1:
  1. `IN_CONST → thrust`, weight 0.9.
  2. `IN_GRAD_SIDE → turn`, weight 2.0.
  3. `IN_GRAD_FWD → thrust`, weight 0.5.
  4. Each input to each hidden neuron (28), weight `gauss * 0.1`.
  5. Each hidden neuron to each output (8), weight `gauss * 0.1`.

  That is 39 connections. Biases are `gauss * 0.05`. Every `alpha` is 1. The weak random connections
  are there because the draft showed that anything wired at zero is never recruited by evolution.
  `World::new` sets `next_history` to 40.
- Delete the wander stub and `rng_wander`.

- [ ] Write the failing tests:

```rust
// crates/sim/tests/brain.rs
use tidepool_sim::brain::{self, Brains, IN_CONST, N_IN, OUT_THRUST, OUT_TURN};
use tidepool_sim::genome::{BrainGenome, ConnGene, Genome};
use tidepool_sim::math::act;
use tidepool_sim::params::id;
use tidepool_sim::rng::Rng;
use tidepool_sim::world::{SpawnAt, World};

fn conn(src: u16, dst: u16, weight: f32) -> ConnGene {
    ConnGene { src, dst, weight, history: 0 }
}

/// No hidden neurons: thrust is neuron 7, turn is neuron 8.
fn tiny(conns: Vec<ConnGene>, alpha: f32) -> BrainGenome {
    BrainGenome { n_hidden: 0, bias: vec![0.1, -0.2], alpha: vec![alpha, alpha], conns }
}

#[test]
fn one_step_matches_hand_arithmetic() {
    let mut b = Brains::new(4);
    b.express(2, &tiny(vec![conn(0, 7, 0.5), conn(1, 7, -1.0), conn(1, 8, 2.0)], 1.0));
    let i = b.inputs_mut(2);
    (i[0], i[1]) = (1.0, 0.25);
    b.step_one(2);
    assert!((b.output(2, OUT_THRUST) - act(0.1 + 0.5 - 0.25)).abs() < 1e-6);
    assert!((b.output(2, OUT_TURN) - act(-0.2 + 0.5)).abs() < 1e-6);
}

#[test]
fn connection_order_in_the_genome_does_not_matter() {
    let (mut a, mut b) = (Brains::new(1), Brains::new(1));
    a.express(0, &tiny(vec![conn(0, 7, 0.5), conn(1, 8, 2.0), conn(1, 7, -1.0)], 1.0));
    b.express(0, &tiny(vec![conn(1, 8, 2.0), conn(1, 7, -1.0), conn(0, 7, 0.5)], 1.0));
    for br in [&mut a, &mut b] {
        let i = br.inputs_mut(0);
        (i[0], i[1]) = (1.0, 0.25);
        br.step_one(0);
    }
    assert_eq!(a.output(0, OUT_THRUST), b.output(0, OUT_THRUST));
    assert_eq!(a.output(0, OUT_TURN), b.output(0, OUT_TURN));
}

#[test]
fn a_slow_neuron_remembers() {
    let after_input_removed = |alpha: f32| {
        let mut b = Brains::new(1);
        b.express(0, &tiny(vec![conn(0, 7, 3.0)], alpha));
        b.inputs_mut(0)[0] = 1.0;
        for _ in 0..50 {
            b.step_one(0);
        }
        b.inputs_mut(0)[0] = 0.0;
        for _ in 0..5 {
            b.step_one(0);
        }
        b.output(0, OUT_THRUST)
    };
    assert!(after_input_removed(0.1) > after_input_removed(1.0) + 0.3);
}

#[test]
fn a_neuron_reads_last_steps_values() {
    // thrust feeds turn. After one step, turn has seen thrust's OLD value (0), not its new one.
    let mut b = Brains::new(1);
    let mut g = tiny(vec![conn(0, 7, 3.0), conn(7, 8, 3.0)], 1.0);
    g.bias = vec![0.0, 0.0];
    b.express(0, &g);
    b.inputs_mut(0)[IN_CONST] = 1.0;
    b.step_one(0);
    assert!(b.output(0, OUT_THRUST) > 0.9);
    assert_eq!(b.output(0, OUT_TURN), 0.0);
    b.step_one(0);
    assert!(b.output(0, OUT_TURN) > 0.9);
}

#[test]
fn the_starter_brain_has_the_documented_shape() {
    let g = brain::starter(&mut Rng::new(1));
    assert_eq!((g.n_hidden, g.conns.len(), g.bias.len(), g.alpha.len()), (4, 39, 6, 6));
    let ids: Vec<u32> = g.conns.iter().map(|c| c.history).collect();
    assert_eq!(ids, (1..=39).collect::<Vec<u32>>());
    assert!(g.conns.iter().all(|c| (c.src as usize) < N_IN + 4 && c.dst >= N_IN as u16));
    let h = brain::starter(&mut Rng::new(2));
    assert_eq!(h.conns[10].history, g.conns[10].history); // founders share ids
    assert_ne!(h.conns[10].weight, g.conns[10].weight);
}

/// A patch of plants at (1000, 500). A creature starts 300 units away, facing away.
fn seeker(seed: u32, chemo: f32) -> f32 {
    let mut w = World::new(seed, 1536.0, 1024.0);
    for k in [id::PLANT_GROWTH, id::PLANT_SEED_CHANCE, id::PLANT_DEATH_RESERVE, id::BASAL,
              id::PART_UPKEEP, id::NEURON_UPKEEP, id::CONN_UPKEEP, id::MOVE_COST, id::INTAKE_RATE] {
        w.params.set(k, 0.0);
    }
    for k in 0..20 {
        let s = w.plants.slots.alloc().expect("plant slot") as usize;
        let (dx, dy) = ((k % 5) as f32 * 6.0 - 12.0, (k / 5) as f32 * 6.0 - 9.0);
        (w.plants.x[s], w.plants.y[s], w.plants.reserve[s], w.plants.cap[s]) =
            (1000.0 + dx, 500.0 + dy, 20.0, 20.0);
    }
    w.plants.dirty = true;
    w.run(800); // let the scent spread before the creature exists
    let mut g = Genome::founder(&mut Rng::new(seed as u64));
    g.chemo = chemo;
    let at = SpawnAt { x: 700.0, y: 500.0, heading: 3.14, growth: 1.0, energy01: 1.0,
                       parent: 0, generation: 0, mark: 0 };
    let c = w.spawn(g, at).expect("slot") as usize;
    w.creatures.bud_cooldown[c] = 1_000_000;
    w.run(1200);
    ((w.creatures.x[c] - 1000.0).powi(2) + (w.creatures.y[c] - 500.0).powi(2)).sqrt()
}

#[test]
fn a_founder_follows_scent_to_food_and_a_noseless_one_does_not() {
    let mut wins = 0;
    for seed in 1..=5 {
        let (with_nose, without) = (seeker(seed, 0.6), seeker(seed, 0.0));
        assert!(with_nose < 80.0, "seed {seed}: ended {with_nose} from the patch");
        if with_nose < without {
            wins += 1;
        }
    }
    assert!(wins >= 4, "nose beat no nose on only {wins} of 5 seeds");
}

#[test]
fn creatures_think_on_alternate_ticks() {
    let mut w = World::new(1, 1536.0, 1024.0);
    w.seed_founders(2, 1200);
    w.run(100);
    let t0 = (w.creatures.cmd_turn[0], w.creatures.cmd_turn[1]);
    w.tick();
    let t1 = (w.creatures.cmd_turn[0], w.creatures.cmd_turn[1]);
    w.tick();
    let t2 = (w.creatures.cmd_turn[0], w.creatures.cmd_turn[1]);
    // exactly one of the two slots thinks on each tick
    assert!((t0.0 != t1.0) != (t0.1 != t1.1));
    assert!((t1.0 != t2.0) != (t1.1 != t2.1));
    assert!((t0.0 != t1.0) != (t1.0 != t2.0));
}
```

(`powi` is banned in the core. This test file starts with `#![allow(clippy::disallowed_methods)]`.)

Add to `crates/sim/tests/snapshot.rs`: the 1,500 + 1,500 round trip must still pass. It now covers
activations.

- [ ] Run `cargo test --test brain`. Expect: failures.
- [ ] Implement. Raise `FORMAT_VERSION`.
- [ ] Run `make check`. Expect: exit 0, including native-equals-WASM.
- [ ] Run `make gates`. Expect: `PASS`. This is the first real throughput reading. Record `median_tps`
  and the mean creature count in `docs/gates.md` and replace the ESTIMATE in `../architecture.md` §2.
  If it is `FAIL`, stop and report the per-phase times. Do not lower the floor.
- [ ] Browser check (`?debug`): creatures gather on the green patches and graze. No console errors.
- [ ] Commit: `feat(tidepool): recurrent brains, chemoreceptor sense, and a scent-following founder`.

## Task 16: Health gate, density probe, and tuning (`coder`, Opus, high effort)

Nothing else runs on the machine's simulation while this task measures.

**Files:**
- Create: `crates/headless/src/health.rs`, `docs/findings/m1-density.md`, `docs/findings/m1-tuning.md`
- Modify: `crates/headless/src/main.rs`, `Makefile`, `crates/sim/src/params.rs` (final defaults),
  `docs/gates.md`

**Blocked by:** Task 15. **Seam:** 3.

**Interfaces produced:**

`tidepool-headless gate-health [--seeds 1,2,3] [--ticks 12000] [--param name=value]...`

Runs the seeds one after another on the default world (1536 by 1024, 400 creatures, 1,200 plants).
Prints one row when each seed finishes, and flushes it, so that a killed run still leaves the rows it
finished:

```
seed=1 creatures=412 min_late=233 plants=1630 births_late=188 max_gen=14 mean_chemo=0.47 parked=0.03 first_bud=812 PASS
seed=2 ... FAIL(min_late=61 < 100)
gate-health 2/3 FAIL
```

Exit 0 only when every seed passes.

| Measure | Meaning | Band |
|---|---|---|
| `creatures` | Alive at the end | 150 to 3,000 |
| `min_late` | Fewest alive at any tick in the second half | 100 or more |
| `plants` | Alive at the end | 300 to 7,000 |
| `births_late` | Births in the last 2,000 ticks | 20 or more |
| `max_gen` | Highest generation alive at the end | 8 or more |
| `mean_chemo` | Mean `chemo` gene of the living | 0.15 or more |
| `parked` | Share of adults with `energy01` above 0.9 and speed below 0.05 | 0.25 or less |
| `first_bud` | Mean age at first bud, over the run | Reported, no band |

`mean_chemo` is the early warning for risk R1 in `design.md`: a sense that costs upkeep and does not pay
is stripped. `parked` is the warning for R13.

`tidepool-headless probe-density [--seed 1] [--ticks 12000]` prints, at ticks 3,000, 6,000, and 12,000:
the median distance from a creature to its nearest creature, the median distance from a creature to its
nearest plant, the share of creatures within 2 body lengths of a plant, and the mean creatures per
occupied grid cell.

- [ ] Implement both subcommands. `make gates` runs `bench` then `gate-health`.
- [ ] **Prove the gate before trusting it.** Run each and paste the output into `docs/gates.md`:
  - `gate-health --param plant_growth=0`. Expect: every seed `FAIL`, exit 1.
  - `gate-health --param basal=0.01`. Expect: `FAIL`, exit 1.
  - `gate-health --seeds 1 --ticks 12000 --param mut_rate=0 --param mut_weight_rate=0`. Expect a `PASS`
    or `FAIL` that does not crash: with no mutation the gene measures must still print.
- [ ] Run `probe-density` on seed 1. Write the table to `docs/findings/m1-density.md`. The design rule
  (`design.md` §7.3): local spacing must sit below interaction range. For M1 that means the median
  distance from a creature to its nearest plant stays under about 3 body lengths. If it does not,
  fertility and plant parameters are the first thing to tune, before any creature parameter.
- [ ] Run `gate-health` on the defaults. Record the rows as the baseline in
  `docs/findings/m1-tuning.md`.
- [ ] If the baseline passes 3 of 3, skip to the final proof.
- [ ] If it does not, tune. Rules:
  1. One change per trial: one parameter, or one group that only makes sense together. State the
     hypothesis before the run.
  2. Every trial is 12,000 ticks on seeds 1, 2, 3. Never judge at fewer ticks. The draft's 6,000-tick
     reads were wrong in both directions.
  3. Record every trial in `docs/findings/m1-tuning.md`: the change, the hypothesis, the three rows, the
     verdict. Keep failed trials in the table.
  4. Order of suspicion: food supply (`plant_growth`, `plant_cap`, `fert_blobs`, `fert_radius`), then
     intake and upkeep (`intake_rate`, `basal`, `part_upkeep`), then reproduction (`bud_at`,
     `child_energy`, `bud_cooldown`), then motion cost.
  5. If `mean_chemo` fails, lower `part_upkeep` or raise patchiness before adding any mechanism.
  6. A change to a rule, not a number, is out of scope for this task. Stop and report.
  7. At most 12 trials. If the gate still fails, stop and report the table. Do not widen a band.
- [ ] Write the passing values into `params.rs` as the defaults. Update the default column of the
  parameter table in this plan's Task 10 to match.
- [ ] Final proof: `make check && make gates`. Expect: exit 0, `gate-health 3/3 PASS`, `bench` `PASS`.
- [ ] **First read of the game's central premise.** Add `tidepool-headless probe-skip [--seed n]`. It
  runs 12,000 ticks to settle, then 24,000 more (one time-skip). It prints, for each of the 6 body genes
  and for brain weight magnitude, the population mean and standard deviation at the start and at the
  end of the skip, and the shift of the mean in units of the starting standard deviation. Run it on
  seeds 1, 2, 3, one at a time. Write the table to `docs/findings/m1-skip-drift.md` with one plain
  sentence at the top: after one skip, did any gene's mean move by more than 1 standard deviation on at
  least 2 of 3 seeds. This measures drift and selection with no player in the world. It does not show
  that the world adapts to a player. It shows whether one skip is long enough for anything to change.
  If nothing moves, say so plainly at the top of the file: the skip length or the mutation rates are
  then the first question for M2, long before M5.
- [ ] Record in `docs/findings/m1-tuning.md`: mean `first_bud`, and whether a generation is near the
  800 ticks that the 24,000-tick skip assumes (`../architecture.md` §2). If it is off by more than a
  factor of 2, say so at the top of the file. The skip length is decided in M5.
- [ ] Commit: `feat(tidepool): health gate and density probe, with tuned M1 defaults`.

## Task 17: Bodies, plants, and camera on screen (`coder`, Opus)

**Files:**
- Modify: `src/render/renderer.ts`, `src/render/shaders.ts`, `src/app/camera.ts`, `src/app/main.ts`

**Blocked by:** Task 10. Runs alongside tasks 11 and 12. **Seam:** 4.

**Interfaces produced:**

```ts
// src/app/camera.ts — additions
export const SCALE_MIN = 0.4;                      // the whole world fits a laptop screen
export const SCALE_MAX = 12;
export const PLAY_SCALE = 4;                       // a 12-unit body is 48 CSS pixels long
export function zoomAt(cam: Camera, cssW: number, cssH: number, sx: number, sy: number, factor: number): Camera;
export function pan(cam: Camera, dxCss: number, dyCss: number): Camera;
/** Moves the camera toward the target by the fraction 1 - exp(-6 * dt). `dt` in seconds. */
export function follow(cam: Camera, targetX: number, targetY: number, targetScale: number, dt: number): Camera;
export function clampToWorld(cam: Camera, worldW: number, worldH: number, cssW: number, cssH: number): Camera;

// src/render/renderer.ts — draw gains a time for animation
draw(prev: FrameView | null, cur: FrameView, alpha: number, cam: Camera, timeSeconds: number): void;
```

Rendering:

- **Plants** first: one instanced draw. A soft round blob, radius from the record, green whose
  brightness follows `reserve01`. A grazed plant looks thin and pale.
- **Creatures** second. Per instance: position, heading, length, width, hue, `energy01`, flags. The
  quad is `length + tail` long and `width * 2.5` wide, rotated by heading. Fragment shader:
  - Body: a capsule signed-distance field of the given length and width. A translucent fill, a brighter
    membrane line at the edge, a darker nucleus toward the front.
  - Tail: a tapering line behind the body whose sideways offset is
    `sin(along * 9.0 - timeSeconds * speedFactor) * amplitude`. `speedFactor` comes from how far the
    creature moved between `prev` and `cur`, so a still creature's tail is still.
  - Colour from hue. Value and saturation fall with `energy01` so that a starving creature looks faded.
  - `FLAG_LINEAGE`: a thin pale outline. `FLAG_POSSESSED`: a ring around the body, drawn as an arc whose
    swept angle is `energy01` of a full turn. This is the energy ring of `design.md` §11.
- Interpolate heading along the shortest arc.
- Background: a vertical gradient from `#0a2a3a` at the top of the world to `#04121c` at the bottom,
  fixed to world coordinates, so that depth reads even in M1.

Camera in Watch (nothing possessed): wheel zooms about the cursor, drag pans, two-finger pinch zooms on
touch. Always `clampToWorld`. Send `view` when the view rectangle changes, at most once per frame.
`main.ts` keeps a `mode` of `'watch'` or `'play'`. This task implements Watch. Task 18 adds Play.

- [ ] Write unit tests for the pure camera functions in `tests/camera.test.ts`:

```ts
import { expect, test } from 'vitest';
import { clampToWorld, follow, screenToWorld, viewRect, zoomAt } from '../src/app/camera';

test('zooming about a point keeps that point under the cursor', () => {
  const cam = { x: 500, y: 400, scale: 2 };
  const before = screenToWorld(cam, 1000, 600, 300, 200);
  const after = screenToWorld(zoomAt(cam, 1000, 600, 300, 200, 1.5), 1000, 600, 300, 200);
  expect(after.x).toBeCloseTo(before.x, 4);
  expect(after.y).toBeCloseTo(before.y, 4);
});

test('zoom stops at the limits', () => {
  const cam = { x: 500, y: 400, scale: 11 };
  expect(zoomAt(cam, 1000, 600, 0, 0, 4).scale).toBe(12);
  expect(zoomAt(cam, 1000, 600, 0, 0, 0.001).scale).toBe(0.4);
});

test('follow converges and does not depend on frame rate', () => {
  let a = { x: 0, y: 0, scale: 1 };
  let b = { x: 0, y: 0, scale: 1 };
  for (let i = 0; i < 60; i++) a = follow(a, 100, 50, 4, 1 / 60);
  for (let i = 0; i < 30; i++) b = follow(b, 100, 50, 4, 1 / 30);
  expect(a.x).toBeCloseTo(b.x, 1);
  expect(a.scale).toBeCloseTo(b.scale, 2);
  expect(a.x).toBeGreaterThan(90);
});

test('the view never leaves the world when the world is larger than the view', () => {
  const cam = clampToWorld({ x: -500, y: 9000, scale: 2 }, 1536, 1024, 800, 600);
  const r = viewRect(cam, 800, 600);
  expect(r.x0).toBeGreaterThanOrEqual(0);
  expect(r.y1).toBeLessThanOrEqual(1024);
});

test('a view larger than the world is centred on it', () => {
  const cam = clampToWorld({ x: 0, y: 0, scale: 0.4 }, 1536, 1024, 4000, 3000);
  expect(cam.x).toBeCloseTo(768, 4);
  expect(cam.y).toBeCloseTo(512, 4);
});
```

- [ ] Run `pnpm exec vitest run tests/camera.test.ts`. Expect: failures.
- [ ] Implement the camera functions, then the shaders and the two draws.
- [ ] Run `make check`. Expect: exit 0.
- [ ] Browser check (`make wasm && pnpm exec vite --port 5317`, open `/?debug`). Expect: capsule bodies
  with waving tails that point where they swim, green plant blobs in patches once Task 12 has landed
  (none before), zoom and pan working, fps at 55 or more with the whole world in view, no console
  errors. Take one screenshot zoomed out and one at scale 4, and look at both.
- [ ] Emulate a phone with the chrome-devtools `resize_page` tool at 390 by 844. Expect: the canvas
  fills the screen and pinch zoom works.
- [ ] Commit: `feat(tidepool): capsule bodies, plants, and a free camera`.

## Task 18: Possess, steer, and let go (`coder`, Opus)

This is the task that decides whether the game feels good to hold.

**Files:**
- Create: `src/app/input.ts`, `tests/input.test.ts`
- Modify: `src/app/main.ts`, `src/ui/state.ts`, `src/ui/App.tsx`

**Blocked by:** Tasks 11 and 17. Runs alongside Task 13. **Seam:** 2 for the steering maths, 4 for feel.

**Interfaces produced:**

```ts
// src/app/input.ts
export interface Steer { manual: boolean; thrust: number; turn: number }
export interface Keys { up: boolean; left: boolean; right: boolean }
export const GRACE_MS = 500;

/** W or ArrowUp thrusts. A or ArrowLeft turns -1. D or ArrowRight turns +1. Both turn keys cancel. */
export function steerFromKeys(k: Keys): { thrust: number; turn: number; active: boolean };

/**
 * Steer toward a world point. `heading` in radians. Turn is proportional to the angle between the
 * heading and the direction to the point, saturating at 0.5 radians. Thrust rises with distance up to
 * 4 body lengths, and drops to 0.3 of that when the point is behind the creature.
 */
export function steerToward(
  cx: number, cy: number, heading: number, length: number, px: number, py: number,
): { thrust: number; turn: number };

/** Manual stays true for GRACE_MS after the last active input, then hands over to the brain. */
export function manualNow(lastActiveMs: number, nowMs: number): boolean;

// src/ui/state.ts — additions
export const mode = signal<'watch' | 'play'>('watch');
export const brainDriving = signal(false);
export const hint = signal<string | null>(null);
```

Behavior:

- **Watch:** a click or tap on the canvas that did not drag sends `possessAt` with the world point and
  a radius of `24 / camera.scale`. `possessed` with a non-zero uid sets `mode` to `'play'`. A zero uid
  shows the hint "Nothing there." for 1.5 seconds.
- **Play:** the camera follows the possessed creature (found in the frame by `possessedSlot`) at
  `PLAY_SCALE`. Wheel zoom still works between `SCALE_MIN` and `SCALE_MAX`. Dragging does not pan.
- **Steering:** keys through `steerFromKeys`. A held mouse button or a held touch steers with
  `steerToward` the pointer's world position, using the creature's interpolated position and heading.
  Keys win when both are active.
- Each animation frame in Play: compute `Steer`. Send `input` when `manual` is true, and once more when
  it turns false. Do not send identical consecutive messages.
- **Letting go:** when `brainDriving` (frame header word 6) is true, show
  "Your instincts are steering. Move to take over." When it is false in Play, show nothing.
- `Escape` sends `release` and sets `mode` to `'watch'`.
- In Watch with nothing possessed, show "Click any creature to become it."
- Keys are ignored when the page is hidden or the window loses focus: clear all held keys on `blur`.
- Record `performance.now()` at the first `keydown` or `pointerdown` after idle, and again at the first
  frame after it in which the possessed creature's heading or position differs from the brain-driven
  extrapolation. Expose the median of the last 20 as `window.__tidepool.inputLatencyMs` in dev.

- [ ] Write the failing tests:

```ts
// tests/input.test.ts
import { expect, test } from 'vitest';
import { GRACE_MS, manualNow, steerFromKeys, steerToward } from '../src/app/input';

test('keys map to thrust and turn', () => {
  expect(steerFromKeys({ up: true, left: false, right: false })).toEqual({ thrust: 1, turn: 0, active: true });
  expect(steerFromKeys({ up: false, left: true, right: false })).toEqual({ thrust: 0, turn: -1, active: true });
  expect(steerFromKeys({ up: true, left: false, right: true })).toEqual({ thrust: 1, turn: 1, active: true });
  expect(steerFromKeys({ up: false, left: true, right: true })).toEqual({ thrust: 0, turn: 0, active: true });
  expect(steerFromKeys({ up: false, left: false, right: false }).active).toBe(false);
});

test('a point dead ahead means full thrust and no turn', () => {
  const s = steerToward(100, 100, 0, 12, 200, 100);
  expect(s.turn).toBeCloseTo(0, 5);
  expect(s.thrust).toBeCloseTo(1, 5);
});

test('a point on the +θ side turns positive, and y grows downward', () => {
  // heading 0 faces +x. A point below on screen (larger y) is at a positive angle.
  expect(steerToward(100, 100, 0, 12, 200, 200).turn).toBeGreaterThan(0);
  expect(steerToward(100, 100, 0, 12, 200, 0).turn).toBeLessThan(0);
});

test('turn saturates and wraps the short way round', () => {
  expect(steerToward(100, 100, 0, 12, 100, 300).turn).toBe(1);
  // heading just under PI, target just past -PI: a small positive turn, not a full spin back
  const s = steerToward(100, 100, 3.1, 12, 0, 95);
  expect(s.turn).toBeGreaterThan(0);
  expect(s.turn).toBeLessThan(0.5);
});

test('a near point means gentle thrust, and a point behind means less', () => {
  expect(steerToward(100, 100, 0, 12, 106, 100).thrust).toBeLessThan(0.3);
  const ahead = steerToward(100, 100, 0, 12, 200, 100).thrust;
  const behind = steerToward(100, 100, 0, 12, 0, 100).thrust;
  expect(behind).toBeCloseTo(ahead * 0.3, 5);
});

test('manual holds for the grace period, then the brain takes over', () => {
  expect(manualNow(1000, 1000 + GRACE_MS - 1)).toBe(true);
  expect(manualNow(1000, 1000 + GRACE_MS + 1)).toBe(false);
});
```

- [ ] Run `pnpm exec vitest run tests/input.test.ts`. Expect: failures.
- [ ] Implement.
- [ ] Run `make check`. Expect: exit 0.
- [ ] Browser check, desktop. Click a creature. Expect: the camera glides to it, the ring appears, the
  instincts line shows. Hold `W` and `D`. Expect: it swims a clockwise arc, the instincts line hides.
  Release the keys. Expect: within about half a second the instincts line returns and the creature
  keeps swimming on its own. Press `Escape`. Expect: Watch mode and the click prompt.
- [ ] Read `__tidepool.inputLatencyMs` after 20 key presses. Expect: 120 or less. If it is higher,
  extrapolate the possessed creature on the page by one tick from its velocity, then measure again.
  Record the number in `docs/findings/m1-feel.md`.
- [ ] Browser check, phone size (390 by 844, touch emulation). Tap a creature, then hold a finger ahead
  of it. Expect: it swims to the finger. Lift the finger. Expect: the brain takes over.
- [ ] Feel check, written down in `docs/findings/m1-feel.md` in plain words: can you follow a scent
  patch edge, can you circle a plant without overshooting, does turning at full speed feel wide but
  fair, does anything feel like ice. A steering model that tests well and feels bad is a failed task.
  Report it. Do not tune motor parameters here: they belong to Task 16.
- [ ] Commit: `feat(tidepool): possess a creature, steer it by keys or touch, and hand back to its brain`.

## Task 19: Death and heirs (`coder-std`, Sonnet)

**Files:**
- Create: `src/ui/DeathOverlay.tsx`
- Modify: `src/ui/App.tsx`, `src/ui/state.ts`, `src/app/main.ts`

**Blocked by:** Tasks 14 and 18. Runs alongside Task 15. **Seam:** 4. The host path is already tested
in tasks 13 and 14.

**Interfaces produced:**

```ts
// src/ui/state.ts — additions
import type { DeathCause, Heir } from '../protocol';
export const death = signal<{ cause: DeathCause; heirs: Heir[] } | null>(null);
export const focusHeir = signal<Heir | null>(null);        // main.ts moves the camera to it

// src/ui/DeathOverlay.tsx
export function DeathOverlay(props: {
  cause: DeathCause;
  heirs: Heir[];
  onPick(uid: number): void;
  onWatch(): void;
  onFocus(heir: Heir | null): void;
}): preact.JSX.Element;
```

Behavior:

- On `died`: set `death`, set `mode` to `'watch'`. The world is already paused by the host.
- The overlay sits at the bottom third of the screen so the world stays visible. It says
  "You starved." or "You died of old age."
- **No heirs (build this first):** "Your line has ended." and one button, "Keep watching". It clears
  `death` and sends `speed` with `TICK_HZ`. The Watch prompt returns.
- **Heirs:** "Continue as a descendant." and up to 5 cards. Each card shows a swatch in the heir's hue,
  "Generation `n`", and an energy bar. Hovering or focusing a card calls `onFocus`, and the camera
  glides to that heir. Clicking it sends `possess` with the uid.
- On `possessed` with a non-zero uid while `death` is set: clear `death`, set `mode` to `'play'`.
- On `possessed` with uid 0 while `death` is set: show "That one is gone." and leave the overlay open.
  The world is paused, so this should not happen. It is the error state, and it must not strand the
  player.
- Cards are buttons. `Tab` moves between them and `Enter` picks. Touch targets are at least 44 CSS
  pixels.

- [ ] Implement the no-heirs state, then the heirs state.
- [ ] Run `make check`. Expect: exit 0.
- [ ] Browser check. Open `/?debug`, possess a creature, and in the console send
  `__tidepool.setParam('lifespan', 600)` (add `setParam(name, value)` to the dev handle: it looks the
  index up in the `ready` parameter list and posts `param`). Expect: within 30 seconds the death
  overlay appears with the world frozen behind it.
- [ ] With heirs: reload, possess one creature, press `Escape`, wait 2 minutes for its line to bud,
  possess another, set `lifespan` to 600. Expect: cards appear. Hover one: the camera moves to it. Click
  it: the overlay closes, the world runs, and you are steering the heir.
- [ ] Without heirs: reload, possess a creature at once, set `lifespan` to 600. Expect: "Your line has
  ended." and a working "Keep watching".
- [ ] Phone size check of both states.
- [ ] Commit: `feat(tidepool): death overlay with heir pick and a line-ended state`.

## Task 20: M1 exit (`auditor`, Opus, fresh context, then the orchestrator)

**Files:**
- Create: `docs/findings/m1-exit.md`
- Modify: `../architecture.md` (§2 and §13 with measured values), `../roadmap.md` (mark M0 and M1 done),
  `docs/decisions/INDEX.md` (any decision made during the build)

**Blocked by:** Tasks 15, 16, 18, 19.

- [ ] Dispatch an `auditor` with fresh context. Give it only: `../roadmap.md`, `../design.md`,
  `../architecture.md`, `docs/gates.md`, and `docs/findings/`. Ask it to:
  1. Run `make check` and `make gates` and paste the output.
  2. Repeat every failure proof in `docs/gates.md`.
  3. For each M1 bullet in the roadmap, name the test or probe that shows it, or say there is none.
  4. For each claim in `docs/findings/`, say whether it shows that a mechanism fires, that evolution
     uses it, or that it helps, and flag any claim worded more strongly than its evidence.
  5. List every number in rule code that is not in the parameter table.
  6. Report to `docs/findings/m1-audit.md`.
- [ ] Fix what the audit finds. A finding that needs a rule change goes to the owner, not into this
  milestone.
- [ ] Play it as a stranger. Open the page with no query string and follow no instructions. The exit
  check from the roadmap: swim, eat, bud, die, and continue as a descendant. Write what was confusing
  in `docs/findings/m1-exit.md`.
- [ ] Write `docs/findings/m1-exit.md`: the three health gate rows, the throughput reading and the mean
  population it was taken at, the density table, fps, input latency, and the list of open problems.
- [ ] Replace the ESTIMATE in `../architecture.md` §2 with the measured reference-world throughput.
- [ ] **Owner check.** These need the owner and are listed in the handoff, not done by an agent:
  open `/?bench` on a phone and on a mid-range laptop and record the numbers, and play for five
  minutes and say whether steering feels right.
- [ ] Commit: `docs(tidepool): M1 exit record and measured budgets`.

After M1, the next plan is M2 (Bodies). It is written from what M1 measured, not before.

---

## Self-review

**Roadmap coverage.**

| Roadmap item | Task |
|---|---|
| M0: scaffold with build, test, lint, type gates | 1 |
| M0: seeded RNG, entity pool, spatial hash, tick loop, state hash, drifting circles | 2, 3 |
| M0: simulation in a worker, page draws what it sends | 7, 8 |
| M0: headless runner on the same core | 2, 6 |
| M0: determinism test, throughput test, each gate proven on bad input | 2, 4, 5, 6, 9 |
| M0: snapshot round trip (added to the roadmap by this plan) | 4 |
| M0: in-page benchmark (added) | 7, 8 |
| M1: rigid body with thrust and torque, Cilia, Flagellum | 11 |
| M1: Filter mouth | 13 |
| M1: plants with a reserve and a per-bite fraction | 12, 13 |
| M1: intake with a satiation stop, upkeep, movement cost, growth | 13 |
| M1: budding with mutation of body numbers, old age | 13, 14 |
| M1: starter brain, Chemoreceptor reading plant scent | 15 |
| M1: click to possess, keyboard, mouse, touch, camera follow | 17, 18 |
| M1: release the controls and the brain drives | 10, 18 |
| M1: on death choose a living descendant | 10, 13, 14, 19 |
| M1 exit: stranger test, alive at 12,000 ticks on 3 seeds | 16, 20 |

**Deliberate differences from `design.md`.**

- `design.md` §6 lists an `eat` output. In M1 a Filter mouth eats on contact with no output (Task 13).
  `design.md` §6 is updated to say so. `bite` and `accept mate` arrive with the Jaw and with mixing.
- Life-history genes (`design.md` §5.5) are parameters in M1, not genes. `lifespan` and `bud_at` are
  the same for every creature. The roadmap places the genes in M2.
- Plants do not evolve in M1. The roadmap places plant genomes in M6.
- The brain's inputs and outputs are fixed in M1. Parts declare them from M3.

**Names checked across tasks:** `seed_founders` and `seedFounders`, `SpawnAt`, `World::spawn` and
`World::kill`, `control.death_cause`, `HEIR_STRIDE` 7 on both sides, `CREATURE_STRIDE` 10,
`FRAME_HEADER_WORDS` 8, parameter names in the table against every `id::` used in a test.

**Known soft spots.** Read these before starting.

1. Function bodies in this plan were not compiled. Expect small fixes to borrow-checker details in the
   tests, most likely where a closure reads `world` while a method borrows it.
2. Every default in the parameter table is arithmetic, not measurement. Task 16 exists because of that.
3. Task 15's scent-following test depends on scent reaching 300 units in 800 ticks. If it does not,
   raise `scent_decay` toward 1 in the test's world first, and tell Task 16.
4. Native-equals-WASM is expected to hold and has not been shown. Task 5 finds out.
5. The 2,400 ticks-per-second floor is measured against a stand-in until Task 15. Even then M1
   understates the cost: it has no eyes, and the eye scan was the largest phase in the benchmark. The
   floor gets tight in M2.
6. Whether one time-skip changes anything a player can see is the premise of the whole game. Task 16's
   `probe-skip` is the first read of it. Nothing before M5 proves it.

