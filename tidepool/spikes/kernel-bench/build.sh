#!/bin/sh
# Builds the three Rust artifacts into build/. Each gets its own target dir so the flags never mix.
set -eu
cd "$(dirname "$0")/rust"
. "$HOME/.cargo/env"
mkdir -p ../build

RUSTFLAGS="-C target-feature=+simd128" cargo build --release --lib \
  --target wasm32-unknown-unknown --target-dir target-wasm-simd
cp target-wasm-simd/wasm32-unknown-unknown/release/kernel_bench.wasm ../build/kernel_simd.wasm

RUSTFLAGS="" cargo build --release --lib \
  --target wasm32-unknown-unknown --target-dir target-wasm-nosimd
cp target-wasm-nosimd/wasm32-unknown-unknown/release/kernel_bench.wasm ../build/kernel_nosimd.wasm

RUSTFLAGS="-C target-cpu=native" cargo build --release --bin kernel-bench --target-dir target-native
cp target-native/release/kernel-bench ../build/kernel_native

ls -l ../build
