.PHONY: wasm headless dev build site site-guard check gates gates-long fmt

WASM := target/wasm32-unknown-unknown/release/tidepool_sim.wasm
HEADLESS := target/release/tidepool-headless
SITE ?= $(HOME)/CodingProjects/personal-website
SITE_DEMO := $(SITE)/public/demos/tidepool

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

site-guard:
	@test -d "$(SITE)/public/demos" || { echo "error: the site repo is not at $(SITE) (no public/demos folder). Fix: clone it there, or run make site SITE=<path to the site repo>."; exit 1; }

site: site-guard headless wasm ## Bake the world, build the bundle, and replace the site's tidepool demo folder. Never commits
	mkdir -p public
	$(HEADLESS) run --seed 1 --ticks 36000 --creatures 400 --plants 1200 --out public/m2-world.tdpl
	pnpm exec vite build
	rm -rf "$(SITE_DEMO)"
	mkdir -p "$(SITE_DEMO)"
	cp -R dist/. "$(SITE_DEMO)/"

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

gates: headless wasm ## Throughput, health, and evolution gates
	$(HEADLESS) bench
	node scripts/bench-wasm.mjs
	$(HEADLESS) gate-health
	$(HEADLESS) gate-evolve

gates-long: headless ## The evolution gate at tick 144,000, with the brain bands. Run at each milestone exit, not in CI
	$(HEADLESS) gate-evolve --seeds 1,4,5,6,8 --ticks 144000 --brain --predation
