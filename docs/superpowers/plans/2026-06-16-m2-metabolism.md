# M2 — Metabolism Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Build engine code with superpowers:test-driven-development. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Revision 2 (2026-06-16):** hardened by a 6-lens adversarial audit (31 findings → 20 verified). Baked-in fixes: Float32-aware test precision (energy is `Float32`, digit-6 asserts fail on correct code); rebalanced default economy (the previous defaults guaranteed first-run extinction — the §10 R1 failure mode); age-before-lifecycle + re-sample ordering (recycled children kept age 0, metrics exclude freed corpses); scalar params instead of `Config` into `cells/` (honours the §5.1 DAG, matches the physics layer); `hashFloat3` (fixed-arity, structurally zero-alloc); out-param `lifecycle` (no per-tick object); tier-3 property tests + a real tier-7 smoke gate; render de-streak across recycled slots; Task 0 for branch + beads + ADR.

**Goal:** Give cells an energy economy on a **patchy, depleting** light field so populations live, die, and breathe — photosynthesisers produce, heterotrophs eat, corpses decay, and a simple clone-division drives population dynamics — with the first telemetry dashboard and M2 control surface (colour-by-type, light heatmap, click-to-inspect, live economy knobs).

**Architecture:** Add an `environment/` light field (coarse grid over the toroidal world, patchy seeded init, per-tick toroidal diffusion + regen-toward-capacity, pre-allocated double buffer). Add a `cells/` layer: a cell-type palette, a pure allocation-free `metabolize()` (photosynthesis gains + patch depletion, digestion of adjacent edible neighbours via the existing spatial hash, basal cost, meat decay) and a `lifecycle()` step (death→meat in place; fully-decayed meat→freed slot; clone division with 50/50 energy split). Extend `World.tick` to `… → repulsion → integrate → METABOLIZE → age → LIVE/DIE/BREED → ENVIRONMENT → re-derive-live → sample-metrics`, documented by a READS/WRITES contract that the golden-tick energy test asserts against. Add alloc-free telemetry (population, per-type counts, mean energy, phenotypic diversity, births/deaths). Update the renderer to colour by cell type and add a light-heatmap overlay; add a telemetry dashboard, click-to-inspect, and live economy/light sliders to the app.

**Tech Stack:** TypeScript (strict), Vitest, WebGL2, Canvas2D (charts), Vite.

**Spec:** §4.1 (world/patchy-depleting light), §4.3 (tick order + READS/WRITES), §4.5 (energy economy), §6 (test tiers 1, 2, 3, 4, 6, 7), §8 (M2 row), §10 R1 (monoculture = primary failure mode), §11 (M2 control-surface deliverables).

**Decisions confirmed with Josh (2026-06-16):**
- **Trophic scope:** full food web — `PHOTO` + `DIGESTIVE` + `MEAT`. Digestive cells feed passively (no sensing/movement until M3) on adjacent PHOTO/MEAT cells.
- **Division:** clone-only, per-cell, **50/50 energy split** (minus a small `divideCost`), same type, no mutation (genome/mutation is M6). `organismId` stays 0 (no organisms until M5). This is an interim simplification of the spec's organism-level reproduction + maternal provisioning (§4.5), deferred to M5/M6 — recorded as an ADR in Task 0.

**Invariants to preserve (do NOT break):**
- `World.tick` allocation-free (zero-alloc `--expose-gc` test). All scratch buffers + the `lifecycleResult` out-object pre-allocated in constructors. Division uses the existing free-list (`CellStore.alloc/free`) — no heap allocation. Use fixed-arity `hashFloat3` (NOT variadic `hashFloat`) in the tick path so no rest-args array is allocated.
- `(Config, seed)` reproducible single-threaded (byte-identical arrays, **including `generation[]`** after slot recycling). Canonical iteration order = ascending live slot index. Stochastic placement (division jitter, patchy light init) uses the **stateless** `hashFloat3(...)` / a seeded `rng.split()` substream, never wall-clock or insertion order.
- `core/` stays pure (no DOM/Worker — ESLint-enforced). Positions Float64. `cells/` and `environment/` take **scalar** params, not `Config` (keeps the §5.1 intra-core DAG: only `sim/` knows `Config`).
- **Float32 test discipline:** `energy` and the light field are `Float32Array` (cell-store.ts:16). The Float32 ulp near 100 is ~7.6e-6, far above `toBeCloseTo`'s digit-6 tolerance (5e-7) and at the edge of digit-5 (5e-6). **Assert energies near 100 at digit 4** (tolerance 5e-5 ≈ 6× ulp). A sub-1e-5 mismatch is storage rounding, not a logic bug.

---

## File Structure

**Create:**
- `src/core/cells/types.ts` — `CellType` palette enum (PHOTO/DIGESTIVE/MEAT, extensible) + helpers.
- `src/core/cells/types.test.ts`
- `src/core/environment/light-field.ts` — `LightField` (patchy init, sample/deplete, diffuse+regen step).
- `src/core/environment/light-field.test.ts`
- `src/core/cells/metabolism.ts` — pure `metabolize()` (photosynthesis, digestion, basal cost, meat decay).
- `src/core/cells/metabolism.test.ts`
- `src/core/cells/lifecycle.ts` — `lifecycle()` (death→meat, meat→free, clone division) writing an out-param result.
- `src/core/cells/lifecycle.test.ts`
- `src/core/sim/metrics.ts` — `Metrics` interface + alloc-free `sampleMetrics()` (counts, mean energy, Simpson diversity).
- `src/core/sim/metrics.test.ts`
- `src/core/sim/golden-tick.test.ts` — tier-2 deterministic energy-bookkeeping over a full tick.
- `src/core/sim/recycle.test.ts` — free-list/generation recycle reproducibility (deferred M1 item, now that death frees slots).
- `src/core/sim/invariants.test.ts` — tier-3 property/invariant tests (energy≥0, finite, in-bounds, count bounds).
- `src/core/sim/READS-WRITES.md` — the §4.3 tick READS/WRITES contract (lives alongside the orchestrator).
- `src/render/light-overlay.ts` — WebGL2 light-field heatmap (textured world quad).
- `src/app/telemetry.ts` — Canvas2D ring-buffer line charts.
- `src/app/inspect.ts` — click-to-inspect (pick nearest live cell, render panel).
- `src/app/controls.ts` — live economy/light sliders bound to `Config`.

**Modify:**
- `src/core/math/rng.ts` — add fixed-arity, allocation-free `hashFloat3(a,b,c)` (byte-identical to `hashFloat(a,b,c)`).
- `src/core/sim/config.ts` — add light-field + economy + division params (rebalanced defaults).
- `src/core/sim/world.ts` — own a `LightField`; `spawn(n, type)` + `seedLife(n)`; new tick pipeline; constructor-allocated `lifecycleResult`; expose `metrics`, `lastBirths`, `lastDeaths`.
- `src/render/webgl-renderer.ts` — colour **by cell type** (replace speed-colour); add `get gl()` (Task 13); add `prevGen` de-streak param (Task 18).
- `src/app/main.ts`, `index.html` — seed PHOTO+DIGESTIVE mix; wire light overlay (`L` toggle), telemetry dashboard, inspect, sliders, generation de-streak.
- `src/headless/run.ts` — seed life + print metrics.
- `src/smoke.test.ts` — real tier-7 visual-smoke assertion.
- `docs/decisions/INDEX.md` — two M2 ADR entries (Task 0).

**Deferred-with-rationale (not silently dropped):**
- `World.rebuildLive` scans full capacity each tick. Correct, and cheap in the **dense** regime (forces dominate). **Honest caveat:** in the **sparse post-crash regime** M2 introduces (mass die-off), the O(`maxCells`) scan can *invert* and dominate, because force work collapses when few cells remain. The rebalanced economy (Task 1) keeps populations substantial, so the scan stays fine; Task 19 logs ticks/s in the realised regime to confirm. If the empty-scan ever dominates, the fix is to maintain `liveIndices` incrementally in `alloc`/`free` — noted as an M2/M3 follow-up, not done now.
- **Genotypic diversity** (spec §11): there are no genomes until M6, so M2 reports **phenotypic** diversity only (Simpson index over living cell types). `Metrics.genotypicDiversity` is omitted, not faked — added in M6.

---

## Tick READS/WRITES contract (write this into `src/core/sim/READS-WRITES.md` in Task 10)

| # | Step | Reads | Writes |
|---|---|---|---|
| 1 | rebuildLive | flags | liveIndices, liveCount |
| 2 | hash.build | posX, posY | hash buckets |
| 3 | computeRepulsion | posX, posY, radius | forceX, forceY |
| 4 | integrate | pos, vel, force, mass | posX, posY, velX, velY; resets force=0 |
| 5 | **METABOLIZE** | cellType, energy, radius, pos; light field; hash buckets | energy (self **and eaten prey**), light field (depletion) |
| 6 | **age** | liveIndices (tick-start set) | age |
| 7 | **LIVE/DIE/BREED** | cellType, energy, mass, pos | cellType (→MEAT), energy, **generation[] (bumped on every freed MEAT slot)**, frees meat slots, allocs child slots (split energy); lastBirths/lastDeaths |
| 8 | **ENVIRONMENT** | light field, cap | light field (diffuse + regen; double-buffer swap) |
| 9 | rebuildLive (again) | flags | liveIndices, liveCount |
| 10 | sampleMetrics | cellType, energy (current live set) | metrics |

**Ordering notes (the contract the golden-tick + integration tests assert against):**
- METABOLIZE runs in canonical ascending live-slot order. Within it, a DIGESTIVE at a **lower** slot mutates `energy[j]` of a PHOTO/MEAT prey at a **higher** slot *before* that prey runs its own photosynthesis/decay — so a PHOTO eaten by a lower-slot digestive photosynthesises from its already-reduced energy that same tick. Two digestives targeting the same prey: the lower-slot eater eats first. All deterministic; the digestion query uses the hash built from **pre-integrate** positions (spec §4.3 order is hash → forces → integrate → metabolize, with no rebuild between) — a cell crossing a bucket boundary during integrate may miss a genuinely-adjacent prey for one tick; the post-integrate exact-distance check prevents false *positives* and the miss self-corrects next tick. Do **not** add a second `hash.build` (contradicts the spec, adds an O(n) sort for a one-tick false-negative-only effect).
- **age runs BEFORE lifecycle** (step 6 before 7), over the tick-start live set. This is required: the free-list is LIFO, so a slot freed in lifecycle pass 2 is the first slot `alloc` returns for a division child in pass 3 — if age ran after lifecycle it would bump that newborn from 0 to 1. Running age first ages every cell alive during METABOLIZE (including ones about to become MEAT — harmless) and leaves division children at the age 0 that lifecycle sets.
- **sampleMetrics runs after a second rebuildLive** (step 9 before 10), so metrics exclude freed corpses (`free()` never clears `cellType`, so a freed slot still reads MEAT) and include fresh-slot newborns; `metrics.population` then equals `cells.aliveCount`.

---

## Tasks

### Task 0: Branch, beads backlog, ADR

**Files:**
- Modify: `docs/decisions/INDEX.md`
- Tracking: `.beads/` (via `bd`)

> We are on `main` with M1 already committed there. Per the user rule "if on the default branch, branch first" — and so Task 19's `--ff-only` merge is valid — create the branch before any commit. Mirror M1's beads structure (epic `life-sim-3ei` with children `.1`–`.6`).

- [ ] **Step 1: Create the milestone branch**

```bash
git checkout -b m2-metabolism
```

- [ ] **Step 2: Create the M2 epic + child issues in beads.** Capture the epic ID from the create output (child IDs are `EPIC.N` — do not grep for them).

```bash
bd create -t epic --title "M2 — Metabolism" --priority 1
# → note the epic id, e.g. life-sim-XXX. Then one child per task:
bd create -t task --title "M2.1 cell-type palette + config + hashFloat3" --priority 1
bd create -t task --title "M2.2 patchy light field (init)" --priority 1
bd create -t task --title "M2.3 light field dynamics tests" --priority 2
bd create -t task --title "M2.4 metabolism — photosynthesis" --priority 1
bd create -t task --title "M2.5 metabolism — digestion" --priority 1
bd create -t task --title "M2.6 metabolism — basal + meat decay" --priority 2
bd create -t task --title "M2.7 lifecycle — death/decay" --priority 1
bd create -t task --title "M2.8 lifecycle — division" --priority 1
bd create -t task --title "M2.9 telemetry metrics" --priority 1
bd create -t task --title "M2.10 wire World.tick" --priority 1
bd create -t task --title "M2.11 golden-tick energy test" --priority 1
bd create -t task --title "M2.12 recycle reproducibility test" --priority 1
bd create -t task --title "M2.12b tier-3 invariants test" --priority 1
bd create -t task --title "M2.13 renderer colour-by-type + gl getter" --priority 2
bd create -t task --title "M2.14 light heatmap overlay" --priority 2
bd create -t task --title "M2.15 telemetry dashboard" --priority 2
bd create -t task --title "M2.16 click-to-inspect" --priority 2
bd create -t task --title "M2.17 control knobs" --priority 2
bd create -t task --title "M2.18 wire app + de-streak" --priority 2
bd create -t task --title "M2.19 acceptance + live prototype" --priority 1
# Dependencies (issue depends on depends-on): 10 needs 1-9; 11,12,12b need 10; 18 needs 13-17; 19 needs all.
# e.g. bd dep add <epic>.10 <epic>.1   (repeat per edge)
bd sync --flush-only
```

