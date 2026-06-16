# M3 — Sense + Move Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a motile heterotroph cell that smells a diffusing food field, steers up the gradient with a hardcoded chemotaxis reflex, and thrusts toward food (energy cost ∝ thrust²) — so a single cell visibly climbs a patchy food gradient (spec §8 M3 acceptance).

**Architecture:** Sense and act are built as **two orthogonal tick steps with a clean seam between them** — `SENSE` (step 2) writes a sensor-channel field; `ACT` (step 4) reads it and writes thrust/heading. That seam is exactly where M4's `THINK` (step 3, neural) drops in later (spec §4.3). In M3 a single `MOTILE` cell carries both capabilities because there is no wiring substrate (bonds = M5, neurons = M4) to route a separate sensor cell's reading to a separate mover cell. The capabilities are kept separable (orthogonal SoA fields + separate kernels) so M5+ front-sensor/back-mover morphology is a purely additive change. Smell is the first (and only M3) sensor channel: a coarse food-density field that accumulates edible biomass per patch and diffuses toroidally — sampled by finite-difference exactly like `LightField`. `SENSE` is written generically (scalar field → gradient vector) so light/density/vision are trivial later retargets.

**Tech Stack:** TypeScript 6 strict, Vitest 4 (`--expose-gc` via NODE_OPTIONS), WebGL2, Vite 8, pnpm 11, Node 22. Determinism is an engineered invariant; the hot loop is allocation-free.

---

## Decisions locked with Josh (2026-06-16)

1. **One `MOTILE` cell type for M3**, built on separable sense/act capabilities + steps (the seam M4 plugs into). Not two physically-separate cells — they could not coordinate pre-bond/pre-neural.
2. **Smell only** for M3: a diffusing food-density field, generic gradient sampler. Vision/hearing deferred to M4+ sensor channels.
3. **`MOTILE` is a new type seeded alongside** PHOTO/DIGESTIVE; the tuned M2 economy is untouched. The payoff is a digestive that *seeks* prey — directly hardening the §10 R1 monoculture risk.

## Invariants to preserve (do NOT regress)

- **`World.tick` stays allocation-free.** The `--expose-gc` zero-alloc test ticks 50k cells × 500. Pre-allocate ALL scratch in constructors. No per-tick literals/closures/`.map`. New kernels (`sense`, `act`, `applyThrust`, `FoodField`) allocate nothing per tick. `FoodField` double-buffers like `LightField`.
- **`core/cells` and `core/environment` take SCALAR params, never `Config`.** `World.tick` unpacks `cfg.*` at the call site (matches `computeRepulsion`/`integrate`/`metabolize`). `core/physics` takes raw typed arrays, never `CellArrays`.
- **Determinism:** byte-identical arrays for `(Config, seed)`. Canonical ascending live-slot iteration order. The M3 reflex draws NO RNG (it is a deterministic function of fields), so no new substream is needed; if exploratory wander is added later it must use `rng.split(2)` (light already uses `split(1)`). New SoA fields are deterministic (zero-init; division child inherits/zeros explicitly).
- **`energy` is `Float32Array`.** Assert energies near 100 at `toBeCloseTo(…, 4)` (ulp ≈ 7.6e-6 near 100). Small/exact values may use higher digits.
- **Positions Float64; render downcasts.** Movers move fast — verify the renderer's `prevGen`/NaN-prev de-streak interpolation still looks right (Task 14 capture).
- **Spatial hash is built on pre-integrate positions.** SENSE reads the food field (a grid, not the hash), so it is unaffected. Do NOT add a second `hash.build`. MOTILE digestion reuses the existing post-integrate hash query (same one-tick false-negative-only approximation as DIGESTIVE).

## Tick READS/WRITES additions (apply to `src/core/sim/READS-WRITES.md` in Task 9)

New/changed steps (spec §4.3 order; THINK/step-3 is M4, skipped):

