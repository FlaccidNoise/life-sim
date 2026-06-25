# A2b — SCENT_GATE (brain-gated scent deposit) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Promote scent deposit from a passive reflex (`gene×strength` every tick) to a brain DECISION: a `scentGate[i]` sigmoid output multiplies the deposit amount, so the brain chooses when to broadcast vs go silent — a modulable comms channel (the glow head already works this way). **Evolve-only** (scent has no direct energy consequence → no within-life reward signal). Seeded gate-OPEN. Behind `cfg.brainGatedScent` (OFF → ×1, byte-identical).

**Architecture:** A second new hidden-layer output column (the A2a/eat-gate/glow head pattern): `HIDDEN_OUTPUTS 4→5`, a named `SCENT_GATE_BIAS` gene (seeded open), a `store.scentGate[]` buffer. steer() computes it (NO eligibility — evolve-only); `depositScent()` multiplies the deposit by it. The inspector renders + parity-checks it.

**Tech Stack:** TypeScript, Vitest. Deterministic SoA sim core (`src/core/`).

## Global Constraints

- **Determinism is the ONLY invariant:** same `(config, seed)` → byte-identical hash run-to-run. NO golden hash. `scentGate` is transient/derived (NOT hashed); `depositScent` is RNG-free, ascending order; scentGate is computed in steer earlier the same tick.
- **Always-drawn:** `SCENT_GATE_BIAS` + the new W2 column draw regardless of `cfg.brainGatedScent`. The flag gates the steer forward-compute + the depositScent multiply (OFF → ×1 = byte-identical to the passive reflex).
- **Layout (A2b):** `SCENT_GATE_BIAS=54` (a `Brain` enum slot), `NAMED_BRAIN_GENES 54→55`, `HIDDEN_OUTPUTS 4→5` (scentGate = output column **4**), derived `HIDDEN_W1=55`, `HIDDEN_W2=151`, `GLOW_BIAS=171`, `BRAIN_GENES 175→180`.
- **SCENT_GATE_BIAS seeds gate-OPEN** (FOUNDER_BRAIN value `4`) and is EXCLUDED from learning (add to `learn()`'s bias-skip).
- **SCENT is EVOLVE-ONLY:** do NOT add eligibility for the scent W2 column (col 4) in the hidden→output elig loop. (The loop stays at o+0/o+1/o+2/o+3 — turn/thrust/eatGate/biteGate.) The scent column evolves but does not learn — mirroring the glow head.
- **Commands:** focused `npx vitest run <file>`; full `NODE_OPTIONS=--expose-gc npx vitest run` (~300s); `npx tsc --noEmit`; `npx eslint src`. Commit hook BLOCKS `Co-Authored-By` — omit it.

---

### Task 1: Genome layout + `brainGatedScent` config flag

Grow the genome for the scent output (drawn but unread → inert, deterministic) + add the flag.

**Files:**
- Modify: `src/core/genome.ts` — `Brain` enum (`SCENT_GATE_BIAS` after `BITE_GATE_BIAS: 53`), `NAMED_BRAIN_GENES`, `HIDDEN_OUTPUTS`, `FOUNDER_BRAIN` (insert the gate-open bias).
- Modify: `src/core/config.ts` — `Config` interface + `defaultConfig`.
- Test: `src/core/genome.test.ts` — the layout-lock describe block.

**Interfaces:**
- Produces: `Brain.SCENT_GATE_BIAS=54`; `NAMED_BRAIN_GENES=55`, `HIDDEN_OUTPUTS=5`, `HIDDEN_W2=151`, `GLOW_BIAS=171`, `BRAIN_GENES=180`; `cfg.brainGatedScent` (default true).

- [ ] **Step 1: Update the layout-lock test (failing)**

In `src/core/genome.test.ts`, in the `unified brain layout` describe block, update the assertions:

```ts
  it('places the 16-synapse scent block at 20..35 and the interoceptive tail after readiness', () => {
    expect(Brain.PHERO_C0_LAT_TURN).toBe(20);
    expect(Brain.PHERO_C3_FWD_THRUST).toBe(35);
    expect(Brain.EAT_GATE_BIAS).toBe(36);
    expect(Brain.READINESS_THRUST).toBe(44);
    expect(Brain.FERT_THRUST).toBe(52);
    expect(Brain.BITE_GATE_BIAS).toBe(53);
    expect(Brain.SCENT_GATE_BIAS).toBe(54); // A2b: brain-gated scent-deposit output bias
    expect(NAMED_BRAIN_GENES).toBe(55);
  });
  it('grows the hidden layer to 24 inputs and 5 outputs (turn/thrust/eatGate/biteGate/scentGate)', () => {
    expect(SCENT_CHANNELS).toBe(4);
    expect(HIDDEN_INPUTS).toBe(24);
    expect(HIDDEN_OUTPUTS).toBe(5);
    expect(HiddenInput.BIAS).toBe(23);
  });
  it('derives downstream offsets from the unified sizes', () => {
    expect(HIDDEN_W1).toBe(NAMED_BRAIN_GENES); // 55
    expect(HIDDEN_W2).toBe(HIDDEN_W1 + HIDDEN_INPUTS * HIDDEN_UNITS); // 151
    expect(GLOW_BIAS).toBe(HIDDEN_W2 + HIDDEN_UNITS * HIDDEN_OUTPUTS); // 171
    expect(BRAIN_GENES).toBe(180);
  });
```

- [ ] **Step 2: Run, verify it fails**

Run: `npx vitest run src/core/genome.test.ts -t "unified brain layout"`
Expected: FAIL (`Brain.SCENT_GATE_BIAS` undefined; `HIDDEN_OUTPUTS` is 4).

- [ ] **Step 3: Add the `Brain` slot + bump `NAMED_BRAIN_GENES`**

In `src/core/genome.ts`, after `BITE_GATE_BIAS: 53,` in the `Brain` object add:

```ts
  // A2b brain-gated scent deposit: a sigmoid scentGate output (hidden-layer column 4) read by depositScent()
  // to scale the deposit amount — broadcast vs go silent. This is the named BIAS gene; the per-unit weights
  // live in the W2 block at output column 4. Seeded gate-OPEN; EVOLVE-ONLY (no within-life reward → no elig).
  SCENT_GATE_BIAS: 54,
```

Change `export const NAMED_BRAIN_GENES = 54;` to `= 55;`.

- [ ] **Step 4: Bump `HIDDEN_OUTPUTS`**

In `src/core/genome.ts`, change `export const HIDDEN_OUTPUTS = 4; // turn=0, thrust=1, eatGate=2, biteGate=3 (A2a)` to:

```ts
export const HIDDEN_OUTPUTS = 5; // turn=0, thrust=1, eatGate=2, biteGate=3 (A2a), scentGate=4 (A2b)
```

- [ ] **Step 5: Seed `FOUNDER_BRAIN` gate-open**

In `src/core/genome.ts`, in `FOUNDER_BRAIN`, after the A2a bite line `4,` (BITE_GATE_BIAS) add:

```ts
  // A2b SCENT_GATE_BIAS (54): seeded gate-OPEN (sigmoid(4)≈0.98 → broadcast by default; evolution refines).
  4,
```

(The hidden block auto-grows by HIDDEN_UNITS=4 for the new W2 column.)

- [ ] **Step 6: Add the `brainGatedScent` config flag**

In `src/core/config.ts`, in the `Config` interface near `brainGatedBiting`, add:

```ts
  /** A2b brain-gated scent deposit: when on, depositScent()'s amount is scaled by the creature's scentGate
   *  (0..1) sigmoid output, so signalling is a DECISION (broadcast vs go silent). Evolve-only. Seeded gate-open
   *  → founding deposit unchanged. Off → unconditional passive deposit (the reflex), ×1 byte-identical. */
  brainGatedScent: boolean;
```

In `defaultConfig`, near `brainGatedBiting: true,`, add:

```ts
    brainGatedScent: true, // ON by default: scent deposit is a brain decision (seeded broadcast-open; evolve-only)
```

- [ ] **Step 7: Run the layout test + full suite**

Run: `npx vitest run src/core/genome.test.ts -t "unified brain layout"` → PASS.
Run: `npx tsc --noEmit` → clean. `npx eslint src/core/genome.ts src/core/config.ts` → clean.
Run: `NODE_OPTIONS=--expose-gc npx vitest run` → ALL green. (The bias + W2 column are drawn but unread → deterministic. The existing inspector/biteGate parity tests stay green — both steer and computeBrainState derive the W2 stride from HIDDEN_OUTPUTS=5, so cols 0-3 relocate identically.) If `config.test.ts` snapshots keys, add `brainGatedScent`.

- [ ] **Step 8: Commit**

```bash
git add src/core/genome.ts src/core/config.ts src/core/genome.test.ts
git commit -m "feat(brain): A2b layout — SCENT_GATE_BIAS + HIDDEN_OUTPUTS 4→5 + brainGatedScent (BRAIN_GENES 175→180)"
```

---

### Task 2: steer() computes scentGate (EVOLVE-ONLY) + inspector parity

Compute the scent decision each tick into a new buffer (NO eligibility — evolve-only) and mirror it in the inspector. `depositScent()` does NOT read it yet (Task 3), so the world stays byte-identical to Task 1.

**Files:**
- Modify: `src/core/store.ts` — add `scentGate` Float64Array (declaration + constructor alloc; default 1 on `alloc()`).
- Modify: `src/core/brain.ts` — `steer()` computes scentGate (in the hidden block, after biteGate); `learn()` excludes `SCENT_GATE_BIAS`. NO eligibility for the scent column.
- Modify: `src/app/observability/brain-view.ts` — `computeBrainState` computes scentGate + adds it to `BrainState`; render it as a 6th output node.
- Test: `src/app/observability/brain-view.test.ts` — a non-saturated scentGate parity test (exercises the hidden→scent column 4).

**Interfaces:**
- Consumes: `Brain.SCENT_GATE_BIAS`, `HIDDEN_OUTPUTS`, `cfg.brainGatedScent`.
- Produces: `store.scentGate[i]` ∈ 0..1; `BrainState.scentGate`.

- [ ] **Step 1: Write the failing scentGate parity test**

In `src/app/observability/brain-view.test.ts`, add (mirror the A2a biteGate parity test — exercise the hidden→scent column with a nonzero hidden activation):

```ts
  it('computes a scentGate output that matches a real steer() run, exercising the hidden→scent column (A2b)', () => {
    const c = defaultConfig({ brainGatedScent: true, hiddenLayer: true });
    const s = new OrganismStore(8);
    const i = s.alloc();
    s.heading[i] = 0;
    const base = i * SCALAR_GENE_COUNT;
    for (let g = 0; g < SCALAR_GENE_COUNT; g++)
      s.scalarGenes[base + g] = c[SCALAR_GENE_SPECS[g]!.centerKey];
    const b = i * BRAIN_GENES;
    s.brain[b + Brain.SCENT_GATE_BIAS] = 0.3;
    s.brain[b + HIDDEN_W1 + HiddenInput.FOOD_FWD * HIDDEN_UNITS + 0] = 0.8; // food-fwd → hidden unit 0
    s.brain[b + HIDDEN_W2 + 0 * HIDDEN_OUTPUTS + 4] = 0.6; // hidden unit 0 → scentGate column (4)
    s.senseX[i] = 0.5; // fwd 0.5 → hAct[0] = tanh(0.4) ≈ 0.38
    s.resetLearned(i);
    s.rebuildLive();
    const st = computeBrainState(s, c, i);
    steer(s, false, c.eligLambda, c.motorSquash, c);
    expect(st.scentGate).toBeCloseTo(s.scentGate[i]!, 10);
    expect(st.scentGate).toBeGreaterThan(0.5);
    expect(st.scentGate).toBeLessThan(0.7); // non-saturated; a wrong W2 column (e.g. 3) changes the value
  });
```

- [ ] **Step 2: Run, verify it fails**

Run: `npx vitest run src/app/observability/brain-view.test.ts -t scentGate`
Expected: FAIL (`s.scentGate`/`st.scentGate` undefined).

- [ ] **Step 3: Add the `scentGate` store buffer**

In `src/core/store.ts`, after the `biteGate` buffer declaration add:

```ts
  // Transient per-tick SCENT-GATE actuator (0..1): the brain's broadcast decision (A2b). Recomputed each tick
  // in steer(); read by depositScent() to scale the deposit amount. Not hashed (derived). Defaults to 1
  // (broadcast-open) on alloc for the edge-case pre-steer read.
  readonly scentGate: Float64Array;
```

In the constructor, after `this.biteGate = new Float64Array(capacity);`, add `this.scentGate = new Float64Array(capacity);`. In `alloc()`, after `this.biteGate[slot] = 1;`, add `this.scentGate[slot] = 1;`.

- [ ] **Step 4: Compute scentGate in steer() (evolve-only)**

In `src/core/brain.ts`: add `const brainGatedScent = cfg.brainGatedScent;`; add `scentGate` to the `store` destructure; declare `let scentGateRaw = 0;` near `biteGateRaw`. After the biteGate block, add:

```ts
    // Brain-gated scent (A2b): a sigmoid broadcast decision from the hidden layer (output column 4) + a bias.
    // depositScent() scales the deposit by this. EVOLVE-ONLY (no eligibility below — no within-life signal).
    if (brainGatedScent) {
      scentGateRaw = learnedBrain[b + Brain.SCENT_GATE_BIAS]!;
      if (hiddenLayer) {
        const w2 = b + HIDDEN_W2;
        for (let j = 0; j < HIDDEN_UNITS; j++)
          scentGateRaw += hAct[j]! * learnedBrain[w2 + j * HIDDEN_OUTPUTS + 4]!;
      }
      scentGate[i] = 1 / (1 + Math.exp(-scentGateRaw));
    }
```

Do NOT add `elig[o + 4]` to the hidden→output eligibility loop (scent is evolve-only). In `learn()`, extend the bias-skip guard with `|| g === Brain.SCENT_GATE_BIAS`.

- [ ] **Step 5: Mirror scentGate in computeBrainState + render it**

In `src/app/observability/brain-view.ts`: add `scentGate: number` to `BrainState`. In `computeBrainState`, after the biteGate block, add (mirror steer):

```ts
  let scentGate = 0;
  if (cfg.brainGatedScent) {
    let scentGateRaw = lb[b + Brain.SCENT_GATE_BIAS]!;
    if (cfg.hiddenLayer) {
      for (let j = 0; j < HIDDEN_UNITS; j++)
        scentGateRaw += hidden[j]! * lb[b + HIDDEN_W2 + j * HIDDEN_OUTPUTS + 4]!;
    }
    scentGate = 1 / (1 + Math.exp(-scentGateRaw));
  }
```

Add `scentGate` to the returned `BrainState`. In `render()`, add a 6th output node `drawOut(5, 'scent', st.scentGate)` and grow the `outY` denominator (now 6 outputs: turn/thrust/eat/glow/bite/scent — bump the divisor). Route the W2 column-4 edges to the scent node (mirror how A2a routed col-3 to the bite node).

- [ ] **Step 6: Run the parity test + full suite**

Run: `npx vitest run src/app/observability/brain-view.test.ts` → all PASS (new scentGate test + existing parity/biteGate/hunger/drift tests).
Run: `npx vitest run src/core/world.test.ts` → green (scentGate computed but UNREAD by depositScent → world byte-identical to Task 1; scentGate not hashed).
Run: `npx tsc --noEmit` + `npx eslint` on changed files → clean. Then the FULL suite → green.

- [ ] **Step 7: Commit**

```bash
git add src/core/store.ts src/core/brain.ts src/app/observability/brain-view.ts src/app/observability/brain-view.test.ts
git commit -m "feat(brain): A2b — steer computes scentGate (evolve-only) + inspector parity (unread yet)"
```

---

### Task 3: `depositScent()` gates the deposit on scentGate

**Files:**
- Modify: `src/core/economy.ts` — `depositScent()` (read `store.scentGate`, scale the amount behind `cfg.brainGatedScent`).
- Test: `src/core/economy.test.ts` (or `scent-field.test.ts` — match where depositScent is tested) — a unit test (scentGate 0 → no deposit; 1 → deposit).
- Test: `src/core/world.test.ts` — a brainGatedScent determinism test.

**Interfaces:**
- Consumes: `store.scentGate[i]` (Task 2), `cfg.brainGatedScent`.
- Produces: `depositScent` deposits `gene·strength·scentGate[i]` when `brainGatedScent` (×1 when off).

- [ ] **Step 1: Write the failing unit test**

In the test file where `depositScent` is covered (check `economy.test.ts` / `scent-field.test.ts` for an existing depositScent test + how it builds a `ScentField` — reuse that scaffolding). The crisp assertion: a creature with `PHERO_DEPOSIT` > 0; `scentGate=0` → the field receives NO deposit (its sampled value at the body stays 0); `scentGate=1` → the field receives a deposit (> 0). Use the `ScentField`'s existing sample/total accessor the other scent tests use.

- [ ] **Step 2: Run, verify it fails**

Run the focused test → FAIL (deposit happens regardless of the gate — not read yet).

- [ ] **Step 3: Gate the deposit in depositScent()**

In `src/core/economy.ts` `depositScent()`: add `const { scentGate } = store;` to the destructure and `const brainGatedScent = cfg.brainGatedScent;`. Change:

```ts
    const amount = scalarGenes[sg + ScalarGene.PHERO_DEPOSIT]! * strength;
    if (amount <= 0) continue;
```

to:

```ts
    let amount = scalarGenes[sg + ScalarGene.PHERO_DEPOSIT]! * strength;
    if (brainGatedScent) amount *= scentGate[i]!; // brain decides whether to broadcast (×1 when off)
    if (amount <= 0) continue;
```

- [ ] **Step 4: Write the determinism test**

In `src/core/world.test.ts` add:

```ts
  it('brainGatedScent ON is deterministic (A2b — same config+seed → identical hash run-to-run)', () => {
    const a = new World(defaultConfig({ seed: 4, brainGatedScent: true }));
    const b = new World(defaultConfig({ seed: 4, brainGatedScent: true }));
    for (let t = 0; t < 300; t++) { a.step(); b.step(); }
    expect(a.stateHash()).toBe(b.stateHash());
  });
```

- [ ] **Step 5: Run the tests + full suite**

Run the focused unit test → PASS. Run `npx vitest run src/core/world.test.ts -t brainGatedScent` → PASS.
Run `npx tsc --noEmit` + `npx eslint` on changed files → clean. Then the FULL suite → green.

- [ ] **Step 6: Commit**

```bash
git add src/core/economy.ts <the test file> src/core/world.test.ts
git commit -m "feat(economy): A2b — depositScent() gates the deposit on scentGate (broadcast is a decision)"
```

---

### Task 4: Liveness + honest measurement

**Files:**
- Modify: `src/headless/intero-probe.ts` (extend) OR create `src/headless/scent-gate-probe.ts`.

- [ ] **Step 1: Liveness**

Run: `NODE_OPTIONS=--expose-gc npx tsx src/headless/liveness-probe.ts 4000 3` → `LIVENESS: PASS`. Record pop + FORAGE_PREF/DIET.

- [ ] **Step 2: Add a scentGate readout**

Extend a probe to report, over the live population (bodySense/scent on, demo config), the **mean + spread of `store.scentGate`** after the run. Since scent operates on the LIVE grazer population (unlike bite), this is more likely to show a modulated gate.

- [ ] **Step 3: Run + interpret honestly**

Run the probe. **Interpret honestly:** is the scent gate MODULATED (spread across the population, some creatures evolving toward silence) or stuck ~open (≈0.98, no evolution)? Report the mean + range. If stuck open, say it's wired+live but not yet recruited (evolution hasn't found a reason to go silent — scent has no direct cost). If modulated, quote the spread.