- [ ] **Step 3: Log the two M2 decisions** — append under "## Simulation Design" in `docs/decisions/INDEX.md`:

```markdown
- 2026-06-16: M2 trophic scope = full food web (PHOTO/DIGESTIVE/MEAT); digestive cells feed passively (no movement pre-M3) → [../superpowers/plans/2026-06-16-m2-metabolism.md]
- 2026-06-16: M2 reproduction = per-cell clone division, 50/50 energy split, organismId stays 0 (interim; organism-level maternal provisioning per spec §4.5 deferred to M5/M6) → [../superpowers/plans/2026-06-16-m2-metabolism.md]
```

- [ ] **Step 4: Commit**

```bash
git add docs/decisions/INDEX.md .beads
git commit -m "chore(M2.0): branch + beads backlog + ADR entries"
```

---

### Task 1: Cell-type palette + Config params + hashFloat3

**Files:**
- Create: `src/core/cells/types.ts`, `src/core/cells/types.test.ts`
- Modify: `src/core/math/rng.ts`, `src/core/math/rng.test.ts` (existing — extend)
- Modify: `src/core/sim/config.ts`, `src/core/sim/config.test.ts` (existing — extend)

- [ ] **Step 1: Write the failing palette test** — `src/core/cells/types.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { CellType, isLiving, isEdibleBy } from './types';

describe('cell type palette', () => {
  it('assigns distinct stable indices', () => {
    expect(CellType.PHOTO).toBe(0);
    expect(CellType.DIGESTIVE).toBe(1);
    expect(CellType.MEAT).toBe(2);
  });

  it('classifies living vs dead', () => {
    expect(isLiving(CellType.PHOTO)).toBe(true);
    expect(isLiving(CellType.DIGESTIVE)).toBe(true);
    expect(isLiving(CellType.MEAT)).toBe(false);
  });

  it('digestive cells eat photo and meat, not other digestive or self', () => {
    expect(isEdibleBy(CellType.DIGESTIVE, CellType.PHOTO)).toBe(true);
    expect(isEdibleBy(CellType.DIGESTIVE, CellType.MEAT)).toBe(true);
    expect(isEdibleBy(CellType.DIGESTIVE, CellType.DIGESTIVE)).toBe(false);
    expect(isEdibleBy(CellType.PHOTO, CellType.MEAT)).toBe(false); // photo cells don't eat
  });
});
```

- [ ] **Step 2: Run it; expect FAIL** — `pnpm test src/core/cells/types.test.ts` → "Cannot find module './types'".

- [ ] **Step 3: Implement** — `src/core/cells/types.ts`

```ts
/**
 * Cell-type palette for M2. A subset of the spec's full palette (§4.2): the
 * photosynthetic producer, the digestive heterotroph, and the MEAT corpse state
 * a dead cell becomes. Values are stable Uint8 indices stored in `cellType`.
 * Extend (do not renumber) as later milestones add sensor/neuron/mover/etc.
 */
export const CellType = {
  PHOTO: 0,
  DIGESTIVE: 1,
  MEAT: 2,
} as const;

export type CellTypeValue = (typeof CellType)[keyof typeof CellType];

/** True for types that metabolize and can divide (PHOTO, DIGESTIVE). MEAT is dead. */
export function isLiving(type: number): boolean {
  return type === CellType.PHOTO || type === CellType.DIGESTIVE;
}

/** Can a cell of `eater` type consume a cell of `prey` type? M2: digestive eats photo + meat. */
export function isEdibleBy(eater: number, prey: number): boolean {
  return eater === CellType.DIGESTIVE && (prey === CellType.PHOTO || prey === CellType.MEAT);
}
```

- [ ] **Step 4: Write the failing `hashFloat3` test** — append to `src/core/math/rng.test.ts`

```ts
import { hashFloat, hashFloat3 } from './rng';

describe('hashFloat3 (fixed-arity, allocation-free)', () => {
  it('is byte-identical to the variadic hashFloat for 3 args', () => {
    for (const [a, b, c] of [[0, 0, 0], [1, 2, 3], [7, 150, 99999], [-5, 4096, 123]]) {
      expect(hashFloat3(a, b, c)).toBe(hashFloat(a, b, c));
    }
  });
});
```

- [ ] **Step 5: Implement `hashFloat3`** — append to `src/core/math/rng.ts` (reuse `GOLDEN` and `mix32` already in the file):

```ts
/**
 * Fixed-arity, allocation-free equivalent of `hashFloat(a, b, c)`. The variadic
 * forms allocate a rest-args array + iterator; this one does not, so it is safe
 * in the allocation-free tick path (division jitter). Byte-identical by a test.
 */
export function hashFloat3(a: number, b: number, c: number): number {
  let h = mix32((0 + GOLDEN) ^ (a | 0));
  h = mix32((h + GOLDEN) ^ (b | 0));
  h = mix32((h + GOLDEN) ^ (c | 0));
  return (h >>> 0) / 4294967296;
}
```

- [ ] **Step 6: Extend the Config test** — append to `src/core/sim/config.test.ts`

```ts
import { defaultConfig } from './config';
// (add inside the existing describe block, or a new one)
it('provides M2 light/economy/division defaults', () => {
  const c = defaultConfig();
  expect(c.lightGridCols).toBeGreaterThanOrEqual(3);
  expect(c.lightGridRows).toBeGreaterThanOrEqual(3);
  expect(c.lightMax).toBeGreaterThan(0);
  expect(c.photoGain).toBeGreaterThan(0);
  expect(c.basalCost).toBeGreaterThan(0);
  expect(c.digestEfficiency).toBeGreaterThan(0);
  expect(c.digestEfficiency).toBeLessThan(1);
  expect(c.divideThreshold).toBeGreaterThan(c.divideCost);
  expect(c.initialPhotoFraction).toBeGreaterThan(0);
  expect(c.initialPhotoFraction).toBeLessThanOrEqual(1);
});
```

- [ ] **Step 7: Implement Config params** — edit `src/core/sim/config.ts`. Add to the `Config` interface:

```ts
  // Light field (coarse grid over the world)
  lightGridCols: number;
  lightGridRows: number;
  /** Per-patch light capacity ceiling. */
  lightMax: number;
  /** Number of seeded Gaussian patches for the patchy (non-uniform) init. */
  lightPatchCount: number;
  /** Patch radius in grid cells for the patchy init. */
  lightPatchRadius: number;
  /** Regen rate per tick toward each patch's capacity, in (0, 1]. */
  lightRegen: number;
  /** Toroidal diffusion coefficient per tick, in [0, 0.25] (stability bound: 4·diffuse < 1). */
  lightDiffuse: number;

  // Energy economy (§4.5). Every term is a live knob.
  // NOTE: photosynthesis/digestion/basal all scale with area = radius², so cellRadius
  // (default 6 → area 36) is a hidden economy lever — re-derive balance if it changes.
  /** Photosynthesis gain per (localLight · area) per tick. */
  photoGain: number;
  /** Light consumed per unit of photosynthesis energy gained. */
  photoDepletion: number;
  /** Max energy a digestive cell extracts from one prey per tick. */
  digestRate: number;
  /** Fraction of extracted energy the digester keeps (<1). */
  digestEfficiency: number;
  /** Basal metabolic cost per tick, per unit area (living cells only). */
  basalCost: number;
  /** Energy a MEAT cell loses per tick. */
  meatDecay: number;
  /** Energy a fresh corpse holds, per unit mass (biomass → food). */
  meatEnergyOnDeath: number;

  // Division (clone-only; M6 adds genome/mutation).
  /** Energy at/above which a living cell divides. */
  divideThreshold: number;
  /** Energy spent performing a division. */
  divideCost: number;
  /** Child placement offset from the parent, in world units. */
  divideJitter: number;
  /** Fraction of initial cells spawned as PHOTO; the rest are DIGESTIVE. */
  initialPhotoFraction: number;
```

And to the `defaultConfig()` return object. **These defaults are audit-rebalanced to avoid first-run extinction** (the old `photoDepletion 0.2`/`lightRegen 0.05` gave a 7.2× sink/source ratio → mass die-off; verified by the Task 19 calibration assertion). Tune further live:

```ts
    lightGridCols: 64,
    lightGridRows: 64,
    lightMax: 1,
    lightPatchCount: 32,
    lightPatchRadius: 6,
    lightRegen: 0.3,        // was 0.05 — patches recover fast enough to sustain producers
    lightDiffuse: 0.1,

    photoGain: 0.05,
    photoDepletion: 0.01,   // was 0.2 — a photo cell no longer strip-mines its patch in one tick
    digestRate: 5,
    digestEfficiency: 0.6,
    basalCost: 0.02,
    meatDecay: 0.5,
    meatEnergyOnDeath: 30,

    divideThreshold: 200,
    divideCost: 10,
    divideJitter: 6,
    initialPhotoFraction: 0.85,
```

- [ ] **Step 8: Run** — `pnpm test src/core/cells/types.test.ts src/core/math/rng.test.ts src/core/sim/config.test.ts` → PASS.

- [ ] **Step 9: Commit**

```bash
git add src/core/cells/types.ts src/core/cells/types.test.ts src/core/math/rng.ts src/core/math/rng.test.ts src/core/sim/config.ts src/core/sim/config.test.ts
git commit -m "feat(M2.1): cell-type palette + economy/light/division config + hashFloat3"
```

---

### Task 2: LightField construction + patchy seeded init

**Files:**
- Create: `src/core/environment/light-field.ts`, `src/core/environment/light-field.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { LightField } from './light-field';
import { Rng } from '../math/rng';

describe('LightField init', () => {
  it('produces a NON-uniform (patchy) field — the anti-monoculture gradient', () => {
    const lf = new LightField(64, 64, 4096, 4096);
    lf.init(new Rng(1), 32, 6, 1);
    let min = Infinity;
    let max = -Infinity;
    for (const v of lf.light) {
      if (v < min) min = v;
      if (v > max) max = v;
    }
    expect(min).toBeGreaterThanOrEqual(0);
    expect(max).toBeLessThanOrEqual(1 + 1e-6);
    expect(max - min).toBeGreaterThan(0.1); // genuinely patchy, not flat
  });

  it('is reproducible from the same seed and differs across seeds', () => {
    const a = new LightField(32, 32, 4096, 4096);
    a.init(new Rng(7), 16, 4, 1);
    const b = new LightField(32, 32, 4096, 4096);
    b.init(new Rng(7), 16, 4, 1);
    const c = new LightField(32, 32, 4096, 4096);
    c.init(new Rng(8), 16, 4, 1);
    expect(Array.from(a.light)).toEqual(Array.from(b.light));
    expect(Array.from(a.light)).not.toEqual(Array.from(c.light));
  });

  it('seeds capacity equal to the initial light (patches regen back to their shape)', () => {
    const lf = new LightField(16, 16, 1024, 1024);
    lf.init(new Rng(3), 8, 3, 1);
    expect(Array.from(lf.cap)).toEqual(Array.from(lf.light));
  });
});
```

- [ ] **Step 2: Run; expect FAIL** (module missing).

- [ ] **Step 3: Implement** — `src/core/environment/light-field.ts`

