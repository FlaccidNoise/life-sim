# M0 — Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the project skeleton (strict TS, Vite, Vitest, ESLint, Makefile, CI, beads) and the core engine primitives (seedable RNG, AB/SAB-agnostic SoA memory, cell store, Config, an empty-but-ticking World) so that `make check` is green, runs are reproducible from `(Config, seed)`, and the hot loop allocates nothing.

**Architecture:** Data-oriented SoA — cells are array indices into parallel typed arrays over a single backing buffer that is `ArrayBuffer`/`SharedArrayBuffer`-agnostic. A counter-based seedable RNG plus ascending-slot-index iteration make single-threaded runs byte-for-byte reproducible. `core/` is pure (no DOM/Worker deps), enforced by ESLint. No physics yet — `tick()` only ages live cells; M1 adds the real simulation.

**Tech Stack:** TypeScript (strict), Vite, Vitest, typescript-eslint + Prettier, pnpm (via corepack), tsx (headless run), GitHub Actions, beads.

**Spec:** `docs/superpowers/specs/2026-06-15-life-sim-design.md` (this plan implements milestone M0; see §4.2, §5.1, §5.2, §5.4, §6, §7, §8).

---

## File Structure

**Tooling / config (repo root):**
- `package.json` — scripts + deps
- `tsconfig.json` — strict compiler options
- `vite.config.ts` — dev/preview server with COOP/COEP headers
- `vitest.config.ts` — forks pool with `--expose-gc` for the zero-alloc test
- `eslint.config.js` — flat config, type-checked, core/ boundary rules
- `.prettierrc.json` — formatting
- `Makefile` — canonical command interface
- `architecture.json` — module-boundary declaration (architecture-guard)
- `.github/workflows/ci.yml` — fast tier (every PR)
- `.github/workflows/nightly.yml` — slow/statistical tier stub
- `index.html` — Vite entry
- `README.md` — project overview, links to spec

**Source (`src/`):**
- `core/math/constants.ts` — shared numeric constants
- `core/math/vec2.ts` — pure scalar vector + toroidal helpers
- `core/math/rng.ts` — counter-based seedable RNG + stateless hashes
- `core/memory/buffers.ts` — AB/SAB-agnostic single-buffer SoA allocator
- `core/memory/cell-store.ts` — SoA cell store: free-list, `generation[]`, alloc/free
- `core/sim/config.ts` — typed serializable `Config`
- `core/sim/world.ts` — `World`: spawn + trivial tick
- `app/main.ts` — minimal browser entry (proves Vite build + crossOriginIsolated)
- `headless/run.ts` — minimal Node entry (proves headless run)

Tests are co-located: `src/**/*.test.ts`.

---

## Task 1: Project scaffold (pnpm, package.json, tsconfig)

**Files:**
- Create: `package.json`, `tsconfig.json`

- [ ] **Step 1: Enable pnpm and initialize the package**

Run:
```bash
corepack enable pnpm || npm i -g pnpm
pnpm init
corepack use pnpm@latest
```
Expected: a `package.json` is created and `corepack use` pins a `"packageManager": "pnpm@x.y.z"` field (CI's `pnpm/action-setup` reads this; keep it). (If `corepack enable` fails on permissions, the `npm i -g pnpm` fallback runs.)

- [ ] **Step 2: Install dependencies**

Run:
```bash
pnpm add -D typescript tsx vite vitest @vitest/coverage-v8 \
  eslint typescript-eslint eslint-config-prettier prettier @types/node
```
Expected: packages install; `pnpm-lock.yaml` is created. (`@types/node` is needed
for Node globals like `process` used by the headless entry and the zero-alloc test.)

pnpm 11 blocks dependency build scripts by default. esbuild (used by Vite/Vitest/
tsx) needs its postinstall to fetch its platform binary. Approve it by editing
the generated `pnpm-workspace.yaml` to:
```yaml
allowBuilds:
  esbuild: true
```
then run `pnpm install` again so esbuild's postinstall runs.

- [ ] **Step 3: Edit `package.json` — add `"type": "module"` and the scripts block**

Edit the generated `package.json` to add these fields. **Keep** the
`devDependencies` and `packageManager` fields that pnpm/corepack already wrote —
do not delete or hand-edit versions.

```jsonc
{
  // ...keep name/version/packageManager/devDependencies as generated...
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "test": "NODE_OPTIONS=--expose-gc vitest run",
    "test:watch": "NODE_OPTIONS=--expose-gc vitest",
    "typecheck": "tsc --noEmit",
    "lint": "eslint .",
    "headless": "tsx src/headless/run.ts"
  }
}
```

- [ ] **Step 4: Create `tsconfig.json` (strict)**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "types": ["node", "vite/client"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "verbatimModuleSyntax": true,
    "isolatedModules": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "noEmit": true
  },
  "include": ["src", "*.config.ts"]
}
```

- [ ] **Step 5: Verify the toolchain installed**

Run:
```bash
pnpm tsc --version && pnpm vitest --version
```
Expected: both print version numbers.

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-lock.yaml tsconfig.json
git commit -m "chore: scaffold pnpm + TypeScript strict config"
```

---

## Task 2: Vitest config + first smoke test

**Files:**
- Create: `vitest.config.ts`, `src/smoke.test.ts`

