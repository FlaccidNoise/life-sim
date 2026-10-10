# Kernel benchmark — TypeScript or Rust/WASM for the simulation core

Run 2026-10-09 and 2026-10-10. Code: `tidepool/spikes/kernel-bench/`. Raw data:
`spikes/kernel-bench/results/bench-pass1.json` and `results/profile.json`.

## Verdict

**Rust compiled to WebAssembly with SIMD.** It is 2.0 to 2.6 times faster than TypeScript at 1,000 to
2,000 creatures, which is the population range the time-skip budget allows. TypeScript misses the budget
at 1,000 creatures before plants, metabolism, and reproduction are added. WASM passes with about 100 µs
per tick to spare.

Neither stack gets near the 5,000 to 20,000 creatures that the draft ran. The time-skip sets the
population, not the frame rate. The reference population is about 1,500 creatures.

## What was measured

One tick with six phases: counting-sort spatial hash, eye-cone sense scan, recurrent brain step,
act and integrate with soft repulsion, contact energy transfer, scent field deposit and diffusion.
The same algorithm in TypeScript (`ts/kernel.ts`) and Rust (`rust/src/lib.rs`).

- World 2048 by 8192. Creatures start in 40 clumps (sigma 160), so local density rises with N.
- Profile S: 4 to 16 hidden neurons, 30 to 90 connections. Profile L: 24 to 72 hidden, 150 to 350.
- 1 to 4 eyes, range 96, half-angle 0.6 rad. Scent grid 256 by 1024.
- 200 warm-up ticks, then 1,000 timed ticks, 5 runs per cell, median reported.
- Variants: `ts` on Node v22.23.3 (V8). `wasm-simd` and `wasm-nosimd` in the same Node. `native` with
  `-C target-cpu=native`. Rust 1.99.0. Apple M4 Pro.
- Fairness: all variants agree on the init state hash and the tick-0 work counters in every cell.
  `run.ts` stops if they do not. After tick 0 the trajectories diverge, because JavaScript computes in
  64-bit floats and Rust in 32-bit. Aggregate statistics after 1,200 ticks differ by 0.1% to 10%. The
  work done still matches: sense candidates per creature per tick agree within 1.5% in every cell.

**The machine was loaded.** The 1-minute load average was 4 to 24 during the runs (other sessions' test
suites and a Time Machine backup). Each cell records its load. Treat every number as a lower bound.
Cells at load above 12 are marked noisy. The per-phase run had a load of 5 to 11 and tighter spreads, so
the per-phase table is the better source.

## Per-phase cost (median µs per tick)

| variant | N | brains | hash | sense | brain | act | contact | scent | total | ticks/s |
|---|---|---|---|---|---|---|---|---|---|---|
| ts | 1,000 | S | 32 | 183 | 144 | 49 | 17 | 350 | 776 | 1,288 |
| wasm-simd | 1,000 | S | 15 | 111 | 80 | 36 | 17 | 57 | 316 | 3,135 |
| wasm-nosimd | 1,000 | S | 16 | 114 | 83 | 37 | 17 | 202 | 468 | 2,149 |
| native | 1,000 | S | 17 | 92 | 53 | 25 | 14 | 41 | 241 | 4,142 |
| ts | 2,000 | S | 35 | 592 | 343 | 112 | 49 | 352 | 1,482 | 674 |
| wasm-simd | 2,000 | S | 17 | 352 | 204 | 85 | 47 | 57 | 762 | 1,302 |
| native | 2,000 | S | 15 | 349 | 176 | 64 | 43 | 43 | 690 | 1,433 |
| ts | 5,000 | S | 44 | 2,570 | 941 | 351 | 185 | 374 | 4,465 | 224 |
| wasm-simd | 5,000 | S | 22 | 1,562 | 713 | 284 | 184 | 69 | 2,834 | 353 |
| ts | 1,000 | L | 40 | 240 | 758 | 68 | 23 | 452 | 1,581 | 586 |
| wasm-simd | 1,000 | L | 14 | 117 | 371 | 38 | 18 | 55 | 613 | 1,630 |
| ts | 2,000 | L | 35 | 595 | 1,313 | 125 | 51 | 357 | 2,476 | 404 |
| wasm-simd | 2,000 | L | 18 | 386 | 992 | 94 | 52 | 62 | 1,603 | 624 |
| wasm-simd | 5,000 | L | 23 | 1,558 | 2,525 | 308 | 191 | 69 | 4,673 | 214 |

Sense candidates per creature per tick: 7.5 at N=1,000, 14 at N=2,000, 34 at N=5,000.

## Findings

1. **The budget is 417 µs per tick** (2,400 ticks per second). WASM with SIMD holds it to about 1,300
   creatures with small brains and about 640 with large brains. TypeScript holds it to about 200.
2. **The scent field is a fixed cost that SIMD removes.** 350 µs in TypeScript, 200 µs in WASM without
   SIMD, 57 µs with SIMD. In TypeScript the field alone is 84% of the budget. SIMD made no measurable
   difference to any other phase.
3. **Sense dominates and grows with local density.** Cost per creature triples from N=1,000 to N=5,000
   because each eye scans a 7 by 7 block of cells. Population size is not the lever. Local density and
   scan area are.
4. **Brains cost about 1.3 to 1.5 ns per connection per tick in WASM.** A small brain is about 80 ns per
   creature. A large brain is about 370 ns. Brain size is the second lever.
5. **WASM is within 1.1 to 1.3 times of native.** A native headless runner gains little speed. Its value
   is direct access to simulation state for probes.
6. **WASM over TypeScript by phase:** sense 1.65x, brain 1.3 to 2.0x, act 1.35x, contact 1.0x, scent
   6x.

## What this sets in `architecture.md`

| Decision | Value | Basis |
|---|---|---|
| Core language | Rust to `wasm32-unknown-unknown` with `+simd128` | Finding 1 |
| Threads | None. One simulation worker. | `tech-feasibility.md`: Android WebView has no WASM threads |
| Sense and brain rate | Every second tick, staggered by slot | Halves the two largest phases (findings 3, 4) |
| Reference population | 1,500 creatures with small brains | Estimate below |
| Brain caps | 96 neurons, 384 connections | Finding 4 |
| Eye scan | Cone bounding box, not the full 7 by 7 block | Finding 3. Work for the Eye milestone. |

Estimate for 1,500 creatures, small brains, sense and brain on every second tick, interpolated from the
table: hash 16 + sense 108 + brain 70 + act 60 + contact 30 + scent 57 = about 340 µs. That leaves about
75 µs for plants, metabolism, and reproduction. **This is an estimate, not a measurement.** The M0
throughput gate replaces it with a measured number.

## Not measured

- Any device other than this M4 Pro. A mid-range laptop and a phone are slower by an unknown factor.
  M0 ships an in-page benchmark so the factor can be read on real devices.
- A browser. Node and Chrome share V8, so WASM numbers should carry over. Safari and Firefox were not
  run.
- Threaded native (the stretch variant). `rust/src/par.rs` exists and was not built or run.
- Plants in the hash, part-based physics, births and deaths, lineage bookkeeping.
- A quiet machine. A rerun with load under 2 would raise every number.

## Determinism note

The native and WASM variants agree on the init hash but their aggregate statistics differ after 1,200
ticks (9th digit at N=100, up to a few percent at larger N). The likely cause, not isolated: the spike
calls `sin` and `cos` from the standard library, which differ between the two targets. The real
core must use its own approximations if native and WASM are to agree bit for bit.
