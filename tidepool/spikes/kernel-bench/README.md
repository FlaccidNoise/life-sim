# kernel-bench

Throwaway benchmark. It decides the language for the Tidepool simulation core: TypeScript on V8, or Rust compiled to WebAssembly. Results and the recommendation are in `tidepool/docs/research/kernel-bench.md`.

## What it measures

One simulation tick with six phases: spatial hash, sense, brain, act and integrate, contact, scent field. The same algorithm is written twice:

- `ts/kernel.ts`: TypeScript, typed arrays, no allocation in the tick.
- `rust/src/lib.rs`: Rust, safe indexing, no intrinsics, no crates.

Variants:

| name | what runs |
|---|---|
| `ts` | `ts/kernel.ts` on Node (V8) |
| `wasm-simd` | Rust built for `wasm32-unknown-unknown` with `+simd128`, run in the same Node |
| `wasm-nosimd` | the same build without `+simd128` |
| `native` | the same Rust built for the host with `-C target-cpu=native` |
| `native-par-T` | stretch: native Rust with the sense and brain phases on `T` rayon threads |

## Files

- `build.sh`: builds the Rust artifacts into `build/`.
- `ts/cell.ts`: measures one cell (variant, N, profile) and prints one JSON line. `rust/src/main.rs` does the same for the native variants.
- `run.ts`: runs cells one at a time, each in a new process. It stops with an error if the variants do not agree on the init state hash and the tick-0 work counters.
- `report.ts`: prints the markdown tables from the JSON.
- `results/`: the JSON and logs behind the numbers in the results file.

## Reproduce

Run every command from the repo root. Rust needs the `wasm32-unknown-unknown` target (`rustup target add wasm32-unknown-unknown`).

```sh
# 1. Build the WebAssembly and native variants.
tidepool/spikes/kernel-bench/build.sh

# 2. Main table: all variants, both profiles. 200 warm-up ticks, 1,000 timed ticks, 5 runs per cell.
pnpm exec tsx tidepool/spikes/kernel-bench/run.ts --out results/bench-pass1.json \
  --ns 100,250,500,1000,2000,5000,10000,20000

# 3. Per-phase breakdown.
pnpm exec tsx tidepool/spikes/kernel-bench/run.ts --out results/profile.json --mode profile \
  --ns 5000,10000 --profiles L

# 4. Stretch: threaded native estimate.
pnpm exec tsx tidepool/spikes/kernel-bench/run.ts --out results/par.json \
  --ns 2000,5000,10000,20000 --variants native,native-par-2,native-par-4,native-par-8

# 5. Tables.
pnpm exec tsx tidepool/spikes/kernel-bench/report.ts \
  tidepool/spikes/kernel-bench/results/bench-pass1.json tidepool/spikes/kernel-bench/results/profile.json
```

One cell by hand:

```sh
pnpm exec tsx tidepool/spikes/kernel-bench/ts/cell.ts wasm-simd 5000 L bench
tidepool/spikes/kernel-bench/build/kernel_native 5000 L profile
```

Typecheck the spike (the root `tsconfig.json` does not include it):

```sh
pnpm exec tsc --noEmit -p tidepool/spikes/kernel-bench/tsconfig.json
```

Check that the SIMD build contains SIMD instructions and the other build contains none:

```sh
cd tidepool/spikes/kernel-bench/rust
RUSTFLAGS="-C target-feature=+simd128" cargo rustc --release --lib --target wasm32-unknown-unknown \
  --target-dir target-asm-simd -- --emit asm
grep -cE '\b(v128|f32x4|i32x4)\.' target-asm-simd/wasm32-unknown-unknown/release/deps/kernel_bench.s
```

## Timing rules

- Run nothing else heavy while a measurement runs. `run.ts` records the 1-minute load average next to each cell.
- Every run starts from the same seed, so each of the 5 runs in a cell does the same work.