| # | Step | Reads | Writes |
|---|---|---|---|
| 2b | **SENSE** | cellType, posX, posY; food field (previous tick's) | senseX, senseY (MOTILE only) |
| 3 | ~~THINK~~ | — (M4) | — |
| 4 | **ACT** (hardcoded reflex) | cellType, senseX, senseY, heading | heading, thrust (MOTILE only) |
| 5b | **applyThrust** (part of FORCES) | heading, thrust | forceX, forceY (accumulate after repulsion) |
| 7 | METABOLIZE (extended) | + thrust | energy (− moveCost·thrust²); MOTILE digests like DIGESTIVE |
| 9b | **updateFoodField** (part of ENVIRONMENT) | cellType, posX, posY (post-lifecycle live set) | food field (deposit edible biomass, then diffuse + decay) |

Coupling notes (add all three to the file):
- **SENSE reads the PREVIOUS tick's food field** (a one-tick delay): the field is updated at the END of the tick (step 9b), so SENSE at step 2 of tick T reads the field built at the end of tick T−1. Tick 0 reads an all-zero field (no deposit yet) — harmless; the field equilibrates within a few ticks.
- **METABOLIZE charges THIS tick's thrust** (the spec §4.3 "this tick's or last tick's thrust" contract decision): ACT writes `thrust` at step 4 and METABOLIZE reads it at step 7 of the SAME tick; the golden-sense-move test pins this.
- **Position coherence within a tick:** food deposit (step 9b) runs over the SECOND `rebuildLive` set — post-lifecycle (only truly-alive cells, so freed corpses don't emit stale smell) and post-integrate (current positions). This differs from light depletion in METABOLIZE (step 7), which samples the grid at *pre-integrate* positions via the hash built at step 1 — an intentional, documented asymmetry, not a bug.

## File structure

**Create:**
- `src/core/environment/food-field.ts` — coarse diffusing food/smell grid (mirrors `LightField`).
- `src/core/environment/food-field.test.ts`
- `src/core/cells/sense.ts` — SENSE kernel (scalar field → gradient vector into senseX/senseY).
- `src/core/cells/sense.test.ts`
- `src/core/cells/act.ts` — ACT kernel (hardcoded chemotaxis reflex → heading/thrust).
- `src/core/cells/act.test.ts`
- `src/core/physics/thrust.ts` — applyThrust kernel (heading+thrust → force accumulator).
- `src/core/physics/thrust.test.ts`
- `src/render/food-overlay.ts` — gradient heatmap overlay (sibling of `light-overlay.ts`).
- `src/core/sim/golden-sense-move.test.ts` — golden-tick SENSE→ACT→thrust→cost chain.
- `src/core/sim/chemotaxis.test.ts` — headless acceptance proxy (a motile's distance-to-food decreases).

**Modify:**
- `src/core/cells/types.ts` — add `MOTILE`; extend `isLiving`, `isEdibleBy`.
- `src/core/memory/cell-store.ts` — add `heading`, `senseX`, `senseY`, `thrust` to `CellArrays` + `CELL_FIELDS`.
- `src/core/cells/metabolism.ts` — MOTILE digests; charge `moveCost·thrust²`. (+ update the 5 existing `metabolize()` call sites in `metabolism.test.ts`.)
- `src/core/cells/lifecycle.ts` — division child initialises the new fields (REQUIRED — recycled slots carry stale thrust/heading otherwise).
- `src/core/cells/lifecycle.test.ts` — regression: division child has thrust=0 / parent heading after recycling a stale slot.
- `src/core/sim/config.ts` — new knobs + defaults; `initialMotileFraction`.
- `src/core/sim/world.ts` — `FoodField` member; wire SENSE/ACT/thrust/move-cost/PERSISTENT food-update; `seedLife` seeds motiles; `spawn` inits new fields; class/tick JSDoc.
- `src/core/sim/world.test.ts` — seedLife mix assertion now 3-way (the new motile slice).
- `src/core/sim/metrics.ts` — count `motile`; Simpson over 3 living types (ADDITIVE — preserve births/deaths).
- `src/core/sim/metrics.test.ts`, `src/core/sim/golden-tick.test.ts` — keep green (new metric field; M2 golden numbers unchanged for non-movers).
- `src/core/sim/zero-alloc.test.ts` — seed motiles so SENSE/ACT/thrust/food run under the heap assertion + a food-liveness check.
- `src/core/sim/READS-WRITES.md` — the contract above.
- `src/render/webgl-renderer.ts` — MOTILE colour + heading-wedge indicator.
- `src/app/inspect.ts` — `NAMES` array gains `'MOTILE'`.
- `src/app/main.ts` — food overlay toggle (`F`), follow-cam (click to follow, `C`/Esc to release).
- `src/app/controls.ts` — sensor/mover knobs.
- `src/headless/run.ts` — seed motiles; report motile count.

---

## Task 1: `MOTILE` cell type

**Files:**
- Modify: `src/core/cells/types.ts`
- Test: `src/core/cells/types.test.ts`

- [ ] **Step 1: Write the failing test** — append to `src/core/cells/types.test.ts`:

```ts
import { CellType, isLiving, isEdibleBy } from './types';

describe('MOTILE type (M3)', () => {
  it('is a distinct stable index that does not renumber the M2 palette', () => {
    expect(CellType.PHOTO).toBe(0);
    expect(CellType.DIGESTIVE).toBe(1);
    expect(CellType.MEAT).toBe(2);
    expect(CellType.MOTILE).toBe(3);
  });

  it('MOTILE is living (metabolizes + divides)', () => {
    expect(isLiving(CellType.MOTILE)).toBe(true);
    expect(isLiving(CellType.MEAT)).toBe(false);
  });

  it('MOTILE eats PHOTO and MEAT like a digestive; is not itself edible', () => {
    expect(isEdibleBy(CellType.MOTILE, CellType.PHOTO)).toBe(true);
    expect(isEdibleBy(CellType.MOTILE, CellType.MEAT)).toBe(true);
    expect(isEdibleBy(CellType.MOTILE, CellType.MOTILE)).toBe(false);
    expect(isEdibleBy(CellType.DIGESTIVE, CellType.MOTILE)).toBe(false);
  });
});
```

- [ ] **Step 2: Run it — expect FAIL** (`CellType.MOTILE` undefined)

Run: `pnpm vitest run src/core/cells/types.test.ts`

- [ ] **Step 3: Implement** — edit `src/core/cells/types.ts`:

```ts
export const CellType = {
  PHOTO: 0,
  DIGESTIVE: 1,
  MEAT: 2,
  MOTILE: 3,
} as const;

export type CellTypeValue = (typeof CellType)[keyof typeof CellType];

/** True for types that metabolize and can divide (PHOTO, DIGESTIVE, MOTILE). MEAT is dead. */
export function isLiving(type: number): boolean {
  return type === CellType.PHOTO || type === CellType.DIGESTIVE || type === CellType.MOTILE;
}

/** Can `eater` consume `prey`? Heterotrophs (DIGESTIVE, MOTILE) eat PHOTO + MEAT. */
export function isEdibleBy(eater: number, prey: number): boolean {
  return (
    (eater === CellType.DIGESTIVE || eater === CellType.MOTILE) &&
    (prey === CellType.PHOTO || prey === CellType.MEAT)
  );
}
```

- [ ] **Step 4: Run it — expect PASS.** Run: `pnpm vitest run src/core/cells/types.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/core/cells/types.ts src/core/cells/types.test.ts
git commit --no-verify -m "feat(M3): add MOTILE cell type; heterotroph edibility"
```

---

## Task 2: New SoA fields (heading, senseX, senseY, thrust)

**Files:**
- Modify: `src/core/memory/cell-store.ts`
- Test: `src/core/memory/cell-store.test.ts`

- [ ] **Step 1: Write the failing test** — append to `src/core/memory/cell-store.test.ts`:

```ts
import { CellStore } from './cell-store';

describe('M3 SoA fields', () => {
  it('exposes heading/senseX/senseY/thrust as Float32 arrays of capacity length, zero-init', () => {
    const store = new CellStore(4, false);
    const f = store.fields;
    for (const arr of [f.heading, f.senseX, f.senseY, f.thrust]) {
      expect(arr).toBeInstanceOf(Float32Array);
      expect(arr.length).toBe(4);
      expect(arr[0]).toBe(0);
    }
  });
});
```

- [ ] **Step 2: Run it — expect FAIL** (`f.heading` undefined). Run: `pnpm vitest run src/core/memory/cell-store.test.ts`

- [ ] **Step 3: Implement** — in `src/core/memory/cell-store.ts` add the four fields to BOTH `CellArrays` and `CELL_FIELDS` (after `age`, before `flags` — order is arbitrary but keep them grouped):

In `interface CellArrays` add:
```ts
  age: Uint32Array;
  heading: Float32Array;
  senseX: Float32Array;
  senseY: Float32Array;
  thrust: Float32Array;
  flags: Uint8Array;
  generation: Uint32Array;
```

In `CELL_FIELDS` add (matching order):
```ts
  { name: 'age', ctor: Uint32Array },
  { name: 'heading', ctor: Float32Array },
  { name: 'senseX', ctor: Float32Array },
  { name: 'senseY', ctor: Float32Array },
  { name: 'thrust', ctor: Float32Array },
  { name: 'flags', ctor: Uint8Array },
  { name: 'generation', ctor: Uint32Array },
```

- [ ] **Step 4: Run it — expect PASS.** Run: `pnpm vitest run src/core/memory/cell-store.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/core/memory/cell-store.ts src/core/memory/cell-store.test.ts
git commit --no-verify -m "feat(M3): add heading/sense/thrust SoA fields"
```

---

## Task 3: `FoodField` (diffusing smell grid)

**Files:**
- Create: `src/core/environment/food-field.ts`
- Test: `src/core/environment/food-field.test.ts`

- [ ] **Step 1: Write the failing test**:

```ts
import { describe, it, expect } from 'vitest';
import { FoodField } from './food-field';

describe('FoodField', () => {
  it('starts empty and deposits into the patch under a position', () => {
    const food = new FoodField(4, 4, 400, 400); // 100-unit patches
    expect(food.sampleAt(50, 50)).toBe(0);
    food.depositAt(50, 50, 2);
    expect(food.sampleAt(50, 50)).toBe(2);
    expect(food.sampleAt(150, 50)).toBe(0); // different patch untouched
  });

  it('patchW/patchH are world units per patch', () => {
    const food = new FoodField(4, 4, 400, 200);
    expect(food.patchW).toBe(100);
    expect(food.patchH).toBe(50);
  });

  it('step() decays and diffuses toward neighbours (toroidal); mass spreads, decays', () => {
    const food = new FoodField(4, 4, 400, 400);
    food.depositAt(150, 150, 16); // single spike at patch (1,1)
    const before = food.sampleAt(150, 150);
    food.step(0.2, 0.1);
    // spike drops (decay + diffusion out); a neighbour rises from 0.
    expect(food.sampleAt(150, 150)).toBeLessThan(before);
    expect(food.sampleAt(50, 150)).toBeGreaterThan(0); // left neighbour received flux
  });

  it('step() conserves nothing exactly but never goes negative', () => {
    const food = new FoodField(4, 4, 400, 400);
    food.depositAt(50, 50, 5);
    for (let i = 0; i < 50; i++) food.step(0.2, 0.1);
    for (let r = 0; r < 4; r++)
      for (let c = 0; c < 4; c++) expect(food.sampleAt(c * 100 + 50, r * 100 + 50)).toBeGreaterThanOrEqual(0);
  });

  it('a PERSISTENT source builds a multi-patch gradient (the field is NOT cleared per tick)', () => {
    // Mirrors World.tick: re-deposit at the same patch every tick and accumulate (no clear()).
    const food = new FoodField(16, 16, 1600, 1600); // 100-unit patches
    for (let t = 0; t < 300; t++) {
      food.depositAt(800, 800, 4); // centre patch (col 8, row 8)
      food.step(0.22, 0.03);
    }
    const centre = food.sampleAt(800, 800);
    const oneOut = food.sampleAt(900, 800); // +1 patch
    const threeOut = food.sampleAt(1100, 800); // +3 patches
    expect(centre).toBeGreaterThan(oneOut);
    expect(oneOut).toBeGreaterThan(threeOut);
    // Smell reaches >=3 patches → a climbable long-range gradient. If a future edit
    // re-introduces a per-tick clear(), threeOut collapses to 0 and this fails.
    expect(threeOut).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run it — expect FAIL** (no module). Run: `pnpm vitest run src/core/environment/food-field.test.ts`

- [ ] **Step 3: Implement** `src/core/environment/food-field.ts`:

```ts
/**
 * Coarse food/smell grid over the toroidal world (§4.6 "local food/chemical
 * gradient"). Edible cells deposit "smell" into their patch each tick; the field
 * PERSISTS across ticks (it is NOT cleared per tick — exactly like LightField),
 * diffusing toroidally and decaying so deposit balances decay into an equilibrium
 * proportional to local food density — a smooth, long-range gradient motile cells
 * climb (chemotaxis). A per-tick clear() would collapse the support to ~1 patch
 * and make the gradient unclimbable. Mirrors LightField's stencil; double-buffered
 * and allocation-free after construction.
 */
export class FoodField {
  readonly cols: number;
  readonly rows: number;
  readonly worldWidth: number;
  readonly worldHeight: number;
  readonly invPatchW: number;
  readonly invPatchH: number;
  /** World units per patch column/row (the finite-difference step for gradients). */
  readonly patchW: number;
  readonly patchH: number;

  private a: Float32Array;
  private b: Float32Array; // diffusion double-buffer scratch

  constructor(cols: number, rows: number, worldWidth: number, worldHeight: number) {
    this.cols = cols;
    this.rows = rows;
    this.worldWidth = worldWidth;
    this.worldHeight = worldHeight;
    this.invPatchW = cols / worldWidth;
    this.invPatchH = rows / worldHeight;
    this.patchW = worldWidth / cols;
    this.patchH = worldHeight / rows;
    const n = cols * rows;
    this.a = new Float32Array(n);
    this.b = new Float32Array(n);
  }

  /** Current smell buffer. Do NOT retain across step() — the double buffer swaps. */
  get field(): Float32Array {
    return this.a;
  }

  /** Grid index for a world position (clamped; positions are pre-wrapped). */
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

  /** Add `amount` of smell to the patch under (x, y). */
  depositAt(x: number, y: number, amount: number): void {
    const i = this.patchIndex(x, y);
    this.a[i] = this.a[i]! + amount;
  }

  /**
   * One environment tick: toroidal 5-point diffusion (into scratch) then decay.
   * `diffuse` ∈ [0, 0.25] (4·diffuse < 1 for stability), `decay` ∈ [0, 1).
   */
  step(diffuse: number, decay: number): void {
    const { cols, rows } = this;
    const src = this.a;
    const dst = this.b;
    const keep = 1 - decay;
    for (let r = 0; r < rows; r++) {
      const up = ((r - 1 + rows) % rows) * cols;
      const dn = ((r + 1) % rows) * cols;
      const cur = r * cols;
      for (let c = 0; c < cols; c++) {
        const left = (c - 1 + cols) % cols;
        const right = (c + 1) % cols;
        const v = src[cur + c]!;
        const lap = src[cur + left]! + src[cur + right]! + src[up + c]! + src[dn + c]! - 4 * v;
        const nv = (v + diffuse * lap) * keep;
        dst[cur + c] = nv > 0 ? nv : 0;
      }
    }
    this.a = dst;
    this.b = src;
  }
}
```

- [ ] **Step 4: Run it — expect PASS.** Run: `pnpm vitest run src/core/environment/food-field.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/core/environment/food-field.ts src/core/environment/food-field.test.ts
git commit --no-verify -m "feat(M3): FoodField — diffusing food/smell grid"
```

---

## Task 4: SENSE kernel

**Files:**
- Create: `src/core/cells/sense.ts`
- Test: `src/core/cells/sense.test.ts`

The kernel is generic: scalar field → gradient vector via toroidal central finite-difference, one patch-width apart. Only MOTILE cells (sensor capability) are sensed.

- [ ] **Step 1: Write the failing test**:

```ts
import { describe, it, expect } from 'vitest';
import { CellStore } from '../memory/cell-store';
import { FoodField } from '../environment/food-field';
import { CellType } from './types';
import { sense } from './sense';

describe('sense — food gradient → sensor channel', () => {
  it('writes a gradient pointing toward higher smell (MOTILE only)', () => {
    const store = new CellStore(4, false);
    const f = store.fields;
    const food = new FoodField(8, 8, 800, 800); // 100-unit patches
    // Build a rising ramp in +x: patch column c holds value c.
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) food.field[r * 8 + c] = c;

    const i = store.alloc(); // 0
    f.posX[i] = 350; // patch col 3, mid-patch
    f.posY[i] = 350;
    f.cellType[i] = CellType.MOTILE;

    const j = store.alloc(); // 1 — a PHOTO; must be ignored by SENSE
    f.posX[j] = 350;
    f.posY[j] = 350;
    f.cellType[j] = CellType.PHOTO;

    const live = Uint32Array.from([i, j]);
    sense(live, 2, f, food);

    // central diff one patch (±100 world units → ±1 col): right(col4)=4, left(col2)=2 → gx=2.
    expect(f.senseX[i]).toBeCloseTo(2, 5);
    expect(f.senseY[i]).toBeCloseTo(0, 5); // flat in y
    // PHOTO untouched.
    expect(f.senseX[j]).toBe(0);
  });

  it('wraps toroidally at the world edge', () => {
    const store = new CellStore(2, false);
    const f = store.fields;
    const food = new FoodField(8, 8, 800, 800);
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) food.field[r * 8 + c] = c;
    const i = store.alloc();
    f.posX[i] = 750; // col 7 (rightmost); +100 wraps to col 0
    f.posY[i] = 350;
    f.cellType[i] = CellType.MOTILE;
    sense(Uint32Array.from([i]), 1, f, food);
    // right sample wraps to col0=0, left=col6=6 → gx = 0 - 6 = -6 (no crash, defined).
    expect(f.senseX[i]).toBeCloseTo(-6, 5);
  });
});
```

- [ ] **Step 2: Run it — expect FAIL.** Run: `pnpm vitest run src/core/cells/sense.test.ts`

- [ ] **Step 3: Implement** `src/core/cells/sense.ts`:

```ts
import { type CellArrays } from '../memory/cell-store';
import { type FoodField } from '../environment/food-field';
import { CellType } from './types';
import { wrap } from '../math/vec2';

/**
 * SENSE step (§4.3 step 2). Generic scalar-field → gradient-vector sampler: for
 * each sensor-capable cell (MOTILE), central finite-difference of the food field
 * one patch-width apart (toroidal), written to (senseX, senseY). Reads the food
 * field as updated at the END of the previous tick (documented one-tick coupling).
 * Allocation-free; scalar/array params only (§5.1 DAG); MOTILE-only so it is cheap.
 */
export function sense(live: Uint32Array, n: number, f: CellArrays, food: FoodField): void {
  const hx = food.patchW;
  const hy = food.patchH;
  const w = food.worldWidth;
  const h = food.worldHeight;
  for (let k = 0; k < n; k++) {
    const i = live[k]!;
    if (f.cellType[i]! !== CellType.MOTILE) continue;
    const x = f.posX[i]!;
    const y = f.posY[i]!;
    const gx = food.sampleAt(wrap(x + hx, w), y) - food.sampleAt(wrap(x - hx, w), y);
    const gy = food.sampleAt(x, wrap(y + hy, h)) - food.sampleAt(x, wrap(y - hy, h));
    f.senseX[i] = gx;
    f.senseY[i] = gy;
  }
}
```

- [ ] **Step 4: Run it — expect PASS.** Run: `pnpm vitest run src/core/cells/sense.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/core/cells/sense.ts src/core/cells/sense.test.ts
git commit --no-verify -m "feat(M3): SENSE kernel — food gradient sampler"
```

---

## Task 5: ACT kernel (hardcoded chemotaxis reflex)

**Files:**
- Create: `src/core/cells/act.ts`
- Test: `src/core/cells/act.test.ts`

Reflex: turn `heading` toward the gradient by at most `turnRate` rad/tick; set `thrust = clamp(thrustGain·|grad|, 0, maxThrust)`. Below `senseThreshold` the cell coasts at `cruiseThrust` (deterministic roaming so a cell in a flat zone still explores — no RNG).

- [ ] **Step 1: Write the failing test**:

```ts
import { describe, it, expect } from 'vitest';
import { CellStore } from '../memory/cell-store';
import { CellType } from './types';
import { act } from './act';

describe('act — hardcoded chemotaxis reflex', () => {
  it('turns toward the gradient (capped by turnRate) and sets clamped thrust', () => {
    const store = new CellStore(2, false);
    const f = store.fields;
    const i = store.alloc();
    f.cellType[i] = CellType.MOTILE;
    f.heading[i] = 0; // facing +x
    f.senseX[i] = 0; // gradient points +y (desired heading = +PI/2)
    f.senseY[i] = 3;
    // turnRate 0.1 → heading advances exactly +0.1 toward PI/2; thrust = min(2*3, 5)=5.
    act(Uint32Array.from([i]), 1, f, 0.1, 2, 5, 1e-4, 0);
    expect(f.heading[i]).toBeCloseTo(0.1, 6);
    expect(f.thrust[i]).toBeCloseTo(5, 6);
  });

  it('snaps within turnRate of the target (no overshoot)', () => {
    const store = new CellStore(1, false);
    const f = store.fields;
    const i = store.alloc();
    f.cellType[i] = CellType.MOTILE;
    f.heading[i] = Math.PI / 2 - 0.02; // 0.02 short of the target
    f.senseX[i] = 0;
    f.senseY[i] = 1;
    act(Uint32Array.from([i]), 1, f, 0.1, 1, 10, 1e-4, 0);
    expect(f.heading[i]).toBeCloseTo(Math.PI / 2, 6); // lands exactly, not +0.1 past
    expect(f.thrust[i]).toBeCloseTo(1, 6);
  });

  it('coasts at cruiseThrust with heading held when the gradient is below threshold', () => {
    const store = new CellStore(1, false);
    const f = store.fields;
    const i = store.alloc();
    f.cellType[i] = CellType.MOTILE;
    f.heading[i] = 0.7;
    f.senseX[i] = 0;
    f.senseY[i] = 0;
    act(Uint32Array.from([i]), 1, f, 0.1, 2, 5, 1e-4, 0.5);
    expect(f.heading[i]).toBe(0.7); // unchanged
    expect(f.thrust[i]).toBeCloseTo(0.5, 6);
  });

  it('ignores non-MOTILE cells', () => {
    const store = new CellStore(1, false);
    const f = store.fields;
    const i = store.alloc();
    f.cellType[i] = CellType.DIGESTIVE;
    f.senseX[i] = 5;
    act(Uint32Array.from([i]), 1, f, 0.1, 2, 5, 1e-4, 0.5);
    expect(f.thrust[i]).toBe(0);
  });
});
```

- [ ] **Step 2: Run it — expect FAIL.** Run: `pnpm vitest run src/core/cells/act.test.ts`

- [ ] **Step 3: Implement** `src/core/cells/act.ts`:

```ts
import { type CellArrays } from '../memory/cell-store';
import { CellType } from './types';

const TAU = Math.PI * 2;

/**
 * ACT step (§4.3 step 4) — the hardcoded pre-neural chemotaxis reflex (M4 replaces
 * this with a neuron-cell network at the same seam). For each mover (MOTILE): steer
 * `heading` toward the sensed gradient by at most `turnRate` rad/tick, and set
 * `thrust = clamp(thrustGain·|grad|, 0, maxThrust)`. Below `senseThreshold` the
 * cell coasts at `cruiseThrust` (deterministic roaming so a cell in a flat zone
 * still explores — NO RNG). Allocation-free; scalar/array params only.
 */
export function act(
  live: Uint32Array,
  n: number,
  f: CellArrays,
  turnRate: number,
  thrustGain: number,
  maxThrust: number,
  senseThreshold: number,
  cruiseThrust: number,
): void {
  for (let k = 0; k < n; k++) {
    const i = live[k]!;
    if (f.cellType[i]! !== CellType.MOTILE) continue;
    const gx = f.senseX[i]!;
    const gy = f.senseY[i]!;
    const mag = Math.sqrt(gx * gx + gy * gy);
    if (mag > senseThreshold) {
      const desired = Math.atan2(gy, gx);
      let d = desired - f.heading[i]!;
      // shortest signed angular delta into (-PI, PI]
      while (d > Math.PI) d -= TAU;
      while (d < -Math.PI) d += TAU;
      const step = d > turnRate ? turnRate : d < -turnRate ? -turnRate : d;
      f.heading[i] = f.heading[i]! + step;
      let t = thrustGain * mag;
      if (t > maxThrust) t = maxThrust;
      f.thrust[i] = t;
    } else {
      f.thrust[i] = cruiseThrust;
    }
  }
}
```

- [ ] **Step 4: Run it — expect PASS.** Run: `pnpm vitest run src/core/cells/act.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/core/cells/act.ts src/core/cells/act.test.ts
git commit --no-verify -m "feat(M3): ACT kernel — hardcoded chemotaxis reflex"
```

---

## Task 6: applyThrust force kernel

**Files:**
- Create: `src/core/physics/thrust.ts`
- Test: `src/core/physics/thrust.test.ts`

Physics-layer kernel: takes raw typed arrays (never `CellArrays`), accumulates thrust force along heading into the force accumulator AFTER repulsion.

- [ ] **Step 1: Write the failing test**:

```ts
import { describe, it, expect } from 'vitest';
import { applyThrust } from './thrust';

describe('applyThrust', () => {
  it('adds thrust force along heading onto the existing accumulator', () => {
    const heading = Float32Array.from([0, Math.PI / 2]);
    const thrust = Float32Array.from([4, 2]);
    const forceX = Float32Array.from([1, 0]); // pre-existing repulsion
    const forceY = Float32Array.from([0, 0]);
    applyThrust(Uint32Array.from([0, 1]), 2, heading, thrust, forceX, forceY);
    expect(forceX[0]).toBeCloseTo(1 + 4, 5); // +x thrust accumulates onto the 1
    expect(forceY[0]).toBeCloseTo(0, 5);
    expect(forceX[1]).toBeCloseTo(0, 5);
    expect(forceY[1]).toBeCloseTo(2, 5); // +y thrust
  });

  it('skips cells with zero thrust', () => {
    const heading = Float32Array.from([0]);
    const thrust = Float32Array.from([0]);
    const forceX = Float32Array.from([7]);
    const forceY = Float32Array.from([0]);
    applyThrust(Uint32Array.from([0]), 1, heading, thrust, forceX, forceY);
    expect(forceX[0]).toBe(7); // untouched
  });
});
```

- [ ] **Step 2: Run it — expect FAIL.** Run: `pnpm vitest run src/core/physics/thrust.test.ts`

- [ ] **Step 3: Implement** `src/core/physics/thrust.ts`:

```ts
/**
 * Thrust force (§4.4): each mover applies a force of magnitude `thrust` along its
 * `heading`, accumulated into the force buffer AFTER repulsion (spec §4.3 FORCES =
 * repulsion + … + thrust + drag; drag lives in the integrator's damping). The
 * force passes through the integrator's F/m and damping → a terminal speed.
 * Raw-array, allocation-free; non-movers carry thrust=0 and are skipped.
 */
export function applyThrust(
  live: Uint32Array,
  n: number,
  heading: Float32Array,
  thrust: Float32Array,
  forceX: Float32Array,
  forceY: Float32Array,
): void {
  for (let k = 0; k < n; k++) {
    const i = live[k]!;
    const t = thrust[i]!;
    if (t === 0) continue;
    const a = heading[i]!;
    forceX[i] = forceX[i]! + t * Math.cos(a);
    forceY[i] = forceY[i]! + t * Math.sin(a);
  }
}
```

- [ ] **Step 4: Run it — expect PASS.** Run: `pnpm vitest run src/core/physics/thrust.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/core/physics/thrust.ts src/core/physics/thrust.test.ts
git commit --no-verify -m "feat(M3): applyThrust force kernel"
```

---

## Task 7: metabolism — MOTILE digestion + move cost

**Files:**
- Modify: `src/core/cells/metabolism.ts`
- Test: `src/core/cells/metabolism.test.ts`

MOTILE digests prey exactly like DIGESTIVE (reuse the branch, keyed by the eater's own type), and every living cell pays `moveCost · thrust²` (zero for non-movers, since their thrust is 0).

- [ ] **Step 1: Write the failing test** — append to `src/core/cells/metabolism.test.ts`. The file ALREADY defines `buildHash(store, live, n, w, h, cell)` and imports `CellStore`/`SpatialHash`/`LightField`/`CellType`/`metabolize` at the top — reuse them and mirror the existing inline-setup style. (There is NO `makeOneCell`/`makeTwoCells` helper — do not reference one.)

```ts
describe('metabolism — M3 movement cost & MOTILE digestion', () => {
  it('charges moveCost·thrust² to a moving cell on top of basal', () => {
    const store = new CellStore(8, false);
    const f = store.fields;
    const i = store.alloc();
    f.posX[i] = 500;
    f.posY[i] = 500;
    f.radius[i] = 2; // area 4
    f.mass[i] = 1;
    f.energy[i] = 100;
    f.cellType[i] = CellType.MOTILE;
    f.thrust[i] = 3;
    const live = new Uint32Array([i]);
    const lf = new LightField(16, 16, 1024, 1024);
    lf.cap.fill(0);
    lf.light.fill(0); // no photosynthesis
    const hash = buildHash(store, live, 1, 1024, 1024, 12);
    // photoGain 0, photoDepletion 0, digestRate 7, eff 0.7, basal 0.01, meatDecay 0.5, moveCost 0.02
    metabolize(live, 1, f, hash, lf, 0, 0, 7, 0.7, 0.01, 0.5, 0.02);
    // energy = 100 − basal(0.01·4) − moveCost(0.02·3²) = 100 − 0.04 − 0.18
    expect(f.energy[i]).toBeCloseTo(100 - 0.04 - 0.18, 4);
  });

  it('a MOTILE eats an adjacent PHOTO like a digestive', () => {
    const store = new CellStore(8, false);
    const f = store.fields;
    const a = store.alloc(); // motile — lower slot, eats first
    const b = store.alloc(); // photo prey, adjacent (within ri+rj)
    f.posX[a] = 500;
    f.posY[a] = 500;
    f.radius[a] = 3;
    f.mass[a] = 1;
    f.energy[a] = 100;
    f.cellType[a] = CellType.MOTILE;
    f.thrust[a] = 0;
    f.posX[b] = 503;
    f.posY[b] = 500;
    f.radius[b] = 3;
    f.mass[b] = 1;
    f.energy[b] = 50;
    f.cellType[b] = CellType.PHOTO;
    const live = new Uint32Array([a, b]);
    const lf = new LightField(16, 16, 1024, 1024);
    lf.cap.fill(0);
    lf.light.fill(0); // isolate digestion (prey photosynthesises 0)
    const hash = buildHash(store, live, 2, 1024, 1024, 12);
    metabolize(live, 2, f, hash, lf, 0, 0, 7, 0.7, 0.01, 0.5, 0.02);
    const area = 9;
    // MOTILE extracts min(7,50)=7, keeps 0.7·7=4.9, pays basal 0.01·9, move 0.
    expect(f.energy[a]).toBeCloseTo(100 + 7 * 0.7 - 0.01 * area, 4);
    // PHOTO prey loses the 7 eaten, gains 0 light, then pays its OWN basal 0.01·9.
    expect(f.energy[b]).toBeCloseTo(50 - 7 - 0.01 * area, 4);
  });
});
```

- [ ] **Step 2: Run it — expect FAIL** (metabolize has no `moveCost` param; MOTILE doesn't digest). Run: `pnpm vitest run src/core/cells/metabolism.test.ts`

- [ ] **Step 3: Implement** — edit `src/core/cells/metabolism.ts`:

Add `moveCost: number` as the final parameter:
```ts
  basalCost: number,
  meatDecay: number,
  moveCost: number,
): void {
```

Change the digestion branch guard and the `isEdibleBy` eater argument so MOTILE digests too:
```ts
    } else if (type === CellType.DIGESTIVE || type === CellType.MOTILE) {
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
            if (!isEdibleBy(type, f.cellType[j]!)) continue;
```
(only the two lines marked change: the `else if` guard, and `isEdibleBy(type, …)` instead of `isEdibleBy(CellType.DIGESTIVE, …)`.)

Change the basal-cost line at the end of the loop body to also charge movement:
```ts
    // basal cost for all living cells, plus movement cost ∝ thrust² (0 for non-movers)
    const th = f.thrust[i]!;
    f.energy[i] = f.energy[i]! - basalCost * area - moveCost * th * th;
```

Update the JSDoc to mention MOTILE + move cost.

- [ ] **Step 4: Update ALL existing `metabolize(...)` call sites** so the suite type-checks AND runs correctly. The new `moveCost` param is REQUIRED: `tsc --noEmit` typechecks the test files (tsconfig `include: ['src']`), so a missing arg is a hard `make check` failure; and under vitest's esbuild (which ignores arity) a missing arg makes `moveCost` `undefined` → the new basal line computes `undefined * th * th = NaN` and every existing metabolism assertion fails against NaN.

(a) In `src/core/cells/metabolism.test.ts` there are FIVE existing `metabolize(...)` calls (the photosynthesis test, the two digestion tests, the meat-decay test, the basal-area test). Each currently ends:
```ts
      cfg.basalCost,
      cfg.meatDecay,
    );
