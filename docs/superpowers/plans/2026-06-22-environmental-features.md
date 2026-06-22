# Environmental Features (Walls + Flow + Env Sensing) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add indestructible walls, a vector flow field that drifts food, and evolvable+learnable wall/flow brain inputs, so spatial structure produces emergent niches (hiding, ambush, flow-riding).

**Architecture:** Two new env grids parallel to `FoodField`: a **fine** `Walls` occupancy grid (collision + vision occlusion + neural wall-sense, with derived food-resolution `foodBlocked` + fine `prox` distance masks) and a food-resolution `FlowField` (divergence-free current). Walls dam food (no-flux diffuse + advect); flow advects biomass (conservative donor-cell) and optionally pushes creatures (size-scaled). Every brain gains wall-sense + flow-sense inputs (gated RNG draws keep the all-off state byte-identical). All generation uses a standalone `config.seed`-derived `Rng` (zero impact on the organism RNG stream).

**Tech Stack:** TypeScript (strict), Vitest, WebGL2 (renderer), the existing SoA core (`src/core/`).

**Spec:** `docs/superpowers/specs/2026-06-22-environmental-features-design.md`

## Global Constraints

- **Determinism contract:** Float64 kinematics only; ascending live-slot iteration; `world.rng` consumed ONLY at organism seeding + reproduction. Wall/flow generation MUST use a **separate `Rng` instance** seeded from `config.seed` (never `world.rng`). Static walls/flow are NOT added to `stateHash`.
- **Ablation gate:** every new system has an off-switch whose OFF value is **byte-identical** to the pre-feature engine. OFF values: `wallRegionCount=0`, `flowStrength=0`, `flowPushStrength=0`. New brain-gene RNG draws are gated on **seed-time** feature flags (captured at `World` construction) so toggling live knobs never changes genome draw counts.
- **Hot loops are allocation-free** (reuse scratch buffers; no per-tick closures in kernels).
- **Tests:** Vitest, colocated `*.test.ts`. Run a single test with `pnpm test -- <path>`; full gate is `make check` (typecheck + lint + test).
- **No comments/types on code you didn't change.** Match surrounding style. Commit after every green task.
- **Toroidal everywhere:** use `wrapDelta` for shortest signed deltas, modulo for wrapping. The fine wall grid, food grid, and flow grid all wrap.

## Shared Interfaces (the contract every task composes against)

```ts
// core/walls.ts
export class Walls {
  constructor(worldWidth: number, worldHeight: number, cols: number, rows: number, cfg: Config);
  readonly cols: number;          // FINE grid columns (config.wallCols)
  readonly rows: number;          // FINE grid rows
  readonly foodCols: number;      // = config.foodCols (derived-mask resolution)
  readonly foodRows: number;      // = config.foodRows
  get active(): boolean;          // true when cfg.wallRegionCount > 0
  isSolidAt(x: number, y: number): boolean;
  losBlocked(x0: number, y0: number, x1: number, y1: number): boolean;
  isFoodCellBlocked(foodCol: number, foodRow: number): boolean;
  foodBlockedMask(): Uint8Array;  // length foodCols*foodRows (1 = dammed), row-major
  proxGradAt(x: number, y: number, step: number): { gx: number; gy: number };
  fillTexture(out: Uint8Array): void; // length cols*rows, 0/255
}

// core/flow-field.ts
export class FlowField {
  constructor(worldWidth: number, worldHeight: number, cols: number, rows: number, cfg: Config);
  readonly cols: number;          // = config.foodCols
  readonly rows: number;          // = config.foodRows
  readonly flowX: Float64Array;   // per cell (cols*rows), world-units/tick
  readonly flowY: Float64Array;
  sampleX(x: number, y: number): number;
  sampleY(x: number, y: number): number;
}

// core/sense.ts (new export)
export function senseEnv(store: OrganismStore, walls: Walls | null, flow: FlowField | null, cfg: Config): void;

// core/physics.ts (signature change + new export)
export function integrate(store, dt, damping, stabilityClamp, worldWidth, worldHeight, refSize, sizeSpeedExp, walls: Walls | null): void;
export function applyFlowForce(store: OrganismStore, flow: FlowField, cfg: Config): void;

// core/food-field.ts (signature change)
step(regen: number, diffuse: number, flow: FlowField | null, blocked: Uint8Array | null): void;

// core/genome.ts (signature change — gated env-sense gene draws)
export function seedGenome(brain, hue, slot, rng, founderSigma, wallSenseGenes: boolean, flowSenseGenes: boolean): void;
export function mutateGenome(brain, hue, child, parent, rng, sigma, hueSigma, wallSenseGenes: boolean, flowSenseGenes: boolean): void;
```

---

# INCREMENT 1 — Walls grid + noise gen + connectivity + collision + render

### Task 1.1: Config knobs for walls + flow

**Files:**
- Modify: `src/core/config.ts` (interface `Config` + `defaultConfig`)
- Test: `src/core/config.test.ts` (add a case) — or `src/core/world.test.ts` if config has no test file

- [ ] **Step 1: Add knob fields to the `Config` interface.** After the `motorSquash` block (~config.ts:246), before the observation hooks:

```ts
  // ── Walls (env pass 1) ─────────────────────────────────────────────────────
  /** FINE wall-grid resolution (decoupled from the food grid for creature-scale nooks). */
  wallCols: number;
  wallRows: number;
  /** Voronoi biome regions, each carved by one generator. 0 = NO WALLS (off; byte-identical). */
  wallRegionCount: number;
  /** Target solid fraction [0,1] of the carved terrain. */
  wallDensity: number;
  /** Fine cells kept open at a food-pocket centre in pocket-eroding regions. */
  wallPocketCoreRadius: number;
  /** Corridor half-width (fine cells) carved by the connectivity guarantee. */
  wallCorridorRadius: number;
  /** Ablation: walls block line-of-sight (sight occlusion). false = sight ignores walls. */
  wallOccludesVision: boolean;
  /** Central-difference half-step (world units) for the neural wall-proximity gradient. */
  wallSenseRange: number;

  // ── Flow field (env pass 1) ────────────────────────────────────────────────
  /** Advection magnitude (CFL-clamped to ≤0.25 cell/tick). 0 = NO FLOW (off; byte-identical). */
  flowStrength: number;
  /** Streamfunction wavelength in FOOD cells (eddy size). */
  flowScale: number;
  /** Force on creatures from the current. 0 = OFF (default — byte-identical). */
  flowPushStrength: number;
  /** Susceptibility exponent: push ×= (cellRadius/size)^this (big bodies resist). */
  flowPushSizeExp: number;
```

- [ ] **Step 2: Add defaults to `defaultConfig`.** Before `...overrides`:

```ts
    // Walls: 5 biome regions over a 512² fine grid (16u cells), ~35% solid, vision-occluding.
    wallCols: 512,
    wallRows: 512,
    wallRegionCount: 5,
    wallDensity: 0.35,
    wallPocketCoreRadius: 3,
    wallCorridorRadius: 2,
    wallOccludesVision: true,
    wallSenseRange: 24,
    // Flow: gentle divergence-free current that drifts food; creature push OFF by default.
    flowStrength: 0.15,
    flowScale: 18,
    flowPushStrength: 0,
    flowPushSizeExp: 1,
```

- [ ] **Step 3: Write a test asserting the defaults exist and OFF sentinels are present.** Create `src/core/config.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { defaultConfig } from './config';

describe('config — env knobs', () => {
  it('ships wall + flow knobs with sane defaults', () => {
    const c = defaultConfig();
    expect(c.wallCols).toBe(512);
    expect(c.wallRegionCount).toBeGreaterThan(0);
    expect(c.wallDensity).toBeGreaterThan(0);
    expect(c.wallDensity).toBeLessThan(1);
    expect(c.flowPushStrength).toBe(0); // push off by default
  });
  it('exposes the ablation OFF sentinels', () => {
    const c = defaultConfig({ wallRegionCount: 0, flowStrength: 0, flowPushStrength: 0 });
    expect(c.wallRegionCount).toBe(0);
    expect(c.flowStrength).toBe(0);
  });
});
```

- [ ] **Step 4: Run.** `pnpm test -- src/core/config.test.ts` — Expected: PASS.
- [ ] **Step 5: Typecheck.** `pnpm typecheck` — Expected: PASS (the new fields are required; later tasks that touch `Config` literals are already covered by `defaultConfig`).
- [ ] **Step 6: Commit.** `git add src/core/config.ts src/core/config.test.ts && git commit -m "feat(env): add wall + flow config knobs with off-switches"`

---

### Task 1.2: `Walls` class — fine grid, noise generator, connectivity, lookups

**Files:**
- Create: `src/core/walls.ts`
- Test: `src/core/walls.test.ts`

**Interfaces:**
- Consumes: `Config` (config.ts), `Rng` (rng.ts).
- Produces: the `Walls` class per the Shared Interfaces block. (Regions/CA/rooms land in Increment 7; this task ships the noise generator + connectivity + all lookups so every later increment can rely on `Walls`.)

