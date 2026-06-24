# Identity-Bearing Scent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single identity-less pheromone scalar field with a 4-channel identity-bearing `ScentField` (role + hue signature) so predators evolve to follow prey-scent, prey to flee predator-scent, and lineages to cluster.

**Architecture:** A new `ScentField` composes 4 `PheroField` instances (reusing the proven diffuse/decay/gradient/hash mechanics). Every creature deposits its signature passively each tick — a projection of its `DIET` gene (channels 0/1) and `hue` (channels 2/3). Each channel's gradient is sensed per-creature and wired to 4 evolvable brain synapses (16 total, seeded 0). ON by default; determinism is the only invariant.

**Tech Stack:** TypeScript strict, data-oriented SoA core (`Float64Array`/`Float32Array`), Vitest.

## Global Constraints

- Determinism is the ONLY invariant: same `(config, seed)` → byte-identical run-to-run (`world.test.ts`). RNG drawn ONLY at reproduction; the hot loop (deposit/diffuse/decay/sense) is RNG-free, ascending live-slot order.
- On-by-default policy (`feature-default-on-policy.md`): new behavior defaults ON; keep an ablation toggle (`scentIdentity`); add a same-`(config,seed)`→same-hash test + a headless liveness guardrail. Do NOT write a byte-identical-when-off test for the new identity behavior, and do NOT add RNG-draw-skip gating for it.
- `SCENT_CHANNELS = 4`, channel order: `PREY=0, PRED=1, SIG_COS=2, SIG_SIN=3`.
- Run tests with `NODE_OPTIONS=--expose-gc npx vitest run <path>`. Typecheck `npx tsc --noEmit`. Lint `npx eslint <path>`. `make` fails in a worktree — run npx directly.
- Commit hook BLOCKS the `Co-Authored-By` trailer — omit it.
- Bead: `life-sim-zaz2`. `bd update life-sim-zaz2 --status=in_progress` at start; `bd close` + `bd sync --flush-only` at end.

---

## File Map

| File | Responsibility | Action |
|------|----------------|--------|
| `src/core/scent-field.ts` | `ScentField` wrapping 4 `PheroField`; deposit-split, step, gradients, hash, render | Create |
| `src/core/scent-field.test.ts` | Unit tests for the above | Create |
| `src/core/store.ts` | `scentSenseX/Y` buffers (`capacity·SCENT_CHANNELS`) | Modify |
| `src/core/genome.ts` | 16 phero brain synapses (idx 20–35), `BRAIN_GENES=36`, founder, gating | Modify |
| `src/core/sense.ts` | `senseEnv` writes N channel gradients | Modify |
| `src/core/brain.ts` | `steer` wires 16 phero synapses (loop over channels) | Modify |
| `src/core/economy.ts` | remove on-graze/alarm deposit; add `depositScent` per-tick pass | Modify |
| `src/core/world.ts` | `scent: ScentField \| null`; alloc/deposit/step/hash/reset | Modify |
| `src/core/config.ts` | add `pheroDepositStrength`, `scentIdentity`; remove `pheroGrazeStrength`, `pheroDepositOnGraze`, `pheroAlarmStrength` | Modify |
| `src/app/main.ts` | demo `scentIdentity:true`; `world.scent` overlay → channel 0 | Modify |
| `src/core/world.phero.test.ts` | rewrite for the new deposit model + multi-channel | Modify |
| `src/headless/life-history.ts` | DEMO_OVERRIDES sync (remove dropped knobs) | Modify |

`PheroField` (`phero-field.ts`) is reused UNCHANGED — its tests stay green.

---

## Task 1: `ScentField` core (N-generic, wraps 4 × PheroField)

**Files:**
- Create: `src/core/scent-field.ts`
- Test: `src/core/scent-field.test.ts`

**Interfaces:**
- Consumes: `PheroField` from `./phero-field` (existing: `deposit`, `step`, `gradientAt`, `total`, `max`, `reset`, `fillTexture`, `hashInto`).
- Produces:
  - `export const SCENT_CHANNELS = 4;`
  - `export const Scent = { PREY: 0, PRED: 1, SIG_COS: 2, SIG_SIN: 3 } as const;`
  - `class ScentField` with:
    - `constructor(worldWidth, worldHeight, cols, rows)`
    - `deposit(x: number, y: number, diet: number, hue: number, amount: number, identity: boolean): void`
    - `stepAll(diffuse: number, decay: number, blocked: Uint8Array | null): void`
    - `gradientsInto(x: number, y: number, step: number, outX: Float64Array, outY: Float64Array, base: number): void`
    - `channel(c: number): PheroField`
    - `reset(): void`
    - `hashInto(h: { f: (v: number) => void }): void`
    - `fillTexture(c: number, out: Uint8Array): void`