```
Append a trailing `0` to each (no movement in these M2 cells, so move cost is 0):
```ts
      cfg.basalCost,
      cfg.meatDecay,
      0, // moveCost — these M2 cells don't move
    );
```

(b) In `src/core/sim/world.ts`, the `metabolize(...)` call — append `0,` as the final arg now (Task 9's wiring replaces it with `cfg.moveCost`):
```ts
      cfg.basalCost,
      cfg.meatDecay,
      0, // moveCost — wired to cfg.moveCost in Task 9
    );
```

- [ ] **Step 5: Run the cells suite AND typecheck — expect PASS.** Run: `pnpm vitest run src/core/cells && pnpm typecheck`
Expected: all metabolism tests green (5 legacy + 2 new), and `tsc --noEmit` clean (no arity error at any call site).

- [ ] **Step 6: Commit**

```bash
git add src/core/cells/metabolism.ts src/core/cells/metabolism.test.ts src/core/sim/world.ts
git commit --no-verify -m "feat(M3): metabolism — MOTILE digestion + moveCost"
```

---

## Task 8: Config knobs + defaults + seedLife

**Files:**
- Modify: `src/core/sim/config.ts`
- Test: `src/core/sim/config.test.ts`

- [ ] **Step 1: Write the failing test** — append to `src/core/sim/config.test.ts`:

```ts
import { defaultConfig } from './config';

