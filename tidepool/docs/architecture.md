# Tidepool — Architecture

Status: set 2026-10-10 from `research/kernel-bench.md` and `research/tech-feasibility.md`. This file says
HOW the game is built. `design.md` says what it is. `roadmap.md` says in what order.

## 1. Stack

| Layer | Choice | Version checked | Why |
|---|---|---|---|
| Simulation core | Rust, no crates, built for `wasm32-unknown-unknown` with `+simd128` | rustc 1.99.0 | 2.0 to 2.6 times faster than TypeScript at the target population (`kernel-bench.md`) |
| JS binding | Hand-written C ABI. No `wasm-bindgen`, no `wasm-pack`. | n/a | The spike's 55 KB module loads with zero imports. No version coupling. |
| Headless runner | Native Rust binary on the same core crate | cargo 1.99.0 | Probes read simulation state directly |
| Worker, renderer, app | TypeScript, strict | 6.x (`typescript-eslint` 8 supports `<6.1.0`) | TypeScript 7 is out but the linter does not support it |
| Build and test | Vite 8, Vitest 4, ESLint 10, pnpm 11 | Same majors as the repo root | Known to work together here |
| Renderer | WebGL2, hand-written. No three.js. | n/a | WebGPU reach is about 85%. WebGL2 is about 97%. |
| UI | Preact 11 with `@preact/signals` 2 | 11.0.1, 2.11.3 | Small. Signals fit a view fed by a worker. |
| Hosting | Netlify static site | n/a | The owner's site is there. No cross-origin isolation headers are needed (§3). |

Verified on this machine on 2026-10-10: a cargo workspace with a `cdylib` plus `rlib` core crate and a
binary crate, `rust-toolchain.toml` pinning 1.99.0 with the wasm target, `.cargo/config.toml` rustflags
for `+simd128`, a `clippy.toml` `disallowed-methods` entry failing the build on `f32::sin`, and a nested
`pnpm-workspace.yaml` giving `tidepool/` its own lockfile and `node_modules`.

## 2. Budgets

These numbers are the contract. Changing one is a decision, logged in `docs/decisions/INDEX.md`.

| Budget | Value | Basis |
|---|---|---|
| Tick | 1/20 second of world time | Reaction time of 50 to 100 ms reads as alive |
| Think rate | Each creature senses and thinks every 2nd tick. Odd and even slots alternate. | Halves the two largest phases |
| Time-skip target | 24,000 ticks (20 minutes of world time). M1 measured about 11 generations per skip: a generation is about 2,200 ticks. The design assumed about 30. M5 decides the skip length. | `design.md` §4, `findings/m1-tuning.md` |
| Time-skip wall time | 10 seconds on the reference machine. Hard stop at 30 seconds on any machine. | The report says how many generations passed |
| **Throughput floor** | **2,400 ticks per second** at the reference world, WASM in Node, reference machine (Apple M4 Pro). A run with a mean below 80% of the reference population of 1,500 creatures is void. | 24,000 ticks in 10 s |
| Reference world | The default world (1536 by 1024, 400 founder creatures, 1,200 founder plants, seed 1) after 12,000 ticks | It holds 1,148 to 1,477 creatures on seeds 1 to 3. The floor is a seed 1 reading: seeds 3 and 4 would be void (`gates.md`). Measured at M1: 3,757 ticks per second in WASM and 4,381 native, at a mean of 1,539 creatures (`gates.md`). That is a 24,000-tick skip in 6.4 s. M1 has no eyes, so it understates M2. M2 gives the first full reading. |
| Creature pool | 4,096 slots. Budding fails when the pool is full. | Bounds the worst case |
| Plant pool | 8,192 slots | |
| Parts per genome | 12 genes (up to 24 parts when mirrored) | Enforced from M2 |
| Brain | 96 neurons and 384 connections per creature | About 1.4 ns per connection per tick |
| Frame | 60 fps render on a mid-range laptop with the sim in a worker | |
| Baked snapshot | Under 2 MB gzipped | `tech-feasibility.md` |