- [ ] **Step 1: Write the failing test** — `src/core/scent-field.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { ScentField, SCENT_CHANNELS, Scent } from './scent-field';

const mk = (): ScentField => new ScentField(1000, 1000, 50, 50);

describe('ScentField', () => {
  it('identity deposit splits by diet (role) and hue (signature)', () => {
    const f = mk();
    // pure grazer (diet 0), hue 0 → cos=1, sin=0
    f.deposit(500, 500, 0, 0, 10, true);
    expect(f.channel(Scent.PREY).sampleAt(500, 500)).toBeCloseTo(10); // 10·(1−0)
    expect(f.channel(Scent.PRED).sampleAt(500, 500)).toBeCloseTo(0); //  10·0
    expect(f.channel(Scent.SIG_COS).sampleAt(500, 500)).toBeCloseTo(10); // 10·(0.5+0.5·1)
    expect(f.channel(Scent.SIG_SIN).sampleAt(500, 500)).toBeCloseTo(5); //  10·(0.5+0.5·0)
  });

  it('pure hunter (diet 1) deposits into PRED, not PREY', () => {
    const f = mk();
    f.deposit(500, 500, 1, 0, 10, true);
    expect(f.channel(Scent.PREY).sampleAt(500, 500)).toBeCloseTo(0);
    expect(f.channel(Scent.PRED).sampleAt(500, 500)).toBeCloseTo(10);
  });

  it('identity-blind (false) deposits amount equally into all channels', () => {
    const f = mk();
    f.deposit(500, 500, 0.3, 0.7, 8, false);
    for (let c = 0; c < SCENT_CHANNELS; c++) {
      expect(f.channel(c).sampleAt(500, 500)).toBeCloseTo(8);
    }
  });

  it('gradientsInto writes a (gx,gy) per channel at base offset', () => {
    const f = mk();
    // deposit a blob to the +x side so PREY has a gradient there
    f.deposit(600, 500, 0, 0, 100, true);
    const gx = new Float64Array(SCENT_CHANNELS);
    const gy = new Float64Array(SCENT_CHANNELS);
    f.gradientsInto(560, 500, 20, gx, gy, 0);
    expect(gx[Scent.PREY]).toBeGreaterThan(0); // gradient points toward the blob (+x)
    expect(gx[Scent.PRED]).toBe(0); // PRED channel empty → flat
  });

  it('stepAll + hashInto are deterministic across two identical runs', () => {
    const run = (): number[] => {
      const f = mk();
      f.deposit(500, 500, 0.4, 0.6, 5, true);
      f.deposit(520, 500, 0.4, 0.6, 5, true);
      f.stepAll(0.2, 0.02, null);
      const acc: number[] = [];
      f.hashInto({ f: (v) => acc.push(v) });
      return acc;
    };
    expect(run()).toEqual(run());
  });

  it('reset clears every channel', () => {
    const f = mk();
    f.deposit(500, 500, 0.5, 0.5, 9, true);
    f.reset();
    for (let c = 0; c < SCENT_CHANNELS; c++) expect(f.channel(c).total()).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `NODE_OPTIONS=--expose-gc npx vitest run src/core/scent-field.test.ts`
Expected: FAIL — `Cannot find module './scent-field'`.

- [ ] **Step 3: Write the implementation** — `src/core/scent-field.ts`

```typescript
/**
 * Identity-bearing scent: a FIXED-N bank of diffusing scalar PheroFields. Each creature deposits a
 * low-dimensional "signature" — a projection of its genetic makeup — across the channels:
 *
 *   ch0 PREY    ∝ (1 − diet)           grazers smell edible → predators evolve to climb it (follow prey)
 *   ch1 PRED    ∝ diet                 hunters smell dangerous → prey evolve to descend it (flee predators)
 *   ch2 SIG_COS ∝ 0.5 + 0.5·cos(2πh)   hue projected onto a 2-D compass → lineages climb their own
 *   ch3 SIG_SIN ∝ 0.5 + 0.5·sin(2πh)   hue-mix → kin/species clustering (emergent at the lineage level)
 *
 * NOT per-creature (that is infeasible: thousands of creatures × a grid each). N small & fixed gives the
 * same emergent behavior at fixed cost. Each channel reuses PheroField's toroidal diffuse / multiplicative
 * decay / central-difference gradient / wall no-flux / deterministic hash VERBATIM. RNG-free throughout
 * (deposit split is pure arithmetic; field updates are pure). Diffuse/decay are shared across channels.
 *
 * `identity=false` (the ablation) deposits `amount` equally into all channels: the field still lives and
 * diffuses, but carries no role/kin information (every channel identical → gradients identical → no
 * follow/flee/cluster can emerge). Same cost, gene layout, and determinism — it isolates the INFORMATION.
 */
import { PheroField } from './phero-field';

export const SCENT_CHANNELS = 4;
export const Scent = { PREY: 0, PRED: 1, SIG_COS: 2, SIG_SIN: 3 } as const;

const TWO_PI = Math.PI * 2;

export class ScentField {
  private readonly ch: PheroField[];

  constructor(worldWidth: number, worldHeight: number, cols: number, rows: number) {
    this.ch = [];
    for (let c = 0; c < SCENT_CHANNELS; c++) {
      this.ch.push(new PheroField(worldWidth, worldHeight, cols, rows));
    }
  }