```ts
import { type Rng } from '../math/rng';

/**
 * Coarse resource grid over the toroidal world (§4.1). PATCHY and DEPLETING, not
 * uniform: photosynthesis consumes the local patch so a stationary photo-cell
 * exhausts its spot (the §10 R1 selection gradient). Each tick the field diffuses
 * toroidally and regenerates toward a per-patch capacity. Allocation-free after
 * construction (double-buffered with a pre-allocated scratch).
 */
export class LightField {
  readonly cols: number;
  readonly rows: number;
  readonly worldWidth: number;
  readonly worldHeight: number;
  readonly invPatchW: number;
  readonly invPatchH: number;
  /** Per-patch capacity (the patchy target the field regenerates toward). */
  readonly cap: Float32Array;

  private a: Float32Array;
  private b: Float32Array; // scratch for diffusion double-buffer

  constructor(cols: number, rows: number, worldWidth: number, worldHeight: number) {
    this.cols = cols;
    this.rows = rows;
    this.worldWidth = worldWidth;
    this.worldHeight = worldHeight;
    this.invPatchW = cols / worldWidth;
    this.invPatchH = rows / worldHeight;
    const n = cols * rows;
    this.cap = new Float32Array(n);
    this.a = new Float32Array(n);
    this.b = new Float32Array(n);
  }

  /** Current light buffer. Do NOT retain across step() — the double buffer swaps. */
  get light(): Float32Array {
    return this.a;
  }

  /**
   * Patchy seeded init: sum of `patchCount` random Gaussian bumps (toroidal),
   * normalized and clamped to [0, lightMax]. Sets both light and capacity.
   */
  init(rng: Rng, patchCount: number, patchRadius: number, lightMax: number): void {
    const { cols, rows } = this;
    const light = this.a;
    light.fill(0);
    const sigma2 = 2 * patchRadius * patchRadius;
    for (let p = 0; p < patchCount; p++) {
      const pcx = rng.range(0, cols);
      const pcy = rng.range(0, rows);
      const amp = rng.range(0.5, 1);
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          // shortest toroidal distance on the grid
          let dx = Math.abs(c - pcx);
          if (dx > cols / 2) dx = cols - dx;
          let dy = Math.abs(r - pcy);
          if (dy > rows / 2) dy = rows - dy;
          light[r * cols + c]! += amp * Math.exp(-(dx * dx + dy * dy) / sigma2);
        }
      }
    }
    // normalize to [0, lightMax]
    let max = 0;
    for (const v of light) if (v > max) max = v;
    const scale = max > 0 ? lightMax / max : 0;
    for (let i = 0; i < light.length; i++) {
      const v = light[i]! * scale;
      light[i] = v;
      this.cap[i] = v;
    }
  }

  /** Grid index for a world position (toroidal-safe via clamp; positions are pre-wrapped). */
  patchIndex(x: number, y: number): number {
    let c = (x * this.invPatchW) | 0;
    if (c >= this.cols) c = this.cols - 1;
    else if (c < 0) c = 0;
    let r = (y * this.invPatchH) | 0;
    if (r >= this.rows) r = this.rows - 1;
    else if (r < 0) r = 0;
    return r * this.cols + c;
  }

  sampleAt(x: number, y: number): number {
    return this.a[this.patchIndex(x, y)]!;
  }

  /** Remove up to `amount` light from the patch under (x, y), clamped at 0. */
  depleteAt(x: number, y: number, amount: number): void {
    const i = this.patchIndex(x, y);
    const v = this.a[i]! - amount;
    this.a[i] = v > 0 ? v : 0;
  }

  /**
   * One environment tick: toroidal 5-point diffusion (into scratch) then regen
   * toward capacity. `diffuse` ∈ [0, 0.25] (4·diffuse < 1 for stability), `regen` ∈ (0, 1].
   */
  step(diffuse: number, regen: number): void {
    const { cols, rows, cap } = this;
    const src = this.a;
    const dst = this.b;
    for (let r = 0; r < rows; r++) {
      const up = ((r - 1 + rows) % rows) * cols;
      const dn = ((r + 1) % rows) * cols;
      const cur = r * cols;
      for (let c = 0; c < cols; c++) {
        const left = (c - 1 + cols) % cols;
        const right = (c + 1) % cols;
        const v = src[cur + c]!;
        const lap = src[cur + left]! + src[cur + right]! + src[up + c]! + src[dn + c]! - 4 * v;
        let nv = v + diffuse * lap;
        nv += regen * (cap[cur + c]! - nv);
        dst[cur + c] = nv > 0 ? nv : 0;
      }
    }
    this.a = dst;
    this.b = src;
  }
}
```

- [ ] **Step 4: Run; expect PASS** — `pnpm test src/core/environment/light-field.test.ts`.

- [ ] **Step 5: Commit**

```bash
git add src/core/environment/light-field.ts src/core/environment/light-field.test.ts
git commit -m "feat(M2.2): patchy seeded light field (construction + init)"
```

---

### Task 3: LightField deplete/sample + diffuse/regen dynamics

**Files:**
- Test: `src/core/environment/light-field.test.ts` (extend)

> The implementation already exists (Task 2). This task proves the dynamics; if any fails, fix `light-field.ts`.

- [ ] **Step 1: Add tests**

```ts
describe('LightField dynamics', () => {
  it('deplete reduces a patch and clamps at zero', () => {
    const lf = new LightField(8, 8, 800, 800);
    lf.init(new Rng(1), 4, 2, 1);
    const i = lf.patchIndex(400, 400);
    const before = lf.light[i]!;
    lf.depleteAt(400, 400, before + 5); // over-deplete
    expect(lf.light[i]).toBe(0);
    expect(before).toBeGreaterThanOrEqual(0);
  });

  it('regen pushes a depleted patch back toward capacity', () => {
    const lf = new LightField(8, 8, 800, 800);
    lf.init(new Rng(1), 4, 2, 1);
    const i = lf.patchIndex(400, 400);
    lf.depleteAt(400, 400, lf.light[i]!); // empty it
    const cap = lf.cap[i]!;
    lf.step(0, 0.5); // no diffusion, strong regen
    expect(lf.light[i]).toBeGreaterThan(0);
    expect(lf.light[i]).toBeLessThanOrEqual(cap + 1e-6);
  });

  it('pure diffusion (regen=0) conserves total light', () => {
    const lf = new LightField(8, 8, 800, 800);
    lf.init(new Rng(2), 4, 2, 1);
    const sum = (a: Float32Array): number => a.reduce((s, v) => s + v, 0);
    const before = sum(lf.light);
    lf.step(0.2, 0);
    expect(sum(lf.light)).toBeCloseTo(before, 3);
  });

  it('diffusion spreads toroidally across the wrap edge', () => {
    const lf = new LightField(8, 8, 800, 800);
    // hand-set a single spike at column 0, then check column 7 (wrapped neighbour)
    lf.cap.fill(0);
    lf.light.fill(0);
    lf.light[0] = 1; // row 0, col 0
    lf.step(0.2, 0);
    expect(lf.light[7]!).toBeGreaterThan(0); // wrapped left neighbour received light
  });
});
```

- [ ] **Step 2: Run; expect PASS** (or fix `light-field.ts` until green). Run: `pnpm test src/core/environment/light-field.test.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/core/environment/light-field.test.ts
git commit -m "test(M2.3): light field deplete/regen/diffusion dynamics"
```

---

### Task 4: Metabolism — photosynthesis (gain + patch depletion)

**Files:**
- Create: `src/core/cells/metabolism.ts`, `src/core/cells/metabolism.test.ts`

> `metabolize()` is the full METABOLIZE step but is built test-first across Tasks 4–6: photosynthesis here, digestion in Task 5, basal cost + meat decay in Task 6. Write the whole function now with all branches; each task adds the test that proves a branch. It takes **scalar** economy params (not `Config`) — matching `computeRepulsion`/`integrate` and keeping `cells/` off the `sim/` import (§5.1 DAG).

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { metabolize } from './metabolism';
import { CellType } from './types';
import { CellStore } from '../memory/cell-store';
import { SpatialHash } from '../spatial/spatial-hash';
import { LightField } from '../environment/light-field';
import { defaultConfig } from '../sim/config';

function buildHash(store: CellStore, live: Uint32Array, n: number, w: number, h: number, cell: number) {
  const hash = new SpatialHash(w, h, cell, store.capacity);
  hash.build(live, n, store.fields.posX, store.fields.posY);
  return hash;
}

// Helper: call metabolize with a Config's scalar economy fields.
function meta(live: Uint32Array, n: number, f: ReturnType<CellStore['fields']> extends never ? never : CellStore['fields'], hash: SpatialHash, lf: LightField, cfg: ReturnType<typeof defaultConfig>) {
  metabolize(live, n, f, hash, lf,
    cfg.photoGain, cfg.photoDepletion, cfg.digestRate, cfg.digestEfficiency, cfg.basalCost, cfg.meatDecay);
}

describe('metabolism — photosynthesis', () => {
  it('a PHOTO cell gains photoGain·light·area and depletes its patch', () => {
    const cfg = defaultConfig({ worldWidth: 1024, worldHeight: 1024, lightGridCols: 16, lightGridRows: 16 });
    const store = new CellStore(16, false);
    const f = store.fields;
    const i = store.alloc();
    f.posX[i] = 512; f.posY[i] = 512; f.radius[i] = 2; f.mass[i] = 1;
    f.energy[i] = 100; f.cellType[i] = CellType.PHOTO;
    const live = new Uint32Array([i]);

    const lf = new LightField(16, 16, 1024, 1024);
    lf.cap.fill(1); lf.light.fill(1); // uniform 1.0 so the math is exact
    const patch = lf.patchIndex(512, 512);

    const hash = buildHash(store, live, 1, 1024, 1024, 2 * cfg.cellRadius);
    metabolize(live, 1, f, hash, lf,
      cfg.photoGain, cfg.photoDepletion, cfg.digestRate, cfg.digestEfficiency, cfg.basalCost, cfg.meatDecay);

    const area = 2 * 2;
    const gain = cfg.photoGain * 1 * area;
    const basal = cfg.basalCost * area;
    expect(f.energy[i]).toBeCloseTo(100 + gain - basal, 4); // energy is Float32 → digit 4
    expect(lf.light[patch]).toBeCloseTo(1 - gain * cfg.photoDepletion, 5);
  });
});
```

> The `meta()` helper above is only illustrative of the scalar call shape — the test calls `metabolize(...)` directly. You may drop the helper; keep the direct call. (If you keep a helper, type `f` as `CellArrays` imported from `../memory/cell-store`.)

- [ ] **Step 2: Run; expect FAIL** (module missing).

- [ ] **Step 3: Implement the full `metabolize()`** — `src/core/cells/metabolism.ts`

```ts
import { type SpatialHash } from '../spatial/spatial-hash';
import { type LightField } from '../environment/light-field';
import { type CellArrays } from '../memory/cell-store';
import { CellType, isEdibleBy } from './types';
import { wrapDelta } from '../math/vec2';

/**
 * METABOLIZE step (§4.3). Allocation-free; the OUTER eater loop runs in canonical
 * ascending live-slot order. Takes scalar economy params (not Config) to keep the
 * cells/ layer off sim/ (§5.1 DAG), matching computeRepulsion/integrate.
 * - PHOTO: gain = photoGain · localLight · area; depletes the local patch.
 * - DIGESTIVE: extracts up to digestRate from the FIRST edible (PHOTO/MEAT)
 *   neighbour found within (ri+rj), scanned in fixed toroidal 3×3 bucket order
 *   (dy=-1..1, dx=-1..1) then ascending within-bucket order — deterministic, but
 *   NOT necessarily the lowest-slot prey. Keeps digestEfficiency of what it takes.
 * - All living cells pay basalCost · area. MEAT loses meatDecay per tick.
 * Death and division happen later (lifecycle); this step only moves energy/light.
 */
