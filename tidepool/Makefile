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
	pnpm exec prettier --write src tests scripts

check: wasm headless ## Every fast gate
	@test "$$(grep -c '^name = ' Cargo.lock)" = 2 || { echo "error: the cargo workspace must hold only tidepool-sim and tidepool-headless, and crates/sim must have zero dependencies. Cargo.lock lists:"; grep '^name = ' Cargo.lock; echo "Fix: remove the extra crate or dependency."; exit 1; }
	cargo fmt --all -- --check
	cargo clippy --workspace --all-targets -- -D warnings
	cargo test --workspace
	pnpm exec tsc --noEmit
	pnpm exec prettier --check src tests scripts
	pnpm exec eslint .
	pnpm exec vitest run

gates: headless wasm ## Throughput and health gates
	$(HEADLESS) bench
	node scripts/bench-wasm.mjs
	$(HEADLESS) gate-health
