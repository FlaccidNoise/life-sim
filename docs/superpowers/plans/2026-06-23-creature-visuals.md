# Creature Visuals Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render near creatures as gene-driven expressive flat-vector sprites (heading, diet/danger, eyes/senses, motion) via a Canvas2D detail overlay, while keeping the far swarm on the existing WebGL `gl.POINTS` path.

**Architecture:** Hybrid LOD. Tier 0 (far, sub-pixel→~6px) stays the batched WebGL point pass. Tier 1/2 (near) draw on a transparent Canvas2D overlay stacked over the WebGL canvas, sharing the camera transform, dispatching an ordered registry of isolated `TraitModule`s per visible creature. All geometry is derived from existing genes; rendering is read-only over sim state (byte-identical determinism).

**Tech Stack:** TypeScript, WebGL2 (existing), Canvas2D (new overlay), Vite + Vitest. No new runtime deps.

## Global Constraints

- **Worktree:** all work in `~/CodingProjects/life-sim/.claude/worktrees/creature-visuals` on branch `worktree-creature-visuals`.
- **Commit messages:** NEVER include `Co-Authored-By` or `Claude-Session` trailers (a PreToolUse hook blocks them).
- **Verification commands:** `make check` FAILS in this worktree — run `npx tsc --noEmit` and `npx vitest run` directly. Tests live in `src/**/*.test.ts` (vitest `include`).
- **No sim/economy/genome/determinism changes.** Rendering touches no RNG and no sim arrays it doesn't already read. The existing determinism suite must stay byte-identical — run it after Task 7 (the only task touching `renderer.ts`).
- **No new genes.** All geometry derives from the existing `ScalarGene` enum (`src/core/genome.ts:36-71`) + `store.hue`, `store.heading`, `store.vx/vy`.
- **Test environment is plain Node** (no jsdom/canvas). Trait modules must therefore split PURE geometry (typed-array / number math, unit-tested directly) from the thin `draw()` that issues canvas calls. Where a draw-call count is the invariant (fangs, cone arc), assert against a tiny recording mock context (defined in Task 5, reused after).
- **Heading frame (verified):** sim forward = `(cos heading, sin heading)` in screen coords (`brain.ts:54-55`). So `ctx.rotate(store.heading)` with the creature's front at local **+x** is correct — eyes/cone at +x face the direction of travel; tail at −x marks the back. No frame correction needed.
- **Code style:** match surrounding code; no comments/types on unchanged code; no over-engineering; surface errors (no silent catches).
- **Reference math:** `creature-flat-v3.html` (gitignored, at `.superpowers/brainstorm/68365-1782222505/content/`) is the validated look. Its `drawCreature`/`outline`/`trace` port directly; this plan inlines the exact math so you needn't reopen it, but open it to eyeball the target.

## Coordinate & color conventions (shared by all modules)

Inside a module's `draw(c)`, the canvas context `c.ctx` is **already** `translate(cx,cy)` then `rotate(heading)` — so draw in the creature's local frame: **+x = front/heading**, −x = back, the body centered at origin, radius `c.R` in device px. The 2-tone shadow direction uses `c.derived.screenUp` (screen-up expressed in the rotated local frame): `screenUp = [-sin(heading), -cos(heading)]`.

Colors in `c.derived`: `base` (body fill), `shadow = base*0.7`, `ink = base*0.34` (outline), `lite = base*1.18` (rim/cone). `fear = clamp(diet*1.15,0,1)`, `cute = 1-fear`.

---

## File Structure

- `src/render/detail/gene-view.ts` — `GeneView` typed per-creature accessor (raw/norm/named getters) + `CreatureVisualCtx`, `TraitModule`, `Derived`, `RGB` types, `buildDerived()`.
- `src/render/detail/shape.ts` — `bodyOutline(diet,R)` outline-point generator + `traceOutline(ctx,pts,smooth)`.
- `src/render/detail/registry.ts` — ordered `TraitModule[]` (sorted by `z`) + `dispatch(ctx, view, R, tier, derived, opts)`.
- `src/render/detail/body.ts`, `eyes.ts`, `brow.ts`, `maw.ts`, `vision-cone.ts`, `antennae.ts`, `tail.ts`, `fins.ts` — one `TraitModule` each.
- `src/render/detail/mock-ctx.ts` (test helper) — recording `CanvasRenderingContext2D` stub.
- `src/render/detail-overlay.ts` — `DetailOverlay` class: owns the stacked 2D canvas, mirrors camera, iterates `store.liveIndices`, computes on-screen radius, dispatches the registry for Tier 1/2.
- `src/render/palette.ts` (+ `palette.test.ts`) — saturation←`METAB_EFF` helper added (Task 7).
- `src/render/renderer.ts` — Tier-0 heading + saturation upgrade (Task 7).
- `src/app/main.ts` — instantiate + wire `DetailOverlay`; vision-cone toggle (Task 1 wires overlay, Task 4 adds toggle).
- `index.html` / overlay canvas — the overlay `<canvas>` is created in JS and absolutely-positioned over `#view` (Task 1), so no HTML edit needed if `#view`'s parent is positioned; verify in Task 1.

---

## Task 1: Overlay scaffold + camera sync (debug marker, no genes)

**Files:**
- Create: `src/render/detail-overlay.ts`
- Create: `src/render/detail-overlay.test.ts`
- Modify: `src/app/main.ts` (instantiate overlay after `renderer`; call `overlay.draw(...)` after `renderer.draw(...)` at `main.ts:406`)

**Interfaces:**
- Produces:
  - `class DetailOverlay { constructor(host: HTMLCanvasElement, worldWidth: number, worldHeight: number); resize(): void; setCamera(x: number, y: number, zoom: number): void; draw(store: OrganismStore): void; tierFor(pxR: number): 0 | 1 | 2; worldToScreen(wx: number, wy: number): { x: number; y: number }; onScreenRadius(slot: number, store: OrganismStore): number; }`
  - Camera math MUST mirror `renderer.ts` exactly: `baseScale = min(W/worldW, H/worldH)`, `effScale = baseScale*zoom`, `px = (wx-camX)*effScale + W/2`, `py = (wy-camY)*effScale + H/2`. `W,H` are the overlay canvas device-pixel dims.
  - On-screen radius mirrors `renderer.ts:523-524`: `R = max(2, 2*sizeGene*effScale)` is the **diameter** in the WebGL path (`gl_PointSize`), so the body **radius** in px is `sizeGene*effScale` (min 1). Use `onScreenRadius = max(1, sizeGene*effScale)`.
  - `tierFor`: `pxR < 6 → 0`, `pxR < 22 → 1`, else `2` (matches reference `tierFor`).

- [ ] **Step 1: Write the failing test** — `src/render/detail-overlay.test.ts`

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { OrganismStore } from '../core/store';
import { ScalarGene, SCALAR_GENE_COUNT } from '../core/genome';
import { DetailOverlay } from './detail-overlay';

// Minimal canvas stub: getContext returns an object whose methods are no-ops/recorders,
// width/height are settable. The overlay only needs 2D ctx transform + path ops here.
function fakeCanvas(w = 800, h = 600): HTMLCanvasElement {
  const calls: string[] = [];
  const ctx = new Proxy(
    { canvas: null as unknown, setTransform() {}, clearRect() {}, save() {}, restore() {} },
    {
      get(target, prop: string) {
        if (prop in target) return (target as Record<string, unknown>)[prop];
        return (...args: unknown[]) => calls.push(`${prop}(${args.join(',')})`);
      },
    },
  ) as unknown as CanvasRenderingContext2D;
  const c = {
    width: w,
    height: h,
    clientWidth: w,
    clientHeight: h,
    style: {} as CSSStyleDeclaration,
    getContext: () => ctx,
    parentElement: { appendChild: () => {}, style: {} } as unknown as HTMLElement,
    // expose recorder for assertions
    __calls: calls,
  } as unknown as HTMLCanvasElement;
  return c;
}

function oneCreature(cx: number, cy: number, size = 8): OrganismStore {
  const s = new OrganismStore(16);
  const i = s.alloc();
  s.x[i] = cx;
  s.y[i] = cy;
  s.heading[i] = 0;
  const b = i * SCALAR_GENE_COUNT;
  for (let g = 0; g < SCALAR_GENE_COUNT; g++) s.scalarGenes[b + g] = 1;
  s.scalarGenes[b + ScalarGene.SIZE] = size;
  s.rebuildLive();
  return s;
}