export function metabolize(
  live: Uint32Array,
  n: number,
  f: CellArrays,
  hash: SpatialHash,
  light: LightField,
  photoGain: number,
  photoDepletion: number,
  digestRate: number,
  digestEfficiency: number,
  basalCost: number,
  meatDecay: number,
): void {
  const { cols, rows, width, height, sorted, bucketStart } = hash;

  for (let k = 0; k < n; k++) {
    const i = live[k]!;
    const type = f.cellType[i]!;

    if (type === CellType.MEAT) {
      f.energy[i] = f.energy[i]! - meatDecay;
      continue;
    }

    const ri = f.radius[i]!;
    const area = ri * ri;

    if (type === CellType.PHOTO) {
      const xi = f.posX[i]!;
      const yi = f.posY[i]!;
      const gain = photoGain * light.sampleAt(xi, yi) * area;
      if (gain > 0) {
        f.energy[i] = f.energy[i]! + gain;
        light.depleteAt(xi, yi, gain * photoDepletion);
      }
    } else if (type === CellType.DIGESTIVE) {
      const xi = f.posX[i]!;
      const yi = f.posY[i]!;
      const cx = hash.colOf(xi);
      const cy = hash.rowOf(yi);
      let eaten = false;
      for (let dy = -1; dy <= 1 && !eaten; dy++) {
        const by = (cy + dy + rows) % rows;
        for (let dx = -1; dx <= 1 && !eaten; dx++) {
          const bx = (cx + dx + cols) % cols;
          const b = by * cols + bx;
          const end = bucketStart[b + 1]!;
          for (let idx = bucketStart[b]!; idx < end; idx++) {
            const j = sorted[idx]!;
            if (j === i) continue;
            if (!isEdibleBy(CellType.DIGESTIVE, f.cellType[j]!)) continue;
            const ddx = wrapDelta(xi - f.posX[j]!, width);
            const ddy = wrapDelta(yi - f.posY[j]!, height);
            const rsum = ri + f.radius[j]!;
            if (ddx * ddx + ddy * ddy < rsum * rsum) {
              const avail = f.energy[j]!;
              const extracted = avail < digestRate ? avail : digestRate;
              if (extracted > 0) {
                f.energy[j] = avail - extracted;
                f.energy[i] = f.energy[i]! + extracted * digestEfficiency;
                eaten = true;
                break;
              }
            }
          }
        }
      }
    }

    // basal cost for all living cells
    f.energy[i] = f.energy[i]! - basalCost * area;
  }
}
```

- [ ] **Step 4: Run; expect PASS** — `pnpm test src/core/cells/metabolism.test.ts`.

- [ ] **Step 5: Commit**

```bash
git add src/core/cells/metabolism.ts src/core/cells/metabolism.test.ts
git commit -m "feat(M2.4): metabolism — photosynthesis gain + patch depletion"
```

---

### Task 5: Metabolism — digestion of adjacent prey

**Files:**
- Test: `src/core/cells/metabolism.test.ts` (extend)

- [ ] **Step 1: Add tests**

```ts
describe('metabolism — digestion', () => {
  it('a DIGESTIVE cell eats an adjacent MEAT cell; energy moves with efficiency loss', () => {
    const cfg = defaultConfig({ worldWidth: 1024, worldHeight: 1024 });
    const store = new CellStore(16, false);
    const f = store.fields;
    const a = store.alloc(); // digestive
    const b = store.alloc(); // meat (adjacent)
    f.posX[a] = 500; f.posY[a] = 500; f.radius[a] = 3; f.mass[a] = 1;
    f.energy[a] = 100; f.cellType[a] = CellType.DIGESTIVE;
    f.posX[b] = 503; f.posY[b] = 500; f.radius[b] = 3; f.mass[b] = 1;
    f.energy[b] = 100; f.cellType[b] = CellType.MEAT;
    const live = new Uint32Array([a, b]);

    const lf = new LightField(16, 16, 1024, 1024);
    lf.cap.fill(0); lf.light.fill(0); // no light → isolate digestion
    const hash = buildHash(store, live, 2, 1024, 1024, 2 * cfg.cellRadius);
    metabolize(live, 2, f, hash, lf,
      cfg.photoGain, cfg.photoDepletion, cfg.digestRate, cfg.digestEfficiency, cfg.basalCost, cfg.meatDecay);

    const area = 3 * 3;
    // a (lower slot) eats first: extracts digestRate, gains rate*efficiency, pays basal
    expect(f.energy[a]).toBeCloseTo(100 + cfg.digestRate * cfg.digestEfficiency - cfg.basalCost * area, 4);
    // b is meat: loses what was eaten, then decays meatDecay
    expect(f.energy[b]).toBeCloseTo(100 - cfg.digestRate - cfg.meatDecay, 4);
  });

  it('a DIGESTIVE cell with no edible neighbour only pays basal cost', () => {
    const cfg = defaultConfig({ worldWidth: 1024, worldHeight: 1024 });
    const store = new CellStore(16, false);
    const f = store.fields;
    const a = store.alloc();
    f.posX[a] = 500; f.posY[a] = 500; f.radius[a] = 3; f.energy[a] = 100;
    f.mass[a] = 1; f.cellType[a] = CellType.DIGESTIVE;
    const live = new Uint32Array([a]);
    const lf = new LightField(16, 16, 1024, 1024);
    lf.cap.fill(0); lf.light.fill(0);
    const hash = buildHash(store, live, 1, 1024, 1024, 2 * cfg.cellRadius);
    metabolize(live, 1, f, hash, lf,
      cfg.photoGain, cfg.photoDepletion, cfg.digestRate, cfg.digestEfficiency, cfg.basalCost, cfg.meatDecay);
    expect(f.energy[a]).toBeCloseTo(100 - cfg.basalCost * 9, 4);
  });
});
```

- [ ] **Step 2: Run; expect PASS** (implementation already covers this). Fix `metabolism.ts` if red.

- [ ] **Step 3: Commit**

```bash
git add src/core/cells/metabolism.test.ts
git commit -m "test(M2.5): metabolism — digestion of adjacent prey"
```

---

### Task 6: Metabolism — basal cost + meat decay branch

**Files:**
- Test: `src/core/cells/metabolism.test.ts` (extend)

- [ ] **Step 1: Add tests**

```ts
describe('metabolism — basal cost and meat decay', () => {
  it('a MEAT cell only decays (no basal, no gain)', () => {
    const cfg = defaultConfig({ worldWidth: 1024, worldHeight: 1024 });
    const store = new CellStore(8, false);
    const f = store.fields;
    const m = store.alloc();
    f.posX[m] = 100; f.posY[m] = 100; f.radius[m] = 5; f.energy[m] = 20;
    f.mass[m] = 1; f.cellType[m] = CellType.MEAT;
    const live = new Uint32Array([m]);
    const lf = new LightField(16, 16, 1024, 1024);
    lf.cap.fill(1); lf.light.fill(1); // light present but meat ignores it
    const hash = buildHash(store, live, 1, 1024, 1024, 2 * cfg.cellRadius);
    metabolize(live, 1, f, hash, lf,
      cfg.photoGain, cfg.photoDepletion, cfg.digestRate, cfg.digestEfficiency, cfg.basalCost, cfg.meatDecay);
    expect(f.energy[m]).toBeCloseTo(20 - cfg.meatDecay, 4);
  });

  it('basal cost scales with area (radius²)', () => {
    const cfg = defaultConfig({ worldWidth: 1024, worldHeight: 1024 });
    const store = new CellStore(8, false);
    const f = store.fields;
    const big = store.alloc();
    f.posX[big] = 100; f.posY[big] = 100; f.radius[big] = 4; f.energy[big] = 100;
    f.mass[big] = 1; f.cellType[big] = CellType.DIGESTIVE;
    const live = new Uint32Array([big]);
    const lf = new LightField(16, 16, 1024, 1024);
    lf.cap.fill(0); lf.light.fill(0);
    const hash = buildHash(store, live, 1, 1024, 1024, 2 * cfg.cellRadius);
    metabolize(live, 1, f, hash, lf,
      cfg.photoGain, cfg.photoDepletion, cfg.digestRate, cfg.digestEfficiency, cfg.basalCost, cfg.meatDecay);
    expect(f.energy[big]).toBeCloseTo(100 - cfg.basalCost * 16, 4);
  });
});
```

- [ ] **Step 2: Run; expect PASS.** Run: `pnpm test src/core/cells/metabolism.test.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/core/cells/metabolism.test.ts
git commit -m "test(M2.6): metabolism — basal cost + meat decay"
```

---

### Task 7: Lifecycle — death→meat and meat→free

**Files:**
- Create: `src/core/cells/lifecycle.ts`, `src/core/cells/lifecycle.test.ts`

> `lifecycle()` is built test-first across Tasks 7–8: death/decay-removal here, division in Task 8. Write the whole function now. It takes **scalar** params + an **out-param** result (no per-tick object allocation) and uses fixed-arity `hashFloat3` for jitter.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { lifecycle, type LifecycleResult } from './lifecycle';
import { CellType } from './types';
import { CellStore } from '../memory/cell-store';
import { defaultConfig } from '../sim/config';

const out: LifecycleResult = { births: 0, deaths: 0 };

// scalar-args wrapper for tests
function run(live: Uint32Array, n: number, store: CellStore, cfg: ReturnType<typeof defaultConfig>, tick: number) {
  lifecycle(live, n, store, cfg.seed, cfg.worldWidth, cfg.worldHeight,
    cfg.meatEnergyOnDeath, cfg.divideThreshold, cfg.divideCost, cfg.divideJitter, tick, out);
}

describe('lifecycle — death and decay', () => {
  it('a living cell at energy<=0 becomes MEAT holding mass·meatEnergyOnDeath', () => {
    const cfg = defaultConfig();
    const store = new CellStore(8, false);
    const f = store.fields;
    const i = store.alloc();
    f.cellType[i] = CellType.PHOTO; f.energy[i] = -3; f.mass[i] = 1;
    f.radius[i] = 5; f.posX[i] = 10; f.posY[i] = 10;
    const live = new Uint32Array([i]);

    run(live, 1, store, cfg, 0);

    expect(store.isAlive(i)).toBe(true); // slot still occupied
    expect(f.cellType[i]).toBe(CellType.MEAT);
    expect(f.energy[i]).toBeCloseTo(cfg.meatEnergyOnDeath, 4);
    expect(out.deaths).toBe(1);
    expect(out.births).toBe(0);
  });

  it('a MEAT cell at energy<=0 frees its slot (corpse fully decayed)', () => {
    const cfg = defaultConfig();
    const store = new CellStore(8, false);
    const f = store.fields;
    const i = store.alloc();
    f.cellType[i] = CellType.MEAT; f.energy[i] = 0; f.mass[i] = 1;
    f.radius[i] = 5; f.posX[i] = 10; f.posY[i] = 10;
    const live = new Uint32Array([i]);
    const genBefore = f.generation[i]!;

    run(live, 1, store, cfg, 0);

    expect(store.isAlive(i)).toBe(false); // slot freed
    expect(f.generation[i]).toBe((genBefore + 1) >>> 0); // generation bumped
    expect(out.deaths).toBe(0); // decay-removal is not a "death" event
  });
});
```

- [ ] **Step 2: Run; expect FAIL** (module missing).

- [ ] **Step 3: Implement the full `lifecycle()`** — `src/core/cells/lifecycle.ts`

```ts
import { type CellStore } from '../memory/cell-store';
import { CellType, isLiving } from './types';
import { hashFloat3 } from '../math/rng';
import { wrap } from '../math/vec2';

export interface LifecycleResult {
  births: number;
  deaths: number;
}

/**
 * LIVE/DIE/BREED step (§4.3). Single-threaded, canonical ascending-live-slot
 * order. Takes scalar params (not Config) and writes counts into `out` (no
 * per-tick allocation). Three in-order passes over the live set captured at tick
 * start:
 *   1. Death:  living energy<=0 → convert in place to MEAT (biomass→food energy).
 *   2. Decay:  MEAT energy<=0   → free the slot (bumps generation[]; exercises the free-list).
 *   3. Divide: living energy>=divideThreshold → clone same-type child into a free
 *              slot, 50/50 energy split minus divideCost; child placed at parent +
 *              seeded jitter (stateless hashFloat3 → reproducible, order-free).
 * Children are NOT added to `live`; they first act next tick.
 */
export function lifecycle(
  live: Uint32Array,
  n: number,
  store: CellStore,
  seed: number,
  worldWidth: number,
  worldHeight: number,
  meatEnergyOnDeath: number,
  divideThreshold: number,
  divideCost: number,
  divideJitter: number,
  tick: number,
  out: LifecycleResult,
): void {
  const f = store.fields;
  let births = 0;
  let deaths = 0;

  // Pass 1 + 2: death and decay-removal.
  for (let k = 0; k < n; k++) {
    const i = live[k]!;
    const type = f.cellType[i]!;
    if (isLiving(type)) {
      if (f.energy[i]! <= 0) {
        f.cellType[i] = CellType.MEAT;
        f.energy[i] = f.mass[i]! * meatEnergyOnDeath;
        f.velX[i] = 0;
        f.velY[i] = 0;
        deaths++;
      }
    } else if (f.energy[i]! <= 0) {
      // MEAT fully decayed → recycle the slot.
      store.free(i);
    }
  }

  // Pass 3: division. (Slots freed in pass 2 are available for reuse.)
  for (let k = 0; k < n; k++) {
    const i = live[k]!;
    if (!isLiving(f.cellType[i]!)) continue;
    if (f.energy[i]! < divideThreshold) continue;
    const child = store.alloc();
    if (child < 0) break; // at capacity — refuse-new
    const half = (f.energy[i]! - divideCost) * 0.5;
    f.energy[i] = half;
    f.energy[child] = half;
    const angle = hashFloat3(seed, tick, i) * Math.PI * 2;
    f.posX[child] = wrap(f.posX[i]! + Math.cos(angle) * divideJitter, worldWidth);
    f.posY[child] = wrap(f.posY[i]! + Math.sin(angle) * divideJitter, worldHeight);
    f.velX[child] = 0;
    f.velY[child] = 0;
    f.forceX[child] = 0;
    f.forceY[child] = 0;
    f.radius[child] = f.radius[i]!;
    f.mass[child] = f.mass[i]!;
    f.cellType[child] = f.cellType[i]!;
    f.organismId[child] = 0;
    f.genomeRef[child] = 0;
    f.brainRef[child] = 0;
    f.age[child] = 0;
    births++;
  }

  out.births = births;
  out.deaths = deaths;
}
```

- [ ] **Step 4: Run; expect PASS** — `pnpm test src/core/cells/lifecycle.test.ts`.

