# A1c — fertility-under-foot interoceptive input — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give each creature a fourth interoceptive brain input — how much food (biomass) is right under it now — wired into the linear map + hidden layer behind `cfg.bodySense`. Like local-CROWDING (A1b) it **varies** within a life, so it **learns** (gets eligibility traces). This is the A1 input expected to be genuinely live (biomass-under-foot is nonzero inside pockets and varies as the creature moves).

**Architecture:** Add a `store.fertHere[]` transient buffer + a new `senseFertility()` pass (sense.ts) that sums the food-field biomass at the body across the active channels each tick. Append one input to the brain genome (the A1a/A1b always-drawn / forward-pass-gated template). Wire `steer()` + the inspector together (the coupling lesson). Distinct from the food GRADIENT the brain already senses: the gradient is ~0 at a pocket's peak where biomass-under-foot is HIGH, so this tells the creature "I'm sitting on plenty" vs "I'm in a desert" — a settle/leave signal.

**Tech Stack:** TypeScript, Vitest. Deterministic SoA sim core (`src/core/`).

## Global Constraints

- **Determinism is the ONLY invariant:** same `(config, seed)` → byte-identical hash run-to-run. NO golden hash (retired). `senseFertility` is field-sampling only, ascending live-slot order, RNG-free → deterministic.
- **On-by-default, always-drawn:** the new `FERT_TURN/FERT_THRUST` weights are always drawn (toggling `cfg.bodySense` must NOT change the RNG stream). `bodySense` (exists from A1a, default true) gates the `steer()` forward pass for size/diet/crowd AND fert.
- **Layout (A1c target):** `NAMED_BRAIN_GENES 51→53`, `HIDDEN_INPUTS 23→24`, `HIDDEN_W1=53`, `HIDDEN_W2=149`, `GLOW_BIAS=161`, `BRAIN_GENES 164→170`. New `Brain` slots: `FERT_TURN=51, FERT_THRUST=52`. New `HiddenInput` slot: `FERT=22`, with `BIAS` moving `22→23`.
- **FERT LEARNS:** the FERT synapses GET eligibility traces in steer's learn branch (gated on `bodySense`), like A1b's CROWD. SIZE/DIET still get NONE.
- **Normalization — `foodCap` (NOT foodMaxFertility, a spec correction):** the food field stores BIOMASS B ∈ [0, K] where K = `cfg.foodCap`·fertility (foodCap default 40); `foodMaxFertility` (=1) is the [0,1] fertility clamp, NOT the biomass scale. So `fertN = min(store.fertHere[i] / cfg.foodCap, 1)`, 0 when `!bodySense`. (The A1 spec's "normalize by foodMaxFertility" was wrong — biomass scales with `foodCap`. No new config knob: reuse `foodCap` so the norm tracks the cap.)
- **`fertHere` = total local biomass** summed across the ACTIVE channels: `sampleAt` + (`foodChannels≥2` ? `sampleAt2` : 0) + (`foodChannels≥3` ? `sampleAt3` : 0). Demo runs `foodChannels: 2`.
- **Commands:** focused `npx vitest run <file>`; full `NODE_OPTIONS=--expose-gc npx vitest run` (~300s); `npx tsc --noEmit`; `npx eslint src`. Commit hook BLOCKS `Co-Authored-By` — omit it.

---

### Task 1: Genome layout + inspector `hin[]` stub

Grow the genome to carry FERT (drawn but unread → inert, deterministic) and pad the inspector's `hin[]`. No config change (normalization reuses `foodCap`).

**Files:**
- Modify: `src/core/genome.ts` — `Brain` enum (after `CROWD_THRUST: 50`), `NAMED_BRAIN_GENES`, `HiddenInput` enum (FERT before BIAS), `HIDDEN_INPUTS`, `FOUNDER_BRAIN` (insert 2 zeros).
- Modify: `src/app/observability/brain-view.ts` — the `hin` array: insert one `0` stub for FERT before the trailing `1`.
- Test: `src/core/genome.test.ts` — the layout-lock describe block.

**Interfaces:**
- Produces: `Brain.FERT_TURN=51, Brain.FERT_THRUST=52`; `HiddenInput.FERT=22, HiddenInput.BIAS=23`; `NAMED_BRAIN_GENES=53`, `HIDDEN_INPUTS=24`, `BRAIN_GENES=170`.

- [ ] **Step 1: Update the layout-lock test (failing)**

In `src/core/genome.test.ts`, in the `unified brain layout` describe block, update the assertions:

```ts
  it('places the 16-synapse scent block at 20..35 and the interoceptive tail after readiness', () => {
    expect(Brain.PHERO_C0_LAT_TURN).toBe(20);
    expect(Brain.PHERO_C3_FWD_THRUST).toBe(35);
    expect(Brain.EAT_GATE_BIAS).toBe(36);
    expect(Brain.READINESS_THRUST).toBe(44);
    expect(Brain.SIZE_TURN).toBe(45);
    expect(Brain.DIET_THRUST).toBe(48);
    expect(Brain.CROWD_TURN).toBe(49);
    expect(Brain.FERT_TURN).toBe(51); // A1c: fertility-under-foot linear synapses
    expect(Brain.FERT_THRUST).toBe(52);
    expect(NAMED_BRAIN_GENES).toBe(53);
  });
  it('grows the hidden layer to carry own-SIZE + own-DIET + local-CROWDING + fertility (24 inputs)', () => {
    expect(SCENT_CHANNELS).toBe(4);
    expect(HIDDEN_INPUTS).toBe(24);
    expect(HiddenInput.SIZE).toBe(19);
    expect(HiddenInput.DIET).toBe(20);
    expect(HiddenInput.CROWD).toBe(21);
    expect(HiddenInput.FERT).toBe(22);
    expect(HiddenInput.BIAS).toBe(23);
  });
  it('derives downstream offsets from the unified sizes', () => {
    expect(HIDDEN_W1).toBe(NAMED_BRAIN_GENES); // 53
    expect(HIDDEN_W2).toBe(HIDDEN_W1 + HIDDEN_INPUTS * HIDDEN_UNITS); // 149
    expect(GLOW_BIAS).toBe(HIDDEN_W2 + HIDDEN_UNITS * HIDDEN_OUTPUTS); // 161
    expect(BRAIN_GENES).toBe(170);
  });
```

- [ ] **Step 2: Run, verify it fails**

Run: `npx vitest run src/core/genome.test.ts -t "unified brain layout"`
Expected: FAIL (`Brain.FERT_TURN` undefined; `NAMED_BRAIN_GENES` is 51).

- [ ] **Step 3: Add the `Brain` slots + bump `NAMED_BRAIN_GENES`**

In `src/core/genome.ts`, after `CROWD_THRUST: 50,` in the `Brain` object add:

```ts
  // A1c interoceptive fertility-under-foot input: total food biomass at the body (normalized by foodCap).
  // VARIES within a life → it LEARNS (eligibility in steer). Seeded 0; the settle/leave response evolves.
  FERT_TURN: 51,
  FERT_THRUST: 52,
```

Change `export const NAMED_BRAIN_GENES = 51;` to `= 53;`.

- [ ] **Step 4: Add the `HiddenInput` slot + bump `HIDDEN_INPUTS`**

In `src/core/genome.ts`, in `HiddenInput`, change the tail:

```ts
  CROWD: 21,
  FERT: 22, // A1c: fertility-under-foot feeds the hidden layer (conditional logic on local food)
  BIAS: 23,
} as const;
```

Change `export const HIDDEN_INPUTS = 23; // +SIZE +DIET (A1a) +CROWD (A1b)` to `= 24; // +SIZE +DIET (A1a) +CROWD (A1b) +FERT (A1c)`.

- [ ] **Step 5: Grow `FOUNDER_BRAIN` (2 zeros)**

In `src/core/genome.ts`, in `FOUNDER_BRAIN`, after the A1b crowding line `0, 0,` add:

```ts
  // A1c fertility-under-foot (51-52): FERT_TURN, FERT_THRUST — seed 0 (the settle/leave response evolves + learns).
  0, 0,
```

- [ ] **Step 6: Pad the inspector `hin[]` stub**

In `src/app/observability/brain-view.ts`, in the `hin` array, after the `crowdN,` line (A1b) and before the trailing `1,` insert:

```ts
      0, // FERT (A1c): inert until steer() reads fertHere (Task 3) — steer leaves this hidIn slot 0 too
```

- [ ] **Step 7: Run the layout test + full suite**

Run: `npx vitest run src/core/genome.test.ts -t "unified brain layout"` → PASS.
Run: `npx tsc --noEmit` → clean. `npx eslint src/core/genome.ts src/app/observability/brain-view.ts` → clean.
Run: `NODE_OPTIONS=--expose-gc npx vitest run` → ALL green (FERT weights drawn but unread → deterministic; the inspector `0` stub matches steer leaving hidIn[22]=0).

- [ ] **Step 8: Commit**

```bash
git add src/core/genome.ts src/app/observability/brain-view.ts src/core/genome.test.ts
git commit -m "feat(brain): A1c layout — fertility-under-foot genome slot (BRAIN_GENES 164→170)"
```

---

### Task 2: `store.fertHere` buffer + `senseFertility` pass

Compute the per-creature total local biomass each tick into a new transient buffer. Steer does NOT read it yet (Task 3), so this is a side-effect-free addition (the world stays byte-identical to Task 1) with its own correctness test.

**Files:**
- Modify: `src/core/store.ts` — add the `fertHere` Float64Array (declaration + constructor alloc).
- Modify: `src/core/sense.ts` — add `senseFertility(store, food, cfg)`.
- Modify: `src/core/world.ts` — call `senseFertility` after `senseFood`, before `steer`.
- Test: `src/core/sense.test.ts` — a biomass-sum correctness test.

**Interfaces:**
- Consumes: `cfg.bodySense`, `cfg.foodChannels`, the `FoodField` (sampleAt/sampleAt2/sampleAt3).
- Produces: `store.fertHere: Float64Array` (per-slot total local biomass, 0 when `!bodySense`); `senseFertility(store, food, cfg): void`.

- [ ] **Step 1: Write the failing correctness test**

In `src/core/sense.test.ts`, add (`FoodField` is already imported at line 3; add `senseFertility` to the `./sense` import). The `FoodField` constructor is `(worldWidth, worldHeight, cols, rows, K, initFraction, channels?, ratio?, ...)` — the 2-channel-full construction matches the existing test at sense.test.ts:49 (`new FoodField(W, H, COLS, ROWS, K, 1, 2, 0.5)`). The test only asserts `fertHere === sampleAt + sampleAt2` (it doesn't depend on the actual biomass values), so any valid construction works:

```ts
  it('senseFertility sums local biomass across active channels into fertHere (A1c)', () => {
    const cfg = defaultConfig({ bodySense: true, foodChannels: 2 });
    const s = new OrganismStore(4);
    s.alloc(); s.x[0] = 100; s.y[0] = 100;
    s.alloc(); s.x[1] = 300; s.y[1] = 300;
    s.rebuildLive();
    const food = new FoodField(512, 512, 64, 64, cfg.foodCap, 1, 2, 0.5); // 2 channels, full, symmetric split
    senseFertility(s, food, cfg);
    // fertHere is exactly the sum of the two channels' biomass at the body (the value steer will normalize).
    expect(s.fertHere[0]).toBeCloseTo(food.sampleAt(100, 100) + food.sampleAt2(100, 100), 10);
    expect(s.fertHere[1]).toBeCloseTo(food.sampleAt(300, 300) + food.sampleAt2(300, 300), 10);
  });

  it('senseFertility leaves fertHere untouched when bodySense is off', () => {
    const cfg = defaultConfig({ bodySense: false, foodChannels: 2 });
    const s = new OrganismStore(4);
    s.alloc(); s.x[0] = 100; s.y[0] = 100; s.rebuildLive();
    const food = new FoodField(512, 512, 64, 64, cfg.foodCap, 1, 2, 0.5);
    senseFertility(s, food, cfg);
    expect(s.fertHere[0]).toBe(0); // skipped → stays at its zero-init
  });
```

- [ ] **Step 2: Run, verify it fails**

Run: `npx vitest run src/core/sense.test.ts -t senseFertility`
Expected: FAIL (`senseFertility` not exported; `s.fertHere` undefined).

- [ ] **Step 3: Add the `fertHere` buffer to the store**

In `src/core/store.ts`, after the `crowding` buffer declaration (A1b) add:

```ts
  // Transient per-tick FERTILITY-UNDER-FOOT (A1c): total food biomass at the body (summed over active
  // channels), written by senseFertility each tick (0 when bodySense off). Recomputed each tick; not hashed.
  readonly fertHere: Float64Array;
```

In the constructor, after `this.crowding = new Float64Array(capacity);` add:

```ts
    this.fertHere = new Float64Array(capacity);
```

- [ ] **Step 4: Implement `senseFertility`**

In `src/core/sense.ts`, add (it already imports the `FoodField` type and `Config`):

```ts
/** Sum the food-field biomass at each creature's body across the active channels into store.fertHere — the
 *  A1c interoceptive "how much food is right here" sense (distinct from the food GRADIENT, which is ~0 at a
 *  pocket's peak). Gated on bodySense (skipped → fertHere stays 0). Field sampling only, ascending live-slot
 *  order, RNG-free → deterministic. steer normalizes by cfg.foodCap. */
export function senseFertility(store: OrganismStore, food: FoodField, cfg: Config): void {
  const { liveIndices, liveCount, x, y, fertHere } = store;
  if (!cfg.bodySense) return; // steer gates fertN on bodySense too, so leaving fertHere stale is harmless
  const channels = cfg.foodChannels;
  for (let k = 0; k < liveCount; k++) {
    const i = liveIndices[k]!;
    const xi = x[i]!;
    const yi = y[i]!;
    let b = food.sampleAt(xi, yi);
    if (channels >= 2) b += food.sampleAt2(xi, yi);
    if (channels >= 3) b += food.sampleAt3(xi, yi);
    fertHere[i] = b;
  }
}
```

- [ ] **Step 5: Call it in the tick (world.ts)**

In `src/core/world.ts` `step()`, right after `senseFood(s, this.food, cfg);` add:

```ts
    senseFertility(s, this.food, cfg);
```

Add `senseFertility` to the existing `./sense` import at the top of `world.ts`.

- [ ] **Step 6: Run the correctness tests + determinism**

Run: `npx vitest run src/core/sense.test.ts -t senseFertility` → PASS.
Run: `npx vitest run src/core/world.test.ts` → green (senseFertility writes an UNREAD buffer → world dynamics byte-identical to Task 1).

- [ ] **Step 7: Type/lint + commit**

Run: `npx tsc --noEmit` → clean. `npx eslint src/core/store.ts src/core/sense.ts src/core/world.ts src/core/sense.test.ts` → clean.

```bash
git add src/core/store.ts src/core/sense.ts src/core/world.ts src/core/sense.test.ts
git commit -m "feat(sense): A1c senseFertility — per-tick local biomass sum into store.fertHere"
```

---

### Task 3: Wire FERT into `steer()` (it LEARNS) + inspector parity (one task — coupled)

Read `store.fertHere`, normalize by `foodCap`, gate on `bodySense`, add to the linear sum + hidden inputs + eligibility (FERT varies → learns). In the SAME task update the inspector (the coupling: steer reading fert breaks parity until `computeBrainState` matches).

**Files:**
- Modify: `src/core/brain.ts` — `steer()` (read fertN in the `if (bodySense)` block; hidden write; **eligibility**).
- Modify: `src/app/observability/brain-view.ts` — `computeBrainState` (compute fertN, push the fert node before glow, replace the `0` stub with `fertN`).
- Test: `src/app/observability/brain-view.test.ts` — a non-saturated fert parity test.

**Interfaces:**
- Consumes: `store.fertHere` (Task 2), `Brain.FERT_TURN/FERT_THRUST`, `HiddenInput.FERT`, `cfg.foodCap`.
- Produces: `steer()` + `computeBrainState` add `w·fertN` to turn/thrust + the hidden input when `bodySense`; FERT synapses get eligibility traces.

- [ ] **Step 1: Write the failing fert parity test**

In `src/app/observability/brain-view.test.ts`, add (mirror the A1b crowd parity test — non-saturated, module `cfg`):

```ts
  it('adds a fertility-under-foot node that matches a real steer() run (A1c, non-saturated)', () => {
    const s = new OrganismStore(8);
    const i = s.alloc();
    s.heading[i] = 0;
    const base = i * SCALAR_GENE_COUNT;
    for (let g = 0; g < SCALAR_GENE_COUNT; g++)
      s.scalarGenes[base + g] = cfg[SCALAR_GENE_SPECS[g]!.centerKey];
    s.fertHere[i] = cfg.foodCap / 2; // fertN = min((foodCap/2)/foodCap, 1) = 0.5
    const b = i * BRAIN_GENES;
    s.brain[b + Brain.FERT_TURN] = 0.06;
    s.brain[b + Brain.FERT_THRUST] = 0.04;
    s.resetLearned(i);
    s.rebuildLive();
    const h0 = s.heading[i]!;
    const st = computeBrainState(s, cfg, i);
    steer(s, false, cfg.eligLambda, cfg.motorSquash, cfg);
    expect(st.turn).toBeCloseTo(s.heading[i]! - h0, 10);
    expect(st.thrust).toBeCloseTo(Math.hypot(s.forceX[i]!, s.forceY[i]!), 10);
    const fertNode = st.inputs.find((n) => n.label === 'fert')!;
    expect(fertNode.value).toBeCloseTo(0.5, 10);
    expect(Math.abs(st.turn)).toBeGreaterThan(1e-6); // guard: the fert→turn path is exercised
  });
```

- [ ] **Step 2: Run, verify it fails**

Run: `npx vitest run src/app/observability/brain-view.test.ts -t "fertility-under-foot"`
Expected: FAIL (no `fert` node; inspector still uses the `0` stub → parity mismatch on `st.turn`).

- [ ] **Step 3: Read + wire fert in `steer()`**

In `src/core/brain.ts`, in the `if (bodySense)` own-body block (which already computes sizeN/dietN/crowdN), add fertN:

```ts
      fertN = fertHere[i]! / foodCap;
      if (fertN > 1) fertN = 1;
      turnRaw += learnedBrain[b + Brain.FERT_TURN]! * fertN;
      thrustRaw += learnedBrain[b + Brain.FERT_THRUST]! * fertN;
```

Declare `let fertN = 0;` alongside `sizeN/dietN/crowdN` (before the `if (bodySense)`). Add `fertHere` to steer's `store` destructure and `const foodCap = cfg.foodCap;` to the config locals.

- [ ] **Step 4: Feed the hidden layer**

In the `if (hiddenLayer)` block, after `hidIn[HiddenInput.CROWD] = crowdN;` add:

```ts
      hidIn[HiddenInput.FERT] = fertN; // 0 when !bodySense
```

- [ ] **Step 5: Add eligibility (FERT learns)**

In the learn branch, in the `if (bodySense)` elig block that A1b added for CROWD, add the FERT pair:

```ts
      elig[b + Brain.FERT_TURN] = keep * elig[b + Brain.FERT_TURN]! + eligLambda * fertN * turnRaw;
      elig[b + Brain.FERT_THRUST] =
        keep * elig[b + Brain.FERT_THRUST]! + eligLambda * fertN * thrustRaw;
```

(SIZE/DIET still get NO eligibility.)

- [ ] **Step 6: Update the inspector (`computeBrainState`)**

In `src/app/observability/brain-view.ts`, extend the body-sense block to compute + push fert:

```ts
    crowdN = Math.min(store.crowding[slot]! / cfg.crowdSenseNorm, 1);
    fertN = Math.min(store.fertHere[slot]! / cfg.foodCap, 1);
    inputs.push(node('size', sizeN, Brain.SIZE_TURN, Brain.SIZE_THRUST, HiddenInput.SIZE));
    inputs.push(node('diet', dietN, Brain.DIET_TURN, Brain.DIET_THRUST, HiddenInput.DIET));
    inputs.push(node('crowd', crowdN, Brain.CROWD_TURN, Brain.CROWD_THRUST, HiddenInput.CROWD));
    inputs.push(node('fert', fertN, Brain.FERT_TURN, Brain.FERT_THRUST, HiddenInput.FERT));
```

Declare `let fertN = 0;` with the other body-sense locals. In the `hin` array, replace the Task 1 stub line `0, // FERT (A1c)…` with `fertN,`.

- [ ] **Step 7: Run the parity + full suite**

Run: `npx vitest run src/app/observability/brain-view.test.ts` → all PASS (new fert test + the existing A1a/A1b/hunger/drift tests; the documented-order tests now need `'fert'` after `'crowd'` — add it to those expected arrays, between `'crowd'` and `'glow fwd'`, if they fail).
Run: `npx vitest run src/core/world.test.ts` → green.
Run: `NODE_OPTIONS=--expose-gc npx vitest run` → FULL suite green. `npx tsc --noEmit` + `npx eslint` on the changed files → clean.

- [ ] **Step 8: Commit**

```bash
git add src/core/brain.ts src/app/observability/brain-view.ts src/app/observability/brain-view.test.ts
git commit -m "feat(brain): A1c — steer reads fertility-under-foot (learns) + inspector parity"
```

---

### Task 4: Liveness + honest measurement (expect LIVE)

Prove the world survives and measure whether fertility-under-foot registers — expected to be the FIRST genuinely-live A1 input (biomass-under-foot is nonzero in pockets).

**Files:**
- Modify: `src/headless/intero-probe.ts` (extend) — add a fertHere readout.

- [ ] **Step 1: Liveness**

Run: `NODE_OPTIONS=--expose-gc npx tsx src/headless/liveness-probe.ts 4000 3` → `LIVENESS: PASS`. Record pop + FORAGE_PREF/DIET.

- [ ] **Step 2: Add a fertHere readout to the probe**

Extend `src/headless/intero-probe.ts` to report over the live population (bodySense ON): **mean / max / fraction-nonzero of `store.fertHere`** AND the normalized `min(fertHere/foodCap,1)` mean (the actual brain input value). Keep the A1a/A1b readouts intact.

```ts
// after the run, with `s = world.store`, `cap = world.config.foodCap`:
let sum = 0, max = 0, nonzero = 0, nsum = 0;
for (let k = 0; k < s.liveCount; k++) {
  const f = s.fertHere[s.liveIndices[k]!]!;
  sum += f; if (f > max) max = f; if (f > 0) nonzero++;
  nsum += Math.min(f / cap, 1);
}
process.stdout.write(
  `fertHere: mean ${(sum / Math.max(1, s.liveCount)).toFixed(2)} max ${max.toFixed(1)} ` +
  `nonzero ${((100 * nonzero) / Math.max(1, s.liveCount)).toFixed(1)}% | normalized-input mean ` +
  `${(nsum / Math.max(1, s.liveCount)).toFixed(3)} (foodCap ${cap})\n`,
);
```

- [ ] **Step 3: Run + interpret honestly**

Run: `npx tsx src/headless/intero-probe.ts 8000 1` (+ seeds 2, 3).
**Interpret honestly:** report the mean/max/nonzero% + the normalized-input mean. Expect fertHere to be LIVE (most creatures sit on SOME biomass → nonzero% high, normalized-input mean meaningfully > 0 with real spread). If so, state it plainly (this is the first engaged A1 input). If it's surprisingly low (e.g. creatures sit mostly on grazed-down cells), report THAT honestly. Whether evolution RECRUITS it into settle/leave behavior is a separate, unproven question — do not claim recruitment without evidence.

- [ ] **Step 4: Commit + record**

```bash
git add src/headless/intero-probe.ts
git commit -m "test(brain): A1c fertility probe — measure fertHere registration at demo scale (honest)"
```

Record the numbers + verdict in the bead `life-sim-j606` and the roadmap before merging.

---

## Verification (before merge to main)

- [ ] `NODE_OPTIONS=--expose-gc npx vitest run` → full suite green; `npx tsc --noEmit` + `npx eslint src` clean.
- [ ] `liveness-probe.ts 4000 3` → PASS. fertHere readout recorded with an honest verdict (expected LIVE).
- [ ] `git log -1 main` re-checked; FF/merge A1c; update roadmap (A1 bucket COMPLETE); `bd close life-sim-j606`; `bd sync --flush-only`.

## Self-review (coverage vs spec)

- Spec "fertility-under-foot = sample the food field value at the body, distinct from the gradient" → Task 2 `senseFertility` (total biomass). ✓
- Spec normalization correction (`foodCap`, not foodMaxFertility) → documented in Global Constraints + Task 3. ✓ (flag to owner)
- Spec "it varies → can learn" → Task 3 Step 5 eligibility. ✓
- Spec "always-drawn, forward-pass-gated, no golden hash" → Task 1 + Task 3. ✓
- Spec "measure honestly" → Task 4 (expected the first LIVE A1 input). ✓
- A1a/A1b coupling lesson (steer + inspector parity together) → Task 3 merged. ✓