A skip that would pass 30 seconds stops there. Worlds are local to one player, so a shorter skip on a slow
device breaks nothing.

Slower devices are not measured. M0 ships an in-page benchmark (`?bench`) to read the factor on a real
laptop and phone.

## 3. Threads

- **Main thread:** input, camera, rendering, UI, audio.
- **One simulation worker:** owns the WASM instance and all simulation state.
- No `SharedArrayBuffer`. No WASM threads. Android WebView has no WASM threads, and shared memory needs
  response headers that the page then depends on. Frames cross by transfer of `ArrayBuffer`s from a pool
  of 3.
- A threaded skip is a possible later upgrade. It is not planned.

## 4. Layout

```
tidepool/
  AGENTS.md  README.md  Makefile
  Cargo.toml  rust-toolchain.toml  clippy.toml  .cargo/config.toml
  package.json  pnpm-workspace.yaml  tsconfig.json  eslint.config.js  vite.config.ts  vitest.config.ts
  index.html
  crates/
    sim/            the simulation. Zero dependencies. cdylib + rlib.
    headless/       native CLI: run, bench, gates, probes, bake.
  src/
    protocol.ts     message types and frame layout shared by worker and page
    wasm/           build output (gitignored): tidepool_sim.wasm
    worker/         wasm.ts (typed wrapper over the ABI), host.ts (message handling), sim.worker.ts (entry)
    render/         WebGL2
    ui/             Preact components
    app/            main.ts, input, camera
  tests/            Vitest, runs in Node against the built .wasm
  docs/             design, architecture, roadmap, plans/, research/, findings/, decisions/, gates.md
  spikes/           throwaway measurements. Never imported.
```

Dependency rule, enforced by ESLint for `src/` and by the crate count in `make check` for the crates:

- `crates/sim` imports nothing.
- `crates/headless` imports `sim`.
- `src/worker` imports `protocol` and the `.wasm`. `src/render` and `src/ui` import `protocol`.
- `src/app` imports all of them. Nothing imports `app`.
- `render` and `ui` do not import each other or `worker`.

`tidepool/` shares no code, config, or dependencies with the draft in the repo root.

## 5. The simulation core

### 5.1 State

One `World` struct owns everything. Struct-of-arrays pools with fixed capacity, a free list, and ascending
slot iteration. Every creature has a `uid: u32` from a birth counter (0 means none). Outside the core,
creatures are named by `uid`. A slot is reused. A `uid` is never reused.

### 5.2 Tick

Fixed order. Each phase is one function in its own module.

| # | Phase | Notes |
|---|---|---|
| 1 | grid | Counting-sort spatial hash of creatures, cell 32. The plant hash is rebuilt only when plants change. |
| 2 | sense | Creatures whose think turn it is. Fills brain inputs. |
| 3 | brain | The same creatures. One recurrent step. |
| 4 | control | The possessed creature's motor outputs are replaced by player input when manual. |
| 5 | act | Outputs to force and torque. Integrate. World bounds. |
| 6 | contact | Eating. Later: bites, mating. |
| 7 | life | Upkeep, growth, age, death, budding. Births and deaths are queued and applied in slot order. |
| 8 | plants | One eighth of the plant slots per tick: growth and seeding. |
| 9 | fields | Scent deposit and diffusion, every 2nd tick. |

### 5.3 Determinism

The same build, seed, parameters, and inputs give the same state hash, in native and in WASM.

- One seeded generator, forked into one stream per subsystem. No stream is shared.
- Iterate in ascending slot order. No hash-map iteration.
- No standard-library transcendental functions (`sin`, `cos`, `exp`, `powf`, `tanh`). They differ between
  targets. Use `sim::math`. Clippy rejects the banned calls. `sqrt` and basic arithmetic are exact and
  allowed.
