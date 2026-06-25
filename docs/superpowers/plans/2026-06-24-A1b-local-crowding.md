# A1b — local-CROWDING interoceptive input — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give each creature a third interoceptive brain input — how crowded it is right now (count of live neighbors within a fixed radius) — wired into the linear map + hidden layer behind `cfg.bodySense`. Unlike own-SIZE/own-DIET (A1a, constant within a life → evolve-only), CROWDING **varies** within a life, so it **learns** (gets eligibility traces, like sight/scent).

**Architecture:** Add a `store.crowding[]` transient buffer + a new `senseCrowding()` pass (sense.ts) that counts neighbors via the start-of-tick spatial hash (independent of vision, independent of the dead lever-D `crowdingMortality` scan). Append one input to the brain genome (the A1a always-drawn / forward-pass-gated template). Wire `steer()` + the inspector together (steer reading crowd breaks inspector parity until the inspector matches — the A1a coupling lesson). Measure honestly: at 8192² the density wall likely makes crowding read ~0 (NND ~62–75u ≫ any sane radius) — report it plainly if so.

**Tech Stack:** TypeScript, Vitest. Deterministic SoA sim core (`src/core/`).

## Global Constraints

- **Determinism is the ONLY invariant:** same `(config, seed)` → byte-identical hash run-to-run. NO golden hash (retired). The `senseCrowding` neighbor count must be an INTEGER count, ascending live-slot order, RNG-free → deterministic.
- **On-by-default, always-drawn:** the new `CROWD_TURN/CROWD_THRUST` weights are always drawn (toggling `cfg.bodySense` must NOT change the RNG stream). `bodySense` (already exists from A1a, default true) gates the `steer()` forward pass.
- **Layout (A1b target):** `NAMED_BRAIN_GENES 49→51`, `HIDDEN_INPUTS 22→23`, `HIDDEN_W1=51`, `HIDDEN_W2=143`, `GLOW_BIAS=155`, `BRAIN_GENES 158→164`. New `Brain` slots: `CROWD_TURN=49, CROWD_THRUST=50`. New `HiddenInput` slot: `CROWD=21`, with `BIAS` moving `21→22`.
- **CROWDING LEARNS:** unlike A1a's size/diet, the CROWD synapses GET eligibility traces in steer's learn branch (gated on `bodySense`), because the input varies within a life.
- **Normalization:** `crowdN = min(store.crowding[i] / cfg.crowdSenseNorm, 1)`, 0 when `!bodySense`.
- **Config defaults:** `crowdSenseRange = 36` (= 6·cellRadius, deliberately wider than the 12u repulsion cutoff that zeroed the dead lever-D scan); `crowdSenseNorm = 8`.
- **Commands:** focused `npx vitest run <file>`; full `NODE_OPTIONS=--expose-gc npx vitest run` (~300s); `npx tsc --noEmit`; `npx eslint src`. `make` fails in a worktree. Commit hook BLOCKS `Co-Authored-By` — omit it.

---

### Task 1: Genome layout + config + inspector `hin[]` stub

Grow the genome to carry CROWD (drawn but unread → inert, deterministic), add the two config knobs, and pad the inspector's `hin[]` so the suite stays green (the A1a Task-1 pattern — growing HIDDEN_INPUTS makes the inspector's hidden matmul read `hin[22]`).

**Files:**
- Modify: `src/core/genome.ts` — `Brain` enum (after `DIET_THRUST: 48`), `NAMED_BRAIN_GENES`, `HiddenInput` enum (CROWD before BIAS), `HIDDEN_INPUTS`, `FOUNDER_BRAIN` (insert 2 zeros).
- Modify: `src/core/config.ts` — `Config` interface (near `bodySense`) + `defaultConfig`.
- Modify: `src/app/observability/brain-view.ts` — the `hin` array: insert one `0` stub for CROWD before the trailing `1`.
- Test: `src/core/genome.test.ts` — the layout-lock describe block.

