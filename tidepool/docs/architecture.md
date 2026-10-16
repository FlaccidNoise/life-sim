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
| **Throughput floor** | **2,400 ticks per second** at the reference world, WASM in Node, reference machine (Apple M4 Pro), read per creature-tick since 2026-10-16: at most 278 ns for one body for one tick (2,400 at 1,500 bodies). A run with a mean below 80% of the reference population of 1,500 creatures is void. | 24,000 ticks in 10 s |
| Reference world | The default world (1536 by 1024, 400 founder creatures, 1,200 founder plants, seed 1) after 12,000 ticks | It holds 1,243 to 1,319 creatures on seeds 1 to 3 at the head of M2, and 1,213 to 1,458 at the head of M3 (`gate-health`). The floor is a seed 1 reading: of seeds 1 to 10, seeds 4 and 6 are void (`findings/m2-audit-2.md`, check 18). Reading at the head of M2 (every body has eyes), 2026-10-12, seed 1, mean of 1,320 creatures over the timed ticks: native 3,188 to 3,411 ticks per second and WASM in Node 2,933 to 3,127. That is a 24,000-tick skip in 7.7 to 8.2 s. An older world sits at the floor: after 108,000 settle ticks it holds 1,665 creatures and WASM reads 2,357 to 2,471 on four readings at a load average of 4.3 to 6.9. No gate times that world. Reading at the head of M3 (brain upkeep and mixing on), 2026-10-14, seed 1, 1,394 creatures: native 2,660 to 2,968 and WASM in Node 2,646 to 2,801 over nine readings at a load of 2.6 to 8. M3's target over the floor is 2,600 (`findings/m3-tuning.md` Part 4). Measured at M1, with no eyes: 3,757 in WASM and 4,381 native, at a mean of 1,539 creatures. All readings: `gates.md` "Throughput readings", `findings/m2-senses.md`. |
| Creature pool | 4,096 slots. Budding fails when the pool is full. | Bounds the worst case |
| Plant pool | 8,192 slots | |
| Parts per genome | 12 genes (up to 24 parts when mirrored) | `MAX_PART_GENES`. Enforced from M2. |
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

Fixed order. Each phase is one function. Most have their own module: contact and life are both in
`energy.rs`, and budding is `repro::step`.

| # | Phase | Notes |
|---|---|---|
| 1 | grid | Counting-sort spatial hash of creatures, cell 32. The plant hash is rebuilt only when plants change. |
| 2 | sense | Creatures whose think turn it is. Fills brain inputs. |
| 3 | brain | The same creatures. One recurrent step. |
| 4 | control | The possessed creature's outputs are replaced by player input when manual: thrust, turn, and accept. |
| 5 | act | Outputs to force and torque. Integrate. World bounds. The push of each overlap, and the nearest overlap of each body, kept as scratch. |
| 6 | mate | Two full-grown bodies that touch and both accept exchange genomes, with chance `mix_rate` (`mate.rs`). `mix_rate` is 1 by default since 2026-10-14. |
| 7 | contact | Eating. Later: bites. |
| 8 | life | Upkeep, growth, age, death, budding. Births and deaths are queued and applied in slot order. |
| 9 | plants | One eighth of the plant slots per tick: growth and seeding. |
| 10 | fields | Scent deposit and diffusion, every 2nd tick. |

### 5.3 Determinism

The same build, seed, parameters, and inputs give the same state hash, in native and in WASM.

- One seeded generator, forked into one stream per subsystem. One stream is shared: `rng_mate` draws
  the chance of a pair (`mate.rs`) and the draws of a cross (`repro.rs`), in that fixed order.
- Iterate in ascending slot order. No hash-map iteration.
- No standard-library transcendental functions (`sin`, `cos`, `exp`, `powf`, `tanh`). They differ between
  targets. Use `sim::math`. Clippy rejects the banned calls. `sqrt` and basic arithmetic are exact and
  allowed.
- No `mul_add`. A float-to-int cast is defined in Rust (NaN gives 0), so it does not break
  determinism, but a cast on a value that can be NaN hides a bug: `energy.rs` casts `old` to `u32`, and
  the frame packs NaN as 0.
- The state hash covers every field that the snapshot covers. The snapshot covers every field that
  affects the future. One test proves both: save, load, run on, compare with an unbroken run.

