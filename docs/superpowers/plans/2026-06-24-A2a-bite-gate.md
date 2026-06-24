# A2a — BITE_GATE (brain-gated predation) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Promote predation from a reflex (auto-bite the nearest edible every tick) to a brain DECISION: a `biteGate[i]` sigmoid output, read from the hidden "mood" layer, multiplies the bite drain in `hunt()`. Seeded gate-OPEN (bite-by-default) so founding predation is unchanged and evolution can only *subtract* bites where withholding pays. It **learns** (clean energy reward). Behind `cfg.brainGatedBiting` (OFF → ×1, byte-identical).

**Architecture:** A new hidden-layer output column (the glow/eat-gate head pattern): `HIDDEN_OUTPUTS 3→4`, a named `BITE_GATE_BIAS` gene (seeded open), a `store.biteGate[]` actuator buffer. steer() computes it (with eligibility → it learns); `hunt()` gates the drain on it. The inspector renders + parity-checks it.

**Tech Stack:** TypeScript, Vitest. Deterministic SoA sim core (`src/core/`).

## Global Constraints

- **Determinism is the ONLY invariant:** same `(config, seed)` → byte-identical hash run-to-run. NO golden hash. `biteGate` is transient/derived (NOT hashed); `hunt()`'s gated drain is deterministic (biteGate computed in steer earlier the same tick).
- **Always-drawn:** `BITE_GATE_BIAS` + the new W2 column are drawn regardless of `cfg.brainGatedBiting` (toggling the flag does not change the RNG stream). The flag gates the steer forward-compute + the hunt actuator.
- **Layout (A2a):** `BITE_GATE_BIAS=53` (a `Brain` enum slot), `NAMED_BRAIN_GENES 53→54`, `HIDDEN_OUTPUTS 3→4` (biteGate = output column **3**), derived `HIDDEN_W1=54`, `HIDDEN_W2=150`, `GLOW_BIAS=166`, `BRAIN_GENES 170→175`. The W2 STRIDE grows (`w2 + j*HIDDEN_OUTPUTS + o`) — both steer and computeBrainState derive it, so it stays consistent.
- **BITE_GATE_BIAS seeds gate-OPEN:** FOUNDER_BRAIN value `4` (sigmoid(4) ≈ 0.98 → bite ~fully by default), like `EAT_GATE_BIAS`. It is EXCLUDED from learning (add to the `learn()` bias-skip list).
- **BITE learns:** the bite W2 column (col 3) gets eligibility in the hidden→output elig loop (gated on brainGatedBiting).
- **Commands:** focused `npx vitest run <file>`; full `NODE_OPTIONS=--expose-gc npx vitest run` (~300s); `npx tsc --noEmit`; `npx eslint src`. Commit hook BLOCKS `Co-Authored-By` — omit it.

---

### Task 1: Genome layout + `brainGatedBiting` config flag

Grow the genome for the bite output (drawn but unread → inert, deterministic) + add the flag.

**Files:**
- Modify: `src/core/genome.ts` — `Brain` enum (`BITE_GATE_BIAS` after `FERT_THRUST: 52`), `NAMED_BRAIN_GENES`, `HIDDEN_OUTPUTS`, `FOUNDER_BRAIN` (insert the gate-open bias).
- Modify: `src/core/config.ts` — `Config` interface + `defaultConfig`.
- Test: `src/core/genome.test.ts` — the layout-lock describe block.

**Interfaces:**
- Produces: `Brain.BITE_GATE_BIAS=53`; `NAMED_BRAIN_GENES=54`, `HIDDEN_OUTPUTS=4`, `HIDDEN_W2=150`, `GLOW_BIAS=166`, `BRAIN_GENES=175`; `cfg.brainGatedBiting` (default true).

- [ ] **Step 1: Update the layout-lock test (failing)**

In `src/core/genome.test.ts`, in the `unified brain layout` describe block, update the assertions:

```ts
  it('places the 16-synapse scent block at 20..35 and the interoceptive tail after readiness', () => {
    expect(Brain.PHERO_C0_LAT_TURN).toBe(20);
    expect(Brain.PHERO_C3_FWD_THRUST).toBe(35);
    expect(Brain.EAT_GATE_BIAS).toBe(36);
    expect(Brain.READINESS_THRUST).toBe(44);
    expect(Brain.FERT_TURN).toBe(51);
    expect(Brain.FERT_THRUST).toBe(52);
    expect(Brain.BITE_GATE_BIAS).toBe(53); // A2a: brain-gated predation output bias
    expect(NAMED_BRAIN_GENES).toBe(54);
  });
  it('grows the hidden layer to 24 inputs and 4 outputs (turn/thrust/eatGate/biteGate)', () => {
    expect(SCENT_CHANNELS).toBe(4);
    expect(HIDDEN_INPUTS).toBe(24);
    expect(HIDDEN_OUTPUTS).toBe(4);
    expect(HiddenInput.FERT).toBe(22);
    expect(HiddenInput.BIAS).toBe(23);
  });
  it('derives downstream offsets from the unified sizes', () => {
    expect(HIDDEN_W1).toBe(NAMED_BRAIN_GENES); // 54
    expect(HIDDEN_W2).toBe(HIDDEN_W1 + HIDDEN_INPUTS * HIDDEN_UNITS); // 150
    expect(GLOW_BIAS).toBe(HIDDEN_W2 + HIDDEN_UNITS * HIDDEN_OUTPUTS); // 166
    expect(BRAIN_GENES).toBe(175);
  });
```

(Add `HIDDEN_OUTPUTS` to the imports in genome.test.ts if not already imported.)

- [ ] **Step 2: Run, verify it fails**

Run: `npx vitest run src/core/genome.test.ts -t "unified brain layout"`
Expected: FAIL (`Brain.BITE_GATE_BIAS` undefined; `HIDDEN_OUTPUTS` is 3).

- [ ] **Step 3: Add the `Brain` slot + bump `NAMED_BRAIN_GENES`**

In `src/core/genome.ts`, after `FERT_THRUST: 52,` in the `Brain` object add:

```ts
  // A2a brain-gated predation: a sigmoid biteGate output (hidden-layer column) read by hunt() to scale the
  // bite drain — predation becomes a DECISION. This is the named BIAS gene; the per-unit hidden→output
  // weights live in the W2 block at output column 3. Seeded gate-OPEN (bite by default); the gate LEARNS.
  BITE_GATE_BIAS: 53,
```

Change `export const NAMED_BRAIN_GENES = 53;` to `= 54;`.

- [ ] **Step 4: Bump `HIDDEN_OUTPUTS`**

In `src/core/genome.ts`, change `export const HIDDEN_OUTPUTS = 3; // turn=0, thrust=1, eatGate=2` to:

```ts
export const HIDDEN_OUTPUTS = 4; // turn=0, thrust=1, eatGate=2, biteGate=3 (A2a)
```

- [ ] **Step 5: Seed `FOUNDER_BRAIN` gate-open**

In `src/core/genome.ts`, in `FOUNDER_BRAIN`, after the A1c fertility line `0, 0,` (FERT_TURN/FERT_THRUST) add:

```ts
  // A2a BITE_GATE_BIAS (53): seeded gate-OPEN (sigmoid(4)≈0.98 → bite by default; evolution/learning refine).
  4,
```

(The hidden block `new Array(HIDDEN_INPUTS * HIDDEN_UNITS + HIDDEN_UNITS * HIDDEN_OUTPUTS).fill(0)` auto-grows by HIDDEN_UNITS=4 for the new W2 column — no other FOUNDER_BRAIN edit.)

- [ ] **Step 6: Add the `brainGatedBiting` config flag**

In `src/core/config.ts`, in the `Config` interface near `brainGatedEating`, add:

```ts
  /** A2a brain-gated predation: when on, hunt()'s bite drain is scaled by the creature's biteGate (0..1)
   *  sigmoid output, so biting is a DECISION (graze-only vs strike). Seeded gate-open → founding predation is
   *  unchanged; the gate learns + evolves. Off → unconditional auto-bite (the legacy reflex), ×1 byte-identical. */
  brainGatedBiting: boolean;
```

In `defaultConfig`, near `brainGatedEating: true,`, add:

```ts
    brainGatedBiting: true, // ON by default: predation is a brain decision (seeded bite-open; learns)
```

- [ ] **Step 7: Run the layout test + full suite**

Run: `npx vitest run src/core/genome.test.ts -t "unified brain layout"` → PASS.
Run: `npx tsc --noEmit` → clean. `npx eslint src/core/genome.ts src/core/config.ts` → clean.
Run: `NODE_OPTIONS=--expose-gc npx vitest run` → ALL green. (The bias + W2 column are drawn but unread → deterministic. The existing inspector turn/thrust/eatGate parity tests stay green because both steer and computeBrainState derive the W2 stride from HIDDEN_OUTPUTS — the column-3 growth doesn't shift how cols 0/1/2 are read.) If `config.test.ts` snapshots keys, add `brainGatedBiting`.

- [ ] **Step 8: Commit**

```bash
git add src/core/genome.ts src/core/config.ts src/core/genome.test.ts
git commit -m "feat(brain): A2a layout — BITE_GATE_BIAS + HIDDEN_OUTPUTS 3→4 + brainGatedBiting (BRAIN_GENES 170→175)"
```

---

### Task 2: steer() computes biteGate (it LEARNS) + inspector parity

Compute the bite decision each tick into a new buffer (with eligibility → it learns) and mirror it in the inspector. `hunt()` does NOT read it yet (Task 3), so the world stays byte-identical to Task 1 (biteGate is written but unread).

**Files:**
- Modify: `src/core/store.ts` — add `biteGate` Float64Array (declaration + constructor alloc; default 1 on `alloc()` like `eatGate`).
- Modify: `src/core/brain.ts` — `steer()` computes biteGate (in the hidden block, after the eat-gate) + eligibility in the hidden→output loop; `learn()` excludes `BITE_GATE_BIAS`.
- Modify: `src/app/observability/brain-view.ts` — `computeBrainState` computes biteGate + adds it to `BrainState`; render it as a 5th output node.
- Test: `src/app/observability/brain-view.test.ts` — a non-saturated biteGate parity test.

**Interfaces:**
- Consumes: `Brain.BITE_GATE_BIAS`, `HIDDEN_OUTPUTS`, `cfg.brainGatedBiting`.
- Produces: `store.biteGate[i]` ∈ 0..1 (the bite decision); `BrainState.biteGate`.

- [ ] **Step 1: Write the failing biteGate parity test**

In `src/app/observability/brain-view.test.ts`, add. This must EXERCISE the hidden→bite W2 column (a wrong column index is only caught if the hidden activation is nonzero), so set a W1 weight to drive hidden unit 0 off a real sense, plus the bite W2 weight on that unit — non-saturated. Add `HIDDEN_W1, HIDDEN_W2, HIDDEN_OUTPUTS, HIDDEN_UNITS, HiddenInput` to the genome import in this test file.

```ts
  it('computes a biteGate output that matches a real steer() run, exercising the hidden→bite column (A2a)', () => {
    const c = defaultConfig({ brainGatedBiting: true, hiddenLayer: true });
    const s = new OrganismStore(8);
    const i = s.alloc();
    s.heading[i] = 0;
    const base = i * SCALAR_GENE_COUNT;
    for (let g = 0; g < SCALAR_GENE_COUNT; g++)
      s.scalarGenes[base + g] = c[SCALAR_GENE_SPECS[g]!.centerKey];
    const b = i * BRAIN_GENES;
    // Drive hidden unit 0 off food-fwd, then feed it to the biteGate column (3). Small weights → non-saturated
    // sigmoid, so a wrong W2 column (e.g. reading eatGate col 2 = 0) would change biteGateRaw and fail parity.
    s.brain[b + Brain.BITE_GATE_BIAS] = 0.3;
    s.brain[b + HIDDEN_W1 + HiddenInput.FOOD_FWD * HIDDEN_UNITS + 0] = 0.8; // food-fwd → hidden unit 0
    s.brain[b + HIDDEN_W2 + 0 * HIDDEN_OUTPUTS + 3] = 0.6; // hidden unit 0 → biteGate column (3)
    s.senseX[i] = 0.5; // heading 0 → fwd = 0.5 → hAct[0] = tanh(0.5·0.8) ≈ 0.38 (nonzero)
    s.resetLearned(i);
    s.rebuildLive();
    const st = computeBrainState(s, c, i);
    steer(s, false, c.eligLambda, c.motorSquash, c);
    expect(st.biteGate).toBeCloseTo(s.biteGate[i]!, 10); // inspector == sim
    // The hidden→bite term is genuinely contributing (not just the bias): biteGate ≈ sigmoid(0.3 + 0.38·0.6).
    expect(st.biteGate).toBeGreaterThan(0.5);
    expect(st.biteGate).toBeLessThan(0.7); // non-saturated (would be ~1 if it read a saturating path)
  });
```

- [ ] **Step 2: Run, verify it fails**

Run: `npx vitest run src/app/observability/brain-view.test.ts -t biteGate`
Expected: FAIL (`s.biteGate` undefined and/or `st.biteGate` undefined — neither computed yet).

- [ ] **Step 3: Add the `biteGate` store buffer**

In `src/core/store.ts`, after the `eatGate` buffer declaration add:

```ts
  // Transient per-tick BITE-GATE actuator (0..1): the brain's predation decision (A2a). Recomputed each tick
  // in steer(); read by hunt() to scale the bite drain. Not hashed (derived). Defaults to 1 (bite-open) on
  // alloc for the edge-case pre-steer read.
  readonly biteGate: Float64Array;
```

In the constructor, after `this.eatGate = new Float64Array(capacity);`, add `this.biteGate = new Float64Array(capacity);`. In `alloc()`, after `this.eatGate[slot] = 1;`, add `this.biteGate[slot] = 1;`.

- [ ] **Step 4: Compute biteGate in steer()**

In `src/core/brain.ts`: add `const brainGatedBiting = cfg.brainGatedBiting;` to the flag locals; add `biteGate` to the `store` destructure; add `import { ... BITE_GATE_BIAS ... }`? — NO: `BITE_GATE_BIAS` is a `Brain` enum member, so reference it as `Brain.BITE_GATE_BIAS` (Brain is already imported). Declare `let biteGateRaw = 0;` near `let eatGateRaw = 0;`. After the mood-glow block (or after the eat-gate block), add:

```ts
    // Brain-gated bite (A2a): a sigmoid decision read from the hidden "mood" layer (output column 3) + a bias.
    // hunt() scales the bite drain by this. Gated by brainGatedBiting; seeded gate-open so it only subtracts.
    if (brainGatedBiting) {
      biteGateRaw = learnedBrain[b + Brain.BITE_GATE_BIAS]!;
      if (hiddenLayer) {
        const w2 = b + HIDDEN_W2;
        for (let j = 0; j < HIDDEN_UNITS; j++)
          biteGateRaw += hAct[j]! * learnedBrain[w2 + j * HIDDEN_OUTPUTS + 3]!;
      }
      biteGate[i] = 1 / (1 + Math.exp(-biteGateRaw));
    }
```

- [ ] **Step 5: Add biteGate eligibility (it learns) + exclude its bias from learning**

In `src/core/brain.ts`, in the hidden→output eligibility loop (inside `if (hiddenLayer)` in the learn branch — the loop that does `elig[o+0]`, `elig[o+1]`, `elig[o+2]`), add a 4th line guarded on brainGatedBiting:

```ts
        if (brainGatedBiting) elig[o + 3] = keep * elig[o + 3]! + eligLambda * a * biteGateRaw;
```

In `learn()`, extend the bias-skip guard to exclude the new bias:

```ts
      if (g === Brain.TURN_BIAS || g === Brain.THRUST_BIAS || g === Brain.EAT_GATE_BIAS || g === Brain.BITE_GATE_BIAS) continue;
```

- [ ] **Step 6: Mirror biteGate in computeBrainState + render it**

In `src/app/observability/brain-view.ts`: add `biteGate: number` to the `BrainState` interface. In `computeBrainState`, after the eat-gate block, add (mirror steer exactly):

```ts
  let biteGate = 0;
  if (cfg.brainGatedBiting) {
    let biteGateRaw = lb[b + Brain.BITE_GATE_BIAS]!;
    if (cfg.hiddenLayer) {
      for (let j = 0; j < HIDDEN_UNITS; j++)
        biteGateRaw += hidden[j]! * lb[b + HIDDEN_W2 + j * HIDDEN_OUTPUTS + 3]!;
    }
    biteGate = 1 / (1 + Math.exp(-biteGateRaw));
  }
```

Add `biteGate` to the returned `BrainState`. In `render()`, draw it as a 5th output: change the `outY` denominator from the hardcoded `5` to scale with the output count (now 5: turn/thrust/eat/glow/bite), and add `drawOut(4, 'bite', st.biteGate);`. (Match the existing `drawOut`/`outY` structure; keep glow at index 3, bite at 4.)

- [ ] **Step 7: Run the parity test + full suite**

Run: `npx vitest run src/app/observability/brain-view.test.ts` → all PASS (new biteGate test + existing parity/hunger/drift tests — biteGate doesn't touch turn/thrust/eatGate, so those stay green).
Run: `npx vitest run src/core/world.test.ts` → green (biteGate computed + learned but UNREAD by hunt → world byte-identical to Task 1; biteGate/elig/learnedBrain are not hashed).
Run: `npx tsc --noEmit` + `npx eslint` on the changed files → clean. Then the FULL suite → green.

- [ ] **Step 8: Commit**

```bash
git add src/core/store.ts src/core/brain.ts src/app/observability/brain-view.ts src/app/observability/brain-view.test.ts
git commit -m "feat(brain): A2a — steer computes biteGate (learns) + inspector parity (unread by hunt yet)"
```

---

### Task 3: `hunt()` gates the drain on biteGate

Now make the bite a real decision: the drain scales by biteGate.

**Files:**
- Modify: `src/core/economy.ts` — `hunt()` (read `store.biteGate`, scale the drain behind `cfg.brainGatedBiting`).
- Test: `src/core/economy.test.ts` — a unit test (biteGate=0 → no drain; biteGate=1 → full drain).
- Test: `src/core/world.test.ts` — a determinism test (brainGatedBiting on, run twice → identical hash).

**Interfaces:**
- Consumes: `store.biteGate[i]` (Task 2), `cfg.brainGatedBiting`.
- Produces: `hunt()` drains `min(DAMAGE·diet, preyEnergy)·biteGate[i]` when `brainGatedBiting` (×1 when off).

- [ ] **Step 1: Write the failing hunt unit test**

In `src/core/economy.test.ts`, add (a predator above prey, in range; gate 0 vs 1). Match the file's existing `hunt` test setup (it already builds a store + hash + cfg). The crisp assertions:

```ts
  it('brain-gated bite: biteGate 0 → no drain, biteGate 1 → full drain (A2a)', () => {
    const cfg = defaultConfig({ brainGatedBiting: true, cannibalism: false });
    const mk = (gate: number): { preyEnergy: number; predEnergy: number } => {
      const s = new OrganismStore(4);
      const pred = s.alloc(); const prey = s.alloc();
      // predator: diet 1, big; prey: diet 0, small; within biteRange.
      s.x[pred] = 100; s.y[pred] = 100; s.x[prey] = 100 + cfg.biteRange / 2; s.y[prey] = 100;
      const set = (slot: number, diet: number, size: number, dmg: number, e: number): void => {
        const g = slot * SCALAR_GENE_COUNT;
        s.scalarGenes[g + ScalarGene.DIET] = diet;
        s.scalarGenes[g + ScalarGene.SIZE] = size;
        s.scalarGenes[g + ScalarGene.DAMAGE] = dmg;
        s.energy[slot] = e;
      };
      set(pred, 1, cfg.cellRadius * 2, 5, 50); // big hunter, DAMAGE 5
      set(prey, 0, cfg.cellRadius, 0, 50); // small grazer
      s.biteGate[pred] = gate; s.biteGate[prey] = gate;
      s.rebuildLive();
      const hash = new SpatialHash(cfg.worldWidth, cfg.worldHeight, 2 * cfg.cellRadius, s.capacity);
      hash.build(s);
      hunt(s, hash, cfg);
      return { preyEnergy: s.energy[prey]!, predEnergy: s.energy[pred]! };
    };
    expect(mk(0).preyEnergy).toBe(50); // gate shut → no bite, prey untouched
    expect(mk(1).preyEnergy).toBeLessThan(50); // gate open → bite lands
  });
```

(Confirm `hunt`, `SpatialHash`, `defaultConfig`, `ScalarGene`, `SCALAR_GENE_COUNT` imports match economy.test.ts's existing ones; reuse the file's hunt-test scaffolding if present.)

- [ ] **Step 2: Run, verify it fails**

Run: `npx vitest run src/core/economy.test.ts -t "brain-gated bite"`
Expected: FAIL (`mk(0).preyEnergy` is < 50 — hunt still bites unconditionally; the gate isn't read yet).

- [ ] **Step 3: Gate the drain in hunt()**

In `src/core/economy.ts` `hunt()`: add `const { biteGate } = store;` to the destructure and `const brainGatedBiting = cfg.brainGatedBiting;`. At the drain computation (~line 112), change:

```ts
    const drain = Math.min(scalarGenes[sg + ScalarGene.DAMAGE]! * diet, energy[best]!);
```

to:

```ts
    let drain = Math.min(scalarGenes[sg + ScalarGene.DAMAGE]! * diet, energy[best]!);
    if (brainGatedBiting) drain *= biteGate[i]!; // brain decides the strike (×1 when off = byte-identical)
```

(The existing `if (drain <= 0) continue;` then skips a fully-closed gate. The counterBite + predationGain still apply to the gated drain.)

- [ ] **Step 4: Write the determinism test**

In `src/core/world.test.ts` add:

```ts
  it('brainGatedBiting ON is deterministic (A2a — same config+seed → identical hash run-to-run)', () => {
    const a = new World(defaultConfig({ seed: 3, brainGatedBiting: true }));
    const b = new World(defaultConfig({ seed: 3, brainGatedBiting: true }));
    for (let t = 0; t < 300; t++) { a.step(); b.step(); }
    expect(a.stateHash()).toBe(b.stateHash());
  });
```

- [ ] **Step 5: Run the tests + full suite**

Run: `npx vitest run src/core/economy.test.ts -t "brain-gated bite"` → PASS.
Run: `npx vitest run src/core/world.test.ts -t brainGatedBiting` → PASS.
Run: `npx tsc --noEmit` + `npx eslint` on changed files → clean. Then the FULL suite → green.

- [ ] **Step 6: Commit**

```bash
git add src/core/economy.ts src/core/economy.test.ts src/core/world.test.ts
git commit -m "feat(economy): A2a — hunt() gates the bite drain on biteGate (predation is a decision)"
```

---

### Task 4: Liveness + honest predation measurement

Prove the world survives and MEASURE whether brain-gated bite suppresses the (already-fragile) predation.

**Files:**
- Create: `src/headless/bite-gate-probe.ts` (read-only).

**Interfaces:**
- Consumes: `World`, `defaultConfig`, `DEMO_OVERRIDES`, `store.biteGate`, `ScalarGene`.

- [ ] **Step 1: Liveness**

Run: `NODE_OPTIONS=--expose-gc npx tsx src/headless/liveness-probe.ts 4000 3` → `LIVENESS: PASS`. Record pop + DIET mean/std (the predator-fraction proxy).

- [ ] **Step 2: Write the bite-gate probe**

Create `src/headless/bite-gate-probe.ts` that runs the demo config `brainGatedBiting` ON vs OFF from the same seed and reports, at the end of the run, over the live population: **pop, predator fraction (diet ≥ 0.5), mean DIET, and (ON only) the mean + spread of `store.biteGate` ACROSS PREDATORS** (the direct "are predators evolving to bite less?" signal — if the gate evolves toward 0, predation is being suppressed by the decision; if it stays ~open, it isn't).

```ts
/**
 * A2a measurement: does brain-gated bite suppress the (already engine-ceiling-fragile) predation? Runs the
 * demo config brainGatedBiting ON vs OFF and reports predator fraction + the evolved biteGate spread across
 * predators. Read-only. Run: npx tsx src/headless/bite-gate-probe.ts [ticks] [seed]
 */
import { World } from '../core/world';
import { defaultConfig, type Config } from '../core/config';
import { ScalarGene, SCALAR_GENE_COUNT } from '../core/genome';
import { DEMO_OVERRIDES } from './life-history';

const TICKS = Number(process.argv[2] ?? 8000);
const SEED = Number(process.argv[3] ?? 1);

for (const brainGatedBiting of [false, true]) {
  const config: Config = defaultConfig({ seed: SEED, ...(DEMO_OVERRIDES as Partial<Config>), brainGatedBiting });
  const world = new World(config);
  for (let t = 0; t < TICKS; t++) world.step();
  const s = world.store;
  let pred = 0, dietSum = 0, gSum = 0, gMin = 1, gMax = 0;
  for (let k = 0; k < s.liveCount; k++) {
    const i = s.liveIndices[k]!;
    const diet = s.scalarGenes[i * SCALAR_GENE_COUNT + ScalarGene.DIET]!;
    dietSum += diet;
    if (diet >= 0.5) {
      pred++;
      const g = s.biteGate[i]!;
      gSum += g; if (g < gMin) gMin = g; if (g > gMax) gMax = g;
    }
  }
  const pop = s.liveCount;
  process.stdout.write(
    `brainGatedBiting ${brainGatedBiting ? 'ON ' : 'OFF'} — pop ${pop} predFrac ${((100 * pred) / Math.max(1, pop)).toFixed(1)}% meanDiet ${(dietSum / Math.max(1, pop)).toFixed(3)}` +
    (brainGatedBiting ? ` | predators' biteGate mean ${pred ? (gSum / pred).toFixed(3) : 'n/a'} [${gMin.toFixed(2)}..${gMax.toFixed(2)}] over ${pred} predators` : '') + '\n',
  );
}
process.stdout.write('INTERPRET: predFrac ON vs OFF (suppression?) + the predators biteGate mean (evolving shut → suppression; ~open → not). NB engine ceiling: predation is fragile regardless.\n');
```

- [ ] **Step 3: Run + interpret honestly**

Run: `npx tsx src/headless/bite-gate-probe.ts 8000 1` (+ seeds 2, 3).
**Interpret honestly:** compare predFrac ON vs OFF. If ON ≈ OFF predFrac and predators' biteGate mean stays ~open (≈0.9+), brain-gated bite does NOT suppress predation (the seeded-open mitigation worked). If predFrac drops ON and/or biteGate evolves toward 0, it DOES suppress — say so plainly. Either way quote the numbers, and note the predation-engine ceiling (predation barely happens regardless; the real payoff is gated on Bucket B concentrating prey).

- [ ] **Step 4: Commit + record**

```bash
git add src/headless/bite-gate-probe.ts
git commit -m "test(economy): A2a bite-gate probe — measure predation suppression honestly"
```

Record the numbers + verdict in bead `life-sim-tmvb` and the roadmap before merging.

---

## Verification (before merge to main)

- [ ] `NODE_OPTIONS=--expose-gc npx vitest run` → full suite green; `npx tsc --noEmit` + `npx eslint src` clean.
- [ ] `liveness-probe.ts 4000 3` → PASS. Bite-gate probe numbers recorded with an honest suppression verdict.
- [ ] `git log -1 main` re-checked; FF/merge A2a; update roadmap; `bd close life-sim-tmvb`; `bd sync --flush-only`.

## Self-review (coverage vs spec)

- Spec "BITE_GATE = sigmoid(bias + hidden·W2col), seeded gate-open, behind brainGatedBiting, ×1 byte-identical OFF" → Tasks 1-3. ✓
- Spec "BITE learns (eligibility)" → Task 2 Step 5. ✓
- Spec "gate the drain at hunt() ~:112" → Task 3 Step 3. ✓
- Spec "steer-output + inspector parity in one task" → Task 2 (merged). ✓
- Spec "measure honestly — does it suppress predation" → Task 4. ✓
- Spec "HIDDEN_OUTPUTS 3→4, BRAIN_GENES 170→175, biteGate=col 3" → Task 1. ✓
