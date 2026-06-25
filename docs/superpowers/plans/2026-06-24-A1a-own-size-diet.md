# A1a — own-SIZE + own-DIET interoceptive inputs — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give each creature two interoceptive brain inputs — its own normalized SIZE and its own DIET — wired into both the linear sensor→motor map and the hidden layer, so behavior can become conditional on the body. Seeded 0 → additive/liveness-safe → evolves in.

**Architecture:** Extend the unified brain genome (genome.ts) following the always-drawn, forward-pass-gated convention (the eat-gate/age/readiness/glow precedent — NOT the draw-skip wall/flow/hunger/phero convention). Append 4 named linear synapses after slot 44, insert 2 `HiddenInput` rows before BIAS; all post-`HIDDEN_W1` offsets are derived constants and recompute. Wire `steer()` (brain.ts) to read SIZE/DIET from the scalar genes (already in scope), gated on a new `cfg.bodySense` flag. Mirror in the inspector (brain-view.ts) for parity. SIZE/DIET are constant within a life → **evolve-only (no eligibility traces)** to avoid the bias positive-feedback runaway `learn()` guards against.

**Tech Stack:** TypeScript, Vitest. Deterministic SoA sim core (`src/core/`), shared by the WebGL app (`src/app/`) and headless probes (`src/headless/`).

## Global Constraints

- **Determinism is the ONLY invariant:** same `(config, seed)` → byte-identical hash run-to-run (`world.test.ts` first test). RNG consumed ONLY at reproduction, ascending live-slot order; hot loop RNG-free. NO golden hash to update (retired, `world.test.ts:23`). NO draw-skip gymnastics for this feature (new-feature on-by-default policy).
- **On-by-default:** `cfg.bodySense` defaults `true`. The flag gates only the `steer()` forward pass; the new weights are ALWAYS drawn (so toggling the flag does not change the RNG stream — the two configs share an identical seeded genome).
- **Layout math (A1a target):** `NAMED_BRAIN_GENES 45→49`, `HIDDEN_INPUTS 20→22`, `HIDDEN_W1=49`, `HIDDEN_W2=137`, `GLOW_BIAS=149`, `BRAIN_GENES 146→158`. New `Brain` slots: `SIZE_TURN=45, SIZE_THRUST=46, DIET_TURN=47, DIET_THRUST=48`. New `HiddenInput` slots: `SIZE=19, DIET=20`, `BIAS` moves `19→21`.
- **Commands:** tests `NODE_OPTIONS=--expose-gc npx vitest run` (full ~300s) or a single file `npx vitest run <file>`; types `npx tsc --noEmit`; lint `npx eslint src`. `make` fails in a worktree — run npx directly. Commit hook BLOCKS the `Co-Authored-By` trailer — omit it.
- **Normalization:** `sizeN = size / (2·cfg.cellRadius)` (cellRadius default 6 → divisor 12); `dietN = diet` (gene already 0..1).
- **No eligibility for SIZE/DIET** (evolve-only). Do NOT add them to the `learn()` bias-exclusion list — leaving their eligibility unwritten (stays 0) already pins their learned weight to the genome.

---

### Task 1: Genome layout + `bodySense` config flag

Grow the brain genome to carry the two new inputs (weights drawn but not yet read by `steer()` → inert this task, the world stays deterministic). Add the config flag.

**Files:**
- Modify: `src/core/genome.ts` — `Brain` enum (after slot 44), `NAMED_BRAIN_GENES`, `HiddenInput` enum (before BIAS), `HIDDEN_INPUTS`, `FOUNDER_BRAIN` array.
- Modify: `src/core/config.ts` — `Config` interface (near `readinessSense`, ~line 440) + `defaultConfig` (near line 772).
- Test: `src/core/genome.test.ts` — the layout-lock describe block (lines 30-50).