- [ ] **Step 1: Create `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    pool: 'forks',
    // The zero-allocation test (Task 15) needs global.gc; --expose-gc is passed
    // via NODE_OPTIONS in the package.json "test" script (Vitest 4 removed
    // poolOptions; forked workers inherit NODE_OPTIONS).
  },
});
```

- [ ] **Step 2: Write a failing smoke test**

`src/smoke.test.ts`:
```ts
import { describe, it, expect } from 'vitest';

describe('toolchain', () => {
  it('runs tests', () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 3: Run the test**

Run: `pnpm vitest run`
Expected: 1 passing test.

- [ ] **Step 4: Commit**

```bash
git add vitest.config.ts src/smoke.test.ts
git commit -m "test: add Vitest config and smoke test"
```

---

## Task 3: ESLint (type-checked) + Prettier + core/ boundary rules

**Files:**
- Create: `eslint.config.js`, `.prettierrc.json`

- [ ] **Step 1: Create `.prettierrc.json`**

```json
{
  "singleQuote": true,
  "semi": true,
  "trailingComma": "all",
  "printWidth": 100
}
```

- [ ] **Step 2: Create `eslint.config.js` (flat config)**

```js
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  // Root config files are not part of the TS project; don't type-check-lint them.
  { ignores: ['dist', 'coverage', 'node_modules', '*.config.ts', '*.config.js', 'eslint.config.js'] },
  // Type-checked rules apply to source only.
  {
    files: ['src/**/*.ts'],
    extends: [...tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
  },
  // core/ must stay pure: no DOM/Worker globals, no importing outer layers.
  {
    files: ['src/core/**/*.ts'],
    rules: {
      'no-restricted-globals': [
        'error',
        { name: 'window', message: 'core/ must be environment-agnostic' },
        { name: 'document', message: 'core/ must be environment-agnostic' },
        { name: 'self', message: 'core/ must be environment-agnostic' },
        { name: 'postMessage', message: 'core/ must be environment-agnostic' },
      ],
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/render/**', '**/app/**', '**/workers/**'],
              message: 'core/ must not import from render/app/workers',
            },
          ],
        },
      ],
    },
  },
  prettier,
);
```

- [ ] **Step 3: Run the linter**

Run: `pnpm eslint .`
Expected: no errors (it lints the smoke test + config; exits 0).

- [ ] **Step 4: Commit**

```bash
git add eslint.config.js .prettierrc.json
git commit -m "chore: add ESLint (type-checked) + Prettier + core boundary rules"
```

---

## Task 4: Vite config with COOP/COEP + minimal app entry

**Files:**
- Create: `vite.config.ts`, `index.html`, `src/app/main.ts`

- [ ] **Step 1: Create `vite.config.ts` (cross-origin isolation for SharedArrayBuffer)**

```ts
import { defineConfig } from 'vite';

// COOP/COEP make the page cross-origin isolated so SharedArrayBuffer is enabled.
const coiHeaders = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
};

export default defineConfig({
  server: { headers: coiHeaders },
  preview: { headers: coiHeaders },
});
```

- [ ] **Step 2: Create `index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>life-sim</title>
  </head>
  <body>
    <pre id="status">booting…</pre>
    <script type="module" src="/src/app/main.ts"></script>
  </body>
</html>
```

- [ ] **Step 3: Create `src/app/main.ts`**

```ts
import { World } from '../core/sim/world';
import { defaultConfig } from '../core/sim/config';

const world = new World(defaultConfig({ maxCells: 1000 }));
world.spawn(500);
for (let i = 0; i < 10; i++) world.tick();

const el = document.getElementById('status');
if (el) {
  el.textContent = [
    `crossOriginIsolated: ${globalThis.crossOriginIsolated}`,
    `shared memory: ${world.cells.soa.shared}`,
    `alive cells: ${world.cells.aliveCount}`,
    `tick: ${world.tickCount}`,
  ].join('\n');
}
```
(This imports modules created in Tasks 9–13. It will not type-check until those exist; that is expected. Do not run the dev server until Task 16.)

- [ ] **Step 4: Commit**

```bash
git add vite.config.ts index.html src/app/main.ts
git commit -m "chore: add Vite config (COOP/COEP) + minimal app entry"
```

---

## Task 5: Makefile

**Files:**
- Create: `Makefile`

- [ ] **Step 1: Create `Makefile`**

```makefile
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
```

- [ ] **Step 2: Verify help works**

Run: `make help`
Expected: a list of targets with descriptions.

- [ ] **Step 3: Commit**

```bash
git add Makefile
git commit -m "chore: add Makefile as canonical command interface"
```

---

## Task 6: GitHub Actions CI (tiered)

**Files:**
- Create: `.github/workflows/ci.yml`, `.github/workflows/nightly.yml`

- [ ] **Step 1: Create `.github/workflows/ci.yml` (fast tier — every push/PR)**

```yaml
name: CI
on:
  push:
  pull_request:

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm typecheck
      - run: pnpm lint
      - run: pnpm test
```

- [ ] **Step 2: Create `.github/workflows/nightly.yml` (slow/statistical tier stub)**

```yaml
name: Nightly
on:
  schedule:
    - cron: '0 7 * * *'
  workflow_dispatch:

jobs:
  statistical:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Placeholder for long statistical/evolutionary runs (added at M7)
        run: echo "No statistical tests yet — see spec §6 tier 5 (M7)."
```

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ci.yml .github/workflows/nightly.yml
git commit -m "ci: add fast PR tier + nightly statistical stub"
```

---

## Task 7: architecture.json + README + beads init

**Files:**
- Create: `architecture.json`, `README.md`; initialize beads

- [ ] **Step 1: Create `architecture.json` (module-boundary declaration)**

```json
{
  "$schema": "https://raw.githubusercontent.com/architecture-guard/schema/main/architecture.schema.json",
  "layers": {
    "core": {
      "path": "src/core",
      "mayImport": [],
      "description": "Pure headless engine. No DOM/Worker deps. No imports from outer layers."
    },
    "render": {
      "path": "src/render",
      "mayImport": ["core"],
      "description": "WebGL2 renderer. Reads core via read-only views; never mutates core."
    },
    "app": {
      "path": "src/app",
      "mayImport": ["core", "render"],
      "description": "Browser viewer/UI orchestration."
    },
    "headless": {
      "path": "src/headless",
      "mayImport": ["core"],
      "description": "Node CLI for batch runs / experiments."
    },
    "workers": {
      "path": "src/workers",
      "mayImport": ["core"],
      "description": "Worker entry + partitioning (M8)."
    }
  },
  "notes": "ESLint (eslint.config.js) is the CI-enforced layer for import direction and ambient DOM/Worker globals; this file documents intent for the architecture-guard skill."
}
```

- [ ] **Step 2: Create `README.md`**

```markdown
# life-sim

An emergent artificial-life simulator: free-floating cells on a 2D toroidal
plane interacting via physics forces, binding into multicellular organisms,
with neuron-cell neural networks, developmental genomes, and evolution driven
by an energy economy.

## Status
Milestone **M0 — Foundation** (see `docs/superpowers/plans/2026-06-15-m0-foundation.md`).

## Docs
- Design spec: `docs/superpowers/specs/2026-06-15-life-sim-design.md`
- Decisions: `docs/decisions/INDEX.md`

## Commands
Run `make help`. Common: `make dev`, `make test`, `make check`, `make headless`.
```

- [ ] **Step 3: Initialize beads**

Run:
```bash
bd init
```
Expected: beads initializes its git-native issue store (creates its tracking files). If `bd init` reports it is already initialized, that is fine.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "docs: add architecture.json, README, and beads init"
```

---

## Task 8: `core/math/constants.ts` + `core/math/vec2.ts`

**Files:**
- Create: `src/core/math/constants.ts`, `src/core/math/vec2.ts`
- Test: `src/core/math/vec2.test.ts`

- [ ] **Step 1: Write the failing test**

`src/core/math/vec2.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { len, lenSq, wrap, wrapDelta, torusDist } from './vec2';

describe('vec2', () => {
  it('computes length', () => {
    expect(lenSq(3, 4)).toBe(25);
    expect(len(3, 4)).toBe(5);
  });

  it('wraps a coordinate into [0, span)', () => {
    expect(wrap(5, 4)).toBe(1);
    expect(wrap(-1, 4)).toBe(3);
    expect(wrap(0, 4)).toBe(0);
  });

  it('computes the shortest signed delta on a torus', () => {
    expect(wrapDelta(1, 10)).toBe(1);
    expect(wrapDelta(9, 10)).toBe(-1);
    expect(wrapDelta(-9, 10)).toBe(1);
  });

  it('computes toroidal distance across the wrap seam', () => {
    // points at x=1 and x=9 on a width-10 torus are 2 apart, not 8
    expect(torusDist(1, 0, 9, 0, 10, 10)).toBeCloseTo(2);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run src/core/math/vec2.test.ts`
Expected: FAIL — cannot find module `./vec2`.

- [ ] **Step 3: Write the implementations**

`src/core/math/constants.ts`:
```ts
export const TWO_PI = Math.PI * 2;
export const EPSILON = 1e-9;
```

`src/core/math/vec2.ts`:
```ts
export function lenSq(x: number, y: number): number {
  return x * x + y * y;
}

export function len(x: number, y: number): number {
  return Math.sqrt(x * x + y * y);
}

/** Wrap a coordinate into [0, span). */
export function wrap(v: number, span: number): number {
  const r = v % span;
  return r < 0 ? r + span : r;
}

/** Shortest signed delta between two coordinates on a torus of the given span. */
export function wrapDelta(d: number, span: number): number {
  const half = span * 0.5;
  if (d > half) return d - span;
  if (d < -half) return d + span;
  return d;
}

/** Euclidean distance between two points on a toroidal plane. */
export function torusDist(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  width: number,
  height: number,
): number {
  return len(wrapDelta(bx - ax, width), wrapDelta(by - ay, height));
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run src/core/math/vec2.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/core/math/constants.ts src/core/math/vec2.ts src/core/math/vec2.test.ts
git commit -m "feat(core): add vec2 math + toroidal helpers"
```

---

## Task 9: `core/math/rng.ts` — counter-based seedable RNG

**Files:**
- Create: `src/core/math/rng.ts`
- Test: `src/core/math/rng.test.ts`

- [ ] **Step 1: Write the failing test**

`src/core/math/rng.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { Rng, hash32, hashFloat } from './rng';

describe('Rng', () => {
  it('is deterministic for the same seed', () => {
    const a = new Rng(42);
    const b = new Rng(42);
    const seqA = [a.next(), a.next(), a.next()];
    const seqB = [b.next(), b.next(), b.next()];
    expect(seqA).toEqual(seqB);
  });

  it('differs for different seeds', () => {
    const a = new Rng(1);
    const b = new Rng(2);
    expect(a.next()).not.toBe(b.next());
  });

  it('produces floats in [0, 1)', () => {
    const r = new Rng(7);
    for (let i = 0; i < 1000; i++) {
      const f = r.float();
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThan(1);
    }
  });

  it('split produces an independent, deterministic substream', () => {
    const base = new Rng(99);
    const s1a = base.split(1);
    const s1b = new Rng(99).split(1);
    const s2 = base.split(2);
    expect(s1a.next()).toBe(s1b.next()); // same stream id reproducible
    expect(new Rng(99).split(1).next()).not.toBe(new Rng(99).split(2).next());
    void s2;
  });

  it('hash32 is deterministic and order-sensitive', () => {
    expect(hash32(1, 2, 3)).toBe(hash32(1, 2, 3));
    expect(hash32(1, 2, 3)).not.toBe(hash32(3, 2, 1));
    expect(hashFloat(5)).toBeGreaterThanOrEqual(0);
    expect(hashFloat(5)).toBeLessThan(1);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run src/core/math/rng.test.ts`
Expected: FAIL — cannot find module `./rng`.

- [ ] **Step 3: Write the implementation**

`src/core/math/rng.ts`:
```ts
const GOLDEN = 0x9e3779b9;

/** splitmix32 finalizer — maps a 32-bit integer to a well-mixed 32-bit integer. */
export function mix32(z: number): number {
  z = Math.imul(z ^ (z >>> 16), 0x21f0aaad);
  z = Math.imul(z ^ (z >>> 15), 0x735a2d97);
  return (z ^ (z >>> 15)) >>> 0;
}

/** Stateless, order-sensitive hash of integer keys → uint32. Order-independent of iteration. */
export function hash32(...ints: number[]): number {
  let h = 0;
  for (const v of ints) h = mix32((h + GOLDEN) ^ (v | 0));
  return h >>> 0;
}

/** Stateless hash → float in [0, 1). */
export function hashFloat(...ints: number[]): number {
  return hash32(...ints) / 4294967296;
}

/**
 * Counter-based seedable PRNG. Deterministic from its seed; `split(streamId)`
 * derives an independent substream so adding draws in one subsystem does not
 * perturb another's stream (spec §6).
 */
export class Rng {
  readonly seed: number;
  private state: number;

  constructor(seed: number) {
    this.seed = seed | 0;
    this.state = seed | 0;
  }

  /** Next uint32. */
  next(): number {
    this.state = (this.state + GOLDEN) | 0;
    return mix32(this.state);
  }

  /** Next float in [0, 1). */
  float(): number {
    return this.next() / 4294967296;
  }

  /** Float in [min, max). */
  range(min: number, max: number): number {
    return min + (max - min) * this.float();
  }

  /** Integer in [0, maxExclusive). */
  int(maxExclusive: number): number {
    return this.next() % maxExclusive;
  }

  /** Derive an independent substream keyed by streamId. */
  split(streamId: number): Rng {
    return new Rng(hash32(this.seed, streamId));
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run src/core/math/rng.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/core/math/rng.ts src/core/math/rng.test.ts
git commit -m "feat(core): add counter-based seedable RNG"
```

---

## Task 10: `core/memory/buffers.ts` — AB/SAB-agnostic SoA allocator

**Files:**
- Create: `src/core/memory/buffers.ts`
- Test: `src/core/memory/buffers.test.ts`

- [ ] **Step 1: Write the failing test**

`src/core/memory/buffers.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { allocateSoa, supportsSharedMemory } from './buffers';

const SPECS = [
  { name: 'posX', ctor: Float64Array },
  { name: 'cellType', ctor: Uint8Array },
  { name: 'organismId', ctor: Uint32Array },
] as const;

describe('allocateSoa', () => {
  it('creates independent views of the requested length', () => {
    const soa = allocateSoa(SPECS, 8, false);
    expect(soa.capacity).toBe(8);
    expect(soa.fields.posX.length).toBe(8);
    expect(soa.fields.cellType.length).toBe(8);
    soa.fields.posX[3] = 1.5;
    soa.fields.cellType[3] = 7;
    expect(soa.fields.posX[3]).toBe(1.5);
    expect(soa.fields.cellType[3]).toBe(7);
  });

  it('places all fields in a single backing buffer', () => {
    const soa = allocateSoa(SPECS, 8, false);
    expect(soa.fields.posX.buffer).toBe(soa.buffer);
    expect(soa.fields.cellType.buffer).toBe(soa.buffer);
    expect(soa.fields.organismId.buffer).toBe(soa.buffer);
  });

  it('aligns each field view to its element size', () => {
    const soa = allocateSoa(SPECS, 8, false);
    expect(soa.fields.posX.byteOffset % 8).toBe(0);
    expect(soa.fields.organismId.byteOffset % 4).toBe(0);
  });

  it('reports non-shared when shared memory is not requested', () => {
    const soa = allocateSoa(SPECS, 8, false);
    expect(soa.shared).toBe(false);
    expect(soa.buffer).toBeInstanceOf(ArrayBuffer);
  });

  it('uses SharedArrayBuffer when requested and supported', () => {
    const soa = allocateSoa(SPECS, 8, true);
    expect(soa.shared).toBe(supportsSharedMemory());
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run src/core/memory/buffers.test.ts`
Expected: FAIL — cannot find module `./buffers`.

- [ ] **Step 3: Write the implementation**

`src/core/memory/buffers.ts`:
```ts
export type TypedArrayCtor =
  | Float64ArrayConstructor
  | Float32ArrayConstructor
  | Uint32ArrayConstructor
  | Int32ArrayConstructor
  | Uint16ArrayConstructor
  | Uint8ArrayConstructor;

export type TypedArray =
  | Float64Array
  | Float32Array
  | Uint32Array
  | Int32Array
  | Uint16Array
  | Uint8Array;

export interface FieldSpec {
  readonly name: string;
  readonly ctor: TypedArrayCtor;
}

/**
 * True when SharedArrayBuffer is usable: it exists, and we are either in Node
 * (crossOriginIsolated undefined) or a cross-origin-isolated browser context.
 */
export function supportsSharedMemory(): boolean {
  if (typeof SharedArrayBuffer === 'undefined') return false;
  const coi = (globalThis as { crossOriginIsolated?: boolean }).crossOriginIsolated;
  return coi === undefined || coi === true;
}

export interface SoaLayout<K extends string> {
  readonly buffer: ArrayBufferLike;
  readonly fields: Readonly<Record<K, TypedArray>>;
  readonly capacity: number;
  readonly shared: boolean;
}

/**
 * Allocate a struct-of-arrays layout: every field is a typed array of `capacity`
 * elements, all sharing ONE backing buffer (byteOffset views). The buffer is a
 * SharedArrayBuffer when `preferShared` and the environment supports it,
 * otherwise a plain ArrayBuffer (identical typed-array semantics either way).
 */
export function allocateSoa<K extends string>(
  specs: readonly (FieldSpec & { name: K })[],
  capacity: number,
  preferShared = true,
): SoaLayout<K> {
  let offset = 0;
  const plans: { name: K; ctor: TypedArrayCtor; offset: number }[] = [];
  for (const spec of specs) {
    const bpe = spec.ctor.BYTES_PER_ELEMENT;
    if (offset % bpe !== 0) offset += bpe - (offset % bpe);
    plans.push({ name: spec.name, ctor: spec.ctor, offset });
    offset += bpe * capacity;
  }

  const shared = preferShared && supportsSharedMemory();
  const buffer: ArrayBufferLike = shared ? new SharedArrayBuffer(offset) : new ArrayBuffer(offset);

  const fields = {} as Record<K, TypedArray>;
  for (const p of plans) {
    const Ctor = p.ctor;
    fields[p.name] = new Ctor(buffer, p.offset, capacity);
  }

  return { buffer, fields, capacity, shared };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run src/core/memory/buffers.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/core/memory/buffers.ts src/core/memory/buffers.test.ts
git commit -m "feat(core): add AB/SAB-agnostic single-buffer SoA allocator"
```

---

## Task 11: `core/memory/cell-store.ts` — SoA cell store with free-list + generations

**Files:**
- Create: `src/core/memory/cell-store.ts`
- Test: `src/core/memory/cell-store.test.ts`

- [ ] **Step 1: Write the failing test**

`src/core/memory/cell-store.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { CellStore } from './cell-store';

describe('CellStore', () => {
  it('allocates ascending slots and tracks aliveCount', () => {
    const s = new CellStore(4, false);
    expect(s.alloc()).toBe(0);
    expect(s.alloc()).toBe(1);
    expect(s.aliveCount).toBe(2);
    expect(s.isAlive(0)).toBe(true);
    expect(s.isAlive(2)).toBe(false);
  });

  it('returns -1 when at capacity', () => {
    const s = new CellStore(2, false);
    s.alloc();
    s.alloc();
    expect(s.alloc()).toBe(-1);
  });

  it('recycles freed slots and bumps the generation', () => {
    const s = new CellStore(4, false);
    const a = s.alloc(); // 0
    const genBefore = s.fields.generation[a];
    s.free(a);
    expect(s.isAlive(a)).toBe(false);
    expect(s.fields.generation[a]).toBe((genBefore! + 1) >>> 0);
    expect(s.aliveCount).toBe(0);
    expect(s.alloc()).toBe(0); // slot reused
  });

  it('validates a handle against the current generation', () => {
    const s = new CellStore(4, false);
    const i = s.alloc();
    const gen = s.fields.generation[i]!;
    expect(s.validate(i, gen)).toBe(true);
    s.free(i);
    expect(s.validate(i, gen)).toBe(false); // stale: freed (and gen bumped)
  });

  it('stores per-slot field values independently', () => {
    const s = new CellStore(4, false);
    const i = s.alloc();
    s.fields.posX[i] = 12.5;
    s.fields.energy[i] = 80;
    s.fields.cellType[i] = 3;
    expect(s.fields.posX[i]).toBe(12.5);
    expect(s.fields.energy[i]).toBe(80);
    expect(s.fields.cellType[i]).toBe(3);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run src/core/memory/cell-store.test.ts`
Expected: FAIL — cannot find module `./cell-store`.

- [ ] **Step 3: Write the implementation**

`src/core/memory/cell-store.ts`:
```ts
import { allocateSoa, type SoaLayout } from './buffers';

/** Bit 0 of `flags` marks a slot as alive. */
export const FLAG_ALIVE = 1;

const CELL_FIELDS = [
  { name: 'posX', ctor: Float64Array },
  { name: 'posY', ctor: Float64Array },
  { name: 'velX', ctor: Float32Array },
  { name: 'velY', ctor: Float32Array },
  { name: 'forceX', ctor: Float32Array },
  { name: 'forceY', ctor: Float32Array },
  { name: 'radius', ctor: Float32Array },
  { name: 'mass', ctor: Float32Array },
  { name: 'energy', ctor: Float32Array },
  { name: 'cellType', ctor: Uint8Array },
  { name: 'organismId', ctor: Uint32Array },
  { name: 'genomeRef', ctor: Uint32Array },
  { name: 'brainRef', ctor: Uint32Array },
  { name: 'age', ctor: Uint32Array },
  { name: 'flags', ctor: Uint8Array },
  { name: 'generation', ctor: Uint32Array },
] as const;

export type CellField = (typeof CELL_FIELDS)[number]['name'];

/**
 * Struct-of-arrays store of cells. Slots are recycled via a free-list; each slot
 * carries a `generation` (its own parallel Uint32 array, NOT bit-packed — spec
 * §4.2) so stale references can be detected after recycling.
 *
 * Canonical iteration order is ascending slot index over alive slots, which is
 * deterministic given a seed (the free-list evolves identically across runs).
 */
export class CellStore {
  readonly capacity: number;
  readonly soa: SoaLayout<CellField>;
  aliveCount: number;

  private readonly freeStack: Int32Array;
  private freeTop: number;

  constructor(capacity: number, preferShared = true) {
    this.capacity = capacity;
    this.soa = allocateSoa<CellField>(CELL_FIELDS, capacity, preferShared);
    this.aliveCount = 0;

    // Fill so that pops return 0, 1, 2, … ascending.
    this.freeStack = new Int32Array(capacity);
    for (let i = 0; i < capacity; i++) this.freeStack[i] = capacity - 1 - i;
    this.freeTop = capacity;
  }

  get fields(): Readonly<Record<CellField, import('./buffers').TypedArray>> {
    return this.soa.fields;
  }

  /** Allocate a slot, or -1 if at capacity. */
  alloc(): number {
    if (this.freeTop === 0) return -1;
    const i = this.freeStack[--this.freeTop]!;
    this.soa.fields.flags[i]! |= FLAG_ALIVE;
    this.aliveCount++;
    return i;
  }

  /** Free a slot, bumping its generation so old handles become invalid. */
  free(i: number): void {
    const flags = this.soa.fields.flags;
    if ((flags[i]! & FLAG_ALIVE) === 0) return;
    flags[i]! &= ~FLAG_ALIVE;
    const gen = this.soa.fields.generation;
    gen[i] = (gen[i]! + 1) >>> 0;
    this.freeStack[this.freeTop++] = i;
    this.aliveCount--;
  }

  isAlive(i: number): boolean {
    return (this.soa.fields.flags[i]! & FLAG_ALIVE) !== 0;
  }

  /** True if slot `i` is alive and still at generation `gen`. */
  validate(i: number, gen: number): boolean {
    return this.isAlive(i) && this.soa.fields.generation[i] === gen;
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run src/core/memory/cell-store.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/core/memory/cell-store.ts src/core/memory/cell-store.test.ts
git commit -m "feat(core): add SoA cell store with free-list + generations"
```

---

## Task 12: `core/sim/config.ts` — typed serializable Config

**Files:**
- Create: `src/core/sim/config.ts`
- Test: `src/core/sim/config.test.ts`

- [ ] **Step 1: Write the failing test**

`src/core/sim/config.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { defaultConfig, serializeConfig, deserializeConfig } from './config';

describe('Config', () => {
  it('provides defaults', () => {
    const c = defaultConfig();
    expect(c.seed).toBeTypeOf('number');
    expect(c.maxCells).toBeGreaterThan(0);
    expect(c.worldWidth).toBeGreaterThan(0);
    expect(c.dt).toBeGreaterThan(0);
  });

  it('applies overrides', () => {
    const c = defaultConfig({ seed: 99, maxCells: 10 });
    expect(c.seed).toBe(99);
    expect(c.maxCells).toBe(10);
  });

  it('round-trips through JSON', () => {
    const c = defaultConfig({ seed: 7 });
    const back = deserializeConfig(serializeConfig(c));
    expect(back).toEqual(c);
  });

  it('fills missing fields with defaults on deserialize', () => {
    const back = deserializeConfig('{"seed":5}');
    expect(back.seed).toBe(5);
    expect(back.maxCells).toBe(defaultConfig().maxCells);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run src/core/sim/config.test.ts`
Expected: FAIL — cannot find module `./config`.

- [ ] **Step 3: Write the implementation**

`src/core/sim/config.ts`:
```ts
/**
 * Simulation configuration. Reproducibility is from `(Config, seed)` — seed is
 * part of Config (spec §5.4). Only M0 fields are present; later milestones add
 * economy/physics/mutation coefficients here.
 */
export interface Config {
  seed: number;
  maxCells: number;
  worldWidth: number;
  worldHeight: number;
  dt: number;
}

export function defaultConfig(overrides: Partial<Config> = {}): Config {
  return {
    seed: 1,
    maxCells: 100_000,
    worldWidth: 4096,
    worldHeight: 4096,
    dt: 1,
    ...overrides,
  };
}

export function serializeConfig(config: Config): string {
  return JSON.stringify(config);
}

export function deserializeConfig(json: string): Config {
  const parsed = JSON.parse(json) as Partial<Config>;
  return defaultConfig(parsed);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run src/core/sim/config.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/core/sim/config.ts src/core/sim/config.test.ts
git commit -m "feat(core): add typed serializable Config"
```

---

## Task 13: `core/sim/world.ts` — World with spawn + trivial tick

**Files:**
- Create: `src/core/sim/world.ts`
- Test: `src/core/sim/world.test.ts`

- [ ] **Step 1: Write the failing test**

`src/core/sim/world.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { World } from './world';
import { defaultConfig } from './config';

describe('World', () => {
  it('spawns the requested number of live cells', () => {
    const w = new World(defaultConfig({ maxCells: 100 }), false);
    const n = w.spawn(50);
    expect(n).toBe(50);
    expect(w.cells.aliveCount).toBe(50);
  });

  it('caps spawning at capacity', () => {
    const w = new World(defaultConfig({ maxCells: 10 }), false);
    expect(w.spawn(25)).toBe(10);
    expect(w.cells.aliveCount).toBe(10);
  });

  it('spawns cells inside the world bounds', () => {
    const cfg = defaultConfig({ maxCells: 100, worldWidth: 200, worldHeight: 300 });
    const w = new World(cfg, false);
    w.spawn(100);
    for (let i = 0; i < 100; i++) {
      expect(w.cells.fields.posX[i]).toBeGreaterThanOrEqual(0);
      expect(w.cells.fields.posX[i]).toBeLessThan(200);
      expect(w.cells.fields.posY[i]).toBeGreaterThanOrEqual(0);
      expect(w.cells.fields.posY[i]).toBeLessThan(300);
    }
  });

  it('advances tick count and ages live cells', () => {
    const w = new World(defaultConfig({ maxCells: 10 }), false);
    w.spawn(3);
    w.tick();
    w.tick();
    expect(w.tickCount).toBe(2);
    expect(w.cells.fields.age[0]).toBe(2);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run src/core/sim/world.test.ts`
Expected: FAIL — cannot find module `./world`.

- [ ] **Step 3: Write the implementation**

`src/core/sim/world.ts`:
```ts
import { type Config } from './config';
import { Rng } from '../math/rng';
import { CellStore } from '../memory/cell-store';

/**
 * The simulation world. M0 has no physics: `tick()` only ages live cells in
 * canonical (ascending slot-index) order, which is deterministic and allocates
 * nothing. M1 replaces the trivial tick with the real simulation pipeline.
 */
export class World {
  readonly config: Config;
  readonly rng: Rng;
  readonly cells: CellStore;
  tickCount: number;

  constructor(config: Config, preferShared = true) {
    this.config = config;
    this.rng = new Rng(config.seed);
    this.cells = new CellStore(config.maxCells, preferShared);
    this.tickCount = 0;
  }

  /** Spawn up to `n` cells at seeded random positions. Returns the number spawned. */
  spawn(n: number): number {
    const f = this.cells.fields;
    let spawned = 0;
    for (let k = 0; k < n; k++) {
      const i = this.cells.alloc();
      if (i < 0) break;
      f.posX[i] = this.rng.range(0, this.config.worldWidth);
      f.posY[i] = this.rng.range(0, this.config.worldHeight);
      f.velX[i] = 0;
      f.velY[i] = 0;
      f.forceX[i] = 0;
      f.forceY[i] = 0;
      f.radius[i] = 1;
      f.mass[i] = 1;
      f.energy[i] = 100;
      f.cellType[i] = 0;
      f.organismId[i] = 0;
      f.genomeRef[i] = 0;
      f.brainRef[i] = 0;
      f.age[i] = 0;
      spawned++;
    }
    return spawned;
  }

  /** Advance one tick. M0: age live cells. */
  tick(): void {
    const f = this.cells.fields;
    const capacity = this.cells.capacity;
    for (let i = 0; i < capacity; i++) {
      if (!this.cells.isAlive(i)) continue;
      f.age[i] = (f.age[i]! + 1) >>> 0;
    }
    this.tickCount++;
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run src/core/sim/world.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/core/sim/world.ts src/core/sim/world.test.ts
git commit -m "feat(core): add World with spawn + trivial tick"
```

---

## Task 14: Reproducibility test — same `(Config, seed)` → identical state

**Files:**
- Test: `src/core/sim/reproducibility.test.ts`

- [ ] **Step 1: Write the test**

`src/core/sim/reproducibility.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { World } from './world';
import { defaultConfig } from './config';

function runWorld(seed: number): World {
  const w = new World(defaultConfig({ seed, maxCells: 2000 }), false);
  w.spawn(1000);
  for (let i = 0; i < 200; i++) w.tick();
  return w;
}

describe('reproducibility', () => {
  it('produces byte-identical arrays for the same (Config, seed)', () => {
    const a = runWorld(12345);
    const b = runWorld(12345);
    expect(Array.from(a.cells.fields.posX.slice(0, 1000))).toEqual(
      Array.from(b.cells.fields.posX.slice(0, 1000)),
    );
    expect(Array.from(a.cells.fields.posY.slice(0, 1000))).toEqual(
      Array.from(b.cells.fields.posY.slice(0, 1000)),
    );
    expect(Array.from(a.cells.fields.age.slice(0, 1000))).toEqual(
      Array.from(b.cells.fields.age.slice(0, 1000)),
    );
  });

  it('produces different positions for different seeds', () => {
    const a = runWorld(1);
    const b = runWorld(2);
    expect(Array.from(a.cells.fields.posX.slice(0, 1000))).not.toEqual(
      Array.from(b.cells.fields.posX.slice(0, 1000)),
    );
  });
});
```

- [ ] **Step 2: Run the test to verify it passes**

Run: `pnpm vitest run src/core/sim/reproducibility.test.ts`
Expected: PASS (2 tests). (If it fails, the RNG or iteration order is not deterministic — fix before proceeding; this is a core M0 acceptance criterion.)

- [ ] **Step 3: Commit**

```bash
git add src/core/sim/reproducibility.test.ts
git commit -m "test(core): assert (Config, seed) reproducibility"
```

---

## Task 15: Zero-allocation test — the hot loop must not grow the heap

**Files:**
- Test: `src/core/sim/zero-alloc.test.ts`

- [ ] **Step 1: Write the test**

`src/core/sim/zero-alloc.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { World } from './world';
import { defaultConfig } from './config';

// Requires --expose-gc (configured in vitest.config.ts forks execArgv).
const gc = (globalThis as { gc?: () => void }).gc;

describe('zero-allocation hot loop', () => {
  it('does not grow the heap while ticking in steady state', () => {
    if (!gc) throw new Error('run vitest with --expose-gc (see vitest.config.ts)');

    const w = new World(defaultConfig({ seed: 7, maxCells: 50_000 }), false);
    w.spawn(50_000);

    for (let i = 0; i < 50; i++) w.tick(); // warm up JIT
    gc();
    const before = process.memoryUsage().heapUsed;

    for (let i = 0; i < 500; i++) w.tick();
    gc();
    const after = process.memoryUsage().heapUsed;

    const growthKb = (after - before) / 1024;
    expect(growthKb).toBeLessThan(512); // generous margin; tick() allocates nothing
  });
});
```

- [ ] **Step 2: Run the test to verify it passes**

Run: `pnpm test` (uses `NODE_OPTIONS=--expose-gc`). Running the file directly with
`pnpm vitest run <file>` will throw "run with --expose-gc" because it bypasses the
`test` script's env — use `pnpm test` or `NODE_OPTIONS=--expose-gc pnpm vitest run <file>`.
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/core/sim/zero-alloc.test.ts
git commit -m "test(core): assert tick() hot loop is allocation-free"
```

---

## Task 16: Headless entry + full acceptance (`make check`)

**Files:**
- Create: `src/headless/run.ts`

- [ ] **Step 1: Create the headless entry**

`src/headless/run.ts`:
```ts
import { World } from '../core/sim/world';
import { defaultConfig } from '../core/sim/config';

const world = new World(defaultConfig({ seed: 1, maxCells: 100_000 }));
world.spawn(100_000);

const ticks = 1000;
const start = performance.now();
for (let i = 0; i < ticks; i++) world.tick();
const ms = performance.now() - start;

console.log(`shared memory: ${world.cells.soa.shared}`);
console.log(`alive cells:   ${world.cells.aliveCount}`);
console.log(`ticks:         ${world.tickCount}`);
console.log(`elapsed:       ${ms.toFixed(1)} ms (${(ticks / (ms / 1000)).toFixed(0)} ticks/s)`);
```

- [ ] **Step 2: Run the headless entry**

Run: `make headless`
Expected: prints shared-memory status, `alive cells: 100000`, `ticks: 1000`, and a timing line. (In Node, shared memory should be `true`.)

- [ ] **Step 3: Run the full check suite**

Run: `make check`
Expected: `typecheck` passes (no errors), `lint` passes (no errors), and all tests pass.

- [ ] **Step 4: Verify the dev server builds (manual smoke)**

Run: `make build`
Expected: Vite build completes with no errors (proves `app/main.ts` + the core modules compile for the browser). Optionally run `make dev` and confirm the page shows `crossOriginIsolated: true` and `shared memory: true`, then stop the server.

- [ ] **Step 5: Commit**

```bash
git add src/headless/run.ts
git commit -m "feat(headless): add Node simulation entry; M0 foundation complete"
```

---

## M0 Acceptance Checklist (verify all before declaring M0 done)
- [ ] `make check` is green (typecheck + lint + tests).
- [ ] `make headless` runs 100k cells × 1000 ticks and reports stats.
- [ ] Reproducibility test passes: same `(Config, seed)` → identical arrays.
- [ ] Zero-allocation test passes: `tick()` does not grow the heap.
- [ ] The SoA layer works with both `SharedArrayBuffer` (Node/isolated) and the `ArrayBuffer` fallback (`preferShared = false`).
- [ ] `make build` succeeds (browser build of `app/main.ts` + core).
- [ ] ESLint enforces core/ boundaries (no DOM/Worker globals, no outward imports).
- [ ] CI workflow present (fast tier) + nightly stub.

---

## Notes for the executor
- **TDD discipline:** for Tasks 8–13, write the test first, watch it fail, then implement. Do not skip the "verify it fails" step.
- **`noUncheckedIndexedAccess`** is on: typed-array indexing returns `T | undefined`. The `!` non-null assertions in the implementations above are intentional and correct (indices are always in-bounds by construction).
- **Do not add fields to `Config` or `CellStore` speculatively.** M1 adds spatial hash, forces, and the integrator; new Config coefficients arrive with the features that use them (YAGNI).
- **Canonical iteration order** (ascending slot index over alive cells) is load-bearing for reproducibility — do not switch `tick()` to free-list or insertion order.