- [ ] **Step 1: Write the failing test.** `src/core/walls.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { Walls } from './walls';
import { defaultConfig } from './config';

const cfg = (o = {}) => defaultConfig({ wallCols: 64, wallRows: 64, foodCols: 16, foodRows: 16, foodPatchCount: 0, ...o });

describe('Walls', () => {
  it('is all-open and inactive when wallRegionCount=0', () => {
    const w = new Walls(1024, 1024, 64, 64, cfg({ wallRegionCount: 0 }));
    expect(w.active).toBe(false);
    let solid = 0;
    for (let y = 0; y < 1024; y += 16) for (let x = 0; x < 1024; x += 16) if (w.isSolidAt(x, y)) solid++;
    expect(solid).toBe(0);
  });

  it('carves roughly the target density when active', () => {
    const w = new Walls(1024, 1024, 64, 64, cfg({ wallRegionCount: 1, wallDensity: 0.35 }));
    expect(w.active).toBe(true);
    let solid = 0;
    const total = 64 * 64;
    for (let r = 0; r < 64; r++) for (let c = 0; c < 64; c++) if (w.isSolidAt(c * 16 + 8, r * 16 + 8)) solid++;
    expect(solid / total).toBeGreaterThan(0.2);
    expect(solid / total).toBeLessThan(0.5);
  });

  it('is deterministic from config.seed', () => {
    const a = new Walls(1024, 1024, 64, 64, cfg({ seed: 9, wallRegionCount: 1 }));
    const b = new Walls(1024, 1024, 64, 64, cfg({ seed: 9, wallRegionCount: 1 }));
    for (let r = 0; r < 64; r++) for (let c = 0; c < 64; c++)
      expect(a.isSolidAt(c * 16 + 8, r * 16 + 8)).toBe(b.isSolidAt(c * 16 + 8, r * 16 + 8));
  });

  it('keeps food pockets reachable from each other (connectivity guarantee)', () => {
    // Two pockets in dead water; after generation a flood-fill of open cells must put both centroids
    // in the SAME connected component.
    const c = defaultConfig({ wallCols: 64, wallRows: 64, foodCols: 16, foodRows: 16, foodPatchCount: 2, foodPatchRadius: 2, foodBaseFertility: 0, wallRegionCount: 1, wallDensity: 0.45, seed: 4 });
    const w = new Walls(1024, 1024, 64, 64, c);
    expect(w.allPocketsConnected()).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify it fails.** `pnpm test -- src/core/walls.test.ts` — Expected: FAIL ("Cannot find module './walls'").

- [ ] **Step 3: Implement `src/core/walls.ts`.**

```ts
import { type Config } from './config';
import { Rng } from './rng';
import { FoodField } from './food-field';

/**
 * Indestructible terrain on a FINE occupancy grid (decoupled from the coarse food grid). Static,
 * config-derived (a separate Rng seeded from config.seed — never world.rng — so the organism stream is
 * untouched and reset() reproduces it). Owns two derived masks: a food-resolution `foodBlocked` (for
 * damming) and a fine `prox` distance-to-wall field (for the smooth neural wall-sense gradient).
 *
 * Increment 1 ships the noise generator + connectivity guarantee. Voronoi regions + CA/rooms land in
 * Increment 7 behind the same `generate()` (this file's public surface does not change).
 */
const SALT = 0x9e3779b9; // decouples the wall RNG substream from any other config.seed use

function wrapDelta(d: number, size: number): number {
  const h = size * 0.5;
  if (d > h) return d - size;
  if (d < -h) return d + size;
  return d;
}
function wrap(v: number, size: number): number {
  const m = v % size;
  return m < 0 ? m + size : m;
}

export class Walls {
  readonly cols: number;
  readonly rows: number;
  readonly foodCols: number;
  readonly foodRows: number;
  private readonly cellW: number;
  private readonly cellH: number;
  private readonly solid: Uint8Array; // fine occupancy, 0 open / 1 solid
  private readonly foodBlocked: Uint8Array; // food-res derived mask, 1 = dammed
  private readonly prox: Float32Array; // fine clamped hop-distance to nearest solid (cells)
  private readonly proxCap: number;
  private readonly _active: boolean;

  constructor(
    private readonly worldWidth: number,
    private readonly worldHeight: number,
    cols: number,
    rows: number,
    cfg: Config,
  ) {
    this.cols = cols;
    this.rows = rows;
    this.foodCols = cfg.foodCols;
    this.foodRows = cfg.foodRows;
    this.cellW = worldWidth / cols;
    this.cellH = worldHeight / rows;
    this.solid = new Uint8Array(cols * rows);
    this.foodBlocked = new Uint8Array(cfg.foodCols * cfg.foodRows);
    this.prox = new Float32Array(cols * rows);
    this.proxCap = Math.max(2, Math.ceil(cfg.wallSenseRange / this.cellW) + 2);
    this._active = cfg.wallRegionCount > 0;
    this.generate(cfg);
  }

  get active(): boolean {
    return this._active;
  }

  private cellIdx(c: number, r: number): number {
    return r * this.cols + c;
  }
  private colOf(x: number): number {
    const c = Math.floor(x / this.cellW);
    return c < 0 ? 0 : c >= this.cols ? this.cols - 1 : c;
  }
  private rowOf(y: number): number {
    const r = Math.floor(y / this.cellH);
    return r < 0 ? 0 : r >= this.rows ? this.rows - 1 : r;
  }

  isSolidAt(x: number, y: number): boolean {
    if (!this._active) return false;
    return this.solid[this.cellIdx(this.colOf(x), this.rowOf(y))] === 1;
  }

  isFoodCellBlocked(foodCol: number, foodRow: number): boolean {
    if (!this._active) return false;
    return this.foodBlocked[foodRow * this.foodCols + foodCol] === 1;
  }
  foodBlockedMask(): Uint8Array {
    return this.foodBlocked;
  }

  /** Toroidal sampled raycast: true if a solid fine cell lies strictly between the two points. */
  losBlocked(x0: number, y0: number, x1: number, y1: number): boolean {
    if (!this._active) return false;
    const dx = wrapDelta(x1 - x0, this.worldWidth);
    const dy = wrapDelta(y1 - y0, this.worldHeight);
    const dist = Math.hypot(dx, dy);
    const steps = Math.ceil(dist / (0.5 * Math.min(this.cellW, this.cellH)));
    for (let s = 1; s < steps; s++) {
      const t = s / steps;
      if (this.isSolidAt(wrap(x0 + dx * t, this.worldWidth), wrap(y0 + dy * t, this.worldHeight)))
        return true;
    }
    return false;
  }

  /** Central difference of the proximity field (points AWAY from walls). Zero when inactive. */
  proxGradAt(x: number, y: number, step: number): { gx: number; gy: number } {
    if (!this._active) return { gx: 0, gy: 0 };
    const inv = 1 / (2 * step);
    const sample = (px: number, py: number): number =>
      this.prox[this.cellIdx(this.colOf(wrap(px, this.worldWidth)), this.rowOf(wrap(py, this.worldHeight)))]!;
    return {
      gx: (sample(x + step, y) - sample(x - step, y)) * inv,
      gy: (sample(x, y + step) - sample(x, y - step)) * inv,
    };
  }

  /** Write the fine grid as 0/255 row-major for the render layer. */
  fillTexture(out: Uint8Array): void {
    for (let i = 0; i < this.solid.length; i++) out[i] = this.solid[i] ? 255 : 0;
  }

  // ── generation ────────────────────────────────────────────────────────────

  private generate(cfg: Config): void {
    if (!this._active) {
      this.deriveMasks(cfg);
      return;
    }
    const rng = new Rng((cfg.seed ^ SALT) >>> 0);
    // Increment 1: a single periodic-noise field over the whole grid (regions arrive in Inc 7).
    this.carveNoise(rng, cfg.wallDensity, cfg.flowScale > 0 ? cfg.flowScale : 12);
    this.openPockets(cfg);
    this.connectPockets(cfg);
    this.deriveMasks(cfg);
  }

  /** Periodic value noise thresholded to ~density solid. Toroidal (lattice indices wrap). */
  private carveNoise(rng: Rng, density: number, wavelengthCells: number): void {
    const { cols, rows } = this;
    const latW = Math.max(2, Math.round(cols / wavelengthCells));
    const latH = Math.max(2, Math.round(rows / wavelengthCells));
    const lat = new Float32Array(latW * latH);
    for (let i = 0; i < lat.length; i++) lat[i] = rng.float();
    const field = new Float32Array(cols * rows);
    for (let r = 0; r < rows; r++) {
      const fy = (r / rows) * latH;
      const r0 = Math.floor(fy) % latH;
      const r1 = (r0 + 1) % latH;
      const ty = fy - Math.floor(fy);
      for (let c = 0; c < cols; c++) {
        const fx = (c / cols) * latW;
        const c0 = Math.floor(fx) % latW;
        const c1 = (c0 + 1) % latW;
        const tx = fx - Math.floor(fx);
        const v00 = lat[r0 * latW + c0]!;
        const v10 = lat[r0 * latW + c1]!;
        const v01 = lat[r1 * latW + c0]!;
        const v11 = lat[r1 * latW + c1]!;
        const top = v00 + (v10 - v00) * tx;
        const bot = v01 + (v11 - v01) * tx;
        field[r * cols + c] = top + (bot - top) * ty;
      }
    }
    // Threshold at the density-th quantile so exactly ~density of cells become solid.
    const sortedCopy = Float32Array.from(field).sort();
    const threshold = sortedCopy[Math.min(sortedCopy.length - 1, Math.floor(density * sortedCopy.length))]!;
    for (let i = 0; i < field.length; i++) this.solid[i] = field[i]! < threshold ? 1 : 0;
  }

  /** Force food-pocket cells open. Cave regions (none yet in Inc 1) keep only a small core; Inc 1 opens
   *  the full pocket footprint. Recomputes the pocket fertility map via FoodField.seedPatches. */
  private openPockets(cfg: Config): void {
    if (cfg.foodPatchCount <= 0) return;
    const fert = this.pocketFertility(cfg);
    const { cols, rows, foodCols, foodRows } = this;
    for (let r = 0; r < rows; r++) {
      const fr = Math.min(foodRows - 1, Math.floor((r / rows) * foodRows));
      for (let c = 0; c < cols; c++) {
        const fc = Math.min(foodCols - 1, Math.floor((c / cols) * foodCols));
        if (fert[fr * foodCols + fc]! > 0.3) this.solid[r * cols + c] = 0;
      }
    }
  }

  /** Reproduce the food fertility map deterministically (same SALT-free seed path as the food field). */
  private pocketFertility(cfg: Config): Float32Array {
    const f = new FoodField(this.worldWidth, this.worldHeight, cfg.foodCols, cfg.foodRows, cfg.foodCap, cfg.foodInit);
    const rng = new Rng((cfg.seed ^ (SALT * 3)) >>> 0); // own substream — does not touch world.rng
    f.seedPatches(cfg.foodPatchCount, cfg.foodPatchRadius, cfg.foodBaseFertility, rng);
    return f.fertilityMap();
  }

  /** Carve straight toroidal corridors chaining every pocket centroid → all pockets share a component. */
  private connectPockets(cfg: Config): void {
    if (cfg.foodPatchCount <= 0) return;
    const centroids = this.pocketCentroids(cfg);
    for (let i = 1; i < centroids.length; i++)
      this.carveCorridor(centroids[i - 1]!, centroids[i]!, cfg.wallCorridorRadius);
  }