**Interfaces:**
- Produces: `Brain.SIZE_TURN=45, Brain.SIZE_THRUST=46, Brain.DIET_TURN=47, Brain.DIET_THRUST=48`; `HiddenInput.SIZE=19, HiddenInput.DIET=20, HiddenInput.BIAS=21`; `NAMED_BRAIN_GENES=49`, `HIDDEN_INPUTS=22`, `BRAIN_GENES=158`; `cfg.bodySense: boolean` (default true).

- [ ] **Step 1: Update the layout-lock test to the A1a target (failing test)**

In `src/core/genome.test.ts`, replace the three `it(...)` blocks at lines 31-50 with:

```ts
  it('places the 16-synapse scent block at 20..35 and the interoceptive tail after readiness', () => {
    expect(Brain.PHERO_C0_LAT_TURN).toBe(20);
    expect(Brain.PHERO_C3_FWD_THRUST).toBe(35);
    expect(Brain.EAT_GATE_BIAS).toBe(36);
    expect(Brain.READINESS_THRUST).toBe(44);
    // A1a: own-SIZE / own-DIET linear synapses appended after readiness.
    expect(Brain.SIZE_TURN).toBe(45);
    expect(Brain.DIET_THRUST).toBe(48);
    expect(NAMED_BRAIN_GENES).toBe(49);
  });
  it('grows the hidden layer to carry own-SIZE + own-DIET (22 inputs)', () => {
    expect(SCENT_CHANNELS).toBe(4);
    expect(HIDDEN_INPUTS).toBe(22);
    expect(HiddenInput.SCENT_C0_FWD).toBe(8);
    expect(HiddenInput.SCENT_C3_LAT).toBe(15);
    expect(HiddenInput.SIZE).toBe(19);
    expect(HiddenInput.DIET).toBe(20);
    expect(HiddenInput.BIAS).toBe(21);
  });
  it('derives downstream offsets from the unified sizes', () => {
    expect(HIDDEN_W1).toBe(NAMED_BRAIN_GENES); // 49
    expect(HIDDEN_W2).toBe(HIDDEN_W1 + HIDDEN_INPUTS * HIDDEN_UNITS); // 137
    expect(GLOW_BIAS).toBe(HIDDEN_W2 + HIDDEN_UNITS * HIDDEN_OUTPUTS); // 149
    expect(BRAIN_GENES).toBe(158);
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/core/genome.test.ts -t "unified brain layout"`
Expected: FAIL (`Brain.SIZE_TURN` is undefined; `NAMED_BRAIN_GENES` is 45, not 49).

- [ ] **Step 3: Add the `Brain` enum slots + bump `NAMED_BRAIN_GENES`**

In `src/core/genome.ts`, in the `Brain` object, immediately after `READINESS_THRUST: 44,` (line 442) add:

```ts
  // A1a interoceptive own-body inputs: the creature senses its own SIZE (normalized) and DIET on their own
  // turn/thrust synapses. Appended after the named tail (untouched draw-skip ranges at 10..35) so only the
  // derived hidden offsets shift. Seeded 0 → additive; evolve-only (constant-within-life → no eligibility).
  SIZE_TURN: 45,
  SIZE_THRUST: 46,
  DIET_TURN: 47,
  DIET_THRUST: 48,
```

Then change `export const NAMED_BRAIN_GENES = 45;` (line 449) to `export const NAMED_BRAIN_GENES = 49;`.

- [ ] **Step 4: Add the `HiddenInput` slots + bump `HIDDEN_INPUTS`**

In `src/core/genome.ts`, in the `HiddenInput` object, change the tail (lines 472-475) from:

```ts
  HUNGER: 16,
  AGE: 17,
  READINESS: 18,
  BIAS: 19,
} as const;
```

to:

```ts
  HUNGER: 16,
  AGE: 17,
  READINESS: 18,
  SIZE: 19, // A1a: own normalized SIZE feeds the hidden layer (conditional logic on body size)
  DIET: 20, // A1a: own DIET feeds the hidden layer (conditional logic on trophic role)
  BIAS: 21,
} as const;
```

Then change `export const HIDDEN_INPUTS = 20;` (line 490) to `export const HIDDEN_INPUTS = 22; // +SIZE +DIET (A1a)`.