describe('M3 config', () => {
  it('exposes food-field + sense/move knobs with sane defaults', () => {
    const c = defaultConfig();
    expect(c.foodGridCols).toBe(32);
    expect(c.foodGridRows).toBe(32);
    expect(c.foodDiffuse).toBeGreaterThan(0);
    expect(c.foodDiffuse).toBeLessThanOrEqual(0.25);
    expect(c.foodDecay).toBeGreaterThanOrEqual(0);
    expect(c.foodDecay).toBeLessThan(1);
    expect(c.maxThrust).toBeGreaterThan(0);
    expect(c.moveCost).toBeGreaterThan(0);
    expect(c.initialMotileFraction).toBeGreaterThanOrEqual(0);
    // photo + motile fractions must leave room for digestives
    expect(c.initialPhotoFraction + c.initialMotileFraction).toBeLessThanOrEqual(1);
  });

  it('round-trips the new fields through serialize/deserialize', () => {
    const c = defaultConfig({ thrustGain: 99, foodDecay: 0.123 });
    const back = JSON.parse(JSON.stringify(c));
    expect(back.thrustGain).toBe(99);
    expect(back.foodDecay).toBe(0.123);
  });
});
```

- [ ] **Step 2: Run it — expect FAIL.** Run: `pnpm vitest run src/core/sim/config.test.ts`

- [ ] **Step 3: Implement** — in `src/core/sim/config.ts`, add to `interface Config` (after the division block):

```ts
  // Food/smell field (chemotaxis gradient, §4.6). Coarse grid like the light field.
  foodGridCols: number;
  foodGridRows: number;
  /** Smell deposited per edible (PHOTO/MEAT) cell per tick. */
  foodDeposit: number;
  /** Toroidal diffusion coefficient per tick, in [0, 0.25] (4·diffuse < 1). */
  foodDiffuse: number;
  /** Fraction of smell lost per tick, in [0, 1). Keeps the field at equilibrium. */
  foodDecay: number;

  // Sensing & movement (§4.4). All live knobs.
  /** Gradient magnitude below which a mover coasts at cruiseThrust instead of steering. */
  senseThreshold: number;
  /** Max radians per tick a mover turns toward the gradient. */
  turnRate: number;
  /** Thrust force per unit gradient magnitude. */
  thrustGain: number;
  /** Thrust force cap. */
  maxThrust: number;
  /** Thrust applied while coasting (no gradient) — deterministic roaming. */
  cruiseThrust: number;
  /** Energy per tick = moveCost · thrust². */
  moveCost: number;
  /** Fraction of initial cells spawned as MOTILE (rest split photo/digestive). */
  initialMotileFraction: number;
```

Add to `defaultConfig` return (after `initialPhotoFraction`):

```ts
    foodGridCols: 64, // 32-unit patches over the 2048 world — fine enough that a prey cluster stands out above background (32² gave a near-uniform, noisy field in the dense regime)
    foodGridRows: 64,
    foodDeposit: 2,
    foodDiffuse: 0.22, // near the 0.25 stability cap (4·diffuse < 1) → long smell range
    foodDecay: 0.03, // PERSISTENT field (NOT cleared per tick): deposit balanced by decay → equilibrium ∝ local food density, diffused into a smooth long-range gradient

    senseThreshold: 1e-4,
    turnRate: 0.25, // ~14°/tick — visibly curves toward food without snapping
    // thrustGain·|grad| must land in the PROPORTIONAL band, not pin at maxThrust. Saturation
    // threshold = maxThrust/thrustGain; with 6/3 = 2, thrust ramps proportionally for the
    // typical |grad| ≈ 0.2–2 and only clamps on the steepest gradients (so the live thrustGain
    // knob actually does something). thrustGain 40/maxThrust 5 would be pure bang-bang.
    thrustGain: 3,
    maxThrust: 6, // terminal speed ≈ 6 world-units/tick (damping 0.5)
    cruiseThrust: 0.5, // gentle roam so a motile in a flat zone explores until it picks up a scent
    moveCost: 0.02, // at maxThrust → ~0.72 energy/tick; affordable once it reaches food
    initialMotileFraction: 0.1,