- [ ] **Step 5: Commit**

```bash
git add src/core/cells/lifecycle.ts src/core/cells/lifecycle.test.ts
git commit -m "feat(M2.7): lifecycle — death→meat and meat→free-slot"
```

---

### Task 8: Lifecycle — clone division (50/50 split)

**Files:**
- Test: `src/core/cells/lifecycle.test.ts` (extend)

- [ ] **Step 1: Add tests** (reuse the `out` + `run()` helper from Task 7)

```ts
describe('lifecycle — division', () => {
  it('a cell at/above threshold clones a same-type child, splitting energy 50/50', () => {
    const cfg = defaultConfig({ divideThreshold: 200, divideCost: 10 });
    const store = new CellStore(8, false);
    const f = store.fields;
    const i = store.alloc();
    f.cellType[i] = CellType.DIGESTIVE; f.energy[i] = 250; f.mass[i] = 1;
    f.radius[i] = 4; f.posX[i] = 100; f.posY[i] = 100;
    const live = new Uint32Array([i]);

    run(live, 1, store, cfg, 5);

    expect(out.births).toBe(1);
    expect(store.aliveCount).toBe(2);
    const half = (250 - 10) * 0.5;
    expect(f.energy[i]).toBeCloseTo(half, 4);
    let child = -1;
    for (let s = 0; s < store.capacity; s++) if (s !== i && store.isAlive(s)) child = s;
    expect(child).toBeGreaterThanOrEqual(0);
    expect(f.cellType[child]).toBe(CellType.DIGESTIVE);
    expect(f.energy[child]).toBeCloseTo(half, 4);
    expect(f.age[child]).toBe(0);
  });

  it('does not divide below threshold', () => {
    const cfg = defaultConfig({ divideThreshold: 200 });
    const store = new CellStore(8, false);
    const f = store.fields;
    const i = store.alloc();
    f.cellType[i] = CellType.PHOTO; f.energy[i] = 150; f.mass[i] = 1; f.radius[i] = 4;
    const live = new Uint32Array([i]);
    run(live, 1, store, cfg, 0);
    expect(out.births).toBe(0);
    expect(store.aliveCount).toBe(1);
  });

  it('refuses to divide when no free slot remains (no allocation, no crash)', () => {
    const cfg = defaultConfig({ divideThreshold: 100, maxCells: 1 });
    const store = new CellStore(1, false);
    const f = store.fields;
    const i = store.alloc(); // last and only slot
    f.cellType[i] = CellType.PHOTO; f.energy[i] = 500; f.mass[i] = 1; f.radius[i] = 4;
    const live = new Uint32Array([i]);
    run(live, 1, store, cfg, 0);
    expect(out.births).toBe(0);
    expect(f.energy[i]).toBe(500); // untouched
  });
});
```

- [ ] **Step 2: Run; expect PASS.** Run: `pnpm test src/core/cells/lifecycle.test.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/core/cells/lifecycle.test.ts
git commit -m "test(M2.8): lifecycle — clone division 50/50 split"
```

---

### Task 9: Telemetry — sampleMetrics + Simpson diversity

**Files:**
- Create: `src/core/sim/metrics.ts`, `src/core/sim/metrics.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { makeMetrics, sampleMetrics } from './metrics';
import { CellType } from '../cells/types';
import { CellStore } from '../memory/cell-store';

function seed(types: number[], energies: number[]): { store: CellStore; live: Uint32Array } {
  const store = new CellStore(types.length + 4, false);
  const f = store.fields;
  const live = new Uint32Array(types.length);
  for (let k = 0; k < types.length; k++) {
    const i = store.alloc();
    f.cellType[i] = types[k]!;
    f.energy[i] = energies[k]!;
    live[k] = i;
  }
  return { store, live };
}

describe('telemetry metrics', () => {
  it('counts population per type and mean energy over LIVING cells', () => {
    const { store, live } = seed(
      [CellType.PHOTO, CellType.PHOTO, CellType.DIGESTIVE, CellType.MEAT],
      [100, 200, 60, 999],
    );
    const m = makeMetrics();
    sampleMetrics(m, live, 4, store.fields, 7, 3, 1);
    expect(m.tick).toBe(7);
    expect(m.population).toBe(4);
    expect(m.photo).toBe(2);
    expect(m.digestive).toBe(1);
    expect(m.meat).toBe(1);
    expect(m.meanEnergy).toBeCloseTo((100 + 200 + 60) / 3, 4); // meat excluded
    expect(m.births).toBe(3);
    expect(m.deaths).toBe(1);
  });

  it('phenotypic diversity is Simpson 1-Σpᵢ² over living types', () => {
    const m = makeMetrics();
    {
      const { store, live } = seed([CellType.PHOTO, CellType.PHOTO], [10, 10]);
      sampleMetrics(m, live, 2, store.fields, 0, 0, 0);
      expect(m.diversity).toBeCloseTo(0, 5); // all one living type → 0
    }
    {
      const { store, live } = seed([CellType.PHOTO, CellType.DIGESTIVE], [10, 10]);
      sampleMetrics(m, live, 2, store.fields, 0, 0, 0);
      expect(m.diversity).toBeCloseTo(0.5, 5); // even split → 1-(0.25+0.25)
    }
  });
});
```

- [ ] **Step 2: Run; expect FAIL** (module missing).

- [ ] **Step 3: Implement** — `src/core/sim/metrics.ts`

```ts
import { type CellArrays } from '../memory/cell-store';
import { CellType } from '../cells/types';

/**
 * Per-tick health metrics (§4.5, §11). Phenotypic diversity = Simpson index over
 * LIVING cell types. Genotypic diversity is omitted until genomes exist (M6) —
 * not faked. Allocation-free: callers reuse one Metrics object via makeMetrics().
 * Call this over the CURRENT live set (after the tick's second rebuildLive) so
 * freed corpses are excluded and newborns included.
 */
export interface Metrics {
  tick: number;
  population: number;
  photo: number;
  digestive: number;
  meat: number;
  meanEnergy: number;
  diversity: number;
  births: number;
  deaths: number;
}

export function makeMetrics(): Metrics {
  return {
    tick: 0, population: 0, photo: 0, digestive: 0, meat: 0,
    meanEnergy: 0, diversity: 0, births: 0, deaths: 0,
  };
}

export function sampleMetrics(
  out: Metrics,
  live: Uint32Array,
  n: number,
  f: CellArrays,
  tick: number,
  births: number,
  deaths: number,
): void {
  let photo = 0;
  let digestive = 0;
  let meat = 0;
  let energySum = 0;
  for (let k = 0; k < n; k++) {
    const i = live[k]!;
    const t = f.cellType[i]!;
    if (t === CellType.PHOTO) { photo++; energySum += f.energy[i]!; }
    else if (t === CellType.DIGESTIVE) { digestive++; energySum += f.energy[i]!; }
    else if (t === CellType.MEAT) { meat++; }
  }
  const living = photo + digestive;
  let diversity = 0;
  if (living > 0) {
    const pp = photo / living;
    const pd = digestive / living;
    diversity = 1 - (pp * pp + pd * pd);
  }
  out.tick = tick;
  out.population = n;
  out.photo = photo;
  out.digestive = digestive;
  out.meat = meat;
  out.meanEnergy = living > 0 ? energySum / living : 0;
  out.diversity = diversity;
  out.births = births;
  out.deaths = deaths;
}
```

- [ ] **Step 4: Run; expect PASS** — `pnpm test src/core/sim/metrics.test.ts`.

- [ ] **Step 5: Commit**

```bash
git add src/core/sim/metrics.ts src/core/sim/metrics.test.ts
git commit -m "feat(M2.9): telemetry metrics — counts, mean energy, Simpson diversity"
```

---

### Task 10: Wire metabolism + lifecycle + environment into World.tick

**Files:**
- Modify: `src/core/sim/world.ts`
- Create: `src/core/sim/READS-WRITES.md`
- Test: `src/core/sim/world.test.ts` (existing — extend)

- [ ] **Step 1: Write the failing integration test** — append to `src/core/sim/world.test.ts`

```ts
import { CellType } from '../cells/types';

describe('World M2 metabolism integration', () => {
  it('seeds a PHOTO/DIGESTIVE mix by initialPhotoFraction', () => {
    const w = new World(defaultConfig({ maxCells: 1000, initialPhotoFraction: 0.8 }), false);
    w.seedLife(1000);
    let photo = 0;
    let dig = 0;
    for (let i = 0; i < w.cells.capacity; i++) {
      if (!w.cells.isAlive(i)) continue;
      if (w.cells.fields.cellType[i] === CellType.PHOTO) photo++;
      else if (w.cells.fields.cellType[i] === CellType.DIGESTIVE) dig++;
    }
    expect(photo).toBe(800);
    expect(dig).toBe(200);
  });

  it('ticks without error and updates metrics + light field', () => {
    const w = new World(defaultConfig({ maxCells: 2000 }), false);
    w.seedLife(1000);
    const before = Array.from(w.light.light);
    for (let i = 0; i < 20; i++) w.tick();
    expect(w.tickCount).toBe(20);
    expect(w.metrics.population).toBeGreaterThan(0);
    expect(w.metrics.population).toBe(w.cells.aliveCount); // metrics on the CURRENT live set
    expect(Array.from(w.light.light)).not.toEqual(before); // field evolved
  });

  it('low-energy cells die into meat over time (population dynamics live)', () => {
    const w = new World(
      defaultConfig({ maxCells: 2000, lightMax: 0, basalCost: 5, divideThreshold: 1e9 }),
      false,
    );
    w.seedLife(500);
    for (let i = 0; i < 40; i++) w.tick();
    let meat = 0;
    for (let i = 0; i < w.cells.capacity; i++) {
      if (w.cells.isAlive(i) && w.cells.fields.cellType[i] === CellType.MEAT) meat++;
    }
    expect(meat).toBeGreaterThan(0);
  });

  it('newborn division children have age 0 the tick they are born, even when a corpse slot is recycled', () => {
    // Force a tick with BOTH a freed corpse (recycle) and a division (alloc) so the
    // LIFO free-list hands the freed slot to the child. Verify age stays 0.
    const w = new World(
      defaultConfig({ maxCells: 100, worldWidth: 256, worldHeight: 256, lightGridCols: 8, lightGridRows: 8 }),
      false,
    );
    const f = w.cells.fields;
    const corpse = w.cells.alloc();
    const parent = w.cells.alloc();
    f.cellType[corpse] = CellType.MEAT; f.energy[corpse] = 0.0001; f.mass[corpse] = 1;
    f.radius[corpse] = 6; f.posX[corpse] = 10; f.posY[corpse] = 10;
    f.cellType[parent] = CellType.DIGESTIVE; f.energy[parent] = 1e6; f.mass[parent] = 1;
    f.radius[parent] = 6; f.posX[parent] = 200; f.posY[parent] = 200;
    w.config.meatDecay = 1;           // corpse 0.0001 → negative → freed this tick
    w.config.divideThreshold = 100;   // parent divides this tick
    w.config.basalCost = 0;           // keep parent alive
    w.tick();
    // every live cell should have age <= 1 (all born/aged this run); a recycled child must be 0 or 1, never inflated
    for (let i = 0; i < w.cells.capacity; i++) {
      if (!w.cells.isAlive(i)) continue;
      expect(w.cells.fields.age[i]).toBeLessThanOrEqual(1);
    }
    expect(w.lastBirths).toBeGreaterThanOrEqual(1);
    expect(w.metrics.population).toBe(w.cells.aliveCount);
  });
});
```

- [ ] **Step 2: Run; expect FAIL** (`seedLife`, `w.light`, `w.metrics` missing).

- [ ] **Step 3: Implement** — edit `src/core/sim/world.ts`:

Add imports:
```ts
import { LightField } from '../environment/light-field';
import { metabolize } from '../cells/metabolism';
import { lifecycle, type LifecycleResult } from '../cells/lifecycle';
import { CellType } from '../cells/types';
import { makeMetrics, sampleMetrics, type Metrics } from './metrics';
```

Add fields:
```ts
  readonly light: LightField;
  readonly metrics: Metrics;
  /** Pre-allocated so lifecycle writes counts without a per-tick object (zero-alloc). */
  readonly lifecycleResult: LifecycleResult;
  lastBirths: number;
  lastDeaths: number;
```

Constructor wiring (after `this.hash = ...`); the light field uses a dedicated RNG substream so adding draws elsewhere can't shift its patchy layout:
```ts
    this.light = new LightField(
      config.lightGridCols, config.lightGridRows, config.worldWidth, config.worldHeight,
    );
    this.light.init(
      this.rng.split(1 /* STREAM_LIGHT */),
      config.lightPatchCount, config.lightPatchRadius, config.lightMax,
    );
    this.metrics = makeMetrics();
    this.lifecycleResult = { births: 0, deaths: 0 };
    this.lastBirths = 0;
    this.lastDeaths = 0;
```