  private pocketCentroids(cfg: Config): { x: number; y: number }[] {
    // Same RNG path as seedPatches' centre draws (it draws pc=rng.float()*cols, pr=rng.float()*rows).
    const rng = new Rng((cfg.seed ^ (SALT * 3)) >>> 0);
    const out: { x: number; y: number }[] = [];
    for (let p = 0; p < cfg.foodPatchCount; p++) {
      const pc = rng.float() * cfg.foodCols;
      const pr = rng.float() * cfg.foodRows;
      out.push({ x: (pc / cfg.foodCols) * this.worldWidth, y: (pr / cfg.foodRows) * this.worldHeight });
    }
    return out;
  }

  private carveCorridor(a: { x: number; y: number }, b: { x: number; y: number }, radius: number): void {
    const dx = wrapDelta(b.x - a.x, this.worldWidth);
    const dy = wrapDelta(b.y - a.y, this.worldHeight);
    const dist = Math.hypot(dx, dy);
    const steps = Math.max(1, Math.ceil(dist / Math.min(this.cellW, this.cellH)));
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const cx = this.colOf(wrap(a.x + dx * t, this.worldWidth));
      const cy = this.rowOf(wrap(a.y + dy * t, this.worldHeight));
      for (let rr = -radius; rr <= radius; rr++)
        for (let cc = -radius; cc <= radius; cc++) {
          const c = (cx + cc + this.cols) % this.cols;
          const r = (cy + rr + this.rows) % this.rows;
          this.solid[r * this.cols + c] = 0;
        }
    }
  }

  private deriveMasks(cfg: Config): void {
    this.deriveFoodBlocked();
    this.deriveProx();
  }

  /** A food cell is dammed when > half the fine cells it covers are solid. */
  private deriveFoodBlocked(): void {
    const { cols, rows, foodCols, foodRows } = this;
    const fx = cols / foodCols;
    const fy = rows / foodRows;
    for (let fr = 0; fr < foodRows; fr++)
      for (let fc = 0; fc < foodCols; fc++) {
        let solidN = 0;
        let total = 0;
        for (let r = Math.floor(fr * fy); r < Math.floor((fr + 1) * fy); r++)
          for (let c = Math.floor(fc * fx); c < Math.floor((fc + 1) * fx); c++) {
            total++;
            if (this.solid[r * cols + c]) solidN++;
          }
        this.foodBlocked[fr * foodCols + fc] = total > 0 && solidN * 2 > total ? 1 : 0;
      }
  }

  /** Multi-source toroidal BFS hop-distance to the nearest solid cell, clamped to proxCap. */
  private deriveProx(): void {
    const { cols, rows, proxCap } = this;
    const n = cols * rows;
    const dist = new Int32Array(n).fill(-1);
    let frontier: number[] = [];
    for (let i = 0; i < n; i++)
      if (this.solid[i]) {
        dist[i] = 0;
        frontier.push(i);
      }
    if (frontier.length === 0) {
      this.prox.fill(proxCap); // no walls → uniformly "far", flat gradient
      return;
    }
    let d = 0;
    while (frontier.length && d < proxCap) {
      const next: number[] = [];
      for (const idx of frontier) {
        const c = idx % cols;
        const r = (idx - c) / cols;
        const nbrs = [
          ((r - 1 + rows) % rows) * cols + c,
          ((r + 1) % rows) * cols + c,
          r * cols + ((c - 1 + cols) % cols),
          r * cols + ((c + 1) % cols),
        ];
        for (const ni of nbrs)
          if (dist[ni] === -1) {
            dist[ni] = d + 1;
            next.push(ni);
          }
      }
      frontier = next;
      d++;
    }
    for (let i = 0; i < n; i++) this.prox[i] = dist[i] === -1 ? proxCap : Math.min(proxCap, dist[i]!);
  }

  /** TEST HELPER: are all food-pocket centroids in one connected open component? */
  allPocketsConnected(): boolean {
    const cfg = { foodCols: this.foodCols, foodRows: this.foodRows } as Config;
    void cfg;
    // flood-fill open cells from the first reachable centroid cell, check the rest land in it.
    return this.componentLabelCoversAllOpenSeeds();
  }

  private componentLabelCoversAllOpenSeeds(): boolean {
    const { cols, rows } = this;
    const n = cols * rows;
    const seen = new Uint8Array(n);
    // seed flood from the first open cell
    let start = -1;
    for (let i = 0; i < n; i++) if (!this.solid[i]) { start = i; break; }
    if (start < 0) return false;
    const stack = [start];
    seen[start] = 1;
    let openCount = 0;
    for (let i = 0; i < n; i++) if (!this.solid[i]) openCount++;
    let reached = 0;
    while (stack.length) {
      const idx = stack.pop()!;
      reached++;
      const c = idx % cols;
      const r = (idx - c) / cols;
      const nbrs = [
        ((r - 1 + rows) % rows) * cols + c,
        ((r + 1) % rows) * cols + c,
        r * cols + ((c - 1 + cols) % cols),
        r * cols + ((c + 1) % cols),
      ];
      for (const ni of nbrs) if (!this.solid[ni] && !seen[ni]) { seen[ni] = 1; stack.push(ni); }
    }
    // Connectivity guarantee target: the largest component holds (almost) all open cells.
    return reached >= openCount * 0.95;
  }
}
```

- [ ] **Step 4: Add the two FoodField helpers this task consumes.** In `src/core/food-field.ts`, add public methods (the fertility map is currently private):

```ts
  /** Read-only view of the fertility map (for the wall generator's pocket awareness). */
  fertilityMap(): Float32Array {
    return this.fertility;
  }
```

- [ ] **Step 5: Run.** `pnpm test -- src/core/walls.test.ts` — Expected: PASS (4 cases).
- [ ] **Step 6: Typecheck + lint.** `pnpm typecheck && pnpm lint` — Expected: PASS.
- [ ] **Step 7: Commit.** `git add src/core/walls.ts src/core/walls.test.ts src/core/food-field.ts && git commit -m "feat(env): Walls fine grid + noise gen + connectivity + masks"`

---

### Task 1.3: Wall collision in `integrate` (slide) + `World` ownership

**Files:**
- Modify: `src/core/physics.ts` (`integrate` signature + slide)
- Modify: `src/core/world.ts` (own `Walls`, thread into `integrate`, reject spawns in walls)
- Test: `src/core/physics.test.ts`, `src/core/world.test.ts`

**Interfaces:**
- Consumes: `Walls` (Task 1.2).
- Produces: `integrate(..., walls: Walls | null)`.

- [ ] **Step 1: Write the failing physics test.** Add to `src/core/physics.test.ts`:

```ts
import { Walls } from './walls';
import { defaultConfig } from './config';
// ... existing imports

it('a creature cannot move into a solid wall cell (slide-collision)', () => {
  const cfg = defaultConfig({ worldWidth: 1024, worldHeight: 1024, wallCols: 64, wallRows: 64, foodCols: 16, foodRows: 16, foodPatchCount: 0, wallRegionCount: 1, wallDensity: 0.5, seed: 11 });
  const walls = new Walls(1024, 1024, 64, 64, cfg);
  const store = makeStore(1); // local helper that allocs one organism — see existing tests
  // place it at an open cell with velocity toward a known solid neighbour; assert it never lands solid.
  // (Implementer: pick an open cell adjacent to a solid one by scanning walls.isSolidAt.)
  // After integrate, the organism's cell must not be solid:
  // expect(walls.isSolidAt(store.x[0], store.y[0])).toBe(false);
});
```

> Implementer note: reuse the existing `physics.test.ts` store-construction helper. The assertion that matters: after `integrate(..., walls)`, `walls.isSolidAt(store.x[i], store.y[i])` is `false` for every live creature, for any starting open position + velocity.

- [ ] **Step 2: Run to verify it fails.** `pnpm test -- src/core/physics.test.ts` — Expected: FAIL (integrate arity / behavior).

- [ ] **Step 3: Implement the slide in `integrate`.** Change the signature and the position-commit block in `src/core/physics.ts`:

```ts
export function integrate(
  store: OrganismStore,
  dt: number,
  damping: number,
  stabilityClamp: boolean,
  worldWidth: number,
  worldHeight: number,
  refSize: number,
  sizeSpeedExp: number,
  walls: Walls | null,
): void {
  // ... unchanged up to computing nvx, nvy ...
    vx[i] = nvx;
    vy[i] = nvy;
    let px = x[i]! + nvx * dt;
    let py = y[i]! + nvy * dt;
    if (walls !== null && walls.active) {
      const wpx = wrapPos(px, worldWidth);
      const wpy = wrapPos(py, worldHeight);
      if (walls.isSolidAt(wpx, wpy)) {
        const xOnlyOpen = !walls.isSolidAt(wrapPos(x[i]! + nvx * dt, worldWidth), wrapPos(y[i]!, worldHeight));
        const yOnlyOpen = !walls.isSolidAt(wrapPos(x[i]!, worldWidth), wrapPos(y[i]! + nvy * dt, worldHeight));
        if (xOnlyOpen) { py = y[i]!; vy[i] = 0; }
        else if (yOnlyOpen) { px = x[i]!; vx[i] = 0; }
        else { px = x[i]!; py = y[i]!; vx[i] = 0; vy[i] = 0; }
      }
    }
    px %= worldWidth; if (px < 0) px += worldWidth;
    py %= worldHeight; if (py < 0) py += worldHeight;
    x[i] = px;
    y[i] = py;
  }
}
```

Add a `wrapPos` helper + the `Walls` import at the top of `physics.ts`:

```ts
import { type Walls } from './walls';
function wrapPos(v: number, size: number): number { const m = v % size; return m < 0 ? m + size : m; }
```

- [ ] **Step 4: Thread `Walls` through `World`.** In `src/core/world.ts`:
  - import `Walls`;
  - add `readonly walls: Walls;` field;
  - construct it in the ctor after `this.food`:
    ```ts
    this.walls = new Walls(config.worldWidth, config.worldHeight, config.wallCols, config.wallRows, config);
    ```
  - pass it to `integrate` in `step()` (add `this.walls` as the final arg);
  - in `seedWorld()`, after computing a candidate spawn `(tx,ty)`, reject solid cells: change the spawn loop so a tried position in a wall is skipped (gated — `this.walls.active`):
    ```ts
    const f = this.walls.active && this.walls.isSolidAt(tx, ty) ? -1 : this.food.sampleAt(tx, ty);
    ```
  (Founders still spawn on open fertile pockets; with walls off `this.walls.active` is false → byte-identical.)

- [ ] **Step 5: Run.** `pnpm test -- src/core/physics.test.ts src/core/world.test.ts` — Expected: PASS, including the existing determinism + alive-guardrail cases (walls default-on must keep them green).

- [ ] **Step 6: `make check`.** Expected: green.
- [ ] **Step 7: Commit.** `git add src/core/physics.ts src/core/world.ts src/core/physics.test.ts && git commit -m "feat(env): wall slide-collision in integrate + World owns Walls"`

---

### Task 1.4: Render the wall layer

**Files:**
- Modify: `src/render/renderer.ts` (a wall texture quad between food and dots)
- Modify: `src/app/main.ts` (pass `world.walls`; 'w' toggle)
- Test: manual (visual) — add a smoke assertion in `src/render/overlay.test.ts` only if a headless GL stub exists; otherwise verify by running the demo.

- [ ] **Step 1: Add a wall program + texture to `Renderer`.** Mirror the food layer: a second `R8` texture sampled by a quad shader that draws solid cells as a dim slate colour. Add `WALL_FRAG` (reuse `FOOD_VERT`):

```ts
const WALL_FRAG = `#version 300 es
precision mediump float;
in vec2 v_uv;
uniform sampler2D u_tex;
out vec4 outColor;
void main() {
  float s = texture(u_tex, v_uv).r;          // 0 open, 1 solid
  if (s < 0.5) discard;                        // open cells show the food layer beneath
  outColor = vec4(0.16, 0.18, 0.22, 1.0);      // slate rock
}`;
```

Add `wallProgram`, `wallTex`, `wallTexData`, `wallTexInit` fields (mirroring the food members), build in the ctor, and a draw block in `draw()` AFTER the food block and BEFORE the dots:

```ts
  draw(store, food, walls, showFood, showWalls, interp) { // extend the signature
    // ... food block unchanged ...
    if (walls && showWalls && walls.active) {
      const cells = walls.cols * walls.rows;
      if (this.wallTexData.length !== cells) this.wallTexData = new Uint8Array(cells);
      walls.fillTexture(this.wallTexData);
      // upload + draw exactly like the food texture quad, using wallProgram/wallTex.
    }
    // ... dots block unchanged ...
  }