If native and WASM cannot be made to agree, the headless runner switches to running the `.wasm` and the
native binary is dropped. M0 answers this.

### 5.4 Genome and parts

- A genome holds the body genes `len`, `wid`, `egg`, `old`, and `hue`, a list of part genes, and a
  brain genome. `egg` is the growth of a newborn that this body buds. `old` is the age of death by
  old age, in ticks. A body is mature when it is full-grown. The ranges are constants in
  `genome.rs`: `LEN_RANGE` 6 to 24, `WID_RANGE` 0.3 to 0.9, `EGG_RANGE` 0.2 to 0.7, and `OLD_RANGE`
  1,200 to 9,600. The width of a body is `len * wid`. Neither brood size nor maturity age is a gene.
- The part list has at most `MAX_PART_GENES` (12) genes, in gene order. A part gene holds a kind, an
  `anchor`, a `size`, an `extra`, and a history id. The kinds are Flagellum, Cilia, Filter,
  Chemoreceptor, Fin, and Eye, numbered 1 to 6. The anchor runs from 0 at the nose to 1 at the tail.
  An anchor of exactly 0 or 1 is on the midline and makes one part. Any other value makes a mirrored
  pair, and the size counts once. Sizes run from 0 to 1. A Filter has a floor of 0.2. Only an Eye
  reads `extra`, which sets the width of its cone.
- Only two kinds use their place. A Flagellum splits its size into push, by `push_of(anchor)`, and
  turning, by `side_of(anchor)`. An Eye turns its anchor into the angle of its cone from the
  heading. Cilia, Fin, Filter, and Chemoreceptor use their size alone. The place is drawn and has no
  effect.
- `Creatures::express` makes the arrays the rules read from a genome, at spawn and at load. They are
  not saved. A value that is not finite counts as 0, and every part value is held in 0 to 1.
- `Genome::mutated` has the M1 draws first: len, wid, part sizes, hue, weights, biases, and time
  constants. Five M2 groups follow, in this order: shape (anchors, and the `extra` of eyes), life
  (`egg` and `old`), remove, duplicate, and add. Then four M3 groups: remove a connection, remove a
  hidden neuron with its connections, add a connection, and add a hidden neuron by splitting a
  connection. Each group has a rate in the parameter table, and a rate of 0 makes no draw. Remove loses
  one part chosen evenly. Duplicate copies one part to the end with a nudged anchor, and copies each
  connection that names it. Add puts a new part of a random kind on the end, with size
  `part_new_size`, and `part_wires` connections from the inputs it brings. Duplicate and add need
  room. `Genome::prune` runs on every child: a connection with an end that the body does not declare
  goes, and so does the second connection between one pair of ends.
- Every part gene and every connection gene has a history id. A founder takes ids 1 to
  `FOUNDER_HISTORIES`. `World::next_history` gives a new id to each duplicate and add, to each new
  connection, and to each new hidden neuron. It is in the snapshot. `mix::cross` lines up the genes of
  two genomes by these ids (`mix.rs`).
- A part has no upkeep of its own. It costs through mass. Mass is the area times
  `heft = (1 + part_mass * S) / (1 + part_mass * REF_PARTS)`, where `S` is the sum of the part sizes
  and an eye counts `eye_cost` times. Energy capacity follows the area alone. Growth costs
  `build_cost` times the mass gained. Upkeep is paid for mass to the power 3/4, scaled so that the
  reference body pays `basal` per unit of mass (`energy.rs`). The mouth follows the area. Top speed
  does not depend on size, because the force follows the area and the mass follows area times heft.
  The push between two overlapping bodies is split by mass: the lighter body takes more
  (`motor.rs`).
- An Eye makes one cone on the midline and two elsewhere, at most `MAX_EYES` (8) cones on a body.
  Genes past that still cost their size. The half angle is `EYE_HALF_MIN + EYE_HALF_SPAN * extra`.
  The range is `eye_range * size * length`, held to `EYE_REACH` (64). Each cone feeds two inputs of
  its own eye gene: the nearness of the nearest plant and of the nearest body in the cone, 1 at the
  eye and 0 at the range, times `eye_gain`. Nothing is summed over cones. A body scans on one think in
  `see_every` (`eye.rs`).

### 5.5 Brains

- One arena for the whole population. Each creature has an offset and counts. M1 uses one size class:
  a fixed stride of 96 neurons and 384 connections per slot. The offset indirection stays so that size
  classes can be added without touching the evaluator.
