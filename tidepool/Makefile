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

gates: headless ## Throughput and health gates (task 16 adds the health gate)
	$(HEADLESS) bench