describe('DetailOverlay camera mirror', () => {
  let host: HTMLCanvasElement;
  let ov: DetailOverlay;
  beforeEach(() => {
    host = fakeCanvas(800, 600);
    ov = new DetailOverlay(host, 8192, 8192);
    ov.resize();
  });

  it('world centre maps to canvas centre at zoom 1', () => {
    ov.setCamera(4096, 4096, 1);
    const p = ov.worldToScreen(4096, 4096);
    expect(p.x).toBeCloseTo(400, 3);
    expect(p.y).toBeCloseTo(300, 3);
  });

  it('matches the renderer base-fit scale (min of axes)', () => {
    ov.setCamera(4096, 4096, 1);
    // baseScale = min(800/8192, 600/8192) = 600/8192; a point +8192 world units right of cam:
    const p = ov.worldToScreen(4096 + 8192, 4096);
    expect(p.x).toBeCloseTo(400 + 8192 * (600 / 8192), 3);
  });

  it('tierFor buckets by on-screen radius', () => {
    expect(ov.tierFor(3)).toBe(0);
    expect(ov.tierFor(10)).toBe(1);
    expect(ov.tierFor(30)).toBe(2);
  });

  it('skips Tier-0 creatures (no draw) and marks Tier 1/2', () => {
    // size 8 at zoom 1 → radius = 8 * (600/8192) ≈ 0.59px → Tier 0 → not drawn
    const s = oneCreature(4096, 4096, 8);
    ov.setCamera(4096, 4096, 1);
    ov.draw(s);
    const calls = (host as unknown as { __calls: string[] }).__calls;
    expect(calls.some((c) => c.startsWith('arc'))).toBe(false);
    // zoom in hard → same creature now Tier 2 → a debug marker (arc) is drawn
    ov.setCamera(4096, 4096, 64);
    (host as unknown as { __calls: string[] }).__calls.length = 0;
    ov.draw(s);
    expect(calls.some((c) => c.startsWith('arc'))).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/render/detail-overlay.test.ts`
Expected: FAIL — `Cannot find module './detail-overlay'`.

- [ ] **Step 3: Write minimal implementation** — `src/render/detail-overlay.ts`

```ts
/**
 * Detail overlay — a transparent Canvas2D layer stacked over the WebGL canvas, sharing the same
 * camera transform. Only creatures whose on-screen radius crosses the Tier-1 threshold are drawn
 * here (a handful at most), so cost scales with VISIBLE detailed creatures, not population. The far
 * swarm stays on the batched WebGL point pass. Read-only over sim state — no determinism impact.
 */
import { type OrganismStore } from '../core/store';
import { SCALAR_GENE_COUNT, ScalarGene } from '../core/genome';

export class DetailOverlay {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private camX: number;
  private camY: number;
  private zoom = 1;

  constructor(
    private readonly host: HTMLCanvasElement,
    private readonly worldWidth: number,
    private readonly worldHeight: number,
  ) {
    this.camX = worldWidth / 2;
    this.camY = worldHeight / 2;
    // Build a sibling canvas absolutely positioned over the host (same box), non-interactive so
    // mouse events still reach the WebGL canvas / its listeners.
    const c = document.createElement('canvas');
    c.style.position = 'absolute';
    c.style.left = '0';
    c.style.top = '0';
    c.style.width = '100%';
    c.style.height = '100%';
    c.style.pointerEvents = 'none';
    const parent = host.parentElement;
    if (!parent) throw new Error('DetailOverlay: host canvas has no parent to stack onto');
    parent.appendChild(c);
    const ctx = c.getContext('2d');
    if (!ctx) throw new Error('DetailOverlay: 2D context unavailable');
    this.canvas = c;
    this.ctx = ctx;
  }

  resize(): void {
    const dpr = globalThis.devicePixelRatio || 1;
    const w = Math.max(1, Math.floor(this.host.clientWidth * dpr));
    const h = Math.max(1, Math.floor(this.host.clientHeight * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
  }

  setCamera(x: number, y: number, zoom: number): void {
    this.camX = x;
    this.camY = y;
    this.zoom = zoom < 1 ? 1 : zoom > 64 ? 64 : zoom;
  }

  private baseScale(): number {
    return Math.min(this.canvas.width / this.worldWidth, this.canvas.height / this.worldHeight);
  }

  private effScale(): number {
    return this.baseScale() * this.zoom;
  }

  worldToScreen(wx: number, wy: number): { x: number; y: number } {
    const sc = this.effScale();
    return {
      x: (wx - this.camX) * sc + this.canvas.width / 2,
      y: (wy - this.camY) * sc + this.canvas.height / 2,
    };
  }

  onScreenRadius(slot: number, store: OrganismStore): number {
    const size = store.scalarGenes[slot * SCALAR_GENE_COUNT + ScalarGene.SIZE]!;
    return Math.max(1, size * this.effScale());
  }

  tierFor(pxR: number): 0 | 1 | 2 {
    return pxR < 6 ? 0 : pxR < 22 ? 1 : 2;
  }

  draw(store: OrganismStore): void {
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    const { liveIndices, liveCount, x, y } = store;
    const W = this.canvas.width;
    const H = this.canvas.height;
    for (let k = 0; k < liveCount; k++) {
      const i = liveIndices[k]!;
      const R = this.onScreenRadius(i, store);
      const tier = this.tierFor(R);
      if (tier === 0) continue; // far swarm stays on the WebGL pass
      const sp = this.worldToScreen(x[i]!, y[i]!);
      if (sp.x < -R || sp.x > W + R || sp.y < -R || sp.y > H + R) continue; // off-screen cull
      // Debug marker (Task 1 only): a hollow ring at the creature centre to verify alignment.
      ctx.save();
      ctx.translate(sp.x, sp.y);
      ctx.beginPath();
      ctx.arc(0, 0, R, 0, Math.PI * 2);
      ctx.strokeStyle = tier === 2 ? 'rgba(255,80,80,0.9)' : 'rgba(80,160,255,0.9)';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/render/detail-overlay.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Wire into `main.ts`**

After the `renderer` try/catch block (`main.ts:55`), add:

```ts
const overlay = new DetailOverlay(canvas, config.worldWidth, config.worldHeight);
```

Add the import at the top with the other render imports:

```ts
import { DetailOverlay } from '../render/detail-overlay';
```

Immediately after `renderer.draw(...)` at `main.ts:406`, add:

```ts
  overlay.setCamera(camX, camY, zoom);
  overlay.draw(world.store);
```

Find the existing `renderer.resize()` call (search for `renderer.resize`) and add `overlay.resize();` next to it so the overlay tracks viewport changes.

- [ ] **Step 6: tsc + verify wiring compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Manual visual check (fresh Vite port)**

Run: `npx vite --port 5191` (a fresh port — avoids the stale compiled `main.ts` gotcha). Open the app, zoom in (scroll) on a cluster; confirm the blue/red debug rings sit exactly concentric over the WebGL dots at multiple zoom levels and pan positions. Zoom out fully → rings vanish (all Tier 0). Stop the server.

- [ ] **Step 8: Commit**

```bash
git add src/render/detail-overlay.ts src/render/detail-overlay.test.ts src/app/main.ts
git commit -m "feat(render): detail overlay scaffold + camera sync (debug markers, Tier 1/2)"
```

---

## Task 2: GeneView + shape.ts + body module

**Files:**
- Create: `src/render/detail/gene-view.ts`
- Create: `src/render/detail/gene-view.test.ts`
- Create: `src/render/detail/shape.ts`
- Create: `src/render/detail/shape.test.ts`
- Create: `src/render/detail/registry.ts`
- Create: `src/render/detail/body.ts`
- Modify: `src/render/detail-overlay.ts` (replace the debug-marker block with a `dispatch()` call)

**Interfaces:**
- Produces (`gene-view.ts`):
  - `type RGB = [number, number, number];`
  - `interface Derived { fear: number; cute: number; base: RGB; ink: RGB; shadow: RGB; lite: RGB; screenUp: [number, number]; }`
  - `class GeneView { constructor(store: OrganismStore, slot: number); raw(g: number): number; norm(g: number): number; get diet(): number; get hue(): number; get heading(): number; get speed(): number; }`
    - `norm(g)` = `(raw - SCALAR_GENE_SPECS[g].min) / (SCALAR_GENE_SPECS[g].max - SCALAR_GENE_SPECS[g].min)`, clamped to [0,1].
    - `speed` = `Math.hypot(store.vx[slot], store.vy[slot])`.
  - `interface CreatureVisualCtx { ctx: CanvasRenderingContext2D; R: number; tier: 0|1|2; genes: GeneView; derived: Derived; opts: VisualOpts; }`
  - `interface VisualOpts { showCone: boolean; }`
  - `interface TraitModule { id: string; z: number; minTier: 0|1|2; draw(c: CreatureVisualCtx): void; }`
  - `function buildDerived(genes: GeneView): Derived` — ports reference lines 112-115, 120:
    - `fear = clamp(diet*1.15,0,1)`, `cute = 1-fear`
    - `sat = clamp((fear>0.5?0.85:0.72)*(0.6+0.4*((metab-0.5)*2)),0,1)` where `metab = genes.raw(ScalarGene.METAB_EFF)` — NOTE Task 7 replaces this with the shared `palette.metabSaturation`; for now inline it.
    - `base = hsv2rgb(hue, sat, lerp(0.92,0.82,fear))` then ×255 → `RGB`
    - `shadow = base*0.7`, `ink = base*0.34`, `lite = base*1.18` (clamped 0-255, integer)
    - `screenUp = [-sin(heading), -cos(heading)]`
- Produces (`shape.ts`):
  - `interface Pt { x: number; y: number; }`
  - `function bodyOutline(diet: number, R: number): Pt[]` — ports reference `outline()` exactly (N=72; `sc=round(5+diet*5)`, `amp=diet*0.55`, `sh=diet`; forward-taper `r*=1+0.22*max(0,cos a)-0.08*max(0,-cos a)`).
  - `function traceOutline(ctx: CanvasRenderingContext2D, pts: Pt[], smooth: boolean): void` — ports reference `trace()`.
- Produces (`registry.ts`):
  - `const MODULES: TraitModule[]` (sorted by `z` once at module load).
  - `function dispatch(c: CreatureVisualCtx): void` — runs each module where `minTier <= c.tier`.
- Consumes: `palette.hsv2rgb` (`src/render/palette.ts`), `SCALAR_GENE_SPECS`, `ScalarGene`, `SCALAR_GENE_COUNT` (`src/core/genome.ts`).

- [ ] **Step 1: Failing test — shape.ts** — `src/render/detail/shape.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { bodyOutline } from './shape';

describe('bodyOutline', () => {
  it('returns 72 points', () => {
    expect(bodyOutline(0, 10)).toHaveLength(72);
  });
  it('herbivore (diet 0) is a near-circle: low radial variance', () => {
    const pts = bodyOutline(0, 10);
    const radii = pts.map((p) => Math.hypot(p.x, p.y));
    const mean = radii.reduce((a, b) => a + b, 0) / radii.length;
    const variance = radii.reduce((a, r) => a + (r - mean) ** 2, 0) / radii.length;
    // forward taper still perturbs it, but spike amp = 0, so variance stays modest
    expect(variance).toBeLessThan((0.3 * mean) ** 2);
  });
  it('predator (diet 1) spikes: max radius noticeably exceeds mean', () => {
    const pts = bodyOutline(1, 10);
    const radii = pts.map((p) => Math.hypot(p.x, p.y));
    const mean = radii.reduce((a, b) => a + b, 0) / radii.length;
    expect(Math.max(...radii)).toBeGreaterThan(mean * 1.3);
  });
  it('forward taper biases mass toward +x (front bigger than back)', () => {
    const pts = bodyOutline(0, 10);
    const frontX = Math.max(...pts.map((p) => p.x));
    const backX = Math.min(...pts.map((p) => p.x));
    expect(frontX).toBeGreaterThan(-backX); // +x extent > -x extent
  });
});
```

- [ ] **Step 2: Run → fail** — `npx vitest run src/render/detail/shape.test.ts` → FAIL (no module).

- [ ] **Step 3: Implement `shape.ts`**

```ts
/** Procedural body outline ported from the validated flat-vector playground. Diet ramps spike count,
 *  amplitude, and edge sharpness; a forward taper biases radius toward +x so the front reads as the
 *  heading. Pure geometry (no canvas) so it is unit-testable; the body module traces it. */
const TAU = Math.PI * 2;

export interface Pt {
  x: number;
  y: number;
}

export function bodyOutline(diet: number, R: number): Pt[] {
  const N = 72;
  const pts: Pt[] = [];
  const sc = Math.round(5 + diet * 5);
  const amp = diet * 0.55;
  const sh = diet;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * TAU;
    const lo = Math.cos(a * sc);
    const sp = (1 - sh) * lo + sh * Math.sign(lo) * Math.pow(Math.abs(lo), 0.35);
    let r = R * (1 + amp * sp);
    const fw = Math.cos(a);
    r *= 1 + 0.22 * Math.max(0, fw) - 0.08 * Math.max(0, -fw);
    pts.push({ x: Math.cos(a) * r, y: Math.sin(a) * r });
  }
  return pts;
}

export function traceOutline(ctx: CanvasRenderingContext2D, pts: Pt[], smooth: boolean): void {
  ctx.beginPath();
  if (smooth) {
    for (let i = 0; i <= pts.length; i++) {
      const a = pts[i % pts.length]!;
      const b = pts[(i + 1) % pts.length]!;
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      if (i) ctx.quadraticCurveTo(a.x, a.y, mx, my);
      else ctx.moveTo(mx, my);
    }
  } else {
    pts.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)));
  }
  ctx.closePath();
}
```

- [ ] **Step 4: Run → pass** — `npx vitest run src/render/detail/shape.test.ts` → PASS (4 tests).

- [ ] **Step 5: Failing test — gene-view.ts** — `src/render/detail/gene-view.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { OrganismStore } from '../../core/store';
import { ScalarGene, SCALAR_GENE_COUNT, SCALAR_GENE_SPECS } from '../../core/genome';
import { GeneView, buildDerived } from './gene-view';

function view(overrides: Record<number, number> = {}, hue = 0.33, heading = 0): GeneView {
  const s = new OrganismStore(8);
  const i = s.alloc();
  s.heading[i] = heading;
  s.hue[i] = hue;
  const b = i * SCALAR_GENE_COUNT;
  for (let g = 0; g < SCALAR_GENE_COUNT; g++) s.scalarGenes[b + g] = SCALAR_GENE_SPECS[g]!.min;
  for (const [k, v] of Object.entries(overrides)) s.scalarGenes[b + Number(k)] = v;
  return new GeneView(s, i);
}

describe('GeneView', () => {
  it('raw reads the gene value', () => {
    const g = view({ [ScalarGene.DIET]: 0.7 });
    expect(g.raw(ScalarGene.DIET)).toBeCloseTo(0.7, 6);
    expect(g.diet).toBeCloseTo(0.7, 6);
  });
  it('norm maps min→0 and max→1, clamped', () => {
    const spec = SCALAR_GENE_SPECS[ScalarGene.VISION_RANGE]!;
    const g = view({ [ScalarGene.VISION_RANGE]: spec.max });
    expect(g.norm(ScalarGene.VISION_RANGE)).toBeCloseTo(1, 6);
    const lo = view({ [ScalarGene.VISION_RANGE]: spec.min });
    expect(lo.norm(ScalarGene.VISION_RANGE)).toBeCloseTo(0, 6);
  });
});

describe('buildDerived', () => {
  it('fear/cute track diet', () => {
    expect(buildDerived(view({ [ScalarGene.DIET]: 0 })).fear).toBeCloseTo(0, 6);
    expect(buildDerived(view({ [ScalarGene.DIET]: 1 })).fear).toBeCloseTo(1, 6);
    expect(buildDerived(view({ [ScalarGene.DIET]: 1 })).cute).toBeCloseTo(0, 6);
  });
  it('shadow is darker than base, lite is brighter', () => {
    const d = buildDerived(view({ [ScalarGene.DIET]: 0, [ScalarGene.METAB_EFF]: 1 }));
    const lum = (c: number[]) => c[0]! + c[1]! + c[2]!;
    expect(lum(d.shadow)).toBeLessThan(lum(d.base));
    expect(lum(d.lite)).toBeGreaterThanOrEqual(lum(d.base));
  });
  it('screenUp is the rotated screen-up vector', () => {
    const d = buildDerived(view({}, 0.33, 0));
    expect(d.screenUp[0]).toBeCloseTo(0, 6); // -sin(0)
    expect(d.screenUp[1]).toBeCloseTo(-1, 6); // -cos(0)
  });
});
```

- [ ] **Step 6: Run → fail** — `npx vitest run src/render/detail/gene-view.test.ts` → FAIL.

- [ ] **Step 7: Implement `gene-view.ts`**

```ts
import { type OrganismStore } from '../../core/store';
import { ScalarGene, SCALAR_GENE_COUNT, SCALAR_GENE_SPECS } from '../../core/genome';
import { hsv2rgb, type RGB } from '../palette';

export type { RGB };

const clamp01 = (t: number): number => (t < 0 ? 0 : t > 1 ? 1 : t);
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const mul = (c: RGB, f: number): RGB => [
  Math.min(255, Math.max(0, Math.round(c[0] * f))),
  Math.min(255, Math.max(0, Math.round(c[1] * f))),
  Math.min(255, Math.max(0, Math.round(c[2] * f))),
];

export interface Derived {
  fear: number;
  cute: number;
  base: RGB;
  ink: RGB;
  shadow: RGB;
  lite: RGB;
  screenUp: [number, number];
}

export interface VisualOpts {
  showCone: boolean;
}

export class GeneView {
  constructor(
    private readonly store: OrganismStore,
    readonly slot: number,
  ) {}
  raw(g: number): number {
    return this.store.scalarGenes[this.slot * SCALAR_GENE_COUNT + g]!;
  }
  norm(g: number): number {
    const spec = SCALAR_GENE_SPECS[g]!;
    return clamp01((this.raw(g) - spec.min) / (spec.max - spec.min));
  }
  get diet(): number {
    return this.raw(ScalarGene.DIET);
  }
  get hue(): number {
    return this.store.hue[this.slot]!;
  }
  get heading(): number {
    return this.store.heading[this.slot]!;
  }
  get speed(): number {
    return Math.hypot(this.store.vx[this.slot]!, this.store.vy[this.slot]!);
  }
}

export function buildDerived(genes: GeneView): Derived {
  const diet = genes.diet;
  const fear = clamp01(diet * 1.15);
  const cute = 1 - fear;
  const metab = genes.raw(ScalarGene.METAB_EFF);
  const sat = clamp01((fear > 0.5 ? 0.85 : 0.72) * (0.6 + 0.4 * ((metab - 0.5) * 2)));
  const base = hsv2rgb(genes.hue - Math.floor(genes.hue), sat, lerp(0.92, 0.82, fear));
  const h = genes.heading;
  return {
    fear,
    cute,
    base,
    shadow: mul(base, 0.7),
    ink: mul(base, 0.34),
    lite: mul(base, 1.18),
    screenUp: [-Math.sin(h), -Math.cos(h)],
  };
}

export interface CreatureVisualCtx {
  ctx: CanvasRenderingContext2D;
  R: number;
  tier: 0 | 1 | 2;
  genes: GeneView;
  derived: Derived;
  opts: VisualOpts;
}

export interface TraitModule {
  id: string;
  z: number;
  minTier: 0 | 1 | 2;
  draw(c: CreatureVisualCtx): void;
}
```

- [ ] **Step 8: Run → pass** — `npx vitest run src/render/detail/gene-view.test.ts` → PASS.

- [ ] **Step 9: Implement `body.ts`** (ports reference body block, lines 155-175; uses `screenUp` for the 2-tone clip)

```ts
import { type TraitModule, type RGB } from './gene-view';
import { bodyOutline, traceOutline } from './shape';

const rgb = (c: RGB): string => `rgb(${c[0]},${c[1]},${c[2]})`;

export const body: TraitModule = {
  id: 'body',
  z: 0,
  minTier: 1,
  draw({ ctx, R, genes, derived }) {
    const diet = genes.diet;
    const pts = bodyOutline(diet, R);
    const smooth = diet < 0.4;
    const lw = Math.max(1.5, R * 0.07);
    const [ux, uy] = derived.screenUp;
    const perp: [number, number] = [-uy, ux];
    const big = R * 4;

    // flat base fill
    traceOutline(ctx, pts, smooth);
    ctx.fillStyle = rgb(derived.base);
    ctx.fill();

    // hard 2-tone shadow (screen-down half), clipped to the body
    ctx.save();
    traceOutline(ctx, pts, smooth);
    ctx.clip();
    const d = R * 0.12;
    const c0: [number, number] = [ux * -d, uy * -d];
    ctx.fillStyle = rgb(derived.shadow);
    ctx.beginPath();
    ctx.moveTo(c0[0] + perp[0] * big, c0[1] + perp[1] * big);
    ctx.lineTo(c0[0] - perp[0] * big, c0[1] - perp[1] * big);
    ctx.lineTo(c0[0] - perp[0] * big - ux * big, c0[1] - perp[1] * big - uy * big);
    ctx.lineTo(c0[0] + perp[0] * big - ux * big, c0[1] + perp[1] * big - uy * big);
    ctx.closePath();
    ctx.fill();
    // flat top rim highlight
    const c2: [number, number] = [ux * (R * 0.55), uy * (R * 0.55)];
    ctx.fillStyle = `rgba(${derived.lite[0]},${derived.lite[1]},${derived.lite[2]},0.9)`;
    ctx.beginPath();
    ctx.moveTo(c2[0] + perp[0] * big, c2[1] + perp[1] * big);
    ctx.lineTo(c2[0] - perp[0] * big, c2[1] - perp[1] * big);
    ctx.lineTo(c2[0] - perp[0] * big + ux * big, c2[1] - perp[1] * big + uy * big);
    ctx.lineTo(c2[0] + perp[0] * big + ux * big, c2[1] + perp[1] * big + uy * big);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // crisp outline
    traceOutline(ctx, pts, smooth);
    ctx.lineWidth = lw;
    ctx.strokeStyle = rgb(derived.ink);
    ctx.lineJoin = 'round';
    ctx.stroke();
  },
};
```

- [ ] **Step 10: Implement `registry.ts`** (body only for now; later tasks add to the array)

```ts
import { type CreatureVisualCtx, type TraitModule } from './gene-view';
import { body } from './body';

// All trait modules, sorted once by draw order (z). Adding a gene's visual = import + add here.
export const MODULES: readonly TraitModule[] = [body].sort((a, b) => a.z - b.z);

export function dispatch(c: CreatureVisualCtx): void {
  for (const m of MODULES) if (m.minTier <= c.tier) m.draw(c);
}
```

- [ ] **Step 11: Replace the debug-marker block in `detail-overlay.ts`**

Replace the `ctx.save()…ctx.restore()` debug-ring block inside `draw()` with the real dispatch. Add a grounding shadow + rotate, then dispatch:

```ts
      ctx.save();
      ctx.translate(sp.x, sp.y);
      // grounding flat shadow (drawn unrotated, before the body rotates)
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      ctx.beginPath();
      ctx.ellipse(0, R * 0.5, R * 0.92, R * 0.3, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.rotate(store.heading[i]!);
      const genes = new GeneView(store, i);
      dispatch({ ctx, R, tier, genes, derived: buildDerived(genes), opts: this.opts });
      ctx.restore();
```

Add imports at the top of `detail-overlay.ts`:

```ts
import { GeneView, buildDerived, type VisualOpts } from './detail/gene-view';
import { dispatch } from './detail/registry';
```

Add an `opts` field + setter to `DetailOverlay` (default cone off; Task 4 wires the toggle):

```ts
  private opts: VisualOpts = { showCone: false };
  setShowCone(v: boolean): void {
    this.opts.showCone = v;
  }
```

- [ ] **Step 12: tsc + full test run**

Run: `npx tsc --noEmit && npx vitest run`
Expected: no tsc errors; all tests pass (existing 244 + new shape/gene-view + the Task-1 overlay test — note the Task-1 test's "marks Tier 1/2 → arc drawn" still holds because `body` draws arcs only via mouth/eyes which aren't registered yet; the body fill uses `quadraticCurveTo`/`lineTo`. **Update the Task-1 overlay test** assertion from `arc` to `quadraticCurveTo` for the herbivore body, OR set the test creature's diet so `traceOutline` non-smooth path uses `lineTo`. Simplest: change the Tier-2 assertion to `calls.some(c => c.startsWith('quadraticCurveTo') || c.startsWith('lineTo'))`.)

- [ ] **Step 13: Manual visual check** — `npx vite --port 5192`. Zoom in: herbivores (green) render as round soft blobs, predators (red) as angular spiky bodies, each with a hard 2-tone shadow on the screen-down side and a crisp outline. Toggle auto-motion / watch a moving creature → the body rotates so its tapered front leads. Stop server.

- [ ] **Step 14: Commit**

```bash
git add src/render/detail/ src/render/detail-overlay.ts src/render/detail-overlay.test.ts
git commit -m "feat(render): GeneView + shape generator + body trait module (diet morph, 2-tone, heading)"
```

---

## Task 3: eyes + brow modules

**Files:**
- Create: `src/render/detail/eyes.ts`
- Create: `src/render/detail/brow.ts`
- Create: `src/render/detail/eyes.test.ts`
- Modify: `src/render/detail/registry.ts` (register `eyes`, `brow`)

**Interfaces:**
- Consumes: `CreatureVisualCtx`, `GeneView.norm`, `derived.fear`, `ScalarGene.VISION_RANGE/VISION_FOV/VISION_ACUITY`.
- Produces: `export const eyes: TraitModule` (`z:10, minTier:1`), `export const brow: TraitModule` (`z:12, minTier:2`).
- Eye geometry (ported, reference 187-215): `eyeR = R*(0.16+visNorm*0.24)*lerp(1.35,0.82,fear)`, `fwd = R*0.30`, `lat = R*(0.30+(fov/π)*0.36)`. Pupils offset toward +x (`eyeR*0.30` cute, `eyeR*0.25` fearsome) so they read as looking forward. `fear<0.45` → round white eye + round dark pupil + catchlight; else almond slit eye (amber sclera scaling with fear) + vertical slit pupil; the eye unit is mirrored across the forward axis via `scale(1,s)` and slanted `rotate(-0.45*fear)`.
- Brow: only when `fear>=0.45` (predators); the angry slash `moveTo(-eyeR,-eyeR*1.15) → lineTo(eyeR*1.05,-eyeR*0.72)` in the same mirrored+rotated per-eye frame. **Decision:** because the brow shares the eye's per-eye rotated/mirrored transform, implement the brow stroke *inside* the same loop as a separate registered module is awkward — instead keep the brow as part of the `eyes` module's fearsome branch (the spec lists `brow` as conceptually separate, but it is geometrically welded to each eye). Register a no-op-safe `brow` module ID for the registry table's completeness OR fold it into `eyes`. **Chosen: fold brow into `eyes.ts`** (one module draws both eyes and their brows in the shared transform); do NOT create a separate `brow.ts`. Update the spec's module list note in the commit message.

  > Rationale: the reference draws the brow inside the same `ctx.save()/translate/scale/rotate` block as each eye (lines 209-211). Splitting it into a separate module would force re-deriving that exact per-eye transform, duplicating fragile math — violating DRY. The "one module per feature" guideline yields here to "features that share a transform live together."

- [ ] **Step 1: Failing test** — `src/render/detail/eyes.test.ts` (uses a recording mock ctx; assert structural invariants)

```ts
import { describe, it, expect } from 'vitest';
import { OrganismStore } from '../../core/store';
import { ScalarGene, SCALAR_GENE_COUNT, SCALAR_GENE_SPECS } from '../../core/genome';
import { GeneView, buildDerived, type CreatureVisualCtx } from './gene-view';
import { eyes } from './eyes';
import { recordingCtx } from './mock-ctx';

function ctxFor(overrides: Record<number, number>): CreatureVisualCtx {
  const s = new OrganismStore(8);
  const i = s.alloc();
  s.heading[i] = 0;
  s.hue[i] = 0.33;
  const b = i * SCALAR_GENE_COUNT;
  for (let g = 0; g < SCALAR_GENE_COUNT; g++) s.scalarGenes[b + g] = SCALAR_GENE_SPECS[g]!.min;
  for (const [k, v] of Object.entries(overrides)) s.scalarGenes[b + Number(k)] = v;
  const genes = new GeneView(s, i);
  const rec = recordingCtx();
  return {
    ctx: rec.ctx,
    R: 30,
    tier: 2,
    genes,
    derived: buildDerived(genes),
    opts: { showCone: false },
    // @ts-expect-error attach recorder for the test
    __rec: rec,
  };
}

describe('eyes module', () => {
  it('cute herbivore draws round eyes (arc) and no brow stroke', () => {
    const c = ctxFor({ [ScalarGene.DIET]: 0 });
    eyes.draw(c);
    const rec = (c as unknown as { __rec: ReturnType<typeof recordingCtx> }).__rec;
    expect(rec.counts.arc).toBeGreaterThanOrEqual(2); // two eyeballs (+pupils/catchlights)
  });
  it('fearsome predator draws almond eyes (no round eyeball arc for the sclera) + a brow stroke', () => {
    const c = ctxFor({ [ScalarGene.DIET]: 1 });
    eyes.draw(c);
    const rec = (c as unknown as { __rec: ReturnType<typeof recordingCtx> }).__rec;
    // predator sclera is an almond (moveTo/lineTo polygon), pupil is an ellipse, brow is a stroke
    expect(rec.counts.ellipse).toBeGreaterThanOrEqual(2); // slit pupils
    expect(rec.counts.stroke).toBeGreaterThanOrEqual(2); // brow slash per eye
  });
  it('bigger vision range → bigger eyes (more fill area proxy: larger arc radius arg)', () => {
    const small = ctxFor({ [ScalarGene.DIET]: 0, [ScalarGene.VISION_RANGE]: 0 });
    const big = ctxFor({ [ScalarGene.DIET]: 0, [ScalarGene.VISION_RANGE]: 256 });
    eyes.draw(small);
    eyes.draw(big);
    const r = (c: CreatureVisualCtx) =>
      Math.max(
        ...(c as unknown as { __rec: ReturnType<typeof recordingCtx> }).__rec.arcRadii,
      );
    expect(r(big)).toBeGreaterThan(r(small));
  });
});
```

- [ ] **Step 2: Create the mock ctx helper** — `src/render/detail/mock-ctx.ts`

```ts
/** A recording CanvasRenderingContext2D stub for unit tests (Node has no real canvas). Records call
 *  counts + arc radii so trait-module invariants (eye count, fang count, cone arc) can be asserted. */
export interface Recorder {
  ctx: CanvasRenderingContext2D;
  counts: Record<string, number>;
  arcRadii: number[];
  arcAngles: { start: number; end: number }[];
}

export function recordingCtx(): Recorder {
  const counts: Record<string, number> = {};
  const arcRadii: number[] = [];
  const arcAngles: { start: number; end: number }[] = [];
  const handler: ProxyHandler<object> = {
    get(_t, prop: string) {
      if (prop === 'canvas') return { width: 800, height: 600 };
      // settable style props read back as themselves; assignment is swallowed by the proxy set trap
      if (
        prop === 'fillStyle' ||
        prop === 'strokeStyle' ||
        prop === 'lineWidth' ||
        prop === 'lineJoin' ||
        prop === 'lineCap'
      )
        return '';
      return (...args: number[]) => {
        counts[prop] = (counts[prop] ?? 0) + 1;
        if (prop === 'arc') arcRadii.push(args[2]!);
        if (prop === 'arc' || prop === 'ellipse') {
          // arc: (x,y,r,start,end); ellipse: (x,y,rx,ry,rot,start,end)
          const s = prop === 'arc' ? args[3]! : args[5]!;
          const e = prop === 'arc' ? args[4]! : args[6]!;
          arcAngles.push({ start: s, end: e });
        }
      };
    },
    set() {
      return true; // swallow fillStyle/strokeStyle/etc assignments
    },
  };
  const ctx = new Proxy({}, handler) as unknown as CanvasRenderingContext2D;
  return { ctx, counts, arcRadii, arcAngles };
}
```

- [ ] **Step 3: Run → fail** — `npx vitest run src/render/detail/eyes.test.ts` → FAIL (no `./eyes`).

- [ ] **Step 4: Implement `eyes.ts`** (ports reference 187-215, brow folded in)

```ts
import { type TraitModule, type RGB } from './gene-view';
import { ScalarGene } from '../../core/genome';

const rgb = (c: RGB): string => `rgb(${c[0]},${c[1]},${c[2]})`;
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const TAU = Math.PI * 2;

export const eyes: TraitModule = {
  id: 'eyes',
  z: 10,
  minTier: 1,
  draw({ ctx, R, genes, derived }) {
    const fear = derived.fear;
    const vis = genes.norm(ScalarGene.VISION_RANGE);
    const fov = genes.raw(ScalarGene.VISION_FOV);
    const lw = Math.max(1.5, R * 0.07);
    const eyeR = R * (0.16 + vis * 0.24) * lerp(1.35, 0.82, fear);
    const fwd = R * 0.3;
    const lat = R * (0.3 + (fov / 3.14159) * 0.36);
    for (const s of [-1, 1] as const) {
      ctx.save();
      ctx.translate(fwd, s * lat);
      if (fear < 0.45) {
        // CUTE round eye
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(0, 0, eyeR, 0, TAU);
        ctx.fill();
        ctx.lineWidth = lw * 0.7;
        ctx.strokeStyle = rgb(derived.ink);
        ctx.stroke();
        const pr = eyeR * 0.5;
        const px = eyeR * 0.3;
        ctx.fillStyle = '#0a0f14';
        ctx.beginPath();
        ctx.arc(px, 0, pr, 0, TAU);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(px - pr * 0.4, -pr * 0.4, pr * 0.4, 0, TAU);
        ctx.fill();
      } else {
        // FEARSOME almond eye (slit pupil) + brow, mirrored across the forward axis
        ctx.scale(1, s);
        ctx.rotate(-0.45 * fear);
        ctx.fillStyle = `rgb(255,${(lerp(240, 200, fear) | 0)},${(lerp(220, 110, fear) | 0)})`;
        ctx.beginPath();
        ctx.moveTo(-eyeR, -eyeR * 0.15);
        ctx.lineTo(eyeR, -eyeR * 0.55);
        ctx.lineTo(eyeR * 0.9, eyeR * 0.5);
        ctx.lineTo(-eyeR * 0.9, eyeR * 0.35);
        ctx.closePath();
        ctx.fill();
        ctx.lineWidth = lw * 0.7;
        ctx.strokeStyle = rgb(derived.ink);
        ctx.lineJoin = 'round';
        ctx.stroke();
        const px = eyeR * 0.25;
        ctx.fillStyle = '#070b0f';
        ctx.beginPath();
        ctx.ellipse(px, 0, eyeR * 0.18, eyeR * 0.6, 0, 0, TAU);
        ctx.fill();
        // angry brow slash (same mirrored+rotated frame)
        ctx.strokeStyle = rgb(derived.ink);
        ctx.lineWidth = lw * 1.1;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(-eyeR * 1.0, -eyeR * 1.15);
        ctx.lineTo(eyeR * 1.05, -eyeR * 0.72);
        ctx.stroke();
      }
      ctx.restore();
    }
  },
};
```

Note: pupil offset uses a fixed forward bias (`+x`) since the local frame already points forward — pupils always read as looking where the creature heads, across full rotation (the rotation is applied by the overlay). The reference's `track` toggle is omitted (always-on look-forward is the desired behavior; no toggle needed).

- [ ] **Step 5: Run → pass** — `npx vitest run src/render/detail/eyes.test.ts` → PASS.

- [ ] **Step 6: Register in `registry.ts`**

```ts
import { eyes } from './eyes';
// ...
export const MODULES: readonly TraitModule[] = [body, eyes].sort((a, b) => a.z - b.z);
```

- [ ] **Step 7: tsc + full tests** — `npx tsc --noEmit && npx vitest run` → all pass.

- [ ] **Step 8: Manual check** — `npx vite --port 5193`. Zoom in: herbivores have big round forward-looking eyes; predators have narrowed amber slit eyes + angry mirrored down-V brows. Watch a creature turn through a full circle (or use the inspector's followed creature) → both eyes/pupils and brows stay correctly oriented at all headings, never flipping inside-out. Stop server.

- [ ] **Step 9: Commit**

```bash
git add src/render/detail/eyes.ts src/render/detail/eyes.test.ts src/render/detail/mock-ctx.ts src/render/detail/registry.ts
git commit -m "feat(render): eyes+brow trait module (cute round ↔ fearsome slit, size/spread/pupil from vision, heading-tracking)"
```

---

## Task 4: vision-cone module + toggle

**Files:**
- Create: `src/render/detail/vision-cone.ts`
- Create: `src/render/detail/vision-cone.test.ts`
- Modify: `src/render/detail/registry.ts` (register `visionCone`)
- Modify: `src/app/main.ts` (key toggle + pass to overlay)

**Interfaces:**
- Produces: `export const visionCone: TraitModule` (`z:-10, minTier:1`). Draws only when `c.opts.showCone`. Wedge: `coneLen = R*1.3 + visNorm*R*3.0`, arc from `-fov` to `+fov`, translucent `lite` fill + edge strokes (reference 128-136).
- Consumes: `c.opts.showCone`, `genes.norm(VISION_RANGE)`, `genes.raw(VISION_FOV)`.
- Toggle: key `e` (eyes/cone — `c`,`f`,`w`,`o`,`v`,`l` are taken; `e` is free) flips `showCone`, calls `overlay.setShowCone(...)`.

- [ ] **Step 1: Failing test** — `src/render/detail/vision-cone.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { OrganismStore } from '../../core/store';
import { ScalarGene, SCALAR_GENE_COUNT, SCALAR_GENE_SPECS } from '../../core/genome';
import { GeneView, buildDerived, type CreatureVisualCtx } from './gene-view';
import { visionCone } from './vision-cone';
import { recordingCtx } from './mock-ctx';

function ctxFor(showCone: boolean, fov: number, range: number): CreatureVisualCtx {
  const s = new OrganismStore(8);
  const i = s.alloc();
  s.heading[i] = 0;
  s.hue[i] = 0.33;
  const b = i * SCALAR_GENE_COUNT;
  for (let g = 0; g < SCALAR_GENE_COUNT; g++) s.scalarGenes[b + g] = SCALAR_GENE_SPECS[g]!.min;
  s.scalarGenes[b + ScalarGene.VISION_FOV] = fov;
  s.scalarGenes[b + ScalarGene.VISION_RANGE] = range;
  const genes = new GeneView(s, i);
  const rec = recordingCtx();
  return Object.assign(
    { ctx: rec.ctx, R: 30, tier: 2 as const, genes, derived: buildDerived(genes), opts: { showCone } },
    { __rec: rec },
  ) as unknown as CreatureVisualCtx;
}

describe('vision-cone module', () => {
  it('draws nothing when the toggle is off', () => {
    const c = ctxFor(false, 1, 100);
    visionCone.draw(c);
    expect((c as unknown as { __rec: ReturnType<typeof recordingCtx> }).__rec.counts.arc ?? 0).toBe(0);
  });
  it('arc half-angle equals FOV when on', () => {
    const fov = 0.8;
    const c = ctxFor(true, fov, 100);
    visionCone.draw(c);
    const ang = (c as unknown as { __rec: ReturnType<typeof recordingCtx> }).__rec.arcAngles[0]!;
    expect(ang.start).toBeCloseTo(-fov, 6);
    expect(ang.end).toBeCloseTo(fov, 6);
  });
});
```

- [ ] **Step 2: Run → fail** — `npx vitest run src/render/detail/vision-cone.test.ts` → FAIL.

- [ ] **Step 3: Implement `vision-cone.ts`**

```ts
import { type TraitModule, type RGB } from './gene-view';
import { ScalarGene } from '../../core/genome';

export const visionCone: TraitModule = {
  id: 'vision-cone',
  z: -10,
  minTier: 1,
  draw({ ctx, R, genes, derived, opts }) {
    if (!opts.showCone) return;
    const vis = genes.norm(ScalarGene.VISION_RANGE);
    const fov = genes.raw(ScalarGene.VISION_FOV);
    const lite: RGB = derived.lite;
    const coneLen = R * 1.3 + vis * R * 3.0;
    ctx.fillStyle = `rgba(${lite[0]},${lite[1]},${lite[2]},0.12)`;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, coneLen, -fov, fov);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = `rgba(${lite[0]},${lite[1]},${lite[2]},0.22)`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(-fov) * coneLen, Math.sin(-fov) * coneLen);
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(fov) * coneLen, Math.sin(fov) * coneLen);
    ctx.stroke();
  },
};
```

- [ ] **Step 4: Run → pass** — `npx vitest run src/render/detail/vision-cone.test.ts` → PASS.

- [ ] **Step 5: Register** — add `visionCone` to `MODULES` in `registry.ts`.

- [ ] **Step 6: Wire the toggle in `main.ts`** — in the `keydown` handler (`main.ts:311-330`), add:

```ts
  if (e.key === 'e' || e.key === 'E') {
    showCone = !showCone;
    overlay.setShowCone(showCone);
  }
```

Add the state var near the other toggles (`main.ts:84-87`):

```ts
let showCone = false; // vision cones on the detail overlay (toggle with 'e')
```

- [ ] **Step 7: tsc + full tests** — `npx tsc --noEmit && npx vitest run` → pass.

- [ ] **Step 8: Manual check** — `npx vite --port 5194`. Press `e`: translucent wedges appear ahead of each near creature; wide-FOV grazers show broad cones, narrow-FOV hunters tight ones; longer-range creatures cast longer cones; all point in the heading direction. Press `e` again → gone. Stop server.

- [ ] **Step 9: Commit**

```bash
git add src/render/detail/vision-cone.ts src/render/detail/vision-cone.test.ts src/render/detail/registry.ts src/app/main.ts
git commit -m "feat(render): vision-cone trait module + 'e' toggle (length←range, half-angle←FOV)"
```

---

## Task 5: maw module

**Files:**
- Create: `src/render/detail/maw.ts`
- Create: `src/render/detail/maw.test.ts`
- Modify: `src/render/detail/registry.ts`

**Interfaces:**
- Produces: `export const maw: TraitModule` (`z:5, minTier:1`; fangs only at `tier>=2`). Ports reference 177-185: mouth at `mx=R*0.62`, `gape = R*(0.10+eatNorm*0.4)*lerp(0.7,1.3,fear)`; small ellipse mouth when `fear<0.4`, larger when fearsome; fangs `teeth = round(2 + dmgNorm*6)` triangles when `dmgNorm>0.04 && tier>=2`.
- Consumes: `genes.norm(EAT_RATE)`, `genes.norm(DAMAGE)`, `derived.fear`, `c.tier`.

- [ ] **Step 1: Failing test** — `src/render/detail/maw.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { OrganismStore } from '../../core/store';
import { ScalarGene, SCALAR_GENE_COUNT, SCALAR_GENE_SPECS } from '../../core/genome';
import { GeneView, buildDerived, type CreatureVisualCtx } from './gene-view';
import { maw } from './maw';
import { recordingCtx } from './mock-ctx';

function ctxFor(tier: 0 | 1 | 2, overrides: Record<number, number>): CreatureVisualCtx {
  const s = new OrganismStore(8);
  const i = s.alloc();
  s.heading[i] = 0;
  s.hue[i] = 0.33;
  const b = i * SCALAR_GENE_COUNT;
  for (let g = 0; g < SCALAR_GENE_COUNT; g++) s.scalarGenes[b + g] = SCALAR_GENE_SPECS[g]!.min;
  for (const [k, v] of Object.entries(overrides)) s.scalarGenes[b + Number(k)] = v;
  const genes = new GeneView(s, i);
  const rec = recordingCtx();
  return Object.assign(
    { ctx: rec.ctx, R: 30, tier, genes, derived: buildDerived(genes), opts: { showCone: false } },
    { __rec: rec },
  ) as unknown as CreatureVisualCtx;
}
const rec = (c: CreatureVisualCtx) =>
  (c as unknown as { __rec: ReturnType<typeof recordingCtx> }).__rec;

describe('maw module', () => {
  it('no fangs when damage ~0', () => {
    const c = ctxFor(2, { [ScalarGene.DAMAGE]: 0 });
    maw.draw(c);
    // mouth is one ellipse; fang triangles use moveTo/lineTo — none expected
    expect(rec(c).counts.moveTo ?? 0).toBe(0);
  });
  it('more damage → more fang triangles (more closePath calls)', () => {
    const lo = ctxFor(2, { [ScalarGene.DAMAGE]: 2 });
    const hi = ctxFor(2, { [ScalarGene.DAMAGE]: 20 });
    maw.draw(lo);
    maw.draw(hi);
    expect(rec(hi).counts.closePath).toBeGreaterThan(rec(lo).counts.closePath);
  });
  it('fangs suppressed at tier 1 even with high damage', () => {
    const c = ctxFor(1, { [ScalarGene.DAMAGE]: 20 });
    maw.draw(c);
    expect(rec(c).counts.closePath ?? 0).toBe(0);
  });
});
```

- [ ] **Step 2: Run → fail** — `npx vitest run src/render/detail/maw.test.ts` → FAIL.

- [ ] **Step 3: Implement `maw.ts`**

```ts
import { type TraitModule, type RGB } from './gene-view';
import { ScalarGene } from '../../core/genome';

const rgb = (c: RGB): string => `rgb(${c[0]},${c[1]},${c[2]})`;
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const TAU = Math.PI * 2;

export const maw: TraitModule = {
  id: 'maw',
  z: 5,
  minTier: 1,
  draw({ ctx, R, tier, genes, derived }) {
    const fear = derived.fear;
    const eat = genes.norm(ScalarGene.EAT_RATE);
    const dmg = genes.norm(ScalarGene.DAMAGE);
    const lw = Math.max(1.5, R * 0.07);
    const mx = R * 0.62;
    const gape = R * (0.1 + eat * 0.4) * lerp(0.7, 1.3, fear);
    ctx.fillStyle = fear > 0.5 ? '#2a0707' : '#3a1414';
    ctx.strokeStyle = rgb(derived.ink);
    ctx.lineWidth = lw * 0.7;
    ctx.beginPath();
    if (fear < 0.4) ctx.ellipse(mx, 0, R * 0.15, gape * 0.65, 0, 0, TAU);
    else ctx.ellipse(mx, 0, R * 0.25, gape, 0, 0, TAU);
    ctx.fill();
    ctx.stroke();
    if (dmg > 0.04 && tier >= 2) {
      const teeth = Math.round(2 + dmg * 6);
      ctx.fillStyle = '#f6f2e8';
      for (let t = 0; t < teeth; t++) {
        const ty = -gape + ((t + 0.5) / teeth) * 2 * gape;
        const th = ((gape * (0.2 + dmg * 0.5)) / teeth) * 2.4;
        ctx.beginPath();
        ctx.moveTo(mx - R * 0.2, ty - th * 0.4);
        ctx.lineTo(mx + R * 0.08, ty);
        ctx.lineTo(mx - R * 0.2, ty + th * 0.4);
        ctx.closePath();
        ctx.fill();
      }
    }
  },
};
```

- [ ] **Step 4: Run → pass** — `npx vitest run src/render/detail/maw.test.ts` → PASS.

- [ ] **Step 5: Register** `maw` in `registry.ts`.

- [ ] **Step 6: tsc + full tests** — `npx tsc --noEmit && npx vitest run` → pass.

- [ ] **Step 7: Manual check** — `npx vite --port 5195`. High-EAT grazers show a wide soft mouth; high-DAMAGE predators bare more/larger fangs; low-damage creatures show none. Stop server.

- [ ] **Step 8: Commit**

```bash
git add src/render/detail/maw.ts src/render/detail/maw.test.ts src/render/detail/registry.ts
git commit -m "feat(render): maw trait module (gape←EAT_RATE, fang count/size←DAMAGE, tier-2 fangs)"
```

---

## Task 6: antennae + tail + fins modules

**Files:**
- Create: `src/render/detail/antennae.ts`, `tail.ts`, `fins.ts`
- Create: `src/render/detail/appendages.test.ts`
- Modify: `src/render/detail/registry.ts`

**Interfaces:**
- `tail` (`z:-5, minTier:1`): ports reference 144-149. `tLen = R*0.4 + speedNorm*R*1.7`, `tThick = R*(0.16 + thrustNorm*0.5)`. Filled `shadow` shape at the rear (−x). Consumes `genes.norm(MAX_SPEED)`, `genes.norm(MAX_THRUST)`.
- `fins` (`z:-4, minTier:2`): ports 150-153. `fins = round(1 + turnNorm*4)` little triangles down each flank. Consumes `genes.norm(MAX_TURN)`.
- `antennae` (`z:8, minTier:2`): ports 137-143. `aLen = R*0.5 + senseNorm*R*2.2`, two curved feelers at the front with tip knobs. Consumes `genes.norm(SENSE_RANGE)`.

- [ ] **Step 1: Failing test** — `src/render/detail/appendages.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { OrganismStore } from '../../core/store';
import { ScalarGene, SCALAR_GENE_COUNT, SCALAR_GENE_SPECS } from '../../core/genome';
import { GeneView, buildDerived, type CreatureVisualCtx } from './gene-view';
import { tail } from './tail';
import { fins } from './fins';
import { antennae } from './antennae';
import { recordingCtx } from './mock-ctx';

function ctxFor(tier: 0 | 1 | 2, overrides: Record<number, number>): CreatureVisualCtx {
  const s = new OrganismStore(8);
  const i = s.alloc();
  s.heading[i] = 0;
  s.hue[i] = 0.33;
  const b = i * SCALAR_GENE_COUNT;
  for (let g = 0; g < SCALAR_GENE_COUNT; g++) s.scalarGenes[b + g] = SCALAR_GENE_SPECS[g]!.min;
  for (const [k, v] of Object.entries(overrides)) s.scalarGenes[b + Number(k)] = v;
  const genes = new GeneView(s, i);
  const rec = recordingCtx();
  return Object.assign(
    { ctx: rec.ctx, R: 30, tier, genes, derived: buildDerived(genes), opts: { showCone: false } },
    { __rec: rec },
  ) as unknown as CreatureVisualCtx;
}
const rec = (c: CreatureVisualCtx) =>
  (c as unknown as { __rec: ReturnType<typeof recordingCtx> }).__rec;

describe('appendages', () => {
  it('tail draws a filled shape', () => {
    const c = ctxFor(2, { [ScalarGene.MAX_SPEED]: 10 });
    tail.draw(c);
    expect(rec(c).counts.fill).toBeGreaterThanOrEqual(1);
  });
  it('more MAX_TURN → more fins (more triangles)', () => {
    const lo = ctxFor(2, { [ScalarGene.MAX_TURN]: 0.05 });
    const hi = ctxFor(2, { [ScalarGene.MAX_TURN]: 1.2 });
    fins.draw(lo);
    fins.draw(hi);
    expect(rec(hi).counts.closePath).toBeGreaterThan(rec(lo).counts.closePath);
  });
  it('antennae are tier-2 only (suppressed at tier 1)', () => {
    const c1 = ctxFor(1, { [ScalarGene.SENSE_RANGE]: 256 });
    antennae.draw(c1);
    expect(rec(c1).counts.stroke ?? 0).toBe(0);
    const c2 = ctxFor(2, { [ScalarGene.SENSE_RANGE]: 256 });
    antennae.draw(c2);
    expect(rec(c2).counts.stroke).toBeGreaterThanOrEqual(2);
  });
});
```

Note: `tail`/`fins` are guarded by `minTier` in the registry, but a unit test calls `draw()` directly. Add an explicit `if (c.tier < this.minTier) return;` guard inside `antennae.draw` (since the test asserts tier-1 suppression by calling draw directly). For `tail`/`fins` the registry guard suffices; the tests above only call them at tier 2.

- [ ] **Step 2: Run → fail** — `npx vitest run src/render/detail/appendages.test.ts` → FAIL.

- [ ] **Step 3: Implement `tail.ts`**

```ts
import { type TraitModule, type RGB } from './gene-view';
import { ScalarGene } from '../../core/genome';

const rgb = (c: RGB): string => `rgb(${c[0]},${c[1]},${c[2]})`;

export const tail: TraitModule = {
  id: 'tail',
  z: -5,
  minTier: 1,
  draw({ ctx, R, genes, derived }) {
    const tLen = R * 0.4 + genes.norm(ScalarGene.MAX_SPEED) * R * 1.7;
    const tThick = R * (0.16 + genes.norm(ScalarGene.MAX_THRUST) * 0.5);
    const lw = Math.max(1.5, R * 0.07);
    ctx.fillStyle = rgb(derived.shadow);
    ctx.strokeStyle = rgb(derived.ink);
    ctx.lineWidth = lw * 0.8;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(-R * 0.8, -tThick);
    ctx.quadraticCurveTo(-R * 0.85 - tLen * 0.6, -tThick * 0.3, -R * 0.85 - tLen, 0);
    ctx.quadraticCurveTo(-R * 0.85 - tLen * 0.6, tThick * 0.3, -R * 0.8, tThick);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  },
};
```

- [ ] **Step 4: Implement `fins.ts`**

```ts
import { type TraitModule, type RGB } from './gene-view';
import { ScalarGene } from '../../core/genome';

const rgb = (c: RGB): string => `rgb(${c[0]},${c[1]},${c[2]})`;

export const fins: TraitModule = {
  id: 'fins',
  z: -4,
  minTier: 2,
  draw({ ctx, R, genes, derived }) {
    const fins = Math.round(1 + genes.norm(ScalarGene.MAX_TURN) * 4);
    const lw = Math.max(1.5, R * 0.07);
    ctx.fillStyle = rgb(derived.shadow);
    ctx.strokeStyle = rgb(derived.ink);
    ctx.lineWidth = lw * 0.7;
    for (let f = 0; f < fins; f++) {
      const t = fins === 1 ? 0.5 : f / (fins - 1);
      const ax = (-0.15 - t * 0.5) * R;
      for (const s of [-1, 1] as const) {
        const ay = s * R * 0.72;
        ctx.beginPath();
        ctx.moveTo(ax, ay * 0.85);
        ctx.lineTo(ax - R * 0.16, ay * 1.3);
        ctx.lineTo(ax + R * 0.16, ay * 1.02);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
    }
  },
};
```

- [ ] **Step 5: Implement `antennae.ts`** (explicit tier guard so the direct-call test passes)

```ts
import { type TraitModule, type RGB } from './gene-view';
import { ScalarGene } from '../../core/genome';

const rgb = (c: RGB): string => `rgb(${c[0]},${c[1]},${c[2]})`;
const TAU = Math.PI * 2;

export const antennae: TraitModule = {
  id: 'antennae',
  z: 8,
  minTier: 2,
  draw({ ctx, R, tier, genes, derived }) {
    if (tier < 2) return;
    const aLen = R * 0.5 + genes.norm(ScalarGene.SENSE_RANGE) * R * 2.2;
    const lw = Math.max(1.5, R * 0.07);
    ctx.strokeStyle = rgb(derived.ink);
    ctx.lineWidth = lw * 0.8;
    ctx.lineCap = 'round';
    for (const s of [-1, 1] as const) {
      ctx.beginPath();
      const bx = Math.cos(s * 0.5) * R * 0.6;
      const by = Math.sin(s * 0.5) * R * 0.6;
      ctx.moveTo(bx, by);
      ctx.quadraticCurveTo(R * 0.9, s * R * 0.6, R * 0.6 + aLen, s * (R * 0.5 + aLen * 0.45));
      ctx.stroke();
      ctx.fillStyle = rgb(derived.base);
      ctx.beginPath();
      ctx.arc(R * 0.6 + aLen, s * (R * 0.5 + aLen * 0.45), R * 0.12, 0, TAU);
      ctx.fill();
      ctx.lineWidth = lw * 0.7;
      ctx.strokeStyle = rgb(derived.ink);
      ctx.stroke();
    }
  },
};
```

- [ ] **Step 6: Run → pass** — `npx vitest run src/render/detail/appendages.test.ts` → PASS.

- [ ] **Step 7: Register all three** in `registry.ts`:

```ts
export const MODULES: readonly TraitModule[] = [
  visionCone,
  tail,
  fins,
  body,
  maw,
  antennae,
  eyes,
].sort((a, b) => a.z - b.z);
```

- [ ] **Step 8: tsc + full tests** — `npx tsc --noEmit && npx vitest run` → pass.

- [ ] **Step 9: Manual check** — `npx vite --port 5196`. Fast creatures grow long streamlined tails (thick when high-thrust); nimble high-turn creatures sport multiple side-fins; high-SENSE creatures wave long tipped antennae at the front. Confirm tail sits at the back at all headings. Stop server.

- [ ] **Step 10: Commit**

```bash
git add src/render/detail/tail.ts src/render/detail/fins.ts src/render/detail/antennae.ts src/render/detail/appendages.test.ts src/render/detail/registry.ts
git commit -m "feat(render): antennae/tail/fins trait modules (sense, speed/thrust, turn)"
```

---

## Task 7: Tier-0 WebGL upgrade — heading nub + rotated glyph + saturation←METAB_EFF + palette parity

**Files:**
- Modify: `src/render/palette.ts` (add `metabSaturation` helper + export its constants)
- Modify: `src/render/palette.test.ts` (pin the new helper)
- Modify: `src/render/renderer.ts` (new `a_heading` + `a_metab` attributes; rotate the glyph + heading nub in `DOT_FRAG`; saturation from metab)
- Modify: `src/render/detail/gene-view.ts` (`buildDerived` uses the shared `metabSaturation` to keep JS/GLSL in lockstep)

**Interfaces:**
- `palette.ts` adds:
  - `export const METAB_MIN = 0.5; export const METAB_MAX = 1.5;` (mirror of the gene spec; used by both sides)
  - `function metabSaturation(metab: number, fear: number): number` — the EXACT formula currently inlined in `buildDerived`: `clamp01((fear>0.5?0.85:0.72)*(0.6+0.4*((metab-0.5)*2)))`. Both the Tier-0 GLSL and `buildDerived` derive saturation from this single definition.
  - **Decision on Tier-0 saturation:** the GLSL `sat` line (`renderer.ts:73`) currently is `0.25 + 0.70*a_vis`. Replace with the `metabSaturation` formula expressed in GLSL, fed by a new `a_metab` attribute (normalized metab) — NOT `a_vis`. The diet/lineage `fear` term: Tier 0 has no per-fragment fear, but `a_diet` is available in the vertex shader; compute `fear = clamp(a_diet*1.15,0,1)` there. This keeps far/near consistent.
- `renderer.ts`:
  - Add `private readonly headingBuffer/headingScratch/aHeading` and `metabBuffer/metabScratch/aMetab` mirroring the existing attribute plumbing (buffer create, null-check, scratch alloc, per-creature fill, bind+bufferData+vertexAttribPointer).
  - Fill `headingScratch[k] = heading[i]` (radians) and `metabScratch[k] = norm(METAB_EFF)` in the draw loop (`renderer.ts:511-545`).
  - `DOT_VERT`: add `in float a_heading; in float a_metab;`, pass `flat out float v_heading;`, change `sat` to the metab formula.
  - `DOT_FRAG`: rotate the per-role glyph SDF by `-v_heading` (so the triangle/diamond points along heading) and carve a small heading **nub** (a tiny notch/bump at the front, `+x` after rotation) so even a circle reads its facing.

  > GLSL glyph rotation: in `DOT_FRAG`, before the shape test, rotate `c` by `+v_heading` (screen y-down): `vec2 cr = mat2(cos(v_heading), -sin(v_heading), sin(v_heading), cos(v_heading)) * c;` then run the existing discard tests on `cr` with the apex pointing toward +x instead of up. The heading nub: after the shape passes, if `cr.x > 0.30 && length(cr - vec2(0.42,0.0)) < 0.16` keep a `lite`-tinted pixel — OR simpler, add a small filled circle at `+x` by NOT discarding a disc centered at `(0.40,0)` radius `0.14`. Keep it cheap; the goal is just a directional cue.

- [ ] **Step 1: Failing parity test** — add to `src/render/palette.test.ts`

```ts
import { metabSaturation, METAB_MIN, METAB_MAX } from './palette';

describe('metabSaturation (Tier-0 ↔ Tier-1/2 lockstep)', () => {
  it('rises with metabolic efficiency', () => {
    const lo = metabSaturation(METAB_MIN, 0);
    const hi = metabSaturation(METAB_MAX, 0);
    expect(hi).toBeGreaterThan(lo);
  });
  it('is clamped to [0,1]', () => {
    expect(metabSaturation(10, 1)).toBeLessThanOrEqual(1);
    expect(metabSaturation(-10, 0)).toBeGreaterThanOrEqual(0);
  });
  it('fearsome creatures are more saturated at equal metab', () => {
    expect(metabSaturation(1, 1)).toBeGreaterThan(metabSaturation(1, 0));
  });
});
```

- [ ] **Step 2: Run → fail** — `npx vitest run src/render/palette.test.ts` → FAIL (`metabSaturation` undefined).

- [ ] **Step 3: Implement `metabSaturation` in `palette.ts`**

```ts
// ── Metabolic-efficiency saturation (freed from vision-range; see creature-visuals spec) ──────────
// Eye SIZE now carries vision range, so colour saturation is reassigned to METAB_EFF: efficient
// creatures are vivid, inefficient ones washed-out. `fear` (from diet) nudges the ceiling so
// predators read a touch more saturated. The Tier-0 GLSL mirrors this exact formula.
export const METAB_MIN = 0.5;
export const METAB_MAX = 1.5;

export function metabSaturation(metab: number, fear: number): number {
  return clamp01((fear > 0.5 ? 0.85 : 0.72) * (0.6 + 0.4 * ((metab - 0.5) * 2)));
}
```

- [ ] **Step 4: Run → pass** — `npx vitest run src/render/palette.test.ts` → PASS.

- [ ] **Step 5: Use the shared helper in `buildDerived`** — replace the inlined `sat` in `gene-view.ts`:

```ts
import { hsv2rgb, metabSaturation, type RGB } from '../palette';
// ...
  const sat = metabSaturation(genes.raw(ScalarGene.METAB_EFF), fear);
```

Run `npx vitest run src/render/detail/gene-view.test.ts` → still PASS (formula unchanged).

- [ ] **Step 6: Add the Tier-0 attribute plumbing in `renderer.ts`**

Add fields (near `aEfrac`/`efracBuffer`): `aHeading`, `aMetab`, `headingBuffer`, `metabBuffer`, `headingScratch`, `metabScratch` — mirror every place `efrac` appears (declaration, `getAttribLocation`, `createBuffer`, the null-check `if (!… )`, the `this.x = x` assignments, `new Float32Array(capacity)` scratch alloc).

`getAttribLocation`:
```ts
    this.aHeading = gl.getAttribLocation(this.dotProgram, 'a_heading');
    this.aMetab = gl.getAttribLocation(this.dotProgram, 'a_metab');
```

In the draw loop (`renderer.ts:511-545`), after the existing per-creature fills add:
```ts
        hdsc[k] = store.heading[i]!;
        mtsc[k] = scalarGenes[i * SCALAR_GENE_COUNT + ScalarGene.METAB_EFF]!;
```
(destructure `hdsc = this.headingScratch`, `mtsc = this.metabScratch` near the other `const … = this.*Scratch` lines; also add `METAB_MIN`/`METAB_MAX` import — normalize either here as `(value-METAB_MIN)/(METAB_MAX-METAB_MIN)` or in-shader. Normalize HERE to keep the shader simple: `mtsc[k] = (scalarGenes[...] - METAB_MIN)/(METAB_MAX-METAB_MIN);`).

After the `efrac` bind block (`renderer.ts:575-578`), add the heading + metab bind/bufferData/vertexAttribPointer blocks mirroring it (1 float each).

- [ ] **Step 7: Update the shaders**

`DOT_VERT` — add inputs + change `sat`:
```glsl
in float a_heading;
in float a_metab;        // normalized METAB_EFF [0,1] → saturation
flat out float v_heading;
```
Replace the `sat` line:
```glsl
  float fear = clamp(a_diet * 1.15, 0.0, 1.0);
  float satCeil = fear > 0.5 ? 0.85 : 0.72;
  float sat = clamp(satCeil * (0.6 + 0.4 * a_metab), 0.0, 1.0);
```
(Here `a_metab` is already normalized, so `(metab-0.5)*2` from the JS becomes just the normalized value `a_metab` — verify: JS `metab∈[0.5,1.5]`, `(metab-0.5)*2 ∈[0,2]`... wait, `(metab-0.5)*2` with metab=1.5 → 2.0, but the JS multiplies `0.4 * 2 = 0.8` → `0.6+0.8=1.4` pre-clamp. The normalized `a_metab=(metab-0.5)/1.0 ∈[0,1]`, so to match JS use `0.4 * (a_metab*2.0)`.) **Correct GLSL:**
```glsl
  float sat = clamp(satCeil * (0.6 + 0.4 * (a_metab * 2.0)), 0.0, 1.0);
```
Add `v_heading = a_heading;` at the end of `main()`.

`DOT_FRAG` — rotate the glyph by heading + add the nub:
```glsl
flat in float v_heading;
// ...
void main() {
  vec2 c = gl_PointCoord - vec2(0.5);
  float cs = cos(v_heading), sn = sin(v_heading);
  // rotate so local +x aligns with the heading direction (screen y-down)
  vec2 cr = vec2(cs * c.x - sn * c.y, sn * c.x + cs * c.y);
  bool keep;
  if (v_shape > 1.5) {            // predator: triangle, apex toward +x (front)
    float x = cr.x;
    keep = !(x > 0.5 || x < -0.4 || abs(cr.y) > (0.5 - x) * 0.62);
  } else if (v_shape > 0.5) {     // omnivore: diamond
    keep = (abs(cr.x) + abs(cr.y) <= 0.5);
  } else {                        // herbivore: circle
    keep = (dot(cr, cr) <= 0.25);
  }
  // heading nub: a small dot at the front (+x) so even a circle shows facing
  bool nub = distance(cr, vec2(0.42, 0.0)) < 0.13;
  if (!keep && !nub) discard;
  outColor = vec4(v_color, 1.0);
}
```

- [ ] **Step 8: tsc + full tests + determinism** — the shaders only compile at runtime, so:

```bash
npx tsc --noEmit && npx vitest run
```
Expected: all pass. **Determinism check:** rendering touches no sim arrays for writing, so the determinism suite is unaffected — but run it explicitly to honor the constraint:
```bash
npx vitest run src/core
```
Expected: byte-identical hashes (all `src/core` tests green).

- [ ] **Step 9: Manual check** — `npx vite --port 5197`. Zoom OUT to the swarm: dots now rotate to face their heading (triangles point along travel; circles/diamonds show a small front nub), and saturation now tracks metabolic efficiency (vivid efficient ↔ grey inefficient) rather than vision. Confirm the swarm still draws in one pass (no perf cliff). Cross-check a creature at the Tier-0↔Tier-1 boundary: hue/saturation match between the dot and the overlay sprite. Stop server.

- [ ] **Step 10: Commit**

```bash
git add src/render/palette.ts src/render/palette.test.ts src/render/renderer.ts src/render/detail/gene-view.ts
git commit -m "feat(render): Tier-0 heading-rotated glyph + nub + saturation←METAB_EFF (palette parity)"
```

---

## Task 8: LOD tuning + clutter pass

**Files:**
- Modify: `src/render/detail-overlay.ts` (final tier thresholds; optional per-tier module gating already via `minTier`)
- Modify: `src/app/main.ts` (cone default; any toggle help text)
- Possibly modify: `src/render/detail/registry.ts` (raise a module's `minTier` if it clutters at Tier 1)

**Interfaces:** No new exports. Tuning constants only.

- [ ] **Step 1: Perf + clutter review (manual)** — `npx vite --port 5198`. With the full demo running at 8192², sweep zoom from full-out to max. Watch for: (a) frame-rate dips when many creatures cross into Tier 1/2 (the overlay loop is O(visible); if a dense cluster tanks FPS, raise the Tier-1 threshold from 6px so fewer creatures get detail); (b) visual clutter at Tier 1 (if antennae/fins/cone are noisy when small, confirm their `minTier:2` keeps them off until Tier 2 — they already are); (c) cone default — confirm `showCone` defaults OFF (set in Task 1/4) so the swarm isn't a sea of wedges; the player opts in with `e`.

- [ ] **Step 2: Apply any threshold change** — if needed, adjust `tierFor` in `detail-overlay.ts`. Keep it a single source (the overlay), and keep the unit test's bucket expectations (Task 1) in sync — update `detail-overlay.test.ts` `tierFor` assertions if you move a boundary.

- [ ] **Step 3: Add a one-line toggle hint** — wherever the keyboard hints are surfaced (search `main.ts` / the HUD legend for the `f`/`w`/`o`/`v` hint text), add `e: vision cones`. If no such hint text exists, skip (no silent UI debt).

- [ ] **Step 4: tsc + full tests** — `npx tsc --noEmit && npx vitest run` → all pass.

- [ ] **Step 5: Final determinism sanity** — `npx vitest run src/core` → green (no sim drift from any render change).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(render): LOD threshold + clutter tuning pass for the detail overlay"
```

---

## Self-Review (completed against the spec)

**Spec coverage:**
- Heading legible from shape → Tasks 2 (body taper + rotate), 3 (eyes/pupils/brow), 7 (Tier-0 rotated glyph + nub). ✓
- Body shape from diet/predation → Task 2 (`bodyOutline`). ✓
- Eyes encode vision (size←range, spread←FOV, pupil←acuity) → Task 3. ✓ (acuity drives slit sharpness/pupil via the fearsome branch; range→eyeR, FOV→lat spread.)
- Broad gene→visual mapping table: DIET (T2), DAMAGE (T5), EAT_RATE (T5), SIZE (existing+overlay R), VISION_RANGE (T3 eye + T4 cone), VISION_FOV (T3 spread + T4 angle), VISION_ACUITY (T3), SENSE_RANGE (T6 antennae), MAX_SPEED (T6 tail), MAX_THRUST (T6 tail thickness), MAX_TURN (T6 fins), METAB_EFF (T7 saturation), hue (existing). ✓ All 13 rows covered.
- Hybrid LOD (Tier 0 WebGL / Tier 1-2 overlay) → Tasks 1, 7. ✓
- Trait-module registry → Task 2 (`registry.ts`, `TraitModule`, `dispatch`). ✓
- Shape generator ported → Task 2. ✓
- Saturation←METAB_EFF in BOTH GLSL + JS lockstep + parity test → Task 7. ✓
- Determinism byte-identical → constraint + Task 7/8 `src/core` runs. ✓
- Vision-cone toggle → Task 4. ✓

**Deviations flagged (with rationale, surfaced in commit messages):**
1. **`brow` folded into `eyes.ts`** rather than a separate module — the brow shares each eye's mirrored/rotated transform (reference 209-211); splitting duplicates fragile math (DRY). The spec lists `brow.ts` as a file; this plan intentionally does not create it. *If the owner wants strict one-file-per-feature, the brow can be re-extracted with a passed-in transform later.*
2. **Pupil `track` toggle dropped** — always look-forward is the desired behavior; a toggle adds UI with no value.
3. **VISION_ACUITY** maps to slit-pupil sharpness (fearsome eye) per the reference rather than a separate iris-ring on cute eyes; the spec's "pupil sharpness / iris-ring contrast" is satisfied by the slit. A richer acuity cue on round eyes is a natural future module.

**Placeholder scan:** none — every code step contains complete, runnable code ported from the validated reference.

**Type consistency:** `TraitModule`/`CreatureVisualCtx`/`Derived`/`GeneView`/`VisualOpts`/`RGB` defined once in `gene-view.ts`, consumed unchanged by every module and the overlay. `metabSaturation(metab,fear)` signature identical in both call sites. `dispatch(c)` / `MODULES` names consistent across Tasks 2-6.
