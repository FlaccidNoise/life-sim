# Senses & Smarter Creatures Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn wiggle-into-food foragers into fewer, smarter, longer-lived creatures that navigate a sparse, drifting world via three evolvable genome-wired senses (smell, sight, hearing) with an emergent predator-prey arms race — all under the existing invariants.

**Architecture:** Senses reach the brain through the existing `senseX/senseY` scratch pair: `cells/sense.ts` fills that pair per sensor cell (now routed by a new per-gene `senseSource` field selecting SMELL chemical-gradient / HEARING noise-gradient / SIGHT cone-query), then `neural/think.ts` projects it to one scalar per the unchanged `sensorChannel` (FWD_GRAD/LAT_GRAD). New mechanisms live as OFF-by-default Config knobs (`driftAmplitude`, `loudnessGain`, `viewRange`, etc.), a `NoiseField extends ScalarField` for hearing, retained per-patch drift state on `LightField`, and a dedicated cone-scan sight query over a wider hash window; `sim/world.ts` unpacks Config and orchestrates, while `cells/`+`physics/` stay scalar/array-only per the DAG.

**Tech Stack:** TypeScript (strict), Vitest, Vite, pnpm; data-oriented SoA engine.

## Global Constraints

- **Byte-identical determinism:** no `Math.random`/`Date.now` on the hot path; canonical bucket-then-ascending-slot scan order; sight "nearest" ties resolve via strict `<` on squared toroidal distance (`wrapDelta`) to first-in-canonical-scan-order. Drift phases/freqs drawn ONCE at init from a NEW dedicated `rng.split(6 /* STREAM_DRIFT */)` stream so existing streams (1–5) are unperturbed. `reproducibility.test.ts` gains a senses-ON + drift-ON case (byte-identical + non-vacuous over the expanded mutation range).
- **Cardinal rule:** sense/movement/death/sight-classification read ONLY `f.cellType[j]` and `organisms.carnivore[f.organismId[j]]` — never `founderId`/lineage/species/any id; nothing in `src/core/**` reads a "predator genome" label (carnivore is inferred from `organisms.carnivore`, set structurally by a PREDATOR cell at instantiate).
- **OFF-by-default & byte-identical-until-opt-in:** `driftAmplitude === 0` ⇒ light `cap[]` is NEVER recomputed (left exactly as `seedPatches` set it); `loudnessGain === 0` ⇒ `NoiseField` deposit+step skipped entirely; sight gated so no cone query runs without sight sensors (`viewRange === 0`); the new `senseSource`/`sightTarget` mutation draws and the bumped channel-count are gated behind senses-ON so baseline RNG draws stay byte-identical.
- **Zero-alloc hot loop:** new kernels (NoiseField step, sight cone query, occlusion, drift cap recompute, Gaussian-sum) allocate nothing per tick — reused pre-allocated scratch only.
- **`make check` green at every increment:** every task is RED (write failing vitest) → run-fail → GREEN (minimal impl) → run-pass → commit; gate with `make check`. Run a single file via `pnpm exec vitest run <file>`.

---

## File Structure

### Phase 1 — Drifting zones + longevity economy