  channel(c: number): PheroField {
    return this.ch[c]!;
  }

  /** Deposit a creature's signature. identity=true → split by diet/hue; false → equal into all channels. */
  deposit(x: number, y: number, diet: number, hue: number, amount: number, identity: boolean): void {
    if (amount <= 0) return;
    if (!identity) {
      for (let c = 0; c < SCENT_CHANNELS; c++) this.ch[c]!.deposit(x, y, amount);
      return;
    }
    const a = hue * TWO_PI;
    this.ch[Scent.PREY]!.deposit(x, y, amount * (1 - diet));
    this.ch[Scent.PRED]!.deposit(x, y, amount * diet);
    this.ch[Scent.SIG_COS]!.deposit(x, y, amount * (0.5 + 0.5 * Math.cos(a)));
    this.ch[Scent.SIG_SIN]!.deposit(x, y, amount * (0.5 + 0.5 * Math.sin(a)));
  }

  stepAll(diffuse: number, decay: number, blocked: Uint8Array | null): void {
    for (let c = 0; c < SCENT_CHANNELS; c++) this.ch[c]!.step(diffuse, decay, blocked);
  }

  /** Write each channel's world-frame gradient into outX[base+c]/outY[base+c]. */
  gradientsInto(
    x: number,
    y: number,
    step: number,
    outX: Float64Array,
    outY: Float64Array,
    base: number,
  ): void {
    for (let c = 0; c < SCENT_CHANNELS; c++) {
      const g = this.ch[c]!.gradientAt(x, y, step);
      outX[base + c] = g.gx;
      outY[base + c] = g.gy;
    }
  }

  reset(): void {
    for (let c = 0; c < SCENT_CHANNELS; c++) this.ch[c]!.reset();
  }

  /** Hash all channels in channel order (the scent is sim state when active). */
  hashInto(h: { f: (v: number) => void }): void {
    for (let c = 0; c < SCENT_CHANNELS; c++) this.ch[c]!.hashInto(h);
  }