- [ ] **Step 5: Grow the `FOUNDER_BRAIN` array (4 new zeros)**

In `src/core/genome.ts`, in `FOUNDER_BRAIN`, after the age/readiness line `0, 0.3, 0, 0,` (line 542) add a new line:

```ts
  // A1a own-SIZE/own-DIET (45-48): SIZE_TURN, SIZE_THRUST, DIET_TURN, DIET_THRUST — seed 0 (response evolves).
  0, 0, 0, 0,
```

(The hidden block below auto-grows via `new Array(HIDDEN_INPUTS * HIDDEN_UNITS + …)`; no other FOUNDER_BRAIN edit.)

- [ ] **Step 6: Add the `bodySense` config flag**

In `src/core/config.ts`, in the `Config` interface after the `readinessSense: boolean;` declaration (~line 440), add:

```ts
  /** A1a interoceptive body sense: feed own-SIZE (= SIZE/(2·cellRadius)) and own-DIET (0..1) as brain inputs
   *  (both the linear map and the hidden layer), so behaviour can be conditional on the body. Gates only the
   *  steer() forward pass; the synapses are always drawn (on-by-default policy). */
  bodySense: boolean;
```

In `defaultConfig`, after the `readinessSense: true,` line (~line 772), add:

```ts
    bodySense: true, // ON by default: the brain senses its own size + diet (A1a interoceptive inputs)
```

- [ ] **Step 7: Run the layout test + full type/lint/suite**

Run: `npx vitest run src/core/genome.test.ts -t "unified brain layout"`
Expected: PASS.
Run: `npx tsc --noEmit` → clean. `npx eslint src/core/genome.ts src/core/config.ts` → clean.
Run: `NODE_OPTIONS=--expose-gc npx vitest run` → ALL green. (The new weights are drawn but unread → the world is deterministic; existing ablation tests still hold because every config grew the genome equally. If `config.test.ts` snapshots the config key set, update its expected key list to include `bodySense`.)

- [ ] **Step 8: Commit**

```bash
git add src/core/genome.ts src/core/config.ts src/core/genome.test.ts
git commit -m "feat(brain): A1a layout — own-SIZE/own-DIET genome slots + bodySense flag (BRAIN_GENES 146→158)"
```

---

### Task 2: Wire own-SIZE + own-DIET into `steer()` AND inspector parity (one task — they are coupled)