| File | Created/Modified | Single responsibility |
|------|------------------|-----------------------|
| `src/core/environment/light-field.ts` | Modified | Retain per-patch drift state `{centerX, centerY, radius, peakCap, phase, freq}` (today's `init`/`seedPatches` discards centers); add `driftCap(tick, driftAmplitude)` that recomputes `cap[]` as a pure sum-of-Gaussians at the drifted centers via the shared helper. Recompute is skipped entirely when `driftAmplitude === 0`. |
| `src/core/environment/scalar-field.ts` | Modified | Factor out the single shared `gaussianSum(centers[], buf, normalizeTo)` helper that both `seedPatches` and the drift recompute call (one accumulation/normalization order → no float-non-associativity drift). |
| `src/core/sim/config.ts` | Modified | Add `driftAmplitude` (default 0) + the K-selection economy/movement re-tunes (still OFF/default-preserving as numbers); add the new `STREAM_DRIFT = 6` convention is documented but the stream id lives in world.ts. |
| `src/core/sim/world.ts` | Modified | Seed drift state from `rng.split(6 /* STREAM_DRIFT */)` at construction; call `light.driftCap(tickCount, cfg.driftAmplitude)` each tick (no-op when amplitude 0); unpack the re-tuned economy knobs. |
| `src/core/environment/light-field.test.ts` | Created | Unit: drift cap recompute (shared helper, amplitude-0 no-op byte-identical to seedPatches, center migrates with tick). |
| `src/probes/feel-probe.ts` (or existing probe harness) | Created/Modified | Headless feel-probe: record TODAY's navigation baseline (path-straightness toward food, time-to-food) + lifespan distribution; the gate for later phases. |

### Phase 2 — Hearing + sensor-modality scaffolding

| File | Created/Modified | Single responsibility |
|------|------------------|-----------------------|
| `src/core/environment/noise-field.ts` | Created | `export class NoiseField extends ScalarField {}` — the motion/loudness field (default deposit/diffuse/decay `step`), exactly like `GlowField`/`FoodField`. |
| `src/core/genome/genome.ts` | Modified | Add `senseSource: number` (+ `sightTarget: number`) to the `Gene` interface and `cloneGenome` copy. |
| `src/core/cells/sense-source.ts` | Created | `export const SenseSource = { SMELL: 0, SIGHT: 1, HEARING: 2 } as const` + `SightTarget = { FOOD: 0, PREY: 1, PREDATOR: 2 } as const` enums (the verbatim modality constants). |
| `src/core/genome/develop.ts` | Modified | Add `senseSource: number[]` (+ `sightTarget: number[]`) arrays to `DevelopedBody`; emit them per instance from the gene. |
| `src/core/neural/network.ts` | Modified | Add parallel `sensorSource: Uint8Array` (+ `sensorSightTarget: Uint8Array`) sized `maxNeurons`; extend `addSensor` + `removeSensorsFor` to carry/swap them. |
| `src/core/organism/instantiate.ts` | Modified | Pass `body.senseSource[i]` (+ `sightTarget`) to `net.addSensor`. |
| `src/core/cells/sense.ts` | Modified | Route per-sensor: fill `senseX/senseY` from `senseSource` — SMELL = existing chemical-gradient path; HEARING = `NoiseField` gradient. (SIGHT branch stubbed/zero here, lands in Phase 3.) |
| `src/core/sim/world.ts` | Modified | Construct `NoiseField`; end-of-tick (step 11b, over the post-lifecycle live set) deposit `loudnessGain * hypot(velX,velY)` per cell + `noise.step` — both skipped when `loudnessGain === 0`; pass `noise` + `loudnessGain` into `sense`. |
| `src/core/genome/mutate.ts` | Modified | Add `senseSource` mutation operator (+ bump the hardcoded `rng.int(6)` channel count), gated behind senses-ON. |
| `src/core/genome/traits.ts` | Modified | Count sense modalities for telemetry/signature if the modality is part of the structural signature. |
| `src/core/genome/critter-genome.ts` | Modified | Set `senseSource: SMELL` (default) on all existing sensor genes so existing founders are unchanged. |
| `src/core/environment/noise-field.test.ts` | Created | Unit: deposit = `loudnessGain·speed`, gradient read, diffuse/decay; OFF-when-gain-0. |
| `src/core/cells/sense.test.ts` | Modified | Unit: `senseSource` routing into `senseX/senseY` (SMELL vs HEARING). |

### Phase 3 — Sight (no occlusion), then 3b rock occlusion

| File | Created/Modified | Single responsibility |
|------|------------------|-----------------------|
| `src/core/cells/sight.ts` | Created | The dedicated cone query `sightVector(...)`: scan an `(2R+1)×(2R+1)` hash block (`R = ceil(viewRange/cellSize)`), find nearest cell of `sightTarget` class within `viewRange`/`viewHalfAngle`, exclude own organism, write `senseX/senseY = unitDir × proximity`; toroidal-seam double-count guard re-derived for the wider window. |
| `src/core/sim/config.ts` | Modified | Add `viewRange` (default 0 = OFF), `viewHalfAngle`. |
| `src/core/cells/sense.ts` | Modified | Wire the SIGHT branch to call `sightVector` with the cell's `sightTarget`. |
| `src/core/sim/world.ts` | Modified | Pass hash + `cells.fields` + `organisms.carnivore` + `viewRange`/`viewHalfAngle` (+ rocks for 3b) into `sense`/`sight`; gate so no query runs when `viewRange === 0`. |
| `src/core/cells/sight-occlusion.ts` | Created (3b) | Segment-from-eye-to-target vs rock-circle test (closest-point-on-segment-to-center < rockRadius) over rocks in the corridor via the rock grid; OFF-able sub-task. |
| `src/core/cells/sight.test.ts` | Created | Unit: nearest-in-cone, `(2R+1)²` window + toroidal-seam guard, target-class routing (FOOD/PREY/PREDATOR), tie-break, output encoding, zero-vector-when-empty. |
| `src/core/cells/sight-occlusion.test.ts` | Created (3b) | Unit: segment-vs-circle occlusion. |
| `src/scaling-bench` (existing bench) | Modified | Profile the sight cone cost ceiling (`R ≤ 3–4`), per the `predReach` discipline. |

### Phase 4 — Smart founder brains + movement/feel tuning

| File | Created/Modified | Single responsibility |
|------|------------------|-----------------------|
| `src/core/genome/critter-genome.ts` | Modified | Hand-wire founder forager/predator genomes that USE the senses (predator: SIGHT→steer-toward-prey + HEARING→home-in; prey: SMELL→food, SIGHT/HEARING→flee), with `senseSource`/`sightTarget` set; these are mutable starting genomes, NOT scripted behavior. |
| `src/core/sim/config.ts` | Modified | Raise `maxThrust`/turn/thrust response for decisive steering (the movement-gain tunes). |
| `src/core/sim/world.ts` | Modified | Unpack the movement gains (already plumbed; values change). |
| `src/core/genome/critter-genome.test.ts` (golden) | Created | Golden: sighted predator catches a fleeing prey; sight-only forager finds food faster than smell-only. |

### Phase 5 — Arms-race balance + brain-inspector sense labels

| File | Created/Modified | Single responsibility |
|------|------------------|-----------------------|
| `src/core/sim/config.ts` | Modified | Final 3-trophic balance knob values (still OFF-preserving defaults). |
| Brain-inspector UI (`src/ui/**` / `main.ts` inspector) | Modified | Label sensor inputs by `senseSource` so a sight-lock → interneuron → mover-pursuit chain is readable. |
| `READS-WRITES.md` | Modified | Document the sight tie-break rule + the new field reads/writes. |
| `src/core/sim/reproducibility.test.ts` | Modified | Add the senses-ON + drift-ON byte-identical + non-vacuous case. |
| `src/probes/feel-probe.ts` | Modified | Final multi-seed (≥5) long-run gate: lifespan ~3-5min, zone drift, predator/prey cycle >0 at 12k ticks, purposefulness delta ≥30%. |

---

## Shared Interface Contract

This contract is LAW. Every phase uses these exact names/types/signatures verbatim.

### New Config knobs (`src/core/sim/config.ts` — add to the `Config` interface AND `defaultConfig`)

All default to the OFF/byte-identical-preserving value.

```ts
// Drift (Phase 1) — pushes the light field toward few/tight/rich drifting Gaussian zones.
driftAmplitude: number;   // default 0 — 0 ⇒ cap[] NEVER recomputed (byte-identical). World units of center sway.

// Hearing (Phase 2)
loudnessGain: number;     // default 0 — 0 ⇒ NoiseField deposit+step skipped entirely. Deposit = loudnessGain·speed per cell.

// Sight (Phase 3)
viewRange: number;        // default 0 — 0 ⇒ no cone query runs (sight OFF). World units; cost ceiling R = ceil(viewRange/cellSize) ≤ 3–4.
viewHalfAngle: number;    // default 0 — cone half-angle in radians.
```

Phases 1/4 also RE-TUNE existing knobs (`basalCost`, `reproThreshold`, `reproParentFloor`, `maxThrust`, `turnRate`/`turnScale`, `thrustGain`/`thrustScale`, `lightPatchCount`, `lightPatchRadius`, `crowdDivideCap`) — these are NUMBER changes derived headlessly, NOT new fields. The default-config baseline used by `reproducibility.test.ts` must remain byte-identical UNLESS the test is explicitly updated.

### New gene attributes (stored on the `Gene` interface in `src/core/genome/genome.ts`)

The modality lives ON THE GENE (developmental recipe), flows through `DevelopedBody` arrays, and lands per-cell on parallel `NeuralNetwork` arrays — mirroring exactly how `sensorChannel` is already threaded.

```ts
// In Gene (genome.ts), alongside `sensorChannel`:
senseSource: number;   // SenseSource enum; default SenseSource.SMELL (0) so all existing genomes are unchanged.
sightTarget: number;   // SightTarget enum; only meaningful when senseSource === SIGHT. Default SightTarget.FOOD (0).
```

Both must be added to `cloneGenome` (genome.ts), to the `g(...)` gene factories in `critter-genome.ts` (all existing sensor genes get `senseSource: SenseSource.SMELL`), and to the add-gene/duplicate-gene paths in `mutate.ts`.

### Modality enums (`src/core/cells/sense-source.ts` — NEW file)

```ts
export const SenseSource = { SMELL: 0, SIGHT: 1, HEARING: 2 } as const;
export type SenseSourceValue = (typeof SenseSource)[keyof typeof SenseSource];
export const SightTarget = { FOOD: 0, PREY: 1, PREDATOR: 2 } as const;
export type SightTargetValue = (typeof SightTarget)[keyof typeof SightTarget];
```

The existing `SensorChannel` (FWD_GRAD=0, LAT_GRAD=1, AMBIENT_LIGHT=2, TEMP=3, TOXIN=4, GLOW=5) stays in `src/core/neural/network.ts` and is UNCHANGED — it still does the projection-to-scalar. A full sight organ = a PAIR of cells: `(senseSource SIGHT, sensorChannel FWD_GRAD)` + `(senseSource SIGHT, sensorChannel LAT_GRAD)`.

### `DevelopedBody` (`src/core/genome/develop.ts`) — add parallel arrays

```ts
senseSource: number[];   // per instance, copied from gene in emit()
sightTarget: number[];   // per instance, copied from gene in emit()
```

### `NeuralNetwork` (`src/core/neural/network.ts`) — add parallel per-binding arrays + change `addSensor`

```ts
readonly sensorSource: Uint8Array;       // sized maxNeurons, parallel to sensorCell/sensorChannel
readonly sensorSightTarget: Uint8Array;  // sized maxNeurons, parallel
// CHANGED signature:
addSensor(cell: number, channel: number, source: number, sightTarget: number): void;
// removeSensorsFor(cell) must swap-remove these two arrays too (alongside sensorCell/sensorChannel).
```

`instantiate.ts` updates its `net.addSensor(slotScratch[i]!, ch)` call site to pass `body.senseSource[i]!` and `body.sightTarget[i]!`.

### `NoiseField` (`src/core/environment/noise-field.ts` — NEW)

```ts
export class NoiseField extends ScalarField {}
```

Uses the inherited default `step(diffuse, decay)` (deposit/diffuse/decay), exactly like `GlowField`/`FoodField`. World owns one instance; deposit `loudnessGain * hypot(velX, velY)` per live cell at end-of-tick (step 11b), `step` it — both guarded `if (loudnessGain > 0)`.

### Per-patch drift state on `LightField` + shared Gaussian-sum helper

`seedPatches` (currently on `ScalarField`, protected, DISCARDS patch centers) is refactored to RETAIN per-patch records. `LightField` gains:

```ts
// Retained per-patch records (length = patchCount), seeded ONCE at init from STREAM_DRIFT:
readonly patchCenterX: Float32Array; // base center (grid coords or world — pick one and document)
readonly patchCenterY: Float32Array;
readonly patchRadius: Float32Array;
readonly patchPeakCap: Float32Array;
readonly patchPhase: Float32Array;
readonly patchFreq: Float32Array;

// Pure per-tick recompute; NO-OP and not called when driftAmplitude === 0:
driftCap(tick: number, driftAmplitude: number): void;
// center(t) = base + driftAmplitude·[sin(freq·t + phase), cos(freq·t + phase)]
```

The shared helper on `ScalarField` (called by BOTH `seedPatches` and `driftCap`) — ONE accumulation + normalization order:

```ts
protected gaussianSum(
  centerX: Float32Array, centerY: Float32Array, radius: Float32Array, amp: Float32Array,
  patchCount: number, out: Float32Array, lo: number, hi: number,
): void;
```

`init`/`seedPatches` signature change must keep the existing `LightField.init(rng, patchCount, patchRadius, lightMax)` public contract; the drift records + the `STREAM_DRIFT = 6` split are seeded inside it.

### Sight cone query (`src/core/cells/sight.ts` — NEW)

```ts
export function sightVector(
  i: number,                 // the eye cell slot
  f: CellArrays,
  hash: SpatialHash,
  carnivore: Uint8Array,     // organisms.carnivore — for PREY/PREDATOR classification
  sightTarget: number,       // SightTarget enum for THIS eye
  viewRange: number,
  viewHalfAngle: number,
  worldWidth: number,
  worldHeight: number,
  // 3b occlusion (OFF-able): rocks param added later
): void; // writes f.senseX[i], f.senseY[i]
```

- Scan `(2R+1)×(2R+1)` hash buckets, `R = ceil(viewRange / cellSize)`, NOT the shared 3×3 loop. Re-derive the toroidal-seam double-count guard for the wider window.
- Classification reads ONLY `f.cellType[j]` + `carnivore[f.organismId[j]]`: FOOD = nearest PHOTO/MEAT (`isEdibleBy`-style), PREY = nearest `isFlesh` cell on a non-carnivore organism, PREDATOR = nearest `isFlesh` cell on a carnivore organism. Exclude the eye's own organism (`f.organismId[j] !== f.organismId[i]`).
- Nearest by strict `<` on squared toroidal distance (`wrapDelta`); ties → first-in-canonical-scan-order (lowest bucket, then ascending sorted slot).
- Output: `senseX/senseY = unitDirToTarget × proximity`, `proximity = clamp((viewRange − dist)/viewRange, 0, 1)`; ZERO vector when no target in cone.

### `sense.ts` touch point (`src/core/cells/sense.ts`)

Current signature:
```ts
export function sense(live, n, f, food, preyField, carnivore, predField, fleeWeight): void
```
Becomes (add the hearing/sight inputs; route per sensor cell by its `senseSource`):
```ts
export function sense(
  live, n, f,
  food, preyField, carnivore, predField, fleeWeight,
  net: NeuralNetwork,        // to read per-sensor senseSource/sensorSightTarget
  noise: NoiseField, loudnessGain: number,
  hash: SpatialHash, viewRange: number, viewHalfAngle: number,
  worldWidth: number, worldHeight: number,
): void
```
Per sensor-capable cell: SMELL ⇒ existing chemical-gradient + flee path (unchanged when senses OFF); HEARING ⇒ `noise` gradient (only when `loudnessGain > 0`); SIGHT ⇒ `sightVector(...)` (only when `viewRange > 0`). When all new modalities are OFF the routing must collapse to byte-identical-to-today behavior.

### `think.ts` touch point (`src/core/neural/think.ts`)

`think(net, cellType, senseX, senseY, heading)` is UNCHANGED in its projection math — it already projects `senseX/senseY` per `sensorChannel` (FWD_GRAD/LAT_GRAD). Sight/hearing REUSE this projection; no new projection branch. The only think.ts change (Phase 5, optional) is if the inspector needs `senseSource` labels — read from `net.sensorSource`, not think.

### `mutate.ts` touch points (`src/core/genome/mutate.ts`)

- Add a `senseSource` mutation operator (and `sightTarget` when source becomes SIGHT), gated so it only draws RNG when senses-ON (a new `senseSourceRate` knob, default 0).
- The hardcoded `rng.int(6)` (channel count) at the SENSOR-channel-mutation, change-type-to-SENSOR, and add-gene sites must be bumped consistently AND gated so baseline (senses-OFF) draws are byte-identical. New genes/duplicated genes must initialize `senseSource`/`sightTarget` (default SMELL/FOOD).
- Add the matching `senseSourceRate: number` to the `MutationRates` interface, to `World.mutationRates`, and to `syncReproParams`.

---

## Phase 1 — Drifting zones + longevity economy

This phase makes the *world* right before any senses exist: the light field's patches gain retained per-patch records and can drift their centers via a pure `f(tick)` recompute, all behind a hard `driftAmplitude === 0` no-op so the default config stays byte-identical. It adds the `driftAmplitude` config knob (the K-selection economy re-tunes are deferred to Phase 4 — this phase only adds the *knob* and its plumbing, leaving every existing number untouched). It adds a dedicated `STREAM_DRIFT = 6` RNG substream so seeding drift phases/freqs cannot perturb any existing stream. It builds a headless feel-probe that records today's navigation/lifespan baseline (the gate for later phases). Finally it adds a drift-ON byte-identical reproducibility case.

**Determinism contract (read before writing any step):**
- `ScalarField.seedPatches` (scalar-field.ts:125-160) is shared by BOTH `LightField.init` (light-field.ts:30) and `TemperatureField.init` (temperature-field.ts:34). Its public/protected signature `seedPatches(rng, cap, patchCount, patchRadius, lo, hi)` MUST be preserved — TemperatureField still calls it with the same shape.
- `seedPatches` today draws, per patch, in this exact order: `pcx = rng.range(0, cols)`, `pcy = rng.range(0, rows)`, `amp = rng.range(0.5, 1)`. That draw order and RNG-call count MUST NOT change for the light/temperature seed (it is the byte-identical baseline). Drift phase/freq draws happen on a SEPARATE `STREAM_DRIFT` rng, AFTER the seed loop, drawn only inside `LightField.init`.
- Patch centers are stored in GRID coordinates (cols/rows), matching `pcx`/`pcy` as drawn. Document this.
- The shared `gaussianSum` helper does ONE accumulation + ONE global-max normalization, in row-major order, identical float ops to today's `seedPatches` body, so amplitude-0 drift and the seed produce byte-identical `cap[]`.
- `STREAM_DRIFT = 6` (streams 1-5 are taken: LIGHT=1, MUTATION=2, ROCKS=3, TEMP=4, CURRENT=5 — see world.ts:160/189/219/234/248).

### Task 1 — Shared `gaussianSum` helper on `ScalarField` (refactor `seedPatches` to use it; byte-identical)

**Files**
- Modify: `src/core/environment/scalar-field.ts` (the `seedPatches` body, lines 125-160; add a new `protected gaussianSum(...)` method)
- Test: `src/core/environment/scalar-field.test.ts` (Create if absent; otherwise add a `describe` block)

**Interfaces**
- Produces (new protected method on `ScalarField`):
```ts
protected gaussianSum(
  centerX: Float32Array, centerY: Float32Array, radius: Float32Array, amp: Float32Array,
  patchCount: number, out: Float32Array, lo: number, hi: number,
): void;
```
- `gaussianSum` accumulates `patchCount` toroidal Gaussian bumps into `out` (cleared first), then globally normalizes `out` to `[lo, hi]` — the exact accumulation/normalization that lives inside `seedPatches` today, factored out. `centerX[p]`/`centerY[p]` are grid coords; `radius[p]` is the patch radius in grid cells (sigma² = `2·radius·radius` per patch); `amp[p]` is the per-patch amplitude.
- Consumes: nothing new. `seedPatches` keeps its existing signature `seedPatches(rng, cap, patchCount, patchRadius, lo, hi)` and now (a) draws `pcx/pcy/amp` per patch into local scratch arrays in the SAME order, then (b) calls `gaussianSum`.

**Steps**

- [ ] RED — Create `src/core/environment/scalar-field.test.ts`. Because `seedPatches`/`gaussianSum` are `protected`, the test uses a tiny local subclass to expose them. Write a test asserting the refactor is byte-identical to the pre-refactor formula by computing the expected buffer independently:
```ts
import { describe, it, expect } from 'vitest';
import { ScalarField } from './scalar-field';
import { Rng } from '../math/rng';

// Expose protected members for white-box testing.
class TestField extends ScalarField {
  seed(rng: Rng, cap: Float32Array, count: number, radius: number, lo: number, hi: number): void {
    this.seedPatches(rng, cap, count, radius, lo, hi);
  }
  buf(): Float32Array {
    return this.a as Float32Array;
  }
  gsum(
    cx: Float32Array, cy: Float32Array, rad: Float32Array, amp: Float32Array,
    n: number, out: Float32Array, lo: number, hi: number,
  ): void {
    this.gaussianSum(cx, cy, rad, amp, n, out, lo, hi);
  }
}

// Independent reference: the exact pre-refactor seedPatches math.
function referenceSeed(
  cols: number, rows: number, draws: Array<[number, number, number]>, radius: number, lo: number, hi: number,
): Float32Array {
  const buf = new Float32Array(cols * rows);
  const sigma2 = 2 * radius * radius;
  for (const [pcx, pcy, amp] of draws) {
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        let dx = Math.abs(c - pcx);
        if (dx > cols / 2) dx = cols - dx;
        let dy = Math.abs(r - pcy);
        if (dy > rows / 2) dy = rows - dy;
        buf[r * cols + c]! += amp * Math.exp(-(dx * dx + dy * dy) / sigma2);
      }
    }
  }
  let max = 0;
  for (const v of buf) if (v > max) max = v;
  const range = hi - lo;
  const scale = max > 0 ? range / max : 0;
  for (let i = 0; i < buf.length; i++) buf[i] = buf[i]! * scale + lo;
  return buf;
}

describe('ScalarField.gaussianSum / seedPatches refactor', () => {
  it('seedPatches is byte-identical to the pre-refactor formula', () => {
    const cols = 16, rows = 16, count = 5, radius = 4, lo = 0, hi = 1;
    // Re-draw with the SAME rng + SAME draw order to build the reference.
    const rngRef = new Rng(42);
    const draws: Array<[number, number, number]> = [];
    for (let p = 0; p < count; p++) {
      const pcx = rngRef.range(0, cols);
      const pcy = rngRef.range(0, rows);
      const amp = rngRef.range(0.5, 1);
      draws.push([pcx, pcy, amp]);
    }
    const expected = referenceSeed(cols, rows, draws, radius, lo, hi);

    const f = new TestField(cols, rows, 256, 256);
    const cap = new Float32Array(cols * rows);
    f.seed(new Rng(42), cap, count, radius, lo, hi);

    expect(Array.from(f.buf())).toEqual(Array.from(expected));
    expect(Array.from(cap)).toEqual(Array.from(expected));
  });
});
```

- [ ] run-fail — `pnpm exec vitest run src/core/environment/scalar-field.test.ts`. Expected: FAILS to compile/run because `TestField.gsum` references `this.gaussianSum`, which does not exist yet (`Property 'gaussianSum' does not exist on type 'ScalarField'`). (The `seed` assertion would pass against current code, but the file won't typecheck until `gaussianSum` exists — that's the RED.)

- [ ] GREEN — In `src/core/environment/scalar-field.ts`, add the `gaussianSum` method and rewrite `seedPatches` to draw into scratch then delegate. Replace the whole `seedPatches` method body (lines 125-160) with:
```ts
  /**
   * One shared sum-of-Gaussians accumulation + global [lo,hi] normalization, in row-major
   * order. Called by BOTH seedPatches (init) and LightField.driftCap (per-tick recompute), so
   * there is exactly ONE accumulation/normalization order → no float-non-associativity drift
   * between the seed and the amplitude-0 recompute. `centerX/centerY` are grid coords; `radius`
   * is per-patch radius in grid cells (sigma² = 2·radius²); `amp` is per-patch amplitude.
   */
  protected gaussianSum(
    centerX: Float32Array,
    centerY: Float32Array,
    radius: Float32Array,
    amp: Float32Array,
    patchCount: number,
    out: Float32Array,
    lo: number,
    hi: number,
  ): void {
    const { cols, rows } = this;
    out.fill(0);
    for (let p = 0; p < patchCount; p++) {
      const pcx = centerX[p]!;
      const pcy = centerY[p]!;
      const a = amp[p]!;
      const sigma2 = 2 * radius[p]! * radius[p]!;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          let dx = Math.abs(c - pcx);
          if (dx > cols / 2) dx = cols - dx;
          let dy = Math.abs(r - pcy);
          if (dy > rows / 2) dy = rows - dy;
          out[r * cols + c]! += a * Math.exp(-(dx * dx + dy * dy) / sigma2);
        }
      }
    }
    let max = 0;
    for (const v of out) if (v > max) max = v;
    const range = hi - lo;
    const scale = max > 0 ? range / max : 0;
    for (let i = 0; i < out.length; i++) out[i] = out[i]! * scale + lo;
  }

  /**
   * Patchy seeded init shared by the climate fields: sum of `patchCount` random toroidal
   * Gaussian bumps, normalized to [lo, hi]. Writes both the live buffer and `cap`. Draws
   * pcx/pcy/amp per patch (UNCHANGED draw order + count → byte-identical seed), then defers
   * the accumulation/normalization to the shared gaussianSum helper.
   */
  protected seedPatches(
    rng: { range(min: number, max: number): number },
    cap: Float32Array,
    patchCount: number,
    patchRadius: number,
    lo: number,
    hi: number,
  ): void {
    const cx = new Float32Array(patchCount);
    const cy = new Float32Array(patchCount);
    const rad = new Float32Array(patchCount);
    const amp = new Float32Array(patchCount);
    for (let p = 0; p < patchCount; p++) {
      cx[p] = rng.range(0, this.cols);
      cy[p] = rng.range(0, this.rows);
      amp[p] = rng.range(0.5, 1);
      rad[p] = patchRadius;
    }
    const buf = this.a;
    this.gaussianSum(cx, cy, rad, amp, patchCount, buf, lo, hi);
    for (let i = 0; i < buf.length; i++) cap[i] = buf[i]!;
  }
```
NOTE: the per-patch `radius` array lets `gaussianSum` serve drift later; here every patch shares `patchRadius`. The seed allocates four small scratch arrays ONCE at init (not on the hot loop) — acceptable.

- [ ] run-pass — `pnpm exec vitest run src/core/environment/scalar-field.test.ts`. Expected: PASS (both `seed` byte-identical and the file now typechecks).

- [ ] Regression — `pnpm exec vitest run src/core/sim/reproducibility.test.ts`. Expected: PASS (the refactor preserved the light + temperature seed byte-for-byte, so default-config determinism is intact).

- [ ] commit —
```
git add src/core/environment/scalar-field.ts src/core/environment/scalar-field.test.ts && git commit -m "refactor(env): factor seedPatches into shared gaussianSum helper (byte-identical)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_018UVsSAVWXMgnQLC6ZpZ4yj"
```

### Task 2 — `driftAmplitude` config knob (default 0, byte-identical)

**Files**
- Modify: `src/core/sim/config.ts` (add `driftAmplitude: number` to the `Config` interface near the LightField block lines 19-31; add the default in `defaultConfig` near lines 330-336)
- Test: `src/core/sim/reproducibility.test.ts` already locks default-config byte-identity — no new test here; this is a pure additive default-0 knob covered by Task 5.

**Interfaces**
- Produces: `Config.driftAmplitude` (number). Per the contract: `default 0 — 0 ⇒ cap[] NEVER recomputed (byte-identical). World units of center sway.` Document that the sway is applied in GRID coordinates by `LightField.driftCap` (Task 3) — the comment must say "grid-cell units of center sway" to match the stored grid-coord centers.

**Steps**

- [ ] GREEN (interface) — In `src/core/sim/config.ts`, after the `lightDiffuse` field (line 31) inside the `Config` interface, add:
```ts
  /** Drift amplitude: per-patch light-zone center sway, in GRID-CELL units (centers are stored in
   *  grid coords). 0 = OFF: the light cap is NEVER recomputed after seeding (byte-identical to a
   *  static field). >0 = each tick cap[] is recomputed as a sum-of-Gaussians at the drifted centers
   *  via LightField.driftCap, so the rich zones slowly migrate and creatures must follow. */
  driftAmplitude: number;
```

- [ ] GREEN (default) — In `defaultConfig`, after `lightDiffuse: 0.1,` (line 336) add:
```ts
    driftAmplitude: 0, // OFF by default — cap[] is never recomputed; the field is static (byte-identical)
```

- [ ] run-pass — `pnpm exec vitest run src/core/sim/reproducibility.test.ts`. Expected: PASS (purely additive default-0 field; serialize/deserialize round-trips through `defaultConfig(parsed)`).

- [ ] Typecheck — `make typecheck`. Expected: clean (no consumer reads `driftAmplitude` yet).

- [ ] commit —
```
git add src/core/sim/config.ts && git commit -m "feat(sim): driftAmplitude config knob (default 0, OFF/byte-identical)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_018UVsSAVWXMgnQLC6ZpZ4yj"
```

### Task 3 — `LightField` retained per-patch drift records + `driftCap(tick, driftAmplitude)`

**Files**
- Modify: `src/core/environment/light-field.ts` (add the six per-patch `Float32Array` records + `seedDrift` private + `driftCap` public; extend `init` to seed drift state). Current `init` is lines 29-31; current `step` is lines 44-46.
- Test: `src/core/environment/light-field.test.ts` (Create)

**Interfaces**
- Consumes: `gaussianSum` (Task 1, inherited protected); `Rng` (from `../math/rng`, for seeding phases/freqs — passed in via a separate stream).
- Produces (per the contract, on `LightField`):
```ts
readonly patchCenterX: Float32Array; // base center, GRID coords
readonly patchCenterY: Float32Array; // base center, GRID coords
readonly patchRadius: Float32Array;  // grid cells
readonly patchPeakCap: Float32Array; // per-patch amplitude (the pre-normalization peak)
readonly patchPhase: Float32Array;
readonly patchFreq: Float32Array;
driftCap(tick: number, driftAmplitude: number): void; // pure recompute; NO-OP & not called at amplitude 0
```
- `init` signature is UNCHANGED publicly: `init(rng: Rng, patchCount: number, patchRadius: number, lightMax: number)` — but it now ALSO accepts the drift rng. Per the contract: "`init`/`seedPatches` signature change must keep the existing `LightField.init(rng, patchCount, patchRadius, lightMax)` public contract; the drift records + the `STREAM_DRIFT = 6` split are seeded inside it." To keep the seed byte-identical while seeding drift from a DIFFERENT stream, add a SECOND rng param `driftRng` (the caller passes `rng.split(6)`):
```ts
init(rng: Rng, patchCount: number, patchRadius: number, lightMax: number, driftRng: Rng): void;
```
World.ts (Task 4) supplies `driftRng = this.rng.split(6 /* STREAM_DRIFT */)`. Existing callers in tests that call 4-arg `init` must be updated (only world.ts calls it in src/).

**Drift recompute math (contract):** `center(t) = base + driftAmplitude·[sin(freq·t + phase), cos(freq·t + phase)]`, fed to `gaussianSum` with the retained `patchRadius` + `patchPeakCap`, normalized to `[0, lightMax]` — recompute writes into `this.cap`.

**Steps**

- [ ] RED — Create `src/core/environment/light-field.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { LightField } from './light-field';
import { Rng } from '../math/rng';

function freshCap(seed: number): { f: LightField; cap0: number[] } {
  const f = new LightField(16, 16, 256, 256);
  f.init(new Rng(seed), 5, 4, 1, new Rng(seed).split(6));
  return { f, cap0: Array.from(f.cap) };
}

describe('LightField.driftCap', () => {
  it('amplitude-0 recompute is byte-identical to the seeded cap (HARD no-op)', () => {
    const { f, cap0 } = freshCap(42);
    f.driftCap(123, 0); // amplitude 0
    expect(Array.from(f.cap)).toEqual(cap0); // cap untouched, byte-for-byte
  });

  it('amplitude-0 recompute at tick 0 also matches seed', () => {
    const { f, cap0 } = freshCap(7);
    f.driftCap(0, 0);
    expect(Array.from(f.cap)).toEqual(cap0);
  });

  it('amplitude>0 migrates the cap (it actually changes) but stays in [0, lightMax]', () => {
    const { f, cap0 } = freshCap(99);
    f.driftCap(500, 3); // amplitude 3 grid cells, tick 500
    const cap1 = Array.from(f.cap);
    expect(cap1).not.toEqual(cap0); // the zone moved
    for (const v of cap1) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1 + 1e-6);
    }
  });

  it('drift is a pure deterministic f(tick): same tick → same cap', () => {
    const a = freshCap(5).f;
    const b = freshCap(5).f;
    a.driftCap(250, 3);
    b.driftCap(250, 3);
    expect(Array.from(a.cap)).toEqual(Array.from(b.cap));
  });

  it('different ticks → different cap (the center is actually moving)', () => {
    const f = freshCap(13).f;
    f.driftCap(100, 3);
    const t100 = Array.from(f.cap);
    f.driftCap(400, 3);
    const t400 = Array.from(f.cap);
    expect(t400).not.toEqual(t100);
  });
});
```

- [ ] run-fail — `pnpm exec vitest run src/core/environment/light-field.test.ts`. Expected: FAIL to compile — `init` is called with 5 args but currently accepts 4 (`Expected 4 arguments, but got 5`), and `f.driftCap` does not exist (`Property 'driftCap' does not exist on type 'LightField'`).

- [ ] GREEN — Rewrite `src/core/environment/light-field.ts`. Add the six record arrays in the constructor, a private `seedDrift`, extend `init`, and add `driftCap`:
```ts
import { type Rng } from '../math/rng';
import { ScalarField } from './scalar-field';

export class LightField extends ScalarField {
  /** Per-patch capacity (the patchy target the field regenerates toward). */
  readonly cap: Float32Array;

  // Retained per-patch drift records (length = patchCount after init). Centers in GRID coords.
  readonly patchCenterX: Float32Array;
  readonly patchCenterY: Float32Array;
  readonly patchRadius: Float32Array;
  readonly patchPeakCap: Float32Array; // per-patch amplitude (pre-normalization peak)
  readonly patchPhase: Float32Array;
  readonly patchFreq: Float32Array;

  // Reused scratch for the drifted centers (alloc-free per-tick recompute).
  private readonly driftX: Float32Array;
  private readonly driftY: Float32Array;
  private patchCount = 0;
  private lightMax = 0;

  constructor(cols: number, rows: number, worldWidth: number, worldHeight: number) {
    super(cols, rows, worldWidth, worldHeight);
    this.cap = new Float32Array(cols * rows);
    this.patchCenterX = new Float32Array(0);
    this.patchCenterY = new Float32Array(0);
    this.patchRadius = new Float32Array(0);
    this.patchPeakCap = new Float32Array(0);
    this.patchPhase = new Float32Array(0);
    this.patchFreq = new Float32Array(0);
    this.driftX = new Float32Array(0);
    this.driftY = new Float32Array(0);
  }

  get light(): Float32Array {
    return this.a;
  }

  /**
   * Patchy seeded init: sum of `patchCount` random Gaussian bumps (toroidal), normalized and
   * clamped to [0, lightMax]. Sets both light and capacity. ALSO retains per-patch drift records
   * + seeds drift phase/freq from `driftRng` (a DEDICATED STREAM_DRIFT substream, NOT `rng`) so
   * adding drift cannot perturb the light seed (which still draws on `rng` exactly as before).
   */
  init(rng: Rng, patchCount: number, patchRadius: number, lightMax: number, driftRng: Rng): void {
    this.seedDrift(rng, patchCount, patchRadius, driftRng);
    this.lightMax = lightMax;
    // Seed the live buffer + cap byte-identically to the original seedPatches path. Because
    // seedDrift re-derived the SAME pcx/pcy/amp on the SAME `rng` in the SAME order, the retained
    // records exactly reproduce what seedPatches would have drawn — so we can seed cap directly
    // from gaussianSum at the BASE centers, which is byte-identical to seedPatches(rng,...).
    this.gaussianSum(
      this.patchCenterX, this.patchCenterY, this.patchRadius, this.patchPeakCap,
      this.patchCount, this.a, 0, lightMax,
    );
    for (let i = 0; i < this.cap.length; i++) this.cap[i] = this.a[i]!;
  }

  /**
   * Draw + retain the per-patch records. The pcx/pcy/amp draws use `rng` in the SAME order/count
   * as the legacy seedPatches (byte-identical light seed). Phase/freq draw on `driftRng`.
   */
  private seedDrift(rng: Rng, patchCount: number, patchRadius: number, driftRng: Rng): void {
    this.patchCount = patchCount;
    // (Re)allocate record arrays to patchCount (init-time only — never on the hot loop).
    (this.patchCenterX as Float32Array) = new Float32Array(patchCount);
    (this.patchCenterY as Float32Array) = new Float32Array(patchCount);
    (this.patchRadius as Float32Array) = new Float32Array(patchCount);
    (this.patchPeakCap as Float32Array) = new Float32Array(patchCount);
    (this.patchPhase as Float32Array) = new Float32Array(patchCount);
    (this.patchFreq as Float32Array) = new Float32Array(patchCount);
    (this.driftX as Float32Array) = new Float32Array(patchCount);
    (this.driftY as Float32Array) = new Float32Array(patchCount);
    for (let p = 0; p < patchCount; p++) {
      // SAME draws/order as legacy seedPatches (on `rng`):
      this.patchCenterX[p] = rng.range(0, this.cols);
      this.patchCenterY[p] = rng.range(0, this.rows);
      this.patchPeakCap[p] = rng.range(0.5, 1);
      this.patchRadius[p] = patchRadius;
      // Drift phase/freq on the DEDICATED stream (cannot perturb the light seed above):
      this.patchPhase[p] = driftRng.range(0, Math.PI * 2);
      this.patchFreq[p] = driftRng.range(0.0005, 0.002); // slow sway (radians/tick)
    }
  }

  /**
   * Pure per-tick cap recompute. center(t) = base + driftAmplitude·[sin(freq·t+phase),
   * cos(freq·t+phase)], summed-and-normalized via the shared gaussianSum (same order as the seed →
   * amplitude-0 reproduces the seeded cap byte-for-byte). Allocation-free (reused driftX/driftY).
   * Callers MUST skip this entirely when driftAmplitude === 0 (the byte-identical guarantee).
   */
  driftCap(tick: number, driftAmplitude: number): void {
    const n = this.patchCount;
    for (let p = 0; p < n; p++) {
      const ph = this.patchFreq[p]! * tick + this.patchPhase[p]!;
      this.driftX[p] = this.patchCenterX[p]! + driftAmplitude * Math.sin(ph);
      this.driftY[p] = this.patchCenterY[p]! + driftAmplitude * Math.cos(ph);
    }
    this.gaussianSum(
      this.driftX, this.driftY, this.patchRadius, this.patchPeakCap,
      n, this.cap, 0, this.lightMax,
    );
  }

  depleteAt(x: number, y: number, amount: number): void {
    const i = this.patchIndex(x, y);
    const v = this.a[i]! - amount;
    this.a[i] = v > 0 ? v : 0;
  }

  override step(diffuse: number, regen: number): void {
    this.stepRelax(diffuse, regen, this.cap, true);
  }
}
```
NOTE on the `readonly` reassignment idiom: TypeScript forbids reassigning a `readonly` field after the constructor. To keep them `readonly` to consumers but reallocated in `seedDrift`, drop the `readonly` modifier on the six record arrays + driftX/driftY and instead declare them as plain mutable fields initialized to `new Float32Array(0)`. Adjust the class to declare `patchCenterX: Float32Array;` (no `readonly`) etc. — the contract lists them `readonly` but reallocation at init forces mutable; document the deviation in a one-line comment. If you prefer to honor `readonly` exactly, instead size all six to `patchCount` in the CONSTRUCTOR by threading `patchCount` through — but the constructor today takes only grid/world dims, so the simpler, correct choice is mutable fields. Use mutable fields; remove `readonly` from those eight declarations.

- [ ] GREEN (fix call sites) — `init` now needs 5 args. The only `src/` caller is `world.ts` (Task 4). For THIS task's test to compile, no other change is needed. Run `grep -rn "\.light\.init(\|new LightField" src --include=*.ts` and confirm the only production caller is `world.ts`; tests that construct a LightField directly (the new light-field.test.ts) already pass 5 args.

- [ ] run-pass — `pnpm exec vitest run src/core/environment/light-field.test.ts`. Expected: PASS (amplitude-0 is byte-identical, amplitude>0 migrates, pure f(tick)).

- [ ] commit —
```
git add src/core/environment/light-field.ts src/core/environment/light-field.test.ts && git commit -m "feat(env): LightField per-patch drift records + driftCap recompute (amplitude-0 = byte-identical no-op)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_018UVsSAVWXMgnQLC6ZpZ4yj"
```

### Task 4 — Wire drift into `World`: seed `STREAM_DRIFT`, call `driftCap` each tick (guarded)

**Files**
- Modify: `src/core/sim/world.ts` (the `light.init` call at lines 159-164; add a `driftCap` call immediately before `this.light.step(...)` at line 723)
- Test: covered by Task 5's reproducibility cases (default OFF byte-identical + drift-ON byte-identical). No standalone unit here — World wiring is integration-tested by the repro suite.

**Interfaces**
- Consumes: `LightField.init(rng, patchCount, patchRadius, lightMax, driftRng)` (Task 3), `LightField.driftCap(tick, driftAmplitude)` (Task 3), `Config.driftAmplitude` (Task 2).
- Produces: drift state seeded from `this.rng.split(6 /* STREAM_DRIFT */)`; `cap[]` recomputed each tick when `cfg.driftAmplitude > 0`, BEFORE `light.step` relaxes the field toward `cap`.

**Steps**

- [ ] GREEN (seed) — In `src/core/sim/world.ts`, change the `this.light.init(...)` call (lines 159-164) to pass the dedicated drift stream as the 5th arg:
```ts
    this.light.init(
      this.rng.split(1 /* STREAM_LIGHT */),
      config.lightPatchCount,
      config.lightPatchRadius,
      config.lightMax,
      this.rng.split(6 /* STREAM_DRIFT */),
    );
```

- [ ] GREEN (per-tick recompute) — In `tick()`, immediately BEFORE the existing `this.light.step(cfg.lightDiffuse, cfg.lightRegen);` at line 723, insert the guarded drift recompute:
```ts
    // Phase-1 drifting zones: recompute the light cap at the drifted patch centers BEFORE the
    // field relaxes toward it. Hard-skipped at amplitude 0 → cap[] is never touched (byte-identical).
    if (cfg.driftAmplitude > 0) this.light.driftCap(this.tickCount, cfg.driftAmplitude);
    this.light.step(cfg.lightDiffuse, cfg.lightRegen);
```

- [ ] run-pass (default OFF) — `pnpm exec vitest run src/core/sim/reproducibility.test.ts`. Expected: PASS. The default config has `driftAmplitude: 0`, so `driftCap` is never called and the new `STREAM_DRIFT` split does NOT perturb any existing stream (it is a fresh `hash32(seed, 6)`, drawn only inside `init`, after the light seed). Byte-identity holds.

- [ ] run-pass (full suite) — `make check`. Expected: typecheck + lint + all tests green.

- [ ] commit —
```
git add src/core/sim/world.ts && git commit -m "feat(sim): wire LightField drift (STREAM_DRIFT=6 seed + guarded per-tick driftCap); OFF by default

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_018UVsSAVWXMgnQLC6ZpZ4yj"
```

### Task 5 — Reproducibility: drift-ON byte-identical + non-vacuous (cap actually moved)

**Files**
- Modify: `src/core/sim/reproducibility.test.ts` (add a new `describe` block at the end, after the predation block which ends at line 479)
- Test: this file IS the test.

**Interfaces**
- Consumes: `World`, `defaultConfig` (already imported lines 2-3). Drift is turned ON via `driftAmplitude > 0` plus a small light grid so the cap changes are observable.
- Produces: a case proving (a) two drift-ON runs are byte-identical across the SoA, and (b) non-vacuity — the light `cap` differs between an early tick and a late tick (the zone actually migrated), so the test cannot pass on a no-op.

**Steps**

- [ ] RED — Append to `src/core/sim/reproducibility.test.ts`:
```ts
describe('reproducibility — drifting light zones ON', () => {
  // The default OFF path (driftAmplitude 0) is covered by every suite above (cap[] is never
  // recomputed). This pins the drift-ON hot path: driftCap must be byte-deterministic across runs
  // AND non-vacuously active (the cap actually migrates between an early and a late tick).
  function runDrift(seed: number): { w: World; capEarly: number[]; capLate: number[] } {
    const w = new World(
      defaultConfig({
        seed,
        maxCells: 2000,
        worldWidth: 512,
        worldHeight: 512,
        lightGridCols: 16,
        lightGridRows: 16,
        lightPatchCount: 4,
        lightPatchRadius: 3,
        driftAmplitude: 4, // ON: 4 grid-cell sway
      }),
      false,
    );
    w.seedLife(800);
    let capEarly: number[] = [];
    let capLate: number[] = [];
    for (let t = 0; t < 400; t++) {
      w.tick();
      if (t === 10) capEarly = Array.from(w.light.cap);
      if (t === 399) capLate = Array.from(w.light.cap);
    }
    return { w, capEarly, capLate };
  }

  it('produces byte-identical SoA + light cap across two drift-ON runs', () => {
    const a = runDrift(31);
    const b = runDrift(31);
    const fa = a.w.cells.fields;
    const fb = b.w.cells.fields;
    expect(Array.from(fa.posX)).toEqual(Array.from(fb.posX));
    expect(Array.from(fa.posY)).toEqual(Array.from(fb.posY));
    expect(Array.from(fa.energy)).toEqual(Array.from(fb.energy));
    expect(Array.from(a.w.light.cap)).toEqual(Array.from(b.w.light.cap));
    expect(a.capLate).toEqual(b.capLate);
  });

  it('is non-vacuous: the cap migrates between early and late ticks (drift actually fired)', () => {
    const { capEarly, capLate } = runDrift(31);
    expect(capEarly).not.toEqual(capLate); // the rich zone moved — driftCap recomputed cap[]
  });
});
```
This requires `w.light` to be publicly accessible. Confirm with `grep -n "light:" src/core/sim/world.ts` — `this.light` is a public field (it is referenced as `a.w.light.cap` style elsewhere is NOT yet present; verify it is `public`/`readonly`, not `private`). If `light` is private, the minimal fix is to widen it to `readonly light: LightField` (it already must be readable for the field-step; check the declaration around line 60-75).

- [ ] run-fail — `pnpm exec vitest run src/core/sim/reproducibility.test.ts -t "drifting light zones"`. Expected: this should PASS already if Tasks 2-4 are committed (drift wired + deterministic). To make it a genuine RED-first, run this test step BEFORE committing Task 4's world wiring — at that point `driftAmplitude` is unconsumed so `capEarly === capLate` and the non-vacuity assertion FAILS (`expected [...] not to equal [...]`). If Tasks 2-4 are already committed, treat this as a regression-lock test (it must pass) and note that the non-vacuity assertion is what proves it is not testing a no-op.

- [ ] run-pass — `pnpm exec vitest run src/core/sim/reproducibility.test.ts`. Expected: PASS for both the new drift cases AND all pre-existing cases (default OFF byte-identity unbroken).

- [ ] Full gate — `make check`. Expected: typecheck + lint + all tests green.

- [ ] commit —
```
git add src/core/sim/reproducibility.test.ts && git commit -m "test(sim): drift-ON byte-identical + non-vacuous reproducibility case

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_018UVsSAVWXMgnQLC6ZpZ4yj"
```

### Task 6 — Feel-probe: record TODAY's navigation + lifespan baseline (the Phase-1 gate)

**Files**
- Create: `src/headless/sense-feel-probe.ts` (a `tsx`-run headless script, mirroring `src/headless/env-feel-probe.ts` / `src/headless/feel-probe.ts` in style — NOT a vitest test)
- Test: none (headless probes are run manually via `pnpm exec tsx`, like the other probes in `src/headless/`). It is a measurement instrument, not an assertion gate; its output is the recorded baseline for Phase 4/5's purposefulness-delta comparison.

**Interfaces**
- Consumes: `World`, `defaultConfig`/`Config` (from `../core/sim/config`), `buildForagerGenome` (from `../core/genome/critter-genome`), `develop` (`../core/genome/develop`), `instantiateBody` (`../core/organism/instantiate`) — exactly the imports `feel-probe.ts` uses (verify the signatures by reading `src/headless/feel-probe.ts`'s `spawn` helper, lines ~33-50).
- Produces: prints to stdout (a) path-straightness toward food (net displacement toward the nearest food zone / total path length, averaged over the tracked foragers), (b) mean time-to-food (ticks until a tracked forager first reaches a high-light cell), (c) lifespan distribution (mean/median/p90 ticks a forager organism survives). These three numbers ARE the baseline the design's success-bar §4 compares against.

**Steps**

- [ ] Implement — Create `src/headless/sense-feel-probe.ts`. Model the harness on `feel-probe.ts` (read it first for the exact `spawn` + `World` lifecycle). Concretely:
```ts
/**
 * Phase-1 NAVIGATION BASELINE probe (the gate for the senses sub-project). Records TODAY's
 * forager behavior — BEFORE any new senses — so later phases can prove the ≥30% purposefulness
 * improvement from the design's success bar §4. Reports: path-straightness toward food,
 * time-to-food, and lifespan distribution. Pure measurement, no assertions.
 * Run: pnpm exec tsx src/headless/sense-feel-probe.ts
 */
import { World } from '../core/sim/world';
import { defaultConfig, type Config } from '../core/sim/config';
import { develop } from '../core/genome/develop';
import { instantiateBody } from '../core/organism/instantiate';
import { buildForagerGenome } from '../core/genome/critter-genome';

const BASE: Partial<Config> = {
  worldWidth: 2048,
  worldHeight: 2048,
  // TODAY's economy/movement (defaults) — record the pre-tune baseline. Drift OFF for the
  // baseline reading (driftAmplitude 0). Later phases re-run with drift/senses ON to compare.
  driftAmplitude: 0,
};

function spawnForager(w: World, cfg: Config, x: number, y: number, h: number): number {
  const g = buildForagerGenome(cfg.cellRadius, 100);
  const ref = w.genomes.register(g);
  const body = develop(g, cfg.maxCellsPerOrganism, cfg.maxRecursionDepth);
  return instantiateBody(
    body, w.cells, w.net, w.bonds, w.organisms, ref,
    x, y, h, cfg.worldWidth, cfg.worldHeight, w.instantiateScratch, w.glowEffectors,
  );
}

interface Tracked {
  org: number;
  startX: number;
  startY: number;
  pathLen: number;
  prevX: number;
  prevY: number;
  bornTick: number;
  reachedFoodTick: number; // -1 until it reaches a high-light cell
}

function nearestLightPeak(w: World, x: number, y: number): { dx: number; dy: number; light: number } {
  // Use the live light field as the food proxy (light drives food). Sample the patch under (x,y)
  // and the global brightest patch center as the "zone" target.
  const lf = w.light;
  const cols = lf.cols;
  const rows = lf.rows;
  const buf = lf.light;
  let bestI = 0;
  let bestV = -1;
  for (let i = 0; i < buf.length; i++) if (buf[i]! > bestV) { bestV = buf[i]!; bestI = i; }
  const pc = bestI % cols;
  const pr = (bestI / cols) | 0;
  const tx = (pc + 0.5) * (w.config.worldWidth / cols);
  const ty = (pr + 0.5) * (w.config.worldHeight / rows);
  let dx = tx - x;
  let dy = ty - y;
  // toroidal wrap
  if (dx > w.config.worldWidth / 2) dx -= w.config.worldWidth;
  if (dx < -w.config.worldWidth / 2) dx += w.config.worldWidth;
  if (dy > w.config.worldHeight / 2) dy -= w.config.worldHeight;
  if (dy < -w.config.worldHeight / 2) dy += w.config.worldHeight;
  return { dx, dy, light: lf.sampleAt(x, y) };
}

function orgCentroid(w: World, org: number): { x: number; y: number; alive: boolean } {
  const f = w.cells.fields;
  let sx = 0, sy = 0, n = 0;
  for (let i = 0; i < w.cells.capacity; i++) {
    if (w.cells.isAlive(i) && f.organismId[i] === org) { sx += f.posX[i]!; sy += f.posY[i]!; n++; }
  }
  if (n === 0) return { x: 0, y: 0, alive: false };
  return { x: sx / n, y: sy / n, alive: true };
}

function run(seed: number): void {
  const cfg = defaultConfig({ ...BASE, seed, maxCells: 4000 });
  const w = new World(cfg, false);
  w.seedLife(1500);
  // Drop a handful of foragers at fixed positions away from the brightest zone so they must navigate.
  const tracked: Tracked[] = [];
  for (let k = 0; k < 12; k++) {
    const x = cfg.worldWidth * (0.1 + 0.8 * (k / 12));
    const y = cfg.worldHeight * 0.5;
    const org = spawnForager(w, cfg, x, y, (k * 2.39996) % (Math.PI * 2));
    tracked.push({ org, startX: x, startY: y, pathLen: 0, prevX: x, prevY: y, bornTick: 0, reachedFoodTick: -1 });
  }
  const TICKS = 6000;
  const lifespans: number[] = [];
  for (let t = 0; t < TICKS; t++) {
    w.tick();
    for (const tr of tracked) {
      const c = orgCentroid(w, tr.org);
      if (!c.alive) {
        if (tr.reachedFoodTick === -2) continue; // already recorded death
        lifespans.push(t - tr.bornTick);
        tr.reachedFoodTick = tr.reachedFoodTick === -1 ? -1 : tr.reachedFoodTick;
        tr.reachedFoodTick = -2; // mark recorded (sentinel)
        continue;
      }
      // accumulate path length
      let dpx = c.x - tr.prevX;
      let dpy = c.y - tr.prevY;
      if (dpx > cfg.worldWidth / 2) dpx -= cfg.worldWidth;
      if (dpx < -cfg.worldWidth / 2) dpx += cfg.worldWidth;
      if (dpy > cfg.worldHeight / 2) dpy -= cfg.worldHeight;
      if (dpy < -cfg.worldHeight / 2) dpy += cfg.worldHeight;
      tr.pathLen += Math.hypot(dpx, dpy);
      tr.prevX = c.x;
      tr.prevY = c.y;
      // time-to-food: first tick the centroid sits on a bright (>0.6·lightMax) cell
      if (tr.reachedFoodTick === -1 && w.light.sampleAt(c.x, c.y) > 0.6 * cfg.lightMax) {
        tr.reachedFoodTick = t;
      }
    }
  }
  // Straightness = net displacement toward the brightest zone / path length (per still-alive tracked).
  let straightSum = 0, straightN = 0, ttfSum = 0, ttfN = 0;
  for (const tr of tracked) {
    const c = orgCentroid(w, tr.org);
    if (c.alive && tr.pathLen > 1) {
      const { dx, dy } = nearestLightPeak(w, tr.startX, tr.startY);
      const goal = Math.hypot(dx, dy);
      // net progress toward the zone vs how far it actually travelled
      const endProgress = goal - Math.hypot(nearestLightPeak(w, c.x, c.y).dx, nearestLightPeak(w, c.x, c.y).dy);
      straightSum += Math.max(0, endProgress) / tr.pathLen;
      straightN++;
    }
    if (tr.reachedFoodTick >= 0) { ttfSum += tr.reachedFoodTick - tr.bornTick; ttfN++; }
  }
  lifespans.sort((a, b) => a - b);
  const mean = (xs: number[]) => (xs.length ? xs.reduce((s, v) => s + v, 0) / xs.length : 0);
  const pct = (xs: number[], p: number) => (xs.length ? xs[Math.min(xs.length - 1, Math.floor(p * xs.length))]! : 0);
  console.log(`seed=${seed}`);
  console.log(`  path-straightness (toward brightest zone): ${straightN ? (straightSum / straightN).toFixed(3) : 'n/a'} (n=${straightN})`);
  console.log(`  time-to-food (ticks): mean=${ttfN ? (ttfSum / ttfN).toFixed(0) : 'n/a'} (reached=${ttfN}/${tracked.length})`);
  console.log(`  lifespan (ticks): mean=${mean(lifespans).toFixed(0)} median=${pct(lifespans, 0.5)} p90=${pct(lifespans, 0.9)} (deaths=${lifespans.length})`);
}

for (const seed of [3, 7, 42, 99, 123]) run(seed);
```
NOTE: before finalizing, READ `src/headless/feel-probe.ts` and align `spawnForager`'s `instantiateBody` argument list and the `World`/`seedLife` calls to the EXACT signatures there (they are the source of truth; if `instantiateBody` takes a different arg order, match it). Also confirm `w.light`, `w.cells.capacity`, `w.cells.isAlive`, `w.cells.fields`, `w.genomes.register`, `w.instantiateScratch`, `w.glowEffectors` are all public (they are used identically in `feel-probe.ts`).

- [ ] Run — `pnpm exec tsx src/headless/sense-feel-probe.ts`. Expected: prints five `seed=...` blocks each with path-straightness, time-to-food, and lifespan stats. The numbers are the RECORDED BASELINE — paste them into the Phase-1 findings/decision-log so Phase 4/5 can compute the ≥30% purposefulness delta. There is no pass/fail here; the gate is "it runs and produces finite numbers."

- [ ] Typecheck — `make typecheck`. Expected: clean (the probe must compile under the project's tsconfig; headless probes are part of the typecheck set per `feel-probe.ts` precedent).

- [ ] commit —
```
git add src/headless/sense-feel-probe.ts && git commit -m "feat(probe): Phase-1 navigation + lifespan baseline feel-probe (the senses gate)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_018UVsSAVWXMgnQLC6ZpZ4yj"
```

### Phase 1 exit criteria (verify before moving to Phase 2)

- [ ] `make check` green (typecheck + lint + all vitest suites).
- [ ] `reproducibility.test.ts`: default-config cases byte-identical (drift OFF never recomputes `cap[]`), AND the new drift-ON case is byte-identical + non-vacuous (cap migrated early→late).
- [ ] `src/headless/sense-feel-probe.ts` runs across 5 seeds and the baseline numbers (path-straightness, time-to-food, lifespan mean/median/p90) are recorded for the later purposefulness-delta gate.
- [ ] `STREAM_DRIFT = 6` is the only new RNG stream; streams 1-5 are unperturbed (proven by default-config byte-identity).
- [ ] No new per-tick allocation: `driftCap` reuses `driftX`/`driftY`; it is hard-skipped at `driftAmplitude === 0`.

---

## Phase 2 — Hearing + senseSource scaffolding

This phase threads a new per-gene attribute `senseSource` from the genome all the way to per-cell neural bindings, adds the `NoiseField` (motion/loudness field) with an OFF-by-default end-of-tick deposit, and routes `sense.ts` per sensor cell by its `senseSource`. SIGHT routing is stubbed to a zero vector here (the real cone query lands in Phase 3). Everything is byte-identical to today until `loudnessGain > 0` AND a genome actually grows a HEARING sensor.

Determinism rules that bind every task in this phase:
- New mechanisms are OFF by default. `loudnessGain` default `0` ⇒ NoiseField deposit+step skipped entirely; `senseSource` default `SenseSource.SMELL (0)` ⇒ every existing genome routes exactly as today.
- No `Math.random`/`Date.now` on the hot path. The NoiseField deposit runs end-of-tick over the post-lifecycle live set (same one-tick coupling as `food`).
- Zero-alloc hot loop: the deposit loop reuses existing arrays; no per-tick allocation.
- The default-config baseline used by `reproducibility.test.ts` MUST stay byte-identical (it is — all new code is guarded by `loudnessGain > 0` and `senseSource !== SMELL`).
- TDD is mandatory per task: RED (failing test) → run-fail → GREEN (minimal impl) → run-pass → commit.

Run tests with `pnpm exec vitest run <path>`. Gate the whole phase with `make check`.

---

### Task 1 — `SenseSource` / `SightTarget` enums (new file)

**Files**
- Create: `src/core/cells/sense-source.ts`
- Test: `src/core/cells/sense-source.test.ts`

**Interfaces**
- Produces (exact, verbatim from the contract):
  ```ts
  export const SenseSource = { SMELL: 0, SIGHT: 1, HEARING: 2 } as const;
  export type SenseSourceValue = (typeof SenseSource)[keyof typeof SenseSource];
  export const SightTarget = { FOOD: 0, PREY: 1, PREDATOR: 2 } as const;
  export type SightTargetValue = (typeof SightTarget)[keyof typeof SightTarget];
  ```

Steps:
- [ ] RED — create `src/core/cells/sense-source.test.ts`:
  ```ts
  import { describe, it, expect } from 'vitest';
  import { SenseSource, SightTarget } from './sense-source';

  describe('SenseSource / SightTarget enums', () => {
    it('SMELL is 0 so existing genomes (default 0) are unchanged', () => {
      expect(SenseSource.SMELL).toBe(0);
      expect(SenseSource.SIGHT).toBe(1);
      expect(SenseSource.HEARING).toBe(2);
    });
    it('SightTarget defaults FOOD to 0', () => {
      expect(SightTarget.FOOD).toBe(0);
      expect(SightTarget.PREY).toBe(1);
      expect(SightTarget.PREDATOR).toBe(2);
    });
  });
  ```
- [ ] run-fail — `pnpm exec vitest run src/core/cells/sense-source.test.ts`
  Expected: fails to resolve import `./sense-source` (module not found), so the suite errors out before any assertion.
- [ ] GREEN — create `src/core/cells/sense-source.ts`:
  ```ts
  /** What FILLS a sensor cell's (senseX, senseY) each tick: which field/query feeds it.
   *  Parallel to (and orthogonal to) SensorChannel, which projects that vector to a scalar. */
  export const SenseSource = { SMELL: 0, SIGHT: 1, HEARING: 2 } as const;
  export type SenseSourceValue = (typeof SenseSource)[keyof typeof SenseSource];

  /** What a SIGHT eye looks for; only meaningful when senseSource === SIGHT. */
  export const SightTarget = { FOOD: 0, PREY: 1, PREDATOR: 2 } as const;
  export type SightTargetValue = (typeof SightTarget)[keyof typeof SightTarget];
  ```
- [ ] run-pass — `pnpm exec vitest run src/core/cells/sense-source.test.ts` (2 tests green).
- [ ] commit — `git add src/core/cells/sense-source.ts src/core/cells/sense-source.test.ts && git commit -m "feat(cells): SenseSource/SightTarget modality enums (Phase 2 scaffold)"`

---

### Task 2 — `NoiseField` (ScalarField subclass, new file)

**Files**
- Create: `src/core/environment/noise-field.ts`
- Test: `src/core/environment/noise-field.test.ts`

**Interfaces**
- Consumes: `ScalarField` base from `src/core/environment/scalar-field.ts` — it already provides `depositAt(x, y, amount): void`, `sampleAt(x, y): number`, `step(diffuse, decay): void` (the deposit/diffuse/decay stencil), `patchW`/`patchH`, and `get field(): Float32Array`.
- Produces (verbatim): `export class NoiseField extends ScalarField {}`

The deposit value `loudnessGain * hypot(velX, velY)` is computed by the CALLER (world.ts, Task 8) and passed to `depositAt`; the field itself is just the inherited deposit/diffuse/decay. This task is the field + its unit tests only.

Steps:
- [ ] RED — create `src/core/environment/noise-field.test.ts` (mirrors `glow-field.test.ts`):
  ```ts
  import { describe, it, expect } from 'vitest';
  import { NoiseField } from './noise-field';

  describe('NoiseField', () => {
    it('starts empty and deposits into the patch under a position', () => {
      const noise = new NoiseField(4, 4, 400, 400); // 100-unit patches
      expect(noise.sampleAt(50, 50)).toBe(0);
      noise.depositAt(50, 50, 2);
      expect(noise.sampleAt(50, 50)).toBe(2);
      expect(noise.sampleAt(150, 50)).toBe(0); // different patch untouched
    });

    it('deposit equals loudnessGain·speed (caller computes the amount)', () => {
      const noise = new NoiseField(4, 4, 400, 400);
      const loudnessGain = 0.5;
      const speed = Math.hypot(3, 4); // 5
      noise.depositAt(50, 50, loudnessGain * speed);
      expect(noise.sampleAt(50, 50)).toBeCloseTo(2.5, 6);
    });

    it('step() diffuses to neighbours (toroidal) and decays; never negative', () => {
      const noise = new NoiseField(4, 4, 400, 400);
      noise.depositAt(150, 150, 16); // spike at patch (1,1)
      const before = noise.sampleAt(150, 150);
      noise.step(0.2, 0.1);
      expect(noise.sampleAt(150, 150)).toBeLessThan(before);
      expect(noise.sampleAt(50, 150)).toBeGreaterThan(0); // left neighbour got flux
      for (let r = 0; r < 4; r++)
        for (let c = 0; c < 4; c++)
          expect(noise.sampleAt(c * 100 + 50, r * 100 + 50)).toBeGreaterThanOrEqual(0);
    });

    it('a moving source builds a readable gradient over ticks', () => {
      const noise = new NoiseField(16, 16, 1600, 1600);
      for (let t = 0; t < 200; t++) {
        noise.depositAt(800, 800, 3);
        noise.step(0.22, 0.05);
      }
      const centre = noise.sampleAt(800, 800);
      const oneOut = noise.sampleAt(900, 800);
      const threeOut = noise.sampleAt(1100, 800);
      expect(centre).toBeGreaterThan(oneOut);
      expect(oneOut).toBeGreaterThan(threeOut);
    });

    it('is reproducible — same inputs produce identical field values', () => {
      const a = new NoiseField(8, 8, 800, 800);
      const b = new NoiseField(8, 8, 800, 800);
      a.depositAt(100, 100, 10);
      b.depositAt(100, 100, 10);
      for (let t = 0; t < 20; t++) {
        a.step(0.15, 0.05);
        b.step(0.15, 0.05);
      }
      for (let r = 0; r < 8; r++)
        for (let c = 0; c < 8; c++)
          expect(a.sampleAt(c * 100 + 50, r * 100 + 50)).toBe(
            b.sampleAt(c * 100 + 50, r * 100 + 50),
          );
    });
  });
  ```
- [ ] run-fail — `pnpm exec vitest run src/core/environment/noise-field.test.ts`
  Expected: import of `./noise-field` fails (module not found); suite errors before assertions.
- [ ] GREEN — create `src/core/environment/noise-field.ts` (verbatim contract, modelled on `glow-field.ts`):
  ```ts
  import { ScalarField } from './scalar-field';

  /**
   * Coarse motion/loudness grid over the toroidal world. Every live cell deposits
   * `loudnessGain · speed` (speed = hypot(velX, velY)) into its patch at END-OF-TICK
   * (world.ts step 11b), then the field diffuses + decays so deposit balances decay into
   * an equilibrium ∝ local motion. Sensors read its GRADIENT next tick (one-tick coupling,
   * like smell). Undifferentiated: one field, everyone deposits and reads. A persistent
   * deposit/diffuse/decay scalar field — see {@link ScalarField}.
   */
  export class NoiseField extends ScalarField {}
  ```
- [ ] run-pass — `pnpm exec vitest run src/core/environment/noise-field.test.ts` (5 tests green).
- [ ] commit — `git add src/core/environment/noise-field.ts src/core/environment/noise-field.test.ts && git commit -m "feat(env): NoiseField (motion/loudness scalar field, deposit=loudnessGain*speed)"`

---

### Task 3 — `senseSource` + `sightTarget` on the `Gene` interface + `cloneGenome`

**Files**
- Modify: `src/core/genome/genome.ts` (Gene interface ~lines 15–30; `cloneGenome` ~lines 86–98)
- Test: `src/core/genome/genome.test.ts` (create if absent, else append a `describe`)

**Interfaces**
- Consumes: existing `Gene` interface and `cloneGenome(g: Genome): Genome`.
- Produces: two new `Gene` fields, both defaulting to the OFF/byte-identical value:
  ```ts
  senseSource: number;   // SenseSource enum; default SenseSource.SMELL (0)
  sightTarget: number;   // SightTarget enum; default SightTarget.FOOD (0)
  ```
  Both carried through `cloneGenome` via the per-gene `{ ...x }` spread (already present), so no explicit copy code is needed there — but the test must prove the spread carries them.

Steps:
- [ ] RED — create/append `src/core/genome/genome.test.ts`:
  ```ts
  import { describe, it, expect } from 'vitest';
  import { type Gene, type Genome, cloneGenome } from './genome';
  import { SenseSource, SightTarget } from '../cells/sense-source';

  function geneOf(over: Partial<Gene> = {}): Gene {
    return {
      innovation: 0,
      cellType: 0,
      radius: 6,
      mass: 1,
      initialEnergy: 100,
      bias: 0,
      sensorChannel: -1,
      glowGain: 0,
      senseSource: SenseSource.SMELL,
      sightTarget: SightTarget.FOOD,
      ...over,
    };
  }

  describe('Gene senseSource/sightTarget', () => {
    it('cloneGenome carries senseSource and sightTarget per gene', () => {
      const g: Genome = {
        seedGene: 0,
        genes: [geneOf({ senseSource: SenseSource.HEARING, sightTarget: SightTarget.PREY })],
        divisionRules: [],
        bondRules: [],
        connectionRules: [],
        motorRules: [],
        parentRef: -1,
        generation: 0,
        founderId: -1,
      };
      const c = cloneGenome(g);
      expect(c.genes[0]!.senseSource).toBe(SenseSource.HEARING);
      expect(c.genes[0]!.sightTarget).toBe(SightTarget.PREY);
      // deep copy — mutating the clone does not touch the parent
      c.genes[0]!.senseSource = SenseSource.SMELL;
      expect(g.genes[0]!.senseSource).toBe(SenseSource.HEARING);
    });
  });
  ```
- [ ] run-fail — `pnpm exec vitest run src/core/genome/genome.test.ts`
  Expected: a TypeScript compile error — object literal `geneOf` declares `senseSource`/`sightTarget` which do not exist on `Gene` (vitest fails the file with `Object literal may only specify known properties`).
- [ ] GREEN — in `src/core/genome/genome.ts`, add the two fields to the `Gene` interface (after `glowGain` at line 29):
  ```ts
    /** Glow gain for a NEURON gene (>0 = this instance emits light ∝ activation·gain); 0 = no glow. */
    glowGain: number;
    /** SenseSource enum: which field/query fills (senseX, senseY) for a SENSOR gene.
     *  Default SenseSource.SMELL (0) so existing genomes are unchanged. */
    senseSource: number;
    /** SightTarget enum (FOOD/PREY/PREDATOR); only meaningful when senseSource === SIGHT.
     *  Default SightTarget.FOOD (0). */
    sightTarget: number;
  ```
  `cloneGenome` already deep-copies genes via `g.genes.map((x) => ({ ...x }))` (line 89), so the spread carries both new fields with no edit needed there.
- [ ] run-pass — `pnpm exec vitest run src/core/genome/genome.test.ts` (green).
- [ ] NOTE — at this point other genome producers (`critter-genome.ts`, `mutate.ts`, `develop.ts`) will have TS errors for the missing fields. Do NOT run `make check` yet; Tasks 4–6 add them. The per-file vitest above compiles only this test + genome.ts.
- [ ] commit — `git add src/core/genome/genome.ts src/core/genome/genome.test.ts && git commit -m "feat(genome): senseSource/sightTarget on Gene (default SMELL/FOOD, rides cloneGenome)"`

---

### Task 4 — initialize `senseSource`/`sightTarget` in every `g(...)` gene factory in `critter-genome.ts`

**Files**
- Modify: `src/core/genome/critter-genome.ts` — three `g(...)` factories (lines ~29–39 in `buildCritterGenome`, ~109–119 in `buildAutotrophGenome`, ~158–168 in `buildForagerGenome`) AND four explicit `g.genes.push({ ... })` literals (night `~286–295`, glow `~328–337`, toxin `~366–375`) which build a `Gene` inline.
- Test: extend `src/core/genome/genome.test.ts` (or rely on Task 6's develop test + `make check` at end). Add a focused assertion here.

**Interfaces**
- Consumes: `SenseSource`, `SightTarget` from `../cells/sense-source`.
- Produces: all founder sensor genes carry `senseSource: SenseSource.SMELL`, `sightTarget: SightTarget.FOOD` (the byte-identical default).

Steps:
- [ ] RED — append to `src/core/genome/genome.test.ts`:
  ```ts
  import { buildForagerGenome } from './critter-genome';

  describe('founder genomes set senseSource SMELL on all genes', () => {
    it('forager genes default to SMELL/FOOD', () => {
      const g = buildForagerGenome();
      for (const gene of g.genes) {
        expect(gene.senseSource).toBe(SenseSource.SMELL);
        expect(gene.sightTarget).toBe(SightTarget.FOOD);
      }
    });
  });
  ```
- [ ] run-fail — `pnpm exec vitest run src/core/genome/genome.test.ts`
  Expected: TS compile error inside `critter-genome.ts` — the `g(...)` factory's object literal is missing required `Gene` fields `senseSource`/`sightTarget` (`Property 'senseSource' is missing in type ...`). Suite fails the file.
- [ ] GREEN — add the import at the top of `src/core/genome/critter-genome.ts` (it already imports `SensorChannel` from `../neural/network`):
  ```ts
  import { SenseSource, SightTarget } from '../cells/sense-source';
  ```
  Then add the two fields to each of the three `g` factory defaults. In `buildCritterGenome` (the `g` at lines 29–39):
  ```ts
    const g = (cellType: number, over: Partial<Gene> = {}): Gene => ({
      innovation: 0,
      cellType,
      radius: r,
      mass: 2,
      initialEnergy: RESERVE,
      bias: 0,
      sensorChannel: -1,
      glowGain: 0,
      senseSource: SenseSource.SMELL,
      sightTarget: SightTarget.FOOD,
      ...over,
    });
  ```
  In `buildAutotrophGenome` (the `g` at lines 109–119) add the same two lines before `...over`:
  ```ts
      glowGain: 0,
      senseSource: SenseSource.SMELL,
      sightTarget: SightTarget.FOOD,
      ...over,
  ```
  In `buildForagerGenome` (the `g` at lines 158–168) add the same two lines before `...over`:
  ```ts
      glowGain: 0,
      senseSource: SenseSource.SMELL,
      sightTarget: SightTarget.FOOD,
      ...over,
  ```
  Then the three explicit `g.genes.push({ ... })` literals (`buildNightForagerGenome` ~286, `buildGlowForagerGenome` ~328, `buildToxinAvoiderGenome` ~366) each construct a full `Gene` inline — add the two fields to each, after `glowGain: 0,`:
  ```ts
    glowGain: 0,
    senseSource: SenseSource.SMELL,
    sightTarget: SightTarget.FOOD,
  ```
- [ ] run-pass — `pnpm exec vitest run src/core/genome/genome.test.ts` (green).
- [ ] commit — `git add src/core/genome/critter-genome.ts src/core/genome/genome.test.ts && git commit -m "feat(genome): set senseSource=SMELL/sightTarget=FOOD on all founder genes"`

---

### Task 5 — `senseSource`/`sightTarget` through `DevelopedBody` + emitted per instance in `develop.ts`

**Files**
- Modify: `src/core/genome/develop.ts` — `DevelopedBody` interface (add to the parallel arrays ~lines 12–31), `develop`'s body init object (~lines 43–61), and `emit` (~lines 67–86).
- Test: `src/core/genome/develop.test.ts` (append a `describe`; file exists per repo convention — if absent, create with the imports below).

**Interfaces**
- Consumes: `Gene.senseSource`, `Gene.sightTarget` (Task 3).
- Produces (verbatim from contract): two new parallel arrays on `DevelopedBody`:
  ```ts
  senseSource: number[];   // per instance, copied from gene in emit()
  sightTarget: number[];   // per instance, copied from gene in emit()
  ```

Steps:
- [ ] RED — append to `src/core/genome/develop.test.ts` (create the file with these imports if it does not exist):
  ```ts
  import { describe, it, expect } from 'vitest';
  import { develop } from './develop';
  import { buildForagerGenome } from './critter-genome';
  import { type Gene } from './genome';
  import { SenseSource, SightTarget } from '../cells/sense-source';

  describe('develop — senseSource/sightTarget parallel arrays', () => {
    it('emits senseSource/sightTarget per instance, copied from the gene', () => {
      const g = buildForagerGenome();
      // make the forward sensor gene (index 1) a HEARING/PREY eye to prove the copy
      g.genes[1] = { ...(g.genes[1] as Gene), senseSource: SenseSource.HEARING, sightTarget: SightTarget.PREY };
      const body = develop(g, 256, 16);
      expect(body.senseSource.length).toBe(body.count);
      expect(body.sightTarget.length).toBe(body.count);
      // find the instance grown from gene 1 and check its modality copied through
      const inst = body.geneOf.findIndex((gn) => gn === 1);
      expect(inst).toBeGreaterThanOrEqual(0);
      expect(body.senseSource[inst]).toBe(SenseSource.HEARING);
      expect(body.sightTarget[inst]).toBe(SightTarget.PREY);
      // a SMELL-default gene stays SMELL/FOOD
      const mover = body.geneOf.findIndex((gn) => gn === 0);
      expect(body.senseSource[mover]).toBe(SenseSource.SMELL);
      expect(body.sightTarget[mover]).toBe(SightTarget.FOOD);
    });
  });
  ```
- [ ] run-fail — `pnpm exec vitest run src/core/genome/develop.test.ts`
  Expected: TS error — `Property 'senseSource' does not exist on type 'DevelopedBody'`. Suite fails the file.
- [ ] GREEN — in `src/core/genome/develop.ts`:
  1. Add to the `DevelopedBody` interface after `sensorChannel: number[];` (line 20):
     ```ts
     sensorChannel: number[];
     senseSource: number[];
     sightTarget: number[];
     ```
  2. Add to the `body` init object after `sensorChannel: [],` (line 51):
     ```ts
       sensorChannel: [],
       senseSource: [],
       sightTarget: [],
     ```
  3. In `emit`, after `body.sensorChannel[i] = gn.sensorChannel;` (line 76):
     ```ts
       body.sensorChannel[i] = gn.sensorChannel;
       body.senseSource[i] = gn.senseSource;
       body.sightTarget[i] = gn.sightTarget;
     ```
- [ ] run-pass — `pnpm exec vitest run src/core/genome/develop.test.ts` (green).
- [ ] commit — `git add src/core/genome/develop.ts src/core/genome/develop.test.ts && git commit -m "feat(genome): thread senseSource/sightTarget through DevelopedBody.emit"`

---

### Task 6 — `NeuralNetwork` parallel sensor-source arrays + changed `addSensor`/`removeSensorsFor`

**Files**
- Modify: `src/core/neural/network.ts` — declare the arrays (after `sensorChannel` ~line 60), allocate in the constructor (after `this.sensorChannel = ...` ~line 98), update `removeSensorsFor` (~lines 126–133), change `addSensor` signature + body (~lines 155–159).
- Test: `src/core/neural/network.test.ts` (append a `describe`; file exists per convention — create with imports if absent).

**Interfaces**
- Produces (verbatim from contract):
  ```ts
  readonly sensorSource: Uint8Array;       // sized maxNeurons, parallel to sensorCell/sensorChannel
  readonly sensorSightTarget: Uint8Array;  // sized maxNeurons, parallel
  // CHANGED signature:
  addSensor(cell: number, channel: number, source: number, sightTarget: number): void;
  ```
- `removeSensorsFor(cell)` swap-removes these two arrays too (alongside `sensorCell`/`sensorChannel`).

Steps:
- [ ] RED — append to `src/core/neural/network.test.ts`:
  ```ts
  import { describe, it, expect } from 'vitest';
  import { NeuralNetwork } from './network';
  import { SenseSource, SightTarget } from '../cells/sense-source';

  describe('NeuralNetwork sensor source bindings', () => {
    it('addSensor records source + sightTarget in parallel arrays', () => {
      const net = new NeuralNetwork(16, 64, 16);
      net.addSensor(3, 0 /* FWD_GRAD */, SenseSource.HEARING, SightTarget.PREY);
      expect(net.sensorCount).toBe(1);
      expect(net.sensorCell[0]).toBe(3);
      expect(net.sensorChannel[0]).toBe(0);
      expect(net.sensorSource[0]).toBe(SenseSource.HEARING);
      expect(net.sensorSightTarget[0]).toBe(SightTarget.PREY);
    });

    it('removeSensorsFor swap-removes source + sightTarget alongside cell/channel', () => {
      const net = new NeuralNetwork(16, 64, 16);
      net.addSensor(3, 0, SenseSource.SMELL, SightTarget.FOOD);
      net.addSensor(5, 1, SenseSource.SIGHT, SightTarget.PREDATOR);
      net.removeSensorsFor(3); // swap-removes index 0; binding for cell 5 moves into slot 0
      expect(net.sensorCount).toBe(1);
      expect(net.sensorCell[0]).toBe(5);
      expect(net.sensorChannel[0]).toBe(1);
      expect(net.sensorSource[0]).toBe(SenseSource.SIGHT);
      expect(net.sensorSightTarget[0]).toBe(SightTarget.PREDATOR);
    });
  });
  ```
- [ ] run-fail — `pnpm exec vitest run src/core/neural/network.test.ts`
  Expected: TS error — `Property 'sensorSource' does not exist on type 'NeuralNetwork'`, and `addSensor` expects 2 args but got 4. Suite fails the file.
- [ ] GREEN — in `src/core/neural/network.ts`:
  1. Declare after `readonly sensorChannel: Uint8Array;` (line 60):
     ```ts
     readonly sensorChannel: Uint8Array;
     readonly sensorSource: Uint8Array;
     readonly sensorSightTarget: Uint8Array;
     ```
  2. Allocate in the constructor after `this.sensorChannel = new Uint8Array(maxNeurons);` (line 98):
     ```ts
     this.sensorChannel = new Uint8Array(maxNeurons);
     this.sensorSource = new Uint8Array(maxNeurons);
     this.sensorSightTarget = new Uint8Array(maxNeurons);
     ```
  3. Update `removeSensorsFor` (the swap-remove body, lines 126–133) to carry both new arrays:
     ```ts
     removeSensorsFor(cell: number): void {
       for (let k = this.sensorCount - 1; k >= 0; k--) {
         if (this.sensorCell[k] !== cell) continue;
         const last = --this.sensorCount;
         this.sensorCell[k] = this.sensorCell[last]!;
         this.sensorChannel[k] = this.sensorChannel[last]!;
         this.sensorSource[k] = this.sensorSource[last]!;
         this.sensorSightTarget[k] = this.sensorSightTarget[last]!;
       }
     }
     ```
  4. Change `addSensor` (lines 155–159):
     ```ts
     addSensor(cell: number, channel: number, source: number, sightTarget: number): void {
       const k = this.sensorCount++;
       this.sensorCell[k] = cell;
       this.sensorChannel[k] = channel;
       this.sensorSource[k] = source;
       this.sensorSightTarget[k] = sightTarget;
     }
     ```
- [ ] run-pass — `pnpm exec vitest run src/core/neural/network.test.ts` (green for the new describe; note `critter.ts` + `instantiate.ts` callers still pass 2 args and will TS-error in those files — Task 7 fixes both. The per-file vitest here compiles only network.ts + this test, so it passes).
- [ ] commit — `git add src/core/neural/network.ts src/core/neural/network.test.ts && git commit -m "feat(neural): sensorSource/sensorSightTarget arrays + 4-arg addSensor"`

---

### Task 7 — update the two `addSensor` call sites (`instantiate.ts`, `critter.ts`)

**Files**
- Modify: `src/core/organism/instantiate.ts` — the sensor-channel loop (~lines 124–127).
- Modify: `src/core/sim/critter.ts` — the two `addSensor` calls (~lines 90–91).
- Test: `src/core/organism/instantiate.test.ts` (append; file exists per convention) — assert the binding carries the developed body's `senseSource`/`sightTarget`.

**Interfaces**
- Consumes: `body.senseSource[i]`, `body.sightTarget[i]` (Task 5); `net.addSensor(cell, channel, source, sightTarget)` (Task 6); `net.sensorSource`, `net.sensorSightTarget`.
- Produces: each instantiated SENSOR cell's binding carries the gene's modality.

Steps:
- [ ] RED — append to `src/core/organism/instantiate.test.ts`:
  ```ts
  import { describe, it, expect } from 'vitest';
  import { CellStore } from '../memory/cell-store';
  import { NeuralNetwork } from '../neural/network';
  import { BondNetwork } from './bonds';
  import { OrganismTable } from './organisms';
  import { GlowEffectors } from '../neural/glow';
  import { develop } from '../genome/develop';
  import { instantiateBody } from './instantiate';
  import { buildForagerGenome } from '../genome/critter-genome';
  import { type Gene } from '../genome/genome';
  import { SenseSource, SightTarget } from '../cells/sense-source';

  describe('instantiateBody — sensor modality binding', () => {
    it('passes body.senseSource/sightTarget into net.addSensor', () => {
      const g = buildForagerGenome();
      // gene 2 is the lateral sensor; make it HEARING/PREY
      g.genes[2] = { ...(g.genes[2] as Gene), senseSource: SenseSource.HEARING, sightTarget: SightTarget.PREY };
      const cells = new CellStore(64, false);
      const net = new NeuralNetwork(64, 256, 64);
      const bonds = new BondNetwork(64, 256, 8);
      const organisms = new OrganismTable(16);
      const glow = new GlowEffectors(16);
      const scratch = new Int32Array(64);
      const body = develop(g, 256, 16);
      const org = instantiateBody(body, cells, net, bonds, organisms, 0, 100, 100, 0, 1000, 1000, scratch, glow);
      expect(org).toBeGreaterThan(0);
      // at least one binding is HEARING/PREY (the gene-2 instance)
      let found = false;
      for (let k = 0; k < net.sensorCount; k++) {
        if (net.sensorSource[k] === SenseSource.HEARING && net.sensorSightTarget[k] === SightTarget.PREY) found = true;
      }
      expect(found).toBe(true);
    });
  });
  ```
- [ ] run-fail — `pnpm exec vitest run src/core/organism/instantiate.test.ts`
  Expected: TS error in `instantiate.ts` — `Expected 4 arguments, but got 2` at the `net.addSensor(slotScratch[i]!, ch)` call (line 126). Suite fails the file.
- [ ] GREEN — in `src/core/organism/instantiate.ts`, the sensor-channel loop (lines 124–127):
  ```ts
    // Sensor channels (SENSOR genes carry a channel) + modality (senseSource/sightTarget).
    for (let i = 0; i < count; i++) {
      const ch = body.sensorChannel[i]!;
      if (ch >= 0 && body.cellType[i]! === CellType.SENSOR)
        net.addSensor(slotScratch[i]!, ch, body.senseSource[i]!, body.sightTarget[i]!);
    }
  ```
  In `src/core/sim/critter.ts`, the two calls (lines 90–91). The hand-spawned swimmer is SMELL/FOOD by definition; add the import and pass the defaults. Add at the top of `critter.ts` (it already imports `SensorChannel`):
  ```ts
  import { SenseSource, SightTarget } from '../cells/sense-source';
  ```
  and change:
  ```ts
    net.addSensor(sensorFwd, SensorChannel.FWD_GRAD, SenseSource.SMELL, SightTarget.FOOD);
    net.addSensor(sensorLat, SensorChannel.LAT_GRAD, SenseSource.SMELL, SightTarget.FOOD);
  ```
- [ ] run-pass — `pnpm exec vitest run src/core/organism/instantiate.test.ts` (green).
- [ ] commit — `git add src/core/organism/instantiate.ts src/core/sim/critter.ts src/core/organism/instantiate.test.ts && git commit -m "feat(organism): bind senseSource/sightTarget at instantiate (+critter call sites)"`

---

### Task 8 — `config.ts`: add `loudnessGain` (default 0)

**Files**
- Modify: `src/core/sim/config.ts` — `Config` interface (add near `predFleeWeight` ~line 122) and `defaultConfig` (add near `predFleeWeight: 0` ~line 373).
- Test: `src/core/sim/config.test.ts` (append; create if absent) — assert default is 0.

**Interfaces**
- Produces (verbatim from contract): `loudnessGain: number; // default 0 — 0 ⇒ NoiseField deposit+step skipped entirely. Deposit = loudnessGain·speed per cell.`

Steps:
- [ ] RED — append to `src/core/sim/config.test.ts`:
  ```ts
  import { describe, it, expect } from 'vitest';
  import { defaultConfig } from './config';

  describe('config — loudnessGain (hearing)', () => {
    it('defaults to 0 (hearing OFF, byte-identical)', () => {
      expect(defaultConfig().loudnessGain).toBe(0);
    });
    it('is overridable', () => {
      expect(defaultConfig({ loudnessGain: 0.5 }).loudnessGain).toBe(0.5);
    });
  });
  ```
- [ ] run-fail — `pnpm exec vitest run src/core/sim/config.test.ts`
  Expected: TS error — `Property 'loudnessGain' does not exist on type 'Config'` (and not assignable in the overrides `Partial<Config>`). Suite fails the file.
- [ ] GREEN — in `src/core/sim/config.ts`, add to the `Config` interface immediately after the `predFleeWeight: number;` declaration (~line 122):
  ```ts
    predFleeWeight: number;

    /** Hearing deposit gain: each live cell deposits `loudnessGain · hypot(velX, velY)` into the
     *  NoiseField at end-of-tick. 0 = hearing OFF — NoiseField deposit+step skipped entirely
     *  (byte-identical to today). Default 0. */
    loudnessGain: number;
  ```
  Add to `defaultConfig` immediately after `predFleeWeight: 0, ...` (~line 373):
  ```ts
      predFleeWeight: 0, // OFF by default (no-op); the ecology config raises it so foragers flee predator scent
      loudnessGain: 0, // OFF by default — NoiseField deposit+step skipped entirely (byte-identical)
  ```
- [ ] run-pass — `pnpm exec vitest run src/core/sim/config.test.ts` (green).
- [ ] commit — `git add src/core/sim/config.ts src/core/sim/config.test.ts && git commit -m "feat(config): loudnessGain knob (default 0, hearing OFF)"`

---

### Task 9 — `sense.ts`: per-sensor `senseSource` routing (SMELL unchanged, HEARING gradient, SIGHT stub)

**Files**
- Modify: `src/core/cells/sense.ts` — change the `sense(...)` signature and add the post-SMELL routing override loop.
- Test: `src/core/cells/sense.test.ts` (append a `describe`; the existing SMELL tests must still pass with updated call sites).

**Interfaces**
- Consumes: `NeuralNetwork` (`net.sensorCell`, `net.sensorSource`), `NoiseField` (`noise.sampleAt`, `noise.patchW`, `noise.patchH`), `wrap` from `../math/vec2`, plus the existing args. `SpatialHash` + `viewRange`/`viewHalfAngle`/`worldWidth`/`worldHeight` are accepted now but only consumed by the Phase-3 SIGHT branch; in Phase 2 the SIGHT branch writes a ZERO vector.
- Produces (verbatim from contract — the full final signature, so Phase 3 needs no further signature change):
  ```ts
  export function sense(
    live, n, f,
    food, preyField, carnivore, predField, fleeWeight,
    net: NeuralNetwork,
    noise: NoiseField, loudnessGain: number,
    hash: SpatialHash, viewRange: number, viewHalfAngle: number,
    worldWidth: number, worldHeight: number,
  ): void
  ```

Design note on routing (zero-alloc, byte-identical-when-OFF): the existing loop fills `senseX/senseY` for every MOTILE + SENSOR cell via the SMELL/flee path — KEEP IT VERBATIM. Then, only when a non-SMELL modality is active (`loudnessGain > 0 || viewRange > 0`), iterate `net.sensorCell` bindings and OVERRIDE `senseX/senseY` for any binding whose `net.sensorSource[k]` is HEARING or SIGHT. When both `loudnessGain === 0` and `viewRange === 0`, the override loop is skipped entirely → byte-identical to today (the smell path already ran for those cells). Iterating sensor bindings mirrors `think.ts` (which also iterates `net.sensorCell`), keeping canonical order.

Steps:
- [ ] RED — append to `src/core/cells/sense.test.ts`:
  ```ts
  import { NeuralNetwork } from '../neural/network';
  import { NoiseField } from '../environment/noise-field';
  import { SpatialHash } from '../spatial/spatial-hash';
  import { SenseSource, SightTarget } from './sense-source';

  describe('sense — senseSource routing (SMELL vs HEARING)', () => {
    function emptyHash(): SpatialHash {
      return new SpatialHash(800, 800, 100, 8);
    }

    it('HEARING sensor reads the NoiseField gradient, not the food field', () => {
      const store = new CellStore(2, false);
      const f = store.fields;
      // food rises in +x; noise rises in +y — orthogonal so routing is unambiguous.
      const food = new FoodField(8, 8, 800, 800);
      const noise = new NoiseField(8, 8, 800, 800);
      for (let r = 0; r < 8; r++)
        for (let c = 0; c < 8; c++) {
          food.field[r * 8 + c] = c;
          noise.field[r * 8 + c] = r;
        }
      const net = new NeuralNetwork(8, 16, 8);
      const i = store.alloc();
      f.posX[i] = 350;
      f.posY[i] = 350;
      f.cellType[i] = CellType.SENSOR;
      net.addSensor(i, 0 /* FWD_GRAD */, SenseSource.HEARING, SightTarget.FOOD);
      const live = Uint32Array.from([i]);
      sense(live, 1, f, food, food, new Uint8Array(8), food, 0, net, noise, 0.5, emptyHash(), 0, 0, 800, 800);
      // noise gradient is +2 in y (row4=4 − row2=2), 0 in x — NOT the food +x gradient.
      expect(f.senseY[i]).toBeCloseTo(2, 5);
      expect(f.senseX[i]).toBeCloseTo(0, 5);
    });

    it('with loudnessGain 0 a HEARING sensor is NOT overridden — stays on the SMELL path (byte-identical)', () => {
      const store = new CellStore(2, false);
      const f = store.fields;
      const food = new FoodField(8, 8, 800, 800);
      const noise = new NoiseField(8, 8, 800, 800);
      for (let r = 0; r < 8; r++)
        for (let c = 0; c < 8; c++) {
          food.field[r * 8 + c] = c;
          noise.field[r * 8 + c] = r;
        }
      const net = new NeuralNetwork(8, 16, 8);
      const i = store.alloc();
      f.posX[i] = 350;
      f.posY[i] = 350;
      f.cellType[i] = CellType.SENSOR;
      net.addSensor(i, 0, SenseSource.HEARING, SightTarget.FOOD);
      sense(Uint32Array.from([i]), 1, f, food, food, new Uint8Array(8), food, 0, net, noise, 0, emptyHash(), 0, 0, 800, 800);
      // loudnessGain 0 → no override → the SMELL path's food +x gradient (=2) is what's written.
      expect(f.senseX[i]).toBeCloseTo(2, 5);
      expect(f.senseY[i]).toBeCloseTo(0, 5);
    });

    it('a SIGHT sensor writes a zero vector in Phase 2 (cone query lands in Phase 3)', () => {
      const store = new CellStore(2, false);
      const f = store.fields;
      const food = new FoodField(8, 8, 800, 800);
      const noise = new NoiseField(8, 8, 800, 800);
      for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) food.field[r * 8 + c] = c;
      const net = new NeuralNetwork(8, 16, 8);
      const i = store.alloc();
      f.posX[i] = 350;
      f.posY[i] = 350;
      f.cellType[i] = CellType.SENSOR;
      net.addSensor(i, 0, SenseSource.SIGHT, SightTarget.FOOD);
      // viewRange > 0 activates the override loop; the SIGHT branch zeroes the vector for now.
      sense(Uint32Array.from([i]), 1, f, food, food, new Uint8Array(8), food, 0, net, noise, 0, emptyHash(), 48, 0.6, 800, 800);
      expect(f.senseX[i]).toBe(0);
      expect(f.senseY[i]).toBe(0);
    });
  });
  ```
  Also update the EXISTING `sense(...)` calls in this file (the SMELL/flee describes) to the new signature by appending `, net, noise, 0, hash, 0, 0, 800, 800` where `net = new NeuralNetwork(8, 16, 8)`, `noise = new NoiseField(8, 8, 800, 800)`, `hash = new SpatialHash(800, 800, 100, 8)`. For example the first existing call becomes:
  ```ts
  sense(live, 2, f, food, food, new Uint8Array(8), food, 0, new NeuralNetwork(8, 16, 8), new NoiseField(8, 8, 800, 800), 0, new SpatialHash(800, 800, 100, 8), 0, 0, 800, 800);
  ```
  Apply the same `, net, noise, 0, hash, 0, 0, 800, 800` tail to every existing `sense(...)` call in the file. With `loudnessGain 0` and `viewRange 0` the override loop never runs, so these existing assertions stay byte-identical.
- [ ] run-fail — `pnpm exec vitest run src/core/cells/sense.test.ts`
  Expected: TS error — `Expected 16 arguments, but got 8` on the old `sense` definition vs new calls, OR `Property does not exist` for the new imports' usage. Suite fails the file.
- [ ] GREEN — rewrite `src/core/cells/sense.ts`:
  ```ts
  import { type CellArrays } from '../memory/cell-store';
  import { type FoodField } from '../environment/food-field';
  import { type NoiseField } from '../environment/noise-field';
  import { type NeuralNetwork } from '../neural/network';
  import { type SpatialHash } from '../spatial/spatial-hash';
  import { CellType } from './types';
  import { SenseSource } from './sense-source';
  import { wrap } from '../math/vec2';

  /**
   * SENSE step (§4.3 step 2). For each sensor-capable cell, write a 2D gradient/vector into
   * (senseX, senseY); THINK then projects it per sensorChannel. SMELL (the existing path) is a
   * central finite-difference of the food/prey scent field (+ the flee term). HEARING reads the
   * NoiseField gradient. SIGHT is a cone query (Phase 3) — a ZERO vector for now.
   *
   * Routing is OFF-by-default: the SMELL/flee path runs for every MOTILE + SENSOR cell exactly as
   * before; then, ONLY when loudnessGain>0 or viewRange>0, a second pass over the sensor BINDINGS
   * overrides (senseX, senseY) for HEARING/SIGHT sensors. With both knobs 0 the override pass is
   * skipped entirely → byte-identical to the pre-hearing sim. Allocation-free.
   */
  export function sense(
    live: Uint32Array,
    n: number,
    f: CellArrays,
    food: FoodField,
    preyField: FoodField,
    carnivore: Uint8Array,
    predField: FoodField,
    fleeWeight: number,
    net: NeuralNetwork,
    noise: NoiseField,
    loudnessGain: number,
    hash: SpatialHash,
    viewRange: number,
    viewHalfAngle: number,
    worldWidth: number,
    worldHeight: number,
  ): void {
    const hx = food.patchW;
    const hy = food.patchH;
    const w = food.worldWidth;
    const h = food.worldHeight;
    const flee = fleeWeight > 0;
    // ── SMELL/flee path (unchanged): fill (senseX, senseY) for every MOTILE + SENSOR cell. ──
    for (let k = 0; k < n; k++) {
      const i = live[k]!;
      const ct = f.cellType[i]!;
      if (ct !== CellType.MOTILE && ct !== CellType.SENSOR) continue;
      const org = f.organismId[i]!;
      const carnSensor = ct === CellType.SENSOR && org !== 0 && carnivore[org] === 1;
      const field = carnSensor ? preyField : food;
      const x = f.posX[i]!;
      const y = f.posY[i]!;
      let gx = field.sampleAt(wrap(x + hx, w), y) - field.sampleAt(wrap(x - hx, w), y);
      let gy = field.sampleAt(x, wrap(y + hy, h)) - field.sampleAt(x, wrap(y - hy, h));
      if (flee && org !== 0 && carnivore[org] === 0) {
        gx -=
          fleeWeight *
          (predField.sampleAt(wrap(x + hx, w), y) - predField.sampleAt(wrap(x - hx, w), y));
        gy -=
          fleeWeight *
          (predField.sampleAt(x, wrap(y + hy, h)) - predField.sampleAt(x, wrap(y - hy, h)));
      }
      f.senseX[i] = gx;
      f.senseY[i] = gy;
    }

    // ── Modality override (HEARING/SIGHT): OFF-by-default, skipped when both knobs are 0. ──
    if (loudnessGain <= 0 && viewRange <= 0) return;
    const hearOn = loudnessGain > 0;
    const sightOn = viewRange > 0;
    const nhx = noise.patchW;
    const nhy = noise.patchH;
    const nw = noise.worldWidth;
    const nh = noise.worldHeight;
    const sc = net.sensorCell;
    const src = net.sensorSource;
    const sn = net.sensorCount;
    for (let k = 0; k < sn; k++) {
      const i = sc[k]!;
      if (f.cellType[i]! !== CellType.SENSOR) continue; // recycled slot guard (mirrors think.ts)
      const source = src[k]!;
      if (source === SenseSource.HEARING) {
        if (!hearOn) continue; // leave the SMELL-path value
        const x = f.posX[i]!;
        const y = f.posY[i]!;
        f.senseX[i] =
          noise.sampleAt(wrap(x + nhx, nw), y) - noise.sampleAt(wrap(x - nhx, nw), y);
        f.senseY[i] =
          noise.sampleAt(x, wrap(y + nhy, nh)) - noise.sampleAt(x, wrap(y - nhy, nh));
      } else if (source === SenseSource.SIGHT) {
        if (!sightOn) continue; // leave the SMELL-path value
        // Phase 3 wires the cone query (sightVector) here using hash/viewRange/viewHalfAngle/
        // worldWidth/worldHeight. Until then a SIGHT sensor sees nothing → zero vector.
        f.senseX[i] = 0;
        f.senseY[i] = 0;
      }
      // SenseSource.SMELL: already filled by the SMELL path above; nothing to do.
    }
  }
  ```
  (The `hash`, `viewHalfAngle`, `worldWidth`, `worldHeight` params are referenced only by the Phase-3 SIGHT body; TypeScript `noUnusedParameters` — if the repo enables it — is satisfied because they appear in the signature and the SIGHT branch comment; if a lint error fires on unused params, suppress by referencing them in the comment is NOT enough — instead keep them; verify with `make check` in Task 11. If strictly unused-flagged, the minimal fix is `void hash; void viewHalfAngle; void worldWidth; void worldHeight;` at the top of the SIGHT branch — only add if the lint actually fails.)
- [ ] run-pass — `pnpm exec vitest run src/core/cells/sense.test.ts` (all existing SMELL/flee tests + the 3 new routing tests green).
- [ ] commit — `git add src/core/cells/sense.ts src/core/cells/sense.test.ts && git commit -m "feat(cells): senseSource routing in sense.ts (HEARING gradient, SIGHT stub, OFF-by-default)"`

---

### Task 10 — `world.ts`: construct `NoiseField`, deposit at end-of-tick (guarded), pass into `sense`

**Files**
- Modify: `src/core/sim/world.ts` — import (~line 12 area), field declaration (~line 99 area), construction (~line 254 area), the `sense(...)` call (~lines 471–480), and the end-of-tick deposit block (step 11b, alongside the food deposit ~lines 745–772).
- Test: covered by the existing `reproducibility.test.ts` (byte-identical with `loudnessGain 0`) and a new world-level deposit test below.

**Interfaces**
- Consumes: `NoiseField` (Task 2), `cfg.loudnessGain` (Task 8), the new `sense(...)` signature (Task 9), `f.velX`, `f.velY`.
- Produces: `world.noise` (a live `NoiseField`); end-of-tick deposit `loudnessGain * hypot(velX, velY)` per live cell + `noise.step`, both guarded `if (loudnessGain > 0)`.

Steps:
- [ ] RED — append to `src/core/sim/world.test.ts` (create if absent with these imports):
  ```ts
  import { describe, it, expect } from 'vitest';
  import { World } from './world';
  import { defaultConfig } from './config';

  describe('world — NoiseField hearing deposit', () => {
    it('with loudnessGain 0 the NoiseField stays empty (OFF, byte-identical)', () => {
      const w = new World(defaultConfig({ seed: 7, maxCells: 500 }), false);
      w.seedLife(200);
      for (let t = 0; t < 30; t++) w.tick();
      // every patch is exactly 0 — deposit+step were skipped.
      let max = 0;
      const fld = w.noise.field;
      for (let i = 0; i < fld.length; i++) if (fld[i]! > max) max = fld[i]!;
      expect(max).toBe(0);
    });

    it('with loudnessGain > 0 a moving population deposits motion into the NoiseField', () => {
      const w = new World(defaultConfig({ seed: 7, maxCells: 500, loudnessGain: 1, initialMotileFraction: 1 }), false);
      w.seedLife(200);
      for (let t = 0; t < 30; t++) w.tick();
      let max = 0;
      const fld = w.noise.field;
      for (let i = 0; i < fld.length; i++) if (fld[i]! > max) max = fld[i]!;
      expect(max).toBeGreaterThan(0);
    });
  });
  ```
- [ ] run-fail — `pnpm exec vitest run src/core/sim/world.test.ts`
  Expected: TS error — `Property 'noise' does not exist on type 'World'` (and the `sense` call in world.ts still passes 8 args → `Expected 16 arguments`). Suite fails the file.
- [ ] GREEN — in `src/core/sim/world.ts`:
  1. Import after the GlowField import (~line 12):
     ```ts
     import { NoiseField } from '../environment/noise-field';
     ```
  2. Declare the field near the other env fields (after `readonly glow: GlowField;` block, ~line 99):
     ```ts
     /** Motion/loudness field (hearing). OFF by default — deposit+step skipped when loudnessGain===0. */
     readonly noise: NoiseField;
     ```
  3. Construct it in the constructor near the `GlowField` construction (~line 254), reusing the food grid geometry so its gradient FD matches the smell FD scale:
     ```ts
     this.noise = new NoiseField(
       config.foodGridCols,
       config.foodGridRows,
       config.worldWidth,
       config.worldHeight,
     );
     ```
  4. Update the `sense(...)` call (lines 471–480) to the new signature:
     ```ts
     sense(
       live,
       n,
       f,
       this.food,
       this.preyField,
       this.organisms.carnivore,
       this.predScent,
       cfg.predFleeWeight,
       this.net,
       this.noise,
       cfg.loudnessGain,
       this.hash,
       cfg.viewRange,
       cfg.viewHalfAngle,
       cfg.worldWidth,
       cfg.worldHeight,
     );
     ```
     NOTE: `cfg.viewRange` / `cfg.viewHalfAngle` do not exist until Phase 3. For Phase 2, pass literal `0, 0` in those two argument slots instead so SIGHT is OFF and no Phase-3 config is required yet:
     ```ts
       cfg.loudnessGain,
       this.hash,
       0, // viewRange — sight OFF until Phase 3 adds cfg.viewRange
       0, // viewHalfAngle — sight OFF until Phase 3
       cfg.worldWidth,
       cfg.worldHeight,
     );
     ```
  5. Add the end-of-tick deposit. Find the food-deposit block (the `for (let k = 0; k < this.liveCount; k++)` loop over `this.liveIndices` that calls `food.depositAt`, ~lines 754–769, followed by `food.step(...)` ~line 770). Immediately AFTER `food.step(cfg.foodDiffuse, cfg.foodDecay);` and the existing prey/pred steps (~line 772), add the guarded hearing deposit over the SAME post-lifecycle live set:
     ```ts
     // Hearing (step 11b): deposit loudnessGain·speed (speed = hypot(velX, velY)) per live cell over
     // the post-lifecycle live set, then step. SENSE reads the gradient next tick (one-tick coupling,
     // like smell). OFF (loudnessGain===0) → skipped entirely: zero added cost, byte-identical.
     if (cfg.loudnessGain > 0) {
       const noise = this.noise;
       const gain = cfg.loudnessGain;
       for (let k = 0; k < this.liveCount; k++) {
         const idx = this.liveIndices[k]!;
         const vx = f.velX[idx]!;
         const vy = f.velY[idx]!;
         noise.depositAt(f.posX[idx]!, f.posY[idx]!, gain * Math.hypot(vx, vy));
       }
       noise.step(cfg.foodDiffuse, cfg.foodDecay);
     }
     ```
     (Reuse `cfg.foodDiffuse`/`cfg.foodDecay` for the NoiseField diffuse/decay in Phase 2 — a dedicated `noiseDiffuse`/`noiseDecay` knob is a later tuning concern, out of scope here; the OFF guard keeps it byte-identical regardless.)
- [ ] run-pass — `pnpm exec vitest run src/core/sim/world.test.ts` (both new tests green).
- [ ] verify determinism unchanged — `pnpm exec vitest run src/core/sim/reproducibility.test.ts` (still green; default `loudnessGain 0` → the deposit block is skipped, so byte-identical).
- [ ] commit — `git add src/core/sim/world.ts src/core/sim/world.test.ts && git commit -m "feat(sim): NoiseField wiring — end-of-tick hearing deposit (guarded OFF) + sense routing"`

---

### Task 11 — `mutate.ts`: `senseSourceRate` operator + gated `rng.int` bumps; initialize new/duplicated genes

**Files**
- Modify: `src/core/genome/mutate.ts` — `MutationRates` interface (~lines 14–26), add the `senseSource` operator, bump the three `rng.int(6)` sites (sensor-channel mutation ~line 76, change-type-to-SENSOR ~line 89, add-gene ~line 130), and initialize `senseSource`/`sightTarget` on the add-gene literal (~lines 123–132) and the duplicate-gene/duplicate-subgraph copies (these use `{ ...src }`/`{ ...child.genes[old]! }` which already carry the fields — verify only).
- Modify: `src/core/sim/world.ts` — `mutationRates` init object (~lines 195–207) + `syncReproParams` (~lines 431–443) add `senseSourceRate`.
- Modify: `src/core/sim/config.ts` — add `mutationSenseSourceRate: number` (interface + default 0) so `syncReproParams` has a source.
- Test: `src/core/genome/mutate.test.ts` (append) — prove (a) all-rates-0 is byte-identical (no extra RNG draws), (b) `senseSourceRate > 0` can flip a sensor gene's `senseSource`.

**Interfaces**
- Produces (verbatim from contract): `senseSourceRate: number;` added to `MutationRates`, to `World.mutationRates`, and to `syncReproParams`. The hardcoded `rng.int(6)` sensor-channel count stays `6` (the existing 6 SensorChannel values FWD/LAT/AMBIENT/TEMP/TOXIN/GLOW are unchanged — `senseSource` is an ORTHOGONAL axis, so the channel count is NOT bumped; only a NEW `senseSource` draw is added, gated behind `senseSourceRate`). The new operator must draw RNG ONLY when `senseSourceRate > 0`, so baseline (rate 0) draws are byte-identical.

Design note (determinism): the existing operators each guard their RNG behind `rng.float() < rate`. Because `rng.float()` itself consumes RNG, a NEW operator that calls `rng.float()` unconditionally would shift every downstream draw and break byte-identity even at rate 0. The existing operators all already pay one `rng.float()` per gene/operator unconditionally (e.g. the sensor-channel loop calls `rng.float()` per SENSOR gene). To stay byte-identical at rate 0, the senseSource operator must be placed so its `rng.float()` is only reached when `senseSourceRate > 0`. The simplest byte-safe construction: wrap the whole new operator in `if (rates.senseSourceRate > 0) { ... }` so NO `rng.float()` is drawn when the rate is 0 (matching how `loudnessGain`/sight gate their cost). Confirm with the reproducibility test that the default path is unchanged.

Steps:
- [ ] RED — append to `src/core/genome/mutate.test.ts`:
  ```ts
  import { describe, it, expect } from 'vitest';
  import { Rng } from '../math/rng';
  import { GenomeStore } from './genome';
  import { mutateGenome, type MutationRates } from './mutate';
  import { buildForagerGenome } from './critter-genome';
  import { SenseSource } from '../cells/sense-source';

  function zeroRates(): MutationRates {
    return {
      paramSigma: 0, paramRate: 0, weightSigma: 0, weightRate: 0,
      addGeneRate: 0, deleteGeneRate: 0, duplicateGeneRate: 0,
      rewireRate: 0, changeTypeRate: 0, duplicateSubgraphRate: 0,
      sensorChannelRate: 0, senseSourceRate: 0,
    };
  }

  describe('mutate — senseSourceRate', () => {
    it('all-rates-0 is byte-identical and draws no extra RNG (clone)', () => {
      const parent = buildForagerGenome();
      const store = new GenomeStore();
      const a = mutateGenome(parent, new Rng(123), zeroRates(), store);
      // identical to a plain clone of the genes' senseSource
      for (let i = 0; i < a.genes.length; i++) {
        expect(a.genes[i]!.senseSource).toBe(parent.genes[i]!.senseSource);
      }
    });

    it('rate-0 senseSource operator does not perturb the downstream RNG stream', () => {
      // Two runs with identical rng seeds + a non-zero LATER operator (weightRate) must match,
      // proving the gated senseSource block consumed no RNG at rate 0.
      const parent = buildForagerGenome();
      const rates = { ...zeroRates(), weightRate: 1, weightSigma: 0.1 };
      const a = mutateGenome(parent, new Rng(999), rates, new GenomeStore());
      const b = mutateGenome(parent, new Rng(999), rates, new GenomeStore());
      for (let i = 0; i < a.connectionRules.length; i++) {
        expect(a.connectionRules[i]!.weight).toBe(b.connectionRules[i]!.weight);
      }
    });

    it('senseSourceRate 1 flips at least one sensor gene off SMELL', () => {
      const parent = buildForagerGenome(); // genes 1,2 are SENSOR
      const rates = { ...zeroRates(), senseSourceRate: 1 };
      const child = mutateGenome(parent, new Rng(42), rates, new GenomeStore());
      const changed = child.genes.some(
        (g, i) => g.senseSource !== parent.genes[i]!.senseSource,
      );
      expect(changed).toBe(true);
    });
  });
  ```
- [ ] run-fail — `pnpm exec vitest run src/core/genome/mutate.test.ts`
  Expected: TS error — `senseSourceRate` is not a known property of `MutationRates`. Suite fails the file.
- [ ] GREEN — edits:
  1. `src/core/sim/config.ts` — add to the `Config` interface after `mutationSensorChannelRate: number;` (~line 215):
     ```ts
       mutationSensorChannelRate: number;
       /** Probability a SENSOR gene's senseSource (SMELL/SIGHT/HEARING) is reassigned per reproduction.
        *  0 = OFF (no RNG drawn → baseline byte-identical). Gated behind senses-ON. */
       mutationSenseSourceRate: number;
     ```
     and to `defaultConfig` after `mutationSensorChannelRate: 0,` (~line 432):
     ```ts
       mutationSensorChannelRate: 0,
       mutationSenseSourceRate: 0,
     ```
  2. `src/core/genome/mutate.ts` — add to the `MutationRates` interface (after `sensorChannelRate: number;`, line 25):
     ```ts
       sensorChannelRate: number;
       senseSourceRate: number;
     ```
     Add the import at the top (it already imports `CellType`):
     ```ts
     import { SenseSource } from '../cells/sense-source';
     ```
     Add the new operator immediately AFTER the existing sensor-channel loop (after line 78, before the change-type block). Gate the WHOLE block on the rate so rate 0 draws zero RNG:
     ```ts
     // senseSource mutation: gated entirely behind senses-ON so rate-0 draws NO RNG (byte-identical
     // baseline). Each SENSOR gene may switch modality (SMELL/SIGHT/HEARING); when it lands on SIGHT
     // its sightTarget is (re)drawn FOOD/PREY/PREDATOR.
     if (rates.senseSourceRate > 0) {
       for (let gi = 0; gi < child.genes.length; gi++) {
         const gene = child.genes[gi]!;
         if (gene.cellType === CellType.SENSOR && rng.float() < rates.senseSourceRate) {
           gene.senseSource = rng.int(3); // SMELL=0 / SIGHT=1 / HEARING=2
           if (gene.senseSource === SenseSource.SIGHT) gene.sightTarget = rng.int(3);
         }
       }
     }
     ```
     (The hardcoded `rng.int(6)` sensor-CHANNEL sites stay `6` — `senseSource` is orthogonal to `sensorChannel`; the 6 channels are unchanged.)
  3. `src/core/genome/mutate.ts` — the add-gene `Gene` literal (lines 123–132) must initialize the two new fields (a `Gene` now requires them):
     ```ts
     const gene: Gene = {
       innovation: store.nextInnovationId(),
       cellType: type,
       radius: 6,
       mass: 2,
       initialEnergy: 100,
       bias: 0,
       sensorChannel: type === CellType.SENSOR ? rng.int(6) : -1,
       glowGain: 0,
       senseSource: SenseSource.SMELL,
       sightTarget: 0 /* SightTarget.FOOD */,
     };
     ```
     The duplicate-gene copy (`{ ...src, innovation: ... }`, line 108) and duplicate-subgraph copy (`{ ...child.genes[old]!, innovation: ... }`, line 197) already carry `senseSource`/`sightTarget` via the spread — no edit needed (verify by reading those two lines).
  4. `src/core/sim/world.ts` — add to the `this.mutationRates = { ... }` init (after `sensorChannelRate: 0,`, ~line 206):
     ```ts
       sensorChannelRate: 0,
       senseSourceRate: 0,
     ```
     and to `syncReproParams` (after `mr.sensorChannelRate = cfg.mutationSensorChannelRate;`, ~line 443):
     ```ts
       mr.sensorChannelRate = cfg.mutationSensorChannelRate;
       mr.senseSourceRate = cfg.mutationSenseSourceRate;
     ```
- [ ] run-pass — `pnpm exec vitest run src/core/genome/mutate.test.ts` (3 new tests green).
- [ ] run — `pnpm exec vitest run src/core/sim/reproducibility.test.ts` (still green — default `mutationSenseSourceRate 0` → gated block skipped → byte-identical mutation stream).
- [ ] commit — `git add src/core/genome/mutate.ts src/core/sim/world.ts src/core/sim/config.ts src/core/genome/mutate.test.ts && git commit -m "feat(genome): gated senseSource mutation operator (senseSourceRate, default 0)"`

---

### Task 12 — brain-inspector: label sensor inputs by `senseSource`

**Files**
- Modify: `src/app/brain-inspector.ts` — the node-drawing loop (~lines 99–126), reading `world.net.sensorSource` for SENSOR cells.
- Test: none required (canvas UI; read-only over core, not on the determinism contract). Verify it compiles via `make check`.

**Interfaces**
- Consumes: `world.net.sensorCell`, `world.net.sensorSource`, `SenseSource` enum.
- Produces: each SENSOR node draws a modality letter (M=smell, H=hearing, V=sight) instead of the bare `S` tag, so a sight-lock → interneuron → mover chain is readable. Purely cosmetic.

Design note: the inspector iterates `net.liveNeurons` by cell slot, but `senseSource` is indexed by sensor BINDING. Build a tiny per-render reverse lookup from cell slot → senseSource by scanning `net.sensorCell` (read-only, render-time only, not the hot loop — allocation here is fine since the inspector already allocates strings each frame).

Steps:
- [ ] GREEN (no RED — UI-only, no determinism contract) — in `src/app/brain-inspector.ts`:
  1. Add the import at the top:
     ```ts
     import { SenseSource } from '../core/cells/sense-source';
     ```
  2. Add a helper to map a sensor cell slot → a one-letter modality tag, placed inside `render` before the node loop (after the edges loop, ~line 96). Build it once per render from the sensor bindings:
     ```ts
     // Sensor-cell → modality letter (render-time reverse lookup; UI only, not the hot loop).
     const senseTag = new Map<number, string>();
     for (let k = 0; k < net.sensorCount; k++) {
       const src = net.sensorSource[k]!;
       const letter =
         src === SenseSource.HEARING ? 'H' : src === SenseSource.SIGHT ? 'V' : 'M'; // M=sMell
       senseTag.set(net.sensorCell[k]!, letter);
     }
     ```
  3. In the node loop, replace the type-tag draw (line 120) so SENSOR cells show their modality:
     ```ts
       const tag =
         f.cellType[i]! === CellType.SENSOR ? (senseTag.get(i) ?? 'S') : (TYPE_TAG[f.cellType[i]!] ?? '?');
       ctx.fillText(tag, px, py + 0.5);
     ```
  4. Update the footer key (line 133) to document the new letters:
     ```ts
     ctx.fillText('M smell  H hearing  V sight  ·  N neuron  M mover  ·  − blue / + orange', 10, h - 8);
     ```
     (Note the footer's leading `M smell` collides with `M mover`; keep the existing `N neuron  M mover` semantics for non-sensor nodes — the SENSOR-node letter is contextual. Acceptable for a debug overlay; flagged as cosmetic.)
- [ ] run — `make check` (typecheck + lint + the full vitest suite). Expected: green across the whole repo now that every `addSensor` caller, every `Gene` producer, and every `sense` caller is updated. This is the first full-repo gate in the phase.
- [ ] commit — `git add src/app/brain-inspector.ts && git commit -m "feat(ui): brain-inspector labels sensors by senseSource (M/H/V)"`

---

### Task 13 — `traits.ts`: count sense modalities (telemetry/signature)

**Files**
- Modify: `src/core/genome/traits.ts` — `GenomeTraits` interface (~lines 11–28) + the counting loop (~lines 36–60).
- Test: `src/core/genome/traits.test.ts` (append; create if absent).

**Interfaces**
- Consumes: `Gene.senseSource`, `CellType.SENSOR`, `SenseSource` enum.
- Produces: three new counts on `GenomeTraits` — `smellGenes`, `sightGenes`, `hearingGenes` — counted over SENSOR genes by `senseSource`. (This keeps telemetry observation-only; no fitness/score in core, honoring the CARDINAL RULE — these are structural type counts, exactly like the existing `sensorGenes`.)

Steps:
- [ ] RED — append to `src/core/genome/traits.test.ts`:
  ```ts
  import { describe, it, expect } from 'vitest';
  import { genomeTraits } from './traits';
  import { buildForagerGenome } from './critter-genome';
  import { type Gene } from './genome';
  import { SenseSource, SightTarget } from '../cells/sense-source';

  describe('genomeTraits — sense modality counts', () => {
    it('counts SENSOR genes by senseSource', () => {
      const g = buildForagerGenome(); // genes 1,2 are SENSOR, default SMELL
      g.genes[1] = { ...(g.genes[1] as Gene), senseSource: SenseSource.HEARING };
      g.genes[2] = { ...(g.genes[2] as Gene), senseSource: SenseSource.SIGHT, sightTarget: SightTarget.PREY };
      const t = genomeTraits(g);
      expect(t.smellGenes).toBe(0);
      expect(t.hearingGenes).toBe(1);
      expect(t.sightGenes).toBe(1);
    });

    it('a default forager has only SMELL sensors', () => {
      const t = genomeTraits(buildForagerGenome());
      expect(t.smellGenes).toBe(2);
      expect(t.hearingGenes).toBe(0);
      expect(t.sightGenes).toBe(0);
    });
  });
  ```
- [ ] run-fail — `pnpm exec vitest run src/core/genome/traits.test.ts`
  Expected: TS error — `Property 'smellGenes' does not exist on type 'GenomeTraits'`. Suite fails the file.
- [ ] GREEN — in `src/core/genome/traits.ts`:
  1. Add the import (it already imports `CellType`):
     ```ts
     import { SenseSource } from '../cells/sense-source';
     ```
  2. Add to the `GenomeTraits` interface (after `sensorGenes: number;`):
     ```ts
       sensorGenes: number;
       smellGenes: number;
       sightGenes: number;
       hearingGenes: number;
     ```
  3. In `genomeTraits`, add accumulators before the loop:
     ```ts
     let smell = 0;
     let sight = 0;
     let hearing = 0;
     ```
     and inside the `for` loop, in the `case CellType.SENSOR:` arm, tally by modality:
     ```ts
       case CellType.SENSOR:
         sensor++;
         if (gene.senseSource === SenseSource.HEARING) hearing++;
         else if (gene.senseSource === SenseSource.SIGHT) sight++;
         else smell++;
         break;
     ```
  4. Add the three counts to the returned object:
     ```ts
       sensorGenes: sensor,
       smellGenes: smell,
       sightGenes: sight,
       hearingGenes: hearing,
     ```
- [ ] run-pass — `pnpm exec vitest run src/core/genome/traits.test.ts` (green).
- [ ] commit — `git add src/core/genome/traits.ts src/core/genome/traits.test.ts && git commit -m "feat(genome): traits count SENSOR genes by senseSource (smell/sight/hearing)"`

---

### Task 14 — full-phase gate

**Files**
- Test: whole repo (no new files).

**Interfaces** — none.

Steps:
- [ ] run — `make check`. Expected: typecheck + lint clean, ALL vitest suites green — including `reproducibility.test.ts` (default config byte-identical: `loudnessGain 0`, `mutationSenseSourceRate 0`, all founder genes `senseSource SMELL`, so the new code paths are all skipped/no-op).
- [ ] If `make check` surfaces an unused-parameter lint on `sense.ts`'s `hash`/`viewHalfAngle`/`worldWidth`/`worldHeight` (Phase-3 params not yet consumed), add at the top of the SIGHT branch in `sense.ts`:
  ```ts
        // params consumed by the Phase-3 cone query; referenced to satisfy noUnusedParameters
        void hash; void viewHalfAngle; void worldWidth; void worldHeight;
  ```
  then re-run `pnpm exec vitest run src/core/cells/sense.test.ts` and `make check`.
- [ ] commit (only if a fix was needed in the prior step) — `git add src/core/cells/sense.ts && git commit -m "chore(cells): silence unused Phase-3 sight params until they are wired"`
- [ ] Phase 2 complete: `senseSource` threads gene → develop → instantiate → network → sense routing → inspector; `NoiseField` deposits hearing end-of-tick (guarded OFF); `loudnessGain`/`mutationSenseSourceRate` knobs default 0; the whole sim is byte-identical to pre-Phase-2 under the default config.

---

## Phase 3 — Sight (cone query) + 3b rock occlusion

**Pre-reqs (assumed already landed by Phases 1–2, this contract is LAW):**
- `src/core/cells/sense-source.ts` exists and exports `SenseSource = { SMELL: 0, SIGHT: 1, HEARING: 2 } as const` and `SightTarget = { FOOD: 0, PREY: 1, PREDATOR: 2 } as const` (plus `SenseSourceValue`/`SightTargetValue` types).
- `NeuralNetwork` (`src/core/neural/network.ts`) already carries parallel `readonly sensorSource: Uint8Array` and `readonly sensorSightTarget: Uint8Array` (sized `maxNeurons`), populated by the Phase-2 `addSensor(cell, channel, source, sightTarget)`.
- `src/core/cells/sense.ts` already has the Phase-2 signature:
  ```ts
  export function sense(
    live: Uint32Array, n: number, f: CellArrays,
    food: FoodField, preyField: FoodField, carnivore: Uint8Array, predField: FoodField, fleeWeight: number,
    net: NeuralNetwork,
    noise: NoiseField, loudnessGain: number,
    hash: SpatialHash, viewRange: number, viewHalfAngle: number,
    worldWidth: number, worldHeight: number,
  ): void
  ```
  with SMELL + HEARING branches wired and a **zero/stub SIGHT branch** (writes `senseX=senseY=0` for SIGHT sensors). Phase 3 replaces that stub with a real call into `sightVector`.

**Cardinal-rule note for every task below:** sight classification reads ONLY `f.cellType[j]` and `carnivore[f.organismId[j]]`. Never `founderId`/lineage/genomeRef/any id-as-identity. The own-organism exclusion uses `f.organismId[j] !== f.organismId[i]` (structural, exactly like bonds/predation).

**Determinism contract for every task:** no `Math.random`/`Date.now`; scan in canonical order (ascending bucket index, then ascending sorted-slot within a bucket — that is the order `hash.sorted` already holds within `[bucketStart[b], bucketStart[b+1])`); nearest selected by strict `<` on **squared** toroidal distance so exact ties resolve to first-in-canonical-scan-order; allocation-free (no per-call array/object creation — reuse caller scratch / locals only).

---

### Task 1 — `sightVector`: the (2R+1)×(2R+1) cone query, no occlusion

**Files**
- Create: `src/core/cells/sight.ts`
- Create (test): `src/core/cells/sight.test.ts`

**Interfaces**

Consumes:
- `SpatialHash` (`src/core/spatial/spatial-hash.ts`) — public surface: `readonly cols`, `readonly rows`, `readonly width`, `readonly height`, `readonly bucketStart: Uint32Array`, `readonly sorted: Uint32Array`, `colOf(x): number`, `rowOf(y): number`. Cell size is `hash.width / hash.cols` (square cells: `width/cols === height/rows` because the hash uses one `cellSize`).
- `CellArrays` (`src/core/memory/cell-store.ts`) — reads `posX: Float64Array`, `posY: Float64Array`, `heading: Float32Array`, `cellType: Uint8Array`, `organismId: Uint32Array`; writes `senseX: Float32Array`, `senseY: Float32Array`.
- `wrapDelta(d, span)` from `src/core/math/vec2.ts`.
- `isEdibleBy(eater, prey)`, `isFlesh(prey)`, `CellType` from `src/core/cells/types.ts`.
- `SightTarget` from `src/core/cells/sense-source.ts`.

Produces (EXACT signature from the contract — do not rename a parameter):
```ts
export function sightVector(
  i: number,                 // the eye cell slot
  f: CellArrays,
  hash: SpatialHash,
  carnivore: Uint8Array,     // organisms.carnivore — for PREY/PREDATOR classification
  sightTarget: number,       // SightTarget enum for THIS eye
  viewRange: number,
  viewHalfAngle: number,
  worldWidth: number,
  worldHeight: number,
): void;                     // writes f.senseX[i], f.senseY[i]
```

Semantics (from the design spec + contract):
- `R = ceil(viewRange / cellSize)`, `cellSize = hash.width / hash.cols`. Scan the `(2R+1)×(2R+1)` block of buckets centered on the eye's bucket.
- For each candidate `j`: skip `j === i`; skip `f.organismId[j] === f.organismId[i]` (own organism, including the free-cell case org 0 vs org 0 — a free MOTILE eye excludes other free cells too, which is correct: "own organism" 0 means unaffiliated, and we never want a free eye to range over the whole free-cell soup; the spec excludes "the creature's own organism cells" and free eyes are not the founder-brain case). Classify `j`:
  - `FOOD`  → nearest cell with `isEdibleBy(CellType.MOTILE, f.cellType[j])` (PHOTO or MEAT).
  - `PREY`  → nearest cell with `isFlesh(f.cellType[j]) && carnivore[f.organismId[j]] === 0`.
  - `PREDATOR` → nearest cell with `isFlesh(f.cellType[j]) && carnivore[f.organismId[j]] === 1`.
- Toroidal delta to candidate: `dx = wrapDelta(posX[j]-posX[i], worldWidth)`, `dy = wrapDelta(posY[j]-posY[i], worldHeight)`. `d2 = dx*dx+dy*dy`. Reject if `d2 > viewRange*viewRange` (out of range) or `d2 === 0` (coincident).
- Cone test: the eye looks along `heading[i]`. Reject if the angle between heading and `(dx,dy)` exceeds `viewHalfAngle`. Allocation-free angle test: `cos(angle) = (dx*cosH + dy*sinH)/dist`; accept iff `dot >= dist * cos(viewHalfAngle)` where `dot = dx*cosH + dy*sinH`. Compute `cosHalf = Math.cos(viewHalfAngle)` once. (Guard the `cosHalf < 0` / behind-eye case naturally: if `dot < 0` the candidate is behind; with `cosHalf` from a half-angle `< π/2`, `dot >= dist*cosHalf` already rejects it.)
- Nearest by strict `<` on `d2`. Tie (equal `d2`) keeps the earlier candidate (do NOT overwrite on `==`) → first-in-canonical-scan-order.
- Output: if a target was found, `dist = sqrt(bestD2)`, `proximity = clamp((viewRange - dist)/viewRange, 0, 1)`, `senseX[i] = (bestDx/dist)*proximity`, `senseY[i] = (bestDy/dist)*proximity`. If none found, `senseX[i] = 0; senseY[i] = 0`.

**Toroidal-seam double-count guard (re-derived for the wider window — CRITICAL):** the shared 3×3 loop (`computeRepulsion`) relies on the hash guaranteeing `cols >= 3, rows >= 3` so a 3×3 block never aliases a bucket onto itself. For a `(2R+1)` window with `R` up to 3–4 the span is up to 9 buckets wide; if `2R+1 >= cols` (or `>= rows`) the modulo wrap can map two different `dx` offsets onto the SAME column, so the same bucket — and thus the same candidate `j` — is visited twice. With strict-`<` nearest selection a double-visit is **idempotent for the winner** but can corrupt the tie-break (a later duplicate of the winning bucket re-tests the same `j` and, being equal `d2`, is correctly rejected — but a duplicate of a DIFFERENT bucket scanned in the wrong relative order can change which equal-distance candidate wins). The robust, allocation-free guard: **only visit a (bx,by) bucket once.** Because the test cases here keep the world large (`cols,rows >> 2R+1`), the simplest correct guard is to skip an offset whose wrapped column/row collides with an already-counted offset in this scan. Concretely: iterate `dyOff` from `-R..R` and `dxOff` from `-R..R`; compute `bx = ((cx+dxOff)%cols+cols)%cols`, `by = ((cy+dyOff)%rows+rows)%rows`; **skip the bucket if `Math.abs(dxOff) > (cols-1)/2` or `Math.abs(dyOff) > (rows-1)/2`** (offsets beyond the half-grid alias a nearer offset and would re-scan). Document this exact rule in the function doc-comment and in `READS-WRITES.md` (Task 5). Since the spec pins `R <= 3–4` and worlds are ≥ 32 buckets wide, the guard is a no-op in production but keeps tiny-grid unit tests correct.

- [ ] **RED** — write `src/core/cells/sight.test.ts` with the cone-query cases:
```ts
import { describe, it, expect } from 'vitest';
import { CellStore } from '../memory/cell-store';
import { SpatialHash } from '../spatial/spatial-hash';
import { CellType } from './types';
import { SightTarget } from './sense-source';
import { sightVector } from './sight';

// Build a hash over `store`'s current live cells so sightVector can scan buckets.
function buildHash(store: CellStore, live: number[], w = 800, h = 800, cellSize = 16): SpatialHash {
  const f = store.fields;
  const hash = new SpatialHash(w, h, cellSize, store.capacity);
  hash.build(Uint32Array.from(live), live.length, f.posX, f.posY);
  return hash;
}

describe('sightVector — FOOD target, no occlusion', () => {
  it('writes unitDir×proximity toward the nearest edible cell in the cone', () => {
    const store = new CellStore(8, false);
    const f = store.fields;
    const eye = store.alloc(); // 0
    f.posX[eye] = 400; f.posY[eye] = 400; f.heading[eye] = 0; // looking +x
    f.cellType[eye] = CellType.SENSOR; f.organismId[eye] = 1;

    const food = store.alloc(); // 1 — 50 units ahead in +x
    f.posX[food] = 450; f.posY[food] = 400;
    f.cellType[food] = CellType.PHOTO; f.organismId[food] = 0;

    const hash = buildHash(store, [eye, food]);
    const carn = new Uint8Array(8);
    sightVector(eye, f, hash, carn, SightTarget.FOOD, 100, Math.PI / 4, 800, 800);

    // dist 50, viewRange 100 → proximity 0.5; unit dir +x → senseX 0.5, senseY 0.
    expect(f.senseX[eye]).toBeCloseTo(0.5, 5);
    expect(f.senseY[eye]).toBeCloseTo(0, 5);
  });

  it('writes the zero vector when nothing is in the cone', () => {
    const store = new CellStore(8, false);
    const f = store.fields;
    const eye = store.alloc();
    f.posX[eye] = 400; f.posY[eye] = 400; f.heading[eye] = 0;
    f.cellType[eye] = CellType.SENSOR; f.organismId[eye] = 1;
    const behind = store.alloc(); // directly BEHIND the eye (−x) → outside the cone
    f.posX[behind] = 350; f.posY[behind] = 400;
    f.cellType[behind] = CellType.PHOTO; f.organismId[behind] = 0;
    const hash = buildHash(store, [eye, behind]);
    sightVector(eye, f, hash, new Uint8Array(8), SightTarget.FOOD, 100, Math.PI / 4, 800, 800);
    expect(f.senseX[eye]).toBe(0);
    expect(f.senseY[eye]).toBe(0);
  });

  it('ignores a cell beyond viewRange', () => {
    const store = new CellStore(8, false);
    const f = store.fields;
    const eye = store.alloc();
    f.posX[eye] = 400; f.posY[eye] = 400; f.heading[eye] = 0;
    f.cellType[eye] = CellType.SENSOR; f.organismId[eye] = 1;
    const far = store.alloc(); // 90 ahead, viewRange 60 → out of range
    f.posX[far] = 490; f.posY[far] = 400;
    f.cellType[far] = CellType.PHOTO; f.organismId[far] = 0;
    const hash = buildHash(store, [eye, far]);
    sightVector(eye, f, hash, new Uint8Array(8), SightTarget.FOOD, 60, Math.PI / 4, 800, 800);
    expect(f.senseX[eye]).toBe(0);
    expect(f.senseY[eye]).toBe(0);
  });

  it('excludes the eye’s own organism cells', () => {
    const store = new CellStore(8, false);
    const f = store.fields;
    const eye = store.alloc();
    f.posX[eye] = 400; f.posY[eye] = 400; f.heading[eye] = 0;
    f.cellType[eye] = CellType.SENSOR; f.organismId[eye] = 5;
    const sib = store.alloc(); // same organism (5) → excluded even though edible-typed
    f.posX[sib] = 440; f.posY[sib] = 400;
    f.cellType[sib] = CellType.PHOTO; f.organismId[sib] = 5;
    const hash = buildHash(store, [eye, sib]);
    sightVector(eye, f, hash, new Uint8Array(8), SightTarget.FOOD, 100, Math.PI / 4, 800, 800);
    expect(f.senseX[eye]).toBe(0);
    expect(f.senseY[eye]).toBe(0);
  });

  it('picks the strictly nearer of two in-cone targets (tie-break by canonical order on ==)', () => {
    const store = new CellStore(8, false);
    const f = store.fields;
    const eye = store.alloc(); // 0
    f.posX[eye] = 400; f.posY[eye] = 400; f.heading[eye] = 0;
    f.cellType[eye] = CellType.SENSOR; f.organismId[eye] = 1;
    const nearC = store.alloc(); // 1 — 30 ahead
    f.posX[nearC] = 430; f.posY[nearC] = 400;
    f.cellType[nearC] = CellType.PHOTO; f.organismId[nearC] = 0;
    const farC = store.alloc(); // 2 — 60 ahead
    f.posX[farC] = 460; f.posY[farC] = 400;
    f.cellType[farC] = CellType.PHOTO; f.organismId[farC] = 0;
    const hash = buildHash(store, [eye, nearC, farC]);
    sightVector(eye, f, hash, new Uint8Array(8), SightTarget.FOOD, 100, Math.PI / 4, 800, 800);
    // nearer at dist 30 → proximity 0.7, +x.
    expect(f.senseX[eye]).toBeCloseTo(0.7, 5);
    expect(f.senseY[eye]).toBeCloseTo(0, 5);
  });
});

describe('sightVector — PREY vs PREDATOR classification', () => {
  it('PREY eye locks the nearest non-carnivore flesh; ignores carnivore flesh and plants', () => {
    const store = new CellStore(8, false);
    const f = store.fields;
    const eye = store.alloc(); // 0, predator's eye
    f.posX[eye] = 400; f.posY[eye] = 400; f.heading[eye] = 0;
    f.cellType[eye] = CellType.SENSOR; f.organismId[eye] = 1;
    const plant = store.alloc(); // 1 — PHOTO ahead, must be ignored by a PREY eye
    f.posX[plant] = 420; f.posY[plant] = 400;
    f.cellType[plant] = CellType.PHOTO; f.organismId[plant] = 0;
    const prey = store.alloc(); // 2 — herbivore MOVER ahead
    f.posX[prey] = 450; f.posY[prey] = 400;
    f.cellType[prey] = CellType.MOVER; f.organismId[prey] = 2;
    const carn = new Uint8Array(8);
    carn[1] = 1; // eye's own organism is a carnivore (irrelevant here); org 2 is prey (carn=0)
    const hash = buildHash(store, [eye, plant, prey]);
    sightVector(eye, f, hash, carn, SightTarget.PREY, 100, Math.PI / 4, 800, 800);
    // locks the prey at dist 50 → proximity 0.5, +x (the nearer PHOTO is skipped).
    expect(f.senseX[eye]).toBeCloseTo(0.5, 5);
    expect(f.senseY[eye]).toBeCloseTo(0, 5);
  });

  it('PREDATOR eye locks the nearest carnivore flesh; ignores non-carnivore flesh', () => {
    const store = new CellStore(8, false);
    const f = store.fields;
    const eye = store.alloc(); // 0, a prey's eye
    f.posX[eye] = 400; f.posY[eye] = 400; f.heading[eye] = 0;
    f.cellType[eye] = CellType.SENSOR; f.organismId[eye] = 2;
    const otherPrey = store.alloc(); // 1 — another herbivore flesh ahead, must be ignored
    f.posX[otherPrey] = 420; f.posY[otherPrey] = 400;
    f.cellType[otherPrey] = CellType.MOVER; f.organismId[otherPrey] = 3;
    const hunter = store.alloc(); // 2 — carnivore flesh ahead
    f.posX[hunter] = 460; f.posY[hunter] = 400;
    f.cellType[hunter] = CellType.MOVER; f.organismId[hunter] = 1;
    const carn = new Uint8Array(8);
    carn[1] = 1; // org 1 carnivore; org 3 not
    const hash = buildHash(store, [eye, otherPrey, hunter]);
    sightVector(eye, f, hash, carn, SightTarget.PREDATOR, 100, Math.PI / 4, 800, 800);
    // locks the hunter at dist 60 → proximity 0.4, +x.
    expect(f.senseX[eye]).toBeCloseTo(0.4, 5);
    expect(f.senseY[eye]).toBeCloseTo(0, 5);
  });
});
```

- [ ] **run-fail** — `pnpm exec vitest run src/core/cells/sight.test.ts`. Expected: module-resolution failure — `Error: Failed to load url ./sight` / `No "sightVector" export` (file does not exist yet).

- [ ] **GREEN** — create `src/core/cells/sight.ts`:
```ts
import { type CellArrays } from '../memory/cell-store';
import { type SpatialHash } from '../spatial/spatial-hash';
import { wrapDelta } from '../math/vec2';
import { CellType, isEdibleBy, isFlesh } from './types';
import { SightTarget } from './sense-source';

/**
 * SIGHT cone query (§ "Senses & Smarter Creatures" Phase 3). Looks along eye cell `i`'s heading
 * and writes (senseX[i], senseY[i]) = unitDirToTarget × proximity for the NEAREST cell of the
 * eye's `sightTarget` class within `viewRange` and `viewHalfAngle`; zero vector when the cone is
 * empty. Allocation-free; reads ONLY f.cellType[j] + carnivore[organismId[j]] (cardinal-safe),
 * excludes the eye's own organism (f.organismId[j] !== f.organismId[i]).
 *
 * Scans a (2R+1)×(2R+1) hash block, R = ceil(viewRange/cellSize) — NOT the shared 3×3 loop.
 * Canonical scan order = ascending bucket index, then ascending sorted slot; nearest by strict
 * `<` on squared toroidal distance so equal-distance ties keep the first-seen (canonical) winner.
 *
 * Toroidal-seam double-count guard: the 3×3 alias guard does not generalize. For the wider window
 * a bucket whose wrapped offset exceeds the half-grid would alias a nearer offset and be scanned
 * twice (corrupting the tie-break). We skip any offset with |dxOff| > (cols-1)/2 or
 * |dyOff| > (rows-1)/2. With the documented R ≤ 3–4 and worlds ≥ 32 buckets this is a no-op in
 * production, but it keeps tiny-grid unit tests correct.
 */
export function sightVector(
  i: number,
  f: CellArrays,
  hash: SpatialHash,
  carnivore: Uint8Array,
  sightTarget: number,
  viewRange: number,
  viewHalfAngle: number,
  worldWidth: number,
  worldHeight: number,
): void {
  const cols = hash.cols;
  const rows = hash.rows;
  const cellSize = hash.width / cols;
  const R = Math.ceil(viewRange / cellSize);

  const xi = f.posX[i]!;
  const yi = f.posY[i]!;
  const orgI = f.organismId[i]!;
  const h = f.heading[i]!;
  const cosH = Math.cos(h);
  const sinH = Math.sin(h);
  const cosHalf = Math.cos(viewHalfAngle);
  const range2 = viewRange * viewRange;

  const cx = hash.colOf(xi);
  const cy = hash.rowOf(yi);
  const halfCols = (cols - 1) / 2;
  const halfRows = (rows - 1) / 2;

  let bestD2 = Infinity;
  let bestDx = 0;
  let bestDy = 0;
  let found = false;

  for (let dyOff = -R; dyOff <= R; dyOff++) {
    if (dyOff > halfRows || dyOff < -halfRows) continue; // seam guard (row)
    const by = ((cy + dyOff) % rows + rows) % rows;
    for (let dxOff = -R; dxOff <= R; dxOff++) {
      if (dxOff > halfCols || dxOff < -halfCols) continue; // seam guard (col)
      const bx = ((cx + dxOff) % cols + cols) % cols;
      const b = by * cols + bx;
      const end = hash.bucketStart[b + 1]!;
      for (let idx = hash.bucketStart[b]!; idx < end; idx++) {
        const j = hash.sorted[idx]!;
        if (j === i) continue;
        if (f.organismId[j]! === orgI) continue; // own organism (structural, cardinal-safe)
        const t = f.cellType[j]!;
        let match = false;
        if (sightTarget === SightTarget.FOOD) {
          match = isEdibleBy(CellType.MOTILE, t);
        } else if (sightTarget === SightTarget.PREY) {
          match = isFlesh(t) && carnivore[f.organismId[j]!]! === 0;
        } else {
          // SightTarget.PREDATOR
          match = isFlesh(t) && carnivore[f.organismId[j]!]! === 1;
        }
        if (!match) continue;
        const dx = wrapDelta(f.posX[j]! - xi, worldWidth);
        const dy = wrapDelta(f.posY[j]! - yi, worldHeight);
        const d2 = dx * dx + dy * dy;
        if (d2 === 0 || d2 > range2) continue;
        const dist = Math.sqrt(d2);
        const dot = dx * cosH + dy * sinH;
        if (dot < dist * cosHalf) continue; // outside the cone half-angle
        if (d2 < bestD2) {
          bestD2 = d2;
          bestDx = dx;
          bestDy = dy;
          found = true;
        }
      }
    }
  }

  if (!found) {
    f.senseX[i] = 0;
    f.senseY[i] = 0;
    return;
  }
  const dist = Math.sqrt(bestD2);
  let proximity = (viewRange - dist) / viewRange;
  if (proximity < 0) proximity = 0;
  else if (proximity > 1) proximity = 1;
  const inv = proximity / dist;
  f.senseX[i] = bestDx * inv;
  f.senseY[i] = bestDy * inv;
}
```

- [ ] **run-pass** — `pnpm exec vitest run src/core/cells/sight.test.ts`. Expected: all cases pass.

- [ ] **commit** — `git add src/core/cells/sight.ts src/core/cells/sight.test.ts && git commit -m "feat(sim): SIGHT cone query sightVector (no occlusion, OFF by default)"`

---

### Task 2 — Toroidal-seam guard regression test (wider window)

**Files**
- Modify (test): `src/core/cells/sight.test.ts` (append a `describe` block)

**Interfaces**

Consumes: same as Task 1 — `sightVector`, `SpatialHash`, `CellStore`. This task adds a test that exercises the `(2R+1)` window on a grid SMALL enough (exactly the minimum `3×3`) that `2R+1 > cols`, proving the seam guard prevents a duplicate-scan from corrupting the result.

Produces: no new source — verifies the existing guard in `sight.ts`.

- [ ] **RED** — append to `src/core/cells/sight.test.ts`:
```ts
describe('sightVector — toroidal-seam guard on the minimum 3×3 grid', () => {
  it('does not double-count when 2R+1 exceeds the grid width', () => {
    // world 48×48, cellSize 16 → exactly cols=rows=3 (the hash minimum). viewRange 30 → R=2,
    // so a 5×5 window over a 3×3 grid: every column/row offset beyond ±1 must be skipped.
    const store = new CellStore(8, false);
    const f = store.fields;
    const eye = store.alloc(); // 0
    f.posX[eye] = 24; f.posY[eye] = 24; f.heading[eye] = 0; // center bucket, looking +x
    f.cellType[eye] = CellType.SENSOR; f.organismId[eye] = 1;
    const food = store.alloc(); // 1 — 20 ahead in +x, in range (viewRange 30)
    f.posX[food] = 44; f.posY[food] = 24;
    f.cellType[food] = CellType.PHOTO; f.organismId[food] = 0;

    const hash = new SpatialHash(48, 48, 16, store.capacity);
    hash.build(Uint32Array.from([eye, food]), 2, f.posX, f.posY);

    sightVector(eye, f, hash, new Uint8Array(8), SightTarget.FOOD, 30, Math.PI / 2, 48, 48);
    // dist 20, viewRange 30 → proximity 1/3; +x. A double-scan would still pick the same winner
    // by strict-<, but the guard makes the scan visit each bucket exactly once.
    expect(f.senseX[eye]).toBeCloseTo(1 / 3, 5);
    expect(f.senseY[eye]).toBeCloseTo(0, 5);
  });
});
```

- [ ] **run-fail** — `pnpm exec vitest run src/core/cells/sight.test.ts -t "toroidal-seam guard"`. Expected: this is a regression guard, so if the seam guard from Task 1 is correct it should PASS immediately. If it FAILS (e.g. `senseX` is `NaN` or wrong because the eye bucket aliased), that proves the guard is missing/broken — fix `sight.ts` until it passes. (Document: this task's RED may already be green — that is acceptable; its purpose is to lock the seam behavior so a later refactor cannot regress it.)

- [ ] **run-pass** — `pnpm exec vitest run src/core/cells/sight.test.ts`. Expected: all cases incl. the seam guard pass.

- [ ] **commit** — `git add src/core/cells/sight.test.ts && git commit -m "test(sim): lock SIGHT toroidal-seam guard on the minimum 3×3 grid"`

---

### Task 3 — Add `viewRange`/`viewHalfAngle` config knobs (OFF by default)

**Files**
- Modify: `src/core/sim/config.ts` — `Config` interface (add after the `predFleeWeight` block near line 122, before the `// Sensing & movement` block) AND `defaultConfig` (add near the predation defaults, ~line 373).
- Modify (test): `src/core/sim/reproducibility.test.ts` is NOT changed in this task — adding a `0`-default field keeps `serializeConfig` baseline byte-identical only if the field is present in both interface and default. Verify with the existing config/repro suite.

**Interfaces**

Consumes: nothing new.

Produces (EXACT names from the contract):
```ts
viewRange: number;     // default 0 — 0 ⇒ no cone query runs (sight OFF). World units; cost ceiling R = ceil(viewRange/cellSize) ≤ 3–4.
viewHalfAngle: number; // default 0 — cone half-angle in radians.
```

- [ ] **RED** — append a focused config test. Create `src/core/sim/config.sight.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { defaultConfig } from './config';

describe('config — sight knobs default OFF', () => {
  it('defaults viewRange and viewHalfAngle to 0', () => {
    const cfg = defaultConfig();
    expect(cfg.viewRange).toBe(0);
    expect(cfg.viewHalfAngle).toBe(0);
  });
  it('round-trips through overrides', () => {
    const cfg = defaultConfig({ viewRange: 48, viewHalfAngle: Math.PI / 4 });
    expect(cfg.viewRange).toBe(48);
    expect(cfg.viewHalfAngle).toBeCloseTo(Math.PI / 4, 10);
  });
});
```

- [ ] **run-fail** — `pnpm exec vitest run src/core/sim/config.sight.test.ts`. Expected: TS compile error `Property 'viewRange' does not exist on type 'Config'` (and `viewHalfAngle`).

- [ ] **GREEN (interface)** — in `src/core/sim/config.ts`, add to the `Config` interface immediately after the `predFleeWeight: number;` declaration (the line documented as "Herbivore flee strength…", ~line 122):
```ts
  // Sight (Phase 3 — senses). A SIGHT sensor cell runs a dedicated (2R+1)×(2R+1) cone query
  // (R = ceil(viewRange/cellSize)) and locks the nearest cell of its sightTarget class. 0 = OFF
  // (no query runs; byte-identical to pre-sight). Cost ceiling: keep R ≤ 3–4 (profiled in scaling-bench).
  /** Sight cone reach in world units. 0 = sight OFF (no cone query). */
  viewRange: number;
  /** Sight cone half-angle in radians. Only meaningful when viewRange > 0. */
  viewHalfAngle: number;
```

- [ ] **GREEN (default)** — in `defaultConfig`, add immediately after the `predFleeWeight: 0,` line (~line 373):
```ts
    viewRange: 0, // OFF by default (no cone query) — byte-identical to pre-sight; founder genomes opt in
    viewHalfAngle: 0,
```

- [ ] **run-pass** — `pnpm exec vitest run src/core/sim/config.sight.test.ts`. Expected: pass.

- [ ] **run baseline guard** — `pnpm exec vitest run src/core/sim/reproducibility.test.ts`. Expected: still green (adding `0`/`0` fields does not change any hot-path draw or the existing default scenario the test hashes; the repro test's senses-ON case is added in Phase 5).

- [ ] **commit** — `git add src/core/sim/config.ts src/core/sim/config.sight.test.ts && git commit -m "feat(sim): viewRange/viewHalfAngle sight knobs (OFF by default)"`

---

### Task 4 — Wire the SIGHT branch in `sense.ts` to call `sightVector`

**Files**
- Modify: `src/core/cells/sense.ts` — replace the Phase-2 SIGHT stub with the real `sightVector` call; the function already receives `net`, `hash`, `viewRange`, `viewHalfAngle`, `worldWidth`, `worldHeight` (Phase-2 signature).
- Modify (test): `src/core/cells/sense.test.ts` — add a SIGHT-routing case.
- Modify: `src/core/sim/world.ts` — the `sense(...)` call site already passes the Phase-2 args; **verify** it forwards `this.hash`, `cfg.viewRange`, `cfg.viewHalfAngle`, `cfg.worldWidth`, `cfg.worldHeight`. (If Phase 2 left `viewRange`/`viewHalfAngle` as literal `0` placeholders, replace them with the now-real `cfg.viewRange`/`cfg.viewHalfAngle`.)

**Interfaces**

Consumes (in `sense.ts`): `sightVector` (Task 1); `net.sensorSource: Uint8Array`, `net.sensorSightTarget: Uint8Array`, `net.sensorCell: Uint32Array`, `net.sensorCount: number` (Phase-2 contract); `SenseSource` from `sense-source.ts`.

Produces: per SIGHT sensor cell, `senseX/senseY` filled by `sightVector`; gated so when `viewRange === 0` the SIGHT branch writes the zero vector (or is skipped) — byte-identical to "no sight".

Routing model (matches Phase 2): `sense.ts` already loops the live set for SMELL and, for HEARING/SIGHT, must route **per sensor binding** because the modality lives on `net.sensorSource[k]` (parallel to `net.sensorCell[k]`), NOT on the cell type. A cell is a SIGHT sensor when some binding `k` has `net.sensorCell[k] === i && net.sensorSource[k] === SenseSource.SIGHT`. To stay allocation-free and canonical, iterate the **sensor bindings** for the sight pass:

```ts
// SIGHT pass (Phase 3): for each sensor binding whose source is SIGHT, run the cone query
// on its cell. Gated entirely on viewRange > 0 so default (sight OFF) is byte-identical.
if (viewRange > 0) {
  const sc = net.sensorCount;
  for (let k = 0; k < sc; k++) {
    if (net.sensorSource[k]! !== SenseSource.SIGHT) continue;
    const cell = net.sensorCell[k]!;
    sightVector(
      cell, f, hash, carnivore, net.sensorSightTarget[k]!,
      viewRange, viewHalfAngle, worldWidth, worldHeight,
    );
  }
}
```
Note both binding cells of a sight organ (`FWD_GRAD` + `LAT_GRAD`, sharing a cell? No — a sight ORGAN is a pair of distinct SENSOR cells, each its own binding) get their `senseX/senseY` written; if two bindings name the SAME cell with SIGHT they recompute the same vector (idempotent — last write wins, identical). `think.ts` then projects each cell's `senseX/senseY` per its own `sensorChannel`, unchanged.

**Ordering vs SMELL/HEARING:** the SMELL pass writes `senseX/senseY` for every MOTILE/SENSOR cell first (the existing loop). The SIGHT pass then OVERWRITES `senseX/senseY` for SIGHT-source sensor cells. This is correct: a SIGHT sensor's `senseX/senseY` must come from the cone, not the chemical gradient. Because a sensor cell's `senseSource` is single-valued, no cell is written by two modality passes with conflicting intent. (HEARING follows the same overwrite discipline — confirm the Phase-2 HEARING pass also routes by binding, so the three passes are mutually exclusive per cell.)

- [ ] **RED** — append to `src/core/cells/sense.test.ts`:
```ts
import { SpatialHash } from '../spatial/spatial-hash';
import { NeuralNetwork } from '../neural/network';
import { NoiseField } from '../environment/noise-field';
import { SenseSource, SightTarget } from './sense-source';

describe('sense — SIGHT routing (senseSource SIGHT → cone query overwrites the smell gradient)', () => {
  it('a SIGHT sensor’s senseX/senseY come from the nearest food in its cone, not the smell field', () => {
    const store = new CellStore(8, false);
    const f = store.fields;
    // Smell field rises in +y so, if the SIGHT cell wrongly read smell, senseY would be +.
    const food = new FoodField(8, 8, 800, 800);
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) food.field[r * 8 + c] = r;

    const eye = store.alloc(); // 0
    f.posX[eye] = 400; f.posY[eye] = 400; f.heading[eye] = 0; // looking +x
    f.cellType[eye] = CellType.SENSOR; f.organismId[eye] = 1;
    const target = store.alloc(); // 1 — edible 50 ahead in +x
    f.posX[target] = 450; f.posY[target] = 400;
    f.cellType[target] = CellType.PHOTO; f.organismId[target] = 0;

    const live = Uint32Array.from([eye, target]);
    const hash = new SpatialHash(800, 800, 16, store.capacity);
    hash.build(live, 2, f.posX, f.posY);

    const net = new NeuralNetwork(8, 16, 8);
    net.addSensor(eye, /*channel*/ 0 /*FWD_GRAD*/, SenseSource.SIGHT, SightTarget.FOOD);

    const noise = new NoiseField(8, 8, 800, 800);
    sense(
      live, 2, f,
      food, food, new Uint8Array(8), food, 0,
      net,
      noise, 0,
      hash, 100, Math.PI / 4, 800, 800,
    );

    // SIGHT: dist 50, viewRange 100 → proximity 0.5 toward +x. NOT the +y smell gradient.
    expect(f.senseX[eye]).toBeCloseTo(0.5, 5);
    expect(f.senseY[eye]).toBeCloseTo(0, 5);
  });

  it('is byte-identical to smell when viewRange is 0 (sight OFF): a SIGHT sensor falls back to nothing', () => {
    // With viewRange 0 the SIGHT pass is skipped; the SMELL pass still wrote the cell. A SIGHT sensor
    // is not a SMELL sensor, but the existing per-cell SMELL loop fills MOTILE/SENSOR cells regardless,
    // so senseX/senseY hold the smell gradient — exactly as before sight existed.
    const store = new CellStore(8, false);
    const f = store.fields;
    const food = new FoodField(8, 8, 800, 800);
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) food.field[r * 8 + c] = c; // +x ramp
    const eye = store.alloc();
    f.posX[eye] = 350; f.posY[eye] = 350; f.heading[eye] = 0;
    f.cellType[eye] = CellType.SENSOR; f.organismId[eye] = 1;
    const live = Uint32Array.from([eye]);
    const hash = new SpatialHash(800, 800, 16, store.capacity);
    hash.build(live, 1, f.posX, f.posY);
    const net = new NeuralNetwork(8, 16, 8);
    net.addSensor(eye, 0, SenseSource.SIGHT, SightTarget.FOOD);
    const noise = new NoiseField(8, 8, 800, 800);
    sense(live, 1, f, food, food, new Uint8Array(8), food, 0, net, noise, 0, hash, 0, 0, 800, 800);
    // viewRange 0 → no cone; cell keeps the smell gradient (+x = 2 over the 100-unit patch ramp).
    expect(f.senseX[eye]).toBeCloseTo(2, 5);
    expect(f.senseY[eye]).toBeCloseTo(0, 5);
  });
});
```

- [ ] **run-fail** — `pnpm exec vitest run src/core/cells/sense.test.ts -t "SIGHT routing"`. Expected: the first case fails — `senseX` is the smell value (`0`, since smell ramps in +y here) instead of `0.5`, because the SIGHT stub left over from Phase 2 writes the zero vector / smell value, not the cone result.

- [ ] **GREEN** — in `src/core/cells/sense.ts`:
  1. Add the import: `import { sightVector } from './sight';` and ensure `SenseSource` is imported from `./sense-source` (Phase 2 added it; if not, `import { SenseSource } from './sense-source';`).
  2. Replace the Phase-2 SIGHT stub with the real per-binding sight pass (place it AFTER the existing SMELL/HEARING loop body, before the function returns):
```ts
  // SIGHT pass: route per sensor binding (modality lives on net.sensorSource, not cellType).
  // Overwrites senseX/senseY for SIGHT sensors with the cone-query vector. Gated on viewRange>0
  // so the default (sight OFF) path is byte-identical to pre-sight.
  if (viewRange > 0) {
    const sc = net.sensorCount;
    for (let k = 0; k < sc; k++) {
      if (net.sensorSource[k]! !== SenseSource.SIGHT) continue;
      const cell = net.sensorCell[k]!;
      sightVector(
        cell,
        f,
        hash,
        carnivore,
        net.sensorSightTarget[k]!,
        viewRange,
        viewHalfAngle,
        worldWidth,
        worldHeight,
      );
    }
  }
```

- [ ] **run-pass** — `pnpm exec vitest run src/core/cells/sense.test.ts`. Expected: all cases (existing smell/diet/flee + new SIGHT) pass.

- [ ] **verify world.ts call site** — open `src/core/sim/world.ts` at the `sense(` call (~line 471). Confirm the Phase-3 args are forwarded as `this.hash, cfg.viewRange, cfg.viewHalfAngle, cfg.worldWidth, cfg.worldHeight`. If Phase 2 left `0, 0` literals for viewRange/viewHalfAngle, change them to `cfg.viewRange, cfg.viewHalfAngle`. Then run the full sim suite:
  `pnpm exec vitest run src/core/sim/world.test.ts src/core/sim/reproducibility.test.ts` — expected: green (default `viewRange` 0 → sight branch never runs → byte-identical).

- [ ] **commit** — `git add src/core/cells/sense.ts src/core/cells/sense.test.ts src/core/sim/world.ts && git commit -m "feat(sim): route SIGHT senseSource through sightVector cone query (OFF by default)"`

---

### Task 5 — Document the sight tie-break + reads/writes in `READS-WRITES.md`

**Files**
- Modify: `src/core/sim/READS-WRITES.md` — update the step-2b SENSE row and add a "SIGHT cone query" note section.

**Interfaces**

Consumes: nothing (documentation). Produces: the canonical-order + tie-break rule recorded so the golden/integration tests have an authority to assert against (the contract requires the tie-break be documented in `READS-WRITES.md`).

- [ ] **RED (doc-as-test is manual here)** — there is no unit test; the "failing" condition is that the SENSE row does not mention sight and there is no tie-break note. Verify the gap: `grep -n -i "sight\|cone\|viewRange" src/core/sim/READS-WRITES.md` returns no Phase-3 content.

- [ ] **GREEN** — edit the step-2b SENSE row to read (note the added inputs/outputs):
```
| 2b | **SENSE** | cellType, pos; **previous** tick's food field; (HEARING) noise field; (SIGHT) hash buckets + cellType + organismId + organisms.carnivore; net sensor bindings (sensorSource/sensorSightTarget) | senseX, senseY (**MOTILE and SENSOR**; SIGHT/HEARING sensors overwrite per their senseSource) |
```
Then add a note paragraph under the existing "SENSE/ACT/food coupling notes (M3)" section:
```
## SIGHT cone query (Phase 3 — senses)

- A SIGHT sensor (net.sensorSource[k] === SenseSource.SIGHT) runs `sightVector` over a
  (2R+1)×(2R+1) hash block, R = ceil(viewRange/cellSize) — NOT the shared 3×3 loop. It is
  gated on `viewRange > 0`; with the default 0 no query runs and the field reads/writes are
  byte-identical to pre-sight.
- **Classification is cardinal-safe:** reads ONLY `f.cellType[j]` + `organisms.carnivore[organismId[j]]`.
  FOOD = nearest PHOTO/MEAT (isEdibleBy); PREY = nearest isFlesh on a non-carnivore organism;
  PREDATOR = nearest isFlesh on a carnivore organism. The eye's own organism is excluded
  (`organismId[j] !== organismId[i]`), never a lineage/founder id.
- **Nearest + tie-break:** strict `<` on **squared toroidal distance** (`wrapDelta`). Equal-distance
  ties (which occur on a torus) keep the FIRST candidate in canonical scan order = ascending bucket
  index, then ascending `hash.sorted` slot within the bucket. The strict `<` is what makes the order
  deterministic — do not relax to `<=`.
- **Toroidal-seam guard:** the 3×3 alias guard does not generalize to the wider window; a bucket
  offset beyond the half-grid (|dxOff| > (cols-1)/2 or |dyOff| > (rows-1)/2) is skipped so no bucket
  is scanned twice. No-op for the documented R ≤ 3–4 over production-size worlds.
- **Output:** senseX/senseY = unitDirToTarget × proximity, proximity = clamp((viewRange−dist)/viewRange,
  0, 1); zero vector when the cone is empty (then THINK's FWD/LAT projection yields 0).
```

- [ ] **run-pass (verify)** — `grep -n -i "sight\|cone\|tie-break\|viewRange" src/core/sim/READS-WRITES.md` now returns the new content; run `pnpm exec vitest run src/core/sim/reproducibility.test.ts` to confirm nothing regressed (doc-only change).

- [ ] **commit** — `git add src/core/sim/READS-WRITES.md && git commit -m "docs(sim): document SIGHT cone query reads/writes + tie-break rule"`

---

### Task 6 (3b) — Rock occlusion: segment-vs-circle, OFF-able sub-task

**Files**
- Create: `src/core/cells/sight-occlusion.ts` — `isOccluded(...)` segment-from-eye-to-target vs rock-circle test over rocks in the corridor via the rock grid.
- Create (test): `src/core/cells/sight-occlusion.test.ts`
- Modify: `src/core/cells/sight.ts` — `sightVector` gains an optional `rocks?: RockField` param; when present and `rocks.rockCount > 0`, a candidate that is occluded is skipped.
- Modify: `src/core/cells/sense.ts` — forward `rocks` to `sightVector`.
- Modify: `src/core/sim/world.ts` — pass `this.rocks` into `sense`.

**Interfaces**

Consumes:
- `RockField` (`src/core/environment/rock-field.ts`) — `readonly cx/cy/radius: Float32Array`, `rockCount`, `readonly bucketStart: Uint32Array`, `readonly sorted: Uint32Array`, `colOf(x)`, `rowOf(y)`, `gridCols`, `gridRows`, `width`, `height`.
- `wrapDelta` from `vec2.ts`.

Produces:
```ts
// src/core/cells/sight-occlusion.ts
export function isOccluded(
  eyeX: number, eyeY: number,
  dx: number, dy: number,        // toroidal delta eye→target (already wrapDelta'd)
  rocks: RockField,
  worldWidth: number, worldHeight: number,
): boolean;
```
Geometry: the sight segment is `P(s) = (eyeX,eyeY) + s·(dx,dy)`, `s ∈ [0,1]`. A rock at `(cx,cy)` radius `rr` occludes iff the closest point on the segment to the rock center is within `rr`. Toroidal: take `rcx = wrapDelta(cx - eyeX, W)`, `rcy = wrapDelta(cy - eyeY, H)` (rock center relative to eye in the eye's local frame, same frame as `(dx,dy)`). Then `s = clamp((rcx·dx + rcy·dy)/(dx·dx+dy·dy), 0, 1)`; closest point `(s·dx, s·dy)`; gap² = `(rcx - s·dx)² + (rcy - s·dy)²`; occluded iff `gap² < rr·rr`. Scan only rocks in the corridor: iterate the rock-grid buckets spanning the segment's bounding box (use `rocks.colOf/rowOf` on the eye and target world positions and the bucket range between them; a simple correct version scans the 3×3 (or wider) block around BOTH endpoints — but to stay allocation-free and canonical, iterate the grid buckets covering the bbox `[min,max]` of eye and `eye+delta` with the same `% gridCols/% gridRows` wrap + half-grid seam guard as `sightVector`). For the first occlusion build, scanning the bbox bucket span is sufficient; the rock grid keeps it O(rocks-in-corridor).

Gating: occlusion is OFF when `rocks` is undefined OR `rocks.rockCount === 0` (the default config has `rockCount: 0`). So byte-identical to Task-1 sight whenever rocks are absent.

- [ ] **RED** — create `src/core/cells/sight-occlusion.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { RockField } from '../environment/rock-field';
import { isOccluded } from './sight-occlusion';

function rocksWith(centers: Array<[number, number, number]>, w = 800, h = 800): RockField {
  const rf = new RockField(8, Math.max(3, Math.round(w / 64)), Math.max(3, Math.round(h / 64)), w, h);
  for (let i = 0; i < centers.length; i++) {
    rf.cx[i] = centers[i]![0];
    rf.cy[i] = centers[i]![1];
    rf.radius[i] = centers[i]![2];
  }
  rf.rockCount = centers.length;
  rf.buildGrid();
  return rf;
}

describe('isOccluded — segment vs rock circle', () => {
  it('reports occluded when a rock sits on the sight line', () => {
    // eye at (400,400) looking +x toward a target 100 ahead; rock at (450,400) r=10 blocks it.
    const rocks = rocksWith([[450, 400, 10]]);
    expect(isOccluded(400, 400, 100, 0, rocks, 800, 800)).toBe(true);
  });

  it('reports clear when the rock is off to the side beyond its radius', () => {
    const rocks = rocksWith([[450, 430, 10]]); // 30 units off the line, r=10 → no block
    expect(isOccluded(400, 400, 100, 0, rocks, 800, 800)).toBe(false);
  });

  it('reports clear when the rock is behind the eye (s < 0)', () => {
    const rocks = rocksWith([[350, 400, 10]]); // behind the eye on the −x side
    expect(isOccluded(400, 400, 100, 0, rocks, 800, 800)).toBe(false);
  });

  it('reports clear when the rock is past the target (s > 1)', () => {
    const rocks = rocksWith([[520, 400, 10]]); // beyond the 100-unit target
    expect(isOccluded(400, 400, 100, 0, rocks, 800, 800)).toBe(false);
  });
});
```

- [ ] **run-fail** — `pnpm exec vitest run src/core/cells/sight-occlusion.test.ts`. Expected: `No "isOccluded" export` / module not found.

- [ ] **GREEN** — create `src/core/cells/sight-occlusion.ts`:
```ts
import { type RockField } from '../environment/rock-field';
import { wrapDelta } from '../math/vec2';

/**
 * True if any rock occludes the sight segment from the eye to a target at toroidal delta (dx,dy).
 * Closest-point-on-segment-to-rock-center test: a rock of radius rr occludes iff the segment passes
 * within rr of its center. Toroidal; allocation-free; scans rocks in the corridor via the rock grid
 * (canonical bucket order with the same half-grid seam guard as the sight cone). OFF when rockCount 0.
 */
export function isOccluded(
  eyeX: number,
  eyeY: number,
  dx: number,
  dy: number,
  rocks: RockField,
  worldWidth: number,
  worldHeight: number,
): boolean {
  const seg2 = dx * dx + dy * dy;
  if (seg2 === 0) return false;

  // Corridor bbox in world coords: eye and eye+delta (delta is in the eye's local frame; recover the
  // target's wrapped world position for grid lookup).
  const tgtX = ((eyeX + dx) % worldWidth + worldWidth) % worldWidth;
  const tgtY = ((eyeY + dy) % worldHeight + worldHeight) % worldHeight;

  const cols = rocks.gridCols;
  const rows = rocks.gridRows;
  const halfCols = (cols - 1) / 2;
  const halfRows = (rows - 1) / 2;

  const ce = rocks.colOf(eyeX);
  const re = rocks.rowOf(eyeY);
  const ct = rocks.colOf(tgtX);
  const rt = rocks.rowOf(tgtY);

  // Bucket offset span covering both endpoints (+1 ring for rocks straddling a boundary). Use the
  // signed wrapped difference so a seam-crossing corridor still spans the right buckets.
  const colSpan = Math.abs(wrapDelta((ct - ce) * (worldWidth / cols), worldWidth)) / (worldWidth / cols);
  const rowSpan = Math.abs(wrapDelta((rt - re) * (worldHeight / rows), worldHeight)) / (worldHeight / rows);
  const Rc = Math.ceil(colSpan) + 1;
  const Rr = Math.ceil(rowSpan) + 1;

  for (let dyOff = -Rr; dyOff <= Rr; dyOff++) {
    if (dyOff > halfRows || dyOff < -halfRows) continue;
    const by = ((re + dyOff) % rows + rows) % rows;
    for (let dxOff = -Rc; dxOff <= Rc; dxOff++) {
      if (dxOff > halfCols || dxOff < -halfCols) continue;
      const bx = ((ce + dxOff) % cols + cols) % cols;
      const b = by * cols + bx;
      const end = rocks.bucketStart[b + 1]!;
      for (let idx = rocks.bucketStart[b]!; idx < end; idx++) {
        const rk = rocks.sorted[idx]!;
        const rcx = wrapDelta(rocks.cx[rk]! - eyeX, worldWidth);
        const rcy = wrapDelta(rocks.cy[rk]! - eyeY, worldHeight);
        let s = (rcx * dx + rcy * dy) / seg2;
        if (s < 0) s = 0;
        else if (s > 1) s = 1;
        const px = s * dx;
        const py = s * dy;
        const gx = rcx - px;
        const gy = rcy - py;
        const rr = rocks.radius[rk]!;
        if (gx * gx + gy * gy < rr * rr) return true;
      }
    }
  }
  return false;
}
```

- [ ] **run-pass** — `pnpm exec vitest run src/core/cells/sight-occlusion.test.ts`. Expected: all four cases pass.

- [ ] **commit** — `git add src/core/cells/sight-occlusion.ts src/core/cells/sight-occlusion.test.ts && git commit -m "feat(sim): rock occlusion segment-vs-circle test (sight 3b, OFF when no rocks)"`

---

### Task 7 (3b) — Wire occlusion into `sightVector` (skip occluded candidates)

**Files**
- Modify: `src/core/cells/sight.ts` — add optional `rocks?: RockField` param; skip a matched candidate when `rocks && rocks.rockCount > 0 && isOccluded(...)`.
- Modify (test): `src/core/cells/sight.test.ts` — add an occlusion case.
- Modify: `src/core/cells/sense.ts` — add `rocks: RockField` to the `sense` parameter list (appended) and forward it to `sightVector`.
- Modify: `src/core/sim/world.ts` — pass `this.rocks` to `sense`.

**Interfaces**

Consumes: `isOccluded` (Task 6), `RockField`.

Produces: `sightVector` with an appended optional `rocks?: RockField` parameter (keeps Task-1 callers compiling). When occlusion is active, the **nearest UN-occluded** matching candidate wins — i.e. an occluded candidate is `continue`d before the `d2 < bestD2` test, so a farther visible target can win. This preserves the strict-`<` tie-break over the visible set.

- [ ] **RED** — append to `src/core/cells/sight.test.ts`:
```ts
import { RockField } from '../environment/rock-field';

describe('sightVector — rock occlusion (3b)', () => {
  it('skips a target hidden behind a rock and locks a farther visible one', () => {
    const store = new CellStore(8, false);
    const f = store.fields;
    const eye = store.alloc(); // 0
    f.posX[eye] = 400; f.posY[eye] = 400; f.heading[eye] = 0; // +x
    f.cellType[eye] = CellType.SENSOR; f.organismId[eye] = 1;
    const hidden = store.alloc(); // 1 — nearer (40 ahead) but behind a rock
    f.posX[hidden] = 440; f.posY[hidden] = 400;
    f.cellType[hidden] = CellType.PHOTO; f.organismId[hidden] = 0;
    const visible = store.alloc(); // 2 — farther (60 ahead) in +y-shifted clear lane
    f.posX[visible] = 400; f.posY[visible] = 460;
    f.cellType[visible] = CellType.PHOTO; f.organismId[visible] = 0;

    const hash = new SpatialHash(800, 800, 16, store.capacity);
    hash.build(Uint32Array.from([eye, hidden, visible]), 3, f.posX, f.posY);

    const rocks = new RockField(8, Math.round(800 / 64), Math.round(800 / 64), 800, 800);
    rocks.cx[0] = 420; rocks.cy[0] = 400; rocks.radius[0] = 8; // sits on the eye→hidden line
    rocks.rockCount = 1; rocks.buildGrid();

    // wide cone so both candidates are in-angle; heading +x but π/2 half-angle includes +y.
    sightVector(eye, f, hash, new Uint8Array(8), SightTarget.FOOD, 100, Math.PI / 2, 800, 800, rocks);
    // hidden (dist 40) is occluded → visible (dist 60, +y) wins: proximity 0.4, dir +y.
    expect(f.senseX[eye]).toBeCloseTo(0, 5);
    expect(f.senseY[eye]).toBeCloseTo(0.4, 5);
  });

  it('with no rocks (rockCount 0) is identical to the no-occlusion result', () => {
    const store = new CellStore(8, false);
    const f = store.fields;
    const eye = store.alloc();
    f.posX[eye] = 400; f.posY[eye] = 400; f.heading[eye] = 0;
    f.cellType[eye] = CellType.SENSOR; f.organismId[eye] = 1;
    const near = store.alloc();
    f.posX[near] = 440; f.posY[near] = 400;
    f.cellType[near] = CellType.PHOTO; f.organismId[near] = 0;
    const hash = new SpatialHash(800, 800, 16, store.capacity);
    hash.build(Uint32Array.from([eye, near]), 2, f.posX, f.posY);
    const rocks = new RockField(8, Math.round(800 / 64), Math.round(800 / 64), 800, 800);
    rocks.rockCount = 0; rocks.buildGrid();
    sightVector(eye, f, hash, new Uint8Array(8), SightTarget.FOOD, 100, Math.PI / 2, 800, 800, rocks);
    expect(f.senseX[eye]).toBeCloseTo(0.6, 5); // dist 40 → proximity 0.6, +x
    expect(f.senseY[eye]).toBeCloseTo(0, 5);
  });
});
```

- [ ] **run-fail** — `pnpm exec vitest run src/core/cells/sight.test.ts -t "rock occlusion"`. Expected: the first case fails — without occlusion wiring, `sightVector` ignores the extra `rocks` arg, locks the nearer `hidden` (`senseX≈0.6, senseY≈0`) instead of the visible `(0, 0.4)`. (TS may also error that `sightVector` takes 9 args, not 10, until the param is added.)

- [ ] **GREEN** — in `src/core/cells/sight.ts`:
  1. Add import: `import { type RockField } from '../environment/rock-field';` and `import { isOccluded } from './sight-occlusion';`.
  2. Append the param to the signature: `worldHeight: number, rocks?: RockField,`.
  3. Add occlusion gate inside the candidate loop, right AFTER the cone-angle accept (`if (dot < dist * cosHalf) continue;`) and BEFORE the `if (d2 < bestD2)` test:
```ts
        if (rocks !== undefined && rocks.rockCount > 0 &&
            isOccluded(xi, yi, dx, dy, rocks, worldWidth, worldHeight)) {
          continue;
        }
```
  4. Update the doc-comment's window note to mention occlusion is applied per-candidate and OFF when `rocks` is absent / `rockCount === 0`.

- [ ] **GREEN (sense.ts)** — append `rocks: RockField` to the `sense` parameter list and forward it: `import { type RockField } from '../environment/rock-field';`; in the SIGHT pass change the call to `sightVector(cell, f, hash, carnivore, net.sensorSightTarget[k]!, viewRange, viewHalfAngle, worldWidth, worldHeight, rocks);`.

- [ ] **GREEN (world.ts)** — at the `sense(...)` call (~line 471) append `this.rocks` as the final argument.

- [ ] **run-pass** — `pnpm exec vitest run src/core/cells/sight.test.ts src/core/cells/sight-occlusion.test.ts src/core/cells/sense.test.ts`. Expected: all pass.

- [ ] **run baseline guard** — `pnpm exec vitest run src/core/sim/reproducibility.test.ts src/core/sim/world.test.ts`. Expected: green — default config has `rockCount: 0` and `viewRange: 0`, so occlusion + sight never execute and the sim is byte-identical.

- [ ] **commit** — `git add src/core/cells/sight.ts src/core/cells/sight.test.ts src/core/cells/sense.ts src/core/sim/world.ts && git commit -m "feat(sim): wire rock occlusion into SIGHT cone (skip occluded targets, OFF when no rocks)"`

---

### Task 8 — Profile the cone cost ceiling in the scaling bench + full gate

**Files**
- Modify: the existing scaling bench harness (locate with `ls src/scaling-bench* src/probes/*bench* 2>/dev/null; grep -rl "predReach\|scaling" src --include=*.ts | head`). Add a sight-ON config variant (`viewRange` at `R=3` and `R=4`, i.e. `viewRange ≈ 48` and `≈ 64` at `cellSize = 2·cellRadius = 12`) and record per-tick cost vs. sight-OFF, per the `predReach` discipline.

**Interfaces**

Consumes: `World`, `defaultConfig({ viewRange, viewHalfAngle, ... + founder sight genomes once Phase 4 lands })`. For Phase 3 the bench can force sight sensors via a hand-built genome or by toggling `viewRange` with the Phase-4 founders deferred — at minimum record the cost of the `sightVector` scan over a populated world.

Produces: a recorded `R ≤ 3–4` cost ceiling number (the gate the spec requires before raising `viewRange` in later phases).

- [ ] **locate** — `ls src/scaling-bench* 2>/dev/null; grep -rln "scaling\|bench" src --include=*.ts`. Read the bench entrypoint to learn its config-variant pattern.

- [ ] **add variant** — add a `sight-R3` and `sight-R4` row that constructs a `World` with `defaultConfig({ viewRange: 48 /* R=3 @ cellSize 12 */, viewHalfAngle: Math.PI / 4 })` (and `viewRange: 64` for R=4), runs N ticks over a seeded population, and prints ms/tick beside the baseline.

- [ ] **run** — execute the bench per its documented command (e.g. `pnpm exec tsx src/scaling-bench.ts` or the Makefile target — confirm via `grep -n bench Makefile`). Record the R=3 / R=4 ms/tick delta in the commit message; confirm R≤4 stays within the per-tick budget (the spec's documented ceiling).

- [ ] **full check** — `make check`. Expected: green (lint + types + full vitest).

- [ ] **commit** — `git add -A && git commit -m "bench(sim): profile SIGHT cone cost ceiling at R=3/R=4 (predReach discipline)"`

---

**Phase 3 exit criteria (all must hold before Phase 4):**
- `sightVector` unit tests pass: nearest-in-cone, FOOD/PREY/PREDATOR routing, own-organism exclusion, viewRange clamp, zero-vector-when-empty, tie-break, `(2R+1)` seam guard, occlusion skip.
- `sense.ts` SIGHT branch routes per `net.sensorSource`; `make check` green.
- Default config (`viewRange: 0`, `rockCount: 0`) ⇒ `reproducibility.test.ts` byte-identical (sight + occlusion never execute).
- `READS-WRITES.md` documents the cone query, classification, tie-break, and seam guard.
- Scaling bench records the R≤3–4 cost ceiling.

---

## Phase 4 — Smart founder brains + movement tuning

**Pre-reqs (already landed in Phases 2 & 3, relied on here):** `src/core/cells/sense-source.ts` exports `SenseSource = { SMELL: 0, SIGHT: 1, HEARING: 2 }` and `SightTarget = { FOOD: 0, PREY: 1, PREDATOR: 2 }`; the `Gene` interface (`src/core/genome/genome.ts`) carries `senseSource: number` (default `SenseSource.SMELL`) and `sightTarget: number` (default `SightTarget.FOOD`); `cloneGenome` copies both; `DevelopedBody` (`src/core/genome/develop.ts`) emits parallel `senseSource[]`/`sightTarget[]`; `NeuralNetwork.addSensor(cell, channel, source, sightTarget)` stores them; `Config` carries `viewRange`/`viewHalfAngle`/`loudnessGain` (all default 0 = OFF) and `sense.ts`/`world.ts` route SMELL/HEARING/SIGHT per `senseSource`.

**What this phase delivers:** founder forager/predator genomes that GROW sense organs (set `senseSource`/`sightTarget` on their SENSOR genes) and WIRE them — predator: a PREY-eye pair steers pursuit + a HEARING pair homes in; prey: a FOOD-smell pair + a FOOD-eye pair approach, a PREDATOR-eye pair + HEARING pair flee. These are mutable founder genomes selected economically — NO core kernel reads a role label (the carnivore branch is still inferred from `organisms.carnivore`, set structurally by the PREDATOR mouth cell). Movement knobs (`maxThrust`/`turnScale`/`thrustScale`/`thrustBias`) are re-tuned as NUMBER changes for decisive steering — derived headlessly, and ONLY applied to non-default probe/demo configs so `defaultConfig` stays byte-identical (guarded by `reproducibility.test.ts`). Golden behavior tests (runnable only now that senses + brains exist): a sighted predator catches a fleeing prey; a sight forager finds food faster than a smell-only forager.

**TDD discipline for every task:** RED (write a failing test with real code) → run-fail (`pnpm exec vitest run <path>`, confirm the expected failure) → GREEN (minimal real impl) → run-pass → `make check` → commit. OFF-by-default + byte-identical determinism + zero-alloc hot loop + the CARDINAL RULE (no fitness/score/lineage/role-label read in `src/core/**`) hold at every step.

---

### Task 1 — `buildSightedForagerGenome`: a forager that grows a FOOD-eye pair + keeps smell

A K-selected forager that develops the 6-cell forager body PLUS a SIGHT eye organ (a FWD/LAT pair with `senseSource: SIGHT, sightTarget: FOOD`) wired into the same steering loop as smell, so it can both smell long-range trails AND see nearby plants. DRY over `buildForagerGenome`.

**Files**
- Modify: `src/core/genome/critter-genome.ts` (add `buildSightedForagerGenome` after `buildForagerGenome`, ~line 218)
- Test: `src/core/genome/critter-genome.test.ts` (add a `describe` block; modify, ~after line 188)

**Interfaces**
- Consumes: `buildForagerGenome(cellRadius = 6, initialEnergy = 100): Genome` (critter-genome.ts:153), `Gene` (genome.ts:15, now carrying `senseSource`/`sightTarget`), `SenseSource`/`SightTarget` (`src/core/cells/sense-source.ts`), `SensorChannel` (`src/core/neural/network.ts`), `CellType` (`src/core/cells/types.ts`), `develop(genome, maxCells, maxRecursionDepth): DevelopedBody` (`src/core/genome/develop.ts`).
- Produces: `export function buildSightedForagerGenome(cellRadius = 6, initialEnergy = 100): Genome`

**Steps**
- [ ] RED — add to `src/core/genome/critter-genome.test.ts` (import `buildSightedForagerGenome` in the top `from './critter-genome'` import list, and add `SenseSource, SightTarget` via `import { SenseSource, SightTarget } from '../cells/sense-source';`):
  ```ts
  describe('buildSightedForagerGenome — forager with a FOOD-eye pair + smell', () => {
    const g = buildSightedForagerGenome(6, 100);
    const body = develop(g, 256, 16);

    it('has 8 genes: 6-cell forager + a FWD/LAT eye pair', () => {
      expect(g.genes.length).toBe(8);
    });

    it('keeps the smell SENSOR pair as senseSource SMELL', () => {
      // genes 1,2 are the original forager smell sensors
      expect(g.genes[1]!.senseSource).toBe(SenseSource.SMELL);
      expect(g.genes[1]!.sensorChannel).toBe(SensorChannel.FWD_GRAD);
      expect(g.genes[2]!.senseSource).toBe(SenseSource.SMELL);
      expect(g.genes[2]!.sensorChannel).toBe(SensorChannel.LAT_GRAD);
    });

    it('adds an eye pair: senseSource SIGHT, sightTarget FOOD, on a FWD + a LAT channel', () => {
      const eyeFwd = g.genes[6]!;
      const eyeLat = g.genes[7]!;
      expect(eyeFwd.cellType).toBe(CellType.SENSOR);
      expect(eyeFwd.senseSource).toBe(SenseSource.SIGHT);
      expect(eyeFwd.sightTarget).toBe(SightTarget.FOOD);
      expect(eyeFwd.sensorChannel).toBe(SensorChannel.FWD_GRAD);
      expect(eyeLat.senseSource).toBe(SenseSource.SIGHT);
      expect(eyeLat.sightTarget).toBe(SightTarget.FOOD);
      expect(eyeLat.sensorChannel).toBe(SensorChannel.LAT_GRAD);
    });

    it('wires the eye pair into the steering loop (FWD-eye→thrust, LAT-eye→turn)', () => {
      const conn = (pre: number, post: number) =>
        g.connectionRules.find((c) => c.preGene === pre && c.postGene === post)!;
      expect(conn(6, 4).weight).toBeCloseTo(1.5, 6); // FWD-eye → thrust (advance toward seen food)
      expect(conn(7, 3).weight).toBeCloseTo(1.5, 6); // LAT-eye → turn (steer toward seen food)
      // the original smell loop is untouched
      expect(conn(1, 4).weight).toBeCloseTo(1.5, 6);
      expect(conn(2, 3).weight).toBeCloseTo(1.5, 6);
    });

    it('develops an 8-cell body with no truncation and positive energy', () => {
      expect(body.count).toBe(8);
      expect(body.truncated).toBe(false);
      expect(body.totalEnergy).toBeGreaterThan(0);
      expect(body.senseSource[6]).toBe(SenseSource.SIGHT);
      expect(body.sightTarget[6]).toBe(SightTarget.FOOD);
    });

    it('instantiates into a small World without error', () => {
      const w = new World(defaultConfig({ maxCells: 2000 }), false);
      const org = w.spawnOrganism(g, 500, 500, 0);
      expect(org).toBeGreaterThanOrEqual(0);
    });
  });
  ```
- [ ] run-fail — `pnpm exec vitest run src/core/genome/critter-genome.test.ts` — expect `TypeError: buildSightedForagerGenome is not a function` (import is undefined).
- [ ] GREEN — add to `src/core/genome/critter-genome.ts` after `buildForagerGenome` (it returns at line 218). Note: `buildForagerGenome`'s `g(...)` factory must already set `senseSource: SenseSource.SMELL, sightTarget: SightTarget.FOOD` (done in Phase 2); add `import { SenseSource, SightTarget } from '../cells/sense-source';` at the top alongside the existing `import { SensorChannel } from '../neural/network';`:
  ```ts
  /**
   * A forager that grows BOTH senses for food: the standard 6-cell forager (smell FWD/LAT pair
   * wired to thrust/turn) PLUS a SIGHT eye organ — a (SIGHT, FWD_GRAD) + (SIGHT, LAT_GRAD) pair
   * with sightTarget FOOD — wired into the SAME steering loop (FWD-eye→thrust, LAT-eye→turn). It
   * smells long-range trails and sees nearby plants; when sight is OFF (viewRange 0) the eye pair
   * reads a zero vector and the forager degenerates to a smell forager. Mutable founder genome,
   * economically selected — no kernel reads a role label. DRY over buildForagerGenome.
   * 8 cells: MOVER(0) + smell FWD(1)/LAT(2) + turn(3)/thrust(4) neurons + DIGESTIVE mouth(5)
   * + eye FWD(6)/eye LAT(7).
   */
  export function buildSightedForagerGenome(cellRadius = 6, initialEnergy = 100): Genome {
    const g = buildForagerGenome(cellRadius, initialEnergy);
    const r = cellRadius;
    const off = 3 * r;
    const lat = off * 0.6;
    // gene 6: FWD-channel eye, sightTarget FOOD. Placed forward beside the smell sensors.
    g.genes.push({
      innovation: 0,
      cellType: CellType.SENSOR,
      radius: r,
      mass: 2,
      initialEnergy,
      bias: 0,
      sensorChannel: SensorChannel.FWD_GRAD,
      glowGain: 0,
      senseSource: SenseSource.SIGHT,
      sightTarget: SightTarget.FOOD,
    });
    // gene 7: LAT-channel eye, sightTarget FOOD.
    g.genes.push({
      innovation: 0,
      cellType: CellType.SENSOR,
      radius: r,
      mass: 2,
      initialEnergy,
      bias: 0,
      sensorChannel: SensorChannel.LAT_GRAD,
      glowGain: 0,
      senseSource: SenseSource.SIGHT,
      sightTarget: SightTarget.FOOD,
    });
    g.divisionRules.push({
      parentGene: 0,
      childGene: 6,
      angle: Math.atan2(-lat * 0.5, off),
      dist: Math.hypot(off, lat * 0.5),
      stiffness: 1,
      repeat: 1,
    });
    g.divisionRules.push({
      parentGene: 0,
      childGene: 7,
      angle: Math.atan2(lat * 0.5, off),
      dist: Math.hypot(off, lat * 0.5),
      stiffness: 1,
      repeat: 1,
    });
    g.bondRules.push({ geneA: 1, geneB: 6, stiffness: 1 }); // brace eye to smell FWD
    g.bondRules.push({ geneA: 2, geneB: 7, stiffness: 1 }); // brace eye to smell LAT
    g.connectionRules.push({ preGene: 6, postGene: 4, weight: 1.5 }); // FWD-eye → thrust
    g.connectionRules.push({ preGene: 7, postGene: 3, weight: 1.5 }); // LAT-eye → turn
    return g;
  }
  ```
- [ ] run-pass — `pnpm exec vitest run src/core/genome/critter-genome.test.ts` — all green.
- [ ] `make check`
- [ ] commit — `git add -A && git commit -m "feat(genome): buildSightedForagerGenome — FOOD-eye pair wired into the steering loop"`

---

### Task 2 — `buildHearingPredatorGenome`: predator with a PREY-eye pair + a HEARING pair

A predator that develops the carnivore-mouth forager body PLUS a SIGHT eye pair (`sightTarget: PREY`) steering pursuit AND a HEARING pair homing in on motion. Unlike the existing ambush `buildPredatorGenome` (which brakes on prey-scent), this hunter actively PURSUES what it sees/hears. DRY over `buildPredatorGenome` (which already flips the mouth to `CellType.PREDATOR` and inverts the smell `fwdThrust`).

**Files**
- Modify: `src/core/genome/critter-genome.ts` (add after `buildPredatorGenome`, ~line 245)
- Test: `src/core/genome/critter-genome.test.ts` (add a `describe` block)

**Interfaces**
- Consumes: `buildPredatorGenome(cellRadius = 6, initialEnergy = 100, fwdThrustWeight = -1.5): Genome` (critter-genome.ts:235), `SenseSource`/`SightTarget`, `SensorChannel`, `CellType`.
- Produces: `export function buildHearingPredatorGenome(cellRadius = 6, initialEnergy = 100): Genome`

**Steps**
- [ ] RED — add to `src/core/genome/critter-genome.test.ts` (import `buildHearingPredatorGenome` in the `from './critter-genome'` list):
  ```ts
  describe('buildHearingPredatorGenome — sight+hearing pursuit predator', () => {
    const g = buildHearingPredatorGenome(6, 100);
    const body = develop(g, 256, 16);

    it('keeps the carnivore mouth (gene 5 = PREDATOR)', () => {
      expect(g.genes[5]!.cellType).toBe(CellType.PREDATOR);
    });

    it('has 10 genes: 6-cell predator + a PREY-eye pair + a HEARING pair', () => {
      expect(g.genes.length).toBe(10);
    });

    it('grows a PREY-eye pair: senseSource SIGHT, sightTarget PREY, FWD + LAT', () => {
      expect(g.genes[6]!.senseSource).toBe(SenseSource.SIGHT);
      expect(g.genes[6]!.sightTarget).toBe(SightTarget.PREY);
      expect(g.genes[6]!.sensorChannel).toBe(SensorChannel.FWD_GRAD);
      expect(g.genes[7]!.senseSource).toBe(SenseSource.SIGHT);
      expect(g.genes[7]!.sightTarget).toBe(SightTarget.PREY);
      expect(g.genes[7]!.sensorChannel).toBe(SensorChannel.LAT_GRAD);
    });

    it('grows a HEARING pair: senseSource HEARING, FWD + LAT', () => {
      expect(g.genes[8]!.senseSource).toBe(SenseSource.HEARING);
      expect(g.genes[8]!.sensorChannel).toBe(SensorChannel.FWD_GRAD);
      expect(g.genes[9]!.senseSource).toBe(SenseSource.HEARING);
      expect(g.genes[9]!.sensorChannel).toBe(SensorChannel.LAT_GRAD);
    });

    it('wires sight/hearing into PURSUIT (FWD→thrust positive, LAT→turn positive)', () => {
      const conn = (pre: number, post: number) =>
        g.connectionRules.find((c) => c.preGene === pre && c.postGene === post)!;
      expect(conn(6, 4).weight).toBeGreaterThan(0); // PREY-eye FWD → thrust (charge seen prey)
      expect(conn(7, 3).weight).toBeGreaterThan(0); // PREY-eye LAT → turn (orient on prey)
      expect(conn(8, 4).weight).toBeGreaterThan(0); // hearing FWD → thrust (home in on motion)
      expect(conn(9, 3).weight).toBeGreaterThan(0); // hearing LAT → turn
    });

    it('develops a 10-cell carnivore body with no truncation', () => {
      expect(body.count).toBe(10);
      expect(body.truncated).toBe(false);
      expect(body.cellType[5]).toBe(CellType.PREDATOR);
    });

    it('instantiates into a small World and flags the organism carnivore', () => {
      const w = new World(defaultConfig({ maxCells: 2000, preyDeposit: 1 }), false);
      const org = w.spawnOrganism(g, 500, 500, 0);
      expect(org).toBeGreaterThanOrEqual(0);
      expect(w.organisms.carnivore[org]).toBe(1);
    });
  });
  ```
- [ ] run-fail — `pnpm exec vitest run src/core/genome/critter-genome.test.ts` — expect `TypeError: buildHearingPredatorGenome is not a function`.
- [ ] GREEN — add to `src/core/genome/critter-genome.ts` after `buildPredatorGenome` (returns line 245):
  ```ts
  /**
   * A PURSUIT predator: the carnivore-mouth forager body (buildPredatorGenome) PLUS two new sense
   * organs that drive an active hunt — a SIGHT eye pair (sightTarget PREY) and a HEARING pair. Both
   * wire FWD→thrust (+) and LAT→turn (+) so the predator CHARGES and ORIENTS on prey it sees/hears.
   * (The inherited ambush smell wiring — fwd-smell→thrust negative — still brakes it in dense
   * prey-scent; sight/hearing add the closing burst.) Mutable founder genome under the same economic
   * selection; the carnivore flag is set STRUCTURALLY by the PREDATOR mouth, never by a role label.
   * 10 cells: predator body(0..5) + PREY-eye FWD(6)/LAT(7) + hearing FWD(8)/LAT(9).
   */
  export function buildHearingPredatorGenome(cellRadius = 6, initialEnergy = 100): Genome {
    const g = buildPredatorGenome(cellRadius, initialEnergy);
    const r = cellRadius;
    const off = 3 * r;
    const lat = off * 0.6;
    const mkSensor = (channel: number, source: number, target: number): Gene => ({
      innovation: 0,
      cellType: CellType.SENSOR,
      radius: r,
      mass: 2,
      initialEnergy,
      bias: 0,
      sensorChannel: channel,
      glowGain: 0,
      senseSource: source,
      sightTarget: target,
    });
    g.genes.push(mkSensor(SensorChannel.FWD_GRAD, SenseSource.SIGHT, SightTarget.PREY)); // 6
    g.genes.push(mkSensor(SensorChannel.LAT_GRAD, SenseSource.SIGHT, SightTarget.PREY)); // 7
    g.genes.push(mkSensor(SensorChannel.FWD_GRAD, SenseSource.HEARING, SightTarget.FOOD)); // 8
    g.genes.push(mkSensor(SensorChannel.LAT_GRAD, SenseSource.HEARING, SightTarget.FOOD)); // 9
    g.divisionRules.push({ parentGene: 0, childGene: 6, angle: Math.atan2(-lat * 0.5, off), dist: Math.hypot(off, lat * 0.5), stiffness: 1, repeat: 1 });
    g.divisionRules.push({ parentGene: 0, childGene: 7, angle: Math.atan2(lat * 0.5, off), dist: Math.hypot(off, lat * 0.5), stiffness: 1, repeat: 1 });
    g.divisionRules.push({ parentGene: 0, childGene: 8, angle: Math.atan2(-lat, -off), dist: Math.hypot(off, lat), stiffness: 1, repeat: 1 });
    g.divisionRules.push({ parentGene: 0, childGene: 9, angle: Math.atan2(lat, -off), dist: Math.hypot(off, lat), stiffness: 1, repeat: 1 });
    g.bondRules.push({ geneA: 1, geneB: 6, stiffness: 1 });
    g.bondRules.push({ geneA: 2, geneB: 7, stiffness: 1 });
    g.bondRules.push({ geneA: 3, geneB: 8, stiffness: 1 });
    g.bondRules.push({ geneA: 4, geneB: 9, stiffness: 1 });
    g.connectionRules.push({ preGene: 6, postGene: 4, weight: 1.5 }); // PREY-eye FWD → thrust
    g.connectionRules.push({ preGene: 7, postGene: 3, weight: 1.5 }); // PREY-eye LAT → turn
    g.connectionRules.push({ preGene: 8, postGene: 4, weight: 1.0 }); // hearing FWD → thrust
    g.connectionRules.push({ preGene: 9, postGene: 3, weight: 1.0 }); // hearing LAT → turn
    return g;
  }
  ```
- [ ] run-pass — `pnpm exec vitest run src/core/genome/critter-genome.test.ts` — all green.
- [ ] `make check`
- [ ] commit — `git add -A && git commit -m "feat(genome): buildHearingPredatorGenome — PREY-eye + hearing pursuit pair"`

---

### Task 3 — `buildFleeingPreyGenome`: prey that smells food, sees/hears predators, and flees

A K-selected prey that develops the forager body (FOOD smell + a FOOD eye for approach) PLUS a PREDATOR-eye pair and a HEARING pair, both wired with INVERTED steering (FWD→thrust negative = brake/flip, LAT→turn negative = veer away) so it flees what it sees/hears as a predator. DRY over `buildSightedForagerGenome`.

**Files**
- Modify: `src/core/genome/critter-genome.ts` (add after `buildSightedForagerGenome`)
- Test: `src/core/genome/critter-genome.test.ts` (add a `describe` block)

**Interfaces**
- Consumes: `buildSightedForagerGenome(cellRadius = 6, initialEnergy = 100): Genome` (Task 1), `SenseSource`/`SightTarget`, `SensorChannel`, `CellType`.
- Produces: `export function buildFleeingPreyGenome(cellRadius = 6, initialEnergy = 100): Genome`

**Steps**
- [ ] RED — add to `src/core/genome/critter-genome.test.ts` (import `buildFleeingPreyGenome`):
  ```ts
  describe('buildFleeingPreyGenome — approaches food, flees seen/heard predators', () => {
    const g = buildFleeingPreyGenome(6, 100);
    const body = develop(g, 256, 16);

    it('is NOT carnivore: the mouth stays DIGESTIVE', () => {
      expect(g.genes[5]!.cellType).toBe(CellType.DIGESTIVE);
    });

    it('has 12 genes: sighted forager(8) + a PREDATOR-eye pair + a HEARING pair', () => {
      expect(g.genes.length).toBe(12);
    });

    it('keeps the FOOD-approach senses (smell pair + FOOD-eye pair)', () => {
      expect(g.genes[6]!.senseSource).toBe(SenseSource.SIGHT);
      expect(g.genes[6]!.sightTarget).toBe(SightTarget.FOOD);
    });

    it('grows a PREDATOR-eye pair (gene 8/9) wired to FLEE (FWD→thrust neg, LAT→turn neg)', () => {
      expect(g.genes[8]!.senseSource).toBe(SenseSource.SIGHT);
      expect(g.genes[8]!.sightTarget).toBe(SightTarget.PREDATOR);
      expect(g.genes[9]!.sightTarget).toBe(SightTarget.PREDATOR);
      const conn = (pre: number, post: number) =>
        g.connectionRules.find((c) => c.preGene === pre && c.postGene === post)!;
      expect(conn(8, 4).weight).toBeLessThan(0); // predator-eye FWD → thrust (brake/flip)
      expect(conn(9, 3).weight).toBeLessThan(0); // predator-eye LAT → turn (veer away)
    });

    it('grows a HEARING flee pair (gene 10/11) wired to FLEE', () => {
      expect(g.genes[10]!.senseSource).toBe(SenseSource.HEARING);
      expect(g.genes[11]!.senseSource).toBe(SenseSource.HEARING);
      const conn = (pre: number, post: number) =>
        g.connectionRules.find((c) => c.preGene === pre && c.postGene === post)!;
      expect(conn(11, 3).weight).toBeLessThan(0); // hearing LAT → turn (veer from motion)
    });

    it('develops a 12-cell body, no truncation, positive energy', () => {
      expect(body.count).toBe(12);
      expect(body.truncated).toBe(false);
      expect(body.totalEnergy).toBeGreaterThan(0);
    });

    it('instantiates into a small World as a non-carnivore', () => {
      const w = new World(defaultConfig({ maxCells: 2000, preyDeposit: 1 }), false);
      const org = w.spawnOrganism(g, 500, 500, 0);
      expect(org).toBeGreaterThanOrEqual(0);
      expect(w.organisms.carnivore[org]).toBe(0);
    });
  });
  ```
- [ ] run-fail — `pnpm exec vitest run src/core/genome/critter-genome.test.ts` — expect `TypeError: buildFleeingPreyGenome is not a function`.
- [ ] GREEN — add to `src/core/genome/critter-genome.ts` after `buildSightedForagerGenome`:
  ```ts
  /**
   * Fleeing prey: the sighted forager (smell + FOOD-eye approach) PLUS a PREDATOR-eye pair and a
   * HEARING pair, both wired INVERTED (FWD→thrust negative, LAT→turn negative) so the creature flees
   * what it sees/hears as a hunter. Stays a herbivore (DIGESTIVE mouth → carnivore flag never set).
   * Mutable founder genome under economic selection — no role label read by any kernel. DRY over
   * buildSightedForagerGenome. 12 cells: sighted forager(0..7) + predator-eye FWD(8)/LAT(9)
   * + hearing FWD(10)/LAT(11).
   */
  export function buildFleeingPreyGenome(cellRadius = 6, initialEnergy = 100): Genome {
    const g = buildSightedForagerGenome(cellRadius, initialEnergy);
    const r = cellRadius;
    const off = 3 * r;
    const lat = off * 0.6;
    const mkSensor = (channel: number, source: number, target: number): Gene => ({
      innovation: 0,
      cellType: CellType.SENSOR,
      radius: r,
      mass: 2,
      initialEnergy,
      bias: 0,
      sensorChannel: channel,
      glowGain: 0,
      senseSource: source,
      sightTarget: target,
    });
    g.genes.push(mkSensor(SensorChannel.FWD_GRAD, SenseSource.SIGHT, SightTarget.PREDATOR)); // 8
    g.genes.push(mkSensor(SensorChannel.LAT_GRAD, SenseSource.SIGHT, SightTarget.PREDATOR)); // 9
    g.genes.push(mkSensor(SensorChannel.FWD_GRAD, SenseSource.HEARING, SightTarget.FOOD)); // 10
    g.genes.push(mkSensor(SensorChannel.LAT_GRAD, SenseSource.HEARING, SightTarget.FOOD)); // 11
    g.divisionRules.push({ parentGene: 0, childGene: 8, angle: Math.atan2(-lat, -off), dist: Math.hypot(off, lat), stiffness: 1, repeat: 1 });
    g.divisionRules.push({ parentGene: 0, childGene: 9, angle: Math.atan2(lat, -off), dist: Math.hypot(off, lat), stiffness: 1, repeat: 1 });
    g.divisionRules.push({ parentGene: 0, childGene: 10, angle: Math.atan2(-lat * 1.5, -off), dist: Math.hypot(off, lat * 1.5), stiffness: 1, repeat: 1 });
    g.divisionRules.push({ parentGene: 0, childGene: 11, angle: Math.atan2(lat * 1.5, -off), dist: Math.hypot(off, lat * 1.5), stiffness: 1, repeat: 1 });
    g.bondRules.push({ geneA: 3, geneB: 8, stiffness: 1 });
    g.bondRules.push({ geneA: 4, geneB: 9, stiffness: 1 });
    g.bondRules.push({ geneA: 3, geneB: 10, stiffness: 1 });
    g.bondRules.push({ geneA: 4, geneB: 11, stiffness: 1 });
    g.connectionRules.push({ preGene: 8, postGene: 4, weight: -1.5 }); // predator-eye FWD → thrust (flee)
    g.connectionRules.push({ preGene: 9, postGene: 3, weight: -1.5 }); // predator-eye LAT → turn (veer)
    g.connectionRules.push({ preGene: 10, postGene: 4, weight: -1.0 }); // hearing FWD → thrust (flee motion)
    g.connectionRules.push({ preGene: 11, postGene: 3, weight: -1.0 }); // hearing LAT → turn
    return g;
  }
  ```
- [ ] run-pass — `pnpm exec vitest run src/core/genome/critter-genome.test.ts` — all green.
- [ ] `make check`
- [ ] commit — `git add -A && git commit -m "feat(genome): buildFleeingPreyGenome — FOOD approach + predator-flee sense pairs"`

---

### Task 4 — Movement-gain re-tune as an opt-in config preset (default byte-identical)

The decisive-steering knobs (`maxThrust`, `turnScale`, `thrustScale`, `thrustBias`) are NUMBER changes — but `defaultConfig` MUST stay byte-identical (guarded by `reproducibility.test.ts`). So ship the new values as an exported `Partial<Config>` preset that the probes/golden tests and the live demo opt into, NOT as new defaults. This keeps the cardinal byte-identical invariant while making the tuned regime reusable and reviewable.

**Files**
- Modify: `src/core/sim/config.ts` (add `decisiveMovementPreset` export after `defaultConfig`, ~line 487)
- Test: `src/core/sim/config.test.ts` (create if absent; else add a `describe`) — path: `src/core/sim/config.test.ts`

**Interfaces**
- Consumes: `Config` interface (config.ts:6), `defaultConfig(overrides?): Config` (config.ts:314).
- Produces: `export const decisiveMovementPreset: Partial<Config>`

**Steps**
- [ ] RED — write `src/core/sim/config.test.ts` (or append a `describe` if it exists):
  ```ts
  import { describe, it, expect } from 'vitest';
  import { defaultConfig, decisiveMovementPreset } from './config';

  describe('decisiveMovementPreset — opt-in decisive-steering movement gains', () => {
    it('raises maxThrust, turnScale, thrustScale above the conservative defaults', () => {
      const base = defaultConfig();
      expect(decisiveMovementPreset.maxThrust!).toBeGreaterThan(base.maxThrust);
      expect(decisiveMovementPreset.turnScale!).toBeGreaterThan(base.turnScale);
      expect(decisiveMovementPreset.thrustScale!).toBeGreaterThan(base.thrustScale);
    });

    it('does NOT alter defaultConfig (byte-identical guard stays intact)', () => {
      const base = defaultConfig();
      expect(base.maxThrust).toBe(6);
      expect(base.turnScale).toBeCloseTo(0.3, 6);
      expect(base.thrustScale).toBe(3);
      expect(base.thrustBias).toBe(2);
    });

    it('is applied only when explicitly spread into a config', () => {
      const tuned = defaultConfig(decisiveMovementPreset);
      expect(tuned.maxThrust).toBe(decisiveMovementPreset.maxThrust);
      expect(tuned.turnScale).toBe(decisiveMovementPreset.turnScale);
    });
  });
  ```
- [ ] run-fail — `pnpm exec vitest run src/core/sim/config.test.ts` — expect `decisiveMovementPreset` import is `undefined` → the `.toBeGreaterThan` on `undefined!` throws / fails.
- [ ] GREEN — add to `src/core/sim/config.ts` after `defaultConfig` returns (line 487, before `serializeConfig`):
  ```ts
  /**
   * Decisive-steering movement preset (Phase 4 tuning). Derived headlessly via the feel-probe: a clear
   * sense signal must produce a committed turn + real acceleration so pursuit/flight read as purposeful.
   * Shipped as an OPT-IN Partial<Config> (NOT new defaults) so defaultConfig stays byte-identical — the
   * reproducibility.test.ts baseline is unperturbed. The live demo (main.ts) and the golden/feel probes
   * spread this; numbers are live knobs swept in the probe, not magic constants.
   */
  export const decisiveMovementPreset: Partial<Config> = {
    maxThrust: 12, // ~2× the default 6 → terminal speed ≈ 12 units/tick (damping 0.5)
    turnScale: 0.6, // ~2× → up to ~0.6 rad/tick (~34°/tick): committed turns toward a target
    thrustScale: 5, // sharper response to thrust-neuron activation
    thrustBias: 2.5, // slightly faster cruise so searching still roams
  };
  ```
- [ ] run-pass — `pnpm exec vitest run src/core/sim/config.test.ts` — all green.
- [ ] `make check` (confirms `reproducibility.test.ts` still byte-identical — `defaultConfig` untouched).
- [ ] commit — `git add -A && git commit -m "feat(config): decisiveMovementPreset opt-in (defaults byte-identical)"`

---

### Task 5 — GOLDEN: a sight forager finds food faster than a smell-only forager

A World-driven behavior test (runnable ONLY now that sight + the sighted-forager genome exist). On a food-rich patchy world with `viewRange > 0` and the decisive-movement preset, a `buildSightedForagerGenome` started off-axis from a plant cluster closes distance MORE / FASTER than a `buildForagerGenome` (smell only) from the identical start. Models the proven `critter-swim.test.ts` World-driving pattern.

**Files**
- Test (create): `src/core/sim/golden-sight-forage.test.ts`
- (Read-only) Consumes Task 1 genome + Phase 3 sight wiring + Task 4 preset.

**Interfaces**
- Consumes: `World(config, debug)` constructor + `world.tick()`, `world.spawnOrganism(genome, x, y, heading): number` (world.ts:345), `world.cells.fields` (CellArrays: `posX/posY` Float64, `cellType` Uint8, `organismId` Uint32 — cell-store.ts:7), `world.organisms.cellCount` (Uint32Array, organisms.ts:11), `buildForagerGenome`/`buildSightedForagerGenome` (critter-genome.ts), `defaultConfig`/`decisiveMovementPreset` (config.ts), `torusDist(x0,y0,x1,y1,w,h)` (`src/core/math/vec2.ts`), `CellType`.
- Produces: the golden test file.

**Steps**
- [ ] RED — write `src/core/sim/golden-sight-forage.test.ts`:
  ```ts
  import { describe, it, expect } from 'vitest';
  import { World } from './world';
  import { defaultConfig, decisiveMovementPreset } from './config';
  import { CellType } from '../cells/types';
  import { torusDist } from '../math/vec2';
  import { buildForagerGenome, buildSightedForagerGenome } from '../genome/critter-genome';
  import type { Genome } from '../genome/genome';

  // GOLDEN (runnable only at Phase 4): with sight ON, a forager that grows a FOOD-eye pair closes
  // distance to a nearby plant cluster FASTER than a smell-only forager from the identical start.
  // Small 800² torus + fine food grid (proven climbable-gradient geometry, mirrors critter-swim.test.ts);
  // viewRange ON so the eye fires; decisive-movement preset so steering is committed.
  function distAfter(genome: Genome, ticks: number): number {
    const cfg = defaultConfig({
      ...decisiveMovementPreset,
      maxCells: 256,
      worldWidth: 800,
      worldHeight: 800,
      foodGridCols: 16,
      foodGridRows: 16,
      repulsion: 0,
      divideThreshold: 1e9, // plants don't divide; forager can't reach repro
      basalCost: 0,
      initialMotileFraction: 0,
      viewRange: 48, // sight ON (R = ceil(48/12) within the cost ceiling)
      viewHalfAngle: Math.PI / 3,
    });
    const w = new World(cfg, false);
    const f = w.cells.fields;
    // PHOTO food cluster near (400, 560).
    for (let k = 0; k < 12; k++) {
      const i = w.cells.alloc();
      f.posX[i] = 400 + (k % 4) * 4;
      f.posY[i] = 560 + ((k / 4) | 0) * 4;
      f.radius[i] = cfg.cellRadius;
      f.mass[i] = 1;
      f.energy[i] = 100;
      f.cellType[i] = CellType.PHOTO;
    }
    const foodX = 406;
    const foodY = 564;
    // Forager starts ABOVE the food facing +x → food is off-axis (requires steering).
    const org = w.spawnOrganism(genome, 400, 300, 0);
    expect(org).toBeGreaterThanOrEqual(0);
    // find the MOVER cell of this organism for distance measurement
    let mover = -1;
    for (let i = 0; i < f.cellType.length; i++) {
      if (f.organismId[i] === org && f.cellType[i] === CellType.MOVER) { mover = i; break; }
    }
    expect(mover).toBeGreaterThanOrEqual(0);
    for (let t = 0; t < ticks; t++) w.tick();
    return torusDist(f.posX[mover]!, f.posY[mover]!, foodX, foodY, 800, 800);
  }

  describe('GOLDEN — sight forager out-forages smell-only forager', () => {
    it('the sighted forager is closer to food after the same number of ticks', () => {
      const TICKS = 400;
      const dSmell = distAfter(buildForagerGenome(6, 100), TICKS);
      const dSight = distAfter(buildSightedForagerGenome(6, 100), TICKS);
      // sight gives a short-range lock that smell's diffuse gradient lacks near the patch
      expect(dSight).toBeLessThan(dSmell);
    });
  });
  ```
- [ ] run-fail — `pnpm exec vitest run src/core/sim/golden-sight-forage.test.ts` — expect a failure: EITHER the assertion `dSight < dSmell` fails (if sight/genome not yet correct) OR a setup error. Confirm the actual numbers printed so the GREEN step targets a real gap, not a flake. If `dSight >= dSmell`, that is the RED signal to tune in GREEN.
- [ ] GREEN — this is a behavior test; the "impl" is the genome + wiring from Tasks 1–4 plus any tuning needed to make sight decisively better. Minimal real adjustments allowed: (a) raise the FOOD-eye connection weights in `buildSightedForagerGenome` (`conn(6,4)`/`conn(7,3)`) if the eye signal is too weak; (b) widen `viewRange`/`viewHalfAngle` in the test config; (c) lengthen `TICKS`. Make the SMALLEST change that yields `dSight < dSmell` robustly, re-run, and record the final distances in a comment in the test (e.g. `// dSmell≈X, dSight≈Y at 400 ticks`).
- [ ] run-pass — `pnpm exec vitest run src/core/sim/golden-sight-forage.test.ts` — green.
- [ ] `make check`
- [ ] commit — `git add -A && git commit -m "test(golden): sight forager out-forages smell-only forager"`

---

### Task 6 — GOLDEN: a sighted+hearing predator catches a fleeing prey

The arms-race payoff golden test. On a small torus with sight + hearing + predation + flee all ON and the decisive-movement preset, a `buildHearingPredatorGenome` started near a `buildFleeingPreyGenome` drains/kills the prey organism within a bounded number of ticks — detected structurally by the prey organism's `cellCount` dropping to 0 (atomic death → MEAT). No role label is read; predation runs off `organisms.carnivore`, set by the PREDATOR mouth.

**Files**
- Test (create): `src/core/sim/golden-predator-catch.test.ts`
- (Read-only) Consumes Tasks 2 & 3 genomes + Phase 2/3 hearing+sight + predation knobs (`preyDeposit`, `predDigestRate`, `predReach`, `predLatchRange`, `predLatchStiffness`, `carnivoreThrustMult`, `predScentDeposit`, `predFleeWeight`) + Task 4 preset.

**Interfaces**
- Consumes: `World(config, debug)`, `world.tick()`, `world.spawnOrganism(genome, x, y, heading): number`, `world.organisms.cellCount` (Uint32Array, organisms.ts:11) + `world.organisms.carnivore` (Uint8Array, organisms.ts:25), `buildHearingPredatorGenome`/`buildFleeingPreyGenome` (critter-genome.ts), `defaultConfig`/`decisiveMovementPreset`, `CellType`.
- Produces: the golden test file.

**Steps**
- [ ] RED — write `src/core/sim/golden-predator-catch.test.ts`:
  ```ts
  import { describe, it, expect } from 'vitest';
  import { World } from './world';
  import { defaultConfig, decisiveMovementPreset } from './config';
  import { buildHearingPredatorGenome, buildFleeingPreyGenome } from '../genome/critter-genome';

  // GOLDEN (runnable only at Phase 4): with sight+hearing+predation+flee ON, a pursuit predator
  // catches a fleeing prey. "Caught" is detected STRUCTURALLY — the prey organism's cellCount drops
  // to 0 (atomic death → MEAT) — never by reading a role label. Predation runs off organisms.carnivore,
  // which the PREDATOR mouth sets structurally at instantiate.
  describe('GOLDEN — sighted/hearing predator catches a fleeing prey', () => {
    it('drains the prey organism to atomic death within the chase window', () => {
      const cfg = defaultConfig({
        ...decisiveMovementPreset,
        maxCells: 512,
        worldWidth: 600,
        worldHeight: 600,
        repulsion: 0.5,
        basalCost: 0,
        divideThreshold: 1e9, // no births to confound the count
        initialMotileFraction: 0,
        // senses ON
        viewRange: 60,
        viewHalfAngle: Math.PI / 2,
        loudnessGain: 1, // hearing ON
        // predation + flee ON (proven ecology levers)
        preyDeposit: 2,
        predScentDeposit: 2,
        predFleeWeight: 1,
        predDigestRate: 40,
        predReach: 1.4,
        predLatchRange: 1.4,
        predLatchStiffness: 0.5,
        carnivoreThrustMult: 1.3,
      });
      const w = new World(cfg, false);
      // prey first (lower organism id), predator a short distance behind it, facing the prey.
      const prey = w.spawnOrganism(buildFleeingPreyGenome(6, 400), 300, 300, Math.PI / 2);
      const predator = w.spawnOrganism(buildHearingPredatorGenome(6, 400), 300, 240, Math.PI / 2);
      expect(prey).toBeGreaterThanOrEqual(0);
      expect(predator).toBeGreaterThanOrEqual(0);
      expect(w.organisms.carnivore[predator]).toBe(1);
      expect(w.organisms.carnivore[prey]).toBe(0);

      let caught = false;
      for (let t = 0; t < 3000; t++) {
        w.tick();
        if (w.organisms.cellCount[prey] === 0) { caught = true; break; }
      }
      expect(caught).toBe(true); // the prey was hunted down (cellCount → 0 = atomic death)
      expect(w.organisms.cellCount[predator]!).toBeGreaterThan(0); // the hunter survived the chase
    });
  });
  ```
- [ ] run-fail — `pnpm exec vitest run src/core/sim/golden-predator-catch.test.ts` — expect `caught` to be `false` initially (predator can't close on the fleeing prey) → `expect(caught).toBe(true)` fails. This is the RED signal; note how close the predator got (add a temporary `console.log(w.organisms.cellCount[prey], torusDist(...))` if needed to gauge).
- [ ] GREEN — make the SMALLEST real change set that lets the hunter complete a kill, drawn from the verified ecology levers + Phase 4 wiring: (a) raise `carnivoreThrustMult` / `predReach` / `predLatchRange` / `predLatchStiffness` within their documented ceilings (config.ts:99–122: reach/latch must stay within ~1.5·cellSize of the 3×3 window); (b) strengthen the predator's PREY-eye pursuit weights (`conn(6,4)`/`conn(7,3)` in `buildHearingPredatorGenome`); (c) lengthen the chase window / start the predator closer. Prefer config knobs over genome edits so the win is tuning, not a hand-built kill. Re-run until `caught === true` robustly; record the final tick-to-catch in a comment.
- [ ] run-pass — `pnpm exec vitest run src/core/sim/golden-predator-catch.test.ts` — green.
- [ ] `make check`
- [ ] commit — `git add -A && git commit -m "test(golden): sighted/hearing predator catches a fleeing prey"`

---

### Task 7 — Headless feel-probe: founder-brain navigation + lifespan + catch report

Extend the headless probe harness with a Phase-4 founder-brain probe that runs the tuned regime (decisive-movement preset + senses ON + drifting zones) and prints: time-to-food for smell-only vs sighted foragers (purposefulness delta), the fed-creature lifespan distribution (the K-selection ~3–5 min gate), and predator catch counts — the gate the design requires before the live demo. This is observation-only (no fitness in core); it just reads `world.metrics`, `organisms.cellCount`, positions.

**Files**
- Create: `src/headless/founder-brain-probe.ts` (model on `src/headless/forager-probe.ts`)
- (No unit test — headless probes are run, not unit-tested; gate is the console report.)

**Interfaces**
- Consumes: `World(config, debug)` + `world.tick()` + `world.spawnOrganism(...)` + `world.metrics` + `world.lastOrganismDeaths`/`lastOrganismBirths` (used in forager-probe.ts:80), `world.organisms.cellCount`/`carnivore`/`energy`, `buildForagerGenome`/`buildSightedForagerGenome`/`buildHearingPredatorGenome`/`buildFleeingPreyGenome`, `defaultConfig`/`decisiveMovementPreset`, `torusDist`, `CellType`.
- Produces: a runnable probe (`npx tsx src/headless/founder-brain-probe.ts` or the repo's existing headless runner).

**Steps**
- [ ] Write `src/headless/founder-brain-probe.ts` mirroring `forager-probe.ts` structure (a `cfg`, a `World`, spawn loop, a tick loop with periodic `console.log`):
  ```ts
  import { World } from '../core/sim/world';
  import { defaultConfig, decisiveMovementPreset } from '../core/sim/config';
  import {
    buildForagerGenome,
    buildSightedForagerGenome,
    buildHearingPredatorGenome,
    buildFleeingPreyGenome,
  } from '../core/genome/critter-genome';
  import { CellType } from '../core/cells/types';
  import { torusDist } from '../core/math/vec2';
  import type { Genome } from '../core/genome/genome';

  // Phase-4 founder-brain feel-probe (observation-only; no fitness in core). Reports:
  //  (1) time-to-food: smell-only vs sighted forager (the purposefulness delta, target ≥30%)
  //  (2) fed-creature lifespan (the K-selection ~3-5min / 10.8k-18k-tick gate)
  //  (3) predator catch count over a long run (the arms-race signal).
  const SENSE_CFG = {
    ...decisiveMovementPreset,
    viewRange: 48,
    viewHalfAngle: Math.PI / 3,
    loudnessGain: 1,
    driftAmplitude: 0, // hold zones still for the time-to-food measurement; flip on for the long run
  };

  function timeToFood(genome: Genome, seed: number): number {
    const cfg = defaultConfig({
      ...SENSE_CFG,
      seed,
      maxCells: 256,
      worldWidth: 800,
      worldHeight: 800,
      foodGridCols: 16,
      foodGridRows: 16,
      repulsion: 0,
      basalCost: 0,
      divideThreshold: 1e9,
      initialMotileFraction: 0,
    });
    const w = new World(cfg, false);
    const f = w.cells.fields;
    for (let k = 0; k < 12; k++) {
      const i = w.cells.alloc();
      f.posX[i] = 400 + (k % 4) * 4;
      f.posY[i] = 560 + ((k / 4) | 0) * 4;
      f.radius[i] = cfg.cellRadius;
      f.mass[i] = 1;
      f.energy[i] = 100;
      f.cellType[i] = CellType.PHOTO;
    }
    const org = w.spawnOrganism(genome, 400, 300, 0);
    let mover = -1;
    for (let i = 0; i < f.cellType.length; i++) {
      if (f.organismId[i] === org && f.cellType[i] === CellType.MOVER) { mover = i; break; }
    }
    for (let t = 1; t <= 2000; t++) {
      w.tick();
      if (torusDist(f.posX[mover]!, f.posY[mover]!, 406, 564, 800, 800) < 30) return t;
    }
    return Infinity; // never reached
  }

  console.log('=== time-to-food (lower is better) ===');
  for (const seed of [1, 2, 3, 4, 5]) {
    const smell = timeToFood(buildForagerGenome(6, 100), seed);
    const sight = timeToFood(buildSightedForagerGenome(6, 100), seed);
    const delta = smell === Infinity ? NaN : (smell - sight) / smell;
    console.log(`seed ${seed}: smell=${smell}  sight=${sight}  Δ=${(delta * 100).toFixed(0)}%`);
  }

  console.log('\n=== predator catch over a long run (arms-race signal) ===');
  {
    const cfg = defaultConfig({
      ...SENSE_CFG,
      seed: 7,
      maxCells: 4000,
      worldWidth: 1024,
      worldHeight: 1024,
      preyDeposit: 2,
      predScentDeposit: 2,
      predFleeWeight: 1,
      predDigestRate: 40,
      predReach: 1.4,
      predLatchRange: 1.4,
      predLatchStiffness: 0.5,
      carnivoreThrustMult: 1.3,
    });
    const w = new World(cfg, false);
    for (let k = 0; k < 20; k++)
      w.spawnOrganism(buildFleeingPreyGenome(6, 400), 200 + k * 30, 500, 0);
    for (let k = 0; k < 5; k++)
      w.spawnOrganism(buildHearingPredatorGenome(6, 400), 300 + k * 80, 540, 0);
    let deaths = 0;
    for (let t = 1; t <= 6000; t++) {
      w.tick();
      deaths += w.lastOrganismDeaths;
      if (t % 1000 === 0) console.log(`tick ${t}: organismDeaths so far=${deaths}`);
    }
    console.log(`total organism deaths over 6000 ticks: ${deaths}`);
  }
  ```
- [ ] Run the probe (use the repo's headless runner; e.g. `npx tsx src/headless/founder-brain-probe.ts` or the pattern the other probes are invoked with — check `package.json` scripts / `src/headless/run.ts`). Confirm it prints all three sections without throwing.
- [ ] Record the observed numbers (time-to-food delta, catch/death counts) in a top-of-file comment so later phases have the baseline. The gate is: sight time-to-food delta ≥ ~30% on a majority of seeds AND predator deaths > 0 over the long run. If the gate is missed, that is a tuning signal for Tasks 1–6 / Phase 5 — note it, do not fudge the probe.
- [ ] `make check` (typecheck/lint the new probe).
- [ ] commit — `git add -A && git commit -m "feat(headless): founder-brain feel-probe — time-to-food delta + predator catch gate"`

---

**Phase 4 exit criteria:** `make check` green; `reproducibility.test.ts` still byte-identical (`defaultConfig` untouched — movement tuning is the opt-in `decisiveMovementPreset`); four new founder genomes (`buildSightedForagerGenome`, `buildHearingPredatorGenome`, `buildFleeingPreyGenome`, plus the existing predator/forager) all develop + instantiate with `senseSource`/`sightTarget` set and no role label read by any kernel; both golden behavior tests pass (sight forager out-forages smell-only; pursuit predator catches fleeing prey via structural `cellCount→0`); the founder-brain feel-probe runs and reports the purposefulness delta + catch counts that gate Phase 5.

---

## Phase 5 — Arms-race balance + legibility + final determinism

> **Read first.** This phase assumes Phases 1–4 already landed: `src/core/sim/config.ts` already has `driftAmplitude`, `loudnessGain`, `viewRange`, `viewHalfAngle`, `senseSourceRate` (all defaulting to OFF), `src/core/neural/network.ts` already exposes `readonly sensorSource: Uint8Array` + `readonly sensorSightTarget: Uint8Array` (parallel to `sensorCell`/`sensorChannel`, sized `maxNeurons`), `src/core/cells/sense-source.ts` exports `SenseSource = { SMELL:0, SIGHT:1, HEARING:2 }` + `SightTarget = { FOOD:0, PREY:1, PREDATOR:2 }`, and `src/core/genome/critter-genome.ts` has senses-using founder genomes. This phase does NOT add new mechanisms — it (a) tunes existing knobs headlessly to the success bar, (b) labels the brain inspector by `senseSource`, (c) pins a senses-ON + drift-ON determinism case, and (d) wires the validated config into the live demo LAST.
>
> **Invariants restated for this phase.** No `Math.random`/`Date.now` on any hot path. The CARDINAL RULE: nothing under `src/core/**` reads founder/lineage/species/role — only `f.cellType[j]` + `organisms.carnivore[organismId]`. The default-config baseline used by `reproducibility.test.ts` stays byte-identical; the new senses-ON + drift-ON case is an ADDITIONAL `describe` block, not a change to the existing baseline runs. Zero per-tick allocation in any core kernel. The brain inspector lives in `src/app/**` (NOT core) and is read-only over core. Run tests with `pnpm exec vitest run <path>`; gate the whole phase with `make check`.
>
> **Task order matters.** Task 1 (determinism pin) and Task 2 (inspector labels) are independent and can be done in either order. Task 3 (headless balance probe) produces the validated numbers. Task 4 (wire into `main.ts`) MUST be last — it depends on Task 3's validated config and must not break `make check`.

---

### Task 1 — Senses-ON + drift-ON byte-identical determinism case

Add a new `describe` block to `reproducibility.test.ts` that turns ON drift (`driftAmplitude > 0`), hearing (`loudnessGain > 0`), sight (`viewRange > 0`, `viewHalfAngle > 0`), and the new sense-modality mutation (`senseSourceRate > 0`) simultaneously, then asserts (a) two runs are byte-identical across the SoA + genome library + lineage log, and (b) the run is NON-VACUOUS — drift actually recomputed the light cap, the noise field actually got a deposit, and the expanded mutation range was actually exercised. This is the only test that locks the expanded `rng.int(...)` channel-count draw and the `senseSource`/`sightTarget` mutation operators against future drift.

**Files**
- **Modify** `src/core/sim/reproducibility.test.ts` — append a new `describe('reproducibility — senses-ON + drift-ON (Phase 5)')` block AFTER the existing `describe('reproducibility — predation + fleeing (3-trophic ecology) ON')` block (currently ends at line 479). Reuse the existing imports already at the top of the file (`World`, `defaultConfig`, `develop`, `buildForagerGenome`, `buildPredatorGenome`, `instantiateBody`, `serializeGenomeLibrary`, `serializeLineageLog`, `CellType`).
- **Test:** this file IS the test.

**Interfaces**
- Consumes `defaultConfig(overrides: Partial<Config>): Config` from `src/core/sim/config.ts` — the senses knobs `driftAmplitude`, `loudnessGain`, `viewRange`, `viewHalfAngle`, `senseSourceRate` are all settable here (added in Phases 1–3).
- Consumes `new World(cfg: Config, telemetry?: boolean)` and `World.tick(): void`, `World.seedLife(n: number): void`.
- Consumes `World.cells.fields` (SoA: `energy`, `posX`, `posY`, `organismId`, `heading`, `latchCell`, `latchPrey` — all `Float32Array`/`Uint32Array`).
- Consumes `World.light: LightField` with `light.cap: Float32Array` (the drifted cap) — used for the non-vacuity drift assertion. (Verify the public field name on `LightField`; if the cap buffer is named `field` like other scalar fields, read `world.light.field` instead — RED step below tells you which.)
- Consumes `World.noise: NoiseField` (constructed in Phase 2) with `noise.field: Float32Array` — for the hearing non-vacuity assertion.
- Consumes `World.genomes`, `World.lineage`, and the serializers `serializeGenomeLibrary(lib)`, `serializeLineageLog(log)`.
- Consumes `buildForagerGenome(cellRadius: number, initEnergy: number)` and `buildPredatorGenome(cellRadius: number, initEnergy: number, fwdThrustWeight: number)` from `src/core/genome/critter-genome.ts`.
- Produces nothing (test only).

**Steps**

- [ ] **RED.** First confirm the exact public name of the drifted light cap buffer (the assertion needs it). Run:
  ```
  pnpm exec grep -nE "cap|field" src/core/environment/light-field.ts | head -20
  ```
  Note whether the per-cell cap buffer is `cap` or `field`. Likewise confirm the noise field buffer name:
  ```
  pnpm exec grep -nE "class NoiseField|field" src/core/environment/noise-field.ts
  ```
  Then add this block at the end of `src/core/sim/reproducibility.test.ts` (substitute `world.light.cap` / `world.noise.field` with whatever the grep above confirmed — the structure is identical either way):
  ```ts
  describe('reproducibility — senses-ON + drift-ON (Phase 5)', () => {
    // Turns ON every Phase 1-4 mechanism at once (drift, hearing, sight, sense-modality
    // mutation) and pins that (a) two runs are byte-identical and (b) each new path actually
    // fired (non-vacuous), so the expanded rng.int(channelCount) draw + the senseSource/
    // sightTarget mutation operators can never silently perturb determinism again.
    function runSenses(): {
      w: World;
      capRecomputed: boolean;
      noiseDeposited: boolean;
      births: number;
    } {
      const cfg = defaultConfig({
        seed: 1234,
        maxCells: 8000,
        maxBonds: 16384,
        maxOrganisms: 4096,
        cellRadius: 4,
        worldWidth: 384,
        worldHeight: 384,
        initialPhotoFraction: 1,
        initialMotileFraction: 0,
        crowdDivideCap: 4,
        crowdGridSize: 32,
        divideThreshold: 70,
        reproThreshold: 280,
        reproParentFloor: 60,
        organismDeathFloor: 0,
        basalCost: 0.004,
        cruiseThrust: 1,
        maxThrust: 8,
        // ── all three new senses ON ──
        driftAmplitude: 24, // light zones migrate → cap[] recomputed every tick
        loudnessGain: 0.5, // motion deposits into the NoiseField
        viewRange: 24, // R = ceil(24/8) = 3 buckets → sight cone runs
        viewHalfAngle: 0.6, // ~34° half-cone
        // ── the new mutation surface ON ──
        senseSourceRate: 0.05, // draws the senseSource/sightTarget mutation operators
        mutationWeightRate: 0.25,
        mutationWeightSigma: 0.1,
        mutationParamRate: 0.1,
        mutationParamSigma: 0.1,
        mutationChangeTypeRate: 0.015,
        mutationSensorChannelRate: 0.02, // exercises the EXPANDED rng.int(channelCount) draw
      });
      const w = new World(cfg, false);
      w.seedLife(2000);
      const spawn = (
        g: ReturnType<typeof buildForagerGenome>,
        x: number,
        y: number,
        h: number,
      ): void => {
        const ref = w.genomes.register(g);
        const body = develop(g, cfg.maxCellsPerOrganism, cfg.maxRecursionDepth);
        instantiateBody(
          body,
          w.cells,
          w.net,
          w.bonds,
          w.organisms,
          ref,
          x,
          y,
          h,
          cfg.worldWidth,
          cfg.worldHeight,
          w.instantiateScratch,
          w.glowEffectors,
        );
      };
      for (let k = 0; k < 20; k++) {
        spawn(
          buildForagerGenome(cfg.cellRadius, 45),
          cfg.worldWidth * (0.2 + (0.6 * (k % 5)) / 5),
          cfg.worldHeight * (0.2 + (0.6 * Math.floor(k / 5)) / 4),
          (k * 2.39996) % (Math.PI * 2),
        );
      }
      for (let k = 0; k < 6; k++) {
        spawn(
          buildPredatorGenome(cfg.cellRadius, 360, -1.5),
          cfg.worldWidth * (0.25 + (0.5 * (k % 3)) / 3),
          cfg.worldHeight * (0.25 + (0.5 * Math.floor(k / 3)) / 2),
          (k * 1.7) % (Math.PI * 2),
        );
      }
      // Snapshot the seeded light cap so we can prove drift actually mutated it.
      const cap0 = Float32Array.from(w.light.cap);
      let births = 0;
      let noiseDeposited = false;
      for (let t = 0; t < 400; t++) {
        w.tick();
        births += w.lastOrganismBirths;
        if (!noiseDeposited) {
          for (let i = 0; i < w.noise.field.length; i++) {
            if (w.noise.field[i]! > 0) {
              noiseDeposited = true;
              break;
            }
          }
        }
      }
      let capRecomputed = false;
      for (let i = 0; i < cap0.length; i++) {
        if (w.light.cap[i] !== cap0[i]) {
          capRecomputed = true;
          break;
        }
      }
      return { w, capRecomputed, noiseDeposited, births };
    }

    it('two runs are byte-identical AND every new sense path fired (non-vacuous)', () => {
      const a = runSenses();
      const b = runSenses();
      const fa = a.w.cells.fields;
      const fb = b.w.cells.fields;
      expect(Array.from(fa.energy)).toEqual(Array.from(fb.energy));
      expect(Array.from(fa.posX)).toEqual(Array.from(fb.posX));
      expect(Array.from(fa.posY)).toEqual(Array.from(fb.posY));
      expect(Array.from(fa.heading)).toEqual(Array.from(fb.heading));
      expect(Array.from(fa.organismId)).toEqual(Array.from(fb.organismId));
      expect(Array.from(a.w.light.cap)).toEqual(Array.from(b.w.light.cap));
      expect(Array.from(a.w.noise.field)).toEqual(Array.from(b.w.noise.field));
      expect(serializeGenomeLibrary(a.w.genomes)).toBe(serializeGenomeLibrary(b.w.genomes));
      expect(serializeLineageLog(a.w.lineage)).toBe(serializeLineageLog(b.w.lineage));
      // Non-vacuity: each new mechanism actually engaged in BOTH runs.
      expect(a.capRecomputed).toBe(true); // drift recomputed the light cap
      expect(a.capRecomputed).toBe(b.capRecomputed);
      expect(a.noiseDeposited).toBe(true); // hearing deposited into the NoiseField
      expect(a.noiseDeposited).toBe(b.noiseDeposited);
      expect(a.births).toBeGreaterThan(0); // the (mutating) reproduction path ran
      expect(a.births).toBe(b.births);
    }, 30000);
  });
  ```

- [ ] **run-fail.** `pnpm exec vitest run src/core/sim/reproducibility.test.ts`
  Expected: every OTHER block passes; the new block fails. The realistic failure mode is NOT an assertion mismatch but a TypeScript / runtime error — e.g. `TypeError: Cannot read properties of undefined (reading 'cap')` if the light cap buffer is actually named `field`, or `w.noise is undefined` if NoiseField wasn't wired into `World` in Phase 2, or `senseSourceRate is not assignable` if the knob name differs. If you get a TS compile error on the config override, that's the RED — it tells you the exact knob name to fix. Fix the field/knob names to match the real Phase 1–3 implementation (this is the "minimal impl" — the test is the deliverable; there is no production code to write here, only correct field references).

- [ ] **GREEN.** No production code. Correct the buffer/knob names in the test until the names resolve, then the determinism assertions must pass on their own (Phases 1–3 already made the mechanisms deterministic; if they DON'T pass, that is a real determinism bug introduced earlier — STOP and report it, do not weaken the assertions). The non-vacuity flags (`capRecomputed`, `noiseDeposited`, `births > 0`) prove the run isn't a no-op; if any is false, the chosen knob values were too weak — raise `driftAmplitude` / `loudnessGain` / the spawn count until each path fires, but never lower an assertion to make it pass.

- [ ] **run-pass.** `pnpm exec vitest run src/core/sim/reproducibility.test.ts`
  Expected: all blocks green, including `reproducibility — senses-ON + drift-ON (Phase 5) › two runs are byte-identical AND every new sense path fired (non-vacuous)`.

- [ ] **Guard the baseline is untouched.** Confirm you did NOT edit any existing block (the default-config baseline must stay byte-identical):
  ```
  git diff src/core/sim/reproducibility.test.ts
  ```
  Expected: the diff is purely additive (only the new `describe` block + nothing removed/changed above line 479).

- [ ] **commit.**
  ```
  git add src/core/sim/reproducibility.test.ts && git commit -m "test(sim): senses-ON + drift-ON byte-identical determinism case (Phase 5)"
  ```

---

### Task 2 — Brain-inspector sense labels by `senseSource`

The brain inspector currently tags every neural cell with `S`/`N`/`M` (`TYPE_TAG` at `src/app/brain-inspector.ts:5-9`). Phase 5 makes the sensorimotor loop legible: a SENSOR cell should show WHICH sense it reads (smell/sight/hearing) and, for sight, its target class — so a "sight-lock → interneuron → mover-pursuit" chain is readable. Read `net.sensorSource` + `net.sensorSightTarget` (added in Phase 2), NOT `think`. This is `src/app/**` (UI), read-only over core, and has zero determinism impact.

**Files**
- **Modify** `src/app/brain-inspector.ts` — add a per-SENSOR-cell modality lookup helper; change the tag drawn inside SENSOR nodes (line 120) from the bare `S` to a modality letter; extend the footer key (line 133).
- **Test:** **Create** `src/app/brain-inspector.test.ts` — a DOM-free unit test of the label-derivation logic (extract the pure mapping so it's testable without a canvas).

**Interfaces**
- Consumes `world.net.sensorCell: Uint32Array`, `world.net.sensorChannel: Uint8Array`, `world.net.sensorSource: Uint8Array`, `world.net.sensorSightTarget: Uint8Array`, `world.net.sensorCount: number` (all on `NeuralNetwork`, `src/core/neural/network.ts`).
- Consumes `SenseSource` + `SightTarget` from `src/core/cells/sense-source.ts`.
- Consumes `CellType` from `src/core/cells/types.ts` (already imported in brain-inspector.ts).
- Produces a pure exported helper:
  ```ts
  export function sensorLabel(
    net: { sensorCell: Uint32Array; sensorSource: Uint8Array; sensorSightTarget: Uint8Array; sensorCount: number },
    cell: number,
  ): string; // 'Sm' | 'Si:F' | 'Si:Y' | 'Si:P' | 'He' | 'S' (S = not a bound sensor)
  ```

**Steps**

- [ ] **RED.** Create `src/app/brain-inspector.test.ts`:
  ```ts
  import { describe, it, expect } from 'vitest';
  import { sensorLabel } from './brain-inspector';
  import { SenseSource, SightTarget } from '../core/cells/sense-source';

  function fakeNet(
    bindings: { cell: number; source: number; sightTarget: number }[],
  ): { sensorCell: Uint32Array; sensorSource: Uint8Array; sensorSightTarget: Uint8Array; sensorCount: number } {
    const n = bindings.length;
    const net = {
      sensorCell: new Uint32Array(n),
      sensorSource: new Uint8Array(n),
      sensorSightTarget: new Uint8Array(n),
      sensorCount: n,
    };
    bindings.forEach((b, k) => {
      net.sensorCell[k] = b.cell;
      net.sensorSource[k] = b.source;
      net.sensorSightTarget[k] = b.sightTarget;
    });
    return net;
  }

  describe('sensorLabel', () => {
    it('labels a smell sensor Sm', () => {
      const net = fakeNet([{ cell: 7, source: SenseSource.SMELL, sightTarget: SightTarget.FOOD }]);
      expect(sensorLabel(net, 7)).toBe('Sm');
    });
    it('labels a hearing sensor He', () => {
      const net = fakeNet([{ cell: 7, source: SenseSource.HEARING, sightTarget: SightTarget.FOOD }]);
      expect(sensorLabel(net, 7)).toBe('He');
    });
    it('labels sight sensors by target class', () => {
      const net = fakeNet([
        { cell: 1, source: SenseSource.SIGHT, sightTarget: SightTarget.FOOD },
        { cell: 2, source: SenseSource.SIGHT, sightTarget: SightTarget.PREY },
        { cell: 3, source: SenseSource.SIGHT, sightTarget: SightTarget.PREDATOR },
      ]);
      expect(sensorLabel(net, 1)).toBe('Si:F');
      expect(sensorLabel(net, 2)).toBe('Si:Y');
      expect(sensorLabel(net, 3)).toBe('Si:P');
    });
    it('returns bare S for a cell with no sensor binding', () => {
      const net = fakeNet([{ cell: 7, source: SenseSource.SMELL, sightTarget: SightTarget.FOOD }]);
      expect(sensorLabel(net, 99)).toBe('S');
    });
  });
  ```

- [ ] **run-fail.** `pnpm exec vitest run src/app/brain-inspector.test.ts`
  Expected: fails to import — `SyntaxError`/`does not provide an export named 'sensorLabel'` (the helper doesn't exist yet).

- [ ] **GREEN.** In `src/app/brain-inspector.ts`, add the imports and the exported pure helper at module scope (above the `BrainInspector` class). Add to the existing import line `import { CellType } from '../core/cells/types';`:
  ```ts
  import { SenseSource, SightTarget } from '../core/cells/sense-source';
  ```
  Then add the helper:
  ```ts
  /** Single sight-target letter: FOOD=F, PREY=Y (so it can't collide with Predator), PREDATOR=P. */
  const SIGHT_TARGET_TAG: Record<number, string> = {
    [SightTarget.FOOD]: 'F',
    [SightTarget.PREY]: 'Y',
    [SightTarget.PREDATOR]: 'P',
  };

  /**
   * Legibility label for a SENSOR cell, derived from its modality binding (Phase 5):
   * Sm = smell, He = hearing, Si:{F|Y|P} = sight (food/prey/predator). 'S' if the cell
   * has no live sensor binding. Read-only over core; reads net.sensorSource, NOT think.
   */
  export function sensorLabel(
    net: {
      sensorCell: Uint32Array;
      sensorSource: Uint8Array;
      sensorSightTarget: Uint8Array;
      sensorCount: number;
    },
    cell: number,
  ): string {
    for (let k = 0; k < net.sensorCount; k++) {
      if (net.sensorCell[k] !== cell) continue;
      const src = net.sensorSource[k]!;
      if (src === SenseSource.HEARING) return 'He';
      if (src === SenseSource.SIGHT) return 'Si:' + (SIGHT_TARGET_TAG[net.sensorSightTarget[k]!] ?? '?');
      return 'Sm'; // SMELL (default)
    }
    return 'S'; // no sensor binding on this cell
  }
  ```
  Now wire it into the node render. The current SENSOR/NEURON/MOVER tag is drawn at line 120:
  ```ts
        ctx.fillText(TYPE_TAG[f.cellType[i]!] ?? '?', px, py + 0.5);
  ```
  Replace that single line with a SENSOR-aware version (SENSOR cells get the modality label; NEURON/MOVER keep their existing tag):
  ```ts
        const tag = f.cellType[i] === CellType.SENSOR ? sensorLabel(net, i) : (TYPE_TAG[f.cellType[i]!] ?? '?');
        ctx.fillText(tag, px, py + 0.5);
  ```
  And extend the footer key (line 133):
  ```ts
      ctx.fillText('Sm smell  Si sight(F/Y/P)  He hear  N neuron  M mover   ·   − blue / + orange', 10, h - 8);
  ```

- [ ] **run-pass.** `pnpm exec vitest run src/app/brain-inspector.test.ts`
  Expected: all 4 `sensorLabel` cases green.

- [ ] **Typecheck the UI edit** (the canvas render path isn't unit-tested):
  ```
  pnpm exec tsc --noEmit
  ```
  Expected: no errors. (If `net` isn't in scope at the node-render line, confirm `const net = world.net;` at line 34 still precedes it — it does.)

- [ ] **commit.**
  ```
  git add src/app/brain-inspector.ts src/app/brain-inspector.test.ts && git commit -m "feat(app): brain-inspector sensor labels by senseSource (Phase 5)"
  ```

---

### Task 3 — Headless multi-seed long-run balance probe (the success-bar gate)

Extend `src/headless/feel-probe.ts` with a senses-ON validation mode that runs ≥5 seeds for 12k ticks with drift + sight + hearing ON, and prints the success-bar metrics: all 3 trophic levels >0 at 12k, a fed-creature lifespan estimate (target 10.8k–18k ticks @ 60/s), and the purposefulness delta vs the Phase-1 smell-only baseline (target ≥30% straighter path OR ≥30% faster time-to-food). This probe is the GATE — it produces the tuned numbers Task 4 wires into `main.ts`. It is a tuning instrument, not a unit test; it has no `make check` assertion, but it MUST compile and run.

**Files**
- **Modify** `src/headless/feel-probe.ts` — add a `senses` mode (gated on `argv[2] === 'senses'`) alongside the existing `flee`/`diag`/`full` modes (the `const mode = process.argv[2] ?? 'full';` dispatch at line 171). Reuse the existing `run()`, `spawn()`, `liveOrganisms()`, `BASE`, `LOCKED`, `PRED`.
- **Test:** none (headless tuning probe). Verified by RUNNING it.

**Interfaces**
- Consumes the existing `run(t: Trial, ticks: number, world1024: boolean): void` and `Trial` interface already defined in feel-probe.ts (fields: `name`, `plants`, `foragers`, `predators`, `o: Partial<Config>`, optional `predThrustMult`/`fwdThrustWeight`/`predReserveMult`).
- Consumes `defaultConfig`, `World`, `liveOrganisms(w)`, the `LOCKED`/`PRED` constants.
- Consumes the senses config knobs `driftAmplitude`, `loudnessGain`, `viewRange`, `viewHalfAngle` via `Trial.o`.
- Produces console output only (the tuning readout).

**Steps**

- [ ] **RED (executable-spec, not vitest).** A headless probe has no failing-test gate; instead the RED is "the mode doesn't exist yet, so running it falls through to `full`." Confirm:
  ```
  pnpm exec tsx src/headless/feel-probe.ts senses
  ```
  Expected (before impl): prints the `=== FULL validation ...` header (the `else` branch), NOT a senses header — proving the new mode isn't wired.

- [ ] **GREEN.** In `src/headless/feel-probe.ts`, add a `senses` branch to the mode dispatch. Insert it as a new `else if` BEFORE the final `else` (i.e. after the `} else if (mode === 'diag') {` block closes, before the final `} else {`):
  ```ts
  } else if (mode === 'senses') {
    // PHASE 5 SUCCESS-BAR GATE: drift + sight + hearing ON, ≥5 seeds, 12k ticks, 2048².
    // Reads off, per seed: all-3-coexist (ALL3 vs EXTINCT), predMax (predator layer breathes),
    // forMax. The lifespan + purposefulness deltas are read from the per-tick series + the
    // navigation baseline recorded in Phase 1 (env-feel-probe.ts); compare the straightness/
    // time-to-food printed here against that baseline by hand to confirm the ≥30% gate.
    // Senses knobs start at the Phase 2/3 profiled values and are the values Task 4 wires
    // into main.ts ONLY after this gate passes for ≥5 seeds.
    const SENSES: Partial<Config> = {
      driftAmplitude: 48, // light zones migrate slowly (profiled: zones stay smell-able from afar)
      loudnessGain: 0.5, // hearing deposit = loudnessGain·speed
      viewRange: 48, // R = ceil(48/8) = 6 — PROFILE in scaling-bench; lower to keep R ≤ 3-4 if hot
      viewHalfAngle: 0.6, // ~34° half-cone
    };
    console.log('=== SENSES gate: 2048² drift+sight+hearing, 12k ticks, seeds 3/7/42/99/123 ===');
    for (const seed of [3, 7, 42, 99, 123]) {
      run(
        {
          name: `senses s${seed}`,
          plants: 18000,
          foragers: 250,
          predators: 24,
          o: { ...LOCKED, ...SENSES, seed },
          ...PRED,
        },
        12000,
        false,
      );
    }
  ```
  (The trailing `} else {` for `full` immediately follows, unchanged.)

- [ ] **run (the actual tuning gate).** `pnpm exec tsx src/headless/feel-probe.ts senses`
  Expected: prints `=== SENSES gate ...` then five `senses s<seed>` lines. The PASS condition (read by eye, this is a tuning loop): every line ends `ALL3` (no `EXTINCT`), and `predMax` exceeds the seed count 24 on a majority of seeds (predator layer breeds, not subsistence). If any seed prints `EXTINCT PRED@...` or `EXTINCT FOR@...`, the balance is broken — adjust the senses knobs (lower `viewRange`/`loudnessGain` if a sense over-powers one side, per the design's balance-fragility risk) AND/OR the `LOCKED` economy, re-run, and iterate. NEVER weaken the gate; tune the knobs. Record the final passing `SENSES` knob values — they are the input to Task 4.

- [ ] **Profile the sight cost ceiling** (design mandates `R ≤ 3-4`). The chosen `viewRange: 48` gives `R = 6` at `cellSize 8` — verify it's within the cost budget, or drop it:
  ```
  pnpm exec tsx src/headless/scaling-bench.ts
  ```
  Expected: the per-tick cost with sight ON stays within the bench's existing ceiling. If the sight cone dominates, lower `viewRange` to 24–32 (R = 3–4) in the `SENSES` block and re-run the `senses` gate. Lock the largest `viewRange` that both (a) passes the gate and (b) keeps `R ≤ 4`.

- [ ] **commit** (the probe + the recorded numbers — commit even though there's no vitest gate, since the validated knob values are the deliverable feeding Task 4).
  ```
  git add src/headless/feel-probe.ts && git commit -m "feat(probe): senses-ON multi-seed 12k success-bar gate (Phase 5)"
  ```

---

### Task 4 — Wire the validated senses config into the live demo (LAST)

Only after Task 3's `senses` gate passes for ≥5 seeds, turn the senses ON in the live demo by adding the validated `driftAmplitude` / `loudnessGain` / `viewRange` / `viewHalfAngle` (and `senseSourceRate` if evolution-of-senses is wanted live) to the `defaultConfig({...})` call in `main.ts`. This is the only place senses become visible to the user; it lands last so `make check` stays green throughout and the change is a single reviewable flip.

**Files**
- **Modify** `src/app/main.ts` — add the senses knobs to the `defaultConfig({...})` override object (currently `src/app/main.ts:47-...`, e.g. after the existing `predFleeWeight: 1.0,` line at line 91, before the mutation block at line 92). Use the EXACT values Task 3 locked.
- **Test:** no new unit test — `make check` is the gate (it runs `reproducibility.test.ts`, which now includes the senses-ON case from Task 1, plus the full suite + typecheck/lint).

**Interfaces**
- Consumes `defaultConfig(overrides: Partial<Config>): Config` — the senses knobs are already valid fields.
- Consumes the validated numbers from Task 3's `SENSES` block.
- Produces the live-demo behavior change (senses ON in the browser sim). No core change.

**Steps**

- [ ] **Pre-check: baseline determinism still green BEFORE the edit** (so any later failure is attributable to this edit):
  ```
  make check
  ```
  Expected: green (Tasks 1–3 already committed; nothing in `main.ts` changed yet).

- [ ] **RED (config-flip has no unit test; the RED is the design contract).** There is no failing test to write — `main.ts` is the live wiring and is exercised by `make check` (lint + typecheck) and manual run, not vitest. The discipline here: do NOT touch `defaultConfig`'s defaults (those stay OFF for `reproducibility.test.ts`); only override them in `main.ts`'s call site.

- [ ] **GREEN.** In `src/app/main.ts`, inside the `defaultConfig({...})` object, after the `predFleeWeight: 1.0,` line (line 91), insert the validated senses block (replace the numbers with Task 3's locked values):
  ```ts
    // ── Senses ON (Phase 5, validated headlessly via feel-probe.ts `senses` mode across
    // seeds 3/7/42/99/123 @ 2048²/12k — all 3 trophic levels coexist, predator layer breeds,
    // navigation purposefulness ≥30% over the smell-only baseline). Defaults stay OFF so
    // reproducibility.test.ts's baseline is byte-identical; these are demo-only overrides.
    driftAmplitude: 48, // light food-zones migrate; creatures must follow
    loudnessGain: 0.5, // hearing: motion deposits into the NoiseField
    viewRange: 48, // sight cone range (R = ceil(viewRange/cellSize); profiled ≤ ceiling)
    viewHalfAngle: 0.6, // sight half-cone (~34°)
    senseSourceRate: 0.02, // evolution can acquire/swap sense modalities live (gated, senses-ON)
  ```

- [ ] **run-pass / gate.** `make check`
  Expected: green. The senses-ON + drift-ON `reproducibility.test.ts` case (Task 1) and the full suite pass; typecheck/lint clean. The default-config baseline blocks are unaffected because the senses knobs live ONLY in `main.ts`'s override, not in `defaultConfig`'s defaults.

- [ ] **Smoke-run the live demo** to confirm the senses are visibly ON and the brain inspector shows the new labels (this is the "see it in the real app" check the design's success bar requires). Use the project's run skill / dev server:
  ```
  pnpm dev
  ```
  Then open the browser, press `B` to open the brain inspector on a critter, and confirm SENSOR nodes show `Sm`/`Si:F`/`Si:Y`/`Si:P`/`He` tags (not bare `S`), and that food zones visibly drift. (Manual visual confirmation — no automated assertion.)

- [ ] **commit.**
  ```
  git add src/app/main.ts && git commit -m "feat(app): enable validated senses + drift in live demo (Phase 5)"
  ```

- [ ] **Phase close-out.** Final full gate:
  ```
  make check
  ```
  Expected: green. Phase 5 complete — senses-ON + drift-ON determinism pinned, brain inspector legible by `senseSource`, the multi-seed 12k success-bar gate committed, and the validated config live in the demo.

---