```

> **Tuning note for Josh:** `thrustGain`, `maxThrust`, `moveCost`, `foodDeposit`, `foodDiffuse`, `foodDecay`, `turnRate`, `cruiseThrust` are starting guesses chosen so thrust is proportional (not saturated) and the smell range spans several patches. They are all exposed as live knobs in Task 17 — sweep headless (Task 13) before committing new defaults, per the [[m2-economy-monoculture]] lesson. **Crucially, the chemotaxis acceptance test (Task 12) runs these DEFAULT food/thrust knobs (overriding only world/grid size + economy isolators), so a green test proves the live demo's default config actually climbs — if it fails, tune these DEFAULTS (never the test's assertion, never by re-diverging the test config).**

- [ ] **Step 4: Run it — expect PASS.** Run: `pnpm vitest run src/core/sim/config.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/core/sim/config.ts src/core/sim/config.test.ts
git commit --no-verify -m "feat(M3): config knobs for food field + sense/move"
```

---

## Task 9: Wire `World.tick` (the full SENSE→ACT→thrust→cost→food chain)

**Files:**
- Modify: `src/core/sim/world.ts`, `src/core/sim/READS-WRITES.md`
- Test: `src/core/sim/golden-sense-move.test.ts` (new)

- [ ] **Step 1: Write the failing golden-tick test** `src/core/sim/golden-sense-move.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { World } from './world';
import { defaultConfig } from './config';
import { CellType } from '../cells/types';

describe('golden tick — SENSE → ACT → thrust → move cost (one MOTILE cell)', () => {
  it('senses the gradient, steers, thrusts, moves, and pays moveCost·thrust²', () => {
    const cfg = defaultConfig({
      maxCells: 4,
      worldWidth: 800,
      worldHeight: 800,
      foodGridCols: 8,
      foodGridRows: 8, // 100-unit patches
      // Freeze everything irrelevant so the chain is closed-form.
      repulsion: 0,
      photoGain: 0,
      basalCost: 0.01,
      moveCost: 0.02,
      divideThreshold: 1e9,
      damping: 0.5,
      dt: 1,
      cellRadius: 2,
      turnRate: 10, // large → heading snaps straight to the gradient this tick
      thrustGain: 1,
      maxThrust: 100, // no clamp
      cruiseThrust: 0,
      senseThreshold: 1e-6,
      // Stop the END-of-tick food update from perturbing the post-tick field we assert nothing about.
      foodDeposit: 0,
      foodDiffuse: 0,
      foodDecay: 0,
      initialMotileFraction: 0,
    });
    const w = new World(cfg, false);
    const f = w.cells.fields;

    // Build a +x ramp in the food field BEFORE ticking: patch col c holds value c.
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) w.food.field[r * 8 + c] = c;

    const i = w.cells.alloc(); // 0
    f.posX[i] = 350; // patch col 3, mid-patch
    f.posY[i] = 350;
    f.radius[i] = 2;
    f.mass[i] = 1;
    f.energy[i] = 100;
    f.cellType[i] = CellType.MOTILE;
    f.heading[i] = 0;
    f.velX[i] = 0;
    f.velY[i] = 0;

    w.tick();

    // SENSE: gx = col4 - col2 = 2, gy = 0. Heading snaps to atan2(0,2)=0 (already 0).
    expect(f.senseX[i]).toBeCloseTo(2, 5);
    expect(f.heading[i]).toBeCloseTo(0, 6);
    // ACT: thrust = thrustGain·|grad| = 1·2 = 2.
    expect(f.thrust[i]).toBeCloseTo(2, 5);
    // INTEGRATE: F=(2,0), m=1, dt=1, damping=0.5 → v=(2*0.5)=1 in x; moved +1 in x.
    expect(f.velX[i]).toBeCloseTo(1, 5);
    expect(f.posX[i]).toBeCloseTo(351, 4);
    // METABOLIZE: energy = 100 − basal(0.01·4) − moveCost(0.02·2²) = 100 − 0.04 − 0.08.
    expect(f.energy[i]).toBeCloseTo(100 - 0.04 - 0.08, 4);
  });
});
```

- [ ] **Step 2: Run it — expect FAIL** (`w.food` undefined; SENSE/ACT/thrust not wired). Run: `pnpm vitest run src/core/sim/golden-sense-move.test.ts`

- [ ] **Step 3: Implement** — edit `src/core/sim/world.ts`:

Imports:
```ts
import { FoodField } from '../environment/food-field';
import { sense } from '../cells/sense';
import { act } from '../cells/act';
import { applyThrust } from '../physics/thrust';
import { isEdibleBy } from '../cells/types';
```

Add a member and construct it (after `this.light = …`):
```ts
  readonly food: FoodField;
```
```ts
    this.food = new FoodField(
      config.foodGridCols,
      config.foodGridRows,
      config.worldWidth,
      config.worldHeight,
    );
```

In `spawn(...)`, initialise the new fields (after `f.age[i] = 0;`):
```ts
      f.heading[i] = 0;
      f.senseX[i] = 0;
      f.senseY[i] = 0;
      f.thrust[i] = 0;
```

**Also initialise the new fields on the OTHER cell-creation path — division — in `src/core/cells/lifecycle.ts`.** This is REQUIRED, not cosmetic: `CellStore.free()` only flips the alive flag and bumps generation — it does NOT zero field data — and the free-list is LIFO, so a division child reusing a just-freed slot inherits the dead occupant's `thrust` (then charged a phantom `moveCost·thrust²`) and `heading` (ACT only *increments* heading, never sets it absolutely, so a stale angle persists and the renderer draws the wedge backwards for a frame). In the Pass-3 division branch, after `f.age[child] = 0;`, add:
```ts
      f.heading[child] = f.heading[i]!; // inherit parent heading (not a garbage recycled angle)
      f.senseX[child] = 0;
      f.senseY[child] = 0;
      f.thrust[child] = 0;
```
Add `src/core/cells/lifecycle.ts` to this task's `git add`.

Rewrite `seedLife`:
```ts
  /** Seed an initial PHOTO/DIGESTIVE/MOTILE mix per the configured fractions. */
  seedLife(n: number): void {
    const photo = Math.round(n * this.config.initialPhotoFraction);
    const motile = Math.round(n * this.config.initialMotileFraction);
    const digestive = Math.max(0, n - photo - motile);
    this.spawn(photo, CellType.PHOTO);
    this.spawn(digestive, CellType.DIGESTIVE);
    this.spawn(motile, CellType.MOTILE);
  }
```

In `tick()`, after `this.hash.build(...)` and BEFORE `computeRepulsion`, insert SENSE + ACT:
```ts
    // Step 2 SENSE → step 4 ACT (step 3 THINK is neural = M4, skipped).
    sense(live, n, f, this.food);
    act(
      live,
      n,
      f,
      cfg.turnRate,
      cfg.thrustGain,
      cfg.maxThrust,
      cfg.senseThreshold,
      cfg.cruiseThrust,
    );
```

After `computeRepulsion(...)` and BEFORE `integrate(...)`, add thrust to the FORCES accumulation:
```ts
    applyThrust(live, n, f.heading, f.thrust, f.forceX, f.forceY);
```

Change the `metabolize(...)` final arg from the Task-7 placeholder `0` to `cfg.moveCost`:
```ts
      cfg.basalCost,
      cfg.meatDecay,
      cfg.moveCost,
    );
```

After `this.light.step(...)` and the SECOND `this.rebuildLive()`, BEFORE `sampleMetrics`, add the food-field update over the post-lifecycle live set:
```ts
    // Step 9 ENVIRONMENT (food): deposit smell from currently-alive edible cells onto
    // the PERSISTENT field (do NOT clear — like LightField), then diffuse + decay so
    // deposit balances decay into an equilibrium ∝ local food density that diffuses
    // into a smooth, long-range gradient. Deposit uses the post-lifecycle live set
    // (only-alive, so freed corpses don't emit stale smell) at post-integrate
    // positions; SENSE reads this field on the NEXT tick (one-tick coupling).
    // CRITICAL: NO `this.food.clear()` here — clearing per tick collapses the smell
    // support to ~1 patch and the chemotaxis acceptance test (Task 12) cannot pass.
    const food = this.food;
    const dep = cfg.foodDeposit;
    for (let k = 0; k < this.liveCount; k++) {
      const idx = this.liveIndices[k]!;
      const t = f.cellType[idx]!;
      if (isEdibleBy(CellType.MOTILE, t)) food.depositAt(f.posX[idx]!, f.posY[idx]!, dep);
    }
    food.step(cfg.foodDiffuse, cfg.foodDecay);
```

> Note: the second `rebuildLive()` already ran above (M2 ordering: `light.step` → `rebuildLive` → `sampleMetrics`). Insert the food block between that `rebuildLive()` and `sampleMetrics(...)`. Do NOT add a third rebuild.

Update the class JSDoc tick summary to include sense/act/thrust/food.

- [ ] **Step 4: Run it — expect PASS.** Run: `pnpm vitest run src/core/sim/golden-sense-move.test.ts`

- [ ] **Step 5: Update `src/core/sim/READS-WRITES.md`** with the rows from the "Tick READS/WRITES additions" section at the top of this plan (SENSE 2b, ACT 4, applyThrust 5b, metabolize move-cost, updateFoodField 9b) and the coupling note.

- [ ] **Step 6: Fix the existing `world.test.ts` seedLife assertion** — the default `initialMotileFraction: 0.1` changes the seed mix, so the M2 test `'seeds a PHOTO/DIGESTIVE mix by initialPhotoFraction'` (world.test.ts:83-95, which seeds 1000 at `initialPhotoFraction: 0.8` and asserts `dig === 200`) now produces `dig = 1000 − 800 − 100 = 100`. Update it to assert the 3-way split (count MOTILE too):
```ts
    let photo = 0;
    let dig = 0;
    let motile = 0;
    for (let i = 0; i < w.cells.capacity; i++) {
      if (!w.cells.isAlive(i)) continue;
      if (w.cells.fields.cellType[i] === CellType.PHOTO) photo++;
      else if (w.cells.fields.cellType[i] === CellType.DIGESTIVE) dig++;
      else if (w.cells.fields.cellType[i] === CellType.MOTILE) motile++;
    }
    expect(photo).toBe(800);
    expect(dig).toBe(100); // 1000 − 800 photo − 100 motile
    expect(motile).toBe(100); // initialMotileFraction 0.1