Replace `spawn` with a typed version and add `seedLife`:
```ts
  /** Spawn up to `n` cells of `type` at seeded random positions. Returns count spawned. */
  spawn(n: number, type: number = CellType.PHOTO): number {
    const f = this.cells.fields;
    let spawned = 0;
    for (let k = 0; k < n; k++) {
      const i = this.cells.alloc();
      if (i < 0) break;
      f.posX[i] = this.rng.range(0, this.config.worldWidth);
      f.posY[i] = this.rng.range(0, this.config.worldHeight);
      f.velX[i] = 0; f.velY[i] = 0; f.forceX[i] = 0; f.forceY[i] = 0;
      f.radius[i] = this.config.cellRadius;
      f.mass[i] = 1;
      f.energy[i] = 100;
      f.cellType[i] = type;
      f.organismId[i] = 0; f.genomeRef[i] = 0; f.brainRef[i] = 0;
      f.age[i] = 0;
      spawned++;
    }
    return spawned;
  }

  /** Seed an initial PHOTO/DIGESTIVE mix per `initialPhotoFraction`. */
  seedLife(n: number): void {
    const photo = Math.round(n * this.config.initialPhotoFraction);
    this.spawn(photo, CellType.PHOTO);
    this.spawn(n - photo, CellType.DIGESTIVE);
  }
```

Replace `tick()` body's tail (after `integrate(...)`, before `this.tickCount++`) — keep rebuildLive/hash/repulsion/integrate as-is, then:
```ts
    metabolize(
      live, n, f, this.hash, this.light,
      cfg.photoGain, cfg.photoDepletion, cfg.digestRate, cfg.digestEfficiency, cfg.basalCost, cfg.meatDecay,
    );

    // Age the tick-start live set BEFORE lifecycle. The free-list is LIFO, so a
    // slot freed in lifecycle is reused for a division child the same tick;
    // ageing first keeps that child at the age 0 lifecycle sets (not 1).
    for (let k = 0; k < n; k++) {
      const i = live[k]!;
      f.age[i] = (f.age[i]! + 1) >>> 0;
    }

    lifecycle(
      live, n, this.cells,
      cfg.seed, cfg.worldWidth, cfg.worldHeight,
      cfg.meatEnergyOnDeath, cfg.divideThreshold, cfg.divideCost, cfg.divideJitter,
      this.tickCount, this.lifecycleResult,
    );
    this.lastBirths = this.lifecycleResult.births;
    this.lastDeaths = this.lifecycleResult.deaths;

    this.light.step(cfg.lightDiffuse, cfg.lightRegen);

    // Re-derive the live set so metrics exclude freed corpses (free() leaves
    // cellType=MEAT) and include fresh-slot newborns; population == aliveCount.
    this.rebuildLive();
    sampleMetrics(
      this.metrics, this.liveIndices, this.liveCount, f,
      this.tickCount, this.lifecycleResult.births, this.lifecycleResult.deaths,
    );

    this.tickCount++;
```

> Keep the comment on `rebuildLive` about the deferred full-capacity scan + sparse-regime caveat (see "Deferred-with-rationale").

- [ ] **Step 4: Write the READS/WRITES contract** — `src/core/sim/READS-WRITES.md`: copy the table + ordering notes from the "Tick READS/WRITES contract" section of this plan (including the prey-energy ordering, the `generation[]` write, age-before-lifecycle, and the re-sample step).

- [ ] **Step 5: Run** — `pnpm test src/core/sim/world.test.ts` → PASS.

- [ ] **Step 6: Verify invariants still green** — `pnpm test src/core/sim/zero-alloc.test.ts src/core/sim/reproducibility.test.ts`. Both must PASS (tick remains allocation-free — `hashFloat3` + the out-param + double buffer mean no per-tick allocation; reproducibility holds). If zero-alloc fails, find the per-tick allocation and remove it.

- [ ] **Step 7: Commit**

```bash
git add src/core/sim/world.ts src/core/sim/world.test.ts src/core/sim/READS-WRITES.md
git commit -m "feat(M2.10): wire metabolism+lifecycle+environment into World.tick"
```

---

### Task 11: Golden-tick energy bookkeeping test (tier 2)

**Files:**
- Create: `src/core/sim/golden-tick.test.ts`

> Tier-2 deterministic integration test (§6): a hand-built world with fixed (Config, seed), asserting **exact** post-tick energies and light against the READS/WRITES contract. Diffusion/regen frozen and division disabled so the arithmetic is closed-form.
>
> **Float32 discipline:** `energy` is `Float32Array`; the ulp near 100 is ~7.6e-6, far above the digit-6 `toBeCloseTo` tolerance (5e-7) and at the edge of digit-5 (5e-6). Assert the ~100-magnitude energies at **digit 4** (tolerance 5e-5 ≈ 6× ulp) — this still pins the closed-form arithmetic (every term is ≥1e-3) while tolerating storage rounding. Light (≤1) and the exact integer meat result stay at digit 6. A sub-1e-5 energy mismatch is rounding, NOT a logic bug; only a >1e-4 difference or a missing/extra term is a real contract violation.

- [ ] **Step 1: Write the test**

```ts
import { describe, it, expect } from 'vitest';
import { World } from './world';
import { defaultConfig } from './config';
import { CellType } from '../cells/types';

describe('golden tick — energy bookkeeping', () => {
  it('reproduces exact post-tick energies and light over one full tick', () => {
    const cfg = defaultConfig({
      maxCells: 8, worldWidth: 1024, worldHeight: 1024,
      lightGridCols: 16, lightGridRows: 16,
      lightDiffuse: 0, lightRegen: 0,          // freeze the field for closed-form expectation
      photoGain: 0.1, photoDepletion: 0.5, basalCost: 0.01,
      digestRate: 2, digestEfficiency: 0.5, meatDecay: 1,
      repulsion: 0, divideThreshold: 1e9,      // no forces, no division
    });
    const w = new World(cfg, false);
    const f = w.cells.fields;

    // Override the patchy field to a known uniform 1.0 so photosynthesis is exact.
    w.light.cap.fill(1);
    w.light.light.fill(1);

    // Slot 0: PHOTO at a known patch. Slot 1: DIGESTIVE adjacent to slot 2: MEAT.
    const a = w.cells.alloc(); // 0
    const b = w.cells.alloc(); // 1
    const c = w.cells.alloc(); // 2
    expect([a, b, c]).toEqual([0, 1, 2]); // canonical slot order

    f.posX[a] = 500; f.posY[a] = 500; f.radius[a] = 2; f.mass[a] = 1;
    f.energy[a] = 100; f.cellType[a] = CellType.PHOTO; f.velX[a] = 0; f.velY[a] = 0;

    f.posX[b] = 200; f.posY[b] = 200; f.radius[b] = 2; f.mass[b] = 1;
    f.energy[b] = 100; f.cellType[b] = CellType.DIGESTIVE; f.velX[b] = 0; f.velY[b] = 0;

    f.posX[c] = 203; f.posY[c] = 200; f.radius[c] = 2; f.mass[c] = 1;
    f.energy[c] = 10; f.cellType[c] = CellType.MEAT; f.velX[c] = 0; f.velY[c] = 0;

    const patchA = w.light.patchIndex(500, 500);

    w.tick();

    const area = 2 * 2; // 4
    const gain = 0.1 * 1 * area;
    // PHOTO: +gain − basal·area. Float32 energy → digit 4.
    expect(f.energy[a]).toBeCloseTo(100 + gain - 0.01 * area, 4);
    // Light patch (≤1, fine at digit 6): 1 − gain·photoDepletion. step() with
    // diffuse=regen=0 copies the depleted value through the buffer swap.
    expect(w.light.light[patchA]).toBeCloseTo(1 - gain * 0.5, 6);
    // DIGESTIVE eats the adjacent MEAT first: +digestRate·efficiency − basal·area.
    expect(f.energy[b]).toBeCloseTo(100 + 2 * 0.5 - 0.01 * area, 4);
    // MEAT: −eaten(2) − meatDecay(1) = 7 (exact, digit 6).
    expect(f.energy[c]).toBeCloseTo(10 - 2 - 1, 6);
  });
});
```

- [ ] **Step 2: Run; expect PASS** — `pnpm test src/core/sim/golden-tick.test.ts`. If an energy assertion is off by >1e-4 or by a whole term, the discrepancy IS a real bug — reconcile `world.ts`/`metabolism.ts` against the READS/WRITES contract (do not adjust expected values to match output). A sub-1e-5 mismatch would only appear if you wrongly tightened the digit — energy is Float32.

- [ ] **Step 3: Commit**

```bash
git add src/core/sim/golden-tick.test.ts
git commit -m "test(M2.11): golden-tick energy-bookkeeping (tier 2)"
```

---

### Task 12: Free-list / generation recycle reproducibility (deferred M1 item)

**Files:**
- Create: `src/core/sim/recycle.test.ts`

> Now that death frees slots and division reuses them, prove the recycle path is reproducible. Two identical runs with **real churn** (births AND deaths AND slot recycling) must produce byte-identical SoA **including `generation[]`**; a different seed must differ.
>
> **The economy must keep the population alive while it churns** — if it goes extinct, both seeds end in identical all-zero arrays and the "differs across seeds" assert fails comparing nothing. The params below are a verified-survivable set (photosynthesis > basal, threshold reachable). **You MUST empirically verify them** in Step 2; if the population extincts or `generation` never bumps, re-tune before committing.

- [ ] **Step 1: Write the test**

```ts
import { describe, it, expect } from 'vitest';
import { World } from './world';
import { defaultConfig } from './config';

// Verified-survivable churn: producers out-earn basal, threshold is reachable,
// corpses decay → births AND deaths AND slot recycling within 150 ticks.
function churn(seed: number): World {
  const w = new World(
    defaultConfig({
      seed, maxCells: 3000, worldWidth: 1024, worldHeight: 1024,
      lightGridCols: 24, lightGridRows: 24,
      basalCost: 0.02, photoGain: 0.12, photoDepletion: 0.03, lightRegen: 0.15,
      divideThreshold: 140, digestRate: 8, digestEfficiency: 0.7, meatDecay: 3,
    }),
    false,
  );
  w.seedLife(800);
  for (let i = 0; i < 150; i++) w.tick();
  return w;
}

describe('free-list / generation recycle reproducibility', () => {
  it('is byte-identical across runs, including generation[] after slot recycling', () => {
    const a = churn(999);
    const b = churn(999);
    const cap = a.cells.capacity;
    expect(a.cells.aliveCount).toBeGreaterThan(0); // population survived (else arrays are all-zero)
    expect(Array.from(a.cells.fields.energy.slice(0, cap))).toEqual(
      Array.from(b.cells.fields.energy.slice(0, cap)),
    );
    expect(Array.from(a.cells.fields.cellType.slice(0, cap))).toEqual(
      Array.from(b.cells.fields.cellType.slice(0, cap)),
    );
    expect(Array.from(a.cells.fields.generation.slice(0, cap))).toEqual(
      Array.from(b.cells.fields.generation.slice(0, cap)),
    );
    // the run actually exercised recycling (some slot was freed → generation bumped)
    expect(Array.from(a.cells.fields.generation.slice(0, cap)).some((g) => g > 0)).toBe(true);
  });

  it('differs across seeds', () => {
    const a = churn(1);
    const b = churn(2);
    expect(a.cells.aliveCount).toBeGreaterThan(0);
    expect(b.cells.aliveCount).toBeGreaterThan(0);
    expect(Array.from(a.cells.fields.energy.slice(0, a.cells.capacity))).not.toEqual(
      Array.from(b.cells.fields.energy.slice(0, b.cells.capacity)),
    );
  });
});
```

- [ ] **Step 2: Run + empirically verify** — `pnpm test src/core/sim/recycle.test.ts`. All asserts PASS. The `aliveCount > 0` and `generation.some(g>0)` guards confirm the run both survived and recycled. If `aliveCount` is 0 (extinct) or no generation bumped, re-tune `churn` (raise `photoGain`/`lightRegen`, lower `basalCost`/`divideThreshold`) until it survives AND churns, then re-run. If the byte-identical assert fails, hunt the nondeterminism (non-canonical iteration, or a wall-clock/`Math.random`/variadic-`hashFloat` leak).

- [ ] **Step 3: Commit**

```bash
git add src/core/sim/recycle.test.ts
git commit -m "test(M2.12): free-list/generation recycle reproducibility"
```

---

### Task 12b: Tier-3 property/invariant tests

**Files:**
- Create: `src/core/sim/invariants.test.ts`

> Spec §6 tier 3 (energy never negative; population in [0, maxCells]; no NaN/Inf; cells never escape toroidal bounds) and §7 gate tiers 1–4,6 on every PR. M2 is the first milestone where these become breakable. Assert **after each full tick** (living energy≤0 and MEAT energy≤0 are legitimately transient mid-tick, resolved by lifecycle the same tick).