```

- [ ] **Step 2: Wire main.ts.** Add `let showWalls = true;`, a `'w'`/`'W'` keydown toggle, and pass `world.walls, showWalls` into `renderer.draw(...)`.

- [ ] **Step 3: Verify visually.** Run `pnpm dev`, open the demo: walls render as slate structures; food/dots beneath; `w` toggles them; creatures visibly stop at walls. (Confirm on a fresh Vite port — see [[vite-stale-module-verify]].)

- [ ] **Step 4: `make check`** (no behavior change to core). Expected: green.
- [ ] **Step 5: Commit.** `git add src/render/renderer.ts src/app/main.ts && git commit -m "feat(env): render wall layer + 'w' toggle"`

---

# INCREMENT 2 — Vision occlusion

### Task 2.1: Occlude sight through walls in `senseCreatures`

**Files:**
- Modify: `src/core/sense.ts` (`senseCreatures` takes `walls`, skips occluded targets)
- Modify: `src/core/world.ts` (pass `this.walls`)
- Test: `src/core/sense.test.ts`

**Interfaces:**
- Consumes: `Walls.losBlocked` (Task 1.2).
- Produces: `senseCreatures(store, hash, cfg, walls: Walls | null)`.

- [ ] **Step 1: Write the failing test.** Add to `src/core/sense.test.ts`:

```ts
import { Walls } from './walls';

it('a wall between viewer and target removes the target from the sight vector', () => {
  // Build two creatures within vision range/cone, then a Walls with a solid cell on the segment.
  // With wallOccludesVision, sightX/sightY for the viewer must be ~0 (target hidden) vs non-zero without.
  // Implementer: construct minimal store with 2 organisms, a hash built over them, and a Walls whose
  // generate() leaves a solid strip between them (use a tiny grid + direct solid injection helper, or a
  // hand-placed pocketless config). Assert: occluded => |sight| ~ 0; unoccluded => |sight| > 0.
});
```

- [ ] **Step 2: Run to verify it fails.** `pnpm test -- src/core/sense.test.ts` — Expected: FAIL (arity / behavior).

- [ ] **Step 3: Implement.** In `senseCreatures` (sense.ts), add the param and the guard right before a target contributes (after the cone check at sense.ts:128):

```ts
export function senseCreatures(store: OrganismStore, hash: SpatialHash, cfg: Config, walls: Walls | null): void {
  // ... unchanged ...
          if (ux * hx + uy * hy < cosFov) continue; // outside the vision cone
          if (walls !== null && walls.active && cfg.wallOccludesVision && walls.losBlocked(xi, yi, x[j]!, y[j]!))
            continue; // hidden behind a wall
  // ... unchanged ...
}
```

Add `import { type Walls } from './walls';` to sense.ts. Update the `world.ts` call site to `senseCreatures(s, this.hash, cfg, this.walls)`.

- [ ] **Step 4: Run.** `pnpm test -- src/core/sense.test.ts src/core/world.test.ts` — Expected: PASS (incl. determinism + alive-guardrail with occlusion on).
- [ ] **Step 5: `make check`.** Expected: green.
- [ ] **Step 6: Commit.** `git add src/core/sense.ts src/core/world.ts src/core/sense.test.ts && git commit -m "feat(env): walls occlude vision (LOS raycast in senseCreatures)"`

---

# INCREMENT 3 — Food damming

### Task 3.1: Wall-aware regrow + diffuse in `FoodField`

**Files:**
- Modify: `src/core/food-field.ts` (`step` + `stepChannel` take a `blocked` mask)
- Modify: `src/core/world.ts` (pass `this.walls.active ? this.walls.foodBlockedMask() : null`)
- Test: `src/core/food-field.test.ts`

**Interfaces:**
- Consumes: `Walls.foodBlockedMask()` (Task 1.2).
- Produces: `step(regen, diffuse, flow, blocked)` (flow stays `null` until Increment 4).

- [ ] **Step 1: Write the failing test.** Add to `src/core/food-field.test.ts`:

```ts
it('blocked cells hold no biomass and do not diffuse through walls', () => {
  const f = new FoodField(128, 128, 4, 4, 10, 1); // 4×4, full
  const blocked = new Uint8Array(16);
  blocked[1 * 4 + 1] = 1; // dam one interior cell
  f.step(0.1, 0.2, null, blocked);
  expect(f.sampleAt(1 * 32 + 16, 1 * 32 + 16)).toBe(0); // dammed cell drained to 0
  // total biomass is conserved-ish minus the dammed cell (no biomass leaks INTO the wall)
});
```

- [ ] **Step 2: Run to verify it fails.** `pnpm test -- src/core/food-field.test.ts` — Expected: FAIL (arity).

- [ ] **Step 3: Implement.** Change `step` + `stepChannel` to accept `blocked: Uint8Array | null` (and a `flow` param now, used as `null` here — wired in Increment 4):

```ts
  step(regen: number, diffuse: number, flow: FlowField | null, blocked: Uint8Array | null): void {
    this.stepChannel(this.B, this.fracA, regen, diffuse, false, blocked);
    if (this.B2) this.stepChannel(this.B2, this.ratio, regen, diffuse, true, blocked);
    if (flow !== null) this.advect(flow, blocked); // Increment 4
  }
```

In `stepChannel`, after the regrow loop force blocked cells to 0, and in the diffuse stencil treat a blocked neighbour as the cell's own value (no-flux):

```ts
    if (regen > 0) {
      for (let i = 0; i < field.length; i++) {
        if (blocked !== null && blocked[i] === 1) { field[i] = 0; continue; } // rock grows nothing
        // ... existing logistic regrow ...
      }
    }
    if (diffuse > 0) {
      const out = second ? this.scratch2! : this.scratch;
      for (let r = 0; r < rows; r++) {
        // ... existing up/dn/cur ...
        for (let c = 0; c < cols; c++) {
          const self = field[cur + c]!;
          if (blocked !== null && blocked[cur + c] === 1) { out[cur + c] = 0; continue; }
          const l = (c - 1 + cols) % cols;
          const rt = (c + 1) % cols;
          const vU = blocked !== null && blocked[up + c] === 1 ? self : field[up + c]!;
          const vD = blocked !== null && blocked[dn + c] === 1 ? self : field[dn + c]!;
          const vL = blocked !== null && blocked[cur + l] === 1 ? self : field[cur + l]!;
          const vR = blocked !== null && blocked[cur + rt] === 1 ? self : field[cur + rt]!;
          const avg4 = (vU + vD + vL + vR) * 0.25;
          out[cur + c] = self + diffuse * (avg4 - self);
        }
      }
      // ... existing buffer swap ...
    }
```

Add an empty `advect()` stub for now (filled in Increment 4):

```ts
  private advect(flow: FlowField, blocked: Uint8Array | null): void { void flow; void blocked; }