  fillTexture(c: number, out: Uint8Array): void {
    this.ch[c]!.fillTexture(out);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `NODE_OPTIONS=--expose-gc npx vitest run src/core/scent-field.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Typecheck + lint**

Run: `npx tsc --noEmit && npx eslint src/core/scent-field.ts src/core/scent-field.test.ts`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/core/scent-field.ts src/core/scent-field.test.ts
git commit -m "feat(scent): ScentField — 4-channel identity-bearing scent (role + hue signature)"
```

---

## Task 2: Brain gene layout — 16 phero synapses

**Files:**
- Modify: `src/core/genome.ts` (`Brain` enum 20–35, `BRAIN_GENES`, `FOUNDER_BRAIN`, `seedGenome`/`mutateGenome` gating ranges)
- Modify: `src/core/genome.test.ts` (BRAIN_GENES assertion if present), `src/core/brain.test.ts` (if it references PHERO indices)
- Test: covered by `genome.test.ts` + Task 3's brain tests

**Interfaces:**
- Produces: `Brain.PHERO_C0_LAT_TURN=20 … PHERO_C3_FWD_THRUST=35`; `BRAIN_GENES = 36`. Per-channel base = `Brain.PHERO_C0_LAT_TURN + c*4`; offsets `+0 lat_turn, +1 fwd_turn, +2 lat_thrust, +3 fwd_thrust`.

- [ ] **Step 1: Update the `Brain` enum** (`genome.ts`, replace the 4 `PHERO_*` entries at 20–23)

```typescript
  // F2 identity-bearing scent: 4 channels × (lat/fwd × turn/thrust) = 16 synapses. The per-channel
  // gradient ∇P_c (lateral, forward) in the heading frame → turn + thrust. Gated on pheroSenseGenes; seed
  // at 0 so evolution picks each channel's SIGN — climb prey-scent / descend predator-scent / cluster on
  // kin-hue. Kept LAST so each gated block draws RNG only when on. Per-channel base = PHERO_C0_LAT_TURN+c*4.
  PHERO_C0_LAT_TURN: 20,
  PHERO_C0_FWD_TURN: 21,
  PHERO_C0_LAT_THRUST: 22,
  PHERO_C0_FWD_THRUST: 23,
  PHERO_C1_LAT_TURN: 24,
  PHERO_C1_FWD_TURN: 25,
  PHERO_C1_LAT_THRUST: 26,
  PHERO_C1_FWD_THRUST: 27,
  PHERO_C2_LAT_TURN: 28,
  PHERO_C2_FWD_TURN: 29,
  PHERO_C2_LAT_THRUST: 30,
  PHERO_C2_FWD_THRUST: 31,
  PHERO_C3_LAT_TURN: 32,
  PHERO_C3_FWD_TURN: 33,
  PHERO_C3_LAT_THRUST: 34,
  PHERO_C3_FWD_THRUST: 35,
} as const;
```

- [ ] **Step 2: Update constants + founder** (`genome.ts`)

`BRAIN_CORE_GENES` stays `10`. Change:
```typescript
export const BRAIN_GENES = 36;
```
`FOUNDER_BRAIN` — extend the trailing phero zeros from 4 to 16 (array length 36):
```typescript
const FOUNDER_BRAIN: readonly number[] = [
  1.2, 0, 0, 1.5, 0, 0.3, 1.0, 0, 0, 1.2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0,
];
```
Update the doc comment listing the layout to end with the 16 `PHERO_Cx_*` names; note "The 16 phero weights seed at 0."

- [ ] **Step 3: Widen the `isPhero` gate range** (`genome.ts`, BOTH `seedGenome` and `mutateGenome`)

In each, replace:
```typescript
    const isPhero = g >= Brain.PHERO_LAT_TURN && g <= Brain.PHERO_FWD_THRUST;
```
with:
```typescript
    const isPhero = g >= Brain.PHERO_C0_LAT_TURN && g <= Brain.PHERO_C3_FWD_THRUST;
```

- [ ] **Step 4: Update any test pinning `BRAIN_GENES`/PHERO indices**

Run: `NODE_OPTIONS=--expose-gc npx vitest run src/core/genome.test.ts src/core/brain.test.ts`
If a test references `Brain.PHERO_LAT_TURN` or asserts `BRAIN_GENES === 24`, update it to the new names/`36`. (Search: `grep -rn "PHERO_LAT_TURN\|PHERO_FWD\|BRAIN_GENES" src` and fix references in test files only — non-test usages are handled in Tasks 3/5.)
Expected after fixes: those test files compile (they may still fail until Task 3 wires `steer` — that's fine; do NOT run the whole suite yet).

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit 2>&1 | grep -E "brain|genome|store|sense|world|economy" | head`
Expected: only the call-site errors in `brain.ts`/`sense.ts`/`store.ts`/`world.ts`/`economy.ts` that Tasks 3–5 fix (the enum/const change compiles in isolation). Note them; do not fix here.

- [ ] **Step 6: Commit**

```bash
git add src/core/genome.ts src/core/genome.test.ts src/core/brain.test.ts
git commit -m "feat(scent): expand brain genome to 16 phero synapses (4 channels), BRAIN_GENES 36"
```

---

## Task 3: Store buffers + sense + brain wiring

**Files:**
- Modify: `src/core/store.ts` (`scentSenseX/Y` sized `capacity·SCENT_CHANNELS`, replacing `pheroSenseX/Y`)
- Modify: `src/core/sense.ts` (`senseEnv` writes N channel gradients via `ScentField`)
- Modify: `src/core/brain.ts` (`steer` reads `scentSenseX/Y`, loops 4 channels → 16 synapses + elig)
- Modify: `src/core/store.test.ts`, `src/core/sense.test.ts` as needed
- Test: `src/core/sense.test.ts` (gradient written per channel)

**Interfaces:**
- Consumes: `ScentField` (Task 1), `SCENT_CHANNELS`, `Brain.PHERO_C0_LAT_TURN` (Task 2).
- Produces: `store.scentSenseX`, `store.scentSenseY` (`Float64Array(capacity·SCENT_CHANNELS)`, index `i·SCENT_CHANNELS + c`). `senseEnv(store, walls, flow, scent: ScentField | null, cfg)`.

- [ ] **Step 1: Store buffers** (`store.ts`)

Replace fields (lines ~48–49) and allocation (lines ~101–102):
```typescript
  readonly scentSenseX: Float64Array;
  readonly scentSenseY: Float64Array;
```
```typescript
    this.scentSenseX = new Float64Array(capacity * SCENT_CHANNELS);
    this.scentSenseY = new Float64Array(capacity * SCENT_CHANNELS);
```
Add the import: `import { SCENT_CHANNELS } from './scent-field';`. If `store.test.ts` asserts buffer lengths for the old names, update to the new names/length.

- [ ] **Step 2: Write the failing sense test** (`sense.test.ts`)

Add a test: build a `ScentField`, deposit a PREY blob at +x of a creature, call `senseEnv`, assert `store.scentSenseX[i*SCENT_CHANNELS + Scent.PREY] > 0` and the PRED channel is 0.

```typescript
import { ScentField, SCENT_CHANNELS, Scent } from './scent-field';
// ... inside describe:
it('senseEnv writes per-channel scent gradients', () => {
  const store = new OrganismStore(4);
  const i = store.alloc();
  store.rebuildLive();
  store.x[i] = 500; store.y[i] = 500;
  store.scalarGenes[i * SCALAR_GENE_COUNT + ScalarGene.SENSE_RANGE] = 20;
  const scent = new ScentField(1000, 1000, 50, 50);
  scent.deposit(560, 500, 0, 0, 100, true); // PREY blob to the +x
  senseEnv(store, null, null, scent, defaultConfig({ pheromoneEnabled: true }));
  expect(store.scentSenseX[i * SCENT_CHANNELS + Scent.PREY]!).toBeGreaterThan(0);
  expect(store.scentSenseX[i * SCENT_CHANNELS + Scent.PRED]!).toBe(0);
});
```

- [ ] **Step 3: Run it — fails to compile** (`senseEnv` still takes `PheroField`)

Run: `NODE_OPTIONS=--expose-gc npx vitest run src/core/sense.test.ts`
Expected: FAIL (type error / wrong gradient).

- [ ] **Step 4: Rewrite `senseEnv`'s phero block** (`sense.ts`)

Change the signature param `phero: PheroField | null` → `scent: ScentField | null` (update the import to `./scent-field`). Replace the destructure `pheroSenseX, pheroSenseY` → `scentSenseX, scentSenseY` and the phero branch (lines ~149–157):
```typescript
    if (scent !== null) {
      const step = scalarGenes[i * SCALAR_GENE_COUNT + ScalarGene.SENSE_RANGE]!;
      scent.gradientsInto(x[i]!, y[i]!, step, scentSenseX, scentSenseY, i * SCENT_CHANNELS);
    } else {
      const b = i * SCENT_CHANNELS;
      for (let c = 0; c < SCENT_CHANNELS; c++) {
        scentSenseX[b + c] = 0;
        scentSenseY[b + c] = 0;
      }
    }
```
Add `import { ScentField, SCENT_CHANNELS } from './scent-field';`.

- [ ] **Step 5: Run the sense test — passes**

Run: `NODE_OPTIONS=--expose-gc npx vitest run src/core/sense.test.ts`
Expected: PASS.

- [ ] **Step 6: Wire `steer`** (`brain.ts`)

Replace the destructure `pheroSenseX, pheroSenseY` → `scentSenseX, scentSenseY` and import `SCENT_CHANNELS, Brain` (Brain already imported). Replace the single-channel pFwd/pLat block (lines ~96–99) and the 4 `Brain.PHERO_*` terms in `turnRaw`/`thrustRaw` and the 4 elig lines with a per-channel loop. Concretely:

Delete lines 96–99 (`pheroVx … pLat`). In `turnRaw`, remove the two `learnedBrain[b + Brain.PHERO_*_TURN]! * pFwd/pLat` lines; same for the two in `thrustRaw`. After `thrustRaw` is assigned (before the hunger block), insert:
```typescript
    // F2 scent: each channel's gradient (heading frame) on its own 4 synapses. Loop is N-generic.
    const sb = i * SCENT_CHANNELS;
    for (let c = 0; c < SCENT_CHANNELS; c++) {
      const cvx = scentSenseX[sb + c]!;
      const cvy = scentSenseY[sb + c]!;
      const cFwd = cvx * dx + cvy * dy;
      const cLat = -cvx * dy + cvy * dx;
      const pb = b + Brain.PHERO_C0_LAT_TURN + c * 4;
      turnRaw += learnedBrain[pb]! * cLat + learnedBrain[pb + 1]! * cFwd;
      thrustRaw += learnedBrain[pb + 2]! * cLat + learnedBrain[pb + 3]! * cFwd;
    }
```
Then in the learning block, delete the 4 old `elig[b + Brain.PHERO_*]` lines and insert a matching loop (recomputing cFwd/cLat, or hoist them — recompute is simplest and cheap):
```typescript
    for (let c = 0; c < SCENT_CHANNELS; c++) {
      const cvx = scentSenseX[sb + c]!;
      const cvy = scentSenseY[sb + c]!;
      const cFwd = cvx * dx + cvy * dy;
      const cLat = -cvx * dy + cvy * dx;
      const pb = b + Brain.PHERO_C0_LAT_TURN + c * 4;
      elig[pb] = keep * elig[pb]! + eligLambda * cLat * turnRaw;
      elig[pb + 1] = keep * elig[pb + 1]! + eligLambda * cFwd * turnRaw;
      elig[pb + 2] = keep * elig[pb + 2]! + eligLambda * cLat * thrustRaw;
      elig[pb + 3] = keep * elig[pb + 3]! + eligLambda * cFwd * thrustRaw;
    }
```
(`sb` is in scope for both loops since both are inside the per-creature `for k` body.)

- [ ] **Step 7: Typecheck**

Run: `npx tsc --noEmit 2>&1 | grep -E "store|sense|brain" | head`
Expected: clean for these files (world/economy call-sites still pending Tasks 4/5).

- [ ] **Step 8: Commit**

```bash
git add src/core/store.ts src/core/sense.ts src/core/brain.ts src/core/store.test.ts src/core/sense.test.ts
git commit -m "feat(scent): per-channel scent sense buffers + 16-synapse brain wiring"
```

---

## Task 4: Config knobs (add `pheroDepositStrength`, `scentIdentity`; drop old deposit knobs)

**Files:**
- Modify: `src/core/config.ts` (interface + `defaultConfig`)
- Modify: `src/core/config.test.ts` (if it asserts the dropped knobs)

**Interfaces:**
- Produces: `cfg.pheroDepositStrength: number`, `cfg.scentIdentity: boolean`. Removes `cfg.pheroGrazeStrength`, `cfg.pheroDepositOnGraze`, `cfg.pheroAlarmStrength`.

- [ ] **Step 1: Edit the `Config` interface** (`config.ts`, the F2 block ~299–319)

Remove the three dropped fields. Add:
```typescript
  /** Per-tick passive deposit scale: every live creature broadcasts PHERO_DEPOSIT_gene·pheroDepositStrength
   *  of its signature each tick. The continuous trail (vs on-graze) so predators — who hunt, not graze —
   *  also lay scent. Lower it / raise pheroDecay if the field saturates. */
  pheroDepositStrength: number;
  /** Identity ablation: true → deposit splits by diet (role) + hue (signature); false → equal into all
   *  channels (field alive but information-free). The toggle that isolates the feature's effect. */
  scentIdentity: boolean;
```

- [ ] **Step 2: Edit `defaultConfig`** (`config.ts`, ~609–617)

Remove `pheroGrazeStrength`, `pheroDepositOnGraze`, `pheroAlarmStrength`. Add (keep `pheromoneEnabled:false` default — it's the existing master switch; the demo turns it on):
```typescript
    pheroDepositStrength: 0.1, // per-tick passive deposit; ×4 channels ×live creatures, so kept small
    scentIdentity: true, // identity-bearing by default (on-by-default policy)
```

- [ ] **Step 3: Update `config.test.ts`** if it references the dropped keys.

Run: `NODE_OPTIONS=--expose-gc npx vitest run src/core/config.test.ts`
Expected: PASS after removing dropped-key assertions.

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit 2>&1 | grep -E "config|economy|world|main" | head`
Expected: remaining errors are the `economy.ts`/`world.ts`/`main.ts` references to the dropped/renamed knobs — fixed in Task 5.

- [ ] **Step 5: Commit**

```bash
git add src/core/config.ts src/core/config.test.ts
git commit -m "feat(scent): config — pheroDepositStrength + scentIdentity; drop on-graze/alarm knobs"
```

---

## Task 5: World integration — per-tick deposit, ScentField alloc/step/hash

**Files:**
- Modify: `src/core/world.ts` (`scent: ScentField | null`, construct/reset/step/hash; pass `scent` to `senseEnv`; remove `phero` from `metabolize`/`hunt` calls)
- Modify: `src/core/economy.ts` (remove on-graze deposit in `metabolize` + alarm deposit in `hunt`; add `depositScent`)
- Test: `src/core/world.phero.test.ts` (rewritten — Task 6)

**Interfaces:**
- Consumes: `ScentField` (Task 1), `cfg.pheroDepositStrength`, `cfg.scentIdentity` (Task 4).
- Produces: `world.scent: ScentField | null`; `depositScent(store, scent: ScentField, cfg): void` exported from `economy.ts`.

- [ ] **Step 1: Strip phero deposit from `economy.ts`**

In `metabolize`, delete the on-graze deposit block (lines ~233–240, the `if (phero !== null && cfg.pheroDepositOnGraze …)`). Remove the `phero: PheroField | null` param from `metabolize` and the `PheroField` import usage there. In `hunt`, delete the alarm-on-bite block (lines ~117–123) and remove its `phero` param. Remove the `PheroField` import if now unused.

- [ ] **Step 2: Add `depositScent`** (`economy.ts`)

```typescript
import { ScentField } from './scent-field';

/**
 * Per-tick passive scent deposit: every live creature broadcasts its signature (a projection of its DIET
 * gene + hue) into the field, scaled by its PHERO_DEPOSIT gene × pheroDepositStrength. Ascending live-slot,
 * RNG-free. The continuous trail (vs on-graze) so predators — who gain via hunt, not graze — also lay scent.
 */
export function depositScent(store: OrganismStore, scent: ScentField, cfg: Config): void {
  const { liveIndices, liveCount, x, y, hue, scalarGenes } = store;
  const strength = cfg.pheroDepositStrength;
  const identity = cfg.scentIdentity;
  for (let k = 0; k < liveCount; k++) {
    const i = liveIndices[k]!;
    const sg = i * SCALAR_GENE_COUNT;
    const amount = scalarGenes[sg + ScalarGene.PHERO_DEPOSIT]! * strength;
    if (amount <= 0) continue;
    const diet = scalarGenes[sg + ScalarGene.DIET]!;
    scent.deposit(x[i]!, y[i]!, diet, hue[i]!, amount, identity);
  }
}
```

- [ ] **Step 3: Update `world.ts`**

- Import: `import { ScentField } from './scent-field';` (drop `PheroField`), and `depositScent` from `./economy`.
- Field: `readonly scent: ScentField | null;` (rename from `phero`).
- Construct (lines ~99–101):
```typescript
    this.scent = config.pheromoneEnabled
      ? new ScentField(config.worldWidth, config.worldHeight, config.foodCols, config.foodRows)
      : null;
```
- `senseEnv(s, this.walls, …, this.scent, cfg);` (rename arg).
- `hunt(s, this.hash, cfg);` and `metabolize(s, this.food, this.hash, cfg);` (drop the phero arg).
- After `s.rebuildLive()` and BEFORE `this.food.step(...)`, add the deposit + step (replacing the old `this.phero.step` block ~313–317):
```typescript
    // SCENT: every live creature lays its signature (post-move positions), then the field diffuses+forgets.
    if (this.scent !== null) {
      depositScent(s, this.scent, cfg);
      this.scent.stepAll(
        cfg.pheroDiffuse,
        cfg.pheroDecay,
        this.walls.active ? this.walls.foodBlockedMask() : null,
      );
    }
```
- `reset()`: `if (this.scent !== null) this.scent.reset();`
- `hashInto`/`stateHash`: `if (this.scent !== null) this.scent.hashInto(h);`

- [ ] **Step 4: Typecheck the whole core**

Run: `npx tsc --noEmit`
Expected: clean (or only `main.ts`/`life-history.ts` errors → Task 7).

- [ ] **Step 5: Run the core suite except the phero test (rewritten next)**

Run: `NODE_OPTIONS=--expose-gc npx vitest run src/core --exclude '**/world.phero.test.ts'`
Expected: PASS (determinism `world.test.ts` green — the scent is hashed deterministically).

- [ ] **Step 6: Commit**

```bash
git add src/core/world.ts src/core/economy.ts
git commit -m "feat(scent): per-tick passive deposit + ScentField alloc/step/hash in World"
```

---

## Task 6: Rewrite `world.phero.test.ts` — determinism + liveness + non-vacuity

**Files:**
- Modify: `src/core/world.phero.test.ts` (full rewrite for the new model)

**Interfaces:** Consumes `world.scent`, `ScentField`, `Scent`, `depositScent`.

- [ ] **Step 1: Replace the file** with the new-model tests

```typescript
import { describe, it, expect } from 'vitest';
import { World } from './world';
import { defaultConfig } from './config';
import { Scent, SCENT_CHANNELS } from './scent-field';

/**
 * Identity-bearing scent — determinism (the ONLY invariant), non-vacuity (the field populates), the
 * identity-vs-blind ablation diverges, and a liveness guardrail (on-by-default must not ship a dead world).
 * A smaller, denser world so the passive deposit populates the field within a short run.
 */
const SMALL = {
  seed: 7,
  worldWidth: 2048,
  worldHeight: 2048,
  foodCols: 64,
  foodRows: 64,
  initialPopulation: 200,
  pheromoneEnabled: true,
};

describe('World — identity-bearing scent', () => {
  it('ON path is deterministic (same config+seed → byte-identical)', () => {
    const a = new World(defaultConfig({ ...SMALL }));
    const b = new World(defaultConfig({ ...SMALL }));
    for (let t = 0; t < 200; t++) { a.step(); b.step(); }
    expect(a.stateHash()).toBe(b.stateHash());
  });

  it('field populates (non-vacuity): every channel has signal after a run', () => {
    const w = new World(defaultConfig({ ...SMALL }));
    for (let t = 0; t < 300; t++) w.step();
    expect(w.scent).not.toBeNull();
    let any = 0;
    for (let c = 0; c < SCENT_CHANNELS; c++) any += w.scent!.channel(c).total();
    expect(any).toBeGreaterThan(0);
    // PREY channel (grazers are the majority) must carry signal.
    expect(w.scent!.channel(Scent.PREY).total()).toBeGreaterThan(0);
  });

  it('identity vs identity-blind diverge (the information matters)', () => {
    const id = new World(defaultConfig({ ...SMALL, scentIdentity: true }));
    const blind = new World(defaultConfig({ ...SMALL, scentIdentity: false }));
    for (let t = 0; t < 300; t++) { id.step(); blind.step(); }
    expect(id.stateHash()).not.toBe(blind.stateHash());
  });

  it('LIVENESS guardrail: world stays alive + breeding at 2000 ticks with scent on', () => {
    const w = new World(defaultConfig({ ...SMALL }));
    for (let t = 0; t < 2000; t++) w.step();
    w.store.rebuildLive();
    expect(w.store.liveCount).toBeGreaterThan(10); // not collapsed/extinct
    expect(w.totalBirths).toBeGreaterThan(0); // reproduction occurred
  });
});
```

- [ ] **Step 2: Run it**

Run: `NODE_OPTIONS=--expose-gc npx vitest run src/core/world.phero.test.ts`
Expected: PASS (4 tests). If liveness fails (population floor / births), tune `pheroDepositStrength` down or `pheroDecay` up in the SMALL config and note it — the world must survive on-by-default. Do NOT weaken the determinism test.

- [ ] **Step 3: Full core suite**

Run: `NODE_OPTIONS=--expose-gc npx vitest run src/core`
Expected: all green.

- [ ] **Step 4: Commit**

```bash
git add src/core/world.phero.test.ts
git commit -m "test(scent): determinism + non-vacuity + ablation + liveness for identity-bearing scent"
```

---

## Task 7: Demo + render wiring + full suite

**Files:**
- Modify: `src/app/main.ts` (demo config `scentIdentity:true`; `world.phero` → `world.scent`; pheromone overlay → channel 0)
- Modify: `src/headless/life-history.ts` (DEMO_OVERRIDES: drop removed knobs, mirror demo)

**Interfaces:** Consumes `world.scent`, `ScentField.fillTexture(c, out)`, `Scent.PREY`.

- [ ] **Step 1: Demo config** (`main.ts`)

Keep `pheromoneEnabled: true`. Remove any `pheroGrazeStrength`/`pheroDepositOnGraze`/`pheroAlarmStrength` from the demo config; add `scentIdentity: true` and (if tuning needed) `pheroDepositStrength`. 

- [ ] **Step 2: Render overlay** (`main.ts`)

Update `if (world.phero) ring.push(FoodLayer.PHEROMONE)` → `world.scent`, and the overlay fill call (`world.phero` at ~492) → `world.scent.fillTexture(Scent.PREY, out)` (import `Scent`). The PHEROMONE layer shows the PREY channel for V1; richer multi-channel viz is a follow-up.

- [ ] **Step 3: `life-history.ts` DEMO_OVERRIDES**

Mirror the demo: remove dropped knobs, ensure `pheromoneEnabled:true`, `scentIdentity:true`.

- [ ] **Step 4: Typecheck + lint + FULL suite**

Run: `npx tsc --noEmit && npx eslint src && NODE_OPTIONS=--expose-gc npx vitest run`
Expected: clean typecheck/lint; all tests green (≥ 313 + the new scent tests).

- [ ] **Step 5: Build**

Run: `npm run build`
Expected: success.

- [ ] **Step 6: Commit**

```bash
git add src/app/main.ts src/headless/life-history.ts
git commit -m "feat(scent): wire identity-bearing scent into the live demo + render overlay"
```

---

## Task 8: Measure — does behavior emerge?

**Files:** none (probe + report only).

- [ ] **Step 1: Run the multi-seed demo probe**

Run: `npx tsx src/headless/life-history.ts 6000 4 50 --demo`
Capture the per-creature + gene-drift output.

- [ ] **Step 2: Analyze the three success criteria** (with file:line evidence)

1. **Follow-prey / flee-predator:** does the PREY-channel forward-thrust synapse (`Brain.PHERO_C0_FWD_THRUST`) correlate positively with `DIET` (predators climb prey-scent), and the PRED-channel forward-thrust (`Brain.PHERO_C1_FWD_THRUST`) negatively for low-diet creatures (prey flee)? Report the synapse-sign-by-diet split. If `life-history.ts` doesn't already surface phero synapses, add a read-only census of the 16 weights grouped by diet bin (no sim-core change).
2. **Kin/species clustering:** are signature-channel sense-weights more similar within a lineage than between? Compare against a `scentIdentity:false` control run.
3. **Liveness:** population alive across all 4 seeds.

- [ ] **Step 3: Write the findings** to the bead and a short report; update memory (`reflect`).

- [ ] **Step 4: Close out**

```bash
bd close life-sim-zaz2 --reason="identity-bearing 4-channel scent shipped + measured"
bd sync --flush-only
```

---

## Self-Review

**Spec coverage:**
- 4-channel hybrid (role + hue signature) → Task 1. ✓
- Zero new scalar genes (reuse DIET + hue) → Task 5 `depositScent`. ✓
- Passive per-tick deposit (predators deposit) → Task 5. ✓
- `ScentField` wraps N PheroField → Task 1. ✓
- 16 brain synapses, BRAIN_GENES 36, seeded 0, NN-ready input block → Tasks 2–3. ✓
- Per-channel sense gradients → Task 3. ✓
- Toggle (`scentIdentity`) + on-by-default → Task 4; demo → Task 7. ✓
- Determinism test + liveness guardrail → Task 6. ✓
- Render overlay → Task 7. ✓
- Measurement (follow/flee, clustering, liveness) → Task 8. ✓
- Removed knobs (`pheroGrazeStrength`/`pheroDepositOnGraze`/`pheroAlarmStrength`) → Task 4 + callers Task 5. ✓

**Type consistency:** `ScentField` method names (`deposit`, `stepAll`, `gradientsInto`, `channel`, `reset`, `hashInto`, `fillTexture`) are identical across Tasks 1/3/5/7. `scentSenseX/Y` index `i·SCENT_CHANNELS + c` consistent in store/sense/brain. `Brain.PHERO_C0_LAT_TURN + c*4` base consistent in genome/brain. `depositScent(store, scent, cfg)` signature consistent Task 5. ✓

**Placeholder scan:** no TBD/TODO; all code steps show code; Task 8 step 2's optional census is described as read-only with exact gene names. ✓

**Open risk:** the per-tick deposit strength (`pheroDepositStrength: 0.1`) is a guess — Task 6 step 2 explicitly tunes it against the liveness guardrail. The NN-expansion session also edits `brain.ts`/`genome.ts`; merge coordination is a process note, not a code dependency.