- [ ] **Step 4: Commit + record**

```bash
git add <the probe file>
git commit -m "test(brain): A2b scent-gate probe — measure scentGate modulation honestly"
```

Record the numbers + verdict in bead `life-sim-0v1r` and the roadmap before merging.

---

## Verification (before merge to main)

- [ ] `NODE_OPTIONS=--expose-gc npx vitest run` → full suite green; `npx tsc --noEmit` + `npx eslint src` clean.
- [ ] `liveness-probe.ts 4000 3` → PASS. scentGate readout recorded with an honest verdict.
- [ ] `git log -1 main` re-checked; FF/merge A2b; update roadmap; `bd close life-sim-0v1r`; `bd sync --flush-only`.

## Self-review (coverage vs spec)

- Spec "SCENT_GATE = sigmoid(bias + hidden·W2col4), seeded open, behind brainGatedScent, ×1 byte-identical OFF" → Tasks 1-3. ✓
- Spec "SCENT evolve-only (no eligibility)" → Task 2 Step 4 (no `elig[o+4]`). ✓
- Spec "multiply deposit at depositScent :151" → Task 3 Step 3. ✓
- Spec "steer-output + inspector parity in one task" → Task 2. ✓
- Spec "measure honestly — is the gate modulated or stuck open" → Task 4. ✓
- Spec "HIDDEN_OUTPUTS 4→5, BRAIN_GENES 175→180, scentGate=col 4" → Task 1. ✓