```

Add `import { type FlowField } from './flow-field';` (create the file in Increment 4; for now declare a minimal type or land Task 4.1 first — see note).

> **Sequencing note:** to avoid a forward import, do Task 4.1 (create `flow-field.ts`) BEFORE this task, OR temporarily type the param as `import('./flow-field').FlowField | null` once 4.1 lands. Recommended: build Task 4.1 first, then 3.1, then 4.2. The plan lists them in dependency order if you reorder 3.1 after 4.1.

- [ ] **Step 4: Update `world.ts` call site:** `this.food.step(cfg.foodRegen, cfg.foodDiffuse, null, this.walls.active ? this.walls.foodBlockedMask() : null);`
- [ ] **Step 5: Run.** `pnpm test -- src/core/food-field.test.ts src/core/world.test.ts` — Expected: PASS.
- [ ] **Step 6: `make check`.** Expected: green.
- [ ] **Step 7: Commit.** `git add src/core/food-field.ts src/core/world.ts && git commit -m "feat(env): walls dam the food field (no-flux regrow + diffuse)"`

---

# INCREMENT 4 — Flow field + food advection

### Task 4.1: `FlowField` — divergence-free streamfunction current

**Files:**
- Create: `src/core/flow-field.ts`
- Test: `src/core/flow-field.test.ts`

**Interfaces:**
- Consumes: `Config`, `Rng`.
- Produces: `FlowField` per the Shared Interfaces block.

- [ ] **Step 1: Write the failing test.** `src/core/flow-field.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { FlowField } from './flow-field';
import { defaultConfig } from './config';

describe('FlowField', () => {
  it('is zero everywhere when flowStrength=0', () => {
    const f = new FlowField(1024, 1024, 16, 16, defaultConfig({ flowStrength: 0 }));
    for (let i = 0; i < f.flowX.length; i++) { expect(f.flowX[i]).toBe(0); expect(f.flowY[i]).toBe(0); }
  });
  it('is CFL-bounded (|v|·dt/cellW ≤ 0.25) when active', () => {
    const cfg = defaultConfig({ flowStrength: 5, dt: 1 });
    const f = new FlowField(1024, 1024, 16, 16, cfg);
    const cellW = 1024 / 16;
    for (let i = 0; i < f.flowX.length; i++)
      expect(Math.hypot(f.flowX[i]!, f.flowY[i]!) * cfg.dt / cellW).toBeLessThanOrEqual(0.2500001);
  });
  it('is deterministic from config.seed', () => {
    const a = new FlowField(1024, 1024, 16, 16, defaultConfig({ seed: 8, flowStrength: 2 }));
    const b = new FlowField(1024, 1024, 16, 16, defaultConfig({ seed: 8, flowStrength: 2 }));
    for (let i = 0; i < a.flowX.length; i++) expect(a.flowX[i]).toBe(b.flowX[i]);
  });
});
```

- [ ] **Step 2: Run to verify it fails.** `pnpm test -- src/core/flow-field.test.ts` — Expected: FAIL (no module).

- [ ] **Step 3: Implement `src/core/flow-field.ts`.**

```ts
import { type Config } from './config';
import { Rng } from './rng';

const SALT = 0x85ebca6b; // flow's own substream — independent of world.rng and the wall SALT
const CFL = 0.25;

/**
 * Persistent divergence-free current on the food-resolution grid: v = curl(ψ) of a periodic value-noise
 * streamfunction (flowX=∂ψ/∂y, flowY=−∂ψ/∂x). Divergence-free ⇒ donor-cell advection conserves biomass.
 * Magnitude scaled to flowStrength then CFL-clamped so |v|·dt/cellW ≤ 0.25. Static; config-seeded; not
 * hashed. flowStrength=0 ⇒ all-zero (advection becomes a no-op → byte-identical).
 */
export class FlowField {
  readonly cols: number;
  readonly rows: number;
  readonly flowX: Float64Array;
  readonly flowY: Float64Array;
  private readonly cellW: number;
  private readonly cellH: number;

  constructor(worldWidth: number, worldHeight: number, cols: number, rows: number, cfg: Config) {
    this.cols = cols;
    this.rows = rows;
    this.cellW = worldWidth / cols;
    this.cellH = worldHeight / rows;
    this.flowX = new Float64Array(cols * rows);
    this.flowY = new Float64Array(cols * rows);
    if (cfg.flowStrength > 0) this.generate(cfg, worldWidth, worldHeight);
  }

  private generate(cfg: Config, ww: number, wh: number): void {
    const { cols, rows } = this;
    const psi = this.noise(cfg, cols, rows);
    // curl of psi (toroidal central differences)
    for (let r = 0; r < rows; r++) {
      const up = ((r - 1 + rows) % rows) * cols;
      const dn = ((r + 1) % rows) * cols;
      const cur = r * cols;
      for (let c = 0; c < cols; c++) {
        const l = (c - 1 + cols) % cols;
        const rt = (c + 1) % cols;
        this.flowX[cur + c] = (psi[dn + c]! - psi[up + c]!) * 0.5; // ∂ψ/∂y
        this.flowY[cur + c] = -(psi[cur + rt]! - psi[cur + l]!) * 0.5; // −∂ψ/∂x
      }
    }
    // scale to flowStrength, then CFL-clamp the global max.
    let maxMag = 0;
    for (let i = 0; i < this.flowX.length; i++) {
      this.flowX[i]! *= cfg.flowStrength;
      this.flowY[i]! *= cfg.flowStrength;
      const m = Math.hypot(this.flowX[i]!, this.flowY[i]!);
      if (m > maxMag) maxMag = m;
    }
    const cellMin = Math.min(this.cellW, this.cellH);
    const ceiling = (CFL * cellMin) / cfg.dt;
    if (maxMag > ceiling && maxMag > 0) {
      const k = ceiling / maxMag;
      for (let i = 0; i < this.flowX.length; i++) { this.flowX[i]! *= k; this.flowY[i]! *= k; }
    }
  }

  /** Periodic value noise (same scheme as Walls.carveNoise) → smooth streamfunction. */
  private noise(cfg: Config, cols: number, rows: number): Float64Array {
    const rng = new Rng((cfg.seed ^ SALT) >>> 0);
    const wl = cfg.flowScale > 0 ? cfg.flowScale : 12;
    const latW = Math.max(2, Math.round(cols / wl));
    const latH = Math.max(2, Math.round(rows / wl));
    const lat = new Float64Array(latW * latH);
    for (let i = 0; i < lat.length; i++) lat[i] = rng.float();
    const out = new Float64Array(cols * rows);
    for (let r = 0; r < rows; r++) {
      const fy = (r / rows) * latH;
      const r0 = Math.floor(fy) % latH;
      const r1 = (r0 + 1) % latH;
      const ty = fy - Math.floor(fy);
      for (let c = 0; c < cols; c++) {
        const fx = (c / cols) * latW;
        const c0 = Math.floor(fx) % latW;
        const c1 = (c0 + 1) % latW;
        const tx = fx - Math.floor(fx);
        const v00 = lat[r0 * latW + c0]!, v10 = lat[r0 * latW + c1]!;
        const v01 = lat[r1 * latW + c0]!, v11 = lat[r1 * latW + c1]!;
        const top = v00 + (v10 - v00) * tx, bot = v01 + (v11 - v01) * tx;
        out[r * cols + c] = top + (bot - top) * ty;
      }
    }
    return out;
  }

  private idx(x: number, y: number): number {
    let c = Math.floor(x / this.cellW); let r = Math.floor(y / this.cellH);
    if (c < 0) c = 0; else if (c >= this.cols) c = this.cols - 1;
    if (r < 0) r = 0; else if (r >= this.rows) r = this.rows - 1;
    return r * this.cols + c;
  }
  sampleX(x: number, y: number): number { return this.flowX[this.idx(x, y)]!; }
  sampleY(x: number, y: number): number { return this.flowY[this.idx(x, y)]!; }
}
```

- [ ] **Step 4: Run.** `pnpm test -- src/core/flow-field.test.ts` — Expected: PASS.
- [ ] **Step 5: Own it in `World`.** Add `readonly flow: FlowField;`, construct after `this.walls`: `this.flow = new FlowField(config.worldWidth, config.worldHeight, config.foodCols, config.foodRows, config);`
- [ ] **Step 6: `make check`.** Expected: green.
- [ ] **Step 7: Commit.** `git add src/core/flow-field.ts src/core/flow-field.test.ts src/core/world.ts && git commit -m "feat(env): divergence-free streamfunction FlowField"`

---

### Task 4.2: Donor-cell food advection (wall-aware, conservative)

**Files:**
- Modify: `src/core/food-field.ts` (`advect` body)
- Modify: `src/core/world.ts` (pass `this.flow` into `food.step`)
- Test: `src/core/food-field.test.ts`

**Interfaces:**
- Consumes: `FlowField.flowX/flowY` (Task 4.1), `blocked` mask (Task 3.1).

- [ ] **Step 1: Write the failing test.** Add to `src/core/food-field.test.ts`:

```ts
import { FlowField } from './flow-field';
import { defaultConfig } from './config';

it('advection conserves total biomass and respects walls', () => {
  const f = new FoodField(1024, 1024, 16, 16, 10, 1);
  const flow = new FlowField(1024, 1024, 16, 16, defaultConfig({ flowStrength: 2, flowScale: 6, seed: 2 }));
  const before = f.total();
  for (let t = 0; t < 50; t++) f.step(0, 0, flow, null); // pure advection (no regrow/diffuse)
  expect(f.total()).toBeCloseTo(before, 4); // mass conserved
  for (let i = 0; i < f['B'].length; i++) expect(f['B'][i]).toBeGreaterThanOrEqual(-1e-9); // non-negative
});