- Neuron order per creature: inputs, hidden, outputs.
- Connections are `(src: u16, dst: u16, weight: f32)` sorted by destination. Activations are
  double-buffered.
- Update: `a[j] += alpha[j] * (act(bias[j] + sum(w * a_prev[src])) - a[j])`. `alpha` of 1 is a
  memoryless neuron. `act(x)` is the rational tanh from the spike, clamped to plus or minus 3.
- The evaluator is final from M1. From M3 a brain genome is a list of hidden neuron genes, out genes,
  and connection genes. A connection names its two ends as `Node { owner, port }`: the body (owner 0),
  a part gene, or a hidden neuron gene, by history id. It holds no index (`genome.rs`).
- `brain::ports` is the one place that says which neurons a body declares. The body: constant,
  energy, age, speed, and two mate inputs, then the three scent inputs if its chemoreceptors have a size sum above 0,
  then two inputs per cone of each eye gene. The outputs: thrust, turn, and accept. `Brains::express`
  turns names into indexes. A connection with an end that the body does not declare is not expressed
  and costs nothing. Connections are sorted by (destination, source, history). A founder has 13
  inputs, 4 hidden neurons, 3 outputs, and 60 connections.
- Upkeep (rule U1 of the M3 plan): a body pays `fixed_upkeep`, plus `neuron_upkeep` per hidden neuron
  and `conn_upkeep` per expressed connection. An input or an output costs nothing.
- `hidden_gain` scales what a hidden neuron sends. At 0 a hidden neuron is silent: the control arm of
  the long gate.
- No layout is reserved for within-life learning yet. `Brains` has no `trace` array. A learning rule
  would add one per connection, with its own snapshot version.

### 5.6 Parameters

Every tunable constant is a named `f32` in one table, with a default, a minimum, and a maximum. The table
is readable and writable through the ABI and the headless CLI (`--param name=value`). The Lab panel is
generated from it. A constant that is not in the table cannot be tuned and must not need tuning. Not yet true: the M3
audit lists 14 groups of constants in rule code that are tunable by role (`findings/m3-audit.md`,
step 6), among them `FOUNDER_EYE_EXTRA`, which was tuned once from 0.4.

Parameters are part of the snapshot.

### 5.7 Snapshot

A little-endian byte buffer: magic `TDPL`, format version, payload length, payload, CRC32 of the payload.
`World::save` and `World::load`. A load of bad data returns an error and never a half-built world. The format version
rises on any layout change. It is 8 at the head of M3. A genome with more than `MAX_PART_GENES`
parts or a kind outside 1 to 6 is a load error. M5 adds migration, last-good backup, and export.

## 6. ABI

The core exports plain functions prefixed `tp_`. The worker reads buffers through typed-array views of
WASM memory and must re-create its views after any call that can grow memory. Layout constants (frame
strides, header size, the brain readout) are exported as functions. A test fails if `protocol.ts`
disagrees with them. `tp_brain_write(uid)` writes the readout of one living brain: a header, six
words per neuron, three per connection. The ABI version is 6 at the head of M3.

`tp_abi_version()` rises on any change to an export's meaning. The worker refuses a module whose version
it does not know, and the page shows the error.

The full list for M0 and M1 is in the plan.

## 7. Worker protocol

Messages are plain objects with a `type` field, declared in `src/protocol.ts`.

- Page to worker: `init` (see below), `view`, `input` (thrust, turn, and accept while the player
  courts), `possessAt`, `possess`, `release`, `speed`, `param`, `recycle`, `bench`, `watchBrain`,
  `brainOf`. Later: `skip`, `save`, `load`, god tools.