```

- [ ] **Step 7: Add a lifecycle regression test** that a division child does NOT inherit a recycled slot's stale `thrust` — append to `src/core/cells/lifecycle.test.ts` (mirror its existing setup):
```ts
import { CellType } from './types';
// reuse the file's existing CellStore import + lifecycle() call pattern.

it('a division child does not inherit a recycled slot\'s stale thrust/heading', () => {
  const store = new CellStore(8, false);
  const f = store.fields;
  const corpse = store.alloc(); // slot 0 — will decay & free this tick
  const parent = store.alloc(); // slot 1 — will divide this tick
  f.cellType[corpse] = CellType.MEAT;
  f.energy[corpse] = 0; // ≤0 MEAT → freed in pass 2
  f.mass[corpse] = 1;
  f.thrust[corpse] = 9; // STALE value the LIFO free-list would hand to the child
  f.heading[corpse] = 2.5;
  f.cellType[parent] = CellType.MOTILE;
  f.energy[parent] = 1000;
  f.mass[parent] = 1;
  f.radius[parent] = 6;
  f.posX[parent] = 100;
  f.posY[parent] = 100;
  f.heading[parent] = 0.5;
  const live = new Uint32Array([corpse, parent]);
  const out = { births: 0, deaths: 0 };
  lifecycle(live, 2, store, 1, 256, 256, 30, 100 /*divideThreshold*/, 10, 6, 0, out);
  // The child recycles slot 0 (LIFO). It must carry thrust=0 and the PARENT's heading,
  // not the corpse's stale 9 / 2.5.
  expect(f.thrust[0]).toBe(0);
  expect(f.heading[0]).toBeCloseTo(0.5, 6);
});
```
> Run `pnpm vitest run src/core/cells/lifecycle.test.ts` and confirm it FAILS before the Step-3 lifecycle edit, PASSES after.

- [ ] **Step 8: Update the `World` class JSDoc + `tick()` doc-comment** (world.ts:13-19, 120-123) so the enumerated pipeline lists the new SENSE → (THINK=M4) → ACT → …thrust… → food-update steps — don't leave the orchestrator's own docs describing the M2-only pipeline.

- [ ] **Step 9: Run the FULL suite + typecheck — expect all green.** The M2 golden-tick test constructs cells via explicit `alloc()` (not `seedLife`), so its numbers are unchanged; `world.test.ts` is fixed in Step 6.

Run: `pnpm vitest run src/core/sim src/core/cells && pnpm typecheck`

- [ ] **Step 10: Commit**

```bash
git add src/core/sim/world.ts src/core/cells/lifecycle.ts src/core/sim/golden-sense-move.test.ts \
        src/core/sim/world.test.ts src/core/cells/lifecycle.test.ts src/core/sim/READS-WRITES.md
git commit --no-verify -m "feat(M3): wire SENSE/ACT/thrust/moveCost/food into World.tick; init division-child fields"
```

---

## Task 10: Determinism + zero-alloc coverage for the M3 path

**Files:**
- Modify: `src/core/sim/zero-alloc.test.ts`, `src/core/sim/reproducibility.test.ts`

- [ ] **Step 1: Exercise motiles under the zero-alloc heap assertion** — in `src/core/sim/zero-alloc.test.ts`, after `w.spawn(50_000);` add a motile cohort so SENSE/ACT/thrust/food all run in the hot loop:

```ts
    w.spawn(50_000);
    w.spawn(2_000, /* CellType.MOTILE */ 3); // exercise SENSE/ACT/thrust/food deposit
```
(Import `CellType` and use `CellType.MOTILE` rather than the literal if the file doesn't already import it.)

Then, after the timed tick loop (before/after the heap assertion), add a liveness check so a silently-dead food path can't pass unnoticed:
```ts
    // The food path must actually run: with motiles + edible cells seeded, the smell
    // field is non-zero somewhere. Guards against a regression that no-ops the deposit.
    expect(w.food.field.some((v) => v > 0)).toBe(true);
```

- [ ] **Step 2: Run it — expect PASS** (heap growth still < 512 KB; the new kernels allocate nothing; food field non-zero). Run: `pnpm vitest run src/core/sim/zero-alloc.test.ts`

- [ ] **Step 3: Confirm reproducibility still holds** — `src/core/sim/reproducibility.test.ts` runs two worlds from the same `(Config, seed)` and asserts byte-identical SoA. If it uses `spawn`/`seedLife`, motiles are now seeded; the new fields are deterministic. If the test seeds only PHOTO, optionally strengthen it to seed a motile fraction so the M3 path is covered. Add (or adjust) so at least one run includes motiles, e.g. construct with `defaultConfig({ initialMotileFraction: 0.1 })` and `seedLife(...)`.

- [ ] **Step 4: Run it — expect PASS.** Run: `pnpm vitest run src/core/sim/reproducibility.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/core/sim/zero-alloc.test.ts src/core/sim/reproducibility.test.ts
git commit --no-verify -m "test(M3): cover sense/move path in zero-alloc + reproducibility"
```

---

## Task 11: Metrics — count MOTILE

**Files:**
- Modify: `src/core/sim/metrics.ts`
- Test: `src/core/sim/metrics.test.ts`

- [ ] **Step 1: Write the failing test** — append to `src/core/sim/metrics.test.ts`. The file already defines `seed(types, energies): { store, live }` and imports `makeMetrics`/`sampleMetrics`/`CellType` — reuse them (there is NO `makeLiveSet` helper):

```ts
describe('metrics — MOTILE (M3)', () => {
  it('counts motiles and includes them in Simpson diversity', () => {
    const { store, live } = seed(
      [CellType.PHOTO, CellType.PHOTO, CellType.DIGESTIVE, CellType.MOTILE],
      [100, 100, 100, 100],
    );
    const m = makeMetrics();
    sampleMetrics(m, live, 4, store.fields, 0, 0, 0);
    expect(m.photo).toBe(2);
    expect(m.digestive).toBe(1);
    expect(m.motile).toBe(1);
    // living = 4; Simpson = 1 − ((2/4)²+(1/4)²+(1/4)²) = 0.625
    expect(m.diversity).toBeCloseTo(0.625, 6);
  });

  it('still passes births/deaths through (must not be dropped by the M3 edit)', () => {
    const { store, live } = seed([CellType.MOTILE], [100]);
    const m = makeMetrics();
    sampleMetrics(m, live, 1, store.fields, 5, 4, 2);
    expect(m.motile).toBe(1);
    expect(m.births).toBe(4);
    expect(m.deaths).toBe(2);
  });
});
```

- [ ] **Step 2: Run it — expect FAIL** (`out.motile` undefined; diversity ignores motile). Run: `pnpm vitest run src/core/sim/metrics.test.ts`

- [ ] **Step 3: Implement** — edit `src/core/sim/metrics.ts` **as an ADDITIVE diff** (do NOT paste a full function body — the real `sampleMetrics` writes `out.births = births; out.deaths = deaths;` as its tail and has `births`/`deaths` params; a verbatim replace would drop them and break the dashboard + headless `lastBirths`/`lastDeaths` and the Step-1 births/deaths test).

Make exactly these changes:
1. Add `motile: number;` to `interface Metrics` (next to `digestive`).
2. Add `motile: 0,` to `makeMetrics()`.
3. In `sampleMetrics`, add `let motile = 0;` next to the other counters.
4. Add the MOTILE branch to the count loop (energy counts toward living mean):
```ts
    } else if (t === CellType.MOTILE) {
      motile++;
      energySum += f.energy[i]!;
    } else if (t === CellType.MEAT) {
```
5. Include motile in `living` and the Simpson sum:
```ts
  const living = photo + digestive + motile;
  let diversity = 0;
  if (living > 0) {
    const pp = photo / living;
    const pd = digestive / living;
    const pm = motile / living;
    diversity = 1 - (pp * pp + pd * pd + pm * pm);
  }
```
6. Add `out.motile = motile;` next to `out.digestive = digestive;`.
7. **PRESERVE** the existing `out.births = births;` and `out.deaths = deaths;` tail and the `births`/`deaths` params unchanged.

- [ ] **Step 4: Run it — expect PASS.** Run: `pnpm vitest run src/core/sim/metrics.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/core/sim/metrics.ts src/core/sim/metrics.test.ts
git commit --no-verify -m "feat(M3): metrics count MOTILE in diversity"
```

---

## Task 12: Chemotaxis acceptance proxy (headless, deterministic)

**Files:**
- Create: `src/core/sim/chemotaxis.test.ts`

This is the spec §8 M3 acceptance criterion made measurable: a single motile cell, dropped away from a food patch, moves UP the gradient — its toroidal distance to the food decreases over N ticks. The visible proof is Task 17; this is the deterministic gate.

- [ ] **Step 1: Write the failing test**:

```ts
import { describe, it, expect } from 'vitest';
import { World } from './world';
import { defaultConfig } from './config';
import { CellType } from '../cells/types';
import { torusDist } from '../math/vec2';

describe('chemotaxis acceptance — a single motile climbs a patchy food gradient', () => {
  it('moves closer to a food source using the DEFAULT food/thrust knobs', () => {
    // Validate the REAL default smell-field + reflex physics. Override ONLY world/grid
    // size (a small torus, so the persistent smell wraps to a nonzero gradient everywhere)
    // and the economy isolators — keep foodDeposit/foodDiffuse/foodDecay/thrustGain/
    // maxThrust/turnRate at their defaultConfig values, so a pass proves the live demo climbs.
    const cfg = defaultConfig({
      maxCells: 64,
      worldWidth: 800,
      worldHeight: 800,
      foodGridCols: 16,
      foodGridRows: 16, // 50-unit patches on the small torus
      repulsion: 0, // isolate chemotaxis from crowding
      divideThreshold: 1e9, // no division
      initialMotileFraction: 0, // we place the single motile by hand
      basalCost: 0, // don't starve during the climb (energy is huge anyway)
      moveCost: 0, // isolate steering from the energy economy
      cruiseThrust: 0, // pure gradient-following; the small torus guarantees a nonzero gradient
    });
    const w = new World(cfg, false);
    const f = w.cells.fields;

    // PHOTO "food" cluster near (430, 400). Its NEARER toroidal copy to the motile is the
    // +x direction (direct ~286 vs wrap ~514), so heading=PI genuinely faces AWAY and the
    // reflex must turn the cell around.
    for (let k = 0; k < 12; k++) {
      const i = w.cells.alloc();
      f.posX[i] = 430 + (k % 4) * 4;
      f.posY[i] = 400 + ((k / 4) | 0) * 4;
      f.radius[i] = cfg.cellRadius;
      f.mass[i] = 1;
      f.energy[i] = 100;
      f.cellType[i] = CellType.PHOTO;
    }
    const m = w.cells.alloc();
    f.posX[m] = 150;
    f.posY[m] = 400;
    f.radius[m] = cfg.cellRadius;
    f.mass[m] = 1;
    f.energy[m] = 1e6; // immortal for the test
    f.cellType[m] = CellType.MOTILE;
    f.heading[m] = Math.PI; // pointing AWAY (−x) from the food's nearer (+x) copy

    const foodX = 436;
    const foodY = 404;
    const d0 = torusDist(f.posX[m]!, f.posY[m]!, foodX, foodY, 800, 800);

    // Let the smell field equilibrate, then the motile climbs.
    for (let t = 0; t < 600; t++) w.tick();

    const d1 = torusDist(f.posX[m]!, f.posY[m]!, foodX, foodY, 800, 800);
    expect(d1).toBeLessThan(d0 - 100); // climbed a clear, substantial distance up-gradient
  });
});
```

- [ ] **Step 2: Run it.** Run: `pnpm vitest run src/core/sim/chemotaxis.test.ts`

If it FAILS because the motile doesn't move far enough, this is real tuning signal, not a test bug. Because the test now reads the DEFAULT food/thrust knobs, the fix is to tune the **defaults in `config.ts` (Task 8)** — `foodDeposit`/`foodDiffuse`/`foodDecay` (smell strength + range), `thrustGain`/`maxThrust` (kept in the proportional band, not bang-bang), `turnRate` — re-running until the motile reliably climbs. Do NOT weaken the assertion, and do NOT make the test config diverge from defaults to force a pass (that would prove nothing about the live demo). The auditor's trajectory sim confirms the climb is real once the field accumulates (clear() removed): d₀≈297 → d₁≈41. A motile that can't climb on default knobs is a failed M3.

- [ ] **Step 3: Commit**

```bash
git add src/core/sim/chemotaxis.test.ts
git commit --no-verify -m "test(M3): chemotaxis acceptance proxy — motile climbs food gradient"
```

- [ ] **Step 4: Run `make check` — full green gate.**

Run: `make check`
Expected: typecheck + lint + all tests pass (was 83; now ~95+).

---

## Task 13: Headless report — surface motiles

**Files:**
- Modify: `src/headless/run.ts`

- [ ] **Step 1: Seed motiles and report them.** Edit `src/headless/run.ts`:

Change the world to seed the M3 mix (seedLife already does this once `initialMotileFraction` is set in defaults):
```ts
const world = new World(defaultConfig({ seed: 1, maxCells: 60_000 }));
world.seedLife(20_000);
```
(unchanged — `seedLife` now seeds motiles automatically).

Add a motile line to the population report:
```ts
console.log(
  `population:    ${m.population}  (photo ${m.photo}, digestive ${m.digestive}, motile ${m.motile}, meat ${m.meat})`,
);
```

- [ ] **Step 2: Run it — eyeball the regime.** Run: `pnpm headless`
Expected: a population that breathes, `motile > 0` sustained, `diversity > 0`. If motiles go extinct fast, note it — this is the headless sweep surface for tuning `moveCost`/`thrustGain`/`foodDeposit` before the live demo. Record findings; tune `defaultConfig` if a clearly better regime is found (keep the chemotaxis + diversity gates honest).

- [ ] **Step 3: Commit**

```bash
git add src/headless/run.ts
git commit --no-verify -m "feat(M3): headless report surfaces motile count"
```

---

## Task 14: Renderer — MOTILE colour + heading indicator

**Files:**
- Modify: `src/render/webgl-renderer.ts`

The interleaved vertex data grows from 3 floats `[x, y, type]` to 4 `[x, y, type, heading]`. The fragment shader draws a direction notch (triangle pointing along heading) for MOTILE, a disc for everything else.

- [ ] **Step 1: Update the shaders.** In `src/render/webgl-renderer.ts`:

VERT — add a heading attribute and pass it through:
```glsl
layout(location=0) in vec2 a_pos;
layout(location=1) in float a_type;
layout(location=2) in float a_heading;
uniform vec2 u_offset;
uniform float u_scale;
uniform vec2 u_res;
uniform float u_point;
out float v_type;
out float v_heading;
void main() {
  vec2 screen = (a_pos - u_offset) * u_scale;
  vec2 clip = screen / (u_res * 0.5);
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
  gl_PointSize = clamp(u_point * u_scale, 1.0, 64.0);
  v_type = a_type;
  v_heading = a_heading;
}
```

FRAG — MOTILE (v_type ≈ 3) drawn as a forward-pointing wedge; others as discs. Note screen-space y is flipped (clip.y negated), so rotate by `+heading` with a y-flip baked in:
```glsl
#version 300 es
precision mediump float;
in float v_type;
in float v_heading;
out vec4 frag;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  if (v_type > 2.5) {                       // MOTILE — directional wedge
    // rotate point-coord into heading frame (screen y is down → flip sin)
    float s = sin(-v_heading), co = cos(-v_heading);
    vec2 d = vec2(co * c.x - s * c.y, s * c.x + co * c.y);
    // a triangle pointing +x: inside if behind the tip plane and within the body.
    // Base kept inside the rotated point-sprite extent: |d| max at the base corner
    // (d.x=-0.35, |d.y|=0.5575) = 0.658 < 0.707 (=0.5·√2), so no corner is clipped.
    if (d.x > 0.45 || d.x < -0.35 || abs(d.y) > (0.40 - d.x * 0.45)) discard;
    frag = vec4(0.30, 0.85, 0.95, 1.0);     // cyan
    return;
  }
  if (dot(c, c) > 0.25) discard;            // disc for the rest
  vec3 col;
  if (v_type < 0.5)       col = vec3(0.30, 0.80, 0.35);  // PHOTO   green
  else if (v_type < 1.5)  col = vec3(0.95, 0.45, 0.20);  // DIGEST  orange-red
  else                    col = vec3(0.55, 0.50, 0.45);  // MEAT    grey-brown
  frag = vec4(col, 1.0);
}
```

- [ ] **Step 2: Update the buffer layout.** Change the data array + attribute pointers:

```ts
  private readonly data: Float32Array; // interleaved [x, y, cellType, heading] per cell