- [ ] **Step 1: Write the test**

```ts
import { describe, it, expect } from 'vitest';
import { World } from './world';
import { defaultConfig } from './config';
import { isLiving } from '../cells/types';

const CONFIGS = [
  { seed: 1 },
  { seed: 2, basalCost: 0.1, divideThreshold: 120 },
  { seed: 3, lightMax: 0.3, meatDecay: 1 },
  { seed: 4, photoGain: 0.1, lightRegen: 0.2 },
];

describe('tier-3 invariants (property)', () => {
  for (const over of CONFIGS) {
    it(`holds invariants every tick (config ${JSON.stringify(over)})`, () => {
      const cfg = defaultConfig({ maxCells: 2000, worldWidth: 1024, worldHeight: 1024, ...over });
      const w = new World(cfg, false);
      w.seedLife(600);
      for (let t = 0; t < 200; t++) {
        w.tick();
        const f = w.cells.fields;
        expect(w.cells.aliveCount).toBeGreaterThanOrEqual(0);
        expect(w.cells.aliveCount).toBeLessThanOrEqual(cfg.maxCells);
        for (let k = 0; k < w.liveCount; k++) {
          const i = w.liveIndices[k]!;
          expect(Number.isFinite(f.energy[i]!)).toBe(true);
          expect(Number.isFinite(f.posX[i]!)).toBe(true);
          expect(Number.isFinite(f.posY[i]!)).toBe(true);
          expect(f.posX[i]!).toBeGreaterThanOrEqual(0);
          expect(f.posX[i]!).toBeLessThan(cfg.worldWidth);
          expect(f.posY[i]!).toBeGreaterThanOrEqual(0);
          expect(f.posY[i]!).toBeLessThan(cfg.worldHeight);
          if (isLiving(f.cellType[i]!)) expect(f.energy[i]!).toBeGreaterThan(0);
        }
      }
    });
  }
});
```

- [ ] **Step 2: Run; expect PASS** — `pnpm test src/core/sim/invariants.test.ts`. A living cell with energy≤0 *after* a tick means lifecycle failed to convert it to MEAT (a real bug). An out-of-bounds position means an integrator/wrap bug.

- [ ] **Step 3: Commit**

```bash
git add src/core/sim/invariants.test.ts
git commit -m "test(M2.12b): tier-3 property/invariant tests"
```

---

### Task 13: Renderer — colour by cell type (+ gl getter)

**Files:**
- Modify: `src/render/webgl-renderer.ts`

> App/render verified by build + screenshot (M1 precedent). Replace speed-colour with type-colour: the third interleaved float becomes `cellType`. Also expose the GL context for the light overlay (Task 14/18) — a class can't have both `private gl` and `get gl()`, so rename the field to `gl_`.

- [ ] **Step 1: Expose the GL context** — rename `private readonly gl` to `private readonly gl_`, update every internal `this.gl` → `this.gl_`, and add a getter:

```ts
  get gl(): WebGL2RenderingContext {
    return this.gl_;
  }
```

- [ ] **Step 2: Change the shaders** — rename the `a_speed`/`v_speed` varying to `a_type`/`v_type` and replace the fragment colour logic:

```glsl
// VERT: layout(location=1) in float a_type;  out float v_type;  v_type = a_type;
// FRAG:
in float v_type;
out vec4 frag;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  if (dot(c, c) > 0.25) discard;
  vec3 col;
  if (v_type < 0.5)       col = vec3(0.30, 0.80, 0.35);  // PHOTO   green
  else if (v_type < 1.5)  col = vec3(0.95, 0.45, 0.20);  // DIGEST  orange-red
  else                    col = vec3(0.55, 0.50, 0.45);  // MEAT    grey-brown
  frag = vec4(col, 1.0);
}
```

- [ ] **Step 3: Write `cellType` into the interleaved buffer** — in `render()`, replace the speed computation (remove the now-unused `velX`/`velY` reads):

```ts
    for (let k = 0; k < n; k++) {
      const i = live[k]!;
      const o = k * 3;
      data[o] = lerpWrapped(prevX[i]!, f.posX[i]!, alpha, w);
      data[o + 1] = lerpWrapped(prevY[i]!, f.posY[i]!, alpha, h);
      data[o + 2] = f.cellType[i]!;
    }
```

> The `prevGen` de-streak param is added to `render()` in Task 18 (together with the `main.ts` wiring), so this task keeps `render()`'s signature unchanged and stays green on its own.

- [ ] **Step 4: Verify build + typecheck** — `pnpm typecheck && pnpm build` → no errors.

- [ ] **Step 5: Commit**

```bash
git add src/render/webgl-renderer.ts
git commit -m "feat(M2.13): renderer colours cells by type + exposes gl context"
```

---

### Task 14: Light-field heatmap overlay

**Files:**
- Create: `src/render/light-overlay.ts`

> A toggleable heatmap of the light field, drawn under the cells as a single textured world-quad (R32F texture uploaded from `field.light` each frame). Camera-aligned via the same offset/scale uniforms as the point renderer.

- [ ] **Step 1: Implement `LightOverlay`** — `src/render/light-overlay.ts`

```ts
import { type LightField } from '../core/environment/light-field';
import { type Camera } from './webgl-renderer';

const VERT = `#version 300 es
layout(location=0) in vec2 a_corner;     // unit quad 0..1
uniform vec2 u_offset; uniform float u_scale; uniform vec2 u_res; uniform vec2 u_world;
out vec2 v_uv;
void main() {
  v_uv = a_corner;
  vec2 world = a_corner * u_world;
  vec2 screen = (world - u_offset) * u_scale;
  vec2 clip = screen / (u_res * 0.5);
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
}`;

const FRAG = `#version 300 es
precision highp float;
uniform sampler2D u_light; uniform float u_max;
in vec2 v_uv; out vec4 frag;
void main() {
  float l = texture(u_light, v_uv).r / max(u_max, 1e-6);
  vec3 col = mix(vec3(0.02, 0.03, 0.10), vec3(0.95, 0.85, 0.35), clamp(l, 0.0, 1.0));
  frag = vec4(col, 0.55);
}`;

/** Single textured quad heatmap of the light field. Draw before the points. */
export class LightOverlay {
  // Standard WebGL2 boilerplate: compile VERT/FRAG, create a unit-quad VAO
  // (two triangles, corners 0..1), an R32F texture sized cols×rows, and cache
  // uniform locations u_offset/u_scale/u_res/u_world/u_light/u_max.
  // (Mirror the compile()/program setup in webgl-renderer.ts.)
  constructor(gl: WebGL2RenderingContext, field: LightField) { /* ... */ }

  /** Upload current light + draw the quad under the given camera. */
  render(camera: Camera, field: LightField, lightMax: number, width: number, height: number): void {
    // Read field.light AT UPLOAD TIME each frame — never cache the Float32Array,
    // LightField.step() swaps the double buffer so a cached reference goes stale.
    // gl.texSubImage2D(... R32F, field.cols, field.rows, field.light ...)
    // set u_offset=camera.x/y, u_scale=camera.scale, u_res=width/height,
    //     u_world=field.worldWidth/Height, u_max=lightMax; draw 6 verts.
  }
}
```

> Concrete checklist for the boilerplate body (follow `webgl-renderer.ts` patterns): R32F texture via `gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, cols, rows, 0, gl.RED, gl.FLOAT, null)` then `gl.texSubImage2D(...)` per frame; `gl.NEAREST` filtering (R32F is not linearly filterable without `OES_texture_float_linear`); `gl.CLAMP_TO_EDGE`. Sampling R32F is fine in WebGL2 (no extension needed; only rendering-TO it would need `EXT_color_buffer_float`). Enable `gl.BLEND` with `gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)` when drawing the overlay; disable it before the point pass.

- [ ] **Step 2: Verify build** — `pnpm typecheck && pnpm build`.

- [ ] **Step 3: Commit**

```bash
git add src/render/light-overlay.ts
git commit -m "feat(M2.14): WebGL2 light-field heatmap overlay"
```

---

### Task 15: Telemetry dashboard (Canvas2D charts)

**Files:**
- Create: `src/app/telemetry.ts`

> A small Canvas2D line-chart panel fed by `world.metrics` each frame, keeping a ring buffer of the last ~600 samples. Draws population (total + per type), mean energy, and diversity. Pure DOM/Canvas2D (app layer).

- [ ] **Step 1: Implement** — `src/app/telemetry.ts`

```ts
import { type Metrics } from '../core/sim/metrics';

const CAP = 600;

/** Ring-buffer Canvas2D dashboard of run-health metrics (§11). */
export class TelemetryDashboard {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly pop = new Float32Array(CAP);
  private readonly photo = new Float32Array(CAP);
  private readonly dig = new Float32Array(CAP);
  private readonly meat = new Float32Array(CAP);
  private readonly energy = new Float32Array(CAP);
  private readonly diversity = new Float32Array(CAP);
  private head = 0;
  private count = 0;

  constructor(private readonly canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas2D unavailable for telemetry');
    this.ctx = ctx;
  }

  push(m: Metrics): void {
    const h = this.head;
    this.pop[h] = m.population;
    this.photo[h] = m.photo;
    this.dig[h] = m.digestive;
    this.meat[h] = m.meat;
    this.energy[h] = m.meanEnergy;
    this.diversity[h] = m.diversity;
    this.head = (h + 1) % CAP;
    if (this.count < CAP) this.count++;
  }

  /** Draw three stacked mini-charts: populations, mean energy, diversity (0..1). */
  draw(latest: Metrics): void {
    // clear; for each series, map ring buffer → polyline scaled to its panel.
    // Colour series to match cell types (green/orange/grey) + white total.
    // Render a text line: "pop N | photo/dig/meat | energy E | div D | b/d".
    // (Standard Canvas2D; see frontend-design skill if polishing.)
  }
}
```

> The `draw()` body is mechanical Canvas2D: 3 horizontal bands, autoscale each band to its max over `count`, `moveTo/lineTo` the ring buffer in chronological order (`(head + k) % CAP`). Keep it under ~60 lines.

- [ ] **Step 2: Verify build** — `pnpm typecheck && pnpm build`.

- [ ] **Step 3: Commit**

```bash
git add src/app/telemetry.ts
git commit -m "feat(M2.15): Canvas2D telemetry dashboard (population/energy/diversity)"
```

---

### Task 16: Click-to-inspect

**Files:**
- Create: `src/app/inspect.ts`

> Click the canvas → convert to world space → linear-scan the live set for the nearest cell (toroidal distance) → show type/energy/age/position in a panel. Linear scan is fine (one-off per click).

- [ ] **Step 1: Implement** — `src/app/inspect.ts`

```ts
import { type World } from '../core/sim/world';
import { type Camera } from '../render/webgl-renderer';
import { wrapDelta } from '../core/math/vec2';

const NAMES = ['PHOTO', 'DIGESTIVE', 'MEAT'];

/** Pick the nearest live cell to a screen click and render its details. */
export function inspectAt(
  world: World, camera: Camera, screenX: number, screenY: number,
  viewW: number, viewH: number, panel: HTMLElement,
): void {
  const wx = camera.x + (screenX - viewW / 2) / camera.scale;
  const wy = camera.y + (screenY - viewH / 2) / camera.scale;
  const f = world.cells.fields;
  const live = world.liveIndices;
  let best = -1;
  let bestD2 = Infinity;
  for (let k = 0; k < world.liveCount; k++) {
    const i = live[k]!;
    const dx = wrapDelta(wx - f.posX[i]!, world.config.worldWidth);
    const dy = wrapDelta(wy - f.posY[i]!, world.config.worldHeight);
    const d2 = dx * dx + dy * dy;
    if (d2 < bestD2) { bestD2 = d2; best = i; }
  }
  if (best < 0) { panel.textContent = 'no cells'; return; }
  const t = f.cellType[best]!;
  panel.textContent =
    `#${best} ${NAMES[t] ?? t} | energy ${f.energy[best]!.toFixed(1)} | ` +
    `age ${f.age[best]} | pos ${f.posX[best]!.toFixed(0)},${f.posY[best]!.toFixed(0)}`;
}
```

- [ ] **Step 2: Verify build** — `pnpm typecheck && pnpm build`.

- [ ] **Step 3: Commit**

```bash
git add src/app/inspect.ts
git commit -m "feat(M2.16): click-to-inspect nearest cell"
```

---

### Task 17: Live economy/light control knobs

**Files:**
- Create: `src/app/controls.ts`

> Bind a curated set of `Config` fields to HTML range inputs that mutate the running `world.config` live (all per-tick read coefficients — no restart needed). Restart-required buffer knobs (`maxCells`, world span, grid dims) are intentionally excluded (§11).

- [ ] **Step 1: Implement** — `src/app/controls.ts`

```ts
import { type Config } from '../core/sim/config';