it('advection is a no-op when flowStrength=0', () => {
  const f1 = new FoodField(1024, 1024, 16, 16, 10, 1);
  const f2 = new FoodField(1024, 1024, 16, 16, 10, 1);
  const flow = new FlowField(1024, 1024, 16, 16, defaultConfig({ flowStrength: 0 }));
  f1.step(0.05, 0.1, flow, null);
  f2.step(0.05, 0.1, null, null);
  for (let i = 0; i < 256; i++) {
    const x = (i % 16) * 64 + 32, y = Math.floor(i / 16) * 64 + 32;
    expect(f1.sampleAt(x, y)).toBe(f2.sampleAt(x, y)); // byte-identical when flow is zero
  }
});
```

- [ ] **Step 2: Run to verify it fails.** `pnpm test -- src/core/food-field.test.ts` — Expected: FAIL (advect is a stub).

- [ ] **Step 3: Implement `advect`.** Replace the stub:

```ts
  /** First-order donor-cell (upwind) flux advection of biomass along the flow field. Conservative
   *  (every flux subtracted from a donor is added to a receiver) and no-flux at walls. CFL ≤ 0.25
   *  (enforced by FlowField) keeps it positivity-preserving with 4 outflow faces. */
  private advect(flow: FlowField, blocked: Uint8Array | null): void {
    const { cols, rows, cellW } = this;
    this.advectChannel(this.B, flow, blocked, cols, rows, cellW);
    if (this.B2) this.advectChannel(this.B2, flow, blocked, cols, rows, cellW);
  }

  private advectChannel(
    B: Float64Array,
    flow: FlowField,
    blocked: Uint8Array | null,
    cols: number,
    rows: number,
    cellW: number,
  ): void {
    const out = this.advectScratch ?? (this.advectScratch = new Float64Array(B.length));
    out.set(B);
    const { flowX, flowY } = flow;
    const inv = 1 / cellW;
    for (let r = 0; r < rows; r++) {
      const cur = r * cols;
      const dn = ((r + 1) % rows) * cols;
      for (let c = 0; c < cols; c++) {
        const i = cur + c;
        const rt = cur + ((c + 1) % cols);
        const di = dn + c;
        if (blocked === null || blocked[i] === 0) {
          // +x face to the right neighbour
          if (blocked === null || blocked[rt] === 0) {
            const uf = 0.5 * (flowX[i]! + flowX[rt]!);
            const flux = uf * (uf > 0 ? B[i]! : B[rt]!) * inv;
            out[i]! -= flux; out[rt]! += flux;
          }
          // +y face to the lower neighbour
          if (blocked === null || blocked[di] === 0) {
            const vf = 0.5 * (flowY[i]! + flowY[di]!);
            const flux = vf * (vf > 0 ? B[i]! : B[di]!) * inv;
            out[i]! -= flux; out[di]! += flux;
          }
        }
      }
    }
    // copy back (B is the canonical buffer; out is reused scratch)
    B.set(out);
  }
```

Add a private scratch field to the class: `private advectScratch: Float64Array | null = null;` Note `cellW` is `worldWidth/cols` — add a `private readonly cellWAdvect = this.cellW;` only if `cellW` isn't already a field (it is: `food-field.ts:26`). Use the existing `this.cellW`.

- [ ] **Step 4: Wire `world.ts`:** `this.food.step(cfg.foodRegen, cfg.foodDiffuse, cfg.flowStrength > 0 ? this.flow : null, this.walls.active ? this.walls.foodBlockedMask() : null);`
- [ ] **Step 5: Run.** `pnpm test -- src/core/food-field.test.ts src/core/world.test.ts` — Expected: PASS (mass conservation, no-op-when-zero, determinism, alive-guardrail).
- [ ] **Step 6: `make check`.** Expected: green.
- [ ] **Step 7: Commit.** `git add src/core/food-field.ts src/core/world.ts && git commit -m "feat(env): conservative donor-cell food advection along the flow field"`

---

### Task 4.3: Flow-field arrow overlay

**Files:**
- Modify: `src/app/main.ts` (build an arrow line-stream from `world.flow`, draw via `renderer.drawLines`, 'v' toggle)
- Test: manual (visual)

- [ ] **Step 1:** Add `let showFlow = false;` + a `'v'`/`'V'` keydown toggle.
- [ ] **Step 2:** When `showFlow`, sample `world.flow` on a coarse sub-grid (e.g. every 4th food cell), build `[x,y,r,g,b]` line pairs (cell centre → centre + flow·scale) into a reusable `Float32Array`, call `renderer.drawLines(buf, n)`. Cyan, dim.
- [ ] **Step 3:** Verify in `pnpm dev`: 'v' shows the current as arrows; food visibly drifts along them over time.
- [ ] **Step 4: Commit.** `git add src/app/main.ts && git commit -m "feat(env): flow-field arrow overlay + 'v' toggle"`

---

# INCREMENT 5 — Size-scaled creature push (off by default)

### Task 5.1: `applyFlowForce` after `steer`

**Files:**
- Modify: `src/core/physics.ts` (new `applyFlowForce`)
- Modify: `src/core/world.ts` (call after `steer`, before `computeRepulsion`)
- Test: `src/core/physics.test.ts`

**Interfaces:**
- Consumes: `FlowField.sampleX/Y` (Task 4.1).
- Produces: `applyFlowForce(store, flow, cfg)`.

- [ ] **Step 1: Write the failing test.** Add to `src/core/physics.test.ts`:

```ts
import { FlowField } from './flow-field';
import { applyFlowForce } from './physics';

it('flow push is off when flowPushStrength=0 (force buffer untouched)', () => {
  const flow = new FlowField(1024, 1024, 16, 16, defaultConfig({ flowStrength: 2, flowPushStrength: 0 }));
  const store = makeStore(1);
  store.forceX[0] = 1; store.forceY[0] = 2;
  applyFlowForce(store, flow, defaultConfig({ flowPushStrength: 0 }));
  expect(store.forceX[0]).toBe(1); expect(store.forceY[0]).toBe(2);
});

it('smaller bodies are pushed harder than larger bodies', () => {
  const cfg = defaultConfig({ flowStrength: 3, flowPushStrength: 5, flowPushSizeExp: 1, cellRadius: 6 });
  const flow = new FlowField(1024, 1024, 16, 16, cfg);
  const store = makeStore(2);
  // identical position; small size vs large size
  store.x[0] = store.x[1] = 100; store.y[0] = store.y[1] = 100;
  store.scalarGenes[0 * SCALAR_GENE_COUNT + ScalarGene.SIZE] = 3;  // small
  store.scalarGenes[1 * SCALAR_GENE_COUNT + ScalarGene.SIZE] = 24; // large
  applyFlowForce(store, flow, cfg);
  expect(Math.hypot(store.forceX[0]!, store.forceY[0]!)).toBeGreaterThan(Math.hypot(store.forceX[1]!, store.forceY[1]!));
});
```

- [ ] **Step 2: Run to verify it fails.** `pnpm test -- src/core/physics.test.ts` — Expected: FAIL (no export).

- [ ] **Step 3: Implement `applyFlowForce` in `physics.ts`.**

```ts
import { type FlowField } from './flow-field';

/** Add the local current as a force, scaled DOWN by body size (cellRadius/size)^exp — big bodies resist,
 *  small/slow drift. Runs AFTER steer (the force-buffer reset) so it ACCUMULATES (+=). flowPushStrength=0
 *  ⇒ no-op (byte-identical). */
export function applyFlowForce(store: OrganismStore, flow: FlowField, cfg: Config): void {
  if (cfg.flowPushStrength <= 0) return;
  const { liveIndices, liveCount, x, y, forceX, forceY, scalarGenes } = store;
  const k = cfg.flowPushStrength;
  for (let n = 0; n < liveCount; n++) {
    const i = liveIndices[n]!;
    const size = scalarGenes[i * SCALAR_GENE_COUNT + ScalarGene.SIZE]!;
    const susceptibility = cfg.flowPushSizeExp > 0 ? (cfg.cellRadius / size) ** cfg.flowPushSizeExp : 1;
    forceX[i] = forceX[i]! + k * susceptibility * flow.sampleX(x[i]!, y[i]!);
    forceY[i] = forceY[i]! + k * susceptibility * flow.sampleY(x[i]!, y[i]!);
  }
}
```

Add `Config` import if not present, and ensure `ScalarGene`/`SCALAR_GENE_COUNT` are imported (they are, physics.ts:7).

- [ ] **Step 4: Wire `world.ts`.** In `step()`, after `steer(...)` and before `computeRepulsion(...)`:
```ts
    if (cfg.flowPushStrength > 0) applyFlowForce(s, this.flow, cfg);
```
(Import `applyFlowForce` alongside `computeRepulsion, integrate`.)

- [ ] **Step 5: Run.** `pnpm test -- src/core/physics.test.ts src/core/world.test.ts` — Expected: PASS.
- [ ] **Step 6: `make check`.** Expected: green.
- [ ] **Step 7: Commit.** `git add src/core/physics.ts src/core/world.ts && git commit -m "feat(env): size-scaled flow push on creatures (off by default)"`

---

# INCREMENT 6 — Neural environment sensing (walls + flow)

### Task 6.1: Store transients + `senseEnv`

**Files:**
- Modify: `src/core/store.ts` (`wallSenseX/Y`, `flowSenseX/Y` Float64 arrays)
- Modify: `src/core/sense.ts` (`senseEnv`)
- Modify: `src/core/world.ts` (call `senseEnv` after `senseFood`)
- Test: `src/core/sense.test.ts`

**Interfaces:**
- Consumes: `Walls.proxGradAt` (Task 1.2/6 — `prox` already built in Task 1.2), `FlowField.sampleX/Y`.
- Produces: `senseEnv(store, walls, flow, cfg)` filling `store.wallSenseX/Y`, `store.flowSenseX/Y`.

- [ ] **Step 1: Add transients to `store.ts`.** Declare + allocate (mirroring `sightX/Y`):
```ts
  readonly wallSenseX: Float64Array;
  readonly wallSenseY: Float64Array;
  readonly flowSenseX: Float64Array;
  readonly flowSenseY: Float64Array;
  // ... in constructor:
  this.wallSenseX = new Float64Array(capacity);
  this.wallSenseY = new Float64Array(capacity);
  this.flowSenseX = new Float64Array(capacity);
  this.flowSenseY = new Float64Array(capacity);
```

- [ ] **Step 2: Write the failing test.** Add to `src/core/sense.test.ts`:
```ts
import { senseEnv } from './sense';

it('senseEnv leaves transients at 0 when both features are off', () => {
  const store = makeStore(1);
  store.wallSenseX[0] = 9; store.flowSenseX[0] = 9; // dirty
  senseEnv(store, null, null, defaultConfig({ wallRegionCount: 0, flowStrength: 0 }));
  expect(store.wallSenseX[0]).toBe(0);
  expect(store.flowSenseX[0]).toBe(0);
});
```

- [ ] **Step 3: Run to verify it fails.** `pnpm test -- src/core/sense.test.ts` — Expected: FAIL (no export).

- [ ] **Step 4: Implement `senseEnv` in `sense.ts`.**
```ts
import { type FlowField } from './flow-field';