- No `mul_add`. No float-to-int casts on values that can be NaN.
- The state hash covers every field that the snapshot covers. The snapshot covers every field that
  affects the future. One test proves both: save, load, run on, compare with an unbroken run.

If native and WASM cannot be made to agree, the headless runner switches to running the `.wasm` and the
native binary is dropped. M0 answers this.

### 5.4 Brains

- One arena for the whole population. Each creature has an offset and counts. M1 uses one size class:
  a fixed stride of 96 neurons and 384 connections per slot. The offset indirection stays so that size
  classes can be added without touching the evaluator.
- Neuron order per creature: inputs, hidden, outputs.
- Connections are `(src: u16, dst: u16, weight: f32)` sorted by destination. Activations are
  double-buffered.
- Update: `a[j] += alpha[j] * (act(bias[j] + sum(w * a_prev[src])) - a[j])`. `alpha` of 1 is a
  memoryless neuron. `act(x)` is the rational tanh from the spike, clamped to plus or minus 3.
- The evaluator is final from M1. M1 genomes give every creature the same shape and evolve weights only.
  M3 adds structural mutation, history ids, and crossover.
- Layout reserves a per-connection `trace: f32` array for within-life learning. It is not allocated
  while learning is off.

### 5.5 Parameters

Every tunable constant is a named `f32` in one table, with a default, a minimum, and a maximum. The table
is readable and writable through the ABI and the headless CLI (`--param name=value`). The Lab panel is
generated from it. A constant that is not in the table cannot be tuned and must not need tuning.

Parameters are part of the snapshot.

### 5.6 Snapshot

A little-endian byte buffer: magic `TDPL`, format version, payload length, payload, CRC32 of the payload.
`World::save` and `World::load`. A load of bad data returns an error and never a half-built world. The format version
rises on any layout change. M5 adds migration, last-good backup, and export.

## 6. ABI

The core exports plain functions prefixed `tp_`. The worker reads buffers through typed-array views of
WASM memory and must re-create its views after any call that can grow memory. Layout constants (frame
strides, header size) are exported as functions. A test fails if `protocol.ts` disagrees with them.

`tp_abi_version()` rises on any change to an export's meaning. The worker refuses a module whose version
it does not know, and the page shows the error.

The full list for M0 and M1 is in the plan.

## 7. Worker protocol

Messages are plain objects with a `type` field, declared in `src/protocol.ts`.

- Page to worker: `init`, `view`, `input`, `possessAt`, `possess`, `release`, `speed`, `param`,
  `recycle`, `bench`. Later: `skip`, `save`, `load`, god tools.
- Worker to page: `ready`, `frame`, `stats`, `possessed`, `died`, `benchResult`, `error`. Later:
  `skipProgress`, `skipReport`.

Rules:

- The worker steps the world on a fixed-step accumulator. It posts at most one frame per 10 ms step,
  and a step can hold up to 5 ticks. A paused world posts one frame, with no tick, when the view
  changes.
- A frame holds only entities inside the view rectangle the page last sent, plus a margin.
- The page returns each frame buffer with `recycle`. If the pool is empty the worker skips that frame and
  keeps ticking.
- The page renders one tick behind and interpolates between the last two frames by slot. A slot whose
  `uid` changed is not interpolated.
- In Play, the page pauses the worker when the tab is hidden.
- Any failure in the worker becomes an `error` message. The page shows it. Nothing fails silently.

## 8. Rendering

- One instanced quad per entity. The fragment shader draws the shape as a signed-distance field.
- Premultiplied alpha. Device pixel ratio capped at 2.
- M1 draws a capsule and a tail. M2 adds one instanced quad per part with a second level of detail for
  small on-screen sizes. M6 adds depth lighting: fog and caustics in the fragment shader, bloom on a
  5-level mip chain in `RGBA16F`.