**Interfaces:**
- Produces: `Brain.CROWD_TURN=49, Brain.CROWD_THRUST=50`; `HiddenInput.CROWD=21, HiddenInput.BIAS=22`; `NAMED_BRAIN_GENES=51`, `HIDDEN_INPUTS=23`, `BRAIN_GENES=164`; `cfg.crowdSenseRange` (36), `cfg.crowdSenseNorm` (8).

- [ ] **Step 1: Update the layout-lock test (failing)**

In `src/core/genome.test.ts`, in the `unified brain layout` describe block, update the three `it(...)` assertions to the A1b target:

```ts
  it('places the 16-synapse scent block at 20..35 and the interoceptive tail after readiness', () => {
    expect(Brain.PHERO_C0_LAT_TURN).toBe(20);
    expect(Brain.PHERO_C3_FWD_THRUST).toBe(35);
    expect(Brain.EAT_GATE_BIAS).toBe(36);
    expect(Brain.READINESS_THRUST).toBe(44);
    expect(Brain.SIZE_TURN).toBe(45);
    expect(Brain.DIET_THRUST).toBe(48);
    expect(Brain.CROWD_TURN).toBe(49); // A1b: local-crowding linear synapses
    expect(Brain.CROWD_THRUST).toBe(50);
    expect(NAMED_BRAIN_GENES).toBe(51);
  });
  it('grows the hidden layer to carry own-SIZE + own-DIET + local-CROWDING (23 inputs)', () => {
    expect(SCENT_CHANNELS).toBe(4);
    expect(HIDDEN_INPUTS).toBe(23);
    expect(HiddenInput.SIZE).toBe(19);
    expect(HiddenInput.DIET).toBe(20);
    expect(HiddenInput.CROWD).toBe(21);
    expect(HiddenInput.BIAS).toBe(22);
  });
  it('derives downstream offsets from the unified sizes', () => {
    expect(HIDDEN_W1).toBe(NAMED_BRAIN_GENES); // 51
    expect(HIDDEN_W2).toBe(HIDDEN_W1 + HIDDEN_INPUTS * HIDDEN_UNITS); // 143
    expect(GLOW_BIAS).toBe(HIDDEN_W2 + HIDDEN_UNITS * HIDDEN_OUTPUTS); // 155
    expect(BRAIN_GENES).toBe(164);
  });
```

- [ ] **Step 2: Run, verify it fails**

Run: `npx vitest run src/core/genome.test.ts -t "unified brain layout"`
Expected: FAIL (`Brain.CROWD_TURN` undefined; `NAMED_BRAIN_GENES` is 49).

- [ ] **Step 3: Add the `Brain` slots + bump `NAMED_BRAIN_GENES`**

In `src/core/genome.ts`, after `DIET_THRUST: 48,` in the `Brain` object add:

```ts
  // A1b interoceptive local-CROWDING input: count of live neighbors within cfg.crowdSenseRange (normalized).
  // Unlike own-SIZE/own-DIET this VARIES within a life → it LEARNS (eligibility traces in steer). Seeded 0.
  CROWD_TURN: 49,
  CROWD_THRUST: 50,
```

Change `export const NAMED_BRAIN_GENES = 49;` to `= 51;`.

- [ ] **Step 4: Add the `HiddenInput` slot + bump `HIDDEN_INPUTS`**

In `src/core/genome.ts`, in `HiddenInput`, change the tail:

```ts
  SIZE: 19,
  DIET: 20,
  CROWD: 21, // A1b: local crowding feeds the hidden layer (conditional logic on density)
  BIAS: 22,
} as const;
```

(keep the existing `SIZE`/`DIET` comments). Change `export const HIDDEN_INPUTS = 22; // +SIZE +DIET (A1a)` to `= 23; // +SIZE +DIET (A1a) +CROWD (A1b)`.