/** Fill the per-creature environment senses (world frame): the wall-proximity gradient (points away from
 *  walls) and the local flow vector. Gated — each writes 0 when its feature is absent (so the brain inputs
 *  are inert and the all-off state is byte-identical). Allocation-free, ascending order. */
export function senseEnv(store: OrganismStore, walls: Walls | null, flow: FlowField | null, cfg: Config): void {
  const { liveIndices, liveCount, x, y, wallSenseX, wallSenseY, flowSenseX, flowSenseY } = store;
  const wallsOn = walls !== null && walls.active;
  const flowOn = flow !== null && cfg.flowStrength > 0;
  for (let k = 0; k < liveCount; k++) {
    const i = liveIndices[k]!;
    if (wallsOn) {
      const g = walls!.proxGradAt(x[i]!, y[i]!, cfg.wallSenseRange);
      wallSenseX[i] = g.gx;
      wallSenseY[i] = g.gy;
    } else {
      wallSenseX[i] = 0;
      wallSenseY[i] = 0;
    }
    if (flowOn) {
      flowSenseX[i] = flow!.sampleX(x[i]!, y[i]!);
      flowSenseY[i] = flow!.sampleY(x[i]!, y[i]!);
    } else {
      flowSenseX[i] = 0;
      flowSenseY[i] = 0;
    }
  }
}
```

- [ ] **Step 5: Wire `world.ts`.** After `senseFood(...)` and before `senseCreatures(...)`:
```ts
    senseEnv(s, this.walls, cfg.flowStrength > 0 ? this.flow : null, cfg);
```
(Import `senseEnv` from `./sense`.)

- [ ] **Step 6: Run.** `pnpm test -- src/core/sense.test.ts src/core/world.test.ts` — Expected: PASS.
- [ ] **Step 7: Commit.** `git add src/core/store.ts src/core/sense.ts src/core/world.ts && git commit -m "feat(env): senseEnv — wall-prox + flow transients"`

---

### Task 6.2: Brain enum extension + gated env-sense gene draws

**Files:**
- Modify: `src/core/genome.ts` (`Brain` enum, `BRAIN_GENES`, `FOUNDER_BRAIN`, gated `seedGenome`/`mutateGenome`)
- Modify: `src/core/world.ts` (capture seed-time flags; pass to seed/mutate)
- Modify: `src/core/economy.ts` (`reproduce` passes the flags to `mutateGenome`)
- Test: `src/core/genome.test.ts`

**Interfaces:**
- Produces: `seedGenome(..., wallSenseGenes, flowSenseGenes)`, `mutateGenome(..., wallSenseGenes, flowSenseGenes)`, new `Brain.WALL_*`/`Brain.FLOW_*`.

- [ ] **Step 1: Extend the `Brain` enum + count + founder array** in `genome.ts`:
```ts
export const Brain = {
  LAT_TURN: 0, FWD_TURN: 1, LAT_THRUST: 2, FWD_THRUST: 3, TURN_BIAS: 4, THRUST_BIAS: 5,
  SIGHT_LAT_TURN: 6, SIGHT_FWD_TURN: 7, SIGHT_LAT_THRUST: 8, SIGHT_FWD_THRUST: 9,
  WALL_LAT_TURN: 10, WALL_FWD_TURN: 11, WALL_LAT_THRUST: 12, WALL_FWD_THRUST: 13,
  FLOW_LAT_TURN: 14, FLOW_FWD_TURN: 15, FLOW_LAT_THRUST: 16, FLOW_FWD_THRUST: 17,
} as const;
export const BRAIN_GENES = 18;
// FOUNDER_BRAIN: env senses seed at 0 (neutral — the response is evolved/learned, not hand-set).
const FOUNDER_BRAIN: readonly number[] = [1.2, 0, 0, 1.5, 0, 0.3, 1.0, 0, 0, 1.2, 0, 0, 0, 0, 0, 0, 0, 0];
```

- [ ] **Step 2: Write the failing determinism test.** Add to `src/core/genome.test.ts`:
```ts
import { Brain, BRAIN_GENES, seedGenome } from './genome';
import { Rng } from './rng';

it('env-sense weights are 0 and consume NO rng when gated off', () => {
  const brain = new Float32Array(BRAIN_GENES);
  const hue = new Float32Array(1);
  const a = new Rng(5); const b = new Rng(5);
  seedGenome(brain, hue, 0, a, 0.3, false, false); // off
  for (let g = Brain.WALL_LAT_TURN; g <= Brain.FLOW_FWD_THRUST; g++) expect(brain[g]).toBe(0);
  // a parallel rng that draws only the 10 base weights + hue must end in the SAME state.
  for (let g = 0; g < 10; g++) b.gaussian(0, 0.3);
  b.float();
  expect(a.state).toBe(b.state); // byte-identical stream when off
});

it('env-sense weights ARE drawn when gated on', () => {
  const brain = new Float32Array(BRAIN_GENES);
  const hue = new Float32Array(1);
  seedGenome(brain, hue, 0, new Rng(5), 0.3, true, true);
  let nonzero = 0;
  for (let g = Brain.WALL_LAT_TURN; g <= Brain.FLOW_FWD_THRUST; g++) if (brain[g] !== 0) nonzero++;
  expect(nonzero).toBeGreaterThan(0);
});
```

- [ ] **Step 3: Run to verify it fails.** `pnpm test -- src/core/genome.test.ts` — Expected: FAIL (arity).

- [ ] **Step 4: Implement gated draws** in `genome.ts`:
```ts
export function seedGenome(
  brain: Float32Array, hue: Float32Array, slot: number, rng: Rng, founderSigma: number,
  wallSenseGenes: boolean, flowSenseGenes: boolean,
): void {
  const base = slot * BRAIN_GENES;
  for (let g = 0; g < BRAIN_GENES; g++) {
    const isWall = g >= Brain.WALL_LAT_TURN && g <= Brain.WALL_FWD_THRUST;
    const isFlow = g >= Brain.FLOW_LAT_TURN && g <= Brain.FLOW_FWD_THRUST;
    if ((isWall && !wallSenseGenes) || (isFlow && !flowSenseGenes)) {
      brain[base + g] = FOUNDER_BRAIN[g]!; // 0, no draw
      continue;
    }
    brain[base + g] = FOUNDER_BRAIN[g]! + rng.gaussian(0, founderSigma);
  }
  hue[slot] = rng.float();
}

export function mutateGenome(
  brain: Float32Array, hue: Float32Array, child: number, parent: number, rng: Rng,
  sigma: number, hueSigma: number, wallSenseGenes: boolean, flowSenseGenes: boolean,
): void {
  const cb = child * BRAIN_GENES;
  const pb = parent * BRAIN_GENES;
  for (let g = 0; g < BRAIN_GENES; g++) {
    const isWall = g >= Brain.WALL_LAT_TURN && g <= Brain.WALL_FWD_THRUST;
    const isFlow = g >= Brain.FLOW_LAT_TURN && g <= Brain.FLOW_FWD_THRUST;
    if ((isWall && !wallSenseGenes) || (isFlow && !flowSenseGenes)) {
      brain[cb + g] = brain[pb + g]!; // inherit, no draw
      continue;
    }
    brain[cb + g] = brain[pb + g]! + rng.gaussian(0, sigma);
  }
  let h = hue[parent]! + rng.gaussian(0, hueSigma);
  h -= Math.floor(h);
  hue[child] = h;
}
```

- [ ] **Step 5: Capture seed-time flags in `World`** (ctor):
```ts
  readonly wallSenseGenes: boolean;
  readonly flowSenseGenes: boolean;
  // in ctor, before setup():
  this.wallSenseGenes = config.wallRegionCount > 0;
  this.flowSenseGenes = config.flowStrength > 0 || config.flowPushStrength > 0;
```
Update the `seedGenome(...)` call in `seedWorld()` to append `this.wallSenseGenes, this.flowSenseGenes`.

- [ ] **Step 6: Thread the flags into `reproduce`.** `economy.ts:reproduce` calls `mutateGenome(...)`. Add two params to `reproduce(store, rng, cfg, wallSenseGenes, flowSenseGenes)` and forward them; update the `world.ts` call site `reproduce(s, this.rng, cfg, this.wallSenseGenes, this.flowSenseGenes)`.

- [ ] **Step 7: Run.** `pnpm test -- src/core/genome.test.ts src/core/world.test.ts` — Expected: PASS (determinism + reset reproduce green; env genes 0 when off).
- [ ] **Step 8: `make check`.** Expected: green.
- [ ] **Step 9: Commit.** `git add src/core/genome.ts src/core/world.ts src/core/economy.ts src/core/genome.test.ts && git commit -m "feat(env): wall/flow brain genes with gated draws (off=byte-identical)"`

---

### Task 6.3: Steer reads wall/flow inputs + learns them

**Files:**
- Modify: `src/core/brain.ts` (`steer`: add wall/flow terms + eligibility traces)
- Test: `src/core/brain.test.ts`

**Interfaces:**
- Consumes: `store.wallSenseX/Y`, `store.flowSenseX/Y` (Task 6.1); `Brain.WALL_*`/`FLOW_*` (Task 6.2). `learn()` already iterates all `BRAIN_GENES` and skips only the two biases, so the new weights are consolidated automatically — no change to `learn()`.

- [ ] **Step 1: Write the failing test.** Add to `src/core/brain.test.ts`:
```ts
it('a positive WALL_FWD_THRUST weight converts a forward wall-gradient into forward thrust', () => {
  const store = makeStore(1);
  store.heading[0] = 0; // facing +x
  store.wallSenseX[0] = 1; store.wallSenseY[0] = 0; // gradient points +x (away from a wall behind/ahead)
  // zero all weights, set only WALL_FWD_THRUST
  for (let g = 0; g < BRAIN_GENES; g++) store.learnedBrain[g] = 0;
  store.learnedBrain[Brain.WALL_FWD_THRUST] = 2;
  steer(store, false, 0.2, false);
  expect(store.forceX[0]).toBeGreaterThan(0); // thrust along heading from the wall input
});
```

- [ ] **Step 2: Run to verify it fails.** `pnpm test -- src/core/brain.test.ts` — Expected: FAIL.

- [ ] **Step 3: Implement** in `steer` (brain.ts). After the sight frame-rotation (sense.ts pattern), add wall + flow rotations and fold into `turnRaw`/`thrustRaw`:
```ts
    const wallVx = store.wallSenseX[i]!;
    const wallVy = store.wallSenseY[i]!;
    const wFwd = wallVx * dx + wallVy * dy;
    const wLat = -wallVx * dy + wallVy * dx;
    const flowVx = store.flowSenseX[i]!;
    const flowVy = store.flowSenseY[i]!;
    const flFwd = flowVx * dx + flowVy * dy;
    const flLat = -flowVx * dy + flowVy * dx;
    // ... add to turnRaw:
    //   + learnedBrain[b + Brain.WALL_LAT_TURN]! * wLat + learnedBrain[b + Brain.WALL_FWD_TURN]! * wFwd
    //   + learnedBrain[b + Brain.FLOW_LAT_TURN]! * flLat + learnedBrain[b + Brain.FLOW_FWD_TURN]! * flFwd
    // ... add to thrustRaw:
    //   + learnedBrain[b + Brain.WALL_LAT_THRUST]! * wLat + learnedBrain[b + Brain.WALL_FWD_THRUST]! * wFwd
    //   + learnedBrain[b + Brain.FLOW_LAT_THRUST]! * flLat + learnedBrain[b + Brain.FLOW_FWD_THRUST]! * flFwd