Read the two genes in `steer()`, normalize, gate on `cfg.bodySense`, add to the linear motor sum and the hidden-layer inputs (no eligibility — evolve-only). **In the SAME task**, update the inspector (`computeBrainState`) to compute the real `sizeN/dietN` and draw the two nodes — because the moment `steer()` reads size/diet (nonzero), the existing inspector parity test (`reproduces the turn and thrust that steer() applies`) FAILS until `computeBrainState` matches. (Task 1 left a `0, 0` stub in the inspector's `hin[]` to keep the suite green while steer was inert; this task replaces it.)

**Files:**
- Modify: `src/core/brain.ts` — `steer()` (flag destructure ~line 78-88; new linear block after the readiness block ~line 218; hidden-input writes ~line 234-237).
- Modify: `src/app/observability/brain-view.ts` — `computeBrainState` (compute sizeN/dietN after the readiness block ~line 201; push the size/diet nodes BEFORE the glow-sense nodes ~line 204; replace the `0, 0` stub in the `hin` array with `sizeN, dietN` ~line 235).
- Test: `src/core/world.test.ts` — `bodySense` ablation + determinism tests (~line 97).
- Test: `src/app/observability/brain-view.test.ts` — size/diet non-saturated parity test.

**Interfaces:**
- Consumes: `Brain.SIZE_TURN/SIZE_THRUST/DIET_TURN/DIET_THRUST`, `HiddenInput.SIZE/DIET`, `cfg.bodySense`, `cfg.cellRadius` (Task 1).
- Produces: `steer()` and `computeBrainState` BOTH add `w·sizeN + w·dietN` to turn/thrust + the hidden inputs when `bodySense`; SIZE/DIET get no eligibility.

- [ ] **Step 1: Write the failing ablation test**

In `src/core/world.test.ts`, after the `ageStages` ablation test (~line 97), add:

```ts
  it('bodySense OFF vs ON diverge — own-SIZE/own-DIET are read by steer (A1a wired, always-drawn)', () => {
    // Always-drawn pattern: OFF and ON share an IDENTICAL seeded genome (the weights draw regardless of the
    // flag), so divergence proves the steer() forward pass actually reads the inputs — NOT the off===baseline
    // byte-identity the draw-skip features assert.
    const off = new World(defaultConfig({ seed: 1, bodySense: false }));
    const on = new World(defaultConfig({ seed: 1, bodySense: true }));
    for (let t = 0; t < 1000; t++) {
      off.step();
      on.step();
    }
    expect(on.stateHash()).not.toBe(off.stateHash());
  });

  it('bodySense ON is deterministic (same config+seed → identical hash run-to-run)', () => {
    const a = new World(defaultConfig({ seed: 5, bodySense: true }));
    const b = new World(defaultConfig({ seed: 5, bodySense: true }));
    for (let t = 0; t < 300; t++) {
      a.step();
      b.step();
    }
    expect(a.stateHash()).toBe(b.stateHash());
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/core/world.test.ts -t bodySense`
Expected: the first test FAILS (`on` === `off` — steer doesn't read the inputs yet, so the always-drawn weights are inert and the two configs are byte-identical). The determinism test passes.

- [ ] **Step 3: Destructure the new flag/constant in `steer()`**

In `src/core/brain.ts`, after `const readinessSense = cfg.readinessSense;` (line 86) add:

```ts
  const bodySense = cfg.bodySense; // A1a: feed own-SIZE/own-DIET as interoceptive inputs
  const cellRadius = cfg.cellRadius; // SIZE normalization divisor (2·cellRadius)
```

- [ ] **Step 4: Add the linear block (after the readiness block)**

In `src/core/brain.ts`, immediately after the readiness block closes (after line 218, before the `// Hidden layer (slice E)` comment at line 220), add:

```ts
    // Interoceptive own-body inputs (A1a): own normalized SIZE + own DIET on their own synapses. Constant
    // within a life → EVOLVE-ONLY (no eligibility below; a learning synapse on a constant input is the bias
    // positive-feedback runaway learn() excludes biases for). Gated, not +0'd, so the OFF path is untouched.
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

- [ ] **Step 5: Feed the hidden layer**

In `src/core/brain.ts`, in the `if (hiddenLayer)` block, after `hidIn[HiddenInput.READINESS] = readiness;` (line 236) and before `hidIn[HiddenInput.BIAS] = 1;` (line 237), add:

```ts
      hidIn[HiddenInput.SIZE] = sizeN; // 0 when !bodySense → no hidden contribution either
      hidIn[HiddenInput.DIET] = dietN;
```

(Do NOT add eligibility traces for SIZE/DIET in the `if (!learn) continue;` block — they are evolve-only.)

- [ ] **Step 6: Run the ablation + determinism tests; confirm the inspector parity break**

Run: `npx vitest run src/core/world.test.ts -t bodySense`
Expected: BOTH PASS (ON now diverges from OFF; ON is deterministic).
Run: `npx vitest run src/app/observability/brain-view.test.ts -t "reproduces the turn and thrust"`
Expected: this existing parity test now **FAILS** — steer() includes the size/diet contribution but `computeBrainState` still uses Task 1's `0, 0` stub. This is the coupling; the next steps fix it.

- [ ] **Step 7: Write the new failing size/diet parity test**

In `src/app/observability/brain-view.test.ts`, add inside the `describe('computeBrainState', …)` block. This mirrors the existing glow-sense parity test (lines 87-111) exactly — same inline single-creature setup, the module-level `cfg` (which has `bodySense:true`, `motorSquash:false` by default), small non-saturated weights:

```ts
  it('adds own-SIZE + own-DIET nodes that match a real steer() run (A1a, non-saturated)', () => {
    // own-SIZE/own-DIET feed the linear map + hidden layer; small weights so no saturation masks a missing
    // term (the consolidation lesson). Pins the inspector to steer()'s body-sense contribution.
    const s = new OrganismStore(8);
    const i = s.alloc();
    s.heading[i] = 0;
    const base = i * SCALAR_GENE_COUNT;
    for (let g = 0; g < SCALAR_GENE_COUNT; g++)
      s.scalarGenes[base + g] = cfg[SCALAR_GENE_SPECS[g]!.centerKey];
    s.scalarGenes[base + ScalarGene.SIZE] = 12; // sizeN = 12/(2·cellRadius=12) = 1.0
    s.scalarGenes[base + ScalarGene.DIET] = 0.8;
    const b = i * BRAIN_GENES;
    s.brain[b + Brain.SIZE_TURN] = 0.05;
    s.brain[b + Brain.DIET_THRUST] = 0.07;
    s.resetLearned(i);
    s.rebuildLive();
    const h0 = s.heading[i]!;
    const st = computeBrainState(s, cfg, i);
    steer(s, false, cfg.eligLambda, cfg.motorSquash, cfg);
    expect(st.turn).toBeCloseTo(s.heading[i]! - h0, 10);
    expect(st.thrust).toBeCloseTo(Math.hypot(s.forceX[i]!, s.forceY[i]!), 10);
    const sizeNode = st.inputs.find((n) => n.label === 'size')!;
    const dietNode = st.inputs.find((n) => n.label === 'diet')!;
    expect(sizeNode.value).toBeCloseTo(1.0, 10);
    expect(dietNode.value).toBeCloseTo(0.8, 10);
    expect(Math.abs(st.turn)).toBeGreaterThan(1e-6); // guard: the size→turn path is actually exercised
  });
```

This needs no new imports (`OrganismStore`, `Brain`, `ScalarGene`, `SCALAR_GENE_COUNT`, `SCALAR_GENE_SPECS`, `BRAIN_GENES`, `steer`, `cfg` are all already imported at the top of the file). Run it: it FAILS (no `size`/`diet` node yet; the inspector still misses the size/diet terms).

- [ ] **Step 8: Compute sizeN/dietN + push the nodes in `computeBrainState`**

In `src/app/observability/brain-view.ts`, after the `readiness` block closes (before the glow-sense node pushes ~line 204) add:

```ts
  // Interoceptive own-body inputs (A1a): own normalized SIZE + own DIET, mirroring steer()'s gate (0 when
  // !bodySense). Pushed BEFORE the glow-sense nodes so existing positional input assertions are preserved.
  let sizeN = 0;
  let dietN = 0;
  if (cfg.bodySense) {
    sizeN = store.scalarGenes[sg + ScalarGene.SIZE]! / (2 * cfg.cellRadius);
    dietN = store.scalarGenes[sg + ScalarGene.DIET]!;
    inputs.push(node('size', sizeN, Brain.SIZE_TURN, Brain.SIZE_THRUST, HiddenInput.SIZE));
    inputs.push(node('diet', dietN, Brain.DIET_TURN, Brain.DIET_THRUST, HiddenInput.DIET));
  }
```

- [ ] **Step 9: Replace the Task 1 `0, 0` stub in the `hin` array with the real values**

In `src/app/observability/brain-view.ts`, in the `hin` array, replace the two stub lines Task 1 inserted:

```ts
      0, // SIZE (A1a): inert until steer() reads own-size (Task 2) — steer leaves this hidIn slot 0 too
      0, // DIET (A1a): inert until steer() reads own-diet (Task 2) — keeps inspector↔steer hidden parity
```

with the computed values:

```ts
      sizeN,
      dietN,
```

(Leave the trailing `1, // BIAS` line as-is.)

- [ ] **Step 10: Run the full suite + type/lint**

Run: `npx vitest run src/app/observability/brain-view.test.ts` → ALL PASS (the new size/diet test, AND the previously-broken `reproduces the turn and thrust` parity test now green; the hunger test's `inputs[17]` is preserved because size/diet push after readiness, before glow; the drift test references `BRAIN_GENES` so it auto-adjusts to 158).
Run: `npx tsc --noEmit` → clean. `npx eslint src/core/brain.ts src/core/world.test.ts src/app/observability/brain-view.ts` → clean.
Run: `NODE_OPTIONS=--expose-gc npx vitest run` → FULL suite green.

- [ ] **Step 11: Commit**

```bash
git add src/core/brain.ts src/core/world.test.ts src/app/observability/brain-view.ts src/app/observability/brain-view.test.ts
git commit -m "feat(brain): A1a — steer reads own-SIZE/own-DIET (evolve-only) + inspector parity + bodySense ablation"
```

---

### Task 3: Liveness guardrail + honest measurement

Prove the world survives with A1a on, and measure honestly whether own-SIZE/own-DIET actually shift behavior (vs "wired but inert").

**Files:**
- Create: `src/headless/intero-probe.ts` — a read-only probe.
- (No production code change.)

**Interfaces:**
- Consumes: `World`, `defaultConfig`, `DEMO_OVERRIDES` (from `src/headless/life-history.ts`), `ScalarGene`, `SCALAR_GENE_COUNT`, `BRAIN_GENES`.

- [ ] **Step 1: Run the liveness guardrail (ON)**

Run: `NODE_OPTIONS=--expose-gc npx tsx src/headless/liveness-probe.ts 4000 3`
Expected: `LIVENESS: PASS (no extinction)` across 3 seeds, with FORAGE_PREF/DIET mean/std reported. Record the numbers. (bodySense defaults ON, so the demo run already exercises A1a.)

- [ ] **Step 2: Write the intero-probe**

Create `src/headless/intero-probe.ts`:

```ts
/**
 * A1a measurement probe (own-SIZE / own-DIET interoceptive inputs). Read-only. Runs the demo config with
 * bodySense ON vs OFF from the same seed and reports, over the live population at the end:
 *   - pop (liveness)
 *   - the SIZE→motor relationship: bin creatures into SIZE terciles, report mean |turn| + mean forward
 *     thrust per bin. A bodySense-driven body-aware policy should show a DIFFERENT size→motor slope ON vs
 *     OFF (small bodies steering/fleeing differently from large ones). If ON ≈ OFF, the input is wired + live
 *     (the ablation test proves the forward pass runs) but evolution has NOT recruited it yet — REPORT THAT
 *     honestly (the senses-shipped-unused / E2-hungerSense risk), do not claim a behavioral win.
 * Run: npx tsx src/headless/intero-probe.ts [ticks] [seed]
 */
import { World } from '../core/world';
import { defaultConfig, type Config } from '../core/config';
import { ScalarGene, SCALAR_GENE_COUNT } from '../core/genome';
import { DEMO_OVERRIDES } from './life-history';

const TICKS = Number(process.argv[2] ?? 8000);
const SEED = Number(process.argv[3] ?? 1);

interface Bin { n: number; turnAbs: number; fwd: number; }

function measure(bodySense: boolean): { pop: number; bins: Bin[] } {
  const config: Config = defaultConfig({ seed: SEED, ...(DEMO_OVERRIDES as Partial<Config>), bodySense });
  const world = new World(config);
  for (let t = 0; t < TICKS; t++) world.step();
  const s = world.store;
  const { liveIndices, liveCount, scalarGenes, heading, forceX, forceY } = s;
  // SIZE terciles over the live population.
  const sizes: number[] = [];
  for (let k = 0; k < liveCount; k++)
    sizes.push(scalarGenes[liveIndices[k]! * SCALAR_GENE_COUNT + ScalarGene.SIZE]!);
  sizes.sort((a, b) => a - b);
  const q1 = sizes[Math.floor(liveCount / 3)] ?? 0;
  const q2 = sizes[Math.floor((2 * liveCount) / 3)] ?? 0;
  const bins: Bin[] = [
    { n: 0, turnAbs: 0, fwd: 0 },
    { n: 0, turnAbs: 0, fwd: 0 },
    { n: 0, turnAbs: 0, fwd: 0 },
  ];
  for (let k = 0; k < liveCount; k++) {
    const i = liveIndices[k]!;
    const size = scalarGenes[i * SCALAR_GENE_COUNT + ScalarGene.SIZE]!;
    const bin = size <= q1 ? 0 : size <= q2 ? 1 : 2;
    const dx = Math.cos(heading[i]!);
    const dy = Math.sin(heading[i]!);
    const fwd = forceX[i]! * dx + forceY[i]! * dy; // forward thrust component
    bins[bin]!.n++;
    bins[bin]!.fwd += fwd;
    // turn magnitude proxy: |force lateral| (off-heading push) — a fleeing/casting body turns more.
    bins[bin]!.turnAbs += Math.abs(-forceX[i]! * dy + forceY[i]! * dx);
  }
  return { pop: liveCount, bins };
}

for (const bodySense of [false, true]) {
  const { pop, bins } = measure(bodySense);
  process.stdout.write(`bodySense ${bodySense ? 'ON ' : 'OFF'} — pop ${pop}\n`);
  bins.forEach((b, idx) => {
    const lbl = ['small', 'mid  ', 'large'][idx];
    const turn = b.n ? (b.turnAbs / b.n).toFixed(3) : 'n/a';
    const fwd = b.n ? (b.fwd / b.n).toFixed(3) : 'n/a';
    process.stdout.write(`   ${lbl} (n=${b.n}): mean|lat-force| ${turn}  mean fwd-thrust ${fwd}\n`);
  });
}
process.stdout.write(
  'INTERPRET: compare the small→large slope ON vs OFF. ON≈OFF ⇒ wired+live but not yet recruited — say so.\n',
);
```

- [ ] **Step 3: Run the probe (multi-seed) and record the result**

Run: `npx tsx src/headless/intero-probe.ts 8000 1` (then repeat for seeds 2, 3).
Expected: it prints the size-binned motor stats for ON vs OFF. **Interpret honestly:** if the small→large slope differs meaningfully ON vs OFF, A1a shifted behavior — quote the numbers. If ON ≈ OFF, state that own-SIZE is wired + live (ablation proves it) but not yet recruited by evolution at demo scale.

- [ ] **Step 4: Commit + record findings**

```bash
git add src/headless/intero-probe.ts
git commit -m "test(brain): A1a intero-probe — measure own-SIZE/own-DIET behavior shift (honest)"
```

Write the measured numbers + the honest verdict into the A1a section of the roadmap and the bead `life-sim-6o2i` notes before merging.

---

## Verification (before merge to main)

- [ ] `NODE_OPTIONS=--expose-gc npx vitest run` → full suite green.
- [ ] `npx tsc --noEmit` → clean. `npx eslint src` → clean.
- [ ] `liveness-probe.ts 4000 3` → PASS.
- [ ] `intero-probe.ts` numbers recorded with an honest ON-vs-OFF verdict.
- [ ] `git log -1 main` re-checked (main moves); merge A1a; update the roadmap checkbox; `bd close life-sim-6o2i`; `bd sync --flush-only`.

## Self-review notes (coverage vs spec)

- Spec "own-SIZE/own-DIET feed both linear + hidden, seeded 0, evolve-only" → Tasks 1-2. ✓
- Spec "always-drawn, forward-pass-gated, no golden hash" → Task 1 (always-drawn weights), Task 2 (`bodySense` gates forward pass only). ✓
- Spec "inspector parity, non-saturated" → Task 2 (merged with steer — they are coupled). ✓
- Spec "ablation `false !== true`, determinism, liveness, parity" → Tasks 2-3. ✓
- Spec "measure honestly" → Task 3 (intero-probe + honest-verdict gate). ✓
- Spec normalization `size/(2·cellRadius)`, `dietN=diet` → Task 2 Step 4. ✓