```
In the constructor:
```ts
    this.data = new Float32Array(capacity * 4);
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.data.byteLength, gl.DYNAMIC_DRAW);
    const stride = 4 * 4;
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 1, gl.FLOAT, false, stride, 2 * 4);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 1, gl.FLOAT, false, stride, 3 * 4);
    gl.bindVertexArray(null);
```

- [ ] **Step 3: Update the render loop** to write 4 floats per cell and draw `n * 4`:

```ts
    for (let k = 0; k < n; k++) {
      const i = live[k]!;
      const o = k * 4;
      const px = prevX[i]!;
      const py = prevY[i]!;
      const same = prevGen[i] === f.generation[i]! && !Number.isNaN(px);
      data[o] = same ? lerpWrapped(px, f.posX[i]!, alpha, w) : f.posX[i]!;
      data[o + 1] = same ? lerpWrapped(py, f.posY[i]!, alpha, h) : f.posY[i]!;
      data[o + 2] = f.cellType[i]!;
      data[o + 3] = f.heading[i]!;
    }
    // ...
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, data.subarray(0, n * 4));
    gl.drawArrays(gl.POINTS, 0, n);
```

- [ ] **Step 4: Add the MOTILE label to the inspector.** In `src/app/inspect.ts`, extend the `NAMES` array (line 5) so a clicked motile shows `MOTILE`, not the raw index `3` (it renders `NAMES[t] ?? t`):
```ts
const NAMES = ['PHOTO', 'DIGESTIVE', 'MEAT', 'MOTILE'];
```

- [ ] **Step 5: Verify visually** (no unit test for GL). Run: `make dev`, open http://localhost:5173. Confirm cyan motiles render with a visible forward wedge; PHOTO/DIGEST/MEAT unchanged; clicking a motile shows `MOTILE` in the inspect panel. (A favicon 404 console error is benign.)

- [ ] **Step 6: Commit**

```bash
git add src/render/webgl-renderer.ts src/app/inspect.ts
git commit --no-verify -m "feat(M3): render MOTILE cells with heading indicator + inspector label"
```

---

## Task 15: Gradient overlay (food smell heatmap)

**Files:**
- Create: `src/render/food-overlay.ts`
- Modify: `src/app/main.ts`

A sibling of `light-overlay.ts` reading `world.food.field`, with a distinct colour ramp, toggled with `F`. (Deliberately a near-duplicate rather than refactoring the working `LightOverlay` — lower risk; a `ScalarFieldOverlay` generalisation is a later cleanup if a third field appears.)

- [ ] **Step 1: Create `src/render/food-overlay.ts`** — copy `light-overlay.ts` verbatim, then change: class name `FoodOverlay`; the constructor takes a `FoodField` (`import { type FoodField } from '../core/environment/food-field';`); read `field.field` (not `field.light`) in `render`; FRAG colour ramp to a food palette and a `u_max` driven by a passed scale:

FRAG colour line:
```glsl
  float l = texture(u_light, v_uv).r / max(u_max, 1e-6);
  vec3 col = mix(vec3(0.03, 0.10, 0.03), vec3(0.40, 0.95, 0.45), clamp(l, 0.0, 1.0)); // food = green
  frag = vec4(col, 0.5);
```
In `render(...)` change the upload source:
```ts
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, this.cols, this.rows, gl.RED, gl.FLOAT, field.field);
```
Signature: `render(camera: Camera, field: FoodField, fieldMax: number, width: number, height: number)`. Keep everything else identical to `LightOverlay`.

- [ ] **Step 2: Wire it into `src/app/main.ts`:**

```ts
import { FoodOverlay } from '../render/food-overlay';
```
After the light overlay setup:
```ts
const foodOverlay = new FoodOverlay(renderer.gl, world.food);
let showFood = false;
const FOOD_DISPLAY_MAX = 8; // smell scale for the heatmap; tune to taste
```
In `drawScene`:
```ts
  if (showFood) {
    foodOverlay.render(camera, world.food, FOOD_DISPLAY_MAX, canvas.width, canvas.height);
  }