- [ ] **Step 5: Grow `FOUNDER_BRAIN` (2 zeros)**

In `src/core/genome.ts`, in `FOUNDER_BRAIN`, after the A1a size/diet line `0, 0, 0, 0,` add:

```ts
  // A1b local-CROWDING (49-50): CROWD_TURN, CROWD_THRUST — seed 0 (the density response evolves + learns).
  0, 0,
```

- [ ] **Step 6: Add the config knobs**

In `src/core/config.ts`, in the `Config` interface after `bodySense: boolean;` add:

```ts
  /** A1b local-crowding sense radius (world units): senseCrowding counts live neighbors within this distance
   *  into store.crowding. Wider than the 2·cellRadius repulsion cutoff (which holds creatures ~12u apart, so a
   *  12u radius reads ~0 — the dead lever-D scan's failure). Only read when bodySense (the A1 umbrella flag). */
  crowdSenseRange: number;
  /** Normalization divisor for the crowding count: crowdN = min(crowding/this, 1). ~8 neighbors → saturated. */
  crowdSenseNorm: number;
```

In `defaultConfig`, after the `bodySense: true,` line add:

```ts
    crowdSenseRange: 36, // = 6·cellRadius; wider than the 12u repulsion cutoff so neighbors can register
    crowdSenseNorm: 8, // crowding count → [0,1]: 8 neighbors-in-radius reads as fully crowded
```

- [ ] **Step 7: Pad the inspector `hin[]` stub**

In `src/app/observability/brain-view.ts`, in the `hin` array, after the `dietN,` line and before the trailing `1,` insert:

```ts
      0, // CROWD (A1b): inert until steer() reads crowding (Task 3) — steer leaves this hidIn slot 0 too
```

- [ ] **Step 8: Run the layout test + full suite**

Run: `npx vitest run src/core/genome.test.ts -t "unified brain layout"` → PASS.
Run: `npx tsc --noEmit` → clean. `npx eslint src/core/genome.ts src/core/config.ts src/app/observability/brain-view.ts` → clean.
Run: `NODE_OPTIONS=--expose-gc npx vitest run` → ALL green (CROWD weights drawn but unread → deterministic; the inspector parity holds with the `0` stub matching steer leaving hidIn[21]=0; if `config.test.ts` snapshots keys, add `crowdSenseRange`/`crowdSenseNorm`).

- [ ] **Step 9: Commit**

```bash
git add src/core/genome.ts src/core/config.ts src/app/observability/brain-view.ts src/core/genome.test.ts
git commit -m "feat(brain): A1b layout — local-CROWDING genome slot + crowdSense config (BRAIN_GENES 158→164)"
```

---

### Task 2: `store.crowding` buffer + `senseCrowding` pass

Compute the per-creature neighbor count each tick into a new transient buffer. Steer does NOT read it yet (Task 3), so this is a side-effect-free addition (the world stays byte-identical to Task 1) with its own correctness test.

**Files:**
- Modify: `src/core/store.ts` — add the `crowding` Float64Array (declaration + constructor alloc).
- Modify: `src/core/sense.ts` — add `senseCrowding(store, hash, cfg)`.
- Modify: `src/core/world.ts` — call `senseCrowding` after `senseCreatures`, before `steer`.
- Test: `src/core/sense.test.ts` — a count-correctness test.

**Interfaces:**
- Consumes: `cfg.bodySense`, `cfg.crowdSenseRange`, the `SpatialHash` (colOf/rowOf/cols/rows/bucketStart/sorted).
- Produces: `store.crowding: Float64Array` (per-slot integer neighbor count within `crowdSenseRange`, 0 when `!bodySense`); `senseCrowding(store, hash, cfg): void`.

- [ ] **Step 1: Write the failing count test**