- Appearance that does not change within a life (outline, parts, hue) is sent once per `uid`. Per-frame
  data is position, heading, energy, and flags. M0 and M1 send one fixed record and do not need the split.
- `webglcontextlost` shows the error panel with a Reload button. A rebuild on `webglcontextrestored` is
  not built yet. A device with no WebGL2 gets a plain explanation, not a blank page.

## 9. UI

Preact components over the canvas. State from the worker lands in signals. The UI never reaches into the
renderer or the worker. Charts are hand-drawn on Canvas2D. The error state and the empty state of each
view are built before its normal state.

## 10. Headless runner and gates

`crates/headless` is one binary with subcommands.

| Command | Purpose | Fails when |
|---|---|---|
| `run` | Run N ticks from a seed. Print the state hash and counts. | Never |
| `bench` | Ticks per second of the native build, on the reference world of §2. For probes and a quick reading. | Below `--floor`, or a void run |
| `gate-health` | 12,000 ticks on 3 seeds, one at a time. | Any seed leaves its bands |
| `probe-*` | Named measurements. Output goes to `docs/findings/`. | Never |
| `bake` | Run long, pass the health gate, write the shipped snapshot. | Gate fails |

Every gate is proven on a known-bad input before it counts. The proof and its output are recorded in
`docs/gates.md`. A gate that has not rejected something is not a gate.

`scripts/bench-wasm.mjs` is the gate for the floor in §2. It times the `.wasm` in Node, because §2
defines the floor for WASM. It takes the same flags as `bench` and prints the same lines.

`make check` runs the crate count, format for Rust and TypeScript, Clippy, Rust tests, the WASM build,
type check, ESLint, and Vitest. `make gates` runs `bench`, `scripts/bench-wasm.mjs`, and `gate-health`.
CI runs `make check`, both benches at a floor of 800, and `gate-health` on every push that touches
`tidepool/`.

## 11. Later systems

Decided in outline. Each gets its detail in the plan for its milestone.

- **Persistence (M5):** OPFS sync access handle in the worker, IndexedDB fallback,
  `navigator.storage.persist()`, export and import to a file. Safari deletes storage after 7 days of
  browser use without a visit.
- **Baked world (M8):** gzipped at build time, streamed through `DecompressionStream('gzip')`.
- **Audio (M8):** starts on first tap. One summary message per frame from the worker. A fixed pool of 8
  to 16 voices. Silent during a skip.
- **Deploy (M8):** Netlify. Whether Netlify's build image can build Rust was not confirmed. The fallback
  is to build in GitHub Actions and deploy the output folder.

## 12. Who builds what

The next session is an orchestrator. It does not write code. It dispatches one task per agent, checks
each claim, and commits.

| Work | Agent | Model |
|---|---|---|
| Core rules, physics, brains, ABI, determinism, ecology tuning | `coder` | Opus 5.5, high effort |
| Changes across more than 3 files or across the ABI seam | `senior-coder` | Opus 5.5, high effort |
| Scaffold, config, UI components, tests that follow a pattern | `coder-std` | Sonnet 5.5 |
| Running gates and probes and reporting the output | `task-std` | Sonnet 5.5 |
| Lookups with no decision attached | `quick-task` with `model: haiku` | Haiku 5.5 |
| Review of a finished milestone against its probes | `auditor` | Opus 5.5, fresh context |

Rules for the orchestrator:

- One writer per file at a time. Two agents may run together only when the plan says their files do not
  overlap.
- An agent's report is a claim. Run the task's check command yourself before the commit.
- One 12,000-tick simulation at a time. Never two tuners on one world.
- An agent that fails the same step 3 times stops and reports. Move the task up one tier.

## 13. Not confirmed

- The throughput floor on any machine other than the reference machine.
- Bit-identical native and WASM results. M0 tests it.
- Netlify building Rust.
- `tech-feasibility.md` lists 16 more open items for later milestones.