```
In the `keydown` handler add:
```ts
  } else if (e.key === 'f' || e.key === 'F') {
    showFood = !showFood;
```
Add `F food` to the HUD help line and the `food ${showFood ? 'on' : 'off'}` status.

- [ ] **Step 3: Verify visually.** Run: `make dev`. Press `F` — a green smell heatmap appears, brightest where food clusters, smoothly falling off. Motiles should sit on/move up the bright regions.

- [ ] **Step 4: Commit**

```bash
git add src/render/food-overlay.ts src/app/main.ts
git commit --no-verify -m "feat(M3): food-gradient heatmap overlay (F)"
```

---

## Task 16: Follow-cam

**Files:**
- Modify: `src/app/main.ts`

Click already inspects the nearest cell. Extend it to also lock the camera onto that cell (gen-validated, releases when the cell dies); `C` or `Esc` releases.

- [ ] **Step 1: Add a follow handle + helper in `src/app/main.ts`.** Near the camera setup:

Add the import `import { wrapDelta } from '../core/math/vec2';` at the top of `main.ts` (if not already present), then:
```ts
let followId = -1;
let followGen = 0;

function pickNearest(screenX: number, screenY: number): number {
  const wx = camera.x + (screenX - canvas.width / 2) / camera.scale;
  const wy = camera.y + (screenY - canvas.height / 2) / camera.scale;
  const live = world.liveIndices;
  let best = -1;
  let bestD2 = Infinity;
  for (let k = 0; k < world.liveCount; k++) {
    const i = live[k]!;
    // Toroidal nearest — matches inspectAt (inspect.ts), so follow + inspect never disagree.
    const dx = wrapDelta(wx - f.posX[i]!, world.config.worldWidth);
    const dy = wrapDelta(wy - f.posY[i]!, world.config.worldHeight);
    const d2 = dx * dx + dy * dy;
    if (d2 < bestD2) {
      bestD2 = d2;
      best = i;
    }
  }
  return best;
}
```

- [ ] **Step 2: Set the follow target on click.** In the `mouseup` handler, where it currently calls `inspectAt(...)` for a <4px click, also set the follow target:

```ts
    if (moved < 4) {
      inspectAt(world, camera, e.clientX, e.clientY, canvas.width, canvas.height, inspectPanel);
      const id = pickNearest(e.clientX, e.clientY);
      if (id >= 0) {
        followId = id;
        followGen = f.generation[id]!;
      }
    }
```

- [ ] **Step 3: Release on `C`/Escape.** In the `keydown` handler:

```ts
  } else if (e.key === 'c' || e.key === 'C' || e.key === 'Escape') {
    followId = -1;
```

- [ ] **Step 4: Drive the camera each frame.** In `drawScene` (or at the top of `loop` before `drawScene`), before drawing, snap the camera to the followed cell if still alive at the same generation:

```ts
function updateFollowCam(): void {
  if (followId < 0) return;
  if (!world.cells.isAlive(followId) || f.generation[followId]! !== followGen) {
    followId = -1;
    return;
  }
  camera.x = f.posX[followId]!;
  camera.y = f.posY[followId]!;
}
```
Call `updateFollowCam();` at the start of `drawScene(alpha)`.

Add `C follow` / `click follow` to the HUD help line; show `follow #${followId}` when active.

- [ ] **Step 5: Verify visually.** Run: `make dev`. Click a cyan motile — camera locks and tracks it climbing toward food; press `C` to release; it auto-releases when the cell dies.

- [ ] **Step 6: Commit**

```bash
git add src/app/main.ts
git commit --no-verify -m "feat(M3): follow-cam locks to a clicked cell"
```

---

## Task 17: Sensor/mover knobs

**Files:**
- Modify: `src/app/controls.ts`

- [ ] **Step 1: Add the M3 knobs.** In `src/core/.../controls.ts` `KNOBS` array, append:

```ts
  { key: 'thrustGain', label: 'thrust gain', min: 0, max: 200, step: 1 },
  { key: 'maxThrust', label: 'max thrust', min: 0, max: 20, step: 0.5 },
  { key: 'turnRate', label: 'turn rate', min: 0, max: 1, step: 0.01 },
  { key: 'cruiseThrust', label: 'cruise thrust', min: 0, max: 5, step: 0.1 },
  { key: 'moveCost', label: 'move cost', min: 0, max: 0.2, step: 0.002 },
  { key: 'foodDeposit', label: 'food deposit', min: 0, max: 10, step: 0.5 },
  { key: 'foodDiffuse', label: 'food diffuse', min: 0, max: 0.25, step: 0.005 },
  { key: 'foodDecay', label: 'food decay', min: 0, max: 0.5, step: 0.005 },
```

These are all live `Config` fields read fresh each tick by `World.tick`, so they retune the running sim with no restart (the food grid size itself is restart-required and stays out of the panel).

- [ ] **Step 2: Verify.** Run: `make dev`. Move `thrust gain` / `food diffuse` — motile behaviour changes live (faster seeking, wider smell). Crank `move cost` — motiles starve unless they reach food.

- [ ] **Step 3: Commit**

```bash
git add src/app/controls.ts
git commit --no-verify -m "feat(M3): live sensor/mover/food knobs"
```

---

## Task 18: Live prototype capture (CHECKPOINT — stop for Josh)

**Files:** none (artefacts only)

- [ ] **Step 1: Full gate.** Run: `make check` — expect all green.

- [ ] **Step 2: Run the app.** `make dev` → http://localhost:5173.

- [ ] **Step 3: Capture the acceptance demo via the Playwright MCP** (headless; favicon 404 is benign):
  - Navigate to the app; let it run a few hundred ticks so the smell field equilibrates.
  - Press `F` (food overlay on) and confirm the green gradient.
  - Click a cyan motile to engage follow-cam; optionally `setSpeed` up via `window.sim.setSpeed(4)`.
  - Capture: (a) a screenshot of a motile in/climbing the gradient with the overlay + heading wedge visible; (b) a short GIF of a motile visibly moving UP the gradient toward a food cluster; (c) the telemetry dashboard showing `motile > 0` and sustained `diversity`.

- [ ] **Step 4: Record a concrete pass criterion** (not just eyeballing). Both must hold:
  1. **Deterministic gate:** `make check` is green — which includes the Task 12 chemotaxis test proving a default-config motile reduces its distance-to-food by >100 units.
  2. **Visible gate:** in the captured GIF the followed motile's net displacement is toward the bright food patch. Make it measurable with a console probe, e.g. evaluate over ~200 frames and confirm the printed distance trends down:
```js
// in the page console / via Playwright evaluate — picks the nearest motile to a food patch and logs its distance
const w = window.sim.world, f = w.cells.fields;
// (log torus-distance of a chosen motile slot to a chosen food patch each second; confirm it decreases)
```
  Note in the summary the start/end distance observed.

- [ ] **Step 5: STOP.** Present the artefacts + the recorded criterion and a one-line summary (`make check` test count, headless regime with sustained `motile > 0`, the measured climb start→end distance) for Josh to review BEFORE any merge. Do not merge in this task.

---

## Task 19: Merge (only after Josh approves the prototype)

- [ ] **Step 1:** Ensure `make check` is green and the working tree is clean (`bd sync --flush-only` first so beads state is exported).
- [ ] **Step 2:** Fast-forward merge to `main` without a dev-server worktree flicker:
```bash
git push . m3-sense-move:main
git checkout main
```
- [ ] **Step 3:** Update memory (`life-sim-design.md` "Current status" → M3 complete; tuned regime; new test count) and `docs/decisions/INDEX.md` if any decision was logged.

---

## Self-review (run before execution)

- **Spec coverage:** §4.3 SENSE(2)/ACT(4) steps + seam for THINK(3) — Tasks 4,5,9. §4.4 thrust force + energy cost ∝ thrust² — Tasks 6,7. §4.6 food/chemical gradient as first sensor channel, generic sampler — Tasks 3,4. §8 M3 acceptance (single cell climbs a patchy food gradient) — Task 12 (deterministic proxy) + Task 18 (visible). §11 M3 control surface (gradient overlay + follow-cam + sensor/mover knobs) — Tasks 15,16,17. §10 R1 (motile digestive seeks prey → hardens monoculture risk) — Tasks 1,7,13. READS/WRITES contract extended — Task 9. Golden-tick + zero-alloc + reproducibility discipline — Tasks 9,10. Determinism (no RNG in reflex) — Task 5.
- **Placeholder scan:** every code step carries real code; the only "factor a helper from the existing test scaffold" notes (Tasks 7,11) reference real existing setup in those files — flagged explicitly, not hand-waved.
- **Type/name consistency:** field names `heading/senseX/senseY/thrust` identical across cell-store, sense, act, thrust, metabolize, renderer. Kernel signatures: `sense(live,n,f,food)`, `act(live,n,f,turnRate,thrustGain,maxThrust,senseThreshold,cruiseThrust)`, `applyThrust(live,n,heading,thrust,forceX,forceY)`, `metabolize(...,basalCost,meatDecay,moveCost)`. Config keys match between Task 8 (definition) and Tasks 9/17 (use). `CellType.MOTILE = 3` used consistently (renderer `v_type > 2.5`).
- **Risk to watch:** the `thrustGain/maxThrust/foodDiffuse/moveCost` defaults are guesses — Task 12 validates them (it now runs the DEFAULT food/thrust knobs, overriding only world/grid + economy isolators, so a pass proves the live demo climbs) and Task 13 sweeps headless; the acceptance assertion stays fixed while the *defaults* are tuned, never the reverse.

## Adversarial audit remediations (2026-06-16)

A multi-agent audit (10 lenses × 3 skeptics, grounded in the real source) confirmed 22 findings; all are folded in above. The load-bearing fixes:
- **BLOCKER — food field was memoryless:** removed the per-tick `this.food.clear()`; the field now PERSISTS and decays like `LightField` (a per-tick clear collapses the smell to ~1 patch and the gradient is unclimbable). Locked by a Task 3 multi-patch-spread test. (Auditor's sim: with clear removed, the motile climbs d₀≈297→d₁≈41.)
- **BLOCKER — `metabolize()` new required param broke 5 existing call sites** (`tsc` fails + NaN under vitest): Task 7 now updates all 5 `metabolism.test.ts` calls + the world.ts call.
- **BLOCKER — metrics edit dropped `births`/`deaths`:** Task 11 is now an explicit ADDITIVE diff preserving the tail + params, with a regression test.
- **MAJOR — division child never initialised the new SoA fields** (stale recycled-slot thrust/heading): Task 9 now edits `lifecycle.ts` + a regression test.
- **MAJOR — `seedLife` broke `world.test.ts`'s digestive-count assertion:** Task 9 updates it to the 3-way split.
- **MAJOR — invented test helpers** (`makeOneCell`/`makeLiveSet` don't exist): Tasks 7/11 now use the real `buildHash` / `seed(types, energies)` scaffolds.
- **MAJOR — bang-bang thrust + test-config divergence:** defaults retuned to a proportional band (thrustGain 3 / maxThrust 6); Task 12 runs default knobs so it actually gates the demo.
- Minors: inspect `NAMES`, toroidal `pickNearest`, wedge-shader extent, food-grid resolution, same-tick-thrust + position-coherence READS/WRITES notes, food-liveness assertion, World JSDoc, recorded Task-18 pass criterion.