- Worker to page: `ready`, `frame`, `stats`, `possessed`, `died`, `brain` (with each frame while the
  page watches the possessed body's brain), `brainOf`, `benchResult`, `error`. Later:
  `skipProgress`, `skipReport`.

`init` carries `seed`, an optional `snapshot`, and an optional `params` list of `{ name, value }`.
The worker makes the world, sets each named parameter through the ABI (`tp_param_set`), and only
then seeds the founders, because the fertility map and the founder genomes read the parameters. A
snapshot has its own parameters, and the named ones replace them after the load. The value is
clamped to the range of the parameter. A name that is not in the table frees the world and posts an
`error` that lists the valid names, and no `ready`. The page fills `params` in `?debug` only, from
each `p=<name>=<value>` of the address, like `p=bud_at=0.3`. A malformed `p` is an error on the
page. A second `init` is an error.

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
- M1 draws a capsule and a tail. M2 adds one instanced quad per part (`render/parts.ts`). A body
  shorter than `PART_LOD_PX` on screen draws only its flagella. In Play the renderer dims the world
  outside the eye cones of the possessed body. M6 adds depth lighting: fog and caustics in the
  fragment shader, bloom on a 5-level mip chain in `RGBA16F`.
- Parts ride in every creature record, so the page needs no cache by `uid`. The frame is
  `FRAME_HEADER_WORDS` (50) words, then one record of `CREATURE_STRIDE` (26) words for each creature
  in view, then one record of `PLANT_STRIDE` (4) words for each plant in view. A word is a `u32`,
  and a float is stored by its bit pattern. `crates/sim/src/frame.rs` writes it and
  `src/protocol.ts` reads it.
  - Header: tick, creature records, plant records, creatures alive, plants alive, the possessed slot
    (`NO_SLOT` for none), 1 when a possessed body is driven by its brain, living creatures with the
    lineage mark, buds of the possessed body, then the eye cones of the possessed body. That is a
    count and `MAX_EYES` places of 3 floats: direction in world radians, cosine of the half angle,
    range in world units.
  - Creature record: x, y, heading, length, width, hue, energy as a share of capacity, then `uid`,
    slot, flags (lineage 1, possessed 2, juvenile 4, budded 8, born of a cross 16, willing to mate 32,
    holds a donor 64), the brain word `hidden | conns << 16`, then `PART_WORDS` (12) part words in
    gene order, then the growth (the share of its full size), the age as a share of its life, and
    the `diet` gene (0 eats only plants, 1 only flesh). A
    part word is `kind | anchor << 8 | size << 16 | extra << 24`, each of the three values scaled
    from 0 to 1 onto a byte. A place with no part is 0. The grown length over the growth is the
    length gene.
  - Plant record: x, y, radius, reserve as a share of the cap.
  - After the plants, debris records (`DEBRIS_STRIDE` 3) and cloud records (`CLOUD_STRIDE` 4). The
    page buffers are `MAX_FRAME_BYTES` (`src/protocol.ts`), the bound of every record kind at its
    pool's capacity.
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
| `gate-evolve` | The evolution gate: each seed run as given and with each sense blind. `--brain` adds the brain bands. In `make gates` (36,000 ticks, seeds 1 to 3) and `make gates-long` (144,000 ticks, seeds 1, 4, 5, 6, 8). | Any seed leaves its bands |
| `probe-*` | Named measurements. Output goes to `docs/findings/`. | Never |
| `bake` | Not built. Planned: run long, pass the health gate, write the shipped snapshot. Today a world is baked with `run --out`. | Gate fails |

Every gate is proven on a known-bad input before it counts. The proof and its output are recorded in
`docs/gates.md`. A gate that has not rejected something is not a gate.

`scripts/bench-wasm.mjs` is the gate for the floor in §2. It times the `.wasm` in Node, because §2
defines the floor for WASM. It takes the same flags as `bench` and prints the same lines.

`make check` runs the crate count, format for Rust and TypeScript, Clippy, Rust tests, the WASM build,
type check, ESLint, and Vitest. `make gates` runs `bench`, `scripts/bench-wasm.mjs`, `gate-health`, and
`gate-evolve`. CI runs `make check`, both benches at a floor of 800, `gate-health`, and `gate-evolve` on
every push that touches `tidepool/`.

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

Confirmed on 2026-10-11 and removed from this list: the native build on x86-64 gives the hashes of the
`.wasm`. The first CI run passed `tests/determinism.test.ts` on an x86-64 runner, and its health rows
equal the aarch64 rows to the digit (`gates.md`, CI note).

- The throughput floor on any machine other than the reference machine. The `?bench` page reads it. The
  owner has not run it on a phone or a mid-range laptop yet.
- That one time-skip changes what a player sees. M1 measured about 11 generations per skip, and body
  size at the floor of its range after the first skip (`findings/m1-skip-drift.md`).
- Netlify building Rust.
- `tech-feasibility.md` lists 16 more open items for later milestones.
