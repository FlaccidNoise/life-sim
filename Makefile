.PHONY: help dev test check lint typecheck build headless

help: ## Show available targets
	@grep -E '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) \
	  | awk 'BEGIN{FS=":.*?## "}{printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2}'

dev: ## Run the Vite dev server
	pnpm dev

test: ## Run the test suite once
	pnpm test

typecheck: ## Type-check without emitting
	pnpm typecheck

lint: ## Lint the codebase
	pnpm lint

build: ## Build the production bundle
	pnpm build

headless: ## Run the headless simulation entry
	pnpm headless

check: typecheck lint test ## Run typecheck + lint + tests