In `src/core/sense.test.ts`, add (match the file's existing import style — it already imports `OrganismStore`, `SpatialHash`/hash builder, `defaultConfig`; add `senseCrowding` to the `./sense` import):

```ts
  it('senseCrowding counts live neighbors within crowdSenseRange (A1b)', () => {
    const cfg = defaultConfig({ bodySense: true, crowdSenseRange: 36, worldWidth: 512, worldHeight: 512 });
    const s = new OrganismStore(8);
    // Place 4 creatures: i0 at origin; i1,i2 within 36u; i3 at ~100u (outside).
    const place = (slot: number, x: number, y: number): void => {
      s.alloc(); s.x[slot] = x; s.y[slot] = y;
    };
    place(0, 100, 100);
    place(1, 110, 100); // 10u from i0 — inside
    place(2, 100, 130); // 30u — inside
    place(3, 100, 200); // 100u — outside
    s.rebuildLive();
    // SpatialHash signature is (worldWidth, worldHeight, cellSize, capacity); cellSize = 2·cellRadius (12u)
    // is the house convention (sense.test.ts already uses it). cr = ceil(36/12)=3 cells covers the 36u range.
    const hash = new SpatialHash(cfg.worldWidth, cfg.worldHeight, 2 * cfg.cellRadius, s.capacity);
    hash.build(s);
    senseCrowding(s, hash, cfg);
    expect(s.crowding[0]).toBe(2); // i1 + i2 within 36u, i3 excluded
    expect(s.crowding[3]).toBe(0); // i3 is alone within 36u
  });

  it('senseCrowding leaves crowding untouched when bodySense is off', () => {
    const cfg = defaultConfig({ bodySense: false });
    const s = new OrganismStore(4);
    s.alloc(); s.alloc(); s.x[0] = 10; s.y[0] = 10; s.x[1] = 12; s.y[1] = 10;
    s.rebuildLive();
    const hash = new SpatialHash(cfg.worldWidth, cfg.worldHeight, 2 * cfg.cellRadius, s.capacity);
    hash.build(s);
    senseCrowding(s, hash, cfg);
    expect(s.crowding[0]).toBe(0); // skipped → stays at its zero-init
  });
```

`SpatialHash` is already imported in `sense.test.ts` (line 4); `senseCrowding` must be added to the `./sense` import (line 5).

- [ ] **Step 2: Run, verify it fails**

Run: `npx vitest run src/core/sense.test.ts -t senseCrowding`
Expected: FAIL (`senseCrowding` is not exported; `s.crowding` is undefined).

- [ ] **Step 3: Add the `crowding` buffer to the store**

In `src/core/store.ts`, after the glow-sense buffers (`glowSenseX/glowSenseY` declaration) add:

```ts
  // Transient per-tick LOCAL-CROWDING count (A1b): live neighbors within cfg.crowdSenseRange, written by
  // senseCrowding each tick (0 when bodySense off). Recomputed each tick; not hashed (derived).
  readonly crowding: Float64Array;
```

In the constructor, after `this.glowSenseY = new Float64Array(capacity);` add:

```ts
    this.crowding = new Float64Array(capacity);
```

- [ ] **Step 4: Implement `senseCrowding`**

In `src/core/sense.ts`, add (it already has `wrapDelta`, `ScalarGene`/`SCALAR_GENE_COUNT` imports; add the `SpatialHash` type import if not present):

```ts
/** Count each creature's live neighbors within cfg.crowdSenseRange via the start-of-tick hash — the A1b
 *  interoceptive density sense, written into store.crowding. Independent of vision (a blind creature still
 *  feels its crowd) and of the dead lever-D crowdingMortality scan. Gated on bodySense (skipped → crowding
 *  stays 0). Integer count, ascending live-slot order, RNG-free → deterministic. */
export function senseCrowding(store: OrganismStore, hash: SpatialHash, cfg: Config): void {
  const { liveIndices, liveCount, x, y, crowding } = store;
  if (!cfg.bodySense) return; // steer gates crowdN on bodySense too, so leaving crowding stale is harmless
  const { cols, rows, bucketStart, sorted } = hash;
  const { worldWidth, worldHeight, crowdSenseRange } = cfg;
  const r2 = crowdSenseRange * crowdSenseRange;
  const cellSize = Math.min(worldWidth / cols, worldHeight / rows);
  const halfGrid = Math.floor((Math.min(cols, rows) - 1) / 2);
  const cr = Math.min(halfGrid, Math.max(1, Math.ceil(crowdSenseRange / cellSize)));
  for (let k = 0; k < liveCount; k++) {
    const i = liveIndices[k]!;
    const xi = x[i]!;
    const yi = y[i]!;
    const ci = hash.colOf(xi);
    const cj = hash.rowOf(yi);
    let n = 0;
    for (let dy = -cr; dy <= cr; dy++) {
      const by = (cj + dy + rows) % rows;
      for (let dx = -cr; dx <= cr; dx++) {
        const bx = (ci + dx + cols) % cols;
        const b = by * cols + bx;
        const end = bucketStart[b + 1]!;
        for (let idx = bucketStart[b]!; idx < end; idx++) {
          const j = sorted[idx]!;
          if (j === i) continue;
          const ddx = wrapDelta(xi - x[j]!, worldWidth);
          const ddy = wrapDelta(yi - y[j]!, worldHeight);
          if (ddx * ddx + ddy * ddy <= r2) n++;
        }
      }
    }
    crowding[i] = n;
  }
}
```

- [ ] **Step 5: Call it in the tick (world.ts)**

In `src/core/world.ts` `step()`, after `senseCreatures(s, this.hash, cfg, this.walls, this.parcels);` and before `steer(...)`, add:

```ts
    senseCrowding(s, this.hash, cfg);
```

Add `senseCrowding` to the existing `./sense` import at the top of `world.ts`.

- [ ] **Step 6: Run the count tests + determinism**

Run: `npx vitest run src/core/sense.test.ts -t senseCrowding` → PASS.
Run: `npx vitest run src/core/world.test.ts` → green (senseCrowding writes an UNREAD buffer → the world dynamics are byte-identical to Task 1; the determinism test still holds).

- [ ] **Step 7: Type/lint + commit**

Run: `npx tsc --noEmit` → clean. `npx eslint src/core/store.ts src/core/sense.ts src/core/world.ts src/core/sense.test.ts` → clean.

```bash
git add src/core/store.ts src/core/sense.ts src/core/world.ts src/core/sense.test.ts
git commit -m "feat(sense): A1b senseCrowding — per-tick fixed-radius neighbor count into store.crowding"
```

---

### Task 3: Wire CROWD into `steer()` (it LEARNS) + inspector parity (one task — coupled)

Read `store.crowding`, normalize, gate on `bodySense`, add to the linear sum + hidden inputs, AND add eligibility (CROWD varies → it learns). In the SAME task, update the inspector (the A1a coupling: steer reading crowd breaks parity until `computeBrainState` matches).

**Files:**
- Modify: `src/core/brain.ts` — `steer()` (read crowdN ~after the A1a size/diet block; linear add; hidden write; **eligibility in the learn branch**).
- Modify: `src/app/observability/brain-view.ts` — `computeBrainState` (compute crowdN, push the crowd node before glow, replace the `0` stub with `crowdN`).
- Test: `src/core/world.test.ts` — a determinism test with bodySense on (the umbrella ablation already exists from A1a).
- Test: `src/app/observability/brain-view.test.ts` — a non-saturated crowd parity test.

**Interfaces:**
- Consumes: `store.crowding` (Task 2), `Brain.CROWD_TURN/CROWD_THRUST`, `HiddenInput.CROWD`, `cfg.crowdSenseNorm`.
- Produces: `steer()` + `computeBrainState` add `w·crowdN` to turn/thrust + the hidden input when `bodySense`; CROWD synapses get eligibility traces.

- [ ] **Step 1: Write the failing crowd parity test**

In `src/app/observability/brain-view.test.ts`, add (mirror the A1a size/diet parity test already in the file — non-saturated, module `cfg`):

```ts
  it('adds a local-CROWDING node that matches a real steer() run (A1b, non-saturated)', () => {
    const s = new OrganismStore(8);
    const i = s.alloc();
    s.heading[i] = 0;
    const base = i * SCALAR_GENE_COUNT;
    for (let g = 0; g < SCALAR_GENE_COUNT; g++)
      s.scalarGenes[base + g] = cfg[SCALAR_GENE_SPECS[g]!.centerKey];
    s.crowding[i] = 4; // crowdN = min(4 / crowdSenseNorm(8), 1) = 0.5
    const b = i * BRAIN_GENES;
    s.brain[b + Brain.CROWD_TURN] = 0.06;
    s.brain[b + Brain.CROWD_THRUST] = 0.04;
    s.resetLearned(i);
    s.rebuildLive();
    const h0 = s.heading[i]!;
    const st = computeBrainState(s, cfg, i);
    steer(s, false, cfg.eligLambda, cfg.motorSquash, cfg);
    expect(st.turn).toBeCloseTo(s.heading[i]! - h0, 10);
    expect(st.thrust).toBeCloseTo(Math.hypot(s.forceX[i]!, s.forceY[i]!), 10);
    const crowdNode = st.inputs.find((n) => n.label === 'crowd')!;
    expect(crowdNode.value).toBeCloseTo(0.5, 10);
    expect(Math.abs(st.turn)).toBeGreaterThan(1e-6); // guard: the crowd→turn path is exercised
  });
```

- [ ] **Step 2: Run, verify it fails**

Run: `npx vitest run src/app/observability/brain-view.test.ts -t "local-CROWDING"`
Expected: FAIL (no `crowd` node; the inspector still uses the `0` stub → parity mismatch on `st.turn`).

- [ ] **Step 3: Read + wire crowd in `steer()`**

In `src/core/brain.ts`, in the A1a own-body block (the `if (bodySense)` block after the readiness block), extend it to compute and add crowd. Replace the existing A1a block:

```ts
    let sizeN = 0;
    let dietN = 0;
    if (bodySense) {
      sizeN = genes[sg + ScalarGene.SIZE]! / (2 * cellRadius);
      dietN = genes[sg + ScalarGene.DIET]!;
      turnRaw += learnedBrain[b + Brain.SIZE_TURN]! * sizeN + learnedBrain[b + Brain.DIET_TURN]! * dietN;
      thrustRaw +=
        learnedBrain[b + Brain.SIZE_THRUST]! * sizeN + learnedBrain[b + Brain.DIET_THRUST]! * dietN;
    }
```

with:

```ts
    let sizeN = 0;
    let dietN = 0;
    let crowdN = 0;
    if (bodySense) {
      sizeN = genes[sg + ScalarGene.SIZE]! / (2 * cellRadius);
      dietN = genes[sg + ScalarGene.DIET]!;
      crowdN = crowding[i]! / crowdSenseNorm;
      if (crowdN > 1) crowdN = 1;
      turnRaw += learnedBrain[b + Brain.SIZE_TURN]! * sizeN + learnedBrain[b + Brain.DIET_TURN]! * dietN;
      thrustRaw +=
        learnedBrain[b + Brain.SIZE_THRUST]! * sizeN + learnedBrain[b + Brain.DIET_THRUST]! * dietN;
      turnRaw += learnedBrain[b + Brain.CROWD_TURN]! * crowdN;
      thrustRaw += learnedBrain[b + Brain.CROWD_THRUST]! * crowdN;
    }
```

Add `crowdSenseNorm` to the destructured config locals near `cellRadius` (`const crowdSenseNorm = cfg.crowdSenseNorm;`) and add `crowding` to the `store` destructure at the top of `steer()`.

- [ ] **Step 4: Feed the hidden layer**

In the `if (hiddenLayer)` block, after `hidIn[HiddenInput.DIET] = dietN;` add:

```ts
      hidIn[HiddenInput.CROWD] = crowdN; // 0 when !bodySense
```

- [ ] **Step 5: Add eligibility (CROWD learns)**

In the learn branch (after `if (!learn) continue;`), in the `if (bodySense)`… wait — there is no bodySense elig block yet (A1a added none). Add a gated block alongside the other interoceptive elig (mirror the readiness elig, but gated on `bodySense`):

```ts
    // Local-crowding eligibility (A1b): pre = crowdN, post = motor output. CROWD varies within a life, so it
    // LEARNS (unlike A1a's constant own-size/diet, which get NO elig). Gated on bodySense.
    if (bodySense) {
      elig[b + Brain.CROWD_TURN] = keep * elig[b + Brain.CROWD_TURN]! + eligLambda * crowdN * turnRaw;
      elig[b + Brain.CROWD_THRUST] =
        keep * elig[b + Brain.CROWD_THRUST]! + eligLambda * crowdN * thrustRaw;
    }
```

(Place it near the readiness eligibility block. `keep`, `eligLambda`, `crowdN`, `turnRaw`, `thrustRaw` are all in scope.)

- [ ] **Step 6: Update the inspector (`computeBrainState`)**

In `src/app/observability/brain-view.ts`, extend the A1a body-sense block to compute + push crowd:

```ts
  let sizeN = 0;
  let dietN = 0;
  let crowdN = 0;
  if (cfg.bodySense) {
    sizeN = store.scalarGenes[sg + ScalarGene.SIZE]! / (2 * cfg.cellRadius);
    dietN = store.scalarGenes[sg + ScalarGene.DIET]!;
    crowdN = Math.min(store.crowding[slot]! / cfg.crowdSenseNorm, 1);
    inputs.push(node('size', sizeN, Brain.SIZE_TURN, Brain.SIZE_THRUST, HiddenInput.SIZE));
    inputs.push(node('diet', dietN, Brain.DIET_TURN, Brain.DIET_THRUST, HiddenInput.DIET));
    inputs.push(node('crowd', crowdN, Brain.CROWD_TURN, Brain.CROWD_THRUST, HiddenInput.CROWD));
  }
```

And in the `hin` array, replace the Task 1 stub line `0, // CROWD (A1b): inert…` with `crowdN,`.

- [ ] **Step 7: Add a bodySense-on determinism test**

In `src/core/world.test.ts` add:

```ts
  it('bodySense ON with crowding is deterministic (A1b — same config+seed → identical hash)', () => {
    const a = new World(defaultConfig({ seed: 9, bodySense: true }));
    const b = new World(defaultConfig({ seed: 9, bodySense: true }));
    for (let t = 0; t < 300; t++) { a.step(); b.step(); }
    expect(a.stateHash()).toBe(b.stateHash());
  });
```

(The umbrella `bodySense:false !== true` ablation from A1a already proves the forward pass — now broadened to include crowd.)

- [ ] **Step 8: Run the parity + determinism + full suite**

Run: `npx vitest run src/app/observability/brain-view.test.ts` → all PASS (new crowd test + the existing A1a/hunger/drift tests; the documented-order tests now need `'crowd'` after `'diet'` — if they fail, add `'crowd'` to those expected arrays, between `'diet'` and `'glow fwd'`).
Run: `npx vitest run src/core/world.test.ts` → green.
Run: `NODE_OPTIONS=--expose-gc npx vitest run` → FULL suite green. `npx tsc --noEmit` + `npx eslint` on the changed files → clean.

- [ ] **Step 9: Commit**

```bash
git add src/core/brain.ts src/app/observability/brain-view.ts src/app/observability/brain-view.test.ts src/core/world.test.ts
git commit -m "feat(brain): A1b — steer reads local-CROWDING (learns) + inspector parity"
```

---

### Task 4: Liveness + honest measurement (the inert-at-8192 check)

Prove the world survives and MEASURE whether crowding actually registers at demo scale — the expected honest finding is that it reads near-0 (the density wall), in which case SAY SO plainly.

**Files:**
- Modify: `src/headless/intero-probe.ts` (extend the A1a probe) OR create `src/headless/crowd-sense-probe.ts`.

**Interfaces:**
- Consumes: `World`, `defaultConfig`, `DEMO_OVERRIDES`, `store.crowding`.

- [ ] **Step 1: Liveness**

Run: `NODE_OPTIONS=--expose-gc npx tsx src/headless/liveness-probe.ts 4000 3` → `LIVENESS: PASS`. Record pop + FORAGE_PREF/DIET.

- [ ] **Step 2: Add a crowding readout to the probe**

Extend `src/headless/intero-probe.ts` (or a new small probe) to, after running the demo config N ticks with bodySense ON, report over the live population: **mean / max / fraction-nonzero of `store.crowding`** at the default `crowdSenseRange`. This is the density-wall measurement.

```ts
// after the run, with `s = world.store`:
let sum = 0, max = 0, nonzero = 0;
for (let k = 0; k < s.liveCount; k++) {
  const c = s.crowding[s.liveIndices[k]!]!;
  sum += c; if (c > max) max = c; if (c > 0) nonzero++;
}
process.stdout.write(
  `crowding @range=${world.config.crowdSenseRange}: mean ${(sum / Math.max(1, s.liveCount)).toFixed(2)} ` +
  `max ${max} nonzero ${((100 * nonzero) / Math.max(1, s.liveCount)).toFixed(1)}% of ${s.liveCount}\n`,
);
```

- [ ] **Step 3: Run + interpret honestly**

Run: `npx tsx src/headless/intero-probe.ts 8000 1` (+ seeds 2, 3 if reasonable).
**Interpret honestly:** if mean crowding ≈ 0 / nonzero% is tiny, the input is **wired + live but inert at 8192²** — the density wall (NND ~62–75u ≫ 36u range). SAY SO with the numbers (it's correct machinery that activates if Bucket B concentrates prey, or at a smaller world). If a meaningful fraction have neighbors, quote it.

- [ ] **Step 4: Commit + record**

```bash
git add src/headless/intero-probe.ts
git commit -m "test(brain): A1b crowd-sense probe — measure crowding registration at demo scale (honest)"
```

Record the numbers + verdict in the bead `life-sim-kymi` and the roadmap before merging.

---

## Verification (before merge to main)

- [ ] `NODE_OPTIONS=--expose-gc npx vitest run` → full suite green; `npx tsc --noEmit` + `npx eslint src` clean.
- [ ] `liveness-probe.ts 4000 3` → PASS. Crowding readout recorded with an honest verdict (likely inert-at-8192).
- [ ] `git log -1 main` re-checked; FF/merge A1b; update roadmap; `bd close life-sim-kymi`; `bd sync --flush-only`.

## Self-review (coverage vs spec)

- Spec "local-CROWDING via a sense-time count, start-of-tick hash, independent of vision + the dead lever-D scan" → Task 2 `senseCrowding`. ✓
- Spec "CROWD learns (varies within life)" → Task 3 Step 5 eligibility. ✓
- Spec "tunable crowdSenseRange/Norm" → Task 1 Step 6. ✓
- Spec "always-drawn, forward-pass-gated, no golden hash" → Task 1 (always-drawn), Task 3 (`bodySense` gates forward pass). ✓
- Spec "measure honestly — report whether it registers at 8192²" → Task 4. ✓
- A1a coupling lesson (steer + inspector parity land together) → Task 3 is merged. ✓