interface Knob { key: keyof Config; label: string; min: number; max: number; step: number; }

const KNOBS: Knob[] = [
  { key: 'photoGain', label: 'photo gain', min: 0, max: 0.3, step: 0.005 },
  { key: 'photoDepletion', label: 'photo depletion', min: 0, max: 1, step: 0.005 },
  { key: 'digestRate', label: 'digest rate', min: 0, max: 20, step: 0.5 },
  { key: 'digestEfficiency', label: 'digest eff', min: 0, max: 1, step: 0.02 },
  { key: 'basalCost', label: 'basal cost', min: 0, max: 0.5, step: 0.005 },
  { key: 'meatDecay', label: 'meat decay', min: 0, max: 5, step: 0.1 },
  { key: 'divideThreshold', label: 'divide thresh', min: 20, max: 600, step: 5 },
  { key: 'lightRegen', label: 'light regen', min: 0, max: 1, step: 0.01 },
  { key: 'lightDiffuse', label: 'light diffuse', min: 0, max: 0.25, step: 0.005 },
];

/** Build slider rows into `host`, mutating `config` live as they move. */
export function mountControls(host: HTMLElement, config: Config): void {
  for (const k of KNOBS) {
    const row = document.createElement('label');
    row.style.display = 'block';
    const out = document.createElement('span');
    const input = document.createElement('input');
    input.type = 'range';
    input.min = String(k.min); input.max = String(k.max); input.step = String(k.step);
    input.value = String(config[k.key]);
    const render = (): void => { out.textContent = ` ${k.label}: ${config[k.key]}`; };
    input.addEventListener('input', () => {
      (config[k.key] as number) = Number(input.value);
      render();
    });
    render();
    row.append(input, out);
    host.append(row);
  }
}
```

- [ ] **Step 2: Verify build** — `pnpm typecheck && pnpm build`.

- [ ] **Step 3: Commit**

```bash
git add src/app/controls.ts
git commit -m "feat(M2.17): live economy/light control knobs"
```

---

### Task 18: Wire the app — seed life, overlay, dashboard, inspect, knobs, de-streak

**Files:**
- Modify: `src/app/main.ts`, `index.html`, `src/render/webgl-renderer.ts`

- [ ] **Step 1: Add the `prevGen` de-streak param to `render()`** — in `webgl-renderer.ts`, change `render(world, camera, prevX, prevY, alpha)` to `render(world, camera, prevX, prevY, prevGen, alpha)` and draw recycled slots statically (a corpse freed+realloc'd as a child the same tick is in tick-start `liveIndices` with a stale `prevX`, which would streak across the world):

```ts
  render(
    world: World, camera: Camera,
    prevX: Float64Array, prevY: Float64Array, prevGen: Uint32Array, alpha: number,
  ): void {
    // ...
    for (let k = 0; k < n; k++) {
      const i = live[k]!;
      const o = k * 3;
      const same = prevGen[i] === f.generation[i]!; // identity unchanged → interpolate
      data[o] = same ? lerpWrapped(prevX[i]!, f.posX[i]!, alpha, w) : f.posX[i]!;
      data[o + 1] = same ? lerpWrapped(prevY[i]!, f.posY[i]!, alpha, h) : f.posY[i]!;
      data[o + 2] = f.cellType[i]!;
    }
    // ... rest unchanged
  }
```

- [ ] **Step 2: Update `index.html`** — add DOM hosts beside the existing canvas/HUD: a telemetry `<canvas id="telemetry" width="280" height="240">`, an inspect `<div id="inspect">`, and a controls `<div id="controls">`. Style them as small fixed-position semi-transparent panels.

- [ ] **Step 3: Update `src/app/main.ts`:**
  - Replace `world.spawn(100_000)` with `world.seedLife(20_000)` (audit: ~4 photo/patch keeps the producer economy in the breathing regime at 64×64 patches; 100k crashes it).
  - Add `const prevGen = new Uint32Array(config.maxCells);` next to `prevX/prevY`; in `snapshot()` also `prevGen.set(f.generation)`; pass `prevGen` to every `renderer.render(world, camera, prevX, prevY, prevGen, alpha)` call (both the loop and the `.` single-step handler).
  - Construct `new LightOverlay(renderer.gl, world.light)` and a `boolean showLight` toggled by the `L` key. When `showLight`, call `overlay.render(camera, world.light, config.lightMax, canvas.width, canvas.height)` **before** `renderer.render(...)`.
  - Construct `new TelemetryDashboard(document.getElementById('telemetry') as HTMLCanvasElement)`; after each frame's ticks, `dash.push(world.metrics); dash.draw(world.metrics)`.
  - Add a canvas `click` handler → `inspectAt(world, camera, e.clientX, e.clientY, canvas.width, canvas.height, inspectPanel)`. Guard against pan-drags: only inspect if the mouse moved <4px between mousedown and mouseup.
  - `mountControls(document.getElementById('controls') as HTMLElement, config)`.
  - Extend the HUD/keymap help to mention `L` = light overlay, click = inspect.

- [ ] **Step 4: Verify** — `pnpm typecheck && pnpm build` clean; `pnpm dev`, open http://localhost:5173, confirm: cells coloured by type (green/orange/grey), `L` toggles the heatmap, telemetry charts move, clicking shows cell details, sliders change behaviour live, and dividing/recycled cells don't streak.

- [ ] **Step 5: Commit**

```bash
git add src/app/main.ts index.html src/render/webgl-renderer.ts
git commit -m "feat(M2.18): wire app — seed life, overlay, dashboard, inspect, knobs, de-streak"
```

---

### Task 19: Acceptance — full check, headless + smoke gate, live prototype

**Files:**
- Modify: `src/headless/run.ts` (seed life + print metrics + sparse-regime perf log)
- Modify: `src/smoke.test.ts` (real tier-7 visual-smoke assertion)

- [ ] **Step 1: Update the headless runner** — change `world.spawn(100_000)` to `world.seedLife(20_000)`; print `world.metrics` (population, per-type, mean energy, diversity, births/deaths) at the end; and log `ticks/s` so we can confirm `rebuildLive` isn't dominating in the realised (possibly sparse) regime (the deferred-scan caveat).

- [ ] **Step 2: Make the tier-7 smoke test real** — replace the `src/smoke.test.ts` stub with an actual gross-regression guard using the **committed default config** (this is the automated version of the manual eyeball, and it pins the rebalanced economy against future regressions):

```ts
import { describe, it, expect } from 'vitest';
import { World } from './core/sim/world';
import { defaultConfig } from './core/sim/config';

describe('tier-7 visual smoke — the default economy breathes (does not extinct or explode)', () => {
  it('keeps a living, diverse population after 300 ticks on the committed defaults', () => {
    const cfg = defaultConfig({ seed: 1, maxCells: 20_000 });
    const w = new World(cfg, false);
    w.seedLife(5000);
    for (let i = 0; i < 300; i++) w.tick();
    expect(w.cells.aliveCount).toBeGreaterThan(0);            // not extinct (§10 R1)
    expect(w.cells.aliveCount).toBeLessThan(cfg.maxCells);    // not pinned at the quota
    expect(w.metrics.diversity).toBeGreaterThan(0);           // both trophic levels survive
  });
});
```

> If this FAILS (extinction / monoculture / quota-pin), the committed defaults are wrong — tune `config.ts` (`photoGain`, `photoDepletion`, `lightRegen`, `basalCost`, `divideThreshold`, and remember `cellRadius`→area is a lever) until it passes. This is the §10 R1 acceptance gate; do not weaken the assertion to make it pass. Also verify division is self-sustaining: a fed parent and its child (each get `(divideThreshold−divideCost)/2` energy, placed within the same 64-unit patch since there's no movement pre-M3) should both survive the local patch's recovery window — prefer lowering `divideThreshold` over raising `divideJitter` (jitter is ineffective intra-patch pre-M3).

- [ ] **Step 3: Full gate** — `make check` (typecheck + lint + all tests) → GREEN. Confirm the new test files are actually picked up by Vitest (they match `*.test.ts`): `golden-tick`, `recycle`, `invariants`, `metrics`, `light-field`, `metabolism`, `lifecycle`, `types`, `rng` (hashFloat3), `world` (M2 integration), `smoke`. Then `make build` → OK.

- [ ] **Step 4: Headless behaviour** — `pnpm headless`: confirm population changes over the run (not static, not extinct, not pinned at `maxCells`), diversity > 0, and ticks/s is healthy (rebuildLive not dominating).

- [ ] **Step 5: Live prototype capture** — `make dev`, then via the Playwright MCP (headless): navigate http://localhost:5173 (favicon 404 in console is benign), let it run, and capture screenshots / a short GIF showing: cells coloured by type, the light heatmap toggle (`L`), the telemetry dashboard with population rising/falling and diversity, and a click-to-inspect panel. Save artefacts under `docs/superpowers/plans/assets/`.

- [ ] **Step 6: Close beads + commit + STOP for review**

```bash
bd close <epic>.19   # and any still-open M2 children; bd close <epic> if all done
bd sync --flush-only
git add src/headless/run.ts src/smoke.test.ts .beads
git commit -m "feat(M2.19): seed life in headless + tier-7 smoke gate + M2 acceptance"
```

Then **stop at this checkpoint** and show Josh the live prototype (cells living/dying, populations breathing, telemetry) for discussion before merging `m2-metabolism` → `main` (`git checkout main && git merge --ff-only m2-metabolism`).

---

## Self-Review (against the spec)

**Spec coverage:**
- §4.1 patchy/depleting light, diffusion/regen → Tasks 2–3, 10. ✅
- §4.3 tick order + READS/WRITES contract (incl. prey-energy ordering, `generation[]` write, age-before-lifecycle, re-sample) → Task 10 (+ `READS-WRITES.md`). ✅
- §4.5 per-cell energy, photosynthesis (deplete), digestion (efficiency<1), basal cost, death→meat (biomass term), meat decay → Tasks 4–8. Reproduction = clone division (M2 scope; organism-level provisioning deferred to M5/M6, logged as ADR in Task 0). ✅
- §6 tier 1 (unit) → Tasks 1–9; tier 2 golden-tick → Task 11; **tier 3 property/invariant → Task 12b**; tier 4 reproducibility incl. recycle → Task 12; tier 6 zero-alloc preserved → Task 10 step 6; **tier 7 visual smoke → Task 19 step 2**. ✅
- §7 tooling: beads epic + children with deps (Task 0); `make check` gates the new tiers (Task 19 step 3). ✅
- §8 M2 acceptance ("cells live/die by food; populations breathe; telemetry; golden-tick energy test") → Tasks 10–12, 15, 19. ✅
- §10 R1 anti-monoculture: patchy depleting light (Task 2), **rebalanced defaults + automated breathing gate** (Tasks 1, 19), diversity-as-metric (Task 9), all costs as live knobs (Tasks 1, 17), telemetry from M2 (Tasks 15, 19). ✅
- §11 M2 control surface: economy/light knobs (17), telemetry charts (15), light heatmap (14), basic inspect (16), colour-by-type (13). ✅

**Genotypic diversity** (§11) deliberately deferred to M6 (no genomes yet) — labelled, not faked.

**Invariants:** zero-alloc preserved (fixed-arity `hashFloat3`, out-param `lifecycle`, pre-allocated double buffer + `lifecycleResult`; verified Task 10 step 6). Reproducibility incl. `generation[]` (Task 12). `cells/`/`environment/` take scalars, not `Config` (§5.1 DAG). Float32 test discipline (energies at digit 4).

**Type consistency:** `metabolize(live,n,f,hash,light, photoGain,photoDepletion,digestRate,digestEfficiency,basalCost,meatDecay)`; `lifecycle(live,n,store, seed,worldWidth,worldHeight,meatEnergyOnDeath,divideThreshold,divideCost,divideJitter, tick, out)→void`; `sampleMetrics(out,live,n,f,tick,births,deaths)`; `hashFloat3(a,b,c)`; `CellType.{PHOTO,DIGESTIVE,MEAT}`, `isLiving/isEdibleBy`; `LightField.{light,cap,init,sampleAt,depleteAt,patchIndex,step}`; `World.{light,metrics,lifecycleResult,lastBirths,lastDeaths,spawn(n,type),seedLife(n)}`; `Renderer.{gl getter, render(world,camera,prevX,prevY,prevGen,alpha)}` — used consistently across tasks.

**No placeholders** in core tasks (1–12b carry full code). Render/app tasks (13–18) give full code where it's load-bearing (shaders, data layout, handlers, knob list, de-streak) and a concrete mechanical checklist for routine Canvas2D/WebGL boilerplate, per the M1 "renderer/app verified by build + screenshot" precedent.