```
And in the eligibility block (the `if (!learn) continue;` section), add the 8 trace updates mirroring the sight ones (pre = wLat/wFwd/flLat/flFwd, post = turnRaw/thrustRaw):
```ts
    elig[b + Brain.WALL_LAT_TURN] = keep * elig[b + Brain.WALL_LAT_TURN]! + eligLambda * wLat * turnRaw;
    elig[b + Brain.WALL_FWD_TURN] = keep * elig[b + Brain.WALL_FWD_TURN]! + eligLambda * wFwd * turnRaw;
    elig[b + Brain.WALL_LAT_THRUST] = keep * elig[b + Brain.WALL_LAT_THRUST]! + eligLambda * wLat * thrustRaw;
    elig[b + Brain.WALL_FWD_THRUST] = keep * elig[b + Brain.WALL_FWD_THRUST]! + eligLambda * wFwd * thrustRaw;
    elig[b + Brain.FLOW_LAT_TURN] = keep * elig[b + Brain.FLOW_LAT_TURN]! + eligLambda * flLat * turnRaw;
    elig[b + Brain.FLOW_FWD_TURN] = keep * elig[b + Brain.FLOW_FWD_TURN]! + eligLambda * flFwd * turnRaw;
    elig[b + Brain.FLOW_LAT_THRUST] = keep * elig[b + Brain.FLOW_LAT_THRUST]! + eligLambda * flLat * thrustRaw;
    elig[b + Brain.FLOW_FWD_THRUST] = keep * elig[b + Brain.FLOW_FWD_THRUST]! + eligLambda * flFwd * thrustRaw;
```

- [ ] **Step 4: Run.** `pnpm test -- src/core/brain.test.ts src/core/world.test.ts` — Expected: PASS.
- [ ] **Step 5: `make check`.** Expected: green.
- [ ] **Step 6: Commit.** `git add src/core/brain.ts src/core/brain.test.ts && git commit -m "feat(env): brains sense + learn wall/flow inputs (steer + eligibility)"`

---

### Task 6.4: Inspector/brain-view labels for the new senses (observability)

**Files:**
- Modify: `src/app/observability/brain-view.ts` (label the 8 new weights: Wl/Wf, Fl/Ff)
- Test: `src/app/observability/brain-view.test.ts` (extend the label expectation)

- [ ] **Step 1:** Add labels for `WALL_*`/`FLOW_*` in the brain-view weight legend, matching the existing sight-label style (e.g. `W:{L/F}`, `Fl:{L/F}` for turn/thrust).
- [ ] **Step 2:** Update/extend `brain-view.test.ts` to assert the new labels render.
- [ ] **Step 3: Run.** `pnpm test -- src/app/observability/brain-view.test.ts` — Expected: PASS.
- [ ] **Step 4: Commit.** `git add src/app/observability/brain-view.ts src/app/observability/brain-view.test.ts && git commit -m "feat(env): brain-view labels for wall/flow senses"`

---

# INCREMENT 7 — Biome regions + CA + rooms generators (parallel workflow)

> **Build this increment with a Workflow** (owner's "dynamic workflows to generate pockets utilizing
> each method"): one agent per generator (CA, rooms) + one region-composite/integration agent, each
> producing a module that satisfies the generator contract below, with its own tests. The noise
> generator from Task 1.2 is the reference. The connectivity guarantee (Task 1.2) already protects
> traversability, so a new generator can never strand the world.

**Generator contract (every generator is a pure function over the fine grid):**
```ts
// core/wall-gen/<name>.ts
export function carve<Name>(solid: Uint8Array, cols: number, rows: number, density: number, rng: Rng): void;
// Writes 0/1 into `solid` (full grid, toroidal). Must hit ≈density solid fraction and be deterministic.
```

### Task 7.1: Extract the noise generator behind the contract
- [ ] Move Task 1.2's `carveNoise` body into `src/core/wall-gen/noise.ts` as `carveNoise(solid, cols, rows, density, rng)`; `Walls` calls it. Add `src/core/wall-gen/noise.test.ts` (density-in-range + deterministic). Commit.

### Task 7.2: Cellular-automata generator
- [ ] `src/core/wall-gen/ca.ts` → `carveCA(solid, cols, rows, density, rng)`: random fill at `density`, then N (≈4) smoothing passes — a cell becomes solid if ≥5 of its 8 toroidal neighbours are solid, open if ≤3 (classic 4-5 rule). Test: density in a sane band, deterministic, toroidal (no seam artifacts). Commit.

### Task 7.3: Rooms + corridors generator
- [ ] `src/core/wall-gen/rooms.ts` → `carveRooms(solid, cols, rows, density, rng)`: fill solid, then stamp random rectangular rooms (open) + connect their centres with axis-aligned open corridors (toroidal), stopping when ≈(1−density) open. Test: rooms are open, corridors connect, deterministic. Commit.

### Task 7.4: Voronoi region partition + composite + pocket erosion
**Files:** Modify `src/core/walls.ts` (`generate`), Test `src/core/walls.test.ts`.
- [ ] In `generate`, when `wallRegionCount > 0`: scatter `wallRegionCount` seed cells (wall `Rng`), assign each fine cell to its nearest seed by toroidal distance (region map). Compute each generator's full-grid pattern into a scratch `Uint8Array`, then `solid[i] = pattern[genType[region[i]]][i]` (cycle generators across regions). Assign each region a `pocketErosion` flag; in `openPockets`, eroding regions force only a `wallPocketCoreRadius` core open (others open the full footprint). Keep `connectPockets` + `deriveMasks` as-is.
- [ ] Test: with `wallRegionCount=3`, the map contains cells from all three generator signatures (e.g. assert region-distinct solid densities differ), pockets still connected (`allPocketsConnected()`), density ≈ target. Commit.

---

# FINAL — Guardrail probe + reproducibility + simplify pass

### Task F.1: Headless alive-guardrail probe (full config, multi-seed)
**Files:** Create `src/headless/env-guardrail.ts`; run via `pnpm headless` wiring or a dedicated script.
- [ ] Run `defaultConfig()` (walls + flow on, push off) for ≥20k ticks across seeds [1,3,7,42], asserting per seed: `totalBirths>0`, `totalDeaths>0`, `population>0` (no extinction), `population<maxOrganisms`, food `total()>0` (food not fully dammed). Print a per-seed summary line. This is the merge gate; tune `wallDensity`/`flowStrength` against it if any seed dies.
- [ ] Commit.

### Task F.2: Reproducibility test — env features on
**Files:** Add a case to `src/core/world.test.ts`.
- [ ] `same (config, seed) → identical hash after 1000 ticks` with the FULL env config (walls+flow on, push on) — two worlds, identical `stateHash()`. Plus a non-vacuity assertion: after the run, at least one creature has a non-zero `WALL_*`/`FLOW_*` weight and the food field's `total()` changed under advection. Commit.

### Task F.3: Ablation byte-identity test
**Files:** Add a case to `src/core/world.test.ts`.
- [ ] With `wallRegionCount=0, flowStrength=0, flowPushStrength=0`: assert every live creature's `brain` weights at `Brain.WALL_LAT_TURN..Brain.FLOW_FWD_THRUST` are exactly 0 after a 500-tick run (the gated draws never fired). Commit.

### Task F.4: Simplify pass
- [ ] Run `/simplify` over the env diff (reuse, dedup the two near-identical periodic-noise helpers in `walls.ts` and `flow-field.ts` into one shared `core/noise.ts` if it reads cleanly), `make check` green, commit.

---

## Self-Review (completed)

- **Spec coverage:** D1 (walls only) ✓ Inc 1-2; D2 (3 generators/regions) ✓ Inc 7; D3 (dam food) ✓ Inc 3; D4 (occlusion) ✓ Inc 2; D5 (collision) ✓ Inc 1; D6 (flow + size push) ✓ Inc 4-5; D7 (region-dependent pockets) ✓ Task 7.4; D8 (35% default) ✓ Task 1.1; D9 (decoupled high-res + derived masks) ✓ Inc 1/3/6; D10 (neural sensing) ✓ Inc 6. Determinism/ablation ✓ Tasks 6.2/F.2/F.3. Alive-guardrail ✓ Task F.1.
- **Placeholder scan:** generator BODIES for CA/rooms (Inc 7) are specified by algorithm, not full code, because they're authored by the build-workflow against the explicit `carve*` contract — acceptable per the owner's workflow direction; every other code step is complete.
- **Type consistency:** `Walls`/`FlowField`/`senseEnv`/`integrate`/`step`/`seedGenome`/`mutateGenome` signatures are defined once in Shared Interfaces and used verbatim throughout. `foodBlockedMask()` (Uint8Array), `proxGradAt` ({gx,gy}), `flowX/flowY` (Float64Array) match across tasks.
- **Sequencing:** Task 3.1 forward-imports `FlowField`; flagged — build Task 4.1 before 3.1 (or reorder). All other tasks are in dependency order.
